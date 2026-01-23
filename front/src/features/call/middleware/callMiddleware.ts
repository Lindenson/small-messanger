import {incomingAnswer, incomingOffer, incomingRemoteEnd,} from "@/features/call/model/slices/callSlice.js";
import type {Middleware, PayloadAction} from "@reduxjs/toolkit";
import type {IncomingWebRTCMessage} from "@/features/call/model/types.ts";


export const callMiddleware: Middleware = (store) => (next) => (action) => {
    const {dispatch} = store;

    const wsAction = action as PayloadAction<IncomingWebRTCMessage>;

    if (wsAction.type !== "ws/incoming") {
        return next(action);
    }

    const msg = wsAction.payload;

    switch (msg.type) {
        case "call:offer":
            dispatch(incomingOffer(msg));
            break;

        case "call:answer":
            dispatch(incomingAnswer());
            break;

        case "call:end":
            dispatch(incomingRemoteEnd());
            break;
    }

    return next(action);
};