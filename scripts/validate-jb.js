/**
 * Runs the Julius Baer adapter outside the browser and reports what did not map.
 * Run: node scripts/validate-jb.js
 */
import { readFileSync } from "node:fs";
import { buildJuliusBaer } from "../src/adapters/jb/build.js";
import { validatePortfolio, validateInstrument } from "../src/model/schema.js";

const D = "data/juliusbaer";
const r = f => readFileSync(`${D}/${f}`, "utf8");
const data = buildJuliusBaer({
  clients: r("clients.csv"), portfolios: r("portfolios.csv"), holdings: r("holdings.csv"),
  instruments: r("instruments.csv"), mandates: r("mandates.csv"),
  facilities: r("credit_facilities.csv"), commitments: r("commitments.csv"),
  cashNeeds: r("planned_cash_needs.csv"), market: r("market_context.csv"),
  events: r("event_log.csv"), notes: r("rm_notes.json")
});

const line = s => console.log(s);
line("");
line("═".repeat(78));
line(`ADAPTER: julius-baer   as of ${data.meta.asOf}   (prev ${data.meta.prev})`);
line("═".repeat(78));
line(`  instruments  ${Object.keys(data.instruments).length}`);
line(`  clients      ${data.portfolios.length}`);
line(`  countries    ${Object.keys(data.signals).length}`);
line(`  events       ${data.meta.eventRegistry}`);
line(`  fx missing   ${data.meta.fxMissing.length ? data.meta.fxMissing.join(", ") : "none"}`);

const errs = [];
for (const i of Object.values(data.instruments)) errs.push(...validateInstrument(i));
for (const p of data.portfolios) errs.push(...validatePortfolio(p, data.instruments));
line(`  schema       ${errs.length ? errs.length + " PROBLEM(S)" : "clean"}`);
errs.slice(0, 15).forEach(e => line("     · " + e));

line("");
line("LOOK-THROUGH — legs that could not be resolved to a held instrument");
line("─".repeat(78));
if (!data.meta.unresolvedLegs.length) line("  none");
for (const u of data.meta.unresolvedLegs) line(`  ${u.id}  ${u.legs.join(" ; ")}`);

line("");
line("THE BOOK — who to call first");
line("─".repeat(78));
line("  " + "client".padEnd(30) + "USDm".padStart(8) + "  LTV".padEnd(16) + "worst goal".padEnd(14) + "actions");
for (const p of data.portfolios) {
  const ltv = p.lombard?.jb;
  const worst = p.goals.slice().sort((a, b) => a.baseFunded - b.baseFunded)[0];
  const urgent = p.actions.filter(a => a.state === "Urgent").length;
  line("  " + p.name.slice(0, 28).padEnd(30) +
       (p.jb.totalUsd / 1e6).toFixed(1).padStart(8) + "  " +
       (ltv ? `${ltv.ltv?.toFixed(1)}/${ltv.trigger}${ltv.breachedNow ? " BREACH" : ""}` : "—").padEnd(16) +
       (worst ? `${worst.baseFunded}%` : "—").padEnd(14) +
       `${p.actions.length}${urgent ? ` (${urgent} urgent)` : ""}`);
}

line("");
line("SPOT CHECKS");
line("─".repeat(78));
for (const id of ["cl-0014", "cl-0002", "cl-0001"]) {
  const p = data.portfolios.find(x => x.id === id);
  if (!p) { line(`  ${id}: NOT FOUND`); continue; }
  line("");
  line(`  ${p.name}  (${p.jb.wealthBand}, ${p.riskProfile}, ${p.mandate})`);
  line(`    portfolios: ${p.entities.join(" | ")}`);
  line(`    liquidity : Daily ${(p.jb.liquidity.dailyUsd / 1e6).toFixed(1)}m of ${(p.jb.liquidity.total / 1e6).toFixed(1)}m (${p.jb.liquidity.dailyPct.toFixed(0)}%)`);
  if (p.lombard) line(`    lombard   : ${p.lombard.amount}, LTV ${p.lombard.jb.ltv}% vs ${p.lombard.jb.trigger}% trigger, earlier breaches: ${p.lombard.jb.breachedEarlier.join(", ") || "none"}`);
  for (const g of p.goals.slice(0, 4)) {
    line(`    goal      : ${String(g.baseFunded).padStart(3)}%  ${g.targetLabel.padEnd(12)} ${g.horizon.padEnd(10)} ${g.commitment.padEnd(12)} ${g.name.slice(0, 46)}`);
  }
  for (const a of p.actions.slice(0, 4)) line(`    action    : [${a.state}] ${a.kind} — ${a.title.slice(0, 84)}`);
}

line("");
process.exit(errs.length ? 1 : 0);
