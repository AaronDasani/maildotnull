/** Format `{email, name}`-style objects into a display address string. */
export function formatAddress(email?: string | null, name?: string | null): string {
  if (!email) return "";
  return name ? `${name} <${email}>` : email;
}

/** Split a comma-separated address header into individual addresses. */
export function splitAddressList(value?: string | null): string[] {
  if (!value) return [];
  // Split on commas that are not inside a quoted display name.
  return (value.match(/(?:"[^"]*"|[^,])+/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Normalize string | string[] | undefined into a string[]. */
export function toArray(value?: string | string[] | null): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : splitAddressList(value);
}
