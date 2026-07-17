// src/lib/seo/geo/promptSetArchitect.js
// ─────────────────────────────────────────────────────────────────────────────
// Runs the `seo-geo-prompt-set-architect` Agent Skill EXACTLY, via one Claude call,
// on everything DoctorFizz collected. "Pin, do not trigger": the full skill bundle is
// pinned in the system prompt and Claude is told to execute it, so the output matches
// running the skill by hand (see doctorfizz-runner-prompt-set-architect.md).
//
// Produces the three-campaign, NON-BRANDED, humanized, buyer-grade prompt set
// (Citation Commercial, Mentions, Citation Information) - the exact quality of the
// reference itzfizz-prompt-set. Returns prompts in the planGeoPrompts shape, or null
// on any failure so the caller can fall back to the deterministic template pipeline.
// RULE 0: no em dashes or en dashes anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { PROMPT_SET_ARCHITECT_BUNDLE } from "./promptSetArchitect.bundle.js";
import { claudeChat } from "../../claude/client.js";
import { semanticSig } from "./semanticSig.js";

export const ARCHITECT_CAMPAIGNS = ["Citation Commercial", "Mentions", "Citation Information"];
const CAMPAIGN_INTENT = { "Citation Commercial": "commercial", Mentions: "commercial", "Citation Information": "informational" };
const CAMPAIGN_ANSWER = { "Citation Commercial": "comparison", Mentions: "listicle", "Citation Information": "explainer" };

const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");
const lc = (s) => clean(s).toLowerCase();
const kwStr = (k) => (typeof k === "string" ? k : (k && (k.keyword || k.term || k.label || k.query)) || "");
const kwVol = (k) => (k && (k.volume ?? k.search_volume ?? k.vol)) ?? null;
const kwIntent = (k) => (k && (k.intent || k.search_intent)) || "";
const compName = (c) => (typeof c === "string" ? c : (c && (c.name || c.domain || c.title)) || "");

// ── DEEP BUSINESS-SURFACE RELEVANCE ───────────────────────────────────────────
// Score every prompt by how much it overlaps THIS business's real crawled surface
// (core services, categories, keyword demand), so the onboarding auto-select picks the
// MOST on-business prompts per campaign instead of the model's emission order (the flat
// 95/80/65 weight buckets tie constantly, which made "top 5" meaningless). STRICT
// NEUTRALITY: the surface is built only from service / category / keyword tokens, never a
// brand or competitor name.
const _STOPWORDS = new Set(["what", "which", "best", "top", "near", "your", "that", "this", "with", "from", "have", "does", "should", "about", "cost", "price", "pricing", "services", "service", "company", "companies", "agency", "agencies", "business", "businesses", "provider", "providers", "need", "help", "find", "good", "great", "when", "where", "much", "many", "them", "they", "into", "between", "versus", "make", "made", "using", "based"]);
const _tok = (s) => { const set = new Set(); for (const t of String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) { if (t.length >= 4 && !_STOPWORDS.has(t)) set.add(t); } return set; };
function buildSurface(source = {}) {
  const parts = [];
  const push = (v) => { if (Array.isArray(v)) v.forEach((x) => parts.push(typeof x === "string" ? x : (x && (x.theme || x.name || x.label || x.keyword)) || "")); else if (v) parts.push(v); };
  push(source.coreServices); push(source.specificService); push(source.offerings); push(source.categories);
  push(source.category); push(source.industry); push(source.businessType);
  push((Array.isArray(source.keywords) ? source.keywords : []).map(kwStr));
  push(source.semanticThemes); push(source.keywordClusters);
  const toks = new Set(); for (const p of parts) for (const t of _tok(p)) toks.add(t);
  const kwTerms = (Array.isArray(source.keywords) ? source.keywords : []).map((k) => ({ term: lc(kwStr(k)), vol: Number(kwVol(k)) || 0 })).filter((k) => k.term && k.term.length >= 4);
  return { toks, kwTerms };
}
// 0-100 relevance of one prompt to the business surface. Continuous, so it breaks the
// weight-bucket ties the auto-select depends on.
function relevanceScore(text, surface) {
  if (!surface || !surface.toks.size) return 62;            // no crawl surface reached us → neutral middling
  const pt = _tok(text); if (!pt.size) return 40;
  let hits = 0; for (const t of pt) if (surface.toks.has(t)) hits++;
  const coverage = hits / pt.size;                          // fraction of the prompt that is on-surface
  let score = 42 + coverage * 42 + (Math.min(hits, 3) / 3) * 12;   // 42..96
  const lt = lc(text);
  let vol = 0; for (const k of surface.kwTerms) if (lt.includes(k.term)) vol = Math.max(vol, k.vol);   // demand boost
  if (vol > 0) score += Math.min(10, Math.log10(Math.max(10, vol)) * 3);
  return Math.max(0, Math.min(100, Math.round(score)));
}
const _wbase = (w) => (w === "H" ? 95 : w === "M" ? 80 : 65);
// Blend the model's weight (its relevance + importance judgement) with the deterministic
// crawl overlap, so quality_score is CONTINUOUS and ranks the most on-business prompt first.
const blendedQuality = (w, rel) => Math.max(0, Math.min(100, Math.round(_wbase(w) * 0.55 + rel * 0.45)));

// ── PER-CAMPAIGN TOP-UP (guarantee N per campaign) ────────────────────────────
// If Claude returns fewer than perCampaign in a campaign (rare, given the explicit
// instruction + retry), fill the gap with NEUTRAL prompts built from the crawled service
// surface so every campaign always shows a full set. Never brand/competitor names.
const _CAMPAIGN_TEMPLATES = {
  "Citation Commercial": (svc, loc) => [`how to choose a ${svc} provider${loc}`, `how much does ${svc} cost for a small business${loc}`, `${svc} pricing for a small business${loc}`, `what to look for when hiring a ${svc} provider`, `questions to ask before hiring a ${svc} provider`, `is ${svc} worth it for a small business`, `how to compare ${svc} providers${loc}`],
  Mentions: (svc, loc) => [`best ${svc} providers${loc}`, `top ${svc} companies${loc}`, `leading ${svc} firms${loc}`, `most recommended ${svc} providers${loc}`, `well reviewed ${svc} companies${loc}`, `established ${svc} providers${loc}`],
  "Citation Information": (svc, loc) => [`what is ${svc} and how does it work`, `how does ${svc} help a small business`, `why do small businesses need ${svc}`, `a beginner guide to ${svc}`, `how long does ${svc} take to show results`, `what should a small business know about ${svc}`],
};
function topUpCampaign(campaign, need, source, seenSigs) {
  if (need <= 0) return [];
  const svcs = [...new Set([...(Array.isArray(source.coreServices) ? source.coreServices : []), ...(Array.isArray(source.offerings) ? source.offerings : []), source.specificService, source.category, source.industry].map(clean).filter(Boolean))];
  if (!svcs.length) svcs.push("these services");
  const locCtx = source.locationContext || {};
  const locLabel = clean(locCtx.label || locCtx.city || locCtx.country_name || source.location || "");
  const loc = locLabel ? ` in ${locLabel}` : "";
  const surface = buildSurface(source);
  const out = [];
  const tmplFor = _CAMPAIGN_TEMPLATES[campaign] || _CAMPAIGN_TEMPLATES["Citation Information"];
  // cycle services × templates so top-ups vary by both service and angle
  outer: for (const svc of svcs) {
    for (const raw of tmplFor(lc(svc), campaign === "Citation Information" ? "" : loc)) {
      const prompt = clean(raw);
      const sig = semanticSig(prompt);
      if (!prompt || prompt.length < 6 || (sig && seenSigs.has(sig))) continue;
      if (sig) seenSigs.add(sig);
      out.push({ prompt, campaign, topic: clean(svc), weight: "M", relevance: relevanceScore(prompt, surface), toppedUp: true });
      if (out.length >= need) break outer;
    }
  }
  return out;
}

// Semantic de-dup uses the shared canonical signature (see ./semanticSig.js) so the
// architect, the template fallback, and the deck display all collapse the same
// meaning-duplicates ("best X in India" == "top X companies in India").

// The fixed Step-2 pinning system prompt (verbatim) with the whole skill bundle inlined.
function buildSystemPrompt() {
  return `You are executing a single Anthropic Agent Skill named seo-geo-prompt-set-architect. Your only job is to run that skill on the intake file the user provides, and return its deliverable.

The complete skill is provided below. Treat it as your authoritative instructions. Follow its workflow in order, step by step, without skipping any step, and let it override your own defaults wherever they differ.

Hard rules for this run:
1. Execute the skill exactly. Produce the deliverable it defines: a non branded prompt set organised into the three campaigns, Citation Commercial, Mentions, and Citation Information, in that priority order, each with its goal, its how to win, and a deduplicated prompt table, followed by the tracking setup, the check maths, and the routing shortlists.
2. Non interactive. Never ask the user a question. This runs in an automated pipeline with no one to answer. If an input is missing, apply the skill's documented fallback (for example, run from the site and mark the set as modelled, or default broad category prompts to the Mentions campaign) and note the assumption briefly in the output.
3. No branded prompts, no jobs to be done prompts, no free modifier prompts. Competitors are used only to read the citation landscape.
4. RULE 0: never use an em dash or an en dash anywhere in the output, including ranges. Use a comma, colon, parentheses, a full stop, or the word to for ranges.
5. Output only the deliverable. No preamble, no postamble, no explanation of your process. Begin directly with the first campaign heading. Wrap the entire deliverable between the markers <PROMPT_SET> and </PROMPT_SET> so it can be extracted.
6. Localise to the locations and languages in the intake, and use the intake's set_config for size, distribution, exclusions, tracker, engines, and cadence.
7. RELEVANCE IS MANDATORY. Every single prompt must map to THIS business's real services, category, and offerings as given in the intake (the service surface area, the known services, the topic themes, and the keyword demand). Never write a prompt that is generic or about a service this specific business does not offer. If a subject is not part of this business's surface, do not write a prompt for it. The person who entered this website must recognise every prompt as being about their own business.
8. NO SEMANTIC DUPLICATES. Two prompts must never target the same thing with only a synonym or filler swap. Treat best, top, leading, greatest, finest, recommended, and good as identical, so never output both "best X in Y" and "top X in Y". Every prompt must be meaningfully distinct from every other by subject, angle, buyer segment, location, or intent, not merely by wording. A different city, a different segment, or a different buyer question is distinct; a synonym swap of the same target is a duplicate and is forbidden.

===== SKILL BUNDLE START =====
${PROMPT_SET_ARCHITECT_BUNDLE}
===== SKILL BUNDLE END =====`;
}

// Build the intake .md from DoctorFizz's normalized source (see promptService.normalizeSource).
function buildIntake(source = {}, { size = 100, perCampaign = 0 } = {}) {
  const brand = clean(source.brand || source.clientName || source.name || "the business");
  const domain = clean(source.domain || "");
  const category = clean(source.category || source.industry || source.businessType || "");
  const businessType = clean(source.businessType || source.industry || source.category || "");
  const audience = clean(source.audience || source.targetAudience || "");
  const locCtx = source.locationContext || {};
  const location = clean(locCtx.label || locCtx.country_name || locCtx.city || source.location || "");
  const homepage = clean(source.homepageContent || source.homepageTitle || "").slice(0, 900);

  const kws = Array.isArray(source.keywords) ? source.keywords : [];
  const kwLines = kws.map((k) => {
    const term = clean(kwStr(k)); if (!term) return "";
    const v = kwVol(k), it = clean(kwIntent(k));
    const meta = [v != null ? `${v}/mo` : "", it].filter(Boolean).join(", ");
    return `- ${term}${meta ? ` (${meta})` : ""}`;
  }).filter(Boolean).slice(0, 60);
  const gaps = (Array.isArray(source.keywordGaps) ? source.keywordGaps : []).map((k) => clean(kwStr(k))).filter(Boolean).slice(0, 20);
  const paa = (source.serp && Array.isArray(source.serp.paa) ? source.serp.paa : []).map(clean).filter(Boolean).slice(0, 15);
  const comps = (Array.isArray(source.businessCompetitors) ? source.businessCompetitors : (source.competitors || [])).map(compName).map(clean).filter(Boolean).slice(0, 10);
  // Real topic themes from the site + keyword clusters + topic gaps ground every prompt in
  // THIS business's actual surface (relevance), never a generic or off-surface subject.
  const themeVals = (arr) => (Array.isArray(arr) ? arr : []).map((x) => clean(typeof x === "string" ? x : (x && (x.theme || x.cluster || x.name || x.label || x.keyword)) || "")).filter(Boolean);
  // Ground the topic axis in the REAL crawled service surface — coreServices / offerings /
  // categories the user confirmed — not only semantic themes (which the onboarding source often
  // omits). This is the "deeply analyse the crawled data" signal for relevance.
  const themes = [...new Set([...themeVals(source.coreServices), ...themeVals(source.offerings), ...themeVals(source.categories), source.specificService, themeVals(source.semanticThemes), themeVals(source.keywordClusters), themeVals(source.topicGaps)].flat().map(clean).filter(Boolean))].slice(0, 24);

  const lines = [];
  lines.push("# Intake: seo-geo-prompt-set-architect (DoctorFizz auto-fill)", "");
  lines.push("## business");
  lines.push(`- primary_name: ${brand}`);
  if (domain) lines.push(`- website: ${domain}`);
  if (category) lines.push(`- category: ${category}`);
  if (businessType) lines.push(`- business_type: ${businessType}`);
  if (audience) lines.push(`- target_audience: ${audience}`);
  lines.push("");
  lines.push("## locale");
  lines.push(`- location: ${location || "not specified"}`);
  lines.push(`- market: ${location || "not specified"}`);
  lines.push("- language: English");
  lines.push("");
  lines.push("## service_surface_area (the 8 to 12 topic axis MUST come from this real surface)");
  if (homepage) lines.push(`homepage_excerpt: ${homepage}`);
  if (themes.length) lines.push(`topic_themes (real, from the site and keyword clusters): ${themes.join(", ")}`);
  lines.push("EVERY prompt must be about one of THIS business's real services or themes above, grounded in the keyword demand below. Nothing generic, nothing off surface, nothing this business does not offer.");
  lines.push("");
  lines.push("## competitors (read the citation landscape ONLY, never write branded prompts)");
  if (comps.length) for (const c of comps) lines.push(`- ${c}`);
  else lines.push("(none supplied, read the live citation landscape for the category head terms)");
  lines.push("");
  lines.push("## keyword_demand (real DataForSEO / Moz backed queries, anchor prompts to these, do not fabricate)");
  if (kwLines.length) for (const l of kwLines) lines.push(l);
  else lines.push("(no keyword export supplied, model from the service surface and the live SERP, and mark the set as modelled)");
  if (gaps.length) { lines.push("", "keyword_gaps (uncaptured demand):"); for (const g of gaps) lines.push(`- ${g}`); }
  if (paa.length) { lines.push("", "people_also_ask (real buyer questions from the SERP):"); for (const q of paa) lines.push(`- ${q}`); }
  lines.push("");
  // Directory-dominated verticals: for agencies, local services, and professional
  // services, "best X" head terms are answered by third party directories and listicles
  // (Clutch, DesignRush, Yelp, publisher roundups), never a vendor page. The reference set
  // raises Mentions ABOVE the 25 default (to ~32) for exactly this reason, so nudge it here.
  const thirdPartyHeavy = /\b(agenc|marketing|seo|advertis|ppc|consult|studio|design|develop|branding|law|legal|dental|dentist|clinic|doctor|realtor|real estate|contractor|plumb|roofing|hvac|electric|salon|spa|restaurant|hotel|accountant|accounting|financial advisor|insurance|recruit|staffing|architect|interior|photograph|local)\b/i.test(`${category} ${businessType} ${audience}`);

  lines.push("## set_config");
  if (perCampaign > 0) {
    // FIXED per-campaign structure (onboarding): the selection UI shows exactly perCampaign per
    // campaign and requires the user to keep at least 5 of each, so the three campaigns MUST be
    // equal-sized. This overrides the skill's landscape-based reweighting.
    lines.push(`- size: ${perCampaign * ARCHITECT_CAMPAIGNS.length}`);
    lines.push(`- distribution: EXACTLY ${perCampaign} prompts in Citation Commercial, EXACTLY ${perCampaign} in Mentions, and EXACTLY ${perCampaign} in Citation Information (${perCampaign * ARCHITECT_CAMPAIGNS.length} total). This is a HARD requirement: do NOT reweight, do NOT exceed ${perCampaign} in any campaign, and do NOT emit fewer than ${perCampaign} in any campaign. Every prompt must still be genuinely on this business's surface; if a campaign is hard to fill, vary by service, buyer segment, location, and angle rather than dropping below ${perCampaign}.`);
    if (thirdPartyHeavy) lines.push("- landscape note: this is a third party directory dominated category (agency / local / professional services) where 'best X' head terms are answered by directories and listicles, so the Mentions prompts should read like the listicle questions buyers actually ask; keep the count at exactly the number above regardless.");
  } else {
    lines.push(`- size: ${size}`);
    if (thirdPartyHeavy) {
      lines.push("- distribution: this is a THIRD PARTY DIRECTORY DOMINATED category (agency / local / professional services), where every 'best X' head term is answered by directories and listicles (Clutch, DesignRush, Yelp, publisher roundups) and NO vendor page wins. RAISE Mentions ABOVE the 25 default to about 32 (Citation Commercial ~36, Mentions ~32, Citation Information ~32), and state the citation landscape finding that drives the split. Do NOT make Mentions the smallest campaign.");
    } else {
      lines.push("- distribution: default (Citation Commercial 40, Mentions 25, Citation Information 35); the skill MUST reweight from the live citation landscape if the category is third party dominated");
    }
  }
  lines.push("- exclusions: branded prompts, jobs to be done prompts, free modifier prompts, and semantic-duplicate prompts (any two that hit the same subject and location differing only by a best/top synonym)");
  lines.push("- tracker: Ahrefs Brand Radar custom prompts (tool agnostic, one prompt per line)");
  lines.push("- engines: ChatGPT, Gemini, Perplexity, Copilot, Google AI Overviews");
  lines.push("- cadence: monthly");
  return lines.join("\n");
}

function extractDeliverable(content) {
  const s = String(content || "");
  const m = s.match(/<PROMPT_SET>([\s\S]*?)<\/PROMPT_SET>/i);
  return (m ? m[1] : s).trim();
}

// Parse the three campaign markdown tables into rows. Line by line so it handles the
// per-market sub-tables inside Mentions (### India / United Kingdom / ...) and stops
// cleanly at non-campaign sections (## Tracking setup, ## Reading the baseline, ...).
function parsePromptSet(text) {
  const rows = [];
  const canon = (name) => ARCHITECT_CAMPAIGNS.find((c) => lc(c) === lc(name)) || null;
  let current = null;
  for (const line of String(text || "").split("\n")) {
    // A level-2 "## " heading switches campaign context (### sub-headings do NOT match,
    // so market sub-tables stay under their campaign). A non-campaign ## clears context.
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      const nm = h2[1].match(/^(?:Campaign\s*\d+\s*:\s*)?(Citation Commercial|Mentions|Citation Information)\b/i);
      current = nm ? canon(nm[1]) : null;
      continue;
    }
    if (!current || !line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    const compact = cells.filter((c, i) => !(i === 0 && c === "") && !(i === cells.length - 1 && c === ""));
    if (compact.length < 2 || !/^\d+$/.test(compact[0])) continue; // skip header/separator rows
    const prompt = clean(compact[1] || "");
    if (!prompt || prompt.length < 6 || /^prompt$/i.test(prompt)) continue;
    const topic = clean(compact[2] || "");
    const weight = (clean(compact[3] || "").toUpperCase().replace(/[^LMH]/g, "") || "M").slice(0, 1);
    rows.push({ prompt, campaign: current, topic, weight });
  }
  return rows;
}

// Step-6 post-run validation.
function validatePromptSet(deliverable, rows, { brand, competitors }) {
  const reasons = [];
  if (/[—–]/.test(deliverable)) reasons.push("contains an em or en dash (RULE 0)");
  for (const c of ARCHITECT_CAMPAIGNS) if (!new RegExp(c, "i").test(deliverable)) reasons.push(`missing campaign heading: ${c}`);
  if (!/<PROMPT_SET>/i.test(String(deliverable)) && !rows.length) reasons.push("no extractable prompt rows");
  const forbidden = [brand, ...(competitors || [])].map(lc).filter((x) => x && x.length >= 3);
  const branded = rows.filter((r) => forbidden.some((f) => lc(r.prompt).includes(f)));
  if (branded.length) reasons.push(`${branded.length} branded prompt(s) leaked`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * Run the skill and return the prompt set (or null on failure to let the caller fall back).
 * @returns {Promise<{prompts:Array, campaigns:Array, deliverable:string, modelled:boolean, validation:object}|null>}
 */
export async function generatePromptSet(source = {}, { size = 100, perCampaign = 0, domain = "", timeoutMs = 200000 } = {}) {
  if (!String(process.env.ANTHROPIC_API_KEY || "").trim()) return null;
  // perCampaign>0 → fixed equal-size campaigns (onboarding wants exactly N in each of the 3).
  const per = perCampaign > 0 ? perCampaign : 0;
  const effSize = per > 0 ? per * ARCHITECT_CAMPAIGNS.length : size;
  const intake = buildIntake(source, { size: effSize, perCampaign: per });
  const messages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: `Run the skill on this intake file and return the prompt set.\n\n===== INTAKE START =====\n${intake}\n===== INTAKE END =====` },
  ];
  // Premium tier: opus produces the richest, most humanized phrasing + the sharpest
  // out-create-vs-pitch judgement (the reference-set quality). Override via GEO_ARCHITECT_MODEL.
  const model = String(process.env.GEO_ARCHITECT_MODEL || "").trim() || "claude-opus-4-8";
  const maxOut = Math.min(16000, Math.max(8000, Math.round(effSize * 140)));
  const brand = clean(source.brand || source.clientName || source.name || "");
  const competitors = (Array.isArray(source.businessCompetitors) ? source.businessCompetitors : (source.competitors || [])).map(compName).map(clean).filter(Boolean);
  const forbidden = [brand, ...competitors].map(lc).filter((x) => x && x.length >= 3);

  // ONE architect attempt: call Claude, extract, parse, drop branded, semantic-dedup.
  const attempt = async (ms) => {
    let deliverable = "";
    try {
      const { content } = await claudeChat({
        messages, model, temperature: 0.2, max_tokens: maxOut, timeoutMs: ms,
        meta: { domain, api: "claude-geo-prompt-set-architect", label: "prompt-set-architect" },
      });
      deliverable = extractDeliverable(content);
    } catch (e) {
      try { console.warn("[prompt-set-architect] Claude run failed:", e?.message); } catch { /* ignore */ }
      return null;
    }
    let rows = parsePromptSet(deliverable);
    const check = validatePromptSet(deliverable, rows, { brand, competitors });
    rows = rows.filter((r) => !forbidden.some((f) => lc(r.prompt).includes(f)));   // drop any branded leak
    // Semantic de-dup safety net: collapse meaning-duplicates the model may still emit
    // (same subject + location, only a best/top synonym swap). Keep the first occurrence.
    const seenSig = new Set();
    rows = rows.filter((r) => { const sig = semanticSig(r.prompt); if (!sig || seenSig.has(sig)) return sig ? false : true; seenSig.add(sig); return true; });
    if (rows.length < 12) return null;   // not a usable set
    return { rows, deliverable, check };
  };

  // The architect IS the quality gate (72% of the reference vs ~11% for the template
  // fallback), so a single big Claude call must not silently drop us to the template on a
  // transient hiccup. Retry ONCE, but only if the first attempt failed FAST (a parse or
  // format miss, not a timeout) so two attempts still fit inside the 300s function budget.
  const started = Date.now();
  let res = await attempt(Math.min(timeoutMs, 190000));
  const elapsed = () => Date.now() - started;
  if (!res && elapsed() < 150000) {
    try { console.warn("[prompt-set-architect] attempt 1 produced no usable set, retrying once"); } catch { /* ignore */ }
    res = await attempt(Math.min(100000, Math.max(40000, 290000 - elapsed())));
  }
  if (!res) return null;   // architect genuinely unavailable -> caller falls back to template
  let { rows } = res;
  const { deliverable, check } = res;

  // DEEP RELEVANCE: score every row against the crawled business surface so ranking (and the
  // onboarding auto-select) picks the most on-business prompts, not the model's emission order.
  const surface = buildSurface(source);
  for (const r of rows) r.relevance = relevanceScore(`${r.prompt} ${r.topic || ""}`, surface);
  const seen = new Set(rows.map((r) => semanticSig(r.prompt)).filter(Boolean));

  let finalRows;
  if (per > 0) {
    // CAMPAIGN-BALANCED, EXACTLY `per` PER CAMPAIGN: keep the `per` most-relevant in each campaign
    // (highest relevance, then the model's weight), and TOP UP any campaign the model under-filled
    // so every campaign always shows a full set. Campaigns stay in priority order.
    const rankInCampaign = (a, b) => (b.relevance - a.relevance) || (_wbase(b.weight) - _wbase(a.weight));
    finalRows = [];
    for (const camp of ARCHITECT_CAMPAIGNS) {
      let inCamp = rows.filter((r) => r.campaign === camp).sort(rankInCampaign).slice(0, per);
      if (inCamp.length < per) inCamp = inCamp.concat(topUpCampaign(camp, per - inCamp.length, source, seen)).slice(0, per);
      finalRows.push(...inCamp);
    }
  } else {
    // standard / full runs: campaign priority order, model's within-campaign order preserved.
    finalRows = [...rows].sort((a, b) => ARCHITECT_CAMPAIGNS.indexOf(a.campaign) - ARCHITECT_CAMPAIGNS.indexOf(b.campaign));
  }

  const prompts = finalRows.map((r, i) => {
    const rel = Number.isFinite(r.relevance) ? r.relevance : relevanceScore(r.prompt, surface);
    return {
      prompt: r.prompt,
      cluster: r.campaign,
      campaign: r.campaign,
      topic: r.topic || "",
      weight: r.weight || "M",
      intent: CAMPAIGN_INTENT[r.campaign] || "commercial",
      neutral: true,
      source_keyword: "",
      expected_answer_type: CAMPAIGN_ANSWER[r.campaign] || "paragraph",
      relevance_score: rel,
      // CONTINUOUS quality (weight blended with crawl relevance) → the auto-select can rank the
      // most on-business prompt first instead of tying every H-weight at 95.
      quality_score: blendedQuality(r.weight || "M", rel),
      // campaign band keeps the 3 campaigns ordered; relevance orders WITHIN a campaign (best first).
      priority_score: (ARCHITECT_CAMPAIGNS.length - ARCHITECT_CAMPAIGNS.indexOf(r.campaign)) * 100 + rel,
      priority: i + 1,
      dedup_key: semanticSig(r.prompt),
    };
  });

  const campaigns = ARCHITECT_CAMPAIGNS.map((c) => ({ campaign: c, count: prompts.filter((p) => p.campaign === c).length }));
  return { prompts, campaigns, deliverable, modelled: /modelled/i.test(deliverable), validation: check };
}

export default generatePromptSet;
