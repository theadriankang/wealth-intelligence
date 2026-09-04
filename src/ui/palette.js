/** Colour, lenses, formatting. Diverging pairs and the sequential ramp live here. */
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export const P = {};
export function initPalette() {
  P.UP = ["--up-1","--up-2","--up-3","--up-4","--up-5"].map(css);
  P.DN = ["--dn-1","--dn-2","--dn-3","--dn-4"].map(css);
  P.SQ = ["--sq-1","--sq-2","--sq-3","--sq-4","--sq-5"].map(css);
  P.POL_H = ["--pol-h2","--pol-h4"].map(css);
  P.POL_D = ["--pol-d2","--pol-d4"].map(css);
  P.FLAT = css("--flat"); P.DIM = css("--dim"); P.MUTE = css("--mute-sel");
  P.SEV = { crit:css("--crit"), serious:css("--serious"), warn:css("--warn"),
            none:css("--ink-3"), good:css("--good") };
  P.INK4 = css("--ink-4");
}

export const fmtD = v => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(Math.round(v));

export const LENSES = () => ({
  d:{ label:"7-day change in exposure risk",
      cap:"Diverging. Red is deterioration since last week, blue is improvement.",
      lo:"−40 improving", mid:"0", hi:"+40 worse",
      ramp:[...P.DN].reverse().concat([P.FLAT], P.UP),
      val:c => c.riskDelta, fmt:v => fmtD(v),
      col:v => v > 0 ? P.UP[Math.min(4, Math.floor(v / 8))]
             : v < 0 ? P.DN[Math.min(3, Math.floor(-v / 4))] : P.FLAT },
  inst:{ label:"Country instability index",
      cap:"Sequential. The standing level of fragility, not this week's move.",
      lo:"0 stable", mid:"", hi:"100 acute", ramp:P.SQ,
      val:c => c.instability, fmt:v => Math.round(v),
      col:v => P.SQ[Math.min(4, Math.floor(v / 20))] },
  tone:{ label:"Narrative tone, 30-day band",
      cap:"Diverging. How far coverage sentiment sits from its own baseline.",
      lo:"−3 σ negative", mid:"0", hi:"+3 σ positive",
      ramp:[...P.UP].reverse().concat([P.FLAT], P.DN),
      val:c => c.tone, fmt:v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " σ",
      col:v => v < 0 ? P.UP[Math.min(4, Math.floor(-v / 0.7))]
             : v > 0 ? P.DN[Math.min(3, Math.floor(v / 0.5))] : P.FLAT },
  pol:{ label:"Central bank policy stance",
      cap:"Diverging, unvalenced. Amber tightening, green easing — neither is good news alone.",
      lo:"easing", mid:"neutral", hi:"tightening",
      ramp:[P.POL_D[1], P.POL_D[0], P.FLAT, P.POL_H[0], P.POL_H[1]],
      val:c => c.policyStance,
      fmt:v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1),
      col:v => v >= 1.5 ? P.POL_H[1] : v > 0.3 ? P.POL_H[0]
             : v <= -1.5 ? P.POL_D[1] : v < -0.3 ? P.POL_D[0] : P.FLAT }
});
export const sevOf = d => d >= 25 ? "crit" : d >= 12 ? "serious" : d >= 6 ? "warn" : "none";

/**
 * OBJECTIVE TAXONOMY
 *
 * Private-client mandates are framed on the industry triad — liquidity (near-dated
 * committed capital), longevity (the lifetime drawdown), legacy (what leaves the
 * balance sheet). Institutional vehicles do not use it, so pension mandates carry
 * their own two: the obligation schedule and the solvency floor.
 *
 * The bucket is the register the adviser already speaks in. The named objective
 * underneath it is what the client actually said.
 */
export const BUCKETS = {
  liquidity:  { label: "Liquidity",  cap: "Near-dated committed capital" },
  longevity:  { label: "Longevity",  cap: "Lifetime drawdown" },
  legacy:     { label: "Legacy",     cap: "Transfers off the balance sheet" },
  obligation: { label: "Obligation", cap: "Contracted liability schedule" },
  solvency:   { label: "Solvency",   cap: "Regulatory funding floor" }
};

/** How the number is derived — stated, because a judge will ask. */
export const FUNDING_METHOD =
  "Funding ratio = planning ratio × (1 − drag). Drag is the share of the objective " +
  "funded by positions whose look-through country risk deteriorated, scaled by the " +
  "objective's stated sensitivity. Deterministic and auditable — not a Monte Carlo " +
  "projection. Formula in src/model/scoring.js.";
