/**
 * Fixed-window, per-key rate limiting. Guards /api/llm and /api/policy-scan — both forward to a
 * paid third-party key (Anthropic/OpenAI, TinyFish) with no user-auth layer in front of them at
 * all (this app has none — the whole dashboard is open to anyone with the URL, by design). A
 * real person is throttled by how fast they can click; a script hitting the endpoint directly
 * isn't, so this caps cost/abuse server-side regardless of who's asking.
 *
 * Best-effort, not a distributed guarantee: on the local Express server (server/index.js) the
 * process persists, so `buckets` is a reliable, single source of truth. On Vercel's serverless
 * functions (api/llm.js, api/policy-scan.js), a request can land on a different instance than
 * the last one from the same IP, so this in-memory Map isn't consistent across the whole
 * deployment — it still meaningfully caps a sustained burst that stays on one warm instance,
 * just doesn't guarantee the limit holds globally. A fully correct version needs an external
 * store (Vercel KV/Upstash) shared across instances; not pulled in here for a hackathon-scale
 * deploy, where the honest good-enough version is worth more than a new infra dependency.
 */
const buckets = new Map(); // key -> { count, resetAt }
const MAX_TRACKED_KEYS = 5000; // sweep old entries before this gets unbounded

function sweepExpired(now) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Returns { allowed, remaining, resetAt, retryAfterSec }. Call once per request; every call
 * counts toward the window, whether or not it turns out allowed. */
export function checkRateLimit(key, { limit, windowMs = 60_000 } = {}) {
  const now = Date.now();
  sweepExpired(now);
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

/** The caller's IP from either an Express request (req.ip, or the raw socket if that's unset)
 * or a Vercel serverless request (x-forwarded-for, which Vercel sets on every request; the raw
 * socket address on Vercel's own network isn't the real client). Takes the first address in a
 * comma-separated x-forwarded-for list — that's the original client; later ones are intermediate
 * proxies. Falls back to a constant so a request with no resolvable IP still gets *a* bucket
 * (shared across all such requests) rather than bypassing the limit entirely. */
export function clientIp(req) {
  const xff = req.headers?.["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}
