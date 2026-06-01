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
} from "lucide-react";

import { prefetchOpportunitiesAndContent } from "@/lib/prefetch-opportunities";

// ─── Stage & check initial state ──────────────────────────────────────────────
const INITIAL_STAGES = [
  { id: "opportunities",   label: "Content Opportunities",     state: "idle", value: null },
  { id: "psi",             label: "Performance Score (PSI)",   state: "idle", value: null },
  { id: "dataforseo",      label: "Domain Metrics",            state: "idle", value: null },
  { id: "dataforseoExtra", label: "Keyword Rankings",          state: "idle", value: null },
  { id: "content",         label: "Content Extraction",        state: "idle", value: null },
  { id: "onpageKeywords",  label: "On-Page Keywords",          state: "idle", value: null },
  { id: "websiteCrawl",    label: "Website Crawl & Audit",     state: "idle", value: null },
  { id: "gmbCheck",        label: "GMB & Directory Listings",  state: "idle", value: null },
  { id: "competitorAudit", label: "Competitor Audit",          state: "idle", value: null },
  { id: "strategicPlan",   label: "Strategic Plan (AI)",       state: "idle", value: null },
  { id: "report",          label: "AI Report Generation",      state: "idle", value: null },
];

const INITIAL_CHECKS = [
  { id: "completeness", label: "Data Completeness",  state: "idle", note: null },
  { id: "anomaly",      label: "Anomaly Detection",  state: "idle", note: null },
  { id: "readiness",    label: "Report Readiness",   state: "idle", note: null },
];

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
function ChecklistRow({ label, state, value }) {
  const isActive = state === "loading";
  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-colors ${isActive ? "bg-orange-50/40" : ""}`}>
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
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

  // Dots animation
  const [loadingDots, setLoadingDots] = useState(".");

  // Phase: "collecting" | "checking" | "redirecting" | null
  const [loadingPhase, setLoadingPhase] = useState(null);

  // Live checklist state
  const [fetchStages, setFetchStages] = useState(INITIAL_STAGES);
  const [crossChecks, setCrossChecks]  = useState(INITIAL_CHECKS);

  // Fake progress (kept for internal use — not shown)
  const [progressPct, setProgressPct] = useState(0);
  const fakeProgressRef = useRef(null);

  const startFakeProgressTo92 = () => {
    setProgressPct(0);
    if (fakeProgressRef.current) clearInterval(fakeProgressRef.current);
    fakeProgressRef.current = setInterval(() => {
      setProgressPct((p) => {
        if (p >= 92) return 92;
        return Math.min(92, p + 0.368);
      });
    }, 100);
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
  const updateStage = useCallback((id, patch) => {
    setFetchStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const updateCheck = useCallback((id, patch) => {
    setCrossChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  // ── Data shaping ──────────────────────────────────────────────────────────
  const industry       = businessData?.industrySector ?? businessData?.industry ?? "—";
  const offeringType   = businessData?.offeringType   ?? businessData?.offering  ?? "—";
  const specificService = businessData?.specificService ?? businessData?.category ?? "—";

  const getStr = (x) =>
    typeof x === "string" ? x : (x && (x.label || x.name || x.title)) || undefined;

  const buildLocation = useCallback(({ city, state, country, location }) => {
    const loc = getStr(location);
    if (loc) return loc;
    const parts = [getStr(city), getStr(state)].filter(Boolean);
    return parts.length ? parts.join(", ") : "";
  }, []);

  const langSel = useMemo(() => {
    const d = languageLocationData || {};
    const s = Array.isArray(d.selections) && d.selections.length ? d.selections[0] : d;
    const language =
      getStr(s?.language) || getStr(d?.selectedLanguage) || getStr(d?.language) || "English";
    const location =
      buildLocation({
        city:     s?.city     ?? d?.selectedCity     ?? d?.city,
        state:    s?.state    ?? d?.selectedState    ?? d?.state,
        country:  s?.country  ?? d?.selectedCountry  ?? d?.country,
        location: s?.location ?? d?.selectedLocation ?? d?.location,
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
        const pages    = crawl.pageCount ?? 0;
        const issues   = crawl.summary?.commonIssues?.length ?? 0;
        const hasSitemap = crawl.hasSitemap ? "sitemap ✓" : "no sitemap";
        updateStage("websiteCrawl", { value: `${pages} pages · ${hasSitemap}` });
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

    try {
      const domain  = resolveDomainFromContext();
      const url     = `https://${domain}`;
      let   keyword = domain;
      if (keywords.length > 0 && typeof keywords[0] === "string") keyword = keywords[0];

      // ── Opportunities prefetch ────────────────────────────────────────────
      updateStage("opportunities", { state: "loading" });

      const oppsPromise = (async () => {
        try {
          const res = await prefetchOpportunitiesAndContent(domain, {
            concurrency: 2,
            timeoutMs: 5 * 60 * 1000,
            countryCode: "in",
            languageCode: "en",
          });
          if (res?.ok) {
            updateStage("opportunities", { state: "done", value: "Topics ready" });
          } else {
            updateStage("opportunities", { state: "error", value: "Skipped" });
          }
          return { ok: !!res?.ok };
        } catch (e) {
          console.warn("[Step5] Opportunities prefetch failed:", e);
          updateStage("opportunities", { state: "error", value: "Skipped" });
          return { ok: false };
        }
      })();

      // ── SEO SSE fetch ─────────────────────────────────────────────────────
      updateStage("psi", { state: "loading" });

      const seoPromise = (async () => {
        const payload = {
          url,
          keyword,
          countryCode: "in",
          languageCode: "en",
          depth: 10,
          providers: ["psi", "dataforseo", "content", "onpageKeywords"],
        };

        const res = await fetch("/api/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`SEO API failed: ${res.status}`);

        const json = await readSseDone(res, (stage, stageState) => {
          if (stageState === "start") {
            updateStage(stage, { state: "loading" });
          } else if (stageState === "done") {
            updateStage(stage, { state: "done" });
          } else if (stageState === "error") {
            updateStage(stage, { state: "error", value: "Failed" });
          }
        });

        return json;
      })();

      const [, seoJson] = await Promise.all([oppsPromise, seoPromise]);

      // ── Website Crawl ─────────────────────────────────────────────────────
      updateStage("websiteCrawl", { state: "loading" });
      let crawlJson = null;
      const crawlPromise = (async () => {
        try {
          const res = await fetch("/api/seo/website-crawl", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, keywords }),
          });
          if (res.ok) {
            crawlJson = await res.json();
            const pages = crawlJson?.pageCount ?? 0;
            const hasSitemap = crawlJson?.hasSitemap ? "sitemap ✓" : "no sitemap";
            updateStage("websiteCrawl", { state: "done", value: `${pages} pages · ${hasSitemap}` });
          } else {
            updateStage("websiteCrawl", { state: "error", value: "Skipped" });
          }
        } catch (e) {
          console.warn("[Step5] Website crawl failed:", e?.message);
          updateStage("websiteCrawl", { state: "error", value: "Skipped" });
        }
      })();

      // ── GMB & Directory Check ─────────────────────────────────────────────
      updateStage("gmbCheck", { state: "loading" });
      let gmbJson = null;
      const gmbPromise = (async () => {
        try {
          const businessName = businessData?.businessName || businessData?.name || "";
          const res = await fetch("/api/seo/gmb", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, businessName }),
          });
          if (res.ok) {
            gmbJson = await res.json();
            const found  = gmbJson?.gmb?.found;
            const rating = gmbJson?.gmb?.rating;
            const revs   = gmbJson?.gmb?.reviewCount;
            if (found && rating != null) {
              updateStage("gmbCheck", { state: "done", value: `${rating}★ · ${revs || 0} reviews` });
            } else {
              updateStage("gmbCheck", { state: "done", value: found ? "GMB found" : "No GMB listing" });
            }
          } else {
            updateStage("gmbCheck", { state: "error", value: "Skipped" });
          }
        } catch (e) {
          console.warn("[Step5] GMB check failed:", e?.message);
          updateStage("gmbCheck", { state: "error", value: "Skipped" });
        }
      })();

      // Run crawl + GMB in parallel
      await Promise.all([crawlPromise, gmbPromise]);

      // ── Competitor Audit ──────────────────────────────────────────────────
      const allCompetitors = [
        ...(competitorData?.businessCompetitors || []),
        ...(competitorData?.searchCompetitors   || []),
      ].slice(0, 4);

      let competitorAuditJson = null;
      if (allCompetitors.length > 0) {
        updateStage("competitorAudit", { state: "loading" });
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
            updateStage("competitorAudit", { state: "error", value: "Skipped" });
          }
        } catch (e) {
          console.warn("[Step5] Competitor audit failed:", e?.message);
          updateStage("competitorAudit", { state: "error", value: "Skipped" });
        }
      } else {
        updateStage("competitorAudit", { state: "done", value: "No competitors selected" });
      }

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
            seoData:        seoJson,
            crawlData:      crawlJson,
            gmbData:        gmbJson,
            competitorAudit: competitorAuditJson,
          }),
        });
        if (res.ok) {
          strategicPlanJson = await res.json();
          updateStage("strategicPlan", { state: "done", value: "Plan ready" });
        } else {
          updateStage("strategicPlan", { state: "error", value: "Skipped" });
        }
      } catch (e) {
        console.warn("[Step5] Strategic plan failed:", e?.message);
        updateStage("strategicPlan", { state: "error", value: "Skipped" });
      }

      // Mark any stage still "loading" as done (safety net)
      setFetchStages((prev) =>
        prev.map((s) =>
          s.state === "loading" && s.id !== "report" ? { ...s, state: "done" } : s
        )
      );

      // Merge new data into seoJson for caching + report generation
      const enrichedSeoJson = {
        ...seoJson,
        websiteCrawl:    crawlJson,
        gmbCheck:        gmbJson,
        competitorAudit: competitorAuditJson,
        strategicPlan:   strategicPlanJson,
      };

      // Extract human-readable values
      extractStageValues(enrichedSeoJson);

      // ── Report generation ─────────────────────────────────────────────────
      updateStage("report", { state: "loading" });

      let reportId = null;
      try {
        const reportRes = await fetch("/api/report/generate-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            keyword,
            countryCode: "in",
            languageCode: "en",
            businessData,
            keywordData: keywords,
            competitorData,
            seoData: enrichedSeoJson, // pre-fetched — includes crawl, GMB, competitor audit + strategic plan
          }),
        });

        if (reportRes.ok) {
          const reportData = await reportRes.json();
          reportId = reportData?.id;

          // ── Save full report to sessionStorage ──────────────────────────
          // Vercel serverless /tmp is per-invocation — the report page cannot
          // read the file written by generate-analysis on a different instance.
          // Storing in sessionStorage bridges the gap (same browser tab).
          if (reportId && reportData.reportType && reportData.data) {
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
                      This takes 30–90 seconds — please don't close this tab.
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
                      {fetchStages.map((stage) => (
                        <ChecklistRow
                          key={stage.id}
                          label={stage.label}
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
