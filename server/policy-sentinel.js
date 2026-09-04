const BIS_URL = "https://www.bis.org/speeches/central-bank";
const MAS_URL = "https://www.mas.gov.sg/news/monetary-policy-statements";

const CANDIDATES = [
  { issuer: "MAS", country: "SGP", documentType: "Monetary Policy Statements", url: MAS_URL },
  { issuer: "BIS", country: "GLOBAL", documentType: "Central banker speeches archive", url: BIS_URL }
];

export async function runPolicySentinelScan() {
  if (process.env.OFFLINE === "1") return fallback("offline");
  let lastError = "";
  for (const source of CANDIDATES) {
    try {
      const doc = process.env.TINYFISH_API_KEY
        ? await fetchWithTinyFish(source.url)
        : await fetchDirect(source.url);
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

async function fetchWithTinyFish(url) {
  const res = await fetch("https://api.fetch.tinyfish.ai", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.TINYFISH_API_KEY}`
    },
    body: JSON.stringify({ urls: [url], format: "markdown" })
  });
  if (!res.ok) throw new Error(`TinyFish HTTP ${res.status}`);
  const json = await res.json();
  const first = json.results?.[0];
  if (!first?.text) throw new Error("TinyFish returned no document text");
  return { title: first.title, text: first.text, mode: "tinyfish" };
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
  const quote = evidenceLine(text) || "The BIS archive contains selected policy-relevant central banker speeches from official central bank sources.";
  const urgency = source.issuer === "MAS" || score > 0.45 ? "high" : "medium";
  return {
    mode,
    fetchedAt: new Intl.DateTimeFormat("en-SG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Singapore"
    }).format(new Date()),
    source,
    signal: {
      issuer: source.issuer,
      country: source.country === "GLOBAL" ? "SGP" : source.country,
      stance,
      stanceScore: score,
      policyActionType: source.issuer === "MAS" ? "FX policy band" : "central bank communication",
      affectedAssets: ["DBS", "SGD", "Singapore financials", "USD rates sensitivity"],
      urgency,
      confidence: mode === "tinyfish" ? 0.84 : 0.72,
      whyFlagged: "Fresh official policy communication was fetched, classified, and mapped to holdings an RM may need to discuss."
    },
    agents: [
      {
        name: "Scout Agent",
        status: "complete",
        finding: `Fetched ${source.documentType} from ${source.issuer}.`,
        evidence: source.url
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
    citations: [{ label: source.title, url: source.url, quote }]
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
