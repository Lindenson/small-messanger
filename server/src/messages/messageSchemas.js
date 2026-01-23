const { z } = require("zod");

const sendMessageSchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    text: z.string().min(1)
});

const getChatSchema = z.object({
    clientA: z.string().min(1),
    clientB: z.string().min(1)
});

const getChatsSchema = z.object({
    clientId: z.string().min(1)
});

module.exports = { sendMessageSchema, getChatSchema, getChatsSchema };
