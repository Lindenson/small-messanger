import { z } from "zod";

export const ChatMessageStatusSchema = z.enum(["pending", "sending", "sent", "failed"]);

export const ChatMessageSchema = z.object({
    id: z.string().min(1),
    chatId: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    text: z.string().min(1),
    createdAt: z.preprocess(
        (val) => {
            if (typeof val === "string" || typeof val === "number") {
                return new Date(val);
            }
            return val;
        },
        z.date(),
    ),
    status: z.preprocess(() => "sent", ChatMessageStatusSchema)
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
