import test from "node:test";
import assert from "node:assert/strict";
import { collectUrgent } from "./urgent.js";

const mk = (id, name, actions) => ({ portfolioId: id, name, actions });

test("only actions at/above the cutoff, sorted desc, capped", () => {
  const evals = [
    mk("p1", "Alpha", [{ id: "a1", text: "x", urgency: 90, kind: "reduce-risk" }, { id: "a2", text: "y", urgency: 40, kind: "fit-needs" }]),
    mk("p2", "Beta", [{ id: "a1", text: "z", urgency: 70, kind: "use-opportunity" }])
  ];
  const u = collectUrgent(evals, 65);
  assert.deepEqual(u.map(t => t.text), ["x", "z"]);
  assert.equal(u[0].portfolioId, "p1");
  assert.equal(u[0].clientName, "Alpha");
  assert.equal(u[0].actionId, "a1");
});

test("caps at URGENT_STRIP_MAX", () => {
  const many = mk("p", "C", Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, text: `t${i}`, urgency: 80, kind: "reduce-risk" })));
  assert.equal(collectUrgent([many], 65).length, 8);
});
