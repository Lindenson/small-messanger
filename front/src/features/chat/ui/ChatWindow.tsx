import {useEffect, useRef, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";
import {setSelectedChatId} from "@/features/chat/model/slices/chatUiSlice.ts";

/** Inline thumbnail for image attachments. Presigned GET URLs expire, so it resolves
 *  a fresh URL on mount (per attachmentId). Click opens the full image in a new tab. */
function AttachmentImage({
                             attachmentId,
                             fileName,
                             resolveUrl,
                         }: {
    attachmentId: string;
    fileName: string;
    resolveUrl?: (attachmentId: string) => Promise<string | null>;
}) {
    const [url, setUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const resolveRef = useRef(resolveUrl);
    resolveRef.current = resolveUrl;

    useEffect(() => {
        let alive = true;
        setUrl(null);
        setFailed(false);
        resolveRef.current?.(attachmentId)
            .then((u) => alive && (u ? setUrl(u) : setFailed(true)))
            .catch(() => alive && setFailed(true));
        return () => {
            alive = false;
        };
    }, [attachmentId]);

    if (failed) return <span className="break-all">📎 {fileName}</span>;
    if (!url) return <span className="opacity-60 text-xs">🖼 cargando…</span>;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" title={fileName}>
            <img
                src={url}
                alt={fileName}
                onError={() => setFailed(true)}
                className="max-w-[200px] max-h-[200px] rounded-md object-cover"
            />
        </a>
    );
}

interface ChatMessageView {
    id: string;
    text: string;
    fromMe: boolean;
    kind?: string;
    meta?: Record<string, string>;
}

interface ChatWindowProps {
    chat: Contact | null;
    messages: ChatMessageView[];
    inputText: string;
    setInputText: (value: string) => void;
    sendMessage: (text: string) => void;
    onDeleteChat: () => void;
    onCall: () => void;
    onTyping?: () => void;
    onToggleBlock?: () => void;
    blocked?: boolean;
    onDeleteMessage?: (id: string) => void;
    onSendAttachment?: (file: File) => void;
    onDownloadAttachment?: (attachmentId: string) => void;
    onResolveAttachment?: (attachmentId: string) => Promise<string | null>;
}

export default function ChatWindow({
                                       chat,
                                       messages,
                                       inputText,
                                       setInputText,
                                       sendMessage,
                                       onDeleteChat,
                                       onCall,
                                       onTyping,
                                       onToggleBlock,
                                       blocked,
                                       onDeleteMessage,
                                       onSendAttachment,
                                       onDownloadAttachment,
                                       onResolveAttachment,
                                   }: ChatWindowProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const dispatch = useDispatch();

    const selectedChatId = useSelector(
        (state: RootState) => state.chatUi.selectedChatId
    );
    const peerRead = useSelector((state: RootState) =>
        selectedChatId ? !!state.chatUi.peerReadByChat[selectedChatId] : false
    );
    const peerTyping = useSelector((state: RootState) =>
        selectedChatId ? !!state.chatUi.typingByChat[selectedChatId] : false
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
                    <span className="flex flex-col leading-tight">
                        <span>{chat?.name}</span>
                        <span className="text-xs font-normal">
                            {peerTyping
                                ? <span className="text-teal-300">печатает…</span>
                                : chat?.online
                                    ? <span className="text-green-400">● en línea</span>
                                    : <span className="text-gray-400">● desconectado</span>}
                        </span>
                    </span>
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
                        onClick={onToggleBlock}
                        title={blocked ? "Desbloquear" : "Bloquear"}
                        className="hover:opacity-80 text-xl"
                    >
                        {blocked ? "🔓" : "🚫"}
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
                        {msg.kind === "attachment" ? (
                            (msg.meta?.contentType ?? "").startsWith("image/") ? (
                                <AttachmentImage
                                    attachmentId={msg.meta?.attachmentId ?? ""}
                                    fileName={msg.meta?.fileName ?? msg.text ?? "imagen"}
                                    resolveUrl={onResolveAttachment}
                                />
                            ) : (
                                <button
                                    onClick={() => onDownloadAttachment?.(msg.meta?.attachmentId ?? "")}
                                    className="underline decoration-dotted break-all text-left"
                                    title="Descargar"
                                >
                                    📎 {msg.meta?.fileName ?? msg.text ?? "archivo"}
                                </button>
                            )
                        ) : (
                            msg.text
                        )}
                        {msg.fromMe && (
                            <span className="ml-2 text-[10px] align-bottom opacity-70"
                                  title={peerRead ? "Leído" : "Enviado"}>
                                {peerRead ? "✓✓" : "✓"}
                            </span>
                        )}
                        {onDeleteMessage && (
                            <button
                                onClick={() => onDeleteMessage(msg.id)}
                                title="Eliminar mensaje"
                                className="ml-2 text-[10px] opacity-40 hover:opacity-100"
                            >
                                🗑
                            </button>
                        )}
                    </div>
                ))}
                <div ref={bottomRef}/>
            </div>

            {/* Input */}
            <div className="shrink-0 p-4 bg-white border-t flex items-center gap-2">
                <input
                    type="file"
                    ref={fileRef}
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onSendAttachment?.(f);
                        e.target.value = "";
                    }}
                />
                <button
                    onClick={() => fileRef.current?.click()}
                    title="Adjuntar archivo"
                    className="text-2xl px-1 hover:opacity-80"
                >
                    📎
                </button>
                <input
                    type="text"
                    placeholder="Escribe un mensaje"
                    value={inputText}
                    onChange={(e) => { setInputText(e.target.value); onTyping?.(); }}
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
