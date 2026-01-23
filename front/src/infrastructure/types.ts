import type {IncomingWebRTCMessage} from "@/features/call/model/types.ts";
import type {ChatMessage} from "@/features/chat/model/schema/domainChatMessage.schema.ts";

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

export type IncomingWSMessage =
    | WSMessage & { type: "message"; payload: ChatMessage }
    | IncomingWebRTCMessage;


export type OutgoingWSMessage = {
    type: string;
    payload?: unknown;
};
