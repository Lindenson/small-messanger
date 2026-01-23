import {beforeEach, describe, expect, it, type Mock, vi} from "vitest";
import { renderHook } from "@testing-library/react";
import { useContacts } from "../../../contacts/hooks/useContacts.ts";
import { useSelector } from "react-redux";
import { useGetChatsQuery } from "@/features/chat/rest/chatApi";
import { useGetUsersByIdsQuery } from "@/features/contacts/rest/contactsApi.ts";
import { logger } from "@/shared/logger/logger";


vi.mock("react-redux", () => ({ useSelector: vi.fn() }));
vi.mock("@/features/chat/rest/chatApi", () => ({
    useGetChatsQuery: vi.fn(),
}));
vi.mock("@/features/contacts/rest/contactsApi", () => ({
    useGetUsersByIdsQuery: vi.fn(),
}));

vi.mock("@/shared/logger/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("react-hot-toast", () => {
    return {
        default: {
            loading: vi.fn(),
            error: vi.fn(),
            dismiss: vi.fn(),
        },
    };
});


describe("useContacts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns empty contacts while loading", () => {
        (useSelector as unknown as Mock).mockReturnValue("user1");
        (useGetChatsQuery as unknown as Mock).mockReturnValue({ data: [], isLoading: true, isError: false });
        (useGetUsersByIdsQuery as unknown as Mock).mockReturnValue({ data: [], isLoading: true, isError: false });

        const { result } = renderHook(() => useContacts());

        expect(result.current.contacts).toEqual([]);
    });

    it("returns empty contacts while loading indexes", () => {
        (useSelector as unknown as Mock).mockReturnValue("user1");
        (useGetChatsQuery as unknown as Mock).mockReturnValue({ data: [], isLoading: false, isError: false });
        (useGetUsersByIdsQuery as unknown as Mock).mockReturnValue({ data: [], isLoading: true, isError: false });

        const { result } = renderHook(() => useContacts());

        expect(result.current.contacts).toEqual([]);
    });


    it("filters out myId from contactsData", () => {
        (useSelector as unknown as Mock).mockReturnValue("user1");
        (useGetChatsQuery as unknown as Mock).mockReturnValue({ data: ["user2", "user1"], isLoading: false, isError: false });
        (useGetUsersByIdsQuery as unknown as Mock).mockReturnValue({
            data: [{ id: "user1", name: "Me" }, { id: "user2", name: "Bob" }],
            isLoading: false,
            isError: false
        });

        const { result } = renderHook(() => useContacts());

        expect(result.current.contacts).toEqual([{ id: "user2", name: "Bob" }]);
        expect(result.current.getContactById("user2")?.name).toBe("Bob");
        expect(result.current.getContactByName("Bob")?.id).toBe("user2");
    });

    it("logs error when isErrorIds or isErrorUsers is true", () => {
        (useSelector as unknown as Mock).mockReturnValue("user1");
        (useGetChatsQuery as unknown as Mock).mockReturnValue({ data: [], isLoading: false, isError: true });
        (useGetUsersByIdsQuery as unknown as Mock).mockReturnValue({ data: [], isLoading: false, isError: false });

        renderHook(() => useContacts());

        expect(logger.error).toHaveBeenCalledWith("contacts error", { myId: "user1" });
    });
});
