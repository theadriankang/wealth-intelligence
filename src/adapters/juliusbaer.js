/**
 * ===========================================================================
 *  FILL THIS IN ON FRIDAY. It is the only file that should need to change.
 * ===========================================================================
 *
 * Steps:
 *   1. Drop their sample data into src/adapters/raw/ (or point fetch() at their API).
 *   2. Map their fields onto the shapes in src/model/schema.js below.
 *   3. Set ADAPTER = "juliusbaer" in src/config.js.
 *   4. Open the console — validatePortfolio/validateInstrument will name anything
 *      that did not map cleanly.
 *
 * The two things most likely to differ from our assumptions:
 *   · Instruments identified by ISIN rather than ticker  -> use ISIN as `id`.
 *   · No country breakdown for funds                     -> see deriveExposures().
 */
import { demoAdapter } from "./demo.js";

export async function juliusBaerAdapter(opts = {}) {
  // --- 1. LOAD -------------------------------------------------------------
  // const raw = await fetch("/api/jb/portfolios").then(r => r.json());
  // const raw = (await import("./raw/portfolios.json")).default;
  const raw = null;

  if (!raw) {
    console.warn("[juliusbaer] No raw data wired yet — falling back to the demo adapter. " +
                 "Fill in src/adapters/juliusbaer.js.");
    return demoAdapter(opts);
  }

  // --- 2. MAP --------------------------------------------------------------
  const instruments = {};
  for (const s of raw.securities ?? []) {
    instruments[s.isin ?? s.ticker] = {
      id: s.isin ?? s.ticker,
      name: s.name,
      assetClass: mapAssetClass(s.type),
      currency: s.ccy ?? "USD",
      exposures: deriveExposures(s),
      sectors: s.gics ? [{ name: s.gics, weight: 1 }] : [],
      chokepoints: []                       // enrich from your own mapping table
    };
  }

  const portfolios = (raw.portfolios ?? []).map(p => ({
    id: p.portfolioId,
    name: p.clientName,
    ref: p.portfolioId,
    currency: p.referenceCurrency,
    aum: p.totalValue,
    mandate: mapMandate(p.mandateType),
    riskProfile: p.riskProfile ?? "Balanced",
    riskBand: p.riskBand ?? "",
    reviewDate: p.nextReviewDate ?? "",
    rm: p.relationshipManager ?? "",
    positions: (p.holdings ?? []).map(h => ({
      instrumentId: h.isin ?? h.ticker,
      weightPct: h.weightPct ?? (h.marketValue / p.totalValue) * 100,
      marketValue: h.marketValue,
      pledged: !!h.pledged
    })),
    goals: (p.objectives ?? []).map(mapGoal),
    entities: p.entities ?? [],
    actions: [],
    relationship: p.relationship ?? null
  }));

  return { instruments, portfolios, signals: {}, prevSignals: {}, meta: { source: "julius-baer" } };
}

function mapAssetClass(t = "") {
  const s = String(t).toLowerCase();
  if (s.includes("fund") || s.includes("ucits")) return "fund";
  if (s.includes("etf")) return "etf";
  if (s.includes("bond") || s.includes("fixed")) return "bond";
  if (s.includes("struct") || s.includes("note")) return "structured";
  if (s.includes("cash") || s.includes("deposit")) return "cash";
  if (s.includes("equity") || s.includes("share") || s.includes("stock")) return "equity";
  return "other";
}

function mapMandate(t = "") {
  const s = String(t).toLowerCase();
  if (s.startsWith("d")) return "Discretionary";
  if (s.startsWith("e")) return "Execution only";
  return "Advisory";
}

function mapGoal(o, i) {
  return {
    id: o.id ?? `g${i + 1}`,
    name: o.name ?? o.objective ?? `Objective ${i + 1}`,
    horizon: o.horizon ?? o.targetDate ?? "",
    targetLabel: o.targetLabel ?? o.targetAmount ?? "",
    baseFunded: o.fundedPct ?? 90,
    driverIds: o.linkedHoldings ?? []
  };
}

/**
 * LOOK-THROUGH is the part that needs thought.
 *  · A single-name equity: one country, weight 1.
 *  · A fund with a published country breakdown: use it.
 *  · A fund without one: fall back to domicile — and SAY SO in the UI, because a
 *    domicile fallback is a modelling choice, not a fact. Don't quietly pretend a
 *    Luxembourg-domiciled global fund is exposure to Luxembourg.
 */
function deriveExposures(s) {
  if (s.countryBreakdown?.length) {
    return s.countryBreakdown.map(c => ({ iso3: c.iso3 ?? c.country, weight: c.weight }));
  }
  if (s.countryOfRisk) return [{ iso3: s.countryOfRisk, weight: 1 }];
  if (s.domicile) return [{ iso3: s.domicile, weight: 1, assumed: true }];
  return [];
}
