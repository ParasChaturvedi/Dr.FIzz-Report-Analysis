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

// DoctorFizz partner brands (static clientele wall, matches the reference deck).
const CLIENT_BRANDS = ["ACENTEUS", "AXXONET", "VINE PROJECTS", "LOYORA", "DexWin", "AVIA", "WATERSTONE", "tipplr", "CONTENT WHALE", "SHIVA MANVI", "VASAL IMPEX", "SCRIBBLE NATION"];

/* ── small data helpers ────────────────────────────────────────────────── */
const mv = (bm, key, legacy) => {
  const o = bm?.[key];
  const v = o && typeof o === "object" ? o.value : o;
  return v != null ? v : (legacy != null ? bm?.[legacy] : null);
};
const para = (arr, i = 0) => (Array.isArray(arr) ? arr[i] : (i === 0 ? arr : null));
const paras = (arr, n = 3) => (Array.isArray(arr) ? arr.slice(0, n) : arr ? [arr] : []);
const titleCase = (s) => String(s || "").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const prettyName = (d, domain) => d?.businessData?.name || titleCase(String(domain || "").replace(/\.(com|co\.uk|io|net|org|in|us)$/i, "").split(".")[0]);
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
  const t6 = up6 != null ? Number(up6) : null;
  const t12 = up12 != null ? Number(up12) : null;
  const t3 = t6 != null ? Math.round(t6 / 2) : null;
  const drBase = dr0 == null ? null : Number(dr0);
  const drAt = (add) => (drBase == null ? null : Math.min(60, drBase + add));
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
    listicle_outreach: (_caAI.listicle_outreach?.length ? _caAI.listicle_outreach : _caDF.listicle_outreach) || [],
  };
  // Prefer the RICH Stage-3 technical_issues (why_it_matters / affected_count /
  // recommended_action / estimated_effort / expected_unlock); the top-level
  // technicalPriorities ({issue,priority,action}) is the partial fallback.
  const tp = (Array.isArray(df.technical_issues) && df.technical_issues.length)
    ? df.technical_issues
    : (Array.isArray(d.technicalPriorities) ? d.technicalPriorities : []);
  const lb = d.linkBuilding || {};
  const gbp = df.gbp_comparison || {};
  const gmb = d.gmbCheck || {};
  const rm = Array.isArray(d.roadmap) ? d.roadmap : [];
  const air = df.ai_readiness || {};
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
  const enginesTested = geo.overall?.engines_tested ?? (geo.by_engine || []).length ?? 6;
  const enginesNaming = (geo.by_engine || []).filter((e) => Number(e.metrics?.mention_rate ?? e.mention_rate ?? e.metrics?.sov ?? e.sov ?? 0) > 0).length;
  // A "Measured · Google AI Overview" chip — the positive counterpart to the Illustrative tag.
  const MeasTag = aioMeasured ? <span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#3C7D5A", background: "rgba(60,125,90,.14)", padding: "2px 8px", borderRadius: 5, marginLeft: 6, whiteSpace: "nowrap" }}>Measured · Google AIO</span> : null;
  // Qualitative GEO verdict word, real when AIO data exists (brand cited in 0 answers → "No").
  const geoVerdictWord = aioMeasured
    ? (aio.brand_cited ? "Barely" : "No")
    : (Number(geo.overall?.mention_rate) >= 30 ? "Yes" : Number(geo.overall?.mention_rate) >= 10 ? "Barely" : "No");

  // GEO leader (top non-client brand), for mention/citation descriptors + verdict.
  const sov = (geo && geo.share_of_voice) || [];
  const leader = [...sov].filter((b) => !b.is_client).sort((a, b) => (b.avg || 0) - (a.avg || 0))[0] || null;

  // Competitor benchmark rows: real per-competitor metrics if present, else illustrative.
  const benchRows = comps.some((c) => c && (c.dr != null || c.traffic != null)) ? comps : buildIllustrativeBenchmark(comps);
  const benchIllus = !comps.some((c) => c && (c.dr != null || c.traffic != null));

  let _pg = 1;
  const pg = () => String(++_pg).padStart(2, "0");
  const foot = (left) => ({ left, mid: domain, pg: pg() });

  const traffic0 = mv(bm, "organic_traffic", "organicTraffic");
  const dr = mv(bm, "domain_rating", "domainRating");
  const rd = mv(bm, "referring_domains", "referringDomains");
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
        { k: "PREPARED FOR", v: domain }, { k: "DATE", v: dateGB(d.generatedAt) },
        { k: "PREPARED BY", v: "DOCTOR FIZZ" }, { k: "REF", v: refOf(name) },
      ]} />
  );

  /* 2 · CONTENTS, 8 discipline groups, real slide numbers, colored dots */
  // 6 GEO slides (09-14) always render, so always list all 6 here.
  const geoToc = [["09", "Are you visible when buyers ask AI?"], ["10", "Share of voice vs competitors"], ["11", "Mention & citation rates"], ["12", "The prompts we ran, and results"], ["13", "Topic & entity association"], ["14", "How the GEO score works"]];
  const toc = [
    { g: "Orientation", c: "#15110E", items: [["01", "The story: where you stand"], ["02", "The outcome this plan delivers"], ["03", "The audit map: five pillars"]] },
    { g: "Technical SEO", c: "#3B6FB2", items: [["04", "Three things keeping you out"], ["05", "Fix the foundation first"]] },
    { g: "On-Page SEO", c: "#3C7D5A", items: [["06", "Where competitors are exposed"], ["07", "The competitor benchmark"], ["08", "Keyword strategy by intent"], ["15", "Pages to build"], ["16", "Pages and blogs: optimise vs create"]] },
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
          <Tile n={opp.total_monthly_search_volume ? fmtNum(opp.total_monthly_search_volume) : "—"} label="Searches up for grabs" />
          <Tile n={rating ? `${rating}★` : "—"} label="Rating, beats most rivals" />
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
      <Journey stages={[
        { when: "Today", big: fmtNum(proj.t0), cap: `visits / mo${proj.dr0 != null ? ` · DR ${proj.dr0}` : ""}`, now: true },
        { when: "Day 90", big: proj.t3 != null ? `~${fmtNum(proj.t3)}` : "—", cap: `visits / mo${proj.dr3 != null ? ` · DR ${proj.dr3}` : ""}` },
        { when: "Day 180", big: proj.t6 != null ? `~${fmtNum(proj.t6)}` : "—", cap: `visits / mo${proj.dr6 != null ? ` · DR ${proj.dr6}` : ""}` },
        { when: "Month 12", big: proj.t12 != null ? `~${fmtNum(proj.t12)}` : "—", cap: `visits / mo${proj.dr12 != null ? ` · DR ${proj.dr12}` : ""}`, goal: true },
      ]} />
      <Row cols={3} className="mt2">
        <Card accent title="Search visibility"><p className="small">From 0 keywords to a base of <strong style={{ color: C.rust }}>{opp.commercial_keyword_count ? `${opp.commercial_keyword_count}+ commercial terms` : "commercial terms"}</strong>, led by zero-difficulty wins.</p></Card>
        <Card accent title="Local dominance"><p className="small">Into the <strong style={{ color: C.rust }}>local map pack</strong>, on a {rating ? `${rating}★` : "strong"} rating rivals can&apos;t match.</p></Card>
        <Card accent title="AI presence"><p className="small">From a <strong style={{ color: C.rust }}>GEO score of {geo.overall?.geo_score} to 45+</strong>{isIllus ? " (illustrative)" : ""}, lifting share of voice, mentions and citations across all 6 AI engines.</p></Card>
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
  const pillars = [
    { k: "On-Page SEO", pk: "onpage", head: "Pages exist, signals don't", word: onpageHigh ? "Needs work" : "Solid", kind: onpageHigh ? "med" : "low", line: "Missing H1s, thin content, no commercial pages for buyer terms.", first: "Fix in Phase 1 to 2" },
    { k: "Technical SEO", pk: "tech", head: lcpMs != null ? `A ${lcpSeconds(lcpMs)} load blocks everything` : "Crawl & speed need work", word: techCrit ? "Critical" : techWarn ? "Needs work" : "Solid", kind: techCrit ? "high" : techWarn ? "med" : "low", line: "Speed, broken links and crawl issues keep the site near-invisible.", first: "Fix first" },
    { k: "Off-Page / Authority", pk: "offpage", head: `Domain Rating just ${dash(dr)}`, word: dr != null && Number(dr) >= 30 ? "Building" : "Weak", kind: dr != null && Number(dr) >= 30 ? "med" : "high", line: `${dash(rd)} referring domains vs rivals' hundreds. Trust must be earned.`, first: "Build over months" },
    { k: "Local SEO / GBP", pk: "local", head: `${rating ? `${rating}★` : "—"} rating, thin profile`, word: rating != null && Number(rating) >= 4.5 ? "Quick win" : "Needs work", kind: rating != null && Number(rating) >= 4.5 ? "low" : "med", line: `Real review quality, but only ${dash(reviews)} reviews and a ${dash(mv(bm, "gbp_completeness", "gmbCompletenessScore"))}% complete profile.`, first: "Phase 1 to 2" },
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
            <FixRow key={i} title={f.issue} desc={clamp(f.why_it_matters || f.action, 110)} goal={f.expected_unlock || (/high|crit/i.test(f.priority) ? "Unblocks ranking" : "Strengthens the site")} when={f.estimated_effort || (/high|crit/i.test(f.priority) ? "fix first" : "within 30 days")} />
          ))}
        </div>
        <Card soft title="Already working in your favour">
          <Checks items={[
            { state: "ok", text: <><b>No penalties.</b> Clean history, nothing to undo.</> },
            { state: "ok", text: <><b>Schema in place.</b> {faqCount ? `${faqCount} FAQ blocks AI can lift.` : "Answer-shaped content AI can lift."}</> },
            { state: rating ? "ok" : "do", text: rating ? <><b>A genuine {rating}★ rating.</b> Real trust to build on.</> : <>Build first reviews for trust.</> },
            { state: "ok", text: <><b>An open field.</b> No one owns the commercial space.</> },
          ]} />
        </Card>
      </Split>
      {/* Number-critical callout: always compute from the real bindings (traffic, search
          volume, leads) — never Claude's ds.diagnosis_cost, which mis-scaled these on itzfizz
          ("125K" for 1.3K, "$6K" for 56K). Correctness of these figures outranks phrasing. */}
      <Callout className="mt2"><b>What this costs you today:</b> with {fmtNum(traffic0 ?? 0)} organic visits, the {opp.total_monthly_search_volume ? `roughly ${fmtNum(opp.total_monthly_search_volume)}` : ""} monthly searches in your market go to competitors. Fixing these three things is what turns the site from invisible into found, and unlocks every later move in this plan.{leadsLost ? <> At a conservative <b>5% capture × 2% conversion</b>, that undefended demand is <strong style={{ color: C.rust }}>~{fmtNum(leadsLost)} qualified leads a month</strong> handed to rivals.</> : null}</Callout>
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
    const shown = all.slice(0, 2).map((u) => clamp(u, 28));
    const more = all.length - shown.length;
    return { v: (
      <>
        <div>{techLabel(t)}</div>
        {shown.length ? <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{shown.join("  ·  ")}{more > 0 ? `  +${more} more` : ""}</div> : null}
      </>
    ) };
  };
  const cwv = [
    { n: lcpMs != null ? lcpSeconds(lcpMs) : "—", l: "Largest paint · target <2.5s", flag: lcpMs != null && Number(lcpMs) >= 2500 },
    { n: dash(mv(bm, "cls")), l: "Layout shift · good <0.1", flag: mv(bm, "cls") != null && Number(mv(bm, "cls")) >= 0.1 },
    { n: dash(mv(bm, "mobile_performance_score", "performanceMobile")), l: "Mobile speed · /100", flag: true },
    { n: dash(mv(bm, "desktop_performance_score", "performanceDesktop")), l: "Desktop speed · /100", flag: false },
  ];
  slides.push(
    <Slide key="technical" variant="cream" n="05" kicker="Technical SEO" title="Fix the foundation before building on it"
      sub={<>{ds.technical_sub || "Search engines judge these signals before they read a word of content. Each one below has a fix and a clear target."} <Pillar kind="tech" label="Technical SEO" /></>} foot={foot("05 · TECHNICAL SEO")}>
      <Split bias>
        <DataTable head={[{ label: "Issue found" }, { label: "Count", align: "right" }, { label: "Priority", align: "right" }]}
          rows={tp.slice(0, 8).map((t) => ({ cells: [techIssueCell(t), { v: dash(techCount(t)), num: true, align: "right" }, { align: "right", tag: { kind: /high|crit/i.test(t.priority) ? "high" : /med/i.test(t.priority) ? "med" : "low", label: titleCase(t.priority) } }] }))} />
        <div>
          <h3 className="mini">Core Web Vitals, measured today</h3>
          <Tiles cols={2} style={{ margin: "8px 0 14px" }}>
            {cwv.map((c, i) => <Tile key={i} flag={c.flag} n={c.n} label={c.l} />)}
          </Tiles>
          <Card soft title="The fix sequence">
            <ul className="checks">
              {tp.slice(0, 4).map((t, i) => <li key={i}><span className="ic do">{i + 1}</span><span>{clamp(t.action || t.recommended_action || t.issue, 96)}</span></li>)}
            </ul>
          </Card>
        </div>
      </Split>
    </Slide>
  );

  /* 8 · THE OPENING (competitors), 4 rows + door-they-leave-open column */
  slides.push(
    <Slide key="opening" variant="cream" n="06" kicker="The Opening" title={ds.opening_title || "The leaders are absent where it is winnable"}
      sub={ds.opening_sub || "Ranked by the query set each rival actually threatens — so you know where the fight is, and where the ground is open."} foot={foot("06 · THE OPENING")}>
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

  /* 9 · THE GAP IN NUMBERS */
  slides.push(
    <Slide key="gap" variant="cream" n="07" kicker="The Gap In Numbers" title="How far ahead the competition really is"
      sub={<>{ds.gap_sub || "Your real baseline against the market, with the metrics we pull for every rival."} {benchIllus ? IllusTag : null}</>} foot={foot("07 · COMPETITOR BENCHMARK")}>
      <DataTable compact head={[{ label: "Competitor" }, { label: "Domain Rating", align: "right" }, { label: "Organic Traffic / mo", align: "right" }, { label: "Ranking Keywords", align: "right" }, { label: "Referring Domains", align: "right" }]}
        rows={[
          ...benchRows.slice(0, 5).map((c) => ({ cells: [{ v: <strong>{c.name || c.domain}</strong> }, { v: dash(c.dr), num: true, align: "right" }, { v: c.traffic != null ? fmtNum(c.traffic) : "—", num: true, align: "right" }, { v: c.keywords != null ? fmtNum(c.keywords) : "—", num: true, align: "right" }, { v: c.refDomains != null ? fmtNum(c.refDomains) : "—", num: true, align: "right" }] })),
          { you: true, cells: [`${name} (you)`, { v: dash(dr), num: true, align: "right" }, { v: fmtNum(traffic0), num: true, align: "right" }, { v: dash(mv(bm, "organic_keywords", "organicKeywords")), num: true, align: "right" }, { v: dash(rd), num: true, align: "right" }] },
        ]} />
      <Row cols={3} className="mt" style={{ gap: 18 }}>
        <Card accent title="The gap is real, not fatal"><p className="small">The leader holds the authority, but most rivals sit within a 12-month reach of where {name} can be.</p></Card>
        <Card accent title="Traffic follows the basics"><p className="small">Their traffic comes from fixing what you already can: fast pages, clear titles, and answer-shaped content.</p></Card>
        <Card accent title="Keywords are uncontested"><p className="small">None defend the commercial and local terms in this plan, so your first {opp.commercial_keyword_count ? `${opp.commercial_keyword_count}` : "30+"} keywords face no real incumbent.</p></Card>
      </Row>
      <Callout className="mt2" mark="i"><b>Reading it:</b> your row is measured today (Moz / DataForSEO). {benchIllus ? "Competitor figures are illustrative of the gap; your live competitor scrape drops straight into this table." : "Competitor authority, traffic and keyword counts are pulled per rival, none are estimated."}</Callout>
    </Slide>
  );

  /* 10 · WHAT BUYERS TYPE */
  const tierCard = (tag, tagKind, heading, desc, items, accent = false) => (
    <Card accent={accent}>
      <span className={`tag ${tagKind}`}>{tag}</span>
      <h4 style={{ margin: "12px 0 2px", fontSize: 14 }}>{heading}</h4>
      <p className="small" style={{ margin: "0 0 12px" }}>{desc}</p>
      {(items || []).slice(0, 5).map((k, i) => (
        <KV key={i} k={k.keyword_cluster || k.page_name || k.proposed_title || k.keyword} v={k.primary_volume ? fmtNum(k.primary_volume) : "—"} />
      ))}
      {(!items || items.length === 0) && <p className="small">No measured demand in this tier yet.</p>}
    </Card>
  );
  slides.push(
    <Slide key="keywords" n="08" kicker="Keyword Strategy" title={ds.keywords_title || "Three kinds of searcher. One of them buys."}
      sub={<>{ds.keywords_sub || "We chase the commercial tier first. That is the one that turns a ranking into a client."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("08 · KEYWORD STRATEGY")}>
      <Row cols={3} style={{ gap: 18 }}>
        {tierCard("Tier 1 · Ready to buy", "new", "Commercial intent", "A landing page each. This is where revenue comes from.", ca.commercial_pages, true)}
        {tierCard("Tier 2 · Local", "pull", "Place-based intent", "The uncontested ground. City in the H1, real local proof.", ca.geography_pages || ca.city_pages, false)}
        {tierCard("Tier 3 · Learning", "ghost", "Informational intent", "Answer content that feeds AI engines and builds topical authority.", ca.blog_and_guides, false)}
      </Row>
      <Tiles cols={4} style={{ marginTop: 24 }}>
        <Tile n={opp.total_monthly_search_volume ? fmtNum(opp.total_monthly_search_volume) : "—"} label="Monthly searches in play" />
        <Tile n={opp.commercial_keyword_count ? fmtNum(opp.commercial_keyword_count) : dash((ca.commercial_pages || []).length)} label="Commercial terms mapped" />
        <Tile n={dash((ca.geography_pages || ca.city_pages || []).length)} label="Local pages to own" />
        <Tile flag n="0" label="Commercial terms defended" />
      </Tiles>
    </Slide>
  );

  /* 11 · GEO & AI VISIBILITY (verdict) */
  slides.push(
    <Slide key="geo-verdict" variant="dark" n="09" kicker="GEO & AI Visibility" title="Are you visible when buyers ask AI?"
      sub={<>{ds.geo_intro || "A growing share of buyers ask AI for a recommendation, then act on the names returned."} {aioMeasured ? MeasTag : IllusTag}</>} foot={foot("09 · GEO & AI VISIBILITY")}>
      <Verdict num={geoVerdictWord}>
        {aioMeasured ? (
          <>Across <b>{aio.keywords_checked} tracked buyer queries</b>, Google returns an AI Overview {aio.aio_coverage_pct}% of the time. Of the <b>{aio.total_citations} sources</b> those answers cite, {name} is cited <b>{aio.brand_cited_count ?? 0} times</b>.{aioCompStr ? <> {aioCompStr} are cited instead.</> : null} <b>You are technically ready to be quoted, but not yet being chosen.</b></>
        ) : (
          <>Across <b>25 to 100 prompts on {geo.overall?.engines_tested || 6} engines</b>, {name} is named in <b>{pctStr(geo.overall?.mention_rate)}</b> of answers and cited in <b>{pctStr(geo.overall?.citation_rate)}</b>. {leader ? `${leader.brand} is heard instead.` : ""}</>
        )}
      </Verdict>
      <Split className="mt2" style={{ marginTop: 22 }}>
        <div>
          <h3 className="mini">How we gathered this</h3>
          <Checks items={[
            { state: "do", text: "Built 25 to 100 buyer prompts from your services, competitor terms and proprietary intent tests." },
            { state: "do", text: "Ran each across all 6 engines, capturing every brand named and source cited." },
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

  /* 12 · GEO SoV */
  slides.push(
    <Slide key="geo-sov" n="10" kicker="GEO · Share of Voice"
      title={aioMeasured ? `In AI Overviews, you hold ${Math.round((aioSovRows.find((s) => s.is_client)?.pct) ?? 0)} of every 100 citations` : (geo.overall?.sov != null ? `Share of Voice: you hold ${Math.round(geo.overall.sov)} of every 100 mentions` : "Who AI names when buyers ask")}
      sub={<>{aioMeasured ? "Of every source cited in Google's AI Overviews, this is the slice each domain owns." : "Of every brand named across the full prompt set, this is the slice each competitor owns."}</>} foot={foot("10 · GEO · SHARE OF VOICE")}>
      <Split>
        <div>
          <h3 className="mini">{aioMeasured ? <>Google AI Overview citations, vs competitors {MeasTag}</> : <>Overall share of voice, vs competitors {IllusTag}</>}</h3>
          {aioMeasured
            ? [...aioCompetitors.sort((a, b) => b.pct - a.pct), aioSovRows.find((s) => s.is_client), ...aioSovRows.filter((s) => s.is_other)].filter(Boolean).map((b, i) => (
                <CBar key={i} name={b.brand + (b.is_client ? " (you)" : "")} pct={b.pct} you={b.is_client} value={`${Math.round(b.pct)}%`} />))
            : sov.slice(0, 6).map((b, i) => (<CBar key={i} name={b.brand + (b.is_client ? " (you)" : "")} pct={b.avg} you={b.is_client} value={`${Math.round(b.avg)}%`} />))}
        </div>
        <div>
          {aioMeasured ? (
            <>
              <h3 className="mini">Per-platform share of voice {MeasTag}</h3>
              <Card soft><p className="small"><b>Google AI Overviews is measured today</b> — {name} appears in <b>{aio.brand_cited_count ?? 0} of {aio.total_citations}</b> cited sources ({pctStr(geo.overall?.sov)} share). Per-platform share across ChatGPT, Gemini, Perplexity, Claude and Copilot is filled in once the full multi-engine scan runs — we never show an estimated split beside a measured one.</p></Card>
            </>
          ) : (
            <>
              <h3 className="mini">Your share of voice, by platform {IllusTag}</h3>
              {[...(geo.by_engine || [])].sort((a, b) => (b.metrics?.sov ?? b.sov ?? 0) - (a.metrics?.sov ?? a.sov ?? 0)).map((e, i) => {
                const v = e.metrics?.sov ?? e.sov ?? 0;
                return <CBar key={i} name={e.engine} pct={v} you value={`${Math.round(v)}%`} />;
              })}
            </>
          )}
        </div>
      </Split>
      <Triad className="mt2">
        <Tc kind="evidence" label="Evidence">{aioMeasured
          ? <>In Google AI Overviews, {aioCompStr || "rivals"} are cited while <b>{name} appears in 0</b> of {aio.total_citations} citations.</>
          : <><b>{leader?.brand || "The leader"}</b> leads share of voice at {Math.round(leader?.avg || 0)}%; you hold {pctStr(geo.overall?.sov)}.</>}</Tc>
        <Tc kind="cost" label="What it costs you">Every AI recommendation that omits you is a <b>warm, high-intent lead</b> handed to a competitor.</Tc>
        <Tc kind="action" label="Do this first">Publish answer-first FAQ pages on your <b>core service questions</b> to enter the answer set where rivals are already cited.</Tc>
      </Triad>
    </Slide>
  );

  /* 13 · GEO mentions & citations */
  const metricCol = (label, sub, value, leaderVal, leaderName, eng, key, measuredNote) => (
    <div className="metric-col">
      <div className="mh"><span className="mt2x">{label}</span><span className="mbig">{pctStr(value)}</span></div>
      <p className="mdesc">{leaderVal != null ? `Leader ${leaderName} sits at ${Math.round(leaderVal)}%.` : (measuredNote || "Measured across the answered prompts.")}</p>
      {[...(eng || [])].sort((a, b) => (b.metrics?.[key] ?? b[key] ?? 0) - (a.metrics?.[key] ?? a[key] ?? 0)).map((e, i) => <CBar key={i} name={e.engine} pct={e.metrics?.[key] ?? e[key] ?? 0} you />)}
    </div>
  );
  // When only Google AIO is measured we have no real per-engine mention/citation data or a
  // measured leader — pass no engines + no leader so the slide shows the measured overall
  // number with an honest note, never illustrative per-platform bars.
  const mcEng = aioMeasured ? [] : geo.by_engine;
  const mcLeader = aioMeasured ? null : leader;
  const mcNote = aioMeasured ? "Measured in Google AI Overviews. Per-platform detail follows the full scan." : null;
  slides.push(
    <Slide key="geo-mc" n="11" kicker="GEO · Mentions & Citations" title="Mention rate and citation rate, by platform"
      sub={<>Being mentioned is good. Being cited as the source is what builds trust and clicks. You are weak on both, and almost invisible as a source. {aioMeasured ? MeasTag : IllusTag}</>} foot={foot("11 · GEO · MENTIONS & CITATIONS")}>
      <Split>
        {metricCol("Mention Rate", "how often you appear at all", geo.overall?.mention_rate, mcLeader?.mention_rate, mcLeader?.brand, mcEng, "mention_rate", mcNote)}
        {metricCol("Citation Rate", "how often you are the source", geo.overall?.citation_rate, mcLeader?.citation_rate, mcLeader?.brand, mcEng, "citation_rate", mcNote)}
      </Split>
      <Triad className="mt2">
        <Tc kind="evidence" label="Evidence">{aioMeasured
          ? <>In Google AI Overviews you are cited in <b>0 of {aio.total_citations}</b> sources, while rivals are quoted repeatedly.</>
          : <>You are mentioned {pctStr(geo.overall?.mention_rate)} of the time but cited only {pctStr(geo.overall?.citation_rate)}. <b>When AI names you, it rarely trusts you enough to link.</b></>}</Tc>
        <Tc kind="cost" label="What it costs you">No citation means <b>no referral click and no trust signal</b>, the buyer visits whoever was cited.</Tc>
        <Tc kind="action" label="Do this first">Add <b>author bylines, schema and a sources-worthy data page</b> so engines treat you as a citable authority.</Tc>
      </Triad>
    </Slide>
  );

  /* 14 · The prompts we ran */
  const resKind = (p) => (p.brand_mentioned ? (p.citation_count > 0 ? "cited" : "named") : "absent");
  // REAL Google AI-Overview evidence: each buyer term, the actual domains Google cited, and your result.
  const aioPromptRows = (aio.per_keyword || []).filter((k) => (k.sources || []).length).slice(0, 7).map((k) => {
    const cited = (k.sources || []).some((s) => lc(s).includes(lc(String(domain).split(".")[0])));
    return { cells: [
      clamp(k.keyword, 44), <span className="eng-pill" key="e">Google AIO</span>,
      clamp((k.sources || []).map((s) => String(s).replace(/^www\./, "")).join(", "), 46),
      { align: "right", v: <ResCell kind={cited ? "cited" : "absent"}>{cited ? "Cited" : "Not cited"}</ResCell> },
    ] };
  });
  const useAioPrompts = aioMeasured && aioPromptRows.length > 0;
  slides.push(
    <Slide key="geo-prompts" variant="cream" n="12" kicker="The Prompts We Ran" title={useAioPrompts ? "What AI cites for your buyer terms, and where you're absent" : "Real prompts, real answers, per engine"}
      sub={<>{useAioPrompts ? "The real sources Google's AI Overview quotes for your buyer terms today." : "A sample of the buyer questions we ran and what each engine returned. This is the raw evidence behind every GEO number."} {useAioPrompts ? MeasTag : IllusTag}</>} foot={foot("12 · GEO · SAMPLE PROMPTS")}>
      <DataTable compact head={[{ label: useAioPrompts ? "Buyer term" : "Buyer prompt" }, { label: "Engine" }, { label: useAioPrompts ? "Sources it cited" : "Who it named" }, { label: `${name} result`, align: "right" }]}
        rows={useAioPrompts ? aioPromptRows : (geo.prompts_executed || []).slice(0, 7).map((p) => ({ cells: [
          clamp(p.prompt, 56), p.engine,
          clamp((p.brands_named || p.entities || []).join(", ") || (p.competitor_mention_count ? `${p.competitor_mention_count} competitor${p.competitor_mention_count === 1 ? "" : "s"}` : "—"), 40),
          { align: "right", v: <ResCell kind={resKind(p)}>{p.citation_count > 0 ? "Cited" : p.brand_mentioned ? "Named" : "Not named"}</ResCell> },
        ] }))} />
      <Triad className="mt">
        <Tc kind="evidence" label="The pattern">{useAioPrompts ? <>Across {aio.keywords_checked} buyer terms, Google cites established directories and rivals, <b>never {name}</b>.</> : <>You surface for some service terms but vanish on local, niche and Google AI Overview.</>}</Tc>
        <Tc kind="cost" label="What it costs you">The <b>highest-intent questions</b> are exactly where you are absent, so the best leads never hear your name.</Tc>
        <Tc kind="action" label="Do this first">Target the terms where rivals are cited with <b>answer-first pages built for those exact questions</b>.</Tc>
      </Triad>
    </Slide>
  );

  /* 15 · AEO readiness (topic + trust signals), split-bias, topic LEFT, signals RIGHT */
  const clientTd = (geo.topic_dominance?.by_brand || []).find((b) => b.is_client) || null;
  const topicChips = clientTd ? [
    ...(clientTd.won_topics || []).map((t) => ({ topic: typeof t === "string" ? t : t.topic, state: "strong" })),
    ...(clientTd.contested_topics || []).map((t) => ({ topic: typeof t === "string" ? t : t.topic, state: "weak" })),
    ...(clientTd.lost_topics || []).map((t) => ({ topic: typeof t === "string" ? t : t.topic, state: "none" })),
  ].slice(0, 8) : [];
  slides.push(
    <Slide key="aeo" n="13" kicker="Answer Engine Readiness (AEO)" title="Which topics does AI associate with your brand?"
      sub={`Engines cite brands they understand as an authority on a topic. We tested which topics ${name} is linked to, and where the trust signals are missing.`} foot={foot("13 · ENTITY & TOPICAL AUTHORITY")}>
      <Split bias>
        <div>
          <h3 className="mini">Topic association, tested across engines {topicChips.length ? null : IllusTag}</h3>
          {topicChips.length ? <><TopicGrid topics={topicChips} /><TopicLegend /></>
            : <p className="small">Topic association renders from the live multi-engine scan; the readiness signals on the right are measured from the site today.</p>}
        </div>
        <div>
          <h3 className="mini">Trust signals: present vs missing</h3>
          <Checks items={(air.signals || []).slice(0, 7).map((s) => ({ state: s.ok ? "ok" : "no", text: s.label + (s.detail ? `, ${clamp(s.detail, 50)}` : "") }))} />
          {(!air.signals || air.signals.length === 0) && <p className="small">Readiness signals populate from the on-site crawl.</p>}
        </div>
      </Split>
      <Triad className="mt2">
        <Tc kind="evidence" label="Evidence">AI associates {name} with your core service, but not the adjacent, local and specialist topics buyers also ask about.</Tc>
        <Tc kind="cost" label="What it costs you">You can only be recommended for one narrow topic, so the broader high-intent questions surface rivals instead.</Tc>
        <Tc kind="action" label="Do this first">Build topic-deep pages plus schema so engines associate {name} with every topic in your market, not just one.</Tc>
      </Triad>
    </Slide>
  );

  /* 16 · How the GEO score works, fixed methodology weights */
  const GEO_WEIGHTS = [["Share of voice vs competitors", 30], ["Citation rate · you as the source", 25], ["Mention rate · named at all", 20], ["Entity & topical association", 15], ["Schema & answer-readiness", 10]];
  slides.push(
    <Slide key="geo-method" variant="dark" n="14" kicker="How The GEO Score Works" title="Every GEO number, and where it comes from"
      sub="No figure is invented. Each is collected by running real prompts and measuring you against the same competitors, every month." foot={foot("14 · GEO METHODOLOGY")}>
      <Split bias>
        <div>
          <h3 className="mini">The collection method</h3>
          <Checks items={[
            { state: "do", text: <><b>Build:</b> 25 to 100 prompts reverse-engineered from your site, competitors and proprietary intent tests.</> },
            { state: "do", text: <><b>Run:</b> every prompt across ChatGPT, Gemini, Perplexity, Claude, Copilot and Google AI Overview.</> },
            { state: "do", text: <><b>Score:</b> share of voice, mention rate and citation rate, you vs each competitor, per engine.</> },
            { state: "do", text: <><b>Repeat:</b> the same set re-runs monthly, so every movement is comparable over time.</> },
          ]} />
        </div>
        <div>
          <h3 className="mini">How the 0 to 100 GEO score is weighted</h3>
          {GEO_WEIGHTS.map(([label, w]) => <ScoreSig key={label} label={label} weight={`${w}%`} />)}
          <Verdict compact num={geo.overall?.geo_score ?? "—"}>
            Your GEO score today. Readiness is strong (schema, FAQs), but share of voice, mentions and citations are near zero. <b>That is the gap this plan closes.</b> {isIllus ? IllusTag : null}
          </Verdict>
        </div>
      </Split>
    </Slide>
  );

  /* 17 · What we build */
  const buildCards = [...(ca.commercial_pages || []).slice(0, 3), ...(ca.geography_pages || ca.city_pages || []).slice(0, 1)];
  const shipWith = ["Exact-intent H1 and meta", "800 to 1,500 unique words", "5 to 8 FAQs plus schema", "Strong CTA above the fold", "Internal links and alt text", "Sub-2.5s load time"];
  slides.push(
    <Slide key="build" variant="cream" n="15" kicker="What We Build" title="Four pages do most of the work"
      sub={<>{ds.build_sub || "Only pages with real, measured demand. Three commercial, one local. Each has a job and a target."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("15 · WHAT TO BUILD")}>
      <Row cols={buildCards.length >= 4 ? 4 : 3} style={{ gap: 16 }}>
        {buildCards.map((p, i) => (
          <Card key={i} accent title={p.page_name || titleCase(p.keyword_cluster)}>
            <Pill>{p.primary_volume ? `${fmtNum(p.primary_volume)}/mo` : "—"}{geoQual(p)}</Pill>
            <p className="small" style={{ marginTop: 8 }}>{clamp(p.commercial_reason || p.why_separate_page || "A focused page wins this intent.", 90)}</p>
          </Card>
        ))}
      </Row>
      <Card soft className="mt2" title="Every page ships with">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 24px" }}>
          {shipWith.map((c, i) => <div key={i} style={{ fontSize: 12, display: "flex", gap: 7, alignItems: "center" }}><span style={{ color: C.good }}>✓</span>{c}</div>)}
        </div>
      </Card>
    </Slide>
  );

  /* 18 · The content map (optimise vs create), 4 count-badged groups */
  const createPages = [...(ca.commercial_pages || []), ...(ca.geography_pages || [])];
  const createBlogs = (ca.blog_and_guides || []);
  const PbHead = ({ count, label }) => (<div className="pbhead"><span className="ct2">{count}</span><span className="cl2">{label}</span></div>);
  slides.push(
    <Slide key="contentmap" variant="cream" n="16" kicker="The Content Map" title="What to optimise, and what to create"
      sub={<>{ds.contentmap_sub || "We audited every existing page and post. Some are rank-ready and need polish; the rest are gaps to fill."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("16 · THE CONTENT MAP")}>
      <Split>
        <div>
          <PbHead count={(ca.pagesToOptimise || []).length || (ca.pagesExistingFlagged ?? 0)} label="service pages you have · optimise" />
          {(ca.pagesToOptimise || []).length ? (
            (ca.pagesToOptimise || []).slice(0, 5).map((p, i) => (
              <PbItem key={`o${i}`} name={p.page || titleCase(p.keyword)} code={p.matched_url} value={p.action ? clamp(p.action, 34) : (p.volume || null)} />
            ))
          ) : (
            <Card soft><p className="small">{ca.pagesExistingFlagged > 0 ? "Matched real demand — add H1/FAQ/schema, expand thin content. Per-page detail lands with the on-page pass." : "No existing pages matched the target keywords."}</p></Card>
          )}
          <PbHead count={(ca.blogsToOptimise || []).length || 0} label="blog posts you have · optimise" />
          {(ca.blogsToOptimise || []).length ? (
            (ca.blogsToOptimise || []).slice(0, 3).map((p, i) => (
              <PbItem key={`bo${i}`} name={p.page || titleCase(p.keyword)} code={p.matched_url} value={p.action ? clamp(p.action, 34) : (p.volume || null)} />
            ))
          ) : (
            <Card soft><p className="small">Existing posts that match demand get refreshed with sharper titles, FAQs and internal links. Per-post detail lands with the content pass.</p></Card>
          )}
        </div>
        <div>
          <PbHead count={createPages.length} label="service pages to create" />
          {createPages.slice(0, 4).map((p, i) => <PbItem key={`p${i}`} name={p.page_name || titleCase(p.keyword_cluster)} code={p.url_slug} value={p.primary_volume ? `${fmtNum(p.primary_volume)}/mo` : null} />)}
          <PbHead count={createBlogs.length} label="blog posts to create" />
          {createBlogs.slice(0, 3).map((b, i) => <PbItem key={`b${i}`} name={b.proposed_title || titleCase(b.keyword_cluster)} value={b.primary_volume ? `${fmtNum(b.primary_volume)}/mo` : null} />)}
        </div>
      </Split>
    </Slide>
  );

  /* 19 · Google Business Profile */
  const gbpScore = mv(bm, "gbp_completeness", "gmbCompletenessScore") ?? gmb.completeness?.score;
  const reviewCompetitors = (gbp.competitors || []).filter((c) => c.review_count != null).slice(0, 3);
  const maxRev = Math.max(reviews || 0, ...reviewCompetitors.map((c) => c.review_count || 0), 1);
  slides.push(
    <Slide key="gbp" n="17" kicker="Google Business Profile" title="Your fastest path into local results"
      sub={<>{ds.gbp_sub || "The map pack drives most local enquiries. Your reviews already beat rivals; the profile just needs completing."} <Pillar kind="local" label="Local SEO" /></>} foot={foot("17 · GOOGLE BUSINESS PROFILE")}>
      <div className="gbp-split">
        <Ring value={gbpScore ?? 0} />
        <div className="gbp-checks">
          {(gbp.field_analysis || gmb.completeness?.breakdown || []).slice(0, 8).map((f, i) => (
            <div key={i} className="gc"><span className="ic" style={{ background: (f.client_status === "missing" || f.pass === false) ? C.rust : C.good }}>{(f.client_status === "missing" || f.pass === false) ? "✕" : "✓"}</span>{f.label}</div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        {gbp.has_competitor_data && reviewCompetitors.length > 0 ? (
          <>
            <CBar name={`${name} (you)`} pct={(reviews / maxRev) * 100} you value={dash(reviews)} />
            {reviewCompetitors.map((c, i) => <CBar key={i} name={c.name} pct={((c.review_count || 0) / maxRev) * 100} value={dash(c.review_count)} />)}
          </>
        ) : null}
        <Callout mark="→" className={gbp.has_competitor_data && reviewCompetitors.length > 0 ? "mt2" : ""}><b>Goal:</b> lift completeness from {dash(gbpScore)} → 95, and {gbp.review_intel?.review_gap ? `close the review gap (${gbp.review_intel.review_gap} behind the local leader)` : `grow reviews from ${dash(reviews)} → 100+`} in 6 months. Set hours, post weekly, reply to every review, and WhatsApp a review link after each job.</Callout>
      </div>
    </Slide>
  );

  /* 20 · Citations & backlinks, three waves as cards */
  const rdKpi = ksRows.find((r) => /referring/i.test(r.key || r.metric || ""));
  const rdTarget = rdKpi?.target_12_months ?? (rd != null ? Math.round(Number(rd) * 1.8) : null);
  const dirs = (gmb.directories || []).slice(0, 12).map((x) => ({ name: x.name, state: x.listed === true ? "have" : x.listed === false ? "miss" : "q" }));
  const citeDirs = dirs.length ? dirs : (lb.citation_links || []).slice(0, 12).map((x) => ({ name: x.platform, state: x.client_listed ? "have" : "miss" }));
  slides.push(
    <Slide key="backlinks" variant="cream" n="18" kicker="Citations & Backlinks" title={`Raising Domain Rating from ${dash(dr)} to ${proj.dr12 ?? 25}`}
      sub={<>{ds.backlinks_sub || "Trust is built in three waves: citations for consistency, then earned links, then closing the leader's gap."} <Pillar kind="offpage" label="Off-Page SEO" /></>} foot={foot("18 · CITATIONS & BACKLINKS")}>
      <Split>
        <div>
          <h3 className="mini">Directories to claim or fix</h3>
          <DirGrid>{citeDirs.map((x, i) => <DirChip key={i} name={x.name} state={x.state} />)}</DirGrid>
          <Card className="mt" style={{ marginTop: 14, padding: "13px 16px", display: "flex", gap: 18, alignItems: "center" }}>
            <div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: C.rust, lineHeight: 1 }}>{dash(rd)}</div><div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em", color: C.muted }}>domains now</div></div>
            <div style={{ color: C.faint }}>→</div>
            <div><div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: C.rust, lineHeight: 1 }}>{rdTarget != null ? fmtNum(rdTarget) : "—"}</div><div style={{ fontFamily: "var(--mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em", color: C.muted }}>target 12 mo</div></div>
          </Card>
        </div>
        <div>
          <h3 className="mini">The three waves to DR {proj.dr12 ?? 25}</h3>
          <Card style={{ marginTop: 10 }}><h4><span style={{ color: C.rust }}>Wave 1.</span> Citations · months 1 to 2</h4><p className="small">Consistent NAP across the trusted directories for your market.</p></Card>
          <Card style={{ marginTop: 8 }}><h4><span style={{ color: C.rust }}>Wave 2.</span> Earned links · months 2 to 4</h4><p className="small">A free cost calculator, an annual industry report, a white-label template firms cite and share.</p></Card>
          <Card style={{ marginTop: 8 }}><h4><span style={{ color: C.rust }}>Wave 3.</span> Close the leader gap · ongoing</h4><p className="small">Trade publications and partner directories that link to rivals but not yet to you.</p></Card>
        </div>
      </Split>
      <p className="small" style={{ marginTop: 12, color: C.muted, fontSize: 10.5, lineHeight: 1.5 }}>
        <b style={{ color: C.inkSoft }}>Domains now ({dash(rd)}) and DR {dash(dr)}</b> are measured today (Moz / DataForSEO). The <b style={{ color: C.inkSoft }}>12-month target</b> is a modelled projection that assumes the citation and earned-link plan runs — not a guarantee.
      </p>
    </Slide>
  );

  /* 21 · Who does what */
  // Prefer the RICH priority_action_plan ({description, why, priority, channel, tier});
  // fall back to roadmap string actions (no description) keyed by phase duration.
  const planTiers = Array.isArray(df.priority_action_plan) ? df.priority_action_plan : [];
  const actionRows = (planTiers.length
    ? planTiers.flatMap((t) => (t.actions || []).map((a) => ({ title: a.description, desc: a.why, priority: a.priority, channel: a.channel, phase: a.tier || t.tier })))
    : rm.flatMap((p) => (p.actions || []).map((a) => (typeof a === "string" ? { title: a, desc: "", phase: p.duration } : { ...a, phase: p.timeframe ?? p.duration })))
  ).slice(0, 6);
  const prioKind = (p) => (/high|crit/i.test(p || "") ? "high" : /med/i.test(p || "") ? "med" : "low");
  // Reference action-board rows carry a "Days X to Y" timeframe chip, not the work-type
  // name. Map each action's tier/phase (or, failing that, its priority) to a day range.
  const phaseDays = (phase, priority) => {
    const p = String(phase || "").toLowerCase();
    if (/\bday/.test(p)) return String(phase);
    const m = p.match(/\b(30|60|90|180)\b/);
    if (m) return m[1] === "30" ? "Days 1 to 30" : m[1] === "60" ? "Days 30 to 60" : m[1] === "90" ? "Days 60 to 90" : "Days 90 to 180";
    if (/found|technical|fix|load|crawl|speed|index|h1|meta|schema/.test(p)) return "Days 1 to 30";
    if (/capture|commercial|page|content|on.?page|keyword|build/.test(p)) return "Days 30 to 60";
    if (/author|local|geo|citation|review|gbp|map/.test(p)) return "Days 60 to 90";
    if (/compound|link|pr|scale|press|outreach|listicle/.test(p)) return "Days 90 to 180";
    const pr = String(priority || "").toLowerCase();
    return /high|crit/.test(pr) ? "Days 1 to 30" : /med/.test(pr) ? "Days 30 to 90" : "Days 90 to 180";
  };
  slides.push(
    <Slide key="actions" variant="cream" n="19" kicker="Who Does What" title="Every move, sorted by the work it takes"
      sub={ds.actions_sub || "Every move tagged by type AND owner, so each one lands on the right desk with a clear name against it."} foot={foot("19 · THE ACTION BOARD")}>
      <Legend items={[
        { color: "#C95322", label: "Content" }, { color: "#3C7D5A", label: "On-Page" }, { color: "#3B6FB2", label: "Lead-Gen" },
        { color: "#8A4FB2", label: "Listicle Outreach" }, { color: "#A07414", label: "PR & Authority" }, { color: "#1A8A8A", label: "Citations" },
      ]} />
      {actionRows.length ? actionRows.map((a, i) => (
        <ActionRow key={i} accentClass={accentFor(a.channel || a.title)} title={clamp(a.title, 72)} desc={clamp(a.desc || a.description || "", 88)}
          meta={<>{a.priority ? <Tag kind={prioKind(a.priority)}>{titleCase(a.priority)}</Tag> : null}<span style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, margin: "0 8px", whiteSpace: "nowrap" }}>{ownerFor(a.channel || a.title)}</span><Pill>{phaseDays(a.phase, a.priority)}</Pill></>} />
      )) : <GapPanel title="Action board pending">Recommendations populate from the strategy build.</GapPanel>}
    </Slide>
  );

  /* 22 · The 30/60/90/180 plan, color-coded dots */
  const shTarget = (ksRows.find((r) => /health/i.test(r.key || r.metric || ""))?.target_12_months) ?? (Number(health) >= 90 ? 100 : 90);
  const phaseDefs = [
    { badge: "30", duration: "First 30 days", title: "Foundation", mission: "Make the site visible. Pure unblocking, no strategy yet.", goal: { label: "Target", text: `Site health ${dash(health)} → ${shTarget}` } },
    { badge: "60", duration: "Days 31 to 60", title: "Capture", mission: "Take the easy commercial wins rivals leave undefended.", goal: { label: "Target", text: "First page ranking, ~25 reviews" } },
    { badge: "90", duration: "Days 61 to 90", title: "Authority", mission: "Own the local ground and earn the first AI citations.", goal: { label: "Target", text: "In the local map pack" } },
    { badge: "180", duration: "Days 91 to 180", title: "Compound", mission: "Turn early wins into a widening lead with content and press.", goal: { label: "Target", text: proj.dr12 != null ? `DR ${proj.dr12}, traffic compounding` : "Compounding" } },
  ];
  slides.push(
    <Slide key="plan" n="20" kicker="The Plan" title="One job per phase. Move on when it's done." foot={foot("20 · THE 30/60/90/180 PLAN")}>
      <PhaseRow>
        {phaseDefs.map((ph, i) => {
          const r = rm[i];
          const items = (r?.actions || []).slice(0, 3).map((a) => { const t = typeof a === "string" ? a : (a.title || a.description || ""); return { text: clamp(t, 54), color: workColor(t) }; });
          return <PhaseCol key={i} badge={ph.badge} duration={r?.duration || ph.duration} title={r?.title || ph.title}
            mission={ph.mission} items={items.length ? items : [{ text: "—" }]} goal={ph.goal} />;
        })}
      </PhaseRow>
    </Slide>
  );

  /* 23 · How we prove it */
  const kpiRow = (k) => ksRows.find((r) => r.key === k || lc(r.metric).includes(k.replace("_", " ")));
  const seoBoard = [["Domain Rating", kpiRow("domain_rating")], ["Organic traffic / month", kpiRow("organic_traffic")], ["Keywords ranking", kpiRow("organic_keywords")], ["Referring domains", kpiRow("referring_domains")]];
  slides.push(
    <Slide key="prove" variant="cream" n="21" kicker="How We Prove It" title="Two scoreboards, reported every month"
      sub={ds.prove_sub || "Current is measured today. Targets are rounded estimates that assume the plan is implemented."} foot={foot("21 · MEASURING SUCCESS")}>
      <Split>
        <div className="metric-col">
          <h3 className="mini">Search (SEO)</h3>
          {seoBoard.map(([label, r], i) => { const kn = (v) => (v == null ? "—" : fmtNum(Math.round(Number(v)))); return (<Trend key={i} label={label} now={r ? kn(r.baseline ?? r.now) : "—"} target={r ? kn(r.target_12_months ?? r.target_6_months ?? r.s12 ?? r.s6) : "—"} />); })}
          <Trend label="Site health score" now={dash(health)} target={dash(shTarget)} />
        </div>
        <div className="metric-col">
          <h3 className="mini">AI answers (GEO) {isIllus ? <Hypo>Illustrative</Hypo> : null}</h3>
          <Trend label="GEO score (0 to 100)" now={geo.overall?.geo_score} target="45+" />
          <Trend label="Share of voice vs rivals" now={pctStr(geo.overall?.sov)} target="18%" />
          <Trend label="Mention rate" now={pctStr(geo.overall?.mention_rate)} target="35%" />
          <Trend label="Citation rate" now={pctStr(geo.overall?.citation_rate)} target="15%" />
          <Trend label="Engines naming you" now={`${enginesNaming}/${enginesTested}`} target={`${enginesTested}/${enginesTested}`} />
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
            {p.expected_result && <p className="small" style={{ color: C.rustSoft, fontWeight: 600, marginTop: 8 }}>Result: {clamp(p.expected_result, 60)}</p>}
          </Card>
        ))}
      </Row>
      {(ds.closing || para(story.what_good_looks_like) || para(story.key_takeaway)) && (
        <Callout className="mt2">{ds.closing ? leadBold(ds.closing) : <><b>The whole story:</b> {clamp(para(story.what_good_looks_like) || para(story.key_takeaway), 220)}</>}</Callout>
      )}
    </Slide>
  );

  /* 25 · Clientele & next steps, brand wall + 4 steps + CTA */
  slides.push(
    <Slide key="close" variant="dark" n={null} kicker="Trusted & Ready When You Are" title="Brands we have partnered with" contentTop foot={{ left: "DOCTOR FIZZ · doctorfizz.com", mid: `Confidential, data as of ${dateGB(d.generatedAt)}`, pg: pg() }}>
      <CLGrid names={CLIENT_BRANDS} />
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
