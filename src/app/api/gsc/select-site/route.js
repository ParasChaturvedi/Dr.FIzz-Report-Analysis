import { NextResponse } from "next/server";
import { updateTokensCookie } from "@/lib/tokenStore";

export const runtime = "nodejs";

export async function POST(req) {
  const body = await req.json();
  const { siteUrl } = body;

  if (!siteUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing siteUrl" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true });

  updateTokensCookie(req, res, {
    gsc_site: siteUrl,
  });

  return res;
}
