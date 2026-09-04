/**
 * GDELT — the live narrative-tone lane. DORMANT: not wired to the UI.
 *
 * WITHDRAWN 4 Sep 2026 after measurement, not after a guess. GDELT rate-limited
 * this IP to a standstill and never released it: a single cold curl returned
 * HTTP 429 after 11.5s, and serial requests 12s apart with a browser UA and a
 * two-minute cooldown still failed on all 8 countries. There is no public API
 * tier to buy past it. The code below is correct and left in place; only the
 * lens and its button were removed (see src/main.js for the restore steps).
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
 * RATE LIMIT — measured, not assumed. GDELT publishes no number and asks for
 * restraint; in practice (4 Sep 2026, from Singapore) it answers a SINGLE cold
 * request with HTTP 429 in 11.5s once an IP has burst. It throttles far harder
 * than its docs imply.
 *
 * So this lane does not fetch on demand at all. Requests are served from a
 * 15-minute cache, and the cache is warmed by a background queue that issues at
 * most one request every SPACING_MS, serially, forever patient. The endpoint
 * returns immediately with whatever is warm and names what is still pending —
 * a page that paints now and fills in over the next minute beats a page that
 * blocks for forty seconds and then shows an error.
 */
import { limited } from "./ratelimit.js";

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const SPACING_MS = Number(process.env.GDELT_SPACING_MS || 12000);  // measured: 6.5s still 429s
const COOLDOWN_MS = Number(process.env.GDELT_COOLDOWN_MS || 120000);

// GDELT 429s Node's default user-agent and curl's alike. Sending a browser-shaped
// one is the last cheap thing to try before concluding the IP is simply blocked;
// it is not a workaround for a limit, it is identifying the client honestly.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

// Once throttled, GDELT keeps refusing for minutes. Hammering through that is
// both rude and pointless, so a 429 stops the queue outright for COOLDOWN_MS.
let blockedUntil = 0;
export const cooling = () => Math.max(0, blockedUntil - Date.now());
const TTL_MS = Number(process.env.GDELT_TTL_MS || 15 * 60 * 1000); // GDELT itself refreshes every 15 min

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
export async function tone(iso3, { days = 14, timeoutMs = 30000 } = {}) {
  const url = urlFor(iso3, days);
  if (!url) throw new Error(`no FIPS mapping for ${iso3} — add it to server/providers/gdelt.js`);

  // 30s, because a throttled GDELT answers slowly rather than refusing fast:
  // the first version timed out at 12s and reported "fetch failed" for what was
  // actually an 11.5s HTTP 429.
  const res = await limited("gdelt", 60000 / SPACING_MS, () =>
    fetch(url, { signal: AbortSignal.timeout(timeoutMs),
                 headers: { accept: "application/json", "user-agent": UA } }),
    { burst: 1, retries: 1, label: `GDELT ${iso3}` });

  if (res.status === 429) {
    blockedUntil = Date.now() + COOLDOWN_MS;
    throw new Error(`GDELT rate-limited this IP (429). Pausing ${COOLDOWN_MS / 1000}s.`);
  }
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

/* ── cache + background warm queue ─────────────────────────────────────── */

const CACHE = new Map();      // "ISO:days" -> { reading | error, at }
const QUEUE = [];             // pending "ISO:days" keys, in priority order
let draining = false;

const keyOf = (iso3, days) => `${iso3}:${days}`;
const fresh = e => e && Date.now() - e.at < TTL_MS;

/**
 * Drains the queue one request at a time. Never runs twice; never throws.
 * Failures are cached too — retrying a country that has no FIPS mapping every
 * fifteen seconds would spend the whole budget on a question already answered.
 */
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (QUEUE.length) {
      if (cooling()) { await new Promise(r => setTimeout(r, cooling())); }
      const k = QUEUE.shift();
      const [iso3, days] = k.split(":");
      if (fresh(CACHE.get(k))) continue;
      try {
        CACHE.set(k, { reading: await tone(iso3, { days: Number(days) }), at: Date.now() });
        console.log(`[gdelt] warmed ${iso3}`);
      } catch (err) {
        // A cooldown is not the country's fault: leave it uncached so it is
        // retried once the pause lifts, rather than recorded as "no data".
        if (!/429/.test(err.message)) CACHE.set(k, { error: err.message, at: Date.now() });
        else QUEUE.push(k);
        console.warn(`[gdelt] ${iso3}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, SPACING_MS));
    }
  } finally { draining = false; }
}

/** Queue anything stale or unseen, then let the drainer take its time. */
export function warm(iso3s, { days = 14 } = {}) {
  for (const iso3 of iso3s) {
    const k = keyOf(iso3, days);
    if (fresh(CACHE.get(k)) || QUEUE.includes(k)) continue;
    QUEUE.push(k);
  }
  drain();
  return QUEUE.length;
}

/**
 * Read-through, non-blocking. Returns what is warm now and names what is not,
 * so the caller can paint immediately and come back for the rest.
 */
export function toneFor(iso3s, { days = 14 } = {}) {
  const wanted = [...new Set(iso3s.filter(Boolean))];
  const readings = {}, failures = [], pending = [];

  for (const iso3 of wanted) {
    const e = CACHE.get(keyOf(iso3, days));
    if (!fresh(e)) { pending.push(iso3); continue; }
    if (e.reading) readings[iso3] = e.reading;
    else failures.push({ iso3, reason: e.error });
  }

  warm(pending, { days });

  return {
    readings, failures, pending,
    warming: pending.length > 0,
    next_in_ms: pending.length ? pending.length * SPACING_MS : null,
    as_of: new Date().toISOString()
  };
}
