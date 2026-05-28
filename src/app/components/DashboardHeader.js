"use client";

import React, { useEffect, useState } from "react";
import { Plus, Sparkles, HelpCircle } from "lucide-react";

export default function DashboardHeader() {
  const [domain, setDomain] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("websiteData"));
      if (stored?.site) setDomain(stored.site.replace(/^https?:\/\//, ""));
    } catch (e) {
      console.error("Failed to load site", e);
    }
  }, []);

  return (
    <header
      className="
        flex flex-col 
        gap-3 
        sm:flex-row sm:items-center sm:justify-between
        mb-4 sm:mb-6
      "
    >
      {/* LEFT SIDE */}
      <div>
        <p className="text-[11px] sm:text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
          Good Morning,{" "}
          <span className="font-semibold text-[#020617] dark:text-white">Sam!</span>
        </p>

        <div className="mt-0.5 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-4">
          <h1 className="text-[22px] sm:text-[24px] md:text-[26px] font-extrabold leading-tight text-[#020617] dark:text-white">
            Dashboard
          </h1>

          {/* Scope */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-[12px]">
            <span className="font-medium text-[#6B7280]">Scope :</span>

            <span className="font-semibold text-[#EA580C] break-all sm:break-normal">
              {domain ? `https://${domain}` : "https://yourcompany.com"}
            </span>

            <button
              type="button"
              aria-label="Help"
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
        {/* "Last 30 days" */}
        <button
          type="button"
          className="
            inline-flex items-center justify-center gap-2
            rounded-full border border-[#F97316] bg-[#FFF7ED] dark:bg-[#F97316]/10
            px-3 py-2 sm:px-4 sm:py-2
            min-h-[36px] sm:min-h-[40px]
            text-[11px] sm:text-[13px] font-semibold text-[#C05621] dark:text-[#FB923C]
            hover:bg-[#FFE7D1] dark:hover:bg-[#F97316]/20 transition
            whitespace-nowrap
          "
        >
          <Plus size={14} />
          <span>Last 30 days</span>
        </button>

        {/* Chat with Ai */}
        <button
          type="button"
          className="
            inline-flex items-center justify-center gap-2
            rounded-full px-3 py-2 sm:px-4 sm:py-2
            min-h-[36px] sm:min-h-[40px]
            text-[11px] sm:text-[13px] font-semibold text-white
            shadow-sm bg-[image:var(--infoHighlight-gradient)]
            hover:opacity-90 transition
            whitespace-nowrap
          "
        >
          <span>Chat with Ai</span>
          <Sparkles size={16} />
        </button>

        {/*
          RESERVED SPACE FOR YOUR EXISTING THEME TOGGLE
          Hidden on very small screens to avoid crowding; shows from `sm` upwards.
        */}
        <div className="hidden sm:block sm:w-[68px] md:w-[72px]" />
      </div>
    </header>
  );
}
