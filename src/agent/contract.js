/**
 * What the model is told, and what it is allowed to call.
 *
 * The tool schemas are the interesting half. Note that every arithmetic tool
 * takes OBJECTS, not numbers: `{ltv: Measure, trigger: Measure}`. The model
 * cannot pass 69.41 — it has to pass the thing it got back from list_collateral,
 * which carries its own provenance. The type signature does the policing, so the
 * prompt does not have to, and the model cannot talk its way past it.
 */

const MEASURE = {
  type: "object",
  description: "A value as returned by a read tool. Never construct one; pass through what you were given.",
  properties: {
    value: { type: "number" }, unit: { type: "string" },
    ref: { type: "string" }, world: { type: "string", enum: ["dataset", "live"] }
  },
  required: ["value", "ref", "world"]
};

export const TOOL_SCHEMAS = [
  { name: "describe_client", description: "Who the client is, and household wealth as a Measure.",
    input_schema: { type: "object", properties: {} } },

  { name: "list_exposures", description: "The exposure fingerprint: every material exposure with its weight as a Measure.",
    input_schema: { type: "object", properties: { min_weight: { type: "number", description: "percent, default 3" } } } },

  { name: "get_liquidity", description: "Daily-sellable, illiquid and total wealth, as Measures.",
    input_schema: { type: "object", properties: {} } },

  { name: "list_collateral", description: "Lombard facilities: current LTV, margin-call trigger, and LTV trajectory across snapshots.",
    input_schema: { type: "object", properties: {} } },

  { name: "list_liabilities", description: "Planned cash needs and uncalled commitments, with amount, due window and certainty.",
    input_schema: { type: "object", properties: {} } },

  { name: "get_market_series", description: "A market series: the dataset's value, and the live value if retrieved. The live value is labelled world:'live' and CANNOT be used in any calculation.",
    input_schema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },

  { name: "list_context", description: "Retrieved documents and series for this client. All are unapproved candidates.",
    input_schema: { type: "object", properties: { key: { type: "string", description: "filter to one exposure key" } } } },

  { name: "compute_headroom", description: "Trigger minus LTV, in percentage points. Both arguments must be Measures from list_collateral.",
    input_schema: { type: "object", properties: { ltv: MEASURE, trigger: MEASURE }, required: ["ltv", "trigger"] } },

  { name: "compute_share", description: "part / whole as a percentage. Both arguments must be authoritative Measures.",
    input_schema: { type: "object", properties: { part: MEASURE, whole: MEASURE }, required: ["part", "whole"] } },

  { name: "compute_funding_ratio", description: "available / required as a percentage, capped at 100. Both arguments must be authoritative Measures.",
    input_schema: { type: "object", properties: { available: MEASURE, required: MEASURE }, required: ["available", "required"] } },

  { name: "cite", description: "Turn a retrieved observation into a citation. Throws unless an RM has approved it.",
    input_schema: { type: "object", properties: { observation_id: { type: "string" } }, required: ["observation_id"] } },
];

export const SYSTEM_PROMPT = `You prepare a relationship manager for a client conversation at a private bank.

TWO KINDS OF INPUT, AND THEY DO NOT MIX.
- Authoritative (world:"dataset") — this client's holdings, facilities, liabilities and the bank's own market snapshot. Every number you state about the portfolio comes from here.
- Context (world:"live") — documents and market series retrieved from the open web. They explain MECHANISMS: how a currency peg works, how an AT1 perpetual behaves, how a margin call is triggered. They are unapproved candidates.

You may use context to explain WHY an exposure matters. You may never use it to compute or restate a number about the portfolio. The arithmetic tools enforce this and will refuse; do not attempt to work around a refusal, and do not perform arithmetic yourself — call the tool, so the result carries provenance.

The market snapshot in the authoritative block and any live series will disagree. That is expected and is not an error to reconcile. If it is relevant, say plainly that they differ and which is which.

WRITE FOR AN RM, NOT A CLIENT.
- No buy, sell, switch or hold instruction. You surface what deserves a conversation; the adviser decides.
- Every number you state must name the ref the tool returned.
- Uncertainty is a finding. "We have no current reading on Hang Seng exposure" is worth more than an estimate.
- If nothing material has changed, say so. Do not manufacture urgency.`;
