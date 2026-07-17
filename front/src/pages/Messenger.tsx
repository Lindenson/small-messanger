import {useCallback, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {useTranslation} from "react-i18next";

import ChatList from "@/features/chat/ui/ChatList.tsx";
import ChatWindow from "@/features/chat/ui/ChatWindow.js";
import {ConnectionBanner} from "@/features/chat/ui/ConnectionBanner.tsx";
import ConfirmModal from "@/widgets/modal/ConfirmModal.jsx";
import VideoCall from "@/features/call/ui/VideoCall.tsx";
import {useChat} from "@/features/chat/hooks";
import {useOutboxRetry} from "@/features/chat/hooks/useOutboxRetry.ts";

import type {RootState, AppDispatch} from "@/store/store.ts";
import {outgoingCall, acceptCall, localEnd, rejectCall} from "@/features/call/model/slices/callSlice";
import {useWebRTC} from "@/features/call/hooks/useWebRTC.ts";


export default function Messenger() {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const {t} = useTranslation();

    // Periodic outbox retry driver (ACK-timeout resend).
    useOutboxRetry();

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

    // Stable callbacks so the memoized ChatList/ChatWindow don't re-render on unrelated state.
    const selectedCounterpartId = chat.selectedCounterpartId;
    const onLogout = useCallback(() => navigate("/logout"), [navigate]);
    const onOpenDeleteModal = useCallback(() => setShowDeleteModal(true), []);
    const onCall = useCallback(() => {
        // Call the counterpart's USER id (signaling recipient), not the conversationId.
        if (selectedCounterpartId) dispatch(outgoingCall(selectedCounterpartId));
    }, [selectedCounterpartId, dispatch]);

    /* ======================
       Render
    ====================== */
    return (
        <div className="relative h-dvh w-screen flex overflow-hidden bg-gray-300">
            <ConnectionBanner/>
            {/* ===== Chat List ===== */}
            <ChatList
                chats={chat.filteredChats}
                openChat={chat.openChat}
                unreadChats={chat.unreadChats}
                search={chat.searchQuery}
                setSearch={chat.setSearchQuery}
                myName={myName}
                onLogout={onLogout}
            />

            {/* ===== Chat Window ===== */}
            <ChatWindow
                chat={chat.selectedChat}
                messages={chat.messages}
                inputText={chat.messageInput}
                setInputText={chat.setMessageInput}
                sendMessage={chat.sendMessage}
                onTyping={chat.notifyTyping}
                onToggleBlock={chat.toggleBlock}
                blocked={chat.selectedBlocked}
                blockedByMe={chat.selectedBlockedByMe}
                blockedByPeer={chat.selectedBlockedByPeer}
                onDeleteMessage={chat.deleteMessage}
                onSendAttachment={chat.sendAttachment}
                onDownloadAttachment={chat.downloadAttachment}
                onResolveAttachment={chat.getAttachmentUrl}
                outboxStatusById={chat.outboxStatusById}
                onRetryMessage={chat.retryMessage}
                onDiscardMessage={chat.discardMessage}
                onDeleteChat={onOpenDeleteModal}
                onCall={onCall}
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
                    title={t("chat.deleteChatTitle")}
                    message={t("chat.deleteChatConfirm", {name: peerContact.name})}
                    confirmText={t("chat.delete")}
                    cancelText={t("common.cancel")}
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