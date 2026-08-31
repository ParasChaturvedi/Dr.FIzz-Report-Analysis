// src/lib/auth/googleUser.js
// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth client for USER LOGIN — deliberately SEPARATE from the existing
// GA4/GSC data-connect client in src/lib/googleOAuth.js so that flow is never
// touched. Reuses the same GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET but a distinct
// redirect URI and requests only identity scopes (openid/email/profile).
//
// One-time console step: add `${APP_URL}/api/auth/user/google/callback` to the
// OAuth client's Authorized redirect URIs. Email/password login needs no config.
// ─────────────────────────────────────────────────────────────────────────────
import { google } from "googleapis";

export function getUserOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_URL env vars");
  }
  return new google.auth.OAuth2(clientId, clientSecret, `${appUrl}/api/auth/user/google/callback`);
}

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
}
