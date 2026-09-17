"use client";

// KeywordResearchScreen — full "Keyword Research" screen (Figma flow 25-30236),
// built on the dashboard's Figma design system. Real data only: the keyword
// universe comes from DataForSEO (keywords_for_site → topKeywords / seoRows) with
// live ranked positions merged in from rankedKeywords. Filters, sort, and a
// "Generate" action (opens the Content Editor). Empty input → honest empty state.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, KeyRound, TrendingUp, Gauge, Search,
  ChevronUp, ChevronDown, PencilLine,
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
  if (s.startsWith("trans") || s === "commercial" || s === "transactional") return "Transactional";
  if (s.startsWith("info") || s === "informational") return "Informational";
  if (s.startsWith("nav")) return "Navigational";
  if (s.startsWith("local")) return "Local";
  return "Informational";
};
const intentColor = (i) => ({
  Transactional: { bg: "#FFF0F4", fg: "#D12C2C", dot: "#D12C2C" },
  Informational: { bg: "#EAF8F1", fg: "#178A5D", dot: "#178A5D" },
  Navigational: { bg: "#EAF4FF", fg: "#3B82F6", dot: "#3B82F6" },
  Local: { bg: "#FFF5D9", fg: "#B98500", dot: "#B98500" },
}[i] || { bg: "#EAF8F1", fg: "#178A5D", dot: "#178A5D" });
const diffColor = (d) => (d == null ? "#9CA3AF" : d >= 70 ? "#D12C2C" : d >= 40 ? "#B98500" : "#178A5D");

const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const TITLE = "inline-flex items-center gap-1 text-[12px] font-semibold text-[#374151] dark:text-[var(--text)] leading-relaxed";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";

export default function KeywordResearchScreen({ data = {}, onBack, onChatWithAi, onGenerate }) {
  const { domain = "", keywords = [], ranked = [] } = data;
  const scope = domain ? `https://${domain}` : "—";

  // Normalise + merge ranked positions by keyword.
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
      const diff = diffRaw != null && Number.isFinite(Number(diffRaw)) ? Math.round(Number(diffRaw)) : null;
      out.push({
        keyword: kw,
        intent: intentOf(r?.type),
        volume: vol != null ? Number(vol) : null,
        difficulty: diff,
        position: posByKw.get(kw.toLowerCase()) ?? null,
      });
    });
    return out;
  }, [keywords, ranked]);

  const [q, setQ] = useState("");
  const [intent, setIntent] = useState("All");
  const [sort, setSort] = useState({ key: "volume", dir: "desc" });

  const filtered = useMemo(() => {
    let arr = rows;
    if (q.trim()) { const s = q.trim().toLowerCase(); arr = arr.filter((r) => r.keyword.toLowerCase().includes(s)); }
    if (intent !== "All") arr = arr.filter((r) => r.intent === intent);
    const { key, dir } = sort;
    arr = [...arr].sort((a, b) => {
      if (key === "keyword") return dir === "asc" ? a.keyword.localeCompare(b.keyword) : b.keyword.localeCompare(a.keyword);
      let av = a[key], bv = b[key];
      av = av == null ? -1 : Number(av); bv = bv == null ? -1 : Number(bv);
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, q, intent, sort]);

  const totalVolume = useMemo(() => rows.reduce((s, r) => s + (Number(r.volume) || 0), 0), [rows]);
  const avgDiff = useMemo(() => {
    const ds = rows.map((r) => r.difficulty).filter((d) => Number.isFinite(d));
    return ds.length ? Math.round(ds.reduce((s, d) => s + d, 0) / ds.length) : null;
  }, [rows]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "keyword" ? "asc" : "desc" }));
  const SortHead = ({ k, label, align = "right" }) => (
    <button type="button" onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${sort.key === k ? "text-[var(--text)]" : ""} ${align === "right" ? "justify-end w-full" : ""}`}>
      {label}{sort.key === k ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="opacity-40">↑↓</span>}
    </button>
  );

  const StatCard = ({ Icon, title, value, suffix, sub }) => (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <span className={CHIP}><Icon size={16} /></span>
        <span className={TITLE}>{title}</span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className={VALUE}>{value}</div>
        {suffix && value !== "—" && <div className="pb-0.5 text-[11px] text-[var(--muted)]">{suffix}</div>}
      </div>
      {sub && <div className="mt-3 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Keyword Research</div>
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
        {/* Summary */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Keyword Overview</h2>
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard Icon={KeyRound} title="Total Keywords" value={compact(rows.length)} sub="In your keyword universe" />
          <StatCard Icon={TrendingUp} title="Total Search Volume" value={compact(totalVolume)} suffix="/mo" sub="Combined monthly searches" />
          <StatCard Icon={Gauge} title="Avg Difficulty" value={avgDiff != null ? String(avgDiff) : "—"} suffix="/ 100" sub="Mean SEO difficulty" />
        </section>

        {/* Controls */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[16px] font-bold text-[var(--text)] ml-1">Keywords</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search keywords…"
                className="w-full sm:w-56 rounded-full border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-3 text-[12px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#CA5223]" />
            </div>
            <select value={intent} onChange={(e) => setIntent(e.target.value)}
              className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] text-[var(--text)] focus:outline-none focus:border-[#CA5223]">
              {["All", "Transactional", "Informational", "Navigational", "Local"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><KeyRound size={20} /></div>
              <div className="text-[13px] font-semibold text-[var(--text)]">No keyword data yet</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan (or connect Search Console) to see your keyword universe with volume and difficulty here.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[12px] font-semibold text-[var(--muted)]">
                    <th className="px-4 py-3 text-left whitespace-nowrap"><SortHead k="keyword" label="Keyword" align="left" /></th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Intent</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap"><SortHead k="volume" label="Volume" /></th>
                    <th className="px-4 py-3 text-right whitespace-nowrap"><SortHead k="difficulty" label="Difficulty" /></th>
                    <th className="px-4 py-3 text-right whitespace-nowrap"><SortHead k="position" label="Position" /></th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const ic = intentColor(r.intent);
                    return (
                      <tr key={`${r.keyword}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--app-bg)]/40 transition-colors">
                        <td className="px-4 py-3 text-left"><span className="font-medium text-[var(--text)] break-words">{r.keyword}</span></td>
                        <td className="px-4 py-3 text-left">
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: ic.bg, color: ic.fg }}>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ic.dot }} />{r.intent}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{compact(r.volume)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]">
                              <div className="h-1.5 rounded-full" style={{ width: `${r.difficulty ?? 0}%`, background: diffColor(r.difficulty) }} />
                            </div>
                            <span className="tabular-nums text-[12px] font-medium" style={{ color: diffColor(r.difficulty) }}>{r.difficulty != null ? `${r.difficulty}%` : "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{r.position != null ? `#${r.position}` : "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => onGenerate?.(r.keyword)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#CA5223] bg-[#F5F4F2] dark:bg-[var(--input)] px-3 py-1 text-[11px] font-semibold text-[#D45427] hover:bg-[#CA5223]/10 transition whitespace-nowrap">
                            <PencilLine size={12} /> Generate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="px-6 py-8 text-center text-[12px] text-[var(--muted)]">No keywords match your filters.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
