"use client";

// LocalSeoScreen — matched to Figma flow node 14:14450 ("Local SEO Dashboard").
// LAYOUT faithful to Figma: header + 3 tabs (Geo-Grid / GBP Dashboard / Multi-
// Location), Profile Performance, Reviews & Reputation, Q&A Management, Active
// Posts, Alerts & Actions. DATA POLICY (Paras's call): real data where the app has
// it — GMB rating/reviews/Q&A/directories/completeness/issues from seo.gmbCheck —
// and honest "connect / not tracked" states for what needs the GBP Insights API
// (Total/Search/Maps views, clicks, call/direction, posts) which the app does not
// collect. No fake numbers.

import React, { useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, Star, MessageSquare, HelpCircle, Eye, Search, Map,
  MousePointerClick, Phone, Navigation, Building2, Globe, Bell, Download,
  AlertTriangle, CheckCircle2, XCircle, MapPin, FileText, Plus, Info,
} from "lucide-react";

const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(Math.round(v));
};
const CARD = "rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm";
const sevColor = (s) => ({ critical: "#DC2626", high: "#DC2626", medium: "#B98500", low: "#3B82F6" }[s] || "#6B7280");
const sevBg = (s) => ({ critical: "#FEF2F2", high: "#FEF2F2", medium: "#FFF5D9", low: "#EAF4FF" }[s] || "#F3F4F6");

const Stars = ({ n }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={12} className={i <= Math.round(n || 0) ? "fill-[#FFA615] text-[#FFA615]" : "text-[#D1D5DB]"} />)}
  </span>
);

export default function LocalSeoScreen({ data = {}, onBack, onChatWithAi }) {
  const { domain = "", gmbCheck = null } = data;
  const scope = domain ? `https://${domain}` : "—";
  const [tab, setTab] = useState("GBP Dashboard");

  const g = gmbCheck?.gmb || {};
  const found = !!(gmbCheck && (g.found || g.name || g.rating != null));
  const rating = g.rating ?? null;
  const reviewCount = gmbCheck?.reviewCount ?? g.reviewCount ?? null;
  const completeness = typeof gmbCheck?.completeness === "number" ? gmbCheck.completeness : (gmbCheck?.completeness?.score ?? null);
  const unreplied = gmbCheck?.unrepliedReviewCount ?? null;
  const reviews = Array.isArray(gmbCheck?.reviews) ? gmbCheck.reviews : [];
  const qa = Array.isArray(gmbCheck?.qa) ? gmbCheck.qa : [];
  const directories = Array.isArray(gmbCheck?.directories) ? gmbCheck.directories : [];
  const issues = Array.isArray(gmbCheck?.issues) ? gmbCheck.issues : [];

  const answeredPct = reviewCount && unreplied != null ? Math.round(((reviewCount - unreplied) / reviewCount) * 100) : null;
  const newQuestions = qa.filter((q) => !(q.hasAnswer ?? q.answer)).length;

  const PERF = [
    ["Total Views", Eye], ["Search Views", Search], ["Maps Views", Map],
    ["Website Clicks", MousePointerClick], ["Call Clicks", Phone], ["Direction Requests", Navigation],
  ];

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft size={16} /> Back</button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Local SEO Dashboard</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><Download size={13} /> Export</button>
          <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Chat with Ai <Sparkles size={14} /></button>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-1 text-[20px] font-bold text-[var(--text)]">Local SEO Dashboard</div>
        <div className="mb-5 text-[12px] text-[var(--muted)]">Monitor your local search performance, Google Business Profile, and multi-location visibility.</div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-1.5">
          {[["Geo-Grid", Globe], ["GBP Dashboard", Building2], ["Multi-Location", MapPin]].map(([label, Icon]) => (
            <button key={label} onClick={() => setTab(label)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-medium transition ${tab === label ? "bg-[var(--bg-panel,#fff)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}><Icon size={15} /> {label}</button>
          ))}
        </div>

        {!found ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><MapPin size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">No Google Business Profile found yet</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">Run a scan to check your Google Business Profile (rating, reviews, Q&amp;A, completeness) and local directory listings.</div>
          </div>
        ) : tab !== "GBP Dashboard" ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><MapPin size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">{tab}</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">{tab === "Geo-Grid" ? "Geo-grid rank mapping needs multi-point local scans (not collected yet)." : "Multi-location tracking activates when more than one location is configured."} Switch to <button onClick={() => setTab("GBP Dashboard")} className="font-semibold text-[#D45427] underline">GBP Dashboard</button>.</div>
          </div>
        ) : (
          <>
            {/* Profile Performance — GBP Insights (not collected → honest) */}
            <div className={`${CARD} mb-6`}>
              <div className="flex items-center gap-2"><Eye size={15} className="text-[#D45427]" /><span className="text-[14px] font-bold text-[var(--text)]">Profile Performance</span></div>
              <div className="text-[11px] text-[var(--muted)]">Turning profiles into powerful impressions.</div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {PERF.map(([label, Icon]) => (
                  <div key={label}>
                    <div className="flex items-center gap-1 text-[11px] text-[var(--muted)]"><Icon size={12} /> {label}</div>
                    <div className="mt-1 text-[20px] font-bold text-[var(--text)] tabular-nums">—</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-2.5">
                <Info size={14} className="mt-0.5 shrink-0 text-[#3B82F6]" />
                <div className="text-[11px] text-[var(--muted)]">Views, clicks, calls &amp; direction requests come from the <span className="font-semibold text-[var(--text)]">Google Business Profile Insights API</span> — connect GBP to populate these. Your live GBP profile data (rating, reviews, Q&amp;A, completeness, directories) is shown below.</div>
              </div>
            </div>

            {/* Reviews & Reputation — real */}
            <div className={`${CARD} mb-6`}>
              <div className="flex items-center gap-2"><Star size={15} className="text-[#D45427]" /><span className="text-[14px] font-bold text-[var(--text)]">Reviews &amp; Reputation</span></div>
              <div className="text-[11px] text-[var(--muted)]">Monitor and respond to customer feedback.</div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[repeat(3,auto)_1fr] sm:items-center">
                <div><div className="text-[26px] font-bold text-[var(--text)] tabular-nums leading-none">{rating != null ? Number(rating).toFixed(1) : "—"}</div><Stars n={rating} /><div className="mt-1 text-[10px] text-[var(--muted)]">{compact(reviewCount)} reviews</div></div>
                <div><div className="text-[26px] font-bold text-[var(--text)] tabular-nums leading-none">{answeredPct != null ? `${answeredPct}%` : "—"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">Answered</div></div>
                <div><div className="text-[26px] font-bold text-[var(--text)] tabular-nums leading-none">{qa.length ? newQuestions : "—"}</div><div className="mt-1 text-[10px] text-[var(--muted)]">New Questions</div></div>
                <div className="text-[12px] text-[var(--muted)] sm:text-right">
                  <div>Reviews found: <span className="font-semibold text-[var(--text)]">{compact(reviewCount)}</span></div>
                  <div>Response rate: <span className="font-semibold text-[var(--text)]">{answeredPct != null ? `${answeredPct}%` : "—"}</span></div>
                  {gmbCheck?.sentiment?.summary && <div className="mt-0.5">Sentiment: <span className="font-semibold text-[var(--text)]">{gmbCheck.sentiment.summary}</span></div>}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {reviews.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-4 text-center text-[12px] text-[var(--muted)]">No individual reviews returned for this profile yet.</div>
                ) : reviews.slice(0, 4).map((r, i) => {
                  const needs = !(r.ownerReply);
                  return (
                    <div key={i} className="rounded-[10px] border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="text-[13px] font-semibold text-[var(--text)]">{r.author || r.name || "Reviewer"}</span><Stars n={r.rating} /></div>
                        {needs && <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-semibold text-[#DC2626]">Need Response</span>}
                      </div>
                      {(r.text || r.comment) && <div className="mt-1 text-[12px] text-[var(--muted)]">{r.text || r.comment}</div>}
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-1 rounded-full bg-[#D45427] px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90"><MessageSquare size={12} /> Reply</button>
                        <button className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-[11px] font-medium text-[var(--muted)]"><FileText size={12} /> Save Draft</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Q&A Management — real */}
            <div className={`${CARD} mb-6`}>
              <div className="mb-3 flex items-center gap-2"><HelpCircle size={15} className="text-[#D45427]" /><span className="text-[14px] font-bold text-[var(--text)]">Q&amp;A Management</span></div>
              {qa.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-4 text-center text-[12px] text-[var(--muted)]">No Google Business Profile questions found yet.</div>
              ) : qa.slice(0, 5).map((q, i) => (
                <div key={i} className="mb-3 rounded-[10px] border border-[var(--border)] p-3 last:mb-0">
                  <div className="text-[13px] font-semibold text-[var(--text)]">{q.question || "Question"}</div>
                  {(q.answer || q.hasAnswer) ? <div className="mt-1 text-[12px] text-[var(--muted)]">{q.answer || "Answered"}</div> : (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-[#F5EAFE] px-2 py-0.5 text-[10px] font-semibold text-[#8B5CF6]">Needs answer</span>
                      <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-1 rounded-full bg-[#D45427] px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90"><MessageSquare size={12} /> Reply</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Active Posts — GBP posts (not collected → honest) */}
              <div className={CARD}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2"><FileText size={15} className="text-[#D45427]" /><span className="text-[13px] font-bold text-[var(--text)]">Active Posts</span></div>
                  <button className="inline-flex items-center gap-1 rounded-full border border-[#CA5223] px-2.5 py-1 text-[11px] font-semibold text-[#D45427]"><Plus size={12} /> Create Post</button>
                </div>
                <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-6 text-center">
                  <div className="text-[12px] font-semibold text-[var(--text)]">GBP posts not connected</div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">Connect Google Business Profile to manage and track your posts here.</div>
                </div>
              </div>

              {/* Alerts & Actions — real (from GMB issues) */}
              <div className={CARD}>
                <div className="mb-2 flex items-center gap-2"><Bell size={15} className="text-[#D45427]" /><span className="text-[13px] font-bold text-[var(--text)]">Alerts &amp; Actions</span></div>
                {issues.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-6 text-center text-[12px] text-[var(--muted)]">No local-SEO issues detected. 🎉</div>
                ) : issues.slice(0, 5).map((iss, i) => (
                  <div key={i} className="mb-2 flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] px-3 py-2 last:mb-0">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: sevBg(iss.severity), color: sevColor(iss.severity) }}><AlertTriangle size={12} /></span>
                      <span className="text-[12px] text-[var(--text)]">{iss.issue}</span>
                    </div>
                    <button onClick={() => onChatWithAi?.()} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#CA5223] px-2.5 py-1 text-[11px] font-semibold text-[#D45427]"><Plus size={11} /> Task</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Directory listings — real */}
            {directories.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-[16px] font-bold text-[var(--text)] ml-1">Directory Listings</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {directories.map((d, i) => {
                    const name = typeof d === "string" ? d : (d?.name || d?.directory || "Directory");
                    const listed = typeof d === "object" ? (d.listed ?? d.found ?? d.present) : true;
                    return (
                      <div key={`${name}-${i}`} className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm">
                        <span className={`grid h-8 w-8 place-items-center rounded-full ${listed ? "bg-[#EAF8F1] text-[#178A5D]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>{listed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                        <div className="min-w-0"><div className="truncate text-[13px] font-medium text-[var(--text)]">{name}</div><div className="text-[11px] text-[var(--muted)]">{listed === false ? "Not found" : listed === true ? "Listed" : "Unknown"}</div></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
