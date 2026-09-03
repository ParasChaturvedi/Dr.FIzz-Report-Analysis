// src/app/components/report/deck/DeckReport.js
// ─────────────────────────────────────────────────────────────────────────────
// THE REPLICA RENDERER, renders the report AS the 23-slide reference deck, bound
// to REAL data (data.doctorFizz + baselineMetrics + live GEO). Never prints the
// deck's hand-authored numbers; every value is a real binding or an honest
// gap-state. Honesty rules enforced here: per-engine GEO gated on real collection,
// absolute KPIs (no %-of-zero), one review target, readiness ≠ visibility.
// Fidelity pass: uses the reference's richer blocks (pillar badges, triad, topic
// grid, count-badged content map, brand wall, result cells) wired to real data.
// ─────────────────────────────────────────────────────────────────────────────
import { Cover, Slide } from "./Slide";
import {
  Row, Split, Tiles, Tile, Card, Callout, Journey, FixRow, CBar, Trend, KV,
  Checks, Tag, Pill, EngineGrid, EngineCell, PhaseCol, PhaseRow, Legend, ActionRow,
  Verdict, Method, DirGrid, DirChip, Ring, ScoreSig, PbItem, DataTable, HeroStat, ScoreBox, GapPanel,
  Pillar, TopicGrid, TopicLegend, Triad, Tc, Hypo, CLGrid, ResCell,
} from "./components";
import { DeckStyle, C, accentFor, fmtNum, pctStr, dateGB, dash, clamp } from "./tokens";
import { buildIllustrativeGeo, buildIllustrativeBenchmark } from "./illustrative";
import DeckAutoFit from "./DeckAutoFit";
import { semanticSig } from "@/lib/seo/geo/semanticSig";

// Self-contained topic-noise check (mirrors geoParser.isTopicNoise) — inlined so this CLIENT bundle
// never imports the server-side GEO parser (which pulls fs/mongodb/playwright). Drops the junk "brands"
// a pre-filter GEO worker scan stored on the SoV board: all-generic phrases (Technical SEO, Core Web
// Vitals, Google Business Profile, Digital Marketing), generic acronyms (KPIs, SMEs, GBP, ROI), and
// scraped "…Opens" UI chrome — while keeping real rivals (PageTraffic, Social Panga, Dentsu Webchutney).
const _DECK_NOISE_ACR = new Set("seo sem smm ppc roi roas ctr cta cpc cpm cro ux ui api cms crm saas faq kpi aov b2b b2c ai llm gpt serp url gmb gbp nap eeat eat sme smb".split(/\s+/));
// ARTEFACT tokens (ad-metrics + UI-button words) that can NEVER be part of a real brand name. A name
// is noise if ANY word is an artefact, so a real word glued to a metric/UI word (Mapbox Terms, Ad
// Spend, Apple Continue, Sign In Answer) is dropped while a clean agency name (Social Beat, Schbang)
// survives. Kept in sync with geoParser _ARTEFACT so the deck is never stricter than the server.
const _DECK_ARTEFACT = new Set("roas roi ctr cpc cpm cpa aov ltv cac spend spending impressions terms continue submit cancel confirm signin signup logout settings regenerate rewrite upvote downvote message smart send copilot chatgpt gemini claude perplexity aioverviews bing".split(/\s+/));
// STOPWORDS — prepositions / articles / conjunctions / pronouns that leak out of answer prose as a
// bogus one-word "brand" (e.g. AI writes "…partner with BigCommerce" and the parser emits "With").
// A name whose every word is a stopword (or generic topic word) can never be a real brand. Real
// agency names (Schbang, Webchutney, Flipkart, EchoVME) contain none of these, so this is safe.
const _DECK_STOP = new Set("a an the and or of to in on at by for with from into onto over under as is are was were be been being it its this that these those we our us you your they them their he she his her my me up out no not yes via per vs versus about above below near then than but so if while when where which who whom whose what why how also just only more less most least very".split(/\s+/));
// Conversational preambles an engine (esp. Copilot) prefaces an answer with — "Hi Sara, here are …",
// "Hello, sure!" — get scraped as a Capitalised phrase and mistaken for a named brand. A name whose
// FIRST word is one of these is a greeting, not a company. Kept tight (no "yes"/"good"/"dear") so real
// brands like "Yes Bank" survive. Mirror in geoParser so the deck is never stricter than the server.
const _DECK_GREET = new Set("hi hello hey heya hiya howdy greetings thanks thankyou welcome".split(/\s+/));
const _DECK_NOISE_GEN = new Set(`technical core web vitals google business profile digital marketing content social media strategy strategies analytics conversion optimization optimisation branding design designs development seo sem services service agency agencies company companies page pages listing listings profile profiles map maps search engine engines score scores keyword keywords overview overviews ranking rankings backlink backlinks schema robots sitemap computer computers space spaces artifact artifacts system systems solution solutions tool tools data cloud technology technologies technical software online platform platforms network networks compute computing generative experience experiences result results insight insights metric metrics report reports dashboard
model models version versions customize customise connectors connector skills skill sources source ask asked canvas prompt prompts thread threads assistant assistants question questions answer answers example examples reason reasons factor factors option options feature features benefit benefits use uses case cases level levels item items element elements aspect aspects part parts area areas field fields topic topics subject subjects step steps way ways tip tips point points thing things kind kinds type types
compare choose select find learn discover manage improve grow increase boost provide deliver offer help support explore ensure evaluate consider assess review identify
continue continues continued follow followup followed following related expand collapse next previous back forward submit cancel confirm close open apply reset clear done save saved read reading show hide view more less button link click tap here now today overview overviews summary details detail info information
large small big huge tiny major minor focus focuses focused offers offering provides providing helps helping serves serving covers covering includes including features featuring targets targeting typical typically standard custom various multiple single dedicated specialized specialised known scale scales market markets mid midmarket segment segments enterprise enterprises startup startups smb sme
best top leading better great various several many most other some new latest popular common general specific main key major minor primary secondary basic advanced simple easy modern important trusted reliable professional expert quality affordable premium comprehensive complete full total leading proven established experienced
sign in history workflow workflows bookkeeping accounting accountant accountants payroll taxation audit auditing compliance advisory finance financial
startup startups founder founders entrepreneur entrepreneurs enterprise enterprises freelancer freelancers ecommerce b2b b2c india indian usa uk chennai mumbai delhi bengaluru bangalore pune hyderabad noida gurgaon kolkata ahmedabad jaipur surat lucknow
links image images share shares copy copied download downloads export exports save saves regenerate rewrite feedback upvote downvote`.split(/\s+/).filter(Boolean));
// MENTION vs CITATION — a SOURCE the AI cites (a directory, publisher, review site, social/forum) is a
// CITATION, never a competitor brand MENTION. These names leak into the answer prose ("According to
// Search Engine Journal…", "listed on Clutch") and must be kept OFF the mention surfaces (SoV bars,
// "who it named"). Matched as a whole normalized name, so a real brand that merely contains one of
// these words is unaffected.
const _DECK_SOURCE = new Set([
  "reddit","quora","medium","linkedin","wikipedia","youtube","facebook","instagram","twitter","x","tiktok","pinterest",
  "glassdoor","indeed","clutch","designrush","goodfirms","sortlist","trustpilot","capterra","g2","g2 crowd","sitejabber",
  "ambitionbox","yelp","forbes","techcrunch","mashable","wired","the verge","verge","cnet","zdnet","venturebeat",
  "business insider","search engine journal","search engine land","the manifest","manifest","product hunt","producthunt",
  "hacker news","hackernews","hackernoon","gartner","upwork","fiverr","justdial","indiamart","tradeindia","sulekha","techtarget","crunchbase",
].map((s) => s.toLowerCase()));
// Class E (entity resolution): bare geography leaks into brands_named as fake competitors
// ("Walmart, Washington, Instacart" — Washington is a US state, not a brand). Only DISCOVERED
// single/every-word place names are dropped; configured competitors bypass this belt entirely,
// and any real brand with a distinctive non-place word ("Georgia-Pacific", "West Elm") survives.
const _DECK_NOISE_GEO = new Set("washington oregon nevada california arizona texas colorado kansas nebraska oklahoma minnesota wisconsin illinois indiana michigan ohio kentucky tennessee alabama mississippi louisiana arkansas missouri iowa georgia florida carolina virginia maryland delaware jersey pennsylvania york connecticut massachusetts vermont hampshire maine montana idaho wyoming utah dakota alaska hawaii seattle portland denver austin dallas houston chicago boston atlanta miami phoenix philadelphia detroit minneapolis columbus cleveland america american usa europe european canada canadian australia asia african north south east west".split(/\s+/).filter(Boolean));
const _deckTopicNoise = (name) => {
  const words = String(name || "").trim().split(/[\s\-–—]+/).filter(Boolean);   // split hyphens too — "Full-Service" is two generic words, not a brand
  if (!words.length) return true;
  if (words.some((w) => /['’](m|re|ve|ll|d)$/i.test(w))) return true;           // contraction fragment ("I'm", "you're", "we've") — never a brand
  if (words[0] && _DECK_GREET.has(words[0].toLowerCase().replace(/[^a-z]/g, ""))) return true;  // "Hi Sara", "Hello there" — greeting preamble, not a brand
  const _n = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (_DECK_SOURCE.has(_n) || _DECK_SOURCE.has(_n.replace(/\s+/g, ""))) return true;  // cited source/publisher/directory → not a mention
  if (words.some((w) => /^opens$/i.test(w))) return true;                          // "… Opens in a new tab" (plural only, keeps "Open Influence")
  if (words.some((w) => { const l = w.toLowerCase(); return _DECK_ARTEFACT.has(l) || _DECK_ARTEFACT.has(l.replace(/s$/, "")); })) return true; // any metric/UI artefact word → not a brand
  if (words.every((w) => { const l = w.toLowerCase(); return _DECK_NOISE_GEN.has(l) || _DECK_NOISE_GEO.has(l) || _DECK_STOP.has(l); })) return true; // every word generic/stopword/place ("With", "In", "Washington", "North Carolina") → not a brand
  const _a = words[0] ? words[0].toLowerCase() : "";                                // KPIs, SMEs, ROAS — check raw AND plural-stripped
  if (words.length === 1 && (_DECK_NOISE_ACR.has(_a) || _DECK_NOISE_ACR.has(_a.replace(/s$/, "")))) return true;
  return false;
};

// item 12a — the fabricated placeholder clientele wall was removed. The closing slide now shows REAL
// competitor brands from the analysis (business + API competitors + AI-named GEO brands); see slide 25.

/* ── small data helpers ────────────────────────────────────────────────── */
const mv = (bm, key, legacy) => {
  const o = bm?.[key];
  const v = o && typeof o === "object" ? o.value : o;
  return v != null ? v : (legacy != null ? bm?.[legacy] : null);
};
const para = (arr, i = 0) => (Array.isArray(arr) ? arr[i] : (i === 0 ? arr : null));
const paras = (arr, n = 3) => (Array.isArray(arr) ? arr.slice(0, n) : arr ? [arr] : []);
const titleCase = (s) => String(s || "").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
// B13 — prefer a real, correctly-cased business name (user-supplied, then the GMB profile title)
// before falling back to a title-cased domain slug; the slug fallback keeps known acronym tokens
// (cca, llp, plc, cpa, aca, acca) UPPER-CASE so "acenteus-cca" renders "Acenteus CCA", not "Acenteus Cca".
const _NAME_ACR = new Set("cca llp llc plc ltd cpa aca acca cima ceo cfo cto uk usa uae".split(/\s+/));
const _slugName = (domain) => String(domain || "").replace(/\.(com|co\.uk|io|net|org|in|us)$/i, "").split(".")[0]
  .replace(/[-_.]/g, " ").trim().split(/\s+/).filter(Boolean)
  .map((w) => (_NAME_ACR.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(" ");
const prettyName = (d, domain) => d?.businessData?.businessName || d?.businessData?.name || d?.gmbCheck?.name || _slugName(domain);
const lcpSeconds = (ms) => (ms == null ? null : `${(Number(ms) / 1000).toFixed(1)}s`);
const lc = (s) => String(s || "").toLowerCase();
// Geo qualifier suffix for a page card pill (" · Local" / " · UK"), broadened beyond the literal "Local".
const geoQual = (p) => { const g = lc(p?.geography_relevance || p?.geo_scope || ""); if (!g || /not|none|national/.test(g)) return ""; return /uk|country|nation/.test(g) ? " · UK" : " · Local"; };
const verdict = (good, warn) => (good ? { v: "Strong", t: "good" } : warn ? { v: "Needs work", t: "warn" } : { v: "Critical", t: "bad" });
// Render a deck-voice callout, bolding a leading "Label:" lead-in (e.g. "The move:") like the reference.
const leadBold = (s) => { const t = String(s || ""); const m = t.match(/^([^:]{2,40}:)\s*([\s\S]*)$/); return m ? <><b>{m[1]}</b> {m[2]}</> : t; };
const refOf = (name) => `DF-${String(name || "CLIENT").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase()}-SEOGEO-01`;
// work-type colour for plan dots
const workColor = (s) => { const k = lc(s); if (/load|speed|h1|meta|schema|title|alt|crawl|redirect|link\b/.test(k)) return "#3C7D5A"; if (/publish|content|blog|page|faq/.test(k)) return C.rust; if (/form|lead|cta|calculator/.test(k)) return "#3B6FB2"; if (/citation|directory|backlink|press|gbp|review/.test(k)) return "#1A8A8A"; return C.rust; };
// Owner/desk for an action (reviewer #10 — a clear owner per workstream), from its work type.
const ownerFor = (s) => { const k = lc(s); if (/load|speed|h1|meta|schema|title|alt|crawl|redirect|link|canonical|index|robots|cwv|lcp/.test(k)) return "Dev / Tech SEO"; if (/publish|content|blog|guide|faq|write|article/.test(k)) return "Content"; if (/page|landing|optimise|on.?page/.test(k)) return "SEO / On-Page"; if (/form|lead|cta|calculator|convert/.test(k)) return "Growth / CRO"; if (/citation|directory|backlink|press|pr|outreach|listicle|link/.test(k)) return "Outreach / PR"; if (/gbp|review|local|map/.test(k)) return "Local / Ops"; return "SEO"; };
// Which query cluster a competitor threatens (reviewer #7 — prioritisation, not just a list).
const battlegroundFor = (c, isLocal) => {
  const t = lc((c?.description || "") + " " + (c?.door || c?.opening || "") + " " + (c?.name || ""));
  if (isLocal || /local|city|near|brighton|chennai|region/.test(t)) return "Local + brand terms";
  if (/blog|guide|informational|how|reels|hashtag|content/.test(t)) return "Informational / top-of-funnel";
  if (/authority|category|broad|generic|national/.test(t)) return "Broad commercial head terms";
  return "Core commercial terms";
};

function projectOutcome(bm, v2) {
  const traffic0 = mv(bm, "organic_traffic", "organicTraffic");
  const dr0 = mv(bm, "domain_rating", "domainRating");
  const up6 = v2?.opportunity_summary?.estimated_traffic_uplift_6m ?? null;
  const up12 = v2?.opportunity_summary?.estimated_traffic_uplift_12m ?? null;
  const t0 = traffic0 == null ? 0 : Number(traffic0);
  // O1 — the milestones are the CUMULATIVE total (today's baseline + the modelled new-page capture), so
  // the series CLIMBS from today. Returning the bare incremental made Day 90 sit BELOW the total baseline
  // and read as a first-quarter decline. Same cumulative series feeds slides 04, 25 and 26.
  const t6 = up6 != null ? Math.round(t0 + Number(up6)) : null;
  const t12 = up12 != null ? Math.round(t0 + Number(up12)) : null;
  const t3 = up6 != null ? Math.round(t0 + Number(up6) / 2) : null;
  const drBase = dr0 == null ? null : Number(dr0);
  // Class A (impossible target): the DR projection must NEVER fall below the current DR. The min(60,..)
  // cap is meant to keep LOW-DR sites realistic, but for a site already above 60 it dragged the target
  // DOWN (a DR-95 site "rising" to 60). Clamp with max(current, ...) so it can only hold or improve.
  const drAt = (add) => (drBase == null ? null : Math.max(drBase, Math.min(60, drBase + add)));
  return { t0, t3, t6, t12, dr0: drBase, dr3: drAt(3), dr6: drAt(5), dr12: drAt(15) };
}

/* ── the deck ───────────────────────────────────────────────────────────── */
export default function DeckReport({ data, live }) {
  const d = data || {};
  const df = d.doctorFizz || {};
  // Prefer the CANONICAL Stage-3 structured payload (doctorFizz.*) — it carries the FULL
  // metric set ({value,label} objects incl. referring_domains / perf / site-health / GBP),
  // the validated content architecture, etc. The top-level aiSections fields are partial
  // mirrors and often miss metrics, so they're only the fallback.
  const bm = df.baseline || d.baselineMetrics || {};
  const story = df.story || {};
  const ds = d.deckStory || {}; // Claude-written narrative in the reference-deck voice (real data)
  const v2 = df.v2_additions || {};
  const cl = d.competitorLandscape || {};
  const _caDF = df.content_architecture || {};
  const _caAI = d.contentArchitecture || {};
  const _pick = (k) => (_caDF[k]?.length ? _caDF[k] : (_caAI[k]?.length ? _caAI[k] : (_caDF[k] || _caAI[k])));
  const ca = {
    ..._caAI, ..._caDF,
    commercial_pages: _pick("commercial_pages"),
    geography_pages: _pick("geography_pages") || _pick("city_pages"),
    city_pages: _pick("city_pages"),
    blog_and_guides: _pick("blog_and_guides"),
    checklist: _caDF.checklist?.length ? _caDF.checklist : _caAI.checklist,
    pagesExistingFlagged: _caDF.pagesExistingFlagged ?? _caAI.pagesExistingFlagged,
    pagesToOptimise: (_caAI.pagesToOptimise?.length ? _caAI.pagesToOptimise : _caDF.pagesToOptimise) || [],
    blogsToOptimise: (_caAI.blogsToOptimise?.length ? _caAI.blogsToOptimise : _caDF.blogsToOptimise) || [],
    // Crawl-filtered CREATE sets (route.js: pages that do NOT already exist). The deck must read
    // these — not raw commercial_pages — so an existing page never appears in both create+optimise.
    pagesToBuild: (_caAI.pagesToBuild?.length ? _caAI.pagesToBuild : _caDF.pagesToBuild) || null,
    blogsToBuild: (_caAI.blogsToBuild?.length ? _caAI.blogsToBuild : _caDF.blogsToBuild) || null,
    listicle_outreach: (_caAI.listicle_outreach?.length ? _caAI.listicle_outreach : _caDF.listicle_outreach) || [],
  };
  // P1 — a standalone page needs real demand: a dedicated page for "social media agency la" (30/mo, and
  // "la"=LA is off-region for an India-focused site) is too thin to justify. Require ≥ 40 searches/mo;
  // thinner terms fold into the broader service page rather than shipping their own page. "social media
  // agency la" actually rides in commercial_pages (not geography), which the first pass missed — apply the
  // same floor there, but NEVER empty the tier: if the floor would remove every commercial page, keep the
  // three highest-volume so the Tier-1 card + "commercial pages mapped" tile still render.
  const _cityOk = (p) => (Number(p.primary_volume) || 0) >= 40;
  ca.geography_pages = (ca.geography_pages || []).filter(_cityOk);
  ca.city_pages = (ca.city_pages || []).filter(_cityOk);
  if (Array.isArray(ca.commercial_pages) && ca.commercial_pages.length) {
    const _keptComm = ca.commercial_pages.filter(_cityOk);
    ca.commercial_pages = _keptComm.length ? _keptComm
      : ca.commercial_pages.slice().sort((a, b) => (Number(b.primary_volume) || 0) - (Number(a.primary_volume) || 0)).slice(0, 3);
  }
  // Prefer the RICH Stage-3 technical_issues (why_it_matters / affected_count /
  // recommended_action / estimated_effort / expected_unlock); the top-level
  // technicalPriorities ({issue,priority,action}) is the partial fallback.
  const tp = (Array.isArray(df.technical_issues) && df.technical_issues.length)
    ? df.technical_issues
    : (Array.isArray(d.technicalPriorities) ? d.technicalPriorities : []);
  // Independent live-audit verdict (teacher check). Present only when the technical
  // evaluator ran; when absent the technical slide is byte-identical to before.
  const te = df.technical_evaluation || null;
  const lb = d.linkBuilding || {};
  const gbp = df.gbp_comparison || {};
  const gmb = d.gmbCheck || {};
  // A1 — ONE GBP completeness number across slide 05 (audit) and slide 21 (dial): the visible checklist's
  // pass-fraction (reproducible — count the ticks), falling back to the provider completeness only when no
  // field rows exist. Used everywhere so the same metric never shows two numbers (was 77% vs 75%).
  const _gbpFieldsShared = (gbp.field_analysis || gmb.completeness?.breakdown || []).slice(0, 8);
  const _gbpPassShared = _gbpFieldsShared.filter((f) => !(f.client_status === "missing" || f.pass === false)).length;
  const _gbpComplete = _gbpFieldsShared.length ? Math.round((_gbpPassShared / _gbpFieldsShared.length) * 100) : (mv(bm, "gbp_completeness", "gmbCompletenessScore") ?? null);
  const rm = Array.isArray(d.roadmap) ? d.roadmap : [];
  const air = df.ai_readiness || {};
  const sv = df.site_validation || null;   // Stage-1 Website Validation summary (SSL/redirect/canonical/reachable)
  // FAQ block count from the readiness signals (for the diagnosis "schema in place" line).
  const faqCount = (() => { const s = (air.signals || []).find((x) => /faq/i.test(x.key || x.label || "")); const m = s ? String(s.detail || s.label || "").match(/\d+/) : null; return m ? m[0] : null; })();
  // KPI rows: prefer the canonical Stage-3 kpis.metrics ({key,baseline,target_6/12_months});
  // the top-level measuringSuccessRows is a {metric,now,s6,s12} mirror used only as fallback.
  const ksRows = (Array.isArray(df.kpis?.metrics) && df.kpis.metrics.length)
    ? df.kpis.metrics
    : (Array.isArray(d.measuringSuccessRows) ? d.measuringSuccessRows : []);
  const sp = Array.isArray(d.strategicPriorities) ? d.strategicPriorities : [];

  const domain = d.domain || "yourdomain.com";
  const name = prettyName(d, domain);
  const measured = !!(live && live.measured);
  const opp = v2.opportunity_summary || {};
  const proj = projectOutcome(bm, v2);

  // Competitor set (drives the benchmark + competitor-relative GEO). De-duped:
  // a rival can appear in BOTH localCompetitors and nationalPlatforms (e.g. Outbooks).
  const comps = (() => {
    const seen = new Set();
    return [...(cl.localCompetitors || []), ...(cl.nationalPlatforms || [])].filter((c) => {
      const k = lc(c?.name || c?.domain || "").replace(/\s+(ltd|limited|global|services|svcs|inc|llp)\b/g, "").trim();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })();
  // CB1 / X1 — ONE canonical competitor registry. The GEO scan stores lowercased brand tokens
  // ("webchutney", "iprospect", "thesocialstreet"); the SEO module has the display names ("Dentsu
  // Webchutney", "iProspect", "The Social Street"). Map a GEO token back to the configured display name (by
  // full-name key, domain stem, OR last word) so both modules read ONE label. Hoisted here so the SoV chart
  // (11), the intro callout (09) and the mentions table (13A) all use it. Unmatched discovered brands
  // (pagetraffic, Schbang) pass through unchanged.
  const [_canonName, _canonTracked] = (() => {
    const map = new Map();
    const key = (k) => lc(String(k || "")).replace(/[^a-z0-9]/g, "");
    const put = (k, v) => { const kk = key(k); if (kk && !map.has(kk)) map.set(kk, v); };
    for (const c of (comps || [])) {
      const disp = String(c?.name || c?.domain || "").trim(); if (!disp) continue;
      put(disp, disp);
      if (c?.domain) put(String(c.domain).replace(/^www\./, "").split(".")[0], disp);
      const w = disp.split(/\s+/); if (w.length > 1) put(w[w.length - 1], disp);   // "Dentsu Webchutney" → "webchutney"
    }
    return [(nm) => map.get(key(nm)) || nm, (nm) => map.has(key(nm))];   // canonical display name; is-a-registered-competitor
  })();

  // GEO: REAL when a scan finished, else LABELED-ILLUSTRATIVE (same shape, tagged in UI).
  const primaryService = titleCase(_caDF.commercial_pages?.[0]?.keyword_cluster || d.businessData?.category || d.businessData?.offeringType || "").toLowerCase() || "";
  const ILLUS = buildIllustrativeGeo({ name, competitors: comps, topics: primaryService ? [primaryService] : [] });
  let geo = measured ? live : ILLUS;            // unified source for every GEO slide
  const isIllus = !measured;                     // → show the "Illustrative" tag
  const IllusTag = isIllus ? <Hypo>Illustrative</Hypo> : null;
  const enginesStatus = (geo && geo.engines_status) || [];
  const enginePanel = enginesStatus.map((e) => ({ name: e.name || e.engine, ready: e.status === "ready" }));
  // Real Google AI-Overview measurement (DataForSEO) — present even when the full multi-engine scan hasn't run.
  const aio = df.geo_aio_visibility || {};
  // Surface the real AIO slice ONLY when the full multi-engine scan hasn't run; a completed
  // live scan (measured) already provides richer real data for every engine.
  const aioMeasured = !measured && aio.available !== false && (aio.keywords_checked != null);
  // Real measured share-of-voice rows from the AIO scan (brand + competitors + "Other sources" residual).
  const aioSovRows = (aio.share_of_voice || []).map((s) => ({ brand: s.label, pct: s.share_pct, is_client: s.kind === "brand", is_other: s.kind === "other" }));
  const aioCompetitors = aioSovRows.filter((s) => !s.is_client && !s.is_other);
  const aioCompStr = aioCompetitors.slice(0, 2).map((c) => `${c.brand} (${c.pct}%)`).join(" and ");
  // item 9 — in the AIO-only state, also list configured competitors Google did NOT cite, at 0%,
  // so every rival gets its own row (not silently dropped for lack of a citation).
  const _aioCompNames = new Set(aioCompetitors.map((c) => lc(c.brand).trim()));
  const aioCompetitorsFull = [
    ...aioCompetitors,
    ...comps.filter((c) => { const nm = lc(c?.name || c?.domain || "").trim(); return nm && !_aioCompNames.has(nm); })
            .map((c) => ({ brand: String(c?.name || c?.domain || "").trim(), pct: 0, is_client: false })),
  ];
  // Consistency (reviewer #1): the headline GEO metrics MUST agree with the real AIO
  // signal. If the brand is cited 0× in AI Overviews and no full multi-engine scan ran,
  // a non-zero share of voice / mention rate is not credible — that contradiction ("0 AI
  // answers name you" vs "3% share of voice") is exactly what the reviewer flagged. When
  // the measured AIO presence is zero, present the client consistently at 0 across every
  // GEO metric and engine (that IS the finding: invisible in AI answers); competitors keep
  // their share. Otherwise derive the client's overall from the measured AIO values.
  if (aioMeasured) {
    const clientAioSov = Number(aioSovRows.find((s) => s.is_client)?.pct ?? 0);
    const aioCite = Number((((aio.brand_cited_count || 0) / Math.max(1, aio.total_citations || 1)) * 100).toFixed(1));
    // In the AIO-only state we measured ONLY Google AI Overviews (citations) — we have NO
    // real PER-ENGINE share of voice / mention / citation for ChatGPT, Gemini, Perplexity,
    // Claude or Copilot. So the client's per-engine values are ALWAYS zeroed here (never
    // illustrative positives) — a fabricated 3-6% beside a measured 0% is exactly the
    // contradiction the reviewer flagged (#1). Mention rate is likewise not measured, so it
    // reads 0 as an honest floor; only SoV and citation rate carry real Google-AIO values.
    geo = {
      ...geo,
      overall: { ...(geo.overall || {}), sov: clientAioSov, mention_rate: 0, citation_rate: aioCite },
      by_engine: (geo.by_engine || []).map((e) => ({ ...e, metrics: { ...(e.metrics || {}), sov: 0, mention_rate: 0, citation_rate: 0 }, sov: 0, mention_rate: 0, citation_rate: 0 })),
      share_of_voice: (geo.share_of_voice || []).map((b) => (b.is_client ? { ...b, avg: 0 } : b)),
    };
  }
  // "Engines naming you" = engines where the brand is actually mentioned (computed AFTER
  // the AIO-consistency override, so a zeroed client correctly reads 0/6).
  const enginesTested = geo.overall?.engines_tested ?? (geo.by_engine || []).length ?? 4;  // item 7 — 4 canonical engines, never a stale 6
  const enginesNaming = (geo.by_engine || []).filter((e) => Number(e.metrics?.mention_rate ?? e.mention_rate ?? e.metrics?.sov ?? e.sov ?? 0) > 0).length;
  // A "Measured · Google AI Overview" chip — the positive counterpart to the Illustrative tag.
  const MeasTag = aioMeasured ? <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#3C7D5A", background: "rgba(60,125,90,.14)", padding: "2px 8px", borderRadius: 5, marginLeft: 6, whiteSpace: "nowrap" }}>Measured · Google AIO</span> : null;
  // Qualitative GEO verdict word, real when AIO data exists (brand cited in 0 answers → "No").
  const geoVerdictWord = aioMeasured
    ? (aio.brand_cited ? "Barely" : "No")
    : (Number(geo.overall?.mention_rate) >= 30 ? "Yes" : Number(geo.overall?.mention_rate) >= 10 ? "Barely" : "No");

  // GEO leader (top non-client brand), for mention/citation descriptors + verdict.
  // share_of_voice shape differs by source: the illustrative bundle is an ARRAY of brand
  // rows, but the REAL measured /geo/report returns an OBJECT { engines, by_brand:[…] }.
  // Normalise to an array so downstream .slice/[...spread]/.filter never crash (this dict
  // shape was the client-side exception on measured reports).
  const _sovRaw = geo && geo.share_of_voice;
  const _sovAll = Array.isArray(_sovRaw) ? _sovRaw : (Array.isArray(_sovRaw?.by_brand) ? _sovRaw.by_brand : []);
  // §5 RENDER-TIME BELT — the SoV board is SCORED BY THE GEO WORKER and STORED in the bundle, so a scan
  // run before the topic-noise filter existed still carries junk "brands" (Technical SEO, Core Web Vitals,
  // KPIs, SMEs, "…Opens", "Google Business Profile"). Drop them here so EVERY render is clean — the chart,
  // the closing wall, and the "X leads share of voice" line all read this — then re-normalize the real
  // brands' shares so a rival that was sitting behind 47% of noise shows its true, larger slice.
  const _sovCfgNames = new Set((comps || []).map((c) => lc(c?.name || c?.domain || "").trim()).filter(Boolean));
  const sov = (() => {
    // Keep the client + every CONFIGURED competitor (even an all-generic name like "Digital Web Solutions"),
    // drop only genuine topic/UI noise from the AI-discovered brands.
    const kept = _sovAll.filter((b) => b && (b.is_client || _sovCfgNames.has(lc(b.brand).trim()) || !_deckTopicNoise(b.brand))).map((b) => ({ ...b }));
    const nonClient = kept.filter((b) => !b.is_client);
    const clientAvg = Number(kept.find((b) => b.is_client)?.avg) || 0;
    const sum = nonClient.reduce((s, b) => s + (Number(b.avg) || 0), 0);
    // Re-normalise the rivals into the room LEFT BY the client (100 − client%), not to a full 100 —
    // else the bars sum to >100 (client 8% + rivals 100% = 108%). Client bar stays = the title %.
    const room = Math.max(0, 100 - clientAvg);
    if (sum > 0) for (const b of nonClient) b.avg = Math.round((Number(b.avg) / sum) * room * 10) / 10;
    return kept.sort((a, b) => (Number(b.avg) || 0) - (Number(a.avg) || 0));
  })();
  const leader = [...sov].filter((b) => !b.is_client).sort((a, b) => (b.avg || 0) - (a.avg || 0))[0] || null;
  // G1 — name the top brands actually heard, not just one, so the callout shows the real field.
  const _topHeard = [...sov].filter((b) => !b.is_client && (b.avg || 0) > 0).sort((a, b) => (b.avg || 0) - (a.avg || 0)).slice(0, 3).map((b) => _canonName(b.brand)).filter(Boolean);
  const _heardList = _topHeard.length > 1 ? `${_topHeard.slice(0, -1).join(", ")} and ${_topHeard[_topHeard.length - 1]}` : (_topHeard[0] || "");

  // ── Canonical 5-engine framing. The by-platform panels always list all canonical engines:
  // the ones that actually ran carry REAL values; the rest render dimmed as "not yet scanned",
  // so the GEO section is never sparse/1-bar. (Copilot stays out, still hard-blocked.) ──
  const ENG_NAME = { aioverviews: "Google AI Overviews", "google ai overviews": "Google AI Overviews", chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity", claude: "Claude", copilot: "Microsoft Copilot", "microsoft copilot": "Microsoft Copilot" };
  const engName = (e) => ENG_NAME[String(e || "").toLowerCase()] || e || "N/A";
  // ChatGPT is scanned logged-out via the Browserless stealth path. Copilot is back in the canonical
  // set (6-engine Bing+Copilot methodology). This is only the illustrative/fallback list — actual
  // reports render whatever engines returned data (geo.by_engine), so a 5-engine scan still shows 5.
  // Keep this list in sync with GEO_ENGINES.
  const CANON_ENGINES = [
    { key: "aioverviews", name: "Google AI Overviews" }, { key: "claude", name: "Claude" },
    { key: "gemini", name: "Gemini" }, { key: "perplexity", name: "Perplexity" },
    { key: "chatgpt", name: "ChatGPT" }, { key: "copilot", name: "Copilot" },
  ];
  const ENGINES_TOTAL = CANON_ENGINES.length;
  const _engIdx = {};
  for (const e of (geo.by_engine || [])) _engIdx[String(e.engine || "").toLowerCase().replace(/[^a-z]/g, "")] = e;
  const engineRows = (metricKey) => CANON_ENGINES.map((ce) => {
    const e = _engIdx[ce.key] || _engIdx[ce.name.toLowerCase().replace(/[^a-z]/g, "")] || null;
    return { engine: ce.name, value: e ? Number(e.metrics?.[metricKey] ?? e[metricKey] ?? 0) : 0, scanned: !!e };
  }).sort((a, b) => (Number(b.scanned) - Number(a.scanned)) || (b.value - a.value));
  const enginesRun = (geo.by_engine || []).length || (aioMeasured ? 1 : 0);
  // Source-provenance: the real evidence base behind every GEO number — how many distinct
  // buyer prompts we ran across how many engines. Renders as a small badge on the GEO slides.
  const _geoPromptCount = new Set((geo.prompts_executed || []).map((p) => p.prompt || p.prompt_text || p.id).filter(Boolean)).size
    || Number(live.mentions_summary?.total_prompts) || Number(live.prompts_run) || 0;
  // scan-size honesty (item 12) — the REAL number of unique prompts run, falling back to the run's
  // stored count when the executed array isn't in the bundle, so no slide promises "25 to 100".
  const promptsRun = _geoPromptCount || Number(geo.run?.prompt_count) || 0;
  // RC3 — reconcile "N prompts × M engines" with the tables (which sample one engine per prompt) by
  // stating the REAL number of AI answers collected. Do NOT compute prompts×engines — a partial run
  // (an engine's session expired / timed out) leaves holes, so the true count is the executed-rows
  // length (one row per prompt-engine answer) / the run's completed_count, not the full grid.
  const answersRun = (geo.prompts_executed || []).length || Number(geo.run?.completed_count) || (promptsRun && enginesRun ? promptsRun * enginesRun : 0);
  const geoProvenance = (measured && promptsRun && enginesRun)
    ? `${answersRun} answers · ${promptsRun} prompts · ${enginesRun} engine${enginesRun > 1 ? "s" : ""}`
    : (aioMeasured && aio.keywords_checked ? `${aio.keywords_checked} buyer queries × Google AI Overviews` : null);
  // GS1 — recompute the GEO score with readiness signals GATED to real visibility. Hoisted here (was in the
  // slide-10 block) so the outcome slide (04), the GEO-score slide (10) AND the scoreboard (25) read ONE gated
  // value, not the inflated raw geo_score. "Cross-engine consistency 100%" while named in 0% of answers is
  // consistency of ABSENCE, and content freshness can't lift a brand never cited; when there is NO visibility
  // base (0% cited AND 0% named) we EXCLUDE consistency + freshness so the composite reads the real ~0, not 15.
  // Weights mirror model/constants.js GEO_SCORE_WEIGHTS.
  const _geoSig = geo.overall?.signals || geo.score_breakdown?.signals || {};
  const _geoVal = {
    citation_presence: _geoSig.citation_presence ?? geo.overall?.citation_rate,
    brand_presence: _geoSig.brand_presence ?? geo.overall?.mention_rate,
    citation_position: _geoSig.citation_position,
    intent_match: _geoSig.intent_match ?? geo.overall?.mention_rate,
    cross_engine_consistency: _geoSig.cross_engine_consistency,
    freshness: _geoSig.freshness,
    topic_coverage: _geoSig.topic_coverage ?? geo.overall?.topic_coverage ?? (geo.topic_dominance?.total_topics ? geo.topic_dominance.client_lead_share : null),
  };
  const _GEO_W = { citation_presence: 30, brand_presence: 20, citation_position: 15, intent_match: 15, cross_engine_consistency: 10, freshness: 5, topic_coverage: 5 };
  const _geoReadinessKeys = new Set(["cross_engine_consistency", "freshness"]);
  const _geoPresence = Math.max(Number(_geoVal.citation_presence) || 0, Number(_geoVal.brand_presence) || 0);
  const _geoGated = _geoPresence <= 0;   // no visibility → gate the readiness signals out of the score
  const _geoScoreGated = (() => {
    let n = 0, d = 0;
    for (const k in _GEO_W) { let v = _geoVal[k]; if (_geoGated && _geoReadinessKeys.has(k)) v = null; if (v == null) continue; n += Number(v) * _GEO_W[k]; d += _GEO_W[k]; }
    return d ? Math.round(n / d) : (Number(geo.overall?.geo_score) || 0);
  })();
  const _geoScore = (measured && (promptsRun || answersRun)) ? _geoScoreGated : (geo.overall?.geo_score ?? null);
  const ProvTag = geoProvenance ? <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: C.faint, marginLeft: 8, whiteSpace: "nowrap" }}>Source: {geoProvenance}</span> : null;
  // Real cited domains (who AI quotes instead of you) — the honest "who owns the answer
  // space" for a client with no measured Share of Voice. From the measured citation analysis.
  // item 8 — "who AI cites instead of you" domains. Measured /geo/report exposes them under
  // citation_analysis.top_source_domains; the Google-AIO bundle (geo_aio_visibility) exposes them
  // under top_cited_domains; the illustrative bundle also carries citation_analysis.top_source_domains.
  // Read all three so the fallback never silently shows nothing. Entry shape is { domain, count }.
  const citedDomains = ((geo.citation_analysis || {}).top_source_domains
    || aio.top_cited_domains
    || (aio.citation_analysis || {}).top_source_domains
    || []).filter((d) => d && d.domain);

  // Competitor benchmark rows: real per-competitor metrics if present, else illustrative.
  const benchRows = comps.some((c) => c && (c.dr != null || c.traffic != null)) ? comps : buildIllustrativeBenchmark(comps);
  const benchIllus = !comps.some((c) => c && (c.dr != null || c.traffic != null));

  let _pg = 1;
  const pg = () => String(++_pg).padStart(2, "0");
  // S27 — carry the data-as-of stamp in EVERY page footer (not just the cover), so any single slide is
  // self-dating. Kept compact (domain · date) so the centered footer never overflows.
  // Date stamps are REAL-TIME (the current date at view), NOT the cached generatedAt — a report opened
  // today always reads today, never a stale cached generation date (Paras: date must be realtime). The
  // deck renders client-side (DeckReportLive is ssr:false), so new Date() is the viewer's current date.
  const _asOf = dateGB(new Date().toISOString());
  const foot = (left) => ({ left, mid: _asOf ? `${domain} · ${_asOf}` : domain, pg: pg() });

  const traffic0 = mv(bm, "organic_traffic", "organicTraffic");
  const dr = mv(bm, "domain_rating", "domainRating");
  const rd = mv(bm, "referring_domains", "referringDomains");
  const kw0 = mv(bm, "organic_keywords", "organicKeywords");   // client's real ranking-keyword count (Moz/DataForSEO)
  const rating = mv(bm, "gbp_rating");
  const reviews = mv(bm, "gbp_review_count");
  const lcpMs = mv(bm, "lcp");
  const health = mv(bm, "site_health_score", "crawlHealthScore") ?? d.websiteCrawl?.healthScore;

  const slides = [];

  /* 1 · COVER */
  slides.push(
    <Cover key="cover" eyebrow="SEO & GEO Growth Strategy"
      title={name.includes(" ") ? <>{name.split(" ")[0]}<br />{name.split(" ").slice(1).join(" ")}</> : name}
      lede={ds.cover_lede || `A data-led plan to make ${name} visible where buyers search. Across Google, and across the new AI answer engines.`}
      meta={[
        { k: "PREPARED FOR", v: domain }, { k: "DATE", v: _asOf },
        // Data-provenance note (near the top): states what really backs the report — a completed
        // multi-engine GEO scan (prompts × engines) vs a pending scan — so no figure is mistaken
        // for measured when it is not. SEO figures are always measured (Moz / DataForSEO crawl).
        { k: "DATA", v: measured ? (() => { const _att = (promptsRun && enginesRun) ? promptsRun * enginesRun : answersRun; const _miss = Math.max(0, _att - answersRun); return `SEO measured · GEO scan: ${promptsRun}×${enginesRun} = ${_att} attempted · ${answersRun} captured${_miss > 0 ? ` · ${_miss} blocked/empty` : ""} (rates over captured)`; })() : (aioMeasured ? "SEO measured · GEO: Google AI Overviews measured" : "SEO measured · GEO scan pending") },
        { k: "PREPARED BY", v: "DOCTOR FIZZ" }, { k: "REF", v: refOf(name) },
      ]} />
  );

  /* 2 · CONTENTS, 8 discipline groups, real slide numbers, colored dots */
  // 6 GEO slides (09-14) always render, so always list all 6 here.
  // item 13 — keep in sync with the actual GEO slide order (geo-method moved up to n10, before
  // the 0% number slides): verdict 09 → method 10 → SoV 11 → mentions 12 → prompts 13 → AEO 14.
  const geoToc = [["09", "Are you visible when buyers ask AI?"], ["10", "How the GEO score works"], ["11", "Share of voice vs competitors"], ["12", "Mention & citation rates"], ["13", "The prompts we ran, and results"], ["14", "Topic & entity association"]];
  const toc = [
    { g: "Orientation", c: "#15110E", items: [["01", "The story: where you stand"], ["02", "The outcome this plan delivers"], ["03", "The audit map: five pillars"]] },
    { g: "Technical SEO", c: "#3B6FB2", items: [["04", "Three things keeping you out"], ["05", "Fix the foundation first"]] },
    { g: "On-Page SEO", c: "#3C7D5A", items: [["06", "The competitor benchmark"], ["07", "Where competitors are exposed"], ["08", "Keyword strategy by intent"], ["15", "Pages to build"], ["16", "Pages and blogs: optimise vs create"]] },
    { g: "GEO & AEO · AI Visibility", c: "#C95322", items: geoToc },
    { g: "Local SEO & GBP", c: "#1A8A8A", items: [["17", "Your fastest path into local results"]] },
    { g: "Off-Page & Authority", c: "#A07414", items: [["18", "Citations and backlinks to build"]] },
    { g: "The Plan", c: "#15110E", items: [["19", "Every move, by work type"], ["20", "The 30/60/90/180 day plan"]] },
    { g: "Proof & Next Steps", c: "#15110E", items: [["21", "How we report success"], ["22", "The three priorities"], ["23", "Clientele and next steps"]] },
  ];
  slides.push(
    <Slide key="toc" variant="cream" n={null} kicker="Contents" title="What this audit covers" contentTop
      sub="Grouped by the five SEO and GEO disciplines, so you can jump to any pillar." foot={foot("CONTENTS")}>
      <Row cols={2} style={{ gap: "10px 48px" }}>
        {toc.map((s, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <h3 className="mini" style={{ color: s.c, display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: s.c, display: "inline-block" }} />{s.g}</h3>
            {s.items.map(([num, t], j) => (
              <div key={j} style={{ display: "flex", gap: 12, fontSize: 12, padding: "4px 0", color: C.inkSoft }}>
                <span style={{ fontFamily: "var(--mono)", color: C.muted, width: 22, flex: "0 0 auto" }}>{num}</span>{t}
              </div>
            ))}
          </div>
        ))}
      </Row>
    </Slide>
  );

  /* 3 · THE STORY */
  const invisible = !traffic0 || Number(traffic0) < 50;
  slides.push(
    <Slide key="story" variant="cream" n="01" kicker="The Story"
      title={ds.story_title_a
        ? <>{ds.story_title_a}<br /><span className="hl">{ds.story_title_b}</span></>
        : <>{name} is {invisible ? "invisible" : "underperforming"} today.<br /><span className="hl">That is the opportunity.</span></>}
      foot={foot("THE STORY")}>
      <Split bias>
        <div className="body-copy">
          {(Array.isArray(ds.story_paragraphs) && ds.story_paragraphs.filter(Boolean).length
            ? ds.story_paragraphs.filter(Boolean).slice(0, 3)
            : paras(story.the_situation, 1).concat(paras(story.whats_blocking_growth, 1), paras(story.the_opportunity, 1)).filter(Boolean).slice(0, 3)
          ).map((p, i) => <p key={i}>{clamp(p, 320)}</p>)}
        </div>
        <Tiles cols={2}>
          <Tile flag n={fmtNum(traffic0 ?? 0)} label="Organic visits / month" />
          <Tile flag n={measured ? fmtNum(live.mentions_summary?.prompts_with_brand ?? 0) : fmtNum(aio.brand_cited_count ?? (aio.brand_cited ? 1 : 0))} label="AI answers naming you" />
          <Tile n={opp.total_monthly_search_volume ? fmtNum(opp.total_monthly_search_volume) : "N/A"} label="Searches up for grabs" />
          {/* RC1 — a null GBP rating can never headline a comparative claim ("beats most rivals").
              Show the star rating only when measured; otherwise show the honest local starting line. */}
          {rating != null
            ? <Tile n={`${rating}★`} label="Higher rating, fewer reviews" />
            : <Tile n={reviews != null ? fmtNum(reviews) : "0"} label="Google reviews today" />}
        </Tiles>
      </Split>
      <Callout className="mt2">{ds.story_thesis ? leadBold(ds.story_thesis) : <><b>The thesis:</b> the broad terms are taken. The high-intent, local, and AI-answer corners are not. {name} can own them, and this deck is the order to do it.</>}</Callout>
    </Slide>
  );

  /* 4 · THE OUTCOME */
  slides.push(
    <Slide key="outcome" n="02" kicker="The Outcome" title="Where this plan takes you"
      sub={ds.outcome_sub || "Rounded estimates, modelled from the keyword opportunity and competitor benchmarks. They assume the plan is implemented."}
      foot={foot("THE OUTCOME")}>
      {/* (16 + 17) Projections are shown as a ROUNDED RANGE (clean numbers ending in 0/5) and each
          future figure is explicitly marked "modelled" right next to it — not just in the footnote —
          so no reader mistakes an assumption-based estimate for a measured number. */}
      <Journey stages={(() => {
        const _rc = (n) => { if (n == null) return null; const step = n >= 5000 ? 1000 : n >= 2000 ? 500 : n >= 500 ? 50 : n >= 100 ? 10 : 5; return Math.round(n / step) * step; };
        const _rng = (n) => { if (n == null) return "N/A"; const lo = _rc(n * 0.85), hi = _rc(n * 1.15); return lo === hi ? `~${fmtNum(_rc(n))}` : `${fmtNum(lo)} to ${fmtNum(hi)}`; };
        return [
          { when: "Today", big: fmtNum(proj.t0), cap: `visits / mo${proj.dr0 != null ? ` · DR ${proj.dr0}` : ""}`, now: true },
          { when: "Day 90", big: _rng(proj.t3), cap: `visits / mo · modelled${proj.dr3 != null ? ` · DR ${proj.dr3}` : ""}` },
          { when: "Day 180", big: _rng(proj.t6), cap: `visits / mo · modelled${proj.dr6 != null ? ` · DR ${proj.dr6}` : ""}` },
          { when: "Month 12", big: _rng(proj.t12), cap: `visits / mo · modelled${proj.dr12 != null ? ` · DR ${proj.dr12}` : ""}`, goal: true },
        ];
      })()} />
      <Row cols={3} className="mt2">
        <Card accent title="Search visibility"><p className="small">From <strong style={{ color: C.rust }}>{kw0 ? `${fmtNum(kw0)} ranking keywords today` : "today's base"}</strong> to a targeted base of <strong style={{ color: C.rust }}>{opp.commercial_keyword_count ? `${opp.commercial_keyword_count}+ commercial terms` : "commercial terms"}</strong>, led by zero-difficulty wins.</p></Card>
        <Card accent title="Local dominance"><p className="small">Into the <strong style={{ color: C.rust }}>local map pack</strong>, on a {rating ? `${rating}★` : "strong"} rating rivals can&apos;t match.</p></Card>
        <Card accent title="AI presence"><p className="small">From a <strong style={{ color: C.rust }}>GEO score of {_geoScore ?? geo.overall?.geo_score} to 45+</strong>{isIllus ? " (illustrative)" : ""}, lifting share of voice, mentions and citations across every AI engine we scan.</p></Card>
      </Row>
      <p className="small" style={{ marginTop: 12, color: C.muted, fontSize: 10.5, lineHeight: 1.5 }}>
        <b style={{ color: C.inkSoft }}>How we model this:</b> <b style={{ color: C.inkSoft }}>Today</b> is measured (Moz / DataForSEO). Future stages are <b style={{ color: C.inkSoft }}>modelled projections</b>, not guarantees: capturable traffic = keyword volume × realistic page-1 CTR (~9% zero-difficulty, ~3% medium, ~1.2% hard), phased in as each page ships and assuming the plan runs on schedule.
      </p>
    </Slide>
  );

  /* 5 · THE AUDIT MAP */
  const techCrit = lcpMs != null && Number(lcpMs) >= 6000;
  const techWarn = lcpMs != null && Number(lcpMs) >= 2500;
  const onpageHigh = tp.some((x) => /high|crit/i.test(x.priority));
  // item 8a — the off-page line must read the REAL rival referring-domain counts, not a fixed
  // "rivals' hundreds" string. Rivals are usually in the thousands and the client (e.g. 429) is the
  // one in the hundreds, so the old copy inverted its own evidence table.
  const _rivalRd = benchRows.map((c) => Number(c && c.refDomains)).filter((n) => n > 0);
  const _rivalRdMax = _rivalRd.length ? Math.max(..._rivalRd) : null;
  const _rdBucket = (n) => (n == null ? null : n >= 1000 ? "the thousands" : n >= 100 ? "the hundreds" : "double digits");
  // RC1 — referring domains may not be returned by the provider for a run. A null is "not measured",
  // never the string "N/A" and never the subject of a comparison ("behind rivals").
  const _offpageLine = rd == null
    ? "Referring domains not yet measured — the authority base is built from here."
    : (_rivalRdMax != null
      ? `${fmtNum(rd)} referring domains, ${Number(rd) < _rivalRdMax ? `behind rivals in ${_rdBucket(_rivalRdMax)}` : "ahead of most rivals"}. Trust must be earned.`
      : `${fmtNum(rd)} referring domains. Trust must be earned.`);
  const pillars = [
    { k: "On-Page SEO", pk: "onpage", head: "Pages exist, signals don't", word: onpageHigh ? "Needs work" : "Solid", kind: onpageHigh ? "med" : "low", line: "Missing H1s, thin content, no commercial pages for buyer terms.", first: "Fix in Phase 1 to 2" },
    { k: "Technical SEO", pk: "tech", head: lcpMs != null ? `A ${lcpSeconds(lcpMs)} load blocks everything` : "Crawl & speed need work", word: techCrit ? "Critical" : techWarn ? "Needs work" : "Solid", kind: techCrit ? "high" : techWarn ? "med" : "low", line: "Speed, broken links and crawl issues keep the site near-invisible.", first: "Fix first" },
    { k: "Off-Page / Authority", pk: "offpage", head: dr != null ? `Domain Rating just ${dr}` : "Authority not yet measured", word: dr == null ? "Unmeasured" : (Number(dr) >= 30 ? "Building" : "Weak"), kind: dr == null ? "med" : (Number(dr) >= 30 ? "med" : "high"), line: _offpageLine, first: "Build over months" },
    { k: "Local SEO / GBP", pk: "local", head: rating != null ? `${rating}★ rating, thin profile` : "No Google rating yet", word: rating != null && Number(rating) >= 4.5 ? "Quick win" : "Needs work", kind: rating != null && Number(rating) >= 4.5 ? "low" : "med", line: (() => { const _gc = _gbpComplete; const _rev = reviews != null ? Number(reviews) : null; return (rating != null && _rev) ? `Real review quality, but only ${dash(reviews)} reviews and a ${dash(_gc)}% complete profile.` : `${_rev ? `${_rev} reviews` : "No reviews yet"} and a ${dash(_gc)}% complete profile — the local ground is unclaimed.`; })(), first: "Phase 1 to 2" },
    { k: "GEO / AEO", pk: "geo", head: "Invisible in AI answers", word: Number(geo.overall?.sov) >= 15 ? "On track" : "Open field", kind: Number(geo.overall?.sov) >= 15 ? "low" : "med", line: aioMeasured ? `Cited in ${aio.brand_cited_count ?? 0} of ${aio.total_citations} Google AI Overview sources. Ready to be quoted, not chosen.` : `${pctStr(geo.overall?.sov)} share of voice, ${pctStr(geo.overall?.citation_rate)} citation rate${isIllus ? " (illustrative)" : ""}. Ready to be quoted, not chosen.`, first: "Phase 2 to 3" },
  ];
  slides.push(
    <Slide key="map" variant="cream" n="03" kicker="The Audit Map" title="Five pillars. One verdict on each."
      sub={ds.audit_sub || `A complete audit covers five disciplines. Here is where ${name} stands on each today, and which gets fixed first. Every later slide proves these findings with data.`} foot={foot("03 · THE AUDIT MAP")}>
      <Row cols={3} style={{ gap: 18 }}>
        {pillars.map((p, i) => (
          <Card key={i} accent>
            <Pillar kind={p.pk} label={p.k} />
            <h4 style={{ margin: "10px 0 4px", fontSize: 14 }}>{p.head}</h4>
            <p className="small" style={{ margin: "0 0 10px" }}>{p.line}</p>
            <div style={{ marginTop: 10, fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase", color: { onpage: "#3C7D5A", tech: "#3B6FB2", offpage: "#A07414", local: "#1A8A8A", geo: "#C95322" }[p.pk] || C.rust }}>Verdict: {p.word} · {p.first}</div>
          </Card>
        ))}
        <Card dark accent title="Read this deck as proof">
          <p className="small">Each pillar gets its own evidence slides ahead: what we found, what it costs in growth, and the first move.</p>
        </Card>
      </Row>
    </Slide>
  );

  /* 6 · THE DIAGNOSIS */
  const topFix = tp.slice(0, 3);
  // Quantified business impact (reviewer #9): conservative leads left on the table.
  // capturable traffic ≈ 5% of in-market search volume; ~2% of that converts to a lead.
  const _searchVol = Number(opp.total_monthly_search_volume) || 0;
  const leadsLost = _searchVol > 0 ? Math.max(1, Math.round(_searchVol * 0.05 * 0.02)) : null;
  slides.push(
    <Slide key="diagnosis" n="04" kicker="The Diagnosis" title="Three fixable things keep you out"
      sub={ds.diagnosis_sub || "The site is not underperforming. It is not yet in the game. Each fix below has a clear, measurable payoff."} foot={foot("04 · THE DIAGNOSIS")}>
      <Split bias>
        <div>
          {(topFix.length ? topFix : [{ issue: "Technical foundation", why_it_matters: "Crawl and speed issues keep the site hard to index.", expected_unlock: "Indexable", estimated_effort: "" }]).map((f, i) => (
            <FixRow key={i} title={clamp(f.issue, 54)} desc={clamp(f.plain || f.why_it_matters || f.action, 158)} goal={clamp(f.expected_unlock || (/high|crit/i.test(f.priority) ? "Unblocks ranking" : "Strengthens the site"), 46)} when={f.estimated_effort || (/high|crit/i.test(f.priority) ? "fix first" : "within 30 days")} />
          ))}
        </div>
        <Card soft title="Already working in your favour">
          {/* B15 — "No penalties. Clean history" is unprovable without a Search Console connection
              (no manual-action data source). Replaced with a crawl-provable favourable fact: the site
              was reached, validated and crawled, so the technical basics genuinely pass. */}
          <Checks items={[
            { state: "ok", text: <><b>Reachable &amp; crawlable.</b> Valid SSL and a live, indexable homepage — the technical basics pass.</> },
            { state: "ok", text: <><b>Schema in place.</b> {faqCount ? `${faqCount} FAQ blocks present, a structure associated with answer extraction.` : "Answer-shaped content present."}</> },
            { state: rating ? "ok" : "do", text: rating ? <><b>A genuine {rating}★ rating.</b> Real trust to build on.</> : <>Build first reviews for trust.</> },
            { state: "ok", text: <><b>An open field.</b> No one owns the commercial space.</> },
          ]} />
        </Card>
      </Split>
      {/* Number-critical callout: always compute from the real bindings (traffic, search
          volume, leads) — never Claude's ds.diagnosis_cost, which mis-scaled these on itzfizz
          ("125K" for 1.3K, "$6K" for 56K). Correctness of these figures outranks phrasing. */}
      <Callout className="mt2"><b>What this costs you today:</b> with {fmtNum(traffic0 ?? 0)} organic visit{(traffic0 ?? 0) === 1 ? "" : "s"}, the {opp.total_monthly_search_volume ? `roughly ${fmtNum(opp.total_monthly_search_volume)}` : ""} monthly searches in your market go to competitors. Fixing these three things is what turns the site from invisible into found, and unlocks every later move in this plan.{leadsLost ? <> At a conservative <b>5% capture × 2% conversion</b>, that undefended demand is <strong style={{ color: C.rust }}>~{fmtNum(leadsLost)} qualified leads a month</strong> handed to rivals.</> : null}</Callout>
    </Slide>
  );

  /* 7 · TECHNICAL SEO */
  // The reference Count column carries the number; the Issue label drops the leading count.
  const techCount = (t) => t.affected_count ?? t.affected_pages ?? (String(t.issue).match(/\d[\d,]*/)?.[0]);
  const techLabel = (t) => {
    const c = t.affected_count ?? t.affected_pages;
    const s = String(t.issue || "");
    if (c == null) return s;
    return s.replace(/^\d[\d,]*\s+(of\s+[\d,]+\s+)?/i, "").replace(/^./, (ch) => ch.toUpperCase());
  };
  // Issue cell with the SPECIFIC affected page paths beneath it — so the deck shows
  // WHERE to fix, not just how many. Falls back to the label alone when no URLs.
  const techIssueCell = (t) => {
    const all = Array.isArray(t.affected_urls) ? t.affected_urls : [];
    const shown = all.slice(0, 2).map((u) => clamp(u, 26));
    const more = all.length - shown.length;
    return { v: (
      <>
        <div>{techLabel(t)}</div>
        {/* Plain-English "what this is" so a non-technical reader understands the jargon (title tag,
            H1, meta description…). Falls back to the affected page paths when no plain gloss exists. */}
        {t.plain ? <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, lineHeight: 1.4, fontWeight: 400 }}>{clamp(t.plain, 172)}</div> : null}
        {/* Show the affected pages IN ADDITION to the plain gloss (not either/or), so every finding names its URLs. */}
        {shown.length ? <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{shown.join("  ·  ")}{more > 0 ? `  +${more} more` : ""}</div> : null}
      </>
    ) };
  };
  // item 7 — a CWV number must carry its evidence: the measured URL + whether it is lab (Lighthouse)
  // or field (CrUX) data. (Null metrics already render "N/A", never a fake 0.)
  const _cwvUrl = mv(bm, "cwvUrl", "cwv_url");
  const _cwvSrc = mv(bm, "cwvSource", "cwv_source");
  const cwv = [
    { n: lcpMs != null ? lcpSeconds(lcpMs) : "N/A", l: "Largest paint · target <2.5s", flag: lcpMs != null && Number(lcpMs) >= 2500 },
    { n: dash(mv(bm, "cls")), l: "Layout shift · good <0.1", flag: mv(bm, "cls") != null && Number(mv(bm, "cls")) >= 0.1 },
    { n: dash(mv(bm, "mobile_performance_score", "performanceMobile")), l: "Mobile speed · /100", flag: true },
    { n: dash(mv(bm, "desktop_performance_score", "performanceDesktop")), l: "Desktop speed · /100", flag: false },
  ];
  slides.push(
    <Slide key="technical" variant="cream" n="05" kicker="Technical SEO" title="Fix the foundation before building on it"
      sub={<>{ds.technical_sub || "Search engines judge these signals before they read a word of content. Each one below has a fix and a clear target."} <Pillar kind="tech" label="Technical SEO" /></>} foot={foot("05 · TECHNICAL SEO")}>
      <Split bias>
        <div>
          <DataTable head={[{ label: "Issue found" }, { label: "Count", align: "right" }, { label: "Priority", align: "right" }]}
            rows={tp.slice(0, 8).map((t) => ({ cells: [techIssueCell(t), { v: dash(techCount(t)), num: true, align: "right" }, { align: "right", tag: { kind: /high|crit/i.test(t.priority) ? "high" : /med/i.test(t.priority) ? "med" : "low", label: titleCase(t.priority) } }] }))} />
          {/* 3.3 — state crawl coverage honestly (findings apply to the crawled sample, not a census).
              B7 — note the health score now includes a Core Web Vitals penalty, so it agrees with the speed verdict. */}
          <p className="small" style={{ marginTop: 10, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
            {(() => {
              const _cr = d.websiteCrawl?.pageCount || (d.websiteCrawl?.pages || []).length || null;
              const _tot = d.websiteCrawl?.siteSize?.totalPagesEstimate || d.websiteCrawl?.summary?.indexedPages || d.websiteCrawl?.indexedPages || null;
              return <>Findings apply to the <b>{_cr ? fmtNum(_cr) : "crawled"} page{_cr === 1 ? "" : "s"} we crawled{_tot && _tot > _cr ? ` of ~${fmtNum(_tot)} on the site` : ""}</b>{_tot && _tot > _cr ? ", a sample" : ""}.{health != null ? <> Site health ({dash(health)}/100) includes a Core Web Vitals penalty, so it agrees with the speed verdict.</> : null}</>;
            })()}
          </p>
          {sv && Array.isArray(sv.signals) && sv.signals.length ? (
            <div style={{ marginTop: 16 }}>
              <h3 className="mini">Foundation validated {sv.eligible_for_audit ? <span style={{ color: "#3C7D5A" }}>· eligible for a full audit</span> : <span style={{ color: C.rust }}>· eligibility flagged</span>}</h3>
              <Checks items={sv.signals.map((s) => ({ state: s.ok ? "ok" : "no", text: s.label + (s.detail ? `, ${clamp(s.detail, 44)}` : "") }))} />
            </div>
          ) : null}
        </div>
        <div>
          <h3 className="mini">Core Web Vitals{_cwvSrc ? ` · ${_cwvSrc === "field" ? "Field (CrUX)" : "Lab (Lighthouse)"}` : ", measured today"}</h3>
          {_cwvUrl ? <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, color: C.muted, margin: "1px 0 5px", wordBreak: "break-all" }}>Measured on {String(_cwvUrl).replace(/^https?:\/\//, "").replace(/\/$/, "")}</div> : null}
          <Tiles cols={2} style={{ margin: "8px 0 14px" }}>
            {cwv.map((c, i) => <Tile key={i} flag={c.flag} n={c.n} label={c.l} />)}
          </Tiles>
          <Card soft title="The fix sequence">
            <ul className="checks">
              {tp.slice(0, 4).map((t, i) => <li key={i}><span className="ic do">{i + 1}</span><span>{clamp(t.action || t.recommended_action || t.issue, 124)}</span></li>)}
            </ul>
          </Card>
          {(() => { const _cc = (tp.find((t) => t.cms_cause) || {}).cms_cause; return _cc ? <p className="small" style={{ marginTop: 10, color: C.muted }}><b style={{ color: C.ink }}>Likely cause:</b> {clamp(_cc, 210)}</p> : null; })()}
        </div>
      </Split>
      {te ? (
        <div style={{ marginTop: 12 }}>
          <Card soft title="Independent live audit, checked as Google renders the site">
            <p className="small" style={{ margin: 0, color: C.muted, lineHeight: 1.45 }}>
              <b style={{ color: /accurate|verified/i.test(te.grade) ? "#3C7D5A" : C.rust }}>{te.grade}.</b> {clamp(te.summary, 200)}
            </p>
            {Array.isArray(te.additional) && te.additional.length ? (
              <p className="small" style={{ margin: "6px 0 0", color: C.ink }}>
                <b>Also found, beyond the list above:</b> {te.additional.slice(0, 5).map((a) => `${a.label} (${a.count})`).join("  ·  ")}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </Slide>
  );

  /* 8 · THE OPENING (competitors), 4 rows + door-they-leave-open column */
  /* 06 · THE GAP IN NUMBERS — the hard quantitative gap comes FIRST, so "the opening" that
     follows reads as the answer to a gap the reader has already seen (natural flow). */
  // RC1 — when a whole provider column is null across EVERY row (Domain Rating / referring domains not
  // collected for this run), DROP the column rather than shipping a wall of "N/A" under a caption that
  // claims "none are estimated". An honest 3-column table beats a 5-column one that is half empty.
  const _b5 = benchRows.slice(0, 5);
  const _hasDR = [dr, ..._b5.map((c) => c && c.dr)].some((v) => v != null);
  const _hasRD = [rd, ..._b5.map((c) => c && c.refDomains)].some((v) => v != null);
  const _benchHead = [{ label: "Competitor" }, ...(_hasDR ? [{ label: "Domain Rating", align: "right" }] : []), { label: "Organic Traffic / mo", align: "right" }, { label: "Ranking Keywords", align: "right" }, ...(_hasRD ? [{ label: "Referring Domains", align: "right" }] : [])];
  const _benchRows = [
    ..._b5.map((c) => ({ cells: [{ v: <strong>{c.name || c.domain}</strong> }, ...(_hasDR ? [{ v: (c.dr == null || (Number(c.dr) === 0 && Number(c.refDomains) > 0)) ? "n/a" : dash(c.dr), num: true, align: "right" }] : []), { v: c.traffic != null ? fmtNum(c.traffic) : "n/a", num: true, align: "right" }, { v: c.keywords != null ? fmtNum(c.keywords) : "n/a", num: true, align: "right" }, ...(_hasRD ? [{ v: c.refDomains != null ? fmtNum(c.refDomains) : "n/a", num: true, align: "right" }] : [])] })),
    { you: true, cells: [`${name} (you)`, ...(_hasDR ? [{ v: dash(dr), num: true, align: "right" }] : []), { v: fmtNum(traffic0), num: true, align: "right" }, { v: dash(mv(bm, "organic_keywords", "organicKeywords")), num: true, align: "right" }, ...(_hasRD ? [{ v: dash(rd), num: true, align: "right" }] : [])] },
  ];
  slides.push(
    <Slide key="gap" variant="cream" n="06" kicker="The Gap In Numbers" title="How far ahead the competition really is"
      sub={<>{ds.gap_sub || "Your real baseline against the market, with the metrics we pull for every rival."} {benchIllus ? IllusTag : null}</>} foot={foot("06 · COMPETITOR BENCHMARK")}>
      <DataTable compact head={_benchHead} rows={_benchRows} />
      <Row cols={3} className="mt" style={{ gap: 18 }}>
        <Card accent title="The gap is real, not fatal"><p className="small">The leader holds the authority, but most rivals sit within a 12-month reach of where {name} can be.</p></Card>
        <Card accent title="Traffic follows the basics"><p className="small">Their traffic comes from fixing what you already can: fast pages, clear titles, and answer-shaped content.</p></Card>
        <Card accent title="Keywords are uncontested"><p className="small">None defend the commercial and local terms in this plan, so your first {opp.commercial_keyword_count ? `${opp.commercial_keyword_count}` : "30+"} keywords face no real incumbent.</p></Card>
      </Row>
      <Callout className="mt2" mark="i"><b>Reading it:</b> your row is measured today (Moz / DataForSEO). {benchIllus ? "Competitor figures are illustrative of the gap; your live competitor scrape drops straight into this table." : ((_hasDR && _hasRD) ? "Competitor authority, traffic and keyword counts are pulled per rival (Moz / DataForSEO), none are estimated. A cell reading n/a means the provider returned no value for that domain, never a zero." : "Competitor traffic and keyword counts are pulled per rival, none are estimated. A cell reading n/a means the provider returned no value for that domain; authority columns it did not return for this run are omitted rather than shown empty.")}</Callout>
    </Slide>
  );

  /* 07 · THE OPENING — where the leaders are absent / the winnable ground, framed as the
     answer to the gap just shown. */
  slides.push(
    <Slide key="opening" variant="cream" n="07" kicker="The Opening" title={ds.opening_title || "The leaders are absent where it is winnable"}
      sub={ds.opening_sub || "Ranked by the query set each rival actually threatens, so you know where the fight is, and where the ground is open."} foot={foot("07 · THE OPENING")}>
      {comps.length > 0 ? (() => {
        const localSet = new Set((cl.localCompetitors || []).map((x) => lc(x?.name || x?.domain || "")));
        return (
        <DataTable head={[{ label: "Competitor" }, { label: "Threatens you on" }, { label: "The door they leave open" }, { label: "Threat", align: "right" }]}
          rows={[...comps].sort((a, b) => { const r = (c) => /high|alert/i.test(c.strength || c.threat || "") ? 2 : /med/i.test(c.strength || c.threat || "") ? 1 : 0; return r(b) - r(a); }).slice(0, 4).map((c) => ({ cells: [{ v: <strong>{c.name || c.domain}</strong> }, { v: <><b style={{ color: C.rust }}>{battlegroundFor(c, localSet.has(lc(c.name || c.domain)))}</b><span style={{ color: C.muted }}> · {clamp(c.description, 44)}</span></> }, clamp(c.door || c.door_open || c.opening || "Local + AI-answer queries they ignore", 60), { align: "right", tag: { kind: /high|alert/i.test(c.strength || c.threat || "") ? "high" : "med", label: (c.strength || (c.threat ? "High" : "Med")).toString().replace("THREAT ALERT", "High") } }] }))} />
        );
      })() : <GapPanel title="Competitor set pending">Competitor landscape populates once the competitor analysis completes.</GapPanel>}
      {(ds.opening_move || cl.localOpening) && <Callout className="mt2">{ds.opening_move ? leadBold(ds.opening_move) : <><b>The move:</b> {clamp(cl.localOpening, 220)}</>}</Callout>}
    </Slide>
  );

  /* 10 · WHAT BUYERS TYPE */
  // 3b — `limit` lets Tier 1 render ALL mapped commercial pages so the visible rows equal the
  // "Commercial pages mapped" tile (was a hard slice(0,5) that showed 5 while the tile said 7).
  const tierCard = (tag, tagKind, heading, desc, items, accent = false, limit = 5, noVolLabel = "n/a") => (
    <Card accent={accent}>
      <span className={`tag ${tagKind}`}>{tag}</span>
      <h4 style={{ margin: "12px 0 2px", fontSize: 14 }}>{heading}</h4>
      <p className="small" style={{ margin: "0 0 12px" }}>{desc}</p>
      {(items || []).slice(0, limit).map((k, i) => (
        <div key={i}>
          <KV k={k.keyword_cluster || k.page_name || k.proposed_title || k.keyword} v={Number(k.primary_volume) > 0 ? fmtNum(k.primary_volume) : noVolLabel} />
          {/* RC5/B4 — near-identical variants share ONE demand pool; list them so the reader sees the
              single volume covers the whole cluster (not summed per variant). */}
          {Array.isArray(k.variants) && k.variants.length
            ? <div style={{ fontSize: 9, color: C.faint, margin: "-2px 0 7px", lineHeight: 1.45 }}>+ {k.variants.slice(0, 3).join(" · ")}{k.variants.length > 3 ? ` · +${k.variants.length - 3} more` : ""} <span style={{ fontStyle: "italic" }}>(same demand pool)</span></div>
            : null}
        </div>
      ))}
      {(!items || items.length === 0) && <p className="small">No measured demand in this tier yet.</p>}
    </Card>
  );
  slides.push(
    <Slide key="keywords" n="08" kicker="Keyword Strategy" title={ds.keywords_title || "Three kinds of searcher. One of them buys."}
      sub={<>{(() => { const _cp = (ca.commercial_pages || []).length; const _terms = Number(opp.commercial_keyword_count) || _cp; return _cp ? `${_terms > _cp ? `${_terms} commercial terms map to ${_cp} landing pages` : `${_cp} commercial landing pages mapped`} — the tier that turns a ranking into a client.` : (ds.keywords_sub || "We chase the commercial tier first. That is the one that turns a ranking into a client."); })()} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("08 · KEYWORD STRATEGY")}>
      <Row cols={3} style={{ gap: 18 }}>
        {tierCard("Tier 1 · Ready to buy", "new", "Commercial intent", "A landing page each. This is where revenue comes from.", ca.commercial_pages, true, (ca.commercial_pages || []).length || 5)}
        {tierCard("Tier 2 · Local", "pull", "Place-based intent", "The uncontested ground. City in the H1, real local proof.", ca.geography_pages || ca.city_pages, false)}
        {tierCard("Tier 3 · Learning", "ghost", "Informational intent", "Answer content that feeds AI engines and builds topical authority.", ca.blog_and_guides, false, 5, "long-tail")}
      </Row>
      <Tiles cols={4} style={{ marginTop: 24 }}>
        {/* item 3c — the headline total must reconcile with the tier rows. primary_volume === the
            keyword's global_volume, so the only gap was that the old total summed ALL accepted keywords
            while the tiers show the mapped pages. Sum the SAME mapped set the three tiers render. */}
        <Tile n={(() => { const _mv = [...(ca.commercial_pages || []), ...(ca.geography_pages || ca.city_pages || []), ...(ca.blog_and_guides || [])].reduce((s, p) => s + (Number(p.primary_volume) || 0), 0); return _mv > 0 ? fmtNum(_mv) : (opp.total_monthly_search_volume ? fmtNum(opp.total_monthly_search_volume) : "N/A"); })()} label="Monthly searches in play" />
        {/* §3 — label the PAGE counts as pages: the subtitle's "58 commercial terms" is the KEYWORD
            count (commercial_keyword_count); these tiles are the mapped pages (commercial_pages.length),
            so a "terms" label read as a contradiction (58 vs 8). And the 4th tile counts EXISTING pages
            to improve — "defended" (with alarm styling) wrongly implied itzfizz already holds them. */}
        {/* §1/§3 — the LOCAL tile must equal the local terms this same slide renders (Tier-2 shows N city
            terms, so "Local pages to own" = the geography-page count, not just the create-new subset), and the
            commercial tile is relabeled "mapped" so it no longer reads as a build count that duplicates the
            "existing to optimise" figure below it. */}
        <Tile n={dash((ca.commercial_pages || []).length)} label="Commercial pages mapped" />
        <Tile n={dash((ca.geography_pages || ca.city_pages || []).length)} label="Local pages to own" />
        <Tile n={dash((ca.commercial_pages || []).filter((p) => p.action === "optimise-existing").length)} label="Existing pages to optimise" />
      </Tiles>
    </Slide>
  );

  /* 11 · GEO & AI VISIBILITY (verdict) */
  slides.push(
    <Slide key="geo-verdict" variant="dark" n="09" kicker="GEO & AI Visibility" title="Are you visible when buyers ask AI?"
      sub={<>{(() => { const _gi = String(ds.geo_intro || ""); if (measured && promptsRun) { return /pending|not (?:yet |been )?(?:run|scanned|measured)|scan is (?:coming|pending)|awaiting/i.test(_gi) ? "A growing share of buyers ask AI for a recommendation, then act on the names returned — here is where you stand across the engines we measured." : _gi.replace(/(?:a set of\s*)?25\s*(?:to|–|-)\s*100\s*prompts/i, `${promptsRun} prompts`); } return _gi || "A growing share of buyers ask AI for a recommendation, then act on the names returned."; })()} {aioMeasured ? MeasTag : IllusTag}</>} foot={foot("09 · GEO & AI VISIBILITY")}>
      <Verdict num={geoVerdictWord}>
        {aioMeasured ? (
          <>Across <b>{aio.keywords_checked} tracked buyer queries</b>, Google returns an AI Overview {aio.aio_coverage_pct}% of the time. Of the <b>{aio.total_citations} sources</b> those answers cite, {name} is cited <b>{aio.brand_cited_count ?? 0} times</b>.{aioCompStr ? <> {aioCompStr} are cited instead.</> : null} <b>You are technically ready to be quoted, but not yet being chosen.</b></>
        ) : (
          <>Across <b>{promptsRun ? `${promptsRun} buyer prompts` : "25 to 100 prompts"} on {enginesRun || geo.overall?.engines_tested || CANON_ENGINES.length} engines</b>, {name} is named in <b>{pctStr(geo.overall?.mention_rate)}</b> of answers and cited in <b>{pctStr(geo.overall?.citation_rate)}</b>.{_heardList ? <> Instead, AI names {_heardList}.</> : null} <b>You are ready to be quoted, but not yet being chosen.</b></>
        )}
      </Verdict>
      <Split className="mt2" style={{ marginTop: 22 }}>
        <div>
          <h3 className="mini">How we gathered this</h3>
          <Checks items={[
            { state: "do", text: `Built ${promptsRun || "25 to 100"} buyer prompts from your services, competitor terms and proprietary intent tests.` },
            { state: "do", text: `Ran each across ${enginesRun || CANON_ENGINES.length} engine${(enginesRun || CANON_ENGINES.length) > 1 ? "s" : ""}, capturing every brand named and source cited.` },
            { state: "do", text: "Scored you vs each competitor, so every number is relative, not vanity." },
          ]} />
        </div>
        <div>
          <h3 className="mini">The three GEO metrics we track</h3>
          <Card dark title={<>Share of Voice <span style={{ color: C.rustSoft, fontWeight: 400, fontSize: 11 }}>· how often you are named</span></>}><p className="small">Your slice of all brand mentions across the answer set.</p></Card>
          <Card dark title={<>Mention Rate <span style={{ color: C.rustSoft, fontWeight: 400, fontSize: 11 }}>· how often you appear at all</span></>}><p className="small" style={{ marginTop: 6 }}>Share of prompts where your brand is named at all.</p></Card>
          <Card dark title={<>Citation Rate <span style={{ color: C.rustSoft, fontWeight: 400, fontSize: 11 }}>· how often you are the source</span></>}><p className="small" style={{ marginTop: 6 }}>Share of prompts where your site is cited as evidence.</p></Card>
        </div>
      </Split>
    </Slide>
  );

  /* 10 · How the GEO score works — placed BEFORE the 0% numbers (item 13) so the reader
     understands how the 0–100 score is calculated before seeing the share/mention/citation.
     The gated _geoScore / _geoVal / _geoGated are computed once near the top (after geoProvenance)
     so slides 04, 10 and 25 all read the SAME gated value. */
  slides.push(
    <Slide key="geo-method" variant="dark" n="10" kicker="How The GEO Score Works" title="Every GEO number, and where it comes from"
      sub="No figure is invented. Each is collected by running real prompts and measuring you against the same competitors, every month." foot={foot("10 · GEO METHODOLOGY")}>
      <Split bias>
        <div>
          <h3 className="mini">The collection method</h3>
          <Checks items={[
            { state: "do", text: <><b>Build:</b> {promptsRun || "25 to 100"} prompts reverse-engineered from your site, competitors and proprietary intent tests.</> },
            { state: "do", text: <><b>Run:</b> every prompt across {(() => { const ns = (geo.by_engine || []).map((e) => engName(e.engine)).filter((n) => n && n !== "N/A"); const list = ns.length ? [...new Set(ns)] : CANON_ENGINES.map((e) => e.name); return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : (list[0] || "the leading AI engines"); })()}.</> },
            { state: "do", text: <><b>Score:</b> share of voice, mention rate and citation rate, you vs each competitor, per engine.</> },
            { state: "do", text: <><b>Repeat:</b> the same set re-runs monthly, so every movement is comparable over time.</> },
          ]} />
        </div>
        <div>
          <h3 className="mini">How the 0 to 100 GEO score is weighted</h3>
          {/* B1 / B2 — show each component's MEASURED value next to its weight, so the reader can see
              the inputs that produce the composite score (not just the weights). */}
          {(() => {
            // B2/S12 — display the ACTUAL scoring function (model/constants.js GEO_SCORE_WEIGHTS: citation
            // .30 / brand .20 / position .15 / intent .15 / consistency .10 / freshness .05 / topic .05),
            // with each signal's REAL measured value from geo.overall.signals — the exact inputs
            // weightedScore() sums. A signal with no data is EXCLUDED and its weight renormalizes across
            // the rest, so the composite below reproduces from exactly these rows. Keep weights in sync.
            const _pc = (v) => `${Math.round(Number(v))}%`;
            // GS1 — "Content freshness" (not "source freshness": with citation rate 0 it is the client's own
            // content recency, not cited-source recency). Readiness signals are GATED out of the score when
            // visibility is 0, and shown greyed with a "gated" note so the composite honestly reads ~0.
            const _comp = [
              { key: "citation_presence", label: "Citation rate · you cited as the source", w: 30 },
              { key: "brand_presence", label: "Mention rate · named at all", w: 20 },
              { key: "citation_position", label: "Citation position · how high you rank", w: 15 },
              { key: "intent_match", label: "Intent match · right answer for the query", w: 15 },
              { key: "cross_engine_consistency", label: "Cross-engine consistency", w: 10 },
              { key: "freshness", label: "Content freshness", w: 5 },
              { key: "topic_coverage", label: "Topic & entity coverage", w: 5 },
            ];
            return _comp.map((r) => { const _isGated = _geoGated && _geoReadinessKeys.has(r.key); const v = _geoVal[r.key]; const _has = v != null && !_isGated; return (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "4.5px 0", borderBottom: "1px solid rgba(255,255,255,.09)", opacity: _has ? 1 : 0.5 }}>
                <span style={{ fontSize: 11, color: "#d6d0c6" }}>{r.label}</span>
                <span style={{ whiteSpace: "nowrap", fontFamily: "var(--mono)", fontSize: 9.5 }}>
                  <span style={{ color: _isGated ? C.faint : C.rust, fontWeight: 700 }}>{v == null ? "no data" : _pc(v)}</span>
                  <span style={{ color: C.faint, marginLeft: 8 }}>· weight {r.w}%{_isGated ? " · gated (0% visibility)" : (v == null ? " · excluded" : "")}</span>
                </span>
              </div>
            ); })}
          )()}
          <Verdict compact num={_geoScore ?? "N/A"}>
            {_geoGated
              ? <>The composite is a <b>weighted average of the measured rows</b>, but the readiness signals (cross-engine consistency, content freshness) are <b>gated out</b> — "consistency" while named in 0% of answers is consistency of absence, not visibility. Cited and named in <b>0%</b>, the honest visibility score is <b>near zero</b>. That is the gap this plan closes. {isIllus ? IllusTag : null}</>
              : <>The composite is the <b>weighted average of the measured rows above</b> (a row with no data is excluded, its weight shared across the rest). {isIllus ? IllusTag : null}</>}
          </Verdict>
        </div>
      </Split>
    </Slide>
  );

  /* 12 · GEO SoV */
  // item 9 — always show the client AND EVERY configured competitor as its own SoV row (even at
  // 0%), then fill remaining slots with any other brand AI named. The backend already seeds all
  // competitors at 0%; a blanket top-N cut was dropping the 0% rivals (Social Panga, Webchutney,
  // The Social Street) whenever unrelated brands were also mentioned — this guarantees each one.
  const _cfgNames = new Set((comps || []).map((c) => lc(c?.name || c?.domain || "").trim()).filter(Boolean));
  const _sovClient = sov.find((b) => b.is_client);
  const _sovCfg = sov.filter((b) => !b.is_client && _cfgNames.has(lc(b.brand).trim()));
  const _sovCfgSet = new Set(_sovCfg.map((b) => lc(b.brand).trim()));
  const _sovOther = sov.filter((b) => !b.is_client && !_sovCfgSet.has(lc(b.brand).trim()));
  const _sovGuaranteed = [_sovClient, ..._sovCfg].filter(Boolean);
  const sovRows = [..._sovGuaranteed, ..._sovOther.slice(0, Math.max(0, 9 - _sovGuaranteed.length))]
    .sort((a, b) => (Number(b.avg) || 0) - (Number(a.avg) || 0));
  // brands the AI named that were NOT on the client's configured list — extra market intel.
  const _discovered = sov.filter((b) => b.discovered && !b.is_client);
  // When there are no non-client MENTIONS, the chart below falls back to citedDomains (CITATIONS).
  // The title/framing must switch too — never call a citation a "mention".
  const _sovIsCitations = !aioMeasured && sov.filter((b) => !b.is_client).length === 0 && citedDomains.length > 0;
  slides.push(
    <Slide key="geo-sov" n="11" kicker="GEO · Share of Voice"
      title={aioMeasured ? `In AI Overviews, you hold ${Math.round((aioSovRows.find((s) => s.is_client)?.pct) ?? 0)} of every 100 citations` : (_sovIsCitations ? "Who AI cites when buyers ask" : (geo.overall?.sov != null ? `Share of Voice: you hold ${Math.round(geo.overall.sov)} of every 100 mentions` : "Who AI names when buyers ask"))}
      sub={<>{aioMeasured ? "Of every source cited in Google's AI Overviews, this is the slice each domain owns." : "Of every brand named across the full prompt set, this is the slice each competitor owns."} {ProvTag}</>} foot={foot("11 · GEO · SHARE OF VOICE")}>
      <Split>
        <div>
          <h3 className="mini">{aioMeasured ? <>Google AI Overview citations, vs competitors {MeasTag}</> : (sov.filter((b) => !b.is_client).length ? <>Overall share of voice, vs competitors {IllusTag}</> : <>Who AI cites instead of you {MeasTag}</>)}</h3>
          {aioMeasured
            ? [...aioCompetitorsFull.sort((a, b) => b.pct - a.pct), aioSovRows.find((s) => s.is_client), ...aioSovRows.filter((s) => s.is_other)].filter(Boolean).map((b, i) => (
                <CBar key={i} name={b.brand + (b.is_client ? " (you)" : "")} pct={b.pct} you={b.is_client} value={`${Math.round(b.pct)}%`} noPctLabel />))
            : (sov.filter((b) => !b.is_client).length
              ? sovRows.map((b, i) => (<CBar key={i} name={(b.is_client ? b.brand : _canonName(b.brand)) + (b.is_client ? " (you)" : (b.discovered ? " (AI-named)" : ""))} pct={b.avg} you={b.is_client} value={`${Math.round(b.avg)}%`} noPctLabel />))
              : citedDomains.slice(0, 6).map((d, i) => { const mx = citedDomains[0]?.count || 1; return <CBar key={i} name={String(d.domain).replace(/^www\./, "")} pct={Math.round((d.count / mx) * 100)} value={`${d.count}×`} noPctLabel />; }))}
        </div>
        <div>
          {aioMeasured ? (
            <>
              <h3 className="mini">Per-platform share of voice {MeasTag}</h3>
              <Card soft><p className="small"><b>Google AI Overviews is measured today.</b> {name} appears in <b>{aio.brand_cited_count ?? 0} of {aio.total_citations}</b> cited sources ({pctStr(geo.overall?.sov)} share). Per-platform share across Claude, Gemini, Perplexity and ChatGPT is filled in once the full multi-engine scan runs. We never show an estimated split beside a measured one.</p></Card>
            </>
          ) : (
            <>
              <h3 className="mini">Your share of voice, by platform {IllusTag}</h3>
              {engineRows("sov").map((e, i) => <CBar key={i} name={e.engine} pct={e.value} you value={e.scanned ? `${Math.round(e.value)}%` : "N/A"} dim={!e.scanned} noPctLabel />)}
            </>
          )}
        </div>
      </Split>
      <Triad className="mt2">
        <Tc kind="evidence" label="Evidence">{aioMeasured
          ? <>In Google AI Overviews, {aioCompStr || "rivals"} are cited while <b>{name} appears in 0</b> of {aio.total_citations} citations.</>
          : <><b>{_canonName(leader?.brand) || "The leader"}</b> leads share of voice at {Math.round(leader?.avg || 0)}%; you hold {pctStr(geo.overall?.sov)}{promptsRun ? <> — measured across {promptsRun} prompts × {enginesRun} engine{enginesRun > 1 ? "s" : ""}, so the slice is auditable, not a bare percentage</> : null}.</>}</Tc>
        <Tc kind="cost" label="What it costs you">Every AI recommendation that omits you is a <b>warm, high-intent lead</b> handed to a competitor.</Tc>
        <Tc kind="action" label="Do this first">Publish answer-first FAQ pages on your <b>core service questions</b> to enter the answer set where rivals are already cited.</Tc>
      </Triad>
      {/* item 2/8 — when EVERY GEO metric reads 0, say plainly this is a real measured result,
          not a broken scan, and point to the near-miss signal (who WAS named/cited instead). */}
      {(!aioMeasured && measured && (Number(geo.overall?.mention_rate) || 0) === 0 && (Number(geo.overall?.citation_rate) || 0) === 0 && (Number(geo.overall?.sov) || 0) === 0) ? (
        <Callout className="mt2"><b>Is a flat 0% a scan error? No, it is a real measured result.</b> Across {promptsRun ? `${promptsRun} prompts` : "the full prompt set"} on {enginesRun || CANON_ENGINES.length} AI engines, {name} was named in <b>0</b> answers and cited <b>0</b> times. The scan did run and did capture answers. {citedDomains.length ? <>On the separate <b>citation axis</b>, the engines cited <b>{citedDomains.slice(0, 3).map((d) => String(d.domain).replace(/^www\./, "")).join(", ")}</b>{citedDomains.length > 3 ? " and others" : ""} instead — the per-prompt breakdown is on slides 13B–13C.</> : <>It found rivals named in your place.</>} So this is not a suspicious blank. You are genuinely absent from AI answers today, which is precisely the gap this plan closes.</Callout>
      ) : null}
      {/* item 2 (AIO-only) — same reassurance when only Google AI Overviews is measured and the
          brand is cited 0 times. Without this, the AIO-only state showed a bare 0% and no context. */}
      {(aioMeasured && (Number(aio.brand_cited_count) || 0) === 0) ? (
        <Callout className="mt2"><b>Is a flat 0% a scan error? No, this is real Google measurement.</b> Across {aio.keywords_checked || "the tracked"} buyer queries, Google's AI Overview cited <b>{aio.total_citations || 0}</b> sources and {name} was in <b>0</b> of them{aioCompStr ? <>, while {aioCompStr} were cited instead</> : null}. You are genuinely absent from AI answers today. The full multi-engine scan adds per-engine detail.</Callout>
      ) : null}
      {/* discovered competitors — brands AI named that the client never listed. Real, unexpected
          market intel: names to watch that surfaced organically in the answers. */}
      {(!aioMeasured && measured && _discovered.length) ? (
        <Callout className="mt"><b>AI also named rivals beyond your set</b> — <b>{_discovered.slice(0, 5).map((b) => _canonName(b.brand)).join(", ")}</b> — shown above tagged <b>AI-named</b>, measured the same way.</Callout>
      ) : null}
    </Slide>
  );

  /* 13 · GEO mentions & citations */
  const metricCol = (label, sub, value, leaderVal, leaderName, rows, measuredNote) => (
    <div className="metric-col">
      <div className="mh"><span className="mt2x">{label}</span><span className="mbig">{pctStr(value)}</span></div>
      <p className="mdesc">{leaderVal != null ? `Leader ${leaderName} sits at ${Math.round(leaderVal)}%.` : (measuredNote || "Measured across the answered prompts.")}</p>
      {(rows || []).map((e, i) => <CBar key={i} name={e.engine} pct={e.value} you value={e.scanned ? `${Math.round(e.value)}%` : "N/A"} dim={!e.scanned} noPctLabel />)}
    </div>
  );
  // When only Google AIO is measured we have no real per-engine mention/citation data or a
  // measured leader — pass no rows + no leader so the slide shows the measured overall
  // number with an honest note. Otherwise the canonical 6-engine scaffold (real + dimmed).
  const mcLeader = aioMeasured ? null : leader;
  const mcNote = aioMeasured ? "Measured in Google AI Overviews. Per-platform detail follows the full scan." : null;
  slides.push(
    <Slide key="geo-mc" n="12" kicker="GEO · Mentions & Citations" title="Mention rate and citation rate, by platform"
      sub={<>Being mentioned is good. Being cited as the source is what builds trust and clicks. You are weak on both, and almost invisible as a source.<span style={{ display: "block", marginTop: 5 }}>{aioMeasured ? MeasTag : IllusTag} {ProvTag}</span></>} foot={foot("12 · GEO · MENTIONS & CITATIONS")}>
      <Split>
        {metricCol("Mention Rate", "how often you appear at all", geo.overall?.mention_rate, mcLeader?.mention_rate, mcLeader?.brand, aioMeasured ? [] : engineRows("mention_rate"), mcNote)}
        {metricCol("Citation Rate", "how often you are the source", geo.overall?.citation_rate, mcLeader?.citation_rate, mcLeader?.brand, aioMeasured ? [] : engineRows("citation_rate"), mcNote)}
      </Split>
      <Triad className="mt2">
        <Tc kind="evidence" label="Evidence">{aioMeasured
          ? <>In Google AI Overviews you are cited in <b>0 of {aio.total_citations}</b> sources, while rivals are quoted repeatedly.</>
          : (() => {
              const mr = Number(geo.overall?.mention_rate) || 0, cr = Number(geo.overall?.citation_rate) || 0;
              if (mr === 0 && cr === 0) return <>Across the answered prompts you are <b>neither named nor cited</b>, invisible as a source while rivals fill the answer.</>;
              if (cr >= mr) return <>Your site is cited in <b>{pctStr(cr)}</b> of answers but your brand is named in only <b>{pctStr(mr)}</b>. The source is used without the name landing.</>;
              return <>You are named in <b>{pctStr(mr)}</b> of answers but cited in only <b>{pctStr(cr)}</b>. <b>When AI names you, it rarely trusts you enough to link.</b></>;
            })()}</Tc>
        <Tc kind="cost" label="What it costs you">{(Number(geo.overall?.citation_rate) || 0) < 1
          ? <>No citation means <b>no referral click and no trust signal</b>, the buyer visits whoever was cited.</>
          : <>Thin citation means <b>few referral clicks and a weak trust signal</b>, most buyers still land on whoever is cited more.</>}</Tc>
        <Tc kind="action" label="Do this first">Add <b>author bylines, schema and a sources-worthy data page</b> so engines treat you as a citable authority.</Tc>
      </Triad>
    </Slide>
  );

  /* 14 · The prompts we ran */
  // CITATION TRUTH: "cited" ONLY when the brand's OWN domain was a real source (p.brand_cited),
  // never when the answer merely had citations (p.citation_count>0 counts a rival's source too).
  const resKind = (p) => (p.brand_cited ? "cited" : p.brand_mentioned ? "named" : "absent");
  // REAL Google AI-Overview evidence: each buyer term, the actual domains Google cited, and your result.
  // AIO fallback: EVERY measured buyer term (was capped at 10). Raw list + a row mapper, so the
  // slide below can PAGINATE all terms across fixed-height slides instead of truncating to 10.
  const _aioRaw = (aio.per_keyword || []).filter((k) => (k.sources || []).length);
  const _aioRowOf = (k) => {
    const cited = (k.sources || []).some((s) => lc(s).includes(lc(String(domain).split(".")[0])));
    return { cells: [
      clamp(k.keyword, 90), <span className="eng-pill" key="e">Google AIO</span>,
      clamp((k.sources || []).map((s) => String(s).replace(/^www\./, "")).join(", "), 110),
      { align: "right", v: <ResCell kind={cited ? "cited" : "absent"}>{cited ? "Cited" : "Not cited"}</ResCell> },
    ] };
  };
  // The prompts we ran, SPLIT INTO THE 3 CAMPAIGNS (the architect taxonomy), because each
  // is won a different way:
  //   Mentions            — best/top questions AI answers from third-party listicles (brands named)
  //   Citation Commercial — buying questions where a website is the cited source (build the page)
  //   Citation Information — learning questions where a blog/explainer is cited (write the blog)
  // Dedup by MEANING (shared signature) and spread across engines, so every row is a distinct
  // question labelled with the engine that really answered it.
  const _promptSig = (p) => semanticSig(p.prompt || p.prompt_text || "");
  const _rich = (p) => (Array.isArray(p.brands_named) ? p.brands_named.length : 0) * 3 + ((p.citation_count || 0) > 0 ? 2 : 0) + ((Number(p.answer_length) || 0) > 0 ? 1 : 0);
  const _byEng = {};
  for (const p of (geo.prompts_executed || [])) { const k = String(p.engine || "?").toLowerCase(); (_byEng[k] = _byEng[k] || []).push(p); }
  for (const k in _byEng) _byEng[k].sort((a, b) => _rich(b) - _rich(a)); // richest answers first per engine
  const _engPools = Object.values(_byEng);
  const geoPool = [];
  const _seenP = new Set();
  for (let _more = true; _more && geoPool.length < 30;) {
    _more = false;
    for (const pool of _engPools) {
      let p = null;
      while (pool.length) { const cand = pool.shift(); const sig = _promptSig(cand); if (!sig || !_seenP.has(sig)) { p = cand; if (sig) _seenP.add(sig); break; } }
      if (!p) continue;
      _more = true;
      geoPool.push(p);
      if (geoPool.length >= 30) break;
    }
  }
  // No live multi-engine scan → fall back to the single Google AI-Overview keyword slide.
  const useAioPrompts = aioMeasured && _aioRaw.length > 0 && geoPool.length === 0;
  // Classify each prompt into one of the 3 campaigns: the architect cluster if present, else
  // by the wording (informational question vs best/top listicle vs commercial/comparison).
  const _campaignOf = (p) => {
    const c = String(p.cluster || "").toLowerCase();
    if (c.includes("mention")) return "mentions";
    if (c.includes("commercial")) return "commercial";
    if (c.includes("information")) return "informational";
    const t = String(p.prompt || p.prompt_text || "").toLowerCase();
    if (/^\s*(what|why|how do|how does|how long|when|which is|is |are |does )/.test(t) || /\b(explained|meaning|definition|guide to)\b/.test(t)) return "informational";
    if (/\b(best|top|leading|greatest|finest|recommended|top[- ]?rated|most trusted|popular|reputable)\b/.test(t)) return "mentions";
    return "commercial";
  };
  const _srcsOf = (p) => (Array.isArray(p.source_domains) ? p.source_domains : []).map((s) => String(s).replace(/^www\./, "")).filter(Boolean);
  // Precision guard for "who it named": a one-off Title-case PROSE fragment ("Typical", "MVPs", "Large Scale",
  // "Digital Heavyweights", "PR Agency") shows up in a SINGLE answer; a real rival the AI trusts RECURS across
  // prompts. Keep a named entity only if it's a configured competitor OR it was named in ≥2 distinct prompts —
  // this kills one-off extraction noise WITHOUT an endless word-list, while real recurring agencies survive.
  const _namedCount = {};
  for (const _p of geoPool) { const _s = new Set(); for (const _b of (Array.isArray(_p.brands_named) ? _p.brands_named : [])) { const _k = lc(String(_b).trim()); if (_k && !_s.has(_k)) { _s.add(_k); _namedCount[_k] = (_namedCount[_k] || 0) + 1; } } }
  const _cfgNamedSet = new Set((comps || []).map((c) => lc(c?.name || c?.domain || "").trim()).filter(Boolean));
  const _corroboratedName = (n) => { const k = lc(String(n).trim()); return _cfgNamedSet.has(k) || (_namedCount[k] || 0) >= 2; };
  // M1 — render "who it named" with EVERY brand the engine named, the tracked competitors highlighted
  // (bold + rust) and sorted first, and display names canonicalised. Was a plain join that gave no signal
  // about which of the named brands is a tracked rival.
  const _namedRender = (p) => {
    const b = _namedOf(p); if (!b.length) return _emptyCell(p, "— none named");
    const tracked = (n) => _canonTracked(n) || _cfgNamedSet.has(lc(String(n).trim()));
    const sorted = [...b].sort((x, y) => (tracked(y) ? 1 : 0) - (tracked(x) ? 1 : 0));
    return <span>{sorted.map((n, i) => <span key={i}>{i > 0 ? <span style={{ color: "var(--muted)" }}>, </span> : null}<span style={tracked(n) ? { fontWeight: 700, color: C.rust } : undefined}>{_canonName(n)}</span></span>)}</span>;
  };
  // 3.5 — a configured rival (business/API competitor) is always a real brand, so it BYPASSES the
  // topic-noise net (which now also drops generic segment/location tokens like "Startups"/"India Sign");
  // only DISCOVERED names must clear _deckTopicNoise. Mirrors the SoV belt.
  const _namedOf = (p) => (Array.isArray(p.brands_named) ? p.brands_named : []).filter(Boolean).filter((n) => _cfgNamedSet.has(lc(String(n).trim())) || !_deckTopicNoise(n)).filter(_corroboratedName);
  const _resCell = (p) => <ResCell kind={resKind(p)}>{p.brand_cited ? "Cited" : p.brand_mentioned ? "Named" : ((Number(p.answer_length) > 0 || p.citation_count > 0) ? "Not named" : "No answer")}</ResCell>;
  // §feedback (Mentions vs Citations) — each CITED SOURCE carries its own provenance (competitor / third-party /
  // owned), classified independently of the mention. Colour-code it so a competitor's page winning the citation
  // reads differently from a neutral directory. Falls back to third_party for any untyped cited domain.
  const _srcTypeColor = (t) => (t === "competitor" ? C.rust : t === "owned" ? "#3C7D5A" : t === "social" ? "#B07A2E" : t === "unknown" ? "#B4ABA0" : "var(--muted)");
  // Deterministic provenance AT RENDER (works whichever pipeline produced the citations): owned = the
  // client's own domain, competitor = a configured rival's domain, else third-party (directory/publisher/forum).
  const _normDom = (u) => String(u || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/?#]/)[0].trim();
  const _brandDom = _normDom(domain);
  const _compDoms = (comps || []).map((c) => _normDom(c?.domain)).filter((x) => x && x.includes("."));
  // 3.7 — social / forum / directory hosts (LinkedIn, YouTube, Reddit, Clutch, JustDial…) are a listing
  // you EARN (an outreach / Mentions play), NOT an editorial page you can out-write. Flag them so a
  // LinkedIn citation on the "blogs to write" slide reads as outreach, not "write a blog". Reuses _DECK_SOURCE.
  const _isSocialDir = (d) => { const p = _normDom(d).split("."); const stem = p.length >= 2 ? p[p.length - 2] : (p[0] || ""); return !!stem && _DECK_SOURCE.has(stem); };
  const _classifySrc = (d) => { const nd = _normDom(d); if (!nd || !nd.includes(".")) return "unknown";   // blank/malformed → explicit unknown (R2), never guessed
    if (_brandDom && (nd === _brandDom || nd.endsWith("." + _brandDom))) return "owned";
    if (_compDoms.some((cd) => nd === cd || nd.endsWith("." + cd) || cd.endsWith("." + nd))) return "competitor";
    if (_isSocialDir(nd)) return "social";   // outreach target (earn a listing), not a page to write
    return "third_party"; };
  const _srcsTypedOf = (p) => (Array.isArray(p.cited_typed) && p.cited_typed.length
    ? p.cited_typed.map((s) => ({ source: String(s.source || "").replace(/^www\./, ""), type: (s.type && s.type !== "third_party") ? s.type : _classifySrc(s.source) })).filter((s) => s.source)
    : _srcsOf(p).map((d) => ({ source: d, type: _classifySrc(d) })));
  // RC2 (acenteus doc 3.5/3.6/3.7) — an engine cannot cite or name itself. When a real answer carried no
  // external SOURCE (or named no BRAND), do NOT fall back to the engine label: that reads as "Gemini cited
  // Gemini" and hides whether the engine cited nobody vs the scrape failed. Show an explicit honest status
  // ("— no source shown" / "— none named") instead. A true NON-answer stays a bare "—".
  const _answeredRow = (p) => (Number(p.answer_length) > 0) || (Array.isArray(p.brands_named) && p.brands_named.length > 0) || (Array.isArray(p.source_domains) && p.source_domains.length > 0) || !!p.brand_mentioned;
  const _emptyCell = (p, label) => (_answeredRow(p) ? <span style={{ color: "var(--muted)" }}>{label}</span> : "—");
  const _srcCell = (p) => { const list = _srcsTypedOf(p); if (!list.length) return _emptyCell(p, "— no source shown");
    return <span>{list.slice(0, 5).map((s, i) => <span key={i} style={{ color: _srcTypeColor(s.type) }}>{i > 0 ? <span style={{ color: "var(--muted)" }}>, </span> : null}{s.source}</span>)}{list.length > 5 ? <span style={{ color: "var(--muted)" }}> +{list.length - 5} more</span> : null}</span>; };
  const _srcLegend = <div style={{ display: "flex", gap: 16, marginTop: 8, fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)" }}>
    <span><span style={{ color: C.rust }}>●</span> Competitor source</span>
    <span><span style={{ color: "var(--muted)" }}>●</span> Third-party (directory / publisher / forum)</span>
    <span><span style={{ color: "#3C7D5A" }}>●</span> Owned</span>
    <span><span style={{ color: "#B4ABA0" }}>●</span> Unknown</span>
  </div>;
  // Owner request — a cited SOURCE is one of two kinds: (1) DIRECT = the brand/competitor's OWN domain
  // ("the brand telling its own name"), (2) THIRD-PARTY = a directory / publisher / review aggregator
  // that lists it. Split the single citation column into these two, cross-checked by domain classification
  // (_classifySrc). Each cell shows only the sources of its kind; "—" when the row has none of that kind.
  // B18 — cap domains per split cell (default 3 on the citation slides) so 13B/13C stay short enough
  // that the "Showing X of Y" count line + triad don't clip off the fixed-height slide.
  const _srcList = (list, cap = 5) => <span>{list.slice(0, cap).map((s, i) => <span key={i} style={{ color: _srcTypeColor(s.type) }}>{i > 0 ? <span style={{ color: "var(--muted)" }}>, </span> : null}{s.source}</span>)}{list.length > cap ? <span style={{ color: "var(--muted)" }}> +{list.length - cap} more</span> : null}</span>;
  // §5.4 — the fix-layer signal (which of the client's pages should win this prompt) lives IN the
  // DIRECT SOURCES column: when the client is not itself a cited direct source (that cell is otherwise
  // "—") we show the page to cite/build, so it adds NO row height (a sub-line was clipping the count
  // line + triad off the fixed-height citation slides). Heuristic token-overlap vs the crawled/mapped
  // inventory; only a real match is shown, never an invented URL.
  const _kwToks = (s) => new Set(String(s || "").toLowerCase().match(/[a-z]{4,}/g) || []);
  const _suggestClientUrl = (p) => {
    const pt = _kwToks(p.prompt || p.prompt_text); if (pt.size < 2) return null;
    const score = (s) => { let n = 0; for (const w of _kwToks(s)) if (pt.has(w)) n++; return n; };
    let best = null, bs = 1;
    for (const pg of (ca.pagesToOptimise || [])) { const sc = score(pg.keyword || pg.page || pg.page_name); const u = pg.matched_url || pg.url; if (sc > bs && u) { bs = sc; best = { url: u, kind: "have" }; } }
    for (const pg of [...(ca.commercial_pages || []), ...(ca.geography_pages || ca.city_pages || []), ...(ca.blog_and_guides || [])]) {
      if (pg.action === "optimise-existing") continue;
      const sc = score(pg.keyword_cluster || pg.page_name || pg.keyword || pg.page);
      if (sc > bs) { bs = sc; const s = String(pg.url_slug || pg.url || "").trim(); if (s) best = { url: /^https?:/.test(s) ? s : ("/" + s.replace(/^\/+/, "")), kind: "build" }; }
    }
    // Never suggest the bare homepage — "→ cite your page: /" is a non-answer for a specific buyer
    // question. A homepage match is treated as NO match and falls through to a create proposal.
    if (best) { const path = String(best.url).replace(/[?#].*$/, "").replace(/^https?:\/\/[^/]+/i, "").replace(/\/+$/, ""); if (!path) best = null; }
    // No owned or planned page won this prompt → route it to the CREATE list with a proposed slug built
    // from the prompt's content words, never the homepage (slides 16/17 fix). Labelled "build", so it
    // reads as a page to create and never claims an existing URL.
    if (!best) {
      const _stop = new Set("what which whats how why when where does do is are was the a an to for from in on of and or vs versus with your you our best top should can will need needs much many any into out look choose choosing choosing pick reach reaching find finding get make use using help helps include includes generate generating build good better right".split(/\s+/));
      const _w = String(p.prompt || p.prompt_text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !_stop.has(w));
      const _slug = _w.slice(0, 4).join("-");
      return _slug ? { url: "/" + _slug, kind: "create" } : null;
    }
    return best;
  };
  const _directSrcCell = (p) => {
    const list = _srcsTypedOf(p).filter((s) => s.type === "owned" || s.type === "competitor");
    if (list.length) return _srcList(list, 3);
    const sug = _suggestClientUrl(p);
    return sug ? <span style={{ color: "#3C7D5A", fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".02em" }}>&rarr; {sug.kind === "have" ? "cite" : "build"} {clamp(sug.url, 24)}</span> : <span style={{ color: "var(--muted)" }}>—</span>;
  };
  const _thirdPartySrcCell = (p) => { const list = _srcsTypedOf(p).filter((s) => s.type === "third_party" || s.type === "unknown" || s.type === "social"); return list.length ? _srcList(list, 3) : (_answeredRow(p) ? <span style={{ color: "var(--muted)" }}>—</span> : "—"); };
  // CC1 / X2 — mentions (brands named) and citations (URLs cited) are two axes; and a CITATION splits
  // into a competitor-owned URL vs a third-party (directory/publisher) URL. Route cited_domains into two
  // SEPARATE columns (was blended under "direct sources = own site, yours + rival"). Deterministic at
  // render via _classifySrc (matches the configured competitor domains). "owned" (your own page cited) is
  // a win, so it rides in the competitor column tagged as yours.
  const _competitorCitedCell = (p) => {
    const list = _srcsTypedOf(p).filter((s) => s.type === "competitor" || s.type === "owned");
    if (list.length) return <span>{list.slice(0, 3).map((s, i) => <span key={i} style={{ color: s.type === "owned" ? "#3C7D5A" : C.rust }}>{i > 0 ? <span style={{ color: "var(--muted)" }}>, </span> : null}{s.source}</span>)}{list.length > 3 ? <span style={{ color: "var(--muted)" }}> +{list.length - 3} more</span> : null}</span>;
    return <span style={{ color: C.faint }}>{_answeredRow(p) ? "no competitor cited" : "—"}</span>;
  };
  // CI1 — say "no source cited yet" EXPLICITLY (not a blank) so the reader can tell "genuinely none" from
  // "not scraped". A true non-answer stays a bare "—".
  const _thirdPartyCitedCell = (p) => { const list = _srcsTypedOf(p).filter((s) => s.type === "third_party" || s.type === "unknown" || s.type === "social"); return list.length ? _srcList(list, 3) : <span style={{ color: C.faint }}>{_answeredRow(p) ? "no source cited yet" : "—"}</span>; };
  // CC1 — the "build this page" recommendation is kept, but moved OUT of the sources columns (it is an
  // action, not an observed citation) onto a sub-line under the prompt so the two citation columns show
  // only what was actually cited.
  const _buildRecLine = (p) => { const sug = _suggestClientUrl(p); return sug ? <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".02em", color: "#3C7D5A", marginTop: 3 }}>&rarr; {sug.kind === "have" ? "cite" : "build"} {clamp(sug.url, 30)}</div> : null; };
  const _promptWithBuild = (p) => <>{clamp(p.prompt, 96)}{_buildRecLine(p)}</>;
  const _srcSplitLegend = <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginTop: 10, paddingTop: 7, borderTop: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)", whiteSpace: "normal" }}>
    <span><b style={{ color: C.rust }}>●</b> <b style={{ color: C.ink }}>competitor URL cited</b> · <span style={{ color: "#3C7D5A" }}>●</span> your own page cited</span>
    <span><b style={{ color: C.ink }}>Third-party</b> = directories &amp; publishers cited</span>
    <span><span style={{ color: "#3C7D5A" }}>&rarr;</span> the page to build/cite is an action, not an observed citation</span>
  </div>;
  // B20 — name the third-party sources AI ACTUALLY cited in this scan, not a generic hardcoded
  // list (Clutch/DesignRush/G2/Reddit). Falls back to unnamed "directories and round-ups" if none.
  const _citedDirs = Array.from(new Set(
    (citedDomains || []).map((d) => _normDom(d.domain)).filter((d) => d && _classifySrc(d) === "third_party")
  )).slice(0, 4);

  if (useAioPrompts) {
    // B19 — show EVERY measured buyer term, paginated across fixed-height slides (was rows capped
    // at 10). Same conservative budget + triad layout as the campaign slides → no clipping.
    const _aioRowPx = (k) => { const n = String(k.keyword || "").length; return n > 112 ? 82 : (n > 56 ? 60 : 38); };
    const _aioPages = [];
    { let _cur = [], _u = 0;
      for (const k of _aioRaw) { const c = _aioRowPx(k); if (_u + c > 340 && _cur.length) { _aioPages.push(_cur); _cur = []; _u = 0; } _cur.push(k); _u += c; }
      if (_cur.length) _aioPages.push(_cur);
    }
    if (!_aioPages.length) _aioPages.push([]);
    const _aioTotal = _aioRaw.length, _aioMulti = _aioPages.length > 1;
    let _aioSeen = 0;
    for (let _pi = 0; _pi < _aioPages.length; _pi++) {
      const _pg = _aioPages[_pi];
      const _from = _aioSeen + 1, _to = _aioSeen + _pg.length; _aioSeen = _to;
      const _lab = _aioMulti && _pi > 0 ? `13·${_pi + 1}` : "13";
      slides.push(
        <Slide key={_aioMulti ? `geo-prompts-${_pi}` : "geo-prompts"} variant="cream" n={_lab} kicker="The Prompts We Ran"
          title={`What AI cites for your buyer terms, and where you're absent${_aioMulti ? ` (cont. ${_pi + 1}/${_aioPages.length})` : ""}`}
          sub={<>The real sources Google's AI Overview quotes for your buyer terms today. {MeasTag}</>} foot={foot(`${_lab} · GEO · PROMPTS`)}>
          <DataTable compact head={[{ label: "Buyer term" }, { label: "Engine" }, { label: "Sources it cited" }, { label: `${name} result`, align: "right" }]} rows={_pg.map(_aioRowOf)} />
          {_aioTotal ? <p className="mt" style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase", color: C.faint, marginTop: 6 }}>{_aioMulti ? (_from === _to ? `Term ${_from} of ${_aioTotal}` : `Terms ${_from}–${_to} of ${_aioTotal}`) : `All ${_aioTotal} buyer term${_aioTotal > 1 ? "s" : ""}`}</p> : null}
          <Triad className="mt">
            <Tc kind="evidence" label="The pattern">Across {aio.keywords_checked} buyer terms, Google cites established directories and rivals, <b>never {name}</b>.</Tc>
            <Tc kind="cost" label="What it costs you">The <b>highest-intent questions</b> are exactly where you are absent, so the best leads never hear your name.</Tc>
            <Tc kind="action" label="Do this first">Target the terms where rivals are cited with <b>answer-first pages built for those exact questions</b>.</Tc>
          </Triad>
        </Slide>
      );
    }
  } else {
    const GROUPS = { mentions: [], commercial: [], informational: [] };
    for (const p of geoPool) GROUPS[_campaignOf(p)].push(p);
    const _promptTag = isIllus ? IllusTag : <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#3C7D5A", background: "rgba(60,125,90,.14)", padding: "2px 8px", borderRadius: 5, marginLeft: 6, whiteSpace: "nowrap" }}>Measured · live AI engines</span>;
    const _campaignSlide = (nLabel, key, title, sub, group, whoLabel, whoOf, triad, legend, srcSplit) => {
      // B18 — fit rows to the FIXED-HEIGHT page so the "Showing X of Y" count line + the triad below it
      // never clip off the bottom. A flat cap clipped on citation campaigns because their compare/pricing
      // prompts wrap to two lines (a ~60px row vs a ~38px one-line row), while informational/mentions
      // prompts stay one line. So size each row by whether its prompt wraps and take rows until the
      // running height would push the footer off-slide. srcSplit citation slides also carry a legend +
      // 5 columns, so they get a smaller body budget than the mentions slide. Over-estimating a
      // borderline prompt as two-line is the safe direction (shows one fewer row, never clips).
      const _rowBudget = srcSplit ? 200 : 340;                       // px of table-body height before the footer must start (srcSplit reserves a row for the legend below the table — CC2)
      const _wrapAt = srcSplit ? 40 : 56;                            // prompt chars that fit on one line in this column
      const _rowPx = (p) => { const n = String(p.prompt || "").length; const base = n > _wrapAt * 2 ? 82 : (n > _wrapAt ? 60 : 38); return srcSplit ? Math.max(base, 60) + 16 : base; }; // 1 / 2 / 3-line row height; srcSplit rows carry multi-domain cited-URL cells + a "page to build" sub-line under the prompt (+16px), so never estimate shorter than a 2-line row (stops the table bleeding into the legend)
      // B19 — show EVERY prompt that ran. Instead of truncating a campaign to the rows that fit one
      // fixed-height slide (and deferring the rest to "the live dashboard"), PAGINATE: pack rows to
      // the same conservative budget, then continue onto a follow-on slide for the overflow. Each
      // page keeps the identical legend + count-line + triad layout, so there is ZERO new clipping
      // risk — we simply add slides instead of hiding prompts.
      const _pages = [];
      { let _cur = [], _u = 0;
        for (const p of group) {
          const c = _rowPx(p);
          if (_u + c > _rowBudget && _cur.length) { _pages.push(_cur); _cur = []; _u = 0; }
          _cur.push(p); _u += c;
        }
        if (_cur.length) _pages.push(_cur);
      }
      if (!_pages.length) _pages.push([]);                 // keep the "no prompts of this type" slide
      const _flagged = group.filter((p) => p.needs_review).length;  // MC-7 — low parser-confidence rows (already computed on the run)
      const _total = group.length;
      const _multi = _pages.length > 1;
      let _seen = 0;
      return _pages.map((_rows, _pi) => {
        const _from = _seen + 1, _to = _seen + _rows.length; _seen = _to;
        const _plabel = _multi && _pi > 0 ? `${nLabel}·${_pi + 1}` : nLabel;   // 13b, 13b·2, 13b·3…
        return (
        <Slide key={_multi ? `${key}-${_pi}` : key} variant="cream" n={_plabel} kicker="The Prompts We Ran"
          title={_multi ? `${title} (cont. ${_pi + 1}/${_pages.length})` : title}
          sub={<>{sub} {_promptTag}</>} foot={foot(`${_plabel.toUpperCase()} · GEO · PROMPTS`)}>
          {/* B17 — full prompt + cited sources (was clamped with an ellipsis). B19 — paginated: this
              page's slice of the campaign's prompts; the count line + triad stay on-slide. srcSplit —
              citation campaigns split the cited SOURCE into DIRECT (brand's own domain) vs THIRD-PARTY
              AGGREGATORS; the §5.4 "cite this page" fix rides IN the Direct-sources cell (when empty),
              so it costs no row height. */}
          <DataTable compact head={srcSplit
              ? [{ label: "Buyer prompt · page to build" }, { label: "Engine" }, { label: "Competitor URLs cited" }, { label: "Third-party URLs cited" }, { label: `${name} result`, align: "right" }]
              : [{ label: "Buyer prompt" }, { label: "Engine" }, { label: whoLabel }, { label: `${name} result`, align: "right" }]}
            rows={_rows.map((p) => srcSplit
              ? { cells: [{ v: _promptWithBuild(p) }, engName(p.engine), { v: _competitorCitedCell(p) }, { v: _thirdPartyCitedCell(p) }, { align: "right", v: _resCell(p) }] }
              : (() => { const _who = whoOf(p); return { cells: [clamp(p.prompt, 150), engName(p.engine), (typeof _who === "string" ? clamp(_who, 110) : { v: _who }), { align: "right", v: _resCell(p) }] }; })())} />
          {legend || null}
          {_total
            ? <p className="mt" style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase", color: C.faint, marginTop: 6 }}>{_multi ? (_from === _to ? `Prompt ${_from} of ${_total}` : `Prompts ${_from}–${_to} of ${_total}`) : `All ${_total} prompt${_total > 1 ? "s" : ""}`} in this campaign{_flagged ? ` · ${_flagged} flagged for manual review (low parser confidence)` : ""}</p>
            : <p className="mt" style={{ fontSize: 11, color: "var(--muted)" }}>No prompts of this type surfaced in this run.</p>}
          {_total ? triad : null}
        </Slide>
        );
      });
    };
    // 13a — MENTIONS: best/top, AI names brands from third-party listicles.
    slides.push(..._campaignSlide("13a", "geo-prompts-mentions",
      "Mentions: where AI names brands, and who gets picked",
      "Best and top style questions. AI answers these from third-party listicles and directories, naming the brands it trusts. You do not win these with your own page, you earn the mention.",
      GROUPS.mentions, "Who it named (tracked rivals bold)", _namedRender,
      <Triad className="mt">
        <Tc kind="evidence" label="The pattern">On these listicle questions AI names <b>rivals from directories and round-ups</b>{name ? <>, rarely {name}</> : null}.</Tc>
        <Tc kind="cost" label="What it costs you">Buyers act on the <b>names AI returns</b>, so every un-listed prompt is a lead that never hears of you.</Tc>
        <Tc kind="action" label="Do this first">Earn placement and genuine reviews on {_citedDirs.length ? <>the <b>sources AI already cites here</b> ({_citedDirs.join(", ")})</> : <>the <b>directories and listicles AI already cites</b> for these questions</>}.</Tc>
      </Triad>
    ));
    // 13b — CITATION COMMERCIAL: buying questions where a website is the source.
    slides.push(..._campaignSlide("13b", "geo-prompts-commercial",
      "Citation, commercial: questions a page on your site can win",
      "Buying-intent questions (compare, pricing, how to choose) where AI cites a website as the source. Build the answer-first page and you become the cited answer that drives the lead.",
      GROUPS.commercial, "Source it cited", _srcCell,
      <Triad className="mt">
        <Tc kind="evidence" label="The pattern"><b>Competitor pages</b> win these citations today, so their site is the answer, not yours.</Tc>
        <Tc kind="cost" label="What it costs you">The buyer reads the <b>cited page and its brand</b>, at the exact moment of intent.</Tc>
        <Tc kind="action" label="Build these">Publish <b>answer-first comparison, pricing and selection pages</b> for these exact questions.</Tc>
      </Triad>, _srcSplitLegend, true
    ));
    // 13c — CITATION INFORMATION: learning questions, blogs to write.
    slides.push(..._campaignSlide("13c", "geo-prompts-info",
      "Citation, informational: blogs to write for AI visibility",
      "Learning-stage questions where AI cites explainer content. Publish these and AI starts citing you, building the topical authority that feeds the commercial wins.",
      GROUPS.informational, "Source it cited", _srcCell,
      <Triad className="mt">
        <Tc kind="evidence" label="The pattern"><b>Competitors are writing these explainers</b>, so AI learns the topic from them.</Tc>
        <Tc kind="cost" label="What it costs you">They build <b>topical authority and entity trust</b> with AI while you stay invisible.</Tc>
        <Tc kind="action" label="Write these">Publish <b>answer-first blogs</b> on these questions, structured for AI to lift and cite.</Tc>
      </Triad>, _srcSplitLegend, true
    ));
  }

  /* 15 · AEO readiness (topic + trust signals), split-bias, topic LEFT, signals RIGHT */
  // MEASURED topic association — read the REAL buildTopicDominance shape (it emits `topics`
  // with a client_lead flag, plus contested_topics / lost_topics — NOT by_brand/won_topics).
  // strong = topics the client LEADS, weak = contested (present but a rival leads), none = lost.
  const _td = geo.topic_dominance || null;
  // UI: clamp the topic label to one line — the raw topics can be long run-on prompt strings that
  // would otherwise wrap into a dense wall of tiny text on the AEO slide.
  const _tdName = (t) => clamp(String((typeof t === "string" ? t : t?.topic) || "").replace(/\s+/g, " ").trim(), 42);
  const tdChips = _td ? [
    ...((_td.topics || []).filter((t) => t.client_lead).map((t) => ({ topic: _tdName(t), state: "strong" }))),
    ...((_td.contested_topics || []).map((t) => ({ topic: _tdName(t), state: "weak" }))),
    ...((_td.lost_topics || []).map((t) => ({ topic: _tdName(t), state: "none" }))),
  ].filter((c) => c.topic).slice(0, 8) : [];
  const topicMeasured = tdChips.length > 0;
  // Measured path → the scan's real led/contested/lost topics (above). Fallback → build the grid
  // from the client's OWN real service taxonomy (commercial + local content clusters): the primary
  // offering renders "strong", adjacent service clusters "weak", local pages "none". Tagged
  // Illustrative so it's never mistaken for a measured cross-engine association. (itzfizz has no
  // competitor set → topic_dominance is null → this taxonomy grid is what renders.)
  const topicChips = topicMeasured ? tdChips : (() => {
    const seen = new Set(); const chips = [];
    const add = (topic, state) => { const t = clamp(titleCase(topic), 42); const k = lc(t); if (t && !seen.has(k) && chips.length < 8) { seen.add(k); chips.push({ topic: t, state }); } };
    if (primaryService) add(primaryService, "strong");
    for (const p of (ca.commercial_pages || [])) add(p.keyword_cluster || p.page_name || p.keyword, "weak");
    for (const p of (ca.geography_pages || ca.city_pages || [])) add(p.keyword_cluster || p.city || p.page_name, "none");
    return chips;
  })();
  slides.push(
    <Slide key="aeo" n="14" kicker="Answer Engine Readiness (AEO)" title="Which topics does AI associate with your brand?"
      sub={`Engines cite brands they understand as an authority on a topic. We tested which topics ${name} is linked to, and where the trust signals are missing.`} foot={foot("14 · ENTITY & TOPICAL AUTHORITY")}>
      <Split bias>
        <div>
          <h3 className="mini">{topicMeasured ? "Topic association, tested across engines" : "Topics you publish for"} {topicMeasured ? null : IllusTag}</h3>
          {topicChips.length ? <><TopicGrid topics={topicChips} /><TopicLegend /></>
            : <p className="small">Topic association renders from the live multi-engine scan; the readiness signals on the right are measured from the site today.</p>}
        </div>
        <div>
          <h3 className="mini">Trust signals: present vs missing</h3>
          {/* B16 — llms.txt (and other crawl-guide signals) being PRESENT is a readiness signal, not a
              realized win. On a site measured at 0% citation + 0% mention, don't award it an unqualified
              green tick that implies a benefit the report itself shows isn't landing yet — mark it "do". */}
          <Checks items={(() => {
            const _geoZero = Number(geo.overall?.citation_rate || 0) === 0 && Number(geo.overall?.mention_rate || 0) === 0;
            return (air.signals || []).slice(0, 8).map((s) => {
              const _isCrawlGuide = /llms\.txt/i.test(`${s.label || ""} ${s.key || ""}`);
              const _base = s.label + (s.detail ? `, ${clamp(s.detail, 50)}` : "");
              if (s.ok && _isCrawlGuide && _geoZero) {
                return { state: "do", text: <>{s.label} — <span style={{ color: "var(--muted)" }}>present, but emerging &mdash; no major engine is proven to cite from it yet</span></> };
              }
              return { state: s.ok ? "ok" : "no", text: _base };
            });
          })()} />
          {/* E2 — the numeric trust signals ("231 sameAs links", "avg 2569 words/page") were stated
              without their evidence source. Attribute them to the on-site crawl (rule 9) so they read as
              measured aggregates over the crawled pages, not invented figures. */}
          {(() => {
            const _crawlPages = d.websiteCrawl?.pageCount || (d.websiteCrawl?.pages || []).length || 0;
            return (air.signals && air.signals.length)
              ? <p style={{ fontSize: 9, color: C.faint, marginTop: 9, lineHeight: 1.5, fontStyle: "italic" }}>Measured from your on-site crawl{_crawlPages ? ` of ${_crawlPages} pages` : ""} — counts such as sameAs links and average words per page are aggregates across those crawled pages, not estimates.</p>
              : <p className="small">Readiness signals populate from the on-site crawl.</p>;
          })()}
        </div>
      </Split>
      <Triad className="mt2">
        <Tc kind="evidence" label="Evidence">{topicMeasured
          ? <>Of the topics we tested across engines, {name} leads on <b>{topicChips.filter((c) => c.state === "strong").length}</b> and cedes <b>{topicChips.filter((c) => c.state !== "strong").length}</b> to rivals, the adjacent, local and specialist topics buyers also ask about.</>
          : <>AI associates {name} with your core service, but not the adjacent, local and specialist topics buyers also ask about.</>}</Tc>
        {/* §8 — this copy must MATCH the evidence count above (topicChips "strong"). Hard-coding "one narrow
            topic" contradicts a measured 0-recognised result; make it data-driven. */}
        <Tc kind="cost" label="What it costs you">{(() => { const _r = topicChips.filter((c) => c.state === "strong").length;
          return _r === 0 ? <>You are <b>not yet recommended for any topic</b>, so every high-intent question surfaces rivals instead.</>
            : _r === 1 ? <>You can only be recommended for <b>one narrow topic</b>, so the broader high-intent questions surface rivals instead.</>
            : <>You are recommended for only <b>{_r} topics</b>, so the broader high-intent questions surface rivals instead.</>; })()}</Tc>
        <Tc kind="action" label="Do this first">Build topic-deep pages plus schema so engines associate {name} with <b>every topic</b> in your market{topicChips.filter((c) => c.state === "strong").length >= 1 ? ", not just one" : ""}.</Tc>
      </Triad>
    </Slide>
  );

  /* (item 13 — "How the GEO score works" moved UP to n=10, right after the GEO verdict, so
      the reader understands how the 0–100 score is weighted BEFORE seeing the 0% numbers.) */

  /* 17 · What we build */
  // item 3.8 / 1.5 — slide 15 (What we build) and slide 16 (Content map) must read the SAME create set,
  // so their counts agree (was: §15 curated 3+1 from raw arrays → "2", §16 used the crawl-filtered
  // pagesToBuild → "4"). Define the create set ONCE here (lifted from §16) and feed both. P5 guard:
  // createPages is already the crawl-filtered NEW-only partition, so a build page can never be an
  // optimise page on §16. item 3d — the title number derives from what is actually built.
  const _ck = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const _optimiseKeys = new Set([...(ca.pagesToOptimise || []).flatMap((p) => [_ck(p.keyword), _ck(p.page)])].filter(Boolean));
  const createPages = (Array.isArray(ca.pagesToBuild) && ca.pagesToBuild.length)
    ? ca.pagesToBuild
    : [...(ca.commercial_pages || []), ...(ca.geography_pages || ca.city_pages || [])].filter((p) => { const k = _ck(p.keyword_cluster || p.page_name); return k && !_optimiseKeys.has(k); });
  // §15 FEATURES the top few of that same set; §16 lists it in full. Both counts trace to createPages.
  const buildCards = createPages.slice(0, 4);
  const _numCap = (n) => (["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"][n] || String(n));
  const _buildTitle = buildCards.length
    ? `${_numCap(buildCards.length)} page${buildCards.length === 1 ? " does" : "s do"} most of the work`
    : "Optimise what exists before building new";
  // §3 / 1.5 — subtitle describes the pages ACTUALLY shown, and states the remainder that lives on the
  // Content Map, so "builds N" visibly reconciles with §16's "M to create".
  const _moreToBuild = Math.max(0, createPages.length - buildCards.length);
  const _buildSub = buildCards.length
    ? `Only pages with real, measured demand — ${_numCap(buildCards.length).toLowerCase()} to build first${_moreToBuild ? `, ${_moreToBuild} more on the Content Map` : ""}. Each has a job and a target.`
    : `Only pages with real, measured demand. Each has a job and a target.`;
  const shipWith = ["Exact-intent H1 and meta", "800 to 1,500 unique words", "5 to 8 FAQs plus schema", "Strong CTA above the fold", "Internal links and alt text", "Sub-2.5s load time"];
  slides.push(
    <Slide key="build" variant="cream" n="15" kicker="What We Build" title={_buildTitle}
      sub={<>{_buildSub} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("15 · WHAT WE BUILD")}>
      {buildCards.length ? (
        <Row cols={Math.min(Math.max(buildCards.length, 1), 4)} style={{ gap: 16 }}>
          {buildCards.map((p, i) => (
            <Card key={i} accent title={p.page || p.page_name || titleCase(p.keyword_cluster)}>
              <Pill>{p.volume ? p.volume : (p.primary_volume ? `${fmtNum(p.primary_volume)}/mo` : "N/A")}{geoQual(p)}</Pill>
              <p className="small" style={{ marginTop: 8 }}>{clamp(p.purpose || p.commercial_reason || p.why_separate_page || "A focused page wins this intent.", 90)}</p>
            </Card>
          ))}
        </Row>
      ) : (
        <Card soft title="Your core service pages">
          <p className="small">The build list is drawn from measured keyword demand. Your strongest terms are over-broad category heads, so the plan wins them through authority and outreach over time rather than a single new page. See the Content Map for pages to optimise and the outreach slide for the head terms to target.</p>
        </Card>
      )}
      <Card soft className="mt2" title="Every page ships with">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 24px" }}>
          {shipWith.map((c, i) => <div key={i} style={{ fontSize: 12, display: "flex", gap: 7, alignItems: "center" }}><span style={{ color: C.good }}>✓</span>{c}</div>)}
        </div>
      </Card>
    </Slide>
  );

  /* 18 · The content map (optimise vs create), 4 count-badged groups */
  // createPages / _optimiseKeys / _ck are defined ONCE in the §15 block above and shared here, so both
  // slides count the same create set (item 3.8 / 1.5). Blogs stay local to this slide.
  const _optimiseBlogKeys = new Set((ca.blogsToOptimise || []).flatMap((p) => [_ck(p.keyword), _ck(p.page)]).filter(Boolean));
  const createBlogs = (Array.isArray(ca.blogsToBuild) && ca.blogsToBuild.length)
    ? ca.blogsToBuild
    : (ca.blog_and_guides || []).filter((b) => { const k = _ck(b.keyword_cluster || b.proposed_title); return !k || !_optimiseBlogKeys.has(k); });
  const PbHead = ({ count, label }) => (<div className="pbhead"><span className="ct2">{count}</span><span className="cl2">{label}</span></div>);
  // Slide-20 fix — DEDUP optimise items to the PAGE level. The keyword→existing-page match can point
  // several keyword clusters at one real URL (e.g. 5 "social media …" terms → /social-media-marketing);
  // rendering one row per keyword reads as 5 separate jobs when it is one page task. Group by matched_url
  // and carry the cluster count, so the client sees "optimise /social-media-marketing · 5 keyword clusters".
  const _dedupPages = (list) => { const m = new Map(); (list || []).forEach((p, idx) => { const k = String(p.matched_url || "").toLowerCase().trim() || `__row${idx}`; if (m.has(k)) m.get(k)._clusters++; else m.set(k, { ...p, _clusters: 1 }); }); return [...m.values()]; };
  const _optPages = _dedupPages(ca.pagesToOptimise);
  const _optBlogs = _dedupPages(ca.blogsToOptimise);
  const _optVal = (p) => (p._clusters > 1 ? `tighten intent · ${p._clusters} clusters` : (p.action ? clamp(p.action, 34) : (p.volume || null)));
  slides.push(
    <Slide key="contentmap" variant="cream" n="16" kicker="The Content Map" title="What to optimise, and what to create"
      sub={<>{ds.contentmap_sub || "We reviewed the pages we crawled. Some are rank-ready and need polish; the rest are gaps to fill."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("16 · THE CONTENT MAP")}>
      {/* B20 — each list shows ALL its items up to a height-safe cap; when a list exceeds the cap a
          "+N more" row keeps what's visible reconciled with the header count (was: header showed the
          full count while the list was hard-capped at 5/3/4/3 → "5 blog posts" but only 3 rendered,
          leaving 2 hidden and a blank column). */}
      <Split>
        <div>
          <PbHead count={_optPages.length || (ca.pagesExistingFlagged ?? 0)} label="service pages you have · optimise" />
          {_optPages.length ? (<>
            {_optPages.slice(0, 6).map((p, i) => (
              <PbItem key={`o${i}`} name={p.page || titleCase(p.keyword)} code={p.matched_url} value={_optVal(p)} />
            ))}
            {_optPages.length > 6 && <PbItem key="om" name={`+ ${_optPages.length - 6} more`} />}
          </>) : (
            <Card soft><p className="small">{ca.pagesExistingFlagged > 0 ? "Matched real demand: add H1, FAQ and schema, and expand thin content. Per-page detail lands with the on-page pass." : "No existing pages matched the target keywords."}</p></Card>
          )}
          <PbHead count={_optBlogs.length || 0} label="blog posts you have · optimise" />
          {_optBlogs.length ? (<>
            {_optBlogs.slice(0, 4).map((p, i) => (
              <PbItem key={`bo${i}`} name={p.page || titleCase(p.keyword)} code={p.matched_url} value={_optVal(p)} />
            ))}
            {_optBlogs.length > 4 && <PbItem key="bom" name={`+ ${_optBlogs.length - 4} more`} />}
          </>) : (
            <Card soft><p className="small">Existing posts that match demand get refreshed with sharper titles, FAQs and internal links. Per-post detail lands with the content pass.</p></Card>
          )}
        </div>
        <div>
          <PbHead count={createPages.length} label="service pages to create" />
          {createPages.slice(0, 6).map((p, i) => <PbItem key={`p${i}`} name={p.page || p.page_name || titleCase(p.keyword_cluster)} code={p.url || p.url_slug} value={p.volume || (p.primary_volume ? `${fmtNum(p.primary_volume)}/mo` : null)} />)}
          {createPages.length > 6 && <PbItem key="pm" name={`+ ${createPages.length - 6} more`} />}
          <PbHead count={createBlogs.length} label="blog posts to create" />
          {createBlogs.slice(0, 6).map((b, i) => <PbItem key={`b${i}`} name={b.page || b.proposed_title || titleCase(b.keyword_cluster)} value={b.volume || (b.primary_volume ? `${fmtNum(b.primary_volume)}/mo` : "long-tail")} />)}
          {createBlogs.length > 6 && <PbItem key="bm" name={`+ ${createBlogs.length - 6} more`} />}
        </div>
      </Split>
    </Slide>
  );

  /* 19 · Google Business Profile */
  const gbpScore = mv(bm, "gbp_completeness", "gmbCompletenessScore") ?? gmb.completeness?.score;
  // items 3e/10a — the bars and the "review gap" callout must read ONE source. Sort competitors by
  // review_count so the TRUE leader is shown, and measure the gap against that same leader using the
  // same client review count the bar shows. (The old code took the first-3 UNSORTED for the bars but
  // computed the gap over the full set with a different client count, so the two never reconciled —
  // e.g. "139 behind" printed next to bars implying 90.)
  const reviewCompetitors = (gbp.competitors || []).filter((c) => c.review_count != null)
    .sort((a, b) => (b.review_count || 0) - (a.review_count || 0)).slice(0, 3);
  const maxRev = Math.max(reviews || 0, ...reviewCompetitors.map((c) => c.review_count || 0), 1);
  const _reviewLeader = reviewCompetitors[0];
  const _reviewGap = _reviewLeader ? Math.max(0, (Number(_reviewLeader.review_count) || 0) - (Number(reviews) || 0)) : null;
  // S21 — the dial must REPRODUCE from the visible checklist (was a provider "completeness" score like 77
  // sitting next to a 6-of-8 tick list = 75%). Drive the dial off the same checklist so a client can count
  // the ticks and get the number. Falls back to the provider score only when there are no field rows.
  const _gbpFields = (gbp.field_analysis || gmb.completeness?.breakdown || []).slice(0, 8);
  const _gbpPass = _gbpFields.filter((f) => !(f.client_status === "missing" || f.pass === false)).length;
  const _gbpDial = _gbpFields.length ? Math.round((_gbpPass / _gbpFields.length) * 100) : (gbpScore ?? 0);
  slides.push(
    <Slide key="gbp" n="17" kicker="Google Business Profile" title="Your fastest path into local results"
      sub={<>{(() => { const _s = ds.gbp_sub || "The map pack drives most local enquiries. Your reviews already beat rivals; the profile just needs completing."; if (_gbpDial == null) return _s;
        // Reconcile whatever completeness figure the LLM wrote in the subtitle to the DIAL value, in any
        // phrasing it uses — "85 percent complete", "85% complete/done", "85 out of 100", "85/100" — so the
        // subtitle never contradicts the dial (A1). Numbers that aren't completeness (reviews, star rating)
        // are left alone. */
        return _s
          .replace(/\b\d{1,3}\s*(?:percent|%)\s+(?:complete|done)\b/gi, `${_gbpDial} percent complete`)
          .replace(/\b\d{1,3}\s*(?:out of|\/)\s*100\b/gi, `${_gbpDial} out of 100`); })()} <Pillar kind="local" label="Local SEO" /></>} foot={foot("17 · GOOGLE BUSINESS PROFILE")}>
      <div className="gbp-split">
        <Ring value={_gbpDial} />
        <div className="gbp-checks">
          {_gbpFields.map((f, i) => (
            <div key={i} className="gc"><span className="ic" style={{ background: (f.client_status === "missing" || f.pass === false) ? C.rust : C.good }}>{(f.client_status === "missing" || f.pass === false) ? "✕" : "✓"}</span>{f.label}</div>
          ))}
          {_gbpFields.length ? <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--muted)", marginTop: 6 }}>{_gbpPass} of {_gbpFields.length} complete = {_gbpDial}%</div> : null}
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        {gbp.has_competitor_data && reviewCompetitors.length > 0 ? (
          <>
            <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>Review counts, bars scaled to the leader</div>
            <CBar name={`${name} (you)`} pct={(reviews / maxRev) * 100} you value={dash(reviews)} noPctLabel />
            {reviewCompetitors.map((c, i) => <CBar key={i} name={c.name} pct={((c.review_count || 0) / maxRev) * 100} value={dash(c.review_count)} noPctLabel />)}
          </>
        ) : null}
        <Callout mark="→" className={gbp.has_competitor_data && reviewCompetitors.length > 0 ? "mt2" : ""}><b>Goal:</b> lift completeness from {_gbpDial}% → 95%, and {_reviewGap ? `close the review gap (${_reviewGap} behind ${_reviewLeader.name || "the local leader"})` : `grow reviews from ${dash(reviews)} → 100+`} in 6 months. Set hours, post weekly, reply to every review, and WhatsApp a review link after each job.</Callout>
      </div>
    </Slide>
  );

  /* 20 · Citations & backlinks, three waves as cards */
  const rdKpi = ksRows.find((r) => /referring/i.test(r.key || r.metric || ""));
  const rdTarget = rdKpi?.target_12_months ?? (rd != null ? Math.round(Number(rd) * 1.8) : null);
  const dirs = (gmb.directories || []).slice(0, 12).map((x) => ({ name: x.name, state: x.listed === true ? "have" : x.listed === false ? "miss" : "q" }));
  const citeDirs = dirs.length ? dirs : (lb.citation_links || []).slice(0, 12).map((x) => ({ name: x.platform, state: x.client_listed ? "have" : "miss" }));
  slides.push(
    <Slide key="backlinks" variant="cream" n="18" kicker="Citations & Backlinks" title={dr == null ? `Building Domain Rating to ${proj.dr12 ?? 25}` : (proj.dr12 != null && proj.dr12 > dr ? `Raising Domain Rating from ${dr} to ${proj.dr12}` : `Your Domain Rating of ${dr} is already strong`)}
      sub={<>{ds.backlinks_sub || "Trust is built in three waves: citations for consistency, then earned links, then closing the leader's gap."} <Pillar kind="offpage" label="Off-Page SEO" /></>} foot={foot("18 · CITATIONS & BACKLINKS")}>
      <Split>
        <div>
          <h3 className="mini">Directories to claim or fix</h3>
          <DirGrid>{citeDirs.map((x, i) => <DirChip key={i} name={x.name} state={x.state} />)}</DirGrid>
          {/* Slide-22 fix — a legend so the grid's marks aren't ambiguous (claimed vs unclaimed vs unknown).
              B1 — its own reserved band (paddingTop/marginBottom) so it never collides with the domains card below. */}
          <div style={{ display: "flex", gap: 14, marginTop: 10, marginBottom: 4, fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted, flexWrap: "wrap" }}>
            <span><b style={{ color: "#3C7D5A" }}>●</b> claimed &amp; consistent</span>
            <span><b style={{ color: C.rust }}>●</b> unclaimed</span>
            <span><b style={{ color: C.faint }}>●</b> not yet verified</span>
          </div>
          {/* RC1 — when referring domains were not returned by the provider, don't render a
              "N/A now → N/A target" card. Show an honest one-line note instead. */}
          {rd != null ? (
            <Card className="mt" style={{ marginTop: 18, padding: "13px 16px", display: "flex", gap: 18, alignItems: "center" }}>
              <div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: C.rust, lineHeight: 1 }}>{fmtNum(rd)}</div><div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em", color: C.muted }}>domains now</div></div>
              <div style={{ color: C.faint }}>→</div>
              <div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: C.rust, lineHeight: 1 }}>{rdTarget != null ? fmtNum(rdTarget) : `${proj.dr12 ?? 25}+`}</div><div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em", color: C.muted }}>target 12 mo</div></div>
            </Card>
          ) : (
            <Card className="mt" style={{ marginTop: 14, padding: "13px 16px" }}>
              <p className="small" style={{ margin: 0, color: C.muted }}>Referring domains are not yet measured for this site. The three waves below build that authority base from zero.</p>
            </Card>
          )}
        </div>
        <div>
          <h3 className="mini">{(dr != null && proj.dr12 != null && proj.dr12 <= dr) ? "Three waves to defend and extend your lead" : `The three waves to DR ${proj.dr12 ?? 25}`}</h3>
          <Card style={{ marginTop: 10 }}><h4><span style={{ color: C.rust }}>Wave 1.</span> Citations · months 1 to 2</h4><p className="small">Consistent NAP across the trusted directories for your market.</p></Card>
          <Card style={{ marginTop: 8 }}><h4><span style={{ color: C.rust }}>Wave 2.</span> Earned links · months 2 to 4</h4><p className="small">A free cost calculator, an annual industry report, a white-label template firms cite and share.</p></Card>
          <Card style={{ marginTop: 8 }}><h4><span style={{ color: C.rust }}>Wave 3.</span> Close the leader gap · ongoing</h4><p className="small">Trade publications and partner directories that link to rivals but not yet to you.</p></Card>
        </div>
      </Split>
      <p className="small" style={{ marginTop: 12, color: C.muted, fontSize: 10.5, lineHeight: 1.5 }}>
        {(dr != null || rd != null)
          ? <><b style={{ color: C.inkSoft }}>Domains now ({dash(rd)}) and DR {dash(dr)}</b> are measured today (Moz and DataForSEO). The <b style={{ color: C.inkSoft }}>12-month target</b> is a modelled projection that assumes the citation and earned-link plan runs. It is not a guarantee.</>
          : <>Domain Rating and referring domains were not returned by the provider for this run, so only the <b style={{ color: C.inkSoft }}>modelled 12-month target</b> is shown. It assumes the citation and earned-link plan runs, and is not a guarantee.</>}
      </p>
    </Slide>
  );

  /* 21 · Who does what */
  // Prefer the RICH priority_action_plan ({description, why, priority, channel, tier});
  // fall back to roadmap string actions (no description) keyed by phase duration.
  const planTiers = Array.isArray(df.priority_action_plan) ? df.priority_action_plan : [];
  const actionRows = (planTiers.length
    ? planTiers.flatMap((t) => (t.actions || []).map((a) => ({ title: a.description, desc: a.why, priority: a.priority, channel: a.channel, phase: a.tier || t.tier, effort: a.effort })))
    : rm.flatMap((p) => (p.actions || []).map((a) => (typeof a === "string" ? { title: a, desc: "", phase: p.duration } : { ...a, phase: p.timeframe ?? p.duration })))
  ).slice(0, 14);  // item 10 — every diagnosed issue must get a matching fix here (was 6, which
                   // dropped the lower-priority tech fixes like the duplicate-head-tag issue).
  // Slide-23 fix — the fixed-height board clips past ~7 rows, so cap the DISPLAY and carry the rest to
  // the day-by-day plan slide with a "showing X of Y" line (the data keeps all 14 for that slide).
  const _actionCap = 7;
  const prioKind = (p) => (/high|crit/i.test(p || "") ? "high" : /med/i.test(p || "") ? "med" : "low");
  // Reference action-board rows carry a "Days X to Y" timeframe chip, not the work-type
  // name. Map each action's tier/phase (or, failing that, its priority) to a day range.
  // item 9 — the WINDOW must vary row-to-row like effort does, not sit at a constant "Days 1 to 30".
  // Every technical issue funnels into the single Foundation tier, so combine the tier with the row's
  // PRIORITY: a CRITICAL/HIGH foundation fix stays Days 1-30, a MEDIUM cleanup moves to 30-60, LOW to
  // 60-90 — so an all-Foundation board still spreads across windows.
  const phaseDays = (phase, priority) => {
    const p = String(phase || "").toLowerCase();
    const pr = String(priority || "").toLowerCase();
    if (/\bday/.test(p)) return String(phase);
    const m = p.match(/\b(30|60|90|180)\b/);
    if (m) return m[1] === "30" ? "Days 1 to 30" : m[1] === "60" ? "Days 30 to 60" : m[1] === "90" ? "Days 60 to 90" : "Days 90 to 180";
    const urgent = /quick|crit|high/.test(pr);
    if (/found|technical|fix|load|crawl|speed|index|h1|meta|schema/.test(p)) return urgent ? "Days 1 to 30" : /med/.test(pr) ? "Days 30 to 60" : "Days 60 to 90";
    if (/capture|commercial|page|content|on.?page|keyword|build/.test(p)) return "Days 30 to 60";
    if (/author|local|geo|citation|review|gbp|map/.test(p)) return "Days 60 to 90";
    if (/compound|link|pr|scale|press|outreach|listicle/.test(p)) return "Days 90 to 180";
    return urgent ? "Days 1 to 30" : /med/.test(pr) ? "Days 30 to 90" : "Days 90 to 180";
  };
  slides.push(
    <Slide key="actions" variant="cream" n="19" kicker="Who Does What" title="Every move, sorted by the work it takes"
      sub={ds.actions_sub || "Every move tagged by type AND owner, so each one lands on the right desk with a clear name against it."} foot={foot("19 · THE ACTION BOARD")}>
      <Legend items={[
        { color: "#C95322", label: "Content" }, { color: "#3C7D5A", label: "On-Page" }, { color: "#3B6FB2", label: "Lead-Gen" },
        { color: "#8A4FB2", label: "Listicle Outreach" }, { color: "#A07414", label: "PR & Authority" }, { color: "#1A8A8A", label: "Citations" },
      ]} />
      {actionRows.length ? <>{actionRows.slice(0, _actionCap).map((a, i) => (
        <ActionRow key={i} accentClass={accentFor(a.channel || a.title)} title={clamp(a.title, 96)} desc={clamp(a.desc || a.description || "", 128)}
          meta={<>{a.priority ? <Tag kind={prioKind(a.priority)}>{titleCase(a.priority)}</Tag> : null}<span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, margin: "0 8px", whiteSpace: "nowrap" }}>{ownerFor(a.channel || a.title)}</span>{a.effort ? <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: C.rust, marginRight: 8, whiteSpace: "nowrap" }}>{String(a.effort).replace(/^≈\s*/, "~")}</span> : null}<Pill>{phaseDays(a.phase, a.priority)}</Pill></>} />
      ))}{actionRows.length > _actionCap ? <p style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase", color: C.faint, marginTop: 8 }}>Showing the top {_actionCap} of {actionRows.length} moves by priority — the full sequence is scheduled on the day-by-day plan.</p> : null}</> : <GapPanel title="Action board pending">Recommendations populate from the strategy build.</GapPanel>}
    </Slide>
  );

  /* 22 · The 30/60/90/180 plan, color-coded dots */
  // B8 — a health target of 100 is unhittable (no site is error-free) and the deck's own CRITICAL
  // findings contradict it. Cap the modelled 12-month target at 92 (strong, but achievable).
  const shTarget = Math.min(92, (ksRows.find((r) => /health/i.test(r.key || r.metric || ""))?.target_12_months) ?? (Number(health) >= 88 ? 92 : 90));
  const phaseDefs = [
    { badge: "30", duration: "First 30 days", title: "Foundation", mission: "Make the site visible. Pure unblocking, no strategy yet.", goal: { label: "Target", text: `Site health ${dash(health)} → ${shTarget}` } },
    { badge: "60", duration: "Days 31 to 60", title: "Capture", mission: "Take the easy commercial wins rivals leave undefended.", goal: { label: "Do / watch", text: "Do: earn ~25 reviews · Watch: first-page ranking" } },
    { badge: "90", duration: "Days 61 to 90", title: "Authority", mission: "Own the local ground and earn the first AI citations.", goal: { label: "Target", text: "In the local map pack" } },
    { badge: "180", duration: "Days 91 to 180", title: "Compound", mission: "Turn early wins into a widening lead with content and press.", goal: { label: "Target", text: proj.dr12 != null ? `DR ${proj.dr12}, traffic compounding` : "Compounding" } },
  ];
  // item 11 — the plan must not name page slugs that never appear in the keyword/content stages. Build
  // the set of REAL slugs (mapped pages + crawled URLs) and strip any invented multi-word "/slug" the
  // free-text roadmap references, so every page the plan names traces back to the strategy.
  const _realSlugs = new Set();
  for (const p of [...(ca.commercial_pages || []), ...(ca.geography_pages || ca.city_pages || []), ...(ca.blog_and_guides || [])]) {
    const s = lc(p.url_slug || "").replace(/^\/+|\/+$/g, ""); if (s) _realSlugs.add(s);
  }
  for (const cp of (d.websiteCrawl?.pages || [])) { try { const s = new URL(cp.url).pathname.replace(/^\/+|\/+$/g, "").toLowerCase(); if (s) _realSlugs.add(s); } catch { /* ignore */ } }
  // Only scrub PATH-like slugs (slash at a word boundary — preceded by whitespace or start), so inline
  // slash phrases such as "on-page/off-page" or "A/B-testing" are left intact. An invented slug is
  // removed but its leading whitespace is preserved via the captured group.
  // item 11 — validate SINGLE-word slugs too (the old `(?:-…)+` only checked hyphenated slugs, so
  // invented single words like "/foo" slipped through). `*` makes the hyphen optional, so ANY
  // word-boundary "/slug" not in the real (mapped + crawled) set is stripped as invented, while real
  // crawl-derived paths (/branding, /blog, /seo-2) survive. The `(^|\s)` boundary still spares inline
  // slashes like "on-page/off-page" or "A/B".
  const _scrubPlanSlugs = (t) => String(t || "")
    .replace(/(^|\s)\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/gi, (m, pre, slug) => (_realSlugs.has(slug.toLowerCase()) ? m : pre))
    .replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
  slides.push(
    <Slide key="plan" n="20" kicker="The Plan" title="One job per phase. Move on when it's done." foot={foot("20 · THE 30/60/90/180 PLAN")}>
      <PhaseRow>
        {phaseDefs.map((ph, i) => {
          const r = rm[i];
          const items = (r?.actions || []).slice(0, 3).map((a) => { const t = _scrubPlanSlugs(typeof a === "string" ? a : (a.title || a.description || "")); return { text: clamp(t, 54), color: workColor(t) }; });
          return <PhaseCol key={i} badge={ph.badge} duration={r?.duration || ph.duration} title={r?.title || ph.title}
            mission={ph.mission} items={items.length ? items : [{ text: "N/A" }]} goal={ph.goal} />;
        })}
      </PhaseRow>
    </Slide>
  );

  /* 23 · How we prove it */
  const kpiRow = (k) => ksRows.find((r) => r.key === k || lc(r.metric).includes(k.replace("_", " ")));
  // item 3a — the Domain Rating target must be ONE modelled value across the deck. Slides 02, 18 and 20
  // all drive DR off proj.dr12 (the capped-60 model); the KPI board used a different formula
  // (min(100, DR+30) → 82) and disagreed. Reconcile the board's DR target to proj.dr12 so every slide
  // shows the same modelled DR.
  const _drKpi = kpiRow("domain_rating");
  const _drRow = _drKpi && proj.dr12 != null ? { ..._drKpi, target_12_months: proj.dr12, target_6_months: proj.dr6 ?? _drKpi.target_6_months } : _drKpi;
  // B6 — the keywords-ranking target must reconcile with the plan. A plan that builds N commercial/local
  // pages against the mapped terms cannot honestly target "1-2" ranking keywords. Floor the 12-month
  // target at baseline + the pages the plan actually builds (each targets at least one head term).
  const _kwKpi = kpiRow("organic_keywords");
  const _kwPagesPlanned = (ca.commercial_pages || []).length + (ca.geography_pages || ca.city_pages || []).length;
  const _kwRow = (() => {
    if (!_kwKpi || _kwPagesPlanned <= 0) return _kwKpi;
    const _base = Number(_kwKpi.baseline ?? _kwKpi.now) || 0;
    const _rawT = Number(_kwKpi.target_12_months ?? _kwKpi.target_6_months ?? _kwKpi.s12 ?? _kwKpi.s6) || 0;
    return { ..._kwKpi, target_12_months: Math.max(_rawT, _base + _kwPagesPlanned) };
  })();
  // B3 — the scoreboard organic-traffic point must sit inside the outcome slide's modelled RANGE.
  // Reconcile the board target to proj.t12/t6 (the same model the outcome ranges are drawn from),
  // exactly as the DR row is reconciled to proj.dr12, so the two slides can never diverge.
  const _trafKpi = kpiRow("organic_traffic");
  const _trafRow = _trafKpi && proj.t12 != null
    ? { ..._trafKpi, target_12_months: Math.round(proj.t12), target_6_months: proj.t6 != null ? Math.round(proj.t6) : _trafKpi.target_6_months }
    : _trafKpi;
  // RC1 — a scoreboard row needs a REAL "now" to show a trend. When the provider did not return
  // Domain Rating / referring domains for this run, drop that row rather than render "N/A → N/A".
  const seoBoard = [["Domain Rating", _drRow], ["Organic traffic / month", _trafRow], ["Keywords ranking", _kwRow], ["Referring domains", kpiRow("referring_domains")]]
    .filter(([label, r]) => { if (!/domain rating|referring domains/i.test(label)) return true; const b = r ? (r.baseline ?? r.now) : null; return b != null; });
  slides.push(
    <Slide key="prove" variant="cream" n="21" kicker="How We Prove It" title="Two scoreboards, reported every month"
      sub={ds.prove_sub || "Current is measured today. Targets are rounded estimates that assume the plan is implemented."} foot={foot("21 · MEASURING SUCCESS")}>
      <Split>
        <div className="metric-col">
          <h3 className="mini">Search (SEO)</h3>
          {(() => {
            // Slide-25 false-precision fix — the modelled organic-traffic TARGET renders as a RANGE
            // using the exact same ±15% band as the outcome slide (slide 4), so a range model never
            // shows a 4-sig-fig point estimate here (2,810 → "2.5K to 3K"). Measured "now" stays a point.
            const _rc = (n) => { if (n == null) return null; const step = n >= 5000 ? 1000 : n >= 2000 ? 500 : n >= 500 ? 50 : n >= 100 ? 10 : 5; return Math.round(n / step) * step; };
            const _rng = (n) => { if (n == null) return "N/A"; const lo = _rc(n * 0.85), hi = _rc(n * 1.15); return lo === hi ? `~${fmtNum(_rc(n))}` : `${fmtNum(lo)} to ${fmtNum(hi)}`; };
            const kn = (v) => (v == null ? "N/A" : fmtNum(Math.round(Number(v))));
            return seoBoard.map(([label, r], i) => { const tgt = r ? (r.target_12_months ?? r.target_6_months ?? r.s12 ?? r.s6) : null; const modelled = /organic traffic|keywords ranking/i.test(label); return (<Trend key={i} label={label} now={r ? kn(r.baseline ?? r.now) : "N/A"} target={r ? (modelled ? _rng(tgt) : kn(tgt)) : "N/A"} />); });
          })()}
          <Trend label="Site health score" now={dash(health)} target={dash(shTarget)} />
        </div>
        <div className="metric-col">
          <h3 className="mini">AI answers (GEO) {isIllus ? <Hypo>Illustrative</Hypo> : null}</h3>
          <Trend label="GEO score (0 to 100)" now={_geoScore ?? geo.overall?.geo_score} target="45+" />
          <Trend label="Share of voice vs rivals" now={pctStr(geo.overall?.sov)} target="18%" />
          <Trend label="Mention rate" now={pctStr(geo.overall?.mention_rate)} target="35%" />
          <Trend label="Citation rate" now={pctStr(geo.overall?.citation_rate)} target={`${Math.max(30, Math.ceil((Number(geo.overall?.citation_rate) || 0) + 12))}%`} />
          <Trend label="Engines naming you" now={`${enginesNaming}/${ENGINES_TOTAL}`} target={`${ENGINES_TOTAL}/${ENGINES_TOTAL}`} />
        </div>
      </Split>
      <Callout className="mt2"><b>Every number ties to an action.</b> When a page goes live, you watch its keyword climb on one board and its prompt climb on the other. Progress is never a matter of opinion.</Callout>
    </Slide>
  );

  /* 24 · The honest assessment, Result line per card */
  const priorities = (Array.isArray(ds.priorities) && ds.priorities.filter((p) => p && p.title).length
    ? ds.priorities.filter((p) => p && p.title).slice(0, 3).map((p) => ({ title: p.title, description: p.body, expected_result: p.result }))
    : (sp.length ? sp.slice(0, 3) : tp.slice(0, 3).map((t) => ({ title: t.issue, description: t.why_it_matters || t.recommended_action, expected_result: t.expected_unlock }))));
  slides.push(
    <Slide key="honest" variant="dark" n="22" kicker="The Honest Assessment" title={ds.honest_title || "If you do nothing else, do these three"}
      sub={ds.honest_sub || "In this order. Each one is the highest-leverage move at its stage."} foot={foot("22 · THE HONEST ASSESSMENT")}>
      <Row cols={3} style={{ gap: 18 }}>
        {priorities.map((p, i) => (
          <Card key={i} dark accent title={<><span style={{ color: C.rust, fontFamily: "var(--display)", fontWeight: 700, marginRight: 8 }}>{String(i + 1).padStart(2, "0")}</span>{p.title}</>}>
            <p className="small">{clamp(p.description, 110)}</p>
            {p.expected_result && <p className="small" style={{ color: C.rustSoft, fontWeight: 600, marginTop: 8 }}>Modelled result: {clamp(p.expected_result, 60)}</p>}
          </Card>
        ))}
      </Row>
      {(ds.closing || para(story.what_good_looks_like) || para(story.key_takeaway)) && (
        <Callout className="mt2">{ds.closing ? leadBold(ds.closing) : <><b>The whole story:</b> {clamp(para(story.what_good_looks_like) || para(story.key_takeaway), 220)}</>}</Callout>
      )}
    </Slide>
  );

  /* 25 · Competitive field & next steps — REAL competitor brands (business + API), 4 steps + CTA */
  // item 12a — the closing brand wall must show REAL brands, never a fabricated "clients" list. Build it
  // from the BUSINESS + API-analysis competitors (the benchmark set `comps`, which EXCLUDES search
  // competitors) plus the AI-named brands from the GEO share of voice (topic noise already filtered).
  // If no real brands surfaced, the wall is hidden rather than showing invented names.
  const _cleanBrand = (c) => {
    let n = String(c?.name || "").trim();
    if (!n && c?.domain) n = titleCase(String(c.domain).replace(/^www\./, "").replace(/\.(com|co\.uk|io|net|org|in|us|ai|digital)$/i, "").split(".")[0].replace(/-/g, " "));
    return n;
  };
  const _wallBrands = (() => {
    const seen = new Set(); const out = [];
    const add = (nm) => { const n = String(nm || "").trim(); if (!n) return;
      const k = lc(n).replace(/\s+(pvt|private|ltd|limited|llp|inc|llc|global|services?|digital|media|marketing|agency|technologies?)\b/g, "").replace(/[^a-z0-9]/g, "");
      if (!k || k.length < 2) return;
      // §12 dedupe incl. containment: "webchutney" (from SoV) is the same rival as "Dentsu Webchutney"
      // (from comps) — one normalized key is a substring of the other. Keep the first (fuller) name, drop the dup.
      for (const s of seen) { if (s === k || (Math.min(s.length, k.length) >= 6 && (s.includes(k) || k.includes(s)))) return; }
      seen.add(k); out.push(n); };
    for (const c of comps) add(_cleanBrand(c));                        // business + API competitors (not search)
    for (const b of (sov || [])) if (b && !b.is_client) add(b.brand);  // real AI-named brands from GEO SoV
    return out.slice(0, 12);
  })();
  const _hasWall = _wallBrands.length >= 4;
  slides.push(
    <Slide key="close" variant="dark" n={null} kicker={_hasWall ? "The Competitive Field" : "Ready When You Are"} title={_hasWall ? "The brands competing for your market" : `Let's make ${name} visible`} contentTop foot={{ left: "DOCTOR FIZZ · doctorfizz.com", mid: `Confidential, data as of ${_asOf}`, pg: pg() }}>
      {_hasWall ? <CLGrid names={_wallBrands} /> : null}
      <div className="close-band">
        <div className="close-steps">
          <div className="eyebrow-sm" style={{ marginBottom: 12 }}>Four steps to launch</div>
          <div className="steps">
            {[["01", "Discovery Call", "30-minute session to align on goals."], ["02", "Full Audit", "Deep technical and content audit."], ["03", "Strategy Build", "Custom 30-day quick-launch plan."], ["04", "Execute & Report", "Monthly delivery and reporting."]].map((s, i) => (
              <div key={i} className="step"><div className="no">{s[0]}</div><h4>{s[1]}</h4><p>{s[2]}</p></div>
            ))}
          </div>
        </div>
        <div className="close-cta">
          <div className="cc-line">Ready to make {name} visible?</div>
          <div className="cta-btn">Book Your Discovery Call →</div>
        </div>
      </div>
    </Slide>
  );

  return (
    <div id="report-content" className="df-deck">
      <DeckStyle />
      <DeckAutoFit />
      {slides}
    </div>
  );
}
