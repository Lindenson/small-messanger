import {useCallback, useMemo, useRef, useState, useEffect} from "react";
import {useDispatch, useSelector, useStore} from "react-redux";
import {setSelectedChatId, setPeerReadWatermark} from "@/features/chat/model/slices/chatUiSlice";
import type {AppDispatch, RootState} from "@/store/store";
import {isUlid, ulidTimeMs} from "@/shared/ulid/ulid.ts";

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
    const {contacts, summaries, getContactById, getSummary} = useContacts();
    const [blockChat] = useBlockChatMutation();
    const [unblockChat] = useUnblockChatMutation();
    const [deleteMessageMut] = useDeleteMessageMutation();
    const [uploadUrlMut] = useAttachmentUploadUrlMutation();
    const [confirmMut] = useAttachmentConfirmMutation();
    const [downloadUrlMut] = useAttachmentDownloadUrlMutation();

    // Declared before the handlers that reference them (reloadChatHistory/clearChat/markRead).
    const {unreadChats, markRead} = useUnreadChats();
    const {messages, reloadChatHistory, clearChat} = useChatMessages();

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
        // Send BOTH ids; the backend matches on whichever it can. No refetch: even if this row is
        // still the optimistic echo under a temporary client id (server ULID not yet reconciled from
        // the ACK), the backend resolves it via clientMessageId.
        const row = chatApi.endpoints.getChatHistory
            .select({myId, chatId: selectedChatId})(store.getState())?.data
            ?.find((m) => m.id === messageId);
        const backendId = isUlid(messageId) ? messageId : (row && isUlid(row.id) ? row.id : undefined);
        // The original client id: the row's clientId, or the passed id itself if it's the temp id.
        const clientMessageId = row?.clientId ?? (isUlid(messageId) ? undefined : messageId);
        try {
            await deleteMessageMut({chatId: selectedChatId, backendId, clientMessageId}).unwrap();
        } catch (e) {
            const st = (e as { status?: number })?.status;
            toast.error(st === 409 ? t("chat.msgFrozen") : t("chat.msgDeleteError"));
        }
    }, [selectedChatId, myId, store, deleteMessageMut, t]);

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

    useEffect(() => {
        if (wsStatus !== "connected") return;
        // resend anything still queued (idempotent by messageId)
        dispatch(flushOutbox());
        // read-through: pull history over REST on (re)connect so nothing is missed
        if (selectedChatId) {
            reloadChatHistory().catch(logger.error);
        }
    }, [wsStatus, selectedChatId, reloadChatHistory, dispatch]);

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

    // Durable read receipts: GET /chats carries the PEER's read boundary (a ULID). Decode its embedded
    // timestamp and feed it into the (monotonic) peer watermark so ✓✓ survives a reload. The live
    // READ_OUT path keeps updating the same watermark instantly between chat-list refetches; both
    // sources merge via Math.max in the reducer.
    useEffect(() => {
        for (const s of summaries) {
            if (!s.peerReadReceipt) continue;
            const at = ulidTimeMs(s.peerReadReceipt);
            if (Number.isFinite(at)) dispatch(setPeerReadWatermark({chatId: s.conversationId, at}));
        }
    }, [summaries, dispatch]);

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
        if (!summary) return;
        setMessageInput("");
        chatMessagesService.enqueueChatMessage(
            dispatch, text, myId, selectedChatId, summary.counterpartId, summary.orderId
        );
        // A new message is naturally "not read yet": its createdAt is above the peer's read
        // watermark, so it renders ✓ until a READ_OUT advances the watermark past it. No global reset.
    }, [selectedChatId, getSummary, myId, dispatch]);

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
        outboxStatusById,
        retryMessage,
        discardMessage,
    };
}
