// Edge prefix under which the Hormigas Messenger is exposed on the Ory edge.
// On staging the messenger REST lives at `${origin}/messenger/api/**` and the WS at
// `${origin}/messenger/ws`. All calls are host-relative so the browser sends the
// existing Kratos session cookie (same-origin with the edge). Override per-env with
// VITE_MESSENGER_BASE (e.g. "" if the messenger is mounted at the origin root).
export const MESSENGER_BASE =
    (import.meta.env.VITE_MESSENGER_BASE as string | undefined) ?? "/messenger";

export const MESSENGER_API = `${MESSENGER_BASE}/api`;
export const MESSENGER_WS_PATH = `${MESSENGER_BASE}/ws`;

// IDS (KratosGate) admin directory for user search + admin chat creation. The edge route
// (host-relative, same origin) is provided by the platform; the frontend sends the admin key
// as X-Admin-Key. TEMPORARY concept-demo crutch — the key lives ONLY in the frontend .env and
// ships in the bundle; delete it after the demo. Override the path with VITE_IDS_URL.
export const MESSENGER_IDS_URL =
    (import.meta.env.VITE_IDS_URL as string | undefined) ?? "/ids";
export const IDS_ADMIN_KEY =
    (import.meta.env.VITE_IDS_ADMIN_KEY as string | undefined) ?? "";
