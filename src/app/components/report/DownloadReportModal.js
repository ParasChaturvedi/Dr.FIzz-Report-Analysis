"use client";

import { useState } from "react";

export default function DownloadReportModal({ domain, onClose }) {
  const [form, setForm]               = useState({ name: "", email: "", mobile: "", address: "", message: "" });
  const [errors, setErrors]           = useState({});
  const [downloading, setDownloading] = useState(false);
  const [done, setDone]               = useState(false);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email";
    if (!form.mobile.trim()) errs.mobile = "Mobile number is required";
    return errs;
  };

  // ── html2canvas fallback (localhost / dev only) ────────────────────────────
  // Used when running on localhost where ConvertAPI can't reach the URL.
  // globals.css has color-mix(in oklab) replaced with plain hex, so this
  // should render cleanly. onclone provides extra safety for any edge cases.
  const generateWithHtml2Canvas = async (element) => {
    // Make IntersectionObserver-animated sections fully visible before capture
    const hiddenEls = element.querySelectorAll(".opacity-0.translate-y-5");
    hiddenEls.forEach((el) => {
      el.style.opacity    = "1";
      el.style.transform  = "translateY(0)";
      el.style.transition = "none";
    });
    await new Promise((r) => setTimeout(r, 80));

    const [html2canvas, { jsPDF }] = await Promise.all([
      import("html2canvas").then((m) => m.default),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(element, {
      scale:           0.55,
      useCORS:         true,
      allowTaint:      true,
      logging:         false,
      windowWidth:     1200,
      scrollX:         0,
      scrollY:         0,
      backgroundColor: "#ffffff",
      onclone: (_doc) => {
        try {
          // Rewrite <style> tags — strip any lab()/oklab()/color-mix() values
          // so html2canvas CSS parser never crashes on them
          const fixColors = (css) =>
            css
              .replace(/color-mix\s*\(\s*in\s+oklab\s*,[^)]+\)/gi, (m) => {
                if (/var\(--panel\)/i.test(m))  return "#f3f4f6";
                if (/var\(--muted\)/i.test(m))  return "#6b7280";
                if (/var\(--border\)/i.test(m)) return "#d1d5db";
                return "#888888";
              })
              .replace(/\b(?:ok)?lab\s*\(\s*[\d.]+[^)]*\)/gi,  "#888888")
              .replace(/\b(?:ok)?lch\s*\(\s*[\d.]+[^)]*\)/gi,  "#888888");

          _doc.querySelectorAll("style").forEach((tag) => {
            const t = tag.textContent || "";
            if (t.includes("color-mix") || t.includes("oklab") || t.includes("lab(")) {
              tag.textContent = fixColors(t);
            }
          });

          // Belt-and-suspenders class overrides
          const s = _doc.createElement("style");
          s.textContent =
            ".bg-gray-50{background-color:#f3f4f6!important}" +
            ".text-gray-500{color:#6b7280!important}"         +
            ".border-gray-300{border-color:#d1d5db!important}";
          _doc.head.appendChild(s);
        } catch (_) {}
      },
    });

    hiddenEls.forEach((el) => {
      el.style.opacity    = "";
      el.style.transform  = "";
      el.style.transition = "";
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.90);
    const mmW     = canvas.width  * 0.2646;
    const mmH     = canvas.height * 0.2646;
    const pdf     = new jsPDF({ orientation: "portrait", unit: "mm", format: [mmW, mmH] });
    pdf.addImage(imgData, "JPEG", 0, 0, mmW, mmH);
    pdf.save(`ItzFizz-Report-${domain || "report"}-${Date.now()}.pdf`);
  };

  // ── ConvertAPI HTML→PDF (production) ─────────────────────────────────────
  // The browser inlines all <link rel="stylesheet"> CSS into <style> tags,
  // then sends a fully self-contained HTML document to the server.
  // ConvertAPI receives the HTML directly — no URL visit, no sessionStorage
  // dependency — so the report renders perfectly even on Vercel.
  const generateWithConvertAPI = async () => {
    // 1. Fetch and inline every linked stylesheet (same-origin fetch works fine)
    const linkEls  = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    const cssChunks = await Promise.all(
      linkEls.map(async (el) => {
        try {
          const href = el.getAttribute("href");
          if (!href || href.startsWith("data:")) return "";
          const absUrl = new URL(href, window.location.href).href;
          const r = await fetch(absUrl, { credentials: "same-origin" });
          return r.ok ? await r.text() : "";
        } catch { return ""; }
      })
    );

    // 2. Collect existing inline <style> tags from <head>
    const inlineStyles = Array.from(document.querySelectorAll("head style"))
      .map((s) => s.textContent || "")
      .join("\n");

    // 3. Get the rendered report content (element already has real data)
    const reportEl = document.getElementById("report-content");
    if (!reportEl) throw new Error("Report content element not found");

    // Make animated / intersection-observer-hidden elements visible before clone
    const hiddenEls     = Array.from(document.querySelectorAll(".opacity-0, [data-hidden='true']"));
    const transformEls  = Array.from(document.querySelectorAll("[style*='translateY']"));
    hiddenEls.forEach   ((el) => { el._bak = el.style.opacity;    el.style.opacity    = "1";    });
    transformEls.forEach((el) => { el._bak = el.style.transform;  el.style.transform  = "none"; });

    const reportHtml = reportEl.outerHTML;

    // Restore
    hiddenEls.forEach   ((el) => { el.style.opacity    = el._bak || ""; delete el._bak; });
    transformEls.forEach((el) => { el.style.transform  = el._bak || ""; delete el._bak; });

    // 4. PDF-specific overrides — clean layout, no animations, exact colours
    const pdfOverrides = [
      /* 1 – Colour accuracy */
      "* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-scheme: light !important; }",

      /* 2 – Body reset */
      "html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }",

      /* 3 – Kill all CSS motion so nothing stays invisible */
      "* { transition: none !important; animation: none !important; }",
      ".opacity-0 { opacity: 1 !important; }",
      ".translate-y-5, .translate-y-8 { transform: none !important; }",
      "[style*='opacity: 0'] { opacity: 1 !important; }",
      "[style*='translateY'] { transform: none !important; }",

      /* 4 – Hide fixed / sticky browser chrome */
      ".fixed { display: none !important; }",
      "[class*='sticky'] { position: static !important; }",

      /* 5 – Compact section padding for PDF (py-16 = 4 rem → 2 rem) */
      "#report-content section { padding-top: 2rem !important; padding-bottom: 2rem !important; }",

      /* 6 – Cover page: keep full viewport height + hard page break after */
      "#report-content section:first-child { padding-top: 0 !important; padding-bottom: 0 !important; min-height: 100vh !important; page-break-after: always !important; break-after: page !important; }",

      /* 7 – Content sections: remove artificial min-height */
      "#report-content section:not(:first-child) { min-height: 0 !important; }",

      /* 8 – Tables: never break mid-row */
      "table { page-break-inside: avoid !important; break-inside: avoid !important; width: 100% !important; }",
      "thead { display: table-header-group !important; }",
      "tr { page-break-inside: avoid !important; break-inside: avoid !important; }",

      /* 9 – Cards and grid items: never break mid-card */
      ".rounded-xl { page-break-inside: avoid !important; break-inside: avoid !important; }",
      ".rounded-r-xl { page-break-inside: avoid !important; break-inside: avoid !important; }",
      ".grid > div { page-break-inside: avoid !important; break-inside: avoid !important; }",
      "li { page-break-inside: avoid !important; break-inside: avoid !important; }",

      /* 10 – Section headings stay with the next element */
      "h1, h2 { page-break-after: avoid !important; break-after: avoid !important; }",

    ].join("\n");

    // 5. Assemble completely self-contained HTML document
    // Note: viewport width 1280 ensures md: breakpoint classes (≥768px) apply,
    // giving the wider px-14 side padding instead of the mobile px-8.
    const htmlDoc = [
      "<!DOCTYPE html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="UTF-8" />',
      '<meta name="viewport" content="width=1280, initial-scale=1.0" />',
      "<title>ItzFizz Intelligence Report</title>",
      `<style>${cssChunks.join("\n")}</style>`,
      `<style>${inlineStyles}</style>`,
      `<style>${pdfOverrides}</style>`,
      "</head>",
      '<body class="bg-white">',
      reportHtml,
      "</body>",
      "</html>",
    ].join("\n");

    // 6. POST self-contained HTML to our server → ConvertAPI HTML→PDF
    const resp = await fetch("/api/report/download-pdf", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ htmlContent: htmlDoc, domain }),
    });

    if (!resp.ok) {
      let msg = "PDF generation failed.";
      try { const j = await resp.json(); msg = j.error || msg; } catch (_) {}
      throw new Error(msg);
    }

    const blob   = await resp.blob();
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href     = url;
    anchor.download = `ItzFizz-Report-${domain || "report"}-${Date.now()}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  // ── Main submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setDownloading(true);

    // Save lead — fire-and-forget
    fetch("/api/leads/save", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:      form.name,   email:   form.email,
        mobile:    form.mobile, address: form.address,
        message:   form.message, domain,
        reportUrl: window.location.href,
      }),
    }).catch(() => {});

    try {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      if (isLocalhost) {
        // Dev: html2canvas (ConvertAPI can't reach localhost)
        const el = document.getElementById("report-content");
        if (!el) throw new Error("Report content not found");
        await generateWithHtml2Canvas(el);
      } else {
        // Production: ConvertAPI Web→PDF — real Chrome, perfect quality
        await generateWithConvertAPI();
      }

      setDone(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      console.error("[DownloadReportModal]", err);
      alert(`PDF generation failed: ${err?.message || "unknown error"}. Please try again.`);
    } finally {
      setDownloading(false);
    }
  };

  const field = (key, label, type = "text", required = false, placeholder = "") => (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d45427]/30 ${
          errors[key] ? "border-red-400 bg-red-50 dark:bg-red-900/20" : "border-gray-200 bg-white"
        }`}
      />
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gray-950 text-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-1">ItzFizz Digital</div>
              <h2 className="text-lg font-black">Download Your Report</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-800 grid place-items-center hover:bg-gray-700 transition-colors">
              <svg width="14" height="14" fill="white" viewBox="0 0 20 20">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Fill in your details to download your personalised intelligence report.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
          {done ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 grid place-items-center mx-auto mb-3 text-2xl">✓</div>
              <div className="font-bold text-gray-900 mb-1">Download Started!</div>
              <p className="text-xs text-gray-500">Your report is downloading. Check your Downloads folder.</p>
            </div>
          ) : (
            <>
              {field("name",    "Full Name",        "text",  true,  "John Smith")}
              {field("email",   "Email Address",    "email", true,  "john@company.com")}
              {field("mobile",  "Mobile Number",    "tel",   true,  "+91 98765 43210")}
              {field("address", "Business Address", "text",  false, "123 Main St, City")}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Message (optional)</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  rows={3}
                  placeholder="Any specific goals or questions?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#d45427]/30 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-gradient-to-r from-[#d45427] to-[#ffa615] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {downloading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Generating PDF…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
                    </svg>
                    Download PDF Report
                  </>
                )}
              </button>

              <p className="text-[10px] text-gray-400 text-center">
                By downloading, you agree to be contacted by ItzFizz Digital regarding SEO services.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
