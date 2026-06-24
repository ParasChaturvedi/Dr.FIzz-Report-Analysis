// src/components/StepSlide2.js
"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, ArrowLeft, ChevronDown, Loader2, Sparkles, Check } from "lucide-react";
import { prefetchOpportunitiesAndContent } from "@/lib/prefetch-opportunities";

// Built-in fallback lists — used only if the Claude website-analysis is unavailable,
// so the wizard never blocks. When analysis succeeds these are replaced by detailed,
// business-specific options (see /api/seo/business-taxonomy).
const FALLBACK_INDUSTRIES = [
  "Technology & Software",
  "Healthcare & Medical",
  "Retail & E-commerce",
  "Professional Services",
  "Food & Beverage",
  "Fashion & Apparel",
];
const FALLBACK_OFFERINGS = ["Services", "Products", "Digital/Software", "Hybrid - Multiple Types"];
const FALLBACK_CATEGORIES = [
  "Consulting & Advisory",
  "Marketing & Advertising",
  "Design & Creative",
  "Technology & IT Services",
  "Financial & Accounting",
  "Legal Services",
];

// Always present a trailing "Others" option (de-duped, case-insensitive).
const withOther = (arr, fallback = []) => {
  const base = (Array.isArray(arr) && arr.length ? arr : fallback).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const v of base) {
    const k = String(v).toLowerCase();
    if (k === "other" || k === "others" || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  out.push("Others");
  return out;
};

export default function StepSlide2({ onNext, onBack, onBusinessDataSubmit }) {
  // selections
  const [businessName, setBusinessName]         = useState("");
  // V4 — Industry stays single (it anchors the AI cascade + website detection);
  // Offering, Category and Business-Model Scope are MULTI-SELECT.
  const [selectedIndustry, setSelectedIndustry]     = useState("");
  const [selectedOfferings, setSelectedOfferings]   = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [customIndustry, setCustomIndustry]     = useState("");
  const [customOffering, setCustomOffering]     = useState("");
  const [customCategory, setCustomCategory]     = useState("");
  // V3 Part 3.2 — deeper business definition (all optional; feed relevance + geography logic)
  const [coreServices, setCoreServices]   = useState("");   // comma-separated
  const [revenueOffers, setRevenueOffers] = useState("");
  const [buyerType, setBuyerType]         = useState("");
  const [businessScopes, setBusinessScopes] = useState([]); // Local | Regional | National | International (multi)

  // ── Claude-powered dynamic dropdown options (analyzed from the Step-1 website) ──
  const [industryOptions, setIndustryOptions] = useState(() => withOther(FALLBACK_INDUSTRIES));
  const [offeringOptions, setOfferingOptions] = useState(() => withOther(FALLBACK_OFFERINGS));
  const [categoryOptions, setCategoryOptions] = useState(() => withOther(FALLBACK_CATEGORIES));
  const [taxoLoading, setTaxoLoading] = useState({ industry: false, offering: false, category: false });
  const [detected, setDetected] = useState(null);    // { industry, offering, category, confidence, ... }
  const taxoContextRef = useRef("");                 // business context string passed to cascade calls
  const detectedRef = useRef(null);                  // detected profile (stable inside handlers)
  const analyzedDomainRef = useRef("");

  // UI state
  const [showSummary, setShowSummary] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  // fixed height like Step1Slide1
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomBarRef = useRef(null);
  const tailRef = useRef(null); // <-- anchor for auto-scroll-to-bottom
  const [panelHeight, setPanelHeight] = useState(null);

  // remember last submitted payload
  const lastSubmittedData = useRef(null);

  // ensures we don't kick prefetch multiple times from this screen
  const didKickPrefetchRef = useRef(false);

  /* ---------------- Fixed panel height (Step1 pattern) ---------------- */
  const recomputePanelHeight = () => {
    if (!panelRef.current) return;
    const vpH = window.innerHeight;
    const barH = bottomBarRef.current?.getBoundingClientRect().height ?? 0;
    const topOffset = panelRef.current.getBoundingClientRect().top;
    const paddingGuard = 24;
    const h = Math.max(360, vpH - barH - topOffset - paddingGuard);
    setPanelHeight(h);
  };

  useEffect(() => {
    recomputePanelHeight();
    const ro = new ResizeObserver(recomputePanelHeight);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", recomputePanelHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recomputePanelHeight);
    };
  }, []);

  useEffect(() => {
    recomputePanelHeight();
  }, [showSummary, selectedIndustry, selectedOfferings, selectedCategories]);

  /* ---------------- Helpers ---------------- */
  const getDomainFromStorage = () => {
    try {
      const raw = localStorage.getItem("websiteData");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      return (parsed?.site || "").trim();
    } catch {
      return "";
    }
  };

  /* ---------------- Step-1 website analysis → smart dropdown options ---------------- */
  // On mount, deeply analyze the entered website with Claude and populate the Industry
  // dropdown (most-likely first) + pre-load the detected path's Offering/Category lists
  // + pre-fill the optional Core Services / Scope. Cached per-domain in sessionStorage.
  useEffect(() => {
    const domain = getDomainFromStorage();
    if (!domain || analyzedDomainRef.current === domain) return;
    let cancelled = false;

    const applyIndustry = (data) => {
      if (cancelled || !data) return;
      analyzedDomainRef.current = domain;
      if (Array.isArray(data.industries) && data.industries.length) setIndustryOptions(withOther(data.industries, FALLBACK_INDUSTRIES));
      if (Array.isArray(data.offerings) && data.offerings.length) setOfferingOptions(withOther(data.offerings, FALLBACK_OFFERINGS));
      if (Array.isArray(data.categories) && data.categories.length) setCategoryOptions(withOther(data.categories, FALLBACK_CATEGORIES));
      if (data.detected) { setDetected(data.detected); detectedRef.current = data.detected; }
      taxoContextRef.current = [data.detected?.primary_offering, (data.core_services || []).join(", ")].filter(Boolean).join(" — ");
      // pre-fill optional fields ONLY if the user hasn't typed anything
      if (Array.isArray(data.core_services) && data.core_services.length) setCoreServices((prev) => prev || data.core_services.join(", "));
      if (data.detected?.business_scope) setBusinessScopes((prev) => (prev.length ? prev : [data.detected.business_scope]));
      // auto-select a confident detection so the Offering list (already loaded) is ready —
      // fully changeable by the user.
      if (data.detected?.industry && (data.detected.confidence ?? 0) >= 0.6) {
        setSelectedIndustry((prev) => prev || data.detected.industry);
      }
    };

    const ssKey = `drfizz.taxo.industry:${domain}`;
    try {
      const cachedRaw = sessionStorage.getItem(ssKey);
      if (cachedRaw) { applyIndustry(JSON.parse(cachedRaw)); return () => { cancelled = true; }; }
    } catch {}

    setTaxoLoading((s) => ({ ...s, industry: true }));
    fetch("/api/seo/business-taxonomy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, level: "industry" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok) {
          applyIndustry(data);
          try { sessionStorage.setItem(ssKey, JSON.stringify(data)); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTaxoLoading((s) => ({ ...s, industry: false })); });

    return () => { cancelled = true; };
    // run once on mount (domain is already stored by Step 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch Offering options for an industry the user picked (skips the detected one,
  // whose offerings were already loaded with the industry call).
  const fetchOfferings = (industry) => {
    const domain = getDomainFromStorage();
    if (!domain || !industry || industry === "Others") return;
    setTaxoLoading((s) => ({ ...s, offering: true }));
    fetch("/api/seo/business-taxonomy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, level: "offering", industry, context: taxoContextRef.current }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.offerings) && d.offerings.length) setOfferingOptions(withOther(d.offerings, FALLBACK_OFFERINGS));
        else setOfferingOptions(withOther(FALLBACK_OFFERINGS));
      })
      .catch(() => setOfferingOptions(withOther(FALLBACK_OFFERINGS)))
      .finally(() => setTaxoLoading((s) => ({ ...s, offering: false })));
  };

  // Fetch specific Category options for the chosen industry + offering. Because
  // Offering is multi-select, categories from each picked offering are MERGED
  // (union) into the list rather than replacing it, so the user can compose a
  // category set that spans every offering they selected.
  const fetchCategories = (industry, offering) => {
    const domain = getDomainFromStorage();
    if (!domain || !industry || !offering || offering === "Others") return;
    const mergeOptions = (incoming) =>
      setCategoryOptions((prev) => withOther([...prev.filter((o) => o !== "Others"), ...incoming], FALLBACK_CATEGORIES));
    setTaxoLoading((s) => ({ ...s, category: true }));
    fetch("/api/seo/business-taxonomy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, level: "category", industry, offering, context: taxoContextRef.current }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && Array.isArray(d.categories) && d.categories.length) mergeOptions(d.categories);
      })
      .catch(() => {})
      .finally(() => setTaxoLoading((s) => ({ ...s, category: false })));
  };

  /* ---------------- Submission / summary toggle ---------------- */
  useEffect(() => {
    const industryValue = selectedIndustry === "Others" ? customIndustry : selectedIndustry;
    // "Others" inside a multi-select array is substituted with the typed custom value.
    const offeringValues = selectedOfferings.map((o) => (o === "Others" ? customOffering : o)).filter(Boolean);
    const categoryValues = selectedCategories.map((c) => (c === "Others" ? customCategory : c)).filter(Boolean);

    if (industryValue && offeringValues.length && categoryValues.length) {
      setShowSummary(true);
      const offeringStr = offeringValues.join(", ");
      const categoryStr = categoryValues.join(", ");
      const scopeStr = businessScopes.join(", ");
      const newData = {
        businessName: businessName.trim() || null,
        // singular keys (joined) = backward-compat; plural arrays = the real selections.
        industry: industryValue,
        offering: offeringStr,
        offerings: offeringValues,
        category: categoryStr,
        categories: categoryValues,
        // aliases the report's final step reads first (industrySector/offeringType/specificService).
        industrySector: industryValue,
        offeringType: offeringStr,
        specificService: categoryStr,
        // V3 Part 3.2 — optional deeper definition
        coreServices:  coreServices.split(/[,;|]/).map((s) => s.trim()).filter(Boolean),
        revenueOffers: revenueOffers.trim() || null,
        buyerType:     buyerType.trim() || null,
        businessScope: scopeStr || null,
        businessScopes: businessScopes,
        // Step-2 analysis metadata (used by the final accuracy check) — what Claude
        // detected vs what the user ultimately chose.
        detected: detectedRef.current || null,
      };
      const dataString = JSON.stringify(newData);
      const lastDataString = JSON.stringify(lastSubmittedData.current);
      if (dataString !== lastDataString && onBusinessDataSubmit) {
        lastSubmittedData.current = newData;
        onBusinessDataSubmit(newData);
      }
    } else {
      setShowSummary(false);
    }
  }, [
    businessName,
    selectedIndustry,
    selectedOfferings,
    selectedCategories,
    customIndustry,
    customOffering,
    customCategory,
    coreServices,
    revenueOffers,
    buyerType,
    businessScopes,
    onBusinessDataSubmit,
  ]);

  /* ---------------- Auto-scroll to bottom (matches Step1Slide1 intent) ---------------- */
  useEffect(() => {
    if (tailRef.current) {
      requestAnimationFrame(() => {
        tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [
    selectedIndustry,
    selectedOfferings,
    selectedCategories,
    customIndustry,
    customOffering,
    customCategory,
    showSummary,
    openDropdown,
  ]);

  const kickOppsPrefetchInBackground = () => {
    if (didKickPrefetchRef.current) return;
    didKickPrefetchRef.current = true;
    const site = getDomainFromStorage();
    if (!site) return;
    try {
      prefetchOpportunitiesAndContent(site, { concurrency: 2 });
    } catch {
      // ignore
    }
  };

  /* ---------------- Handlers ---------------- */
  const handleNext = () => {
    kickOppsPrefetchInBackground();
    onNext?.();
  };

  const handleBack = () => onBack?.();
  const handleDropdownToggle = (name) =>
    setOpenDropdown((prev) => (prev === name ? null : name));

  // Industry is single-select and resets the dependent multi-selects below it.
  const handleIndustrySelect = (industry) => {
    setSelectedIndustry(industry);
    setSelectedOfferings([]);
    setSelectedCategories([]);
    setCustomOffering("");
    setCustomCategory("");
    setCategoryOptions(withOther(FALLBACK_CATEGORIES));
    if (industry !== "Others") setCustomIndustry("");
    setOpenDropdown(null);
    if (industry === "Others") { setOfferingOptions(withOther(FALLBACK_OFFERINGS)); return; }
    // detected industry already has its offerings loaded; otherwise fetch fresh ones
    if (detectedRef.current && industry === detectedRef.current.industry) return;
    fetchOfferings(industry);
  };
  // Offering is MULTI-SELECT. Toggling one ON pulls in that offering's categories
  // (merged); the dropdown stays open so several can be picked.
  const handleOfferingToggle = (offering) => {
    const wasSelected = selectedOfferings.includes(offering);
    setSelectedOfferings((prev) => (wasSelected ? prev.filter((x) => x !== offering) : [...prev, offering]));
    if (wasSelected || offering === "Others") return;
    const industry = selectedIndustry === "Others" ? customIndustry : selectedIndustry;
    fetchCategories(industry, offering);
  };
  // Category is MULTI-SELECT; the dropdown stays open.
  const handleCategoryToggle = (category) => {
    setSelectedCategories((prev) => (prev.includes(category) ? prev.filter((x) => x !== category) : [...prev, category]));
  };
  const toggleBusinessScope = (s) =>
    setBusinessScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleResetSelections = () => {
    setSelectedIndustry("");
    setSelectedOfferings([]);
    setSelectedCategories([]);
    setCustomIndustry("");
    setCustomOffering("");
    setCustomCategory("");
    lastSubmittedData.current = null;
    setShowSummary(false);
    didKickPrefetchRef.current = false;
  };

  // close dropdowns on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest(".dropdown-container")) setOpenDropdown(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // shared dropdown menu renderer
  const renderMenu = (options, onSelect, loading) => (
    <div
      className="absolute top-full left-0 right-0 bg-[var(--input)] border border-[var(--border)] rounded-lg mt-1 shadow-2xl max-h-56 overflow-y-auto"
      style={{ zIndex: 1001 }}
    >
      {loading && (
        <div className="w-full text-left px-4 py-2.5 sm:py-3 text-[var(--muted)] text-[12px] sm:text-[13px] md:text-[14px] inline-flex items-center gap-2 border-b border-[var(--border)]">
          <Loader2 size={14} className="animate-spin" /> Loading suggestions…
        </div>
      )}
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          type="button"
          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0 focus:outline-none transition-colors"
        >
          {opt}
        </button>
      ))}
    </div>
  );

  // shared MULTI-select menu — checkmarks the chosen options and stays open on click
  const renderMultiMenu = (options, selected, onToggle, loading) => (
    <div
      className="absolute top-full left-0 right-0 bg-[var(--input)] border border-[var(--border)] rounded-lg mt-1 shadow-2xl max-h-56 overflow-y-auto"
      style={{ zIndex: 1001 }}
    >
      {loading && (
        <div className="w-full text-left px-4 py-2.5 sm:py-3 text-[var(--muted)] text-[12px] sm:text-[13px] md:text-[14px] inline-flex items-center gap-2 border-b border-[var(--border)]">
          <Loader2 size={14} className="animate-spin" /> Loading suggestions…
        </div>
      )}
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            type="button"
            className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0 focus:outline-none transition-colors flex items-center justify-between gap-2"
          >
            <span>{opt}</span>
            {checked && <Check size={16} className="text-[#d45427] shrink-0" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-transparent slides-accent overflow-x-hidden">
      {/* ---------------- Content Section ---------------- */}
      <div className="px-3 sm:px-4 md:px-6 pt-4 sm:pt-5 md:pt-6">
        <div
          ref={panelRef}
          className="mx-auto w-full max-w-[1120px] rounded-2xl bg-transparent box-border"
          style={{
            padding: "0px 24px",
            height: panelHeight ? `${panelHeight}px` : "auto",
          }}
        >
          {/* Hide scrollbars for inner area */}
          <style jsx>{`
            .inner-scroll {
              scrollbar-width: none;
              -ms-overflow-style: none;
            }
            .inner-scroll::-webkit-scrollbar {
              display: none;
            }
          `}</style>

          {/* Inner scrollable area */}
          <div
            ref={scrollRef}
            className="inner-scroll h-full w-full overflow-y-auto"
          >
            <div className="flex flex-col items-start text-start gap-5 sm:gap-6 md:gap-8 max-w-[820px] mx-auto">
              {/* Step label */}
              <div className="text-[11px] sm:text-[12px] md:text-[13px] text-[var(--muted)] font-medium">
                Step - 2
              </div>
              <div className="spacer-line w-[80%] self-start h-[1px] bg-[#d45427] mt-[-1%]" />

              {/* Heading + copy */}
              <div className="space-y-2.5 sm:space-y-3 max-w-[640px]">
                <h1 className="text-[16px] sm:text-[18px] md:text-[22px] lg:text-[26px] font-bold text-[var(--text)]">
                  Tell us about your business
                </h1>
                <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[var(--muted)] leading-relaxed">
                  Pick the closest category that best describes your business.
                  This tailors benchmarks and keyword ideas.
                </p>
              </div>

              {/* Business Name input */}
              <div className="w-full max-w-[480px]">
                <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wide">
                  Business / Company Name <span className="text-[#ffa615]">(for GMB lookup)</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="e.g. Itzfizz Digital Private Limited"
                  className="w-full bg-[var(--input)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] sm:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[#d45427] transition-colors"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Used to find your Google Business Profile. Use your exact registered name.
                </p>
              </div>

              {/* V3 Part 3.2 — deeper business definition (optional, sharpens analysis) */}
              <div className="w-full max-w-[480px] space-y-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Core Services / Products <span className="text-[var(--muted)] normal-case">(optional, comma-separated)</span></label>
                  <input type="text" value={coreServices} onChange={e => setCoreServices(e.target.value)} placeholder="e.g. SEO, web design, paid ads, branding"
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] sm:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[#d45427] transition-colors" />
                  <p className="text-[11px] text-[var(--muted)] mt-1">Sharpens keyword relevance filtering so only on-topic terms enter the report.</p>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Revenue-Driving Offers <span className="text-[var(--muted)] normal-case">(optional)</span></label>
                  <input type="text" value={revenueOffers} onChange={e => setRevenueOffers(e.target.value)} placeholder="e.g. monthly retainers, audits, one-off projects"
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] sm:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[#d45427] transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Customer / Buyer Type <span className="text-[var(--muted)] normal-case">(optional)</span></label>
                  <input type="text" value={buyerType} onChange={e => setBuyerType(e.target.value)} placeholder="e.g. SMBs, enterprise marketing teams, homeowners"
                    className="w-full bg-[var(--input)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[13px] sm:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[#d45427] transition-colors" />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5 uppercase tracking-wide">Business-Model Scope <span className="text-[var(--muted)] normal-case">(select all that apply)</span></label>
                  <div className="flex flex-wrap gap-2">
                    {["Local", "Regional", "National", "International"].map((s) => {
                      const active = businessScopes.includes(s);
                      return (
                      <button key={s} type="button" onClick={() => toggleBusinessScope(s)}
                        className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors ${active ? "bg-[#d45427] text-white border-[#d45427]" : "bg-[var(--input)] text-[var(--text)] border-[var(--border)] hover:border-[#d45427]"}`}>
                        {s}
                      </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-1">Drives whether geography pages target country, region, or city scope.</p>
                </div>
              </div>

              {/* Summary (when all selected) */}
              {showSummary && (
                <div className="bg-[var(--input)] max-w-[360px] w-full rounded-2xl shadow-sm border border-[var(--border)] px-4 sm:px-5 md:px-6 py-3 sm:py-4 my-1 text-left self-end">
                  <div className="space-y-2 text-[13px] sm:text-[14px] md:text-[15px]">
                    {businessName.trim() && (
                      <div className="text-[var(--text)]">
                        <span className="font-semibold">Business Name:</span>{" "}
                        {businessName.trim()}
                      </div>
                    )}
                    <div className="text-[var(--text)]">
                      <span className="font-semibold">Industry Sector:</span>{" "}
                      {selectedIndustry === "Others" ? customIndustry : selectedIndustry}
                    </div>
                    <div className="text-[var(--text)]">
                      <span className="font-semibold">Offering Type:</span>{" "}
                      {selectedOfferings.map((o) => (o === "Others" ? customOffering : o)).filter(Boolean).join(", ")}
                    </div>
                    <div className="text-[var(--text)]">
                      <span className="font-semibold">Category:</span>{" "}
                      {selectedCategories.map((c) => (c === "Others" ? customCategory : c)).filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>
              )}

              {/* Dropdown grid */}
              {!showSummary && (
                <div className="w-full max-w-[880px] flex flex-col gap-2">
                  {/* Detection hint */}
                  {(taxoLoading.industry || detected?.industry) && (
                    <div className="flex items-center gap-2 text-[12px] sm:text-[13px]">
                      {taxoLoading.industry ? (
                        <span className="text-[var(--muted)] inline-flex items-center gap-2">
                          <Loader2 size={14} className="animate-spin" /> Analyzing your website to suggest the best matches…
                        </span>
                      ) : detected?.industry ? (
                        <span className="text-[var(--muted)] inline-flex items-center gap-1.5 flex-wrap">
                          <Sparkles size={14} className="text-[#d45427]" />
                          Detected from your site:&nbsp;
                          <span className="text-[#d45427] font-semibold">{detected.industry}</span>
                          {typeof detected.confidence === "number" ? <span className="text-[var(--muted)]">({Math.round(detected.confidence * 100)}% match)</span> : null}
                          <span>— change any selection below.</span>
                        </span>
                      ) : null}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 w-full relative pb-10 sm:pb-12 lg:pb-0">
                  {/* Industry */}
                  <div
                    className="relative dropdown-container overflow-visible"
                    style={{ zIndex: openDropdown === "industry" ? 1000 : 1 }}
                  >
                    <button
                      onClick={() => handleDropdownToggle("industry")}
                      type="button"
                      className="w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-left flex items-center justify-between hover:border-[var(--border)] focus:outline-none focus:border-[var(--border)] transition-colors"
                    >
                      <span
                        className={`${
                          selectedIndustry ? "text-[var(--text)]" : "text-[var(--muted)]"
                        } text-[12px] sm:text-[13px] md:text-[14px]`}
                      >
                        {selectedIndustry || "Industry Sector"}
                      </span>
                      {taxoLoading.industry && !selectedIndustry ? (
                        <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                      ) : (
                        <ChevronDown
                          size={20}
                          className={`transition-transform ${openDropdown === "industry" ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {openDropdown === "industry" && renderMenu(industryOptions, handleIndustrySelect, taxoLoading.industry)}

                    {selectedIndustry === "Others" && (
                      <input
                        type="text"
                        placeholder="Describe your sector"
                        value={customIndustry}
                        onChange={(e) => setCustomIndustry(e.target.value)}
                        className="w-full mt-2 bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--border)]"
                      />
                    )}
                  </div>

                  {/* Offering */}
                  <div
                    className="relative dropdown-container overflow-visible"
                    style={{ zIndex: openDropdown === "offering" ? 1000 : 1 }}
                  >
                    <button
                      onClick={() => (selectedIndustry ? handleDropdownToggle("offering") : null)}
                      disabled={!selectedIndustry}
                      type="button"
                      className={`w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-left flex items-center justify-between focus:outline-none transition-colors ${
                        selectedIndustry
                          ? "hover:border-[var(--border)] cursor-pointer focus:border-[var(--border)]"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span
                        className={`${
                          selectedOfferings.length ? "text-[var(--text)]" : "text-[var(--muted)]"
                        } text-[12px] sm:text-[13px] md:text-[14px]`}
                      >
                        {selectedOfferings.length
                          ? (selectedOfferings.length === 1 ? selectedOfferings[0] : `${selectedOfferings.length} selected`)
                          : "Offering Type"}
                      </span>
                      {taxoLoading.offering && !selectedOfferings.length ? (
                        <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                      ) : (
                        <ChevronDown
                          size={20}
                          className={`transition-transform ${openDropdown === "offering" ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {openDropdown === "offering" && selectedIndustry && renderMultiMenu(offeringOptions, selectedOfferings, handleOfferingToggle, taxoLoading.offering)}

                    {selectedOfferings.includes("Others") && (
                      <input
                        type="text"
                        placeholder="Describe your offering type"
                        value={customOffering}
                        onChange={(e) => setCustomOffering(e.target.value)}
                        className="w-full mt-2 bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--border)]"
                      />
                    )}
                  </div>

                  {/* Category */}
                  <div
                    className="relative dropdown-container overflow-visible"
                    style={{ zIndex: openDropdown === "category" ? 1000 : 1 }}
                  >
                    <button
                      onClick={() => (selectedOfferings.length ? handleDropdownToggle("category") : null)}
                      disabled={!selectedOfferings.length}
                      type="button"
                      className={`w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-left flex items-center justify-between focus:outline-none transition-colors ${
                        selectedOfferings.length
                          ? "hover:border-[var(--border)] cursor-pointer focus:border-[var(--border)]"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span
                        className={`${
                          selectedCategories.length ? "text-[var(--text)]" : "text-[var(--muted)]"
                        } text-[12px] sm:text-[13px] md:text-[14px]`}
                      >
                        {selectedCategories.length
                          ? (selectedCategories.length === 1 ? selectedCategories[0] : `${selectedCategories.length} selected`)
                          : "Specific Categories"}
                      </span>
                      {taxoLoading.category && !selectedCategories.length ? (
                        <Loader2 size={18} className="animate-spin text-[var(--muted)]" />
                      ) : (
                        <ChevronDown
                          size={20}
                          className={`transition-transform ${openDropdown === "category" ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {openDropdown === "category" && selectedOfferings.length > 0 && renderMultiMenu(categoryOptions, selectedCategories, handleCategoryToggle, taxoLoading.category)}

                    {selectedCategories.includes("Others") && (
                      <input
                        type="text"
                        placeholder="Describe your service"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        className="w-full mt-2 bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--border)]"
                      />
                    )}
                  </div>
                  </div>
                </div>
              )}

              {/* Summary CTA */}
              {showSummary && (
                <div className="mt-5 self-start">
                  <h3 className="text-[15px] sm:text-[16px] md:text-[18px] font-bold text-[var(--text)] mb-2.5 sm:mb-3">
                    Here’s your site report — take a quick look on the
                    <br /> Info Tab.
                  </h3>
                  <p className="text-[12px] sm:text-[13px] md:text-[15px] text-[var(--muted)]">
                    If not, Want to do some changes?
                  </p>
                  <div className="mt-3 text-[12px] sm:text-[13px]">
                    <button
                      onClick={handleResetSelections}
                      className="text-gray-500 hover:text-gray-700 font-semibold"
                      type="button"
                    >
                      YES!
                    </button>
                  </div>
                </div>
              )}
              <div className="h-2" />
              <div ref={tailRef} />{" "}
              {/* <-- tail element to anchor auto-scroll */}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Bottom bar ---------------- */}
      <div ref={bottomBarRef} className="flex-shrink-0 bg-transparent">
        <div className="border-t border-[var(--border)]" />
        <div className="mx-auto w-full max-w-[1120px] px-3 sm:px-4 md:px-6">
          <div className="py-5 sm:py-6 md:py-7 flex justify-center gap-3 sm:gap-4">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--input)] px-5 sm:px-6 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] hover:bg-[var(--input)] shadow-sm border border-[#d45427]"
            >
              <ArrowLeft size={16} /> Back
            </button>

            {showSummary && (
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-5 sm:px-6 py-2.5 sm:py-3 text-white hover:opacity-90 shadow-sm text-[13px] md:text-[14px]"
              >
                Next <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
