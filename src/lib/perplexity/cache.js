// src/lib/perplexity/cache.js
// Simple in-memory TTL cache (Node runtime). Resets on server restart/cold start.

const STORE = new Map();

export function cacheGet(key) {
  const item = STORE.get(key);
  if (!item) return null;
  if (item.expiresAt && item.expiresAt < Date.now()) {
    STORE.delete(key);
    return null;
  }
  return item.value;
}

export function cacheSet(key, value, opts = {}) {
  const ttlMs = typeof opts.ttlMs === "number" ? opts.ttlMs : 10 * 60 * 1000; // 10 minutes
  STORE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key) {
  STORE.delete(key);
}
