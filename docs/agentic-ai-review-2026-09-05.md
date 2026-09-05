# Agentic AI review — 2026-09-05

Scope: why the client score felt inconsistent, and a broader look at where the app's LLM
touchpoints could be more tightly specified. Implemented changes are in the sibling commit;
this file is the analysis that didn't turn into code this pass.

## What was actually happening (fixed this pass)

`cb4a8dd` ("Boot-time book-wide AI scoring, no more deterministic display") moved health and
concentration from the existing deterministic engine (`src/model/scoring.js` /
`src/eval/clientEval.js` / `src/eval/rubric.js` — every weight and threshold named in one file)
to numbers the LLM computes itself from raw facts, deliberately withheld from the trusted answer.
`74d2a9b` ("Freeze AI score after boot") froze that number for one session, but every fresh page
load re-triggers `narrateAllPortfolios()`, which re-asks the model from scratch — at the
provider's default temperature (~1.0, never set explicitly anywhere in `server/llm.js`). That's
the exact shape of "every time I open the website the score deviates."

Fixed by: `temperature: 0` on both provider calls, plus a stated `AI_SCORE_BAND` (rubric.js) —
the model is now handed the deterministic reference and validated against a ±6-point leash from
it; anything outside that band is rejected in full, same as a network failure today. See
`src/eval/narrate.js` and `src/eval/rubric.js`.

## Where the agentic AI falls short more broadly

### 1. The best guardrail pattern in the repo isn't protecting anything live

`src/agent/contract.js` defines a genuinely good idea: every arithmetic tool
(`compute_headroom`, `compute_share`, `compute_funding_ratio`) only accepts typed `Measure`
objects that carry their own provenance (`{value, ref, world}`) — the model cannot pass a bare
number it invented, only pass through what a read tool actually returned. `SYSTEM_PROMPT` states
plainly which inputs are authoritative and which are unapproved web context, and that the two
"do not mix."

This is wired into exactly one place: `server/agent/run.js`, run via `npm run agent` — a CLI
script, not the live site. The actual user-facing AI touchpoints (`narrateClient`, `askCopilot`
in `src/eval/narrate.js`) have none of this. They're prose-in, JSON-out, policed only by
after-the-fact regex/range checks (`validateAiScore`). Porting the Measure/tool-call contract
into the live copilot path is the highest-leverage prompt-hardening work available in this
codebase; flagged for a follow-up pass rather than done here (scope call made this session).

### 2. `askCopilot` has no numeric guardrail at all

`narrateClient`'s health/concentration now have a stated tolerance band. `askCopilot` (the "ask
anything" box) answers free-text questions from the same facts with no equivalent — any number
it states in prose (a weight, a headroom figure, a date) is trusted purely on the strength of
"use only the facts given, don't invent." The temperature=0 change helps its consistency, but
there's no structural check that a number it states actually appears in the facts it was given,
the way `validateAiScore`'s country-code check does for concentration. Same fix shape as §1 would
close this — tool-mediated lookups instead of prose recall.

### 3. Two different "what changed" hashes, doing similar jobs, that can drift apart

`evaluate.js`'s `hashClient()` (built from deterministic *output*) gates the render pipeline;
`narrate.js`'s `factsHash()` (built from raw *input*) gates the LLM call. They're intentionally
different per the original design (household toggling should re-narrate but doesn't change
deterministic output), but nothing enforces that `factsHash`'s input list stays a superset of
everything `evaluateClient()` actually reads. If a future contributor adds a new deterministic
input (say, a new health penalty term) without also adding it to `factsHash`'s basis, the AI
narration would silently go stale against a health score that already moved — no test currently
guards this invariant.

### 4. Policy Sentinel is the pattern worth copying, not a gap

By contrast, `server/policy-sentinel.js`'s `stanceScore()` is a deterministic keyword classifier
(comment: "Replaced by the LLM classifier later; stays as its fallback") — search → fetch →
validate → classify, with every rejection traced and reported, never silently dropped. This is
the same shape the score fix above moves health/concentration toward: deterministic core,
LLM (when present) as a bounded enhancement, not the sole source of truth. Worth using as the
reference pattern when hardening `askCopilot`.

### 5. Prompt instructions that are implicit rather than stated as a rule

Smaller items noticed in passing, not acted on:
- `COPILOT_SYSTEM` caps the answer at "80 words or fewer" but, unlike `SYSTEM`/`SCHEMA`, has no
  schema-level restatement of what counts as an invented fact vs. a permitted inference — it's
  one sentence doing the whole job `narrateClient`'s much longer system prompt does across nine
  paragraphs for the other surfaces.
- Nothing in `askCopilot` tells the model what to do when a question can't be answered from the
  facts at all beyond "say so honestly" — no stated format for "I don't have that" the way
  `complianceChecks`/`risks` have a stated shape to fall back to.

None of these are broken today (no failing case observed) — they're gaps in specification that
would matter more as the copilot gets used for higher-stakes questions.
