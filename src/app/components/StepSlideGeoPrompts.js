"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowRight, ArrowLeft, Plus, X, Check, Sparkles } from "lucide-react";

const MIN_SELECTED = 15;
const AUDIT_COUNT = 15;

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
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const startedRef = useRef(false);

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
      // auto-select the highest-relevance ones (lowest priority number), aim for the audit count
      const auto = [...list].sort((a, b) => (a.priority || 999) - (b.priority || 999)).slice(0, AUDIT_COUNT).map((p) => p.prompt_id);
      setSelected(new Set(auto));
      setLoading(false);
    };
    if (cached?.prompts?.length) { hydrate(cached); return; }
    (async () => {
      try {
        const res = await fetch("/api/seo/geo/prompts/onboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, source }),
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

  // group prompts by cluster/campaign for a scannable list
  const groups = useMemo(() => {
    const g = {};
    for (const p of prompts) { const k = p.cluster || "GEO"; (g[k] ||= []).push(p); }
    for (const k in g) g[k].sort((a, b) => (a.priority || 999) - (b.priority || 999));
    return g;
  }, [prompts]);

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pb-40">
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#d45427] uppercase tracking-wide">
          <Sparkles size={13} /> GEO Prompts
        </div>
        <h2 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">The AI prompts we&apos;ll run for you</h2>
        <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-300">
          We generated {prompts.length || "~30"} neutral buyer prompts for your market. The highest-relevance ones are pre-selected —
          adjust the selection (minimum {MIN_SELECTED}) and add your own below.
        </p>
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
          <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-[#d45427] animate-spin" />
          <p className="text-[13px]">Generating your prompt set…</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center">
          <p className="text-[13px] text-red-500">Couldn&apos;t generate prompts: {error}</p>
          <button onClick={() => { startedRef.current = false; setError(null); setLoading(true); }} className="mt-3 text-[13px] font-semibold text-[#d45427] underline">Retry</button>
        </div>
      ) : (
        <>
          {/* selected counter */}
          <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between rounded-lg bg-white/90 dark:bg-[var(--extra-input-dark)]/90 backdrop-blur px-3 py-2 border border-gray-200 dark:border-[var(--extra-border-dark)]">
            <span className="text-[13px] font-semibold text-gray-800 dark:text-white">{totalChosen} selected</span>
            <span className={`text-[12px] ${totalChosen >= MIN_SELECTED ? "text-emerald-600" : "text-[#d45427]"}`}>
              {totalChosen >= MIN_SELECTED ? "✓ ready" : `select ${MIN_SELECTED - totalChosen} more (min ${MIN_SELECTED})`}
            </span>
          </div>

          {/* prompt list, grouped by campaign */}
          {Object.entries(groups).map(([cluster, list]) => (
            <div key={cluster} className="mb-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{cluster}</div>
              <div className="space-y-1.5">
                {list.map((p) => {
                  const on = selected.has(p.prompt_id);
                  return (
                    <button key={p.prompt_id} type="button" onClick={() => toggle(p.prompt_id)}
                      className={`w-full flex items-start gap-2.5 text-left rounded-lg border px-3 py-2 transition-colors ${on ? "border-[#d45427] bg-[#fff3ee] dark:bg-[#3a1f14]" : "border-gray-200 dark:border-[var(--extra-border-dark)] bg-white dark:bg-[var(--extra-input-dark)] hover:border-[#d45427]/50"}`}>
                      <span className={`mt-0.5 grid place-items-center h-4 w-4 rounded shrink-0 border ${on ? "bg-[#d45427] border-[#d45427] text-white" : "border-gray-300"}`}>
                        {on ? <Check size={12} /> : null}
                      </span>
                      <span className="text-[13px] leading-snug text-gray-800 dark:text-gray-100">{p.prompt_text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Others — add custom prompts */}
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Others — add your own</div>
            <div className="flex gap-2">
              <input value={customInput} onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                placeholder="Type a prompt buyers might ask an AI…"
                className="flex-1 rounded-lg border border-gray-300 dark:border-[var(--extra-border-dark)] bg-white dark:bg-[var(--extra-input-dark)] px-3 py-2 text-[13px] text-gray-800 dark:text-white outline-none focus:border-[#d45427]" />
              <button type="button" onClick={addCustom} disabled={customInput.trim().length < 6}
                className="inline-flex items-center gap-1 rounded-lg bg-[#d45427] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                <Plus size={14} /> Add
              </button>
            </div>
            {custom.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {custom.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#fff3ee] dark:bg-[#3a1f14] border border-[#d45427]/40 px-2.5 py-1 text-[12px] text-gray-800 dark:text-gray-100">
                    {t}
                    <button type="button" onClick={() => removeCustom(t)} className="text-gray-400 hover:text-[#d45427]"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* disclaimer */}
          <p className="mt-5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
            Note: the audit analyses {AUDIT_COUNT} prompts. Any additional prompts you select or add still run and appear in your dashboard.
          </p>
        </>
      )}

      {/* bottom bar — centered Back + Next, matching the other onboarding steps */}
      <div className="fixed bottom-0 left-[56px] md:left-[72px] lg:left-[80px] right-0 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur border-t border-gray-200 dark:border-[var(--extra-border-dark)] px-4 py-5 flex justify-center gap-3 sm:gap-4">
        <button onClick={onBack} type="button"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--input)] border border-[#d45427] px-5 sm:px-6 py-2.5 sm:py-3 text-[13px] md:text-[14px] text-[var(--text)] hover:opacity-90 shadow-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={handleNext} disabled={!canContinue} type="button"
          className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-5 sm:px-6 py-2.5 sm:py-3 text-[13px] md:text-[14px] font-semibold text-white hover:opacity-90 shadow-sm disabled:opacity-40">
          {submitting ? "Saving…" : "Next"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
