/**
 * Tests for the input pipeline. Same shape as test-fx.js: plain node, no runner.
 *
 *   node scripts/test-intel.js
 *
 * The load-bearing test is the fence. Everything else can regress and cost you a
 * feature; the fence regressing costs you the judge's trust in every number on
 * the screen.
 */
import "dotenv/config";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUANT_LEXICON, SERIES, hasQuantRow, seriesFor } from "../src/intel/quant-lexicon.js";
import { buildPlan } from "../src/intel/plan.js";
import { gate, assertFence, sourceAuthority, specificity, recencyDecay } from "../src/intel/observation.js";
import { makeCache } from "../server/providers/cache.js";
import { loadDataset, runIntel } from "../server/intel/run.js";
import { buildFingerprint, TODAY } from "../src/intel/fingerprint.js";
import { buildFx } from "../src/adapters/jb/fx.js";

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ok    ${label}`); } else { fail++; console.log(`  FAIL  ${label}`); } };
const section = s => console.log(`\n${s}\n`);

const src = loadDataset();
const fx = buildFx(src.market, TODAY);
const fp14 = buildFingerprint(src, "CL-0014", fx);

// ---------------------------------------------------------------- lexicon
section("Quant lexicon");
{
  const dangling = Object.entries(QUANT_LEXICON).flatMap(([k, v]) => v.filter(s => !SERIES[s]).map(s => `${k}->${s}`));
  ok(dangling.length === 0, `every lexicon row resolves to a series (${Object.keys(QUANT_LEXICON).length} rows, ${Object.keys(SERIES).length} series)`);

  const keys = new Set();
  for (const c of src.clients) {
    const fp = buildFingerprint(src, c.client_id, fx);
    if (fp) for (const el of fp.elements) if (el.key) keys.add(el.key);
  }
  const gaps = [...keys].filter(k => !hasQuantRow(k));
  ok(gaps.length === 0, `no coverage gaps across all 20 clients (${keys.size} distinct keys)${gaps.length ? ": " + gaps.join(", ") : ""}`);

  const paired = Object.values(SERIES).filter(s => s.dataset).length;
  ok(paired >= 20, `${paired} series name a dataset counterpart, so a live value is always shown beside the dataset's`);
  ok(Object.values(SERIES).every(s => s.fred || s.wm), "every series has a provider route");
}

// ------------------------------------------------------------------- plan
section("Plan");
{
  const plan = buildPlan(fp14);
  ok(plan.quantSeries.length > 0 && plan.docQueries.length > 0, `CL-0014 plans ${plan.quantSeries.length} series and ${plan.docQueries.length} queries`);

  const ids = plan.quantSeries.map(s => s.key);
  ok(new Set(ids).size === ids.length, "a series is requested once even when several exposures want it");

  const hkd = plan.quantSeries.find(s => s.key === "USDHKD");
  ok(hkd && hkd.driver.weight_pct >= 30, `USDHKD is attributed to its heaviest driver (${hkd?.driver.key} at ${hkd?.driver.weight_pct}%)`);

  const sorted = plan.quantSeries.every((s, i, a) => i === 0 || a[i - 1].driver.weight_pct >= s.driver.weight_pct);
  ok(sorted, "series are ranked by driver weight, so budget follows exposure");
  ok(seriesFor("currency:HKD")[0].dataset === "USDHKD", "currency:HKD pairs to the dataset's USDHKD row");

  // Regression: agenda items must carry the element's own key. Reconstructing it
  // as `dimension:value` mismatches 130 of 364 keyed elements across the book —
  // collateral, liabilities, concentration and rates, i.e. the sharpest drivers —
  // and the return gate then drops every document they produced.
  const keys = new Set(fp14.elements.map(e => e.key).filter(Boolean));
  ok(plan.docQueries.every(i => i.key && keys.has(i.key)), "every agenda item carries a key that exists in the fingerprint");
  ok(plan.docQueries.some(i => i.key !== `${i.dimension}:${i.driver.split(": ").slice(1).join(": ")}`),
    "at least one item's real key differs from dimension:value — the case that used to be dropped");
}

// ------------------------------------------------------------------- gate
section("Return gate");
{
  const mk = (id, key, over) => ({
    id, lane: "doc", world: "live", tier: "structural", status: "candidate",
    driver: { client_id: "CL-0014", key, weight_pct: 30 },
    doc: { url: "https://www.hkma.gov.hk/a", final_url: "https://www.hkma.gov.hk/a", chars: 5000 },
    source: { retrieved_at: new Date().toISOString() }, ...over
  });
  const real = fp14.elements.find(e => e.key).key;

  const { kept, dropped } = gate([mk("a", real), mk("b", "region:Atlantis")], fp14);
  ok(kept.length === 1 && kept[0].id === "a", "an observation that relinks to a fingerprint element is kept");
  ok(dropped.some(d => d.id === "b"), "an observation that relinks to nothing is dropped, not merely deprioritised");

  const many = Array.from({ length: 8 }, (_, i) => mk(`x${i}`, real));
  ok(gate(many, fp14).kept.filter(o => o.lane === "doc").length === 3, "documents are capped at 3 per client");

  ok(sourceAuthority("https://www.mas.gov.sg/x") > sourceAuthority("https://www.bis.org/x"), "a regulator outranks a multilateral");
  ok(sourceAuthority("https://www.bis.org/x") > sourceAuthority("https://contentfarm.io/x"), "a multilateral outranks the open web");
  ok(recencyDecay("structural", "2020-01-01") === 1.0, "structural material does not decay");
  ok(recencyDecay("event", "2020-01-01") < 0.3, "event material decays hard");
  ok(specificity({ lane: "doc", doc: { chars: 100 } }) < specificity({ lane: "doc", doc: { chars: 5000 } }), "a stub scores below a page of prose");
}

// ------------------------------------------------------------------ cache
section("Cache and replay");
{
  // outside the repo: the cache test must not leave artefacts in .cache/ or
  // depend on delete permissions where the repo happens to live.
  const dir = join(mkdtempSync(join(tmpdir(), "wi-cache-")), "intel");
  let calls = 0;
  const fetcher = async () => { calls++; return { v: calls }; };
  const id = { provider: "test", endpoint: "e", params: { a: 1 } };

  const live = makeCache({ dir, mode: "live" });
  await live.through(id, 1000, fetcher);
  ok(calls === 1, "live mode fetches and records");

  const auto = makeCache({ dir, mode: "auto" });
  const r = await auto.through(id, 60_000, fetcher);
  ok(calls === 1 && r.cached, "auto mode replays a fresh recording without fetching");

  const frozen = makeCache({ dir, mode: "frozen" });
  const hit = await frozen.through(id, Infinity, fetcher);
  ok(hit.cached && calls === 1, "frozen mode replays the recording");

  let threw = false;
  try { await frozen.through({ provider: "test", endpoint: "missing", params: {} }, Infinity, fetcher); }
  catch { threw = true; }
  ok(threw, "frozen mode THROWS on a miss rather than returning a silent empty result");
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

// ------------------------------------------------------------------ fence
section("The fence");
{
  let threw = false;
  try { assertFence({ authoritative: { fingerprint: { world: "live" } }, context: { observations: [] } }); }
  catch { threw = true; }
  ok(threw, "a live record anywhere inside `authoritative` is a build failure");

  threw = false;
  try { assertFence({ authoritative: {}, context: { observations: [{ id: "x", world: "live", status: "approved" }] } }); }
  catch { threw = true; }
  ok(threw, "the pipeline cannot pre-approve its own output; approval is the RM's");

  ok(assertFence({ authoritative: { world: "dataset" }, context: { observations: [{ id: "x", world: "live", status: "candidate" }] } }),
    "a correctly fenced bundle passes");
}

// -------------------------------------------------- offline end-to-end
section("End to end, no keys, no network");
{
  const bundle = await runIntel("CL-0014", { src, fx, write: false });
  ok(bundle.authoritative.fingerprint.elements.length > 0, `the authoritative half builds with zero keys (${bundle.authoritative.fingerprint.elements.length} elements)`);
  ok(Object.keys(bundle.authoritative.market_context).length > 0,
    `${Object.keys(bundle.authoritative.market_context).length} dataset counterpart series are attached for pairing`);
  ok(bundle.provenance.failures.length > 0, "missing providers are reported as failures, not silently skipped");
  ok(bundle.context.observations.every(o => o.world === "live"), "everything in context is live");
  ok(bundle.authoritative.market_context.USDHKD?.latest === 7.81, "dataset USDHKD is 7.81, straight from market_context.csv");

  const all = [];
  for (const c of src.clients) all.push(await runIntel(c.client_id, { src, fx, write: false }));
  ok(all.length === 20, "all 20 clients build a bundle offline");
  ok(all.every(b => b.plan.quant_gaps.length === 0), "no client has an unrouted material exposure");
}

console.log(`\n${fail ? "FAILED" : "PASSED"}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
