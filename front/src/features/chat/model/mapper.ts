import {nanoid} from "@reduxjs/toolkit";
import type {ChatMessageView, OutboxMessage} from "@/features/chat/model/types.ts";
import type {ChatMessage} from "@/features/chat/model/schema/domainChatMessage.schema.ts";

type SendChatMessageCommand = {
    from: string;
    to: string;
    text: string;
};

export function toChatMessageView(
    msg: ChatMessage,
    myId: string
): ChatMessageView {
    return {
        id: msg.id,
        fromMe: msg.from === myId,
        text: msg.text,
        status: msg.status,
    };
}

export function toOutboxMessage(
    cmd: SendChatMessageCommand
): OutboxMessage {
    return {
        id: nanoid(),
        idempotencyKey: nanoid(),
        status: "pending",
        payload: {
            from: cmd.from,
            to: cmd.to,
            text: cmd.text,
        },
    };
}

