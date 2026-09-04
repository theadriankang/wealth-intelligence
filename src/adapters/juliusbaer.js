import clientsCsv from "./raw/juliusbaer/clients.csv?raw";
import portfoliosCsv from "./raw/juliusbaer/portfolios.csv?raw";
import holdingsCsv from "./raw/juliusbaer/holdings.csv?raw";
import instrumentsCsv from "./raw/juliusbaer/instruments.csv?raw";
import facilitiesCsv from "./raw/juliusbaer/credit_facilities.csv?raw";
import needsCsv from "./raw/juliusbaer/planned_cash_needs.csv?raw";
import commitmentsCsv from "./raw/juliusbaer/commitments.csv?raw";
import eventsCsv from "./raw/juliusbaer/event_log.csv?raw";
import notesRaw from "./raw/juliusbaer/rm_notes.json?raw";

const TODAY = "2026-08-26";
const PREV = "2026-06-30";

export async function juliusBaerAdapter() {
  const clients = parseCsv(clientsCsv);
  const portfolios = parseCsv(portfoliosCsv);
  const holdings = parseCsv(holdingsCsv);
  const instrumentsRaw = parseCsv(instrumentsCsv);
  const facilities = parseCsv(facilitiesCsv);
  const needs = parseCsv(needsCsv);
  const commitments = parseCsv(commitmentsCsv);
  const events = parseCsv(eventsCsv);
  const notes = JSON.parse(notesRaw);

  const clientById = Object.fromEntries(clients.map(c => [c.client_id, c]));
  const portfoliosByClient = groupBy(portfolios, "client_id");
  const currentHoldings = holdings.filter(h => h.snapshot_date === TODAY);
  const previousHoldings = holdings.filter(h => h.snapshot_date === PREV);
  const instrumentRows = new Map(instrumentsRaw.map(i => [i.instrument_id, i]));
  const instruments = buildInstruments(instrumentsRaw);
  const signals = buildSignals(events);
  const prevSignals = Object.fromEntries(Object.entries(signals).map(([iso, s]) => [
    iso, { ...s, riskDelta: Math.max(-40, s.riskDelta - 6), instability: Math.max(0, s.instability - 8) }
  ]));

  const appPortfolios = clients.map(client => {
    const pfs = portfoliosByClient[client.client_id] || [];
    const ch = currentHoldings.filter(h => h.client_id === client.client_id);
    const ph = previousHoldings.filter(h => h.client_id === client.client_id);
    const aumUsd = num(client.total_aum_usd);
    const positions = ch.map(h => ({
      instrumentId: h.instrument_id,
      weightPct: safePct(num(h.market_value_usd), aumUsd, num(h.weight_pct)),
      marketValue: num(h.market_value_base),
      pledged: num(h.lending_value_base) > 0,
      liquidityTier: h.liquidity_tier
    }));
    const facility = facilities.find(f => f.client_id === client.client_id);
    const clientNeeds = needs.filter(n => n.client_id === client.client_id);
    const clientCommitments = commitments.filter(c => c.client_id === client.client_id);
    const clientNotes = notes.filter(n => n.client_id === client.client_id)
      .sort((a, b) => b.note_date.localeCompare(a.note_date));

    return {
      id: client.client_id,
      name: client.client_name,
      ref: client.client_id,
      currency: client.base_currency,
      aum: compactMoney(aumUsd, "USD"),
      aumUsd,
      mandate: mapMandate(pfs[0]?.service_model),
      riskProfile: client.risk_profile,
      riskBand: `${client.risk_tolerance_score}/10 tolerance`,
      riskTolerance: Number(client.risk_tolerance_score),
      wealthBand: client.wealth_band,
      reviewDate: shortDate(client.kyc_review_due),
      rm: client.rm_name,
      bookingCentre: client.booking_centre,
      countryOfResidence: client.country_of_residence,
      sourceOfWealth: client.source_of_wealth,
      positions,
      previousPositions: ph.map(h => ({ instrumentId:h.instrument_id, weightPct:safePct(num(h.market_value_usd), aumUsd, num(h.weight_pct)) })),
      goals: goalsFromClient(client, clientNeeds, clientCommitments, positions),
      actions: [],
      entities: pfs.map(p => p.portfolio_name),
      householdAum: compactMoney(aumUsd, "USD"),
      lombard: facility ? {
        amount: compactMoney(num(facility[`drawn_${TODAY}`]), facility.facility_ccy),
        headroomPct: Math.max(0, Math.round(num(facility.margin_call_ltv_pct) - num(facility[`ltv_pct_${TODAY}`]))),
        prevHeadroomPct: Math.max(0, Math.round(num(facility.margin_call_ltv_pct) - num(facility[`ltv_pct_${PREV}`]))),
        currentLtv: num(facility[`ltv_pct_${TODAY}`]),
        marginCallLtv: num(facility.margin_call_ltv_pct),
        pledgedIds: positions.filter(p => p.pledged).map(p => p.instrumentId)
      } : null,
      relationship: relationshipFromNotes(client, clientNotes),
      meta: {
        source: "SingHacks Julius Baer synthetic dataset",
        portfolios: pfs.length,
        dailyLiquidityPct: liquidityPct(ch, "Daily", aumUsd),
        privateCommitments: clientCommitments.reduce((s, c) => s + num(c.uncalled), 0),
        nearCashNeeds: clientNeeds.reduce((s, n) => s + num(n.amount), 0),
        sectors: topValues(ch, "sector", 2),
        eventCount: relatedEvents(ch, instrumentRows, events).length
      }
    };
  });

  return {
    instruments,
    portfolios: appPortfolios,
    signals,
    prevSignals,
    meta: { source: "julius-baer", synthetic: true, asOf: TODAY, clients: clients.length, portfolios: portfolios.length }
  };
}

function buildInstruments(rows) {
  return Object.fromEntries(rows.map(r => [r.instrument_id, {
    id: r.instrument_id,
    name: r.instrument_name,
    assetClass: mapAssetClass(r.asset_class, r.sub_asset_class),
    currency: r.currency || "USD",
    exposures: regionExposures(r.region, r.underlying_reference),
    sectors: r.sector ? [{ name: r.sector, weight: 1 }] : [],
    chokepoints: chokepointsFor(r.region, r.underlying_reference),
    note: [r.sub_asset_class, r.underlying_reference].filter(Boolean).join(" · ")
  }]));
}

function buildSignals(events) {
  const out = {};
  for (const e of events) {
    for (const iso of eventIsos(e)) {
      const s = out[iso] ||= { iso3:iso, name: countryName(iso), riskDelta:0, instability:25, tone:0, policyStance:0, chokepoints:[], events:[] };
      const sev = severityScore(e.severity);
      s.riskDelta = Math.min(40, s.riskDelta + sev / 4);
      s.instability = Math.min(100, s.instability + sev / 2);
      s.policyStance += e.event_type === "Policy" ? 1 : 0;
      s.tone -= sev >= 80 ? 1.2 : sev >= 55 ? 0.6 : 0.2;
      s.events.push({
        id: `${e.event_date}-${e.event_type}-${iso}`,
        at: e.event_date,
        source: "event_log.csv",
        text: e.description,
        value: `${e.event_type} · ${e.primary_transmission}`,
        iso3: iso,
        region: e.region,
        eventType: e.event_type,
        severity: e.severity,
        transmission: e.primary_transmission,
        endpoint: "src/adapters/raw/juliusbaer/event_log.csv"
      });
    }
  }
  return out;
}

function goalsFromClient(client, needs, commitments, positions) {
  const goals = [];
  const chunks = String(client.objectives || "").split(";").map(s => s.trim()).filter(Boolean).slice(0, 3);
  chunks.forEach((name, i) => goals.push({
    id: `g${i + 1}`,
    name,
    bucket: /property|liquid|cash|bridge/i.test(name) ? "liquidity" : /trust|family|succession|inherit/i.test(name) ? "legacy" : "longevity",
    horizon: i === 0 ? "next 24m" : "strategic",
    targetLabel: needs[i] ? compactMoney(num(needs[i].amount), needs[i].currency) : client.wealth_band,
    baseFunded: Math.max(72, 98 - i * 6),
    driverIds: positions.slice(i * 3, i * 3 + 4).map(p => p.instrumentId),
    sensitivity: 0.45 + i * 0.1
  }));
  if (commitments.length) goals.push({
    id: "g-commitments",
    name: "Fund private-market commitments",
    bucket: "liquidity",
    horizon: commitments[0].expected_call_window,
    targetLabel: compactMoney(commitments.reduce((s, c) => s + num(c.uncalled), 0), commitments[0].currency),
    baseFunded: 84,
    driverIds: positions.filter(p => p.liquidityTier === "Daily").slice(0, 5).map(p => p.instrumentId),
    sensitivity: 0.75
  });
  return goals.length ? goals : [{ id:"g1", name:"Maintain mandate objectives", bucket:"solvency", horizon:"continuous", targetLabel:client.wealth_band, baseFunded:92, driverIds:positions.slice(0,4).map(p=>p.instrumentId) }];
}

function relationshipFromNotes(client, notes) {
  const last = notes[0];
  return {
    last: last ? { date:shortDate(last.note_date), channel:last.channel, topics:last.note.slice(0, 90) } : { date:"-", channel:"-", topics:"No RM note" },
    concerns: [client.liquidity_needs + " liquidity needs", client.life_stage, client.source_of_wealth].filter(Boolean),
    behaviour: last?.note || "Synthetic dataset client record.",
    points: notes.slice(0, 3).map(n => n.note),
    objections: []
  };
}

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = splitCsvLine(head);
  return lines.filter(Boolean).map(line => Object.fromEntries(splitCsvLine(line).map((v, i) => [cols[i], v])));
}

function splitCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function groupBy(rows, key) {
  return rows.reduce((m, r) => ((m[r[key]] ||= []).push(r), m), {});
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safePct(value, total, fallback) {
  return total ? (value / total) * 100 : fallback || 0;
}

function compactMoney(v, ccy = "USD") {
  const abs = Math.abs(v);
  const scaled = abs >= 1e9 ? [v / 1e9, "bn"] : abs >= 1e6 ? [v / 1e6, "m"] : abs >= 1e3 ? [v / 1e3, "k"] : [v, ""];
  return `${ccy} ${scaled[0].toFixed(scaled[0] >= 10 ? 1 : 2)}${scaled[1]}`;
}

function shortDate(v) {
  if (!v) return "";
  const d = new Date(v + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", timeZone:"UTC" });
}

function mapMandate(service = "") {
  const s = service.toLowerCase();
  if (s.includes("discretionary")) return "Discretionary";
  if (s.includes("custody")) return "Execution only";
  return "Advisory";
}

function mapAssetClass(a = "", sub = "") {
  const s = `${a} ${sub}`.toLowerCase();
  if (s.includes("structured")) return "structured";
  if (s.includes("fund")) return "fund";
  if (s.includes("fixed") || s.includes("bond")) return "bond";
  if (s.includes("cash")) return "cash";
  if (s.includes("equity")) return "equity";
  return "other";
}

function regionExposures(region = "", ref = "") {
  const r = `${region} ${ref}`.toLowerCase();
  if (r.includes("north america") || r.includes("us ")) return [{ iso3:"USA", weight:1 }];
  if (r.includes("europe")) return [{ iso3:"DEU", weight:.35 }, { iso3:"CHE", weight:.25 }, { iso3:"GBR", weight:.2 }, { iso3:"NLD", weight:.2 }];
  if (r.includes("asia ex-japan")) return [{ iso3:"CHN", weight:.35 }, { iso3:"TWN", weight:.25 }, { iso3:"KOR", weight:.2 }, { iso3:"SGP", weight:.2 }];
  if (r.includes("japan")) return [{ iso3:"JPN", weight:1 }];
  if (r.includes("middle east") || r.includes("energy")) return [{ iso3:"SAU", weight:.7 }, { iso3:"IND", weight:.3 }];
  if (r.includes("china") || r.includes("hong kong")) return [{ iso3:"CHN", weight:.8 }, { iso3:"SGP", weight:.2 }];
  if (r.includes("global")) return [{ iso3:"USA", weight:.38 }, { iso3:"DEU", weight:.18 }, { iso3:"CHN", weight:.16 }, { iso3:"JPN", weight:.12 }, { iso3:"CHE", weight:.08 }, { iso3:"SGP", weight:.08 }];
  return [{ iso3:"USA", weight:1 }];
}

function chokepointsFor(region = "", ref = "") {
  const s = `${region} ${ref}`.toLowerCase();
  const out = [];
  if (/asia|china|hong kong|shipping/.test(s)) out.push("Malacca Strait");
  if (/middle east|energy|oil|gulf/.test(s)) out.push("Hormuz");
  if (/europe|shipping/.test(s)) out.push("Suez");
  return out;
}

function eventIsos(e) {
  const s = `${e.region} ${e.primary_transmission} ${e.description}`.toLowerCase();
  if (s.includes("middle east") || s.includes("hormuz") || s.includes("oil")) return ["SAU", "IND"];
  if (s.includes("asia") || s.includes("china") || s.includes("hong kong") || s.includes("technology")) return ["CHN", "TWN", "KOR", "SGP"];
  if (s.includes("europe")) return ["DEU", "CHE", "GBR", "NLD"];
  if (s.includes("global")) return ["USA", "CHN", "DEU", "JPN"];
  return ["USA"];
}

function severityScore(s = "") {
  return s === "Severe" ? 90 : s === "High" ? 70 : s === "Medium" ? 45 : 25;
}

function countryName(iso) {
  return ({ USA:"United States", CHN:"China", TWN:"Taiwan", KOR:"Korea", SGP:"Singapore", SAU:"Saudi Arabia", IND:"India", DEU:"Germany", CHE:"Switzerland", GBR:"United Kingdom", NLD:"Netherlands", JPN:"Japan" })[iso] || iso;
}

function liquidityPct(holdings, tier, totalUsd) {
  return safePct(holdings.filter(h => h.liquidity_tier === tier).reduce((s, h) => s + num(h.market_value_usd), 0), totalUsd, 0);
}

function topValues(rows, key, n) {
  const counts = {};
  for (const r of rows) counts[r[key]] = (counts[r[key]] || 0) + num(r.market_value_usd);
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k).filter(Boolean);
}

function relatedEvents(holdings, instrumentRows, events) {
  const hay = holdings.map(h => `${h.region} ${h.sector} ${instrumentRows.get(h.instrument_id)?.underlying_reference || ""}`).join(" ").toLowerCase();
  return events.filter(e => hay.includes(e.region.toLowerCase().split(" ")[0]) || hay.includes(e.primary_transmission.toLowerCase().split(",")[0]));
}
