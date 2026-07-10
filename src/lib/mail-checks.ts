// Client-side analysis for the "HTML Check" and "Link Check" tabs.
// Uses DOMParser, so these functions must only run in the browser.

export type CheckSeverity = "error" | "warning" | "info";

export interface HtmlCheckFinding {
  severity: CheckSeverity;
  title: string;
  detail: string;
}

// Gmail clips messages larger than this and hides the rest behind "View entire message".
const GMAIL_CLIP_BYTES = 102 * 1024;

/** Static checks for features that are unsupported or unreliable in mail clients. */
export function runHtmlCheck(html: string, hasTextAlternative: boolean): HtmlCheckFinding[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const findings: HtmlCheckFinding[] = [];
  const add = (severity: CheckSeverity, title: string, detail: string) =>
    findings.push({ severity, title, detail });

  const count = (selector: string) => doc.querySelectorAll(selector).length;

  const scripts = count("script");
  if (scripts > 0)
    add("error", "<script> element", `${scripts}× — JavaScript is stripped by every mail client.`);

  const stylesheets = count('link[rel="stylesheet"]');
  if (stylesheets > 0)
    add(
      "error",
      "External stylesheet",
      `${stylesheets}× <link rel="stylesheet"> — most clients ignore external CSS; inline it instead.`
    );

  for (const [selector, label] of [
    ["iframe", "<iframe>"],
    ["video", "<video>"],
    ["audio", "<audio>"],
    ["form", "<form>"],
    ["input, select, textarea, button", "Form control"],
  ] as const) {
    const n = count(selector);
    if (n > 0)
      add("warning", `${label} element`, `${n}× — not supported by most mail clients.`);
  }

  const images = [...doc.querySelectorAll("img")];
  const missingAlt = images.filter((img) => !img.getAttribute("alt")).length;
  if (missingAlt > 0)
    add(
      "warning",
      "Image without alt text",
      `${missingAlt} of ${images.length} images — shown as empty when images are blocked.`
    );
  const remoteImages = images.filter((img) => /^https?:/i.test(img.getAttribute("src") ?? "")).length;
  if (remoteImages > 0)
    add(
      "info",
      "Remote images",
      `${remoteImages}× — many clients block remote images until the reader opts in.`
    );

  // Scan inline style attributes plus <style> blocks for shaky CSS features.
  const css = [
    ...[...doc.querySelectorAll("[style]")].map((el) => el.getAttribute("style") ?? ""),
    ...[...doc.querySelectorAll("style")].map((el) => el.textContent ?? ""),
  ]
    .join("\n")
    .toLowerCase();

  if (/display\s*:\s*(inline-)?flex/.test(css))
    add("warning", "CSS flexbox", "Not supported in Outlook desktop and several webmail clients.");
  if (/display\s*:\s*(inline-)?grid/.test(css))
    add("warning", "CSS grid", "Not supported in Outlook desktop and several webmail clients.");
  if (/position\s*:\s*(absolute|fixed)/.test(css))
    add("warning", "position: absolute/fixed", "Ignored by Outlook, Gmail, and most webmail clients.");
  if (/background-image|background\s*:[^;]*url\(/.test(css))
    add("info", "CSS background image", "Not rendered by Outlook desktop without VML fallbacks.");
  if (css.includes("@media"))
    add("info", "@media query", "Not supported everywhere; ensure the layout works without it.");
  if (css.includes(":hover"))
    add("info", ":hover style", "Ignored by many clients and all touch devices.");

  const bytes = new TextEncoder().encode(html).length;
  if (bytes > GMAIL_CLIP_BYTES)
    add(
      "warning",
      "Message larger than 102 KB",
      `HTML body is ${(bytes / 1024).toFixed(0)} KB — Gmail clips messages beyond 102 KB.`
    );

  if (!hasTextAlternative)
    add(
      "warning",
      "No plain-text alternative",
      "Hurts spam scoring and readers with HTML disabled."
    );

  return findings;
}

export interface MailLink {
  href: string;
  label: string;
  /** Only http(s) links can be status-checked. */
  checkable: boolean;
}

/** Collect unique links from the HTML body plus bare URLs in the text body. */
export function extractLinks(html?: string, text?: string): MailLink[] {
  const links = new Map<string, MailLink>();
  const push = (href: string, label: string) => {
    if (!links.has(href)) {
      links.set(href, { href, label, checkable: /^https?:\/\//i.test(href) });
    }
  };

  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") ?? "";
      if (href && !href.startsWith("#")) {
        push(href, (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100));
      }
    }
  }
  if (text) {
    for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      push(match[0], "");
    }
  }
  return [...links.values()];
}

export interface LinkCheckResult {
  url: string;
  status?: number;
  ok: boolean;
  error?: string;
}
