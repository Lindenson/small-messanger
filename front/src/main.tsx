import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import {webRTCService} from '@/features/call/service/webRTCService';
import { configureAppStore, hydrateStore } from "./store/store";


import "@/index.css";
import "@/shared/i18n";
import App from "./app/App.tsx";

const store = configureAppStore(webRTCService);

// Restore the persisted outbox from IndexedDB so queued/failed messages survive a page reload
// (they are saved via store.subscribe but were never read back). Fire-and-forget: the queue
// populates asynchronously and flushOutbox re-sends anything pending once the socket connects.
hydrateStore(store);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Provider store={store}>
            <App />
        </Provider>
    </StrictMode>
);
