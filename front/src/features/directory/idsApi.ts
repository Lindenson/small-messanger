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
        getIdsUsers: builder.query<IdsUser[], void>({
            query: () => "/users",
            transformResponse: (resp: unknown): IdsUser[] => {
                const users = (resp as { users?: unknown })?.users;
                return Array.isArray(users) ? (users as IdsUser[]) : [];
            },
        }),
    }),
});

export const {useGetIdsUsersQuery} = idsApi;
