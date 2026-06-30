import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API routes are proxied to the backend so the browser only ever talks to the
// Vite origin. This makes it work identically on localhost AND in cloud IDEs
// (Codespaces/Gitpod), where "localhost:4000" from the browser wouldn't resolve.
const apiPrefixes =
  "^/(auth|clients|invoices|dashboard|transactions|categories|leave-types|leave-requests|attendance|balances|my|reports|reminders|admin|health)(/|$)";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      [apiPrefixes]: { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
