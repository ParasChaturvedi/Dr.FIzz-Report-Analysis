// POST /api/admin/user-update  → admin-only: set a user's credits and/or role.
// Body: { userId, credits?, role? }.  (Credit gating itself is a later phase.)
import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie, usersCol } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const sid = readSessionCookie(req);
  const found = sid ? await getSessionUser(sid) : null;
  if (!found) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((found.user.role || "user") !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body = {};
  try { body = await req.json(); } catch {}
  const { userId, credits, role } = body || {};
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const u = await usersCol();
  if (!u) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const set = { updatedAt: new Date() };
  if (credits != null && !Number.isNaN(Number(credits))) set.credits = Math.max(0, Math.floor(Number(credits)));
  if (role === "user" || role === "admin") set.role = role;
  if (Object.keys(set).length === 1) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    const { ObjectId } = await import("mongodb");
    let q;
    try { q = { _id: new ObjectId(String(userId)) }; } catch { q = { _id: userId }; }
    await u.updateOne(q, { $set: set });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await logActivity({
    userId: found.user._id,
    email: found.user.email,
    type: "admin",
    detail: `updated user ${userId} → ${JSON.stringify(set)}`,
  });
  return NextResponse.json({ ok: true });
}
