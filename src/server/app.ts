import { Hono } from "hono";
import {
  listMessages,
  markAllRead,
  clearMessages,
  getMessage,
  patchMessage,
  deleteMessage,
  getAttachment,
} from "./routes/inbox";
import { handleEvents } from "./routes/events";
import { getErrorTestingState, putErrorTestingState } from "./routes/error-testing";
import { handleLinkCheck } from "./routes/link-check";
import { handleResend } from "./routes/providers/resend";
import { handleSendgrid } from "./routes/providers/sendgrid";
import { handleMailjet } from "./routes/providers/mailjet";
import { handleMailgun } from "./routes/providers/mailgun";
import { handlePostmark, handlePostmarkBatch } from "./routes/providers/postmark";
import { handleBrevo } from "./routes/providers/brevo";
import { handleSes } from "./routes/providers/ses";

/**
 * Path prefixes handled by this app. The Vite dev plugin forwards matching
 * requests here and leaves everything else (the SPA, HMR) to Vite.
 */
export const API_PREFIXES = ["/api/", "/email", "/emails", "/v2/", "/v3/", "/v3.1/"];

export const app = new Hono();

// Internal inbox API (documented in README "Inbox API").
app.get("/api/messages", listMessages);
app.patch("/api/messages", markAllRead);
app.delete("/api/messages", clearMessages);
app.get("/api/messages/:id", getMessage);
app.patch("/api/messages/:id", patchMessage);
app.delete("/api/messages/:id", deleteMessage);
app.get("/api/messages/:id/attachments/:index", getAttachment);
app.get("/api/events", handleEvents);
app.get("/api/error-testing", getErrorTestingState);
app.put("/api/error-testing", putErrorTestingState);
app.post("/api/link-check", handleLinkCheck);

// Provider emulation at the paths the real SDKs call.
app.post("/emails", handleResend); // Resend
app.post("/v3/mail/send", handleSendgrid); // SendGrid
app.post("/v3.1/send", handleMailjet); // Mailjet
app.post("/email", handlePostmark); // Postmark
app.post("/email/batch", handlePostmarkBatch); // Postmark batch
app.post("/v3/smtp/email", handleBrevo); // Brevo
app.post("/v2/email/outbound-emails", handleSes); // Amazon SES v2
// Param route registered last so the static /v3/... paths above win.
app.post("/v3/:domain/messages", handleMailgun); // Mailgun
