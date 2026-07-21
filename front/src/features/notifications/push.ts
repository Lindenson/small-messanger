// Web Push subscription lifecycle against hormiga-webpush.
//
// Flow: once notification permission is granted and a service worker controls the page, fetch the
// server VAPID public key, subscribe the browser's PushManager, and register the subscription with
// the backend so it can deliver a push when this user is offline. Deregister on logout so the
// device stops receiving another user's notifications. Everything is best-effort and guarded — a
// browser without Push/SW support, a denied permission, or a backend hiccup must never break the app.

import {WEBPUSH_BASE} from "@/shared/config/api";
import {logger} from "@/shared/logger/logger";

// VAPID public key is base64url; PushManager wants a Uint8Array (applicationServerKey).
function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

export function pushSupported(): boolean {
    return typeof window !== "undefined"
        && "serviceWorker" in navigator
        && "PushManager" in window
        && "Notification" in window;
}

async function fetchVapidKey(): Promise<string | null> {
    try {
        const res = await fetch(`${WEBPUSH_BASE}/vapid-public-key`, {credentials: "include"});
        if (!res.ok) return null;
        const j = (await res.json()) as {publicKey?: string};
        return j.publicKey ?? null;
    } catch {
        return null;
    }
}

/**
 * Ensure this device is subscribed to Web Push and registered with the backend. Idempotent: safe to
 * call on every app start and after permission is granted. No-op unless permission is "granted".
 */
export async function ensurePushSubscription(): Promise<void> {
    if (!pushSupported() || Notification.permission !== "granted") return;
    try {
        const reg = await navigator.serviceWorker.ready;

        // Reuse an existing subscription, else create one with the server VAPID key.
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            const key = await fetchVapidKey();
            if (!key) { logger.warn("push: no VAPID key from server"); return; }
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                // Cast: the DOM lib types applicationServerKey as BufferSource; a plain Uint8Array's
                // generic ArrayBufferLike (incl. SharedArrayBuffer) trips strict assignability.
                applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
            });
        }

        // Register (idempotent upsert by endpoint on the backend). PushSubscription.toJSON() gives
        // { endpoint, keys: { p256dh, auth } } — exactly the backend's expected body.
        const json = sub.toJSON() as {endpoint?: string; keys?: {p256dh?: string; auth?: string}};
        const res = await fetch(`${WEBPUSH_BASE}/subscriptions`, {
            method: "POST",
            credentials: "include",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                endpoint: json.endpoint,
                keys: {p256dh: json.keys?.p256dh, auth: json.keys?.auth},
                userAgent: navigator.userAgent,
            }),
        });
        if (!res.ok && res.status !== 201) logger.warn("push: register failed", {status: res.status});
        else logger.debug("push: subscription registered");
    } catch (err) {
        logger.warn("push: ensureSubscription failed", {err});
    }
}

/**
 * Remove this device's push subscription on logout: tell the backend to drop the endpoint, then
 * unsubscribe locally so the next user on this device doesn't inherit it. Best-effort.
 */
export async function removePushSubscription(): Promise<void> {
    if (!pushSupported()) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        const endpoint = sub.endpoint;
        try {
            await fetch(`${WEBPUSH_BASE}/subscriptions?endpoint=${encodeURIComponent(endpoint)}`, {
                method: "DELETE",
                credentials: "include",
            });
        } catch { /* still unsubscribe locally below */ }
        await sub.unsubscribe().catch(() => { /* ignore */ });
        logger.debug("push: subscription removed");
    } catch (err) {
        logger.warn("push: removeSubscription failed", {err});
    }
}
