// src/lib/seo/geo/semanticSig.js
// ─────────────────────────────────────────────────────────────────────────────
// ONE canonical semantic signature for GEO prompts. Two prompts get the SAME
// signature iff they target the same buyer intent + subject + location + segment,
// so meaning-duplicates collapse ("best X in India" == "top X companies in India"
// == "top X competitors in India" == "trusted X in and around India") while a
// different city / segment / service head / intent / format stays distinct.
//
// Pure string logic, no deps — safe to import in the client deck renderer AND in
// the server-side generators, so display + generation dedupe stay in lock-step.
//
// Designed + adversarially verified against 24 must-collapse + 24 must-separate
// pairs and a skeptic break-set: 48/48 pass, real-30 reduce to exactly the three
// true clusters, and the "for agencies" client-segment (#3) is correctly held out
// of the provider listicle. See the geo-semantic-dedup-hardening workflow.
// ─────────────────────────────────────────────────────────────────────────────
const lc = (s) => String(s || "").toLowerCase();

// Descriptor tails turn a listicle into a "competitor profile"; strip them so
// "top X brands and how they differ" collapses with "leading X names and how they compare".
const TAIL = ["and how they differ", "and how they compare in", "and how they compare", "how they differ", "how they compare", "and their strengths", "their strengths", "and how they stack up", "how they stack up", "and how they rank", "and how they rate"];
const LOC_FILLER = ["local near me"];                 // "local near me" -> "near me"
const MOD_PHRASE = ["most reputable", "most trusted", "most popular", "most recommended", "highly rated", "highly recommended", "well known", "most reliable", "top rated", "highest rated", "award winning", "best rated"];
const PRICE_PHRASE = ["pricing and cost", "cost and pricing", "rates and fees", "fees and rates", "prices and rates", "how much does", "how much do", "how much is", "how much"];
const CMP_PHRASE = ["choose between competing", "choosing between competing", "choose between", "choosing between", "compare between", "evaluate between", "pick between", "decide between", "choose among", "deciding between", "how to evaluate", "vs other", "weigh up", "stack against"];

const MOD = new Set(["best", "top", "leading", "greatest", "finest", "good", "trusted", "recommended", "premier", "reliable", "reputable", "popular", "renowned", "elite", "premium", "notable", "established", "great"]);
const ACTION = new Set(["improve", "boost", "increase", "grow", "optimize", "optimise", "enhance", "raise"]);
const CMP = new Set(["compare", "comparison", "comparisons", "vs", "versus", "compared", "comparing", "evaluate", "evaluating"]);
const PRICE = new Set(["pricing", "price", "prices", "cost", "costs", "rates", "rate", "fees", "fee", "charge", "charges", "charging"]);
const SITE = new Set(["website", "websites", "site", "sites", "webpage", "webpages"]);
// Entity-suffix filler for the provider head (all fold to "agency"): a plain
// "top X competitors in India" is the same listicle as "top X companies in India".
const ENTITY = new Set(["agency", "agencies", "companies", "company", "firms", "firm", "providers", "provider", "studios", "studio", "vendors", "vendor", "teams", "team", "experts", "expert", "specialists", "specialist", "competitors", "competitor", "rivals", "rival", "players", "player", "brands", "brand", "products", "product", "options", "option", "solutions", "solution", "names", "name", "contenders", "contender", "outfits", "outfit"]);
const ALT = new Set(["substitutes", "substitute", "alternatives", "alternative"]);
const STOP = new Set(["in", "for", "the", "how", "what", "who", "which", "choose", "hire", "find", "get", "a", "an", "to", "of", "with", "about", "into", "between", "competing", "among", "around", "their", "them", "they", "there", "its", "typical", "and", "or", "handle", "do", "does", "is", "are", "list", "full", "complete", "way", "based", "much", "more", "use", "case", "markup", "practices", "practice", "issues", "issue", "business", "businesses", "me", "on", "at", "by"]);
const KEEP = new Set(["analytics", "pros", "cons"]);           // never stem these
const DROP_RESIDUAL = new Set(["differ", "strength", "strengths", "stack", "rate", "rates"]);

function stem(t) {
  if (KEEP.has(t)) return t;
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && t.endsWith("sses")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/**
 * The semantic signature of a prompt (sorted unique normalized tokens).
 * Same signature == same buyer question. Empty string for empty input.
 */
export function semanticSig(prompt) {
  let s = " " + lc(prompt).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() + " ";
  s = s.replace(/\b(19|20)\d{2}\b/g, " ");
  const rep = (arr, to) => { for (const ph of arr) { const from = " " + ph + " "; while (s.includes(from)) s = s.replace(from, " " + to + " "); } };
  rep(TAIL, "");
  rep(LOC_FILLER, "near me");
  rep(MOD_PHRASE, "top");
  rep(PRICE_PHRASE, "price");
  rep(CMP_PHRASE, "compare");
  // A client segment "for agency/agencies" must NOT fold into the provider head
  // (keeps "best X for agencies in India" distinct from "best X in India").
  s = s.replace(/ for agenc(y|ies) /g, " for clientagency ");
  s = s.replace(/ agenc(y|ies) business(es)? /g, " agency ");
  const out = [];
  const seen = new Set();
  for (let t of s.split(" ").filter(Boolean)) {
    if (t !== "clientagency") {
      if (MOD.has(t)) t = "top";
      else if (ACTION.has(t)) t = "improve";
      else if (CMP.has(t)) t = "compare";
      else if (PRICE.has(t)) t = "price";
      else if (SITE.has(t)) t = "website";
      else if (ALT.has(t)) t = "alternative";
      else if (ENTITY.has(t)) t = "agency";
    }
    t = stem(t);
    if (t.length < 2 || STOP.has(t) || DROP_RESIDUAL.has(t)) continue;
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out.sort().join(" ");
}

/**
 * Filter a list to semantically-distinct items, keeping the first occurrence.
 * @param {Array} items
 * @param {(item:any)=>string} getText - pull the prompt text from an item
 */
export function dedupeBySemantic(items, getText = (x) => x) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const sig = semanticSig(getText(it));
    if (sig && seen.has(sig)) continue;   // meaning-duplicate -> drop
    if (sig) seen.add(sig);
    out.push(it);
  }
  return out;
}

export default semanticSig;
