/**
 * ===========================================================================
 *  JULIUS BAER ADAPTER — SingHacks 2026 challenge dataset
 * ===========================================================================
 *
 * This file is the seam only: it pulls the challenge CSVs in as text and hands
 * them to the pure builder in ./jb/build.js. Set ADAPTER = "juliusbaer" in
 * src/config.js and nothing else moves.
 *
 * The mapping itself, and why it is shaped the way it is, is documented at the
 * top of ./jb/build.js. Run `node scripts/validate-jb.js` to exercise the same
 * code path outside the browser.
 */
import { buildJuliusBaer, SNAPSHOTS, TODAY } from "./jb/build.js";

import clients     from "../../data/juliusbaer/clients.csv?raw";
import portfolios  from "../../data/juliusbaer/portfolios.csv?raw";
import holdings    from "../../data/juliusbaer/holdings.csv?raw";
import instruments from "../../data/juliusbaer/instruments.csv?raw";
import mandates    from "../../data/juliusbaer/mandates.csv?raw";
import facilities  from "../../data/juliusbaer/credit_facilities.csv?raw";
import commitments from "../../data/juliusbaer/commitments.csv?raw";
import cashNeeds   from "../../data/juliusbaer/planned_cash_needs.csv?raw";
import market      from "../../data/juliusbaer/market_context.csv?raw";
import events      from "../../data/juliusbaer/event_log.csv?raw";
import notes       from "../../data/juliusbaer/rm_notes.json?raw";

export { SNAPSHOTS, TODAY };

export async function juliusBaerAdapter(opts = {}) {
  return buildJuliusBaer({
    clients, portfolios, holdings, instruments, mandates,
    facilities, commitments, cashNeeds, market, events, notes
  }, opts);
}
