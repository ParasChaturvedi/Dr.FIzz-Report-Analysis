// src/lib/perplexity/publicSignals.js
import { ensureUrl, normalizeHost } from "@/lib/perplexity/utils";

async function fetchText(url, { timeoutMs = 12000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DrFizzBot/1.0)",
        Accept: "text/html,text/plain,application/xml",
        ...headers,
      },
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, url: res.url || url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: String(e?.message || "fetch failed") };
  } finally {
    clearTimeout(t);
  }
}

function extractTitle(html = "") {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim();
}

function extractMetaDescription(html = "") {
  const m = String(html).match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim();
}

function extractInternalLinks(html = "", baseUrl = "") {
  const out = [];
  const host = normalizeHost(baseUrl);
  if (!host) return out;

  for (const m of String(html).matchAll(/href=["']([^"']+)["']/gi)) {
    let href = (m[1] || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
      continue;

    try {
      const abs = new URL(href, ensureUrl(baseUrl)).toString();
      const h = normalizeHost(abs);
      if (h && h === host) out.push(abs);
    } catch {}
    if (out.length >= 10) break;
  }

  const priority = (u) => {
    const s = u.toLowerCase();
    if (s.includes("/about")) return 0;
    if (s.includes("/services")) return 1;
    if (s.includes("/products")) return 1;
    if (s.includes("/pricing")) return 2;
    if (s.includes("/case")) return 2;
    if (s.includes("/blog")) return 3;
    return 4;
  };

  return Array.from(new Set(out)).sort((a, b) => priority(a) - priority(b)).slice(0, 4);
}

function extractRobotsSitemaps(robotsText = "") {
  const urls = [];
  for (const line of String(robotsText).split("\n")) {
    const m = line.match(/^\s*sitemap:\s*(\S+)\s*$/i);
    if (m?.[1]) urls.push(m[1].trim());
  }
  return Array.from(new Set(urls)).slice(0, 5);
}

function cleanArray(arr, max) {
  const seen = new Set();
  const out = [];
  for (const x of arr || []) {
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

// item 11 — identify the CMS / page-builder from real homepage evidence (never a guess): the
// <meta name="generator"> tag first, then unambiguous asset-path / markup fingerprints. Used so
// the report can name the LIKELY cause of duplicate <title>/<head> tags (typically an SEO plugin
// fighting the theme's own title output) instead of only guessing "a theme/plugin conflict".
export function detectCms(html) {
  const h = String(html || "");
  if (!h) return { cms: "", cmsPlugin: "", cmsEvidence: "" };
  const genM = h.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i)
            || h.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']generator["'][^>]*>/i);
  const g = String(genM?.[1] || "").trim();
  const has = (re) => re.test(h);
  let cms = "", evidence = "";
  if (/wordpress/i.test(g) || has(/\/wp-content\//i) || has(/\/wp-includes\//i) || has(/\/wp-json/i)) { cms = "WordPress"; evidence = g || "wp-content / wp-json asset paths"; }
  else if (/shopify/i.test(g) || has(/cdn\.shopify\.com/i) || has(/Shopify\.theme/)) { cms = "Shopify"; evidence = g || "cdn.shopify.com assets"; }
  else if (/wix/i.test(g) || has(/static\.wixstatic\.com/i)) { cms = "Wix"; evidence = g || "wixstatic.com assets"; }
  else if (/squarespace/i.test(g) || has(/static1\.squarespace\.com/i)) { cms = "Squarespace"; evidence = g || "squarespace.com assets"; }
  else if (/webflow/i.test(g) || has(/assets\.website-files\.com/i) || has(/\.webflow\.io/i)) { cms = "Webflow"; evidence = g || "website-files.com assets"; }
  else if (has(/\/_next\//) || has(/__NEXT_DATA__/)) { cms = "Next.js"; evidence = "/_next/ build assets"; }
  else if (has(/\/_nuxt\//)) { cms = "Nuxt"; evidence = "/_nuxt/ build assets"; }
  else if (/drupal/i.test(g) || has(/\/sites\/(default|all)\/(files|modules|themes)\//i)) { cms = "Drupal"; evidence = g || "Drupal /sites/ paths"; }
  else if (/joomla/i.test(g) || has(/com_content/i)) { cms = "Joomla"; evidence = g || "Joomla component paths"; }
  else if (g) { cms = g.split(/\s+\d/)[0].trim(); evidence = g; }
  let plugin = "";
  if (cms === "WordPress") {
    if (has(/yoast|wpseo/i)) plugin = "Yoast SEO";
    else if (has(/rank[-_ ]?math/i)) plugin = "Rank Math";
    else if (has(/all[-_ ]?in[-_ ]?one[-_ ]?seo|aioseo/i)) plugin = "All in One SEO";
    else if (has(/seopress/i)) plugin = "SEOPress";
    else if (has(/elementor/i)) plugin = "Elementor (page builder)";
  }
  return { cms, cmsPlugin: plugin, cmsEvidence: String(evidence).slice(0, 120) };
}

export async function collectPublicSignals(inputUrlOrDomain) {
  const siteUrl = ensureUrl(inputUrlOrDomain);
  const domain = normalizeHost(siteUrl);

  // 1) Homepage (reduced timeout)
  const home = await fetchText(siteUrl, { timeoutMs: 9000 });
  const html = home.ok ? home.text : "";

  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const internalLinks = extractInternalLinks(html, siteUrl);
  const cmsInfo = detectCms(html);   // item 11 — evidence-based CMS / builder + likely SEO plugin

  // 2) 1 internal page — fetched via Promise.all
  const internalTargets = internalLinks.slice(0, 1);
  const internalPages = await Promise.all(
    internalTargets.map(async (u) => {
      const r = await fetchText(u, { timeoutMs: 8000 });
      return {
        url: u,
        ok: r.ok,
        status: r.status,
        title: extractTitle(r.text),
        metaDescription: extractMetaDescription(r.text),
        snippet: String(r.text || "").replace(/\s+/g, " ").slice(0, 800),
      };
    })
  );

  // 3) robots.txt + sitemaps (reduced timeout)
  const robotsUrl = `${siteUrl.replace(/\/$/, "")}/robots.txt`;
  const robots = await fetchText(robotsUrl, { timeoutMs: 6000 });
  const sitemapsFromRobots = robots.ok ? extractRobotsSitemaps(robots.text) : [];

  const fallbackSitemaps = sitemapsFromRobots.length
    ? []
    : [
        `${siteUrl.replace(/\/$/, "")}/sitemap.xml`,
        `${siteUrl.replace(/\/$/, "")}/sitemap_index.xml`,
      ];

  return {
    domain,
    siteUrl,
    cms: cmsInfo.cms,                 // item 11 — detected CMS / builder ("" if undetectable)
    cmsPlugin: cmsInfo.cmsPlugin,     // likely SEO/title plugin (duplicate-tag root cause)
    cmsEvidence: cmsInfo.cmsEvidence, // the exact signal it was detected from
    homepage: {
      ok: home.ok,
      status: home.status,
      finalUrl: home.url,
      title,
      metaDescription,
      snippet: String(html || "").replace(/\s+/g, " ").slice(0, 1200),
    },
    internalPages,
    robots: {
      ok: robots.ok,
      status: robots.status,
      url: robotsUrl,
      sitemaps: cleanArray(sitemapsFromRobots.concat(fallbackSitemaps), 5),
    },
  };
}
