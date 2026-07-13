# MailDotNull

A local mail catcher (like Mailpit) that also emulates the HTTP send APIs of popular email providers (Resend, SendGrid, Mailjet, Mailgun, Postmark, Brevo, Amazon SES). Services point their SDKs at MailDotNull; every message lands in a live web inbox. Nothing is delivered, nothing is persisted — in-memory only, any API key is accepted.

## Stack

- **Runtime**: Node.js, **pnpm only** (`packageManager: pnpm@10.30.0`) — do not use npm or yarn.
- **Server**: Hono 4 + `@hono/node-server` (HTTP server), esbuild for the server bundle.
- **Client**: Vite 7 + React 19 SPA, TypeScript strict mode.
- **UI**: Tailwind CSS 4 (via `@tailwindcss/vite`), `lucide-react` icons, `clsx` for conditional classes.
- **Mail**: `smtp-server` for the SMTP listener, `mailparser` for MIME parsing.
- **No database, no auth, no test framework** — deliberate: the whole product is an ephemeral in-memory dev tool.

## Design Principles

- **In-memory only**: all state lives in `src/lib/store.ts`. Never add a database, file persistence, or external service. A restart clearing the inbox is a feature.
- **Provider fidelity**: emulated endpoints must return each provider's real success shape (message IDs, `Queued. Thank you.`, HTTP 202 + `X-Message-Id`, …) so official SDKs treat the send as successful.
- **Accept everything**: any API key/credentials are valid. Never add key validation or rate limiting.

## Architecture

- `src/lib/store.ts` — singleton in-memory store (cap: 1000 messages, oldest dropped) with an `EventEmitter` that drives the SSE stream.
- `src/lib/ingest.ts` — the single entry point every source (SMTP + all HTTP providers) must use to add a message.
- `src/lib/smtp.ts` — SMTP server on port 1025 (override with `MAILDOTNULL_SMTP_PORT`); started by the Vite dev plugin (`vite.config.ts`) in dev and by `src/server/index.ts` in production.
- `src/lib/providers.ts` — provider registry: label, badge classes, endpoint, and connection hint shown in the UI cheat-sheet.
- `src/lib/types.ts` — `MailSource`, `StoredEmail`, and related shared types.
- `src/server/app.ts` — Hono routing table, exports `app` + `API_PREFIXES`.
- `src/server/routes/{inbox,events,error-testing,link-check}.ts` — internal inbox API (list/get/delete messages, attachment download, `GET /api/events` SSE stream). Documented in README's "Inbox API" section — keep both in sync.
- Provider emulation lives in `src/server/routes/providers/{resend,sendgrid,mailjet,mailgun,postmark,brevo,ses}.ts`, registered in `src/server/app.ts` at the paths the real SDKs call (Resend `/emails`, SendGrid `/v3/mail/send`, Mailjet `/v3.1/send`, Mailgun `/v3/:domain/messages`, Postmark `/email` + `/email/batch`, Brevo `/v3/smtp/email`, SES v2 `/v2/email/outbound-emails` with `Simple` and raw MIME) — the Mailgun param route is registered last.
- `src/server/index.ts` — production entry: serves the built SPA and API on port 8025, boots SMTP.
- `src/components/inbox.tsx` — the entire web UI, a single client component.
- Server code (`src/server/`, `src/lib/`) uses relative imports because it's loaded through the Vite config bundle; the `@/*` alias is for client code only.

## Conventions

- **Web UI runs on port 8025** (`pnpm dev` / `pnpm start`); SMTP on 1025. Don't change ports — they mirror Mailpit's defaults.
- **Run `pnpm check` before finishing** — it chains lint, `tsc --noEmit`, and the Vite/esbuild build.
- **Adding a provider** touches five places: a handler in `src/server/routes/providers/`, its registration in `src/server/app.ts` (before the Mailgun param route), the `MailSource` union in `src/lib/types.ts`, the `PROVIDERS` registry in `src/lib/providers.ts`, and a README table row. All ingestion goes through `ingest()`.
- **Icons**: `lucide-react` only. Do not add other icon libraries.
- **Styling**: Tailwind utility classes only; conditional classes via `clsx`. No CSS modules, no styled-components, no inline style objects.
- **Dark mode**: supported via Tailwind `dark:` variants — every new UI element needs both variants.
- **Path alias**: `@/*` maps to `src/*`.
- **Linting**: ESLint 9 flat config (`eslint.config.mjs`); `pnpm lint` / `pnpm lint:fix`.
- **Logging**: minimal `console` logging is acceptable (local dev tool), but **never log message bodies, attachments, or credentials** — log message IDs and counts only.
- **Error handling**: validate at the HTTP/SMTP boundary and return the provider's real error shape; trust types internally. No defensive try/catch for impossible states.
- **Security**: rendered HTML bodies must stay inside the fully sandboxed iframe — never relax the `sandbox` attribute or render message HTML directly.
- **i18n**: English only. Do not add an i18n framework.
- **Environment variables**: `MAILDOTNULL_SMTP_PORT` is the only one. Document any new var in the README.
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
