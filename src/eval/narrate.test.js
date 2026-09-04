import test from "node:test";
import assert from "node:assert/strict";
import { templateNarration, narrateClient } from "./narrate.js";

const p = { name: "Bergmann Family Office", mandate: "Advisory", riskProfile: "Balanced", riskBand: "8–14% vol",
  goals: [{ name: "Zurich property acquisition", horizon: "Q2 2027" }, { name: "Retirement drawdown", horizon: "from 2034" }] };
const ce = { health: 62, healthBand: "watch", risks: [{ text: "Concentration is live in Taiwan.", severity: "high", urgency: 80 }], actions: [] };

test("templateNarration produces a thesis + summary with no imperative verbs", () => {
  const { thesis, summary } = templateNarration(ce, p);
  assert.ok(thesis.length > 20 && summary.length > 20);
  for (const v of ["buy ", "sell ", "execute ", "switch "]) {
    assert.ok(!(`${thesis} ${summary}`.toLowerCase().includes(v)));
  }
  assert.ok(/watch|strained|strong/.test(summary));
});

test("narrateClient falls back to the template when the LLM is unavailable", async () => {
  // no server in node:test → generateBrief returns { ok:false }
  const r = await narrateClient(ce, p, ["client wants the 2027 goal de-risked"]);
  assert.ok(r.thesis && r.summary);
});
