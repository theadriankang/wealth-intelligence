/**
 * Talks to our own /api/llm so no key ever reaches the browser.
 * If the call fails, the caller falls back to the deterministic template brief —
 * the demo never shows a spinner that never resolves.
 */
export async function generateBrief({ system, prompt, schema }, { timeoutMs = 20000 } = {}) {
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
    console.warn("[llm] falling back to template brief:", err.message);
    return { ok: false, error: err.message };
  } finally { clearTimeout(t); }
}
