// POST /api/auth/user/forgot  → create a password-reset token.
// NOTE: no email provider is wired yet, so delivery is a follow-up. The token
// mechanism is fully built: in dev we return the reset link for testing; in prod
// we log it server-side and return a generic message. Drop in an email sender
// (Resend/SMTP) at the marked spot to enable delivery.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { findByEmail } from "@/lib/auth/users";
import { getCollection } from "@/lib/cache/mongo";
import { emailProblem } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const { email } = body || {};

  const ep = emailProblem(email);
  if (ep) return NextResponse.json({ error: ep }, { status: 400 });

  // Always the same response shape → never reveals whether an account exists.
  const generic = { ok: true, message: "If an account with that email exists, we've sent reset instructions." };

  let user = null;
  try { user = await findByEmail(email); } catch {}
  if (!user || !user.passwordHash) return NextResponse.json(generic);

  const token = crypto.randomBytes(32).toString("hex");
  let link = null;
  const col = await getCollection("password_resets");
  if (col) {
    try {
      await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
      await col.insertOne({
        token,
        userId: String(user._id),
        email: user.email,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60000),
        used: false,
      });
      link = `${new URL(req.url).origin}/?reset=${token}`;
    } catch {}
  }

  // ── EMAIL DELIVERY HOOK ──────────────────────────────────────────────
  // if (process.env.RESEND_API_KEY && link) await sendResetEmail(user.email, link);
  try { console.log("[auth] password reset link for", user.email, "=>", link); } catch {}

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd && link) return NextResponse.json({ ...generic, devResetLink: link });
  return NextResponse.json(generic);
}
