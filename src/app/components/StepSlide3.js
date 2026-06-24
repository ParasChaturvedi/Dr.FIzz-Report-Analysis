// src/components/StepSlide3.js
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ArrowRight, ArrowLeft, ChevronDown, Check, Plus } from "lucide-react";
import { GEO, LANGUAGES } from "./data/geo";
import { DIRECTORY_GROUPS } from "./data/directories";

export default function StepSlide3({ onNext, onBack, onLanguageLocationSubmit }) {
  // V4 — every selector here is MULTI-SELECT. Language + at least one country are
  // mandatory; state, city and directories are optional. Singular `language`/
  // `country`/`state`/`city` are still emitted (primary = first) for back-compat.
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedCities, setSelectedCities] = useState([]);
  const [selectedDirectories, setSelectedDirectories] = useState([]);
  const [customDirectory, setCustomDirectory] = useState("");

  const [openDropdown, setOpenDropdown] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(null);
  // Progress bar (0–100) for keyword bootstrap wait time
  const [progressPct, setProgressPct] = useState(0);
  const fakeProgressRef = useRef(null);

  const startFakeProgressTo92 = () => {
    setProgressPct(0);
    if (fakeProgressRef.current) clearInterval(fakeProgressRef.current);

    // 0 -> 92 in ~25s (matches Step5Slide2)
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


  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomBarRef = useRef(null);
  const tailRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);

  const lastSubmittedData = useRef(null);

  const languages = LANGUAGES;
  const geo = GEO;

  const countries = Object.keys(geo);
  // State/city only make sense when EXACTLY ONE country is selected (multi-country
  // scope stays at the country grain). States are multi; cities are the union of
  // the cities that belong to the selected states.
  const singleCountry = selectedCountries.length === 1 ? selectedCountries[0] : "";
  const states = singleCountry ? Object.keys(geo[singleCountry] || {}) : [];
  const cities = useMemo(() => {
    if (!singleCountry || !selectedStates.length) return [];
    const seen = new Set();
    selectedStates.forEach((s) => (geo[singleCountry]?.[s] || []).forEach((c) => seen.add(c)));
    return Array.from(seen);
  }, [geo, singleCountry, selectedStates]);

  // Service-area type, derived from the actual selections.
  const serviceAreaType = useMemo(() => {
    if (selectedCountries.length > 1) return "multi-country";
    if (selectedCities.length) return "city-specific";
    if (selectedStates.length) return "region-specific";
    return "countrywide";
  }, [selectedCountries, selectedStates, selectedCities]);

  const serviceAreaLabel = {
    "multi-country": "Multi-country",
    "city-specific": "City-specific",
    "region-specific": "Region / state-specific",
    "countrywide": "Countrywide",
  }[serviceAreaType];

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

  // Cleanup fake progress if component unmounts mid-bootstrap
  useEffect(() => {
    return () => stopFakeProgress();
  }, []);


  useEffect(() => {
    recomputePanelHeight();
  }, [selectedLanguages, selectedCountries, selectedStates, selectedCities, selectedDirectories]);

  // Mandatory: at least one language + at least one country. Everything else optional.
  const selectionsComplete = !!(selectedLanguages.length >= 1 && selectedCountries.length >= 1);

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

  const readJson = useCallback((k) => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const makeKey = useCallback((domain, industry, location) => {
    return [domain || "", industry || "", location || ""].map((x) => String(x || "").trim().toLowerCase()).join("|");
  }, []);

  useEffect(() => {
    const payload = {
      languages: selectedLanguages,                       // V4 — multi-language
      language: selectedLanguages[0] || "",               // backward-compat (primary)
      countries: selectedCountries,                       // multi-country
      country: selectedCountries[0] || "",                // backward-compat (primary)
      states: selectedStates,                             // V4 — multi-state
      state: selectedStates[0] || "",                     // backward-compat (primary)
      cities: selectedCities,                             // V4 — multi-city
      city: selectedCities[0] || "",                      // backward-compat (primary)
      directories: selectedDirectories,                   // V4 — existing citation listings
      serviceAreaType,                                    // countrywide | region-specific | city-specific | multi-country
    };
    const now = JSON.stringify(payload);
    if (now !== JSON.stringify(lastSubmittedData.current)) {
      lastSubmittedData.current = payload;
      onLanguageLocationSubmit?.(payload);
    }
  }, [selectedLanguages, selectedCountries, selectedStates, selectedCities, selectedDirectories, serviceAreaType, onLanguageLocationSubmit]);

  useEffect(() => {
    if (tailRef.current) {
      requestAnimationFrame(() => {
        tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [selectedLanguages, selectedCountries, selectedStates, selectedCities, selectedDirectories, openDropdown, selectionsComplete]);


  const bootstrapWithRetry = async (payload) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch("/api/onboarding/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) return res;

      const errJson = await res.json().catch(() => ({}));
      const msg = String(errJson?.error || "");

      // Retry once only for timeout/abort (route returns 504 for aborts)
      if (attempt === 0 && (res.status === 504 || /aborted|timed out/i.test(msg))) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }

      throw new Error(msg || `Bootstrap failed (${res.status})`);
    }
  };


  const handleNext = async () => {
    if (!selectionsComplete || isBootstrapping) return;

    setIsBootstrapping(true);
    setBootstrapError(null);
    startFakeProgressTo92();

    try {
      const websiteData = readJson("websiteData");
      const businessData = readJson("businessData");

      const domain = normalizeHost(
        websiteData?.site || websiteData?.website || websiteData?.domain || websiteData?.url || ""
      );
      if (!domain) throw new Error("Missing website/domain (Step 1).");

      const industry = String(
        businessData?.industry || businessData?.businessIndustry || businessData?.category || businessData?.businessCategory || ""
      ).trim();

      // Location string: a single-country scope reads "City, State, Country" (primary
      // city/state); a multi-country scope reads "Country A, Country B".
      const location = selectedCountries.length > 1
        ? selectedCountries.join(", ")
        : [selectedCities[0], selectedStates[0], singleCountry].filter(Boolean).join(", ");
      const language = String(selectedLanguages[0] || "").trim();

      const res = await bootstrapWithRetry({ domain, industry, location, language });
      const data = await res.json();
try {
        localStorage.setItem("drfizz.bootstrap", JSON.stringify(data));
        localStorage.setItem("drfizz.bootstrap.key", makeKey(domain, industry, location));
        localStorage.setItem("drfizz.bootstrap.ts", String(Date.now()));
      } catch {}

      // Finish loader
      stopFakeProgress();
      setProgressPct(100);
      // Slight delay so users can see 100% before moving on
      setTimeout(() => onNext?.(), 250);
    } catch (e) {
      stopFakeProgress();
      setProgressPct(0);
      setBootstrapError(e?.message || "Bootstrap failed");
    } finally {
      stopFakeProgress();
      setIsBootstrapping(false);
    }
  };

  const handleBack = () => onBack?.();

  const handleDropdownToggle = (name, disabled) => {
    if (disabled) return;
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  // All toggles keep their dropdown OPEN so the user can pick more than one.
  const toggleIn = (setter) => (val) =>
    setter((prev) => (prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]));

  const onToggleLanguage = toggleIn(setSelectedLanguages);
  // Selecting/removing a country clears sub-region selections because state/city
  // are only valid for a single-country scope.
  const onToggleCountry = (c) => {
    setSelectedCountries((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setSelectedStates([]);
    setSelectedCities([]);
  };
  // Changing the set of states invalidates the city set (cities depend on states).
  const onToggleState = (s) => {
    setSelectedStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    setSelectedCities([]);
  };
  const onToggleCity = toggleIn(setSelectedCities);
  const onToggleDirectory = toggleIn(setSelectedDirectories);

  const addCustomDirectory = () => {
    const v = customDirectory.trim();
    if (!v) return;
    setSelectedDirectories((prev) => (prev.some((x) => x.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setCustomDirectory("");
  };

  const handleReset = () => {
    setSelectedLanguages([]);
    setSelectedCountries([]);
    setSelectedStates([]);
    setSelectedCities([]);
    setSelectedDirectories([]);
    setCustomDirectory("");
    lastSubmittedData.current = null;
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!e.target.closest(".dropdown-container")) setOpenDropdown(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const btnBase =
    "w-full bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-2.5 sm:py-3 text-left flex items-center justify-between transition-colors";
  const labelCls = "text-[12px] sm:text-[13px] md:text-[14px]";
  const ddListCls =
    "absolute top-full left-0 right-0 bg-[var(--input)] border border-[var(--border)] rounded-lg mt-1 shadow-2xl max-h-56 overflow-y-auto z-20";

  // Shared multi-select button label: "Select X" → the single value → "N selected".
  const multiLabel = (arr, placeholder, noun) =>
    arr.length === 0 ? placeholder : arr.length === 1 ? arr[0] : `${arr.length} ${noun} selected`;

  const languageButtonLabel = multiLabel(selectedLanguages, "Select Languages", "languages");
  const countryButtonLabel = multiLabel(selectedCountries, "Select Countries", "countries");
  const stateButtonLabel = multiLabel(selectedStates, "State / region (optional)", "regions");
  const cityButtonLabel = multiLabel(selectedCities, "City (optional)", "cities");
  const directoryButtonLabel = multiLabel(selectedDirectories, "Select directories (optional)", "selected");

  const singleCountryNeedsRegion = selectedCountries.length === 1;

  return (
    <div className="w-full h-full flex flex-col bg-transparent slides-accent overflow-x-hidden">
      <div className="px-3 sm:px-4 md:px-6 pt-4 sm:pt-5 md:pt-6">
        <div
          ref={panelRef}
          className="mx-auto w-full max-w-[1120px] rounded-2xl bg-transparent box-border"
          style={{ padding: "0px 24px", height: panelHeight ? `${panelHeight}px` : "auto" }}
        >
          <style jsx>{`
            .inner-scroll { scrollbar-width: none; -ms-overflow-style: none; }
            .inner-scroll::-webkit-scrollbar { display: none; }
          `}</style>

          <style jsx global>{`
            .progress-wrap {
              position: relative;
              height: 10px;
              width: 100%;
              border-radius: 9999px;
              background: #e5e7eb; /* light-mode neutral track */
              overflow: hidden;
            }
            html.dark .progress-wrap {
              background: #374151; /* dark-mode neutral track */
            }
            .progress-fill {
              position: absolute;
              left: 0;
              top: 0;
              bottom: 0;
              width: 0%;
              background: linear-gradient(90deg, #d45427 0%, #ffa615 100%);
              transition: width 120ms linear;
            }
          `}</style>

<div ref={scrollRef} className="inner-scroll h-full w-full overflow-y-auto">
            <div className="flex flex-col items-start text-start gap-5 sm:gap-6 md:gap-8 max-w-[820px] mx-auto">
              <div className="text-[11px] sm:text-[12px] md:text-[13px] text-[var(--muted)] font-medium">
                Step - 3
              </div>
              <div className="spacer-line w-[80%] self-start h-[1px] bg-[#d45427] mt-[-1%]" />

              <div className="space-y-2.5 sm:space-y-3 max-w-[640px]">
                <h1 className="text-[16px] sm:text-[18px] md:text-[22px] lg:text-[26px] font-bold text-[var(--text)]">
                  Select the languages and locations relevant to your business
                </h1>
                <p className="text-[13px] sm:text-[14px] md:text-[15px] text-[var(--muted)] leading-relaxed">
                  Every field here is multi-select — add as many languages and countries as you serve. Pick a single country to drill into states and cities. Directories are optional but help us spot citation gaps.
                </p>

                {bootstrapError && (
                  <p className="text-[12px] sm:text-[13px] md:text-[14px] text-red-500">
                    {bootstrapError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full max-w-[880px] relative pb-6">
                {/* Language — MULTI-SELECT */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "lang" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("lang", false)} type="button" className={btnBase}>
                    <span className={`${selectedLanguages.length ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {languageButtonLabel}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "lang" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "lang" && (
                    <div className={ddListCls}>
                      {languages.map((l) => {
                        const checked = selectedLanguages.includes(l);
                        return (
                        <button key={l} onClick={() => onToggleLanguage(l)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-2">
                          <span>{l}</span>
                          {checked && <Check size={16} className="text-[#d45427] shrink-0" />}
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Country — MULTI-SELECT */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "country" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("country", false)} type="button" className={btnBase}>
                    <span className={`${selectedCountries.length ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {countryButtonLabel}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "country" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "country" && (
                    <div className={ddListCls}>
                      {countries.map((c) => {
                        const checked = selectedCountries.includes(c);
                        return (
                          <button key={c} onClick={() => onToggleCountry(c)} type="button"
                            className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-2">
                            <span>{c}</span>
                            {checked && <Check size={16} className="text-[#d45427] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* State — MULTI-SELECT, only for a single-country scope */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "state" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("state", !singleCountryNeedsRegion)} type="button"
                    className={`${btnBase} ${!singleCountryNeedsRegion ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <span className={`${selectedStates.length ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {singleCountryNeedsRegion ? stateButtonLabel : "State (single country only)"}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "state" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "state" && singleCountryNeedsRegion && (
                    <div className={ddListCls}>
                      {states.map((s) => {
                        const checked = selectedStates.includes(s);
                        return (
                        <button key={s} onClick={() => onToggleState(s)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-2">
                          <span>{s}</span>
                          {checked && <Check size={16} className="text-[#d45427] shrink-0" />}
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* City — MULTI-SELECT, optional (depends on selected states) */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "city" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("city", !selectedStates.length)} type="button"
                    className={`${btnBase} ${!selectedStates.length ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <span className={`${selectedCities.length ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {cityButtonLabel}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "city" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "city" && selectedStates.length > 0 && (
                    <div className={ddListCls}>
                      {cities.map((ct) => {
                        const checked = selectedCities.includes(ct);
                        return (
                        <button key={ct} onClick={() => onToggleCity(ct)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-2">
                          <span>{ct}</span>
                          {checked && <Check size={16} className="text-[#d45427] shrink-0" />}
                        </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected-location chips (countries + states + cities) + detected scope */}
              {selectedCountries.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 -mt-2 max-w-[880px]">
                  {selectedCountries.map((c) => (
                    <span key={`country-${c}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--input)] border border-[var(--border)] px-3 py-1 text-[12px] text-[var(--text)]">
                      {c}
                      <button type="button" onClick={() => onToggleCountry(c)} className="text-[var(--muted)] hover:text-[#d45427] font-bold leading-none">×</button>
                    </span>
                  ))}
                  {selectedStates.map((s) => (
                    <span key={`state-${s}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--input)] border border-[var(--border)] px-3 py-1 text-[12px] text-[var(--muted)]">
                      {s}
                      <button type="button" onClick={() => onToggleState(s)} className="hover:text-[#d45427] font-bold leading-none">×</button>
                    </span>
                  ))}
                  {selectedCities.map((ct) => (
                    <span key={`city-${ct}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--input)] border border-[var(--border)] px-3 py-1 text-[12px] text-[var(--muted)]">
                      {ct}
                      <button type="button" onClick={() => onToggleCity(ct)} className="hover:text-[#d45427] font-bold leading-none">×</button>
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: "#FDF1EB", color: "#d45427" }}>
                    Scope: {serviceAreaLabel}
                  </span>
                </div>
              )}

              {/* Business directories / citations — MULTI-SELECT (optional) */}
              <div className="w-full max-w-[880px]">
                <label className="block text-[12px] sm:text-[13px] font-semibold text-[var(--text)] mb-2">
                  Where is your business already listed?{" "}
                  <span className="text-[var(--muted)] font-normal">(directories &amp; citations — optional)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
                  <div className="relative dropdown-container overflow-visible w-full sm:max-w-[320px]" style={{ zIndex: openDropdown === "directories" ? 1000 : 1 }}>
                    <button onClick={() => handleDropdownToggle("directories", false)} type="button" className={btnBase}>
                      <span className={`${selectedDirectories.length ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                        {directoryButtonLabel}
                      </span>
                      <ChevronDown size={20} className={`transition-transform ${openDropdown === "directories" ? "rotate-180" : ""}`} />
                    </button>
                    {openDropdown === "directories" && (
                      <div className={ddListCls}>
                        {DIRECTORY_GROUPS.map((group) => (
                          <div key={group.label}>
                            <div className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wide font-semibold text-[var(--muted)] bg-[var(--input)] sticky top-0">
                              {group.label}
                            </div>
                            {group.items.map((d) => {
                              const checked = selectedDirectories.includes(d);
                              return (
                                <button key={d} onClick={() => onToggleDirectory(d)} type="button"
                                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] border-b border-[var(--border)] last:border-b-0 flex items-center justify-between gap-2">
                                  <span>{d}</span>
                                  {checked && <Check size={16} className="text-[#d45427] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:max-w-[320px]">
                    <input
                      type="text"
                      value={customDirectory}
                      onChange={(e) => setCustomDirectory(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomDirectory(); } }}
                      placeholder="Add another directory…"
                      className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[12px] sm:text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[#d45427]"
                    />
                    <button type="button" onClick={addCustomDirectory}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#d45427] text-[#d45427] px-3 py-2.5 text-[12px] font-semibold hover:bg-[#FDF1EB]">
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
                {selectedDirectories.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {selectedDirectories.map((d) => (
                      <span key={`dir-${d}`} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--input)] border border-[var(--border)] px-3 py-1 text-[12px] text-[var(--text)]">
                        {d}
                        <button type="button" onClick={() => onToggleDirectory(d)} className="text-[var(--muted)] hover:text-[#d45427] font-bold leading-none">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {selectionsComplete && (
                <div className="max-w-[640px] text-left self-start mt-1">
                  <h3 className="text-[15px] sm:text-[16px] md:text-[18px] font-bold text-[var(--text)] mb-2.5 sm:mb-3">
                    Awesome — ready to build your site report.
                  </h3>
                  <p className="text-[12px] sm:text-[13px] md:text-[15px] text-[var(--muted)]">
                    Want to change anything?
                    <button onClick={handleReset} className="ml-2 text-gray-500 hover:text-gray-700 font-semibold" type="button">
                      YES!
                    </button>
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
              onClick={handleBack}
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--input)] px-5 sm:px-6 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] hover:bg-[var(--input)] shadow-sm border border-[#d45427]"
            >
              <ArrowLeft size={16} /> Back
            </button>

            {selectionsComplete && (
              <button
                onClick={handleNext}
                type="button"
                disabled={isBootstrapping}
                className={`inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-5 sm:px-6 py-2.5 sm:py-3 text-white shadow-sm text-[13px] md:text-[14px] ${
                  isBootstrapping ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
                }`}
              >
                {isBootstrapping ? "Preparing…" : "Next"} <ArrowRight size={16} />
              </button>
            )}
          </div>
          {isBootstrapping && (
            <div className="pb-5 sm:pb-6 md:pb-7 -mt-2 flex items-center justify-center">
              <div className="w-full max-w-[720px] px-3 sm:px-4">
                <div className="progress-wrap">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
