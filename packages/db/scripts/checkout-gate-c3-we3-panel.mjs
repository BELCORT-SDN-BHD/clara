// W-E3 mutant panel for checkout-gate-c3's `c3.54` — a COMMITTED drill, not a scratch harness.
//
// WHAT IT PROVES. `c3.54` pins `clara.firm_admissions` across the C-3 file's own run: the column
// list, the index set, and an `id -> md5(row)` fingerprint MAP of every row that existed when the
// file started (it deliberately holds NO global row count — CI runs every workspace package
// concurrently against one database, and packages/runtime commits admission rows of its own, so a
// count moves for reasons that have nothing to do with C-3). This drill proves the cell still
// catches a MIGRATION-SHAPED rewrite of that table:
//
//   M-A  add a column                        -> the column list moves
//   M-B  drop uq_firm_admissions_token_hash  -> the index set moves
//   M-C  bulk-update every existing row      -> the fingerprint map moves
//
// Each mutation is applied FROM A SEPARATE CONNECTION WHILE THE FILE IS RUNNING, so the shipped
// cell executes the gate itself rather than a copy of its predicate, and each is reverted before
// the next run.
//
// WHY THE INJECTION IS TIMED, AND NOT A CONSTANT. The mutation has to land after the file's
// `before()` hook captures its baseline and before `c3.54` reads it again. The first cut of this
// panel slept a hardcoded 12 s against a file that runs ~12.5 s: all three mutants came back GREEN,
// a FALSE PASS produced by the harness injecting after `c3.54` had already run, not by the cell
// failing to discriminate. So the control run MEASURES the file's duration and every mutant injects
// at INJECT_AT of that measured duration — self-calibrating on a slow host or a fast one.
//
// WHY THE RESTORE CHECK IS A BYTE FINGERPRINT, AND NOT A SHAPE COUNT. The first committed cut of
// this drill stripped a CONSTANT 12 characters to undo an 11-character probe suffix. Every note in
// the table silently lost its last real character on every run ('synthetic firm A bootstrap' ->
// '…bootstra'), a NULL note became a literal, the damage compounded per run, and the drill still
// printed "panel OK" — because `c3.54`'s own final control compares against a baseline its own
// `before()` captured in that same run, so the corrupted state IS the baseline. The shape check
// that shipped with it ("7 columns, 2 indexes, 0 probe rows") could not see it: the suffix was
// gone, the shape intact. So: the strip length is derived from the literal, never typed twice, and
// the restore proof is an ABSOLUTE whole-table `id -> md5(row)` fingerprint taken BEFORE the first
// arm and re-compared AFTER the last. A restore check is a byte identity, not a shape count.
//
// USAGE (throwaway rig only; it alters the schema and is refused without the destructive flag):
//   PGHOST=… PGPORT=… PGUSER=… PGPASSWORD=… PGDATABASE=… CLARA_ALLOW_DESTRUCTIVE=1 \
//     node packages/db/scripts/checkout-gate-c3-we3-panel.mjs
// Exits 0 only if every mutant reddened `c3.54`, both controls were clean, AND the table is
// byte-identical to how it started.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoTargetSplit, makeClient, targetLabel } from "../lib/pg.mjs";

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "tests/checkout-gate-c3.test.mjs";
const CELL = "c3.54";
/** Fraction of the file's MEASURED duration at which each mutation is injected. */
const INJECT_AT = 0.4;
/** The probe suffix. Written ONCE: every length below is derived from it, never retyped. */
const PROBE = "~w_e3_probe";

if (process.env.CLARA_ALLOW_DESTRUCTIVE !== "1") {
  console.error(
    "refusing to run: this drill ALTERs clara.firm_admissions and drops an index.\n"
    + "Point it at a throwaway rig and set CLARA_ALLOW_DESTRUCTIVE=1.",
  );
  process.exit(2);
}
// The child suite resolves its connection through lib/pg.mjs, where a DSN URL wins over the libpq
// PG* vars. Going through the same helper — and refusing a split env — is what stops this drill
// mutating one database while the suite it is judging runs on another.
assertNoTargetSplit();

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
  const client = makeClient();
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}
/** Run one statement and return what it actually DID — never discard this. */
const exec = (sql) => withClient(async (c) => {
  const r = await c.query(sql);
  return `${r.command}${r.rowCount === null ? "" : ` ${r.rowCount}`}`;
});
const scalar = (sql) => withClient(async (c) => String(Object.values((await c.query(sql)).rows[0])[0]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ABSOLUTE byte fingerprint of the whole table — the restore proof. */
const fingerprint = () => scalar(
  "select coalesce(md5(string_agg(h, ',' order by h)), 'empty')"
  + "  from (select md5(to_jsonb(t)::text) as h from clara.firm_admissions t) s",
);

const MUTANTS = [
  {
    name: "M-A  add a column (the column list must move)",
    mutate: "alter table clara.firm_admissions add column w_e3_probe text",
    revert: "alter table clara.firm_admissions drop column w_e3_probe",
    reading: "select count(*)::int from pg_attribute where attrelid='clara.firm_admissions'::regclass"
      + " and attnum>0 and not attisdropped",
    readingLabel: "live columns",
  },
  {
    name: "M-B  drop uq_firm_admissions_token_hash (the index set must move)",
    mutate: "drop index clara.uq_firm_admissions_token_hash",
    revert: "create unique index uq_firm_admissions_token_hash "
      + "on clara.firm_admissions using btree (token_hash)",
    reading: "select count(*)::int from pg_index where indrelid='clara.firm_admissions'::regclass",
    readingLabel: "indexes",
  },
  {
    // The revert derives its strip length from PROBE and restores a NULL note through nullif, so a
    // row that had no note does not come back as an empty string. Anything this fails to invert is
    // caught by the absolute fingerprint below rather than shipped as a pass.
    name: "M-C  bulk-update every existing row (the fingerprint map must move)",
    mutate: `update clara.firm_admissions set note = coalesce(note,'') || '${PROBE}'`,
    revert: `update clara.firm_admissions set note = nullif(left(note, length(note) - length('${PROBE}')), '')`
      + ` where note like '%${PROBE}'`,
    reading: `select count(*)::int from clara.firm_admissions where note like '%${PROBE}'`,
    readingLabel: "rows carrying the probe",
  },
];

const failures = [];
const line = (r) => `${r.tests} tests / ${r.pass} pass / ${r.fail} fail`;

console.log(`target: ${targetLabel()}`);
const fpBefore = await fingerprint();
console.log(`table fingerprint BEFORE the panel: ${fpBefore}\n`);

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
  // Print what the mutation actually DID, beside the suite line. An arm that never landed reports
  // a clean suite and reads as a passing control; this is the value that gives it away.
  const applied = await exec(m.mutate);
  const reading = await scalar(m.reading);
  const result = await running;
  const reverted = await exec(m.revert);
  const caught = result.reds.some((r) => r.startsWith(CELL));
  console.log(`    mutation: ${applied} · ${m.readingLabel} while mutated: ${reading} · revert: ${reverted}`);
  console.log(`    ${line(result)} · ${CELL} ${caught ? "RED (expected)" : "GREEN — NOT CAUGHT"}`);
  for (const r of result.reds) console.log(`      not ok - ${r}`);
  if (!caught) failures.push(`${m.name}: ${CELL} stayed green`);
}

console.log("\n=== final control: every mutation reverted ===");
const final = await runTarget();
console.log(`    ${line(final)}`);
if (final.fail !== 0) failures.push(`final control was not clean: ${line(final)} (${final.reds.join("; ")})`);

const fpAfter = await fingerprint();
console.log(`\ntable fingerprint AFTER the panel:  ${fpAfter}`);
if (fpAfter !== fpBefore) {
  failures.push(
    `the table was NOT restored: ${fpBefore} -> ${fpAfter}. A revert did not invert its mutation; `
    + "the suite cannot see this, because c3.54 compares against a baseline taken inside each run.",
  );
}

if (failures.length) {
  console.error(`\nW-E3 PANEL FAILED:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nW-E3 panel OK — every mutant reddened ${CELL}; both controls clean; table byte-identical.`);
