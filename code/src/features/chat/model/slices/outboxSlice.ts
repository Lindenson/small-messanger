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

        enqueueMessage(state, action: PayloadAction<Omit<OutboxMessage, "status">>) {
            logger.debug("message added ", action.payload);
            state.messages.push({
                ...action.payload,
                status: "pending",
            });
            state.outboxVersion = bumpVersion();
        },

        markSending(state, action: PayloadAction<string>) {
            const msg = state.messages.find(m => m.id === action.payload);
            if (msg) msg.status = "sending";
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
} = outboxSlice.actions;

export default outboxSlice.reducer;