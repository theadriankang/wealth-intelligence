import test from "node:test";
import assert from "node:assert/strict";
import { templateNarration, narrateClient, validateAiScore, factsHash } from "./narrate.js";

const p = { name: "Bergmann Family Office", mandate: "Advisory", riskProfile: "Balanced", riskBand: "8–14% vol",
  goals: [{ name: "Zurich property acquisition", horizon: "Q2 2027" }, { name: "Retirement drawdown", horizon: "from 2034" }],
  positions: [{ instrumentId: "TSM", weightPct: 12 }, { instrumentId: "DBS", weightPct: 8 }] };
const ce = { health: 62, healthBand: "watch", risks: [{ text: "Concentration is live in Taiwan.", severity: "high", urgency: 80 }], actions: [] };

const grounding = {
  household: false,
  positions: [{ instrumentId: "TSM", name: "TSMC", weightPct: 12, riskDelta: 18,
    countries: [{ iso3: "TWN", weight: 1 }] }],
  countrySignals: [{ iso3: "TWN", name: "Taiwan", riskDelta: 18 }],
  fallbackConcentration: { pct: 41, countries: ["TWN"] },
  policyStance: null
};

test("templateNarration produces a thesis + summary with no imperative verbs or risk talk", () => {
  const { thesis, summary, health, healthBand, concentration, scoreSource } =
    templateNarration(ce, p, grounding.fallbackConcentration);
  assert.ok(thesis.length > 20 && summary.length > 20);
  for (const v of ["buy ", "sell ", "execute ", "switch "]) {
    assert.ok(!(`${thesis} ${summary}`.toLowerCase().includes(v)));
  }
  assert.ok(!/this week|urgent|health reads|opportunit/i.test(summary), "summary must describe the portfolio, not its risk/health state");
  assert.ok(!/TSM|DBS/.test(summary), "summary should stay general, not name specific positions");
  assert.equal(health, ce.health);
  assert.equal(healthBand, ce.healthBand);
  assert.deepEqual(concentration, grounding.fallbackConcentration);
  assert.equal(scoreSource, "deterministic");
});

test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief's fetch("/api/llm") throws (no base URL) → { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"], grounding);
  assert.ok(r.thesis && r.summary);
  assert.equal(r.health, ce.health);
  assert.deepEqual(r.concentration, grounding.fallbackConcentration);
  assert.equal(r.scoreSource, "deterministic");
});

test("validateAiScore accepts a well-formed AI response", () => {
  const data = { thesis: "A thesis long enough.", summary: "A summary long enough.", health: 55,
    concentration: { pct: 40, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), true);
});

test("validateAiScore rejects a health score out of range", () => {
  const data = { thesis: "t", summary: "s", health: 140, concentration: { pct: 40, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects a hallucinated country", () => {
  const data = { thesis: "t", summary: "s", health: 55, concentration: { pct: 40, countries: ["ZZZ"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects a non-numeric concentration percentage", () => {
  const data = { thesis: "t", summary: "s", health: 55, concentration: { pct: "high", countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects thesis+summary over the 80-word combined cap", () => {
  const data = { thesis: Array(50).fill("word").join(" "), summary: Array(40).fill("word").join(" "),
    health: 55, concentration: { pct: 40, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore accepts thesis+summary at the 80-word combined cap", () => {
  const data = { thesis: Array(40).fill("word").join(" "), summary: Array(40).fill("word").join(" "),
    health: 55, concentration: { pct: 40, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"]), true);
});

test("factsHash changes when household toggles, stays stable otherwise", () => {
  const h1 = factsHash("p1", grounding);
  const h2 = factsHash("p1", { ...grounding, household: true });
  const h3 = factsHash("p1", grounding);
  assert.notEqual(h1, h2);
  assert.equal(h1, h3);
});

test("factsHash changes when a position's risk delta changes", () => {
  const h1 = factsHash("p1", grounding);
  const moved = { ...grounding, positions: [{ ...grounding.positions[0], riskDelta: 40 }] };
  assert.notEqual(h1, factsHash("p1", moved));
});
