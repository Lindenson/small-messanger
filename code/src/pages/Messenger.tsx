import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useSelector} from "react-redux";

import ChatList from "@/features/chat/ui/ChatList.tsx";
import ChatWindow from "@/features/chat/ui/ChatWindow.js";
import ConfirmModal from "@/widgets/modal/ConfirmModal.jsx";
import VideoCall from "@/features/call/ui/VideoCall";

import {useChat} from "@/features/chat/hooks";
import {useWebRTC} from "@/features/call/hooks";

import type {RootState} from "@/store/store.ts";
import type {FromOffer} from "@/features/call/model/types";

import {useWebSocketConnection} from "@/infrastructure/hooks/useWebSocketConnection.ts";
import {Toaster} from "react-hot-toast";


export default function Messenger() {
    const navigate = useNavigate();


    /* ======================
       WebRTC hook
    ====================== */
    const webRTC = useWebRTC();

    /* ======================
       Chat hook
    ====================== */
    const chat = useChat(
        { router: webRTC.dispatchMessages }
    );

    /* ======================
       Delete modal
    ====================== */
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    /* ======================
    Call status from Redux
    ====================== */
    const callStatus = useSelector((state: RootState) => state.call.status);

    /* ======================
    WebSocket connection
    ====================== */
    useWebSocketConnection();

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
                onCall={async () => {
                    if (peerContact) await webRTC.startCall(peerContact.id);
                }}
            />

            {/* ===== Video Call ===== */}
            {callStatus !== "idle" && (
                <VideoCall
                    localStream={webRTC.localStream}
                    remoteStream={webRTC.remoteStream}
                    onHangUp={webRTC.hangUp}
                    acceptCall={async (call: FromOffer) => await webRTC.handleOffer(call)}
                    rejectCall={(from: string) => webRTC.rejectCall(from)}
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
            <Toaster/>
        </div>
    );
}
