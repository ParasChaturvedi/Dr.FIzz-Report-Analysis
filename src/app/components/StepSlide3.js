// src/components/StepSlide3.js
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, ArrowLeft, ChevronDown } from "lucide-react";

export default function StepSlide3({ onNext, onBack, onLanguageLocationSubmit }) {
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");

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

  const languages = [
    "English","Spanish","French","German","Italian","Portuguese",
    "Chinese (Mandarin)","Japanese","Korean","Hindi","Bengali","Russian",
    "Arabic","Turkish","Vietnamese","Polish","Persian","Dutch","Thai"
  ];

  const geo = {
    India: {
      Karnataka: ["Bengaluru", "Mysuru"],
      Maharashtra: ["Mumbai", "Pune"],
      Delhi: ["New Delhi"],
    },
    "United States": {
      California: ["San Francisco", "Los Angeles"],
      "New York": ["New York City", "Buffalo"],
    },
    "United Kingdom": {
      England: ["London", "Manchester"],
      Scotland: ["Edinburgh", "Glasgow"],
    },
  };

  const countries = Object.keys(geo);
  const states = selectedCountry ? Object.keys(geo[selectedCountry] || {}) : [];
  const cities = selectedCountry && selectedState ? geo[selectedCountry]?.[selectedState] || [] : [];

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
  }, [selectedLanguage, selectedCountry, selectedState, selectedCity]);

  const selectionsComplete = !!(selectedLanguage && selectedCountry && selectedState && selectedCity);

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
      language: selectedLanguage || "",
      country: selectedCountry || "",
      state: selectedState || "",
      city: selectedCity || "",
    };
    const now = JSON.stringify(payload);
    if (now !== JSON.stringify(lastSubmittedData.current)) {
      lastSubmittedData.current = payload;
      onLanguageLocationSubmit?.(payload);
    }
  }, [selectedLanguage, selectedCountry, selectedState, selectedCity, onLanguageLocationSubmit]);

  useEffect(() => {
    if (tailRef.current) {
      requestAnimationFrame(() => {
        tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [selectedLanguage, selectedCountry, selectedState, selectedCity, openDropdown, selectionsComplete]);


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

      const location = [selectedCity, selectedState, selectedCountry].filter(Boolean).join(", ");
      const language = String(selectedLanguage || "").trim();

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

  const onSelectLanguage = (l) => { setSelectedLanguage(l); setOpenDropdown(null); };
  const onSelectCountry = (c) => { setSelectedCountry(c); setSelectedState(""); setSelectedCity(""); setOpenDropdown(null); };
  const onSelectState = (s) => { setSelectedState(s); setSelectedCity(""); setOpenDropdown(null); };
  const onSelectCity = (ct) => { setSelectedCity(ct); setOpenDropdown(null); };

  const handleReset = () => {
    setSelectedLanguage("");
    setSelectedCountry("");
    setSelectedState("");
    setSelectedCity("");
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
              background: #e6e8eb; /* neutral grey track */
              overflow: hidden;
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
                  Choose your language & business locations.
                </p>

                {bootstrapError && (
                  <p className="text-[12px] sm:text-[13px] md:text-[14px] text-red-500">
                    {bootstrapError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full max-w-[880px] relative pb-6">
                {/* Language */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "lang" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("lang", false)} type="button" className={btnBase}>
                    <span className={`${selectedLanguage ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {selectedLanguage || "Select Language"}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "lang" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "lang" && (
                    <div className={ddListCls}>
                      {languages.map((l) => (
                        <button key={l} onClick={() => onSelectLanguage(l)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0">
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Country */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "country" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("country", false)} type="button" className={btnBase}>
                    <span className={`${selectedCountry ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {selectedCountry || "Select Country"}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "country" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "country" && (
                    <div className={ddListCls}>
                      {countries.map((c) => (
                        <button key={c} onClick={() => onSelectCountry(c)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0">
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* State */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "state" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("state", !selectedCountry)} type="button"
                    className={`${btnBase} ${!selectedCountry ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <span className={`${selectedState ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {selectedState || "Select State"}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "state" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "state" && selectedCountry && (
                    <div className={ddListCls}>
                      {states.map((s) => (
                        <button key={s} onClick={() => onSelectState(s)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* City */}
                <div className="relative dropdown-container overflow-visible" style={{ zIndex: openDropdown === "city" ? 1000 : 1 }}>
                  <button onClick={() => handleDropdownToggle("city", !selectedState)} type="button"
                    className={`${btnBase} ${!selectedState ? "opacity-60 cursor-not-allowed" : ""}`}>
                    <span className={`${selectedCity ? "text-[var(--text)]" : "text-[var(--muted)]"} ${labelCls}`}>
                      {selectedCity || "Select City"}
                    </span>
                    <ChevronDown size={20} className={`transition-transform ${openDropdown === "city" ? "rotate-180" : ""}`} />
                  </button>
                  {openDropdown === "city" && selectedState && (
                    <div className={ddListCls}>
                      {cities.map((ct) => (
                        <button key={ct} onClick={() => onSelectCity(ct)} type="button"
                          className="w-full text-left px-4 py-2.5 sm:py-3 hover:bg-[var(--menuHover)] focus:bg-[var(--menuFocus)] text-[var(--text)] text-[12px] sm:text-[13px] md:text-[14px] border-b border-[var(--border)] last:border-b-0">
                          {ct}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
