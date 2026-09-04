import { generateBrief } from "../llm/client.js";

const SYSTEM =
  "You write a relationship manager's internal briefing. Arrange only the facts given. " +
  "No new facts, no client-facing advice, never the words buy / sell / execute / switch. " +
  "Two short paragraphs. Return JSON only.";
const SCHEMA = { thesis: "string — what the portfolio is built to do", summary: "string — where it stands now" };

export function templateNarration(clientEval, portfolio) {
  const goals = (portfolio.goals || []).map(g => g.name).slice(0, 3).join(", ");
  const thesis =
    `A ${portfolio.mandate.toLowerCase()} mandate on a ${(portfolio.riskProfile || "").toLowerCase()} profile (${portfolio.riskBand}). ` +
    `The book is built to fund ${goals || "the client's stated objectives"}, and the position mix reflects that horizon.`;
  const topRisk = (clientEval.risks || []).slice().sort((a, b) => b.urgency - a.urgency)[0];
  const summary =
    `Health reads ${clientEval.healthBand} (${Math.round(clientEval.health)}/100). ` +
    (topRisk ? `The item that matters this week: ${topRisk.text}` : `Nothing this week requires a decision before the next review.`);
  return { thesis, summary };
}

export async function narrateClient(clientEval, portfolio, rmNotes = []) {
  const facts = {
    client: { name: portfolio.name, mandate: portfolio.mandate, riskProfile: portfolio.riskProfile, riskBand: portfolio.riskBand },
    goals: (portfolio.goals || []).map(g => ({ name: g.name, horizon: g.horizon })),
    health: { score: Math.round(clientEval.health), band: clientEval.healthBand },
    risks: (clientEval.risks || []).map(r => r.text),
    opportunities: (clientEval.opportunities || []).map(o => o.text),
    rmNotes
  };
  const res = await generateBrief({
    system: SYSTEM,
    prompt: `Facts:\n${JSON.stringify(facts, null, 2)}`,
    schema: SCHEMA
  });
  if (res.ok && res.data && typeof res.data.thesis === "string" && typeof res.data.summary === "string") {
    return { thesis: res.data.thesis, summary: res.data.summary };
  }
  return templateNarration(clientEval, portfolio);
}
