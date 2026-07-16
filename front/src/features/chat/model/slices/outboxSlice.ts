import {createSlice, type PayloadAction} from "@reduxjs/toolkit";
import type {OutboxMessage, OutboxState} from "@/features/chat/model/types.ts";
import {logger} from "@/shared/logger/logger.ts";

const initialState: OutboxState = {
    messages: [],
    outboxVersion: 0,
    persistedVersion: 0,
};

function bumpVersion() {
    return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

const outboxSlice = createSlice({
    name: "outbox",
    initialState,
    reducers: {
        hydrateOutbox(state, action: PayloadAction<OutboxState>) {
            logger.debug("state hydrated ", state);
            return action.payload;
        },

        enqueueMessage(state, action: PayloadAction<Omit<OutboxMessage, "status" | "attempts">>) {
            logger.debug("message added ", action.payload);
            state.messages.push({
                ...action.payload,
                status: "pending",
                attempts: 0,
            });
            state.outboxVersion = bumpVersion();
        },

        // Mark a message in-flight and record the attempt + the connection epoch it was sent on
        // (drives the duplicate-safe, once-per-epoch resend + the retry cap).
        markSending(state, action: PayloadAction<{ id: string; at: number; epoch: number }>) {
            const msg = state.messages.find(m => m.id === action.payload.id);
            if (msg) {
                msg.status = "sending";
                msg.attempts += 1;
                msg.lastAttemptAt = action.payload.at;
                msg.sentEpoch = action.payload.epoch;
            }
        },

        markSent(state, action: PayloadAction<string>) {
            logger.debug("message sent ", action.payload);
            state.messages = state.messages.filter(m => m.id !== action.payload);
            state.outboxVersion = bumpVersion();
        },

        markFailed(state, action: PayloadAction<string>) {
            logger.debug("sent failed", action.payload);
            const msg = state.messages.find(m => m.id === action.payload);
            if (msg) msg.status = "failed";
            state.outboxVersion = bumpVersion();
        },

        // User-driven "retry" of a failed message: reset it so the sender re-picks it up.
        retryMessage(state, action: PayloadAction<string>) {
            const msg = state.messages.find(m => m.id === action.payload);
            if (msg) {
                msg.status = "pending";
                msg.attempts = 0;
                msg.sentEpoch = undefined;
            }
            state.outboxVersion = bumpVersion();
        },

        // User-driven "discard" of a queued/failed message: drop it from the outbox entirely.
        discardMessage(state, action: PayloadAction<string>) {
            state.messages = state.messages.filter(m => m.id !== action.payload);
            state.outboxVersion = bumpVersion();
        },

        markPersisted(state) {
            logger.debug("storage persisted");
            state.persistedVersion = state.outboxVersion;
        },
    },
});

export const {
    hydrateOutbox,
    enqueueMessage,
    markSending,
    markSent,
    markFailed,
    markPersisted,
    retryMessage,
    discardMessage,
} = outboxSlice.actions;

export default outboxSlice.reducer;