import {beforeEach, describe, expect, it, type Mock, vi} from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWebRTC } from "../useWebRTC";
import toast from "react-hot-toast";

// ======================
// Mocks
// ======================

const dispatchMock = vi.fn();
vi.mock("react-redux", () => ({
    useDispatch: () => dispatchMock,
}));


vi.mock("react-hot-toast", () => ({
    default: {
        error: vi.fn(),
        loading: vi.fn(),
        dismiss: vi.fn(),
    },
}));

class MockRTCPeerConnection {
    connectionState = "new";
    ontrack: unknown = null;
    onicecandidate: unknown = null;
    onconnectionstatechange: unknown = null;
    addTrack = vi.fn();
    createOffer = vi.fn().mockResolvedValue({ sdp: "offer-sdp", type: "offer" });
    setLocalDescription = vi.fn().mockResolvedValue(undefined);
    setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    createAnswer = vi.fn().mockResolvedValue({ sdp: "answer-sdp", type: "answer" });
    addIceCandidate = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
}
(global as { RTCPeerConnection: unknown }).RTCPeerConnection = MockRTCPeerConnection;

Object.defineProperty(global.navigator, "mediaDevices", {
    value: {
        getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }],
        }),
    },
});

// ======================
// Tests
// ======================

describe("useWebRTC hooks", () => {
    beforeEach(() => {
        dispatchMock.mockClear();
        (toast.error as Mock).mockClear();
        (navigator.mediaDevices.getUserMedia as Mock).mockClear();
    });

    it("should start a call successfully", async () => {
        const { result } = renderHook(() => useWebRTC());

        await waitFor(async () => {
            await result.current.startCall("peer1");
            expect(result.current.localStream).not.toBeNull();
        });

        expect(dispatchMock).toHaveBeenCalledWith({
            type: "call/outgoingCall",
            payload: "peer1",
        });

        expect(dispatchMock).toHaveBeenCalledWith({
            type: "ws/send",
            payload: { type: "call:offer", to: "peer1", offer: { sdp: "offer-sdp", type: "offer" } },
        });
    });

    it("should handle getUserMedia failure", async () => {
        (navigator.mediaDevices.getUserMedia as Mock).mockRejectedValueOnce(
            new DOMException("Permission denied")
        );

        const { result } = renderHook(() => useWebRTC());

        await waitFor(async () => {
            await result.current.startCall("peer2");
        });

        expect(toast.error).toHaveBeenCalledWith("Permission denied");

        expect(result.current.localStream).toBeNull();

        expect(dispatchMock).toHaveBeenCalledWith({ type: "call/localEnd" });
    });

    it("should hang up the call", async () => {
        const { result } = renderHook(() => useWebRTC());

        await waitFor(async () => {
            await result.current.startCall("peer3");
        });

        await waitFor(async () => {
            result.current.hangUp();
        });

        expect(result.current.localStream).toBeNull();
        expect(result.current.remoteStream).toBeNull();
        expect(dispatchMock).toHaveBeenCalledWith({ type: "call/localEnd" });
    });

    it("should reject a call", () => {
        const { result } = renderHook(() => useWebRTC());

        waitFor(() => {
            result.current.rejectCall("peer4");
        });

        expect(dispatchMock).toHaveBeenCalledWith({ type: "call/localEnd" });
        expect(dispatchMock).toHaveBeenCalledWith({
            type: "ws/send",
            payload: { type: "call:end", to: "peer4" },
        });
    });

    it("should not start a call if already in a call", async () => {
        const { result } = renderHook(() => useWebRTC());

        await waitFor(async () => {
            await result.current.startCall("peer5");
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pcBefore = (result.current as any).pcRef;

        await waitFor(async () => {
            await result.current.startCall("peer5");
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pcAfter = (result.current as any).pcRef;

        // Проверяем, что pcRef не изменился
        expect(pcAfter).toBe(pcBefore);
    });
});
