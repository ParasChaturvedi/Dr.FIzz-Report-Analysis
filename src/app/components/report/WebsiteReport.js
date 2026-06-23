"use client";

import { useEffect, useRef, useState } from "react";
import { fmtNum, metricWithSource } from "@/lib/seo/report-format";

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

// ── EVIDENCE-FIRST recommendation card (Track 1.2). Renders the 10-field structure so
//    every recommendation is implementation-ready: Finding · Evidence · Competitor
//    Benchmark · Action · Expected Impact · Validation Metric + confidence/owner/effort/
//    impact badges. Reads data.doctorFizz.evidence_plan.
function EvBadge({ children, bg = "#4A4A4A", color = "#fff" }) {
  return <span className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" style={{ background: bg, color }}>{children}</span>;
}
const EV_IMPACT_BG = { High: "#C35328", Medium: "#8A6A52", Low: "#BDBDBD" };
const EV_OWNER_BG = { SEO: "#2F5D62", Development: "#3A3A6A", Content: "#5A4A2E", Client: "#6A2E4A" };
function EvidenceRow({ label, children }) {
  if (!children) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      <div style={{ flex: "0 0 132px", fontFamily: BODY, fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A9A9A", paddingTop: 2 }}>{label}</div>
      <div style={{ fontFamily: BODY, fontSize: "12.5px", lineHeight: 1.55, color: "#3A3A3A", minWidth: 0 }}>{children}</div>
    </div>
  );
}
function EvidenceCard({ r }) {
  return (
    <div className="rounded-lg bg-white p-4" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "14px", color: INK, lineHeight: 1.3, flex: "1 1 60%", minWidth: 0 }}>{r.finding}</div>
        <div className="flex gap-1.5 flex-wrap">
          <EvBadge bg={EV_IMPACT_BG[r.impact] || "#8A8A8A"}>{r.impact} impact</EvBadge>
          <EvBadge bg={EV_OWNER_BG[r.owner] || "#4A4A4A"}>{r.owner}</EvBadge>
        </div>
      </div>
      <EvidenceRow label="Evidence / data">{r.evidence}</EvidenceRow>
      <EvidenceRow label="Competitor benchmark">{r.competitor_benchmark || <span style={{ color: "#B8B8B8" }}>Competitor ranking evidence added in Track 2</span>}</EvidenceRow>
      <EvidenceRow label="Recommended action">{r.action}</EvidenceRow>
      <EvidenceRow label="Expected impact">{r.expected_impact}</EvidenceRow>
      <EvidenceRow label="Validation metric">{r.validation_metric}</EvidenceRow>
      <div className="flex gap-1.5 flex-wrap mt-3 pt-2" style={{ borderTop: "1px solid #F0F0F0" }}>
        <EvBadge bg="#EDEDED" color="#4A4A4A">{r.confidence}</EvBadge>
        <EvBadge bg="#EDEDED" color="#4A4A4A">Effort: {r.effort_band}{r.effort ? ` · ${r.effort}` : ""}</EvBadge>
        {r.priority && <EvBadge bg="#EDEDED" color="#4A4A4A">{r.priority}</EvBadge>}
        {(r.sources || []).length > 0 && <EvBadge bg="#EDEDED" color="#7A7A7A">Source: {r.sources.join(", ")}</EvBadge>}
      </div>
    </div>
  );
}
function EvidencePlanSection({ plan }) {
  if (!plan || !plan.by_category || !Object.keys(plan.by_category).length) return null;
  const cats = Object.keys(plan.by_category);
  const c = plan.counts || {};
  return (
    <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
      <AnimatedSection>
        <OBar />
        <SHead>THE IMPLEMENTATION PLAN</SHead>
        <SSub>Every recommendation, evidence → action → validation</SSub>
        <p style={{ fontFamily: BODY, fontSize: "14px", lineHeight: 1.65, color: "#5A5A5A", marginTop: -10, marginBottom: 18, maxWidth: "46rem" }}>
          {c.total} prioritised recommendations. Each one states the finding, the evidence behind it, the exact action, who owns it, the effort, and the metric that proves it worked — so this reads as an execution plan, not a presentation.{c.pages_existing_flagged > 0 ? ` ${c.pages_existing_flagged} page(s) already exist and are flagged to optimise — not rebuild.` : ""}
        </p>
        <div className="space-y-8">
          {cats.map((cat) => (
            <div key={cat}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "16px", color: ORANGE, marginBottom: 10 }}>{cat} <span style={{ color: "#B0B0B0", fontSize: 13 }}>({plan.by_category[cat].length})</span></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                {plan.by_category[cat].map((r, i) => <EvidenceCard key={i} r={r} />)}
              </div>
            </div>
          ))}
        </div>
      </AnimatedSection>
    </section>
  );
}

// ── #2 / #5 — "What Pages To Build" with the existing-page guard already applied
//    upstream, split into a Service-Pages container and a Blogs container (both NEW-only),
//    plus the "Every Page Must Include" checklist. Falls back to the legacy single
//    site-structure list when the structured pages/blogs split is unavailable.
function BuildListCard({ title, items, emptyNote }) {
  return (
    <div className="rounded-lg overflow-hidden flex" style={{ background: INK }}>
      <div style={{ width: 4, background: ORANGE, flexShrink: 0 }} />
      <div className="p-5 w-full">
        <div className="uppercase mb-3" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: ORANGE }}>{title}</div>
        <div className="space-y-2.5">
          {(items || []).map((page, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: "13px", color: "#fff" }}>{page.page}</div>
                {page.volume && <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "12px", color: ORANGE, whiteSpace: "nowrap" }}>{page.volume}</div>}
              </div>
              {page.url && <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "11px", color: "#9A9A9A" }}>{page.url}</div>}
              {page.purpose && <div style={{ fontFamily: BODY, fontSize: "11.5px", color: "#8A8A8A", lineHeight: 1.5 }}>{page.purpose}</div>}
            </div>
          ))}
          {!(items || []).length && <div style={{ color: "#8A8A8A", fontSize: 12.5, lineHeight: 1.5 }}>{emptyNote}</div>}
        </div>
      </div>
    </div>
  );
}
function ChecklistCard({ items }) {
  return (
    <div className="bg-white rounded-lg p-6" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "15px", color: INK, marginBottom: 14 }}>Every Page Must Include</div>
      <ul className="space-y-3">
        {(items || []).map((item, i) => (
          <li key={i} className="flex items-start gap-2.5" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.5 }}>
            <span style={{ color: ORANGE, fontWeight: 700, flexShrink: 0 }}>✓</span>{item}
          </li>
        ))}
        {!(items || []).length && <li className="text-sm text-gray-400">Not enough data to assess this yet.</li>}
      </ul>
    </div>
  );
}
function PagesToBuild({ ca = {} }) {
  const pages = Array.isArray(ca.pagesToBuild) ? ca.pagesToBuild : null;
  const blogs = Array.isArray(ca.blogsToBuild) ? ca.blogsToBuild : null;
  const hasSplit = (pages && pages.length) || (blogs && blogs.length);

  if (hasSplit) {
    return (
      <>
        {ca.pagesExistingFlagged > 0 && (
          <p style={{ fontFamily: BODY, fontSize: "13px", lineHeight: 1.6, color: "#5A5A5A", marginTop: -10, marginBottom: 16, maxWidth: "46rem" }}>
            Only <strong style={{ color: INK }}>new</strong> pages with real search demand are listed below. {ca.pagesExistingFlagged} page(s) that already exist on the site are excluded here and flagged to <strong style={{ color: ORANGE }}>optimise</strong> (not rebuild) in The Implementation Plan.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BuildListCard title="Service / Landing Pages To Build" items={pages || []} emptyNote="No new service pages needed — the commercial pages already exist; optimise them in The Implementation Plan." />
          <BuildListCard title="Blogs To Build" items={blogs || []} emptyNote="No new blog topics with measurable demand right now." />
        </div>
        <div className="mt-5"><ChecklistCard items={ca.checklist} /></div>
      </>
    );
  }

  // Fallback — legacy single site-structure list + checklist (structured split absent).
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="rounded-lg overflow-hidden flex" style={{ background: INK }}>
        <div style={{ width: 4, background: ORANGE, flexShrink: 0 }} />
        <div className="p-5 w-full">
          <div className="uppercase mb-3" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: ORANGE }}>Recommended Site Structure</div>
          <div className="space-y-2.5">
            {(ca.siteStructure || []).map((page, i) => (
              <div key={i}>
                <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: "13px", color: "#fff" }}>{page.page}</div>
                {page.url && <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "11px", color: "#9A9A9A" }}>{page.url}</div>}
                {page.purpose && <div style={{ fontFamily: BODY, fontSize: "11.5px", color: "#8A8A8A", lineHeight: 1.5 }}>{page.purpose}</div>}
              </div>
            ))}
            {!(ca.siteStructure || []).length && <div style={{ color: "#8A8A8A", fontSize: 13 }}>Not enough data to assess this yet.</div>}
          </div>
        </div>
      </div>
      <ChecklistCard items={ca.checklist} />
    </div>
  );
}

// #6 — Google Business Profile competitor benchmarking table. Renders the REAL client-vs-
// competitor rows from data.doctorFizz.gbp_comparison (rating, reviews, verified, photos,
// categories, completeness). Shows an honest note when competitor GBP data wasn't collected
// — never fabricates competitor numbers.
function GbpComparisonTable({ gbp = {} }) {
  const client = gbp?.client || null;
  const competitors = Array.isArray(gbp?.competitors) ? gbp.competitors : [];
  if (!client && !competitors.length) return null;
  const rows = [client, ...competitors].filter(Boolean);
  const yesno = (v) => (v ? "Yes" : "—");
  const num = (v) => (v == null || v === "" ? "—" : typeof v === "number" ? fmtNum(v) : String(v));
  const cols = [
    { key: "name",            label: "Business",     get: (r) => r.name },
    { key: "rating",          label: "Rating",       get: (r) => (r.rating != null ? `${r.rating}★` : "—") },
    { key: "review_count",    label: "Reviews",      get: (r) => num(r.review_count) },
    { key: "verified",        label: "Verified",     get: (r) => yesno(r.verified) },
    { key: "photos",          label: "Photos",       get: (r) => num(r.photos) },
    { key: "primary_category",label: "Primary Cat.", get: (r) => r.primary_category || "—" },
    { key: "completeness",    label: "Complete",     get: (r) => (r.completeness != null ? `${r.completeness}/100` : "—") },
  ];
  const thS = { fontFamily: BODY, fontWeight: 700, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 12px", textAlign: "left", color: "#fff", whiteSpace: "nowrap" };
  const tdS = { fontFamily: BODY, fontSize: "12.5px", padding: "9px 12px", color: "#3A3A3A", whiteSpace: "nowrap" };

  return (
    <div className="rounded-lg overflow-hidden mb-5" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="px-4 pt-4 pb-1">
        <div className="uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: ORANGE }}>Profile vs Competitors</div>
      </div>
      {competitors.length === 0 ? (
        <p style={{ fontFamily: BODY, fontSize: "12.5px", color: "#8A8A8A", padding: "4px 16px 16px", lineHeight: 1.5 }}>
          Competitor Google Business Profile data was not collected for this run, so a head-to-head table is not shown. Your own profile is audited above; enable the competitor GBP scan to benchmark rating, reviews and completeness against rivals.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}>{cols.map((c, i) => <th key={c.key} style={{ ...thS, textAlign: i ? "left" : "left" }}>{c.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const isClient = i === 0;
                return (
                  <tr key={i} style={{ background: isClient ? "#FBF2EC" : i % 2 ? "#F7F7F7" : "#fff" }}>
                    {cols.map((c) => (
                      <td key={c.key} style={{ ...tdS, fontWeight: c.key === "name" || isClient ? 700 : 400, color: isClient ? INK : "#3A3A3A" }}>
                        {c.key === "name" ? (isClient ? `${r.name || "Your Business"} (you)` : r.name) : c.get(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// §14-25 GEO renderer (reference light style). Renders the FULL model (geo_score, SoV,
// metrics, topic dominance, citation intelligence, Claude deep analysis) when a live scan
// exists, and ALWAYS renders the readiness scorecard + tracked prompts + actions. Reads
// data.doctorFizz.geo_and_ai_visibility so NO GEO data is lost on the reference layout.
function GeoVisibility({ geo = {}, domain, gf = {}, status = null }) {
  const m = geo;
  const cardB = { border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" };
  const cell = { fontFamily: BODY, fontSize: "12px", padding: "8px 12px" };
  const thS = { fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "9px 12px", textAlign: "left", color: "#fff" };
  const Lbl = ({ children }) => <div className="uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: ORANGE, marginBottom: 8 }}>{children}</div>;

  // ── #9 HONEST GEO STATE — until real Phase-3 browser collection runs, GEO is PLANNED.
  //    NO Share-of-Voice / citation / mention / LLM-answer numbers are shown (none exist
  //    yet). This early-return guarantees nothing fabricated reaches the report. ──
  if (!status?.collection_run) {
    const prompts = m.tracked_prompts || m.prompts_used || m.prompts || [];
    const promptCount = status?.prompt_count || (Array.isArray(prompts) ? prompts.length : 0);
    const st = status?.state || "planned";
    const STATE_BADGE = {
      planned: { label: "PLANNED", bg: "#8A6A52" }, queued: { label: "QUEUED", bg: "#5A6A8A" },
      running: { label: "RUNNING", bg: ORANGE }, partially_complete: { label: "PARTIAL", bg: "#8A6A52" },
      failed: { label: "FAILED", bg: "#B3261E" }, session_required: { label: "SESSION REQUIRED", bg: "#9A6A12" },
    };
    const badge = STATE_BADGE[st] || STATE_BADGE.planned;
    const collectionLabel = { planned: "Not run yet", queued: "Queued", running: "Running…", session_required: "Sessions required", failed: "Failed" }[st] || "Not run yet";
    const blocked = Array.isArray(status?.blocked_engines) ? status.blocked_engines : [];
    const steps = [
      ["Methodology", status?.methodology_ready ? "Ready" : "Pending"],
      ["Prompts (neutral)", status?.prompts_ready ? `Ready · ${promptCount}` : "Not generated yet"],
      ["Collection (Playwright / Browserless)", collectionLabel],
    ];
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Lbl>GEO Collection</Lbl>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: badge.bg, color: "#fff" }}>{badge.label}</span>
          </div>
          <p style={{ fontFamily: BODY, fontSize: "13px", lineHeight: 1.6, color: "#4A4A4A", maxWidth: "46rem" }}>
            {status?.message || `GEO visibility for ${domain} has not been measured yet. No Share-of-Voice, citation or mention numbers are shown until they come from real AI-engine answers.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            {steps.map(([k, v], i) => (
              <div key={i} className="rounded border p-3" style={{ borderColor: "#E5E5E5" }}>
                <div style={{ fontFamily: BODY, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8A8A" }}>{k}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "14px", color: INK, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
          {blocked.length > 0 && (
            <div className="mt-3" style={{ fontFamily: BODY, fontSize: "12px", color: "#9A6A12" }}>
              Engines awaiting setup: {blocked.map((b) => `${b.engine || b.name}${b.status ? ` (${String(b.status).replace(/_/g, " ")})` : ""}`).join(", ")}
            </div>
          )}
          {status?.note && <p style={{ fontFamily: BODY, fontSize: "11px", color: "#8A8A8A", marginTop: 10 }}>{status.note}</p>}
        </div>
        {/* #8 — transparency: show the neutral prompts queued for collection, if generated */}
        {Array.isArray(prompts) && prompts.length > 0 && (
          <div className="rounded-lg bg-white p-5" style={cardB}>
            <Lbl>Prompts ready for AI-engine collection ({prompts.length})</Lbl>
            <ul className="mt-2 space-y-1">
              {prompts.slice(0, 24).map((p, i) => (
                <li key={i} style={{ fontFamily: BODY, fontSize: "12px", color: "#4A4A4A" }}>• {typeof p === "string" ? p : (p.prompt || p.prompt_text || "")}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(m.engines_unavailable || []).length > 0 && (
        <div style={{ fontFamily: BODY, fontSize: "11px", color: "#8A6A52", background: "#F7F0EA", border: "1px solid #ECD9CC", borderRadius: 8, padding: "8px 12px" }}>
          Engines unavailable this scan (excluded from the figures below): <strong style={{ color: INK }}>{m.engines_unavailable.join(", ")}</strong>
        </div>
      )}
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
            <thead><tr style={{ background: INK }}>{["Engine", "SoV", "Comp SoV", "Mentions", "Citations", "Comp mentions", "Comp citations", "Cit. score", "Position", "Topic", "Intent", "Freshness", "GEO"].map((h, i) => <th key={i} style={{ ...thS, textAlign: i ? "right" : "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {[{ label: "Overall", mm: m.geo_metrics.overall, hl: true }, ...m.geo_metrics.engines.map((e) => ({ label: e, mm: m.geo_metrics.by_engine[e] || {}, hl: false }))].map((r, i) => (
                <tr key={i} style={{ background: r.hl ? "#FBF1EB" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                  <td style={{ ...cell, fontWeight: r.hl ? 700 : 400 }}>{r.label}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{r.mm.sov}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.competitor_sov}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.brand_mentions}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.brand_citations}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.competitor_mentions}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.competitor_citations}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.citation_score}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.citation_position_score}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.topic_coverage}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.intent_match}%</td>
                  <td style={{ ...cell, textAlign: "right" }}>{r.mm.freshness}</td>
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

      {/* §23 — Citation Gap (root cause) callout */}
      {m.citation_analysis?.citation_gap && (
        <DarkCallout label="Citation Gap">{m.citation_analysis.citation_gap}</DarkCallout>
      )}

      {/* §23 — Citation Intelligence: every cited URL classified individually (page-level) */}
      {(m.citation_analysis?.citations || []).length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Citation Intelligence — every URL AI cites, classified</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Domain / URL</th><th style={thS}>Type</th><th style={thS}>Engines</th><th style={{ ...thS, textAlign: "right" }}>Position</th><th style={{ ...thS, textAlign: "right" }}>Times cited</th><th style={thS}>Action</th></tr></thead>
            <tbody>{m.citation_analysis.citations.slice(0, 15).map((c, i) => (
              <tr key={i} style={{ background: c.is_client ? "#FBF1EB" : c.is_competitor ? "#FBE9E7" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                <td style={cell}>
                  <div style={{ fontWeight: 700, color: INK }}>{c.domain}{c.is_competitor ? <span className="ml-1.5 px-1 py-0.5 rounded text-[9px]" style={{ background: "#B3261E", color: "#fff" }}>competitor</span> : c.is_client ? <span className="ml-1.5 px-1 py-0.5 rounded text-[9px]" style={{ background: "#1E7B3E", color: "#fff" }}>you</span> : null}</div>
                  {c.url && <div style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "10px", color: "#A8A8A8", wordBreak: "break-all" }}>{String(c.url).replace(/^https?:\/\//, "").slice(0, 64)}</div>}
                </td>
                <td style={cell}>{String(c.citation_class || "").replace(/_/g, " ")}{c.source_type ? <span style={{ color: "#A8A8A8" }}> · {c.source_type}</span> : null}</td>
                <td style={cell}>{(c.engines || []).join(", ")}</td>
                <td style={{ ...cell, textAlign: "right" }}>{c.first_position}</td>
                <td style={{ ...cell, textAlign: "right" }}>{c.times_cited}</td>
                <td style={cell}>{String(c.action || "").replace(/_/g, " ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* §23/§24 — Backlink Opportunity Queue (domain-level) */}
      {(m.citation_analysis?.opportunity_queue || []).length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Backlink Opportunity Queue — turn AI sources into links</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Target</th><th style={thS}>Class</th><th style={thS}>Action</th><th style={{ ...thS, textAlign: "right" }}>Opportunity</th><th style={thS}>Difficulty</th></tr></thead>
            <tbody>{m.citation_analysis.opportunity_queue.map((o, i) => (
              <tr key={i} style={{ background: i % 2 ? "#fff" : "#F7F7F7" }}>
                <td style={{ ...cell, fontWeight: 700, color: INK }}>{o.domain}</td>
                <td style={cell}>{String(o.citation_class || "").replace(/_/g, " ")}</td>
                <td style={cell}>{String(o.action || o.action_type || "").replace(/_/g, " ")}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: ORANGE }}>{o.opportunity_score ?? o.link_opportunity_score}</td>
                <td style={cell}>{o.difficulty}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* §23/§24 — Page-level (per-URL) backlink opportunities */}
      {(m.citation_analysis?.page_opportunities || []).length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Page-Level Citation Opportunities — the exact URLs AI quotes</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Target</th><th style={thS}>Class</th><th style={thS}>Action</th><th style={{ ...thS, textAlign: "right" }}>Opportunity</th><th style={thS}>Difficulty</th></tr></thead>
            <tbody>{m.citation_analysis.page_opportunities.map((o, i) => (
              <tr key={i} style={{ background: i % 2 ? "#fff" : "#F7F7F7" }}>
                <td style={cell}><span style={{ wordBreak: "break-all" }}>{String(o.url || "").replace(/^https?:\/\//, "").slice(0, 64)}</span></td>
                <td style={cell}>{String(o.citation_class || "").replace(/_/g, " ")}</td>
                <td style={cell}>{String(o.action || o.action_type || "").replace(/_/g, " ")}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: ORANGE }}>{o.opportunity_score ?? o.link_opportunity_score}</td>
                <td style={cell}>{o.difficulty}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* §25 — Competitor Intelligence: per-competitor SoV by engine */}
      {(m.competitor_intel?.competitors || []).length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Competitor Intelligence — AI share of voice by engine</Lbl></div>
          {m.competitor_intel.summary && <div className="px-3 pb-2" style={{ fontFamily: BODY, fontSize: "12px", color: "#6B6B6B" }}>{m.competitor_intel.summary}</div>}
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Competitor</th>{(m.share_of_voice?.engines || []).map((e, i) => <th key={i} style={{ ...thS, textAlign: "right" }}>{e}</th>)}<th style={{ ...thS, textAlign: "right" }}>Avg SoV</th></tr></thead>
            <tbody>{m.competitor_intel.competitors.map((c, i) => {
              const lead = m.competitor_intel.leader;
              const isLeader = !!lead && ((c.name || c.brand) === lead);
              return (
                <tr key={i} style={{ background: isLeader ? "#FBE9E7" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                  <td style={{ ...cell, fontWeight: isLeader ? 700 : 400, color: INK }}>{c.name || c.brand}{isLeader ? <span className="ml-1.5 px-1 py-0.5 rounded text-[9px]" style={{ background: "#B3261E", color: "#fff" }}>leader</span> : null}</td>
                  {(m.share_of_voice?.engines || []).map((e, j) => <td key={j} style={{ ...cell, textAlign: "right" }}>{(c.per_engine || {})[e]}%</td>)}
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{c.sov_avg ?? c.avg}%</td>
                </tr>
              );
            })}</tbody>
          </table>
          {m.competitor_intel.gap != null && <div className="px-3 py-2" style={{ fontFamily: BODY, fontSize: "11px", color: "#6B6B6B", borderTop: "1px solid #EEE" }}>Gap to leader: <strong style={{ color: INK }}>{m.competitor_intel.gap} pts</strong>{m.competitor_intel.leader_strongest_engine ? ` · leader strongest on ${m.competitor_intel.leader_strongest_engine}` : ""}.</div>}
        </div>
      )}

      {/* §25 — Topic Dominance: per-competitor topics led / present / lead share */}
      {(m.topic_dominance?.competitor_dominance || []).length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Topic Dominance — competitor leadership by topic</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Competitor</th><th style={{ ...thS, textAlign: "right" }}>Topics led</th><th style={{ ...thS, textAlign: "right" }}>Topics present</th><th style={{ ...thS, textAlign: "right" }}>Lead share</th></tr></thead>
            <tbody>{m.topic_dominance.competitor_dominance.map((c, i) => (
              <tr key={i} style={{ background: i % 2 ? "#fff" : "#F7F7F7" }}>
                <td style={{ ...cell, color: INK }}>{c.competitor || c.brand}</td>
                <td style={{ ...cell, textAlign: "right" }}>{c.topics_led}</td>
                <td style={{ ...cell, textAlign: "right" }}>{c.topics_present}</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{c.lead_share}%</td>
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
// PLAIN-LANGUAGE LAYER
// ═══════════════════════════════════════════════════════════════════

// Mirror of the logic-layer PLAIN_LANGUAGE map (src/lib/seo/doctor-fizz-logic.js).
// Keyed BOTH by the logic-layer metric key AND by WebsiteReport's card labels so a
// non-technical reader gets a plain definition under every cryptic metric, even when
// data.doctorFizz.formatted_baseline isn't on the payload. Source of truth stays the
// payload's per-metric .plain_language; this is the local fallback.
const PLAIN_LANGUAGE = {
  domain_rating:            "a 0–100 measure of how trusted the site is by other websites",
  "Domain Authority":       "a 0–100 measure of how trusted the site is by other websites",
  organic_traffic:          "visitors who arrive from unpaid Google search results",
  "Organic Traffic":        "visitors who arrive from unpaid Google search results",
  organic_keywords:         "the number of search terms the site already shows up for",
  "Organic Keywords":       "the number of search terms the site already shows up for",
  referring_domains:        "the number of separate websites that link to this one",
  "Referring Domains":      "the number of separate websites that link to this one",
  mobile_performance_score: "Google's 0–100 speed grade for the site on phones",
  "Mobile Speed":           "Google's 0–100 speed grade for the site on phones",
  desktop_performance_score:"Google's 0–100 speed grade for the site on computers",
  "Desktop Speed":          "Google's 0–100 speed grade for the site on computers",
  lcp:                      "how long the main content takes to load",
  LCP:                      "how long the main content takes to load",
  cls:                      "how much the page jumps around while loading",
  CLS:                      "how much the page jumps around while loading",
  site_health_score:        "the share of pages free of technical errors",
  "Site Health":            "the share of pages free of technical errors",
  gbp_completeness:         "how fully the Google Business Profile is filled out",
  "GMB Completeness":       "how fully the Google Business Profile is filled out",
  gbp_review_count:         "the number of customer reviews on the Google profile",
  gbp_rating:               "the average star rating on the Google profile",
  errors_404:               "pages returning a not-found error to visitors and crawlers",
  "404 Errors":             "pages returning a not-found error to visitors and crawlers",
  "Total Backlinks":        "the total number of links from other websites pointing to yours",
};

// Plain one-line glosses for the GEO/AI jargon (above the §13 tables) so the section
// reads as English, not acronyms.
const GEO_GLOSS = {
  "Share of Voice": "how often AI assistants mention you versus your competitors",
  "Citation":       "when an AI answer links to a source or website as its evidence",
  "GEO Score":      "how ready your site is to be quoted by AI answer engines (0–100)",
};

// Resolve the plain-language definition for a metric card: prefer the live payload's
// per-metric .plain_language, fall back to the local PLAIN_LANGUAGE map (by metric key
// or card label), and finally to the existing technical sub-label.
function plainFor(label, fbMap, fallback) {
  const fb = fbMap && (fbMap[label] || null);
  return (fb && fb.plain_language) || PLAIN_LANGUAGE[label] || fallback;
}

// ── LIVE GEO SECTION (Phase 3 report integration) — fetches the REAL collected results
//    for this domain from MongoDB (/api/seo/geo/report) and renders them: GEO score,
//    Share-of-Voice vs competitors, per-engine results, the prompts executed with their
//    real answers, and the methodology. When nothing has been collected it shows the
//    honest state (planned/queued/running/session_required/failed) — NEVER fake numbers.
function GeoLiveSection({ domain, fallbackStatus = null, source = null }) {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  useEffect(() => {
    if (!domain) { setLoading(false); return; }
    let cancelled = false, timer = null, ensured = false, tries = 0;
    const POLL_MS = 15000, MAX_TRIES = 60; // poll up to ~15 min while collecting
    const readReport = () => fetch(`/api/seo/geo/report?domain=${encodeURIComponent(domain)}&answers=1`).then((r) => r.json()).catch(() => null);
    const tick = async () => {
      const d = await readReport();
      if (cancelled) return;
      if (d) setLive(d);
      setLoading(false);
      if (d?.measured) return; // real data is in — stop polling
      const state = d?.geo_status?.state;
      // AUTO-TRIGGER collection once (no manual step, no "planned" dead-end)
      if (!ensured && (!d || !d.run || state === "planned")) {
        ensured = true;
        try { await fetch(`/api/seo/geo/ensure`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, source: sourceRef.current }) }); } catch {}
      }
      // keep polling while it's queued/running (worker collecting in the background)
      if (tries < MAX_TRIES && (!d || ["planned", "queued", "running"].includes(state))) {
        tries++; timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [domain]);

  const cardB = { border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" };
  const cell = { fontFamily: BODY, fontSize: "12px", padding: "8px 12px" };
  const thS = { fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "9px 12px", textAlign: "left", color: "#fff" };
  const Lbl = ({ children }) => <div className="uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: ORANGE, marginBottom: 8 }}>{children}</div>;
  const pf = (n) => (n == null ? "—" : `${n}%`);
  const status = live?.geo_status || fallbackStatus;
  const enginesStatus = live?.engines_status || [];

  // ── NOT measured → honest state panel ──
  if (!live?.measured) {
    const st = status?.state || (loading ? "loading" : "planned");
    const BADGE = { planned: { l: "PLANNED", c: "#8A6A52" }, queued: { l: "QUEUED", c: "#5A6A8A" }, running: { l: "RUNNING", c: ORANGE }, partially_complete: { l: "PARTIAL", c: "#8A6A52" }, failed: { l: "FAILED", c: "#B3261E" }, session_required: { l: "SESSION REQUIRED", c: "#9A6A12" }, loading: { l: "CHECKING…", c: "#9A9A9A" } };
    const b = BADGE[st] || BADGE.planned;
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <div className="flex items-center gap-2 flex-wrap mb-2"><Lbl>GEO Collection</Lbl><span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: b.c, color: "#fff" }}>{b.l}</span></div>
          <p style={{ fontFamily: BODY, fontSize: "13px", lineHeight: 1.6, color: "#4A4A4A", maxWidth: "46rem" }}>{loading ? `Checking for collected GEO results for ${domain}…` : (status?.message || `No GEO results have been measured for ${domain} yet. No Share-of-Voice, citation or mention numbers are shown until they come from real AI-engine answers.`)}</p>
          {enginesStatus.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
              {enginesStatus.map((e, i) => (
                <div key={i} className="rounded border p-2.5" style={{ borderColor: "#E5E5E5" }}>
                  <div style={{ fontFamily: BODY, fontSize: "11px", fontWeight: 700, color: INK }}>{e.name}</div>
                  <div style={{ fontFamily: BODY, fontSize: "10px", color: e.status === "ready" ? "#2F7D32" : "#9A6A12", textTransform: "capitalize" }}>{String(e.status).replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>
          )}
          {status?.note && <p style={{ fontFamily: BODY, fontSize: "11px", color: "#8A8A8A", marginTop: 10 }}>{status.note}</p>}
        </div>
      </div>
    );
  }

  // ── MEASURED → real collected data ──
  const o = live.overall || {};
  const sov = live.share_of_voice || { engines: [], by_brand: [] };
  const band = o.geo_score >= 60 ? "Strong" : o.geo_score >= 30 ? "Building" : "Low";
  return (
    <div className="space-y-4">
      {live.run?.status === "partial" && (
        <div style={{ fontFamily: BODY, fontSize: "11px", color: "#8A6A52", background: "#F7F0EA", border: "1px solid #ECD9CC", borderRadius: 8, padding: "8px 12px" }}>
          Partial collection — {live.run.completed_count} of {live.run.prompt_count} prompt×engine results captured. Showing only what was actually measured.
        </div>
      )}
      {/* Claude storytelling — deep analysis of the REAL collected GEO data (#10) */}
      {Array.isArray(live.storytelling) && live.storytelling.length > 0 && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>What the AI engines say about you — analysis</Lbl>
          <div className="space-y-3 mt-1">
            {live.storytelling.map((s, i) => (
              <div key={i}>
                {s.title && <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "13.5px", color: INK, marginBottom: 2 }}>{s.title}</div>}
                <p style={{ fontFamily: BODY, fontSize: "13px", lineHeight: 1.6, color: "#4A4A4A" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white p-5" style={cardB}>
        <div className="flex items-baseline gap-3 flex-wrap mb-2"><Lbl>GEO Score</Lbl><span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "26px", color: INK }}>{o.geo_score}<span style={{ fontSize: "13px", color: "#8A8A8A" }}>/100</span></span><span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: ORANGE, color: "#fff" }}>{band}</span></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontFamily: BODY, fontSize: "12px", color: "#5A5A5A" }}>
          <span>Share of Voice: <strong style={{ color: INK }}>{pf(o.sov)}</strong></span>
          <span>Brand mention rate: <strong style={{ color: INK }}>{pf(o.mention_rate)}</strong></span>
          <span>Citation rate: <strong style={{ color: INK }}>{pf(o.citation_rate)}</strong></span>
          <span>Engines measured: <strong style={{ color: INK }}>{o.engines_tested}</strong></span>
        </div>
        <p style={{ fontFamily: BODY, fontSize: "11px", color: "#8A8A8A", marginTop: 8 }}>Measured from real AI-engine answers collected via Playwright/Browserless. DataForSEO/Moz are not used in this score.</p>
      </div>

      {sov.by_brand?.length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Share of Voice — your brand vs competitors</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Brand</th>{(sov.engines || []).map((e, i) => <th key={i} style={{ ...thS, textAlign: "right" }}>{e}</th>)}<th style={{ ...thS, textAlign: "right" }}>Avg</th></tr></thead>
            <tbody>{sov.by_brand.map((br, i) => (
              <tr key={i} style={{ background: br.is_client ? "#FBF1EB" : (i % 2 ? "#fff" : "#F7F7F7") }}>
                <td style={{ ...cell, fontWeight: br.is_client ? 700 : 400 }}>{br.brand}{br.is_client ? " (you)" : ""}</td>
                {(sov.engines || []).map((e, j) => <td key={j} style={{ ...cell, textAlign: "right" }}>{br.per_engine?.[e] ?? 0}%</td>)}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{br.avg}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* measured counts — brand mentions, citations, sentiment */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {live.mentions_summary && (
          <div className="rounded-lg bg-white p-4" style={cardB}>
            <Lbl>Brand mentions</Lbl>
            <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "22px", color: INK }}>{live.mentions_summary.prompts_with_brand}<span style={{ fontSize: 13, color: "#8A8A8A" }}>/{live.mentions_summary.prompts_total} answers</span></div>
            <div style={{ fontFamily: BODY, fontSize: 11, color: "#5A5A5A", marginTop: 2 }}>{live.mentions_summary.brand_mentions} brand vs {live.mentions_summary.competitor_mentions} competitor mentions</div>
          </div>
        )}
        {live.citation_analysis && (
          <div className="rounded-lg bg-white p-4" style={cardB}>
            <Lbl>Citations</Lbl>
            <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "22px", color: INK }}>{live.citation_analysis.total}</div>
            <div style={{ fontFamily: BODY, fontSize: 11, color: "#5A5A5A", marginTop: 2 }}>{live.citation_analysis.brand} brand · {live.citation_analysis.competitor} competitor · {live.citation_analysis.third_party} third-party</div>
          </div>
        )}
        {live.sentiment_summary && (
          <div className="rounded-lg bg-white p-4" style={cardB}>
            <Lbl>Sentiment (brand)</Lbl>
            <div style={{ fontFamily: BODY, fontSize: 12, color: "#5A5A5A", marginTop: 8 }}>
              <span style={{ color: "#2F7D32" }}>▲ {live.sentiment_summary.positive}</span> positive · {live.sentiment_summary.neutral} neutral · <span style={{ color: "#B3261E" }}>▼ {live.sentiment_summary.negative}</span> negative
            </div>
          </div>
        )}
      </div>

      {/* §21 GEO score breakdown — the 7 weighted signals */}
      {live.score_breakdown?.signals && Object.keys(live.score_breakdown.signals).length > 0 && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>GEO score breakdown (§21 weighted signals, 0–100)</Lbl>
          <div className="space-y-1.5 mt-2">
            {Object.entries(live.score_breakdown.signals).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <div style={{ flex: "0 0 184px", fontFamily: BODY, fontSize: 11.5, color: "#5A5A5A", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</div>
                <div style={{ flex: 1, height: 8, background: "#F0F0F0", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(100, Number(v) || 0))}%`, height: "100%", background: ORANGE }} /></div>
                <div style={{ flex: "0 0 34px", textAlign: "right", fontFamily: BODY, fontSize: 11.5, fontWeight: 700, color: INK }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* most-cited source domains */}
      {live.citation_analysis?.top_source_domains?.length > 0 && (
        <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
          <div className="px-3 pt-3"><Lbl>Most-cited sources — which domains the AI engines cite</Lbl></div>
          <table className="w-full border-collapse">
            <thead><tr style={{ background: INK }}><th style={thS}>Source domain</th><th style={{ ...thS, textAlign: "right" }}>Citations</th><th style={{ ...thS, textAlign: "right" }}>Type</th></tr></thead>
            <tbody>{live.citation_analysis.top_source_domains.map((d, i) => (
              <tr key={i} style={{ background: i % 2 ? "#fff" : "#F7F7F7" }}><td style={cell}>{d.domain}</td><td style={{ ...cell, textAlign: "right" }}>{d.count}</td><td style={{ ...cell, textAlign: "right", color: d.type === "brand" ? "#2F7D32" : d.type === "competitor" ? "#B3261E" : "#8A8A8A" }}>{String(d.type).replace("_", " ")}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg overflow-x-auto bg-white" style={cardB}>
        <div className="px-3 pt-3"><Lbl>Per-engine results</Lbl></div>
        <table className="w-full border-collapse">
          <thead><tr style={{ background: INK }}>{["Engine", "Answers", "SoV", "Mention rate", "Brand mentions", "Brand citations", "GEO"].map((h, i) => <th key={i} style={{ ...thS, textAlign: i ? "right" : "left" }}>{h}</th>)}</tr></thead>
          <tbody>{(live.by_engine || []).map((e, i) => (
            <tr key={i} style={{ background: i % 2 ? "#fff" : "#F7F7F7" }}>
              <td style={cell}>{e.engine}</td><td style={{ ...cell, textAlign: "right" }}>{e.prompts_answered}</td><td style={{ ...cell, textAlign: "right" }}>{pf(e.sov)}</td><td style={{ ...cell, textAlign: "right" }}>{pf(e.mention_rate)}</td><td style={{ ...cell, textAlign: "right" }}>{e.brand_mentions}</td><td style={{ ...cell, textAlign: "right" }}>{e.brand_citations}</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{e.geo_score}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {live.prompts_executed?.length > 0 && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>Prompts executed ({live.prompts_executed.length}) — real AI-engine answers</Lbl>
          <div className="space-y-3 mt-2">{live.prompts_executed.slice(0, 12).map((p, i) => (
            <div key={i} style={{ borderTop: i ? "1px solid #F0F0F0" : "none", paddingTop: i ? 10 : 0 }}>
              <div style={{ fontFamily: BODY, fontSize: "12.5px", fontWeight: 700, color: INK }}>{p.prompt} <span style={{ color: "#8A8A8A", fontWeight: 400 }}>· {p.engine} · {p.citation_count} citations</span></div>
              {p.answer && <div style={{ fontFamily: BODY, fontSize: "12px", color: "#5A5A5A", marginTop: 4, lineHeight: 1.5 }}>{String(p.answer).slice(0, 320)}{p.answer.length > 320 ? "…" : ""}</div>}
            </div>
          ))}</div>
        </div>
      )}

      {live.collection_health?.errors > 0 && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>Collection health</Lbl>
          <div style={{ fontFamily: BODY, fontSize: 12, color: "#5A5A5A", marginTop: 2 }}>{live.collection_health.results_saved} answers collected · {live.collection_health.errors} failed.</div>
          {live.collection_health.by_engine?.length > 0 && (
            <div className="mt-2 space-y-1">{live.collection_health.by_engine.map((e, i) => (
              <div key={i} style={{ fontFamily: BODY, fontSize: 11.5, color: "#9A6A12" }}>{e.engine}: {e.count} failed ({Object.entries(e.types || {}).map(([t, n]) => `${n} ${String(t).replace(/_/g, " ")}`).join(", ")})</div>
            ))}</div>
          )}
        </div>
      )}

      {live.methodology && (
        <div className="rounded-lg bg-white p-5" style={cardB}>
          <Lbl>Methodology</Lbl>
          <div className="space-y-1.5 mt-1" style={{ fontFamily: BODY, fontSize: "11.5px", color: "#5A5A5A", lineHeight: 1.5 }}>{Object.entries(live.methodology).map(([k, v]) => <div key={k}><strong style={{ color: INK, textTransform: "capitalize" }}>{k}:</strong> {v}</div>)}</div>
        </div>
      )}
    </div>
  );
}

// ── Story prose block — the reference-deck warm narration. Renders an array of
//    paragraph strings (data.doctorFizz.story.*) as large, readable body copy with
//    an orange eyebrow label. Mirrors DoctorFizzReport's StoryBlock in WebsiteReport
//    design tokens (HEAD/BODY fonts, ORANGE/INK). Returns null when empty. ─────────
function StoryNote({ label, points, big = false }) {
  const list = (Array.isArray(points) ? points : [points]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="rounded-lg bg-white" style={{ border: "1px solid #E5E5E5", borderLeft: `4px solid ${ORANGE}`, boxShadow: "0 1px 2px rgba(0,0,0,0.04)", padding: "18px 22px", marginBottom: 14 }}>
      {label && <div className="uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.22em", color: ORANGE, marginBottom: 10 }}>{label}</div>}
      {list.map((p, i) => (
        <p key={i} style={{ fontFamily: BODY, fontSize: big ? "16px" : "14.5px", lineHeight: 1.7, color: "#2A2A2A", margin: 0, marginBottom: i === list.length - 1 ? 0 : 12 }}>{p}</p>
      ))}
    </div>
  );
}

// ── EXECUTIVE STORY — the plain-language spine near the top of the report. Renders
//    data.doctorFizz.story as one flowing read for a non-technical owner: where they
//    stand → what's holding them back → the biggest opportunity → the plan. Guarded by
//    the caller (only mounts when data.doctorFizz?.story is present). ────────────────
function ExecutiveStory({ story, domain }) {
  const s = story || {};
  // Story panels in narrative order, each pulling a real data.doctorFizz.story.* array.
  const panels = [
    { label: "Where You Stand Today",      points: s.the_situation },
    { label: "What's Holding You Back",    points: s.whats_blocking_growth },
    { label: "Your Biggest Opportunity",   points: s.the_opportunity },
    { label: "The Plan, In Plain English", points: s.priority_plan },
    { label: "What Good Looks Like",       points: s.what_good_looks_like },
  ].filter((p) => (Array.isArray(p.points) ? p.points.filter(Boolean).length : p.points));
  if (!panels.length) return null;
  return (
    <section className="py-16" style={{ background: "#FAF7F4" }}>
      <div className="max-w-6xl mx-auto px-8 md:px-14">
        <AnimatedSection>
          <span className="inline-flex items-center align-middle" style={{ marginRight: 9 }}>
            <span style={{ width: 11, height: 11, background: ORANGE, display: "inline-block", borderRadius: 1, marginRight: 9 }} />
            <span className="uppercase" style={{ fontFamily: BODY, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", color: ORANGE }}>THE STORY ·</span>
          </span>
          <span className="uppercase align-middle" style={{ fontFamily: BODY, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", color: "#7A7A7A" }}>READ THIS FIRST</span>
          <h2 style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "clamp(1.55rem,3vw,2.25rem)", lineHeight: 1.12, letterSpacing: "-0.01em", color: INK, marginTop: 12 }}>
            What This Report Says, In Plain English
          </h2>
          <p style={{ fontFamily: BODY, fontSize: "15px", lineHeight: 1.65, color: "#5A5A5A", marginTop: 10, marginBottom: 24, maxWidth: "44rem" }}>
            The full report below has all the numbers and the detail. This is the short version — what&apos;s happening with {domain}, what to do, and why — written for a busy owner, not an SEO expert.
          </p>
          {panels.map((p, i) => (
            <StoryNote key={i} label={p.label} points={p.points} big />
          ))}
        </AnimatedSection>
      </div>
    </section>
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

  // ── Storytelling + plain-language layer (built upstream, ignored until now) ──
  // data.doctorFizz.story → the plain-language spine (the_situation, the_opportunity,
  // whats_blocking_growth, priority_plan, what_good_looks_like, …).
  const dfStory = d.doctorFizz?.story || null;
  // data.doctorFizz.v2_additions.formatted_baseline → per-metric plain-language defs,
  // keyed by the card label so plainFor() can look each metric up.
  const fbMap = (() => {
    const arr = d.doctorFizz?.v2_additions?.formatted_baseline || [];
    const m = {};
    for (const b of arr) { if (b && b.label) m[b.label] = b; }
    return m;
  })();

  const dateStr = d.generatedAt
    ? new Date(d.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Consistent compact formatting (#17) — 1,248.774 → "1.25K", 3.4M, no stray precision.
  // Small counts (<1000) stay as plain integers. Delegates to the shared report-format util.
  const fmt = (v) => fmtNum(v);

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
          EXECUTIVE STORY — plain-language spine (reads data.doctorFizz.story).
          The warm, one-read summary for a non-technical owner, placed right after
          the cover and before the metrics. Only renders when the story exists.
      ══════════════════════════════════════════════════════ */}
      {dfStory && <ExecutiveStory story={dfStory} domain={domain} />}

      {/* ══════════════════════════════════════════════════════
          01 · THE BASELINE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-6xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={1} total={N} />
          <OBar />
          <SHead>THE BASELINE</SHead>
          <SSub>Where {domain} Stands Today</SSub>

          {/* Plain-language intro so the dashboard isn't a wall of jargon */}
          <p style={{ fontFamily: BODY, fontSize: "14px", lineHeight: 1.65, color: "#5A5A5A", marginTop: -10, marginBottom: 22, maxWidth: "44rem" }}>
            These are the health checks for {domain} right now. Each card explains in plain words what the number means — orange marks the ones worth attention first.
          </p>

          {/* Metric cards — reference style (left accent bar + big number + label + sub).
              Sub-labels now carry the plain-language definition from
              data.doctorFizz.v2_additions.formatted_baseline[].plain_language (via
              plainFor), falling back to the local PLAIN_LANGUAGE map. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Canonical terminology (Domain Rating, not "Domain Authority") + each metric
                tagged with its data source (#15/#16). Sub = plain-language gloss · source. */}
            <MetricCard value={bm.domainRating ?? "—"} label="Domain Rating" sub={`${plainFor("Domain Authority", fbMap, "0–100 link authority")} · Moz`} accent="orange" />
            <MetricCard value={fmt(bm.organicTraffic)} label="Organic Traffic" sub={`${plainFor("Organic Traffic", fbMap, "Est. visits / month")} · DataForSEO`} accent="orange" />
            <MetricCard value={fmt(bm.organicKeywords)} label="Organic Keywords" sub={`${plainFor("Organic Keywords", fbMap, "Terms you rank for")} · DataForSEO`} accent="orange" />
            <MetricCard value={bm.performanceMobile != null ? `${bm.performanceMobile}/100` : "—"} label="Mobile Performance" sub={`${plainFor("Mobile Speed", fbMap, "Google PageSpeed")} · Lighthouse`} accent={bm.performanceMobile != null && bm.performanceMobile < 50 ? "orange" : "ink"} />
            <MetricCard value={bm.performanceDesktop != null ? `${bm.performanceDesktop}/100` : "—"} label="Desktop Performance" sub={`${plainFor("Desktop Speed", fbMap, "Google PageSpeed")} · Lighthouse`} />
            <MetricCard value={bm.lcp != null ? `${(Number(bm.lcp) / 1000).toFixed(1)}s` : "—"} label="LCP" sub={`${plainFor("LCP", fbMap, "how long the main content takes to load")} · Lighthouse`} />
            <MetricCard value={bm.cls != null ? Number(bm.cls).toFixed(3) : "—"} label="CLS" sub={`${plainFor("CLS", fbMap, "how much the page jumps around while loading")} · Lighthouse`} />
            <MetricCard value={fmt(bm.backlinks)} label="Total Backlinks" sub={`${plainFor("Total Backlinks", fbMap, "Total inbound links")} · DataForSEO`} />
            <MetricCard value={fmt(bm.referringDomains)} label="Referring Domains" sub={`${plainFor("Referring Domains", fbMap, "Unique linking domains")} · DataForSEO`} />
            <MetricCard value={fmt(bm.errors404)} label="404 Errors" sub={`${plainFor("404 Errors", fbMap, "Broken pages")} · Doctor Fizz crawler`} accent={Number(bm.errors404) > 0 ? "orange" : "ink"} />
            <MetricCard value={crawlHealth != null ? `${crawlHealth}/100` : "—"} label="Site Health" sub={`${plainFor("Site Health", fbMap, "Crawl health score")} · Doctor Fizz crawler`} />
            <MetricCard value={gmbScore != null ? `${gmbScore}/100` : "—"} label="GMB Completeness" sub={`${plainFor("GMB Completeness", fbMap, "Google Business Profile")} · GBP API`} />
          </div>

          {/* Plain-language narration of the baseline (data.doctorFizz.story.the_situation) */}
          {dfStory?.the_situation && (
            <div className="mt-6">
              <StoryNote label="What This Means For You" points={dfStory.the_situation} />
            </div>
          )}

          {/* KEY TAKEAWAY — grounded in the numbers above */}
          <div className="mt-6">
            <DarkCallout label="Key Takeaway">
              {domain} sits at Domain Rating {bm.domainRating ?? "—"} (Moz) with {fmt(bm.organicTraffic)} organic visits a month across {fmt(bm.organicKeywords)} ranking keywords{bm.performanceMobile != null ? `, on a ${bm.performanceMobile}/100 mobile performance score` : ""}. {bm.errors404 ? `${fmt(bm.errors404)} broken pages and the technical base must be fixed first` : "The technical base must be solid first"} — then content and authority gains compound on top.
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
                <div className="col-span-2 text-sm text-gray-400 py-4">Not enough data to assess this yet.</div>
              )}
            </div>

            {(cl.nationalPlatforms || []).length > 0 && (
              <>
                <div className="uppercase mb-4" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "11px", letterSpacing: "0.2em", color: "#7A7A7A" }}>National Competitors</div>
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
            <div className="text-sm text-gray-400 mb-10 py-4">Not enough data to assess this yet.</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: "Tier 2 — Neighbourhood Hyper-Local", items: ks.tier2Neighborhood },
              { title: "Tier 3 — Informational Blog", items: ks.tier3Informational },
            ].map((t) => (
              <div key={t.title} className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                <div style={{ height: 4, background: ORANGE }} />
                <div className="p-6">
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "15px", color: INK, marginBottom: 12 }}>{t.title}</div>
                  <ul className="space-y-2.5">
                    {(t.items || []).map((kw, i) => (
                      <li key={i} className="flex items-start gap-2.5" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: ORANGE, marginTop: 6, flexShrink: 0 }} />{kw}
                      </li>
                    ))}
                    {!(t.items || []).length && <li className="text-sm text-gray-400">Not enough data to assess this yet.</li>}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          04 · CONTENT ARCHITECTURE
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={4} total={N} />
            <OBar />
            <SHead>CONTENT ARCHITECTURE</SHead>
            <SSub>What To Build — Pages &amp; Blogs</SSub>

            <PagesToBuild ca={ca} />
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
              { title: "What Works For Them", items: ci.whatWorksForThem, bar: ORANGE, empty: "Not enough data to assess this yet." },
              { title: "Gaps You Can Exploit", items: ci.gapsYouCanExploit, bar: "#4A4A4A", empty: "Not enough data to assess this yet." },
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
                        Not enough data to assess this yet.
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
                    {!col.items.length && <li className="text-xs text-gray-400">Not enough data to assess this yet.</li>}
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
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={8} total={N} />
            <OBar />
            <SHead>LOCAL SEARCH</SHead>
            <SSub>Google Business Profile: The Fastest Win</SSub>

            {/* Real GMB status strip — white cards */}
            {gmbInfo && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[
                  { label: "GMB Listing", value: gmbInfo.found ? "Found ✓" : "Not Found ✗", bad: !gmbInfo.found },
                  { label: "Verified", value: gmbInfo.isVerified ? "Yes ✓" : "No ✗", bad: !gmbInfo.isVerified },
                  { label: "Rating", value: gmbInfo.rating ? `${gmbInfo.rating}★` : "N/A", bad: !gmbInfo.rating || gmbInfo.rating < 4 },
                  { label: "Reviews", value: gmbInfo.reviewCount != null ? String(gmbInfo.reviewCount) : "—", bad: (gmbInfo.reviewCount || 0) < 10 },
                ].map(({ label, value, bad }) => (
                  <div key={label} className="bg-white rounded-lg p-4" style={{ border: "1px solid #E5E5E5" }}>
                    <div className="uppercase mb-1" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "9px", letterSpacing: "0.12em", color: "#8A8A8A" }}>{label}</div>
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "18px", color: bad ? "#B3261E" : ORANGE }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* #6 — competitor benchmarking table (real client-vs-competitor GBP data) */}
            <GbpComparisonTable gbp={d.doctorFizz?.gbp_comparison} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* checklist white card */}
              <div className="bg-white rounded-lg p-6" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "15px", color: INK, marginBottom: 14 }}>GBP Action Checklist</div>
                <ul className="space-y-3">
                  {(ls.gbpChecklist || []).map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.5 }}>
                      <span style={{ color: ORANGE, fontWeight: 700, flexShrink: 0 }}>✓</span>{item}
                    </li>
                  ))}
                  {!(ls.gbpChecklist || []).length && <li className="text-sm text-gray-400">Not enough data to assess this yet.</li>}
                </ul>
              </div>
              {/* review target (dark callout) + GMB completeness */}
              <div className="space-y-4">
                {ls.reviewTarget && <DarkCallout label="Review Target">{ls.reviewTarget}</DarkCallout>}
                {gmbScore != null && (
                  <div className="bg-white rounded-lg p-5" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                    <div className="uppercase mb-2" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.18em", color: "#8A8A8A" }}>GMB Completeness Score</div>
                    <div className="flex items-end gap-2">
                      <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "30px", color: gmbScore >= 70 ? ORANGE : gmbScore >= 40 ? "#9A6A12" : "#B3261E" }}>{gmbScore}</span>
                      <span style={{ color: "#8A8A8A", fontSize: 13, marginBottom: 4 }}>/100</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "#EDEDED" }}>
                      <div className="h-full rounded-full" style={{ width: `${gmbScore}%`, background: ORANGE }} />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {rm.map((phase, i) => {
              const hdr = ["#C35328", "#A8431E", "#4A4A4A", "#8A8A8A"][i % 4];
              return (
                <div key={i} className="rounded-lg overflow-hidden bg-white flex flex-col" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div className="px-4 py-3" style={{ background: hdr }}>
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "15px", color: "#fff" }}>Phase {i + 1}</div>
                    {phase.duration && <div style={{ fontFamily: BODY, fontSize: "11px", color: "rgba(255,255,255,0.85)" }}>{phase.duration}</div>}
                  </div>
                  <div className="p-4 flex-1">
                    {phase.title && <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "13px", color: INK, marginBottom: 8 }}>{phase.title}</div>}
                    <ul className="space-y-2">
                      {(phase.actions || []).map((action, j) => (
                        <li key={j} className="flex items-start gap-2" style={{ fontFamily: BODY, fontSize: "12px", color: "#5A5A5A", lineHeight: 1.45 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: ORANGE, marginTop: 6, flexShrink: 0 }} />{action}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
            {!rm.length && <div className="col-span-full text-sm text-gray-400 py-4">Not enough data to assess this yet.</div>}
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

            {/* #14 — separate CURRENT (measured) from TARGETS (projections). */}
            <p style={{ fontFamily: BODY, fontSize: "13px", lineHeight: 1.6, color: "#5A5A5A", marginTop: -10, marginBottom: 16, maxWidth: "46rem" }}>
              The <strong style={{ color: INK }}>Current</strong> column is measured today (DataForSEO / Moz / Doctor Fizz crawler). The 6- and 12-month columns are <strong style={{ color: ORANGE }}>targets — projections, not current performance</strong>: directional estimates that assume the plan below is implemented. They are not guarantees.
            </p>

            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E5E5" }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ background: INK, color: "#fff" }}>
                    {["Metric", "Current (measured)", "6-Month Target", "12-Month Target"].map((h, i) => (
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
            <div className="text-sm text-gray-400 py-4">Not enough data to assess this yet.</div>
          )}
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          12 · UNCONTESTED TERRITORY
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16" data-pdf-keep="1">
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
                <div className="col-span-3 text-sm text-gray-400 py-4">Not enough data to assess this yet.</div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          THE IMPLEMENTATION PLAN — every recommendation in the 10-field evidence
          structure (Track 1.2). Reads data.doctorFizz.evidence_plan.
      ══════════════════════════════════════════════════════ */}
      <EvidencePlanSection plan={d.doctorFizz?.evidence_plan} />

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

            {/* Plain-language narration of the GEO opportunity (data.doctorFizz.story.geo_ai_visibility) */}
            {dfStory?.geo_ai_visibility && (
              <StoryNote label="Why This Section Matters" points={dfStory.geo_ai_visibility} />
            )}

            {/* Plain one-line definitions so the jargon below reads as English */}
            <div className="rounded-lg bg-white mb-4" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", padding: "16px 20px" }}>
              <div className="uppercase" style={{ fontFamily: BODY, fontWeight: 700, fontSize: "10px", letterSpacing: "0.22em", color: ORANGE, marginBottom: 10 }}>The Words In This Section, Explained</div>
              <ul className="space-y-2">
                {Object.entries(GEO_GLOSS).map(([term, def]) => (
                  <li key={term} className="flex items-baseline gap-2" style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: INK, whiteSpace: "nowrap" }}>{term}</span>
                    <span style={{ color: "#A8A8A8" }}>—</span>
                    <span>{def}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Full §14-25 GEO model (SoV, metrics, topic dominance, citation intelligence,
                Claude deep analysis) when a live scan exists; readiness + tracked prompts +
                actions always. Real data — replaces the old hallucinated citation counts. */}
            {/* Phase 3 — live collected GEO results from MongoDB (real measured data or
                the honest planned/queued/running/session-required state). */}
            <GeoLiveSection
              domain={domain}
              fallbackStatus={d.doctorFizz?.geo_status || null}
              source={{
                domain,
                brand: d.doctorFizz?.report_meta?.client_name || domain,
                industry: d.doctorFizz?.report_meta?.industry || "",
                businessScope: d.doctorFizz?.report_meta?.business_scope || "",
                competitors: d.doctorFizz?.competitors || [],
                keywords: d.doctorFizz?.keywords?.accepted || d.doctorFizz?.keywords || [],
              }}
            />
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
              <div className="col-span-2 text-sm text-gray-400 py-4">Not enough data to assess this yet.</div>
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
                <div className="col-span-3 text-sm text-gray-400 py-4">Not enough data to assess this yet.</div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          16 · WHY DOCTORFIZZ
      ══════════════════════════════════════════════════════ */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={16} total={N} />
            <OBar />
            <SHead>WHY DOCTORFIZZ</SHead>
            <SSub>Evidence Over Guesswork</SSub>

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
                <div key={i} className="bg-white rounded-lg overflow-hidden" style={{ border: "1px solid #E5E5E5", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                  <div style={{ height: 4, background: ORANGE }} />
                  <div className="p-6">
                    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "15px", color: INK, marginBottom: 6 }}>{card.title}</div>
                    <p style={{ fontFamily: BODY, fontSize: "13px", color: "#5A5A5A", lineHeight: 1.55 }}>{card.desc}</p>
                  </div>
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
