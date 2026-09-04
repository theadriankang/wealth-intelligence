import { generateBrief } from "../llm/client.js";
import { HEALTH_BANDS } from "./rubric.js";

const SYSTEM =
  "You write a relationship manager's internal client-facing explanation and score the " +
  "portfolio. Arrange only the facts given — never invent a position, signal, or country. " +
  "`thesis` states the mandate and what the portfolio is built to fund. `summary` gives a brief, " +
  "general overview of the current investments — the broad asset mix or theme, not specific " +
  "positions, tickers, or weights. `summary` must NOT mention risks, opportunities, urgency, or " +
  "anything time-framed like 'this week' — that commentary belongs in `risks`/`actions`, not in " +
  "this explanation. Keep `thesis` and `summary` together to at most 80 words combined. " +
  "Nowhere in the response — not thesis, summary, risks, or actions — use the words buy / sell / " +
  "execute / switch; these are internal findings and recommendations for the RM, never client- " +
  "facing advice or trade instructions. Compute `health` (0-100, overall portfolio health) and " +
  "`concentration` (risk-weighted concentration of deteriorating exposure, 0-100, plus the " +
  "driving countries) from the numbers given — do not just describe them qualitatively. " +
  "`concentration.countries` must only contain country codes present in the facts. `risks` and " +
  "`actions` must be grounded in the positions/signals/goals/lombard facts given — the `risks`/ " +
  "`opportunities` facts already reflect this book's deterministic findings; independently assess " +
  "the same underlying facts rather than merely restating them. Return JSON only.";
const SCHEMA = {
  health: "number 0-100 — overall portfolio health given the facts",
  concentration: {
    pct: "number 0-100 — risk-weighted concentration of deteriorating exposure",
    countries: "array of ISO3 codes present in the facts, most significant first"
  },
  thesis: "string — what the portfolio is built to do",
  summary: "string — a brief, general overview of the current investments (broad asset mix/theme, " +
    "not specific positions or weights); no risk, opportunity, or this-week commentary. thesis + " +
    "summary combined must be 80 words or fewer.",
  risks: "array of up to 4 objects { text: string, severity: 'high'|'medium'|'low' } — concrete " +
    "risk findings grounded in the facts given, most severe first",
  actions: "array of up to 4 objects { kind: string (one or two words, e.g. 'Reduce risk', " +
    "'Rebalance', 'Client conversation'), title: string (a short recommended action), why: " +
    "string (one sentence grounding it in a specific fact) }"
};

export function templateNarration(clientEval, portfolio, fallbackConcentration) {
  const goals = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const thesis =
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${(portfolio.riskProfile || "").toLowerCase()} profile (${portfolio.riskBand}). ` +
    `The book is built to fund ${goals || "the client's stated objectives"}, and the position mix reflects that horizon.`;
  const riskProfile = (portfolio.riskProfile || "the client's").toLowerCase();
  const summary =
    `The portfolio holds a diversified mix of investments consistent with the ${riskProfile} risk profile and the ${portfolio.mandate.toLowerCase()} mandate.`;
  const risks = (clientEval.risks || []).slice(0, 4).map(r => ({ text: r.text, severity: r.severity }));
  const actions = (clientEval.actions || []).slice(0, 4).map(a => ({ kind: humanize(a.kind), title: a.text, why: a.reason }));
  return {
    health: clientEval.health, healthBand: clientEval.healthBand,
    concentration: fallbackConcentration, scoreSource: "deterministic",
    thesis, summary, risks, actions
  };
}

const humanize = s => String(s).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const wordCount = s => s.trim().split(/\s+/).filter(Boolean).length;
const nonEmptyString = s => typeof s === "string" && s.trim().length > 0;
const HAS_IMPERATIVE = /\b(buy|sell|execute|switch)\b/i;
const SEVERITIES = ["high", "medium", "low"];

/** Shape guard for a candidate AI response before it's trusted as health/concentration/risks/actions. */
export function validateAiScore(data, countryCodes) {
  if (!data || typeof data.thesis !== "string" || typeof data.summary !== "string") return false;
  if (HAS_IMPERATIVE.test(data.thesis) || HAS_IMPERATIVE.test(data.summary)) return false;
  if (wordCount(data.thesis) + wordCount(data.summary) > 80) return false;
  if (typeof data.health !== "number" || !Number.isFinite(data.health) || data.health < 0 || data.health > 100) return false;
  const conc = data.concentration;
  if (!conc || typeof conc.pct !== "number" || !Number.isFinite(conc.pct) || conc.pct < 0 || conc.pct > 100) return false;
  if (!Array.isArray(conc.countries) || conc.countries.some(c => !countryCodes.includes(c))) return false;
  if (!Array.isArray(data.risks) || data.risks.length > 4) return false;
  if (data.risks.some(r => !r || !nonEmptyString(r.text) || !SEVERITIES.includes(r.severity) || HAS_IMPERATIVE.test(r.text))) return false;
  if (!Array.isArray(data.actions) || data.actions.length > 4) return false;
  if (data.actions.some(a => !a || !nonEmptyString(a.kind) || !nonEmptyString(a.title) || !nonEmptyString(a.why)
    || HAS_IMPERATIVE.test(a.kind) || HAS_IMPERATIVE.test(a.title) || HAS_IMPERATIVE.test(a.why))) return false;
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
    risks: (clientEval.risks || []).map(r => ({ text: r.text, severity: r.severity })),
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
      thesis: res.data.thesis, summary: res.data.summary,
      risks: res.data.risks, actions: res.data.actions
    };
  }
  return fallback();
}
