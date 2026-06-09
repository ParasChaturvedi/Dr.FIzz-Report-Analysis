/**
 * POST /api/report/download-ppt
 *
 * Converts a Doctor Fizz report into a clear, executive-friendly PowerPoint deck
 * (slide-by-slide, plain language, business impact + actions). Fully data-driven
 * from the report's Stage-3 payload — works for any report.
 *
 * Body: { doctorFizz: <payload> }  OR  { data: { doctorFizz, ... } }
 * Returns: a .pptx binary download.
 */
import { buildExecutivePptBuffer } from "@/lib/report/executive-ppt";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeName(s) {
  return String(s || "report").replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const df = body?.doctorFizz || body?.data?.doctorFizz || body?.data || body || {};

    if (!df || !df.report_meta) {
      return new Response(JSON.stringify({ error: "Missing report data (doctorFizz payload required)" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const buffer = await buildExecutivePptBuffer(df);
    const name = safeName(df.report_meta?.domain || df.report_meta?.client_name) + "-Executive-Brief.pptx";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[download-ppt] Error:", err);
    return new Response(JSON.stringify({ error: "Failed to generate presentation", details: err?.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
