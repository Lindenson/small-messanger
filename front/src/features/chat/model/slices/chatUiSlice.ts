import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {logger} from "@/shared/logger/logger.ts";
import {clearUser} from "@/features/auth/slices/userSlice.ts";

interface ChatUiState {
    selectedChatId: string | null;
    // Per-conversation: has the peer read my latest messages (drives ✓✓). Reset on my new send,
    // set true on READ_OUT.
    peerReadByChat: Record<string, boolean>;
    // Per-conversation: is the peer currently typing (set on TYPING_OUT, auto-cleared).
    typingByChat: Record<string, boolean>;
    // Per-conversation: has unread incoming message(s). Lives in the store (not component state)
    // so it survives re-renders/navigation and can be set from chatMiddleware.
    unreadByChat: Record<string, boolean>;
}

const initialState: ChatUiState = {
    selectedChatId: null,
    peerReadByChat: {},
    typingByChat: {},
    unreadByChat: {},
};

const chatUiSlice = createSlice({
    name: "chatUi",
    initialState,
    reducers: {
        setSelectedChatId(state, action: PayloadAction<string | null>) {
            logger.debug("setSelectedChatId", action.payload);
            state.selectedChatId = action.payload;
        },
        setPeerRead(state, action: PayloadAction<{ chatId: string; read: boolean }>) {
            state.peerReadByChat[action.payload.chatId] = action.payload.read;
        },
        setTyping(state, action: PayloadAction<{ chatId: string; typing: boolean }>) {
            state.typingByChat[action.payload.chatId] = action.payload.typing;
        },
        markChatUnread(state, action: PayloadAction<string>) {
            state.unreadByChat[action.payload] = true;
        },
        markChatRead(state, action: PayloadAction<string>) {
            delete state.unreadByChat[action.payload];
        },
    },
    extraReducers: (builder) => {
        // Drop all per-conversation UI state on logout so a new session starts clean.
        builder.addCase(clearUser, (state) => {
            state.selectedChatId = null;
            state.peerReadByChat = {};
            state.typingByChat = {};
            state.unreadByChat = {};
        });
    },
});

export const { setSelectedChatId, setPeerRead, setTyping, markChatUnread, markChatRead } =
    chatUiSlice.actions;
export default chatUiSlice.reducer;
