import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { base64Size, ingest } from "@/lib/ingest";
import { toArray } from "@/lib/addresses";

interface ResendAttachment {
  filename?: string;
  content?: string;
  content_type?: string;
}

/**
 * Resend — POST https://api.resend.com/emails
 * Point the SDK at this server: `new Resend("re_mock", { baseUrl: "http://localhost:8025" })`
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { statusCode: 400, name: "validation_error", message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const to = toArray(body.to as string | string[] | undefined);
  if (!body.from || to.length === 0) {
    return NextResponse.json(
      { statusCode: 422, name: "missing_required_field", message: "Missing `from` or `to` field" },
      { status: 422 }
    );
  }

  const attachments = ((body.attachments as ResendAttachment[] | undefined) ?? []).map((a) => ({
    filename: a.filename ?? "attachment",
    contentType: a.content_type ?? "application/octet-stream",
    size: a.content ? base64Size(a.content) : 0,
    content: a.content ?? "",
  }));

  ingest({
    source: "resend",
    from: String(body.from),
    to,
    cc: toArray(body.cc as string | string[] | undefined),
    bcc: toArray(body.bcc as string | string[] | undefined),
    replyTo: toArray((body.reply_to ?? body.replyTo) as string | string[] | undefined)[0],
    subject: body.subject ? String(body.subject) : "",
    text: body.text ? String(body.text) : undefined,
    html: body.html ? String(body.html) : undefined,
    headers: (body.headers as Record<string, string> | undefined) ?? {},
    attachments,
    raw: JSON.stringify(body, null, 2),
  });

  return NextResponse.json({ id: randomUUID() });
}
