import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Mirrors the backend ClientData carried in PRESENT_* frames (payload.body JSON).
export type ClientData = {
    id: string;
    name?: string;
    email?: string;
    role?: string;
};

export type PresenceEntry = ClientData & { online: boolean };

type PresenceState = { byId: Record<string, PresenceEntry> };

const initialState: PresenceState = { byId: {} };

const presenceSlice = createSlice({
    name: "presence",
    initialState,
    reducers: {
        // PRESENT_INIT — snapshot of everyone currently online (with names).
        presenceInit(state, action: PayloadAction<ClientData[]>) {
            for (const c of action.payload) {
                if (c?.id) state.byId[c.id] = { ...c, online: true };
            }
        },
        // PRESENT_JOIN — a peer came online.
        presenceJoin(state, action: PayloadAction<ClientData>) {
            const c = action.payload;
            if (c?.id) state.byId[c.id] = { ...c, online: true };
        },
        // PRESENT_LEAVE — a peer went offline (keep the known name/email).
        presenceLeave(state, action: PayloadAction<ClientData>) {
            const c = action.payload;
            if (c?.id) state.byId[c.id] = { ...(state.byId[c.id] ?? c), ...c, online: false };
        },
    },
});

export const { presenceInit, presenceJoin, presenceLeave } = presenceSlice.actions;
export default presenceSlice.reducer;
