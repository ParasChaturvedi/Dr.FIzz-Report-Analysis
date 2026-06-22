// scripts/geo-worker-alias-hook.mjs
// Minimal ESM resolve hook so the standalone GEO worker can reuse the app's exact
// modules (geoStore, collector, …) with NO source changes. Next.js resolves two things
// raw Node does not: the "@/..." path alias (→ ./src/...) and EXTENSIONLESS relative
// imports ("./constants"). This hook adds both so `node scripts/geo-worker.mjs` works.
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const SRC = pathToFileURL(process.cwd() + "/src/").href;
const hasExt = (s) => /\.[a-z0-9]+$/i.test(s);
function withExt(urlStr) {
  if (hasExt(urlStr)) return urlStr;
  if (existsSync(new URL(urlStr + ".js"))) return urlStr + ".js";
  if (existsSync(new URL(urlStr + "/index.js"))) return urlStr + "/index.js";
  return urlStr + ".js";
}

export async function resolve(specifier, context, nextResolve) {
  // "@/x" → <cwd>/src/x(.js)
  if (specifier.startsWith("@/")) {
    return nextResolve(withExt(SRC + specifier.slice(2)), context);
  }
  // extensionless relative import → resolve against the parent + add .js / /index.js
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && !hasExt(specifier)) {
    return nextResolve(withExt(new URL(specifier, context.parentURL).href), context);
  }
  return nextResolve(specifier, context);
}
