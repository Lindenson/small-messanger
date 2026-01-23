const axios = require("axios");

const KRATOS_URL = "http://kratos:4433";

async function authenticate(req) {
    const cookies = req.headers.cookie;
    if (!cookies) return null;

    try {
        const res = await axios.get(
            `${KRATOS_URL}/sessions/whoami`,
            { headers: { cookie: cookies } }
        );

        return res.data.identity; // { id, traits }
    } catch {
        return null;
    }
}

module.exports = { authenticate };
