const express = require("express");
const eventBus = require("../bus/eventBus");
const { validate } = require("../common/zodMiddleware");
const { sendMessageSchema, getChatSchema, getChatsSchema } = require("./messageSchemas");
const { sendMessage, getChat, getChats, deleteChat} = require("./messageService");

const router = express.Router();

router.post(
    "/messages",
    validate(sendMessageSchema),
    (req, res) => {
        const msg = sendMessage(req.body);
        res.status(201).json(msg);
    }
);

router.get("/chat/:clientA/:clientB", (req, res) => {
    try {
        const { clientA, clientB } = getChatSchema.parse(req.params);
        const messages = getChat(clientA, clientB);
        res.json(messages);
    } catch (err) {
        return res.status(400).json(err.format());
    }
});

router.get("/chats/:clientId", (req, res) => {
    try {
        const { clientId } = getChatsSchema.parse(req.params);
        const contacts = getChats(clientId);
        res.json(contacts);
    } catch (err) {
        return res.status(400).json(err.format());
    }
});

router.delete("/chat/:clientA/:clientB", (req, res) => {
    try {
        const { clientA, clientB } = getChatSchema.parse(req.params);
        const deleted = deleteChat(clientA, clientB);
        if (!deleted) return res.status(404).json({ error: "Chat not found" });
        res.status(204).end();
    } catch (err) {
        res.status(400).json(err);
    }
});


module.exports = router;
