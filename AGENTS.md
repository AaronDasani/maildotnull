# MailDotNull

A local mail catcher (like Mailpit) that also emulates the HTTP send APIs of popular email providers (Resend, SendGrid, Mailjet, Mailgun, Postmark, Brevo, Amazon SES). Services point their SDKs at MailDotNull; every message lands in a live web inbox. Nothing is delivered, nothing is persisted — in-memory only, any API key is accepted.

## Stack

- **Server**: Go 1.26+ (module `github.com/maildotnull/maildotnull`), single binary with the built SPA embedded via `go:embed`. Dependencies: `emersion/go-smtp` (SMTP listeners), `jhillyerd/enmime/v2` (MIME parsing), `google/uuid`.
- **Client**: Vite 7 + React 19 SPA, TypeScript strict mode; **pnpm only** (`packageManager: pnpm@10.30.0`) — do not use npm or yarn. Node is a build/dev-time dependency only.
- **UI**: Tailwind CSS 4 (via `@tailwindcss/vite`), `lucide-react` icons, `clsx` for conditional classes.
- **No database, no auth, no test framework** — deliberate: the whole product is an ephemeral in-memory dev tool.

## Design Principles

- **In-memory only**: all state lives in `internal/store`. Never add a database, file persistence, or external service. A restart clearing the inbox is a feature.
- **Provider fidelity**: emulated endpoints must return each provider's real success shape (message IDs, `Queued. Thank you.`, HTTP 202 + `X-Message-Id`, …) so official SDKs treat the send as successful.
- **Accept everything**: any API key/credentials are valid. Never add key validation or rate limiting.

## Architecture

Go server (all backend code lives under `internal/`, entry point `main.go`):

- `internal/store` — singleton in-memory store (cap: 1000 messages, oldest dropped) with channel-based subscribers that drive the SSE stream. `Store.Add` is the single ingestion entry point every source (SMTP + all HTTP providers) must use; JSON tags on `store.Email`/`store.Summary` are the wire contract with the SPA.
- `internal/smtpd` — the three SMTP listeners: 1025 plaintext (STARTTLS deliberately NOT advertised), 1587 STARTTLS, 1465 implicit TLS, with an ephemeral self-signed cert and accept-any AUTH (PLAIN + LOGIN). Ports overridable via `MAILDOTNULL_SMTP_PORT` / `MAILDOTNULL_STARTTLS_PORT` / `MAILDOTNULL_SMTPS_PORT`.
- `internal/mailutil` — address formatting/splitting and MIME parsing (enmime), including wire-casing header extraction shared by SMTP and SES raw sends.
- `internal/faults` — error-testing state (simulated provider/SMTP failures) and the per-provider failure response shapes.
- `internal/web` — the whole HTTP surface: `server.go` (routing table + SPA fallback + API-prefix 404s), `inbox.go`/`events.go`/`errortesting.go`/`linkcheck.go` (internal inbox API, documented in README's "Inbox API" section — keep both in sync), `providers.go` (all provider emulation handlers at the paths the real SDKs call: Resend `/emails`, SendGrid `/v3/mail/send`, Mailjet `/v3.1/send`, Mailgun `/v3/{domain}/messages`, Postmark `/email` + `/email/batch`, Brevo `/v3/smtp/email`, SES v2 `/v2/email/outbound-emails` with `Simple` and raw MIME). Literal routes beat the Mailgun `{domain}` wildcard via ServeMux precedence.
- `main.go` — embeds `dist/client` (`go:embed`), boots SMTP + HTTP on port 8025 (`MAILDOTNULL_HTTP_PORT` to override).

Client (TypeScript, under `src/`):

- `src/components/inbox.tsx` — the entire web UI, a single client component.
- `src/lib/providers.ts` — provider registry: label, badge classes, endpoint, and connection hint shown in the UI cheat-sheet.
- `src/lib/types.ts` — `MailSource`, `StoredEmail`, and related shared types (must mirror the Go JSON shapes).
- `src/lib/error-testing.ts` — client-side types for the error-testing panel (state lives in `internal/faults`).
- `src/lib/{mail-checks,dark-preview}.ts` — browser-only analysis/preview logic.
- Dev mode: the Vite plugin in `vite.config.ts` spawns the Go backend (`go run .`, HTTP on 8026) and proxies `/api`, `/email*`, `/v2`, `/v3*` to it; Vite serves the SPA with HMR on 8025.

## Conventions

- **Web UI runs on port 8025** (`pnpm dev` / `pnpm start`); SMTP on 1025. Don't change ports — they mirror Mailpit's defaults.
- **Run `pnpm check` before finishing** — it chains lint, `tsc --noEmit`, `go vet ./...`, and the full build (Vite + `go build`).
- **Adding a provider** touches five places: a handler in `internal/web/providers.go`, its route in `internal/web/server.go`, the `MailSource` union in `src/lib/types.ts`, the `PROVIDERS` registry in `src/lib/providers.ts`, and a README table row. Plus its failure shapes in `internal/faults`. All ingestion goes through `store.Add`.
- **Icons**: `lucide-react` only. Do not add other icon libraries.
- **Styling**: Tailwind utility classes only; conditional classes via `clsx`. No CSS modules, no styled-components, no inline style objects.
- **Dark mode**: supported via Tailwind `dark:` variants — every new UI element needs both variants.
- **Path alias**: `@/*` maps to `src/*`.
- **Linting**: ESLint 9 flat config (`eslint.config.mjs`); `pnpm lint` / `pnpm lint:fix`.
- **Logging**: minimal `console` logging is acceptable (local dev tool), but **never log message bodies, attachments, or credentials** — log message IDs and counts only.
- **Error handling**: validate at the HTTP/SMTP boundary and return the provider's real error shape; trust types internally. No defensive try/catch for impossible states.
- **Security**: rendered HTML bodies must stay inside the fully sandboxed iframe — never relax the `sandbox` attribute or render message HTML directly.
- **i18n**: English only. Do not add an i18n framework.
- **Environment variables**: `MAILDOTNULL_SMTP_PORT`, `MAILDOTNULL_STARTTLS_PORT`, `MAILDOTNULL_SMTPS_PORT`, `MAILDOTNULL_HTTP_PORT` — nothing else. Document any new var in the README.
- **Deployment**: none — this is a local dev tool, run via `pnpm dev` or `pnpm build && pnpm start`.

# Basic Behaviour

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
