import {useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";

import type {AppDispatch, RootState} from "@/store/store.ts";
import {chatApi, useCreateChatMutation} from "@/features/chat/rest/chatApi.ts";
import {setSelectedChatId} from "@/features/chat/model/slices/chatUiSlice.ts";
import {idsDisplayName, useGetIdsUsersQuery, type IdsUser} from "@/features/directory/idsApi.ts";
import {logger} from "@/shared/logger/logger.ts";
import toast from "react-hot-toast";

function initials(name: string): string {
    const p = name.trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

const roleColor: Record<string, string> = {
    master: "bg-indigo-100 text-indigo-700",
    client: "bg-emerald-100 text-emerald-700",
    admin: "bg-amber-100 text-amber-700",
};

// Pick ONE person to chat with. The conversation is created between the current user and the
// picked one; client/master roles come from the IDS directory. (Chat creation is authorised by
// X-Admin-Key, sent by the API layer.) You must be logged in as a client/master to be a
// participant and see the chat — an admin identity is not a participant.
export default function AddContactPage() {
    const myId = useSelector((s: RootState) => s.user.id);
    const dispatch = useDispatch<AppDispatch>();
    const {data: users = [], isLoading, isError} = useGetIdsUsersQuery();
    const [query, setQuery] = useState("");
    const [createChat, {isLoading: creating}] = useCreateChatMutation();
    const navigate = useNavigate();

    const myRole = useMemo(
        () => (users.find((u) => u.id === myId)?.role ?? "").toLowerCase(),
        [users, myId]
    );

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users
            .filter((u) => u.id !== myId)
            .filter(
                (u) =>
                    !q ||
                    idsDisplayName(u).toLowerCase().includes(q) ||
                    (u.email ?? "").toLowerCase().includes(q) ||
                    u.id.toLowerCase().includes(q)
            );
    }, [users, query, myId]);

    async function startChat(other: IdsUser) {
        const otherRole = (other.role ?? "").toLowerCase();
        // Assign clientId/masterId for the (me, other) pair using known roles.
        let clientId: string, masterId: string;
        if (myRole === "master" || otherRole === "client") {
            masterId = myId; clientId = other.id;
        } else if (myRole === "client" || otherRole === "master") {
            clientId = myId; masterId = other.id;
        } else {
            clientId = myId; masterId = other.id; // fallback (roles unknown)
        }
        try {
            const conv = await createChat({clientId, masterId, metadata: {}}).unwrap();
            // The pair may already exist and be soft-deleted for both sides (getChats hides it
            // until new activity revives it). Inject it into the list cache and open it directly,
            // so the user can send the first message — which revives the thread for both.
            const counterpartId = conv.clientId === myId ? conv.masterId : conv.clientId;
            dispatch(
                chatApi.util.updateQueryData("getChats", {myId}, (draft) => {
                    if (draft && !draft.some((s) => s.conversationId === conv.id)) {
                        draft.push({
                            conversationId: conv.id,
                            counterpartId,
                            orderId: conv.metadata?.orderId,
                            blocked: false,
                        });
                    }
                })
            );
            dispatch(setSelectedChatId(conv.id));
            toast.success("Chat abierto");
            navigate("/");
        } catch (err) {
            const status = (err as {status?: number})?.status;
            logger.error("createChat failed", err as Error);
            toast.error(
                status === 403 ? "Se requiere X-Admin-Key válido para crear chats"
                    : status === 400 ? "Datos inválidos"
                        : "No se pudo crear el chat"
            );
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-200/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-center">Nuevo chat</h2>

                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar con quién chatear (nombre, email, id)"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2
                    focus:outline-none focus:ring-2 focus:ring-teal-600"
                    autoFocus
                />

                <div className="max-h-80 overflow-y-auto flex flex-col gap-1.5">
                    {isLoading && <p className="text-sm text-gray-500 text-center py-4">Cargando directorio…</p>}
                    {isError && <p className="text-sm text-red-600 text-center py-4">No se pudo cargar el directorio (IDS)</p>}
                    {!isLoading && !isError && results.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">Sin resultados</p>
                    )}
                    {results.map((u) => {
                        const name = idsDisplayName(u);
                        return (
                            <button
                                key={u.id}
                                onClick={() => startChat(u)}
                                disabled={creating}
                                className="flex items-center gap-3 border rounded-lg px-3 py-2
                                text-left hover:bg-gray-50 disabled:opacity-50"
                            >
                                <span className="w-9 h-9 rounded-full bg-teal-950 text-white text-sm
                                flex items-center justify-center shrink-0">{initials(name)}</span>
                                <span className="flex flex-col min-w-0 flex-1">
                                    <span className="font-medium truncate">
                                        {name}
                                        {u.verified && <span className="ml-1 text-teal-600" title="verificado">✓</span>}
                                    </span>
                                    {u.email && <span className="text-xs text-gray-500 truncate">{u.email}</span>}
                                </span>
                                {u.role && (
                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0
                                    ${roleColor[u.role] ?? "bg-gray-100 text-gray-600"}`}>{u.role}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={() => navigate(-1)}
                    className="w-full border border-gray-300 py-2 rounded-lg hover:bg-gray-100 transition"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
