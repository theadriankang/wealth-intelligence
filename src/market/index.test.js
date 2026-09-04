import test from "node:test";
import assert from "node:assert/strict";
import { getSeries, latest, returns, volatility, percentileVsHistory } from "./index.js";

test("getSeries filters by date and handles unknown ids", () => {
  assert.equal(getSeries("nope").length, 0);
  const all = getSeries("spx");
  assert.ok(all.length > 100);
  const q2 = getSeries("spx", { from: "2025-04-01", to: "2025-06-30" });
  assert.ok(q2.length >= 10 && q2.length <= 16);
  assert.ok(q2.every(p => p.d >= "2025-04-01" && p.d <= "2025-06-30"));
});

test("latest returns the last point", () => {
  const l = latest("spx");
  assert.match(l.d, /^2026-09/);
  assert.equal(typeof l.c, "number");
});

test("volatility is higher across the 2025 stress window than a calm window", () => {
  const stressVol = volatility("spx", 12);   // covers ~mid-2026 tail; use a windowed helper instead:
  // window-anchored: compute vol of an explicit slice
  const slice = (from, to) => getSeries("spx", { from, to }).map(p => p.c);
  const v = xs => { const r = xs.slice(1).map((c, i) => Math.log(c / xs[i])); const m = r.reduce((a,b)=>a+b,0)/r.length; return Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/r.length) * Math.sqrt(52) * 100; };
  assert.ok(v(slice("2025-05-01","2025-08-15")) > v(slice("2024-02-01","2024-05-15")) * 1.3);
  assert.equal(typeof stressVol, "number");
});

test("returns and percentileVsHistory are sane", () => {
  assert.equal(typeof returns("spx", 26), "number");
  const p = percentileVsHistory("spx", "vol");
  assert.ok(p >= 0 && p <= 1);
  assert.equal(percentileVsHistory("nope"), 0);
});
