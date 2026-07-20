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
// B14 — normalise brand DISPLAY casing once at the entity layer: an all-lowercase scrape ("acobloom")
// is Title-cased so it renders identically to a capitalised mention ("Acobloom"); names that already
// carry deliberate casing (camelCase / TitleCase / ALLCAPS: PageTraffic, WATConsult) are left untouched.
// Matching keys elsewhere still lowercase, so dedup / known-set logic is unaffected.
const canonBrand = (s) => { const t = clean(s); return (!t || /[A-Z]/.test(t)) ? t : t.replace(/\b[a-z]/g, (c) => c.toUpperCase()); };
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

// ── Open brand discovery ──────────────────────────────────────────────────────
// Brands the AI ACTUALLY named that were NOT in the client's configured competitor list.
// These are real market intelligence (the rivals AI recommends), so we surface them in the
// report. Precision matters more than recall: a strict stoplist + "must look like a brand"
// gate here, then a "must appear in ≥2 prompts" threshold at aggregation, keep noise out.
// OPENERS = sentence-starters / connectives / rank words that are NEVER part of a brand name.
// These are TRIMMED from the ends of a candidate (so "Consider WATConsult" -> "WATConsult").
const _OPENERS = new Set(`the this that these those their there they them we you our your it its his her who whom whose what which where when while
a an and or but for to of in on at by as is are was were be been being have has had do does did will would can could should may might must not no yes if then than so such more less least very much also just even still
best top leading trusted popular great good better several some many most other others various overall however additionally furthermore moreover note consider choose look here below above first second third fourth fifth sixth finally including includes include based known offers offer provides provide offering try use using check explore discover recommended recommend see find get make
meanwhile instead therefore hence whereas nonetheless regardless ultimately specifically notably importantly generally typically essentially basically actually certainly clearly obviously interestingly unfortunately fortunately similarly likewise conversely alternatively although though despite unlike according whether within without across throughout beyond upon each every any all none both few during about again
because since unless until after before once why how ever never always often sometimes usually perhaps maybe likely probably almost nearly really simply only mostly indeed overall given rather quite either neither
evaluate evaluating compare comparing assess assessing considering ensure ensuring choosing selecting identifying determining reviewing researching exploring`.split(/\s+/).filter(Boolean));
// GENERIC = business / marketing / platform words that ARE often capitalised in answers but are
// NOT company names. A candidate is DROPPED when EVERY one of its words is generic (or an opener /
// the client's location) — so "Email Marketing", "E-commerce", "Digital Marketing", "Branding",
// "B2B", "Shopify" go, while a real name with at least one distinctive word ("Social Panga") stays.
const _GENERIC = new Set([...
_OPENERS,
...`services service solutions solution company companies agency agencies firm firms provider providers platform platforms
business businesses brand brands branding team teams group groups digital marketing seo sem ppc smm advertising ads
design designs development developer media creative consulting consultancy consultants studio studios partners partner
global international national local regional enterprise enterprises industries industry sector market marketplace clients client
customers customer results result strategy strategies campaign campaigns content social website websites web app apps
software tool tools email ecommerce e-commerce commerce retail wholesale b2b b2c saas crm cms roi kpi ux ui api seo-friendly
analytics automation optimization optimisation conversion engagement audience traffic leads sales revenue growth
google chatgpt gemini perplexity claude copilot microsoft openai anthropic bing meta amazon apple facebook instagram
linkedin twitter youtube tiktok pinterest shopify wordpress wix webflow squarespace hubspot mailchimp klaviyo salesforce
zoho magento woocommerce wordpress ai llm gpt overview overviews
clutch designrush goodfirms sortlist trustpilot capterra yelp glassdoor sitejabber ambitionbox reddit quora medium forbes wikipedia upwork fiverr sulekha justdial indiamart tradeindia g2 techtarget
profile profiles maps map engine engines search graphic page pages listing listings review reviews rating ratings
post posts vitals core experience voice keyword keywords backlink backlinks ranking rankings score scores sitemap
technical robots schema canonical redirect redirects title titles tag tags heading headings snippet snippets citation citations
generative discovery presence visibility awareness reputation positioning outreach funnel pipeline dashboard report reports
january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday
india indian usa uk us united states america american europe european asia asian australia canada uae dubai singapore mumbai delhi gurgaon bangalore bengaluru chennai pune kolkata hyderabad noida ahmedabad jaipur surat lucknow
startup startups founder founders entrepreneur entrepreneurs freelancer freelancers
british dutch german french italian spanish portuguese russian chinese japanese korean canadian australian brazilian mexican swiss swedish norwegian danish irish scottish welsh
specialization specializations deliverables deliverable expertise portfolio portfolios offerings offering capabilities capability methodology methodologies approach approaches process processes pricing packages package deliverable focused based driven oriented
return returns investment investments cost costs price prices fee fees rate rates budget spend spending
skip chat images apps deep settings search menu tools sidebar temporary regenerate login logout signin signup account profile library explore attach upgrade share copy send stop model models version versions`.split(/\s+/).filter(Boolean)]);

// Generic industry acronyms that survive the "all-caps prefix" brand test but are NOT company names.
const _GEN_ACRONYMS = new Set("seo sem smm ppc roi roas ctr cta cpc cpm cro ux ui api cms crm saas faq kpi aov b2b b2c ai llm gpt serp url gmb nap eeat eat sme smb".split(/\s+/));

// Common English words (gerunds, verbs, plural nouns, adjectives, adverbs) that appear Title-cased at a
// sentence start or as a list lead ("Choosing the right…", "Focus on…", "Experts recommend…") but are NOT
// brands. Distinct from _OPENERS: these survived the end-trim yet must NOT be admitted as a lone-word
// "brand" by the length≥4 recall gate below. Coined agency names (Techmagnate, Uplers, Sparklin) are NOT
// here, so recall is preserved; only real dictionary words are rejected.
const _STOPWORDS = new Set(`choosing selecting picking finding comparing evaluating considering assessing reviewing researching exploring identifying determining understanding looking starting building growing improving increasing boosting driving generating optimizing focusing ensuring including featuring offering providing delivering creating managing running leading helping ranking hiring partnering working
choose select pick find compare evaluate consider assess review research explore identify determine understand start build grow improve increase boost drive generate optimize focus ensure include feature offer provide deliver create manage lead avoid remember want know think read visit contact trust prefer recommend suggest hire
experts leaders options factors reasons ways tips steps things points areas aspects elements examples types kinds prices costs fees rates plans packages lists guides answers questions clients customers users teams professionals specialists consultants partners benefits features results reviews ratings brands names businesses markets industries sectors trends insights
best top leading trusted popular great better various several many different essential important critical crucial vital useful helpful valuable effective efficient reliable reputable established experienced professional skilled talented creative innovative modern advanced comprehensive complete affordable premium quality
overall additionally furthermore moreover meanwhile instead therefore finally ultimately importantly notably specifically generally typically usually often sometimes perhaps maybe likely probably certainly clearly obviously interestingly unfortunately fortunately similarly likewise conversely alternatively
founded headquartered depending prominent notable renowned numerous regarding following specializing nevertheless assuming establishing operating serving ranked listed featured awarded recognized dedicated committed established known trusted proven`.split(/\s+/).filter(Boolean));

// MENTION vs CITATION — directory / publisher / review-site / social names the AI ATTRIBUTES to are
// CITATIONS (sources), never competitor brand MENTIONS. _GENERIC catches the single-word ones (clutch,
// reddit, g2…); this set adds the multi-word / publisher names it misses ("Search Engine Journal",
// "The Manifest", "Product Hunt", "TechCrunch") so a SOURCE named in the prose is never promoted to a
// brand mention. Matched as a whole normalized name → a real brand containing one of these words is safe.
const _SOURCE_NAMES = new Set([
  "search engine journal","searchenginejournal","search engine land","searchengineland","the manifest","manifest",
  "product hunt","producthunt","hacker news","hackernews","hackernoon","techcrunch","mashable","the verge","verge",
  "wired","cnet","zdnet","venturebeat","business insider","businessinsider","forbes","gartner","crunchbase","g2 crowd",
  "clutch","designrush","goodfirms","sortlist","trustpilot","capterra","sitejabber","ambitionbox","yelp","glassdoor",
  "indeed","reddit","quora","medium","linkedin","wikipedia","youtube","upwork","fiverr","justdial","indiamart","tradeindia","sulekha","techtarget",
]);
const _isSourceName = (nm) => { const k = String(nm || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); return !!k && (_SOURCE_NAMES.has(k) || _SOURCE_NAMES.has(k.replace(/\s+/g, ""))); };

function discoverBrands(text, { known = new Set(), location = "" } = {}) {
  const t = String(text || "");
  if (t.length < 20) return [];
  const loc = new Set(String(location || "").toLowerCase().split(/[\s,]+/).filter(Boolean));
  const counts = {};
  // ONLY runs of CONSECUTIVE Title-Case words (no "and"/"of"/"the"/"." connectors — those merge
  // separate brands or bleed across a sentence boundary). 1–3 tokens per run.
  const re = /\b([A-Z][A-Za-z0-9'&\-]+(?:\s+[A-Z][A-Za-z0-9'&\-]+){0,2})\b/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    let words = m[1].trim().split(/\s+/);
    // trim ONLY opener/connective tokens from the ends (keeps a distinctive word like "Social" in
    // "Social Panga", which a full-stoplist trim would have stripped down to just "Panga").
    while (words.length && (_OPENERS.has(words[0].toLowerCase()) || loc.has(words[0].toLowerCase()))) words.shift();
    while (words.length && (_OPENERS.has(words[words.length - 1].toLowerCase()) || loc.has(words[words.length - 1].toLowerCase()))) words.pop();
    if (!words.length) continue;
    const name = words.join(" ");
    const low = name.toLowerCase();
    if (name.length < 3 || known.has(low) || loc.has(low)) continue;
    // DROP when every word is generic/opener/location (e.g. "Email Marketing", "Digital Media").
    if (words.every((w) => _GENERIC.has(w.toLowerCase()) || loc.has(w.toLowerCase()))) continue;
    if (words.some((w) => /^opens$/i.test(w))) continue;   // scraped UI-chrome ("… Opens in a new tab") — plural only, keeps "Open Influence"
    // Descriptive compounds are attributes of a brand, not a brand ("India-based", "ROI-focused",
    // "results-driven", "AI-powered"). Drop any run containing such a token — it's a listicle qualifier.
    if (words.some((w) => /-(based|focused|driven|led|oriented|centric|first|friendly|ready|grade|specific|related|powered|backed|approved|certified|rated|centered|minded|savvy|assisted|enabled|only|specialized|tailored|leading)$/i.test(w))) continue;
    if (words.length === 1) {
      // A single-word brand must LOOK like a real product name: camelCase (PageTraffic, WordStream)
      // or an all-caps prefix then lowercase (WATConsult). Plain Title-case single words (Branding,
      // Email, Shopify) are dropped — they are almost always generic, not a competitor.
      const w = words[0];
      // Generic industry ACRONYMS ("KPIs", "ROI", "SEO", "PPC") pass the all-caps-prefix test but are
      // NOT brands — drop them (they were leaking into the "AI-named competitors" list).
      const _acr = w.toLowerCase().replace(/s$/, "");
      if (_GEN_ACRONYMS.has(_acr)) continue;
      // Possessive of a location/generic ("India's", "India's,") is not a brand — strip the 's and re-test.
      const _bare = w.toLowerCase().replace(/['’]s$/, "");
      if (_bare !== w.toLowerCase() && (_GENERIC.has(_bare) || loc.has(_bare) || _STOPWORDS.has(_bare))) continue;
      // RECALL FIX (§6/p15): real agency names are frequently plain Title-case single words
      // (Techmagnate, Uplers, Sparklin, Bonoboz) — the old gate required camelCase and dropped them,
      // so the "who it named" column went to "—". Openers/connectives/generics/directories/acronyms/
      // UI-chrome are all filtered ABOVE, so a distinctive survivor of length ≥ 4 is almost always a
      // real brand. camelCase / all-caps-prefix (PageTraffic, WATConsult) always pass; short fragments drop.
      const brandy = /[a-z][A-Z]/.test(w) || /^[A-Z]{2,}[a-z]/.test(w);
      // A lone plain Title-case word is admitted only if it's distinctive (≥4 chars) AND not a common
      // English word — this is what keeps the recall (Techmagnate/Uplers) while rejecting sentence-lead
      // gerunds/verbs/plural-nouns ("Choosing", "Building", "Experts", "Options", "Focus", "Evaluate").
      if (!brandy && (w.length < 4 || _STOPWORDS.has(w.toLowerCase()) || _STOPWORDS.has(w.toLowerCase().replace(/s$/, "")))) continue;
    }
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

// Report-build-time guard: true when a discovered "brand" is actually a generic/topic term, not a
// company (e.g. "Technical SEO", "Google Business Profile", "KPIs", "SMEs"). Mirrors the discoverBrands
// drop rules so it also cleans ALREADY-STORED runs whose discoveredBrands predate a stoplist change.
// TOPIC / UI noise: a term that is never a company — an all-generic phrase ("Google Business Profile",
// "Technical SEO"), a generic industry acronym ("KPIs", "SMEs", "ROI"), or scraped UI-chrome ("About
// Gemini Opens", "… Opens in a new tab"). Deliberately does NOT reject a plain lowercase/Title single
// word: real competitor tokens the collector lowercases (pagetraffic, techmagnate, webchutney, rankz)
// are distinctive words, not topics — this is what cleans the SoV / competitor wall without nuking them.
export function isTopicNoise(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.some((w) => /^opens$/i.test(w))) return true;                 // "… Opens in a new tab" (plural only, keeps "Open Influence")
  if (words.every((w) => _GENERIC.has(w.toLowerCase()))) return true;      // every word generic → topic
  if (words.length === 1 && _GEN_ACRONYMS.has(words[0].toLowerCase().replace(/s$/, ""))) return true; // KPIs, SMEs, ROI…
  return false;
}

// Stricter form used ONLY for DISCOVERED-brand extraction (discovery is noisier, so also reject a lone
// Title-case word that does not look like a product name — "Branding", "Email"). Never use this to
// filter matched competitors / the SoV board: it would drop real lowercase brands. Use isTopicNoise there.
export function isBrandNoise(name) {
  if (isTopicNoise(name)) return true;
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const w = words[0];
    if (!(/[a-z][A-Z]/.test(w) || /^[A-Z]{2,}[a-z]/.test(w))) return true;  // not a brandy single word
  }
  return false;
}

// Sentiment toward the brand, ONLY when detectable from language NEAR the brand mention.
// Returns "positive" | "negative" | "neutral" | null (null = brand not mentioned / no signal).
const POS_CUES = /\b(best|top|leading|excellent|great|strong|recommended|trusted|reliable|popular|highly rated|standout|impressive|go-to|premier|award)\b/i;
const NEG_CUES = /\b(avoid|poor|worst|bad|weak|unreliable|not recommended|disappointing|lacking|overpriced|limited|outdated|concerns?)\b/i;
function detectSentiment(text, brand, brandIndex) {
  if (!brand || brandIndex == null || brandIndex < 0) return null;
  const window = String(text).slice(Math.max(0, brandIndex - 140), brandIndex + 180);
  const pos = POS_CUES.test(window);
  const neg = NEG_CUES.test(window);
  if (pos && !neg) return "positive";
  if (neg && !pos) return "negative";
  if (pos && neg) return "neutral";
  return "neutral"; // brand mentioned but no clear directional language
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
// A logged-out engine (esp. ChatGPT) can return its INTERFACE instead of an answer — a login wall or bare
// nav ("Skip", "Chat", "Settings", "Log in", "Sign up"). That is a NON-ANSWER: we must extract NOTHING and
// let the result read as an explicit null ("—" / "No answer"), never scrape the chrome as if it were brands.
// Deterministic, conservative — only fires on clear login-wall phrasing or nav-token soup, never on real prose.
const _NAV_TOKEN = /^(skip|chat|images?|apps?|deep|settings?|search|menu|tools?|sidebar|temporary|regenerate|login|logout|signin|signup|upgrade|share|copy|send|stop|library|explore|new|continue|home|account|profile|help|voice|model|version|attach)$/i;
export function looksLikeNonAnswer(text) {
  const t = String(text || "").trim();
  if (t.length < 20) return true;                                       // truly empty — not a real answer
  const low = t.toLowerCase();
  // Anchored login-wall / interstitial phrasing only — must be a clear GATE, not incidental words in a real
  // answer ("sign up to their free plan" must NOT trip this; "sign up to continue" must).
  if (t.length < 400 && /(stay logged out|log ?in to (continue|see|view|access)|sign ?up to (continue|view|see|access|unlock|chat)|create (your |a |an )?(free )?account to|to continue,?\s*(log ?in|sign ?up)|verify you are (human|not a robot)|just a moment\.?\.?\.?\s*$|you'?ve reached your (message|usage|daily|free)|message limit|unlock (with|this)|upgrade to (continue|unlock))/i.test(low)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 30) {
    const nav = words.filter((w) => _NAV_TOKEN.test(w)).length;
    const sentences = (t.match(/[.!?]["')]?(\s|$)/g) || []).length;
    if (nav >= 3 && sentences <= 1) return true;                        // nav-token soup, no prose
    if (words.length && nav / words.length > 0.4) return true;          // mostly interface tokens
  }
  return false;
}

export function parseAnswer(response = {}, ctx = {}) {
  const text = String(response.answerText || response.renderedText || "");
  const _nonAnswer = looksLikeNonAnswer(text);   // engine returned its UI / login wall, not an answer
  const html = String(response.raw_html || response.rawHtml || "");
  const citeUrls = Array.isArray(response.citations) ? response.citations : [];
  const engine = ENGINE_KEY_BY_NAME[String(response.engine || "").toLowerCase()] || String(response.engine || "").toLowerCase();

  const brand = canonBrand(ctx.brand);
  const brandDomain = rootDomain(ctx.brandDomain || "");
  const competitors = (ctx.competitors || [])
    .map((c) => (typeof c === "string" ? { name: canonBrand(c), domain: "" } : { name: canonBrand(c.name || c.brand || ""), domain: rootDomain(c.domain || "") }))
    .filter((c) => c.name || c.domain);

  // ── mentions (with first-appearance order) ──
  const entities = [];
  const _occ = (name) => (_nonAnswer ? { count: 0, firstIndex: -1 } : firstOccurrence(text, name));   // non-answer → nothing counts as mentioned
  if (brand) entities.push({ name: brand, type: "brand", domain: brandDomain, ..._occ(brand) });
  for (const c of competitors) entities.push({ name: c.name, type: "competitor", domain: c.domain, ..._occ(c.name) });
  const present = entities.filter((e) => e.count > 0).sort((a, b) => a.firstIndex - b.firstIndex);
  present.forEach((e, i) => { e.position = i + 1; });

  const toMention = (e) => ({ entity_name: e.name, entity_type: e.type, domain: e.domain || "", mention_count: e.count, mention_position: e.position || null, context_snippet: snippet(text, e.firstIndex), confidence: 0.8 });
  const brandMentions = entities.filter((e) => e.type === "brand" && e.count > 0).map(toMention);
  const competitorMentions = entities.filter((e) => e.type === "competitor" && e.count > 0).map(toMention);

  // discovered competitors — brands the AI named that are NOT the client or a configured rival.
  const _known = new Set([brand, ...competitors.map((c) => c.name)].filter(Boolean).map((s) => s.toLowerCase()));
  const discoveredBrands = _nonAnswer ? [] : discoverBrands(text, { known: _known, location: clean(ctx.location || ctx.region || "") });

  // ── citations (classified by domain) ──
  const citations = (_nonAnswer ? [] : citeUrls).map((url, i) => {
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

  // MENTION vs CITATION guard — a "discovered brand" that is actually a KNOWN SOURCE (directory /
  // publisher / review site the AI attributed to) is a CITATION, not a competitor the AI recommended,
  // so drop it from the MENTION axis. Matched by NAME against _SOURCE_NAMES — deliberately NOT by "does
  // its name match any cited domain", because a real rival whose OWN site is cited (the AI named it AND
  // linked it) must STAY a mention. A source not on the list still lands in the citation axis correctly.
  const discoveredBrandsClean = discoveredBrands.filter((d) => !_isSourceName(d.name));

  const brandEntity = entities.find((e) => e.type === "brand");
  const sentiment = brandEntity && brandEntity.count > 0 ? detectSentiment(text, brand, brandEntity.firstIndex) : null;

  return {
    promptId: response.promptId || response.prompt_id || null,
    sentiment,
    engine,
    accountId: response.accountId || response.account_id || null,
    timestamp: response.timestamp || new Date().toISOString(),
    locationContext: response.locationContext || (response.region ? { mode: "country", label: response.region } : null),
    rawPrompt: response.prompt || response.rawPrompt || "",
    rawHtml: html,
    renderedText: text,               // keep the captured text for the audit snapshot (do NOT blank on a non-answer)
    visibleAnswerText: text,
    answerStructure: _nonAnswer ? "no_answer" : detectStructure(text, html),
    // The non-answer sentinel travels via nonAnswer + answerLength:0; geoStore honours nonAnswer when
    // persisting answer_length (never falls back to the chrome char-count), so the deck reads "No answer".
    answerLength: _nonAnswer ? 0 : text.length,
    nonAnswer: _nonAnswer,
    brandMentions,
    competitorMentions,
    discoveredBrands: discoveredBrandsClean,   // brands AI named that weren't configured (cited sources removed) — surfaced as extra competitors
    // Flat, ordered list of EVERY brand/competitor actually named in this answer, plus the one the
    // AI led with. This is the real "who it named" evidence the deck's prompts table renders — the
    // renderer/API had a field for it but the parser never emitted it (so it always read empty).
    // bug #3 — the "Who it named" column read ONLY configured brands, so every prompt where the AI
    // named an OPEN rival (not in the client's competitor set) showed "none named". Merge the
    // open-discovered brands in too (configured names first for stable order, then deduped). The
    // client is never self-listed (discoverBrands excludes it) and the tightened stoplist keeps
    // generic terms out, so this surfaces the REAL rivals the AI recommended for that prompt.
    brandsMentioned: [...present.map((e) => e.name), ...discoveredBrandsClean.map((d) => d.name)]
      .filter(Boolean)
      .filter((n, i, a) => a.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i),
    leadBrand: present[0]?.name || discoveredBrandsClean[0]?.name || "",
    // CITATION TRUTH: "cited" means the BRAND'S OWN domain was an actual source in this answer —
    // NOT merely that the answer had any citation. The deck's result column must read this, never
    // citation_count>0, so it never says "Cited" when a rival's domain (not yours) was the source.
    brandCited: citations.some((c) => c.is_brand_domain),
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
