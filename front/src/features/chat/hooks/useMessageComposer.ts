import {useCallback, useRef, useState} from "react";
import {useDispatch} from "react-redux";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";

import type {AppDispatch} from "@/store/store";
import {chatMessagesService} from "@/features/chat/model/services/chatMessages.service.ts";
import {buildTypingIn} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {logger} from "@/shared/logger/logger.ts";

type ComposerSummary = {counterpartId: string; orderId?: string} | null | undefined;

/**
 * Message composer state + actions, extracted from useChat: the draft input, sending a message
 * (validate → enqueue via the outbox service → clear the input), and the throttled "I'm typing"
 * notifier. Behavior preserved verbatim, including the no-summary guard that surfaces an error toast
 * instead of failing silently.
 */
export function useMessageComposer(params: {
    selectedChatId: string | null;
    myId: string;
    getSummary: (chatId: string) => ComposerSummary;
}) {
    const {selectedChatId, myId, getSummary} = params;
    const dispatch = useDispatch<AppDispatch>();
    const {t} = useTranslation();
    const [messageInput, setMessageInput] = useState("");

    const sendMessage = useCallback((text: string) => {
        if (!selectedChatId || !text.trim()) return;
        const summary = getSummary(selectedChatId);
        if (!summary) {
            // Don't fail silently: if we can't resolve the conversation we can't send. Log it and
            // tell the user instead of the click doing nothing.
            logger.warn("sendMessage: no summary for selected chat — cannot send", {selectedChatId});
            toast.error(t("chat.msgSendError", {defaultValue: "Couldn't send — reopen the chat"}));
            return;
        }
        setMessageInput("");
        chatMessagesService.enqueueChatMessage(
            dispatch, text, myId, selectedChatId, summary.counterpartId, summary.orderId
        );
        // A new message is naturally "not read yet": its createdAt is above the peer's read
        // watermark, so it renders ✓ until a READ_OUT advances the watermark past it. No global reset.
    }, [selectedChatId, getSummary, myId, dispatch, t]);

    // Throttled "I'm typing" notifier (TYPING_IN → peer's TYPING_OUT). Called on input change.
    const lastTypingRef = useRef(0);
    const notifyTyping = useCallback(() => {
        if (!selectedChatId) return;
        const now = Date.now();
        if (now - lastTypingRef.current < 2500) return;
        lastTypingRef.current = now;
        const s = getSummary(selectedChatId);
        if (s) dispatch({type: "ws/send", payload: buildTypingIn(selectedChatId, s.counterpartId)});
    }, [selectedChatId, getSummary, dispatch]);

    return {messageInput, setMessageInput, sendMessage, notifyTyping};
}
