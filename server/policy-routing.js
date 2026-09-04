/**
 * Pure routing logic for the Policy Sentinel. No network, no keys — so it can be
 * tested on its own and reasoned about by anyone reviewing the evidence chain.
 *
 * Two gates sit between "TinyFish returned something" and "we classified it":
 *   1. scoreCandidate()  — rank search hits BEFORE fetching. A /news listing page is
 *                          not evidence, and taking results[0] is how you end up with one.
 *   2. validateDoc()     — a fetched document must actually read like a policy document
 *                          before any stance is assigned to it.
 * Anything that fails gate 2 is dropped and the next candidate is tried. Only when every
 * candidate fails do we fall back — visibly.
 */

/** ISO3 -> the issuers whose words move that country's assets. */
export const ISSUERS = {
  SGP: [{ id: "MAS", name: "Monetary Authority of Singapore", domains: "mas.gov.sg" }],
  USA: [{ id: "Fed", name: "Federal Reserve", domains: "federalreserve.gov" }],
  DEU: [{ id: "ECB", name: "European Central Bank", domains: "ecb.europa.eu" }],
  NLD: [{ id: "ECB", name: "European Central Bank", domains: "ecb.europa.eu" }],
  CHE: [{ id: "SNB", name: "Swiss National Bank", domains: "snb.ch" }],
  GBR: [{ id: "BoE", name: "Bank of England", domains: "bankofengland.co.uk" }],
  JPN: [{ id: "BOJ", name: "Bank of Japan", domains: "boj.or.jp" }],
  CHN: [{ id: "PBOC", name: "People's Bank of China", domains: "pbc.gov.cn" }],
  KOR: [{ id: "BOK", name: "Bank of Korea", domains: "bok.or.kr" }],
  IND: [{ id: "RBI", name: "Reserve Bank of India", domains: "rbi.org.in" }],
  TWN: [{ id: "CBC", name: "Central Bank of the Republic of China (Taiwan)", domains: "cbc.gov.tw" }]
};

/** Cross-country catch-all: BIS aggregates central banker speeches worldwide. */
export const GLOBAL_ISSUER = { id: "BIS", name: "Bank for International Settlements", domains: "bis.org" };

const DOC_WORDS = /(statement|speech|minutes|circular|notice|consultation|remarks|address|press-release|monetary-policy|mps)/i;
const LISTING_TAIL = /\/(news|media|publications|speeches|statements|press|press-releases|media-releases|monetary-policy-statements)\/?$/i;
const JUNK = /(login|sign-?in|youtube|instagram|twitter|x\.com|linkedin|facebook|\.zip$|\.xlsx?$)/i;

/**
 * Rank a search hit by how likely it is to be a specific document rather than an index page.
 * Higher is better. Negative means do not fetch.
 */
export function scoreCandidate(hit) {
  const url = String(hit?.url || "").toLowerCase();
  const title = String(hit?.title || "").toLowerCase();
  if (!url) return -99;
  if (JUNK.test(url)) return -99;

  // Decide listing-vs-document FIRST. A section root named "monetary-policy-statements"
  // otherwise scores well on every keyword test while being exactly the page we must not cite.
  const isListing = LISTING_TAIL.test(url) ||
    /(all |archive|listing|index|overview|latest news)/.test(title) ||
    /[?&](page|p|start)=/.test(url);

  let s = 0;
  if (/\/(19|20)\d{2}[\/\-_]/.test(url)) s += 3;       // dated path = a specific document
  if (/\.pdf(\?|$)/.test(url)) s += 2;                  // PDFs are text-extracted by Fetch
  if (!isListing) {
    if (DOC_WORDS.test(url)) s += 3;
    if (/\/[a-z0-9\-]{25,}\/?$/.test(url)) s += 1;      // long slug = an article, not a section
  }
  if (DOC_WORDS.test(title)) s += 2;
  if (/\b(19|20)\d{2}\b/.test(title)) s += 1;
  if (url.split("/").filter(Boolean).length <= 2) s -= 2; // bare domain root
  if (isListing) s -= 8;                                  // the exact failure mode we hit today

  s += Math.max(0, 2 - (Number(hit.position) || 10) / 5); // mild deference to rank, never decisive
  return Number(s.toFixed(2));
}

export function rankCandidates(hits, { limit = 6 } = {}) {
  return hits
    .map(h => ({ ...h, score: scoreCandidate(h) }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const POLICY_TERMS = [
  "monetary policy", "inflation", "interest rate", "policy rate", "exchange rate",
  "price stability", "central bank", "macroprudential", "financial stability",
  "tightening", "accommodative", "consultation", "circular", "regulatory"
];

const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

/**
 * Does this fetched document actually read like a policy communication?
 * Rejects listing pages (mostly links, little prose) and boilerplate shells.
 */
export function validateDoc(doc) {
  const text = String(doc?.text || "");
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();

  const terms = POLICY_TERMS.filter(t => lower.includes(t));
  const lines = text.split("\n").filter(l => l.trim());
  const links = (text.match(/\]\(/g) || []).length;
  const linkDensity = lines.length ? links / lines.length : 0;
  const dated = /\b(19|20)\d{2}\b/.test(flat) && MONTHS.test(flat);
  const maintenance = /(under maintenance|temporarily unavailable|enable javascript|access denied)/i.test(lower);

  const reasons = [];
  if (terms.length < 3) reasons.push(`only ${terms.length} policy terms found`);
  if (flat.length < 1200) reasons.push(`too short (${flat.length} chars)`);
  if (linkDensity > 0.45) reasons.push(`link density ${linkDensity.toFixed(2)} — reads as a listing page`);
  if (!dated) reasons.push("no date found in body");
  if (maintenance) reasons.push("maintenance or JS-shell page");

  return { ok: reasons.length === 0, reasons, terms, chars: flat.length, linkDensity: Number(linkDensity.toFixed(2)), dated };
}

/** Pull the sentence a human would quote back as the evidence line. */
export function evidenceQuote(text) {
  return String(text)
    .split(/\n|(?<=\.)\s+/)
    .map(s => s.replace(/[#*>_`\[\]]/g, "").trim())
    .find(s => s.length > 60 && s.length < 400 &&
               /(policy|inflation|rate|monetary|stability|appreciation|tightening|easing)/i.test(s)) || "";
}

export function issuerFor(url, fallback = "Policy source") {
  const u = String(url).toLowerCase();
  const all = [...Object.values(ISSUERS).flat(), GLOBAL_ISSUER];
  return all.find(i => u.includes(i.domains))?.id || fallback;
}

export function documentTypeFor(title = "", url = "") {
  const t = `${title} ${url}`.toLowerCase();
  if (/monetary policy statement|\bmps\b/.test(t)) return "Monetary Policy Statement";
  if (/consultation/.test(t)) return "Consultation paper";
  if (/circular|notice/.test(t)) return "Regulatory circular";
  if (/minutes/.test(t)) return "Policy minutes";
  if (/speech|remarks|address/.test(t)) return "Central bank speech";
  if (/press.?release|media.?release/.test(t)) return "Press release";
  return "Policy communication";
}
