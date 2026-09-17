"use client";

// InternalLinkingScreen — full "Internal Linking" screen (Figma flow 21-28065),
// built on the dashboard's Figma design system. Real data only: the internal-link
// health signals (pages crawled, broken links, redirect chains, broken resources)
// come from the app's real on-page audit (seo.onPageAudit). The full internal-link
// graph / orphan-page map needs a deep crawl, so that is shown as an honest
// call-to-action rather than any fabricated graph. No audit → empty state.

import React from "react";
import {
  ArrowLeft, Sparkles, Network, FileText, Unlink, CornerUpRight, ImageOff, Info,
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

export default function InternalLinkingScreen({ data = {}, onBack, onChatWithAi }) {
  const { domain = "", audit = null } = data;
  const scope = domain ? `https://${domain}` : "—";
  const has = !!(audit && (audit.pages_crawled != null || audit.broken_links != null || audit.broken_resources != null));

  const pages = audit?.pages_crawled ?? null;
  const brokenLinks = audit?.broken_links ?? null;
  const redirects = audit?.redirect_chains ?? null;
  const brokenRes = audit?.broken_resources ?? null;

  const StatCard = ({ Icon, title, value, sub, bad }) => (
    <div className={CARD}>
      <div className="flex items-center gap-2"><span className={CHIP}><Icon size={16} /></span><span className={TITLE}>{title}</span></div>
      <div className="mt-3 flex items-end gap-2"><div className={VALUE} style={bad && Number(value) > 0 ? { color: "#DC2626" } : undefined}>{value}</div></div>
      {sub && <div className="mt-3 text-[11px] text-[var(--muted)]">{sub}</div>}
    </div>
  );

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

      <div className="mx-auto max-w-[1100px] px-6 py-6">
        {!has ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><Network size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">No crawl data yet</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">Run a site crawl to analyse your internal link health — broken links, redirect chains and link-equity distribution appear here.</div>
          </div>
        ) : (
          <>
            <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Internal Link Health</h2>
            <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard Icon={FileText} title="Pages Crawled" value={compact(pages)} sub="Pages analysed" />
              <StatCard Icon={Unlink} title="Broken Links" value={compact(brokenLinks)} sub="Links returning errors" bad />
              <StatCard Icon={CornerUpRight} title="Redirect Chains" value={compact(redirects)} sub="Multi-hop redirects" bad />
              <StatCard Icon={ImageOff} title="Broken Resources" value={compact(brokenRes)} sub="Missing assets" bad />
            </section>

            <div className={`${CARD} flex items-start gap-3`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EAF4FF] text-[#3B82F6]"><Info size={16} /></span>
              <div>
                <div className="text-[13px] font-semibold text-[var(--text)]">Full internal-link graph</div>
                <div className="mt-1 text-[12px] text-[var(--muted)]">
                  The complete internal-link map — link-equity flow, orphan pages, deep-page click-depth and anchor-text distribution — requires a deep crawl of every page. Run a full crawl (or connect Search Console) to map how link authority flows through your site and surface orphan pages that need internal links.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
