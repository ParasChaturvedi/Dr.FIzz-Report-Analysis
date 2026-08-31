// POST /api/auth/activity  → record one activity event for the logged-in user.
// Called by the client-side tracker in AuthGate (zero-touch on existing code).
import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/auth/session";
import { logActivity } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 300;
const clip = (s) => (s == null ? null : String(s).slice(0, MAX));

export async function POST(req) {
  const sid = readSessionCookie(req);
  if (!sid) return NextResponse.json({ ok: false }, { status: 401 });
  const found = await getSessionUser(sid);
  if (!found) return NextResponse.json({ ok: false }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}
  const { type, detail, path } = body || {};

  await logActivity({
    userId: found.user._id,
    email: found.user.email,
    type: clip(type) || "event",
    detail: clip(detail),
    path: clip(path),
    ua: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
