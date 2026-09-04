/**
 * Fingerprint element -> quantitative series.
 *
 * The deliberate mirror image of lexicon.js. That table turns an exposure into
 * something to READ; this one turns the same exposure into something to MEASURE.
 * Both are hand-authored and versioned for the same reason: when a judge asks
 * "why is this client's brief pulling USDHKD and the 10-year," the answer has to
 * be a table row and a weighted exposure, not a prompt.
 *
 * THE FENCE
 * Every series names its counterpart in the dataset's own market_context.csv.
 * The dataset's 2026 is fictional (Hormuz closed, Brent 101.5, gold 4,622); the
 * live world is not. A live value is therefore only ever shown ALONGSIDE its
 * dataset counterpart, never instead of it, and never inside an arithmetic path.
 * `dataset: null` means we can pull it live but the dataset has no opinion —
 * context only, and it can never become a portfolio number.
 *
 * PROVIDERS
 *   fred:  a FRED series id. Fetched via WorldMonitor's get-fred-series-batch
 *          when a WorldMonitor key is present, else FRED direct. Free either way.
 *   wm:    a WorldMonitor endpoint with no free fallback. If the key is missing
 *          or the endpoint is subscription-gated, this series is reported as a
 *          FAILURE in the bundle. It is never quietly filled in with a guess.
 */

const S = (name, unit, o) => ({ name, unit, ...o });

/** Canonical series catalogue. Keys are ours; ids inside belong to the provider. */
export const SERIES = {
  // ---- rates and macro (FRED-backed, always available) -----------------
  UST_10Y:    S("US Treasury 10-year yield", "percent",      { dataset: "UST_10Y_PCT",        fred: "DGS10" }),
  UST_2Y:     S("US Treasury 2-year yield",  "percent",      { dataset: "UST_2Y_PCT",         fred: "DGS2" }),
  FED_FUNDS:  S("Fed funds target, upper",   "percent",      { dataset: "FED_FUNDS_UPPER_PCT", fred: "DFEDTARU" }),
  // FRED publishes the CPI LEVEL (index 1982-84=100); the dataset publishes
  // year-on-year percent. Printing 332.8 beside 4.0 looks like a bug and invites
  // exactly the wrong question at a booth. The honest fix is not a footnote, it is
  // a declared transform: convert the level to a 12-month change so the two
  // columns measure the same thing. The transform is named in the output.
  US_CPI:     S("US CPI, year-on-year",     "percent",      { dataset: "US_CPI_YOY_PCT", fred: "CPIAUCSL",
                transform: "yoy12",
                note: "Derived from the CPIAUCSL level as a 12-month percent change, to match the dataset's year-on-year convention." }),
  VIX:        S("CBOE Volatility Index",     "points",       { dataset: "VIX",                fred: "VIXCLS" }),
  BRENT:      S("Brent crude",               "USD/barrel",   { dataset: "BRENT_USD_BBL",      fred: "DCOILBRENTEU" }),
  SPX:        S("S&P 500 Index",             "points",       { dataset: "SPX",                fred: "SP500" }),

  // ---- FX (FRED conventions differ from ours; normalised on read) ------
  USDSGD:     S("USD/SGD", "SGD per USD", { dataset: "USDSGD", fred: "DEXSIUS" }),
  USDHKD:     S("USD/HKD", "HKD per USD", { dataset: "USDHKD", fred: "DEXHKUS" }),
  EURUSD:     S("EUR/USD", "USD per EUR", { dataset: "EURUSD", fred: "DEXUSEU" }),
  USDCHF:     S("USD/CHF", "CHF per USD", { dataset: "USDCHF", fred: "DEXSZUS" }),
  USDJPY:     S("USD/JPY", "JPY per USD", { dataset: "USDJPY", fred: "DEXJPUS" }),
  GBPUSD:     S("GBP/USD", "USD per GBP", { dataset: "GBPUSD", fred: "DEXUSUK" }),
  USDCNH:     S("USD/CNH", "CNH per USD", { dataset: "USDCNH", fred: "DEXCHUS",
                note: "FRED quotes onshore CNY; the dataset quotes offshore CNH. Close, not identical." }),
  USDINR:     S("USD/INR", "INR per USD", { dataset: "USDINR", fred: "DEXINUS" }),
  USDTHB:     S("USD/THB", "THB per USD", { dataset: "USDTHB", fred: "DEXTHUS" }),
  USDIDR:     S("USD/IDR", "IDR per USD", { dataset: "USDIDR",
                wm: { svc: "market", rpc: "list-market-quotes", params: { symbols: ["USDIDR=X"] } } }),

  // ---- commodities and indices (WorldMonitor only) --------------------
  GOLD:       S("Gold spot", "USD/troy oz", { dataset: "GOLD_USD_OZ",
                wm: { svc: "market", rpc: "get-gold-intelligence" } }),
  TTF_GAS:    S("Dutch TTF front-month", "EUR/MWh", { dataset: "TTF_GAS_EUR_MWH",
                wm: { svc: "economic", rpc: "get-energy-prices" } }),
  HSI:        S("Hang Seng Index", "points", { dataset: "HSI",
                wm: { svc: "market", rpc: "list-market-quotes", params: { symbols: ["^HSI"] } } }),
  STI:        S("Straits Times Index", "points", { dataset: "STI",
                wm: { svc: "market", rpc: "list-market-quotes", params: { symbols: ["^STI"] } } }),
  NASDAQ:     S("Nasdaq Composite", "points", { dataset: "NASDAQ_COMP",
                wm: { svc: "market", rpc: "list-market-quotes", params: { symbols: ["^IXIC"] } } }),
  MSCI_ASIA:  S("MSCI Asia ex-Japan", "points", { dataset: "MSCI_ASIA_XJP",
                wm: { svc: "market", rpc: "list-market-quotes", params: { symbols: ["AAXJ"] } },
                note: "AAXJ is an ETF proxy for the index, not the index itself." }),

  // ---- context with no dataset counterpart ----------------------------
  EU_CURVE:   S("Euro area AAA sovereign curve", "percent", { dataset: null,
                wm: { svc: "economic", rpc: "get-eu-yield-curve" } }),
  TRADE_RESTRICTIONS: S("Quantitative restrictions and export controls", "events", { dataset: null,
                wm: { svc: "trade", rpc: "get-trade-restrictions" } }),
  TRADE_FLOWS: S("Bilateral merchandise trade flows", "USD", { dataset: null,
                wm: { svc: "trade", rpc: "get-trade-flows" } }),
};

/**
 * fingerprint key -> series keys, most-relevant first.
 *
 * Every row answers "which number would actually move this exposure". A region
 * gets its own index and its currency; a structure gets the rate that prices it;
 * a liability gets the currency it is denominated in and the rate that funds it.
 */
export const QUANT_LEXICON = {
  // regions
  "region:Hong Kong":        ["HSI", "USDHKD"],
  "region:Greater China":    ["HSI", "USDCNH"],
  "region:Singapore":        ["STI", "USDSGD"],
  "region:Indonesia":        ["USDIDR", "BRENT"],
  "region:Japan":            ["USDJPY", "UST_10Y"],
  "region:Europe":           ["EURUSD", "EU_CURVE"],
  "region:North America":    ["SPX", "UST_10Y", "FED_FUNDS"],
  "region:Asia":             ["MSCI_ASIA"],
  "region:Asia ex-Japan":    ["MSCI_ASIA"],
  "region:Asia Pacific":     ["MSCI_ASIA"],
  "region:Southeast Asia":   ["MSCI_ASIA", "USDSGD"],
  "region:South Asia":       ["USDINR"],
  "region:Emerging Markets": ["MSCI_ASIA", "UST_10Y"],

  // sectors
  "sector:Energy":                 ["BRENT", "TTF_GAS"],
  "sector:Financials":             ["UST_10Y", "UST_2Y"],
  "sector:Real Estate":            ["UST_10Y"],
  "sector:Information Technology": ["NASDAQ"],
  "sector:Gold":                   ["GOLD"],
  "sector:Sovereign":              ["UST_10Y", "UST_2Y"],
  "sector:Corporate":              ["UST_10Y"],
  "sector:Utilities":              ["UST_10Y"],
  "sector:Industrials":            ["BRENT"],
  "sector:Macro":                  ["VIX", "UST_10Y"],

  // structures: the mechanic is real even when the instrument is invented
  "theme:bank perpetual / AT1":       ["UST_10Y", "UST_2Y", "VIX"],
  "theme:accumulator structures":     ["VIX"],
  "theme:yield enhancement structures":["VIX"],
  "theme:capital protected notes":    ["UST_2Y"],
  "theme:private credit":             ["UST_10Y", "FED_FUNDS"],
  "theme:private equity secondaries": ["SPX", "UST_10Y"],
  "theme:single-name concentration":  ["VIX"],
  "theme:direct property":            ["UST_10Y"],
  "theme:private real estate":        ["UST_10Y"],
  "theme:hong kong property developers": ["HSI", "USDHKD"],
  "theme:asian bank equity":          ["MSCI_ASIA"],
  "theme:gold":                       ["GOLD"],
  "theme:tanker shipping":            ["BRENT", "TRADE_RESTRICTIONS"],
  "theme:indonesian coal":            ["BRENT", "USDIDR", "TRADE_RESTRICTIONS"],
  "theme:energy majors":              ["BRENT"],
  "theme:offshore oil services":      ["BRENT"],
  "theme:cloud infrastructure":       ["NASDAQ"],
  "theme:AI capex":                   ["NASDAQ"],
  "theme:enterprise software":        ["NASDAQ"],
  "theme:late-stage venture":         ["NASDAQ", "UST_10Y"],

  // currencies
  "currency:HKD": ["USDHKD"],
  "currency:SGD": ["USDSGD"],
  "currency:JPY": ["USDJPY"],
  "currency:IDR": ["USDIDR"],
  "currency:EUR": ["EURUSD"],
  "currency:CHF": ["USDCHF"],
  "currency:GBP": ["GBPUSD"],
  "currency:CNH": ["USDCNH"],
  "currency:INR": ["USDINR"],
  "currency:THB": ["USDTHB"],

  // collateral, liabilities, rates
  "collateral:lombard":     ["FED_FUNDS", "UST_2Y", "VIX"],
  "liability:property":     ["UST_10Y"],
  "liability:tax":          ["UST_2Y"],
  "liability:capital call": ["UST_2Y", "SPX"],
  "liability:trust":        ["UST_2Y"],
  "rate:long duration":     ["UST_10Y", "UST_2Y", "FED_FUNDS", "US_CPI"],

  // gaps closed after the first coverage run: every material exposure across all
  // 20 clients now has a row. A gap is reported, never improvised — but a gap
  // left open is an exposure the agent gets no number for, so we close them.
  "sector:Health Care":            ["SPX"],
  "sector:Consumer Discretionary": ["SPX", "US_CPI"],
  "sector:Consumer Staples":       ["US_CPI", "SPX"],
  "sector:Infrastructure":         ["UST_10Y", "US_CPI"],
  "sector:Equity Long Short":      ["VIX", "SPX"],
  "theme:hedge fund liquidity terms": ["VIX", "SPX"],
  "liability:education":           ["UST_2Y", "US_CPI"],
  "liability:philanthropy":        ["UST_2Y"],
  "liability:other":               ["UST_2Y"],
};

export const seriesFor = (key) => (QUANT_LEXICON[key] || []).map(k => ({ key: k, ...SERIES[k] }));
export const hasQuantRow = (key) => Array.isArray(QUANT_LEXICON[key]) && QUANT_LEXICON[key].length > 0;
