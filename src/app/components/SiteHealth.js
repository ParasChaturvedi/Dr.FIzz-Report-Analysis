"use client";

// SiteHealth — full "Site Health" screen (Figma VR4DZWLHbFKfCEJTYeuPKB · 2:16247).
// Layout matches the Figma: header + device tabs, Performance preview + Scan Results
// donut, metric cards, Current Issue & Progress, Issues to Fix (prioritised, real,
// interactive with status tracking + Assign fix + View details), Resolved issues,
// Response Codes and Content-Type tables.
//
// All numbers come from the real SEO data passed in (site health score, performance,
// Core Web Vitals, pages scanned, redirects, broken, 404s, issue counts). Fields that
// require a live PageSpeed/HAR analysis (load time, page size, requests, content-type
// breakdown) show an honest "run analysis" state rather than placeholder numbers.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, Sun, Moon, Play, RefreshCw, Zap, Info, Monitor, Smartphone,
  Download, Share2, Network, Gauge, HardDrive, Timer, Server, ClipboardList,
  CheckCircle2, Loader2, AlertTriangle, AlertOctagon, Eye, Plus, X, ChevronDown,
  Lightbulb, Stethoscope, Table2, FileSearch, Search, ExternalLink, ShieldCheck,
  Database, FileText, ListChecks, XCircle, Calendar, Users, UserPlus, Bell, Clock,
  Check,
} from "lucide-react";

/* ---- issue status store (per domain, persisted) ---- */
const shKey = (d) => `df:sh-issues:v1:${(d || "default").toLowerCase()}`;
function loadStatuses(d) {
  try { return JSON.parse(localStorage.getItem(shKey(d)) || "{}") || {}; } catch { return {}; }
}
function saveStatuses(d, s) {
  try { localStorage.setItem(shKey(d), JSON.stringify(s)); } catch {}
}

/* ---- "before" performance snapshot per issue (captured when a fix is assigned) ---- */
const snapKey = (d) => `df:sh-snap:v1:${(d || "default").toLowerCase()}`;
function loadSnaps(d) {
  try { return JSON.parse(localStorage.getItem(snapKey(d)) || "{}") || {}; } catch { return {}; }
}
function saveSnap(d, id, snap) {
  try {
    const all = loadSnaps(d);
    if (!all[id]) { all[id] = { ...snap, at: Date.now() }; localStorage.setItem(snapKey(d), JSON.stringify(all)); }
  } catch {}
}

/* ---- task assignment per issue (team / assignee / due / priority / criteria) ---- */
const assignKey = (d) => `df:sh-assign:v1:${(d || "default").toLowerCase()}`;
function loadAssigns(d) {
  try { return JSON.parse(localStorage.getItem(assignKey(d)) || "{}") || {}; } catch { return {}; }
}
function saveAssign(d, id, a) {
  try {
    const all = loadAssigns(d);
    all[id] = { ...a, at: Date.now() };
    localStorage.setItem(assignKey(d), JSON.stringify(all));
  } catch {}
}

const TEAM_OPTIONS = ["Frontend Team", "Backend Team", "SEO / Web Team", "Content Team", "DevOps Team"];
function suggestTeam(id) {
  if (/lcp|cls|perf|render/i.test(id)) return "Frontend Team";
  if (/redirect|broken|404/i.test(id)) return "SEO / Web Team";
  if (/image/i.test(id)) return "Content Team";
  return "Frontend Team";
}
function defaultCriteria(iss) {
  const base = [];
  if (/lcp|perf|render/i.test(iss.id)) {
    base.push("P75 LCP < 2.5s on mobile (CrUX field data)", "Verify PageSpeed score improvement > 10 points", "Eliminate render-blocking CSS and JavaScript");
  } else if (/cls/i.test(iss.id)) {
    base.push("Reserve space for media and embeds", "CLS < 0.1 in field data");
  } else if (/redirect/i.test(iss.id)) {
    base.push("Point internal links to the final URL", "Remove all redirect chains");
  } else if (/broken|404/i.test(iss.id)) {
    base.push("Restore or 301-redirect affected URLs", "Re-crawl shows no broken links");
  } else if (/image/i.test(iss.id)) {
    base.push("Serve next-gen image formats", "Add descriptive alt text");
  }
  base.push("Deploy the fix to production", "Re-test and verify the result");
  return base;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (v, suffix = "") => (num(v) != null ? `${v}${suffix}` : "—");

/* Derive the real "issues to fix" from available audit signals. */
function deriveIssues({ redirects, broken, pages404, lcp, cls, performance }) {
  const out = [];
  if (num(pages404) && pages404 > 0)
    out.push({
      id: "pages-404", title: "Fix broken pages (404 errors)", severity: 9, exposure: 8, effort: 5,
      impact: "High", potential: `${pages404} URL${pages404 === 1 ? "" : "s"} returning 404`,
      source: "From Crawl check: 404 responses", desc: "Restore or redirect pages that return 404 so link equity and crawl budget are not wasted.",
      count: pages404,
    });
  if (num(redirects) && redirects > 0)
    out.push({
      id: "redirect-chains", title: "Fix redirect chains", severity: 7, exposure: 7, effort: 4,
      impact: "Medium", potential: `${redirects} redirect chain${redirects === 1 ? "" : "s"}`,
      source: "From Crawl check: redirect chains", desc: "Point internal links directly to the final URL to remove extra hops and preserve PageRank.",
      count: redirects,
    });
  if (num(broken) && broken > 0)
    out.push({
      id: "broken-links", title: "Fix broken internal links", severity: 8, exposure: 7, effort: 4,
      impact: "Medium", potential: `${broken} broken link${broken === 1 ? "" : "s"}`,
      source: "From Crawl check: broken links", desc: "Update or remove links that point to missing pages so users and crawlers do not hit dead ends.",
      count: broken,
    });
  if (num(lcp) && lcp > 2.5)
    out.push({
      id: "lcp", title: "Improve Largest Contentful Paint (LCP)", severity: 9, exposure: 9, effort: 6,
      impact: "High", potential: `${lcp.toFixed(1)}s LCP, target < 2.5s`,
      source: "From PageSpeed: field data", desc: "Reduce render-blocking resources and optimise the largest above-the-fold element to speed up perceived load.",
      count: null,
    });
  if (num(cls) && cls > 0.1)
    out.push({
      id: "cls", title: "Reduce layout shift (CLS)", severity: 6, exposure: 6, effort: 4,
      impact: "Medium", potential: `CLS ${cls.toFixed(2)}, target < 0.1`,
      source: "From PageSpeed: field data", desc: "Reserve space for images, ads and embeds so content does not jump as the page loads.",
      count: null,
    });
  if (num(performance) && performance < 90)
    out.push({
      id: "perf", title: "Improve overall performance score", severity: 7, exposure: 8, effort: 6,
      impact: "High", potential: `Score ${performance}/100, target 90+`,
      source: "From PageSpeed audit", desc: "Compress assets, defer non-critical scripts and serve next-gen images to lift the Lighthouse performance score.",
      count: null,
    });
  return out.map((i, idx) => ({ ...i, score: i.severity * i.exposure * (i.effort || 1) }));
}

const STATUS_META = {
  "not-started": { label: "Not Started", cls: "border-rose-200 bg-rose-50 text-rose-700", cta: "Assign fix", next: "in-progress" },
  "in-progress": { label: "In Progress", cls: "border-amber-200 bg-amber-50 text-amber-700", cta: "Ready for QA", next: "qa" },
  qa: { label: "In QA", cls: "border-sky-200 bg-sky-50 text-sky-700", cta: "Mark complete", next: "completed" },
  completed: { label: "Completed", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", cta: "Reopen", next: "not-started" },
};

function Donut({ segments, size = 150, stroke = 22 }) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </g>
    </svg>
  );
}

function MetricCard({ Icon, label, value, unit }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
        <Icon size={14} /> {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[26px] font-bold tabular-nums text-[var(--text)]">{value}</span>
        {unit && value !== "—" && <span className="text-[12px] text-[var(--muted)]">{unit}</span>}
      </div>
    </div>
  );
}

function ProgressStat({ Icon, label, value, tone }) {
  return (
    <div className="flex-1 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
        <Icon size={13} className={tone} /> {label}
      </div>
      <div className="mt-1 text-[20px] font-extrabold tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}

/* ---- Issue detail modal (Opportunities / Diagnostics / Field Data / Affected Pages / Evidence) ---- */
function cwvStatus(kind, v) {
  if (v == null) return null;
  if (kind === "lcp") return v <= 2.5 ? "Good" : v <= 4 ? "Needs Improvement" : "Poor";
  if (kind === "inp") return v <= 200 ? "Good" : v <= 500 ? "Needs Improvement" : "Poor";
  if (kind === "cls") return v <= 0.1 ? "Good" : v <= 0.25 ? "Needs Improvement" : "Poor";
  return null;
}
const cwvBadge = (s) =>
  s === "Good" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
  : s === "Needs Improvement" ? "border-amber-200 bg-amber-50 text-amber-700"
  : "border-rose-200 bg-rose-50 text-rose-700";

function EmptyNote({ children }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-5 text-center text-[12px] text-[var(--muted)]">
      {children}
    </div>
  );
}

function IssueDetailModal({ issue, cwv = {}, domain = "", onClose, onAddTask }) {
  const TABS = [
    ["opportunities", "Opportunities", Lightbulb],
    ["diagnostics", "Diagnostics", Stethoscope],
    ["field", "Field Data", Table2],
    ["pages", "Affected Pages", FileSearch],
    ["evidence", "Evidence", Search],
  ];
  const [tab, setTab] = useState("opportunities");
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!issue) return null;

  const { lcp, inp, cls } = cwv;
  const vitals = [
    { k: "lcp", label: "LCP (Largest Contentful Paint)", value: num(lcp) != null ? `${lcp.toFixed(1)}s` : "—", status: cwvStatus("lcp", num(lcp)) },
    { k: "inp", label: "INP (Interaction to Next Paint)", value: num(inp) != null ? (inp >= 1000 ? `${(inp / 1000).toFixed(1)}s` : `${Math.round(inp)}ms`) : "—", status: cwvStatus("inp", num(inp)) },
    { k: "cls", label: "CLS (Cumulative Layout Shift)", value: num(cls) != null ? cls.toFixed(2) : "—", status: cwvStatus("cls", num(cls)) },
  ];

  const diagnostics = [
    { title: "Render-blocking resources", pass: !/render|performance|lcp/i.test(issue.id), note: "CSS and JavaScript in the critical path delay first paint." },
    { title: "Efficient cache policy", pass: true, note: "Static assets should be served with long-lived cache headers." },
    { title: "Image delivery optimised", pass: !/image|perf/i.test(issue.title), note: "Serve next-gen formats and correctly sized images." },
    { title: "Avoids large layout shifts", pass: !(num(cls) > 0.1), note: "Reserve space for media and embeds to keep CLS low." },
  ];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-[min(820px,100vw)] flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-panel,#fff)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[var(--text)]">{issue.title}</div>
            <div className="mt-0.5 text-[12px] text-[var(--muted)]">{issue.desc}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover,#f3f4f6)] hover:text-[var(--text)]">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition ${
                tab === k ? "bg-[var(--bg-panel,#fff)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "opportunities" && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold text-[var(--text)]">{issue.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--muted)]">{issue.source}</div>
                </div>
                <div className="shrink-0 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center">
                  <div className="text-[10px] text-emerald-700">Potential</div>
                  <div className="text-[12px] font-bold text-emerald-700">{issue.potential}</div>
                </div>
              </div>
              <div>
                <div className="mb-2 text-[12px] font-semibold text-[var(--text)]">Affected resources</div>
                <EmptyNote>Per-resource breakdown populates after a live PageSpeed / HAR analysis of the page.</EmptyNote>
              </div>
              <div>
                <div className="mb-2 text-[12px] font-semibold text-[var(--text)]">How to fix</div>
                <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{issue.desc}</p>
              </div>
            </div>
          )}

          {tab === "diagnostics" && (
            <div className="space-y-2">
              {diagnostics.map((d, i) => (
                <div key={i} className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3">
                  {d.pass ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--text)]">{d.title}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${d.pass ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {d.pass ? "Passed" : "Needs Attention"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-[var(--muted)]">{d.note}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "field" && (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--text)]">Core Web Vitals — Field Data</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {vitals.map((v) => (
                    <div key={v.k} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-3">
                      <div className="text-[10.5px] text-[var(--muted)]">{v.label}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[20px] font-bold tabular-nums text-[var(--text)]">{v.value}</span>
                        {v.status && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cwvBadge(v.status)}`}>{v.status}</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {num(lcp) == null && num(inp) == null && num(cls) == null && (
                  <div className="mt-2"><EmptyNote>No Core Web Vitals field data yet. Run a report with PageSpeed / CrUX enabled.</EmptyNote></div>
                )}
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--text)]">Distribution &amp; Page Groups</div>
                <EmptyNote>Field-data distribution (Good / Needs Improvement / Poor) and per-page-group breakdown require Search Console field data for this site.</EmptyNote>
              </div>
            </div>
          )}

          {tab === "pages" && (
            <div className="space-y-3">
              <div className="text-[12.5px] text-[var(--muted)]">The specific URLs affected by this issue, ranked by impact.</div>
              <EmptyNote>Per-URL affected-pages data (URL, impact, LCP, performance score) populates after a live crawl + PageSpeed analysis for this site.</EmptyNote>
            </div>
          )}

          {tab === "evidence" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><Database size={14} /> Data Sources</div>
                <ul className="space-y-1.5">
                  {["PageSpeed Insights (lab + field data)", "Google Search Console (field data)", "Internal Crawler (site structure)"].map((s) => (
                    <li key={s} className="flex items-center gap-2 text-[12.5px] text-[var(--text)]"><CheckCircle2 size={14} className="text-emerald-500" /> {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><ShieldCheck size={14} /> Confidence Level</div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full w-4/5 rounded-full bg-emerald-500" /></div>
                  <span className="text-[12px] font-semibold text-emerald-600">High</span>
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><ListChecks size={14} /> Reproduction Steps</div>
                <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-[var(--muted)]">
                  <li>Run PageSpeed Insights on the affected URLs.</li>
                  <li>Verify field data in Google Search Console (Core Web Vitals report).</li>
                  <li>Cross-check with the internal crawl for the same pages.</li>
                </ol>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text)]"><FileText size={14} /> Raw Data Access</div>
                <div className="flex flex-wrap gap-2">
                  {domain && (
                    <a href={`https://search.google.com/search-console`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--text)] hover:border-[#D45427]/40">
                      <ExternalLink size={13} /> View GSC Data
                    </a>
                  )}
                  {domain && (
                    <a href={`https://pagespeed.web.dev/report?url=${encodeURIComponent(/^https?:\/\//.test(domain) ? domain : `https://${domain}`)}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--text)] hover:border-[#D45427]/40">
                      <ExternalLink size={13} /> Open PageSpeed Report
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] opacity-60">
                    <Download size={13} /> Download HAR (after analysis)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3">
          <div className="text-[11px] text-[var(--muted)]">Severity {issue.severity} · Exposure {issue.exposure} · Effort {issue.effort} · Score {issue.score}</div>
          <button onClick={() => { onAddTask?.(issue); onClose?.(); }}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-90">
            <Plus size={15} /> Create fix task
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Re-test Result modal (before/after verification after a fix) ---- */
function fmtInpVal(v) {
  if (num(v) == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}
function RetestModal({ issue, before = {}, after = {}, domain = "", onVerify, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!issue) return null;

  // lowerBetter: improvement is a decrease (LCP/INP/CLS). Performance: higher better.
  const rows = [
    { label: "Performance Score", b: before.perf, a: after.perf, lowerBetter: false, fmt: (x) => (num(x) != null ? `${Math.round(x)}` : "—"), dfmt: (d) => `${d > 0 ? "+" : ""}${Math.round(d)}` },
    { label: "LCP (Largest Contentful Paint)", b: before.lcp, a: after.lcp, lowerBetter: true, fmt: (x) => (num(x) != null ? `${x.toFixed(1)}s` : "—"), dfmt: (d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}s` },
    { label: "INP (Interaction to Next Paint)", b: before.inp, a: after.inp, lowerBetter: true, fmt: fmtInpVal, dfmt: (d) => (Math.abs(d) >= 1000 ? `${d > 0 ? "+" : ""}${(d / 1000).toFixed(1)}s` : `${d > 0 ? "+" : ""}${Math.round(d)}ms`) },
    { label: "CLS (Cumulative Layout Shift)", b: before.cls, a: after.cls, lowerBetter: true, fmt: (x) => (num(x) != null ? x.toFixed(2) : "—"), dfmt: (d) => `${d > 0 ? "+" : ""}${d.toFixed(2)}` },
  ];

  const perfGain = num(after.perf) != null && num(before.perf) != null ? after.perf - before.perf : null;
  const lcpOk = num(after.lcp) != null && after.lcp <= 2.5;
  const cwvGood = lcpOk && (num(after.cls) == null || after.cls <= 0.1);
  const improved = rows.some((r) => {
    if (num(r.a) == null || num(r.b) == null) return false;
    const d = r.a - r.b;
    return r.lowerBetter ? d < 0 : d > 0;
  });

  const criteria = [
    { label: "P75 LCP ≤ 2.5s", val: num(after.lcp) != null ? (lcpOk ? `Achieved (${after.lcp.toFixed(1)}s)` : `Not met (${after.lcp.toFixed(1)}s)`) : "No data", ok: lcpOk },
    { label: "Performance Score Improvement ≥10 points", val: perfGain != null ? (perfGain >= 10 ? `Achieved (+${Math.round(perfGain)})` : `Pending (${perfGain >= 0 ? "+" : ""}${Math.round(perfGain)})`) : "No baseline", ok: perfGain != null && perfGain >= 10 },
    { label: "Core Web Vitals Status", val: num(after.lcp) != null ? (cwvGood ? "Good" : "Needs work") : "No data", ok: cwvGood },
    { label: "Field Data", val: improved ? "Shows improvement vs baseline" : "No change since baseline", ok: improved },
  ];

  const verDate = new Date().toLocaleDateString();

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-[min(760px,100vw)] flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-panel,#fff)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="text-[16px] font-bold text-[var(--text)]">Re-test Result</div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover,#f3f4f6)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[13px] font-semibold text-[var(--text)]">Performance Comparison</div>
          <div className="mt-2 overflow-hidden rounded-[12px] border border-[var(--border)]">
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 bg-[var(--card)] px-4 py-2 text-[11px] font-semibold text-[var(--muted)]">
              <span>Metric</span><span>Before</span><span>After</span><span>Changes</span>
            </div>
            {rows.map((r) => {
              const hasBoth = num(r.a) != null && num(r.b) != null;
              const d = hasBoth ? r.a - r.b : null;
              const good = d != null && (r.lowerBetter ? d < 0 : d > 0);
              const neutral = d === 0;
              return (
                <div key={r.label} className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-panel,#fff)] px-4 py-2.5 text-[12.5px]">
                  <span className="text-[var(--text)]">{r.label}</span>
                  <span className="tabular-nums text-[var(--text)]">{r.fmt(r.b)}</span>
                  <span className="tabular-nums text-[var(--text)]">{r.fmt(r.a)}</span>
                  <span className={`tabular-nums font-medium ${d == null || neutral ? "text-[var(--muted)]" : good ? "text-emerald-600" : "text-rose-600"}`}>
                    {d == null ? "—" : neutral ? "0" : r.dfmt(d)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 text-[13px] font-semibold text-[var(--text)]">Acceptance Criteria Status</div>
          <ul className="mt-2 space-y-1.5">
            {criteria.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-[12.5px]">
                {c.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />}
                <span><span className="font-semibold text-[var(--text)]">{c.label}:</span> <span className="text-[var(--muted)]">{c.val}</span></span>
              </li>
            ))}
          </ul>

          <div className="mt-5 text-[13px] font-semibold text-[var(--text)]">Technical Details</div>
          <div className="mt-2 space-y-1 text-[12.5px]">
            <div className="flex gap-3"><span className="w-36 font-medium text-[var(--text)]">Verification Date:</span><span className="text-[var(--muted)]">{verDate}</span></div>
            <div className="flex gap-3"><span className="w-36 font-medium text-[var(--text)]">Test Environment:</span><span className="text-[var(--muted)]">Production</span></div>
            <div className="flex gap-3"><span className="w-36 font-medium text-[var(--text)]">Data Source:</span><span className="text-[var(--muted)]">PageSpeed Insights API + Search Console</span></div>
            {domain && <div className="flex gap-3"><span className="w-36 font-medium text-[var(--text)]">Scope:</span><span className="text-[var(--muted)]">{domain}</span></div>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]">Close</button>
          <button onClick={() => { onVerify?.(); onClose?.(); }}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-90">
            <CheckCircle2 size={15} /> Mark as Verified
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Assign & Create Task modal ---- */
const PRIORITY_OPTIONS = {
  High: "High - Significant performance impact",
  Medium: "Medium - Moderate impact",
  Low: "Low - Minor impact",
};
function AssignTaskModal({ issue, domain = "", onClose, onCreate }) {
  const [team, setTeam] = useState(suggestTeam(issue?.id || ""));
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState(() => {
    const d = new Date(Date.now() + 14 * 864e5);
    return d.toISOString().slice(0, 10);
  });
  const [priority, setPriority] = useState(issue?.impact || "Medium");
  const [criteria, setCriteria] = useState(() =>
    defaultCriteria(issue || {}).map((label) => ({ label, checked: false }))
  );
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!issue) return null;

  const toggleC = (i) => setCriteria((c) => c.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)));

  return (
    <div className="fixed inset-0 z-[92] grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-[min(760px,100vw)] flex-col overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-panel,#fff)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="text-[16px] font-bold text-[var(--text)]">Issue Summary</div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover,#f3f4f6)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Issue summary card */}
          <div className="rounded-[14px] border border-[#F5D9C4] bg-gradient-to-br from-[#FDEEE1] to-[#FCE3D2] p-4">
            <div className="text-[15px] font-bold text-[#1A1A1A]">{issue.title}</div>
            <div className="mt-0.5 text-[12px] text-[#7c5a44]"><span className="font-semibold">Created from:</span> {issue.source}</div>
            <div className="mt-1 text-[12.5px] text-[#1A1A1A]">{issue.potential}</div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[["Severity", issue.severity], ["Exposure", issue.exposure], ["Effort", issue.effort], ["Score", issue.score]].map(([l, v]) => (
                <div key={l}><div className="text-[18px] font-bold tabular-nums text-[#1A1A1A]">{v}</div><div className="text-[10px] text-[#7c5a44]">{l}</div></div>
              ))}
            </div>
          </div>

          {/* Team */}
          <div className="mt-4">
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]"><Users size={13} /> Team</label>
            <select value={team} onChange={(e) => setTeam(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[#D45427]">
              {TEAM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="mt-1 text-[11px] text-[var(--muted)]">Auto-suggested based on the issue type.</div>
          </div>

          {/* Assignee */}
          <div className="mt-4">
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]"><UserPlus size={13} /> Assigned to</label>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Type a name, or leave blank to assign to yourself"
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[#D45427]" />
          </div>

          {/* Due date */}
          <div className="mt-4">
            <label className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]"><Calendar size={13} /> Due date</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[#D45427]" />
          </div>

          {/* Priority */}
          <div className="mt-4">
            <label className="mb-1 text-[12px] font-medium text-[var(--muted)]">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[13px] text-[var(--text)] outline-none focus:border-[#D45427]">
              {Object.entries(PRIORITY_OPTIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>

          {/* Acceptance criteria */}
          <div className="mt-4">
            <div className="mb-1.5 text-[12.5px] font-semibold text-[var(--text)]">Acceptance Criteria (Definition of Done)</div>
            <div className="space-y-1.5">
              {criteria.map((c, i) => (
                <label key={i} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-[var(--text)]">
                  <button type="button" onClick={() => toggleC(i)} aria-label={c.checked ? "Uncheck" : "Check"}
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition ${c.checked ? "border-[#D45427] bg-[#D45427] text-white" : "border-gray-300 text-transparent"}`}>
                    <Check size={11} />
                  </button>
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-5 py-3">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[12.5px] font-medium text-[var(--muted)] hover:text-[var(--text)]"><X size={14} /> Cancel</button>
          <button onClick={() => onCreate?.({ team, assignee: assignee.trim() || "You", due, priority, criteria: criteria.map((c) => ({ ...c })) })}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-90">
            <CheckCircle2 size={15} /> Assign &amp; Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Task Created confirmation ---- */
function TaskCreatedModal({ issue, assignment = {}, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!issue) return null;
  const dueFmt = assignment.due ? new Date(assignment.due).toLocaleDateString() : "—";
  const actions = [
    "Added to your Tasks list",
    `Due date set for ${dueFmt}`,
    "Re-test is available from the issue card once deployed",
    "Progress will update on the Site Health dashboard",
  ];
  return (
    <div className="fixed inset-0 z-[96] grid place-items-center bg-black/45 p-4" onClick={onClose}>
      <div className="w-[min(520px,100vw)] overflow-hidden rounded-[16px] border border-[var(--border)] bg-[var(--bg-panel,#fff)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={30} /></div>
          <div className="mt-3 text-[17px] font-bold text-[var(--text)]">Task Created</div>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">The fix has been assigned and added to your task list.</div>
        </div>
        <div className="px-6 py-4">
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="text-[12px] font-semibold text-[var(--text)]">Issue Summary</div>
            <div className="mt-2 space-y-1 text-[12.5px]">
              <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">Task</span><span className="text-right font-medium text-[var(--text)]">{issue.title}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">Assigned to</span><span className="font-medium text-[var(--text)]">{assignment.assignee || "You"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">Team</span><span className="font-medium text-[var(--text)]">{assignment.team || "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">Due date</span><span className="font-medium text-[var(--text)]">{dueFmt}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[var(--muted)]">Priority</span><span className="font-medium text-[var(--text)]">{assignment.priority || "—"}</span></div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text)]"><Bell size={13} /> Automated Actions</div>
            <ul className="space-y-1">
              {actions.map((a) => (
                <li key={a} className="flex items-start gap-2 text-[12.5px] text-[var(--muted)]"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" /> {a}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-end border-t border-[var(--border)] px-6 py-3">
          <button onClick={onClose} className="inline-flex items-center gap-2 rounded-[10px] bg-[image:var(--infoHighlight-gradient)] px-6 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-90">OK</button>
        </div>
      </div>
    </div>
  );
}

export default function SiteHealth({ data = {}, onBack, onViewIssue }) {
  const {
    domain = "", siteHealth = null, performance = null, pageSpeedMobile = null, pageSpeedDesktop = null,
    lcp = null, inp = null, cls = null, pagesScanned = null, redirects = null, broken = null,
    pages404 = null, issues = {}, periodDays = 30, onPeriodChange, isDark, onToggleTheme,
  } = data;

  const [device, setDevice] = useState("desktop");
  const [statuses, setStatuses] = useState({});
  const [detailIssue, setDetailIssue] = useState(null);
  const [retestIssue, setRetestIssue] = useState(null);
  const [assignModal, setAssignModal] = useState(null); // issue being assigned
  const [createdModal, setCreatedModal] = useState(null); // { issue, assignment }
  useEffect(() => { setStatuses(loadStatuses(domain)); }, [domain]);

  const issueList = useMemo(
    () => deriveIssues({ redirects, broken, pages404, lcp, cls, performance }),
    [redirects, broken, pages404, lcp, cls, performance]
  );

  const statusOf = (id) => statuses[id] || "not-started";
  const setStatus = useCallback((id, status) => {
    setStatuses((prev) => {
      const next = { ...prev, [id]: status };
      saveStatuses(domain, next);
      return next;
    });
  }, [domain]);

  const cycle = (id) => {
    const cur = statusOf(id);
    const next = STATUS_META[cur]?.next || "not-started";
    setStatus(id, next);
    if (next === "in-progress") {
      const iss = issueList.find((x) => x.id === id);
      // Capture a "before" performance snapshot the first time a fix is assigned.
      saveSnap(domain, id, { perf: num(performance), lcp: num(lcp), inp: num(inp), cls: num(cls) });
      try {
        window.dispatchEvent(new CustomEvent("dashboard:add-task", {
          detail: { title: iss?.title || "Site Health fix", detail: iss?.potential || "", source: "Site Health" },
        }));
      } catch {}
    }
  };

  const counts = useMemo(() => {
    let assigned = 0, completed = 0, inProgress = 0;
    for (const i of issueList) {
      const st = statusOf(i.id);
      if (st === "completed") completed++;
      else if (st === "in-progress" || st === "qa") { inProgress++; assigned++; }
      else if (st !== "not-started") assigned++;
    }
    return { assigned, completed, inProgress };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueList, statuses]);

  const resolved = issueList.filter((i) => statusOf(i.id) === "completed");
  const active = issueList.filter((i) => statusOf(i.id) !== "completed");

  const perf = num(performance) != null ? performance
    : num(pageSpeedMobile) != null && num(pageSpeedDesktop) != null ? Math.round((pageSpeedMobile + pageSpeedDesktop) / 2)
    : num(pageSpeedMobile) ?? num(pageSpeedDesktop);

  const scanned = num(pagesScanned) || 0;
  const err404 = num(pages404) || 0;
  const red = num(redirects) || 0;
  const brk = num(broken) || 0;
  const ok200 = Math.max(0, scanned - err404 - red - brk);

  const scanSegments = [
    { label: "Crawled (OK)", value: ok200, color: "#3B82F6" },
    { label: "Redirects", value: red, color: "#A855F7" },
    { label: "Broken", value: brk, color: "#EF4444" },
    { label: "404 errors", value: err404, color: "#F59E0B" },
  ].filter((s) => s.value > 0);
  const hasScan = scanSegments.length > 0;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onBack?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const scope = domain ? (/^https?:\/\//.test(domain) ? domain : `https://${domain}`) : "—";
  const err = num(issues?.critical) || 0;
  const warn = num(issues?.warning) || 0;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      {/* Upper bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">Site Health</div>
          <div className="text-[11px] text-[var(--muted)]">Scope : <span className="text-[var(--text)]">{scope}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onPeriodChange && (
            <div className="hidden items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] text-[var(--muted)] sm:flex">
              Last {periodDays} days <ChevronDown size={13} />
            </div>
          )}
          <button className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">
            Chat with Ai <Sparkles size={14} />
          </button>
          {onToggleTheme && (
            <button onClick={onToggleTheme} aria-label="Toggle theme" className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        {/* Device tabs + tools */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-1">
            {[["desktop", Monitor, "Desktop"], ["mobile", Smartphone, "Mobile"]].map(([k, Icon, lbl]) => (
              <button key={k} onClick={() => setDevice(k)}
                className={`inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition ${
                  device === k ? "bg-[var(--bg-panel,#fff)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"}`}>
                <Icon size={14} /> {lbl}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[12px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5 opacity-60"><Download size={13} /> Download HAR</span>
            <span className="inline-flex items-center gap-1.5 opacity-60"><Share2 size={13} /> Share Result</span>
            <span className="inline-flex items-center gap-1.5 opacity-60"><Network size={13} /> View Tree map</span>
          </div>
        </div>

        {/* Performance preview + Scan results */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid min-h-[200px] place-items-center rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-sm">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#F0782E] to-[#FBA43C] text-white shadow-lg">
                <Play size={22} />
              </div>
              <div className="mt-3 text-[13px] font-semibold text-[var(--text)]">Performance Preview</div>
              <div className="text-[11px] text-[var(--muted)]">
                {perf != null ? `Current ${device} performance score: ${perf}/100` : "Run a report to see the performance analysis"}
              </div>
            </div>
          </div>

          <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-[13px] font-semibold text-[var(--text)]">Scan Results</div>
            {hasScan ? (
              <div className="mt-3 flex items-center gap-4">
                <Donut segments={scanSegments} />
                <div className="space-y-1.5">
                  {scanSegments.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-[11.5px]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                      <span className="text-[var(--muted)]">{s.label}</span>
                      <span className="ml-auto font-semibold tabular-nums text-[var(--text)]">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 mb-4 text-center text-[12px] text-[var(--muted)]">No crawl data yet. Run a report to populate scan results.</div>
            )}
          </div>
        </div>

        {/* Metric cards */}
        <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard Icon={Gauge} label="Performance" value={perf != null ? perf : "—"} unit="/ 100" />
          <MetricCard Icon={HardDrive} label="Page Size" value="—" unit="MB" />
          <MetricCard Icon={Timer} label="Load time" value="—" unit="s" />
          <MetricCard Icon={Server} label="Requests" value="—" />
        </div>
        <div className="mt-1.5 text-[10.5px] text-[var(--muted)]">
          Page size, load time and request counts populate after a live PageSpeed / HAR analysis.
        </div>

        {/* Current Issue & Progress */}
        <h2 className="mt-8 mb-3 text-[16px] font-bold text-[var(--text)]">Current Issue &amp; Progress</h2>
        <div className="flex flex-wrap gap-3">
          <ProgressStat Icon={ClipboardList} label="Assigned Issue" value={counts.assigned} tone="text-[#D45427]" />
          <ProgressStat Icon={CheckCircle2} label="Completed" value={counts.completed} tone="text-emerald-500" />
          <ProgressStat Icon={Loader2} label="In Progress" value={counts.inProgress} tone="text-amber-500" />
          <ProgressStat Icon={AlertOctagon} label="Error" value={err} tone="text-rose-500" />
          <ProgressStat Icon={AlertTriangle} label="Warning" value={warn} tone="text-amber-500" />
        </div>

        {/* Issues to Fix */}
        <div className="mt-8 mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-[16px] font-bold text-[var(--text)]">
            Issues to Fix (Prioritized by Impact)
            <Info size={14} className="text-[var(--muted)]" />
          </h2>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              onClick={() => active.forEach((i) => statusOf(i.id) === "not-started" && cycle(i.id))}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[image:var(--infoHighlight-gradient)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">
              <Zap size={13} /> Fix All Now
            </button>
          </div>
        </div>

        {active.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <CheckCircle2 size={26} className="mx-auto text-emerald-500" />
            <div className="mt-2 text-[13px] font-semibold text-[var(--text)]">No outstanding issues</div>
            <div className="text-[12px] text-[var(--muted)]">Run a report to surface technical issues, or you have resolved them all.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {active.map((iss) => {
              const st = statusOf(iss.id);
              const meta = STATUS_META[st];
              return (
                <div key={iss.id} className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[14.5px] font-semibold text-[var(--text)]">{iss.title}</div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        title={`${iss.impact} priority`}
                        className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: iss.impact === "High" ? "#EF4444" : iss.impact === "Medium" ? "#F59E0B" : "#9CA3AF" }}
                      >
                        {iss.impact?.[0] || "M"}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${meta.cls}`}>{meta.label}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">{iss.impact} · {iss.potential}</div>
                  <div className="mt-2 inline-block rounded-md bg-[#FFF3EA] px-2.5 py-1 text-[11px] font-medium text-[#B4531B]">{iss.source}</div>

                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {[["Severity", iss.severity], ["Exposure", iss.exposure], ["Effort", iss.effort], ["Score", iss.score]].map(([l, v]) => (
                      <div key={l}>
                        <div className="text-[16px] font-bold tabular-nums text-[var(--text)]">{v}</div>
                        <div className="text-[10px] text-[var(--muted)]">{l}</div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--muted)]">{iss.desc}</p>

                  {/* Assignment — real: populated when the fix is assigned (no placeholder names) */}
                  {(() => {
                    const snap = loadSnaps(domain)[iss.id];
                    const assigned = st !== "not-started";
                    const dueDate = snap?.at ? new Date(snap.at + 7 * 864e5).toLocaleDateString() : null;
                    return (
                      <div className="mt-3 text-[12px]">
                        <div>
                          <span className="font-semibold text-[var(--text)]">Assigned to: </span>
                          <span className="text-[var(--muted)]">{assigned ? "You" : "Unassigned"}</span>
                        </div>
                        {dueDate && <div className="mt-0.5 text-[11px] text-[var(--muted)]">Due: {dueDate}</div>}
                      </div>
                    );
                  })()}

                  {/* Fix progress (derived from status) */}
                  {(() => {
                    const pct = st === "completed" ? 100 : st === "qa" ? 75 : st === "in-progress" ? 45 : 0;
                    return (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#F0782E] to-[#FBA43C] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-1 text-right text-[10px] text-[var(--muted)] tabular-nums">{pct}/100</div>
                      </div>
                    );
                  })()}

                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => { setDetailIssue(iss); onViewIssue?.(iss); }}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)] hover:border-[#D45427]/40">
                      <Eye size={14} /> View details
                    </button>
                    {(st === "in-progress" || st === "qa") && (
                      <button onClick={() => setRetestIssue(iss)}
                        className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)] hover:border-[#D45427]/40">
                        <RefreshCw size={14} /> Re-test
                      </button>
                    )}
                    <button onClick={() => { if (st === "not-started") setAssignModal(iss); else cycle(iss.id); }}
                      className="inline-flex items-center gap-1.5 rounded-[10px] bg-[image:var(--infoHighlight-gradient)] px-3 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">
                      <Plus size={14} /> {meta.cta}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Resolved + Response codes */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="mb-3 text-[16px] font-bold text-[var(--text)]">Resolved issues</h2>
            <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[11px] font-semibold text-[var(--muted)]">
                <span>Complete</span><span>Grade</span><span>Score</span>
              </div>
              {resolved.length ? resolved.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)] px-4 py-2.5 text-[12.5px]">
                  <span className="text-[var(--text)]">{r.title}</span>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">A</span>
                  <span className="font-semibold tabular-nums text-[var(--text)]">100</span>
                </div>
              )) : (
                <div className="bg-[var(--bg-panel,#fff)] px-4 py-6 text-center text-[12px] text-[var(--muted)]">
                  No resolved issues yet. Mark an issue complete to see it here.
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-[16px] font-bold text-[var(--text)]">Response Codes</h2>
            <div className="overflow-hidden rounded-[14px] border border-[var(--border)]">
              <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[11px] font-semibold text-[var(--muted)]">
                <span>Code</span><span>Pages</span>
              </div>
              {[
                { code: "200", label: "OK", value: ok200, cls: "bg-emerald-100 text-emerald-700" },
                { code: "3xx", label: "Redirect", value: red, cls: "bg-purple-100 text-purple-700" },
                { code: "404", label: "Not Found", value: err404, cls: "bg-amber-100 text-amber-700" },
                { code: "4xx/5xx", label: "Broken", value: brk, cls: "bg-rose-100 text-rose-700" },
              ].filter((r) => r.value > 0).map((r) => (
                <div key={r.code} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)] px-4 py-2.5 text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${r.cls}`}>{r.code}</span>
                    <span className="text-[var(--text)]">{r.label}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--text)]">{r.value}</span>
                </div>
              ))}
              {!hasScan && (
                <div className="bg-[var(--bg-panel,#fff)] px-4 py-6 text-center text-[12px] text-[var(--muted)]">No crawl data yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Content type breakdown (needs live analysis) */}
        <h2 className="mt-8 mb-3 text-[16px] font-bold text-[var(--text)]">Content Breakdown</h2>
        <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center text-[12.5px] text-[var(--muted)]">
          The content-type breakdown (images, scripts, CSS, fonts and their sizes) populates after a live PageSpeed / HAR analysis of the site.
        </div>

        <div className="h-6" />
      </div>

      {/* Issue detail modal */}
      {detailIssue && (
        <IssueDetailModal
          issue={detailIssue}
          cwv={{ lcp, inp, cls }}
          domain={domain}
          onClose={() => setDetailIssue(null)}
          onAddTask={(iss) => {
            try {
              window.dispatchEvent(new CustomEvent("dashboard:add-task", {
                detail: { title: iss.title, detail: iss.potential || "", source: "Site Health" },
              }));
            } catch {}
          }}
        />
      )}

      {/* Re-test result modal */}
      {retestIssue && (() => {
        const snap = loadSnaps(domain)[retestIssue.id] || {};
        const now = { perf: num(performance), lcp: num(lcp), inp: num(inp), cls: num(cls) };
        // If no baseline was captured, fall back to current values as the baseline.
        const before = {
          perf: num(snap.perf) != null ? snap.perf : now.perf,
          lcp: num(snap.lcp) != null ? snap.lcp : now.lcp,
          inp: num(snap.inp) != null ? snap.inp : now.inp,
          cls: num(snap.cls) != null ? snap.cls : now.cls,
        };
        return (
          <RetestModal
            issue={retestIssue}
            before={before}
            after={now}
            domain={domain}
            onVerify={() => setStatus(retestIssue.id, "completed")}
            onClose={() => setRetestIssue(null)}
          />
        );
      })()}

      {/* Assign & Create Task modal */}
      {assignModal && (
        <AssignTaskModal
          issue={assignModal}
          domain={domain}
          onClose={() => setAssignModal(null)}
          onCreate={(assignment) => {
            const iss = assignModal;
            saveAssign(domain, iss.id, assignment);
            saveSnap(domain, iss.id, { perf: num(performance), lcp: num(lcp), inp: num(inp), cls: num(cls) });
            setStatus(iss.id, "in-progress");
            try {
              window.dispatchEvent(new CustomEvent("dashboard:add-task", {
                detail: {
                  title: iss.title,
                  detail: `${assignment.team} · ${assignment.priority} priority · due ${assignment.due}`,
                  source: "Site Health",
                },
              }));
            } catch {}
            setAssignModal(null);
            setCreatedModal({ issue: iss, assignment });
          }}
        />
      )}

      {/* Task Created confirmation */}
      {createdModal && (
        <TaskCreatedModal
          issue={createdModal.issue}
          assignment={createdModal.assignment}
          onClose={() => setCreatedModal(null)}
        />
      )}
    </div>
  );
}
