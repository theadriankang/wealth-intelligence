import test from "node:test";
import assert from "node:assert/strict";
import { MARKET_HISTORY } from "./history.js";

const IDS = ["spx","nky","sx5e","ukx","smi","sti","hscei","kospi","tw-tech","nifty","ibov","brent","gold","ust10","usdsgd","vix"];

test("16 series, each with ascending weekly points spanning the window", () => {
  assert.deepEqual(Object.keys(MARKET_HISTORY).sort(), [...IDS].sort());
  for (const id of IDS) {
    const s = MARKET_HISTORY[id];
    assert.equal(s.id, id);
    assert.ok(s.label && s.unit !== undefined);
    assert.ok(s.points.length >= 130 && s.points.length <= 145, `${id} point count`);
    assert.equal(s.points[0].d, "2024-01-05");
    assert.match(s.points.at(-1).d, /^2026-09/);
    for (let i = 1; i < s.points.length; i++) {
      assert.ok(s.points[i].d > s.points[i - 1].d, `${id} dates ascending`);
      assert.equal(typeof s.points[i].c, "number");
      assert.ok(s.points[i].c > 0);
    }
  }
});

test("a mid-2025 volatility episode is visible in spx", () => {
  const pts = MARKET_HISTORY.spx.points;
  const win = (from, to) => pts.filter(p => p.d >= from && p.d < to).map(p => p.c);
  const vol = xs => { const r = xs.slice(1).map((c, i) => Math.log(c / xs[i])); const m = r.reduce((a, b) => a + b, 0) / r.length; return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length); };
  assert.ok(vol(win("2025-05-01", "2025-08-15")) > vol(win("2024-02-01", "2024-05-15")) * 1.4, "drawdown window is >1.4x calmer window");
});
