/* Web Push handlers, imported into the generated service worker via workbox `importScripts`.
 *
 * Plain JS on purpose: this file is served verbatim from /public (never bundled/hashed) and pulled
 * into app-sw.js with importScripts(), so it must run as-is in the SW global scope. It handles the
 * two events the page JS cannot when the app is closed/backgrounded and the OS has suspended it:
 *   - `push`             → render the notification (payload sent by hormiga-webpush)
 *   - `notificationclick`→ focus an existing tab or open the app
 *
 * Payload shape (hormiga-webpush domain.Notification):
 *   { title, body, tag?, data: { conversationId?, messageId?, senderId?, url? } }
 */

// App base path (…/messenger-ui/), derived from the SW scope so icon/URL are correct regardless of mount.
const SCOPE_PATH = (() => {
    try { return new URL(self.registration.scope).pathname; } catch (e) { return "/"; }
})();

self.addEventListener("push", (event) => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }

    const title = payload.title || "New message";
    const options = {
        body: payload.body || "You have a new message",
        icon: SCOPE_PATH + "pwa-192x192.png",
        badge: SCOPE_PATH + "pwa-192x192.png",
        // Coalesce a burst for the same conversation into one notification; renotify re-alerts.
        tag: payload.tag || (payload.data && payload.data.conversationId) || "chat-message",
        renotify: true,
        data: (payload.data && typeof payload.data === "object") ? payload.data : {},
    };
    // Enforce ONE notification per conversation even if the OS doesn't honor tag-replace (iOS is
    // unreliable): close any existing notification with the same tag before showing. This dedups the
    // online (client-side, backgrounded-but-alive) notification against this server push when both
    // fire for the same message in the reconnect overlap.
    event.waitUntil((async () => {
        try {
            const existing = await self.registration.getNotifications({ tag: options.tag });
            for (const n of existing) n.close();
        } catch (e) { /* getNotifications unsupported → rely on tag-replace */ }
        await self.registration.showNotification(title, options);
    })());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const target = data.url || (self.registration.scope);
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        // Focus an already-open app window if there is one, and route it to the click-through URL
        // (e.g. the conversation the push was for) — focus alone would leave it on whatever was open.
        for (const c of wins) {
            if (c.url && c.url.indexOf(SCOPE_PATH) !== -1 && "focus" in c) {
                try { await c.focus(); } catch (e) { /* ignore */ }
                if (target && "navigate" in c) { try { await c.navigate(target); } catch (e) { /* ignore */ } }
                return;
            }
        }
        // Otherwise open a new one.
        if (self.clients.openWindow) {
            try { await self.clients.openWindow(target); } catch (e) { /* ignore */ }
        }
    })());
});
