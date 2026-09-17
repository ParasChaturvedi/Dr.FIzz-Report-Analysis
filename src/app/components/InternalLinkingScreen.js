"use client";

// InternalLinkingScreen — matched to Figma flow node 14:23123. LAYOUT faithful:
// header, 3 cards (Authority Score donut / Total Link Opportunities / Topic
// Cluster), Recent AI Suggestion + Search Console Integration, Content analysis.
// DATA POLICY (Paras's call): real where the app has it — Authority Score = real
// Domain Rating; Search Console = real connection status + real pages crawled;
// Content-analysis descriptions fold in the real on-page audit link signals
// (pages crawled, broken links, redirect chains). Parts that need an internal-link
// graph / topic clustering / AI link suggestions (not collected) show an honest
// "needs analysis" state — no fake numbers.

import React from "react";
import {
  ArrowLeft, Sparkles, Target, Link2, Network, FileText, ExternalLink,
  CheckCircle2, ArrowRight, Info, Unlink, CornerUpRight,
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
const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening"; };

function Donut({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 52, C = 2 * Math.PI * r, off = C * (1 - v / 100);
  return (
    <div className="relative grid place-items-center" style={{ width: 130, height: 130 }}>
      <svg width="130" height="130" className="-rotate-90">
        <circle cx="65" cy="65" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle cx="65" cy="65" r={r} fill="none" stroke="#F0782E" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div className="absolute text-center">
        <div className="text-[26px] font-bold leading-none text-[var(--text)] tabular-nums">{value != null ? Math.round(value) : "—"}</div>
        <div className="text-[11px] text-[var(--muted)]">/100</div>
      </div>
    </div>
  );
}

const ContentRow = ({ title, desc, btn }) => (
  <div className="flex items-center justify-between gap-4 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
    <div className="flex items-start gap-3 min-w-0">
      <FileText size={16} className="mt-0.5 shrink-0 text-[var(--muted)]" />
      <div className="min-w-0"><div className="text-[13px] font-semibold text-[var(--text)]">{title}</div><div className="text-[12px] text-[var(--muted)]">{desc}</div></div>
    </div>
    <button className="shrink-0 rounded-full border border-[#CA5223] bg-[#FCFCFC] dark:bg-[var(--input)] px-3.5 py-1.5 text-[12px] font-semibold text-[#D45427] hover:bg-[#CA5223]/5">{btn}</button>
  </div>
);

export default function InternalLinkingScreen({ data = {}, onBack, onChatWithAi }) {
  const { domain = "", authorityScore = null, gscConnected = false, audit = null } = data;
  const scope = domain ? `https://${domain}` : "—";
  const pages = audit?.pages_crawled ?? null;
  const brokenLinks = audit?.broken_links ?? null;
  const redirects = audit?.redirect_chains ?? null;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><ArrowLeft size={16} /> Back</button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Internal Linking</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Chat with Ai <Sparkles size={14} /></button>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-1 text-[20px] font-bold text-[var(--text)]">{greeting()}{domain ? `` : ""}</div>
        <div className="mb-6 text-[12px] text-[var(--muted)]">AI-powered insights to optimize your content&apos;s link equity and topical authority.</div>

        {/* 3 top cards */}
        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Authority Score — real DR */}
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2"><Target size={15} className="text-[#D45427]" /><span className="text-[13px] font-bold text-[var(--text)]">Authority Score</span></div>
            <div className="grid place-items-center py-2"><Donut value={authorityScore} /></div>
            <div className="mt-1 text-center text-[11px] text-[var(--muted)]">Your live Domain Rating.</div>
          </div>

          {/* Total Link Opportunities — needs internal-link graph → honest */}
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2"><span className={CHIP}><Link2 size={15} /></span><span className="text-[13px] font-bold text-[var(--text)]">Total Link Opportunities</span></div>
            <div className="grid min-h-[150px] place-items-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-6 text-center">
              <div>
                <div className="text-[12px] font-semibold text-[var(--text)]">Needs an internal-link crawl</div>
                <div className="mt-1 text-[11px] text-[var(--muted)] max-w-[240px]">High / Medium / Low link opportunities appear after a full internal-link graph crawl of every page.</div>
              </div>
            </div>
          </div>

          {/* Topic Cluster — needs clustering → honest */}
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2"><span className={CHIP}><Network size={15} /></span><span className="text-[13px] font-bold text-[var(--text)]">Topic Cluster</span></div>
            <div className="grid min-h-[150px] place-items-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-3 py-6 text-center">
              <div>
                <Network size={22} className="mx-auto mb-2 text-[#D45427]" />
                <div className="text-[12px] font-semibold text-[var(--text)]">Topic clustering not run yet</div>
                <div className="mt-1 text-[11px] text-[var(--muted)] max-w-[240px]">Hub-and-spoke topic maps are built from a content + internal-link analysis.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent AI Suggestion + Search Console Integration */}
        <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2"><Sparkles size={15} className="text-[#D45427]" /><span className="text-[13px] font-bold text-[var(--text)]">Recent AI Suggestion</span></div>
            <div className="grid min-h-[160px] place-items-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--app-bg)]/40 px-4 py-8 text-center">
              <div>
                <div className="text-[12px] font-semibold text-[var(--text)]">No AI link suggestions yet</div>
                <div className="mt-1 text-[11px] text-[var(--muted)] max-w-[320px]">AI anchor-text &amp; internal-link suggestions are generated from a page-level content analysis.</div>
                <button onClick={() => onChatWithAi?.()} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[image:var(--infoHighlight-gradient)] px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">Ask AI for suggestions <Sparkles size={13} /></button>
              </div>
            </div>
          </div>

          {/* Search Console Integration — real */}
          <div className={CARD}>
            <div className="mb-3 flex items-center gap-2"><Target size={15} className="text-[#D45427]" /><span className="text-[13px] font-bold text-[var(--text)]">Search Console Integration</span></div>
            <div className="space-y-3 text-[13px]">
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Status</span>
                {gscConnected
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF8F1] px-2 py-0.5 text-[11px] font-semibold text-[#178A5D]"><CheckCircle2 size={12} /> Connected</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-semibold text-[#DC2626]">Not connected</span>}
              </div>
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Pages analysed</span><span className="font-semibold text-[var(--text)] tabular-nums">{pages != null ? `${compact(pages)} pages` : "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Broken internal links</span><span className="font-semibold tabular-nums" style={{ color: (brokenLinks || 0) > 0 ? "#DC2626" : "#178A5D" }}>{brokenLinks != null ? compact(brokenLinks) : "—"}</span></div>
              <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Redirect chains</span><span className="font-semibold tabular-nums" style={{ color: (redirects || 0) > 0 ? "#B98500" : "#178A5D" }}>{redirects != null ? compact(redirects) : "—"}</span></div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => onChatWithAi?.()} className="inline-flex items-center gap-1.5 rounded-full border border-[#CA5223] px-3.5 py-1.5 text-[12px] font-semibold text-[#D45427] hover:bg-[#CA5223]/5">Generate links <Link2 size={13} /></button>
            </div>
          </div>
        </div>

        {/* Content analysis */}
        <div className="mb-3 flex items-center gap-2"><Target size={15} className="text-[#D45427]" /><h2 className="text-[16px] font-bold text-[var(--text)]">Content analysis</h2></div>
        <div className="space-y-3">
          <ContentRow title="Pages Needing Links" desc={`Important pages that don't have enough internal links pointing to them.${pages != null ? ` ${compact(pages)} pages crawled.` : " Run a crawl to map these."}`} btn="Content analysis" />
          <ContentRow title="Pages Receiving Links" desc="Pages that already have strong internal linking and authority — good link sources." btn="View all" />
          <ContentRow title="Pages Passing Link Opportunities" desc={`Pages that can pass authority to weaker ones.${brokenLinks != null ? ` ${compact(brokenLinks)} broken internal links to fix first.` : ""}`} btn="View all" />
        </div>
      </div>
    </div>
  );
}
