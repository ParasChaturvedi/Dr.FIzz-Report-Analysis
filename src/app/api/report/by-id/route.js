// GET /api/report/by-id?id=<uuid>
// Durable report read: fetches a generated report by its UUID from the 30-day MongoDB store
// (written by generate-analysis under dataType "report-by-id"). This makes /report/{id} survive a
// refresh, a new browser tab, or a shared link — the report page falls back here when the per-tab
// sessionStorage copy is missing. Returns { id, reportType, data } or 404.
import { getCached } from "@/lib/cache/mongo";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    const rec = await getCached({ domain: id, dataType: "report-by-id", ttlDays: 30 });
    if (rec && rec.data) {
      return Response.json({ id: rec.id || id, reportType: rec.reportType, data: rec.data });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
