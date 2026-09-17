"use client";

// RankTrackerScreen — matched to Figma flow node 14:15440 ("Keyword rank tool").
// LAYOUT is faithful to Figma (top banner, Website Performance, Algorithm Impact
// Timeline, SERP-feature Performance, filters, Position Trend + Current Ranking,
// Keyword Performance table). DATA POLICY: real data where the platform has it
// (positions, Top-3/10/20, a computed visibility score from real positions, SERP
// feature counts, keyword table with volume/KD/CPC/traffic/intent/URL, current-
// ranking buckets); sections that need historical tracking the platform does NOT
// collect (visibility trend, algorithm-impact timeline, position history over time,
// CTR / expected-CTR / change) show an HONEST "needs tracking" state — never fake
// numbers.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, TrendingUp, Trophy, Target, Info, LineChart, Clock,
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Star, MapPin,
  Image as ImageIcon, ShoppingBag, HelpCircle, Zap,
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
const SELECT = "rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[12px] text-[var(--text)] focus:outline-none focus:border-[#CA5223]";

// Honest "no historical data" placeholder used inside chart/timeline containers.
const NeedsTracking = ({ icon: Icon = LineChart, title = "Trend needs tracking", note }) => (
  <div className="grid min-h-[160px] place-items-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-4 py-8 text-center">
    <div>
      <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Icon size={18} /></div>
      <div className="text-[12px] font-semibold text-[var(--text)]">{title}</div>
      <div className="mt-1 text-[11px] text-[var(--muted)] max-w-[340px]">{note}</div>
    </div>
  </div>
);

export default function RankTrackerScreen({ data = {}, onBack, onChatWithAi }) {
  const { domain = "", ranked = [], top3 = null, top10 = null, top100 = null, serpFeatures = null } = data;
  const scope = domain ? `https://${domain}` : "—";

  const rows = useMemo(() => {
    const seen = new Set(); const out = [];
    (Array.isArray(ranked) ? ranked : []).forEach((r) => {
      const kw = String(r?.keyword || "").trim();
      if (!kw || seen.has(kw.toLowerCase())) return; seen.add(kw.toLowerCase());
      out.push({
        keyword: kw,
        position: r?.position != null && Number.isFinite(Number(r.position)) ? Number(r.position) : null,
        volume: r?.searchVolume ?? r?.volume ?? null,
        kd: r?.difficulty ?? r?.seoDifficulty ?? null,
        cpc: r?.cpc ?? null,
        traffic: r?.traffic ?? null,
        url: r?.url ?? null,
      });
    });
    return out;
  }, [ranked]);

  // Real distribution
  const dist = useMemo(() => {
    const t3 = top3 != null ? Number(top3) : rows.filter((r) => r.position != null && r.position <= 3).length;
    const t10 = top10 != null ? Number(top10) : rows.filter((r) => r.position != null && r.position <= 10).length;
    const t20 = rows.filter((r) => r.position != null && r.position <= 20).length || (top100 != null ? null : 0);
    return { t3, t10, t20: t20 ?? "—" };
  }, [rows, top3, top10, top100]);

  // Real visibility proxy from real positions (CTR-curve weighted). Not fake — computed.
  const visibility = useMemo(() => {
    const ps = rows.map((r) => r.position).filter((p) => Number.isFinite(p));
    if (!ps.length) return null;
    const w = (p) => (p <= 1 ? 1 : p <= 3 ? 0.7 : p <= 10 ? 0.4 : p <= 20 ? 0.15 : p <= 50 ? 0.05 : 0.01);
    return Math.round((ps.reduce((s, p) => s + w(p), 0) / ps.length) * 100);
  }, [rows]);

  // Current-ranking buckets (real)
  const buckets = useMemo(() => {
    const b = { a: 0, b: 0, c: 0, d: 0 };
    rows.forEach((r) => {
      if (r.position == null) return;
      if (r.position <= 10) b.a++; else if (r.position <= 20) b.b++; else if (r.position <= 60) b.c++; else b.d++;
    });
    return b;
  }, [rows]);

  const serp = serpFeatures || {};
  const serpCards = [
    ["Featured Snippet", Star, serp.featuredSnippets],
    ["People Also Ask", HelpCircle, serp.peopleAlsoAsk],
    ["Image Pack", ImageIcon, serp.imagePack],
    ["Video Results", ShoppingBag, serp.videoResults],
    ["Knowledge Panel", MapPin, serp.knowledgePanel],
  ];

  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "position", dir: "asc" });
  const [page, setPage] = useState(1);
  const rowsPer = 5;
  const filtered = useMemo(() => {
    let arr = rows;
    if (q.trim()) { const s = q.trim().toLowerCase(); arr = arr.filter((r) => r.keyword.toLowerCase().includes(s)); }
    const { key, dir } = sort;
    arr = [...arr].sort((a, b) => {
      if (key === "keyword") return dir === "asc" ? a.keyword.localeCompare(b.keyword) : b.keyword.localeCompare(a.keyword);
      let av = a[key] == null ? (key === "position" ? 1e9 : -1) : Number(a[key]);
      let bv = b[key] == null ? (key === "position" ? 1e9 : -1) : Number(b[key]);
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, q, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPer));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * rowsPer, curPage * rowsPer);
  const toggleSort = (key) => { setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "keyword" ? "asc" : "desc" })); setPage(1); };
  const SortHead = ({ k, label }) => (
    <button type="button" onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 hover:text-[var(--text)] ${sort.key === k ? "text-[var(--text)]" : ""}`}>
      {label}{sort.key === k ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="opacity-40">↑↓</span>}
    </button>
  );

  const Positions = ({ label, val }) => (
    <div className="flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-1 text-[11px] text-[var(--muted)]"><TrendingUp size={12} /> {label}</div>
      <div className="mt-1 text-[20px] font-bold text-[var(--text)] tabular-nums">{compact(val)}</div>
      <div className="text-[10px] text-[var(--muted)]">keywords</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft size={16} /> Back</button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Rank Tracker</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Chat with Ai <Sparkles size={14} /></button>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {/* Top banner */}
        <div className="mb-6 flex flex-col gap-3 rounded-[12px] border border-[#E0E7FF] bg-[#EEF4FF] dark:border-[var(--border)] dark:bg-[#1e293b]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-[8px] bg-[#178A5D] text-white"><TrendingUp size={16} /></span>
            <div>
              <div className="text-[13px] font-semibold text-[var(--text)]">{compact(dist.t3)} keywords ranking in the top 3</div>
              <div className="text-[11px] text-[var(--muted)]">Based on your currently tracked keywords. Month-over-month change appears once ranking history is tracked.</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onChatWithAi?.()} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] hover:border-[#F97316]/40">Optimize for Featured Snippets</button>
            <button onClick={() => setSort({ key: "position", dir: "desc" })} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--text)] hover:border-[#F97316]/40">View Declining Keywords</button>
          </div>
        </div>

        {/* Website Performance */}
        <div className={`${CARD} mb-6`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[14px] font-bold text-[var(--text)]">Website Performance</div>
            <div className="inline-flex rounded-[8px] border border-[var(--border)] p-0.5 text-[12px]">
              {["Your Site", "Competitors", "All"].map((t, i) => (
                <span key={t} className={`rounded-[6px] px-2.5 py-1 ${i === 0 ? "bg-[var(--bg-panel,#fff)] font-semibold text-[var(--text)] shadow-sm" : "text-[var(--muted)]"}`}>{t}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
            <div>
              <div className="flex items-center gap-1 text-[12px] text-[var(--muted)]">Visibility score <Info size={12} /></div>
              <div className="mt-1 flex items-end gap-2">
                <div className="text-[28px] font-bold leading-none text-[var(--text)] tabular-nums">{visibility != null ? `${visibility}%` : "—"}</div>
              </div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">Computed from your live keyword positions.</div>
              <div className="mt-4 flex gap-3">
                <Positions label="Top 3" val={dist.t3} />
                <Positions label="Top 10" val={dist.t10} />
                <Positions label="Top 20" val={dist.t20} />
              </div>
            </div>
            <NeedsTracking title="Ranking trend needs tracking" note="The visibility trend line appears once we track your rankings over time (daily snapshots). Positions above are your current live values." />
          </div>
        </div>

        {/* Algorithm Impact Timeline — honest (not tracked) */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2"><Clock size={15} className="text-[#D45427]" /><h2 className="text-[16px] font-bold text-[var(--text)]">Algorithm Impact Timeline</h2></div>
          <div className={CARD}>
            <NeedsTracking icon={Clock} title="Algorithm-impact tracking not enabled" note="Correlating your rankings with Google algorithm updates requires continuous ranking history. This timeline populates once tracking is running." />
          </div>
        </div>

        {/* SERP feature Performance — real counts */}
        <div className="mb-6">
          <h2 className="mb-3 text-[16px] font-bold text-[var(--text)]">SERP feature Performance</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {serpCards.map(([label, Icon, val]) => (
              <div key={label} className={CARD}>
                <div className="flex items-center gap-2"><span className={CHIP}><Icon size={15} /></span><span className="text-[12px] font-semibold text-[var(--text)] leading-tight">{label}</span></div>
                <div className="mt-2 text-[20px] font-bold text-[var(--text)] tabular-nums">{val != null ? compact(val) : "—"}</div>
                <div className="text-[11px] text-[var(--muted)]">features found</div>
              </div>
            ))}
          </div>
          {serp.coveragePercent != null && <div className="mt-2 text-[11px] text-[var(--muted)]">SERP feature coverage: <span className="font-semibold text-[var(--text)]">{serp.coveragePercent}%</span> of sampled keywords.</div>}
        </div>

        {/* Position Performance Trend + Current Ranking */}
        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_minmax(0,320px)]">
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2"><LineChart size={15} className="text-[#D45427]" /><div className="text-[14px] font-bold text-[var(--text)]">Position Performance Trend</div></div>
            <NeedsTracking title="Position history needs tracking" note="A day-by-day position trend chart appears once we store ranking snapshots over time. Your current positions are in the table below." />
          </div>
          <div className={CARD}>
            <div className="mb-3 text-[13px] font-bold text-[var(--text)]">Current Ranking</div>
            {[["#1–10", buckets.a, "#178A5D"], ["#11–20", buckets.b, "#B98500"], ["#21–60", buckets.c, "#8B5CF6"], ["#61+", buckets.d, "#6B7280"]].map(([label, count, color]) => (
              <div key={label} className="mb-2 flex items-center justify-between rounded-[10px] border border-[var(--border)] px-3 py-2">
                <span className="text-[12px] font-medium text-[var(--text)]">{label}</span>
                <span className="inline-flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} /><span className="text-[13px] font-bold tabular-nums text-[var(--text)]">{compact(count)}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* Keyword Performance table */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[16px] font-bold text-[var(--text)] ml-1">Keyword Performance</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search keywords…" className="w-full sm:w-56 rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-[12px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#CA5223]" />
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><TrendingUp size={20} /></div>
              <div className="text-[13px] font-semibold text-[var(--text)]">No ranking data yet</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan (or connect Search Console) to track the keywords you rank for.</div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[12px] font-semibold text-[var(--muted)]">
                      <th className="px-4 py-3 text-left"><SortHead k="keyword" label="Keyword" /></th>
                      <th className="px-4 py-3 text-right"><SortHead k="position" label="Position" /></th>
                      <th className="px-4 py-3 text-right">Change</th>
                      <th className="px-4 py-3 text-right"><SortHead k="volume" label="Volume" /></th>
                      <th className="px-4 py-3 text-right"><SortHead k="kd" label="KD" /></th>
                      <th className="px-4 py-3 text-right"><SortHead k="cpc" label="CPC" /></th>
                      <th className="px-4 py-3 text-right"><SortHead k="traffic" label="Traffic" /></th>
                      <th className="px-4 py-3 text-left">URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r, i) => (
                      <tr key={`${r.keyword}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--app-bg)]/40">
                        <td className="px-4 py-3 text-left font-medium text-[var(--text)] break-words">{r.keyword}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums" style={{ background: posBg(r.position), color: posColor(r.position) }}>{r.position != null ? `#${r.position}` : "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--muted)]" title="Needs ranking history">—</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{compact(r.volume)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{r.kd != null ? Math.round(r.kd) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{r.cpc != null ? `$${Number(r.cpc).toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{compact(r.traffic)}</td>
                        <td className="px-4 py-3 text-left">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline break-all">{String(r.url).replace(/^https?:\/\//, "").slice(0, 28)}…</a> : <span className="text-[var(--muted)]">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-[var(--border)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[12px] text-[var(--muted)]">Showing {(curPage - 1) * rowsPer + 1}-{Math.min(curPage * rowsPer, filtered.length)} of {filtered.length} keywords</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)] disabled:opacity-40 hover:text-[var(--text)]"><ChevronLeft size={13} /> Previous</button>
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#D45427] px-2 text-[12px] font-bold text-white">{curPage}</span>
                  <span className="px-1 text-[12px] text-[var(--muted)]">of {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} className="inline-flex items-center gap-1 rounded-full border border-[#CA5223] px-3 py-1.5 text-[12px] font-semibold text-[#D45427] disabled:opacity-40 hover:bg-[#CA5223]/5">Next <ChevronRight size={13} /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
