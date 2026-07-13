import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app";
import { startSmtpServer } from "../lib/smtp";

const PORT = Number(process.env.PORT ?? 8025);

// Static SPA build. Registered after the API routes (module load order in
// app.ts), so /api and provider paths always win. Paths are relative to the
// process working directory — run from the repo root (or /app in Docker).
app.use("*", serveStatic({ root: "./dist/client" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`[maildotnull] web UI and provider APIs listening on port ${info.port} (all interfaces)`);
});

await startSmtpServer();
