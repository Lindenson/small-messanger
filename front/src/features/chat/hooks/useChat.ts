import {useCallback, useMemo, useRef, useState, useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import {setSelectedChatId} from "@/features/chat/model/slices/chatUiSlice";
import type {AppDispatch, RootState} from "@/store/store";
import {isUlid} from "@/shared/ulid/ulid.ts";

import {useChatMessages} from "./useChatMessages";
import {useChatAttachments} from "./useChatAttachments";
import {useUnreadChats} from "./useUnreadChats";
import {useReadReceipts} from "./useReadReceipts";
import {useReconnectCatchup} from "./useReconnectCatchup";
import {useOutboxStatus} from "./useOutboxStatus";
import {useContacts} from "../../contacts/hooks/useContacts.ts";

import {logger} from "@/shared/logger/logger.ts";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";
import {chatMessagesService} from "@/features/chat/model/services/chatMessages.service.ts";
import {useBlockChatMutation, useUnblockChatMutation, useDeleteMessageMutation} from "@/features/chat/rest/chatApi.ts";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {buildTypingIn} from "@/features/chat/model/schema/wireMessage.schema.ts";


export function useChat() {
    const dispatch = useDispatch<AppDispatch>();
    const {t} = useTranslation();

    /* ======================
       UI state (local)
    ====================== */
    const [messageInput, setMessageInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    /* ======================
       Global state
    ====================== */
    const myId = useSelector((state: RootState) => state.user.id);
    const selectedChatId = useSelector(
        (state: RootState) => state.chatUi.selectedChatId
    );

    /* ======================
       Contacts (chat list from GET /api/chats)
    ====================== */
    const {contacts, summaries, getContactById, getSummary, isLoadingIds} = useContacts();

    // Close a chat whose conversation is no longer in the (loaded) list — e.g. a soft-deleted/empty
    // chat the backend transiently lists then drops on a getChats refetch. Without this, ChatWindow
    // stays open (isChatOpen keys off selectedChatId) but getContactById/getSummary return null → no
    // counterpart name and a dead composer, silently with no error.
    useEffect(() => {
        if (!selectedChatId || isLoadingIds) return;
        if (!summaries.some((s) => s.conversationId === selectedChatId)) {
            logger.warn("selected chat not in the loaded list — closing (was a silent dead window)", {selectedChatId});
            dispatch(setSelectedChatId(null));
        }
    }, [selectedChatId, summaries, isLoadingIds, dispatch]);

    const [blockChat] = useBlockChatMutation();
    const [unblockChat] = useUnblockChatMutation();
    const [deleteMessageMut] = useDeleteMessageMutation();

    // Declared before the handlers that reference them (reloadChatHistory/clearChat/markRead).
    const {unreadChats, markRead} = useUnreadChats();
    const {messages, isError: historyError, reloadChatHistory, clearChat} = useChatMessages();

    // Attachment lifecycle (upload/download/resolve + progress) lives in its own hook.
    const {uploadProgress, sendAttachment, downloadAttachment, getAttachmentUrl} =
        useChatAttachments(selectedChatId, reloadChatHistory);

    const filteredChats = useMemo(
        () =>
            contacts.filter((c) =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [contacts, searchQuery]
    );

    const selectedChat: Contact | null = useMemo(
        () => (selectedChatId ? getContactById(selectedChatId) : null),
        [selectedChatId, getContactById]
    );

    // The counterpart's USER id (for WebRTC signaling recipientId) — distinct from the
    // conversationId used as the chat/list key.
    const selectedCounterpartId = useMemo(
        () => (selectedChatId ? getSummary(selectedChatId)?.counterpartId ?? null : null),
        [selectedChatId, getSummary]
    );
    const selectedBlocked = useMemo(
        () => (selectedChatId ? getSummary(selectedChatId)?.blocked ?? false : false),
        [selectedChatId, getSummary]
    );
    const selectedBlockedByMe = useMemo(
        () => (selectedChatId ? getSummary(selectedChatId)?.blockedByMe ?? false : false),
        [selectedChatId, getSummary]
    );
    const selectedBlockedByPeer = useMemo(
        () => (selectedChatId ? getSummary(selectedChatId)?.blockedByPeer ?? false : false),
        [selectedChatId, getSummary]
    );

    // Toggle only MY side of the block (I can't lift the peer's block).
    const toggleBlock = useCallback(async () => {
        if (!selectedChatId) return;
        try {
            if (selectedBlockedByMe) { await unblockChat({chatId: selectedChatId}).unwrap(); toast.success(t("chat.unblocked")); }
            else { await blockChat({chatId: selectedChatId}).unwrap(); toast.success(t("chat.blocked")); }
        } catch { toast.error(t("chat.blockError")); }
    }, [selectedChatId, selectedBlockedByMe, unblockChat, blockChat, t]);

    const deleteMessage = useCallback(async (messageId: string) => {
        if (!selectedChatId) return;
        // The backend deletes by EITHER id, so send the one we have — no cache read, no refetch.
        // A ULID is the server id (backendId); anything else is still the temporary client id
        // (clientMessageId, which the backend also resolves). Reconciled rows carry the ULID already.
        const server = isUlid(messageId);
        try {
            await deleteMessageMut({
                chatId: selectedChatId,
                backendId: server ? messageId : undefined,
                clientMessageId: server ? undefined : messageId,
            }).unwrap();
        } catch (e) {
            const st = (e as { status?: number })?.status;
            toast.error(st === 409 ? t("chat.msgFrozen") : t("chat.msgDeleteError"));
        }
    }, [selectedChatId, deleteMessageMut, t]);


    // Incoming CHAT_OUT / CHAT_ACK / READ_OUT / TYPING_OUT are handled per-frame in chatMiddleware
    // (not a lastIncoming effect), so bursts of frames are never dropped.

    // Reconnect / resume catch-up (refresh list + open history on ws reconnect and on resume from
    // background) lives in its own hook.
    useReconnectCatchup({selectedChatId, reloadChatHistory});

    // Read-receipt (READ_IN) machinery lives in its own hook (boundary reader + the visible/connect/
    // newest triggers). It hands back the boundary reader and a sender for openChat.
    const newestMessageId = messages.length ? messages[messages.length - 1].id : null;
    const {sendReadReceipt} = useReadReceipts({selectedChatId, newestMessageId, getSummary, markRead});

    /* ======================
       Actions (memoized so <ChatWindow>/<ChatList> can be React.memo'd)
    ====================== */
    const openChat = useCallback(async (chatId: string) => {
        dispatch(setSelectedChatId(chatId));
        markRead(chatId);
        // Mark the conversation read on open (peer receives READ_OUT).
        sendReadReceipt(chatId);
    }, [dispatch, markRead, sendReadReceipt]);

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

    const deleteChat = useCallback(async () => {
        await clearChat();
        dispatch(setSelectedChatId(null));
    }, [clearChat, dispatch]);

    // Outbox delivery status (per-message 🕐 / ⚠ + retry/discard) lives in its own hook.
    const {outboxStatusById, retryMessage, discardMessage} = useOutboxStatus({selectedChatId, myId});

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

    return {
        contacts,
        filteredChats,
        selectedChat,
        selectedChatId,
        selectedCounterpartId,
        selectedBlocked,
        selectedBlockedByMe,
        selectedBlockedByPeer,
        toggleBlock,
        deleteMessage,
        sendAttachment,
        uploadProgress,
        downloadAttachment,
        getAttachmentUrl,
        notifyTyping,
        messageInput,
        setMessageInput,
        searchQuery,
        setSearchQuery,
        openChat,
        sendMessage,
        deleteChat,
        unreadChats,
        messages,
        historyError,
        reloadChatHistory,
        outboxStatusById,
        retryMessage,
        discardMessage,
    };
}
