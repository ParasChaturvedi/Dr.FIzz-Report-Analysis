// src/lib/seo/crawler/parse.js
// EXACT JS PORT of crawl.py's parse_html(), using jsdom on the PLAYWRIGHT RENDERED
// HTML so JS injected titles/H1s/canonicals/content are seen. Source-markup validity
// checks (has_head/has_body/invalid_head_elements) are read from the RAW body string.
// RULE 0: no em dashes or en dashes anywhere.

import crypto from "crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { sameSite, joinDefrag, join } from "./urls.js";

const HEAD_ALLOWED = new Set(["title", "meta", "link", "base", "style", "script", "noscript", "template"]);

const SILENT_CONSOLE = new VirtualConsole();
SILENT_CONSOLE.on("error", () => {});
SILENT_CONSOLE.on("jsdomError", () => {});

function getText(el, sep = " ") {
  if (!el) return null;
  const parts = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { const t = String(child.textContent || "").trim(); if (t) parts.push(t); }
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
  return parts.join(sep);
}

export function parseHtml(record, rootHost, crawlSubdomains) {
  const body = record._body || "";
  const rawForHead = String(record._raw_body || body || "");
  delete record._body;
  delete record._raw_body;
  record.is_html = !!body;
  if (!body) { record.outlinks = []; return record; }

  const forParse = body.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const dom = new JSDOM(forParse, { virtualConsole: SILENT_CONSOLE });
  const doc = dom.window.document;
  const base = record.final_url || record.url;
  const head = doc.head || doc.querySelector("head");

  const titles = [...doc.querySelectorAll("title")];
  const headTitleEl = head ? head.querySelector("title") : null;
  const titleInHead = headTitleEl ? getText(headTitleEl) : null;
  record.title = titleInHead ? titleInHead : (titles.length ? getText(titles[0]) : null);
  record.title_count = titles.length;
  record.title_outside_head = titles.length > 0 && headTitleEl === null;

  const metas = [...doc.querySelectorAll("meta[name]")].filter((m) => /^description$/i.test(m.getAttribute("name") || ""));
  record.meta_description = metas.length ? String(metas[0].getAttribute("content") || "").trim() : null;
  record.meta_description_count = metas.length;

  record.h1 = [...doc.querySelectorAll("h1")].map((h) => getText(h));
  record.h2 = [...doc.querySelectorAll("h2")].map((h) => getText(h));

  let canon = null;
  const linkCanon = [...doc.querySelectorAll("link[rel]")].find((l) => String(l.getAttribute("rel") || "").split(/\s+/).map((x) => x.toLowerCase()).includes("canonical"));
  if (linkCanon && linkCanon.getAttribute("href")) canon = join(base, String(linkCanon.getAttribute("href")).trim());
  const headerCanon = String((record.headers || {}).link || "");
  if (!canon && headerCanon.toLowerCase().includes('rel="canonical"')) {
    const m = headerCanon.match(/<([^>]+)>\s*;\s*rel="?canonical/i);
    if (m) canon = join(base, m[1].trim());
  }
  record.canonical = canon;

  const robotsMeta = [...doc.querySelectorAll("meta[name]")].find((m) => /^robots$/i.test(m.getAttribute("name") || ""));
  const directives = robotsMeta ? String(robotsMeta.getAttribute("content") || "") : "";
  const xRobots = String((record.headers || {})["x-robots-tag"] || "");
  const combined = (directives + "," + xRobots).toLowerCase();
  record.meta_robots = directives;
  record.x_robots_tag = xRobots;
  record.noindex = combined.includes("noindex");
  record.nofollow_directive = combined.includes("nofollow");

  const vp = [...doc.querySelectorAll("meta[name]")].find((m) => /^viewport$/i.test(m.getAttribute("name") || ""));
  record.viewport = vp ? String(vp.getAttribute("content") || "") : null;
  const htmlTag = doc.querySelector("html");
  record.lang = htmlTag ? htmlTag.getAttribute("lang") : null;
  record.has_amp = !!doc.querySelector('link[rel="amphtml"]') || (htmlTag != null && (htmlTag.hasAttribute("amp") || htmlTag.hasAttribute("⚡")));

  // hreflang: case-sensitive token membership on rel (matches bs4 attrs={"rel":"alternate"}).
  const hreflangs = [];
  for (const l of doc.querySelectorAll("link[rel]")) {
    if (!String(l.getAttribute("rel") || "").split(/\s+/).includes("alternate")) continue;
    if (l.getAttribute("hreflang")) hreflangs.push({ lang: l.getAttribute("hreflang"), href: join(base, l.getAttribute("href") || "") });
  }
  record.hreflang = hreflangs;

  record.has_jsonld = !![...doc.querySelectorAll("script[type]")].find((s) => /ld\+json/i.test(s.getAttribute("type") || ""));
  record.has_microdata = !!doc.querySelector("[itemtype]");

  for (const tag of doc.querySelectorAll("script, style, noscript")) tag.remove();
  const visible = getText(doc.documentElement, " ") || "";
  record.word_count = (visible.match(/[\p{L}\p{N}_]+/gu) || []).length;
  // Hash the FULL visible text for exact-duplicate detection. The truncated _text_sample
  // below is for the near-duplicate shingle pass ONLY; hashing it made two long pages that
  // diverge only after 20,000 chars look identical (a false HIGH-priority "Exact Duplicates").
  record._content_hash = crypto.createHash("md5").update(visible, "utf8").digest("hex");
  record._text_sample = visible.slice(0, 20000);

  // Head validity from RAW markup (jsdom relocates non-head elements out of the head,
  // which would make this check dead; the raw slice flags any non-standard head element,
  // the real SEO problem = source markup that prematurely closes the head).
  record.has_head = /<head\b[^>]*>/i.test(rawForHead);
  record.has_body = /<body\b[^>]*>/i.test(rawForHead);
  const headMatch = rawForHead.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const inner = headMatch[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
    const tags = [...inner.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b/g)].map((x) => x[1].toLowerCase());
    record.invalid_head_elements = [...new Set(tags.filter((t) => !HEAD_ALLOWED.has(t)))].sort();
  } else {
    record.invalid_head_elements = [];
  }

  const images = [];
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    images.push({ src: src ? join(base, src) : "", alt: img.hasAttribute("alt") ? img.getAttribute("alt") : null, has_alt_attr: img.hasAttribute("alt"), width_attr: img.getAttribute("width"), height_attr: img.getAttribute("height") });
  }
  record.images = images;

  const outlinks = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = String(a.getAttribute("href") || "").trim();
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    const target = joinDefrag(base, href);
    if (!target) continue;
    const rel = String(a.getAttribute("rel") || "").trim();
    const internal = sameSite(target, rootHost, crawlSubdomains);
    outlinks.push({ url: target, anchor: getText(a) || "", rel, nofollow: rel.toLowerCase().includes("nofollow"), internal });
  }
  record.outlinks = outlinks;
  record.internal_outlink_count = outlinks.filter((o) => o.internal).length;
  record.external_outlink_count = outlinks.filter((o) => !o.internal).length;

  dom.window.close();
  return record;
}

export default { parseHtml };
