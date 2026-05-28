"use client";

import React, { useMemo, useState } from "react";
import {
  ChevronRight,
  Search as SearchIcon,
  RefreshCw,
  Copy as CopyIcon,
  Loader2, // ✅ ADDED
} from "lucide-react";

/* ===============================
   Small Helpers
================================ */
function IconHintButton({
  onClick,
  label = "Paste to editor",
  size = 18,
  className = "",
}) {
  return (
    <div
      className={`relative opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto ${className}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        aria-label={label}
        className="p-0 m-0 inline-flex items-center justify-center leading-none align-middle focus:outline-none h-8 w-8"
      >
        {/* Slightly smaller, thinner, lighter grey wireframe icon */}
        <CopyIcon
          size={size}
          strokeWidth={1.5}
          className="text-gray-500 hover:text-gray-600 transition-colors"
        />
      </button>

      {/* Hint bubble */}
      <span
        className="pointer-events-none absolute -top-7 right-0 rounded-md border border-[var(--border)] bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 shadow-sm opacity-0 transition-opacity duration-75 whitespace-nowrap
                   group-hover:opacity-100 group-focus-within:opacity-100
                   dark:bg-[var(--bg-panel)] dark:text-[var(--text-primary)]"
      >
        {label}
      </span>
    </div>
  );
}

function BrandDot({ label }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-white text-[10px] font-semibold text-[var(--text-primary)] transition-colors">
      {(label || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

function EmptyState({
  title = "No results",
  subtitle = "Try a different filter or tab.",
  onRetry,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <div className="text-[13px] font-semibold text-[var(--text-primary)]">
        {title}
      </div>
      <div className="text-[12px] text-[var(--muted)]">{subtitle}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-[12px] hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Reload
        </button>
      )}
    </div>
  );
}

/* ===============================
   Row (outer element is no longer <button>)
================================ */
function FAQRow({ iconLabel, title, source, onPaste, subtitle }) {
  // Activate with keyboard like a button
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      // no default row action other than visual focus; add callback here if needed
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white transition-colors">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="group w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300 rounded-xl"
      >
        <div className="flex min-w-0 items-center gap-3">
          <BrandDot label={iconLabel} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate transition-colors">
              {title}
            </div>
            <div className="text-[11px] text-[var(--muted)] transition-colors truncate">
              {subtitle || `Source: ${source}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <IconHintButton
            onClick={() => {
              onPaste?.(title);
            }}
          />
          <ChevronRight size={18} className="text-[var(--muted)]" />
        </div>
      </div>
    </div>
  );
}

/* ===============================
   Small utilities
================================ */
function pickString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function hostFromUrl(url) {
  try {
    if (!url) return "";
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProto).hostname || "";
  } catch {
    return "";
  }
}

/* ===============================
   Main Component
================================ */
export default function SeoAdvancedFaqs({
  onPasteToEditor,
  domain,
  queryFilter = "",
  /** Max height of the scrollable FAQ list area (any CSS length) */
  maxListHeight = "30rem",
  /** Unified SEO data from /api/seo */
  seoData,
  seoLoading,
  seoError,
  /** Optional FAQ fallbacks (from dataset) */
  faqs,
}) {
  // ✅ CHANGED: default to PAA since Claude AI FAQs are shown there
  const [faqTab, setFaqTab] = useState("pa"); // serp | pa | quora | reddit
  const [kwFilter, setKwFilter] = useState("");

  const loading = !!seoLoading;
  const error = seoError || "";

  // ✅ DEBUG (ADDED): inspect what we actually receive
  useMemo(() => {
    if (typeof window === "undefined") return;

    const paa = seoData?.faqs?.peopleAlsoAsk;
    const paaLen = Array.isArray(paa) ? paa.length : "NOT_ARRAY";
    const sample = Array.isArray(paa) && paa.length ? paa[0] : null;

    console.log("=== [SeoAdvancedFaqs DEBUG] ===");
    console.log("[Faqs] seoLoading:", seoLoading);
    console.log("[Faqs] seoError:", seoError);
    console.log("[Faqs] seoData?.faqs:", seoData?.faqs);
    console.log("[Faqs] seoData?.faqs?.peopleAlsoAsk length:", paaLen);
    console.log("[Faqs] sample peopleAlsoAsk[0]:", sample);
    console.log("[Faqs] received `faqs` prop (should be ignored):", faqs);
    console.log("===============================");
  }, [seoData, seoLoading, seoError, faqs]);

  // ✅ CHANGED: Claude AI-only. Ignore `faqs` prop completely (no fallback).
  const effectiveFaqs = useMemo(() => {
    if (seoData?.faqs && typeof seoData.faqs === "object") return seoData.faqs;
    return {};
  }, [seoData]);

  // Effective domain: prop wins, else infer from authority/serp/serper
  const effectiveDomain = useMemo(() => {
    if (domain) return String(domain).toLowerCase();
    if (seoData?.authority?.domain)
      return String(seoData.authority.domain).toLowerCase();

    const firstTop = seoData?.serp?.topResults?.[0]?.link;
    if (firstTop) return hostFromUrl(firstTop).toLowerCase();

    const firstOrganic = seoData?.serper?.organic?.[0]?.link;
    if (firstOrganic) return hostFromUrl(firstOrganic).toLowerCase();

    return "";
  }, [domain, seoData]);

  /* ===============================
     Build FAQ rows (CLAUDE AI-ONLY)
     - No SERP/Serper fallback
     - No dataset fallback
     =============================== */
  const { serpRows, paRows, quoraRows, redditRows } = useMemo(() => {
    // Keep existing structure, but disable non-Claude AI sources.
    const serpBlock = seoData?.serp || seoData?.serper || {};

    const apiOrganic = Array.isArray(serpBlock.topResults)
      ? serpBlock.topResults
      : Array.isArray(serpBlock.organic)
      ? serpBlock.organic
      : [];

    // Serper "People also ask" (DISABLED: no fallback)
    const apiPaa = Array.isArray(serpBlock.peopleAlsoAsk)
      ? serpBlock.peopleAlsoAsk
      : Array.isArray(serpBlock.relatedQuestions)
      ? serpBlock.relatedQuestions
      : [];

    // Optional dataset fallbacks (DISABLED: no fallback)
    const fbSerp = Array.isArray(effectiveFaqs?.serp) ? effectiveFaqs.serp : [];
    const fbPaa = Array.isArray(effectiveFaqs?.peopleAlsoAsk)
      ? effectiveFaqs.peopleAlsoAsk
      : [];
    const fbQuora = Array.isArray(effectiveFaqs?.quora) ? effectiveFaqs.quora : [];
    const fbReddit = Array.isArray(effectiveFaqs?.reddit) ? effectiveFaqs.reddit : [];

    // ✅ CHANGED: SERP tab should not show anything (Claude AI-only requirement)
    const organic = [];

    // ✅ CHANGED: PAA comes ONLY from Claude AI output
    const peopleAlsoAsk = Array.isArray(seoData?.faqs?.peopleAlsoAsk)
      ? seoData.faqs.peopleAlsoAsk
      : [];

    const serp = [];
    const paa = [];
    const quora = [];
    const reddit = [];

    // SERP list disabled (kept loop intact but organic is empty)
    for (const item of organic) {
      const url = item.link || item.url || "";
      const host = hostFromUrl(url);
      const lcHost = host.toLowerCase();

      const dMatch = effectiveDomain ? lcHost.includes(effectiveDomain) : true;

      const qMatch = queryFilter
        ? (host + " " + (item.title || item.question || "")).toLowerCase().includes(
            queryFilter.toLowerCase()
          )
        : true;

      if (!dMatch || !qMatch) continue;

      const title = pickString(item.title, item.question, url);
      if (!title) continue;

      const fullText =
        item.snippet || item.description || item.answer || item.text || "";

      serp.push({
        iconLabel: host || "G",
        title,
        source: host || "Google",
        fullText,
        link: url,
      });

      if (lcHost.includes("quora.com")) {
        quora.push({
          iconLabel: "Q",
          title,
          source: host || "Quora",
          link: url,
        });
      } else if (lcHost.includes("reddit.com")) {
        reddit.push({
          iconLabel: "R",
          title,
          source: host || "Reddit",
          link: url,
        });
      }
    }

    // ✅ CHANGED: Claude AI-only PAA/FAQ rows
    const isClaudeMain = true;

    for (const item of peopleAlsoAsk) {
      const q = pickString(item.question, item.title);
      if (!q) continue;

      const answer = pickString(item.answer, item.snippet, item.text);
      const link = pickString(item.url, item.link);

      paa.push({
        iconLabel: isClaudeMain ? "C" : "G",
        title: isClaudeMain ? `FAQ: ${q}` : `People also ask: ${q}`,
        source: isClaudeMain ? "Claude AI" : "Google",
        fullText: answer,
        link,
      });
    }

    // Quora / Reddit fallbacks (DISABLED: no fallback)
    if (!quora.length && fbQuora.length) {
      for (const item of fbQuora) {
        const url = item.link || item.url || "";
        const host = hostFromUrl(url) || "Quora";
        const title = pickString(item.title, item.question, url);
        if (!title) continue;
        quora.push({
          iconLabel: "Q",
          title,
          source: host,
          link: url,
        });
      }
    }

    if (!reddit.length && fbReddit.length) {
      for (const item of fbReddit) {
        const url = item.link || item.url || "";
        const host = hostFromUrl(url) || "Reddit";
        const title = pickString(item.title, item.question, url);
        if (!title) continue;
        reddit.push({
          iconLabel: "R",
          title,
          source: host,
          link: url,
        });
      }
    }

    // ✅ DEBUG (ADDED): show computed row counts
    if (typeof window !== "undefined") {
      console.log("[Faqs] computed rows:", {
        serpRows: serp.length,
        paRows: paa.length,
        quoraRows: quora.length,
        redditRows: reddit.length,
        peopleAlsoAskIn: peopleAlsoAsk.length,
        apiOrganicIn: apiOrganic.length,
        apiPaaIn: apiPaa.length,
        fbSerpIn: fbSerp.length,
        fbPaaIn: fbPaa.length,
        fbQuoraIn: fbQuora.length,
        fbRedditIn: fbReddit.length,
      });
    }

    return { serpRows: serp, paRows: paa, quoraRows: quora, redditRows: reddit };
  }, [seoData, effectiveFaqs, effectiveDomain, queryFilter]);

  const filtered = useMemo(() => {
    const rows =
      faqTab === "serp"
        ? serpRows
        : faqTab === "pa"
        ? paRows
        : faqTab === "quora"
        ? quoraRows
        : redditRows;

    if (!kwFilter) return rows;
    const q = kwFilter.toLowerCase();
    return rows.filter((r) => (r?.title || "").toLowerCase().includes(q));
  }, [faqTab, kwFilter, serpRows, paRows, quoraRows, redditRows]);

  // ✅ DEBUG (ADDED): show filter + tab result length
  useMemo(() => {
    if (typeof window === "undefined") return;
    console.log("[Faqs] activeTab:", faqTab, "kwFilter:", kwFilter, "filteredLen:", filtered.length);
  }, [faqTab, kwFilter, filtered.length]);

  function handlePaste(text, row) {
    const cleanTitle = String(row?.title || text || "").trim();

    // If title has a prefix ("FAQ:" / "People also ask:"), remove it for paste Q line.
    const question = cleanTitle
      .replace(/^People also ask:\s*/i, "")
      .replace(/^FAQ:\s*/i, "")
      .trim();

    const lines = [
      question ? `Q: ${question}` : cleanTitle,
      row?.fullText ? `A: ${row.fullText}` : undefined,
      row?.link ? `Source: ${row.link}` : undefined,
    ].filter(Boolean);

    onPasteToEditor?.(lines.join("\n"));
  }

  // ✅ "generating" state (show only when nothing to show yet)
  const isGeneratingFaqs =
    !error &&
    (loading || !seoData) &&
    filtered.length === 0;

  /* ===============================
     Render
  ================================= */
  return (
    <div className="mt-1 rounded-2xl border border-[var(--border)] bg-white p-3 transition-colors">
      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-1 transition-colors">
        {["serp", "pa", "quora", "reddit"].map((k) => (
          <button
            key={k}
            onClick={() => setFaqTab(k)}
            className={`px-2 pb-2 text-[12px] font-semibold transition-all ${
              faqTab === k
                ? "text-[var(--text-primary)] border-b-2 border-amber-400"
                : "text-[var(--muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {k === "serp"
              ? "SERP"
              : k === "pa"
              ? "People also ask"
              : k === "quora"
              ? "Quora"
              : "Reddit"}
          </button>
        ))}
      </div>

      {/* Search/filter */}
      <div className="relative mt-3">
        <input
          className="w-full h-8 rounded-lg border border-[var(--border)] bg-white px-8 text-[12px] text-[var(--text-primary)] placeholder-[var(--muted)] outline-none focus:border-amber-400 transition-colors"
          placeholder="Filter by keywords"
          value={kwFilter}
          onChange={(e) => setKwFilter(e.target.value)}
        />
        <SearchIcon
          size={13}
          className="absolute left-2.5 top-2 text-[var(--muted)]"
        />
      </div>

      {/* Body (scrollable FAQ list) */}
      <div className="mt-3 min-h-[120px]">
        {isGeneratingFaqs ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white px-3 py-5 text-center dark:bg-[var(--bg-panel)]">
            <div className="inline-flex items-center gap-2 text-[12px] font-medium text-gray-700 dark:text-[var(--text-primary)]">
              <Loader2 size={16} className="animate-spin text-gray-500" />
              Your FAQs are being generated…
            </div>
            <div className="mt-1 text-[11px] text-gray-500 dark:text-[var(--muted)]">
              This usually takes a few seconds.
            </div>
          </div>
        ) : error ? (
          <EmptyState
            title="Couldn't load FAQs"
            subtitle={error}
            onRetry={() => {
              location.reload();
            }}
          />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            className="space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight: maxListHeight }}
          >
            {filtered.map((r, idx) => (
              <FAQRow
                key={idx}
                iconLabel={r.iconLabel}
                title={r.title}
                source={r.source}
                subtitle={r.link ? r.link : undefined}
                onPaste={(text) => handlePaste(text, r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
