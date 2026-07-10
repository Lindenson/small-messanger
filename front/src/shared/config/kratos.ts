// Ory Kratos public API. On the Hormigas edge it is served at `/.ory/kratos/public`
// (same origin as the app, so the existing session cookie applies). Override with
// VITE_KRATOS_URL if the edge mounts it elsewhere.
export const kratosUrl =
    (import.meta.env.VITE_KRATOS_URL as string | undefined) ?? '/.ory/kratos/public';