// src/lib/auth/session.js
// ─────────────────────────────────────────────────────────────────────────────
// Server-side sessions stored in MongoDB (reuses the existing pooled connection
// from src/lib/cache/mongo.js — no new DB wiring). The browser only holds an
// opaque, high-entropy random session id in an httpOnly cookie; the user record
// is looked up server-side on every request. This lets the admin see + revoke
// active sessions and keeps zero user data in the cookie.
//
// Collections (all created lazily, never touching the existing `data_cache`):
//   users          — one doc per account
//   auth_sessions  — one doc per active login (TTL auto-expires)
//   user_activity  — append-only activity trail for the admin panel
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from "crypto";
import { getCollection } from "@/lib/cache/mongo";

export const SESSION_COOKIE = "df_user";
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

export async function usersCol() {
  return getCollection("users");
}
export async function sessionsCol() {
  return getCollection("auth_sessions");
}
export async function activityCol() {
  return getCollection("user_activity");
}

let _indexesReady = false;
export async function ensureAuthIndexes() {
  if (_indexesReady) return;
  try {
    const u = await usersCol();
    if (u) await u.createIndex({ email: 1 }, { unique: true });
    const s = await sessionsCol();
    if (s) {
      await s.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-cleanup expired sessions
      await s.createIndex({ userId: 1 });
    }
    const a = await activityCol();
    if (a) await a.createIndex({ userId: 1, at: -1 });
    _indexesReady = true;
  } catch {
    /* index creation is best-effort; auth still works without it */
  }
}

async function toObjectId(id) {
  try {
    const { ObjectId } = await import("mongodb");
    return new ObjectId(String(id));
  } catch {
    return null;
  }
}

export async function createSession(userId, meta = {}) {
  await ensureAuthIndexes();
  const s = await sessionsCol();
  if (!s) throw new Error("DB unavailable");
  const id = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await s.insertOne({
    _id: id,
    userId: String(userId),
    createdAt: now,
    expiresAt,
    ua: meta.ua || null,
    ip: meta.ip || null,
  });
  return { id, expiresAt };
}

// Resolve a session id → { user, session } or null. Deletes the session if expired.
export async function getSessionUser(sessionId) {
  if (!sessionId) return null;
  try {
    const s = await sessionsCol();
    if (!s) return null;
    const sess = await s.findOne({ _id: sessionId });
    if (!sess) return null;
    if (sess.expiresAt && new Date(sess.expiresAt) < new Date()) {
      try { await s.deleteOne({ _id: sessionId }); } catch {}
      return null;
    }
    const u = await usersCol();
    if (!u) return null;
    let user = null;
    const oid = await toObjectId(sess.userId);
    if (oid) user = await u.findOne({ _id: oid });
    if (!user) user = await u.findOne({ _id: sess.userId }); // fallback if _id was stored as string
    return user ? { user, session: sess } : null;
  } catch {
    return null;
  }
}

export async function destroySession(sessionId) {
  if (!sessionId) return;
  try {
    const s = await sessionsCol();
    if (s) await s.deleteOne({ _id: sessionId });
  } catch {}
}

// httpOnly cookie options — secure in production / on https app URLs.
export function sessionCookieOptions(maxAgeSec = SESSION_MAX_AGE) {
  const secure =
    String(process.env.APP_URL || "").startsWith("https://") ||
    process.env.NODE_ENV === "production";
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: maxAgeSec };
}

// Read the session cookie value from a NextRequest.
export function readSessionCookie(req) {
  try {
    return req.cookies.get(SESSION_COOKIE)?.value || null;
  } catch {
    return null;
  }
}
