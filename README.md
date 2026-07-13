<p align="center">
  <img src="assets/logo.svg" alt="MailDotNull logo" width="96" height="96" />
</p>

<h1 align="center">MailDotNull</h1>

<p align="center">
  A local mail catcher and <strong>mock email server</strong> for Resend, SendGrid, Mailjet, Mailgun, Postmark, Brevo, Amazon SES — and plain SMTP.<br/>
  Nothing is delivered. Nothing is persisted. Any API key works.
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/inbox-dark.png" />
    <img src="assets/inbox-light.png" alt="MailDotNull inbox" />
  </picture>
</p>

## What it does

MailDotNull is a local mail catcher like [Mailpit](https://mailpit.axllent.org/) — but it also **mocks the HTTP send APIs** of popular email providers. Point your app's official SDK at MailDotNull instead of the real provider and every message lands in a live web inbox. No code changes, no test doubles in your app — just a different base URL.

Use it as a drop-in **Resend mock**, **SendGrid mock**, **Mailjet mock**, **Mailgun mock**, **Postmark mock**, **Brevo mock**, **Amazon SES mock**, or **mock SMTP server** during development, in integration tests, and in CI.

- **Provider-faithful responses** — each mock endpoint returns the provider's real success shape (message IDs, `Queued. Thank you.`, HTTP 202 + `X-Message-Id`, …), so official SDKs treat the send as successful.
- **Live inbox UI** — messages appear instantly via server-sent events; no refresh needed.
- **Responsive email preview** — see every mail at desktop, tablet, and mobile widths, and simulate how real clients render it in dark mode. [Details below.](#preview-emails-on-every-device)
- **Error testing** — make any provider (or SMTP) return rate limits, server errors, delays, or timeouts to test your app's error handling.
- **In-memory only** — no database, no files. A restart clears the inbox (that's a feature). Any API key or SMTP credentials are accepted.

## Quick start

### Docker

```bash
docker run -d --name maildotnull \
  -p 8025:8025 -p 1025:1025 -p 1587:1587 -p 1465:1465 \
  maildotnull/maildotnull
```

### Podman

```bash
podman run -d --name maildotnull \
  -e HOSTNAME=0.0.0.0 \
  -p 8025:8025 -p 1025:1025 -p 1587:1587 -p 1465:1465 \
  docker.io/maildotnull/maildotnull
```

`-e HOSTNAME=0.0.0.0` is needed for the `0.1.0` image: Podman sets `HOSTNAME` to the container hostname, which the server would otherwise use as its bind address. Images newer than `0.1.0` force the bind address themselves, so the flag becomes optional.

### From source

```bash
pnpm install
pnpm dev          # or: pnpm build && pnpm start
```

Then open:

- **Web UI + provider APIs**: http://localhost:8025
- **SMTP**: `localhost:1025` (plaintext, no STARTTLS, auth optional, any credentials)
- **SMTP + STARTTLS**: `localhost:1587`
- **SMTPS**: `localhost:1465` (implicit TLS)

Port 1025 never advertises STARTTLS, so clients that upgrade opportunistically (like nodemailer) keep working without TLS config. The certificate on 1587/1465 is self-signed and regenerated in memory on every start, so configure your client to accept it (e.g. nodemailer's `tls: { rejectUnauthorized: false }` — only for pointing at this local catcher, never for real mail servers).

### Send yourself a test message

```bash
curl http://localhost:8025/emails \
  -H "Authorization: Bearer re_anything" \
  -H "Content-Type: application/json" \
  -d '{"from": "Test <test@example.dev>", "to": ["you@example.com"], "subject": "Hello from MailDotNull", "text": "It works!"}'
```

It shows up in the inbox at http://localhost:8025 immediately.

## Connect your services

Each provider is mocked at the exact path its SDK calls, so switching is one config line:

| Provider | Mock endpoint | How to point the SDK at MailDotNull |
| --- | --- | --- |
| SMTP | `smtp://localhost:1025` / `:1587` / `:1465` | host `localhost`, port `1025` (plain), `1587` (STARTTLS), or `1465` (TLS) — TLS cert is self-signed |
| Resend | `POST /emails` | `new Resend("re_mock", { baseUrl: "http://localhost:8025" })` |
| SendGrid | `POST /v3/mail/send` | `client.setDefaultRequest("baseUrl", "http://localhost:8025")` |
| Mailjet | `POST /v3.1/send` | `new Mailjet({ apiKey, apiSecret, config: { host: "localhost:8025" } })` |
| Mailgun | `POST /v3/{domain}/messages` | `mailgun.client({ username: "api", key: "mock", url: "http://localhost:8025" })` |
| Postmark | `POST /email`, `POST /email/batch` | `new ServerClient("mock", { requestHost: "localhost:8025", useHttps: false })` |
| Brevo | `POST /v3/smtp/email` | set the SDK base path to `http://localhost:8025/v3` |
| Amazon SES v2 | `POST /v2/email/outbound-emails` | `new SESv2Client({ endpoint: "http://localhost:8025", credentials: { accessKeyId: "mock", secretAccessKey: "mock" } })` |

Responses mimic each provider's success shape so SDKs treat the send as successful. SES supports both `Simple` and raw MIME (`Content.Raw.Data`) payloads.

## Preview emails on every device

Every HTML mail renders in a fully sandboxed iframe with tools to check how it will actually look in your recipients' inboxes:

- **Device widths** — switch the preview between desktop, tablet (768px), and mobile (375px) to catch layouts that break on small screens.
- **Dark mode simulation** — preview follows the app theme with a per-mail light/dark override, and the dark preview simulates how real clients transform your mail: Gmail Android (partial inversion), Gmail iOS (full inversion), Apple Mail (honors the email's `prefers-color-scheme: dark` CSS), Outlook.com (partial inversion), and Yahoo Mail (no color changes) — each with its measured dark-theme background and text colors. The transforms approximate unpublished vendor algorithms; treat results as a close preview, not pixel truth.
- **HTML Check** — flags HTML/CSS features known to break in mail clients.
- **Link Check** — verifies each link's HTTP status on demand.
- **Inspect everything** — HTML Source, plain Text, Headers, and Raw tabs. Raw shows the payload exactly as received: MIME for SMTP and SES raw sends, the request body for HTTP API sends.

## Error testing

Make MailDotNull misbehave to test your app's error handling — configure it via the flask button in the header or `PUT /api/error-testing`. A failing send is rejected and not stored; error responses use each provider's real error shape so official SDKs raise their typed errors.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/error-testing-dark.png" />
    <img src="assets/error-testing-light.png" alt="Error testing panel — global delay, a per-provider 429 override for SendGrid, and an SMTP timeout" />
  </picture>
</p>

- `http` — fault for **all** HTTP provider APIs: `off`, `delay` (respond `delaySeconds` late, then succeed), `rate-limit` (429), `server-error` (500), or `timeout` (no response — your client's timeout fires).
- `providers` — per-provider override of `http`: `inherit` (default) or any of the modes above.
- `smtp` — `off`, `delay`, `timeout`, `reject-temporary` (451), or `reject-permanent` (550); applied at `MAIL FROM`.
- `smtpAuth` — `optional` (default) or `required`: when required, unauthenticated senders get `530 Authentication required` (any credentials still succeed).
- `delaySeconds` — how long the `delay` fault waits (1–300, default 10).

Settings reset on restart, like everything else.

## Inbox API

The UI talks to a small internal API you can also script against — handy for asserting on caught mail in integration tests:

- `GET /api/messages` — list summaries
- `GET /api/messages/:id` — full message (marks it read)
- `GET /api/messages/:id/attachments/:index` — download an attachment
- `PATCH /api/messages` — mark all messages read
- `PATCH /api/messages/:id` — set read state (`{ "read": true | false }`)
- `DELETE /api/messages/:id` — delete one message
- `DELETE /api/messages` — clear the inbox
- `GET /api/events` — server-sent events stream (`change` events)
- `POST /api/link-check` — check `{ "urls": [...] }` and return each URL's HTTP status (used by the Link Check tab)
- `GET /api/error-testing` — current error-testing state
- `PUT /api/error-testing` — partial update, e.g. `{ "http": "rate-limit", "providers": { "resend": "off" }, "smtp": "timeout", "smtpAuth": "required", "delaySeconds": 30 }`

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `MAILDOTNULL_SMTP_PORT` | `1025` | Plaintext SMTP port |
| `MAILDOTNULL_STARTTLS_PORT` | `1587` | SMTP port with STARTTLS |
| `MAILDOTNULL_SMTPS_PORT` | `1465` | SMTPS port (implicit TLS) |

The web UI and provider APIs run on port 8025 (fixed via `pnpm dev` / `pnpm start`; remap with Docker's `-p` if needed).

## Notes

- Messages live in memory; a restart clears the inbox. The store keeps the most recent 1000 messages.
- The SMTP server starts with the web server — in dev from the Vite plugin in `vite.config.ts`, in production from `src/server/index.ts` — so it runs with both `pnpm dev` and `pnpm start`.
- HTML bodies always render inside a fully sandboxed iframe — caught mail can't run scripts or touch the app.

## Releases

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds the Docker image (amd64 + arm64) and pushes it to Docker Hub as `maildotnull/maildotnull:<version>`, `:<major>.<minor>`, and `:latest`. Cut a release with:

```bash
scripts/release.sh 1.2.0
```

The workflow needs two repository secrets: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (a Docker Hub access token with read/write scope).

## License

[MIT](LICENSE)
