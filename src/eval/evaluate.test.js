import test from "node:test";
import assert from "node:assert/strict";
import { demoAdapter } from "../adapters/demo.js";
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";
import * as market from "../market/index.js";
import { runEvaluation, hashClient } from "./evaluate.js";

async function run(signals = SIGNALS) {
  const data = await demoAdapter();
  return runEvaluation({ portfolios: data.portfolios, instruments: data.instruments, signals, prevSignals: PREV_SIGNALS, market, policyScan: null });
}

test("evaluates every country and every client", async () => {
  const ev = await run();
  for (const iso of Object.keys(SIGNALS)) assert.ok(ev.countries[iso], iso);
  const data = await demoAdapter();
  for (const p of data.portfolios) assert.ok(ev.clients[p.id], p.id);
  assert.equal(typeof ev.at, "number");
  assert.ok(Array.isArray(ev.urgent));
  for (const p of data.portfolios) assert.equal(typeof ev.hash[p.id], "string");
});

test("hash is stable for the same inputs and moves when a signal worsens", async () => {
  const a = await run();
  const b = await run();
  const worse = structuredClone(SIGNALS);
  worse.TWN.riskDelta += 20; worse.TWN.instability = 95;
  const c = await run(worse);
  const anyId = Object.keys(a.clients)[0];
  assert.equal(a.hash[anyId], b.hash[anyId]);
  // at least one client's hash should change
  assert.ok(Object.keys(a.hash).some(id => a.hash[id] !== c.hash[id]));
});

test("hashClient is deterministic", () => {
  const ce = { health: 61, risks: [{ id: "f1", urgency: 80 }], actions: [{ id: "a1", urgency: 80 }] };
  assert.equal(hashClient(ce), hashClient(structuredClone(ce)));
});
