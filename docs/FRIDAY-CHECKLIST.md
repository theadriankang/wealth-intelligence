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

1. Open on **Bergmann**. Goals strip: the 2027 property purchase is down sharply.
2. Click that goal → globe and positions filter to what funds it. *“The map is now a picture of one objective.”*
3. Open **TSM** → look-through table, signal timeline, provenance, house-view tension.
4. Open **JBGEF** → *“this fund is 5% Taiwan and nobody's statement says so.”* ← the banker moment
5. Toggle **Household** → Taiwan 7.8% → 11.5%, crosses the limit. *“Invisible per account.”*
6. **Actions** tab → trim vs. collar, expand a suitability record. Switch to **Vogt** to show
   discretionary behaving differently.
7. **Impact** tab → prepare once, deliver to many.
8. **Generate client note** → footnoted, every claim cited.
9. **Client view** → turn the screen around.

Let a ticker signal land while you talk. Do not narrate the tech stack.

## If something breaks on stage

- Signals down → the badge says `fixtures`; say so and carry on. It is designed for this.
- LLM down → the note still generates from the template. Nobody can tell unless you say.
- Globe won't render (WebGL) → go to the Actions and Impact tabs; the argument survives.
