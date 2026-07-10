export type MailSource =
  | "smtp"
  | "resend"
  | "sendgrid"
  | "mailjet"
  | "mailgun"
  | "postmark"
  | "brevo"
  | "ses";

export interface StoredAttachment {
  filename: string;
  contentType: string;
  size: number;
  /** base64-encoded content */
  content: string;
}

export interface StoredEmail {
  id: string;
  source: MailSource;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  attachments: StoredAttachment[];
  /** Payload as received: MIME for SMTP/SES raw sends, request body for HTTP APIs. */
  raw?: string;
  receivedAt: string;
  read: boolean;
}

/** Listing shape sent to the UI (no bodies/attachments). */
export interface EmailSummary {
  id: string;
  source: MailSource;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  read: boolean;
  hasAttachments: boolean;
  snippet: string;
}
