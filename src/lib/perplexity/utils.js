export function normalizeHost(input) {
  if (!input || typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  try {
    if (!/^https?:\/\//.test(s)) s = `https://${s}`;
    const u = new URL(s);
    s = u.hostname || s;
  } catch {
    s = s.replace(/^https?:\/\//, "").split("/")[0];
  }
  return s.replace(/^www\./, "");
}

export function ensureUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return raw.includes("://") ? raw : `https://${raw}`;
}

export function cleanList(arr, { max = 12 } = {}) {
  const seen = new Set();
  const out = [];
  for (const x of Array.isArray(arr) ? arr : []) {
    const v = String(x || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * sonar-reasoning-pro can output: "<think>...</think>{...json...}" :contentReference[oaicite:7]{index=7}
 * Even with sonar-pro, keep this as safety.
 */
export function extractJsonObjectLoose(text) {
  const s = String(text || "").trim();
  if (!s) return null;

  try {
    return JSON.parse(s);
  } catch {}

  // fenced block
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  // remove <think> blocks
  const noThink = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // first {...}
  const start = noThink.indexOf("{");
  const end = noThink.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(noThink.slice(start, end + 1));
    } catch {}
  }

  return null;
}

export function toDomainish(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  if (s.includes("://") || s.includes("/")) return normalizeHost(s);
  return s.replace(/^www\./i, "");
}
