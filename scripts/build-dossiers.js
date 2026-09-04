/**
 * Offline build step: dataset -> docs/dossiers/CL-XXXX.md + src/data/fingerprints.json
 *
 *   npm run dossiers
 *
 * Runs in plain node, same as scripts/validate-jb.js, and reuses the adapter's
 * own csv + fx modules so there is exactly one FX implementation in the repo.
 * Nothing here runs at request time and nothing is added to the Vercel build.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseCsv } from "../src/adapters/jb/csv.js";
import { buildFx } from "../src/adapters/jb/fx.js";
import { buildFingerprint, TODAY } from "../src/intel/fingerprint.js";
import { buildAgenda } from "../src/intel/agenda.js";
import { renderDossier } from "../src/intel/dossier.js";

const DATA = process.argv[2] || "data/juliusbaer";
const csv = f => parseCsv(readFileSync(`${DATA}/${f}.csv`, "utf8"));

const src = {
  clients: csv("clients"),
  portfolios: csv("portfolios"),
  holdings: csv("holdings"),
  instruments: csv("instruments"),
  facilities: csv("credit_facilities"),
  commitments: csv("commitments"),
  cashNeeds: csv("planned_cash_needs"),
  market: csv("market_context"),
  notes: JSON.parse(readFileSync(`${DATA}/rm_notes.json`, "utf8")),
};

const fx = buildFx(src.market, TODAY);
if (fx.missing?.length) {
  console.error(`FX series missing at ${TODAY}: ${fx.missing.join(", ")}`);
  process.exit(1);
}

mkdirSync("docs/dossiers", { recursive: true });
mkdirSync("src/data", { recursive: true });

const bundle = {};
const allGaps = new Set();
let built = 0;

for (const c of src.clients) {
  const fp = buildFingerprint(src, c.client_id, fx);
  if (!fp) { console.log(`  skip ${c.client_id}: no holdings at ${TODAY}`); continue; }
  const agenda = buildAgenda(fp);
  agenda.gaps.forEach(g => allGaps.add(g));
  bundle[c.client_id] = { fingerprint: fp, agenda };
  writeFileSync(`docs/dossiers/${c.client_id}.md`, renderDossier(src, fp, agenda));
  built++;
  console.log(`  ${c.client_id}  USD ${Math.round(fp.total_usd).toLocaleString("en-US").padStart(14)}  ${String(fp.elements.length).padStart(2)} elements  ${String(agenda.items.length).padStart(2)} queries`);
}

writeFileSync("src/data/fingerprints.json", JSON.stringify(bundle, null, 1));
console.log(`\n${built} dossiers -> docs/dossiers/`);
console.log(`fingerprints -> src/data/fingerprints.json`);
if (allGaps.size) console.log(`lexicon gaps: ${[...allGaps].sort().join(", ")}`);
