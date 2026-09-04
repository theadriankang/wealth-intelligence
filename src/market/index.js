import { MARKET_HISTORY } from "./history.js";

const S = id => MARKET_HISTORY[id]?.points || [];

export function getSeries(id, { from, to } = {}) {
  let pts = S(id);
  if (from) pts = pts.filter(p => p.d >= from);
  if (to) pts = pts.filter(p => p.d <= to);
  return pts.map(p => ({ ...p }));
}

export function latest(id) {
  const pts = S(id);
  return pts.length ? { ...pts.at(-1) } : null;
}

export function returns(id, weeks) {
  const pts = S(id);
  if (pts.length <= weeks) return 0;
  const a = pts.at(-1 - weeks).c, b = pts.at(-1).c;
  return a ? ((b - a) / a) * 100 : 0;
}

function realisedVol(closes) {
  if (closes.length < 3) return 0;
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length;
  return Math.sqrt(variance) * Math.sqrt(52) * 100;
}

export function volatility(id, window = 26) {
  const pts = S(id);
  if (pts.length < window) return realisedVol(pts.map(p => p.c));
  return realisedVol(pts.slice(-window).map(p => p.c));
}

export function percentileVsHistory(id, metric = "vol") {
  const pts = S(id);
  if (pts.length < 40) return 0;
  const closes = pts.map(p => p.c);
  const win = metric === "return" ? 13 : 26;
  const samples = [];
  for (let i = win; i <= closes.length; i++) {
    const slice = closes.slice(i - win, i);
    samples.push(metric === "return"
      ? (slice.at(-1) - slice[0]) / slice[0]
      : realisedVol(slice));
  }
  const current = samples.at(-1);
  const below = samples.filter(s => s <= current).length;
  return below / samples.length;
}
