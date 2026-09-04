/**
 * Disk cache and replay.
 *
 * The reason this exists is not speed. It is that a pipeline which depends on a
 * live call succeeding on stage is not a pipeline, it is a bet. Every response
 * is recorded; `frozen` mode replays the recording and makes network calls throw.
 * Rehearse and present frozen. Refresh with --live when you actually want new data.
 *
 *   live    always fetch, always record
 *   auto    use the cache while fresh, fetch when stale   (default)
 *   frozen  cache only; a miss is an error, never a silent empty result
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const TTL = {
  structural: Infinity,      // how an AT1 works does not expire
  forward: 24 * 3600_000,    // policy calendars
  event: 3600_000,
  quant: 15 * 60_000,
};

const hash = (o) => createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 16);

export function makeCache({ dir = ".cache/intel", mode = "auto" } = {}) {
  mkdirSync(dir, { recursive: true });
  const stats = { hits: 0, misses: 0, writes: 0, frozenMisses: [] };

  const path = (k) => join(dir, `${k}.json`);

  function read(key) {
    const p = path(key);
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
  }

  /**
   * @param {object} id      identifies the call: {provider, endpoint, params}
   * @param {number} ttlMs
   * @param {() => Promise<any>} fetcher
   */
  async function through(id, ttlMs, fetcher) {
    const key = `${id.provider}-${hash(id)}`;
    const entry = read(key);
    const fresh = entry && (ttlMs === Infinity || Date.now() - entry.at < ttlMs);

    if (mode === "frozen") {
      if (entry) { stats.hits++; return { value: entry.value, cached: true, at: entry.at }; }
      stats.frozenMisses.push(`${id.provider}:${id.endpoint}`);
      throw new Error(`frozen mode: nothing recorded for ${id.provider} ${id.endpoint}. Run once with --live first.`);
    }
    if (mode !== "live" && fresh) { stats.hits++; return { value: entry.value, cached: true, at: entry.at }; }

    stats.misses++;
    const value = await fetcher();
    writeFileSync(path(key), JSON.stringify({ at: Date.now(), id, value }, null, 1));
    stats.writes++;
    return { value, cached: false, at: Date.now() };
  }

  return { through, stats, mode, size: () => (existsSync(dir) ? readdirSync(dir).length : 0) };
}
