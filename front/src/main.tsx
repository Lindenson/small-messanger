import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import {webRTCService} from '@/features/call/service/webRTCService';
import { configureAppStore, hydrateStore } from "./store/store";
import { saveOutboxToDB } from "@/features/chat/db/db";


import "@/index.css";
import "@/shared/i18n";
import App from "./app/App.tsx";

const store = configureAppStore(webRTCService);

// Restore the persisted outbox from IndexedDB so queued/failed messages survive a page reload
// (they are saved via store.subscribe but were never read back). Fire-and-forget: the queue
// populates asynchronously and flushOutbox re-sends anything pending once the socket connects.
hydrateStore(store);

// PWA auto-update safety: when a new service worker takes control (autoUpdate → skipWaiting +
// clientsClaim on a fresh deploy), reload ONCE so the page never keeps running a stale precached
// bundle. This is what un-traps a client stuck on an old cached build (browser OR installed PWA).
if ("serviceWorker" in navigator) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        // Flush the outbox before reloading: persistence is debounced (400ms), so a message queued
        // in that window would otherwise be lost when the fresh SW forces this reload.
        saveOutboxToDB(store.getState().outbox).finally(() => window.location.reload());
    });
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Provider store={store}>
            <App />
        </Provider>
    </StrictMode>
);
