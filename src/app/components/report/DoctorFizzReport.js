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
const SERIF = "var(--font-playfair), 'Cormorant Garamond', Georgia, serif";
const SANS  = "var(--font-inter), 'DM Sans', system-ui, sans-serif";

// ── Color palette — EXACT V2 spec values (Part 2) ─────────────────────────────
const C = {
  nearBlack:  "#141414",  // cover background
  ivory:      "#F9F7F4",  // body background (warm ivory)
  orange:     "#D4541A",  // burnt orange — signature accent (emphasis only)
  orangeLite: "#D4541A",
  diagTint:   "#FDF1EB",  // diagnosis card background (orange tint)
  rxGreen:    "#2D6B32",  // prescription label
  border:     "#E8E4DF",  // borders, dividers
  tableHead:  "#F2EEE9",  // table header bg
  rowEven:    "#F9F7F4",  // even table row
  textDark:   "#1A1A1A",  // primary text
  greyText:   "#6B6B6B",  // secondary text
  greyMid:    "#A8A8A8",  // dot separator, tertiary
  sage:       "#2D6B32",  // SEO chip text
  teal:       "#1A5C76",  // GEO chip text
  warmGrey:   "#5A5550",  // SEO+GEO chip text
};

// ── Tag chip (SEO / GEO / SEO+GEO) — exact V2 colors ──────────────────────────
function TagChip({ tag }) {
  const t = String(tag || "").toUpperCase().replace(/\s+/g, "");
  const map = {
    "SEO":     { bg: "#D6EAD7", fg: "#2D6B32", bd: "#B8D9BA", label: "SEO" },
    "GEO":     { bg: "#D4E8F0", fg: "#1A5C76", bd: "#B0D4E4", label: "GEO" },
    "SEO+GEO": { bg: "#E8E4DF", fg: "#5A5550", bd: "#D0CBC5", label: "SEO + GEO" },
  };
  const s = map[t] || map["SEO+GEO"];
  return (
    <span className="inline-flex items-center uppercase" style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1.5px", padding: "2px 8px", borderRadius: "3px" }}>
      {s.label}
    </span>
  );
}

// ── Priority chip — exact V2 colors ───────────────────────────────────────────
function PriorityLabel({ priority }) {
  const p = String(priority || "").toUpperCase();
  const map = {
    "CRITICAL":  { bg: "#F8DDD4", fg: "#B83A1A" },
    "HIGH":      { bg: "#FBE7D6", fg: "#D4541A" },
    "MEDIUM":    { bg: "#FBF1D9", fg: "#9A6A12" },
    "QUICK WIN": { bg: "#D6EAD7", fg: "#2D6B32" },
    "LOW":       { bg: "#E8E4DF", fg: "#6B6B6B" },
  };
  const s = map[p] || map["MEDIUM"];
  return (
    <span className="inline-flex items-center uppercase" style={{ background: s.bg, color: s.fg, fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", padding: "2px 8px", borderRadius: "3px" }}>
      {p}
    </span>
  );
}

// ── Keyword difficulty chip — exact V2 (red high / amber med / green low) ──────
function DiffChip({ value }) {
  if (value == null) return <span style={{ color: C.greyMid }}>—</span>;
  const v = Number(value);
  const s = v >= 60 ? { bg: "#F8DDD4", fg: "#B83A1A", t: "Hard" }
          : v >= 35 ? { bg: "#FBF1D9", fg: "#9A6A12", t: "Med" }
          :           { bg: "#D6EAD7", fg: "#2D6B32", t: "Easy" };
  return (
    <span className="inline-flex items-center gap-1" style={{ background: s.bg, color: s.fg, fontFamily: SANS, fontWeight: 600, fontSize: "10px", padding: "2px 6px", borderRadius: "3px" }}>
      {v}<span style={{ opacity: 0.7 }}>{s.t}</span>
    </span>
  );
}

// ── Callout stat block (exec summary big numbers) — V2 Part 2 ─────────────────
function CalloutStat({ number, suffix, label, description }) {
  return (
    <div className="rounded-lg p-5" style={{ background: "#FFFFFF", border: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "40px", color: C.textDark, lineHeight: 1 }}>
        {number}{suffix && <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: "18px", color: C.greyText }}> {suffix}</span>}
      </div>
      <div className="mt-2 uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.orange }}>{label}</div>
      {description && <div className="mt-1" style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText, lineHeight: 1.4 }}>{description}</div>}
    </div>
  );
}

// ── Action Item Row — V2 Part 2 (step badge + chips + effort) ─────────────────
function ActionRow({ step, title, description, channel, priority, effort }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
      <div className="shrink-0 grid place-items-center rounded-full" style={{ width: 26, height: 26, background: C.textDark, color: "#fff", fontFamily: SANS, fontWeight: 700, fontSize: "13px" }}>{step}</div>
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: "14px", color: C.textDark }}>{title}</div>
        {description && <div style={{ fontFamily: SANS, fontSize: "13px", color: C.greyText }}>{description}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
        {channel && <TagChip tag={channel} />}
        {priority && <PriorityLabel priority={priority} />}
        {effort && <span style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText, whiteSpace: "nowrap" }}>{effort}</span>}
      </div>
    </div>
  );
}

// ── Section shell with numbering (01 · NAME) ──────────────────────────────────
// ── Section header block — V2: "01 · SECTION NAME" + Playfair title + opening line
function Section({ number, total, title, opening, children }) {
  const nn = String(number).padStart(2, "0");
  return (
    <section className="mb-12 scroll-mt-6" style={{ marginTop: "8px" }}>
      {/* 01 · SECTION NAME */}
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", color: C.orange }}>{nn}</span>
        <span style={{ fontFamily: SANS, fontWeight: 400, fontSize: "11px", color: C.greyMid }}>·</span>
        <span className="uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", letterSpacing: "2px", color: C.textDark }}
          dangerouslySetInnerHTML={{ __html: title }} />
        <span className="ml-auto" style={{ fontFamily: SANS, fontSize: "10px", letterSpacing: "1px", color: C.greyMid }}>{nn} / {String(total).padStart(2, "0")}</span>
      </div>
      {/* Section title in Playfair */}
      <h2 style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "30px", lineHeight: 1.15, color: C.textDark, marginBottom: opening ? "6px" : "20px" }}
        dangerouslySetInnerHTML={{ __html: title }} />
      {/* Opening diagnosis line in Playfair italic */}
      {opening && <p style={{ fontFamily: SERIF, fontWeight: 500, fontStyle: "italic", fontSize: "19px", lineHeight: 1.3, color: C.textDark, marginBottom: "28px" }}>{opening}</p>}
      {children}
    </section>
  );
}

// ── Diagnosis card — V2: #FDF1EB tint, 3px orange left border ──────────────────
function DiagnosisCard({ children }) {
  return (
    <div style={{ background: C.diagTint, borderLeft: `3px solid ${C.orange}`, borderRadius: "4px", padding: "16px 20px", marginBottom: "16px" }}>
      <div className="uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.orange, marginBottom: "6px" }}>Diagnosis</div>
      <div style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHARTS — lightweight inline SVG (vector, no dependency, PDF-crisp via Puppeteer)
// ═══════════════════════════════════════════════════════════════════════════════

// Horizontal bar chart — best for comparisons (scores, metrics, reviews).
function HBarChart({ data, unit = "", height = 16, gap = 8, labelWidth = 130 }) {
  const rows = (data || []).filter(d => d && d.value != null);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(d => Number(d.value) || 0), 1);
  return (
    <div style={{ width: "100%" }}>
      {rows.map((d, i) => {
        const pct = Math.max(2, Math.round(((Number(d.value) || 0) / max) * 100));
        const color = d.color || C.orange;
        return (
          <div key={i} className="flex items-center" style={{ gap: "8px", marginBottom: `${gap}px` }}>
            <span className="truncate" style={{ width: `${labelWidth}px`, fontFamily: SANS, fontSize: "11px", color: C.greyText, textAlign: "right", flexShrink: 0 }}>{d.label}</span>
            <div style={{ flex: 1, background: C.tableHead, borderRadius: "3px", height: `${height}px`, position: "relative", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "3px" }} />
            </div>
            <span style={{ width: "62px", fontFamily: SANS, fontSize: "11px", fontWeight: 600, color: C.textDark, flexShrink: 0 }}>{d.display ?? `${d.value}${unit}`}</span>
          </div>
        );
      })}
    </div>
  );
}

// Grouped two-bar comparison (You vs Best competitor) per row, normalised.
function CompareBars({ rows, labelWidth = 120 }) {
  const data = (rows || []).filter(r => r && (r.you != null || r.them != null));
  if (!data.length) return null;
  return (
    <div style={{ width: "100%" }}>
      {data.map((r, i) => {
        const max = Math.max(Number(r.you) || 0, Number(r.them) || 0, 1);
        const youPct = Math.max(2, Math.round(((Number(r.you) || 0) / max) * 100));
        const themPct = Math.max(2, Math.round(((Number(r.them) || 0) / max) * 100));
        const youWins = (Number(r.you) || 0) >= (Number(r.them) || 0);
        return (
          <div key={i} style={{ marginBottom: "10px" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: "2px" }}>
              <span style={{ fontFamily: SANS, fontSize: "11px", fontWeight: 600, color: C.textDark }}>{r.label}</span>
              <span style={{ fontFamily: SANS, fontSize: "10px", color: C.greyMid }}>you {r.youDisplay ?? r.you} · best {r.themDisplay ?? r.them}</span>
            </div>
            <div className="flex items-center" style={{ gap: "6px" }}>
              <span style={{ width: "34px", fontFamily: SANS, fontSize: "9px", color: C.orange, textAlign: "right" }}>YOU</span>
              <div style={{ flex: 1, background: C.tableHead, borderRadius: "2px", height: "12px", overflow: "hidden" }}><div style={{ width: `${youPct}%`, height: "100%", background: youWins ? "#2D6B32" : C.orange }} /></div>
            </div>
            <div className="flex items-center" style={{ gap: "6px", marginTop: "2px" }}>
              <span style={{ width: "34px", fontFamily: SANS, fontSize: "9px", color: C.greyMid, textAlign: "right" }}>THEM</span>
              <div style={{ flex: 1, background: C.tableHead, borderRadius: "2px", height: "12px", overflow: "hidden" }}><div style={{ width: `${themPct}%`, height: "100%", background: C.greyMid }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Donut chart — best for composition (keyword intent split).
function Donut({ segments, size = 120, thickness = 22, centerLabel, centerSub }) {
  const segs = (segments || []).filter(s => s && Number(s.value) > 0);
  const total = segs.reduce((a, s) => a + Number(s.value), 0);
  if (!total) return null;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.tableHead} strokeWidth={thickness} />
        {segs.map((s, i) => {
          const frac = Number(s.value) / total;
          const dash = frac * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
        {centerLabel != null && (
          <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "20px", fill: C.textDark }}>{centerLabel}</text>
        )}
        {centerSub && (
          <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontFamily: SANS, fontSize: "8px", fill: C.greyText, letterSpacing: "1px" }}>{centerSub}</text>
        )}
      </svg>
      <div className="space-y-1">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5" style={{ fontFamily: SANS, fontSize: "11px", color: C.textDark }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: "inline-block" }} />
            <span style={{ fontWeight: 600 }}>{s.value}</span>
            <span style={{ color: C.greyText }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Rating distribution bars (5★ → 1★).
function RatingBars({ dist }) {
  if (!dist) return null;
  const total = Object.values(dist).reduce((a, b) => a + (Number(b) || 0), 0);
  if (!total) return null;
  const colorFor = (star) => star >= 4 ? "#2D6B32" : star === 3 ? "#9A6A12" : "#B83A1A";
  return (
    <div style={{ width: "100%" }}>
      {[5, 4, 3, 2, 1].map((star) => {
        const n = Number(dist[star]) || 0;
        const pct = Math.round((n / total) * 100);
        return (
          <div key={star} className="flex items-center" style={{ gap: "6px", marginBottom: "3px" }}>
            <span style={{ width: "26px", fontFamily: SANS, fontSize: "10px", color: C.greyText, textAlign: "right" }}>{star}★</span>
            <div style={{ flex: 1, background: C.tableHead, borderRadius: "2px", height: "11px", overflow: "hidden" }}><div style={{ width: `${Math.max(pct ? 2 : 0, pct)}%`, height: "100%", background: colorFor(star) }} /></div>
            <span style={{ width: "34px", fontFamily: SANS, fontSize: "10px", color: C.greyText }}>{n}</span>
          </div>
        );
      })}
    </div>
  );
}

// KPI trajectory — baseline → 6mo → 12mo as a 3-step ascending bar set.
function TrajectoryBars({ baseline, m6, m12, unit = "" }) {
  const vals = [Number(baseline) || 0, Number(m6) || 0, Number(m12) || 0];
  const max = Math.max(...vals, 1);
  const labels = ["Now", "6 mo", "12 mo"];
  const colors = [C.greyMid, C.orange, "#2D6B32"];
  return (
    <div className="flex items-end gap-2" style={{ height: "56px" }}>
      {vals.map((v, i) => (
        <div key={i} className="flex flex-col items-center" style={{ flex: 1 }}>
          <span style={{ fontFamily: SANS, fontSize: "9px", fontWeight: 600, color: C.textDark }}>{v.toLocaleString()}{unit}</span>
          <div style={{ width: "100%", height: `${Math.max(4, Math.round((v / max) * 40))}px`, background: colors[i], borderRadius: "2px 2px 0 0", marginTop: "2px" }} />
          <span style={{ fontFamily: SANS, fontSize: "8px", color: C.greyMid, marginTop: "2px" }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ── Mini stat (compact number block for review intelligence) ─────────────────
function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-lg p-2.5 text-center" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "22px", color: C.textDark, lineHeight: 1 }}>{value}</div>
      <div className="uppercase mt-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "8px", letterSpacing: "1px", color: C.orange }}>{label}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: "9px", color: C.greyText }}>{sub}</div>}
    </div>
  );
}

// ── Source / confidence badge (data-honesty layer) ───────────────────────────
function SourceBadge({ source, label }) {
  const map = {
    verified: { bg: "#D6EAD7", fg: "#2D6B32", icon: "✓" },
    measured: { bg: "#D4E8F0", fg: "#1A5C76", icon: "◉" },
    estimate: { bg: "#F2EEE9", fg: "#6B6B6B", icon: "≈" },
  };
  const s = map[source] || map.estimate;
  return (
    <span className="inline-flex items-center gap-1 uppercase" title={label} style={{ background: s.bg, color: s.fg, fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "0.5px", padding: "1px 6px", borderRadius: "3px" }}>
      {s.icon} {label}
    </span>
  );
}

// ── "What Ranking Pages Do" context block — V2 Part 2 component ───────────────
function WhatRankingPagesDo({ children }) {
  return (
    <div style={{ background: C.ivory, borderLeft: `2px solid ${C.greyMid}`, padding: "12px 16px", margin: "16px 0" }}>
      <div className="uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.greyText, marginBottom: "4px" }}>What Ranking Pages Do</div>
      <div style={{ fontFamily: SANS, fontSize: "13px", color: C.textDark, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ── Narrative bridge to next section (V2 Rule 15 narrative_connection) ────────
function BridgeNote({ text }) {
  if (!text) return null;
  return (
    <p className="mt-4" style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", color: C.greyText, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
      {text}
    </p>
  );
}

// ── Prescription card — V2: white, green label ────────────────────────────────
function PrescriptionCard({ children }) {
  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${C.border}`, borderRadius: "4px", padding: "16px 20px", marginBottom: "16px" }}>
      <div className="uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.rxGreen, marginBottom: "6px" }}>Prescription</div>
      <div style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{children}</div>
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

  // Map the strategic-plan narrative sections by their parsed number so each
  // section renders its narrative ONCE, alongside its structured data — instead
  // of a second "full diagnosis" block that duplicated every section.
  const narrativeByNum = useMemo(() => {
    const s = plan?.sections;
    const map = {};
    if (s && typeof s === "object") {
      for (const v of Object.values(s)) {
        if (v && v.number && v.body) map[String(v.number).padStart(2, "0")] = v;
      }
    }
    return map;
  }, [plan]);

  // Inline narrative for a given section number (returns null if none).
  const Narrative = ({ num }) => {
    const sec = narrativeByNum[String(num).padStart(2, "0")];
    if (!sec?.body) return null;
    return <div className="mt-3">{renderNarrative(sec.body)}</div>;
  };

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
  const scores = payload.scores || null;
  const pap = payload.priority_action_plan || [];
  const compAnalysis = payload.competitive_analysis || null;
  const v2 = payload.v2_additions || {};
  const oppSummary = v2.opportunity_summary || {};
  const formattedBaseline = v2.formatted_baseline || [];
  const frames = v2.non_expert_section_frames || {};
  const narrativeBridge = (section) => (v2.narrative_connections || []).find(n => n.section === section)?.narrative_connection || null;
  const fmtNum = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));

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
    <div style={{ background: C.ivory, fontFamily: SANS, color: C.textDark }} className="w-full">
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
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4 text-white" style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}>
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

          {/* ── SEO SCORE PANEL (Phase 3 — Deep AI Analysis) ────────────────── */}
          {scores && scores.seo_health != null && (
            <div className="mb-10">
              <div className="rounded-xl p-5 mb-4" style={{ background: C.nearBlack }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] tracking-[0.25em] uppercase font-bold" style={{ color: C.orangeLite }}>SEO Health Score</span>
                  <span className="text-[10px] tracking-widest" style={{ color: C.warmGrey }}>Phase 3 · Deep Analysis</span>
                </div>
                <div className="flex items-end gap-4 mb-2">
                  <span className="text-5xl font-black leading-none" style={{ color: scoreColor(scores.seo_health) }}>{scores.seo_health}</span>
                  <span className="text-lg font-bold mb-1" style={{ color: C.warmGrey }}>/100</span>
                  {scores.grade && (
                    <span className="ml-auto text-3xl font-black" style={{ color: scoreColor(scores.seo_health) }}>{scores.grade}</span>
                  )}
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#ffffff20" }}>
                  <div className="h-2 rounded-full" style={{ width: `${scores.seo_health}%`, background: scoreColor(scores.seo_health) }} />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                {[
                  ["Technical", scores.technical],
                  ["Content", scores.content],
                  ["Authority", scores.authority],
                  ["Local", scores.local],
                  ["Competitive", scores.competitive],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-lg p-3 text-center" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>
                    <div className="text-2xl font-black leading-none mb-1" style={{ color: val != null ? scoreColor(val) : C.warmGrey }}>
                      {val != null ? val : "—"}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: C.greyText }}>{label}</div>
                  </div>
                ))}
              </div>
              {/* Score breakdown chart */}
              <div className="rounded-lg p-4" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                <div className="uppercase mb-3" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.greyText }}>Score Breakdown (out of 100)</div>
                <HBarChart labelWidth={90} data={[
                  { label: "Technical",   value: scores.technical,   color: scoreColor(scores.technical) },
                  { label: "Content",     value: scores.content,     color: scoreColor(scores.content) },
                  { label: "Authority",   value: scores.authority,   color: scoreColor(scores.authority) },
                  { label: "Local",       value: scores.local,       color: scoreColor(scores.local) },
                  { label: "Competitive", value: scores.competitive, color: scoreColor(scores.competitive) },
                ].filter(d => d.value != null)} />
              </div>
            </div>
          )}

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

          {/* ── 01 · EXECUTIVE SUMMARY (V2: diagnosis + callout stats + actions) ─ */}
          <Section number={1} total={TOTAL} title="Executive Summary"
            opening={scores?.seo_health != null ? `An SEO health score of ${scores.seo_health}/100 places ${meta.client_name} ${scores.seo_health < 50 ? "in the penalty tier" : scores.seo_health < 80 ? "below the competitive band" : "in a strong position"} — here is what that costs, and the fastest path out.` : null}>
            {/* BLOCK 1 — diagnosis */}
            <DiagnosisCard>
              {narrativeByNum["01"] ? <Narrative num={1} /> : (
                <>
                  {meta.client_name} carries an SEO health score of {scores?.seo_health ?? "—"}/100{scores?.grade ? ` (grade ${scores.grade})` : ""}.
                  {gbp.biggest_gap ? ` ${gbp.biggest_gap.split(".")[0]}.` : ""}
                  {" "}{kw.accepted?.length ? `${kw.accepted.length} qualified keyword opportunities worth ~${fmtNum(oppSummary.total_monthly_search_volume)} monthly searches are mapped for capture, ` : ""}
                  and the prescription below sequences the highest-impact, lowest-effort work first.
                </>
              )}
            </DiagnosisCard>

            {/* BLOCK 2 — callout stat blocks (V2 Rule R4: 3-5 blocks) */}
            {(oppSummary.total_monthly_search_volume != null) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <CalloutStat number={fmtNum(oppSummary.total_monthly_search_volume)} label="Monthly Searches You Could Be Winning" description="Total addressable search demand" />
                <CalloutStat number={fmtNum(oppSummary.commercial_keyword_count)} label="Commercial Pages To Build" description="Buyer-intent keyword clusters" />
                <CalloutStat number={fmtNum(oppSummary.quick_wins_available)} label="Quick Wins — Under 1 Week Each" description="High-impact, low-effort actions" />
                <CalloutStat number={fmtNum(oppSummary.estimated_traffic_uplift_12m)} suffix="/mo" label="Projected Monthly Visitors In 12 Months" description="If the prescription is executed" />
              </div>
            )}

            {/* BLOCK 3 — what this prescription fixes (Action Item Rows) */}
            {pap.length > 0 && (
              <div>
                <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.orange }}>What This Prescription Fixes</div>
                {pap.flatMap(t => t.actions).slice(0, 6).map((a, i) => (
                  <ActionRow key={i} step={i + 1} title={a.description} channel={a.channel} priority={a.priority} effort={a.effort} />
                ))}
              </div>
            )}
            {narrativeBridge("executive_summary") && <BridgeNote text={narrativeBridge("executive_summary")} />}
          </Section>

          {/* ── 02 placeholder removed; structured plan renders below ───────── */}

          {/* ── 02 · PRIORITY ACTION PLAN (V2: Action Item Rows, 3 tiers) ────── */}
          {(pap.length > 0 || narrativeByNum["02"]) && (
            <Section number={2} total={TOTAL} title="Priority Action Plan"
              opening="Ranked by impact-to-effort — the highest-return, lowest-cost work comes first, regardless of which section it belongs to.">
              <DiagnosisCard>
                {pap.reduce((n, t) => n + t.actions.length, 0)} prescribed actions, sequenced so that foundation fixes clear the ceiling before content and authority work begins — every action below is tagged by channel, priority, and effort so the team can execute in order.
              </DiagnosisCard>
              {(() => { let step = 0; return pap.map((tier) => (
                <div key={tier.tier} className="mb-5">
                  <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", letterSpacing: "1.5px", color: C.orange }}>{tier.tier}</div>
                  {tier.actions.map((a) => { step += 1; return (
                    <ActionRow key={step} step={step} title={a.description} channel={a.channel} priority={a.priority} effort={a.effort} />
                  ); })}
                </div>
              )); })()}
              <Narrative num={2} />
              {narrativeBridge("executive_summary") && null}
            </Section>
          )}

          {/* ── 03 · BASELINE SNAPSHOT (V2: formatted values + commercial reading) */}
          <Section number={3} total={TOTAL} title="Baseline Snapshot"
            opening={frames.technical_issues_intro ? null : undefined}>
            {(() => {
              const mostImpactful = formattedBaseline.find(b => b.commercial_interpretation) || formattedBaseline[0];
              return mostImpactful?.commercial_interpretation ? <DiagnosisCard>{mostImpactful.commercial_interpretation}</DiagnosisCard> : null;
            })()}
            <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.border}` }}>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.tableHead }}>
                    <Th>Metric</Th><Th right>Value</Th><Th>Source</Th><Th>What It Means</Th>
                  </tr>
                </thead>
                <tbody>
                  {formattedBaseline.map((b, i) => (
                    <tr key={b.metric} style={{ background: i % 2 ? "#fff" : C.rowEven, borderBottom: `1px solid ${C.border}` }}>
                      <Td>{b.label}</Td>
                      <Td right>{b.formatted_value != null
                        ? <span style={{ fontWeight: 600, color: C.textDark }}>{b.formatted_value}</span>
                        : <span style={{ fontStyle: "italic", fontSize: "11px", color: C.greyText }}>{b.unavailable_label}</span>}</Td>
                      <Td>{b.source ? <SourceBadge source={b.source} label={b.source_label} /> : "—"}</Td>
                      <Td><span style={{ fontSize: "12px", color: C.greyText }}>{b.benchmark_label || (b.commercial_interpretation ? b.commercial_interpretation.slice(0, 80) + "…" : "—")}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Data-confidence legend (builds trust — premium tools disclose sources) */}
            <div className="flex flex-wrap items-center gap-3 mt-2" style={{ fontFamily: SANS, fontSize: "11px", color: C.greyText }}>
              <span className="inline-flex items-center gap-1"><SourceBadge source="verified" label="Verified" /> client's Google data (ground truth)</span>
              <span className="inline-flex items-center gap-1"><SourceBadge source="measured" label="Measured" /> observed live on the site</span>
              <span className="inline-flex items-center gap-1"><SourceBadge source="estimate" label="Estimate" /> third-party model (±15%)</span>
            </div>
            {/* "The Technical Ceiling" paragraph */}
            {(() => {
              const worst = formattedBaseline.filter(b => /below|penalty|suppress|throttl/i.test(b.benchmark_label || "")).slice(0, 3);
              if (!worst.length) return null;
              return (
                <p className="mt-3" style={{ fontFamily: SANS, fontSize: "13px", color: C.textDark, lineHeight: 1.7 }}>
                  <strong style={{ color: C.orange }}>The Technical Ceiling.</strong> {worst.map(w => w.label).join(", ")} are not isolated faults — together they cap the return on every other improvement. Until they are cleared, new content and links push against a hard limit.
                </p>
              );
            })()}
            <Narrative num={3} />
            {narrativeBridge("baseline_snapshot") && <BridgeNote text={narrativeBridge("baseline_snapshot")} />}
          </Section>

          {/* ── 04 · COMPETITOR LANDSCAPE (full head-to-head intelligence) ──── */}
          {(narrativeByNum["04"] || (payload.competitors || []).length > 0 || compAnalysis) && (
            <Section number={4} total={TOTAL} title="Competitor Landscape"
              opening={compAnalysis?.overall_verdict || undefined}>

              {/* ── Head-to-head scorecard: you vs best competitor on every dimension ── */}
              {compAnalysis?.dimensions?.length > 0 && (
                <>
                  <DiagnosisCard>{compAnalysis.overall_verdict}</DiagnosisCard>
                  <div className="overflow-x-auto rounded-lg mb-4" style={{ border: `1px solid ${C.border}` }}>
                    <table className="w-full" style={{ borderCollapse: "collapse" }}>
                      <thead><tr style={{ background: C.tableHead }}>
                        <Th>Dimension</Th><Th right>You</Th><Th right>Best Competitor</Th><Th>Verdict</Th>
                      </tr></thead>
                      <tbody>
                        {compAnalysis.dimensions.map((d, i) => (
                          <tr key={i} style={{ background: i % 2 ? "#fff" : C.rowEven, borderBottom: `1px solid ${C.border}` }}>
                            <Td>{d.dimension}</Td>
                            <Td right><span style={{ fontWeight: 600, color: d.winner === "you" ? "#2D6B32" : C.textDark }}>{d.client_display}</span></Td>
                            <Td right>{d.competitor_best_display}{d.competitor_best_name ? <span style={{ fontSize: "10px", color: C.greyMid }}> · {d.competitor_best_name}</span> : ""}</Td>
                            <Td>{d.winner === "you"
                              ? <span style={{ color: "#2D6B32", fontWeight: 600, fontSize: "11px" }}>✓ You lead</span>
                              : d.winner === "them"
                                ? <span style={{ color: "#B83A1A", fontWeight: 600, fontSize: "11px" }}>▼ Gap</span>
                                : <span style={{ color: C.greyMid, fontSize: "11px" }}>Tie</span>}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Your edges vs their edges ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                      <div className="uppercase mb-1.5" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "1.5px", color: "#2D6B32" }}>Where You Win</div>
                      {compAnalysis.your_edges.length ? (
                        <ul className="space-y-1">{compAnalysis.your_edges.map((e, j) => (
                          <li key={j} className="flex gap-1.5" style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText, lineHeight: 1.5 }}><span style={{ color: "#2D6B32" }}>✓</span><span>{e.advantage}</span></li>
                        ))}</ul>
                      ) : <p style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText }}>No clear lead yet on the measured dimensions — the roadmap fixes that.</p>}
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                      <div className="uppercase mb-1.5" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "1.5px", color: "#B83A1A" }}>Where They Win (Your Gaps)</div>
                      {compAnalysis.their_edges.length ? (
                        <ul className="space-y-1">{compAnalysis.their_edges.map((e, j) => (
                          <li key={j} className="flex gap-1.5" style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText, lineHeight: 1.5 }}><span style={{ color: "#B83A1A" }}>▼</span><span>{e.gap}</span></li>
                        ))}</ul>
                      ) : <p style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText }}>No competitor leads on any measured dimension.</p>}
                    </div>
                  </div>

                  {/* You-vs-best comparison chart (normalised per dimension) */}
                  <div className="rounded-lg p-4 mb-4" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                    <div className="uppercase mb-3" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.greyText }}>You vs Best Competitor</div>
                    <CompareBars rows={compAnalysis.dimensions.filter(d => d.client_value != null && d.competitor_best != null && typeof d.client_value === "number").map(d => ({
                      label: d.dimension, you: d.client_value, them: d.competitor_best, youDisplay: d.client_display, themDisplay: d.competitor_best_display,
                    }))} />
                  </div>

                  {/* ── How to improve — prioritised roadmap (Action Item Rows) ── */}
                  {compAnalysis.improvement_roadmap.length > 0 && (
                    <div className="mb-3">
                      <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", letterSpacing: "1.5px", color: C.orange }}>How To Close The Gaps — Priority Order</div>
                      {compAnalysis.improvement_roadmap.map((r, i) => (
                        <ActionRow key={i} step={i + 1} title={`${r.area}: ${r.action}`} channel={/schema|geo/i.test(r.area) ? "SEO+GEO" : "SEO"} priority={r.priority} effort={r.effort} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Basic competitor table (fallback / supplementary) */}
              {!compAnalysis && (payload.competitors || []).length > 0 && (
                <div className="overflow-x-auto rounded-lg mb-3" style={{ border: `1px solid ${C.border}` }}>
                  <table className="w-full text-[12px]">
                    <thead><tr style={{ background: C.nearBlack }}>
                      <Th white>Competitor</Th><Th white>Threat</Th><Th white right>GMB Rating</Th><Th white right>Reviews</Th>
                    </tr></thead>
                    <tbody>
                      {payload.competitors.map((c, i) => (
                        <tr key={i} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                          <Td>{c.name || c.domain}</Td>
                          <Td><PriorityLabel priority={c.threat_level === "HIGH" ? "HIGH" : c.threat_level === "LOW" ? "LOW" : "MEDIUM"} /></Td>
                          <Td right>{c.gbp_data?.rating ? `${c.gbp_data.rating}★` : "—"}</Td>
                          <Td right>{c.gbp_data?.reviewCount ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Narrative num={4} />
              {narrativeBridge("competitor_landscape") && <BridgeNote text={narrativeBridge("competitor_landscape")} />}
            </Section>
          )}

          {/* ── 05 · KEYWORD STRATEGY (V2: non-expert frame + grouped tables) ─ */}
          <Section number={5} total={TOTAL} title="Keyword Strategy">
            <DiagnosisCard>
              {kw.accepted?.length || 0} keywords passed intent classification and topical-relevance filtering.
              {kw.excluded?.length ? ` ${kw.excluded.length} high-volume but irrelevant term(s) were suppressed (no conversion path).` : ""}
              {kw.brand_monitoring_only?.length ? ` ${kw.brand_monitoring_only.length} competitor/brand term(s) routed to monitoring — never content targets.` : ""}
            </DiagnosisCard>
            {/* Non-expert narrative frame (V2 — entry point for non-SEO readers) */}
            {frames.keyword_strategy_intro && (
              <p className="mb-4" style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{frames.keyword_strategy_intro}</p>
            )}
            {/* Keyword intent split — donut */}
            {(() => {
              const acc = kw.accepted || [];
              if (acc.length < 2) return null;
              const counts = { transactional: 0, informational: 0, "local-commercial": 0, other: 0 };
              acc.forEach(k => { counts[counts[k.intent_class] !== undefined ? k.intent_class : "other"]++; });
              const segs = [
                { label: "Commercial (buyers)", value: counts.transactional, color: C.orange },
                { label: "Informational", value: counts.informational, color: C.teal },
                { label: "Local / geo", value: counts["local-commercial"], color: "#2D6B32" },
                { label: "Other", value: counts.other, color: C.greyMid },
              ].filter(s => s.value > 0);
              if (segs.length < 2) return null;
              return (
                <div className="rounded-lg p-4 mb-4" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                  <div className="uppercase mb-3" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.greyText }}>Keyword Intent Split</div>
                  <Donut segments={segs} centerLabel={acc.length} centerSub="KEYWORDS" />
                </div>
              );
            })()}
            {/* Grouped by intent class per spec: primary commercial,
                informational & supporting, local & geo, long-tail feature. */}
            {(() => {
              const acc = kw.accepted || [];
              const groups = [
                { key: "transactional",    title: "1 · Primary Commercial Keywords",      rows: acc.filter(k => k.intent_class === "transactional") },
                { key: "informational",    title: "2 · Informational & Supporting",        rows: acc.filter(k => k.intent_class === "informational") },
                { key: "local-commercial", title: "3 · Local & Geo-Modified Keywords",      rows: acc.filter(k => k.intent_class === "local-commercial") },
                { key: "other",            title: "4 · Long-Tail & Feature Keywords",       rows: acc.filter(k => !["transactional","informational","local-commercial"].includes(k.intent_class)) },
              ].filter(g => g.rows.length);
              if (!groups.length) return <KeywordTable rows={acc} />;
              return groups.map(g => (
                <div key={g.key} className="mb-4">
                  <h4 className="text-[12px] font-bold tracking-wide mb-1.5" style={{ color: C.orange }}>{g.title}</h4>
                  <KeywordTable rows={g.rows} />
                </div>
              ));
            })()}
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
            {/* Suppressed Keywords record (P1: transparency — show what was removed and why) */}
            {kw.excluded?.length > 0 && (
              <details className="mt-4 rounded-lg" style={{ background: C.tableHead, border: `1px solid ${C.border}` }}>
                <summary className="cursor-pointer px-3 py-2 uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "1.5px", color: C.greyText }}>
                  Suppressed Keywords — {kw.excluded.length} removed for transparency (not targeted)
                </summary>
                <div className="px-3 pb-3">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <Th>Keyword</Th><Th>Why Suppressed</Th>
                    </tr></thead>
                    <tbody>
                      {kw.excluded.slice(0, 25).map((e, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <Td><span style={{ color: C.greyText }}>{e.keyword}</span></Td>
                          <Td><span style={{ fontSize: "11px", color: C.greyMid }}>{e.reason}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {kw.excluded.length > 25 && <p style={{ fontFamily: SANS, fontSize: "10px", color: C.greyMid, marginTop: "6px" }}>+ {kw.excluded.length - 25} more suppressed.</p>}
                </div>
              </details>
            )}
            <Narrative num={5} />
              {narrativeBridge("keyword_strategy") && <BridgeNote text={narrativeBridge("keyword_strategy")} />}
          </Section>

          {/* ── 06 · CONTENT ARCHITECTURE (3 separated subsections + narrative) ─ */}
          <Section number={6} total={TOTAL} title="Content Architecture">
            <DiagnosisCard>
              {(ca.commercial_pages || []).length + (ca.city_pages || []).length} commercial/local pages and {(ca.blog_and_guides || []).length} supporting articles are mapped from the accepted keywords — each to a single intent, so buyers, researchers, and local searchers each land on a page built to convert them rather than a generic catch-all.
            </DiagnosisCard>
            <WhatRankingPagesDo>
              Pages that rank do one job extremely well: they match a single search intent, answer it completely, and link to the next logical step. Each page below targets one keyword cluster — commercial pages convert buyers, blog content captures researchers and funnels them inward, and city pages own local intent. Spreading one page across many intents is why most sites stall.
            </WhatRankingPagesDo>
            <ContentSub title="Core Commercial Pages" rows={ca.commercial_pages || []} type="commercial" />
            <ContentSub title="Blog &amp; Educational Content" rows={ca.blog_and_guides || []} type="blog" />
            {(ca.city_pages || []).length > 0 && (
              <ContentSub title="Local &amp; City Pages" rows={ca.city_pages || []} type="city" />
            )}
            <Narrative num={6} />
              {narrativeBridge("content_architecture") && <BridgeNote text={narrativeBridge("content_architecture")} />}
          </Section>

          {/* ── 07 · TECHNICAL FOUNDATION (always renders) ──────────────────── */}
          <Section number={7} total={TOTAL} title="Technical Foundation">
            {tech.length === 0 ? (
              <DiagnosisCard>No blocking technical issues detected in the crawl. Maintain current configuration and re-audit after any major site change.</DiagnosisCard>
            ) : (
              <DiagnosisCard>
                {tech.filter(t => t.priority === "CRITICAL").length > 0
                  ? `${tech.filter(t => t.priority === "CRITICAL").length} critical blocker(s) are throttling the entire site — fix these before any content or authority work.`
                  : `${tech.length} technical issue(s) detected, ranked by ranking impact. Resolve in priority order.`}
              </DiagnosisCard>
            )}
            {tech.length > 0 && frames.technical_issues_intro && (
              <p className="mb-4" style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{frames.technical_issues_intro}</p>
            )}
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
              <Narrative num={7} />
              {narrativeBridge("technical_foundation") && <BridgeNote text={narrativeBridge("technical_foundation")} />}
          </Section>

          {/* ── 08 · AUTHORITY & LINK BUILDING (4 categories + narrative) ────── */}
          <Section number={8} total={TOTAL} title="Authority &amp; Link Building">
            <DiagnosisCard>
              Off-site authority is the ceiling on how high the site can rank for competitive terms. The four link categories below run from fastest-and-easiest (citations) to highest-long-term-value (editorial) — built in that order, they compound trust the way nothing on-page can.
            </DiagnosisCard>
            {frames.authority_intro && <p className="mb-4" style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{frames.authority_intro}</p>}
            <BacklinkSub title="① Citation &amp; Directory Links" hint="Fastest baseline authority + local signals">
              <table className="w-full text-[12px]">
                <thead><tr style={{ borderBottom: `1px solid ${C.warmGrey}30` }}>
                  <Th>Platform</Th><Th right>DR</Th><Th>You</Th><Th>Competitors</Th><Th>Effort</Th><Th>Signal</Th>
                </tr></thead>
                <tbody>
                  {(bl.citation_links || []).map((l, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#fff" : C.ivory }}>
                      <Td>{l.listing_url ? <a href={l.listing_url} target="_blank" rel="noreferrer" className="underline" style={{ color: C.orange }}>{l.platform}</a> : l.platform}</Td>
                      <Td right>{l.domain_rating}</Td>
                      <Td>{l.client_listed ? <span style={{ color: "#2D6B32" }}>✓ Listed</span> : <span style={{ color: "#B83A1A" }}>✗ Missing</span>}</Td>
                      <Td>{l.competitors_total > 0
                        ? <span style={{ color: l.competitors_listed > 0 ? "#9A6A12" : C.greyMid }}>{l.competitors_listed}/{l.competitors_total} listed{l.competitor_names?.length ? ` (${l.competitor_names.join(", ")})` : ""}</span>
                        : <span style={{ color: C.greyMid }}>—</span>}</Td>
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
            <Narrative num={8} />
              {narrativeBridge("authority_link_building") && <BridgeNote text={narrativeBridge("authority_link_building")} />}
          </Section>

          {/* ── 09 · GBP COMPARISON ─────────────────────────────────────────── */}
          {gbp.client && (
            <Section number={9} total={TOTAL} title="Local Visibility &amp; GBP Comparison">
              <DiagnosisCard>{gbp.biggest_gap || "This profile is benchmarked field-by-field against every competitor appearing above it in local search — the comparison below shows exactly where a few hours of work changes the competitive picture."}</DiagnosisCard>
              {frames.gbp_intro && <p className="mb-4" style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{frames.gbp_intro}</p>}

              {/* ── ONE DETAILED GMB TABLE: you + all competitors, colour-coded
                   best/missing per field, with a How-To-Improve column ── */}
              {(() => {
                const fa = gbp.field_analysis || [];
                const comps = gbp.competitors || [];
                const allProfiles = [{ ...gbp.client, name: gbp.client.name || "You", _isClient: true }, ...comps];
                const fmtField = (val, type) => {
                  if (type === "bool") return val ? "✓" : "✗";
                  if (type === "num")  return val == null ? "—" : (val === "present" ? "✓" : String(val));
                  return val || "—";
                };
                // best holder per field (by name) to highlight the winning cell
                const bestNameByField = Object.fromEntries(fa.map(f => [f.field, f.best_name]));
                const statusColor = { best: "#2D6B32", good: "#9A6A12", behind: "#9A6A12", missing: "#B83A1A" };
                const statusBg    = { best: "#D6EAD7", good: "#FBF1D9", behind: "#FBF1D9", missing: "#F8DDD4" };
                if (!fa.length) return null;
                return (
                  <div className="overflow-x-auto rounded-lg mb-3" style={{ border: `1px solid ${C.border}` }}>
                    <table className="w-full" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: C.nearBlack }}>
                          <th className="text-left uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: "#fff", padding: "8px 10px" }}>Field</th>
                          <th className="text-center uppercase" style={{ fontFamily: SANS, fontWeight: 700, fontSize: "9px", letterSpacing: "1px", color: C.orangeLite, padding: "8px 10px" }}>You</th>
                          {comps.map((c, i) => (
                            <th key={i} className="text-center uppercase truncate" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "0.5px", color: "#fff", padding: "8px 10px", maxWidth: "110px" }}>{c.name}</th>
                          ))}
                          <th className="text-left uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: C.orangeLite, padding: "8px 10px", minWidth: "200px" }}>How To Improve</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fa.map((f, i) => (
                          <tr key={f.field} style={{ background: i % 2 ? "#fff" : C.rowEven, borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ fontFamily: SANS, fontSize: "11px", fontWeight: 500, color: C.greyText, padding: "8px 10px" }}>{f.label}</td>
                            {/* client cell — coloured by status */}
                            <td className="text-center" style={{ fontFamily: SANS, fontSize: "11px", fontWeight: 700, padding: "6px 8px" }}>
                              <span style={{ background: statusBg[f.client_status] || "transparent", color: statusColor[f.client_status] || C.textDark, padding: "1px 6px", borderRadius: "3px" }}>
                                {fmtField(f.client_value, f.type)}
                              </span>
                            </td>
                            {/* competitor cells — highlight the best holder */}
                            {comps.map((c, j) => {
                              const isBest = bestNameByField[f.field] && bestNameByField[f.field] === c.name;
                              return (
                                <td key={j} className="text-center" style={{ fontFamily: SANS, fontSize: "11px", fontWeight: isBest ? 700 : 400, color: isBest ? "#2D6B32" : C.textDark, padding: "8px 10px" }}>
                                  {isBest ? "★ " : ""}{fmtField(c[f.field], f.type)}
                                </td>
                              );
                            })}
                            {/* how to improve */}
                            <td style={{ fontFamily: SANS, fontSize: "11px", color: f.client_status === "best" ? "#2D6B32" : C.greyText, padding: "8px 10px", lineHeight: 1.4 }}>
                              {f.client_status === "best" ? "✓ You lead — maintain" : (f.gap_note ? f.gap_note + " " : "") + (f.improvement || "")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 mb-4" style={{ fontFamily: SANS, fontSize: "10px", color: C.greyText }}>
                <span><span style={{ background: "#D6EAD7", color: "#2D6B32", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>green</span> you lead / best</span>
                <span><span style={{ background: "#FBF1D9", color: "#9A6A12", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>amber</span> behind</span>
                <span><span style={{ background: "#F8DDD4", color: "#B83A1A", padding: "1px 5px", borderRadius: "3px", fontWeight: 700 }}>red</span> missing</span>
                <span>★ = best in market for that field</span>
              </div>

              <GapBlock label="Biggest Visibility Gap" text={gbp.biggest_gap} />
              <GapBlock label="Fastest Win (48h)" text={gbp.fastest_win} accent />
              <GapBlock label="Trust Gap" text={gbp.trust_gap} />

              {/* ── COMPETITOR ANALYSIS — detailed per-competitor GMB breakdown ── */}
              {(gbp.competitor_analysis || []).length > 0 && (
                <div className="mt-6">
                  <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", letterSpacing: "1.5px", color: C.orange }}>Competitor Analysis</div>
                  <p className="mb-3" style={{ fontFamily: SANS, fontSize: "13px", color: C.textDark, lineHeight: 1.6 }}>
                    Each business competitor's live Google Business Profile, analysed head-to-head against yours — where they win, where they are exposed, and the single most effective way to overtake them.
                  </p>
                  <div className="space-y-3">
                    {gbp.competitor_analysis.map((ca2, i) => (
                      <div key={i} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                        {/* Header: name + threat */}
                        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: C.tableHead }}>
                          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "16px", color: C.textDark }}>{ca2.name}</span>
                          <div className="flex items-center gap-2">
                            <span style={{ fontFamily: SANS, fontSize: "11px", color: C.greyText }}>
                              {ca2.review_count ?? 0} reviews · {ca2.rating ? `${ca2.rating}★` : "—"} · {ca2.completeness != null ? `${ca2.completeness}/100` : "—"}
                            </span>
                            <PriorityLabel priority={ca2.threat_level} />
                            <span style={{ fontFamily: SANS, fontSize: "11px", color: C.greyMid }}>threat {ca2.threat_score}</span>
                          </div>
                        </div>
                        <div className="px-4 py-3">
                          <p className="mb-2" style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "14px", color: C.textDark }}>{ca2.verdict}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: "#B83A1A" }}>Where They Beat You</div>
                              <ul className="space-y-1">
                                {ca2.strengths.map((s, j) => (
                                  <li key={j} className="flex gap-1.5" style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText, lineHeight: 1.5 }}><span style={{ color: "#B83A1A" }}>▲</span><span>{s}</span></li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: "#2D6B32" }}>Where They Are Exposed</div>
                              <ul className="space-y-1">
                                {ca2.weaknesses.map((w, j) => (
                                  <li key={j} className="flex gap-1.5" style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText, lineHeight: 1.5 }}><span style={{ color: "#2D6B32" }}>▼</span><span>{w}</span></li>
                                ))}
                              </ul>
                            </div>
                          </div>
                          <div className="mt-3 rounded p-2.5" style={{ background: C.diagTint, borderLeft: `3px solid ${C.orange}` }}>
                            <span className="uppercase" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: C.orange }}>Overtake Play: </span>
                            <span style={{ fontFamily: SANS, fontSize: "13px", color: C.textDark }}>{ca2.overtake_play}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── REVIEW INTELLIGENCE — sentiment, velocity, unreplied, dist ── */}
              {gbp.review_intel && (gbp.review_intel.sentiment || gbp.review_intel.velocity_per_month != null) && (
                <div className="mt-6">
                  <div className="uppercase mb-2" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", letterSpacing: "1.5px", color: C.orange }}>Review Intelligence</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <MiniStat label="Your Reviews" value={gbp.review_intel.total_reviews} sub={gbp.review_intel.review_gap ? `${gbp.review_intel.review_gap} behind leader` : "category base"} />
                    <MiniStat label="Velocity" value={gbp.review_intel.velocity_per_month != null ? `${gbp.review_intel.velocity_per_month}/mo` : "—"} sub="new reviews / month" />
                    <MiniStat label="Unreplied" value={gbp.review_intel.unreplied_count ?? "—"} sub="Google tracks response rate" />
                    <MiniStat label="Sentiment" value={gbp.review_intel.sentiment ? `${gbp.review_intel.sentiment.score}/100` : "—"} sub={gbp.review_intel.sentiment?.overall || ""} />
                  </div>
                  {/* Charts: rating distribution + reviews vs competitors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {gbp.review_intel.rating_distribution && (
                      <div className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                        <div className="uppercase mb-2" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: C.greyText }}>Your Rating Distribution</div>
                        <RatingBars dist={gbp.review_intel.rating_distribution} />
                      </div>
                    )}
                    {(gbp.competitors || []).length > 0 && (
                      <div className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                        <div className="uppercase mb-2" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: C.greyText }}>Reviews — You vs Competitors</div>
                        <HBarChart labelWidth={90} data={[
                          { label: gbp.client.name || "You", value: gbp.client.review_count || 0, color: C.orange },
                          ...gbp.competitors.map(c => ({ label: c.name, value: c.review_count || 0, color: C.greyMid })),
                        ]} />
                      </div>
                    )}
                  </div>
                  {gbp.review_intel.sentiment && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                      {gbp.review_intel.sentiment.praises?.length > 0 && (
                        <div className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                          <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: "#2D6B32" }}>Customers Praise</div>
                          <ul className="space-y-0.5">{gbp.review_intel.sentiment.praises.map((x, i) => <li key={i} style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText }}>+ {x}</li>)}</ul>
                        </div>
                      )}
                      {gbp.review_intel.sentiment.complaints?.length > 0 && (
                        <div className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                          <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "9px", letterSpacing: "1px", color: "#B83A1A" }}>Customers Complain About</div>
                          <ul className="space-y-0.5">{gbp.review_intel.sentiment.complaints.map((x, i) => <li key={i} style={{ fontFamily: SANS, fontSize: "12px", color: C.greyText }}>− {x} <span style={{ color: C.greyMid }}>(fix to lift rating)</span></li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                  <p style={{ fontFamily: SANS, fontSize: "12px", color: C.textDark, lineHeight: 1.6 }}>{gbp.review_intel.commercial_reading}</p>
                </div>
              )}

              {/* ── PRIORITISED GBP ACTION PLAN (Action Item Rows + outcome) ── */}
              {gbp.gbp_action_plan?.length > 0 && (
                <div className="mt-6">
                  <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "11px", letterSpacing: "1.5px", color: C.orange }}>GBP Action Plan — Priority Order</div>
                  {gbp.gbp_action_plan.slice(0, 10).map((a, i) => (
                    <ActionRow key={i} step={i + 1} title={a.area} description={`${a.action}${a.outcome ? ` → ${a.outcome}` : ""}`} channel="SEO" priority={a.priority} effort={a.effort} />
                  ))}
                </div>
              )}

              {/* ── WHAT GOOD LOOKS LIKE (local outcome) ── */}
              {gbp.what_good_looks_like && (
                <div className="mt-4 rounded-lg p-4" style={{ background: C.diagTint, borderLeft: `3px solid ${C.orange}` }}>
                  <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.orange }}>What Good Looks Like</div>
                  <p style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>{gbp.what_good_looks_like}</p>
                </div>
              )}

              <Narrative num={9} />
              {narrativeBridge("local_visibility_gbp") && <BridgeNote text={narrativeBridge("local_visibility_gbp")} />}
            </Section>
          )}

          {/* ── 10 · GEO LAYER & AI VISIBILITY (+ narrative) ────────────────── */}
          {geo.recommended_actions?.length > 0 && (
            <Section number={10} total={TOTAL} title="GEO Layer &amp; AI Visibility">
              <div className="flex items-center gap-2 mb-3"><TagChip tag="SEO+GEO" /><span className="text-[11px]" style={{ color: C.greyText }}>Same actions strengthen classic ranking and AI citation.</span></div>
              <DiagnosisCard>
                Current AI citation status: <strong>{geo.current_ai_citation_count}</strong>. The site is not yet a citable source for ChatGPT, Google AI Overviews, or Perplexity — the prescription below makes the content liftable by answer engines.
              </DiagnosisCard>
              {/* Action Item Rows (Rule R3 — no plain bullets for actions) */}
              <div className="mb-3">
                {geo.recommended_actions.map((a, i) => (
                  <ActionRow key={i} step={i + 1} title={a.split(":")[0]} description={a.includes(":") ? a.split(":").slice(1).join(":").trim() : ""} channel={/schema|json-ld|faqpage|organization/i.test(a) ? "SEO+GEO" : "GEO"} priority={i < 2 ? "HIGH" : "MEDIUM"} effort={/schema|json-ld/i.test(a) ? "~3 hrs" : "~1 day"} />
                ))}
              </div>
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
              <Narrative num={10} />
              {narrativeBridge("geo_ai_visibility") && <BridgeNote text={narrativeBridge("geo_ai_visibility")} />}
            </Section>
          )}

          {/* ── 11 · KPI FORECAST (validated + narrative) ───────────────────── */}
          <Section number={11} total={TOTAL} title="KPI Forecast &amp; Measurement">
            <DiagnosisCard>
              Every target below is directionally validated against its baseline — no flat or zero forecasts. The numbers model what the prescribed work realistically returns at 6 and 12 months, and the guidance names the exact tools and early signals to watch from week two.
            </DiagnosisCard>
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
            <Narrative num={11} />
            {/* KPI trajectory charts — baseline → 6mo → 12mo for numeric metrics */}
            {(() => {
              const trend = kpis.filter(k => typeof k.baseline === "number" && (typeof k.target_6_months === "number" || typeof k.target_12_months === "number")).slice(0, 4);
              if (!trend.length) return null;
              return (
                <div className="rounded-lg p-4 mt-3" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
                  <div className="uppercase mb-3" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.greyText }}>Projected Trajectory</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {trend.map((k, i) => (
                      <div key={i}>
                        <div className="mb-1" style={{ fontFamily: SANS, fontSize: "10px", fontWeight: 600, color: C.textDark }}>{k.metric}</div>
                        <TrajectoryBars baseline={k.baseline} m6={typeof k.target_6_months === "number" ? k.target_6_months : k.baseline} m12={typeof k.target_12_months === "number" ? k.target_12_months : k.target_6_months} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* "What Good Looks Like" — closing narrative anchor (V2 KPI prompt) */}
            {(() => {
              const v12 = oppSummary.estimated_traffic_uplift_12m;
              if (v12 == null) return null;
              const enquiries = Math.round(v12 * 0.02);
              return (
                <div className="mt-4 rounded-lg p-4" style={{ background: C.diagTint, borderLeft: `3px solid ${C.orange}` }}>
                  <div className="uppercase mb-1" style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: C.orange }}>What Good Looks Like</div>
                  <p style={{ fontFamily: SANS, fontSize: "14px", color: C.textDark, lineHeight: 1.7 }}>
                    In 12 months, executing this prescription puts {meta.client_name} on track for roughly <strong>{fmtNum(v12)} organic visitors a month</strong> from people actively searching for what the business offers. At a conservative 2% conversion rate, that is about <strong>{fmtNum(enquiries)} new enquiries every month</strong> from a channel that costs nothing per click — compounding month over month as the content and authority mature.
                  </p>
                </div>
              );
            })()}
            {narrativeBridge("kpi_forecast") && <BridgeNote text={narrativeBridge("kpi_forecast")} />}
          </Section>

          {/* ── 12 · IMPLEMENTATION & SPRINT PLAN (narrative + structured fallback) */}
          <Section number={12} total={TOTAL} title="Implementation &amp; Sprint Plan">
            <DiagnosisCard>
              The prescription is sequenced into time-boxed sprints — foundation fixes on day one, content in week one, authority and GEO across weeks one to two — so the team knows exactly what to do, in what order, and what each sprint unlocks.
            </DiagnosisCard>
            {!narrativeByNum["12"] && pap.length > 0 && (
              <div className="space-y-2 mb-3">
                {[
                  ["Day 1 — Foundation Sprint", "Foundation Fixes"],
                  ["Week 1 — Content Sprint", "Content & On-Page Work"],
                  ["Weeks 1–2 — Authority & GEO Sprint", "Authority & GEO Work"],
                ].map(([label, tierName]) => {
                  const tier = pap.find(t => t.tier === tierName);
                  if (!tier) return null;
                  return (
                    <div key={label} className="rounded-lg p-3" style={{ background: "#fff", border: `1px solid ${C.warmGrey}25` }}>
                      <div className="text-[12px] font-bold mb-1" style={{ color: C.orange }}>{label}</div>
                      <ul className="space-y-0.5">
                        {tier.actions.slice(0, 5).map((a, i) => (
                          <li key={i} className="flex gap-2 text-[11px]" style={{ color: C.greyText }}>
                            <span style={{ color: C.orange }}>▸</span><span>{a.description} <span className="opacity-70">({a.effort})</span></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <p className="text-[12px] mt-2" style={{ color: C.nearBlack }}>
                  Completing this sequence captures the mapped keyword and local-search opportunity while removing the technical ceilings that currently suppress every page.
                </p>
              </div>
            )}
            <Narrative num={12} />
          </Section>

          {/* ── Any extra narrative sections not mapped above (safety net) ──── */}
          {Object.keys(narrativeByNum)
            .filter((n) => !["01","02","03","04","05","06","07","08","09","10","11","12"].includes(n))
            .sort()
            .map((n) => (
              <Section key={n} number={Number(n)} total={TOTAL} title={cleanTitle(narrativeByNum[n].title)}>
                <Narrative num={Number(n)} />
              </Section>
            ))}

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
  return <th className={`uppercase ${right ? "text-right" : "text-left"}`} style={{ fontFamily: SANS, fontWeight: 600, fontSize: "10px", letterSpacing: "2px", color: white ? "#fff" : "#5A5550", padding: "10px 12px", borderBottom: `1.5px solid #D0CBC5` }}>{children}</th>;
}
function Td({ children, right }) {
  return <td className={`${right ? "text-right" : "text-left"}`} style={{ fontFamily: SANS, fontSize: "13px", color: C.textDark, padding: "10px 12px" }}>{children}</td>;
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

function scoreColor(s) {
  if (s == null) return C.warmGrey;
  if (s >= 80) return "#3f7d4a"; // green
  if (s >= 60) return "#b8860b"; // amber
  if (s >= 40) return C.orange;  // burnt orange
  return "#c0341a";              // red
}
