import crypto from "crypto";

const COOKIE_NAME = "df_google_tokens";

/* ============================================================================
   🔐 Encryption helpers (AES-256-GCM)
   - Uses TOKEN_ENCRYPTION_KEY from env
   - Secure, authenticated encryption
============================================================================ */

// Derive a 32-byte key from TOKEN_ENCRYPTION_KEY
function getKey() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptJson(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // recommended IV length for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Store: iv + tag + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptJson(str) {
  const key = getKey();
  const buf = Buffer.from(str, "base64url");

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

/* ============================================================================
   🍪 Cookie helpers (Next.js App Router compatible)
============================================================================ */

export function setTokensCookie(res, payload) {
  const value = encryptJson(payload);

  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function clearTokensCookie(res) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readTokensFromRequest(req) {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    return decryptJson(cookie);
  } catch {
    return null;
  }
}

/* ============================================================================
   🔄 Update helper (merge new values into existing cookie)
   - Used for GA4 property selection, future GSC site selection, etc.
============================================================================ */

export function updateTokensCookie(req, res, updates) {
  const existing = readTokensFromRequest(req) || {};
  const merged = { ...existing, ...updates };
  setTokensCookie(res, merged);
}
