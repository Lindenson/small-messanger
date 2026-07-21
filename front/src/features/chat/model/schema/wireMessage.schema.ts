import { z } from "zod";

/**
 * The Hormigas backend wire frame (`Message`). Every WS frame and every history row is
 * one of these. We keep it permissive (`.passthrough()`) — the backend may add fields.
 */
export const WireMessageSchema = z
    .object({
        type: z.string(),
        id: z.number().optional(),            // outbox row id → becomes ackId on CHAT_ACK
        ackId: z.number().optional(),
        senderId: z.string().optional(),
        recipientId: z.string().optional(),
        conversationId: z.string().optional(),
        messageId: z.string().optional(),     // server-assigned ULID (dedup + history cursor)
        serverMessageId: z.string().optional(), // on CHAT_ACK: the STORED message's ULID (vs messageId = the ack frame's own id)
        correlationId: z.string().optional(),
        senderTimestamp: z.number().optional(),
        senderTimezone: z.string().optional(),
        serverTimestamp: z.number().optional(),
        sequenceNumber: z.number().optional(),
        payload: z
            .object({ kind: z.string().optional(), body: z.string().optional() })
            .passthrough()
            .optional(),
        meta: z.record(z.string(), z.string()).optional(),
    })
    .passthrough();

export type WireMessage = z.infer<typeof WireMessageSchema>;

export function parseWireMessage(data: unknown): WireMessage | null {
    const r = WireMessageSchema.safeParse(data);
    return r.success ? r.data : null;
}

/** Build a `CHAT_IN` frame. The server overwrites `senderId` from the session identity. */
export function buildChatIn(p: {
    conversationId: string;
    recipientId: string;
    messageId: string;
    body: string;
    meta?: Record<string, string>;
}): WireMessage {
    return {
        type: "CHAT_IN",
        conversationId: p.conversationId,
        recipientId: p.recipientId,
        messageId: p.messageId,
        senderTimestamp: Date.now(),
        senderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        payload: { kind: "text", body: p.body },
        ...(p.meta ? { meta: p.meta } : {}),
    };
}

function newId(): string {
    try { return crypto.randomUUID(); } catch { return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2); }
}
function tz(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }

/**
 * Acknowledge a delivered `CHAT_OUT` (SENT → DELIVERED; advances the GC watermark).
 * The backend validates ALL inbound frames, so an ACK needs the full id set + timestamp, not just
 * correlationId/ackId — otherwise it is silently rejected and the message is redelivered forever.
 */
export function buildChatAck(delivered: WireMessage): WireMessage {
    return {
        type: "CHAT_ACK",
        messageId: newId(),
        recipientId: delivered.senderId,        // the ACK goes back to the original sender
        conversationId: delivered.conversationId,
        correlationId: delivered.messageId,     // the delivered server message id
        ackId: delivered.id,                    // outbox row id (advances the watermark)
        senderTimestamp: Date.now(),
        senderTimezone: tz(),
    };
}

/**
 * Read receipt (DELIVERED → READ; pushes READ_OUT to the peer). Same full-frame requirement.
 *
 * The server records `messageId` verbatim as this reader's read boundary ({client,master}ReadReceipt
 * in GET /chats), which the PEER uses to render ✓✓. So `messageId` MUST be the id (a server ULID) of
 * the last message the reader has read — pass `lastReadMessageId`. Falls back to a fresh id only when
 * none is known (e.g. an empty chat), which records no meaningful boundary but keeps the frame valid.
 */
export function buildReadIn(conversationId: string, recipientId: string, lastReadMessageId?: string): WireMessage {
    return {
        type: "READ_IN",
        // The backend stores THIS frame's messageId verbatim as the reader's read receipt
        // (conversation.{client,master}_read_receipt → GET /chats), and the PEER compares it against
        // message ids to render ✓✓. So messageId MUST be the boundary — the server ULID of the last
        // message read — pointing into the SAME id space as messages. Sending newId() here stored a
        // meaningless random UUID (not comparable to any message id), which is why the durable
        // receipt never resolved to ✓✓. Fall back to a fresh id only for an empty chat (no boundary).
        messageId: lastReadMessageId ?? newId(),
        correlationId: lastReadMessageId,
        recipientId,
        conversationId,
        senderTimestamp: Date.now(),
        senderTimezone: tz(),
    };
}

/** Typing indicator (Strategy S; delivered live as TYPING_OUT, never stored). Needs a valid payload. */
export function buildTypingIn(conversationId: string, recipientId: string): WireMessage {
    return {
        type: "TYPING_IN",
        messageId: newId(),
        recipientId,
        conversationId,
        senderTimestamp: Date.now(),
        senderTimezone: tz(),
        payload: { kind: "event", body: "typing" },
    };
}
