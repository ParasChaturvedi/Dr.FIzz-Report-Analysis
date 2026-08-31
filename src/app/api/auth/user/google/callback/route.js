// GET /api/auth/user/google/callback  → finish Google login, create/find user,
// start a session, land the user on the app (Step 1 / AI chat).
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getUserOAuthClient } from "@/lib/auth/googleUser";
import { upsertGoogleUser, logActivity } from "@/lib/auth/users";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "df_user_oauth_state";

export async function GET(req) {
  const origin = new URL(req.url).origin;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");

  const fail = (reason) => {
    const res = NextResponse.redirect(`${origin}/?authError=${encodeURIComponent(reason)}`);
    res.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  };

  if (err) return fail(err);
  if (!code) return fail("missing_code");

  const stored = req.cookies.get(STATE_COOKIE)?.value;
  if (!stored || !state || stored !== state) return fail("invalid_state");

  let oauth;
  try { oauth = getUserOAuthClient(); } catch { return fail("google_not_configured"); }

  let profile = null;
  try {
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const me = await oauth2.userinfo.get();
    profile = me.data || null;
  } catch {
    return fail("google_exchange_failed");
  }
  if (!profile?.email) return fail("no_email");

  let user;
  try {
    user = await upsertGoogleUser({
      email: profile.email,
      name: profile.name,
      googleId: profile.id,
      avatar: profile.picture,
    });
  } catch {
    return fail("db_unavailable");
  }

  let session;
  try {
    session = await createSession(user._id, {
      ua: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for"),
    });
  } catch {
    return fail("session_failed");
  }

  await logActivity({ userId: user._id, email: user.email, type: "login", detail: "google", ua: req.headers.get("user-agent") });

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set(SESSION_COOKIE, session.id, sessionCookieOptions());
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
