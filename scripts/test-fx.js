/**
 * FX convention tests. Run: node scripts/test-fx.js
 *
 * These exist because an inverted rate does not throw — it just makes every
 * number wrong in a way that still looks like money.
 */
import { readFileSync } from "node:fs";
import { parseCsv } from "../src/adapters/jb/csv.js";
import { buildFx } from "../src/adapters/jb/fx.js";

const market = parseCsv(readFileSync("data/juliusbaer/market_context.csv", "utf8"));
const fx = buildFx(market, "2026-08-26");

let pass = 0, fail = 0;
const near = (a, b, tol = 0.01) => a !== null && Math.abs(a - b) <= tol;
function check(name, ok, got) {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}   got: ${got}`); }
}

console.log("\nFX conventions at 2026-08-26\n");

// USDSGD = 1.352, quoted SGD per USD. SGD 1,352 must be USD 1,000 — NOT USD 1,827.
check("SGD 1352 -> USD 1000", near(fx.toUSD(1352, "SGD"), 1000, 0.5), fx.toUSD(1352, "SGD"));
// USDHKD = 7.810
check("HKD 7810 -> USD 1000", near(fx.toUSD(7810, "HKD"), 1000, 0.5), fx.toUSD(7810, "HKD"));
// USDJPY = 159.0
check("JPY 159000 -> USD 1000", near(fx.toUSD(159000, "JPY"), 1000, 0.5), fx.toUSD(159000, "JPY"));
// EURUSD = 1.092, quoted USD per EUR. EUR 1,000 must be USD 1,092 — NOT USD 916.
check("EUR 1000 -> USD 1092", near(fx.toUSD(1000, "EUR"), 1092, 0.5), fx.toUSD(1000, "EUR"));
// GBPUSD = 1.282
check("GBP 1000 -> USD 1282", near(fx.toUSD(1000, "GBP"), 1282, 0.5), fx.toUSD(1000, "GBP"));
// USDIDR = 17050
check("IDR 17050000 -> USD 1000", near(fx.toUSD(17050000, "IDR"), 1000, 1), fx.toUSD(17050000, "IDR"));

check("USD passes through", fx.toUSD(500, "USD") === 500, fx.toUSD(500, "USD"));
check("unknown ccy -> null, not 1:1", fx.toUSD(500, "ZWL") === null, fx.toUSD(500, "ZWL"));
check("null amount -> null", fx.toUSD(null, "SGD") === null, fx.toUSD(null, "SGD"));
check("no series missing", fx.missing.length === 0, fx.missing.join(", "));

// Direction sanity: SGD and EUR must move OPPOSITE ways from a naive multiply.
check("SGD is weaker than USD (perUsd > 1)", fx.perUsd("SGD") > 1, fx.perUsd("SGD"));
check("EUR is stronger than USD (perUsd < 1)", fx.perUsd("EUR") < 1, fx.perUsd("EUR"));

// Cross-check against a real holdings row: market_value_local vs market_value_usd.
const holdings = parseCsv(readFileSync("data/juliusbaer/holdings.csv", "utf8"))
  .filter(h => h.snapshot_date === "2026-08-26");
let checked = 0, drift = 0, worst = null;
for (const h of holdings) {
  const ours = fx.toUSD(Number(h.market_value_local), h.instrument_ccy);
  const theirs = Number(h.market_value_usd);
  if (ours === null || !Number.isFinite(theirs) || theirs === 0) continue;
  const rel = Math.abs(ours - theirs) / Math.abs(theirs);
  checked++;
  if (rel > 0.01) { drift++; if (!worst || rel > worst.rel) worst = { id: h.instrument_id, ccy: h.instrument_ccy, ours, theirs, rel }; }
}
check(`holdings reconcile (${checked - drift}/${checked} within 1%)`, drift === 0,
      worst ? `worst ${worst.id} ${worst.ccy}: ours ${worst.ours.toFixed(0)} vs theirs ${worst.theirs.toFixed(0)} (${(worst.rel*100).toFixed(1)}%)` : "");

console.log(`\n${fail ? "FAILED" : "PASSED"}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
