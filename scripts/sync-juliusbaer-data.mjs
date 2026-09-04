import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const repo = "https://github.com/Singhacks-2026/juliusbaer.git";
const checkout = join(tmpdir(), "singhacks-juliusbaer");
const sourceDir = findSource();
const targetDir = join(process.cwd(), "src/adapters/raw/juliusbaer");

const expected = {
  "clients.csv": ["client_id", "client_name", "total_aum_usd", "source_of_wealth"],
  "portfolios.csv": ["portfolio_id", "client_id", "service_model"],
  "holdings.csv": ["client_id", "instrument_id", "snapshot_date", "market_value_usd", "weight_pct"],
  "instruments.csv": ["instrument_id", "instrument_name", "asset_class", "region"],
  "credit_facilities.csv": ["client_id", "margin_call_ltv_pct"],
  "planned_cash_needs.csv": ["client_id", "amount", "currency"],
  "commitments.csv": ["client_id", "uncalled", "currency"],
  "event_log.csv": ["event_date", "event_type", "region", "severity", "primary_transmission"],
  "market_context.csv": ["date"],
  "mandates.csv": ["client_id"],
  "transactions.csv": ["client_id"],
  "rm_notes.json": null
};

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio:"inherit", ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function findSource() {
  if (!existsSync(checkout)) run("git", ["clone", "--depth", "1", repo, checkout]);
  else run("git", ["-C", checkout, "pull", "--ff-only"]);

  const direct = join(checkout, "data");
  if (existsSync(direct)) return direct;

  const stack = [checkout];
  while (stack.length) {
    const dir = stack.pop();
    const names = readdirSync(dir, { withFileTypes:true });
    if (names.some(d => d.name === "clients.csv") && names.some(d => d.name === "holdings.csv")) return dir;
    for (const d of names) if (d.isDirectory() && !d.name.startsWith(".")) stack.push(join(dir, d.name));
  }
  throw new Error("Could not locate Julius Baer CSV/JSON dataset in the repository.");
}

function validateCsv(file, columns) {
  const head = readFileSync(join(sourceDir, file), "utf8").split(/\r?\n/, 1)[0].split(",").map(s => s.trim());
  const missing = columns.filter(col => !head.includes(col));
  if (missing.length) throw new Error(`${file} is missing required columns: ${missing.join(", ")}`);
}

for (const [file, columns] of Object.entries(expected)) {
  const full = join(sourceDir, file);
  if (!existsSync(full)) throw new Error(`Missing expected dataset file: ${file}`);
  if (columns) validateCsv(file, columns);
  if (file.endsWith(".json")) JSON.parse(readFileSync(full, "utf8"));
}

rmSync(targetDir, { recursive:true, force:true });
mkdirSync(targetDir, { recursive:true });
for (const file of Object.keys(expected)) copyFileSync(join(sourceDir, file), join(targetDir, basename(file)));

const sha = spawnSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding:"utf8" }).stdout.trim();
writeFileSync(join(targetDir, "sync-meta.json"), JSON.stringify({
  sourceRepo: repo,
  sourceDirectory: sourceDir,
  commit: sha,
  syncedAt: new Date().toISOString(),
  files: Object.keys(expected)
}, null, 2) + "\n");

console.log(`Synced Julius Baer demo data from ${sha.slice(0, 12)} into ${targetDir}`);
