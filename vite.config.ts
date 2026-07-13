import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { getRequestListener } from "@hono/node-server";
import { app, API_PREFIXES } from "./src/server/app";
import { startSmtpServer } from "./src/lib/smtp";

// Survives in-process dev-server restarts (config edits) so the SMTP ports
// are not re-bound; a full process restart picks them up fresh.
const boot = globalThis as unknown as { __maildotnullSmtpStarted?: boolean };

/** Mount the Hono app (inbox API + provider emulation) on the dev server and boot SMTP. */
function apiPlugin(): Plugin {
  return {
    name: "maildotnull-api",
    async configureServer(server) {
      if (!boot.__maildotnullSmtpStarted) {
        boot.__maildotnullSmtpStarted = true;
        await startSmtpServer();
      }
      const listener = getRequestListener(app.fetch);
      server.middlewares.use((req, res, next) => {
        if (API_PREFIXES.some((prefix) => req.url?.startsWith(prefix))) {
          return void listener(req, res);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 8025,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: "dist/client",
  },
});
