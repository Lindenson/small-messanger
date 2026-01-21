import { createApi } from "@reduxjs/toolkit/query/react";
import type {Contact} from "@/features/chat/model/types.ts";
import contacts from "./contacts.json";

export const contactsApi = createApi({
    reducerPath: "contactsApi",
    baseQuery: async () => ({ data: [] }),
    tagTypes: ["Contact"],
    endpoints: (builder) => ({
        lookupUser: builder.mutation<{ found: boolean; user?: Contact }, string>({
            queryFn: (identifier: string) => {
                const user = contacts.find(c => c.email === identifier);
                return { data: { found: !!user, user: user ?? undefined } };
            },
            invalidatesTags: (result) =>
                result?.user
                    ? [{ type: "Contact", id: result.user.id }]
                    : [],
        }),

        getUsersByIds: builder.query<Contact[], {ids: string[]}>({
            queryFn: ({ids}) => {
                if (ids.length == 0) return { data: [] };
                const idsSet = new Set(ids);
                const users = contacts.filter(c => idsSet.has(c.id));
                return { data: users };
            },
            providesTags: (result) =>
                result
                    ? [
                        ...result.map((u) => ({ type: "Contact" as const, id: u.id })),
                        { type: "Contact", id: "LIST" },
                    ]
                    : [{ type: "Contact", id: "LIST" }],
        }),
    }),
});

// --------------------
// Auto-generated hooks
// --------------------
export const {
    useLookupUserMutation,
    useGetUsersByIdsQuery,
} = contactsApi;