import { useState } from "react";


export function useUnreadChats() {
  const [unreadChats, setUnreadChats] = useState<Set<string>>(new Set());

  function markUnread(chatId: string) {
    setUnreadChats((prev) => {
      if (prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.add(chatId);
      return next;
    });
  }

  function markRead(chatId: string) {
    setUnreadChats((prev) => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
  }

  function clearAll() {
    setUnreadChats(new Set());
  }

  return {
    unreadChats,
    markUnread,
    markRead,
    clearAll,
  };
}
