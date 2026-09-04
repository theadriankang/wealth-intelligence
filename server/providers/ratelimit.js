/**
 * One shared budget per upstream, and a retry that respects the upstream's own
 * answer rather than guessing.
 *
 * WHY THIS EXISTS
 * The doc lane fans 12 search queries out per client with Promise.all, and the
 * intel build walks 20 clients. That is ~240 searches arriving in bursts of 12
 * against a 30-per-minute ceiling, which is how a full build returned 168
 * RATE_LIMIT_EXCEEDED and zero documents on 4 Sep.
 *
 * A token bucket is the right shape here rather than a fixed delay: it lets a
 * burst through while it has tokens and paces the rest, so a small build stays
 * fast and a large one stays inside the ceiling. Tokens refill continuously —
 * a caller that waits gets the next one the moment it is minted, not at the top
 * of some window.
 *
 * Limits are set BELOW the published ceiling on purpose. The published number is
 * enforced upstream against a clock we cannot see; sitting exactly on it means
 * losing a race we have no way to detect.
 */

const BUCKETS = new Map();

class Bucket {
  constructor(name, perMinute, burst) {
    this.name = name;
    this.capacity = burst ?? perMinute;
    this.tokens = this.capacity;
    this.refillPerMs = perMinute / 60000;
    this.last = Date.now();
    this.queue = Promise.resolve();   // serialises admission, not the calls themselves
    this.waited = 0;
    this.waitedMs = 0;
  }

  #replenish() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
  }

  /** Resolves when this caller may proceed. Admission is FIFO. */
  take() {
    const admitted = this.queue.then(async () => {
      this.#replenish();
      if (this.tokens < 1) {
        const ms = Math.ceil((1 - this.tokens) / this.refillPerMs);
        this.waited++; this.waitedMs += ms;
        await sleep(ms);
        this.#replenish();
      }
      this.tokens -= 1;
    });
    this.queue = admitted.catch(() => {});
    return admitted;
  }

  stats() { return { name: this.name, waited: this.waited, waited_ms: Math.round(this.waitedMs) }; }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function bucket(name, perMinute, burst) {
  if (!BUCKETS.has(name)) BUCKETS.set(name, new Bucket(name, perMinute, burst));
  return BUCKETS.get(name);
}

export function limiterStats() {
  return [...BUCKETS.values()].map(b => b.stats()).filter(s => s.waited > 0);
}

/** Pull a wait hint out of a 429 response. Retry-After wins; it is the upstream's own number. */
export function retryAfterMs(res, attempt) {
  const raw = res?.headers?.get?.("retry-after");
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 60000);
    const at = Date.parse(raw);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), 60000);
  }
  // Exponential with jitter. Jitter matters: without it, every queued caller
  // wakes at the same instant and reproduces the burst that caused the 429.
  return Math.min(2000 * 2 ** attempt, 30000) + Math.floor(Math.random() * 500);
}

/**
 * Run `fn` under a bucket, retrying only on the statuses worth retrying.
 * `fn` receives no arguments and must return a Response.
 *
 * 429 and 5xx are retried; 4xx is not — a malformed query does not improve by
 * being asked again, and burning the budget on it starves the queries that would
 * have worked.
 */
export async function limited(name, perMinute, fn, { retries = 4, burst, label = name } = {}) {
  const b = bucket(name, perMinute, burst);
  let lastStatus = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    await b.take();
    const res = await fn();
    if (res.ok) return res;

    lastStatus = res.status;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === retries) return res;

    const wait = retryAfterMs(res, attempt);
    console.warn(`[ratelimit] ${label} HTTP ${res.status} — retry ${attempt + 1}/${retries} in ${wait}ms`);
    await sleep(wait);
  }
  throw new Error(`${label}: exhausted retries (last HTTP ${lastStatus})`);
}
