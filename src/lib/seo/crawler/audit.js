// src/lib/seo/crawler/audit.js
// EXACT JS PORT of the doctorfizz-site-crawler skill's scripts/audit.py.
// Fixed rules engine: T thresholds + 12 per-URL checks + corpus checks, findings
// sorted by a total order (priority, type, category, name, url) => deterministic.
// RULE 0: no em dashes or en dashes anywhere.

import crypto from "crypto";
import { titlePixels, descPixels } from "./pixels.js";

export const T = {
  title_max_chars: 60, title_min_chars: 30,
  title_max_px: 561, title_min_px: 200,
  desc_max_chars: 155, desc_min_chars: 70,
  desc_max_px: 985, desc_min_px: 400,
  h1_max_chars: 70, h2_max_chars: 70,
  url_max_chars: 115,
  low_content_words: 200,
  high_crawl_depth: 4,
  alt_max_chars: 100,
  near_dup_threshold: 0.90,
  doc_max_bytes: 2000000,
};

export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
export const TYPE_RANK = { issue: 0, warning: 1, opportunity: 2 };

class Finding {
  constructor(cat, name, ftype, priority, url, detail = "") {
    this.cat = cat; this.name = name; this.type = ftype; this.priority = priority; this.url = url; this.detail = detail;
  }
  asDict() {
    return { category: this.cat, issue: this.name, type: this.type, priority: this.priority, url: this.url, detail: this.detail };
  }
}

const md5hex = (s) => crypto.createHash("md5").update(String(s || ""), "utf8").digest("hex");

function checkResponse(r, add) {
  const s = r.status || 0; const u = r.url;
  if (s === 0) add("Response Codes", "Internal No Response", "issue", "high", u, r.error || "");
  else if (s >= 400 && s < 500) add("Response Codes", `Internal Client Error (${s})`, "issue", "high", u);
  else if (s >= 500 && s < 600) add("Response Codes", `Internal Server Error (${s})`, "issue", "high", u);
  const chain = r.redirect_chain || [];
  if ((s >= 300 && s < 400) || r.redirected) {
    if (chain.length >= 3) add("Response Codes", "Redirect Chain", "warning", "medium", u, chain.map((h) => String(h.status)).join(" -> "));
    else if (chain.length) add("Response Codes", "Internal Redirection (3xx)", "warning", "low", u);
    const urls = [...chain.map((h) => h.url), r.final_url || u];
    if (urls.length !== new Set(urls).size) add("Response Codes", "Redirect Loop", "issue", "high", u);
  }
  if (r.blocked_by_robots) add("Response Codes", "Blocked by robots.txt", "warning", "medium", u);
}

function checkSecurity(r, add) {
  const u = r.url; if (!r.is_html) return;
  if (u.toLowerCase().startsWith("http://")) add("Security", "HTTP URLs (not HTTPS)", "issue", "high", u);
  const h = r.headers || {};
  if (u.toLowerCase().startsWith("https://")) {
    if (!("strict-transport-security" in h)) add("Security", "Missing HSTS Header", "warning", "low", u);
    const mixed = (r.images || []).filter((i) => String(i.src || "").toLowerCase().startsWith("http://"));
    if (mixed.length) add("Security", "Mixed Content", "issue", "high", u, `${mixed.length} insecure asset(s)`);
  }
  if (!("content-security-policy" in h)) add("Security", "Missing Content-Security-Policy", "warning", "low", u);
  if (!("x-content-type-options" in h)) add("Security", "Missing X-Content-Type-Options", "warning", "low", u);
  if (!("x-frame-options" in h) && !("content-security-policy" in h)) add("Security", "Missing X-Frame-Options", "warning", "low", u);
}

function checkUrl(r, add) {
  const u = r.url; const path = u.replace(/^https?:\/\/[^/]+/, "");
  if (u.includes(" ") || u.includes("%20")) add("URL", "Contains A Space", "issue", "high", u);
  if (path.replace(/^\/+/, "").includes("//")) add("URL", "Multiple Slashes", "issue", "high", u);
  if (/[A-Z]/.test(path)) add("URL", "Uppercase", "warning", "low", u);
  if (path.includes("_")) add("URL", "Underscores", "opportunity", "low", u);
  if (u.length > T.url_max_chars) add("URL", `Over ${T.url_max_chars} Characters`, "opportunity", "low", u);
  if (/[^\x00-\x7F]/.test(u)) add("URL", "Non ASCII Characters", "warning", "low", u);
  if (u.includes("?")) add("URL", "Parameters", "warning", "low", u);
}

function checkTitles(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url; const t = r.title;
  if (!t) { add("Page Titles", "Missing", "issue", "high", u); return; }
  if ((r.title_count != null ? r.title_count : 1) > 1) add("Page Titles", "Multiple", "issue", "high", u);
  if (r.title_outside_head) add("Page Titles", "Outside Head", "issue", "medium", u);
  const n = t.length; const px = titlePixels(t);
  if (n > T.title_max_chars) add("Page Titles", `Over ${T.title_max_chars} Characters`, "opportunity", "medium", u, `${n} chars`);
  if (n < T.title_min_chars) add("Page Titles", `Below ${T.title_min_chars} Characters`, "opportunity", "low", u, `${n} chars`);
  if (px > T.title_max_px) add("Page Titles", `Over ${T.title_max_px} Pixels`, "opportunity", "medium", u, `~${px}px`);
  if (px < T.title_min_px) add("Page Titles", `Below ${T.title_min_px} Pixels`, "opportunity", "low", u, `~${px}px`);
  const h1s = r.h1 || [];
  if (h1s.length && t.trim().toLowerCase() === h1s[0].trim().toLowerCase()) add("Page Titles", "Same as H1", "opportunity", "low", u);
}

function checkMeta(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url; const d = r.meta_description;
  if ((r.meta_description_count || 0) > 1) add("Meta Description", "Multiple", "issue", "medium", u);
  if (!d) { add("Meta Description", "Missing", "opportunity", "medium", u); return; }
  const n = d.length; const px = descPixels(d);
  if (n > T.desc_max_chars) add("Meta Description", `Over ${T.desc_max_chars} Characters`, "opportunity", "low", u, `${n} chars`);
  if (n < T.desc_min_chars) add("Meta Description", `Below ${T.desc_min_chars} Characters`, "opportunity", "low", u, `${n} chars`);
  if (px > T.desc_max_px) add("Meta Description", `Over ${T.desc_max_px} Pixels`, "opportunity", "low", u, `~${px}px`);
}

function checkHeadings(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url; const h1s = r.h1 || [];
  if (!h1s.length) add("H1", "Missing", "issue", "high", u);
  else if (h1s.length > 1) add("H1", "Multiple", "warning", "low", u, `${h1s.length} H1s`);
  for (const h of h1s) { if (h.length > T.h1_max_chars) { add("H1", `Over ${T.h1_max_chars} Characters`, "opportunity", "low", u); break; } }
  if (!(r.h2 || []).length) add("H2", "Missing", "warning", "low", u);
}

function checkContent(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url; const wc = r.word_count || 0;
  if (wc < T.low_content_words) add("Content", "Low Content Pages", "opportunity", "medium", u, `${wc} words`);
  if (String(r._text_sample || "").toLowerCase().includes("lorem ipsum")) add("Content", "Lorem Ipsum Placeholder", "warning", "medium", u);
}

function checkImages(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url; let missAltText = 0, missAltAttr = 0, longAlt = 0;
  for (const img of r.images || []) {
    if (!img.has_alt_attr) missAltAttr += 1;
    else if (!String(img.alt || "").trim()) missAltText += 1;
    if (img.alt && img.alt.length > T.alt_max_chars) longAlt += 1;
  }
  if (missAltText) add("Images", "Missing Alt Text", "issue", "medium", u, `${missAltText} image(s)`);
  if (missAltAttr) add("Images", "Missing Alt Attribute", "issue", "medium", u, `${missAltAttr} image(s)`);
  if (longAlt) add("Images", `Alt Text Over ${T.alt_max_chars} Characters`, "opportunity", "low", u, `${longAlt} image(s)`);
  const noDims = (r.images || []).filter((i) => !i.width_attr || !i.height_attr).length;
  if (noDims) add("Images", "Missing Size Attributes", "opportunity", "low", u, `${noDims} image(s)`);
}

function checkCanonical(r, add) {
  if (!r.is_html || r.status !== 200) return;
  // Compare the canonical against the FINAL url (after redirects), not the requested one,
  // else any page reached via a 301 to its own canonical is falsely flagged "Canonicalised".
  const u = r.final_url || r.url; const c = r.canonical;
  if (!c) { add("Canonicals", "Missing", "warning", "medium", u); return; }
  if (c.includes("#")) add("Canonicals", "Contains Fragment URL", "issue", "medium", u);
  if (!/^https?:\/\//i.test(c)) add("Canonicals", "Canonical Is Relative", "warning", "low", u);
  if (c.replace(/\/+$/, "") !== u.replace(/\/+$/, "")) add("Canonicals", "Canonicalised", "warning", "medium", u, `-> ${c}`);
}

function checkDirectives(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url;
  if (r.noindex) add("Directives", "Noindex", "warning", "high", u);
  if (r.nofollow_directive) add("Directives", "Nofollow", "warning", "medium", u);
}

function checkValidation(r, add) {
  if (!r.is_html) return;
  const u = r.url;
  if (!r.has_head) add("Validation", "Missing Head", "issue", "high", u);
  if (!r.has_body) add("Validation", "Missing Body", "issue", "high", u);
  if ((r.invalid_head_elements || []).length) add("Validation", "Invalid HTML Elements In Head", "warning", "medium", u, r.invalid_head_elements.join(", "));
  if ((r.content_length || 0) > T.doc_max_bytes) add("Validation", "HTML Document Over 2MB", "issue", "low", u);
}

function checkLinks(r, add) {
  if (!r.is_html || r.status !== 200) return;
  const u = r.url;
  if ((r.internal_outlink_count || 0) === 0) add("Links", "Pages Without Internal Outlinks", "warning", "medium", u);
  if ((r.crawl_depth || 0) >= T.high_crawl_depth) add("Links", "Pages With High Crawl Depth", "opportunity", "low", u, `depth ${r.crawl_depth}`);
}

const PER_URL = [checkResponse, checkSecurity, checkUrl, checkTitles, checkMeta,
  checkHeadings, checkContent, checkImages, checkCanonical, checkDirectives, checkValidation, checkLinks];

function shingles(text, k = 5) {
  const words = String(text || "").toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
  const out = new Set();
  const n = Math.max(0, words.length - k + 1);
  for (let i = 0; i < n; i++) out.add(words.slice(i, i + k).join(" "));
  return out;
}

function corpusChecks(records, add) {
  const html = records.filter((r) => r.is_html && r.status === 200);
  const groupDupes = (getter, cat, label, ftype, prio) => {
    const buckets = new Map();
    for (const r of html) {
      const v = getter(r);
      if (v) { const key = v.trim().toLowerCase(); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(r.url); }
    }
    for (const urls of buckets.values()) if (urls.length > 1) for (const u of urls) add(cat, label, ftype, prio, u, `${urls.length} pages share this`);
  };
  groupDupes((r) => r.title, "Page Titles", "Duplicate", "opportunity", "medium");
  groupDupes((r) => r.meta_description, "Meta Description", "Duplicate", "opportunity", "low");
  groupDupes((r) => (r.h1 || [null])[0], "H1", "Duplicate", "opportunity", "low");

  const emptyMd5 = md5hex("");
  const md5map = new Map();
  for (const r of html) { const d = r._content_hash || md5hex(r._text_sample || ""); if (!md5map.has(d)) md5map.set(d, []); md5map.get(d).push(r.url); }
  for (const [digest, urls] of md5map.entries()) if (urls.length > 1 && digest !== emptyMd5) for (const u of urls) add("Content", "Exact Duplicates", "issue", "high", u, `${urls.length} identical pages`);

  const shs = html.map((r) => [r.url, shingles(r._text_sample || "")]);
  const reported = new Set();
  for (let i = 0; i < shs.length; i++) {
    for (let j = i + 1; j < shs.length; j++) {
      const [a, sa] = shs[i]; const [b, sb] = shs[j];
      if (!sa.size || !sb.size) continue;
      let inter = 0; for (const x of sa) if (sb.has(x)) inter++;
      if (inter === 0) continue;
      const jac = inter / (sa.size + sb.size - inter);
      if (jac >= T.near_dup_threshold) for (const u of [a, b]) { const key = u + "||near"; if (!reported.has(key)) { add("Content", "Near Duplicates", "warning", "medium", u, `${Math.trunc(jac * 100)}% similar`); reported.add(key); } }
    }
  }

  const statusByUrl = new Map();
  for (const r of records) { statusByUrl.set(String(r.url).replace(/\/+$/, ""), r.status || 0); if (r.final_url) statusByUrl.set(String(r.final_url).replace(/\/+$/, ""), r.status || 0); }
  for (const r of records) for (const link of r.outlinks || []) {
    if (!link.internal) continue;
    const st = statusByUrl.get(String(link.url).replace(/\/+$/, ""));
    if (st !== undefined && (st === 0 || (st >= 400 && st < 600))) add("Links", "Broken Internal Link (source page)", "issue", "high", r.url, `links to ${link.url} (${st})`);
  }

  for (const r of html) if ((r.inlinks_count || 0) === 0 && (r.crawl_depth || 0) > 0) add("Links", "Zero Internal Inlinks", "warning", "medium", r.url);

  const byUrl = new Map(); for (const r of html) byUrl.set(String(r.url).replace(/\/+$/, ""), r);
  for (const r of html) for (const hl of r.hreflang || []) {
    const tgt = byUrl.get(String(hl.href).replace(/\/+$/, ""));
    if (tgt) { const back = (tgt.hreflang || []).some((x) => String(x.href).replace(/\/+$/, "") === String(r.url).replace(/\/+$/, "")); if (!back) add("Hreflang", "Missing Return Links", "issue", "medium", r.url, `no return link from ${hl.href}`); }
  }
}

export function runAudit(records) {
  const findings = [];
  const add = (cat, name, ftype, priority, url, detail = "") => findings.push(new Finding(cat, name, ftype, priority, url, detail));
  for (const r of records) for (const fn of PER_URL) fn(r, add);
  corpusChecks(records, add);
  findings.sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    || (TYPE_RANK[a.type] - TYPE_RANK[b.type])
    || (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : 0)
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  return findings;
}

export function findingsToDicts(findings) { return findings.map((f) => f.asDict()); }

export default { T, runAudit, findingsToDicts, PRIORITY_RANK, TYPE_RANK };
