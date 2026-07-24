#!/usr/bin/env node
// Wiki dynamic-SQL gate — the REPO half of the 0019 §9 wiki-authority defence.
//
// Migration 0019's in-transaction tail scans EVERY clara function body and fails if a
// non-whitelisted body NAMES one of the seven wiki relations or CALLS a wiki-touch
// function. That scan is a raw `prosrc` token scan and it has one structural blind spot
// the DB cannot close (0019 header, amendment 7):
//
//   DYNAMIC SQL. `execute format('... clara.%I ...', t)` or `execute 'wiki' || '_pages'`
//   constructs a relation name at run time, so no word-bounded literal ever appears in
//   prosrc and the tail passes. The original R2-F2 defect was exactly this shape one
//   level up — the authority bodies named only a helper while the helper held the reads.
//
// This gate is that missing half. The rule, the two scanned populations (persisted
// function definitions keyed by FULL SIGNATURE, and change-of-record `do` patches),
// and what is deliberately out of scope all live in ./wiki-lint-checks.mjs, which holds
// the pure checkers. This file is only the filesystem wiring; the self-test
// (check-wiki-dynamic-sql.selftest.mjs) injects fixtures into the same functions.
//
// SCOPE: packages/db/migrations/*.sql. No dependencies — Node built-ins only.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanSources, DYNAMIC_SQL_ALLOWLIST } from "./wiki-lint-checks.mjs";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)), "..", "packages", "db", "migrations");

function main() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const sources = files.map((file) => ({
    file, sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
  }));

  const { findings, scanned } = scanSources(sources);

  if (findings.length > 0) {
    console.error("wiki-dynamic-sql: FAIL — dynamic wiki SQL outside the wiki-touch whitelist:\n");
    console.error(findings.join("\n"));
    console.error(
      "\nA constructed relation name is invisible to migration 0019's prosrc token scan, so the"
      + "\nwiki authority boundary (WB-R21) would be unenforceable. The rule is FAIL-CLOSED: a"
      + "\npersistent EXECUTE passes only when its statement is reconstructible from string"
      + "\nliterals AND that text does not mention wiki. So either write the statement as plain"
      + "\nSQL (the DB tail can then see the relation), build it from literals only, or move the"
      + "\nread into a whitelisted wiki verb."
      + "\nWidening WIKI_WHITELIST is a CONTRACT change, not a lint fix — and it is keyed by exact"
      + "\nSIGNATURE, so an overload of a whitelisted name is a NEW function, never covered."
      + "\nA statement that is genuinely non-wiki but not reconstructible needs an explicit,"
      + "\njustified DYNAMIC_SQL_ALLOWLIST entry in scripts/wiki-lint-checks.mjs — never a"
      + "\nloosened pattern. No entry can excuse SQL that provably names wiki.",
    );
    return 1;
  }
  const waivers = [...DYNAMIC_SQL_ALLOWLIST.keys()];
  console.log(
    `wiki-dynamic-sql: OK — ${scanned.functions} clara function definition(s) and `
    + `${scanned.patches} change-of-record patch(es) scanned, no dynamic wiki SQL outside the whitelist`
    + (waivers.length === 0
      ? " (fail-closed, with NO dynamic-SQL waivers)."
      : `; ${waivers.length} justified dynamic-SQL waiver(s): ${waivers.join(", ")}.`));
  return 0;
}

process.exit(main());
