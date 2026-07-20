// Message-list windowing: render only the most recent N bubbles to cap DOM nodes on long
// histories (the history page can be up to 200). "Show earlier messages" reveals another step.
// This is dependency-free virtualization tuned for chat UX (you almost always view the tail).
export const MESSAGE_WINDOW_INITIAL = 60;
export const MESSAGE_WINDOW_STEP = 60;

// History is fetched by forward pages (cursor = last messageId): the backend only supports
// message_id > since (ASC), so a single `limit` request returns the OLDEST page and would hide
// newer messages on long chats. We page forward and accumulate the whole history, capped at
// HISTORY_MAX_PAGES to bound pathological loads. Rendering is still windowed (MESSAGE_WINDOW_*).
export const HISTORY_PAGE_SIZE = 200;
export const HISTORY_MAX_PAGES = 25;

// Max attachment size accepted client-side (before requesting a presigned upload URL).
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
