import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import type {Contact} from "@/features/chat/model/types";
import contacts from "./contacts.json";
import {type ChatMessage} from "@/features/chat/model/schema/domainChatMessage.schema.ts";
import {parseChatMessage} from "@/features/chat/model/schema/parser.ts";


export const chatApi = createApi({
    reducerPath: "chatApi",
    baseQuery: fetchBaseQuery({
        baseUrl: "/api",
    }),
    tagTypes: ["Chats", "Chat"],
    endpoints: (builder) => ({

        // --------------------
        // Get list of active chats for client A
        // --------------------
        getChats: builder.query<string[], { myId: string }>({
            query: ({ myId }) => `/chats/${myId}`,
            transformResponse: (response: unknown) => {
                if (!Array.isArray(response)) return [];
                return response as string[];
            },
            providesTags: ["Chats"],
        }),

        // --------------------
        // Login check
        // --------------------
        checkLogin: builder.query<Contact | null, string>({
            queryFn: (name: string) => {
                const found = contacts.find((c) => c.name === name) ?? null;
                return {data: found};
            },
        }),

        // --------------------
        // Get chat between a client A and B
        // --------------------
        getChatHistory: builder.query<
            ChatMessage[],
            { myId: string; chatId: string }
        >({
            query: ({myId, chatId}) => `/chat/${myId}/${chatId}`,
            providesTags: (_r, _e, arg) => [
                {type: "Chat", id: arg.chatId},
            ],
            transformResponse: (raw: unknown) => {
                if (!Array.isArray(raw)) return [];
                return raw.map(parseChatMessage).filter(Boolean) as ChatMessage[];
            },
        }),

        // --------------------
        // Delete chat between a client A and B
        // --------------------
        deleteChatHistory: builder.mutation<
            void,
            { myId: string; chatId: string }
        >({
            query: ({myId, chatId}) => ({
                url: `/chat/${myId}/${chatId}`,
                method: "DELETE",
            }),
            invalidatesTags: (_r, _e, arg) => [
                {type: "Chat", id: arg.chatId},
            ],
        }),
    }),
});

// --------------------
// Auto-generated hooks
// --------------------
export const {
    useGetChatsQuery,
    useLazyCheckLoginQuery,
    useLazyGetChatHistoryQuery,
    useGetChatHistoryQuery,
    useDeleteChatHistoryMutation,
} = chatApi;
