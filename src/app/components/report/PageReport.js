"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// DOCTORFIZZ wordmark — real asset per background (no css-invert; orange "O" preserved).
const LOGO_WHITE_P = "/brand/doctorfizz-white.png";
const LOGO_BLACK_P = "/brand/doctorfizz-black.png";
function ItzFizzLogo({ white = false, size = "md" }) {
  const dim = size === "lg" ? 44 : size === "sm" ? 20 : 30;
  return (
    <img
      src={white ? LOGO_WHITE_P : LOGO_BLACK_P}
      alt="DoctorFizz"
      style={{ height: dim, width: "auto", objectFit: "contain", display: "block" }}
    />
  );
}

function AnimatedSection({ children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          ref.current.classList.add("opacity-100", "translate-y-0");
          ref.current.classList.remove("opacity-0", "translate-y-5");
          obs.unobserve(ref.current);
        }
      },
      { threshold: 0.06 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`opacity-0 translate-y-5 transition-all duration-700 ease-out ${className}`}>
      {children}
    </div>
  );
}

function SNum({ n, total }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <span className="text-[10px] tracking-[0.25em] font-bold text-[#d45427] uppercase">{String(n).padStart(2, "0")} ·</span>
      <span className="text-[10px] tracking-widest text-gray-400 font-medium">{String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
    </div>
  );
}

function SNumDark({ n, total }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <span className="text-[10px] tracking-[0.25em] font-bold text-[#ffa615] uppercase">{String(n).padStart(2, "0")} ·</span>
      <span className="text-[10px] tracking-widest text-gray-600 font-medium">{String(n).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
    </div>
  );
}

function OBar() {
  return <div className="h-[3px] w-14 bg-gradient-to-r from-[#d45427] to-[#ffa615] rounded-full mb-5" />;
}

function SHead({ children, white = false }) {
  return (
    <h2 className={`text-[1.6rem] md:text-[2rem] font-black uppercase tracking-tighter leading-tight mb-1 ${white ? "text-white" : "text-gray-900"}`}>
      {children}
    </h2>
  );
}

function SSub({ children, white = false }) {
  return (
    <p className={`text-xs mb-8 leading-relaxed ${white ? "text-gray-400" : "text-gray-500"}`}>{children}</p>
  );
}

function PTag({ label }) {
  const styles = {
    CRITICAL: "bg-red-600 text-white",
    HIGH: "bg-orange-500 text-white",
    MEDIUM: "bg-yellow-400 text-gray-900",
    QUICK: "bg-blue-500 text-white",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${styles[label] || "bg-gray-400 text-white"}`}>
      {label}
    </span>
  );
}

function KDB({ kd }) {
  const n = Number(kd) || 0;
  let cls = "bg-emerald-500 text-white";
  if (n >= 16) cls = "bg-orange-500 text-white";
  else if (n >= 6) cls = "bg-yellow-400 text-gray-900";
  else if (n >= 1) cls = "bg-teal-500 text-white";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${cls}`}>
      KD {n}
    </span>
  );
}

function NowBlock({ children }) {
  return (
    <div className="bg-[#f4f4f4] border border-gray-200 rounded-lg p-4">
      <div className="text-[8px] font-bold uppercase tracking-widest text-gray-400 mb-2">Current</div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function BetterBlock({ children }) {
  return (
    <div className="bg-[#f0faf4] border border-emerald-200 rounded-lg p-4">
      <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Recommended</div>
      <div className="text-sm text-gray-800 leading-relaxed">{children}</div>
    </div>
  );
}

function BigStat({ value, label }) {
  return (
    <div className="text-center p-7 bg-[#090909] rounded-xl">
      <div className="text-4xl font-black text-[#ffa615] mb-1 leading-none">{value}</div>
      <div className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const CLIENTS = [
  "CYBERSPACE", "5K MEDIA", "URBAN", "ABCOM",
  "HEALTHEX", "CURA", "FRESHWAYS", "SNAPCART",
];

const N = 13;

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function PageReport({ data }) {
  const d = data || {};
  const domain = d.domain || "yourdomain.com";
  const url = d.url || `https://${domain}`;
  const es = d.executiveSummary || {};
  const pap = Array.isArray(d.priorityActionPlan) ? d.priorityActionPlan : [];
  const ks = d.keywordStrategy || {};
  const md = d.metadata || {};
  const he = d.heroExecution || {};
  const cp = d.contentPositioning || {};
  const wl = Array.isArray(d.workflowLayer) ? d.workflowLayer : [];
  const av = d.aiVisibility || {};
  const gl = d.geoLayer || {};
  const impl = d.implementation || {};
  const bm = d.baselineMetrics || {};

  const dateStr = d.generatedAt
    ? new Date(d.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div id="report-content" className="font-sans bg-white text-gray-900 antialiased">

      {/* ══════════════════════════════════════════════════════
          COVER PAGE
      ══════════════════════════════════════════════════════ */}
      <section className="relative bg-[#090909] text-white overflow-hidden min-h-screen flex flex-col">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "36px 36px" }}
        />
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#d45427] via-[#ffa615] to-[#d45427]" />

        <div className="relative z-10 flex flex-col flex-1 max-w-5xl mx-auto w-full px-8 md:px-14">
          {/* Logo row */}
          <div className="flex items-center justify-between pt-10 pb-20 md:pb-28">
            <ItzFizzLogo white size="lg" />
            <span className="text-[9px] tracking-[0.35em] text-gray-600 uppercase font-semibold hidden md:block">
              Intelligence Report
            </span>
          </div>

          {/* Main title */}
          <div className="flex-1">
            <div className="text-[9px] tracking-[0.35em] uppercase text-gray-500 font-semibold mb-8">
              Doctor Fizz Intelligence Report
            </div>
            <h1 className="text-[clamp(2.8rem,8vw,5.5rem)] font-black uppercase leading-[0.88] tracking-tighter mb-1">
              ON-PAGE
            </h1>
            <h1 className="text-[clamp(2.8rem,8vw,5.5rem)] font-black uppercase leading-[0.88] tracking-tighter bg-gradient-to-r from-[#d45427] to-[#ffa615] bg-clip-text text-transparent mb-10">
              OPTIMISATION
            </h1>
            <div className="text-[9px] tracking-[0.35em] uppercase text-gray-600 font-semibold mb-8">Report</div>
            <div className="text-lg md:text-xl font-semibold text-gray-200 mb-1 break-all">{url}</div>
            <div className="text-sm text-gray-500 mb-20">Single-Page SEO & GEO Optimisation Blueprint</div>
          </div>
        </div>

        {/* Bottom meta + clients */}
        <div className="relative z-10 max-w-5xl mx-auto w-full px-8 md:px-14">
          <div className="border-t border-white/10 pt-6">
            <div className="flex flex-wrap gap-10 mb-8">
              {[
                ["Client", domain],
                ["Target Page", url.length > 50 ? url.slice(0, 50) + "…" : url],
                ["Date", dateStr],
                ["Prepared By", "DoctorFizz"],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[8px] uppercase tracking-widest text-gray-600 mb-0.5">{label}</div>
                  <div className="text-sm font-bold text-white">{val}</div>
                </div>
              ))}
            </div>
            <div className="border-t border-white/5 pt-5 pb-10">
              <div className="text-[8px] uppercase tracking-widest text-gray-700 mb-4">Our Clientele</div>
              <div className="flex flex-wrap gap-2.5">
                {CLIENTS.map((c) => (
                  <span
                    key={c}
                    className="text-[9px] font-bold tracking-widest text-gray-500 uppercase border border-white/10 rounded px-3 py-1.5"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          00 · CONTENTS & SCOPE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={0} total={N} />
          <OBar />
          <SHead>CONTENTS &amp; SCOPE</SHead>
          <SSub>What This Report Covers</SSub>
          <ol className="space-y-1">
            {[
              "Executive Summary",
              "Priority Action Plan",
              "Keyword Strategy",
              "Metadata — Title & Meta Description",
              "Hero & The Execution Gap",
              "Content Positioning",
              "Workflow Layer",
              "Visibility, AI & Use Cases",
              "Why It Works, Stats & Closing",
              "GEO Layer",
              "Implementation & Next Steps",
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-4 text-sm text-gray-700 py-2.5 border-b border-gray-100 last:border-0"
              >
                <span className="text-xs font-black text-[#d45427] w-7 flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item}
              </li>
            ))}
          </ol>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          01 · EXECUTIVE SUMMARY
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={1} total={N} />
            <OBar />
            <SHead>EXECUTIVE SUMMARY</SHead>
            <SSub>The Diagnosis</SSub>

            {/* Diagnosis callouts */}
            {Object.keys(es.diagnosis || {}).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {Object.entries(es.diagnosis).map(([key, val], i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 text-center">
                    <div className="text-2xl font-black text-gray-900 mb-1">{String(val)}</div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-widest">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Prescription */}
            {(es.prescription || []).length > 0 && (
              <div className="mb-6">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-3">What Is Being Prescribed</div>
                <ul className="space-y-2">
                  {es.prescription.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d45427] mt-[0.4rem] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Headline */}
            {es.headline && (
              <div className="bg-[#090909] text-white rounded-xl p-6 text-center mt-6">
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-2">The Headline</div>
                <p className="text-base font-bold leading-relaxed">{es.headline}</p>
              </div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          02 · PRIORITY ACTION PLAN
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={2} total={N} />
          <OBar />
          <SHead>PRIORITY ACTION PLAN</SHead>
          <SSub>Ranked by Impact</SSub>

          <div className="space-y-4">
            {pap.map((action, i) => (
              <div
                key={i}
                className="flex gap-4 bg-[#f4f4f4] border border-gray-200 rounded-xl p-5 hover:border-[#d45427]/30 hover:shadow-sm transition-all duration-200"
              >
                <div className="w-9 h-9 rounded-full bg-gray-900 text-white text-xs font-black grid place-items-center flex-shrink-0">
                  {action.rank || i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <PTag label={action.label} />
                    {action.timeEstimate && (
                      <span className="text-xs text-gray-400">{action.timeEstimate}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed">{action.action}</p>
                </div>
              </div>
            ))}
            {!pap.length && (
              <div className="text-sm text-gray-400 py-4">Action plan generating…</div>
            )}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          03 · KEYWORD STRATEGY
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={3} total={N} />
            <OBar />
            <SHead>KEYWORD STRATEGY</SHead>
            <SSub>Primary Keywords — Highest-Opportunity Targets</SSub>

            <div className="rounded-xl overflow-hidden border border-gray-200 mb-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Keyword</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Monthly Searches</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {(ks.primary || []).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f4f4f4]"}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.keyword}</td>
                      <td className="px-4 py-3 text-gray-600">{row.monthlySearches}</td>
                      <td className="px-4 py-3"><KDB kd={row.difficulty} /></td>
                    </tr>
                  ))}
                  {!(ks.primary || []).length && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Keyword data loading…</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {ks.bestOpportunity && (
              <div className="bg-white border-l-4 border-[#d45427] rounded-r-xl p-5 mb-8">
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#d45427] mb-1.5">Best Opportunity</div>
                <p className="text-sm text-gray-700 leading-relaxed">{ks.bestOpportunity}</p>
              </div>
            )}

            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-4">Secondary Keywords</div>
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Keyword</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Monthly Searches</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {(ks.secondary || []).map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f4f4f4]"}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.keyword}</td>
                      <td className="px-4 py-3 text-gray-600">{row.monthlySearches}</td>
                      <td className="px-4 py-3"><KDB kd={row.difficulty} /></td>
                    </tr>
                  ))}
                  {!(ks.secondary || []).length && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          04 · METADATA
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={4} total={N} />
          <OBar />
          <SHead>METADATA</SHead>
          <SSub>Title Tag &amp; Meta Description</SSub>

          <div className="mb-8">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-4">Title Tag</div>
            {md.titleTag?.problem && (
              <div className="mb-3 text-xs text-gray-400 italic leading-relaxed">Problem: {md.titleTag.problem}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NowBlock>{md.titleTag?.current || "—"}</NowBlock>
              <BetterBlock>{md.titleTag?.recommended || "—"}</BetterBlock>
            </div>
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-4">Meta Description</div>
            {md.metaDescription?.problem && (
              <div className="mb-3 text-xs text-gray-400 italic leading-relaxed">Problem: {md.metaDescription.problem}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NowBlock>{md.metaDescription?.current || "—"}</NowBlock>
              <BetterBlock>{md.metaDescription?.recommended || "—"}</BetterBlock>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          05 · HERO & THE EXECUTION GAP
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={5} total={N} />
            <OBar />
            <SHead>HERO &amp; THE EXECUTION GAP</SHead>
            <SSub>What Visitors See vs. What They Should See</SSub>

            {[
              { label: "H1 Heading", current: he.h1?.current, recommended: he.h1?.recommended },
              { label: "Subheading", current: he.subheading?.current, recommended: he.subheading?.recommended },
              { label: "Body Copy", current: he.body?.current, recommended: he.body?.recommended },
            ].map((section, i) => (
              <div key={i} className="mb-8">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-3">{section.label}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <NowBlock>{section.current || "—"}</NowBlock>
                  <BetterBlock>{section.recommended || "—"}</BetterBlock>
                </div>
              </div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          06 · CONTENT POSITIONING
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={6} total={N} />
          <OBar />
          <SHead>CONTENT POSITIONING</SHead>
          <SSub>Reframe to Convert</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <NowBlock>{cp.currentHeading || "—"}</NowBlock>
            <BetterBlock>{cp.recommendedHeading || "—"}</BetterBlock>
          </div>

          {(cp.bodyRewrites || []).map((rewrite, i) => (
            <div key={i} className="mb-8">
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-3">{rewrite.area}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NowBlock>{rewrite.current}</NowBlock>
                <BetterBlock>{rewrite.recommended}</BetterBlock>
              </div>
            </div>
          ))}
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          07 · WORKFLOW LAYER
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={7} total={N} />
            <OBar />
            <SHead>WORKFLOW LAYER</SHead>
            <SSub>Label Optimisation for Clarity &amp; Conversion</SSub>

            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Area</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Current Label</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Recommended</th>
                  </tr>
                </thead>
                <tbody>
                  {wl.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f4f4f4]"}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.area}</td>
                      <td className="px-4 py-3 text-gray-400 line-through text-xs">{row.currentLabel}</td>
                      <td className="px-4 py-3 text-emerald-700 font-semibold">{row.recommendedLabel}</td>
                    </tr>
                  ))}
                  {!wl.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">Workflow analysis generating…</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          08 · VISIBILITY, AI & USE CASES
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={8} total={N} />
            <OBar />
            <SHead white>VISIBILITY, AI &amp; USE CASES</SHead>
            <SSub white>How This Page Gets Found in AI Search</SSub>

            {(av.dashboardFeatures || []).length > 0 && (
              <div className="mb-8">
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-4">Key Features</div>
                <ul className="space-y-2.5">
                  {av.dashboardFeatures.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300 leading-relaxed">
                      <span className="text-[#ffa615] flex-shrink-0 font-bold mt-0.5">·</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(av.useCases || []).length > 0 && (
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-4">AI Use Cases</div>
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-gray-400">Use Case</th>
                        <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-gray-400">Target User</th>
                        <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest text-gray-400">Keyword</th>
                      </tr>
                    </thead>
                    <tbody>
                      {av.useCases.map((row, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-4 py-3 text-gray-300">{row.useCase}</td>
                          <td className="px-4 py-3 text-gray-400">{row.targetUser}</td>
                          <td className="px-4 py-3 text-[#ffa615] font-semibold">{row.keyword}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          09 · WHY IT WORKS, STATS & CLOSING
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={9} total={N} />
          <OBar />
          <SHead>WHY IT WORKS, STATS &amp; CLOSING</SHead>
          <SSub>Current Performance Snapshot</SSub>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <BigStat value={bm.performanceMobile  != null ? `${bm.performanceMobile}/100`  : "—"} label="Mobile Performance" />
            <BigStat value={bm.performanceDesktop != null ? `${bm.performanceDesktop}/100` : "—"} label="Desktop Performance" />
            <BigStat value={bm.organicKeywords || "—"} label="Organic Keywords" />
          </div>

          <div className="bg-[#f4f4f4] rounded-xl p-7">
            <p className="text-sm text-gray-700 leading-relaxed">
              This page has significant untapped potential. By implementing the recommended changes — starting with the
              title tag, H1, and meta description — you can expect meaningful improvements in search visibility within
              60–90 days. The keyword opportunities identified are low-competition, high-relevance targets that this
              page is uniquely positioned to own.
            </p>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          10 · GEO LAYER
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={10} total={N} />
            <OBar />
            <SHead>GEO LAYER</SHead>
            <SSub>Generative Engine Optimisation — AI-Ready Content</SSub>

            {gl.faqAnalysis && (
              <div className="bg-white border-l-4 border-[#d45427] rounded-r-xl p-5 mb-8">
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#d45427] mb-1.5">FAQ Analysis</div>
                <p className="text-sm text-gray-700 leading-relaxed">{gl.faqAnalysis}</p>
              </div>
            )}

            {(gl.faqs || []).length > 0 && (
              <div className="space-y-4 mb-8">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-4">Recommended FAQ Answers</div>
                {gl.faqs.map((faq, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-[#d45427]/20 transition-colors">
                    <div className="font-bold text-sm text-gray-900 mb-2">{faq.question}</div>
                    <p className="text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            )}

            {gl.faqJsonLd && (
              <div className="mb-8">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-3">FAQ JSON-LD Schema</div>
                <div className="bg-[#090909] rounded-xl p-5 overflow-x-auto">
                  <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap leading-relaxed">{gl.faqJsonLd}</pre>
                </div>
              </div>
            )}

            {(gl.principles || []).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gl.principles.map((p, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-[#d45427]/20 transition-colors">
                    <div className="font-bold text-sm text-gray-900 mb-1">{p.title}</div>
                    <p className="text-xs text-gray-600 leading-relaxed">{p.description}</p>
                  </div>
                ))}
              </div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          11 · IMPLEMENTATION & NEXT STEPS
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={11} total={N} />
            <OBar />
            <SHead white>IMPLEMENTATION &amp; NEXT STEPS</SHead>
            <SSub white>Three-Sprint Execution Plan</SSub>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
              {[impl.sprint1, impl.sprint2, impl.sprint3].filter(Boolean).map((sprint, i) => (
                <div key={i} className="bg-white/[0.04] border border-white/10 rounded-xl p-5">
                  <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-1">{sprint.duration}</div>
                  <div className="font-bold text-sm text-white mb-4">{sprint.title}</div>
                  <ul className="space-y-2.5">
                    {(sprint.tasks || []).map((task, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-gray-300 leading-relaxed">
                        <svg className="w-3.5 h-3.5 text-[#ffa615] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {![impl.sprint1, impl.sprint2, impl.sprint3].filter(Boolean).length && (
                <div className="col-span-3 text-sm text-gray-500 py-4">Implementation plan generating…</div>
              )}
            </div>

            {(impl.measurementChecklist || []).length > 0 && (
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-4">Measurement Checklist</div>
                <ul className="space-y-2.5">
                  {impl.measurementChecklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300 leading-relaxed">
                      <svg className="w-4 h-4 text-[#ffa615] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          WHY DOCTORFIZZ
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <OBar />
          <SHead>WHY DOCTORFIZZ</SHead>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            {[
              { title: "Evidence, Not Guesswork", desc: "Every recommendation backed by real data from multiple sources — no guessing, no padding." },
              { title: "SEO & GEO Specialists", desc: "We optimise for both traditional search engines and the new AI answer engines." },
              { title: "Content That Earns Rankings", desc: "We produce topically authoritative content that search engines — and AI systems — cite." },
              { title: "Transparent Monthly Reporting", desc: "Full visibility into what we do, what moved, and what's next. No black boxes." },
            ].map((card, i) => (
              <div key={i} className="bg-[#f4f4f4] border border-gray-200 rounded-xl p-6 hover:border-[#d45427]/20 hover:shadow-sm transition-all duration-200">
                <div className="font-bold text-sm text-gray-900 mb-2">{card.title}</div>
                <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          OUR CLIENTELE
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <OBar />
            <SHead>OUR CLIENTELE</SHead>
            <SSub>Brands That Trust DoctorFizz</SSub>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {CLIENTS.map((name, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-5 bg-white flex items-center justify-center min-h-[72px] hover:border-[#d45427]/30 transition-colors">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500">{name}</span>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer className="border-t border-gray-100 bg-white py-10 px-8 text-center">
        <div className="flex items-center justify-center mb-3">
          <ItzFizzLogo size="md" />
        </div>
        <div className="text-xs text-gray-400 mb-1">doctorfizz.com · On-Page SEO Report for {domain}</div>
        <div className="text-[10px] text-gray-300 max-w-xl mx-auto leading-relaxed">
          This report is confidential and prepared solely for the named client. All analysis powered by DoctorFizz Intelligence as of {dateStr}.
        </div>
      </footer>
    </div>
  );
}
