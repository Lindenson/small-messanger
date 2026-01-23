import {configureStore} from "@reduxjs/toolkit";

// Reducers
import userReducer from "@/features/auth/slices/userSlice";
import callReducer from "@/features/call/model/slices/callSlice";
import wsReducer from "@/infrastructure/slices/websocketSlice.ts";
import chatUiReducer from "@/features/chat/model/slices/chatUiSlice";
import outboxReducer, {hydrateOutbox, markPersisted} from "@/features/chat/model/slices/outboxSlice";


// Middleware
import {callMiddleware} from "@/features/call/middleware/callMiddleware";
import {websocketMiddleware} from "@/infrastructure/middleware/wsMiddleware.ts";

// DB functions
import {loadOutboxFromDB, saveOutboxToDB} from "@/features/chat/db/db";
import {chatApi} from "@/features/chat/rest/chatApi.ts";
import {contactsApi} from "@/features/contacts/rest/contactsApi.ts";


export const store = configureStore({
    reducer: {
        call: callReducer,
        ws: wsReducer,
        outbox: outboxReducer,
        user: userReducer,
        chatUi: chatUiReducer,
        [chatApi.reducerPath]: chatApi.reducer,
        [contactsApi.reducerPath]: contactsApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(
            chatApi.middleware,
            contactsApi.middleware,
            websocketMiddleware,
            callMiddleware),
});

store.subscribe(() => {
    const state = store.getState().outbox;

    if (state.outboxVersion !== state.persistedVersion) {
        saveOutboxToDB(state).then(() => {
            store.dispatch(markPersisted());
        });
    }
});


export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;


export async function hydrateStore() {
    const saved = await loadOutboxFromDB();
    if (saved) {
        store.dispatch(hydrateOutbox(saved));
    }
}

