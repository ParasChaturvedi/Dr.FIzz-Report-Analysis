import { NextResponse } from "next/server";
import { updateTokensCookie } from "@/lib/tokenStore";

export const runtime = "nodejs";

export async function POST(req) {
  const body = await req.json();
  const { propertyId } = body;

  if (!propertyId) {
    return NextResponse.json(
      { ok: false, error: "Missing propertyId" },
      { status: 400 }
    );
  }

  const res = NextResponse.json({ ok: true });

  updateTokensCookie(req, res, {
    ga4_property_id: propertyId,
  });

  return res;
}
