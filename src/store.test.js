import test from "node:test";
import assert from "node:assert/strict";
import { S, countryScore, clientEval, urgentTasks } from "./store.js";

test("selectors are null-safe before the first evaluation", () => {
  S.evaluation = null; S.portfolio = { id: "p1" };
  assert.equal(countryScore("TWN"), null);
  assert.equal(clientEval(), null);
  assert.deepEqual(urgentTasks(), []);
});

test("selectors read S.evaluation once populated", () => {
  S.portfolio = { id: "p1" };
  S.evaluation = {
    countries: { TWN: { score: 71 } },
    clients: { p1: { health: 60 } },
    urgent: [{ actionId: "a1" }]
  };
  assert.equal(countryScore("TWN").score, 71);
  assert.equal(clientEval().health, 60);
  assert.equal(urgentTasks().length, 1);
});
