import { NextResponse } from "next/server";
import { readTokensFromRequest } from "@/lib/tokenStore";

export const runtime = "nodejs";

export async function GET(req) {
  const saved = readTokensFromRequest(req);

  return NextResponse.json({
    connected: !!saved?.refresh_token || !!saved?.access_token,
    email: saved?.google_email || null,
    hasRefreshToken: !!saved?.refresh_token,
  });
}
