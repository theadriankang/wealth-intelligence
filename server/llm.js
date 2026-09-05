/**
 * One function, two providers, JSON out. Whichever key is present wins.
 * Returns parsed JSON or throws — the client has a template fallback.
 *
 * temperature:0 and max_tokens:2000 on both providers, kept identical between them rather than
 * each drifting to its own defaults. temperature:0 — this app asks the model for numbers
 * (health, concentration) as well as prose, and a client-facing score has no business sampling
 * randomly run to run. Zero doesn't make the call bit-for-bit deterministic (inference still
 * isn't perfectly reproducible), but it removes the bulk of the drift; narrate.js's
 * AI_SCORE_BAND check catches what's left. max_tokens:2000 bounds response size/cost on both
 * providers — comfortably above what the largest schema (narrateClient's) needs in practice.
 */
export async function callLLM({ system, prompt, schema }) {
  const providers = [
    process.env.ANTHROPIC_API_KEY && ["anthropic", anthropic],
    process.env.OPENAI_API_KEY && ["openai", openai]
  ].filter(Boolean);

  if (!providers.length) {
    throw new Error("No LLM key set — put ANTHROPIC_API_KEY or OPENAI_API_KEY in .env");
  }

  // Anthropic first when both keys are present; OpenAI is a failover, not an alternative.
  // The provider order is presence-based (a key that isn't set is never tried), but a provider
  // that IS set and fails hands off to the next one rather than surfacing "Analysis unavailable"
  // — the realistic demo-day failure is a 429 or an overloaded 529 under a live crowd, not a
  // missing key. Only the last provider's error escapes, so the caller's template fallback
  // still fires when every provider is down.
  let lastErr;
  for (const [name, call] of providers) {
    try {
      return await call({ system, prompt, schema });
    } catch (err) {
      lastErr = err;
      console.warn(`[llm] ${name} failed: ${err.message}`);
    }
  }
  throw lastErr;
}

async function anthropic({ system, prompt, schema }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || process.env.LLM_MODEL || "claude-sonnet-4-5",
      max_tokens: 2000,
      temperature: 0,
      system,
      messages: [{
        role: "user",
        content: `${prompt}\n\nReturn ONLY JSON matching this schema:\n${JSON.stringify(schema)}`
      }]
    })
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return parseJson(data.content?.[0]?.text ?? "");
}

async function openai({ system, prompt, schema }) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${prompt}\n\nSchema:\n${JSON.stringify(schema)}` }
      ]
    })
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return parseJson(data.choices?.[0]?.message?.content ?? "");
}

function parseJson(text) {
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("model did not return JSON");
  }
}
