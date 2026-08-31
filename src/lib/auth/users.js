// src/lib/auth/users.js
// ─────────────────────────────────────────────────────────────────────────────
// User accounts + roles + activity logging.
//
// ROLES: "user" (normal tool access) and "admin" (full access + sees every user
// and what they did + credits). An email is an admin iff it is listed in the
// ADMIN_EMAILS env (comma-separated). Defaults to info@itzfizz.com so the owner
// has admin out of the box; override via env in Vercel any time.
//
// CREDITS: scaffolded now (a number per user). Admins get effectively-unlimited
// credits. The "spend credits to use the tool" gating is a later phase — the
// field + admin controls are in place so it's a drop-in.
// ─────────────────────────────────────────────────────────────────────────────
import { usersCol, activityCol } from "./session";
import { hashPassword, verifyPassword } from "./password";

export const norm = (e) => String(e || "").trim().toLowerCase();

export function adminEmails() {
  const raw = process.env.ADMIN_EMAILS || "info@itzfizz.com";
  return new Set(raw.split(",").map(norm).filter(Boolean));
}
export function roleFor(email) {
  return adminEmails().has(norm(email)) ? "admin" : "user";
}

export const DEFAULT_CREDITS = Number(process.env.DEFAULT_USER_CREDITS || 100);
const ADMIN_CREDITS = 999999;

export async function findByEmail(email) {
  const u = await usersCol();
  if (!u) return null;
  return u.findOne({ email: norm(email) });
}

export async function createEmailUser({ email, password, name, newsletter }) {
  const u = await usersCol();
  if (!u) throw new Error("DB unavailable");
  const e = norm(email);
  const existing = await u.findOne({ email: e });
  if (existing) return { error: "exists" };
  const { salt, hash } = hashPassword(password);
  const now = new Date();
  const role = roleFor(e);
  const doc = {
    email: e,
    name: name || e.split("@")[0],
    passwordSalt: salt,
    passwordHash: hash,
    provider: "email",
    googleId: null,
    avatar: null,
    role,
    credits: role === "admin" ? ADMIN_CREDITS : DEFAULT_CREDITS,
    newsletter: !!newsletter,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
  try {
    const r = await u.insertOne(doc);
    return { user: { ...doc, _id: r.insertedId } };
  } catch (err) {
    // unique-index race → account already exists
    if (String(err?.code) === "11000") return { error: "exists" };
    throw err;
  }
}

export async function verifyEmailLogin({ email, password }) {
  const user = await findByEmail(email);
  if (!user || !user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) return null;
  return user;
}

export async function upsertGoogleUser({ email, name, googleId, avatar }) {
  const u = await usersCol();
  if (!u) throw new Error("DB unavailable");
  const e = norm(email);
  const now = new Date();
  const existing = await u.findOne({ email: e });
  if (existing) {
    const provider = existing.provider === "email" ? "both" : existing.provider || "google";
    await u.updateOne(
      { _id: existing._id },
      {
        $set: {
          lastLoginAt: now,
          avatar: avatar || existing.avatar || null,
          googleId: googleId || existing.googleId || null,
          provider,
          name: existing.name || name || e.split("@")[0],
          updatedAt: now,
        },
      }
    );
    return { ...existing, provider, lastLoginAt: now, avatar: avatar || existing.avatar || null };
  }
  const role = roleFor(e);
  const doc = {
    email: e,
    name: name || e.split("@")[0],
    passwordSalt: null,
    passwordHash: null,
    provider: "google",
    googleId: googleId || null,
    avatar: avatar || null,
    role,
    credits: role === "admin" ? ADMIN_CREDITS : DEFAULT_CREDITS,
    newsletter: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
  const r = await u.insertOne(doc);
  return { ...doc, _id: r.insertedId };
}

export async function touchLogin(userId) {
  const u = await usersCol();
  if (!u) return;
  try {
    const { ObjectId } = await import("mongodb");
    await u.updateOne({ _id: new ObjectId(String(userId)) }, { $set: { lastLoginAt: new Date() } });
  } catch {}
}

// Shape sent to the browser — never leaks the password hash/salt.
export function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    email: user.email,
    name: user.name || (user.email ? user.email.split("@")[0] : "User"),
    role: user.role || "user",
    credits: typeof user.credits === "number" ? user.credits : 0,
    avatar: user.avatar || null,
    provider: user.provider || "email",
    newsletter: !!user.newsletter,
  };
}

// Append-only activity log for the admin panel. Best-effort — never throws.
export async function logActivity({ userId, email, type, detail, path, ua }) {
  try {
    const a = await activityCol();
    if (!a) return;
    await a.insertOne({
      userId: userId ? String(userId) : null,
      email: email || null,
      type: type || "event",
      detail: detail || null,
      path: path || null,
      ua: ua || null,
      at: new Date(),
    });
  } catch {}
}
