// GET /api/auth/user/me  → who is logged in (used by the AuthGate on load)
import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/auth/session";
import { publicUser } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const sid = readSessionCookie(req);
  if (!sid) return NextResponse.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  const found = await getSessionUser(sid);
  if (!found) return NextResponse.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  return NextResponse.json(
    { authenticated: true, user: publicUser(found.user) },
    { headers: { "cache-control": "no-store" } }
  );
}
