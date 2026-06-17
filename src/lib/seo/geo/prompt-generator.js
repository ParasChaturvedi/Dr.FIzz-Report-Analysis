// src/lib/seo/geo/prompt-generator.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Vision §17 — PROMPT GENERATION SYSTEM
//
// Generates high-quality, intent-clustered prompts for the AI-visibility scan.
//
// CRITICAL RULE: prompts are 100% BRAND-NEUTRAL and COMPETITOR-NEUTRAL. No prompt may
// contain the client's name/domain or any competitor's name. We measure whether the
// brand appears ORGANICALLY in the answer to a neutral query — seeding the brand into
// the prompt would bias the LLM into mentioning it (fake visibility).
//
// Built from: industry, category, location, and the site's real DataForSEO keywords,
// clustered semantically across intents (top/best, local, affordable, comparison,
// use-case, pricing, best-for). Claude generates them; a hard filter strips any that
// leak a banned term. Falls back to a deterministic neutral set if Claude is down.
// ─────────────────────────────────────────────────────────────────────────────
import { claudeChat } from "../../claude/client.js";

const SYS = `You generate realistic search prompts that real potential customers type into AI assistants (ChatGPT, Gemini, Perplexity, Google AI Overview) when researching who to hire or buy from in a given industry.

HARD RULES (must follow exactly):
1. Output EXACTLY the requested number of prompts.
2. NEVER mention any specific company, brand, product, agency, or competitor name. Every prompt is a neutral category/intent query. WRONG: "agencies like Acme" / "is Acme good". RIGHT: "best digital marketing agencies in India 2026".
3. Each prompt must be natural, specific and high-intent — the kind whose answer lists/recommends companies (so we can measure which brands appear).
4. Cover DIVERSE intents via semantic clustering: top/best lists, local (city & region), affordable/budget, comparison (service-type vs service-type), use-case ("best X for startups/ecommerce/B2B"), pricing, "best X for [need]", and near-me.
5. Use the provided industry, location and real keywords to make prompts specific and relevant to this market.

Return ONLY valid JSON: {"prompts":["...", ...]} with no other text.`;

const norm = (s) => String(s || "").toLowerCase().trim();

// Deterministic neutral fallback (used only if Claude fails) — still brand-neutral.
function fallbackPrompts({ industry, location, count }) {
  const ind = norm(industry) || "service providers";
  const loc = location || "India";
  const base = [
    `best ${ind} in ${loc} 2026`,
    `top ${ind} companies in ${loc}`,
    `most affordable ${ind} in ${loc}`,
    `best ${ind} for small businesses`,
    `best ${ind} for startups`,
    `top rated ${ind} near me`,
    `which ${ind} is best for ecommerce`,
    `best ${ind} for B2B companies`,
    `top ${ind} for lead generation`,
    `best budget ${ind} in ${loc}`,
    `most reliable ${ind} in ${loc}`,
    `best ${ind} with proven results`,
    `top ${ind} for brand growth`,
    `best ${ind} for ${loc} market`,
    `how to choose the best ${ind}`,
    `${ind} pricing in ${loc}`,
    `best ${ind} for first-time clients`,
    `award winning ${ind} in ${loc}`,
    `top ${ind} reviewed in 2026`,
    `best ${ind} for measurable ROI`,
  ];
  return base.slice(0, count);
}

/**
 * Generate brand-neutral GEO prompts.
 * @param {object} opts
 *   industry, category, location, keywords[], excludeTerms[] (brand + competitor names/domains), count
 * @returns {Promise<string[]>}
 */
export async function generateGeoPrompts({
  industry = "", category = "", location = "", keywords = [], excludeTerms = [], count = 20,
} = {}) {
  // Banned tokens: brand + competitor names + their domain roots — never allowed in a prompt.
  const banned = (excludeTerms || [])
    .flatMap((t) => {
      const s = norm(t).replace(/^https?:\/\//, "").replace(/^www\./, "");
      const host = s.split("/")[0];
      const root = host.split(".")[0]; // "itzfizz.com" → "itzfizz"
      return [s, host, root];
    })
    .filter((t) => t && t.length > 2);

  const isClean = (p) => {
    const lp = norm(p);
    return lp.length > 6 && !banned.some((b) => lp.includes(b));
  };

  const kw = (keywords || []).map(norm).filter(Boolean).slice(0, 40).join(", ");
  const user = `Industry / category: ${industry || category || "services"}
Location / market: ${location || "India"}
Real keywords this business targets: ${kw || "(none provided — infer from the industry)"}

Generate ${count} high-quality, BRAND-NEUTRAL prompts (no company names at all). Mix the intents listed in the rules. Return {"prompts":[...]}.`;

  let prompts = [];
  try {
    const { content } = await claudeChat({
      messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
      max_tokens: 1800,
      temperature: 0.7,
      meta: { api: "claude-geo-prompts" },
    });
    const json = content.match(/\{[\s\S]*\}/);
    const parsed = json ? JSON.parse(json[0]) : {};
    prompts = (Array.isArray(parsed.prompts) ? parsed.prompts : []).map((p) => String(p || "").trim()).filter(Boolean);
  } catch (e) {
    console.warn("[geo prompt-gen] Claude failed, using fallback:", e?.message);
  }

  // Hard filter: drop any prompt that leaked a brand/competitor term.
  prompts = prompts.filter(isClean);

  // Top up from the deterministic neutral set if Claude returned too few clean ones.
  if (prompts.length < count) {
    for (const fp of fallbackPrompts({ industry, location, count })) {
      if (prompts.length >= count) break;
      if (isClean(fp) && !prompts.some((p) => norm(p) === norm(fp))) prompts.push(fp);
    }
  }

  return prompts.slice(0, count);
}
