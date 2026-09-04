/**
 * Exposure fingerprint: the deterministic rollup everything else reads.
 *
 * No LLM, no network. Household level (every portfolio including Custody,
 * which is not mandate-measured but is still the client's wealth), at TODAY,
 * with the baseline snapshot for direction of travel.
 *
 * weight_pct is not decoration. It is the priority of the research query, the
 * crawl budget allocated to it, and the ranking of what comes back.
 *
 * Reuses the adapter's own csv + fx modules on purpose: a second FX
 * implementation is the fastest way to end up with two answers.
 */
import { num } from "../adapters/jb/csv.js";
import { INSTRUMENT_THEMES, STRUCTURE_THEMES } from "./themes.js";

export const SNAPSHOTS = ["2025-12-31", "2026-02-27", "2026-03-31", "2026-06-30", "2026-08-26"];
export const TODAY = SNAPSHOTS[SNAPSHOTS.length - 1];
const BASE = SNAPSHOTS[0];

const MATERIAL = 3.0;           // ignore exposure below this % of household wealth
const TOP_HOLDING_FLAG = 10.0;  // single-position concentration flag
const SKIP_VALUES = new Set(["Diversified", "Cash", "Multi", "Global", "USD"]);

// dimensions that carry a lexicon lookup. `structure` deliberately does not:
// structures map to themes via STRUCTURE_THEMES so the query attaches to the
// mechanic rather than the label. `liquidity` is a metric, not an exposure.
const LOOKUP_DIMS = new Set(["region", "sector", "currency", "theme", "collateral", "liability", "rate"]);

const LIABILITY_PATTERNS = [
  [/propert|apartment|redevelop|deposit on/i, "property"],
  [/\btax\b/i, "tax"],
  [/trust/i, "trust"],
  [/capital call|commitment/i, "capital call"],
  [/school|universit|educat|tuition/i, "education"],
  [/philanthrop|charit|foundation|donation/i, "philanthropy"],
];

const direction = (now, then, tol = 1.0) => {
  if (then == null) return "new";
  if (now - then > tol) return "rising";
  if (then - now > tol) return "falling";
  return "stable";
};

function weightsBy(rows, field) {
  const total = rows.reduce((s, r) => s + num(r.market_value_usd), 0);
  if (total <= 0) return {};
  const g = {};
  for (const r of rows) g[r[field]] = (g[r[field]] || 0) + num(r.market_value_usd);
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, (100 * v) / total]));
}

export function buildFingerprint(src, clientId, fx) {
  const now = src.holdings.filter(h => h.client_id === clientId && h.snapshot_date === TODAY);
  if (!now.length) return null;
  const base = src.holdings.filter(h => h.client_id === clientId && h.snapshot_date === BASE);
  const totalUsd = now.reduce((s, r) => s + num(r.market_value_usd), 0);
  const instById = Object.fromEntries(src.instruments.map(i => [i.instrument_id, i]));
  const elements = [];

  const add = (dimension, value, weight, dir, provenance, key = undefined, extra = {}) => {
    if (key === undefined && LOOKUP_DIMS.has(dimension)) key = `${dimension}:${value}`;
    elements.push({ dimension, value, weight_pct: Math.round(weight * 100) / 100, direction: dir, provenance, key: key ?? null, extra });
  };

  // --- region / sector / currency / sub-asset --------------------------
  for (const [dim, field] of [["region", "region"], ["sector", "sector"], ["currency", "instrument_ccy"], ["structure", "sub_asset_class"]]) {
    const wNow = weightsBy(now, field), wThen = weightsBy(base, field);
    for (const [v, w] of Object.entries(wNow).sort((a, b) => b[1] - a[1])) {
      if (w < MATERIAL || !v || v === "undefined" || SKIP_VALUES.has(v)) continue;
      add(dim, v, w, direction(w, wThen[v]), `${now.filter(r => r[field] === v).length} holdings`);
    }
  }

  // --- look-through themes ---------------------------------------------
  const themes = {};
  for (const r of now) {
    const list = [...(INSTRUMENT_THEMES[r.instrument_id] || []), ...(STRUCTURE_THEMES[r.sub_asset_class] || [])];
    for (const t of list) {
      themes[t] ??= { mv: 0, ids: new Set() };
      themes[t].mv += num(r.market_value_usd);
      themes[t].ids.add(r.instrument_id);
    }
  }
  for (const [t, o] of Object.entries(themes).sort((a, b) => b[1].mv - a[1].mv)) {
    const w = (100 * o.mv) / totalUsd;
    if (w < MATERIAL) continue;
    add("theme", t, w, "n/a", [...o.ids].sort().join(","));
  }

  // --- single-position concentration ------------------------------------
  const byInst = {};
  for (const r of now) {
    const k = r.instrument_id;
    byInst[k] ??= { name: r.instrument_name, mv: 0 };
    byInst[k].mv += num(r.market_value_usd);
  }
  for (const [iid, o] of Object.entries(byInst).sort((a, b) => b[1].mv - a[1].mv)) {
    const w = (100 * o.mv) / totalUsd;
    if (w < TOP_HOLDING_FLAG) continue;
    add("concentration", o.name, w, "n/a", iid, "theme:single-name concentration",
      { limit_applies: instById[iid]?.concentration_limit_applies ?? "N" });
  }

  // --- liquidity ---------------------------------------------------------
  const liqNow = weightsBy(now, "liquidity_tier");
  const illiq = liqNow["Illiquid"] || 0, daily = liqNow["Daily"] || 0;
  const sumTier = (rows, tier) => rows.filter(r => r.liquidity_tier === tier).reduce((s, r) => s + num(r.market_value_usd), 0);
  add("liquidity", `Daily ${daily.toFixed(0)}% / Illiquid ${illiq.toFixed(0)}%`, illiq,
    direction(illiq, weightsBy(base, "liquidity_tier")["Illiquid"]), "holdings.liquidity_tier", null,
    { daily_usd: sumTier(now, "Daily"), illiquid_usd: sumTier(now, "Illiquid"), total_usd: totalUsd });

  // --- collateral --------------------------------------------------------
  for (const f of src.facilities.filter(x => x.client_id === clientId)) {
    const traj = SNAPSHOTS.map(s => num(f[`ltv_pct_${s}`]));
    const trigger = num(f.margin_call_ltv_pct);
    const drawn = num(f[`drawn_${TODAY}`]);
    // weight proxy: drawn debt as a share of household wealth, so the facility
    // ranks in the agenda instead of sitting at zero
    const drawnUsd = fx.toUSD(drawn, f.facility_ccy) ?? 0;
    add("collateral", `${f.facility_type} ${f.facility_id} LTV ${traj[traj.length - 1].toFixed(2)}% vs ${trigger.toFixed(1)}% trigger`,
      (100 * drawnUsd) / totalUsd, direction(traj[traj.length - 1], traj[0]), f.facility_id, "collateral:lombard",
      { trajectory: traj, trigger, gap_pp: Math.round((trigger - traj[traj.length - 1]) * 100) / 100,
        breached_ever: traj.some(t => t >= trigger), ccy: f.facility_ccy, drawn });
  }

  // --- liabilities -------------------------------------------------------
  for (const n of src.cashNeeds.filter(x => x.client_id === clientId)) {
    const usd = fx.toUSD(num(n.amount), n.currency) ?? 0;
    const kind = LIABILITY_PATTERNS.find(([re]) => re.test(n.description))?.[1] || "other";
    add("liability", `${n.currency} ${num(n.amount).toLocaleString()} — ${n.description}`,
      (100 * usd) / totalUsd, "n/a", n.need_id, `liability:${kind}`,
      { usd, due_from: n.due_from, due_to: n.due_to, certainty: n.certainty, kind });
  }
  for (const c of src.commitments.filter(x => x.client_id === clientId)) {
    const usd = fx.toUSD(num(c.uncalled), c.currency) ?? 0;
    add("liability", `Uncalled ${c.currency} ${num(c.uncalled).toLocaleString()} — ${c.fund_name}`,
      (100 * usd) / totalUsd, "n/a", c.commitment_id, "liability:capital call",
      { usd, window: c.expected_call_window, certainty: "Committed" });
  }

  // --- rates -------------------------------------------------------------
  const bondW = Object.entries(weightsBy(now, "asset_class")).filter(([k]) => /Fixed Income/.test(k)).reduce((s, [, v]) => s + v, 0);
  if (bondW >= MATERIAL) add("rate", "long duration fixed income", bondW, "n/a", "asset_class=Fixed Income", "rate:long duration");

  return { client_id: clientId, total_usd: totalUsd, snapshot: TODAY, elements };
}
