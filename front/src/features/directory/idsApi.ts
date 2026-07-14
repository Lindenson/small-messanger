import {createApi, fetchBaseQuery} from "@reduxjs/toolkit/query/react";
import {IDS_ADMIN_KEY, MESSENGER_IDS_URL} from "@/shared/config/api.ts";

// IDS (KratosGate) identity directory, proxied by the edge at {VITE_IDS_URL}/users and gated by
// the Kratos session cookie; the admin key goes in X-Admin-Key. Cached once and shared across the
// app so names resolve everywhere (chat list + new-chat search), not only for online peers.
export type IdsUser = {
    id: string;
    email?: string;
    display_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    locale?: string;
    role?: string;
    status?: string;
    verified?: boolean;
};

export function idsDisplayName(u: IdsUser): string {
    return (
        u.display_name?.trim() ||
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        u.email ||
        u.id
    );
}

export const idsApi = createApi({
    reducerPath: "idsApi",
    baseQuery: fetchBaseQuery({
        baseUrl: MESSENGER_IDS_URL,
        credentials: "include",
        prepareHeaders: (headers) => {
            headers.set("Accept", "application/json");
            if (IDS_ADMIN_KEY) headers.set("X-Admin-Key", IDS_ADMIN_KEY);
            return headers;
        },
    }),
    endpoints: (builder) => ({
        // Loads the whole directory (used only for name resolution in the chat
        // list / calls). The NEW-CHAT picker uses searchIdsUsers instead so it
        // never downloads everyone.
        getIdsUsers: builder.query<IdsUser[], void>({
            query: () => "/users",
            transformResponse: (resp: unknown): IdsUser[] => {
                const users = (resp as { users?: unknown })?.users;
                return Array.isArray(users) ? (users as IdsUser[]) : [];
            },
        }),
        // Server-side, paginated type-ahead over name/email (IDS pg_trgm). Keyset
        // pagination: pass the previous page's nextToken to get the next page.
        searchIdsUsers: builder.query<
            { users: IdsUser[]; nextToken?: string; total: number },
            { q: string; pageToken?: string; pageSize?: number }
        >({
            query: ({q, pageToken, pageSize = 20}) => {
                const p = new URLSearchParams({q, page_size: String(pageSize)});
                if (pageToken) p.set("page_token", pageToken);
                return `/users/search?${p.toString()}`;
            },
            transformResponse: (resp: unknown) => {
                const r = resp as { users?: unknown; next_token?: string; total?: number };
                return {
                    users: Array.isArray(r?.users) ? (r.users as IdsUser[]) : [],
                    nextToken: r?.next_token || undefined,
                    total: r?.total ?? 0,
                };
            },
        }),
        // A single user by id (used to resolve the current user's own role,
        // without downloading the whole directory).
        getIdsUser: builder.query<IdsUser | null, string>({
            query: (id) => `/users/${encodeURIComponent(id)}`,
            transformResponse: (resp: unknown): IdsUser | null =>
                resp && (resp as IdsUser).id ? (resp as IdsUser) : null,
        }),
    }),
});

export const {
    useGetIdsUsersQuery,
    useLazySearchIdsUsersQuery,
    useGetIdsUserQuery,
} = idsApi;
