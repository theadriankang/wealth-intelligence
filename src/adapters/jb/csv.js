/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * Written by hand rather than pulled from npm because the JB files contain
 * quoted fields with embedded commas (every event_log description) and we would
 * rather own 30 lines than add a dependency the judges have to trust.
 */
export function parseCsv(text) {
  const rows = splitRows(text.trim());
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).map(cells => {
    const o = {};
    head.forEach((h, i) => { o[h] = cells[i] ?? ""; });
    return o;
  });
}

/** Split into rows of cells, respecting quotes (which may contain newlines). */
function splitRows(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else q = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { q = true; continue; }
    if (ch === ",") { row.push(cur); cur = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
    cur += ch;
  }
  row.push(cur);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/** Numeric coercion that treats "" and junk as null rather than 0 — a silent 0 is worse. */
export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
