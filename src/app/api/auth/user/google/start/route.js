// GET /api/auth/user/google/start  → begin Google login (identity scopes only).
// Separate from /api/auth/google/* (GA4/GSC data-connect) which stays untouched.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserOAuthClient } from "@/lib/auth/googleUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "df_user_oauth_state";

export async function GET(req) {
  const origin = new URL(req.url).origin;
  let oauth;
  try {
    oauth = getUserOAuthClient();
  } catch {
    return NextResponse.redirect(`${origin}/?authError=google_not_configured`);
  }

  const state = crypto.randomBytes(24).toString("hex");
  const url = oauth.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
    include_granted_scopes: true,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: String(process.env.APP_URL || "").startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
