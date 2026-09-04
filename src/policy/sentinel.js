export const FALLBACK_SCAN = {
  mode: "fallback",
  fetchedAt: "04 Sep 2026, 08:40 SGT",
  source: {
    title: "MAS monetary policy statement",
    url: "https://www.mas.gov.sg/news/monetary-policy-statements",
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
    whyFlagged: "The statement keeps policy restrictive while regional shipping stress is already affecting Singapore-linked financial exposure."
  },
  agents: [
    {
      name: "Scout Agent",
      status: "complete",
      finding: "Located the MAS monetary policy source and attached it to the Singapore exposure cluster.",
      evidence: "Official source URL retained for RM audit."
    },
    {
      name: "Macro Analyst Agent",
      status: "complete",
      finding: "Classified the stance as hawkish and mapped it to SGD, Singapore financials, and trade-finance sensitivity.",
      evidence: "Policy stance +0.72; affected holding DBS."
    },
    {
      name: "Compliance Skeptic Agent",
      status: "approved",
      finding: "Approved for internal RM briefing because the output explains exposure review, not buy/sell advice.",
      evidence: "Brief blocks recommendation language and requires adviser review."
    }
  ],
  rmBrief: [
    "What changed: Singapore policy language is restrictive while logistics stress around Malacca remains elevated.",
    "Client relevance: DBS and SGD-linked exposure may be worth reviewing before the next portfolio conversation.",
    "RM prompt: Ask whether the client wants to prioritise liquidity certainty or keep current Singapore financial exposure unchanged.",
    "Do not say: buy, sell, or switch. This is an intelligence flag for adviser review."
  ],
  citations: [
    {
      label: "MAS policy source",
      url: "https://www.mas.gov.sg/news/monetary-policy-statements",
      quote: "Monetary policy statements are official MAS communications."
    }
  ]
};

let lastScan = null;

export const currentPolicyScan = () => lastScan || FALLBACK_SCAN;

export async function runPolicyScan() {
  try {
    const res = await fetch("/api/policy-scan", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const scan = await res.json();
    lastScan = normaliseScan(scan, "live");
  } catch (err) {
    console.warn("[policy-sentinel] live scan failed, using fallback:", err.message);
    lastScan = { ...FALLBACK_SCAN, mode: "fallback", error: err.message };
  }
  return lastScan;
}

export function setPolicyScan(scan) {
  lastScan = normaliseScan(scan, scan?.mode || "fallback");
}

export function stanceLabel(score) {
  if (score >= 0.25) return "hawkish";
  if (score <= -0.25) return "dovish";
  return "neutral";
}

function normaliseScan(scan, mode) {
  if (!scan?.signal) return { ...FALLBACK_SCAN, mode };
  const score = Number(scan.signal.stanceScore || 0);
  return {
    ...FALLBACK_SCAN,
    ...scan,
    mode: scan.mode || mode,
    signal: {
      ...FALLBACK_SCAN.signal,
      ...scan.signal,
      stanceScore: score,
      stance: scan.signal.stance || stanceLabel(score)
    },
    agents: scan.agents?.length ? scan.agents : FALLBACK_SCAN.agents,
    rmBrief: scan.rmBrief?.length ? scan.rmBrief : FALLBACK_SCAN.rmBrief,
    citations: scan.citations?.length ? scan.citations : FALLBACK_SCAN.citations
  };
}
