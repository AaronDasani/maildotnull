import type { Context } from "hono";
import { getStore } from "../../lib/store";

export function listMessages(c: Context) {
  return c.json(getStore().list());
}

export function markAllRead(c: Context) {
  getStore().markAllRead();
  return c.json({ ok: true });
}

export function clearMessages(c: Context) {
  getStore().clear();
  return c.json({ ok: true });
}

export function getMessage(c: Context<object, "/api/messages/:id">) {
  const id = c.req.param("id");
  const store = getStore();
  const email = store.get(id);
  if (!email) return c.json({ message: "Not found" }, 404);
  store.setRead(id, true);
  // Strip attachment contents from the detail payload; they are served separately.
  return c.json({
    ...email,
    read: true,
    attachments: email.attachments.map((a, index) => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      index,
    })),
  });
}

export async function patchMessage(c: Context<object, "/api/messages/:id">) {
  const id = c.req.param("id");
  let body: { read?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON body" }, 400);
  }
  if (typeof body.read !== "boolean") {
    return c.json({ message: "Expected { read: boolean }" }, 400);
  }
  if (!getStore().setRead(id, body.read)) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json({ ok: true });
}

export function deleteMessage(c: Context<object, "/api/messages/:id">) {
  const id = c.req.param("id");
  if (!getStore().remove(id)) {
    return c.json({ message: "Not found" }, 404);
  }
  return c.json({ ok: true });
}

export function getAttachment(c: Context<object, "/api/messages/:id/attachments/:index">) {
  const id = c.req.param("id");
  const index = c.req.param("index");
  const attachment = getStore().get(id)?.attachments[Number(index)];
  if (!attachment) return c.json({ message: "Not found" }, 404);
  return c.body(Buffer.from(attachment.content, "base64"), 200, {
    "Content-Type": attachment.contentType,
    "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
  });
}
