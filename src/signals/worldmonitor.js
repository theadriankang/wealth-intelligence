/**
 * World Monitor client — LIVE FIRST, FIXTURES ALWAYS.
 *
 * The demo must never depend on conference wifi. Every call races a timeout and
 * falls back to fixtures; the UI shows which mode it is in via getMode(), so the
 * fallback is honest rather than hidden.
 *
 * The browser talks to our own /api/signals (server/index.js), which holds the
 * API key. Never put the key in client code.
 */
import { SIGNALS, PREV_SIGNALS } from "./fixtures/signals.js";

const TIMEOUT_MS = 4000;
let mode = "unknown";        // "live" | "fixtures" | "unknown"
let lastError = null;

export const getMode = () => ({ mode, lastError });

async function withTimeout(promise, ms = TIMEOUT_MS) {
  let t;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); })
    ]);
  } finally { clearTimeout(t); }
}

/**
 * @param {string[]} iso3s countries the book actually touches — don't fetch the world
 * @returns {Promise<{signals:Object, prevSignals:Object, live:boolean}>}
 */
export async function fetchSignals(iso3s, { offline = false } = {}) {
  if (offline) {
    mode = "fixtures";
    return { signals: SIGNALS, prevSignals: PREV_SIGNALS, live: false };
  }
  try {
    const res = await withTimeout(
      fetch(`/api/signals?countries=${encodeURIComponent(iso3s.join(","))}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.signals || !Object.keys(data.signals).length) throw new Error("empty payload");

    // Merge over fixtures so a partial live response still renders a complete map.
    //
    // FIELD-WISE, not country-wise. The live feed populates instability and
    // leaves tone / policyStance / riskDelta null, because that endpoint does not
    // measure them. A country-level spread would overwrite a fixture with null
    // and blank three of the four lenses for exactly the countries we know most
    // about. Nulls are dropped; the fixture underneath shows through.
    mode = "live"; lastError = null;
    return {
      signals: mergeSignals(SIGNALS, data.signals),
      prevSignals: mergeSignals(PREV_SIGNALS, data.prevSignals || {}),
      live: true
    };
  } catch (err) {
    mode = "fixtures";
    lastError = err.message;
    console.warn("[worldmonitor] live fetch failed, using fixtures:", err.message);
    return { signals: SIGNALS, prevSignals: PREV_SIGNALS, live: false };
  }
}

/** Per-country, per-field merge that never lets a null erase a fixture. */
function mergeSignals(fixtures, live) {
  const out = { ...fixtures };
  for (const [iso3, incoming] of Object.entries(live || {})) {
    const base = out[iso3] || {};
    const merged = { ...base };
    for (const [k, v] of Object.entries(incoming)) {
      if (v === null || v === undefined) continue;
      if (Array.isArray(v) && v.length === 0 && Array.isArray(base[k]) && base[k].length) continue;
      merged[k] = v;
    }
    out[iso3] = merged;
  }
  return out;
}

/** Poll for updates. Returns a stop() function. Never throws. */
export function pollSignals(iso3s, onUpdate, everyMs = 60000, opts = {}) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try { onUpdate(await fetchSignals(iso3s, opts)); } catch {}
    if (!stopped) setTimeout(tick, everyMs);
  };
  setTimeout(tick, everyMs);
  return () => { stopped = true; };
}
