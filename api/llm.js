import { callLLM } from "../server/llm.js";
import { checkRateLimit, clientIp } from "../server/rate-limit.js";

/**
 * Vercel counterpart to server/index.js's POST /api/llm — same shape (result key,
 * same status codes) so src/llm/client.js's generateBrief() needs no changes to
 * work against either. Without this file, a deployed build has no handler for
 * /api/llm at all: the request falls through to vercel.json's SPA rewrite and
 * gets index.html back instead of JSON, so every narrateClient/askCopilot call
 * fails over to its deterministic fallback, silently, on every deploy.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { allowed, retryAfterSec } = checkRateLimit(clientIp(req), { limit: 40 });
  if (!allowed) {
    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({ error: "Too many requests, try again shortly." });
  }
  try {
    res.status(200).json({ result: await callLLM(req.body || {}) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
