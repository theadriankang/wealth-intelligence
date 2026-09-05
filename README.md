# Wealth Intelligence

**SingHacks 2026 · Julius Baer track — “From Portfolio Monitoring to Intelligence”**

An adviser cockpit that reads a client's portfolio against live world signals and answers the
question a private bank actually cares about: *does this change whether my client gets what they
want, and what do I say to them about it?*

Built before the challenge repo dropped, so the parts most likely to change are isolated behind
one adapter file.

---

## Run it

```bash
npm install
cp .env.example .env      # optional — it runs fully on fixtures without keys
npm run dev               # http://localhost:5173
npm run server            # optional API on :8787 for live signals + LLM
npm run dev:all           # both
```

With no `.env` and no network it still runs: fixture signals, template-generated notes, and a
visible `fixtures` badge next to the live clock so the fallback is stated rather than hidden.

## What's in it

| Surface | What it does |
|---|---|
| **Goals strip** | Funding confidence per client objective, computed (not hardcoded) and showing this week's move. Click one to filter the whole cockpit to the positions funding it. |
| **Globe** | Four lenses over one geometry — risk Δ, instability, narrative tone, policy stance. Colour is the signal, height is capital at risk, arcs are shipping lanes, rings are strained chokepoints. |
| **Look-through** | A fund is not a country. Country numbers roll up from `instrument.exposures`, so `JBGEF` contributes its 5% Taiwan sleeve everywhere at once. |
| **Household toggle** | Account vs. household across entities — Taiwan goes 7.8% → 11.5% and crosses the mandate limit. |
| **Actions** | Trim / hedge / hold / collateral proposals with lifecycle states, and an auto-generated suitability record. Advisory vs. discretionary mandates behave differently. |
| **Conversation** | Relationship context, talking points, likely objections with answers. |
| **Compliance** | Screening, physical concentration by chokepoint, suitability audit trail. |
| **Impact** | RM economics — prep time, clients covered, prepare-once-deliver-many. Assumptions stated openly. |
| **Client view** | `?view=client` — the calm, light screen you can turn around to the client. |
| **Client note** | LLM-generated, every claim cited to a signal id, uncited claims dropped before render. Falls back to a deterministic template with no key. |

## The seam

```
adapters/  →  model/  →  ui/
```

`src/adapters/juliusbaer.js` is the only file that should need to change when their data lands.
Everything downstream reads the shapes in `src/model/schema.js`.

See `docs/ARCHITECTURE.md` and `docs/FRIDAY-CHECKLIST.md`.

## TinyFish live policy scan

Policy Sentinel uses TinyFish Search first, then TinyFish Fetch:

1. Search discovers the freshest official source across MAS, BIS, Fed, and ECB domains.
2. Fetch extracts clean markdown from the selected URL.
3. The server classifies the fetched document into stance, urgency, affected assets, citations, and the Evidence Trial drawer.

Local route:

```bash
npm run dev:all
curl -X POST http://localhost:8787/api/policy-scan \
  -H "Content-Type: application/json" \
  -d '{"query":"latest MAS monetary policy statement Singapore","includeDomains":"mas.gov.sg,bis.org"}'
```

Vercel route after deploy:

```text
/api/policy-scan
```

Add these Vercel environment variables:

```bash
TINYFISH_API_KEY=tf_live_or_test_key_here
POLICY_SCAN_QUERY=latest MAS monetary policy statement central bank policy speech Singapore
POLICY_SCAN_DOMAINS=mas.gov.sg,bis.org,federalreserve.gov,ecb.europa.eu
POLICY_SCAN_LOCATION=SG
POLICY_SCAN_LANGUAGE=en
TINYFISH_FETCH_TTL=0
TINYFISH_FETCH_TIMEOUT_MS=45000
OFFLINE=0
```

### AI narration and the Copilot

`/api/llm` is also a Vercel route (`api/llm.js`), the counterpart to the local
`POST http://localhost:8787/api/llm` served by `npm run server`/`npm run dev:all`.
Without a key set **on Vercel** — not just in your local `.env` — every client
narration and Copilot answer silently falls back to the deterministic template,
even though it works fine locally:

```bash
ANTHROPIC_API_KEY=
# or
OPENAI_API_KEY=
LLM_MODEL=
```

Other optional keys used by the existing app:

```bash
WORLDMONITOR_API_KEY=
```

## Honest limitations

- All data is fabricated. The disclaimer strip stays until it isn't.
- Goal funding uses a simple documented drag formula (`src/model/scoring.js`), not a Monte Carlo.
- Action effects are authored, not modelled.
- `server/worldmonitor.js` guesses at the real response shape — verify against their docs.
- No auth, no persistence. It's a hackathon prototype.

## Licence note

globe.gl (MIT), Vite (MIT), Natural Earth country polygons (public domain). Nothing here is
derived from the AGPL worldmonitor application — only its public API is consumed.
