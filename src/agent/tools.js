/**
 * The agent's toolbox — and the boundary the fence is actually enforced at.
 *
 * The bundle already separates `authoritative` (the dataset) from `context`
 * (live retrieval). That separation is only a convention until something refuses
 * to cross it. This file is that something.
 *
 * THE MECHANISM
 * Every number leaves a tool wrapped as a Measure:
 *
 *     { value, unit, ref, world }
 *
 * `ref` says exactly which row it came from; `world` says which half of the
 * bundle. Arithmetic tools accept ONLY Measures with world:"dataset". Hand one a
 * live Measure and it throws. Hand it a bare JavaScript number — a figure the
 * model typed from memory, or read off a retrieved article — and it throws too,
 * because a raw literal has no provenance and cannot be audited.
 *
 * That is the whole idea. A prompt saying "do not use live data for calculations"
 * is a hope. A function that will not accept it is a guarantee, and the failure
 * is loud and logged rather than a plausible wrong number in a client brief.
 */

export class FenceError extends Error {
  constructor(message, detail) { super(message); this.name = "FenceError"; this.detail = detail; }
}

const measure = (value, unit, ref, world = "dataset") => ({ value, unit, ref, world });
const isMeasure = m => m && typeof m === "object" && "value" in m && "ref" in m && "world" in m;

/**
 * The gate every arithmetic tool passes its arguments through.
 * Refuses: bare numbers, live Measures, and anything malformed.
 */
export function requireAuthoritative(toolName, args) {
  for (const [name, m] of Object.entries(args)) {
    if (typeof m === "number") {
      throw new FenceError(
        `${toolName}: "${name}" was a raw number (${m}). Arithmetic accepts only Measures from the authoritative block, because a bare literal carries no provenance and cannot be audited.`,
        { tool: toolName, argument: name, received: "literal" });
    }
    if (!isMeasure(m)) {
      throw new FenceError(`${toolName}: "${name}" is not a Measure.`, { tool: toolName, argument: name });
    }
    if (m.world !== "dataset") {
      throw new FenceError(
        `${toolName}: "${name}" came from ${m.ref} which is world:"${m.world}". Live data may inform judgement; it may never enter a calculation about this client's portfolio.`,
        { tool: toolName, argument: name, ref: m.ref, world: m.world });
    }
    if (typeof m.value !== "number" || !Number.isFinite(m.value)) {
      throw new FenceError(`${toolName}: "${name}" has a non-numeric value.`, { tool: toolName, argument: name });
    }
  }
}

export function makeToolbox(bundle) {
  const A = bundle.authoritative;
  const fp = A.fingerprint;
  const el = (dim) => fp.elements.filter(e => e.dimension === dim);
  const calls = [];
  const record = (name, out) => { calls.push({ name, at: new Date().toISOString() }); return out; };

  const tools = {
    // ---------- read: authoritative ----------------------------------
    describe_client: () => record("describe_client", {
      client_id: bundle.client_id, snapshot: A.snapshot, ...A.client,
      total_usd: measure(fp.total_usd, "USD", `auth:fingerprint.total_usd`)
    }),

    list_exposures: ({ min_weight = 3 } = {}) => record("list_exposures",
      fp.elements
        .filter(e => e.weight_pct >= min_weight)
        .sort((a, b) => b.weight_pct - a.weight_pct)
        .map(e => ({
          key: e.key, dimension: e.dimension, value: e.value, direction: e.direction,
          // ref identifies the ELEMENT, not its lexicon key. Five concentration
          // elements share the key "theme:single-name concentration"; a ref that
          // cannot tell them apart is not provenance.
          weight: measure(e.weight_pct, "percent",
            `auth:fingerprint.${e.dimension}.${e.dimension === "concentration" ? e.provenance : e.value}`)
        }))),

    get_liquidity: () => {
      const l = el("liquidity")[0];
      if (!l) return record("get_liquidity", null);
      const x = l.extra || {};
      return record("get_liquidity", {
        daily: measure(x.daily_usd, "USD", "auth:liquidity.daily_usd"),
        illiquid: measure(x.illiquid_usd, "USD", "auth:liquidity.illiquid_usd"),
        total: measure(x.total_usd, "USD", "auth:liquidity.total_usd"),
      });
    },

    list_collateral: () => record("list_collateral", el("collateral").map(c => {
      const x = c.extra || {};
      const id = c.provenance;
      return {
        facility_id: id, currency: x.ccy, description: c.value,
        ltv: measure(x.trajectory?.at(-1), "percent", `auth:facility.${id}.ltv_pct`),
        trigger: measure(x.trigger, "percent", `auth:facility.${id}.margin_call_ltv_pct`),
        breached_ever: x.breached_ever, trajectory: x.trajectory,
      };
    })),

    list_liabilities: () => record("list_liabilities", el("liability").map(n => ({
      id: n.provenance, description: n.value, kind: n.extra?.kind,
      due_from: n.extra?.due_from ?? null, due_to: n.extra?.due_to ?? null,
      certainty: n.extra?.certainty ?? null,
      amount: measure(n.extra?.usd, "USD", `auth:liability.${n.provenance}.usd`),
    }))),

    get_market_series: ({ key }) => {
      const d = A.market_context[key];
      const live = bundle.context.observations.find(o => o.series?.key === key)?.series;
      return record("get_market_series", {
        key,
        dataset: d ? measure(d.latest, d.unit, `auth:market_context.${d.series_id}`) : null,
        // Deliberately returned, deliberately unusable in arithmetic. The agent
        // may say "the live 10-year is 13bp above the dataset's"; it may not
        // reprice a bond with it.
        live: live ? measure(live.latest, live.unit, `context:series.${key}`, "live") : null,
        live_as_of: live?.as_of ?? null, transform: live?.transform ?? null, note: live?.note ?? null,
      });
    },

    // ---------- read: context (live, candidates) ----------------------
    list_context: ({ key = null } = {}) => record("list_context",
      bundle.context.observations
        .filter(o => !key || o.driver.key === key)
        .map(o => ({
          id: o.id, lane: o.lane, status: o.status, driver: o.driver.key,
          title: o.doc?.title ?? o.series?.name, url: o.doc?.final_url ?? null,
          excerpt: o.doc?.excerpt?.slice(0, 400) ?? null, relevance: o.relevance,
        }))),

    // ---------- arithmetic: authoritative only ------------------------
    compute_headroom: ({ ltv, trigger }) => {
      requireAuthoritative("compute_headroom", { ltv, trigger });
      return record("compute_headroom",
        measure(Math.round((trigger.value - ltv.value) * 100) / 100, "percentage points",
          `derived(${ltv.ref}, ${trigger.ref})`));
    },

    compute_share: ({ part, whole }) => {
      requireAuthoritative("compute_share", { part, whole });
      if (!whole.value) throw new FenceError("compute_share: whole is zero");
      return record("compute_share",
        measure(Math.round((100 * part.value / whole.value) * 100) / 100, "percent",
          `derived(${part.ref}, ${whole.ref})`));
    },

    compute_funding_ratio: ({ available, required }) => {
      requireAuthoritative("compute_funding_ratio", { available, required });
      if (!required.value) throw new FenceError("compute_funding_ratio: required is zero");
      return record("compute_funding_ratio",
        measure(Math.min(100, Math.round((100 * available.value / required.value) * 100) / 100), "percent",
          `derived(${available.ref}, ${required.ref})`));
    },

    // ---------- citation ----------------------------------------------
    /**
     * Nothing retrieved is citable to a client until an RM approves it. The
     * pipeline writes every observation as "candidate" and cannot approve its
     * own output — so on a fresh bundle this throws for everything, which is the
     * correct and intended behaviour, not a bug to route around.
     */
    cite: ({ observation_id }) => {
      const o = bundle.context.observations.find(x => x.id === observation_id);
      if (!o) throw new FenceError(`cite: no observation ${observation_id}`);
      if (o.status !== "approved") {
        throw new FenceError(
          `cite: ${observation_id} is "${o.status}". Only an RM-approved observation may be cited in client-facing text.`,
          { observation_id, status: o.status });
      }
      return record("cite", { id: o.id, title: o.doc?.title, url: o.doc?.final_url, approved: true });
    },
  };

  return { tools, calls, measure, bundle };
}

/** RM action, outside the model's toolbox on purpose. Approval is a human's. */
export function approve(bundle, observationId, rm = "unknown") {
  const o = bundle.context.observations.find(x => x.id === observationId);
  if (!o) throw new FenceError(`approve: no observation ${observationId}`);
  o.status = "approved";
  o.approved_by = rm;
  o.approved_at = new Date().toISOString();
  return o;
}
