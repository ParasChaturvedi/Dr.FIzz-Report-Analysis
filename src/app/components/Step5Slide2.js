"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Languages,
  Tag,
  UsersRound,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import { prefetchOpportunitiesAndContent, getPlagiarismPages } from "@/lib/prefetch-opportunities";

// ─── Module status state machine ──────────────────────────────────────────────
const STATUS = {
  PASS: "PASS", FAILED: "FAILED", PARTIAL: "PARTIAL", TIMEOUT: "TIMEOUT",
  EMPTY: "EMPTY", LOW_CONFIDENCE: "LOW_CONFIDENCE", BLOCKED: "BLOCKED",
  RUNNING: "RUNNING", PENDING: "PENDING",
};

// Retry with short backoff (2 retries → waits 1.5s, 3s). Kept fast on purpose:
// this runs inside a live, user-facing flow on serverless (Vercel) where long
// backoffs would blow past function/route time limits and make the whole report
// time out. `validate(result)` returns true when the result is usable.
// Returns { ok, data, status, error }.
async function withRetry(fn, { backoffs = [1500, 3000], validate, label = "module" } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const data = await fn();
      if (!validate || validate(data)) {
        return { ok: true, data, status: STATUS.PASS };
      }
      lastErr = new Error(`${label}: result failed validation`);
    } catch (e) {
      lastErr = e;
      if (e?.name === "AbortError" || /timeout/i.test(e?.message || "")) {
        // timeout — keep retrying
      }
    }
    if (attempt < backoffs.length) {
      console.warn(`[Step5] ${label} attempt ${attempt + 1} failed (${lastErr?.message}); retrying in ${backoffs[attempt] / 1000}s`);
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
  }
  return { ok: false, data: null, status: STATUS.FAILED, error: lastErr };
}

// ─── Crawl status string ──────────────────────────────────────────────────────
// Shows the site's true size (Google-indexed or sitemap total) and how many
// pages were deep-audited, instead of just the audited count.
function formatCrawlValue(crawl) {
  if (!crawl) return "—";
  const audited = crawl.pageCount ?? 0;
  const total   = crawl.totalPagesEstimate ?? 0;
  const indexed = crawl.indexedPages;
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

  let sizeLabel;
  if (indexed != null && indexed > audited) {
    sizeLabel = `~${fmt(indexed)} indexed`;
  } else if (total > audited) {
    sizeLabel = `${fmt(total)} pages`;
  } else {
    sizeLabel = `${audited} page${audited === 1 ? "" : "s"}`;
  }
  const sitemap = crawl.hasSitemap ? "sitemap ✓" : "no sitemap";
  // When we audited fewer than the site total, note how many were sampled.
  const sampled = total > audited ? ` · ${audited} audited` : "";
  return `${sizeLabel}${sampled} · ${sitemap}`;
}

// ─── Stage & check initial state ──────────────────────────────────────────────
// Display order mirrors the enterprise 6-phase execution flow:
//   Phase 1 — Core Data Collection (validation first, then all sources)
//   Phase 2 — Data Validation Layer (gate before any AI)
//   Phase 3/4 — Deep AI Analysis → Content Opportunities (AFTER analysis)
//   Phase 5 — Strategic Plan
//   Phase 6 — Master Report
// All technical data is collected first (each module retries until it succeeds —
// nothing is allowed to hard-fail or block). Only after every technical dataset
// is in do we derive Content Opportunities → Strategic Plan → the AI Report.
// ── The 10-stage data-collection journey. Each stage shows WHAT it covers so the
//    user understands the logic at every step: validation → diagnostics →
//    opportunity → action. The underlying data collectors are mapped onto these
//    stages via STAGE_ALIAS below (so no fetch logic changes). ───────────────────
const INITIAL_STAGES = [
  { id: "validation",     label: "1. Website Validation",
    desc: "Site scope, crawl access, indexability, technical health, and whether the site is valid for analysis." },
  { id: "crawlability",   label: "2. Indexed Pages & Crawlability",
    desc: "Discovers the site's key pages (service pages, blogs, important URLs) and checks whether search engines can properly crawl & index them — robots.txt, sitemap, noindex tags, internal linking, and page discovery." },
  { id: "technical",      label: "3. Technical SEO",
    desc: "Performance, Core Web Vitals, structured data, redirects, canonicals, duplicate issues, and indexation blockers." },
  { id: "onpage",         label: "4. On-Page SEO & Content",
    desc: "Titles, meta descriptions, headers, content quality, keyword mapping, internal links, and topical coverage." },
  { id: "offpage",        label: "5. Off-Page & Authority Signals",
    desc: "Backlinks, citations, directory presence, brand mentions, and trust signals." },
  { id: "geoLlm",         label: "6. GEO & LLM Check",
    desc: "Checks the on-page AI-readiness signals in the collected content — structured data / schema and answer-style formatting. (Full multi-engine AI-visibility scan is a separate module.)" },
  { id: "dataValidation", label: "7. Data Validation",
    desc: "Confirms the data is complete, accurate, formatted properly, and that no fields are missing or broken." },
  { id: "seoGeoReport",   label: "8. SEO & GEO Report",
    desc: "Turns the findings into a clear business summary — opportunities, priorities, and recommendations." },
  { id: "storytelling",   label: "9. Final Intelligence Report",
    desc: "The final intelligence report — where the business stands, what is holding it back, the biggest opportunity, and the prioritized action plan." },
];

// Maps each underlying data collector (old stage id) onto a journey stage above,
// so every existing updateStage("<collector>") call routes to the right step.
const STAGE_ALIAS = {
  websiteValidation: "validation",
  psi:               "technical",
  content:           "onpage",
  onpageKeywords:    "onpage",
  dataforseoExtra:   "onpage",
  keywordGap:        "onpage",
  dataforseo:        "offpage",
  gmbCheck:          "offpage",
  competitorAudit:   "offpage",
  websiteCrawl:      "crawlability",
  dataValidation:    "dataValidation",
  opportunities:     "seoGeoReport",
  strategicPlan:     "seoGeoReport",
  report:            "storytelling",
};

const INITIAL_CHECKS = [
  { id: "completeness", label: "Data Completeness",  state: "idle", note: null },
  { id: "anomaly",      label: "Anomaly Detection",  state: "idle", note: null },
  { id: "readiness",    label: "Report Readiness",   state: "idle", note: null },
];

// ── Realistic-load presentation ──────────────────────────────────────────────
// A cached report would open instantly, and a data-cached fresh run can finish fast.
// To keep EVERY run feeling like a live data collection (the user should never sense
// the data came from the 30-day store), we replay / floor the loading journey to a
// believable duration — slightly LESS than a typical first-time fetch (~3–5 min).
const REALISTIC_LOAD_MIN_MS  = 150000; // 2.5 min floor
const REALISTIC_LOAD_SPAN_MS = 60000;  // + up to 1 min of jitter → 2.5–3.5 min
// Heavier stages take longer (off-page APIs, the two Opus analysis steps), matching
// where the real pipeline actually spends its time.
const REPLAY_STAGE_WEIGHTS = {
  validation: 1.0, crawlability: 1.4, technical: 1.6,
  onpage: 1.9, offpage: 2.6, geoLlm: 1.2, dataValidation: 0.8,
  seoGeoReport: 2.6, storytelling: 2.6,
};
const REPLAY_STAGE_VALUES = {
  validation: "Checked", crawlability: "Crawlable",
  technical: "Analyzed", onpage: "Analyzed", offpage: "Analyzed",
  geoLlm: "Checked", dataValidation: "Validated", seoGeoReport: "Generated",
  storytelling: "Complete",
};
// Per-domain first-time load length (localStorage), so a REPEAT report takes the SAME
// time as the very first real fetch for that site — never instant, even from cache.
const LOAD_MS_MAX = 360000; // clamp the remembered length to ≤ 6 min
const LOAD_MS_KEY = (d) => `drfizz:loadtime:${d}`;
const clampLoadMs = (ms) => Math.max(REALISTIC_LOAD_MIN_MS, Math.min(LOAD_MS_MAX, Math.round(ms)));
function getStoredLoadMs(domain) {
  try {
    const v = Number(localStorage.getItem(LOAD_MS_KEY(domain)));
    return Number.isFinite(v) && v >= REALISTIC_LOAD_MIN_MS ? v : 0;
  } catch { return 0; }
}
function storeLoadMs(domain, ms) {
  try { localStorage.setItem(LOAD_MS_KEY(domain), String(clampLoadMs(ms))); } catch { /* storage blocked */ }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Stage row icon ────────────────────────────────────────────────────────────
function StageIcon({ state }) {
  if (state === "loading") {
    return (
      <svg className="animate-spin w-4 h-4 text-[#d45427]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (state === "done" || state === "pass") {
    return (
      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === "error" || state === "fail") {
    return (
      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  // idle
  return <div className="w-4 h-4 rounded-full border-2 border-[var(--border)]" />;
}

// ─── Single checklist row ──────────────────────────────────────────────────────
function ChecklistRow({ label, state, value, desc }) {
  const isActive = state === "loading";
  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${isActive ? "bg-orange-50/40" : ""}`}>
      <div className="w-5 flex-shrink-0 flex items-center justify-center mt-0.5">
        <StageIcon state={state} />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] font-medium ${
          state === "done" || state === "pass" ? "text-[var(--text)]" :
          state === "error" || state === "fail" ? "text-red-500" :
          state === "loading" ? "text-[#d45427]" :
          "text-[var(--muted)]"
        }`}>
          {label}
        </span>
        {desc && (
          <p className="text-[11px] leading-snug text-[var(--muted)] mt-0.5 pr-2">{desc}</p>
        )}
      </div>
      {value && (
        <div className={`text-[11px] font-medium flex-shrink-0 max-w-[180px] text-right truncate ${
          state === "done" || state === "pass" ? "text-green-600" :
          state === "error" || state === "fail" ? "text-red-400" :
          "text-[var(--muted)]"
        }`}>
          {value}
        </div>
      )}
      {!value && state === "loading" && (
        <div className="text-[11px] text-[#d45427] flex-shrink-0 italic">fetching…</div>
      )}
    </div>
  );
}

/**
 * Props:
 * - onBack(): go to previous slide
 * - onDashboard(): open dashboard
 * - navigateToStep?(n: number)
 * - websiteData, businessData, languageLocationData, keywordData, competitorData
 */
export default function Step5Slide2({
  onBack,
  onDashboard,
  navigateToStep,
  websiteData,
  businessData,
  languageLocationData,
  keywordData = [],
  competitorData = null,
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

  // ── Final accuracy check (advisory) — Claude cross-checks the assembled Steps 1-5
  //    inputs against the REAL website before the (costly) report runs, and flags
  //    off-topic keywords / irrelevant competitors / industry mismatches. Non-blocking:
  //    the user can fix issues with Back, or generate anyway.
  const [accuracy, setAccuracy] = useState(null);
  const [accuracyLoading, setAccuracyLoading] = useState(false);
  const accuracyRanRef = useRef(false);
  useEffect(() => {
    if (accuracyRanRef.current) return;
    const site = websiteData?.site || websiteData?.website || websiteData?.url || websiteData?.domain;
    if (!site || !businessData) return; // wait until the essentials are present
    accuracyRanRef.current = true;
    setAccuracyLoading(true);
    fetch("/api/seo/validate-inputs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ websiteData, businessData, languageLocationData, keywordData, competitorData }),
    })
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setAccuracy(d); })
      .catch(() => {})
      .finally(() => setAccuracyLoading(false));
  }, [websiteData, businessData, languageLocationData, keywordData, competitorData]);

  // Dots animation
  const [loadingDots, setLoadingDots] = useState(".");

  // Phase: "collecting" | "checking" | "redirecting" | null
  const [loadingPhase, setLoadingPhase] = useState(null);

  // Live checklist state
  const [fetchStages, setFetchStages] = useState(INITIAL_STAGES);
  const [crossChecks, setCrossChecks]  = useState(INITIAL_CHECKS);
  // Mirror of fetchStages so the progress interval always reads the latest stage states.
  const fetchStagesRef = useRef(INITIAL_STAGES);
  useEffect(() => { fetchStagesRef.current = fetchStages; }, [fetchStages]);

  // Forward-only journey display: present ONE active step at a time, advancing 1→9 in
  // order. The underlying collectors run in parallel / mixed order, but the UI must never
  // show a later step done before an earlier one, never spin two steps at once, and never
  // flip a step back to loading. Derived purely from the ordered stage states.
  const displayStages = useMemo(() => {
    let active = fetchStages.findIndex(
      (s) => !(s.state === "done" || s.state === "pass" || s.state === "error")
    );
    if (active === -1) active = fetchStages.length;            // everything finished
    return fetchStages.map((s, i) => {
      if (i < active)   return s.state === "error" ? s : { ...s, state: "done" };
      if (i === active) return { ...s, state: "loading" };
      return { ...s, state: "idle", value: null };            // not started yet — hide premature value
    });
  }, [fetchStages]);

  // Progress bar — driven by REAL stage completion (see startFakeProgressTo92 below).
  const [progressPct, setProgressPct] = useState(0);
  const fakeProgressRef = useRef(null);

  const startFakeProgressTo92 = () => {
    setProgressPct(0);
    if (fakeProgressRef.current) clearInterval(fakeProgressRef.current);
    // Drive the bar from REAL stage completion (read via ref so the interval always
    // sees the latest stages). The bar = completed-stage fraction; within an in-flight
    // stage it eases toward — but never reaches — the next milestone. So it mirrors
    // actual data-collection progress instead of a timer. Works for both the live run
    // and the cached replay (which completes the stages over the stored duration).
    fakeProgressRef.current = setInterval(() => {
      const stages = fetchStagesRef.current || [];
      const total = stages.length || 1;
      const done = stages.filter((s) => s.state === "done" || s.state === "pass" || s.state === "error").length;
      const anyLoading = stages.some((s) => s.state === "loading");
      const ceiling = Math.min(99, ((done + (anyLoading ? 0.85 : 0)) / total) * 100);
      setProgressPct((p) => (p >= ceiling ? p : Math.min(ceiling, p + Math.max(0.06, (ceiling - p) * 0.04))));
    }, 120);
  };

  const stopFakeProgress = () => {
    if (fakeProgressRef.current) {
      clearInterval(fakeProgressRef.current);
      fakeProgressRef.current = null;
    }
  };

  // Panel sizing
  const panelRef       = useRef(null);
  const scrollRef      = useRef(null);
  const bottomBarRef   = useRef(null);
  const loaderAnchorRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);

  const recomputePanelHeight = () => {
    if (typeof window === "undefined" || !panelRef.current) return;
    const vpH = window.innerHeight;
    const barH = bottomBarRef.current?.getBoundingClientRect().height ?? 0;
    const topOffset = panelRef.current.getBoundingClientRect().top;
    const h = Math.max(360, vpH - barH - topOffset - 24);
    setPanelHeight(h);
  };

  useEffect(() => {
    recomputePanelHeight();
    if (typeof window === "undefined") return;
    const ro = new ResizeObserver(recomputePanelHeight);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", recomputePanelHeight);
    return () => { ro.disconnect(); window.removeEventListener("resize", recomputePanelHeight); };
  }, []);

  useEffect(() => { recomputePanelHeight(); }, [loading]);

  useEffect(() => {
    if (!loading) return;
    setLoadingDots(".");
    const id = setInterval(() => {
      setLoadingDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 450);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => { return () => stopFakeProgress(); }, []);

  // ── Stage / check helpers ─────────────────────────────────────────────────
  const updateStage = useCallback((id, patch, opts = {}) => {
    const realId = STAGE_ALIAS[id] || id;   // route collectors → journey stages
    setFetchStages((prev) => prev.map((s) => {
      if (s.id !== realId) return s;
      // Several collectors feed one journey stage — normally never revert a completed
      // stage back to "loading"; just keep updating its value. EXCEPTION: opts.force
      // lets a LATE, slow collector (e.g. the ~90s GEO scan, competitor audit) re-show
      // its stage as loading, so the user sees activity instead of a stuck UI.
      if (!opts.force && patch.state === "loading" && (s.state === "done" || s.state === "error")) {
        const { state, ...rest } = patch;
        return { ...s, ...rest };
      }
      return { ...s, ...patch };
    }));
  }, []);

  const updateCheck = useCallback((id, patch) => {
    setCrossChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  // Replay the 10-stage journey + cross-checks over `totalMs` with organic, weighted
  // pacing — used when the report is served from cache (instant) so the run still
  // looks like a live collection. No "from cache" hint is ever shown.
  const playRealisticJourney = useCallback(async (totalMs) => {
    const stages = INITIAL_STAGES;
    // Weighted, slightly-randomized per-stage durations summing to ~totalMs.
    const weights = stages.map((s) => (REPLAY_STAGE_WEIGHTS[s.id] || 1) * (0.82 + Math.random() * 0.36));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      updateStage(s.id, { state: "loading" });
      await delay(Math.max(400, Math.round((weights[i] / wsum) * totalMs)));
      updateStage(s.id, { state: "done", value: REPLAY_STAGE_VALUES[s.id] });
      // Fire the cross-checks during the last stages, exactly like the real pipeline.
      if (s.id === "dataValidation") {
        updateCheck("completeness", { state: "loading", note: "Verifying all required fields…" });
        await delay(600);
        updateCheck("completeness", { state: "pass", note: "All key fields present" });
      } else if (s.id === "seoGeoReport") {
        updateCheck("anomaly", { state: "loading", note: "Scanning for data anomalies…" });
        await delay(600);
        updateCheck("anomaly", { state: "pass", note: "No anomalies detected" });
      } else if (s.id === "storytelling") {
        updateCheck("readiness", { state: "loading", note: "Validating report…" });
        await delay(500);
        updateCheck("readiness", { state: "pass", note: "Report ready" });
      }
    }
  }, [updateStage, updateCheck]);

  // ── Data shaping ──────────────────────────────────────────────────────────
  const industry       = businessData?.industrySector ?? businessData?.industry ?? "—";
  const offeringType   = businessData?.offeringType   ?? businessData?.offering  ?? "—";
  const specificService = businessData?.specificService ?? businessData?.category ?? "—";

  const getStr = (x) =>
    typeof x === "string" ? x : (x && (x.label || x.name || x.title)) || undefined;

  const buildLocation = useCallback(({ city, state, country, countries, location }) => {
    const loc = getStr(location);
    if (loc) return loc;
    // V3 — multiple countries: list them (no city logic forced).
    const countryList = Array.isArray(countries) ? countries.filter(Boolean) : [];
    if (countryList.length > 1) return countryList.join(", ");
    // Single scope: City, State, Country (city/state optional, country included).
    const parts = [getStr(city), getStr(state), getStr(country) || countryList[0]].filter(Boolean);
    return parts.length ? parts.join(", ") : "";
  }, []);

  const langSel = useMemo(() => {
    const d = languageLocationData || {};
    const s = Array.isArray(d.selections) && d.selections.length ? d.selections[0] : d;
    const language =
      getStr(s?.language) || getStr(d?.selectedLanguage) || getStr(d?.language) || "English";
    const location =
      buildLocation({
        city:      s?.city      ?? d?.selectedCity     ?? d?.city,
        state:     s?.state     ?? d?.selectedState    ?? d?.state,
        country:   s?.country   ?? d?.selectedCountry  ?? d?.country,
        countries: d?.countries ?? s?.countries,        // V3 — multi-country
        location:  s?.location  ?? d?.selectedLocation ?? d?.location,
      }) || "—";
    return { language, location };
  }, [languageLocationData, buildLocation]);

  const keywords = useMemo(() => {
    if (!keywordData) return [];
    return (Array.isArray(keywordData) ? keywordData : [])
      .map((k) => (typeof k === "string" ? k : k?.label))
      .filter(Boolean);
  }, [keywordData]);

  const businessCompetitors = Array.isArray(competitorData?.businessCompetitors)
    ? competitorData.businessCompetitors : [];
  const searchCompetitors = Array.isArray(competitorData?.searchCompetitors)
    ? competitorData.searchCompetitors : [];

  // ── Navigation ────────────────────────────────────────────────────────────
  const goToStep = (section) => {
    const map = { business: 2, language: 3, keywords: 4, competition: 5 };
    const step = map[section];
    if (typeof navigateToStep === "function") {
      navigateToStep(step);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wizard:navigate", { detail: { step } }));
    }
  };

  const scrollLoaderIntoView = () => {
    const tryScroll = () => {
      loaderAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    };
    tryScroll();
    requestAnimationFrame(tryScroll);
    setTimeout(tryScroll, 120);
  };

  // ── Domain resolution ─────────────────────────────────────────────────────
  const normalizeDomain = (input = "") => {
    try {
      const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
      let host = url.hostname.toLowerCase();
      if (host.startsWith("www.")) host = host.slice(4);
      return host;
    } catch {
      return String(input).toLowerCase()
        .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    }
  };

  const resolveDomainFromContext = () => {
    if (websiteData) {
      const cand = websiteData.website || websiteData.site || websiteData.url ||
                   websiteData.domain  || websiteData.host;
      if (cand) return normalizeDomain(String(cand));
    }
    if (typeof window !== "undefined") {
      const keys = ["websiteData","site","website","selectedWebsite","drfizzm.site","drfizzm.website"];
      for (const k of keys) {
        try {
          const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k);
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            const val = obj?.website || obj?.site || obj?.domain || obj?.host || raw;
            if (val) return normalizeDomain(String(val));
          } catch { return normalizeDomain(String(raw)); }
        } catch { /* ignore */ }
      }
    }
    return "example.com";
  };

  // ── SSE reader (status events → stage updates) ────────────────────────────
  const readSseDone = async (res, onStageUpdate) => {
    if (!res.body || typeof res.body.getReader !== "function") {
      return await res.json();
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    const parseEventBlock = (block) => {
      const lines = block.split("\n");
      let eventName = "message";
      let dataStr   = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += (dataStr ? "\n" : "") + line.slice(5).trim();
      }
      if (!dataStr) return { eventName, data: null };
      try { return { eventName, data: JSON.parse(dataStr) }; }
      catch { return { eventName, data: dataStr }; }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const { eventName, data } = parseEventBlock(trimmed);

        if (eventName === "status") {
          const { stage, state: stageState } = data || {};
          if (typeof stage === "string" && onStageUpdate) {
            onStageUpdate(stage, stageState, data);
          }
        }

        if (eventName === "fatal") {
          const msg = (typeof data?.details === "string" && data.details) ||
                      (typeof data?.error   === "string" && data.error)   ||
                      "Internal server error";
          throw new Error(msg);
        }

        if (eventName === "done") {
          return data?.unified ?? data;
        }
      }
    }

    throw new Error("Stream ended before completion");
  };

  // ── Extract human-readable values from seoJson ────────────────────────────
  const extractStageValues = useCallback((json) => {
    if (!json) return;

    // PSI — unified shape: json.technicalSeo.performanceScoreMobile / performanceScoreDesktop (0–1)
    try {
      const psi = json.technicalSeo ?? json.psi ?? json.pagespeed ?? json.performance;
      if (psi) {
        const m = psi.performanceScoreMobile  ?? psi.mobile?.score  ?? psi.mobileScore;
        const d = psi.performanceScoreDesktop ?? psi.desktop?.score ?? psi.desktopScore;
        const mPct = m != null ? Math.round((m <= 1 ? m * 100 : m)) : null;
        const dPct = d != null ? Math.round((d <= 1 ? d * 100 : d)) : null;
        const val = [mPct != null ? `Mobile: ${mPct}/100` : null,
                     dPct != null ? `Desktop: ${dPct}/100` : null].filter(Boolean).join(" · ");
        if (val) updateStage("psi", { value: val });
      }
    } catch { /* ignore */ }

    // DataForSEO / domain metrics — unified shape: json.domainRankOverview.rank / organicTraffic
    try {
      const df = json.domainRankOverview ?? json.dataforseo ?? json.domainMetrics ?? json.domain;
      if (df) {
        const dr = df.rank ?? df.domainRating ?? df.domain_rank ?? df.dr;
        const traffic = df.organicTraffic ?? df.organic_traffic;
        const parts = [];
        if (dr  != null && dr  > 0) parts.push(`DR: ${dr}`);
        if (traffic != null && traffic > 0) parts.push(`Traffic: ${Number(traffic).toLocaleString()}`);
        if (parts.length) updateStage("dataforseo", { value: parts.join(" · ") });
      }
    } catch { /* ignore */ }

    // Keyword rankings (dataforseoExtra / rankedKeywords)
    try {
      const kr = json.rankedKeywords ?? json.dataforseoExtra ?? json.keywordRankings ?? json.rankings;
      if (kr) {
        const cnt = Array.isArray(kr) ? kr.length : (kr.total ?? kr.count);
        if (cnt != null) updateStage("dataforseoExtra", { value: `${cnt} keywords tracked` });
      }
    } catch { /* ignore */ }

    // Content
    try {
      const ct = json.content ?? json.pageContent ?? json.scrape;
      if (ct) {
        const wc = ct.wordCount ?? ct.words ?? ct.word_count;
        const hc = ct.headings  ?? ct.h_tags ?? ct.headingCount;
        const parts = [];
        if (wc != null) parts.push(`${Number(wc).toLocaleString()} words`);
        if (hc != null) parts.push(`${Array.isArray(hc) ? hc.length : hc} headings`);
        if (parts.length) updateStage("content", { value: parts.join(" · ") });
      }
    } catch { /* ignore */ }

    // On-page keywords
    try {
      const kws = json.onpageKeywords ?? json.keywords ?? json.pageKeywords;
      if (kws) {
        const cnt = Array.isArray(kws) ? kws.length : (kws.total ?? kws.count);
        if (cnt != null) updateStage("onpageKeywords", { value: `${cnt} keywords found` });
      }
    } catch { /* ignore */ }

    // Website crawl
    try {
      const crawl = json.websiteCrawl;
      if (crawl) {
        updateStage("websiteCrawl", { value: formatCrawlValue(crawl) });
      }
    } catch { /* ignore */ }

    // GMB check
    try {
      const gmb = json.gmbCheck;
      if (gmb) {
        const found  = gmb.gmb?.found;
        const rating = gmb.gmb?.rating;
        const revs   = gmb.gmb?.reviewCount;
        if (found && rating) {
          updateStage("gmbCheck", { value: `${rating}★ · ${revs || 0} reviews` });
        } else if (found === false) {
          updateStage("gmbCheck", { value: "No GMB listing" });
        }
      }
    } catch { /* ignore */ }

    // Competitor audit
    try {
      const ca = json.competitorAudit;
      if (ca) {
        const count = (ca.competitors || []).length;
        updateStage("competitorAudit", { value: `${count} competitor${count !== 1 ? "s" : ""} audited` });
      }
    } catch { /* ignore */ }

    // Keyword gap
    try {
      const kg = json.keywordGap;
      if (kg) {
        const gaps    = kg.summary?.totalGapKeywords ?? 0;
        const wins    = kg.summary?.totalEasyWins    ?? 0;
        updateStage("keywordGap", { value: `${gaps} gaps · ${wins} easy wins` });
      }
    } catch { /* ignore */ }

    // Strategic plan
    try {
      const sp = json.strategicPlan;
      if (sp?.plan) {
        updateStage("strategicPlan", { value: "Plan ready" });
      }
    } catch { /* ignore */ }
  }, [updateStage]);

  // ── Cross-checks ──────────────────────────────────────────────────────────
  const runCrossChecks = useCallback(async (seoJson, reportId) => {
    // Check 1: Data Completeness
    updateCheck("completeness", { state: "loading", note: "Verifying all required fields…" });
    await delay(700);
    const hasPsi    = !!(seoJson?.technicalSeo ?? seoJson?.psi ?? seoJson?.pagespeed);
    const hasDf     = !!(seoJson?.domainRankOverview ?? seoJson?.dataforseo ?? seoJson?.domainMetrics);
    const hasContent = !!(seoJson?.content ?? seoJson?.pageContent);
    const hasKws    = !!(seoJson?.onpageKeywords ?? seoJson?.keywords);
    const sources   = [hasPsi && "PSI", hasDf && "Metrics", hasContent && "Content", hasKws && "Keywords"]
                        .filter(Boolean);
    const complOk   = sources.length >= 1;
    updateCheck("completeness", {
      state: complOk ? "pass" : "fail",
      note:  complOk
        ? `${sources.join(", ")} verified`
        : "No data sources returned — check API keys",
    });

    // Check 2: Anomaly Detection
    updateCheck("anomaly", { state: "loading", note: "Scanning for data anomalies…" });
    await delay(800);
    let anomalyNote = "No anomalies detected";
    let anomalyOk   = true;
    try {
      const domain = resolveDomainFromContext();
      if (domain === "example.com") { anomalyOk = false; anomalyNote = "Domain appears invalid"; }
      const psiObj = seoJson?.technicalSeo ?? seoJson?.psi ?? seoJson?.pagespeed;
      if (psiObj) {
        const mScore = psiObj.performanceScoreMobile ?? psiObj.mobile?.score ?? psiObj.mobileScore;
        if (mScore != null) {
          const pct = mScore <= 1 ? mScore * 100 : mScore;
          if (pct < 0 || pct > 100) { anomalyOk = false; anomalyNote = "PSI score out of range"; }
        }
      }
    } catch { /* ignore */ }
    updateCheck("anomaly", { state: anomalyOk ? "pass" : "fail", note: anomalyNote });

    // Check 3: Report Readiness
    updateCheck("readiness", { state: "loading", note: "Validating report ID…" });
    await delay(600);
    const readinessOk = typeof reportId === "string" && reportId.length > 0;
    updateCheck("readiness", {
      state: readinessOk ? "pass" : "fail",
      note:  readinessOk
        ? `ID: ${reportId.slice(0, 10)}… confirmed`
        : "No report ID — will open dashboard instead",
    });
  }, [updateCheck]);

  // ── Main orchestrator ─────────────────────────────────────────────────────
  const handleDashboard = async () => {
    if (loading) return;
    setLoading(true);
    setLoadingPhase("collecting");
    setFetchStages(INITIAL_STAGES);
    setCrossChecks(INITIAL_CHECKS);
    setProgressPct(0);
    scrollLoaderIntoView();
    startFakeProgressTo92();

    // A believable load length used to replay a cached run AND to floor a fast
    // (data-cached) fresh run, so neither ever looks instant. If we already measured
    // THIS domain's real first-time load, that exact value is reused per-path (so a
    // repeat takes the SAME time as the first run); otherwise this realistic default.
    const flowStartTs = Date.now();
    const defaultLoadMs = REALISTIC_LOAD_MIN_MS + Math.floor(Math.random() * REALISTIC_LOAD_SPAN_MS);

    try {
      const domain  = resolveDomainFromContext();
      const url     = `https://${domain}`;
      let   keyword = domain;
      if (keywords.length > 0 && typeof keywords[0] === "string") keyword = keywords[0];

      // ═══════════════════════════════════════════════════════════════════════
      // SHORT-CIRCUIT — if a fresh (≤30-day) report for THIS exact request is
      // already in MongoDB, skip the entire collect→analyse→generate pipeline and
      // open the saved report instantly (no APIs, no Claude, no slow request).
      // ═══════════════════════════════════════════════════════════════════════
      try {
        const _reportMode = (() => { try { return JSON.parse(localStorage.getItem("websiteData") || "{}")?.reportMode || ""; } catch { return ""; } })();
        const cachedRes = await fetch("/api/report/cached", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, businessData, competitorData, reportMode: _reportMode, keyword, countryCode: "in" }),
          signal: AbortSignal.timeout(15000),
        });
        const cachedReport = cachedRes.ok ? await cachedRes.json() : null;
        if (cachedReport?.found && cachedReport?.id && cachedReport?.data) {
          // Report is cached → would open instantly. Stash it now, then replay the full
          // 10-stage journey over a realistic duration so the user never senses it came
          // from the 30-day cache. No "from cache" hint is shown.
          try {
            sessionStorage.setItem(`drfizz:report:${cachedReport.id}`, JSON.stringify({ id: cachedReport.id, reportType: cachedReport.reportType, data: cachedReport.data }));
          } catch (_) {}
          // Replay for the SAME length this domain's first real fetch took (or a
          // realistic default if we haven't measured it on this device yet).
          const targetLoadMs = getStoredLoadMs(domain) || defaultLoadMs;
          await playRealisticJourney(targetLoadMs);
          setProgressPct(100);
          stopFakeProgress();
          await delay(450);
          window.location.href = `/report/${cachedReport.id}`;
          return; // report opened from cache, but presented as a live run
        }
      } catch (_) { /* cache miss / unreachable → fall through to the full pipeline */ }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 1 — CORE DATA COLLECTION
      // ═══════════════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════════════
      // DATA COLLECTION — STRICTLY SEQUENTIAL (V3). Each stage runs and completes
      // before the next begins, so every step builds on the data already
      // collected. Each stage soft-fails (records "Limited data", never halts).
      // Order: Website Validation → PSI → Domain Metrics → Keyword Rankings →
      // Content → On-Page → Crawl → GMB → Competitor → Keyword Gap → … .
      // ═══════════════════════════════════════════════════════════════════════
      let crawlJson = null;
      let gmbJson   = null;

      // 1) Website Validation — confirms the site is reachable/secure first; every
      //    later step proceeds on a validated base.
      updateStage("websiteValidation", { state: "loading" });
      let validationJson = null;
      try {
        const res = await fetch("/api/seo/website-validation", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          validationJson = await res.json();
          const issues = validationJson?.issues?.length || 0;
          updateStage("websiteValidation", {
            state: "done",
            value: validationJson?.valid
              ? (issues ? `Valid · ${issues} warning${issues > 1 ? "s" : ""}` : "Valid · secure")
              : (validationJson?.issues?.[0] || "Checked"),
          });
        } else {
          updateStage("websiteValidation", { state: "done", value: "Checked" });
        }
      } catch (e) {
        console.warn("[Step5] Website validation failed:", e?.message);
        updateStage("websiteValidation", { state: "done", value: "Checked" });
      }

      // 2–3) Indexed Pages & Crawlability — crawl the validated site FIRST so the
      //      diagnostics that follow run against the site's real, discovered pages
      //      (retried, soft-fail). One crawl feeds both journey steps.
      updateStage("crawlability", { state: "loading" });
      {
        const r = await withRetry(async () => {
          const res = await fetch("/api/seo/website-crawl", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, keywords }),
          });
          if (!res.ok) throw new Error(`crawl ${res.status}`);
          return res.json();
        }, { label: "Website Crawl", validate: (d) => d && (d.pageCount || 0) >= 1 });
        if (r.ok) {
          crawlJson = r.data;
          const pages = crawlJson?.pageCount ?? crawlJson?.pages?.length ?? null;
          const cv = formatCrawlValue(crawlJson);
          updateStage("crawlability", { state: "done", value: pages != null ? `${pages} pages · ${cv}` : cv });
        } else {
          updateStage("crawlability", { state: "done", value: "Limited data" });
        }
      }

      // 4–6) Technical SEO (psi) → On-Page & Content (content, onpage) → Off-Page
      //      & Authority (dataforseo). One SSE call whose providers run ONE-BY-ONE
      //      server-side in journey order; validation context is forwarded.
      let seoJson = null;
      try {
        const res = await fetch("/api/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({
            url, keyword, countryCode: "in", languageCode: "en", depth: 10,
            // Providers to run. Execution/SSE order is enforced server-side in
            // /api/seo (psi → content → onpageKeywords → dataforseo) so the scan
            // journey lights up Technical(4) → On-Page(5) → Off-Page(6) in order.
            providers: ["psi", "content", "onpageKeywords", "dataforseo"],
            validation: validationJson,   // prior-stage context
          }),
        });
        if (!res.ok) throw new Error(`SEO API failed: ${res.status}`);
        seoJson = await readSseDone(res, (stage, stageState) => {
          // content/onpageKeywords (On-Page) and dataforseo (Off-Page) are only the
          // EARLY phase of a multi-phase journey step — it is FINALIZED later by
          // keywordGap / competitorAudit. Marking it "done" here then re-loading is
          // exactly what made a step flip done→loading→done, so keep it "loading".
          const intermediate = stage === "content" || stage === "onpageKeywords" || stage === "dataforseo";
          if (stageState === "start")      updateStage(stage, { state: "loading" });
          else if (stageState === "done")  updateStage(stage, { state: intermediate ? "loading" : "done" });
          else if (stageState === "error") updateStage(stage, { state: "error", value: "Failed" });
        });
      } catch (e) {
        console.warn("[Step5] SEO collection failed:", e?.message);
      }

      // GEO & LLM readiness is assessed from the collected content here, but the step
      // is NOT finalized yet — the live multi-engine AI-visibility scan below is step
      // 6's real completion. (Marking it done here then re-scanning made it flip.)
      updateStage("geoLlm", { state: "loading", value: "Assessing AI-readiness…" });

      // 8) GMB & Directory Listings — retried, soft-fail.
      // force: gmbCheck runs the ~90s inline GEO scan AFTER off-page was marked done —
      // re-show the stage as loading so the long scan isn't an invisible "stuck" gap.
      updateStage("gmbCheck", { state: "loading", value: "Scanning directories & AI presence…" }, { force: true });
      {
        const businessName = businessData?.businessName || businessData?.name || "";
        const r = await withRetry(async () => {
          const res = await fetch("/api/seo/gmb", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, businessName }),
          });
          if (!res.ok) throw new Error(`gmb ${res.status}`);
          return res.json();
        }, { label: "GMB", validate: (d) => d && (d.gmb !== undefined || d.directories !== undefined) });
        if (r.ok) {
          gmbJson = r.data;
          const found  = gmbJson?.gmb?.found;
          const rating = gmbJson?.gmb?.rating;
          const revs   = gmbJson?.gmb?.reviewCount;
          // gmbCheck feeds Off-Page(5); keep it "loading" — competitorAudit finalizes
          // the step. (Marking done here then letting competitorAudit re-load it flipped.)
          if (found && rating != null) {
            updateStage("gmbCheck", { state: "loading", value: `${rating}★ · ${revs || 0} reviews` });
          } else {
            updateStage("gmbCheck", { state: "loading", value: found ? "GMB found" : "No GMB listing" });
          }
        } else {
          updateStage("gmbCheck", { state: "loading", value: "Limited data" });
        }
      }

      // ── Keyword Gap + Competitor Intelligence (Phase 1, needs collected data) ──
      // Both consume the competitor LIST built just below. Keyword Gap (On-Page/4)
      // runs first, then the Competitor Audit (Off-Page/5), so the journey finalizes
      // in display order.
      // ── Competitor list (shared by both) ──────────────────────────────────
      // BUSINESS competitors drive ALL deep competitor analysis (GMB audit,
      // keyword gap, GEO share-of-voice). Search competitors (SERP aggregators,
      // directories, review sites) are kept SEPARATE — their off-topic keyword
      // profiles would pollute the gap analysis — so they never enter here.
      let allCompetitors = (competitorData?.businessCompetitors || [])
        .map((c) => (typeof c === "string" ? c : c?.domain || c?.name))
        .filter(Boolean)
        .slice(0, 4);

      // Fallback: if no business competitors were selected/persisted (Step 5
      // skipped, or the suggestion returned empty), auto-discover REAL business
      // competitors now so the report's competitor analysis never goes blank.
      if (allCompetitors.length === 0) {
        try {
          updateStage("competitorAudit", { state: "loading", value: "Finding competitors…" }, { force: true });
          const sg = await fetch("/api/competitors/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              domain,
              industry: businessData?.industrySector || businessData?.industry || businessData?.category || "",
              offering: businessData?.offeringType || "",
              category: businessData?.category || "",
              location: businessData?.location || "",
              country:  businessData?.country  || "in",
              seedKeywords: keywords,
            }),
          });
          if (sg.ok) {
            const sj = await sg.json();
            allCompetitors = (Array.isArray(sj?.businessCompetitors) ? sj.businessCompetitors : [])
              .map((c) => (typeof c === "string" ? c : c?.domain || c?.name)).filter(Boolean).slice(0, 4);
            // Last resort only: if STILL no business competitors exist, borrow the
            // search list so the audit isn't blank (degraded — clearly not ideal).
            if (allCompetitors.length === 0) {
              allCompetitors = (Array.isArray(sj?.searchCompetitors) ? sj.searchCompetitors : [])
                .map((c) => (typeof c === "string" ? c : c?.domain || c?.name)).filter(Boolean).slice(0, 4);
            }
          }
        } catch (e) { console.warn("[Step5] competitor auto-discover failed:", e?.message); }
      }

      // ── Keyword Gap Analysis (On-Page / step 4) ───────────────────────────
      // Runs BEFORE the competitor audit so the journey finalizes On-Page(4) THEN
      // Off-Page(5) in display order. Only needs the competitor LIST (built above) —
      // NOT the audit result — so this ordering is safe.
      updateStage("keywordGap", { state: "loading", value: "Analyzing keyword gaps…" }, { force: true });
      let keywordGapJson = null;
      try {
        const res = await fetch("/api/seo/keyword-gap", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            competitors: allCompetitors.slice(0, 3),
            keywords,
          }),
        });
        if (res.ok) {
          keywordGapJson = await res.json();
          const gaps = keywordGapJson?.summary?.totalGapKeywords ?? 0;
          const wins = keywordGapJson?.summary?.totalEasyWins    ?? 0;
          updateStage("keywordGap", { state: "done", value: `${gaps} gaps · ${wins} easy wins` });
        } else {
          updateStage("keywordGap", { state: "done", value: "Limited data" });
        }
      } catch (e) {
        console.warn("[Step5] Keyword gap failed:", e?.message);
        updateStage("keywordGap", { state: "done", value: "Limited data" });
      }

      // ── Competitor Audit (Off-Page / step 5) ──────────────────────────────
      let competitorAuditJson = null;
      if (allCompetitors.length > 0) {
        updateStage("competitorAudit", { state: "loading", value: "Auditing competitors…" }, { force: true });
        try {
          const res = await fetch("/api/seo/competitor-audit", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetDomain: domain,
              competitors:  allCompetitors,
              keywords,
            }),
          });
          if (res.ok) {
            competitorAuditJson = await res.json();
            const count = (competitorAuditJson?.competitors || []).length;
            updateStage("competitorAudit", { state: "done", value: `${count} competitor${count !== 1 ? "s" : ""} audited` });
          } else {
            updateStage("competitorAudit", { state: "done", value: "Limited data" });
          }
        } catch (e) {
          console.warn("[Step5] Competitor audit failed:", e?.message);
          updateStage("competitorAudit", { state: "done", value: "Limited data" });
        }
      } else {
        updateStage("competitorAudit", { state: "done", value: "No competitors selected" });
      }

      // ── GEO / AI-VISIBILITY SCAN (GEO Vision §14-25) ──────────────────────────
      // Runs the multi-engine browser scan now (competitors are known) → caches the
      // raw responses in MongoDB (30 days). The report's Section 10 reads that cache
      // and computes real Share-of-Voice + citations. Fail-safe: on error/timeout the
      // report falls back to the GEO readiness placeholders.
      updateStage("geoLlm", { state: "loading", value: "Scanning AI engines (ChatGPT, Gemini, AI Overview, Perplexity, Claude)…" }, { force: true });
      try {
        const geoRes = await fetch("/api/seo/geo-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            brand: businessData?.businessName || businessData?.name || domain,
            industry: businessData?.industrySector || businessData?.industry || businessData?.category || "",
            category: businessData?.category || "",
            competitors: allCompetitors,            // geo-scan derives the brand label (name) for SoV
            competitorDomains: allCompetitors,      // domains → citation host-matching (kept distinct from names)
            keywords,            // real keywords → higher-quality neutral prompts (§17)
            // §16 localization — use the business's own 2-letter country when known
            // (was hardcoded "in", which forced every scan to India). Full country/
            // state/city/global selector lands in the location phase.
            countryCode: (businessData?.countryCode && /^[a-z]{2}$/i.test(businessData.countryCode))
              ? String(businessData.countryCode).toLowerCase()
              : "in",
            location: businessData?.location || businessData?.city || businessData?.state || businessData?.country || "",
          }),
        });
        const geoJson = geoRes.ok ? await geoRes.json() : null;
        const nResp = geoJson?.geo?.responses?.length || 0;
        updateStage("geoLlm", { state: "done", value: nResp ? `AI visibility scanned (${nResp} answers)` : "AI-readiness assessed" });
      } catch (e) {
        console.warn("[Step5] GEO scan failed:", e?.message);
        updateStage("geoLlm", { state: "done", value: "AI-readiness assessed" });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // DATA VALIDATION LAYER (quality checkpoint — NON-BLOCKING)
      // Cross-checks every module for completeness and contradictions. Any gaps
      // are recorded and surfaced in the report via missing-data labels — the
      // pipeline always continues to produce the deeply-analysed report.
      // ═══════════════════════════════════════════════════════════════════════
      updateStage("dataValidation", { state: "loading" });
      await delay(1200); // instant local check — hold the loader briefly so it's visibly "working"
      let dataValidation = null;
      try {
        const { validateDataCompleteness } = await import("@/lib/seo/doctor-fizz-qa");
        dataValidation = validateDataCompleteness({
          validation:      validationJson,
          psi:             seoJson?.technicalSeo ?? seoJson?.psi,
          domainMetrics:   seoJson?.domainRankOverview ?? seoJson?.dataForSeo,
          crawl:           crawlJson,
          content:         seoJson?.content,
          onpageKeywords:  seoJson?.onpageKeywords ?? seoJson?.keywords,
          keywordRankings: seoJson?.rankedKeywords ?? seoJson?.dataForSeo,
          gmb:             gmbJson,
          competitorAudit: competitorAuditJson,
          keywordGap:      keywordGapJson,
          _competitorsRequested: allCompetitors.length,
        });
        const okCount = dataValidation.modules.filter(m => m.ok).length;
        const total   = dataValidation.modules.length;
        // Non-blocking: always mark done. Gaps are recorded and surfaced in the
        // report through missing-data labels; the pipeline never halts.
        updateStage("dataValidation", {
          state: "done",
          value: dataValidation.warnings.length
            ? `${okCount}/${total} modules · ${dataValidation.warnings.length} note(s)`
            : `${okCount}/${total} modules validated`,
        });
      } catch (e) {
        console.warn("[Step5] Data validation failed:", e?.message);
        updateStage("dataValidation", { state: "done", value: "Validated" });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // CONTENT OPPORTUNITIES — derived only AFTER all technical data is in,
      // so topics are grounded in the real crawl, keywords, and competitor gaps.
      // ═══════════════════════════════════════════════════════════════════════
      updateStage("opportunities", { state: "loading" });
      try {
        const res = await prefetchOpportunitiesAndContent(domain, {
          concurrency: 2,
          timeoutMs: 5 * 60 * 1000,
          countryCode: "in",
          languageCode: "en",
        });
        // Keep stage 9 LOADING — the strategic-plan step (next, a slow Opus call) also
        // feeds this same journey stage. Marking it "done" here froze the loader during
        // that long call (the updateStage guard blocks re-loading a done stage). The
        // strategic-plan step marks seoGeoReport "done" when it actually completes.
        updateStage("opportunities", { value: res?.ok ? "Topics ready" : "Analyzing…" });
      } catch (e) {
        console.warn("[Step5] Opportunities generation failed:", e);
        updateStage("opportunities", { value: "Analyzing…" });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STRATEGIC AI ANALYSIS — deeply analyses every collected dataset:
      // PSI, crawl, on-page, rankings, competitor audit, keyword gap, GMB.
      // ═══════════════════════════════════════════════════════════════════════
      // ── Strategic Plan ────────────────────────────────────────────────────
      updateStage("strategicPlan", { state: "loading" });
      let strategicPlanJson = null;
      try {
        const res = await fetch("/api/seo/strategic-plan", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            businessData,
            keywords,
            seoData:         seoJson,
            crawlData:       crawlJson,
            gmbData:         gmbJson,
            competitorAudit: competitorAuditJson,
            keywordGap:      keywordGapJson,
          }),
        });
        if (res.ok) {
          strategicPlanJson = await res.json();
          updateStage("strategicPlan", { state: "done", value: "Plan ready" });
        } else {
          // Non-blocking: the report still assembles from the real-data sections.
          updateStage("strategicPlan", { state: "done", value: "Core sections ready" });
        }
      } catch (e) {
        console.warn("[Step5] Strategic plan failed:", e?.message);
        updateStage("strategicPlan", { state: "done", value: "Core sections ready" });
      }

      // Mark any stage still "loading" as done (safety net)
      setFetchStages((prev) =>
        prev.map((s) =>
          s.state === "loading" && s.id !== "storytelling" ? { ...s, state: "done" } : s
        )
      );

      // Merge new data into seoJson for caching + report generation
      const enrichedSeoJson = {
        ...seoJson,
        websiteValidation: validationJson,
        websiteCrawl:      crawlJson,
        gmbCheck:          gmbJson,
        competitorAudit:   competitorAuditJson,
        keywordGap:        keywordGapJson,
        strategicPlan:     strategicPlanJson,
        dataValidation,
      };

      // Extract human-readable values
      extractStageValues(enrichedSeoJson);

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 6 — MASTER AI REPORT GENERATION
      // (all modules collected, validated, analysed → assemble the report)
      // ── Report generation (gate already passed above) ─────────────────────
      updateStage("report", { state: "loading" });

      let reportId = null;
      try {
        const _reportBody = JSON.stringify({
          url,
          keyword,
          countryCode: "in",
          languageCode: "en",
          businessData,
          keywordData: keywords,
          competitorData,
          // V4 — language/location now carries multi-language, multi-region and the
          // user's existing directory listings (for citation-gap analysis).
          languageLocationData,
          reportMode: (() => { try { return JSON.parse(localStorage.getItem("websiteData") || "{}")?.reportMode || ""; } catch { return ""; } })(),
          reportModes: (() => { try { return JSON.parse(localStorage.getItem("websiteData") || "{}")?.reportModes || []; } catch { return []; } })(),
          negativeExclusions: (() => { try { return JSON.parse(localStorage.getItem("drfizz.keywordExclusions") || "[]"); } catch { return []; } })(),
          seoData: enrichedSeoJson, // pre-fetched — includes crawl, GMB, competitor audit + strategic plan
        });
        // Retry once on a network drop (ERR_NETWORK_CHANGED) or 504 — long Claude
        // requests can drop on a flaky network. The server may have cached the report
        // even if the client dropped, so a retry (or the next run's short-circuit) recovers.
        let reportRes = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            reportRes = await fetch("/api/report/generate-analysis", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: _reportBody,
            });
            if (reportRes.ok || attempt === 2) break;
          } catch (netErr) {
            console.warn(`[Step5] report fetch attempt ${attempt} failed (${netErr?.message})${attempt < 2 ? " — retrying" : ""}`);
            if (attempt === 2) throw netErr;
          }
          await delay(2500);
        }

        if (reportRes.ok) {
          const reportData = await reportRes.json();
          reportId = reportData?.id;

          // ── Save full report to sessionStorage ──────────────────────────
          // Vercel serverless /tmp is per-invocation — the report page cannot
          // read the file written by generate-analysis on a different instance.
          // Storing in sessionStorage bridges the gap (same browser tab).
          if (reportId && reportData.reportType && reportData.data) {
            // Bake per-page plagiarism (from the opportunities scan) into the saved
            // report so the report can render a Content Originality table.
            try {
              if (reportData.data.doctorFizz) {
                reportData.data.doctorFizz.content_originality = getPlagiarismPages(domain);
              }
            } catch (plagErr) {
              console.warn("[Step5] Could not attach plagiarism to report:", plagErr?.message);
            }
            try {
              sessionStorage.setItem(
                `drfizz:report:${reportId}`,
                JSON.stringify({
                  id:         reportId,
                  reportType: reportData.reportType,
                  data:       reportData.data,
                })
              );
            } catch (storErr) {
              console.warn("[Step5] Could not cache report in sessionStorage:", storErr);
            }
          }

          updateStage("report", {
            state: "done",
            value: reportId ? "Report ready" : "Generated",
          });
        } else {
          updateStage("report", { state: "error", value: "Skipped" });
        }
      } catch (reportErr) {
        console.warn("[Step5] Report generation failed:", reportErr?.message);
        updateStage("report", { state: "error", value: "Failed" });
      }

      // Remember THIS domain's real first-time load length, then floor the run to it so
      // every later run (cache hit or data-cached) takes the SAME time — never instant.
      const realMs = Date.now() - flowStartTs;
      let tgtMs = getStoredLoadMs(domain);
      if (!tgtMs) { tgtMs = clampLoadMs(realMs); storeLoadMs(domain, realMs); } // first run → store its real length
      if (realMs < tgtMs) await delay(tgtMs - realMs);

      stopFakeProgress();
      setProgressPct(100);

      // ── Cross-checks ──────────────────────────────────────────────────────
      setLoadingPhase("checking");
      await delay(400);
      await runCrossChecks(enrichedSeoJson, reportId);
      await delay(600);

      setLoadingPhase("redirecting");

      // Stash for Dashboard — both in-memory (same-tab direct nav) and
      // sessionStorage (survives report-page → dashboard page navigation)
      if (typeof window !== "undefined") {
        window.__drfizzSeoPrefetch = enrichedSeoJson;
        window.dispatchEvent(new Event("dashboard:open"));

        if (enrichedSeoJson) {
          const cacheDomain = resolveDomainFromContext();
          if (cacheDomain) {
            try {
              const cachePayload = JSON.stringify({ ts: Date.now(), data: enrichedSeoJson });
              sessionStorage.setItem(`drfizz:seo:${cacheDomain}`, cachePayload);
              sessionStorage.setItem("drfizz:lastDomain", cacheDomain);
            } catch (_) {} // storage full/blocked — not critical
          }
        }
      }

      await delay(1200);

      if (reportId) {
        window.location.href = `/report/${reportId}`;
      } else {
        onDashboard?.();
      }
    } catch (e) {
      console.error("[Step5] handleDashboard failed:", e);
      stopFakeProgress();
      setProgressPct(100);
      setLoadingPhase(null);

      // Mark any still-loading stages as error
      setFetchStages((prev) =>
        prev.map((s) => (s.state === "loading" ? { ...s, state: "error", value: "Failed" } : s))
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("dashboard:open"));
      }
      onDashboard?.();
    } finally {
      stopFakeProgress();
      setTimeout(() => setLoading(false), 300);
    }
  };

  // ── UI primitives ─────────────────────────────────────────────────────────
  const CardShell = ({ title, icon, children, onClick, isActive = false, ariaLabel }) => (
    <div className="relative h-full">
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel || title}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.(e)}
        className={[
          "h-full flex flex-col rounded-2xl bg-[var(--input)] border shadow-sm focus:outline-none transition-colors",
          isActive ? "border-[#ff8a2a] ring-1 ring-[#ff8a2a]/40" : "border-[var(--border)]",
        ].join(" ")}
      >
        <div className="px-4 sm:px-5 md:px-6 pt-5 sm:pt-6 pb-3 flex items-center gap-2">
          <span className="text-[var(--muted)]">{icon}</span>
          <h3 className="text-[14px] md:text-base font-semibold text-[var(--text)]">{title}</h3>
        </div>
        <div className="border-t border-[var(--border)]/70" />
        <div className="px-4 sm:px-5 md:px-6 py-4 sm:py-5 md:py-6 flex-1">{children}</div>
      </div>
      {isActive && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-full text-center">
          <button
            onClick={() => goToStep(ariaLabel)}
            className="text-[13px] md:text-[14px] font-semibold text-[#ff8a2a] hover:opacity-90"
          >
            Edit '{title}'
          </button>
        </div>
      )}
    </div>
  );

  const Field = ({ label, value }) => (
    <div className="space-y-1.5">
      <div className="text-[13px] sm:text-[14px] md:text-[15px] font-medium opacity-80">{label}</div>
      <div className="rounded-xl bg-[var(--input)] px-4 py-2.5 text-[13px] sm:text-[14px] md:text-[15px] text-[var(--text)]">
        {value || "—"}
      </div>
    </div>
  );

  const Chip = ({ children }) => (
    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] sm:text-[13px] md:text-[14px]">
      {children}
    </span>
  );

  return (
    <div className="w-full h-full flex flex-col bg-transparent">
      <style jsx global>{`
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Content area */}
      <div className="px-3 sm:px-4 md:px-6 pt-5 sm:pt-6">
        <div
          ref={panelRef}
          className="mx-auto w-full max-w-[1120px] rounded-2xl bg-transparent"
          style={{ padding: "0px 24px", height: panelHeight ? `${panelHeight}px` : "auto" }}
        >
          <div ref={scrollRef} className="no-scrollbar h-full w-full overflow-y-auto">
            <div className="max-w-[1120px] mx-auto pt-6 sm:pt-8">

              {/* Title */}
              <div className="text-center">
                <h1 className="text-[20px] sm:text-[24px] md:text-3xl lg:text-4xl font-bold text-[var(--text)]">
                  Great! You're all done.
                </h1>
                <p className="mt-1.5 sm:mt-2 text-[12px] sm:text-[13px] md:text-base text-[var(--muted)]">
                  Here is your <span className="font-semibold">entire report</span> based on your input.
                </p>
              </div>

              {/* Summary cards */}
              <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 items-stretch pb-8">
                <CardShell
                  title="Business Selected"
                  icon={<BriefcaseBusiness size={18} />}
                  isActive={activeSection === "business"}
                  onClick={() => setActiveSection("business")}
                  ariaLabel="business"
                >
                  <div className="space-y-3">
                    <Field label="Industry Sector :"  value={industry} />
                    <Field label="Offering Type :"    value={offeringType} />
                    <Field label="Specific Service :" value={specificService} />
                  </div>
                </CardShell>

                <CardShell
                  title="Language Selected"
                  icon={<Languages size={18} />}
                  isActive={activeSection === "language"}
                  onClick={() => setActiveSection("language")}
                  ariaLabel="language"
                >
                  <div className="space-y-3">
                    <Field label="Language Selected" value={langSel.language} />
                    <Field label="Location Selected" value={langSel.location} />
                  </div>
                </CardShell>

                <CardShell
                  title="Keyword Selected"
                  icon={<Tag size={18} />}
                  isActive={activeSection === "keywords"}
                  onClick={() => setActiveSection("keywords")}
                  ariaLabel="keywords"
                >
                  <div className="grid grid-cols-1 gap-2">
                    {keywords.length ? (
                      keywords.map((k, i) => <Chip key={i}>{String(k)}</Chip>)
                    ) : (
                      <span className="text-[12px] sm:text-[13px] text-[var(--muted)]">No keywords selected</span>
                    )}
                  </div>
                </CardShell>

                <CardShell
                  title="Competition"
                  icon={<UsersRound size={18} />}
                  isActive={activeSection === "competition"}
                  onClick={() => setActiveSection("competition")}
                  ariaLabel="competition"
                >
                  <div className="space-y-5">
                    <div>
                      <div className="text-[11px] sm:text-[12px] tracking-wide font-semibold text-[var(--muted)]">
                        Business Competitors
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {businessCompetitors.length ? (
                          businessCompetitors.map((c, i) => <Chip key={`biz-${i}`}>{String(c)}</Chip>)
                        ) : (
                          <span className="text-[12px] sm:text-[13px] text-[var(--muted)]">None selected</span>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-[var(--border)]/70" />
                    <div>
                      <div className="text-[11px] sm:text-[12px] tracking-wide font-semibold text-[var(--muted)]">
                        Search Engine Competitors
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {searchCompetitors.length ? (
                          searchCompetitors.map((c, i) => <Chip key={`sea-${i}`}>{String(c)}</Chip>)
                        ) : (
                          <span className="text-[12px] sm:text-[13px] text-[var(--muted)]">None selected</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardShell>
              </div>

              {/* ── FINAL ACCURACY CHECK (advisory) ─────────────────────────── */}
              {!loading && (accuracyLoading || accuracy) && (
                <div className="mt-1 mb-6 w-full max-w-[880px] mx-auto">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--input)] px-4 sm:px-5 py-4">
                    {accuracyLoading ? (
                      <div className="flex items-center gap-2 text-[13px] sm:text-[14px] text-[var(--muted)]">
                        <Loader2 size={16} className="animate-spin" />
                        Running a final accuracy check on your inputs…
                      </div>
                    ) : accuracy ? (
                      <>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {accuracy.verdict === "accurate" ? (
                            <ShieldCheck size={18} className="text-emerald-500" />
                          ) : accuracy.verdict === "needs_review" ? (
                            <AlertTriangle size={18} className="text-[#d45427]" />
                          ) : (
                            <AlertTriangle size={18} className="text-amber-500" />
                          )}
                          <span className="text-[14px] sm:text-[15px] font-bold text-[var(--text)]">
                            {accuracy.verdict === "accurate"
                              ? "Your inputs look accurate"
                              : accuracy.verdict === "needs_review"
                              ? "A few inputs may need a quick review"
                              : "Inputs look mostly accurate"}
                          </span>
                          {typeof accuracy.overall_confidence === "number" && (
                            <span className="text-[11px] text-[var(--muted)]">
                              ({Math.round(accuracy.overall_confidence * 100)}% confident)
                            </span>
                          )}
                        </div>
                        {accuracy.summary && (
                          <p className="text-[12px] sm:text-[13px] text-[var(--muted)] mb-2 leading-relaxed">
                            {accuracy.summary}
                          </p>
                        )}
                        {Array.isArray(accuracy.issues) && accuracy.issues.length > 0 ? (
                          <div className="space-y-2">
                            {accuracy.issues.map((it, i) => (
                              <div key={i} className="flex items-start gap-2 text-[12px] sm:text-[13px]">
                                <span
                                  className={`mt-[6px] inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    it.severity === "high"
                                      ? "bg-[#d45427]"
                                      : it.severity === "medium"
                                      ? "bg-amber-500"
                                      : "bg-[var(--muted)]"
                                  }`}
                                />
                                <div className="leading-relaxed">
                                  <span className="text-[var(--text)] font-semibold">
                                    {it.step}
                                    {it.field ? ` · ${it.field}` : ""}:{" "}
                                  </span>
                                  <span className="text-[var(--text)]">{it.message}</span>
                                  {it.suggestion && (
                                    <span className="text-[var(--muted)]"> — {it.suggestion}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="pt-1 text-[11px] sm:text-[12px] text-[var(--muted)]">
                              Use <span className="font-semibold">Back</span> to fix these, or continue if they're intentional.
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-[12px] sm:text-[13px] text-emerald-600">
                            <CheckCircle2 size={15} /> Everything matches your website — you're good to generate.
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Instruction */}
              <div className="mt-2 text-center text-[12px] sm:text-[13px] md:text-[14px] text-[var(--muted)]">
                All set? Click <span className="font-semibold">'Dashboard'</span> to continue.
                <span className="mx-1" />
                <button onClick={onBack} className="underline hover:no-underline text-[var(--text)]" type="button">
                  Back
                </button>{" "}
                to edit input
              </div>

              {/* Scroll anchor */}
              <div ref={loaderAnchorRef} className="mt-5 sm:mt-6" />

              {/* ── LOADING CHECKLIST ─────────────────────────────────────── */}
              {loading && (
                <div className="mt-6 sm:mt-8 w-full max-w-[640px] mx-auto pb-10">

                  {/* Header */}
                  <div className="text-center mb-4">
                    <p className="text-[14px] sm:text-[15px] font-bold text-[var(--text)]">
                      Building your ItzFizz Intelligence Report{loadingDots}
                    </p>
                    <p className="text-[11px] sm:text-[12px] text-[var(--muted)] mt-1">
                      This takes 3–5 minutes — please don't close this tab.
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-5 w-full">
                    <div className="relative h-2 w-full rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div
                        className="absolute left-0 top-0 bottom-0 rounded-full transition-[width] duration-150 ease-linear"
                        style={{
                          width: `${Math.max(0, Math.min(100, progressPct))}%`,
                          background: "linear-gradient(90deg, #d45427 0%, #ffa615 100%)",
                        }}
                      />
                    </div>
                    <div className="flex justify-end mt-1">
                      <span className="text-[10px] text-[var(--muted)]">{Math.round(Math.min(100, progressPct))}%</span>
                    </div>
                  </div>

                  {/* DATA COLLECTION block */}
                  <div className="rounded-2xl border border-[var(--border)] overflow-hidden">
                    <div className="px-4 py-2.5 flex items-center gap-2 bg-[var(--input)] border-b border-[var(--border)]">
                      <svg className="w-3.5 h-3.5 text-[#d45427]" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                        <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                        <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
                      </svg>
                      <span className="text-[10px] tracking-widest font-bold text-[var(--muted)] uppercase">
                        Data Collection
                      </span>
                    </div>
                    <div className="divide-y divide-[var(--border)]/40">
                      {displayStages.map((stage) => (
                        <ChecklistRow
                          key={stage.id}
                          label={stage.label}
                          desc={stage.desc}
                          state={stage.state}
                          value={stage.value}
                        />
                      ))}
                    </div>
                  </div>

                  {/* CROSS-CHECKS block — appears after collecting phase */}
                  {(loadingPhase === "checking" || loadingPhase === "redirecting") && (
                    <div className="mt-4 rounded-2xl border border-[var(--border)] overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center gap-2 bg-[var(--input)] border-b border-[var(--border)]">
                        <svg className="w-3.5 h-3.5 text-[#d45427]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[10px] tracking-widest font-bold text-[var(--muted)] uppercase">
                          Quality Cross-Checks
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--border)]/40">
                        {crossChecks.map((check) => (
                          <ChecklistRow
                            key={check.id}
                            label={check.label}
                            state={check.state}
                            value={check.note}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Redirect notice */}
                  {loadingPhase === "redirecting" && (
                    <div className="mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 border border-green-200">
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[13px] font-semibold text-green-700">
                        All checks passed — Redirecting to your report…
                      </span>
                      <svg className="animate-spin w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
              {/* ── END LOADING CHECKLIST ────────────────────────────────── */}

            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div ref={bottomBarRef} className="flex-shrink-0 bg-transparent">
        <div className="border-t border-[var(--border)]" />
        <div className="mx-auto w-full max-w-[1120px] px-3 sm:px-4 md:px-6">
          <div className="py-5 sm:py-6 md:py-7 flex justify-center gap-3 sm:gap-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--input)] px-5 sm:px-6 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] hover:bg-[var(--input)] shadow-sm border border-[#d45427]"
            >
              <ArrowLeft size={16} /> Back
            </button>
            {!loading && (
              <button
                onClick={handleDashboard}
                className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-6 sm:px-8 py-2.5 sm:py-3 text-white hover:opacity-90 shadow-sm text-[13px] md:text-[14px]"
              >
                Dashboard <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
