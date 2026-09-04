/**
 * World Monitor -> our CountrySignal shape. Feeds the globe's four lenses.
 *
 * RE-POINTED 4 Sep. This file previously guessed `/v1/country/<cc>/instability`,
 * which is not a real endpoint — so every call 404'd, the catch swallowed it, and
 * the globe ran on fixtures while looking live. Correct behaviour, misleading code.
 *
 * The verified shape is  https://api.worldmonitor.app/api/<service>/v1/<kebab-rpc>
 * with header X-WorldMonitor-Key, and the endpoint that actually serves this
 * surface is ConflictService's humanitarian batch: ONE POST for the whole book's
 * countries (up to 25), keyed by ISO-2.
 *
 * WHAT IS AND IS NOT MEASURED — say this out loud at the booth, because a
 * sponsor judge will ask:
 *   instability   DERIVED from political-violence events, fatalities and
 *                 demonstrations. Auditable (the inputs travel with it), but
 *                 derived. Never call it "measured".
 *   riskDelta     needs two observations; a single call cannot produce one, so
 *                 it is left null and the client keeps its fixture.
 *   tone          not in this endpoint. null.
 *   policyStance  comes from the Policy Sentinel's classified documents, not
 *                 from here. null.
 *
 * Leaving a lens null is deliberate: merging over a fixture with a zero would
 * show the RM a confident "neutral" we never measured.
 */
const BASE = process.env.WORLDMONITOR_BASE || "https://api.worldmonitor.app";

/** Every ISO-3 the look-through model can produce, mapped to the ISO-2 the API wants. */
const ISO3_TO_2 = {
  AUS: "AU", BRA: "BR", CAN: "CA", CHE: "CH", CHN: "CN", DEU: "DE", ESP: "ES",
  FRA: "FR", GBR: "GB", HKG: "HK", IDN: "ID", IND: "IN", ITA: "IT", JPN: "JP",
  KOR: "KR", MEX: "MX", MYS: "MY", NLD: "NL", PHL: "PH", SAU: "SA", SGP: "SG",
  SWE: "SE", THA: "TH", TWN: "TW", USA: "US", VNM: "VN", ZAF: "ZA",
};

const MAX_BATCH = 25;

export async function fetchWorldMonitor(iso3s) {
  if (process.env.OFFLINE === "1") return { signals: {}, prevSignals: {}, offline: true, live: false };
  if (!process.env.WORLDMONITOR_API_KEY) return { signals: {}, prevSignals: {}, live: false, reason: "no key" };

  const pairs = [...new Set(iso3s)].map(i => [i, ISO3_TO_2[i]]).filter(([, c]) => c).slice(0, MAX_BATCH);
  if (!pairs.length) return { signals: {}, prevSignals: {}, live: false, reason: "no mappable countries" };

  try {
    const r = await fetch(`${BASE}/api/conflict/v1/get-humanitarian-summary-batch`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-WorldMonitor-Key": process.env.WORLDMONITOR_API_KEY },
      body: JSON.stringify({ countryCodes: pairs.map(([, c]) => c) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      // 403 here means the key is inactive or the endpoint is Pro-gated. Fixtures
      // are the right answer, but the reason travels so the UI can say which.
      console.warn(`[worldmonitor] HTTP ${r.status} — falling back to fixtures`);
      return { signals: {}, prevSignals: {}, live: false, reason: `HTTP ${r.status}` };
    }
    const json = await r.json();
    const results = json.results || {};

    const signals = {};
    for (const [iso3, iso2] of pairs) {
      const row = results[iso2];
      if (!row) continue;
      signals[iso3] = normalise(iso3, row);
    }
    return { signals, prevSignals: {}, live: Object.keys(signals).length > 0, fetched: json.fetched ?? null };
  } catch (err) {
    console.warn("[worldmonitor]", err.message);
    return { signals: {}, prevSignals: {}, live: false, reason: err.message };
  }
}

/**
 * Conflict counts -> a 0-100 instability score.
 *
 * Log-compressed on purpose: the difference between 0 and 20 political-violence
 * events is the whole story, and the difference between 400 and 500 is noise.
 * The raw inputs ride along in `derivedFrom` so the number is never a black box.
 */
function normalise(iso3, raw) {
  const violence = num(raw.conflictPoliticalViolenceEvents);
  const fatalities = num(raw.conflictFatalities);
  const demos = num(raw.conflictDemonstrations);

  const lg = (v, k) => Math.log10(1 + Math.max(0, v)) * k;
  const instability = Math.min(100, Math.round(lg(violence, 22) + lg(fatalities, 14) + lg(demos, 8)));

  return {
    iso3,
    name: raw.countryName || iso3,
    instability,
    riskDelta: null,        // needs a second observation
    tone: null,             // not in this endpoint
    policyStance: null,     // comes from the Policy Sentinel
    chokepoints: [],
    derived: true,
    derivedFrom: {
      politicalViolenceEvents: violence, fatalities, demonstrations: demos,
      referencePeriod: raw.referencePeriod ?? null,
      endpoint: "/api/conflict/v1/get-humanitarian-summary-batch",
    },
    events: [{
      id: `${iso3.toLowerCase()}-wm-0`,
      at: raw.referencePeriod ?? "",
      source: "World Monitor · ACLED/HDX",
      text: `${violence} political violence events, ${fatalities} fatalities, ${demos} demonstrations`,
      value: String(instability),
      endpoint: "/api/conflict/v1/get-humanitarian-summary-batch",
    }],
  };
}

const num = v => (typeof v === "number" ? v : Number(v) || 0);
