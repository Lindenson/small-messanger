import type {IncomingWebRTCMessage} from "@/features/call/model/types.ts";

type WSStatus = "disconnected" | "connecting" | "connected"

export type WSMessage = {
    type: string;
    [key: string]: unknown;
}
export type WSDispatcher = (data: WSMessage) => void;

export type WebSocketState = {
    status: WSStatus;
    lastIncoming: IncomingWSMessage | null;
    lastOutgoing: OutgoingWSMessage | null;
    error: string | null;
};

// After the frameBridge, WebRTC signaling arrives as a `call:*` frame; everything else
// is a raw backend frame (CHAT_OUT, CHAT_ACK, READ_OUT, PRESENT_*, SYSTEM_OUT, ...).
export type IncomingWSMessage = IncomingWebRTCMessage | WSMessage;

export type OutgoingWSMessage = {
    type: string;
    [key: string]: unknown;
};
