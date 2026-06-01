// src/lib/claude/client.js
// Drop-in replacement for src/lib/perplexity/client.js
// Uses the official Anthropic SDK (@anthropic-ai/sdk)

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";

// Turbopack (Next.js 15+/16+) sometimes skips .env.local for server Route Handlers.
// This reads it directly as a fallback, setting only vars not already in process.env.
(function loadEnvLocalFallback() {
  if (process.env.ANTHROPIC_API_KEY) return; // already loaded — skip
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch (_) {
    // Silent fail — if .env.local doesn't exist, rely on actual process.env
  }
})();

function mustEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`Server configuration error: ${name} is missing. Please restart the server.`);
  return v;
}

/**
 * Separate system messages from the messages array.
 * Perplexity accepts role:"system" inside the messages array.
 * Claude API requires a separate top-level `system` parameter.
 *
 * Returns { systemPrompt: string, userMessages: array }
 */
function separateSystemMessages(messages) {
  const systemParts = [];
  const userMessages = [];

  for (const msg of Array.isArray(messages) ? messages : []) {
    if (msg.role === "system") {
      systemParts.push(String(msg.content || "").trim());
    } else {
      userMessages.push(msg);
    }
  }

  return {
    systemPrompt: systemParts.join("\n\n"),
    userMessages,
  };
}

/**
 * claudeChat — drop-in replacement for perplexityChat.
 *
 * Accepts the same parameters as perplexityChat:
 *   { messages, response_format, temperature, max_tokens, timeoutMs }
 *
 * NOTE: response_format is accepted for backwards-compatibility but is NOT
 * sent to the Claude API as output_config. Instead, Claude returns JSON based
 * on the system prompt instructions ("Return ONLY valid JSON matching the schema"),
 * and the caller parses with extractJsonObjectLoose. This avoids ALL schema
 * validation 400 errors from Claude's strict output_config requirements.
 *
 * Key differences handled internally:
 * - System messages extracted from messages array into `system` param
 * - temperature is excluded for Opus 4.7 (causes 400)
 * - Prompt caching added on system prompts for cost savings
 * - Returns same shape: { raw, content, model }
 */
export async function claudeChat({
  messages,
  response_format, // kept for API compat — NOT forwarded to Claude API
  temperature = 0.2,
  max_tokens = 1100,
  timeoutMs = 30000,
  model: modelOverride,
} = {}) {
  const apiKey = mustEnv("ANTHROPIC_API_KEY");

  // Default model: claude-sonnet-4-6 for pipeline (cost-efficient)
  // Override via env CLAUDE_MODEL
  const model = modelOverride || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

  const client = new Anthropic({
    apiKey,
    timeout: timeoutMs,
  });

  // Separate system from user/assistant messages
  const { systemPrompt, userMessages } = separateSystemMessages(messages);

  // Note: claude-opus-4-7 does NOT support temperature — only include for sonnet/haiku
  const isOpus47 = model.includes("opus-4-7") || model === "claude-opus-4-7";

  const requestParams = {
    model,
    max_tokens: Math.max(max_tokens, 1024),
    messages: userMessages,
    ...(systemPrompt
      ? {
          system: [
            {
              type: "text",
              text: systemPrompt,
              // Prompt caching: cache stable system prompts for cost savings
              cache_control: { type: "ephemeral" },
            },
          ],
        }
      : {}),
    // Only include temperature for non-Opus-4-7 models
    ...(!isOpus47 ? { temperature } : {}),
    // Adaptive thinking for Opus 4.7
    ...(isOpus47 ? { thinking: { type: "adaptive" } } : {}),
  };

  try {
    const response = await client.messages.create(requestParams);

    // Extract text content from the response
    const content = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return { raw: response, content, model };
  } catch (err) {
    // Friendly error messages matching the original perplexity client's style
    const status = err?.status || err?.statusCode;
    const message = err?.message || String(err);

    if (status === 401) {
      throw new Error(
        `Claude API error (401): Invalid or missing API key. Check ANTHROPIC_API_KEY. [${message}]`
      );
    }
    if (status === 403) {
      throw new Error(
        `Claude API error (403): Access forbidden. The key may not have access to this model. [${message}]`
      );
    }
    if (status === 429) {
      throw new Error(
        `Claude API rate limit (429): Too many requests. [${message}]`
      );
    }
    if (status === 400) {
      throw new Error(
        `Claude API bad request (400): ${message}`
      );
    }

    throw new Error(`Claude API error: ${message}`);
  }
}

/**
 * claudeChatStream — streaming variant for long responses (deep analysis, PDF content).
 * Uses Opus 4.7 with adaptive thinking.
 * Returns the final complete message after streaming completes.
 */
export async function claudeChatStream({
  messages,
  max_tokens = 4000,
  timeoutMs = 120000,
  model: modelOverride,
  onText,
} = {}) {
  const apiKey = mustEnv("ANTHROPIC_API_KEY");
  const model = modelOverride || "claude-opus-4-7";

  const client = new Anthropic({
    apiKey,
    timeout: timeoutMs,
  });

  const { systemPrompt, userMessages } = separateSystemMessages(messages);

  const isOpus = model.includes("opus");

  const stream = await client.messages.stream({
    model,
    max_tokens: Math.max(max_tokens, 2048),
    ...(isOpus ? { thinking: { type: "adaptive" } } : {}),
    messages: userMessages,
    ...(systemPrompt
      ? {
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
        }
      : {}),
  });

  // Stream text events to caller if callback provided
  if (onText) {
    stream.on("text", onText);
  }

  const finalMessage = await stream.finalMessage();

  const content = finalMessage.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { raw: finalMessage, content, model };
}
