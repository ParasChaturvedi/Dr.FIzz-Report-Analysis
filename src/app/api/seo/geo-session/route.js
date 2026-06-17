// src/app/api/seo/geo-session/route.js
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: store / inspect the GEO login-engine sessions (ChatGPT, Gemini, Copilot).
//
// Capture a session once locally with `node scripts/geo-capture.mjs <engine>` (writes
// .geo-sessions/<engine>.json), then POST that JSON here so the serverless scan can use
// it. Gated by the GEO_ADMIN_SECRET env var (endpoint is disabled until that is set).
//
//   GET  /api/seo/geo-session            → which login engines have a session
//   POST /api/seo/geo-session            → { engine, storageState }  (header: x-geo-admin-secret)
//
// The collector then auto-includes any engine that has a stored session — no code change.
// ─────────────────────────────────────────────────────────────────────────────
import { saveGeoSession, availableLoginEngines, LOGIN_ENGINES } from "@/lib/seo/geo/sessions";

export const runtime = "nodejs";

function authed(req) {
  const secret = String(process.env.GEO_ADMIN_SECRET || "");
  if (!secret) return false; // disabled until a secret is configured
  return (req.headers.get("x-geo-admin-secret") || "") === secret;
}

export async function GET(req) {
  if (!authed(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const engines = await availableLoginEngines();
  return Response.json({
    login_engines: LOGIN_ENGINES,
    with_session: engines,
    missing: LOGIN_ENGINES.filter((e) => !engines.includes(e)),
  });
}

export async function POST(req) {
  if (!authed(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { return Response.json({ error: "invalid JSON body" }, { status: 400 }); }

  const engine = String(body.engine || "").toLowerCase().trim();
  let storageState = body.storageState;
  if (typeof storageState === "string") {
    try { storageState = JSON.parse(storageState); }
    catch { return Response.json({ error: "storageState string is not valid JSON" }, { status: 400 }); }
  }
  try {
    await saveGeoSession(engine, storageState);
    return Response.json({ ok: true, engine, with_session: await availableLoginEngines() });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
