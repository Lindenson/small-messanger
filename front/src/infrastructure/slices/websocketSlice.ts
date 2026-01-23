import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {IncomingWSMessage, OutgoingWSMessage, WebSocketState} from "../types.ts";
import {logger} from "@/shared/logger/logger.ts";

const initialState: WebSocketState = {
  status: "disconnected",
  lastIncoming: null,
  lastOutgoing: null,
  error: null,
};

const websocketSlice = createSlice({
  name: "ws",
  initialState,
  reducers: {
    connecting(state) {
      state.status = "connecting";
      state.error = null;
    },

    connected(state) {
      state.status = "connected";
      state.error = null;
    },

    disconnected(state) {
      state.status = "disconnected";
    },

    incoming(state, action: PayloadAction<IncomingWSMessage>) {
      logger.debug("incoming ws ", JSON.stringify(action.payload));
      state.lastIncoming = action.payload;
    },

    outgoing(state, action: PayloadAction<OutgoingWSMessage>) {
      state.lastOutgoing = action.payload;
    },

    error(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },

    clearIncoming(state) {
      state.lastIncoming = null;
    },

    clearOutgoing(state) {
      state.lastOutgoing = null;
    },
  },
});

export const {
  connecting,
  connected,
  disconnected,
  incoming,
  outgoing,
  error,
  clearIncoming,
  clearOutgoing,
} = websocketSlice.actions;

export default websocketSlice.reducer;
