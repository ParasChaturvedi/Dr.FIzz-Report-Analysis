// src/app/api/report/generate/route.js
// Generates a comprehensive PDF SEO & GEO Strategy report matching the Dr.FIzz reference.
// Uses pdfkit. Accepts analysis JSON from /api/ai/analyze.

import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  darkNavy: "#0f1b2d",
  mediumNavy: "#1e3a5f",
  lightBlueTint: "#e8f4fd",
  white: "#ffffff",
  offWhite: "#f5f5f0",
  red: "#dc2626",
  amber: "#f59e0b",
  blue: "#3b82f6",
  green: "#16a34a",
  darkGray: "#374151",
  mediumGray: "#6b7280",
  lightGray: "#e5e7eb",
  veryLightBlue: "#f0f7ff",
};

function safeStr(v, fallback = "") {
  return String(v ?? fallback).trim();
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(d) {
  try {
    return new Date(d || Date.now()).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}

function priorityColor(priority) {
  const p = safeStr(priority).toUpperCase();
  if (p === "CRITICAL") return C.red;
  if (p === "HIGH") return C.amber;
  if (p === "MEDIUM") return C.blue;
  return C.mediumGray;
}

// ─── PDF builder ─────────────────────────────────────────────────────────────
async function buildPdf(analysis, domain) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      info: {
        Title: `SEO & GEO Strategy Report — ${domain}`,
        Author: "Dr.FIzz SEO Intelligence",
        Creator: "Dr.FIzz powered by Claude Opus 4.7",
        CreationDate: new Date(),
      },
    });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_W = doc.page.width;   // 595
    const PAGE_H = doc.page.height;  // 842
    const ML = 45;
    const MR = 45;
    const MT = 40;
    const MB = 40;
    const CONTENT_W = PAGE_W - ML - MR; // 505
    let y = MT;
    let pageNum = 1;

    // ── helpers ──────────────────────────────────────────────────────────────

    function newPage() {
      doc.addPage();
      pageNum += 1;
      y = MT;
    }

    function ensureSpace(needed = 80) {
      if (y + needed > PAGE_H - MB - 20) {
        newPage();
      }
    }

    function drawFooter() {
      const fy = PAGE_H - 22;
      doc
        .save()
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor(C.mediumGray)
        .text(
          `Dr.FIzz SEO Intelligence  ·  ${domain}  ·  ${formatDate(analysis?.generatedAt)}  ·  Page ${pageNum}`,
          ML,
          fy,
          { width: CONTENT_W, align: "center" }
        )
        .restore();
    }

    function sectionHeader(num, title) {
      // Ensure we start on a fresh area with space
      ensureSpace(50);
      const BAR_H = 32;
      doc.save().rect(ML - 45, y, PAGE_W, BAR_H).fill(C.darkNavy).restore();
      doc
        .save()
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#8899aa")
        .text(String(num).padStart(2, "0"), ML - 45 + 12, y + 10)
        .restore();
      doc
        .save()
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor(C.white)
        .text(title.toUpperCase(), ML - 45 + 36, y + 9, { width: CONTENT_W + 45 - 36 - 12 })
        .restore();
      y += BAR_H + 14;
    }

    function subHeading(text, color = C.darkNavy) {
      ensureSpace(24);
      doc.fontSize(10).font("Helvetica-Bold").fillColor(color).text(text, ML, y, { width: CONTENT_W });
      y += 16;
    }

    function bodyText(text, indent = 0, color = C.darkGray) {
      if (!text) return;
      ensureSpace(14);
      doc.fontSize(9).font("Helvetica").fillColor(color).text(safeStr(text), ML + indent, y, { width: CONTENT_W - indent });
      y += doc.currentLineHeight() + 3;
    }

    function bulletItem(text, indent = 10, color = C.darkGray) {
      if (!text) return;
      ensureSpace(14);
      const bx = ML + indent;
      const tx = bx + 12;
      doc.fontSize(9).font("Helvetica").fillColor(color).text("•", bx, y).text(safeStr(text), tx, y, { width: CONTENT_W - indent - 12 });
      y += doc.currentLineHeight() + 3;
    }

    function gapLine(size = 8) {
      y += size;
    }

    // Metric card: draws a box with big number + label
    function metricCard(x, cardY, w, h, bigVal, label, sublabel, sublabelColor) {
      doc.save().rect(x, cardY, w, h).fill(C.lightBlueTint).restore();
      doc.save().rect(x, cardY, w, 3).fill(C.mediumNavy).restore();
      doc
        .save()
        .fontSize(22)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(bigVal), x + 8, cardY + 10, { width: w - 16, align: "center" })
        .restore();
      doc
        .save()
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(C.darkGray)
        .text(safeStr(label), x + 4, cardY + 38, { width: w - 8, align: "center" })
        .restore();
      if (sublabel) {
        doc
          .save()
          .fontSize(7.5)
          .font("Helvetica")
          .fillColor(sublabelColor || C.mediumGray)
          .text(safeStr(sublabel), x + 4, cardY + 51, { width: w - 8, align: "center" })
          .restore();
      }
    }

    // Table helpers
    function tableHeader(cols, colWidths, headerY) {
      let cx = ML;
      doc.save().rect(ML, headerY, CONTENT_W, 20).fill(C.darkNavy).restore();
      for (let i = 0; i < cols.length; i++) {
        doc
          .save()
          .fontSize(8.5)
          .font("Helvetica-Bold")
          .fillColor(C.white)
          .text(cols[i], cx + 4, headerY + 5, { width: colWidths[i] - 8 })
          .restore();
        cx += colWidths[i];
      }
      return headerY + 20;
    }

    function tableRow(cells, colWidths, rowY, isAlt) {
      doc
        .save()
        .rect(ML, rowY, CONTENT_W, 18)
        .fill(isAlt ? C.veryLightBlue : C.white)
        .restore();
      // border
      doc
        .save()
        .rect(ML, rowY, CONTENT_W, 18)
        .strokeColor(C.lightGray)
        .lineWidth(0.5)
        .stroke()
        .restore();
      let cx = ML;
      for (let i = 0; i < cells.length; i++) {
        doc
          .save()
          .fontSize(8.5)
          .font("Helvetica")
          .fillColor(C.darkGray)
          .text(safeStr(cells[i]), cx + 4, rowY + 4, { width: colWidths[i] - 8 })
          .restore();
        cx += colWidths[i];
      }
      return rowY + 18;
    }

    function priorityBadge(priority, bx, by) {
      const col = priorityColor(priority);
      const bw = 58;
      const bh = 14;
      doc.save().roundedRect(bx, by, bw, bh, 3).fill(col).restore();
      doc
        .save()
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .fillColor(C.white)
        .text(safeStr(priority).toUpperCase(), bx, by + 3, { width: bw, align: "center" })
        .restore();
    }

    function calloutBox(text, color = C.mediumNavy, textColor = C.white) {
      if (!text) return;
      ensureSpace(60);
      const BOX_H = 54;
      doc.save().roundedRect(ML, y, CONTENT_W, BOX_H, 5).fill(color).restore();
      doc
        .save()
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(textColor)
        .text(safeStr(text), ML + 12, y + 10, { width: CONTENT_W - 24 })
        .restore();
      y += BOX_H + 10;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // COVER PAGE
    // ══════════════════════════════════════════════════════════════════════════
    doc.save().rect(0, 0, PAGE_W, PAGE_H).fill(C.darkNavy).restore();

    // Title area
    const titleY = 180;
    doc
      .save()
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#8899aa")
      .text("SEO & GEO", ML, titleY, { characterSpacing: 4 })
      .restore();

    doc
      .save()
      .fontSize(38)
      .font("Helvetica-Bold")
      .fillColor(C.white)
      .text("STRATEGY", ML, titleY + 16)
      .restore();

    doc
      .save()
      .fontSize(38)
      .font("Helvetica-Bold")
      .fillColor(C.white)
      .text("REPORT", ML, titleY + 58)
      .restore();

    // Accent line
    doc.save().rect(ML, titleY + 102, 60, 3).fill(C.blue).restore();

    // Domain
    doc
      .save()
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor("#a0c4e8")
      .text(domain, ML, titleY + 118)
      .restore();

    // Tagline
    doc
      .save()
      .fontSize(11)
      .font("Helvetica")
      .fillColor("#6e8faa")
      .text(`A data-led plan to grow ${domain}'s organic search visibility`, ML, titleY + 142, { width: CONTENT_W - 60 })
      .restore();

    // Bottom meta
    doc
      .save()
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#5a7a9a")
      .text(`${formatDate(analysis?.generatedAt)}  ·  Prepared by Dr.FIzz`, ML, PAGE_H - 80)
      .restore();

    // Dr.FIzz brand block
    doc
      .save()
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor(C.blue)
      .text("Dr.FIzz", PAGE_W - ML - 100, PAGE_H - 100, { width: 100, align: "right" })
      .restore();
    doc
      .save()
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#4a6a8a")
      .text("SEO Intelligence Platform", PAGE_W - ML - 100, PAGE_H - 76, { width: 100, align: "right" })
      .restore();

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 01 — THE BASELINE
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("01", "The Baseline");

    const b = analysis?.baseline || {};

    // Row 1: DR, Keywords, Traffic
    const cardW = Math.floor(CONTENT_W / 3) - 4;
    const cardH = 68;

    metricCard(ML, y, cardW, cardH,
      safeStr(b.domainRating ?? "—"),
      "Domain Rating",
      safeStr(b.domainRatingLabel || ""),
      safeStr(b.domainRatingLabel || "").includes("Extremely") || safeStr(b.domainRatingLabel || "").includes("Low") ? C.red : C.green
    );
    metricCard(ML + cardW + 6, y, cardW, cardH,
      safeStr(b.organicKeywords ?? "0"),
      "Organic Keywords",
      safeStr(b.organicKeywordsCountry || "United States"),
      C.mediumGray
    );
    metricCard(ML + (cardW + 6) * 2, y, cardW, cardH,
      safeStr(b.organicTraffic ?? "0"),
      "Organic Traffic / mo",
      "Estimated monthly visits",
      C.mediumGray
    );
    y += cardH + 10;

    // Row 2: Referring Domains, 404 Errors, Redirect Chains
    metricCard(ML, y, cardW, cardH,
      safeStr(b.referringDomains ?? "0"),
      "Referring Domains",
      safeStr(b.dofollowNote || ""),
      C.mediumGray
    );
    metricCard(ML + cardW + 6, y, cardW, cardH,
      `${safeStr(b.errors404 ?? "0")}`,
      "404 Errors",
      `${safeNum(b.errors404Pct, 0)}% of pages`,
      safeNum(b.errors404Pct, 0) > 10 ? C.red : C.amber
    );
    metricCard(ML + (cardW + 6) * 2, y, cardW, cardH,
      `${safeStr(b.redirectChains ?? "0")}`,
      "Redirect Chains",
      `${safeNum(b.redirectChainsPct, 0)}% of pages`,
      safeNum(b.redirectChainsPct, 0) > 5 ? C.red : C.amber
    );
    y += cardH + 16;

    // KEY TAKEAWAY
    if (b.keyTakeaway) {
      doc.save().rect(ML, y, CONTENT_W, 4).fill(C.blue).restore();
      y += 8;
      doc
        .save()
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(C.blue)
        .text("KEY TAKEAWAY", ML, y, { characterSpacing: 1.5 })
        .restore();
      y += 14;
      doc
        .save()
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(b.keyTakeaway), ML, y, { width: CONTENT_W })
        .restore();
      y += doc.currentLineHeight() + 16;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 02 — COMPETITOR LANDSCAPE
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("02", "Competitor Landscape");

    const cl = analysis?.competitorLandscape || {};

    // Business competitors
    subHeading("Business Competitors");
    const bizComps = Array.isArray(cl.businessCompetitors) ? cl.businessCompetitors : [];
    for (const comp of bizComps.slice(0, 5)) {
      ensureSpace(44);
      const threatCol = comp.threatLevel === "high" ? C.red : comp.threatLevel === "medium" ? C.amber : C.green;
      doc.save().rect(ML, y, CONTENT_W, 38).fill(C.lightBlueTint).restore();
      doc.save().rect(ML, y, 4, 38).fill(threatCol).restore();
      doc
        .save()
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(comp.name), ML + 12, y + 5, { width: CONTENT_W - 120 })
        .restore();
      doc
        .save()
        .fontSize(8)
        .font("Helvetica")
        .fillColor(C.mediumGray)
        .text(`DR: ${safeStr(comp.drLevel)}`, ML + CONTENT_W - 100, y + 5, { width: 95, align: "right" })
        .restore();
      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor(C.darkGray)
        .text(safeStr(comp.description), ML + 12, y + 22, { width: CONTENT_W - 20 })
        .restore();
      y += 46;
    }

    gapLine(10);

    // Search competitors
    subHeading("Search / National Competitors");
    const searchComps = Array.isArray(cl.searchCompetitors) ? cl.searchCompetitors : [];
    for (const comp of searchComps.slice(0, 5)) {
      ensureSpace(38);
      doc.save().rect(ML, y, CONTENT_W, 32).fill(C.offWhite).restore();
      doc
        .save()
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(comp.name), ML + 10, y + 5, { width: CONTENT_W - 140 })
        .restore();
      doc
        .save()
        .fontSize(8)
        .font("Helvetica")
        .fillColor(C.blue)
        .text(`Positions: ${safeStr(comp.positionRange)}`, ML + CONTENT_W - 120, y + 5, { width: 115, align: "right" })
        .restore();
      doc
        .save()
        .fontSize(8)
        .font("Helvetica")
        .fillColor(C.darkGray)
        .text(safeStr(comp.description), ML + 10, y + 19, { width: CONTENT_W - 20 })
        .restore();
      y += 38;
    }

    gapLine(12);

    // The local opening
    if (cl.localOpening) {
      ensureSpace(60);
      doc.save().rect(ML, y, CONTENT_W, 50).fill(C.mediumNavy).restore();
      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor("#8aafd4")
        .text("THE LOCAL OPENING", ML + 12, y + 8, { characterSpacing: 1 })
        .restore();
      doc
        .save()
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(C.white)
        .text(safeStr(cl.localOpening), ML + 12, y + 22, { width: CONTENT_W - 24 })
        .restore();
      y += 60;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 03 — KEYWORD STRATEGY
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("03", "Keyword Strategy");

    const ks = analysis?.keywordStrategy || {};

    subHeading("Tier 1: Primary Commercial Keywords");
    const tier1 = Array.isArray(ks.tier1) ? ks.tier1 : [];
    if (tier1.length > 0) {
      const t1ColW = [CONTENT_W * 0.45, CONTENT_W * 0.3, CONTENT_W * 0.25];
      let ty = tableHeader(["Keyword", "Est. Monthly Volume", "Target Page Type"], t1ColW, y);
      y = ty;
      for (let i = 0; i < tier1.length; i++) {
        ensureSpace(22);
        y = tableRow([
          safeStr(tier1[i]?.keyword),
          safeStr(tier1[i]?.estVolume),
          safeStr(tier1[i]?.targetPage),
        ], t1ColW, y, i % 2 === 1);
      }
    }

    gapLine(16);
    subHeading("Tier 2: Neighborhood / Geo Keywords");
    const tier2 = Array.isArray(ks.tier2) ? ks.tier2 : [];
    for (const kw of tier2) bulletItem(kw, 10, C.blue);

    gapLine(12);
    subHeading("Tier 3: Informational Blog Content");
    const tier3 = Array.isArray(ks.tier3) ? ks.tier3 : [];
    for (const kw of tier3) bulletItem(kw, 10, C.darkGray);

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 04 — CONTENT ARCHITECTURE
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("04", "Content Architecture");

    const ca = analysis?.contentArchitecture || {};

    subHeading("Recommended Site Structure");
    const struct = Array.isArray(ca.siteStructure) ? ca.siteStructure : [];
    for (let i = 0; i < struct.length; i++) {
      ensureSpace(16);
      const indent = i === 0 ? 0 : 16;
      const prefix = i === 0 ? "" : "  └─ ";
      doc
        .save()
        .fontSize(9)
        .font("Helvetica")
        .fillColor(C.blue)
        .text(`${prefix}${safeStr(struct[i])}`, ML + indent, y, { width: CONTENT_W - indent })
        .restore();
      y += 14;
    }

    gapLine(16);
    subHeading("Every Page Must Include");
    const reqs = Array.isArray(ca.pageRequirements) ? ca.pageRequirements : [];
    for (const req of reqs) bulletItem(req, 10, C.darkGray);

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 05 — COMPETITIVE INTELLIGENCE
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("05", "Competitive Intelligence");

    const ci = analysis?.competitiveIntelligence || {};
    const colW2 = (CONTENT_W - 12) / 2;

    // Two-column layout
    const leftX = ML;
    const rightX = ML + colW2 + 12;
    let leftY = y;
    let rightY = y;

    // Left: What Works
    doc.save().fontSize(10).font("Helvetica-Bold").fillColor(C.green).text("What Works For Them", leftX, leftY, { width: colW2 }).restore();
    leftY += 16;
    const whatWorks = Array.isArray(ci.whatWorks) ? ci.whatWorks : [];
    for (const w of whatWorks) {
      doc.save().rect(leftX, leftY, 4, 11).fill(C.green).restore();
      doc.save().fontSize(9).font("Helvetica").fillColor(C.darkGray).text(safeStr(w), leftX + 10, leftY, { width: colW2 - 10 }).restore();
      leftY += doc.currentLineHeight() + 5;
    }

    // Right: Gaps
    doc.save().fontSize(10).font("Helvetica-Bold").fillColor(C.red).text("Gaps You Can Exploit", rightX, rightY, { width: colW2 }).restore();
    rightY += 16;
    const gaps = Array.isArray(ci.gapsToExploit) ? ci.gapsToExploit : [];
    for (const g of gaps) {
      doc.save().rect(rightX, rightY, 4, 11).fill(C.blue).restore();
      doc.save().fontSize(9).font("Helvetica").fillColor(C.darkGray).text(safeStr(g), rightX + 10, rightY, { width: colW2 - 10 }).restore();
      rightY += doc.currentLineHeight() + 5;
    }

    y = Math.max(leftY, rightY) + 10;

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 06 — TECHNICAL FOUNDATION
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("06", "Technical Foundation");

    const tf = analysis?.technicalFoundation || {};
    const issues = Array.isArray(tf.issues) ? tf.issues : [];

    // Priority table
    const issueColW = [CONTENT_W * 0.18, CONTENT_W * 0.38, CONTENT_W * 0.44];
    let ty2 = tableHeader(["Priority", "Issue", "Action"], issueColW, y);
    y = ty2;

    for (let i = 0; i < issues.length; i++) {
      const iss = issues[i];
      ensureSpace(24);
      const rowY = y;
      const rowH = 22;

      doc.save().rect(ML, rowY, CONTENT_W, rowH).fill(i % 2 === 1 ? C.veryLightBlue : C.white).restore();
      doc.save().rect(ML, rowY, CONTENT_W, rowH).strokeColor(C.lightGray).lineWidth(0.4).stroke().restore();

      priorityBadge(iss.priority, ML + 6, rowY + 4);

      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor(C.darkGray)
        .text(safeStr(iss.issue), ML + issueColW[0] + 4, rowY + 5, { width: issueColW[1] - 8 })
        .restore();

      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor(C.darkGray)
        .text(safeStr(iss.action), ML + issueColW[0] + issueColW[1] + 4, rowY + 5, { width: issueColW[2] - 8 })
        .restore();

      y += rowH;
    }

    gapLine(14);
    if (tf.onPageNote) {
      doc.save().rect(ML, y, CONTENT_W, 32).fill(C.lightBlueTint).restore();
      doc.save().fontSize(9).font("Helvetica").fillColor(C.darkGray).text(safeStr(tf.onPageNote), ML + 10, y + 8, { width: CONTENT_W - 20 }).restore();
      y += 40;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 07 — AUTHORITY (Link Building)
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("07", "Authority — Link Building");

    const auth = analysis?.authority || {};

    // DR progress bar
    ensureSpace(50);
    doc.save().fontSize(10).font("Helvetica-Bold").fillColor(C.darkNavy).text("Domain Rating Progress", ML, y).restore();
    y += 16;

    const drBarW = CONTENT_W;
    const drBarH = 22;
    const currentDR = safeNum(auth.currentDR, 0);
    const filledPct = Math.min(1, currentDR / 100);

    doc.save().rect(ML, y, drBarW, drBarH).fill(C.lightGray).restore();
    if (filledPct > 0) {
      doc.save().rect(ML, y, drBarW * filledPct, drBarH).fill(C.blue).restore();
    }
    doc
      .save()
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(C.white)
      .text(`DR ${currentDR}  →  Target: ${safeStr(auth.targetDR12mo)} in 12 months`, ML + 8, y + 6, { width: drBarW - 16 })
      .restore();
    y += drBarH + 16;

    // Three sub-sections
    const authSections = [
      { label: "Citation Building (Months 1 to 2)", text: auth.citationBuilding, color: C.blue },
      { label: "Content-Driven Links (Months 2 to 4)", text: auth.contentDrivenLinks, color: C.green },
      { label: "Competitor Link Gap (Ongoing)", text: auth.competitorLinkGap, color: C.amber },
    ];

    for (const as of authSections) {
      if (!as.text) continue;
      ensureSpace(50);
      const subH = 44;
      doc.save().rect(ML, y, CONTENT_W, subH).fill(C.lightBlueTint).restore();
      doc.save().rect(ML, y, 4, subH).fill(as.color).restore();
      doc
        .save()
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(as.color)
        .text(as.label, ML + 12, y + 6, { width: CONTENT_W - 20 })
        .restore();
      doc
        .save()
        .fontSize(9)
        .font("Helvetica")
        .fillColor(C.darkGray)
        .text(safeStr(as.text), ML + 12, y + 20, { width: CONTENT_W - 20 })
        .restore();
      y += subH + 10;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 08 — LOCAL SEARCH (GBP)
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("08", "Local Search — Google Business Profile");

    const ls = analysis?.localSearch || {};

    doc
      .save()
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(C.darkNavy)
      .text("Google Business Profile: The Fastest Win", ML, y)
      .restore();
    y += 16;

    subHeading("Optimization Checklist");
    const checklist = Array.isArray(ls.checklist) ? ls.checklist : [];
    for (const item of checklist) bulletItem(item, 10, C.darkGray);

    gapLine(14);

    // Review target badge
    const reviewTarget = safeNum(ls.reviewTarget, 100);
    ensureSpace(60);
    doc.save().rect(ML, y, CONTENT_W, 52).fill(C.darkNavy).restore();
    doc
      .save()
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(C.amber)
      .text(`Review Target: ${reviewTarget}+ reviews`, ML + 12, y + 10, { width: CONTENT_W - 24 })
      .restore();
    if (ls.reviewNote) {
      doc
        .save()
        .fontSize(9)
        .font("Helvetica")
        .fillColor("#d4e8f8")
        .text(safeStr(ls.reviewNote), ML + 12, y + 28, { width: CONTENT_W - 24 })
        .restore();
    }
    y += 62;

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 09 — EXECUTION: 12-Month Roadmap
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("09", "Execution: 12-Month Roadmap");

    const roadmap = Array.isArray(analysis?.executionRoadmap) ? analysis.executionRoadmap : [];
    const phaseColors = [C.red, C.amber, C.blue, C.green];
    const phaseW = (CONTENT_W - 10) / 2;
    const phaseH = 140;

    // 2x2 grid
    const phases2x2 = roadmap.slice(0, 4);
    for (let row = 0; row < 2; row++) {
      ensureSpace(phaseH + 10);
      for (let col = 0; col < 2; col++) {
        const idx = row * 2 + col;
        if (idx >= phases2x2.length) continue;
        const ph = phases2x2[idx];
        const px = ML + col * (phaseW + 10);
        const py = y;
        const col2 = phaseColors[idx] || C.blue;

        doc.save().rect(px, py, phaseW, phaseH).fill(C.lightBlueTint).restore();
        doc.save().rect(px, py, 5, phaseH).fill(col2).restore();

        doc
          .save()
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor(col2)
          .text(safeStr(ph.phase).toUpperCase(), px + 12, py + 8, { characterSpacing: 0.5 })
          .restore();
        doc
          .save()
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor(C.darkNavy)
          .text(safeStr(ph.name), px + 12, py + 20, { width: phaseW - 20 })
          .restore();
        doc
          .save()
          .fontSize(8)
          .font("Helvetica")
          .fillColor(C.mediumGray)
          .text(safeStr(ph.period), px + 12, py + 34, { width: phaseW - 20 })
          .restore();

        let ty3 = py + 50;
        const tasks = Array.isArray(ph.tasks) ? ph.tasks : [];
        for (const task of tasks.slice(0, 5)) {
          doc.save().rect(px + 12, ty3 + 3, 4, 4).fill(col2).restore();
          doc
            .save()
            .fontSize(8.5)
            .font("Helvetica")
            .fillColor(C.darkGray)
            .text(safeStr(task), px + 20, ty3, { width: phaseW - 28 })
            .restore();
          ty3 += 16;
        }
      }
      y += phaseH + 12;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 10 — MEASURING SUCCESS
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("10", "Measuring Success");

    const ms = analysis?.measuringSuccess || {};
    const kpis = Array.isArray(ms.kpis) ? ms.kpis : [];

    // KPI table
    const kpiColW = [CONTENT_W * 0.34, CONTENT_W * 0.22, CONTENT_W * 0.22, CONTENT_W * 0.22];
    let kpiY = tableHeader(["Metric", "Now", "6 Months", "12 Months"], kpiColW, y);
    y = kpiY;

    for (let i = 0; i < kpis.length; i++) {
      const kpi = kpis[i];
      ensureSpace(22);
      y = tableRow([
        safeStr(kpi.metric),
        safeStr(kpi.now),
        safeStr(kpi.sixMonths),
        safeStr(kpi.twelveMonths),
      ], kpiColW, y, i % 2 === 1);
    }

    gapLine(16);

    // Competitor benchmark
    const bench = ms.competitorBenchmark || {};
    if (bench.name) {
      subHeading("Benchmark: What the Leader Has");
      doc
        .save()
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(C.blue)
        .text(safeStr(bench.name), ML, y)
        .restore();
      y += 14;
      const benchMetrics = Array.isArray(bench.metrics) ? bench.metrics : [];
      for (const m of benchMetrics) bulletItem(m, 10, C.darkGray);
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 11 — CONTENT BLUEPRINT
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("11", "Content Blueprint");

    const cb = analysis?.contentBlueprint || {};
    const cbItems = Array.isArray(cb.items) ? cb.items : [];

    subHeading("What the Leader Ranks For");
    if (cbItems.length > 0) {
      const cbColW = [CONTENT_W * 0.44, CONTENT_W * 0.28, CONTENT_W * 0.14, CONTENT_W * 0.14];
      let cbY = tableHeader(["Blog Post", "Top Keyword", "Vol", "Pos"], cbColW, y);
      y = cbY;

      for (let i = 0; i < cbItems.length; i++) {
        const item = cbItems[i];
        ensureSpace(22);
        y = tableRow([
          safeStr(item.blogPost),
          safeStr(item.topKeyword),
          safeStr(item.vol),
          safeStr(item.pos),
        ], cbColW, y, i % 2 === 1);
      }
    }

    gapLine(16);

    if (cb.pattern) {
      ensureSpace(60);
      doc.save().rect(ML, y, CONTENT_W, 52).fill(C.mediumNavy).restore();
      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor("#8aafd4")
        .text("THE PATTERN", ML + 12, y + 8, { characterSpacing: 1 })
        .restore();
      doc
        .save()
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(C.white)
        .text(safeStr(cb.pattern), ML + 12, y + 22, { width: CONTENT_W - 24 })
        .restore();
      y += 62;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 12 — UNCONTESTED TERRITORY
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("12", "Uncontested Territory");

    const ut = Array.isArray(analysis?.uncontestedTerritory) ? analysis.uncontestedTerritory : [];

    for (const item of ut) {
      ensureSpace(54);
      doc.save().rect(ML, y, CONTENT_W, 46).fill(C.lightBlueTint).restore();
      doc.save().rect(ML, y, 4, 46).fill(C.green).restore();

      doc
        .save()
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(item.service), ML + 12, y + 6, { width: CONTENT_W - 140 })
        .restore();
      doc
        .save()
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(C.green)
        .text(safeStr(item.volume), ML + CONTENT_W - 130, y + 6, { width: 125, align: "right" })
        .restore();
      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor(C.darkGray)
        .text(safeStr(item.note), ML + 12, y + 24, { width: CONTENT_W - 20 })
        .restore();
      y += 54;
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 13 — GEO AND AI VISIBILITY
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("13", "GEO and AI Visibility");

    const geoAi = analysis?.geoAiVisibility || {};

    // Citation counts
    ensureSpace(70);
    const citW = (CONTENT_W - 12) / 2;
    const citH = 60;

    doc.save().rect(ML, y, citW, citH).fill(C.lightBlueTint).restore();
    doc.save().rect(ML, y, 4, citH).fill(C.mediumGray).restore();
    doc
      .save()
      .fontSize(26)
      .font("Helvetica-Bold")
      .fillColor(C.darkNavy)
      .text(`${safeNum(geoAi.siteAiCitations, 0)}`, ML + 14, y + 6, { width: citW - 20 })
      .restore();
    doc
      .save()
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor(C.mediumGray)
      .text(`${domain} AI Citations`, ML + 14, y + 38, { width: citW - 20 })
      .restore();

    doc.save().rect(ML + citW + 12, y, citW, citH).fill(C.lightBlueTint).restore();
    doc.save().rect(ML + citW + 12, y, 4, citH).fill(C.blue).restore();
    doc
      .save()
      .fontSize(26)
      .font("Helvetica-Bold")
      .fillColor(C.blue)
      .text(safeStr(geoAi.topCompetitorCitations || "6+"), ML + citW + 26, y + 6, { width: citW - 20 })
      .restore();
    doc
      .save()
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor(C.mediumGray)
      .text(`${safeStr(geoAi.topCompetitorName || "Top Competitor")} Citations`, ML + citW + 26, y + 38, { width: citW - 20 })
      .restore();

    y += citH + 16;

    // Platforms row
    subHeading("AI Platforms to Target");
    const platforms = Array.isArray(geoAi.platforms) ? geoAi.platforms : [];
    const platW = CONTENT_W / Math.max(1, platforms.length);
    for (let i = 0; i < platforms.length; i++) {
      doc
        .save()
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(C.blue)
        .text(safeStr(platforms[i]), ML + i * platW, y, { width: platW, align: "center" })
        .restore();
    }
    y += 18;

    gapLine(10);
    subHeading("How To Earn AI Citations");
    const howToEarn = Array.isArray(geoAi.howToEarn) ? geoAi.howToEarn : [];
    for (const h of howToEarn) bulletItem(h, 10, C.darkGray);

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // SECTION 14 — QUICK WINS: 180-Day Action Plan
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("14", "Quick Wins: 180-Day Action Plan");

    const qw = analysis?.quickWins || {};
    const qwGroups = [
      { data: qw.week1to4, color: C.red },
      { data: qw.week5to8, color: C.amber },
      { data: qw.week9to16, color: C.blue },
      { data: qw.week16plus, color: C.green },
    ];

    for (const group of qwGroups) {
      if (!group.data) continue;
      ensureSpace(80);
      const groupH = 20 + (Array.isArray(group.data.tasks) ? group.data.tasks.length : 0) * 14 + 12;
      const safeGroupH = Math.max(60, Math.min(groupH, 120));

      doc.save().rect(ML, y, CONTENT_W, safeGroupH).fill(C.offWhite).restore();
      doc.save().rect(ML, y, 5, safeGroupH).fill(group.color).restore();

      doc
        .save()
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(group.color)
        .text(safeStr(group.data.label), ML + 14, y + 6, { width: CONTENT_W / 2 })
        .restore();
      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(C.mediumGray)
        .text(safeStr(group.data.theme), ML + 14 + CONTENT_W / 2, y + 7, { width: CONTENT_W / 2 - 20, align: "right" })
        .restore();

      let ty4 = y + 22;
      const tasks = Array.isArray(group.data.tasks) ? group.data.tasks : [];
      for (const task of tasks.slice(0, 6)) {
        doc.save().rect(ML + 14, ty4 + 3, 4, 4).fill(group.color).restore();
        doc
          .save()
          .fontSize(8.5)
          .font("Helvetica")
          .fillColor(C.darkGray)
          .text(safeStr(task), ML + 22, ty4, { width: CONTENT_W - 30 })
          .restore();
        ty4 += 14;
      }

      y = Math.max(y + safeGroupH + 10, ty4 + 10);
    }

    drawFooter();

    // ══════════════════════════════════════════════════════════════════════════
    // STRATEGIC PRIORITY STACK + CLOSING
    // ══════════════════════════════════════════════════════════════════════════
    newPage();
    sectionHeader("—", "Strategic Priority Stack");

    const sp = analysis?.strategicPriority || {};

    if (sp.assessment) {
      ensureSpace(60);
      doc.save().rect(ML, y, CONTENT_W, 52).fill(C.lightBlueTint).restore();
      doc
        .save()
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(sp.assessment), ML + 12, y + 10, { width: CONTENT_W - 24 })
        .restore();
      y += 62;
    }

    const priorities = Array.isArray(sp.priorities) ? sp.priorities : [];
    for (const p of priorities) {
      ensureSpace(36);
      doc.save().rect(ML, y, CONTENT_W, 28).fill(C.offWhite).restore();
      doc.save().circle(ML + 18, y + 14, 12).fill(C.darkNavy).restore();
      doc
        .save()
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(C.white)
        .text(`${safeNum(p.rank, "")}`, ML + 10, y + 8, { width: 16, align: "center" })
        .restore();
      doc
        .save()
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(C.darkNavy)
        .text(safeStr(p.action), ML + 36, y + 5, { width: CONTENT_W - 130 })
        .restore();
      doc
        .save()
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor(C.mediumGray)
        .text(safeStr(p.timeline), ML + CONTENT_W - 90, y + 8, { width: 86, align: "right" })
        .restore();
      y += 34;
    }

    gapLine(20);

    // Estimated traffic impact
    if (analysis?.estimatedTrafficImpact) {
      ensureSpace(50);
      doc.save().rect(ML, y, CONTENT_W, 42).fill(C.darkNavy).restore();
      doc
        .save()
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(C.amber)
        .text("Estimated Traffic Impact", ML + 12, y + 8)
        .restore();
      doc
        .save()
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(C.white)
        .text(safeStr(analysis.estimatedTrafficImpact), ML + 12, y + 22, { width: CONTENT_W - 24 })
        .restore();
      y += 52;
    }

    gapLine(30);

    // Dr.FIzz closing
    ensureSpace(80);
    doc.save().rect(ML - 45, y, PAGE_W, 80).fill(C.darkNavy).restore();
    doc
      .save()
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor(C.blue)
      .text("Dr.FIzz", ML, y + 16)
      .restore();
    doc
      .save()
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#6e8faa")
      .text("SEO Intelligence Platform  ·  Powered by Claude Opus 4.7", ML, y + 40)
      .restore();
    doc
      .save()
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor("#4a6a8a")
      .text(`Report generated: ${formatDate(analysis?.generatedAt)}  ·  Domain: ${domain}`, ML, y + 56)
      .restore();
    y += 90;

    drawFooter();
    doc.end();
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const domain = String(body?.domain || body?.url || "").trim();
    if (!domain) {
      return NextResponse.json({ error: "Missing domain" }, { status: 400 });
    }

    const analysis = body?.analysis || {};

    const pdfBuffer = await buildPdf(analysis, domain);

    const filename = `drfizz-seo-strategy-${domain.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[report/generate] error:", err);
    return NextResponse.json(
      { error: err?.message || "PDF generation failed" },
      { status: 500 }
    );
  }
}
