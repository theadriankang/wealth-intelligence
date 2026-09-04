/**
 * Fingerprint element -> research agenda.
 *
 * Hand-authored and versioned. NOT generated at runtime: when a judge asks
 * "why did the system search for Indonesian coal export policy?", the answer
 * has to be a table row plus a weighted exposure, not a prompt.
 *
 * Tiers
 *   structural  what drives this exposure in general. Evergreen, cacheable,
 *               reusable across clients, and SAFE against the dataset's
 *               fictional 2026 timeline. This is the primary tier.
 *   forward     what is scheduled: policy calendars, consultations, reviews.
 *   event       what recently happened. Feeds the CANDIDATE queue only; never
 *               a client-facing sentence without RM approval.
 */
export const LEXICON = {
  // ---- regions -------------------------------------------------------
  "region:Hong Kong": { structural: ["Hong Kong residential property price index drivers", "Hong Kong redevelopment project approval and financing"], forward: ["HKMA countercyclical mortgage measures", "Hong Kong stamp duty property measures"], sources: ["hkma.gov.hk", "rvd.gov.hk"] },
  "region:Greater China": { structural: ["Greater China equity market structure and foreign ownership"], forward: ["PBOC policy rate decisions calendar"], sources: ["pboc.gov.cn", "bis.org"] },
  "region:Indonesia": { structural: ["Indonesia coal domestic market obligation and export levy", "Indonesia capital controls and repatriation rules"], forward: ["Bank Indonesia policy rate decisions"], sources: ["bi.go.id", "esdm.go.id"] },
  "region:Singapore": { structural: ["Singapore residential property additional buyer stamp duty", "MAS loan-to-value limits residential property"], forward: ["MAS monetary policy statement schedule", "MAS property cooling measures"], sources: ["mas.gov.sg", "iras.gov.sg"] },
  "region:Japan": { structural: ["Bank of Japan yield curve control and JGB market"], forward: ["Bank of Japan policy meeting calendar"], sources: ["boj.or.jp"] },
  "region:Europe": { structural: ["ECB monetary policy transmission euro area"], forward: ["ECB governing council meeting calendar"], sources: ["ecb.europa.eu"] },
  "region:North America": { structural: ["US Treasury yield curve drivers"], forward: ["FOMC meeting calendar and dot plot"], sources: ["federalreserve.gov"] },
  "region:Emerging Markets": { structural: ["emerging market hard currency debt spread drivers"], sources: ["imf.org", "bis.org"] },
  "region:Asia": { structural: ["Asian household wealth allocation and home bias"], sources: ["bis.org"] },
  "region:Asia Pacific": { structural: ["Asia Pacific equity market concentration"], sources: ["bis.org"] },
  "region:Asia ex-Japan": { structural: ["Asia ex-Japan equity earnings drivers"], sources: ["bis.org"] },
  "region:South Asia": { structural: ["India equity foreign portfolio investment rules"], sources: ["rbi.org.in"] },
  "region:Southeast Asia": { structural: ["ASEAN cross-border capital flows"], sources: ["bis.org", "adb.org"] },

  // ---- sectors -------------------------------------------------------
  "sector:Energy": { structural: ["global oil supply and demand balance", "OPEC production quota mechanics"], forward: ["IEA oil market report schedule"], sources: ["iea.org", "opec.org"] },
  "sector:Financials": { structural: ["Basel capital requirements Asian banks", "bank subordinated debt call practice"], sources: ["bis.org"] },
  "sector:Real Estate": { structural: ["commercial real estate valuation lag and cap rates"], sources: ["bis.org", "hkma.gov.hk"] },
  "sector:Information Technology": { structural: ["AI datacentre capital expenditure cycle", "semiconductor supply chain concentration"], sources: ["iea.org", "sia.org"] },
  "sector:Gold": { structural: ["gold demand drivers central bank buying"], sources: ["gold.org", "imf.org"] },
  "sector:Utilities": { structural: ["regulated utility allowed returns and rate sensitivity"], sources: ["bis.org"] },
  "sector:Industrials": { structural: ["global freight and shipping rate drivers"], sources: ["unctad.org"] },
  "sector:Sovereign": { structural: ["sovereign bond duration and inflation risk premium"], sources: ["bis.org"] },
  "sector:Consumer Discretionary": { structural: ["Asian consumer discretionary demand drivers"], sources: [] },
  "sector:Consumer Staples": { structural: ["consumer staples input cost pass-through"], sources: [] },
  "sector:Health Care": { structural: ["healthcare policy and drug pricing risk"], sources: [] },
  "sector:Infrastructure": { structural: ["infrastructure asset inflation linkage and concession risk"], sources: ["adb.org"] },
  "sector:Corporate": { structural: ["investment grade credit spread drivers"], sources: ["bis.org"] },
  "sector:Equity Long Short": { structural: ["equity long short net exposure and crowding"], sources: [] },
  "sector:Macro": { structural: ["global macro hedge fund positioning"], sources: [] },

  // ---- structures: mechanics are real even when the instrument is not --
  "theme:bank perpetual / AT1": { structural: ["AT1 perpetual call risk and extension", "bank perpetual coupon deferral mechanics", "Basel III treatment of additional tier 1 capital"], sources: ["bis.org"] },
  "theme:accumulator structures": { structural: ["equity accumulator payoff knock-out and double-up risk", "accumulator suitability private banking regulation"], sources: ["sfc.hk", "mas.gov.sg"] },
  "theme:private credit": { structural: ["private credit fund gating and redemption suspension", "private credit NAV valuation lag"], event: ["private credit fund gate redemption"], sources: ["iosco.org", "bis.org"] },
  "theme:private equity secondaries": { structural: ["private equity secondary market pricing and discounts", "uncalled commitment capital call mechanics"], sources: ["bis.org"] },
  "theme:single-name concentration": { structural: ["single stock concentration risk hedging for private clients"], sources: ["bis.org"] },
  "theme:yield enhancement structures": { structural: ["worst-of fixed coupon note downside risk", "structured product suitability disclosure requirements"], sources: ["sfc.hk", "mas.gov.sg"] },
  "theme:capital protected notes": { structural: ["capital protected note issuer credit risk"], sources: ["sfc.hk"] },
  "theme:hedge fund liquidity terms": { structural: ["hedge fund gates side pockets redemption notice"], sources: ["iosco.org"] },
  "theme:direct property": { structural: ["direct property valuation and transaction liquidity"], sources: ["rvd.gov.hk"] },
  "theme:private real estate": { structural: ["private real estate fund valuation lag"], sources: ["bis.org"] },
  "theme:late-stage venture": { structural: ["late stage venture secondary pricing preference shares"], sources: [] },
  "theme:enterprise software": { structural: ["enterprise software private valuation multiples"], sources: [] },
  "theme:cloud infrastructure": { structural: ["cloud infrastructure capex and depreciation cycle"], sources: [] },
  "theme:AI capex": { structural: ["AI capital expenditure sustainability debate"], sources: [] },
  "theme:energy majors": { structural: ["integrated oil major cashflow breakeven"], sources: ["iea.org"] },
  "theme:offshore oil services": { structural: ["offshore oil services day rates"], sources: ["iea.org"] },
  "theme:tanker shipping": { structural: ["tanker war risk insurance premium", "chokepoint transit volumes and rerouting cost"], sources: ["unctad.org", "iea.org"] },
  "theme:indonesian coal": { structural: ["Newcastle thermal coal price drivers", "Indonesia coal export policy"], sources: ["iea.org", "esdm.go.id"] },
  "theme:hong kong property developers": { structural: ["Hong Kong developer balance sheet and presales"], sources: ["hkma.gov.hk"] },
  "theme:asian bank equity": { structural: ["Asian bank net interest margin sensitivity"], sources: ["bis.org"] },
  "theme:gold": { structural: ["gold price drivers real yields and central bank demand"], sources: ["gold.org"] },

  // ---- currency ------------------------------------------------------
  "currency:HKD": { structural: ["HKD peg convertibility undertaking", "HIBOR SOFR spread mechanics"], sources: ["hkma.gov.hk"] },
  "currency:SGD": { structural: ["MAS SGD NEER policy band mechanics"], sources: ["mas.gov.sg"] },
  "currency:JPY": { structural: ["JPY carry trade and intervention history"], sources: ["boj.or.jp"] },
  "currency:IDR": { structural: ["IDR volatility and Bank Indonesia intervention"], sources: ["bi.go.id"] },
  "currency:EUR": { structural: ["EUR rate differential drivers"], sources: ["ecb.europa.eu"] },
  "currency:CHF": { structural: ["CHF safe haven flows SNB policy"], sources: ["snb.ch"] },

  // ---- collateral / liabilities / rates --------------------------------
  "collateral:lombard": { structural: ["Lombard lending advance rates and haircut policy", "margin call practice private banking collateral"], sources: ["bis.org", "finma.ch"] },
  "liability:property": { structural: ["residential property purchase deposit timing and financing"], forward: ["property cooling measures"], sources: ["mas.gov.sg", "hkma.gov.hk"] },
  "liability:tax": { structural: ["capital gains tax treatment of founder share sale"], sources: ["iras.gov.sg"] },
  "liability:trust": { structural: ["family trust funding and settlor considerations"], sources: [] },
  "liability:capital call": { structural: ["private fund capital call default consequences"], sources: [] },
  "liability:education": { structural: ["international education cost inflation"], sources: [] },
  "liability:philanthropy": { structural: ["charitable foundation funding structures"], sources: [] },
  "liability:other": { structural: ["private client cash flow planning horizon"], sources: [] },
  "rate:long duration": { structural: ["long duration bond price sensitivity to yields"], forward: ["FOMC calendar", "ECB calendar"], sources: ["federalreserve.gov", "ecb.europa.eu", "bis.org"] },
};

export const lookup = (key) => LEXICON[key] || null;
