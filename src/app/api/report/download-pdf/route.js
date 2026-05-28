/**
 * POST /api/report/download-pdf
 *
 * Generates a PDF via ConvertAPI Web→PDF (real Chrome renders the live URL).
 * ✅ Production / Vercel — works perfectly (URL is public)
 * ❌ localhost — URL not reachable by ConvertAPI; frontend falls back to html2canvas
 *
 * Body:  { reportUrl: string, domain: string }
 * Returns: application/pdf binary stream
 */

export const maxDuration = 60; // Vercel: allow up to 60 s

export async function POST(req) {
  try {
    const { reportUrl, domain } = await req.json();

    if (!reportUrl) {
      return Response.json({ error: "reportUrl is required" }, { status: 400 });
    }

    const secret = process.env.CONVERTAPI_SECRET;
    if (!secret) {
      return Response.json(
        { error: "CONVERTAPI_SECRET is not configured on the server." },
        { status: 500 }
      );
    }

    // ── ConvertAPI Web → PDF (real headless Chrome) ───────────────────────────
    const convertResp = await fetch(
      `https://v2.convertapi.com/convert/web/to/pdf?Secret=${secret}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Parameters: [
            { Name: "Url",                Value: reportUrl  },

            // Page layout — no margins so report fills the page
            { Name: "PageSize",           Value: "A4"       },
            { Name: "PageOrientation",    Value: "Portrait" },
            { Name: "MarginTop",          Value: "0"        },
            { Name: "MarginBottom",       Value: "0"        },
            { Name: "MarginLeft",         Value: "0"        },
            { Name: "MarginRight",        Value: "0"        },

            // Capture full page height (not just viewport)
            { Name: "FullPage",           Value: "true"     },

            // Render backgrounds / dark sections correctly
            { Name: "PrintBackground",    Value: "true"     },

            // Wait for all SSE data + lazy sections to render
            { Name: "WaitForNetworkIdle", Value: "true"     },
            { Name: "WaitTime",           Value: "6"        },

            // Inject CSS to hide the sticky bottom action bar in the PDF
            {
              Name:  "CssText",
              Value: [
                ".fixed.bottom-0 { display: none !important; }",
                ".h-24 { height: 0 !important; }",
                // Ensure animated sections are visible
                ".opacity-0 { opacity: 1 !important; }",
                ".translate-y-5 { transform: none !important; }",
              ].join(" "),
            },
          ],
        }),
      }
    );

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

    // Decode base64 → binary → stream back as PDF download
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
