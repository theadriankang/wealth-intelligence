import { URGENT_CUTOFF, URGENT_STRIP_MAX } from "./rubric.js";

export function collectUrgent(clientEvals, cutoff = URGENT_CUTOFF) {
  const tasks = [];
  for (const ce of clientEvals) {
    for (const a of ce.actions || []) {
      if (a.urgency >= cutoff) tasks.push({
        portfolioId: ce.portfolioId, clientName: ce.name,
        actionId: a.id, text: a.text, urgency: a.urgency, kind: a.kind
      });
    }
  }
  return tasks.sort((x, y) => y.urgency - x.urgency).slice(0, URGENT_STRIP_MAX);
}
