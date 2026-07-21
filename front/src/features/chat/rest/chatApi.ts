import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import {type ChatMessage} from "@/features/chat/model/schema/domainChatMessage.schema.ts";
import type {OutboxMessage} from "@/features/chat/model/types.ts";
import {wireToChatMessage} from "@/features/chat/model/mapper.ts";
import {parseWireMessage} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {MESSENGER_ADMIN_KEY, MESSENGER_API} from "@/shared/config/api.ts";
import {HISTORY_PAGE_SIZE} from "@/shared/config/chat.ts";
import {loadHistoryFromDB, saveHistoryToDB} from "@/features/chat/db/db.ts";
import {setPeerLastReadId} from "@/features/chat/model/slices/chatUiSlice.ts";
import {isUlid} from "@/shared/ulid/ulid.ts";

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
    // The PEER's durable read boundary (their side's receipt — the opposite of my role). A message
    // I sent with id <= this renders ✓✓. Role-relative: if I'm the client the peer is the master.
    peerReadReceipt?: string;
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
                        // Role-relative peer boundary: if I'm the client, the peer is the master, so
                        // the peer's receipt is masterReadReceipt (and vice versa).
                        peerReadReceipt: (amClient ? c.masterReadReceipt : c.clientReadReceipt) ?? undefined,
                    };
                });
            },
            // Seed the per-chat read boundary from the durable receipt on every list load (which
            // happens at app boot, before any chat is opened), so ✓✓ is correct immediately without
            // waiting to open the conversation. Monotonic + ULID-guarded in the reducer, so a legacy
            // non-ULID receipt is simply ignored.
            async onQueryStarted(_arg, {dispatch, queryFulfilled}) {
                try {
                    const {data} = await queryFulfilled;
                    for (const s of data) {
                        if (s.peerReadReceipt) dispatch(setPeerLastReadId({chatId: s.conversationId, lastReadId: s.peerReadReceipt}));
                    }
                } catch { /* boundary seeding is best-effort */ }
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
            async queryFn({myId, chatId}, api, _extra, baseQuery) {
                const res = await baseQuery(`/chats/${chatId}/messages?limit=${HISTORY_PAGE_SIZE}`);
                if (res.error) return {error: res.error};
                const messages = dedupMessages(toMessages(res.data));

                // Re-graft still-queued outbox messages for this chat. A forceRefetch REPLACES the
                // cache array, wiping the optimistic echoes of not-yet-acked messages; the CHAT_ACK
                // handler only updates an existing row (never re-inserts), so without this a pending
                // message would vanish from the sender's transcript on reconnect / after sending an
                // attachment (both call reloadChatHistory). Everything still in the outbox is by
                // definition un-acked (markSent removes it on ACK), so it isn't in the server rows yet
                // → append it, skipping any id already present.
                const outbox = (api.getState() as { outbox?: { messages?: OutboxMessage[] } }).outbox?.messages ?? [];
                const present = new Set(messages.map((m) => m.id));
                for (const o of outbox) {
                    const p = o.payload;
                    if (p?.conversationId !== chatId || present.has(o.id)) continue;
                    messages.push({
                        id: o.id,
                        clientId: o.id,
                        chatId,
                        from: myId,
                        to: p.recipientId ?? "",
                        text: p.payload?.body ?? "",
                        createdAt: new Date(p.senderTimestamp ?? Date.now()),
                        status: o.status,
                        kind: p.payload?.kind,
                        meta: p.meta,
                    });
                }
                // Read state is NOT in the history rows (they carry no status, and there is no
                // peerLastReadId field) — it lives only in the separate receipts projection
                // (GET /chats/:id/receipts → [{messageId, status}], status READ once the recipient
                // read it). Without this fetch, ✓✓ was always missing on a fresh open (the exact
                // "everything unread when I open history" bug). Derive the peer's read boundary =
                // the newest of MY messages the peer marked READ. The backend marks a reader's whole
                // received set READ in one shot, so my READ messages form a prefix and the max READ
                // id is a safe boundary. Monotonic + ULID-guarded in the reducer.
                try {
                    const rc = await baseQuery(`/chats/${chatId}/receipts`);
                    const receipts = Array.isArray(rc.data) ? (rc.data as { messageId?: string; status?: string }[]) : [];
                    const readIds = new Set(
                        receipts.filter((r) => r.status === "READ" && r.messageId).map((r) => r.messageId as string)
                    );
                    let boundary: string | undefined;
                    for (const m of messages) {
                        if (m.from === myId && readIds.has(m.id) && isUlid(m.id) && (!boundary || m.id > boundary)) {
                            boundary = m.id;
                        }
                    }
                    if (boundary) api.dispatch(setPeerLastReadId({chatId, lastReadId: boundary}));
                } catch { /* receipts are best-effort; ✓✓ simply won't advance from this load */ }
                return {data: messages};
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
            // Do NOT invalidate "Chats": createChat is idempotent on the pair and may return a
            // conversation the caller previously soft-deleted (getChats hides it until a message
            // revives it). AddUser injects the returned conversation into the getChats cache and opens
            // it so the user can send the first message (which revives it). A "Chats" refetch here
            // would immediately drop that still-hidden conversation back out of the list — the chat
            // fails to open and "the list doesn't grow". The manual inject is the source of truth.
        }),

        // Block / unblock the peer (mutual; the only terminal messaging stop). Optimistically flip
        // MY block flag in the getChats cache so the UI reacts instantly; undo on failure.
        blockChat: builder.mutation<void, { chatId: string }>({
            query: ({ chatId }) => ({ url: `/chats/${chatId}/block`, method: "POST" }),
            // No "Chats" invalidation: the optimistic patch already flips the flag, and a refetch here
            // would drop a soft-deleted-but-transiently-listed conversation out of the list — the
            // blocked chat would vanish and you could no longer unblock it.
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
            // No "Chats" invalidation (see blockChat): the optimistic patch flips the flag; a refetch
            // could drop a transiently-listed soft-deleted conversation from the list.
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
            // Remove the one message from the history cache in place — do NOT invalidate the "Chat"
            // tag. An invalidation forces getChatHistory to refetch the ENTIRE conversation just to
            // drop a single row (the exact refetch we were trying to avoid). Match on the server ULID
            // (backendId → m.id) OR the original client id (clientMessageId → m.clientId/m.id), so a
            // not-yet-reconciled message deletes locally too. Undo the patch if the request fails.
            async onQueryStarted({ chatId, backendId, clientMessageId }, { dispatch, getState, queryFulfilled }) {
                const myId = (getState() as { user?: { id?: string } })?.user?.id;
                if (!myId) return;
                const patch = dispatch(chatApi.util.updateQueryData("getChatHistory", { myId, chatId }, (draft) => {
                    if (!Array.isArray(draft)) return;
                    const i = draft.findIndex((m) =>
                        (backendId && m.id === backendId) ||
                        (clientMessageId && (m.clientId === clientMessageId || m.id === clientMessageId)));
                    if (i >= 0) draft.splice(i, 1);
                }));
                try {
                    await queryFulfilled;
                    // Persist the post-delete list now. The IndexedDB seed is otherwise only rewritten
                    // on cacheEntryRemoved (unsubscribe); if the tab is hard-closed before then, the
                    // stale pre-delete array would re-seed and the deleted message would reappear offline.
                    const data = chatApi.endpoints.getChatHistory.select({ myId, chatId })(getState() as never)?.data;
                    if (data) saveHistoryToDB(chatId, data).catch(() => { /* best-effort */ });
                } catch { patch.undo(); }
            },
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
