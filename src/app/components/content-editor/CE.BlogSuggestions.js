"use client";

// CE.BlogSuggestions — the "New blog" entry screen (pixel-matched to Figma Blog intro).
// Pixel-matches the Figma "Blog intro" frame (VR4DZWLHbFKfCEJTYeuPKB · 1:23912):
// a two-panel modal — left peach-gradient hero ("CREATE, OPTIMIZE & PUBLISH"),
// right a "Select any 1 to proceed" list. The list holds 5 REAL, research-based
// topic ideas (from /api/content/suggest, grounded on the site's own profile +
// keyword universe). The client picks one and we generate a full, publish-ready
// article to the house standard. No dummy data.

import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  X,
  ArrowRight,
  AlertTriangle,
  FileText,
} from "lucide-react";

const INTENT_LABEL = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
};

const DIFF_STYLE = {
  low: "text-emerald-600",
  medium: "text-amber-600",
  high: "text-rose-600",
};

function SkeletonCard() {
  return (
    <div className="w-full rounded-2xl p-4 bg-white dark:bg-[#1f2121] border border-[#EFEFEF] dark:border-[#374151] shadow-[0_2px_10px_rgba(0,0,0,0.06)] flex items-center justify-between">
      <div className="pr-3 flex-1">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-[#374151] animate-pulse" />
        <div className="mt-2 h-3 w-full rounded bg-gray-100 dark:bg-[#2a2c2c] animate-pulse" />
        <div className="mt-1.5 h-3 w-2/3 rounded bg-gray-100 dark:bg-[#2a2c2c] animate-pulse" />
      </div>
      <div className="h-[85px] w-[116px] shrink-0 rounded-[14px] bg-[#E5E7EB] dark:bg-[#374151] animate-pulse" />
    </div>
  );
}

export default function CEBlogSuggestions({
  open,
  domain = "",
  businessContext = "",
  onPick,
  onClose,
  onStartBlank,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [hover, setHover] = useState(0);

  const load = useCallback(async () => {
    if (!domain) {
      setError("No website found. Run a report first so we can research topics for your site.");
      setSuggestions([]);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/content/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, businessContext, count: 5 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
    } catch (e) {
      setError(e?.message || "Could not load topic suggestions.");
    } finally {
      setLoading(false);
    }
  }, [domain, businessContext]);

  useEffect(() => {
    if (open && !suggestions.length && !loading && !error) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="
          relative grid overflow-hidden rounded-2xl bg-white dark:bg-[#1f2121] shadow-2xl
          w-[min(980px,100vw-32px)]
          grid-cols-1 md:grid-cols-2
          h-[92vh] md:h-[min(620px,88vh)]
          min-h-0
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 dark:border-[#374151] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#2a2c2c]"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Mobile banner */}
        <div className="md:hidden relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 -right-16 h-72 w-72 rounded-full"
            style={{
              background:
                "radial-gradient(160px 160px at 65% 40%, #F8B06B 0%, #F39C4F 45%, rgba(248,176,107,0.2) 70%, rgba(255,255,255,0) 72%)",
            }}
          />
          <div className="pt-12 pb-3 px-6 text-center">
            <div className="text-[34px] font-extrabold leading-[1.05] tracking-tight text-[#0F172A] dark:text-white break-words">
              CREATE,<br />
              OPTIMIZE &<br />
              PUBLISH
            </div>
            <div className="mt-2 text-[13px] text-[#9CA3AF]">No tab-hopping required.</div>
          </div>
        </div>

        {/* Desktop left banner (pixel-match Figma Blog intro) */}
        <div
          className="relative hidden min-h-[520px] flex-col justify-end p-10 md:flex"
          style={{
            background:
              "radial-gradient(520px 220px at -8% 70%, #FAD7A5 0%, transparent 65%), #FFF9F2",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-[-90px] top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(150px 150px at 60% 45%, #F8B06B 0%, #F39C4F 48%, rgba(248,176,107,0.18) 72%, rgba(255,255,255,0) 74%)",
            }}
          />
          <div className="pointer-events-none relative select-none">
            <div className="text-[56px] font-extrabold leading-[0.95] tracking-tight text-[#0F172A] break-words">
              CREATE,<br />
              OPTIMIZE &<br />
              PUBLISH
            </div>
            <div className="mt-4 text-[15px] text-[#6B7280]">No tab-hopping required.</div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex h-full min-h-0 flex-col bg-[#FAFAFA] dark:bg-[#2a2c2c]">
          {/* Header */}
          <div className="flex flex-col p-6 pb-3">
            <div className="text-xl font-semibold text-[#0F172A] dark:text-white">Blogs</div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
              Research-based topics{domain ? ` for ${domain}` : ""}. Each one is grounded on your site and keywords, ready to write to the house standard.
            </p>
          </div>

          {/* Card 4 (Figma) — select header + card list share one bordered panel */}
          <div className="mx-6 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#ECECEC] dark:border-[#374151] bg-[#F5F5F5] dark:bg-[#1f2121]">
            <div className="px-4 pt-3">
              <div className="text-[12px] text-[#9CA3AF]">
                Select any <span className="font-medium text-[#6B7280] dark:text-gray-300">1 to proceed</span>
              </div>
              <div className="mt-2 border-t border-[#E5E7EB] dark:border-[#374151]" />
            </div>

            {/* Scrollable list */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-3"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-[12.5px] text-[#B91C1C]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {loading && (
              <div className="space-y-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}

            {!loading && !error && suggestions.length === 0 && (
              <div className="rounded-2xl border border-[#EFEFEF] dark:border-[#374151] bg-white dark:bg-[#1f2121] p-5 text-center text-[13px] text-[#6B7280]">
                No topics yet. Try regenerating.
              </div>
            )}

            {!loading && suggestions.length > 0 && (
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.primaryKeyword || s.title}-${i}`}
                    onMouseEnter={() => setHover(i)}
                    onClick={() => onPick?.(s)}
                    aria-pressed={hover === i}
                    title="Click to generate a full article on this topic"
                    className={`
                      group w-full rounded-2xl p-4 text-left transition
                      bg-white dark:bg-[#1f2121] border border-[#EFEFEF] dark:border-[#374151] shadow-[0_2px_10px_rgba(0,0,0,0.06)]
                      flex items-center justify-between gap-3
                      ${hover === i ? "ring-1 ring-[#D45427]/30" : "hover:ring-1 hover:ring-black/5 dark:hover:ring-[#374151]"}
                    `}
                  >
                    <div className="min-w-0 pr-1">
                      <div className="font-semibold text-[15px] text-[#0F172A] dark:text-white break-words">
                        {s.title}
                      </div>
                      {s.angle && (
                        <div className="mt-1 max-w-[380px] text-[12px] leading-relaxed text-[#6B7280]">
                          {s.angle}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#9CA3AF]">
                        {s.primaryKeyword && (
                          <span className="font-medium text-[#B4531B]">{s.primaryKeyword}</span>
                        )}
                        {s.intent && (
                          <>
                            <span className="text-[#D1D5DB]">·</span>
                            <span>{INTENT_LABEL[s.intent] || s.intent}</span>
                          </>
                        )}
                        {s.difficulty && (
                          <>
                            <span className="text-[#D1D5DB]">·</span>
                            <span className={DIFF_STYLE[s.difficulty] || DIFF_STYLE.medium}>
                              {s.difficulty[0].toUpperCase() + s.difficulty.slice(1)} difficulty
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="relative shrink-0">
                      <div className="grid h-[85px] w-[116px] place-items-center rounded-[14px] bg-gradient-to-br from-[#F0782E] to-[#FBA43C] text-white">
                        <FileText size={20} className="opacity-90" />
                        <span className="absolute right-2 top-1.5 text-[11px] font-bold opacity-90">
                          {i + 1}
                        </span>
                      </div>
                      <div className="pointer-events-none absolute inset-2 rounded-[10px] border border-white/40" />
                      <ArrowRight
                        size={16}
                        className="absolute -left-5 top-1/2 -translate-y-1/2 text-[#D45427] opacity-0 transition group-hover:opacity-100"
                      />
                    </div>
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>

          {/* Sticky footer (pixel-match Figma) */}
          <div className="sticky bottom-0 left-0 right-0 bg-[#FAFAFA] dark:bg-[#2a2c2c] border-t border-[#E5E7EB] dark:border-[#374151] px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={onStartBlank}
              className="text-[13px] font-medium text-[#D45427] hover:brightness-95"
            >
              Start from scratch
            </button>

            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white bg-[#D45427] hover:brightness-95 shadow-sm disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Researching…" : "Regenerate ideas"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

