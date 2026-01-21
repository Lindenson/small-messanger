const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuid } = require("uuid");

/* =====================
   App / Server
===================== */
const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/* =====================
   In-memory storage
===================== */

// clientId -> WebSocket
const clients = new Map();

// chatId -> messages[]
const chats = new Map();

/* =====================
   Utils
===================== */
function getChatId(a, b) {
  return [a, b].sort().join("_");
}

function safeSend(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/* =====================
   WebSocket
===================== */
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    console.warn("❌ WS connection without clientId");
    ws.close();
    return;
  }

  clients.set(clientId, ws);
  console.log(`🟢 WS connected: ${clientId}`);

  /* ===== Incoming WS messages ===== */
  ws.on("message", (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch (e) {
      console.error("❌ WS JSON parse error:", raw.toString());
      return;
    }

    /* =====================
       WebRTC signaling
    ===================== */
    if (data.type?.startsWith("call:")) {
      const { to } = data;
      const target = clients.get(to);

      console.log(
        `📡 signaling ${data.type} from ${clientId} → ${to}`
      );

      safeSend(target, {
        ...data,
        from: clientId,
      });

      return;
    }

    console.warn("⚠️ Unknown WS message:", data);
  });

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(`🔴 WS disconnected: ${clientId}`);
  });

  ws.on("error", (err) => {
    console.error(`❌ WS error (${clientId}):`, err);
  });
});

/* =====================
   REST API
===================== */

/**
 * POST /messages
 * body: { from, to, text }
 */
app.post("/messages", (req, res) => {
  const { from, to, text } = req.body;

  if (!from || !to || !text?.trim()) {
    return res.status(400).json({
      error: "from, to, text обязательны",
    });
  }

  const chatId = getChatId(from, to);

  if (!chats.has(chatId)) {
    chats.set(chatId, []);
  }

  const message = {
    id: uuid(),
    chatId,
    from,
    to,
    text,
    createdAt: new Date().toISOString(),
  };

  chats.get(chatId).push(message);

  // 🔥 пушим ОБОИМ участникам
  [from, to].forEach((clientId) => {
    safeSend(clients.get(clientId), {
      type: "message",
      payload: message,
    });
  });

  res.status(201).json(message);
});

/**
 * GET /chat/:clientA/:clientB
 */
app.get("/chat/:clientA/:clientB", (req, res) => {
  const { clientA, clientB } = req.params;

  if (!clientA || !clientB) {
    return res.json([]);
  }

  const chatId = getChatId(clientA, clientB);
  res.json(chats.get(chatId) ?? []);
});

/**
 * DELETE /chat/:clientA/:clientB
 */
app.delete("/chat/:clientA/:clientB", (req, res) => {
  const { clientA, clientB } = req.params;

  if (!clientA || !clientB) {
    return res.status(400).json({
      error: "clientA и clientB обязательны",
    });
  }

  const chatId = getChatId(clientA, clientB);
  chats.delete(chatId);

  console.log(`🗑️ Chat history deleted: ${chatId}`);

  [clientA, clientB].forEach((clientId) => {
    safeSend(clients.get(clientId), {
      type: "chat_deleted",
      payload: { chatId },
    });
  });

  res.status(204).end();
});


/**
 * GET /chats/:clientId
 * Возвращает список всех собеседников, с которыми есть чат
 */
app.get("/chats/:clientId", (req, res) => {
  const { clientId } = req.params;

  if (!clientId) {
    return res.status(400).json({ error: "clientId reqired" });
  }

  const contactsSet = new Set();

  for (const chatId of chats.keys()) {
    const [a, b] = chatId.split("_");

    if (a === clientId) contactsSet.add(b);
    else if (b === clientId) contactsSet.add(a);
  }

  const contacts = Array.from(contactsSet);
  res.json(contacts);
});



/* =====================
   Start server
===================== */
const PORT = 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
