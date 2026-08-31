// POST /api/auth/user/logout  → destroy the session + clear the cookie
import { NextResponse } from "next/server";
import { destroySession, readSessionCookie, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const sid = readSessionCookie(req);
  if (sid) {
    try { await destroySession(sid); } catch {}
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}
