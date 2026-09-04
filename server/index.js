/**
 * Tiny API. Two jobs: hold the keys, and never let a slow upstream hang the UI.
 *   GET  /api/signals?countries=TWN,SAU     -> normalised CountrySignal map
 *   POST /api/llm  {system, prompt, schema} -> parsed JSON result
 *   GET  /api/gdelt?countries=SGP,TWN        -> live narrative tone (GDELT)
 *   GET  /api/health
 */
import "dotenv/config";
import express from "express";
import { fetchWorldMonitor } from "./worldmonitor.js";
import { callLLM } from "./llm.js";
import { runPolicySentinelScan } from "./policy-sentinel.js";
import { toneFor } from "./providers/gdelt.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

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

/** Live narrative tone. Free, keyless, 15-minute refresh upstream. */
app.get("/api/gdelt", async (req, res) => {
  const isos = String(req.query.countries || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!isos.length) return res.status(400).json({ error: "countries is required" });
  try {
    res.json(await toneFor(isos.slice(0, 12), { days: Number(req.query.days) || 14 }));
  } catch (err) {
    console.warn("[gdelt]", err.message);
    res.status(502).json({ error: err.message, readings: {}, failures: [] });
  }
});

app.post("/api/llm", async (req, res) => {
  try {
    res.json({ result: await callLLM(req.body) });
  } catch (err) {
    console.warn("[llm]", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/policy-scan", async (req, res) => {
  try {
    res.json(await runPolicySentinelScan(req.body || {}));
  } catch (err) {
    console.warn("[policy-scan]", err.message);
    res.status(502).json({ error: err.message });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`api on http://localhost:${port}`));
