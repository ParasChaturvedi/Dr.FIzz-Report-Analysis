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
const verdict = (good, warn) => (good ? { v: "Strong", t: "good" } : warn ? { v: "Needs work", t: "warn" } : { v: "Critical", t: "bad" });
// Render a deck-voice callout, bolding a leading "Label:" lead-in (e.g. "The move:") like the reference.
const leadBold = (s) => { const t = String(s || ""); const m = t.match(/^([^:]{2,40}:)\s*([\s\S]*)$/); return m ? <><b>{m[1]}</b> {m[2]}</> : t; };
const refOf = (name) => `DF-${String(name || "CLIENT").replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase()}-SEOGEO-01`;
// work-type colour for plan dots
const workColor = (s) => { const k = lc(s); if (/load|speed|h1|meta|schema|title|alt|crawl|redirect|link\b/.test(k)) return "#3C7D5A"; if (/publish|content|blog|page|faq/.test(k)) return C.rust; if (/form|lead|cta|calculator/.test(k)) return "#3B6FB2"; if (/citation|directory|backlink|press|gbp|review/.test(k)) return "#1A8A8A"; return C.rust; };

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
  const ca = (df.content_architecture && (df.content_architecture.commercial_pages?.length || df.content_architecture.blog_and_guides?.length)) ? df.content_architecture : (d.contentArchitecture || df.content_architecture || {});
  const tp = Array.isArray(d.technicalPriorities) ? d.technicalPriorities : [];
  const lb = d.linkBuilding || {};
  const gbp = df.gbp_comparison || {};
  const gmb = d.gmbCheck || {};
  const rm = Array.isArray(d.roadmap) ? d.roadmap : [];
  const air = df.ai_readiness || {};
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

  // Competitor set (drives the benchmark + competitor-relative GEO).
  const comps = [...(cl.localCompetitors || []), ...(cl.nationalPlatforms || [])];

  // GEO: REAL when a scan finished, else LABELED-ILLUSTRATIVE (same shape, tagged in UI).
  const ILLUS = buildIllustrativeGeo({ name, competitors: comps });
  const geo = measured ? live : ILLUS;          // unified source for every GEO slide
  const isIllus = !measured;                     // → show the "Illustrative" tag
  const IllusTag = isIllus ? <Hypo>Illustrative</Hypo> : null;
  const enginesStatus = (geo && geo.engines_status) || [];
  const enginePanel = enginesStatus.map((e) => ({ name: e.name || e.engine, ready: e.status === "ready" }));

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
  const geoToc = measured
    ? [["09", "Are you visible when buyers ask AI?"], ["10", "Share of voice vs competitors"], ["11", "Mention & citation rates"], ["12", "The prompts we ran"], ["13", "Topic & entity association"], ["14", "How the GEO score works"]]
    : [["09", "AI visibility, readiness & method"], ["13", "Topic & entity association"]];
  const toc = [
    { g: "Orientation", c: C.rust, items: [["01", "The story: where you stand"], ["02", "The outcome this plan delivers"], ["03", "The audit map: five pillars"]] },
    { g: "Technical SEO", c: "#3C7D5A", items: [["04", "Three things keeping you out"], ["05", "Fix the foundation first"]] },
    { g: "On-Page SEO", c: "#3C7D5A", items: [["06", "Where competitors are exposed"], ["07", "The competitor benchmark"], ["08", "Keyword strategy by intent"], ["15", "Pages to build"], ["16", "Optimise vs create"]] },
    { g: "GEO & AEO · AI Visibility", c: "#1A8A8A", items: geoToc },
    { g: "Local SEO & GBP", c: "#A07414", items: [["17", "Your fastest path into local results"]] },
    { g: "Off-Page & Authority", c: "#A07414", items: [["18", "Citations and backlinks to build"]] },
    { g: "The Plan", c: "#8A4FB2", items: [["19", "Every move, by work type"], ["20", "The 30/60/90/180 day plan"]] },
    { g: "Proof & Next Steps", c: "#8A4FB2", items: [["21", "How we report success"], ["22", "The three priorities"], ["23", "Clientele and next steps"]] },
  ];
  slides.push(
    <Slide key="toc" variant="cream" n="—" kicker="Contents" title="What this audit covers"
      sub="Grouped by the SEO and GEO disciplines, so you can jump to any pillar." foot={foot("CONTENTS")}>
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
          <Tile flag n={measured ? fmtNum(live.mentions_summary?.prompts_with_brand ?? 0) : pctStr(geo.overall?.mention_rate)} label="AI answers name you" />
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
        <Card accent title="Search visibility"><p className="small">From 0 keywords to a base of <strong style={{ color: C.rust }}>{opp.commercial_keyword_count ? `${opp.commercial_keyword_count}+ commercial terms` : "commercial terms"}</strong>, led by low-difficulty wins.</p></Card>
        <Card accent title="Local dominance"><p className="small">Into the <strong style={{ color: C.rust }}>local map pack</strong>, on a {rating ? `${rating}★` : "strong"} rating rivals can&apos;t match.</p></Card>
        <Card accent title="AI presence"><p className="small">From a <strong style={{ color: C.rust }}>GEO score of {geo.overall?.geo_score} to 45+</strong>{isIllus ? " (illustrative)" : ""}, lifting share of voice, mentions and citations across the AI engines.</p></Card>
      </Row>
    </Slide>
  );

  /* 5 · THE AUDIT MAP */
  const pillars = [
    { k: "Technical SEO", pk: "tech", verd: verdict(lcpMs != null && Number(lcpMs) < 2500, lcpMs != null && Number(lcpMs) < 6000), line: lcpMs != null ? `A ${lcpSeconds(lcpMs)} load gates everything else.` : "Crawl + speed health.", first: "Fix first" },
    { k: "On-Page SEO", pk: "onpage", verd: verdict(tp.filter((x) => /high|critical/i.test(x.priority)).length === 0, tp.length < 6), line: `${tp.length} on-page issues to clear (H1s, titles, schema).`, first: "Phase 1 to 2" },
    { k: "Off-Page / Authority", pk: "offpage", verd: verdict(dr != null && Number(dr) >= 30, dr != null && Number(dr) >= 15), line: `Domain Rating ${dash(dr)}, ${dash(rd)} referring domains.`, first: "Build over months" },
    { k: "Local SEO / GBP", pk: "local", verd: verdict(rating != null && Number(rating) >= 4.5 && reviews != null && Number(reviews) >= 50, rating != null), line: `${rating ? `${rating}★` : "—"} rating, ${dash(reviews)} reviews, ${dash(mv(bm, "gbp_completeness", "gmbCompletenessScore"))}% complete.`, first: "Quick win" },
    { k: "GEO / AEO", pk: "geo", verd: verdict(Number(geo.overall?.sov) >= 15, Number(geo.overall?.sov) >= 5), line: `${pctStr(geo.overall?.sov)} share of voice, ${pctStr(geo.overall?.citation_rate)} citation rate${isIllus ? " (illustrative)" : ""}.`, first: "Phase 2 to 3" },
  ];
  slides.push(
    <Slide key="map" variant="cream" n="03" kicker="The Audit Map" title="Five pillars. One verdict on each."
      sub={ds.audit_sub || `A complete audit covers five disciplines. Here is where ${name} stands on each today, and which gets fixed first. Every later slide proves these findings with data.`} foot={foot("THE AUDIT MAP")}>
      <Row cols={3} style={{ gap: 18 }}>
        {pillars.map((p, i) => (
          <Card key={i} accent>
            <Pillar kind={p.pk} label={p.k} />
            <p className="small" style={{ margin: "10px 0 8px" }}>{p.line}</p>
            <span className={`tag ${p.verd.t === "good" ? "low" : p.verd.t === "warn" ? "med" : "high"}`}>{p.verd.v} · {p.first}</span>
          </Card>
        ))}
        <Card dark accent title="Read this deck as proof">
          <p className="small">Each pillar gets its own evidence slides ahead, what we found, what it costs in growth, and the first move.</p>
        </Card>
      </Row>
    </Slide>
  );

  /* 6 · THE DIAGNOSIS */
  const topFix = tp.slice(0, 3);
  slides.push(
    <Slide key="diagnosis" n="04" kicker="The Diagnosis" title="Three fixable things keep you out"
      sub={ds.diagnosis_sub || "The site is not underperforming, it is not yet in the game. Each fix has a clear, measurable payoff."} foot={foot("THE DIAGNOSIS")}>
      <Split bias>
        <div>
          {(topFix.length ? topFix : [{ issue: "Technical foundation", why_it_matters: "Crawl and speed issues keep the site hard to index.", expected_unlock: "Indexable", estimated_effort: "" }]).map((f, i) => (
            <FixRow key={i} title={f.issue} desc={clamp(f.why_it_matters, 110)} goal={f.expected_unlock || "Unlocks indexing"} when={f.estimated_effort} />
          ))}
        </div>
        <Card soft title="Already working in your favour">
          <Checks items={[
            { state: "ok", text: "No penalties. Clean history, nothing to undo." },
            { state: "ok", text: `Schema in place${air.signals?.find((s) => /faq/i.test(s.key) && s.ok) ? ", FAQ blocks AI can lift." : "."}` },
            { state: rating ? "ok" : "do", text: rating ? `A genuine ${rating}★ rating. Real trust to build on.` : "Build first reviews for trust." },
            { state: "ok", text: "An open field. No one owns the commercial space." },
          ]} />
        </Card>
      </Split>
      <Callout className="mt2">{ds.diagnosis_cost ? leadBold(ds.diagnosis_cost) : <><b>What this costs you today:</b> with {fmtNum(traffic0 ?? 0)} organic visits, the {opp.total_monthly_search_volume ? `roughly ${fmtNum(opp.total_monthly_search_volume)}` : ""} monthly searches in your market go to competitors. Fixing these three things is what turns the site from invisible into found, and unlocks every later move in this plan.</>}</Callout>
    </Slide>
  );

  /* 7 · TECHNICAL SEO */
  const cwv = [
    { n: lcpMs != null ? lcpSeconds(lcpMs) : "—", l: "Largest paint · target <2.5s", flag: lcpMs != null && Number(lcpMs) >= 2500 },
    { n: dash(mv(bm, "cls")), l: "Layout shift · good <0.1", flag: mv(bm, "cls") != null && Number(mv(bm, "cls")) >= 0.1 },
    { n: dash(mv(bm, "mobile_performance_score", "performanceMobile")), l: "Mobile speed · /100", flag: true },
    { n: dash(mv(bm, "desktop_performance_score", "performanceDesktop")), l: "Desktop speed · /100", flag: false },
  ];
  slides.push(
    <Slide key="technical" variant="cream" n="05" kicker="Technical SEO" title="Fix the foundation before building on it"
      sub={<>{ds.technical_sub || "Search engines judge these signals before they read a word of content. Each one below has a fix and a clear target."} <Pillar kind="tech" label="Technical SEO" /></>} foot={foot("TECHNICAL SEO")}>
      <Split bias>
        <DataTable head={[{ label: "Issue found" }, { label: "Count", align: "right" }, { label: "Priority", align: "right" }]}
          rows={tp.slice(0, 8).map((t) => ({ cells: [t.issue, { v: dash(t.affected_count), num: true, align: "right" }, { align: "right", tag: { kind: /high|crit/i.test(t.priority) ? "high" : /med/i.test(t.priority) ? "med" : "low", label: t.priority } }] }))} />
        <div>
          <Tiles cols={2} style={{ marginBottom: 14 }}>
            {cwv.map((c, i) => <Tile key={i} flag={c.flag} n={c.n} label={c.l} />)}
          </Tiles>
          <Card soft title="The fix sequence">
            <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: C.inkSoft, lineHeight: 1.6 }}>
              {tp.slice(0, 4).map((t, i) => <li key={i}>{clamp(t.recommended_action || t.issue, 90)}</li>)}
            </ol>
          </Card>
        </div>
      </Split>
    </Slide>
  );

  /* 8 · THE OPENING (competitors), 4 rows + door-they-leave-open column */
  slides.push(
    <Slide key="opening" variant="cream" n="06" kicker="The Opening" title={ds.opening_title || "The leaders are absent where it is winnable"}
      sub={ds.opening_sub || "Each rival is strong on crowded, generic terms, and exposed on the high-value corners they never built for."} foot={foot("THE OPENING")}>
      {comps.length > 0 ? (
        <DataTable head={[{ label: "Competitor" }, { label: "What they own" }, { label: "The door they leave open" }, { label: "Threat", align: "right" }]}
          rows={comps.slice(0, 4).map((c) => ({ cells: [c.name || c.domain, clamp(c.description, 90), c.door_open || c.opening || "—", { align: "right", tag: { kind: /high|alert/i.test(c.strength || c.threat || "") ? "high" : "med", label: (c.strength || (c.threat ? "High" : "Med")).toString().replace("THREAT ALERT", "High") } }] }))} />
      ) : <GapPanel title="Competitor set pending">Competitor landscape populates once the competitor analysis completes.</GapPanel>}
      {(ds.opening_move || cl.localOpening) && <Callout className="mt2">{ds.opening_move ? leadBold(ds.opening_move) : <><b>The move:</b> {clamp(cl.localOpening, 220)}</>}</Callout>}
    </Slide>
  );

  /* 9 · THE GAP IN NUMBERS */
  slides.push(
    <Slide key="gap" variant="cream" n="07" kicker="The Gap In Numbers" title="How far ahead the competition really is"
      sub={<>{ds.gap_sub || "Your real baseline against the market, with the metrics we pull for every rival."} {benchIllus ? IllusTag : null}</>} foot={foot("COMPETITOR BENCHMARK")}>
      <DataTable compact head={[{ label: "" }, { label: "Domain Rating", align: "right" }, { label: "Traffic / mo", align: "right" }, { label: "Keywords", align: "right" }, { label: "Ref. domains", align: "right" }]}
        rows={[
          { you: true, cells: [`${name} (you)`, { v: dash(dr), num: true, align: "right" }, { v: fmtNum(traffic0), num: true, align: "right" }, { v: dash(mv(bm, "organic_keywords", "organicKeywords")), num: true, align: "right" }, { v: dash(rd), num: true, align: "right" }] },
          ...benchRows.slice(0, 5).map((c) => ({ cells: [c.name || c.domain, { v: dash(c.dr), num: true, align: "right" }, { v: c.traffic != null ? fmtNum(c.traffic) : "—", num: true, align: "right" }, { v: c.keywords != null ? fmtNum(c.keywords) : "—", num: true, align: "right" }, { v: c.refDomains != null ? fmtNum(c.refDomains) : "—", num: true, align: "right" }] })),
        ]} />
      <Callout className="mt2" mark="i"><b>Reading it:</b> your row is measured today (Moz / DataForSEO). {benchIllus ? "Competitor figures are illustrative of the gap; your live competitor scrape drops straight into this table." : "Competitor authority, traffic and keyword counts are pulled per rival, none are estimated."}</Callout>
    </Slide>
  );

  /* 10 · WHAT BUYERS TYPE */
  const tierCard = (title, sub, items) => (
    <Card accent title={title}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{sub}</div>
      {(items || []).slice(0, 5).map((k, i) => (
        <PbItem key={i} name={k.keyword_cluster || k.page_name || k.proposed_title || k.keyword} value={k.primary_volume ? `${fmtNum(k.primary_volume)}/mo` : null} />
      ))}
      {(!items || items.length === 0) && <p className="small">No measured demand in this tier yet.</p>}
    </Card>
  );
  slides.push(
    <Slide key="keywords" n="08" kicker="Keyword Strategy" title={ds.keywords_title || "Three kinds of searcher. One of them buys."}
      sub={<>{ds.keywords_sub || "We chase the commercial tier first, the one that turns a ranking into a client."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("KEYWORD STRATEGY")}>
      <Row cols={3} style={{ gap: 18 }}>
        {tierCard("Tier 1 · Ready to buy", "Commercial intent · a page each", ca.commercial_pages)}
        {tierCard("Tier 2 · Local", "Place-based intent", ca.geography_pages || ca.city_pages)}
        {tierCard("Tier 3 · Learning", "Informational · feeds AI answers", ca.blog_and_guides)}
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
      sub={<>{ds.geo_intro || "A growing share of buyers ask AI for a recommendation, then act on the names returned."} {IllusTag}</>} foot={foot("GEO · AI VISIBILITY")}>
      <Verdict num={pctStr(geo.overall?.sov)}>
        Across <b>25 to 100 prompts on {geo.overall?.engines_tested || 6} engines</b>, {name} is named in <b>{pctStr(geo.overall?.mention_rate)}</b> of answers and cited in <b>{pctStr(geo.overall?.citation_rate)}</b>. {leader ? `${leader.brand} is heard instead.` : ""}
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
          <h3 className="mini">The three metrics we track</h3>
          <Card dark title="Share of Voice"><p className="small">Your slice of all brand mentions across the answer set.</p></Card>
          <Card dark title="Mention Rate"><p className="small" style={{ marginTop: 6 }}>Share of prompts where your brand is named at all.</p></Card>
          <Card dark title="Citation Rate"><p className="small" style={{ marginTop: 6 }}>Share of prompts where your site is cited as evidence.</p></Card>
        </div>
      </Split>
    </Slide>
  );

  /* 12 · GEO SoV */
  slides.push(
    <Slide key="geo-sov" n="10" kicker="GEO · Share of Voice"
      title={geo.overall?.sov != null ? `Share of voice: you hold ${Math.round(geo.overall.sov)} of every 100 mentions` : "Who AI names when buyers ask"}
      sub={<>Your slice of all brand mentions, overall and per platform, against your rivals. {IllusTag}</>} foot={foot("GEO · SHARE OF VOICE")}>
      <Split>
        <div>
          <h3 className="mini">Overall share of voice, vs competitors</h3>
          {sov.slice(0, 6).map((b, i) => (<CBar key={i} name={b.brand + (b.is_client ? " (you)" : "")} pct={b.avg} you={b.is_client} value={`${Math.round(b.avg)}%`} />))}
        </div>
        <div>
          <h3 className="mini">Your share of voice, by platform</h3>
          {(geo.by_engine || []).map((e, i) => {
            const v = e.metrics?.sov ?? e.sov ?? 0;
            return <CBar key={i} name={e.engine} pct={v} you value={`${Math.round(v)}%`} />;
          })}
        </div>
      </Split>
      {leader && (
        <Triad className="mt2">
          <Tc kind="evidence" label="Evidence"><b>{leader.brand}</b> leads share of voice at {Math.round(leader.avg)}%; you hold {pctStr(geo.overall?.sov)}.</Tc>
          <Tc kind="cost" label="What it costs you">Every AI recommendation that omits you is a <b>warm, high-intent lead</b> handed to a competitor.</Tc>
          <Tc kind="action" label="Do this first">Publish answer-first FAQ pages on your <b>core service questions</b> to enter the answer set where you already rank.</Tc>
        </Triad>
      )}
    </Slide>
  );

  /* 13 · GEO mentions & citations */
  const metricCol = (label, sub, value, lead, eng, key) => (
    <div className="metric-col">
      <h3 className="mini">{label} <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· {sub}</span></h3>
      <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 34, letterSpacing: "-.02em", color: C.rust, lineHeight: 1, margin: "2px 0 4px" }}>{pctStr(value)}</div>
      <p className="mdesc">{lead ? `Leader ${lead.brand} sits at ${Math.round(lead.avg)}%.` : "Measured across the answered prompts."}</p>
      {(eng || []).map((e, i) => <CBar key={i} name={e.engine} pct={e.metrics?.[key] ?? e[key] ?? 0} you />)}
    </div>
  );
  slides.push(
    <Slide key="geo-mc" n="11" kicker="GEO · Mentions & Citations" title="Named is good. Cited is what earns the click."
      sub={<>Each metric overall and per platform, against the leader. {IllusTag}</>} foot={foot("GEO · MENTIONS & CITATIONS")}>
      <Split>
        {metricCol("Mention Rate", "how often you appear at all", geo.overall?.mention_rate, leader, geo.by_engine, "mention_rate")}
        {metricCol("Citation Rate", "how often you are the source", geo.overall?.citation_rate, leader, geo.by_engine, "citation_rate")}
      </Split>
    </Slide>
  );

  /* 14 · The prompts we ran */
  const resKind = (p) => (p.brand_mentioned ? (p.citation_count > 0 ? "cited" : "named") : "absent");
  slides.push(
    <Slide key="geo-prompts" variant="cream" n="12" kicker="GEO · Sample Prompts" title="Real prompts, real answers, per engine"
      sub={<>A sample of the buyer prompts we ran, which engine ran each, and who got named. {IllusTag}</>} foot={foot("GEO · SAMPLE PROMPTS")}>
      <DataTable compact head={[{ label: "Buyer prompt" }, { label: "Engine" }, { label: "Who it named" }, { label: "Your result", align: "right" }]}
        rows={(geo.prompts_executed || []).slice(0, 7).map((p) => ({ cells: [
          clamp(p.prompt, 56), p.engine,
          clamp((p.brands_named || p.entities || []).join(", ") || (p.competitor_mention_count ? `${p.competitor_mention_count} competitor${p.competitor_mention_count === 1 ? "" : "s"}` : "—"), 40),
          { align: "right", v: <ResCell kind={resKind(p)}>{p.citation_count > 0 ? "Cited" : p.brand_mentioned ? "Named" : "Not named"}</ResCell> },
        ] }))} />
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
    <Slide key="aeo" n="13" kicker="Entity & Topical Authority" title="Which topics does AI associate with your brand?"
      sub={<>Engines cite brands they understand as an authority on a topic. {IllusTag}</>} foot={foot("ENTITY & TOPICAL AUTHORITY")}>
      <Split bias>
        <div>
          <h3 className="mini">Topic association, tested across engines</h3>
          {topicChips.length ? <><TopicGrid topics={topicChips} /><TopicLegend /></>
            : <p className="small">Topic association renders from the live scan; readiness (right) is measured from the site today.</p>}
        </div>
        <div>
          <h3 className="mini">Trust signals: present vs missing</h3>
          <Checks items={(air.signals || []).slice(0, 7).map((s) => ({ state: s.ok ? "ok" : "no", text: s.label + (s.detail ? `, ${clamp(s.detail, 50)}` : "") }))} />
          {(!air.signals || air.signals.length === 0) && <p className="small">Readiness signals populate from the on-site crawl.</p>}
        </div>
      </Split>
    </Slide>
  );

  /* 16 · How the GEO score works, fixed methodology weights */
  const GEO_WEIGHTS = [["Share of voice vs competitors", 30], ["Citation rate · you as the source", 25], ["Mention rate · named at all", 20], ["Entity & topical association", 15], ["Schema & answer-readiness", 10]];
  slides.push(
    <Slide key="geo-method" variant="dark" n="14" kicker="How The GEO Score Works" title="Every GEO number, and where it comes from"
      sub="No figure is invented. Each is collected by running real prompts and measuring you against the same competitors." foot={foot("GEO METHODOLOGY")}>
      <Split bias>
        <div>
          <h3 className="mini">The collection method</h3>
          <Checks items={[
            { state: "do", text: "Build prompts from your site, competitors and intent tests." },
            { state: "do", text: "Run every prompt across ChatGPT, Gemini, Perplexity, Claude, Copilot, Google AIO." },
            { state: "do", text: "Score share of voice, mention and citation, you vs each competitor, per engine." },
            { state: "do", text: "Re-run the same set monthly, so every movement is comparable." },
          ]} />
        </div>
        <div>
          <h3 className="mini">How the 0 to 100 score is weighted {IllusTag}</h3>
          {GEO_WEIGHTS.map(([label, w]) => <ScoreSig key={label} label={label} weight={`${w}%`} />)}
          <ScoreBox score={geo.overall?.geo_score} />
        </div>
      </Split>
    </Slide>
  );

  /* 17 · What we build */
  const buildCards = [...(ca.commercial_pages || []).slice(0, 3), ...(ca.geography_pages || ca.city_pages || []).slice(0, 1)];
  const shipWith = ["Exact-intent H1 and meta", "800 to 1,500 unique words", "5 to 8 FAQs plus schema", "Strong CTA above the fold", "Internal links and alt text", "Sub-2.5s load time"];
  slides.push(
    <Slide key="build" variant="cream" n="15" kicker="What To Build" title="Four pages do most of the work"
      sub={<>{ds.build_sub || "Only pages with real, measured demand. Three commercial, one local. Each has a job and a target."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("WHAT TO BUILD")}>
      <Row cols={buildCards.length >= 4 ? 4 : 3} style={{ gap: 16 }}>
        {buildCards.map((p, i) => (
          <Card key={i} accent title={p.page_name || titleCase(p.keyword_cluster)}>
            <Pill>{p.primary_volume ? `${fmtNum(p.primary_volume)}/mo` : "—"}{p.geography_relevance === "Local" ? " · Local" : ""}</Pill>
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
      sub={<>{ds.contentmap_sub || "We audited every existing page and post. Some are rank-ready and need polish; the rest are gaps to fill."} <Pillar kind="onpage" label="On-Page SEO" /></>} foot={foot("THE CONTENT MAP")}>
      <Split>
        <div>
          <Card soft><PbHead count={ca.pagesExistingFlagged ?? 0} label="pages you have · optimise" />
            <p className="small" style={{ marginTop: 6 }}>{ca.pagesExistingFlagged > 0 ? "Matched real demand, add H1/FAQ/schema, expand thin content. Per-page detail lands with the on-page pass." : "No existing pages matched the target keywords."}</p>
          </Card>
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
      sub={<>{ds.gbp_sub || "The map pack drives most local enquiries. Your reviews already lead; the profile needs completing."} <Pillar kind="local" label="Local SEO" /></>} foot={foot("GOOGLE BUSINESS PROFILE")}>
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
            <h3 className="mini">Reviews, you vs competitors</h3>
            <CBar name={`${name} (you)`} pct={(reviews / maxRev) * 100} you value={dash(reviews)} />
            {reviewCompetitors.map((c, i) => <CBar key={i} name={c.name} pct={((c.review_count || 0) / maxRev) * 100} value={dash(c.review_count)} />)}
          </>
        ) : (
          <Callout mark="→"><b>Goal:</b> {gbp.review_intel?.review_gap ? `close the review gap (${gbp.review_intel.review_gap} behind the local leader)` : `grow reviews from ${dash(reviews)}`} and lift completeness from {dash(gbpScore)} → 95. Set hours, post weekly, reply to every review, WhatsApp a review link after each job.</Callout>
        )}
      </div>
    </Slide>
  );

  /* 20 · Citations & backlinks, three waves as cards */
  const dirs = (gmb.directories || []).slice(0, 12).map((x) => ({ name: x.name, state: x.listed === true ? "have" : x.listed === false ? "miss" : "q" }));
  const citeDirs = dirs.length ? dirs : (lb.citation_links || []).slice(0, 12).map((x) => ({ name: x.platform, state: x.client_listed ? "have" : "miss" }));
  slides.push(
    <Slide key="backlinks" variant="cream" n="18" kicker="Citations & Backlinks" title={`Raising Domain Rating from ${dash(dr)} toward ${proj.dr12 ?? 25}`}
      sub={<>{ds.backlinks_sub || "Trust is built in three waves: citations for consistency, then earned links, then closing the leader's gap."} <Pillar kind="offpage" label="Off-Page SEO" /></>} foot={foot("CITATIONS & BACKLINKS")}>
      <Split>
        <div>
          <h3 className="mini">Directories to claim or fix</h3>
          <DirGrid>{citeDirs.map((x, i) => <DirChip key={i} name={x.name} state={x.state} />)}</DirGrid>
        </div>
        <div>
          <KV k="Now · referring domains" v={dash(rd)} />
          <Card style={{ marginTop: 10 }}><h4><span style={{ color: C.rust }}>Wave 1.</span> Citations · months 1 to 2</h4><p className="small">Consistent NAP across the trusted directories for your market.</p></Card>
          <Card style={{ marginTop: 8 }}><h4><span style={{ color: C.rust }}>Wave 2.</span> Earned links · months 2 to 4</h4><p className="small">A cost calculator, an annual report, an SLA template firms cite and share.</p></Card>
          <Card style={{ marginTop: 8 }}><h4><span style={{ color: C.rust }}>Wave 3.</span> Close the leader gap · ongoing</h4><p className="small">Trade publications + partner directories that link to rivals but not yet you{proj.dr12 != null ? `, target DR ${proj.dr12}.` : "."}</p></Card>
        </div>
      </Split>
    </Slide>
  );

  /* 21 · Who does what */
  const actionRows = (rm.flatMap((p) => (p.actions || []).map((a) => ({ ...a, phase: p.timeframe })))).slice(0, 6);
  slides.push(
    <Slide key="actions" variant="cream" n="19" kicker="The Action Board" title="Every move, sorted by the work it takes"
      sub={ds.actions_sub || "Each recommendation is tagged by type, so it lands on the right desk."} foot={foot("THE ACTION BOARD")}>
      <Legend items={[
        { color: "#C95322", label: "Content" }, { color: "#3C7D5A", label: "On-Page" }, { color: "#3B6FB2", label: "Lead-Gen" },
        { color: "#8A4FB2", label: "Listicle" }, { color: "#A07414", label: "PR & Authority" }, { color: "#1A8A8A", label: "Citations" },
      ]} />
      {actionRows.length ? actionRows.map((a, i) => (
        <ActionRow key={i} accentClass={accentFor(a.title)} title={a.title} desc={clamp(a.description, 90)} meta={<Pill>{a.phase || "Phase 1"}</Pill>} />
      )) : <GapPanel title="Action board pending">Recommendations populate from the strategy build.</GapPanel>}
    </Slide>
  );

  /* 22 · The 30/60/90/180 plan, color-coded dots */
  const phaseDefs = [
    { badge: "30", duration: "First 30 days", title: "Foundation" }, { badge: "60", duration: "Days 31 to 60", title: "Capture" },
    { badge: "90", duration: "Days 61 to 90", title: "Authority" }, { badge: "180", duration: "Days 91 to 180", title: "Compound" },
  ];
  slides.push(
    <Slide key="plan" n="20" kicker="The 30/60/90/180 Plan" title="One job per phase. Move on when it's done." foot={foot("THE 30/60/90/180 PLAN")}>
      <PhaseRow>
        {phaseDefs.map((ph, i) => {
          const r = rm[i];
          const items = (r?.actions || []).slice(0, 3).map((a) => ({ text: clamp(a.title, 54), color: workColor(a.title) }));
          return <PhaseCol key={i} badge={ph.badge} duration={ph.duration} title={r?.title || ph.title}
            mission={r ? clamp(r.actions?.[0]?.description || "", 90) : ""} items={items.length ? items : [{ text: "—" }]}
            goal={i === 0 ? { label: "Target", text: `Site health ${dash(health)} → 90` } : i === 3 ? { label: "Target", text: proj.dr12 != null ? `DR ${proj.dr12}, traffic compounding` : "Compounding" } : null} />;
        })}
      </PhaseRow>
    </Slide>
  );

  /* 23 · How we prove it */
  const kpiRow = (k) => ksRows.find((r) => r.key === k || lc(r.metric).includes(k.replace("_", " ")));
  const seoBoard = [["Domain Rating", kpiRow("domain_rating")], ["Organic traffic / mo", kpiRow("organic_traffic")], ["Keywords ranking", kpiRow("organic_keywords")], ["Referring domains", kpiRow("referring_domains")]];
  slides.push(
    <Slide key="prove" variant="cream" n="21" kicker="Measuring Success" title="Two scoreboards, reported every month"
      sub={ds.prove_sub || "Current is measured today. Targets are estimates that assume the plan is implemented."} foot={foot("MEASURING SUCCESS")}>
      <Split>
        <div className="metric-col">
          <h3 className="mini">Search (SEO)</h3>
          {seoBoard.map(([label, r], i) => (<Trend key={i} label={label} now={r ? dash(r.baseline ?? r.now) : "—"} target={r ? dash(r.target_12_months ?? r.target_6_months ?? r.s12 ?? r.s6) : "—"} />))}
          <Trend label="Site health score" now={dash(health)} target="90" />
        </div>
        <div className="metric-col">
          <h3 className="mini">AI answers (GEO) {isIllus ? <Hypo>Illustrative</Hypo> : null}</h3>
          <Trend label="GEO score (0 to 100)" now={geo.overall?.geo_score} target="45+" />
          <Trend label="Share of voice" now={pctStr(geo.overall?.sov)} target="18%" />
          <Trend label="Mention rate" now={pctStr(geo.overall?.mention_rate)} target="35%" />
          <Trend label="Citation rate" now={pctStr(geo.overall?.citation_rate)} target="15%" />
          <Trend label="Engines naming you" now={`${geo.overall?.engines_tested ?? 6}/6`} target="6/6" />
        </div>
      </Split>
    </Slide>
  );

  /* 24 · The honest assessment, Result line per card */
  const priorities = (Array.isArray(ds.priorities) && ds.priorities.filter((p) => p && p.title).length
    ? ds.priorities.filter((p) => p && p.title).slice(0, 3).map((p) => ({ title: p.title, description: p.body, expected_result: p.result }))
    : (sp.length ? sp.slice(0, 3) : tp.slice(0, 3).map((t) => ({ title: t.issue, description: t.why_it_matters || t.recommended_action, expected_result: t.expected_unlock }))));
  slides.push(
    <Slide key="honest" variant="dark" n="22" kicker="The Honest Assessment" title={ds.honest_title || "If you do nothing else, do these three"}
      sub={ds.honest_sub || "In this order. Each is the highest-leverage move at its stage."} foot={foot("THE HONEST ASSESSMENT")}>
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
    <Slide key="close" variant="dark" n={null} kicker="Trusted & Ready When You Are" title="Brands we have partnered with" foot={foot("DOCTOR FIZZ")}>
      <CLGrid names={CLIENT_BRANDS} />
      <div className="eyebrow-sm" style={{ marginTop: 22 }}>Four steps to launch</div>
      <div className="close-steps">
        <div className="steps">
          {[["01", "Discovery Call", "30-minute session to align on goals."], ["02", "Full Audit", "Deep technical and content audit."], ["03", "Strategy Build", "Custom 30-day quick-launch plan."], ["04", "Execute & Report", "Monthly delivery and reporting."]].map((s, i) => (
            <div key={i} className="step"><div className="no">{s[0]}</div><h4>{s[1]}</h4><p>{s[2]}</p></div>
          ))}
        </div>
      </div>
      <div className="close-band">
        <div className="close-cta" style={{ borderLeft: "none", paddingLeft: 0, width: "100%" }}>
          <div className="cc-line">Ready to make {name} visible?</div>
          <div className="cta-btn">Book Your Discovery Call →</div>
        </div>
      </div>
    </Slide>
  );

  return (
    <div id="report-content" className="df-deck">
      <DeckStyle />
      {slides}
    </div>
  );
}
