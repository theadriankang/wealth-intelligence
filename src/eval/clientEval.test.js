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
  assert.ok(disc.actions.some(a => a.mandateClass === "inform-only"));
});

test("every finding and action has a non-empty resolvable cite", async () => {
  const { e } = await ev("Advisory");
  for (const it of [...e.risks, ...e.opportunities, ...e.actions]) {
    assert.ok(it.cite.length >= 1, it.text);
    for (const cid of it.cite) assert.ok(e.citations[cid], `unresolved ${cid}`);
  }
});

test("health discriminates across the demo book — spread ≥ 30, none pinned, ≥2 bands", async () => {
  const data = await demoAdapter();
  const cs = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  const hs = data.portfolios.map(p => evaluateClient(p, data.instruments, SIGNALS, PREV_SIGNALS, cs, null));
  const vals = hs.map(e => e.health);
  assert.ok(Math.max(...vals) - Math.min(...vals) >= 30, `spread ${JSON.stringify(vals)}`);
  assert.ok(vals.every(v => v > 0 && v < 100), `pinned ${JSON.stringify(vals)}`);
  assert.ok(new Set(hs.map(e => e.healthBand)).size >= 2, "band discriminates");
});

test("a goal that crossed 80% funding this week is a high-severity risk with urgency >= 55", async () => {
  const data = await demoAdapter();
  const p = data.portfolios.find(x => x.id === "sg2208");
  const cs = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  const e = evaluateClient(p, data.instruments, SIGNALS, PREV_SIGNALS, cs, null);
  const cross = e.risks.find(r => /dropped through 80% funding confidence/.test(r.text));
  assert.ok(cross, "expected an 80% band-cross risk for sg2208");
  assert.equal(cross.severity, "high");
  assert.ok(cross.urgency >= 55, `urgency ${cross.urgency}`);
});

test("a concentration risk is flagged for the Bergmann book with high-ish urgency", async () => {
  const { e } = await ev("Advisory");
  const conc = e.risks.find(r => /concentration/i.test(r.text));
  assert.ok(conc);
  assert.ok(conc.urgency >= 35);
});
