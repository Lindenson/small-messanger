import {useEffect, useState} from "react";
import {webRTCService} from "@/features/call/service/webRTCService";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "@/store/store.ts";

export function useWebRTC() {
    const dispatch = useDispatch<AppDispatch>();

    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        // 🔥 Инжектим dispatch и callbacks в service
        webRTCService.setStreamCallbacks(setLocalStream, setRemoteStream);
    }, [dispatch]);

    return {
        localStream,
        remoteStream,
    };
}