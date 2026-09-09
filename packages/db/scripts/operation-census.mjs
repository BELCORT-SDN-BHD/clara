// OPERATION-CONTRACT CENSUS — the current callable/caller map over Clara's public SQL
// operation boundary, rebuilt from the LIVE catalog and the CURRENT repository sources.
//
// WHY IT IS RECOMPUTED RATHER THAN LISTED. A hand-kept roster of "the doors and who calls
// them" is a comment, and comments do not fail. Every number below is derived on each run:
// the callable side from `pg_proc`/`pg_roles`/`aclexplode` on the connected database, the
// caller side from the repository's own call sites. A function count from an older wave is
// never evidence that this census is complete — the only completeness statement this tool
// makes is "the catalog it read and the files it scanned", both reported in the output.
//
// WHAT IT REFUSES TO INFER.
//   * The migration frontier comes from `clara.schema_migrations` — the LEDGER — and is
//     compared against the migration files on disk. A migration's own "I succeeded" text is
//     never consulted: a green chain is not a landed frontier (packages/db/README.md).
//   * A caller's lane role is resolved LEXICALLY (the enclosing pool wrapper) where the
//     source states it, and falls back to the roles the module itself names. It is never
//     derived from "which role happens to hold the grant" — that would make
//     `called_ungranted` unable to fire at all.
//   * Attribution (`unattributed`) is decided by READING packages/db/tests/rig-meta.mjs's
//     own cohort rosters, not by restating them here.
//
// KNOWN LIMITATION — `granted_uncalled` GROUPS BY BARE NAME. A scanned call site resolves to
// EVERY overload of the name it spells, because choosing one would need overload resolution
// the scanner cannot do, so an uncalled OVERLOAD of an otherwise-called name is NOT reported.
// Measured at frontier 0177: 470 distinct public names, of which exactly three are overloaded
// (consume_egress_dispatch, prepare_egress_dispatch, settle_autodraft_task — two each), and
// every call site of all three is a runtime SQL site with POSITIONAL arguments, so there is no
// named-argument key set to narrow with either. `granted_uncalled` is the one INFORMATIONAL
// label; both HARD labels that read call sites — `called_ungranted` and `named_arg_mismatch` —
// are decided per call site and are unaffected.
//
// OUTPUT. Deterministic: every array is sorted, every object key order is fixed, every path
// is repo-relative with forward slashes. No machine paths, no connection strings, no
// network. `--out <dir>` chooses the destination; the default is a fresh temp directory
// whose path is printed on stdout.
//
// USAGE (from any working directory):
//   PGHOST=… PGPORT=… PGUSER=… PGDATABASE=… \
//     node packages/db/scripts/operation-census.mjs [--out <dir>] [--strict]
//
// `--strict` exits non-zero when an unwaived HARD finding remains. Without it the tool is a
// pure report and always exits 0. The gate that actually runs in CI is
// packages/db/tests/operation-census.test.mjs.
//
// LAYOUT. The census outgrew one file at this repository's 500-line ceiling, so this file is
// the FRONT DOOR only — argument parsing, one connection, two output files — and the work
// lives in `scripts/operation-census/`:
//   scope.mjs     the vocabulary: labels, roles, lane wrappers, the roots that are scanned
//   lexer.mjs     CODE/STRING/COMMENT byte classification and every reader built on it
//   callers.mjs   the web and runtime call-site scans, lane resolution, catalog resolution
//   catalog.mjs   pg_proc/pg_roles/aclexplode, and the ledger-vs-disk frontier
//   findings.mjs  the seven labels, and the one place a finding may be waived
//   render.mjs    the markdown summary and the two output files
//   run.mjs       the order the above run in, and nothing else
// Everything the gate imports is re-exported here, so `../scripts/operation-census.mjs` stays
// the single import path for packages/db/tests/operation-census.test.mjs.

import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { makeClient, isMain } from "../lib/pg.mjs";
import { FINDING_LABELS, HARD_LABELS } from "./operation-census/scope.mjs";
import { runCensus } from "./operation-census/run.mjs";
import { writeCensus } from "./operation-census/render.mjs";

export { FINDING_LABELS, HARD_LABELS, REPO_ROOT } from "./operation-census/scope.mjs";
export { runCensus } from "./operation-census/run.mjs";
export { renderMarkdown, writeCensus } from "./operation-census/render.mjs";
export { diskMigrations } from "./operation-census/catalog.mjs";
export { CODE, COMMENT, STRING, lexSource } from "./operation-census/lexer.mjs";

async function main(argv = process.argv.slice(2)) {
  let outDir = null;
  let strict = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") { outDir = argv[i + 1]; i += 1; continue; }
    if (argv[i] === "--strict") { strict = true; continue; }
    throw new Error(`unknown argument: ${argv[i]} (usage: --out <dir> [--strict])`);
  }
  if (!outDir) outDir = mkdtempSync(join(tmpdir(), "clara-operation-census-"));
  const client = makeClient();
  await client.connect();
  let census;
  const started = Date.now();
  try {
    census = await runCensus({ query: (sql, params) => client.query(sql, params) });
  } finally {
    await client.end();
  }
  const elapsedMs = Date.now() - started;
  const { jsonPath, mdPath } = writeCensus(census, outDir);
  const unwaived = HARD_LABELS.reduce((n, l) => n + census.counts.after_waivers[l], 0);
  console.log(`operation census written to ${jsonPath}`);
  console.log(`operation census summary written to ${mdPath}`);
  console.log(`catalog functions: ${census.scope.catalog_functions}; caller sites: ${census.scope.caller_sites}; elapsed ${elapsedMs}ms`);
  for (const label of FINDING_LABELS) {
    console.log(`  ${label}: ${census.counts.before_waivers[label]} before waivers, ${census.counts.after_waivers[label]} after`);
  }
  if (census.scan_errors.length) {
    console.log(`  scan errors: ${census.scan_errors.map((e) => `${e.file} (${e.reason})`).join(", ")}`);
  }
  if (strict && unwaived > 0) {
    console.error(`${unwaived} unwaived finding(s) in ${HARD_LABELS.join("/")}`);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
