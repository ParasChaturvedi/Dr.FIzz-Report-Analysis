"use client";

// CE.ImprovePanel — the "existing content" flow (flows 2 & 4).
// For a blog or page that already has content, this asks the AI for a concrete,
// prioritised improvement plan (what to ADD, REPLACE, REMOVE) via
// /api/content/generate with mode:"existing". It SHOWS the plan (it never
// overwrites the article), so the writer keeps their draft and works the list.

import React, { useCallback, useEffect, useState } from "react";
import { Sparkles, RefreshCw, X, AlertTriangle, ClipboardList } from "lucide-react";

function stripHtml(html) {
  return String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

export default function CEImprovePanel({
  open,
  type = "blog", // "blog" | "page"
  title = "",
  keyword = "",
  domain = "",
  businessContext = "",
  content = "",
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [planHtml, setPlanHtml] = useState("");
  const [meta, setMeta] = useState(null);

  const load = useCallback(async () => {
    if (!stripHtml(content)) {
      setError("There is no content to analyse yet. Add or generate content first.");
      setPlanHtml("");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          mode: "existing",
          keyword,
          title,
          domain,
          businessContext,
          existingContent: content,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Failed (${res.status})`);
      setPlanHtml(json.contentHtml || "");
      setMeta(json.meta || null);
    } catch (e) {
      setError(e?.message || "Could not generate an improvement plan.");
    } finally {
      setLoading(false);
    }
  }, [type, keyword, title, domain, businessContext, content]);

  useEffect(() => {
    if (open && !planHtml && !loading && !error) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const kind = type === "page" ? "page" : "blog";

  return (
    <div
      className="fixed inset-0 z-[8500] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="mt-6 mb-6 w-full max-w-[760px] rounded-[16px] border border-[var(--border)] bg-[var(--bg-panel,#fff)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-[#F0782E] to-[#FBA43C] text-white shadow-sm">
            <ClipboardList size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
              Improve this {kind}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--text)] opacity-70">
              A prioritised plan of what to add, replace, and remove for better SEO and results. Your existing content stays exactly as it is.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text)] opacity-60 hover:bg-[var(--hover)] hover:opacity-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[64vh] overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-[10px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-[12.5px] text-[#B91C1C]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#d45427] to-[#ffa615] shadow-lg animate-pulse">
                <Sparkles size={20} className="text-white" />
              </div>
              <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                Reviewing your {kind}…
              </div>
              <div className="text-[12px] text-[var(--text)] opacity-60">
                A 20-year expert AI is auditing the content against the house standard. This can take 20 to 60 seconds.
              </div>
            </div>
          )}

          {!loading && planHtml && (
            <div
              className="ce-improve-plan prose max-w-none text-[13.5px] leading-relaxed text-[var(--text-primary)]
                prose-h2:text-[16px] prose-h2:font-bold prose-h2:mt-5 prose-h2:mb-2
                prose-h3:text-[14px] prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-1.5
                prose-ul:list-disc prose-ul:pl-5 prose-ul:my-2 prose-li:my-1
                prose-p:my-2 prose-strong:font-semibold"
              dangerouslySetInnerHTML={{ __html: planHtml }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Reviewing…" : "Re-run review"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] bg-gradient-to-br from-[#F0782E] to-[#FBA43C] px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
