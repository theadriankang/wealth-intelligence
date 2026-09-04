/**
 * FX — the highest-risk function in this build.
 *
 * market_context.csv quotes each pair in ITS OWN MARKET CONVENTION. Get the
 * direction wrong and every funding-confidence number in the app is silently,
 * plausibly wrong — no error, no crash, just a portfolio that reads 1.35x too
 * rich. Hence the explicit table below and scripts/test-fx.js.
 *
 *   USDSGD = 1.352  means "SGD per USD"  -> USD = amount / 1.352
 *   EURUSD = 1.092  means "USD per EUR"  -> USD = amount * 1.092
 *
 * Source: docs/DATA_DICTIONARY.md, "FX convention".
 */

/** How to read each series: "perUsd" = divide, "usdPer" = multiply. */
export const FX_SERIES = {
  SGD: { series: "USDSGD", dir: "perUsd" },
  HKD: { series: "USDHKD", dir: "perUsd" },
  CHF: { series: "USDCHF", dir: "perUsd" },
  JPY: { series: "USDJPY", dir: "perUsd" },
  CNH: { series: "USDCNH", dir: "perUsd" },
  IDR: { series: "USDIDR", dir: "perUsd" },
  THB: { series: "USDTHB", dir: "perUsd" },
  INR: { series: "USDINR", dir: "perUsd" },
  EUR: { series: "EURUSD", dir: "usdPer" },
  GBP: { series: "GBPUSD", dir: "usdPer" }
};

/**
 * @param {Array} marketRows parsed market_context.csv
 * @param {string} date      snapshot date, e.g. "2026-08-26"
 */
export function buildFx(marketRows, date) {
  const at = {};
  for (const r of marketRows) {
    if (r.snapshot_date === date) at[r.series_id] = Number(r.value);
  }

  const missing = [];
  for (const [ccy, def] of Object.entries(FX_SERIES)) {
    if (!Number.isFinite(at[def.series])) missing.push(`${ccy} (${def.series})`);
  }

  /** Convert an amount in `ccy` to USD. Returns null if we cannot do it honestly. */
  function toUSD(amount, ccy) {
    if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
    const a = Number(amount);
    if (!ccy || ccy === "USD") return a;
    const def = FX_SERIES[ccy];
    if (!def) return null;                       // unknown currency: say so, don't guess 1:1
    const rate = at[def.series];
    if (!Number.isFinite(rate) || rate === 0) return null;
    return def.dir === "perUsd" ? a / rate : a * rate;
  }

  /** Units of `ccy` per 1 USD — for display ("SGD 1.352 / USD"). */
  function perUsd(ccy) {
    if (!ccy || ccy === "USD") return 1;
    const def = FX_SERIES[ccy];
    if (!def) return null;
    const rate = at[def.series];
    if (!Number.isFinite(rate)) return null;
    return def.dir === "perUsd" ? rate : 1 / rate;
  }

  return { toUSD, perUsd, at, date, missing, series: (id) => at[id] ?? null };
}
