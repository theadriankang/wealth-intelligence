import { generateBrief } from "../llm/client.js";
import { HEALTH_BANDS } from "./rubric.js";

const SYSTEM =
  "You write a relationship manager's internal client-facing explanation and score the " +
  "portfolio. Arrange only the facts given — never invent a position, signal, country, or life " +
  "detail. `explanation` is a short bullet list (2-5 bullets, 100 words total): a client " +
  "introduction, the investment thesis (mandate + what it funds), a general overview of the " +
  "investments (broad theme, not specific positions or weights), and — only when the facts " +
  "support it — one bullet naming tax domicile context or an upcoming funding goal. No risk, " +
  "opportunity, urgency, or this-week language in `explanation`; that belongs in `risks`/" +
  "`opportunities`/`actions`. " +
  "For `risks`, consider client-specific alerts across drift (positions or goal funding moving " +
  "off the mandate/target line), concentration, liquidity (illiquid or gated holdings), currency " +
  "(FX exposure relative to the base currency), and collateral (lombard headroom) — tag each with " +
  "the category it actually is, and 'other' only if none fit. " +
  "For `opportunities`, act as an event-based engine: only surface one where a specific country " +
  "signal or the policy stance in the facts connects to this portfolio's own goals or holdings — " +
  "do not invent a connection; return an empty array if nothing in the facts supports one. " +
  "For `actions`, ground personalised recommendations in the mandate, risk profile, tax domicile, " +
  "life stage, and objectives given — rebalancing suggestions need the reasoning attached; tax- " +
  "aware opportunities need the tax domicile fact; life-event actions (retirement, business sale, " +
  "philanthropy, education, succession) need the life stage or objectives fact, not a guess. " +
  "For `relationship`, ground `summary`/`concerns`/`talkingPoints`/`objections` in the " +
  "relationship facts given (last contact, topics discussed, behaviour, standing concerns, " +
  "talking points, objections) plus the client's goals/tax domicile/life stage/objectives — " +
  "refine and reprioritise them for the current facts rather than copying them verbatim, and " +
  "never invent a conversation that didn't happen. Return `relationship: null` only if no " +
  "relationship facts were given at all. " +
  "Nowhere in the response — explanation, risks, opportunities, actions, or relationship — use " +
  "the words buy / sell / execute / switch; these are internal findings and recommendations for " +
  "the RM, never client-facing advice or trade instructions. Compute `health` and `concentration` " +
  "from the numbers given, not qualitatively; `concentration.countries` must only contain country " +
  "codes present in the facts. Return JSON only.";
const SCHEMA = {
  health: "number 0-100 — overall portfolio health given the facts",
  concentration: {
    pct: "number 0-100 — risk-weighted concentration of deteriorating exposure",
    countries: "array of ISO3 codes present in the facts, most significant first"
  },
  explanation: "array of 2-5 short bullet strings, 100 words or fewer combined — client intro, " +
    "investment thesis, general portfolio overview, and optionally a tax-domicile or upcoming- " +
    "goal bullet when relevant. No risk/opportunity/urgency/this-week language.",
  risks: "array of up to 4 objects { text: string, severity: 'high'|'medium'|'low', category: " +
    "'drift'|'concentration'|'liquidity'|'currency'|'collateral'|'other' } — concrete, client- " +
    "specific risk findings grounded in the facts given, most severe first",
  opportunities: "array of up to 3 objects { text: string } — a market development connected to " +
    "this portfolio's own goals or holdings; empty array if none is supported by the facts",
  actions: "array of up to 4 objects { kind: string (one or two words, e.g. 'Rebalance', 'Tax " +
    "review', 'Client conversation'), category: 'rebalancing'|'tax-optimization'|'life-event'|" +
    "'other', title: string (a short recommended action), why: string (one sentence grounding it " +
    "in mandate, risk profile, tax domicile, life stage, or objectives) }",
  relationship: "null, or an object { summary: string (1-2 sentences: last contact and how this " +
    "client tends to behave/decide), concerns: array of up to 4 short strings (standing " +
    "concerns), talkingPoints: array of up to 4 short strings (for the next conversation), " +
    "objections: array of up to 3 objects { question: string (the likely objection, as the " +
    "client might phrase it), answer: string (how to respond) } }"
};

export function templateNarration(clientEval, portfolio, grounding) {
  const goalNames = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const riskProfile = (portfolio.riskProfile || "the client's").toLowerCase();
  const explanation = [
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${riskProfile} profile (${portfolio.riskBand}).`,
    `Built to fund ${goalNames || "the client's stated objectives"}.`,
    `Holds a diversified mix of investments consistent with that mandate.`
  ];
  if (grounding?.taxDomicile) explanation.push(`Tax domicile: ${grounding.taxDomicile}.`);
  const nextGoal = (portfolio.goals || [])[0];
  if (nextGoal?.horizon) explanation.push(`Next funding goal: ${nextGoal.name} (${nextGoal.horizon}).`);

  const risks = (clientEval.risks || []).slice(0, 4).map(r => ({ text: r.text, severity: r.severity, category: categoriseRisk(r) }));
  const opportunities = (clientEval.opportunities || []).slice(0, 3).map(o => ({ text: o.text }));
  const actions = (clientEval.actions || []).slice(0, 4).map(a => ({
    kind: humanize(a.kind), category: categoriseAction(a), title: a.text, why: a.reason
  }));
  const relationship = fallbackRelationship(portfolio.relationship);
  return {
    health: clientEval.health, healthBand: clientEval.healthBand,
    concentration: grounding?.fallbackConcentration, scoreSource: "deterministic",
    explanation, risks, opportunities, actions, relationship
  };
}

function fallbackRelationship(r) {
  if (!r) return null;
  return {
    summary: `Last contact ${r.last?.date || "unknown"} via ${r.last?.channel || "unspecified channel"}. ${r.behaviour || ""}`.trim(),
    concerns: (r.concerns || []).slice(0, 4),
    talkingPoints: (r.points || []).slice(0, 4),
    objections: (r.objections || []).slice(0, 3).map(o => ({ question: o[0], answer: o[1] }))
  };
}

function categoriseRisk(r) {
  const t = (r.text || "").toLowerCase();
  if (/lombard|collateral|headroom/.test(t)) return "collateral";
  if (/concentration|chokepoint/.test(t)) return "concentration";
  if (/funding confidence|dropped through|house view/.test(t)) return "drift";
  return "other";
}
function categoriseAction(a) {
  const t = (a.reason || "").toLowerCase();
  if (/lombard|collateral|concentration|chokepoint/.test(t)) return "rebalancing";
  if (/funding confidence|dropped through/.test(t)) return "life-event";
  return "other";
}

const humanize = s => String(s).replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const wordCount = s => s.trim().split(/\s+/).filter(Boolean).length;
const nonEmptyString = s => typeof s === "string" && s.trim().length > 0;
const HAS_IMPERATIVE = /\b(buy|sell|execute|switch)\b/i;
const SEVERITIES = ["high", "medium", "low"];
const RISK_CATEGORIES = ["drift", "concentration", "liquidity", "currency", "collateral", "other"];
const ACTION_CATEGORIES = ["rebalancing", "tax-optimization", "life-event", "other"];

/** Shape guard for a candidate AI response before it's trusted as health/concentration/explanation/risks/opportunities/actions. */
export function validateAiScore(data, countryCodes) {
  if (!data) return false;
  if (!Array.isArray(data.explanation) || data.explanation.length < 1 || data.explanation.length > 5) return false;
  if (data.explanation.some(b => !nonEmptyString(b) || HAS_IMPERATIVE.test(b))) return false;
  if (data.explanation.reduce((n, b) => n + wordCount(b), 0) > 100) return false;
  if (typeof data.health !== "number" || !Number.isFinite(data.health) || data.health < 0 || data.health > 100) return false;
  const conc = data.concentration;
  if (!conc || typeof conc.pct !== "number" || !Number.isFinite(conc.pct) || conc.pct < 0 || conc.pct > 100) return false;
  if (!Array.isArray(conc.countries) || conc.countries.some(c => !countryCodes.includes(c))) return false;
  if (!Array.isArray(data.risks) || data.risks.length > 4) return false;
  if (data.risks.some(r => !r || !nonEmptyString(r.text) || !SEVERITIES.includes(r.severity)
    || !RISK_CATEGORIES.includes(r.category) || HAS_IMPERATIVE.test(r.text))) return false;
  if (!Array.isArray(data.opportunities) || data.opportunities.length > 3) return false;
  if (data.opportunities.some(o => !o || !nonEmptyString(o.text) || HAS_IMPERATIVE.test(o.text))) return false;
  if (!Array.isArray(data.actions) || data.actions.length > 4) return false;
  if (data.actions.some(a => !a || !nonEmptyString(a.kind) || !nonEmptyString(a.title) || !nonEmptyString(a.why)
    || !ACTION_CATEGORIES.includes(a.category)
    || HAS_IMPERATIVE.test(a.kind) || HAS_IMPERATIVE.test(a.title) || HAS_IMPERATIVE.test(a.why))) return false;
  if (data.relationship !== null && !validRelationship(data.relationship)) return false;
  return true;
}

function validRelationship(r) {
  if (!r || !nonEmptyString(r.summary) || HAS_IMPERATIVE.test(r.summary)) return false;
  if (!Array.isArray(r.concerns) || r.concerns.length > 4 || r.concerns.some(c => !nonEmptyString(c) || HAS_IMPERATIVE.test(c))) return false;
  if (!Array.isArray(r.talkingPoints) || r.talkingPoints.length > 4 || r.talkingPoints.some(t => !nonEmptyString(t) || HAS_IMPERATIVE.test(t))) return false;
  if (!Array.isArray(r.objections) || r.objections.length > 3) return false;
  if (r.objections.some(o => !o || !nonEmptyString(o.question) || !nonEmptyString(o.answer)
    || HAS_IMPERATIVE.test(o.question) || HAS_IMPERATIVE.test(o.answer))) return false;
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
    positions: grounding.positions.map(p => [p.instrumentId, p.weightPct, Math.round(p.riskDelta), p.currency, p.liquidityTier]),
    countrySignals: grounding.countrySignals.map(c => [c.iso3, Math.round(c.riskDelta)]),
    policyStance: grounding.policyStance
  });
  return fnv1a(basis);
}

export async function narrateClient(clientEval, portfolio, rmNotes = [], grounding) {
  const fallback = () => templateNarration(clientEval, portfolio, grounding);
  const facts = {
    // The client's real name never reaches the model — identified by mandate reference only.
    client: { ref: portfolio.ref, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    household: grounding?.household ?? false,
    baseCurrency: grounding?.baseCurrency ?? portfolio.currency ?? null,
    taxDomicile: grounding?.taxDomicile ?? null,
    lifeStage: grounding?.lifeStage ?? null,
    objectives: grounding?.objectives ?? null,
    sourceOfWealth: grounding?.sourceOfWealth ?? null,
    positions: grounding?.positions ?? [],
    countrySignals: grounding?.countrySignals ?? [],
    goals: (portfolio.goals || []).map(g => ({ name: g.name, horizon: g.horizon, baseFunded: g.baseFunded })),
    lombard: portfolio.lombard ? { headroomPct: portfolio.lombard.headroomPct } : null,
    risks: (clientEval.risks || []).map(r => ({ text: r.text, severity: r.severity })),
    opportunities: (clientEval.opportunities || []).map(o => o.text),
    relationship: portfolio.relationship ? {
      lastContactDate: portfolio.relationship.last?.date ?? null,
      lastContactChannel: portfolio.relationship.last?.channel ?? null,
      topicsDiscussed: portfolio.relationship.last?.topics ?? null,
      behaviour: portfolio.relationship.behaviour ?? null,
      standingConcerns: portfolio.relationship.concerns ?? [],
      talkingPoints: portfolio.relationship.points ?? [],
      likelyObjections: (portfolio.relationship.objections ?? []).map(o => ({ question: o[0], answer: o[1] }))
    } : null,
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
      explanation: res.data.explanation,
      risks: res.data.risks, opportunities: res.data.opportunities, actions: res.data.actions,
      relationship: res.data.relationship
    };
  }
  return fallback();
}
