# Client exposure dossiers

**Generated. Do not edit by hand — `npm run dossiers` overwrites everything here.**

One markdown file per client, built from `data/juliusbaer/` alone: no network,
no model, no API key. Rebuild takes about a second.

    npm run dossiers

Outputs `docs/dossiers/CL-XXXX.md` (for humans) and `src/data/fingerprints.json`
(for the app and the TinyFish runner). Both are committed so a teammate can read
them without running anything.

## What a dossier is for

It answers "what is this client actually exposed to, and what should we go and
read about it" — and it is the retrieval context the research layer runs on.

Each file has four parts:

1. **Exposure fingerprint** — weighted elements (region, sector, currency,
   structure, look-through theme, single-name concentration), each with a
   direction of travel across the five snapshots and the rows it came from.
2. **Liquidity / collateral / liabilities** — Daily-sellable vs illiquid, LTV
   traced across all five snapshots against the margin-call trigger, and future
   cash needs converted to USD.
3. **RM notes**, plus automatic flagging where a date spoken in a note
   disagrees with a structured field. Those are surfaced as UNRESOLVED — the
   system asks the RM rather than silently picking one.
4. **Research agenda** — the ranked queries for that client.

## Why the queries look the way they do

The instruments in this dataset are synthetic. `SYN-EQ-0001` /
"Bara Nusantara Energy Tbk" returns nothing from any search engine, ever. So
**no instrument name, ID or issuer ever becomes a query term.**

What is real and researchable is the layer underneath the holding: Hong Kong
property, thermal coal, bank perpetuals, Lombard lending, private credit
gating. All of it derives from structured fields, so every query traces back to
a weighted exposure and the rows that produced it.

The highest-yield mapping is **structure**, not country or sector: the specific
perpetual is invented, but how perpetuals behave — call risk, coupon deferral,
Basel treatment — is documented by the BIS and is genuinely useful to an RM
preparing for a meeting.

## Tiers, and the timeline trap

Queries are tiered `structural` / `forward` / `event`.

**The structural tier is primary, deliberately.** The dataset's 2026 is
fictional: Hormuz is closed, Brent peaked at 114, the Fed chair is Kevin Warsh.
Live search returns a different world. Merging the two would be exactly the
"free-associating about geopolitics in front of a client" the challenge README
warns against. Structural queries are evergreen, so they do not collide with it.

The `event` tier feeds a **candidate queue pending RM approval** and nothing
else. Nothing retrieved is citable until it is approved into the event
registry — `event_log.csv` stays authoritative.

## Extending it

`src/intel/lexicon.js` maps a fingerprint key to queries and preferred sources.
It is hand-authored and versioned on purpose: when a judge asks why the system
searched for Indonesian coal export policy, the answer must be a table row plus
a weighted exposure, not a prompt.

A material exposure with no lexicon row is reported as a **gap** at the end of
the build and printed in the dossier. Add the row; never let the code improvise
one.

## Modules

| file | role |
|---|---|
| `src/intel/themes.js` | instrument + structure → real-world research themes |
| `src/intel/lexicon.js` | fingerprint key → queries + preferred sources |
| `src/intel/fingerprint.js` | household rollup → weighted exposure elements |
| `src/intel/agenda.js` | ranking: exposure weight × tier × dimension quality |
| `src/intel/dossier.js` | markdown renderer |
| `scripts/build-dossiers.js` | the build step |

FX and CSV parsing reuse `src/adapters/jb/fx.js` and `csv.js` rather than
reimplementing them — one FX implementation in the repo, already covered by
`scripts/test-fx.js`.
