/**
 * Fixture signals — the offline demo, and the fallback whenever the live feed
 * is unreachable. Shape matches CountrySignal in src/model/schema.js exactly,
 * so live and fixture data are interchangeable everywhere.
 */
const ev = (id, at, source, text, value, endpoint) => ({ id, at, source, text, value, endpoint });

export const SIGNALS = {
  TWN:{ iso3:"TWN", name:"Taiwan", riskDelta:38, instability:68, tone:-3.1, policyStance:0.4,
    chokepoints:["Taiwan Strait","Malacca Strait"], events:[
      ev("twn-1","04 Sep 06:12","World Monitor","Corroborated escalation alert, air-defence identification zone","inst 57 → 68","/v1/country/TW/instability"),
      ev("twn-2","03 Sep 19:40","AIS","Strait transits fell for a third session","−18% vs 30d","/v1/chokepoint/taiwan-strait"),
      ev("twn-3","02 Sep 11:05","GDELT","Coverage tone broke below the 30-day band","−3.1 σ","/api/v2/doc?query=TW")]},
  SAU:{ iso3:"SAU", name:"Saudi Arabia", riskDelta:21, instability:66, tone:-1.6, policyStance:0.3,
    chokepoints:["Hormuz","Bab el-Mandeb"], events:[
      ev("sau-1","04 Sep 05:31","AIS","Hormuz outbound transits down a fourth session","−9% vs 30d","/v1/chokepoint/hormuz"),
      ev("sau-2","03 Sep 14:22","World Monitor","Instability re-rated on Gulf security signals","inst 61 → 66","/v1/country/SA/instability"),
      ev("sau-3","02 Sep 08:15","GDELT","Energy-security coverage tone weakened","−1.6 σ","/api/v2/doc?query=SA")]},
  SGP:{ iso3:"SGP", name:"Singapore", riskDelta:17, instability:14, tone:-0.4, policyStance:2.4,
    chokepoints:["Malacca Strait"], events:[
      ev("sgp-1","03 Sep 23:40","MAS","Policy band statement read hawkish","stance +2.4","mas.gov.sg/news/monetary-policy"),
      ev("sgp-2","04 Sep 04:55","AIS","Malacca northbound queue at nine-month high","41 vessels","/v1/chokepoint/malacca"),
      ev("sgp-3","01 Sep 09:10","World Monitor","Regional trade-finance signal softened","inst 12 → 14","/v1/country/SG/instability")]},
  KOR:{ iso3:"KOR", name:"South Korea", riskDelta:14, instability:41, tone:-0.9, policyStance:1.2,
    chokepoints:["Malacca Strait"], events:[
      ev("kor-1","04 Sep 02:18","AIS","Busan container dwell time extended","+11%","/v1/port/busan"),
      ev("kor-2","03 Sep 10:44","World Monitor","Instability re-rated on regional posture","inst 37 → 41","/v1/country/KR/instability"),
      ev("kor-3","01 Sep 16:30","GDELT","Semiconductor supply coverage tone slipped","−0.9 σ","/api/v2/doc?query=KR")]},
  NLD:{ iso3:"NLD", name:"Netherlands", riskDelta:11, instability:19, tone:-0.6, policyStance:1.8,
    chokepoints:["Suez"], events:[
      ev("nld-1","04 Sep 01:12","AIS","Rotterdam average berth wait extended","+2.4 days","/v1/port/rotterdam"),
      ev("nld-2","02 Sep 13:00","ECB","Statement read hawkish on the deposit path","stance +1.8","bis.org/cbspeeches"),
      ev("nld-3","01 Sep 07:20","World Monitor","Port throughput signal flagged amber","inst 17 → 19","/v1/country/NL/instability")]},
  CHN:{ iso3:"CHN", name:"China", riskDelta:9, instability:49, tone:-1.2, policyStance:-1.6,
    chokepoints:["Taiwan Strait","Malacca Strait"], events:[
      ev("chn-1","03 Sep 12:00","World Monitor","Instability re-rated on cross-strait posture","inst 44 → 49","/v1/country/CN/instability"),
      ev("chn-2","28 Aug 09:00","PBoC","Reserve requirement ratio cut by 25bp","stance −1.6","bis.org/cbspeeches")]},
  BRA:{ iso3:"BRA", name:"Brazil", riskDelta:6, instability:37, tone:-0.3, policyStance:-0.8,
    chokepoints:["Panama Canal"], events:[
      ev("bra-1","03 Sep 08:40","AIS","Tubarão loading rates softened","−4%","/v1/port/tubarao")]},
  JPN:{ iso3:"JPN", name:"Japan", riskDelta:3, instability:16, tone:0.1, policyStance:-2.2,
    chokepoints:["Malacca Strait"], events:[
      ev("jpn-1","27 Aug 04:00","BoJ","Held the short-term rate; easy conditions appropriate","stance −2.2","bis.org/cbspeeches")]},
  USA:{ iso3:"USA", name:"United States", riskDelta:-2, instability:21, tone:0.2, policyStance:-0.9,
    chokepoints:["Panama Canal"], events:[
      ev("usa-1","29 Aug 18:30","Fed","Policy described as well positioned to respond","stance −0.9","bis.org/cbspeeches")]},
  IND:{ iso3:"IND", name:"India", riskDelta:-4, instability:34, tone:0.5, policyStance:0.6,
    chokepoints:["Hormuz"], events:[
      ev("ind-1","02 Sep 06:00","World Monitor","Instability eased","inst 38 → 34","/v1/country/IN/instability")]},
  CHE:{ iso3:"CHE", name:"Switzerland", riskDelta:-5, instability:10, tone:0.6, policyStance:-0.4,
    chokepoints:[], events:[
      ev("che-1","02 Sep 06:00","World Monitor","Instability eased","inst 12 → 10","/v1/country/CH/instability")]},
  DEU:{ iso3:"DEU", name:"Germany", riskDelta:-7, instability:19, tone:0.8, policyStance:1.1,
    chokepoints:["Suez"], events:[
      ev("deu-1","02 Sep 06:00","World Monitor","Instability eased","inst 22 → 19","/v1/country/DE/instability")]},
  GBR:{ iso3:"GBR", name:"United Kingdom", riskDelta:-11, instability:14, tone:1.4, policyStance:0.9,
    chokepoints:["Suez"], events:[
      ev("gbr-1","03 Sep 21:30","World Monitor","Instability fell on North Sea maintenance close-out","inst 18 → 14","/v1/country/GB/instability"),
      ev("gbr-2","02 Sep 10:00","GDELT","Coverage tone improved","+1.4 σ","/api/v2/doc?query=GB")]}
};

/** Last week, for computing the change. Same shape, earlier values. */
export const PREV_SIGNALS = Object.fromEntries(Object.entries(SIGNALS).map(([k, v]) => [k, {
  ...v, riskDelta: Math.round(v.riskDelta * 0.15), events: []
}]));

export const CHOKEPOINTS = [
  { name:"Malacca Strait", lat:2.5,  lng:101.3, status:"strained", detail:"41-vessel queue, nine-month high" },
  { name:"Hormuz",         lat:26.6, lng:56.3,  status:"strained", detail:"Transits −9% over seven days" },
  { name:"Taiwan Strait",  lat:24.5, lng:119.5, status:"strained", detail:"Transits −18% over seven days" },
  { name:"Suez",           lat:30.5, lng:32.35, status:"normal",   detail:"Transit times within band" },
  { name:"Bab el-Mandeb",  lat:12.6, lng:43.3,  status:"normal",   detail:"Transit times within band" },
  { name:"Panama Canal",   lat:9.1,  lng:-79.7, status:"normal",   detail:"Draft restrictions eased" }
];

export const LANES = [
  { sLat:22.6, sLng:120.3, eLat:1.29,  eLng:103.85, hot:true },
  { sLat:1.29, sLng:103.85, eLat:51.95, eLng:4.14,  hot:true },
  { sLat:26.6, sLng:50.1,  eLat:30.0,  eLng:32.5,   hot:true },
  { sLat:35.6, sLng:139.7, eLat:37.8,  eLng:-122.4, hot:false },
  { sLat:-20.3,sLng:-40.3, eLat:31.2,  eLng:121.5,  hot:false }
];

export const POLICY = [
  { date:"03 Sep", who:"MAS",  name:"Monetary Authority of Singapore", stance:2.4, iso3:"SGP",
    excerpt:"Reaffirmed the prevailing rate of appreciation of the policy band, noting <em>persistent</em> imported cost pressure — first stance change since April.", affects:["DBS"] },
  { date:"02 Sep", who:"ECB",  name:"European Central Bank", stance:1.8, iso3:"NLD",
    excerpt:"Governing Council signalled the deposit path stays restrictive <em>for as long as necessary</em>; no cut discussed.", affects:["ASML","MAERSK","SAP"] },
  { date:"01 Sep", who:"BoE",  name:"Bank of England", stance:0.9, iso3:"GBR",
    excerpt:"Split vote, with two members favouring an immediate cut against a majority holding.", affects:["SHEL"] },
  { date:"29 Aug", who:"Fed",  name:"Federal Reserve", stance:-0.9, iso3:"USA",
    excerpt:"Chair described policy as <em>well positioned</em> to respond — a softening from July's language.", affects:["MSFT"] },
  { date:"28 Aug", who:"PBoC", name:"People's Bank of China", stance:-1.6, iso3:"CHN",
    excerpt:"Cut the reserve requirement ratio by 25bp and pledged <em>ample</em> liquidity into year-end.", affects:["BABA"] },
  { date:"27 Aug", who:"BoJ",  name:"Bank of Japan", stance:-2.2, iso3:"JPN",
    excerpt:"Held the short-term rate and reiterated that easy conditions remain appropriate.", affects:["7203"] }
];

export const FEED = [
  ["06:12","World Monitor","Taiwan","escalation alert corroborated, instability 57 → 68","crit"],
  ["05:31","AIS","Hormuz","outbound transits −9% on the week","serious"],
  ["04:55","AIS","Malacca","northbound queue reaches 41 vessels","serious"],
  ["03:47","GDELT","Taiwan","coverage tone −3.1 σ, below 30-day band","crit"],
  ["02:18","AIS","Busan","container dwell time +11%","warn"],
  ["01:12","AIS","Rotterdam","average berth wait +2.4 days","warn"],
  ["23:40","MAS","Singapore","policy band statement classified hawkish","warn"],
  ["22:05","OpenSanctions","Global","daily delta ingested, no new designations","none"],
  ["21:30","World Monitor","United Kingdom","instability 18 → 14 on maintenance close-out","none"]
];

export const LATE_FEED = [
  ["06:44","AIS","Kaohsiung","two outbound departures cancelled","crit"],
  ["06:51","GDELT","South Korea","semiconductor coverage tone −1.4 σ","serious"],
  ["07:03","World Monitor","Saudi Arabia","war-risk premium quote widened 40bp","serious"]
];
