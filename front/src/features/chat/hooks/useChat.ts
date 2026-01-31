import {useEffect, useMemo, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {clearIncoming} from "@/infrastructure/slices/websocketSlice";
import {setSelectedChatId} from "@/features/chat/model/slices/chatUiSlice";
import type {AppDispatch, RootState} from "@/store/store";

import {useChatMessages} from "./useChatMessages";
import {useUnreadChats} from "./useUnreadChats";
import {useContacts} from "../../contacts/hooks/useContacts.ts";

import {logger} from "@/shared/logger/logger.ts";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";
import {chatMessagesService} from "@/features/chat/model/services/chatMessages.service.ts";


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
       Contacts
    ====================== */
    const {contacts, getContactById} = useContacts();

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

    /* ======================
       Messages / unread
    ====================== */
    const {unreadChats, markUnread, markRead} = useUnreadChats();
    const {messages, reloadChatHistory, handleIncomingMessage, clearChat} =
        useChatMessages();

    /* ======================
       WebSocket incoming
    ====================== */
    const lastIncoming = useSelector(
        (state: RootState) => state.ws.lastIncoming
    );

    useEffect(() => {
        if (!lastIncoming) return;

        /* ===== MESSAGES ===== */
        if (lastIncoming.type === "message") {
            const msg = lastIncoming.payload;
            const chatId = msg.from === myId ? msg.to : msg.from;

            handleIncomingMessage(msg);

            if (chatId !== selectedChatId) {
                markUnread(chatId);
            }
        }

        dispatch(clearIncoming());
    }, [lastIncoming, myId, selectedChatId, handleIncomingMessage, markUnread, dispatch]);

    /* ======================
       Reconnect handling
    ====================== */
    const wsStatus = useSelector((state: RootState) => state.ws.status);

    useEffect(() => {
        if (wsStatus !== "connected") return;
        if (!selectedChatId) return;

        reloadChatHistory().catch(logger.error);
    }, [wsStatus, selectedChatId, reloadChatHistory]);

    /* ======================
       Actions
    ====================== */
    async function openChat(chatId: string) {
        dispatch(setSelectedChatId(chatId));
        markRead(chatId);
        //await reloadChatHistory();
    }

    function sendMessage(text: string) {
        if (!selectedChatId || !text.trim()) return;
        setMessageInput("");
        chatMessagesService.enqueueChatMessage(dispatch, text, myId, selectedChatId);
    }

    async function deleteChat() {
        await clearChat();
        dispatch(setSelectedChatId(null));
    }

    return {
        contacts,
        filteredChats,
        selectedChat,
        selectedChatId,
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
