import {createAsyncThunk} from "@reduxjs/toolkit";
import {markSending, markFailed} from "../model/slices/outboxSlice.ts";
import type {RootState} from "@/store/store";
import {OUTBOX_RETRY_ACK_TIMEOUT_MS, OUTBOX_RETRY_MAX_ATTEMPTS} from "@/shared/config/outbox.ts";

// Push queued CHAT_IN frames over the WebSocket with at-least-once delivery. Delivery is confirmed
// out-of-band by the server's CHAT_ACK (correlationId === the client messageId → outbox markSent,
// which removes the row). Sending is idempotent by messageId, so re-sending is always safe.
//
// This runs on enqueue, on (re)connect, AND on a periodic tick (useOutboxRetry), so it is the
// single retry driver:
//   - pending / never-sent            → send now
//   - sending but ACK not seen in ACK_TIMEOUT → resend (a retry)
//   - sending and still within ACK_TIMEOUT     → leave in flight
//   - attempts exhausted (>= MAX)      → give up, mark failed (stop retrying)
//   - sent / failed                    → skip
export const flushOutbox = createAsyncThunk<void, void, { state: RootState }>(
    "outbox/flush",
    async (_, {getState, dispatch}) => {
        if (getState().ws.status !== "connected") return;

        const now = Date.now();
        for (const msg of getState().outbox.messages) {
            if (msg.status === "sent" || msg.status === "failed") continue;

            // In flight and not yet timed out — wait for the ACK.
            if (
                msg.status === "sending" &&
                msg.lastAttemptAt !== undefined &&
                now - msg.lastAttemptAt < OUTBOX_RETRY_ACK_TIMEOUT_MS
            ) {
                continue;
            }

            // Retries exhausted — stop and surface the failure.
            if (msg.attempts >= OUTBOX_RETRY_MAX_ATTEMPTS) {
                dispatch(markFailed(msg.id));
                continue;
            }

            dispatch(markSending({id: msg.id, at: now}));
            dispatch({type: "ws/send", payload: msg.payload});
        }
    }
);
