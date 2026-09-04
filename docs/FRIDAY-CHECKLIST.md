# Demo checklist

Rewritten 5 Sep 2026, after the AI-scoring merge and the Intelligence tab landed.
The previous version rehearsed a four-segment spine that no longer exists.

---

## Before you present

- [ ] `npm install` on every laptop that might drive the demo
- [ ] `npm run dev:all` — **both** processes. `npm run dev` alone leaves `/api/llm`,
      `/api/signals` and `/api/policy-scan` unserved and the cockpit falls back silently.
- [ ] `.env` has `ANTHROPIC_API_KEY`, `TINYFISH_API_KEY`, `FRED_API_KEY`
- [ ] Open in **Chrome**, not the VS Code preview — the preview has no WebGL and renders
      the cockpit as floating white boxes. It is not broken; it is the wrong browser.
- [ ] Let the book finish scoring before you start talking. Client cards read
      "Scoring…" until the boot-time narration returns.
- [ ] `npm test` — 48 tests, all green

## The demo path — rehearse this, five minutes

**1. Open on the book.** Twenty clients, sorted by attention. Say what the screen is: a
relationship manager's morning, ranked by who needs them today.

**2. Open Lau Chi Ming (CL-0014).** The richest client for this story — a live margin-call
finding, a real dataset-vs-live divergence, and three retrieved documents.

**3. Overview.** Globe, four lenses, look-through country exposure. Point out that a fund
is not a country: `JBGEF` contributes its Taiwan sleeve everywhere at once. Toggle
Household and watch the concentration cross its mandate limit.

**4. Risks & Actions.** AI-scored, each carrying its citation count. Advisory versus
discretionary mandates behave differently — the suitability record is generated, not typed.

**5. Intelligence — this is the differentiator, spend the most time here.**
   - Header: `17 tool calls · 7 findings · 0 citable · 3 blocked`
   - The findings, each with its evidence refs (`auth:facility.CF-0002.ltv_pct`)
   - **The fence.** Every number leaves a tool as a Measure carrying its own provenance.
     Arithmetic refuses a bare number and refuses a live value. Not a prompt asking the
     model to behave — a function that throws.
   - **Dataset vs live**, stated and never reconciled: VIX 25.1 in the dataset, 14.32 live.
   - **Then the moment.** Scroll to Retrieved evidence. Nothing is citable — every document
     is a candidate, and the pipeline cannot approve its own output. Click
     **Approve for citation** on the HKMA document. The walk re-runs: `0 citable` becomes
     `1 citable`, `3 blocked` becomes `2`.
     Say it plainly: *that is what the relationship manager does in this system.*

**6. Compliance / Impact** only if there is time. The argument survives without them.

## What to say about the data

Be precise here; a private bank will test it.

- **Live and real:** 60 documents retrieved through TinyFish and 155 market series from
  FRED, across all 20 clients, each traceable to the exposure that caused the query.
- **Fabricated:** the portfolios, the clients, the 2026 events. The disclaimer strip says so
  and stays up.
- **Not live:** the globe's Instability, Tone and Policy lenses. They are dataset signals.
  Do not call them live.
- If asked about physical-world feeds: we built a GDELT lane and a WorldMonitor client.
  WorldMonitor returns 401 with no public signup below USD 99.99/month; GDELT rate-limited
  our IP to a standstill (429 on a single cold request after 11.5s). Both are in the repo
  with the measurements. That answer lands better than a lens that greys out on stage.

## If something breaks

| Fails | What happens | What you say |
|---|---|---|
| LLM key missing or model down | Deterministic template note; `aiState` reports "unavailable", never a made-up number | "The scoring degrades to the deterministic rubric — it never invents a figure." |
| Signals unreachable | `fixtures` badge next to the clock | "It's designed to say so rather than hide it." |
| WebGL / no globe | Fallback panel; Actions, Intelligence and Impact all still work | Move to the Intelligence tab; the argument is there anyway. |
| Model returns uncited claims | Those claims are dropped before render, count shown | This is the point. Say it out loud. |
| Intel bundle missing for a client | Panel names the client and the command to rebuild | Switch to CL-0014. |

Do not narrate the tech stack. Let a ticker signal land while you talk.

## Rebuilding the intel bundles (only if you must)

The bundles and the recording are committed, so `--frozen` replays without the network.
A live rebuild takes 12–15 minutes and spends real TinyFish budget:

```bash
npm run intel -- --live     # all 20 clients, rate-limited to 24 req/min
npm run publish-intel       # out/intel -> public/intel for the browser
```

Rehearse from the committed cache. A pipeline that depends on a live call succeeding on
stage is not a pipeline, it is a bet.

## Deployed demo (Vercel)

`/api/llm`, `/api/signals` and `/api/policy-scan` exist as serverless functions, but they
read environment variables that must be set in the Vercel dashboard — they are NOT read
from `.env`, which is gitignored and never leaves the laptop. Without them the deployed
site silently falls back to templates. Set: `ANTHROPIC_API_KEY`, `TINYFISH_API_KEY`,
`POLICY_SCAN_QUERY`, `POLICY_SCAN_DOMAINS`, `POLICY_SCAN_LOCATION`, `POLICY_SCAN_LANGUAGE`,
`OFFLINE=0`.

A warm local server always demos better than a cold serverless one. Prefer localhost;
keep the deployment as the link you hand over afterwards.

## Ask at the booth

- Does this sit inside Wealth Navigator, or beside it? How does it relate to JAI?
- RM-facing, client-facing, or both?
- Is the CIO house view available as data?
- Do funds carry a country breakdown, or only domicile?
- What is the side challenge, and does it overlap?

## The question you must be able to answer

**"What does the relationship manager stop doing?"**

Not what they get more of. What comes off their plate. Have one sentence ready, and make
the approval click the proof.
