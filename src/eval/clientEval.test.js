import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";
import * as market from "../market/index.js";
import { scoreCountries } from "./countryScore.js";
import { evaluateClient } from "./clientEval.js";

async function ev(mandateWanted) {
  const data = await demoAdapter();
  const p = data.portfolios.find(x => x.mandate === mandateWanted);
  const cs = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  return { e: evaluateClient(p, data.instruments, SIGNALS, PREV_SIGNALS, cs, null), p };
}

test("health is 0..100 with a band and non-empty drivers", async () => {
  const { e } = await ev("Advisory");
  assert.ok(e.health >= 0 && e.health <= 100);
  assert.ok(["strong", "watch", "strained"].includes(e.healthBand));
  assert.ok(e.drivers.length >= 1);
  assert.equal(typeof e.exposureScore, "number");
});

test("advisory actions never carry imperative trade verbs; discretionary distinguishes classes", async () => {
  const { e: adv } = await ev("Advisory");
  const advText = adv.actions.map(a => a.text.toLowerCase()).join(" ");
  for (const v of [" buy ", " sell ", "execute", "switch into"]) assert.ok(!advText.includes(v), v);
  assert.ok(adv.actions.every(a => a.mandateClass === "requires-client-instruction" || a.mandateClass === "inform-only"));

  const { e: disc } = await ev("Discretionary");
  assert.ok(disc.actions.some(a => a.mandateClass === "executable-under-mandate"));
});

test("every finding and action has a non-empty resolvable cite", async () => {
  const { e } = await ev("Advisory");
  for (const it of [...e.risks, ...e.opportunities, ...e.actions]) {
    assert.ok(it.cite.length >= 1, it.text);
    for (const cid of it.cite) assert.ok(e.citations[cid], `unresolved ${cid}`);
  }
});

test("a concentration risk is flagged for the Bergmann book with high-ish urgency", async () => {
  const { e } = await ev("Advisory");
  const conc = e.risks.find(r => /concentration/i.test(r.text));
  assert.ok(conc);
  assert.ok(conc.urgency >= 35);
});
