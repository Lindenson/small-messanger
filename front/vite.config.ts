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
