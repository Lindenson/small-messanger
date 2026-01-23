import {createSlice, type PayloadAction} from "@reduxjs/toolkit";
import type {CallState, FromOffer} from "@/features/call/model/types.ts";
import {logger} from "@/shared/logger/logger.ts";

const initialState: CallState = {
  status: "idle",
  peerId: null,
  offer: null,
};

const callSlice = createSlice({
  name: "call",
  initialState,
  reducers: {
    outgoingCall(state, action: PayloadAction<string>) {
      if (state.status !== "idle") return;
      state.status = "calling";
      state.peerId = action.payload;
      logger.debug("status calling");
    },

    incomingOffer(state, action: PayloadAction<FromOffer>) {
      if (state.status !== "idle") return;
      state.status = "ringing";
      state.peerId = action.payload.from;
      state.offer = action.payload.offer;
      logger.debug("status ringing");
    },

    acceptCall(state) {
      if (state.status !== "ringing") return;
      state.status = "connecting";
      logger.debug("status connecting");
    },

    incomingAnswer(state) {
      if (state.status !== "calling") return;
      state.status = "connecting";
      logger.debug("status connecting");
    },

    webrtcConnected(state) {
      if (state.status !== "connecting") return;
      state.status = "in_call";
      state.offer = null;
      logger.debug("status in_cal");
    },

    localEnd() {
      logger.debug("idle");
      return initialState;
    },

    incomingRemoteEnd() {
      logger.debug("idle");
      return initialState;
    },
  },
});

export const {
  incomingOffer,
  incomingAnswer,
  incomingRemoteEnd,
} = callSlice.actions;

export default callSlice.reducer;
