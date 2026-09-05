import test, { after } from "node:test";
import assert from "node:assert/strict";
import { templateNarration, narrateClient, validateAiScore, factsHash, askCopilot } from "./narrate.js";
import { AI_SCORE_BAND } from "./rubric.js";

const p = { name: "Bergmann Family Office", ref: "PF-0003", mandate: "Advisory", riskProfile: "Balanced", riskBand: "8–14% vol",
  goals: [{ name: "Zurich property acquisition", horizon: "Q2 2027" }, { name: "Retirement drawdown", horizon: "from 2034" }],
  positions: [{ instrumentId: "TSM", weightPct: 12 }, { instrumentId: "DBS", weightPct: 8 }],
  relationship: {
    last: { date: "12 Aug 2026", channel: "video call" }, behaviour: "Cautious, prefers written follow-up.",
    concerns: ["Wants the Zurich purchase de-risked."], points: ["Confirm the 2027 timeline still holds."],
    objections: [["Why not just hold more cash?", "Cash drags on the funding goal over a 25-year horizon."]]
  } };
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
  actions: [{ kind: "Reduce risk", category: "rebalancing", title: "Trim the concentrated sleeve.", why: "Taiwan exposure sits above the mandate line.", priority: "high" }],
  complianceChecks: [{ item: "Tax domicile", status: "clear", detail: "On record: Switzerland." }]
};

const grounding = {
  household: false,
  positions: [{ instrumentId: "TSM", name: "TSMC", weightPct: 12, riskDelta: 18, currency: "USD", liquidityTier: "Daily",
    countries: [{ iso3: "TWN", weight: 1 }] }],
  countrySignals: [{ iso3: "TWN", name: "Taiwan", riskDelta: 18 }],
  fallbackConcentration: { pct: 41, countries: ["TWN"] },
  chokepoints: [{ name: "Taiwan Strait", weightPct: 18.5 }],
  policyStance: null,
  baseCurrency: "USD",
  taxDomicile: "Switzerland",
  lifeStage: "Wealth accumulation",
  objectives: "Preserve family wealth and fund the Zurich property purchase.",
  sourceOfWealth: "Inherited",
  pepStatus: "No",
  mandateBands: [{ assetClass: "Equity", min: 20, target: 40, max: 60, maxSingle: 15, notes: "" }]
};

test("templateNarration produces a prose overview (not bullets), no imperative verbs or risk talk", () => {
  const { overview, health, healthBand, concentration, scoreSource, risks, opportunities, actions, relationship, physicalConcentration } =
    templateNarration(ce, p, grounding);
  assert.equal(typeof overview, "string");
  assert.ok(overview.split(/\s+/).filter(Boolean).length <= 100);
  assert.ok(!overview.includes("\n") && !/^[-*•]/.test(overview.trim()), "overview must be prose, not a bullet list");
  for (const v of ["buy ", "sell ", "execute ", "switch "]) {
    assert.ok(!overview.toLowerCase().includes(v));
  }
  assert.ok(!/this week|urgent|health reads|opportunit|^risk/i.test(overview), "overview must describe the client/portfolio, not risk/health state");
  assert.ok(!/TSM|DBS/.test(overview), "overview should stay general, not name specific positions");
  assert.ok(overview.includes("Switzerland"), "overview surfaces tax domicile when present in grounding");
  assert.equal(health, ce.health);
  assert.equal(healthBand, ce.healthBand);
  assert.deepEqual(concentration, grounding.fallbackConcentration);
  assert.equal(scoreSource, "deterministic");
  assert.deepEqual(risks, [{ text: ce.risks[0].text, severity: ce.risks[0].severity, category: "concentration" }]);
  assert.deepEqual(opportunities, [{ text: ce.opportunities[0].text }]);
  assert.deepEqual(actions, [{ kind: "Reduce Risk", category: "rebalancing", title: ce.actions[0].text, why: ce.actions[0].reason, priority: "high" }]);
  assert.equal(relationship.concerns.length, 1);
  assert.equal(relationship.talkingPoints.length, 1);
  assert.deepEqual(relationship.objections, [{ question: p.relationship.objections[0][0], answer: p.relationship.objections[0][1] }]);
  assert.equal(relationship.sentiment, "Cautious", "the fixture has a standing concern and an objection, so the keyword fallback reads Cautious");
  assert.deepEqual(physicalConcentration, grounding.chokepoints, "deterministic fallback restates the bank's own chokepoint figures verbatim");
});

test("templateNarration's action priority follows the deterministic urgency thresholds (URGENT_CUTOFF/URGENCY.severityBase.medium)", () => {
  const high = templateNarration({ ...ce, actions: [{ ...ce.actions[0], urgency: 70 }] }, p, grounding).actions[0];
  const medium = templateNarration({ ...ce, actions: [{ ...ce.actions[0], urgency: 40 }] }, p, grounding).actions[0];
  const low = templateNarration({ ...ce, actions: [{ ...ce.actions[0], urgency: 10 }] }, p, grounding).actions[0];
  assert.equal(high.priority, "high");
  assert.equal(medium.priority, "medium");
  assert.equal(low.priority, "low");
});

test("templateNarration returns relationship: null when the portfolio has no relationship record", () => {
  const { relationship } = templateNarration(ce, { ...p, relationship: undefined }, grounding);
  assert.equal(relationship, null);
});

test("templateNarration omits the tax-domicile clause when grounding has none", () => {
  const { overview } = templateNarration(ce, p, { ...grounding, taxDomicile: null });
  assert.ok(!/tax domicile/i.test(overview));
});

test("templateNarration produces complianceChecks grounded in pepStatus/taxDomicile", () => {
  const { complianceChecks } = templateNarration(ce, p, grounding);
  assert.ok(complianceChecks.some(c => c.item === "PEP status" && c.status === "clear"));
  assert.ok(complianceChecks.some(c => c.item === "Tax domicile" && /Switzerland/.test(c.detail)));
  assert.ok(complianceChecks.some(c => c.item === "Concentration policy" && c.status === "watch"),
    "the fixture's clientEval has a concentration risk finding, so this should read watch");
});

test("templateNarration's PEP check flags watch when pepStatus is Yes", () => {
  const { complianceChecks } = templateNarration(ce, p, { ...grounding, pepStatus: "Yes" });
  assert.ok(complianceChecks.some(c => c.item === "PEP status" && c.status === "watch"));
});

test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief's fetch("/api/llm") throws (no base URL) → { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"], grounding);
  assert.equal(typeof r.overview, "string");
  assert.equal(r.health, ce.health);
  assert.deepEqual(r.concentration, grounding.fallbackConcentration);
  assert.equal(r.scoreSource, "deterministic");
  assert.equal(r.risks.length, 1);
  assert.equal(r.opportunities.length, 1);
  assert.equal(r.actions.length, 1);
  assert.equal(r.relationship.concerns.length, 1);
  assert.equal(r.relationship.sentiment, "Cautious");
  assert.ok(r.complianceChecks.length > 0);
  assert.deepEqual(r.physicalConcentration, grounding.chokepoints);
  assert.equal(r.actions[0].priority, "high", "urgency 70 on the fixture action clears URGENT_CUTOFF");
});

const base = () => ({
  overview: "A balanced mandate built to fund two goals.",
  health: 55, concentration: { pct: 40, countries: ["TWN"] },
  risks: [], opportunities: [], actions: [], relationship: null,
  complianceChecks: [],
  physicalConcentration: []
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

test("validateAiScore rejects an action with a missing or invalid priority", () => {
  const missing = { ...base(), actions: [{ kind: "Reduce risk", category: "rebalancing", title: "Trim the sleeve.", why: "Concentration." }] };
  const invalid = { ...base(), actions: [{ ...aiExtras.actions[0], priority: "urgent" }] };
  assert.equal(validateAiScore(missing, ["TWN"]), false);
  assert.equal(validateAiScore(invalid, ["TWN"]), false);
});

test("validateAiScore rejects an imperative verb inside a risk, opportunity, or action", () => {
  assert.equal(validateAiScore({ ...base(), risks: [{ text: "Sell the position before it worsens.", severity: "high", category: "drift" }] }, ["TWN"]), false);
  assert.equal(validateAiScore({ ...base(), opportunities: [{ text: "Buy into the Vietnam easing cycle." }] }, ["TWN"]), false);
  assert.equal(validateAiScore({ ...base(), actions: [{ kind: "Rebalance", category: "rebalancing", title: "Execute the trim.", why: "Concentration." }] }, ["TWN"]), false);
});

test("validateAiScore rejects an empty overview", () => {
  assert.equal(validateAiScore({ ...base(), overview: "" }, ["TWN"]), false);
});

test("validateAiScore rejects a health score out of range", () => {
  assert.equal(validateAiScore({ ...base(), health: 140 }, ["TWN"]), false);
});

test("validateAiScore accepts a health/concentration reading with no reference given (shape-only check)", () => {
  assert.equal(validateAiScore({ ...base(), ...aiExtras }, ["TWN"]), true);
});

test("validateAiScore accepts a health score right at the edge of the reference band", () => {
  const data = { ...base(), ...aiExtras, health: 55 + AI_SCORE_BAND };
  assert.equal(validateAiScore(data, ["TWN"], { health: 55, concentrationPct: 40 }), true);
});

test("validateAiScore rejects a health score one point past the reference band", () => {
  const data = { ...base(), health: 55 + AI_SCORE_BAND + 1 };
  assert.equal(validateAiScore(data, ["TWN"], { health: 55, concentrationPct: 40 }), false);
});

test("validateAiScore rejects a health score below the reference band", () => {
  const data = { ...base(), health: 55 - AI_SCORE_BAND - 1 };
  assert.equal(validateAiScore(data, ["TWN"], { health: 55, concentrationPct: 40 }), false);
});

test("validateAiScore rejects a concentration.pct past the reference band", () => {
  const data = { ...base(), concentration: { pct: 40 + AI_SCORE_BAND + 1, countries: ["TWN"] } };
  assert.equal(validateAiScore(data, ["TWN"], { health: 55, concentrationPct: 40 }), false);
});

const chokeRef = { health: 55, concentrationPct: 40, chokepoints: [{ name: "Taiwan Strait", weightPct: 18.5 }] };

test("validateAiScore accepts a physicalConcentration entry within the reference band", () => {
  const data = { ...base(), physicalConcentration: [{ name: "Taiwan Strait", weightPct: 18.5 + AI_SCORE_BAND }] };
  assert.equal(validateAiScore(data, ["TWN"], chokeRef), true);
});

test("validateAiScore rejects a physicalConcentration entry past the reference band", () => {
  const data = { ...base(), physicalConcentration: [{ name: "Taiwan Strait", weightPct: 18.5 + AI_SCORE_BAND + 1 }] };
  assert.equal(validateAiScore(data, ["TWN"], chokeRef), false);
});

test("validateAiScore rejects a physicalConcentration entry naming a chokepoint not in the reference", () => {
  const data = { ...base(), physicalConcentration: [{ name: "Strait of Hormuz", weightPct: 18.5 }] };
  assert.equal(validateAiScore(data, ["TWN"], chokeRef), false);
});

test("validateAiScore rejects any physicalConcentration entry when the reference has no chokepoints", () => {
  const data = { ...base(), physicalConcentration: [{ name: "Taiwan Strait", weightPct: 18.5 }] };
  assert.equal(validateAiScore(data, ["TWN"], { health: 55, concentrationPct: 40, chokepoints: [] }), false);
});

test("validateAiScore skips the physicalConcentration check entirely when no reference is given", () => {
  const data = { ...base(), ...aiExtras, physicalConcentration: [{ name: "Anything", weightPct: 999 }] };
  assert.equal(validateAiScore(data, ["TWN"]), true);
});

test("validateAiScore ignores the band check when the reference itself is missing a number", () => {
  const data = { ...base(), ...aiExtras, health: 99 };
  assert.equal(validateAiScore(data, ["TWN"], { health: undefined, concentrationPct: undefined }), true);
});

test("validateAiScore rejects a hallucinated country", () => {
  assert.equal(validateAiScore({ ...base(), concentration: { pct: 40, countries: ["ZZZ"] } }, ["TWN"]), false);
});

test("validateAiScore rejects a non-numeric concentration percentage", () => {
  assert.equal(validateAiScore({ ...base(), concentration: { pct: "high", countries: ["TWN"] } }, ["TWN"]), false);
});

test("validateAiScore rejects an overview over the 100-word cap", () => {
  const data = { ...base(), overview: Array(101).fill("word").join(" ") };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore accepts an overview at the 100-word cap", () => {
  const data = { ...base(), ...aiExtras, overview: Array(100).fill("word").join(" ") };
  assert.equal(validateAiScore(data, ["TWN"]), true);
});

const validRelationship = {
  summary: "Last spoke in August, video call; the client prefers written follow-up.",
  sentiment: "Cautious",
  concerns: ["Wants the Zurich purchase de-risked."],
  talkingPoints: ["Confirm the 2027 timeline still holds."],
  objections: [{ question: "Why not just hold more cash?", answer: "Cash drags on the funding goal over a 25-year horizon." }]
};

test("validateAiScore accepts a well-formed relationship object", () => {
  assert.equal(validateAiScore({ ...base(), ...aiExtras, relationship: validRelationship }, ["TWN"]), true);
});

test("validateAiScore rejects a relationship with a missing or invalid sentiment", () => {
  const { sentiment, ...noSentiment } = validRelationship;
  assert.equal(validateAiScore({ ...base(), relationship: noSentiment }, ["TWN"]), false);
  assert.equal(validateAiScore({ ...base(), relationship: { ...validRelationship, sentiment: "Ecstatic" } }, ["TWN"]), false);
});

test("validateAiScore rejects a relationship missing a required field", () => {
  const { summary, ...noSummary } = validRelationship;
  assert.equal(validateAiScore({ ...base(), relationship: noSummary }, ["TWN"]), false);
});

test("validateAiScore rejects a relationship with too many concerns", () => {
  const data = { ...base(), relationship: { ...validRelationship, concerns: Array(5).fill("A concern.") } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects an objection missing an answer", () => {
  const data = { ...base(), relationship: { ...validRelationship, objections: [{ question: "Why?" }] } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects an imperative verb inside relationship content", () => {
  const data = { ...base(), relationship: { ...validRelationship, summary: "Recommend the client sell before the review." } };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects more than 4 compliance checks", () => {
  const data = { ...base(), complianceChecks: Array(5).fill({ item: "Tax domicile", status: "clear", detail: "On record." }) };
  assert.equal(validateAiScore(data, ["TWN"]), false);
});

test("validateAiScore rejects a compliance check with an invalid status", () => {
  const data = { ...base(), complianceChecks: [{ item: "Tax domicile", status: "flagged", detail: "On record." }] };
  assert.equal(validateAiScore(data, ["TWN"]), false);
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

// askCopilot — previously had no test coverage at all. Mocks fetch (same approach as
// llm/client.test.js) so success/imperative-rejection/empty-answer/network-failure can each be
// exercised deterministically, rather than only ever observing the network-failure path the way
// a real dev-server-less test run naturally falls into.
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const mockAnswer = answer => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ result: { answer } }) });
};

test("askCopilot returns the model's answer when it's a clean, grounded response", async () => {
  mockAnswer("The Zurich property acquisition goal is 62% funded, targeted for Q2 2027.");
  const res = await askCopilot("What's the biggest funding goal?", p, grounding, []);
  assert.equal(res.ok, true);
  assert.equal(res.answer, "The Zurich property acquisition goal is 62% funded, targeted for Q2 2027.");
});

test("askCopilot rejects an answer containing an imperative trade verb", async () => {
  mockAnswer("You should sell the TSMC position before the next review.");
  const res = await askCopilot("What should I do about Taiwan exposure?", p, grounding, []);
  assert.equal(res.ok, false);
  assert.equal(res.answer, null);
});

test("askCopilot rejects an empty answer", async () => {
  mockAnswer("");
  const res = await askCopilot("Anything urgent?", p, grounding, []);
  assert.equal(res.ok, false);
  assert.equal(res.answer, null);
});

test("askCopilot returns ok:false when the network call fails entirely", async () => {
  globalThis.fetch = async () => { throw new Error("network down"); };
  const res = await askCopilot("What's the biggest funding goal?", p, grounding, []);
  assert.equal(res.ok, false);
  assert.equal(res.answer, null);
});

test("askCopilot's request never includes the client's real name", async () => {
  let sentBody;
  globalThis.fetch = async (url, opts) => {
    sentBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ result: { answer: "Fine either way." } }) };
  };
  await askCopilot("Any concerns?", p, grounding, []);
  assert.ok(!sentBody.prompt.includes(p.name), "the client's real name must never reach the model");
  assert.ok(sentBody.prompt.includes(p.ref), "the mandate reference should still identify the client internally");
});
