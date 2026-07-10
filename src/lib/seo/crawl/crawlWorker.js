// src/lib/seo/crawl/crawlWorker.js
// ─────────────────────────────────────────────────────────────────────────────
// The VPS crawl worker loop. Claims a crawl job, runs the FULL rendered crawl via the
// exact same crawlDomain() the Vercel route uses (so zero logic divergence), and writes
// the result into the crawl cache the report reads. No 300s cap here, so it renders the
// whole site. The report generation flow is UNCHANGED: it keeps reading `data_cache`
// {domain,"crawl"} — this worker just fills that cache with better (rendered) data.
// ─────────────────────────────────────────────────────────────────────────────
import { putCached } from "@/lib/cache/mongo";
import { crawlDomain } from "@/app/api/seo/website-crawl/route.js";
import { claimNextCrawlJob, completeCrawlJob, failCrawlJob, heartbeatCrawlJob } from "./crawlJobStore.js";
import { CRAWL_ENGINE_VERSION } from "@/lib/crawl/engineVersion";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runCrawlWorkerLoop({ once = false, pollMs = 5000 } = {}) {
  // Full rendered crawl: the VPS has no Vercel 300s cap, so render the whole site and
  // give the crawl a generous wall-clock budget. Env overrides win if already set.
  if (!process.env.CRAWLER_ENGINE) process.env.CRAWLER_ENGINE = "v2";
  if (!process.env.CRAWL_MAX_RENDER) process.env.CRAWL_MAX_RENDER = "300";
  if (!process.env.CRAWL_BUDGET_MS) process.env.CRAWL_BUDGET_MS = "600000";
  console.log(`[crawl-worker] loop start · engine=${process.env.CRAWLER_ENGINE} · maxRender=${process.env.CRAWL_MAX_RENDER} · budgetMs=${process.env.CRAWL_BUDGET_MS} · ${once ? "single" : "loop"}`);

  for (;;) {
    let job = null;
    try { job = await claimNextCrawlJob(); } catch (e) { console.warn("[crawl-worker] claim error:", e?.message); }
    if (!job) { if (once) return { claimed: 0 }; await sleep(pollMs); continue; }

    const jid = job.job_id, domain = job.domain;
    console.log(`[crawl-worker] claimed ${jid} · ${domain}`);
    const hb = setInterval(() => { heartbeatCrawlJob(jid).catch(() => {}); }, 60000);
    const t0 = Date.now();
    try {
      const crawlData = await crawlDomain(domain, Array.isArray(job.keywords) ? job.keywords : []);
      if (!crawlData || typeof crawlData !== "object") throw new Error("crawlDomain returned no data");
      // Write to the SAME versioned cache key the report reads (data_cache
      // {domain,"crawl-<engineVersion>"}), so the next report for this domain serves the
      // rendered crawl straight from cache. Must match website-crawl/route.js's dataType.
      await putCached({ domain, dataType: `crawl-${CRAWL_ENGINE_VERSION}`, payload: crawlData, source: "crawl-worker", fetchedBy: "vps" });
      await completeCrawlJob(jid, { pageCount: crawlData.pageCount, healthScore: crawlData.healthScore, renderedCount: crawlData.renderedCount, crawlEngine: crawlData.crawlEngine });
      console.log(`[crawl-worker] done ${jid} · ${domain} · ${((Date.now() - t0) / 1000).toFixed(1)}s · pages=${crawlData.pageCount} rendered=${crawlData.renderedCount} engine=${crawlData.crawlEngine} health=${crawlData.healthScore}`);
    } catch (e) {
      console.warn(`[crawl-worker] FAILED ${jid} · ${domain}:`, e?.message);
      await failCrawlJob(jid, e);
    } finally {
      clearInterval(hb);
    }
    if (once) return { claimed: 1 };
  }
}

export default { runCrawlWorkerLoop };
