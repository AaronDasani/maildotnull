import { NextRequest, NextResponse } from "next/server";
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
} from "@/lib/error-testing";

export async function GET() {
  return NextResponse.json(getErrorTesting());
}

export async function PUT(req: NextRequest) {
  let body: {
    http?: string;
    providers?: Record<string, string>;
    smtp?: string;
    smtpAuth?: string;
    delaySeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.http !== undefined && !HTTP_FAULT_MODES.includes(body.http as HttpFaultMode)) {
    return NextResponse.json(
      { error: `Invalid http mode: ${body.http} (allowed: ${HTTP_FAULT_MODES.join(", ")})` },
      { status: 400 }
    );
  }

  const providers: Partial<Record<HttpSource, ProviderFaultMode>> = {};
  for (const [source, mode] of Object.entries(body.providers ?? {})) {
    if (!HTTP_SOURCES.includes(source as HttpSource)) {
      return NextResponse.json({ error: `Unknown provider: ${source}` }, { status: 400 });
    }
    if (mode !== "inherit" && !HTTP_FAULT_MODES.includes(mode as HttpFaultMode)) {
      return NextResponse.json(
        { error: `Invalid mode for ${source}: ${mode} (allowed: inherit, ${HTTP_FAULT_MODES.join(", ")})` },
        { status: 400 }
      );
    }
    providers[source as HttpSource] = mode as ProviderFaultMode;
  }

  if (body.smtp !== undefined && !SMTP_FAULT_MODES.includes(body.smtp as SmtpFaultMode)) {
    return NextResponse.json(
      { error: `Invalid smtp mode: ${body.smtp} (allowed: ${SMTP_FAULT_MODES.join(", ")})` },
      { status: 400 }
    );
  }

  if (body.smtpAuth !== undefined && body.smtpAuth !== "optional" && body.smtpAuth !== "required") {
    return NextResponse.json(
      { error: `Invalid smtpAuth: ${body.smtpAuth} (allowed: optional, required)` },
      { status: 400 }
    );
  }

  if (
    body.delaySeconds !== undefined &&
    (typeof body.delaySeconds !== "number" || body.delaySeconds < 1 || body.delaySeconds > 300)
  ) {
    return NextResponse.json(
      { error: "Invalid delaySeconds: must be a number between 1 and 300" },
      { status: 400 }
    );
  }

  return NextResponse.json(
    updateErrorTesting({
      http: body.http as HttpFaultMode | undefined,
      providers,
      smtp: body.smtp as SmtpFaultMode | undefined,
      smtpAuth: body.smtpAuth as SmtpAuthMode | undefined,
      delaySeconds: body.delaySeconds,
    })
  );
}
