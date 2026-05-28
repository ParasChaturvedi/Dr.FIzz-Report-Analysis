// src/app/page.js
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Steps from "./components/Steps";
import Step1Slide1 from "./components/Step1Slide1";
import StepSlide2 from "./components/StepSlide2";
import StepSlide3 from "./components/StepSlide3";
import StepSlide4 from "./components/StepSlide4";
import StepSlide5 from "./components/StepSlide5";
import Step5Slide2 from "./components/Step5Slide2";
import ThemeToggle from "./components/ThemeToggle";
import SidebarInfoPanel from "./components/SidebarInfoPanel";
import Dashboard from "./components/Dashboard";
import ContentEditor from "./components/ContentEditor";
import { prefetchOpportunitiesAndContent } from "@/lib/prefetch-opportunities";

/* ---------- Mobile-only compact steps: 3 / 2 with dotted connectors ---------- */
function MobileStepsThreeTwo({ currentStep }) {
  const active = typeof currentStep === "number" ? currentStep : 5;

  const Dot = ({ n }) => {
    const state = n === active ? "active" : n < active ? "complete" : "idle";
    const cls =
      state === "active"
        ? "bg-[image:var(--infoHighlight-gradient)] text-white"
        : state === "complete"
        ? "bg-gray-700 text-white"
        : "bg-gray-200 text-gray-600";
    return (
      <div
        className={`h-7 w-7 rounded-full grid place-items-center text-[11px] font-semibold ${cls}`}
        aria-current={n === active ? "step" : undefined}
        aria-label={`Step ${n} of 5`}
      >
        {n}
      </div>
    );
  };

  const DottedConnector = ({ size = 3, count = 5, color = "bg-gray-300/90" }) => (
    <div className="flex items-center justify-center shrink-0 gap-1.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={`block rounded-full ${color}`} style={{ width: size, height: size }} />
      ))}
    </div>
  );

  const Row3 = ({ a, b, c }) => (
    <div className="flex items-center justify-center gap-2">
      <Dot n={a} />
      <DottedConnector />
      <Dot n={b} />
      <DottedConnector />
      <Dot n={c} />
    </div>
  );

  const Row2 = ({ a, b }) => (
    <div className="flex items-center justify-center gap-2">
      <Dot n={a} />
      <DottedConnector />
      <Dot n={b} />
    </div>
  );

  return (
    <div className="sm:hidden w-full bg-[var(--bg-panel)] rounded-tl-2xl rounded-tr-2xl pt-10 pb-2 px-3">
      <div className="mx-auto w-fit space-y-6">
        <Row3 a={1} b={2} c={3} />
        <Row2 a={4} b={5} />
      </div>
    </div>
  );
}

function clearBootstrapCache() {
  try {
    localStorage.removeItem("drfizz.bootstrap");
    localStorage.removeItem("drfizz.bootstrap.key");
    localStorage.removeItem("drfizz.bootstrap.ts");
  } catch {}
}

/**
 * ✅ NEW: Fire-and-forget warmup so opportunities scan starts in Step-1 itself.
 * This ensures titles/content are cached before Dashboard loads.
 */
function warmupOpportunitiesScan(cleanWebsite) {
  let domain = String(cleanWebsite || "").trim().toLowerCase();
  if (!domain) return;

  if (domain.startsWith("http://")) domain = domain.replace("http://", "");
  if (domain.startsWith("https://")) domain = domain.replace("https://", "");
  if (domain.startsWith("www.")) domain = domain.slice(4);

  const websiteUrl = `https://${domain}`;

  try {
    fetch("/api/seo/opportunities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ websiteUrl, allowSubdomains: true }),
    }).catch(() => {});
  } catch {}
}

export default function Home() {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const [currentStep, setCurrentStep] = useState(() => {
    // Avoid "Step 1" flash on initial paint when URL is #dashboard (e.g., OAuth return)
    if (typeof window === "undefined") return 1;

    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected") === "1";
    const hash = window.location.hash;

    if (connected || hash === "#dashboard") return "dashboard";
    if (hash === "#editor") return "contentEditor";
    return 1;
  });

  const [websiteData, setWebsiteData] = useState(null);
  const [businessData, setBusinessData] = useState(null);
  const [languageLocationData, setLanguageLocationData] = useState(null);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [competitorData, setCompetitorData] = useState(null);

  const [editorData, setEditorData] = useState(null);
  const [catalog, setCatalog] = useState([]);

  const infoRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // ✅ NEW: prevents re-warming repeatedly for same domain
  const lastWarmedDomainRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const connected = url.searchParams.get("connected") === "1";
    const hash = window.location.hash;

    // If returning from Google OAuth, jump straight to dashboard view.
    if (connected || hash === "#dashboard") {
      setCurrentStep("dashboard");

      // Optional: clean ?connected=1 so refreshes look normal
      if (connected) {
        url.searchParams.delete("connected");
        window.history.replaceState(null, "", url.pathname + url.search + (hash || ""));
      }
      return;
    }

    // Existing behavior
    if (hash === "#editor") setCurrentStep("contentEditor");
  }, []);

  useEffect(() => {
    fetch("/data/contenteditor.json")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        infoRef.current &&
        !infoRef.current.contains(event.target) &&
        !event.target.closest("#sidebar-info-btn") &&
        !isPinned
      ) {
        setIsInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPinned]);

  useEffect(() => {
    const toEditor = (e) => {
      const p = e?.detail ?? null;
      if (!p) {
        setEditorData(null);
        setCurrentStep("contentEditor");
        return;
      }

      const match =
        catalog.find((x) => x.title === p.title) ||
        catalog.find((x) => x.domain === p.domain) ||
        null;

      const merged = match
        ? { ...match, ...p, title: p.title ?? match.title, content: p.content ?? match.content }
        : p;

      if (merged && merged.domain) {
        try {
          localStorage.setItem("websiteData", JSON.stringify({ site: merged.domain }));
        } catch {}
      }

      setEditorData(merged);
      setCurrentStep("contentEditor");
    };

    const toDashboard = () => {
      setEditorData(null);
      setCurrentStep("dashboard");
    };

    window.addEventListener("content-editor:open", toEditor);
    window.addEventListener("content-editor:back", toDashboard);
    return () => {
      window.removeEventListener("content-editor:open", toEditor);
      window.removeEventListener("content-editor:back", toDashboard);
    };
  }, [catalog]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Keep URL hash in sync with the active view.
    // This helps avoid "Step 1" flashes on refresh and makes back/forward behavior predictable.
    if (currentStep === "contentEditor") {
      if (window.location.hash !== "#editor") history.replaceState(null, "", "#editor");
      return;
    }

    if (currentStep === "dashboard") {
      if (window.location.hash !== "#dashboard") history.replaceState(null, "", "#dashboard");
      return;
    }

    // Wizard/steps views: clear dashboard/editor hashes
    if (window.location.hash === "#editor" || window.location.hash === "#dashboard") {
      history.replaceState(null, "", "#");
    }
  }, [currentStep]);

  useEffect(() => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = 0;
  }, [currentStep]);

  useEffect(() => {
    const onWizardNavigate = (e) => {
      const step = e?.detail?.step ?? e?.step ?? null;
      if (!step) return;
      setCurrentStep(step);
    };
    window.addEventListener("wizard:navigate", onWizardNavigate);
    return () => window.removeEventListener("wizard:navigate", onWizardNavigate);
  }, []);

  const handleNextStep = () => {
    if (currentStep === 5) return setCurrentStep("5b");
    if (typeof currentStep === "number" && currentStep < 5) setCurrentStep((s) => s + 1);
  };

  const handleBackStep = () => {
    if (currentStep === "5b") return setCurrentStep(5);
    if (typeof currentStep === "number" && currentStep > 1) setCurrentStep((s) => s - 1);
  };

  const handleWebsiteSubmit = useCallback((website) => {
    let cleanWebsite = String(website || "").toLowerCase().trim();
    if (cleanWebsite.startsWith("http://")) cleanWebsite = cleanWebsite.replace("http://", "");
    if (cleanWebsite.startsWith("https://")) cleanWebsite = cleanWebsite.replace("https://", "");
    if (cleanWebsite.startsWith("www.")) cleanWebsite = cleanWebsite.replace("www.", "");

    const payload = { website: cleanWebsite, submittedAt: new Date() };
    setWebsiteData(payload);

    try {
      localStorage.setItem("websiteData", JSON.stringify({ site: cleanWebsite }));
    } catch {}

    clearBootstrapCache();

    setIsInfoOpen(true);
    setIsPinned(true);

    // ✅ NEW: start opportunities scan right after domain submit
    if (cleanWebsite && lastWarmedDomainRef.current !== cleanWebsite) {
      lastWarmedDomainRef.current = cleanWebsite;
      warmupOpportunitiesScan(cleanWebsite);
      // starts polling + fetches titles + fetches content for best 2 blogs + 2 pages
      // and writes drfizz.opps.v1:<domain> sessionStorage cache
      prefetchOpportunitiesAndContent(cleanWebsite, { concurrency: 2 }).catch(() => {});
    }
  }, []);

  const handleBusinessDataSubmit = useCallback((business) => {
    setBusinessData(business);
    try {
      localStorage.setItem("businessData", JSON.stringify(business || {}));
    } catch {}
    clearBootstrapCache();
  }, []);

  const handleLanguageLocationSubmit = useCallback((data) => {
    setLanguageLocationData(data);
    try {
      localStorage.setItem("languageLocationData", JSON.stringify(data || {}));
    } catch {}
    clearBootstrapCache();
  }, []);

  const handleKeywordSubmit = useCallback((data) => {
    const kws = Array.isArray(data?.keywords) ? data.keywords : [];
    setSelectedKeywords(kws);
    try {
      localStorage.setItem("selectedKeywords", JSON.stringify(kws));
    } catch {}
  }, []);

  const handleCompetitorSubmit = useCallback(
    (data) =>
      setCompetitorData(data || { businessCompetitors: [], searchCompetitors: [], totalCompetitors: [] }),
    []
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1Slide1 onNext={handleNextStep} onWebsiteSubmit={handleWebsiteSubmit} />;

      case 2:
        return (
          <StepSlide2
            onNext={handleNextStep}
            onBack={handleBackStep}
            onBusinessDataSubmit={handleBusinessDataSubmit}
          />
        );

      case 3:
        return (
          <StepSlide3
            onNext={handleNextStep}
            onBack={handleBackStep}
            onLanguageLocationSubmit={handleLanguageLocationSubmit}
          />
        );

      case 4:
        return (
          <StepSlide4
            onNext={handleNextStep}
            onBack={handleBackStep}
            onKeywordSubmit={handleKeywordSubmit}
            businessData={businessData}
            languageLocationData={languageLocationData}
          />
        );

      case 5:
        return (
          <StepSlide5
            onNext={handleNextStep}
            onBack={handleBackStep}
            onCompetitorSubmit={handleCompetitorSubmit}
            businessData={businessData}
            languageLocationData={languageLocationData}
            selectedKeywords={selectedKeywords}
          />
        );

      case "5b":
        return (
          <Step5Slide2
            onBack={() => setCurrentStep(5)}
            onDashboard={() => setCurrentStep("dashboard")}
            businessData={businessData}
            languageLocationData={languageLocationData}
            keywordData={selectedKeywords}
            competitorData={competitorData}
          />
        );

      case "dashboard":
        return (
          <Dashboard
            onOpenContentEditor={(payload) => {
              if (!payload) {
                setEditorData(null);
                setCurrentStep("contentEditor");
                return;
              }

              const match =
                catalog.find((x) => x.title === payload.title) ||
                catalog.find((x) => x.domain === payload.domain) ||
                null;

              const merged = match
                ? { ...match, ...payload, title: payload.title ?? match.title, content: payload.content ?? match.content }
                : payload;

              if (merged && merged.domain) {
                try {
                  localStorage.setItem("websiteData", JSON.stringify({ site: merged.domain }));
                } catch {}
              }

              setEditorData(merged);
              setCurrentStep("contentEditor");
            }}
          />
        );

      case "contentEditor":
        return (
          <ContentEditor
            data={editorData}
            onBackToDashboard={() => {
              setEditorData(null);
              setCurrentStep("dashboard");
            }}
          />
        );

      default:
        return <Step1Slide1 onNext={handleNextStep} onWebsiteSubmit={handleWebsiteSubmit} />;
    }
  };

  const mainOffsetClass =
    isInfoOpen || isPinned ? "ml-[56px] md:ml-[72px] lg:ml-[510px]" : "ml-[56px] md:ml-[72px] lg:ml-[80px]";

  const sidebarVariant = currentStep === "contentEditor" ? "editor" : "default";

  return (
    <div className="flex h-screen overflow-hidden bg-[image:var(--brand-gradient)] bg-no-repeat bg-[size:100%_100%] p-3">
      <SidebarInfoPanel
        ref={infoRef}
        onInfoClick={() => {
          if (isPinned) return;
          setIsInfoOpen((prev) => !prev);
        }}
        infoActive={isInfoOpen || isPinned}
        isOpen={isInfoOpen}
        isPinned={isPinned}
        setIsPinned={setIsPinned}
        websiteData={websiteData}
        businessData={businessData}
        languageLocationData={languageLocationData}
        keywordData={selectedKeywords}
        competitorData={competitorData}
        currentStep={currentStep === "5b" ? 5 : currentStep}
        onClose={() => setIsInfoOpen(false)}
        variant={sidebarVariant}
      />

      <ThemeToggle />

      <main className={`flex-1 min-w-0 flex flex-col min-h-0 transition-all duration-300 ${mainOffsetClass}`}>
        {currentStep !== "5b" && currentStep !== "dashboard" && currentStep !== "contentEditor" && (
          <>
            <MobileStepsThreeTwo currentStep={currentStep} />

            <div className="hidden sm:flex w-full justify-center">
              <div className="max-w-[100%] w-full rounded-tr-2xl rounded-tl-2xl px-5 md:px-6 py-5 md:py-6 bg-[var(--bg-panel)] text-sm md:text-base overflow-hidden">
                <div className="flex justify-center">
                  <Steps currentStep={currentStep === "5b" ? 5 : currentStep} />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex-1 min-w-0 h-full flex justify-center items-start no-scrollbar">
          <style jsx global>{`
            .no-scrollbar {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
          `}</style>

          <div
            ref={scrollContainerRef}
            className={`relative flex-1 min-w-0 h-full bg-[var(--bg-panel)] shadow-sm ${
              currentStep === "dashboard" || currentStep === "contentEditor" || currentStep === "5b"
                ? "rounded-2xl"
                : "rounded-bl-2xl rounded-br-2xl"
            } overflow-y-scroll overscroll-contain no-scrollbar`}
          >
            {renderCurrentStep()}
          </div>
        </div>
      </main>
    </div>
  );
}
