/**
 * ADAPTERS — the seam.
 *
 * Everything the app knows about the outside world enters through one of these.
 * When the Julius Baer repo lands, fill in juliusbaer.js and change ONE line in
 * src/config.js. No UI file, no scoring file, no globe code changes.
 *
 * An adapter returns: { instruments, portfolios, signals, prevSignals, meta }
 */
import { demoAdapter } from "./demo.js";
import { juliusBaerAdapter } from "./juliusbaer.js";
import { csvAdapter } from "./csv.js";
import { validatePortfolio, validateInstrument } from "../model/schema.js";

export const ADAPTERS = {
  demo: demoAdapter,
  juliusbaer: juliusBaerAdapter,
  csv: csvAdapter
};

export async function loadData(name, opts = {}) {
  const adapter = ADAPTERS[name];
  if (!adapter) throw new Error(`Unknown adapter "${name}". Have: ${Object.keys(ADAPTERS).join(", ")}`);
  const data = await adapter(opts);

  const errs = [];
  for (const i of Object.values(data.instruments)) errs.push(...validateInstrument(i));
  for (const p of data.portfolios) errs.push(...validatePortfolio(p, data.instruments));
  if (errs.length) {
    console.warn(`[adapter:${name}] ${errs.length} validation problem(s):`);
    errs.slice(0, 20).forEach(e => console.warn("  ·", e));
  }
  return { ...data, meta: { ...(data.meta || {}), adapter: name, issues: errs.length } };
}
