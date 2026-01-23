const WebSocket = require("ws");
const eventBus = require("../bus/eventBus");
const clients = require("./wsClients");
const { authenticate } = require("./wsAuth");


function safeSend(ws, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function initWSServer(server) {
    const wss = new WebSocket.Server({
        server,
        maxPayload: 16 * 1024,
    });

    // heartbeat
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on("connection", async (ws, req) => {
        ws.isAlive = true;
        ws.on("pong", () => (ws.isAlive = true));

        const identity = await authenticate(req);
        if (!identity) {
            ws.close(1008, "Unauthorized");
            return;
        }

        const userId = identity.id;
        clients.add(userId, ws);

        ws.on("message", (raw) => {
            let data;

            try {
                data = JSON.parse(raw);
            } catch (err) {
                console.error("❌ WS JSON parse error:", raw);
                return;
            }

            // ping/pong
            if (data.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }

            // WebRTC signaling
            if (data.type?.startsWith("call:")) {
                const { to } = data;
                const target = clients.get(to);

                if (!target) {
                    console.warn(`⚠️ Call target ${to} not connected`);
                    return;
                }

                console.log(`📡 signaling ${data.type} from ${userId} → ${to}`);

                safeSend(target, {
                    ...data,
                    from: userId,
                });

                return;
            }

            console.warn("⚠️ Unknown WS message:", data);
        });


        ws.on("close", () => {
            clients.remove(userId, ws);
        });
    });

    // 🔥 listen to event bus
    eventBus.onEvent("message:new", ({ message }) => {
        clients.broadcast(
            [message.from, message.to],
            { type: "message", payload: message }
        );
    });

    eventBus.onEvent("chat:deleted", ({ users, chatId }) => {
        clients.broadcast(users, {
            type: "chat_deleted",
            payload: { chatId },
        });
    });
}

module.exports = { initWSServer };

