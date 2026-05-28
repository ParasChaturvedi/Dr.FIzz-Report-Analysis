"use client";

import { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function ItzFizzLogo({ white = false, size = "md" }) {
  const dim = size === "lg" ? 32 : size === "sm" ? 16 : 22;
  const textCls = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-[1.1rem]";
  return (
    <div className="flex items-center gap-1.5">
      <svg width={dim} height={dim} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="itzGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d45427" />
            <stop offset="100%" stopColor="#ffa615" />
          </linearGradient>
        </defs>
        <polygon points="16,1.5 19.8,11.8 30.5,16 19.8,20.2 16,30.5 12.2,20.2 1.5,16 12.2,11.8" fill="url(#itzGrad)" />
      </svg>
      <span className={`font-black tracking-tight leading-none ${textCls} ${white ? "text-white" : "text-gray-900"}`}>
        Itz<span style={{ color: "#ffa615" }}>Fizz</span>
      </span>
    </div>
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

function PBadge({ p }) {
  const map = {
    CRITICAL: "bg-red-600 text-white",
    HIGH: "bg-orange-500 text-white",
    MEDIUM: "bg-emerald-600 text-white",
    LOW: "bg-blue-500 text-white",
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${map[p] || "bg-gray-400 text-white"}`}>
      {p}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const CLIENTS = [
  "CYBERSPACE", "5K MEDIA", "URBAN", "ABCOM",
  "HEALTHEX", "CURA", "FRESHWAYS", "SNAPCART",
];

const N = 18; // total sections

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function WebsiteReport({ data }) {
  const d = data || {};
  const domain = d.domain || "yourdomain.com";
  const bm = d.baselineMetrics || {};
  const cl = d.competitorLandscape || {};
  const ks = d.keywordStrategy || {};
  const ca = d.contentArchitecture || {};
  const ci = d.competitiveIntelligence || {};
  const tp = Array.isArray(d.technicalPriorities) ? d.technicalPriorities : [];
  const lb = d.linkBuilding || {};
  const ls = d.localSearch || {};
  const rm = Array.isArray(d.roadmap) ? d.roadmap : [];
  const cb = Array.isArray(d.contentBlueprint) ? d.contentBlueprint : [];
  const uc = Array.isArray(d.uncontested) ? d.uncontested : [];
  const gf = d.geoFrontier || {};
  const qw = Array.isArray(d.quickWins180) ? d.quickWins180 : [];
  const sp = Array.isArray(d.strategicPriorities) ? d.strategicPriorities : [];

  const dateStr = d.generatedAt
    ? new Date(d.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div id="report-content" className="font-sans bg-white text-gray-900 antialiased">

      {/* ══════════════════════════════════════════════════════
          COVER PAGE
      ══════════════════════════════════════════════════════ */}
      <section className="relative bg-[#090909] text-white overflow-hidden min-h-screen flex flex-col">
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)", backgroundSize: "36px 36px" }}
        />
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#d45427] via-[#ffa615] to-[#d45427]" />

        <div className="relative z-10 flex flex-col flex-1 max-w-5xl mx-auto w-full px-8 md:px-14">
          {/* Logo row */}
          <div className="flex items-center justify-between pt-10 pb-20 md:pb-28">
            <ItzFizzLogo white size="lg" />
            <span className="text-[9px] tracking-[0.35em] text-gray-600 uppercase font-semibold hidden md:block">
              Intelligence Report
            </span>
          </div>

          {/* Main title block */}
          <div className="flex-1">
            <div className="text-[9px] tracking-[0.35em] uppercase text-gray-500 font-semibold mb-8">
              Doctor Fizz Intelligence Report
            </div>
            <h1 className="text-[clamp(3rem,9vw,6rem)] font-black uppercase leading-[0.88] tracking-tighter mb-1">
              SEO &amp; GEO
            </h1>
            <h1 className="text-[clamp(3rem,9vw,6rem)] font-black uppercase leading-[0.88] tracking-tighter bg-gradient-to-r from-[#d45427] to-[#ffa615] bg-clip-text text-transparent mb-10">
              STRATEGY
            </h1>
            <div className="text-lg md:text-xl font-semibold text-gray-200 mb-1">{domain}</div>
            <div className="text-sm text-gray-500 mb-20">Comprehensive Digital Visibility Blueprint</div>
          </div>
        </div>

        {/* Bottom block: meta + clients */}
        <div className="relative z-10 max-w-5xl mx-auto w-full px-8 md:px-14">
          <div className="border-t border-white/10 pt-6">
            {/* Meta row */}
            <div className="flex flex-wrap gap-10 mb-8">
              {[
                ["Prepared By", "ItzFizz Digital"],
                ["Generated", dateStr],
                ["Domain", domain],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[8px] uppercase tracking-widest text-gray-600 mb-0.5">{label}</div>
                  <div className="text-sm font-bold text-white">{val}</div>
                </div>
              ))}
            </div>
            {/* Client names */}
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
          01 · THE BASELINE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={1} total={N} />
          <OBar />
          <SHead>THE BASELINE</SHead>
          <SSub>Where {domain} Stands Today</SSub>

          {/* Primary metrics: 3-up */}
          <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-xl overflow-hidden mb-px">
            {[
              { label: "Domain Authority",  value: bm.domainRating    || "—" },
              { label: "Organic Traffic",   value: bm.organicTraffic  || "—" },
              { label: "Organic Keywords",  value: bm.organicKeywords || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white px-5 py-6">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-2">{label}</div>
                <div className="text-4xl md:text-5xl font-black text-gray-900 leading-none">{value}</div>
              </div>
            ))}
          </div>

          {/* Performance metrics: 4-up */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 rounded-xl overflow-hidden mt-px">
            {[
              { label: "Mobile Score",  value: bm.performanceMobile  != null ? `${bm.performanceMobile}/100`  : "—" },
              { label: "Desktop Score", value: bm.performanceDesktop != null ? `${bm.performanceDesktop}/100` : "—" },
              { label: "LCP", value: bm.lcp != null ? `${(Number(bm.lcp) / 1000).toFixed(1)}s` : "—" },
              { label: "CLS", value: bm.cls != null ? Number(bm.cls).toFixed(3) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white px-5 py-5">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">{label}</div>
                <div className="text-2xl font-black text-gray-900">{value}</div>
              </div>
            ))}
          </div>

          {/* Backlink metrics — shows if available */}
          <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-xl overflow-hidden mt-px">
            {[
              { label: "Referring Domains", value: bm.referringDomains || "—" },
              { label: "404 Errors",        value: bm.errors404        || "—" },
              { label: "Redirect Chains",   value: bm.redirectChains   || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white px-5 py-5">
                <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">{label}</div>
                <div className="text-2xl font-black text-gray-900">{value}</div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          02 · COMPETITOR LANDSCAPE
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={2} total={N} />
            <OBar />
            <SHead>COMPETITOR LANDSCAPE</SHead>
            <SSub>Local Competitors</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
              {(cl.localCompetitors || []).map((c, i) => (
                <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 hover:border-[#d45427]/30 hover:shadow-sm transition-all duration-200">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-900 text-white grid place-items-center text-sm font-black flex-shrink-0 uppercase">
                      {(c.name || c.domain || "C")[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-bold text-gray-900 text-sm">{c.name || c.domain}</span>
                        {c.strength && (
                          <span className="text-[8px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            {c.strength}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{c.domain}</div>
                      {c.description && (
                        <div className="text-xs text-gray-600 mt-1 leading-relaxed">{c.description}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!(cl.localCompetitors || []).length && (
                <div className="col-span-2 text-sm text-gray-400 py-4">Competitor analysis loading…</div>
              )}
            </div>

            {/* National platforms */}
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-4">
              National Platforms Intercepting Search
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {(cl.nationalPlatforms || []).map((p, i) => (
                <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
                  <div className="font-bold text-sm text-gray-900 mb-1">{p.name}</div>
                  {p.description && <div className="text-xs text-gray-500 mb-2 leading-relaxed">{p.description}</div>}
                  {p.threat && (
                    <span className="text-[8px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      {p.threat}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {cl.localOpening && (
              <div className="bg-white border-l-4 border-[#d45427] rounded-r-xl p-5">
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#d45427] mb-1.5">The Local Opening</div>
                <p className="text-sm text-gray-700 leading-relaxed">{cl.localOpening}</p>
              </div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          03 · KEYWORD STRATEGY
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={3} total={N} />
          <OBar />
          <SHead>KEYWORD STRATEGY</SHead>
          <SSub>Tier 1 — Primary Commercial Keywords</SSub>

          {(ks.tier1 || []).length > 0 ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 mb-10">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Keyword</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Est. Monthly Volume</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Target Page Type</th>
                  </tr>
                </thead>
                <tbody>
                  {ks.tier1.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-semibold text-gray-900 text-sm">{row.keyword}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{row.volume || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{row.targetPageType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 mb-10 py-4">Keyword research processing…</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-2.5 mb-4">
                Tier 2 — Neighbourhood Hyper-Local
              </div>
              <ul className="space-y-2.5">
                {(ks.tier2Neighborhood || []).map((kw, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#d45427] mt-[0.4rem] flex-shrink-0" />
                    {kw}
                  </li>
                ))}
                {!(ks.tier2Neighborhood || []).length && <li className="text-sm text-gray-400">Analysing…</li>}
              </ul>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-2.5 mb-4">
                Tier 3 — Informational Blog
              </div>
              <ul className="space-y-2.5">
                {(ks.tier3Informational || []).map((kw, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffa615] mt-[0.4rem] flex-shrink-0" />
                    {kw}
                  </li>
                ))}
                {!(ks.tier3Informational || []).length && <li className="text-sm text-gray-400">Analysing…</li>}
              </ul>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          04 · CONTENT ARCHITECTURE
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={4} total={N} />
            <OBar />
            <SHead white>CONTENT ARCHITECTURE</SHead>
            <SSub white>What Pages To Build</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-4">
                  Recommended Site Structure
                </div>
                <div className="space-y-2">
                  {(ca.siteStructure || []).map((page, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/[0.05] rounded-lg p-3.5 hover:bg-white/[0.08] transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ffa615] mt-1.5 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-white">{page.page}</div>
                        {page.url && <div className="text-xs text-gray-500 font-mono mt-0.5">{page.url}</div>}
                        {page.purpose && <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{page.purpose}</div>}
                      </div>
                    </div>
                  ))}
                  {!(ca.siteStructure || []).length && (
                    <div className="text-sm text-gray-500">Structure generating…</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-4">
                  Content Checklist
                </div>
                <ul className="space-y-3">
                  {(ca.checklist || []).map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                      <svg className="w-4 h-4 text-[#ffa615] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                  {!(ca.checklist || []).length && (
                    <li className="text-sm text-gray-500">Checklist generating…</li>
                  )}
                </ul>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          05 · COMPETITIVE INTELLIGENCE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={5} total={N} />
          <OBar />
          <SHead>COMPETITIVE INTELLIGENCE</SHead>
          <SSub>Reverse-Engineering the Market Leader</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-[#f0faf4] border border-emerald-100 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">
                  What Works For Them
                </div>
              </div>
              <ul className="space-y-3">
                {(ci.whatWorksForThem || []).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                    <span className="text-emerald-500 font-bold flex-shrink-0 mt-0.5 text-xs">+</span>
                    {item}
                  </li>
                ))}
                {!(ci.whatWorksForThem || []).length && (
                  <li className="text-sm text-gray-400">Analysis in progress…</li>
                )}
              </ul>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full bg-[#d45427] flex-shrink-0" />
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#d45427]">
                  Gaps You Can Exploit
                </div>
              </div>
              <ul className="space-y-3">
                {(ci.gapsYouCanExploit || []).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                    <span className="text-[#d45427] font-bold flex-shrink-0 mt-0.5 text-xs">→</span>
                    {item}
                  </li>
                ))}
                {!(ci.gapsYouCanExploit || []).length && (
                  <li className="text-sm text-gray-400">Gap analysis loading…</li>
                )}
              </ul>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          06 · TECHNICAL FOUNDATION
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={6} total={N} />
            <OBar />
            <SHead>TECHNICAL FOUNDATION</SHead>
            <SSub>Fix Before You Build</SSub>

            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest w-28">Priority</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Issue</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tp.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f4f4f4]"}>
                      <td className="px-4 py-3"><PBadge p={row.priority} /></td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.issue}</td>
                      <td className="px-4 py-3 text-gray-600 text-sm leading-relaxed">{row.action}</td>
                    </tr>
                  ))}
                  {!tp.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                        Technical audit processing…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          07 · AUTHORITY — LINK BUILDING
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={7} total={N} />
          <OBar />
          <SHead>AUTHORITY</SHead>
          <SSub>Link Building to Raise Domain Rating</SSub>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Citation Building", items: lb.citationBuilding || [], color: "#d45427" },
              { title: "Content-Driven Links", items: lb.contentDrivenLinks || [], color: "#ffa615" },
              { title: "Competitor Link Gap", items: lb.competitorLinkGap || [], color: "#6366f1" },
            ].map((col) => (
              <div key={col.title} className="bg-[#f4f4f4] rounded-xl p-5 border border-gray-200">
                <div className="text-[8px] font-bold uppercase tracking-widest mb-4" style={{ color: col.color }}>
                  {col.title}
                </div>
                <ul className="space-y-2.5">
                  {col.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: col.color }} />
                      {item}
                    </li>
                  ))}
                  {!col.items.length && <li className="text-xs text-gray-400">Loading…</li>}
                </ul>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          08 · LOCAL SEARCH
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={8} total={N} />
            <OBar />
            <SHead white>LOCAL SEARCH</SHead>
            <SSub white>Google Business Profile: The Fastest Win</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-4">
                  GBP Checklist
                </div>
                <ul className="space-y-3">
                  {(ls.gbpChecklist || []).map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                      <svg className="w-4 h-4 text-[#ffa615] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                  {!(ls.gbpChecklist || []).length && (
                    <li className="text-sm text-gray-500">Checklist generating…</li>
                  )}
                </ul>
              </div>
              {ls.reviewTarget && (
                <div className="bg-[#ffa615]/10 border border-[#ffa615]/20 rounded-xl p-6">
                  <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-2">Review Target</div>
                  <p className="text-sm text-gray-300 leading-relaxed">{ls.reviewTarget}</p>
                </div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          09 · EXECUTION — 30-DAY PLAN
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={9} total={N} />
          <OBar />
          <SHead>EXECUTION</SHead>
          <SSub>30-Day Execution Plan</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {rm.map((phase, i) => (
              <div key={i} className="bg-[#f4f4f4] border border-gray-200 rounded-xl p-6 hover:border-[#d45427]/30 hover:shadow-sm transition-all duration-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#d45427] to-[#ffa615] text-white text-xs font-black grid place-items-center flex-shrink-0">
                    {phase.phase}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-sm">{phase.title}</div>
                    <div className="text-[9px] text-[#d45427] font-bold uppercase tracking-widest">{phase.duration}</div>
                  </div>
                </div>
                <ul className="space-y-2">
                  {(phase.actions || []).map((action, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                      <span className="w-1 h-1 rounded-full bg-[#d45427] mt-1.5 flex-shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!rm.length && (
              <div className="col-span-2 text-sm text-gray-400 py-4">Execution plan generating…</div>
            )}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          10 · MEASURING SUCCESS
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={10} total={N} />
            <OBar />
            <SHead>MEASURING SUCCESS</SHead>
            <SSub>Visibility KPIs We Report Monthly</SSub>

            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Metric</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Now</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">6 Months</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">12 Months</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { metric: "Domain Rating",    now: bm.domainRating    || "—", s6: "Growing", s12: "Target +" },
                    { metric: "Organic Keywords", now: bm.organicKeywords || "—", s6: "+50%",    s12: "+150%"    },
                    { metric: "Organic Traffic",  now: bm.organicTraffic  || "—", s6: "+80%",    s12: "+300%"    },
                    { metric: "Referring Domains", now: bm.referringDomains || "—", s6: "+20",   s12: "+50"      },
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#f4f4f4]"}>
                      <td className="px-4 py-3 font-semibold text-gray-900">{row.metric}</td>
                      <td className="px-4 py-3 text-gray-700">{row.now}</td>
                      <td className="px-4 py-3 text-emerald-700 font-semibold">{row.s6}</td>
                      <td className="px-4 py-3 text-emerald-700 font-bold">{row.s12}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          11 · CONTENT BLUEPRINT
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={11} total={N} />
          <OBar />
          <SHead>CONTENT BLUEPRINT</SHead>
          <SSub>What the Leader Ranks For</SSub>

          {cb.length > 0 ? (
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Blog Post</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Top Keyword</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Vol</th>
                    <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-widest">Pos</th>
                  </tr>
                </thead>
                <tbody>
                  {cb.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.blogPost}</td>
                      <td className="px-4 py-3 text-gray-600">{row.topKeyword}</td>
                      <td className="px-4 py-3 text-gray-600">{row.vol || "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{row.pos || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-4">Content blueprint generating…</div>
          )}
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          12 · UNCONTESTED TERRITORY
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={12} total={N} />
            <OBar />
            <SHead>UNCONTESTED TERRITORY</SHead>
            <SSub>Service Pages {domain} Should Own</SSub>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {uc.map((item, i) => (
                <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 hover:border-[#d45427]/20 hover:shadow-sm transition-all duration-200">
                  <div className="text-sm font-bold text-gray-900 mb-1">{item.page}</div>
                  <div className="text-xs text-gray-500 mb-3 leading-relaxed">{item.keyword}</div>
                  <div className="text-2xl font-black text-[#d45427]">{item.volume}</div>
                  <div className="text-[8px] text-gray-400 uppercase tracking-widest mt-0.5">Monthly searches</div>
                </div>
              ))}
              {!uc.length && (
                <div className="col-span-3 text-sm text-gray-400 py-4">Opportunity analysis in progress…</div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          13 · THE NEXT FRONTIER — GEO & AI
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={13} total={N} />
            <OBar />
            <SHead white>THE NEXT FRONTIER</SHead>
            <SSub white>GEO and AI Visibility</SSub>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 sm:p-8 text-center overflow-hidden">
                <div className="text-[8px] uppercase tracking-widest text-gray-500 mb-3 truncate">{domain} AI Citations</div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-black text-[#ffa615] leading-snug break-words hyphens-auto px-2">
                  {gf.domainAICitations || "—"}
                </div>
              </div>
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 sm:p-8 text-center overflow-hidden">
                <div className="text-[8px] uppercase tracking-widest text-gray-500 mb-3">Competitor AI Citations</div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-black text-[#d45427] leading-snug break-words hyphens-auto px-2">
                  {gf.competitorAICitations || "—"}
                </div>
              </div>
            </div>

            {(gf.howToEarnCitations || []).length > 0 && (
              <div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-[#ffa615] mb-5">
                  How To Earn AI Citations
                </div>
                <ul className="space-y-3.5">
                  {gf.howToEarnCitations.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-300 leading-relaxed">
                      <span className="text-[#ffa615] font-black text-base flex-shrink-0 w-5 leading-none mt-0.5">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          14 · QUICK WINS — 180-DAY ACTION PLAN
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={14} total={N} />
          <OBar />
          <SHead>QUICK WINS</SHead>
          <SSub>180-Day Action Plan</SSub>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {qw.map((block, i) => (
              <div key={i} className="border-l-4 border-[#d45427] bg-[#f4f4f4] rounded-r-xl p-5">
                <div className="text-[8px] font-black uppercase tracking-widest text-[#d45427] mb-3">{block.week}</div>
                <ul className="space-y-2">
                  {(block.actions || []).map((action, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d45427] mt-[0.4rem] flex-shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!qw.length && (
              <div className="col-span-2 text-sm text-gray-400 py-4">Action plan generating…</div>
            )}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          15 · STRATEGIC PRIORITY STACK
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#f4f4f4] py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNum n={15} total={N} />
            <OBar />
            <SHead>STRATEGIC PRIORITY STACK</SHead>
            <SSub>The Honest Assessment</SSub>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {sp.map((p, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 hover:border-[#d45427]/20 hover:shadow-sm transition-all duration-200">
                  <div className="text-5xl font-black text-gray-100 mb-3 leading-none">{p.priority}</div>
                  <div className="font-bold text-gray-900 text-sm mb-2">{p.title}</div>
                  <p className="text-xs text-gray-600 leading-relaxed">{p.description}</p>
                </div>
              ))}
              {!sp.length && (
                <div className="col-span-3 text-sm text-gray-400 py-4">Strategic priorities loading…</div>
              )}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          16 · WHY ITZFIZZ DIGITAL
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={16} total={N} />
            <OBar />
            <SHead white>WHY ITZFIZZ DIGITAL</SHead>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
              {[
                {
                  title: "Evidence, Not Guesswork",
                  desc: "Every recommendation backed by real data from multiple sources — no guessing, no padding.",
                },
                {
                  title: "SEO & GEO Specialists",
                  desc: "We optimise for both traditional search engines and the new AI answer engines.",
                },
                {
                  title: "Content That Earns Rankings",
                  desc: "We produce topically authoritative content that search engines — and AI systems — cite.",
                },
                {
                  title: "Transparent Monthly Reporting",
                  desc: "Full visibility into what we do, what moved, and what's next. No black boxes.",
                },
              ].map((card, i) => (
                <div
                  key={i}
                  className="bg-white/[0.04] border border-white/10 rounded-xl p-6 hover:border-[#ffa615]/30 transition-colors duration-200"
                >
                  <div className="font-bold text-sm text-white mb-2">{card.title}</div>
                  <p className="text-xs text-gray-400 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          17 · OUR CLIENTELE
      ══════════════════════════════════════════════════════ */}
      <section className="max-w-5xl mx-auto px-8 md:px-14 py-16">
        <AnimatedSection>
          <SNum n={17} total={N} />
          <OBar />
          <SHead>OUR CLIENTELE</SHead>
          <SSub>Brands That Trust ItzFizz Digital</SSub>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {CLIENTS.map((name, i) => (
              <div
                key={i}
                className="border border-gray-200 rounded-xl p-5 flex items-center justify-center text-center min-h-[72px] hover:border-[#d45427]/30 hover:bg-gray-50 transition-all duration-200"
              >
                <span className="text-xs font-black uppercase tracking-widest text-gray-500">{name}</span>
              </div>
            ))}
          </div>

          {/* Extra industry tags */}
          <div className="flex flex-wrap gap-2">
            {["E-Commerce", "B2B SaaS", "Healthcare", "Legal", "Real Estate", "Hospitality", "Manufacturing", "Education"].map(
              (sector) => (
                <span
                  key={sector}
                  className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest border border-gray-200 rounded-full px-3 py-1"
                >
                  {sector}
                </span>
              )
            )}
          </div>
        </AnimatedSection>
      </section>

      {/* ══════════════════════════════════════════════════════
          18 · FOUR STEPS TO LAUNCH
      ══════════════════════════════════════════════════════ */}
      <section className="bg-[#090909] text-white py-16">
        <div className="max-w-5xl mx-auto px-8 md:px-14">
          <AnimatedSection>
            <SNumDark n={18} total={N} />
            <OBar />
            <SHead white>FOUR STEPS TO LAUNCH</SHead>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 mb-12">
              {[
                { step: "01", title: "Discovery Call", desc: "30-minute strategy session to align on goals." },
                { step: "02", title: "Full Audit", desc: "Deep technical and content audit of your site." },
                { step: "03", title: "Strategy Build", desc: "Custom 30-day SEO & GEO quick-launch plan delivery." },
                { step: "04", title: "Execute & Report", desc: "Monthly implementation, tracking, and reporting." },
              ].map((s) => (
                <div key={s.step} className="text-center">
                  <div className="text-5xl font-black text-[#d45427] mb-3 leading-none">{s.step}</div>
                  <div className="font-bold text-sm text-white mb-2">{s.title}</div>
                  <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <a
                href="https://itzfizz.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-[#d45427] to-[#ffa615] text-white font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Book Your Discovery Call →
              </a>
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
        <div className="text-xs text-gray-400 mb-1">itzfizz.com · Prepared exclusively for {domain}</div>
        <div className="text-[10px] text-gray-300 max-w-xl mx-auto leading-relaxed">
          This report is confidential and prepared solely for the named client. All data sourced from real-time analytics as of {dateStr}.
        </div>
      </footer>
    </div>
  );
}
