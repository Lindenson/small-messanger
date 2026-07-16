import {useCallback, useMemo, useRef, useState, useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import {setSelectedChatId, setPeerRead} from "@/features/chat/model/slices/chatUiSlice";
import type {AppDispatch, RootState} from "@/store/store";

import {useChatMessages} from "./useChatMessages";
import {useUnreadChats} from "./useUnreadChats";
import {useContacts} from "../../contacts/hooks/useContacts.ts";

import {logger} from "@/shared/logger/logger.ts";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";
import {chatMessagesService} from "@/features/chat/model/services/chatMessages.service.ts";
import {useBlockChatMutation, useUnblockChatMutation, useDeleteMessageMutation, useAttachmentUploadUrlMutation, useAttachmentConfirmMutation, useAttachmentDownloadUrlMutation} from "@/features/chat/rest/chatApi.ts";
import toast from "react-hot-toast";
import {buildReadIn, buildTypingIn} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {flushOutbox} from "@/features/chat/thunk/sendOutboxThunk.ts";


export function useChat() {
    const dispatch = useDispatch<AppDispatch>();

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
    const {contacts, getContactById, getSummary} = useContacts();
    const [blockChat] = useBlockChatMutation();
    const [unblockChat] = useUnblockChatMutation();
    const [deleteMessageMut] = useDeleteMessageMutation();
    const [uploadUrlMut] = useAttachmentUploadUrlMutation();
    const [confirmMut] = useAttachmentConfirmMutation();
    const [downloadUrlMut] = useAttachmentDownloadUrlMutation();

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

    async function toggleBlock() {
        if (!selectedChatId) return;
        try {
            if (selectedBlocked) { await unblockChat({chatId: selectedChatId}).unwrap(); toast.success("Desbloqueado"); }
            else { await blockChat({chatId: selectedChatId}).unwrap(); toast.success("Bloqueado"); }
        } catch { toast.error("No se pudo cambiar el bloqueo"); }
    }

    async function deleteMessage(messageId: string) {
        if (!selectedChatId) return;
        try {
            await deleteMessageMut({chatId: selectedChatId, messageId}).unwrap();
        } catch (e) {
            const st = (e as { status?: number })?.status;
            toast.error(st === 409 ? "Mensaje congelado, no se puede borrar" : "No se pudo borrar el mensaje");
        }
    }

    async function sendAttachment(file: File) {
        if (!selectedChatId || !file) return;
        const contentType = file.type || "application/octet-stream";
        try {
            const up = await uploadUrlMut({
                chatId: selectedChatId, fileName: file.name, contentType, sizeBytes: file.size,
            }).unwrap();
            const put = await fetch(up.uploadUrl, {
                method: up.method || "PUT", body: file, headers: {"Content-Type": contentType},
            });
            if (!put.ok) throw new Error("upload PUT " + put.status);
            await confirmMut({chatId: selectedChatId, attachmentId: up.attachmentId}).unwrap();
            reloadChatHistory().catch(() => {});
            toast.success("Archivo enviado");
        } catch (e) {
            logger.error("sendAttachment failed", e as Error);
            toast.error("No se pudo enviar el archivo");
        }
    }

    async function downloadAttachment(attachmentId: string) {
        if (!selectedChatId || !attachmentId) return;
        try {
            const r = await downloadUrlMut({chatId: selectedChatId, attachmentId}).unwrap();
            window.open(r.downloadUrl, "_blank", "noopener");
        } catch (e) {
            logger.error("downloadAttachment failed", e as Error);
            toast.error("No se pudo descargar");
        }
    }

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

    /* ======================
       Messages / unread
    ====================== */
    const {unreadChats, markRead} = useUnreadChats();
    const {messages, reloadChatHistory, clearChat} = useChatMessages();

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

    /* ======================
       Actions
    ====================== */
    async function openChat(chatId: string) {
        dispatch(setSelectedChatId(chatId));
        markRead(chatId);
        // Mark the conversation read on open (peer receives READ_OUT).
        const s = getSummary(chatId);
        if (s) dispatch({type: "ws/send", payload: buildReadIn(chatId, s.counterpartId)});
    }

    function sendMessage(text: string) {
        if (!selectedChatId || !text.trim()) return;
        const summary = getSummary(selectedChatId);
        if (!summary) return;
        setMessageInput("");
        chatMessagesService.enqueueChatMessage(
            dispatch, text, myId, selectedChatId, summary.counterpartId, summary.orderId
        );
        // New outgoing message — peer hasn't read it yet (✓, not ✓✓) until a READ_OUT.
        dispatch(setPeerRead({chatId: selectedChatId, read: false}));
    }

    async function deleteChat() {
        await clearChat();
        dispatch(setSelectedChatId(null));
    }

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
        toggleBlock,
        deleteMessage,
        sendAttachment,
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
    };
}
