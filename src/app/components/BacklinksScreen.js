"use client";

// BacklinksScreen — full "Backlinks" screen opened from the sidebar.
// Built on the dashboard's Figma design system (JUST Sans, #FFA615 chips, cream
// cards, 12px radius, 24px values, white badge pills, orange accents). All numbers
// are REAL — Domain Rating / Referring Domains / Total Backlinks / DoFollow-NoFollow
// come from the same SEO data the Off-Page cards use, and the referring-domains
// table is the live DataForSEO `backlinkDomains` list. No demo/placeholder data —
// empty inputs render an honest empty state.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Star, Link2, Share2, Sparkles, TrendingUp, TrendingDown,
  ChevronUp, ChevronDown, ExternalLink, ShieldCheck,
} from "lucide-react";

const HELP = (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className="text-[#9CA3AF] dark:text-[var(--muted)] shrink-0">
    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
  </svg>
);

// 3-bubble "referring domains" glyph (same as the dashboard Off-Page card).
function BubbleIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 14.5381 14.5381" fill="none" style={{ width: size, height: size }}>
      <path d="M1.81726 9.69207C1.81726 10.174 2.00873 10.6363 2.34953 10.9771C2.69033 11.3179 3.15256 11.5093 3.63453 11.5093C4.1165 11.5093 4.57872 11.3179 4.91953 10.9771C5.26033 10.6363 5.45179 10.174 5.45179 9.69207C5.45179 9.21011 5.26033 8.74788 4.91953 8.40707C4.57872 8.06627 4.1165 7.87481 3.63453 7.87481C3.15256 7.87481 2.69033 8.06627 2.34953 8.40707C2.00873 8.74788 1.81726 9.21011 1.81726 9.69207Z" fill="currentColor" stroke="currentColor" strokeWidth="1.21151" strokeLinejoin="round"/>
      <path d="M8.48057 11.5093C8.48057 11.8307 8.60821 12.1388 8.83541 12.366C9.06261 12.5932 9.37076 12.7208 9.69207 12.7208C10.0134 12.7208 10.3215 12.5932 10.5487 12.366C10.7759 12.1388 10.9036 11.8307 10.9036 11.5093C10.9036 11.188 10.7759 10.8799 10.5487 10.6527C10.3215 10.4255 10.0134 10.2978 9.69207 10.2978C9.37076 10.2978 9.06261 10.4255 8.83541 10.6527C8.60821 10.8799 8.48057 11.188 8.48057 11.5093Z" fill="currentColor" stroke="currentColor" strokeWidth="1.21151" strokeLinejoin="round"/>
      <path d="M6.05755 4.54316C6.05755 5.26611 6.34474 5.95945 6.85594 6.47066C7.36715 6.98186 8.06049 7.26906 8.78344 7.26906C9.5064 7.26906 10.1997 6.98186 10.7109 6.47066C11.2221 5.95945 11.5093 5.26611 11.5093 4.54316C11.5093 3.82021 11.2221 3.12687 10.7109 2.61566C10.1997 2.10446 9.5064 1.81726 8.78344 1.81726C8.06049 1.81726 7.36715 2.10446 6.85594 2.61566C6.34474 3.12687 6.05755 3.82021 6.05755 4.54316Z" fill="currentColor" stroke="currentColor" strokeWidth="1.21151" strokeLinejoin="round"/>
    </svg>
  );
}

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const fmtInt = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString());
const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const TITLE = "inline-flex items-center gap-1 text-[12px] font-semibold text-[#374151] dark:text-[var(--text)] leading-relaxed";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";
const badgePill = "inline-flex items-center gap-1.5 rounded-full border border-[#D1D5DB] dark:border-[var(--border)] bg-[#FCFCFC] dark:bg-[var(--card)] px-2 py-0.5 text-[11px] font-medium text-[#4B5563] dark:text-[var(--muted)]";

export default function BacklinksScreen({ data = {}, onBack, onChatWithAi }) {
  const {
    domain = "",
    domainRating = null,
    industryAvg = null,
    referringDomains = null,
    totalBacklinks = null,
    dofollowPct = null,
    nofollowPct = null,
    domains = [],
  } = data;

  const scope = domain ? `https://${domain}` : "—";

  // DR badge (same logic/threshold family as the dashboard Off-Page card).
  let drBadge = { label: "No Data", color: "#6B7280" };
  if (domainRating != null && industryAvg != null) {
    if (domainRating >= industryAvg * 1.2) drBadge = { label: "Above Average", color: "#178A5D" };
    else if (domainRating <= industryAvg * 0.8) drBadge = { label: "Below Average", color: "#DC2626" };
    else drBadge = { label: "Average", color: "#B98500" };
  } else if (domainRating != null) {
    drBadge = { label: domainRating >= 50 ? "Strong" : "Growing", color: domainRating >= 50 ? "#178A5D" : "#B98500" };
  }
  const rdBadge = referringDomains == null ? { label: "No Data", color: "#6B7280" }
    : referringDomains >= 1000 ? { label: "Strong", color: "#178A5D" }
    : referringDomains >= 100 ? { label: "Growing", color: "#178A5D" }
    : { label: "Building", color: "#B98500" };
  const tbBadge = totalBacklinks == null ? { label: "No Data", color: "#6B7280" }
    : (domainRating ?? 0) >= 50 ? { label: "Strong Profile", color: "#178A5D" }
    : (domainRating ?? 0) >= 25 ? { label: "Moderate", color: "#B98500" }
    : { label: "Developing", color: "#B98500" };

  // DoFollow / NoFollow — derive missing half if only one is present.
  let doPct = dofollowPct, noPct = nofollowPct;
  if (doPct != null && noPct == null) noPct = Math.max(0, 100 - doPct);
  if (noPct != null && doPct == null) doPct = Math.max(0, 100 - noPct);

  // ── Referring-domains table (real DataForSEO list) ──
  const rows = Array.isArray(domains) ? domains.filter((d) => d && d.domain) : [];
  const [sort, setSort] = useState({ key: "backlinks", dir: "desc" });
  const sorted = useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      let av = a[key], bv = b[key];
      if (key === "domain") { av = String(av || ""); bv = String(bv || ""); return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av); }
      av = Number(av) || 0; bv = Number(bv) || 0;
      return dir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sort]);
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "domain" ? "asc" : "desc" }));

  const cols = [
    ["domain", "Referring Domain", "left"],
    ["backlinks", "Backlinks", "right"],
    ["rank", "Domain Rank", "right"],
    ["referring_pages", "Ref. Pages", "right"],
    ["backlinks_spam_score", "Spam Score", "right"],
    ["first_seen", "First Seen", "right"],
  ];

  const SortHead = ({ k, label, align }) => (
    <button type="button" onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${sort.key === k ? "text-[var(--text)]" : ""} ${align === "right" ? "justify-end w-full" : ""}`}>
      {label}
      {sort.key === k ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="opacity-40">↑↓</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      {/* Upper bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Backlinks</div>
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
        {/* Overview KPI cards */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Backlink Overview</h2>
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Domain Rating */}
          <div className={CARD}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={CHIP}><Star size={16} /></span>
                <span className={TITLE}>Domain Rating {HELP}</span>
              </div>
              <span className={badgePill}><span className="inline-block h-2 w-2 rounded-full" style={{ background: drBadge.color }} />{drBadge.label}</span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className={VALUE}>{domainRating != null ? Number(domainRating).toFixed(1) : "—"}</div>
              {domainRating != null && <div className="pb-0.5 text-[11px] text-[var(--muted)]">/ 100</div>}
            </div>
            <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-3">
              <div className="text-[12px] text-[var(--muted)]">Authority</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-2 rounded-full bg-[#1CC88A]" style={{ width: `${Math.max(0, Math.min(100, Number(domainRating) || 0))}%` }} />
              </div>
            </div>
          </div>

          {/* Referring Domains */}
          <div className={CARD}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={CHIP}><BubbleIcon /></span>
                <span className={TITLE}>Referring Domains {HELP}</span>
              </div>
              <span className={badgePill}><span className="inline-block h-2 w-2 rounded-full" style={{ background: rdBadge.color }} />{rdBadge.label}</span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className={VALUE}>{compact(referringDomains)}</div>
            </div>
            <div className="mt-3 text-[11px] text-[var(--muted)]">Unique websites linking to you.</div>
          </div>

          {/* Total Backlinks */}
          <div className={CARD}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={CHIP}><Link2 size={16} /></span>
                <span className={TITLE}>Total Backlinks {HELP}</span>
              </div>
              <span className={badgePill}><span className="inline-block h-2 w-2 rounded-full" style={{ background: tbBadge.color }} />{tbBadge.label}</span>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className={VALUE}>{compact(totalBacklinks)}</div>
            </div>
            <div className="mt-3 text-[11px] text-[var(--muted)]">All inbound links found.</div>
          </div>

          {/* DoFollow / NoFollow */}
          <div className={CARD}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className={CHIP}><ShieldCheck size={16} /></span>
                <span className={TITLE}>Link Type {HELP}</span>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="rounded-[10px] border-l-4 border-[#58CEA7] bg-[var(--card)] px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--muted)]">DoFollow</span>
                  <span className="text-[15px] font-semibold text-[var(--text)] tabular-nums">{doPct != null ? `${Math.round(doPct)}%` : "—"}</span>
                </div>
                <div className="text-[10px] text-[var(--muted)]">Links that give SEO credit</div>
              </div>
              <div className="rounded-[10px] border-l-4 border-[#EA617F] bg-[var(--card)] px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--muted)]">NoFollow</span>
                  <span className="text-[15px] font-semibold text-[var(--text)] tabular-nums">{noPct != null ? `${Math.round(noPct)}%` : "—"}</span>
                </div>
                <div className="text-[10px] text-[var(--muted)]">Links that just mention, no SEO value</div>
              </div>
            </div>
          </div>
        </section>

        {/* Referring domains table */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-[var(--text)] ml-1">Referring Domains</h2>
          <span className="text-[12px] text-[var(--muted)]">{rows.length ? `${rows.length} shown` : ""}</span>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Link2 size={20} /></div>
              <div className="text-[13px] font-semibold text-[var(--text)]">No referring-domain details yet</div>
              <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan (or connect your data) to see the sites linking to you here.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[12px] font-semibold text-[var(--muted)]">
                    {cols.map(([k, label, align]) => (
                      <th key={k} className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} whitespace-nowrap`}>
                        <SortHead k={k} label={label} align={align} />
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d, i) => {
                    const spam = Number(d.backlinks_spam_score);
                    const spamColor = !Number.isFinite(spam) ? "var(--muted)" : spam >= 30 ? "#DC2626" : spam >= 10 ? "#B98500" : "#178A5D";
                    return (
                      <tr key={`${d.domain}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--app-bg)]/40 transition-colors">
                        <td className="px-4 py-3 text-left">
                          <span className="font-medium text-[var(--text)] break-all">{d.domain}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--text)]">{fmtInt(d.backlinks)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{d.rank != null ? Math.round(d.rank) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{fmtInt(d.referring_pages)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: spamColor }}>{Number.isFinite(spam) ? `${spam}%` : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)] whitespace-nowrap">{fmtDate(d.first_seen)}</td>
                        <td className="px-4 py-3 text-right">
                          <a href={`https://${String(d.domain).replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#CA5223] bg-[#F5F4F2] dark:bg-[var(--input)] text-[#CA5223] hover:bg-[#CA5223]/10 transition" title="Open domain">
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
