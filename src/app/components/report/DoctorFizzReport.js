"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// DOCTOR FIZZ — BRANDED REPORT RENDERER (spec Part 4 visual system + Part 5 layout)
// ═══════════════════════════════════════════════════════════════════════════════
// Renders the Stage-3 structured payload (data.doctorFizz) and the Stage-4
// strategic narrative (data.strategicPlan) using the locked Doctor Fizz visual
// system: color palette, section numbering (01 · NAME), diagnosis/prescription
// cards, SEO/GEO/SEO+GEO tag chips, priority labels, styled tables with colored
// difficulty chips, missing-data labels, and the QA score badge.
// ═══════════════════════════════════════════════════════════════════════════════

import { useMemo } from "react";

const LOGO_URL = "https://doctorfizz.com/wp-content/uploads/2025/09/doctorfizzlogo_1-scaled.png";

// ── Color palette (Part 4) ────────────────────────────────────────────────────
const C = {
  nearBlack:  "#1a1714",
  ivory:      "#faf8f4",
  orange:     "#d45427",  // burnt orange / terracotta — signature accent
  orangeLite: "#ffa615",
  sage:       "#7d9b7f",  // SEO chip
  teal:       "#4f8a9b",  // GEO chip
  warmGrey:   "#9c9488",  // SEO+GEO chip, borders, dividers
  greyText:   "#6b6359",
};

// ── Tag chip (SEO / GEO / SEO+GEO) ────────────────────────────────────────────
function TagChip({ tag }) {
  const t = String(tag || "").toUpperCase().replace(/\s+/g, "");
  const map = {
    "SEO":     { bg: "#eaf0ea", fg: C.sage,   label: "SEO" },
    "GEO":     { bg: "#e6eff2", fg: C.teal,   label: "GEO" },
    "SEO+GEO": { bg: "#f0ede8", fg: C.warmGrey, label: "SEO + GEO" },
  };
  const s = map[t] || map["SEO+GEO"];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase"
      style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

// ── Priority label (CRITICAL / HIGH / MEDIUM / QUICK WIN) ──────────────────────
function PriorityLabel({ priority }) {
  const p = String(priority || "").toUpperCase();
  const map = {
    "CRITICAL":  { bg: "#fde8e3", fg: "#c0341a" },
    "HIGH":      { bg: "#fdeede", fg: "#d45427" },
    "MEDIUM":    { bg: "#fdf6e3", fg: "#b8860b" },
    "QUICK WIN": { bg: "#e9f3ea", fg: "#3f7d4a" },
    "LOW":       { bg: "#f0ede8", fg: C.greyText },
  };
  const s = map[p] || map["MEDIUM"];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase"
      style={{ background: s.bg, color: s.fg }}>
      {s.label || p}
    </span>
  );
}

// ── Difficulty chip (red high / amber medium / green low) ─────────────────────
function DiffChip({ value }) {
  if (value == null) return <span className="text-gray-400">—</span>;
  const v = Number(value);
  const s = v >= 60 ? { bg: "#fde8e3", fg: "#c0341a", t: "High" }
          : v >= 35 ? { bg: "#fdf6e3", fg: "#b8860b", t: "Med" }
          :           { bg: "#e9f3ea", fg: "#3f7d4a", t: "Low" };
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: s.bg, color: s.fg }}>
      {v}<span className="opacity-70">{s.t}</span>
    </span>
  );
}

// ── Section shell with numbering (01 · NAME) ──────────────────────────────────
function Section({ number, total, title, children }) {
  return (
    <section className="mb-10 scroll-mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-extrabold tracking-[0.25em] uppercase" style={{ color: C.orange }}>
            {String(number).padStart(2, "0")} ·
          </span>
          <h2 className="text-[17px] sm:text-[19px] font-bold tracking-tight" style={{ color: C.nearBlack, fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {title}
          </h2>
        </div>
        <span className="text-[10px] tracking-widest font-medium" style={{ color: C.warmGrey }}>
          {String(number).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="h-px w-full mb-5" style={{ background: `linear-gradient(90deg, ${C.orange} 0%, transparent 60%)` }} />
      {children}
    </section>
  );
}

// ── Diagnosis card (left orange border) ───────────────────────────────────────
function DiagnosisCard({ children }) {
  return (
    <div className="rounded-r-lg p-4 mb-4" style={{ background: "#fff", borderLeft: `3px solid ${C.orange}`, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: C.orange }}>Diagnosis</div>
      <div className="text-[13px] leading-relaxed" style={{ color: C.nearBlack }}>{children}</div>
    </div>
  );
}

// ── Prescription card (outlined) ──────────────────────────────────────────────
function PrescriptionCard({ children }) {
  return (
    <div className="rounded-lg p-4 mb-4" style={{ background: C.ivory, border: `1px solid ${C.warmGrey}40` }}>
      <div className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: C.greyText }}>Prescription</div>
      <div className="text-[13px] leading-relaxed" style={{ color: C.nearBlack }}>{children}</div>
    </div>
  );
}

// ── Lightweight markdown → JSX (headings, bold, lists, tags, priority) ─────────
function renderNarrative(md) {
  if (!md) return null;
  const lines = String(md).split("\n");
  const out = [];
  let listBuf = [];

  const flushList = (key) => {
    if (!listBuf.length) return;
    out.push(
      <ul key={`ul-${key}`} className="list-none space-y-1.5 mb-3 ml-0">
        {listBuf.map((item, i) => (
          <li key={i} className="flex gap-2 text-[13px] leading-relaxed" style={{ color: C.nearBlack }}>
            <span style={{ color: C.orange }} className="mt-0.5">▸</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    listBuf = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) {
      flushList(idx);
      out.push(<h4 key={idx} className="text-[14px] font-bold mt-4 mb-2" style={{ color: C.nearBlack }}>{renderInline(line.replace(/^###\s+/, ""))}</h4>);
    } else if (/^(SUBSECTION|Paragraph)\b/i.test(line) || /^\*\*.+\*\*:?$/.test(line)) {
      flushList(idx);
      out.push(<h4 key={idx} className="text-[13px] font-bold mt-4 mb-1.5 tracking-wide" style={{ color: C.orange }}>{renderInline(line.replace(/\*\*/g, ""))}</h4>);
    } else if (/^[-*•]\s+/.test(line)) {
      listBuf.push(line.replace(/^[-*•]\s+/, ""));
    } else if (/^\d+\.\s+/.test(line)) {
      listBuf.push(line.replace(/^\d+\.\s+/, ""));
    } else if (line === "") {
      flushList(idx);
    } else {
      flushList(idx);
      out.push(<p key={idx} className="text-[13px] leading-relaxed mb-2" style={{ color: C.nearBlack }}>{renderInline(line)}</p>);
    }
  });
  flushList("end");
  return out;
}

// Inline: bold, tags [SEO]/[GEO]/[SEO+GEO], priority labels
function renderInline(text) {
  const nodes = [];
  let remaining = String(text);
  let key = 0;
  const pattern = /\[(SEO\+GEO|SEO|GEO)\]|\*\*(.+?)\*\*|\b(CRITICAL|QUICK WIN|HIGH|MEDIUM)\b/g;
  let lastIndex = 0;
  let m;
  while ((m = pattern.exec(remaining)) !== null) {
    if (m.index > lastIndex) nodes.push(remaining.slice(lastIndex, m.index));
    if (m[1]) nodes.push(<span key={key++} className="mx-0.5 inline-block align-middle"><TagChip tag={m[1]} /></span>);
    else if (m[2]) nodes.push(<strong key={key++} style={{ color: C.nearBlack }}>{m[2]}</strong>);
    else if (m[3]) nodes.push(<span key={key++} className="mx-0.5 inline-block align-middle"><PriorityLabel priority={m[3]} /></span>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < remaining.length) nodes.push(remaining.slice(lastIndex));
  return nodes;
}

// ── Field value with missing-data label support (Problem 7) ───────────────────
function FieldValue({ field, suffix = "" }) {
  if (!field) return <span className="text-gray-400">—</span>;
  if (field.value != null) return <span style={{ color: C.nearBlack }} className="font-semibold">{field.value}{suffix}</span>;
  return <span className="text-[11px] italic" style={{ color: C.greyText }}>{field.label}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function DoctorFizzReport({ data }) {
  const payload = data?.doctorFizz;
  const plan    = data?.strategicPlan;
  const qa      = data?.qaResult || plan?.qaResult;

  // Order the strategic-plan narrative sections by their parsed number
  const narrativeSections = useMemo(() => {
    const s = plan?.sections;
    if (!s || typeof s !== "object") return [];
    return Object.values(s)
      .filter(v => v && v.number && v.body)
      .sort((a, b) => Number(a.number) - Number(b.number));
  }, [plan]);

  if (!payload) return null;

  const meta = payload.report_meta || {};
  const baseline = payload.baseline || {};
  const kw = payload.keywords || {};
  const ca = payload.content_architecture || {};
  const bl = payload.backlinks || {};
  const gbp = payload.gbp_comparison || {};
  const kpis = payload.kpis?.metrics || [];
  const tech = payload.technical_issues || [];
  const geo = payload.geo_and_ai_visibility || {};

  // Total sections for the "NN / TT" counter
  const TOTAL = 12;

  // Section 00 — Contents & scope (Part 5)
  const CONTENTS = [
    ["01", "Executive Summary", "Short-form diagnosis, scale of opportunity, top prescribed actions"],
    ["02", "Priority Action Plan", "All actions ranked by impact-to-effort across three tiers"],
    ["03", "Baseline Snapshot", "Current metrics with commercial interpretation"],
    ["04", "Competitor Landscape", "Threat levels, advantages, and exploitable gaps"],
    ["05", "Keyword Strategy", "Classified keyword clusters by intent"],
    ["06", "Content Architecture", "Commercial pages, blog content, and city pages — separated"],
    ["07", "Technical Foundation", "Ranked technical issues with developer-actionable fixes"],
    ["08", "Authority & Link Building", "Citation, editorial, competitor-gap, local authority"],
    ["09", "Local Visibility & GBP", "Competitor comparison + biggest gap / fastest win / trust gap"],
    ["10", "GEO Layer & AI Visibility", "AI citation status, schema, and answer-engine optimisation"],
    ["11", "KPI Forecast & Measurement", "Validated targets with measurement guidance"],
    ["12", "Implementation & Sprint Plan", "Time-sequenced execution roadmap"],
  ];

  return (
    <div style={{ background: C.ivory }} className="w-full">
      {/* ── COVER ─────────────────────────────────────────────────────────── */}
      <div className="relative px-6 sm:px-10 py-12 sm:py-16" style={{ background: C.nearBlack }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-10">
            <img src={LOGO_URL} alt="Doctor Fizz" className="h-9 w-auto object-contain" style={{ filter: "brightness(0) invert(1)" }}
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <span className="text-white font-black text-lg tracking-tight">Doctor<span style={{ color: C.orangeLite }}>Fizz</span></span>
          </div>
          <div className="text-[11px] tracking-[0.35em] uppercase font-semibold mb-4" style={{ color: C.orangeLite }}>
            SEO &amp; GEO Prescription
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4 text-white" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            On-Page SEO &amp; GEO<br />Diagnostic Report
          </h1>
          <p className="text-[13px] sm:text-[15px] leading-relaxed mb-10 max-w-xl" style={{ color: "#c9c2b8" }}>
            A clinical diagnosis of {meta.domain}'s search visibility, content architecture, local presence, and AI-citation footprint — with a sequenced, impact-ranked prescription.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[12px] pt-6" style={{ borderTop: `1px solid ${C.warmGrey}40` }}>
            <Meta label="Client"      value={meta.client_name} />
            <Meta label="Domain"      value={meta.domain} />
            <Meta label="Report Type" value={meta.report_type} />
            <Meta label="Industry"    value={meta.industry || "—"} />
            <Meta label="Date"        value={meta.report_date} />
            <Meta label="Reference"   value={meta.report_ref} />
          </div>
        </div>
      </div>

      {/* QA badge */}
      {qa && (
        <div className="px-6 sm:px-10 py-3" style={{ background: "#fff", borderBottom: `1px solid ${C.warmGrey}30` }}>
          <div className="max-w-4xl mx-auto flex items-center gap-3 text-[12px]">
            <span className="font-bold tracking-wide uppercase text-[10px]" style={{ color: C.greyText }}>Quality gate</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px]"
              style={{ background: qa.passed ? "#e9f3ea" : "#fdf6e3", color: qa.passed ? "#3f7d4a" : "#b8860b" }}>
              {qa.passedCount}/{qa.total} checks · {qa.score}%
            </span>
            {!qa.passed && qa.failures?.length > 0 && (
              <span className="text-[11px]" style={{ color: C.greyText }}>
                {qa.failures.length} item(s) flagged for review
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="px-6 sm:px-10 py-10">
        <div className="max-w-4xl mx-auto">

          {/* Section header repeats brand on body (Part 4 header rule) */}
          <div className="flex items-center justify-between mb-8 pb-3" style={{ borderBottom: `1px solid ${C.warmGrey}30` }}>
            <div className="flex items-center gap-2">
              <img src={LOGO_URL} alt="" className="h-5 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <span className="font-black text-[13px]" style={{ color: C.nearBlack }}>Doctor<span style={{ color: C.orange }}>Fizz</span></span>
            </div>
            <span className="text-[11px]" style={{ color: C.greyText }}>{meta.client_name} · {meta.report_type} report</span>
          </div>

          {/* ── 00 · CONTENTS & SCOPE ───────────────────────────────────────── */}
          <Section number={0} total={TOTAL} title="Contents &amp; Scope">
            <div className="rounded-lg p-4 mb-3" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>
              <div className="text-[11px] mb-3" style={{ color: C.greyText }}>
                Method: this report draws on live crawl, DataForSEO keyword/SERP/backlink data, Google Business Profile data for {meta.client_name} and identified competitors, and PageSpeed/Core Web Vitals. Keywords are intent-classified and topical-relevance filtered; KPI targets are directionally validated before rendering.
              </div>
              <div className="space-y-1">
                {CONTENTS.map(([n, t, d]) => (
                  <div key={n} className="flex items-baseline gap-2 text-[12px]">
                    <span className="font-bold tabular-nums" style={{ color: C.orange }}>{n}</span>
                    <span className="font-semibold" style={{ color: C.nearBlack }}>{t}</span>
                    <span className="hidden sm:inline truncate" style={{ color: C.greyText }}>— {d}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── 03 · BASELINE SNAPSHOT (data table) ─────────────────────────── */}
          <Section number={3} total={TOTAL} title="Baseline Snapshot">
            <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.warmGrey}30` }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: C.nearBlack }}>
                    <th className="text-left px-3 py-2 font-bold tracking-wider uppercase text-[10px] text-white">Metric</th>
                    <th className="text-right px-3 py-2 font-bold tracking-wider uppercase text-[10px] text-white">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Domain Rating", "domain_rating", ""],
                    ["Organic Traffic", "organic_traffic", "/mo"],
                    ["Organic Keywords", "organic_keywords", ""],
                    ["Referring Domains", "referring_domains", ""],
                    ["Mobile Performance", "mobile_performance_score", "/100"],
                    ["Desktop Performance", "desktop_performance_score", "/100"],
                    ["LCP", "lcp", " ms"],
                    ["CLS", "cls", ""],
                    ["Site Health Score", "site_health_score", "/100"],
                    ["GBP Completeness", "gbp_completeness", "/100"],
                    ["GBP Reviews", "gbp_review_count", ""],
                    ["GBP Rating", "gbp_rating", "★"],
                  ].map(([label, field, suffix], i) => (
                    <tr key={field} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                      <td className="px-3 py-2" style={{ color: C.greyText }}>{label}</td>
                      <td className="px-3 py-2 text-right"><FieldValue field={baseline[field]} suffix={suffix} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── 05 · KEYWORD STRATEGY (classified) ──────────────────────────── */}
          <Section number={5} total={TOTAL} title="Keyword Strategy">
            <DiagnosisCard>
              {kw.accepted?.length || 0} keywords passed intent classification and topical-relevance filtering.
              {kw.excluded?.length ? ` ${kw.excluded.length} high-volume but irrelevant term(s) were suppressed (no conversion path).` : ""}
              {kw.brand_monitoring_only?.length ? ` ${kw.brand_monitoring_only.length} competitor/brand term(s) routed to monitoring — never content targets.` : ""}
            </DiagnosisCard>
            <KeywordTable rows={kw.accepted || []} />
            {kw.brand_monitoring_only?.length > 0 && (
              <div className="mt-4 p-3 rounded-lg" style={{ background: "#f0ede8" }}>
                <div className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: C.warmGrey }}>Brand Monitoring Only — track share-of-voice, do not target</div>
                <div className="flex flex-wrap gap-1.5">
                  {kw.brand_monitoring_only.map((k, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "#fff", color: C.greyText }} title={k.reason}>{k.keyword}</span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* ── 06 · CONTENT ARCHITECTURE (3 separated subsections) ─────────── */}
          <Section number={6} total={TOTAL} title="Content Architecture">
            <ContentSub title="Core Commercial Pages" rows={ca.commercial_pages || []} type="commercial" />
            <ContentSub title="Blog &amp; Educational Content" rows={ca.blog_and_guides || []} type="blog" />
            {(ca.city_pages || []).length > 0 && (
              <ContentSub title="Local &amp; City Pages" rows={ca.city_pages || []} type="city" />
            )}
          </Section>

          {/* ── 07 · TECHNICAL FOUNDATION ───────────────────────────────────── */}
          {tech.length > 0 && (
            <Section number={7} total={TOTAL} title="Technical Foundation">
              <DiagnosisCard>
                {tech.filter(t => t.priority === "CRITICAL").length > 0
                  ? `${tech.filter(t => t.priority === "CRITICAL").length} critical blocker(s) are throttling the entire site — fix these before any content or authority work.`
                  : `${tech.length} technical issue(s) detected, ranked by ranking impact. Resolve in priority order.`}
              </DiagnosisCard>
              <div className="space-y-2">
                {tech.map((t, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>
                    <div className="flex items-center justify-between flex-wrap gap-1.5 mb-1">
                      <span className="text-[13px] font-semibold" style={{ color: C.nearBlack }}>{t.issue}</span>
                      <div className="flex items-center gap-1.5">
                        <PriorityLabel priority={t.priority} />
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.ivory, color: C.greyText }}>{t.estimated_effort}</span>
                      </div>
                    </div>
                    <div className="text-[12px] leading-relaxed" style={{ color: C.greyText }}>{t.recommended_action}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── 08 · AUTHORITY & LINK BUILDING (4 categories) ───────────────── */}
          <Section number={8} total={TOTAL} title="Authority &amp; Link Building">
            <BacklinkSub title="① Citation &amp; Directory Links" hint="Fastest baseline authority + local signals">
              <table className="w-full text-[12px]">
                <thead><tr style={{ borderBottom: `1px solid ${C.warmGrey}30` }}>
                  <Th>Platform</Th><Th right>DR</Th><Th>Status</Th><Th>Effort</Th><Th>Signal</Th>
                </tr></thead>
                <tbody>
                  {(bl.citation_links || []).map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                      <Td>{l.listing_url ? <a href={l.listing_url} target="_blank" rel="noreferrer" className="underline" style={{ color: C.orange }}>{l.platform}</a> : l.platform}</Td>
                      <Td right>{l.domain_rating}</Td>
                      <Td>{l.client_listed ? <span style={{ color: "#3f7d4a" }}>✓ Listed</span> : <span style={{ color: "#c0341a" }}>✗ Missing</span>}</Td>
                      <Td>{l.effort_hours}</Td>
                      <Td><span className="text-[11px]" style={{ color: C.greyText }}>{l.signal}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BacklinkSub>

            <BacklinkSub title="② Editorial &amp; Content-Earned Links" hint="Highest long-term authority value">
              {(bl.editorial_links || []).map((l, i) => (
                <div key={i} className="py-2" style={{ borderBottom: i < bl.editorial_links.length - 1 ? `1px solid ${C.warmGrey}20` : "none" }}>
                  <div className="text-[13px] font-semibold" style={{ color: C.nearBlack }}>{l.content_asset}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.greyText }}>
                    → {l.target_source} · {l.effort} · {l.link_type}. {l.why_unique}
                  </div>
                </div>
              ))}
            </BacklinkSub>

            {(bl.competitor_gap || []).length > 0 && (
              <BacklinkSub title="③ Competitor Link Gap" hint="Most strategically direct — source already links to rivals">
                <table className="w-full text-[12px]">
                  <thead><tr style={{ borderBottom: `1px solid ${C.warmGrey}30` }}>
                    <Th>Referring Domain</Th><Th>Links To</Th><Th>Type</Th>
                  </tr></thead>
                  <tbody>
                    {bl.competitor_gap.map((l, i) => (
                      <tr key={i} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                        <Td>{l.referring_domain}</Td><Td>{l.links_to}</Td><Td>{l.link_type}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </BacklinkSub>
            )}

            <BacklinkSub title="④ Local Authority Links" hint="Punch above their DR weight for local + GBP signals">
              {(bl.local_authority_links || []).map((l, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-[12px]" style={{ borderBottom: i < bl.local_authority_links.length - 1 ? `1px solid ${C.warmGrey}20` : "none" }}>
                  <span style={{ color: C.nearBlack }}>{l.source}</span>
                  <span style={{ color: C.greyText }} className="text-[11px]">{l.link_type} · {l.effort} · {l.local_signal}</span>
                </div>
              ))}
            </BacklinkSub>
          </Section>

          {/* ── 09 · GBP COMPARISON ─────────────────────────────────────────── */}
          {gbp.client && (
            <Section number={9} total={TOTAL} title="Local Visibility &amp; GBP Comparison">
              <div className="overflow-x-auto rounded-lg mb-4" style={{ border: `1px solid ${C.warmGrey}30` }}>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ background: C.nearBlack }}>
                      <th className="text-left px-2 py-2 font-bold uppercase text-[9px] text-white">Field</th>
                      <th className="text-center px-2 py-2 font-bold uppercase text-[9px]" style={{ color: C.orangeLite }}>You</th>
                      {(gbp.competitors || []).map((c, i) => (
                        <th key={i} className="text-center px-2 py-2 font-bold uppercase text-[9px] text-white truncate max-w-[100px]">{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Verified", "verified", v => v ? "✓" : "✗"],
                      ["Primary Category", "primary_category", v => v || "—"],
                      ["Reviews", "review_count", v => v ?? 0],
                      ["Rating", "rating", v => v ? `${v}★` : "—"],
                      ["Photos", "photos", v => v ?? 0],
                      ["Completeness", "completeness", v => v != null ? `${v}/100` : "—"],
                      ["Hours Set", "hours_complete", v => v ? "✓" : "✗"],
                      ["Website Link", "website_link", v => v ? "✓" : "✗"],
                      ["Booking Link", "booking_link", v => v ? "✓" : "✗"],
                    ].map(([label, key, fmt], i) => (
                      <tr key={key} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                        <td className="px-2 py-1.5 font-medium" style={{ color: C.greyText }}>{label}</td>
                        <td className="px-2 py-1.5 text-center font-semibold" style={{ color: C.orange }}>{fmt(gbp.client[key])}</td>
                        {(gbp.competitors || []).map((c, j) => (
                          <td key={j} className="px-2 py-1.5 text-center" style={{ color: C.nearBlack }}>{fmt(c[key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <GapBlock label="Biggest Visibility Gap" text={gbp.biggest_gap} />
              <GapBlock label="Fastest Win (48h)" text={gbp.fastest_win} accent />
              <GapBlock label="Trust Gap" text={gbp.trust_gap} />
            </Section>
          )}

          {/* ── 10 · GEO LAYER & AI VISIBILITY ──────────────────────────────── */}
          {geo.recommended_actions?.length > 0 && (
            <Section number={10} total={TOTAL} title="GEO Layer &amp; AI Visibility">
              <div className="flex items-center gap-2 mb-3"><TagChip tag="SEO+GEO" /><span className="text-[11px]" style={{ color: C.greyText }}>Same actions strengthen classic ranking and AI citation.</span></div>
              <DiagnosisCard>
                Current AI citation status: <strong>{geo.current_ai_citation_count}</strong>. The site is not yet a citable source for ChatGPT, Google AI Overviews, or Perplexity — the prescription below makes the content liftable by answer engines.
              </DiagnosisCard>
              <PrescriptionCard>
                <ul className="space-y-1.5">
                  {geo.recommended_actions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-[12px]"><span style={{ color: C.orange }}>▸</span><span>{a}</span></li>
                  ))}
                </ul>
              </PrescriptionCard>
              {(geo.geo_principles || []).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {geo.geo_principles.map((p, i) => (
                    <div key={i} className="rounded-lg p-2.5" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>
                      <div className="text-[12px] font-bold" style={{ color: C.teal }}>{p.title}</div>
                      <div className="text-[11px]" style={{ color: C.greyText }}>{p.detail}</div>
                    </div>
                  ))}
                </div>
              )}
              {(geo.schema_additions || []).map((s, i) => (
                <div key={i} className="mb-2">
                  <div className="text-[11px] font-bold mb-1 tracking-wide" style={{ color: C.orange }}>{s.type} — ready-to-implement JSON-LD</div>
                  <pre className="text-[10px] leading-snug overflow-x-auto rounded-lg p-3" style={{ background: C.nearBlack, color: "#d7e3d8" }}>{s.jsonld}</pre>
                </div>
              ))}
            </Section>
          )}

          {/* ── 11 · KPI FORECAST (validated) ───────────────────────────────── */}
          <Section number={11} total={TOTAL} title="KPI Forecast &amp; Measurement">
            <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.warmGrey}30` }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: C.nearBlack }}>
                    <Th white>Metric</Th><Th white right>Baseline</Th><Th white right>6-Month</Th><Th white right>12-Month</Th><Th white>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {kpis.map((k, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                      <Td>{k.metric}</Td>
                      <Td right>{k.baseline != null ? k.baseline : <span className="italic text-[10px]" style={{ color: C.greyText }}>unavailable</span>}</Td>
                      <Td right><strong style={{ color: C.orange }}>{fmtTarget(k.target_6_months)}</strong></Td>
                      <Td right>{fmtTarget(k.target_12_months)}</Td>
                      <Td><KpiStatus status={k.validation_status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {kpis.some(k => k.estimation_note) && (
              <div className="mt-3 space-y-1">
                {kpis.filter(k => k.estimation_note && k.validation_status === "projected_from_zero").map((k, i) => (
                  <div key={i} className="text-[11px]" style={{ color: C.greyText }}><strong>{k.metric}:</strong> {k.estimation_note}</div>
                ))}
              </div>
            )}
          </Section>

          {/* ── STRATEGIC NARRATIVE (Stage-4 sections, diagnostic style) ─────── */}
          {narrativeSections.length > 0 && (
            <div className="mt-12 pt-8" style={{ borderTop: `2px solid ${C.orange}` }}>
              <div className="text-[11px] tracking-[0.3em] uppercase font-bold mb-6" style={{ color: C.orange }}>
                Strategic Prescription — Full Diagnosis
              </div>
              {narrativeSections.map((sec, i) => (
                <Section key={i} number={sec.number} total={TOTAL} title={cleanTitle(sec.title)}>
                  <div>{renderNarrative(sec.body)}</div>
                </Section>
              ))}
            </div>
          )}

          {/* ── FOOTER ──────────────────────────────────────────────────────── */}
          <div className="mt-12 pt-4 flex items-center justify-between text-[10px]" style={{ borderTop: `1px solid ${C.warmGrey}30`, color: C.greyText }}>
            <span className="font-black">Doctor<span style={{ color: C.orange }}>Fizz</span></span>
            <span>{meta.report_ref} · {meta.report_date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── small helpers / sub-components ────────────────────────────────────────────
function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest uppercase mb-1" style={{ color: C.warmGrey }}>{label}</div>
      <div className="text-[12px] font-semibold text-white truncate">{value || "—"}</div>
    </div>
  );
}

function Th({ children, right, white }) {
  return <th className={`px-3 py-2 text-[10px] font-bold tracking-wider uppercase ${right ? "text-right" : "text-left"}`} style={{ color: white ? "#fff" : C.greyText }}>{children}</th>;
}
function Td({ children, right }) {
  return <td className={`px-3 py-2 ${right ? "text-right" : "text-left"}`} style={{ color: C.nearBlack }}>{children}</td>;
}

function KeywordTable({ rows }) {
  if (!rows.length) return <p className="text-[12px]" style={{ color: C.greyText }}>No keywords passed classification.</p>;
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.warmGrey}30` }}>
      <table className="w-full text-[12px]">
        <thead><tr style={{ background: C.nearBlack }}>
          <Th white>Keyword</Th><Th white right>Volume</Th><Th white>Difficulty</Th><Th white>Intent</Th><Th white>Asset Type</Th><Th white>Funnel</Th><Th white>Priority</Th>
        </tr></thead>
        <tbody>
          {rows.slice(0, 20).map((k, i) => (
            <tr key={i} style={{ background: i % 2 ? "#fff" : C.ivory }}>
              <Td>{k.keyword}</Td>
              <Td right>{k.global_volume != null ? k.global_volume.toLocaleString() : "—"}</Td>
              <Td><DiffChip value={k.keyword_difficulty} /></Td>
              <Td><span className="text-[11px] capitalize">{k.intent_class?.replace("-", " ")}</span></Td>
              <Td><span className="text-[11px]">{k.recommended_asset_type}</span></Td>
              <Td><span className="text-[11px]">{k.funnel_role}</span></Td>
              <Td><PriorityLabel priority={k.priority} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentSub({ title, rows, type }) {
  return (
    <div className="mb-5">
      <h4 className="text-[13px] font-bold mb-2 tracking-wide" style={{ color: C.orange }} dangerouslySetInnerHTML={{ __html: title }} />
      {!rows.length ? (
        <p className="text-[12px]" style={{ color: C.greyText }}>None mapped for this category.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((p, i) => (
            <div key={i} className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-[13px] font-semibold" style={{ color: C.nearBlack }}>
                  {p.page_name || p.proposed_title}
                </span>
                <div className="flex items-center gap-1.5">
                  {p.priority && <PriorityLabel priority={p.priority} />}
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: C.ivory, color: C.greyText }}>{p.funnel_role}</span>
                </div>
              </div>
              <div className="text-[11px] mt-1" style={{ color: C.greyText }}>
                {p.url_slug && <span className="font-mono">{p.url_slug}</span>}
                {p.city_target && <span> · City: {p.city_target}</span>}
                {" · "}cluster: <span style={{ color: C.nearBlack }}>"{p.keyword_cluster}"</span>
                {p.primary_volume != null && <span> ({p.primary_volume.toLocaleString()}/mo)</span>}
              </div>
              {(p.commercial_reason || p.funnel_connection || p.why_separate_page) && (
                <div className="text-[11px] mt-1 italic" style={{ color: C.greyText }}>
                  {p.commercial_reason || p.funnel_connection || p.why_separate_page}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BacklinkSub({ title, hint, children }) {
  return (
    <div className="mb-5">
      <h4 className="text-[13px] font-bold tracking-wide" style={{ color: C.orange }} dangerouslySetInnerHTML={{ __html: title }} />
      {hint && <div className="text-[11px] mb-2" style={{ color: C.greyText }}>{hint}</div>}
      <div className="rounded-lg p-2 overflow-x-auto" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>{children}</div>
    </div>
  );
}

function GapBlock({ label, text, accent }) {
  return (
    <div className="rounded-r-lg p-3 mb-2" style={{ background: accent ? "#fdeede" : "#fff", borderLeft: `3px solid ${accent ? C.orange : C.warmGrey}` }}>
      <div className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: accent ? C.orange : C.greyText }}>{label}</div>
      <div className="text-[12px] leading-relaxed" style={{ color: C.nearBlack }}>{text}</div>
    </div>
  );
}

function KpiStatus({ status }) {
  const map = {
    valid:                { t: "Validated", c: "#3f7d4a", bg: "#e9f3ea" },
    auto_corrected:       { t: "Corrected", c: "#b8860b", bg: "#fdf6e3" },
    projected_from_zero:  { t: "Projected", c: C.teal,    bg: "#e6eff2" },
    baseline_unavailable: { t: "Capture baseline", c: C.greyText, bg: "#f0ede8" },
  };
  const s = map[status] || map.valid;
  return <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: s.bg, color: s.c }}>{s.t}</span>;
}

function fmtTarget(v) {
  if (v == null) return "—";
  if (typeof v === "number") return v.toLocaleString();
  return v;
}

function cleanTitle(t) {
  return String(t || "").replace(/^\d+\s*[·.]\s*/, "").trim();
}
