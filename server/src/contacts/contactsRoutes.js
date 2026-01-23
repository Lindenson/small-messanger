const express = require("express");
const { validate } = require("../common/zodMiddleware");
const { ContactSchema, LookupEmailSchema, IdsArraySchema } = require("./contactSchemas");
const { getIdentity, getAllIdentities } = require("./kratosClient");
const clients = require("../ws/wsClients");

const router = express.Router();

/**
 * POST /contacts
 * body: { ids: string[] }
 */
router.post(
    "/contacts",
    validate(IdsArraySchema),
    async (req, res) => {
        const { ids } = req.body;

        try {
            const contacts = [];

            for (const id of ids) {
                try {
                    const identity = await getIdentity(id);
                    contacts.push({
                        id: identity.id,
                        name: identity.traits.name || "",
                        last: identity.traits.last || "",
                        email: identity.traits.email,
                        online: clients.isOnline(identity.id),
                    });
                } catch {
                    // игнорируем ошибку для одного id
                }
            }

            res.json(contacts);
        } catch (err) {
            console.error("❌ /contacts error:", err.message);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

/**
 * POST /contacts/lookup
 * body: { email: string }
 */
router.post(
    "/contacts/lookup",
    validate(LookupEmailSchema),
    async (req, res) => {
        const { email } = req.body;

        try {
            const identities = await getAllIdentities();

            const user = identities.find(
                (i) => i.traits?.email?.toLowerCase() === email.toLowerCase()
            );

            if (!user) return res.json(null);

            res.json({
                id: user.id,
                name: user.traits.name || "",
                last: user.traits.last || "",
                email: user.traits.email,
                online: clients.isOnline(user.id),
            });
        } catch (err) {
            console.error("❌ /contacts/lookup error:", err.message);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

module.exports = router;
