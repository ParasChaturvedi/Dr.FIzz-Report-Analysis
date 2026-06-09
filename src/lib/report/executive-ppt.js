// ─────────────────────────────────────────────────────────────────────────────
// Executive PowerPoint generator — converts a Doctor Fizz report (Stage-3 payload)
// into a clear, slide-by-slide, leadership-friendly deck. Simplifies the report:
// plain language, one idea per slide, concise bullets, business impact + actions.
// Fully data-driven from the report payload (works for ANY report).
// ─────────────────────────────────────────────────────────────────────────────
import pptxgen from "pptxgenjs";

const C = {
  ink: "141414", ivory: "F8F6F2", white: "FFFFFF", orange: "D4541A",
  text: "1A1A1A", grey: "6B6B6B", lightGrey: "9A948C", line: "E2DCD3",
  green: "2D6B32", red: "B83A1A", panel: "1E1E1E",
};
const HEAD = "Trebuchet MS", BODY = "Calibri";
const nf = (x) => (x == null || isNaN(Number(x)) ? "—" : Number(x).toLocaleString("en-US"));
const round = (x) => Math.round(Number(x) || 0);

/**
 * Build the executive deck as a Node Buffer (.pptx).
 * @param {object} df  the doctorFizz Stage-3 payload (report.data.doctorFizz)
 * @returns {Promise<Buffer>}
 */
export async function buildExecutivePptBuffer(df = {}) {
  const p = new pptxgen();
  p.layout = "LAYOUT_WIDE";
  p.author = "DoctorFizz";

  // ── Pull values defensively from the real payload ──
  const m = df.report_meta || {};
  const baseline = df.baseline || {};
  const val = (k) => (baseline[k] && baseline[k].value != null ? baseline[k].value : null);
  const opp = (df.v2_additions && df.v2_additions.opportunity_summary) || {};
  const gbp = df.gbp_comparison || {};
  const comp = df.competitive_analysis || {};
  const story = df.story || {};
  const scores = df.scores || {};
  const kw = df.keywords || {};
  const geo = df.geo_and_ai_visibility || {};

  const client = m.client_name || m.domain || "Your Business";
  const domain = m.domain || "";
  const date = m.report_date || "";
  const health = scores.seo_health;
  const traffic = val("organic_traffic");
  const orgKw = val("organic_keywords");
  const mobile = val("mobile_performance_score");
  const lcpMs = val("lcp");
  const lcpSec = lcpMs != null ? (Number(lcpMs) / 1000).toFixed(0) : null;
  const reviews = val("gbp_review_count");
  const rating = val("gbp_rating");
  const gbpComplete = val("gbp_completeness");
  const siteHealth = val("site_health_score");
  const compReviews = Math.max(
    0,
    Number((gbp.review_intel && gbp.review_intel.competitor_best_reviews) || 0),
    ...((gbp.competitors || []).map((c) => Number(c.review_count ?? c.reviewCount ?? 0)))
  );
  const totalDemand = opp.total_monthly_search_volume;
  const commercialPages = opp.commercial_keyword_count;
  const geoPages = opp.city_pages_needed;
  const quickWins = opp.quick_wins_available;
  const uplift6 = opp.estimated_traffic_uplift_6m;
  const uplift12 = opp.estimated_traffic_uplift_12m;
  const enq6 = uplift6 != null ? round(uplift6 * 0.02) : null;
  const enq12 = uplift12 != null ? round(uplift12 * 0.02) : null;
  const bestKw = (kw.accepted || [])[0];
  // Concise competitive bullets derived from the dimension comparison (not the
  // verbose advantage/gap sentences) — e.g. "Site Health: 92/100 vs 82/100".
  const dims = comp.dimensions || [];
  const fmtDim = (d) => `${d.dimension}: ${d.client_display}${d.competitor_best_display && d.competitor_best_display !== "—" ? ` vs ${d.competitor_best_display}` : ""}`;
  const yourEdges = dims.filter((d) => d.winner === "you").map(fmtDim);
  const theirEdges = dims.filter((d) => d.winner === "them").map(fmtDim);
  const aiZero = /zero|not|^0$|\b0\b/i.test(String(geo.current_ai_citation_count ?? "0"));
  const speedBad = mobile != null && mobile < 50;
  const reviewGap = reviews != null && compReviews > reviews;

  // ── Layout helpers ──
  const darkBg = (s) => (s.background = { color: C.ink });
  const lightBg = (s) => (s.background = { color: C.ivory });
  function header(s, kicker, title, dark) {
    s.addShape(p.shapes.RECTANGLE, { x: 0.6, y: 0.62, w: 0.16, h: 0.62, fill: { color: C.orange } });
    s.addText(kicker.toUpperCase(), { x: 0.92, y: 0.6, w: 11.5, h: 0.3, fontFace: BODY, bold: true, fontSize: 12, color: C.orange, charSpacing: 3, margin: 0 });
    s.addText(title, { x: 0.9, y: 0.86, w: 11.8, h: 0.85, fontFace: HEAD, bold: true, fontSize: 31, color: dark ? C.white : C.text, margin: 0 });
  }
  function footer(s, dark) {
    s.addText([{ text: "DOCTOR", options: { color: dark ? C.white : C.text } }, { text: "FIZZ", options: { color: C.orange } }],
      { x: 0.6, y: 7.0, w: 3, h: 0.3, fontFace: HEAD, bold: true, fontSize: 11, charSpacing: 1, margin: 0 });
    s.addText(`${client} · Executive Brief`, { x: 8.0, y: 7.0, w: 4.73, h: 0.3, align: "right", fontFace: BODY, fontSize: 10, color: dark ? C.lightGrey : C.grey, margin: 0 });
  }
  function stat(s, x, y, w, num, suffix, label, sub, accent) {
    const h = 2.0;
    s.addShape(p.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: { type: "outer", color: "000000", blur: 7, offset: 3, angle: 135, opacity: 0.1 } });
    s.addShape(p.shapes.RECTANGLE, { x, y, w: 0.09, h, fill: { color: accent } });
    s.addText([{ text: String(num), options: { fontSize: 44, bold: true, color: accent, fontFace: HEAD } }, { text: suffix ? " " + suffix : "", options: { fontSize: 18, bold: true, color: C.grey, fontFace: BODY } }],
      { x: x + 0.25, y: y + 0.22, w: w - 0.4, h: 0.9, margin: 0, valign: "middle" });
    s.addText(label.toUpperCase(), { x: x + 0.27, y: y + 1.12, w: w - 0.45, h: 0.32, fontFace: BODY, bold: true, fontSize: 11.5, color: C.text, charSpacing: 1, margin: 0 });
    if (sub) s.addText(sub, { x: x + 0.27, y: y + 1.44, w: w - 0.45, h: 0.5, fontFace: BODY, fontSize: 11, color: C.grey, margin: 0 });
  }
  function bullets(s, items, x, y, w, h, opt = {}) {
    s.addText(items.filter(Boolean).map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 16 }, breakLine: true, paraSpaceAfter: opt.gap ?? 11 } })),
      { x, y, w, h, fontFace: BODY, fontSize: opt.fs ?? 14.5, color: opt.color ?? C.text, lineSpacingMultiple: 1.05, margin: 0, valign: "top" });
  }
  function takeaway(s, label, text, y, dark) {
    s.addShape(p.shapes.RECTANGLE, { x: 0.9, y, w: 11.53, h: 1.0, fill: { color: dark ? C.ink : "FDF1EB" }, line: dark ? null : { color: "F0C9B5", width: 1 } });
    s.addShape(p.shapes.RECTANGLE, { x: 0.9, y, w: 0.09, h: 1.0, fill: { color: C.orange } });
    s.addText([{ text: label + "  ", options: { bold: true, color: C.orange } }, { text, options: { color: dark ? C.white : C.text } }],
      { x: 1.2, y, w: 11, h: 1.0, fontFace: BODY, fontSize: 14.5, lineSpacingMultiple: 1.1, margin: 0, valign: "middle" });
  }

  // ════════════════════ 1 — COVER ════════════════════
  let s = p.addSlide(); darkBg(s);
  s.addText([{ text: "DOCTOR", options: { color: C.white } }, { text: "FIZZ", options: { color: C.orange } }],
    { x: 0.9, y: 1.4, w: 8, h: 0.6, fontFace: HEAD, bold: true, fontSize: 26, charSpacing: 1, margin: 0 });
  s.addShape(p.shapes.RECTANGLE, { x: 0.95, y: 2.15, w: 0.9, h: 0.06, fill: { color: C.orange } });
  s.addText("SEO & GROWTH STRATEGY · EXECUTIVE BRIEF", { x: 0.9, y: 2.4, w: 11, h: 0.35, fontFace: BODY, bold: true, fontSize: 14, color: C.orange, charSpacing: 3, margin: 0 });
  s.addText(client, { x: 0.88, y: 2.85, w: 11.5, h: 1.2, fontFace: HEAD, bold: true, fontSize: 50, color: C.white, margin: 0 });
  s.addText("How we turn search into a leading source of new customers — the opportunity, the plan, and the payoff.",
    { x: 0.9, y: 4.35, w: 9.8, h: 0.9, fontFace: BODY, fontSize: 16, color: "C9C2B8", lineSpacingMultiple: 1.2, margin: 0 });
  s.addText([{ text: "PREPARED FOR LEADERSHIP", options: { color: C.orange, bold: true } }, { text: `      ${domain}${date ? "   ·   " + date : ""}`, options: { color: C.lightGrey } }],
    { x: 0.9, y: 6.45, w: 11, h: 0.35, fontFace: BODY, fontSize: 12, charSpacing: 1, margin: 0 });

  // ════════════════════ 2 — THE BOTTOM LINE ════════════════════
  s = p.addSlide(); darkBg(s);
  s.addShape(p.shapes.RECTANGLE, { x: 0.6, y: 0.62, w: 0.16, h: 0.62, fill: { color: C.orange } });
  s.addText("THE BOTTOM LINE", { x: 0.92, y: 0.6, w: 11, h: 0.3, fontFace: BODY, bold: true, fontSize: 12, color: C.orange, charSpacing: 3, margin: 0 });
  s.addText(traffic === 0 || traffic == null ? "Invisible today, in a market that is wide open" : "Underperforming today, with major upside ahead",
    { x: 0.9, y: 0.86, w: 11.8, h: 0.8, fontFace: HEAD, bold: true, fontSize: 30, color: C.white, margin: 0 });
  stat(s, 0.9, 2.1, 3.75, traffic === 0 ? "0" : nf(traffic), "", "Visitors from Google", traffic === 0 ? "We get virtually no traffic from search" : "Monthly organic visitors today", C.red);
  stat(s, 4.79, 2.1, 3.75, nf(totalDemand), "", "Searches a month", "People looking for our services — going to rivals", C.orange);
  stat(s, 8.68, 2.1, 3.75, nf(uplift12), "/mo", "Within 12 months", "Realistic monthly visitors once the plan runs", C.green);
  s.addShape(p.shapes.RECTANGLE, { x: 0.9, y: 4.55, w: 11.53, h: 1.55, fill: { color: C.panel }, line: { color: "333333", width: 1 } });
  s.addShape(p.shapes.RECTANGLE, { x: 0.9, y: 4.55, w: 0.09, h: 1.55, fill: { color: C.orange } });
  s.addText("In one line", { x: 1.2, y: 4.72, w: 11, h: 0.3, fontFace: BODY, bold: true, fontSize: 11, color: C.orange, charSpacing: 2, margin: 0 });
  s.addText(`Our website earns little from Google today, yet demand is large and the space is winnable. The fixes are fast, low-cost and high-return — this brief shows what to do and what it's worth.`,
    { x: 1.2, y: 5.02, w: 11, h: 1.0, fontFace: BODY, fontSize: 15.5, color: C.white, lineSpacingMultiple: 1.15, margin: 0 });
  footer(s, true);

  // ════════════════════ 3 — WHERE WE STAND ════════════════════
  s = p.addSlide(); lightBg(s);
  header(s, "Where we stand", traffic === 0 ? "We're invisible on Google — but on solid ground" : "We're under-performing — but the base is solid");
  s.addShape(p.shapes.RECTANGLE, { x: 0.9, y: 2.0, w: 5.7, h: 2.95, fill: { color: C.white }, line: { color: C.line, width: 1 } });
  s.addShape(p.shapes.RECTANGLE, { x: 0.9, y: 2.0, w: 5.7, h: 0.55, fill: { color: C.red } });
  s.addText("THE PROBLEM", { x: 1.1, y: 2.06, w: 5.3, h: 0.42, fontFace: BODY, bold: true, fontSize: 13, color: C.white, charSpacing: 2, margin: 0, valign: "middle" });
  bullets(s, [
    `${traffic === 0 ? "0" : nf(traffic)} visitors a month come from Google search`,
    `We rank for ${orgKw === 0 ? "0" : nf(orgKw)} search terms in the market`,
    speedBad ? `Phones load our pages in ${lcpSec} seconds — far too slow` : null,
    reviewGap ? `Only ${nf(reviews)} Google reviews (leader has ${nf(compReviews)})` : null,
  ], 1.15, 2.82, 5.25, 2.0, { gap: 13 });
  s.addShape(p.shapes.RECTANGLE, { x: 6.85, y: 2.0, w: 5.58, h: 2.95, fill: { color: C.white }, line: { color: C.line, width: 1 } });
  s.addShape(p.shapes.RECTANGLE, { x: 6.85, y: 2.0, w: 5.58, h: 0.55, fill: { color: C.green } });
  s.addText("WORKING IN OUR FAVOUR", { x: 7.05, y: 2.06, w: 5.2, h: 0.42, fontFace: BODY, bold: true, fontSize: 13, color: C.white, charSpacing: 2, margin: 0, valign: "middle" });
  bullets(s, [
    siteHealth != null && siteHealth >= 70 ? `A healthy, well-built website (${siteHealth}/100)` : "An established website to build on",
    rating != null ? `A solid ${rating}★ customer rating` : "Real customer reviews to grow from",
    "Strong, in-depth content already on the site",
    "A real business with clear services to sell",
  ], 7.1, 2.82, 5.13, 2.0, { gap: 12 });
  s.addText("Translation: the hard part — a real business and good content — is done. We just aren't being found yet.",
    { x: 0.9, y: 5.25, w: 11.5, h: 0.4, fontFace: BODY, italic: true, fontSize: 14, color: C.grey, margin: 0 });
  footer(s, false);

  // ════════════════════ 4 — THE OPPORTUNITY ════════════════════
  s = p.addSlide(); lightBg(s);
  header(s, "The opportunity", `${nf(totalDemand)} searches a month are going to rivals`);
  s.addText("Every month, people search for exactly what we sell — and land on competitors because we aren't there. Capturing even a fraction is a major new source of customers, at no cost per click.",
    { x: 0.9, y: 1.85, w: 11.5, h: 0.85, fontFace: BODY, fontSize: 15.5, color: C.text, lineSpacingMultiple: 1.15, margin: 0 });
  stat(s, 0.9, 2.95, 3.75, nf(totalDemand), "", "Monthly searches", "Total demand we could win", C.orange);
  stat(s, 4.79, 2.95, 3.75, nf(commercialPages), "", "Buyer pages to build", "One page per thing people buy", C.orange);
  stat(s, 8.68, 2.95, 3.75, nf(geoPages), "", "Location pages", "City & region opportunities", C.orange);
  if (bestKw && bestKw.keyword) {
    takeaway(s, "Biggest single prize:", `“${bestKw.keyword}” — ${nf(bestKw.global_volume)} searches every month${bestKw.keyword_difficulty != null && bestKw.keyword_difficulty < 30 ? ", and an easy win to rank for." : "."}`, 5.2);
  }
  footer(s, false);

  // ════════════════════ 5 — ROOT CAUSE ════════════════════
  s = p.addSlide(); lightBg(s);
  if (speedBad) {
    header(s, "Root cause", "One problem is causing the rest: speed");
    s.addText("Google won't show pages it thinks are slow. Fix this one thing and every page becomes able to rank — it unlocks everything else.",
      { x: 0.9, y: 1.85, w: 11.5, h: 0.7, fontFace: BODY, fontSize: 15.5, color: C.text, lineSpacingMultiple: 1.15, margin: 0 });
    const chain = [
      [`Pages load in ${lcpSec}s`, "A good site loads in under 3s", C.red],
      ["Google holds them back", "Slow pages get suppressed", C.orange],
      [traffic === 0 ? "0 visitors from search" : "Low visitors from search", "So few people find us today", C.ink],
    ];
    const cy = 2.95, cw = 3.5, ch = 1.7;
    chain.forEach((c, i) => {
      const x = 0.9 + i * (cw + 0.52);
      s.addShape(p.shapes.RECTANGLE, { x, y: cy, w: cw, h: ch, fill: { color: C.white }, line: { color: C.line, width: 1 } });
      s.addShape(p.shapes.RECTANGLE, { x, y: cy, w: cw, h: 0.12, fill: { color: c[2] } });
      s.addText(c[0], { x: x + 0.22, y: cy + 0.32, w: cw - 0.4, h: 0.6, fontFace: HEAD, bold: true, fontSize: 17, color: C.text, margin: 0 });
      s.addText(c[1], { x: x + 0.22, y: cy + 0.92, w: cw - 0.4, h: 0.6, fontFace: BODY, fontSize: 12.5, color: C.grey, lineSpacingMultiple: 1.05, margin: 0 });
      if (i < 2) s.addText("→", { x: x + cw + 0.04, y: cy + 0.4, w: 0.46, h: 0.9, fontFace: HEAD, bold: true, fontSize: 30, color: C.orange, align: "center", margin: 0 });
    });
    takeaway(s, "The fix:", "compress images and tidy the page code (a few days of work). Impact: the whole site becomes able to rank — the single highest-leverage action we can take.", 5.35);
  } else {
    header(s, "What's holding us back", "The ceilings limiting every page");
    s.addText("A few foundational issues cap how well everything else can perform. Clear these first and the rest of the work pays off fully.",
      { x: 0.9, y: 1.85, w: 11.5, h: 0.7, fontFace: BODY, fontSize: 15.5, color: C.text, lineSpacingMultiple: 1.15, margin: 0 });
    bullets(s, (story.whats_blocking_growth || []).slice(1, 4), 1.0, 2.9, 11.4, 2.6, { fs: 15, gap: 14 });
    takeaway(s, "Priority:", "fix the foundation first — it unblocks the return on all the content and authority work that follows.", 5.35);
  }
  footer(s, false);

  // ════════════════════ 6 — COMPETITIVE PICTURE ════════════════════
  s = p.addSlide(); lightBg(s);
  const hasComp = (comp.dimensions || []).length > 0 || theirEdges.length > 0 || yourEdges.length > 0;
  if (hasComp) {
    header(s, "Competitive picture", "Where we win, and where we must catch up");
    s.addShape(p.shapes.RECTANGLE, { x: 0.9, y: 2.0, w: 5.7, h: 2.95, fill: { color: C.white }, line: { color: C.line, width: 1 } });
    s.addShape(p.shapes.RECTANGLE, { x: 0.9, y: 2.0, w: 5.7, h: 0.55, fill: { color: C.green } });
    s.addText("WHERE WE WIN", { x: 1.1, y: 2.06, w: 5.3, h: 0.42, fontFace: BODY, bold: true, fontSize: 13, color: C.white, charSpacing: 2, margin: 0, valign: "middle" });
    bullets(s, (yourEdges.length ? yourEdges : ["Strong website quality", "Good customer rating", "In-depth content"]).slice(0, 3), 1.15, 2.82, 5.25, 2.0, { gap: 12 });
    s.addShape(p.shapes.RECTANGLE, { x: 6.85, y: 2.0, w: 5.58, h: 2.95, fill: { color: C.white }, line: { color: C.line, width: 1 } });
    s.addShape(p.shapes.RECTANGLE, { x: 6.85, y: 2.0, w: 5.58, h: 0.55, fill: { color: C.red } });
    s.addText("WHERE WE LAG", { x: 7.05, y: 2.06, w: 5.2, h: 0.42, fontFace: BODY, bold: true, fontSize: 13, color: C.white, charSpacing: 2, margin: 0, valign: "middle" });
    bullets(s, (theirEdges.length ? theirEdges : ["Fewer reviews than rivals", "Fewer pages covering demand"]).slice(0, 4), 7.1, 2.82, 5.13, 2.0, { gap: 10 });
    takeaway(s, "The decisive gap:", reviewGap ? `reviews. They are the #1 reason customers choose one business over another — closing the ${nf(reviews)}-vs-${nf(compReviews)} gap is fast, free, and lifts our local ranking.` : "closing the few gaps above is fast, focused work that moves us ahead of rivals.", 5.35, true);
  } else {
    header(s, "Competitive picture", "The space is open — no rival owns it");
    s.addText("No competitor dominates the commercial search space for our services. That is rare, and it's our advantage.",
      { x: 0.9, y: 1.95, w: 11.4, h: 0.8, fontFace: BODY, fontSize: 16, color: C.text, lineSpacingMultiple: 1.2, margin: 0 });
    bullets(s, ["No dominant player ranks for the money keywords", "We already have strong content and a healthy site", "Moving first lets us own the space before rivals do"], 1.0, 3.0, 11.4, 2.2, { fs: 15.5, gap: 14 });
    takeaway(s, "The advantage:", "an uncontested market rewards the first business to execute — that can be us.", 5.5);
  }
  footer(s, false);

  // ════════════════════ 7 — RISK OF INACTION ════════════════════
  s = p.addSlide(); darkBg(s);
  header(s, "The risk of inaction", "Every month we wait, the gap widens", true);
  const risks = [
    ["Rivals pull further ahead", "Competitors keep adding reviews, pages and links. Their lead compounds — it gets more expensive to catch up the longer we wait."],
    aiZero ? ["We're invisible to AI search", "ChatGPT and Google's AI answers don't cite us. As more buyers ask AI first, a no-show today becomes lost demand tomorrow."] : ["We under-use AI search", "AI answer engines are a fast-growing channel we barely appear in — early movers get cited and win the mindshare."],
    ["Customers go to competitors", `${nf(totalDemand)} monthly searches are being captured by others right now. That is paying customers we never see.`],
  ];
  risks.forEach((r, i) => {
    const y = 2.05 + i * 1.5;
    s.addShape(p.shapes.RECTANGLE, { x: 0.9, y, w: 11.53, h: 1.32, fill: { color: C.panel }, line: { color: "333333", width: 1 } });
    s.addShape(p.shapes.OVAL, { x: 1.15, y: y + 0.3, w: 0.72, h: 0.72, fill: { color: C.orange } });
    s.addText("!", { x: 1.15, y: y + 0.3, w: 0.72, h: 0.72, align: "center", valign: "middle", fontFace: HEAD, bold: true, fontSize: 30, color: C.white, margin: 0 });
    s.addText(r[0], { x: 2.1, y: y + 0.2, w: 10.1, h: 0.45, fontFace: HEAD, bold: true, fontSize: 18, color: C.white, margin: 0 });
    s.addText(r[1], { x: 2.1, y: y + 0.64, w: 10.1, h: 0.6, fontFace: BODY, fontSize: 13.5, color: "C9C2B8", lineSpacingMultiple: 1.05, margin: 0 });
  });
  footer(s, true);

  // ════════════════════ 8 — THE PLAN (3 phases) ════════════════════
  s = p.addSlide(); lightBg(s);
  header(s, "The plan", "Three phases, in the order that pays off fastest");
  const phases = [
    ["1", "FOUNDATION", "Day 1 – Week 1", [speedBad ? "Fix the site speed" : "Fix the technical basics", "Clear technical issues", "Complete the Google profile"], "Unblocks every page so it can rank", C.orange],
    ["2", "BUILD", "Weeks 1 – 8", [`Build the ${nf(commercialPages)} buyer pages`, "Build the top location pages", "Publish helpful guides"], "Captures the high-intent demand", C.green],
    ["3", "GROW", "Ongoing", ["Run a customer review drive", "Earn trusted links", "Add code for AI search"], "Compounds rankings & trust over time", C.ink],
  ];
  phases.forEach((ph, i) => {
    const x = 0.9 + i * 3.93, w = 3.7, y = 2.05, h = 4.5;
    s.addShape(p.shapes.RECTANGLE, { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 1 }, shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.1 } });
    s.addShape(p.shapes.RECTANGLE, { x, y, w, h: 0.14, fill: { color: ph[5] } });
    s.addShape(p.shapes.OVAL, { x: x + 0.3, y: y + 0.42, w: 0.78, h: 0.78, fill: { color: ph[5] } });
    s.addText(ph[0], { x: x + 0.3, y: y + 0.42, w: 0.78, h: 0.78, align: "center", valign: "middle", fontFace: HEAD, bold: true, fontSize: 30, color: C.white, margin: 0 });
    s.addText(ph[1], { x: x + 1.25, y: y + 0.5, w: w - 1.4, h: 0.4, fontFace: HEAD, bold: true, fontSize: 19, color: C.text, margin: 0 });
    s.addText(ph[2], { x: x + 1.25, y: y + 0.92, w: w - 1.4, h: 0.3, fontFace: BODY, bold: true, fontSize: 12, color: ph[5] === C.ink ? C.grey : ph[5], margin: 0 });
    bullets(s, ph[3], x + 0.28, y + 1.5, w - 0.5, 2.0, { fs: 13.5, gap: 9 });
    s.addShape(p.shapes.RECTANGLE, { x: x + 0.18, y: y + 3.55, w: w - 0.36, h: 0.78, fill: { color: C.ivory } });
    s.addText([{ text: "IMPACT  ", options: { bold: true, color: ph[5] === C.ink ? C.orange : ph[5], fontSize: 9 } }, { text: ph[4], options: { color: C.text, fontSize: 11.5 } }],
      { x: x + 0.32, y: y + 3.6, w: w - 0.6, h: 0.68, fontFace: BODY, lineSpacingMultiple: 1.0, margin: 0, valign: "middle" });
  });
  footer(s, false);

  // ════════════════════ 9 — QUICK WINS ════════════════════
  s = p.addSlide(); lightBg(s);
  header(s, "Quick wins", "Highest return, lowest effort — start here");
  const wins = [
    [speedBad ? "Fix the site speed" : "Fix the technical basics", "A few days", "Unlocks every page to rank"],
    ["Complete the Google profile", "~1 hour", "More calls from local search"],
    reviewGap ? ["Launch a review drive", "6–8 weeks", `Closes the #1 trust gap (${nf(reviews)} → ${nf(compReviews)})`] : ["Keep reviews fresh", "Ongoing", "Sustains local-pack ranking"],
    ["Claim key directory listings", "~3 hours", "Fast, free authority + visibility"],
  ];
  wins.forEach((w0, i) => {
    const cdx = i % 2, row = Math.floor(i / 2);
    const x = 0.9 + cdx * 5.93, y = 2.05 + row * 2.15, cw2 = 5.7, ch2 = 1.85;
    s.addShape(p.shapes.RECTANGLE, { x, y, w: cw2, h: ch2, fill: { color: C.white }, line: { color: C.line, width: 1 } });
    s.addShape(p.shapes.RECTANGLE, { x, y, w: 0.09, h: ch2, fill: { color: C.orange } });
    s.addText(w0[0], { x: x + 0.3, y: y + 0.22, w: cw2 - 1.8, h: 0.5, fontFace: HEAD, bold: true, fontSize: 17, color: C.text, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: x + cw2 - 1.55, y: y + 0.26, w: 1.32, h: 0.42, fill: { color: "FDF1EB" }, rectRadius: 0.08 });
    s.addText(w0[1], { x: x + cw2 - 1.55, y: y + 0.26, w: 1.32, h: 0.42, align: "center", valign: "middle", fontFace: BODY, bold: true, fontSize: 11, color: C.orange, margin: 0 });
    s.addText([{ text: "Impact:  ", options: { bold: true, color: C.green } }, { text: w0[2], options: { color: C.text } }],
      { x: x + 0.3, y: y + 0.95, w: cw2 - 0.6, h: 0.7, fontFace: BODY, fontSize: 13.5, lineSpacingMultiple: 1.05, margin: 0, valign: "top" });
  });
  footer(s, false);

  // ════════════════════ 10 — THE PAYOFF ════════════════════
  s = p.addSlide(); lightBg(s);
  header(s, "The payoff", "What acting is worth — in customers");
  s.addText("Realistic targets based on our actual search demand — not guarantees. They depend on the work being done.",
    { x: 0.9, y: 1.85, w: 11.5, h: 0.55, fontFace: BODY, italic: true, fontSize: 13.5, color: C.grey, margin: 0 });
  const ms = [
    ["AT 6 MONTHS", "Early momentum", nf(uplift6), enq6 != null ? `~${nf(enq6)} new enquiries every month` : "first steady stream of enquiries", C.orange],
    ["AT 12 MONTHS", "Full momentum", nf(uplift12), enq12 != null ? `~${nf(enq12)} new enquiries every month` : "a compounding flow of enquiries", C.green],
  ];
  ms.forEach((mm, i) => {
    const x = 0.9 + i * 5.93, w = 5.7, y = 2.6, h = 3.7;
    s.addShape(p.shapes.RECTANGLE, { x, y, w, h, fill: { color: i ? C.ink : C.white }, line: { color: C.line, width: 1 }, shadow: { type: "outer", color: "000000", blur: 7, offset: 3, angle: 135, opacity: 0.12 } });
    s.addShape(p.shapes.RECTANGLE, { x, y, w, h: 0.14, fill: { color: mm[4] } });
    s.addText(mm[0], { x: x + 0.35, y: y + 0.4, w: w - 0.7, h: 0.35, fontFace: BODY, bold: true, fontSize: 13, color: mm[4], charSpacing: 2, margin: 0 });
    s.addText(mm[1], { x: x + 0.35, y: y + 0.72, w: w - 0.7, h: 0.35, fontFace: BODY, fontSize: 13, color: i ? C.lightGrey : C.grey, margin: 0 });
    s.addText(mm[2], { x: x + 0.32, y: y + 1.2, w: w - 0.6, h: 1.0, fontFace: HEAD, bold: true, fontSize: 56, color: i ? C.white : C.text, margin: 0 });
    s.addText("visitors / month", { x: x + 0.35, y: y + 2.3, w: w - 0.7, h: 0.35, fontFace: BODY, fontSize: 15, color: i ? C.lightGrey : C.grey, margin: 0 });
    s.addText(mm[3], { x: x + 0.35, y: y + 2.85, w: w - 0.7, h: 0.55, fontFace: BODY, bold: true, fontSize: 16, color: i ? C.white : C.text, margin: 0 });
  });
  s.addText("A self-sustaining channel that costs nothing per click and keeps compounding.",
    { x: 0.9, y: 6.5, w: 11.5, h: 0.4, align: "center", fontFace: BODY, italic: true, fontSize: 13.5, color: C.grey, margin: 0 });
  footer(s, false);

  // ════════════════════ 11 — NEXT STEPS ════════════════════
  s = p.addSlide(); lightBg(s);
  header(s, "Next steps", "What we need to get moving");
  const asks = [
    ["Approve the plan", "Green-light the 3-phase roadmap so work can start now."],
    [speedBad ? "Prioritise the speed fix" : "Prioritise the foundation", "It's the one change that unblocks everything — make it first."],
    ["Commit to reviews", "Agree to ask every customer for a Google review after each job."],
    ["Resource the build", `Support building the ${nf(commercialPages)} buyer pages over the next 8 weeks.`],
  ];
  asks.forEach((a, i) => {
    const y = 2.05 + i * 1.12;
    s.addShape(p.shapes.OVAL, { x: 0.9, y: y + 0.08, w: 0.66, h: 0.66, fill: { color: C.orange } });
    s.addText(String(i + 1), { x: 0.9, y: y + 0.08, w: 0.66, h: 0.66, align: "center", valign: "middle", fontFace: HEAD, bold: true, fontSize: 24, color: C.white, margin: 0 });
    s.addText([{ text: a[0] + "   ", options: { bold: true, fontSize: 18, color: C.text } }, { text: a[1], options: { fontSize: 14, color: C.grey } }],
      { x: 1.75, y, w: 10.6, h: 0.9, fontFace: BODY, lineSpacingMultiple: 1.05, margin: 0, valign: "middle" });
  });
  footer(s, false);

  // ════════════════════ 12 — CLOSING ════════════════════
  s = p.addSlide(); darkBg(s);
  s.addShape(p.shapes.RECTANGLE, { x: 0.95, y: 2.5, w: 0.9, h: 0.06, fill: { color: C.orange } });
  s.addText("The market is winnable.", { x: 0.88, y: 2.75, w: 11.5, h: 0.9, fontFace: HEAD, bold: true, fontSize: 44, color: C.white, margin: 0 });
  s.addText("The first mover wins.", { x: 0.88, y: 3.65, w: 11.5, h: 0.9, fontFace: HEAD, bold: true, fontSize: 44, color: C.orange, margin: 0 });
  s.addText(`With a fast foundation fix and a focused build, ${client} can be the business customers find first.`,
    { x: 0.9, y: 4.8, w: 10.2, h: 0.9, fontFace: BODY, fontSize: 16, color: "C9C2B8", lineSpacingMultiple: 1.2, margin: 0 });
  s.addText([{ text: "Ready to begin?   ", options: { bold: true, color: C.white } }, { text: "doctorfizz.com", options: { color: C.orange } }],
    { x: 0.9, y: 6.3, w: 11, h: 0.4, fontFace: BODY, fontSize: 14, margin: 0 });

  return await p.write({ outputType: "nodebuffer" });
}
