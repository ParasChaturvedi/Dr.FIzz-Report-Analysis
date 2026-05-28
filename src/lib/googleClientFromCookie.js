import { google } from "googleapis";
import { getOAuthClient } from "@/lib/googleOAuth";
import { readTokensFromRequest } from "@/lib/tokenStore";

export async function getAuthedGoogleClient(req) {
  const saved = readTokensFromRequest(req);

  if (!saved?.refresh_token) {
    throw new Error("Google not connected");
  }

  const oauth2Client = getOAuthClient();

  oauth2Client.setCredentials({
    refresh_token: saved.refresh_token,
  });

  // This will auto-refresh access token when needed
  await oauth2Client.getAccessToken();

  return oauth2Client;
}
