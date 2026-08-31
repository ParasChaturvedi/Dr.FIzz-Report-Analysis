// src/lib/auth/password.js
// ─────────────────────────────────────────────────────────────────────────────
// Password hashing using Node's built-in crypto.scrypt — NO native dependency
// (bcrypt/argon2 need native builds that can be fragile on Vercel). scrypt is a
// memory-hard KDF and is a solid choice for password storage.
//   store:  { salt, hash }  (both hex strings)
//   verify: constant-time compare via timingSafeEqual
// ─────────────────────────────────────────────────────────────────────────────
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, KEYLEN).toString("hex");
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  try {
    const derived = scryptSync(String(password), salt, KEYLEN);
    const stored = Buffer.from(hash, "hex");
    if (stored.length !== derived.length) return false;
    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

// Basic strength gate — mirrors what the UI enforces so the API is authoritative.
export function passwordProblem(password) {
  const p = String(password || "");
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 200) return "Password is too long.";
  return null;
}

export function emailProblem(email) {
  const e = String(email || "").trim();
  if (!e) return "Email is required.";
  // Pragmatic email check (not RFC-perfect, deliberately permissive).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  if (e.length > 320) return "Email is too long.";
  return null;
}
