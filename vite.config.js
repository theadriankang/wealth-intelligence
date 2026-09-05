import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    port: 5173,
    // Explicit true (rather than leaving host unset) so Vite doesn't bind only to whatever
    // single address Node's DNS lookup for "localhost" happens to return first — on this
    // machine that was ::1 only, so anything connecting via 127.0.0.1 got ECONNREFUSED.
    host: true,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } }
  },
  build: { target: "es2020", chunkSizeWarningLimit: 1500 }
});
