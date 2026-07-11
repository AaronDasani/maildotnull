import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { base64Size, ingest } from "@/lib/ingest";
import { applyHttpFault } from "@/lib/error-testing";
import { formatAddress } from "@/lib/addresses";

interface MailjetAddress {
  Email: string;
  Name?: string;
}

interface MailjetMessage {
  From?: MailjetAddress;
  To?: MailjetAddress[];
  Cc?: MailjetAddress[];
  Bcc?: MailjetAddress[];
  ReplyTo?: MailjetAddress;
  Subject?: string;
  TextPart?: string;
  HTMLPart?: string;
  Headers?: Record<string, string>;
  Attachments?: { ContentType?: string; Filename?: string; Base64Content: string }[];
}

/**
 * Mailjet — POST https://api.mailjet.com/v3.1/send
 * Point the SDK at this server: `new Mailjet({ apiKey, apiSecret, config: { host: "localhost:8025" } })`
 */
export async function POST(req: NextRequest) {
  let body: { Messages?: MailjetMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ErrorMessage: "Invalid JSON body", StatusCode: 400 },
      { status: 400 }
    );
  }

  const messages = body.Messages ?? [];
  if (messages.length === 0) {
    return NextResponse.json(
      { ErrorMessage: "Missing Messages array", StatusCode: 400 },
      { status: 400 }
    );
  }

  const failure = await applyHttpFault("mailjet");
  if (failure) return failure;

  const results = messages.map((m) => {
    ingest({
      source: "mailjet",
      from: m.From ? formatAddress(m.From.Email, m.From.Name) : "",
      to: (m.To ?? []).map((a) => formatAddress(a.Email, a.Name)),
      cc: (m.Cc ?? []).map((a) => formatAddress(a.Email, a.Name)),
      bcc: (m.Bcc ?? []).map((a) => formatAddress(a.Email, a.Name)),
      replyTo: m.ReplyTo ? formatAddress(m.ReplyTo.Email, m.ReplyTo.Name) : undefined,
      subject: m.Subject ?? "",
      text: m.TextPart,
      html: m.HTMLPart,
      headers: m.Headers ?? {},
      attachments: (m.Attachments ?? []).map((a) => ({
        filename: a.Filename ?? "attachment",
        contentType: a.ContentType ?? "application/octet-stream",
        size: base64Size(a.Base64Content),
        content: a.Base64Content,
      })),
      raw: JSON.stringify(m, null, 2),
    });
    return {
      Status: "success",
      To: (m.To ?? []).map((a) => ({
        Email: a.Email,
        MessageUUID: randomUUID(),
        MessageID: Math.floor(Math.random() * 1e15),
        MessageHref: "http://localhost:8025",
      })),
      Cc: [],
      Bcc: [],
    };
  });

  return NextResponse.json({ Messages: results });
}
