// src/app/components/report/deck/deckA11y.js
// ─────────────────────────────────────────────────────────────────────────────
// WCAG AA accessibility overlay for the deck — the DoctorFizz DESIGN.md
// "-accessible" variants, adopted as an ADDITIVE override.
//
// It is injected AFTER the base DECK_CSS (see tokens.js → DeckStyle), so with equal
// selector specificity it wins the cascade and re-colours ONLY small INFORMATIONAL
// text on LIGHT surfaces to the deeper, AA-clearing tokens the spec defines.
//
// UI-ONLY: this changes NO content, data, layout, spacing, radius, or component
// structure — only the COLOUR of small labels, table headers, footers, a few tags,
// and the CTA/tag-new fill. Dark-surface rules are intentionally left alone (their
// selectors are more specific here, and light-on-dark text already passes AA).
//
// Source of truth: DESIGN.md → "Accessibility variants". Contrast ratios cited below
// are from that spec.
// ─────────────────────────────────────────────────────────────────────────────
export const DECK_A11Y_CSS = `
.df-deck{
  /* DESIGN.md tokens the base deck did not yet define */
  --muted-deep:#6B6459;    /* AA neutral for small mono labels — 5.85:1 on paper, 5.51:1 on cream */
  --warning:#9A6B12;
  --warning-deep:#6F4C00;  /* tag-hypothesis-accessible — 6.66:1 on straw */
  --success-deep:#256B45;  /* tag-low-accessible — 5.43:1 on mint */
}
/* table-header-accessible: muted mono headers ~3.7:1 -> muted-deep 5.85:1 */
.df-deck thead th,
.df-deck .prompttbl thead th{ color:var(--muted-deep); }
/* footer-accessible: faint footer labels -> muted-deep 5.51:1 on cream */
.df-deck .foot{ color:var(--muted-deep); }
/* small mono informational labels (stat / tile / journey) -> muted-deep */
.df-deck .herostat .l,
.df-deck .tile .l,
.df-deck .journey .stage .when,
.df-deck .journey .stage .cap2{ color:var(--muted-deep); }
/* tag-new-accessible + button-primary-accessible: white on rust ~4.4:1 -> on rust-deep 6.15:1 */
.df-deck .tag.new{ background:var(--rust-deep); }
.df-deck .cta-btn{ background:var(--rust-deep); }
/* tag-low-accessible: success -> success-deep on mint */
.df-deck .tag.low{ color:var(--success-deep); }
/* tag-hypothesis-accessible: warning -> warning-deep on straw */
.df-deck .tag.med{ color:var(--warning-deep); }
`;
export default DECK_A11Y_CSS;
