/**
 * npm run intel                      every client, cache-if-fresh
 * npm run intel -- --client CL-0014  one client
 * npm run intel -- --live            hit the network and record
 * npm run intel -- --frozen          replay the recording; network calls throw
 *
 * Rehearse and demo with --frozen. A pipeline that depends on a live call
 * succeeding on stage is not a pipeline, it is a bet.
 */
import "dotenv/config";
import { loadDataset, runIntel } from "../server/intel/run.js";
import { buildFx } from "../src/adapters/jb/fx.js";
import { TODAY } from "../src/intel/fingerprint.js";

const argv = process.argv.slice(2);
const flag = n => argv.includes(`--${n}`);
const opt = n => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };

const mode = flag("live") ? "live" : flag("frozen") ? "frozen" : "auto";
const dir = opt("data") || "data/juliusbaer";
const src = loadDataset(dir);
const fx = buildFx(src.market, TODAY);
const only = opt("client");
const clients = only ? [only] : src.clients.map(c => c.client_id);

console.log(`\nintel build · mode=${mode} · ${clients.length} client(s)\n`);

let ok = 0, failed = 0;
const allFailures = [];

for (const id of clients) {
  try {
    const b = await runIntel(id, { dir, mode, src, fx });
    const docs = b.context.observations.filter(o => o.lane === "doc").length;
    const quant = b.context.observations.filter(o => o.lane === "quant").length;
    const f = b.provenance.failures.length;
    console.log(`  ${id}  ${String(b.plan.quant_series).padStart(2)} series planned  ${String(b.plan.doc_queries).padStart(2)} queries  ->  ${String(quant).padStart(2)} quant  ${docs} docs  ${f ? `${f} failed` : ""}`);
    allFailures.push(...b.provenance.failures.map(x => `${id} ${x.lane}: ${x.reason}`));
    ok++;
  } catch (err) {
    console.log(`  ${id}  FAILED  ${err.message.split("\n")[0]}`);
    failed++;
  }
}

console.log(`\n${ok} bundle(s) -> out/intel/${failed ? `  ${failed} failed` : ""}`);

if (allFailures.length) {
  const seen = new Map();
  for (const f of allFailures) {
    const k = f.replace(/^CL-\d+ /, "");
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  console.log(`\nfailures (reported, never filled in):`);
  for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(3)}x  ${k}`);
}
