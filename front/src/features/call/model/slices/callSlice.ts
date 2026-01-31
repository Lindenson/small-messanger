import {createSlice, type PayloadAction} from "@reduxjs/toolkit";
import type {FromOffer} from "@/features/call/model/types.ts";

const callSlice = createSlice({
  name: "call",
  initialState: {
    status: "idle" as "idle" | "ringing" | "calling" | "connecting" | "in_call",
    peerId: null as string | null,
    incomingOfferData: null as FromOffer | null,
  },
  reducers: {
    outgoingCall: (state, action: PayloadAction<string>) => {
      state.status = "calling";
      state.peerId = action.payload;
    },

    incomingOffer: (state, action: PayloadAction<FromOffer>) => {
      state.status = "ringing";
      state.peerId = action.payload.from;
      state.incomingOfferData = action.payload; // 🔥 сохраняем offer
    },

    acceptCall: (state) => {
      state.status = "connecting";
    },

    incomingAnswer: (state) => {
      state.status = "connecting";
    },

    webrtcConnected: (state) => {
      state.status = "in_call";
    },

    incomingRemoteEnd: (state) => {
      state.status = "idle";
      state.peerId = null;
      state.incomingOfferData = null;
    },

    rejectCall: (state) => {
      state.status = "idle";
      state.peerId = null;
      state.incomingOfferData = null;
    },


    localEnd: (state) => {
      state.status = "idle";
      state.peerId = null;
      state.incomingOfferData = null;
    },
  },
});

export const {
  outgoingCall,
  incomingOffer,
  acceptCall,
  incomingAnswer,
  webrtcConnected,
  incomingRemoteEnd,
  localEnd,
  rejectCall
} = callSlice.actions;

export default callSlice.reducer;