/**
 * Vercel entry for /api/llm — the route the browser has always called.
 *
 * server/index.js serves this locally, but that Express app does not deploy, so
 * on the deployed site the call 404'd and src/llm/client.js silently fell back
 * to its deterministic template. The fallback is meant for a model outage, not
 * for a missing route: nothing on the page said the LLM was never reachable.
 *
 * The key stays server-side here exactly as it does locally.
 */
import { callLLM } from "../server/llm.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    // 503, not 500: the client's template fallback is the correct response to
    // this, and the message names the fix rather than leaving a blank failure.
    return res.status(503).json({ error: "No LLM key configured on the server — set ANTHROPIC_API_KEY in the Vercel project's environment variables." });
  }
  try {
    const { system, prompt, schema } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    res.status(200).json({ result: await callLLM({ system, prompt, schema }) });
  } catch (err) {
    console.warn("[llm]", err.message);
    res.status(502).json({ error: err.message });
  }
}
