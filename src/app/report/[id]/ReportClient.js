"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import DownloadReportModal from "@/app/components/report/DownloadReportModal";

const WebsiteReport     = dynamic(() => import("@/app/components/report/deck/DeckReportLive"), { ssr: false });
const PageReport        = dynamic(() => import("@/app/components/report/PageReport"),    { ssr: false });

export default function ReportClient({ id }) {
  const [reportType, setReportType]   = useState(null);
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [showModal, setShowModal]     = useState(false);
  const [proceeding, setProceeding]   = useState(false);
  const [progress, setProgress]       = useState(0);

  // ── Load report from sessionStorage ──────────────────────────────────────
  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    try {
      const raw = sessionStorage.getItem(`drfizz:report:${id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.reportType && parsed?.data) {
          setReportType(parsed.reportType);
          setData(parsed.data);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn("[ReportClient] sessionStorage read failed:", e);
    }
    // Not found in sessionStorage
    setNotFound(true);
    setLoading(false);
  }, [id]);

  // ── Background pre-fetch: start /api/seo as soon as report loads ─────────
  // Dashboard reads from sessionStorage drfizz:seo:{domain} on mount.
  // If the cache is already warm when the user clicks Proceed, the Dashboard
  // hydrates instantly instead of waiting 15–30 s for the API.
  useEffect(() => {
    if (!data?.domain || typeof window === "undefined") return;

    // Mirror Dashboard's normalizeDomain so cache key matches exactly
    let d = String(data.domain || "").toLowerCase();
    try {
      const u = d.includes("://") ? new URL(d) : new URL(`https://${d}`);
      d = u.hostname.toLowerCase();
      if (d.startsWith("www.")) d = d.slice(4);
    } catch {
      d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    }
    if (!d) return;

    // Skip if cache is fresh (< 10 min)
    try {
      const raw = sessionStorage.getItem(`drfizz:seo:${d}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && Date.now() - parsed.ts < 10 * 60 * 1000) return;
      }
    } catch {}

    // Fire-and-forget — doesn't block the report UI
    fetch("/api/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `https://${d}`,
        keyword: d,
        countryCode: "in",
        languageCode: "en",
        depth: 10,
        providers: ["psi", "authority", "dataforseo", "content", "onpageKeywords"],
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json) return;
        try {
          sessionStorage.setItem(`drfizz:seo:${d}`, JSON.stringify({ ts: Date.now(), data: json }));
          sessionStorage.setItem("drfizz:lastDomain", d);
        } catch {}
      })
      .catch(() => {});
  }, [data]);

  // ── Proceed to Dashboard ──────────────────────────────────────────────────
  // Reduced from 1350 ms fake animation → 200 ms so redirect feels instant.
  const handleProceed = () => {
    if (typeof window === "undefined" || proceeding) return;
    setProceeding(true);
    setProgress(60);
    setTimeout(() => {
      setProgress(100);
      window.location.href = "/#dashboard";
    }, 200);
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d45427] to-[#ffa615] animate-pulse" />
          <div className="text-sm text-gray-500">Loading report…</div>
        </div>
      </div>
    );
  }

  // ── Not found state ───────────────────────────────────────────────────────
  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#d45427" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Report Not Found</h2>
          <p className="text-sm text-gray-500 mb-6">
            This report link has expired or was opened in a different browser tab.
            Reports are session-based — please regenerate from the dashboard.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#d45427] to-[#ffa615] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative">

      {/* ── Full-screen proceed overlay (dark-mode aware) ── */}
      {proceeding && (
        <div className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-white/95 dark:bg-[#1f2121]/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 w-full max-w-sm px-8">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#d45427] to-[#ffa615] flex items-center justify-center shadow-lg">
              <svg width="22" height="22" fill="white" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-gray-900">Loading your Dashboard</div>
              <div className="text-xs text-gray-500 mt-1">Preparing all metrics &amp; insights…</div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-[#d45427] to-[#ffa615] transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-gray-400">{progress}%</div>
          </div>
        </div>
      )}

      {/* Report content — horizontally scrollable on very small screens.
          NOTE: the `id="report-content"` lives on each renderer's root
          (WebsiteReport / PageReport), NOT on this wrapper — duplicate ids are
          invalid HTML and break getElementById/PDF capture. Keep this wrapper
          id-free so exactly one #report-content (the real report) survives. */}
      <div className="min-w-0 overflow-x-auto">
        {/* Website reports render via WebsiteReport — the reference-deck design (18
            sections, DOCTORFIZZ branding, flat orange). It now also renders the full
            §14-25 GEO model from data.doctorFizz.geo_and_ai_visibility, so nothing is
            lost vs the old DoctorFizzReport renderer. PageReport handles page reports. */}
        {reportType === "page" ? (
          <PageReport data={data} />
        ) : (
          <WebsiteReport data={data} />
        )}
      </div>

      {/* Sticky bottom bar — responsive layout for mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 sm:gap-4 py-3 sm:py-4 px-3 sm:px-6 bg-white border-t border-gray-200 shadow-lg">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full border-2 border-[#d45427] text-[#d45427] font-semibold text-xs sm:text-sm hover:bg-[#d45427] hover:text-white transition-colors whitespace-nowrap"
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" className="sm:w-4 sm:h-4">
            <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
          </svg>
          <span className="hidden xs:inline">Download</span>
          <span className="xs:hidden">PDF</span>
        </button>
        <button
          onClick={handleProceed}
          disabled={proceeding}
          className="flex items-center gap-1.5 sm:gap-2 px-5 sm:px-8 py-2.5 sm:py-3 rounded-full bg-gradient-to-r from-[#d45427] to-[#ffa615] text-white font-semibold text-xs sm:text-sm hover:opacity-90 transition-opacity disabled:opacity-70 whitespace-nowrap"
        >
          {proceeding ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="hidden sm:inline">Loading Dashboard…</span>
              <span className="sm:hidden">Loading…</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">Proceed to Dashboard</span>
              <span className="sm:hidden">Go to Dashboard</span>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20" className="sm:w-4 sm:h-4">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </>
          )}
        </button>
      </div>

      <div className="h-20 sm:h-24" />

      {showModal && (
        <DownloadReportModal
          domain={data?.domain || "report"}
          data={data}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
