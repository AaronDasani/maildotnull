// Client-accurate dark-mode rendering for the HTML preview.
//
// Real mail clients treat dark mode very differently, so the preview
// simulates one client at a time. Four behaviors cover the landscape
// (per Litmus/Email on Acid's categorization):
//
// - "none"    — dark app chrome only; the email renders unchanged
//               (Yahoo Mail, Gmail web).
// - "pcs"     — the client honors the email's own
//               @media (prefers-color-scheme: dark) styles and otherwise
//               renders it unchanged (Apple Mail).
// - "partial" — directional rewrite: backgrounds only ever get darker,
//               text only ever lighter, and the more chromatic a color the
//               less it moves — a saturated brand button keeps its color,
//               already-dark designs are left alone (Gmail Android,
//               Outlook.com's fixContrast()).
// - "full"    — unconditional lightness flip: even already-dark designs
//               get inverted (Gmail iOS, Outlook for Windows).
//
// None of the vendors publish their exact algorithms; the partial/full
// transforms here are the community-consensus approximation (flip
// lightness, keep hue, damp by chroma). All rewriting happens outside the
// sandboxed iframe: parse the HTML, rewrite stylesheet rules, inline
// styles, and legacy color attributes, then hand the transformed markup
// to srcDoc. The iframe sandbox stays fully locked down.

export type DarkTransform = "none" | "pcs" | "partial" | "full";

export interface DarkPreviewClient {
  id: string;
  label: string;
  /** Plain-English description of what the client does to the email. */
  hint: string;
  /** Message-area background in the client's dark theme. */
  bg: string;
  /** Default text color in the client's dark theme. */
  text: string;
  transform: DarkTransform;
}

// Background/text hexes are measured or documented client values:
// Gmail #202124/#E8EAED (Google dark-theme grays), Apple Mail iOS pure
// black, Outlook.com ~#292929 (Fluent 2), Yahoo #1D2228 ("batcave").
export const DARK_CLIENTS: DarkPreviewClient[] = [
  {
    id: "gmail-android",
    label: "Gmail (Android)",
    hint: "Darkens light backgrounds and lightens dark text; already-dark designs are left alone",
    bg: "#202124",
    text: "#e8eaed",
    transform: "partial",
  },
  {
    id: "gmail-ios",
    label: "Gmail (iOS)",
    hint: "Inverts all colors — even already-dark designs get flipped to light",
    bg: "#202124",
    text: "#e8eaed",
    transform: "full",
  },
  {
    id: "apple-mail",
    label: "Apple Mail",
    hint: "Applies the email's own dark-mode CSS (prefers-color-scheme); otherwise renders it unchanged",
    bg: "#000000",
    text: "#ffffff",
    transform: "pcs",
  },
  {
    id: "outlook-web",
    label: "Outlook.com",
    hint: "Darkens light backgrounds and lightens dark text; already-dark designs are left alone",
    bg: "#292929",
    text: "#ffffff",
    transform: "partial",
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    hint: "Dark app chrome only — the email's own colors are not changed",
    bg: "#1d2228",
    text: "#ffffff",
    transform: "none",
  },
];

type ColorRole = "bg" | "text";

interface RemapParams {
  /** true = unconditional flip ("full"); false = directional ("partial"). */
  full: boolean;
  /** Lightness that pure white maps to — the client's dark surface. */
  floor: number;
}

// Lightness flip with compressed extremes: white maps to the client's dark
// surface and black text to a light gray instead of pure white.
function flipLightness(l: number, floor: number): number {
  return 0.88 - (0.88 - floor) * l;
}

/** HSL lightness of a #rrggbb hex — used to derive each client's floor. */
function hexLightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

const CSS_KEYWORDS = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "none",
]);

// Longhands whose values are a single <color>. Shorthands like `border` or
// `background` are expanded to these by the CSSOM, so they're covered too.
const COLOR_PROPS: [string, ColorRole][] = [
  ["color", "text"],
  ["background-color", "bg"],
  ["border-top-color", "bg"],
  ["border-right-color", "bg"],
  ["border-bottom-color", "bg"],
  ["border-left-color", "bg"],
  ["outline-color", "bg"],
  ["text-decoration-color", "text"],
];

let probeEl: HTMLElement | null = null;

// Normalize any CSS color (named, hex, hsl, ...) to computed rgb()/rgba()
// by letting the browser parse it on a hidden probe element.
function normalizeColor(value: string): string | null {
  const trimmed = value.trim();
  if (CSS_KEYWORDS.has(trimmed.toLowerCase())) return null;
  if (!probeEl) {
    probeEl = document.createElement("span");
    probeEl.style.display = "none";
    document.body.appendChild(probeEl);
  }
  probeEl.style.color = "";
  probeEl.style.color = trimmed;
  if (!probeEl.style.color) return null;
  return getComputedStyle(probeEl).color;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

const remapCache = new Map<string, string | null>();

// Remap a single CSS color value. Returns null when the value should be
// left untouched (keywords, unparsable, fully transparent).
//
// Partial: backgrounds move toward dark, text toward light — never the
// other way, so white text and already-dark backgrounds survive unchanged.
// Full: the lightness flip applies unconditionally, so dark designs get
// inverted too. In both, background movement is damped by chroma so
// saturated brand colors barely shift.
function remapColor(value: string, role: ColorRole, p: RemapParams): string | null {
  const key = `${role}:${p.full}:${p.floor}:${value}`;
  const cached = remapCache.get(key);
  if (cached !== undefined) return cached;
  let result: string | null = null;
  const normalized = normalizeColor(value);
  if (normalized) {
    const m = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(normalized);
    if (m) {
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (a > 0) {
        const rf = parseInt(m[1], 10) / 255;
        const gf = parseInt(m[2], 10) / 255;
        const bf = parseInt(m[3], 10) / 255;
        const [h, s, l] = rgbToHsl(rf, gf, bf);
        const flipped = flipLightness(l, p.floor);
        let l2: number;
        if (role === "text") {
          l2 = p.full ? flipped : Math.max(l, flipped);
        } else {
          const chroma = Math.max(rf, gf, bf) - Math.min(rf, gf, bf);
          const target = p.full ? flipped : Math.min(l, flipped);
          l2 = l + (target - l) * (1 - chroma);
        }
        const [r, g, b] = hslToRgb(h, s, l2);
        const ri = Math.round(r * 255);
        const gi = Math.round(g * 255);
        const bi = Math.round(b * 255);
        result = a < 1 ? `rgba(${ri}, ${gi}, ${bi}, ${a})` : `rgb(${ri}, ${gi}, ${bi})`;
      }
    }
  }
  remapCache.set(key, result);
  return result;
}

// Remap hex/rgb/hsl tokens inside a compound value (gradient color stops).
// Named colors inside gradients are left alone — a word-level replace would
// also mangle url() contents, and named colors in gradients are rare.
function remapColorTokens(value: string, p: RemapParams): string {
  return value.replace(
    /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*[^)]*\)/g,
    (token) => remapColor(token, "bg", p) ?? token
  );
}

function remapDeclaration(style: CSSStyleDeclaration, p: RemapParams): void {
  for (const [prop, role] of COLOR_PROPS) {
    const value = style.getPropertyValue(prop);
    if (!value) continue;
    const mapped = remapColor(value, role, p);
    if (mapped) style.setProperty(prop, mapped, style.getPropertyPriority(prop));
  }
  const bgImage = style.getPropertyValue("background-image");
  if (bgImage && bgImage.includes("gradient")) {
    style.setProperty(
      "background-image",
      remapColorTokens(bgImage, p),
      style.getPropertyPriority("background-image")
    );
  }
}

function remapRules(rules: CSSRuleList, p: RemapParams): void {
  for (const rule of Array.from(rules)) {
    // Like Gmail, ignore the email's own dark theme and remap its light
    // styles instead — otherwise OS-dark + email-dark would double-flip.
    if (
      rule instanceof CSSMediaRule &&
      /prefers-color-scheme\s*:\s*dark/i.test(rule.conditionText)
    ) {
      rule.media.mediaText = "not all";
      continue;
    }
    if (rule instanceof CSSStyleRule) remapDeclaration(rule.style, p);
    const inner = (rule as Partial<CSSGroupingRule>).cssRules;
    if (inner && inner.length > 0) remapRules(inner, p);
  }
}

// Apple Mail model: force the email's own dark-mode media queries on and
// its light-only ones off. A combined condition like
// "(prefers-color-scheme: dark) and (max-width: 600px)" loses its other
// parts — acceptable, such combinations are rare in email CSS.
function forcePrefersDark(rules: CSSRuleList): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      if (/prefers-color-scheme\s*:\s*dark/i.test(rule.conditionText)) {
        rule.media.mediaText = "all";
      } else if (/prefers-color-scheme\s*:\s*light/i.test(rule.conditionText)) {
        rule.media.mediaText = "not all";
      }
    }
    const inner = (rule as Partial<CSSGroupingRule>).cssRules;
    if (inner && inner.length > 0) forcePrefersDark(inner);
  }
}

// Legacy presentational attributes, still common in emails. These go through
// HTML's legacy color parser, which mangles rgb() strings — emit hex only.
function remapLegacyAttr(el: Element, attr: string, role: ColorRole, p: RemapParams): void {
  const raw = el.getAttribute(attr)?.trim();
  if (!raw) return;
  // Legacy HTML accepts bare hex like bgcolor="ffffff"; CSS needs the #.
  const value = /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : raw;
  const mapped = remapColor(value, role, p);
  const m = mapped && /^rgba?\((\d+), (\d+), (\d+)/.exec(mapped);
  if (!m) return;
  const hex = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
  el.setAttribute(attr, `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`);
}

// Prepare an email's HTML for the preview iframe: force every link to open
// in a new tab (the sandbox blocks in-place navigation, and the app must
// never be navigated away by mail content), then optionally apply the
// selected client's dark-mode treatment. Per-link target beats any
// <base target> the email ships.
export function preparePreviewHtml(html: string, client: DarkPreviewClient | null): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const a of Array.from(doc.querySelectorAll("a, area"))) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noreferrer noopener");
  }

  if (client) applyDarkClient(doc, client);

  // Preserve the original rendering mode: only emit a doctype if one existed.
  return (doc.doctype ? "<!doctype html>" : "") + doc.documentElement.outerHTML;
}

function eachStyleSheet(doc: Document, visit: (rules: CSSRuleList) => void): void {
  for (const styleEl of Array.from(doc.querySelectorAll("style"))) {
    // Constructable sheets parse CSS text without needing a live document.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styleEl.textContent ?? "");
    visit(sheet.cssRules);
    styleEl.textContent = Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join("\n");
  }
}

function applyDarkClient(doc: Document, client: DarkPreviewClient): void {
  if (client.transform === "pcs") {
    eachStyleSheet(doc, forcePrefersDark);
  } else if (client.transform === "partial" || client.transform === "full") {
    const p: RemapParams = { full: client.transform === "full", floor: hexLightness(client.bg) };

    eachStyleSheet(doc, (rules) => remapRules(rules, p));

    for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[style]"))) {
      remapDeclaration(el.style, p);
    }

    for (const el of Array.from(doc.querySelectorAll("[bgcolor]"))) {
      remapLegacyAttr(el, "bgcolor", "bg", p);
    }
    for (const el of Array.from(doc.querySelectorAll("font[color]"))) {
      remapLegacyAttr(el, "color", "text", p);
    }
    if (doc.body) {
      for (const attr of ["text", "link", "alink", "vlink"]) {
        remapLegacyAttr(doc.body, attr, "text", p);
      }
    }
  }

  // The client's dark defaults for emails that never declare colors; every
  // explicitly declared or remapped color overrides these.
  const base = doc.createElement("style");
  base.textContent = `:root{color-scheme:dark}body{background-color:${client.bg};color:${client.text}}`;
  doc.head.insertBefore(base, doc.head.firstChild);
}
