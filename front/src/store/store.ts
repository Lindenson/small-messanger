import { configureStore } from "@reduxjs/toolkit";

// Reducers
import userReducer from "@/features/auth/slices/userSlice";
import callReducer, {webrtcConnected, incomingRemoteEnd} from "@/features/call/model/slices/callSlice";
import wsReducer from "@/infrastructure/slices/websocketSlice.ts";
import chatUiReducer from "@/features/chat/model/slices/chatUiSlice";
import outboxReducer, { hydrateOutbox, markPersisted } from "@/features/chat/model/slices/outboxSlice";
import presenceReducer from "@/features/presence/model/presenceSlice";

// Middleware
import { createCallMiddleware } from "@/features/call/middleware/callMiddleware";
import { websocketMiddleware } from "@/infrastructure/middleware/wsMiddleware.ts";
import { presenceMiddleware } from "@/features/presence/middleware/presenceMiddleware.ts";
import { chatMiddleware } from "@/features/chat/middleware/chatMiddleware.ts";
import { authErrorListener } from "@/features/auth/middleware/authErrorMiddleware.ts";

// DB functions
import { loadOutboxFromDB, saveOutboxToDB } from "@/features/chat/db/db";
import { chatApi } from "@/features/chat/rest/chatApi.ts";
import { contactsApi } from "@/features/contacts/rest/contactsApi.ts";
import { idsApi } from "@/features/directory/idsApi.ts";
import type {WebRTCService} from "@/features/call/service/webRTCService.ts";

export function configureAppStore(webRTCService: WebRTCService) {
    const store = configureStore({
        reducer: {
            call: callReducer,
            ws: wsReducer,
            outbox: outboxReducer,
            user: userReducer,
            chatUi: chatUiReducer,
            presence: presenceReducer,
            [chatApi.reducerPath]: chatApi.reducer,
            [contactsApi.reducerPath]: contactsApi.reducer,
            [idsApi.reducerPath]: idsApi.reducer,
        },
        middleware: (getDefaultMiddleware) =>
            getDefaultMiddleware().prepend(authErrorListener.middleware).concat(
                chatApi.middleware,
                contactsApi.middleware,
                idsApi.middleware,
                websocketMiddleware,
                presenceMiddleware,
                chatMiddleware,
                createCallMiddleware(webRTCService)
            ),
    });

    // Persist the outbox to IndexedDB, debounced: the subscriber runs on every dispatched action,
    // so coalesce a burst of outbox changes (enqueue → sending → sent) into one write.
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    store.subscribe(() => {
        const s = store.getState().outbox;
        if (s.outboxVersion === s.persistedVersion || saveTimer) return;
        saveTimer = setTimeout(() => {
            saveTimer = null;
            const cur = store.getState().outbox;
            if (cur.outboxVersion === cur.persistedVersion) return;
            saveOutboxToDB(cur).then(() => store.dispatch(markPersisted()));
        }, 400);
    });

    webRTCService.setSendCallback((data) => {
        store.dispatch({type: "ws/send", payload: data});
    });

    // Reflect the peer-connection lifecycle into Redux: connected → in_call; failed/closed → idle
    // (the service has already released camera/mic + pc by the time onEnded fires).
    webRTCService.setEventCallbacks(
        () => store.dispatch(webrtcConnected()),
        () => store.dispatch(incomingRemoteEnd()),
    );

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
