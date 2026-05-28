// src/lib/prefetch-opportunities.js
//
// Background prefetch for:
// 1) Opportunity titles/URLs via POST /api/seo/opportunities
// 2) Existing-page HTML content for the *top 2 blogs + top 2 pages* via POST /api/seo (providers:["content"])
//    (only if those slots are missing contentHtml/content)
// 3) Writes results into the SAME sessionStorage cache shape that OpportunitiesSection expects:
//
//   key:   drfizz.opps.v1:<normalizedDomain>
//   value: { ts, status: "running"|"complete", scanId, seoRows: [ { domain, content:{ blog:[slot], pages:[slot] } } ] }
//
// So when Dashboard mounts later, OpportunitiesSection hydrates instantly from cache,
// and "Edit existing page" opens instantly for those 4 items (slot.content is prefilled).

/* -------------------------------------------
   Cache + domain helpers (mirrors OpportunitiesSection)
-------------------------------------------- */

const OPPS_CLIENT_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const OPPS_PREFETCH_FLAG = "__drfizzOppsPrefetch__"; // window singleton for de-dupe

const normalizeDomain = (input = "") => {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    let host = (url.hostname || "").toLowerCase().trim();
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim();
  }
};

const ensureHttpUrl = (value = "") => {
  const s = String(value || "").trim();
  if (!s) return "";
  return s.includes("://") ? s : `https://${s.replace(/^\/+/, "")}`;
};

const toWebsiteUrl = (domain) => ensureHttpUrl(domain);

const oppsCacheKey = (domain) => `drfizz.opps.v1:${normalizeDomain(domain || "")}`;

function readOppsCache(domain) {
  try {
    const raw = sessionStorage.getItem(oppsCacheKey(domain));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !parsed?.seoRows) return null;

    const age = Date.now() - Number(parsed.ts || 0);
    if (age > OPPS_CLIENT_CACHE_TTL_MS) return null;

    return parsed;
  } catch {
    return null;
  }
}

function writeOppsCache(domain, payload) {
  try {
    sessionStorage.setItem(oppsCacheKey(domain), JSON.stringify(payload));
  } catch {
    // ignore quota/private mode issues
  }
}

/* -------------------------------------------
   In-memory / window de-dupe
-------------------------------------------- */

function getPrefetchRegistry() {
  if (typeof window === "undefined") return null;

  // registry keyed by normalizedDomain
  // value: { startedAt, promise, finishedAt? }
  if (!window[OPPS_PREFETCH_FLAG]) {
    window[OPPS_PREFETCH_FLAG] = Object.create(null);
  }
  return window[OPPS_PREFETCH_FLAG];
}

/* -------------------------------------------
   Network helpers
-------------------------------------------- */

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollScanComplete(
  scanId,
  { intervalMs = 2500, timeoutMs = 90_000 } = {}
) {
  if (!scanId) return { ok: false, status: "missing_scanId" };

  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(
        `/api/seo/scan/status?scanId=${encodeURIComponent(scanId)}`,
        { method: "GET" }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await sleep(intervalMs);
        continue;
      }

      if (json?.status === "complete") return { ok: true, status: "complete", json };
      if (json?.status === "failed") {
        return {
          ok: false,
          status: "failed",
          error: json?.diagnostics?.error || "scan failed",
        };
      }
    } catch {
      // ignore transient errors
    }

    await sleep(intervalMs);
  }

  return { ok: false, status: "timeout" };
}

/* -------------------------------------------
   Build cache row in the SAME shape OpportunitiesSection expects
-------------------------------------------- */

function buildRowFromOppsJson(json, domain) {
  // Server returns arrays "blogs" and "pages" (already filtered by scan-opportunities)
  const blogs = Array.isArray(json?.blogs) ? json.blogs : [];
  const pages = Array.isArray(json?.pages) ? json.pages : [];

  const mapItemToSlot = (item, fallbackTitle, d) => {
    const title = item?.title || fallbackTitle || "Untitled";
    const urlFromApi = item?.url ? ensureHttpUrl(item.url) : "";

    return {
      title,
      priority: "Medium Priority",
      wordCount: typeof item?.wordCount === "number" ? item.wordCount : 0,
      keywords: 0,
      score: 0,
      status: item?.isDraft ? "Draft" : "Published",

      // KEY: instant "Edit existing page"
      content:
        (typeof item?.contentHtml === "string" && item.contentHtml.trim()) ||
        (typeof item?.content === "string" && item.content.trim()) ||
        "",

      slug: item?.slug ? String(item.slug) : "",
      primaryKeyword: null,
      lsiKeywords: [],
      plagiarism: typeof item?.plagiarism === "number" ? item.plagiarism : null,
      plagiarismSources: Array.isArray(item?.plagiarismSources)
        ? item.plagiarismSources
        : [],
      url: urlFromApi,
      meta: {
        originalTitle: item?.title || null,
        publishedAt: item?.publishedAt || null,
        isDraft: !!item?.isDraft,
      },
    };
  };

  const d = normalizeDomain(domain || json?.hostname || "");
  return {
    domain: normalizeDomain(json?.hostname || d),
    content: {
      blog: blogs.map((item, i) =>
        mapItemToSlot(item, `Blog Opportunity ${i + 1}`, d)
      ),
      pages: pages.map((item, i) =>
        mapItemToSlot(item, `Page Opportunity ${i + 1}`, d)
      ),
    },
  };
}

function pickTop2Plus2(slots = []) {
  // keep first 4 (blog: up to 2, pages: up to 2, but your UI commonly slices anyway)
  return Array.isArray(slots) ? slots.slice(0, 4) : [];
}

function hasNonEmptyTitles(row) {
  const b = Array.isArray(row?.content?.blog) ? row.content.blog : [];
  const p = Array.isArray(row?.content?.pages) ? row.content.pages : [];
  return b.length > 0 || p.length > 0;
}

function topSlotsHaveContent(row) {
  const blogs = pickTop2Plus2(row?.content?.blog || []);
  const pages = pickTop2Plus2(row?.content?.pages || []);
  if (!blogs.length && !pages.length) return false;

  return [...blogs, ...pages].every(
    (s) => typeof s?.content === "string" && s.content.trim()
  );
}

/* -------------------------------------------
   Content prefetch (/api/seo providers:["content"])
-------------------------------------------- */

async function fetchContentHtmlForUrl(
  url,
  { keyword = "", countryCode = "in", languageCode = "en" } = {}
) {
  const u = ensureHttpUrl(url);
  if (!u) return "";

  try {
    const res = await fetch("/api/seo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // IMPORTANT: keep it lightweight
      body: JSON.stringify({
        url: u,
        keyword: keyword || "",
        countryCode,
        languageCode,
        providers: ["content"],
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) return "";

    // common shapes
    const html =
      (typeof json?.unified?.content?.html === "string" &&
        json.unified.content.html) ||
      (typeof json?.content?.html === "string" && json.content.html) ||
      (typeof json?.results?.content?.html === "string" &&
        json.results.content.html) ||
      (typeof json?.contentHtml === "string" && json.contentHtml) ||
      "";

    return String(html || "");
  } catch {
    return "";
  }
}

function patchCacheWithContent(domain, patches = []) {
  const d = normalizeDomain(domain);
  const cached = readOppsCache(d);
  if (!cached?.seoRows?.length) return;

  const row0 = cached.seoRows[0];
  const nextRow = {
    ...row0,
    content: {
      blog: Array.isArray(row0?.content?.blog) ? [...row0.content.blog] : [],
      pages: Array.isArray(row0?.content?.pages) ? [...row0.content.pages] : [],
    },
  };

  const urlToContent = new Map();
  for (const p of patches) {
    const url = ensureHttpUrl(p?.url || "");
    const content = typeof p?.content === "string" ? p.content : "";
    if (url && content) urlToContent.set(url, content);
  }

  const apply = (slots) =>
    slots.map((s) => {
      const url = ensureHttpUrl(s?.url || "");
      const existing = typeof s?.content === "string" ? s.content : "";
      const patched = urlToContent.get(url);
      if (patched && !existing) return { ...s, content: patched };
      return s;
    });

  nextRow.content.blog = apply(nextRow.content.blog);
  nextRow.content.pages = apply(nextRow.content.pages);

  writeOppsCache(d, {
    ts: Date.now(),
    status: cached.status || "complete",
    scanId: cached.scanId || "",
    seoRows: [nextRow],
  });
}

/* -------------------------------------------
   Public API
-------------------------------------------- */

/**
 * Prefetch opportunities + top content.
 *
 * - Safe to call multiple times; de-dupes per domain.
 * - You MAY await this (but Step5 should usually fire-and-forget).
 *
 * Ready criteria (ok:true):
 * - Titles exist (blogs/pages length > 0)
 * - AND top slots (2+2) have content (or there were no target slots needing content)
 */
export function prefetchOpportunitiesAndContent(
  domainOrUrl,
  {
    timeoutMs = 90_000, // ✅ bounded (don’t stall UX forever)
    intervalMs = 2500,
    concurrency = 2,
    countryCode = "in",
    languageCode = "en",
    allowSubdomains = true,
  } = {}
) {
  const d = normalizeDomain(domainOrUrl || "");
  if (!d || d === "example.com") return Promise.resolve({ ok: false });

  // If cache already has what we need, short-circuit.
  const cached = typeof window !== "undefined" ? readOppsCache(d) : null;
  if (cached?.status === "complete" && cached?.seoRows?.length) {
    const row0 = cached.seoRows[0];
    if (hasNonEmptyTitles(row0) && topSlotsHaveContent(row0)) {
      return Promise.resolve({ ok: true, fromCache: true });
    }
  }

  const reg = getPrefetchRegistry();
  if (!reg) return Promise.resolve({ ok: false });

  // If a run is already in-flight, reuse it.
  if (reg[d]?.promise) return reg[d].promise;

  const promise = (async () => {
    const websiteUrl = toWebsiteUrl(d);

    // 1) Fetch opportunities (titles/urls). Handle 202 scan-in-progress.
    let scanId = "";
    let oppsJson = null;

    try {
      const res = await fetch("/api/seo/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl, allowSubdomains }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 202) {
        scanId = json?.source?.scanId || "";

        // write "running" cache so Dashboard can show scanning state but keep old rows
        writeOppsCache(d, {
          ts: Date.now(),
          status: "running",
          scanId,
          seoRows: cached?.seoRows || [],
        });

        if (!scanId) return { ok: false, status: "missing_scanId" };

        const polled = await pollScanComplete(scanId, { timeoutMs, intervalMs });
        if (!polled.ok) return { ok: false, status: polled.status, error: polled.error };

        // refetch now that scan is complete
        const res2 = await fetch("/api/seo/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl, allowSubdomains }),
        });

        const json2 = await res2.json().catch(() => ({}));
        if (!res2.ok) return { ok: false, status: "error", error: json2?.error || "" };

        oppsJson = json2;
        scanId = json2?.source?.scanId || scanId;
      } else if (res.ok) {
        oppsJson = json;
        scanId = json?.source?.scanId || "";
      } else {
        return { ok: false, status: "error", error: json?.error || "" };
      }
    } catch (e) {
      return { ok: false, status: "error", error: e?.message || "network error" };
    }

    if (!oppsJson) return { ok: false, status: "error" };

    // 2) Build seoRows in the same shape OpportunitiesSection expects.
    const row = buildRowFromOppsJson(oppsJson, d);

    // If we still have no titles, don’t claim success.
    if (!hasNonEmptyTitles(row)) {
      writeOppsCache(d, {
        ts: Date.now(),
        status: "running",
        scanId,
        seoRows: [row],
      });
      return { ok: false, status: "no_titles" };
    }

    // Write "complete" immediately so Dashboard can render titles fast.
    writeOppsCache(d, {
      ts: Date.now(),
      status: "complete",
      scanId,
      seoRows: [row],
    });

    // 3) Prefetch HTML for top 2 blogs + top 2 pages only if missing content
    const blogTargets = pickTop2Plus2(row?.content?.blog || []).filter(
      (s) => !(typeof s?.content === "string" && s.content.trim()) && s?.url
    );
    const pageTargets = pickTop2Plus2(row?.content?.pages || []).filter(
      (s) => !(typeof s?.content === "string" && s.content.trim()) && s?.url
    );

    const targets = [...blogTargets, ...pageTargets].map((slot) => ({
      url: slot.url,
    }));

    if (!targets.length) return { ok: true, status: "complete" };

    // bounded concurrency pool
    const limit = Math.max(1, Math.min(concurrency, targets.length));
    let idx = 0;
    const patches = [];

    const worker = async () => {
      while (idx < targets.length) {
        const current = targets[idx++];
        const html = await fetchContentHtmlForUrl(current.url, {
          keyword: d,
          countryCode,
          languageCode,
        });

        if (html && html.trim()) {
          patches.push({ url: current.url, content: html });
        }
      }
    };

    await Promise.all(Array.from({ length: limit }, worker));

    if (patches.length) {
      patchCacheWithContent(d, patches);
    }

    // 4) Final readiness
    const finalCached = readOppsCache(d);
    const row0 = finalCached?.seoRows?.[0];

    if (row0 && hasNonEmptyTitles(row0) && topSlotsHaveContent(row0)) {
      return { ok: true, status: "complete" };
    }

    // Titles exist but some content missing—still OK; editor can fetch on-demand if needed.
    if (row0 && hasNonEmptyTitles(row0)) return { ok: true, status: "titles_ready" };

    return { ok: false, status: "error" };
  })();

  reg[d] = { startedAt: Date.now(), promise };

  promise.finally(() => {
    if (reg[d]?.promise === promise) {
      reg[d].finishedAt = Date.now();
      // keep resolved promise for de-dupe within this session
    }
  });

  return promise;
}
