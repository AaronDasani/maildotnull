import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app, API_PREFIXES } from "./app";
import { startSmtpServer } from "../lib/smtp";

const PORT = 8025;

// API-prefixed paths that matched no route must 404, not fall into the SPA.
app.use("*", async (c, next) => {
  if (API_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))) return c.notFound();
  await next();
});

// Static SPA build. Registered after the API routes (module load order in
// app.ts), so /api and provider paths always win. Paths are relative to the
// process working directory — run from the repo root (or /app in Docker).
app.use("*", serveStatic({ root: "./dist/client" }));
app.get("*", serveStatic({ path: "./dist/client/index.html" }));

// "::" binds dual-stack so rootless podman/pasta can forward host ::1
// (localhost) connections as well as IPv4.
serve({ fetch: app.fetch, port: PORT, hostname: "::" }, (info) => {
  console.log(`[maildotnull] web UI and provider APIs listening on port ${info.port} (all interfaces)`);
});

await startSmtpServer();

// Node as PID 1 (Docker) ignores SIGTERM by default; exit so the container
// stops immediately instead of waiting for the 10s SIGKILL fallback.
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
