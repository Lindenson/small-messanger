import { configureStore } from "@reduxjs/toolkit";

// Reducers
import userReducer from "@/features/auth/slices/userSlice";
import callReducer from "@/features/call/model/slices/callSlice";
import wsReducer from "@/infrastructure/slices/websocketSlice.ts";
import chatUiReducer from "@/features/chat/model/slices/chatUiSlice";
import outboxReducer, { hydrateOutbox, markPersisted } from "@/features/chat/model/slices/outboxSlice";

// Middleware
import { createCallMiddleware } from "@/features/call/middleware/callMiddleware";
import { websocketMiddleware } from "@/infrastructure/middleware/wsMiddleware.ts";

// DB functions
import { loadOutboxFromDB, saveOutboxToDB } from "@/features/chat/db/db";
import { chatApi } from "@/features/chat/rest/chatApi.ts";
import { contactsApi } from "@/features/contacts/rest/contactsApi.ts";
import type {WebRTCService} from "@/features/call/service/webRTCService.ts";

export function configureAppStore(webRTCService: WebRTCService) {
    const store = configureStore({
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
                createCallMiddleware(webRTCService)
            ),
    });

    store.subscribe(() => {
        const state = store.getState().outbox;

        if (state.outboxVersion !== state.persistedVersion) {
            saveOutboxToDB(state).then(() => {
                store.dispatch(markPersisted());
            });
        }
    });

    webRTCService.setSendCallback((data) => {
        store.dispatch({type: "ws/send", payload: data});
    });

    return store;
}

export type RootState = ReturnType<ReturnType<typeof configureAppStore>["getState"]>;
export type AppDispatch = ReturnType<typeof configureAppStore>["dispatch"];

export async function hydrateStore(store: ReturnType<typeof configureAppStore>) {
    const saved = await loadOutboxFromDB();
    if (saved) {
        store.dispatch(hydrateOutbox(saved));
    }
}
