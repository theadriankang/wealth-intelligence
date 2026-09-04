/**
 * Renders the per-client exposure dossier: docs/dossiers/CL-XXXX.md
 *
 * Built from the dataset alone, no network and no model. Reproducible and
 * diffable — that is the traceability story. The retrieved-research file is
 * separate and disposable; nothing here depends on it.
 */
import { num } from "../adapters/jb/csv.js";
import { SNAPSHOTS, TODAY } from "./fingerprint.js";

const TEMPORAL = /\b(mid-|early |late )?(20\d\d|Q[1-4] 20\d\d|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
const money = n => Math.round(n).toLocaleString("en-US");

export function renderDossier(src, fp, agenda) {
  const cid = fp.client_id;
  const c = src.clients.find(x => x.client_id === cid);
  const pfs = src.portfolios.filter(x => x.client_id === cid);
  const notes = src.notes.filter(n => n.client_id === cid).sort((a, b) => a.note_date.localeCompare(b.note_date));
  const by = d => fp.elements.filter(e => e.dimension === d);
  const L = [];
  const w = s => L.push(s);

  w(`# ${cid} · ${c.client_name}`);
  w("");
  w(`> Generated from the Julius Baer dataset at snapshot **${TODAY}**. No network, no model.`);
  w(`> Rebuild with \`npm run dossiers\`. Do not edit by hand — changes will be overwritten.`);
  w("");
  w(`- **Household wealth:** USD ${money(fp.total_usd)} across ${pfs.length} portfolio(s): ${pfs.map(p => `${p.portfolio_id} (${p.service_model})`).join(", ")}`);
  w(`- **Profile:** ${num(c.age)}, ${c.life_stage}, risk ${c.risk_profile} (score ${c.risk_tolerance_score}), horizon ${c.investment_horizon_years}y, liquidity needs ${c.liquidity_needs}`);
  w(`- **Source of wealth:** ${c.source_of_wealth}`);
  w(`- **Residence / tax domicile:** ${c.country_of_residence} / **${c.tax_domicile}**${c.country_of_residence !== c.tax_domicile ? "  ← differs, tax logic must use domicile" : ""}`);
  w(`- **Booking centre:** ${c.booking_centre} · base ${c.base_currency} · KYC review due ${c.kyc_review_due}`);
  w(`- **Objectives:** ${c.objectives}`);
  w("");

  w("## Exposure fingerprint");
  w("");
  w("| dim | value | weight | direction | provenance |");
  w("|---|---|---:|---|---|");
  for (const e of fp.elements) {
    if (["liability", "collateral", "liquidity"].includes(e.dimension)) continue;
    w(`| ${e.dimension} | ${e.value} | ${e.weight_pct.toFixed(1)}% | ${e.direction} | ${e.provenance} |`);
  }
  w("");

  const liq = by("liquidity")[0];
  if (liq) {
    w("## Liquidity");
    w("");
    w(`- Daily-sellable **USD ${money(liq.extra.daily_usd)}** of USD ${money(liq.extra.total_usd)}; illiquid USD ${money(liq.extra.illiquid_usd)} (${liq.weight_pct.toFixed(0)}%, ${liq.direction})`);
    w("");
  }

  const col = by("collateral");
  if (col.length) {
    w("## Collateral");
    w("");
    for (const e of col) {
      const x = e.extra;
      const flag = x.breached_ever ? "**BREACHED at least once**" : `${x.gap_pp.toFixed(2)}pp of headroom`;
      w(`- **${e.value}** — ${flag}`);
      w(`  - LTV across ${SNAPSHOTS.length} snapshots: ${x.trajectory.map(t => t.toFixed(2)).join(" → ")}  (${e.direction})`);
      w(`  - Drawn ${x.ccy} ${money(x.drawn)}`);
    }
    w("");
  }

  const lia = by("liability").sort((a, b) => b.weight_pct - a.weight_pct);
  if (lia.length) {
    w("## Liabilities and funding");
    w("");
    w("| need | USD | due | certainty | % of wealth |");
    w("|---|---:|---|---|---:|");
    for (const e of lia) {
      const due = e.extra.window || `${e.extra.due_from} → ${e.extra.due_to}`;
      w(`| ${e.value} | ${money(e.extra.usd)} | ${due} | ${e.extra.certainty} | ${e.weight_pct.toFixed(1)}% |`);
    }
    w("");
  }

  if (notes.length) {
    w("## RM notes");
    w("");
    for (const n of notes) w(`- **${n.note_date}** (${n.channel}) — ${n.note}`);
    w("");
    const temporal = notes.flatMap(n => (n.note.match(TEMPORAL) || []).map(t => [n.note_date, t]));
    if (temporal.length && lia.length) {
      w("### ⚠ Note / field tensions — UNRESOLVED, do not silently pick one");
      w("");
      w("Dates spoken in the notes, against dates in the structured fields. Where they disagree the system asks the RM rather than guessing.");
      w("");
      w(`- Structured due dates: ${lia.map(e => e.extra.due_from || e.extra.window).join("; ")}`);
      w(`- Dates mentioned in notes: ${temporal.slice(0, 8).map(([d, t]) => `${d}→“${t}”`).join("; ")}`);
      w("");
    }
  }

  w("## Research agenda");
  w("");
  w("Generated from the fingerprint above via the versioned lexicon (`src/intel/lexicon.js`). Every query traces to a weighted exposure. Instrument names are synthetic and never appear as query terms.");
  w("");
  w("| # | tier | query | driver | weight | sources |");
  w("|---:|---|---|---|---:|---|");
  agenda.items.forEach((it, i) => {
    w(`| ${i + 1} | ${it.tier} | ${it.query} | ${it.driver} | ${it.driver_weight.toFixed(1)}% | ${it.sources.join(", ") || "—"} |`);
  });
  w("");
  if (agenda.gaps.length) {
    w(`**Lexicon gaps** (material exposure, no mapping row yet — add to \`src/intel/lexicon.js\`): ${agenda.gaps.map(g => `\`${g}\``).join(", ")}`);
    w("");
  }
  w("---");
  w("");
  w(`*Retrieved research belongs in \`docs/research/${cid}-brief.md\` and is regenerated independently. Nothing retrieved is citable until an RM approves it into the event registry.*`);
  return L.join("\n") + "\n";
}
