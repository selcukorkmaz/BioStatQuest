import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        biostatQuest: resolve(__dirname, "biostat-quest.html"),
        about: resolve(__dirname, "about.html"),
        sources: resolve(__dirname, "sources.html"),
        privacy: resolve(__dirname, "privacy.html"),
      },
    },
  },
});
