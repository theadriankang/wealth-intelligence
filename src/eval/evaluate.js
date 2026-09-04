import { scoreCountries } from "./countryScore.js";
import { evaluateClient } from "./clientEval.js";
import { collectUrgent } from "./urgent.js";

export function hashClient(ce) {
  const basis = JSON.stringify({
    h: Math.round(ce.health),
    r: (ce.risks || []).map(r => [r.id, Math.round(r.urgency)]),
    a: (ce.actions || []).map(a => [a.id, Math.round(a.urgency)])
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) { h ^= basis.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function runEvaluation({ portfolios, instruments, signals, prevSignals, market, policyScan = null }) {
  const countries = scoreCountries(signals, prevSignals, market, policyScan);
  const clients = {}, hash = {};
  for (const p of portfolios) {
    const ce = evaluateClient(p, instruments, signals, prevSignals, countries, policyScan);
    clients[p.id] = ce;
    hash[p.id] = hashClient(ce);
  }
  const urgent = collectUrgent(Object.values(clients));
  return { at: Date.now(), countries, clients, urgent, hash };
}
