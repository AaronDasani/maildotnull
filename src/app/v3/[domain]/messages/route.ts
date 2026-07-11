import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ingest } from "@/lib/ingest";
import { applyHttpFault } from "@/lib/error-testing";
import { splitAddressList } from "@/lib/addresses";
import type { StoredAttachment } from "@/lib/types";

/**
 * Mailgun — POST https://api.mailgun.net/v3/{domain}/messages (multipart or urlencoded)
 * Point the SDK at this server: `mailgun.client({ username: "api", key: "mock", url: "http://localhost:8025" })`
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ domain: string }> }
) {
  const { domain } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ message: "Invalid form body" }, { status: 400 });
  }

  const getAll = (name: string) =>
    form.getAll(name).flatMap((v) => (typeof v === "string" ? splitAddressList(v) : []));
  const get = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : undefined;
  };

  const from = get("from");
  const to = getAll("to");
  if (!from || to.length === 0) {
    return NextResponse.json({ message: "'from' or 'to' parameter is missing" }, { status: 400 });
  }

  const failure = await applyHttpFault("mailgun");
  if (failure) return failure;

  const attachments: StoredAttachment[] = [];
  for (const value of [...form.getAll("attachment"), ...form.getAll("inline")]) {
    if (value instanceof File) {
      attachments.push({
        filename: value.name || "attachment",
        contentType: value.type || "application/octet-stream",
        size: value.size,
        content: Buffer.from(await value.arrayBuffer()).toString("base64"),
      });
    }
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("h:") && typeof value === "string") headers[key.slice(2)] = value;
  }

  const rawLines = [...form.entries()].map(([key, value]) =>
    value instanceof File ? `${key}: <file ${value.name || "attachment"}, ${value.size} bytes>` : `${key}: ${value}`
  );

  ingest({
    source: "mailgun",
    from,
    to,
    cc: getAll("cc"),
    bcc: getAll("bcc"),
    replyTo: headers["Reply-To"],
    subject: get("subject") ?? "",
    text: get("text"),
    html: get("html"),
    headers,
    attachments,
    raw: rawLines.join("\n"),
  });

  return NextResponse.json({
    id: `<${randomUUID()}@${domain}>`,
    message: "Queued. Thank you.",
  });
}
