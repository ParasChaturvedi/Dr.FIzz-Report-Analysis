/**
 * POST /api/report/download-pdf
 *
 * Primary flow  (production): browser inlines all CSS and sends a fully
 * self-contained HTML document → we forward it to ConvertAPI HTML→PDF.
 * No URL visit needed, so sessionStorage restrictions don't apply.
 *
 * Fallback flow (legacy / web): if only a reportUrl is provided we fall back
 * to ConvertAPI Web→PDF (kept for compatibility, not used by current client).
 *
 * Body:
 *   { htmlContent: string, domain?: string }   ← primary (HTML→PDF)
 *   { reportUrl:   string, domain?: string }   ← legacy  (Web→PDF)
 *
 * Returns: application/pdf binary stream
 */

export const maxDuration = 60; // Vercel: allow up to 60 s

export async function POST(req) {
  try {
    const body                            = await req.json();
    const { reportUrl, htmlContent, domain } = body;

    const secret = process.env.CONVERTAPI_SECRET;
    if (!secret) {
      return Response.json(
        { error: "CONVERTAPI_SECRET is not configured on the server." },
        { status: 500 }
      );
    }

    let convertResp;

    // ── Primary: HTML→PDF (browser-inlined CSS, no URL needed) ───────────────
    if (htmlContent) {
      const htmlBase64 = Buffer.from(htmlContent, "utf-8").toString("base64");

      convertResp = await fetch(
        `https://v2.convertapi.com/convert/html/to/pdf?Secret=${secret}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Parameters: [
              // Send the self-contained HTML as a base64-encoded file
              {
                Name:      "File",
                FileValue: { Name: "report.html", Data: htmlBase64 },
              },

              // Page layout
              { Name: "PageSize",        Value: "A4"    },
              { Name: "MarginTop",       Value: "0"     },
              { Name: "MarginBottom",    Value: "0"     },
              { Name: "MarginLeft",      Value: "0"     },
              { Name: "MarginRight",     Value: "0"     },

              // Render full page (not just viewport height)
              { Name: "FullPage",        Value: "true"  },

              // Render background colours / gradients correctly
              { Name: "PrintBackground", Value: "true"  },
            ],
          }),
        }
      );

    // ── Fallback: Web→PDF (legacy — ConvertAPI visits the live URL) ───────────
    } else if (reportUrl) {
      convertResp = await fetch(
        `https://v2.convertapi.com/convert/web/to/pdf?Secret=${secret}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Parameters: [
              { Name: "Url",                Value: reportUrl },
              { Name: "PageSize",           Value: "A4"      },
              { Name: "MarginTop",          Value: "0"       },
              { Name: "MarginBottom",       Value: "0"       },
              { Name: "MarginLeft",         Value: "0"       },
              { Name: "MarginRight",        Value: "0"       },
              { Name: "FullPage",           Value: "true"    },
              { Name: "PrintBackground",    Value: "true"    },
              { Name: "WaitForNetworkIdle", Value: "true"    },
              { Name: "WaitTime",           Value: "6"       },
              {
                Name:  "CssText",
                Value: [
                  ".fixed.bottom-0 { display: none !important; }",
                  ".h-24 { height: 0 !important; }",
                  ".opacity-0 { opacity: 1 !important; }",
                  ".translate-y-5 { transform: none !important; }",
                ].join(" "),
              },
            ],
          }),
        }
      );

    } else {
      return Response.json(
        { error: "Either htmlContent or reportUrl is required." },
        { status: 400 }
      );
    }

    // ── Handle ConvertAPI response ─────────────────────────────────────────────
    if (!convertResp.ok) {
      const errText = await convertResp.text();
      console.error("[download-pdf] ConvertAPI error:", convertResp.status, errText);
      return Response.json(
        { error: `ConvertAPI returned ${convertResp.status}: ${errText}` },
        { status: 502 }
      );
    }

    const data     = await convertResp.json();
    const fileData = data?.Files?.[0]?.FileData;

    if (!fileData) {
      console.error("[download-pdf] No FileData in response:", JSON.stringify(data));
      return Response.json({ error: "ConvertAPI returned no file data." }, { status: 502 });
    }

    // Decode base64 → buffer → stream back as PDF download
    const pdfBuffer  = Buffer.from(fileData, "base64");
    const safeDomain = (domain || "report").replace(/[^a-z0-9.-]/gi, "_");
    const filename   = `ItzFizz-Report-${safeDomain}-${Date.now()}.pdf`;

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(pdfBuffer.byteLength),
      },
    });

  } catch (err) {
    console.error("[download-pdf] Unexpected error:", err);
    return Response.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
