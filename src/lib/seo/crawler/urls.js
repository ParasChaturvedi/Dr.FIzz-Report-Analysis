// src/lib/seo/crawler/urls.js
// URL normalisation + scope helpers. Faithful port of the crawl.py helpers.
// RULE 0: no em dashes or en dashes.

export function normalise(url) {
  try {
    const p = new URL(url);
    const scheme = p.protocol.replace(/:$/, "").toLowerCase();
    const netloc = p.host.toLowerCase();
    const path = p.pathname || "/";
    const query = p.search || "";
    return `${scheme}://${netloc}${path}${query}`;
  } catch {
    return String(url).split("#")[0];
  }
}

export function registrable(host) {
  const parts = String(host || "").toLowerCase().split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : String(host || "");
}

export function hostOf(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
}

export function sameSite(url, rootHost, crawlSubdomains) {
  const host = hostOf(url);
  if (!host) return false;
  if (crawlSubdomains) return registrable(host) === registrable(rootHost);
  return host === rootHost;
}

export function joinDefrag(base, href) {
  try { const u = new URL(href, base); u.hash = ""; return u.toString(); } catch { return ""; }
}

export function join(base, href) {
  try { return new URL(href, base).toString(); } catch { return String(href || ""); }
}

export default { normalise, registrable, hostOf, sameSite, joinDefrag, join };
