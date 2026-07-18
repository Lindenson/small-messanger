// Minimal zero-dependency static server for the built SPA.
// Deploy target: /opt/front4mess on the backend host, run under Node on port 5555,
// behind the same Ory edge as the messenger (same origin → the Kratos cookie applies).
//
//   npm ci && npm run build      # produces ./dist
//   PORT=5555 node server.mjs    # serves ./dist, SPA-fallback to index.html
//
// The app calls the messenger host-relative (/messenger/api, /messenger/ws) and Kratos
// at /.ory/kratos/public, so the edge must route those paths and this app's "/" to :5555.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const PORT = Number(process.env.PORT) || 5555;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
};

async function sendFile(res, path) {
    const body = await readFile(path);
    res.writeHead(200, {
        "Content-Type": MIME[extname(path)] || "application/octet-stream",
    });
    res.end(body);
}

const server = createServer(async (req, res) => {
    try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        // Contain the path within DIST (no traversal).
        const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
        const candidate = join(DIST, rel);

        if (candidate.startsWith(DIST)) {
            try {
                const s = await stat(candidate);
                if (s.isFile()) return await sendFile(res, candidate);
            } catch {
                // fall through to SPA fallback
            }
        }
        // SPA fallback: any non-file route renders index.html (client-side routing).
        return await sendFile(res, join(DIST, "index.html"));
    } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal error");
    }
});

server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`front4mess serving ${DIST} on http://${HOST}:${PORT}`);
});
