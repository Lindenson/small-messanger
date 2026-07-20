import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { VitePWA } from "vite-plugin-pwa";


export default defineConfig({
  plugins: [
      react(),
      tailwindcss(),
      // Installable PWA (home-screen install + offline app shell). scope/start_url derive from the
      // build `base` (--base=/messenger-ui/). autoUpdate so frequent redeploys don't leave a device
      // stuck on a stale cached bundle.
      VitePWA({
        registerType: "autoUpdate",
        // CDN-cache trap recovery: Cloudflare had cached BOTH the old `sw.js` AND `registerSW.js`
        // (stale precache manifest → chunk-hash mismatch → app crash) and they couldn't be purged.
        // Two changes sidestep the CDN entirely:
        //  - filename: a fresh SW URL the CDN never cached (served no-store so it never gets cached);
        //  - injectRegister "inline": the SW registration lives INLINE in index.html (which the CDN
        //    does not cache — DYNAMIC), so there is no cacheable registerSW.js bootstrap to go stale.
        filename: "app-sw.js",
        injectRegister: "inline",
        includeAssets: ["hormiga.jpeg"],
        manifest: {
          name: "Hormiga Messenger",
          short_name: "Hormiga",
          description: "Hormiga messenger",
          theme_color: "#134e4a",
          background_color: "#134e4a",
          display: "standalone",
          orientation: "portrait",
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
          cleanupOutdatedCaches: true,
          // Chat/IDS/Kratos APIs are outside the SW scope (/messenger-ui/) → never intercepted;
          // only the app shell is precached.
        },
      }),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true
      })
    ],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@ory/client")) return "ory";
            if (id.includes("react")) return "react";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
