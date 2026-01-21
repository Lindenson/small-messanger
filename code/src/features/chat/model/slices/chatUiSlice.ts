import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {logger} from "@/shared/logger/logger.ts";

interface ChatUiState {
    selectedChatId: string | null;
}

const initialState: ChatUiState = {
    selectedChatId: null,
};

const chatUiSlice = createSlice({
    name: "chatUi",
    initialState,
    reducers: {
        setSelectedChatId(state, action: PayloadAction<string | null>) {
            logger.debug("setSelectedChatId", action.payload);
            state.selectedChatId = action.payload;
        },
    },
});

export const { setSelectedChatId } = chatUiSlice.actions;
export default chatUiSlice.reducer;
