/**
 * Generic CSV import — the escape hatch when the provided data is a spreadsheet.
 * Expected header (order-insensitive):
 *   instrumentId,name,assetClass,currency,weightPct,iso3,exposureWeight,sector,chokepoints
 * One row per instrument-country pair, so a fund is several rows sharing instrumentId.
 */
export async function csvAdapter({ text, portfolioMeta = {} } = {}) {
  if (!text) throw new Error("csvAdapter needs { text }");
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",").map(s => s.trim());
  const idx = n => cols.indexOf(n);

  const instruments = {};
  const weights = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = splitCsvLine(line);
    const id = c[idx("instrumentId")];
    if (!id) continue;
    const inst = (instruments[id] ||= {
      id,
      name: c[idx("name")] || id,
      assetClass: c[idx("assetClass")] || "equity",
      currency: c[idx("currency")] || "USD",
      exposures: [],
      sectors: [],
      chokepoints: []
    });
    const iso3 = c[idx("iso3")];
    if (iso3) inst.exposures.push({ iso3, weight: Number(c[idx("exposureWeight")] ?? 1) });
    const sec = c[idx("sector")];
    if (sec && !inst.sectors.some(s => s.name === sec)) inst.sectors.push({ name: sec, weight: 1 });
    const ck = c[idx("chokepoints")];
    if (ck) for (const k of ck.split("|").filter(Boolean)) {
      if (!inst.chokepoints.includes(k)) inst.chokepoints.push(k);
    }
    weights[id] = Number(c[idx("weightPct")] ?? weights[id] ?? 0);
  }

  const portfolio = {
    id: portfolioMeta.id || "imported",
    name: portfolioMeta.name || "Imported portfolio",
    ref: portfolioMeta.ref || "—",
    currency: portfolioMeta.currency || "USD",
    aum: portfolioMeta.aum || "—",
    mandate: portfolioMeta.mandate || "Advisory",
    riskProfile: portfolioMeta.riskProfile || "Balanced",
    riskBand: portfolioMeta.riskBand || "",
    reviewDate: portfolioMeta.reviewDate || "",
    rm: portfolioMeta.rm || "",
    positions: Object.keys(instruments).map(id => ({ instrumentId: id, weightPct: weights[id] })),
    goals: portfolioMeta.goals || [],
    actions: []
  };
  return { instruments, portfolios: [portfolio], signals: {}, prevSignals: {} };
}

function splitCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
