import {useEffect, useMemo, useRef, useState} from "react";
import {useSelector} from "react-redux";
import type {RootState} from "@/store/store.ts";
import {idsDisplayName, useGetIdsUsersQuery} from "@/features/directory/idsApi.ts";
import ConfirmModal from "@/widgets/modal/ConfirmModal.jsx";

interface VideoCallProps {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    onHangUp: () => void;
    acceptCall: () => void;
    rejectCall: () => void;
}

export default function VideoCall({
                                      localStream,
                                      remoteStream,
                                      onHangUp,
                                      acceptCall,
                                      rejectCall,
                                  }: VideoCallProps) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    const callFrom = useSelector((state: RootState) => state.call.peerId);
    const callStatus = useSelector((state: RootState) => state.call.status);

    // Resolve the caller's display name from the IDS directory (peerId is a user id).
    const {data: idsUsers = []} = useGetIdsUsersQuery();
    const callerName = useMemo(() => {
        const u = idsUsers.find((x) => x.id === callFrom);
        return u ? idsDisplayName(u) : (callFrom ?? "");
    }, [idsUsers, callFrom]);

    const [newCall, setNewCall] = useState(true);

    if (newCall && callStatus === "ringing") {
        return (
            <ConfirmModal
                title="Llamada entrante"
                message={`Te está llamando ${callerName}`}
                confirmText="Aceptar"
                cancelText="Rechazar"
                onConfirm={() => {
                    setNewCall(false);
                    acceptCall();
                }}
                onCancel={() => {
                    if (callFrom) {
                        rejectCall();
                    }
                }}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex">
            <video
                autoPlay
                muted
                playsInline
                ref={localVideoRef}
                className="w-1/4 absolute bottom-4 right-4 rounded-lg"
            />
            <video
                autoPlay
                playsInline
                ref={remoteVideoRef}
                className="w-full h-full object-cover"
            />
            <button
                onClick={onHangUp}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full hover:bg-red-700 transition-colors"
            >
                Finalizar llamada
            </button>
        </div>
    );
}