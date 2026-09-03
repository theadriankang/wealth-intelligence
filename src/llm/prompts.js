/**
 * Prompts live here, not inline in UI code, so they can be edited and diffed.
 * Everything the model may assert is passed in as facts with ids.
 */

export const SYSTEM = `You write internal briefing notes for relationship managers at a private bank.

Rules, without exception:
- Use ONLY the facts supplied. Never introduce a number, date, event or claim not in them.
- Every claim carries at least one citation to a supplied fact id.
- This is decision support for the adviser, not advice to a client. Never write in a
  register that would read as a recommendation to an end client.
- Lead with the client's own objectives. Market movement matters only insofar as it
  changes whether the client gets what they want.
- Where the signal disagrees with the bank's house view, say so plainly rather than
  resolving the disagreement yourself.
- Plain, specific, unhedged prose. No filler, no throat-clearing, no adjectives doing
  work that a number should do.
- If the supplied facts do not support a section, return that section with no claims
  rather than padding it.`;

export function buildBriefPrompt({ portfolio, goals, flagged, facts, houseView, economics }) {
  return `## Mandate
${portfolio.name} (${portfolio.ref}) · ${portfolio.mandate} mandate · ${portfolio.riskProfile} (${portfolio.riskBand})
Relationship manager: ${portfolio.rm}. Next review: ${portfolio.reviewDate}.

## Client objectives, with this week's movement
${goals.map(g => `- [${g.id}] ${g.name} (${g.horizon}, ${g.targetLabel}): ${g.funded}% funded, ${g.change >= 0 ? "+" : ""}${g.change} pts this week. Driven by: ${g.contributions.map(c => c.instrumentId).join(", ") || "—"}`).join("\n")}

## Flagged positions
${flagged.map(p => `- ${p.instrumentId} · ${p.weightPct.toFixed(1)}% · risk Δ ${p.riskDelta >= 0 ? "+" : ""}${Math.round(p.riskDelta)}`).join("\n") || "None."}

## House view
${houseView}

## Facts you may cite (id — source — text — value)
${facts.map(f => `[${f.id}] ${f.source} — ${f.text} — ${f.value}`).join("\n")}

${economics ? `## Adviser context\nPreparing this manually takes about ${economics.prepBefore} minutes per client.\n` : ""}
Produce the briefing note as JSON matching the supplied schema. Sections, in order:
"Where the goals stand", "What moved and why", "Where this disagrees with the house view",
"What we propose". Every claim cites at least one fact id.`;
}

export function buildWhyFlaggedPrompt({ instrument, exposures, facts }) {
  return `Explain in two or three sentences why this position is flagged, for an adviser
who will read it in under ten seconds.

Position: ${instrument.name} (${instrument.id}), ${instrument.assetClass}.
Country exposure after look-through: ${exposures.map(e => `${e.iso3} ${(e.weight * 100).toFixed(0)}%`).join(", ")}.
${instrument.chokepoints?.length ? `Physical dependencies: ${instrument.chokepoints.join(", ")}.` : ""}

Facts you may cite:
${facts.map(f => `[${f.id}] ${f.source} — ${f.text} — ${f.value}`).join("\n")}

Return JSON matching the schema. No claim without a citation.`;
}
