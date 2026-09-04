/**
 * The orchestrator: dataset -> plan -> fetch -> gate -> bundle.
 *
 * The bundle it writes is the agentic layer's ONLY input, and it has two blocks
 * that never mix:
 *
 *   authoritative   the dataset. Every number attached to the client. The agent's
 *                   arithmetic tools accept these and nothing else.
 *   context         live retrieval. Documents and series, every one a candidate,
 *                   every one carrying the fingerprint element that caused it and
 *                   the dataset value it sits beside.
 *
 * Guardrails in a prompt are a hope. Guardrails in a function signature are a
 * guarantee — which is why the fence is a field and a shape, not an instruction.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseCsv, num } from "../../src/adapters/jb/csv.js";
import { buildFx } from "../../src/adapters/jb/fx.js";
import { buildFingerprint, SNAPSHOTS, TODAY } from "../../src/intel/fingerprint.js";
import { buildPlan } from "../../src/intel/plan.js";
import { gate, assertFence } from "../../src/intel/observation.js";
import { makeCache } from "../providers/cache.js";
import { fetchQuant } from "../providers/quant.js";
import { fetchDocuments } from "../providers/docs.js";

export function loadDataset(dir = "data/juliusbaer") {
  const csv = f => parseCsv(readFileSync(`${dir}/${f}.csv`, "utf8"));
  return {
    clients: csv("clients"), portfolios: csv("portfolios"), holdings: csv("holdings"),
    instruments: csv("instruments"), facilities: csv("credit_facilities"),
    commitments: csv("commitments"), cashNeeds: csv("planned_cash_needs"),
    market: csv("market_context"),
    notes: JSON.parse(readFileSync(`${dir}/rm_notes.json`, "utf8")),
  };
}

/** The dataset's own value for each series we went and fetched live. The pairing IS the fence. */
function datasetCounterparts(market, planSeries) {
  const wanted = new Map(planSeries.filter(s => s.dataset).map(s => [s.dataset, s]));
  const out = {};
  for (const row of market) {
    const s = wanted.get(row.series_id);
    if (!s) continue;
    out[s.key] ??= {
      world: "dataset", series_id: row.series_id, name: row.series_name,
      unit: row.unit, category: row.category, points: []
    };
    out[s.key].points.push({ date: row.snapshot_date, value: num(row.value) });
  }
  for (const v of Object.values(out)) {
    v.points.sort((a, b) => a.date.localeCompare(b.date));
    v.as_of = v.points.at(-1)?.date ?? null;
    v.latest = v.points.at(-1)?.value ?? null;
  }
  return out;
}

export async function runIntel(clientId, {
  dir = "data/juliusbaer", mode = "auto", outDir = "out/intel", src, fx, write = true
} = {}) {
  src ??= loadDataset(dir);
  fx ??= buildFx(src.market, TODAY);

  const fingerprint = buildFingerprint(src, clientId, fx);
  if (!fingerprint) throw new Error(`${clientId}: no holdings at ${TODAY}`);

  const plan = buildPlan(fingerprint);
  const cache = makeCache({ mode });

  const [q, d] = await Promise.all([
    fetchQuant(plan.quantSeries, { cache }).catch(e => ({ observations: [], failures: [{ reason: e.message }] })),
    fetchDocuments(plan, { cache }).catch(e => ({ documents: [], failures: [{ reason: e.message }] })),
  ]);

  const { kept, dropped } = gate([...d.documents, ...q.observations], fingerprint);
  const client = src.clients.find(c => c.client_id === clientId) || {};

  const bundle = {
    client_id: clientId,
    generated_at: new Date().toISOString(),

    authoritative: {
      world: "dataset",
      note: "The dataset is the sole authority for every number attached to this client. Its 2026 is fictional by construction; nothing in `context` may be used to recompute anything here.",
      snapshot: TODAY,
      snapshots: SNAPSHOTS,
      client: {
        name: client.client_name, wealth_band: client.wealth_band, risk_profile: client.risk_profile,
        residence: client.country_of_residence, tax_domicile: client.tax_domicile,
        base_ccy: client.base_currency, booking_centre: client.booking_centre,
        source_of_wealth: client.source_of_wealth, liquidity_needs: client.liquidity_needs
      },
      fingerprint,
      market_context: datasetCounterparts(src.market, plan.quantSeries),
    },

    context: {
      world: "live",
      note: "Retrieved. Candidates only — nothing here is citable to a client until an RM approves it, and no value here may enter an arithmetic path.",
      observations: kept,
    },

    plan: {
      doc_queries: plan.docQueries.length, quant_series: plan.quantSeries.length,
      doc_gaps: plan.docGaps, quant_gaps: plan.quantGaps
    },

    provenance: {
      mode, run_at: new Date().toISOString(),
      cache: { hits: cache.stats.hits, misses: cache.stats.misses, writes: cache.stats.writes, entries: cache.size() },
      dropped,
      failures: [...d.failures.map(f => ({ lane: "doc", ...f })), ...q.failures.map(f => ({ lane: "quant", ...f }))],
    },
  };

  assertFence(bundle);

  if (write) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/${clientId}.json`, JSON.stringify(bundle, null, 1));
  }
  return bundle;
}
