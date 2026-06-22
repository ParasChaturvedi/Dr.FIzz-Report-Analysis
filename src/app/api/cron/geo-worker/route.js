// src/app/api/cron/geo-worker/route.js
// ─────────────────────────────────────────────────────────────────────────────
// GEO §17 job-queue WORKER. Vercel Cron hits this each tick (see vercel.json). It claims
// the oldest GEO job, runs ONE bounded batch of prompts across the job's engines, appends
// the responses, rebuilds the geo-visibility cache (so the report fills in), and marks the
// job done when the full 150-250 set is collected. Idle + free when there are no jobs.
// Also triggerable manually with CRON_SECRET (Authorization: Bearer <secret> or ?secret=).
// ─────────────────────────────────────────────────────────────────────────────
import { claimNextJob, commitJobBatch, failJob } from "@/lib/seo/geo/queue";
import { runGeoScan } from "@/lib/seo/geo/collector";
import { loadGeoSessions } from "@/lib/seo/geo/sessions";

export const runtime = "nodejs";
export const maxDuration = 300;

function authed(req) {
  const secret = String(process.env.CRON_SECRET || "");
  if (!secret) return true; // unset → allow (Vercel internal cron); set one to lock it down
  const hdr = req.headers.get("authorization") || "";
  let q = "";
  try { q = new URL(req.url).searchParams.get("secret") || ""; } catch {}
  return hdr === `Bearer ${secret}` || q === secret;
}

async function processOneTick() {
  if (String(process.env.GEO_MARKETPLACE_SOURCE || "").trim().toLowerCase() !== "llm") return { skipped: "geo disabled" };
  const job = await claimNextJob();
  if (!job) return { idle: true };
  try {
    const total = (job.prompts || []).length;
    const start = Math.max(0, job.cursor || 0);
    if (start >= total) {
      await commitJobBatch({ jobId: job._id, domain: job.domain, allResponses: job.responses || [], newCursor: total, done: true });
      return { domain: job.domain, done: true, processed: 0 };
    }
    const engines = (job.engines && job.engines.length) ? job.engines : ["aioverviews", "perplexity", "claude"];
    const BUDGET = Number(process.env.GEO_WORKER_QUERY_BUDGET || 90);
    const batchSize = Math.max(4, Math.floor(BUDGET / Math.max(1, engines.length)));
    const batch = job.prompts.slice(start, start + batchSize);
    const promptObjs = batch.map((p, i) => ({ id: `gp${start + i + 1}`, theme: p.cluster || "geo", intent: p.intent || "", neutral: p.neutral !== false, prompt: p.prompt }));

    const sessions = await loadGeoSessions();
    const scan = await runGeoScan({
      mode: "live", transport: "browserless",
      brand: job.brand, clientDomain: job.clientDomain, competitors: job.competitors, competitorDomains: job.competitorDomains,
      industry: job.industry, location: job.location, regionLabel: job.regionLabel, proxyCountry: job.proxyCountry,
      engineKeys: engines, sessions, prompts: promptObjs,
    });
    const batchResponses = (scan && scan.responses) ? scan.responses : [];
    const allResponses = [...(job.responses || []), ...batchResponses];
    const newCursor = start + batch.length;
    const done = newCursor >= total;

    // Rebuild the geo-visibility payload from ALL responses collected so far. The report's
    // logic layer turns this into the full §20-25 model; collection_progress drives a hint.
    const geoPayload = {
      responses: allResponses,
      brandSet: (scan && scan.brandSet) || job.brandSet || [],
      clientDomain: job.clientDomain,
      competitorDomains: job.competitorDomains,
      competitors: job.competitorPairs || [],
      prompts: job.prompts.slice(0, newCursor).map((p) => p.prompt),
      all_prompts: job.prompts,
      engines,
      region: job.proxyCountry || "global",
      geo_insights: job.geo_insights || null,
      collection_progress: { done: newCursor, total, complete: done },
      errors: (scan && scan.errors ? scan.errors : []).map((e) => ({ engine: e.engine, error: e.error })),
    };
    await commitJobBatch({ jobId: job._id, domain: job.domain, allResponses, newCursor, done, geoPayload, brand: job.brand });
    return { domain: job.domain, processed: batch.length, cursor: newCursor, total, done };
  } catch (e) {
    await failJob(job._id, e?.message);
    return { domain: job.domain, error: String(e?.message || e).slice(0, 160) };
  }
}

export async function GET(req) {
  if (!authed(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await processOneTick();
  return Response.json({ ok: true, ...result });
}
export const POST = GET;
