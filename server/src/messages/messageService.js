const { v4: uuid } = require("uuid");
const eventBus = require("../bus/eventBus");

const chats = new Map();

function getChatId(a, b) {
    return [a, b].sort().join("_");
}

function sendMessage({ from, to, text }) {
    const chatId = getChatId(from, to);

    if (!chats.has(chatId)) chats.set(chatId, []);

    const message = {
        id: uuid(),
        chatId,
        from,
        to,
        text,
        createdAt: new Date().toISOString(),
    };

    chats.get(chatId).push(message);

    eventBus.emitEvent("message:new", { message });

    return message;
}

function getChat(clientA, clientB) {
    const chatId = getChatId(clientA, clientB);
    return chats.get(chatId) ?? [];
}

function getChats(clientId) {
    const contactsSet = new Set();
    for (const chatId of chats.keys()) {
        const [a, b] = chatId.split("_");
        if (a === clientId) contactsSet.add(b);
        else if (b === clientId) contactsSet.add(a);
    }
    return Array.from(contactsSet);
}

function deleteChat(clientA, clientB) {
    const chatId = getChatId(clientA, clientB);
    if (!chats.has(chatId)) {
        return false;
    }
    chats.delete(chatId);
    const users = [clientA, clientB];
    eventBus.emitEvent("chat:deleted", { users, chatId });
    console.log(`🗑️ Chat deleted: ${chatId}`);
    return true;
}


module.exports = { sendMessage, getChat, getChats, deleteChat };
