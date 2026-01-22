import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";


export default defineConfig({
  plugins: [
      react(),
      tailwindcss(),
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
