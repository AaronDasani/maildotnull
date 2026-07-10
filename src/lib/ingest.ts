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
