// src/lib/seo/geo/prompt-generator.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Vision §17 — PROMPT SYSTEM (LOCKED, SAME FOR EVERY DOMAIN)
//
// ONE fixed set of 20 high-quality prompt TEMPLATES is used for EVERY domain, 1st
// scan or 100th — they are NOT regenerated per domain (no per-domain LLM cost, and
// Share-of-Voice stays comparable across every business we ever scan). The only thing
// that changes per domain is the data filled in: {ind} = industry/category and
// {loc} = location/market, pulled from the collected data.
//
// CRITICAL: every template is BRAND- and COMPETITOR-NEUTRAL by construction — they
// only ever contain the industry + location, never a company name. We measure whether
// the brand appears ORGANICALLY in the answer to a neutral query.
//
// The 20 templates are tuned to surface company/brand recommendations (so we can
// measure visibility) and to span the full GEO intent map: best/top, affordable,
// client-type (SMB/startup/ecommerce/B2B/D2C/enterprise), local/near-me, pricing,
// how-to-choose, ROI/results, lead-gen, brand-growth, award/reviewed, reliability.
// ─────────────────────────────────────────────────────────────────────────────

// LOCKED template set — edit here to change the prompts for ALL domains at once.
export const GEO_PROMPT_TEMPLATES = [
  "best {ind} in {loc} 2026",
  "top {ind} companies in {loc}",
  "top {ind} providers in {loc}",
  "most affordable {ind} in {loc}",
  "best budget {ind} in {loc}",
  "top rated {ind} near me",
  "best {ind} for small businesses in {loc}",
  "how to choose the best {ind} in {loc}",
  "{ind} pricing and cost in {loc}",
  "most trusted {ind} in {loc}",
  "best reviewed {ind} in {loc}",
  "award winning {ind} in {loc}",
  "most recommended {ind} in {loc}",
  "most popular {ind} in {loc}",
  "best value for money {ind} in {loc}",
  "leading {ind} in {loc}",
  "best {ind} with proven results in {loc}",
  "{ind} reviews and ratings in {loc}",
  "who are the best {ind} in {loc}",
  "best {ind} services in {loc}",
];

const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");

/**
 * Fill the LOCKED 20 templates with this domain's industry + location. Synchronous,
 * deterministic, zero LLM cost — the same 20 prompts (by structure) for every domain.
 *
 * @param {object} opts industry, category, location, count (default 20)
 * @returns {string[]}
 */
export function generateGeoPrompts({ industry = "", category = "", location = "", count = 20 } = {}) {
  const ind = clean(industry || category || "service providers").toLowerCase();
  const loc = clean(location || "India");
  const prompts = GEO_PROMPT_TEMPLATES.map((t) =>
    clean(t.replace(/\{ind\}/g, ind).replace(/\{loc\}/g, loc))
  );
  return prompts.slice(0, count || prompts.length);
}
