import { getStore } from "./store";
import type { MailSource } from "./types";

export type HttpSource = Exclude<MailSource, "smtp">;

/** Fault applied to HTTP provider APIs. */
export type HttpFaultMode = "off" | "delay" | "rate-limit" | "server-error" | "timeout";
/** Per-provider override; "inherit" follows the global HTTP setting. */
export type ProviderFaultMode = "inherit" | HttpFaultMode;
/** Fault applied to the SMTP listeners (at MAIL FROM). */
export type SmtpFaultMode = "off" | "delay" | "timeout" | "reject-temporary" | "reject-permanent";
export type SmtpAuthMode = "optional" | "required";

export interface ErrorTestingState {
  /** Global fault for all HTTP provider APIs. */
  http: HttpFaultMode;
  /** Per-provider overrides of the global HTTP fault. */
  providers: Record<HttpSource, ProviderFaultMode>;
  smtp: SmtpFaultMode;
  smtpAuth: SmtpAuthMode;
  /** Seconds to wait when a "delay" fault applies. */
  delaySeconds: number;
}

export const HTTP_FAULT_MODES: HttpFaultMode[] = [
  "off",
  "delay",
  "rate-limit",
  "server-error",
  "timeout",
];
export const SMTP_FAULT_MODES: SmtpFaultMode[] = [
  "off",
  "delay",
  "timeout",
  "reject-temporary",
  "reject-permanent",
];

export const HTTP_SOURCES: HttpSource[] = [
  "resend",
  "sendgrid",
  "mailjet",
  "mailgun",
  "postmark",
  "brevo",
  "ses",
];

// A "timeout" fault can't hold the request forever; give up long after any sane client timeout.
const TIMEOUT_HOLD_MS = 5 * 60 * 1000;

function createState(): ErrorTestingState {
  return {
    http: "off",
    providers: {
      resend: "inherit",
      sendgrid: "inherit",
      mailjet: "inherit",
      mailgun: "inherit",
      postmark: "inherit",
      brevo: "inherit",
      ses: "inherit",
    },
    smtp: "off",
    smtpAuth: "optional",
    delaySeconds: 10,
  };
}

// Survives Next.js dev-mode HMR module reloads, same as the store.
const globalState = globalThis as unknown as { __maildotnullErrorTesting?: ErrorTestingState };

export function getErrorTesting(): ErrorTestingState {
  // Recreate if an HMR-surviving instance predates the current state shape.
  if (typeof globalState.__maildotnullErrorTesting?.http !== "string") {
    globalState.__maildotnullErrorTesting = createState();
  }
  return globalState.__maildotnullErrorTesting;
}

export function updateErrorTesting(patch: {
  http?: HttpFaultMode;
  providers?: Partial<Record<HttpSource, ProviderFaultMode>>;
  smtp?: SmtpFaultMode;
  smtpAuth?: SmtpAuthMode;
  delaySeconds?: number;
}): ErrorTestingState {
  const state = getErrorTesting();
  if (patch.http) state.http = patch.http;
  Object.assign(state.providers, patch.providers);
  if (patch.smtp) state.smtp = patch.smtp;
  if (patch.smtpAuth) state.smtpAuth = patch.smtpAuth;
  if (patch.delaySeconds !== undefined) state.delaySeconds = patch.delaySeconds;
  // Piggyback on the mailbox SSE stream so open UIs refresh their view of the state.
  getStore().emitter.emit("change");
  return state;
}

/** The fault that applies to a provider: its override, or the global HTTP setting. */
export function effectiveHttpFault(state: ErrorTestingState, source: HttpSource): HttpFaultMode {
  const override = state.providers[source];
  return override === "inherit" ? state.http : override;
}

interface FailureResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

// Each provider's real error shape, so official SDKs raise their typed errors.
const FAILURE_RESPONSES: Record<
  HttpSource,
  { "rate-limit": FailureResponse; "server-error": FailureResponse }
> = {
  resend: {
    "rate-limit": {
      status: 429,
      body: {
        statusCode: 429,
        name: "rate_limit_exceeded",
        message: "Too many requests (simulated by MailDotNull).",
      },
    },
    "server-error": {
      status: 500,
      body: {
        statusCode: 500,
        name: "application_error",
        message: "An unexpected error occurred (simulated by MailDotNull).",
      },
    },
  },
  sendgrid: {
    "rate-limit": {
      status: 429,
      body: {
        errors: [{ message: "too many requests (simulated by MailDotNull)", field: null, help: null }],
      },
    },
    "server-error": {
      status: 500,
      body: {
        errors: [{ message: "internal server error (simulated by MailDotNull)", field: null, help: null }],
      },
    },
  },
  mailjet: {
    "rate-limit": {
      status: 429,
      body: { ErrorMessage: "Too many requests (simulated by MailDotNull).", StatusCode: 429 },
    },
    "server-error": {
      status: 500,
      body: { ErrorMessage: "Internal server error (simulated by MailDotNull).", StatusCode: 500 },
    },
  },
  mailgun: {
    "rate-limit": {
      status: 429,
      body: { message: "Too many requests (simulated by MailDotNull)." },
    },
    "server-error": {
      status: 500,
      body: { message: "Internal server error (simulated by MailDotNull)." },
    },
  },
  postmark: {
    "rate-limit": {
      status: 429,
      body: { ErrorCode: 429, Message: "Rate limit exceeded (simulated by MailDotNull)." },
    },
    "server-error": {
      status: 500,
      body: { ErrorCode: 0, Message: "Internal server error (simulated by MailDotNull)." },
    },
  },
  brevo: {
    "rate-limit": {
      status: 429,
      body: { code: "too_many_requests", message: "Too many requests (simulated by MailDotNull)." },
    },
    "server-error": {
      status: 500,
      body: { code: "internal_error", message: "Internal server error (simulated by MailDotNull)." },
    },
  },
  ses: {
    "rate-limit": {
      status: 429,
      body: {
        __type: "TooManyRequestsException",
        message: "Too many requests (simulated by MailDotNull).",
      },
      headers: { "x-amzn-errortype": "TooManyRequestsException" },
    },
    "server-error": {
      status: 500,
      body: { __type: "InternalFailure", message: "Internal server error (simulated by MailDotNull)." },
      headers: { "x-amzn-errortype": "InternalFailure" },
    },
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Apply the configured fault for a provider. Returns the error response to send,
 * or null when the request should proceed (possibly after a delay).
 */
export async function applyHttpFault(source: HttpSource): Promise<Response | null> {
  const state = getErrorTesting();
  const mode = effectiveHttpFault(state, source);
  switch (mode) {
    case "off":
      return null;
    case "delay":
      await sleep(state.delaySeconds * 1000);
      return null;
    case "timeout":
      // Hold the request open so the client's own timeout fires; 504 as a backstop.
      await sleep(TIMEOUT_HOLD_MS);
      return Response.json({ message: "Simulated timeout (MailDotNull)." }, { status: 504 });
    default: {
      const { status, body, headers } = FAILURE_RESPONSES[source][mode];
      return Response.json(body, { status, headers });
    }
  }
}
