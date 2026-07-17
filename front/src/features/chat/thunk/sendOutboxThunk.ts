import {createAsyncThunk} from "@reduxjs/toolkit";
import {markSending, markFailed} from "../model/slices/outboxSlice.ts";
import type {RootState} from "@/store/store";
import {OUTBOX_RETRY_MAX_ATTEMPTS, OUTBOX_SEND_TIMEOUT_MS} from "@/shared/config/outbox.ts";

// Push queued CHAT_IN frames over the WebSocket with duplicate-safe, at-least-once-per-epoch
// delivery. Delivery is confirmed out-of-band by the server CHAT_ACK (correlationId === the client
// messageId → outbox markSent, which removes the row).
//
// IMPORTANT: the backend assigns its OWN messageId to each inbound frame and does NOT dedupe by the
// client messageId (verified against the messenger backend + a live two-account smoke). So blindly
// re-sending an un-ACKed message would create a DUPLICATE on the server. To stay safe we resend a
// message at most ONCE PER CONNECTION EPOCH: a frame already sent on the current (still-open) socket
// is considered delivered (TCP) and is left waiting for its ACK — never re-sent. Only a reconnect
// (new ws.epoch) makes an un-ACKed message eligible to send again, because a dropped socket is the
// one case where the frame may genuinely not have reached the server. Attempts are capped, then the
// message is marked failed.
//
// This runs on enqueue, on (re)connect, and on a periodic tick (useOutboxRetry).
export const flushOutbox = createAsyncThunk<void, void, { state: RootState }>(
    "outbox/flush",
    async (_, {getState, dispatch}) => {
        const state = getState();
        if (state.ws.status !== "connected") return;
        const epoch = state.ws.epoch;

        const now = Date.now();
        for (const msg of state.outbox.messages) {
            if (msg.status === "sent" || msg.status === "failed") continue;

            // Sent on a live connection but no ACK for too long (lost ACK, or a blocked/rejected
            // send) → surface it as failed (⚠ + retry) instead of a permanent 🕐.
            if (
                msg.status === "sending" &&
                msg.lastAttemptAt !== undefined &&
                now - msg.lastAttemptAt >= OUTBOX_SEND_TIMEOUT_MS
            ) {
                dispatch(markFailed(msg.id));
                continue;
            }

            // Already sent on THIS connection and still within the ACK window — delivered over TCP,
            // just awaiting the ACK. Do not resend (that would duplicate it server-side).
            if (msg.sentEpoch === epoch) continue;

            // Retries (across reconnects) exhausted — stop and surface the failure.
            if (msg.attempts >= OUTBOX_RETRY_MAX_ATTEMPTS) {
                dispatch(markFailed(msg.id));
                continue;
            }

            dispatch(markSending({id: msg.id, at: now, epoch}));
            dispatch({type: "ws/send", payload: msg.payload});
        }
    }
);
