import {useSelector} from "react-redux";
import type {RootState} from "@/store/store.ts";
import {useGetChatsQuery} from "@/features/chat/rest/chatApi.ts";
import type {Contact} from "@/features/contacts/model/schema/domainContract.schema.ts";
import {isNotLogged} from "@/shared/utils/checks.ts";
import {logger} from "@/shared/logger/logger.ts";
import {useGetUsersByIdsQuery} from "@/features/contacts/rest/contactsApi.ts";
import {useEffect, useMemo, useRef} from "react";
import {skipToken} from "@reduxjs/toolkit/query/react";
import toast from "react-hot-toast";


export function useContacts() {
    const myId = useSelector((state: RootState) => state.user.id);
    const skip = isNotLogged(myId);

    const {
        data: contactIds = [],
        isLoading: isLoadingIds,
        isError: isErrorIds,
    } = useGetChatsQuery({ myId }, { skip });

    const usersQueryArg =
        !skip && contactIds.length > 0
            ? { ids: contactIds }
            : skipToken;

    const {
        data: contactsData = [],
        isLoading: isLoadingUsers,
        isError: isErrorUsers,
    } = useGetUsersByIdsQuery(usersQueryArg);


    const contacts = useMemo(() => {
        if (isErrorIds || isErrorUsers) {
            logger.error("contacts error", { myId });
            return [];
        }
        if (isLoadingIds || isLoadingUsers) return [];
        return contactsData?.filter(c => c.id !== myId) ?? [];
    }, [
        contactsData,
        isLoadingIds,
        isLoadingUsers,
        isErrorIds,
        isErrorUsers,
        myId,
    ]);

    const getContactById = useMemo(
        () => (id: string): Contact | null =>
            contacts.find(c => c.id === id) ?? null,
        [contacts]
    );

    const getContactByName = useMemo(
        () => (name: string): Contact | null =>
            contacts.find(c => c.name === name) ?? null,
        [contacts]
    );


    const usersLoadingToastId = useRef<string | null>(null);

    useEffect(() => {
        // ⏳ loading
        if ((isLoadingUsers || isLoadingIds) && !usersLoadingToastId.current) {
            usersLoadingToastId.current = toast.loading("Loading contacts...");
            return;
        }

        // ❌ error
        if ((isErrorUsers || isErrorIds) && usersLoadingToastId.current) {
            logger.error("getUsersByIds failed", { myId });

            toast.error("Load contacts error", {
                id: usersLoadingToastId.current,
            });

            usersLoadingToastId.current = null;
            return;
        }

        // ✅ success
        if (!(isLoadingUsers || isLoadingIds) && usersLoadingToastId.current) {
            toast.dismiss(usersLoadingToastId.current);
            usersLoadingToastId.current = null;
        }
    }, [isLoadingUsers, isErrorUsers, myId, isLoadingIds, isErrorIds]);



    return {
        contacts,
        isLoadingIds,
        isLoadingUsers,
        isErrorIds,
        isErrorUsers,
        getContactById,
        getContactByName,
    };
}