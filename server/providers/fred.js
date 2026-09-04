/**
 * FRED direct — the fallback that keeps the quant lane alive without a
 * WorldMonitor subscription. Free key, no tier gating, covers rates, US macro,
 * the major FX crosses, Brent and the S&P.
 *
 * https://api.stlouisfed.org/fred/series/observations
 */
const BASE = "https://api.stlouisfed.org/fred/series/observations";

export const hasKey = () => !!process.env.FRED_API_KEY;

export async function observations(seriesId, { limit = 120, timeoutMs = 15000 } = {}) {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is not set");
  const url = `${BASE}?${new URLSearchParams({
    series_id: seriesId, api_key: key, file_type: "json",
    sort_order: "desc", limit: String(limit)
  })}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`FRED HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const json = await r.json();
  // FRED writes "." for a missing observation. Dropping them is correct; filling
  // them forward would be inventing data.
  return (json.observations || [])
    .filter(o => o.value !== ".")
    .map(o => ({ date: o.date, value: Number(o.value) }))
    .reverse();
}
