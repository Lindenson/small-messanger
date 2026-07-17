// TURN/STUN must hit the ORIGIN host directly (coturn on 91.99.6.25:3478), NOT the
// Cloudflare-proxied hostname (CF only proxies HTTP). Override per-env with VITE_TURN_*.
const TURN_HOST = (import.meta.env.VITE_TURN_HOST as string | undefined) ?? "91.99.6.25";
const TURN_USER = (import.meta.env.VITE_TURN_USER as string | undefined) ?? "user";
const TURN_PASS = (import.meta.env.VITE_TURN_PASS as string | undefined) ?? "pass";

// If an outgoing call isn't answered/connected within this window, give up (end + toast) instead
// of leaving the caller on a black screen forever.
export const CALL_TIMEOUT_MS = 30_000;

export const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: `stun:${TURN_HOST}:3478` },
        {
            urls: [
                `turn:${TURN_HOST}:3478?transport=udp`,
                `turn:${TURN_HOST}:3478?transport=tcp`,
            ],
            username: TURN_USER,
            credential: TURN_PASS,
        },
    ],
};
