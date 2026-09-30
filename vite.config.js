import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Without this config Vite falls back to its default esbuild JSX transform and
// React Fast Refresh never engages. Keeping host/port here also means a plain
// `npm run dev` serves the LAN address, not just localhost.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // The API server (server/index.mjs) runs separately so it can be started,
    // restarted and scaled on its own; everything stays same-origin in the app.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        // SSE (/api/stream) must stream, not be buffered by the proxy.
        configure: (proxy) => proxy.on("proxyRes", (proxyRes) => {
          if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
            proxyRes.headers["cache-control"] = "no-cache, no-transform";
          }
        })
      }
    }
  },
  preview: {
    host: true,
    port: 5173
  }
});
