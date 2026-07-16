import {describe, it, expect, vi} from "vitest";
import {flushOutbox} from "../sendOutboxThunk";
import {OUTBOX_RETRY_MAX_ATTEMPTS} from "@/shared/config/outbox";

// Duplicate-safe resend: the backend assigns its own messageId and does NOT dedupe by the client
// messageId, so a message already sent on the current connection epoch must NOT be re-sent.
type Msg = {
    id: string; idempotencyKey: string; payload: unknown; status: string;
    attempts: number; sentEpoch?: number;
};

function run(state: { ws: { status: string; epoch: number }; outbox: { messages: Msg[] } }) {
    const dispatch = vi.fn((a) => a);
    const getState = () => state;
    // Invoke the thunk directly with a mocked store API.
    return flushOutbox()(dispatch as never, getState as never, undefined).then(() => dispatch);
}

const sends = (d: ReturnType<typeof vi.fn>) =>
    d.mock.calls.map((c) => c[0]).filter((a) => a?.type === "ws/send");
const marksSending = (d: ReturnType<typeof vi.fn>) =>
    d.mock.calls.map((c) => c[0]).filter((a) => a?.type === "outbox/markSending");
const marksFailed = (d: ReturnType<typeof vi.fn>) =>
    d.mock.calls.map((c) => c[0]).filter((a) => a?.type === "outbox/markFailed");

const msg = (over: Partial<Msg> = {}): Msg => ({
    id: "m1", idempotencyKey: "m1", payload: {type: "CHAT_IN"}, status: "pending", attempts: 0, ...over,
});

describe("flushOutbox (duplicate-safe, once-per-epoch)", () => {
    it("does nothing when disconnected", async () => {
        const d = await run({ws: {status: "disconnected", epoch: 3}, outbox: {messages: [msg()]}});
        expect(sends(d)).toHaveLength(0);
        expect(marksSending(d)).toHaveLength(0);
    });

    it("sends a pending message and stamps the current epoch", async () => {
        const d = await run({ws: {status: "connected", epoch: 5}, outbox: {messages: [msg()]}});
        expect(sends(d)).toHaveLength(1);
        expect(marksSending(d)[0].payload).toMatchObject({id: "m1", epoch: 5});
    });

    it("does NOT resend a message already sent on the current epoch (avoids duplicate)", async () => {
        const d = await run({
            ws: {status: "connected", epoch: 5},
            outbox: {messages: [msg({status: "sending", attempts: 1, sentEpoch: 5})]},
        });
        expect(sends(d)).toHaveLength(0);
        expect(marksSending(d)).toHaveLength(0);
    });

    it("resends an un-ACKed message after a reconnect (newer epoch)", async () => {
        const d = await run({
            ws: {status: "connected", epoch: 6},
            outbox: {messages: [msg({status: "sending", attempts: 1, sentEpoch: 5})]},
        });
        expect(sends(d)).toHaveLength(1);
        expect(marksSending(d)[0].payload).toMatchObject({id: "m1", epoch: 6});
    });

    it("gives up (markFailed) once attempts hit the cap, without sending", async () => {
        const d = await run({
            ws: {status: "connected", epoch: 9},
            outbox: {messages: [msg({status: "sending", attempts: OUTBOX_RETRY_MAX_ATTEMPTS, sentEpoch: 1})]},
        });
        expect(sends(d)).toHaveLength(0);
        expect(marksFailed(d)[0].payload).toBe("m1");
    });

    it("skips sent/failed messages", async () => {
        const d = await run({
            ws: {status: "connected", epoch: 2},
            outbox: {messages: [msg({status: "sent"}), msg({id: "m2", status: "failed"})]},
        });
        expect(sends(d)).toHaveLength(0);
    });
});
