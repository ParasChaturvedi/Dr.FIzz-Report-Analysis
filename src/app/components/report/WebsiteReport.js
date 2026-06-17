"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// Reference-deck design tokens (sampled exact from the OnitServices reference PDF).
const LOGO_WHITE = "/brand/doctorfizz-white.png"; // white wordmark + orange gauge "O" — dark bg
const LOGO_BLACK = "/brand/doctorfizz-black.png"; // black wordmark + orange gauge "O" — light bg
const ORANGE = "#C35328";  // flat burnt orange — the only accent (no gradients/gold)
const INK = "#0E0E0E";     // cover + dark slides
const HEAD = "'Trebuchet MS', 'Segoe UI', var(--font-inter), system-ui, sans-serif"; // rounded bold display
const BODY = "Calibri, 'Segoe UI', var(--font-inter), system-ui, sans-serif";         // neutral body

// DOCTORFIZZ wordmark — real asset per background (NO css-invert, so the orange "O" survives).
function ItzFizzLogo({ white = false, size = "md" }) {
  const dim = size === "lg" ? 44 : size === "sm" ? 20 : 30;
  return (
    <img
      src={white ? LOGO_WHITE : LOGO_BLACK}
      alt="DoctorFizz"
      style={{ height: dim, width: "auto", objectFit: "contain", display: "block" }}
    />
  );
}

function AnimatedSection({ children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          ref.current.classList.add("opacity-100", "translate-y-0");
          ref.current.classList.remove("opacity-0", "translate-y-5");
          obs.unobserve(ref.current);
        }
      },
      { threshold: 0.06 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`opacity-0 translate-y-5 transition-all duration-700 ease-out ${className}`}>
      {children}
    </div>
  );
}

// Reference section header = small eyebrow "▪ 0N · NAME" + big Trebuchet title + hairline.
// SNum/SNumDark render "▪ 0N ·", SHead renders the NAME (inline, same line), OBar is
// retired (null), SSub is the big Title-Case heading. Section call-sites stay unchanged.
function Eyebrow({ n }) {
  return (
    <span className="inline-flex items-center align-middle" style={{ marginRight: 9 }}>
      <span style={{ width: 11, height: 11, background: ORANGE, display: "inline-block", borderRadius: 1, marginRight: 9 }} />
      <span className="uppercase" style={{ fontFamily: BODY, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", color: ORANGE }}>{String(n).padStart(2, "0")} ·</span>
    </span>
  );
}
function SNum({ n }) { return <Eyebrow n={n} />; }
function SNumDark({ n }) { return <Eyebrow n={n} />; }
function OBar() { return null; }

function SHead({ children, white = false }) {
  return (
    <span className="uppercase align-middle" style={{ fontFamily: BODY, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", color: white ? "#9A9A9A" : "#7A7A7A" }}>{children}</span>
  );
}

function SSub({ children, white = false }) {
  return (
    <>
      <h2 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "clamp(1.55rem,3vw,2.25rem)", lineHeight: 1.12, letterSpacing: "-0.01em", color: white ? "#FFFFFF" : INK, marginTop: 12 }}>{children}</h2>
      <div style={{ height: 1, background: white ? "rgba(255,255,255,0.12)" : "#E5E5E5", marginTop: 16, marginBottom: 28 }} />
    </>
  );
}

function PBadge({ p }) {
  const map = {
    CRITICAL: { background: ORANGE, color: "#fff" },
    HIGH:     { background: "#4A4A4A", color: "#fff" },
    MEDIUM:   { background: "#8A8A8A", color: "#fff" },
    LOW:      { background: "#BDBDBD", color: "#fff" },
  };
  const s = map[p] || { background: "#9A9A9A", color: "#fff" };
  return (
    <span className="inline-block px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest" style={s}>
      {p}
    </span>
  );
}

// Reference metric card — white card, thin border, subtle shadow, LEFT accent bar,
// big Trebuchet number + bold label + grey sub-label (matches reference p2 baseline cards).
function MetricCard({ value, label, sub, accent = "ink" }) {
  const c = accent === "orange" ? ORANGE : INK;
  return (
    <div className="flex rounded-lg overflow-hidden bg-white" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ width: 4, background: c, flexShrink: 0 }} />
      <div className="flex items-center gap-4 px-5 py-5 w-full">
        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "32px", lineHeight: 1, color: c, whiteSpace: "nowrap" }}>{value}</div>
        <div className="min-w-0">
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "12.5px", color: INK }}>{label}</div>
          {sub && <div style={{ fontFamily: BODY, fontSize: "11px", color: "#8A8A8A", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

// Dark callout (orange left bar + label + body) — reference KEY TAKEAWAY / The Local Opening.
function DarkCallout({ label, children }) {
  return (
    <div className="rounded-lg overflow-hidden flex" style={{ background: INK }}>
      <div style={{ width: 4, background: ORANGE, flexShrink: 0 }} />
      <div className="px-6 py-5">
        <div className="uppercase mb-1.5" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.24em", color: ORANGE }}>{label}</div>
        <p style={{ fontFamily: BODY, fontSize: "14px", lineHeight: 1.6, color: "#D8D8D8" }}>{children}</p>
      </div>
    </div>
  );
}

// §14-25 GEO renderer (reference light style). Renders the FULL model (geo_score, SoV,
// metrics, topic dominance, citation intelligence, Claude deep analysis) when a live scan
// exists, and ALWAYS renders the readiness scorecard + tracked prompts + actions. Reads
// data.doctorFizz.geo_and_ai_visibility so NO GEO data is lost on the reference layout.
function GeoVisibility({ geo = {}, domain, gf = {} }) {
  const m = geo;
  const cardB = { border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" };
  const cell = { fontFamily: BODY, fontSize: "12px", padding: "8px 12px" };
  const thS = { fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "9px 12px", textAlign: "left", color: "#fff" };
  const Lbl = ({ children }) => <div className="uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: ORANGE, marginBottom: 8 }}>{children}</div>;
  return (
    <div className="space-y-4">
      {m.current_ai_citation_count && (
        <DarkCallout label="AI Citation Status">{domain}&apos;s current AI-citation footprint: <strong style={{ color: "#fff" }}>{m.current_ai_citation_count}</strong>. The actions below make the site liftable by ChatGPT, Google AI Overviews, and Perplexity.</DarkCallout>
      )}

      {m.geo_score && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <div className="flex items-baseline gap-3 flex-wrap mb-2">
            <Lbl>GEO Score</Lbl>
            <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "26px", color: INK }}>{m.geo_score.score}<span style={{ fontSize: "13px", color: "#8A8A8A" }}>/100</span></span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: ORANGE, color: "#fff" }}>{m.geo_score.band}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontFamily: BODY, fontSize: "11px", color: "#6B6B6B" }}>
            {Object.entries(m.geo_score.breakdown || {}).map(([k, v]) => <span key={k}>{k.replace(/_/g, " ")}: <strong style={{ color: INK }}>{v}</strong></span>)}
          </div>
        </div>
      )}

      {m.geo_metrics && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>GEO Metrics — overall + per engine</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}>{["Engine", "SoV", "Comp SoV", "Mentions", "Citations", "Cit. score", "Position", "Topic", "Intent", "GEO"].map((h, i) => <th key={i} style={{ ...thS, textAlign: i ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {[{ label: "Overall", mm: m.geo_metrics.overall, hl: true }, ...m.geo_metrics.engines.map((e) => ({ label: e, mm: m.geo_metrics.by_engine[e] || {}, hl: false }))].map((r, i) => (
                <tr key={i} style={{ background: r.hl ? "#FBF1EB" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                  <td style={{ ...cell, fontWeight: r.hl ? 700 : 400 }}>{r.label}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{r.mm.sov}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.competitor_sov}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.brand_mentions}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.brand_citations}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.citation_score}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.citation_position_score}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.topic_coverage}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.intent_match}%</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: ORANGE }}>{r.mm.geo_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {m.share_of_voice && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>AI Share of Voice — by engine (estimate)</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Brand</th>{m.share_of_voice.engines.map((e, i) => <th key={i} style={{ ...thS, textAlign: "right" }}>{e}</th>)}<th style={{ ...thS, textAlign: "right" }}>Avg</th></tr></thead>
            <tbody>
              {m.share_of_voice.by_brand.map((b, i) => (
                <tr key={i} style={{ background: b.is_client ? "#FBF1EB" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                  <td style={{ ...cell, fontWeight: b.is_client ? 700 : 400, color: b.is_client ? ORANGE : INK }}>{b.brand}{b.is_client ? " (you)" : ""}</td>
                  {m.share_of_voice.engines.map((e, j) => <td key={j} style={{ ...cell, textAlign: "right" }}>{b.per_engine[e]}%</td>)}
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{b.avg}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {m.topic_dominance && m.topic_dominance.total_topics > 0 && (
        <div className="rounded-lg overflow-hidden bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Topic Dominance — who leads each AI query</Lbl></div>
          <div className="px-3 pb-2" style={{ fontFamily: BODY, fontSize: "12px", color: "#6B6B6B" }}>You lead <strong style={{ color: INK }}>{m.topic_dominance.client_topics_led}</strong> of {m.topic_dominance.total_topics} topics ({m.topic_dominance.client_lead_share}%).</div>
          {(m.topic_dominance.lost_topics || []).length > 0 && (
            <div className="px-3 py-2" style={{ borderTop: "1px solid #EEE" }}>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "11px", color: "#B3261E", marginBottom: 4 }}>Lost topics — a competitor leads where you&apos;re absent</div>
              <div className="flex flex-wrap gap-1.5">{m.topic_dominance.lost_topics.map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full" style={{ fontFamily: BODY, fontSize: "11px", background: "#FBE9E7", color: "#B3261E" }}>&ldquo;{t.topic}&rdquo; → {t.lead}</span>)}</div>
            </div>
          )}
        </div>
      )}

      {m.geo_insights && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>AI Visibility — Deep Analysis</Lbl>
          {m.geo_insights.summary && <p style={{ fontFamily: BODY, fontSize: "13px", color: INK, lineHeight: 1.6, marginBottom: 8 }}>{m.geo_insights.summary}</p>}
          {(m.geo_insights.actions || []).map((a, i) => <div key={i} className="flex gap-2" style={{ fontFamily: BODY, fontSize: "12.5px", color: "#5A5A5A", marginBottom: 3 }}><span style={{ color: ORANGE }}>✓</span>{a}</div>)}
        </div>
      )}

      {m.citation_analysis && (m.citation_analysis.most_cited_domains || []).length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Most-Cited Sources — what AI quotes instead of you</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Source</th><th style={{ ...thS, textAlign: "right" }}>Pages</th><th style={{ ...thS, textAlign: "right" }}>Responses</th><th style={thS}>Type</th></tr></thead>
            <tbody>{m.citation_analysis.most_cited_domains.map((dm, i) => (
              <tr key={i} style={{ background: dm.is_client ? "#FBF1EB" : dm.is_competitor ? "#FBE9E7" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                <td style={cell}>{dm.domain}</td><td style={{ ...cell, textAlign: "right" }}>{dm.pages_cited}</td><td style={{ ...cell, textAlign: "right" }}>{dm.responses}</td><td style={cell}>{dm.type}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {(m.geo_readiness || []).length > 0 && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>AI / LLM Readiness</Lbl>
          {m.geo_readiness.map((f, i) => { const ok = /present|strong|moderate/i.test(f.status); return (
            <div key={i} className="flex items-start gap-2.5 py-1.5" style={{ borderBottom: i < m.geo_readiness.length - 1 ? "1px solid #EEE" : "none" }}>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 text-center" style={{ background: ok ? "#E3F0E6" : "#FBE9E7", color: ok ? "#1E7B3E" : "#B3261E", minWidth: 74 }}>{f.status}</span>
              <div><div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "12.5px", color: INK }}>{f.factor}</div><div style={{ fontFamily: BODY, fontSize: "11.5px", color: "#6B6B6B" }}>{f.detail}</div></div>
            </div>
          ); })}
        </div>
      )}

      {(m.tracked_prompts || []).length > 0 && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>Prompts We Track — AI Search Visibility</Lbl>
          <div className="flex flex-wrap gap-1.5 mb-2">{m.tracked_prompts.map((p, i) => <span key={i} className="px-2 py-0.5 rounded-full" style={{ fontFamily: BODY, fontSize: "11px", border: "1px solid #E5E5E5", color: INK }}>&ldquo;{p}&rdquo;</span>)}</div>
          {(m.ai_platforms || []).length > 0 && <div className="flex flex-wrap gap-1.5">{m.ai_platforms.map((pl, i) => <span key={i} className="px-2 py-0.5 rounded" style={{ fontFamily: BODY, fontSize: "10px", background: "#F2EEE9", color: "#6B6B6B" }}>{pl.platform}: {pl.visibility}</span>)}</div>}
        </div>
      )}

      {((m.recommended_actions || gf.howToEarnCitations || []).length > 0) && (
        <div className="rounded-lg bg-white p-6" style={cardB}>
          <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "16px", color: INK, marginBottom: 14 }}>How To Earn AI Citations</div>
          <ul className="space-y-3">{(m.recommended_actions || gf.howToEarnCitations).map((step, i) => (
            <li key={i} className="flex items-start gap-3" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.55 }}><span style={{ color: ORANGE, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{step}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

// Real partner logos (rendered on a dark slide, matching the reference track-record page).
const CLIENT_LOGOS = [
  { name: "Acenteus Accounting", file: "/clientele/acenteus.png" },
  { name: "AxXonet",             file: "/clientele/axxonet.png" },
  { name: "RNB Hospitality",     file: "/clientele/rnb.png" },
  { name: "Loyora Design",       file: "/clientele/loyora.png" },
  { name: "DexWin",              file: "/clientele/dexwin.png" },
  { name: "AVIA",                file: "/clientele/avia.png" },
  { name: "Waterstone",          file: "/clientele/waterstone.png" },
  { name: "tipplr",              file: "/clientele/tipplr.png" },
  { name: "Content Whale",       file: "/clientele/contentwhale.png" },
  { name: "Shiva Manvi",         file: "/clientele/shivamanvi.png" },
  { name: "Vakkal Impex",        file: "/clientele/vakkalimpex.png" },
  { name: "Scripple Masters",    file: "/clientele/scripplemasters.png" },
];

const N = 18; // total sections

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function WebsiteReport({ data }) {
  const d = data || {};
  const domain = d.domain || "yourdomain.com";
  const bd = d.businessData || {};
  const loc = bd.location || bd.city || bd.market || bd.region || bd.address || "";
  const marketLabel = loc ? `${loc} Market` : "";
  const bm = d.baselineMetrics || {};
  const cl = d.competitorLandscape || {};
  const ks = d.keywordStrategy || {};
  const ca = d.contentArchitecture || {};
  const ci = d.competitiveIntelligence || {};
  const tp = Array.isArray(d.technicalPriorities) ? d.technicalPriorities : [];
  const lb = d.linkBuilding || {};
  const ls = d.localSearch || {};
  const rm = Array.isArray(d.roadmap) ? d.roadmap : [];
  const cb = Array.isArray(d.contentBlueprint) ? d.contentBlueprint : [];
  const uc = Array.isArray(d.uncontested) ? d.uncontested : [];
  const gf = d.geoFrontier || {};
  const qw = Array.isArray(d.quickWins180) ? d.quickWins180 : [];
  const sp = Array.isArray(d.strategicPriorities) ? d.strategicPriorities : [];
  const msRows = Array.isArray(d.measuringSuccessRows) ? d.measuringSuccessRows : null;

  // Real enriched data for enhanced sections
  const gmbInfo = d.gmbCheck?.gmb || null;
  const gmbScore = d.gmbCheck?.completeness?.score ?? bm.gmbCompletenessScore ?? null;
  const crawlHealth = d.websiteCrawl?.healthScore ?? bm.crawlHealthScore ?? null;
  const kwGap = d.keywordGap || null;

  const dateStr = d.generatedAt
    ? new Date(d.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Clean integer formatting for counts (rounds stray floats like 1289.367 → "1,289",
  // adds thousands separators). Leaves pre-formatted strings ("1.3K") and "—" untouched.
  const fmt = (v) => {
    if (v == null || v === "") return "—";
    const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
    if (!isFinite(n)) return String(v);
    return Math.round(n).toLocaleString("en-US");
  };

  return (
    <div id="report-content" className="bg-white text-gray-900 antialiased" style={{ fontFamily: BODY }}>

      {/* ══════════════════════════════════════════════════════
          COVER PAGE
      ══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden min-h-screen flex flex-col justify-center" style={{ background: INK, color: "#fff" }}>
        <div className="w-full max-w-6xl mx-auto px-10 md:px-16 py-20">
          <ItzFizzLogo white size="lg" />
          <div className="h-[3px] w-12 mt-6 mb-7" style={{ background: ORANGE }} />
          <div className="text-[12px] font-semibold uppercase mb-5" style={{ fontFamily: BODY, letterSpacing: "0.34em", color: ORANGE }}>
            SEO &amp; GEO Strategy
          </div>
          <h1 className="font-bold mb-7" style={{ fontFamily: HEAD, fontSize: "clamp(2.6rem,6.5vw,5rem)", lineHeight: 1.02, letterSpacing: "-0.01em", color: "#fff" }}>
            {domain}
          </h1>
          <p className="max-w-2xl mb-16" style={{ fontFamily: BODY, fontSize: "16px", lineHeight: 1.65, color: "#B8B8B8" }}>
            A data-led plan to grow {domain}&apos;s organic search visibility{loc ? ` across the ${loc} market` : ""}, built by reverse-engineering the competitors that already rank.
          </p>
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[13px]" style={{ fontFamily: BODY }}>
            {marketLabel && <span className="font-bold" style={{ color: "#fff" }}>{marketLabel}</span>}
            <span style={{ color: "#8A8A8A" }}>{dateStr}</span>
            <span style={{ color: "#8A8A8A" }}>Prepared by <span className="font-semibold" style={{ color: "#D8D8D8" }}>DOCTORFIZZ</span></span>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          01 · THE BASELINE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={1} total={N} />
          <OBar />
          <SHead>THE BASELINE</SHead>
          <SSub>Where {domain} Stands Today</SSub>

          {/* Metric cards — reference style (left accent bar + big number + label + sub) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <MetricCard value={bm.domainRating ?? "—"} label="Domain Authority" sub="Overall site authority" accent="orange" />
            <MetricCard value={fmt(bm.organicTraffic)} label="Organic Traffic" sub="Est. visits / month" accent="orange" />
            <MetricCard value={fmt(bm.organicKeywords)} label="Organic Keywords" sub="Terms you rank for" accent="orange" />
            <MetricCard value={bm.performanceMobile != null ? `${bm.performanceMobile}/100` : "—"} label="Mobile Speed" sub="Google PageSpeed" accent={bm.performanceMobile != null && bm.performanceMobile < 50 ? "orange" : "ink"} />
            <MetricCard value={bm.performanceDesktop != null ? `${bm.performanceDesktop}/100` : "—"} label="Desktop Speed" sub="Google PageSpeed" />
            <MetricCard value={bm.lcp != null ? `${(Number(bm.lcp) / 1000).toFixed(1)}s` : "—"} label="LCP" sub="Largest content paint" />
            <MetricCard value={bm.cls != null ? Number(bm.cls).toFixed(3) : "—"} label="CLS" sub="Layout stability" />
            <MetricCard value={fmt(bm.backlinks)} label="Total Backlinks" sub="Inbound links (Moz)" />
            <MetricCard value={fmt(bm.referringDomains)} label="Referring Domains" sub="Sites linking to you" />
            <MetricCard value={fmt(bm.errors404)} label="404 Errors" sub="Broken pages" accent={Number(bm.errors404) > 0 ? "orange" : "ink"} />
            <MetricCard value={crawlHealth != null ? `${crawlHealth}/100` : "—"} label="Site Health" sub="Crawl health score" />
            <MetricCard value={gmbScore != null ? `${gmbScore}/100` : "—"} label="GMB Completeness" sub="Google Business Profile" />
          </div>

          {/* KEY TAKEAWAY — grounded in the numbers above */}
          <div className="mt-6">
            <DarkCallout label="Key Takeaway">
              {domain} sits at Domain Authority {bm.domainRating ?? "—"} with {fmt(bm.organicTraffic)} organic visits a month across {fmt(bm.organicKeywords)} ranking keywords{bm.performanceMobile != null ? `, on a ${bm.performanceMobile}/100 mobile speed score` : ""}. {bm.errors404 ? `${fmt(bm.errors404)} broken pages and the technical base must be fixed first` : "The technical base must be solid first"} — then content and authority gains compound on top.
            </DarkCallout>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          02 · COMPETITOR LANDSCAPE
      ══════════════════════════════════════════════════════ */}
      <section className="py-16" style={{ background: "#FFFFFF" }}>
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={2} total={N} />
            <OBar />
            <SHead>COMPETITOR LANDSCAPE</SHead>
            <SSub>Local Competitors</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              {(cl.localCompetitors || []).map((c, i) => {
                const hot = /high|strong|dominant|leader|top/i.test(c.strength || "");
                return (
                  <div key={i} className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                    <div style={{ height: 4, background: hot ? ORANGE : "#4A4A4A" }} />
                    <div className="p-5">
                      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "16px", color: INK }}>{c.name || c.domain}</div>
                      {c.strength && <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: "11px", color: hot ? ORANGE : "#6B6B6B", marginTop: 4 }}>{c.strength}</div>}
                      {c.description && <p style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", marginTop: 10, lineHeight: 1.55 }}>{c.description}</p>}
                      {c.domain && <div style={{ fontFamily: BODY, fontSize: "11px", color: "#A8A8A8", marginTop: 8 }}>{c.domain}</div>}
                    </div>
                  </div>
                );
              })}
              {!(cl.localCompetitors || []).length && (
                <div className="col-span-2 text-sm text-gray-400 py-4">Competitor analysis loading…</div>
              )}
            </div>

            {(cl.nationalPlatforms || []).length > 0 && (
              <>
                <div className="uppercase mb-4" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "11px", letterSpacing: "0.2em", color: "#7A7A7A" }}>National Platforms Intercepting Search</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                  {cl.nationalPlatforms.map((p, i) => (
                    <div key={i} className="flex items-start gap-4 bg-white rounded-lg p-4" style={{ border: "1px solid #E5E5E5" }}>
                      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "14px", color: INK, minWidth: 104 }}>{p.name}</div>
                      <div className="flex-1 min-w-0">
                        {p.description && <p style={{ fontFamily: BODY, fontSize: "12.5px", color: "#5A5A5A", lineHeight: 1.5 }}>{p.description}</p>}
                        {p.threat && <span className="inline-block mt-1.5 uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "9px", letterSpacing: "0.1em", color: ORANGE }}>{p.threat}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {cl.localOpening && <DarkCallout label="The Local Opening">{cl.localOpening}</DarkCallout>}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          03 · KEYWORD STRATEGY
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={3} total={N} />
          <OBar />
          <SHead>KEYWORD STRATEGY</SHead>
          <SSub>Tier 1 — Primary Commercial Keywords</SSub>

          {/* Keyword gap summary banner */}
          {kwGap && (kwGap.summary?.totalGapKeywords || 0) > 0 && (
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="bg-[#0E0E0E] text-white rounded-xl px-5 py-3 flex items-center gap-3">
                <span className="text-2xl font-black text-[#C35328]">{kwGap.summary.totalGapKeywords}</span>
                <span className="text-xs text-gray-400">gap keywords<br />competitors rank for</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex items-center gap-3">
                <span className="text-2xl font-black text-emerald-700">{kwGap.summary.totalEasyWins || 0}</span>
                <span className="text-xs text-emerald-700">easy wins<br />(low difficulty)</span>
              </div>
              {(kwGap.paaQuestions || []).length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center gap-3">
                  <span className="text-2xl font-black text-blue-700">{kwGap.paaQuestions.length}</span>
                  <span className="text-xs text-blue-700">People Also Ask<br />content opportunities</span>
                </div>
              )}
            </div>
          )}

          {(ks.tier1 || []).length > 0 ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 mb-10">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Keyword</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Est. Monthly Volume</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Target Page Type</th>
                  </tr>
                </thead>
                <tbody>
                  {ks.tier1.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-semibold text-gray-900 text-sm">{row.keyword}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{row.volume || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{row.targetPageType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 mb-10 py-4">Keyword research processing…</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-2.5 mb-4">
                Tier 2 — Neighbourhood Hyper-Local
              </div>
              <ul className="space-y-2.5">
                {(ks.tier2Neighborhood || []).map((kw, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C35328] mt-[0.4rem] flex-shrink-0" />
                    {kw}
                  </li>
                ))}
                {!(ks.tier2Neighborhood || []).length && <li className="text-sm text-gray-400">Analysing…</li>}
              </ul>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-2.5 mb-4">
                Tier 3 — Informational Blog
              </div>
              <ul className="space-y-2.5">
                {(ks.tier3Informational || []).map((kw, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C35328] mt-[0.4rem] flex-shrink-0" />
                    {kw}
                  </li>
                ))}
                {!(ks.tier3Informational || []).length && <li className="text-sm text-gray-400">Analysing…</li>}
              </ul>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          04 · CONTENT ARCHITECTURE
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#0E0E0E] text-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={4} total={N} />
            <OBar />
            <SHead white>CONTENT ARCHITECTURE</SHead>
            <SSub white>What Pages To Build</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#C35328] mb-4">
                  Recommended Site Structure
                </div>
                <div className="space-y-2">
                  {(ca.siteStructure || []).map((page, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/[0.05] rounded-lg p-3.5 hover:bg-white/[0.08] transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C35328] mt-1.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-white">{page.page}</div>
                        {page.url && <div className="text-xs text-gray-500 font-mono mt-0.5">{page.url}</div>}
                        {page.purpose && <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{page.purpose}</div>}
                      </div>
                    </div>
                  ))}
                  {!(ca.siteStructure || []).length && (
                    <div className="text-sm text-gray-500">Structure generating…</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#C35328] mb-4">
                  Content Checklist
                </div>
                <ul className="space-y-3">
                  {(ca.checklist || []).map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                      <svg className="w-4 h-4 text-[#C35328] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                  {!(ca.checklist || []).length && (
                    <li className="text-sm text-gray-500">Checklist generating…</li>
                  )}
                </ul>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          05 · COMPETITIVE INTELLIGENCE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={5} total={N} />
          <OBar />
          <SHead>COMPETITIVE INTELLIGENCE</SHead>
          <SSub>Reverse-Engineering the Market Leader</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: "What Works For Them", items: ci.whatWorksForThem, bar: ORANGE, empty: "Analysis in progress…" },
              { title: "Gaps You Can Exploit", items: ci.gapsYouCanExploit, bar: "#4A4A4A", empty: "Gap analysis loading…" },
            ].map((c) => (
              <div key={c.title} className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                <div style={{ height: 4, background: c.bar }} />
                <div className="p-6">
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "16px", color: INK, marginBottom: 14 }}>{c.title}</div>
                  <ul className="space-y-3">
                    {(c.items || []).map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.55 }}>
                        <span style={{ color: c.bar, fontWeight: 700, marginTop: 1, flexShrink: 0 }}>•</span>{item}
                      </li>
                    ))}
                    {!(c.items || []).length && <li className="text-sm text-gray-400">{c.empty}</li>}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          06 · TECHNICAL FOUNDATION
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={6} total={N} />
            <OBar />
            <SHead>TECHNICAL FOUNDATION</SHead>
            <SSub>Fix Before You Build</SSub>

            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest w-28">Priority</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Issue</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tp.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-white"}>
                      <td className="px-4 py-3"><PBadge p={row.priority} /></td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.issue}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm leading-relaxed">{row.action}</td>
                    </tr>
                  ))}
                  {!tp.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                        Technical audit processing…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          07 · AUTHORITY — LINK BUILDING
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={7} total={N} />
          <OBar />
          <SHead>AUTHORITY</SHead>
          <SSub>Link Building to Raise Domain Rating</SSub>

          <div className="space-y-4">
            {[
              { title: "Citation Building", items: lb.citationBuilding || [] },
              { title: "Content-Driven Links", items: lb.contentDrivenLinks || [] },
              { title: "Competitor Link Gap", items: lb.competitorLinkGap || [] },
            ].map((col) => (
              <div key={col.title} className="flex rounded-lg overflow-hidden bg-white" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 4, background: ORANGE, flexShrink: 0 }} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 w-full">
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "15px", color: INK }}>{col.title}</div>
                  <ul className="md:col-span-2 space-y-2">
                    {col.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.5 }}>
                        <span style={{ color: ORANGE, marginTop: 2, flexShrink: 0 }}>•</span>{item}
                      </li>
                    ))}
                    {!col.items.length && <li className="text-xs text-gray-400">Loading…</li>}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          08 · LOCAL SEARCH
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#0E0E0E] text-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={8} total={N} />
            <OBar />
            <SHead white>LOCAL SEARCH</SHead>
            <SSub white>Google Business Profile: The Fastest Win</SSub>

            {/* Real GMB status strip */}
            {gmbInfo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 rounded-xl overflow-hidden mb-8">
                {[
                  { label: "GMB Listing",    value: gmbInfo.found ? "Found ✓" : "Not Found ✗", bad: !gmbInfo.found },
                  { label: "Verified",       value: gmbInfo.isVerified ? "Yes ✓" : "No ✗", bad: !gmbInfo.isVerified },
                  { label: "Rating",         value: gmbInfo.rating ? `${gmbInfo.rating}★` : "N/A", bad: !gmbInfo.rating || gmbInfo.rating < 4 },
                  { label: "Reviews",        value: gmbInfo.reviewCount != null ? String(gmbInfo.reviewCount) : "—", bad: (gmbInfo.reviewCount || 0) < 10 },
                ].map(({ label, value, bad }) => (
                  <div key={label} className="bg-white/[0.04] px-5 py-4">
                    <div className="text-[8px] uppercase tracking-widest text-gray-500 mb-1">{label}</div>
                    <div className={`text-lg font-black ${bad ? "text-red-400" : "text-[#C35328]"}`}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#C35328] mb-4">
                  GBP Action Checklist
                </div>
                <ul className="space-y-3">
                  {(ls.gbpChecklist || []).map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                      <svg className="w-4 h-4 text-[#C35328] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                  {!(ls.gbpChecklist || []).length && (
                    <li className="text-sm text-gray-500">Checklist generating…</li>
                  )}
                </ul>
              </div>
              <div className="space-y-4">
                {ls.reviewTarget && (
                  <div className="bg-[#C35328]/10 border border-[#C35328]/20 rounded-xl p-5">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-[#C35328] mb-2">Review Target</div>
                    <p className="text-sm text-gray-300 leading-relaxed">{ls.reviewTarget}</p>
                  </div>
                )}
                {gmbScore != null && (
                  <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-2">GMB Completeness Score</div>
                    <div className="flex items-end gap-2">
                      <span className={`text-3xl font-black ${gmbScore >= 70 ? "text-[#C35328]" : gmbScore >= 40 ? "text-orange-400" : "text-red-400"}`}>{gmbScore}</span>
                      <span className="text-gray-500 text-sm mb-1">/100</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#C35328] to-[#C35328] rounded-full transition-all" style={{ width: `${gmbScore}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          09 · EXECUTION — 30-DAY PLAN
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={9} total={N} />
          <OBar />
          <SHead>EXECUTION</SHead>
          <SSub>30-Day Execution Plan</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {rm.map((phase, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 hover:border-[#C35328]/30 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#C35328] to-[#C35328] text-white text-xs font-black grid place-items-center flex-shrink-0">
                    {phase.phase}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{phase.title}</div>
                    <div className="text-[9px] text-[#C35328] font-bold uppercase tracking-widest">{phase.duration}</div>
                  </div>
                </div>
                <ul className="space-y-2">
                  {(phase.actions || []).map((action, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                      <span className="w-1 h-1 rounded-full bg-[#C35328] mt-1.5 flex-shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!rm.length && (
              <div className="col-span-2 text-sm text-gray-400 py-4">Execution plan generating…</div>
            )}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          10 · MEASURING SUCCESS
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={10} total={N} />
            <OBar />
            <SHead>MEASURING SUCCESS</SHead>
            <SSub>Visibility KPIs We Report Monthly</SSub>

            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ background: INK, color: "#fff" }}>
                    {["Metric", "Now", "6 Months", "12 Months"].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.12em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(msRows || [
                    { metric: "Domain Rating",     now: bm.domainRating    ?? "—", s6: "Growing",  s12: "Target +"  },
                    { metric: "Organic Keywords",  now: fmt(bm.organicKeywords),   s6: "+60%",     s12: "+200%"     },
                    { metric: "Organic Traffic",   now: fmt(bm.organicTraffic),    s6: "+80%",     s12: "+300%"     },
                    { metric: "Referring Domains", now: fmt(bm.referringDomains),  s6: "+15",      s12: "+40"       },
                    { metric: "Site Health Score", now: crawlHealth != null ? `${crawlHealth}/100` : "—", s6: "75/100", s12: "90/100" },
                    { metric: "GMB Completeness",  now: gmbScore    != null ? `${gmbScore}/100`    : "—", s6: "80/100", s12: "95/100" },
                  ]).map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F7F7F7" }}>
                      <td className="px-4 py-3" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "13px", color: INK }}>{row.metric}</td>
                      <td className="px-4 py-3" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A" }}>{row.now}</td>
                      <td className="px-4 py-3" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A" }}>{row.s6}</td>
                      <td className="px-4 py-3" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "13px", color: ORANGE }}>{row.s12}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          11 · CONTENT BLUEPRINT
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={11} total={N} />
          <OBar />
          <SHead>CONTENT BLUEPRINT</SHead>
          <SSub>What the Leader Ranks For</SSub>

          {cb.length > 0 ? (
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Blog Post</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Top Keyword</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Vol</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {cb.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.blogPost}</td>
                      <td className="px-4 py-3 text-gray-600">{row.topKeyword}</td>
                      <td className="px-4 py-3 text-gray-600">{row.vol || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{row.pos || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-4">Content blueprint generating…</div>
          )}
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          12 · UNCONTESTED TERRITORY
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={12} total={N} />
            <OBar />
            <SHead>UNCONTESTED TERRITORY</SHead>
            <SSub>Service Pages {domain} Should Own</SSub>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {uc.map((item, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-[#C35328]/20 hover:shadow-sm transition-all duration-200">
                  <div className="text-sm font-bold text-gray-900 mb-1">{item.page}</div>
                  <div className="text-xs text-gray-500 mb-3 leading-relaxed">{item.keyword}</div>
                  <div className="text-2xl font-black text-[#C35328]">{item.volume}</div>
                  <div className="text-[8px] text-gray-400 uppercase tracking-widest mt-0.5">Monthly searches</div>
                </div>
              ))}
              {!uc.length && (
                <div className="col-span-3 text-sm text-gray-400 py-4">Opportunity analysis in progress…</div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          13 · THE NEXT FRONTIER — GEO & AI
      ══════════════════════════════════════════════════════ */}
      <section className="py-16" style={{ background: "#FFFFFF" }}>
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={13} total={N} />
            <OBar />
            <SHead>THE NEXT FRONTIER</SHead>
            <SSub>GEO and AI Visibility</SSub>

            {/* Full §14-25 GEO model (SoV, metrics, topic dominance, citation intelligence,
                Claude deep analysis) when a live scan exists; readiness + tracked prompts +
                actions always. Real data — replaces the old hallucinated citation counts. */}
            <GeoVisibility geo={d.doctorFizz?.geo_and_ai_visibility || {}} domain={domain} gf={gf} />
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          14 · QUICK WINS — 180-DAY ACTION PLAN
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={14} total={N} />
          <OBar />
          <SHead>QUICK WINS</SHead>
          <SSub>180-Day Action Plan</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {qw.map((block, i) => (
              <div key={i} className="border-l-4 border-[#C35328] bg-white rounded-r-xl p-5">
                <div className="text-[8px] font-black uppercase tracking-widest text-[#C35328] mb-3">{block.week}</div>
                <ul className="space-y-2">
                  {(block.actions || []).map((action, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C35328] mt-[0.4rem] flex-shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!qw.length && (
              <div className="col-span-2 text-sm text-gray-400 py-4">Action plan generating…</div>
            )}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          15 · STRATEGIC PRIORITY STACK
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={15} total={N} />
            <OBar />
            <SHead>STRATEGIC PRIORITY STACK</SHead>
            <SSub>The Honest Assessment</SSub>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {sp.map((p, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 hover:border-[#C35328]/20 hover:shadow-sm transition-all duration-200">
                  <div className="text-5xl font-black text-gray-100 mb-3 leading-none">{p.priority}</div>
                  <div className="font-bold text-gray-900 text-sm mb-2">{p.title}</div>
                  <p className="text-xs text-gray-600 leading-relaxed">{p.description}</p>
                </div>
              ))}
              {!sp.length && (
                <div className="col-span-3 text-sm text-gray-400 py-4">Strategic priorities loading…</div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          16 · WHY DOCTORFIZZ
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#0E0E0E] text-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={16} total={N} />
            <OBar />
            <SHead white>WHY DOCTORFIZZ</SHead>
            <SSub white>Evidence Over Guesswork</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              {[
                {
                  title: "Evidence, Not Guesswork",
                  desc: "Every recommendation backed by real data from multiple sources — no guessing, no padding.",
                },
                {
                  title: "SEO & GEO Specialists",
                  desc: "We optimise for both traditional search engines and the new AI answer engines.",
                },
                {
                  title: "Content That Earns Rankings",
                  desc: "We produce topically authoritative content that search engines — and AI systems — cite.",
                },
                {
                  title: "Transparent Monthly Reporting",
                  desc: "Full visibility into what we do, what moved, and what's next. No black boxes.",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="bg-white/[0.04] border border-white/10 rounded-xl p-6 hover:border-[#C35328]/30 transition-colors duration-200"
                >
                  <div className="font-bold text-sm text-white mb-2">{card.title}</div>
                  <p className="text-xs text-gray-400 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          17 · OUR CLIENTELE
      ══════════════════════════════════════════════════════ */}
      <section className="py-16" style={{ background: INK }}>
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={17} total={N} />
            <OBar />
            <SHead white>OUR CLIENTELE</SHead>
            <SSub white>Brands we have partnered with</SSub>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-10 gap-y-12 items-center mt-2">
              {CLIENT_LOGOS.map((c, i) => (
                <div key={i} className="flex items-center justify-center h-16">
                  <img src={c.file} alt={c.name} style={{ maxHeight: "54px", maxWidth: "150px", width: "auto", objectFit: "contain" }} />
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          18 · FOUR STEPS TO LAUNCH
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#0E0E0E] text-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={18} total={N} />
            <OBar />
            <SHead white>FOUR STEPS TO LAUNCH</SHead>
            <SSub white>Ready to Begin?</SSub>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 mb-12">
              {[
                { step: "01", title: "Discovery Call", desc: "30-minute strategy session to align on goals." },
                { step: "02", title: "Full Audit", desc: "Deep technical and content audit of your site." },
                { step: "03", title: "Strategy Build", desc: "Custom 30-day SEO & GEO quick-launch plan delivery." },
                { step: "04", title: "Execute & Report", desc: "Monthly implementation, tracking, and reporting." },
              ].map((s) => (
                <div key={s.step} className="text-center">
                  <div className="text-5xl font-black text-[#C35328] mb-3 leading-none">{s.step}</div>
                  <div className="font-bold text-sm text-white mb-2">{s.title}</div>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <a
                href="https://doctorfizz.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold text-sm hover:opacity-90 transition-opacity"
                style={{ background: ORANGE }}
              >
                Book Your Discovery Call →
              </a>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer className="border-t border-gray-100 bg-white py-10 px-8 text-center">
        <div className="flex items-center justify-center mb-3">
          <ItzFizzLogo size="md" />
        </div>
        <div className="text-xs text-gray-400 mb-1">doctorfizz.com · Prepared exclusively for {domain}</div>
        <div className="text-[10px] text-gray-300 max-w-xl mx-auto leading-relaxed">
          This report is confidential and prepared solely for the named client. All data sourced from real-time analytics as of {dateStr}.
        </div>
      </footer>
    </div>
  );
}
