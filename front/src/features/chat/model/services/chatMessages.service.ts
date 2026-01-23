import {type AppDispatch} from "@/store/store";
import {chatApi} from "@/features/chat/rest/chatApi";
import type {ChatMessage} from "../schema/domainChatMessage.schema";
import {logger} from "@/shared/logger/logger.ts";
import {enqueueMessage} from "@/features/chat/model/slices/outboxSlice.ts";
import {toOutboxMessage} from "@/features/chat/model/mapper.ts";
import {flushOutbox} from "@/features/chat/thunk/sendOutboxThunk.ts";


export const chatMessagesService = {
    incomingMessage(dispatch: AppDispatch, myId: string, msg: ChatMessage) {
        const chatId = msg.from === myId ? msg.to : msg.from;
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
        logger.debug("updating chat list if needed", chatId);
        dispatch(
            chatApi.util.updateQueryData(
                "getChats",
                {myId},
                (draft = []) => {
                    if (!draft.includes(chatId!)) {
                        draft.push(chatId!);
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


    enqueueChatMessage(dispatch: AppDispatch, text : string, myId: string, selectedChatId: string | null) {
        if (!selectedChatId) return;
        logger.debug("sending chat message via a queue", text);
        dispatch(
            enqueueMessage(
                toOutboxMessage({
                    from: myId,
                    to: selectedChatId,
                    text,
                })
            )
        );
        dispatch(flushOutbox());
    },
};
