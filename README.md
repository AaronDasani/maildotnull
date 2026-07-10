# Mailburli 📮

A local mail catcher like [Mailpit](https://mailpit.axllent.org/) — but it also emulates the HTTP APIs of popular email providers. Point your services at Mailburli instead of the real provider and every message lands in a live web inbox. Nothing is delivered, nothing is persisted (in-memory only), any API key is accepted.

## Run it

```bash
pnpm install
pnpm dev          # or: pnpm build && pnpm start
```

- **Web UI**: http://localhost:8025
- **SMTP**: `localhost:1025` (no TLS, auth optional, any credentials)

Override the SMTP port with `MAILBURLI_SMTP_PORT`.

## Connect your services

| Provider | Endpoint | How to point the SDK at Mailburli |
| --- | --- | --- |
| SMTP | `smtp://localhost:1025` | host `localhost`, port `1025` |
| Resend | `POST /emails` | `new Resend("re_mock", { baseUrl: "http://localhost:8025" })` |
| SendGrid | `POST /v3/mail/send` | `client.setDefaultRequest("baseUrl", "http://localhost:8025")` |
| Mailjet | `POST /v3.1/send` | `new Mailjet({ apiKey, apiSecret, config: { host: "localhost:8025" } })` |
| Mailgun | `POST /v3/{domain}/messages` | `mailgun.client({ username: "api", key: "mock", url: "http://localhost:8025" })` |
| Postmark | `POST /email`, `POST /email/batch` | `new ServerClient("mock", { requestHost: "localhost:8025", useHttps: false })` |
| Brevo | `POST /v3/smtp/email` | set the SDK base path to `http://localhost:8025/v3` |
| Amazon SES v2 | `POST /v2/email/outbound-emails` | `new SESv2Client({ endpoint: "http://localhost:8025", credentials: { accessKeyId: "mock", secretAccessKey: "mock" } })` |

Responses mimic each provider's success shape (message IDs, `Queued. Thank you.`, HTTP 202 + `X-Message-Id`, …) so SDKs treat the send as successful. SES supports both `Simple` and raw MIME (`Content.Raw.Data`) payloads.

## Inbox API

The UI talks to a small internal API you can also script against:

- `GET /api/messages` — list summaries
- `GET /api/messages/:id` — full message (marks it read)
- `GET /api/messages/:id/attachments/:index` — download an attachment
- `PATCH /api/messages` — mark all messages read
- `PATCH /api/messages/:id` — set read state (`{ "read": true | false }`)
- `DELETE /api/messages/:id` — delete one message
- `DELETE /api/messages` — clear the inbox
- `GET /api/events` — server-sent events stream (`change` events)
- `POST /api/link-check` — check `{ "urls": [...] }` and return each URL's HTTP status (used by the Link Check tab)

## Notes

- Messages live in memory; a restart clears the inbox. The store keeps the most recent 1000 messages.
- The SMTP server starts from `src/instrumentation.ts`, so it runs with both `pnpm dev` and `pnpm start`.
- HTML bodies render in a fully sandboxed iframe. The preview follows the app theme (with a per-mail light/dark override) and can be viewed at desktop, tablet (768px), and mobile (375px) widths.
- The mail view offers HTML, HTML Source, Text, Headers, Raw, HTML Check, and Link Check tabs. Raw shows the payload exactly as received (MIME for SMTP and SES raw sends, the request body for HTTP APIs); HTML Check flags features known to break in mail clients; Link Check verifies each link's HTTP status on demand.
