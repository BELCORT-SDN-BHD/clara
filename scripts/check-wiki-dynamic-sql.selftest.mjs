#!/usr/bin/env node
// Self-test for the wiki dynamic-SQL gate (0019 §9's repo half, hardened per ratchet R1
// finding 3: signature-keyed definitions + change-of-record patch analysis).
//
// Runs WITHOUT a database: fixtures under scripts/wiki-lint-fixtures/ stand in for
// migration files (stored as .sql.txt so no migration runner, editor or tree walk ever
// mistakes them for real migrations — they are DATA). The checkers in
// wiki-lint-checks.mjs are pure (source strings in, violations out), so injecting
// fixtures exercises EXACTLY the code the CI gate runs — check-wiki-dynamic-sql.mjs
// wires the same functions to packages/db/migrations.
//
//   node scripts/check-wiki-dynamic-sql.selftest.mjs   # exit 0 green, 1 red
//
// No dependencies — Node built-ins only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scanSources, parseFunctions, parseCoRPatches, functionIdentity, signatureIdentity,
  WIKI_WHITELIST,
} from "./wiki-lint-checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "wiki-lint-fixtures");
const source = (name) => ({ file: name, sql: readFileSync(join(FIXTURES, name), "utf8") });

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}

/** Scan fixtures WITHOUT the whole-tree whitelist-resolution invariant. */
const scan = (...names) =>
  scanSources(names.map(source), { assertWhitelistResolves: false }).findings;

function expectClean(findings) {
  if (findings.length !== 0) {
    throw new Error(`expected NO findings, got ${findings.length}:\n${findings.join("\n")}`);
  }
}
/** Exactly one finding, and it mentions every fragment in `must`. */
function expectFinding(findings, must) {
  if (findings.length !== 1) {
    throw new Error(`expected EXACTLY one finding, got ${findings.length}:\n${findings.join("\n") || "(none)"}`);
  }
  for (const frag of must) {
    if (!findings[0].includes(frag)) {
      throw new Error(`finding does not mention "${frag}":\n${findings[0]}`);
    }
  }
}

// --- the identity extractor (the whitelist's key) ----------------------------
console.log("signature identity:");

testCase("declared args render as the regprocedure type list", () => {
  const got = functionIdentity("get_wiki_page", "p_client uuid, p_slug text");
  if (got !== "get_wiki_page(uuid,text)") throw new Error(`got ${got}`);
});

testCase("modes, defaults and multi-word types are stripped to the bare type", () => {
  const got = functionIdentity("f",
    "p_a uuid, variadic p_b text[], p_c timestamptz default null, p_d bigint = 0, p_e integer");
  if (got !== "f(uuid,text[],timestamp with time zone,bigint,integer)") throw new Error(`got ${got}`);
});

testCase("an unnamed argument is read as a type, not a name", () => {
  const got = functionIdentity("f", "uuid, jsonb, timestamp with time zone");
  if (got !== "f(uuid,jsonb,timestamp with time zone)") throw new Error(`got ${got}`);
});

testCase("a regprocedure literal and a declaration agree on the same identity", () => {
  const a = signatureIdentity("clara.mark_wiki_citations_stale(uuid,uuid,text,text)");
  const b = functionIdentity("mark_wiki_citations_stale",
    "p_client uuid, p_document uuid, p_reason text, p_op_key text");
  if (a !== b) throw new Error(`${a} !== ${b}`);
  if (!WIKI_WHITELIST.has(a)) throw new Error(`${a} is not in the whitelist`);
});

// --- persisted function definitions ------------------------------------------
console.log("persisted function definitions:");

testCase("a non-whitelisted body with dynamic wiki SQL -> REJECT", () => {
  expectFinding(scan("plain-dynamic-wiki.sql.txt"),
    ["_assert_filing_wiki_unreferenced(uuid,uuid,uuid)", "dynamic SQL"]);
});

testCase("the whitelisted signature itself -> OK (dynamic wiki SQL is its job)", () => {
  expectClean(scan("whitelisted-exact.sql.txt"));
});

testCase("a dynamic OVERLOAD of a whitelisted name -> REJECT (signature, not proname)", () => {
  expectFinding(scan("overload-dynamic-wiki.sql.txt"), ["get_wiki_page(uuid,text,text)"]);
});

testCase("the overload does NOT suppress the whitelisted definition, and vice versa", () => {
  const findings = scan("whitelisted-exact.sql.txt", "overload-dynamic-wiki.sql.txt");
  expectFinding(findings, ["get_wiki_page(uuid,text,text)"]);
  if (findings[0].includes("get_wiki_page(uuid,text)  ")) {
    throw new Error("the exact whitelisted signature was flagged");
  }
});

// --- change-of-record patches (the finding-3 hole) ---------------------------
console.log("change-of-record patches:");

testCase("a CoR patch injecting dynamic wiki SQL into a NON-whitelisted target -> REJECT", () => {
  expectFinding(scan("cor-inject-dynamic-wiki.sql.txt"),
    ["change-of-record patch", "clara.retire_document_filing(uuid,text,uuid,text)", "INJECTED"]);
});

testCase("a CoR patch whose fragment mentions wiki but is NOT dynamic -> OK (0019 §1's own shape)", () => {
  expectClean(scan("cor-clean.sql.txt"));
});

testCase("a CoR patch into a WHITELISTED target -> OK", () => {
  expectClean(scan("cor-whitelisted-target.sql.txt"));
});

testCase("a dynamic-DDL `do` block that patches no function -> OK (out of scope, and stays so)", () => {
  expectClean(scan("ddl-do-block.sql.txt"));
});

testCase("the CoR scanner is not vacuous: it finds the patch and resolves its targets", () => {
  const { sql } = source("cor-inject-dynamic-wiki.sql.txt");
  const patches = parseCoRPatches(sql, parseFunctions(sql));
  if (patches.length !== 1) throw new Error(`expected 1 patch, got ${patches.length}`);
  if (patches[0].targets[0] !== "retire_document_filing(uuid,text,uuid,text)") {
    throw new Error(`target resolved as ${patches[0].targets[0]}`);
  }
  if (patches[0].fragments.length === 0) throw new Error("no injected fragments extracted");
});

testCase("a CoR patch inside a function BODY is not double-counted as a patch", () => {
  const sql = "create function clara.f(p_a uuid) returns void language plpgsql as $b$\n"
    + "begin\n  -- do $x$ pg_get_functiondef execute $x$;\n  return;\nend $b$;\n";
  const fns = parseFunctions(sql);
  if (fns.length !== 1) throw new Error(`expected 1 function, got ${fns.length}`);
  if (parseCoRPatches(sql, fns).length !== 0) throw new Error("a body comment was read as a patch");
});

// --- the whole-tree invariant -------------------------------------------------
console.log("whole-tree invariant:");

testCase("a whitelisted signature with no definition anywhere -> REJECT (drift, not a pass)", () => {
  const findings = scanSources([source("whitelisted-exact.sql.txt")]).findings;
  if (!findings.some((f) => f.includes("(whitelist)") && f.includes("mark_wiki_citations_stale"))) {
    throw new Error(`expected an unresolved-whitelist finding, got:\n${findings.join("\n") || "(none)"}`);
  }
});

console.log(failures === 0
  ? "\nwiki-dynamic-sql selftest: OK"
  : `\nwiki-dynamic-sql selftest: FAIL — ${failures} case(s)`);
process.exit(failures === 0 ? 0 : 1);
