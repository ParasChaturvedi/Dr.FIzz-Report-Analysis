"use client";

// LocalSeoScreen — full "Local SEO" screen (Figma flow 14-28001), built on the
// dashboard's Figma design system. Real data only: the Google Business Profile
// (rating, reviews, completeness, categories, directory listings) comes from the
// app's real GMB check (seo.gmbCheck). No GMB match → honest empty state.

import React from "react";
import {
  ArrowLeft, Sparkles, MapPin, Star, MessageSquare, CheckCircle2, XCircle,
  Phone, Globe, Building2,
} from "lucide-react";

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

export default function LocalSeoScreen({ data = {}, onBack, onChatWithAi }) {
  const { domain = "", gmb = null } = data;
  const scope = domain ? `https://${domain}` : "—";
  const found = !!(gmb && (gmb.found || gmb.name || gmb.rating != null));

  const rating = gmb?.rating ?? null;
  const reviews = gmb?.reviewCount ?? null;
  const completeness = gmb?.completeness ?? null;
  const unreplied = gmb?.unrepliedReviewCount ?? null;
  const directories = Array.isArray(gmb?.directories) ? gmb.directories : [];

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
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Local SEO</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Chat with Ai <Sparkles size={14} /></button>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 py-6">
        {!found ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><MapPin size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">No Google Business Profile found yet</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan to check your Google Business Profile (rating, reviews, completeness) and local directory listings. Local SEO data appears here once a matching profile is found.</div>
          </div>
        ) : (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Google Business Profile</h2>
            <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard Icon={Star} title="Rating" value={rating != null ? Number(rating).toFixed(1) : "—"} suffix="★" sub="Average review score" />
              <StatCard Icon={MessageSquare} title="Reviews" value={compact(reviews)} sub="Total reviews" />
              <StatCard Icon={CheckCircle2} title="Profile Completeness" value={completeness != null ? Math.round(completeness) : "—"} suffix="%" sub="GMB fields filled" />
              <StatCard Icon={MessageSquare} title="Unreplied Reviews" value={compact(unreplied)} sub="Need a response" />
            </section>

            {/* Profile details */}
            <div className={`${CARD} mb-8`}>
              <div className="mb-3 flex items-center gap-2"><span className={CHIP}><Building2 size={16} /></span><span className="text-[13px] font-semibold text-[var(--text)]">{gmb?.name || domain}</span></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-[12px] text-[var(--muted)]">
                {gmb?.address && <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-[#D45427]" /> {gmb.address}</div>}
                {gmb?.phone && <div className="flex items-center gap-2"><Phone size={14} className="shrink-0 text-[#D45427]" /> {gmb.phone}</div>}
                {gmb?.website && <div className="flex items-center gap-2 break-all"><Globe size={14} className="shrink-0 text-[#D45427]" /> {gmb.website}</div>}
              </div>
            </div>

            {/* Directory listings */}
            {directories.length > 0 && (
              <>
                <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Directory Listings</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {directories.map((d, i) => {
                    const name = typeof d === "string" ? d : (d?.name || d?.directory || "Directory");
                    const present = typeof d === "object" ? !!(d.found ?? d.present ?? d.listed) : true;
                    return (
                      <div key={`${name}-${i}`} className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                        <span className={`grid h-8 w-8 place-items-center rounded-full ${present ? "bg-[#EAF8F1] text-[#178A5D]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>{present ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                        <div className="min-w-0"><div className="truncate text-[13px] font-medium text-[var(--text)]">{name}</div><div className="text-[11px] text-[var(--muted)]">{present ? "Listed" : "Not found"}</div></div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
