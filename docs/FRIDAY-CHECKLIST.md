# Friday checklist

## Before the reveal (Thursday night)

- [ ] `npm install` on every laptop, on hotel wifi, not conference wifi
- [ ] `npm run dev` works offline with wifi turned off
- [ ] Everyone has run the demo path once end to end
- [ ] Check the T&Cs on pre-existing code and be ready to disclose this scaffold

## In the deep-dive session

Ask these at the booth. The answers matter more than the written brief:

- [ ] Does this sit **inside Wealth Navigator** or beside it?
- [ ] How does it relate to **JAI**? What is it allowed to duplicate?
- [ ] RM-facing, client-facing, or both?
- [ ] Is the **CIO house view** available as data?
- [ ] Do they provide sample portfolios? What identifiers — ISIN or ticker?
- [ ] Do funds come with a **country breakdown**, or only domicile?
- [ ] Any required stack? Any hard compliance framing they want to see?
- [ ] What is the **side challenge** (revealed 14:00) and does it overlap?

## First 60 minutes after the repo drops

1. [ ] Read their schema. Open `src/model/schema.js` beside it.
2. [ ] Fill in `src/adapters/juliusbaer.js` — only the mapping functions.
3. [ ] Set `ADAPTER: "juliusbaer"` in `src/config.js`.
4. [ ] Open the console. `validatePortfolio` names every field that didn't map.
5. [ ] Fix `deriveExposures()` for their instrument types — this is the one that needs judgement.
6. [ ] Check `server/worldmonitor.js` `normalise()` against the real World Monitor response.

Do **not** start by restyling anything. The UI is done; the data mapping is the risk.

## Demo path (rehearse this, five minutes)

- Globe opens on the **AI risk** lens — every country coloured by the model's composite score.
- The **Urgent strip** under the ticker lists the highest-urgency actions across the whole book;
  click one to jump to that client's Actions.
- A client's spine: **Explanation** (health dial + AI-written thesis/summary + a Full-portfolio
  drawer) → **Situation** (the global picture) → **Analysis** (flagged risks & opportunities,
  each with an urgency score and citation count) → **Actions** (RM to-dos, urgent ones pinned,
  each tagged by mandate class).
- The "evaluated Ns ago" stamp by the live clock; the whole book re-scores every 60 s.
- With no LLM key the thesis/summary come from a template — everything else is identical.

Let a ticker signal land while you talk. Do not narrate the tech stack.

## If something breaks on stage

- Signals down → the badge says `fixtures`; say so and carry on. It is designed for this.
- LLM down → the note still generates from the template. Nobody can tell unless you say.
- Globe won't render (WebGL) → go to the Actions and Impact tabs; the argument survives.
