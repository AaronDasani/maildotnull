import type { Context } from "hono";
import {
  getErrorTesting,
  updateErrorTesting,
  HTTP_FAULT_MODES,
  SMTP_FAULT_MODES,
  HTTP_SOURCES,
  type HttpFaultMode,
  type HttpSource,
  type ProviderFaultMode,
  type SmtpFaultMode,
  type SmtpAuthMode,
} from "../../lib/error-testing";

export function getErrorTestingState(c: Context) {
  return c.json(getErrorTesting());
}

export async function putErrorTestingState(c: Context) {
  let body: {
    http?: string;
    providers?: Record<string, string>;
    smtp?: string;
    smtpAuth?: string;
    delaySeconds?: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.http !== undefined && !HTTP_FAULT_MODES.includes(body.http as HttpFaultMode)) {
    return c.json(
      { error: `Invalid http mode: ${body.http} (allowed: ${HTTP_FAULT_MODES.join(", ")})` },
      400
    );
  }

  const providers: Partial<Record<HttpSource, ProviderFaultMode>> = {};
  for (const [source, mode] of Object.entries(body.providers ?? {})) {
    if (!HTTP_SOURCES.includes(source as HttpSource)) {
      return c.json({ error: `Unknown provider: ${source}` }, 400);
    }
    if (mode !== "inherit" && !HTTP_FAULT_MODES.includes(mode as HttpFaultMode)) {
      return c.json(
        { error: `Invalid mode for ${source}: ${mode} (allowed: inherit, ${HTTP_FAULT_MODES.join(", ")})` },
        400
      );
    }
    providers[source as HttpSource] = mode as ProviderFaultMode;
  }

  if (body.smtp !== undefined && !SMTP_FAULT_MODES.includes(body.smtp as SmtpFaultMode)) {
    return c.json(
      { error: `Invalid smtp mode: ${body.smtp} (allowed: ${SMTP_FAULT_MODES.join(", ")})` },
      400
    );
  }

  if (body.smtpAuth !== undefined && body.smtpAuth !== "optional" && body.smtpAuth !== "required") {
    return c.json({ error: `Invalid smtpAuth: ${body.smtpAuth} (allowed: optional, required)` }, 400);
  }

  if (
    body.delaySeconds !== undefined &&
    (typeof body.delaySeconds !== "number" || body.delaySeconds < 1 || body.delaySeconds > 300)
  ) {
    return c.json({ error: "Invalid delaySeconds: must be a number between 1 and 300" }, 400);
  }

  return c.json(
    updateErrorTesting({
      http: body.http as HttpFaultMode | undefined,
      providers,
      smtp: body.smtp as SmtpFaultMode | undefined,
      smtpAuth: body.smtpAuth as SmtpAuthMode | undefined,
      delaySeconds: body.delaySeconds,
    })
  );
}
