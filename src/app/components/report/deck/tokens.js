// src/app/components/report/deck/tokens.js
// ─────────────────────────────────────────────────────────────────────────────
// Deck design tokens (mirror of the reference deck :root) for the few places that
// need an inline value — bar widths, dynamic accent colours — plus <DeckStyle/>,
// which injects the full verbatim deck CSS (fonts + component classes) ONCE at the
// report root. Everything else is styled by className, so components stay 1:1 with
// the reference deck markup.
// ─────────────────────────────────────────────────────────────────────────────
import { DECK_CSS } from "./deckCss";

export const C = {
  rust: "#C95322", rustDeep: "#A8401A", rustSoft: "#E07A4F",
  ink: "#15110E", inkSoft: "#4A443E", muted: "#8B847A", faint: "#B8B0A4",
  cream: "#FBF8F1", paper: "#FFFFFF", line: "#EAE3D7", lineSoft: "#F1ECE2",
  dark: "#171311", darkLine: "#352E27", good: "#3C7D5A", bad: "#B23B3B", pull: "#FBEDE5",
};

// Action / work-type accent classes (match .a-* in the deck CSS).
export const ACCENT = {
  content: "a-content", onpage: "a-onpage", forms: "a-forms",
  listicle: "a-listicle", pr: "a-pr", citation: "a-citation",
};
// Map a real plan "channel"/work-type onto a deck accent class.
export function accentFor(channel = "") {
  const k = String(channel || "").toLowerCase();
  if (/content|blog|article/.test(k)) return ACCENT.content;
  if (/on.?page|technical|page|meta|schema/.test(k)) return ACCENT.onpage;
  if (/lead|form|cta|convert/.test(k)) return ACCENT.forms;
  if (/listicle|directory|citation.?build|outreach/.test(k)) return ACCENT.listicle;
  if (/pr|press|authority|link|backlink/.test(k)) return ACCENT.pr;
  if (/local|gbp|gmb|map|review|nap/.test(k)) return ACCENT.citation;
  return ACCENT.content;
}

// Injects the deck's complete CSS (incl. embedded fonts) — render ONCE at the root.
export function DeckStyle() {
  return <style data-deck-style dangerouslySetInnerHTML={{ __html: DECK_CSS }} />;
}

// ── tiny formatting helpers (shared by slide builders) ──────────────────────
export const dash = (v) => (v === 0 ? "0" : v == null || v === "" || Number.isNaN(v) ? "—" : v);
export function fmtNum(n) {
  if (n == null || n === "" || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  if (Math.abs(x) >= 1_000_000) return (x / 1_000_000).toFixed(x % 1_000_000 ? 1 : 0) + "M";
  if (Math.abs(x) >= 1_000) return (x / 1_000).toFixed(x % 1_000 ? 1 : 0) + "K";
  return String(Math.round(x));
}
export const pctStr = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : `${Math.round(Number(v))}%`);
export function dateGB(d) {
  try {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch { return ""; }
}
// First sentence / clamp for narrative slots.
export function clamp(s, n = 280) {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t;
}
