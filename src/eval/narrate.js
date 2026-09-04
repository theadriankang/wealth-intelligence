import { generateBrief } from "../llm/client.js";
import { HEALTH_BANDS } from "./rubric.js";

const SYSTEM =
  "You write a relationship manager's internal client-facing explanation and score the " +
  "portfolio. Arrange only the facts given — never invent a position, signal, or country. " +
  "`thesis` states the mandate and what the portfolio is built to fund. `summary` factually " +
  "describes the current portfolio's composition — size, number of positions, concentration by " +
  "theme or market. `summary` must NOT mention risks, opportunities, urgency, or anything " +
  "time-framed like 'this week' — that commentary belongs in a different, separate briefing, not " +
  "in this explanation. No client-facing advice, never the words buy / sell / execute / switch. " +
  "Compute `health` (0-100, overall portfolio health) and `concentration` (risk-weighted " +
  "concentration of deteriorating exposure, 0-100, plus the driving countries) from the numbers " +
  "given — do not just describe them qualitatively. `concentration.countries` must only contain " +
  "country codes present in the facts. Two short paragraphs for thesis/summary. Return JSON only.";
const SCHEMA = {
  health: "number 0-100 — overall portfolio health given the facts",
  concentration: {
    pct: "number 0-100 — risk-weighted concentration of deteriorating exposure",
    countries: "array of ISO3 codes present in the facts, most significant first"
  },
  thesis: "string — what the portfolio is built to do",
  summary: "string — a factual description of the current portfolio's composition; no risk, opportunity, or this-week commentary"
};

export function templateNarration(clientEval, portfolio, fallbackConcentration) {
  const goals = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const thesis =
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${(portfolio.riskProfile || "").toLowerCase()} profile (${portfolio.riskBand}). ` +
    `The book is built to fund ${goals || "the client's stated objectives"}, and the position mix reflects that horizon.`;
  const positions = portfolio.positions || [];
  const top = [...positions].sort((a, b) => b.weightPct - a.weightPct)[0];
  const summary =
    `The book currently holds ${positions.length} position${positions.length === 1 ? "" : "s"}` +
    (top ? `, led by ${top.instrumentId} at ${top.weightPct.toFixed(1)}% of the portfolio.` : ".");
  return {
    health: clientEval.health, healthBand: clientEval.healthBand,
    concentration: fallbackConcentration, scoreSource: "deterministic",
    thesis, summary
  };
}

/** Shape guard for a candidate AI response before it's trusted as health/concentration. */
export function validateAiScore(data, countryCodes) {
  if (!data || typeof data.thesis !== "string" || typeof data.summary !== "string") return false;
  if (typeof data.health !== "number" || !Number.isFinite(data.health) || data.health < 0 || data.health > 100) return false;
  const conc = data.concentration;
  if (!conc || typeof conc.pct !== "number" || !Number.isFinite(conc.pct) || conc.pct < 0 || conc.pct > 100) return false;
  if (!Array.isArray(conc.countries) || conc.countries.some(c => !countryCodes.includes(c))) return false;
  return true;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** Hashes the raw facts that decide whether the model needs to be re-asked — not the answer. */
export function factsHash(portfolioId, grounding) {
  const basis = JSON.stringify({
    id: portfolioId,
    household: grounding.household,
    positions: grounding.positions.map(p => [p.instrumentId, p.weightPct, Math.round(p.riskDelta)]),
    countrySignals: grounding.countrySignals.map(c => [c.iso3, Math.round(c.riskDelta)]),
    policyStance: grounding.policyStance
  });
  return fnv1a(basis);
}

export async function narrateClient(clientEval, portfolio, rmNotes = [], grounding) {
  const fallback = () => templateNarration(clientEval, portfolio, grounding?.fallbackConcentration);
  const facts = {
    client: { name: portfolio.name, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    household: grounding?.household ?? false,
    positions: grounding?.positions ?? [],
    countrySignals: grounding?.countrySignals ?? [],
    goals: (portfolio.goals || []).map(g => ({ name: g.name, horizon: g.horizon, baseFunded: g.baseFunded })),
    lombard: portfolio.lombard ? { headroomPct: portfolio.lombard.headroomPct } : null,
    risks: (clientEval.risks || []).map(r => r.text),
    opportunities: (clientEval.opportunities || []).map(o => o.text),
    rmNotes
  };
  let res;
  try {
    res = await generateBrief({ system: SYSTEM, prompt: `Facts:\n${JSON.stringify(facts, null, 2)}`, schema: SCHEMA });
  } catch {
    return fallback();
  }
  const countryCodes = (grounding?.countrySignals ?? []).map(c => c.iso3);
  if (res.ok && validateAiScore(res.data, countryCodes)) {
    const health = res.data.health;
    const healthBand = health >= HEALTH_BANDS.strong ? "strong" : health >= HEALTH_BANDS.watch ? "watch" : "strained";
    return {
      health, healthBand,
      concentration: { pct: res.data.concentration.pct, countries: res.data.concentration.countries },
      scoreSource: "ai",
      thesis: res.data.thesis, summary: res.data.summary
    };
  }
  return fallback();
}
