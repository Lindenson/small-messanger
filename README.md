
# 💬📹 Real-Time Chat & Video Call Application

A real-time messaging and video calling application built with **React**, **Redux Toolkit**, **WebSocket**, and **WebRTC**. The project demonstrates a clean separation of concerns between UI, application state, and low-level real-time communication logic.

---

## 🐜 HormigaMessanger integration (branch `feat/hormiga-messenger-adapter`)

This branch adapts the app into a **browser test harness for [HormigaMessanger]** (the Quarkus
messenger backend), running behind the **Ory edge** on staging `https://hormi.isolutions.io/messenger-ui/`.
The **backend is read-only** — every change here is frontend + ops. It reuses the existing Ory Kratos
session from the same browser window (same-origin cookie), so there is no separate login.

**What was done (all browser-verified with Playwright, two Kratos sessions):**

- **Transport rewritten to the HormigaMessanger WS CLIENT-CONTRACT** — `CHAT_IN`/`CHAT_OUT` with
  full-frame `CHAT_ACK` / `READ_IN` / `TYPING_IN`, ULID de-duplication, optimistic own-message echo,
  a durable outbox with reconnect flush, and REST history read-through on (re)connect.
- **WebRTC signaling bridged over the WS `SIGNAL_IN`/`SIGNAL_OUT`** frames (`infrastructure/ws/frameBridge.ts`)
  so the existing `features/call/*` state machine is untouched.
- **Chat list** from `GET /api/chats`; participant **names from the IDS directory** with a presence fallback.
- **Messaging features:** read receipts (✓/✓✓), typing indicator, presence online/offline, block/unblock,
  delete message, **attachments** (MinIO two-phase presigned upload/download) with **inline image thumbnails**.
- **Video calls:** offer/answer/ICE signaling + a coturn **TURN** server; incoming-call modal with caller name.
- **Auth:** startup session check → `/login`; **logout** kills the Kratos session via a background request
  and routes to our own `/login` (no visible bounce to Kratos, no Kratos config change).

**Run / deploy:**

- Config is build-time Vite env — see [`front/.env.example`](front/.env.example) (all paths are host-relative
  to the Ory edge origin).
- Build + serve locally: `cd front && npx vite build --base=/messenger-ui/` then `PORT=5555 node server.mjs`.
- One-shot staging deploy (build → ship → atomic swap → edge health check): `DEPLOY_HOST=user@host ./deploy.sh`.

**Companion docs:**

- [`FEATURES.md`](FEATURES.md) — per-feature status & verification checklist.
- [`HORMIGA-INTEGRATION.md`](HORMIGA-INTEGRATION.md) — integration plan & frame-mapping.
- [`DEPLOYMENT-CHANGES.md`](DEPLOYMENT-CHANGES.md) — staging deploy-environment deltas (handoff for the
  hormiga-deploy repo: nginx routes, container env, coturn, front4mess, MinIO).

> The original demo description below still documents the base UI/architecture (call state machine, layering).

---

## ✨ Features

- 💬 **Real-time chat**: one-to-one messaging, unread message tracking, chat history loading & deletion  
- 📹 **Video & audio calls (WebRTC)**: incoming/outgoing calls, call accept/reject flow, ICE candidate buffering, TURN/STUN support  
- 🔁 **Robust state management**: Redux-based call state machine, deterministic call lifecycle  
- 🧠 **Safe WebRTC lifecycle**: race-condition protection, idempotent cleanup, defensive signaling handling

---

## 🏗️ Architecture Overview

The project is split into **three independent layers**:

UI (React Components)
↓
Application State (Redux)
↓
Transport / Media Layer (WebRTC + WebSocket)

yaml
Copy code

Each layer has a single responsibility and does **not leak concerns** into the others.

---

## 🧩 Core Technologies

- **React** — UI rendering & hooks  
- **Redux Toolkit** — global state & call state machine  
- **WebSocket** — signaling & chat transport  
- **WebRTC** — peer-to-peer media (video/audio)  
- **STUN / TURN** — NAT traversal

---

## 🔁 Call State Machine (Redux)

Call flow is modeled as a **finite state machine** inside Redux.

### Call States

```ts
// idle       // no active call
// ringing    // incoming call, waiting for user action
// calling    // outgoing call initiated
// in_call    // WebRTC connection established

idle
 ├── incomingOffer → ringing
 └── outgoingCall → calling

ringing
 ├── acceptCall → in_call
 └── reject / remoteEnd → idle

calling
 ├── incomingAnswer → in_call
 └── localEnd / remoteEnd → idle

in_call
 └── localEnd / remoteEnd / disconnect → idle

Redux is the single source of truth for: UI rendering, button availability, modal visibility, call permissions.
```

## 🔌 WebRTC Layer (useWebRTC)
The useWebRTC hook is a low-level transport layer responsible only for: peer connection lifecycle, media stream handling, SDP (offer/answer), ICE candidate buffering, WebRTC connection state.

Important Design Rules
✅ Does NOT read Redux call status
✅ Does NOT control UI
✅ Does NOT trust the UI or signaling layer

It uses internal guards based on RTCPeerConnection state, signalingState, internal refs (pcRef, remotePeerIdRef). This guarantees no double calls, no duplicate offers, safe reconnection, and idempotent cleanup.

📡 WebSocket Signaling
WebSocket is used for chat messages and call signaling events (call:offer, call:answer, call:ice, call:end). All incoming signaling messages are dispatched to Redux (for UI & state) and forwarded to useWebRTC only when valid.

## 🎥 Media Streams
Reactive streams are managed via React state:

```ts
const [localStream, setLocalStream] = useState(null);
const [remoteStream, setRemoteStream] = useState(null);
Streams are React state, so the UI automatically updates when the camera/microphone is ready or the remote peer connects.
```

## 🧠 Defensive Programming
The project handles edge cases: double incoming offers, offer while already in a call, late ICE candidates, answer after hang-up, network disconnects, peer crashes. Unsafe conditions are ignored or auto-rejected.

## 🖥️ UI Components
ChatList — contacts, unread counters, search

ChatWindow — messages, send/delete, start call

VideoCall — incoming call modal, video streams, hang up

ConfirmModal — reusable confirmation UI

## 🔐 TURN / STUN Configuration

```ts
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:<HOST>:3478", username: "user", credential: "pass" }
  ]
};
```

## 🧪 Key Principles Used
Separation of concerns, finite state machines, reactive UI, idempotent cleanup, race-condition safety, WebRTC best practices.

### 🚀 Possible Extensions
Group calls

Screen sharing

Call reconnection

Call duration tracking

Push notifications

End-to-end encryption

### 📌 Summary
This project is not just a chat app — it is a reference architecture for building reliable real-time applications with React, Redux, WebSocket, and WebRTC. If you understand this codebase, you understand how to build production-grade real-time systems.

Happy hacking 🚀
