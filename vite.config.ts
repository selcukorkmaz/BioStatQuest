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
        terms: resolve(__dirname, "terms.html"),
        cookies: resolve(__dirname, "cookies.html"),
        forEducators: resolve(__dirname, "for-educators.html"),
        verify: resolve(__dirname, "verify.html"),
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "vendor-supabase";
          if (/[\\/]node_modules[\\/]ts-fsrs[\\/]/.test(id)) return "vendor-fsrs";
          if (/[\\/]node_modules[\\/]@vercel[\\/]analytics[\\/]/.test(id)) return "vendor-analytics";
          return "vendor";
        },
      },
    },
  },
});
