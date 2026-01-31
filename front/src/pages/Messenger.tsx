import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";

import ChatList from "@/features/chat/ui/ChatList.tsx";
import ChatWindow from "@/features/chat/ui/ChatWindow.js";
import ConfirmModal from "@/widgets/modal/ConfirmModal.jsx";
import VideoCall from "@/features/call/ui/VideoCall.tsx";
import {useChat} from "@/features/chat/hooks";

import type {RootState, AppDispatch} from "@/store/store.ts";
import {outgoingCall, acceptCall, localEnd, rejectCall} from "@/features/call/model/slices/callSlice";
import {useWebRTC} from "@/features/call/hooks/useWebRTC.ts";


export default function Messenger() {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();

    /* ======================
       WebRTC service
    ====================== */
    const {localStream, remoteStream} = useWebRTC(); // 🔥
    /* ======================
       Chat service
    ====================== */
    const chat = useChat();

    /* ======================
       Delete modal
    ====================== */
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    /* ======================
       Call status from Redux
    ====================== */
    const callStatus = useSelector((state: RootState) => state.call.status);

    /* ======================
       Derived
    ====================== */
    const peerContact = chat.selectedChat ?? null;
    const myName = useSelector((state: RootState) => state.user.name);

    /* ======================
       Render
    ====================== */
    return (
        <div className="h-dvh w-screen flex overflow-hidden bg-gray-300">
            {/* ===== Chat List ===== */}
            <ChatList
                chats={chat.filteredChats}
                openChat={chat.openChat}
                unreadChats={chat.unreadChats}
                search={chat.searchQuery}
                setSearch={chat.setSearchQuery}
                myName={myName}
                onLogout={() => navigate("/logout")}
            />

            {/* ===== Chat Window ===== */}
            <ChatWindow
                chat={chat.selectedChat}
                messages={chat.messages}
                inputText={chat.messageInput}
                setInputText={chat.setMessageInput}
                sendMessage={chat.sendMessage}
                onDeleteChat={() => setShowDeleteModal(true)}
                onCall={() => {
                    // 🔥 Dispatch action instead of calling webRTC directly
                    if (peerContact) {
                        dispatch(outgoingCall(peerContact.id));
                    }
                }}
            />

            {/* ===== Video Call ===== */}
            {callStatus !== "idle" && (
                <VideoCall
                    localStream={localStream}
                    remoteStream={remoteStream}
                    onHangUp={() => dispatch(localEnd())}
                    acceptCall={() => dispatch(acceptCall())}
                    rejectCall={() => dispatch(rejectCall())}
                />
            )}

            {/* ===== Delete Confirmation Modal ===== */}
            {showDeleteModal && peerContact && (
                <ConfirmModal
                    title="Eliminar chat"
                    message={`¿Eliminar historial con ${peerContact.name}?`}
                    confirmText="Eliminar"
                    cancelText="Cancelar"
                    onCancel={() => setShowDeleteModal(false)}
                    onConfirm={async () => {
                        await chat.deleteChat();
                        setShowDeleteModal(false);
                    }}
                />
            )}
        </div>
    );
}