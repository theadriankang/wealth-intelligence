/**
 * Talks to our own /api/llm so no key ever reaches the browser.
 * If every attempt fails, the caller falls back to the deterministic template brief —
 * the demo never shows a spinner that never resolves.
 *
 * Retries with backoff before giving up: under boot-time concurrency (narrateAllPortfolios
 * scores the whole book at once), individual calls have been measured taking 5-18s — close
 * enough to a single 20s timeout that one slow response could permanently strand a client at
 * "Unavailable". Narration is computed once per session and frozen by design (see
 * maybeNarratePortfolio in main.js), so "frozen" needs to mean genuinely exhausted, not "hit one
 * transient timeout or 5xx". A network error, non-2xx response, or abort all count as a failure
 * worth retrying; only a response the server itself couldn't parse into JSON (a real, non-transient
 * problem) would still surface as `ok:false` on attempt one — but that path throws inside
 * server/llm.js, so it looks identical here to any other failure and gets retried too, which is
 * harmless: retrying a deterministic failure just costs a little time before falling back.
 */
export async function generateBrief(
  { system, prompt, schema },
  { timeoutMs = 25000, retries = 2, retryDelayMs = 800 } = {}
) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system, prompt, schema }),
        signal: ctl.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: true, data: data.result };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1)); // 800ms, then 1600ms
    } finally {
      clearTimeout(t);
    }
  }
  console.warn(`[llm] falling back to template brief after ${retries + 1} attempt(s):`, lastErr.message);
  return { ok: false, error: lastErr.message };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
