import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } }
  },
  build: { target: "es2020", chunkSizeWarningLimit: 1500 }
});
