"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowRight, ArrowLeft, Plus, X, Check, Sparkles, Info } from "lucide-react";

const MIN_SELECTED = 15;
const AUDIT_COUNT = 15;
const TARGET_COUNT = 30;
const EST_MS = 55000; // ~expected authoring time (Claude prompt-set architect)

/* Tolerant storage read (matches the rest of the wizard: localStorage first, then sessionStorage). */
function readJson(key) {
  try {
    const raw = (typeof localStorage !== "undefined" && localStorage.getItem(key)) ||
                (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) || "";
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function readSite() {
  for (const k of ["websiteData", "site", "website", "selectedWebsite", "drfizzm.site", "drfizzm.website"]) {
    const v = readJson(k);
    const s = typeof v === "string" ? v : (v?.site || v?.website || v?.domain || "");
    if (s) return String(s).trim();
  }
  return "";
}
const cleanDomain = (s) => String(s || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();

export default function StepSlideGeoPrompts({
  onNext,
  onBack,
  onGeoPromptsSubmit,
  businessData,
  languageLocationData,
  selectedKeywords,
}) {
  const [prompts, setPrompts] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [custom, setCustom] = useState([]);
  const [customInput, setCustomInput] = useState("");
  const [projectId, setProjectId] = useState(null);
  const [runId, setRunId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const startedRef = useRef(false);

  // Pin the bottom bar exactly like the other steps: compute the scroll-panel height so it fills the
  // space between the panel top and the (in-flow) bottom bar, and the content scrolls INSIDE it.
  const panelRef = useRef(null);
  const bottomBarRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);
  useEffect(() => {
    const recompute = () => {
      if (!panelRef.current) return;
      const vpH = window.innerHeight;
      const barH = bottomBarRef.current?.getBoundingClientRect().height ?? 0;
      const topOffset = panelRef.current.getBoundingClientRect().top;
      setPanelHeight(Math.max(360, vpH - barH - topOffset - 24));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", recompute);
    return () => { ro.disconnect(); window.removeEventListener("resize", recompute); };
  }, []);

  const domain = useMemo(() => cleanDomain(readSite()), []);

  // Build the planner source from the onboarding data collected so far (neutral prompts don't need competitors).
  const source = useMemo(() => {
    const biz = businessData || readJson("businessData") || {};
    const loc = languageLocationData || readJson("languageLocationData") || {};
    const kws = Array.isArray(selectedKeywords) ? selectedKeywords : (readJson("selectedKeywords") || []);
    return {
      domain,
      name: biz.businessName || biz.name || "",
      industry: biz.industrySector || biz.industry || "",
      category: biz.category || biz.offeringType || "",
      keywords: (Array.isArray(kws) ? kws : []).map((k) => (typeof k === "string" ? k : k?.keyword)).filter(Boolean).slice(0, 30),
      country: loc.country || loc.countryCode || "",
      state: loc.state || "",
      city: loc.city || loc.location || "",
    };
  }, [domain, businessData, languageLocationData, selectedKeywords]);

  // Simulated real-time progress while the (single, non-streaming) Claude author runs. Eases toward 95%
  // over the expected duration, then the hydrate below snaps it to 100% the moment the set arrives.
  useEffect(() => {
    if (!loading) return;
    const start = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const id = setInterval(() => {
      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      const target = 95 * (1 - Math.exp(-elapsed / (EST_MS / 3)));
      setPct((p) => Math.max(p, Math.min(95, Math.round(target))));
    }, 350);
    return () => clearInterval(id);
  }, [loading]);

  // Generate the candidate set once. Cached per-domain so going Back/Next doesn't re-run the Claude author.
  useEffect(() => {
    if (startedRef.current || !domain) return;
    startedRef.current = true;
    const cacheKey = `geoPromptCandidates:${domain}`;
    const cached = readJson(cacheKey);
    const hydrate = (data) => {
      const list = Array.isArray(data.prompts) ? data.prompts : [];
      setPrompts(list);
      setProjectId(data.project_id || null);
      setRunId(data.run_id || null);
      // Auto-select ONLY the most relevant + highest-accuracy prompts: rank by quality_score
      // (0-100 neutrality/accuracy score) first, then priority. Take the top AUDIT_COUNT.
      const auto = [...list]
        .sort((a, b) => { const qa = Number(a.quality_score) || 0, qb = Number(b.quality_score) || 0; return qb !== qa ? qb - qa : (a.priority || 999) - (b.priority || 999); })
        .slice(0, AUDIT_COUNT).map((p) => p.prompt_id);
      setSelected(new Set(auto));
      setPct(100);
      setTimeout(() => setLoading(false), 250);
    };
    if (cached?.prompts?.length) { hydrate(cached); return; }
    (async () => {
      try {
        const res = await fetch("/api/seo/geo/prompts/onboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, source, targetCount: TARGET_COUNT }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `generate failed (${res.status})`);
        try { localStorage.setItem(cacheKey, JSON.stringify(json)); } catch {}
        hydrate(json);
      } catch (e) {
        setError(String(e?.message || e));
        setLoading(false);
      }
    })();
  }, [domain, source]);

  const toggle = useCallback((id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);
  const addCustom = useCallback(() => {
    const t = customInput.trim();
    if (t.length < 6) return;
    setCustom((prev) => (prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]));
    setCustomInput("");
  }, [customInput]);
  const removeCustom = useCallback((t) => setCustom((prev) => prev.filter((x) => x !== t)), []);

  const totalChosen = selected.size + custom.length;
  const canContinue = totalChosen >= MIN_SELECTED && !loading && !submitting;

  const handleNext = useCallback(async () => {
    if (!canContinue) return;
    setSubmitting(true);
    const payload = { project_id: projectId, run_id: runId, selectedPromptIds: [...selected], customPrompts: custom };
    try {
      if (projectId) {
        await fetch("/api/seo/geo/prompts/onboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize", projectId, runId, selectedPromptIds: [...selected], customPrompts: custom }),
        });
      }
      try { localStorage.setItem("selectedGeoPrompts", JSON.stringify(payload)); } catch {}
      onGeoPromptsSubmit && onGeoPromptsSubmit(payload);
      onNext && onNext();
    } catch (e) {
      setError(String(e?.message || e));
      setSubmitting(false);
    }
  }, [canContinue, projectId, runId, selected, custom, onGeoPromptsSubmit, onNext]);

  const groups = useMemo(() => {
    const g = {};
    for (const p of prompts) { const k = p.cluster || "GEO"; (g[k] ||= []).push(p); }
    for (const k in g) g[k].sort((a, b) => (a.priority || 999) - (b.priority || 999));
    return g;
  }, [prompts]);

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-x-hidden">
      <div className="px-3 sm:px-4 md:px-6 pt-5 sm:pt-6 md:pt-7">
        <div ref={panelRef} className="mx-auto w-full max-w-[1120px] box-border" style={{ padding: "0px 24px", height: panelHeight ? `${panelHeight}px` : "auto" }}>
          <style jsx>{`.inner-scroll{scrollbar-width:none;-ms-overflow-style:none}.inner-scroll::-webkit-scrollbar{display:none}`}</style>
          <div className="inner-scroll h-full w-full overflow-y-auto">
          <div className="max-w-[820px] mx-auto">
            {/* header */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-[12px] font-semibold text-[#d45427] uppercase tracking-wide">
                <Sparkles size={13} /> GEO Prompts
              </div>
              <h2 className="mt-1 text-xl sm:text-2xl font-bold text-[var(--text)]">The AI prompts we&apos;ll run for you</h2>
              <p className="mt-1 text-[13px] text-[var(--muted)] max-w-[560px] mx-auto">
                We generate {TARGET_COUNT} high-relevance, neutral buyer prompts for your market. The top {AUDIT_COUNT} are
                pre-selected — adjust the selection (minimum {MIN_SELECTED}) and add your own below.
              </p>
            </div>

            {loading ? (
              <div className="py-14 flex flex-col items-center gap-4">
                {/* circular percentage loader */}
                <div className="relative h-20 w-20">
                  <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="8" />
                    <circle cx="50" cy="50" r="44" fill="none" stroke="#d45427" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 44} strokeDashoffset={2 * Math.PI * 44 * (1 - pct / 100)}
                      style={{ transition: "stroke-dashoffset 350ms ease" }} />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-[15px] font-bold text-[var(--text)]">{pct}%</div>
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium text-[var(--text)]">Generating your prompt set…</p>
                  <p className="text-[12px] text-[var(--muted)] mt-0.5">Authoring {TARGET_COUNT} neutral prompts — this usually takes ~30–60 seconds.</p>
                </div>
              </div>
            ) : error ? (
              <div className="py-12 text-center">
                <p className="text-[13px] text-red-500">Couldn&apos;t generate prompts: {error}</p>
                <button onClick={() => { startedRef.current = false; setError(null); setPct(0); setLoading(true); }} className="mt-3 text-[13px] font-semibold text-[#d45427] underline">Retry</button>
              </div>
            ) : (
              <>
                {/* selected counter */}
                <div className="mt-5 mb-3 flex items-center justify-between rounded-lg bg-[var(--input)] px-3 py-2 border border-[var(--border)]">
                  <span className="text-[13px] font-semibold text-[var(--text)]">{totalChosen} selected</span>
                  <span className={`text-[12px] font-medium ${totalChosen >= MIN_SELECTED ? "text-emerald-600" : "text-[#d45427]"}`}>
                    {totalChosen >= MIN_SELECTED ? "✓ ready" : `select ${MIN_SELECTED - totalChosen} more (min ${MIN_SELECTED})`}
                  </span>
                </div>

                {/* prompt list, grouped by campaign */}
                {Object.entries(groups).map(([cluster, list]) => (
                  <div key={cluster} className="mb-4">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{cluster}</div>
                    <div className="space-y-1.5">
                      {list.map((p) => {
                        const on = selected.has(p.prompt_id);
                        return (
                          <button key={p.prompt_id} type="button" onClick={() => toggle(p.prompt_id)}
                            className={`w-full flex items-start gap-2.5 text-left rounded-lg border px-3 py-2 transition-colors ${on ? "border-[#d45427] bg-[#d45427]/10" : "border-[var(--border)] bg-[var(--input)] hover:border-[#d45427]/50"}`}>
                            <span className={`mt-0.5 grid place-items-center h-4 w-4 rounded shrink-0 border ${on ? "bg-[#d45427] border-[#d45427] text-white" : "border-[var(--muted)]"}`}>
                              {on ? <Check size={12} /> : null}
                            </span>
                            <span className="text-[13px] leading-snug text-[var(--text)]">{p.prompt_text}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Others — add custom prompts. Added prompts render as FULL ROWS (checkbox + text +
                    remove), identical to the generated prompts, so they read as part of the same list. */}
                <div className="mt-5">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Others — add your own</div>
                  {custom.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {custom.map((t) => (
                        <div key={t} className="w-full flex items-start gap-2.5 rounded-lg border border-[#d45427] bg-[#d45427]/10 px-3 py-2">
                          <span className="mt-0.5 grid place-items-center h-4 w-4 rounded shrink-0 border bg-[#d45427] border-[#d45427] text-white"><Check size={12} /></span>
                          <span className="flex-1 text-[13px] leading-snug text-[var(--text)]">{t}</span>
                          <button type="button" onClick={() => removeCustom(t)} aria-label="Remove" className="text-[var(--muted)] hover:text-[#d45427] shrink-0 mt-0.5"><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={customInput} onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                      placeholder="Type a prompt buyers might ask an AI…"
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[#d45427]" />
                    <button type="button" onClick={addCustom} disabled={customInput.trim().length < 6}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#d45427] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>

                {/* disclaimer — rust accent + readable text so it is clearly visible on the panel bg */}
                <div className="mt-5 flex items-start gap-2 rounded-lg bg-[#d45427]/10 border border-[#d45427]/45 px-3.5 py-2.5">
                  <Info size={15} className="mt-0.5 shrink-0 text-[#d45427]" />
                  <p className="text-[12.5px] leading-snug text-[var(--text)]">
                    <b className="text-[#d45427]">Note:</b> the audit analyses {AUDIT_COUNT} prompts. Any additional prompts you select or add still run and appear in your dashboard.
                  </p>
                </div>
                <div className="h-2" />
              </>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* in-flow bottom bar — centered Back + Next, identical to the other steps */}
      <div ref={bottomBarRef} className="flex-shrink-0 bg-transparent">
        <div className="border-t border-[var(--border)]" />
        <div className="mx-auto w-full max-w-[1120px] px-3 sm:px-4 md:px-6">
          <div className="py-5 sm:py-6 md:py-7 flex justify-center gap-3 sm:gap-4">
            <button onClick={onBack} type="button"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--input)] px-5 sm:px-6 py-2.5 sm:py-3 text-[12px] sm:text-[13px] md:text-[14px] text-[var(--text)] hover:opacity-90 shadow-sm border border-[#d45427]">
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={handleNext} disabled={!canContinue} type="button"
              className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-5 sm:px-6 py-2.5 sm:py-3 text-white hover:opacity-90 shadow-sm text-[13px] md:text-[14px] disabled:opacity-40">
              {submitting ? "Saving…" : "Next"} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
