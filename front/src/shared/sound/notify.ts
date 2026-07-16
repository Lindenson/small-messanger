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

/** Show a desktop notification if allowed (used when the tab is hidden). */
export function showDesktopNotification(title: string, body: string) {
    try {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, {body});
        }
    } catch { /* ignore */ }
}
