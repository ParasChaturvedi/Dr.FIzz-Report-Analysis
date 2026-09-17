"use client";

// RankTrackerScreen — full "Rank Tracker" screen (Figma flow 17-28043), built on
// the dashboard's Figma design system. Real data: the tracked keywords + their
// live Google positions come from DataForSEO rankedKeywords; the Top-3/10/100
// distribution uses the same organic-keyword buckets the dashboard shows. No demo
// data — empty input renders an honest empty state.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, TrendingUp, Trophy, Target, Search,
  ChevronUp, ChevronDown,
} from "lucide-react";

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const posColor = (p) => (p == null ? "#9CA3AF" : p <= 3 ? "#178A5D" : p <= 10 ? "#B98500" : "#6B7280");
const posBg = (p) => (p == null ? "#F3F4F6" : p <= 3 ? "#EAF8F1" : p <= 10 ? "#FFF5D9" : "#F3F4F6");

const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const TITLE = "inline-flex items-center gap-1 text-[12px] font-semibold text-[#374151] dark:text-[var(--text)] leading-relaxed";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";

export default function RankTrackerScreen({ data = {}, onBack, onChatWithAi }) {
  const { domain = "", ranked = [], top3 = null, top10 = null, top100 = null } = data;
  const scope = domain ? `https://${domain}` : "—";

  const rows = useMemo(() => {
    const seen = new Set();
    const out = [];
    (Array.isArray(ranked) ? ranked : []).forEach((r) => {
      const kw = String(r?.keyword || "").trim();
      if (!kw || seen.has(kw.toLowerCase())) return;
      seen.add(kw.toLowerCase());
      out.push({
        keyword: kw,
        position: r?.position != null && Number.isFinite(Number(r.position)) ? Number(r.position) : null,
        volume: r?.searchVolume ?? r?.volume ?? null,
        traffic: r?.traffic ?? null,
      });
    });
    return out;
  }, [ranked]);

  // Distribution — prefer the dashboard's real buckets, else derive from rows.
  const dist = useMemo(() => {
    if (top3 != null || top10 != null || top100 != null) {
      return { t3: Number(top3) || 0, t10: Number(top10) || 0, t100: Number(top100) || 0 };
    }
    const t3 = rows.filter((r) => r.position != null && r.position <= 3).length;
    const t10 = rows.filter((r) => r.position != null && r.position <= 10).length;
    const t100 = rows.filter((r) => r.position != null && r.position <= 100).length;
    return { t3, t10, t100 };
  }, [rows, top3, top10, top100]);

  const avgPos = useMemo(() => {
    const ps = rows.map((r) => r.position).filter((p) => Number.isFinite(p));
    return ps.length ? (ps.reduce((s, p) => s + p, 0) / ps.length).toFixed(1) : null;
  }, [rows]);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "position", dir: "asc" });
  const filtered = useMemo(() => {
    let arr = rows;
    if (q.trim()) { const s = q.trim().toLowerCase(); arr = arr.filter((r) => r.keyword.toLowerCase().includes(s)); }
    const { key, dir } = sort;
    arr = [...arr].sort((a, b) => {
      if (key === "keyword") return dir === "asc" ? a.keyword.localeCompare(b.keyword) : b.keyword.localeCompare(a.keyword);
      let av = a[key], bv = b[key];
      av = av == null ? (key === "position" ? 1e9 : -1) : Number(av);
      bv = bv == null ? (key === "position" ? 1e9 : -1) : Number(bv);
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, q, sort]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "keyword" ? "asc" : (key === "position" ? "asc" : "desc") }));
  const SortHead = ({ k, label, align = "right" }) => (
    <button type="button" onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${sort.key === k ? "text-[var(--text)]" : ""} ${align === "right" ? "justify-end w-full" : ""}`}>
      {label}{sort.key === k ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="opacity-40">↑↓</span>}
    </button>
  );

  const StatCard = ({ Icon, title, value, sub }) => (
    <div className={CARD}>
      <div className="flex items-center gap-2"><span className={CHIP}><Icon size={16} /></span><span className={TITLE}>{title}</span></div>
      <div className="mt-3 flex items-end gap-2"><div className={VALUE}>{value}</div></div>
      {sub && <div className="mt-3 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );

  const total100 = dist.t100 || (dist.t3 + dist.t10) || 1;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Rank Tracker</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onChatWithAi?.()}
            className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">
            Chat with Ai <Sparkles size={14} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Ranking Overview</h2>
        <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard Icon={TrendingUp} title="Tracked Keywords" value={compact(rows.length)} sub="Keywords ranking in Google" />
          <StatCard Icon={Trophy} title="Top 3" value={compact(dist.t3)} sub="Positions 1–3" />
          <StatCard Icon={Target} title="Top 10" value={compact(dist.t10)} sub="First page" />
          <StatCard Icon={Target} title="Avg Position" value={avgPos != null ? avgPos : "—"} sub="Mean Google rank" />
        </section>

        {/* Distribution bar */}
        <div className={`${CARD} mb-8`}>
          <div className="mb-3 text-[12px] font-semibold text-[var(--text)]">Position Distribution</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-3 bg-[#178A5D]" style={{ width: `${(dist.t3 / total100) * 100}%` }} title={`Top 3: ${dist.t3}`} />
            <div className="h-3 bg-[#F59E0B]" style={{ width: `${(Math.max(0, dist.t10 - dist.t3) / total100) * 100}%` }} title={`4–10: ${Math.max(0, dist.t10 - dist.t3)}`} />
            <div className="h-3 bg-[#9CA3AF]" style={{ width: `${(Math.max(0, dist.t100 - dist.t10) / total100) * 100}%` }} title={`11–100: ${Math.max(0, dist.t100 - dist.t10)}`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-[11px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#178A5D]" /> Top 3: {compact(dist.t3)}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" /> 4–10: {compact(Math.max(0, dist.t10 - dist.t3))}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[#9CA3AF]" /> 11–100: {compact(Math.max(0, dist.t100 - dist.t10))}</span>
          </div>
        </div>

        {/* Table */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[16px] font-bold text-[var(--text)] ml-1">Tracked Keywords</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keywords…"
              className="w-full sm:w-56 rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-[12px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#CA5223]" />
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><TrendingUp size={20} /></div>
              <div className="text-[13px] font-semibold text-[var(--text)]">No ranking data yet</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan (or connect Search Console) to track the keywords you rank for and their Google positions.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[12px] font-semibold text-[var(--muted)]">
                    <th className="px-4 py-3 text-left whitespace-nowrap"><SortHead k="keyword" label="Keyword" align="left" /></th>
                    <th className="px-4 py-3 text-right whitespace-nowrap"><SortHead k="position" label="Position" /></th>
                    <th className="px-4 py-3 text-right whitespace-nowrap"><SortHead k="volume" label="Volume" /></th>
                    <th className="px-4 py-3 text-right whitespace-nowrap"><SortHead k="traffic" label="Est. Traffic" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={`${r.keyword}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--app-bg)]/40 transition-colors">
                      <td className="px-4 py-3 text-left"><span className="font-medium text-[var(--text)] break-words">{r.keyword}</span></td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums" style={{ background: posBg(r.position), color: posColor(r.position) }}>
                          {r.position != null ? `#${r.position}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{compact(r.volume)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{compact(r.traffic)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="px-6 py-8 text-center text-[12px] text-[var(--muted)]">No keywords match your search.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
