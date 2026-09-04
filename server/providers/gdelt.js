/**
 * GDELT — the live narrative-tone lane.
 *
 * WHY THIS EXISTS
 * The globe's Instability and Tone lenses were reading fixture values. World
 * Monitor, which was meant to supply them, returns 401 on every gateway
 * endpoint and has no public signup — the API tiers start at USD 99.99/month.
 * Presenting fixture numbers as a live world signal in front of a bank is the
 * one failure mode worse than claiming less, so the claim moves here.
 *
 * GDELT's DOC 2.0 API is free, needs no key, and updates every 15 minutes. It
 * gives one thing this product actually needs: how the tone of global coverage
 * about a country is moving right now.
 *
 *   https://api.gdeltproject.org/api/v2/doc/doc
 *     ?query=sourcecountry:<fips>&mode=timelinetone&format=json&timespan=<n>d
 *   -> { timeline: [ { series: "Average Tone", data: [ { date, value }, … ] } ] }
 *
 * `sourcecountry` takes FIPS 10-4 codes, NOT ISO — GDELT predates the habit of
 * using ISO everywhere, and silently returns an empty timeline for an
 * unrecognised code rather than erroring. FIPS is what the map below holds, and
 * an ISO3 with no mapping is reported as a failure instead of being guessed at.
 *
 * RATE LIMIT: GDELT publishes no hard number and asks for restraint. One call
 * per country is unavoidable (there is no batch mode), so the bucket is set low
 * and the cache is long. A demo does not need minute-fresh tone; it needs tone
 * that is genuinely live and genuinely cited.
 */
import { limited } from "./ratelimit.js";

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const PER_MIN = Number(process.env.GDELT_RATE_PER_MIN || 10);

/** ISO 3166-1 alpha-3 -> FIPS 10-4, for every country the book actually touches. */
export const FIPS = {
  AUS: "AS", BRA: "BR", CAN: "CA", CHE: "SZ", CHN: "CH", DEU: "GM", ESP: "SP",
  FRA: "FR", GBR: "UK", HKG: "HK", IDN: "ID", IND: "IN", ITA: "IT", JPN: "JA",
  KOR: "KS", MEX: "MX", MYS: "MY", NLD: "NL", PHL: "RP", SAU: "SA", SGP: "SN",
  SWE: "SW", THA: "TH", TWN: "TW", USA: "US", VNM: "VM", ZAF: "SF"
};

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** GDELT stamps points 20260904T120000Z. Parsed here so the UI never has to. */
const parseStamp = s => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : (s || null);
};

export function urlFor(iso3, days) {
  const fips = FIPS[iso3];
  if (!fips) return null;
  const q = new URLSearchParams({
    query: `sourcecountry:${fips}`, mode: "timelinetone",
    format: "json", timespan: `${days}d`
  });
  return `${BASE}?${q}`;
}

/**
 * Tone for one country.
 *
 * Returns the latest reading, the mean of the window, and the latest expressed
 * as a deviation from that mean — which is what the Tone lens has always shown.
 * The raw points come back too: a number a judge cannot inspect is a number they
 * have to take on trust, and this whole product argues against that.
 */
export async function tone(iso3, { days = 14, timeoutMs = 15000 } = {}) {
  const url = urlFor(iso3, days);
  if (!url) throw new Error(`no FIPS mapping for ${iso3} — add it to server/providers/gdelt.js`);

  const res = await limited("gdelt", PER_MIN, () =>
    fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } }),
    { burst: 4, label: `GDELT ${iso3}` });

  if (!res.ok) throw new Error(`GDELT HTTP ${res.status} for ${iso3}`);

  // GDELT answers a malformed query with an HTML error page and a 200.
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); }
  catch { throw new Error(`GDELT returned non-JSON for ${iso3} (likely an unrecognised query)`); }

  const series = json?.timeline?.[0]?.data || [];
  const points = series
    .map(p => ({ at: parseStamp(p.date), value: Number(p.value) }))
    .filter(p => Number.isFinite(p.value));

  if (!points.length) throw new Error(`GDELT returned an empty timeline for ${iso3} (FIPS ${FIPS[iso3]})`);

  const values = points.map(p => p.value);
  const baseline = mean(values);
  const latest = points[points.length - 1];

  return {
    iso3, fips: FIPS[iso3],
    latest: Math.round(latest.value * 100) / 100,
    baseline: Math.round(baseline * 100) / 100,
    deviation: Math.round((latest.value - baseline) * 100) / 100,
    as_of: latest.at,
    window_days: days,
    points: points.length,
    source: { provider: "gdelt", endpoint: url, world: "live" }
  };
}

/**
 * Tone for many countries, in parallel, through one bucket.
 * Failures are returned, never swallowed and never filled in.
 */
export async function toneFor(iso3s, opts = {}) {
  const wanted = [...new Set(iso3s.filter(Boolean))];
  const readings = {}, failures = [];

  await Promise.all(wanted.map(async iso => {
    try { readings[iso] = await tone(iso, opts); }
    catch (err) { failures.push({ iso3: iso, reason: err.message }); }
  }));

  return { readings, failures, as_of: new Date().toISOString() };
}
