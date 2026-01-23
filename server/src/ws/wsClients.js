const clients = new Map(); // userId -> ws

module.exports = {
    add(userId, ws) {
        if (clients.has(userId)) {
            clients.get(userId).close();
        }
        clients.set(userId, ws);
    },

    remove(userId, ws) {
        if (clients.get(userId) === ws) {
            clients.delete(userId);
        }
    },

    get(userId) {
        return clients.get(userId);
    },

    isOnline(userId) {
        return clients.has(userId);
    },

    broadcast(userIds, message) {
        userIds.forEach((id) => {
            const ws = clients.get(id);
            if (!ws) return;
            if (ws?.readyState === ws.OPEN) {
                ws.send(JSON.stringify(message));
            }
        });
    }
};
