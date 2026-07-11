import type { MailSource } from "./types";

export interface ProviderInfo {
  label: string;
  /** Tailwind classes for the source badge */
  badge: string;
  /** Endpoint shown in the connection cheat-sheet */
  endpoint: string;
  /** How to point the client/SDK at MailDotNull */
  hint: string;
}

export const PROVIDERS: Record<MailSource, ProviderInfo> = {
  smtp: {
    label: "SMTP",
    badge: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
    endpoint: "smtp://localhost:1025 · :1587 (STARTTLS) · :1465 (TLS)",
    hint: "port 1025 (plain), 1587 (STARTTLS), 1465 (TLS) — self-signed cert, any credentials",
  },
  resend: {
    label: "Resend",
    badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    endpoint: "POST /emails",
    hint: 'new Resend("re_mock", { baseUrl: "http://localhost:8025" })',
  },
  sendgrid: {
    label: "SendGrid",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
    endpoint: "POST /v3/mail/send",
    hint: 'client.setDefaultRequest("baseUrl", "http://localhost:8025")',
  },
  mailjet: {
    label: "Mailjet",
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    endpoint: "POST /v3.1/send",
    hint: 'new Mailjet({ apiKey, apiSecret, config: { host: "localhost:8025" } })',
  },
  mailgun: {
    label: "Mailgun",
    badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    endpoint: "POST /v3/{domain}/messages",
    hint: 'mailgun.client({ username: "api", key: "mock", url: "http://localhost:8025" })',
  },
  postmark: {
    label: "Postmark",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    endpoint: "POST /email",
    hint: 'new ServerClient("mock", { requestHost: "localhost:8025", useHttps: false })',
  },
  brevo: {
    label: "Brevo",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    endpoint: "POST /v3/smtp/email",
    hint: 'set the SDK base path to "http://localhost:8025/v3"',
  },
  ses: {
    label: "Amazon SES",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    endpoint: "POST /v2/email/outbound-emails",
    hint: 'new SESv2Client({ endpoint: "http://localhost:8025", credentials: { accessKeyId: "mock", secretAccessKey: "mock" } })',
  },
};
