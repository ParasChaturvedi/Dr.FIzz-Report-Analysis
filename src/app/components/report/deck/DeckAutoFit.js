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
    const fitOne = (content) => {
      const inner = content.querySelector(":scope > .content-fit") || content.querySelector(".content-fit");
      if (!inner) return;
      inner.style.transform = "";
      const avail = content.clientHeight;   // room between head and foot
      const needed = inner.scrollHeight;     // natural height of the content's children
      if (avail > 0 && needed > avail + 2) {
        inner.style.transform = `scale(${Math.max(0.5, avail / needed)})`;
        inner.style.transformOrigin = "top center";
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
