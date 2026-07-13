import type { Context } from "hono";
import type { LinkCheckResult } from "../../lib/mail-checks";

// Checks are done server-side to avoid CORS; this only runs on the developer's machine.
const MAX_URLS = 100;
const TIMEOUT_MS = 10_000;

async function checkUrl(url: string): Promise<LinkCheckResult> {
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Some servers reject HEAD; retry those with GET before reporting a failure.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
    return { url, status: res.status, ok: res.ok };
  } catch (err) {
    return { url, ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function handleLinkCheck(c: Context) {
  let body: { urls?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON body" }, 400);
  }

  const urls = Array.isArray(body.urls)
    ? [...new Set(body.urls.filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)))]
    : [];
  if (urls.length === 0) {
    return c.json({ message: "urls must be a non-empty array of http(s) URLs" }, 400);
  }

  const results = await Promise.all(urls.slice(0, MAX_URLS).map(checkUrl));
  return c.json({ results });
}
