// Gmail-style dark-mode rendering for the HTML preview.
//
// Gmail's apps don't run scripts or honor prefers-color-scheme in emails —
// they rewrite the email's colors. The transform is directional by role:
// backgrounds/borders only ever get darker, text only ever gets lighter, and
// the more chromatic a color the less it moves (a saturated brand button
// keeps its color; white text on it stays white). We do the same, entirely
// outside the sandboxed iframe: parse the HTML, rewrite stylesheet rules,
// inline styles, and legacy color attributes, then hand the transformed
// markup to srcDoc. The iframe sandbox stays fully locked down.

type ColorRole = "bg" | "text";

// Lightness flip with compressed extremes: white maps to #121212 (Gmail's
// dark surface) and black text to a light gray instead of pure white.
function flipLightness(l: number): number {
  return 0.88 - 0.81 * l;
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
// Backgrounds move toward dark, text toward light — never the other way, so
// white text and already-dark backgrounds survive unchanged. Background
// movement is damped by chroma so saturated brand colors barely shift.
function remapColor(value: string, role: ColorRole): string | null {
  const key = `${role}:${value}`;
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
        const flipped = flipLightness(l);
        let l2: number;
        if (role === "text") {
          l2 = Math.max(l, flipped);
        } else {
          const chroma = Math.max(rf, gf, bf) - Math.min(rf, gf, bf);
          l2 = l + (Math.min(l, flipped) - l) * (1 - chroma);
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
function remapColorTokens(value: string): string {
  return value.replace(
    /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*[^)]*\)/g,
    (token) => remapColor(token, "bg") ?? token
  );
}

function remapDeclaration(style: CSSStyleDeclaration): void {
  for (const [prop, role] of COLOR_PROPS) {
    const value = style.getPropertyValue(prop);
    if (!value) continue;
    const mapped = remapColor(value, role);
    if (mapped) style.setProperty(prop, mapped, style.getPropertyPriority(prop));
  }
  const bgImage = style.getPropertyValue("background-image");
  if (bgImage && bgImage.includes("gradient")) {
    style.setProperty(
      "background-image",
      remapColorTokens(bgImage),
      style.getPropertyPriority("background-image")
    );
  }
}

function remapRules(rules: CSSRuleList): void {
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
    if (rule instanceof CSSStyleRule) remapDeclaration(rule.style);
    const inner = (rule as Partial<CSSGroupingRule>).cssRules;
    if (inner && inner.length > 0) remapRules(inner);
  }
}

// Legacy presentational attributes, still common in emails. These go through
// HTML's legacy color parser, which mangles rgb() strings — emit hex only.
function remapLegacyAttr(el: Element, attr: string, role: ColorRole): void {
  const raw = el.getAttribute(attr)?.trim();
  if (!raw) return;
  // Legacy HTML accepts bare hex like bgcolor="ffffff"; CSS needs the #.
  const value = /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : raw;
  const mapped = remapColor(value, role);
  const m = mapped && /^rgba?\((\d+), (\d+), (\d+)/.exec(mapped);
  if (!m) return;
  const hex = (n: string) => parseInt(n, 10).toString(16).padStart(2, "0");
  el.setAttribute(attr, `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`);
}

export function darkenEmailHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  for (const styleEl of Array.from(doc.querySelectorAll("style"))) {
    // Constructable sheets parse CSS text without needing a live document.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styleEl.textContent ?? "");
    remapRules(sheet.cssRules);
    styleEl.textContent = Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join("\n");
  }

  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[style]"))) {
    remapDeclaration(el.style);
  }

  for (const el of Array.from(doc.querySelectorAll("[bgcolor]"))) {
    remapLegacyAttr(el, "bgcolor", "bg");
  }
  for (const el of Array.from(doc.querySelectorAll("font[color]"))) {
    remapLegacyAttr(el, "color", "text");
  }
  if (doc.body) {
    for (const attr of ["text", "link", "alink", "vlink"]) {
      remapLegacyAttr(doc.body, attr, "text");
    }
  }

  // Dark defaults for emails that never declare colors; every explicitly
  // declared color has already been remapped and overrides these.
  const base = doc.createElement("style");
  base.textContent = ":root{color-scheme:dark}body{background-color:#121212;color:#e0e0e0}";
  doc.head.insertBefore(base, doc.head.firstChild);

  // Preserve the original rendering mode: only emit a doctype if one existed.
  return (doc.doctype ? "<!doctype html>" : "") + doc.documentElement.outerHTML;
}
