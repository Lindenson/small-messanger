import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnreadChats } from "../useUnreadChats";

describe("useUnreadChats", () => {
    it("initially has no unread chats", () => {
        const { result } = renderHook(() => useUnreadChats());

        expect(result.current.unreadChats.size).toBe(0);
    });

    it("marks chat as unread", () => {
        const { result } = renderHook(() => useUnreadChats());

        act(() => {
            result.current.markUnread("chat1");
        });

        expect(result.current.unreadChats.has("chat1")).toBe(true);
    });

    it("does not duplicate unread chats", () => {
        const { result } = renderHook(() => useUnreadChats());

        act(() => {
            result.current.markUnread("chat1");
            result.current.markUnread("chat1");
        });

        expect(result.current.unreadChats.size).toBe(1);
    });

    it("marks chat as read", () => {
        const { result } = renderHook(() => useUnreadChats());

        act(() => {
            result.current.markUnread("chat1");
            result.current.markRead("chat1");
        });

        expect(result.current.unreadChats.has("chat1")).toBe(false);
    });

    it("markRead does nothing if chat was not unread", () => {
        const { result } = renderHook(() => useUnreadChats());

        act(() => {
            result.current.markRead("chat1");
        });

        expect(result.current.unreadChats.size).toBe(0);
    });

    it("clears all unread chats", () => {
        const { result } = renderHook(() => useUnreadChats());

        act(() => {
            result.current.markUnread("chat1");
            result.current.markUnread("chat2");
            result.current.clearAll();
        });

        expect(result.current.unreadChats.size).toBe(0);
    });
});
