import {useCallback, useMemo, useRef, useState, useEffect} from "react";
import {useDispatch, useSelector, useStore} from "react-redux";
import {setSelectedChatId} from "@/features/chat/model/slices/chatUiSlice";
import type {AppDispatch, RootState} from "@/store/store";
import {isUlid} from "@/shared/ulid/ulid.ts";

import {useChatMessages} from "./useChatMessages";
import {useUnreadChats} from "./useUnreadChats";
import {useContacts} from "../../contacts/hooks/useContacts.ts";

import {logger} from "@/shared/logger/logger.ts";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";
import {chatMessagesService} from "@/features/chat/model/services/chatMessages.service.ts";
import {chatApi, useBlockChatMutation, useUnblockChatMutation, useDeleteMessageMutation, useAttachmentUploadUrlMutation, useAttachmentConfirmMutation, useAttachmentDownloadUrlMutation} from "@/features/chat/rest/chatApi.ts";
import {retryMessage as retryOutboxMessage, discardMessage as discardOutboxMessage} from "@/features/chat/model/slices/outboxSlice.ts";
import type {ChatMessageStatus} from "@/features/chat/model/types.ts";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {buildReadIn, buildTypingIn} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {flushOutbox} from "@/features/chat/thunk/sendOutboxThunk.ts";
import {MAX_ATTACHMENT_BYTES} from "@/shared/config/chat.ts";


export function useChat() {
    const dispatch = useDispatch<AppDispatch>();
    const store = useStore<RootState>();
    const {t} = useTranslation();

    /* ======================
       UI state (local)
    ====================== */
    const [messageInput, setMessageInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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
    const [uploadUrlMut] = useAttachmentUploadUrlMutation();
    const [confirmMut] = useAttachmentConfirmMutation();
    const [downloadUrlMut] = useAttachmentDownloadUrlMutation();

    // Declared before the handlers that reference them (reloadChatHistory/clearChat/markRead).
    const {unreadChats, markRead} = useUnreadChats();
    const {messages, isError: historyError, reloadChatHistory, clearChat} = useChatMessages();

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

    const sendAttachment = useCallback(async (file: File) => {
        if (!selectedChatId || !file) return;
        if (file.size > MAX_ATTACHMENT_BYTES) {
            toast.error(t("chat.fileTooLarge", {mb: Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}));
            return;
        }
        const contentType = file.type || "application/octet-stream";
        setUploadProgress(0);
        try {
            const up = await uploadUrlMut({
                chatId: selectedChatId, fileName: file.name, contentType, sizeBytes: file.size,
            }).unwrap();
            // XHR (not fetch) so we can report upload progress to the composer.
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open(up.method || "PUT", up.uploadUrl);
                xhr.setRequestHeader("Content-Type", contentType);
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
                };
                xhr.onload = () =>
                    xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload PUT " + xhr.status));
                xhr.onerror = () => reject(new Error("upload network error"));
                xhr.send(file);
            });
            await confirmMut({chatId: selectedChatId, attachmentId: up.attachmentId}).unwrap();
            reloadChatHistory().catch(() => {});
            toast.success(t("chat.fileSent"));
        } catch (e) {
            logger.error("sendAttachment failed", e as Error);
            toast.error(t("chat.fileError"));
        } finally {
            setUploadProgress(null);
        }
    }, [selectedChatId, uploadUrlMut, confirmMut, reloadChatHistory, t]);

    const downloadAttachment = useCallback(async (attachmentId: string) => {
        if (!selectedChatId || !attachmentId) return;
        try {
            const r = await downloadUrlMut({chatId: selectedChatId, attachmentId}).unwrap();
            window.open(r.downloadUrl, "_blank", "noopener");
        } catch (e) {
            logger.error("downloadAttachment failed", e as Error);
            toast.error(t("chat.downloadError"));
        }
    }, [selectedChatId, downloadUrlMut, t]);

    // Resolve a fresh presigned GET URL (for inline image previews). Presigned URLs
    // expire (download-ttl-seconds), so the caller fetches on render rather than caching.
    const getAttachmentUrl = useCallback(async (attachmentId: string): Promise<string | null> => {
        if (!selectedChatId || !attachmentId) return null;
        try {
            const r = await downloadUrlMut({chatId: selectedChatId, attachmentId}).unwrap();
            return r.downloadUrl;
        } catch (e) {
            logger.error("getAttachmentUrl failed", e as Error);
            return null;
        }
    }, [selectedChatId, downloadUrlMut]);

    // Incoming CHAT_OUT / CHAT_ACK / READ_OUT / TYPING_OUT are handled per-frame in chatMiddleware
    // (not a lastIncoming effect), so bursts of frames are never dropped.

    /* ======================
       Reconnect handling
    ====================== */
    const wsStatus = useSelector((state: RootState) => state.ws.status);

    // Refetch the chat list preserving a freshly-created (still-hidden) selected chat — the shared
    // helper is the single funnel for every getChats refresh (see chatMessages.service).
    const catchUpChats = useCallback(() => {
        chatMessagesService.refetchChatsPreservingSelected(dispatch, store.getState);
    }, [dispatch, store]);

    // Read-through ONLY on the actual disconnected→connected transition — NOT on every chat switch.
    // (The effect deps include selectedChatId so its closure stays fresh, but the transition guard
    // stops it re-running on a plain chat open, which was causing a getChats+history refetch storm.)
    const prevWsRef = useRef(wsStatus);
    useEffect(() => {
        const was = prevWsRef.current;
        prevWsRef.current = wsStatus;
        if (wsStatus !== "connected" || was === "connected") return;
        dispatch(flushOutbox());                 // resend anything still queued (idempotent)
        catchUpChats();                          // refresh the chat list (new convs while offline)
        if (selectedChatId) reloadChatHistory().catch(logger.error); // open chat's missed history
    }, [wsStatus, selectedChatId, reloadChatHistory, catchUpChats, dispatch]);

    // Catch up over REST on RESUME from background / network recovery — independent of the WS state.
    // A merely-backgrounded mobile PWA can come back with a socket that still reports OPEN but is
    // actually dead, so the wsStatus-driven read-through above never re-fires; without this a
    // conversation or messages that arrived while suspended only show after a full reload.
    useEffect(() => {
        const onResume = () => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            catchUpChats();
            if (selectedChatId) reloadChatHistory().catch(() => {});
        };
        document.addEventListener("visibilitychange", onResume);
        window.addEventListener("online", onResume);
        return () => {
            document.removeEventListener("visibilitychange", onResume);
            window.removeEventListener("online", onResume);
        };
    }, [selectedChatId, reloadChatHistory, catchUpChats]);

    // Newest message id in a chat that is a real server ULID (skips our own not-yet-reconciled temp
    // client ids). READ_IN carries this as the read boundary the peer stores + uses for ✓✓.
    const lastReadMessageId = useCallback((chatId: string): string | undefined => {
        const data = chatApi.endpoints.getChatHistory.select({myId, chatId})(store.getState())?.data;
        if (!data) return undefined;
        for (let i = data.length - 1; i >= 0; i--) {
            if (isUlid(data[i].id)) return data[i].id;
        }
        return undefined;
    }, [myId, store]);

    // Deferred read: messages that arrived while the tab was hidden are marked read only when the
    // tab regains focus with the chat still open (mirrors the "active = open AND visible" rule).
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== "visible" || !selectedChatId) return;
            markRead(selectedChatId);
            const s = getSummary(selectedChatId);
            if (s) dispatch({type: "ws/send", payload: buildReadIn(selectedChatId, s.counterpartId, lastReadMessageId(selectedChatId))});
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [selectedChatId, markRead, getSummary, dispatch, lastReadMessageId]);

    // Report "read up to the newest message" whenever the OPEN + visible chat has messages. This is
    // the key trigger for the peer's ✓✓: openChat fires a read BEFORE the history is fetched (empty
    // boundary), so we also (re)send once the history — and each later arrival — is present, carrying
    // the newest server ULID as the read boundary in READ_IN. Idempotent on the backend (GREATEST).
    const newestMessageId = messages.length ? messages[messages.length - 1].id : null;
    useEffect(() => {
        if (!selectedChatId) return;
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        const boundary = lastReadMessageId(selectedChatId);
        if (!boundary) return;
        const s = getSummary(selectedChatId);
        if (s) dispatch({type: "ws/send", payload: buildReadIn(selectedChatId, s.counterpartId, boundary)});
    }, [selectedChatId, newestMessageId, lastReadMessageId, getSummary, dispatch]);

    /* ======================
       Actions (memoized so <ChatWindow>/<ChatList> can be React.memo'd)
    ====================== */
    const openChat = useCallback(async (chatId: string) => {
        dispatch(setSelectedChatId(chatId));
        markRead(chatId);
        // Mark the conversation read on open (peer receives READ_OUT).
        const s = getSummary(chatId);
        if (s) dispatch({type: "ws/send", payload: buildReadIn(chatId, s.counterpartId, lastReadMessageId(chatId))});
    }, [dispatch, markRead, getSummary, lastReadMessageId]);

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

    /* ======================
       Outbox delivery status (for per-message 🕐 / ⚠ + retry/discard on failed sends)
    ====================== */
    const outboxMessages = useSelector((state: RootState) => state.outbox.messages);
    const outboxStatusById = useMemo(() => {
        const map: Record<string, ChatMessageStatus> = {};
        for (const m of outboxMessages) map[m.id] = m.status;
        return map;
    }, [outboxMessages]);

    const retryMessage = useCallback((id: string) => {
        dispatch(retryOutboxMessage(id));
        dispatch(flushOutbox());
    }, [dispatch]);

    const discardMessage = useCallback((id: string) => {
        dispatch(discardOutboxMessage(id));
        // Also drop the optimistic row from the open history (it was never accepted by the server).
        if (selectedChatId) {
            dispatch(chatApi.util.updateQueryData("getChatHistory", {myId, chatId: selectedChatId}, (draft) => {
                const i = draft.findIndex((m) => m.id === id);
                if (i >= 0) draft.splice(i, 1);
            }));
        }
    }, [dispatch, myId, selectedChatId]);

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
