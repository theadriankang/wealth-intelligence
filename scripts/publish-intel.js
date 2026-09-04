/**
 * out/intel/*.json  ->  public/intel/*.json
 *
 * The bundles are built by a CLI that runs on one laptop, but the cockpit is a
 * static site. Vite serves public/ at the root and Vercel ships it as static
 * assets, so the browser reads a bundle with a plain fetch — no serverless
 * function in the demo path, nothing to cold-start on stage.
 *
 * Documents carry their full extracted text, which is megabytes we never render.
 * Only the fields the UI reads survive the copy: the excerpt is what a judge
 * sees, and shipping the rest would put ~20MB of scraped prose into the bundle
 * for nothing.
 *
 *   npm run publish-intel
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

const SRC = "out/intel", DEST = "public/intel";
const EXCERPT = 900;

mkdirSync(DEST, { recursive: true });

const files = readdirSync(SRC).filter(f => f.endsWith(".json")).sort();
const index = [];
let bytesIn = 0, bytesOut = 0;

for (const f of files) {
  const raw = readFileSync(`${SRC}/${f}`, "utf8");
  bytesIn += raw.length;
  const b = JSON.parse(raw);

  for (const o of b.context.observations) {
    if (o.lane !== "doc" || !o.doc) continue;
    const text = o.doc.text || o.doc.excerpt || "";
    o.doc = {
      title: o.doc.title, url: o.doc.url, final_url: o.doc.final_url,
      language: o.doc.language,
      excerpt: text.slice(0, EXCERPT).trim(),
      full_chars: text.length          // stated, so a trimmed excerpt is never mistaken for the whole document
    };
  }

  const out = JSON.stringify(b);
  bytesOut += out.length;
  writeFileSync(`${DEST}/${f}`, out);

  const obs = b.context.observations;
  index.push({
    client_id: b.client_id,
    name: b.authoritative.client.name,
    snapshot: b.authoritative.snapshot,
    docs: obs.filter(o => o.lane === "doc").length,
    quant: obs.filter(o => o.lane === "quant").length,
    generated_at: b.generated_at
  });
}

writeFileSync(`${DEST}/index.json`, JSON.stringify(index, null, 1));

const mb = n => (n / 1048576).toFixed(1);
console.log(`\npublished ${files.length} bundle(s) -> ${DEST}/`);
console.log(`  ${mb(bytesIn)}MB in -> ${mb(bytesOut)}MB out (documents trimmed to ${EXCERPT} chars)`);
console.log(`  ${index.reduce((n, c) => n + c.docs, 0)} docs · ${index.reduce((n, c) => n + c.quant, 0)} series\n`);
