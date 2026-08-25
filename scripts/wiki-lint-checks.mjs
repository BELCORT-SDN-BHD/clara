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
 * The ONLY escape hatch from fail-closed (ratchet R3 findings F4/F8). Keyed by EXACT identity
 * (a persisted function signature, or a CoR patch's single literal target). The value RECORDS AND
 * lets the gate VERIFY the statement's base-relation and call dependencies:
 *
 *   identity -> { why: string, relations: string[], calls: string[] }
 *
 * where `relations`/`calls` are the BARE `clara.<name>` targets the waived statement is permitted
 * to touch (lower-cased). The gate VERIFIES (never rubber-stamps):
 *   - a RECONSTRUCTIBLE statement (its `clara.<name>` targets are known) is excused ONLY when
 *     every target it references is DECLARED here — an undeclared target is still a finding; and
 *   - NO declared target may itself be a wiki relation/call — a waiver can never open the boundary.
 * A statement that PROVABLY names wiki is a finding for every function on earth: no entry here can
 * suppress it. An UNPROVABLE statement (targets unknowable) is excused by a declared, wiki-free
 * waiver as a reviewed human attestation — its `why` is printed so the entry cannot rot silently.
 *
 * ONE ENTRY TODAY (it was empty until 0055). Adding an entry is a contract-level decision,
 * exactly like widening WIKI_WHITELIST — each entry rides a reviewed PR with its why printed.
 */
export const DYNAMIC_SQL_ALLOWLIST = new Map([
  // F-A3 PR-1a (0119_f_a3_pr1a_core_extractions.sql, full ADR-061 ladder). Nine CoR
  // patches, one per public bank-agency verb, each reading its own LIVE prosrc via
  // `pg_get_functiondef('clara.<verb>(...)'::regprocedure)` — a LITERAL signature, so every
  // patch's target already resolves (`p.targets` carries no null) — and re-installing it under
  // a new `_<verb>_core` name plus a thin wrapper, via `execute replace(...) || 'AS
  // $fa3_core$' || replace(v_src, v_anchor, v_ctx) || '$fa3_core$'` and `execute v_head || 'AS
  // $fa3_wrap$' || format($w$…$w$, …) || '$fa3_wrap$'`. Both statements read a
  // migration-time-only variable (v_head/v_src, sourced from the catalog at apply, never a
  // literal in this file's own text) so `staticSqlOf` cannot prove them and every one is
  // `kind:'unprovable'` — exactly the class this allowlist exists to excuse (the docstring
  // above, "an UNPROVABLE statement … excused by a declared, wiki-free waiver as a reviewed
  // human attestation"). NOT waivable via WIKI_WHITELIST: these are ordinary bank-ledger verbs,
  // never wiki-touch surfaces. Each entry's `relations`/`calls` are the EXACT `clara.*` token
  // set the live installed body was MEASURED to reference (a rig read, never a file citation —
  // `select p.prosrc … from pg_proc p where p.proname = '<verb>'` on a migrated throwaway,
  // 2026-08-24) and every one of the nine bodies was independently confirmed to contain no
  // word-bounded "wiki" substring at all (`prosrc !~* '\ywiki'`, same read). The migration's
  // own SS0.3 prestate additionally pins each body's pre-extraction sha256, so a live body that
  // has drifted from the one this waiver was measured against aborts the migration before this
  // statement ever runs — the waiver cannot silently go stale under a body swap.
  ["match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)", {
    why: "F-A3 PR-1a S1 block 1 — see the family note above. match_bank_line's own body is the "
      + "richest of the nine (it is the one WITH the estate's lock order, Annex C), so its "
      + "relations/calls list is the longest; still zero wiki tokens.",
    relations: ["bank_accounts", "bank_line_exceptions", "bank_match_entry_members",
      "bank_match_line_members", "bank_matches", "bank_rules", "bank_statement_lines",
      "bank_statements", "clients", "domain_events", "journal_entries"],
    calls: ["_append_event", "_audit", "_bank_entry_side_capacity", "_bank_match_adjustment_entry",
      "_bank_match_audit", "_finish_op", "_hash", "_human_ctx", "_match_bank_line_core",
      "_reserve_op", "role_rank"],
  }],
  ["unmatch_bank_match(uuid,uuid,text,text)", {
    why: "F-A3 PR-1a S1 block 2 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_unmatch_bank_match_core", "role_rank"],
  }],
  ["complete_bank_reconciliation(uuid,uuid[],text)", {
    why: "F-A3 PR-1a S1 block 3 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_complete_bank_reconciliation_core", "role_rank"],
  }],
  ["void_bank_reconciliation(uuid,text,text)", {
    why: "F-A3 PR-1a S1 block 4 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_void_bank_reconciliation_core", "role_rank"],
  }],
  ["resolve_bank_line_exception(uuid,text,text,uuid,text)", {
    why: "F-A3 PR-1a S1 block 5 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_resolve_bank_line_exception_core", "role_rank"],
  }],
  ["resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)", {
    why: "F-A3 PR-1a S1 block 6 — see the family note above. The extracted core is deliberately "
      + "unchanged in what it calls (Annex A.2's obligation J.2-a, discharged by the F-A3/PR-1b "
      + "lane): it still reaches the PUBLIC resolve_bank_line_exception and match_bank_line "
      + "internally, so this waiver covers only the wrapper/core installation itself, not a "
      + "call-graph change.",
    relations: [],
    calls: ["_human_ctx", "_resolve_and_book_bank_line_core", "role_rank"],
  }],
  ["void_bank_statement(uuid,uuid,text,text)", {
    why: "F-A3 PR-1a S1 block 7 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_void_bank_statement_core", "role_rank"],
  }],
  ["add_bank_account(uuid,text,text,text,text,uuid,text)", {
    why: "F-A3 PR-1a S1 block 8 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_add_bank_account_core", "role_rank"],
  }],
  ["upsert_account(uuid,text,text,text,text,text,text)", {
    why: "F-A3 PR-1a S1 block 9 — see the family note above.",
    relations: [],
    calls: ["_human_ctx", "_upsert_account_core", "role_rank"],
  }],
  // F-A3 PR-3 (UNNUMBERED_f_a3_pr3_retirement_parity_doors.sql, full ADR-061 ladder). ONE more
  // CoR patch of the exact same family as the nine above: SS2 factors book_staff_advance_
  // application onto the PR-1a idiom (a thin human delegator + an ungranted
  // _book_staff_advance_application_core), reading the LIVE prosrc via
  // `pg_get_functiondef('clara.book_staff_advance_application(...)'::regprocedure)` — a
  // LITERAL signature, so the patch's target already resolves — and re-installing it via the
  // same unprovable `execute replace(...) || 'AS $fa3pr3_core$' || replace(v_src, v_anchor,
  // v_ctx) || '$fa3pr3_core$'` shape (a migration-time-only variable, never a literal in this
  // file's own text). `relations`/`calls` are the EXACT `clara.*` token set the live installed
  // body was MEASURED to reference (a rig read, 2026-08-25), and the body was independently
  // confirmed to contain no word-bounded "wiki" substring (`prosrc !~* '\ywiki'`, same read).
  ["book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)", {
    why: "F-A3 PR-3 SS2 — see the family note above.",
    relations: [],
    calls: ["_book_staff_advance_application_core", "_human_ctx", "role_rank"],
  }],
  ["apply_open_items(uuid,jsonb,text,text)", {
    why: "0055 S7 — the TAIL ASSERTION block (PR #226, full ADR-061 ladder; the round-3 "
      + "scoped review corrected this entry's first cut, which mis-attributed the finding "
      + "to the S2 splice). What the gate actually flags: S7 re-reads pg_get_functiondef "
      + "on apply_open_items to re-count the spliced guard's marker as a LENGTH DIFFERENCE "
      + "(not count(*)), which sits outside the census grammar, and the block carries the "
      + "token 'execute' only as (a) the privilege-name literal handed to "
      + "has_function_privilege in the S7.2 write-authorization check, three times, and "
      + "(b) the English word inside one raise message. NOTHING DYNAMIC IS CONSTRUCTED OR "
      + "RUN BY S7 — it is a verification tail, not a patch. The S2 and S6 splices produce "
      + "NO findings: a CoR block's own 'execute v_def' is migration-time machinery (this "
      + "file's doctrine above), and their installed fragments carry no execute token. The "
      + "declared set below is the installed apply_open_items body's FULL clara.* token "
      + "set — including three names that appear ONLY in the 0042 S5.22 explanatory "
      + "comment (_fa_today, staff_advance_summary, staff_advance_statement) and the "
      + "self-name, declared so a future finding-kind reclassification cannot red CI on "
      + "prose; none is a wiki token.",
    relations: ["open_items", "journal_entries", "open_item_allocations", "clients", "op_receipts", "audit_log", "domain_events", "firm_event_seq"],
    calls: ["_human_ctx", "role_rank", "_reserve_op", "_hash", "_canonical_counterparty",
      "_subledger_outstanding", "_book_today", "_audit", "_append_event", "_finish_op",
      "_fa_today", "staff_advance_summary", "staff_advance_statement", "apply_open_items"],
  }],
]);

/** Normalise a waiver value to {why, relations:Set, calls:Set}; a legacy string is a bare
 *  attestation with no declared targets. Returns null for a missing waiver. */
function normalizeWaiver(waiver) {
  if (waiver == null) return null;
  if (typeof waiver === "string") return { why: waiver, relations: new Set(), calls: new Set() };
  const rels = new Set((waiver.relations ?? []).map((s) => String(s).toLowerCase()));
  const calls = new Set((waiver.calls ?? []).map((s) => String(s).toLowerCase()));
  return { why: waiver.why ?? "", relations: rels, calls: calls };
}

/** Does `waiver` excuse finding `f`? Never a wiki hit; a reconstructible finding only when every
 *  referenced clara.<name> target is DECLARED and no declared target is a wiki token (F4). */
function waiverExcuses(waiver, f) {
  const w = normalizeWaiver(waiver);
  if (!w) return false;
  if (f.kind === "wiki") return false;                                   // never waivable
  const declared = new Set([...w.relations, ...w.calls]);
  for (const d of declared) if (WIKI_TOKENS.has(d)) return false;        // a waiver can't declare wiki
  if (f.kind === "unprovable") return true;                              // human attestation
  // "dynamic": every referenced clara.<name> must be declared.
  return (f.targets ?? []).every((t) => declared.has(t));
}

// The wiki RELATIONS and wiki-touch CALL tokens — the EXACT set migration 0019's tail scans for
// (0019:1069-1070). Ratchet R3 finding F8: the "names wiki" test is by WORD-BOUNDED token, not a
// bare `/wiki/i` substring, so `select 'wiki'::text` (which names no wiki relation or call) is not
// treated as an unwaivable wiki hit — it is a waivable dynamic finding instead.
const WIKI_RELATIONS = [
  "wiki_pages", "wiki_page_versions", "wiki_page_citations", "wiki_page_refs",
  "wiki_log", "wiki_budgets", "wiki_synthesis_holds",
];
const WIKI_CALLS = [
  "publish_wiki_page_version", "_publish_wiki_page_version_core", "record_wiki_source_ingest",
  "retire_wiki_page", "set_wiki_synthesis_hold", "clear_wiki_synthesis_hold", "get_wiki_page",
  "list_wiki_pages", "get_context_pack", "run_client_lint", "run_lint_all", "mark_wiki_citations_stale",
];
const WIKI_TOKENS = new Set([...WIKI_RELATIONS, ...WIKI_CALLS]);
const WIKI_TOKEN_RE = new RegExp(`\\b(${[...WIKI_RELATIONS, ...WIKI_CALLS].join("|")})\\b`, "i");

/** True when reconstructed SQL WORD-BOUNDED names a wiki relation or wiki-touch call — the same
 *  grain migration 0019's prosrc scan uses, applied to text the DB tail structurally cannot see
 *  (a dynamic statement's run-time value). NOT a bare `wiki` substring (F8). */
function namesWikiTarget(sql) {
  return WIKI_TOKEN_RE.test(sql);
}

/** The distinct wiki tokens a reconstructed statement names — NAMED in the finding so a long
 *  statement whose wiki relation falls past the snippet cap is still identified. */
function wikiTokensIn(sql) {
  const re = new RegExp(WIKI_TOKEN_RE.source, "gi");
  const out = new Set();
  let m;
  while ((m = re.exec(sql))) out.add(m[1].toLowerCase());
  return [...out];
}

/** Every distinct `clara.<name>` reference in reconstructed SQL, as bare lower-cased names — the
 *  "base-relation and call dependencies" a waiver must DECLARE (F4). Handles quoted and
 *  whitespace-qualified spellings (`clara . "wiki_pages"`). */
function claraTargets(sql) {
  const out = new Set();
  const re = /\bclara\s*\.\s*(?:"([A-Za-z0-9_]+)"|([A-Za-z0-9_]+))/gi;
  let m;
  while ((m = re.exec(sql))) out.add((m[1] ?? m[2]).toLowerCase());
  return [...out];
}

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

/** Index just past the single-quoted literal starting at `i` (which must be a quote).
 *
 *  RATCHET R4 — E-STRING FAIL-OPEN. PostgreSQL has two single-quoted forms: a STANDARD
 *  string `'…'` (standard_conforming_strings=on, PG's default since 9.1) where a backslash
 *  is literal and only `''` closes-then-reopens as an escaped quote; and an ESCAPE string
 *  `E'…'` / `e'…'` where `\'` and `\\` are C-style escapes AS WELL as `''`. The old scan
 *  handled only `''`, so `E'it\'s harmless'` under-skipped at `\'`, desynced every literal
 *  after it, and a real `execute 'select … clara.wiki_pages'` that followed went UNSEEN —
 *  a fail-open in the security gate. `escapes` is true only when the opening quote is
 *  immediately introduced by a word-boundaried E/e, matching PostgreSQL's own lexer. */
function skipQuoted(s, i) {
  const escapes = (s[i - 1] === "E" || s[i - 1] === "e")
    && !/[A-Za-z0-9_]/.test(s[i - 2] ?? " ");
  let j = i + 1;
  while (j < s.length) {
    if (escapes && s[j] === "\\") { j += 2; continue; }  // \' and \\ inside E'…' only
    if (s[j] !== "'") { j++; continue; }
    if (s[j + 1] === "'") { j += 2; continue; }           // '' in BOTH forms
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
  // F5 bypass #3: quoted (`"clara"."name"`) and whitespace-qualified (`clara . name`) identifiers
  // must be recognised, or a static definition can hide from the scan entirely.
  const re = /create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+"?clara"?\s*\.\s*(?:"([A-Za-z0-9_]+)"|([A-Za-z0-9_]+))\s*\(/gi;
  let m;
  while ((m = re.exec(masked))) {
    const name = m[1] ?? m[2];
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
      name,
      identity: functionIdentity(name, args.text),
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

/** Split an expression on TOP-LEVEL `||`, skipping single-quoted AND dollar-quoted regions and
 *  parens (ratchet R3 finding F5 — the replacement/DDL builder mixes both string forms). */
function splitConcat(expr) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === "'") { i = skipQuoted(expr, i); continue; }
    if (ch === "$") { const j = skipDollar(expr, i); if (j > i) { i = j; continue; } i++; continue; }
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

/** One expression part → its literal text, or null when the part is not a bare literal.
 *  Accepts single-quoted (`''` escapes) AND dollar-quoted (`$tag$…$tag$`) literals (F5). */
function literalText(part) {
  const t = part.trim();
  const sq = /^'((?:[^']|'')*)'$/.exec(t);
  if (sq) return sq[1].replace(/''/g, "'");
  const dq = /^\$([A-Za-z0-9_]*)\$([\s\S]*)\$\1\$$/.exec(t);
  if (dq) return dq[2];
  return null;
}

/**
 * STATIC PROOF of what a dynamic-SQL expression runs. `{proven:true, sql}` only when the whole
 * expression is a concatenation of string LITERALS (single- or dollar-quoted) and nothing else —
 * then `sql` is the exact statement text. Anything else is `{proven:false}` and, by the
 * fail-closed rule, a finding. A `||` that SPLITS a keyword (`'begin ex' || 'ecute …'`) is joined
 * back here, so the split cannot hide the installed statement (F5).
 */
export function staticSqlOf(expr) {
  let sql = "";
  for (const part of splitConcat(expr)) {
    const lit = literalText(part);
    if (lit === null) return { proven: false, sql: null };
    sql += lit;
  }
  return { proven: true, sql };
}

/**
 * Apply the fail-closed rule to one body/fragment → [{expr, kind, sql?, targets?}].
 *   'wiki'       — reconstructible AND word-bounded names a wiki relation/call. UNWAIVABLE.
 *   'dynamic'    — reconstructible, non-wiki. Ratchet R3 finding F4: reconstructibility is NOT
 *                  proof of safety — a view or helper (`clara.page_index` over `clara.wiki_pages`)
 *                  reaches wiki state with no wiki token in the text. So it is a FINDING, waivable
 *                  only by a waiver that DECLARES its `clara.<name>` targets.
 *   'unprovable' — not reconstructible at all (a variable, `format()`, `replace()`). Waivable by a
 *                  reviewed human attestation.
 * Never infers safety from string absence.
 */
export function dynamicSqlFindings(text) {
  const out = [];
  for (const { expr } of executeExpressions(text)) {
    const { proven, sql } = staticSqlOf(expr);
    if (!proven) { out.push({ expr, kind: "unprovable" }); continue; }
    if (namesWikiTarget(sql)) { out.push({ expr, kind: "wiki", sql, wikiTokens: wikiTokensIn(sql) }); continue; }
    out.push({ expr, kind: "dynamic", sql, targets: claraTargets(sql) });
  }
  return out;
}

const snippet = (s) => {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > 120 ? one.slice(0, 117) + "…" : one;
};
const why = (f) => {
  if (f.kind === "wiki") {
    const named = (f.wikiTokens && f.wikiTokens.length) ? ` (${f.wikiTokens.join(", ")})` : "";
    return `runs dynamic SQL that PROVABLY names "wiki"${named}: ${snippet(f.sql)}`;
  }
  if (f.kind === "dynamic") {
    const t = (f.targets && f.targets.length) ? `clara.${f.targets.join(", clara.")}` : "no clara.* target named";
    return `runs a RECONSTRUCTIBLE dynamic statement (${t}) whose transitive reach cannot be PROVEN`
      + ` wiki-free — a view or helper can reach wiki state with no wiki token in the text; it needs a`
      + ` justified DYNAMIC_SQL_ALLOWLIST waiver declaring its targets: ${snippet(f.sql)}`;
  }
  return `runs dynamic SQL whose target cannot be statically proven non-wiki: EXECUTE ${snippet(f.expr)}`;
};

const CREATE_FN_RE = /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i;

/** Every dynamic-SQL statement in `text` reconstructed to its literal value (proven ones only).
 *  Used to see a create/DDL statement whose keyword was SPLIT across `||` (F5 bypass #2). */
function reconstructedExecutes(text) {
  const out = [];
  for (const { expr } of executeExpressions(text)) {
    const { proven, sql } = staticSqlOf(expr);
    if (proven) out.push(sql);
  }
  return out;
}

/** The identity of a function a reconstructed `create … function clara.NAME(args)` DDL installs,
 *  or null. Handles quoted / whitespace-qualified identifiers (F5 bypass #3). */
function parseCreatedIdentity(ddl) {
  const m = /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\s+"?clara"?\s*\.\s*(?:"([A-Za-z0-9_]+)"|([A-Za-z0-9_]+))\s*\(/i.exec(ddl);
  if (!m) return null;
  const argsOpen = m.index + m[0].length - 1;
  const args = readParens(ddl, argsOpen);
  if (!args) return null;
  return functionIdentity(m[1] ?? m[2], args.text);
}

/** Every maximal `||`-concatenation of string literals in `text`, reconstructed to one string
 *  (length ≥ 2 parts). A replacement/DDL builder that SPLITS a keyword — `'begin ex' || 'ecute …'`
 *  — is joined here so `dynamicSqlFindings` can see the installed statement (F5 bypass #1). Single
 *  literals are already scanned separately, so only multi-part chains are emitted. */
function concatChains(text) {
  const s = maskComments(text);
  const isLitStart = (k) => s[k] === "'" || (s[k] === "$" && /^\$[A-Za-z0-9_]*\$/.test(s.slice(k)));
  const litEnd = (k) => (s[k] === "'" ? skipQuoted(s, k) : skipDollar(s, k));
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (!isLitStart(i)) { i++; continue; }
    let j = i, joined = "", count = 0, ok = true;
    for (;;) {
      const end = litEnd(j);
      if (end <= j) { ok = false; break; }
      const lit = literalText(s.slice(j, end));
      if (lit === null) { ok = false; break; }
      joined += lit; count++;
      let k = end;
      while (k < s.length && /\s/.test(s[k])) k++;
      if (s[k] === "|" && s[k + 1] === "|") {
        k += 2;
        while (k < s.length && /\s/.test(s[k])) k++;
        if (!isLitStart(k)) { j = end; break; } // `|| <non-literal>` ends the chain at the last literal
        j = k;
        continue;
      }
      j = end;
      break;
    }
    if (ok && count >= 2) out.push(joined);
    i = Math.max(j, i + 1);
  }
  return out;
}

/** A statically-known regprocedure signature from one SQL expression. Only a
 * single literal (optionally cast) is proof; concatenation and format() remain
 * unresolved and therefore fail-closed. */
function literalRegprocedureIdentity(expr) {
  const lit = /^\s*'((?:[^']|'')*)'\s*(?:::\s*(?:text|regprocedure))?\s*$/i.exec(expr);
  return lit ? signatureIdentity(lit[1].replace(/''/g, "'")) : null;
}

/** Resolve the latest assignment to `name` before `before`, whatever its shape.
 * The migration family uses both declaration initializers and later `:=`
 * assignments. R-round fix: the PREVIOUS version only matched LITERAL-valued
 * assignments, so a variable first assigned a literal and LATER reassigned a
 * computed/conditional value (a decoy) was reported as the literal -- the
 * regex simply never saw the reassignment at all, since it wasn't looking for
 * assignments in general, only for ones shaped like a literal. Track EVERY
 * assignment to `name` in program order; only the assignment CLOSEST to
 * `before` decides the outcome. If that closest assignment is not a plain
 * string literal (a function call, concatenation, another variable, `case`,
 * anything computed or conditional), the target is UNRESOLVED -- fail closed,
 * exactly like an unresolvable literal always has. An EARLIER literal
 * assignment that a later reassignment has since overwritten must never be
 * mistaken for the current value. */
function assignedRegprocedureIdentity(block, name, before) {
  const prefix = block.slice(0, before);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Matches ANY assignment shape -- declaration initializer or later plain
  // reassignment -- capturing the RHS up to its terminating `;` regardless of
  // whether that RHS is a literal. This is the general form; literal-ness is
  // decided AFTER finding the latest one, not as part of matching it.
  const general = new RegExp(
    `\\b${escaped}\\s*(?:constant\\s+)?(?:text|regprocedure)?\\s*:=\\s*`
      + `([\\s\\S]*?);`,
    "gi",
  );
  let latest = null;
  let m;
  while ((m = general.exec(prefix))) {
    if (latest === null || m.index > latest.index) {
      latest = { index: m.index, rhs: m[1] };
    }
  }
  if (latest === null) return null;
  // Now, and ONLY now, check whether the LATEST assignment's RHS is a bare
  // literal (optionally cast). Any other shape -- including one that merely
  // starts with a quote but isn't a single self-contained literal -- is
  // unresolved, never silently downgraded to an earlier value.
  const literal = /^\s*'((?:[^']|'')*)'\s*(?:::\s*(?:text|regprocedure))?\s*$/i.exec(latest.rhs);
  return literal ? signatureIdentity(literal[1].replace(/''/g, "'")) : null;
}

/** Resolve one pg_get_functiondef argument using every statically-attributable
 * shape present in this migration family: a direct signature literal, a
 * text/regprocedure variable holding that literal, or an `oid` argument whose
 * SELECT constrains oid to either shape. Everything else returns null. */
function coRTargetIdentity(block, argText, callStart, callEnd) {
  const direct = literalRegprocedureIdentity(argText);
  if (direct) return direct;

  const variable = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:::\s*regprocedure)?\s*$/i.exec(argText);
  if (variable && variable[1].toLowerCase() !== "oid") {
    return assignedRegprocedureIdentity(block, variable[1], callStart);
  }

  // pg_get_functiondef(oid) FROM pg_proc ... WHERE p.oid=<known signature>.
  // Attribution is limited to this SELECT statement so a signature elsewhere
  // in the block cannot be borrowed for the wrong call.
  const statementEnd = block.indexOf(";", callEnd);
  const statement = block.slice(callEnd, statementEnd < 0 ? block.length : statementEnd);
  const rhs = /\b(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?oid\s*=\s*('(?:[^']|'')*'\s*::\s*regprocedure|[A-Za-z_][A-Za-z0-9_]*\s*::\s*regprocedure)/i.exec(statement);
  if (rhs) {
    const literal = literalRegprocedureIdentity(rhs[1]);
    if (literal) return literal;
    const sigVar = /^\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(rhs[1]);
    if (sigVar) return assignedRegprocedureIdentity(block, sigVar[1], callStart);
  }
  const lhs = /('(?:[^']|'')*'\s*::\s*regprocedure|[A-Za-z_][A-Za-z0-9_]*\s*::\s*regprocedure)\s*=\s*(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?oid\b/i.exec(statement);
  if (lhs) {
    const literal = literalRegprocedureIdentity(lhs[1]);
    if (literal) return literal;
    const sigVar = /^\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(lhs[1]);
    if (sigVar) return assignedRegprocedureIdentity(block, sigVar[1], callStart);
  }
  return null;
}

// ---------------------------------------------------------------------------
// CENSUS READS — ONE EXEMPT GRAMMAR, MATCHED POSITIVELY. EVERYTHING ELSE FAILS CLOSED.
//
// A CoR patch SITE is a read of a function body that is rewritten and `execute`d back. That
// is what makes an unattributable target dangerous: an unknown body goes in, DDL comes out.
// The SAME builtin is also used, in the same migration family, as a pure CATALOG PREDICATE —
// `… where (coalesce(p.prosrc,'') || coalesce(pg_get_functiondef(p.oid),'')) like '%…%'`
// inside a `select count(*) into v_n` consumer census. That call's value is consumed by an
// aggregate and lands in an int; no DDL can ever be built from it. Demanding a signature
// binding for it is demanding attribution for a read that patches nothing.
//
// WHY THIS IS A GRAMMAR AND NOT A FLOW ANALYSIS [merge-gate MB1, 2026-08-04]. The first cut
// keyed the exemption on VALUE FLOW: exempt when no bound name could reach an `execute`. A
// cross-model merge gate probed that analysis with five shapes and ALL FIVE were exempted:
//   (1) `v_cmd = replace(v_def,…); execute v_cmd;`  — an `=` assignment, which the binding
//       closure did not recognise (it read `:=` only), so v_def never "reached" the execute;
//   (2) `v_cmd[1] := …; execute v_cmd[1];`          — a subscripted target, likewise unseen;
//   (3) `execute format(… pg_get_functiondef(…) …) into v_dummy;` — an `EXECUTE … INTO` read
//       as a BINDING statement rather than as an execute;
//   (4) `execute '…$1…' into v_dummy using v_def;`  — `readExecuteExpr` stops at `using`, so
//       the USING values were never part of any execute expression; and
//   (5) a string LITERAL containing the text `into v_safe` — a phantom binding.
// A sound flow analysis over arbitrary PL/pgSQL is not a thing this repo can maintain, and a
// fail-OPEN default in the only hole of a fail-closed gate is the wrong trade. So the test is
// inverted: the exemption is a WHITELIST OF ONE STATEMENT SHAPE, matched positively. Anything
// a single reader would not instantly recognise as "a catalog count" is not exempt.
//
// THE GRAMMAR — all of it, on the comment-masked statement, keywords taken at paren depth 0
// with every string literal and dollar-quoted region blanked:
//   (a) the statement's first word is `select`;
//   (b) the select list — everything between `select` and the statement's single top-level
//       `into` — is exactly `count(*)`, optionally cast (`count(*)::int`);
//   (c) there is EXACTLY ONE top-level `into`, and its target is ONE plain identifier
//       immediately followed by `from` (no comma list, no `strict`, no dotted, record or
//       subscripted target);
//   (d) there is a top-level `where`, and EVERY `pg_get_functiondef` occurrence in the
//       statement — scanned RAW, literals included — sits AFTER it, i.e. inside the
//       predicate, never in the select list, the FROM list or the INTO target;
//   (e) the statement contains no `execute` and no `using` at all; and
//   (f) BELT, textual and deliberately over-broad: the bound name appears in NO statement of
//       the block that mentions `execute` anywhere, and in no `execute` expression the lexer
//       reconstructs. This is what closes probe (4) — the USING values the expression reader
//       drops are still identifiers of a statement that says `execute`.
// Everything else — every other statement shape, every call the grammar does not cover — is
// an unattributed patch site and FAILS CLOSED, exactly as it did before the exemption existed.
// ---------------------------------------------------------------------------

/** Every identifier-shaped word in `text`, lower-cased. Keywords are included on purpose:
 *  the belt set is an over-approximation and a false member only fails harder. */
function identifierWords(text) {
  return (String(text).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((w) => w.toLowerCase());
}

/** Split a `do` block into top-level `;`-terminated statements, respecting both string forms.
 *  `masked` must be the comment-masked block (same length), so offsets stay usable in the raw. */
function blockStatements(masked) {
  const out = [];
  let start = 0, i = 0;
  while (i < masked.length) {
    const ch = masked[i];
    if (ch === "'") { i = skipQuoted(masked, i); continue; }
    if (ch === "$") { const j = skipDollar(masked, i); if (j > i) { i = j; continue; } i++; continue; }
    if (ch === ";") { out.push({ text: masked.slice(start, i), start, end: i }); start = i + 1; i++; continue; }
    i++;
  }
  if (start < masked.length) out.push({ text: masked.slice(start), start, end: masked.length });
  return out;
}

/** A length-preserving view of one statement with every string literal and dollar-quoted
 *  region BLANKED, plus the paren depth at every offset — so a keyword can be located at the
 *  statement's own top level rather than inside a literal (probe 5) or a subquery. */
function topLevelView(text) {
  const chars = text.split("");
  const depth = new Array(text.length).fill(0);
  let d = 0, i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < text.length; k++) {
      if (chars[k] !== "\n") chars[k] = " ";
      depth[k] = d;
    }
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") { const j = skipQuoted(text, i); blank(i, j); i = j; continue; }
    if (ch === "$") {
      const j = skipDollar(text, i);
      if (j > i) { blank(i, j); i = j; continue; }
    }
    if (ch === "(") { depth[i] = d; d++; i++; continue; }
    if (ch === ")") { d = Math.max(0, d - 1); depth[i] = d; i++; continue; }
    depth[i] = d;
    i++;
  }
  return { plain: chars.join(""), depth };
}

/** Offsets of every depth-0 match of a /g-flagged `re` in the blanked view. */
function topLevelMatches(view, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(view.plain))) {
    if (view.depth[m.index] === 0) out.push(m.index);
  }
  return out;
}

const CENSUS_COUNT_LIST = /^\s*count\s*\(\s*\*\s*\)\s*(?:::\s*[A-Za-z_][A-Za-z0-9_]*\s*)?$/i;
const CENSUS_INTO_TARGET = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\b/i;

/** The census grammar (a)–(e) above, matched positively on ONE statement.
 *  Returns the single bound variable name, or null for "not this shape". */
function censusStatementBinding(text) {
  if (/\bexecute\b/i.test(text) || /\busing\b/i.test(text)) return null;          // (e)
  const view = topLevelView(text);
  const head = /^\s*select\b/i.exec(view.plain);                                  // (a)
  if (!head) return null;
  const intos = topLevelMatches(view, /\binto\b/gi);                              // (c)
  if (intos.length !== 1) return null;
  if (!CENSUS_COUNT_LIST.test(view.plain.slice(head[0].length, intos[0]))) return null;   // (b)
  const target = CENSUS_INTO_TARGET.exec(view.plain.slice(intos[0] + "into".length));
  if (!target) return null;                                                       // (c)
  const wheres = topLevelMatches(view, /\bwhere\b/gi);                            // (d)
  if (wheres.length === 0) return null;
  const calls = /pg_get_functiondef/gi;
  let c;
  while ((c = calls.exec(text))) {
    if (c.index < wheres[0]) return null;      // a call outside the predicate is not a census
  }
  return target[1].toLowerCase();
}

/**
 * `pg_get_functiondef(` call offsets (into the comment-masked block) that match the census
 * grammar EXACTLY. Returns `offset -> boundVariableName` so the caller can PRINT what it
 * exempted — a silent exemption is invisible policy. Everything else is absent from the map
 * and keeps whatever attribution `coRTargetIdentity` could (or could not) make.
 */
function censusReadOffsets(block) {
  // `maskComments` SKIPS dollar-quoted regions, so the interior of a `do $tag$ … $tag$` block
  // reaches here with its `--` comments intact — mask the block ITSELF, or a keyword in a
  // comment becomes a statement and an apostrophe in one ("pg_get_functiondef's") opens a
  // phantom literal that swallows the rest of the analysis. Length is preserved, so every
  // offset below still lines up with the caller's scan of the raw block.
  const masked = maskComments(block);
  const statements = blockStatements(masked);

  // (f) THE BELT. Every identifier of every statement that so much as mentions `execute`,
  // plus every identifier of every reconstructed execute EXPRESSION. Whole statements are
  // used on purpose: `execute … using v_def` drops its USING values from the expression the
  // lexer reads, and that gap is exactly probe (4).
  const executeTouched = new Set();
  for (const st of statements) {
    if (!/\bexecute\b/i.test(st.text)) continue;
    for (const w of identifierWords(st.text)) executeTouched.add(w);
  }
  for (const { expr } of executeExpressions(block)) {
    for (const w of identifierWords(expr)) executeTouched.add(w);
  }

  const out = new Map();
  const re = /pg_get_functiondef\s*\(/gi;
  let m;
  while ((m = re.exec(masked))) {
    const st = statements.find((s) => m.index >= s.start && m.index < s.end);
    if (!st) continue;
    const bound = censusStatementBinding(st.text);
    if (!bound) continue;                        // not the census grammar ⇒ patch site
    if (executeTouched.has(bound)) continue;     // (f) the name is near DDL ⇒ patch site
    out.set(m.index, bound);
  }
  return out;
}

/**
 * Every CHANGE-OF-RECORD patch: a `do $tag$ … $tag$` block that installs a callable
 * surface — it reads a function body with `pg_get_functiondef` and `execute`s a rewritten
 * version, or it dynamically creates a function/procedure.
 * Returns {line, tag, kind, targets:[identity|null], censusOnly:[boolean],
 * censusReads:[{line, variable}], whitelisted, fragments:[string]}. `censusOnly[i]` marks a
 * `null` target that matches the census GRAMMAR exactly (see above) rather than an
 * unattributable patch site; `targets` itself is unchanged, so a consumer that ignores the
 * new field behaves exactly as before.
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
    // Create detection is RECONSTRUCTION-based (F5 bypass #2): a `'create ' || 'function …'` split
    // defeats a contiguous-keyword regex, so also test every reconstructed dynamic statement.
    const dynamicCreates = reconstructedExecutes(block).filter((s) => CREATE_FN_RE.test(s));
    const createsAFunction = CREATE_FN_RE.test(masked) || dynamicCreates.length > 0;
    if (!patchesABody && !createsAFunction) continue;   // installs no callable surface
    if (!/\bexecute\b/i.test(masked)) continue;         // reads a body but installs nothing

    // Targets: EVERY pg_get_functiondef call (a computed argument yields `null` — an unresolved
    // target — so a MIX of a whitelisted literal and a computed one can no longer inherit the
    // whitelist), PLUS the identity of every dynamically-CREATED function (F5 bypass #3).
    const targets = [];
    const censusOnly = [];
    const censusReads = [];
    const census = patchesABody ? censusReadOffsets(block) : new Map();
    const tre = /pg_get_functiondef\s*\(/gi;
    let t;
    while ((t = tre.exec(masked))) {
      const arg = readParens(masked, t.index + t[0].length - 1);
      if (!arg) { targets.push(null); censusOnly.push(false); continue; }
      const identity = coRTargetIdentity(block, arg.text, t.index, arg.end);
      // The exemption is consulted ONLY where attribution failed, so it can never REMOVE a
      // resolved signature — it only distinguishes "unattributable patch site" (fail closed)
      // from "not a patch site at all" (a proven census read).
      const exempt = identity === null && census.has(t.index);
      targets.push(identity);
      censusOnly.push(exempt);
      if (exempt) {
        censusReads.push({ line: lineOf(sql, open + t.index), variable: census.get(t.index) });
      }
      tre.lastIndex = arg.end;
    }
    for (const ddl of dynamicCreates) { targets.push(parseCreatedIdentity(ddl)); censusOnly.push(false); }
    if (targets.length === 0) { targets.push(null); censusOnly.push(false); }

    // FRAGMENTS = the text that ends up inside the persistent surface.
    //
    // For the CoR idiom that is the injected text: the dollar-quoted segments, the single-quoted
    // literals of the surrounding plain text, AND every reconstructed multi-part `||` chain in that
    // plain text (F5 bypass #1 — a replacement whose keyword is split across literals). The block's
    // own `execute v_next` lives in the plain text OUTSIDE any literal and is NOT a fragment — it is
    // migration-time machinery, not a persistent surface.
    //
    // For a block that dynamically CREATEs a function, the persistent surface IS the block's own
    // dynamic SQL, so the block itself is the fragment.
    let fragments;
    if (patchesABody) {
      const segments = dollarSegments(block);
      fragments = segments.map((s) => s.body);
      let cursor = 0;
      for (const seg of [...segments, { start: block.length, end: block.length }]) {
        if (seg.start > cursor) {
          const plain = block.slice(cursor, seg.start);
          fragments.push(...quotedLiterals(plain));
          fragments.push(...concatChains(plain));
        }
        cursor = seg.end;
      }
      if (createsAFunction) fragments.push(block); // a mixed patch+creator: scan the created DDL too
    } else {
      fragments = [block];
    }

    out.push({
      line: lineOf(sql, m.index),
      tag,
      kind: patchesABody ? "change-of-record patch" : "dynamic function-creating `do` block",
      targets,
      censusOnly,
      censusReads,
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
      // A justified waiver excuses an UNPROVABLE or a target-DECLARED reconstructible statement.
      // It can never excuse dynamic SQL that provably names wiki — a finding for every function.
      if (waiverExcuses(waiver, f)) continue;
      findings.push(`  ${d.file}:${d.line}  clara.${identity}  — ${why(f)}`);
    }
  }
  for (const p of patches) {
    if (p.whitelisted) continue;
    const named = p.targets
      .map((t) => (t === null ? "<unresolved target>" : `clara.${t}`))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    // F8: a waiver applies to a CoR patch ONLY when it has a SINGLE literal-resolved target (a
    // computed/unresolved target is never waivable, and a mixed patch keeps every finding).
    const litTargets = [...new Set(p.targets.filter((x) => x !== null))];
    const waiver = (p.targets.every((x) => x !== null) && litTargets.length === 1)
      ? (DYNAMIC_SQL_ALLOWLIST.get(litTargets[0]) ?? null) : null;
    let reported = false;
    for (const frag of p.fragments) {
      for (const f of dynamicSqlFindings(frag)) {
        if (waiverExcuses(waiver, f)) continue;
        findings.push(
          `  ${p.file}:${p.line}  ${p.kind} → ${named}`
          + `  — the INSTALLED body ${why(f)}`);
        reported = true;
        break;
      }
      if (reported) break;
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
