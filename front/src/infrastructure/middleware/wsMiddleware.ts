import type {Middleware, PayloadAction} from "@reduxjs/toolkit";
import {
    connected,
    connecting,
    disconnected,
    error as wsError,
    incoming,
    outgoing,
} from "@/infrastructure/slices/websocketSlice.ts";

import {DELAY_STEP_MS, MAX_RECONNECT_DELAY} from "@/shared/config/ws";
import type {OutgoingWSMessage, WSMessage} from "../types.ts";
import {fromWire, toWire} from "@/infrastructure/ws/frameBridge.ts";
import {isNotLogged} from "@/shared/utils/checks";
import type {User} from "@/features/auth/model/types.ts";
import {chatApi, type ChatSummary} from "@/features/chat/rest/chatApi.ts";
import {logger} from "@/shared/logger/logger.ts";
import {kratos} from "@/features/auth/model/services/kratos.ts";
import {clearUser} from "@/features/auth/slices/userSlice.ts";


type WSConnectAction = PayloadAction<{ url: string }, string, { shouldReconnect: boolean; }>
type WSDisconnectAction = PayloadAction<unknown>;
type WSSendAction = PayloadAction<OutgoingWSMessage>;
type WSActions = PayloadAction<OutgoingWSMessage> | WSDisconnectAction | WSSendAction;

// --------------------
// Runtime state middleware
// --------------------

let socket: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

// --------------------
// Middleware
// --------------------

export const websocketMiddleware: Middleware =
    (store) => (next) => (action) => {
        const { dispatch } = store;

        const scheduleReconnect = (url: string) => {
            reconnectAttempts += 1;

            const delay = Math.min(
                DELAY_STEP_MS * 2 ** reconnectAttempts,
                MAX_RECONNECT_DELAY
            );

            logger.debug(`🔁 WS reconnect #${reconnectAttempts} in ${delay}ms`);
            reconnectTimeout = setTimeout(() => connect(url, true), delay);
        };

        const connect = (url: string, shouldReconnect: boolean) => {
            const state = store.getState();
            const user : User = state.user;


            if (isNotLogged(user.id)) {
                logger.debug("WS connect skipped: user not logged in");
                return;
            }

            if (
                socket &&
                (socket.readyState === WebSocket.OPEN ||
                    socket.readyState === WebSocket.CONNECTING)
            ) {
                return;
            }

            dispatch(connecting());
            socket = new WebSocket(url);

            socket.onopen = () => {
                reconnectAttempts = 0;
                dispatch(connected());
                logger.debug(`🔗 WS connected #${reconnectAttempts} to ${url}`);
            };

            socket.onmessage = (event: MessageEvent<string>) => {
                try {
                    const raw = JSON.parse(event.data) as WSMessage;
                    dispatch(incoming(fromWire(raw)));
                } catch {
                    dispatch(wsError("WS parse error"));
                }
            };

            socket.onerror = () => {
                dispatch(wsError("WebSocket error"));
            };

            socket.onclose = () => {
                socket = null;
                dispatch(disconnected());

                if (!shouldReconnect) return;

                // A rejected WS upgrade (expired Kratos session) surfaces as a generic close (1006),
                // indistinguishable from a network drop — so blind reconnect would loop forever while
                // the user still looks "logged in" and is never sent to /login. After a few failures,
                // probe the session: if it's gone, stop the loop and trigger re-auth (clearUser makes
                // RequireAuth redirect and connect() then skips as not-logged-in); if it's valid, it's
                // a genuine network issue → keep retrying.
                if (reconnectAttempts >= 3) {
                    kratos.toSession().then(
                        () => scheduleReconnect(url),
                        (err: unknown) => {
                            // Only treat a real 401/403 as "session gone → re-auth". A network
                            // failure/timeout ALSO rejects toSession() (no response), and that is the
                            // common case here (the same outage that dropped the WS) — logging the user
                            // out then would be a false logout on a valid session. Keep retrying instead.
                            const status = (err as {response?: {status?: number}})?.response?.status;
                            if (status === 401 || status === 403) {
                                logger.debug("WS reconnect halted: session invalid → re-auth");
                                dispatch(clearUser());
                                dispatch({type: "ws/disconnect"});
                            } else {
                                logger.debug("WS session probe inconclusive (network) → keep retrying");
                                scheduleReconnect(url);
                            }
                        }
                    );
                    return;
                }
                scheduleReconnect(url);
            };
        };

        // --------------------
        // Action handling
        // --------------------

        const wsAction = action as WSActions;

        switch (wsAction.type) {
            case "ws/connect": {
                logger.debug("connecting by action ", wsAction.type);

                const { url } = (action as WSConnectAction).payload;
                const shouldReconnect = Boolean(
                    (action as WSConnectAction).meta?.shouldReconnect
                );

                if (reconnectTimeout) {
                    clearTimeout(reconnectTimeout);
                    reconnectTimeout = null;
                }

                reconnectAttempts = 0;
                connect(url, shouldReconnect);
                break;
            }

            case "ws/disconnect": {
                logger.debug("disconnected ws by action");
                if (reconnectTimeout) {
                    clearTimeout(reconnectTimeout);
                    reconnectTimeout = null;
                }

                reconnectAttempts = 0;

                if (socket) {
                    socket.close(1000, "Client disconnect");
                    socket = null;
                }

                dispatch(disconnected());
                break;
            }

            case "ws/send": {
                logger.debug("sending ws by action");

                if (socket?.readyState === WebSocket.OPEN) {
                    const payload = (action as WSSendAction).payload;
                    // For WebRTC call frames, resolve the conversationId from the chat directory
                    // by the counterpart user id (`to`), so the SIGNAL_IN passes backend validation.
                    let ctx: { conversationId?: string } | undefined;
                    const p = payload as { type?: string; to?: string };
                    if (typeof p.type === "string" && p.type.startsWith("call:") && p.to) {
                        const st = store.getState();
                        const myId = (st.user as User)?.id;
                        const summaries = chatApi.endpoints.getChats.select({myId})(st)?.data as
                            ChatSummary[] | undefined;
                        const conv = summaries?.find((s) => s.counterpartId === p.to);
                        ctx = {conversationId: conv?.conversationId};
                    }
                    socket.send(JSON.stringify(toWire(payload, ctx)));
                    dispatch(outgoing(payload));
                }
                break;
            }
        }

        return next(action);
    };
