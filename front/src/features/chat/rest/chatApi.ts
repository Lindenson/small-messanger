import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import {type ChatMessage} from "@/features/chat/model/schema/domainChatMessage.schema.ts";
import {wireToChatMessage} from "@/features/chat/model/mapper.ts";
import {parseWireMessage} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {MESSENGER_ADMIN_KEY, MESSENGER_API} from "@/shared/config/api.ts";
import {HISTORY_PAGE_SIZE} from "@/shared/config/chat.ts";
import {loadHistoryFromDB, saveHistoryToDB} from "@/features/chat/db/db.ts";
import {setPeerLastReadId} from "@/features/chat/model/slices/chatUiSlice.ts";

// Wire rows (up to a page) → domain messages, then dedup by clientId||id (guards against any
// duplicate the server returns; history rows normally carry no clientId — see the dedup note).
function toMessages(raw: unknown): ChatMessage[] {
    // History endpoint returns { messages: [...] } (newer) or a bare array (older) — accept both.
    const arr = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === "object" && Array.isArray((raw as { messages?: unknown }).messages)
            ? (raw as { messages: unknown[] }).messages
            : []);
    return arr
        .map(parseWireMessage)
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map(wireToChatMessage);
}
function dedupMessages(rows: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    return rows.filter((m) => {
        const key = m.clientId || m.id;
        if (seen.has(key) || seen.has(m.id)) return false;
        seen.add(key);
        seen.add(m.id);
        return true;
    });
}

/** Raw backend Conversation (GET /api/chats). */
type Conversation = {
    id: string;
    clientId: string;
    masterId: string;
    metadata?: Record<string, string> | null;
    clientBlocked?: boolean;
    masterBlocked?: boolean;
    // Durable read boundary per side: the messageId (server ULID) each participant last read up to.
    clientReadReceipt?: string | null;
    masterReadReceipt?: string | null;
};

/** Frontend chat-list item derived from a Conversation, relative to the caller. */
export type ChatSummary = {
    conversationId: string;
    counterpartId: string;
    orderId?: string;
    blocked: boolean;        // either side blocked → sending is impossible (block is mutual/terminal)
    blockedByMe: boolean;    // I blocked the peer (I can unblock)
    blockedByPeer: boolean;  // the peer blocked me (I can't unblock their side)
};

export const chatApi = createApi({
    reducerPath: "chatApi",
    baseQuery: fetchBaseQuery({
        baseUrl: MESSENGER_API,
        credentials: "include",
    }),
    tagTypes: ["Chats", "Chat"],
    endpoints: (builder) => ({

        // --------------------
        // Caller's conversations (recent-first). Identity comes from the edge headers.
        // --------------------
        getChats: builder.query<ChatSummary[], { myId: string }>({
            query: () => `/chats`,
            transformResponse: (response: unknown, _meta, arg): ChatSummary[] => {
                if (!Array.isArray(response)) return [];
                return (response as Conversation[]).map((c) => {
                    const amClient = c.clientId === arg.myId;
                    const blockedByMe = amClient ? Boolean(c.clientBlocked) : Boolean(c.masterBlocked);
                    const blockedByPeer = amClient ? Boolean(c.masterBlocked) : Boolean(c.clientBlocked);
                    return {
                        conversationId: c.id,
                        counterpartId: amClient ? c.masterId : c.clientId,
                        orderId: c.metadata?.orderId,
                        blocked: blockedByMe || blockedByPeer,
                        blockedByMe,
                        blockedByPeer,
                    };
                });
            },
            providesTags: ["Chats"],
        }),

        // --------------------
        // Conversation history (cursor-paginated). chatId === conversationId.
        // --------------------
        // Loads the NEWEST page (backend default = latest `limit`, ASC). Older pages are pulled on
        // demand by the loadOlderHistory thunk (`?before=<oldest>`), which prepends into this cache;
        // reconnect catch-up appends newer via `?since=`. Rendering is windowed downstream.
        getChatHistory: builder.query<
            ChatMessage[],
            { myId: string; chatId: string }
        >({
            async queryFn({chatId}, api, _extra, baseQuery) {
                const res = await baseQuery(`/chats/${chatId}/messages?limit=${HISTORY_PAGE_SIZE}`);
                if (res.error) return {error: res.error};
                // The response is a HistoryPage envelope { messages, peerLastReadId }. Feed the peer's
                // read boundary into chatUi so my sent messages render ✓✓ (id <= peerLastReadId).
                const peerLastReadId = (res.data as { peerLastReadId?: string | null } | undefined)?.peerLastReadId;
                if (peerLastReadId) api.dispatch(setPeerLastReadId({chatId, lastReadId: peerLastReadId}));
                return {data: dedupMessages(toMessages(res.data))};
            },
            providesTags: (_r, _e, arg) => [
                {type: "Chat", id: arg.chatId},
            ],
            // Offline/instant-open cache in IndexedDB: seed from the local cache immediately (so the
            // chat opens without waiting for the network), then persist the fresh result and, on
            // unsubscribe, the final in-memory state (incl. messages that arrived while open).
            async onCacheEntryAdded(arg, {updateCachedData, cacheDataLoaded, cacheEntryRemoved, getCacheEntry}) {
                try {
                    const cached = await loadHistoryFromDB(arg.chatId);
                    if (cached && cached.length) {
                        updateCachedData((draft) => {
                            // Seed only while the network hasn't populated the entry yet.
                            if (!Array.isArray(draft) || draft.length === 0) return cached;
                        });
                    }
                } catch { /* cache read is best-effort */ }
                try {
                    await cacheDataLoaded;
                    const data = getCacheEntry().data;
                    if (data) await saveHistoryToDB(arg.chatId, data);
                } catch { /* subscription aborted before first load */ }
                try {
                    await cacheEntryRemoved;
                    const data = getCacheEntry().data;
                    if (data) await saveHistoryToDB(arg.chatId, data);
                } catch { /* ignore */ }
            },
        }),

        // --------------------
        // Soft-delete the conversation for the caller (reversible by new activity).
        // --------------------
        deleteChatHistory: builder.mutation<
            void,
            { myId: string; chatId: string }
        >({
            query: ({chatId}) => ({
                url: `/chats/${chatId}`,
                method: "DELETE",
            }),
            // Invalidate BOTH the history (Chat/id) AND the chat list (Chats): the backend excludes
            // soft-deleted conversations from GET /chats, so refetching the list drops the deleted
            // chat from the UI. Without the "Chats" tag the list query never refetches and the
            // deleted chat lingers in the sidebar.
            invalidatesTags: (_r, _e, arg) => [
                {type: "Chat", id: arg.chatId},
                "Chats",
            ],
        }),

        // --------------------
        // Bulk read receipt (reconnect/fallback; primary path is WS READ_IN).
        // --------------------
        markRead: builder.mutation<
            void,
            { myId: string; chatId: string }
        >({
            query: ({chatId}) => ({
                url: `/chats/${chatId}/read`,
                method: "POST",
            }),
        }),

        // --------------------
        // Create/return a conversation (idempotent on the pair). Backend gates this to
        // ADMIN/SERVICE (403 otherwise) — chats are normally provisioned by the platform.
        // --------------------
        createChat: builder.mutation<
            Conversation,
            { clientId: string; masterId: string; metadata?: Record<string, string> }
        >({
            query: (body) => ({
                url: `/chats`,
                method: "POST",
                body: { ...body, metadata: body.metadata ?? {} },
                headers: MESSENGER_ADMIN_KEY ? { "X-Admin-Key": MESSENGER_ADMIN_KEY } : undefined,
            }),
            invalidatesTags: ["Chats"],
        }),

        // Block / unblock the peer (mutual; the only terminal messaging stop). Optimistically flip
        // MY block flag in the getChats cache so the UI reacts instantly; undo on failure.
        blockChat: builder.mutation<void, { chatId: string }>({
            query: ({ chatId }) => ({ url: `/chats/${chatId}/block`, method: "POST" }),
            invalidatesTags: ["Chats"],
            async onQueryStarted({ chatId }, { dispatch, getState, queryFulfilled }) {
                const myId = (getState() as { user?: { id?: string } })?.user?.id;
                if (!myId) return;
                const patch = dispatch(chatApi.util.updateQueryData("getChats", { myId }, (draft) => {
                    const s = draft.find((c) => c.conversationId === chatId);
                    if (s) { s.blockedByMe = true; s.blocked = true; }
                }));
                try { await queryFulfilled; } catch { patch.undo(); }
            },
        }),
        unblockChat: builder.mutation<void, { chatId: string }>({
            query: ({ chatId }) => ({ url: `/chats/${chatId}/block`, method: "DELETE" }),
            invalidatesTags: ["Chats"],
            async onQueryStarted({ chatId }, { dispatch, getState, queryFulfilled }) {
                const myId = (getState() as { user?: { id?: string } })?.user?.id;
                if (!myId) return;
                const patch = dispatch(chatApi.util.updateQueryData("getChats", { myId }, (draft) => {
                    const s = draft.find((c) => c.conversationId === chatId);
                    if (s) { s.blockedByMe = false; s.blocked = s.blockedByPeer; }
                }));
                try { await queryFulfilled; } catch { patch.undo(); }
            },
        }),

        // Delete a single message by BOTH ids (only if not frozen → 409). The backend matches on the
        // server ULID (backendId) if present, else the original client id (clientMessageId) — so a
        // just-sent message that hasn't reconciled its id yet still deletes without a history refetch.
        deleteMessage: builder.mutation<void, { chatId: string; backendId?: string; clientMessageId?: string }>({
            query: ({ chatId, backendId, clientMessageId }) => {
                const q = new URLSearchParams();
                if (backendId) q.set("backendId", backendId);
                if (clientMessageId) q.set("clientMessageId", clientMessageId);
                return { url: `/chats/${chatId}/messages?${q.toString()}`, method: "DELETE" };
            },
            invalidatesTags: (_r, _e, arg) => [{ type: "Chat", id: arg.chatId }],
        }),

        // Attachments (two-phase presigned upload, ADR-010).
        attachmentUploadUrl: builder.mutation<
            { attachmentId: string; objectKey: string; uploadUrl: string; method: string; expiresAt: string },
            { chatId: string; fileName: string; contentType: string; sizeBytes: number }
        >({
            query: ({ chatId, fileName, contentType, sizeBytes }) => ({
                url: `/chats/${chatId}/attachments/upload-url`,
                method: "POST",
                body: { fileName, contentType, sizeBytes },
            }),
        }),
        attachmentConfirm: builder.mutation<
            { status: string },
            { chatId: string; attachmentId: string }
        >({
            query: ({ chatId, attachmentId }) => ({
                url: `/chats/${chatId}/attachments/${attachmentId}/confirm`,
                method: "POST",
            }),
        }),
        attachmentDownloadUrl: builder.mutation<
            { downloadUrl: string; method: string; expiresAt: string },
            { chatId: string; attachmentId: string }
        >({
            query: ({ chatId, attachmentId }) => ({
                url: `/chats/${chatId}/attachments/${attachmentId}/download-url`,
                method: "GET",
            }),
        }),
    }),
});

// --------------------
// Auto-generated service
// --------------------
export const {
    useGetChatsQuery,
    useLazyGetChatHistoryQuery,
    useGetChatHistoryQuery,
    useDeleteChatHistoryMutation,
    useMarkReadMutation,
    useCreateChatMutation,
    useBlockChatMutation,
    useUnblockChatMutation,
    useDeleteMessageMutation,
    useAttachmentUploadUrlMutation,
    useAttachmentConfirmMutation,
    useAttachmentDownloadUrlMutation,
} = chatApi;
