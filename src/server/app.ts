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
