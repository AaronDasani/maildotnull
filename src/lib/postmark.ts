import { randomUUID } from "node:crypto";
import { base64Size, ingest } from "./ingest";
import { splitAddressList } from "./addresses";

export interface PostmarkMessage {
  From?: string;
  To?: string;
  Cc?: string;
  Bcc?: string;
  ReplyTo?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Headers?: { Name: string; Value: string }[];
  Attachments?: { Name?: string; Content: string; ContentType?: string }[];
}

export function ingestPostmarkMessage(m: PostmarkMessage) {
  if (!m.From || !m.To) {
    return {
      ErrorCode: 300,
      Message: "Invalid 'From' or 'To' field.",
    };
  }
  ingest({
    source: "postmark",
    from: m.From,
    to: splitAddressList(m.To),
    cc: splitAddressList(m.Cc),
    bcc: splitAddressList(m.Bcc),
    replyTo: m.ReplyTo,
    subject: m.Subject ?? "",
    text: m.TextBody,
    html: m.HtmlBody,
    headers: Object.fromEntries((m.Headers ?? []).map((h) => [h.Name, h.Value])),
    attachments: (m.Attachments ?? []).map((a) => ({
      filename: a.Name ?? "attachment",
      contentType: a.ContentType ?? "application/octet-stream",
      size: base64Size(a.Content),
      content: a.Content,
    })),
    raw: JSON.stringify(m, null, 2),
  });
  return {
    To: m.To,
    SubmittedAt: new Date().toISOString(),
    MessageID: randomUUID(),
    ErrorCode: 0,
    Message: "OK",
  };
}
