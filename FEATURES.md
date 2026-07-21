# Messenger frontend — feature & verification checklist

Legend: ✅ done & browser-verified (Playwright) · 🟡 implemented, not/partly verified · ❌ not implemented

## Auth / session
- ✅ Same-origin Ory cookie auth (edge injects X-User-*)
- ✅ Startup session check → redirect to /login (RequireAuth `toSession`)
- 🟡 Login via Kratos self-service flow (LoginPage) — session reuse verified; explicit login flow not driven
- 🟡 Registration (RegistrationPage) — not verified
- ✅ Logout — session invalidated via background fetch to Kratos logout_url (redirect:manual), then router → our /login; NO visible bounce to Kratos, no Kratos config. Verified: lands on /messenger-ui/login + session dead on reload (2026-07-10)
- ✅ Name coercion for Kratos traits.name object ({first,last}→string)

## Connection / transport
- ✅ WS connect through edge (`/messenger/ws`)
- ✅ ping/pong keepalive (server auto-ping 10s + browser auto-pong; WS alive >45s)
- 🟡 Reconnect with backoff (wsMiddleware) — reconnect-on-nav seen; long-drop retry not driven
- 🟡 History read-through on (re)connect (reloadChatHistory) — partial

## Chat list / directory
- ✅ Chat list from `GET /api/chats` (Conversation[])
- ✅ Participant names from IDS directory (all users) + presence fallback
- ✅ Online/offline status (presence): green/gray dot in list + "en línea/desconectado" + "печатает…" in header (verified: join→en línea, leave→desconectado)
- ✅ New chat: search IDS (`/ids/admin/users` + X-Admin-Key) + create (admin) + revive + open
- ✅ Revive a soft-deleted chat on re-create (backend + surfaced)
- 🟡 Soft-delete chat for me (DELETE /api/chats/{id}) — wired, not verified

## Messaging
- ✅ Send CHAT_IN via outbox queue
- ✅ Optimistic own-message echo (shows immediately, x1)
- ✅ Receive CHAT_OUT + reply CHAT_ACK (delivered)
- ✅ De-dup by server messageId/ULID (x1, no double)
- ✅ CHAT_ACK is a valid full frame (recipientId/conversationId/messageId/ts) — was silently rejected →
  fixed the redelivery loop / watermark stall (stability)
- 🟡 Outbox retry on reconnect (flushOutbox on connect) — mechanism present, not stress-tested
- ✅ Ordering by ULID — after CHAT_ACK the chat history is refetched (optimistic client-id row → server row), giving server ULID order
- ✅ Read receipts (✓✓) — server-ULID watermark per side (backend contract): READ_IN `correlationId` =
  largest rendered server ULID; ✓✓ from `peerLastReadId` on `GET /messages` (`myMsg.serverMessageId <=
  peerLastReadId`, ULID compare); own serverMessageId ← `CHAT_ACK`; live via `READ_OUT.correlationId`.
  Null/legacy-non-ULID watermark ignored (no false ✓✓); soft/self-healing. Existing convs warm-started
  by backfilling watermarks from delivery facts.
- ❌ Delivered status surfaced (SENT→DELIVERED) — backend sends no delivered-to-sender event (would need backend)
- ✅ Typing indicator (TYPING_IN throttled → TYPING_OUT → "печатает…", auto-clear ~4s) — verified
- ✅ Delete single message (🗑 on own bubble; works after ack-reconcile gives server id; 409 if frozen) — verified
- ✅ Block / unblock peer (🚫/🔓 in header, state from getChats.blocked) — verified
- ✅ Attachments (MinIO two-phase presigned upload/download) — verified 2-window 2026-07-10; needed edge fix: nginx `/messenger-attachments` (no trailing slash!) → MinIO preserving Host + `MINIO_ENDPOINT=https://hormi.isolutions.io`
- ✅ Inline image thumbnails — image/* attachments render as `<img>` (fresh presigned GET per render, TTL 300s), click opens full; non-images stay as 📎 download. Verified 2-window 2026-07-10
- ❌ System notices (SYSTEM_OUT + SYSTEM_ACK)
- ❌ Service/backpressure notices (SERVICE_OUT) → toast

## Presence
- ✅ Presence directory from PRESENT_* frames (names/online)

## Video / WebRTC (Strategy S signaling over WS)
- ✅ Start call → SIGNAL_IN offer delivered (getUserMedia unblocked via Permissions-Policy)
- ✅ Incoming-call modal with caller NAME (from IDS)
- ✅ ICE candidate exchange (offer/answer/ice as kind=event in SIGNAL_IN/OUT)
- ✅ Reject / cancel → caller returns to idle (call:end propagates)
- 🟡 Accept → answer → media connection — signaling verified; now has TURN relay; real 2-network media pending user test
- ✅ TURN server: coturn in docker on host (91.99.6.25:3478, user/pass, external-ip), verified externally (relay candidates gathered). Frontend points at host IP (not CF). NOTE: cloud firewall must keep 3478 udp/tcp + 49160-49200 udp open.
- 🟡 Hang up — wired, not driven

## Admin (provisioning)
- ✅ Create chat between users (admin, X-Admin-Key) via /add
- 🟡 Admin console (GET /api/admin/chats) — backend ready (X-Admin-Key); no UI

---
Test harness: Playwright scripts in scratchpad/pw (two Kratos sessions Tanya+Luda, fake media).
Backend DEBUG log currently ON for diagnosis (turn off after).
