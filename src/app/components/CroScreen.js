"use client";

// CroScreen — full "CRO" (Conversion Rate Optimization) screen (Figma flow
// 22-28110), built on the dashboard's Figma design system. Real data only: leads,
// lead sources and goal come from the same GA4-backed fields the dashboard's Leads
// card uses; conversion rate is derived from real leads ÷ real organic traffic.
// When GA4 isn't connected (no leads), it shows an honest connect-your-data state
// rather than any placeholder numbers.

import React, { useMemo } from "react";
import { ArrowLeft, Sparkles, Target, Users, Goal, MousePointerClick, Mail, FileText } from "lucide-react";

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const CHIP = "inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FFA615] text-white shadow-sm shrink-0";
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const TITLE = "inline-flex items-center gap-1 text-[12px] font-semibold text-[#374151] dark:text-[var(--text)] leading-relaxed";
const VALUE = "text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums";

export default function CroScreen({ data = {}, onBack, onChatWithAi, onConnect }) {
  const { domain = "", leads = null, traffic = null } = data;
  const scope = domain ? `https://${domain}` : "—";

  const monthly = leads?.monthly ?? null;
  const goal = leads?.goal ?? null;
  const contactForm = leads?.contactForm ?? null;
  const newsletter = leads?.newsletter ?? null;
  const hasLeads = monthly != null || contactForm != null || newsletter != null;

  const convRate = useMemo(() => {
    if (monthly == null || traffic == null || Number(traffic) <= 0) return null;
    return (Number(monthly) / Number(traffic)) * 100;
  }, [monthly, traffic]);

  const goalPct = useMemo(() => {
    if (monthly == null || goal == null || Number(goal) <= 0) return null;
    return Math.max(0, Math.min(100, (Number(monthly) / Number(goal)) * 100));
  }, [monthly, goal]);

  const totalSrc = (Number(contactForm) || 0) + (Number(newsletter) || 0);
  const cfPct = totalSrc > 0 ? Math.round(((Number(contactForm) || 0) / totalSrc) * 100) : null;
  const nlPct = totalSrc > 0 ? Math.round(((Number(newsletter) || 0) / totalSrc) * 100) : null;

  const StatCard = ({ Icon, title, value, suffix, sub }) => (
    <div className={CARD}>
      <div className="flex items-center gap-2"><span className={CHIP}><Icon size={16} /></span><span className={TITLE}>{title}</span></div>
      <div className="mt-3 flex items-end gap-2"><div className={VALUE}>{value}</div>{suffix && value !== "—" && <div className="pb-0.5 text-[11px] text-[var(--muted)]">{suffix}</div>}</div>
      {sub && <div className="mt-3 text-[11px] text-[var(--muted)]">{sub}</div>}
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

      <div className="mx-auto max-w-[1100px] px-6 py-6">
        {!hasLeads ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Target size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">Connect Google Analytics to see conversions</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">CRO uses your real GA4 conversions (leads, form fills, sign-ups). Connect GA4 to unlock conversion rate, goal tracking and lead-source breakdown.</div>
            {onConnect && <button onClick={() => onConnect?.()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Connect Google Analytics</button>}
          </div>
        ) : (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Conversion Overview</h2>
            <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard Icon={Target} title="Conversion Rate" value={convRate != null ? convRate.toFixed(2) : "—"} suffix="%" sub="Leads ÷ organic traffic" />
              <StatCard Icon={Users} title="Total Leads" value={compact(monthly)} suffix="/mo" sub="Tracked conversions" />
              <StatCard Icon={Goal} title="Goal Progress" value={goalPct != null ? Math.round(goalPct) : "—"} suffix="%" sub={goal != null ? `Target: ${compact(goal)}` : "No goal set"} />
              <StatCard Icon={MousePointerClick} title="Lead Sources" value={compact(totalSrc || null)} sub="Contact + newsletter" />
            </section>

            {goalPct != null && (
              <div className={`${CARD} mb-8`}>
                <div className="mb-2 flex items-center justify-between text-[12px]"><span className="font-semibold text-[var(--text)]">Goal Progress</span><span className="text-[var(--muted)]">{compact(monthly)} / {compact(goal)}</span></div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--border)]"><div className="h-2.5 rounded-full bg-[#1CC88A]" style={{ width: `${goalPct}%` }} /></div>
              </div>
            )}

            <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Lead Sources</h2>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className={CARD}>
                <div className="flex items-center gap-2"><span className={CHIP}><FileText size={16} /></span><span className={TITLE}>Contact Form</span></div>
                <div className="mt-3 flex items-end gap-2"><div className={VALUE}>{compact(contactForm)}</div>{cfPct != null && <div className="pb-0.5 text-[11px] text-[var(--muted)]">{cfPct}%</div>}</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]"><div className="h-2 rounded-full bg-[#F59E0B]" style={{ width: `${cfPct ?? 0}%` }} /></div>
              </div>
              <div className={CARD}>
                <div className="flex items-center gap-2"><span className={CHIP}><Mail size={16} /></span><span className={TITLE}>Newsletter</span></div>
                <div className="mt-3 flex items-end gap-2"><div className={VALUE}>{compact(newsletter)}</div>{nlPct != null && <div className="pb-0.5 text-[11px] text-[var(--muted)]">{nlPct}%</div>}</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]"><div className="h-2 rounded-full bg-[#3B82F6]" style={{ width: `${nlPct ?? 0}%` }} /></div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
