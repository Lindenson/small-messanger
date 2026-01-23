import {createAsyncThunk} from "@reduxjs/toolkit";
import {markFailed, markSending, markSent,} from "../model/slices/outboxSlice.ts";
import type {RootState} from "@/store/store";
import type {OutboxMessage} from "@/features/chat/model/types.ts";


async function sendToServer(msg: OutboxMessage) {
    await fetch("/api/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": msg.idempotencyKey,
        },
        body: JSON.stringify(msg.payload),
    });
}

export const flushOutbox = createAsyncThunk<
    void, void, { state: RootState }>("outbox/flush", async (_, {getState, dispatch}) => {
    const {messages} = getState().outbox;

    for (const msg of messages) {
        if (msg.status !== "pending" && msg.status !== "failed") continue;

        dispatch(markSending(msg.id));

        try {
            await sendToServer(msg);
            dispatch(markSent(msg.id));
        } catch {
            dispatch(markFailed(msg.id));
            break;
        }
    }
});