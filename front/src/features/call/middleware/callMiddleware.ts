import type {Middleware, PayloadAction} from "@reduxjs/toolkit";
import type {IncomingWebRTCMessage} from "@/features/call/model/types.ts";
import {
    incomingAnswer,
    incomingOffer,
    incomingRemoteEnd,
    webrtcConnected,
    localEnd
} from "@/features/call/model/slices/callSlice.js";
import type {RootState} from "@/store/store.ts";
import {logger} from "@/shared/logger/logger.ts";
import type {WebRTCService} from "@/features/call/service/webRTCService";

const exceptionHandler = (ex: Error) => logger.error(ex.message, ex);

export const createCallMiddleware = (webRTCService: WebRTCService): Middleware => {
    return (store) => (next) => (action) => {
        const {dispatch, getState} = store;
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
                webRTCService.handleOffer(offer).catch(exceptionHandler);
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
            const state = getState() as RootState;
            const from = state.call.peerId;

            if (from) {
                webRTCService.rejectCall(from);
            }
        }

        /* ======================
           Check WebRTC connection state
        ====================== */
        const connState = webRTCService.getConnectionState();
        if (connState === "connected") {
            const state = getState() as RootState;
            if (state.call.status !== "in_call") {
                dispatch(webrtcConnected());
            }
        }

        return result;
    };
};