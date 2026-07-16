import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {IncomingWSMessage, OutgoingWSMessage, WebSocketState} from "../types.ts";
import {logger} from "@/shared/logger/logger.ts";

const initialState: WebSocketState = {
  status: "disconnected",
  lastIncoming: null,
  lastOutgoing: null,
  error: null,
  epoch: 0,
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
      // A new connection "epoch". The outbox resends an un-ACKed message at most once per epoch,
      // so a message already sent on the current (still-open) socket is NOT resent — that would
      // duplicate it, because the backend assigns its own messageId and does not dedupe by the
      // client messageId. Only a reconnect (new epoch) triggers a resend.
      state.epoch += 1;
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
