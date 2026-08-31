// POST /api/auth/user/signup  → create an email account + start a session
import { NextResponse } from "next/server";
import { createEmailUser, publicUser, logActivity } from "@/lib/auth/users";
import { emailProblem, passwordProblem } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { email, password, name, newsletter } = body || {};

  const ep = emailProblem(email);
  if (ep) return NextResponse.json({ error: ep }, { status: 400 });
  const pp = passwordProblem(password);
  if (pp) return NextResponse.json({ error: pp }, { status: 400 });

  let result;
  try {
    result = await createEmailUser({ email, password, name, newsletter });
  } catch {
    return NextResponse.json({ error: "Service temporarily unavailable. Please try again." }, { status: 503 });
  }
  if (result?.error === "exists") {
    return NextResponse.json({ error: "An account with this email already exists. Please log in instead." }, { status: 409 });
  }

  const user = result.user;
  let session;
  try {
    session = await createSession(user._id, {
      ua: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for"),
    });
  } catch {
    return NextResponse.json({ error: "Could not start a session. Please try again." }, { status: 503 });
  }

  await logActivity({ userId: user._id, email: user.email, type: "signup", detail: "email", ua: req.headers.get("user-agent") });

  const res = NextResponse.json({ ok: true, user: publicUser(user) });
  res.cookies.set(SESSION_COOKIE, session.id, sessionCookieOptions());
  return res;
}
