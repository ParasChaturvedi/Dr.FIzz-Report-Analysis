import { NextResponse } from "next/server";
import crypto from "crypto";
import { getOAuthClient } from "@/lib/googleOAuth";

export const runtime = "nodejs";

const STATE_COOKIE = "df_oauth_state";
const RETURN_TO_COOKIE = "df_oauth_returnTo";

function safeReturnTo(raw) {
  if (!raw) return "/settings/analytics#dashboard";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/")) return decoded;
  } catch {}
  return "/settings/analytics#dashboard";
}

export async function GET(req) {
  const oauth2Client = getOAuthClient();
  const { searchParams } = new URL(req.url);

  const returnTo = safeReturnTo(searchParams.get("returnTo") || "");

  const scopes = [
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/webmasters.readonly",
    "openid",
    "email",
    "profile",
  ];

  const state = crypto.randomBytes(24).toString("hex");

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
    include_granted_scopes: true,
  });

  const res = NextResponse.redirect(url);

  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  res.cookies.set(RETURN_TO_COOKIE, encodeURIComponent(returnTo), {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
