// Pure checkers for the wiki dynamic-SQL gate — the REPO half of the 0019 §9
// wiki-authority defence. Source strings in, violations out; no filesystem, no
// process exit, no dependencies. `check-wiki-dynamic-sql.mjs` wires these to
// packages/db/migrations/*.sql, and `check-wiki-dynamic-sql.selftest.mjs` injects
// fixtures so CI exercises EXACTLY the code the gate runs (the freeze-lint
// precedent: scripts/freeze-lint-checks.mjs + check-frozen-workflows.selftest.mjs).
//
// WHAT THE DB CANNOT SEE. Migration 0019's tail scans every clara function body for a
// word-bounded wiki relation token or a call edge into the wiki-touch set. That scan is
// a raw `prosrc` token match, so DYNAMIC SQL defeats it: `execute 'wiki' || '_pages'`
// and `execute format('… clara.%I …', t)` construct the relation name at run time and no
// literal ever appears in prosrc. This gate is that missing half.
//
// RULE: a clara function whose body uses dynamic SQL (`execute`) must not mention `wiki`
// AT ALL unless its EXACT SIGNATURE is in the wiki-touch whitelist. Deliberately stricter
// than a seven-relation token match — `'wiki' || '_pages'` and `format('%I', v_tbl)` both
// trip on the bare `wiki` fragment, which a token scan misses.
//
// TWO POPULATIONS ARE SCANNED (ratchet R1 finding 3 closed both holes):
//
//   1. PERSISTED FUNCTION DEFINITIONS — `create [or replace] function clara.<name>(args)
//      AS $tag$ … $tag$`. Keyed by FULL IDENTITY (`name(type,…)`), never by bare name,
//      because the contract's §9 whitelist is by exact `regprocedure`: a dynamic OVERLOAD
//      of a whitelisted name is a different function and must NOT inherit the whitelist.
//
//   2. CHANGE-OF-RECORD PATCHES — a `do $tag$ … $tag$` block that reads a function body
//      with `pg_get_functiondef`, rewrites it, and `execute`s the result. This migration
//      family USES that idiom (0017, 0018 and 0019 all do), and it absolutely DOES leave a
//      callable surface behind: the patched function. The predecessor comment claiming
//      migration-time DO blocks "leave no callable surface behind" was false for exactly
//      this shape, and the gate skipped the one mechanism 0019 itself relies on.
//      The injected FRAGMENTS (the replacement literals) are analysed against the rule,
//      attributed to the patch's TARGET signature(s).
//
// STILL OUT OF SCOPE, correctly: a `do` block that performs plain DDL over a table list
// (0017's RLS loop legitimately builds `alter table clara.%I` over names that include the
// wiki relations). Such a block reads no function body, patches nothing, and leaves no
// callable surface — it is skipped because it contains no `pg_get_functiondef`.

/** The wiki-touch whitelist, by EXACT identity (contract §9's regprocedure list). */
export const WIKI_WHITELIST = new Set([
  "publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)",
  "_publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)",
  "record_wiki_source_ingest(uuid,uuid,text,text)",
  "retire_wiki_page(uuid,text,text)",
  "set_wiki_synthesis_hold(uuid,text,text)",
  "clear_wiki_synthesis_hold(uuid,text)",
  "get_wiki_page(uuid,text)",
  "list_wiki_pages(uuid)",
  "get_context_pack(uuid,text)",
  "run_client_lint(uuid,text)",
  "run_lint_all(text)",
  "mark_wiki_citations_stale(uuid,uuid,text,text)",
]);

const DYNAMIC = /\bexecute\b/i;
const WIKI = /wiki/i;

/** Alias → the spelling `pg_get_function_identity_arguments` reports. */
const TYPE_ALIASES = new Map([
  ["timestamptz", "timestamp with time zone"],
  ["timetz", "time with time zone"],
  ["int", "integer"], ["int4", "integer"], ["int2", "smallint"], ["int8", "bigint"],
  ["bool", "boolean"], ["float8", "double precision"], ["float4", "real"],
  ["varchar", "character varying"], ["decimal", "numeric"],
]);

/** First tokens that mean "this argument is UNNAMED — the whole thing is the type". */
const TYPE_HEADS = new Set([
  "uuid", "text", "jsonb", "json", "bigint", "integer", "int", "int2", "int4", "int8",
  "smallint", "boolean", "bool", "numeric", "decimal", "date", "bytea", "interval",
  "timestamptz", "timestamp", "time", "timetz", "varchar", "char", "character",
  "double", "real", "float4", "float8", "record", "anyelement", "anyarray", "void",
  "oid", "regprocedure", "regclass", "inet", "tsvector", "xml",
]);

function normalizeType(raw) {
  let t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  let suffix = "";
  const arr = /((?:\s*\[\s*\d*\s*\])+)$/.exec(t);
  if (arr) {
    suffix = "[]".repeat(arr[1].split("]").length - 1);
    t = t.slice(0, arr.index).trim();
  }
  return (TYPE_ALIASES.get(t) ?? t) + suffix;
}

/** Split on commas that are not inside parens, brackets or a single-quoted literal. */
function splitTopLevel(s) {
  const out = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === "'") quoted = s[i + 1] === "'" ? (i++, true) : false;
      continue;
    }
    if (ch === "'") { quoted = true; continue; }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

/** One declared argument → its bare TYPE, in identity spelling. */
export function argType(arg) {
  let s = arg.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+default\s+.*$/i, "").replace(/\s*:?=\s*[^,]*$/, "").trim();
  s = s.replace(/^(in|out|inout|variadic)\s+/i, "").trim();
  const parts = s.split(" ");
  if (parts.length > 1) {
    const head = parts[0].toLowerCase().replace(/(\s*\[\s*\d*\s*\])+$/, "");
    if (!TYPE_HEADS.has(head)) parts.shift();
  }
  return normalizeType(parts.join(" "));
}

/** `name` + a raw declared-argument list → the identity the whitelist is keyed by. */
export function functionIdentity(name, argsText) {
  return `${name.toLowerCase()}(${splitTopLevel(argsText).map(argType).join(",")})`;
}

/** A `clara.name(uuid,text)` signature literal (as written for ::regprocedure) → identity. */
export function signatureIdentity(sig) {
  const m = /^\s*(?:clara\s*\.\s*)?([A-Za-z0-9_]+)\s*\(([\s\S]*)\)\s*$/.exec(sig);
  if (!m) return null;
  return functionIdentity(m[1], m[2]);
}

/** Read a balanced `(...)` starting at `open`; returns {text, end} or null. */
function readParens(sql, open) {
  let depth = 0, quoted = false;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (quoted) {
      if (ch === "'") quoted = sql[i + 1] === "'" ? (i++, true) : false;
      continue;
    }
    if (ch === "'") { quoted = true; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return { text: sql.slice(open + 1, i), end: i }; }
  }
  return null;
}

const lineOf = (sql, index) => sql.slice(0, index).split("\n").length;

/**
 * Every `create [or replace] function clara.NAME(args) … $tag$ BODY $tag$`.
 * Returns {name, identity, args, body, line, start, end}.
 */
export function parseFunctions(sql) {
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+clara\.([A-Za-z0-9_]+)\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const open = m.index + m[0].length - 1;
    const args = readParens(sql, open);
    if (!args) continue;
    const rest = sql.slice(args.end);
    const tag = /\$[A-Za-z0-9_]*\$/.exec(rest);
    if (!tag) continue;
    const start = tag.index + tag[0].length;
    const end = rest.indexOf(tag[0], start);
    if (end < 0) continue;
    out.push({
      name: m[1],
      identity: functionIdentity(m[1], args.text),
      args: args.text,
      body: rest.slice(start, end),
      line: lineOf(sql, m.index),
      start: m.index,
      end: args.end + end + tag[0].length,
    });
  }
  return out;
}

/** Every dollar-quoted segment inside `text`, as {tag, body}. */
function dollarSegments(text) {
  const out = [];
  const re = /\$[A-Za-z0-9_]*\$/g;
  let m;
  while ((m = re.exec(text))) {
    const close = text.indexOf(m[0], m.index + m[0].length);
    if (close < 0) continue;
    out.push({ tag: m[0], body: text.slice(m.index + m[0].length, close) });
    re.lastIndex = close + m[0].length;
  }
  return out;
}

/** Every single-quoted literal inside `text` (doubled quotes are escapes, not ends). */
function quotedLiterals(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "'") continue;
    let j = i + 1, buf = "";
    for (; j < text.length; j++) {
      if (text[j] !== "'") { buf += text[j]; continue; }
      if (text[j + 1] === "'") { buf += "'"; j++; continue; }
      break;
    }
    out.push(buf);
    i = j;
  }
  return out;
}

/**
 * Every CHANGE-OF-RECORD patch: a `do $tag$ … $tag$` block that reads a function
 * body with `pg_get_functiondef` and `execute`s a rewritten version.
 * Returns {line, targets:[identity|null], fragments:[string]}.
 * `spans` (from parseFunctions) suppresses `do` matches that live inside a body.
 */
export function parseCoRPatches(sql, spans = []) {
  const out = [];
  const re = /\bdo\s+(\$[A-Za-z0-9_]*\$)/gi;
  let m;
  while ((m = re.exec(sql))) {
    if (spans.some((s) => m.index > s.start && m.index < s.end)) continue;
    const tag = m[1];
    const open = m.index + m[0].length;
    const close = sql.indexOf(tag, open);
    if (close < 0) continue;
    re.lastIndex = close + tag.length;
    const block = sql.slice(open, close);
    if (!/pg_get_functiondef/i.test(block)) continue;   // not a function patch
    if (!DYNAMIC.test(block)) continue;                 // reads a body but installs nothing

    const targets = [];
    const tre = /pg_get_functiondef\s*\(\s*'([^']+)'\s*::\s*regprocedure/gi;
    let t;
    while ((t = tre.exec(block))) targets.push(signatureIdentity(t[1]));
    // A patch whose target we cannot resolve statically is treated as unwhitelisted.
    if (targets.length === 0) targets.push(null);

    const fragments = [
      ...dollarSegments(block).map((s) => s.body),
      ...quotedLiterals(block),
    ];
    out.push({ line: lineOf(sql, m.index), targets, fragments });
  }
  return out;
}

/** The rule, applied to one body/fragment. */
const offends = (text) => DYNAMIC.test(text) && WIKI.test(text);

/**
 * Scan a set of `{file, sql}` sources.
 * Returns {findings:[string], scanned:{functions, patches}, identities:Set}.
 * The LAST definition of an identity wins (CoR semantics, matching the live catalog).
 *
 * `assertWhitelistResolves` is the whole-tree invariant (every whitelisted signature must
 * exist); the self-test injects partial trees and turns it off.
 */
export function scanSources(sources, { assertWhitelistResolves = true } = {}) {
  const defs = new Map();      // identity -> {file, line, body, name}
  const patches = [];
  for (const { file, sql } of sources) {
    const fns = parseFunctions(sql);
    for (const fn of fns) defs.set(fn.identity, { ...fn, file });
    for (const p of parseCoRPatches(sql, fns)) patches.push({ ...p, file });
  }

  const findings = [];
  for (const [identity, d] of defs) {
    if (WIKI_WHITELIST.has(identity)) continue;
    if (offends(d.body)) {
      findings.push(
        `  ${d.file}:${d.line}  clara.${identity}  — dynamic SQL (EXECUTE) in a body that mentions "wiki"`);
    }
  }
  for (const p of patches) {
    const unwhitelisted = p.targets.filter((t) => t === null || !WIKI_WHITELIST.has(t));
    if (unwhitelisted.length === 0) continue;
    for (const frag of p.fragments) {
      if (!offends(frag)) continue;
      const named = unwhitelisted.map((t) => (t === null ? "<unresolved target>" : `clara.${t}`)).join(", ");
      findings.push(
        `  ${p.file}:${p.line}  change-of-record patch → ${named}`
        + `  — the INJECTED body fragment carries dynamic SQL (EXECUTE) and mentions "wiki"`);
      break;
    }
  }

  // A whitelist entry that resolves to no definition is DRIFT, not a pass: the DB tail
  // treats resolving each signature as an existence assertion and so must this half.
  for (const identity of assertWhitelistResolves ? WIKI_WHITELIST : []) {
    if (!defs.has(identity)) {
      findings.push(
        `  (whitelist)  clara.${identity}  — whitelisted signature has NO definition in the`
        + ` migration tree; the repo and DB whitelists have diverged`);
    }
  }

  return { findings, scanned: { functions: defs.size, patches: patches.length }, identities: new Set(defs.keys()) };
}
