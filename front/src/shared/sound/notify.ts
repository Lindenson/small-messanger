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
 * Show a notification if allowed (used when the app is backgrounded / the tab is hidden).
 *
 * Prefers the service worker's `showNotification` over the page-context `new Notification()`:
 * on mobile (Android Chrome, installed iOS PWA) `new Notification()` is unsupported and throws, so
 * a phone with the app merely backgrounded (chat still open) would get NO notification. Routing
 * through the SW registration makes it work there too; `new Notification()` stays as the desktop
 * fallback when no SW is controlling the page. Both are best-effort.
 *
 * NOTE: this still requires the page's JS + WebSocket to be alive to receive the CHAT_OUT frame.
 * When the OS fully suspends a backgrounded mobile PWA (socket killed), no frame arrives and nothing
 * here runs — that case needs server-sent Web Push (VAPID + a push handler in the SW), a backend
 * feature not covered by this client-only path.
 */
export function showDesktopNotification(title: string, body: string) {
    try {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const opts = {
            body,
            icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
            badge: `${import.meta.env.BASE_URL}pwa-192x192.png`,
            tag: "chat-message",     // collapse rapid messages into one; renotify re-alerts
            renotify: true,
        } as NotificationOptions;
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready
                .then((reg) => reg.showNotification(title, opts))
                .catch(() => { try { new Notification(title, opts); } catch { /* ignore */ } });
            return;
        }
        new Notification(title, opts);
    } catch { /* ignore */ }
}
