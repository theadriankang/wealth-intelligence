import { generateBrief } from "../llm/client.js";
import { HEALTH_BANDS, AI_SCORE_BAND } from "./rubric.js";

const SYSTEM =
  "You write a relationship manager's internal client-facing explanation and score the " +
  "portfolio. Arrange only the facts given — never invent a position, signal, country, or life " +
  "detail. " +
  "Write every prose field (overview, risks[].text, opportunities[].text, actions[].title/why, " +
  "relationship's summary/concerns/talkingPoints/objections, complianceChecks[].detail, " +
  "impactNarrative) like a quick catch-up note a colleague reads before calling the client — " +
  "not a research report or a compliance memo. Plain, spoken language: 'tied up in' rather than " +
  "'concentrated exposure', 'under pressure' rather than 'deteriorating', 'slipped below X%' " +
  "rather than 'crossed a funding-confidence band'. Keep every specific number, name, and " +
  "country — simplify the words around them, not the substance. " +
  "`overview` is a single flowing prose paragraph, 100 words or fewer, not a list or " +
  "bullet points: a client introduction, the investment thesis (mandate + what it funds), a " +
  "general overview of the investments (broad theme, not specific positions or weights), and — " +
  "only when the facts support it — a clause naming tax domicile context or an upcoming funding " +
  "goal. No risk, opportunity, urgency, or this-week language in `overview`; that belongs in " +
  "`risks`/`opportunities`/`actions`. " +
  "For `risks`, consider client-specific alerts across drift (positions or goal funding moving " +
  "off the mandate/target line), concentration (too much sitting in one place), liquidity " +
  "(illiquid or gated holdings), currency (FX exposure relative to the base currency), and " +
  "collateral (lombard headroom) — tag `category` with whichever of those it actually is, and " +
  "'other' only if none fit; the category field itself is an internal tag, not something the " +
  "RM reads, so it can stay technical even while `text` stays plain. " +
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
  "For `complianceChecks`, produce one item per compliance-relevant fact actually given — PEP " +
  "status, tax domicile/reporting jurisdiction, KYC review timing, and how spread out the " +
  "portfolio's real (look-through) holdings are against the mandate's bands — and no others; " +
  "never invent a screening result, a counterparty count, or a check for something not in the " +
  "facts. `item` can stay a short compliance label (e.g. 'PEP status', 'Concentration policy'); " +
  "`detail` is the plain-language sentence explaining it. status is 'watch' only when the fact " +
  "itself supports concern (e.g. pepStatus is Yes, or a position's weight exceeds a mandate " +
  "band's maxSingle), otherwise 'clear'. " +
  "For `impactNarrative`, one short prose paragraph (60 words or fewer, not a list) on what this " +
  "specific client's mandate concretely involves this review — holdings count, mandate " +
  "complexity, what's flagged — grounded only in this client's own facts, never a book-wide or " +
  "generic operating-leverage claim. " +
  "Nowhere in the response — overview, risks, opportunities, actions, relationship, " +
  "complianceChecks, or impactNarrative — use the words buy / sell / execute / switch; these are " +
  "internal findings and recommendations for the RM, never client-facing advice or trade " +
  "instructions. Compute `health` and `concentration` from the numbers given, not qualitatively. " +
  "The facts include `referenceHealth` and `referenceConcentrationPct` — the bank's own " +
  "deterministic read of the same facts. Your `health` and `concentration.pct` are an " +
  "independent gut-check within a stated tolerance, not a free estimate: each must land within " +
  AI_SCORE_BAND + " points of its reference value. " +
  "`concentration.countries` must only contain country codes present in the facts. Return JSON only.";
const SCHEMA = {
  health: "number 0-100 — overall portfolio health given the facts, within " + AI_SCORE_BAND +
    " points of the given referenceHealth",
  concentration: {
    pct: "whole number 0-100, no decimal places — risk-weighted concentration of deteriorating " +
      "exposure, within " + AI_SCORE_BAND + " points of the given referenceConcentrationPct",
    countries: "array of ISO3 codes present in the facts, most significant first"
  },
  overview: "string — a single prose paragraph, not a list, 100 words or fewer: client intro, " +
    "investment thesis, general portfolio overview, and optionally a tax-domicile or upcoming- " +
    "goal clause when relevant. No risk/opportunity/urgency/this-week language.",
  risks: "array of up to 4 objects { text: string (plain, spoken language — no jargon), " +
    "severity: 'high'|'medium'|'low', category: 'drift'|'concentration'|'liquidity'|'currency'|" +
    "'collateral'|'other' } — concrete, client-specific risk findings grounded in the facts " +
    "given, most severe first",
  opportunities: "array of up to 3 objects { text: string (plain, spoken language) } — a market " +
    "development connected to this portfolio's own goals or holdings; empty array if none is " +
    "supported by the facts",
  actions: "array of up to 4 objects { kind: string (one or two words, e.g. 'Rebalance', 'Tax " +
    "review', 'Client conversation'), category: 'rebalancing'|'tax-optimization'|'life-event'|" +
    "'other', title: string (a short recommended action, plain language), why: string (one " +
    "plain-language sentence grounding it in mandate, risk profile, tax domicile, life stage, " +
    "or objectives) }",
  relationship: "null, or an object { summary: string (1-2 sentences: last contact and how this " +
    "client tends to behave/decide), concerns: array of up to 4 short strings (standing " +
    "concerns), talkingPoints: array of up to 4 short strings (for the next conversation), " +
    "objections: array of up to 3 objects { question: string (the likely objection, as the " +
    "client might phrase it), answer: string (how to respond) } }",
  complianceChecks: "array of up to 4 objects { item: string (e.g. 'PEP status', 'Tax domicile', " +
    "'KYC review', 'Concentration policy'), status: 'clear'|'watch', detail: string (one sentence " +
    "citing the specific fact behind it) } — one per compliance-relevant fact actually present in " +
    "the facts given, no invented checks",
  impactNarrative: "string — one prose paragraph, 60 words or fewer, on what this specific " +
    "client's mandate concretely involves this review (holdings count, mandate complexity, " +
    "what's flagged); never a book-wide or generic claim"
};

export function templateNarration(clientEval, portfolio, grounding) {
  const goalNames = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const riskProfile = (portfolio.riskProfile || "the client's").toLowerCase();
  const nextGoal = (portfolio.goals || [])[0];
  let overview =
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${riskProfile} profile (${portfolio.riskBand}), ` +
    `built to fund ${goalNames || "the client's stated objectives"}. The portfolio holds a diversified ` +
    `mix of investments consistent with that mandate`;
  overview += grounding?.taxDomicile ? `, with a tax domicile of ${grounding.taxDomicile}` : "";
  overview += nextGoal?.horizon ? `, and its next funding goal is ${nextGoal.name} (${nextGoal.horizon})` : "";
  overview += ".";

  const risks = (clientEval.risks || []).slice(0, 4).map(r => ({ text: r.text, severity: r.severity, category: categoriseRisk(r) }));
  const opportunities = (clientEval.opportunities || []).slice(0, 3).map(o => ({ text: o.text }));
  const actions = (clientEval.actions || []).slice(0, 4).map(a => ({
    kind: humanize(a.kind), category: categoriseAction(a), title: a.text, why: a.reason
  }));
  const relationship = fallbackRelationship(portfolio.relationship);
  const complianceChecks = fallbackComplianceChecks(portfolio, grounding, clientEval);
  const impactNarrative = fallbackImpactNarrative(portfolio, clientEval);
  return {
    health: clientEval.health, healthBand: clientEval.healthBand,
    concentration: grounding?.fallbackConcentration, scoreSource: "deterministic",
    overview, risks, opportunities, actions, relationship, complianceChecks, impactNarrative
  };
}

function fallbackComplianceChecks(portfolio, grounding, clientEval) {
  const checks = [];
  if (grounding?.pepStatus) {
    const flagged = grounding.pepStatus.toLowerCase() === "yes";
    checks.push({ item: "PEP status", status: flagged ? "watch" : "clear",
      detail: flagged ? "Client is on record as a politically exposed person — enhanced due diligence applies."
        : "No politically exposed person status on record." });
  }
  if (grounding?.taxDomicile) {
    checks.push({ item: "Tax domicile", status: "clear", detail: `On record: ${grounding.taxDomicile}.` });
  }
  checks.push({ item: "KYC review", status: "clear", detail: `Next review due ${portfolio.reviewDate}.` });
  const concentrationFlagged = (clientEval.risks || []).some(r =>
    r.topic ? (r.topic === "concentration" || r.topic === "chokepoint") : /concentration|chokepoint/i.test(r.text));
  checks.push({ item: "Concentration policy", status: concentrationFlagged ? "watch" : "clear",
    detail: concentrationFlagged ? "A larger share than usual is tied up in one place, above what's typical for this mandate."
      : "Holdings are well spread out — nothing unusual for this mandate." });
  return checks;
}

function fallbackImpactNarrative(portfolio, clientEval) {
  const n = (portfolio.positions || []).length;
  const flagged = (clientEval.risks || []).length;
  return `Reviewing ${portfolio.ref}'s ${portfolio.mandate.toLowerCase()} mandate covers ${n} holding${n === 1 ? "" : "s"}` +
    (flagged
      ? `, and ${flagged} ${flagged === 1 ? "is" : "are"} already flagged below — nothing to chase down from scratch.`
      : ", with nothing flagged for this review.");
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

/** clientEval.js tags its own findings with a stable `topic` (concentration/chokepoint/funding/
 * lombard/houseview) so its prose can be reworded freely without breaking classification here.
 * The regex fallback only serves callers that hand-build a risk/action object without a topic —
 * e.g. narrate.test.js's fixtures. */
function categoriseRisk(r) {
  if (r.topic) {
    if (r.topic === "lombard") return "collateral";
    if (r.topic === "concentration" || r.topic === "chokepoint") return "concentration";
    if (r.topic === "funding" || r.topic === "houseview") return "drift";
    return "other";
  }
  const t = (r.text || "").toLowerCase();
  if (/lombard|collateral|headroom/.test(t)) return "collateral";
  if (/concentration|chokepoint/.test(t)) return "concentration";
  if (/funding confidence|dropped through|house view/.test(t)) return "drift";
  return "other";
}
function categoriseAction(a) {
  if (a.topic) {
    if (a.topic === "lombard" || a.topic === "concentration" || a.topic === "chokepoint") return "rebalancing";
    if (a.topic === "funding") return "life-event";
    return "other";
  }
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
const CHECK_STATUSES = ["clear", "watch"];

/** Shape guard for a candidate AI response before it's trusted as
 * health/concentration/overview/risks/opportunities/actions/complianceChecks/impactNarrative.
 * `reference`, when given ({ health, concentrationPct }), is the deterministic engine's own
 * read of the same facts — a response is rejected in full (not partially merged) if its health
 * or concentration.pct drifts more than AI_SCORE_BAND points from it. Callers that don't have
 * (or don't want) a bounded reference can omit it and skip that check — used by tests that only
 * exercise the shape guard. */
export function validateAiScore(data, countryCodes, reference) {
  if (!data) return false;
  if (!nonEmptyString(data.overview) || HAS_IMPERATIVE.test(data.overview) || wordCount(data.overview) > 100) return false;
  if (typeof data.health !== "number" || !Number.isFinite(data.health) || data.health < 0 || data.health > 100) return false;
  if (reference && Number.isFinite(reference.health) && Math.abs(data.health - reference.health) > AI_SCORE_BAND) return false;
  const conc = data.concentration;
  if (!conc || typeof conc.pct !== "number" || !Number.isFinite(conc.pct) || conc.pct < 0 || conc.pct > 100) return false;
  if (reference && Number.isFinite(reference.concentrationPct) && Math.abs(conc.pct - reference.concentrationPct) > AI_SCORE_BAND) return false;
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
  if (!Array.isArray(data.complianceChecks) || data.complianceChecks.length > 4) return false;
  if (data.complianceChecks.some(c => !c || !nonEmptyString(c.item) || !CHECK_STATUSES.includes(c.status)
    || !nonEmptyString(c.detail) || HAS_IMPERATIVE.test(c.detail))) return false;
  if (!nonEmptyString(data.impactNarrative) || HAS_IMPERATIVE.test(data.impactNarrative) || wordCount(data.impactNarrative) > 60) return false;
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
  const reference = { health: clientEval.health, concentrationPct: grounding?.fallbackConcentration?.pct };
  const facts = {
    // The client's real name never reaches the model — identified by mandate reference only.
    client: { ref: portfolio.ref, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    // The bank's own deterministic health/concentration read — see AI_SCORE_BAND (rubric.js):
    // the model's own numbers must land within that many points of these, or the whole
    // response is rejected in favor of the deterministic fallback (validateAiScore below).
    referenceHealth: reference.health,
    referenceConcentrationPct: reference.concentrationPct ?? null,
    household: grounding?.household ?? false,
    baseCurrency: grounding?.baseCurrency ?? portfolio.currency ?? null,
    taxDomicile: grounding?.taxDomicile ?? null,
    lifeStage: grounding?.lifeStage ?? null,
    objectives: grounding?.objectives ?? null,
    sourceOfWealth: grounding?.sourceOfWealth ?? null,
    pepStatus: grounding?.pepStatus ?? null,
    mandateBands: grounding?.mandateBands ?? [],
    kycReviewDue: portfolio.reviewDate ?? null,
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
  if (res.ok && validateAiScore(res.data, countryCodes, reference)) {
    const health = res.data.health;
    const healthBand = health >= HEALTH_BANDS.strong ? "strong" : health >= HEALTH_BANDS.watch ? "watch" : "strained";
    return {
      health, healthBand,
      concentration: { pct: Math.round(res.data.concentration.pct), countries: res.data.concentration.countries },
      scoreSource: "ai",
      overview: res.data.overview,
      risks: res.data.risks, opportunities: res.data.opportunities, actions: res.data.actions,
      relationship: res.data.relationship,
      complianceChecks: res.data.complianceChecks, impactNarrative: res.data.impactNarrative
    };
  }
  return fallback();
}

const COPILOT_SYSTEM =
  "You are an internal RM copilot answering a relationship manager's question about a specific " +
  "client's portfolio. Use only the facts given — never invent a position, signal, goal, or " +
  "note; if the facts don't support an answer, say so honestly rather than guessing at one. No " +
  "client-facing advice, never the words buy / sell / execute / switch. Keep the answer to 80 " +
  "words or fewer. Return JSON only.";
const COPILOT_SCHEMA = {
  answer: "string — a concise answer grounded only in the facts given, 80 words or fewer"
};

/** The AI Copilot's "ask anything" box, routed to the same /api/llm path as narrateClient — one
 * question about the currently open client, answered from the same facts (positions, goals,
 * tax/life-stage, lombard, RM notes) rather than the static placeholder this used to show.
 * Not hash-gated/cached like narrateClient: each question is its own one-off ask, not a
 * recurring fact-driven score. Falls back to `{ ok: false }` on any network failure, invalid
 * response, empty answer, or a stray imperative verb — the caller decides what to show. */
export async function askCopilot(question, portfolio, grounding, rmNotes = []) {
  const facts = {
    client: { ref: portfolio.ref, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    question,
    household: grounding?.household ?? false,
    taxDomicile: grounding?.taxDomicile ?? null,
    lifeStage: grounding?.lifeStage ?? null,
    objectives: grounding?.objectives ?? null,
    positions: grounding?.positions ?? [],
    countrySignals: grounding?.countrySignals ?? [],
    goals: (portfolio.goals || []).map(g => ({ name: g.name, horizon: g.horizon, baseFunded: g.baseFunded })),
    lombard: portfolio.lombard ? { headroomPct: portfolio.lombard.headroomPct } : null,
    rmNotes
  };
  const res = await generateBrief({ system: COPILOT_SYSTEM, prompt: `Facts:\n${JSON.stringify(facts, null, 2)}`, schema: COPILOT_SCHEMA });
  const answer = res.data?.answer;
  if (res.ok && nonEmptyString(answer) && !HAS_IMPERATIVE.test(answer)) {
    return { ok: true, answer };
  }
  return { ok: false, answer: null };
}
