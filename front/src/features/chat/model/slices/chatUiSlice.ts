import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {logger} from "@/shared/logger/logger.ts";

interface ChatUiState {
    selectedChatId: string | null;
    // Per-conversation: has the peer read my latest messages (drives ✓✓). Reset on my new send,
    // set true on READ_OUT.
    peerReadByChat: Record<string, boolean>;
    // Per-conversation: is the peer currently typing (set on TYPING_OUT, auto-cleared).
    typingByChat: Record<string, boolean>;
}

const initialState: ChatUiState = {
    selectedChatId: null,
    peerReadByChat: {},
    typingByChat: {},
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
    },
});

export const { setSelectedChatId, setPeerRead, setTyping } = chatUiSlice.actions;
export default chatUiSlice.reducer;
