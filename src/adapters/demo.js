/**
 * The fabricated demo book. Realistic in SHAPE, invented in CONTENT.
 * Note JBGEF (a global equity fund) and ASIATECH (an ETF): both carry many
 * country exposures, which is what makes look-through visible in the UI.
 */
import { SIGNALS, PREV_SIGNALS } from "../signals/fixtures/signals.js";

const eq = (iso3, sector, chokepoints = []) => ({
  assetClass: "equity",
  exposures: [{ iso3, weight: 1 }],
  sectors: [{ name: sector, weight: 1 }],
  chokepoints
});

export const INSTRUMENTS = {
  TSM:    { id:"TSM", name:"Taiwan Semiconductor", currency:"USD", ...eq("TWN","Semiconductors",["Taiwan Strait","Malacca Strait"]),
            note:"Fab capacity and the bulk of the mandate's semiconductor value sit inside one strait. Two of three outbound lanes are congested and shore-side instability is rising faster than any other country in the book." },
  "005930":{id:"005930", name:"Samsung Electronics", currency:"KRW", ...eq("KOR","Semiconductors",["Malacca Strait"]),
            note:"Shares the memory and logistics corridor already carrying the Taiwan exposure — the two positions are far less independent than the sector split implies." },
  "2222": { id:"2222", name:"Saudi Aramco", currency:"SAR", ...eq("SAU","Energy",["Hormuz","Bab el-Mandeb"]),
            note:"Roughly four fifths of liftings route through Hormuz. Transit counts have fallen for a fourth session and war-risk quotes are widening." },
  MAERSK: { id:"MAERSK", name:"A.P. Møller – Mærsk", currency:"DKK", ...eq("NLD","Logistics",["Suez"]),
            note:"Rotterdam is the landing point for the Asian lanes flagged above; berth waiting time is the downstream tell that the disruption reached Europe." },
  DBS:    { id:"DBS", name:"DBS Group", currency:"SGD", ...eq("SGP","Financials",["Malacca Strait"]),
            note:"MAS shifted the policy band and Malacca throughput drives regional trade-finance volumes — both inputs moved the same way inside 36 hours." },
  BABA:   { id:"BABA", name:"Alibaba Group", currency:"HKD", ...eq("CHN","Consumer tech",["Taiwan Strait","Malacca Strait"]),
            note:"Cross-strait posture feeds the same regional risk premium already carried by the Taiwan and Korea sleeves." },
  VALE:   { id:"VALE", name:"Vale S.A.", currency:"USD", ...eq("BRA","Materials",["Panama Canal"]),
            note:"Port loading rates softened with no accompanying security signal. A watch item rather than an action item." },
  "7203": { id:"7203", name:"Toyota Motor", currency:"JPY", ...eq("JPN","Industrials",["Malacca Strait"]) },
  RELI:   { id:"RELI", name:"Reliance Industries", currency:"INR", ...eq("IND","Energy",["Hormuz"]) },
  MSFT:   { id:"MSFT", name:"Microsoft", currency:"USD", ...eq("USA","Software") },
  SAP:    { id:"SAP", name:"SAP SE", currency:"EUR", ...eq("DEU","Software",["Suez"]) },
  SREN:   { id:"SREN", name:"Swiss Re", currency:"CHF", ...eq("CHE","Insurance") },
  SHEL:   { id:"SHEL", name:"Shell plc", currency:"GBP", ...eq("GBR","Energy",["Suez"]) },
  NESN:   { id:"NESN", name:"Nestlé S.A.", currency:"CHF", ...eq("CHE","Staples") },
  ASML:   { id:"ASML", name:"ASML Holding", currency:"EUR", ...eq("NLD","Semiconductors",["Suez"]),
            note:"Order book concentration points back at the same Taiwan and Korea fabs, so the European listing understates where the revenue actually sits." },

  /* ---- look-through cases: these are why the model carries country LISTS ---- */
  JBGEF: {
    id:"JBGEF", name:"JB Global Equity Fund", assetClass:"fund", currency:"USD",
    exposures:[
      { iso3:"USA", weight:0.52 }, { iso3:"JPN", weight:0.09 }, { iso3:"GBR", weight:0.07 },
      { iso3:"DEU", weight:0.06 }, { iso3:"CHE", weight:0.05 }, { iso3:"TWN", weight:0.05 },
      { iso3:"KOR", weight:0.04 }, { iso3:"NLD", weight:0.04 }, { iso3:"CHN", weight:0.04 },
      { iso3:"IND", weight:0.04 }
    ],
    sectors:[{name:"Software",weight:0.3},{name:"Semiconductors",weight:0.2},
             {name:"Financials",weight:0.2},{name:"Staples",weight:0.3}],
    chokepoints:["Malacca Strait"],
    note:"A global fund is not a country. Its 5% Taiwan sleeve is invisible on the statement and shows up here because the model looks through to constituents."
  },
  ASIATECH: {
    id:"ASIATECH", name:"Asia Technology ETF", assetClass:"etf", currency:"USD",
    exposures:[
      { iso3:"TWN", weight:0.34 }, { iso3:"KOR", weight:0.26 },
      { iso3:"CHN", weight:0.28 }, { iso3:"JPN", weight:0.12 }
    ],
    sectors:[{name:"Semiconductors",weight:0.6},{name:"Consumer tech",weight:0.4}],
    chokepoints:["Taiwan Strait","Malacca Strait"],
    note:"Two thirds of this ETF sits in the two markets already flagged. Held alongside the single-name positions it doubles the same bet."
  }
};

const pos = (o) => Object.entries(o).map(([instrumentId, weightPct]) => ({ instrumentId, weightPct }));

export const PORTFOLIOS = [
{
  id:"ch4471", name:"Bergmann Family Office", ref:"CH-4471", currency:"CHF", aum:"84.2m",
  mandate:"Advisory", riskProfile:"Balanced", riskBand:"8–14% vol", reviewDate:"18 Sep", rm:"A. Kang",
  entities:["Principal account","Bergmann Familienstiftung","Bergmann Beteiligungen AG"],
  householdAum:"197.4m",
  lombard:{ amount:"CHF 14.0m", headroomPct:22, prevHeadroomPct:31, pledgedIds:["TSM","MSFT","SREN"] },
  positions: pos({ MSFT:10.4, SREN:6.3, TSM:7.4, JBGEF:8.2, "2222":5.6, SAP:5.1, SHEL:4.9,
                   BABA:4.6, "005930":4.1, DBS:3.8, "7203":3.4, MAERSK:3.2, VALE:2.9, RELI:2.2 }),
  householdPositions: pos({ MSFT:8.1, SREN:5.1, TSM:9.2, JBGEF:7.4, ASIATECH:5.6, "2222":4.2,
                   SAP:4.0, SHEL:3.6, BABA:6.4, "005930":5.3, DBS:3.0, "7203":2.6, MAERSK:2.4,
                   VALE:2.2, RELI:1.7, ASML:4.4, NESN:3.1 }),
  goals:[
    { id:"g1", name:"Zurich property acquisition", bucket:"liquidity", horizon:"Q2 2027",
      targetLabel:"CHF 12.0m", commitment:"committed",
      baseFunded:96, driverIds:["TSM","005930","DBS"], sensitivity:0.75 },
    { id:"g2", name:"Retirement drawdown", bucket:"longevity", horizon:"from 2034",
      targetLabel:"CHF 240k p.a.", commitment:"planned",
      baseFunded:93, driverIds:["MSFT","SREN","SAP","JBGEF"], sensitivity:0.35 },
    { id:"g3", name:"Foundation commitment", bucket:"legacy", horizon:"2028",
      targetLabel:"CHF 5.0m", commitment:"contracted",
      baseFunded:80, driverIds:["SHEL","2222","VALE"], sensitivity:0.5 },
    { id:"g4", name:"Liquidity reserve", bucket:"liquidity", horizon:"rolling 12m",
      targetLabel:"CHF 3.0m", commitment:"policy",
      baseFunded:100, driverIds:[], sensitivity:0 }
  ],
  actions:[
    { id:"a1", kind:"Trim", title:"Reduce TSM from 7.4% to 4.5%", target:"TSM · Taiwan Semiconductor",
      state:"Drafted",
      why:"Brings single-country Taiwan exposure back inside the 7.0% soft limit and removes the largest single contributor to the property-goal shortfall. Keeps a meaningful position — this is a trim, not an exit.",
      effect:["Property purchase funding <b>+7 pts</b>","Execution <b>~CHF 4.1k</b>","Realised gain <b>CHF 61k</b>, long-term lot"],
      suitability:{ objective:"Serves the 2027 property goal, the client's nearest-dated objective",
        riskFit:"Reduces portfolio volatility toward the middle of the agreed 8–14% band",
        knowledge:"Equity disposal — within demonstrated knowledge and experience",
        concentration:"Resolves the 7.4% vs 7.0% single-country breach flagged 04 Sep",
        costs:"Execution and tax consequence disclosed above" } },
    { id:"a2", kind:"Hedge", title:"Collar the semiconductor sleeve for six months", target:"TSM · 005930",
      state:"Drafted",
      why:"The alternative to trimming if the client wants to keep the position. Caps the drawdown without a disposal, which matters because he has said repeatedly he does not want to sell TSMC.",
      effect:["Drawdown capped at <b>12%</b>, upside to <b>+9%</b>","Premium <b>1.8%</b> of sleeve notional","<b>No disposal</b> — no gain realised"],
      suitability:{ objective:"Protects the same 2027 goal without changing the holding",
        riskFit:"Reduces downside tail; option overlay sits at the edge of a Balanced profile",
        knowledge:"Structured overlay — client declined a similar collar in March 2026 on cost",
        concentration:"Mitigates but does not resolve the concentration breach",
        costs:"Premium disclosed; break-even and cap illustrated in the term sheet" } },
    { id:"a3", kind:"Hold", title:"Hold Aramco and document the rationale", target:"2222 · Saudi Aramco",
      state:"Discussed",
      why:"Hormuz transit counts are down but the position is income-generating, the goal it funds is 2028-dated, and the signal has not broken its longer band. Holding is the recommendation — the record of why is the deliverable.",
      effect:["Foundation commitment <b>unchanged</b>","<b>No cost</b>","Creates the file note for why no action was taken"],
      suitability:{ objective:"Foundation commitment, 2028 — horizon absorbs the current signal",
        riskFit:"No change to portfolio risk", knowledge:"No new instrument involved",
        concentration:"Energy sleeve at 10.5%, inside the 12% limit", costs:"None" } },
    { id:"a4", kind:"Collateral", title:"Restore lombard headroom to 30%", target:"Loan CH-4471-L",
      state:"Drafted",
      why:"Pledged collateral value fell with TSM, taking headroom from 31% to 22%. Substituting pledged NESN for part of the TSM pledge restores the buffer without touching the loan or selling anything.",
      effect:["Headroom <b>22% → 30%</b>","<b>No cost</b>, substitution only","No disposal, no tax event"],
      suitability:{ objective:"Protects against a forced sale that would damage every goal at once",
        riskFit:"Risk-reducing; no change to market exposure",
        knowledge:"Existing lombard facility, terms unchanged",
        concentration:"Unchanged", costs:"None" } }
  ],
  relationship:{
    last:{ date:"22 Aug", channel:"Call, 34 min",
      topics:"Q3 review, foundation pledge timing, Zurich property search" },
    concerns:["Wants the 2027 property purchase progressively de-risked as the date approaches",
      "Cost-sensitive on hedging — declined a collar in March 2026 on premium alone",
      "Has said he will not sell TSMC 'on a headline'"],
    behaviour:"Reads the map, not the spreadsheet. Calls within a day of a major headline and strongly prefers being called first. Responds badly to being told about a problem he already saw on the news.",
    points:["Lead with the goal, not the market: the 2027 property purchase moved down sharply this week.",
      "Name the concentration honestly — three positions plus a fund sleeve, one strait. This is the point he will not have worked out himself.",
      "Bring the trim as the primary option and the collar as the alternative, with the premium quantified up front given March.",
      "Raise the lombard headroom before he finds it on the statement; it is the only item with a hard consequence attached."],
    objections:[
      ["Why didn't you act in August?","The signal that matters — strait transit counts — only broke its band on 2 September. The timeline in the position drawer is timestamped and can be shown as-is."],
      ["Isn't this just headlines?","Coverage tone is one of four inputs and the weakest. The other three are physical or index measures: transit counts, instability, escalation tier."],
      ["I don't want to sell TSMC.","Then the collar keeps the position intact. The premium is 1.8% of the sleeve — expensive relative to March, but the position is larger now and the strait is congested."]]
  }
},
{
  id:"sg2208", name:"Tan Holdings Trust", ref:"SG-2208", currency:"SGD", aum:"41.6m",
  mandate:"Advisory", riskProfile:"Growth", riskBand:"12–20% vol", reviewDate:"09 Sep", rm:"A. Kang",
  entities:["Trust account","Tan Family Investments Pte Ltd"], householdAum:"63.9m",
  lombard:{ amount:"SGD 6.5m", headroomPct:39, prevHeadroomPct:44, pledgedIds:["DBS","MSFT"] },
  positions: pos({ DBS:14.2, TSM:11.6, ASIATECH:9.5, "005930":8.4, BABA:7.9, "7203":5.2, MAERSK:4.4, MSFT:3.1 }),
  householdPositions: pos({ DBS:11.8, TSM:13.9, ASIATECH:8.2, "005930":9.1, BABA:8.6, "7203":4.4,
                            MAERSK:3.7, ASML:5.2, MSFT:2.6, SREN:2.0 }),
  goals:[
    { id:"g1", name:"Next-generation transfer", bucket:"legacy", horizon:"2030",
      targetLabel:"SGD 25.0m", commitment:"planned",
      baseFunded:86, driverIds:["TSM","005930","BABA","ASIATECH"], sensitivity:0.7 },
    { id:"g2", name:"Singapore property acquisition", bucket:"liquidity", horizon:"2027",
      targetLabel:"SGD 8.0m", commitment:"committed",
      baseFunded:94, driverIds:["DBS","MSFT"], sensitivity:0.6 },
    { id:"g3", name:"Education endowment", bucket:"legacy", horizon:"2029",
      targetLabel:"SGD 2.4m", commitment:"contracted",
      baseFunded:96, driverIds:["7203","MAERSK"], sensitivity:0.3 }
  ],
  actions:[
    { id:"a1", kind:"Rebalance", title:"Cut regional technology sleeve from 42% to 28%",
      target:"TSM · 005930 · BABA · ASIATECH", state:"Drafted",
      why:"Four holdings, one region, one supply corridor — and the ETF doubles the single names rather than diversifying them. At this size the sleeve is the transfer goal rather than a part of it.",
      effect:["Transfer goal funding <b>+9 pts</b>","Execution <b>~SGD 9.2k</b>","Realised gain <b>SGD 214k</b>"],
      suitability:{ objective:"Serves the 2030 next-generation transfer",
        riskFit:"Brings volatility to the middle of the 12–20% Growth band",
        knowledge:"Equity and ETF disposals only",
        concentration:"Resolves a 42% look-through regional concentration",
        costs:"Execution and tax disclosed above" } },
    { id:"a2", kind:"Hold", title:"Hold DBS through the policy shift", target:"DBS · DBS Group",
      state:"Discussed",
      why:"A hawkish MAS band is on balance supportive for the position. The Malacca signal cuts the other way but affects volumes rather than margin.",
      effect:["Property goal <b>unchanged</b>","<b>No cost</b>","File note recorded for the review"],
      suitability:{ objective:"2027 Singapore property goal", riskFit:"No change to portfolio risk",
        knowledge:"No new instrument", concentration:"Financials sleeve inside limit", costs:"None" } }
  ],
  relationship:{
    last:{ date:"28 Aug", channel:"WhatsApp thread",
      topics:"Next-gen structuring, education planning for two grandchildren" },
    concerns:["Wants the transfer target hit by 2030 without adding leverage",
      "Prefers regional names she recognises; sceptical of European and US exposure"],
    behaviour:"Fast, informal, decides quickly over messaging but expects the reasoning in writing afterwards. Will forward the note to her son, who asks the harder questions.",
    points:["Open with the transfer goal — it is the one she measures everything against.",
      "The home-bias conversation is now a data conversation: the ETF and the single names are the same bet.",
      "Have the written version ready to forward; the second reader is the one to convince."],
    objections:[
      ["The region has always been where we make money.","Agreed, and the proposal keeps two thirds of the sleeve. What changed is that the holdings stopped being independent of each other."],
      ["Can we wait until the review next week?","We can. The cost of waiting is the transfer goal staying depressed while the strait is congested."]]
  }
},
{
  id:"ch7719", name:"Vogt Pension Vehicle", ref:"CH-7719", currency:"CHF", aum:"128.9m",
  mandate:"Discretionary", riskProfile:"Conservative", riskBand:"4–8% vol", reviewDate:"30 Sep", rm:"M. Reber",
  entities:["Pension vehicle"], householdAum:"128.9m", lombard:null,
  positions: pos({ NESN:11.4, SREN:9.2, SAP:8.6, MSFT:8.1, JBGEF:12.0, SHEL:5.4, "7203":3.6, RELI:2.4 }),
  goals:[
    { id:"g1", name:"Pension obligations", bucket:"obligation", horizon:"2031–2045",
      targetLabel:"CHF 118m", commitment:"contracted",
      baseFunded:104, driverIds:["NESN","SREN","SAP","MSFT","JBGEF"], sensitivity:0.25 },
    { id:"g2", name:"Funding-ratio floor", bucket:"solvency", horizon:"continuous",
      targetLabel:"95% floor", commitment:"policy",
      baseFunded:90, driverIds:["SHEL","7203","RELI"], sensitivity:0.3 }
  ],
  actions:[
    { id:"a1", kind:"Rebalance", title:"Quarterly drift correction, executed", target:"8 positions",
      state:"Executed",
      why:"Discretionary mandate — executed under standing authority on 01 September. Drift had taken equities 1.8pp above the strategic allocation.",
      effect:["Funding ratio <b>+1 pt</b>","Execution <b>CHF 11.4k</b>","Realised gain <b>CHF 96k</b>"],
      suitability:{ objective:"Maintains the strategic allocation underpinning the obligation schedule",
        riskFit:"Returns volatility to the 4–8% Conservative band",
        knowledge:"Standing discretionary authority, no client instruction required",
        concentration:"All sleeves inside limits post-trade",
        costs:"Charged at the agreed discretionary tariff" } },
    { id:"a2", kind:"Hold", title:"No action on energy exposure", target:"SHEL · RELI", state:"Drafted",
      why:"Both positions sit in improving jurisdictions this week. The funding-ratio floor is under mild pressure but that is a duration question, not a geopolitical one.",
      effect:["Funding-ratio floor <b>unchanged</b>","<b>No cost</b>","Recorded for the 30 Sep committee pack"],
      suitability:{ objective:"Funding-ratio floor", riskFit:"No change to portfolio risk",
        knowledge:"No new instrument", concentration:"Energy sleeve inside limit", costs:"None" } }
  ],
  relationship:{
    last:{ date:"14 Aug", channel:"Committee meeting",
      topics:"Annual strategy review, funding ratio, discretionary tariff" },
    concerns:["Committee measures everything against the funding ratio, not against markets",
      "Wants no surprises between quarterly meetings"],
    behaviour:"Institutional. Reads the pack, not the app. Values written rationale and a clean audit trail far above speed.",
    points:["Nothing here requires client contact before 30 September — say so explicitly in the pack.",
      "Lead the committee note with the funding ratio, then the geopolitical exposure as context.",
      "Present the 01 September discretionary rebalance with its suitability record attached."],
    objections:[["Why were we not consulted on the rebalance?","The mandate is discretionary and the trade sits inside the standing authority. The suitability record was generated at execution and is attached."]]
  }
}];

export async function demoAdapter() {
  return {
    instruments: INSTRUMENTS,
    portfolios: PORTFOLIOS,
    signals: SIGNALS,
    prevSignals: PREV_SIGNALS,
    meta: { source: "demo", fabricated: true }
  };
}
