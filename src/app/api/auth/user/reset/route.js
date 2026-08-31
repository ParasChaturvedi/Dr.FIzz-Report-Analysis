// POST /api/auth/user/reset  → set a new password using a valid reset token.
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/cache/mongo";
import { usersCol } from "@/lib/auth/session";
import { hashPassword, passwordProblem } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { token, password } = body || {};

  if (!token) return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  const pp = passwordProblem(password);
  if (pp) return NextResponse.json({ error: pp }, { status: 400 });

  const col = await getCollection("password_resets");
  if (!col) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const rec = await col.findOne({ token });
  if (!rec || rec.used || (rec.expiresAt && new Date(rec.expiresAt) < new Date())) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const u = await usersCol();
  if (!u) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const { salt, hash } = hashPassword(password);
  try {
    const { ObjectId } = await import("mongodb");
    let q;
    try { q = { _id: new ObjectId(String(rec.userId)) }; } catch { q = { _id: rec.userId }; }
    await u.updateOne(q, { $set: { passwordSalt: salt, passwordHash: hash, updatedAt: new Date() } });
    await col.updateOne({ token }, { $set: { used: true, usedAt: new Date() } });
  } catch {
    return NextResponse.json({ error: "Could not reset password." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Password updated. You can now log in." });
}
