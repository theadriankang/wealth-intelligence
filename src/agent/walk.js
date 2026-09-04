/**
 * Runs the analysis over one bundle.
 *
 * Lives in src/ because it runs in BOTH places: the CLI (scripts/run-agent.js)
 * and the browser. It is pure — no network, no LLM, no node builtins — so the
 * cockpit can re-run the whole walk on every approval and show the citation gate
 * opening live, rather than rendering a result computed somewhere else.
 *
 * Two paths, one toolbox:
 *   - with an LLM key, the model drives (tool-use loop, `llmWalk`)
 *   - without one, `analystWalk` calls the same tools in a fixed order
 *
 * The deterministic path is not a stub to be replaced. It is the control: it
 * proves the toolbox produces a usable brief on its own, so when the model path
 * produces something different you know whether the difference came from the
 * data or from the model. It also means the demo has no key dependency.
 */
import { makeToolbox, FenceError } from "./tools.js";

const near = (m, unit = "") =>
  m.unit === "USD" ? `USD ${Math.round(m.value).toLocaleString("en-US")}` : `${m.value}${unit}`;

export function analystWalk(bundle) {
  const { tools, calls } = makeToolbox(bundle);
  const findings = [], refusals = [];

  const client = tools.describe_client();
  const exposures = tools.list_exposures({ min_weight: 10 });
  const liq = tools.get_liquidity();

  // 1. Collateral — the constraint invisible on a statement.
  for (const c of tools.list_collateral()) {
    const headroom = tools.compute_headroom({ ltv: c.ltv, trigger: c.trigger });
    if (headroom.value <= 5) {
      findings.push({
        title: `${c.facility_id} is ${near(headroom, "pp")} from its margin-call trigger`,
        why: `LTV ${near(c.ltv, "%")} against a ${near(c.trigger, "%")} trigger${c.breached_ever ? ", and it has breached before" : ""}. Assets pledged here are liquid in the market and illiquid in practice: selling them cuts lending value, which raises LTV.`,
        evidence: [c.ltv.ref, c.trigger.ref, headroom.ref],
        trajectory: c.trajectory,
      });
    }
  }

  // 2. Liabilities against genuinely sellable assets.
  //
  // Deliberately reported as an UPPER BOUND, not a funding percentage. The
  // adapter's funding model (goal.jb.constraints) accounts for horizon, queue
  // order, pledged collateral and scope, and gets 3% for Lau where a naive
  // daily-sellable ratio gets 100%. Two different funding numbers in one product
  // is worse than one conservative statement, so this walk states the ceiling and
  // names what it ignores rather than competing with the better model.
  for (const n of tools.list_liabilities()) {
    if (!n.amount.value) continue;
    const ceiling = tools.compute_funding_ratio({ available: liq.daily, required: n.amount });
    findings.push({
      title: `${n.description}`,
      why: `${near(n.amount)} due ${n.due_to || n.due_from || "on an unstated date"} (${n.certainty || "certainty unstated"}). Daily-sellable assets cover at most ${near(ceiling, "%")} of it — an upper bound only: it ignores pledged collateral, queue order behind earlier liabilities, and whether the sleeve that signed it can fund it. The constrained figure is the one to quote.`,
      evidence: [n.amount.ref, liq.daily.ref, ceiling.ref],
    });
  }

  // 3. Concentration.
  const whole = client.total_usd;
  for (const e of exposures.filter(x => x.dimension === "concentration")) {
    findings.push({
      title: `${e.value} is ${near(e.weight, "%")} of household wealth`,
      why: `Single-position concentration at ${near(e.weight, "%")}, direction ${e.direction}.`,
      evidence: [e.weight.ref, whole.ref],
    });
  }

  // 4. Where the dataset and the live world disagree — stated, never reconciled.
  const divergences = [];
  for (const key of Object.keys(bundle.authoritative.market_context)) {
    const s = tools.get_market_series({ key });
    if (!s.dataset || !s.live) continue;
    const gap = s.dataset.value ? (s.live.value - s.dataset.value) / Math.abs(s.dataset.value) : 0;
    if (Math.abs(gap) >= 0.15) {
      divergences.push({
        key, dataset: s.dataset.value, live: s.live.value, unit: s.dataset.unit,
        live_as_of: s.live_as_of, gap_pct: Math.round(gap * 1000) / 10,
        note: "Stated, not reconciled. The dataset governs every portfolio number; the live reading is context only.",
      });
    }
  }

  // 5. What we could not answer.
  for (const f of bundle.provenance.failures) refusals.push(f.reason);

  // 6. Prove the citation gate, honestly: on a fresh bundle nothing is approved.
  const citations = [], blocked = [];
  for (const o of tools.list_context()) {
    if (o.lane !== "doc") continue;
    try { citations.push(tools.cite({ observation_id: o.id })); }
    catch (err) { if (err instanceof FenceError) blocked.push({ id: o.id, reason: err.message }); else throw err; }
  }

  return {
    client_id: bundle.client_id, mode: "deterministic",
    client: { name: client.name, wealth_band: client.wealth_band, snapshot: client.snapshot },
    findings, divergences,
    citations, blocked_citations: blocked,
    unanswered: [...new Set(refusals)],
    tool_calls: calls.length,
  };
}

