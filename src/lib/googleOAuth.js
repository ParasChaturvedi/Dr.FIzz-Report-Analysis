import { google } from "googleapis";

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_URL env vars");
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${appUrl}/api/auth/google/callback`
  );
}
