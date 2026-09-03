/**
 * World Monitor -> our CountrySignal shape.
 *
 * FRIDAY: check the real response shape against normalise() below. The endpoints
 * here are best-effort guesses from the public docs; when they differ, only this
 * file changes. Returning {} makes the client fall back to fixtures, which is a
 * fine failure mode — never throw a broken shape at the UI.
 */
const BASE = process.env.WORLDMONITOR_BASE || "https://api.worldmonitor.app";

const ISO3_TO_2 = { TWN:"TW", SAU:"SA", SGP:"SG", KOR:"KR", NLD:"NL", CHN:"CN", BRA:"BR",
  JPN:"JP", USA:"US", IND:"IN", CHE:"CH", DEU:"DE", GBR:"GB" };

export async function fetchWorldMonitor(iso3s) {
  if (process.env.OFFLINE === "1") return { signals: {}, offline: true };
  const headers = { accept: "application/json" };
  if (process.env.WORLDMONITOR_API_KEY) {
    headers["X-WorldMonitor-Key"] = process.env.WORLDMONITOR_API_KEY;
  }

  const signals = {};
  await Promise.all(iso3s.map(async iso3 => {
    const cc = ISO3_TO_2[iso3] || iso3.slice(0, 2);
    try {
      const r = await fetch(`${BASE}/v1/country/${cc}/instability`, { headers });
      if (!r.ok) return;
      signals[iso3] = normalise(iso3, await r.json());
    } catch { /* leave it out; client merges over fixtures */ }
  }));
  return { signals, prevSignals: {}, live: Object.keys(signals).length > 0 };
}

function normalise(iso3, raw) {
  return {
    iso3,
    name: raw.name ?? raw.country ?? iso3,
    instability: num(raw.instability ?? raw.index ?? raw.score),
    riskDelta: num(raw.change7d ?? raw.delta ?? 0),
    tone: num(raw.tone ?? raw.sentiment ?? 0),
    policyStance: num(raw.policyStance ?? 0),
    chokepoints: raw.chokepoints ?? [],
    events: (raw.events ?? []).map((e, i) => ({
      id: `${iso3.toLowerCase()}-live-${i}`,
      at: e.timestamp ?? e.at ?? "",
      source: e.source ?? "World Monitor",
      text: e.title ?? e.description ?? "",
      value: e.value != null ? String(e.value) : "",
      endpoint: `/v1/country/${iso3}/instability`
    }))
  };
}
const num = v => (typeof v === "number" ? v : Number(v) || 0);
