"use client";

// CompAnalysisScreen — full "Competitor Analysis" screen opened from the sidebar.
// Built on the dashboard's Figma design system. All numbers are REAL — the client's
// Domain Rating / Organic Keywords / Organic Traffic come from the same SEO fields
// the dashboard uses, and the competitor rows are the live DataForSEO
// `competitorDomains` list. No demo data — empty input renders an honest empty state.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, Users, KeyRound, TrendingUp, Gauge,
  ChevronUp, ChevronDown, ExternalLink,
} from "lucide-react";

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const norm = (d) => String(d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase();

const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const TITLE = "inline-flex items-center gap-1 text-[12px] font-semibold text-[#374151] dark:text-[var(--text)] leading-relaxed";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";

export default function CompAnalysisScreen({ data = {}, onBack, onChatWithAi }) {
  const {
    domain = "",
    clientDR = null,
    clientKeywords = null,
    clientTraffic = null,
    competitors = [],
  } = data;

  const scope = domain ? `https://${domain}` : "—";
  const clientNorm = norm(domain);

  // Real competitor rows (dedupe, drop the client itself).
  const comps = useMemo(() => {
    const seen = new Set([clientNorm]);
    const out = [];
    (Array.isArray(competitors) ? competitors : []).forEach((c) => {
      const dm = norm(c?.domain);
      if (!dm || seen.has(dm)) return;
      seen.add(dm);
      out.push({
        domain: dm,
        rank: c?.rank != null ? Number(c.rank) : null,
        organicKeywords: c?.organicKeywords != null ? Number(c.organicKeywords) : null,
        organicTraffic: (c?.organicTraffic ?? c?.etv) != null ? Number(c?.organicTraffic ?? c?.etv) : null,
      });
    });
    return out;
  }, [competitors, clientNorm]);

  // Competitor averages for the "you vs them" comparison.
  const avg = useMemo(() => {
    const a = (k) => {
      const vals = comps.map((c) => c[k]).filter((v) => Number.isFinite(v));
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    return { rank: a("rank"), organicKeywords: a("organicKeywords"), organicTraffic: a("organicTraffic") };
  }, [comps]);

  const cmpBadge = (mine, theirs, higherIsBetter = true) => {
    if (mine == null || theirs == null || theirs === 0) return null;
    const up = higherIsBetter ? mine >= theirs : mine <= theirs;
    const diff = Math.abs(((mine - theirs) / theirs) * 100);
    return { up, text: `${up ? "Ahead" : "Behind"} · ${diff.toFixed(0)}%` };
  };

  // Combined, ranked table (client + competitors), client pinned/highlighted.
  const [sort, setSort] = useState({ key: "organicTraffic", dir: "desc" });
  const allRows = useMemo(() => {
    const rows = [
      { domain: clientNorm || domain || "your site", rank: clientDR, organicKeywords: clientKeywords, organicTraffic: clientTraffic, isClient: true },
      ...comps.map((c) => ({ ...c, isClient: false })),
    ];
    const { key, dir } = sort;
    rows.sort((a, b) => {
      if (a.isClient) return -1; if (b.isClient) return 1; // client always first
      let av = Number(a[key]) || 0, bv = Number(b[key]) || 0;
      return dir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [comps, clientNorm, domain, clientDR, clientKeywords, clientTraffic, sort]);
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const cols = [
    ["rank", "Domain Rank"],
    ["organicKeywords", "Organic Keywords"],
    ["organicTraffic", "Organic Traffic"],
  ];
  const SortHead = ({ k, label }) => (
    <button type="button" onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 justify-end w-full hover:text-[var(--text)] transition-colors ${sort.key === k ? "text-[var(--text)]" : ""}`}>
      {label}{sort.key === k ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="opacity-40">↑↓</span>}
    </button>
  );

  const StatCard = ({ Icon, title, value, suffix, cmp }) => (
    <div className={CARD}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={CHIP}><Icon size={16} /></span>
          <span className={TITLE}>{title}</span>
        </div>
        {cmp && (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cmp.up ? "border-[#9FE3CD] bg-[#EAF8F1] text-[#0D9467]" : "border-[#FCA5A5] bg-[#FEF2F2] text-[#EF4444]"}`}>
            {cmp.up ? <TrendingUp size={12} /> : <ChevronDown size={12} />}{cmp.text}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className={VALUE}>{value}</div>
        {suffix && value !== "—" && <div className="pb-0.5 text-[11px] text-[var(--muted)]">{suffix}</div>}
      </div>
      <div className="mt-3 text-[11px] text-[var(--muted)]">
        {cmp ? `vs competitor avg` : "your site"}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      {/* Upper bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Competitor Analysis</div>
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
        {/* You vs competitors */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">You vs Competitors</h2>
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard Icon={Gauge} title="Domain Rank" value={clientDR != null ? Number(clientDR).toFixed(1) : "—"} suffix="/ 100" cmp={cmpBadge(clientDR, avg.rank)} />
          <StatCard Icon={KeyRound} title="Organic Keywords" value={compact(clientKeywords)} cmp={cmpBadge(clientKeywords, avg.organicKeywords)} />
          <StatCard Icon={TrendingUp} title="Organic Traffic" value={compact(clientTraffic)} cmp={cmpBadge(clientTraffic, avg.organicTraffic)} />
        </section>

        {/* Comparison table */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-[var(--text)] ml-1">Competitor Comparison</h2>
          <span className="text-[12px] text-[var(--muted)]">{comps.length ? `${comps.length} competitors` : ""}</span>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          {comps.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Users size={20} /></div>
              <div className="text-[13px] font-semibold text-[var(--text)]">No competitor data yet</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan (or connect your data) to see how you stack up against organic competitors.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[12px] font-semibold text-[var(--muted)]">
                    <th className="px-4 py-3 text-left whitespace-nowrap">Domain</th>
                    {cols.map(([k, label]) => (
                      <th key={k} className="px-4 py-3 text-right whitespace-nowrap"><SortHead k={k} label={label} /></th>
                    ))}
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r, i) => (
                    <tr key={`${r.domain}-${i}`} className={`border-b border-[var(--border)] last:border-0 transition-colors ${r.isClient ? "bg-[#FFF7ED] dark:bg-[#F97316]/10" : "hover:bg-[var(--app-bg)]/40"}`}>
                      <td className="px-4 py-3 text-left">
                        <span className={`break-all ${r.isClient ? "font-bold text-[#D45427]" : "font-medium text-[var(--text)]"}`}>{r.domain}</span>
                        {r.isClient && <span className="ml-2 rounded-full bg-[#D45427] px-2 py-0.5 text-[10px] font-bold text-white align-middle">You</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{r.rank != null ? Math.round(r.rank) : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{compact(r.organicKeywords)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{compact(r.organicTraffic)}</td>
                      <td className="px-4 py-3 text-right">
                        {!r.isClient && (
                          <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#CA5223] bg-[#F5F4F2] dark:bg-[var(--input)] text-[#CA5223] hover:bg-[#CA5223]/10 transition" title="Open domain">
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
