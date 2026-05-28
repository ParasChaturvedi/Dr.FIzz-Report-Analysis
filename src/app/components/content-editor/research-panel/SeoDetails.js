"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Monitor,
  Smartphone,
  Copy,
  Link2,
  Hash,
  Plus,
  X,
  Info,
  Wand2,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Circle,
} from "lucide-react";

/**
 * RankMath-inspired SEO panel (API-wired version)
 * ✅ No placeholders: renders a loader/empty state until real seoData arrives.
 */

const PANEL_HEIGHT = 700; // fixed internal scroll height (px)

const SUGGESTED_KEYWORDS = [
  "blogging",
  "platform",
  "best",
  "wordpress",
  "seo",
  "tutorial",
  "2025",
  "guide",
  "free",
  "beginners",
];

const avgPxPerChar = (font) =>
  font === "title" ? 9.5 : font === "desc" ? 6.5 : 8;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function titleCase(input) {
  return (input || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) =>
      [
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "for",
        "nor",
        "to",
        "of",
        "in",
        "on",
        "at",
        "by",
      ].includes(w) && i !== 0
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

function sentenceCase(input) {
  const s = (input || "").trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slugify(input) {
  return (input || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function pxEstimate(text, type) {
  return Math.round((text || "").length * avgPxPerChar(type));
}

function meterState(val, goodMin, goodMax) {
  if (val < goodMin) return "warn";
  if (val > goodMax) return "bad";
  return "good";
}

function Bar({ value, max, state }) {
  const pct = clamp((value / max) * 100, 0, 100);
  const color =
    state === "good"
      ? "bg-emerald-500"
      : state === "warn"
      ? "bg-amber-500"
      : "bg-rose-500";
  return (
    <div className="h-1.5 w-full rounded-full bg-gray-200">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function FieldHeader({ label, right, meta }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-gray-900">{label}</span>
        {meta}
      </div>
      {right}
    </div>
  );
}

function IconButton({ title, onClick, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-[12px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function useUndoable(initial) {
  const [value, setValue] = useState(initial);
  const [prev, setPrev] = useState(null);
  const set = (v) => {
    setPrev(value);
    setValue(v);
  };
  const undo = () => prev !== null && setValue(prev);
  return { value, set, undo, prev };
}

/* ============================
   Helpers to read seoData
============================ */

function getDomainFromUrl(url) {
  if (!url) return "";
  try {
    const hasProto = /^https?:\/\//i.test(url);
    const u = new URL(hasProto ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return String(url).replace(/^www\./i, "").toLowerCase();
  }
}

function splitUrl(url) {
  if (!url) {
    return { domain: "", path: "" };
  }
  try {
    const u = new URL(url);
    const domain = `${u.protocol}//${u.hostname}`;
    const path = u.pathname || "/";
    return { domain, path };
  } catch {
    // fallback: treat as domain string
    const d = getDomainFromUrl(url);
    return { domain: d ? `https://${d}` : "", path: "/" };
  }
}

/**
 * ✅ No placeholder fallbacks.
 * Only derive values that are present in seoData.
 *
 * IMPORTANT:
 * - Prefer page-extracted/meta values over SERP snippets.
 * - Never fabricate title/description from keyword.
 */
function deriveInitialFromSeo(seoData) {
  const meta = seoData?._meta || seoData?.meta || {};
  const serp = seoData?.serp || {};
  const dfs = seoData?.dataForSeo || {};
  const content = seoData?.content || seoData?.page || {};

  const primaryResult =
    serp.topResults?.[0] || serp.organic?.[0] || dfs.serpItems?.[0] || null;

  const keyword = meta.keyword || dfs.keyword || dfs.primaryKeyword || "";

  // Domain + path
  const { domain, path } = splitUrl(meta.url || seoData?.url || "");

  // Title (page-first)
  const titleCandidate =
    content.title ||
    content.pageTitle ||
    content.metaTitle ||
    meta.title ||
    dfs.metaTitle ||
    dfs.pageTitle ||
    primaryResult?.title ||
    "";

  // Description (page-first)
  const descCandidate =
    content.metaDescription ||
    content.description ||
    meta.description ||
    dfs.metaDescription ||
    dfs.description ||
    primaryResult?.snippet ||
    primaryResult?.description ||
    "";

  // Permalink text
  let permalinkText = "";
  if (path && path !== "/") {
    permalinkText = path.replace(/^\/|\/$/g, "");
  }
  if (!permalinkText && titleCandidate) {
    permalinkText = slugify(titleCandidate);
  }

  // Keywords (only if present in response)
  const kwSet = new Set();

  if (keyword) kwSet.add(titleCase(keyword));

  if (Array.isArray(dfs.topKeywords)) {
    dfs.topKeywords.slice(0, 6).forEach((k) => {
      const base = k.primaryKeyword || k.keyword || k.term || k.key || "";
      if (!base) return;
      kwSet.add(titleCase(base));
    });
  }

  // Some providers return keyword list on content block
  if (Array.isArray(content.keywords)) {
    content.keywords.slice(0, 6).forEach((k) => {
      const base = typeof k === "string" ? k : k?.keyword || k?.term || "";
      if (!base) return;
      kwSet.add(titleCase(base));
    });
  }

  const keywords = kwSet.size > 0 ? Array.from(kwSet) : [];

  return {
    domain,
    path,
    title: titleCandidate || "",
    description: descCandidate || "",
    permalink: permalinkText || "",
    keywords,
  };
}

// safe normalization of Core Web Vitals so we never return raw objects
function extractCoreWebVitals(technical) {
  if (!technical) return {};

  const lab = technical.coreWebVitals || technical.coreWebVitalsLab || {};
  const field =
    technical.coreWebVitalsField || technical.coreWebVitalsCrux || {};

  const normalizeMetric = (input) => {
    if (input == null) return null;

    if (typeof input === "number") return input;

    if (typeof input === "string") {
      const num = parseFloat(input);
      return Number.isFinite(num) ? num : input;
    }

    if (typeof input === "object") {
      if (typeof input.p75 === "number") return input.p75;
      if (typeof input.value === "number") return input.value;
      if (typeof input.numericValue === "number") return input.numericValue;

      if (input.value != null) {
        const num = parseFloat(input.value);
        if (Number.isFinite(num)) return num;
        return String(input.value);
      }
    }

    return String(input);
  };

  const lcpRaw = field.LCP ?? field.lcp ?? lab.LCP ?? lab.lcp ?? null;
  const clsRaw = field.CLS ?? field.cls ?? lab.CLS ?? lab.cls ?? null;

  const lcp = normalizeMetric(lcpRaw);
  const cls = normalizeMetric(clsRaw);

  return { lcp, cls };
}

function extractPerformanceScore(technical) {
  if (!technical) return null;
  const mobile = technical.performanceScoreMobile;
  const desktop = technical.performanceScoreDesktop;
  const generic = technical.performanceScore;

  if (typeof generic === "number") return generic;
  if (typeof mobile === "number" && typeof desktop === "number") {
    return Math.round((mobile + desktop) / 2);
  }
  if (typeof mobile === "number") return mobile;
  if (typeof desktop === "number") return desktop;
  return null;
}

function LoaderBlock({
  title = "Fetching SEO data…",
  subtitle = "Please wait while we pull live signals for this domain.",
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white">
          <RefreshCw className="h-4 w-4 animate-spin text-gray-600" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-[12px] text-gray-600">{subtitle}</div>
        </div>
      </div>

      {/* Skeleton */}
      <div className="mt-4 space-y-2">
        <div className="h-3 w-2/3 rounded bg-gray-200" />
        <div className="h-3 w-full rounded bg-gray-200" />
        <div className="h-3 w-5/6 rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-200" />
      </div>
    </div>
  );
}

function EmptyState({
  title = "No SEO data yet",
  subtitle = "Enter a domain and run the fetch to see SEO Details.",
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-[13px] font-semibold text-gray-900">{title}</div>
      <div className="mt-1 text-[12px] text-gray-600">{subtitle}</div>
    </div>
  );
}

/* ============================
   Component
============================ */

export default function SeoDetails({
  // props from CE.ResearchPanel wired to /api/seo
  seoData,
  seoLoading,
  seoError,
}) {
  // device preview
  const [device, setDevice] = useState("desktop");

  // ✅ Start empty (no placeholders)
  const [domain, setDomain] = useState("");
  const [path, setPath] = useState("");

  // main fields (undoable) — start empty
  const title = useUndoable("");
  const description = useUndoable("");
  const permalink = useUndoable("");

  const [keywords, setKeywords] = useState([]);
  const [kwDraft, setKwDraft] = useState("");

  const [pillar, setPillar] = useState(false);
  const primaryKeyword = keywords[0] || "";

  // live SEO slices
  const technical = seoData?.technicalSeo || null;
  const authority = seoData?.authority || null;

  const performanceScore = extractPerformanceScore(technical);
  const { lcp, cls } = extractCoreWebVitals(technical);

  // Initialize per-domain (reset when url changes)
  const [initializedFromSeo, setInitializedFromSeo] = useState(false);
  const lastUrlRef = useRef(null);

  const seoUrl = seoData?._meta?.url || seoData?.meta?.url || seoData?.url || "";
  useEffect(() => {
    // When a new fetch kicks off, clear state and allow re-init.
    // This prevents old-domain values from flashing.
    if (seoLoading) {
      setInitializedFromSeo(false);
      lastUrlRef.current = null;
      setDomain("");
      setPath("");
      title.set("");
      description.set("");
      permalink.set("");
      setKeywords([]);
      setKwDraft("");
      return;
    }

    // If url changes, allow re-init
    const key = String(seoUrl || "");
    if (key && key !== lastUrlRef.current) {
      setInitializedFromSeo(false);
      lastUrlRef.current = key;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seoLoading, seoUrl]);

  useEffect(() => {
    if (!seoData || seoLoading || initializedFromSeo) return;

    const init = deriveInitialFromSeo(seoData);

    setDomain(init.domain || "");
    setPath(init.path || "");

    title.set(init.title || "");
    description.set(init.description || "");
    permalink.set(init.permalink || "");
    setKeywords(Array.isArray(init.keywords) ? init.keywords : []);

    setInitializedFromSeo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seoData, seoLoading, initializedFromSeo]);

  const hasData =
    Boolean(
      domain || path || title.value || description.value || keywords.length
    ) || Boolean(technical || authority);

  // --- Meters
  const titleChars = title.value.length;
  const titlePx = pxEstimate(title.value, "title");
  const titleState = meterState(titleChars, 45, 60);

  const slug = useMemo(
    () => slugify(permalink.value || title.value),
    [permalink.value, title.value]
  );
  const slugPx = pxEstimate(slug, "slug");
  const slugState = meterState(slug.length, 20, 75);

  const descChars = description.value.length;
  const descPx = pxEstimate(description.value, "desc");
  const descState = meterState(descChars, 120, 160);

  // --- Helpers
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert(text);
    }
  };

  const includePrimaryIn = useCallback(
    (s) =>
      primaryKeyword &&
      !new RegExp(`\\b${primaryKeyword}\\b`, "i").test(s || ""),
    [primaryKeyword]
  );

  // --- Generators (local heuristics)
  const generateTitle = () => {
    const base = titleCase(
      `${primaryKeyword || "Blogging"} Platforms Compared: ${new Date().getFullYear()} Guide`
    );
    title.set(base);
  };

  const improveTitle = () => {
    const t = title.value;
    let improved = titleCase((t || "").replace(/\s+/g, " ").trim());
    if (includePrimaryIn(improved)) improved = `${primaryKeyword} — ${improved}`;
    if (!/(\d{4})/.test(improved)) improved += ` (${new Date().getFullYear()})`;
    title.set(improved);
  };

  const generateSlug = () => {
    const s = slugify(primaryKeyword ? `${primaryKeyword} ${title.value}` : title.value);
    permalink.set(s);
  };

  const generateDescription = () => {
    const year = new Date().getFullYear();
    const kw = primaryKeyword ? `${primaryKeyword.toLowerCase()} ` : "";
    const crafted = sentenceCase(
      `Discover the best ${kw}platforms in ${year} with pros, cons, pricing, and ideal use cases — including WordPress, Wix, Squarespace, and more`
    );
    description.set(crafted);
  };

  // --- Lint: Title corrections
  const titleIssues = useMemo(() => {
    const tVal = title.value;
    const issues = [];
    if (!tVal) return issues;

    if (/[a-z]/.test(tVal) && tVal === tVal.toLowerCase()) {
      issues.push({
        id: "titlecase",
        label: "Apply Title Case",
        apply: () => title.set(titleCase(tVal)),
      });
    }
    if (includePrimaryIn(tVal)) {
      issues.push({
        id: "kw",
        label: `Include primary keyword “${primaryKeyword}”`,
        apply: () => title.set(`${tVal} | ${primaryKeyword}`),
      });
    }
    if (tVal.length > 60) {
      issues.push({
        id: "trim",
        label: "Trim length to under ~60 characters",
        apply: () => title.set(tVal.slice(0, 60).replace(/\s+\S*$/, "")),
      });
    }
    if (!/(\d{4})/.test(tVal)) {
      issues.push({
        id: "fresh",
        label: "Add current year for freshness",
        apply: () => title.set(`${tVal} (${new Date().getFullYear()})`),
      });
    }
    return issues;
  }, [primaryKeyword, includePrimaryIn, title]);

  // --- Keyword input handlers
  const addKeyword = (k) => {
    const cleaned = titleCase((k || "").trim());
    if (!cleaned) return;
    setKeywords((prev) => {
      if (prev.find((p) => p.toLowerCase() === cleaned.toLowerCase())) return prev;
      return [...prev, cleaned];
    });
    setKwDraft("");
  };

  const removeKeyword = (k) =>
    setKeywords((prev) =>
      prev.filter((p) => p.toLowerCase() !== (k || "").toLowerCase())
    );

  const kwSuggestions = useMemo(() => {
    const pool = Array.from(
      new Set(
        [...SUGGESTED_KEYWORDS, ...title.value.toLowerCase().split(/\W+/)].filter(Boolean)
      )
    );
    return pool
      .filter(
        (s) =>
          s.startsWith((kwDraft || "").toLowerCase()) &&
          !keywords.map((k) => k.toLowerCase()).includes(s.toLowerCase())
      )
      .slice(0, 6);
  }, [kwDraft, keywords, title.value]);

  // Auto-update path preview when slug changes (only if we have a domain/path context)
  useEffect(() => {
    if (!slug) return;
    setPath(`/${slug}/`);
  }, [slug]);

  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white text-[12px] text-gray-600 shadow-sm"
      style={{
        height: PANEL_HEIGHT,
        overflowY: "auto",
        padding: 16,
        paddingRight: 12,
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[18px] font-semibold text-gray-900">SEO Details</div>
        <div className="flex items-center gap-2">
          <IconButton title="Desktop preview" onClick={() => setDevice("desktop")}>
            <Monitor
              className={`h-4 w-4 ${device === "desktop" ? "text-emerald-600" : ""}`}
            />
          </IconButton>
          <IconButton title="Mobile preview" onClick={() => setDevice("mobile")}>
            <Smartphone
              className={`h-4 w-4 ${device === "mobile" ? "text-emerald-600" : ""}`}
            />
          </IconButton>
        </div>
      </div>

      {/* Loader / error / empty */}
      {seoLoading && <LoaderBlock />}
      {seoError && !seoLoading && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          Failed to load live SEO data: {seoError}
        </div>
      )}
      {!seoLoading && !seoError && !hasData && <EmptyState />}

      {/* Live SEO data summary (from seoData) */}
      {!seoLoading && !seoError && (technical || authority) && (
        <div className="mb-4 grid gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700 sm:grid-cols-2">
          {technical && (
            <div>
              <div className="text-[12px] font-semibold text-gray-900">Technical SEO</div>
              {performanceScore != null && (
                <div className="mt-1">
                  Performance score:{" "}
                  <span className="font-semibold">{Math.round(performanceScore)}</span>
                </div>
              )}
              {(lcp != null || cls != null) && (
                <div className="mt-1 space-y-0.5">
                  {lcp != null && (
                    <div>
                      LCP: <span className="font-semibold">{lcp}</span>
                    </div>
                  )}
                  {cls != null && (
                    <div>
                      CLS: <span className="font-semibold">{cls}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {authority && (
            <div>
              <div className="text-[12px] font-semibold text-gray-900">Authority</div>
              {authority.domainRating != null && (
                <div className="mt-1">
                  Domain Rating:{" "}
                  <span className="font-semibold">{authority.domainRating}</span>
                </div>
              )}
              {authority.referringDomains != null && (
                <div className="mt-1">
                  Referring domains:{" "}
                  <span className="font-semibold">{authority.referringDomains}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main UI only when data exists */}
      {!seoLoading && !seoError && hasData && (
        <>
          {/* SERP Preview Card */}
          {(domain || path || title.value || description.value) && (
            <div className="mb-6 rounded-xl border border-gray-200 p-4">
              {(domain || path) && (
                <div className="mb-2 text-gray-500">
                  {domain}
                  {path}
                </div>
              )}
              {title.value && (
                <div className="mb-2 text-[20px] font-semibold leading-snug text-[#1a0dab]">
                  {title.value}
                </div>
              )}
              {description.value && (
                <div className="text-[13px] leading-relaxed">{description.value}</div>
              )}
            </div>
          )}

          {/* Focus Keywords */}
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <FieldHeader
              label="Focus Keywords"
              meta={
                <span
                  title="Pick 3–5 main keywords to target."
                  className="inline-flex items-center text-gray-400"
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              }
              right={
                <div className="flex items-center gap-2">
                  <IconButton
                    title="Auto-suggest from title"
                    onClick={() => {
                      const words = Array.from(
                        new Set(
                          title.value
                            .split(/\W+/)
                            .filter((w) => w.length > 3 && isNaN(Number(w)))
                        )
                      );
                      setKeywords(words.slice(0, 5).map(titleCase));
                    }}
                    disabled={!title.value}
                  >
                    <Sparkles className="h-4 w-4" />
                    Suggest
                  </IconButton>
                  <IconButton
                    title="Copy keywords"
                    onClick={() => copy(keywords.join(", "))}
                    disabled={keywords.length === 0}
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </IconButton>
                </div>
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              {keywords.map((k, i) => (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] ${
                    i === 0
                      ? "ring-1 ring-emerald-600 text-emerald-700"
                      : "text-emerald-700"
                  }`}
                  title={i === 0 ? "Primary keyword" : undefined}
                >
                  <Hash className="h-3 w-3" />
                  {k}
                  <button
                    onClick={() => removeKeyword(k)}
                    className="ml-1 rounded p-0.5 hover:bg-emerald-100"
                    aria-label={`Remove ${k}`}
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <div className="relative">
                <div className="flex items-center rounded-full border border-gray-200 bg-white px-2">
                  <Plus className="h-4 w-4 text-gray-400" />
                  <input
                    value={kwDraft}
                    onChange={(e) => setKwDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword(kwDraft);
                      }
                    }}
                    placeholder="Add…"
                    className="w-40 bg-transparent p-1 text-[12px] outline-none"
                    aria-label="Add focus keyword"
                  />
                </div>
                {kwDraft && kwSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    {kwSuggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => addKeyword(s)}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-gray-50"
                      >
                        <Hash className="h-3.5 w-3.5 text-gray-400" />
                        {titleCase(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={pillar}
                  onChange={() => setPillar((p) => !p)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-[12px] text-gray-700">This post is Pillar content</span>
                <Info
                  title="Mark long-form, evergreen resources as Pillar to prioritize internal links."
                  className="h-3.5 w-3.5 text-gray-400"
                />
              </label>
            </div>
          </div>

          {/* Title */}
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <FieldHeader
              label="Title"
              meta={
                <span className="ml-2 text-gray-400">
                  {titleChars} / 60 ({titlePx}px / 580px)
                </span>
              }
              right={
                <div className="flex items-center gap-2">
                  <IconButton title="Undo" onClick={title.undo} disabled={!title.prev}>
                    <RefreshCw className="h-4 w-4" />
                    Undo
                  </IconButton>
                  <IconButton
                    title="Copy Title"
                    onClick={() => copy(title.value)}
                    disabled={!title.value}
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </IconButton>
                </div>
              }
            />

            <input
              value={title.value}
              onChange={(e) => title.set(e.target.value)}
              className="mb-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
              placeholder="Title (fetched from page meta/serp)…"
            />
            <Bar value={titleChars} max={70} state={titleState} />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200">
                <div className="flex items-center gap-4 border-b border-gray-100 px-3 py-2 text-gray-700">
                  <span className="text-[12px] font-medium text-emerald-700">Check Correction</span>
                </div>
                <div className="p-3">
                  {titleIssues.length === 0 ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Looks great! No suggestions.
                    </div>
                  ) : (
                    titleIssues.map((it) => (
                      <label key={it.id} className="mb-2 flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          onChange={(e) => e.target.checked && it.apply?.()}
                        />
                        <span className="text-[12px]">{it.label}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="flex items-center gap-4 border-b border-gray-100 px-3 py-2 text-gray-700">
                  <span className="text-[12px] font-medium">Generate AI title</span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="text-[12px] text-gray-500">Create a fresh, keyword-rich title.</div>
                  <div className="flex gap-2">
                    <IconButton title="Improve current" onClick={improveTitle} disabled={!title.value}>
                      <Wand2 className="h-4 w-4" />
                      Improve
                    </IconButton>
                    <IconButton title="Generate new" onClick={generateTitle}>
                      <Sparkles className="h-4 w-4" />
                      Generate
                    </IconButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Permalink */}
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <FieldHeader
              label="Permalink"
              meta={
                <span className="ml-2 text-gray-400">
                  {slug.length} / 80 ({slugPx}px / 580px)
                </span>
              }
              right={
                <div className="flex items-center gap-2">
                  <IconButton title="Undo" onClick={permalink.undo} disabled={!permalink.prev}>
                    <RefreshCw className="h-4 w-4" />
                    Undo
                  </IconButton>
                  <IconButton
                    title="Copy URL"
                    onClick={() => copy(`${domain}/${slug}`)}
                    disabled={!domain || !slug}
                  >
                    <Link2 className="h-4 w-4" />
                    Copy URL
                  </IconButton>
                </div>
              }
            />

            <input
              value={permalink.value}
              onChange={(e) => permalink.set(e.target.value)}
              placeholder="Permalink (fetched from URL path / generated)…"
              className="mb-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
            />
            {domain && slug && (
              <div className="mb-2 text-[12px] text-gray-500">
                Preview: <span className="font-medium text-gray-800">{domain}/{slug}</span>
              </div>
            )}
            <Bar value={slug.length} max={80} state={slugState} />

            <div className="mt-3 flex flex-wrap gap-2">
              <IconButton
                title="Slugify from title"
                onClick={generateSlug}
                disabled={!title.value && !primaryKeyword}
              >
                <Wand2 className="h-4 w-4" />
                Generate slug
              </IconButton>
              <IconButton
                title="Append primary keyword"
                onClick={() => permalink.set(`${slug}-${slugify(primaryKeyword || "")}`)}
                disabled={!primaryKeyword || !slug}
              >
                <Hash className="h-4 w-4" />
                Add keyword
              </IconButton>
            </div>
          </div>

          {/* Description */}
          <div className="mb-2 rounded-xl border border-gray-200 p-4">
            <FieldHeader
              label="Description"
              meta={
                <span className="ml-2 text-gray-400">
                  {descChars} / 160 ({descPx}px / 920px)
                </span>
              }
              right={
                <div className="flex items-center gap-2">
                  <IconButton title="Undo" onClick={description.undo} disabled={!description.prev}>
                    <RefreshCw className="h-4 w-4" />
                    Undo
                  </IconButton>
                  <IconButton
                    title="Copy Description"
                    onClick={() => copy(description.value)}
                    disabled={!description.value}
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </IconButton>
                </div>
              }
            />

            <textarea
              value={description.value}
              onChange={(e) => description.set(e.target.value)}
              rows={3}
              placeholder="Description (fetched from page meta/serp)…"
              className="mb-2 w-full resize-y rounded-lg border border-gray-200 bg-white p-3 text-[13px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
            />
            <Bar value={descChars} max={170} state={descState} />

            <div className="mt-3 flex flex-wrap gap-2">
              <IconButton
                title="Lightly improve description"
                onClick={() =>
                  description.set(sentenceCase(description.value.replace(/\s+/g, " ").trim()))
                }
                disabled={!description.value}
              >
                <Wand2 className="h-4 w-4" />
                Improve
              </IconButton>
              <IconButton title="Generate new description" onClick={generateDescription}>
                <Sparkles className="h-4 w-4" />
                Generate
              </IconButton>
            </div>

            {includePrimaryIn(description.value) && primaryKeyword && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
                <Circle className="h-3.5 w-3.5" />
                Consider including your primary keyword “{primaryKeyword}” in the description.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
