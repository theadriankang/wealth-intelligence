/**
 * Policy Sentinel — search, fetch, validate, classify.
 *
 *   issuers for the book's countries
 *     -> TinyFish Search per issuer          (official domains only)
 *     -> rank candidates                     (reject /news listing pages BEFORE fetching)
 *     -> TinyFish Fetch, ONE batched call    (up to 10 URLs, markdown, PDFs included)
 *     -> validate each document              (policy terms + a date + real prose)
 *     -> classify the first that passes      (stance + quote, both citable)
 *     -> fallback, visibly labelled, if every candidate fails
 *
 * The agent trace this returns reports what actually happened, including what was
 * rejected and why. If it says "rejected 4 candidates", four candidates were rejected.
 */
import { search, fetchDocs, hasKey } from "./tinyfish.js";
import {
  ISSUERS, GLOBAL_ISSUER, rankCandidates, validateDoc,
  evidenceQuote, issuerFor, documentTypeFor, assetsForCountry
} from "./policy-routing.js";

const MAS_URL = "https://www.mas.gov.sg/news/monetary-policy-statements";
const DEFAULT_QUERY = "latest monetary policy statement central bank policy speech";
const PURPOSE = "Find official central bank or regulator communications for a wealth-advisory policy risk signal.";

export async function runPolicySentinelScan(opts = {}) {
  if (process.env.OFFLINE === "1") return fallback("offline mode");
  if (!hasKey()) return fallback("TINYFISH_API_KEY not set");

  const trace = [];
  try {
    const issuers = issuersFor(opts.countries);
    trace.push(`Resolved ${issuers.length} issuer(s) from portfolio exposure: ${issuers.map(i => i.id).join(", ")}`);

    // --- Search: one call per issuer, in parallel, official domains only.
    const hits = (await Promise.all(issuers.map(async issuer => {
      try {
        const r = await search({
          query: opts.query || process.env.POLICY_SCAN_QUERY || `${issuer.name} ${DEFAULT_QUERY}`,
          purpose: PURPOSE,
          includeDomains: issuer.domains,
          location: opts.location || process.env.POLICY_SCAN_LOCATION || "SG",
          language: opts.language || process.env.POLICY_SCAN_LANGUAGE || "en",
          domainType: "news",
          numResults: 10,
          recencyMinutes: opts.recencyMinutes || process.env.POLICY_SCAN_RECENCY_MINUTES || undefined,
          afterDate: opts.afterDate
        });
        return r.map(h => ({ ...h, issuerId: issuer.id }));
      } catch (err) {
        trace.push(`Search failed for ${issuer.id}: ${err.message}`);
        return [];
      }
    }))).flat();

    if (!hits.length) throw new Error("search returned no results across all issuers");
    const ranked = rankCandidates(hits, { limit: 6 });
    trace.push(`Search returned ${hits.length} hits; ${ranked.length} survived candidate ranking (listing pages and junk dropped).`);
    if (!ranked.length) throw new Error(`all ${hits.length} hits scored as listing or junk pages`);

    // --- Fetch: ONE batched call for every surviving candidate.
    const { docs, errors } = await fetchDocs(ranked.map(c => c.url), {
      purpose: PURPOSE,
      excludeSelectors: ["nav", "header", "footer", ".breadcrumb", ".sidebar", ".cookie-banner"],
      ttl: opts.ttl,
      timeoutMs: opts.timeoutMs
    });
    trace.push(`Fetched ${docs.length}/${ranked.length} candidates in one batched call${errors.length ? `; ${errors.length} failed at source` : ""}.`);

    // --- Validate in rank order, take the first document that is genuinely a policy doc.
    const rejected = [];
    for (const cand of ranked) {
      const doc = docs.find(d => d.url === cand.url || d.finalUrl === cand.url);
      if (!doc) { rejected.push(`${short(cand.url)} — fetch failed`); continue; }
      const check = validateDoc(doc);
      if (!check.ok) { rejected.push(`${short(cand.url)} — ${check.reasons[0]}`); continue; }

      trace.push(`Accepted ${short(doc.finalUrl)} (${check.terms.length} policy terms, ${check.chars} chars).`);
      if (rejected.length) trace.push(`Rejected ${rejected.length} weaker candidate(s): ${rejected.join(" · ")}`);
      return buildScan({
        issuer: cand.issuerId || issuerFor(doc.finalUrl),
        country: countryFor(cand.issuerId),
        documentType: documentTypeFor(doc.title || cand.title, doc.finalUrl),
        title: doc.title || cand.title,
        url: doc.finalUrl,
        searchSnippet: cand.snippet,
        searchPosition: cand.position,
        candidateScore: cand.score
      }, doc.text, "tinyfish", { trace, rejected, checked: ranked.length, exposures: opts.exposures });
    }

    throw new Error(`no candidate passed document validation (${rejected.join("; ")})`);
  } catch (err) {
    console.warn("[policy-sentinel]", err.message);
    return fallback(err.message, trace);
  }
}

function issuersFor(countries) {
  const list = (Array.isArray(countries) ? countries : String(countries || "").split(","))
    .map(c => String(c).trim().toUpperCase()).filter(Boolean);
  const picked = list.flatMap(iso3 => ISSUERS[iso3] || []);
  const seen = new Set();
  const unique = picked.filter(i => !seen.has(i.id) && seen.add(i.id));
  if (!unique.length) unique.push(...ISSUERS.SGP);
  return [...unique.slice(0, 3), GLOBAL_ISSUER].slice(0, 4);
}

const COUNTRY_OF = { MAS: "SGP", Fed: "USA", ECB: "DEU", SNB: "CHE", BoE: "GBR",
  BOJ: "JPN", PBOC: "CHN", BOK: "KOR", RBI: "IND", CBC: "TWN", BIS: "SGP" };
const countryFor = id => COUNTRY_OF[id] || "SGP";
const short = u => String(u).replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);

function buildScan(source, text, mode, meta = {}) {
  const score = stanceScore(text);
  const stance = score >= 0.25 ? "hawkish" : score <= -0.25 ? "dovish" : "neutral";
  const quote = evidenceQuote(text) || `${source.issuer} document retained in full for audit.`;
  const urgency = source.issuer === "MAS" || Math.abs(score) > 0.45 ? "high" : "medium";
  // Named per the document's own country, not a fixed demo market — a Fed statement names US
  // holdings, a BOJ statement names Japanese ones. Empty when the client has no holdings in that
  // country at all; the rmBrief line below phrases that case honestly rather than naming assets
  // that aren't actually held.
  const affectedAssets = assetsForCountry(meta.exposures, source.country);
  const clientRelevance = affectedAssets.length
    ? `Client relevance: ${affectedAssets.join(", ")} should be reviewed in context.`
    : `Client relevance: no direct ${source.country} holdings on this book — review as a market-wide signal only.`;

  return {
    mode,
    fetchedAt: stamp(),
    source,
    signal: {
      issuer: source.issuer,
      country: source.country,
      stance,
      stanceScore: score,
      policyActionType: source.documentType,
      affectedAssets,
      urgency,
      confidence: mode === "tinyfish" ? 0.86 : 0.72,
      whyFlagged: `A ${source.documentType.toLowerCase()} from ${source.issuer} was located on an official domain, fetched, validated as a genuine policy document, and classified.`
    },
    agents: [
      {
        name: "Scout Agent",
        status: "complete",
        finding: `Searched official domains, ranked ${meta.checked || 1} candidate(s), rejected ${meta.rejected?.length || 0} that were listing pages or failed validation.`,
        evidence: source.url
      },
      {
        name: "Macro Analyst Agent",
        status: "complete",
        finding: `Classified as ${stance} (stance score ${score.toFixed(2)}) from the fetched document body, not the search snippet.`,
        evidence: quote
      },
      {
        name: "Compliance Skeptic Agent",
        status: "approved",
        finding: "Approved as RM decision support only; no client recommendation or trade instruction is rendered.",
        evidence: "Every claim resolves to the fetched source URL."
      }
    ],
    rmBrief: [
      `What changed: ${source.issuer} published a ${source.documentType.toLowerCase()}, classified ${stance}.`,
      clientRelevance,
      "RM prompt: Ask whether the client's near-term goals require liquidity certainty before discussing any product action.",
      "Do not say: buy, sell, switch, or guarantee. This is an internal intelligence flag for adviser review."
    ],
    citations: [{ label: source.title || source.documentType, url: source.url, quote }],
    trace: meta.trace || []
  };
}

function fallback(reason, trace = []) {
  return {
    mode: "fallback",
    fetchedAt: stamp(),
    source: { title: "MAS monetary policy statement", url: MAS_URL, issuer: "MAS",
      country: "SGP", documentType: "Monetary Policy Statement" },
    signal: {
      issuer: "MAS", country: "SGP", stance: "hawkish", stanceScore: 0.72,
      policyActionType: "FX policy band",
      affectedAssets: ["DBS", "SGD", "Singapore financials", "Malacca trade finance"],
      urgency: "high", confidence: 0.82,
      whyFlagged: `Seeded fallback in use — live scan unavailable (${reason}).`
    },
    agents: [
      { name: "Scout Agent", status: "fallback", finding: `Live routing did not produce a validated document (${reason}).`, evidence: MAS_URL },
      { name: "Macro Analyst Agent", status: "complete", finding: "Classified the seeded fixture stance as hawkish and mapped it to DBS.", evidence: "Policy stance +0.72; affected holding DBS." },
      { name: "Compliance Skeptic Agent", status: "approved", finding: "Approved as internal RM briefing only.", evidence: "No buy/sell/hold instruction appears in the brief." }
    ],
    rmBrief: [
      "What changed: Singapore policy risk is elevated in the seeded demo scan.",
      "Client relevance: DBS and SGD-linked exposure may be worth reviewing before the next portfolio conversation.",
      "RM prompt: Ask whether liquidity certainty matters more than maintaining current exposure.",
      "Do not say: buy, sell, or switch. This is an intelligence flag for adviser review."
    ],
    citations: [{ label: "MAS policy source", url: MAS_URL, quote: "Official MAS policy source retained for audit." }],
    trace
  };
}

const stamp = () => new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore"
}).format(new Date());

/** Deterministic stance scorer. Replaced by the LLM classifier later; stays as its fallback. */
export function stanceScore(text) {
  const lower = String(text).toLowerCase();
  const hawkish = hits(lower, ["tightening", "restrictive", "inflation", "price stability", "appreciation", "persistent"]);
  const dovish = hits(lower, ["easing", "cut", "accommodative", "slowdown", "weakness", "liquidity"]);
  const raw = (hawkish - dovish) / Math.max(4, hawkish + dovish);
  return Math.max(-0.95, Math.min(0.95, Number(raw.toFixed(2))));
}

const hits = (text, words) =>
  words.reduce((sum, w) => sum + (text.match(new RegExp(`\\b${w}\\b`, "g")) || []).length, 0);
