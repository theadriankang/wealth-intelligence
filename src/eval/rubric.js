export const COUNTRY_WEIGHTS = { instability: 0.30, tone: 0.15, policy: 0.10, chokepoint: 0.15, volatility: 0.20, sentinel: 0.10 };
export const COUNTRY_BANDS = { low: 25, elevated: 50, high: 72 };

export const HEALTH_PENALTIES = { goalGap: 0.9, concentration: 1.0, exposure: 0.8, lombard: 12, mandateFit: 0.3 };
export const HEALTH_BANDS = { strong: 75, watch: 50 };

export const CONC_SOFT = 10;
export const CONC_HARD = 12;

export const URGENCY = {
  severityBase: { high: 55, medium: 35, low: 15 },
  horizonMonthsNear: 18,
  horizonBoost: 20,
  trendBoostPerPoint: 1.2
};
export const URGENT_CUTOFF = 65;
export const URGENT_STRIP_MAX = 8;

export const SERIES_BY_ISO = {
  TWN: "tw-tech", KOR: "kospi", CHN: "hscei", SAU: "brent", SGP: "sti",
  NLD: "sx5e", DEU: "sx5e", GBR: "ukx", USA: "spx", JPN: "nky",
  IND: "nifty", BRA: "ibov", CHE: "smi"
};
export const SERIES_FALLBACK = "spx";
