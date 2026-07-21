import {describe, it, expect, vi, beforeEach} from "vitest";
import {chatMiddleware} from "../chatMiddleware";
import {setPeerLastReadId} from "@/features/chat/model/slices/chatUiSlice";

const ULID = "01KY29D4BHHB40EW2FKMHR6V7M";

describe("chatMiddleware — READ_OUT (live ✓✓ watermark)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let store: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let next: any;

    beforeEach(() => {
        store = {
            dispatch: vi.fn(),
            getState: vi.fn(() => ({user: {id: "me"}, chatUi: {selectedChatId: "c1"}})),
        };
        next = vi.fn();
    });

    it("advances the peer read boundary from READ_OUT.correlationId (a server ULID)", () => {
        const frame = {type: "READ_OUT", conversationId: "c1", correlationId: ULID};
        chatMiddleware(store)(next)({type: "ws/incoming", payload: frame});
        expect(store.dispatch).toHaveBeenCalledWith(setPeerLastReadId({chatId: "c1", lastReadId: ULID}));
        expect(next).toHaveBeenCalled();
    });

    it("ignores a READ_OUT with no boundary (correlationId absent)", () => {
        const frame = {type: "READ_OUT", conversationId: "c1"};
        chatMiddleware(store)(next)({type: "ws/incoming", payload: frame});
        expect(store.dispatch).not.toHaveBeenCalledWith(
            expect.objectContaining({type: setPeerLastReadId.type})
        );
    });

    it("passes non-ws actions through untouched", () => {
        const action = {type: "some/action"};
        chatMiddleware(store)(next)(action);
        expect(next).toHaveBeenCalledWith(action);
    });
});
