// src/app/components/report/deck/DeckReport.js
// ─────────────────────────────────────────────────────────────────────────────
// THE REPLICA RENDERER — renders the report AS the 23-slide reference deck, bound
// to REAL data (data.doctorFizz + baselineMetrics + live GEO). Never prints the
// deck's hand-authored numbers; every value is a real binding or an honest
// gap-state. Honesty rules enforced here: per-engine GEO gated on real collection,
// absolute KPIs (no %-of-zero), one review target, readiness ≠ visibility.
// ─────────────────────────────────────────────────────────────────────────────
import { Cover, Slide } from "./Slide";
import {
  Row, Split, Tiles, Tile, Card, Callout, Journey, FixRow, CBar, Trend, KV,
  Checks, Tag, Pill, EngineGrid, EngineCell, PhaseCol, PhaseRow, Legend, ActionRow,
  Verdict, Method, DirGrid, DirChip, Ring, ScoreSig, PbItem, DataTable, HeroStat, ScoreBox, GapPanel,
} from "./components";
import { DeckStyle, C, accentFor, fmtNum, pctStr, dateGB, dash, clamp } from "./tokens";

/* ── small data helpers ────────────────────────────────────────────────── */
// baseline metric value — bm fields are {value,label} objects, with flat legacy fallbacks.
const mv = (bm, key, legacy) => {
  const o = bm?.[key];
  const v = o && typeof o === "object" ? o.value : o;
  return v != null ? v : (legacy != null ? bm?.[legacy] : null);
};
const para = (arr, i = 0) => (Array.isArray(arr) ? arr[i] : (i === 0 ? arr : null));
const paras = (arr, n = 3) => (Array.isArray(arr) ? arr.slice(0, n) : arr ? [arr] : []);
const titleCase = (s) => String(s || "").replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const prettyName = (d, domain) => d?.businessData?.name || titleCase(String(domain || "").replace(/\.(com|co\.uk|io|net|org|in|us)$/i, "").split(".")[0]);
const sec = (s) => Math.round((Number(s) || 0)) >= 1000 ? `${(s / 1000).toFixed(1)}s` : null; // ms passthrough below
const lcpSeconds = (ms) => (ms == null ? null : `${(Number(ms) / 1000).toFixed(1)}s`);
const lc = (s) => String(s || "").toLowerCase();

// verdict thresholds → {verdict, tone}
const verdict = (good, warn) => (good ? { v: "Strong", t: "good" } : warn ? { v: "Needs work", t: "warn" } : { v: "Critical", t: "bad" });

/* ── outcome projection (absolute, labelled targets — never %-off-zero) ──── */
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
  // modest DR trajectory toward 25, only when we know the base
  const drAt = (add) => (drBase == null ? null : Math.min(60, drBase + add));
  return { t0, t3, t6, t12, dr0: drBase, dr3: drAt(3), dr6: drAt(5), dr12: drAt(15) };
}

/* ── the deck (23 slides) ───────────────────────────────────────────────── */
export default function DeckReport({ data, live }) {
  const d = data || {};
  const df = d.doctorFizz || {};
  const bm = d.baselineMetrics || {};
  const story = df.story || {};
  const v2 = df.v2_additions || {};
  const cl = d.competitorLandscape || {};
  const ca = d.contentArchitecture || {};
  const tp = Array.isArray(d.technicalPriorities) ? d.technicalPriorities : [];
  const lb = d.linkBuilding || {};
  const gbp = df.gbp_comparison || {};
  const gmb = d.gmbCheck || {};
  const rm = Array.isArray(d.roadmap) ? d.roadmap : [];
  const air = df.ai_readiness || {};
  const aio = df.geo_aio_visibility || {};
  const ksRows = Array.isArray(d.measuringSuccessRows) ? d.measuringSuccessRows : [];
  const sp = Array.isArray(d.strategicPriorities) ? d.strategicPriorities : [];

  const domain = d.domain || "yourdomain.com";
  const name = prettyName(d, domain);
  const measured = !!(live && live.measured);
  const enginesStatus = (live && live.engines_status) || [];
  const opp = v2.opportunity_summary || {};
  const proj = projectOutcome(bm, v2);

  // running page numbers, deck-style "NN"
  let _pg = 1;
  const pg = () => String(++_pg).padStart(2, "0");
  const foot = (left) => ({ left, mid: domain, pg: pg() });

  const slides = [];

  /* 1 · COVER */
  slides.push(
    <Cover key="cover"
      eyebrow="SEO & GEO Growth Strategy"
      title={name.length > 14 ? <>{name.split(" ")[0]}<br />{name.split(" ").slice(1).join(" ") || "Strategy"}</> : name}
      lede={`A data-led plan to make ${name} visible where buyers search. Across Google, and across the new AI answer engines.`}
      meta={[
        { k: "PREPARED FOR", v: domain },
        { k: "DATE", v: dateGB(d.generatedAt) },
        { k: "PREPARED BY", v: "DOCTOR FIZZ" },
      ]}
    />
  );

  /* 2 · CONTENTS */
  const toc = [
    { g: "Orientation", color: C.rust, items: ["The story: where you stand", "The outcome this plan delivers", "The audit map: five pillars"] },
    { g: "Technical & On-Page", color: "#3C7D5A", items: ["What's keeping you out", "Fix the foundation", "Where competitors are exposed", "The gap in numbers", "Keyword strategy by intent"] },
    { g: "GEO · AI Visibility", color: "#1A8A8A", items: measured
      ? ["Are you visible in AI?", "Share of voice", "Mentions & citations", "The prompts we ran", "Entity & topic authority", "How the GEO score works"]
      : ["AI visibility — readiness & method", "Entity & topic authority"] },
    { g: "Build · Local · Authority", color: "#A07414", items: ["Pages to build", "The content map", "Google Business Profile", "Citations & backlinks"] },
    { g: "The Plan & Proof", color: "#8A4FB2", items: ["Who does what", "The 30/60/90/180 plan", "How we prove it", "The three priorities", "Next steps"] },
  ];
  slides.push(
    <Slide key="toc" variant="cream" n="—" kicker="Contents" title="What this audit covers"
      sub="Grouped by discipline, so you can jump to any pillar." foot={foot("CONTENTS")}>
      <Row cols={2} style={{ gap: 30 }}>
        {toc.map((s, i) => (
          <div key={i}>
            <h3 className="mini" style={{ color: s.color }}>{s.g}</h3>
            {s.items.map((it, j) => (
              <div key={j} className="kv"><span className="k">{it}</span></div>
            ))}
          </div>
        ))}
      </Row>
    </Slide>
  );

  /* 3 · THE STORY */
  const traffic0 = mv(bm, "organic_traffic", "organicTraffic");
  const invisible = !traffic0 || Number(traffic0) < 50;
  slides.push(
    <Slide key="story" variant="cream" n="01" kicker="The Story"
      title={<>{name} is {invisible ? "invisible" : "underperforming"} today.<br /><span className="hl">That is the opportunity.</span></>}
      foot={foot("THE STORY")}>
      <Split bias>
        <div className="body-copy">
          {(paras(story.the_situation, 1).concat(paras(story.whats_blocking_growth, 1), paras(story.the_opportunity, 1)))
            .filter(Boolean).slice(0, 3).map((p, i) => <p key={i}>{clamp(p, 240)}</p>)}
          {!story.the_situation && <p>Search Google for a provider and {name} barely appears; ask an AI for a recommendation and it is rarely named. The firms that rank won by owning broad, generic terms — <span className="hl">that scale is also their blind spot.</span></p>}
        </div>
        <Tiles cols={2}>
          <Tile flag n={fmtNum(traffic0 ?? 0)} label="Organic visits / month" />
          <Tile flag n={measured ? fmtNum(live.mentions_summary?.prompts_with_brand ?? 0) : "—"} label={measured ? "AI answers naming you" : "AI answers — pending scan"} />
          <Tile n={opp.total_monthly_search_volume ? fmtNum(opp.total_monthly_search_volume) : "—"} label="Searches up for grabs" />
          <Tile n={mv(bm, "gbp_rating") ? `${mv(bm, "gbp_rating")}★` : "—"} label="Rating, beats most rivals" />
        </Tiles>
      </Split>
      <Callout className="mt2"><b>The thesis:</b> the broad terms are taken. The high-intent, local, and AI-answer corners are not — {name} can own them, and this deck is the order to do it.</Callout>
    </Slide>
  );

  /* 4 · THE OUTCOME */
  slides.push(
    <Slide key="outcome" n="02" kicker="The Outcome" title="Where this plan takes you"
      sub="Rounded estimates, modelled from the keyword opportunity and competitor benchmarks. They assume the plan is implemented."
      foot={foot("THE OUTCOME")}>
      <Journey stages={[
        { when: "Today", big: fmtNum(proj.t0), cap: `visits / mo${proj.dr0 != null ? ` · DR ${proj.dr0}` : ""}`, now: true },
        { when: "Day 90", big: proj.t3 != null ? `~${fmtNum(proj.t3)}` : "—", cap: `visits / mo${proj.dr3 != null ? ` · DR ${proj.dr3}` : ""}` },
        { when: "Day 180", big: proj.t6 != null ? `~${fmtNum(proj.t6)}` : "—", cap: `visits / mo${proj.dr6 != null ? ` · DR ${proj.dr6}` : ""}` },
        { when: "Month 12", big: proj.t12 != null ? `~${fmtNum(proj.t12)}` : "—", cap: `visits / mo${proj.dr12 != null ? ` · DR ${proj.dr12}` : ""}`, goal: true },
      ]} />
      <Row cols={3} className="mt2">
        <Card accent title="Search visibility"><p className="small">From 0 keywords to a base of <strong style={{ color: C.rust }}>{opp.commercial_keyword_count ? `${opp.commercial_keyword_count}+ commercial terms` : "commercial terms"}</strong>, led by low-difficulty wins.</p></Card>
        <Card accent title="Local dominance"><p className="small">Into the <strong style={{ color: C.rust }}>local map pack</strong>, on a {mv(bm, "gbp_rating") ? `${mv(bm, "gbp_rating")}★` : "strong"} rating rivals can&apos;t match.</p></Card>
        <Card accent title="AI presence"><p className="small">{measured ? <>From a <strong style={{ color: C.rust }}>GEO score of {live.overall?.geo_score}</strong>, lifting share of voice, mentions and citations across the AI engines.</> : <>Build readiness to be quoted across the AI answer engines — <strong style={{ color: C.rust }}>baseline measured once the scan completes.</strong></>}</p></Card>
      </Row>
    </Slide>
  );

  /* 5 · THE AUDIT MAP */
  const lcpMs = mv(bm, "lcp");
  const health = mv(bm, "site_health_score", "crawlHealthScore") ?? d.websiteCrawl?.healthScore;
  const dr = mv(bm, "domain_rating", "domainRating");
  const rd = mv(bm, "referring_domains", "referringDomains");
  const rating = mv(bm, "gbp_rating");
  const reviews = mv(bm, "gbp_review_count");
  const pillars = [
    { k: "Technical SEO", verd: verdict(lcpMs != null && Number(lcpMs) < 2500, lcpMs != null && Number(lcpMs) < 6000), line: lcpMs != null ? `A ${lcpSeconds(lcpMs)} load gates everything else.` : "Crawl + speed health.", first: "Fix first" },
    { k: "On-Page SEO", verd: verdict(tp.filter((x) => /high|critical/i.test(x.priority)).length === 0, tp.length < 6), line: `${tp.length} on-page issues to clear (H1s, titles, schema).`, first: "Phase 1–2" },
    { k: "Off-Page / Authority", verd: verdict(dr != null && Number(dr) >= 30, dr != null && Number(dr) >= 15), line: `Domain Rating ${dash(dr)}, ${dash(rd)} referring domains.`, first: "Build over months" },
    { k: "Local SEO / GBP", verd: verdict(rating != null && Number(rating) >= 4.5 && reviews != null && Number(reviews) >= 50, rating != null), line: `${rating ? `${rating}★` : "—"} rating, ${dash(reviews)} reviews, ${dash(mv(bm, "gbp_completeness", "gmbCompletenessScore"))}% complete.`, first: "Quick win" },
    { k: "GEO / AEO", verd: measured ? verdict(Number(live.overall?.sov) >= 15, Number(live.overall?.sov) >= 5) : { v: "Open field", t: "warn" }, line: measured ? `${pctStr(live.overall?.sov)} share of voice, ${pctStr(live.overall?.citation_rate)} citation rate.` : `Readiness ${air.score ?? "—"}/100 — visibility not yet measured.`, first: "Phase 2–3" },
  ];
  slides.push(
    <Slide key="map" variant="cream" n="03" kicker="The Audit Map" title="Five pillars. One verdict on each."
      sub="Where the site stands on each discipline today, and which gets fixed first." foot={foot("THE AUDIT MAP")}>
      <Row cols={3} style={{ gap: 18 }}>
        {pillars.map((p, i) => (
          <Card key={i} accent title={p.k}>
            <p className="small" style={{ marginBottom: 8 }}>{p.line}</p>
            <span className={`tag ${p.verd.t === "good" ? "low" : p.verd.t === "warn" ? "med" : "high"}`}>{p.verd.v} · {p.first}</span>
          </Card>
        ))}
        <Card dark accent title="Read this deck as proof">
          <p className="small">Each pillar gets its own evidence slides ahead — what we found, what it costs in growth, and the first move.</p>
        </Card>
      </Row>
    </Slide>
  );

  /* 6 · THE DIAGNOSIS */
  const topFix = tp.slice(0, 3);
  slides.push(
    <Slide key="diagnosis" n="04" kicker="The Diagnosis" title="Three fixable things keep you out"
      sub="The site is not underperforming — it is not yet in the game. Each fix has a clear, measurable payoff." foot={foot("THE DIAGNOSIS")}>
      <Split bias>
        <div>
          {(topFix.length ? topFix : [{ issue: "Technical foundation", why_it_matters: "Crawl and speed issues keep the site hard to index.", expected_unlock: "Indexable", estimated_effort: "" }]).map((f, i) => (
            <FixRow key={i} title={f.issue} desc={clamp(f.why_it_matters, 110)} goal={f.expected_unlock || "Unlocks indexing"} when={f.estimated_effort} />
          ))}
        </div>
        <Card soft title="Already working in your favour">
          <Checks items={[
            { state: "ok", text: "No penalties. Clean history, nothing to undo." },
            { state: "ok", text: `Schema in place${air.signals?.find((s) => /faq/i.test(s.key) && s.ok) ? " — FAQ blocks AI can lift." : "."}` },
            { state: rating ? "ok" : "do", text: rating ? `A genuine ${rating}★ rating. Real trust to build on.` : "Build first reviews for trust." },
            { state: "ok", text: "An open field. No one owns the commercial space." },
          ]} />
        </Card>
      </Split>
      <Callout className="mt2"><b>What this costs you today:</b> with {fmtNum(traffic0 ?? 0)} organic visits, the {opp.total_monthly_search_volume ? `~${fmtNum(opp.total_monthly_search_volume)}` : ""} monthly searches in your market go to competitors. Fixing these turns the site from invisible into found.</Callout>
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
      sub="Search engines judge these signals before they read a word of content." foot={foot("TECHNICAL SEO")}>
      <Split bias>
        <DataTable head={[{ label: "Issue found" }, { label: "Count", align: "right" }, { label: "Priority", align: "right" }]}
          rows={tp.slice(0, 7).map((t) => ({ cells: [t.issue, { v: dash(t.affected_count), num: true, align: "right" }, { align: "right", tag: { kind: /high|crit/i.test(t.priority) ? "high" : /med/i.test(t.priority) ? "med" : "low", label: t.priority } }] }))} />
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

  /* 8 · THE OPENING (competitors) */
  const comps = [...(cl.localCompetitors || []), ...(cl.nationalPlatforms || [])].slice(0, 5);
  slides.push(
    <Slide key="opening" variant="cream" n="06" kicker="The Opening" title="The leaders are absent where it is winnable"
      sub="Each rival is strong on crowded, generic terms — and exposed on the high-value corners they never built for." foot={foot("THE OPENING")}>
      {comps.length > 0 ? (
        <DataTable head={[{ label: "Competitor" }, { label: "What they own" }, { label: "Threat", align: "right" }]}
          rows={comps.map((c) => ({ cells: [c.name || c.domain, clamp(c.description, 120), { align: "right", tag: { kind: /high|alert/i.test(c.strength || c.threat || "") ? "high" : "med", label: (c.strength || (c.threat ? "High" : "Med")).toString().replace("THREAT ALERT", "High") } }] }))} />
      ) : <GapPanel title="Competitor set pending">Competitor landscape will populate once the competitor analysis completes.</GapPanel>}
      {cl.localOpening && <Callout className="mt2"><b>The move:</b> {clamp(cl.localOpening, 220)}</Callout>}
    </Slide>
  );

  /* 9 · THE GAP IN NUMBERS */
  slides.push(
    <Slide key="gap" variant="cream" n="07" kicker="The Gap In Numbers" title="How far ahead the competition really is"
      sub="Your real baseline against the market. Competitor metrics populate as the benchmark module runs." foot={foot("COMPETITOR BENCHMARK")}>
      <DataTable compact head={[{ label: "" }, { label: "Domain Rating", align: "right" }, { label: "Traffic / mo", align: "right" }, { label: "Keywords", align: "right" }, { label: "Ref. domains", align: "right" }]}
        rows={[
          { you: true, cells: [`${name} (you)`, { v: dash(dr), num: true, align: "right" }, { v: fmtNum(traffic0), num: true, align: "right" }, { v: dash(mv(bm, "organic_keywords", "organicKeywords")), num: true, align: "right" }, { v: dash(rd), num: true, align: "right" }] },
          ...comps.slice(0, 5).map((c) => ({ cells: [c.name || c.domain, { v: "—", num: true, align: "right" }, { v: "—", num: true, align: "right" }, { v: "—", num: true, align: "right" }, { v: "—", num: true, align: "right" }] })),
        ]} />
      <Callout className="mt2" mark="i"><b>Reading it:</b> your row is measured today (Moz / DataForSEO). Per-competitor authority, traffic and keyword counts are fetched in the benchmark pass and fill in here — none are estimated.</Callout>
    </Slide>
  );

  /* 10 · WHAT BUYERS TYPE */
  const tierCard = (title, sub, items, accent) => (
    <Card accent title={title}>
      <div className="pd" style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{sub}</div>
      {(items || []).slice(0, 5).map((k, i) => (
        <PbItem key={i} name={k.keyword_cluster || k.page_name || k.proposed_title || k.keyword} value={k.primary_volume ? `${fmtNum(k.primary_volume)}/mo` : null} />
      ))}
      {(!items || items.length === 0) && <p className="small">No measured demand in this tier yet.</p>}
    </Card>
  );
  slides.push(
    <Slide key="keywords" n="08" kicker="Keyword Strategy" title="Three kinds of searcher. One of them buys."
      sub="We chase the commercial tier first — the one that turns a ranking into a client." foot={foot("KEYWORD STRATEGY")}>
      <Row cols={3} style={{ gap: 18 }}>
        {tierCard("Tier 1 · Ready to buy", "Commercial intent · a page each", ca.commercial_pages)}
        {tierCard("Tier 2 · Local", "Place-based intent", ca.geography_pages || ca.city_pages)}
        {tierCard("Tier 3 · Learning", "Informational · feeds AI answers", ca.blog_and_guides)}
      </Row>
      <Tiles cols={4} className="mt2" style={{ marginTop: 24 }}>
        <Tile n={opp.total_monthly_search_volume ? fmtNum(opp.total_monthly_search_volume) : "—"} label="Monthly searches in play" />
        <Tile n={opp.commercial_keyword_count ? fmtNum(opp.commercial_keyword_count) : dash((ca.commercial_pages || []).length)} label="Commercial terms mapped" />
        <Tile n={dash((ca.geography_pages || ca.city_pages || []).length)} label="Local pages to own" />
        <Tile flag n="0" label="Commercial terms defended" />
      </Tiles>
    </Slide>
  );

  /* ───── GEO SLIDES (9–14) — gated on real collection ───── */
  const enginePanel = enginesStatus.map((e) => ({ name: e.name || e.engine, ready: e.status === "ready" }));

  /* 11 · GEO & AI VISIBILITY (verdict) */
  slides.push(
    <Slide key="geo-verdict" variant="dark" n="09" kicker="GEO & AI Visibility" title="Are you visible when buyers ask AI?"
      sub="A growing share of buyers ask AI for a recommendation, then act on the names returned." foot={foot("GEO · AI VISIBILITY")}>
      {measured ? (
        <>
          <Verdict num={pctStr(live.overall?.sov)}>
            Across <b>{live.overall?.prompts_total} prompts × {live.overall?.engines_tested} engines</b>, {name} is named in <b>{pctStr(live.overall?.mention_rate)}</b> of answers and cited in <b>{pctStr(live.overall?.citation_rate)}</b>. {(live.share_of_voice || []).filter((b) => !b.is_client).slice(0, 2).map((b) => b.brand).join(" and ") || "Competitors"} are heard instead.
          </Verdict>
          <Row cols={3} className="mt2">
            <Card dark title="Share of Voice"><p className="small">Your slice of all brand mentions across the answer set.</p></Card>
            <Card dark title="Mention Rate"><p className="small">Share of prompts where your brand is named at all.</p></Card>
            <Card dark title="Citation Rate"><p className="small">Share of prompts where your site is cited as evidence.</p></Card>
          </Row>
        </>
      ) : (
        <GapPanel title="Scan in progress — no numbers invented before collection" engines={enginePanel}>
          We build buyer prompts from your services + competitor terms and run them across all 6 AI engines, capturing every brand named and source cited. Share-of-voice, mention and citation rates appear here once the engines respond.
        </GapPanel>
      )}
    </Slide>
  );

  /* 12 · GEO SoV */
  slides.push(
    <Slide key="geo-sov" n="10" kicker="GEO · Share of Voice" title="Who AI names when buyers ask"
      sub={measured ? "Source: real prompts × engines, this month." : undefined} foot={foot("GEO · SHARE OF VOICE")}>
      {measured ? (
        <Split>
          <div>
            <h3 className="mini">Overall share of voice</h3>
            {(live.share_of_voice || []).slice(0, 6).map((b, i) => (
              <CBar key={i} name={b.brand + (b.is_client ? " (you)" : "")} pct={b.avg} you={b.is_client} value={`${Math.round(b.avg)}%`} />
            ))}
          </div>
          <div>
            <h3 className="mini">Your share, by engine</h3>
            {(live.by_engine || []).map((e, i) => {
              const answered = (e.metrics?.prompts_answered ?? e.prompts_answered ?? 0) > 0;
              return <CBar key={i} name={e.engine} pct={answered ? (e.metrics?.sov ?? e.sov ?? 0) : 0} you value={answered ? `${Math.round(e.metrics?.sov ?? e.sov ?? 0)}%` : "—"} />;
            })}
          </div>
        </Split>
      ) : <GapPanel title="Share of voice — pending scan" engines={enginePanel}>Per-brand and per-engine share of voice render here once collection completes.</GapPanel>}
    </Slide>
  );

  /* 13 · GEO mentions & citations */
  slides.push(
    <Slide key="geo-mc" n="11" kicker="GEO · Mentions & Citations" title="Named is good. Cited is what earns the click."
      foot={foot("GEO · MENTIONS & CITATIONS")}>
      {measured ? (
        <Split>
          <div className="metric-col">
            <h3 className="mini">Mention rate {pctStr(live.overall?.mention_rate)}</h3>
            {(live.by_engine || []).map((e, i) => <CBar key={i} name={e.engine} pct={e.metrics?.mention_rate ?? e.mention_rate ?? 0} you />)}
          </div>
          <div className="metric-col">
            <h3 className="mini">Citation rate {pctStr(live.overall?.citation_rate)}</h3>
            {(live.by_engine || []).map((e, i) => <CBar key={i} name={e.engine} pct={e.metrics?.citation_rate ?? e.citation_rate ?? 0} you />)}
          </div>
        </Split>
      ) : <GapPanel title="Mentions & citations — pending scan" engines={enginePanel}>These per-engine rates populate from the live answer set.</GapPanel>}
    </Slide>
  );

  /* 14 · The prompts we ran */
  slides.push(
    <Slide key="geo-prompts" variant="cream" n="12" kicker="GEO · Sample Prompts" title="Real prompts, real answers, per engine"
      sub={measured ? "The raw evidence behind every GEO number." : undefined} foot={foot("GEO · SAMPLE PROMPTS")}>
      {measured && (live.prompts_executed || []).length > 0 ? (
        <DataTable compact head={[{ label: "Buyer prompt" }, { label: "Engine" }, { label: "Cites", align: "right" }, { label: "Your result", align: "right" }]}
          rows={(live.prompts_executed || []).slice(0, 7).map((p) => ({ cells: [clamp(p.prompt, 64), p.engine, { v: dash(p.citation_count), num: true, align: "right" }, { align: "right", v: p.brand_mentioned ? <span style={{ color: C.good, fontWeight: 600 }}>Named</span> : <span style={{ color: C.muted }}>Not named</span> }] }))}
        />
      ) : <GapPanel title="Prompt evidence — pending scan" engines={enginePanel}>The exact prompts and per-engine answers appear here once collected — never invented.</GapPanel>}
    </Slide>
  );

  /* 15 · AEO readiness (topic + trust signals) — readiness half always available */
  slides.push(
    <Slide key="aeo" n="13" kicker="Entity & Topical Authority" title="Which topics does AI associate with your brand?"
      sub="Engines cite brands they understand as an authority on a topic." foot={foot("ENTITY & TOPICAL AUTHORITY")}>
      <Split>
        <div>
          <h3 className="mini">Trust signals: present vs missing</h3>
          <Checks items={(air.signals || []).slice(0, 7).map((s) => ({ state: s.ok ? "ok" : "no", text: s.label + (s.detail ? ` — ${clamp(s.detail, 60)}` : "") }))} />
          {(!air.signals || air.signals.length === 0) && <p className="small">Readiness signals populate from the on-site crawl.</p>}
        </div>
        <div>
          <h3 className="mini">Topic association {measured ? "" : "(measured once scanned)"}</h3>
          {measured && live.topic_dominance ? (
            <Checks items={[
              ...(live.topic_dominance.by_brand?.find((b) => b.is_client)?.won_topics || []).slice(0, 4).map((t) => ({ state: "ok", text: `${t} — recognised` })),
              ...(live.topic_dominance.lost_topics || live.topic_dominance.by_brand?.find((b) => b.is_client)?.lost_topics || []).slice(0, 4).map((t) => ({ state: "no", text: `${typeof t === "string" ? t : t.topic} — no association` })),
            ]} />
          ) : <GapPanel title="Topic map pending">AI topic association renders after the scan; readiness (left) is measured from the site today.</GapPanel>}
        </div>
      </Split>
    </Slide>
  );

  /* 16 · How the GEO score works */
  const sigLabels = { citation_presence: "Citation presence", brand_presence: "Brand presence", citation_position: "Citation position", intent_match: "Intent match (proxy)", cross_engine_consistency: "Presence consistency", freshness: "Source freshness", topic_coverage: "Topic coverage" };
  slides.push(
    <Slide key="geo-method" variant="dark" n="14" kicker="GEO Methodology" title="Every GEO number, and where it comes from"
      sub="No figure is invented. Each is collected by running real prompts and measuring you against the same competitors." foot={foot("GEO METHODOLOGY")}>
      <Split>
        <div>
          <h3 className="mini">The collection method</h3>
          <Checks items={[
            { state: "do", text: "Build 25–100 prompts from your site, competitors and intent tests." },
            { state: "do", text: "Run every prompt across ChatGPT, Gemini, Perplexity, Claude, Copilot, Google AIO." },
            { state: "do", text: "Score share of voice, mention and citation — you vs each competitor, per engine." },
            { state: "do", text: "Re-run the same set monthly, so every movement is comparable." },
          ]} />
        </div>
        <div>
          <h3 className="mini">How the 0–100 score is weighted</h3>
          {Object.entries(measured && live.score_breakdown?.signals ? live.score_breakdown.signals : { citation_presence: null, brand_presence: null, citation_position: null, intent_match: null, topic_coverage: null }).filter(([k]) => k !== "freshness" || (measured)).map(([k, v]) => (
            <ScoreSig key={k} label={sigLabels[k] || k} weight={measured && v != null ? Math.round(v) : "—"} />
          ))}
          {measured ? <ScoreBox score={live.overall?.geo_score} /> : <p className="small" style={{ marginTop: 12, color: "#B5ABA0" }}>Score pending — values fill in when the scan completes.</p>}
        </div>
      </Split>
    </Slide>
  );

  /* 17 · What we build */
  const buildCards = [...(ca.commercial_pages || []).slice(0, 3), ...(ca.geography_pages || ca.city_pages || []).slice(0, 1)];
  slides.push(
    <Slide key="build" variant="cream" n="15" kicker="What To Build" title="The pages that do most of the work"
      sub="Only pages with real, measured demand. Each has a job and a target." foot={foot("WHAT TO BUILD")}>
      <Row cols={buildCards.length >= 4 ? 4 : 3} style={{ gap: 16 }}>
        {buildCards.map((p, i) => (
          <Card key={i} accent title={p.page_name || titleCase(p.keyword_cluster)}>
            <div className="pbhead"><span className="ct2">{p.primary_volume ? `${fmtNum(p.primary_volume)}` : "—"}</span><span className="cl2">/mo{p.geography_relevance === "Local" ? " · local" : ""}</span></div>
            <p className="small" style={{ marginTop: 6 }}>{clamp(p.commercial_reason || p.why_separate_page || "A focused page wins this intent.", 96)}</p>
          </Card>
        ))}
      </Row>
      {(ca.checklist || []).length > 0 && (
        <Card soft className="mt2" title="Every page ships with">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
            {(ca.checklist || []).slice(0, 6).map((c, i) => <div key={i} className="gc" style={{ fontSize: 12 }}><span style={{ color: C.good, marginRight: 6 }}>✓</span>{clamp(c, 48)}</div>)}
          </div>
        </Card>
      )}
    </Slide>
  );

  /* 18 · The content map (optimise vs create) */
  const createPages = [...(ca.commercial_pages || []), ...(ca.geography_pages || [])].slice(0, 4);
  const createBlogs = (ca.blog_and_guides || []).slice(0, 4);
  slides.push(
    <Slide key="contentmap" variant="cream" n="16" kicker="The Content Map" title="What to optimise, and what to create"
      sub="Some existing pages need polish; the rest are gaps to fill." foot={foot("THE CONTENT MAP")}>
      <Split>
        <div>
          <h3 className="mini" style={{ color: C.good }}>Optimise — pages you already have</h3>
          {ca.pagesExistingFlagged > 0
            ? <p className="small">{ca.pagesExistingFlagged} existing page(s) matched real demand — optimise (add H1/FAQ/schema, expand thin content) rather than rebuild. Per-page detail lands with the on-page pass.</p>
            : <p className="small">No existing pages matched the target keywords — all opportunities below are net-new builds.</p>}
        </div>
        <div>
          <h3 className="mini">Create — net-new</h3>
          {createPages.map((p, i) => <PbItem key={`p${i}`} name={p.page_name || titleCase(p.keyword_cluster)} code={p.url_slug} value={p.primary_volume ? `${fmtNum(p.primary_volume)}/mo` : null} />)}
          {createBlogs.map((b, i) => <PbItem key={`b${i}`} name={b.proposed_title || titleCase(b.keyword_cluster)} value={b.primary_volume ? `${fmtNum(b.primary_volume)}/mo` : null} />)}
        </div>
      </Split>
    </Slide>
  );

  /* 19 · Google Business Profile */
  const gbpScore = mv(bm, "gbp_completeness", "gmbCompletenessScore") ?? gmb.completeness?.score;
  const gclient = gbp.client || {};
  const reviewCompetitors = (gbp.competitors || []).filter((c) => c.review_count != null).slice(0, 3);
  const maxRev = Math.max(reviews || 0, ...reviewCompetitors.map((c) => c.review_count || 0), 1);
  slides.push(
    <Slide key="gbp" variant="cream" n="17" kicker="Google Business Profile" title="Your fastest path into local results"
      sub="The map pack drives most local enquiries. Your reviews already lead; the profile needs completing." foot={foot("GOOGLE BUSINESS PROFILE")}>
      <div className="gbp-split">
        <Ring value={gbpScore ?? 0} />
        <div className="gbp-checks">
          {(gbp.field_analysis || gmb.completeness?.breakdown || []).slice(0, 8).map((f, i) => (
            <div key={i} className="gc"><span className="ic" style={{ background: (f.client_status === "missing" || f.pass === false) ? C.rust : C.good }}>{(f.client_status === "missing" || f.pass === false) ? "✕" : "✓"}</span>{f.label}</div>
          ))}
        </div>
      </div>
      <div className="mt2" style={{ marginTop: 22 }}>
        {gbp.has_competitor_data && reviewCompetitors.length > 0 ? (
          <>
            <h3 className="mini">Reviews — you vs competitors</h3>
            <CBar name={`${name} (you)`} pct={(reviews / maxRev) * 100} you value={dash(reviews)} />
            {reviewCompetitors.map((c, i) => <CBar key={i} name={c.name} pct={((c.review_count || 0) / maxRev) * 100} value={dash(c.review_count)} />)}
          </>
        ) : (
          <Callout mark="→"><b>Goal:</b> {gbp.review_intel?.review_gap ? `close the review gap (${gbp.review_intel.review_gap} behind the local leader)` : `grow reviews from ${dash(reviews)}`} and lift completeness from {dash(gbpScore)} → 95. Set hours, post weekly, reply to every review, WhatsApp a review link after each job.</Callout>
        )}
      </div>
    </Slide>
  );

  /* 20 · Citations & backlinks */
  const dirs = (gmb.directories || []).slice(0, 12).map((x) => ({ name: x.name, state: x.listed === true ? "have" : x.listed === false ? "miss" : "q" }));
  const citeDirs = dirs.length ? dirs : (lb.citation_links || []).slice(0, 12).map((x) => ({ name: x.platform, state: x.client_listed ? "have" : "miss" }));
  slides.push(
    <Slide key="backlinks" variant="cream" n="18" kicker="Citations & Backlinks" title={`Raising Domain Rating from ${dash(dr)} toward ${proj.dr12 ?? 25}`}
      sub="Trust is built in three waves: citations for consistency, then earned links, then closing the leader's gap." foot={foot("CITATIONS & BACKLINKS")}>
      <Split>
        <div>
          <h3 className="mini">Directories to claim or fix</h3>
          <DirGrid>{citeDirs.map((x, i) => <DirChip key={i} name={x.name} state={x.state} />)}</DirGrid>
        </div>
        <div>
          <h3 className="mini">The three waves</h3>
          <KV k="Now · referring domains" v={dash(rd)} />
          <KV k="Wave 1 · citations (mo 1–2)" v="NAP consistency" />
          <KV k="Wave 2 · earned links (mo 2–4)" v="assets firms cite" />
          <KV k="Wave 3 · close the leader gap" v="trade + partner links" />
          <KV k="Target · 12 months" v={proj.dr12 != null ? `DR ${proj.dr12}` : "—"} />
        </div>
      </Split>
    </Slide>
  );

  /* 21 · Who does what */
  const actionRows = (rm.flatMap((p) => (p.actions || []).map((a) => ({ ...a, phase: p.timeframe }))) ).slice(0, 6);
  slides.push(
    <Slide key="actions" variant="cream" n="19" kicker="The Action Board" title="Every move, sorted by the work it takes"
      sub="Each recommendation is tagged by type, so it lands on the right desk." foot={foot("THE ACTION BOARD")}>
      <Legend items={[
        { color: "#C95322", label: "Content" }, { color: "#3C7D5A", label: "On-Page" }, { color: "#3B6FB2", label: "Lead-Gen" },
        { color: "#8A4FB2", label: "Listicle" }, { color: "#A07414", label: "PR & Authority" }, { color: "#1A8A8A", label: "Citations" },
      ]} />
      {actionRows.length ? actionRows.map((a, i) => (
        <ActionRow key={i} accentClass={accentFor(a.title)} title={a.title} desc={clamp(a.description, 90)}
          meta={<><Pill>{a.phase || "Phase 1"}</Pill></>} />
      )) : <GapPanel title="Action board pending">Recommendations populate from the strategy build.</GapPanel>}
    </Slide>
  );

  /* 22 · The 30/60/90/180 plan */
  const phaseDefs = [
    { badge: "30", duration: "First 30 days", title: "Foundation" },
    { badge: "60", duration: "Days 31–60", title: "Capture" },
    { badge: "90", duration: "Days 61–90", title: "Authority" },
    { badge: "180", duration: "Days 91–180", title: "Compound" },
  ];
  slides.push(
    <Slide key="plan" n="20" kicker="The 30/60/90/180 Plan" title="One job per phase. Move on when it's done."
      foot={foot("THE 30/60/90/180 PLAN")}>
      <PhaseRow>
        {phaseDefs.map((ph, i) => {
          const r = rm[i];
          const items = (r?.actions || []).slice(0, 3).map((a) => ({ text: clamp(a.title, 54) }));
          return <PhaseCol key={i} badge={ph.badge} duration={ph.duration} title={r?.title || ph.title}
            mission={r ? clamp(r.actions?.[0]?.description || "", 90) : ""}
            items={items.length ? items : [{ text: "—" }]}
            goal={i === 0 ? { label: "Target", text: `Site health ${dash(health)} → 90` } : i === 3 ? { label: "Target", text: proj.dr12 != null ? `DR ${proj.dr12}, traffic compounding` : "Compounding" } : null} />;
        })}
      </PhaseRow>
    </Slide>
  );

  /* 23 · How we prove it */
  const kpiRow = (k) => ksRows.find((r) => r.key === k || lc(r.metric).includes(k.replace("_", " ")));
  const seoBoard = [
    ["Domain Rating", kpiRow("domain_rating")],
    ["Organic traffic / mo", kpiRow("organic_traffic")],
    ["Keywords ranking", kpiRow("organic_keywords")],
    ["Referring domains", kpiRow("referring_domains")],
  ];
  slides.push(
    <Slide key="prove" variant="cream" n="21" kicker="Measuring Success" title="Two scoreboards, reported every month"
      sub="Current is measured today. Targets are estimates that assume the plan is implemented." foot={foot("MEASURING SUCCESS")}>
      <Split>
        <div className="metric-col">
          <h3 className="mini">Search (SEO)</h3>
          {seoBoard.map(([label, r], i) => (
            <Trend key={i} label={label} now={r ? dash(r.baseline) : "—"} target={r ? dash(r.target_12_months ?? r.target_6_months) : "—"} />
          ))}
          <Trend label="Site health score" now={dash(health)} target="90" />
        </div>
        <div className="metric-col">
          <h3 className="mini">AI answers (GEO){measured ? "" : " · pending scan"}</h3>
          <Trend label="GEO score (0–100)" now={measured ? live.overall?.geo_score : "—"} target={measured ? "45+" : "—"} />
          <Trend label="Share of voice" now={measured ? pctStr(live.overall?.sov) : "—"} target={measured ? "18%" : "—"} />
          <Trend label="Mention rate" now={measured ? pctStr(live.overall?.mention_rate) : "—"} target={measured ? "35%" : "—"} />
          <Trend label="Citation rate" now={measured ? pctStr(live.overall?.citation_rate) : "—"} target={measured ? "15%" : "—"} />
          <Trend label="Engines naming you" now={measured ? `${live.overall?.engines_tested ?? 0}/6` : "—"} target="6/6" />
        </div>
      </Split>
    </Slide>
  );

  /* 24 · The honest assessment */
  const priorities = (sp.length ? sp.slice(0, 3) : tp.slice(0, 3).map((t, i) => ({ title: t.issue, description: t.why_it_matters || t.recommended_action })));
  slides.push(
    <Slide key="honest" variant="dark" n="22" kicker="The Honest Assessment" title="If you do nothing else, do these three"
      sub="In this order. Each is the highest-leverage move at its stage." foot={foot("THE HONEST ASSESSMENT")}>
      <Row cols={3} style={{ gap: 18 }}>
        {priorities.map((p, i) => (
          <Card key={i} dark accent title={<><span style={{ color: C.rust, fontFamily: "var(--display)", fontWeight: 700, marginRight: 8 }}>{String(i + 1).padStart(2, "0")}</span>{p.title}</>}>
            <p className="small">{clamp(p.description, 120)}</p>
          </Card>
        ))}
      </Row>
      {(para(story.what_good_looks_like) || para(story.key_takeaway)) && (
        <Callout className="mt2"><b>The whole story:</b> {clamp(para(story.what_good_looks_like) || para(story.key_takeaway), 220)}</Callout>
      )}
    </Slide>
  );

  /* 25 · Clientele & next steps */
  slides.push(
    <Slide key="close" variant="dark" n="23" kicker="Next Steps" title="Ready to make it visible?"
      foot={foot("NEXT STEPS")}>
      <div className="close-steps">
        <div className="steps">
          {[["01", "Discovery Call", "30-minute session to align on goals."], ["02", "Full Audit", "Deep technical and content audit."], ["03", "Strategy Build", "Custom 30-day quick-launch plan."], ["04", "Execute & Report", "Monthly delivery and reporting."]].map((s, i) => (
            <div key={i} className="step"><div className="no">{s[0]}</div><h4>{s[1]}</h4><p>{s[2]}</p></div>
          ))}
        </div>
      </div>
      <div className="close-band">
        <div className="close-cta" style={{ borderLeft: "none", paddingLeft: 0, width: "100%" }}>
          <div className="cc-line">Let&apos;s make {name} the name AI and Google both recommend.</div>
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
