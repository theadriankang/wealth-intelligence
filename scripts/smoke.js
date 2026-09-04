/**
 * Pre-demo smoke test. Run it before you present, and after any merge.
 *
 *   npm run smoke              checks everything that does not need the network
 *   npm run smoke -- --api     also checks the running API (needs `npm run dev:all`)
 *
 * Every check prints PASS or FAIL with the number it actually measured, because
 * "tests passed" is not the same as "the demo will work". The failures are
 * written as what to do about them, not as stack traces.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const API = process.env.SMOKE_API || "http://localhost:8787";
const wantApi = process.argv.includes("--api");

let pass = 0, fail = 0;
const ok  = (name, detail = "") => { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); };
const bad = (name, why)         => { fail++; console.log(`  FAIL  ${name}\n        ${why}`); };
const head = t => console.log(`\n${t}`);

/* ── 1. the pure code ──────────────────────────────────────────────────── */
head("Unit tests");
try {
  const out = execSync("node --test 'src/**/*.test.js' 2>&1", { encoding: "utf8", shell: "/bin/bash" });
  const n = (out.match(/^# pass (\d+)/m) || [])[1];
  const f = (out.match(/^# fail (\d+)/m) || [])[1];
  Number(f) ? bad("node --test", `${f} failing — run 'npm test' to see which`)
            : ok("node --test", `${n} passing`);
} catch (e) {
  const f = (String(e.stdout || "").match(/^# fail (\d+)/m) || [])[1];
  bad("node --test", f ? `${f} failing — run 'npm test'` : "the runner itself failed");
}

/* ── 2. the data the demo reads ────────────────────────────────────────── */
head("Intel bundles (what the Intelligence tab renders)");
const dir = "public/intel";
if (!existsSync(dir)) {
  bad("public/intel", "missing — run: npm run intel -- --frozen && npm run publish-intel");
} else {
  const files = readdirSync(dir).filter(f => /^CL-\d+\.json$/.test(f));
  files.length === 20 ? ok("bundle count", `${files.length} clients`)
                      : bad("bundle count", `${files.length} of 20 — run: npm run publish-intel`);

  let docs = 0, series = 0, empty = [];
  for (const f of files) {
    const b = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const obs = b.context.observations;
    const d = obs.filter(o => o.lane === "doc").length;
    docs += d; series += obs.length - d;
    if (!d) empty.push(f.replace(".json", ""));
  }
  docs   >= 40 ? ok("documents retrieved", `${docs}`) : bad("documents retrieved", `only ${docs} — rebuild: npm run intel -- --live`);
  series >= 100 ? ok("market series", `${series}`)    : bad("market series", `only ${series} — check FRED_API_KEY`);
  empty.length ? bad("clients with no documents", empty.join(", ")) : ok("every client has documents");
}

/* ── 3. the agent and the citation gate — the demo's centrepiece ───────── */
head("Agent walk and citation gate (CL-0014)");
try {
  const { analystWalk } = await import("../src/agent/walk.js");
  const { approve } = await import("../src/agent/tools.js");
  const b = JSON.parse(readFileSync("public/intel/CL-0014.json", "utf8"));

  let w = analystWalk(b);
  w.findings.length ? ok("findings", `${w.findings.length}, ${w.tool_calls} tool calls`)
                    : bad("findings", "none produced — the walk is broken");
  w.citations.length === 0 && w.blocked_citations.length > 0
    ? ok("gate starts closed", `${w.blocked_citations.length} blocked, 0 citable`)
    : bad("gate starts closed", `expected 0 citable and >0 blocked, got ${w.citations.length}/${w.blocked_citations.length}`);

  const doc = b.context.observations.find(o => o.lane === "doc");
  approve(b, doc.id, "smoke");
  w = analystWalk(b);
  w.citations.length === 1
    ? ok("approval opens the gate", "0 citable -> 1 (this is the demo moment)")
    : bad("approval opens the gate", `after approving one document, citable = ${w.citations.length}`);
} catch (e) { bad("agent walk", e.message); }

/* ── 4. the fence — the thing worth defending ──────────────────────────── */
head("The Measure fence");
try {
  const { makeToolbox, FenceError } = await import("../src/agent/tools.js");
  const b = JSON.parse(readFileSync("public/intel/CL-0014.json", "utf8"));
  const { tools } = makeToolbox(b);
  const [c] = tools.list_collateral();

  try { tools.compute_headroom({ ltv: 69.41, trigger: 70 }); bad("refuses bare numbers", "it accepted them"); }
  catch (e) { e instanceof FenceError ? ok("refuses bare numbers") : bad("refuses bare numbers", e.message); }

  try {
    tools.compute_headroom({ ltv: { ...c.ltv, world: "live" }, trigger: c.trigger });
    bad("refuses live values in arithmetic", "it accepted one");
  } catch (e) { e instanceof FenceError ? ok("refuses live values in arithmetic") : bad("refuses live values", e.message); }

  const h = tools.compute_headroom({ ltv: c.ltv, trigger: c.trigger });
  h.ref.startsWith("derived(") ? ok("derived values carry provenance", h.ref.slice(0, 46) + "…")
                               : bad("derived values carry provenance", "ref is " + h.ref);
} catch (e) { bad("fence", e.message); }

/* ── 5. the build the judge will actually load ─────────────────────────── */
head("Production build");
try {
  execSync("npm run build 2>&1", { encoding: "utf8", shell: "/bin/bash" });
  existsSync("dist/index.html") ? ok("vite build", "dist/index.html written")
                                : bad("vite build", "no dist/index.html");
} catch { bad("vite build", "failed — run 'npm run build' to see the error"); }

/* ── 6. the running API (opt-in) ───────────────────────────────────────── */
if (wantApi) {
  head("Live API (npm run dev:all must be running)");
  const get = async (path, init) => {
    const r = await fetch(API + path, { signal: AbortSignal.timeout(20000), ...init });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  try {
    const h = await get("/api/health");
    h.json?.ok ? ok("/api/health", `llm=${h.json.llm}, tinyfish=${h.json.tinyfishKey}`)
               : bad("/api/health", "no ok:true in the response");
    h.json?.llm === "none" && bad("LLM key", "server reports llm=none — the client note will fall back to a template");

    const l = await get("/api/llm", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ system: "Reply only with JSON.", prompt: 'Return {"ok":true}', schema: { type: "object" } }) });
    l.status === 200 ? ok("/api/llm", "model answered")
      : bad("/api/llm", `HTTP ${l.status} — ${l.json?.error || "check ANTHROPIC_API_KEY"}`);
  } catch (e) {
    bad("API", `unreachable at ${API} — start it with 'npm run dev:all' (${e.message})`);
  }
}

console.log(`\n${fail ? "NOT READY" : "READY"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
