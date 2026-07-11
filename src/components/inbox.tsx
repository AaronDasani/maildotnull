"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  CircleCheck,
  CircleX,
  Download,
  FlaskConical,
  Globe,
  Info,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MailOpen,
  Monitor,
  Moon,
  Paperclip,
  Search,
  Server,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { preparePreviewHtml } from "@/lib/dark-preview";
import type { EmailSummary, MailSource } from "@/lib/types";
import {
  extractLinks,
  runHtmlCheck,
  type CheckSeverity,
  type LinkCheckResult,
} from "@/lib/mail-checks";
import { PROVIDERS } from "@/lib/providers";
import type {
  ErrorTestingState,
  HttpFaultMode,
  HttpSource,
  ProviderFaultMode,
  SmtpAuthMode,
  SmtpFaultMode,
} from "@/lib/error-testing";
import { ThemeToggle, useAppDark } from "@/components/theme-toggle";

interface AttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  index: number;
}

interface EmailDetail {
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
  attachments: AttachmentMeta[];
  raw?: string;
  receivedAt: string;
}

type Tab = "html" | "source" | "text" | "headers" | "raw" | "html-check" | "link-check";
type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const DEVICES: { id: Device; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet (768px)", icon: Tablet },
  { id: "mobile", label: "Mobile (375px)", icon: Smartphone },
];

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

/** Time for today's mail, short date for anything older. */
function formatListTime(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? timeFormat.format(d)
    : dateFormat.format(d);
}

const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Every mail source except SMTP — the HTTP provider APIs, in registry order. */
const HTTP_PROVIDER_SOURCES = Object.keys(PROVIDERS).filter((s) => s !== "smtp") as HttpSource[];

type ErrorTestingPatch = {
  http?: HttpFaultMode;
  providers?: Partial<Record<HttpSource, ProviderFaultMode>>;
  smtp?: SmtpFaultMode;
  smtpAuth?: SmtpAuthMode;
  delaySeconds?: number;
};

const HTTP_FAULT_OPTIONS: { value: HttpFaultMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "delay", label: "Delay response" },
  { value: "rate-limit", label: "429 rate limit" },
  { value: "server-error", label: "500 server error" },
  { value: "timeout", label: "Timeout (no response)" },
];
const SMTP_FAULT_OPTIONS: { value: SmtpFaultMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "delay", label: "Delay response" },
  { value: "timeout", label: "Timeout (no response)" },
  { value: "reject-temporary", label: "451 temporary reject" },
  { value: "reject-permanent", label: "550 permanent reject" },
];

function errorTestingActive(state: ErrorTestingState | null): boolean {
  if (!state) return false;
  if (state.smtp !== "off" || state.smtpAuth === "required") return true;
  return Object.values(state.providers).some((m) =>
    m === "inherit" ? state.http !== "off" : m !== "off"
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SourceBadge({ source }: { source: MailSource }) {
  const provider = PROVIDERS[source];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 font-mono text-[10px] font-medium uppercase tracking-wide",
        provider.badge
      )}
    >
      {provider.label}
    </span>
  );
}

function ErrorTestingPanel({
  state,
  onChange,
}: {
  state: ErrorTestingState | null;
  onChange: (patch: ErrorTestingPatch) => void;
}) {
  if (!state) return null;

  const selectClass = cn(
    "cursor-pointer rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:border-ring",
    focusRing
  );
  const rowTitle = "text-xs font-medium";
  const rowHint = "mt-0.5 text-[11px] leading-4 text-muted-foreground";
  const sectionTitle = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

  const commitDelay = (raw: string) => {
    const value = Math.round(Number(raw));
    if (Number.isFinite(value) && value >= 1 && value <= 300 && value !== state.delaySeconds) {
      onChange({ delaySeconds: value });
    }
  };

  const turnAllOff = () =>
    onChange({
      http: "off",
      providers: Object.fromEntries(HTTP_PROVIDER_SOURCES.map((s) => [s, "inherit"])),
      smtp: "off",
      smtpAuth: "optional",
    });

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-[30rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-card text-left shadow-lg">
      <div className="flex items-start justify-between gap-3 border-b bg-accent/30 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <FlaskConical className="size-4 text-muted-foreground" />
            Error testing
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Make MailDotNull misbehave to test your app&apos;s error handling. Failed sends are
            rejected with the provider&apos;s real error format and are not stored.
          </p>
        </div>
        <button
          onClick={turnAllOff}
          disabled={!errorTestingActive(state)}
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40",
            focusRing
          )}
        >
          Turn all off
        </button>
      </div>

      <div className="px-4 py-3">
        <div className={sectionTitle}>HTTP provider APIs</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={rowTitle}>All providers</div>
            <div className={rowHint}>Applies to every endpoint, unless overridden below</div>
          </div>
          <select
            value={state.http}
            onChange={(e) => onChange({ http: e.target.value as HttpFaultMode })}
            className={cn(selectClass, "w-44 shrink-0")}
          >
            {HTTP_FAULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-x-8 gap-y-2">
          {HTTP_PROVIDER_SOURCES.map((source) => (
            <label key={source} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{PROVIDERS[source].label}</span>
              <select
                value={state.providers[source]}
                onChange={(e) =>
                  onChange({ providers: { [source]: e.target.value as ProviderFaultMode } })
                }
                className={cn(
                  selectClass,
                  "w-32 shrink-0",
                  state.providers[source] === "inherit" && "text-muted-foreground"
                )}
              >
                <option value="inherit">Use global</option>
                {HTTP_FAULT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <div className={sectionTitle}>SMTP server</div>
        <div className="mt-2 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={rowTitle}>Incoming mail</div>
              <div className={rowHint}>Rejects and stalls happen at MAIL FROM</div>
            </div>
            <select
              value={state.smtp}
              onChange={(e) => onChange({ smtp: e.target.value as SmtpFaultMode })}
              className={cn(selectClass, "w-44 shrink-0")}
            >
              {SMTP_FAULT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={rowTitle}>Authentication</div>
              <div className={rowHint}>
                &ldquo;Required&rdquo; rejects unauthenticated senders with 530 — any credentials
                still work
              </div>
            </div>
            <select
              value={state.smtpAuth}
              onChange={(e) => onChange({ smtpAuth: e.target.value as SmtpAuthMode })}
              className={cn(selectClass, "w-44 shrink-0")}
            >
              <option value="optional">Optional</option>
              <option value="required">Required</option>
            </select>
          </div>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={rowTitle}>Delay duration</div>
            <div className={rowHint}>How long &ldquo;Delay response&rdquo; faults wait</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={300}
              defaultValue={state.delaySeconds}
              onBlur={(e) => commitDelay(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitDelay(e.currentTarget.value)}
              aria-label="Delay duration in seconds"
              className={cn(
                "w-16 rounded-md border bg-background px-2 py-1 text-right text-xs transition-colors hover:border-ring",
                focusRing
              )}
            />
            <span className="text-xs text-muted-foreground">s</span>
          </div>
        </div>
      </div>

      <div className="border-t bg-accent/30 px-4 py-2 text-[11px] text-muted-foreground">
        Scriptable via <code className="font-mono">PUT /api/error-testing</code> · resets on
        restart
      </div>
    </div>
  );
}

function CheatSheet() {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-6 p-8">
      <div className="flex size-14 items-center justify-center rounded-xl bg-primary">
        <Mail className="size-7 text-primary-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">Waiting for mail</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Point your service at one of these endpoints — every message lands here instantly.
        </p>
      </div>
      <div className="w-full overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Endpoint</th>
              <th className="px-4 py-2 font-medium">Connect</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(PROVIDERS).map(([key, p]) => (
              <tr key={key} className="border-b last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap font-medium">{p.label}</td>
                <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs">{p.endpoint}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Any API key is accepted. Nothing is delivered, nothing is persisted.
      </p>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FlaskConical className="size-3.5" />
        You can also test errors — use the error-testing button in the header to simulate
        failures, delays, and timeouts.
      </p>
    </div>
  );
}

/** Mirror the unread count in the tab: title prefix plus a badge drawn onto the favicon. */
function useUnreadBadge(unread: number) {
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) MailDotNull` : "MailDotNull";

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Redraw the app logo (rounded primary square with an envelope) as the base icon.
    const primary =
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
      "#3b62e0";
    ctx.beginPath();
    ctx.roundRect(0, 0, 64, 64, 14);
    ctx.fillStyle = primary;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.roundRect(13, 19, 38, 27, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, 22);
    ctx.lineTo(32, 36);
    ctx.lineTo(49, 22);
    ctx.stroke();

    if (unread > 0) {
      ctx.beginPath();
      ctx.arc(45, 19, 17, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      const text = unread > 99 ? "99+" : String(unread);
      ctx.font = `bold ${text.length > 1 ? 16 : 23}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 45, 21);
    }

    // Override every icon link (favicon.ico, shortcut icon, …) so the browser
    // can't fall back to a static icon without the badge.
    const href = canvas.toDataURL("image/png");
    let links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    if (links.length === 0) {
      const link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    }
    for (const link of links) {
      link.type = "image/png";
      link.removeAttribute("sizes");
      link.href = href;
    }
  }, [unread]);
}

const SEVERITY_STYLES: Record<CheckSeverity, { icon: typeof Info; className: string }> = {
  error: { icon: CircleX, className: "text-red-600 dark:text-red-400" },
  warning: { icon: TriangleAlert, className: "text-amber-600 dark:text-amber-400" },
  info: { icon: Info, className: "text-sky-600 dark:text-sky-400" },
};

function HtmlCheckPane({ html, hasText }: { html: string; hasText: boolean }) {
  const findings = useMemo(() => runHtmlCheck(html, hasText), [html, hasText]);

  if (findings.length === 0) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-emerald-600 dark:text-emerald-400">
        <CircleCheck className="size-4" />
        No issues found — the HTML avoids features known to break in mail clients.
      </div>
    );
  }
  return (
    <div className="space-y-3 p-6">
      {findings.map((f, i) => {
        const { icon: Icon, className } = SEVERITY_STYLES[f.severity];
        return (
          <div key={i} className="flex items-start gap-3 rounded-lg border bg-card p-3">
            <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
            <div className="min-w-0">
              <div className="text-sm font-medium">{f.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{f.detail}</div>
            </div>
            <span className={cn("ml-auto shrink-0 font-mono text-[10px] uppercase", className)}>
              {f.severity}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LinkStatus({ result }: { result?: LinkCheckResult }) {
  if (!result) return <span className="text-xs text-muted-foreground">not checked</span>;
  return (
    <span
      className={cn(
        "font-mono text-xs font-medium",
        result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      )}
    >
      {result.status ?? result.error ?? "failed"}
    </span>
  );
}

function LinkCheckPane({ detail }: { detail: EmailDetail }) {
  const links = useMemo(() => extractLinks(detail.html, detail.text), [detail]);
  const [results, setResults] = useState<Record<string, LinkCheckResult>>({});
  const [checking, setChecking] = useState(false);
  const checkable = links.filter((l) => l.checkable);

  const check = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/link-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: checkable.map((l) => l.href) }),
      });
      if (res.ok) {
        const data: { results: LinkCheckResult[] } = await res.json();
        setResults(Object.fromEntries(data.results.map((r) => [r.url, r])));
      }
    } finally {
      setChecking(false);
    }
  };

  if (links.length === 0) {
    return <div className="p-6 text-sm italic text-muted-foreground">No links found</div>;
  }
  return (
    <div className="p-6">
      <div className="flex items-center gap-3">
        <button
          onClick={check}
          disabled={checking || checkable.length === 0}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40",
            focusRing
          )}
        >
          {checking && <Loader2 className="size-3.5 motion-safe:animate-spin" />}
          {checking
            ? "Checking…"
            : `Check ${checkable.length} link${checkable.length === 1 ? "" : "s"}`}
        </button>
        <span className="text-xs text-muted-foreground">
          Requests each http(s) URL from this machine.
        </span>
      </div>
      <table className="mt-4 w-full text-left text-sm">
        <tbody>
          {links.map((l) => (
            <tr key={l.href} className="border-b align-top last:border-0">
              <td className="w-24 whitespace-nowrap py-2 pr-4">
                {l.checkable ? (
                  <LinkStatus result={results[l.href]} />
                ) : (
                  <span className="text-xs text-muted-foreground">skipped</span>
                )}
              </td>
              <td className="min-w-0 py-2">
                <div className="break-all font-mono text-xs">{l.href}</div>
                {l.label && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{l.label}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mirror the selected message in the URL so a refresh (or a shared link) reopens it. */
function setUrlId(id: string | null) {
  window.history.replaceState(null, "", id ? `?id=${id}` : window.location.pathname);
}

function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DownloadMenu({ detail }: { detail: EmailDetail }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: { label: string; run: () => void }[] = [];
  if (detail.raw) {
    const raw = detail.raw;
    // HTTP-provider sends store the JSON request body as raw; SMTP/SES raw store MIME.
    const isJson = raw.trimStart().startsWith("{");
    items.push({
      label: "Raw message",
      run: () =>
        downloadBlob(
          `${detail.id}${isJson ? ".json" : ".eml"}`,
          raw,
          isJson ? "application/json" : "message/rfc822"
        ),
    });
  }
  if (detail.html) {
    const html = detail.html;
    items.push({
      label: "HTML body",
      run: () => downloadBlob(`${detail.id}.html`, html, "text/html"),
    });
  }
  if (detail.text) {
    const text = detail.text;
    items.push({
      label: "Text body",
      run: () => downloadBlob(`${detail.id}.txt`, text, "text/plain"),
    });
  }
  if (items.length === 0 && detail.attachments.length === 0) return null;

  const itemClass = cn(
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50",
    focusRing,
    "focus-visible:ring-inset"
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Download"
        aria-label="Download"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
          focusRing
        )}
      >
        <Download className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-44 overflow-hidden rounded-md border bg-card py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                item.run();
                setOpen(false);
              }}
              className={itemClass}
            >
              <Download className="size-3.5 shrink-0 text-muted-foreground" />
              {item.label}
            </button>
          ))}
          {items.length > 0 && detail.attachments.length > 0 && <div className="my-1 border-t" />}
          {detail.attachments.map((a) => (
            <a
              key={a.index}
              role="menuitem"
              href={`/api/messages/${detail.id}/attachments/${a.index}`}
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-56 truncate font-mono text-xs">{a.filename}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailPane({
  detail,
  read,
  onDelete,
  onClose,
  onToggleRead,
}: {
  detail: EmailDetail;
  read: boolean;
  onDelete: () => void;
  onClose: () => void;
  onToggleRead: () => void;
}) {
  const [tab, setTab] = useState<Tab>(detail.html ? "html" : detail.text ? "text" : "headers");
  const [device, setDevice] = useState<Device>("desktop");
  // null = follow the app theme; true/false = explicit override for the mail only.
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null);
  const appDark = useAppDark();
  const previewDark = darkOverride ?? appDark;
  const previewHtml = useMemo(
    () => (detail.html ? preparePreviewHtml(detail.html, previewDark) : detail.html),
    [detail.html, previewDark]
  );

  const tabs: { id: Tab; label: string; enabled: boolean }[] = [
    { id: "html", label: "HTML", enabled: Boolean(detail.html) },
    { id: "source", label: "HTML Source", enabled: Boolean(detail.html) },
    { id: "text", label: "Text", enabled: Boolean(detail.text) },
    { id: "headers", label: "Headers", enabled: true },
    { id: "raw", label: "Raw", enabled: Boolean(detail.raw) },
    { id: "html-check", label: "HTML Check", enabled: Boolean(detail.html) },
    { id: "link-check", label: "Link Check", enabled: Boolean(detail.html || detail.text) },
  ];

  const addressRow = (label: string, value: string | undefined) =>
    value ? (
      <div className="flex gap-2 text-sm">
        <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
        <span className="min-w-0 truncate font-mono text-xs leading-5">{value}</span>
      </div>
    ) : null;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SourceBadge source={detail.source} />
              <span className="text-xs text-muted-foreground">
                {dateTimeFormat.format(new Date(detail.receivedAt))}
              </span>
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold">
              {detail.subject || (
                <span className="italic text-muted-foreground">(no subject)</span>
              )}
            </h2>
          </div>
          <div className="flex shrink-0 gap-1">
            <DownloadMenu detail={detail} />
            <button
              onClick={onToggleRead}
              title={read ? "Mark as unread" : "Mark as read"}
              aria-label={read ? "Mark as unread" : "Mark as read"}
              className={cn(
                "rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
                focusRing
              )}
            >
              {read ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
            </button>
            <button
              onClick={onDelete}
              title="Delete message"
              aria-label="Delete message"
              className={cn(
                "rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-destructive",
                focusRing
              )}
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className={cn(
                "rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground lg:hidden",
                focusRing
              )}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="mt-2 space-y-0.5">
          {addressRow("From", detail.from)}
          {addressRow("To", detail.to.join(", "))}
          {addressRow("Cc", detail.cc.join(", ") || undefined)}
          {addressRow("Bcc", detail.bcc.join(", ") || undefined)}
          {addressRow("Reply-To", detail.replyTo)}
        </div>
        {detail.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.attachments.map((a) => (
              <a
                key={a.index}
                href={`/api/messages/${detail.id}/attachments/${a.index}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:border-ring hover:text-primary",
                  focusRing
                )}
              >
                <Paperclip className="size-3 text-muted-foreground" />
                <span className="max-w-48 truncate font-mono">{a.filename}</span>
                <span className="text-muted-foreground">{formatSize(a.size)}</span>
              </a>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-1">
          {tabs
            .filter((t) => t.enabled)
            .map((t) => (
              <button
                key={t.id}
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  focusRing,
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          {tab === "html" && detail.html && (
            <div className="ml-auto flex items-center gap-1">
              <div className="flex items-center rounded-md border p-0.5">
                {DEVICES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setDevice(id)}
                    title={label}
                    aria-label={label}
                    aria-pressed={device === id}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-[5px] transition-colors",
                      focusRing,
                      device === id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
              <button
                onClick={() => setDarkOverride(!previewDark)}
                title={previewDark ? "Show mail in light mode" : "Show mail in dark mode"}
                aria-label={previewDark ? "Show mail in light mode" : "Show mail in dark mode"}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
                  focusRing
                )}
              >
                {previewDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "html" && detail.html && (
          <div className="flex h-full justify-center overflow-auto bg-muted/50">
            <iframe
              // Popups only, so links (forced to target=_blank) open in a real
              // tab. Scripts, same-origin access, and navigation stay blocked.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={previewHtml}
              title="HTML preview"
              style={{ width: DEVICE_WIDTHS[device], maxWidth: "100%" }}
              className={cn(
                "h-full shrink-0",
                previewDark ? "bg-[#121212]" : "bg-white",
                device !== "desktop" && "border-x shadow-sm"
              )}
            />
          </div>
        )}
        {tab === "source" && (
          <pre className="whitespace-pre-wrap break-all p-6 font-mono text-xs leading-5">
            {detail.html}
          </pre>
        )}
        {tab === "text" && (
          <pre className="whitespace-pre-wrap p-6 font-mono text-sm leading-6">{detail.text}</pre>
        )}
        {tab === "raw" && (
          <pre className="whitespace-pre-wrap break-all p-6 font-mono text-xs leading-5">
            {detail.raw}
          </pre>
        )}
        {tab === "html-check" && detail.html && (
          <HtmlCheckPane html={detail.html} hasText={Boolean(detail.text)} />
        )}
        {tab === "link-check" && <LinkCheckPane detail={detail} />}
        {tab === "headers" && (
          <table className="w-full text-left text-sm">
            <tbody>
              {Object.entries(detail.headers).length === 0 && (
                <tr>
                  <td className="p-6 italic text-muted-foreground">No headers recorded</td>
                </tr>
              )}
              {Object.entries(detail.headers).map(([key, value]) => (
                <tr key={key} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-6 py-2 font-mono text-xs font-medium">
                    {key}
                  </td>
                  <td className="whitespace-pre-wrap px-6 py-2 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function Inbox() {
  const [messages, setMessages] = useState<EmailSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [query, setQuery] = useState("");
  const [info, setInfo] = useState<"smtp" | "http" | "errors" | null>(null);
  const [errorTesting, setErrorTesting] = useState<ErrorTestingState | null>(null);
  const selectedIdRef = useRef(selectedId);
  // Open the newest message once on page load; never again (the logo resets to the start page).
  const autoOpenPending = useRef(true);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const select = useCallback(async (id: string) => {
    setSelectedId(id);
    setUrlId(id);
    const res = await fetch(`/api/messages/${id}`);
    if (res.ok) {
      setDetail(await res.json());
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
    }
  }, []);

  const refresh = useCallback(async () => {
    let res: Response;
    try {
      // Error-testing changes also emit the SSE change event, so refresh both here.
      fetch("/api/error-testing")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setErrorTesting(s))
        .catch(() => {});
      res = await fetch("/api/messages");
    } catch {
      return; // server restarting; the SSE onerror fallback retries
    }
    if (!res.ok) return;
    const list: EmailSummary[] = await res.json();
    setMessages(list);
    if (autoOpenPending.current) {
      autoOpenPending.current = false;
      // A ?id= link takes precedence; it is restored by the effect below.
      const linkedId = new URLSearchParams(window.location.search).get("id");
      if (!linkedId && !selectedIdRef.current && list.length > 0) select(list[0].id);
    }
    if (selectedIdRef.current && !list.some((m) => m.id === selectedIdRef.current)) {
      setSelectedId(null);
      setDetail(null);
      setUrlId(null);
    }
  }, [select]);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    const source = new EventSource("/api/events");
    source.addEventListener("change", refresh);
    // If the stream drops (server restart), fall back to reconnect + refresh.
    source.onerror = () => setTimeout(refresh, 1000);
    return () => {
      clearTimeout(initial);
      source.close();
    };
  }, [refresh]);

  // Reopen the message from ?id= on load (a vanished id is cleaned up by refresh()).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const t = setTimeout(() => select(id), 0);
    return () => clearTimeout(t);
  }, [select]);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/messages/${id}`, { method: "DELETE" });
      if (selectedIdRef.current === id) {
        setSelectedId(null);
        setDetail(null);
        setUrlId(null);
      }
      refresh();
    },
    [refresh]
  );

  const setRead = useCallback(async (id: string, read: boolean) => {
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read } : m)));
  }, []);

  const changeErrorTesting = useCallback(async (patch: ErrorTestingPatch) => {
    const res = await fetch("/api/error-testing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setErrorTesting(await res.json());
  }, []);

  const markAllRead = useCallback(async () => {
    await fetch("/api/messages", { method: "PATCH" });
    setMessages((prev) => prev.map((m) => (m.read ? m : { ...m, read: true })));
  }, []);

  const clearAll = useCallback(async () => {
    if (!window.confirm("Delete all messages? This cannot be undone.")) return;
    await fetch("/api/messages", { method: "DELETE" });
    setSelectedId(null);
    setDetail(null);
    setUrlId(null);
    refresh();
  }, [refresh]);

  const filtered = query
    ? messages.filter((m) =>
        [m.subject, m.from, ...m.to, m.snippet, m.source]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : messages;

  const unread = messages.filter((m) => !m.read).length;
  useUnreadBadge(unread);

  const goHome = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setUrlId(null);
  }, []);

  // Close the connection-info popovers on Escape.
  useEffect(() => {
    if (!info) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfo(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [info]);

  const pillClass = cn(
    "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
    focusRing
  );

  return (
    <div className="relative z-10 flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
        <button
          onClick={goHome}
          title="Show start page"
          aria-label="Show start page"
          className={cn("flex items-center gap-3 rounded-md transition-opacity hover:opacity-80", focusRing)}
        >
          <div className="relative flex size-8 items-center justify-center rounded-lg bg-primary">
            <Mail className="size-4.5 text-primary-foreground" />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] font-bold leading-none text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <h1 className="text-base font-semibold">MailDotNull</h1>
        </button>
        {info && (
          <button
            aria-label="Close info"
            onClick={() => setInfo(null)}
            className="fixed inset-0 z-40 cursor-default"
          />
        )}
        <div className="ml-2 hidden items-center gap-2 sm:flex">
          <div className="relative z-50">
            <button onClick={() => setInfo(info === "smtp" ? null : "smtp")} className={pillClass}>
              <Server className="size-3.5" />
              smtp :1025 · :1587 · :1465
            </button>
            {info === "smtp" && (
              <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border bg-card p-4 text-left shadow-lg">
                <h3 className="text-sm font-semibold">SMTP server</h3>
                <dl className="mt-2 space-y-1 text-xs">
                  {[
                    ["Host", "localhost"],
                    ["Ports", "1025 (plain) · 1587 (STARTTLS) · 1465 (TLS)"],
                    ["Auth", errorTesting?.smtpAuth === "required" ? "required (any credentials)" : "any credentials accepted"],
                    ["TLS", "self-signed cert — accept it in your client"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-10 shrink-0 text-muted-foreground">{k}</dt>
                      <dd className="font-mono">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Override the ports with the{" "}
                  <code className="font-mono">MAILDOTNULL_SMTP_PORT</code>,{" "}
                  <code className="font-mono">MAILDOTNULL_STARTTLS_PORT</code>, and{" "}
                  <code className="font-mono">MAILDOTNULL_SMTPS_PORT</code> environment variables.
                </p>
              </div>
            )}
          </div>
          <div className="relative z-50">
            <button onClick={() => setInfo(info === "http" ? null : "http")} className={pillClass}>
              <Globe className="size-3.5" />
              http :8025 · 7 provider APIs
            </button>
            {info === "http" && (
              <div className="absolute left-0 top-full z-50 mt-2 w-96 rounded-lg border bg-card p-4 text-left shadow-lg">
                <h3 className="text-sm font-semibold">Emulated provider APIs</h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  http://localhost:8025
                </p>
                <div className="mt-2 space-y-1 text-xs">
                  {Object.entries(PROVIDERS)
                    .filter(([key]) => key !== "smtp")
                    .map(([key, p]) => (
                      <div key={key} className="flex gap-2">
                        <span className="w-24 shrink-0 text-muted-foreground">{p.label}</span>
                        <span className="min-w-0 truncate font-mono">{p.endpoint}</span>
                      </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Any API key is accepted.{" "}
                  <button
                    onClick={() => {
                      setInfo(null);
                      goHome();
                    }}
                    className="text-primary hover:underline"
                  >
                    Connection examples on the start page →
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative z-50">
            <button
              onClick={() => setInfo(info === "errors" ? null : "errors")}
              title="Configure error testing"
              className={cn(
                pillClass,
                errorTestingActive(errorTesting) &&
                  "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800 dark:hover:text-amber-100"
              )}
            >
              <FlaskConical className="size-3.5" />
              <span className="hidden md:inline">error testing</span>
              {errorTestingActive(errorTesting) && <span>on</span>}
            </button>
            {info === "errors" && (
              <ErrorTestingPanel state={errorTesting} onChange={changeErrorTesting} />
            )}
          </div>
          {unread > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unread} new
            </span>
          )}
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40",
              focusRing
            )}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </button>
          <button
            onClick={clearAll}
            disabled={messages.length === 0}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40",
              focusRing
            )}
          >
            <Trash2 className="size-3.5" />
            Clear all
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex w-full flex-col border-r bg-card lg:w-96 lg:shrink-0",
            selectedId && "hidden lg:flex"
          )}
        >
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages"
                aria-label="Search messages"
                spellCheck={false}
                className="w-full rounded-md border bg-background py-1.5 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground",
                    focusRing
                  )}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <InboxIcon className="size-6" />
                {messages.length === 0 ? "Inbox is empty" : "No matches"}
              </div>
            )}
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => select(m.id)}
                className={cn(
                  // content-visibility keeps huge inboxes cheap without a virtualization library.
                  "block w-full border-b border-l-2 border-l-transparent px-4 py-3 text-left transition-colors hover:bg-accent/50 [content-visibility:auto] [contain-intrinsic-size:auto_5.5rem]",
                  focusRing,
                  "focus-visible:ring-inset",
                  selectedId === m.id && "bg-accent/50",
                  !m.read && "border-l-primary bg-primary/10"
                )}
              >
                <div className="flex items-center gap-2">
                  {!m.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="min-w-0 truncate text-sm font-medium">{m.from}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatListTime(m.receivedAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm",
                      m.read ? "text-muted-foreground" : "font-medium"
                    )}
                  >
                    {m.subject || <span className="italic">(no subject)</span>}
                  </span>
                  {m.hasAttachments && (
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="ml-auto shrink-0">
                    <SourceBadge source={m.source} />
                  </span>
                </div>
                {m.snippet && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.snippet}</div>
                )}
              </button>
            ))}
          </div>
        </aside>

        <main className={cn("min-w-0 flex-1", !selectedId && "hidden lg:block")}>
          {detail ? (
            <DetailPane
              key={detail.id}
              detail={detail}
              read={messages.find((m) => m.id === detail.id)?.read ?? true}
              onDelete={() => remove(detail.id)}
              onToggleRead={() => {
                const read = messages.find((m) => m.id === detail.id)?.read ?? true;
                setRead(detail.id, !read);
              }}
              onClose={goHome}
            />
          ) : (
            <CheatSheet />
          )}
        </main>
      </div>
    </div>
  );
}
