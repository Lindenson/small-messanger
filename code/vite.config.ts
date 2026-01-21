import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: true, // 🔹 включаем sourcemaps
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // теперь @ = src/
    },
  },
});
