/**
 * SIGNALS — derived from the governed event registry, not from a live feed.
 *
 * The challenge README is explicit: "For anything that happened in 2026, use
 * event_log.csv rather than what your model remembers. If they disagree, the
 * file wins." So every country signal in this app is computed from
 * event_log.csv + market_context.csv and nothing else, and every event a client
 * ever sees carries the row id it came from.
 *
 * That is not a limitation we worked around — it is the compliance position. An
 * explanation an RM can defend in a review has an auditable source; one that
 * came from a model's memory of the news does not.
 *
 * Live ingestion (TinyFish / World Monitor) proposes CANDIDATE events into this
 * registry. Nothing reaches a client-facing insight until a human approves it.
 */

/** Which countries an event's `region` reaches. Explicit, so it is reviewable. */
const REGION_COUNTRIES = {
  "Middle East":   ["SAU", "ARE", "QAT", "IRN", "ISR", "KWT", "OMN"],
  "United States": ["USA"],
  "Europe":        ["DEU", "FRA", "GBR", "CHE", "NLD", "ITA", "ESP", "SWE"],
  "Global":        null      // null = every country in the book
};

const SEVERITY_WEIGHT = { Severe: 30, High: 18, Medium: 9, Low: 4 };

/** Transmission keywords -> the sectors and chokepoints an event actually touches. */
const TRANSMISSION_HINTS = [
  { re: /energy|oil|lng|brent|gulf/i,        sectors: ["Energy", "Utilities"], chokepoints: ["Hormuz"] },
  { re: /shipping|transport|tanker|marine/i, sectors: ["Industrials"],         chokepoints: ["Hormuz", "Suez", "Malacca Strait"] },
  { re: /technolog|semiconduct|ai capex/i,   sectors: ["Information Technology"], chokepoints: ["Taiwan Strait"] },
  { re: /duration|fixed income|yield|rate/i, sectors: ["Sovereign", "Corporate", "Real Estate"], chokepoints: [] },
  { re: /gold|precious/i,                    sectors: ["Gold"],                chokepoints: [] },
  { re: /private credit|semi-liquid/i,       sectors: ["Corporate"],           chokepoints: [] },
  { re: /collateralis|lending/i,             sectors: [],                      chokepoints: [] }
];

const COUNTRY_NAMES = {
  USA:"United States", CAN:"Canada", GBR:"United Kingdom", DEU:"Germany", FRA:"France",
  CHE:"Switzerland", NLD:"Netherlands", ITA:"Italy", ESP:"Spain", SWE:"Sweden",
  JPN:"Japan", CHN:"China", HKG:"Hong Kong", TWN:"Taiwan", KOR:"South Korea",
  SGP:"Singapore", IDN:"Indonesia", MYS:"Malaysia", THA:"Thailand", PHL:"Philippines",
  VNM:"Vietnam", IND:"India", AUS:"Australia", BRA:"Brazil", ZAF:"South Africa",
  MEX:"Mexico", SAU:"Saudi Arabia", ARE:"United Arab Emirates", QAT:"Qatar",
  IRN:"Iran", ISR:"Israel", KWT:"Kuwait", OMN:"Oman"
};

/**
 * @param {Array}  events    parsed event_log.csv
 * @param {Array}  market    parsed market_context.csv
 * @param {string[]} universe iso3 codes present in the book
 * @param {string} asOf      snapshot date to compute "now" at
 * @param {string} prev      snapshot date to compute the comparison from
 */
export function buildSignals(events, market, universe, asOf, prev) {
  const now = computeAt(events, market, universe, asOf);
  const before = computeAt(events, market, universe, prev);
  for (const iso3 of Object.keys(now)) {
    const b = before[iso3];
    now[iso3].riskDelta = b ? clamp(now[iso3].instability - b.instability, -40, 40) : 0;
  }
  return { signals: now, prevSignals: before };
}

function computeAt(events, market, universe, date) {
  const upto = events.filter(e => e.event_date <= date);
  const series = id => {
    const r = market.find(m => m.snapshot_date === date && m.series_id === id);
    return r ? Number(r.value) : null;
  };

  // Macro backdrop, shared by every country: rates up + vol up = tighter, riskier.
  const vix = series("VIX") ?? 18;
  const ust = series("UST_10Y_PCT") ?? 4.0;
  const brent = series("BRENT_USD_BBL") ?? 70;

  const out = {};
  for (const iso3 of universe) {
    out[iso3] = {
      iso3,
      name: COUNTRY_NAMES[iso3] || iso3,
      instability: 0,
      riskDelta: 0,
      tone: 0,
      policyStance: 0,
      chokepoints: [],
      events: []
    };
  }

  upto.forEach((e, i) => {
    const targets = REGION_COUNTRIES[e.region] === null
      ? universe
      : (REGION_COUNTRIES[e.region] || []).filter(c => universe.includes(c));
    if (!targets.length) return;

    // Recency: an event six months old still happened, but it is not today's news.
    const ageDays = (Date.parse(date) - Date.parse(e.event_date)) / 86400000;
    const recency = Math.max(0.25, 1 - ageDays / 240);
    const w = (SEVERITY_WEIGHT[e.severity] ?? 5) * recency;

    const hints = TRANSMISSION_HINTS.filter(h => h.re.test(e.primary_transmission || ""));
    const chokepoints = [...new Set(hints.flatMap(h => h.chokepoints))];

    const ev = {
      id: `JB-EVT-${e.event_date}-${String(i).padStart(2, "0")}`,
      at: e.event_date,
      source: "JB Event Log",
      text: e.description,
      value: `${e.severity} · ${e.event_type}`,
      endpoint: "data/juliusbaer/event_log.csv",
      region: e.region,
      eventType: e.event_type,
      severity: e.severity,
      sectors: [...new Set(hints.flatMap(h => h.sectors))],
      chokepoints,
      transmission: e.primary_transmission
    };

    for (const iso3 of targets) {
      const s = out[iso3];
      s.instability += w * (REGION_COUNTRIES[e.region] === null ? 0.45 : 1);
      if (e.event_type === "Geopolitical") s.tone -= 0.35 * recency;
      if (e.event_type === "Policy") s.policyStance += 0.6 * recency;
      for (const c of chokepoints) if (!s.chokepoints.includes(c)) s.chokepoints.push(c);
      if (s.events.length < 8) s.events.push({ ...ev, iso3 });
    }
  });

  for (const s of Object.values(out)) {
    // Macro overlay, identical everywhere — it is a backdrop, not a country story.
    s.instability = clamp(Math.round(s.instability + (vix - 18) * 0.8 + Math.max(0, brent - 80) * 0.15), 0, 100);
    s.tone = clamp(Number((s.tone - (vix - 18) / 14).toFixed(2)), -3, 3);
    s.policyStance = clamp(Number((s.policyStance + (ust - 4.05) * 1.6).toFixed(2)), -3, 3);
    s.events.sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  return out;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
