export const PERPLEXITY_CHAT_URL = "https://api.perplexity.ai/chat/completions";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function safeSnippet(text, maxLen = 280) {
  if (!text) return "";
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + "…" : oneLine;
}

function isLikelyHtmlEdgeBlock(text, contentType = "") {
  return (
    contentType.includes("text/html") ||
    /<html[\s>]/i.test(text) ||
    /openresty/i.test(text) ||
    /cdn-cgi\/challenge-platform/i.test(text) ||
    /cloudflare/i.test(text)
  );
}

function classifyEdge401({ status, text, contentType }) {
  const lower = String(text || "").toLowerCase();

  // Best-effort hints (still safe and generic)
  if (status === 401 || status === 403) {
    if (lower.includes("invalid") && lower.includes("token")) return "invalid_key";
    if (lower.includes("quota") || lower.includes("rate")) return "quota";
    return "blocked";
  }
  return "unknown";
}

/**
 * Calls Perplexity Chat Completions API.
 * - Robust error handling for Cloudflare/openresty HTML responses
 * - Optional response_format only included when provided
 * - Friendly messages for common 401/403/429 cases
 * - Adds minimal, non-sensitive diagnostics (status + content-type + edge detection)
 */
export async function perplexityChat({
  messages,
  response_format,
  temperature = 0.2,
  max_tokens = 1100,
  timeoutMs = 30000,
} = {}) {
  const apiKey = mustEnv("PERPLEXITY_API_KEY");

  // Prefer env, but allow fallback model (you can set PERPLEXITY_MODEL="sonar")
  const model = process.env.PERPLEXITY_MODEL || "sonar-pro";

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const body = {
      model,
      messages,
      temperature,
      max_tokens,
      ...(response_format ? { response_format } : {}),
    };

    const res = await fetch(PERPLEXITY_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // harmless but can help some gateways treat this as API traffic
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");

    // Parse JSON if possible (even if content-type is off)
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }

    if (!res.ok) {
      const apiMsg = json?.error?.message || json?.message || json?.error || "";

      const looksHtml = isLikelyHtmlEdgeBlock(text, contentType);
      const snippet = safeSnippet(text);

      let friendly = apiMsg || snippet || "unknown";
      let hint = "";

      if (looksHtml && (res.status === 401 || res.status === 403)) {
        const cls = classifyEdge401({
          status: res.status,
          text,
          contentType,
        });

        if (cls === "quota") {
          friendly =
            "Request blocked at the edge (401/403). This can happen after hitting rate/quota limits. Reduce concurrency, add backoff, or try again later / rotate the API key.";
        } else if (cls === "invalid_key") {
          friendly =
            "Request blocked at the edge (401/403). The API key appears invalid/revoked. Generate a new Perplexity API key and update PERPLEXITY_API_KEY.";
        } else {
          friendly =
            "Request blocked at the edge (401/403). This usually means the API key is invalid/revoked, API access/billing changed, or the key is temporarily blocked due to rate/quota limits.";
        }

        hint = ` (edge_block html=${looksHtml})`;
      } else if (res.status === 429) {
        friendly =
          "Rate limit exceeded (429). Slow down requests, reduce concurrency, and retry with exponential backoff.";
      } else if (res.status === 401) {
        friendly =
          apiMsg ||
          "Unauthorized (401). Check PERPLEXITY_API_KEY and account API access.";
      } else if (res.status === 403) {
        friendly =
          apiMsg ||
          "Forbidden (403). The key may not have access to this model/feature, or account access is restricted.";
      }

      // Include minimal diagnostics without leaking secrets:
      const diag = `status=${res.status} ct=${contentType || "unknown"}${hint}`;

      throw new Error(`Perplexity error (${res.status}): ${friendly} [${diag}]`);
    }

    const content = json?.choices?.[0]?.message?.content ?? "";
    return { raw: json, content, model };
  } finally {
    clearTimeout(t);
  }
}
