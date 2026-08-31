// POST /api/auth/user/login  → verify email+password, start a session
import { NextResponse } from "next/server";
import { verifyEmailLogin, publicUser, touchLogin, logActivity } from "@/lib/auth/users";
import { emailProblem } from "@/lib/auth/password";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { email, password } = body || {};

  const ep = emailProblem(email);
  if (ep) return NextResponse.json({ error: ep }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Password is required." }, { status: 400 });

  let user;
  try {
    user = await verifyEmailLogin({ email, password });
  } catch {
    return NextResponse.json({ error: "Service temporarily unavailable. Please try again." }, { status: 503 });
  }
  // Generic message — never reveal whether the email exists.
  if (!user) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

  let session;
  try {
    session = await createSession(user._id, {
      ua: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for"),
    });
  } catch {
    return NextResponse.json({ error: "Could not start a session. Please try again." }, { status: 503 });
  }

  await touchLogin(user._id);
  await logActivity({ userId: user._id, email: user.email, type: "login", detail: "email", ua: req.headers.get("user-agent") });

  const res = NextResponse.json({ ok: true, user: publicUser(user) });
  res.cookies.set(SESSION_COOKIE, session.id, sessionCookieOptions());
  return res;
}
