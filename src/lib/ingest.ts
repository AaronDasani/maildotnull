import type { ParsedMail } from "mailparser";
import { getStore } from "./store";
import type { MailSource, StoredAttachment, StoredEmail } from "./types";

export interface IngestInput {
  source: MailSource;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: StoredAttachment[];
  raw?: string;
}

export function ingest(input: IngestInput): StoredEmail {
  return getStore().add({
    source: input.source,
    from: input.from,
    to: input.to,
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    replyTo: input.replyTo,
    subject: input.subject ?? "",
    text: input.text,
    html: input.html,
    headers: input.headers ?? {},
    attachments: input.attachments ?? [],
    raw: input.raw,
  });
}

export function base64Size(content: string): number {
  return Math.floor((content.length * 3) / 4);
}

/**
 * Headers as they appeared on the wire (original casing, unfolded), instead of
 * mailparser's structured objects, which stringify to JSON noise in the UI.
 * Repeated headers (e.g. Received) are joined with newlines.
 */
export function headersFromParsed(parsed: ParsedMail): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const { line } of parsed.headerLines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .replace(/[\r\n]+\s*/g, " ")
      .trim();
    headers[name] = headers[name] ? `${headers[name]}\n${value}` : value;
  }
  return headers;
}
