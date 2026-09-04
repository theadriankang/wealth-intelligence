/**
 * The fence, tested where it is actually enforced: the tool boundary.
 *
 *   node scripts/test-agent.js
 *
 * assertFence() (test-intel.js) proves live records never sit in the
 * authoritative BLOCK. These prove the model cannot get a live number into a
 * CALCULATION even when the bundle is shaped correctly — which is the failure
 * that would actually reach a client.
 */
import { readFileSync } from "node:fs";
import { makeToolbox, approve, FenceError, requireAuthoritative } from "../src/agent/tools.js";
import { analystWalk } from "../server/agent/run.js";
import { TOOL_SCHEMAS, SYSTEM_PROMPT } from "../src/agent/contract.js";

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ok    ${l}`); } else { fail++; console.log(`  FAIL  ${l}`); } };
const throwsFence = (fn) => { try { fn(); return null; } catch (e) { return e instanceof FenceError ? e : null; } };
const section = s => console.log(`\n${s}\n`);

const bundle = JSON.parse(readFileSync("out/intel/CL-0014.json", "utf8"));
if (!bundle.context.observations.some(o => o.series?.key === "UST_10Y")) {
  bundle.context.observations.push({
    id: "test-live-ust10y",
    lane: "quant",
    status: "candidate",
    driver: { key: "rates:UST_10Y" },
    relevance: 1,
    series: {
      key: "UST_10Y",
      name: "US 10Y Treasury yield",
      latest: 4.31,
      unit: "percent",
      as_of: "test fixture",
      transform: "latest",
      note: "Seeded by scripts/test-agent.js when no provider keys are present."
    }
  });
}
if (!bundle.context.observations.some(o => o.series?.key === "VIX")) {
  bundle.context.observations.push({
    id: "test-live-vix",
    lane: "quant",
    status: "candidate",
    driver: { key: "risk:VIX" },
    relevance: 1,
    series: {
      key: "VIX",
      name: "CBOE Volatility Index",
      latest: 30.2,
      unit: "index",
      as_of: "test fixture",
      transform: "latest",
      note: "Seeded by scripts/test-agent.js when no provider keys are present."
    }
  });
}
if (!bundle.context.observations.some(o => o.lane === "doc")) {
  bundle.context.observations.push({
    id: "test-doc-policy",
    lane: "doc",
    status: "candidate",
    driver: { key: "policy:test" },
    relevance: 1,
    doc: {
      title: "Policy fixture",
      final_url: "https://example.test/policy",
      excerpt: "Seeded by scripts/test-agent.js when document providers are unavailable."
    }
  });
}

section("Measures carry provenance");
{
  const { tools } = makeToolbox(bundle);
  const c = tools.list_collateral()[0];
  ok(c.ltv.world === "dataset" && c.ltv.ref.startsWith("auth:"), `LTV is authoritative and refs ${c.ltv.ref}`);

  const h = tools.compute_headroom({ ltv: c.ltv, trigger: c.trigger });
  ok(h.value === 0.59, `headroom computes to ${h.value}pp`);
  ok(h.ref.includes(c.ltv.ref) && h.ref.includes(c.trigger.ref), "a derived Measure names both of its inputs");

  const ex = tools.list_exposures({ min_weight: 10 }).filter(e => e.dimension === "concentration");
  ok(new Set(ex.map(e => e.weight.ref)).size === ex.length, `${ex.length} concentration elements have ${ex.length} distinct refs`);
}

section("Arithmetic refuses everything without provenance");
{
  const { tools } = makeToolbox(bundle);
  const c = tools.list_collateral()[0];
  const live = tools.get_market_series({ key: "UST_10Y" }).live;

  ok(live && live.world === "live", `the live 10-year is readable and labelled world:"live" (${live?.value})`);

  const e1 = throwsFence(() => tools.compute_headroom({ ltv: live, trigger: c.trigger }));
  ok(e1 && /world:"live"/.test(e1.message), "a LIVE Measure in a calculation throws FenceError");
  ok(e1?.detail?.ref === "context:series.UST_10Y", "the error names the offending ref, so the refusal is auditable");

  const e2 = throwsFence(() => tools.compute_headroom({ ltv: 69.41, trigger: c.trigger }));
  ok(e2 && /raw number/.test(e2.message), "a RAW NUMBER throws — a literal the model typed has no provenance");

  const e3 = throwsFence(() => tools.compute_share({ part: { value: 5, ref: "made:up", world: "dataset" }, whole: c.ltv }));
  ok(e3 === null, "a well-formed dataset Measure is accepted (the gate checks shape and world, not truth)");

  const e4 = throwsFence(() => tools.compute_funding_ratio({ available: c.ltv, required: "60000000" }));
  ok(e4 && /not a Measure/.test(e4.message), "a string throws");
}

section("Citation is gated on a human");
{
  const b2 = JSON.parse(JSON.stringify(bundle));
  const { tools } = makeToolbox(b2);
  const doc = b2.context.observations.find(o => o.lane === "doc");

  const e = throwsFence(() => tools.cite({ observation_id: doc.id }));
  ok(e && /candidate/.test(e.message), "a fresh observation cannot be cited — it is a candidate");
  ok(b2.context.observations.every(o => o.status === "candidate"), "the pipeline approves nothing of its own");

  approve(b2, doc.id, "priscilla");
  const cited = tools.cite({ observation_id: doc.id });
  ok(cited.approved && cited.url, `after RM approval it cites: ${cited.url?.slice(0, 46)}...`);
  ok(b2.context.observations.find(o => o.id === doc.id).approved_by === "priscilla", "the approval records who gave it");
}

section("The walk");
{
  const out = analystWalk(JSON.parse(JSON.stringify(bundle)));
  ok(out.findings.length > 0, `${out.findings.length} findings from ${out.tool_calls} tool calls`);
  ok(out.findings.every(f => f.evidence?.length), "every finding carries evidence refs");
  ok(out.findings.every(f => f.evidence.every(r => r.startsWith("auth:") || r.startsWith("derived("))),
    "no finding cites a live ref as evidence for a number");
  ok(out.citations.length === 0 && out.blocked_citations.length > 0,
    `citations blocked until approval (${out.blocked_citations.length} blocked)`);
  ok(out.divergences.some(d => d.key === "VIX"), "dataset/live divergence is surfaced, not reconciled");
  ok(out.unanswered.length > 0, "what could not be answered is reported");
}

section("Contract");
{
  const names = TOOL_SCHEMAS.map(t => t.name);
  const { tools } = makeToolbox(bundle);
  ok(names.every(n => typeof tools[n] === "function"), `all ${names.length} schemas map to an implemented tool`);
  ok(!names.includes("approve"), "approve() is NOT in the model's toolbox — approval is the RM's");
  for (const n of ["compute_headroom", "compute_share", "compute_funding_ratio"]) {
    const s = TOOL_SCHEMAS.find(t => t.name === n);
    const props = Object.values(s.input_schema.properties);
    ok(props.every(p => p.type === "object" && p.properties?.ref),
      `${n} takes Measures, not numbers — the signature does the policing`);
  }
  ok(/never use it to compute/i.test(SYSTEM_PROMPT), "the prompt states the rule the tools enforce");
}

console.log(`\n${fail ? "FAILED" : "PASSED"}  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
