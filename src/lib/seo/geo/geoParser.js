// src/lib/seo/geo/geoParser.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO ANSWER PARSER (Phase 3, item #8) — infra-free.
//
// Turns ONE raw response from the existing collector (collector.js → runGeoScan:
// { engine, prompt, answerText, citations:[url], raw_html, parse_confidence, … })
// into the NormalizedResult the data model + geoStore.saveRunResult expect:
// brand/competitor mentions (count + order), classified citations (is_brand_domain /
// is_competitor_domain + order), source domains, answer structure, parse confidence.
//
// It only DESCRIBES what the engine actually returned — it never invents a mention or
// citation. Pure text/URL analysis; no browser, no network.
// ─────────────────────────────────────────────────────────────────────────────
import { ENGINES } from "./collector.js";

// collector returns the engine DISPLAY NAME ("ChatGPT"); map back to the model key.
const ENGINE_KEY_BY_NAME = Object.fromEntries(
  Object.entries(ENGINES).map(([k, v]) => [String(v.name || "").toLowerCase(), k])
);

const clean = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } }
function rootDomain(d) {
  const parts = String(d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : (parts[0] || "");
}

// first-occurrence index + count of a term in text (word-boundary, case-insensitive).
function firstOccurrence(text, term) {
  const t = clean(term);
  if (!t || t.length < 2) return { count: 0, firstIndex: -1 };
  let re;
  try { re = new RegExp(`\\b${escapeRe(t)}\\b`, "gi"); } catch { return { count: 0, firstIndex: -1 }; }
  let count = 0, firstIndex = -1, m;
  while ((m = re.exec(text)) !== null) { count++; if (firstIndex < 0) firstIndex = m.index; if (count > 100) break; if (m.index === re.lastIndex) re.lastIndex++; }
  return { count, firstIndex };
}

// answer structure from the rendered HTML/text (one of ANSWER_STRUCTURES).
function detectStructure(text, html) {
  const h = String(html || ""); const t = String(text || "");
  if (/<table[\s>]/i.test(h)) return "table";
  const listItems = (h.match(/<li[\s>]/gi) || []).length + (t.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
  const hasCompare = /\bvs\.?\b|versus|compared to|pros and cons/i.test(t);
  const hasReco = /\b(i recommend|best option|top pick|recommended|you should (?:use|choose))\b/i.test(t);
  if (listItems >= 3) return hasCompare ? "comparison" : "list";
  if (hasReco) return "recommendation";
  if (hasCompare) return "comparison";
  if (t.length > 0) return "paragraph";
  return "unknown";
}

/**
 * @param {object} response  one collector response { engine, prompt, answerText, citations[], raw_html, parse_confidence, promptId?, region?, timestamp?, attempts? }
 * @param {object} ctx       { brand, brandDomain, competitors:[{name,domain}|string] }
 * @returns {object} NormalizedResult (the saveRunResult contract)
 */
export function parseAnswer(response = {}, ctx = {}) {
  const text = String(response.answerText || response.renderedText || "");
  const html = String(response.raw_html || response.rawHtml || "");
  const citeUrls = Array.isArray(response.citations) ? response.citations : [];
  const engine = ENGINE_KEY_BY_NAME[String(response.engine || "").toLowerCase()] || String(response.engine || "").toLowerCase();

  const brand = clean(ctx.brand);
  const brandDomain = rootDomain(ctx.brandDomain || "");
  const competitors = (ctx.competitors || [])
    .map((c) => (typeof c === "string" ? { name: clean(c), domain: "" } : { name: clean(c.name || c.brand || ""), domain: rootDomain(c.domain || "") }))
    .filter((c) => c.name || c.domain);

  // ── mentions (with first-appearance order) ──
  const entities = [];
  if (brand) entities.push({ name: brand, type: "brand", domain: brandDomain, ...firstOccurrence(text, brand) });
  for (const c of competitors) entities.push({ name: c.name, type: "competitor", domain: c.domain, ...firstOccurrence(text, c.name) });
  const present = entities.filter((e) => e.count > 0).sort((a, b) => a.firstIndex - b.firstIndex);
  present.forEach((e, i) => { e.position = i + 1; });

  const toMention = (e) => ({ entity_name: e.name, entity_type: e.type, domain: e.domain || "", mention_count: e.count, mention_position: e.position || null, context_snippet: snippet(text, e.firstIndex), confidence: 0.8 });
  const brandMentions = entities.filter((e) => e.type === "brand" && e.count > 0).map(toMention);
  const competitorMentions = entities.filter((e) => e.type === "competitor" && e.count > 0).map(toMention);

  // ── citations (classified by domain) ──
  const citations = citeUrls.map((url, i) => {
    const dom = domainOf(url); const root = rootDomain(dom);
    const isBrand = !!brandDomain && (root === brandDomain || dom.endsWith(brandDomain));
    const comp = competitors.find((c) => c.domain && (root === c.domain || dom.endsWith(c.domain)));
    return {
      cited_url: url, cited_domain: dom,
      cited_brand: isBrand ? brand : (comp ? comp.name : ""),
      citation_order: i + 1,
      is_brand_domain: isBrand, is_competitor_domain: !!comp,
      relationship_strength: (isBrand || comp) ? "direct" : "indirect",
      confidence: 0.7,
    };
  });
  const sourceDomains = [...new Set(citations.map((c) => c.cited_domain).filter(Boolean))];

  return {
    promptId: response.promptId || response.prompt_id || null,
    engine,
    accountId: response.accountId || response.account_id || null,
    timestamp: response.timestamp || new Date().toISOString(),
    locationContext: response.locationContext || (response.region ? { mode: "country", label: response.region } : null),
    rawPrompt: response.prompt || response.rawPrompt || "",
    rawHtml: html,
    renderedText: text,
    visibleAnswerText: text,
    answerStructure: detectStructure(text, html),
    answerLength: text.length,
    brandMentions,
    competitorMentions,
    citations,
    citationCount: citations.length,
    sourceDomains,
    parseConfidence: Number(response.parse_confidence ?? response.parseConfidence ?? (text.length > 40 ? 0.6 : 0.2)),
    screenshotUrl: response.screenshot || response.screenshotUrl || null,
    parserOutput: { brand_mention_total: brandMentions.reduce((a, m) => a + m.mention_count, 0), competitor_mention_total: competitorMentions.reduce((a, m) => a + m.mention_count, 0), citation_total: citations.length },
    errors: response.error ? [String(response.error)] : [],
    retries: Math.max(0, (Number(response.attempts) || 1) - 1),
    runStatus: response.error ? "error" : "success",
  };
}

function snippet(text, idx, span = 120) {
  if (idx == null || idx < 0) return "";
  const s = Math.max(0, idx - 20);
  return clean(String(text).slice(s, s + span));
}

export default parseAnswer;
