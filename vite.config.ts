import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Go backend serves the API + SMTP in dev; Vite proxies API paths to it.
const GO_DEV_PORT = 8026;

// Survives in-process dev-server restarts (config edits) so the Go backend
// is not re-spawned; a full process restart picks it up fresh.
const boot = globalThis as unknown as { __maildotnullGoProcess?: ChildProcess };

/** Run the Go backend (inbox API + provider emulation + SMTP) alongside Vite. */
function goBackendPlugin(): Plugin {
  return {
    name: "maildotnull-go-backend",
    configureServer() {
      if (boot.__maildotnullGoProcess) return;
      // go:embed needs dist/client to exist even in dev, where Vite serves the UI.
      if (!existsSync("dist/client/index.html")) {
        mkdirSync("dist/client", { recursive: true });
        writeFileSync("dist/client/index.html", "<!doctype html><title>maildotnull</title>run pnpm build\n");
      }
      const child = spawn("go", ["run", "."], {
        stdio: "inherit",
        env: { ...process.env, MAILDOTNULL_HTTP_PORT: String(GO_DEV_PORT) },
      });
      child.on("error", () => {
        console.error(
          "\n[maildotnull] failed to start the Go backend — is Go installed and on PATH?\n"
        );
      });
      boot.__maildotnullGoProcess = child;
      process.on("exit", () => child.kill());
    },
  };
}

const proxy = Object.fromEntries(
  // Prefix matches: /email also covers /emails and /email/batch; /v3 covers /v3.1.
  ["/api", "/email", "/v2", "/v3"].map((prefix) => [
    prefix,
    { target: `http://localhost:${GO_DEV_PORT}`, changeOrigin: false },
  ])
);

export default defineConfig({
  plugins: [react(), tailwindcss(), goBackendPlugin()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 8025,
    strictPort: true,
    host: true,
    proxy,
  },
  build: {
    outDir: "dist/client",
  },
});
