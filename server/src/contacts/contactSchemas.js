const { z } = require("zod");

exports.ContactSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(0),      // может быть пустым
    last: z.string().min(0),      // может быть пустым
    email: z.string().email().min(1),
    online: z.boolean(),
});

exports.LookupEmailSchema = z.object({
    email: z.string().email().min(1),
});

exports.IdsArraySchema = z.object({
    ids: z.array(z.string().min(1)).nonempty(),
});
