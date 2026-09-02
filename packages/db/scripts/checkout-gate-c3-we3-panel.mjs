// W-E3 mutant panel for checkout-gate-c3's `c3.54` — a COMMITTED drill, not a scratch harness.
//
// WHAT IT PROVES. `c3.54` pins `clara.firm_admissions` across the C-3 file's own run: the column
// list, the index set, and an `id -> md5(row)` fingerprint MAP of every row that existed when the
// file started (it deliberately holds NO global row count — CI runs every workspace package
// concurrently against one database, and packages/runtime commits admission rows of its own, so a
// count moves for reasons that have nothing to do with C-3). This drill proves the cell still
// catches a MIGRATION-SHAPED rewrite of that table:
//
//   M-A  add a column                    -> the column list moves
//   M-B  drop uq_firm_admissions_token_hash -> the index set moves
//   M-C  bulk-update every existing row  -> the fingerprint map moves
//
// Each mutation is applied FROM A SEPARATE CONNECTION WHILE THE FILE IS RUNNING, so the shipped
// cell executes the gate itself rather than a copy of its predicate, and every mutation is
// reverted before the next run.
//
// WHY THE INJECTION IS TIMED, AND NOT A CONSTANT. The mutation has to land after the file's
// `before()` hook captures its baseline and before `c3.54` reads it again. The first cut of this
// panel slept a hardcoded 12 s against a file that runs ~12.5 s: all three mutants came back GREEN,
// a FALSE PASS produced by the harness injecting after `c3.54` had already run, not by the cell
// failing to discriminate. That is exactly the class the fold-round panel law names. So the control
// run MEASURES the file's duration first and every mutant injects at INJECT_AT of that measured
// duration — self-calibrating on a slow host or a fast one, with no magic constant to rot.
//
// USAGE (throwaway rig only; it alters the schema and is refused without the destructive flag):
//   PGHOST=… PGPORT=… PGUSER=… PGPASSWORD=… PGDATABASE=… CLARA_ALLOW_DESTRUCTIVE=1 \
//     node packages/db/scripts/checkout-gate-c3-we3-panel.mjs
// Exits 0 only if every mutant reddened `c3.54` and both controls were clean.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "tests/checkout-gate-c3.test.mjs";
const CELL = "c3.54";
/** Fraction of the file's MEASURED duration at which each mutation is injected. */
const INJECT_AT = 0.4;

if (process.env.CLARA_ALLOW_DESTRUCTIVE !== "1") {
  console.error(
    "refusing to run: this drill ALTERs clara.firm_admissions and drops an index.\n"
    + "Point it at a throwaway rig and set CLARA_ALLOW_DESTRUCTIVE=1.",
  );
  process.exit(2);
}

/** The package's own test flags, so the drill runs the file through the same gates CI does. */
function nodeArgsFor(target) {
  const script = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")).scripts.test;
  return script.split(/\s+/).slice(1).filter((a) => a !== "tests/").concat(target);
}

function runTarget() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, nodeArgsFor(TARGET), { cwd: PKG_DIR });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("close", () => {
      const reds = out.split("\n").filter((l) => l.startsWith("not ok "))
        .map((l) => l.replace(/^not ok \d+ - /, "").trim());
      const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, "m")) ?? [])[1] ?? -1);
      resolve({ durationMs: Date.now() - started, reds, tests: num("tests"), pass: num("pass"), fail: num("fail") });
    });
  });
}

async function withClient(fn) {
  const client = new pg.Client();
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}
const exec = (sql) => withClient((c) => c.query(sql));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MUTANTS = [
  {
    name: "M-A  add a column (the column list must move)",
    mutate: "alter table clara.firm_admissions add column w_e3_probe text",
    revert: "alter table clara.firm_admissions drop column w_e3_probe",
  },
  {
    name: "M-B  drop uq_firm_admissions_token_hash (the index set must move)",
    mutate: "drop index clara.uq_firm_admissions_token_hash",
    revert: "create unique index uq_firm_admissions_token_hash "
      + "on clara.firm_admissions using btree (token_hash)",
  },
  {
    name: "M-C  bulk-update every existing row (the fingerprint map must move)",
    mutate: "update clara.firm_admissions set note = coalesce(note,'') || '~w_e3_probe'",
    revert: "update clara.firm_admissions set note = left(note, length(note)-12) "
      + "where note like '%~w_e3_probe'",
  },
];

const failures = [];
const line = (r) => `${r.tests} tests / ${r.pass} pass / ${r.fail} fail`;

console.log("=== control: unmutated, and the run that MEASURES the injection point ===");
const control = await runTarget();
console.log(`    ${line(control)} · duration ${control.durationMs} ms`);
if (control.fail !== 0) failures.push(`control was not clean: ${line(control)} (${control.reds.join("; ")})`);

const injectAtMs = Math.max(1000, Math.round(control.durationMs * INJECT_AT));
console.log(`    injecting each mutation at ${injectAtMs} ms (${INJECT_AT} of the measured duration)\n`);

for (const m of MUTANTS) {
  console.log(`=== ${m.name} ===`);
  const running = runTarget();
  await sleep(injectAtMs);
  await exec(m.mutate);
  const result = await running;
  await exec(m.revert);
  const caught = result.reds.some((r) => r.startsWith(CELL));
  console.log(`    ${line(result)} · ${CELL} ${caught ? "RED (expected)" : "GREEN — NOT CAUGHT"}`);
  for (const r of result.reds) console.log(`      not ok - ${r}`);
  if (!caught) failures.push(`${m.name}: ${CELL} stayed green`);
}

console.log("\n=== final control: every mutation reverted ===");
const final = await runTarget();
console.log(`    ${line(final)}`);
if (final.fail !== 0) failures.push(`final control was not clean: ${line(final)} (${final.reds.join("; ")})`);

if (failures.length) {
  console.error(`\nW-E3 PANEL FAILED:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nW-E3 panel OK — every mutant reddened ${CELL}; both controls clean.`);
