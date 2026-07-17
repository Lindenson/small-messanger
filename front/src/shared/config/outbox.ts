// Configurable delivery for the chat outbox.
//
// A queued message stays in the outbox until the server confirms it with a CHAT_ACK (matched by
// correlationId === the client messageId, which removes it). Because the backend does NOT dedupe by
// the client messageId (it assigns its own), resends must be duplicate-safe: the outbox re-sends an
// un-ACKed message AT MOST ONCE PER CONNECTION EPOCH (i.e. only after a reconnect — see
// sendOutboxThunk). MAX_ATTEMPTS caps the number of connection-epoch attempts before the message is
// marked failed; TICK is how often the retry driver re-checks the queue.
export const OUTBOX_RETRY_MAX_ATTEMPTS = 6;

export const OUTBOX_RETRY_TICK_MS = 3_000;

// If a message stays "sending" on a LIVE connection this long without a CHAT_ACK (lost ACK, or a
// blocked/rejected send), stop showing 🕐 forever — mark it failed so the UI shows ⚠ + retry.
export const OUTBOX_SEND_TIMEOUT_MS = 20_000;
