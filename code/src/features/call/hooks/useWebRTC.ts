import {useCallback, useRef, useState} from "react";
import {ICE_SERVERS} from "@/shared/config/webrtc";
import type {
    FromAnswer,
    FromCandidate,
    FromOffer,
    IncomingWebRTCMessage,
    OutgoingWebRTCMessage
} from "@/features/call/model/types.ts";
import {logger} from "@/shared/logger/logger.ts";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "@/store/store.ts";
import type {WSDispatcher, WSMessage} from "@/infrastructure/types.ts";
import toast from "react-hot-toast";


export function useWebRTC() {
    /* ======================
       Refs (NOT reactive)
    ====================== */
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const remotePeerIdRef = useRef<string | null>(null);
    const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteReadyRef = useRef(false);

    /* ======================
       State (reactive)
    ====================== */
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    /* ======================
       Storage
    ====================== */
    const dispatch = useDispatch<AppDispatch>();

    /* ======================
       WS send
    ====================== */
    const send = useCallback(
        (data: OutgoingWebRTCMessage) => {
            dispatch?.({type: "ws/send", payload: data});
        },
        [dispatch]
    );

    /* ======================
       Error handler
    ====================== */
    const exceptionHandler = (ex: Error) => logger.error(ex.message, ex);

    const handleInitError = useCallback((err: unknown) => {
            logger.error("WebRTC init failed", err);

            toast.error(
                err instanceof DOMException
                    ? err.message
                    : "Cannot start video call"
            );

            remotePeerIdRef.current = null;
            remoteReadyRef.current = false;
            pendingIceRef.current = [];

            pcRef.current?.close();
            pcRef.current = null;

            localStreamRef.current?.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;

            setLocalStream(null);
            setRemoteStream(null);

            dispatch({type: "call/localEnd"});
        }, [dispatch]
    );


    /* ======================
       Init peer connection
    ====================== */
    const init = useCallback(async () => {
        if (pcRef.current) return;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });

        localStreamRef.current = stream;
        setLocalStream(stream); // 🔥 UI теперь знает о стриме

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.ontrack = (e) => {
            setRemoteStream(e.streams[0]);
        };

        pc.onicecandidate = (e) => {
            if (!e.candidate || !remotePeerIdRef.current) return;

            send({
                type: "call:ice",
                to: remotePeerIdRef.current,
                candidate: e.candidate,
            });
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                dispatch?.({type: "call/webrtcConnected"});
            }

            if (
                pc.connectionState === "failed" ||
                pc.connectionState === "disconnected"
            ) {
                dispatch?.({type: "call/incomingRemoteEnd"});
            }
        };
    }, [dispatch, send]);

    /* ======================
       Start call (caller)
    ====================== */
    const startCall = useCallback(
        async (peerId: string) => {
            if (pcRef.current) return; // 🔒 уже в звонке
            logger.debug("video call starting with", peerId);
            dispatch?.({type: "call/outgoingCall", payload: peerId});

            remotePeerIdRef.current = peerId;
            await init().catch((err) => {
                handleInitError(err);
                return;
            })

            if (!pcRef.current) return;
            const pc: RTCPeerConnection = pcRef.current;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            send({
                type: "call:offer",
                to: peerId,
                offer,
            });
        },
        [dispatch, handleInitError, init, send]
    );

    /* ======================
       Handle offer (callee)
    ====================== */
    const handleOffer = useCallback(
        async ({from, offer}: FromOffer) => {
            if (pcRef.current) {
                // ❌ уже в соединении — auto-reject
                send({type: "call:end", to: from});
                return;
            }
            logger.debug("video call accepting offer");
            dispatch?.({type: "call/acceptCall"});

            remotePeerIdRef.current = from;
            await init();

            if (!pcRef.current) return;
            const pc: RTCPeerConnection = pcRef.current;
            await pc.setRemoteDescription(offer);
            remoteReadyRef.current = true;

            for (const c of pendingIceRef.current) {
                await pc.addIceCandidate(c);
            }
            pendingIceRef.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            send({
                type: "call:answer",
                to: from,
                answer,
            });
        },
        [dispatch, init, send]
    );

    /* ======================
       Handle answer
    ====================== */
    const handleAnswer = useCallback(async ({from, answer}: FromAnswer) => {
        if (!pcRef.current) return;
        if (pcRef.current.signalingState !== "have-local-offer") return;
        logger.debug("video call handling answer");

        remotePeerIdRef.current = from;
        await pcRef.current.setRemoteDescription(answer);
        remoteReadyRef.current = true;

        for (const c of pendingIceRef.current) {
            await pcRef.current.addIceCandidate(c);
        }
        pendingIceRef.current = [];
    }, []);

    /* ======================
       Add ICE candidate
    ====================== */
    const addIce = useCallback(async ({from, candidate}: FromCandidate) => {
        if (!candidate) return;

        remotePeerIdRef.current ??= from;

        if (!pcRef.current || !remoteReadyRef.current) {
            pendingIceRef.current.push(candidate);
            return;
        }

        await pcRef.current.addIceCandidate(candidate);
    }, []);

    /* ======================
       End call (local cleanup)
    ====================== */
    const endCall = useCallback(() => {
        if (!pcRef.current) return;

        remotePeerIdRef.current = null;
        remoteReadyRef.current = false;
        pendingIceRef.current = [];

        pcRef.current?.close();
        pcRef.current = null;

        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;

        setLocalStream(null);
        setRemoteStream(null);
    }, []);

    /* ======================
       Hang up
    ====================== */
    const hangUp = useCallback(() => {
        if (remotePeerIdRef.current) {
            send({
                type: "call:end",
                to: remotePeerIdRef.current,
            });
        }
        endCall();
        dispatch?.({type: "call/localEnd"});
    }, [dispatch, endCall, send]);

    /* ======================
       Reject call
    ====================== */
    const rejectCall = useCallback(
        (from: string) => {
            send({type: "call:end", to: from});
            dispatch?.({type: "call/localEnd"});
        },
        [dispatch, send]
    );

    /* ======================
       WS dispatcher
    ====================== */
    const dispatchMessages: WSDispatcher = useCallback(
        (data: WSMessage) => {
            if (!isIncomingWebRTCMessage(data)) return;
            if (data.type === "call:answer") handleAnswer(data).catch(exceptionHandler);
            if (data.type === "call:ice") addIce(data).catch(exceptionHandler);
            if (data.type === "call:end") endCall();
        },
        [addIce, endCall, handleAnswer]
    );

    const isIncomingWebRTCMessage = (d: WSMessage): d is IncomingWebRTCMessage =>
        typeof d?.type === "string" &&
        d.type.startsWith("call:");


    /* ======================
       API
    ====================== */
    return {
        localStream,
        remoteStream,
        startCall,
        hangUp,
        handleOffer,
        rejectCall,
        dispatchMessages,
        send,
    };
}
