"use client";

import { useTheme } from "./ThemeContext";
import { Moon, Sun } from "lucide-react";

/**
 * Theme toggle — matches Figma "Light Dark Toggle" (node 1:23107):
 * orange gradient pill (rgba(212,84,39,.5) → rgba(245,158,11,.5)), rounded,
 * moon (left) + sun (right) on the track, white knob showing the active icon.
 *
 * `inline` → sits inside a flex row (e.g. the dashboard header).
 * default → fixed floating control (used on non-dashboard views).
 */
export default function ThemeToggle({ inline = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const W = 54;
  const H = 28;
  const KNOB = 22;
  const PAD = 3;
  const translateX = W - (KNOB + PAD * 2); // travel distance

  const gradient =
    "linear-gradient(118deg, rgba(212,84,39,0.5) 11%, rgba(245,158,11,0.5) 88%)";

  return (
    <button
      type="button"
      aria-label="Toggle dark/light mode"
      aria-pressed={isDark}
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        inline
          ? "relative shrink-0"
          : "fixed z-50 right-2 sm:right-4 md:right-6 top-3 sm:top-10 md:top-12 lg:top-5"
      }
      style={{ width: W, height: H }}
    >
      <div
        className="relative w-full h-full rounded-full overflow-hidden"
        style={{ backgroundImage: gradient }}
      >
        {/* Track icons */}
        <Moon
          size={14}
          strokeWidth={2}
          className="absolute left-[6px] top-1/2 -translate-y-1/2"
          color={isDark ? "rgba(255,255,255,0.55)" : "#FFFFFF"}
        />
        <Sun
          size={14}
          strokeWidth={2}
          className="absolute right-[6px] top-1/2 -translate-y-1/2"
          color={isDark ? "#FFFFFF" : "rgba(255,255,255,0.55)"}
        />

        {/* White knob with the active-mode icon */}
        <div
          className="absolute rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] flex items-center justify-center transition-transform duration-300 ease-out"
          style={{
            width: KNOB,
            height: KNOB,
            top: PAD,
            left: PAD,
            transform: `translateX(${isDark ? translateX : 0}px)`,
          }}
        >
          {isDark ? (
            <Moon size={13} strokeWidth={2} color="#D45427" />
          ) : (
            <Sun size={13} strokeWidth={2} color="#D45427" />
          )}
        </div>
      </div>
    </button>
  );
}
