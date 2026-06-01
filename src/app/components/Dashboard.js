// src/components/Dashboard.js
"use client";
import Image from "next/image";
import { Activity, ActivitySquare, AlertTriangle, BarChart3, BookOpen, Check, ChevronRight, Clock3, Eye, FileText, Gauge, Goal, HelpCircle, KeyRound, Lightbulb, Link2, Lock, Monitor, Network, PencilLine, RefreshCw, Rocket, Settings, ShieldCheck, Skull, SlidersHorizontal, Smartphone, SquareArrowOutUpRight, ThumbsDown, ThumbsUp, TrendingUp, TrendingDown, Wifi, X } from "lucide-react";
import { useEffect, useRef, useState, useMemo , useCallback} from "react";
import { useSearchParams } from "next/navigation";
import OpportunitiesSection from "./OpportunitiesSection";
import NewOnPageSEOTable from "./NewOnPageSEOTable";
import DashboardHeader from "./DashboardHeader";

// --- Prefill content templates for the 4 "Top On-Page Content Opportunities" cards ---
const PREFILL_BY_TITLE = {
  "How to Choose a CRM for SMEs": `Intro: Picking the right CRM for SMEs depends on workflows, budget, and integration needs.
H2: Audit your current sales workflows
H2: Must-have features vs nice-to-haves
H2: Integration plan (email, billing, WhatsApp)
Conclusion: Pilot with a small team and measure adoption.`,
  "What Is Content Marketing?": `Content marketing is the strategic creation and distribution of helpful content to attract qualified audiences.
H2: Why content compounds over time
H2: Editorial calendar & topic clusters
H2: Measuring ROI beyond vanity metrics`,
  "Pricing Page Optimization": `Your pricing page is a high-intent surface—remove friction and make comparison effortless.
H2: Clarity over cleverness
H2: Social proof and objection handlers
H2: Common layout patterns that convert`,
  "Contact Page Best Practices": `The contact page reduces uncertainty and sets response expectations.
H2: Inline FAQs to deflect simple queries
H2: Trust signals (office address, phone, SLA)
H2: Clear next steps after submit`,
};

function getPrefillFor(title) {
  return PREFILL_BY_TITLE[title] ?? "";
}
// --- End prefill helpers ---

/** Normalize a domain string -> "example.com" */
function normalizeDomain(input = "") {
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  } catch {
    return String(input)
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}


// ---- Client-side cache helpers (sessionStorage) ----
const SEO_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function ssGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function ssSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch {}
}
function loadSeoCache(domain) {
  if (typeof window === "undefined") return null;
  const d = normalizeDomain(domain || "");
  if (!d) return null;
  const raw = ssGet(`drfizz:seo:${d}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.data) return null;
    return parsed; // { ts, data }
  } catch {
    return null;
  }
}
function saveSeoCache(domain, data) {
  if (typeof window === "undefined") return;
  const d = normalizeDomain(domain || "");
  if (!d) return;
  ssSet(`drfizz:seo:${d}`, JSON.stringify({ ts: Date.now(), data }));
  ssSet("drfizz:lastDomain", d);
}
// Add this helper inside Dashboard()

/** Deterministic pseudo-random (stable per domain) */
function hashStringToSeed(str = "") {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function pickFirstNumber(...cands) {
  for (const c of cands) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return undefined;
}

function pickFirstPositiveNumber(...cands) {
  for (const c of cands) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return undefined;
}

/**
 * Real-data-only performance metrics.
 * Priority: 1) Live API (GA4/GSC/DataForSEO)  2) seo-data.json row
 * Returns null for any metric not available — UI must render "—".
 */
function buildPerformanceFallback({ api = {}, jsonRow = null }) {
  const trafficMonthly = pickFirstNumber(api.trafficMonthly, jsonRow?.organicTraffic?.monthly) ?? null;
  const trafficGrowth  = pickFirstNumber(api.trafficGrowth,  jsonRow?.organicTraffic?.growth)  ?? null;

  const kwTotal = pickFirstNumber(api.keywordsTotal,   jsonRow?.organicKeywords?.total) ?? null;
  const top3    = pickFirstNumber(api.keywordsTop3,    jsonRow?.organicKeywords?.top3)  ?? null;
  const top10   = pickFirstNumber(api.keywordsTop10,   jsonRow?.organicKeywords?.top10) ?? null;
  const top100  = pickFirstNumber(api.keywordsTop100,  jsonRow?.organicKeywords?.top100)?? null;

  const leadsMonthly = pickFirstNumber(api.leadsMonthly,     jsonRow?.leads?.monthly)    ?? null;
  const leadsGoal    = pickFirstNumber(api.leadsGoal,        jsonRow?.leads?.goal)        ?? null;
  const contactForm  = pickFirstNumber(api.leadsContactForm, jsonRow?.leads?.contactForm) ?? null;
  const newsletter   = pickFirstNumber(api.leadsNewsletter,  jsonRow?.leads?.newsletter)  ?? null;
  const leadsGrowth  = pickFirstNumber(api.leadsGrowth,      jsonRow?.leads?.growth)      ?? null;

  return {
    organicTraffic:  { monthly: trafficMonthly, growth: trafficGrowth },
    organicKeywords: { total: kwTotal, top3, top10, top100 },
    leads: { monthly: leadsMonthly, goal: leadsGoal, contactForm, newsletter, growth: leadsGrowth },
  };
}

/**
 * Real-data-only link metrics.
 * Priority: 1) DataForSEO backlinks  2) seo-data.json row
 * Returns null when data is unavailable.
 */
function buildLinksFallback({ api = {}, jsonRow = null }) {
  const referringDomains = pickFirstPositiveNumber(api.referringDomains, jsonRow?.referringDomains) ?? null;
  const backlinks        = pickFirstPositiveNumber(api.backlinks,        jsonRow?.backlinks)        ?? null;
  return { referringDomains, backlinks };
}

function LikeDislike() {
  const [choice, setChoice] = useState(null); // 'up' | 'down' | null
  const [bump, setBump] = useState(null);     // which icon is bumping

  const handleClick = (dir) => {
    setChoice(prev => (prev === dir ? null : dir));
    setBump(dir);
    // brief pop effect
    setTimeout(() => setBump(null), 150);
  };

  const base = "cursor-pointer transition-transform duration-150";
  return (
    <span className="flex items-center gap-2">
      <ThumbsUp
        size={16}
        strokeWidth={2}
        fill="none"                          // keep interior unfilled
        className={`${base} ${bump==='up' ? 'scale-110' : ''} ${choice==='up' ? 'text-[#22C55E]' : ''}`}
        onClick={() => handleClick('up')}
        aria-label="Thumbs up"
      />
      <ThumbsDown
        size={16}
        strokeWidth={2}
        fill="none"                          // keep interior unfilled
        className={`${base} ${bump==='down' ? 'scale-110' : ''} ${choice==='down' ? 'text-[#EF4444]' : ''}`}
        onClick={() => handleClick('down')}
        aria-label="Thumbs down"
      />
    </span>
  );
}

/** Compact number formatter for backlinks and other big counts */
function formatCompactNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  const sign = num < 0 ? "-" : "";
  const v = Math.abs(num);

  const fmt = (value, suffix) => {
    const s = value.toFixed(1).replace(/\.0$/, "");
    return sign + s + suffix;
  };

  if (v >= 1_000_000_000) return fmt(v / 1_000_000_000, "B");
  if (v >= 1_000_000) return fmt(v / 1_000_000, "M");
  if (v >= 1_000) return fmt(v / 1_000, "K");
  return sign + Math.round(v).toString();
}

/** Small source pill that shows ONLY a number; on hover it reveals the source (GA4/GSC). */
function SourcePill({ value, source }) {
  return (
    <div className="relative group">
      <div
        className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--input)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)] cursor-help tabular-nums"
        aria-label={source}
        title={source}
      >
        {value}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-max -translate-x-1/2 rounded-md bg-black px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
        {source}
      </div>
    </div>
  );
}
/** Heuristics to retrieve the site the user entered during onboarding */
function getSiteFromStorageOrQuery(searchParams) {
  // 1) Highest priority: ?site=
  const qp = searchParams?.get?.("site");
  if (qp) return normalizeDomain(qp);

  // 2) Try a few common localStorage/sessionStorage keys
  const keys = [
    "websiteData", "site", "website", "selectedWebsite",
    "drfizzm.site", "drfizzm.website"
  ];
  try {
    for (const store of [localStorage, sessionStorage]) {
      for (const k of keys) {
        const v = store.getItem(k);
        if (!v) continue;
        // if JSON, try common shapes
        try {
          const o = JSON.parse(v);
          const cands = [o?.site, o?.website, o?.url, o?.domain, o?.value];
          for (const c of cands) if (c) return normalizeDomain(String(c));
        } catch {
          // plain string
          return normalizeDomain(v);
        }
      }
    }
  } catch {
    // storage not available (SSR / privacy mode) → ignore
  }
  // 3) fallback
  return "example.com";
}

/** Map one CSV/row object from seo-data.json (array) into the UI schema */
function mapRowToSchema(row) {
  if (!row || typeof row !== "object") return null;
  // Basic safe getters
  // replace your current `n` with this:
  const n = (x, d = undefined) => {
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x === "string") {
      const v = Number(x.replace(/[, ]/g, ""));
      if (Number.isFinite(v)) return v;
    }
    return d;
  };

  const s = (x, d=undefined) => (typeof x === "string" ? x : d);

  // Build "new opportunities" table rows from numbered fields
  const seoRows = [];
  for (let i = 1; i <= 6; i++) {
    const kw = row[`NewOp_Keyword_${i}`];
    const typ = row[`NewOp_Type_${i}`];
    const vol = row[`NewOp_SearchVol_${i}`];
    const diff = row[`NewOp_SEODiff_${i}`];
    if (kw && typ && (typeof vol === "number") && (typeof diff === "number")) {
      const sugg = row[`NewOp_Suggested_${i}`];
      const pref = row[`NewOp_Preference_${i}`];
      seoRows.push({ keyword: String(kw), type: String(typ), volume: vol, difficulty: diff, suggested: sugg ? String(sugg) : undefined, preference: pref ? String(pref) : undefined });
    }
  }

  // Organic keywords breakdown (optional)
  const top3  = n(row["Top_3_Keywords"], undefined);
  const top10 = n(row["Top_10_Keywords"], undefined);
  const top100= n(row["Top_100_Keywords"], undefined);

  return {
    domain: normalizeDomain(s(row["Domain/Website"], s(row["Domain"], ""))),
    dateAnalyzed: s(row["Date_Analyzed"], ""),
    // ---- On-page content opportunities (Blogs & Pages) ----
    content: {
      blog: [
        {
          title: s(row["Blog1_Title"], "Untitled"),
          priority: s(row["Blog1_Priority"], "Medium Priority"),
          wordCount: n(row["Blog1_Word_Count"], 0),
          keywords: n(row["Blog1_Num_Keywords"], 0),
          score: n(row["Blog1_Score"], 0),
          status: s(row["Blog1_Status"], "Draft"),
        },
        {
          title: s(row["Blog2_Title"], "Untitled"),
          priority: s(row["Blog2_Priority"], "Medium Priority"),
          wordCount: n(row["Blog2_Word_Count"], 0),
          keywords: n(row["Blog2_Num_Keywords"], 0),
          score: n(row["Blog2_Score"], 0),
          status: s(row["Blog2_Status"], "Draft"),
        },
      ].filter(Boolean),
      pages: [
        {
          title: s(row["Page1_Title"], "Untitled"),
          priority: s(row["Page1_Priority"], "Medium Priority"),
          wordCount: n(row["Page1_Word_Count"], 0),
          keywords: n(row["Page1_Num_Keywords"], 0),
          score: n(row["Page1_Score"], 0),
          status: s(row["Page1_Status"], "Draft"),
        },
        {
          title: s(row["Page2_Title"], "Untitled"),
          priority: s(row["Page2_Priority"], "Medium Priority"),
          wordCount: n(row["Page2_Word_Count"], 0),
          keywords: n(row["Page2_Num_Keywords"], 0),
          score: n(row["Page2_Score"], 0),
          status: s(row["Page2_Status"], "Draft"),
        },
      ].filter(Boolean),
    },

    // Off-page
    domainRating: n(row["Domain_Rating"], undefined),
    industryAvgDR: n(row["Industry_Average_DR"], undefined),
    trustBar: n(row["High_Quality_Backlinks_Percent"], undefined),
    medQuality: n(row["Medium_Quality_Backlinks_Percent"], undefined),
    lowQuality: n(row["Low_Quality_Backlinks_Percent"], undefined),
    referringDomains: n(row["Referring_Domains"], undefined),
    backlinks: n(row["Total_Backlinks"], undefined),
    dofollowPct: n(row["DoFollow_Links_Percent"], undefined),
    nofollowPct: n(row["NoFollow_Links_Percent"], undefined),
    // Technical
    siteHealth: n(row["Site_Health_Score"], undefined),
    pagesScanned: n(row["Pages_Scanned"], undefined),
    redirects: n(row["Redirect_Issues"], undefined),
    broken: n(row["Broken_Links"], undefined),
    // CWV scores present, but your UI expects time values; we keep hardcoded defaults if not provided as times.
    cwvScores: {
      LCP_Score: n(row["LCP_Score"], undefined),
      INP_Score: n(row["INP_Score"], undefined),
      CLS_Score: n(row["CLS_Score"], undefined),
    },
    pageSpeed: {
      desktop: n(row["Desktop_PageSpeed_Score"], undefined),
      mobile: n(row["Mobile_PageSpeed_Score"], undefined),
    },
    // Performance
    organicTraffic: {
      monthly: n(row["Organic_Traffic"], undefined),
      growth: n(row["Organic_Traffic_Growth"], undefined),
    },
    organicKeywords: {
      total: n(row["Total_Organic_Keywords"], undefined),
      top3, top10, top100,
    },
    // Leads
    leads: {
      monthly: n(row["Total_Leads"], undefined),
      goal: n(row["Lead_Goal_Target"], undefined),
      contactForm: n(row["Contact_Form_Leads"], undefined),
      newsletter: n(row["Newsletter_Signups"], undefined),
      growth: n(row["Lead_Growth_Percent"], undefined), // if present in your data
    },

    // AI tool visibility (ratings & indexed pages) — per domain
    aiTools: {
      GPT:        { rating: n(row["GPT_Rating"], undefined),        pages: n(row["GPT_Pages"], undefined),        src: "/assets/gpt.svg" },
      GoogleAI:   { rating: n(row["Google_AI_Rating"], undefined),  pages: n(row["Google_AI_Pages"], undefined),  src: "/assets/google.svg" },
      Perplexity: { rating: n(row["Perplexity_Rating"], undefined), pages: n(row["Perplexity_Pages"], undefined), src: "/assets/perplexity.svg" },
      Copilot:    { rating: n(row["Copilot_Rating"], undefined),    pages: n(row["Copilot_Pages"], undefined),    src: "/assets/copilot.svg" },
      Gemini:     { rating: n(row["Gemini_Rating"], undefined),     pages: n(row["Gemini_Pages"], undefined),     src: "/assets/gemini.svg" },
    },

    // SERP features

    serp: {
      coveragePercent: n(row["SERP_Feature_Coverage_Percent"], undefined),
      featuredSnippets: n(row["Featured_Snippets_Count"], undefined),
      peopleAlsoAsk: n(row["People_Also_Ask_Count"], undefined),
      imagePack: n(row["Image_Pack_Count"], undefined),
      videoResults: n(row["Video_Results_Count"], undefined),
      knowledgePanel: n(row["Knowledge_Panel_Count"], undefined),
    },
    // Issue/opportunity cards (site-level)
    issues: {
      critical: n(row["Critical_Issues_Count"], undefined),
      warning: n(row["Warning_Issues_Count"], undefined),
      recommendations: n(row["Recommendations_Count"], undefined),
      contentOpps: n(row["Content_Opportunities_Count"], undefined),
      criticalGrowth: n(row["Critical_Issues_Growth_Percent"], undefined),
      warningGrowth: n(row["Warning_Issues_Growth_Percent"], undefined),
    },
    // New SEO opp table
    seoRows
  };
}

export default function Dashboard({ onOpenContentEditor }) {

  const searchParams = useSearchParams();
  const [domain, setDomain] = useState(null);

  // Cache bookkeeping (avoids refetch + keeps values instant after OAuth redirect)
  const seoCacheTsRef = useRef(0);
  const seoHydratedFromCacheRef = useRef(false);

  // Seed SEO state from any prefetch done in the wizard (Step5Slide2)
  const getInitialSeo = () => {
    if (typeof window !== "undefined" && window.__drfizzSeoPrefetch) {
      const v = window.__drfizzSeoPrefetch;
      // consume once so it doesn't keep "prefilling" on future remounts
      window.__drfizzSeoPrefetch = null;
      return v;
    }
    return null;
  };

  const initialSeo = getInitialSeo();

  // Live SEO data from /api/seo (prefilled if we navigated from the wizard)
  const [seo, setSeo] = useState(initialSeo);
  const [seoError, setSeoError] = useState("");
  const [seoLoading, setSeoLoading] = useState(!initialSeo);

  // ──────── AI Deep Analysis state ────────
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [onPageAudit, setOnPageAudit] = useState(null);

  // ──────── PDF Report state ────────
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  // ---------------- Google (GA4 + GSC) connection + metrics ----------------
  const [googleStatus, setGoogleStatus] = useState({
    loading: true,
    connected: false,
    email: null,
    hasRefreshToken: false,
    error: "",
  });

  const [ga4Properties, setGa4Properties] = useState([]);
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Error, setGa4Error] = useState("");
  // Expected shapes (depending on your API):
  // - { ok:true, organicTraffic:number, leads:number, debug?:object }
  // - or { ok:true, organicTraffic:{monthly,growth}, leads:{monthly,growth}, ... }
  const [ga4Metrics, setGa4Metrics] = useState(null);

  const [gscSites, setGscSites] = useState([]);
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [gscLoading, setGscLoading] = useState(false);
  const [gscError, setGscError] = useState("");
  // Expected shapes (depending on your API):
  // - { ok:true, keywordsTotal:number, top3:number, top10:number, top100:number, rows?:[], debug?:object }
  const [gscMetrics, setGscMetrics] = useState(null);

  const connectGoogle = () => {
    try {
      const returnTo = window.location.pathname + window.location.search + (window.location.hash || "#dashboard");
      window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
    } catch {
      window.location.href = "/api/auth/google/start";
    }
  };

  const refreshGoogleStatus = async () => {
    try {
      setGoogleStatus((s) => ({ ...s, loading: true, error: "" }));
      const res = await fetch("/api/google/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Status failed: ${res.status}`);
      setGoogleStatus({
        loading: false,
        connected: !!json?.connected,
        email: json?.email || null,
        hasRefreshToken: !!json?.hasRefreshToken,
        error: "",
      });
      return json;
    } catch (e) {
      setGoogleStatus({
        loading: false,
        connected: false,
        email: null,
        hasRefreshToken: false,
        error: e?.message || "Failed to load google status",
      });
      return null;
    }
  };

// ---- Dedupe Google status fetches in Next.js dev StrictMode (double-mount) ----
// In dev, React intentionally mounts/unmounts twice; this prevents duplicate /api/google/status calls.
const ranInitialGoogleStatusRef = useRef(false);




// Generic in-flight deduper for dev StrictMode double-mount (and quick successive triggers).
const runOncePerKey = (key, fn) => {
  if (typeof window === "undefined") return fn();
  const w = window;
  w.__dashInFlight = w.__dashInFlight || {};
  if (w.__dashInFlight[key]) return w.__dashInFlight[key];
  w.__dashInFlight[key] = Promise.resolve()
    .then(fn)
    .finally(() => {
      // Clear on next tick so future genuine navigations can refetch if needed.
      setTimeout(() => {
        try {
          w.__dashInFlight[key] = null;
        } catch {}
      }, 0);
    });
  return w.__dashInFlight[key];
};




  const loadGa4Properties = async () => {
    try {
      setGa4Error("");
      const res = await fetch("/api/ga4/properties", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `GA4 properties failed: ${res.status}`);
      const props = Array.isArray(json?.properties) ? json.properties : [];
      setGa4Properties(props);
      return props;
    } catch (e) {
      setGa4Error(e?.message || "Failed to load GA4 properties");
      setGa4Properties([]);
      return [];
    }
  };

  const loadGscSites = async () => {
    try {
      setGscError("");
      const res = await fetch("/api/gsc/sites", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `GSC sites failed: ${res.status}`);
      const sites = Array.isArray(json?.sites) ? json.sites : [];
      setGscSites(sites);
      return sites;
    } catch (e) {
      setGscError(e?.message || "Failed to load Search Console sites");
      setGscSites([]);
      return [];
    }
  };

const fetchGa4Report = async () => {
  try {
    setGa4Loading(true);
    setGa4Error("");
    const res = await fetch("/api/ga4/report", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `GA4 report failed: ${res.status}`);
    setGa4Metrics(json);
    return json;
  } catch (e) {
    setGa4Metrics(null);
    setGa4Error(e?.message || "Failed to fetch GA4 report");
    return null;
  } finally {
    setGa4Loading(false);
  }
};

const fetchGscKeywords = async () => {
  try {
    setGscLoading(true);
    setGscError("");
    const res = await fetch("/api/gsc/keywords", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json?.ok === false) throw new Error(json?.error || `GSC keywords failed: ${res.status}`);
    setGscMetrics(json);
    return json;
  } catch (e) {
    setGscMetrics(null);
    setGscError(e?.message || "Failed to fetch Search Console keywords");
    return null;
  } finally {
    setGscLoading(false);
  }
};


  const selectGa4Property = async (propertyId) => {
  if (!propertyId) return null;
  setGa4PropertyId(propertyId);
  try {
    setGa4Loading(true);
    setGa4Error("");
    const res = await fetch("/api/ga4/select-property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId }),
    });
    const json = await res.json();
    if (!res.ok || json?.ok === false)
      throw new Error(json?.error || `GA4 select failed: ${res.status}`);

    // Now that the property is stored in the cookie, fetch the real GA4 report.
    const report = await fetchGa4Report();
    return report;
  } catch (e) {
    setGa4Error(e?.message || "Failed to select GA4 property");
    setGa4Metrics(null);
    return null;
  } finally {
    setGa4Loading(false);
  }
};


  const selectGscSite = async (siteUrl) => {
  if (!siteUrl) return null;
  setGscSiteUrl(siteUrl);
  try {
    setGscLoading(true);
    setGscError("");

    // Persist selection in cookie (required by /api/gsc/keywords)
    const selRes = await fetch("/api/gsc/select-site", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteUrl }),
    });
    const selJson = await selRes.json().catch(() => ({}));
    if (!selRes.ok || selJson?.ok === false) {
      throw new Error(selJson?.error || `GSC select failed: ${selRes.status}`);
    }

    // Now fetch real keyword metrics for the selected site (server uses cookie)
    const keywords = await fetchGscKeywords();
    return keywords;
  } catch (e) {
    setGscError(e?.message || "Failed to select Search Console site");
    setGscMetrics(null);
    return null;
  } finally {
    setGscLoading(false);
  }
};


  // On first load (and after OAuth redirect), refresh status.
  useEffect(() => {
    // NOTE: In Next.js dev + React StrictMode, components mount, unmount, then mount again.
    // This guard prevents double-fire on initial mount (and avoids accidental loops).
    if (ranInitialGoogleStatusRef.current) {
      console.log("[Dashboard][SKIP] initial google status fetch (guarded)");
      return;
    }
    ranInitialGoogleStatusRef.current = true;
    console.log("[Dashboard][EFFECT] initial google status fetch");
    void refreshGoogleStatus();
  }, []);


  // Once connected, load GA4 + GSC lists.
  useEffect(() => {
  if (!googleStatus.connected) return;

  (async () => {
    // 1) Try fetching reports immediately. If the user has already selected GA4 property / GSC site earlier
    // (stored in cookies), these will succeed and we don't need to show any selector UI.
    const [ga4First, gscFirst] = await Promise.all([fetchGa4Report(), fetchGscKeywords()]);

    const needsGa4Selection =
      !ga4First && /property not selected/i.test(ga4Error || "");
    const needsGscSelection =
      !gscFirst && /site not selected/i.test(gscError || "");

    // 2) If anything is not selected yet, load selectable lists and auto-pick best defaults.
    if (needsGa4Selection || needsGscSelection) {
      const [props, sites] = await Promise.all([loadGa4Properties(), loadGscSites()]);

      if (needsGa4Selection && !ga4PropertyId && props?.length) {
        const first = props[0]?.propertyId || "";
        if (first) await selectGa4Property(first);
      }

      if (needsGscSelection && !gscSiteUrl && sites?.length) {
        const d = normalizeDomain(domain || "");
        const pickUrl = (s) => (typeof s === "string" ? s : s?.siteUrl);

        const match =
          sites.find((s) => String(pickUrl(s) || "").includes(d)) || null;

        const val = pickUrl(match) || pickUrl(sites[0]) || "";
        if (val) await selectGscSite(val);
      }
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [googleStatus.connected]);




// ------- NEW: Load fallback Performance metrics from /public/data/seo-data.json (old behavior) -------
const [fallbackRows, setFallbackRows] = useState([]);
const [fallbackRowsError, setFallbackRowsError] = useState("");

useEffect(() => {
  let alive = true;
  (async () => {
    try {
      setFallbackRowsError("");
      const res = await fetch("/data/seo-data.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load /data/seo-data.json: ${res.status}`);
      const json = await res.json();
      const mapped = Array.isArray(json) ? json.map(mapRowToSchema).filter(Boolean) : [];
      if (alive) setFallbackRows(mapped);
    } catch (e) {
      console.warn("[Dashboard] Failed to load seo-data.json fallback:", e);
      if (alive) setFallbackRowsError(e?.message || "Failed to load seo-data.json");
    }
  })();
  return () => { alive = false; };
}, []);

const fallbackSelected = useMemo(() => {
  if (!domain || !fallbackRows?.length) return null;
  const d = normalizeDomain(domain);
  return fallbackRows.find((r) => normalizeDomain(r?.domain) === d) || null;
}, [domain, fallbackRows]);


// Watch for query param AND storage
  useEffect(() => {
    const site = getSiteFromStorageOrQuery(searchParams);
    console.log("[Dashboard] Resolved domain from storage/query:", site);
    setDomain(site);
  }, [searchParams]);

  // NEW: Seed cache timestamp on mount; hydrate from cache only if seo state is empty.
// This prevents a second /api/seo fetch when coming back from Content Editor (Dashboard remount).
useEffect(() => {
    if (!domain || domain === "example.com") return;

    const cached = loadSeoCache(domain);

    // Always seed ts so cacheFresh works after remounts even if SEO was prefilled from window.__drfizzSeoPrefetch
    if (cached?.ts) seoCacheTsRef.current = cached.ts || 0;
    // If we don't have a session cache entry but SEO is already prefilled (e.g. from window.__drfizzSeoPrefetch),
    // treat it as "fresh" by seeding cacheTs from seo.dateAnalyzed (or now) and persist to session cache.
    if ((!cached || !cached.ts) && seo && !seoCacheTsRef.current) {
      const analyzed = seo?.dateAnalyzed ? Date.parse(seo.dateAnalyzed) : NaN;
      const ts = Number.isFinite(analyzed) ? analyzed : Date.now();
      seoCacheTsRef.current = ts;
      try {
        saveSeoCache(domain, seo, ts);
      } catch {
        // ignore storage failures
      }
    }


    // Only hydrate UI from cache if we don't already have SEO in state
    if (!seo && cached?.data) {
      const age = Date.now() - (cached.ts || 0);
      seoHydratedFromCacheRef.current = true;

      setSeo(cached.data);
      setSeoLoading(false);

      console.log(`[Dashboard] Hydrated SEO from session cache (age ${Math.round(age / 1000)}s)`);
    }
  }, [domain, seo]);

  // Fetch unified SEO data from /api/seo whenever domain changes
  useEffect(() => {
    if (!domain || domain === "example.com") return;

    // If we already have SEO data, only refetch when cache is stale (keeps UI instant after OAuth redirect).
    const cacheTs = seoCacheTsRef.current || 0;
    const cacheAge = cacheTs ? (Date.now() - cacheTs) : Infinity;
    const cacheFresh = cacheAge < SEO_CACHE_TTL_MS;

    const hasOnpageRows = Array.isArray(seo?.seoRows) && seo.seoRows.length > 0;
    // Cache < 5 min is treated as authoritative (just came from a live scan — skip re-fetch
    // even if seoRows are absent, e.g. when arriving from the Report page).
    const cacheHot = cacheAge < 5 * 60 * 1000;

    if (cacheFresh && (seo || seoHydratedFromCacheRef.current) && (hasOnpageRows || cacheHot)) return;

    const background = !!seo; // if we have cached/old data, refresh quietly

    let alive = true;
    (async () => {
      try {
        if (!background) setSeoLoading(true);
        setSeoError("");

        const url = `https://${domain}`;
const keyword = domain; // TODO: wire actual keyword later from onboarding

        const payload = {
          url,
          keyword,
          countryCode: "in",
          languageCode: "en",
          depth: 10,
          // you can trim this list to speed things up while developing:
          providers: ["psi", "authority", "dataforseo", "content", "onpageKeywords"],
        };

        console.log("[Dashboard] Calling /api/seo with payload:", payload);

        const res = await runOncePerKey(`seo:${domain}`, () => fetch("/api/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }));

        if (!res.ok) {
          throw new Error(`Failed to load /api/seo: ${res.status}`);
        }

        const json = await res.json();
        console.log("[Dashboard] /api/seo raw response:", json);

        if (alive) {
          setSeo(json);
          // Persist for instant paint on future reloads (e.g., OAuth redirect back to #dashboard)
          saveSeoCache(domain, json);
          seoCacheTsRef.current = Date.now();
          seoHydratedFromCacheRef.current = false;
        }
      } catch (e) {
        console.error("[Dashboard] Error while fetching /api/seo:", e);
        if (alive) setSeoError(e.message || "Failed to load /api/seo");
      } finally {
        if (alive) setSeoLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [domain, seo]);

  // Fetch on-page audit separately (slow call - 16s+)
  useEffect(() => {
    if (!domain || domain === "example.com") return;
    if (!seo) return; // wait for main SEO data first

    // If we already have audit data in the seo response, skip separate fetch
    if (seo?.onPageAudit) {
      setOnPageAudit(seo.onPageAudit);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/seo/onpage-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (alive && json?.onPageAudit) {
          setOnPageAudit(json.onPageAudit);
        }
      } catch {
        // ignore audit failures - section just won't render
      }
    })();
    return () => { alive = false; };
  }, [domain, seo]);

  // Map unified /api/seo response → the "selected" shape the UI expects
  // Map unified /api/seo response → the "selected" shape the UI expects
  const selected = useMemo(() => {
    if (!seo) return null;

    console.log("[Dashboard] Mapping seo → selected. Raw seo:", seo);

    // Technical SEO: support new backend shape with separate mobile/desktop
    const technicalContainer = seo.technicalSeo || {};
    const technicalMobile =
      technicalContainer.mobile ||
      seo.technicalSeoMobile ||
      {};
    const technicalDesktop =
      technicalContainer.desktop ||
      seo.technicalSeoDesktop ||
      {};

    // Prefer CrUX field data (coreWebVitalsField) when available,
    // with a safe fallback to lab data (coreWebVitals / coreWebVitalsLab).
    const vitalsFieldRaw = technicalContainer.coreWebVitalsField || {};
    const vitalsLabRaw =
      technicalMobile.coreWebVitals ||
      technicalDesktop.coreWebVitals ||
      technicalContainer.coreWebVitals ||
      technicalContainer.coreWebVitalsLab ||
      {};

    const vitals = {
      lcp:
        typeof vitalsFieldRaw?.lcp?.value === "number"
          ? vitalsFieldRaw.lcp.value
          : vitalsLabRaw.lcp,
      tti:
        typeof vitalsFieldRaw?.inp?.value === "number"
          ? vitalsFieldRaw.inp.value
          : vitalsLabRaw.tti,
      cls:
        typeof vitalsFieldRaw?.cls?.value === "number"
          ? vitalsFieldRaw.cls.value
          : vitalsLabRaw.cls,
    };

    const mobilePerf =
      typeof technicalContainer.performanceScoreMobile === "number"
        ? technicalContainer.performanceScoreMobile
        : typeof technicalMobile.performanceScore === "number"
        ? technicalMobile.performanceScore
        : typeof technicalContainer.performanceScore === "number"
        ? technicalContainer.performanceScore
        : null;

    const desktopPerf =
      typeof technicalContainer.performanceScoreDesktop === "number"
        ? technicalContainer.performanceScoreDesktop
        : typeof technicalDesktop.performanceScore === "number"
        ? technicalDesktop.performanceScore
        : typeof technicalContainer.performanceScore === "number"
        ? technicalContainer.performanceScore
        : null;

    const authority = seo.authority || {};
    const serp = seo.serp || {};
    const dataForSeo = seo.dataForSeo || {};
    const backlinksSummary = dataForSeo.backlinksSummary || {};
    const content = seo.content || {};
    // SERP features — real data only (DataForSEO SERP Advanced or Serper.dev)
    const serpFeaturesFromDataForSeo = dataForSeo.serpFeatures || {};
    const serpFeaturesFromSerper = serp.serpFeatures || {};
    const dataForSeoHasRealSerpData =
      Object.keys(serpFeaturesFromDataForSeo).length > 0 &&
      (serpFeaturesFromDataForSeo.coveragePercent > 0 ||
       serpFeaturesFromDataForSeo.featuredSnippets > 0 ||
       serpFeaturesFromDataForSeo.peopleAlsoAsk > 0);
    // Use real data only — no hash fallback
    const serpFeatures = dataForSeoHasRealSerpData
      ? serpFeaturesFromDataForSeo
      : Object.keys(serpFeaturesFromSerper).length > 0
        ? serpFeaturesFromSerper
        : {}; // empty → UI shows "—" / "No data"

    // ---- NEW: pull on-page opportunity rows from backend ----
    const apiSeoRows =
      (Array.isArray(seo.seoRows) && seo.seoRows.length
        ? seo.seoRows
        : null) ||
      (Array.isArray(dataForSeo.seoRows) && dataForSeo.seoRows.length
        ? dataForSeo.seoRows
        : null);

    // Derive SERP feature metrics, preferring DataForSEO if present
    const serpPrimaryItems =
      (dataForSeo?.serp &&
        Array.isArray(dataForSeo.serp.results) &&
        dataForSeo.serp.results) ||
      (Array.isArray(dataForSeo?.serpResults) && dataForSeo.serpResults) ||
      (Array.isArray(dataForSeo?.serpItems) && dataForSeo.serpItems) ||
      [];

    const serpFallbackItems =
      Array.isArray(serp?.topResults) ? serp.topResults : [];

    const serpItemsForFeatures =
      serpPrimaryItems.length > 0 ? serpPrimaryItems : serpFallbackItems;

    const serpItemsWithFeatures = serpItemsForFeatures.filter((item) => {
      const f = item?.serp_features || item?.features;
      return Array.isArray(f) && f.length > 0;
    });

    const serpCoverageFromApi =
      serpItemsForFeatures.length > 0
        ? Math.round(
            (serpItemsWithFeatures.length / serpItemsForFeatures.length) * 100
          )
        : null;

    const countByFeature = (featureName) =>
      serpItemsForFeatures.filter((item) => {
        const type = item?.type || item?.result_type;
        const f = item?.serp_features || item?.features;
        return (
          type === featureName ||
          (Array.isArray(f) && f.includes(featureName))
        );
      }).length || null;

    const serpFeaturedSnippetsFromApi =
      countByFeature("featured_snippet") ?? null;
    const serpPeopleAlsoAskFromApi =
      countByFeature("people_also_ask") ?? null;
    const serpImagePackFromApi = countByFeature("image_pack") ?? null;
    const serpVideoResultsFromApi = countByFeature("video") ?? null;
    const serpKnowledgePanelFromApi =
      countByFeature("knowledge_panel") ?? null;

    const serpPeopleAlsoAskCount =
      Array.isArray(serp?.peopleAlsoAsk) ? serp.peopleAlsoAsk.length : null;

    const oprScore =
      typeof authority.domainAuthority === "number"
        ? authority.domainAuthority
        : undefined;

    const domainRatingFromOpenPageRank =
      typeof oprScore === "number" && oprScore > 0 ? oprScore * 10 : null;

    // DataForSEO backlinks/summary `rank` is their internal 0-100 authority score.
    // Only use it when it's in a believable 0-100 range (avoid misinterpreting large rank numbers).
    const domainRatingFromDataForSeo = (() => {
      const r =
        (typeof backlinksSummary?.rank === "number" && backlinksSummary.rank > 0 && backlinksSummary.rank <= 100
          ? backlinksSummary.rank
          : null) ??
        (typeof backlinksSummary?.domain_rank === "number" && backlinksSummary.domain_rank > 0 && backlinksSummary.domain_rank <= 100
          ? backlinksSummary.domain_rank
          : null) ??
        (typeof backlinksSummary?.ahrefs_rank === "number" && backlinksSummary.ahrefs_rank > 0 && backlinksSummary.ahrefs_rank <= 100
          ? backlinksSummary.ahrefs_rank
          : null);
      return r;
    })();

    // Estimate DR from DataForSEO Labs organic keywords (log10 approximation — only when real data present)
    const estimatedDRFromOrganic = (() => {
      const dro = seo?.domainRankOverview || {};
      const organicKws = (typeof dro.organicKeywords === "number" && dro.organicKeywords > 0)
        ? dro.organicKeywords : null;
      if (organicKws !== null) {
        return Math.max(1, Math.min(85, Math.round(Math.log10(organicKws + 1) * 22)));
      }
      // Fall back: referring domains from DataForSEO backlinks (real data, no hash)
      const refDom = (typeof backlinksSummary?.referring_domains === "number" && backlinksSummary.referring_domains > 0)
        ? backlinksSummary.referring_domains : null;
      if (refDom !== null) {
        return Math.max(1, Math.min(75, Math.round(Math.log10(refDom + 1) * 20)));
      }
      return null; // No real data → show "—"
    })();

    const effectiveDomainRating =
      domainRatingFromOpenPageRank ??
      domainRatingFromDataForSeo ??
      estimatedDRFromOrganic ??
      undefined;

    
    // ---- Quality distribution (DataForSEO doesn't provide buckets; derive from spam score) ----
    const spamScore =
      typeof backlinksSummary?.backlinks_spam_score === "number"
        ? backlinksSummary.backlinks_spam_score
        : null;

    // ---- Quality distribution (real data only) ----
    // 1) DataForSEO spam score  2) seo-data.json row  3) null (show "—")
    const qualityFromSpam = (() => {
      if (spamScore != null) {
        if (spamScore <= 5)  return { h: 70, m: 20, l: 10 };
        if (spamScore <= 15) return { h: 50, m: 30, l: 20 };
        if (spamScore <= 30) return { h: 35, m: 35, l: 30 };
        return { h: 25, m: 35, l: 40 };
      }
      const jh = fallbackSelected?.trustBar;
      const jm = fallbackSelected?.medQuality;
      const jl = fallbackSelected?.lowQuality;
      const jsum = (jh ?? 0) + (jm ?? 0) + (jl ?? 0);
      if (typeof jsum === "number" && jsum > 0) {
        return {
          h: Math.round((jh ?? 0) * 100 / jsum),
          m: Math.round((jm ?? 0) * 100 / jsum),
          l: Math.max(0, 100 - Math.round((jh ?? 0) * 100 / jsum) - Math.round((jm ?? 0) * 100 / jsum)),
        };
      }
      return null; // No real data
    })();

    // Performance — real API data only (GA4 organic traffic, GSC keywords, DataForSEO ETV)
    const perfFallback = buildPerformanceFallback({
      api: {
        // GA4 organic traffic (when OAuth connected)
        trafficMonthly: seo.ga4?.organicTraffic?.monthly ?? undefined,
        trafficGrowth:  seo.ga4?.organicTraffic?.growth  ?? undefined,
        // GSC organic keywords (when OAuth connected)
        keywordsTotal: seo.gsc?.organicKeywords?.total  ?? undefined,
        keywordsTop3:  seo.gsc?.organicKeywords?.top3   ?? undefined,
        keywordsTop10: seo.gsc?.organicKeywords?.top10  ?? undefined,
        keywordsTop100:seo.gsc?.organicKeywords?.top100 ?? undefined,
      },
      jsonRow: fallbackSelected,
    });

    const linksFallback = buildLinksFallback({
      api: {
        referringDomains: typeof backlinksSummary?.referring_domains === "number" && backlinksSummary.referring_domains > 0
          ? backlinksSummary.referring_domains : undefined,
        backlinks: typeof backlinksSummary?.backlinks === "number" && backlinksSummary.backlinks > 0
          ? backlinksSummary.backlinks : undefined,
      },
      jsonRow: fallbackSelected,
    });




    // ---- DoFollow / NoFollow ----
    // Priority:
    // 1) DataForSEO referring_pages counts (if present)
    // 2) seo-data.json row (DoFollow_Links_Percent / NoFollow_Links_Percent) if present
    // 3) deterministic realistic random (stable per domain)
    const doNoFromApi = (() => {
      const rp = backlinksSummary?.referring_pages;
      const rpnf = backlinksSummary?.referring_pages_nofollow;
      if (typeof rp === "number" && typeof rpnf === "number" && rp > 0) {
        const doPct = Math.round(((rp - rpnf) / rp) * 100);
        const noPct = Math.max(0, 100 - doPct);
        return { doPct, noPct };
      }
      return null;
    })();

    const doNoFromJson = (() => {
      const d = fallbackSelected?.dofollowPct;
      const n = fallbackSelected?.nofollowPct;
      if (typeof d === "number" && d > 0 && d <= 100 && typeof n === "number" && n >= 0 && n <= 100) {
        const sum = d + n;
        if (sum === 100) return { doPct: d, noPct: n };
        // Normalize if the JSON isn't perfectly summing to 100
        const doPct = Math.round((d * 100) / (sum || 100));
        const noPct = Math.max(0, 100 - doPct);
        return { doPct, noPct };
      }
      if (typeof d === "number" && d > 0 && d <= 100) {
        return { doPct: d, noPct: Math.max(0, 100 - d) };
      }
      if (typeof n === "number" && n > 0 && n <= 100) {
        return { doPct: Math.max(0, 100 - n), noPct: n };
      }
      return null;
    })();

    const doNoFinal = doNoFromApi || doNoFromJson || null; // null when no real data
const mapped = {
      domain: seo._meta?.domain || domain,
      dateAnalyzed: seo._meta?.generatedAt || "",

      // Off-page
      // Prefer OpenPageRank-derived DR, with fallback to DataForSEO rank (0–100)
      domainRating: effectiveDomainRating,
      industryAvgDR:
        typeof effectiveDomainRating === "number"
          ? Math.max(20, Math.min(80, effectiveDomainRating * 1.1))
          : undefined, // undefined → INDUSTRY_AVG becomes null → shows "—"
      trustBar: qualityFromSpam?.h ?? undefined,
      medQuality: qualityFromSpam?.m ?? undefined,
      lowQuality: qualityFromSpam?.l ?? undefined,
      referringDomains: linksFallback.referringDomains ?? undefined,
      backlinks: linksFallback.backlinks ?? undefined,
      dofollowPct: doNoFinal?.doPct ?? undefined,
      nofollowPct: doNoFinal?.noPct ?? undefined,

      // Technical
      siteHealth:
        mobilePerf != null
          ? Math.round(mobilePerf * 100)
          : desktopPerf != null
          ? Math.round(desktopPerf * 100)
          : undefined,
      pagesScanned:
        typeof backlinksSummary.crawled_pages === "number"
          ? backlinksSummary.crawled_pages
          : 0,
      redirects: 0,
      broken:
        typeof backlinksSummary.broken_pages === "number"
          ? backlinksSummary.broken_pages
          : 0,
      cwvScores: {
        LCP_Score:
          typeof vitals.lcp === "number" ? vitals.lcp / 1000 : undefined,
        INP_Score:
          typeof vitals.tti === "number" ? vitals.tti : undefined,
        CLS_Score:
          typeof vitals.cls === "number" ? vitals.cls : undefined,
      },
      pageSpeed: {
        desktop:
          desktopPerf != null
            ? Math.round(desktopPerf * 100)
            : mobilePerf != null
            ? Math.round(mobilePerf * 100)
            : undefined,
        mobile:
          mobilePerf != null
            ? Math.round(mobilePerf * 100)
            : desktopPerf != null
            ? Math.round(desktopPerf * 100)
            : undefined,
      },

      // Performance (GA4/GSC not wired yet) → fallback to seo-data.json (old behavior) → else realistic random
      organicTraffic: perfFallback.organicTraffic,
      organicKeywords: perfFallback.organicKeywords,

      // Leads
      leads: perfFallback.leads,

      // AI SEO Matrix – prefers backend (seo.dataForSeo.aiTools) with safe fallbacks
      aiTools: (() => {
        const api = dataForSeo.aiTools || {};
        // Real data only — no fake fallback values
        const safeTool = (key, src) => {
          const t = api[key] || {};
          const rating = typeof t.rating === "number" ? t.rating : null;
          const pages  = typeof t.pages  === "number" ? t.pages  : null;
          return { rating, pages, src };
        };
        return {
          GPT:        safeTool("GPT",        "/assets/gpt.svg"),
          GoogleAI:   safeTool("GoogleAI",   "/assets/google.svg"),
          Perplexity: safeTool("Perplexity", "/assets/perplexity.svg"),
          Copilot:    safeTool("Copilot",    "/assets/copilot.svg"),
          Gemini:     safeTool("Gemini",     "/assets/gemini.svg"),
        };
      })(),

      // SERP features — null when no real API data (DataForSEO SERP or Serper)
      serp: {
        coveragePercent:   typeof serpFeatures.coveragePercent  === "number" ? serpFeatures.coveragePercent  : null,
        featuredSnippets:  typeof serpFeatures.featuredSnippets === "number" ? serpFeatures.featuredSnippets : null,
        peopleAlsoAsk:     typeof serpFeatures.peopleAlsoAsk    === "number" ? serpFeatures.peopleAlsoAsk    : null,
        imagePack:         typeof serpFeatures.imagePack        === "number" ? serpFeatures.imagePack        : null,
        videoResults:      typeof serpFeatures.videoResults     === "number" ? serpFeatures.videoResults     : null,
        knowledgePanel:    typeof serpFeatures.knowledgePanel   === "number" ? serpFeatures.knowledgePanel   : null,
        hasRealData: dataForSeoHasRealSerpData || Object.keys(serpFeaturesFromSerper).length > 0,
      },

      // Issue counts (from backend seo.issues, with safe fallbacks)
      issues: {
        critical: seo.issues?.critical ?? 0,
        warning: seo.issues?.warning ?? 0,
        recommendations: seo.issues?.recommendations ?? 0,
        contentOpps: seo.issues?.contentOpps ?? 0,
      },

      // Growth percentages for issues (from backend seo.issuesGrowth if present)
      issuesGrowth: {
        critical: seo.issuesGrowth?.critical,
        warning: seo.issuesGrowth?.warning,
        recommendations: seo.issuesGrowth?.recommendations,
        contentOpps: seo.issuesGrowth?.contentOpps,
      },

      // NEW: on-page table rows from backend
      seoRows: apiSeoRows || [],

      // On-page content cards (blogs/pages) from backend content analysis
      content: {
        blog: content.blog || [],
        pages: content.pages || [],
      },
    };

    console.log("[SERP DEBUG] Final SERP counts:", mapped.serp);
    console.log(
      "[Dashboard] Mapped selected metrics (api vs placeholders):",
      mapped
    );
    return mapped;
  }, [seo, domain, fallbackSelected]);

  // ---------------- NEW: Performance numbers wired from GA4/GSC (falls back gracefully) ----------------
  const perfData = useMemo(() => {
    const zeroPerf = {
      organicTraffic: { monthly: 0, growth: 0 },
      organicKeywords: { total: 0, top3: 0, top10: 0, top100: 0 },
      leads: { monthly: 0, goal: 0, contactForm: 0, newsletter: 0, growth: 0 },
    };

    // If Google isn't connected, show 0s (no JSON/random fallback).
    if (!googleStatus.connected) return zeroPerf;

    // If connected but GA4/GSC isn't usable yet (no selection / no access / empty lists),
    // keep showing 0s (no JSON/random fallback).
    const gaErr = String(ga4Error || "");
    const gsErr = String(gscError || "");
    const bothErr = `${gaErr} ${gsErr}`.toLowerCase();

    const needsGa4 = /property not selected/i.test(gaErr);
    const needsGsc = /site not selected/i.test(gsErr);

    const looksLikeAccess =
      bothErr.includes("insufficient") ||
      bothErr.includes("permission") ||
      bothErr.includes("forbidden") ||
      bothErr.includes("unauthorized") ||
      bothErr.includes("not have") ||
      bothErr.includes("not authorized") ||
      bothErr.includes("not permitted");

    const emptyLists =
      (Array.isArray(ga4Properties) && ga4Properties.length === 0) ||
      (Array.isArray(gscSites) && gscSites.length === 0);

    if (needsGa4 || needsGsc || looksLikeAccess || emptyLists) return zeroPerf;

    // If Google isn't connected, we intentionally show 0s (no demo/fallback) for GA4/GSC-driven metrics.
    if (!googleStatus.connected) {
      return {
        organicTraffic: { monthly: 0, growth: 0 },
        organicKeywords: { total: 0, top3: 0, top10: 0, top100: 0 },
        leads: { monthly: 0, goal: 0, contactForm: 0, newsletter: 0, growth: 0 },
      };
    }
    const d = seo?._meta?.domain || domain || "example.com";

    // GA4 API might return numbers directly or nested objects. Support both.
    const gaTrafficMonthly =
      typeof ga4Metrics?.organicTraffic === "number"
        ? ga4Metrics.organicTraffic
        : ga4Metrics?.organicTraffic?.monthly;

    const gaLeadsMonthly =
      typeof ga4Metrics?.leads === "number"
        ? ga4Metrics.leads
        : ga4Metrics?.leads?.monthly;

    // GSC API is expected to return total keyword count (+ optional breakdown)
    const gscKwTotal =
      typeof gscMetrics?.keywordsTotal === "number"
        ? gscMetrics.keywordsTotal
        : gscMetrics?.organicKeywords?.total;

    const gscTop3 =
      typeof gscMetrics?.top3 === "number"
        ? gscMetrics.top3
        : gscMetrics?.organicKeywords?.top3;

    const gscTop10 =
      typeof gscMetrics?.top10 === "number"
        ? gscMetrics.top10
        : gscMetrics?.organicKeywords?.top10;

    const gscTop100 =
      typeof gscMetrics?.top100 === "number"
        ? gscMetrics.top100
        : gscMetrics?.organicKeywords?.top100;

    return buildPerformanceFallback({
      domain: d,
      api: {
        trafficMonthly: typeof gaTrafficMonthly === "number" ? gaTrafficMonthly : undefined,
        // (optional) trafficGrowth: ga4Metrics?.organicTraffic?.growth,
        leadsMonthly: typeof gaLeadsMonthly === "number" ? gaLeadsMonthly : undefined,
        // (optional) leadsGrowth: ga4Metrics?.leads?.growth,
        keywordsTotal: typeof gscKwTotal === "number" ? gscKwTotal : undefined,
        keywordsTop3: typeof gscTop3 === "number" ? gscTop3 : undefined,
        keywordsTop10: typeof gscTop10 === "number" ? gscTop10 : undefined,
        keywordsTop100: typeof gscTop100 === "number" ? gscTop100 : undefined,
      },
      jsonRow: fallbackSelected,
    });
  }, [seo, domain, fallbackSelected, ga4Metrics, gscMetrics, googleStatus.connected, ga4Error, gscError, ga4Properties, gscSites]);

  // ---------------- NEW: Base performance numbers (Big values) ----------------
  // Big values in the Performance cards should come from seo-data.json (fallbackSelected) or realistic randoms.
  // Google (GA4/GSC) values are shown as small badges beside the big values.
  const basePerf = useMemo(() => {
    const d = seo?._meta?.domain || domain || "example.com";
    const dro = seo?.domainRankOverview || {};
    return buildPerformanceFallback({
      domain: d,
      api: {
        trafficMonthly: (typeof dro.organicTraffic === "number" && dro.organicTraffic > 0) ? dro.organicTraffic : undefined,
        keywordsTotal: (typeof dro.organicKeywords === "number" && dro.organicKeywords > 0) ? dro.organicKeywords : undefined,
      },
      jsonRow: fallbackSelected
    });
  }, [seo, domain, fallbackSelected]);

  // Small "Google" numbers (for badges beside the big values)
  const googlePerf = useMemo(() => {
    const out = {
      ga4TrafficMonthly: undefined,
      ga4LeadsMonthly: undefined,
      gscKeywordsTotal: undefined,
    };

    const gaTrafficMonthly =
      typeof ga4Metrics?.organicTraffic === "number"
        ? ga4Metrics.organicTraffic
        : ga4Metrics?.organicTraffic?.monthly;

    const gaLeadsMonthly =
      typeof ga4Metrics?.leads === "number"
        ? ga4Metrics.leads
        : ga4Metrics?.leads?.monthly;

    const gscKwTotal =
      typeof gscMetrics?.keywordsTotal === "number"
        ? gscMetrics.keywordsTotal
        : gscMetrics?.organicKeywords?.total;

    if (typeof gaTrafficMonthly === "number" && Number.isFinite(gaTrafficMonthly)) {
      out.ga4TrafficMonthly = gaTrafficMonthly;
    }
    if (typeof gaLeadsMonthly === "number" && Number.isFinite(gaLeadsMonthly)) {
      out.ga4LeadsMonthly = gaLeadsMonthly;
    }
    if (typeof gscKwTotal === "number" && Number.isFinite(gscKwTotal)) {
      out.gscKeywordsTotal = gscKwTotal;
    }

    return out;
  }, [ga4Metrics, gscMetrics]);

// ---------------- GA4/GSC UI notice state (for Performance cards) ----------------
const analyticsNotice = useMemo(() => {
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
  if (googleStatus.loading) return null;

  // 1) Not connected
  if (!googleStatus.connected) {
    return {
      kind: "disconnected",
      title: "Connect to Google account",
      message:
        "Connect your Google account to see real Organic Traffic, Organic Keywords, and Leads on the dashboard.",
    };
  }

  const gaErr = String(ga4Error || "");
  const gsErr = String(gscError || "");
  const bothErr = `${gaErr} ${gsErr}`.toLowerCase();

  // 2) Connected but selection missing (cookie not set yet)
  const needsGa4 = /property not selected/i.test(gaErr);
  const needsGsc = /site not selected/i.test(gsErr);
  if (needsGa4 || needsGsc) {
    return {
      kind: "needs_selection",
      title: "Select your GA4 property & Search Console site",
      message:
        "We found your Google connection, but we still need you to select the correct GA4 property and/or Search Console site to load real metrics.",
    };
  }

  // 3) Connected but account doesn't have access
  const looksLikeAccess =
    bothErr.includes("insufficient") ||
    bothErr.includes("permission") ||
    bothErr.includes("forbidden") ||
    bothErr.includes("unauthorized") ||
    bothErr.includes("not have") ||
    bothErr.includes("not authorized") ||
    bothErr.includes("not permitted");

  if (looksLikeAccess) {
    return {
      kind: "no_access",
      title: "This Gmail doesn’t have access to this site",
      message:
        "Your Google account is connected, but it doesn’t have GA4/GSC access for this website. Connect the correct Gmail or request access in GA4 / Search Console.",
    };
  }

  // 4) Connected and APIs respond, but values are empty/0 (common when GA4 has no data or conversions not set)
  const gaOk = !!ga4Metrics?.ok;
  const gsOk = !!gscMetrics?.ok;

  const gaTraffic =
    typeof ga4Metrics?.organicTraffic === "number"
      ? ga4Metrics.organicTraffic
      : ga4Metrics?.organicTraffic?.monthly;

  const gaLeads =
    typeof ga4Metrics?.leads === "number"
      ? ga4Metrics.leads
      : ga4Metrics?.leads?.monthly;

  const gsKw = typeof gscMetrics?.keywordsTotal === "number" ? gscMetrics.keywordsTotal : 0;

  if ((gaOk || gsOk) && (toNum(gaTraffic) === 0) && (toNum(gaLeads) === 0) && (toNum(gsKw) === 0)) {
    return {
      kind: "no_data",
      title: "No GA4/GSC data found for this site",
      message:
        "We couldn’t find GA4/GSC data for this website (last 28 days). Check that GA4 is installed, Search Console is verified, and conversions are configured for leads.",
    };
  }

  return null;
}, [googleStatus.loading, googleStatus.connected, ga4Error, gscError, ga4Metrics, gscMetrics]);




  // Flags to see what is API vs fallback for key metrics (logged once per load)
  const metricSources = useMemo(() => {
    if (!selected) return null;
    return {
      domainRatingFromApi: selected.domainRating != null,
      siteHealthFromApi: selected.siteHealth != null,
      pageSpeedDesktopFromApi: selected.pageSpeed?.desktop != null,
      cwvFromApi:
        selected.cwvScores?.LCP_Score != null ||
        selected.cwvScores?.INP_Score != null ||
        selected.cwvScores?.CLS_Score != null,
      referringDomainsFromApi: selected.referringDomains != null,
      serpFeatureCountsFromApi:
        selected.serp?.featuredSnippets !== 23 ||
        selected.serp?.peopleAlsoAsk !== 156,
      organicTrafficIsPlaceholder: !ga4Metrics && (perfData?.organicTraffic?.monthly ?? 0) === 0,
      organicKeywordsIsPlaceholder: !gscMetrics && (perfData?.organicKeywords?.total ?? 0) === 0,
      leadsIsPlaceholder: !ga4Metrics && (perfData?.leads?.monthly ?? 0) === 0,
    };
  }, [selected, perfData]);

  useEffect(() => {
    if (!seo || !metricSources) return;
    console.log(
      "[Dashboard] Metric source flags (true = API, false = fallback/demo):",
      metricSources
    );
  }, [seo, metricSources]);

  // ====== Values (with graceful fallbacks to your current hardcoded demo numbers) ======
  const DR_TARGET = selected?.domainRating ?? null; // null = no real data → show "—"
  const INDUSTRY_AVG = selected?.industryAvgDR ?? null;

  const RD_TARGET = selected?.referringDomains ?? null;
  // Normalize High/Medium/Low quality percentages so they always sum to 100
  const qualitySplit = useMemo(() => {
    const h = selected?.trustBar;
    const m = selected?.medQuality;
    const l = selected?.lowQuality;
    if (h == null && m == null && l == null) return null; // no real data
    const hv = h ?? 0, mv = m ?? 0, lv = l ?? 0;
    const sum = hv + mv + lv;
    if (!sum) return null;
    if (sum === 100) return { h: hv, m: mv, l: lv };
    return { h: (hv / sum) * 100, m: (mv / sum) * 100, l: (lv / sum) * 100 };
  }, [selected?.trustBar, selected?.medQuality, selected?.lowQuality]);

  const TB_TARGET = selected?.backlinks ?? null;

  const SH_SCORE  = selected?.siteHealth ?? 0;
  const SH_PAGES  = selected?.pagesScanned ?? 0;
  const SH_REDIRECT = selected?.redirects ?? 0;
  const SH_BROKEN = selected?.broken ?? 0;

  // CWV: drive tiles from dataset; fall back to demos if missing
  const LCP_TARGET = selected?.cwvScores?.LCP_Score ?? 0;   // seconds
  const INP_TARGET = selected?.cwvScores?.INP_Score ?? 0;   // ms
  const CLS_TARGET = selected?.cwvScores?.CLS_Score ?? 0;  // unitless

  const PS_DESKTOP = selected?.pageSpeed?.desktop ?? 0;
  const PS_MOBILE  = selected?.pageSpeed?.mobile ?? 0;

  const OT_TARGET  = basePerf?.organicTraffic?.monthly ?? null;
  const OK_TOTAL   = basePerf?.organicKeywords?.total ?? null;

  const OK_SPLIT = {
    top3:  basePerf?.organicKeywords?.top3   ?? null,
    top10: basePerf?.organicKeywords?.top10  ?? null,
    top100:basePerf?.organicKeywords?.top100 ?? null,
    total: OK_TOTAL,
  };

  const LEADS_TARGET = basePerf?.leads?.monthly    ?? null;
  const LEADS_GOAL   = basePerf?.leads?.goal        ?? null;
  const CF_VALUE     = basePerf?.leads?.contactForm ?? null;
  const NL_VALUE     = basePerf?.leads?.newsletter  ?? null;
  const CF_LIMIT     = 800;
  const NL_LIMIT     = 400;

  // SERP counts — null when API has no data
  const serpCountsMemo = useMemo(() => ([
    selected?.serp?.featuredSnippets ?? null,
    selected?.serp?.peopleAlsoAsk    ?? null,
    selected?.serp?.imagePack        ?? null,
    selected?.serp?.videoResults     ?? null,
    selected?.serp?.knowledgePanel   ?? null,
  ]), [selected?.serp]);
  const SERP_COVERAGE = selected?.serp?.coveragePercent ?? null;
  const serpHasRealData = selected?.serp?.hasRealData === true;

  const seoRowsFromData = selected?.seoRows?.length ? selected.seoRows : null;
  // Keyword difficulty — use real DataForSEO value only; show 0 if unavailable (no hash fakes)
  const seoRowsForTable = useMemo(() => {
    if (!seoRowsFromData) return null;
    return seoRowsFromData.map((row) => {
      const raw = row?.difficulty ?? row?.kd ?? row?.keywordDifficulty ?? row?.keyword_difficulty;
      const diff = Number(raw);
      return { ...row, difficulty: (Number.isFinite(diff) && diff > 0 && diff <= 100) ? diff : null };
    });
  }, [seoRowsFromData]);

  // ====== Animation Orchestrator (all widgets sync) ======
const MASTER_MS = 1000;                 // single duration for everything
const [prog, setProg] = useState(0);    // 0 → 1 (eased)

useEffect(() => {
  if (!seo) return; // gate on data to avoid "second wave"
  let raf;
  let start = null; // rAF timestamp (same clock as `now`)
  const tick = (now) => {
    if (start === null) start = now;
    const tRaw = (now - start) / MASTER_MS;
    const t = Math.max(0, Math.min(1, tRaw));
    const ease = 1 - Math.pow(1 - t, 3); // cubic-out
    setProg(ease);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [seo]);


// ---- Derived animated values (null-safe — null targets stay null; UI shows "—") ----
const drValue = DR_TARGET != null ? Math.max(0, DR_TARGET * prog) : null;
const drTrustWidth = drValue != null ? Math.max(0, Math.min(100, drValue)) : 0;
const drDiffPct = (DR_TARGET != null && INDUSTRY_AVG != null && INDUSTRY_AVG > 0)
  ? ((DR_TARGET - INDUSTRY_AVG) / INDUSTRY_AVG) * 100
  : null;
const drTrendUp = drDiffPct != null ? drDiffPct >= 0 : null;
const drTrendText = drDiffPct != null
  ? `${drTrendUp ? "↗︎" : "↘︎"} ${Math.abs(drDiffPct).toFixed(1)}%`
  : null;

let drBadgeLabel = "No Data";
if (DR_TARGET != null && INDUSTRY_AVG != null) {
  if (DR_TARGET >= INDUSTRY_AVG * 1.2) drBadgeLabel = "Above Average";
  else if (DR_TARGET <= INDUSTRY_AVG * 0.8) drBadgeLabel = "Below Average";
  else drBadgeLabel = "Average";
}

const rdValue = RD_TARGET != null ? Math.max(0, RD_TARGET * prog) : null;
const rdP = Math.max(0, prog);  // reuse for quality bars

const tbValue = TB_TARGET != null ? Math.max(0, TB_TARGET * prog) : null;

const shValue = Math.max(0, SH_SCORE * prog);
const pagesScanned = Math.max(0, Math.round(SH_PAGES * prog));
const redirects = Math.max(0, Math.round(SH_REDIRECT * prog));
const broken = Math.max(0, Math.round(SH_BROKEN * prog));

const lcp = Math.max(0, LCP_TARGET * prog);
const inp = Math.max(0, INP_TARGET * prog);
const cls = Math.max(0, CLS_TARGET * prog);

const psProgress = Math.max(0, prog);

const otValue = OT_TARGET != null ? Math.max(0, OT_TARGET * prog) : null;
const otProg = Math.max(0, prog);

const okValue = OK_TOTAL != null ? Math.max(0, OK_TOTAL * prog) : null;
const okProg = Math.max(0, prog);

const leadsCount = LEADS_TARGET != null ? Math.max(0, LEADS_TARGET * prog) : null;
const leadsProg = Math.max(0, prog);

const serpCounts = serpCountsMemo.map((n) => n != null ? Math.max(0, Math.round(n * prog)) : null);
const serpCoverage = SERP_COVERAGE != null ? Math.max(0, SERP_COVERAGE * prog) : null;

const oppCounts = [
  Math.round(Math.max(0, (selected?.issues?.critical ?? 0) * prog)),
  Math.round(Math.max(0, (selected?.issues?.warning ?? 0) * prog)),
  Math.round(Math.max(0, (selected?.issues?.recommendations ?? 0) * prog)),
  Math.round(Math.max(0, (selected?.issues?.contentOpps ?? 0) * prog)),
];

const oppCardsProgress = Math.max(0, prog);
const seoTableProg = Math.max(0, prog);

  // On-page content opportunities (pulled from seo-data.json)
  const blogCards = selected?.content?.blog ?? [];
  const pageCards = selected?.content?.pages ?? [];


// ====== Small UI helpers (unchanged, except table rows can be dataset-driven) ======
// ====== Small UI helpers (unchanged, except table rows can be dataset-driven) ======
  function DifficultyBar({ value, progress = 1 }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    const pct = Math.max(0, Math.min(100, value));
    const p   = Math.max(0, Math.min(1, progress));
    const fill = pct < 40 ? "#EF4444" : pct < 70 ? "#F59E0B" : "#10B981";
    return (
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-[#E5E7EB]">
        <div
          className="h-2 rounded-full w-0"
          style={{
            width: `${pct * p}%`,
            backgroundColor: fill,
            transition: "none",
          }}
        />
      </div>
    );
  }

  function getPriority(score) {
    if (score <= 30) {
      return {
        label: "High Priority",
        dot: "#EF4444",
        pillBg: "#FFF0F4",
        pillBorder: "#FFE1EA",
        pillText: "#D12C2C",
        chipBg: "#FFF0F4",
        chipBorder: "#FFE1EA",
        chipText: "#D12C2C",
      };
    }
    if (score <= 70) {
      return {
        label: "Medium Priority",
        dot: "#F59E0B",
        pillBg: "#FFF5D9",
        pillBorder: "#FDE7B8",
        pillText: "#B98500",
        chipBg: "#FFF5D9",
        chipBorder: "#FDE7B8",
        chipText: "#B98500",
      };
    }
    return {
      label: "Low Priority",
      dot: "#22C55E",
      pillBg: "#EAF8F1",
      pillBorder: "#CBEBD9",
      pillText: "#178A5D",
      chipBg: "#EAF8F1",
      chipBorder: "#CBEBD9",
      chipText: "#178A5D",
    };
  }

  function OpportunityCard({ title, score, wordCount, keywords, status, progress = 1 }) {
    const scoreAnim = Math.max(0, Math.round(score * progress));
    const wordAnim  = Math.max(0, Math.round(wordCount * progress));
    const keyAnim   = Math.max(0, Math.round(keywords * progress));
    const pri = getPriority(score);
    return (
      <div className="relative rounded-[18px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
        <div className="group absolute right-4 top-4">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-semibold shadow-sm tabular-nums"
            style={{ backgroundColor: pri.chipBg, border: `1px solid ${pri.chipBorder}`, color: pri.chipText }}
            aria-label={`Page Speed Indicator: ${scoreAnim}`}
          >
            {scoreAnim}
          </div>
          <div className="pointer-events-none absolute -top-3 right-1/2 z-10 w-max translate-x-1/2 -translate-y-full
                          rounded-md bg-black px-3 py-2 text-white opacity-0 shadow-lg transition-opacity
                          duration-150 group-hover:opacity-100">
            <div className="text-[12px] font-semibold">Page Speed Indicator: {scoreAnim}</div>
            <div className="mt-0.5 text-[11px] text-gray-300">Your site&#39;s credit rating with Google.</div>
            <span className="absolute left-1/2 top-full -translate-x-1/2
                            border-x-8 border-t-8 border-b-0 border-solid
                            border-x-transparent border-t-black" />
          </div>
        </div>

        <div className="pr-14">
          <h3 className="text-[20px] font-semibold leading-snug text-[var(--text)]">{title}</h3>
        </div>

        <hr className="mt-3 border-t border-[var(--border)]" />

        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-[10px] px-2.5 py-1 text-[12px] font-medium"
            style={{ backgroundColor: pri.pillBg, border: `1px solid ${pri.pillBorder}`, color: pri.pillText }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pri.dot }} />
            {pri.label}
          </span>
          <span className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[#F6F8FB] px-2.5 py-1 text-[12px] text-[var(--muted)]">
            {status === "Published" ? <Check size={14} /> : <PencilLine size={14} />}
            {status}
          </span>
        </div>

        <div className="mt-4 rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-4 py-3">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-[12px] text-[var(--muted)]">Word Count</div>
              <div className="mt-1 text-[28px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {wordAnim.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[12px] text-[var(--muted)]">Keywords</div>
              <div className="mt-1 text-[28px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {keyAnim}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[12px] font-medium text-[var(--muted)]">
            <Eye size={14} /> View Details
          </button>
<button
  onClick={() => {
    const payload = { title }; // you can add more fields later (e.g., type, id, content)
    window.dispatchEvent(new CustomEvent("content-editor:open", { detail: payload }));
    onOpenContentEditor?.(payload);
  }}
  className="inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-[13px] font-semibold text-white shadow-sm bg-[image:var(--infoHighlight-gradient)] hover:opacity-90 transition"
>
  Start <ChevronRight size={16} />
</button>

        </div>
      </div>
    );
  }

  function CircleGauge({ target, color, label, Icon, progress }) {
    const pct = Math.max(0, Math.min(100, target * progress));
    const angle = (pct / 100) * 360;
    const bg = `conic-gradient(${color} ${angle}deg, #E5E7EB 0deg)`;
    return (
      <div className="flex flex-col items-center ">
        <div className="relative h-32 w-32 rounded-full" style={{ background: bg }}>
          <div className="absolute inset-3 rounded-full bg-[var(--input)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="text-[28px] font-semibold leading-none text-[var(--text)] tabular-nums">
              {Math.round(pct)}
            </div>
            <div className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
              {Icon ? <Icon size={14} /> : null}
              {label}
            </div>
          </div>
        </div>
        <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#BEE7D6] bg-[#EAF8F1] px-2.5 py-1 text-[12px] font-medium text-[#178A5D]">
          Excellent
          <TrendingUp size={14} />
        </span>
      </div>
    );
  }

  // ──────── AI Deep Analyze handler ────────
  const handleAiAnalyze = useCallback(async () => {
    if (!seo || !domain) return;
    setAiLoading(true);
    setAiError("");
    setAiPanelOpen(true);

    try {
      // Aggregate all available metrics into a single payload
      const payload = {
        domain,
        url: `https://${domain}`,
        performance: {
          score: seo?.psi?.mobile?.performanceScore ?? seo?.psi?.desktop?.performanceScore ?? null,
          desktopScore: seo?.psi?.desktop?.performanceScore ?? null,
          mobileScore: seo?.psi?.mobile?.performanceScore ?? null,
        },
        seo: {
          score: selected?.siteHealth ?? null,
          title: seo?.onPage?.title ?? "",
          metaDescription: seo?.onPage?.metaDescription ?? "",
          h1s: seo?.onPage?.h1s ?? [],
          wordCount: seo?.onPage?.wordCount ?? null,
          imagesWithoutAlt: seo?.onPage?.imagesWithoutAlt ?? null,
          internalLinks: seo?.onPage?.internalLinks ?? null,
          externalLinks: seo?.onPage?.externalLinks ?? null,
          issueCounts: seo?.psi?.mobile?.issueCounts ?? seo?.psi?.desktop?.issueCounts ?? {},
          issues: seo?.issues ?? [],
        },
        coreWebVitals: {
          lab: {
            lcp: seo?.psi?.mobile?.coreWebVitalsLab?.lcp ?? seo?.psi?.desktop?.coreWebVitalsLab?.lcp,
            cls: seo?.psi?.mobile?.coreWebVitalsLab?.cls ?? seo?.psi?.desktop?.coreWebVitalsLab?.cls,
            fcp: seo?.psi?.mobile?.coreWebVitalsLab?.fcp ?? seo?.psi?.desktop?.coreWebVitalsLab?.fcp,
            tti: seo?.psi?.mobile?.coreWebVitalsLab?.tti ?? seo?.psi?.desktop?.coreWebVitalsLab?.tti,
          },
          field: seo?.psi?.mobile?.coreWebVitalsField ?? seo?.psi?.desktop?.coreWebVitalsField ?? {},
        },
        keywords: {
          keywords: seo?.keywords?.keywords ?? [],
          clusters: seo?.keywords?.clusters ?? [],
          suggestions: seo?.seoRows?.map(r => r?.keyword).filter(Boolean) ?? [],
        },
        competitors: {
          businessCompetitors: seo?.competitors?.businessCompetitors ?? [],
          searchCompetitors: seo?.competitors?.searchCompetitors ?? [],
          buckets: seo?.competitors?.buckets ?? {},
        },
        backlinks: {
          domainRating: selected?.domainRating ?? null,
          totalBacklinks: selected?.backlinks ?? null,
          referringDomains: selected?.referringDomains ?? null,
          organicTraffic: perfData?.organicTraffic?.monthly ?? null,
        },
        technical: {
          https: seo?.technical?.https ?? null,
          robotsTxt: seo?.technical?.robotsTxt ?? null,
          sitemap: seo?.technical?.sitemap ?? null,
          canonical: seo?.technical?.canonical ?? null,
          structuredData: seo?.technical?.structuredData ?? null,
          issueCounts: seo?.psi?.mobile?.issueCounts ?? {},
        },
        content: {
          title: seo?.onPage?.title ?? "",
          metaDescription: seo?.onPage?.metaDescription ?? "",
          h1s: seo?.onPage?.h1s ?? [],
          wordCount: seo?.onPage?.wordCount ?? null,
        },
        mobile: {
          score: seo?.psi?.mobile?.performanceScore ?? null,
          friendly: seo?.mobile?.friendly ?? null,
          viewport: seo?.mobile?.viewport ?? null,
        },
        security: {
          https: seo?.technical?.https ?? null,
        },
        gsc: {
          totalImpressions: gscMetrics?.impressions ?? null,
          totalClicks: gscMetrics?.clicks ?? null,
          avgCtr: gscMetrics?.ctr ?? null,
          avgPosition: gscMetrics?.position ?? null,
          topPages: gscMetrics?.topPages ?? [],
          topQueries: gscMetrics?.rows ?? [],
          keywords: gscMetrics?.rows?.map(r => r?.keys?.[0] || r?.query).filter(Boolean) ?? [],
        },
        onPageAudit: {
          errors404: seo?.onPageAudit?.pages_404 ?? onPageAudit?.pages_404 ?? null,
          errors404Pct: seo?.onPageAudit?.pages_404_pct ?? onPageAudit?.pages_404_pct ?? null,
          redirectChains: seo?.onPageAudit?.redirect_chains ?? onPageAudit?.redirect_chains ?? null,
          redirectChainsPct: seo?.onPageAudit?.redirect_chains_pct ?? onPageAudit?.redirect_chains_pct ?? null,
          brokenResources: seo?.onPageAudit?.broken_resources ?? onPageAudit?.broken_resources ?? null,
          missingTitle: seo?.onPageAudit?.missing_title ?? onPageAudit?.missing_title ?? null,
          missingDescription: seo?.onPageAudit?.missing_description ?? onPageAudit?.missing_description ?? null,
          missingH1: seo?.onPageAudit?.missing_h1 ?? onPageAudit?.missing_h1 ?? null,
        },
        rankedKeywords: seo?.rankedKeywords ?? [],
        competitorDomains: seo?.competitorDomains ?? [],
        domainRankOverview: seo?.domainRankOverview ?? {},
      };

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `AI analysis failed (${res.status})`);

      setAiAnalysis(json.analysis);
    } catch (err) {
      setAiError(err?.message || "AI analysis failed. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }, [seo, domain, selected, perfData, gscMetrics, onPageAudit]);

  // ──────── Generate PDF Report ────────
  const handleGenerateReport = useCallback(async () => {
    if (!domain) return;
    setReportLoading(true);
    setReportError("");

    try {
      const payload = {
        domain,
        analysis: aiAnalysis || {},
        metrics: {
          performance: {
            score: seo?.psi?.mobile?.performanceScore ?? null,
            desktopScore: seo?.psi?.desktop?.performanceScore ?? null,
            mobileScore: seo?.psi?.mobile?.performanceScore ?? null,
          },
          coreWebVitals: {
            lab: seo?.psi?.mobile?.coreWebVitalsLab ?? {},
            field: seo?.psi?.mobile?.coreWebVitalsField ?? {},
          },
          backlinks: {
            domainRating: selected?.domainRating ?? null,
            totalBacklinks: selected?.backlinks ?? null,
            referringDomains: selected?.referringDomains ?? null,
          },
          keywords: {
            keywords: seo?.keywords?.keywords ?? [],
          },
          competitors: {
            businessCompetitors: seo?.competitors?.businessCompetitors ?? [],
            searchCompetitors: seo?.competitors?.searchCompetitors ?? [],
          },
        },
      };

      const res = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Report generation failed (${res.status})`);
      }

      // Trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `drfizz-seo-report-${domain}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err?.message || "Report generation failed. Please try again.");
    } finally {
      setReportLoading(false);
    }
  }, [domain, aiAnalysis, seo, selected]);

  // ====== UI (kept from your working component; only dynamic spots were wired) ======
  return (
    <main className="min-h-screen bg-[var(--bg-panel)] px-4 py-6 sm:px-6 lg:px-8 overflow-x-hidden">

      {/* ── Initial SEO data loading overlay ── */}
      {seoLoading && (
        <div className="fixed inset-0 z-[9000] flex flex-col items-center justify-center bg-white/90 dark:bg-black/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 w-full max-w-xs px-8">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#d45427] to-[#ffa615] flex items-center justify-center shadow-xl animate-pulse">
              <Activity size={24} className="text-white" />
            </div>
            <div className="text-center">
              <div className="text-base font-black text-gray-900 dark:text-white">Preparing Dashboard</div>
              <div className="text-xs text-gray-500 mt-1">Fetching SEO metrics, keywords &amp; insights…</div>
            </div>
            {/* Indeterminate progress bar */}
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-[#d45427] to-[#ffa615] animate-[loading-bar_1.4s_ease-in-out_infinite]" style={{ width: "45%" }} />
            </div>
            <div className="text-[11px] text-gray-400">This takes ~15–30 seconds on first load</div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[100%] mt-1">
        <DashboardHeader />
        {/* Row 1 */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">
          Off-Page SEO Metrics
        </h2>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Domain Rating */}
          <div id="df-google-panel" className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                  <ShieldCheck size={16} />
                </span>
                <span className="text-[13px] text-gray-700 leading-relaxed">
                  Domain Rating
                </span>
              </div>
              <span className="rounded-full bg-[#EAF8F1] px-2 py-0.5 text-[11px] font-medium text-[#178A5D]">
                {drBadgeLabel}
              </span>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {drValue != null ? drValue.toFixed(1) : "—"}
              </div>
              {drValue != null && <div className="pb-1 text-[13px] text-[var(--muted)]">/ 100</div>}
              {drTrendText && (
                <div
                  className={`ml-auto text-[12px] font-medium ${
                    drTrendUp ? "text-[#1BA97A]" : "text-[#EF4444]"
                  }`}
                >
                  {drTrendText}
                </div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-[var(--muted)]">
              Industry Avg:{" "}
              <span className="font-medium text-[var(--muted)]">
                {INDUSTRY_AVG != null ? INDUSTRY_AVG.toFixed(1) : "—"}
              </span>
            </div>

            <div className="mt-3 text-[12px] text-[var(--muted)]">Trust score</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-2 rounded-full bg-[#1CC88A]"
                style={{ width: `${drTrustWidth}%` }}
              />
            </div>
          </div> 

          {/* Referring Domains */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                  <Network size={16} />
                </span>
                <span className="text-[13px] text-gray-700 leading-relaxed">
                  Referring Domains
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF6E7] px-2 py-0.5 text-[11px] font-medium text-[#B67200]">
                <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" />
                Growing
              </span>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {rdValue != null ? formatCompactNumber(rdValue) : "—"}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[12px] text-[var(--muted)]">
                Quality Distribution
              </div>

              {qualitySplit ? (
                <>
                  <div className="relative">
                    <div className="h-2 w-full rounded-full bg-[var(--border)]" />
                    <div className="absolute inset-0 flex h-2 items-stretch gap-[6px] px-[2px]">
                      <div className="h-2 self-center rounded-full bg-[#1CC88A]" style={{ width: `${qualitySplit.h * rdP}%` }} />
                      <div className="h-2 self-center rounded-full bg-[#F59E0B]" style={{ width: `${qualitySplit.m * rdP}%` }} />
                      <div className="h-2 self-center rounded-full bg-[#EF4444]" style={{ width: `${qualitySplit.l * rdP}%` }} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-6 text-[11px] text-[var(--muted)]">
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#1CC88A]" /> High: {qualitySplit.h.toFixed(0)}%
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#F59E0B]" /> Medium: {qualitySplit.m.toFixed(0)}%
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" /> Low: {qualitySplit.l.toFixed(0)}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-[12px] text-[var(--muted)]">
                  — Requires DataForSEO Backlinks API
                </div>
              )}
            </div>
          </div>

          {/* Total Backlinks */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                  <Link2 size={16} />
                </span>
                <span className="text-[13px] text-gray-700 leading-relaxed">
                  Total Backlinks
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF0FF] px-2 py-0.5 text-[11px] font-medium text-[#4C53D8]">
                <span className="inline-block h-2 w-2 rounded-full bg-[#3B82F6]" />
                Strong Profile
              </span>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {tbValue != null ? formatCompactNumber(tbValue) : "—"}
              </div>
            </div>

            <div className="mt-3 grid gap-3 text-[12px]">
              <div className="relative grid h-16 grid-cols-[1fr_auto] items-center rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3">
                <span className="absolute left-0 top-0 h-full w-[4px] rounded-l-[10px] bg-[#1CC88A]" />
                <div className="flex flex-col">
                  <div className="text-[var(--muted)]">DoFollow</div>
                  <div className="mt-0.5 text-[20px] font-semibold text-[var(--text)]">
                    {selected?.dofollowPct != null ? `${selected.dofollowPct}%` : "—"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-[var(--muted)]">
                  Link that give <span className="font-medium text-[var(--text)]">SEO</span> credit
                </div>
              </div>

              <div className="relative grid h-16 grid-cols-[1fr_auto] items-center rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3">
                <span className="absolute left-0 top-0 h-full w-[4px] rounded-l-[10px] bg-[#EF4444]" />
                <div className="flex flex-col">
                  <div className="text-[var(--muted)]">NoFollow</div>
                  <div className="mt-0.5 text-[20px] font-semibold text-[var(--text)]">
                    {selected?.nofollowPct != null ? `${selected.nofollowPct}%` : "—"}
                  </div>
                </div>
                <div className="text-right text-[11px] text-[var(--muted)]">
                  Link that just mention, no <span className="font-medium text-[var(--text)]">SEO</span> value
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Row 2 */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">
          Technical SEO
        </h2>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Site Health */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[#178A5D]">
                  <Activity size={16} />
                </span>
                <span className="flex items-center gap-1 text-[13px] text-gray-700 leading-relaxed">
                  Site Health Score
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF4FF] px-2 py-0.5 text-[11px] font-medium text-[#3178C6]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#3B82F6]" />
                  Excellent
                </span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)]">
                  <RefreshCw size={14} />
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {shValue.toFixed(1)}
              </div>
              <div className="pb-1 text-[13px] text-[var(--muted)]">/ 100</div>
            </div>

            <ul className="mt-3 space-y-2 text-[13px]">
              <li className="flex items-center justify-between rounded-[10px] border border-[#DFF1E7] bg-[var(--input)] px-3 py-3">
                <span className="flex items-center gap-2 text-[#178A5D]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[#DFF1E7] bg-[var(--input)]">
                    <Check size={14} />
                  </span>
                  Page Scanned
                </span>
                <span className="font-semibold text-[var(--text)] tabular-nums">{pagesScanned.toLocaleString()}</span>
              </li>

              <li className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[#FFF9EC] px-3 py-3">
                <span className="flex items-center gap-2 text-[#B67200]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--input)]">
                    <AlertTriangle size={14} />
                  </span>
                  Redirect
                </span>
                <span className="font-semibold text-[var(--text)] tabular-nums">{redirects.toLocaleString()}</span>
              </li>

              <li className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[#FFF6F6] px-3 py-3">
                <span className="flex items-center gap-2 text-[#D12C2C]">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--input)]">
                    <X size={14} />
                  </span>
                  Broken
                </span>
                <span className="font-semibold text-[var(--text)] tabular-nums">{broken.toLocaleString()}</span>
              </li>
            </ul>
          </div>

          {/* Core Web Vitals */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            {(() => {
              // Google CWV thresholds
              const classify = (value, goodLimit, niLimit, invert = false) => {
                if (value == null || !Number.isFinite(value)) return "unknown";
                const v = Number(value);
                if (!invert) {
                  if (v <= goodLimit) return "good";
                  if (v <= niLimit) return "ni";
                  return "poor";
                }
                // For metrics where lower is worse (none here currently)
                if (v >= goodLimit) return "good";
                if (v >= niLimit) return "ni";
                return "poor";
              };

              const lcpLevel = classify(lcp, 2.5, 4.0); // seconds
              const inpLevel = classify(inp, 200, 500); // ms
              const clsLevel = classify(cls, 0.1, 0.25); // unitless

              const overallLevel = (() => {
                if ([lcpLevel, inpLevel, clsLevel].includes("poor")) return "poor";
                if ([lcpLevel, inpLevel, clsLevel].includes("ni")) return "ni";
                if ([lcpLevel, inpLevel, clsLevel].includes("good")) return "good";
                return "unknown";
              })();

              const STATUS_STYLES = {
                good: {
                  label: "Good",
                  badgeBg: "#EAF8F1",
                  badgeBorder: "#BEE7D6",
                  badgeText: "#178A5D",
                  dot: "#22C55E",
                },
                ni: {
                  label: "Average",
                  badgeBg: "#FFF5D9",
                  badgeBorder: "#FDE7B8",
                  badgeText: "#B98500",
                  dot: "#F59E0B",
                },
                poor: {
                  label: "Poor",
                  badgeBg: "#FFF0F4",
                  badgeBorder: "#FFE1EA",
                  badgeText: "#D12C2C",
                  dot: "#EF4444",
                },
                unknown: {
                  label: "Unknown",
                  badgeBg: "#E5E7EB",
                  badgeBorder: "#D1D5DB",
                  badgeText: "#4B5563",
                  dot: "#9CA3AF",
                },
              };

              const overallStyles = (() => {
                if (overallLevel === "good") {
                  return {
                    label: "All Good",
                    bg: "#EAF8F1",
                    border: "#BEE7D6",
                    text: "#178A5D",
                  };
                }
                if (overallLevel === "ni") {
                  return {
                    label: "Needs attention",
                    bg: "#FFF5D9",
                    border: "#FDE7B8",
                    text: "#B98500",
                  };
                }
                if (overallLevel === "poor") {
                  return {
                    label: "Issues detected",
                    bg: "#FFF0F4",
                    border: "#FFE1EA",
                    text: "#D12C2C",
                  };
                }
                return {
                  label: "No data",
                  bg: "#E5E7EB",
                  border: "#D1D5DB",
                  text: "#4B5563",
                };
              })();

              const lcpStyles = STATUS_STYLES[lcpLevel] || STATUS_STYLES.unknown;
              const inpStyles = STATUS_STYLES[inpLevel] || STATUS_STYLES.unknown;
              const clsStyles = STATUS_STYLES[clsLevel] || STATUS_STYLES.unknown;

              const formatSeconds = (value) => {
                if (value == null || !Number.isFinite(value)) return "—";
                const v = Number(value);
                if (v < 1) return v.toFixed(2) + "s";
                if (v < 10) return v.toFixed(1) + "s";
                return v.toFixed(1) + "s";
              };

              const formatMs = (value) => {
                if (value == null || !Number.isFinite(value)) return "—";
                const v = Number(value);
                if (v >= 1000) return (v / 1000).toFixed(1) + "s";
                return Math.round(v) + "ms";
              };

              const lcpThresholdText = "< 2.5s";
              const inpThresholdText = "< 200ms";
              const clsThresholdText = "< 0.1";

              return (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                        <ActivitySquare size={16} />
                      </span>
                      <span className="text-[13px] text-gray-700 leading-relaxed">
                        Core web vitals
                      </span>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: overallStyles.bg,
                        border: `1px solid ${overallStyles.border}`,
                        color: overallStyles.text,
                      }}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: STATUS_STYLES[overallLevel]?.dot || "#9CA3AF" }}
                      />
                      {overallStyles.label}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {/* LCP */}
                    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-medium text-[var(--muted)]">LCP</div>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: lcpStyles.badgeBg,
                            border: `1px solid ${lcpStyles.badgeBorder}`,
                            color: lcpStyles.badgeText,
                          }}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: lcpStyles.dot }}
                          />
                          {lcpStyles.label}
                        </span>
                      </div>
                      <div className="mt-2 text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums">
                        {formatSeconds(lcp)}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{lcpThresholdText}</div>
                    </div>

                    {/* INP */}
                    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-medium text-[var(--muted)]">INP</div>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: inpStyles.badgeBg,
                            border: `1px solid ${inpStyles.badgeBorder}`,
                            color: inpStyles.badgeText,
                          }}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: inpStyles.dot }}
                          />
                          {inpStyles.label}
                        </span>
                      </div>
                      <div className="mt-2 text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums">
                        {formatMs(inp)}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{inpThresholdText}</div>
                    </div>

                    {/* CLS */}
                    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-medium text-[var(--muted)]">CLS</div>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: clsStyles.badgeBg,
                            border: `1px solid ${clsStyles.badgeBorder}`,
                            color: clsStyles.badgeText,
                          }}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: clsStyles.dot }}
                          />
                          {clsStyles.label}
                        </span>
                      </div>
                      <div className="mt-2 text-[24px] font-semibold leading-none text-[var(--text)] tabular-nums">
                        {cls?.toFixed ? cls.toFixed(2) : (Number(cls) || 0).toFixed(2)}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{clsThresholdText}</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-[var(--muted)]">
                    <span className="text-[#C5CBD6]">•</span> Data from{" "}
                    <span className="font-semibold text-[var(--text)]">Page Speed Insights</span>
                  </div>
                </>
              );
            })()}
          </div>

          
{/* Page Speed Scores */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[#178A5D]">
                  <Rocket size={16} />
                </span>
                <span className="flex items-center gap-1 text-[13px] text-gray-700 leading-relaxed">Page Speed Scores</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF4FF] px-2 py-0.5 text-[11px] font-medium text-[#3178C6]">
                <span className="inline-block h-2 w-2 rounded-full bg-[#3B82F6]" />
                Fast
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 place-items-center gap-6">
              <CircleGauge target={PS_DESKTOP} color="#3B82F6" label="Desktop" Icon={Monitor} progress={psProgress} />
              <CircleGauge target={PS_MOBILE} color="#8B5CF6" label="Mobile" Icon={Smartphone} progress={psProgress} />
            </div>

            <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-[var(--muted)]">
              <span className="text-[#C5CBD6]">•</span> Data from{" "}
              <span className="font-semibold text-[var(--text)]">Page Speed Insights</span>
            </div>
          </div>
        </section>

        {/* On-Page Health Metrics */}
        {(() => {
          // Prefer seo.onPageAudit (from SSE/full call), fallback to onPageAudit state
          const rawAudit = seo?.onPageAudit || onPageAudit || {};
          const opa = {
            errors404: rawAudit?.pages_404 ?? null,
            errors404Pct: rawAudit?.pages_404_pct ?? null,
            redirectChains: rawAudit?.redirect_chains ?? null,
            redirectChainsPct: rawAudit?.redirect_chains_pct ?? null,
            brokenResources: rawAudit?.broken_resources ?? null,
            missingTitle: rawAudit?.missing_title ?? null,
            missingH1: rawAudit?.missing_h1 ?? null,
            missingDescription: rawAudit?.missing_description ?? null,
          };
          const errors404 = opa.errors404 ?? null;
          const redirectChains = opa.redirectChains ?? null;
          const brokenResources = opa.brokenResources ?? null;
          const missingTitle = opa.missingTitle ?? null;
          const missingH1 = opa.missingH1 ?? null;
          const missingDesc = opa.missingDescription ?? null;

          // Only render this section if we have at least one on-page audit metric
          const hasAnyAuditData = [errors404, redirectChains, brokenResources, missingTitle, missingH1, missingDesc].some(v => v !== null);
          if (!hasAnyAuditData) return null;

          const auditMetrics = [
            {
              label: "404 Errors",
              value: errors404 ?? 0,
              pct: opa.errors404Pct ?? null,
              color: (errors404 ?? 0) > 0 ? "#D12C2C" : "#178A5D",
              bg: (errors404 ?? 0) > 0 ? "#FFF6F6" : "#EAF8F1",
              border: (errors404 ?? 0) > 0 ? "#FFE1EA" : "#DFF1E7",
            },
            {
              label: "Redirect Chains",
              value: redirectChains ?? 0,
              pct: opa.redirectChainsPct ?? null,
              color: (redirectChains ?? 0) > 0 ? "#B67200" : "#178A5D",
              bg: (redirectChains ?? 0) > 0 ? "#FFF9EC" : "#EAF8F1",
              border: (redirectChains ?? 0) > 0 ? "#FDE7B8" : "#DFF1E7",
            },
            {
              label: "Missing Titles",
              value: missingTitle ?? 0,
              pct: null,
              color: (missingTitle ?? 0) > 0 ? "#D12C2C" : "#178A5D",
              bg: (missingTitle ?? 0) > 0 ? "#FFF6F6" : "#EAF8F1",
              border: (missingTitle ?? 0) > 0 ? "#FFE1EA" : "#DFF1E7",
            },
            {
              label: "Missing H1 Tags",
              value: missingH1 ?? 0,
              pct: null,
              color: (missingH1 ?? 0) > 0 ? "#D12C2C" : "#178A5D",
              bg: (missingH1 ?? 0) > 0 ? "#FFF6F6" : "#EAF8F1",
              border: (missingH1 ?? 0) > 0 ? "#FFE1EA" : "#DFF1E7",
            },
            {
              label: "Missing Meta Descriptions",
              value: missingDesc ?? 0,
              pct: null,
              color: (missingDesc ?? 0) > 0 ? "#B67200" : "#178A5D",
              bg: (missingDesc ?? 0) > 0 ? "#FFF9EC" : "#EAF8F1",
              border: (missingDesc ?? 0) > 0 ? "#FDE7B8" : "#DFF1E7",
            },
            {
              label: "Broken Resources",
              value: brokenResources ?? 0,
              pct: null,
              color: (brokenResources ?? 0) > 0 ? "#D12C2C" : "#178A5D",
              bg: (brokenResources ?? 0) > 0 ? "#FFF6F6" : "#EAF8F1",
              border: (brokenResources ?? 0) > 0 ? "#FFE1EA" : "#DFF1E7",
            },
          ];

          return (
            <>
              <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">
                On-Page Health Metrics
              </h2>
              <section className="mb-8 rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                    <AlertTriangle size={16} />
                  </span>
                  <span className="text-[13px] font-semibold text-gray-700">
                    Technical Issue Breakdown
                  </span>
                  <span className="ml-auto text-[11px] text-[var(--muted)]">
                    Source: DataForSEO On-Page Audit
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {auditMetrics.map((m) => (
                    <li
                      key={m.label}
                      className="flex items-center justify-between rounded-[10px] px-3 py-3"
                      style={{ background: m.bg, border: `1px solid ${m.border}` }}
                    >
                      <span className="text-[13px]" style={{ color: m.color }}>
                        {m.label}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-[var(--text)] tabular-nums text-[13px]">
                        {m.value.toLocaleString()}
                        {m.pct !== null && (
                          <span className="text-[11px] font-normal text-[var(--muted)]">
                            ({m.pct}%)
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          );
        })()}

        {/* Row 3 */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Performance (SEO Metrics)</h2>

        {/* Google connection (GA4 + Search Console) */}
        <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                <KeyRound size={16} />
              </span>
              <div>
                <div className="text-[13px] font-semibold text-[var(--text)]">
                  Google connection
                </div>
                <div className="text-[12px] text-[var(--muted)]">
                  {googleStatus.loading ? (
                    "Checking status…"
                  ) : googleStatus.connected ? (
                    <>
                      Connected as{" "}
                      <span className="font-semibold text-[var(--text)]">
                        {googleStatus.email || "your Google account"}
                      </span>
                      {googleStatus.hasRefreshToken ? (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--input)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                          <Check size={13} /> refresh token saved
                        </span>
                      ) : (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--input)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                          <AlertTriangle size={13} /> no refresh token
                        </span>
                      )}
                    </>
                  ) : (
                    "Not connected"
                  )}
                </div>

                {(googleStatus.error || ga4Error || gscError) ? (
                  <div className="mt-1 text-[12px] text-red-400">
                    {googleStatus.error || ga4Error || gscError}
                  </div>
                ) : null}
              

                <div className="mt-1 text-[11px] text-[var(--muted)]">
                  GA4 &amp; Search Console data is available only for sites you own or have access to.
                </div></div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              {!googleStatus.connected ? (
                <button
                  onClick={connectGoogle}
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--text)] px-4 py-2 text-[12px] font-semibold text-[var(--bg)] transition hover:opacity-90"
                >
                  <ShieldCheck size={16} />
                  Connect Google
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      refreshGoogleStatus();
                      loadGa4Properties();
                      loadGscSites();
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[12px] font-semibold text-[var(--text)] transition hover:bg-[var(--hover)]"
                    title="Refresh connection + lists"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>

                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] text-[var(--muted)]">GA4 property</div>
                    <select
                      value={ga4PropertyId}
                      onChange={(e) => selectGa4Property(e.target.value)}
                      className="h-9 min-w-[240px] rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 text-[12px] text-[var(--text)] outline-none"
                      disabled={ga4Loading || !ga4Properties.length}
                    >
                      {!ga4Properties.length ? (
                        <option value="">No GA4 properties found</option>
                      ) : (
                        <>
                          <option value="">Select…</option>
                          {ga4Properties.map((p) => (
                            <option key={p.propertyId} value={p.propertyId}>
                              {p.displayName ? `${p.displayName} (${p.propertyId})` : p.propertyId}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] text-[var(--muted)]">Search Console site</div>
                    <select
                      value={gscSiteUrl}
                      onChange={(e) => selectGscSite(e.target.value)}
                      className="h-9 min-w-[240px] rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 text-[12px] text-[var(--text)] outline-none"
                      disabled={gscLoading || !gscSites.length}
                    >
                      {!gscSites.length ? (
                        <option value="">No sites found</option>
                      ) : (
                        <>
                          <option value="">Select…</option>
                          {gscSites.map((s) => {
                            const url = typeof s === "string" ? s : s?.siteUrl;
                            const label = typeof s === "string" ? s : (s?.siteUrl || "");
                            if (!url) return null;
                            return (
                              <option key={url} value={url}>
                                {label}
                              </option>
                            );
                          })}
                        </>
                      )}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick debug bubble (optional) */}
          {false ? (
            <div className="mt-3 rounded-[12px] border border-[var(--border)] bg-[var(--input)] p-3 text-[12px] text-[var(--muted)]">
              <div className="mb-1 font-semibold text-[var(--text)]">Debug</div>
              {ga4Metrics?.debug ? (
                <div className="mb-1">
                  <span className="font-semibold text-[var(--text)]">GA4:</span>{" "}
                  {ga4Metrics.debug.note || JSON.stringify(ga4Metrics.debug)}
                </div>
              ) : null}
              {gscMetrics?.debug ? (
                <div>
                  <span className="font-semibold text-[var(--text)]">GSC:</span>{" "}
                  {gscMetrics.debug.note || JSON.stringify(gscMetrics.debug)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>


{analyticsNotice ? (
  <div
    className="mb-4 flex flex-col gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--input)] p-4 md:flex-row md:items-center md:justify-between"
    role="status"
    aria-live="polite"
  >
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[var(--border)] bg-[#FFF5D9] text-[#B98500]">
        <AlertTriangle size={16} />
      </span>
      <div>
        <div className="text-[13px] font-semibold text-[var(--text)]">
          {analyticsNotice.title}
        </div>
        <div className="text-[12px] text-[var(--muted)]">
          {analyticsNotice.message}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2">
      {!googleStatus.connected ? (
        <button
          onClick={connectGoogle}
          className="inline-flex h-9 items-center gap-2 rounded-[12px] px-3 text-[12px] font-semibold text-white shadow-sm bg-[image:var(--infoHighlight-gradient)] hover:opacity-90 transition"
        >
          <KeyRound size={14} />
          Connect
        </button>
      ) : (
        <button
          onClick={() => {
            // re-run status + re-fetch metrics
            refreshGoogleStatus();
            fetchGa4Report();
            fetchGscKeywords();
          }}
          className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 text-[12px] font-semibold text-[var(--text)] hover:bg-[#F6F8FB]"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      )}
    </div>
  </div>
) : null}

<section className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Organic Traffic */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--input)] text-[var(--muted)]">
                  <BarChart3 size={16} />
                </span>
                <span className="flex items-center gap-1 text-[13px] text-gray-700 leading-relaxed">Organic traffic</span>
                {(basePerf?.organicTraffic?.growth ?? null) != null && basePerf.organicTraffic.growth > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#EAF8F1] px-2 py-0.5 text-[11px] font-medium text-[#178A5D]">
                    <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                    Positive Growth
                  </span>
                )}
              </div>
              <div className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
                All Devices <ChevronRight size={14} className="-rotate-90" />
              </div>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {otValue != null ? formatCompactNumber(otValue) : "—"}
              </div>

              {typeof googlePerf.ga4TrafficMonthly === "number" ? (
                <SourcePill
                  value={formatCompactNumber(googlePerf.ga4TrafficMonthly)}
                  source="GA4"
                />
              ) : null}

              {basePerf?.organicTraffic?.growth != null && (
                <div className="ml-1 inline-flex items-center gap-1 rounded-full bg-[#EAF8F1] px-2 py-0.5 text-[11px] font-medium text-[#178A5D]">
                  ↗︎ +{basePerf.organicTraffic.growth}
                </div>
              )}
            </div>

            {/* Simple animated line/area (kept) */}
            <div className="mt-4 h-28 w-full rounded-[10px]">
              <svg viewBox="0 0 520 140" className="h-full w-full">
                <defs>
                  <linearGradient id="ot-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C55E" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
                  </linearGradient>
                  <mask id="ot-reveal" maskUnits="objectBoundingBox">
                    <rect x="0" y="0" width={`${otProg * 100}%`} height="100%" fill="#fff" />
                  </mask>
                </defs>
                <g mask="url(#ot-reveal)">
                  <path d="M 8 120 C 60 60, 110 85, 150 95 S 240 110, 270 88 S 350 60, 385 92 S 455 60, 512 20 L 512 140 L 8 140 Z" fill="url(#ot-fill)"/>
                  <path d="M 8 120 C 60 60, 110 85, 150 95 S 240 110, 270 88 S 350 60, 385 92 S 455 60, 512 20" fill="none" stroke="#22C55E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - otProg * 100} />
                </g>
                <g fontFamily="ui-sans-serif, system-ui" fontSize="10" fill="#8D96A8" textAnchor="start">
                  {basePerf?.organicTraffic?.growth != null && (
                    <text x="500" y="18">+{basePerf.organicTraffic.growth}</text>
                  )}
                </g>
              </svg>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  // Always open Google OAuth (lets user reconnect / switch accounts)
                  return connectGoogle();
                }}
                className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] hover:opacity-90"
              >
                {!googleStatus.connected ? "Connect to Google Analytics" : "Manage Google connection"} <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Organic Keywords */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#FDE7B8] bg-[#FFF5D9] text-[#B98500]">
                  <KeyRound size={16} />
                </span>
                <span className="flex items-center gap-1 text-[13px] text-gray-700 leading-relaxed">Organic Keywords</span>
              </div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)]">
                <SquareArrowOutUpRight size={16} />
              </span>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                {okValue != null ? formatCompactNumber(okValue) : "—"}
              </div>

              {typeof googlePerf.gscKeywordsTotal === "number" ? (
                <SourcePill
                  value={formatCompactNumber(googlePerf.gscKeywordsTotal)}
                  source="GSC"
                />
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {[
                { label: "Top-3",   v: OK_SPLIT.top3,  t: OK_SPLIT.total, c: "#638CF1" },
                { label: "Top-10",  v: OK_SPLIT.top10, t: OK_SPLIT.total, c: "#F4B740" },
                { label: "Top-100", v: OK_SPLIT.top100,t: OK_SPLIT.total, c: "#22C55E" },
              ].map((row) => {
                const pct = row.v && row.t ? Math.round((row.v / row.t) * 100) : 0;
                return (
                  <div key={row.label} className="grid grid-cols-[88px_auto_1fr] items-center  gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 rounded-tr-2xl">
                    <span className="inline-flex items-center justify-center rounded-md bg-[var(--input)] px-2 py-1 text-[12px] text-[var(--muted)]">{row.label}</span>
                    <span className="text-[12px] font-semibold text-[var(--text)] tabular-nums">
                      {row.v ? formatCompactNumber(row.v) : "—"}
                    </span>
                    <div className="h-2 w-full rounded-full bg-[var(--border)]">
                      <div className="h-2 rounded-full" style={{ width: `${pct * okProg}%`, backgroundColor: row.c, transition: "none" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  // Always open Google OAuth (lets user reconnect / switch accounts)
                  return connectGoogle();
                }}
                className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] hover:opacity-90"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--input)]">
                  <FileText size={12} className="text-[#3178C6]" />
                </span>
                {!googleStatus.connected ? (
                  <>
                    Connect to <span className="font-semibold text-[var(--text)]">Google Search Console</span>
                  </>
                ) : (
                  <>
                    Manage <span className="font-semibold text-[var(--text)]">Search Console</span>
                  </>
                )}
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Leads */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#FFD8C7] bg-[#FFEFE8] text-[#D14B1F]">
                  <Goal size={16} />
                </span>
                <span className="flex items-center gap-1 text-[13px] text-gray-700 leading-relaxed">
                  Leads
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(() => {
                  const g = basePerf?.leads?.growth;
                  const isNum = typeof g === "number" && !Number.isNaN(g);
                  const up = isNum ? g >= 0 : true;
                  const sign = isNum ? (up ? "+" : "−") : "+";
                  const pct = isNum ? Math.abs(g).toFixed(1) : "0.0";
                  const badgeClasses = up
                    ? "border border-[var(--border)] bg-[#EAF8F1] text-[#178A5D]"
                    : "border border-[var(--border)] bg-[#FFF6F6] text-[#D12C2C]";
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClasses}`}
                    >
                      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {sign} {pct} %
                    </span>
                  );
                })()}

                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)]">
                  <Settings size={14} />
                </span>
              </div>
            </div>

            {(() => {
              const formatNumber = formatCompactNumber;

              // leadsCount is null when no real data — show "—" instead of 0
              const totalLeadsAnimated = leadsCount != null ? Math.max(0, Math.round(leadsCount)) : null;
              const goalLeads = LEADS_GOAL ?? null;
              const cfLeads   = CF_VALUE ?? null;
              const nlLeads   = NL_VALUE ?? null;

              const cfPct = (LEADS_TARGET && cfLeads != null) ? Math.min(100, (cfLeads / LEADS_TARGET) * 100) : 0;
              const nlPct = (LEADS_TARGET && nlLeads != null) ? Math.min(100, (nlLeads / LEADS_TARGET) * 100) : 0;
              const goalPct = (goalLeads && totalLeadsAnimated != null) ? Math.min(100, (totalLeadsAnimated / goalLeads) * 100) : 0;

              return (
                <>
                  {/* Total Leads (animated) */}
                  <div className="mt-3 flex items-end gap-2">
                    <div className="text-[32px] font-semibold leading-none text-[var(--text)] tabular-nums">
                      {totalLeadsAnimated != null ? formatNumber(totalLeadsAnimated) : "—"}
                    </div>

                    {typeof googlePerf.ga4LeadsMonthly === "number" ? (
                      <SourcePill
                        value={formatCompactNumber(googlePerf.ga4LeadsMonthly)}
                        source="GA4"
                      />
                    ) : null}
                  </div>

                  {/* Goals */}
                  <div className="mt-2 flex items-center justify-between text-[12px]">
                    <span className="text-[var(--muted)]">
                      Goals{" "}
                      <span className="font-medium text-[var(--text)] tabular-nums">
                        {totalLeadsAnimated != null ? formatNumber(totalLeadsAnimated) : "—"} / {goalLeads != null ? formatNumber(goalLeads) : "—"}
                      </span>
                    </span>
                    {(goalLeads && totalLeadsAnimated != null) ? (
                      <span className="text-[var(--muted)]">
                        {Math.max(0, 100 - Math.round((totalLeadsAnimated / goalLeads) * 100))}% Remaining
                      </span>
                    ) : null}
                  </div>

                  {/* Progress bar (animated via leadsProg + changing width) */}
                  <div className="mt-2 h-2 w-full rounded-full bg-[var(--border)]">
                    {(goalLeads && totalLeadsAnimated != null) ? (
                      <div
                        className="h-2 rounded-full bg-[#22C55E]"
                        style={{
                          width: `${goalPct}%`,
                          transition: "none",
                        }}
                      />
                    ) : null}
                  </div>

                  {/* Breakdown */}
                  <ul className="mt-4 space-y-3 text-[13px]">
                    {/* Contact Form */}
                    <li className="grid grid-cols-[1fr_auto_160px] items-center gap-3">
                      <span className="flex items-center gap-2 text-[var(--muted)]">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#FAD7A5] bg-[#FFF6E7]">
                          <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                        </span>
                        Contact form
                      </span>
                      <span className="font-semibold text-[var(--text)] tabular-nums">
                        {cfLeads != null ? formatNumber(cfLeads) : "—"}
                      </span>
                      <div className="h-2 w-full rounded-full bg-[var(--border)]">
                        {(LEADS_TARGET && cfLeads != null) ? (
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${cfPct * (leadsProg || 1)}%`,
                              backgroundColor: "#F59E0B",
                              transition: "none",
                            }}
                          />
                        ) : null}
                      </div>
                    </li>

                    {/* Newsletter */}
                    <li className="grid grid-cols-[1fr_auto_160px] items-center gap-3">
                      <span className="flex items-center gap-2 text-[var(--muted)]">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--input)]">
                          <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                        </span>
                        Newsletter
                      </span>
                      <span className="font-semibold text-[var(--text)] tabular-nums">
                        {nlLeads != null ? formatNumber(nlLeads) : "—"}
                      </span>
                      <div className="h-2 w-full rounded-full bg-[var(--border)]">
                        {(LEADS_TARGET && nlLeads != null) ? (
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${nlPct * (leadsProg || 1)}%`,
                              backgroundColor: "#3B82F6",
                              transition: "none",
                            }}
                          />
                        ) : null}
                      </div>
                    </li>
                  </ul>
                </>
              );
            })()}

            <div className="mt-3 text-right text-[12px] text-[var(--muted)]">
              <button type="button" className="inline-flex items-center gap-1">
                Change Goals <ChevronRight size={14} />
              </button>
            </div>
          </div>
          </section>

        {/* DataForSEO Insights Section */}
        {(() => {
          const dro = seo?.domainRankOverview || null;
          const competitors = Array.isArray(seo?.competitorDomains) ? seo.competitorDomains.slice(0, 8) : [];
          const rankedKws = Array.isArray(seo?.rankedKeywords) ? seo.rankedKeywords.slice(0, 10) : [];

          if (!dro && !competitors.length && !rankedKws.length) return null;

          return (
            <>
              <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">
                DataForSEO Insights
              </h2>

              {/* Row: Domain Overview + Competitor Landscape */}
              <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">

                {/* Domain Rank Overview */}
                {dro && (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#EAF4FF] bg-[#EAF4FF] text-[#3B82F6]">
                        <TrendingUp size={16} />
                      </span>
                      <span className="text-[13px] font-semibold text-gray-700">Domain Rank Overview</span>
                      <span className="ml-auto text-[11px] text-[var(--muted)]">DataForSEO Labs</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                        <div className="text-[11px] text-[var(--muted)]">Organic Keywords</div>
                        <div className="mt-1 text-[26px] font-bold leading-none text-[var(--text)] tabular-nums">
                          {(dro.organicKeywords || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                        <div className="text-[11px] text-[var(--muted)]">Organic Traffic (ETV)</div>
                        <div className="mt-1 text-[26px] font-bold leading-none text-[var(--text)] tabular-nums">
                          {formatCompactNumber(dro.organicTraffic || 0)}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                        <div className="text-[11px] text-[var(--muted)]">Paid Keywords</div>
                        <div className="mt-1 text-[26px] font-bold leading-none text-[var(--text)] tabular-nums">
                          {(dro.paidKeywords || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-4 py-3">
                        <div className="text-[11px] text-[var(--muted)]">Domain Rank</div>
                        <div className="mt-1 text-[26px] font-bold leading-none text-[var(--text)] tabular-nums">
                          {dro.rank ? `#${dro.rank.toLocaleString()}` : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Competitor Landscape */}
                {competitors.length > 0 && (
                  <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#FFF5D9] bg-[#FFF5D9] text-[#B98500]">
                        <Network size={16} />
                      </span>
                      <span className="text-[13px] font-semibold text-gray-700">Search Competitor Landscape</span>
                      <span className="ml-auto text-[11px] text-[var(--muted)]">DataForSEO</span>
                    </div>
                    <div className="space-y-2 max-h-[260px] overflow-y-auto">
                      {competitors.map((comp, i) => (
                        <div key={comp.domain} className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--input)] text-[11px] font-bold text-[var(--muted)]">
                              {i + 1}
                            </span>
                            <span className="truncate text-[13px] font-medium text-[var(--text)]">
                              {comp.domain}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <div className="text-right">
                              <div className="text-[10px] text-[var(--muted)]">Kws</div>
                              <div className="text-[12px] font-semibold text-[var(--text)] tabular-nums">
                                {formatCompactNumber(comp.organicKeywords || 0)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-[var(--muted)]">Traffic</div>
                              <div className="text-[12px] font-semibold text-[var(--text)] tabular-nums">
                                {formatCompactNumber(comp.organicTraffic || 0)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Ranked Keywords Table */}
              {rankedKws.length > 0 && (
                <section className="mb-6 rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#EAF8F1] bg-[#EAF8F1] text-[#178A5D]">
                      <KeyRound size={16} />
                    </span>
                    <span className="text-[13px] font-semibold text-gray-700">Ranked Keywords (DataForSEO)</span>
                    <span className="ml-auto text-[11px] text-[var(--muted)]">Live positions</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[11px] text-[var(--muted)]">
                          <th className="pb-2 text-left font-medium">Keyword</th>
                          <th className="pb-2 text-center font-medium">Position</th>
                          <th className="pb-2 text-right font-medium">Volume</th>
                          <th className="pb-2 text-right font-medium">Traffic</th>
                          <th className="pb-2 text-right font-medium">CPC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {rankedKws.map((kw, i) => {
                          const pos = typeof kw.position === "number" ? kw.position : null;
                          const posColor = pos !== null ? (pos <= 3 ? "#178A5D" : pos <= 10 ? "#B98500" : "#8D96A8") : "#8D96A8";
                          const posBg = pos !== null ? (pos <= 3 ? "#EAF8F1" : pos <= 10 ? "#FFF5D9" : "transparent") : "transparent";
                          return (
                            <tr key={i} className="hover:bg-[var(--hover)]">
                              <td className="py-2 pr-3 font-medium text-[var(--text)]">{kw.keyword}</td>
                              <td className="py-2 text-center">
                                <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full px-2 text-[12px] font-bold"
                                  style={{ color: posColor, background: posBg }}>
                                  {pos !== null ? pos : "—"}
                                </span>
                              </td>
                              <td className="py-2 text-right text-[var(--muted)]">{formatCompactNumber(kw.searchVolume || 0)}</td>
                              <td className="py-2 text-right text-[var(--muted)]">{formatCompactNumber(kw.traffic || 0)}</td>
                              <td className="py-2 text-right text-[var(--muted)]">${typeof kw.cpc === "number" ? kw.cpc.toFixed(2) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          );
        })()}

        {/* Row 4 */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Advance SEO metrics</h2>

        <section className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* SERP feature */}
          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#FDE7B8] bg-[#FFF5D9] text-[#B98500]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3l2.2 5.1 5.6.5-4.2 3.7 1.3 5.5L12 14.9 7.1 17.8l1.3-5.5-4.2-3.7 5.6-.5L12 3z" fill="#F4B740"/>
                  </svg>
                </span>
                <span className="text-[13px] text-gray-700 leading-relaxed">SERP feature</span>
              </div>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)]">
                <SlidersHorizontal size={16} />
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <div className="text-[40px] font-bold leading-none tracking-tight text-[var(--text)] tabular-nums">
                {serpCoverage != null
                  ? <>{Math.round(serpCoverage)}<span className="align-top text-[28px]">%</span></>
                  : "—"}
              </div>
              <div className="text-[14px] text-[var(--muted)]">coverage</div>
              {!serpHasRealData && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#FFF5D9] border border-[#FDE7B8] px-2 py-0.5 text-[11px] text-[#B98500]">
                  Requires DataForSEO SERP API
                </span>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {[
                { label: "Featured Snippet",  val: serpCounts[0], bgC: "#FFF5D9", bdC: "#FDE7B8", fill: "#F4B740" },
                { label: "People Also Ask",   val: serpCounts[1], bgC: "#EAF4FF", bdC: "var(--border)", fill: "#3B82F6" },
                { label: "Image Pack",        val: serpCounts[2], bgC: "#EAF8F1", bdC: "var(--border)", fill: "#22C55E" },
                { label: "Video Result",      val: serpCounts[3], bgC: "#FFF0F4", bdC: "#FFE1EA",       fill: "#D12C2C" },
                { label: "Knowledge Panel",   val: serpCounts[4], bgC: "#F5EAFE", bdC: "#E7D7FB",       fill: "#8B5CF6" },
              ].map(({ label, val, bgC, bdC, fill }) => (
                <div key={label} className="flex items-center justify-between rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md"
                      style={{ background: bgC, border: `1px solid ${bdC}` }}>
                      <svg width="12" height="12" viewBox="0 0 24 24">
                        <path d="M12 3l2.2 5.1 5.6.5-4.2 3.7 1.3 5.5L12 14.9 7.1 17.8l1.3-5.5-4.2-3.7 5.6-.5L12 3z" fill={fill}/>
                      </svg>
                    </span>
                    <span className="text-[13px] text-[var(--text)]">{label}</span>
                  </div>
                  <span className="text-[13px] font-semibold text-[var(--text)] tabular-nums">
                    {val != null ? val : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Ai SEO Matrix (dynamic from JSON) */}
{/* Ai SEO Matrix (dynamic from JSON) */}
<div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
  <div className="flex items-start justify-between">
    <div className="flex items-center gap-2">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#FDE7B8] bg-[#FFF5D9] text-[#B98500]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l2.2 5.1 5.6.5-4.2 3.7 1.3 5.5L12 14.9 7.1 17.8l1.3-5.5-4.2-3.7 5.6-.5L12 3z" fill="#F4B740"/>
        </svg>
      </span>
      <span className="text-[13px] text-gray-700 leading-relaxed">Ai SEO Matrix</span>
    </div>
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)]">
      <SlidersHorizontal size={16} />
    </span>
  </div>

  {(() => {
    const ai = selected?.aiTools || {};
    const fmt = (num) => {
      const v = Number(num);
      if (!Number.isFinite(v)) return "—";
      return formatCompactNumber(v);
    };

    const tools = [
      { name: "GPT",        rating: ai.GPT?.rating,        pages: ai.GPT?.pages,        src: ai.GPT?.src },
      { name: "Google AI",  rating: ai.GoogleAI?.rating,   pages: ai.GoogleAI?.pages,   src: ai.GoogleAI?.src },
      { name: "Perplexity", rating: ai.Perplexity?.rating, pages: ai.Perplexity?.pages, src: ai.Perplexity?.src },
      { name: "Copilot",    rating: ai.Copilot?.rating,    pages: ai.Copilot?.pages,    src: ai.Copilot?.src },
      { name: "Gemini",     rating: ai.Gemini?.rating,     pages: ai.Gemini?.pages,     src: ai.Gemini?.src },
    ];

    return (
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-5">
        {tools.map((tool) => (
          <div key={tool.name} className="rounded-[12px] border border-[var(--border)] bg-[var(--input)] p-4 text-center">
            <Image src={tool.src || "/assets/placeholder.svg"} alt={tool.name} width={36} height={36} className="mx-auto mb-2" />
            <div className="text-[12px] text-[var(--muted)]">{tool.name}</div>
            <div className="mt-1 text-[22px] font-semibold leading-none text-[var(--text)] tabular-nums">
              {Number.isFinite(tool.rating) ? tool.rating : "—"}
              <span className="text-[var(--muted)]">/5</span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">{fmt(tool.pages)} Pages</div>
          </div>
        ))}
      </div>
    );
  })()}

  <div className="mt-4 text-[12px] text-[var(--muted)]">
    AI tool visibility and optimization scores
  </div>
</div>
</section>

        {/* Keyword Tier Analysis Section */}
        {(() => {
          const rankedKws = Array.isArray(seo?.rankedKeywords) ? seo.rankedKeywords : [];
          if (!rankedKws.length) return null;

          const commercialHints = ["buy", "price", "deal", "coupon", "discount", "best ", "top ", " vs ", "compare", "near me", "service", "hire", "cost"];
          const localHints = ["near", "in ", "local", "city", "location", "area", "nearby"];

          const tier1 = rankedKws.filter(kw => commercialHints.some(h => kw.keyword.toLowerCase().includes(h)));
          const tier2 = rankedKws.filter(kw => !commercialHints.some(h => kw.keyword.toLowerCase().includes(h)) && localHints.some(h => kw.keyword.toLowerCase().includes(h)));
          const tier3 = rankedKws.filter(kw => !commercialHints.some(h => kw.keyword.toLowerCase().includes(h)) && !localHints.some(h => kw.keyword.toLowerCase().includes(h)));

          const tierData = [
            { label: "Tier 1 — Commercial", desc: "High-intent, buying keywords", items: tier1.slice(0, 5), color: "#D12C2C", bg: "#FFF0F4", border: "#FFE1EA" },
            { label: "Tier 2 — Local / Geo", desc: "Location-specific keywords", items: tier2.slice(0, 5), color: "#B98500", bg: "#FFF5D9", border: "#FDE7B8" },
            { label: "Tier 3 — Informational", desc: "Top-of-funnel content keywords", items: tier3.slice(0, 5), color: "#178A5D", bg: "#EAF8F1", border: "#CBEBD9" },
          ];

          return (
            <>
              <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Keyword Strategy — Tier Breakdown</h2>
              <section className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
                {tierData.map(tier => (
                  <div key={tier.label} className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <div className="text-[13px] font-semibold" style={{ color: tier.color }}>{tier.label}</div>
                        <div className="text-[11px] text-[var(--muted)]">{tier.desc}</div>
                      </div>
                      <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[12px] font-bold"
                        style={{ background: tier.bg, border: `1px solid ${tier.border}`, color: tier.color }}>
                        {tier.items.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {tier.items.length > 0 ? tier.items.map((kw, i) => (
                        <div key={i} className="flex items-center justify-between rounded-[10px] px-3 py-2"
                          style={{ background: tier.bg, border: `1px solid ${tier.border}` }}>
                          <span className="truncate text-[12px]" style={{ color: tier.color }}>{kw.keyword}</span>
                          <span className="ml-2 shrink-0 text-[11px] text-[var(--muted)]">
                            {kw.searchVolume ? formatCompactNumber(kw.searchVolume) : "—"}
                          </span>
                        </div>
                      )) : (
                        <div className="text-center py-4 text-[12px] text-[var(--muted)]">
                          No keywords in this tier yet
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            </>
          );
        })()}

        {/* On-Page SEO Opportunities — cards */}
        <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">On-Page SEO Opportunities</h2>
        {/* On-Page SEO Opportunities — cards */}
        

        <section className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Critical Issue */}
          <div className="flex items-center justify-between rounded-[18px] border border-[#E7EAF0] bg-[var(--input)] px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex shrink-0 aspect-square h-10 w-10 items-center justify-center rounded-full bg-[#EF3E5C] text-white">
                <Skull size={20} />
              </span>
              <div className="leading-tight">
                <div className="text-[11px] text-[var(--muted)]">Critical Issue</div>
                <div className="mt-0.5 text-[20px] font-extrabold leading-none text-[var(--text)] tabular-nums">
                  {oppCounts[0]}
                </div>
                {typeof selected?.issuesGrowth?.critical === "number" && (
                  <div className="mt-1 text-[11px] font-medium text-[#DC2626] whitespace-nowrap">
                    {selected.issuesGrowth.critical > 0
                      ? `${selected.issuesGrowth.critical}% more since last month`
                      : `${Math.abs(selected.issuesGrowth.critical)}% less since last month`}
                  </div>
                )}
              </div>
            </div>
            <button className="ml-4 inline-flex items-center gap-1 text-[11px] font-medium text-[#8D96A8] shrink-0 whitespace-nowrap">
              Fix Now <ChevronRight size={12} />
            </button>
          </div>

          {/* Card 2: Waring Issue */}
          <div className="flex items-center justify-between rounded-[18px] border border-[#E7EAF0] bg-[var(--input)] px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex shrink-0 aspect-square h-10 w-10 items-center justify-center rounded-full bg-[#F59E0B] text-white">
                <AlertTriangle size={20} />
              </span>
              <div className="leading-tight">
                <div className="text-[11px] text-[var(--muted)]">Waring Issue</div>
                <div className="mt-0.5 text-[20px] font-extrabold leading-none text-[var(--text)] tabular-nums">
                  {oppCounts[1]}
                </div>
                {typeof selected?.issuesGrowth?.critical === "number" && (
                  <div className="mt-1 text-[11px] font-medium text-[#DC2626] whitespace-nowrap">
                    {selected.issuesGrowth.critical > 0
                      ? `${selected.issuesGrowth.critical}% more since last month`
                      : `${Math.abs(selected.issuesGrowth.critical)}% less since last month`}
                  </div>
                )}
              </div>
            </div>
            <button className="ml-4 inline-flex items-center gap-1 text-[11px] font-medium text-[#8D96A8] shrink-0 whitespace-nowrap">
              Fix Now <ChevronRight size={12} />
            </button>
          </div>

          {/* Card 3: Recommendations */}
          <div className="flex items-center justify-between rounded-[18px] border border-[#E7EAF0] bg-[var(--input)] px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#10B981] text-white">
                <Lightbulb size={20} />
              </span>
              <div className="leading-tight">
                <div className="text-[11px] text-[var(--muted)]">Recommendations</div>
                <div className="mt-0.5 text-[20px] font-extrabold leading-none text-[var(--text)] tabular-nums">
                  {oppCounts[2]}
                </div>
                {typeof selected?.issuesGrowth?.recommendations === "number" && (
                  <div className="mt-1 text-[11px] font-medium text-[#16A34A] whitespace-nowrap">
                    {selected.issuesGrowth.recommendations > 0
                      ? `${selected.issuesGrowth.recommendations}% more since last month`
                      : `${Math.abs(selected.issuesGrowth.recommendations)}% less since last month`}
                  </div>
                )}
              </div>
            </div>
            <button className="ml-4 inline-flex items-center gap-1 text-[11px] font-medium text-[#8D96A8] shrink-0 whitespace-nowrap">
              View All <ChevronRight size={12} />
            </button>
          </div>

          {/* Card 4: Content Opportunities */}
          <div className="flex items-center justify-between rounded-[18px] border border-[#E7EAF0] bg-[var(--input)] px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#3B82F6] text-white">
                <FileText size={18} />
              </span>
              <div className="leading-tight">
                <div className="text-[11px] text-[var(--muted)]">Content Opportunities</div>
                <div className="mt-0.5 text-[20px] font-extrabold leading-none text-[var(--text)] tabular-nums">
                  {oppCounts[3]}
                </div>
                {typeof selected?.issuesGrowth?.contentOpps === "number" && (
                  <div className="mt-1 text-[11px] font-medium text-[#DC2626] whitespace-nowrap">
                    {selected.issuesGrowth.contentOpps > 0
                      ? `${selected.issuesGrowth.contentOpps}% more since last month`
                      : `${Math.abs(selected.issuesGrowth.contentOpps)}% less since last month`}
                  </div>
                )}
              </div>
            </div>
            <button className="ml-4 inline-flex items-center gap-1 text-[11px] font-medium text-[#8D96A8] shrink-0 whitespace-nowrap">
              View All <ChevronRight size={12} />
            </button>
          </div>
        </section>

        <OpportunitiesSection onOpenContentEditor={onOpenContentEditor} />

{/* New on page SEO opportunity (table) */}
<NewOnPageSEOTable rows={seoRowsForTable} progress={seoTableProg} />

{/* ─────────────────────────────────────────────────────────────────────
    SEO STRATEGY BLUEPRINT — Comprehensive Metrics from Reference PDF
    ───────────────────────────────────────────────────────────────────── */}

{/* BASELINE SUMMARY TABLE */}
{seo && (
  <section className="mt-8 mb-6">
    <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">
      SEO Baseline — Full Snapshot
    </h2>
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#EAF4FF] bg-[#EAF4FF] text-[#3B82F6]">
          <BarChart3 size={16} />
        </span>
        <span className="text-[13px] font-semibold text-gray-700">Baseline Metrics</span>
        <span className="ml-auto text-[11px] text-[var(--muted)]">{selected?.domain || domain}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {(() => {
          const droKws = seo?.domainRankOverview?.organicKeywords;
          const droTraffic = seo?.domainRankOverview?.organicTraffic;
          const fallbackKws = basePerf?.organicKeywords?.total;
          const fallbackTraffic = basePerf?.organicTraffic?.monthly;
          const audit = seo?.onPageAudit || onPageAudit;
          return [
          { label: "Domain Rating", value: selected?.domainRating != null ? `${Math.round(selected.domainRating)}/100` : "—", sub: "Authority Score", color: "#3B82F6", bg: "#EAF4FF" },
          { label: "Organic Keywords", value: droKws ? formatCompactNumber(droKws) : (fallbackKws ? formatCompactNumber(fallbackKws) : "—"), sub: droKws ? "Ranking kws (Live)" : "Ranking kws (Est.)", color: "#178A5D", bg: "#EAF8F1" },
          { label: "Organic Traffic", value: droTraffic ? formatCompactNumber(droTraffic) : (fallbackTraffic ? formatCompactNumber(fallbackTraffic) : "—"), sub: droTraffic ? "Est. Monthly (Live)" : "Est. Monthly", color: "#8B5CF6", bg: "#F5EAFE" },
          { label: "Referring Domains", value: selected?.referringDomains ? formatCompactNumber(selected.referringDomains) : "—", sub: "Backlink Sources", color: "#B98500", bg: "#FFF5D9" },
          { label: "404 Errors", value: audit?.pages_404 != null ? String(audit.pages_404) : "—", sub: "Broken Pages", color: audit?.pages_404 > 0 ? "#D12C2C" : "#178A5D", bg: audit?.pages_404 > 0 ? "#FFF0F4" : "#EAF8F1" },
          { label: "Redirect Chains", value: audit?.redirect_chains != null ? String(audit.redirect_chains) : "—", sub: "Chain Issues", color: audit?.redirect_chains > 0 ? "#B67200" : "#178A5D", bg: audit?.redirect_chains > 0 ? "#FFF5D9" : "#EAF8F1" },
        ]})().map(m => (
          <div key={m.label} className="rounded-[12px] px-3 py-3 text-center" style={{ background: m.bg }}>
            <div className="text-[11px] text-[var(--muted)] mb-1">{m.label}</div>
            <div className="text-[22px] font-bold leading-none tabular-nums" style={{ color: m.color }}>{m.value}</div>
            <div className="mt-1 text-[10px] text-[var(--muted)]">{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
)}

{/* TECHNICAL FOUNDATION — Priority Issues Table */}
{(seo?.onPageAudit || onPageAudit) && (() => {
  const audit = seo?.onPageAudit || onPageAudit;
  const issues = [
    { priority: "CRITICAL", label: "Missing Title Tags", value: audit.missing_title, impact: "Direct ranking signal", fix: "Add unique <title> to every page" },
    { priority: "CRITICAL", label: "Missing H1 Tags", value: audit.missing_h1, impact: "Primary keyword signal", fix: "Add exactly one H1 per page" },
    { priority: "HIGH", label: "404 Broken Pages", value: audit.pages_404, impact: "User experience + crawl budget", fix: "Redirect or restore broken URLs" },
    { priority: "HIGH", label: "Missing Meta Descriptions", value: audit.missing_description, impact: "CTR in search results", fix: "Write unique meta descriptions" },
    { priority: "HIGH", label: "Broken Resources", value: audit.broken_resources, impact: "Page load + user trust", fix: "Fix or remove broken CSS/JS/images" },
    { priority: "MEDIUM", label: "Redirect Chains", value: audit.redirect_chains, impact: "PageRank dilution", fix: "Point directly to final URL" },
    { priority: "MEDIUM", label: "Broken Links", value: audit.broken_links, impact: "User experience", fix: "Update or remove broken internal links" },
    { priority: "MEDIUM", label: "Duplicate Content", value: audit.duplicate_content, impact: "Keyword cannibalization", fix: "Canonicalize or consolidate pages" },
  ].filter(i => typeof i.value === "number");

  if (!issues.length) return null;

  const priorityMeta = {
    CRITICAL: { color: "#D12C2C", bg: "#FFF0F4", border: "#FFE1EA" },
    HIGH:     { color: "#B67200", bg: "#FFF5D9", border: "#FDE7B8" },
    MEDIUM:   { color: "#178A5D", bg: "#EAF8F1", border: "#CBEBD9" },
  };

  return (
    <section className="mb-6">
      <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Technical Foundation — Issues Table</h2>
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-[var(--border)]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#FFF0F4] bg-[#FFF0F4] text-[#D12C2C]">
            <AlertTriangle size={16} />
          </span>
          <span className="text-[13px] font-semibold text-gray-700">Priority Issue Breakdown</span>
          <span className="ml-auto text-[11px] text-[var(--muted)]">DataForSEO On-Page Audit</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[#F8FAFC] text-[11px] text-[var(--muted)]">
                <th className="px-4 py-2 text-left font-medium">Priority</th>
                <th className="px-4 py-2 text-left font-medium">Issue</th>
                <th className="px-4 py-2 text-center font-medium">Count</th>
                <th className="px-4 py-2 text-left font-medium hidden md:table-cell">Impact</th>
                <th className="px-4 py-2 text-left font-medium hidden lg:table-cell">Fix Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {issues.map((issue, i) => {
                const pm = priorityMeta[issue.priority];
                return (
                  <tr key={i} className="hover:bg-[var(--hover)]">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: pm.color, background: pm.bg, border: `1px solid ${pm.border}` }}>
                        {issue.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{issue.label}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[14px] font-bold tabular-nums`} style={{ color: issue.value > 0 ? pm.color : "#178A5D" }}>
                        {issue.value.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] hidden md:table-cell">{issue.impact}</td>
                    <td className="px-4 py-3 text-[var(--muted)] hidden lg:table-cell">{issue.fix}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
})()}

{/* AUTHORITY & LINK BUILDING SECTION */}
{seo && (
  <section className="mb-6">
    <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Authority & Link Building</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* DR Progress */}
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
        <div className="text-[12px] font-semibold text-[var(--muted)] mb-3">Domain Rating Progress</div>
        {(() => {
          const currentDR = selected?.domainRating != null ? Math.round(selected.domainRating) : 0;
          const targetDR = Math.min(100, currentDR + 20); // +20 DR in 12 months is a realistic target
          const pct = targetDR > 0 ? Math.round((currentDR / targetDR) * 100) : 0;
          return (
            <>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-[32px] font-bold leading-none text-[#3B82F6] tabular-nums">{currentDR}</span>
                <span className="text-[14px] text-[var(--muted)] pb-1">/ {targetDR} target</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#E5E7EB]">
                <div className="h-2 rounded-full bg-[#3B82F6]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 text-[11px] text-[var(--muted)]">12-month target: DR {targetDR}</div>
            </>
          );
        })()}
      </div>
      {/* Referring Domains */}
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
        <div className="text-[12px] font-semibold text-[var(--muted)] mb-3">Referring Domains</div>
        <div className="text-[32px] font-bold leading-none text-[#178A5D] tabular-nums mb-1">
          {selected?.referringDomains ? formatCompactNumber(selected.referringDomains) : "—"}
        </div>
        <div className="text-[12px] text-[var(--muted)]">Unique sites linking in</div>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--muted)]">High Quality</span>
            <span className="font-semibold" style={{ color: "#178A5D" }}>{selected?.trustBar != null ? `${selected.trustBar}%` : "—"}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--muted)]">Medium Quality</span>
            <span className="font-semibold" style={{ color: "#B98500" }}>{selected?.medQuality != null ? `${selected.medQuality}%` : "—"}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[var(--muted)]">Low Quality</span>
            <span className="font-semibold" style={{ color: "#D12C2C" }}>{selected?.lowQuality != null ? `${selected.lowQuality}%` : "—"}</span>
          </div>
        </div>
      </div>
      {/* Citation Building Plan */}
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
        <div className="text-[12px] font-semibold text-[var(--muted)] mb-3">Citation Building Plan</div>
        <div className="space-y-2">
          {[
            { month: "Month 1–2", action: "NAP audit + fix existing citations", status: "todo" },
            { month: "Month 2–3", action: "Submit to top 20 directories", status: "todo" },
            { month: "Month 3–4", action: "Industry-specific citations", status: "todo" },
            { month: "Month 4+", action: "Ongoing outreach & monitoring", status: "todo" },
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className="mt-0.5 shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--input)] text-[10px] font-bold text-[var(--muted)]">{i + 1}</span>
              <div>
                <div className="font-semibold text-[var(--text)]">{step.month}</div>
                <div className="text-[var(--muted)]">{step.action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
)}

{/* QUICK WINS — 180 Day Plan */}
{seo && (
  <section className="mb-6">
    <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Quick Wins — 180 Day Execution Plan</h2>
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            phase: "Weeks 1–4",
            label: "Foundation",
            color: "#D12C2C", bg: "#FFF0F4", border: "#FFE1EA",
            tasks: [
              "Fix all CRITICAL technical issues",
              "Add missing title tags & H1s",
              "Optimize Google Business Profile",
              "Set up Google Search Console",
            ],
          },
          {
            phase: "Weeks 5–8",
            label: "Content Build",
            color: "#B98500", bg: "#FFF5D9", border: "#FDE7B8",
            tasks: [
              "Publish Tier 1 commercial pages",
              "Create Tier 2 local landing pages",
              "Start blog with informational content",
              "Internal linking structure",
            ],
          },
          {
            phase: "Weeks 9–16",
            label: "Authority",
            color: "#3B82F6", bg: "#EAF4FF", border: "#BFD7FD",
            tasks: [
              "Launch citation building campaign",
              "Outreach to industry directories",
              "Guest posts on relevant sites",
              "Monitor & earn natural backlinks",
            ],
          },
          {
            phase: "Weeks 16+",
            label: "Scale",
            color: "#178A5D", bg: "#EAF8F1", border: "#CBEBD9",
            tasks: [
              "Expand top-performing content",
              "Target competitor keywords",
              "Build topical authority clusters",
              "Track KPIs & iterate",
            ],
          },
        ].map(phase => (
          <div key={phase.phase} className="rounded-[12px] p-3" style={{ background: phase.bg, border: `1px solid ${phase.border}` }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: phase.color }}>{phase.phase}</div>
            <div className="text-[13px] font-bold text-[var(--text)] mb-2">{phase.label}</div>
            <ul className="space-y-1">
              {phase.tasks.map((task, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--muted)]">
                  <span className="mt-0.5 shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: phase.color }} />
                  {task}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </section>
)}

{/* KPI SUCCESS METRICS TABLE */}
{seo && (
  <section className="mb-6">
    <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">Measuring Success — KPI Tracker</h2>
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[#F8FAFC] text-[11px] text-[var(--muted)]">
              <th className="px-4 py-3 text-left font-medium">KPI Metric</th>
              <th className="px-4 py-3 text-center font-medium">Now (Baseline)</th>
              <th className="px-4 py-3 text-center font-medium">6 Months</th>
              <th className="px-4 py-3 text-center font-medium">12 Months</th>
              <th className="px-4 py-3 text-center font-medium hidden md:table-cell">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {(() => {
              const dro = seo?.domainRankOverview || {};
              const currentDR = selected?.domainRating != null ? Math.round(selected.domainRating) : 0;
              // Use DataForSEO Labs data first, fall back to basePerf (random realistic fallback)
              const currentKws = dro.organicKeywords > 0 ? dro.organicKeywords : (basePerf?.organicKeywords?.total || 0);
              const currentTraffic = dro.organicTraffic > 0 ? dro.organicTraffic : (basePerf?.organicTraffic?.monthly || 0);
              const currentRD = typeof selected?.referringDomains === "number" ? selected.referringDomains : 0;
              const psDesktop = selected?.pageSpeed?.desktop || Math.round((seo?.technicalSeo?.performanceScoreDesktop || 0) * 100);
              const audit = seo?.onPageAudit || onPageAudit;

              const rows = [
                { metric: "Domain Rating", now: currentDR > 0 ? `${currentDR}/100` : "—", m6: currentDR > 0 ? `${Math.min(100, currentDR + 8)}/100` : "—", m12: currentDR > 0 ? `${Math.min(100, currentDR + 20)}/100` : "—", priority: "HIGH" },
                { metric: "Organic Keywords", now: currentKws > 0 ? formatCompactNumber(currentKws) : "—", m6: currentKws > 0 ? formatCompactNumber(Math.round(currentKws * 1.5)) : "—", m12: currentKws > 0 ? formatCompactNumber(Math.round(currentKws * 2.5)) : "—", priority: "HIGH" },
                { metric: "Organic Traffic", now: currentTraffic > 0 ? formatCompactNumber(currentTraffic) : "—", m6: currentTraffic > 0 ? formatCompactNumber(Math.round(currentTraffic * 1.8)) : "—", m12: currentTraffic > 0 ? formatCompactNumber(Math.round(currentTraffic * 3)) : "—", priority: "HIGH" },
                { metric: "Referring Domains", now: currentRD > 0 ? formatCompactNumber(currentRD) : "—", m6: currentRD > 0 ? formatCompactNumber(Math.round(currentRD * 1.3)) : "—", m12: currentRD > 0 ? formatCompactNumber(Math.round(currentRD * 1.8)) : "—", priority: "MEDIUM" },
                { metric: "Page Speed Score", now: psDesktop > 0 ? `${psDesktop}/100` : "—", m6: psDesktop > 0 ? `${Math.min(100, psDesktop + 10)}/100` : "—", m12: psDesktop > 0 ? `${Math.min(100, psDesktop + 20)}/100` : "—", priority: "MEDIUM" },
                { metric: "404 Errors", now: audit?.pages_404 != null ? String(audit.pages_404) : "—", m6: "0", m12: "0", priority: "CRITICAL" },
              ];

              return rows.map((row, i) => {
                const pm = { CRITICAL: "#D12C2C", HIGH: "#B98500", MEDIUM: "#178A5D" };
                return (
                  <tr key={i} className="hover:bg-[var(--hover)]">
                    <td className="px-4 py-3 font-medium text-[var(--text)]">{row.metric}</td>
                    <td className="px-4 py-3 text-center font-semibold text-[var(--text)] tabular-nums">{row.now}</td>
                    <td className="px-4 py-3 text-center font-semibold text-[#3B82F6] tabular-nums">{row.m6}</td>
                    <td className="px-4 py-3 text-center font-semibold text-[#178A5D] tabular-nums">{row.m12}</td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: pm[row.priority] || "#8D96A8", background: "#F8FAFC" }}>
                        {row.priority}
                      </span>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  </section>
)}

{/* GEO & AI VISIBILITY SECTION */}
{seo && (
  <section className="mb-6">
    <h2 className="text-[16px] font-bold text-[var(--text)] mb-3 ml-1">GEO & AI Visibility</h2>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* AI Platform Visibility */}
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
        <div className="text-[12px] font-semibold text-[var(--muted)] mb-4">AI Platform Coverage</div>
        <div className="space-y-3">
          {[
            { name: "ChatGPT / GPT-4o", score: selected?.aiTools?.GPT?.rating ?? null, pages: selected?.aiTools?.GPT?.pages ?? null, color: "#10B981" },
            { name: "Google AI Overviews", score: selected?.aiTools?.GoogleAI?.rating ?? null, pages: selected?.aiTools?.GoogleAI?.pages ?? null, color: "#3B82F6" },
            { name: "Perplexity AI", score: selected?.aiTools?.Perplexity?.rating ?? null, pages: selected?.aiTools?.Perplexity?.pages ?? null, color: "#8B5CF6" },
            { name: "Microsoft Copilot", score: selected?.aiTools?.Copilot?.rating ?? null, pages: selected?.aiTools?.Copilot?.pages ?? null, color: "#F59E0B" },
            { name: "Gemini", score: selected?.aiTools?.Gemini?.rating ?? null, pages: selected?.aiTools?.Gemini?.pages ?? null, color: "#EF4444" },
          ].map(tool => (
            <div key={tool.name} className="flex items-center gap-3">
              <div className="min-w-[120px] text-[12px] text-[var(--text)]">{tool.name}</div>
              <div className="flex-1 h-2 rounded-full bg-[#E5E7EB]">
                {tool.score != null && <div className="h-2 rounded-full" style={{ width: `${(tool.score / 5) * 100}%`, background: tool.color }} />}
              </div>
              <div className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: tool.color }}>
                {tool.score != null ? `${tool.score.toFixed(1)}/5` : "—"}
              </div>
              <div className="shrink-0 text-[11px] text-[var(--muted)] w-12 text-right">
                {tool.pages != null ? `${formatCompactNumber(tool.pages)} pgs` : "—"}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-[var(--muted)]">
          Estimated visibility score based on domain authority & content signals
        </div>
      </div>

      {/* SERP Feature Opportunities */}
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
        <div className="text-[12px] font-semibold text-[var(--muted)] mb-4">SERP Feature Opportunities</div>
        <div className="space-y-3">
          {[
            { feature: "Featured Snippet", count: selected?.serp?.featuredSnippets ?? null, opportunity: "Structure content with Q&A format", icon: "⭐" },
            { feature: "People Also Ask", count: selected?.serp?.peopleAlsoAsk ?? null, opportunity: "Target FAQ-style questions", icon: "❓" },
            { feature: "Image Pack", count: selected?.serp?.imagePack ?? null, opportunity: "Add optimized images with alt text", icon: "🖼️" },
            { feature: "Video Results", count: selected?.serp?.videoResults ?? null, opportunity: "Create YouTube/embedded videos", icon: "▶️" },
            { feature: "Knowledge Panel", count: selected?.serp?.knowledgePanel ?? null, opportunity: "Build brand entity signals", icon: "📋" },
          ].map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px]">{f.icon}</span>
                <div>
                  <div className="text-[12px] font-medium text-[var(--text)]">{f.feature}</div>
                  <div className="text-[10px] text-[var(--muted)]">{f.opportunity}</div>
                </div>
              </div>
              <span className={`shrink-0 text-[13px] font-bold tabular-nums ml-2 ${f.count != null && f.count > 0 ? "text-[#178A5D]" : "text-[var(--muted)]"}`}>
                {f.count != null ? f.count : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
)}

{/* ─────────────────────────────────────────────────────────────────────
    AI DEEP ANALYZE + GENERATE REPORT
    ───────────────────────────────────────────────────────────────────── */}
<section className="mt-8 mb-6">
  {/* Action Bar */}
  <div className="flex flex-wrap items-center gap-3 mb-4">
    <h2 className="text-[16px] font-bold text-[var(--text)] flex-1">
      AI Intelligence
    </h2>

    {/* AI Deep Analyze Button */}
    <button
      onClick={handleAiAnalyze}
      disabled={aiLoading || !seo}
      className={`inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-[13px] font-semibold shadow-sm transition-all
        ${aiLoading || !seo
          ? "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed"
          : "bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] text-white hover:from-[#4338ca] hover:to-[#6d28d9] hover:shadow-md"
        }`}
    >
      {aiLoading ? (
        <>
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Analyzing…
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10"/><circle cx="12" cy="12" r="3"/>
          </svg>
          🤖 AI Deep Analyze
        </>
      )}
    </button>

    {/* Generate Report Button */}
    <button
      onClick={handleGenerateReport}
      disabled={reportLoading || !domain}
      className={`inline-flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-[13px] font-semibold shadow-sm transition-all border
        ${reportLoading || !domain
          ? "bg-[#F9FAFB] border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed"
          : "bg-white border-[#E5E7EB] text-[#374151] hover:bg-[#F3F4F6] hover:border-[#D1D5DB] hover:shadow-md"
        }`}
    >
      {reportLoading ? (
        <>
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Generating PDF…
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          📄 Generate Report
        </>
      )}
    </button>
  </div>

  {/* Error states */}
  {aiError && (
    <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-[12px] text-[#B91C1C]">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {aiError}
      <button onClick={() => setAiError("")} className="ml-auto text-[#B91C1C] hover:text-[#7F1D1D]">✕</button>
    </div>
  )}
  {reportError && (
    <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-[12px] text-[#B91C1C]">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {reportError}
      <button onClick={() => setReportError("")} className="ml-auto text-[#B91C1C] hover:text-[#7F1D1D]">✕</button>
    </div>
  )}

  {/* AI Loading state */}
  {aiLoading && (
    <div className="rounded-[14px] border border-[#E0E7FF] bg-gradient-to-br from-[#EEF2FF] to-[#F5F3FF] p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-[#4f46e5]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <div>
          <div className="text-[14px] font-semibold text-[#3730a3]">Claude Opus 4.7 is analyzing your website</div>
          <div className="mt-1 text-[12px] text-[#6366f1]">Performing deep SEO intelligence analysis… This may take 30–60 seconds.</div>
        </div>
      </div>
    </div>
  )}

  {/* AI Analysis Results Panel */}
  {aiAnalysis && !aiLoading && aiPanelOpen && (
    <div className="rounded-[16px] border border-[#E0E7FF] bg-white shadow-lg overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <span className="text-[18px]">🤖</span>
          </div>
          <div>
            <div className="text-[14px] font-bold text-white">AI SEO Intelligence Report</div>
            <div className="text-[11px] text-[#c7d2fe]">Powered by Claude Opus 4.7 • {domain}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Overall Score Badge */}
          <div className="flex flex-col items-center justify-center h-12 w-12 rounded-full bg-white/20 text-white">
            <div className="text-[16px] font-black leading-none">{aiAnalysis.scoreGrade || "—"}</div>
            <div className="text-[9px] opacity-75">{aiAnalysis.overallScore || 0}/100</div>
          </div>
          <button
            onClick={() => setAiPanelOpen(false)}
            className="ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors text-[14px]"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 max-h-[600px] overflow-y-auto">
        {/* Executive Summary */}
        {aiAnalysis.executiveSummary && (
          <div className="rounded-[10px] bg-[#F8FAFF] border border-[#E0E7FF] p-4">
            <div className="text-[12px] font-semibold text-[#4f46e5] uppercase tracking-wide mb-2">Executive Summary</div>
            <p className="text-[13px] text-[#374151] leading-relaxed">{aiAnalysis.executiveSummary}</p>
          </div>
        )}

        {/* Strengths & Issues — 2 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* What's Working */}
          {Array.isArray(aiAnalysis.strengths) && aiAnalysis.strengths.length > 0 && (
            <div>
              <div className="text-[12px] font-bold text-[#16a34a] uppercase tracking-wide mb-2 flex items-center gap-1">
                <span>✅</span> What&apos;s Working
              </div>
              <div className="space-y-2">
                {aiAnalysis.strengths.slice(0, 4).map((s, i) => (
                  <div key={i} className="flex gap-2 rounded-[8px] bg-[#F0FDF4] border border-[#BBF7D0] p-3">
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold text-[#166534]">{s.title}</div>
                      <div className="text-[11px] text-[#4b5563] mt-0.5">{s.detail}</div>
                      {s.metric && <div className="text-[10px] text-[#16a34a] font-medium mt-1">{s.metric}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical Issues */}
          {Array.isArray(aiAnalysis.criticalIssues) && aiAnalysis.criticalIssues.length > 0 && (
            <div>
              <div className="text-[12px] font-bold text-[#dc2626] uppercase tracking-wide mb-2 flex items-center gap-1">
                <span>🚨</span> Critical Issues
              </div>
              <div className="space-y-2">
                {aiAnalysis.criticalIssues.slice(0, 4).map((issue, i) => (
                  <div key={i} className="rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[12px] font-semibold text-[#991b1b]">{issue.title}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        issue.impact === "critical" ? "bg-[#DC2626] text-white" :
                        issue.impact === "high" ? "bg-[#F59E0B] text-white" :
                        "bg-[#3B82F6] text-white"
                      }`}>{issue.impact}</span>
                    </div>
                    <div className="text-[11px] text-[#4b5563] mt-0.5">{issue.detail}</div>
                    {issue.fix && (
                      <div className="text-[11px] text-[#16a34a] font-medium mt-1">
                        Fix: {issue.fix}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Wins */}
        {Array.isArray(aiAnalysis.quickWins) && aiAnalysis.quickWins.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-[#d97706] uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>⚡</span> Quick Wins
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {aiAnalysis.quickWins.slice(0, 4).map((qw, i) => (
                <div key={i} className="flex gap-2 rounded-[8px] bg-[#FFFBEB] border border-[#FDE68A] p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[12px] font-semibold text-[#92400e]">{qw.title}</div>
                      <span className="rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-1.5 py-0.5 text-[9px] font-bold text-[#92400e]">{qw.effort}</span>
                    </div>
                    <div className="text-[11px] text-[#4b5563] mt-0.5">{qw.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Action Plan */}
        {Array.isArray(aiAnalysis.prioritizedActionPlan) && aiAnalysis.prioritizedActionPlan.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-[#1e40af] uppercase tracking-wide mb-2 flex items-center gap-1">
              <span>📋</span> Top Priority Actions
            </div>
            <div className="space-y-2">
              {aiAnalysis.prioritizedActionPlan.slice(0, 5).map((action, i) => (
                <div key={i} className="flex gap-3 rounded-[8px] bg-[#EFF6FF] border border-[#BFDBFE] p-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-[11px] font-bold text-white">
                    {action.priority || i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold text-[#1e3a8a]">{action.action}</div>
                    <div className="text-[11px] text-[#4b5563] mt-0.5">{action.why}</div>
                    {action.expectedOutcome && (
                      <div className="text-[11px] text-[#16a34a] font-medium mt-1">Expected: {action.expectedOutcome}</div>
                    )}
                  </div>
                  {action.timeline && (
                    <div className="shrink-0 text-[10px] text-[#6b7280]">{action.timeline}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estimated Impact + Generate Report CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3 rounded-[12px] bg-gradient-to-r from-[#4f46e5] to-[#7c3aed] p-4">
          <div className="flex-1 text-white">
            <div className="text-[13px] font-bold mb-0.5">Ready to get the full report?</div>
            {aiAnalysis.estimatedTrafficImpact && (
              <div className="text-[11px] text-[#c7d2fe]">{aiAnalysis.estimatedTrafficImpact}</div>
            )}
          </div>
          <button
            onClick={handleGenerateReport}
            disabled={reportLoading}
            className="inline-flex items-center gap-2 rounded-[10px] bg-white px-4 py-2 text-[12px] font-bold text-[#4f46e5] hover:bg-[#EEF2FF] transition-colors shadow-sm shrink-0"
          >
            {reportLoading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating…
              </>
            ) : "📄 Download PDF Report"}
          </button>
        </div>
      </div>
    </div>
  )}
</section>

      {/* ── Website Crawl & Audit ─────────────────────────────────────────── */}
      {seo?.websiteCrawl && (
        <section className="mb-8 rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-5 shadow-sm">
          <h2 className="text-[16px] font-bold text-[var(--text)] mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#d45427]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
            </svg>
            Website Crawl & Audit
          </h2>
          <p className="text-[12px] text-[var(--muted)] mb-4">
            {seo.websiteCrawl.pageCount || 0} pages crawled
            {seo.websiteCrawl.hasSitemap ? " · sitemap found" : " · no sitemap"}
            {seo.websiteCrawl.hasRobots  ? " · robots.txt found" : ""}
            {seo.websiteCrawl.crawlBlockedByRobots ? " · ⚠️ crawl blocked by robots.txt" : ""}
          </p>

          {/* Crawl stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
            {[
              { label: "Missing Meta Title",  value: seo.websiteCrawl.summary?.pagesMissingMetaTitle ?? "—", bad: (seo.websiteCrawl.summary?.pagesMissingMetaTitle || 0) > 0 },
              { label: "Missing Meta Desc",   value: seo.websiteCrawl.summary?.pagesMissingMetaDesc  ?? "—", bad: (seo.websiteCrawl.summary?.pagesMissingMetaDesc  || 0) > 0 },
              { label: "Missing H1",          value: seo.websiteCrawl.summary?.pagesMissingH1        ?? "—", bad: (seo.websiteCrawl.summary?.pagesMissingH1        || 0) > 0 },
              { label: "Noindex Pages",       value: seo.websiteCrawl.summary?.pagesNoindex          ?? "—", bad: false },
              { label: "Images No Alt",       value: seo.websiteCrawl.summary?.totalImgsWithoutAlt   ?? "—", bad: (seo.websiteCrawl.summary?.totalImgsWithoutAlt   || 0) > 0 },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-[10px] border p-3 text-center ${stat.bad ? "border-orange-200 bg-orange-50 dark:bg-orange-900/10" : "border-[var(--border)] bg-[var(--card)]"}`}>
                <div className={`text-[20px] font-bold tabular-nums ${stat.bad ? "text-[#d45427]" : "text-[var(--text)]"}`}>{stat.value}</div>
                <div className="text-[11px] text-[var(--muted)] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Schema types found */}
          {(seo.websiteCrawl.summary?.pagesWithSchemaTypes?.length ?? 0) > 0 && (
            <div className="mb-4">
              <div className="text-[12px] font-semibold text-[var(--text)] mb-2">Schema Types Found</div>
              <div className="flex flex-wrap gap-2">
                {seo.websiteCrawl.summary.pagesWithSchemaTypes.map((t) => (
                  <span key={t} className="rounded-full bg-green-50 border border-green-200 text-green-700 px-3 py-1 text-[11px] font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}
          {(seo.websiteCrawl.summary?.pagesWithSchemaTypes?.length ?? 0) === 0 && (
            <div className="mb-4 rounded-[10px] border border-orange-200 bg-orange-50 dark:bg-orange-900/10 px-4 py-3">
              <span className="text-[12px] font-semibold text-[#d45427]">⚠️ No Schema.org structured data found — AI engines can't extract entity information</span>
            </div>
          )}

          {/* Top issues */}
          {(seo.websiteCrawl.summary?.commonIssues?.length ?? 0) > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-[var(--text)] mb-2">Most Common Issues</div>
              <div className="space-y-1.5">
                {seo.websiteCrawl.summary.commonIssues.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <span className="text-[12px] text-[var(--text)]">{item.issue}</span>
                    <span className="ml-2 shrink-0 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5">{item.count} pages</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── GMB & Directory Listings ──────────────────────────────────────── */}
      {seo?.gmbCheck && (
        <section className="mb-8 rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-5 shadow-sm">
          <h2 className="text-[16px] font-bold text-[var(--text)] mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#d45427]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            GMB & Local Presence
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* GMB status card */}
            <div className={`rounded-[12px] border p-4 ${seo.gmbCheck.gmb?.found ? "border-green-200 bg-green-50 dark:bg-green-900/10" : "border-red-200 bg-red-50 dark:bg-red-900/10"}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${seo.gmbCheck.gmb?.found ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-[13px] font-bold text-[var(--text)]">
                  {seo.gmbCheck.gmb?.found ? "Google My Business Found" : "No GMB Listing"}
                </span>
              </div>
              {seo.gmbCheck.gmb?.found && (
                <div className="space-y-1.5">
                  {seo.gmbCheck.gmb.rating != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[22px] font-bold text-[var(--text)]">{seo.gmbCheck.gmb.rating}</span>
                      <span className="text-[#ffa615] text-[16px]">★</span>
                      <span className="text-[12px] text-[var(--muted)]">({seo.gmbCheck.gmb.reviewCount || 0} reviews)</span>
                    </div>
                  )}
                  <div className="text-[12px] text-[var(--muted)]">
                    {seo.gmbCheck.gmb.isVerified ? "✓ Verified" : "⚠️ Not verified"} ·
                    {seo.gmbCheck.gmb.phone ? " ✓ Phone" : " ✗ No phone"} ·
                    {seo.gmbCheck.gmb.hoursAvailable ? " ✓ Hours set" : " ✗ No hours"} ·
                    {seo.gmbCheck.gmb.photos ? " ✓ Photos" : " ✗ No photos"}
                  </div>
                </div>
              )}
            </div>

            {/* Directory listings */}
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="text-[12px] font-semibold text-[var(--text)] mb-3">
                Business Directories ({seo.gmbCheck.listedDirectoryCount ?? 0}/{(seo.gmbCheck.directories || []).length} listed)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(seo.gmbCheck.directories || []).map((dir) => (
                  <div key={dir.name} className="flex items-center gap-1.5">
                    <span className={`text-[11px] ${dir.listed === true ? "text-green-600" : dir.listed === false ? "text-red-400" : "text-[var(--muted)]"}`}>
                      {dir.listed === true ? "✓" : dir.listed === false ? "✗" : "?"}
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">{dir.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* GMB Issues */}
          {(seo.gmbCheck.issues?.length ?? 0) > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[12px] font-semibold text-[var(--text)] mb-2">Issues to Fix</div>
              {seo.gmbCheck.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 rounded-[8px] border border-orange-200 bg-orange-50 dark:bg-orange-900/10 px-3 py-2">
                  <span className="text-[#d45427] text-[11px] mt-0.5 shrink-0">⚠</span>
                  <span className="text-[12px] text-[var(--text)]">{issue}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent reviews */}
          {(seo.gmbCheck.reviews?.length ?? 0) > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-semibold text-[var(--text)] mb-2">Recent Reviews</div>
              <div className="space-y-2">
                {seo.gmbCheck.reviews.slice(0, 3).map((review, i) => (
                  <div key={i} className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[#ffa615] text-[12px]">{"★".repeat(Math.round(review.rating || 0))}</span>
                      <span className="text-[11px] text-[var(--muted)]">{review.author} · {review.date}</span>
                      {review.ownerReply && <span className="text-[10px] text-green-600 font-medium">replied</span>}
                    </div>
                    {review.text && <p className="text-[11px] text-[var(--muted)] leading-relaxed">{review.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Competitor Audit ──────────────────────────────────────────────── */}
      {seo?.competitorAudit?.competitors?.length > 0 && (
        <section className="mb-8 rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-5 shadow-sm">
          <h2 className="text-[16px] font-bold text-[var(--text)] mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#d45427]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Competitor Audit
          </h2>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-4 font-semibold text-[var(--muted)]">Domain</th>
                  <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">Pages</th>
                  <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">Sitemap</th>
                  <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">Schema</th>
                  <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">GMB Rating</th>
                  <th className="text-center py-2 px-3 font-semibold text-[var(--muted)]">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {/* Target domain row */}
                {seo.competitorAudit.target && (
                  <tr className="border-b border-[var(--border)] bg-orange-50/40 dark:bg-orange-900/5">
                    <td className="py-2.5 pr-4 font-bold text-[#d45427]">
                      {seo.competitorAudit.target.domain} <span className="text-[10px] font-normal text-[var(--muted)]">(you)</span>
                    </td>
                    <td className="text-center py-2.5 px-3 text-[var(--text)]">{seo.competitorAudit.target.crawl?.pageCount ?? "—"}</td>
                    <td className="text-center py-2.5 px-3">{seo.competitorAudit.target.crawl?.hasSitemap ? "✓" : "✗"}</td>
                    <td className="text-center py-2.5 px-3 text-[11px]">
                      {(seo.competitorAudit.target.crawl?.summary?.pagesWithSchemaTypes?.length ?? 0) > 0
                        ? seo.competitorAudit.target.crawl.summary.pagesWithSchemaTypes.join(", ")
                        : "—"}
                    </td>
                    <td className="text-center py-2.5 px-3">
                      {seo.competitorAudit.target.gmb?.gmb?.rating ? `${seo.competitorAudit.target.gmb.gmb.rating}★` : "—"}
                    </td>
                    <td className="text-center py-2.5 px-3 text-[var(--muted)]">
                      {seo.competitorAudit.target.gmb?.gmb?.reviewCount ?? "—"}
                    </td>
                  </tr>
                )}
                {/* Competitor rows */}
                {seo.competitorAudit.competitors.map((comp) => (
                  <tr key={comp.domain} className="border-b border-[var(--border)]/50">
                    <td className="py-2.5 pr-4 font-medium text-[var(--text)]">{comp.domain}</td>
                    <td className="text-center py-2.5 px-3 text-[var(--muted)]">{comp.crawl?.pageCount ?? "—"}</td>
                    <td className="text-center py-2.5 px-3 text-[var(--muted)]">{comp.crawl?.hasSitemap ? "✓" : "✗"}</td>
                    <td className="text-center py-2.5 px-3 text-[11px] text-[var(--muted)]">
                      {(comp.crawl?.summary?.pagesWithSchemaTypes?.length ?? 0) > 0
                        ? comp.crawl.summary.pagesWithSchemaTypes.join(", ")
                        : "—"}
                    </td>
                    <td className="text-center py-2.5 px-3 text-[var(--muted)]">
                      {comp.gmb?.gmb?.rating ? `${comp.gmb.gmb.rating}★` : "—"}
                    </td>
                    <td className="text-center py-2.5 px-3 text-[var(--muted)]">
                      {comp.gmb?.gmb?.reviewCount ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gap analysis signals */}
          {(seo.competitorAudit.comparison?.length ?? 0) > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-semibold text-[var(--text)] mb-2">Gap Analysis</div>
              <div className="space-y-2">
                {seo.competitorAudit.comparison.filter((s) => s.gap !== "none").map((sig, i) => (
                  <div key={i} className={`rounded-[8px] border px-3 py-2 flex items-start justify-between gap-3 ${sig.gap === "high" ? "border-red-200 bg-red-50 dark:bg-red-900/10" : "border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10"}`}>
                    <div>
                      <div className={`text-[11px] font-semibold ${sig.gap === "high" ? "text-red-700" : "text-yellow-700"}`}>{sig.signal}</div>
                      <div className="text-[11px] text-[var(--muted)] mt-0.5">You: {sig.target} · Competitors: {sig.competitors}</div>
                    </div>
                    <span className={`shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 ${sig.gap === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{sig.gap.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Strategic Plan ────────────────────────────────────────────────── */}
      {seo?.strategicPlan?.plan && (
        <section className="mb-8 rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-5 shadow-sm">
          <h2 className="text-[16px] font-bold text-[var(--text)] mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#d45427]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Strategic SEO + GEO Plan
          </h2>
          <p className="text-[11px] text-[var(--muted)] mb-4">Generated by Claude AI based on your crawl data, GMB status, and competitor analysis</p>
          <div
            className="prose prose-sm max-w-none text-[var(--text)] leading-relaxed"
            style={{
              fontSize: "13px",
              lineHeight: "1.7",
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
            }}
          >
            {seo.strategicPlan.plan}
          </div>
          <div className="mt-4 text-[11px] text-[var(--muted)]">
            Generated at {seo.strategicPlan.generatedAt ? new Date(seo.strategicPlan.generatedAt).toLocaleString() : "—"}
          </div>
        </section>
      )}

      </div>
    </main>
  );
}
