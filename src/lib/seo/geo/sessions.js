// src/lib/seo/geo/sessions.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO Vision §15/§19 — SERVER-SIDE LOGIN SESSIONS for the login-gated engines
// (ChatGPT, Gemini, Copilot). The browser collector needs a Playwright `storageState`
// (cookies + localStorage) per login engine. On serverless there is no `.geo-sessions`
// directory, so we load that storageState from:
//   1. env var  GEO_SESSION_<ENGINE>  (raw JSON or base64-encoded JSON) — fast, no DB
//   2. MongoDB  (data_type "geo-session", key "geo-session:<engine>") — set via the
//      /api/seo/geo-session admin endpoint with a captured storageState
//
// This makes the login engines fully CODE-COMPLETE: once a session is provided (env or
// admin POST), that engine joins the inline scan automatically — no code change. The
// no-login engines (AI Overview, Perplexity, Claude) never need this.
//
// History-free guarantee is unaffected: each query still runs in a fresh incognito
// context seeded ONLY with this storageState (see collector.askEngine).
// ─────────────────────────────────────────────────────────────────────────────
import { getCached, putCached } from "@/lib/cache/mongo";
import { encryptJson, decryptJson } from "@/lib/tokenStore";

export const LOGIN_ENGINES = ["chatgpt", "gemini", "copilot"];

// §19 — sessions are stored ENCRYPTED at rest (AES-256-GCM, TOKEN_ENCRYPTION_KEY) so
// logged-in AI cookies never sit in plaintext in the cache collection. If the key is
// unset we fall back to plaintext with a loud warning (so capture still works), and
// load() transparently handles both shapes (incl. any legacy plaintext session).
function _encState(storageState) {
  try { return { enc: encryptJson(storageState) }; }
  catch (e) {
    console.warn("[geo-session] TOKEN_ENCRYPTION_KEY missing — storing session UNENCRYPTED:", e?.message);
    return { storageState };
  }
}
function _decState(payload) {
  if (payload?.enc) { try { return decryptJson(payload.enc); } catch { return null; } }
  return payload?.storageState || null;   // legacy plaintext fallback
}

const _key = (engine) => `geo-session:${String(engine || "").toLowerCase().trim()}`;
const _envVar = (engine) => `GEO_SESSION_${String(engine || "").toUpperCase().trim()}`;

// Parse a storageState from an env var — accepts raw JSON or base64-encoded JSON.
function _fromEnv(engine) {
  const raw = String(process.env[_envVar(engine)] || "").trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? obj : null;
  } catch { return null; }
}

// Load one engine's storageState — env first (no DB hit), then Mongo. Sessions don't
// expire on our 30-day data window, so read with a long ttl. null when none is stored.
export async function loadGeoSession(engine) {
  const envState = _fromEnv(engine);
  if (envState) return envState;
  try {
    const payload = await getCached({ domain: _key(engine), dataType: "geo-session", ttlDays: 3650 });
    return _decState(payload);
  } catch { return null; }
}

// Build a { engine: storageState } map for the requested login engines — only those that
// actually have a stored session are included.
export async function loadGeoSessions(engineKeys = LOGIN_ENGINES) {
  const wanted = (engineKeys || []).filter((e) => LOGIN_ENGINES.includes(e));
  const out = {};
  for (const e of wanted) { const s = await loadGeoSession(e); if (s) out[e] = s; }
  return out;
}

// Which login engines currently have a usable session (env or Mongo).
export async function availableLoginEngines() {
  const out = [];
  for (const e of LOGIN_ENGINES) if (await loadGeoSession(e)) out.push(e);
  return out;
}

// Persist a captured storageState for an engine (append-only, like every cache write).
export async function saveGeoSession(engine, storageState) {
  const e = String(engine || "").toLowerCase().trim();
  if (!LOGIN_ENGINES.includes(e)) throw new Error(`unknown login engine "${engine}" (expected ${LOGIN_ENGINES.join(", ")})`);
  if (!storageState || typeof storageState !== "object") throw new Error("storageState must be a Playwright storageState object");
  const ok = await putCached({
    domain: _key(e), dataType: "geo-session",
    payload: { ..._encState(storageState), saved_at: new Date().toISOString() }, source: "geo-session-admin",
  });
  if (!ok) throw new Error("could not persist session (is MONGODB_URI set?)");
  return true;
}
