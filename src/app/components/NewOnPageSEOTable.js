"use client";

import { useMemo, useState } from "react";
import { Wifi, FileText, Link2, ChevronRight, ChevronUp, ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";

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
function ViewAllPill({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold bg-gradient-to-b from-[#FFF6EB] to-[#FFEAD5] dark:from-[#78350f]/30 dark:to-[#92400e]/30 border border-[#FDBA74] dark:border-[#d97706]/50 text-[#F97316] dark:text-[#fb923c] hover:opacity-80 transition-opacity"
    >
      {children}
    </button>
  );
}

/** Main Table */
export default function NewOnPageSEOTable({ rows, progress = 1, onOpenContentEditor, onViewAll }) {
  // Real rows only — NO demo/placeholder fallback. Empty → show an empty state.
  const data = useMemo(
    () => (Array.isArray(rows) && rows.length ? rows.slice(0, 7) : []),
    [rows]
  );

  // ── Sorting (flow §4: "Column Headers → Sorts the entire list") ──────────────
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const sortedData = useMemo(() => {
    if (!sort.key) return data;
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r) => {
      switch (sort.key) {
        case "keyword": return String(r.keyword || "").toLowerCase();
        case "type": return String(r.type || "").toLowerCase();
        case "volume": return Number(r.volume) || 0;
        case "difficulty": return Number(r.difficulty) || 0;
        default: return 0;
      }
    };
    return [...data].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [data, sort]);

  // Which "Generate" pills the user has clicked — keyed by keyword so state survives sorting.
  const [activeMap, setActiveMap] = useState({});

  // Real action: mark the pill active and open the Content Editor pre-loaded with this
  // keyword — same flow the "Start" buttons on the opportunity cards use.
  const handleGenerate = (kind, row) => {
    const kw = row?.keyword || "Untitled";
    setActiveMap((prev) => ({ ...prev, [kw]: { ...prev[kw], [kind]: true } }));
    const payload = {
      title: kw,
      keyword: row?.keyword || "",
      type: kind, // "blog" | "page"
    };
    try {
      window.dispatchEvent(new CustomEvent("content-editor:open", { detail: payload }));
    } catch {}
    onOpenContentEditor?.(payload);
  };

  // Small clickable, sortable header cell.
  const SortHeader = ({ label, colKey, className = "" }) => (
    <button
      type="button"
      onClick={() => toggleSort(colKey)}
      className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${sort.key === colKey ? "text-[var(--text)]" : ""} ${className}`}
      aria-sort={sort.key === colKey ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort.key === colKey
        ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
        : <span className="opacity-40">↑↓</span>}
    </button>
  );

  return (
    <section aria-labelledby="new-on-page-seo-opportunity">
      <h2 className="text-[20px] font-semibold leading-[24px] text-[var(--text)] mb-2 ml-1">
        New on page SEO opportunity
      </h2>
      <p
        className="ml-1 mb-4 text-[16px] font-normal text-[var(--muted)]"
        style={{ letterSpacing: "-0.02em" }}
      >
        While it&apos;s highly recommended to follow the AI&apos;s suggested plan for optimal results,
        feel free to generate content based on your personal choice.
      </p>

      <div className="overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        {/* Header — hidden on mobile, shown from md */}
        <div className="hidden md:grid grid-cols-[1.4fr_1.3fr_1.1fr_1.3fr_1.9fr_1fr_1fr_1.4fr] px-4 py-3 text-[12px] font-semibold text-[var(--muted)] text-center bg-[var(--card)]">
          <div className="text-left"><SortHeader label="Keywords" colKey="keyword" /></div>
          <div className="flex justify-center"><SortHeader label="Type" colKey="type" /></div>
          <div className="flex justify-center"><SortHeader label="Search Volume" colKey="volume" /></div>
          <div className="flex justify-center"><SortHeader label="SEO Difficulty" colKey="difficulty" /></div>
          <div>Suggested topic</div>
          <div>Blog</div>
          <div>Page</div>
          <div>Preference</div>
        </div>

        {/* Rows */}
        <div className="px-2 md:px-3 lg:px-4 bg-[var(--card)]">
          <ul className="divide-y divide-[var(--border)] bg-[var(--border)]/20">
            {sortedData.length === 0 && (
              <li className="px-4 py-12 text-center text-[13px] text-[var(--muted)]">
                No on-page keyword opportunities to show yet — run a scan or connect Search Console to see real opportunities here.
              </li>
            )}
            {sortedData.map((row, i) => (
              <li
                key={`${row.keyword}-${i}`}
                className="grid grid-cols-1 md:grid-cols-[1.4fr_1.3fr_1.1fr_1.3fr_1.9fr_1fr_1fr_1.4fr] items-center gap-3 px-4 py-3 text-[13px] text-center"
              >
                {/* Mobile label — only shown on small screens */}
                <div className="md:hidden text-[11px] font-semibold text-[var(--muted)] text-left -mb-1">Keyword</div>

                {/* KEYWORD CELL */}
                <div className="flex items-start gap-2 justify-start text-[var(--text)]">
                  <span className="mt-[2px] inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--card)] text-[var(--muted)]">
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
                  <DemoPill active={!!activeMap[row.keyword]?.blog} onToggle={() => handleGenerate("blog", row)}>
                    Generate
                  </DemoPill>
                </div>
                <div className="flex items-center gap-2 md:justify-center">
                  <span className="md:hidden text-[11px] font-semibold text-[var(--muted)]">Page:</span>
                  <DemoPill active={!!activeMap[row.keyword]?.page} onToggle={() => handleGenerate("page", row)}>
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
        <div className="flex justify-end border-t border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <ViewAllPill onClick={() => onViewAll?.()}>
            View all page issue <ChevronRight size={14} />
          </ViewAllPill>
        </div>
      </div>
    </section>
  );
}
