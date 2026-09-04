/** npm run agent -- --client CL-0014 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { analystWalk } from "../server/agent/run.js";

const i = process.argv.indexOf("--client");
const id = i >= 0 ? process.argv[i + 1] : "CL-0014";
const bundle = JSON.parse(readFileSync(`out/intel/${id}.json`, "utf8"));
const out = analystWalk(bundle);

console.log(`\n${out.client.name} · ${out.client.wealth_band} · ${out.client.snapshot} · ${out.tool_calls} tool calls\n`);
console.log("FINDINGS");
for (const f of out.findings) {
  console.log(`\n  ▸ ${f.title}`);
  console.log(`    ${f.why}`);
  console.log(`    evidence: ${f.evidence.join("  ")}`);
}
if (out.divergences.length) {
  console.log(`\n\nDATASET vs LIVE — stated, not reconciled`);
  for (const d of out.divergences)
    console.log(`  ${d.key.padEnd(11)} dataset ${String(d.dataset).padStart(8)}   live ${String(d.live).padStart(8)}  (${d.gap_pct > 0 ? "+" : ""}${d.gap_pct}%, as of ${d.live_as_of})`);
}
console.log(`\n\nCITATIONS`);
console.log(`  approved and citable: ${out.citations.length}`);
for (const b of out.blocked_citations) console.log(`  BLOCKED ${b.id} — ${b.reason.split(". ")[0]}`);
if (out.unanswered.length) {
  console.log(`\nCOULD NOT ANSWER`);
  for (const u of out.unanswered) console.log(`  ${u}`);
}
console.log();
