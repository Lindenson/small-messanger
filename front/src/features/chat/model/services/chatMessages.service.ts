import {type AppDispatch} from "@/store/store";
import {chatApi} from "@/features/chat/rest/chatApi";
import type {ChatMessage} from "../schema/domainChatMessage.schema";
import {logger} from "@/shared/logger/logger.ts";
import {enqueueMessage} from "@/features/chat/model/slices/outboxSlice.ts";
import {toOutboxMessage} from "@/features/chat/model/mapper.ts";
import {flushOutbox} from "@/features/chat/thunk/sendOutboxThunk.ts";


export const chatMessagesService = {
    incomingMessage(dispatch: AppDispatch, myId: string, msg: ChatMessage) {
        const chatId = msg.chatId;
        if (!chatId) return;
        logger.debug("updating chat history idempotent, adding message", msg);

        dispatch(
            chatApi.util.updateQueryData(
                "getChatHistory",
                {myId, chatId},
                (draft) => {
                    if (!draft) return;
                    if (!draft.some((m) => m.id === msg.id)) {
                        draft.push(msg);
                    }
                }
            )
        );
    },

    async clearChatHistory(dispatch: AppDispatch,
                           deleteHistory: ReturnType<typeof chatApi.useDeleteChatHistoryMutation>[0],
                           myId: string, chatId: string | null) {
        if (!chatId) return;
        logger.debug("deleted chat data", chatId);
        try {
            await deleteHistory({myId, chatId}).unwrap();
            dispatch(
                chatApi.util.updateQueryData(
                    "getChatHistory",
                    {myId, chatId},
                    () => []
                )
            );
        } catch (err) {
            console.error("Failed to clear chat", err);
        }
    },

    reloadChatHistory(dispatch: AppDispatch, myId: string, chatId: string | null) {
        if (!chatId) return;
        logger.debug("reloading chat data", chatId);
        return dispatch(
            chatApi.endpoints.getChatHistory.initiate({myId, chatId}, {forceRefetch: true})
        );
    },


    enqueueChatMessage(
        dispatch: AppDispatch,
        text: string,
        myId: string,
        conversationId: string | null,
        recipientId: string | null,
        orderId?: string
    ) {
        if (!conversationId || !recipientId || !text.trim()) return;
        logger.debug("sending chat message via a queue", text);

        const outboxMsg = toOutboxMessage({conversationId, recipientId, text, orderId});
        dispatch(enqueueMessage(outboxMsg));

        // Optimistic echo: the backend does NOT send CHAT_OUT back to the sender (only a
        // CHAT_ACK), so show our own message immediately. The client messageId is used as
        // the id; on the next history read-through RTK Query replaces the list with the
        // server's authoritative rows, so this transient copy can't duplicate.
        const optimistic = {
            id: outboxMsg.id,
            clientId: outboxMsg.id,   // dedup key (matches correlationId on echoes)
            chatId: conversationId,
            from: myId,
            to: recipientId,
            text,
            createdAt: new Date(),
            status: "sent" as const,
        };
        dispatch(
            chatApi.util.updateQueryData(
                "getChatHistory",
                {myId, chatId: conversationId},
                (draft) => {
                    // Seed the array when history hasn't loaded yet (e.g. the chat was opened while
                    // OFFLINE → getChatHistory errored → data is undefined). Without this the echo
                    // was silently dropped and the 🕐 message only appeared after reconnect.
                    if (!draft) return [optimistic];
                    if (!draft.some((m) => m.id === outboxMsg.id)) draft.push(optimistic);
                }
            )
        );

        dispatch(flushOutbox());
    },
};
