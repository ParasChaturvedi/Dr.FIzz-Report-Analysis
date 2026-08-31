// src/app/components/report/deck/DeckAutoFit.js
// ─────────────────────────────────────────────────────────────────────────────
// Fixed 1280×720 slides + variable real-data text = some slides' content is
// taller than the slide. Rather than let it overlap the title/foot (or clip),
// we measure each slide's content and scale it down just enough to fit. Keeps
// the clean 16:9 look, guarantees zero overlap on every slide, and the inline
// transform is captured by the PDF export (DOM snapshot) too.
//
// Robustness: a plain useEffect that measures once races the browser's font +
// layout settle (the content is short when it first runs, so it scales nothing,
// then grows). We fit on mount AND observe every content box with a
// ResizeObserver, so any later height change (fonts.ready, reflow, data swap)
// re-triggers the fit at exactly the right moment.
// ─────────────────────────────────────────────────────────────────────────────
"use client";
import { useEffect } from "react";

export default function DeckAutoFit() {
  useEffect(() => {
    const READABLE = 0.7;   // below this, scaling makes text too small — grow the slide instead.
    // Kept moderately low so a slightly-tall slide SCALES to fit the fixed 16:9 page (complete,
    // a touch smaller) rather than growing past 720 and getting clipped in the fixed-height PDF export.
    const fitOne = (content) => {
      const inner = content.querySelector(":scope > .content-fit") || content.querySelector(".content-fit");
      if (!inner) return;
      const slide = content.closest(".slide");
      inner.style.transform = "";
      inner.style.width = "";
      // "avail" = the fixed-720 content area (720 - vertical padding 108 - head - foot - 8). We derive
      // it from head/foot heights (which do NOT change when a slide is grown) instead of
      // content.clientHeight, so the grow/scale decision can't oscillate into an infinite loop.
      const head = slide && slide.querySelector(":scope > .head");
      const foot = slide && slide.querySelector(":scope > .foot");
      const avail = 720 - 108 - (head ? head.offsetHeight : 0) - (foot ? foot.offsetHeight : 0) - 8;
      const needed = inner.scrollHeight;     // natural height of the content at full width
      if (!slide || avail <= 0 || needed <= avail + 2) {
        if (slide) { slide.style.height = ""; slide.style.overflow = ""; }
        return;   // fits the fixed 16:9 slide — leave it alone
      }
      const s = avail / needed;
      if (s >= READABLE) {
        // Mildly tall -> keep the fixed 16:9 slide. WIDEN by 1/s so the content spans the FULL width
        // after scaling (no more shrinking into a half-width corner). Widening only reflows text
        // SHORTER, so scaling by s (computed for the taller layout) can never overflow the foot.
        slide.style.height = ""; slide.style.overflow = "";
        inner.style.width = `${(100 / s).toFixed(1)}%`;
        inner.style.transform = `scale(${s})`;
        inner.style.transformOrigin = "top left";
      } else {
        // WAY too tall to stay readable at 720px (e.g. a 14-row action board) -> GROW the slide so
        // every row renders full-size instead of cramming it tiny and overlapping the footer.
        // Adjustable height per the design ask; the foot flows to the new bottom, no overlap.
        slide.style.height = "auto";
        slide.style.overflow = "visible";
      }
    };
    const fitAll = () => document.querySelectorAll(".df-deck .content").forEach(fitOne);

    // Call fitAll SYNCHRONOUSLY — never gate it behind requestAnimationFrame:
    // rAF is throttled/suspended when the page isn't visibly painting (headless
    // render, background tab, PDF DOM-snapshot), which would silently skip the fit.
    const run = () => fitAll();
    run();

    // Re-fit whenever any content box OR its inner children change size (fonts,
    // reflow, async data). This is what actually catches the post-load growth.
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(run);
      document.querySelectorAll(".df-deck .content, .df-deck .content-fit").forEach((el) => ro.observe(el));
    }
    const timers = [setTimeout(run, 100), setTimeout(run, 400), setTimeout(run, 1000)];
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(run).catch(() => {});
    }
    window.addEventListener("resize", run);

    return () => {
      window.removeEventListener("resize", run);
      timers.forEach(clearTimeout);
      if (ro) ro.disconnect();
    };
  }, []);
  return null;
}
