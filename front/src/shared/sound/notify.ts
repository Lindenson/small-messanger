// Lightweight, asset-free incoming-message notifications: a short WebAudio blip + an optional
// desktop Notification. All best-effort — browser autoplay/permission policies may suppress them
// (audio needs a prior user gesture; notifications need granted permission), so every call is guarded.

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
    try {
        if (!ctx) {
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
        }
        return ctx;
    } catch {
        return null;
    }
}

/** Short two-tone blip via WebAudio (no media asset needed). */
export function playNotificationSound() {
    const ac = audioCtx();
    if (!ac) return;
    try {
        if (ac.state === "suspended") ac.resume().catch(() => {});
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.connect(gain).connect(ac.destination);
        osc.start(now);
        osc.stop(now + 0.24);
    } catch { /* ignore */ }
}

/** Ask for desktop-notification permission once (best-effort). */
export function requestNotificationPermission() {
    try {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().catch(() => {});
        }
    } catch { /* ignore */ }
}

/**
 * Arm a ONE-TIME notification-permission request tied to the first user gesture.
 *
 * Mobile browsers (notably installed iOS PWAs, and Android Chrome after a dismissal) ignore or
 * suppress a `Notification.requestPermission()` that isn't triggered by a user gesture — so the
 * mount-time requestNotificationPermission() call silently no-ops there and notifications never
 * get granted (exactly what happens after site data is cleared, which resets the grant to
 * "default"). Requesting on the first tap/click/keypress makes the prompt actually appear. The
 * listeners are one-shot and self-removing, and we only arm when permission is still "default".
 */
export function armNotificationPermissionOnGesture(onGranted?: () => void) {
    try {
        if (!("Notification" in window) || Notification.permission !== "default") return;
        const ask = () => {
            cleanup();
            try {
                Notification.requestPermission()
                    .then((p) => { if (p === "granted") onGranted?.(); })
                    .catch(() => {});
            } catch { /* ignore */ }
        };
        const cleanup = () => {
            window.removeEventListener("pointerdown", ask);
            window.removeEventListener("keydown", ask);
            window.removeEventListener("touchend", ask);
        };
        window.addEventListener("pointerdown", ask, {once: true});
        window.addEventListener("keydown", ask, {once: true});
        window.addEventListener("touchend", ask, {once: true});
    } catch { /* ignore */ }
}

/**
 * Show a notification for an incoming message while the app is backgrounded / the tab is hidden.
 *
 * SINGLE-ARBITER MODEL (fixes cross-channel duplicates). There are two independent notification
 * channels for one message: this ONLINE path (the live app got the CHAT_OUT frame) and the OFFLINE
 * Web Push (hormiga-webpush → the SW `push` event). Coalescing them after the fact by a shared
 * `tag` loses the race when both fire near-simultaneously. So this path does NOT call
 * `showNotification` itself — it hands the request to the service worker (`postMessage`), which is
 * the ONE place both channels converge and dedups by `messageId` before showing (see push-sw.js).
 * That makes the dedup race-free (the SW is single-threaded: it claims the id synchronously before
 * any await). `messageId` is the server message ULID, identical on both channels.
 *
 * Fallback: if there is no active SW (rare — desktop without the PWA installed), show directly.
 * That path can't cross-channel-dedup, but there is also no Web Push without a SW, so no duplicate.
 *
 * NOTE: this still requires the page's JS + WebSocket to be alive to receive the CHAT_OUT frame.
 * When the OS fully suspends the PWA (socket killed) only the Web Push fires — handled entirely in
 * the SW.
 */
export function showDesktopNotification(title: string, body: string, conversationId?: string, messageId?: string) {
    try {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const base = import.meta.env.BASE_URL;
        const payload = {
            title,
            body,
            // Same tag as the Web Push (also keyed on conversationId) → one notification per chat.
            tag: conversationId || "chat-message",
            data: {
                conversationId,
                messageId,   // ← the cross-channel dedup key (server message ULID)
                url: conversationId ? `${base}?chat=${conversationId}` : base,
            },
        };
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready
                .then((reg) => {
                    const sw = reg.active;
                    if (sw) {
                        // Route through the arbiter. It dedups by messageId against any Web Push for
                        // the same message and renders exactly one notification.
                        sw.postMessage({type: "show-notification", payload});
                    } else {
                        // No active worker yet → show directly (best-effort; no Web Push either).
                        reg.showNotification(title, buildFallbackOptions(base, body, payload)).catch(() => {});
                    }
                })
                .catch(() => { try { new Notification(title, buildFallbackOptions(base, body, payload)); } catch { /* ignore */ } });
            return;
        }
        new Notification(title, buildFallbackOptions(base, body, payload));
    } catch { /* ignore */ }
}

function buildFallbackOptions(base: string, body: string, payload: {tag: string; data: unknown}): NotificationOptions {
    return {
        body,
        icon: `${base}pwa-192x192.png`,
        badge: `${base}pwa-192x192.png`,
        tag: payload.tag,
        renotify: true,
        data: payload.data,
    } as NotificationOptions;
}
