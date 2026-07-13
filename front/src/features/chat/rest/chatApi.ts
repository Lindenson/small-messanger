import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import {type ChatMessage} from "@/features/chat/model/schema/domainChatMessage.schema.ts";
import {wireToChatMessage} from "@/features/chat/model/mapper.ts";
import {parseWireMessage} from "@/features/chat/model/schema/wireMessage.schema.ts";
import {MESSENGER_ADMIN_KEY, MESSENGER_API} from "@/shared/config/api.ts";

/** Raw backend Conversation (GET /api/chats). */
type Conversation = {
    id: string;
    clientId: string;
    masterId: string;
    metadata?: Record<string, string> | null;
    clientBlocked?: boolean;
    masterBlocked?: boolean;
};

/** Frontend chat-list item derived from a Conversation, relative to the caller. */
export type ChatSummary = {
    conversationId: string;
    counterpartId: string;
    orderId?: string;
    blocked: boolean;
};

const HISTORY_PAGE = 200;

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
                return (response as Conversation[]).map((c) => ({
                    conversationId: c.id,
                    counterpartId: c.clientId === arg.myId ? c.masterId : c.clientId,
                    orderId: c.metadata?.orderId,
                    blocked: Boolean(c.clientBlocked || c.masterBlocked),
                }));
            },
            providesTags: ["Chats"],
        }),

        // --------------------
        // Conversation history (cursor-paginated). chatId === conversationId.
        // --------------------
        getChatHistory: builder.query<
            ChatMessage[],
            { myId: string; chatId: string }
        >({
            query: ({chatId}) => `/chats/${chatId}/messages?limit=${HISTORY_PAGE}`,
            providesTags: (_r, _e, arg) => [
                {type: "Chat", id: arg.chatId},
            ],
            transformResponse: (raw: unknown): ChatMessage[] => {
                if (!Array.isArray(raw)) return [];
                return raw
                    .map(parseWireMessage)
                    .filter((m): m is NonNullable<typeof m> => Boolean(m))
                    .map(wireToChatMessage);
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
            invalidatesTags: (_r, _e, arg) => [
                {type: "Chat", id: arg.chatId},
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

        // Block / unblock the peer (mutual; the only terminal messaging stop).
        blockChat: builder.mutation<void, { chatId: string }>({
            query: ({ chatId }) => ({ url: `/chats/${chatId}/block`, method: "POST" }),
            invalidatesTags: ["Chats"],
        }),
        unblockChat: builder.mutation<void, { chatId: string }>({
            query: ({ chatId }) => ({ url: `/chats/${chatId}/block`, method: "DELETE" }),
            invalidatesTags: ["Chats"],
        }),

        // Delete a single message (only if not frozen → 409).
        deleteMessage: builder.mutation<void, { chatId: string; messageId: string }>({
            query: ({ chatId, messageId }) => ({
                url: `/chats/${chatId}/messages/${messageId}`,
                method: "DELETE",
            }),
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
