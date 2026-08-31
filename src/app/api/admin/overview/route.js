// GET /api/admin/overview  → admin-only: every user + their activity + stats.
// Optional ?userId=<id> focuses activity on one user.
import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie, usersCol, activityCol } from "@/lib/auth/session";
import { publicUser } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const sid = readSessionCookie(req);
  const found = sid ? await getSessionUser(sid) : null;
  if (!found) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((found.user.role || "user") !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const focusUserId = new URL(req.url).searchParams.get("userId");

  const uCol = await usersCol();
  const aCol = await activityCol();
  if (!uCol) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const rawUsers = await uCol
    .find({}, { projection: { passwordHash: 0, passwordSalt: 0 } })
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray();
  const users = rawUsers.map((u) => ({ ...publicUser(u), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt }));

  // per-user activity counts + last-active
  const counts = {};
  if (aCol) {
    try {
      const agg = await aCol.aggregate([{ $group: { _id: "$userId", n: { $sum: 1 }, last: { $max: "$at" } } }]).toArray();
      for (const r of agg) counts[String(r._id)] = { n: r.n, last: r.last };
    } catch {}
  }

  let activity = [];
  if (aCol) {
    const q = focusUserId ? { userId: String(focusUserId) } : {};
    const rows = await aCol.find(q).sort({ at: -1 }).limit(focusUserId ? 300 : 150).toArray();
    activity = rows.map((a) => ({
      id: String(a._id),
      userId: a.userId,
      email: a.email,
      type: a.type,
      detail: a.detail,
      path: a.path,
      at: a.at,
    }));
  }

  const usersOut = users.map((u) => ({
    ...u,
    activityCount: counts[u.id]?.n || 0,
    lastActive: counts[u.id]?.last || null,
  }));

  const stats = {
    totalUsers: usersOut.length,
    admins: usersOut.filter((u) => u.role === "admin").length,
    totalEvents: Object.values(counts).reduce((s, c) => s + (c.n || 0), 0),
  };

  return NextResponse.json(
    { ok: true, me: publicUser(found.user), users: usersOut, activity, stats },
    { headers: { "cache-control": "no-store" } }
  );
}
