"use client";

// CroScreen — matched to Figma flow node 14:24418 ("UX Conversion Rate
// Optimization feature"). LAYOUT faithful: tabs, Connect-Microsoft-Clarity banner,
// 4 KPI cards, Core Web Vitals Correlation, User Behaviour & AI Insights (heatmap)
// + Top-3 Engagement Drivers, Performance Trend, Conversion Detail, CRO
// Recommendations. DATA POLICY (Paras's call): real where the app has it —
// Conversion Rate (real leads ÷ organic traffic), Core Web Vitals (real LCP/INP/
// CLS), leads/goal/lead-sources (GA4); honest "connect Microsoft Clarity / needs
// analysis" states for behavioral heatmap / behavior score / engagement drivers /
// AI recommendations the app does not collect. No fake numbers.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, LayoutGrid, Activity, Video, Lightbulb, Zap, Target,
  MousePointerClick, Gauge, CheckCircle2, Info, FileText, Mail, Goal, Users, TrendingDown,
} from "lucide-react";

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm";
const TITLE = "text-[12px] font-semibold text-[#374151] dark:text-[var(--text)]";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";

export default function CroScreen({ data = {}, onBack, onChatWithAi, onConnect }) {
  const { domain = "", leads = null, traffic = null, lcp = null, inp = null, cls = null } = data;
  const scope = domain ? `https://${domain}` : "—";
  const [tab, setTab] = useState("Overview");

  const monthly = leads?.monthly ?? null;
  const goal = leads?.goal ?? null;
  const contactForm = leads?.contactForm ?? null;
  const newsletter = leads?.newsletter ?? null;
  const hasLeads = monthly != null || contactForm != null || newsletter != null;

  const convRate = useMemo(() => (monthly != null && traffic != null && Number(traffic) > 0 ? (Number(monthly) / Number(traffic)) * 100 : null), [monthly, traffic]);
  const goalPct = useMemo(() => (monthly != null && goal != null && Number(goal) > 0 ? Math.max(0, Math.min(100, (Number(monthly) / Number(goal)) * 100)) : null), [monthly, goal]);
  const totalSrc = (Number(contactForm) || 0) + (Number(newsletter) || 0);
  const cfPct = totalSrc > 0 ? Math.round(((Number(contactForm) || 0) / totalSrc) * 100) : null;
  const nlPct = totalSrc > 0 ? Math.round(((Number(newsletter) || 0) / totalSrc) * 100) : null;

  // Core Web Vitals (real) + pass status
  const cwv = [
    ["LCP", lcp, "s", lcp != null && lcp <= 2.5, lcp != null ? `${Number(lcp).toFixed(1)}s` : "—"],
    ["INP", inp, "ms", inp != null && inp <= 200, inp != null ? `${Math.round(inp)}ms` : "—"],
    ["CLS", cls, "", cls != null && cls <= 0.1, cls != null ? Number(cls).toFixed(2) : "—"],
  ];
  const cwvHave = cwv.filter((c) => c[1] != null).length;
  const cwvPass = cwv.filter((c) => c[1] != null && c[3]).length;
  const perfImpact = cwvHave ? Math.round((cwvPass / cwvHave) * 100) : null;
  const goodUrls = cwvHave ? Math.round((cwvPass / cwvHave) * 100) : null;

  const Honest = ({ title, note, cta, onCta }) => (
    <div className="grid min-h-[150px] place-items-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Zap size={18} /></div>
        <div className="text-[12px] font-semibold text-[var(--text)]">{title}</div>
        <div className="mt-1 text-[11px] text-[var(--muted)] max-w-[320px]">{note}</div>
        {cta && <button onClick={() => (onCta || onChatWithAi)?.()} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[image:var(--infoHighlight-gradient)] px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">{cta}</button>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft size={16} /> Back</button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">CRO — Conversion Rate</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Chat with Ai <Sparkles size={14} /></button>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-1.5">
          {[["Overview", LayoutGrid], ["Heatmap", Activity], ["Recording", Video], ["CRO Recommendations", Lightbulb]].map(([label, Icon]) => (
            <button key={label} onClick={() => setTab(label)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-medium transition ${tab === label ? "bg-[var(--bg-panel,#fff)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}><Icon size={15} /> {label}</button>
          ))}
        </div>

        {/* Connect Microsoft Clarity banner (honest — not integrated) */}
        <div className="mb-6 rounded-[12px] border border-dashed border-[#F0782E]/50 bg-[#FFF7F2] dark:bg-[#F97316]/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3"><span className={CHIP}><Zap size={16} /></span><div><div className="text-[13px] font-semibold text-[var(--text)]">Connect Microsoft Clarity</div><div className="text-[11px] text-[var(--muted)]">Unlock AI-powered behavioral insights (heatmaps, recordings) with Microsoft Clarity integration.</div></div></div>
            <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90 whitespace-nowrap">Connect Microsoft Clarity</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Free Forever", "No data limits"], ["No Performance Impact", "Maintains speed scores"], ["AI-Powered Insights", "Advanced capabilities"], ["Session Recordings", "Heatmaps & recordings"]].map(([t, s]) => (
              <div key={t} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2"><div className="text-[12px] font-semibold text-[var(--text)]">{t}</div><div className="text-[10px] text-[var(--muted)]">{s}</div></div>
            ))}
          </div>
        </div>

        {/* 4 KPI cards */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={CARD}><div className="flex items-center gap-2"><span className={CHIP}><Activity size={15} /></span><span className={TITLE}>Behavior Score</span></div><div className={`${VALUE} mt-2`}>—</div><div className="mt-2 text-[11px] text-[var(--muted)]">Needs Microsoft Clarity</div></div>
          <div className={CARD}><div className="flex items-center gap-2"><span className={CHIP}><Target size={15} /></span><span className={TITLE}>Conversion Rate</span></div><div className={`${VALUE} mt-2`}>{convRate != null ? `${convRate.toFixed(1)}%` : "—"}</div><div className="mt-2 text-[11px] text-[var(--muted)]">Real leads ÷ organic traffic</div></div>
          <div className={CARD}><div className="flex items-center gap-2"><span className={CHIP}><Zap size={15} /></span><span className={TITLE}>CRO Opportunities</span></div><div className={`${VALUE} mt-2`}>{cwvHave ? String(cwvHave - cwvPass) : "—"}</div><div className="mt-2 text-[11px] text-[var(--muted)]">Core Web Vitals to fix</div></div>
          <div className={CARD}><div className="flex items-center gap-2"><span className={CHIP}><Gauge size={15} /></span><span className={TITLE}>Performance Impact</span></div><div className={`${VALUE} mt-2`}>{perfImpact != null ? `${perfImpact}%` : "—"}</div><div className="mt-2 text-[11px] text-[var(--muted)]">Core Web Vitals passing</div></div>
        </section>

        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Core Web Vitals Correlation — real CWV */}
          <div className={CARD}>
            <div className="mb-3 flex items-center justify-between"><span className="text-[14px] font-bold text-[var(--text)]">Core Web Vitals Correlation</span>{cwvHave > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cwvPass === cwvHave ? "bg-[#EAF8F1] text-[#178A5D]" : "bg-[#FFF5D9] text-[#B98500]"}`}>{cwvPass === cwvHave ? "All Optimal" : `${cwvPass}/${cwvHave} Optimal`}</span>}</div>
            {cwvHave === 0 ? (
              <Honest title="No Core Web Vitals yet" note="Run a Page Speed analysis to see LCP / INP / CLS and their conversion correlation." />
            ) : (
              <div className="space-y-2">
                {cwv.map(([label, val, unit, good, disp]) => (
                  <div key={label} className="flex items-center justify-between rounded-[10px] border border-[var(--border)] px-3 py-2.5">
                    <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-[8px] ${good ? "bg-[#EAF8F1] text-[#178A5D]" : "bg-[#FFF5D9] text-[#B98500]"}`}><Gauge size={14} /></span><div><div className="text-[11px] text-[var(--muted)]">{label}</div><div className="text-[15px] font-bold text-[var(--text)] tabular-nums">{disp}</div></div></div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${good ? "bg-[#EAF8F1] text-[#178A5D]" : "bg-[#FFF5D9] text-[#B98500]"}`}>{val == null ? "—" : good ? "Good" : "Needs work"}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-start gap-2 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-2.5"><Info size={14} className="mt-0.5 shrink-0 text-[#3B82F6]" /><div className="text-[11px] text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">AI Insight:</span> behavioral correlation (bounce rate, engagement, rage clicks) needs Microsoft Clarity — your Core Web Vitals above are live from PageSpeed.</div></div>
              </div>
            )}
          </div>

          {/* User Behaviour & AI Insights — heatmap honest */}
          <div className={CARD}>
            <div className="mb-3 text-[14px] font-bold text-[var(--text)]">User Behaviour &amp; AI Insights</div>
            <div className="mb-3 inline-flex rounded-[8px] border border-[var(--border)] p-0.5 text-[12px]">
              {["Clicks", "Scroll Depth", "Attention"].map((x, i) => <span key={x} className={`rounded-[6px] px-2.5 py-1 ${i === 0 ? "bg-[var(--bg-panel,#fff)] font-semibold text-[var(--text)] shadow-sm" : "text-[var(--muted)]"}`}>{x}</span>)}
            </div>
            <Honest title="Heatmap needs Microsoft Clarity" note="Connect Microsoft Clarity to view live click, scroll-depth and attention heatmaps + top engagement drivers." cta="Connect Microsoft Clarity" onCta={onChatWithAi} />
          </div>
        </div>

        {/* Performance Trend + Conversion Detail (real) */}
        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className={CARD}>
            <div className="mb-3 text-[14px] font-bold text-[var(--text)]">Performance Trend</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-[var(--border)] px-3 py-3"><div className="text-[11px] text-[var(--muted)]">Good URLs (CWV)</div><div className="text-[20px] font-bold text-[#178A5D] tabular-nums">{goodUrls != null ? `${goodUrls}%` : "—"}</div></div>
              <div className="rounded-[10px] border border-[var(--border)] px-3 py-3"><div className="text-[11px] text-[var(--muted)]">Need improvement</div><div className="text-[20px] font-bold text-[#B98500] tabular-nums">{goodUrls != null ? `${100 - goodUrls}%` : "—"}</div></div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-2.5"><span className="text-[12px] text-[var(--muted)]">Overall Status</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${goodUrls === 100 ? "bg-[#EAF8F1] text-[#178A5D]" : "bg-[#FFF5D9] text-[#B98500]"}`}>{goodUrls == null ? "—" : goodUrls === 100 ? "Excellent" : "Needs work"}</span></div>
          </div>

          {/* Conversion Detail — real GA4 leads */}
          <div className={CARD}>
            <div className="mb-3 text-[14px] font-bold text-[var(--text)]">Conversion Detail</div>
            {!hasLeads ? (
              <Honest title="Connect Google Analytics" note="Conversions (leads, form fills, sign-ups) come from your real GA4 data — connect GA4 to unlock conversion rate, goal tracking and lead sources." cta="Connect Google Analytics" onCta={onConnect} />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[10px] border border-[var(--border)] px-3 py-3"><div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]"><Users size={12} /> Total Leads</div><div className="text-[20px] font-bold text-[var(--text)] tabular-nums">{compact(monthly)}</div></div>
                  <div className="rounded-[10px] border border-[var(--border)] px-3 py-3"><div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]"><Goal size={12} /> Goal</div><div className="text-[20px] font-bold text-[var(--text)] tabular-nums">{goalPct != null ? `${Math.round(goalPct)}%` : "—"}</div></div>
                </div>
                {goalPct != null && <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]"><div className="h-2 rounded-full bg-[#1CC88A]" style={{ width: `${goalPct}%` }} /></div>}
                <div className="rounded-[10px] border-l-4 border-[#F59E0B] bg-[var(--card)] px-3 py-2"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]"><FileText size={12} /> Contact Form</span><span className="text-[13px] font-semibold text-[var(--text)] tabular-nums">{compact(contactForm)}{cfPct != null ? ` · ${cfPct}%` : ""}</span></div></div>
                <div className="rounded-[10px] border-l-4 border-[#3B82F6] bg-[var(--card)] px-3 py-2"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]"><Mail size={12} /> Newsletter</span><span className="text-[13px] font-semibold text-[var(--text)] tabular-nums">{compact(newsletter)}{nlPct != null ? ` · ${nlPct}%` : ""}</span></div></div>
              </div>
            )}
          </div>
        </div>

        {/* CRO Recommendations — honest (needs behavioral analysis) */}
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Lightbulb size={15} className="text-[#D45427]" /><h2 className="text-[16px] font-bold text-[var(--text)]">CRO Recommendations</h2></div></div>
        <div className={CARD}>
          <Honest title="AI recommendations need behavioral data" note="Above-the-fold, form-abandonment and mobile-navigation recommendations are generated from heatmap + session data. Connect Microsoft Clarity, or ask AI for CRO ideas from your current metrics." cta="Ask AI for CRO ideas" />
        </div>
      </div>
    </div>
  );
}
