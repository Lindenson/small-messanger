import type {Middleware, PayloadAction} from "@reduxjs/toolkit";
import type {IncomingWebRTCMessage} from "@/features/call/model/types.ts";
import {
    incomingAnswer,
    incomingOffer,
    incomingRemoteEnd,
    localEnd
} from "@/features/call/model/slices/callSlice.js";
import type {RootState} from "@/store/store.ts";
import {logger} from "@/shared/logger/logger.ts";
import type {WebRTCService} from "@/features/call/service/webRTCService";

const exceptionHandler = (ex: Error) => logger.error(ex.message, ex);

export const createCallMiddleware = (webRTCService: WebRTCService): Middleware => {
    return (store) => (next) => (action) => {
        const {dispatch, getState} = store;
        // Capture the peer BEFORE reducers run — call/rejectCall nulls peerId, but we still need
        // it to send call:end to the caller (otherwise the caller never learns the call was declined).
        const peerIdBefore = (getState() as RootState).call.peerId;
        const result = next(action);
        const callAction = action as PayloadAction<unknown>;

        /* ======================
           Incoming WS messages
        ====================== */
        if (callAction.type === "ws/incoming") {
            const msg = (action as PayloadAction<IncomingWebRTCMessage>).payload;

            if (typeof msg?.type === "string" && msg.type.startsWith("call:")) {
                switch (msg.type) {
                    case "call:offer":
                        dispatch(incomingOffer({
                            from: msg.from,
                            offer: msg.offer,
                        }));
                        break;

                    case "call:answer":
                        webRTCService.handleAnswer(msg).catch(exceptionHandler);
                        dispatch(incomingAnswer());
                        break;

                    case "call:ice":
                        webRTCService.addIce(msg).catch(exceptionHandler);
                        break;

                    case "call:end":
                        webRTCService.hangUp();
                        dispatch(incomingRemoteEnd());
                        break;
                }
            }
        }

        /* ======================
           Outgoing call
        ====================== */
        if (callAction.type === "call/outgoingCall") {
            const peerId = (action as PayloadAction<string>).payload;

            webRTCService.startCall(peerId)
                .then(() => {
                    // Успешно начали звонок
                })
                .catch((err) => {
                    exceptionHandler(err);
                    dispatch(localEnd()); // 🔥 Middleware диспатчит localEnd
                });
        }

        /* ======================
           Accept incoming call
        ====================== */
        if (callAction.type === "call/acceptCall") {
            const state = getState() as RootState;
            const offer = state.call.incomingOfferData;

            if (offer) {
                webRTCService.handleOffer(offer).catch((err) => {
                    exceptionHandler(err);
                    // Accepting failed (camera denied / negotiation error) — drop back to idle so
                    // the UI doesn't hang on "connecting" (symmetric with the outgoing-call path).
                    dispatch(localEnd());
                });
            }
        }

        /* ======================
           Local hangup
        ====================== */
        if (callAction.type === "call/localEnd") {
            webRTCService.hangUp();
        }

        /* ======================
           Reject incoming call
        ====================== */
        if (callAction.type === "call/rejectCall") {
            if (peerIdBefore) {
                webRTCService.rejectCall(peerIdBefore);
            }
        }

        // NOTE: the "connected" → in_call transition (and "failed/closed" → idle) is now driven by
        // webRTCService's onConnectionStateChange callbacks (wired in store.ts), not polled here on
        // incidental Redux traffic.

        return result;
    };
};