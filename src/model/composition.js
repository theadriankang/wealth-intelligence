/**
 * Portfolio composition — the same book, rolled up four different ways.
 *
 * Every number here comes from the same place the map does: positions() and
 * instrument.exposures, through look-through. That matters more than it sounds. A
 * composition chart that agrees with the map on country weight, to the decimal, is
 * evidence that one model backs both views. Two views built off two computations
 * would eventually disagree in front of a judge.
 *
 * Weights are normalised to a share of what is on screen rather than trusted to sum
 * to 100 — on the dashboard route positions() is every portfolio in the book
 * flattened together, so the raw weights sum to 100 × the number of clients.
 */
import { countryExposure, sectorExposure } from "./lookthrough.js";

/** Anything at or below this is noise on a donut: it renders as a hairline and its
 * label collides with its neighbours'. It still exists — it goes into "Other". */
const MIN_SLICE_PCT = 1.2;
/** Eight categorical hues are available (see --cat-1..8 in styles.css); a ninth is
 * never a generated colour, it folds into Other. */
const MAX_SLICES = 8;

export const DIMENSIONS = {
  country: { key: "country", label: "Country", caption: "Look-through, not domicile — a global fund is counted in every country it actually holds." },
  holding: { key: "holding", label: "Holding", caption: "Direct position weight, before look-through." },
  asset:   { key: "asset",   label: "Asset class", caption: "The breakdown the mandate is written against." },
  sector:  { key: "sector",  label: "Sector", caption: "Look-through sector weight across funds and direct lines." }
};

const ASSET_LABEL = {
  equity: "Equity", fund: "Funds", etf: "ETFs", bond: "Fixed income",
  fixed_income: "Fixed income", cash: "Cash", structured: "Structured",
  alternative: "Alternatives", commodity: "Commodities", other: "Other"
};

const titleise = v => String(v || "").replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/** Raw {key -> {label, value}} for one dimension, before ranking or rollup. */
function tally(dimension, positions, instruments, countryNames) {
  const out = {};
  const add = (key, label, value) => {
    if (!(value > 0)) return;
    (out[key] ||= { key, label, value: 0 }).value += value;
  };

  if (dimension === "country") {
    for (const e of Object.values(countryExposure(positions, instruments))) {
      add(e.iso3, countryNames?.[e.iso3] || e.iso3, e.weightPct);
    }
    return out;
  }
  if (dimension === "sector") {
    for (const [name, w] of Object.entries(sectorExposure(positions, instruments))) {
      add(name, titleise(name), w);
    }
    return out;
  }
  for (const pos of positions) {
    const inst = instruments[pos.instrumentId];
    if (dimension === "holding") {
      add(pos.instrumentId, inst?.name || pos.instrumentId, pos.weightPct);
    } else {
      const raw = inst?.jbAssetClass || inst?.assetClass || "other";
      add(String(raw).toLowerCase(), ASSET_LABEL[String(raw).toLowerCase()] || titleise(raw), pos.weightPct);
    }
  }
  return out;
}

/**
 * @returns {{slices:{key,label,pct,count?}[], total:number, hidden:number, dimension:string}}
 *   `slices` is ranked heaviest first with an "Other" bucket last when one is needed;
 *   `pct` is a share of the visible book and sums to 100.
 */
export function composition(dimension, positions, instruments, countryNames) {
  const rows = Object.values(tally(dimension, positions, instruments, countryNames));
  const total = rows.reduce((t, r) => t + r.value, 0);
  if (!total) return { slices: [], total: 0, hidden: 0, dimension };

  const ranked = rows.map(r => ({ ...r, pct: (r.value / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  // Two independent reasons to fold into Other, applied together: too small to draw,
  // and past the eighth hue. Whichever bites first wins.
  const big = ranked.filter(r => r.pct >= MIN_SLICE_PCT).slice(0, MAX_SLICES);
  const rest = ranked.filter(r => !big.includes(r));
  const slices = big.map(({ key, label, pct }) => ({ key, label, pct }));
  if (rest.length) {
    slices.push({
      key: "__other",
      label: `${rest.length} smaller ${rest.length === 1 ? "line" : "lines"}`,
      pct: rest.reduce((t, r) => t + r.pct, 0),
      isOther: true
    });
  }
  return { slices, total, hidden: rest.length, dimension };
}

/** Herfindahl-style read on how concentrated the breakdown is — the one number a
 * private bank actually asks of a composition chart. Uses the FULL ranked list, not
 * the folded slices, so the Other bucket can't flatter it. */
export function concentrationOf(dimension, positions, instruments) {
  const rows = Object.values(tally(dimension, positions, instruments));
  const total = rows.reduce((t, r) => t + r.value, 0);
  if (!total) return { top: 0, hhi: 0, n: 0 };
  const shares = rows.map(r => r.value / total).sort((a, b) => b - a);
  return {
    top: shares[0] * 100,
    hhi: Math.round(shares.reduce((t, s) => t + s * s, 0) * 10000),
    n: shares.length
  };
}
