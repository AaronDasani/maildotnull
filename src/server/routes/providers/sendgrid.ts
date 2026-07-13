import type { Context } from "hono";
import { randomUUID } from "node:crypto";
import { base64Size, ingest } from "../../../lib/ingest";
import { applyHttpFault } from "../../../lib/error-testing";
import { formatAddress } from "../../../lib/addresses";

interface SendGridAddress {
  email: string;
  name?: string;
}

interface SendGridPersonalization {
  to?: SendGridAddress[];
  cc?: SendGridAddress[];
  bcc?: SendGridAddress[];
  subject?: string;
}

/**
 * SendGrid — POST https://api.sendgrid.com/v3/mail/send
 * Point the SDK at this server: `sgClient.setDefaultRequest("baseUrl", "http://localhost:8025")`
 */
export async function handleSendgrid(c: Context) {
  let body: {
    personalizations?: SendGridPersonalization[];
    from?: SendGridAddress;
    reply_to?: SendGridAddress;
    subject?: string;
    content?: { type: string; value: string }[];
    attachments?: { content: string; filename?: string; type?: string }[];
    headers?: Record<string, string>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ errors: [{ message: "Invalid JSON body", field: null, help: null }] }, 400);
  }

  const personalizations = body.personalizations ?? [];
  if (!body.from?.email || personalizations.length === 0) {
    return c.json(
      { errors: [{ message: "Missing from or personalizations", field: null, help: null }] },
      400
    );
  }

  const failure = await applyHttpFault("sendgrid");
  if (failure) return failure;

  const text = body.content?.find((x) => x.type === "text/plain")?.value;
  const html = body.content?.find((x) => x.type === "text/html")?.value;
  const attachments = (body.attachments ?? []).map((a) => ({
    filename: a.filename ?? "attachment",
    contentType: a.type ?? "application/octet-stream",
    size: base64Size(a.content),
    content: a.content,
  }));

  // Each personalization is a separate message, like the real API.
  for (const p of personalizations) {
    ingest({
      source: "sendgrid",
      from: formatAddress(body.from.email, body.from.name),
      to: (p.to ?? []).map((a) => formatAddress(a.email, a.name)),
      cc: (p.cc ?? []).map((a) => formatAddress(a.email, a.name)),
      bcc: (p.bcc ?? []).map((a) => formatAddress(a.email, a.name)),
      replyTo: body.reply_to ? formatAddress(body.reply_to.email, body.reply_to.name) : undefined,
      subject: p.subject ?? body.subject ?? "",
      text,
      html,
      headers: body.headers ?? {},
      attachments,
      raw: JSON.stringify(body, null, 2),
    });
  }

  return c.body(null, 202, { "X-Message-Id": randomUUID() });
}
