/**
 * Policy Sentinel harness.
 *   node scripts/test-tinyfish.js            offline unit checks (no key needed)
 *   node scripts/test-tinyfish.js --live     full search -> fetch -> validate -> classify
 *   node scripts/test-tinyfish.js --live SGP,USA
 */
import "dotenv/config";
import { scoreCandidate, rankCandidates, validateDoc } from "../server/policy-routing.js";
import { runPolicySentinelScan } from "../server/policy-sentinel.js";
import { hasKey } from "../server/tinyfish.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

console.log("\n— candidate ranking (the /news listing trap) —");
const LISTING = { url: "https://www.mas.gov.sg/news/monetary-policy-statements", title: "Monetary Policy Statements", position: 1 };
const DOCUMENT = { url: "https://www.mas.gov.sg/news/monetary-policy-statements/2026/mas-monetary-policy-statement-july-2026", title: "MAS Monetary Policy Statement - July 2026", position: 4 };
const SPEECH = { url: "https://www.bis.org/review/r260901a.pdf", title: "Governor speech on inflation and price stability", position: 7 };
const JUNKY = { url: "https://www.linkedin.com/posts/mas-policy", title: "MAS policy", position: 2 };

check("specific document outranks the listing page", scoreCandidate(DOCUMENT) > scoreCandidate(LISTING),
  `(doc ${scoreCandidate(DOCUMENT)} vs listing ${scoreCandidate(LISTING)})`);
check("listing page scores negative", scoreCandidate(LISTING) < 0, `(${scoreCandidate(LISTING)})`);
check("social/junk is excluded outright", scoreCandidate(JUNKY) < 0);
check("BIS speech PDF is a viable candidate", scoreCandidate(SPEECH) > 0, `(${scoreCandidate(SPEECH)})`);
const ranked = rankCandidates([LISTING, DOCUMENT, SPEECH, JUNKY]);
check("ranking drops both listing and junk", ranked.length === 2 && ranked[0].url === DOCUMENT.url);

console.log("\n— document validation —");
const REAL = { text: `MAS Monetary Policy Statement, 14 July 2026.\n\n${"The Monetary Authority of Singapore will maintain the prevailing rate of appreciation of the S$NEER policy band. Core inflation has moderated but price stability remains the central consideration for monetary policy over the coming quarters. The interest rate differential and exchange rate path are assessed to be consistent with medium-term price stability. ".repeat(6)}` };
const LISTING_DOC = { text: Array.from({ length: 40 }, (_, i) => `- [Policy statement ${i}](https://mas.gov.sg/x/${i})`).join("\n") };
const SHELL = { text: "Please enable JavaScript to view this site. 2026 January." };

check("a real statement validates", validateDoc(REAL).ok, JSON.stringify(validateDoc(REAL).reasons));
check("a link-list page is rejected", !validateDoc(LISTING_DOC).ok);
check("rejection says why", validateDoc(LISTING_DOC).reasons.length > 0);
check("a JS shell is rejected", !validateDoc(SHELL).ok);

console.log(`\n${fail ? "FAILED" : "PASSED"}  ${pass} passed, ${fail} failed`);

if (process.argv.includes("--live")) {
  const countries = process.argv.find(a => /^[A-Z]{3}(,[A-Z]{3})*$/.test(a)) || "SGP";
  console.log(`\n— live scan (${countries}) — key present: ${hasKey()}`);
  const t0 = Date.now();
  const scan = await runPolicySentinelScan({ countries: countries.split(",") });
  console.log(`mode: ${scan.mode}   ${Date.now() - t0}ms`);
  console.log(`source: ${scan.source.issuer} · ${scan.source.documentType}\n  ${scan.source.url}`);
  console.log(`stance: ${scan.signal.stance} (${scan.signal.stanceScore})   urgency: ${scan.signal.urgency}`);
  console.log(`quote: ${(scan.citations[0]?.quote || "").slice(0, 200)}`);
  console.log("trace:"); (scan.trace || []).forEach(t => console.log(`  · ${t}`));
  if (scan.mode === "fallback") process.exitCode = 1;
}
if (fail) process.exitCode = 1;
