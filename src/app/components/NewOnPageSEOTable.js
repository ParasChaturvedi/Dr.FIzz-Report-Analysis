"use client";

import { useEffect, useMemo, useState } from "react";
import { Wifi, FileText, Link2, ChevronRight, ThumbsUp, ThumbsDown } from "lucide-react";

/** Small thumbs up/down animation */
function LikeDislike() {
  const [choice, setChoice] = useState(null);
  const [bump, setBump] = useState(null);

  const handleClick = (dir) => {
    setChoice((prev) => (prev === dir ? null : dir));
    setBump(dir);
    setTimeout(() => setBump(null), 150);
  };

  const base = "cursor-pointer transition-transform duration-150";
  return (
    <span className="flex items-center gap-2">
      <ThumbsUp
        size={16}
        strokeWidth={2}
        fill="none"
        className={`${base} ${bump === "up" ? "scale-110" : ""} ${choice === "up" ? "text-[#22C55E]" : "text-[var(--muted)]"}`}
        onClick={() => handleClick("up")}
      />
      <ThumbsDown
        size={16}
        strokeWidth={2}
        fill="none"
        className={`${base} ${bump === "down" ? "scale-110" : ""} ${choice === "down" ? "text-[#EF4444]" : "text-[var(--muted)]"}`}
        onClick={() => handleClick("down")}
      />
    </span>
  );
}

/** Difficulty bar with thresholds: 0–50 red, 51–80 orange, 81–100 green */
function DifficultyBar({ value, progress = 1 }) {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const raw = clamp(Number(value) || 0, 0, 100);
  const pct = clamp(raw * clamp(progress, 0, 1), 0, 100);
  const color = raw <= 50 ? "#EF4444" : raw <= 80 ? "#F59E0B" : "#10B981";

  return (
    <div
      className="relative h-2 w-28 overflow-hidden rounded-full bg-[var(--border)]"
    >
      <div
        className="h-2 rounded-full"
        style={{
          width: `${pct}%`,
          backgroundColor: color,
          transition: "width 120ms linear",
        }}
      />
    </div>
  );
}

/** Toggleable Generate button — class-based so dark mode works */
function DemoPill({ active, onToggle, children }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
        active
          ? "bg-gradient-to-b from-[#FFF6EB] to-[#FFEAD5] dark:from-[#78350f]/30 dark:to-[#92400e]/30 border border-[#FDBA74] dark:border-[#d97706]/50 text-[#F97316] dark:text-[#fb923c]"
          : "bg-gradient-to-b from-[var(--app-bg)] to-[var(--border)]/60 border border-[var(--border)] text-[var(--muted)]"
      }`}
      onClick={onToggle}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/** View-all pill button (class-based for dark mode) */
function ViewAllPill({ children }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold bg-gradient-to-b from-[#FFF6EB] to-[#FFEAD5] dark:from-[#78350f]/30 dark:to-[#92400e]/30 border border-[#FDBA74] dark:border-[#d97706]/50 text-[#F97316] dark:text-[#fb923c] hover:opacity-80 transition-opacity">
      {children}
    </button>
  );
}

/** Main Table */
export default function NewOnPageSEOTable({ rows, progress = 1 }) {
  // Stable fallback
  const fallback = useMemo(
    () => [
      { keyword: "How to fix slow Wi-Fi", type: "Informational", volume: 7032, difficulty: 98, suggested: "The information shown here..." },
      { keyword: "Best laptop under $1000", type: "Transactional", volume: 5500, difficulty: 72, suggested: "Comparison of popular laptops..." },
      { keyword: "SEO tools 2025", type: "Informational", volume: 12000, difficulty: 45, suggested: "List of free SEO tools..." },
      { keyword: "Fix Chrome crashes", type: "Informational", volume: 8900, difficulty: 60, suggested: "Steps to resolve frequent crashes..." },
      { keyword: "Website not indexing", type: "Transactional", volume: 3200, difficulty: 30, suggested: "Indexing troubleshooting..." },
    ],
    []
  );

  // ✅ Memoize data so the reference is stable between renders
  const data = useMemo(() => {
    const base = Array.isArray(rows) && rows.length ? rows : fallback;
    return base.slice(0, 7);
  }, [rows, fallback]);

  // Active map state
  const [activeMap, setActiveMap] = useState(() =>
    Array.from({ length: data.length }, () => ({
      blog: Math.random() < 0.45,
      page: Math.random() < 0.45,
    }))
  );

  // ✅ Only re-randomize when the LENGTH changes (prevents infinite loop)
  const dataLen = data.length;
  useEffect(() => {
    setActiveMap((prev) => {
      const next = Array.from({ length: dataLen }, (_, i) =>
        prev[i] ?? { blog: Math.random() < 0.45, page: Math.random() < 0.45 }
      );
      return next;
    });
  }, [dataLen]);

  // Toggle both ways
  const toggle = (index, key) =>
    setActiveMap((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: !next[index]?.[key] };
      return next;
    });

  return (
    <section aria-labelledby="new-on-page-seo-opportunity">
      <h2 className="text-[20px] font-semibold leading-[24px] text-gray-900 mb-2 ml-1">
        New on page SEO opportunity
      </h2>
      <p
        className="ml-1 mb-4 text-[16px] font-normal text-gray-600"
        style={{ letterSpacing: "-0.02em" }}
      >
        While it&apos;s highly recommended to follow the AI&apos;s suggested plan for optimal results,
        feel free to generate content based on your personal choice.
      </p>

      <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--input)] shadow-sm">
        {/* Header — hidden on mobile, shown from md */}
        <div className="hidden md:grid grid-cols-[1.4fr_1.3fr_1.1fr_1.3fr_1.9fr_1fr_1fr_1.4fr] px-4 py-3 text-[12px] font-semibold text-[var(--muted)] text-center bg-[var(--input)]">
          <div className="text-left">Keywords</div>
          <div>Type <span className="opacity-50">↑↓</span></div>
          <div>Search Volume</div>
          <div>SEO Difficulty</div>
          <div>Suggested topic</div>
          <div>Blog</div>
          <div>Page</div>
          <div>Preference</div>
        </div>

        {/* Rows */}
        <div className="px-2 md:px-3 lg:px-4 bg-white">
          <ul className="divide-y divide-[var(--border)] bg-[var(--border)]/20">
            {data.map((row, i) => (
              <li
                key={i}
                className="grid grid-cols-1 md:grid-cols-[1.4fr_1.3fr_1.1fr_1.3fr_1.9fr_1fr_1fr_1.4fr] items-center gap-3 px-4 py-3 text-[13px] text-center"
              >
                {/* Mobile label — only shown on small screens */}
                <div className="md:hidden text-[11px] font-semibold text-[var(--muted)] text-left -mb-1">Keyword</div>

                {/* KEYWORD CELL */}
                <div className="flex items-start gap-2 justify-start text-[var(--text)]">
                  <span className="mt-[2px] inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--input)] text-[var(--muted)]">
                    <Wifi size={14} />
                  </span>
                  <span className="min-w-0 whitespace-normal break-words leading-snug text-left">
                    {row.keyword}
                  </span>
                </div>

                {/* Mobile: inline label row for Type + Volume */}
                <div className="md:hidden grid grid-cols-2 gap-2 text-left text-[11px] text-[var(--muted)] font-semibold">
                  <span>Type</span>
                  <span>Search Volume</span>
                </div>

                <div className="md:text-center text-left">
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] seo-badge-light">
                    {row.type === "Informational" ? <FileText size={12} /> : <Link2 size={12} />} {row.type}
                  </span>
                </div>

                <div className="tabular-nums text-[var(--text)] text-left md:text-center">
                  {Number(row.volume).toLocaleString()}
                </div>

                {/* Mobile: inline label for difficulty + suggestion */}
                <div className="md:hidden grid grid-cols-2 gap-2 text-left text-[11px] text-[var(--muted)] font-semibold">
                  <span>SEO Difficulty</span>
                  <span>Suggested topic</span>
                </div>

                <div className="flex items-center gap-2 justify-start text-[var(--text)]">
                  <span className="tabular-nums">{row.difficulty}%</span>
                  <DifficultyBar value={row.difficulty} progress={progress} />
                </div>

                <div className="text-left md:text-center text-[var(--text)] whitespace-normal break-words leading-snug min-w-0">
                  {row.suggested ?? "—"}
                </div>

                {/* Blog / Page buttons */}
                <div className="flex items-center gap-2 md:justify-center">
                  <span className="md:hidden text-[11px] font-semibold text-[var(--muted)]">Blog:</span>
                  <DemoPill active={!!activeMap[i]?.blog} onToggle={() => toggle(i, "blog")}>
                    Generate
                  </DemoPill>
                </div>
                <div className="flex items-center gap-2 md:justify-center">
                  <span className="md:hidden text-[11px] font-semibold text-[var(--muted)]">Page:</span>
                  <DemoPill active={!!activeMap[i]?.page} onToggle={() => toggle(i, "page")}>
                    Generate
                  </DemoPill>
                </div>

                {/* Like/dislike */}
                <div className="flex items-center justify-start md:justify-center gap-3">
                  <LikeDislike />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--border)] bg-[var(--input)] px-4 py-3">
          <ViewAllPill>
            View all page issue <ChevronRight size={14} />
          </ViewAllPill>
        </div>
      </div>
    </section>
  );
}
