"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Menu,
  SquareStack,
  ChevronsUp,
  ChevronsDown,
  RefreshCw,
} from "lucide-react";
import CEToolbar from "./CE.Toolbar";
import CECanvas from "./CE.Canvas";
import CEResearchPanel from "./CE.ResearchPanel";

/** Escape for regex */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Build regex for multi-word phrase */
function buildPhraseRegex(phrase) {
  const tokens = String(phrase || "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      if (t === "&" || t === "and" || t === "&amp;")
        return "(?:&|&amp;|and)";
      return esc(t);
    });
  if (!tokens.length) return null;
  const joiner = "[\\s\\-–—]+";
  const pat = `\\b${tokens.join(joiner)}\\b`;
  return new RegExp(pat, "gi");
}

/** Normalize HTML → plain text */
function normalizePlain(htmlLike) {
  return String(htmlLike || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Safe HTML text */
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Keep this in sync with the toolbar's H1/H2/H3 auto sizing */
const HEADING_SIZES = {
  h1: 28,
  h2: 22,
  h3: 18,
};

/** Build a heading block from {level,title} or a plain string */
function toHeadingHtml(input) {
  // Allow plain string (fallback to H2 styling)
  if (typeof input === "string") {
    const s = HEADING_SIZES.h2;
    return `<h2><span style="font-size:${s}px;font-weight:700">${escapeHtml(
      input
    )}</span></h2>`;
  }

  const levelRaw = String(input?.level || "H2").toLowerCase();
  const level = /^(h1|h2|h3)$/.test(levelRaw) ? levelRaw : "h2";
  const s = HEADING_SIZES[level] ?? HEADING_SIZES.h2;
  const title = escapeHtml(input?.title || "");

  // Match toolbar behavior: heading block + inline font size + bold
  return `<${level}><span style="font-size:${s}px;font-weight:700">${title}</span></${level}>`;
}

/** Convert plain text into paragraph HTML (no images possible here) */
function textToHtml(text) {
  const safe = String(text || "").trim();
  if (!safe) return "";
  return safe
    .split(/\n\s*\n/g)
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      const withBreaks = trimmed.replace(/\n/g, "<br/>");
      return `<p>${escapeHtml(withBreaks)}</p>`;
    })
    .filter(Boolean)
    .join("");
}

/**
 * ✅ Strip images but keep formatting:
 * - remove img/figure/picture/source/video/svg and their wrappers
 * - keep headings/paragraphs/lists/links/etc intact
 */
function stripImagesKeepFormatting(inputHtml) {
  let html = String(inputHtml || "");
  if (!html) return "";

  // Remove <figure> blocks completely (usually image + caption)
  html = html.replace(/<figure[\s\S]*?<\/figure>/gi, "");

  // Remove <picture> blocks completely (contains <source> + <img>)
  html = html.replace(/<picture[\s\S]*?<\/picture>/gi, "");

  // Remove standalone <img ...>
  html = html.replace(/<img\b[^>]*>/gi, "");

  // Remove <source ...> tags (often used inside picture/video)
  html = html.replace(/<source\b[^>]*>/gi, "");

  // Remove video/audio embeds (just in case)
  html = html.replace(/<video[\s\S]*?<\/video>/gi, "");
  html = html.replace(/<audio[\s\S]*?<\/audio>/gi, "");

  // Remove svg blocks (sometimes used as icons/graphics)
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, "");

  // Clean up empty paragraphs/divs created by removals
  html = html
    .replace(/<p>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/p>/gi, "")
    .replace(/<div>\s*(?:&nbsp;|\s|<br\s*\/?>)*\s*<\/div>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return html;
}

export default function CEContentArea({
  title = "Untitled",
  activeTab,
  onTabChange,
  lastEdited = "1 day ago",
  query,
  onQueryChange,
  onStart,
  seoMode: seoModeProp,
  metrics: metricsProp,
  setMetrics,
  /** NOTE: may come from JSON initially */
  content,
  /** Optional: parent setter (we still keep our own local state to prevent snapbacks) */
  setContent,
  primaryKeyword,
  lsiKeywords,
  page,
  optPageId,
  docId: docIdProp,
  seoData,
  seoLoading,
  seoError,
}) {
  const editorRef = useRef(null);

  const Tab = ({ id, children }) => {
    const is = activeTab === id;
    return (
      <button
        onClick={() => onTabChange?.(id)}
        className={`h-[34px] px-3 text-[13px] border-b-2 -mb-px transition-colors ${
          is
            ? "border-black text-black font-medium"
            : "border-transparent text-gray-500 hover:text-black"
        }`}
      >
        {children}
      </button>
    );
  };

  const MobileTab = ({ id, children }) => {
    const is = activeTab === id;
    return (
      <button
        onClick={() => onTabChange?.(id)}
        className={`h-[28px] px-2 text-[11px] border-b-2 -mb-px transition-colors ${
          is
            ? "border-black text-black font-medium"
            : "border-transparent text-gray-500 hover:text-black"
        }`}
      >
        {children}
      </button>
    );
  };

  /** ---------------------------------------------
   *  DOC ID for per-page autosave / local state
   *  --------------------------------------------- */
  const docId = useMemo(() => {
    if (docIdProp) return String(docIdProp);
    if (optPageId) return String(optPageId);
    if (page?.id) return String(page.id);
    if (page?.slug) return String(page.slug).toLowerCase();
    return String(title || "untitled").toLowerCase();
  }, [docIdProp, optPageId, page, title]);

  /** ---------------------------------------------
   *  LOCAL CONTENT STATE (prevents JSON snapbacks)
   *  --------------------------------------------- */
  const [localContent, setLocalContent] = useState(() => content || "");
  const lastLocalEditAtRef = useRef(0);
  const LOCAL_GRACE_MS = 300;

  // ✅ Seed guard (prevents update depth loops)
  const seededFromSeoRef = useRef(false);

  // One-time initialize from prop on mount (in case it’s async-loaded)
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      if (typeof content === "string" && content !== localContent) {
        setLocalContent(content);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If parent later changes `content`, adopt unless we just typed.
  // ✅ FIX: only react when the *prop* changes (prevents snapback while typing)
  const lastSeenContentPropRef = useRef(content);

  useEffect(() => {
    if (typeof content !== "string") return;

    // Only proceed when prop actually changes (not on every local keystroke)
    if (lastSeenContentPropRef.current === content) return;
    lastSeenContentPropRef.current = content;

    const justEdited = Date.now() - lastLocalEditAtRef.current < LOCAL_GRACE_MS;
    if (!justEdited && content !== localContent) {
      setLocalContent(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  /**
   * ✅ IMPORTANT FIXES:
   * - When seoData arrives, we seed editor content ONCE.
   * - We strip images before seeding (keep headings/paragraphs/lists).
   * - This also ensures metrics compute immediately (no click required).
   */
  useEffect(() => {
    if (seededFromSeoRef.current) return;

    const hasLocal =
      typeof localContent === "string" && localContent.trim().length > 0;
    if (hasLocal) return;

    const seoHtmlRaw =
      typeof seoData?.content?.html === "string" ? seoData.content.html : "";
    const seoTextRaw =
      typeof seoData?.content?.rawText === "string"
        ? seoData.content.rawText
        : "";

    // Prefer HTML to preserve headings/paragraph formatting, but strip images.
    const seoHtml = seoHtmlRaw ? stripImagesKeepFormatting(seoHtmlRaw) : "";
    const seed =
      (seoHtml && seoHtml.trim()) || (seoTextRaw && seoTextRaw.trim())
        ? (seoHtml && seoHtml.trim()) || textToHtml(seoTextRaw)
        : "";

    if (!seed) return;

    seededFromSeoRef.current = true;

    // 1) update local immediately (drives metrics)
    setLocalContent(seed);

    // 2) push upstream only if it differs (prevents loops)
    const parentSame =
      typeof content === "string" && content.trim() === seed.trim();
    if (!parentSame) setContent?.(seed);
  }, [seoData, localContent, content, setContent]);

  // When the editor changes, update local + forward upstream
  const handleSetContent = useCallback(
    (html) => {
      if (html === localContent) return;
      lastLocalEditAtRef.current = Date.now();
      setLocalContent(html);
      setContent?.(html);
    },
    [localContent, setContent]
  );

  // ----- Keyword setup -----
  // ✅ No placeholder keyword: if missing, treat as unset.
  const PRIMARY_KEYWORD = useMemo(
    () => String(primaryKeyword || "").toLowerCase().trim(),
    [primaryKeyword]
  );

  // ✅ No placeholder LSI list: use provided, else empty.
  const LSI_KEYWORDS = useMemo(
    () =>
      (Array.isArray(lsiKeywords) ? lsiKeywords : [])
        .map((k) => String(k).toLowerCase().trim())
        .filter(Boolean),
    [lsiKeywords]
  );

  // ----- Metrics state -----
  const [seoMode] = useState(seoModeProp ?? "advanced");
  const [metricsInternal, setMetricsInternal] = useState({
    plagiarism:
      typeof metricsProp?.plagiarism === "number" ? metricsProp.plagiarism : 0,
    primaryKeyword: 0,
    wordCount: 0,
    wordTarget: metricsProp?.wordTarget ?? 1250,
    lsiKeywords: 0,
    statuses: {
      wordCount: { label: "—", color: "text-[var(--muted)]" },
      primaryKeyword: { label: "—", color: "text-[var(--muted)]" },
      lsiKeywords: { label: "—", color: "text-[var(--muted)]" },
    },
  });

  // ✅ Keep the latest plagiarism from parent in a ref so metrics recompute
  // doesn't accidentally reset it to 0 or a stale value.
  const latestPlagiarismRef = useRef(
    typeof metricsProp?.plagiarism === "number" ? metricsProp.plagiarism : 0
  );

  useEffect(() => {
    if (typeof metricsProp?.plagiarism === "number") {
      latestPlagiarismRef.current = metricsProp.plagiarism;
      // keep internal aligned too (helps UI stay stable)
      setMetricsInternal((m) => ({ ...m, plagiarism: metricsProp.plagiarism }));
    }
  }, [metricsProp?.plagiarism]);

  useEffect(() => {
    if (metricsProp?.wordTarget) {
      setMetricsInternal((m) => ({ ...m, wordTarget: metricsProp.wordTarget }));
    }
  }, [metricsProp?.wordTarget]);

  /** ========= Throttled emit to parent ========= */
  const metricsTimerRef = useRef(null);
  const emitMetricsThrottled = useCallback(
    (next) => {
      if (!setMetrics) return;
      clearTimeout(metricsTimerRef.current);
      metricsTimerRef.current = setTimeout(() => {
        setMetrics(next);
      }, 80);
    },
    [setMetrics]
  );

  useEffect(() => () => clearTimeout(metricsTimerRef.current), []);

  /**
   * ✅ Metrics should compute even if localContent hasn't been pushed yet.
   * Use localContent first, else fall back to seoData (stripped of images).
   */
  const contentForMetrics = useMemo(() => {
    const local = typeof localContent === "string" ? localContent : "";
    if (local.trim()) return local;

    const seoHtmlRaw =
      typeof seoData?.content?.html === "string" ? seoData.content.html : "";
    const seoTextRaw =
      typeof seoData?.content?.rawText === "string"
        ? seoData.content.rawText
        : "";

    const seoHtml = seoHtmlRaw ? stripImagesKeepFormatting(seoHtmlRaw) : "";
    if (seoHtml.trim()) return seoHtml;

    if (seoTextRaw.trim()) return textToHtml(seoTextRaw);

    return "";
  }, [localContent, seoData]);

  // ----- Recompute metrics (debounced) -----
  useEffect(() => {
    const html = contentForMetrics;
    if (html == null) return;

    const timer = setTimeout(() => {
      const plain = normalizePlain(html);

      const currentPlagiarismForEmit = latestPlagiarismRef.current ?? 0;

      if (!plain) {
        const emptyMetrics = {
          plagiarism: currentPlagiarismForEmit,
          primaryKeyword: 0,
          wordCount: 0,
          lsiKeywords: 0,
          wordTarget: metricsInternal.wordTarget,
        };
        setMetricsInternal((m) => ({
          ...m,
          ...emptyMetrics,
          statuses: {
            wordCount: { label: "Empty", color: "text-[var(--muted)]" },
            primaryKeyword: PRIMARY_KEYWORD
              ? { label: "Needs Review", color: "text-red-600" }
              : { label: "No keyword", color: "text-[var(--muted)]" },
            lsiKeywords: LSI_KEYWORDS.length
              ? { label: "Needs Review", color: "text-red-600" }
              : { label: "—", color: "text-[var(--muted)]" },
          },
        }));
        emitMetricsThrottled(emptyMetrics);
        return;
      }

      const words = plain.split(/\s+/).filter(Boolean);
      const wordCount = words.length;

      // ✅ If no primary keyword is set, keep PK score 0 and show "No keyword".
      const pkRegex = PRIMARY_KEYWORD ? buildPhraseRegex(PRIMARY_KEYWORD) : null;
      const pkMatches = pkRegex ? (plain.match(pkRegex) || []).length : 0;
      const pkScore = PRIMARY_KEYWORD ? Math.min(100, pkMatches * 25) : 0;

      let lsiCovered = 0;
      for (const term of LSI_KEYWORDS) {
        const rx = buildPhraseRegex(term);
        if (rx && rx.test(plain)) lsiCovered += 1;
      }
      const lsiPct =
        LSI_KEYWORDS.length > 0
          ? Math.max(
              0,
              Math.min(100, Math.round((lsiCovered / LSI_KEYWORDS.length) * 100))
            )
          : 0;

      // ✅ Plagiarism is computed server-side (Claude AI) on initial open / manual refresh.
      // Keep whatever value came from parent metrics (or our internal state), and DO NOT
      // overwrite it on every keystroke.
      const currentPlagiarism = latestPlagiarismRef.current ?? 0;

      const status = (val) => {
        if (val >= 75) return { label: "Good", color: "text-green-600" };
        if (val >= 40) return { label: "Moderate", color: "text-yellow-600" };
        return { label: "Needs Review", color: "text-red-600" };
      };

      const next = {
        plagiarism: currentPlagiarism,
        wordCount,
        primaryKeyword: pkScore,
        lsiKeywords: lsiPct,
        wordTarget: metricsInternal.wordTarget,
      };

      setMetricsInternal((m) => ({
        ...m,
        ...next,
        statuses: {
          wordCount:
            wordCount >= (m.wordTarget || 1200)
              ? { label: "Good", color: "text-green-600" }
              : wordCount >= Math.round((m.wordTarget || 1200) * 0.5)
              ? { label: "Moderate", color: "text-yellow-600" }
              : { label: "Needs Review", color: "text-red-600" },
          primaryKeyword: PRIMARY_KEYWORD
            ? status(pkScore)
            : { label: "No keyword", color: "text-[var(--muted)]" },
          lsiKeywords: LSI_KEYWORDS.length
            ? status(lsiPct)
            : { label: "—", color: "text-[var(--muted)]" },
        },
      }));

      emitMetricsThrottled(next);
    }, 40);

    return () => clearTimeout(timer);
  }, [
    contentForMetrics,
    PRIMARY_KEYWORD,
    LSI_KEYWORDS,
    metricsInternal.wordTarget,
    emitMetricsThrottled,
  ]);

  const metrics = metricsProp ?? metricsInternal;
  const effectiveSeoMode = seoModeProp ?? seoMode;

  /** Paste-to-editor hook */
  const handlePasteHeadingToEditor = useCallback(
    (heading, destination = "editor") => {
      if (destination !== "editor") return;

      const items = Array.isArray(heading) ? heading : [heading];
      const blocks = items.map((item) => toHeadingHtml(item)).join("");
      const separator = localContent ? "<p><br/></p>" : "";
      const nextHtml = (localContent || "") + separator + blocks;
      handleSetContent(nextHtml);
    },
    [localContent, handleSetContent]
  );

  /**
   * Research panel content:
   * Prefer live editor, else stripped seoData HTML, else rawText.
   */
  const effectiveEditorContent =
    (localContent && localContent.trim()) ||
    (typeof seoData?.content?.html === "string" &&
      stripImagesKeepFormatting(seoData.content.html).trim()) ||
    (typeof seoData?.content?.rawText === "string" &&
      seoData.content.rawText.trim()) ||
    "";

  /** Mobile toolbar visibility */
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasTypedSinceFocus, setHasTypedSinceFocus] = useState(false);
  const baselineViewportHeightRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const KEYBOARD_THRESHOLD_PX = 150;

    const updateFromHeight = (currentHeight) => {
      if (!currentHeight) return;

      if (
        baselineViewportHeightRef.current == null ||
        currentHeight > baselineViewportHeightRef.current
      ) {
        baselineViewportHeightRef.current = currentHeight;
      }

      const baseline =
        baselineViewportHeightRef.current != null
          ? baselineViewportHeightRef.current
          : currentHeight;

      const keyboardIsOpen = baseline - currentHeight > KEYBOARD_THRESHOLD_PX;
      setKeyboardVisible(keyboardIsOpen);
    };

    const vv = window.visualViewport;
    if (vv) {
      updateFromHeight(vv.height);
      const onResize = () => updateFromHeight(vv.height);
      vv.addEventListener("resize", onResize);
      return () => vv.removeEventListener("resize", onResize);
    }

    updateFromHeight(window.innerHeight);
    const onResize = () => updateFromHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleTypingPulse = useCallback(() => {
    setHasTypedSinceFocus(true);
  }, []);
  const handleFocus = useCallback(() => {
    setHasTypedSinceFocus(false);
  }, []);
  const handleBlur = useCallback(() => {
    setHasTypedSinceFocus(false);
  }, []);

  const showMobileToolbar = keyboardVisible && hasTypedSinceFocus;

  /** Mobile metrics collapse toggle */
  const [mobileMetricsCollapsed, setMobileMetricsCollapsed] = useState(false);

  const handleToggleMobileMetrics = useCallback(() => {
    setMobileMetricsCollapsed((prev) => {
      const next = !prev;

      if (typeof window !== "undefined") {
        const stripEl = document.getElementById("ce-metrics-mobile");
        const summaryEl = document.getElementById("ce-metrics-mobile-summary");

        if (stripEl) {
          if (next) stripEl.classList.add("hidden");
          else stripEl.classList.remove("hidden");
        }

        if (summaryEl) {
          if (next) summaryEl.classList.remove("hidden");
          else summaryEl.classList.add("hidden");
        }
      }

      return next;
    });
  }, []);

  /**
   * ✅ FIX:
   * Only show the loader when an SEO fetch was actually requested (not for a brand new doc).
   */
  const hasSeoRequest = Boolean(seoData) || Boolean(seoError);

  // ✅ Optional loader: show while fetching SEO data and before we have any editor content.
  const showEditorLoader =
    Boolean(seoLoading) &&
    hasSeoRequest &&
    !(typeof localContent === "string" && localContent.trim().length > 0) &&
    !(typeof content === "string" && content.trim().length > 0) &&
    !(
      typeof seoData?.content?.html === "string" &&
      stripImagesKeepFormatting(seoData.content.html).trim().length > 0
    ) &&
    !(
      typeof seoData?.content?.rawText === "string" &&
      seoData.content.rawText.trim().length > 0
    );

  return (
    <div
      className="
        grid grid-cols-1 lg:grid-cols-[2fr_1fr] items-stretch
        rounded-[18px] overflow-hidden border border-[var(--border)] bg-white
        transition-colors
      "
    >
      {/* LEFT AREA */}
      <div className="min-w-0 bg-white lg:border-r border-[var(--border)]">
        {/* Mobile tabs row */}
        <div className="flex lg:hidden items-center gap-1 px-2 pt-[3px] border-b border-[var(--border)]">
          <button
            onMouseDown={(e) => e.preventDefault()}
            className="h-7 w-7 grid place-items-center rounded hover:bg-gray-100 text-gray-700 transition-colors"
            title="Menu"
          >
            <Menu size={14} />
          </button>
          <MobileTab id="content">Content</MobileTab>
          <MobileTab id="summary">Article Summary</MobileTab>
          <MobileTab id="final">Final Content</MobileTab>
        </div>

        {/* Desktop tabs row */}
        <div className="hidden lg:flex items-center justify-between px-2 pt-[3px]">
          <div className="flex items-center gap-1">
            <button
              onMouseDown={(e) => e.preventDefault()}
              className="h-7 w-7 grid place-items-center rounded hover:bg-gray-100 text-gray-700 transition-colors"
              title="Menu"
            >
              <Menu size={15} />
            </button>
            <Tab id="content">Content</Tab>
            <Tab id="summary">Article Summary</Tab>
            <Tab id="final">Final Content</Tab>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 pr-2">
            <span>Edited {lastEdited}</span>
            <SquareStack size={13} className="opacity-70" />
          </div>
        </div>

        {/* Desktop formatting toolbar only */}
        <div className="hidden lg:block">
          <CEToolbar editorRef={editorRef} />
        </div>

        {/* Mobile collapse chevrons */}
        <div className="flex lg:hidden items-center justify-start px-2 py-1 bg-white">
          <button
            type="button"
            onClick={handleToggleMobileMetrics}
            className="h-6 w-6 flex items-center justify-center text-gray-400"
            aria-label="Toggle metrics strip"
          >
            {mobileMetricsCollapsed ? (
              <ChevronsDown size={16} />
            ) : (
              <ChevronsUp size={16} />
            )}
          </button>
        </div>

        <div className="bg-white relative">
          {/* ✅ Loader overlay (blocks editing until fetched) */}
          {showEditorLoader && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <RefreshCw className="h-4 w-4 animate-spin text-gray-600" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900">
                    Fetching content & SEO signals…
                  </div>
                  <div className="text-[12px] text-gray-600">
                    Waiting for live data before showing the editor.
                  </div>
                </div>
              </div>
            </div>
          )}

          <CECanvas
            ref={editorRef}
            docId={docId}
            title={title}
            content={localContent}
            setContent={handleSetContent}
            onTyping={handleTypingPulse}
            onFocusEditor={handleFocus}
            onBlurEditor={handleBlur}
          />
        </div>
      </div>

      {/* RIGHT PANEL — desktop only */}
      <div className="hidden lg:block min-w-[320px] border-l border-[var(--border)] bg-white">
        <CEResearchPanel
          query={query}
          onQueryChange={onQueryChange}
          onStart={onStart}
          seoMode={effectiveSeoMode}
          metrics={metrics}
          editorContent={effectiveEditorContent}
          onPasteToEditor={handlePasteHeadingToEditor}
          page={page}
          optPageId={optPageId}
          docId={docId}
          seoData={seoData}
          seoLoading={seoLoading}
          seoError={seoError}
        />
      </div>

      {/* MOBILE: docked toolbar */}
      <div
        className={`
          lg:hidden fixed left-0 right-0 z-50
          ${
            showMobileToolbar
              ? "bottom-[env(safe-area-inset-bottom,0px)]"
              : "-bottom-24 pointer-events-none"
          }
          transition-all duration-200
        `}
      >
        <CEToolbar mode="mobile" editorRef={editorRef} />
        <div className={showMobileToolbar ? "h-14" : "h-0"} />
      </div>
    </div>
  );
}
