/**
 * Tiny API. Two jobs: hold the keys, and never let a slow upstream hang the UI.
 *   GET  /api/signals?countries=TWN,SAU     -> normalised CountrySignal map
 *   POST /api/llm  {system, prompt, schema} -> parsed JSON result
 *   GET  /api/health
 */
import "dotenv/config";
import express from "express";
import { fetchWorldMonitor } from "./worldmonitor.js";
import { callLLM } from "./llm.js";
import { runPolicySentinelScan } from "./policy-sentinel.js";
import { checkRateLimit, clientIp } from "./rate-limit.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

/** Neither /api/llm nor /api/policy-scan has any user-auth in front of it — this app has no
 * login system at all, so a real person and a script hitting the endpoint directly are
 * indistinguishable. This caps cost/abuse regardless of who's asking; see rate-limit.js for why
 * it's per-IP rather than any form of shared secret. */
function rateLimited(limit) {
  return (req, res, next) => {
    const { allowed, retryAfterSec } = checkRateLimit(clientIp(req), { limit });
    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: "Too many requests, try again shortly." });
    }
    next();
  };
}

const cache = new Map();
const TTL = 60_000;

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  offline: process.env.OFFLINE === "1",
  worldmonitorKey: !!process.env.WORLDMONITOR_API_KEY,
  tinyfishKey: !!process.env.TINYFISH_API_KEY,
  llm: process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.OPENAI_API_KEY ? "openai" : "none"
}));

app.get("/api/signals", async (req, res) => {
  const countries = String(req.query.countries || "").split(",").filter(Boolean);
  const key = countries.sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return res.json(hit.data);
  try {
    const data = await fetchWorldMonitor(countries);
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.warn("[signals]", err.message);
    res.status(502).json({ error: err.message, signals: {} });
  }
});

app.post("/api/llm", rateLimited(40), async (req, res) => {
  try {
    res.json({ result: await callLLM(req.body) });
  } catch (err) {
    console.warn("[llm]", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/policy-scan", rateLimited(10), async (req, res) => {
  try {
    res.json(await runPolicySentinelScan(req.body || {}));
  } catch (err) {
    console.warn("[policy-scan]", err.message);
    res.status(502).json({ error: err.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`api on http://localhost:${port}`));
