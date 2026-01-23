import React, {useEffect, useRef, useState} from "react";
import {useSelector} from "react-redux";
import ConfirmModal from "@/widgets/modal/ConfirmModal.jsx";


export default function VideoCall({
  localStream,
  remoteStream,
  onHangUp,
  acceptCall,
  rejectCall,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

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

  const callOffer = useSelector((state) => state.call.offer);
  const callFrom = useSelector((state) => state.call.peerId);
  const callStatus = useSelector((state) => state.call.status);
  const [newCall, setNewCall] = useState(true);

  if (newCall && callStatus === "ringing") {
    return (
      <ConfirmModal
        title="Llamada entrante"
        message={`Te está llamando  ${callFrom}`}
        confirmText="Aceptar"
        cancelText="Rechazar"
        onConfirm={() => {
          setNewCall(false);
          acceptCall({ from: callFrom, offer: callOffer });
        }}
        onCancel={() => rejectCall(callFrom)}
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
        className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full"
      >
        Finalizar llamada
      </button>
    </div>
  );
}
