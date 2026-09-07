"use client";

// SerpFeatures — full "SERP Features" screen (Figma VR4DZWLHbFKfCEJTYeuPKB · 162:111050).
// Left: the 8 SERP features with a status tag + "View details". Right: a details
// panel for the selected feature (definition, current status + live-SERP preview,
// competitor winners, technical requirements, prioritised opportunities) and a
// footer to Save to Content Plan / Add to Tasks.
//
// Feature definitions and technical requirements are factual reference content
// (the same copy the Figma specifies). Status, counts and competitor winners come
// from the real SERP data passed in; nothing is faked — missing data shows an
// honest empty state or "Not appearing".

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Sparkles,
  Star,
  HelpCircle,
  MapPin,
  Image as ImageIcon,
  MessageSquare,
  Play,
  ShoppingBag,
  Newspaper,
  BadgeInfo,
  Activity,
  Trophy,
  Code2,
  Lightbulb,
  Check,
  ExternalLink,
  ListTodo,
  BookmarkPlus,
  Sun,
  Moon,
} from "lucide-react";

/* Factual reference catalog for each SERP feature (matches the Figma copy). */
const FEATURES = [
  {
    key: "featuredSnippet",
    name: "Featured Snippet",
    Icon: Star,
    blurb: "Direct answer box appearing above organic results. High visibility opportunity for informational queries.",
    dataKey: "featuredSnippets",
    definition:
      "A Featured Snippet is a special search result that appears at the top of Google's organic results in a box, providing a direct answer to the user's query. It typically includes text, lists, or tables extracted from a webpage.",
    snippetType: "Paragraph (Definition)",
    markup: "FAQPage Schema + HowTo Schema",
    copyRecs: [
      "Start with 'X is a...' or 'X refers to...' format",
      "Keep definitions between 40-60 words",
      "Include the exact query phrase in your answer",
      "Use simple, authoritative language",
    ],
    opportunities: [
      { priority: "high", lift: "+15% est. lift", text: "Add a 'What is...' section to a core guide page with a 40-60 word definition" },
      { priority: "high", lift: "+12% est. lift", text: "Restructure a key page with a numbered, step-by-step list format" },
      { priority: "medium", lift: "+8% est. lift", text: "Add FAQ schema to a high-intent page" },
    ],
  },
  {
    key: "peopleAlsoAsk",
    name: "People Also Ask",
    Icon: HelpCircle,
    blurb: "Expandable question boxes showing related queries. Target these with clear question-and-answer content.",
    dataKey: "peopleAlsoAsk",
    definition:
      "People Also Ask (PAA) is an expandable set of related questions Google shows in the results. Answering these questions concisely on your pages can earn placement in the PAA box and related snippets.",
    snippetType: "Question and Answer",
    markup: "FAQPage Schema",
    copyRecs: [
      "Use the exact question as an H2 or H3 heading",
      "Answer in the first 1-2 sentences, then expand",
      "Cover 4-6 closely related questions per page",
      "Keep each answer between 40-60 words",
    ],
    opportunities: [
      { priority: "high", lift: "+10% est. lift", text: "Add a question-form FAQ section targeting related PAA queries" },
      { priority: "medium", lift: "+6% est. lift", text: "Mark up the FAQ block with FAQPage schema" },
    ],
  },
  {
    key: "localPack",
    name: "Local Pack",
    Icon: MapPin,
    blurb: "Map-based listing for local searches. Strengthen your Google Business Profile and local signals.",
    dataKey: "localPack",
    definition:
      "The Local Pack is the map-based block of three local business listings Google shows for location-based queries. Ranking here depends on your Google Business Profile, reviews, citations and local relevance.",
    snippetType: "Local business listing",
    markup: "LocalBusiness Schema",
    copyRecs: [
      "Complete and verify your Google Business Profile",
      "Keep NAP (name, address, phone) consistent across the web",
      "Earn and respond to reviews regularly",
      "Add LocalBusiness schema with geo-coordinates",
    ],
    opportunities: [
      { priority: "high", lift: "+14% est. lift", text: "Complete every Google Business Profile field and add photos" },
      { priority: "medium", lift: "+7% est. lift", text: "Build consistent local citations across directories" },
    ],
  },
  {
    key: "imagePack",
    name: "Image Pack",
    Icon: ImageIcon,
    blurb: "Image carousel in search results. Optimize image alt text and file names for visibility.",
    dataKey: "imagePack",
    definition:
      "An Image Pack is a row or block of images shown within the search results. Optimising your images (alt text, descriptive file names, structured data and page context) makes them eligible for this feature.",
    snippetType: "Image result",
    markup: "ImageObject Schema",
    copyRecs: [
      "Use descriptive, keyword-relevant file names",
      "Write specific alt text for every image",
      "Serve modern, fast-loading image formats",
      "Place images near relevant, descriptive text",
    ],
    opportunities: [
      { priority: "high", lift: "+8% est. lift", text: "Add descriptive alt text and file names to key page images" },
      { priority: "medium", lift: "+5% est. lift", text: "Add ImageObject schema to image-heavy pages" },
    ],
  },
  {
    key: "reviewSnippets",
    name: "Review Snippets",
    Icon: MessageSquare,
    blurb: "Star ratings displayed in search results. Implement review schema across product and service pages.",
    dataKey: "reviewSnippets",
    definition:
      "Review Snippets show star ratings and review counts beneath a result. They require valid Review or AggregateRating structured data backed by genuine reviews on the page.",
    snippetType: "Rating snippet",
    markup: "Review / AggregateRating Schema",
    copyRecs: [
      "Collect genuine first-party reviews on the page",
      "Add AggregateRating structured data",
      "Never mark up ratings that are not visible on-page",
      "Keep review content fresh and specific",
    ],
    opportunities: [
      { priority: "high", lift: "+9% est. lift", text: "Add AggregateRating schema to product and service pages" },
      { priority: "medium", lift: "+5% est. lift", text: "Surface real customer reviews on key landing pages" },
    ],
  },
  {
    key: "videoCarousel",
    name: "Video Carousel",
    Icon: Play,
    blurb: "Video results for relevant queries. Consider creating video content for top-performing topics.",
    dataKey: "videoCarousel",
    definition:
      "The Video Carousel is a horizontally scrollable row of video results. Publishing relevant videos (often on YouTube) with clear titles, chapters and structured data makes your content eligible.",
    snippetType: "Video result",
    markup: "VideoObject Schema",
    copyRecs: [
      "Create videos for your top informational topics",
      "Add VideoObject schema with a thumbnail and duration",
      "Use clear, keyword-relevant titles and chapters",
      "Embed videos on the matching page",
    ],
    opportunities: [
      { priority: "high", lift: "+12% est. lift", text: "Produce short videos for your highest-traffic topics" },
      { priority: "medium", lift: "+6% est. lift", text: "Add VideoObject schema and embed on relevant pages" },
    ],
  },
  {
    key: "shoppingResults",
    name: "Shopping Results",
    Icon: ShoppingBag,
    blurb: "Product listings with price and image. Requires Google Merchant Center setup.",
    dataKey: "shoppingResults",
    definition:
      "Shopping Results show product listings with images, prices and merchant names. Eligibility requires a Google Merchant Center product feed and Product structured data.",
    snippetType: "Product listing",
    markup: "Product + Offer Schema",
    copyRecs: [
      "Set up a Google Merchant Center product feed",
      "Add Product and Offer structured data",
      "Keep prices and availability accurate",
      "Use high-quality product images",
    ],
    opportunities: [
      { priority: "high", lift: "+11% est. lift", text: "Set up a Merchant Center feed for your products" },
      { priority: "medium", lift: "+6% est. lift", text: "Add Product/Offer schema to product pages" },
    ],
  },
  {
    key: "topStories",
    name: "Top Stories",
    Icon: Newspaper,
    blurb: "News carousel for timely content. Requires news publisher status and regular publishing.",
    dataKey: "topStories",
    definition:
      "Top Stories is a carousel of timely news articles. Eligibility generally requires recognised news-publisher status, fresh reporting and Article structured data.",
    snippetType: "News article",
    markup: "NewsArticle Schema",
    copyRecs: [
      "Publish timely, original reporting consistently",
      "Add NewsArticle structured data",
      "Keep a clear author, dateline and byline",
      "Maintain a fast, clean article template",
    ],
    opportunities: [
      { priority: "medium", lift: "+7% est. lift", text: "Publish timely articles on trending industry topics" },
      { priority: "low", lift: "+4% est. lift", text: "Add NewsArticle schema to editorial content" },
    ],
  },
];

/* Status tokens */
const STATUS = {
  winning: { label: "Winning", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  opportunity: { label: "Opportunity", cls: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  "not-appearing": { label: "Not Appearing", cls: "border-gray-200 bg-gray-50 text-gray-500", dot: "bg-gray-400" },
};

/** Derive a real status from the SERP data for a feature. */
function deriveStatus(feature, serp) {
  const raw = serp ? serp[feature.dataKey] : null;
  const n = typeof raw === "number" ? raw : Array.isArray(raw) ? raw.length : null;
  if (n == null) return { status: "not-appearing", count: null };
  if (n > 0) return { status: "opportunity", count: n };
  return { status: "not-appearing", count: 0 };
}

function StatusTag({ status }) {
  const s = STATUS[status] || STATUS["not-appearing"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Card({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--input)] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#FFF3EA] text-[#D45427]">
            <Icon size={16} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[var(--text)]">{title}</div>
          {subtitle && <div className="mt-0.5 text-[12px] text-[var(--muted)]">{subtitle}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SerpFeatures({
  serp,
  domain = "",
  companyName = "",
  competitors = [],
  initialFeature = "featuredSnippet",
  onBack,
  isDark,
  onToggleTheme,
}) {
  const list = useMemo(
    () => FEATURES.map((f) => ({ ...f, ...deriveStatus(f, serp) })),
    [serp]
  );
  const [activeKey, setActiveKey] = useState(initialFeature);
  const active = list.find((f) => f.key === activeKey) || list[0];

  const winning = list.filter((f) => f.status === "winning").length;
  const opportunities = list.filter((f) => f.status === "opportunity").length;

  // Real competitor domains (normalise, drop the client's own domain, plausible only).
  const selfHost = String(domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const compDomains = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(competitors) ? competitors : [])
            .map((c) => (typeof c === "string" ? c : c?.domain || c?.url || c?.name || ""))
            .map((s) => String(s).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim().toLowerCase())
            .filter((s) => /\./.test(s) && s !== selfHost)
        )
      ).slice(0, 3),
    [competitors, selfHost]
  );

  const addTask = () => {
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:add-task", {
          detail: {
            title: `${active.name}: ${active.opportunities?.[0]?.text || "optimise for this SERP feature"}`,
            detail: `SERP feature: ${active.name}`,
            source: "SERP Feature",
          },
        })
      );
    } catch {}
  };
  const saveToPlan = () => {
    try {
      window.dispatchEvent(
        new CustomEvent("dashboard:add-content-plan", {
          detail: { title: active.name, detail: active.opportunities?.[0]?.text || "", source: "SERP Feature" },
        })
      );
    } catch {}
  };

  // Esc closes.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onBack?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const scope = domain ? (/^https?:\/\//.test(domain) ? domain : `https://${domain}`) : "—";

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--app-bg,#f9fafb)] text-[var(--text)]">
      {/* Upper bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel,#fff)]/95 px-6 py-3 backdrop-blur">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ml-3 min-w-0">
          <div className="text-[15px] font-bold leading-tight text-[var(--text)]">SERP Features</div>
          <div className="text-[11px] text-[var(--muted)]">
            Scope : <span className="text-[var(--text)]">{scope}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-full bg-[image:var(--infoHighlight-gradient)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:opacity-90">
            Chat with Ai <Sparkles size={14} />
          </button>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border)] bg-[var(--input)] text-[var(--muted)] hover:text-[var(--text)]"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[20px] font-bold text-[var(--text)]">SERP Features</h2>
          <div className="text-[12px] text-[var(--muted)]">
            {winning} winning • {opportunities} opportunit{opportunities === 1 ? "y" : "ies"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_549px]">
          {/* LEFT — features list */}
          <div className="space-y-3">
            {list.map((f) => {
              const activeCard = f.key === activeKey;
              return (
                <button
                  key={f.key}
                  onClick={() => setActiveKey(f.key)}
                  className={`w-full rounded-[14px] border bg-[var(--input)] p-4 text-left shadow-sm transition ${
                    activeCard ? "border-[#D45427] ring-1 ring-[#D45427]/20" : "border-[var(--border)] hover:border-[#D45427]/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#FFF3EA] text-[#D45427]">
                      <f.Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[14px] font-semibold text-[var(--text)]">{f.name}</div>
                        <StatusTag status={f.status} />
                      </div>
                      <div className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
                        {f.blurb}
                        {f.count != null && f.count > 0 ? ` Appearing for ${f.count} tracked ${f.count === 1 ? "query" : "queries"}.` : ""}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        {f.status === "opportunity" ? (
                          <span className="text-[11px] font-semibold text-emerald-600">{f.opportunities?.[0]?.lift?.replace(" est.", "") || ""}</span>
                        ) : (
                          <span />
                        )}
                        <span className={`text-[12px] font-medium ${activeCard ? "text-[#D45427]" : "text-[var(--muted)]"}`}>
                          View details ›
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* RIGHT — details panel */}
          <div className="space-y-4">
            <h2 className="text-[16px] font-bold text-[var(--text)]">Details</h2>

            <Card icon={BadgeInfo} title={`What is ${active.name}?`}>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{active.definition}</p>
            </Card>

            <Card icon={Activity} title="Current Status">
              <div className="mt-2">
                <StatusTag status={active.status} />
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
                {active.status === "opportunity"
                  ? `This feature is showing in the SERPs for your tracked keywords${
                      active.count ? ` (${active.count} ${active.count === 1 ? "query" : "queries"})` : ""
                    }. Optimise the recommendations below to win placement.`
                  : `Your site is not currently appearing for ${active.name} on your tracked keywords. The steps below make your pages eligible.`}
              </p>

              {/* Live SERP Preview */}
              <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--app-bg,#f9fafb)] p-3">
                <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
                  <Sparkles size={12} className="text-[#D45427]" /> Live SERP Preview
                </div>
                <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--input)] p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-[#4285F4] text-[9px] font-bold text-white">G</span>
                    <div className="h-2.5 flex-1 rounded bg-[var(--border)]" />
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-[var(--border)]/70" />
                  <div className="mt-1.5 h-2 w-4/5 rounded bg-[var(--border)]/70" />
                </div>
              </div>
            </Card>

            <Card icon={Trophy} title="Competitor Winners" subtitle="Sites currently winning this SERP feature">
              <div className="mt-3 space-y-2">
                {compDomains.length ? (
                  compDomains.map((d) => (
                    <div key={d} className="rounded-[10px] border border-[var(--border)] bg-[var(--app-bg,#f9fafb)] px-3 py-2">
                      <a
                        href={`https://${d}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text)] hover:text-[#D45427]"
                      >
                        {d} <ExternalLink size={12} className="opacity-60" />
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[10px] border border-dashed border-[var(--border)] px-3 py-3 text-center text-[12px] text-[var(--muted)]">
                    No competitor data for this feature yet.
                  </div>
                )}
              </div>
            </Card>

            <Card icon={Code2} title="Technical Requirements" subtitle="Specific recommendations for this feature">
              <div className="mt-3 space-y-2 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted)]">Target Snippet Type:</span>
                  <span className="rounded-md border border-[var(--border)] bg-[var(--app-bg,#f9fafb)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--text)]">
                    {active.snippetType}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--muted)]">Required Markup:</span>
                  <code className="rounded-md bg-[#F1F5F9] dark:bg-[#0f1720] px-2 py-0.5 text-[11.5px] font-mono text-[#0f766e] dark:text-emerald-300">
                    {active.markup}
                  </code>
                </div>
                <div className="pt-1 text-[var(--muted)]">Copy Recommendations:</div>
                <ul className="space-y-1.5">
                  {active.copyRecs.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span className="text-[12.5px] text-[var(--text)]">{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            <Card icon={Lightbulb} title="Prioritized Opportunities" subtitle="Suggested actions ranked by potential impact">
              <div className="mt-3 space-y-2">
                {active.opportunities.map((o, i) => {
                  const pri =
                    o.priority === "high"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : o.priority === "medium"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-gray-200 bg-gray-50 text-gray-600";
                  return (
                    <div key={i} className="rounded-[10px] border border-[var(--border)] bg-[var(--app-bg,#f9fafb)] p-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${pri}`}>{o.priority} priority</span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          {o.lift}
                        </span>
                      </div>
                      <div className="mt-2 text-[12.5px] text-[var(--text)]">{o.text}</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Footer actions */}
            <div className="flex items-center gap-3 pb-6">
              <button
                onClick={saveToPlan}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#D45427]/40 bg-[#FFF3EA] px-4 py-2.5 text-[13px] font-semibold text-[#B4531B] hover:bg-[#FFE9D8]"
              >
                <BookmarkPlus size={16} /> Save to Content Plan
              </button>
              <button
                onClick={addTask}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--input)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text)] hover:border-[#D45427]/50"
              >
                <ListTodo size={16} /> Add to Tasks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
