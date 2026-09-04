/**
 * Pure builder for the Julius Baer adapter.
 *
 * Split out from juliusbaer.js so the same code path runs under Vite (where the
 * CSVs arrive as ?raw imports) and under plain node (where scripts/validate-jb.js
 * reads them off disk). The adapter is the thing most likely to be wrong on the
 * day, so it has to be runnable outside the browser.
 */
import { parseCsv, num } from "./csv.js";
import { buildFx } from "./fx.js";
import { REGION_EXPOSURE, NON_COUNTRY_SECTORS, chokepointsFor, resolveUnderlying, blend } from "./geo.js";
import { buildSignals } from "./signals.js";

export const SNAPSHOTS = ["2025-12-31", "2026-02-27", "2026-03-31", "2026-06-30", "2026-08-26"];
export const TODAY = SNAPSHOTS[SNAPSHOTS.length - 1];

const ASSET_CLASS = {
  "Equity": "equity", "Fixed Income": "bond", "Cash and Equivalents": "cash",
  "Alternatives": "other", "Commodities": "other", "Structured Products": "structured"
};
const MANDATE = { Discretionary: "Discretionary", Advisory: "Advisory", Custody: "Execution only" };

const fmtM = (usd, ccy, fx) => {
  const v = ccy === "USD" ? usd : usd * (fx.perUsd(ccy) ?? 1);
  return `${(v / 1e6).toFixed(1)}m`;
};

export function buildJuliusBaer(src, opts = {}) {
  const asOf = opts.asOf || TODAY;
  // The snapshot immediately before `asOf`. When `asOf` is itself the earliest snapshot there is
  // no earlier one to fall back to (SNAPSHOTS[-1] is undefined, not "wrap to the latest") — using
  // `asOf` as its own `prev` is the only sensible answer, and reads as "no change yet" rather
  // than comparing against a snapshot that's actually months in the future.
  const prev = opts.prev || SNAPSHOTS[SNAPSHOTS.indexOf(asOf) - 1] || asOf;

  const clients     = parseCsv(src.clients);
  const portfolios  = parseCsv(src.portfolios);
  const holdings    = parseCsv(src.holdings);
  const instRaw     = parseCsv(src.instruments);
  const mandates    = parseCsv(src.mandates);
  const facilities  = parseCsv(src.facilities);
  const commitments = parseCsv(src.commitments);
  const cashNeeds   = parseCsv(src.cashNeeds);
  const market      = parseCsv(src.market);
  const events      = parseCsv(src.events);
  const notes       = typeof src.notes === "string" ? JSON.parse(src.notes) : src.notes;

  const fx = buildFx(market, asOf);
  const fxPrev = buildFx(market, prev);

  /* ---------------------------------------------------------------- instruments */
  const instruments = {};
  const unresolvedLegs = [];

  for (const r of instRaw) {
    const lt = resolveUnderlying(r, instRaw);
    const base = REGION_EXPOSURE[r.region] || [];
    const isGoldOnly = NON_COUNTRY_SECTORS.has(r.sector) && !lt.resolved.length;

    let exposures;
    if (isGoldOnly) {
      // Bullion is not exposure to a country. Empty exposures would fail validation,
      // so it carries a synthetic "XAU" bucket the UI renders off-map.
      exposures = [{ iso3: "XAU", weight: 1, nonCountry: true }];
    } else if (lt.resolved.length) {
      // Structured product: exposure is the BASKET, not the wrapper's own region.
      const legs = lt.resolved.map(x => {
        const src = instRaw.find(i => i.instrument_id === x.id);
        const e = NON_COUNTRY_SECTORS.has(src?.sector)
          ? [{ iso3: "XAU", weight: 1, nonCountry: true }]
          : (REGION_EXPOSURE[src?.region] || []);
        return { exposures: e, weight: 1 };
      }).filter(l => l.exposures.length);
      // Unresolved legs fall back to the wrapper's stated region, flagged assumed.
      if (lt.unresolved.length && base.length) {
        legs.push({ exposures: base.map(e => ({ ...e, assumed: true })), weight: lt.unresolved.length });
      }
      exposures = blend(legs);
      if (lt.unresolved.length) unresolvedLegs.push({ id: r.instrument_id, legs: lt.unresolved });
    } else {
      exposures = base;
    }

    if (!exposures.length) exposures = [{ iso3: "XAU", weight: 1, nonCountry: true }];

    instruments[r.instrument_id] = {
      id: r.instrument_id,
      name: r.instrument_name,
      assetClass: ASSET_CLASS[r.asset_class] || "other",
      currency: r.currency,
      exposures,
      sectors: r.sector && r.sector !== "nan" ? [{ name: r.sector, weight: 1 }] : [],
      chokepoints: chokepointsFor(r),
      // --- JB-specific, carried through for the UI and the suitability engine ---
      jbAssetClass: r.asset_class,
      subAssetClass: r.sub_asset_class,
      region: r.region,
      liquidityTier: r.liquidity_tier,
      concentrationLimited: r.concentration_limit_applies === "Y",
      sustainabilityExcluded: r.sustainability_excluded === "Y",
      underlyingReference: r.underlying_reference || "",
      lookthrough: lt.resolved.length || lt.unresolved.length
        ? { resolved: lt.resolved, unresolved: lt.unresolved, gold: lt.gold }
        : null,
      note: buildInstrumentNote(r, lt)
    };
  }

  /* ------------------------------------------------------------------ positions */
  const atDate = holdings.filter(h => h.snapshot_date === asOf);
  const atPrev = holdings.filter(h => h.snapshot_date === prev);
  const byPortfolio = groupBy(atDate, h => h.portfolio_id);
  const byClient    = groupBy(atDate, h => h.client_id);
  const byClientPrev = groupBy(atPrev, h => h.client_id);

  const positionsFrom = (rows) => {
    const total = sum(rows, r => num(r.market_value_usd) || 0);
    const agg = {};
    for (const r of rows) {
      const v = num(r.market_value_usd) || 0;
      const a = (agg[r.instrument_id] ||= { instrumentId: r.instrument_id, marketValue: 0, weightPct: 0, unrealised: 0 });
      a.marketValue += v;
      a.unrealised += fx.toUSD(num(r.unrealised_pnl_base) || 0, r.portfolio_ccy) ?? 0;
    }
    for (const a of Object.values(agg)) a.weightPct = total ? (a.marketValue / total) * 100 : 0;
    return { positions: Object.values(agg).sort((x, y) => y.weightPct - x.weightPct), total };
  };

  /* ----------------------------------------------------------------- portfolios */
  const out = [];
  for (const c of clients) {
    const pfs = portfolios.filter(p => p.client_id === c.client_id);
    if (!pfs.length) continue;

    // Primary = largest MANAGED portfolio. Custody is part of wealth, not of the mandate.
    const managed = pfs.filter(p => p.service_model !== "Custody");
    const primary = (managed.length ? managed : pfs)
      .slice().sort((a, b) => (num(b[`aum_${asOf}`]) || 0) - (num(a[`aum_${asOf}`]) || 0))[0];

    const prim = positionsFrom(byPortfolio[primary.portfolio_id] || []);
    const hh   = positionsFrom(byClient[c.client_id] || []);
    const hhPrev = positionsFrom(byClientPrev[c.client_id] || []);
    if (!prim.positions.length) continue;

    const mandateRows = mandates.filter(m => m.mandate_code === primary.mandate_code);
    const fac = facilities.find(f => f.client_id === c.client_id);
    const goals = buildGoals(c, cashNeeds, commitments, byClient[c.client_id] || [], instruments, fx, facilities, asOf);

    out.push({
      id: c.client_id.toLowerCase(),
      name: c.client_name,
      ref: primary.portfolio_id,
      currency: c.base_currency,
      aum: fmtM(prim.total, c.base_currency, fx),
      mandate: MANDATE[primary.service_model] || "Advisory",
      riskProfile: c.risk_profile,
      riskBand: `${c.risk_tolerance_score}/10 · horizon ${c.investment_horizon_years}y`,
      reviewDate: c.kyc_review_due,
      rm: c.rm_name,
      entities: pfs.map(p => `${p.portfolio_name} (${p.service_model})`),
      householdAum: fmtM(hh.total, c.base_currency, fx),
      positions: prim.positions,
      householdPositions: hh.positions,
      goals,
      lombard: fac ? buildLombard(fac, byPortfolio, instruments, fx, asOf, prev) : undefined,
      relationship: buildRelationship(c, notes),
      actions: buildActions({ client: c, primary, prim, hh, hhPrev, mandateRows, fac, goals, instruments, asOf, prev }),

      // --- JB-specific context the UI and the LLM prompt can lean on ---
      jb: {
        clientId: c.client_id,
        age: num(c.age),
        lifeStage: c.life_stage,
        sourceOfWealth: c.source_of_wealth,
        objectives: c.objectives,
        taxDomicile: c.tax_domicile,
        residence: c.country_of_residence,
        bookingCentre: c.booking_centre,
        liquidityNeeds: c.liquidity_needs,
        wealthBand: c.wealth_band,
        portfolios: pfs.map(p => ({
          id: p.portfolio_id, name: p.portfolio_name, model: p.service_model,
          mandateCode: p.mandate_code, mandateName: p.mandate_name, currency: p.base_currency,
          aum: num(p[`aum_${asOf}`])
        })),
        mandateBands: mandateRows.map(m => ({
          assetClass: m.asset_class, min: num(m.min_pct), target: num(m.target_pct),
          max: num(m.max_pct), maxSingle: num(m.max_single_position_pct), notes: m.mandate_notes
        })),
        liquidity: liquidityProfile(byClient[c.client_id] || [], instruments),
        totalUsd: hh.total,
        prevTotalUsd: hhPrev.total,
        notes: notes.filter(n => n.client_id === c.client_id)
      }
    });
  }

  /* -------------------------------------------------------------------- signals */
  const universe = [...new Set(Object.values(instruments).flatMap(i => i.exposures.map(e => e.iso3)))]
    .filter(x => x !== "XAU");
  const { signals, prevSignals } = buildSignals(events, market, universe, asOf, prev);

  return {
    instruments,
    portfolios: out.sort((a, b) => (b.jb.totalUsd || 0) - (a.jb.totalUsd || 0)),
    signals,
    prevSignals,
    meta: {
      source: "julius-baer",
      synthetic: true,
      asOf, prev, snapshots: SNAPSHOTS,
      eventRegistry: events.length,
      fxMissing: fx.missing,
      unresolvedLegs,
      note: "All client data synthetic. Market levels and event log calibrated to 2026 history. " +
            "event_log.csv is the authoritative source for anything that happened in 2026."
    }
  };
}

/* ================================================================= helpers ==== */

function buildInstrumentNote(r, lt) {
  if (lt.resolved.length) {
    const names = lt.resolved.map(x => x.name).join(", ");
    const tail = lt.unresolved.length
      ? ` One leg could not be resolved to a held instrument (${lt.unresolved.join("; ")}) — exposure for that leg falls back to the wrapper's stated region and is shown as an assumption.`
      : "";
    return `Asset class says "${r.asset_class}". The exposure is ${names}. ` +
           `Look-through is computed from the basket, not the wrapper.${tail}`;
  }
  if (r.liquidity_tier === "Illiquid") return "Illiquid. Carries a 0% advance rate, so it supports no lombard borrowing and cannot fund a near-dated liability.";
  if (r.liquidity_tier === "Quarterly Gate") return "Quarterly dealing with a gate. Treat any assumed proceeds date as a best case, not a plan.";
  return undefined;
}

function liquidityProfile(rows, instruments) {
  const tiers = {};
  for (const r of rows) {
    const t = instruments[r.instrument_id]?.liquidityTier || "Unknown";
    tiers[t] = (tiers[t] || 0) + (num(r.market_value_usd) || 0);
  }
  const total = Object.values(tiers).reduce((a, b) => a + b, 0);
  return { tiers, total, dailyUsd: tiers.Daily || 0, dailyPct: total ? ((tiers.Daily || 0) / total) * 100 : 0 };
}

/**
 * GOALS — funding confidence is COMPUTED, and the constraints are real.
 *
 * Three things make this different from dividing assets by liabilities:
 *
 *  1. HORIZON. A liability three months out cannot be funded by a fund that
 *     deals quarterly with a gate. Only assets sellable by the due date count.
 *
 *  2. QUEUE. Earlier liabilities consume liquidity first, so a later goal
 *     inherits the shortfall an earlier one leaves behind.
 *
 *  3. PLEDGED COLLATERAL. This is the one that is invisible on a statement.
 *     Assets pledged against a lombard facility are liquid in the market and
 *     illiquid in practice: selling them cuts lending value, which raises LTV.
 *     A client 0.6pp from a margin call cannot sell his pledged blue chips to
 *     fund a property completion, however "Daily" the liquidity tier says.
 *
 *     Allowable sale before the trigger fires:
 *         lendingValue may fall to  drawn / (trigger/100)
 *         selling market value M of an asset with advance rate a
 *         reduces lending value by  M × a
 *     so   M_max = (lendingValue − drawn/(trigger/100)) / a
 *
 *  4. SCOPE. A private-markets commitment is called against the sleeve that
 *     signed it, not the household. Commitments are funded from their own
 *     portfolio.
 */
function buildGoals(client, cashNeeds, commitments, rows, instruments, fx, facilities, asOf) {
  const needs = cashNeeds.filter(n => n.client_id === client.client_id).map(n => ({
    id: n.need_id, name: n.description, ccy: n.currency, amount: num(n.amount),
    due: n.due_from, certainty: n.certainty, kind: "need", scope: null
  }));
  for (const k of commitments.filter(x => x.client_id === client.client_id)) {
    if (!num(k.uncalled)) continue;
    needs.push({
      id: k.commitment_id, name: `Uncalled commitment — ${k.fund_name}`, ccy: k.currency,
      amount: num(k.uncalled), due: firstDateOf(k.expected_call_window),
      certainty: "Confirmed", kind: "commitment", scope: k.portfolio_id
    });
  }
  needs.sort((a, b) => String(a.due).localeCompare(String(b.due)));

  // How much pledged market value can be sold before the facility breaches.
  const pledgeCap = {};
  for (const f of facilities.filter(x => x.client_id === client.client_id)) {
    const lending = num(f[`lending_value_${asOf}`]);
    const drawn = num(f[`drawn_${asOf}`]);
    const trig = num(f.margin_call_ltv_pct);
    if (!lending || !drawn || !trig) continue;
    const minLending = drawn / (trig / 100);
    const roomLending = Math.max(0, lending - minLending);
    // Advance rates in this book average ~0.6; use the portfolio's own weighted rate.
    const pr = rows.filter(r => r.portfolio_id === f.collateral_portfolio_id);
    const mv = sum(pr, r => num(r.market_value_usd) || 0);
    const lv = sum(pr, r => (num(r.market_value_usd) || 0) * ((num(r.advance_rate_pct) || 0) / 100));
    const avgAdvance = mv ? lv / mv : 0.6;
    pledgeCap[f.collateral_portfolio_id] = {
      capUsd: avgAdvance > 0 ? fx.toUSD(roomLending, f.facility_ccy) / avgAdvance : 0,
      facility: f.facility_id, avgAdvance, ltv: num(f[`ltv_pct_${asOf}`]), trigger: trig
    };
  }

  const buildPool = (subset) => {
    const pool = { Daily: [], Weekly: [], Monthly: [], "Quarterly Gate": [], Illiquid: [] };
    for (const r of subset) {
      const inst = instruments[r.instrument_id];
      const tier = inst?.liquidityTier || "Illiquid";
      const pledged = !!pledgeCap[r.portfolio_id];
      (pool[tier] ||= []).push({
        id: r.instrument_id, usd: num(r.market_value_usd) || 0,
        assetClass: inst?.assetClass, pledged, portfolio: r.portfolio_id
      });
    }
    return pool;
  };

  const householdPool = buildPool(rows);
  const drawnFrom = {};   // tier -> usd already committed to an earlier goal

  return needs.map((n, i) => {
    const amountUsd = fx.toUSD(n.amount, n.ccy);
    const months = monthsUntil(n.due);
    const tiers = months <= 6 ? ["Daily"]
                : months <= 18 ? ["Daily", "Weekly", "Monthly"]
                : ["Daily", "Weekly", "Monthly", "Quarterly Gate"];

    const pool = n.scope ? buildPool(rows.filter(r => r.portfolio_id === n.scope)) : householdPool;

    // Per-goal pledge budget: shared across goals, so track it like any other pool.
    const constraints = [];
    let need = amountUsd ?? 0;
    const used = [];

    for (const t of tiers) {
      const bucket = (pool[t] || []).slice().sort((a, b) => b.usd - a.usd);
      for (const asset of bucket) {
        if (need <= 0) break;
        const key = `${t}:${asset.id}:${asset.portfolio}`;
        const already = drawnFrom[key] || 0;
        let free = Math.max(0, asset.usd - already);

        if (asset.pledged) {
          const cap = pledgeCap[asset.portfolio];
          const capKey = `pledge:${asset.portfolio}`;
          const capUsed = drawnFrom[capKey] || 0;
          const capFree = Math.max(0, (cap?.capUsd || 0) - capUsed);
          if (capFree < free) {
            if (!constraints.some(c => c.type === "pledged")) {
              constraints.push({
                type: "pledged", facility: cap?.facility, ltv: cap?.ltv, trigger: cap?.trigger,
                sellableUsd: Math.round(cap?.capUsd || 0),
                note: `Pledged to ${cap?.facility}. LTV ${cap?.ltv}% against a ${cap?.trigger}% trigger, so only about USD ${((cap?.capUsd || 0) / 1e6).toFixed(2)}m of this collateral can be sold before a margin call.`
              });
            }
            free = capFree;
          }
          const take = Math.min(free, need);
          if (take > 0) { drawnFrom[capKey] = capUsed + take; }
        }

        const take = Math.min(free, need);
        if (take > 0) {
          drawnFrom[key] = already + take;
          need -= take;
          if (!used.includes(asset.id)) used.push(asset.id);
        }
      }
      if (need <= 0) break;
    }

    if (need > 0 && months <= 6) constraints.push({ type: "horizon", note: `Due in about ${months} months, so only Daily-dealing assets count.` });
    if (n.scope) constraints.push({ type: "scope", note: `Called against ${n.scope}, not the household.` });

    const funded = amountUsd ? Math.max(0, Math.min(100, Math.round(((amountUsd - need) / amountUsd) * 100))) : 100;
    const driverIds = used.slice(0, 5);
    const risky = driverIds.filter(id => ["equity", "structured", "other"].includes(instruments[id]?.assetClass)).length;
    const sensitivity = driverIds.length ? Number((0.25 + 0.55 * (risky / driverIds.length)).toFixed(2)) : 0.3;

    return {
      id: n.id || `g${i + 1}`,
      name: n.name,
      bucket: bucketFor(n.name),
      horizon: n.due ? formatDue(n.due) : "—",
      targetLabel: `${n.ccy} ${(n.amount / 1e6).toFixed(n.amount >= 1e6 ? 1 : 2)}m`,
      commitment: { Confirmed: "contracted", Likely: "planned", Aspirational: "aspirational" }[n.certainty]
                  || (String(n.certainty).startsWith("Conditional") ? "conditional" : "planned"),
      baseFunded: funded,
      driverIds,
      sensitivity,
      jb: {
        amountUsd, certainty: n.certainty, due: n.due, monthsAway: months,
        shortfallUsd: Math.round(need), kind: n.kind, scope: n.scope, constraints
      }
    };
  });
}

function buildLombard(f, byPortfolio, instruments, fx, asOf, prev) {
  const ltv = num(f[`ltv_pct_${asOf}`]);
  const ltvPrev = num(f[`ltv_pct_${prev}`]);
  const trigger = num(f.margin_call_ltv_pct);
  const drawn = num(f[`drawn_${asOf}`]);
  const pledged = (byPortfolio[f.collateral_portfolio_id] || [])
    .filter(h => (num(h.advance_rate_pct) || 0) > 0)
    .sort((a, b) => (num(b.market_value_usd) || 0) - (num(a.market_value_usd) || 0))
    .slice(0, 6).map(h => h.instrument_id);

  return {
    amount: `${f.facility_ccy} ${(drawn / 1e6).toFixed(1)}m`,
    headroomPct: ltv === null ? null : Math.round(100 - ltv),
    prevHeadroomPct: ltvPrev === null ? null : Math.round(100 - ltvPrev),
    pledgedIds: pledged,
    jb: {
      facilityId: f.facility_id, type: f.facility_type, ltv, ltvPrev, trigger,
      breachedNow: ltv !== null && ltv >= trigger,
      // "at least one was cured by an event rather than by an action" — README
      breachedEarlier: ["2025-12-31", "2026-02-27", "2026-03-31", "2026-06-30"]
        .filter(d => (num(f[`ltv_pct_${d}`]) ?? 0) >= trigger),
      marginToTrigger: ltv === null ? null : Number((trigger - ltv).toFixed(2)),
      headroomUsd: fx.toUSD(num(f[`headroom_${asOf}`]), f.facility_ccy),
      series: ["2025-12-31", "2026-02-27", "2026-03-31", "2026-06-30", "2026-08-26"]
        .map(d => ({ date: d, ltv: num(f[`ltv_pct_${d}`]), drawn: num(f[`drawn_${d}`]) }))
    }
  };
}

function buildRelationship(client, notes) {
  const mine = notes.filter(n => n.client_id === client.client_id)
                    .sort((a, b) => b.note_date.localeCompare(a.note_date));
  if (!mine.length) return null;
  const last = mine[0];
  return {
    last: { date: formatDue(last.note_date), channel: last.channel, topics: firstSentence(last.note) },
    concerns: mine.slice(0, 3).map(n => firstSentence(n.note)),
    behaviour: "",
    points: [],
    objections: [],
    jbNotes: mine
  };
}

/**
 * ACTIONS — generated from conditions actually present in the data.
 *
 * Nothing here is hand-written per client. Each item names the rule that fired
 * and the numbers behind it, so an RM can see why it appeared and reject it.
 */
function buildActions({ client, primary, prim, hh, mandateRows, fac, goals, instruments, asOf }) {
  const actions = [];
  const isCustody = primary.service_model === "Custody";

  // 1. Collateral: LTV at or near the margin-call trigger.
  if (fac) {
    const ltv = num(fac[`ltv_pct_${asOf}`]);
    const trig = num(fac.margin_call_ltv_pct);
    if (ltv !== null && trig !== null && ltv >= trig - 5) {
      const breached = ltv >= trig;
      actions.push({
        id: "a-ltv", kind: "Collateral",
        title: breached
          ? `Facility ${fac.facility_id} is through its margin-call trigger`
          : `Restore headroom on ${fac.facility_id} — ${(trig - ltv).toFixed(2)}pp to trigger`,
        target: `${fac.facility_type} · ${fac.collateral_portfolio_id}`,
        state: breached ? "Urgent" : "Drafted",
        why: `Loan-to-value is ${ltv.toFixed(2)}% against a ${trig}% trigger. LTV is measured on lending value after per-asset advance-rate haircuts, not on market value, so a fall in the pledged assets moves it faster than the portfolio total suggests.`,
        effect: [
          `LTV <b>${ltv.toFixed(2)}%</b> vs trigger <b>${trig}%</b>`,
          breached ? "A margin call is live — action is not optional" : `Buffer <b>${(trig - ltv).toFixed(2)}pp</b>`,
          "Substitution or partial repayment avoids a forced sale"
        ],
        suitability: {
          objective: "Protects against a forced disposal that would damage every objective at once",
          riskFit: "Risk-reducing; no change to market exposure if met by substitution",
          knowledge: "Existing facility, terms unchanged",
          concentration: "Unchanged",
          costs: "None if met by substitution; interest cost continues on the drawn balance"
        },
        evidence: { rule: "credit_facilities.ltv_pct >= margin_call_ltv_pct − 5", ltv, trigger: trig }
      });
    }
  }

  // 2. Concentration: a single position over the mandate's single-position limit.
  const maxSingle = mandateRows.map(m => num(m.max_single_position_pct)).filter(Boolean)[0];
  if (maxSingle && !isCustody) {
    for (const p of prim.positions) {
      const inst = instruments[p.instrumentId];
      if (!inst?.concentrationLimited) continue;      // limit applies to single names, not diversified funds
      if (p.weightPct <= maxSingle) continue;
      actions.push({
        id: `a-conc-${p.instrumentId}`, kind: "Trim",
        title: `Reduce ${inst.name} from ${p.weightPct.toFixed(1)}% to ${maxSingle}%`,
        target: `${p.instrumentId} · ${inst.name}`,
        state: "Drafted",
        why: `The ${primary.mandate_name} mandate caps any single concentration-limited position at ${maxSingle}%. This one sits at ${p.weightPct.toFixed(1)}% of ${primary.portfolio_name}.`,
        effect: [
          `Single position <b>${p.weightPct.toFixed(1)}% → ${maxSingle}%</b>`,
          `Releases <b>USD ${((p.marketValue * (p.weightPct - maxSingle)) / p.weightPct / 1e6).toFixed(2)}m</b> of liquidity`,
          p.unrealised > 0 ? `Realises a gain of about <b>USD ${(p.unrealised / 1e6).toFixed(2)}m</b> — check tax domicile (${client.tax_domicile})` : "Position is at or below cost"
        ],
        suitability: {
          objective: client.objectives,
          riskFit: `Reduces concentration toward the ${client.risk_profile} profile`,
          knowledge: "Disposal of an existing holding — within demonstrated experience",
          concentration: `Resolves the ${p.weightPct.toFixed(1)}% vs ${maxSingle}% breach`,
          costs: "Execution cost and any tax consequence to be disclosed before instruction"
        },
        evidence: { rule: "position weight > mandate.max_single_position_pct", weight: p.weightPct, limit: maxSingle }
      });
    }
  }

  // 3. Look-through: a note that doubles a bet the client already holds directly.
  for (const p of prim.positions) {
    const inst = instruments[p.instrumentId];
    for (const leg of inst?.lookthrough?.resolved || []) {
      const direct = prim.positions.find(x => x.instrumentId === leg.id);
      if (!direct) continue;
      actions.push({
        id: `a-lt-${p.instrumentId}-${leg.id}`, kind: "Hedge",
        title: `Combined exposure to ${leg.name} is ${(direct.weightPct + p.weightPct).toFixed(1)}%, not ${direct.weightPct.toFixed(1)}%`,
        target: `${leg.id} · via ${p.instrumentId}`,
        state: "Drafted",
        why: `${inst.name} references ${leg.name}, which is already held directly at ${direct.weightPct.toFixed(1)}%. The statement shows these as separate lines in different asset classes. They are the same bet, and the note's payoff is worst-of, so it fails precisely when the direct holding does.`,
        effect: [
          `Direct <b>${direct.weightPct.toFixed(1)}%</b> + via note <b>${p.weightPct.toFixed(1)}%</b>`,
          `True exposure <b>${(direct.weightPct + p.weightPct).toFixed(1)}%</b>`,
          "Not visible on an asset-class report"
        ],
        suitability: {
          objective: client.objectives,
          riskFit: "Surfacing the exposure is the deliverable; the action is the client's call",
          knowledge: "Structured product already held — knowledge demonstrated at subscription",
          concentration: "Understated by the asset-class view",
          costs: "None to disclose; unwinding the note early would crystallise a mark-to-market loss"
        },
        evidence: { rule: "instrument.underlying_reference resolves to a directly-held position", via: p.instrumentId, leg: leg.id }
      });
    }
  }

  // 4. Liquidity: a near-dated liability the sellable assets do not cover.
  for (const g of goals) {
    if (g.baseFunded >= 100 || (g.jb?.monthsAway ?? 99) > 18) continue;
    actions.push({
      id: `a-liq-${g.id}`, kind: "Hold",
      title: `${g.name} is ${g.baseFunded}% funded from assets sellable by ${g.horizon}`,
      target: g.name,
      state: g.jb.certainty === "Confirmed" ? "Urgent" : "Drafted",
      why: `The liability is ${g.targetLabel} (${g.jb.certainty.toLowerCase()}) and falls due in about ${g.jb.monthsAway} months. Only assets that can actually be sold by then are counted, and earlier liabilities are funded first — so this figure is what is left, not what exists.`,
      effect: [
        `Shortfall <b>USD ${(g.jb.shortfallUsd / 1e6).toFixed(2)}m</b>`,
        `Certainty <b>${g.jb.certainty}</b>`,
        "Funding options: raise liquidity now, draw the facility, or move the date"
      ],
      suitability: {
        objective: client.objectives,
        riskFit: `Liquidity need stated as ${client.liquidity_needs}`,
        knowledge: "No new instrument involved",
        concentration: "Unchanged",
        costs: "Cost depends on the option chosen; selling into a drawdown is the expensive one"
      },
      evidence: { rule: "goal.baseFunded < 100 within 18 months", funded: g.baseFunded, shortfallUsd: g.jb.shortfallUsd }
    });
  }

  return actions;
}

/* ------------------------------------------------------------------- tiny utils */
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
function groupBy(arr, f) {
  const o = {};
  for (const x of arr) (o[f(x)] ||= []).push(x);
  return o;
}
function monthsUntil(due) {
  if (!due) return 99;
  return Math.max(0, Math.round((Date.parse(due) - Date.parse(TODAY)) / 86400000 / 30.4));
}
function firstDateOf(window) {
  const m = String(window).match(/(\d{4})\s*Q([1-4])/);
  if (!m) return null;
  return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
}
function formatDue(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function firstSentence(s) {
  const m = String(s).match(/^.{0,180}?[.!?](\s|$)/);
  return (m ? m[0] : String(s).slice(0, 180)).trim();
}
function bucketFor(name) {
  const s = String(name).toLowerCase();
  if (/tax|trust|succession|estate|inherit|notarial/.test(s)) return "legacy";
  if (/foundation|philanthrop|charit|endowment|education|university|school/.test(s)) return "legacy";
  if (/retirement|drawdown|living|medical|care|parents/.test(s)) return "longevity";
  return "liquidity";
}
