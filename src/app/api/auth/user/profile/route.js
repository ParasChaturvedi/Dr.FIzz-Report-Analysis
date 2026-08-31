// POST /api/auth/user/profile  → update the signed-in user's name and/or avatar.
// Avatar is stored as a small data-URL (client resizes to 256px) so no external
// file storage is needed.
import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie, usersCol } from "@/lib/auth/session";
import { publicUser } from "@/lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AVATAR = 900000; // ~675 KB of base64 — plenty for a 256px avatar

export async function POST(req) {
  const sid = readSessionCookie(req);
  const found = sid ? await getSessionUser(sid) : null;
  if (!found) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}
  const { name, avatar } = body || {};

  const set = { updatedAt: new Date() };

  if (typeof name === "string") {
    const n = name.trim();
    if (n.length < 1 || n.length > 60) return NextResponse.json({ error: "Name must be 1–60 characters." }, { status: 400 });
    set.name = n;
  }
  if (avatar !== undefined) {
    if (avatar === null || avatar === "") {
      set.avatar = null;
    } else if (typeof avatar === "string" && avatar.startsWith("data:image/")) {
      if (avatar.length > MAX_AVATAR) return NextResponse.json({ error: "Image is too large. Please choose a smaller one." }, { status: 400 });
      set.avatar = avatar;
    } else {
      return NextResponse.json({ error: "Invalid image." }, { status: 400 });
    }
  }
  if (Object.keys(set).length === 1) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const u = await usersCol();
  if (!u) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  try {
    await u.updateOne({ _id: found.user._id }, { $set: set });
  } catch {
    return NextResponse.json({ error: "Could not save changes." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user: publicUser({ ...found.user, ...set }) });
}
