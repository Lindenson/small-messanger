import { z } from "zod";

export const ContactSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    last: z.string().min(0),
    email: z.email().min(1),
    online: z.boolean(),
});

export type Contact = z.infer<typeof ContactSchema>;
