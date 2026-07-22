/* Web Push + notification arbiter, imported into the generated service worker via workbox
 * `importScripts`.
 *
 * Plain JS on purpose: this file is served verbatim from /public (never bundled/hashed) and pulled
 * into app-sw.js with importScripts(), so it must run as-is in the SW global scope.
 *
 * SINGLE-ARBITER MODEL. One incoming message can be announced by TWO independent channels:
 *   - OFFLINE: the OS delivers a Web Push → the `push` event here (app suspended/closed).
 *   - ONLINE:  the live app got the CHAT_OUT frame and asks us to notify → the `message` event here.
 * Both converge on showChatNotification(), which dedups by `data.messageId` BEFORE showing. The SW
 * is single-threaded, so claiming the id (claimShow) is synchronous and race-free: whichever channel
 * reaches it first for a given messageId shows the notification; the other is dropped. This replaces
 * the old best-effort "same tag + close-existing" coalescing, which lost the near-simultaneous race.
 *
 * Payload shape (hormiga-webpush domain.Notification, and the page's postMessage payload):
 *   { title, body, tag?, data: { conversationId?, messageId?, senderId?, url? } }
 */

// App base path (…/messenger-ui/), derived from the SW scope so icon/URL are correct regardless of mount.
const SCOPE_PATH = (() => {
    try { return new URL(self.registration.scope).pathname; } catch (e) { return "/"; }
})();

// Cross-channel dedup: messageId → expiry timestamp. Best-effort, in-memory (a dup requires both
// channels to fire within seconds, during which the SW stays alive). Bounded by TTL cleanup.
const DEDUP_TTL_MS = 60_000;
const shownRecently = new Map();

// Synchronously claim the right to show `messageId` (no await before the set → race-free between the
// push and message events). Returns false if it was already claimed within the TTL. A missing id
// cannot be deduped, so it always shows.
function claimShow(messageId) {
    const now = Date.now();
    for (const [k, exp] of shownRecently) { if (exp <= now) shownRecently.delete(k); }
    if (!messageId) return true;
    if (shownRecently.has(messageId)) return false;
    shownRecently.set(messageId, now + DEDUP_TTL_MS);
    return true;
}

async function showChatNotification(payload) {
    const data = (payload && payload.data && typeof payload.data === "object") ? payload.data : {};
    // Dedup across channels first (synchronous claim above any await).
    if (!claimShow(data.messageId)) return;

    const title = (payload && payload.title) || "New message";
    const tag = (payload && payload.tag) || data.conversationId || "chat-message";
    const options = {
        body: (payload && payload.body) || "You have a new message",
        icon: SCOPE_PATH + "pwa-192x192.png",
        badge: SCOPE_PATH + "pwa-192x192.png",
        tag,               // one notification per conversation
        renotify: true,
        data,
    };
    // Belt-and-suspenders: also close any existing same-tag notification so a lingering prior one for
    // this conversation is replaced rather than stacked (OS tag-replace is unreliable on iOS).
    try {
        const existing = await self.registration.getNotifications({ tag });
        for (const n of existing) n.close();
    } catch (e) { /* getNotifications unsupported → rely on tag-replace */ }
    await self.registration.showNotification(title, options);
}

// OFFLINE channel: server Web Push.
self.addEventListener("push", (event) => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
    event.waitUntil(showChatNotification(payload));
});

// ONLINE channel: the live app asks the arbiter to render a notification (see notify.ts).
self.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "show-notification" && msg.payload) {
        event.waitUntil(showChatNotification(msg.payload));
    }
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
