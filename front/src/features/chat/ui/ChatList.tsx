import {useEffect, useRef} from "react";
import {useSelector} from "react-redux";
import {useNavigate} from "react-router-dom";

import type {RootState} from "@/store/store";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";

interface ChatListProps {
    chats: Contact[];
    openChat: (chatId: string) => void;
    unreadChats: Set<string>;
    search: string;
    setSearch: (value: string) => void;
    myName: string;
    onLogout: () => void;
}

export default function ChatList({
                                     chats,
                                     openChat,
                                     unreadChats,
                                     search,
                                     setSearch,
                                     myName,
                                     onLogout,
                                 }: ChatListProps) {
    const selectedChatId = useSelector(
        (state: RootState) => state.chatUi.selectedChatId
    );

    const isChatOpen = selectedChatId !== null;

    const navigate = useNavigate();

    // addressing unfocused issue
    const chatListRef = useRef<HTMLDivElement>(null);
    const prevSelectedChatIdRef = useRef<string | null>(selectedChatId);
    useEffect(() => {
        if (prevSelectedChatIdRef.current && selectedChatId === null) {
            chatListRef.current?.focus();
        }
        prevSelectedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);

    return (
        <>
            <aside className={`bg-gray-200 border-r w-full sm:w-1/3 max-w-sm h-screen
            ${isChatOpen ? "hidden sm:flex" : "flex flex-col"} flex-col`}
            >
                {/* Header */}
                <div className="bg-teal-950 border-b flex-none">
                    <div className="px-4 py-3 flex items-center justify-between text-white">
                        <div className="font-semibold text-lg truncate">{myName}</div>

                        <button
                            onClick={onLogout}
                            className="text-sm text-red-400 opacity-100 hover:opacity-90"
                            title="Logout"
                        >
                            Salir
                        </button>
                    </div>

                    {/* Search + Add button */}
                    <div className="px-4 pb-3 flex items-center gap-2">
                        <button
                            onClick={() => navigate("/add")}
                            title="Añadir contacto"
                            className="w-10 h-10 flex items-center justify-center rounded-full
                            bg-teal-950 border-2 text-white
                            border-l-gray-300 border-t-gray-200 border-r-gray-400 border-b-gray-500
                            opacity-100 hover:opacity-85"
                        >
                            +
                        </button>
                        <input
                            type="text"
                            placeholder="Buscar contacto"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="flex-1 rounded-full px-4 py-2 text-base bg-white border focus:outline-none"
                        />
                    </div>
                </div>

                {/* Chat list */}
                <div
                    className="flex-1 overflow-y-auto pb-6 scrollable-touch"
                    style={{WebkitOverflowScrolling: "touch", overscrollBehavior: "contain"}}
                    ref={chatListRef}
                >
                    {chats.map((chat) => {
                        const isUnread = unreadChats?.has(chat.id);

                        return (
                            <div
                                key={chat.id}
                                onClick={() => openChat(chat.id)}
                                className={`p-4 cursor-pointer hover:bg-gray-100
                                ${selectedChatId === chat.id ? "bg-gray-100" : ""}`}
                            >
                                {/* Name + unread dot */}
                                <div className="flex items-center gap-2">
                                    {isUnread && (
                                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"/>
                                    )}
                                    <span
                                        className={`truncate ${
                                            isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-800"
                                        }`}
                                    >
                    {chat.name}
                  </span>
                                </div>

                                {/* Last message */}
                                <div
                                    className={`text-sm truncate pl-2 ${
                                        isUnread ? "text-gray-900" : "text-gray-500"
                                    }`}
                                >
                                    {chat.email}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </aside>
        </>
    );
}
