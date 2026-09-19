import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Development only: this proxy is what makes the browser see one origin
// locally, the same property the Netlify /api/* rewrite provides in a
// deployment (see apps/web/scripts/writeRedirects.mjs).
const API_TARGET = "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
