import test from "node:test";
import assert from "node:assert/strict";
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";
import * as market from "../market/index.js";
import { scoreCountries } from "./countryScore.js";

test("high-instability country scores high; calm country scores low", () => {
  const scores = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  assert.ok(scores.TWN.score > scores.USA.score);
  assert.ok(["high", "acute"].includes(scores.TWN.band));
  assert.ok(["low", "elevated"].includes(scores.USA.band));
});

test("trend is positive when this week's signal worsened vs last", () => {
  const scores = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  // PREV_SIGNALS shrinks riskDelta to 15% and empties events → this week is worse for a stressed country
  assert.ok(scores.TWN.trend > 0);
});

test("drivers are the top 3 contributors, descending", () => {
  const d = scoreCountries(SIGNALS, PREV_SIGNALS, market).TWN.drivers;
  assert.equal(d.length, 3);
  assert.ok(d[0].contribution >= d[1].contribution && d[1].contribution >= d[2].contribution);
  assert.ok(typeof d[0].label === "string");
});

test("every signal iso gets a score in 0..100", () => {
  const scores = scoreCountries(SIGNALS, PREV_SIGNALS, market);
  for (const iso of Object.keys(SIGNALS)) {
    assert.ok(scores[iso].score >= 0 && scores[iso].score <= 100, iso);
  }
});
