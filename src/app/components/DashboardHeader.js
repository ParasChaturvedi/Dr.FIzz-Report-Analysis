"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sparkles, HelpCircle, Calendar, ChevronDown, Check } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// Time windows for the "Last 30 Days" selector (flow §1 — updates all live metrics).
const PERIODS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function DashboardHeader({ onChatWithAi, aiLoading = false, canChat = true, periodDays = 30, onPeriodChange } = {}) {
  const [domain, setDomain] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef(null);
  // Company/business name the user entered during onboarding (localStorage "businessData").
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("websiteData"));
      if (stored?.site) setDomain(stored.site.replace(/^https?:\/\//, ""));
    } catch (e) {
      console.error("Failed to load site", e);
    }
    try {
      const biz = JSON.parse(localStorage.getItem("businessData") || "{}");
      if (biz?.businessName) setCompanyName(String(biz.businessName).trim());
    } catch {}
  }, []);

  // Close the period dropdown on outside click / Escape.
  useEffect(() => {
    if (!periodOpen) return;
    const onDown = (e) => { if (periodRef.current && !periodRef.current.contains(e.target)) setPeriodOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setPeriodOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [periodOpen]);

  const currentPeriodLabel = PERIODS.find((p) => p.days === periodDays)?.label || `Last ${periodDays} days`;

  return (
    <header
      className="
        sticky top-0 z-30
        bg-[var(--card)]
        -mx-4 sm:-mx-6 lg:-mx-8
        px-4 sm:px-6 lg:px-8
        pt-3 pb-3
        flex flex-col
        gap-3
        sm:flex-row sm:items-center sm:justify-between
        mb-4 sm:mb-6
      "
    >
      {/* LEFT SIDE */}
      <div>
        <p className="text-[11px] sm:text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
          {greetingForNow()}{companyName ? "," : ""}{" "}
          {companyName && <span className="font-semibold text-[#020617] dark:text-white">{companyName}!</span>}
        </p>

        <div className="mt-0.5 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-[22px] sm:text-[24px] md:text-[26px] font-extrabold leading-tight text-[#020617] dark:text-white">
            Dashboard
          </h1>

          {/* Scope */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-[12px]">
            <span className="font-medium text-[#6B7280]">Scope :</span>

            <span className="font-semibold text-[#EA580C] break-all sm:break-normal">
              {domain ? `https://${domain}` : "—"}
            </span>

            <button
              type="button"
              id="sidebar-info-btn"
              aria-label="Project info"
              title="View project info (website, business, keywords, competitors)"
              onClick={() => { try { window.dispatchEvent(new Event("app:toggle-info")); } catch {} }}
              className="
                inline-flex h-7 w-7 items-center justify-center
                rounded-full border border-[#E5E7EB] dark:border-[#374151]
                text-[#9CA3AF] bg-white dark:bg-[#303030]
                flex-shrink-0 hover:bg-gray-50 dark:hover:bg-[#404040]
                transition-colors
              "
            >
              <HelpCircle size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div
        className="
          flex flex-wrap
          items-stretch
          justify-start sm:justify-end
          gap-2 sm:gap-3
          mt-2 sm:mt-0
          relative
        "
      >
        {/* Time-window selector (flow §1: updates all live metrics for the period) */}
        <div className="relative" ref={periodRef}>
          <button
            type="button"
            onClick={() => setPeriodOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={periodOpen}
            className="
              inline-flex items-center justify-center gap-2
              rounded-full border border-[#CA5223] bg-transparent
              px-3 py-2 sm:px-4 sm:py-2
              min-h-[36px] sm:min-h-[40px]
              text-[11px] sm:text-[13px] font-semibold text-[#D45427]
              hover:bg-[#CA5223]/5 transition
              whitespace-nowrap
            "
          >
            <span>{currentPeriodLabel}</span>
          </button>

          {periodOpen && (
            <ul
              role="listbox"
              className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-[#E5E7EB] dark:border-[#374151] bg-white dark:bg-[#303030] shadow-lg"
            >
              {PERIODS.map((p) => (
                <li key={p.days}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={periodDays === p.days}
                    onClick={() => { onPeriodChange?.(p.days); setPeriodOpen(false); }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-[12px] sm:text-[13px] hover:bg-[#FFF7ED] dark:hover:bg-[#F97316]/10 transition-colors ${
                      periodDays === p.days
                        ? "font-semibold text-[#C05621] dark:text-[#FB923C]"
                        : "text-[#374151] dark:text-[#D1D5DB]"
                    }`}
                  >
                    {p.label}
                    {periodDays === p.days && <Check size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Chat with Ai */}
        <button
          type="button"
          onClick={() => onChatWithAi?.()}
          disabled={aiLoading || !canChat}
          aria-busy={aiLoading}
          title={canChat ? "Get AI help with your data & tasks" : "Analysing your site… available once data loads"}
          className="
            inline-flex items-center justify-center gap-2
            rounded-full px-3 py-2 sm:px-4 sm:py-2
            min-h-[36px] sm:min-h-[40px]
            text-[11px] sm:text-[13px] font-semibold text-white
            shadow-sm bg-[image:var(--infoHighlight-gradient)]
            hover:opacity-90 transition
            whitespace-nowrap
            disabled:opacity-60 disabled:cursor-not-allowed
          "
        >
          <span>{aiLoading ? "Thinking…" : "Chat with Ai"}</span>
          <Sparkles size={16} className={aiLoading ? "animate-pulse" : ""} />
        </button>

        {/* Theme toggle — inside the header (Figma Upper bar) */}
        <div className="flex items-center">
          <ThemeToggle inline />
        </div>
      </div>
    </header>
  );
}
