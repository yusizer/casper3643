import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy agent orchestrator + on-chain read calls to the data-feed/api server (CORS-safe).
      "/api": "http://localhost:4021",
      "/quorum": "http://localhost:4021",
    },
  },
});
