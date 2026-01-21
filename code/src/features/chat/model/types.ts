// ===========================
// Domain: Message
// ===========================

export type MessageId = string;

export type ChatMessageStatus =
    | "pending"
    | "sending"
    | "sent"
    | "failed";


// ===========================
// Outbox bd layer
// ===========================

export type OutboxMessagePayload = {
    from: string;
    to: string;
    text: string;
}

export type OutboxMessage = {
    id: string;
    idempotencyKey: string;
    payload: OutboxMessagePayload;
    status: ChatMessageStatus;
};

export type OutboxState = {
    messages: OutboxMessage[];
    outboxVersion: number;
    persistedVersion: number;
};


// ===========================
// Chat UI
// ===========================

export type ChatMessageView = {
    id: MessageId;
    fromMe: boolean;
    text: string;
    status: ChatMessageStatus;
};

export type Contact = {
    id: string;
    name: string;
    last: string;
    email: string;
    online: boolean;
};

