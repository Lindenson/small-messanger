import {useEffect, useRef} from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import type {Contact} from "@/features/chat/model/types";
import {setSelectedChatId} from "@/features/chat/model/slices/chatUiSlice.ts";

interface ChatMessageView {
    text: string;
    fromMe: boolean;
}

interface ChatWindowProps {
    chat: Contact | null;
    messages: ChatMessageView[];
    inputText: string;
    setInputText: (value: string) => void;
    sendMessage: (text: string) => void;
    onDeleteChat: () => void;
    onCall: () => void;
}

export default function ChatWindow({
                                       chat,
                                       messages,
                                       inputText,
                                       setInputText,
                                       sendMessage,
                                       onDeleteChat,
                                       onCall,
                                   }: ChatWindowProps) {
    const dispatch = useDispatch();

    const selectedChatId = useSelector(
        (state: RootState) => state.chatUi.selectedChatId
    );

    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages]);

    const isChatOpen = !!selectedChatId;

    return (
        <main
            className={`h-full flex flex-col w-full overflow-hidden ${
                !isChatOpen ? "hidden" : "flex"
            }`}
        >
            {/* Header */}
            <div
                className="shrink-0 py-4 px-4 bg-teal-950 text-white border-b font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => dispatch(setSelectedChatId(null))}
                        className="sm:hidden text-xl"
                    >
                        ←
                    </button>
                    {chat?.name}
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={onCall}
                        title="Videollamada"
                        className="hover:opacity-80 text-xl"
                    >
                        📞
                    </button>

                    <button
                        onClick={onDeleteChat}
                        title="Eliminar chat"
                        className="text-red-400 hover:text-red-500 text-xl"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 bg-gray-300">
                {messages?.map((msg, i) => (
                    <div
                        key={i}
                        className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                            msg.fromMe
                                ? "ml-auto bg-teal-950 text-white rounded-br-none"
                                : "mr-auto bg-white text-teal-950 rounded-bl-none"
                        }`}
                    >
                        {msg.text}
                    </div>
                ))}
                <div ref={bottomRef}/>
            </div>

            {/* Input */}
            <div className="shrink-0 p-4 bg-white border-t flex items-center gap-2">
                <input
                    type="text"
                    placeholder="Escribe un mensaje"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="flex-1 border rounded-full text-base px-4 py-2 focus:outline-none"
                />
                <button
                    onClick={() => sendMessage(inputText)}
                    className="bg-teal-950 text-white px-5 py-3.5 rounded-full"
                >
                    ↑
                </button>
            </div>
        </main>
    );
}
