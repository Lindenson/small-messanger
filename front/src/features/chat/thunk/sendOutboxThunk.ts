import {createAsyncThunk} from "@reduxjs/toolkit";
import {markSending} from "../model/slices/outboxSlice.ts";
import type {RootState} from "@/store/store";

// Push queued CHAT_IN frames over the WebSocket. Delivery is NOT confirmed here: the server
// replies with a CHAT_ACK (correlationId === the client messageId) which the chat layer maps
// to outbox markSent (which removes the row). Sending is idempotent by messageId, so calling
// this again on reconnect safely re-sends anything still queued.
export const flushOutbox = createAsyncThunk<void, void, { state: RootState }>(
    "outbox/flush",
    async (_, {getState, dispatch}) => {
        if (getState().ws.status !== "connected") return;

        for (const msg of getState().outbox.messages) {
            if (msg.status === "sent") continue;
            dispatch(markSending(msg.id));
            dispatch({type: "ws/send", payload: msg.payload});
        }
    }
);