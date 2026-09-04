import test from "node:test";
import assert from "node:assert/strict";
import { templateNarration, narrateClient, validateAiScore, factsHash } from "./narrate.js";

const p = { name: "Bergmann Family Office", ref: "PF-0003", mandate: "Advisory", riskProfile: "Balanced", riskBand: "8–14% vol",
  goals: [{ name: "Zurich property acquisition", horizon: "Q2 2027" }, { name: "Retirement drawdown", horizon: "from 2034" }],
  positions: [{ instrumentId: "TSM", weightPct: 12 }, { instrumentId: "DBS", weightPct: 8 }] };
const ce = {
  health: 62, healthBand: "watch",
  risks: [{ text: "Concentration is live in Taiwan.", severity: "high", urgency: 80 }],
  opportunities: [{ text: "Policy is easing in Vietnam — supportive for the education goal.", urgency: 20 }],
  actions: [{ id: "a1", text: "Trim the concentrated sleeve toward the mandate line.", kind: "reduce-risk",
    urgency: 70, mandateClass: "requires-client-instruction", reason: "Concentration is live in Taiwan.", cite: ["pos:TSM"] }]
};
const aiExtras = {
  risks: [{ text: "Concentration is live in Taiwan.", severity: "high", category: "concentration" }],
  opportunities: [{ text: "Policy easing in Vietnam supports the education goal." }],
  actions: [{ kind: "Reduce risk", category: "rebalancing", title: "Trim the concentrated sleeve.", why: "Taiwan exposure sits above the mandate line." }]
};

const grounding = {
  household: false,
  positions: [{ instrumentId: "TSM", name: "TSMC", weightPct: 12, riskDelta: 18, currency: "USD", liquidityTier: "Daily",
    countries: [{ iso3: "TWN", weight: 1 }] }],
  countrySignals: [{ iso3: "TWN", name: "Taiwan", riskDelta: 18 }],
  fallbackConcentration: { pct: 41, countries: ["TWN"] },
  policyStance: null,
  baseCurrency: "USD",
  taxDomicile: "Switzerland",
  lifeStage: "Wealth accumulation",
  objectives: "Preserve family wealth and fund the Zurich property purchase.",
  sourceOfWealth: "Inherited"
};

test("templateNarration produces bullet-point explanation, no imperative verbs or risk talk", () => {
  const { explanation, health, healthBand, concentration, scoreSource, risks, opportunities, actions } =
    templateNarration(ce, p, grounding);
  assert.ok(Array.isArray(explanation) && explanation.length >= 2 && explanation.length <= 5);
  const joined = explanation.join(" ");
  assert.ok(joined.split(/\s+/).filter(Boolean).length <= 100);
  for (const v of ["buy ", "sell ", "execute ", "switch "]) {
    assert.ok(!joined.toLowerCase().includes(v));
  }
  assert.ok(!/this week|urgent|health reads|opportunit|risk/i.test(joined), "explanation must describe the client/portfolio, not risk/health state");
  assert.ok(!/TSM|DBS/.test(joined), "explanation should stay general, not name specific positions");
  assert.ok(explanation.some(b => b.includes("Switzerland")), "explanation surfaces tax domicile when present in grounding");
  assert.equal(health, ce.health);
  assert.equal(healthBand, ce.healthBand);
  assert.deepEqual(concentration, grounding.fallbackConcentration);
  assert.equal(scoreSource, "deterministic");
  assert.deepEqual(risks, [{ text: ce.risks[0].text, severity: ce.risks[0].severity, category: "concentration" }]);
  assert.deepEqual(opportunities, [{ text: ce.opportunities[0].text }]);
  assert.deepEqual(actions, [{ kind: "Reduce Risk", category: "rebalancing", title: ce.actions[0].text, why: ce.actions[0].reason }]);
});

test("templateNarration omits the tax-domicile bullet when grounding has none", () => {
  const { explanation } = templateNarration(ce, p, { ...grounding, taxDomicile: null });
  assert.ok(!explanation.some(b => /tax domicile/i.test(b)));
});

test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief's fetch("/api/llm") throws (no base URL) → { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"], grounding);
  assert.ok(Array.isArray(r.explanation) && r.explanation.length > 0);
  assert.equal(r.health, ce.health);
  assert.deepEqual(r.concentration, grounding.fallbackConcentration);
  assert.equal(r.scoreSource, "deterministic");
  assert.equal(r.risks.length, 1);
  assert.equal(r.opportunities.length, 1);
  assert.equal(r.actions.length, 1);
});

const base = () => ({
  explanation: ["A balanced mandate built to fund two goals."],
  health: 55, concentration: { pct: 40, countries: ["TWN"] },
  risks: [], opportunities: [], actions: []
});

test("validateAiScore accepts a well-formed AI response", () => {
  assert.equal(validateAiScore({ ...base(), ...aiExtras }, ["TWN"]), true);
});

test("validateAiScore rejects a risk with an invalid severity", () => {
  const data = { ...base(), risks: [{ text: "Concentration risk.", severity: "extreme", category: "concentration" }] };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects a risk with an invalid category", () => {
  const data = { ...base(), risks: [{ text: "Concentration risk.", severity: "high", category: "geopolitical" }] };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects more than 4 risks", () => {
  const data = { ...base(), risks: Array(5).fill({ text: "Concentration risk.", severity: "high", category: "concentration" }) };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects an action missing a required field", () => {
  const data = { ...base(), actions: [{ kind: "Reduce risk", category: "rebalancing", title: "Trim the sleeve." }] }; // no `why`
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects an action with an invalid category", () => {
  const data = { ...base(), actions: [{ kind: "Reduce risk", category: "market-timing", title: "Trim the sleeve.", why: "Concentration." }] };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects an imperative verb inside a risk, opportunity, or action", () => {
  assert.equal(validateAiScore({ ...base(), risks: [{ text: "Sell the position before it worsens.", severity: "high", category: "drift" }] }, ["TWN"]), false);
  assert.equal(validateAiScore({ ...base(), opportunities: [{ text: "Buy into the Vietnam easing cycle." }] }, ["TWN"]), false);
  assert.equal(validateAiScore({ ...base(), actions: [{ kind: "Rebalance", category: "rebalancing", title: "Execute the trim.", why: "Concentration." }] }, ["TWN"]), false);
});

test("validateAiScore rejects an empty or oversized explanation array", () => {
  assert.equal(validateAiScore({ ...base(), explanation: [] }, ["TWN"]), false);
  assert.equal(validateAiScore({ ...base(), explanation: Array(6).fill("A short bullet.") }, ["TWN"]), false);
});

test("validateAiScore rejects a health score out of range", () => {
  assert.equal(validateAiScore({ ...base(), health: 140 }, ["TWN"]), false);
});

test("validateAiScore rejects a hallucinated country", () => {
  assert.equal(validateAiScore({ ...base(), concentration: { pct: 40, countries: ["ZZZ"] } }, ["TWN"]), false);
});

test("validateAiScore rejects a non-numeric concentration percentage", () => {
  assert.equal(validateAiScore({ ...base(), concentration: { pct: "high", countries: ["TWN"] } }, ["TWN"]), false);
});

test("validateAiScore rejects an explanation over the 100-word cap", () => {
  const data = { ...base(), explanation: [Array(101).fill("word").join(" ")] };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore accepts an explanation at the 100-word cap", () => {
  const data = { ...base(), ...aiExtras, explanation: [Array(100).fill("word").join(" ")] };
  assert.equal(validateAiScore(data, ["TWN"]), true);
});

test("factsHash changes when household toggles, stays stable otherwise", () => {
  const h1 = factsHash("p1", grounding);
  const h2 = factsHash("p1", { ...grounding, household: true });
  const h3 = factsHash("p1", grounding);
  assert.notEqual(h1, h2);
  assert.equal(h1, h3);
});

test("factsHash changes when a position's risk delta, currency, or liquidity tier changes", () => {
  const h1 = factsHash("p1", grounding);
  const movedRisk = { ...grounding, positions: [{ ...grounding.positions[0], riskDelta: 40 }] };
  const movedCcy = { ...grounding, positions: [{ ...grounding.positions[0], currency: "EUR" }] };
  const movedLiq = { ...grounding, positions: [{ ...grounding.positions[0], liquidityTier: "Illiquid" }] };
  assert.notEqual(h1, factsHash("p1", movedRisk));
  assert.notEqual(h1, factsHash("p1", movedCcy));
  assert.notEqual(h1, factsHash("p1", movedLiq));
});
