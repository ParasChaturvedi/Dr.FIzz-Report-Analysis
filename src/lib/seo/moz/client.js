// src/lib/seo/moz/client.js
// ─────────────────────────────────────────────────────────────────────────────
// MOZ LINKS API v2 client — 1st-priority source for Domain Authority, backlinks,
// and referring domains (the data we were waiting on DataForSEO backlinks for).
//
// Returns the EXACT shape the rest of the app already expects from DataForSEO
// (backlinksSummary + backlinkDomains + externalTotal + totalDomains), so it is a
// drop-in. When Moz answers, the caller SKIPS the DataForSEO backlinks calls →
// saves DataForSEO credits. Any failure returns null → caller falls back to
// DataForSEO. Nothing else (keywords/SERP/GMB/site-audit) is affected.
//
// Auth: MOZ_API_KEY is the base64 of "AccessID:Secret" → used directly as the
// HTTP Basic token (Authorization: Basic <MOZ_API_KEY>).
// Docs: https://moz.com/products/api  (endpoints under https://lsapi.seomoz.com/v2)
// ─────────────────────────────────────────────────────────────────────────────

const MOZ_BASE = "https://lsapi.seomoz.com/v2";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function mozAuthHeader() {
  const key = String(process.env.MOZ_API_KEY || "").trim();
  if (!key) return null;
  // The key is already base64(AccessID:Secret). If someone pasted the raw
  // "id:secret" instead, base64-encode it so both forms work.
  const isRawPair = key.includes(":") && !/^[A-Za-z0-9+/]+={0,2}$/.test(key);
  return `Basic ${isRawPair ? Buffer.from(key).toString("base64") : key}`;
}

export function mozConfigured() {
  return !!String(process.env.MOZ_API_KEY || "").trim();
}

async function mozPost(path, body, timeoutMs = 15000) {
  const auth = mozAuthHeader();
  if (!auth) throw new Error("MOZ_API_KEY not set");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${MOZ_BASE}/${path}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Moz ${path} ${res.status}: ${txt.slice(0, 180)}`);
    }
    return await res.json();
  } finally { clearTimeout(t); }
}

const hostOf = (d) =>
  String(d || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();

// Main: returns DataForSEO-shaped backlink/DA data, or null on any failure.
// opts.withList=false skips the per-domain list call (cheaper — for competitors
// where only DA + counts are shown, not the full referring-domains table).
export async function fetchMozMetrics(domain, { listLimit = 50, withList = true } = {}) {
  const host = hostOf(domain);
  if (!host || !mozConfigured()) return null;

  try {
    // 1) url_metrics → DA + aggregate backlink/referring-domain counts (1 row, cheap)
    const um = await mozPost("url_metrics", { targets: [host] });
    const m = (Array.isArray(um?.results) && um.results[0]) || null;
    if (!m) return null;

    const da = num(m.domain_authority);
    const backlinks = num(m.external_pages_to_root_domain ?? m.external_pages_to_subdomain);
    const referring_domains = num(m.external_root_domains_to_root_domain ?? m.root_domains_to_root_domain);
    const referring_pages = num(m.pages_to_root_domain ?? m.external_pages_to_root_domain ?? backlinks);
    const referring_pages_nofollow = num(
      m.nofollow_external_pages_to_root_domain ?? m.external_nofollow_pages_to_root_domain ?? m.nofollow_pages_to_root_domain
    );

    const backlinksSummary = {
      backlinks,
      referring_domains,
      referring_pages,
      referring_pages_nofollow,
      backlinks_spam_score: num(m.spam_score),
      rank: da,          // 0-100 → flows through the existing Domain-Rating chain
      domain_rank: da,
      ahrefs_rank: da,
      _source: "moz",
    };

    // 2) linking_root_domains → the referring-domains LIST (drop-in for backlinkDomains)
    let backlinkDomains = [];
    if (withList) {
      try {
        const lr = await mozPost("linking_root_domains", {
          target: host,
          target_scope: "root_domain",
          limit: Math.min(Number(listLimit) || 50, 50),
        });
        const rows = Array.isArray(lr?.results) ? lr.results : [];
        backlinkDomains = rows.map((r) => {
          const d = hostOf(r.root_domain || r.source || r.domain || r.subdomain || "");
          if (!d) return null;
          const pages = num(r.to_target?.pages ?? r.to_target);
          return {
            domain: d,
            backlinks: pages || 1,
            rank: num(r.domain_authority),
            referring_pages: pages,
            backlinks_spam_score: num(r.spam_score),
            first_seen: null,
            lost_date: null,
          };
        }).filter(Boolean);
      } catch (listErr) {
        console.warn("[Moz] linking_root_domains failed (using counts only):", listErr?.message);
      }
    }

    const externalTotal = backlinkDomains.reduce((s, d) => s + (Number(d.backlinks) || 0), 0) || backlinks;
    const totalDomains = referring_domains || backlinkDomains.length;

    return { backlinksSummary, backlinkDomains, externalTotal, totalDomains, domainAuthority: da, _source: "moz" };
  } catch (err) {
    console.warn("[Moz] metrics fetch failed — will fall back to DataForSEO:", err?.message);
    return null;
  }
}
