export const TURN_HOST = window.location.hostname;

export const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: `turn:${TURN_HOST}:3478`,
            username: "user",
            credential: "pass",
        },
    ],
};