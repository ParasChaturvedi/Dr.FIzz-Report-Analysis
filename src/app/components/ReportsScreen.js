"use client";

// ReportsScreen — full "Reports" screen opened from the sidebar.
// Built on the dashboard's Figma design system. It lists the SEO reports this
// browser has generated (discovered from the app's own report storage, keyed
// `drfizz:report:<id>`), each linking to the existing /report/<id> page, and
// offers the real "Download PDF Report" action (reuses the dashboard handler).
// It does NOT touch the locked report renderer/routes — it only reads storage
// and links to existing report URLs. No demo data: empty storage → empty state.

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, FileText, ExternalLink, Download, Loader2, RefreshCw,
} from "lucide-react";

const CHIP = "inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#FFA615] text-white shadow-sm shrink-0";
const fmtDate = (v) => {
  if (!v) return null;
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Discover reports the app has stored in this browser (session + local).
function discoverReports() {
  const found = new Map();
  const scan = (store) => {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key || !/^drfizz:report:/.test(key)) continue;
        const id = key.replace(/^drfizz:report:/, "");
        if (!id || found.has(id)) continue;
        let domain = null, ts = null;
        try {
          const parsed = JSON.parse(store.getItem(key) || "{}");
          const data = parsed?.data || parsed || {};
          domain = data?.websiteData?.site || data?.websiteData?.website || data?.domain || data?.site || null;
          ts = parsed?.ts || parsed?.createdAt || data?.generatedAt || data?.createdAt || null;
        } catch {}
        found.set(id, { id, domain: domain ? String(domain).replace(/^https?:\/\//, "") : null, ts });
      }
    } catch {}
  };
  try { scan(sessionStorage); } catch {}
  try { scan(localStorage); } catch {}
  return Array.from(found.values()).sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
}

export default function ReportsScreen({ data = {}, onBack, onChatWithAi, onDownloadPdf, reportLoading = false }) {
  const { domain = "" } = data;
  const scope = domain ? `https://${domain}` : "—";
  const [reports, setReports] = useState([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => { setReports(discoverReports()); }, [nonce]);

  const primaryDomain = useMemo(() => domain ? String(domain).replace(/^https?:\/\//, "") : null, [domain]);

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      {/* Upper bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Reports</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[#EA580C]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setNonce((n) => n + 1)} title="Refresh"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => onChatWithAi?.()}
            className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">
            Chat with Ai <Sparkles size={14} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-6 py-6">
        {/* Generate / download */}
        <div className="mb-8 flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={CHIP}><FileText size={18} /></span>
            <div>
              <div className="text-[14px] font-semibold text-[var(--text)]">SEO Report{primaryDomain ? ` — ${primaryDomain}` : ""}</div>
              <div className="text-[12px] text-[var(--muted)]">Full SEO &amp; GEO analysis as a downloadable PDF.</div>
            </div>
          </div>
          <button
            onClick={() => onDownloadPdf?.()}
            disabled={reportLoading}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm bg-[image:var(--infoHighlight-gradient)] hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {reportLoading ? (<><Loader2 size={15} className="animate-spin" /> Generating…</>) : (<><Download size={15} /> Download PDF Report</>)}
          </button>
        </div>

        {/* Saved reports */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-[var(--text)] ml-1">Your Reports</h2>
          <span className="text-[12px] text-[var(--muted)]">{reports.length ? `${reports.length} found` : ""}</span>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-6 py-12 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#FFF3E6] text-[#D45427]"><FileText size={20} /></div>
            <div className="text-[13px] font-semibold text-[var(--text)]">No saved reports in this browser yet</div>
            <div className="mt-1 text-[12px] text-[var(--muted)]">Generate a report from onboarding, or download the PDF above. Reports you open will appear here for quick access.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {reports.map((r) => (
              <a key={r.id} href={`/report/${r.id}`} target="_blank" rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm hover:border-[#F97316]/40 hover:shadow-md transition">
                <span className={CHIP}><FileText size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[var(--text)]">{r.domain || "SEO Report"}</div>
                  <div className="text-[11px] text-[var(--muted)]">{fmtDate(r.ts) || `Report ID: ${r.id.slice(0, 12)}…`}</div>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#CA5223] bg-[#F5F4F2] dark:bg-[var(--input)] text-[#CA5223] group-hover:bg-[#CA5223]/10 transition">
                  <ExternalLink size={14} />
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
