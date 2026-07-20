// Message-list windowing: render only the most recent N bubbles to cap DOM nodes on long
// histories (the history page can be up to 200). "Show earlier messages" reveals another step.
// This is dependency-free virtualization tuned for chat UX (you almost always view the tail).
export const MESSAGE_WINDOW_INITIAL = 60;
export const MESSAGE_WINDOW_STEP = 60;

// History pagination. The backend serves the NEWEST page by default (or `?before=<id>` for the
// page immediately older, ASC), plus `?since=<id>` for a forward reconnect catch-up. So we load
// the latest page on open and pull older pages on demand (scroll-up / "show earlier"). Rendering
// is windowed on top of the loaded set (MESSAGE_WINDOW_*).
export const HISTORY_PAGE_SIZE = 200;

// Max attachment size accepted client-side (before requesting a presigned upload URL).
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
