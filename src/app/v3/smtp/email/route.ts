import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { base64Size, ingest } from "@/lib/ingest";
import { formatAddress } from "@/lib/addresses";

interface BrevoAddress {
  email: string;
  name?: string;
}

/**
 * Brevo (Sendinblue) — POST https://api.brevo.com/v3/smtp/email
 * Point the SDK at this server by overriding its base path to `http://localhost:8025/v3`.
 */
export async function POST(req: NextRequest) {
  let body: {
    sender?: BrevoAddress;
    to?: BrevoAddress[];
    cc?: BrevoAddress[];
    bcc?: BrevoAddress[];
    replyTo?: BrevoAddress;
    subject?: string;
    htmlContent?: string;
    textContent?: string;
    headers?: Record<string, string>;
    attachment?: { content?: string; name?: string; url?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { code: "invalid_parameter", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.sender?.email || !body.to?.length) {
    return NextResponse.json(
      { code: "missing_parameter", message: "sender and to are required" },
      { status: 400 }
    );
  }

  ingest({
    source: "brevo",
    from: formatAddress(body.sender.email, body.sender.name),
    to: body.to.map((a) => formatAddress(a.email, a.name)),
    cc: (body.cc ?? []).map((a) => formatAddress(a.email, a.name)),
    bcc: (body.bcc ?? []).map((a) => formatAddress(a.email, a.name)),
    replyTo: body.replyTo ? formatAddress(body.replyTo.email, body.replyTo.name) : undefined,
    subject: body.subject ?? "",
    text: body.textContent,
    html: body.htmlContent,
    headers: body.headers ?? {},
    attachments: (body.attachment ?? [])
      .filter((a) => a.content)
      .map((a) => ({
        filename: a.name ?? "attachment",
        contentType: "application/octet-stream",
        size: base64Size(a.content ?? ""),
        content: a.content ?? "",
      })),
    raw: JSON.stringify(body, null, 2),
  });

  return NextResponse.json({ messageId: `<${randomUUID()}@mailburli>` }, { status: 201 });
}
