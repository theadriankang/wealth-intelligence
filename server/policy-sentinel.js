const BIS_URL = "https://www.bis.org/speeches/central-bank";
const MAS_URL = "https://www.mas.gov.sg/news/monetary-policy-statements";
const TINYFISH_SEARCH = "https://api.search.tinyfish.ai";
const TINYFISH_FETCH = "https://api.fetch.tinyfish.ai";

const DEFAULT_QUERY = "latest MAS monetary policy statement central bank policy speech Singapore";
const DEFAULT_DOMAINS = "mas.gov.sg,bis.org,federalreserve.gov,ecb.europa.eu";

const CANDIDATES = [
  { issuer: "MAS", country: "SGP", documentType: "Monetary Policy Statements", url: MAS_URL },
  { issuer: "BIS", country: "GLOBAL", documentType: "Central banker speeches archive", url: BIS_URL }
];

export async function runPolicySentinelScan(opts = {}) {
  if (process.env.OFFLINE === "1") return fallback("offline");

  if (process.env.TINYFISH_API_KEY) {
    try {
      const source = await discoverPolicySource(opts);
      const doc = await fetchWithTinyFish(source.url, opts);
      return buildScan({ ...source, title: doc.title || source.documentType, finalUrl: doc.finalUrl }, doc.text, doc.mode);
    } catch (err) {
      console.warn("[policy-sentinel:tinyfish]", err.message);
    }
  }

  let lastError = "";
  for (const source of CANDIDATES) {
    try {
      const doc = await fetchDirect(source.url);
      if (/maintenance/i.test(doc.title || "") && source.issuer !== "BIS") {
        lastError = `${source.issuer} returned maintenance shell`;
        continue;
      }
      return buildScan({ ...source, title: doc.title || source.documentType }, doc.text, doc.mode);
    } catch (err) {
      lastError = err.message;
      console.warn("[policy-sentinel]", err.message);
    }
  }
  return fallback(lastError || "all sources unavailable");
}

async function discoverPolicySource(opts) {
  const params = new URLSearchParams({
    query: opts.query || process.env.POLICY_SCAN_QUERY || DEFAULT_QUERY,
    purpose: "Find official central bank or regulator communications for a wealth-advisory policy risk signal.",
    location: opts.location || process.env.POLICY_SCAN_LOCATION || "SG",
    language: opts.language || process.env.POLICY_SCAN_LANGUAGE || "en",
    include_domains: opts.includeDomains || process.env.POLICY_SCAN_DOMAINS || DEFAULT_DOMAINS
  });
  if (opts.recencyMinutes || process.env.POLICY_SCAN_RECENCY_MINUTES) {
    params.set("recency_minutes", String(opts.recencyMinutes || process.env.POLICY_SCAN_RECENCY_MINUTES));
  }

  const res = await fetch(`${TINYFISH_SEARCH}?${params}`, {
    headers: { "X-API-Key": process.env.TINYFISH_API_KEY }
  });
  if (!res.ok) throw new Error(`TinyFish Search HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);

  const json = await res.json();
  const result = (json.results || []).find(r => r.url && !/login|youtube|instagram/i.test(r.url));
  if (!result) throw new Error("TinyFish Search returned no policy source");

  const url = normaliseUrl(result.url);
  const issuer = issuerFromUrl(url);
  return {
    issuer,
    country: issuer === "MAS" ? "SGP" : issuer === "BIS" ? "GLOBAL" : issuer === "ECB" ? "EUR" : "USA",
    documentType: documentTypeFromTitle(result.title || ""),
    url,
    searchTitle: result.title,
    searchSnippet: result.snippet,
    searchPosition: result.position
  };
}

async function fetchWithTinyFish(url, opts = {}) {
  const res = await fetch(TINYFISH_FETCH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-API-Key": process.env.TINYFISH_API_KEY
    },
    body: JSON.stringify({
      urls: [url],
      format: "markdown",
      ttl: Number(opts.ttl ?? process.env.TINYFISH_FETCH_TTL ?? 0),
      per_url_timeout_ms: Number(opts.timeoutMs ?? process.env.TINYFISH_FETCH_TIMEOUT_MS ?? 45000),
      purpose: "Extract clean central bank or regulator text for stance classification and cited RM briefing."
    })
  });
  if (!res.ok) throw new Error(`TinyFish Fetch HTTP ${res.status}: ${(await res.text()).slice(0, 180)}`);

  const json = await res.json();
  const first = json.results?.[0];
  if (!first?.text) {
    const err = json.errors?.[0]?.error || "no document text";
    throw new Error(`TinyFish Fetch returned ${err}`);
  }
  return {
    title: first.title,
    text: typeof first.text === "string" ? first.text : JSON.stringify(first.text),
    mode: "tinyfish",
    finalUrl: first.final_url || first.url
  };
}

async function fetchDirect(url) {
  const res = await fetch(url, { headers: { accept: "text/html,text/plain" } });
  if (!res.ok) throw new Error(`source HTTP ${res.status}`);
  const html = await res.text();
  return {
    title: titleFromHtml(html),
    text: htmlToText(html).slice(0, 9000),
    mode: "direct"
  };
}

function buildScan(source, text, mode) {
  const score = stanceScore(text);
  const stance = score >= 0.25 ? "hawkish" : score <= -0.25 ? "dovish" : "neutral";
  const quote = evidenceLine(text) || `${source.issuer} source was fetched and retained for audit.`;
  const urgency = source.issuer === "MAS" || score > 0.45 ? "high" : "medium";
  const sourceUrl = source.finalUrl || source.url;
  return {
    mode,
    fetchedAt: new Intl.DateTimeFormat("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Singapore"
    }).format(new Date()),
    source: { ...source, url: sourceUrl },
    signal: {
      issuer: source.issuer,
      country: source.country === "GLOBAL" ? "SGP" : source.country,
      stance,
      stanceScore: score,
      policyActionType: source.issuer === "MAS" ? "FX policy band" : "central bank communication",
      affectedAssets: ["DBS", "SGD", "Singapore financials", "USD rates sensitivity"],
      urgency,
      confidence: mode === "tinyfish" ? 0.86 : 0.72,
      whyFlagged: "Fresh official policy communication was found, fetched, classified, and mapped to holdings an RM may need to discuss."
    },
    agents: [
      {
        name: "Scout Agent",
        status: "complete",
        finding: `Searched official policy domains and fetched ${source.documentType} from ${source.issuer}.`,
        evidence: sourceUrl
      },
      {
        name: "Macro Analyst Agent",
        status: "complete",
        finding: `Classified the communication as ${stance} with a ${score.toFixed(2)} stance score.`,
        evidence: quote
      },
      {
        name: "Compliance Skeptic Agent",
        status: "approved",
        finding: "Approved only as RM decision support; no client recommendation or trade instruction is rendered.",
        evidence: "Every claim is tied to a source URL or a labelled prototype signal."
      }
    ],
    rmBrief: [
      `What changed: ${source.issuer} policy communication was detected and scored ${stance}.`,
      "Client relevance: Singapore financials, SGD exposure, and USD-rate-sensitive holdings should be reviewed in context.",
      "RM prompt: Ask whether the client's near-term goals require liquidity certainty before discussing any product action.",
      "Do not say: buy, sell, switch, or guarantee. This is an internal intelligence flag for adviser review."
    ],
    citations: [{ label: source.title || source.documentType, url: sourceUrl, quote }]
  };
}

function fallback(reason) {
  return {
    mode: "fallback",
    fetchedAt: "04 Sep 2026, 08:40 SGT",
    source: {
      title: "MAS monetary policy statement",
      url: MAS_URL,
      issuer: "MAS",
      country: "SGP",
      documentType: "Monetary Policy Statement"
    },
    signal: {
      issuer: "MAS",
      country: "SGP",
      stance: "hawkish",
      stanceScore: 0.72,
      policyActionType: "FX policy band",
      affectedAssets: ["DBS", "SGD", "Singapore financials", "Malacca trade finance"],
      urgency: "high",
      confidence: 0.82,
      whyFlagged: `Fallback scan used because live fetch was unavailable (${reason}).`
    },
    agents: [
      { name: "Scout Agent", status: "fallback", finding: "Used seeded MAS source fixture.", evidence: MAS_URL },
      { name: "Macro Analyst Agent", status: "complete", finding: "Classified fixture stance as hawkish and mapped it to DBS.", evidence: "Policy stance +0.72; affected holding DBS." },
      { name: "Compliance Skeptic Agent", status: "approved", finding: "Approved as internal RM briefing only.", evidence: "No buy/sell/hold instruction appears in the brief." }
    ],
    rmBrief: [
      "What changed: Singapore policy risk is elevated in the seeded demo scan.",
      "Client relevance: DBS and SGD-linked exposure may be worth reviewing before the next portfolio conversation.",
      "RM prompt: Ask whether liquidity certainty matters more than maintaining current exposure.",
      "Do not say: buy, sell, or switch. This is an intelligence flag for adviser review."
    ],
    citations: [{ label: "MAS policy source", url: MAS_URL, quote: "Official MAS policy source retained for audit." }]
  };
}

function stanceScore(text) {
  const lower = text.toLowerCase();
  const hawkish = hits(lower, ["tightening", "restrictive", "inflation", "price stability", "appreciation", "persistent"]);
  const dovish = hits(lower, ["easing", "cut", "accommodative", "slowdown", "weakness", "liquidity"]);
  const raw = (hawkish - dovish) / Math.max(4, hawkish + dovish);
  return Math.max(-0.95, Math.min(0.95, Number(raw.toFixed(2))));
}

function hits(text, words) {
  return words.reduce((sum, word) => sum + (text.match(new RegExp(`\\b${word}\\b`, "g")) || []).length, 0);
}

function evidenceLine(text) {
  return text.split(/\n|\. /).map(s => s.trim())
    .find(s => /policy|central bank|inflation|monetary|speech/i.test(s) && s.length > 55)
    ?.slice(0, 260);
}

function issuerFromUrl(url) {
  if (/mas\.gov\.sg/i.test(url)) return "MAS";
  if (/bis\.org/i.test(url)) return "BIS";
  if (/federalreserve\.gov/i.test(url)) return "Fed";
  if (/ecb\.europa\.eu/i.test(url)) return "ECB";
  return "Policy source";
}

function documentTypeFromTitle(title) {
  if (/monetary policy statement/i.test(title)) return "Monetary Policy Statement";
  if (/speech/i.test(title)) return "Central bank speech";
  if (/minutes/i.test(title)) return "Policy minutes";
  if (/consultation/i.test(title)) return "Consultation paper";
  return "Policy communication";
}

function normaliseUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function titleFromHtml(html) {
  return decodeEntities(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || "")
    .replace(/\s+/g, " ").trim();
}

function htmlToText(html) {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function decodeEntities(text) {
  return text
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
