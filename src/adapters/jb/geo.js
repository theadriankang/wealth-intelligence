/**
 * Look-through: turning JB's `region` + `underlying_reference` into country exposure.
 *
 * The dataset gives a single `region` string per instrument ("Global", "Asia",
 * "Hong Kong"). Our model needs weighted ISO-3 exposures. Every blend below is a
 * MODELLING CHOICE, not a fact in their data, so each carries `assumed:true` and
 * the UI is expected to say so. A domicile-shaped guess presented as fact is the
 * exact failure mode the challenge brief warns about.
 *
 * Single-country regions ("Singapore", "Japan") are not assumptions and are not
 * flagged.
 */

const B = (...pairs) => pairs.map(([iso3, weight]) => ({ iso3, weight, assumed: true }));

export const REGION_EXPOSURE = {
  "Singapore":      [{ iso3: "SGP", weight: 1 }],
  "Hong Kong":      [{ iso3: "HKG", weight: 1 }],
  "Japan":          [{ iso3: "JPN", weight: 1 }],
  "Indonesia":      [{ iso3: "IDN", weight: 1 }],
  "South Asia":     [{ iso3: "IND", weight: 1 }],

  "North America":  B(["USA", 0.92], ["CAN", 0.08]),
  "Europe":         B(["DEU", 0.22], ["FRA", 0.18], ["GBR", 0.18], ["CHE", 0.12],
                      ["NLD", 0.10], ["ITA", 0.08], ["ESP", 0.06], ["SWE", 0.06]),
  "Global":         B(["USA", 0.55], ["JPN", 0.07], ["GBR", 0.05], ["DEU", 0.05],
                      ["FRA", 0.04], ["CHN", 0.04], ["CHE", 0.03], ["TWN", 0.03],
                      ["KOR", 0.03], ["IND", 0.03], ["CAN", 0.03], ["AUS", 0.02],
                      ["NLD", 0.02], ["SGP", 0.01]),
  "Asia":           B(["CHN", 0.30], ["JPN", 0.18], ["IND", 0.12], ["KOR", 0.10],
                      ["TWN", 0.10], ["HKG", 0.08], ["SGP", 0.07], ["IDN", 0.05]),
  "Asia ex-Japan":  B(["CHN", 0.36], ["IND", 0.15], ["KOR", 0.13], ["TWN", 0.13],
                      ["HKG", 0.09], ["SGP", 0.08], ["IDN", 0.06]),
  "Asia Pacific":   B(["CHN", 0.24], ["JPN", 0.20], ["AUS", 0.12], ["KOR", 0.10],
                      ["TWN", 0.10], ["HKG", 0.08], ["SGP", 0.08], ["IND", 0.08]),
  "Greater China":  B(["CHN", 0.70], ["HKG", 0.22], ["TWN", 0.08]),
  "Southeast Asia": B(["SGP", 0.30], ["IDN", 0.22], ["THA", 0.18], ["MYS", 0.16],
                      ["PHL", 0.08], ["VNM", 0.06]),
  "Emerging Markets": B(["CHN", 0.28], ["IND", 0.18], ["TWN", 0.14], ["KOR", 0.12],
                      ["BRA", 0.08], ["IDN", 0.05], ["SAU", 0.05], ["ZAF", 0.05], ["MEX", 0.05])
};

/** Gold is not a country. Bullion and allocated metal get no country exposure. */
export const NON_COUNTRY_SECTORS = new Set(["Gold"]);

/**
 * Physical dependencies. Keyed explicitly where it matters, with a couple of
 * rules for the funds. Deliberately conservative — an invented chokepoint is
 * worse than a missing one.
 */
const CHOKEPOINTS_BY_ID = {
  "SYN-ST-0101": ["Malacca Strait", "Lombok Strait"],   // Indonesian coal, seaborne to N Asia
  "SYN-ST-0104": ["Malacca Strait", "Hormuz", "Suez"],  // Pacific Orient Shipping
  "SYN-ST-0105": ["Malacca Strait"],                    // Palm, SE Asia
  "SYN-EQ-0008": ["Hormuz", "Suez"],                    // Global energy majors
  "SYN-EQ-0025": ["Malacca Strait", "Hormuz", "Suez"],  // Asia Pacific shipping & logistics
  "SYN-CM-0403": ["Hormuz", "Suez"]                     // Broad commodity index
};

export function chokepointsFor(inst) {
  if (CHOKEPOINTS_BY_ID[inst.instrument_id]) return CHOKEPOINTS_BY_ID[inst.instrument_id];
  const sector = inst.sector || "";
  const region = inst.region || "";
  if (sector === "Energy") return ["Hormuz"];
  if (region === "Greater China" || region === "Asia ex-Japan") return ["Taiwan Strait", "Malacca Strait"];
  return [];
}

/** Normalise a name for fuzzy matching between basket text and instrument names. */
const key = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Words that carry no identifying signal when matching a basket leg to an instrument. */
const STOP = new Set(["the","ltd","limited","inc","corp","corporation","plc","tbk","kk","ab",
  "pte","holdings","group","fund","equity","index","adr","co","company","and","of","spot",
  // wrapper vocabulary — shared by every note, so it identifies nothing
  "note","ref","basket","fixed","coupon","linked","capital","protected","accumulator",
  "autocallable","worst"]);

const tokens = s => key(s).split(" ").filter(w => w.length > 2 && !STOP.has(w));

/** 0..1 overlap of identifying tokens. 0.6+ is a confident match in this dataset. */
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const hits = A.filter(w => B.includes(w)).length;
  return hits / Math.min(A.length, B.length);
}

/**
 * Resolve a structured product to the instruments it actually references.
 *
 * The exposure is named in one of two places and we have to read both:
 *   · `underlying_reference` — "Worst-of basket: Pacific Orient Shipping / ..."
 *   · `instrument_name`      — "Accumulator ref. Golden Harbour Properties Ltd, 12M"
 *
 * Three of those legs name instruments held elsewhere in the same book. Resolving
 * them is the difference between "this is a note" and "this doubles a bet the
 * client already has" — which is the whole look-through argument.
 *
 * Legs we cannot resolve are RETURNED AS UNRESOLVED rather than dropped or
 * guessed. The brief rewards honesty about uncertainty; a silently-dropped leg
 * understates exposure, and an invented one is worse.
 */
export function resolveUnderlying(inst, instrumentsRaw) {
  const ref = inst.underlying_reference || "";
  const name = inst.instrument_name || "";
  const out = { components: [], resolved: [], unresolved: [], gold: false };

  if (/\bxau\b|\bgold\b/i.test(ref) || /\bgold\b/i.test(name)) out.gold = true;

  const legs = [];

  // 1. "... ref. <NAME>, 12M"  /  "... ref. <NAME>, 11.00%"  in the instrument name
  const m = name.match(/\bref\.\s*([^,]+)/i);
  if (m) legs.push(m[1].trim());

  // 2. the basket body of underlying_reference
  const body = ref.includes(":") ? ref.slice(ref.indexOf(":") + 1) : ref;
  for (const p of body.split(/\s*\/\s*|\s*,\s*(?![0-9])/).map(s => s.trim())) {
    if (!p || p.length < 4 || /^\d/.test(p)) continue;
    if (/capital protection|participation|autocall|knock|strike|double-up|accumulation|observation|last priced|preference shares|allocated|vault|maturity/i.test(p)) continue;
    if (/^xau\b/i.test(p)) continue;                       // gold, handled by the gold flag
    if (/^basket [a-z]$/i.test(p)) continue;               // the basket's own label, not a leg
    legs.push(p);
  }

  const seen = new Set();
  for (const leg of legs) {
    const k = key(leg);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.components.push(leg);

    // A leg that is only wrapper vocabulary ("Basket A", "Asia Banks Basket")
    // names no instrument. Record it as unresolved rather than matching another note.
    if (!tokens(leg).length) { out.unresolved.push(leg); continue; }

    let best = null, bestScore = 0;
    for (const cand of instrumentsRaw) {
      if (cand.instrument_id === inst.instrument_id) continue;
      // A note's underlying is never another note in this dataset.
      if (cand.asset_class === "Structured Products") continue;
      const score = similarity(leg, cand.instrument_name);
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    if (best && bestScore >= 0.6) {
      if (!out.resolved.some(r => r.id === best.instrument_id)) {
        out.resolved.push({ text: leg, id: best.instrument_id, name: best.instrument_name, score: Number(bestScore.toFixed(2)) });
      }
    } else if (!/^gold$/i.test(leg)) {
      out.unresolved.push(leg);
    }
  }
  return out;
}

/** Blend several exposure lists into one that sums to 1. */
export function blend(lists) {
  const acc = {};
  let total = 0;
  for (const { exposures, weight } of lists) {
    for (const e of exposures || []) {
      acc[e.iso3] = (acc[e.iso3] || { iso3: e.iso3, weight: 0, assumed: false });
      acc[e.iso3].weight += e.weight * weight;
      if (e.assumed) acc[e.iso3].assumed = true;
      total += e.weight * weight;
    }
  }
  const out = Object.values(acc);
  if (!total) return [];
  return out.map(e => ({ ...e, weight: e.weight / total }))
            .filter(e => e.weight > 0.0005)
            .sort((a, b) => b.weight - a.weight);
}
