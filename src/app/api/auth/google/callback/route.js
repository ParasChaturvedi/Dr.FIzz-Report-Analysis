import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuthClient } from "@/lib/googleOAuth";
import { setTokensCookie } from "@/lib/tokenStore";

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

function addConnectedParam(pathWithQueryAndHash) {
  try {
    const [pathAndQuery, hash = ""] = pathWithQueryAndHash.split("#");
    const u = new URL(pathAndQuery, "https://local");
    u.searchParams.set("connected", "1");
    const newHash = hash || "dashboard";
    return `${u.pathname}${u.search}#${newHash}`;
  } catch {
    return "/settings/analytics?connected=1#dashboard";
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");

  if (err) {
    return NextResponse.redirect(
      `${process.env.APP_URL}/settings/analytics?error=${encodeURIComponent(err)}#dashboard`
    );
  }

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const storedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!storedState || !state || storedState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  let profile = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    profile = me.data || null;
  } catch {}

  const payloadToStore = {
    refresh_token: tokens.refresh_token || null,
    access_token: tokens.access_token || null,
    expiry_date: tokens.expiry_date || null,
    scope: tokens.scope || null,
    token_type: tokens.token_type || null,
    google_email: profile?.email || null,
  };

  const returnToCookie = req.cookies.get(RETURN_TO_COOKIE)?.value || "";
  const returnTo = addConnectedParam(safeReturnTo(returnToCookie));

  const res = NextResponse.redirect(`${process.env.APP_URL}${returnTo}`);

  setTokensCookie(res, payloadToStore);

  res.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set(RETURN_TO_COOKIE, "", {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}
