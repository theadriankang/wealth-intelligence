/**
 * The quant lane: plan -> series values, through one cache, with an honest
 * failure list.
 *
 * Routing, in order:
 *   1. series with a FRED id  -> WorldMonitor get-fred-series-batch (ONE call for
 *      up to 20 series) when a WorldMonitor key exists, else FRED direct (one
 *      call each, free key). Same numbers either way; FRED is the source in both.
 *   2. series with only a WorldMonitor endpoint -> grouped so one call serves
 *      every series that shares it.
 *   3. no key at all -> every series is a FAILURE with a stated reason. Nothing
 *      is filled in, defaulted, or carried over from the dataset. A missing
 *      number that says it is missing is worth more than a plausible invention.
 */
import { TTL } from "./cache.js";
import * as WM from "./worldmonitor.js";
import * as FRED from "./fred.js";

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Pull a symbol's quote out of list-market-quotes without assuming field names. */
function quoteFor(payload, symbol) {
  const q = (payload?.quotes || []).find(x => x.symbol === symbol);
  if (!q) return null;
  const price = num(q.price);
  if (price == null) return null;
  const spark = Array.isArray(q.sparkline) ? q.sparkline.filter(n => num(n) != null) : [];
  return { price, change: num(q.change), sparkline: spark, asOf: payload.asOf || null };
}

export async function fetchQuant(planSeries, { cache, limit = 120 } = {}) {
  const observations = [];
  const failures = [];

  const fail = (s, reason) => failures.push({ series: s.key, name: s.name, driver: s.driver, reason });

  // ---------- lane 1: FRED-backed -------------------------------------
  const fredBacked = planSeries.filter(s => s.fred);
  if (fredBacked.length) {
    const ids = fredBacked.map(s => s.fred);
    try {
      if (WM.hasKey()) {
        const { value, cached, at } = await cache.through(
          { provider: "worldmonitor", endpoint: "economic/get-fred-series-batch", params: { ids: [...ids].sort(), limit } },
          TTL.quant, () => WM.fredBatch(ids, { limit })
        );
        for (const s of fredBacked) {
          const r = value?.[s.fred];
          const pts = (r?.observations || []).map(o => ({ date: o.date, value: num(o.value) })).filter(p => p.value != null);
          if (!pts.length) { fail(s, `WorldMonitor returned no observations for ${s.fred}`); continue; }
          observations.push(mkSeries(s, pts, {
            provider: "worldmonitor", endpoint: WM.endpointOf("economic", "get-fred-series-batch"),
            upstream: `FRED:${s.fred}`, cached, at, title: r.title, units: r.units
          }));
        }
      } else if (FRED.hasKey()) {
        await Promise.all(fredBacked.map(async s => {
          try {
            const { value, cached, at } = await cache.through(
              { provider: "fred", endpoint: "series/observations", params: { id: s.fred, limit } },
              TTL.quant, () => FRED.observations(s.fred, { limit })
            );
            if (!value.length) return fail(s, `FRED returned no observations for ${s.fred}`);
            observations.push(mkSeries(s, value, {
              provider: "fred", endpoint: "https://api.stlouisfed.org/fred/series/observations",
              upstream: `FRED:${s.fred}`, cached, at
            }));
          } catch (err) { fail(s, err.message); }
        }));
      } else {
        for (const s of fredBacked) fail(s, "no quant provider key (set WORLDMONITOR_API_KEY or FRED_API_KEY)");
      }
    } catch (err) {
      for (const s of fredBacked) fail(s, err.message);
    }
  }

  // ---------- lane 2: WorldMonitor-only --------------------------------
  const wmOnly = planSeries.filter(s => !s.fred && s.wm);
  const groups = new Map();
  for (const s of wmOnly) {
    const g = JSON.stringify([s.wm.svc, s.wm.rpc, s.wm.params || {}]);
    groups.set(g, [...(groups.get(g) || []), s]);
  }

  for (const [g, members] of groups) {
    const [svc, rpc, params] = JSON.parse(g);
    if (!WM.hasKey()) { for (const s of members) fail(s, "WORLDMONITOR_API_KEY not set — no free fallback for this series"); continue; }
    try {
      const { value, cached, at } = await cache.through(
        { provider: "worldmonitor", endpoint: `${svc}/${rpc}`, params }, TTL.quant,
        () => WM.call(svc, rpc, { params })
      );
      const meta = { provider: "worldmonitor", endpoint: WM.endpointOf(svc, rpc), upstream: `${svc}/${rpc}`, cached, at };
      for (const s of members) {
        const sym = s.wm.params?.symbols?.[0];
        const q = sym ? quoteFor(value, sym) : null;
        if (q) {
          const pts = q.sparkline.length
            ? q.sparkline.map((v, i, a) => ({ date: `t-${a.length - 1 - i}`, value: v }))
            : [{ date: q.asOf || "latest", value: q.price }];
          observations.push(mkSeries(s, pts, meta));
        } else {
          // Shape not asserted. Carried as an opaque payload with its endpoint
          // rather than parsed on a guess — a wrong parse is worse than none.
          observations.push(mkPayload(s, value, meta));
        }
      }
    } catch (err) {
      for (const s of members) fail(s, err.message);
    }
  }

  const unroutable = planSeries.filter(s => !s.fred && !s.wm);
  for (const s of unroutable) fail(s, "series has no provider route in the quant lexicon");

  return { observations, failures };
}

function base(s, meta) {
  return {
    id: `q-${s.driver.client_id}-${s.key}`,
    lane: "quant",
    world: "live",                       // THE FENCE. Never "dataset".
    driver: s.driver,
    status: "candidate",
    tier: "quant",
    source: {
      provider: meta.provider, endpoint: meta.endpoint, upstream: meta.upstream,
      retrieved_at: new Date(meta.at || Date.now()).toISOString(), cached: !!meta.cached,
      citation: meta.endpoint
    }
  };
}

/**
 * Declared unit transforms. A pairing is only meaningful when both sides measure
 * the same thing, so where a provider's convention differs from the dataset's we
 * convert explicitly and say so — rather than printing two numbers that look
 * comparable and are not.
 */
function applyTransform(points, transform) {
  if (transform !== "yoy12") return points;
  if (points.length < 13) return [];          // not enough history: report nothing, not a wrong number
  const out = [];
  for (let i = 12; i < points.length; i++) {
    const prev = points[i - 12].value;
    if (!prev) continue;
    out.push({ date: points[i].date, value: Math.round((points[i].value / prev - 1) * 10000) / 100 });
  }
  return out;
}

function mkSeries(s, rawPoints, meta) {
  const points = applyTransform(rawPoints, s.transform);
  const last = points[points.length - 1];
  return {
    ...base(s, meta),
    series: {
      key: s.key, name: meta.title || s.name, unit: meta.units || s.unit,
      dataset_counterpart: s.dataset ?? null,
      as_of: last?.date ?? null, latest: last?.value ?? null,
      points, transform: s.transform ?? null, note: s.note ?? null, also_drives: s.also ?? []
    }
  };
}

function mkPayload(s, payload, meta) {
  return {
    ...base(s, meta),
    series: {
      key: s.key, name: s.name, unit: s.unit, dataset_counterpart: s.dataset ?? null,
      as_of: null, latest: null, points: [],
      shape: "payload", payload,
      note: (s.note ? s.note + " " : "") + "Response shape not asserted; carried raw with its endpoint.",
      also_drives: s.also ?? []
    }
  };
}
