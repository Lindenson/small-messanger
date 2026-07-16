import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {logger} from "@/shared/logger/logger.ts";
import {clearUser} from "@/features/auth/slices/userSlice.ts";

interface ChatUiState {
    selectedChatId: string | null;
    // Per-conversation READ watermark: epoch-ms up to which the peer has read my messages (bumped
    // on READ_OUT). A sent message shows ✓✓ iff its createdAt <= watermark — so ✓✓ is PER-MESSAGE:
    // sending a new message no longer un-ticks already-read older ones, and reading advances only
    // the messages up to "now". Monotonic; ephemeral (durable read state needs a backend watermark).
    peerReadWatermarkByChat: Record<string, number>;
    // Per-conversation: is the peer currently typing (set on TYPING_OUT, auto-cleared).
    typingByChat: Record<string, boolean>;
    // Per-conversation: has unread incoming message(s). Lives in the store (not component state)
    // so it survives re-renders/navigation and can be set from chatMiddleware.
    unreadByChat: Record<string, boolean>;
}

const initialState: ChatUiState = {
    selectedChatId: null,
    peerReadWatermarkByChat: {},
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
        // Advance the peer's read watermark for a conversation (monotonic — never regresses).
        setPeerReadWatermark(state, action: PayloadAction<{ chatId: string; at: number }>) {
            const cur = state.peerReadWatermarkByChat[action.payload.chatId] ?? 0;
            state.peerReadWatermarkByChat[action.payload.chatId] = Math.max(cur, action.payload.at);
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
            state.peerReadWatermarkByChat = {};
            state.typingByChat = {};
            state.unreadByChat = {};
        });
    },
});

export const { setSelectedChatId, setPeerReadWatermark, setTyping, markChatUnread, markChatRead } =
    chatUiSlice.actions;
export default chatUiSlice.reducer;
