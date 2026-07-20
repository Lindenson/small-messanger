import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {logger} from "@/shared/logger/logger.ts";
import {clearUser} from "@/features/auth/slices/userSlice.ts";

interface ChatUiState {
    selectedChatId: string | null;
    // Per-conversation read boundary: the messageId (server ULID) up to which the PEER has read my
    // messages. Server-driven — comes from the history response (`HistoryPage.peerLastReadId`) and
    // from the live READ_OUT frame (its correlationId). A sent message shows ✓✓ iff
    // `messageId <= peerLastReadId` (ULID lexicographic == chronological). Monotonic.
    peerLastReadIdByChat: Record<string, string>;
    // Per-conversation: is the peer currently typing (set on TYPING_OUT, auto-cleared).
    typingByChat: Record<string, boolean>;
    // Per-conversation: has unread incoming message(s). Lives in the store (not component state)
    // so it survives re-renders/navigation and can be set from chatMiddleware.
    unreadByChat: Record<string, boolean>;
}

const initialState: ChatUiState = {
    selectedChatId: null,
    peerLastReadIdByChat: {},
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
        // Advance the peer's read boundary (a message ULID) for a conversation. Monotonic: ULIDs sort
        // lexicographically by time, so we keep the greater id and never regress (ignores empty/null).
        setPeerLastReadId(state, action: PayloadAction<{ chatId: string; lastReadId?: string | null }>) {
            const next = action.payload.lastReadId;
            if (!next) return;
            const cur = state.peerLastReadIdByChat[action.payload.chatId];
            if (!cur || next > cur) state.peerLastReadIdByChat[action.payload.chatId] = next;
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
            state.peerLastReadIdByChat = {};
            state.typingByChat = {};
            state.unreadByChat = {};
        });
    },
});

export const { setSelectedChatId, setPeerLastReadId, setTyping, markChatUnread, markChatRead } =
    chatUiSlice.actions;
export default chatUiSlice.reducer;
