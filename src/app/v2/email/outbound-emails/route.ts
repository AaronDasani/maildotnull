import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { simpleParser } from "mailparser";
import { headersFromParsed, ingest } from "@/lib/ingest";

interface SesContent {
  Simple?: {
    Subject?: { Data?: string };
    Body?: { Text?: { Data?: string }; Html?: { Data?: string } };
  };
  Raw?: { Data?: string };
}

/**
 * Amazon SES v2 — POST /v2/email/outbound-emails
 * Point the SDK at this server: `new SESv2Client({ endpoint: "http://localhost:8025", region: "eu-west-1", credentials: { accessKeyId: "mock", secretAccessKey: "mock" } })`
 */
export async function POST(req: NextRequest) {
  let body: {
    FromEmailAddress?: string;
    Destination?: { ToAddresses?: string[]; CcAddresses?: string[]; BccAddresses?: string[] };
    ReplyToAddresses?: string[];
    Content?: SesContent;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (body.Content?.Raw?.Data) {
    // Raw MIME message, base64-encoded — parse it like an SMTP delivery.
    const mime = Buffer.from(body.Content.Raw.Data, "base64");
    const parsed = await simpleParser(mime);
    const toList = parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [];
    ingest({
      source: "ses",
      from: body.FromEmailAddress ?? parsed.from?.text ?? "",
      to: body.Destination?.ToAddresses ?? toList.flatMap((t) => t.value.map((a) => a.address ?? "")),
      cc: body.Destination?.CcAddresses ?? [],
      bcc: body.Destination?.BccAddresses ?? [],
      subject: parsed.subject ?? "",
      text: parsed.text ?? undefined,
      html: parsed.html || undefined,
      headers: headersFromParsed(parsed),
      attachments: parsed.attachments.map((a) => ({
        filename: a.filename ?? "attachment",
        contentType: a.contentType,
        size: a.size,
        content: a.content.toString("base64"),
      })),
      raw: mime.toString("utf8"),
    });
    return NextResponse.json({ MessageId: randomUUID() });
  }

  if (!body.FromEmailAddress || !body.Destination?.ToAddresses?.length) {
    return NextResponse.json(
      { message: "FromEmailAddress and Destination.ToAddresses are required" },
      { status: 400 }
    );
  }

  ingest({
    source: "ses",
    from: body.FromEmailAddress,
    to: body.Destination.ToAddresses,
    cc: body.Destination.CcAddresses ?? [],
    bcc: body.Destination.BccAddresses ?? [],
    replyTo: body.ReplyToAddresses?.[0],
    subject: body.Content?.Simple?.Subject?.Data ?? "",
    text: body.Content?.Simple?.Body?.Text?.Data,
    html: body.Content?.Simple?.Body?.Html?.Data,
    raw: JSON.stringify(body, null, 2),
  });

  return NextResponse.json({ MessageId: randomUUID() });
}
