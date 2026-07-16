import type {Middleware, PayloadAction} from "@reduxjs/toolkit";
import type {WSMessage} from "@/infrastructure/types.ts";
import type {AppDispatch} from "@/store/store.ts";
import {chatApi} from "@/features/chat/rest/chatApi.ts";
import {wireToChatMessage} from "@/features/chat/model/mapper.ts";
import {buildChatAck, buildReadIn, type WireMessage} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {markChatUnread, setPeerRead, setTyping} from "@/features/chat/model/slices/chatUiSlice.ts";
import {markSent} from "@/features/chat/model/slices/outboxSlice.ts";
import {logger} from "@/shared/logger/logger.ts";

// How long a "peer is typing" indicator lingers before auto-clearing if no follow-up frame.
const TYPING_TIMEOUT_MS = 4000;

/**
 * Routes incoming chat/read/typing WS frames per-frame, the same way presenceMiddleware routes
 * PRESENT_* frames. This is deliberately NOT a React effect on `ws.lastIncoming`: that slot holds
 * only the LAST frame, so a burst of frames arriving between renders would drop all but the last
 * (lost messages + missing ACKs). Reacting to every `ws/incoming` action here processes each frame
 * exactly once, synchronously, before the next one can overwrite anything.
 */
export const chatMiddleware: Middleware = (store) => (next) => (action) => {
    const result = next(action);
    const a = action as PayloadAction<WSMessage>;
    if (a?.type !== "ws/incoming") return result;

    const frame = a.payload as WireMessage;
    const st = store.getState();
    const myId = st.user?.id as string;
    const selectedChatId = (st.chatUi?.selectedChatId as string | null) ?? null;
    // The middleware's dispatch is typed as plain Dispatch; cast to the app's ThunkDispatch so
    // RTK Query thunks (updateQueryData / initiate) type-check like they do in the services.
    const dispatch = store.dispatch as AppDispatch;

    switch (frame?.type) {
        case "CHAT_OUT": {
            const msg = wireToChatMessage(frame);
            const chatId = msg.chatId;
            if (!chatId) break;

            // Append to the open conversation's history (idempotent). No-op if that query has
            // no subscriber (chat not open) — the message loads over REST when it's opened.
            dispatch(
                chatApi.util.updateQueryData("getChatHistory", {myId, chatId}, (draft) => {
                    if (!draft) return;
                    if (!draft.some((m) => m.id === msg.id)) draft.push(msg);
                })
            );

            // If this conversation isn't in the chat list yet (first message from a new peer),
            // refetch the list so the chat appears. The backend returns it once a message exists.
            const summaries = chatApi.endpoints.getChats.select({myId})(st)?.data;
            if (!summaries?.some((s) => s.conversationId === chatId)) {
                logger.debug("CHAT_OUT for unknown conversation, invalidating chat list", chatId);
                dispatch(chatApi.util.invalidateTags(["Chats"]));
            }

            // ACK delivery (SENT → DELIVERED; advances the server GC watermark).
            dispatch({type: "ws/send", payload: buildChatAck(frame)});
            clearTypingTimer(chatId);
            dispatch(setTyping({chatId, typing: false}));

            if (chatId === selectedChatId) {
                // Viewing this chat → mark READ immediately (peer gets READ_OUT).
                if (frame.senderId) dispatch({type: "ws/send", payload: buildReadIn(chatId, frame.senderId)});
            } else {
                dispatch(markChatUnread(chatId));
            }
            break;
        }

        case "CHAT_ACK": {
            if (!frame.correlationId) break;
            // Our queued message was accepted → drop it from the outbox immediately, then reconcile
            // the open history so the optimistic (client-id) row becomes the authoritative server
            // row. The reconcile is COALESCED per conversation: sending several messages quickly
            // fires an ACK each, and a full 200-row refetch + zod-parse per ACK is a real cost on
            // slow devices — one debounced refetch per burst is enough.
            dispatch(markSent(frame.correlationId));
            const chatId = frame.conversationId ?? selectedChatId;
            if (chatId) scheduleHistoryReload(dispatch, myId, chatId);
            break;
        }

        case "READ_OUT": {
            // The peer read my messages in this conversation → show ✓✓.
            if (frame.conversationId) dispatch(setPeerRead({chatId: frame.conversationId, read: true}));
            break;
        }

        case "TYPING_OUT": {
            const chatId = frame.conversationId;
            if (!chatId) break;
            dispatch(setTyping({chatId, typing: true}));
            // Auto-clear, replacing any pending timer for this chat (no unbounded timer pile-up).
            clearTypingTimer(chatId);
            typingTimers.set(
                chatId,
                setTimeout(() => {
                    typingTimers.delete(chatId);
                    dispatch(setTyping({chatId, typing: false}));
                }, TYPING_TIMEOUT_MS)
            );
            break;
        }
    }

    return result;
};

// Per-conversation "typing" auto-clear timers, so rapid TYPING_OUT frames don't stack timeouts.
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTypingTimer(chatId: string) {
    const t = typingTimers.get(chatId);
    if (t) {
        clearTimeout(t);
        typingTimers.delete(chatId);
    }
}

// Per-conversation debounce for the post-ACK history reconcile, so a burst of ACKs (rapid sends)
// collapses into a single force-refetch instead of one per message.
const HISTORY_RELOAD_DEBOUNCE_MS = 300;
const historyReloadTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleHistoryReload(dispatch: AppDispatch, myId: string, chatId: string) {
    const prev = historyReloadTimers.get(chatId);
    if (prev) clearTimeout(prev);
    historyReloadTimers.set(
        chatId,
        setTimeout(() => {
            historyReloadTimers.delete(chatId);
            const sub = dispatch(
                chatApi.endpoints.getChatHistory.initiate({myId, chatId}, {forceRefetch: true})
            );
            // Release the transient subscription once settled so it doesn't accumulate.
            Promise.resolve(sub).finally(() => sub.unsubscribe());
        }, HISTORY_RELOAD_DEBOUNCE_MS)
    );
}
