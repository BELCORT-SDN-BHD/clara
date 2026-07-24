#!/usr/bin/env node
// Wiki dynamic-SQL gate — the REPO half of the 0019 §9 wiki-authority defence.
//
// Migration 0019's in-transaction tail runs a closed-set scan over every clara
// SECURITY DEFINER function and fails if a non-whitelisted body NAMES one of the seven
// wiki relations or CALLS a wiki-touch function. That scan is a raw `prosrc` token scan,
// and it has one structural blind spot the DB cannot close (0019 header, amendment 7):
//
//   DYNAMIC SQL. `execute format('... clara.%I ...', t)` or `execute 'wiki' || '_pages'`
//   constructs a relation name at run time, so no word-bounded literal ever appears in
//   prosrc and the tail passes. The original R2-F2 defect was exactly this shape one
//   level up — the authority bodies named only a helper while the helper held the reads.
//
// This gate is that missing half. RULE: a clara function whose body uses dynamic SQL
// (`execute`) must not mention `wiki` AT ALL unless it is in the wiki-touch whitelist.
// Deliberately stricter than a seven-relation token match: `'wiki' || '_pages'` and
// `format('%I', v_tbl)` both trip on the bare `wiki` fragment, which a token scan misses.
//
// SCOPE: `create [or replace] function clara.<name>(...) AS $tag$ ... $tag$` in
// packages/db/migrations/*.sql — i.e. PERSISTED function bodies, the same population the
// DB tail scans. Migration-time `do $$ ... $$` blocks are OUT of scope: they run once,
// under the migration role, and leave no callable surface behind (0017's own RLS loop
// legitimately builds `alter table clara.%I` over a list that includes wiki tables).
//
// The LAST definition of a name wins (CoR semantics), matching the live catalog.
// No dependencies — Node built-ins only.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)), "..", "packages", "db", "migrations");

// The wiki-touch whitelist, by NAME (0019 §9 whitelists by exact regprocedure identity in
// the DB; a repo-side source scan has no signature, so an overload of a whitelisted name
// is covered here and caught there).
const WHITELIST = new Set([
  "publish_wiki_page_version", "_publish_wiki_page_version_core",
  "record_wiki_source_ingest", "retire_wiki_page", "set_wiki_synthesis_hold",
  "clear_wiki_synthesis_hold", "get_wiki_page", "list_wiki_pages",
  "get_context_pack", "run_client_lint", "run_lint_all", "mark_wiki_citations_stale",
]);

const DYNAMIC = /\bexecute\b/i;
const WIKI = /wiki/i;

/** Parse every `create [or replace] function clara.NAME(...) ... $tag$ BODY $tag$`. */
function parseFunctions(sql) {
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+clara\.([A-Za-z0-9_]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const tag = /\$[A-Za-z0-9_]*\$/.exec(rest);
    if (!tag) continue;
    const start = tag.index + tag[0].length;
    const end = rest.indexOf(tag[0], start);
    if (end < 0) continue;
    out.push({
      name: m[1],
      body: rest.slice(start, end),
      line: sql.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

function main() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const defs = new Map(); // name -> {file, line, body} (last definition wins)
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const fn of parseFunctions(sql)) defs.set(fn.name, { ...fn, file });
  }

  const findings = [];
  for (const [name, d] of defs) {
    if (WHITELIST.has(name)) continue;
    if (DYNAMIC.test(d.body) && WIKI.test(d.body)) {
      findings.push(`  ${d.file}:${d.line}  clara.${name}  — dynamic SQL (EXECUTE) in a body that mentions "wiki"`);
    }
  }

  if (findings.length > 0) {
    console.error("wiki-dynamic-sql: FAIL — dynamic wiki SQL outside the wiki-touch whitelist:\n");
    console.error(findings.join("\n"));
    console.error(
      "\nA constructed relation name is invisible to migration 0019's prosrc token scan, so the"
      + "\nwiki authority boundary (WB-R21) would be unenforceable. Either name the relation as a"
      + "\nplain literal (so the DB tail can see it) or move the read into a whitelisted wiki verb."
      + "\nWidening the whitelist is a CONTRACT change, not a lint fix.",
    );
    return 1;
  }
  console.log(
    `wiki-dynamic-sql: OK — ${defs.size} clara function definition(s) scanned, no dynamic wiki SQL outside the whitelist.`);
  return 0;
}

process.exit(main());
