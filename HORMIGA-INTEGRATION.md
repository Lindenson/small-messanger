# Adapting this frontend to the Hormigas Messenger backend

> Goal: point **only this frontend** at the existing, unmodified `HormigaMessanger`
> backend (Quarkus, WS `/ws` + REST `/api/chats/*`). **The backend is not edited.**
> All work is in `front/`. Branch: `feat/hormiga-messenger-adapter`.

## Hard constraints from the backend (facts, read-only)

- **Auth:** the service trusts Ory edge headers `X-User-Id` / `X-User` / `X-Role` /
  `X-User-Email` and does **not** read cookies or validate JWTs. → the browser must
  reach it **through an edge** (Ory Oathkeeper, or a dev proxy) that turns the Kratos
  session cookie into those headers. This is infra in front of the messenger, **not**
  a backend change. WS handshake needs the same headers → the proxy must inject them
  on the `/ws` upgrade too.
- **Chat is WS-first:** send `CHAT_IN` over WS; delivery is confirmed by a server
  `CHAT_ACK` (not an HTTP 200). History is read over REST on every (re)connect.
- **Client owns:** dedup by server `messageId` (ULID), re-sort by it, prompt `CHAT_ACK`
  on every `CHAT_OUT`, single socket per user, reply to pings.
- **Identity of a chat = `conversationId`** (a `Conversation.id`), **not** the
  counterpart's user id. `GET /api/chats` returns `Conversation[]`
  `{id, clientId, masterId, metadata, clientBlocked, masterBlocked, ...}`.

## Wire contract (backend, for reference)

WS frame = one JSON `Message`:
`{ type, senderId, recipientId, conversationId, messageId, correlationId, ackId,
   payload:{kind,body}, meta:{}, senderTimestamp, senderTimezone, serverTimestamp,
   id, sequenceNumber }`

- Inbound (client→server): `CHAT_IN`, `SIGNAL_IN`, `TYPING_IN`, `CHAT_ACK`, `READ_IN`, `SYSTEM_ACK`.
- Outbound (server→client): `CHAT_OUT`, `CHAT_ACK`, `SIGNAL_OUT`, `TYPING_OUT`, `READ_OUT`,
  `PRESENT_INIT|JOIN|LEAVE`, `SYSTEM_OUT`, `SERVICE_OUT`.
- `messageId`: client sends its own; **server reassigns a ULID** and returns the client's
  as `correlationId`. `ackId` = outbox row `id` to ACK (advances GC watermark).

REST: `GET /api/chats`, `GET /api/chats/{id}/messages?since=&limit=`,
`DELETE /api/chats/{id}`, `POST /api/chats/{id}/read`, `POST /api/chats/{id}/block`.

---

## Step-by-step edits (frontend only)

### Phase 0 — infra (no code)
- **P0.1** Dev edge: `docker-compose` with Kratos + Oathkeeper (strip-then-set
  `X-User-*` from the Kratos session) routing `/ws` + `/api/*` → messenger. Reuse the
  `kratos/config/` already in this repo. Frontend talks to the edge origin only.

### Phase 1 — transport re-target (deterministic, self-contained)
- **P1.1 `front/src/shared/config/ws.ts`** — remove the app-level `PING_MS` ping
  (backend rejects unknown `ping`; the browser auto-answers protocol pings). Keep
  reconnect backoff. Backend idle timeout is 35 s.
- **P1.2 `front/src/infrastructure/hooks/useWebSocketConnection.ts`** — WS URL → `/ws`
  (host-relative, through the edge); drop `?clientId=` (identity is header-derived).
- **P1.3 `front/src/infrastructure/middleware/wsMiddleware.ts`** — remove the ping
  interval; add a **boundary translator**: on `ws/send`, if the frame is a `call:*`
  frame, wrap it into `SIGNAL_IN`; on incoming, unwrap `SIGNAL_OUT` back to a `call:*`
  frame before dispatch (keeps the whole `features/call/*` untouched).
- **P1.4 `front/src/infrastructure/types.ts`** — replace `IncomingWSMessage`
  (`{type:"message"}`) with the backend outbound union
  (`CHAT_OUT|CHAT_ACK|READ_OUT|TYPING_OUT|PRESENT_*|SIGNAL_OUT|SYSTEM_OUT|SERVICE_OUT`).
- **P1.5 new `front/src/features/chat/model/schema/wireMessage.schema.ts`** — zod schema
  for the backend `Message` frame + builders for `CHAT_IN` / `CHAT_ACK` / `READ_IN`.
- **P1.6 `front/src/features/chat/model/schema/domainChatMessage.schema.ts`** — align the
  view model: `id` = server `messageId` (ULID), `chatId` = `conversationId`,
  `from` = `senderId`, `to` = `recipientId`, `text` = `payload.body`,
  `createdAt` = `serverTimestamp`.
- **P1.7 `front/src/features/chat/model/mapper.ts`** — `wireMessage → ChatMessage`;
  `text → CHAT_IN` builder (client uuid `messageId`, `payload{kind:"text",body}`,
  `senderTimestamp`+IANA tz, `meta.orderId` optional).
- **P1.8 `front/src/features/chat/rest/chatApi.ts`** — repoint endpoints:
  - `getChats`: `GET /api/chats` → `Conversation[]`, map each to
    `{conversationId:id, counterpartId: clientId===myId?masterId:clientId, metadata}`.
  - `getChatHistory`: `GET /api/chats/{chatId}/messages?since=&limit=` → `Message[]` → map.
  - `deleteChatHistory`: `DELETE /api/chats/{chatId}` (was `/chat/{myId}/{chatId}`).
  - add `markRead`: `POST /api/chats/{chatId}/read`.

### Phase 2 — send/receive semantics (needs the stack up to validate)
- **P2.1 send path** (`outboxSlice`, `sendOutboxThunk`, `chatMessages.service`): send
  `CHAT_IN` over **WS** (`ws/send`), not `POST /api/messages`. Mark `sending` on send;
  mark `sent` (remove from outbox) only when a `CHAT_ACK` with `correlationId` = the
  client `messageId` arrives.
- **P2.2 receive path** (`useChat`, `chatMessages.service.incomingMessage`): on `CHAT_OUT`
  → dedup by server `messageId`, add to history, **send `CHAT_ACK`**
  `{correlationId: messageId, ackId: id}`. On `CHAT_ACK` → outbox `markSent`. On
  `READ_OUT` → mark read. On `PRESENT_*` → presence (optional in v1).
- **P2.3 conversation identity** — reconcile `contacts` with `conversationId`
  (chat list comes from `GET /api/chats`, not a separate contacts service). Decide with
  the running backend: derive display/counterpart from `Conversation` participants.

### Phase 3 — drive & verify
- Two Kratos identities (MASTER + CLIENT), open chat, send/recv with ACK, disconnect/
  reconnect (history read-through, no loss/dup), typing, WebRTC via `SIGNAL_*`, block/delete.

---

## Target environment (staging)

- Origin: `https://hormi.isolutions.io` (Cloudflare + Ory edge).
- Messenger REST: `${origin}/messenger/api/**`; WS: `${origin}/messenger/ws`; Kratos: `/.ory/kratos/public`.
- The app is served from the **same origin** so the existing Ory session cookie applies
  (no separate login). Config: `VITE_MESSENGER_BASE=/messenger`, `VITE_KRATOS_URL=/.ory/kratos/public`.

## Deploy (front4mess)

Separate deployable served under Node on the backend host:

```bash
npm ci && npm run build          # → front/dist
# ship front/dist + front/server.mjs to /opt/front4mess
PORT=5555 node server.mjs        # zero-dep static + SPA fallback, listens on :5555
```

The edge must route `/` (app) to `:5555` and keep `/messenger/*` + `/.ory/*` on the same origin.

## Status

- [x] Branch `feat/hormiga-messenger-adapter`
- [x] **Phase 1 — transport re-target** (compiles): signaling bridge `call:*`↔`SIGNAL_*`,
      WS via bridge, no app-ping, host-relative `/messenger/ws`.
- [x] **Config + deploy**: `/messenger` base for REST+WS, Kratos URL, `server.mjs` (:5555), `.env.example`.
- [x] **Phase 2 — chat send/receive** (done; validate on staging):
      chat send moved REST→WS `CHAT_IN`; `CHAT_ACK` (correlationId) drops the outbox row;
      `CHAT_OUT`→ dedup by ULID + reply `CHAT_ACK`; history read-through on (re)connect;
      chat list from `GET /api/chats` (`Conversation[]`), selection keyed by `conversationId`.
      Files: `wireMessage.schema.ts` (new), `mapper.ts`, `chat/model/types.ts`,
      `infrastructure/types.ts`, `chatApi.ts`, `useContacts.ts`, `sendOutboxThunk.ts`,
      `chatMessages.service.ts`, `useChat.ts`, `AddUser.tsx` (inert).
      *Known limits:* (a) client cannot create a chat (`POST /api/chats` = ADMIN/SERVICE) →
      the "+ add contact" screen is inert; chats appear once the platform provisions them.
      (b) list labels use `orderId`/counterpart id (no user-directory endpoint on the backend).
      (c) `ws.lastIncoming` holds only the latest frame — rapid bursts rely on the reconnect
      history read-through for durability (dedup by ULID covers duplicates).
- [ ] Phase 3 — drive & verify on staging (video + chat).

**Deployable now:** WebRTC video + chat against the live backend. Build & ship to
`/opt/front4mess`, run `PORT=5555 node server.mjs`, open from the window with the Ory session.
Confirm the edge WS route is `/messenger/ws` (only REST `/messenger/api` is proven by e2e).
