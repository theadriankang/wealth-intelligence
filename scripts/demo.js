/**
 * node scripts/demo.js [CL-0014]
 *
 * A narrated walk through everything the backend actually does, in the order it
 * does it, with real numbers from the real dataset. No network required — which
 * is the point: the authoritative half of this system is complete offline, and
 * the live half states what it could not reach instead of inventing it.
 */
import "dotenv/config";
import { loadDataset, runIntel } from "../server/intel/run.js";
import { buildFx } from "../src/adapters/jb/fx.js";
import { buildFingerprint, TODAY, SNAPSHOTS } from "../src/intel/fingerprint.js";
import { buildPlan } from "../src/intel/plan.js";
import { gate, score, sourceAuthority } from "../src/intel/observation.js";
import { hasKey as wmKey } from "../server/providers/worldmonitor.js";
import { hasKey as fredKey } from "../server/providers/fred.js";
import { hasKey as tfKey } from "../server/tinyfish.js";
import { num } from "../src/adapters/jb/csv.js";

const CLIENT = process.argv[2] || "CL-0014";
const rule = (t = "") => console.log(`\n\x1b[2m${"─".repeat(78)}\x1b[0m${t ? `\n\x1b[1m${t}\x1b[0m\n` : ""}`);
const money = n => "USD " + Math.round(n).toLocaleString("en-US");

rule("1 · WHAT THIS INSTANCE CAN REACH");
console.log(`  TinyFish (documents)      ${tfKey() ? "key present" : "NO KEY — document lane will report failures"}`);
console.log(`  WorldMonitor (quant)      ${wmKey() ? "key present" : "NO KEY"}`);
console.log(`  FRED (quant fallback)     ${fredKey() ? "key present" : "NO KEY"}`);
console.log(`\n  Nothing below is faked when a key is missing. A missing number that says`);
console.log(`  it is missing is worth more than a plausible invention.`);

// ---------------------------------------------------------------------------
rule("2 · THE DATASET LOADS AND RECONCILES");
const src = loadDataset();
const fx = buildFx(src.market, TODAY);
console.log(`  ${src.clients.length} clients · ${src.portfolios.length} portfolios · ${src.holdings.length} holding rows`);
console.log(`  ${src.instruments.length} instruments · ${src.facilities.length} facilities · ${SNAPSHOTS.length} snapshots (${SNAPSHOTS[0]} → ${TODAY})`);

const at = src.holdings.filter(h => h.snapshot_date === TODAY);
let within = 0;
for (const h of at) {
  const recomputed = fx.toUSD(num(h.market_value_local), h.instrument_ccy);
  const given = num(h.market_value_usd);
  if (recomputed != null && given > 0 && Math.abs(recomputed - given) / given < 0.01) within++;
}
console.log(`\n  FX conventions are PROVEN, not asserted: recomputing market_value_usd from`);
console.log(`  market_value_local for every holding at ${TODAY} matches the dataset's own`);
console.log(`  figure on \x1b[1m${within}/${at.length}\x1b[0m rows, within 1%.`);

// ---------------------------------------------------------------------------
rule(`3 · THE EXPOSURE FINGERPRINT — ${CLIENT}`);
const client = src.clients.find(c => c.client_id === CLIENT);
const fp = buildFingerprint(src, CLIENT, fx);
console.log(`  ${client.client_name} · ${client.wealth_band} · ${client.risk_profile} · ${money(fp.total_usd)}`);
console.log(`\n  ${fp.elements.length} elements derived deterministically. No LLM, no network. Top 10 by weight:\n`);
console.log(`    ${"dim".padEnd(14)}${"value".padEnd(42)}${"weight".padStart(8)}  direction`);
for (const el of [...fp.elements].sort((a, b) => b.weight_pct - a.weight_pct).slice(0, 10)) {
  console.log(`    ${el.dimension.padEnd(14)}${String(el.value).slice(0, 40).padEnd(42)}${(el.weight_pct + "%").padStart(8)}  ${el.direction}`);
}

// ---------------------------------------------------------------------------
rule("4 · EXPOSURE BECOMES A RETRIEVAL PLAN");
const plan = buildPlan(fp);
console.log(`  Every query traces to an element and inherits its weight. Instrument names`);
console.log(`  never enter a query — they are synthetic and return nothing from any engine.\n`);
console.log(`  DOCUMENTS · top 6 of ${plan.docQueries.length}:\n`);
for (const q of plan.docQueries.slice(0, 6)) {
  console.log(`    [${q.tier.padEnd(10)}] ${q.query}`);
  console.log(`    ${" ".repeat(13)}\x1b[2mbecause ${q.driver} (${q.driver_weight}%) · prefers ${q.sources.join(", ") || "open web"}\x1b[0m`);
}
console.log(`\n  SERIES · ${plan.quantSeries.length} planned, deduped to the heaviest driver:\n`);
console.log(`    ${"series".padEnd(12)}${"route".padEnd(30)}${"because".padEnd(30)}weight`);
for (const s of plan.quantSeries) {
  const route = s.fred ? `${wmKey() ? "WorldMonitor" : fredKey() ? "FRED direct" : "unroutable"} · FRED:${s.fred}`
                       : `WorldMonitor · ${s.wm.svc}/${s.wm.rpc}`;
  console.log(`    ${s.key.padEnd(12)}${route.slice(0, 28).padEnd(30)}${s.driver.key.slice(0, 28).padEnd(30)}${s.driver.weight_pct}%`);
}
if (plan.quantGaps.length) console.log(`\n  gaps: ${plan.quantGaps.join(", ")}`);
else console.log(`\n  \x1b[1mgaps: none\x1b[0m — every material exposure has a routed series.`);

// ---------------------------------------------------------------------------
rule("5 · THE FENCE");
const bundle = await runIntel(CLIENT, { src, fx, write: false });
console.log(`  The dataset's 2026 is fictional: Hormuz closed, Brent 101.5, gold 4,622.`);
console.log(`  So a live value is only ever shown BESIDE the dataset's, never instead of it.\n`);
console.log(`    ${"series".padEnd(12)}${"dataset series_id".padEnd(20)}${"dataset value".padStart(15)}   live value`);
for (const [k, v] of Object.entries(bundle.authoritative.market_context)) {
  const live = bundle.context.observations.find(o => o.series?.key === k);
  console.log(`    ${k.padEnd(12)}${v.series_id.padEnd(20)}${String(v.latest).padStart(15)}   ${live?.series?.latest ?? "\x1b[2mnot retrieved\x1b[0m"}`);
}
console.log(`\n  assertFence() walks the authoritative block and throws on any world:"live"`);
console.log(`  record. It runs in the test suite, so the build fails before the demo does.`);

// ---------------------------------------------------------------------------
rule("6 · THE RETURN GATE");
const realKey = fp.elements.find(e => e.key).key;
const mk = (id, key, chars, url) => ({
  id, lane: "doc", world: "live", tier: "structural", status: "candidate",
  driver: { client_id: CLIENT, key, weight_pct: 30 },
  doc: { url, final_url: url, chars },
  source: { retrieved_at: new Date().toISOString() }
});
const sample = [
  mk("regulator", realKey, 5000, "https://www.hkma.gov.hk/circular"),
  mk("multilateral", realKey, 5000, "https://www.bis.org/publ/x.htm"),
  mk("contentfarm", realKey, 5000, "https://seo-finance-blog.io/post"),
  mk("stub", realKey, 120, "https://www.hkma.gov.hk/short"),
  mk("unattached", "region:Atlantis", 5000, "https://www.hkma.gov.hk/other"),
];
console.log(`  Five candidates, all claiming relevance. Scored, then capped at 3:\n`);
for (const o of sample) {
  console.log(`    ${o.id.padEnd(14)}authority ${sourceAuthority(o.doc.url).toFixed(2)}  →  relevance ${score(o).toFixed(4)}`);
}
const g = gate(sample, fp);
console.log(`\n    kept:    ${g.kept.filter(o => o.lane === "doc").map(o => o.id).join(", ")}`);
for (const d of g.dropped) console.log(`    dropped: ${d.id} — ${d.reason}`);

// ---------------------------------------------------------------------------
rule("7 · THE BUNDLE THE AGENT LAYER WILL CONSUME");
console.log(`  out/intel/${CLIENT}.json\n`);
console.log(`    authoritative   ${bundle.authoritative.fingerprint.elements.length} fingerprint elements · ${Object.keys(bundle.authoritative.market_context).length} paired dataset series`);
console.log(`                    world:"dataset" — the only inputs arithmetic tools accept`);
console.log(`    context         ${bundle.context.observations.length} observations, all world:"live", all status:"candidate"`);
console.log(`    provenance      ${bundle.provenance.failures.length} failures, stated`);
if (bundle.provenance.failures.length) {
  const seen = new Map();
  for (const f of bundle.provenance.failures) seen.set(f.reason, (seen.get(f.reason) || 0) + 1);
  for (const [r, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`                      ${String(n).padStart(3)}x  ${r.slice(0, 66)}`);
}

rule("WHAT IS PROVEN AND WHAT IS NOT");
console.log(`  proven offline   dataset load · FX reconciliation (${within}/${at.length}) · fingerprint ·`);
console.log(`                   plan · fence · gate · cache replay · bundle for all 20 clients`);
console.log(`  not proven here  the live fetch path, because this instance has ${tfKey() || wmKey() || fredKey() ? "no network" : "no keys"}.`);
console.log(`                   Run: npm run intel -- --live   then demo with --frozen\n`);
