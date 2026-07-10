"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  CircleCheck,
  CircleX,
  Download,
  Info,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MailOpen,
  Monitor,
  Moon,
  Paperclip,
  Search,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { darkenEmailHtml } from "@/lib/dark-preview";
import type { EmailSummary, MailSource } from "@/lib/types";
import {
  extractLinks,
  runHtmlCheck,
  type CheckSeverity,
  type LinkCheckResult,
} from "@/lib/mail-checks";
import { PROVIDERS } from "@/lib/providers";
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
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});

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
    </div>
  );
}

/** Mirror the unread count in the tab: title prefix plus a badge drawn onto the favicon. */
function useUnreadBadge(unread: number) {
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Mailburli` : "Mailburli";

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
      ctx.font = "bold 23px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(unread > 9 ? "9+" : String(unread), 45, 21);
    }

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
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
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
        >
          {checking && <Loader2 className="size-3.5 animate-spin" />}
          Check {checkable.length} link{checkable.length === 1 ? "" : "s"}
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
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
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

  const itemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Download"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
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
    () => (detail.html && previewDark ? darkenEmailHtml(detail.html) : detail.html),
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
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              {read ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
            </button>
            <button
              onClick={onDelete}
              title="Delete message"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground lg:hidden"
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
                className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs transition-colors hover:border-ring hover:text-primary"
              >
                <Paperclip className="size-3 text-muted-foreground" />
                <span className="max-w-48 truncate font-mono">{a.filename}</span>
                <span className="text-muted-foreground">{formatSize(a.size)}</span>
              </a>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-1" role="tablist">
          {tabs
            .filter((t) => t.enabled)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
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
                className="flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
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
              sandbox=""
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
  const [info, setInfo] = useState<"smtp" | "http" | null>(null);
  const selectedIdRef = useRef(selectedId);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (!res.ok) return;
    const list: EmailSummary[] = await res.json();
    setMessages(list);
    if (selectedIdRef.current && !list.some((m) => m.id === selectedIdRef.current)) {
      setSelectedId(null);
      setDetail(null);
    }
  }, []);

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

  const select = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await fetch(`/api/messages/${id}`);
    if (res.ok) {
      setDetail(await res.json());
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/messages/${id}`, { method: "DELETE" });
      if (selectedIdRef.current === id) {
        setSelectedId(null);
        setDetail(null);
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

  const markAllRead = useCallback(async () => {
    await fetch("/api/messages", { method: "PATCH" });
    setMessages((prev) => prev.map((m) => (m.read ? m : { ...m, read: true })));
  }, []);

  const clearAll = useCallback(async () => {
    await fetch("/api/messages", { method: "DELETE" });
    setSelectedId(null);
    setDetail(null);
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
  }, []);

  const pillClass =
    "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground";

  return (
    <div className="relative z-10 flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
        <button
          onClick={goHome}
          title="Show start page"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <div className="relative flex size-8 items-center justify-center rounded-lg bg-primary">
            <Mail className="size-4.5 text-primary-foreground" />
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] font-bold leading-none text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
          <h1 className="text-base font-semibold">Mailburli</h1>
        </button>
        <div className="ml-2 hidden items-center gap-2 sm:flex">
          {info && (
            <button
              aria-label="Close info"
              onClick={() => setInfo(null)}
              className="fixed inset-0 z-40 cursor-default"
            />
          )}
          <div className="relative z-50">
            <button onClick={() => setInfo(info === "smtp" ? null : "smtp")} className={pillClass}>
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              smtp :1025
            </button>
            {info === "smtp" && (
              <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border bg-card p-4 text-left shadow-lg">
                <h3 className="text-sm font-semibold">SMTP server</h3>
                <dl className="mt-2 space-y-1 text-xs">
                  {[
                    ["Host", "localhost"],
                    ["Port", "1025"],
                    ["Auth", "any credentials accepted"],
                    ["TLS", "none (STARTTLS disabled)"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-10 shrink-0 text-muted-foreground">{k}</dt>
                      <dd className="font-mono">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Override the port with the <code className="font-mono">MAILBURLI_SMTP_PORT</code>{" "}
                  environment variable.
                </p>
              </div>
            )}
          </div>
          <div className="relative z-50">
            <button onClick={() => setInfo(info === "http" ? null : "http")} className={pillClass}>
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
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
          {unread > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unread} new
            </span>
          )}
          <button
            onClick={markAllRead}
            disabled={unread === 0}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </button>
          <button
            onClick={clearAll}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-40"
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages"
                className="w-full rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
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
                  "block w-full border-b border-l-2 border-l-transparent px-4 py-3 text-left transition-colors hover:bg-accent/50",
                  selectedId === m.id && "bg-accent/50",
                  !m.read && "border-l-primary bg-primary/10"
                )}
              >
                <div className="flex items-center gap-2">
                  {!m.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="min-w-0 truncate text-sm font-medium">{m.from}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                    {timeFormat.format(new Date(m.receivedAt))}
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
              onClose={() => {
                setSelectedId(null);
                setDetail(null);
              }}
            />
          ) : (
            <CheatSheet />
          )}
        </main>
      </div>
    </div>
  );
}
