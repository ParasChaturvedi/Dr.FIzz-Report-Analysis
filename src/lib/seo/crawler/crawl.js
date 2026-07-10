// src/lib/seo/crawler/crawl.js
// EXACT JS PORT of crawl.py's crawl loop + Robots evaluator. BFS crawler; the ONE
// difference is fetchPage is injectable and defaults to a Playwright renderer. A
// wall-clock deadlineMs bounds the crawl (checked between levels AND inside the worker).
// RULE 0: no em dashes or en dashes anywhere.

import { normalise, sameSite, hostOf } from "./urls.js";
import { parseHtml } from "./parse.js";

export const DEFAULT_UA = "DoctorFizz Site Crawler";
export const DEFAULT_WORKERS = 5;

export class Robots {
  constructor(agent) { this.agent = String(agent || "").toLowerCase(); this.groups = {}; this.loaded = false; }
  async load(baseUrl, fetchText) {
    try { const robotsUrl = new URL("/robots.txt", baseUrl).toString(); const text = await fetchText(robotsUrl); if (text != null) this._parse(text); } catch { /* no robots is fine */ }
    this.loaded = true;
  }
  _parse(text) {
    // Consecutive `User-agent:` lines with no rules between them SHARE one rule group
    // (per the robots.txt spec). The old code pointed `current` at only the last agent's
    // group, so rules after a multi-UA block attached to that last agent alone. Accumulate
    // the pending agents until the first allow/disallow, then push each rule to all of them.
    let pendingAgents = [];
    let sawRule = false;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.split("#")[0].trim();
      if (!line || !line.includes(":")) continue;
      const idx = line.indexOf(":");
      const field = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (field === "user-agent") {
        if (sawRule) { pendingAgents = []; sawRule = false; }   // a UA line after a rule starts a new block
        const key = value.toLowerCase();
        if (!this.groups[key]) this.groups[key] = [];
        pendingAgents.push(key);
      } else if ((field === "allow" || field === "disallow") && pendingAgents.length) {
        sawRule = true;
        for (const a of pendingAgents) this.groups[a].push([field === "allow", value]);
      }
    }
  }
  _pickGroup() {
    if (this.agent in this.groups) return this.groups[this.agent];
    if ("googlebot" in this.groups) return this.groups["googlebot"];
    return this.groups["*"] || [];
  }
  allowed(url) {
    const rules = this._pickGroup();
    if (!rules.length) return true;
    let path = "/"; try { path = new URL(url).pathname || "/"; } catch { /* keep default */ }
    let best = null;
    for (const [allow, pattern] of rules) if (Robots._match(pattern, path)) { if (best === null || pattern.length > best[1].length) best = [allow, pattern]; }
    return best ? best[0] : true;
  }
  static _match(pattern, path) {
    if (pattern === "") return false;
    let regex = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
    if (regex.endsWith("\\$")) regex = regex.slice(0, -2) + "$";
    try { return new RegExp("^" + regex).test(path); } catch { return false; }
  }
}

export function depthOk(depth, maxDepth) { return maxDepth < 0 || depth < maxDepth; }

export async function crawlSite(opts = {}) {
  const {
    startUrl, maxUrls = 500, maxDepth = -1, workers = DEFAULT_WORKERS, respectRobots = true,
    crawlSubdomains = false, include = null, exclude = null, fetchPage, fetchText = null, onProgress = null,
  } = opts;
  if (typeof fetchPage !== "function") throw new Error("crawlSite requires a fetchPage(url) function");

  const rootHost = hostOf(startUrl);
  const robots = new Robots(opts.userAgent || DEFAULT_UA);
  if (respectRobots && fetchText) await robots.load(startUrl, fetchText);

  const inc = include ? (include instanceof RegExp ? include : new RegExp(include)) : null;
  const exc = exclude ? (exclude instanceof RegExp ? exclude : new RegExp(exclude)) : null;
  const inScope = (url) => {
    if (!sameSite(url, rootHost, crawlSubdomains)) return false;
    if (inc && !inc.test(url)) return false;
    if (exc && exc.test(url)) return false;
    if (respectRobots && !robots.allowed(url)) return false;
    return true;
  };

  const seen = new Set([normalise(startUrl)]);
  let frontier = [[startUrl, 0]];
  const inlinks = new Map();
  const records = [];
  let crawled = 0;
  const deadline = Number(opts.deadlineMs) > 0 ? Date.now() + Number(opts.deadlineMs) : Infinity;

  const process = async (url, depth) => {
    let rec;
    try { rec = await fetchPage(url); }
    catch (e) { rec = { url, status: 0, status_text: "No Response", error: String(e && e.message || e).slice(0, 200) }; }
    if (!rec || typeof rec !== "object") rec = { url, status: 0, status_text: "No Response", error: "empty record" };
    if (!rec.url) rec.url = url;
    rec.crawl_depth = depth;
    parseHtml(rec, rootHost, crawlSubdomains);
    rec.blocked_by_robots = respectRobots && !robots.allowed(url);
    return rec;
  };

  const runLevel = async (level) => {
    const out = new Array(level.length);
    let next = 0;
    const worker = async () => {
      while (next < level.length) {
        if (Date.now() > deadline) break;
        const i = next++;
        const [u, d] = level[i];
        out[i] = await process(u, d);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, level.length)) }, () => worker()));
    return out;
  };

  while (frontier.length && crawled < maxUrls) {
    if (Date.now() > deadline) break;
    const level = [];
    const currentDepth = frontier[0][1];
    while (frontier.length && frontier[0][1] === currentDepth && (crawled + level.length) < maxUrls) level.push(frontier.shift());

    let results = await runLevel(level);
    results = results.filter(Boolean).sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    for (const rec of results) {
      const nself = normalise(rec.url);
      const srcSet = inlinks.get(nself);
      rec.inlinks_count = srcSet ? srcSet.size : 0;
      rec.inlink_sources = srcSet ? [...srcSet].sort().slice(0, 25) : [];
      records.push(rec);
      crawled += 1;
      if (typeof onProgress === "function") { try { onProgress(crawled, maxUrls, rec); } catch { /* ignore */ } }
      if (depthOk(rec.crawl_depth, maxDepth)) {
        for (const link of rec.outlinks || []) {
          const tgt = link.url; const n = normalise(tgt);
          if (!inlinks.has(n)) inlinks.set(n, new Set());
          inlinks.get(n).add(rec.url);
          if (link.internal && !seen.has(n) && inScope(tgt)) { seen.add(n); frontier.push([tgt, rec.crawl_depth + 1]); }
        }
      }
    }
  }
  return { records, crawled };
}

export default { crawlSite, Robots, depthOk, DEFAULT_UA, DEFAULT_WORKERS };
