import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IncomingWebRTCMessage } from "@/features/call/model/types.ts";
import {
    incomingAnswer,
    incomingOffer,
    incomingRemoteEnd,
    webrtcConnected,
} from "@/features/call/model/slices/callSlice.js";
import { createCallMiddleware } from "../callMiddleware";
import type { WebRTCService } from "@/features/call/service/webRTCService";

describe("callMiddleware", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let store: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let next: any;
    let webRTCService: WebRTCService;
    let middleware: ReturnType<typeof createCallMiddleware>;

    beforeEach(() => {
        store = {
            dispatch: vi.fn(),
            getState: vi.fn(() => ({
                call: {
                    incomingOfferData: { from: "peerX", offer: {} },
                    peerId: "peerY",
                    status: "idle",
                },
            })),
        };
        next = vi.fn();

        webRTCService = {
            startCall: vi.fn(() => Promise.resolve()),
            handleOffer: vi.fn(() => Promise.resolve()),
            handleAnswer: vi.fn(() => Promise.resolve()),
            addIce: vi.fn(() => Promise.resolve()),
            hangUp: vi.fn(),
            rejectCall: vi.fn(),
            getConnectionState: vi.fn(() => null),
        } as unknown as WebRTCService;

        middleware = createCallMiddleware(webRTCService);
    });

    it("passes action through next", () => {
        const action = { type: "any/action" };
        middleware(store)(next)(action);
        expect(next).toHaveBeenCalledWith(action);
    });

    it("ws/incoming: call:offer диспатчит incomingOffer", () => {
        const msg: IncomingWebRTCMessage = { type: "call:offer", from: "peer1", offer: {} as RTCSessionDescriptionInit};
        middleware(store)(next)({ type: "ws/incoming", payload: msg });
        expect(store.dispatch).toHaveBeenCalledWith(
            incomingOffer({ from: "peer1", offer: {} as RTCSessionDescriptionInit})
        );
    });

    it("ws/incoming: call:answer вызывает handleAnswer и диспатчит incomingAnswer", async () => {
        const msg: IncomingWebRTCMessage = { type: "call:answer", from: "peer2", answer: {} as RTCSessionDescriptionInit};
        await middleware(store)(next)({ type: "ws/incoming", payload: msg });
        expect(webRTCService.handleAnswer).toHaveBeenCalledWith(msg);
        expect(store.dispatch).toHaveBeenCalledWith(incomingAnswer());
    });

    it("ws/incoming: call:ice вызывает addIce", async () => {
        const msg: IncomingWebRTCMessage = { type: "call:ice", from: "peer3", candidate: {} };
        await middleware(store)(next)({ type: "ws/incoming", payload: msg });
        expect(webRTCService.addIce).toHaveBeenCalledWith(msg);
    });

    it("ws/incoming: call:end вызывает hangUp и диспатчит incomingRemoteEnd", () => {
        const msg: IncomingWebRTCMessage = { type: "call:end", from: "peer4" };
        middleware(store)(next)({ type: "ws/incoming", payload: msg });
        expect(webRTCService.hangUp).toHaveBeenCalled();
        expect(store.dispatch).toHaveBeenCalledWith(incomingRemoteEnd());
    });

    it("call/outgoingCall вызывает startCall", async () => {
        const action = { type: "call/outgoingCall", payload: "peer5" };
        await middleware(store)(next)(action);
        expect(webRTCService.startCall).toHaveBeenCalledWith("peer5");
    });

    it("call/acceptCall вызывает handleOffer если есть incomingOfferData", async () => {
        const action = { type: "call/acceptCall" };
        await middleware(store)(next)(action);
        expect(webRTCService.handleOffer).toHaveBeenCalledWith({ from: "peerX", offer: {} });
    });

    it("call/localEnd вызывает hangUp", () => {
        const action = { type: "call/localEnd" };
        middleware(store)(next)(action);
        expect(webRTCService.hangUp).toHaveBeenCalled();
    });

    it("call/rejectCall вызывает rejectCall с peerId", () => {
        const action = { type: "call/rejectCall" };
        middleware(store)(next)(action);
        expect(webRTCService.rejectCall).toHaveBeenCalledWith("peerY");
    });

    it("getConnectionState === 'connected' диспатчит webrtcConnected", () => {
        // @ts-expect-error/for testing
        webRTCService.getConnectionState = vi.fn(() => "connected");
        middleware(store)(next)({ type: "any/action" });
        expect(store.dispatch).toHaveBeenCalledWith(webrtcConnected());
    });
});
