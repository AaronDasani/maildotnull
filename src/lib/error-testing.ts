// Client-side types for the error-testing panel. The state itself lives in
// the Go backend (internal/faults) and is managed via /api/error-testing.
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
