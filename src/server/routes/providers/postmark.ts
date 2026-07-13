import type { Context } from "hono";
import { ingestPostmarkMessage, type PostmarkMessage } from "../../../lib/postmark";
import { applyHttpFault } from "../../../lib/error-testing";

/**
 * Postmark — POST https://api.postmarkapp.com/email
 * Point the SDK at this server: `new postmark.ServerClient("mock", { requestHost: "localhost:8025", useHttps: false })`
 */
export async function handlePostmark(c: Context) {
  let body: PostmarkMessage;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ErrorCode: 300, Message: "Invalid JSON body" }, 422);
  }
  const failure = await applyHttpFault("postmark");
  if (failure) return failure;

  const result = ingestPostmarkMessage(body);
  return c.json(result, result.ErrorCode === 0 ? 200 : 422);
}

/** Postmark batch — POST https://api.postmarkapp.com/email/batch */
export async function handlePostmarkBatch(c: Context) {
  let body: PostmarkMessage[];
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ErrorCode: 300, Message: "Invalid JSON body" }, 422);
  }
  if (!Array.isArray(body)) {
    return c.json({ ErrorCode: 300, Message: "Expected an array" }, 422);
  }
  const failure = await applyHttpFault("postmark");
  if (failure) return failure;

  return c.json(body.map(ingestPostmarkMessage));
}
