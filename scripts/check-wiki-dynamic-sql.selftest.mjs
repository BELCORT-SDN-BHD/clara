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
  executeExpressions, staticSqlOf, WIKI_WHITELIST, DYNAMIC_SQL_ALLOWLIST,
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

// R2: the identity edge cases the parser used to get wrong. Each one produced an identity
// that could never equal the `::regprocedure` spelling a whitelist entry is written in.
testCase("an OUT parameter is EXCLUDED — pg_get_function_identity_arguments omits it", () => {
  const got = functionIdentity("f", "p_a uuid, out p_total numeric, inout p_state text");
  if (got !== "f(uuid,text)") throw new Error(`got ${got} (an OUT arg must not become a type)`);
});

testCase("type MODIFIERS are stripped — the catalog never reports one", () => {
  const got = functionIdentity("f",
    "p_a numeric(12,2), p_b varchar(50), p_c character varying(8)[], p_d timestamp(3) with time zone");
  if (got !== "f(numeric,character varying,character varying[],timestamp with time zone)") {
    throw new Error(`got ${got}`);
  }
});

testCase("an argument whose NAME is a type head is still a name", () => {
  const got = functionIdentity("f", "date date, text text, p_x uuid");
  if (got !== "f(date,text,uuid)") throw new Error(`got ${got}`);
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

// --- the FAIL-CLOSED rule (ratchet R2 finding B3) -----------------------------
console.log("fail-closed dynamic SQL:");

testCase("a SPLIT relation token -> REJECT (the R2 bypass, reconstructed)", () => {
  expectFinding(scan("split-token-dynamic-wiki.sql.txt"),
    ["_innocent_counter(uuid)", "PROVABLY names", "wiki_pages"]);
});

testCase("[R4] an E'…\\'…' escape string does NOT desync the scan -> the following wiki EXECUTE is REJECT", () => {
  // Pre-fix, skipQuoted honoured only '' and under-skipped at the backslash-escaped quote,
  // hiding the real dynamic wiki execute that followed (a fail-open in the security gate).
  expectFinding(scan("estring-desync-dynamic-wiki.sql.txt"),
    ["_escaped_probe(uuid)", "wiki_pages"]);
});

testCase("a VARIABLE-ASSEMBLED statement -> REJECT (nothing to reconstruct ⇒ fail closed)", () => {
  expectFinding(scan("variable-assembled-dynamic.sql.txt"),
    ["_assembled_probe(uuid)", "cannot be statically proven non-wiki"]);
});

testCase("NESTED replacement construction -> REJECT", () => {
  expectFinding(scan("nested-replace-dynamic.sql.txt"),
    ["_templated_probe()", "cannot be statically proven non-wiki"]);
});

testCase("a SINGLE-QUOTED function body is parsed and REJECTED (it used to be invisible)", () => {
  expectFinding(scan("single-quoted-body-dynamic-wiki.sql.txt"),
    ["_legacy_quoted_body(uuid)", "wiki_page_citations"]);
});

testCase("a PROCEDURE is a callable surface too -> REJECT", () => {
  expectFinding(scan("procedure-dynamic-wiki.sql.txt"), ["_sweep_pages(uuid)", "wiki_pages"]);
});

// R3 F4: reconstructibility is NOT proof — a view/helper (clara.page_index over wiki_pages)
// reaches wiki with no wiki token in the text. So a reconstructible non-wiki dynamic EXECUTE is a
// FINDING, waivable ONLY by a waiver that DECLARES (and the gate VERIFIES) its base targets.
testCase("[R3 F4] a RECONSTRUCTIBLE non-wiki dynamic EXECUTE is a FINDING (safety is never inferred)", () => {
  expectFinding(scan("proven-non-wiki-dynamic.sql.txt"),
    ["_proven_probe()", "cannot be PROVEN", "clara.firms"]);
});
testCase("[R3 F4] …an exact-identity waiver DECLARING its base relations EXCUSES it (not vacuous)", () => {
  DYNAMIC_SQL_ALLOWLIST.set("_proven_probe()", { why: "reads clara.firms only", relations: ["firms"], calls: [] });
  try { expectClean(scan("proven-non-wiki-dynamic.sql.txt")); }
  finally { DYNAMIC_SQL_ALLOWLIST.delete("_proven_probe()"); }
});
testCase("[R3 F4] …but a waiver that OMITS a referenced target does NOT excuse it (verify, never rubber-stamp)", () => {
  DYNAMIC_SQL_ALLOWLIST.set("_proven_probe()", { why: "incomplete", relations: [], calls: [] });
  try { expectFinding(scan("proven-non-wiki-dynamic.sql.txt"), ["_proven_probe()"]); }
  finally { DYNAMIC_SQL_ALLOWLIST.delete("_proven_probe()"); }
});
testCase("[R3 F4] …and a waiver may NEVER declare a wiki relation (that would open the boundary)", () => {
  DYNAMIC_SQL_ALLOWLIST.set("_proven_probe()", { why: "malicious", relations: ["firms", "wiki_pages"], calls: [] });
  try { expectFinding(scan("proven-non-wiki-dynamic.sql.txt"), ["_proven_probe()"]); }
  finally { DYNAMIC_SQL_ALLOWLIST.delete("_proven_probe()"); }
});

// R3 F5: the lexical evasions the previous gate walked through.
testCase("[R3 F5 #1] a SPLIT-execute CoR replacement -> REJECT (the || chain is reconstructed)", () => {
  expectFinding(scan("cor-split-execute-replacement.sql.txt"),
    ["change-of-record patch", "retire_document_filing", "PROVABLY names", "wiki_pages"]);
});
testCase("[R3 F5 #2] a SPLIT create-function `do` block -> REJECT (the create keyword is reconstructed)", () => {
  expectFinding(scan("do-split-create-function.sql.txt"),
    ["dynamic function-creating", "_split_probe", "PROVABLY names", "wiki_pages"]);
});
testCase("[R3 F5 #3] a QUOTED whitespace-qualified identifier body -> REJECT (no longer invisible)", () => {
  expectFinding(scan("quoted-ident-body-dynamic-wiki.sql.txt"),
    ["_quoted_probe(uuid)", "wiki_pages"]);
});
testCase("[R3 F5] a NESTED `do` creator -> REJECT", () => {
  expectFinding(scan("nested-do-creator.sql.txt"),
    ["dynamic function-creating", "_nested_probe", "wiki_pages"]);
});

// R3 F8: the wiki classification is by parsed relation/call TARGET, not a bare `wiki` substring,
// and exact-target waivers reach literal-attributed CoR patches.
testCase("[R3 F8] `select 'wiki'::text` names NO wiki relation → a WAIVABLE dynamic finding, not an unwaivable wiki hit", () => {
  expectFinding(scan("wiki-string-literal.sql.txt"), ["_wiki_word_probe()", "cannot be PROVEN"]);
  DYNAMIC_SQL_ALLOWLIST.set("_wiki_word_probe()", { why: "a bare string literal, no relation", relations: [], calls: [] });
  try { expectClean(scan("wiki-string-literal.sql.txt")); }
  finally { DYNAMIC_SQL_ALLOWLIST.delete("_wiki_word_probe()"); }
});
testCase("[R3 F8] a literal-attributed CoR patch's non-wiki dynamic SQL is WAIVABLE by its exact target", () => {
  expectFinding(scan("cor-nonwiki-dynamic.sql.txt"), ["retire_document_filing", "clara.firms"]);
  DYNAMIC_SQL_ALLOWLIST.set("retire_document_filing(uuid,text,uuid,text)",
    { why: "injects a clara.firms count only", relations: ["firms"], calls: [] });
  try { expectClean(scan("cor-nonwiki-dynamic.sql.txt")); }
  finally { DYNAMIC_SQL_ALLOWLIST.delete("retire_document_filing(uuid,text,uuid,text)"); }
});

testCase("`grant execute on function clara.get_wiki_page` -> OK (privilege keyword, not dynamic SQL)", () => {
  expectClean(scan("grant-execute-body.sql.txt"));
});

testCase("the reconstruction itself is exact", () => {
  const [one] = executeExpressions("begin execute 'select ' || '1' into v; end");
  if (!one) throw new Error("no execute statement found");
  const { proven, sql } = staticSqlOf(one.expr);
  if (!proven || sql !== "select 1") throw new Error(`got proven=${proven} sql=${JSON.stringify(sql)}`);
  const two = staticSqlOf("format('%I', v_tbl)");
  if (two.proven) throw new Error("a format() call must NOT be treated as proven");
});

testCase("an `execute` inside a comment or a string literal is not dynamic SQL", () => {
  const sql = "create function clara._quiet(p_a uuid) returns void language plpgsql as $b$\n"
    + "begin\n  -- execute 'select 1 from clara.wiki_pages';\n"
    + "  perform 1 where 'execute wiki_pages' <> '';\n  return;\nend $b$;\n";
  expectClean(scanSources([{ file: "inline", sql }], { assertWhitelistResolves: false }).findings);
});

testCase("the dynamic-SQL allowlist waives ONLY unprovable targets, never a proven wiki hit", () => {
  // THE RATCHET: this pin moves ONLY together with a reviewed allowlist entry. The first entry
  // stood alone until F-A3 PR-1a: 0055 S7's TAIL ASSERTION block on the apply_open_items key
  // (PR #226, full ADR-061 ladder; round 3 corrected the entry's first cut, which mis-named
  // S2): a pg_get_functiondef re-count outside the census grammar plus 'execute' as a
  // privilege-name literal and one raise-message word — nothing dynamic constructed or run.
  // F-A3 PR-1a (0119_f_a3_pr1a_core_extractions.sql, full ADR-061 ladder) adds nine: one
  // per public bank-agency verb S1 extracts into a `_<verb>_core`, each an `unprovable` CoR
  // patch by construction (the installed body is the LIVE prosrc, read fresh from the catalog
  // at apply — never a literal in this file's own text) and each independently rig-measured to
  // carry no word-bounded "wiki" token anywhere in its body. F-A6 PR-1's `wake_freeform_read`
  // is DIFFERENT IN KIND from all ten: the estate's ONE genuinely unreconstructible statement —
  // the SQL is a parameter the model composed, which is the shape ADR-0071 fixed. What upholds
  // 0017:1424-1426 there is the ACL, not the text: the statement executes as `clara_freeform_ro`,
  // which holds SELECT on 35 enumerated relations and on NO wiki relation, so a wiki payload is
  // refused by Postgres at planning with `(42501, relation_denied)`. Why + the full declared
  // target set per key live in wiki-lint-checks.mjs. F-A4 PR-1b's attest_close_exception arm
  // does NOT add a twelfth: MEASURED (gate B3), plpgsql does not resolve an embedded relation at
  // CREATE time even with check_function_bodies=on, so that arm ships as plain static SQL and
  // never needed a waiver at all — a dynamic-SQL entry proposed, tested, and correctly NOT
  // taken. The NEXT entry must trip this pin and earn its own reviewed justification.
  const expectedKeys = [
    "add_bank_account(uuid,text,text,text,text,uuid,text)",
    "apply_open_items(uuid,jsonb,text,text)",
    "complete_bank_reconciliation(uuid,uuid[],text)",
    "match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)",
    "resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)",
    "resolve_bank_line_exception(uuid,text,text,uuid,text)",
    "unmatch_bank_match(uuid,uuid,text,text)",
    "upsert_account(uuid,text,text,text,text,text,text)",
    "void_bank_reconciliation(uuid,text,text)",
    "void_bank_statement(uuid,uuid,text,text)",
    "wake_freeform_read(text,text,uuid,text,integer)",
  ].sort();
  const actualKeys = [...DYNAMIC_SQL_ALLOWLIST.keys()].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`the allowlist is pinned to exactly ${JSON.stringify(expectedKeys)}; it now carries ${JSON.stringify(actualKeys)} — each entry needs its own reviewed justification`);
  }
  DYNAMIC_SQL_ALLOWLIST.set("_innocent_counter(uuid)", "selftest-only waiver");
  try {
    expectFinding(scan("split-token-dynamic-wiki.sql.txt"), ["PROVABLY names"]);
    expectClean(scan("variable-assembled-dynamic.sql.txt").filter((f) => f.includes("_innocent_counter")));
  } finally {
    DYNAMIC_SQL_ALLOWLIST.delete("_innocent_counter(uuid)");
  }
});

// --- change-of-record patches (the finding-3 hole) ---------------------------
console.log("change-of-record patches:");

testCase("a CoR patch injecting dynamic wiki SQL into a NON-whitelisted target -> REJECT", () => {
  expectFinding(scan("cor-inject-dynamic-wiki.sql.txt"),
    ["change-of-record patch", "clara.retire_document_filing(uuid,text,uuid,text)", "INSTALLED"]);
});

testCase("a MIXED patch — one literal whitelisted target PLUS a computed one -> REJECT", () => {
  // The R2 hole: `targets.length > 0` suppressed the unresolved marker and the whole
  // patch inherited get_wiki_page's whitelist entry.
  expectFinding(scan("cor-mixed-target.sql.txt"),
    ["<unresolved target>", "clara.get_wiki_page(uuid,text)", "wiki_pages"]);
});

testCase("a patch whose ONLY target is computed -> REJECT (unresolved is never whitelisted)", () => {
  expectFinding(scan("cor-computed-target.sql.txt"),
    ["<unresolved target>", "wiki_page_refs"]);
});

testCase("R2: a decoy literal assignment followed by a computed reassignment of the SAME variable -> REJECT, never the decoy's whitelist", () => {
  expectFinding(scan("cor-reassigned-target.sql.txt"),
    ["<unresolved target>", "wiki_page_refs"]);
});

testCase("a `do` block that dynamically CREATEs a function leaves a callable surface -> REJECT", () => {
  expectFinding(scan("do-dynamic-create-function.sql.txt"),
    ["dynamic function-creating", "PROVABLY names", "_shadow_wiki_probe"]);
});

testCase("every pg_get_functiondef call is attributed, literal or not", () => {
  const { sql } = source("cor-mixed-target.sql.txt");
  const [patch] = parseCoRPatches(sql, parseFunctions(sql));
  if (!patch) throw new Error("the mixed patch was not detected at all");
  if (patch.targets.length !== 2) throw new Error(`expected 2 targets, got ${patch.targets.length}`);
  if (patch.targets[0] !== "get_wiki_page(uuid,text)" || patch.targets[1] !== null) {
    throw new Error(`targets resolved as ${JSON.stringify(patch.targets)}`);
  }
  if (patch.whitelisted) throw new Error("a patch with an unresolved target must NOT be whitelisted");
});

testCase("the block's OWN `execute v_next` is machinery, not an installed fragment", () => {
  // Otherwise every change-of-record block in the tree (0017/0018/0019 all use the idiom)
  // is a false finding under the fail-closed rule.
  expectClean(scan("cor-whitelisted-target.sql.txt"));
  const { sql } = source("cor-clean.sql.txt");
  const [patch] = parseCoRPatches(sql, parseFunctions(sql));
  if (patch.fragments.some((f) => /\bexecute\s+v_(next|cur|def)\b/i.test(f))) {
    throw new Error("the CoR machinery leaked into the fragment set");
  }
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
