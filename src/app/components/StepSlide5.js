"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, ArrowLeft, Plus, X, Check } from "lucide-react";

export default function StepSlide5({
  onNext,
  onBack,
  onCompetitorSubmit,
  businessData,
  languageLocationData,
  selectedKeywords,
}) {
  const [selectedBusinessCompetitors, setSelectedBusinessCompetitors] = useState([]);
  const [selectedSearchCompetitors, setSelectedSearchCompetitors] = useState([]);

  const [businessSuggestions, setBusinessSuggestions] = useState([]);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [addingBusiness, setAddingBusiness] = useState(false);
  const [addingSearch, setAddingSearch] = useState(false);
  const [bizInput, setBizInput] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [showSummary, setShowSummary] = useState(false);

  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomBarRef = useRef(null);
  const tailRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);

  const lastSubmittedData = useRef(null);

  const normalizeHost = useCallback((input) => {
    if (!input || typeof input !== "string") return null;
    let s = input.trim().toLowerCase();
    try {
      if (!/^https?:\/\//.test(s)) s = `https://${s}`;
      const u = new URL(s);
      s = u.hostname || s;
    } catch {
      s = s.replace(/^https?:\/\//, "").split("/")[0];
    }
    return s.replace(/^www\./, "");
  }, []);

  // Accept any non-empty competitor name with at least 2 chars and at least one letter.
  // We do NOT require a dot — AI may return "amazon.com" OR just "Amazon", both are valid.
  const isHostLike = useCallback((host) => {
    const h = String(host || "").trim();
    return h.length >= 2 && /[a-zA-Z]/.test(h);
  }, []);

  // normalize + filter + dedupe competitors
  const sanitizeList = useCallback(
    (list) => {
      const arr = Array.isArray(list) ? list : [];
      const seen = new Set();

      return arr
        .map((x) => {
          const raw = String(x || "").trim();
          // If it looks like a domain (has dot), normalize it. Otherwise keep as-is.
          return raw.includes(".") ? (normalizeHost(raw) || raw) : raw.toLowerCase();
        })
        .filter(Boolean)
        .filter((h) => isHostLike(h))
        .filter((h) => {
          const key = h.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    },
    [normalizeHost, isHostLike]
  );

  // ✅ NEW: insert newly added host into suggestions (before "More"), keep "More" last
  const insertBeforeMore = useCallback(
    (prev, host) => {
      const list = Array.isArray(prev) ? prev.filter(Boolean) : [];
      const withoutMore = list.filter((x) => x !== "More");

      const next = sanitizeList([host, ...withoutMore]);
      // keep UI tidy; you can change 8 to whatever you prefer
      return next.slice(0, 8).concat("More");
    },
    [sanitizeList]
  );

  const getStoredJson = useCallback((key) => {
    try {
      const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const getStoredSite = useCallback(() => {
    const keys = ["websiteData", "site", "website", "selectedWebsite", "drfizzm.site", "drfizzm.website"];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k);
        if (!raw) continue;
        try {
          const obj = JSON.parse(raw);
          const val = obj?.website || obj?.site || obj?.domain || obj?.host || raw;
          const host = normalizeHost(val);
          if (host) return host;
        } catch {
          const host = normalizeHost(raw);
          if (host) return host;
        }
      } catch {}
    }
    return null;
  }, [normalizeHost]);

  const getTargetSite = useCallback(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromParam = normalizeHost(params.get("site"));
      if (fromParam) return fromParam;
    } catch {}
    const fromStorage = getStoredSite();
    if (fromStorage) return fromStorage;
    return "example.com";
  }, [normalizeHost, getStoredSite]);

  const buildLocationString = useCallback((ll) => {
    const city = (ll?.city || "").trim();
    const state = (ll?.state || "").trim();
    const country = (ll?.country || "").trim();
    return [city, state, country].filter(Boolean).join(", ");
  }, []);

  const getContext = useCallback(() => {
    const b = businessData || getStoredJson("businessData") || {};
    const ll = languageLocationData || getStoredJson("languageLocationData") || {};
    const seedFromProps = Array.isArray(selectedKeywords) ? selectedKeywords : null;
    const seedFromStorage = getStoredJson("selectedKeywords");
    const seeds = (seedFromProps || seedFromStorage || []).filter(Boolean);

    return {
      industry: (b?.industry || "").trim(),
      offering: (b?.offering || "").trim(),
      category: (b?.category || "").trim(),
      language: (ll?.language || "").trim(),
      location: buildLocationString(ll),
      country: (ll?.country || "").trim(),
      state: (ll?.state || "").trim(),
      city: (ll?.city || "").trim(),
      seedKeywords: seeds.slice(0, 12),
    };
  }, [businessData, languageLocationData, selectedKeywords, getStoredJson, buildLocationString]);

  const makeKey = useCallback((domain, industry, location) => {
    return [domain || "", industry || "", location || ""].map((x) => String(x || "").trim().toLowerCase()).join("|");
  }, []);

  const readBootstrap = useCallback(() => {
    try {
      const raw = localStorage.getItem("drfizz.bootstrap");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const target = getTargetSite();
        const ctx = getContext();

        // 1) try bootstrap cache
        const cached = readBootstrap();
        const expectedKey = makeKey(target, ctx.industry, ctx.location);
        const storedKey = localStorage.getItem("drfizz.bootstrap.key") || "";

        if (cached && storedKey === expectedKey && cached?.competitors) {
          const bizRaw = Array.isArray(cached.competitors.businessCompetitors)
            ? cached.competitors.businessCompetitors
            : [];
          const serRaw = Array.isArray(cached.competitors.searchCompetitors)
            ? cached.competitors.searchCompetitors
            : [];

          // ✅ enforce hostnames only
          const biz = sanitizeList(bizRaw);
          const ser = sanitizeList(serRaw);

          const bizSet = new Set(biz);
          const serFiltered = ser.filter((x) => !bizSet.has(String(x).toLowerCase().trim()));

          const bizFinal = biz.slice(0, 4);
          const serFinal = serFiltered.slice(0, 4);

          if (isMounted) {
            setBusinessSuggestions(bizFinal.concat("More"));
            setSearchSuggestions(serFinal.concat("More"));
          }

          return;
        }

        // 2) fallback API
        const res = await fetch("/api/competitors/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain: target,
            industry: ctx.industry,
            offering: ctx.offering,
            category: ctx.category,
            language: ctx.language,
            location: ctx.location,
            country: ctx.country,
            state: ctx.state,
            city: ctx.city,
            seedKeywords: ctx.seedKeywords,
          }),
        });

        if (!res.ok) throw new Error(`Failed to load competitors (${res.status})`);

        const data = await res.json();
        const bizRaw = Array.isArray(data.businessCompetitors) ? data.businessCompetitors : [];
        const serRaw = Array.isArray(data.searchCompetitors) ? data.searchCompetitors : [];

        // ✅ enforce hostnames only
        const biz = sanitizeList(bizRaw);
        const ser = sanitizeList(serRaw);

        const bizSet = new Set(biz);
        const serFiltered = ser.filter((x) => !bizSet.has(String(x).toLowerCase().trim()));

        const bizFinal = biz.slice(0, 4);
        const serFinal = serFiltered.slice(0, 4);

        if (isMounted) {
          setBusinessSuggestions(bizFinal.concat("More"));
          setSearchSuggestions(serFinal.concat("More"));
        }
      } catch (err) {
        if (isMounted) {
          setLoadError(err?.message || "Failed to load competitor data");
          setBusinessSuggestions(["More"]);
          setSearchSuggestions(["More"]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [getTargetSite, getContext, readBootstrap, makeKey, sanitizeList]);

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
  }, [showSummary, selectedBusinessCompetitors.length, selectedSearchCompetitors.length, addingBusiness, addingSearch]);

  const toggleBusiness = (label) => {
    if (label === "More" && isLoading) return;
    if (label === "More") {
      setAddingBusiness(true);
      setTimeout(() => document.getElementById("biz-more-input")?.focus(), 50);
      return;
    }

    // ✅ ensure only hostnames get selected (defensive)
    const host = normalizeHost(String(label || ""));
    if (!host || !isHostLike(host)) return;

    setSelectedBusinessCompetitors((prev) =>
      prev.includes(host) ? prev.filter((c) => c !== host) : [...prev, host]
    );
  };

  const toggleSearch = (label) => {
    if (label === "More" && isLoading) return;
    if (label === "More") {
      setAddingSearch(true);
      setTimeout(() => document.getElementById("search-more-input")?.focus(), 50);
      return;
    }

    // ✅ ensure only hostnames get selected (defensive)
    const host = normalizeHost(String(label || ""));
    if (!host || !isHostLike(host)) return;

    setSelectedSearchCompetitors((prev) =>
      prev.includes(host) ? prev.filter((c) => c !== host) : [...prev, host]
    );
  };

  const addCustomBusiness = () => {
    const host = normalizeHost(String(bizInput || ""));
    if (host && isHostLike(host) && !selectedBusinessCompetitors.includes(host)) {
      setSelectedBusinessCompetitors((prev) => [...prev, host]);
      // ✅ NEW: show immediately in chip list (before "More")
      setBusinessSuggestions((prev) => insertBeforeMore(prev, host));
    }
    setBizInput("");
    setTimeout(() => document.getElementById("biz-more-input")?.focus(), 50);
  };

  const addCustomSearch = () => {
    const host = normalizeHost(String(searchInput || ""));
    if (host && isHostLike(host) && !selectedSearchCompetitors.includes(host)) {
      setSelectedSearchCompetitors((prev) => [...prev, host]);
      // ✅ NEW: show immediately in chip list (before "More")
      setSearchSuggestions((prev) => insertBeforeMore(prev, host));
    }
    setSearchInput("");
    setTimeout(() => document.getElementById("search-more-input")?.focus(), 50);
  };

  useEffect(() => {
    // ✅ sanitize selected lists before submit (and dedupe)
    const bizCleanList = sanitizeList(selectedBusinessCompetitors);
    const bizSet = new Set(bizCleanList.map((x) => String(x).toLowerCase().trim()));

    const searchCleanList = sanitizeList(selectedSearchCompetitors).filter(
      (x) => !bizSet.has(String(x).toLowerCase().trim())
    );

    const totalSelected = bizCleanList.length + searchCleanList.length;

    if (totalSelected > 0) {
      const payload = {
        businessCompetitors: bizCleanList,
        searchCompetitors: searchCleanList,
        totalCompetitors: [...bizCleanList, ...searchCleanList],
      };
      const curr = JSON.stringify(payload);
      if (curr !== JSON.stringify(lastSubmittedData.current)) {
        lastSubmittedData.current = payload;
        onCompetitorSubmit?.(payload);
      }
      setShowSummary(true);
    } else {
      setShowSummary(false);
      onCompetitorSubmit?.({ businessCompetitors: [], searchCompetitors: [], totalCompetitors: [] });
    }
  }, [selectedBusinessCompetitors, selectedSearchCompetitors, onCompetitorSubmit, sanitizeList]);

  useEffect(() => {
    if (tailRef.current) {
      requestAnimationFrame(() => {
        tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [showSummary, selectedBusinessCompetitors.length, selectedSearchCompetitors.length, addingBusiness, addingSearch, isLoading]);

  const Chip = ({ label, isSelected, onClick, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      aria-pressed={isSelected}
      className={`keyword-chip group inline-flex items-center justify-between mx-1 px-3.5 sm:px-4 py-2.5 min-h-[34px] sm:min-h-[36px] text-[11px] sm:text-[12px] md:text-[13px] leading-normal gap-1 ${
        isSelected ? "active" : ""
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <span className="truncate max-w-[150px] sm:max-w-[180px] md:max-w-none">{label}</span>

      {label !== "More" && (
        <>
          {!isSelected && <Plus size={16} className="ml-1 flex-shrink-0" />}
          {isSelected && (
            <span className="relative ml-1 inline-flex w-4 h-4 items-center justify-center flex-shrink-0">
              <Check
                size={16}
                className="absolute opacity-100 group-hover:opacity-0 transition-opacity duration-150"
                style={{ color: "#d45427" }}
              />
              <X
                size={16}
                className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                style={{ color: "#d45427" }}
              />
            </span>
          )}
        </>
      )}
    </button>
  );

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-x-hidden">
      <div className="px-3 sm:px-4 md:px-6 pt-4 sm:pt-5 md:pt-6">
        <div
          ref={panelRef}
          className="mx-auto w-full max-w-[1120px] rounded-2xl bg-transparent box-border"
          style={{ padding: "0px 24px", height: panelHeight ? `${panelHeight}px` : "auto" }}
        >
          <style jsx>{`
            .inner-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            .inner-scroll::-webkit-scrollbar { display: none; }
            .chip-skel {
              display: inline-block;
              border-radius: 0.75rem;
              height: 36px;
              width: 88px;
              background: var(--border);
              animation: pulse 1.2s ease-in-out infinite;
            }
            @media (max-width: 640px) { .chip-skel { height: 32px; width: 72px; } }
            @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
          `}</style>

          <div ref={scrollRef} className="inner-scroll h-full w-full overflow-y-auto">
            <div className="flex flex-col items-start text-start gap-5 sm:gap-6 md:gap-8 max-w-[820px] mx-auto">
              <div className="text-[11px] sm:text-[12px] md:text-[13px] text-[var(--muted)] font-medium">
                Step - 5
              </div>
              <div className="spacer-line w-[80%] self-start h-[1px] bg-[#d45427] mt-[-1%]" />

              <div className="space-y-2.5 sm:space-y-3 max-w-[640px]">
                <h1 className="text-[16px] sm:text-[18px] md:text-[22px] lg:text-[26px] font-bold text-[var(--text)]">
                  Pick your competitors to compare.
                </h1>
                <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[var(--muted)] leading-relaxed">
                  {isLoading
                    ? "Scanning your site…"
                    : loadError
                    ? "Showing your own inputs (we couldn’t auto-detect enough competitors)."
                    : "I scanned your site and found these competitors."}
                </p>
              </div>

              {/* BUSINESS */}
              <div className="w-full max-w-[880px] text-left space-y-3 sm:space-y-4">
                <h3 className="text-[13px] sm:text-[14px] md:text-[15px] font-medium text-[var(--text)]">
                  Business Competitors
                </h3>

                <div className="flex flex-wrap justify-start gap-2 sm:gap-2.5 md:gap-3 items-center -mx-1">
                  {isLoading && businessSuggestions.length === 0
                    ? Array.from({ length: 4 }).map((_, i) => <span key={`biz-skel-${i}`} className="chip-skel mx-1" />)
                    : businessSuggestions.map((label) => {
                        const isSelected = selectedBusinessCompetitors.includes(label);

                        if (label === "More" && addingBusiness) {
                          return (
                            <div key="biz-inline-input" className="flex flex-wrap items-center gap-2 mx-1 w-full sm:w-auto">
                              <input
                                id="biz-more-input"
                                value={bizInput}
                                onChange={(e) => setBizInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addCustomBusiness(); }}
                                placeholder="Add business competitor"
                                className="w-full sm:w-[240px] px-3 sm:px-4 py-2 border border-[#d45427] rounded-xl bg-[var(--input)] text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#d45427]"
                              />
                              <button
                                onClick={addCustomBusiness}
                                className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-[image:var(--infoHighlight-gradient)] text-white rounded-xl hover:opacity-90"
                              >
                                <Plus size={16} />
                              </button>
                              <button
                                onClick={() => { setAddingBusiness(false); setBizInput(""); }}
                                className="px-2 py-2 text-[var(--muted)] hover:text-red-500 rounded-xl"
                                title="Cancel"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <Chip
                            key={`biz-${label}`}
                            label={label}
                            isSelected={isSelected}
                            onClick={() => toggleBusiness(label)}
                            disabled={isLoading && label === "More"}
                          />
                        );
                      })}
                </div>
              </div>

              {/* SEARCH */}
              <div className="w-full max-w-[880px] text-left space-y-3 sm:space-y-4">
                <h3 className="text-[13px] sm:text-[14px] md:text-[15px] font-medium text-[var(--text)]">
                  Search Engine Competitors
                </h3>

                <div className="flex flex-wrap justify-start gap-2 sm:gap-2.5 md:gap-3 items-center -mx-1">
                  {isLoading && searchSuggestions.length === 0
                    ? Array.from({ length: 4 }).map((_, i) => <span key={`ser-skel-${i}`} className="chip-skel mx-1" />)
                    : searchSuggestions.map((label) => {
                        const isSelected = selectedSearchCompetitors.includes(label);

                        if (label === "More" && addingSearch) {
                          return (
                            <div key="search-inline-input" className="flex flex-wrap items-center gap-2 mx-1 w-full sm:w-auto">
                              <input
                                id="search-more-input"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addCustomSearch(); }}
                                placeholder="Add search competitor"
                                className="w-full sm:w-[240px] px-3 sm:px-4 py-2 border border-[#d45427] rounded-xl bg-[var(--input)] text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#d45427]"
                              />
                              <button
                                onClick={addCustomSearch}
                                className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-[image:var(--infoHighlight-gradient)] text-white rounded-xl hover:opacity-90"
                              >
                                <Plus size={16} />
                              </button>
                              <button
                                onClick={() => { setAddingSearch(false); setSearchInput(""); }}
                                className="px-2 py-2 text-[var(--muted)] hover:text-red-500 rounded-xl"
                                title="Cancel"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <Chip
                            key={`search-${label}`}
                            label={label}
                            isSelected={isSelected}
                            onClick={() => toggleSearch(label)}
                            disabled={isLoading && label === "More"}
                          />
                        );
                      })}
                </div>
              </div>

              {showSummary && (
                <div className="max-w-[640px] text-left self-start mt-5 sm:mt-6">
                  <h3 className="text-[15px] sm:text-[16px] md:text-[18px] font-bold text-[var(--text)] mb-2.5 sm:mb-3">
                    Here’s your site report — take a quick look on
                    <br />
                    the Info Tab.
                  </h3>
                  <p className="text-[12px] sm:text-[13px] md:text-[15px] text-[var(--muted)]">
                    You can always view more information in Info Tab
                  </p>
                </div>
              )}

              <div className="h-2" />
              <div ref={tailRef} />
            </div>
          </div>
        </div>
      </div>

      <div ref={bottomBarRef} className="flex-shrink-0 bg-transparent">
        <div className="border-t border-[var(--border)]" />
        <div className="mx-auto w-full max-w-[1120px] px-3 sm:px-4 md:px-6">
          <div className="py-5 sm:py-6 md:py-7 flex justify-center gap-3 sm:gap-4">
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--input)] px-5 sm:px-6 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] hover:bg-[var(--input)] shadow-sm border border-[#d45427]"
            >
              <ArrowLeft size={16} /> Back
            </button>

            {showSummary && (
              <button
                onClick={onNext}
                type="button"
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
