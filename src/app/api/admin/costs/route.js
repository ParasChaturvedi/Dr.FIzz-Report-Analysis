// GET /api/admin/costs  → admin-only realtime cost per domain from usage_log.
// Aggregates the REAL logged Claude + API cost per domain over the window, in INR
// at USD_INR (default Rs 100). NOTE: the GEO scan ENGINE runs on the VPS worker and
// does not write to usage_log, so its cost is not counted here yet (app-side only).
import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/auth/session";
import { getCollection } from "@/lib/cache/mongo";
import { USD_INR } from "@/lib/cache/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const sid = readSessionCookie(req);
  const found = sid ? await getSessionUser(sid) : null;
  if (!found) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((found.user.role || "user") !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const days = Math.min(Number(new URL(req.url).searchParams.get("days")) || 30, 90);
  const empty = { ok: true, rate: USD_INR, days, count: 0, totals: { inr: 0, claudeINR: 0, apiINR: 0, calls: 0, avgINR: 0 }, domains: [] };

  const col = await getCollection("usage_log");
  if (!col) return NextResponse.json(empty, { headers: { "cache-control": "no-store" } });

  const since = new Date(Date.now() - days * 86400000);
  let rows = [];
  try {
    rows = await col.aggregate([
      { $match: { at: { $gte: since } } },
      { $group: {
        _id: "$domain",
        totalUSD: { $sum: "$cost_usd" },
        claudeUSD: { $sum: { $cond: [{ $eq: ["$kind", "claude"] }, "$cost_usd", 0] } },
        apiUSD: { $sum: { $cond: [{ $ne: ["$kind", "claude"] }, "$cost_usd", 0] } },
        calls: { $sum: 1 },
        last: { $max: "$at" },
      } },
      { $sort: { totalUSD: -1 } },
      { $limit: 200 },
    ]).toArray();
  } catch {
    return NextResponse.json(empty, { headers: { "cache-control": "no-store" } });
  }

  const inr = (u) => Math.round((Number(u) || 0) * USD_INR);
  const domains = rows.filter((r) => r._id).map((r) => ({
    domain: r._id,
    inr: inr(r.totalUSD),
    claudeINR: inr(r.claudeUSD),
    apiINR: inr(r.apiUSD),
    usd: Math.round((r.totalUSD || 0) * 1000) / 1000,
    calls: r.calls,
    last: r.last,
  }));

  const totals = domains.reduce(
    (t, d) => ({ inr: t.inr + d.inr, claudeINR: t.claudeINR + d.claudeINR, apiINR: t.apiINR + d.apiINR, calls: t.calls + d.calls }),
    { inr: 0, claudeINR: 0, apiINR: 0, calls: 0 }
  );
  totals.avgINR = domains.length ? Math.round(totals.inr / domains.length) : 0;

  return NextResponse.json({ ok: true, rate: USD_INR, days, count: domains.length, totals, domains },
    { headers: { "cache-control": "no-store" } });
}
