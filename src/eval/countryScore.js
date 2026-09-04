import { COUNTRY_WEIGHTS, COUNTRY_BANDS, SERIES_BY_ISO, SERIES_FALLBACK } from "./rubric.js";
import { CHOKEPOINTS } from "../signals/fixtures/signals.js";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const strained = new Set(CHOKEPOINTS.filter(c => c.status === "strained").map(c => c.name));

/** signal-only components (move week to week) */
function signalTerms(sig) {
  return {
    instability: clamp((sig.instability || 0) + (sig.riskDelta || 0)),
    tone: clamp((Math.min(3, Math.abs(sig.tone || 0)) / 3) * 100),
    policy: clamp((Math.min(3, Math.abs(sig.policyStance || 0)) / 3) * 100),
    chokepoint: clamp(((sig.chokepoints || []).filter(c => strained.has(c)).length / 3) * 100)
  };
}

function score(sig, market, iso, policyScan) {
  const s = signalTerms(sig);
  const seriesId = SERIES_BY_ISO[iso] || SERIES_FALLBACK;
  const volPct = clamp(market.percentileVsHistory(seriesId, "vol") * 100);
  const sentinel = policyScan?.signal?.country === iso
    ? clamp(Math.abs(policyScan.signal.stanceScore || 0) * 100) : 0;
  const terms = { ...s, volatility: volPct, sentinel };
  const contributions = Object.entries(COUNTRY_WEIGHTS).map(([k, w]) => ({
    label: LABELS[k], contribution: Math.round(w * terms[k])
  }));
  const total = clamp(contributions.reduce((a, c) => a + c.contribution, 0));
  return { total, contributions, terms };
}

const LABELS = {
  instability: "Instability", tone: "Narrative tone", policy: "Policy stress",
  chokepoint: "Chokepoint strain", volatility: "Market volatility", sentinel: "Policy signal"
};

export function scoreCountries(signals, prevSignals, market, policyScan = null) {
  const out = {};
  for (const iso of Object.keys(signals)) {
    const now = score(signals[iso], market, iso, policyScan);
    const prevSig = prevSignals?.[iso] || signals[iso];
    // hold volatility + sentinel constant between the two — only signal terms move
    const prev = score({ ...prevSig, instability: prevSig.instability, tone: prevSig.tone, policyStance: prevSig.policyStance, chokepoints: prevSig.chokepoints }, market, iso, policyScan);
    const band = now.total >= COUNTRY_BANDS.high ? "acute"
      : now.total >= COUNTRY_BANDS.elevated ? "high"
      : now.total >= COUNTRY_BANDS.low ? "elevated" : "low";
    out[iso] = {
      iso3: iso, score: now.total, band,
      trend: now.total - prev.total,
      drivers: now.contributions.filter(c => c.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3)
    };
    // guarantee 3 drivers even if some are zero
    while (out[iso].drivers.length < 3) out[iso].drivers.push({ label: LABELS.tone, contribution: 0 });
  }
  return out;
}
