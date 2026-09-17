"use client";

// KeywordResearchScreen — full "Keyword Research" screen matched to Figma flow
// node 22:28111 (Discovery tab): top tab bar, 4 KPI cards, Quick Action panel,
// 5 filters, and a Keywords Overview table (checkbox, keyword, volume, KD,
// position, opportunity, intent, edit/chart actions) + pagination. Real data only:
// keyword universe from DataForSEO (topKeywords/seoRows) + live ranked positions
// (rankedKeywords). Opportunity is derived from real volume/KD/position. Empty
// input → honest empty state.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, Search, LayoutGrid, LineChart as LineChartIcon, GitCompare,
  TrendingUp, Type, Target, Trophy, Zap, FileQuestion,
  MapPin, Flame, ChevronUp, ChevronDown, PencilLine, Activity, ChevronLeft, ChevronRight,
} from "lucide-react";

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const intentOf = (t) => {
  const s = String(t || "").toLowerCase();
  if (s.startsWith("trans") || s === "commercial" || s === "transactional") return "Commercial";
  if (s.startsWith("info") || s === "informational") return "Informational";
  if (s.startsWith("nav")) return "Navigational";
  if (s.startsWith("local")) return "Local";
  return "Informational";
};
const intentColor = (i) => ({
  Commercial: { bg: "#EAF4FF", fg: "#3B82F6" },
  Transactional: { bg: "#FFF0F4", fg: "#D12C2C" },
  Informational: { bg: "#F5EAFE", fg: "#8B5CF6" },
  Navigational: { bg: "#EAF8F1", fg: "#178A5D" },
  Local: { bg: "#FFF5D9", fg: "#B98500" },
}[i] || { bg: "#F5EAFE", fg: "#8B5CF6" });
const kdColor = (d) => (d == null ? "#9CA3AF" : d >= 70 ? "#D12C2C" : d >= 40 ? "#B98500" : "#178A5D");

// Real opportunity score from real signals: easier (low KD) + more volume +
// not-yet-top-ranked = higher opportunity. 0–100.
const oppScore = (volume, kd, position) => {
  const kdPart = kd != null ? (1 - kd / 100) * 55 : 30;
  const volPart = volume != null ? Math.min(1, Math.log10(Math.max(1, volume)) / 4.3) * 30 : 10;
  const posPart = position == null ? 12 : position > 20 ? 15 : position > 10 ? 12 : position > 3 ? 7 : 3;
  return Math.max(0, Math.min(100, Math.round(kdPart + volPart + posPart)));
};

const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const TITLE = "text-[12px] font-semibold text-[#374151] dark:text-[var(--text)] leading-relaxed";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";
const SELECT = "w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[12px] text-[var(--text)] focus:outline-none focus:border-[#CA5223]";

const TABS = [
  ["Discovery", LayoutGrid],
  ["Analyzer", LineChartIcon],
  ["Gap Analysis", GitCompare],
  ["Rank Tracker", TrendingUp],
  ["Long-Tail", Type],
];
const QUICK = [
  ["Discover Keywords", Search],
  ["Analyse Competitor", LineChartIcon],
  ["Question Keywords", FileQuestion],
  ["Long-Tail Generator", Type],
  ["Local Variants", MapPin],
  ["Trending Terms", Flame],
];

export default function KeywordResearchScreen({ data = {}, onBack, onChatWithAi, onGenerate, onQuickAction }) {
  const { domain = "", keywords = [], ranked = [] } = data;
  const scope = domain ? `https://${domain}` : "—";
  const [tab, setTab] = useState("Discovery");

  const rows = useMemo(() => {
    const posByKw = new Map();
    (Array.isArray(ranked) ? ranked : []).forEach((r) => {
      const k = String(r?.keyword || "").toLowerCase();
      if (k && r?.position != null) posByKw.set(k, Number(r.position));
    });
    const seen = new Set();
    const out = [];
    (Array.isArray(keywords) ? keywords : []).forEach((r) => {
      const kw = String(r?.keyword || "").trim();
      if (!kw || seen.has(kw.toLowerCase())) return;
      seen.add(kw.toLowerCase());
      const vol = r?.searchVolume ?? r?.volume ?? null;
      const diffRaw = r?.difficulty ?? r?.seoDifficulty ?? null;
      const kd = diffRaw != null && Number.isFinite(Number(diffRaw)) ? Math.round(Number(diffRaw)) : null;
      const position = posByKw.get(kw.toLowerCase()) ?? null;
      out.push({
        keyword: kw, intent: intentOf(r?.type),
        volume: vol != null ? Number(vol) : null, kd, position,
        opportunity: oppScore(vol != null ? Number(vol) : null, kd, position),
      });
    });
    return out;
  }, [keywords, ranked]);

  // KPI summary (real)
  const kpis = useMemo(() => {
    const positions = rows.map((r) => r.position).filter((p) => Number.isFinite(p));
    const top3 = rows.filter((r) => r.position != null && r.position <= 3).length;
    const avg = positions.length ? (positions.reduce((s, p) => s + p, 0) / positions.length) : null;
    const quickWins = rows.filter((r) => r.opportunity >= 70).length;
    return { total: rows.length, top3, avg, quickWins };
  }, [rows]);

  // Filters
  const [q, setQ] = useState("");
  const [vol, setVol] = useState("all");
  const [kdRange, setKdRange] = useState("all");
  const [posRange, setPosRange] = useState("all");
  const [intent, setIntent] = useState("all");
  const [sort, setSort] = useState({ key: "opportunity", dir: "desc" });
  const [page, setPage] = useState(1);
  const [rowsPer, setRowsPer] = useState(5);

  const filtered = useMemo(() => {
    let arr = rows;
    if (q.trim()) { const s = q.trim().toLowerCase(); arr = arr.filter((r) => r.keyword.toLowerCase().includes(s)); }
    if (vol !== "all") arr = arr.filter((r) => r.volume != null && (vol === "hi" ? r.volume >= 10000 : vol === "mid" ? r.volume >= 1000 && r.volume < 10000 : r.volume < 1000));
    if (kdRange !== "all") arr = arr.filter((r) => r.kd != null && (kdRange === "easy" ? r.kd < 40 : kdRange === "med" ? r.kd >= 40 && r.kd < 70 : r.kd >= 70));
    if (posRange !== "all") arr = arr.filter((r) => r.position != null && (posRange === "top3" ? r.position <= 3 : posRange === "top10" ? r.position <= 10 : r.position > 10));
    if (intent !== "all") arr = arr.filter((r) => r.intent.toLowerCase() === intent);
    const { key, dir } = sort;
    arr = [...arr].sort((a, b) => {
      if (key === "keyword") return dir === "asc" ? a.keyword.localeCompare(b.keyword) : b.keyword.localeCompare(a.keyword);
      let av = a[key] == null ? -1 : Number(a[key]); let bv = b[key] == null ? -1 : Number(b[key]);
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, q, vol, kdRange, posRange, intent, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPer));
  const curPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((curPage - 1) * rowsPer, curPage * rowsPer);
  const toggleSort = (key) => { setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "keyword" ? "asc" : "desc" })); setPage(1); };
  const SortHead = ({ k, label, align = "left" }) => (
    <button type="button" onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${sort.key === k ? "text-[var(--text)]" : ""}`}>
      {label}{sort.key === k ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="opacity-40">↑↓</span>}
    </button>
  );

  const KpiCard = ({ Icon, title, value, badge, badgeType }) => (
    <div className={CARD}>
      <div className="flex items-center gap-2"><span className={CHIP}><Icon size={16} /></span><span className={TITLE}>{title}</span></div>
      <div className="mt-2 text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums">{value}</div>
      {badge && (
        <div className="mt-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeType === "green" ? "border border-[#9FE3CD] bg-[#EAF8F1] text-[#0D9467]" : badgeType === "amber" ? "bg-[#FFF5D9] text-[#B98500]" : "bg-[#EAF4FF] text-[#3B82F6]"}`}>
            {badgeType === "green" && <TrendingUp size={11} />}{badge}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft size={16} /> Back</button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Keyword Research</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Chat with Ai <Sparkles size={14} /></button>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-1.5">
          {TABS.map(([label, Icon]) => (
            <button key={label} onClick={() => setTab(label)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-medium transition ${tab === label ? "bg-[var(--bg-panel,#fff)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab !== "Discovery" ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><LayoutGrid size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">{tab}</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">Switch to <button onClick={() => setTab("Discovery")} className="font-semibold text-[#D45427] underline">Discovery</button> for the live keyword universe. This sub-view is part of the Keyword Research toolset.</div>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard Icon={Target} title="Total Keywords" value={compact(kpis.total)} badge={`${compact(kpis.total)} tracked`} badgeType="blue" />
              <KpiCard Icon={Trophy} title="Top-3 Rankings" value={compact(kpis.top3)} badge={kpis.top3 ? "Ranking" : "None yet"} badgeType="green" />
              <KpiCard Icon={Activity} title="Avg Position" value={kpis.avg != null ? kpis.avg.toFixed(1) : "—"} badge={kpis.avg != null ? "Live" : "No data"} badgeType="amber" />
              <KpiCard Icon={Zap} title="Quick Wins" value={compact(kpis.quickWins)} badge="Opportunity 70+" badgeType="amber" />
            </section>

            {/* Quick Action */}
            <div className={`${CARD} mb-6`}>
              <div className="flex items-center gap-2"><PencilLine size={15} className="text-[#D45427]" /><span className="text-[13px] font-semibold text-[var(--text)]">Quick Action</span></div>
              <div className="text-[11px] text-[var(--muted)]">Quick templates to manage bulk actions.</div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {QUICK.map(([label, Icon]) => (
                  <button key={label} onClick={() => onQuickAction?.(label)}
                    className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-2 py-4 text-center hover:border-[#F97316]/40 hover:shadow-md transition">
                    <Icon size={20} className="text-[#D45427]" />
                    <span className="text-[12px] font-semibold text-[var(--text)] leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-[12px] text-[var(--muted)]">Search Keyword</label>
                <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search Keyword" className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-3 text-[12px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#CA5223]" /></div>
              </div>
              <div><label className="mb-1 block text-[12px] text-[var(--muted)]">Volume</label>
                <select value={vol} onChange={(e) => { setVol(e.target.value); setPage(1); }} className={SELECT}><option value="all">All Volume</option><option value="hi">10k+</option><option value="mid">1k–10k</option><option value="lo">&lt; 1k</option></select></div>
              <div><label className="mb-1 block text-[12px] text-[var(--muted)]">KD Range</label>
                <select value={kdRange} onChange={(e) => { setKdRange(e.target.value); setPage(1); }} className={SELECT}><option value="all">All Range</option><option value="easy">Easy (&lt;40)</option><option value="med">Medium (40–70)</option><option value="hard">Hard (70+)</option></select></div>
              <div><label className="mb-1 block text-[12px] text-[var(--muted)]">Position</label>
                <select value={posRange} onChange={(e) => { setPosRange(e.target.value); setPage(1); }} className={SELECT}><option value="all">All Position</option><option value="top3">Top 3</option><option value="top10">Top 10</option><option value="beyond">11+</option></select></div>
              <div><label className="mb-1 block text-[12px] text-[var(--muted)]">Search Intent</label>
                <select value={intent} onChange={(e) => { setIntent(e.target.value); setPage(1); }} className={SELECT}><option value="all">All Intent</option><option value="commercial">Commercial</option><option value="informational">Informational</option><option value="navigational">Navigational</option><option value="local">Local</option></select></div>
            </div>

            {/* Keywords Overview */}
            <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
              <div className="px-5 pt-4"><div className="text-[15px] font-bold text-[var(--text)]">Keywords Overview</div><div className="text-[11px] text-[var(--muted)]">Live keyword universe for your domain.</div></div>
              {rows.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Search size={20} /></div>
                  <div className="text-[13px] font-semibold text-[var(--text)]">No keyword data yet</div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan (or connect Search Console) to see your keyword universe with volume, difficulty and opportunity.</div>
                </div>
              ) : (
                <>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-y border-[var(--border)] text-[12px] font-semibold text-[var(--muted)]">
                          <th className="w-10 px-4 py-3"><input type="checkbox" disabled className="accent-[#D45427]" /></th>
                          <th className="px-4 py-3 text-left"><SortHead k="keyword" label="Keyword" /></th>
                          <th className="px-4 py-3 text-left"><SortHead k="volume" label="Volume" /></th>
                          <th className="px-4 py-3 text-left"><SortHead k="kd" label="KD" /></th>
                          <th className="px-4 py-3 text-left"><SortHead k="position" label="Position" /></th>
                          <th className="px-4 py-3 text-left"><SortHead k="opportunity" label="Opportunity" /></th>
                          <th className="px-4 py-3 text-left">Intent</th>
                          <th className="px-4 py-3 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r, i) => {
                          const ic = intentColor(r.intent);
                          return (
                            <tr key={`${r.keyword}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--app-bg)]/40 transition-colors">
                              <td className="px-4 py-3"><input type="checkbox" className="accent-[#D45427]" /></td>
                              <td className="px-4 py-3"><span className="font-semibold text-[var(--text)] break-words">{r.keyword}</span></td>
                              <td className="px-4 py-3 tabular-nums text-[var(--text)]">{compact(r.volume)}</td>
                              <td className="px-4 py-3 tabular-nums font-medium" style={{ color: kdColor(r.kd) }}>{r.kd != null ? r.kd : "—"}</td>
                              <td className="px-4 py-3 tabular-nums text-[var(--muted)]">{r.position != null ? r.position : "—"}</td>
                              <td className="px-4 py-3 tabular-nums font-semibold text-[var(--text)]">{r.opportunity}</td>
                              <td className="px-4 py-3"><span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: ic.bg, color: ic.fg }}>{r.intent}</span></td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 text-[var(--muted)]">
                                  <button onClick={() => onGenerate?.(r.keyword)} title="Generate content" className="hover:text-[#D45427] transition"><PencilLine size={16} /></button>
                                  <button title="View trend" className="hover:text-[#D45427] transition"><Activity size={16} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  <div className="flex flex-col gap-3 border-t border-[var(--border)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 text-[12px] text-[var(--muted)]">
                      <select value={rowsPer} onChange={(e) => { setRowsPer(Number(e.target.value)); setPage(1); }} className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[12px] text-[var(--text)] focus:outline-none">
                        {[5, 10, 25].map((n) => <option key={n} value={n}>Rows - {n}</option>)}
                      </select>
                      <span>Showing {(curPage - 1) * rowsPer + 1}-{Math.min(curPage * rowsPer, filtered.length)} of {filtered.length} keywords</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--muted)] disabled:opacity-40 hover:text-[var(--text)] transition"><ChevronLeft size={13} /> Previous</button>
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#D45427] px-2 text-[12px] font-bold text-white">{curPage}</span>
                      <span className="px-1 text-[12px] text-[var(--muted)]">of {totalPages}</span>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} className="inline-flex items-center gap-1 rounded-full border border-[#CA5223] px-3 py-1.5 text-[12px] font-semibold text-[#D45427] disabled:opacity-40 hover:bg-[#CA5223]/5 transition">Next <ChevronRight size={13} /></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
