import { isIP } from "node:net";

export function normalizeWebsiteSourceUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Website URL must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Website URL must not include credentials.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || [".localhost", ".local", ".localdomain", ".home.arpa"].some((suffix) => hostname.endsWith(suffix)) || isIP(hostname.replace(/^\[|\]$/g, ""))) throw new Error("Website URL must use a public hostname.");
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  // Catalog/product query parameters identify different courses; tracking does not.
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(?:gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return `${url.origin}${path}${url.searchParams.size ? `?${url.searchParams}` : ""}`;
}
