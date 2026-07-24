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
// THE RULE IS FAIL-CLOSED (ratchet R2 finding B3). Every PERSISTENT `EXECUTE` outside the
// wiki-touch whitelist is a finding UNLESS the SQL it runs can be STATICALLY PROVEN not to
// mention `wiki`. "Statically proven" means the whole dynamic expression is built from
// single-quoted literals and nothing else, so the checker can reconstruct the exact SQL
// text. Anything else — a variable, `format(...)`, `quote_ident(...)`, `replace(...)`, a
// parenthesised expression — is UNPROVABLE and therefore a finding.
//
// The predecessor rule was `body mentions "execute" AND body matches /wiki/i`, which this
// one-liner walked straight through:
//
//     execute 'select count(*) from clara.' || 'wi' || 'ki_pages';
//
// The DB-side scan sees no word-bounded `wiki_pages`; the old repo check saw `execute` but
// its `/wiki/i` test was false. Reconstructing the literal concatenation catches it, and
// failing closed on everything non-reconstructible catches every variant of it that has
// not been invented yet — including the variable-assembled one, where the `wiki` fragment
// never appears anywhere near the `execute` at all.
//
// TWO POPULATIONS ARE SCANNED (ratchet R1 finding 3 opened both; R2 hardened both):
//
//   1. PERSISTED FUNCTION DEFINITIONS — `create [or replace] function|procedure
//      clara.<name>(args) AS <body>`, where <body> is dollar-quoted OR single-quoted.
//      Keyed by FULL IDENTITY (`name(type,…)`), never by bare name, because the contract's
//      §9 whitelist is by exact `regprocedure`: a dynamic OVERLOAD of a whitelisted name is
//      a different function and must NOT inherit the whitelist.
//
//   2. CHANGE-OF-RECORD PATCHES — a `do $tag$ … $tag$` block that installs a callable
//      surface: it either reads a function body with `pg_get_functiondef` and `execute`s a
//      rewritten version, or dynamically `create`s a function/procedure. This migration
//      family USES the first idiom (0017, 0018 and 0019 all do), and it absolutely DOES
//      leave a callable surface behind: the patched function. The injected FRAGMENTS (the
//      replacement literals) are analysed against the rule, attributed to the patch's
//      TARGET signature(s).
//
//      A patch counts as WHITELISTED only when EVERY `pg_get_functiondef` call in it
//      resolves to a literal signature AND every one of those signatures is whitelisted.
//      An unresolved (computed) target, or a MIX of a whitelisted literal target and a
//      computed one, leaves the block unwhitelisted — that mix was the second half of
//      finding B3: one literal whitelisted target made `targets.length > 0`, no
//      `<unresolved target>` was inserted, and the whole patch inherited the whitelist.
//
//      The block's OWN `execute v_next` is migration-time machinery, not a persistent
//      surface, so it is deliberately not a fragment: fragments are the dollar-quoted
//      segments and the single-quoted literals of the block, which is exactly the text
//      that ends up inside the patched body.
//
// STILL OUT OF SCOPE, correctly: a `do` block that performs plain DDL over a table list
// (0017's RLS loop legitimately builds `alter table clara.%I` over names that include the
// wiki relations). Such a block reads no function body, creates no function, and leaves no
// callable surface — it is skipped because it contains neither `pg_get_functiondef` nor a
// dynamic `create function`/`create procedure`.

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

/**
 * The ONLY escape hatch from fail-closed: identities whose dynamic SQL is REVIEWED and
 * justified as non-wiki but is not statically reconstructible (a `format('%I', t)` over a
 * table list, say). Keyed by exact identity, value = the written justification, which is
 * printed by the gate so an entry cannot rot silently.
 *
 * It waives ONLY the "unprovable target" class. A dynamic statement that PROVABLY names
 * `wiki` is a finding for every function on earth — no entry here can suppress it.
 *
 * EMPTY TODAY, and that is a fact about the tree, not an accident: no `create function
 * clara.…` in packages/db/migrations carries an `EXECUTE` in its body at all. Adding an
 * entry is a contract-level decision, exactly like widening WIKI_WHITELIST.
 */
export const DYNAMIC_SQL_ALLOWLIST = new Map([]);

const WIKI = /wiki/i;

/** Alias → the spelling `pg_get_function_identity_arguments` reports. */
const TYPE_ALIASES = new Map([
  ["timestamptz", "timestamp with time zone"],
  ["timetz", "time with time zone"],
  ["int", "integer"], ["int4", "integer"], ["int2", "smallint"], ["int8", "bigint"],
  ["bool", "boolean"], ["float8", "double precision"], ["float4", "real"],
  ["varchar", "character varying"], ["decimal", "numeric"],
]);

/** First tokens that mean "this argument may be UNNAMED — the whole thing is the type". */
const TYPE_HEADS = new Set([
  "uuid", "text", "jsonb", "json", "bigint", "integer", "int", "int2", "int4", "int8",
  "smallint", "boolean", "bool", "numeric", "decimal", "date", "bytea", "interval",
  "timestamptz", "timestamp", "time", "timetz", "varchar", "char", "character",
  "double", "real", "float4", "float8", "record", "anyelement", "anyarray", "void",
  "oid", "regprocedure", "regclass", "inet", "tsvector", "xml",
]);

/** Complete type spellings — used to tell an UNNAMED argument from a named one whose NAME
 *  happens to be a type head (`date date`, `text text`). Without this the old head-only
 *  test read `date date` as the two-word type "date date". */
const KNOWN_TYPES = new Set([
  ...TYPE_HEADS,
  ...TYPE_ALIASES.values(),
  "timestamp with time zone", "timestamp without time zone",
  "time with time zone", "time without time zone",
  "character varying", "double precision", "bit varying", "character",
]);

/** Strip a type MODIFIER — `numeric(12,2)`, `varchar(50)`, `timestamp(3) with time zone`.
 *  `pg_get_function_identity_arguments` never reports one, so the identity must not carry it. */
const stripTypmod = (t) => t.replace(/\(\s*\d+\s*(?:,\s*\d+\s*)?\)/g, "");

function normalizeType(raw) {
  let t = stripTypmod(raw).trim().toLowerCase().replace(/\s+/g, " ");
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

/**
 * One declared argument → its bare TYPE, in identity spelling, or `null` when the argument
 * does NOT participate in the identity.
 *
 * OUT parameters return null: `pg_get_function_identity_arguments` OMITS them, so an
 * `out` argument counted as a type produced an identity that could never match a
 * whitelist entry written as a `::regprocedure` literal. `inout` and `variadic` DO
 * participate and render as their bare type — the spelling a signature literal is written
 * in, which is the spelling both sides of this checker use.
 */
export function argType(arg) {
  let s = arg.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+default\s+.*$/i, "").replace(/\s*:?=\s*[^,]*$/, "").trim();
  const mode = /^(in|out|inout|variadic)\s+/i.exec(s);
  if (mode) {
    if (mode[1].toLowerCase() === "out") return null;
    s = s.slice(mode[0].length).trim();
  }
  const parts = s.split(" ");
  if (parts.length > 1) {
    const head = stripTypmod(parts[0]).toLowerCase().replace(/(\s*\[\s*\d*\s*\])+$/, "");
    const whole = normalizeType(s).replace(/(\[\])+$/, "");
    if (!TYPE_HEADS.has(head) || !KNOWN_TYPES.has(whole)) parts.shift();
  }
  return normalizeType(parts.join(" "));
}

/** `name` + a raw declared-argument list → the identity the whitelist is keyed by. */
export function functionIdentity(name, argsText) {
  const types = splitTopLevel(argsText).map(argType).filter((t) => t !== null);
  return `${name.toLowerCase()}(${types.join(",")})`;
}

/** A `clara.name(uuid,text)` signature literal (as written for ::regprocedure) → identity. */
export function signatureIdentity(sig) {
  const m = /^\s*(?:clara\s*\.\s*)?([A-Za-z0-9_]+)\s*\(([\s\S]*)\)\s*$/.exec(sig);
  if (!m) return null;
  return functionIdentity(m[1], m[2]);
}

// ---------------------------------------------------------------------------
// Lexical helpers. Everything below walks SQL with the three string forms
// PostgreSQL actually has — single-quoted (with '' escapes), dollar-quoted, and
// comments — so a keyword inside a literal or a comment is never mistaken for code.
// ---------------------------------------------------------------------------

/** Index just past the single-quoted literal starting at `i` (which must be a quote). */
function skipQuoted(s, i) {
  let j = i + 1;
  while (j < s.length) {
    if (s[j] !== "'") { j++; continue; }
    if (s[j + 1] === "'") { j += 2; continue; }
    return j + 1;
  }
  return s.length;
}

/** Index just past the dollar-quoted string starting at `i`, or `i` when there is none. */
function skipDollar(s, i) {
  const m = /^\$[A-Za-z0-9_]*\$/.exec(s.slice(i));
  if (!m) return i;
  const close = s.indexOf(m[0], i + m[0].length);
  return close < 0 ? s.length : close + m[0].length;
}

/** Blank out `--` and `/* *\/` comments, preserving length (so offsets stay valid) and
 *  newlines (so line numbers stay valid). String literals are left untouched. */
export function maskComments(text) {
  const out = text.split("");
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") { i = skipQuoted(text, i); continue; }
    if (ch === "$") { const j = skipDollar(text, i); if (j > i) { i = j; continue; } i++; continue; }
    if (ch === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      let depth = 1;
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") { depth++; out[i] = " "; out[i + 1] = " "; i += 2; continue; }
        if (text[i] === "*" && text[i + 1] === "/") { depth--; out[i] = " "; out[i + 1] = " "; i += 2; continue; }
        if (text[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Read a balanced `(...)` starting at `open`; returns {text, end} or null. */
function readParens(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") { i = skipQuoted(sql, i) - 1; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return { text: sql.slice(open + 1, i), end: i }; }
  }
  return null;
}

const lineOf = (sql, index) => sql.slice(0, index).split("\n").length;

/**
 * Every `create [or replace] function|procedure clara.NAME(args) … AS <body>`, where
 * <body> is `$tag$ … $tag$` OR a single-quoted literal (the pre-dollar-quote spelling,
 * which parses identically for PostgreSQL and used to be invisible here).
 * Returns {name, identity, args, body, line, start, end}.
 */
export function parseFunctions(sql) {
  const masked = maskComments(sql);   // same length ⇒ every offset below is valid in `sql`
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+clara\.([A-Za-z0-9_]+)\s*\(/gi;
  let m;
  while ((m = re.exec(masked))) {
    const open = m.index + m[0].length - 1;
    const args = readParens(masked, open);
    if (!args) continue;
    const rest = masked.slice(args.end);
    const raw = sql.slice(args.end);
    // Anchor on the AS that introduces the body, so a quoted attribute value earlier in
    // the header (`set search_path = 'clara'`) cannot be mistaken for the body.
    const as = /\bas\b/i.exec(rest);
    if (!as) continue;
    const after = as.index + as[0].length;
    const tag = /\$[A-Za-z0-9_]*\$/.exec(rest.slice(after));
    const quote = rest.indexOf("'", after);
    let body = null, end = -1;
    const tagAt = tag ? after + tag.index : -1;
    if (tag && (quote < 0 || tagAt < quote)) {
      const start = tagAt + tag[0].length;
      const close = rest.indexOf(tag[0], start);
      if (close < 0) continue;
      body = raw.slice(start, close);
      end = close + tag[0].length;
    } else if (quote >= 0) {
      const close = skipQuoted(rest, quote);
      body = raw.slice(quote + 1, close - 1).replace(/''/g, "'");
      end = close;
    } else {
      continue;
    }
    out.push({
      name: m[1],
      identity: functionIdentity(m[1], args.text),
      args: args.text,
      body,
      line: lineOf(sql, m.index),
      start: m.index,
      end: args.end + end,
    });
  }
  return out;
}

/** Every dollar-quoted segment inside `text`, as {tag, body, start, end}. Located on the
 *  comment-masked text (offsets are preserved) so a `$tag$` inside a comment is not one. */
export function dollarSegments(text) {
  const s = maskComments(text);
  const out = [];
  const re = /\$[A-Za-z0-9_]*\$/g;
  let m;
  while ((m = re.exec(s))) {
    const close = s.indexOf(m[0], m.index + m[0].length);
    if (close < 0) continue;
    out.push({
      tag: m[0],
      body: text.slice(m.index + m[0].length, close),
      start: m.index,
      end: close + m[0].length,
    });
    re.lastIndex = close + m[0].length;
  }
  return out;
}

/**
 * Every single-quoted literal inside `text` (doubled quotes are escapes, not ends).
 * Located on the comment-masked text: an APOSTROPHE IN A COMMENT (`-- the core's lock`)
 * otherwise opens a phantom literal that swallows the rest of the block, and every
 * literal after it is misread — which is how the migration tree's own change-of-record
 * machinery (`execute v_next`) surfaced as an "injected fragment".
 */
export function quotedLiterals(text) {
  const s = maskComments(text);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "'") continue;
    const end = skipQuoted(s, i);
    out.push(text.slice(i + 1, end - 1).replace(/''/g, "'"));
    i = end - 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The fail-closed dynamic-SQL analysis.
// ---------------------------------------------------------------------------

/** True when this `execute` is the PRIVILEGE keyword (`grant execute on function …`,
 *  `revoke execute …`), not plpgsql's dynamic-SQL statement. */
function isPrivilegeExecute(s, start, end) {
  if (/^\s+on\b/i.test(s.slice(end))) return true;
  const before = s.slice(Math.max(0, start - 64), start);
  return /(?:\bgrant\b|\brevoke\b|\ball\b|\bprivileges\b|,)\s*$/i.test(before);
}

/** From just past the `execute` keyword, read the dynamic-SQL EXPRESSION — up to a
 *  top-level `;`, or the `into` / `using` clause that ends it. */
function readExecuteExpr(s, from) {
  let depth = 0;
  let i = from;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") { i = skipQuoted(s, i); continue; }
    if (ch === "$") { const j = skipDollar(s, i); if (j > i) { i = j; continue; } i++; continue; }
    if (ch === "(") { depth++; i++; continue; }
    if (ch === ")") { depth--; i++; continue; }
    if (depth === 0) {
      if (ch === ";") return { text: s.slice(from, i), end: i + 1 };
      if (/[A-Za-z_]/.test(ch)) {
        let j = i;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        const word = s.slice(i, j).toLowerCase();
        if (word === "into" || word === "using") return { text: s.slice(from, i), end: j };
        i = j;
        continue;
      }
    }
    i++;
  }
  return { text: s.slice(from), end: s.length };
}

/** Every dynamic-SQL statement in `text`, as {index, expr}. Comments are masked and both
 *  string forms are respected, so `-- execute` and `'execute'` are never counted. */
export function executeExpressions(text) {
  const s = maskComments(text);
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") { i = skipQuoted(s, i); continue; }
    if (ch === "$") { const j = skipDollar(s, i); if (j > i) { i = j; continue; } i++; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      if (s.slice(i, j).toLowerCase() === "execute" && !isPrivilegeExecute(s, i, j)) {
        const expr = readExecuteExpr(s, j);
        out.push({ index: i, expr: expr.text.trim() });
        i = expr.end;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

/** Split a dynamic-SQL expression on TOP-LEVEL `||`. */
function splitConcat(expr) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === "'") { i = skipQuoted(expr, i); continue; }
    if (ch === "(") { depth++; i++; continue; }
    if (ch === ")") { depth--; i++; continue; }
    if (depth === 0 && ch === "|" && expr[i + 1] === "|") {
      out.push(expr.slice(start, i));
      i += 2;
      start = i;
      continue;
    }
    i++;
  }
  out.push(expr.slice(start));
  return out;
}

/**
 * STATIC PROOF of what a dynamic-SQL expression runs. `{proven:true, sql}` only when the
 * whole expression is a concatenation of single-quoted literals and nothing else — then
 * `sql` is the exact statement text. Anything else is `{proven:false}` and, by the
 * fail-closed rule, a finding.
 */
export function staticSqlOf(expr) {
  let sql = "";
  for (const part of splitConcat(expr)) {
    const t = part.trim();
    const m = /^'((?:[^']|'')*)'$/.exec(t);
    if (!m) return { proven: false, sql: null };
    sql += m[1].replace(/''/g, "'");
  }
  return { proven: true, sql };
}

/** Apply the rule to one body/fragment → [{expr, kind:'wiki'|'unprovable', sql?}]. */
export function dynamicSqlFindings(text) {
  const out = [];
  for (const { expr } of executeExpressions(text)) {
    const { proven, sql } = staticSqlOf(expr);
    if (!proven) { out.push({ expr, kind: "unprovable" }); continue; }
    if (WIKI.test(sql)) out.push({ expr, kind: "wiki", sql });
  }
  return out;
}

const snippet = (s) => {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > 120 ? one.slice(0, 117) + "…" : one;
};
const why = (f) => (f.kind === "wiki"
  ? `runs dynamic SQL that PROVABLY names "wiki": ${snippet(f.sql)}`
  : `runs dynamic SQL whose target cannot be statically proven non-wiki: EXECUTE ${snippet(f.expr)}`);

/**
 * Every CHANGE-OF-RECORD patch: a `do $tag$ … $tag$` block that installs a callable
 * surface — it reads a function body with `pg_get_functiondef` and `execute`s a rewritten
 * version, or it dynamically creates a function/procedure.
 * Returns {line, targets:[identity|null], whitelisted, fragments:[string]}.
 * `spans` (from parseFunctions) suppresses `do` matches that live inside a body.
 */
export function parseCoRPatches(sql, spans = []) {
  const maskedSql = maskComments(sql);
  const out = [];
  const re = /\bdo\s+(\$[A-Za-z0-9_]*\$)/gi;
  let m;
  while ((m = re.exec(maskedSql))) {
    if (spans.some((s) => m.index > s.start && m.index < s.end)) continue;
    const tag = m[1];
    const open = m.index + m[0].length;
    const close = maskedSql.indexOf(tag, open);
    if (close < 0) continue;
    re.lastIndex = close + tag.length;
    const block = sql.slice(open, close);
    const masked = maskedSql.slice(open, close);
    const patchesABody = /pg_get_functiondef/i.test(masked);
    const createsAFunction = /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i.test(masked);
    if (!patchesABody && !createsAFunction) continue;   // installs no callable surface
    if (!/\bexecute\b/i.test(masked)) continue;         // reads a body but installs nothing

    // Targets: EVERY pg_get_functiondef call, not only the ones with a literal argument.
    // A computed argument yields `null` — an unresolved target — so a block that mixes a
    // whitelisted literal target with a computed one can no longer inherit the whitelist.
    const targets = [];
    const tre = /pg_get_functiondef\s*\(/gi;
    let t;
    while ((t = tre.exec(masked))) {
      const arg = readParens(masked, t.index + t[0].length - 1);
      if (!arg) { targets.push(null); continue; }
      const lit = /^\s*'((?:[^']|'')*)'\s*::\s*regprocedure\s*$/.exec(arg.text);
      targets.push(lit ? signatureIdentity(lit[1].replace(/''/g, "'")) : null);
      tre.lastIndex = arg.end;
    }
    if (targets.length === 0) targets.push(null);

    // FRAGMENTS = the text that ends up inside the persistent surface.
    //
    // For the CoR idiom that is the injected text: the dollar-quoted segments plus the
    // single-quoted literals of the surrounding plain text. The block's own
    // `execute v_next` lives in that plain text OUTSIDE any literal and is therefore NOT a
    // fragment — it is the migration-time machinery, not a persistent surface.
    //
    // For a block that dynamically CREATEs a function instead, the persistent surface IS
    // the block's own dynamic SQL, and there is no machinery `execute` to confuse it with,
    // so the block itself is the fragment.
    let fragments;
    if (patchesABody) {
      const segments = dollarSegments(block);
      fragments = segments.map((s) => s.body);
      let cursor = 0;
      for (const seg of [...segments, { start: block.length, end: block.length }]) {
        if (seg.start > cursor) fragments.push(...quotedLiterals(block.slice(cursor, seg.start)));
        cursor = seg.end;
      }
    } else {
      fragments = [block];
    }

    out.push({
      line: lineOf(sql, m.index),
      kind: patchesABody ? "change-of-record patch" : "dynamic function-creating `do` block",
      targets,
      whitelisted: targets.every((x) => x !== null && WIKI_WHITELIST.has(x)),
      fragments,
    });
  }
  return out;
}

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
    const waiver = DYNAMIC_SQL_ALLOWLIST.get(identity) ?? null;
    for (const f of dynamicSqlFindings(d.body)) {
      // A justified waiver excuses an UNPROVABLE target. It can never excuse dynamic SQL
      // that provably names wiki — that is a finding for every function in the schema.
      if (f.kind === "unprovable" && waiver) continue;
      findings.push(`  ${d.file}:${d.line}  clara.${identity}  — ${why(f)}`);
    }
  }
  for (const p of patches) {
    if (p.whitelisted) continue;
    const named = p.targets
      .map((t) => (t === null ? "<unresolved target>" : `clara.${t}`))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    for (const frag of p.fragments) {
      const [f] = dynamicSqlFindings(frag);
      if (!f) continue;
      findings.push(
        `  ${p.file}:${p.line}  ${p.kind} → ${named}`
        + `  — the INSTALLED body ${why(f)}`);
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
