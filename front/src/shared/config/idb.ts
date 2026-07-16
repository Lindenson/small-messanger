export const DB_NAME = 'chatDB';
export const STORE_NAME = 'outbox';
export const STORE_KEY = 'messages';
// Per-conversation history cache (keyed by chatId) — instant open + offline read.
export const HISTORY_STORE_NAME = 'history';
// Bumped to 2 to create the history object store (see db.ts upgrade).
export const DB_VERSION = 2;
