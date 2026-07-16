// Configurable at-least-once delivery for the chat outbox.
//
// A queued message stays in the outbox until the server confirms it with a CHAT_ACK
// (matched by correlationId === the client messageId, which removes it). Sends are idempotent
// on messageId, so re-sending the same queued frame is safe. The retry driver re-sends a message
// that hasn't been ACKed within ACK_TIMEOUT, up to MAX_ATTEMPTS, after which it is marked failed.
export const OUTBOX_RETRY_MAX_ATTEMPTS = 6;

// No CHAT_ACK within this window after a send attempt → the message is retried on the next tick.
export const OUTBOX_RETRY_ACK_TIMEOUT_MS = 8_000;

// How often the retry driver re-checks the queue (also the resend cadence for timed-out messages).
export const OUTBOX_RETRY_TICK_MS = 3_000;
