// Release ceremony for riders wave 4 (0295...0318) - read-only preflight. Child of
// scripts/ops/dsn-pipe.mjs (DATABASE_URL in env) or PG* for a rig. Prints facts only, never the
// DSN, never an e-mail address, never any personal data.
//
// EVERY STATEMENT IS A SELECT INSIDE ONE `begin transaction read only`, and each one runs under
// its OWN SAVEPOINT, so a soft failure (a relation a rig does not carry) never poisons the rest.
// The transaction mode is the belt: a stray write raises 25006 rather than landing.
//
// NOTHING IN THIS FILE IS TRANSCRIBED FROM A MIGRATION. The wave's migration list, every
// expected row count, every sha pin, every CHECK/INDEX/COLUMN predicate and every refusal
// literal is PARSED out of the directory named by CLARA_MIGRATIONS_DIR at run time. A literal
// this script cannot parse is reported as a PARSE GAP and counts as a STOP, because an unchecked
// precondition is unchecked.
//
// WHAT CHANGED FROM ceremony-w3/reads-w3.mjs, and why. All six are wave-4 findings measured in
// the files, not taste:
//
//  1. FRONTIER. The wave builds on 288 applied / 0293_fa_arrears_judgement_scope and adds the
//     files above it. The arithmetic is still derived, never written down: the ledger is read
//     and the pending set is whatever sorts above the live frontier.
//
//  2. THE FUNCTION-BODY PINS ARE READ AND RE-MEASURED, NOT LEFT TO THE FINGERPRINT. Wave 3 had
//     a handful of prestate `prosrc` pins and let section 3's fingerprint cover them in one
//     place. Wave 4 carries 189 across the 21 files, in FIVE different spellings (a
//     `values (...)` roster, an `array[['sig','pre','post'],...]` roster, a scalar
//     `if v_sha <> '...'` after a `p.oid = '<sig>'::regprocedure` read, the same scalar form
//     reached through a declared signature VARIABLE, and a DISJUNCTIVE OVERRIDE
//     `or (<roster>[i][1] = '<sig>' and v_sha = '<sha>')` that widens one entry of a roster
//     whose tuple carries a different value). Section 1's pin parser reads all five, and
//     section 5 re-measures each signature on the target and compares it to the file's own
//     admitted set. A mismatch is what will refuse INSIDE the window, so it is found before it.
//     The fifth spelling is how the wave-4 INTEGRATION recorded its two cross-lane bimodal
//     admissions (0308, for `clara.create_accounting_plan` and `clara._plan_admit_occurrence`,
//     both of which a LOWER-numbered lane also moves); a reader that saw only the tuple
//     under-reported what the file admits.
//
//  3. A PIN MAY BE CHAIN-INTERNAL, AND A CHAIN-INTERNAL PIN IS NOT MEASURABLE BEFORE THE WINDOW.
//     This wave's lanes recut each other on purpose: 0299 pins `clara._assert_field_path` to the
//     body 0296 produces, 0298 pins `clara._post_payroll_run` to the body 0297 produces, 0300
//     pins three bodies 0299 produces, 0318 pins the three knowledge bodies 0310 produces, and
//     six files splice `clara.list_review_queue` one after another. Measuring such a pin against
//     hosted before the window would compare the PRE-WAVE body against a POST-0296 expectation
//     and invent a STOP. So every pin is classified: a signature an EARLIER PENDING file
//     produces (recuts, or splices by reading its own `prosrc` and re-executing it) is reported
//     as `note CHAINED`, naming the file that produces it, and never counted. Everything else is
//     measured and STOPs on drift. The classification is parsed, never listed.
//
//  4. AN ADDED COLUMN MAY CARRY A DEFAULT, AND THEN THE CHECK ON IT IS NOT VACUOUS. Wave 3's
//     generic CHECK reader assumed a column a pending file adds is NULL on every existing row
//     and that the CHECK admits NULL. 0304 adds `side text not null default 'expense'` and then
//     constrains `side in ('expense','revenue')`: every existing row is backfilled with the
//     DEFAULT, not with NULL. The ADD COLUMN parser therefore captures the type and the default,
//     and the CHECK reader evaluates the predicate against the default value rather than
//     assuming NULL. A default it cannot parse is a GAP, never a pass.
//
//  5. A CONSTRAINT SWAP IS READ WITH ITS LIVE DEFINITION TEXT. Eight of this wave's constraints
//     arrive as `drop constraint if exists X` + `add constraint X check (...)` on a LIVE
//     relation. The generated reader prints the CURRENT `pg_get_constraintdef` beside the new
//     predicate, so a widening and a narrowing are told apart by reading rather than by trust,
//     and the row census that decides the narrowing is run.
//
//  6. THE WAVE MINTS TWO ROLES, AND A ROLE READ IS STILL NEVER A STOP ON DRIFT. 0309 creates
//     `clara_invite_preview` and `clara_invite_preview_login`. Their ABSENCE before the window
//     is a first-apply PRECONDITION and is checked (0309 refuses a half-applied set of its four
//     objects). The wave-3 rule is otherwise unchanged: `role:` and `rolemember:` FINGERPRINT
//     differences print as `env` lines with both sides and never count, because the rig is a
//     trust cluster and hosted is a managed estate whose role catalog differs for reasons no
//     migration touches.
//
//   node reads-w4.mjs --plan --frontier-before <v>       OFFLINE. Parse the directory and print
//                                                        the pending set, the generated reads,
//                                                        the parsed pins and the parsed
//                                                        literals. No database.
//   node reads-w4.mjs [--prod] [--baseline <f>]          PRE-WINDOW: identity, ledger, drift
//                                                        gate, pending set, estate fingerprint
//                                                        vs <f>, data preconditions, body pins,
//                                                        quiescence census.
//   node reads-w4.mjs --export-fingerprint <f> [--prod]  Write the estate fingerprint to <f>.
//   node reads-w4.mjs --census [--prod]                  ONLY the quiescence census.
//   node reads-w4.mjs --post [--baseline <f>] [--prod]   AFTER the migrate: ledger 288+N at the
//                                                        highest pending version, every new row
//                                                        at its file checksum, fingerprint vs
//                                                        the UPGRADED baseline.
//
// Options: --state <f> (default: reads-w4.state.json beside this file) carries the pre-window
// ledger reading forward so --post can re-derive the 288 + N arithmetic; --frontier-before <v>
// overrides it. --no-state suppresses the write. --pins-only runs section 5's pin re-measurement
// alone (useful against a rig at the wave's own frontier).
//
// Exit code is non-zero when any check says STOP.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.CLARA_REPO || "C:/Users/zhant/Desktop/clara-rebuild";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const PROD = flag("--prod");
const POST = flag("--post");
const ONLY_CENSUS = flag("--census");
const ONLY_PINS = flag("--pins-only");
const PLAN_ONLY = flag("--plan");
const EXPORT_TO = opt("--export-fingerprint");
const BASELINE = opt("--baseline");
const STATE_FILE = opt("--state", join(HERE, "reads-w4.state.json"));
const NO_STATE = flag("--no-state");
const FRONTIER_BEFORE_ARG = opt("--frontier-before");

const MIGRATIONS_DIR = process.env.CLARA_MIGRATIONS_DIR || `${REPO}/packages/db/migrations`;

// ==========================================================================================
// 0 · THE DIRECTORY. The migration list and the checksum recipe, both mirrored from
//     packages/db/scripts/migrate.mjs (sha256 over CRLF -> LF text). migrate.mjs aborts the
//     WHOLE run on one applied row whose file has moved, so a drift here is a STOP before the
//     window rather than a surprise inside it.
// ==========================================================================================
const migrationChecksum = (text) =>
  createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");

const FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();
const VERSIONS = FILES.map((f) => f.replace(/\.sql$/, ""));
const textOf = (version) =>
  readFileSync(join(MIGRATIONS_DIR, `${version}.sql`), "utf8").replace(/\r\n/g, "\n");
/** A migration's text with every `--` line comment removed: what actually runs. */
const codeOf = (version) =>
  textOf(version)
    .split("\n")
    .map((l) => (/^\s*--/.test(l) ? "" : l))
    .join("\n");

/**
 * A migration's EXECUTED text: codeOf with every `create [or replace] function ... $tag$ ... $tag$`
 * BODY blanked out. A function body is inert at apply time - `create or replace function` stores
 * text and runs none of it - so a `create index`, an `alter table` or an `update` INSIDE one must
 * never generate a data-precondition read. A `do $tag$ ... $tag$` block is NOT blanked: it runs.
 * Dollar-quote nesting is handled by scanning tag to matching tag, which is how the server reads
 * them too.
 */
const execOf = (version) => {
  const t = codeOf(version);
  const re = /\$([a-zA-Z_0-9]*)\$/g;
  const spans = [];
  let m;
  while ((m = re.exec(t))) {
    const tag = m[0];
    const s = m.index;
    const e = t.indexOf(tag, s + tag.length);
    if (e < 0) break;
    spans.push([s, e + tag.length]);
    re.lastIndex = e + tag.length;
  }
  let out = "";
  let cur = 0;
  for (const [s, e] of spans) {
    if (s < cur) continue;
    const head = t.slice(cur, s);
    const stmt = head.slice(head.lastIndexOf(";") + 1);
    const isFunctionBody = /\bcreate\s+(or\s+replace\s+)?function\b/i.test(stmt);
    out += head + (isFunctionBody ? "\n/*inert function body*/\n" : t.slice(s, e));
    cur = e;
  }
  return out + t.slice(cur);
};

let stops = 0;
let gaps = 0;
const say = (s = "") => console.log(s);
const check = (label, ok, detail = "") => {
  say(`  ${ok ? "ok  " : "STOP"} ${label}${detail ? " - " + detail : ""}`);
  if (!ok) stops++;
};
const note = (label, detail = "") => say(`  note ${label}${detail ? " - " + detail : ""}`);
const envline = (label, detail = "") => say(`  env  ${label}${detail ? " - " + detail : ""}`);
const gap = (label, detail = "") => {
  say(`  GAP  ${label}${detail ? " - " + detail : ""}`);
  gaps++;
  stops++;
};
const fmt = (rows) =>
  rows
    .map((r) => Object.values(r).map((v) => (v === null ? "null" : String(v))).join(" | "))
    .join("\n  ") || "(none)";

// ==========================================================================================
// 1 · THE LITERAL PARSER. Every expected number, sha and census this script asserts is pulled
//     out of a migration's own text by an anchor regex, searched across the PENDING files only.
//     Exactly one file must match; zero, or two that disagree, is a PARSE GAP, never a guess.
// ==========================================================================================
let PENDING = []; // filled once the ledger frontier is known (or, offline, from --frontier-before)

function literal(label, anchor) {
  const hits = [];
  for (const v of PENDING) {
    const m = anchor.exec(codeOf(v));
    anchor.lastIndex = 0;
    if (m) hits.push({ version: v, value: m[1] });
  }
  if (hits.length === 0) {
    gap(`literal ${label}`, `no pending file matches the anchor ${anchor}`);
    return null;
  }
  // Several files in one wave routinely restate the same precondition. Agreement is the normal
  // case and is used; DISAGREEMENT is the finding, because then the wave contradicts itself.
  const values = [...new Set(hits.map((h) => h.value))];
  if (values.length !== 1) {
    gap(
      `literal ${label}`,
      `pending files disagree: ${hits.map((h) => `${h.version}=${h.value}`).join(", ")}`,
    );
    return null;
  }
  return { version: hits.map((h) => h.version.slice(0, 4)).join("/"), value: values[0] };
}

/** Balanced-paren extraction from `code` starting at the `(` at index `open`. Quote-aware. */
function balanced(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === "'") {
      i++;
      while (i < code.length) {
        if (code[i] === "'" && code[i + 1] === "'") { i += 2; continue; }
        if (code[i] === "'") break;
        i++;
      }
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return { expr: code.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/**
 * Every `alter table clara.X add constraint N check (E)` the pending set EXECUTES, with E
 * balanced-paren extracted. Covers the bare form and the `execute $sql$ ... $sql$` form.
 */
function parsedCheckConstraints() {
  const out = [];
  // `[^;]` rather than `[\s\S]`: an `alter table` and the `add constraint` it carries are ONE
  // statement. 0317 writes four guarded FK/CHECK adds in one DO block, each in its own `if
  // not exists ... then alter table X ... end if;` - a bridge that may cross a `;` pairs the
  // alter of one statement with the constraint of the next and names the wrong relation.
  const re =
    /alter\s+table\s+(clara\.[a-z_0-9]+)\s+(?:[^;]{0,400}?)?add\s+constraint\s+([a-z_0-9]+)\s+check\s*\(/gi;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) {
      const open = re.lastIndex - 1;
      const b = balanced(code, open);
      if (!b) { gap(`CHECK ${m[2]} in ${v}`, "unbalanced parentheses"); continue; }
      out.push({ version: v, table: m[1], name: m[2], expr: b.expr.replace(/\s+/g, " ").trim() });
      re.lastIndex = b.end;
    }
    re.lastIndex = 0;
  }
  return out;
}

/**
 * Every constraint the pending set DROPS before re-adding it - the estate's constraint-swap
 * idiom. New in wave 4: eight of this wave's CHECKs arrive this way on a LIVE relation, and the
 * question "is this a widening or a narrowing" is answered by reading the CURRENT definition
 * beside the new predicate, never by trusting a header.
 */
function parsedDroppedConstraints() {
  const out = [];
  const re =
    /alter\s+table\s+(clara\.[a-z_0-9]+)\s+drop\s+constraint\s+(?:if\s+exists\s+)?([a-z_0-9]+)/gi;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) out.push({ version: v, table: m[1], name: m[2] });
    re.lastIndex = 0;
  }
  return out;
}

/** Every `alter table clara.X add constraint N foreign key (cols) references R(...)` executed. */
function parsedForeignKeys() {
  const out = [];
  const re =
    /alter\s+table\s+(clara\.[a-z_0-9]+)\s+(?:[^;]{0,400}?)?add\s+constraint\s+([a-z_0-9]+)\s+'?\s*\|?\|?\s*'?\s*foreign\s+key\s*\(/gi;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) {
      const open = re.lastIndex - 1;
      const b = balanced(code, open);
      if (!b) { gap(`FK ${m[2]} in ${v}`, "unbalanced parentheses"); continue; }
      const after = code.slice(b.end, code.indexOf(";", b.end));
      const rm = /references\s+(clara\.[a-z_0-9]+)/i.exec(after);
      out.push({
        version: v,
        table: m[1],
        name: m[2],
        cols: b.expr.replace(/\s+/g, " ").trim().split(",").map((c) => c.trim()),
        references: rm ? rm[1] : "(unparsed)",
      });
      re.lastIndex = b.end;
    }
    re.lastIndex = 0;
  }
  return out;
}

/**
 * Every column the pending set ADDS to an EXISTING relation, WITH ITS TYPE AND DEFAULT.
 *
 * WAVE-4 CHANGE (finding 4). Wave 3's reader captured the column NAME only, and its CHECK
 * reader then assumed every existing row is NULL there. 0304 adds
 * `side text not null default 'expense'`: Postgres fills the DEFAULT into every existing row as
 * part of the ADD, so the CHECK on it is evaluated against 'expense', not against NULL. The
 * default is therefore parsed here and used there. A default this parser cannot read is left
 * null, and the CHECK reader turns that into a GAP rather than a pass.
 */
function parsedAddColumns() {
  const out = [];
  const push = (version, table, column, tail) => {
    const notnull = /\bnot\s+null\b/i.test(tail || "");
    const dm = /\bdefault\s+('(?:[^']|'')*'|[a-z_0-9.]+(?:\([^)]*\))?)/i.exec(tail || "");
    out.push({
      version,
      table,
      column,
      notnull,
      dflt: dm ? dm[1].trim() : null,
      declared: (tail || "").replace(/\s+/g, " ").trim().slice(0, 160),
    });
  };
  for (const v of PENDING) {
    const code = execOf(v);
    // static, including multi-column lists: take the whole statement and scan it
    const re = /alter\s+table\s+(clara\.[a-z_0-9]+)\b([\s\S]*?);/gi;
    let m;
    while ((m = re.exec(code))) {
      const table = m[1];
      const body = m[2];
      const cre = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_0-9]+)([^,;]*)/gi;
      let c;
      while ((c = cre.exec(body))) push(v, table, c[1], c[2]);
    }
    // dynamic
    const dre =
      /execute\s+'alter\s+table\s+(clara\.[a-z_0-9]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_0-9]+)([^']*)/gi;
    let d;
    while ((d = dre.exec(code))) push(v, d[1], d[2], d[3]);
  }
  // de-duplicate (a dynamic add is also matched by the static scan when the quoting lines up)
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.table}.${r.column}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Every `create [unique] index N on clara.X (cols) [where pred]` the pending set executes. */
function parsedIndexes() {
  const out = [];
  const re =
    /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_0-9]+)\s+on\s+(clara\.[a-z_0-9]+)\s*\(/gi;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) {
      const open = re.lastIndex - 1;
      const b = balanced(code, open);
      if (!b) { gap(`INDEX ${m[2]} in ${v}`, "unbalanced parentheses"); continue; }
      const semi = code.indexOf(";", b.end);
      const rest = code.slice(b.end + 1, semi < 0 ? code.length : semi);
      const wm = /^\s*where\s+([\s\S]+)$/i.exec(rest);
      out.push({
        version: v,
        unique: Boolean(m[1]),
        name: m[2],
        table: m[3],
        cols: b.expr.replace(/\s+/g, " ").trim(),
        pred: wm ? wm[1].replace(/\s+/g, " ").trim() : null,
      });
      re.lastIndex = semi < 0 ? code.length : semi + 1;
    }
    re.lastIndex = 0;
  }
  return out;
}

/** Every `alter table clara.X alter column c set not null` the pending set executes. */
function parsedSetNotNull() {
  const out = [];
  const re = /alter\s+table\s+(clara\.[a-z_0-9]+)\s+alter\s+column\s+([a-z_0-9]+)\s+set\s+not\s+null/gi;
  for (const v of PENDING) {
    let m;
    const code = execOf(v);
    while ((m = re.exec(code))) out.push({ version: v, table: m[1], column: m[2] });
    re.lastIndex = 0;
  }
  return out;
}

/** Every `validate constraint` the pending set executes. */
function parsedValidate() {
  const out = [];
  const re = /alter\s+table\s+(clara\.[a-z_0-9]+)\s+validate\s+constraint\s+([a-z_0-9]+)/gi;
  for (const v of PENDING) {
    let m;
    const code = execOf(v);
    while ((m = re.exec(code))) out.push({ version: v, table: m[1], name: m[2] });
    re.lastIndex = 0;
  }
  return out;
}

/**
 * Every top-level `update clara.X set ...` the pending set executes, with its where clause.
 * ANCHORED TO A LINE START. A migration writes its statements at a line start; a marker string
 * inside a prestate's census does not, and matching one would invent a statement the file never
 * runs.
 *
 * WAVE-4 CHANGE. Wave 3 collected only the where-LESS form, because its one whole-table rewrite
 * had no predicate. This wave's two registry raises are written
 * `update clara.document_capabilities set registry_version = N where registry_version <> N`:
 * a predicate that is true of every row on a first apply, so the row cost and the per-row
 * trigger fan-out are the same. The where clause is kept and printed, and the read runs the
 * file's own predicate rather than counting the whole relation blindly.
 */
function parsedUpdates() {
  const out = [];
  const re = /^[ \t]*update\s+(clara\.[a-z_0-9]+)\s+set\s+/gim;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) {
      // QUOTE-AWARE TERMINATOR. MEASURED NEED: 0299's registry rewrite sets `basis` to a
      // sentence containing "...the deposit leg where the agreement states one; the
      // depreciation particulars...". A `[^;]*` body stops at THAT semicolon, loses the real
      // WHERE clause, and the statement is then reported as an unconditional whole-table
      // rewrite that it is not.
      const end = statementEnd(code, re.lastIndex);
      const body = code.slice(re.lastIndex, end);
      const at = whereOutsideQuotes(body);
      out.push({
        version: v,
        table: m[1],
        set: (at < 0 ? body : body.slice(0, at)).replace(/\s+/g, " ").trim(),
        where: at < 0 ? null : body.slice(at + 5).replace(/\s+/g, " ").trim(),
      });
      re.lastIndex = end;
    }
    re.lastIndex = 0;
  }
  return out;
}

/** The index of the `;` that really ends the statement starting at `from`. Quote-aware. */
function statementEnd(code, from) {
  let i = from;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'") {
      i++;
      while (i < code.length) {
        if (code[i] === "'" && code[i + 1] === "'") { i += 2; continue; }
        if (code[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === ";") return i;
    i++;
  }
  return code.length;
}

/**
 * The index of the `where` keyword that is really a clause, skipping any inside a single-quoted
 * string. MEASURED NEED: 0299's registry rewrite sets `basis` to a long sentence that contains
 * the word "Where the page is a hire purchase...", and a quote-blind reader takes that as the
 * statement's predicate and then generates SQL that cannot run. Returns -1 when there is none.
 */
function whereOutsideQuotes(s) {
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; }
        if (s[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if ((ch === "w" || ch === "W") && /^where\b/i.test(s.slice(i)) && (i === 0 || /[\s)]/.test(s[i - 1]))) return i;
    i++;
  }
  return -1;
}

/** Every top-level `delete from clara.X` the pending set executes. Line-anchored, as above. */
function parsedDeletes() {
  const out = [];
  const re = /^[ \t]*delete\s+from\s+(clara\.[a-z_0-9]+)([^;]*);/gim;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) out.push({ version: v, table: m[1], where: m[2].replace(/\s+/g, " ").trim() });
    re.lastIndex = 0;
  }
  return out;
}

/** Relations this wave CREATES. A precondition read against one of them is meaningless. */
function parsedCreatedTables() {
  const set = new Set();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(clara\.[a-z_0-9]+)/gi;
  for (const v of PENDING) {
    let m;
    const code = execOf(v);
    while ((m = re.exec(code))) set.add(m[1]);
    re.lastIndex = 0;
  }
  return set;
}

/**
 * The CLUSTER ROLES this wave mints, parsed from the `create role` statements inside its DO
 * blocks (a role is created outside `clara_fn_owner`, so it lives in a guarded DO block rather
 * than at the top level; execOf does NOT blank a DO block, which is why this parses).
 */
function parsedCreatedRoles() {
  const out = [];
  const re = /create\s+role\s+([a-z_0-9]+)/gi;
  for (const v of PENDING) {
    let m;
    const code = execOf(v);
    while ((m = re.exec(code))) out.push({ version: v, role: m[1] });
    re.lastIndex = 0;
  }
  return out;
}

/** Every `revoke execute on function clara.f(args) from <role>` the pending set executes. */
function parsedRevokedGrants() {
  const out = [];
  const re =
    /revoke\s+execute\s+on\s+function\s+(clara\.[a-z_0-9]+\s*\([^)]*\))\s+from\s+([a-z_0-9]+)/gi;
  for (const v of PENDING) {
    let m;
    const code = execOf(v);
    while ((m = re.exec(code))) {
      if (/^public$/i.test(m[2])) continue; // a `revoke ... from public` is the house default
      out.push({ version: v, sig: m[1].replace(/\s+/g, ""), role: m[2] });
    }
    re.lastIndex = 0;
  }
  return out;
}

/**
 * Every `drop function [if exists] clara.f(args)` the pending set executes, WITH the `if exists`
 * flag. The flag is the file's own statement about whether the target must be there: a bare
 * `drop function` demands the signature exists, while `if exists` is the estate's redo-safe form
 * and is a lawful no-op. 0315 writes the second and says so in its own header ("on a fresh chain
 * the function was never created"), so treating the two alike invents a STOP.
 */
function parsedDroppedFunctions() {
  const out = [];
  const re = /drop\s+function\s+(if\s+exists\s+)?(clara\.[a-z_0-9]+\s*\([^)]*\))/gi;
  for (const v of PENDING) {
    let m;
    const code = execOf(v);
    while ((m = re.exec(code))) out.push({ version: v, sig: m[2].replace(/\s+/g, ""), ifExists: Boolean(m[1]) });
    re.lastIndex = 0;
  }
  return out;
}

/**
 * WHICH PENDING FILE PRODUCES WHICH FUNCTION BODY - the whole of finding 3.
 *
 * A body is PRODUCED by a file when that file either
 *   (a) `create [or replace] function clara.<name>(...)` outright, or
 *   (b) SPLICES it: reads the live body's own `prosrc` into a variable (not merely into a
 *       sha256) and re-executes a rebuilt `create or replace function`. Six of this wave's
 *       files do that to `clara.list_review_queue`, one after another.
 *
 * Returns a Map: bare function name -> sorted array of the pending versions that produce it.
 * A pin on a name some EARLIER pending file produces is CHAIN-INTERNAL and cannot be measured
 * against the target before the window.
 */
function parsedProducedBodies() {
  const out = new Map();
  const add = (n, v) => {
    if (!out.has(n)) out.set(n, new Set());
    out.get(n).add(v);
  };
  for (const v of PENDING) {
    const code = codeOf(v);
    // (a) an outright recut. `pg_temp.*` helpers are this file's own scratch and are skipped.
    for (const m of code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+clara\.([a-z_0-9]+)\s*\(/gi)) {
      add(m[1], v);
    }
    // (b) a splice: `select ... p.prosrc ... into <vars> from pg_proc p where p.oid = '<sig>'`.
    //     The tell is `p.prosrc` in the SELECT LIST outside the sha256 measurement.
    const sre =
      /select\s+([\s\S]{0,400}?)\s+into\s+([\s\S]{0,160}?)\s+from\s+pg_proc\s+p\b([\s\S]{0,300}?)p\.oid\s*=\s*'(clara\.[a-z_0-9]+)\s*\([^')]*\)'::regprocedure/gi;
    let m;
    while ((m = sre.exec(code))) {
      const list = m[1].replace(/convert_to\s*\(\s*p\.prosrc[^)]*\)/gi, "");
      if (/\bp\.prosrc\b/i.test(list)) add(m[4].replace(/^clara\./, ""), v);
    }
    // ...and the same read reached through a declared signature variable.
    const vre =
      /select\s+([\s\S]{0,400}?)\s+into\s+([\s\S]{0,160}?)\s+from\s+pg_proc\s+p\b([\s\S]{0,300}?)p\.oid\s*=\s*(v_[a-z_0-9]+)::regprocedure/gi;
    const vars = declaredSignatureVars(code);
    while ((m = vre.exec(code))) {
      const list = m[1].replace(/convert_to\s*\(\s*p\.prosrc[^)]*\)/gi, "");
      const sig = vars.get(m[4]);
      if (sig && /\bp\.prosrc\b/i.test(list)) add(sig.replace(/^clara\./, "").replace(/\(.*$/, ""), v);
    }
  }
  const asMap = new Map();
  for (const [k, s] of out) asMap.set(k, [...s].sort());
  return asMap;
}

/**
 * Rewrite an expression so every column THIS WAVE adds to `table` is replaced by the value an
 * existing row will really carry after the ADD: the column's DEFAULT when it has one, `null`
 * when it does not. The rewritten expression can then be run against the live relation today.
 *
 * This is finding 4 made general. Wave 3 could assume "a column a pending file adds is NULL on
 * every existing row"; this wave adds `side text not null default 'expense'` (0304) and
 * `term_source text not null default 'document_service_period'` (0305), and a CHECK over those
 * is evaluated against the DEFAULT. 0305's own CHECK names FOUR columns, two of them added, so
 * substituting only the first would leave the read unrunnable and the precondition unchecked.
 */
function substituteAddedColumns(table, expr, addedCols) {
  const mine = addedCols.filter((a) => a.table === table);
  let out = expr;
  const applied = [];
  for (const a of mine) {
    const re = new RegExp(`\\b${a.column}\\b`, "g");
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    out = out.replace(re, a.dflt ?? "null");
    applied.push(`${a.column} -> ${a.dflt ?? "null"} (${a.version.slice(0, 4)})`);
  }
  return { expr: out, applied };
}

/** `v_x text := 'clara.foo(args)'` declarations, so a pin reached through a variable resolves. */
function declaredSignatureVars(code) {
  const vars = new Map();
  for (const m of code.matchAll(
    /\b(v_[a-z_0-9]+)\s+(?:constant\s+)?text\s*(?::=|=)\s*'(clara\.[a-z_0-9]+\s*\([^')]*\))'/gi,
  )) {
    vars.set(m[1], m[2].replace(/\s+/g, ""));
  }
  return vars;
}

/** `c_x constant text := '<64 hex>'` declarations, so a pin naming a constant resolves. */
function declaredShaConsts(code) {
  const c = new Map();
  for (const m of code.matchAll(/\b(c_[a-z_0-9]+)\s+(?:constant\s+)?text\s*(?::=|=)\s*'([0-9a-f]{64})'/gi)) {
    c.set(m[1], m[2]);
  }
  return c;
}

/**
 * EVERY `sha256(prosrc)` PIN THE PENDING SET CARRIES, in the four spellings this wave uses.
 * Each entry is { version, sig, shas[] } where `shas` is the set of values that file ADMITS
 * for that signature - one on an unconditional pin, two where the file is bimodal for #957
 * redo-safety (its own pre-image OR its own post-image).
 *
 * ONLY pins measured through `sha256(convert_to(p.prosrc,'UTF8'))` are collected. A 64-hex
 * literal measured over anything else - a view definition, a catalogue row digest, 0295's own
 * collation-independent structural digest - is NOT a body pin and is reported separately under
 * "digests this parser did not attribute", so what is covered and what is not are both visible.
 */
function parsedBodyPins() {
  const pins = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    const vars = declaredSignatureVars(code);
    const consts = declaredShaConsts(code);
    const seen = new Map(); // sig -> Set(sha)

    const record = (sig, shas) => {
      const key = sig.replace(/\s+/g, "");
      if (!seen.has(key)) seen.set(key, new Set());
      for (const s of shas) seen.get(key).add(s);
    };

    // (A) THE ROSTER FORMS: a `values ('sig','sha')` tuple or an `array[['sig','pre','post']]`
    //     element. Both are a bracket that opens with a clara signature and carries one or more
    //     64-hex literals. Only collected when the enclosing file measures prosrc at all.
    if (/sha256\s*\(\s*convert_to\s*\(\s*p\.prosrc/i.test(code)) {
      for (const m of code.matchAll(
        /[([]\s*'(clara\.[a-z_0-9]+\s*\([^')]*\))'\s*((?:,\s*'[0-9a-f]{64}'\s*)+)[)\]]/gi,
      )) {
        record(m[1], [...m[2].matchAll(/'([0-9a-f]{64})'/g)].map((x) => x[1]));
      }
    }

    // (A2) THE DISJUNCTIVE OVERRIDE: `or (<roster>[i][1] = '<sig>' and v_sha = '<sha>')`, which
    //      widens ONE entry of a roster whose tuple already carries a different value. The
    //      wave-4 integration writes its two cross-lane bimodal admissions this way rather than
    //      as a third element of the array tuple (0308, for `clara.create_accounting_plan` and
    //      `clara._plan_admit_occurrence`, both of which a LOWER-numbered lane also moves). A
    //      reader that only sees the tuple under-reports what the file admits, which makes the
    //      pin ledger wrong as evidence even where it changes no verdict.
    for (const m of code.matchAll(
      /'(clara\.[a-z_0-9]+\s*\([^')]*\))'\s*\n?\s*and\s+v_sha\s*(?:=|is not distinct from)\s*'([0-9a-f]{64})'/gi,
    )) {
      record(m[1], [m[2]]);
    }

    // (B) THE SCALAR FORM: a prosrc measurement for one signature, then the literal(s) it is
    //     compared against, up to the NEXT prosrc measurement in the file.
    const re =
      /sha256\s*\(\s*convert_to\s*\(\s*p\.prosrc[\s\S]{0,500}?p\.oid\s*=\s*(?:'(clara\.[a-z_0-9]+\s*\([^')]*\))'|(v_[a-z_0-9]+))::regprocedure/gi;
    let m;
    while ((m = re.exec(code))) {
      const sig = m[1] || vars.get(m[2]);
      if (!sig) continue;
      // The window ends at whichever comes first: the NEXT prosrc measurement, or the next
      // signature literal (which opens a different pin's roster). Without the second bound a
      // scalar pin swallows the shas of the roster that follows it and silently widens itself -
      // measured on 0296 (_field_path_conforms picked up three values instead of one) and on
      // 0297 (list_review_queue picked up four).
      const rest = code.slice(re.lastIndex, re.lastIndex + 900);
      const bounds = [
        rest.search(/sha256\s*\(\s*convert_to\s*\(\s*p\.prosrc/i),
        rest.search(/'clara\.[a-z_0-9]+\s*\(/),
      ].filter((i) => i >= 0);
      const stop = bounds.length ? Math.min(...bounds) : -1;
      const w = stop >= 0 ? rest.slice(0, stop) : rest;
      const shas = [...w.matchAll(/'([0-9a-f]{64})'/g)].map((x) => x[1]);
      for (const cm of w.matchAll(/\b(c_[a-z_0-9]+)\b/g)) if (consts.has(cm[1])) shas.push(consts.get(cm[1]));
      if (shas.length) record(sig, shas);
    }

    for (const [sig, s] of seen) pins.push({ version: v, sig, shas: [...s].sort() });
  }
  return pins;
}

/** Every 64-hex literal in the pending set that `parsedBodyPins` did NOT attribute. */
function unattributedDigests(pins) {
  const claimed = new Set(pins.flatMap((p) => p.shas));
  const out = [];
  for (const v of PENDING) {
    for (const m of codeOf(v).matchAll(/'([0-9a-f]{64})'/g)) {
      if (!claimed.has(m[1])) out.push({ version: v, sha: m[1] });
    }
  }
  const seen = new Set();
  return out.filter((r) => (seen.has(r.sha) ? false : (seen.add(r.sha), true)));
}

/**
 * The relations the pending set COUNTS ROWS ON in a prestate or tail, plus the floor below.
 * Parsed, so the reference census grows with the wave instead of being a transcribed list.
 */
const COUNT_FLOOR = [
  "coa_templates",
  "coa_template_families",
  "coa_template_accounts",
  "coa_template_entity_overrides",
  "coa_template_adoptions",
  "coa_accounts",
  "document_capabilities",
  "document_capability_version_high_water",
  "document_processing_tasks",
  "document_extractions",
  "document_regions",
  "document_filings",
  "documents",
  "evaluator_versions",
  "evaluator_version_members",
  "event_types",
  "trigger_taxonomy",
  "entry_post_receipts",
  "journal_entries",
  "journal_lines",
  "accrual_adjustments",
  "accrual_period_amounts",
  "accounting_plans",
  "accounting_plan_revisions",
  "accounting_plan_occurrences",
  "prepayment_schedules",
  "document_service_periods",
  "contract_terms",
  "contract_plan_confirmations",
  "staff_expense_claims",
  "staff_expense_claim_allocations",
  "staff_expense_claim_status",
  "staff_advances",
  "staff_advance_accounts",
  "staff_advance_applications",
  "firm_setup_keys",
  "knowledge_keys",
  "onboarding_plans",
  "onboarding_plan_items",
  "firm_invites",
  "invite_preview_attempts",
  "confirmation_attempts",
  "clients",
  "firms",
  "fiscal_years",
  "fixed_assets",
  "bank_statement_lines",
  "bank_accounts",
  "counterparties",
  "audit_log",
  "accounting_work",
  "operation_receipts",
  "agent_interruptions",
  "wake_fn_allowlist",
];
function parsedCountRelations() {
  const set = new Set(COUNT_FLOOR);
  const re = /count\s*\(\s*(?:\*|distinct[^)]*)\s*\)[^;]{0,200}?\bfrom\s+clara\.([a-z_0-9]+)/gi;
  for (const v of PENDING) {
    let m;
    const code = codeOf(v);
    while ((m = re.exec(code))) set.add(m[1]);
    re.lastIndex = 0;
  }
  return [...set].sort();
}

/**
 * The relations a quiescence census must watch: every relation an EXECUTED statement of the
 * pending set locks (alter table, create index, update, delete), minus the ones the wave itself
 * creates, plus the referenced side of every new foreign key. Parsed, not listed.
 */
function parsedLockedRelations() {
  const created = parsedCreatedTables();
  const set = new Set();
  const add = (t) => { if (t && !created.has(t)) set.add(t.replace(/^clara\./, "")); };
  for (const c of parsedCheckConstraints()) add(c.table);
  for (const c of parsedDroppedConstraints()) add(c.table);
  for (const f of parsedForeignKeys()) { add(f.table); add(f.references); }
  for (const c of parsedAddColumns()) add(c.table);
  for (const i of parsedIndexes()) add(i.table);
  for (const n of parsedSetNotNull()) add(n.table);
  for (const u of parsedUpdates()) add(u.table);
  for (const d of parsedDeletes()) add(d.table);
  return [...set].sort();
}

// ==========================================================================================
// 2 · THE DATA PRECONDITIONS THE GENERIC EXTRACTORS CANNOT SEE. Each one lives inside a DO
//     block, so it has no statement shape to parse; what IS parsed is its expected value or its
//     own predicate, out of the file's refusal message or the file's own executed SELECT.
//
//     EACH ONE DECLARES ITS PHASE. `pre` means the target can answer it BEFORE the window, so a
//     failure is a STOP. `chained` means an EARLIER PENDING FILE creates the state it is about
//     (0297 needs 0295's `2040 Salaries Payable`; 0299 needs the registry 0296 raised), so the
//     read is run for its FACTS and printed, and never counted.
// ==========================================================================================

/** The constraint names whose generated CHECK read defers to a hand check, and to which one. */
const CHECK_DEFERRALS = new Map();

function handChecks() {
  const L = (label, anchor) => literal(label, anchor);
  const list = [];
  const push = (id, phase, guards, lit, sql, verdict) =>
    list.push({ id, phase, guards, lit, sql, verdict });

  // ---------------------------------------------------------------------------------------
  // 0295 (the wave-4 pre-step): the standard chart gains four rows on a NEW version, and v1 is
  // RETIRED. This is the one file in the wave that rewrites a PUBLISHED catalogue row, and its
  // whole prestate is about rows this script can read before the window.
  // ---------------------------------------------------------------------------------------

  // (a) THE STRUCTURAL DIGEST. 0295 does NOT pin v1's stored content_sha256, because that value
  //     moves with the server's lc_collate (GitHub Actions and hosted Supabase are en_US.UTF-8;
  //     every rig here is C.UTF-8). What it pins is a COLLATION-INDEPENDENT digest: 0150's own
  //     canonical form with `collate "C"` written onto both ORDER BYs. The body is PARSED out of
  //     the file's own `pg_temp.p295_struct_sha256` helper and run here as a plain SELECT, so
  //     this read and the file's refusal ask exactly the same question on any server.
  const structFn = (() => {
    for (const v of PENDING) {
      const m = /create\s+function\s+pg_temp\.([a-z_0-9]+)\s*\(\s*([a-z_0-9]+)\s+uuid\s*\)[\s\S]*?as\s+\$([a-z_0-9]+)\$([\s\S]*?)\$\3\$/i.exec(
        codeOf(v),
      );
      if (m) return { version: v, param: m[2], body: m[4].trim().replace(/;\s*$/, "") };
    }
    return null;
  })();
  const structPin = L(
    "0295's collation-independent structural digest of my_sme_starter v1",
    /c_v1_struct_pin\s+constant\s+text\s*:=\s*'([0-9a-f]{64})'/i,
  );
  const famAcc = L(
    "0295's family/account census of my_sme_starter v1",
    /carries % families \/ % accounts, expected (\d+ \/ \d+)/i,
  );
  const newCodes = L(
    "0295's four new account codes",
    /account_code = any\(array\[([^\]]+)\]\)/i,
  );
  if (structFn && structPin && famAcc && newCodes) {
    const V1 =
      "(select id from clara.coa_templates where scope='platform' and template_key='my_sme_starter' and version=1)";
    const structSql = structFn.body.replace(new RegExp(`\\b${structFn.param}\\b`, "g"), V1);
    const [wantFam, wantAcc] = famAcc.value.split("/").map((s) => Number(s.trim()));
    push(
      "D-CHART-V1",
      "pre",
      `${structFn.version.slice(0, 4)} prestate: my_sme_starter v1 must be PUBLISHED at ${famAcc.value} families/accounts, its content at the pinned ` +
        `collation-independent structural digest, its stored content_sha256 must reproduce from its own rows on THIS server, and it must carry ` +
        `none of ${newCodes.value.replace(/'/g, "")}. v2 must be ABSENT (its presence takes the file's REDO branch)`,
      `${famAcc.value} · struct ${structPin.value.slice(0, 12)}...`,
      `select (select state from clara.coa_templates where scope='platform' and template_key='my_sme_starter' and version=1) as v1_state,
              (select count(*)::int from clara.coa_template_families where template_id = ${V1}) as families,
              (select count(*)::int from clara.coa_template_accounts where template_id = ${V1}) as accounts,
              (${structSql}) as struct_sha,
              (select encode(content_sha256,'hex') from clara.coa_templates where id = ${V1}) as stored_sha,
              encode(clara._coa_template_content_sha256(${V1}),'hex') as recomputed_sha,
              (select coalesce(string_agg(account_code, ',' order by account_code), '(none)')
                 from clara.coa_template_accounts
                where template_id = ${V1} and account_code = any(array[${newCodes.value}])) as colliding,
              (select count(*)::int from clara.coa_templates
                where scope='platform' and template_key='my_sme_starter' and version=2) as v2_rows,
              (select count(*)::int from clara.coa_template_entity_overrides where template_id = ${V1}) as overrides,
              (select count(*)::int from clara.coa_template_entity_overrides
                where template_id = ${V1} and entity_type='society') as society_overrides,
              (select current_setting('lc_collate', true)) as server_collate,
              (select datcollate from pg_database where datname = current_database()) as db_collate`,
      (r) => ({
        ok:
          r.v1_state === "published" &&
          r.families === wantFam &&
          r.accounts === wantAcc &&
          r.struct_sha === structPin.value &&
          r.stored_sha === r.recomputed_sha &&
          r.colliding === "(none)" &&
          r.v2_rows === 0,
        detail:
          `v1 state=${r.v1_state} families=${r.families}/${wantFam} accounts=${r.accounts}/${wantAcc} · ` +
          `structural digest (collate "C") ${r.struct_sha === structPin.value ? "MATCHES the file's pin" : `DIFFERS: measured ${r.struct_sha}, pinned ${structPin.value}`} · ` +
          `stored content_sha256 ${r.stored_sha === r.recomputed_sha ? "reproduces from its own rows" : `does NOT reproduce (stored ${r.stored_sha}, recomputed ${r.recomputed_sha})`} ` +
          `[stored=${String(r.stored_sha).slice(0, 12)}..., db collation ${r.db_collate}: the STORED digest moves with lc_collate and is deliberately NOT pinned] · ` +
          `v1 already carrying one of the four new codes: ${r.colliding} · v2 rows=${r.v2_rows} (0 = FIRST apply; 1 would take the REDO branch) · ` +
          `v1 entity overrides=${r.overrides} of which society=${r.society_overrides} (0295 copies this tier verbatim onto v2 and its tail refuses unless the census equals v1's)`,
      }),
    );
  } else {
    if (!structFn) gap("literal 0295's pg_temp structural-digest helper", "no pending file declares a `create function pg_temp.<x>(<p> uuid)` returning the collation-independent digest");
    if (!famAcc) gap("literal 0295's family/account census", "no pending file carries the `carries % families / % accounts, expected N / M` refusal");
  }

  // (b) WHO ALREADY ADOPTED v1, AND IN WHAT STATE. 0295 RETIRES v1. A retired template is still
  //     readable by clara.get_coa_template and clara.list_coa_templates (neither filters on
  //     state), so nobody loses the chart they adopted - but the number of adopters is what the
  //     owner is told, and a `proposed` adoption is the state that has no real producing door,
  //     so its presence on hosted would be a finding in itself. Facts, never a refusal.
  push(
    "D-CHART-ADOPTIONS",
    "pre",
    "0295 retires my_sme_starter v1 and publishes v2. Existing adoptions are untouched BY CONSTRUCTION (clara.apply_coa_template COPIES rows into clara.coa_accounts; " +
      "no door re-syncs a client's chart against a template afterwards) - this read is the census the owner is told, and it names any `proposed` row, a state no shipped door produces",
    "facts only",
    `select (select count(*)::int from clara.coa_template_adoptions) as adoptions_total,
            (select coalesce(string_agg(s, ', ' order by s), '(none)') from (
               select a.state || '=' || count(*)::text as s
                 from clara.coa_template_adoptions a
                 join clara.coa_templates t on t.id = a.template_id
                where t.scope='platform' and t.template_key='my_sme_starter' and t.version=1
                group by a.state) x) as v1_by_state,
            (select count(*)::int from clara.coa_template_adoptions where state='proposed') as proposed_any,
            (select count(*)::int from clara.coa_templates
              where forked_from = (select id from clara.coa_templates
                                    where scope='platform' and template_key='my_sme_starter' and version=1)) as forks_off_v1,
            (select count(*)::int from clara.coa_templates where scope='platform') as platform_templates,
            (select coalesce(string_agg('v'||version||'/'||state, ', ' order by version), '(none)')
               from clara.coa_templates where scope='platform' and template_key='my_sme_starter') as starter_rows`,
    (r) => ({
      ok: true,
      detail:
        `clara.coa_template_adoptions total=${r.adoptions_total} · adoptions of v1 by state {${r.v1_by_state}} · rows in state 'proposed' anywhere=${r.proposed_any} ` +
        `(no shipped door writes that state; a non-zero reading is a finding, not a blocker) · templates forked off v1=${r.forks_off_v1} (their lineage is untouched by the retirement) · ` +
        `platform templates=${r.platform_templates}, my_sme_starter rows {${r.starter_rows}} - after the window this must read \`v1/retired, v2/published\``,
    }),
  );

  // (c) THE THREE FREEZE TRIGGERS. 0295's REDO branch disables them to tear v2 down and its tail
  //     refuses unless all three are armed afterwards. On a FIRST apply the redo branch does not
  //     run at all, but a disarmed trigger here would mean something else disarmed it.
  push(
    "D-CHART-FREEZE",
    "pre",
    "0295 tail T.8: the three coa-template freeze triggers must be ARMED (tgenabled='O'). Its REDO branch disables them to delete v2's rows and re-enables them in the same transaction; " +
      "a disarmed trigger BEFORE the window means something outside this wave left one off",
    "3 armed",
    `select coalesce(string_agg(c.relname || '.' || t.tgname || '=' || t.tgenabled::text, ', ' order by c.relname, t.tgname), '(none)') as triggers,
            count(*) filter (where t.tgenabled::text <> 'O')::int as disarmed,
            count(*)::int as found
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname in ('t_coa_templates_freeze','t_coa_template_families_freeze','t_coa_template_accounts_freeze')`,
    (r) => ({ ok: r.disarmed === 0 && r.found === 3, detail: `{${r.triggers}} · found=${r.found}/3 · disarmed=${r.disarmed}` }),
  );

  // ---------------------------------------------------------------------------------------
  // 0296 / 0299: the capability registry is re-derived TWICE in one run, and each raise rewrites
  // every row. This is the wave's whole-table rewrite, and its cost is the per-row trigger
  // fan-out, not the update itself.
  // ---------------------------------------------------------------------------------------
  const regRows = L("0296's registry row count", /the registry holds % rows, not the (\d+) measured/i);
  const regVer = L(
    "0296's registry version floor",
    /the registry publishes version %, not the (\d+) this file raises from/i,
  );
  const payrollPairs = L(
    "0296's payroll_summary pdf/image pair count",
    /payroll_summary pair\(s\) sit on the router''s pdf\/image branch, not the (\d+)/i,
  );
  if (regRows && regVer && payrollPairs) {
    push(
      "D-REGISTRY-W4",
      "pre",
      `${regRows.version} prestate: the registry must publish exactly ONE distinct registry_version, it must be the ${regVer.value} this wave raises FROM, it must hold ${regRows.value} rows, ` +
        `exactly ${payrollPairs.value} payroll_summary pdf/image pairs must sit on the router's branch, and every published (format, document_kind) pair must already carry an AGREEING high-water mark`,
      `${regRows.value} rows / one version ${regVer.value} / ${payrollPairs.value} payroll pairs`,
      `select count(*)::int as rows,
              count(distinct registry_version)::int as versions,
              min(registry_version)::int as min_version,
              max(registry_version)::int as max_version,
              count(*) filter (where document_kind='payroll_summary'
                                 and (mime_type='application/pdf' or mime_type like 'image/%'))::int as payroll_pairs,
              count(*) filter (where document_kind='agreement_contract'
                                 and (mime_type='application/pdf' or mime_type like 'image/%'))::int as agreement_pairs,
              count(*) filter (where document_kind='payroll_summary' and typed_facts='supported')::int as payroll_supported,
              count(*) filter (where document_kind='agreement_contract' and typed_facts='supported')::int as agreement_supported,
              (select count(*)::int from clara.document_capability_version_high_water) as marks,
              (select count(*)::int
                 from clara.document_capabilities c
                 left join clara.document_capability_version_high_water h
                   on h.format = c.format and h.document_kind = c.document_kind
                where h.format is null or h.registry_version is distinct from c.registry_version) as disagreeing
         from clara.document_capabilities`,
      (r) => ({
        ok:
          r.rows === Number(regRows.value) &&
          r.versions === 1 &&
          r.min_version === Number(regVer.value) &&
          r.payroll_pairs === Number(payrollPairs.value) &&
          r.disagreeing === 0,
        detail:
          `rows=${r.rows} (expected ${regRows.value}) distinct_versions=${r.versions} version=${r.min_version} (expected ${regVer.value}) · ` +
          `payroll_summary pdf/image pairs=${r.payroll_pairs} (expected ${payrollPairs.value}, of which typed_facts='supported' today=${r.payroll_supported}) · ` +
          `agreement_contract pdf/image pairs=${r.agreement_pairs} (of which supported today=${r.agreement_supported}) · ` +
          `high-water marks=${r.marks}, pairs whose mark disagrees=${r.disagreeing}. ` +
          `THE COST: this wave raises the whole registry TWICE (0296 to ${Number(regVer.value) + 1}, 0299 to ${Number(regVer.value) + 2}), each raise rewriting all ${r.rows} rows and firing the monotonicity, high-water, high-water-record and uniformity triggers once per row`,
      }),
    );
  }

  // The lane roster CHECK must not already admit the two lanes this wave mints. 0296 asserts
  // this STRUCTURALLY rather than by counting task rows (its own recorded reason: on a first
  // apply the count is vacuously zero because the CHECK refuses the lane).
  push(
    "D-LANE-ROSTER",
    "pre",
    "0296/0299 prestate: ck_processing_task_lane_f_a1 must NOT already admit `payroll_facts` or `contract_facts` on a FIRST apply - if it does, this wave is not the lane's first writer",
    "neither lane admitted",
    `select coalesce((select pg_get_constraintdef(oid) from pg_constraint
                       where conrelid='clara.document_processing_tasks'::regclass
                         and conname='ck_processing_task_lane_f_a1'), '(absent)') as def,
            (select count(*)::int from clara.document_processing_tasks) as task_rows,
            (select count(*)::int from clara.document_extractions) as extraction_rows`,
    (r) => ({
      ok:
        r.def !== "(absent)" &&
        !/payroll_facts/.test(r.def) &&
        !/contract_facts/.test(r.def),
      detail:
        `live ck_processing_task_lane_f_a1 = ${String(r.def).replace(/\s+/g, " ").slice(0, 260)} · ` +
        `clara.document_processing_tasks rows=${r.task_rows}, clara.document_extractions rows=${r.extraction_rows} ` +
        "(both relations take ACCESS EXCLUSIVE for each constraint swap; every swap is a WIDENING, so the re-validating scan cannot refuse an existing row)",
    }),
  );

  // ---------------------------------------------------------------------------------------
  // 0309 (#871): the signed-out invite preview mints a ROLE PAIR. Its first-apply branch demands
  // all four of its own objects absent; a partial set is refused rather than repaired.
  // ---------------------------------------------------------------------------------------
  const minted = parsedCreatedRoles();
  if (minted.length) {
    const roleList = [...new Set(minted.map((m) => m.role))].sort();
    const vals = roleList.map((r) => `('${r}')`).join(",");
    push(
      "D-ROLE-PAIR",
      "pre",
      `${minted[0].version.slice(0, 4)} prestate: its FOUR objects (the door, the attempts relation and the role pair ${roleList.join(" / ")}) must be ALL ABSENT (a FIRST apply) or ALL PRESENT (a #957 redo). ` +
        "Any other count is a half-applied estate the file refuses rather than repairs. The cluster-wide clara% census is RECORDED, never pinned",
      `${roleList.length} role(s) absent`,
      `with want(r) as (values ${vals})
       select (select count(*)::int from want w join pg_roles g on g.rolname = w.r) as roles_present,
              (select count(*)::int from want) as roles_wanted,
              (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='clara' and p.proname='preview_invite_by_token') as door,
              (select count(*)::int from pg_class where oid = to_regclass('clara.invite_preview_attempts')) as attempts,
              (select count(*)::int from pg_roles where rolname like 'clara%') as clara_roles,
              (select coalesce(string_agg(rolname, ', ' order by rolname), '(none)')
                 from pg_roles where rolname like 'clara%' and rolcanlogin) as login_roles`,
      (r) => ({
        ok: r.roles_present === 0 && r.door === 0 && r.attempts === 0,
        detail:
          `role pair present=${r.roles_present}/${r.roles_wanted}, door present=${r.door}, attempts relation present=${r.attempts} ` +
          `(all four 0 = FIRST apply, which is what a hosted estate at this frontier must read) · cluster clara% role census=${r.clara_roles}, ` +
          `and this wave moves it by exactly +${r.roles_wanted}. Roles carrying LOGIN today: {${r.login_roles}} - the new pair is minted NOLOGIN and password-less, ` +
          "and the credential is an OUT-OF-BAND OPERATOR CEREMONY in the runbook, never a migration",
      }),
    );
  }

  // The chain-minted roles 0309's prestate names BY NAME (never an absolute census: a live
  // project also carries deploy-minted roles such as clara_storage_docs, and the first cut of
  // 0309 would have aborted the hosted migrate on exactly that).
  const chainRoles = (() => {
    for (const v of PENDING) {
      const m = /from \(values([\s\S]{0,1600}?)\) t\(name\)\s*where to_regrole\(t\.name\) is null/i.exec(
        codeOf(v),
      );
      if (m) return { version: v, roles: [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]) };
    }
    return null;
  })();
  if (chainRoles && chainRoles.roles.length) {
    const vals = chainRoles.roles.map((r) => `('${r}')`).join(",");
    push(
      "D-CHAIN-ROLES",
      "pre",
      `${chainRoles.version.slice(0, 4)} prestate: the ${chainRoles.roles.length} CHAIN-MINTED clara roles it relies on must all exist. Parsed out of the file's own roster, never transcribed`,
      `${chainRoles.roles.length} present`,
      `with want(r) as (values ${vals})
       select count(*)::int as wanted,
              count(*) filter (where to_regrole(w.r) is not null)::int as present,
              coalesce(string_agg(w.r, ', ' order by w.r) filter (where to_regrole(w.r) is null), '(none)') as absent
         from want w`,
      (r) => ({
        ok: r.present === r.wanted,
        detail: `${r.present}/${r.wanted} present · absent: {${r.absent}}`,
      }),
    );
  }

  // ---------------------------------------------------------------------------------------
  // 0311 (#1032): the firm-setup catalogue. The one file in the wave that rewrites a catalogue
  // CELL behind a disabled append-only trigger.
  // ---------------------------------------------------------------------------------------
  const setupRows = L("0311's firm-setup catalogue row count", /the firm setup catalogue holds % rows \(expected (\d+)\)/i);
  const setupDigest = L(
    "0311's twelve-accounting-row catalogue digest",
    /if v_sha <> '([0-9a-f]{64})' then\s*\n\s*raise exception '#1032 prestate: the twelve accounting rows/i,
  );
  const setupNote = L(
    "0311's pinned pre-image of the tin user_note",
    /if v_note is distinct from '((?:[^']|'')+)' then/i,
  );
  const setupDigestSql = (() => {
    for (const v of PENDING) {
      const m = /select encode\(sha256\(convert_to\(string_agg\(([\s\S]{0,700}?)\),'UTF8'\)\),'hex'\)\s*\n\s*into v_sha from clara\.firm_setup_keys\s*\n\s*where ([^;]+);/i.exec(
        codeOf(v),
      );
      if (m) return { version: v, agg: m[1].replace(/\s+/g, " ").trim(), where: m[2].replace(/\s+/g, " ").trim() };
    }
    return null;
  })();
  if (setupRows && setupDigest && setupDigestSql) {
    push(
      "D-FIRM-SETUP",
      "pre",
      `${setupRows.version} prestate: clara.firm_setup_keys must hold exactly ${setupRows.value} rows, its twelve accounting rows must hash to the pinned digest, the append-only trigger must be ENABLED ` +
        "(the file disables it for ONE cell update and re-enables it in the same transaction), and the tin row must still carry its pinned pre-image user_note",
      `${setupRows.value} rows · digest ${setupDigest.value.slice(0, 12)}...`,
      `select (select count(*)::int from clara.firm_setup_keys) as rows,
              (select encode(sha256(convert_to(string_agg(${setupDigestSql.agg}),'UTF8')),'hex')
                 from clara.firm_setup_keys where ${setupDigestSql.where}) as digest,
              (select t.tgenabled::text from pg_trigger t
                where t.tgrelid='clara.firm_setup_keys'::regclass and t.tgname='t_firm_setup_keys_append_only') as append_only,
              (select count(*)::int from clara.firm_setup_keys
                where item_key='tin' and item_kind='capture' and required_for_commit=false
                  and knowledge_key is null and retired_at is null) as tin_shape,
              ${setupNote ? `(select count(*)::int from clara.firm_setup_keys where item_key='tin' and user_note = '${setupNote.value}')` : "null::int"} as tin_note,
              (select count(*)::int from clara.onboarding_plan_items) as plan_items,
              (select count(*)::int from clara.onboarding_plans) as plans`,
      (r) => ({
        ok:
          r.rows === Number(setupRows.value) &&
          r.digest === setupDigest.value &&
          r.append_only === "O" &&
          r.tin_shape === 1 &&
          (setupNote ? r.tin_note === 1 : true),
        detail:
          `clara.firm_setup_keys rows=${r.rows} (expected ${setupRows.value}) · twelve-row digest ${r.digest === setupDigest.value ? "matches the pin" : `DIFFERS: measured ${r.digest}, pinned ${setupDigest.value}`} · ` +
          `t_firm_setup_keys_append_only=${r.append_only} (must be O) · the tin row reads capture/not-required/no-knowledge-key/not-retired: ${r.tin_shape === 1 ? "yes" : "NO"} · ` +
          `tin user_note at its pinned pre-image: ${setupNote ? (r.tin_note === 1 ? "yes" : "NO") : "(literal not parsed)"} · ` +
          `clara.onboarding_plans=${r.plans}, clara.onboarding_plan_items=${r.plan_items} (every reconciled plan gains a tin item from this file on; none is written at apply time)`,
      }),
    );
  } else if (!setupDigestSql) {
    gap("literal 0311's catalogue digest query", "no pending file carries the firm_setup_keys string_agg/sha256 census");
  }

  // ---------------------------------------------------------------------------------------
  // 0304 (#942): the accrual lane gains a SIDE. `add column ... not null default 'expense'`
  // backfills EVERY existing row, which is the whole claim the file's prestate hands its tail.
  // ---------------------------------------------------------------------------------------
  const sideCol = parsedAddColumns().find((c) => c.table === "clara.accrual_adjustments" && c.column === "side");
  if (sideCol) {
    push(
      "D-ACCRUAL-SIDE",
      "pre",
      `${sideCol.version.slice(0, 4)}: \`add column ${sideCol.column} ${sideCol.declared}\` on the LIVE clara.accrual_adjustments. The column must be ABSENT, and every existing row becomes ` +
        `the DEFAULT ${sideCol.dflt ?? "(unparsed)"} as part of the ADD - not NULL, which is why the CHECK on it is not vacuous`,
      "column absent",
      `select (select count(*)::int from information_schema.columns
                where table_schema='clara' and table_name='accrual_adjustments' and column_name='side') as col,
              (select count(*)::int from clara.accrual_adjustments) as rows,
              (select pg_size_pretty(pg_total_relation_size('clara.accrual_adjustments'))) as size,
              (select count(*)::int from pg_class where oid = to_regclass('clara.accrual_period_amounts')) as period_amounts_rel`,
      (r) => ({
        ok: r.col === 0,
        detail:
          `clara.accrual_adjustments.side present=${r.col} (must be 0 on a first apply) · clara.accrual_period_amounts exists today=${r.period_amounts_rel} (0303 creates it) · the relation holds ${r.rows} row(s) (${r.size}), ` +
          `every one of which the ADD backfills to ${sideCol.dflt ?? "(unparsed)"} · a NOT NULL default that is a plain literal is METADATA-ONLY in PostgreSQL 11+, so the ADD does not rewrite the heap, ` +
          "but it still takes ACCESS EXCLUSIVE and the CHECK that follows re-scans the table",
      }),
    );
  }

  // ---------------------------------------------------------------------------------------
  // 0316 (#1038): clara.create_client loses its human EXECUTE. The read is the CURRENT grant
  // state, so a revoke that is already a no-op is visible before the window rather than after.
  // ---------------------------------------------------------------------------------------
  const revoked = parsedRevokedGrants();
  if (revoked.length) {
    const vals = revoked.map((d) => `('${d.sig.replace(/'/g, "''")}','${d.role}','${d.version.slice(0, 4)}')`).join(",");
    push(
      "D-REVOKED-DOORS",
      "pre",
      `the ${revoked.length} EXECUTE grant(s) this wave withdraws must still be HELD today (otherwise the revoke is a no-op and something already withdrew them), ` +
        "and PUBLIC must hold EXECUTE on none of them",
      `${revoked.length} held / 0 PUBLIC`,
      `with d(sig, role, ver) as (values ${vals})
       select count(*)::int as total,
              count(*) filter (where to_regprocedure(sig) is not null)::int as resolving,
              count(*) filter (where to_regprocedure(sig) is not null
                                 and has_function_privilege(role, sig, 'execute'))::int as held,
              count(*) filter (where to_regprocedure(sig) is not null
                                 and has_function_privilege('public', sig, 'execute'))::int as public_any,
              coalesce(string_agg(ver || ' ' || sig || ' -> ' || role, ' · ' order by sig), '(none)') as roster
         from d`,
      (r) => ({
        ok: r.resolving === r.total && r.held === r.total && r.public_any === 0,
        detail:
          `doors resolving=${r.resolving}/${r.total} · still granted to the role this wave revokes from=${r.held} (must be all ${r.total}) · PUBLIC holds EXECUTE on ${r.public_any} · roster: ${r.roster}`,
      }),
    );
  }

  // ---------------------------------------------------------------------------------------
  // 0318 (#1031): the four-argument knowledge pair wall REPLACES the three-argument one 0310
  // mints, and DROPS it. The drop targets a signature this wave itself creates, which is what
  // makes it chain-internal.
  // ---------------------------------------------------------------------------------------
  const dropped = parsedDroppedFunctions();
  if (dropped.length) {
    const produced = parsedProducedBodies();
    for (const d of dropped) {
      const bare = /clara\.([a-z_0-9]+)\(/.exec(d.sig)?.[1];
      const makers = (produced.get(bare) || []).filter((v) => v < d.version);
      const vals = `('${d.sig.replace(/'/g, "''")}')`;
      const softDrop = makers.length > 0 || d.ifExists;
      push(
        `D-DROP-${bare}`,
        softDrop ? "chained" : "pre",
        `${d.version.slice(0, 4)} drops ${d.sig}` +
          (makers.length
            ? `. CHAIN-INTERNAL: ${makers.join(", ")} creates that signature earlier in this same run, so it is ABSENT on the target before the window and the drop is a within-run teardown`
            : d.ifExists
              ? ". Written `if exists`, the estate's REDO-SAFE form: the file itself says the signature may never have existed on a fresh chain, so its absence is lawful and this read is facts only"
              : ". A BARE drop: the signature must exist today, or the drop is a no-op and the file's premise has moved"),
        softDrop ? "absence is lawful" : "present",
        `with d(sig) as (values ${vals})
         select (select count(*)::int from d where to_regprocedure(d.sig) is not null) as present,
                (select coalesce(count(*),0)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='clara' and p.proname = '${bare}') as bodies_of_that_name`,
        (r) => ({
          ok: softDrop ? true : r.present === 1,
          detail:
            `${d.sig} resolves today=${r.present} · live bodies named clara.${bare}=${r.bodies_of_that_name}` +
            (makers.length
              ? ` · not counted: ${makers.join(", ")} mints it inside this same run`
              : d.ifExists
                ? " · not counted: the drop is written `if exists`"
                : ""),
        }),
      );
    }
  }

  // ---------------------------------------------------------------------------------------
  // 0297 / 0299 / 0300: the chart rows the posting lanes resolve BY NAME are 0295's, and the
  // receipt lane vocabulary is widened twice. Both are CHAIN-INTERNAL and are read for facts.
  // ---------------------------------------------------------------------------------------
  if (newCodes) {
    push(
      "D-CHART-CONSUMERS",
      "chained",
      "0297/0300 prestate: `2040 Salaries Payable` and `2050 Rent Payable` must be on the PUBLISHED standard chart, and their tails demand EXACTLY ONE published row at each code. " +
        "CHAIN-INTERNAL: 0295 mints both on my_sme_starter v2 and retires v1 earlier in this same run, so before the window the published starter carries NEITHER. Read for facts",
      "0 before the window, 1 after",
      `select coalesce(string_agg(a.account_code || '=' || n, ', ' order by a.account_code), '(none)') as published_hits
         from (select a.account_code, count(*)::int n
                 from clara.coa_template_accounts a
                 join clara.coa_templates t on t.id = a.template_id
                where t.template_key='my_sme_starter' and t.scope='platform' and t.state='published'
                  and a.account_code = any(array[${newCodes.value}])
                group by a.account_code) a`,
      (r) => ({
        ok: true,
        detail:
          `published my_sme_starter rows at the four new codes today: {${r.published_hits}} · ` +
          "expected `(none)` before the window (v1 carries none of them) and one row at each of the four after it, on v2",
      }),
    );
  }
  push(
    "D-RECEIPT-LANE",
    "pre",
    "0297 then 0299 each swap clara.entry_post_receipts' via_wake_kind CHECK, widening the lane vocabulary. The read is the LIVE definition and the relation's size, because the swap re-scans every row",
    "facts only",
    `select coalesce((select pg_get_constraintdef(oid) from pg_constraint
                       where conrelid='clara.entry_post_receipts'::regclass
                         and conname='entry_post_receipts_via_wake_kind_check'), '(absent)') as def,
            (select count(*)::int from clara.entry_post_receipts) as rows,
            (select coalesce(string_agg(s, ', ' order by s), '(none)') from (
               select via_wake_kind || '=' || count(*)::text as s
                 from clara.entry_post_receipts where via_wake_kind is not null
                group by via_wake_kind) x) as by_kind`,
    (r) => ({
      ok: r.def !== "(absent)",
      detail:
        `live definition = ${String(r.def).replace(/\s+/g, " ")} · clara.entry_post_receipts rows=${r.rows} {${r.by_kind}} · ` +
        "both swaps are WIDENINGS that carry every existing literal forward, so the re-validating scan cannot refuse an existing row",
    }),
  );

  // ---------------------------------------------------------------------------------------
  // 0296 / 0299: two frozen evaluator families are REGISTERED. The registry is append-only, and
  // the register is what the runtime's own boot pins have to agree with.
  // ---------------------------------------------------------------------------------------
  push(
    "D-EVALUATORS",
    "pre",
    "0296 and 0299 each register a NEW frozen evaluator (clara.evaluator_versions + its members). The register is append-only; neither name may already be there on a first apply",
    "neither registered",
    `select (select count(*)::int from clara.evaluator_versions) as versions,
            (select count(*)::int from clara.evaluator_version_members) as members,
            (select coalesce(string_agg(distinct evaluator_name, ', ' order by evaluator_name), '(none)')
               from clara.evaluator_versions) as names,
            (select count(*)::int from clara.evaluator_versions
              where evaluator_name like '%payroll%' or evaluator_name like '%agreement%') as already_here`,
    (r) => ({
      ok: r.already_here === 0,
      detail:
        `clara.evaluator_versions=${r.versions} rows, members=${r.members} · registered names {${r.names}} · ` +
        `rows already naming a payroll or agreement evaluator=${r.already_here} (must be 0 on a first apply)`,
    }),
  );

  // ---------------------------------------------------------------------------------------
  // The catalogue keys the wave's predicates rely on (0300's reporting_framework, 0310/0311/0318's
  // knowledge keys). Parsed from the files' own membership assertions.
  // ---------------------------------------------------------------------------------------
  const keyAsserts = (() => {
    const out = new Set();
    for (const v of PENDING) {
      for (const m of codeOf(v).matchAll(/knowledge_keys[\s\S]{0,120}?knowledge_key\s*=\s*'([a-z_0-9]+)'/gi)) {
        out.add(m[1]);
      }
    }
    return [...out].sort();
  })();
  if (keyAsserts.length) {
    const vals = keyAsserts.map((k) => `('${k}')`).join(",");
    push(
      "D-KNOWLEDGE-KEYS",
      "pre",
      `the ${keyAsserts.length} knowledge key(s) this wave's predicates name (${keyAsserts.join(", ")}) must all be catalogue members - several files refuse outright if one is not`,
      `${keyAsserts.length} present`,
      `with want(k) as (values ${vals})
       select count(*)::int as wanted,
              count(*) filter (where exists (select 1 from clara.knowledge_keys kk where kk.knowledge_key = w.k))::int as present,
              coalesce(string_agg(w.k, ', ' order by w.k)
                filter (where not exists (select 1 from clara.knowledge_keys kk where kk.knowledge_key = w.k)), '(none)') as absent,
              (select count(*)::int from clara.knowledge_keys) as catalogue_rows
         from want w`,
      (r) => ({
        ok: r.present === r.wanted,
        detail: `${r.present}/${r.wanted} present · absent {${r.absent}} · clara.knowledge_keys holds ${r.catalogue_rows} rows`,
      }),
    );
  }

  return list;
}

// ==========================================================================================
// 3 · THE ESTATE FINGERPRINT. Everything a migration can define, flattened into one ordered
//     map of key -> value so a difference prints with both sides. Unchanged from wave 3.
// ==========================================================================================
const FP_SQL = {
  functions: `
    select p.oid::regprocedure::text as sig,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha,
           pg_get_userbyid(p.proowner) as owner,
           p.prosecdef as secdef,
           coalesce(array_to_string(p.proconfig, ' '), '') as proconfig,
           coalesce(p.proacl::text, '') as acl
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
     order by 1`,
  relations: `
    select c.relname, c.relkind::text as kind, pg_get_userbyid(c.relowner) as owner,
           coalesce(c.relacl::text, '') as acl,
           c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relkind in ('r','p','v','m','f')
     order by 1`,
  columns: `
    select c.relname, a.attname, format_type(a.atttypid, a.atttypmod) as type,
           a.attnotnull as notnull,
           coalesce(pg_get_expr(d.adbin, d.adrelid), '') as dflt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
     where n.nspname = 'clara' and c.relkind in ('r','p','v','m','f')
     order by 1, 2`,
  constraints: `
    select c.relname, con.conname, pg_get_constraintdef(con.oid) as def, con.convalidated as validated
      from pg_constraint con join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara'
     order by 1, 2`,
  indexes: `
    select c.relname, i.relname as idxname, pg_get_indexdef(i.oid) as def
      from pg_index x join pg_class c on c.oid = x.indrelid
      join pg_class i on i.oid = x.indexrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara'
     order by 1, 2`,
  policies: `
    select c.relname, pol.polname, pol.polcmd::text as cmd,
           coalesce((select string_agg(pg_get_userbyid(r), ',' order by pg_get_userbyid(r))
                       from unnest(pol.polroles) r), 'PUBLIC') as roles,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') as using_expr,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as check_expr
      from pg_policy pol join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara'
     order by 1, 2`,
  triggers: `
    select c.relname, t.tgname, t.tgenabled::text as enabled, pg_get_triggerdef(t.oid) as def
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and not t.tgisinternal
     order by 1, 2`,
  views: `
    select c.relname, pg_get_viewdef(c.oid, true) as def
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relkind in ('v','m')
     order by 1`,
  types: `
    select t.typname, t.typtype::text as kind,
           coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder)
                       from pg_enum e where e.enumtypid = t.oid), '') as labels
      from pg_type t join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'clara' and t.typtype in ('e','d','c')
       and not exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind <> 'c')
     order by 1`,
  roles: `
    select r.rolname,
           concat_ws(' ', 'super=' || r.rolsuper, 'inherit=' || r.rolinherit,
                     'createrole=' || r.rolcreaterole, 'createdb=' || r.rolcreatedb,
                     'login=' || r.rolcanlogin, 'replication=' || r.rolreplication,
                     'bypassrls=' || r.rolbypassrls, 'connlimit=' || r.rolconnlimit) as attrs
      from pg_roles r where r.rolname like 'clara%' order by 1`,
  memberships: `
    select m.rolname as member, g.rolname as grantee_of
      from pg_auth_members am
      join pg_roles m on m.oid = am.member
      join pg_roles g on g.oid = am.roleid
     where m.rolname like 'clara%' or g.rolname like 'clara%'
     order by 1, 2`,
};

async function buildFingerprint(q, countRelations) {
  const map = {};
  const put = (k, v) => { map[k] = v; };

  for (const r of await q(FP_SQL.functions)) {
    put(`fn:${r.sig}`, `sha=${r.prosrc_sha} owner=${r.owner} secdef=${r.secdef} config={${r.proconfig}} acl={${r.acl}}`);
  }
  for (const r of await q(FP_SQL.relations)) {
    put(`rel:${r.relname}:meta`, `kind=${r.kind} owner=${r.owner} acl={${r.acl}} rls=${r.rls_enabled} forced=${r.rls_forced}`);
  }
  for (const r of await q(FP_SQL.columns)) put(`rel:${r.relname}:col:${r.attname}`, `type=${r.type} notnull=${r.notnull} default={${r.dflt}}`);
  for (const r of await q(FP_SQL.constraints)) put(`rel:${r.relname}:con:${r.conname}`, `${r.def} validated=${r.validated}`);
  for (const r of await q(FP_SQL.indexes)) put(`rel:${r.relname}:idx:${r.idxname}`, r.def);
  for (const r of await q(FP_SQL.policies)) put(`rel:${r.relname}:pol:${r.polname}`, `cmd=${r.cmd} roles={${r.roles}} using={${r.using_expr}} check={${r.check_expr}}`);
  for (const r of await q(FP_SQL.triggers)) put(`rel:${r.relname}:trg:${r.tgname}`, `enabled=${r.enabled} ${r.def}`);
  for (const r of await q(FP_SQL.views)) put(`rel:${r.relname}:viewdef`, String(r.def).replace(/\s+/g, " ").trim());
  for (const r of await q(FP_SQL.types).catch(() => [])) put(`type:${r.typname}`, `kind=${r.kind} labels={${r.labels}}`);
  for (const r of await q(FP_SQL.roles)) put(`role:${r.rolname}`, r.attrs);
  for (const r of await q(FP_SQL.memberships)) put(`rolemember:${r.member}->${r.grantee_of}`, "granted");

  const counts = {};
  for (const rel of countRelations) {
    const rows = await q(
      `select case when to_regclass('clara.${rel}') is null then null
                   else (select count(*) from clara.${rel}) end as n`,
    ).catch(() => [{ n: null }]);
    counts[rel] = rows[0]?.n === null || rows[0]?.n === undefined ? "<absent>" : String(rows[0].n);
  }

  const led = (await q("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"))[0];
  return { taken_at: new Date().toISOString(), ledger: led, structure: map, counts };
}

/**
 * ROLE ATTRIBUTES AND ROLE MEMBERSHIPS ARE ENVIRONMENT FACTS (the wave-2 as-run lesson, carried
 * forward). The rig is a trust-auth cluster the integrator built; hosted is a managed Supabase
 * estate. Their role catalogs differ for reasons NO migration touches - LOGIN on the *_login
 * roles, clara_storage_docs and its memberships, the managed `authenticated` ->
 * `clara_authenticated` grant, `postgres` -> `clara_*`. Wave 2 STOPPED on 14 of these and the
 * operator overruled every one at window time; wave 3 printed the same 14 as `env` and overruled
 * nothing. They are printed here with both sides, under `env`, and never counted.
 *
 * WAVE 4 MINTS TWO ROLES (0309), and that is exactly why this rule has to stay a rule rather
 * than become an exception: the two new roles will appear as `env` lines against a pre-window
 * baseline and disappear against an upgraded one, and neither is drift. What DOES check them is
 * D-ROLE-PAIR, which reads their ABSENCE as a first-apply precondition, and the grant this wave
 * gives the new door, which is an `fn:` ACL key and still STOPs.
 */
const isEnvKey = (k) => k.startsWith("role:") || k.startsWith("rolemember:");

/**
 * Compare two fingerprints. A difference on an object the PENDING set names is TOLERATED, with
 * the file that names it and the reason; a difference on an object a pending PRESTATE PINS is a
 * STOP, because that pin is what will refuse. A role-level difference is an env fact.
 * Everything else is DRIFT.
 */
function compareFingerprints(target, baseline, label) {
  const PIN_WINDOW = 500;
  const PIN_EVIDENCE =
    /[0-9a-f]{64}|DRIFTED|pre-image|pinned|byte-identical|pg_get_constraintdef|pg_get_indexdef|pg_get_triggerdef|pg_get_viewdef|is distinct from/i;
  const names = new Map();
  const pinned = new Map();
  const DDL_RE =
    /^[ \t]*(?:set\s+role\b|create\s+(?:or\s+replace\s+)?(?:constraint\s+)?(?:function|table|trigger|index|unique\s+index|view|materialized\s+view|type|policy|schema|sequence|role)\b|alter\s+table\b|drop\s+(?:function|index)\b|update\s+clara\.|insert\s+into\s+clara\.|delete\s+from\s+clara\.|grant\s+|revoke\s+)/im;
  const add = (map, id, v) => { if (!map.has(id)) map.set(id, new Set()); map.get(id).add(v); };

  // (1) THE PARSED PIN LEDGER IS THE PRIMARY SOURCE. Section 1 already reads every
  //     `sha256(prosrc)` pin the wave carries, by signature; a body it names is PINNED, full
  //     stop. MEASURED NEED (negative control NC13): the heuristic below alone missed 0295's
  //     three pins outright, because that file opens with a `create function pg_temp.…` helper
  //     and the heuristic took THAT as the end of the prestate - so a corrupted baseline value
  //     on a pinned body printed as TOLERATED and the run came back CLEAN. A pin that is parsed
  //     is not a guess, and it is what will actually refuse inside the window.
  for (const p of parsedBodyPins()) {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
    if (bare) add(pinned, bare, p.version);
  }

  // (2) THE HEURISTIC, kept for what the pin ledger cannot see: a constraint definition, a view
  //     definition, an ACL or a trigger shape a prestate compares by text rather than by sha.
  for (const v of PENDING) {
    const code = codeOf(v);
    const prestate = code.slice(0, prestateEnd(code));
    for (const x of code.matchAll(/\b([a-z_][a-z_0-9]{3,})\b/g)) add(names, x[1], v);
    for (const x of prestate.matchAll(/\b([a-z_][a-z_0-9]{3,})\b/g)) {
      const from = Math.max(0, x.index - PIN_WINDOW);
      if (PIN_EVIDENCE.test(prestate.slice(from, x.index + PIN_WINDOW))) add(pinned, x[1], v);
    }
  }

  /**
   * Where a file's PRESTATE ends: the first real DDL statement. A `create temp table` or a
   * `create function pg_temp.…` is the file's OWN scratch, written BEFORE its prestate block
   * (0295 does exactly this), so taking one as the boundary truncates the prestate to nothing.
   */
  function prestateEnd(code) {
    DDL_RE.lastIndex = 0;
    const re = new RegExp(DDL_RE.source, "gim");
    let m;
    while ((m = re.exec(code))) {
      const stmt = code.slice(m.index, m.index + 120);
      if (/create\s+(?:temp|temporary)\s+table/i.test(stmt)) continue;
      if (/create\s+(?:or\s+replace\s+)?function\s+pg_temp\./i.test(stmt)) continue;
      return m.index;
    }
    return code.length;
  }
  /** The identifiers a fingerprint key is ABOUT - never the schema name, never a type word. */
  const idsOf = (key) => {
    if (key.startsWith("fn:")) {
      const m = /^fn:clara\.([a-z_0-9]+)\(/.exec(key);
      return m ? [m[1]] : [];
    }
    if (key.startsWith("rel:")) {
      const parts = key.split(":");
      return parts.length > 3 ? [parts[1], parts[3]] : [parts[1]];
    }
    if (key.startsWith("type:")) return [key.slice(5)];
    if (key.startsWith("role:")) return [key.slice(5)];
    if (key.startsWith("rolemember:")) return key.slice(11).split("->");
    return [];
  };

  const keys = [...new Set([...Object.keys(target.structure), ...Object.keys(baseline.structure)])].sort();
  const out = { drift: [], tolerated: [], pinnedDrift: [], env: [] };
  for (const k of keys) {
    const a = target.structure[k];
    const b = baseline.structure[k];
    if (a === b) continue;
    const ids = idsOf(k);
    const namedBy = [...new Set(ids.flatMap((i) => [...(names.get(i) || [])]))].sort();
    const pinnedBy = [...new Set(ids.flatMap((i) => [...(pinned.get(i) || [])]))].sort();
    const row = { key: k, target: a ?? "<absent>", baseline: b ?? "<absent>", namedBy, pinnedBy };
    if (isEnvKey(k)) out.env.push(row);
    else if (pinnedBy.length) out.pinnedDrift.push(row);
    else if (namedBy.length) out.tolerated.push(row);
    else out.drift.push(row);
  }

  say(`== estate fingerprint vs ${label} ==`);
  say(`  baseline taken ${baseline.taken_at}, ledger ${baseline.ledger.applied} / ${baseline.ledger.frontier}`);
  say(
    `  keys compared: ${keys.length}  ·  equal: ${keys.length - out.drift.length - out.tolerated.length - out.pinnedDrift.length - out.env.length}` +
      `  ·  env: ${out.env.length}`,
  );
  for (const r of out.pinnedDrift) {
    say(`  STOP DRIFT (PINNED by ${r.pinnedBy.join(", ")}) ${r.key}`);
    say(`         target  : ${r.target}`);
    say(`         baseline: ${r.baseline}`);
  }
  for (const r of out.drift) {
    say(`  STOP DRIFT ${r.key}`);
    say(`         target  : ${r.target}`);
    say(`         baseline: ${r.baseline}`);
  }
  for (const r of out.tolerated) {
    say(`  ok   TOLERATED (${r.namedBy.join(", ")} names this object and rewrites it) ${r.key}`);
    say(`         target  : ${r.target}`);
    say(`         baseline: ${r.baseline}`);
  }
  for (const r of out.env) {
    say(`  env  ROLE-LEVEL ENVIRONMENT FACT (never a STOP: the rig is a trust cluster, hosted is managed) ${r.key}`);
    say(`         target  : ${r.target}`);
    say(`         baseline: ${r.baseline}`);
  }
  stops += out.drift.length + out.pinnedDrift.length;

  say("  -- reference row counts (facts, never compared: the rig is seeded and hosted is not) --");
  const relSet = [...new Set([...Object.keys(target.counts), ...Object.keys(baseline.counts)])].sort();
  for (const rel of relSet) {
    say(
      `     ${rel.padEnd(42)} target=${String(target.counts[rel] ?? "<absent>").padStart(9)}  baseline=${String(baseline.counts[rel] ?? "<absent>").padStart(9)}`,
    );
  }
  return out;
}

// ==========================================================================================
// 4 · MAIN
// ==========================================================================================
function printPlan(frontierBefore) {
  say(`== plan (offline) ==`);
  say(`  migrations dir : ${MIGRATIONS_DIR}`);
  say(`  files on disk  : ${FILES.length}, highest version ${VERSIONS[VERSIONS.length - 1]}`);
  say(`  frontier before: ${frontierBefore}`);
  say(`  pending (${PENDING.length}):`);
  for (const v of PENDING) say(`     ${v}`);
  say("");
  const created = parsedCreatedTables();
  say(`== relations this wave CREATES (a precondition read against one is meaningless) ==`);
  say("  " + ([...created].sort().join(", ") || "(none)"));
  const roles = parsedCreatedRoles();
  say(`== cluster roles this wave MINTS ==`);
  say("  " + (roles.map((r) => `${r.role} (${r.version.slice(0, 4)})`).join(", ") || "(none)"));
  say("== generated reads: ADD CONSTRAINT ... CHECK on an existing table ==");
  const hands = handChecks(); // populates CHECK_DEFERRALS
  const addedCols = parsedAddColumns();
  const swaps = parsedDroppedConstraints();
  for (const c of parsedCheckConstraints()) {
    const def = CHECK_DEFERRALS.get(c.name);
    const swapped = swaps.some((s) => s.version === c.version && s.name === c.name);
    const head = `  ${c.version}  ${c.table} ${c.name}${swapped ? "  [SWAP: dropped then re-added in the same file]" : ""}`;
    if (def) say(`${head}\n      DEFERRED to ${def} (the CHECK calls a function this wave creates)`);
    else if (created.has(c.table)) say(`${head}\n      (table created by this wave - no existing row to fail)`);
    else say(`${head}\n      select count(*) from ${c.table} where not (${c.expr})`);
  }
  say("== generated reads: ADD CONSTRAINT ... FOREIGN KEY on an existing table ==");
  for (const f of parsedForeignKeys()) {
    const newCols = f.cols.filter((c) => addedCols.some((a) => a.table === f.table && a.column === c));
    say(
      `  ${f.version}  ${f.table} ${f.name} (${f.cols.join(", ")}) references ${f.references}\n` +
        `      ${newCols.length ? `${newCols.length}/${f.cols.length} referencing column(s) are ADDED by this wave - build cost only` : "PRE-EXISTING referencing columns - needs a real read"}`,
    );
  }
  say("== generated reads: ADD COLUMN on an existing relation ==");
  for (const c of addedCols) {
    say(
      `  ${c.version}  ${c.table}.${c.column}${created.has(c.table) ? " (on a relation this wave creates)" : "  -> must be ABSENT before the window"}` +
        `\n      declared: ${c.declared || "(bare)"}  notnull=${c.notnull} default=${c.dflt ?? "(none - every existing row is NULL)"}`,
    );
  }
  say("== generated reads: CREATE [UNIQUE] INDEX ==");
  for (const i of parsedIndexes()) {
    if (i.unique) {
      say(
        `  ${i.version}  ${i.name} UNIQUE on ${i.table} (${i.cols})${i.pred ? ` where ${i.pred}` : ""}\n      select count(*) from (select 1 from ${i.table}${i.pred ? ` where ${i.pred}` : ""} group by ${i.cols} having count(*) > 1) d`,
      );
    } else {
      say(`  ${i.version}  ${i.name} on ${i.table} (${i.cols})${i.pred ? ` where ${i.pred}` : ""}\n      select count(*) from ${i.table}${i.pred ? ` where ${i.pred}` : ""}   (build cost only)`);
    }
  }
  const nn = parsedSetNotNull();
  say(`== generated reads: SET NOT NULL on an existing column == ${nn.length ? "" : "(none in this wave)"}`);
  for (const n of nn) say(`  ${n.version}  select count(*) from ${n.table} where ${n.column} is null`);
  const val = parsedValidate();
  say(`== generated reads: VALIDATE CONSTRAINT == ${val.length ? "" : "(none in this wave)"}`);
  for (const v of val) say(`  ${v.version}  ${v.table} ${v.name}`);
  const wu = parsedUpdates();
  say(`== generated reads: top-level UPDATE == ${wu.length ? "" : "(none in this wave)"}`);
  for (const u of wu) {
    say(
      `  ${u.version}  update ${u.table} set ${u.set.slice(0, 70)}${u.where ? ` where ${u.where.slice(0, 90)}` : "  [NO WHERE CLAUSE: every row]"}\n      select count(*) from ${u.table}${u.where ? ` where ${u.where}` : ""}   (rows rewritten, each firing every row trigger)`,
    );
  }
  const dl = parsedDeletes();
  say(`== generated reads: top-level DELETE == ${dl.length ? "" : "(none in this wave)"}`);
  for (const d of dl) say(`  ${d.version}  delete from ${d.table} ${d.where}`);
  say("== generated reads: EXECUTE grants this wave WITHDRAWS ==");
  for (const r of parsedRevokedGrants()) say(`  ${r.version}  revoke execute on ${r.sig} from ${r.role}`);
  say("== generated reads: functions this wave DROPS ==");
  for (const d of parsedDroppedFunctions()) say(`  ${d.version}  drop function ${d.sig}`);

  // THE PIN LEDGER, and its chain-internal half.
  const pins = parsedBodyPins();
  const produced = parsedProducedBodies();
  let measurable = 0;
  let chained = 0;
  say(`== sha256(prosrc) PINS parsed from the pending set: ${pins.length} (file, signature) pair(s) ==`);
  for (const p of pins) {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
    const makers = (produced.get(bare) || []).filter((v) => v < p.version);
    if (makers.length) chained++;
    else measurable++;
  }
  say(`  measurable on the target before the window : ${measurable}`);
  say(`  CHAIN-INTERNAL (an earlier pending file produces the body): ${chained}`);
  for (const p of pins) {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
    const makers = (produced.get(bare) || []).filter((v) => v < p.version);
    say(
      `  ${p.version.slice(0, 4)}  ${p.sig}  admits ${p.shas.length} value(s) [${p.shas.map((s) => s.slice(0, 10)).join(", ")}]` +
        (makers.length ? `   CHAINED behind ${makers.map((v) => v.slice(0, 4)).join(", ")}` : ""),
    );
  }
  const un = unattributedDigests(pins);
  say(`== 64-hex digests this parser did NOT attribute to a body pin: ${un.length} ==`);
  for (const u of un) say(`  ${u.version.slice(0, 4)}  ${u.sha.slice(0, 16)}...  (a view definition, a catalogue-row digest, or a collation-independent content digest - covered by a hand check, not by the pin ledger)`);

  say("== hand-written data preconditions (their expected values parsed from the files) ==");
  for (const h of hands) say(`  ${h.id.padEnd(22)} [${h.phase}] expect=${String(h.lit).slice(0, 52)}\n      ${h.guards}`);
  say("== relations the quiescence census watches (parsed from the executed statements) ==");
  say("  " + parsedLockedRelations().join(", "));
  say("== reference relations counted in the fingerprint ==");
  say("  " + parsedCountRelations().join(", "));
}

async function main() {
  // --- offline plan -----------------------------------------------------------------------
  if (PLAN_ONLY) {
    const fb =
      FRONTIER_BEFORE_ARG ||
      (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")).frontier_before : null);
    if (!fb) {
      say("  note --plan without --frontier-before: assuming every file above the highest version this");
      say("       script has ever seen is pending is not safe, so the pending set is taken as the files");
      say("       whose version sorts above the one named by --frontier-before. Pass it.");
      process.exit(2);
    }
    PENDING = VERSIONS.filter((v) => v > fb);
    printPlan(fb);
    process.exit(gaps === 0 ? 0 : 1);
  }

  const { makeClient } = await import(`file:///${REPO}/packages/db/lib/pg.mjs`);
  const c = makeClient();
  await c.connect();
  await c.query("begin transaction read only");
  const q = async (sql, params = []) => {
    await c.query("savepoint rq");
    try {
      const r = await c.query(sql, params);
      await c.query("release savepoint rq");
      return r.rows;
    } catch (e) {
      await c.query("rollback to savepoint rq");
      throw e;
    }
  };
  const soft = async (sql) => q(sql).catch((e) => [{ err: e.code || e.message }]);

  // --- identity ---------------------------------------------------------------------------
  const ident = (
    await q(
      `select current_database() as db, inet_server_port() as port, inet_server_addr()::text as addr,
              left(version(), 24) as ver, current_user as who, clock_timestamp() as db_clock,
              (select datcollate from pg_database where datname = current_database()) as collate,
              (select datctype from pg_database where datname = current_database()) as ctype`,
    )
  )[0];
  say(
    `== server == db=${ident.db} port=${ident.port} addr=${ident.addr} ${ident.ver} user=${ident.who} clock=${ident.db_clock.toISOString?.() ?? ident.db_clock}`,
  );
  say(`             collation=${ident.collate} ctype=${ident.ctype}`);
  say(
    "             (0295 pins a COLLATION-INDEPENDENT structural digest, never the stored content_sha256, precisely because that value moves with this line)",
  );
  if (PROD) {
    check(
      "--prod: hosted estate (db=postgres, port 5432, not loopback)",
      ident.db === "postgres" && Number(ident.port) === 5432 && !String(ident.addr).startsWith("127."),
    );
  }

  // --- ledger + the wave --------------------------------------------------------------------
  const led = (await q("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"))[0];
  say(`== ledger == applied=${led.applied} frontier=${led.frontier}`);

  // An explicit --frontier-before always wins: it is what makes an EXPORT from an already-
  // upgraded database parse the same wave (and therefore count the same reference relations) as
  // an export from the pre-window one.
  let frontierBefore = FRONTIER_BEFORE_ARG;
  if (!frontierBefore && !POST) frontierBefore = led.frontier;
  if (!frontierBefore && POST && existsSync(STATE_FILE)) {
    frontierBefore = JSON.parse(readFileSync(STATE_FILE, "utf8")).frontier_before;
  }
  PENDING = frontierBefore ? VERSIONS.filter((v) => v > frontierBefore) : [];

  const appliedRows = await q("select version, checksum from clara.schema_migrations order by version");

  if (ONLY_CENSUS) {
    await census(soft);
    await finish(c);
    return;
  }

  if (ONLY_PINS) {
    await bodyPins(q);
    await finish(c);
    return;
  }

  if (EXPORT_TO) {
    const fp = await buildFingerprint(q, parsedCountRelations());
    writeFileSync(EXPORT_TO, JSON.stringify(fp, null, 1));
    say(`== fingerprint exported ==`);
    say(`  ${Object.keys(fp.structure).length} structural key(s), ${Object.keys(fp.counts).length} reference count(s)`);
    say(`  ledger ${fp.ledger.applied} / ${fp.ledger.frontier}`);
    say(`  written to ${EXPORT_TO}`);
    await finish(c);
    return;
  }

  if (!POST) {
    // ---- (a) pre-window -------------------------------------------------------------------
    say("== (a) pre-window ==");
    const onDiskBefore = VERSIONS.filter((v) => v <= led.frontier).length;
    check(
      `the ledger is at the frontier this wave builds on (${led.applied} applied, ${led.frontier})`,
      led.applied === onDiskBefore,
      `${led.applied} applied vs ${onDiskBefore} file(s) at or below ${led.frontier} on disk`,
    );
    let drift = 0;
    const byVersion = new Map(VERSIONS.map((v) => [v, v]));
    for (const r of appliedRows) {
      const f = byVersion.get(r.version);
      if (!f) { drift++; say(`   DRIFT ${r.version} - applied but ABSENT from the directory`); continue; }
      if (migrationChecksum(textOf(f)) !== r.checksum) { drift++; say(`   DRIFT ${r.version} - checksum differs from the file`); }
    }
    check(`drift gate: all ${appliedRows.length} applied rows match their files`, drift === 0);
    say(`  pending set (${PENDING.length}):`);
    for (const v of PENDING) say(`     ${v}`);
    check(
      "the pending set is exactly the files above the frontier and nothing below it is missing",
      PENDING.length === FILES.length - led.applied && PENDING.every((v) => v > led.frontier),
      `${PENDING.length} pending · ${FILES.length} files on disk · ${led.applied} applied`,
    );
    say(
      `  after the migrate the ledger should read ${led.applied} + ${PENDING.length} = ${led.applied + PENDING.length} / ${PENDING[PENDING.length - 1] ?? "<none>"}`,
    );
    if (!NO_STATE) {
      writeFileSync(
        STATE_FILE,
        JSON.stringify(
          { frontier_before: led.frontier, applied_before: led.applied, pending: PENDING, taken_at: new Date().toISOString() },
          null,
          1,
        ),
      );
      say(`  state written to ${STATE_FILE} (so --post can re-derive the arithmetic)`);
    }

    // ---- (b) fingerprint ------------------------------------------------------------------
    const fp = await buildFingerprint(q, parsedCountRelations());
    if (BASELINE) compareFingerprints(fp, JSON.parse(readFileSync(BASELINE, "utf8")), `baseline ${BASELINE}`);
    else note("no --baseline given: the estate fingerprint comparison was NOT run", `${Object.keys(fp.structure).length} keys read`);

    // ---- (c) data preconditions -----------------------------------------------------------
    await dataPreconditions(q);

    // ---- (c2) the body pins ---------------------------------------------------------------
    await bodyPins(q);

    // ---- (d) quiescence census ------------------------------------------------------------
    await census(soft);
  } else {
    // ---- (e) post ------------------------------------------------------------------------
    say("== (e) post-migrate ==");
    if (!frontierBefore) {
      note("neither --frontier-before nor a state file: the 288 + N arithmetic could not be re-derived");
      check(
        "the ledger equals the directory",
        led.applied === FILES.length && led.frontier === VERSIONS[VERSIONS.length - 1],
        `${led.applied} applied vs ${FILES.length} files, frontier ${led.frontier} vs ${VERSIONS[VERSIONS.length - 1]}`,
      );
    } else {
      const st = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
      const before = st?.applied_before ?? VERSIONS.filter((v) => v <= frontierBefore).length;
      check(
        `the ledger reads ${before} + ${PENDING.length} = ${before + PENDING.length} at ${PENDING[PENDING.length - 1]}`,
        led.applied === before + PENDING.length && led.frontier === PENDING[PENDING.length - 1],
        `applied=${led.applied} frontier=${led.frontier}`,
      );
    }
    const have = new Map(appliedRows.map((r) => [r.version, r.checksum]));
    let missing = 0;
    let wrong = 0;
    for (const v of PENDING) {
      if (!have.has(v)) { missing++; say(`   STOP ${v} - no ledger row`); continue; }
      if (have.get(v) !== migrationChecksum(textOf(v))) { wrong++; say(`   STOP ${v} - ledger checksum differs from the file`); }
    }
    check(
      `every one of the ${PENDING.length} new migrations has a ledger row at its file checksum`,
      missing === 0 && wrong === 0,
      `missing=${missing} checksum-mismatch=${wrong}`,
    );
    let drift = 0;
    for (const r of appliedRows) {
      const f = VERSIONS.includes(r.version) ? r.version : null;
      if (!f) { drift++; say(`   DRIFT ${r.version} - applied but absent from the directory`); continue; }
      if (migrationChecksum(textOf(f)) !== r.checksum) { drift++; say(`   DRIFT ${r.version} - checksum differs from the file`); }
    }
    check(`drift gate: all ${appliedRows.length} applied rows match their files`, drift === 0);

    const fp = await buildFingerprint(q, parsedCountRelations());
    if (BASELINE) compareFingerprints(fp, JSON.parse(readFileSync(BASELINE, "utf8")), `UPGRADED baseline ${BASELINE}`);
    else note("no --baseline given: the post fingerprint comparison was NOT run", `${Object.keys(fp.structure).length} keys read`);
    await postReads(q);
    await census(soft);
  }

  await finish(c);
}

// ==========================================================================================
// 5 · THE DATA PRECONDITIONS, generated and hand-written
// ==========================================================================================
async function dataPreconditions(q) {
  say("== (c) data preconditions: would this statement pass on the target? ==");
  const created = parsedCreatedTables();
  const hands = handChecks(); // populates CHECK_DEFERRALS before the generated reads consult it
  const handIds = new Set(hands.map((h) => h.id));
  const addedCols = parsedAddColumns();
  const swaps = parsedDroppedConstraints();

  say("  -- ADD CONSTRAINT ... CHECK on an existing table (parsed from the files) --");
  for (const c of parsedCheckConstraints()) {
    if (created.has(c.table)) {
      note(`${c.version} ${c.name} on ${c.table}`, "the relation is CREATED by this wave - it has no existing row to fail");
      continue;
    }
    const deferred = CHECK_DEFERRALS.get(c.name);
    if (deferred) {
      if (handIds.has(deferred)) {
        check(`${c.version} ${c.name} on ${c.table}`, true, `the CHECK calls a function this wave creates, so the generic read cannot run; ${deferred} runs the file's OWN predicate instead`);
      } else {
        gap(`${c.version} ${c.name}`, `deferred to ${deferred}, which did not parse`);
      }
      continue;
    }
    // A SWAP prints the live definition beside the new predicate, so a widening and a narrowing
    // are told apart by reading rather than by trusting a header.
    const swapped = swaps.some((s) => s.version === c.version && s.name === c.name);
    if (swapped) {
      const liveRows = await q(
        `select coalesce((select pg_get_constraintdef(oid) from pg_constraint
                           where conrelid='${c.table}'::regclass and conname='${c.name}'), '(absent)') as def`,
      ).catch(() => [{ def: "(unreadable)" }]);
      note(
        `${c.version} ${c.name} on ${c.table} is a SWAP`,
        `live: ${String(liveRows[0].def).replace(/\s+/g, " ").slice(0, 220)}`,
      );
    }
    const sql = `select case when to_regclass('${c.table}') is null then -1
                             else (select count(*)::int from ${c.table} where not (${c.expr})) end as bad`;
    let rows;
    try {
      rows = await q(sql);
    } catch (e) {
      // 42703: the CHECK names a column that does not exist YET. That is lawful exactly when a
      // pending file ADDS it. WAVE-4 CHANGE: which rows then satisfy it depends on the column's
      // DEFAULT. With no default every existing row is NULL and every one of these CHECKs admits
      // NULL; with a default, the predicate must be evaluated against the DEFAULT VALUE, which
      // is what `add column ... not null default` writes into every existing row.
      const miss = /column "([a-z_0-9]+)" does not exist/i.exec(String(e.message || ""));
      const sub = substituteAddedColumns(c.table, c.expr, addedCols);
      if (!miss || !sub.applied.length) {
        gap(`${c.version} ${c.name}`, `the generated read did not run: ${e.code || e.message}`);
        continue;
      }
      // Substitute EVERY column this wave adds to the relation (its default, or null) and re-run
      // the predicate as an ordinary row read. If the substituted predicate still will not run,
      // that is a GAP - never a pass.
      let r2;
      try {
        r2 = await q(
          `select (select count(*)::int from ${c.table} where not (${sub.expr})) as bad,
                  (select count(*)::int from ${c.table}) as rows`,
        );
      } catch (e2) {
        gap(
          `${c.version} ${c.name}`,
          `the CHECK names ${c.table}.${miss[1]}; substituting ${sub.applied.join(", ")} still did not run: ${e2.code || e2.message}`,
        );
        continue;
      }
      check(
        `${c.version} ${c.name} on ${c.table}`,
        r2[0].bad === 0,
        `the CHECK names a column this wave adds, so it was evaluated with ${sub.applied.join(", ")} - the value an existing row really carries after the ADD. ` +
          `${r2[0].bad} of ${r2[0].rows} existing row(s) would fail`,
      );
      continue;
    }
    const bad = rows[0].bad;
    if (bad < 0) { note(`${c.version} ${c.name}`, `${c.table} does not exist yet - the constraint rides a table this wave creates`); continue; }
    check(
      `${c.version} ${c.name} on ${c.table}`,
      bad === 0,
      `${bad} existing row(s) would fail  ·  check (${c.expr.slice(0, 140)}${c.expr.length > 140 ? "..." : ""})`,
    );
  }

  say("  -- ADD CONSTRAINT ... FOREIGN KEY on an existing table (parsed from the files) --");
  for (const f of parsedForeignKeys()) {
    if (created.has(f.table)) { note(`${f.version} ${f.name}`, `${f.table} is CREATED by this wave`); continue; }
    const fromThisWave = f.cols.filter((col) => addedCols.some((a) => a.table === f.table && a.column === col));
    if (fromThisWave.length === 0) {
      gap(`${f.version} ${f.name}`, `every referencing column of ${f.table} (${f.cols.join(", ")}) pre-exists - the validating scan needs a real read this script does not generate`);
      continue;
    }
    const rows = await q(`select count(*)::int as n from ${f.table}`).catch(() => [{ n: -1 }]);
    check(
      `${f.version} ${f.name} on ${f.table} (${f.cols.join(", ")}) references ${f.references}`,
      true,
      `${fromThisWave.length} of ${f.cols.length} referencing column(s) are created by this wave, so MATCH SIMPLE satisfies the FK trivially; the VALIDATE scan still reads ${rows[0].n} row(s) under ACCESS EXCLUSIVE`,
    );
  }

  say("  -- ADD COLUMN on an existing relation (must be absent before the window) --");
  for (const a of addedCols) {
    if (created.has(a.table)) { note(`${a.version} ${a.table}.${a.column}`, "on a relation this wave creates"); continue; }
    const rows = await q(
      `select count(*)::int as n from information_schema.columns
        where table_schema = split_part('${a.table}', '.', 1) and table_name = split_part('${a.table}', '.', 2)
          and column_name = '${a.column}'`,
    ).catch(() => [{ n: -1 }]);
    check(
      `${a.version} add column ${a.table}.${a.column}`,
      rows[0].n === 0,
      rows[0].n === 0
        ? `absent, as a first apply requires · declared \`${a.declared}\`, default ${a.dflt ?? "(none)"} - ${a.dflt ? "every existing row is backfilled with that default" : "every existing row is NULL there"}`
        : `ALREADY PRESENT (${rows[0].n}) - this is a redo or a half-applied estate`,
    );
  }

  say("  -- CREATE [UNIQUE] INDEX (parsed from the files) --");
  for (const i of parsedIndexes()) {
    if (created.has(i.table)) { note(`${i.version} ${i.name} on ${i.table}`, "the relation is CREATED by this wave - the index builds over zero rows"); continue; }
    if (i.unique) {
      // A UNIQUE index whose KEY or PREDICATE names a column this wave adds is still a real
      // question - it is the existing rows that would collide - so the added columns are
      // substituted with the value they will really carry (their default, or null) and the
      // duplicate census is run for real. 0317's uq_prepayment_schedules_source_live keys on a
      // pre-existing column behind a `where superseded_at is null` predicate whose column 0317
      // itself adds: every existing row enters the index, and whether two of them share a
      // source_entry_id is exactly what decides the build.
      const subCols = substituteAddedColumns(i.table, i.cols, addedCols);
      const subPred = i.pred ? substituteAddedColumns(i.table, i.pred, addedCols) : { expr: null, applied: [] };
      const applied = [...subCols.applied, ...subPred.applied];
      const sql = `select case when to_regclass('${i.table}') is null then -1
                               else (select count(*)::int from (select 1 from ${i.table}${subPred.expr ? ` where ${subPred.expr}` : ""} group by ${subCols.expr} having count(*) > 1) d) end as dupes`;
      let rows;
      try { rows = await q(sql); } catch (e) { gap(`${i.version} ${i.name}`, `the generated read did not run: ${e.code || e.message}${applied.length ? ` (after substituting ${applied.join(", ")})` : ""}`); continue; }
      if (rows[0].dupes < 0) { note(`${i.version} ${i.name}`, `${i.table} does not exist yet`); continue; }
      check(
        `${i.version} ${i.name} UNIQUE on ${i.table} (${i.cols})${i.pred ? ` where ${i.pred}` : ""}`,
        rows[0].dupes === 0,
        `${rows[0].dupes} key(s) already hold more than one row` +
          (applied.length ? ` · evaluated with ${applied.join(", ")}, the value an existing row carries after the ADD` : ""),
      );
    } else {
      const newCols = addedCols.filter(
        (a) => a.table === i.table && new RegExp(`\\b${a.column}\\b`).test(`${i.cols} ${i.pred ?? ""}`),
      );
      const totalRows = await q(
        `select case when to_regclass('${i.table}') is null then -1 else (select count(*)::int from ${i.table}) end as total`,
      ).catch(() => [{ total: -1 }]);
      if (newCols.length) {
        note(
          `${i.version} ${i.name} on ${i.table}`,
          `the index keys on ${[...new Set(newCols.map((c) => c.column))].join(", ")}, which ${[...new Set(newCols.map((c) => c.version))].join(", ")} adds in the same run; ` +
            `${newCols.some((c) => c.dflt) ? `each existing row is backfilled with that column's default, so all ${totalRows[0].total} row(s) enter the index` : `every one of the ${totalRows[0].total} existing row(s) is NULL there, so ZERO rows enter the index`} - build cost only`,
        );
        continue;
      }
      const sql = `select case when to_regclass('${i.table}') is null then -1
                               else (select count(*)::int from ${i.table}${i.pred ? ` where ${i.pred}` : ""}) end as n`;
      let rows;
      try { rows = await q(sql); } catch (e) { gap(`${i.version} ${i.name}`, `the generated read did not run: ${e.code || e.message}`); continue; }
      note(
        `${i.version} ${i.name} on ${i.table}`,
        rows[0].n < 0
          ? "the relation does not exist yet"
          : `${rows[0].n} row(s) enter the index (of ${totalRows[0].total} in the relation) - build cost only, no failure mode, but the build holds SHARE on the WHOLE relation and blocks writes for its duration`,
      );
    }
  }

  const nn = parsedSetNotNull();
  say(`  -- SET NOT NULL on an existing column -- ${nn.length ? "" : "(none in this wave)"}`);
  for (const n of nn) {
    const rows = await q(`select count(*)::int as nulls from ${n.table} where ${n.column} is null`).catch(() => [{ nulls: -1 }]);
    check(`${n.version} ${n.table}.${n.column} set not null`, rows[0].nulls === 0, `${rows[0].nulls} null row(s)`);
  }
  const val = parsedValidate();
  say(`  -- VALIDATE CONSTRAINT -- ${val.length ? "" : "(none in this wave)"}`);
  for (const v of val) note(`${v.version} validate ${v.name} on ${v.table}`, "the constraint's own expression is validated against every row");

  const wu = parsedUpdates();
  say(`  -- top-level UPDATE -- ${wu.length ? "" : "(none in this wave)"}`);
  for (const u of wu) {
    const total = await q(
      `select case when to_regclass('${u.table}') is null then -1 else (select count(*)::int from ${u.table}) end as n`,
    ).catch(() => [{ n: -1 }]);
    let hit = { n: -1 };
    if (u.where) {
      const r = await q(
        `select case when to_regclass('${u.table}') is null then -1 else (select count(*)::int from ${u.table} where ${u.where}) end as n`,
      ).catch(() => [{ n: -2 }]);
      hit = r[0];
    }
    note(
      `${u.version} update ${u.table} set ${u.set.slice(0, 60)}`,
      u.where
        ? hit.n === -2
          ? `its own predicate could not be read here (it may name a column this wave adds); the relation holds ${total[0].n} row(s), every one of which fires every row-level trigger if it matches`
          : `${hit.n} of ${total[0].n} row(s) match the file's own where clause and are rewritten, each firing every row-level trigger on the relation`
        : `NO WHERE CLAUSE: all ${total[0].n} row(s) rewritten, each firing every row-level trigger on the relation`,
    );
  }
  const dl = parsedDeletes();
  say(`  -- top-level DELETE -- ${dl.length ? "" : "(none in this wave)"}`);
  for (const d of dl) note(`${d.version} delete from ${d.table}`, d.where.slice(0, 140));

  say("  -- EXECUTE grants this wave WITHDRAWS --");
  for (const r of parsedRevokedGrants()) {
    const rows = await q(
      `select case when to_regprocedure('${r.sig.replace(/'/g, "''")}') is null then -1
                   when has_function_privilege('${r.role}', '${r.sig.replace(/'/g, "''")}', 'execute') then 1 else 0 end as held`,
    ).catch(() => [{ held: -2 }]);
    note(
      `${r.version.slice(0, 4)} revoke execute on ${r.sig} from ${r.role}`,
      rows[0].held === 1
        ? "held today, so the revoke is a real withdrawal"
        : rows[0].held === 0
          ? "NOT held today - the revoke would be a no-op; something already withdrew it"
          : "the signature does not resolve on this target",
    );
  }

  say("  -- assertions inside a prestate or tail DO block (expected values parsed from the files) --");
  for (const h of hands) {
    let rows;
    try { rows = await q(h.sql); } catch (e) { gap(h.id, `${h.guards} :: the read did not run: ${e.code || e.message}`); continue; }
    const v = h.verdict(rows[0]);
    const label = `${h.id} ${h.guards.slice(0, 170)}${h.guards.length > 170 ? "..." : ""}`;
    if (h.phase === "chained") note(`${label}  [CHAINED: an earlier pending file creates this state; read for facts, never counted]`, v.detail);
    else check(label, v.ok, v.detail);
  }
}

// ==========================================================================================
// 5b · THE BODY PINS. Every `sha256(prosrc)` pin the pending set carries, re-measured here and
//      compared to the set of values its own file admits.
//
//      A pin whose signature an EARLIER PENDING FILE produces is CHAIN-INTERNAL: its expected
//      value is a body that does not exist on the target yet, so measuring it before the window
//      would compare the pre-wave body against a post-<earlier file> expectation and invent a
//      STOP. Those print as `note CHAINED`, naming the file that produces the body.
// ==========================================================================================
async function bodyPins(q) {
  say("== (c2) sha256(prosrc) pins: does the target carry the body each file expects? ==");
  const pins = parsedBodyPins();
  if (!pins.length) {
    note("no sha256(prosrc) pin parsed out of the pending set", "if the files carry pins, this is a PARSE GAP rather than a clean wave");
    return;
  }
  const produced = parsedProducedBodies();
  const sigs = [...new Set(pins.map((p) => p.sig))];
  const measured = new Map();
  for (const sig of sigs) {
    const rows = await q(
      `select case when to_regprocedure('${sig.replace(/'/g, "''")}') is null then null
                   else (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
                           from pg_proc p where p.oid = '${sig.replace(/'/g, "''")}'::regprocedure) end as sha`,
    ).catch(() => [{ sha: undefined }]);
    measured.set(sig, rows[0]?.sha ?? null);
  }

  let okCount = 0;
  let chainedCount = 0;
  let absentChained = 0;
  const bad = [];
  for (const p of pins) {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
    const makers = (produced.get(bare) || []).filter((v) => v < p.version);
    const m = measured.get(p.sig);
    if (makers.length) {
      chainedCount++;
      if (m === null) absentChained++;
      continue;
    }
    if (m === null) {
      bad.push({ ...p, measured: "<the signature does not resolve on this target>" });
      continue;
    }
    if (p.shas.includes(m)) okCount++;
    else bad.push({ ...p, measured: m });
  }

  check(
    `every measurable body pin is at a value its own file admits (${okCount} of ${okCount + bad.length})`,
    bad.length === 0,
    `${pins.length} (file, signature) pin(s) parsed · ${okCount + bad.length} measurable before the window · ${chainedCount} CHAIN-INTERNAL (an earlier pending file produces the body)`,
  );
  for (const b of bad) {
    say(`   STOP PIN ${b.version} ${b.sig}`);
    say(`         measured: ${b.measured}`);
    say(`         admitted: ${b.shas.join(", ")}`);
    say(
      `         this is the refusal that would fire INSIDE the window. Do NOT re-pin and do NOT edit the migration: report the body name and both sides.`,
    );
  }
  note(
    `${chainedCount} pin(s) are CHAIN-INTERNAL and are not measured here`,
    `of those, ${absentChained} name a signature that does not exist on the target at all, which is exactly what a body an earlier file of this same run creates should read`,
  );
  const chainedRows = pins
    .filter((p) => (produced.get(/clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1]) || []).some((v) => v < p.version))
    .map((p) => {
      const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
      const makers = (produced.get(bare) || []).filter((v) => v < p.version);
      return `${p.version.slice(0, 4)} pins ${p.sig} to a body ${makers.map((v) => v.slice(0, 4)).join("/")} produces`;
    });
  for (const r of chainedRows) say(`     ${r}`);

  const un = unattributedDigests(pins);
  if (un.length) {
    note(
      `${un.length} 64-hex digest(s) in the pending set are NOT body pins`,
      "each is a view definition, a catalogue-row digest or a collation-independent content digest, and each is covered by a named hand check rather than by this ledger: " +
        un.map((u) => `${u.version.slice(0, 4)}:${u.sha.slice(0, 10)}`).join(", "),
    );
  }
}

// ==========================================================================================
// 5c · THE READS THIS WAVE OWES AFTER THE MIGRATE. Run by --post, beside the ledger and the
//      fingerprint, so the pre-window and post-window answers sit side by side.
// ==========================================================================================
async function postReads(q) {
  say("== (f) the reads this wave owes on hosted after the release ==");
  const rows = async (label, sql) => {
    const r = await q(sql).catch((e) => [{ err: e.code || e.message }]);
    say(`  ${label}:\n  ` + fmt(r));
  };
  await rows(
    "the standard chart after the retirement (0295)",
    `select 'my_sme_starter' as key,
            coalesce(string_agg('v'||version||'/'||state, ', ' order by version), '(none)') as rows,
            (select count(*)::int from clara.coa_template_accounts a
              join clara.coa_templates t on t.id=a.template_id
             where t.scope='platform' and t.template_key='my_sme_starter' and t.version=2) as v2_accounts,
            (select count(*)::int from clara.coa_template_entity_overrides o
              join clara.coa_templates t on t.id=o.template_id
             where t.scope='platform' and t.template_key='my_sme_starter' and t.version=2) as v2_overrides
       from clara.coa_templates where scope='platform' and template_key='my_sme_starter'`,
  );
  await rows(
    "the capability registry after two raises (0296, 0299)",
    `select count(*)::int as rows, count(distinct registry_version)::int as versions,
            max(registry_version)::int as version,
            count(*) filter (where document_kind='payroll_summary' and typed_facts='supported')::int as payroll_supported,
            count(*) filter (where document_kind='agreement_contract' and typed_facts='supported')::int as agreement_supported,
            (select count(*)::int from clara.document_capability_version_high_water) as marks
       from clara.document_capabilities`,
  );
  await rows(
    "the two new lanes on the router's roster (0296, 0299)",
    `select conname, replace(pg_get_constraintdef(oid), E'\\n', ' ') as def
       from pg_constraint where conrelid='clara.document_processing_tasks'::regclass
        and conname in ('ck_processing_task_lane_f_a1','ck_processing_task_lane_engine_f_a1_stmt')
      order by 1`,
  );
  await rows(
    "the two frozen evaluator families registered (0296, 0299)",
    `select evaluator_name, version, entrypoint_signature
       from clara.evaluator_versions
      where evaluator_name like '%payroll%' or evaluator_name like '%agreement%'
      order by 1, 2`,
  );
  await rows(
    "the accrual lane's new side column, and how every pre-existing row reads (0304)",
    `select side, count(*)::int from clara.accrual_adjustments group by 1 order by 1`,
  );
  await rows(
    "the signed-out invite preview's role pair, its door and its ACL (0309)",
    `select r.rolname, r.rolcanlogin as login,
            coalesce((select array_to_string(p.proacl, ',') from pg_proc p
                       where p.oid = 'clara.preview_invite_by_token(text,bytea)'::regprocedure), '<absent>') as door_acl
       from pg_roles r where r.rolname like 'clara_invite_preview%' order by 1`,
  );
  await rows(
    "the firm-setup catalogue after the one-cell backfill (0311)",
    `select count(*)::int as rows,
            (select t.tgenabled::text from pg_trigger t
              where t.tgrelid='clara.firm_setup_keys'::regclass and t.tgname='t_firm_setup_keys_append_only') as append_only,
            (select left(user_note, 60) from clara.firm_setup_keys where item_key='tin') as tin_note_head
       from clara.firm_setup_keys`,
  );
  await rows(
    "clara.create_client's human grant, withdrawn (0316)",
    `select has_function_privilege('clara_authenticated','clara.create_client(text,text)','execute') as human,
            has_function_privilege('public','clara.create_client(text,text)','execute') as pub`,
  );
  await rows(
    "the knowledge pair wall at its final arity (0310 then 0318)",
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='_knowledge_assert_fye_pair' order by 1`,
  );
  await rows(
    "the receipt lane vocabulary after both widenings (0297, 0299)",
    `select replace(pg_get_constraintdef(oid), E'\\n', ' ') as def from pg_constraint
      where conrelid='clara.entry_post_receipts'::regclass
        and conname='entry_post_receipts_via_wake_kind_check'`,
  );
}

// ==========================================================================================
// 6 · THE QUIESCENCE CENSUS - what a stopped machine would interrupt
// ==========================================================================================
async function census(soft) {
  say("== (d) quiescence census ==");
  say("  agent_tasks non-terminal by kind/status:\n  " + fmt(await soft(
    `select kind, status, count(*)::int from clara.agent_tasks
      where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2`)));
  say("  agent_tasks unbound (workflow_run_id null) and LIVE - the rollback preflight's second census:\n  " + fmt(await soft(
    `select kind, status, count(*)::int from clara.agent_tasks
      where workflow_run_id is null and status in ('queued','running','held','awaiting_input','stopping') group by 1,2 order by 1,2`)));
  say("  accounting_work non-terminal:\n  " + fmt(await soft(
    `select status, count(*)::int from clara.accounting_work
      where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
  say("  document_processing_tasks by lane/status (the statement_facts `running` row is the orphan known since 2026-09-19):\n  " + fmt(await soft(
    `select lane, status, count(*)::int from clara.document_processing_tasks group by 1,2 order by 1,2`)));
  say("  agent_interruptions pending:\n  " + fmt(await soft(
    `select status, count(*)::int from clara.agent_interruptions where status = 'pending' group by 1 order by 1`)));
  say("  workflow_runs by status:\n  " + fmt(await soft(
    `select status, count(*)::int from workflow.workflow_runs group by 1 order by 1`)));
  say("  workflow_runs NON-TERMINAL by name/status:\n  " + fmt(await soft(
    `select name, status, count(*)::int from workflow.workflow_runs
      where status not in ('completed','failed','cancelled') group by 1,2 order by 1,2`)));
  say("  runtime sessions:\n  " + fmt(await soft(
    `select usename, count(*)::int from pg_stat_activity where datname = current_database() and usename like 'clara_runtime%' group by 1`)));
  say("  F10 advisory holder:\n  " + fmt(await soft(
    `select a.pid, a.usename from pg_locks l join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and l.classid = 439041101 and l.objid = 794746`)));
  const locked = PENDING.length ? parsedLockedRelations() : [];
  say(`  locks held by another backend on the relations this wave locks (${locked.join(", ") || "(none parsed)"}):\n  ` + fmt(await soft(
    `select c.relname, l.mode, a.usename, count(*)::int
       from pg_locks l join pg_class c on c.oid = l.relation
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_stat_activity a on a.pid = l.pid
      where n.nspname = 'clara' and l.pid <> pg_backend_pid()
        and c.relname in (${locked.length ? locked.map((r) => `'${r}'`).join(",") : "''"})
      group by 1,2,3 order by 1,2`)));
}

async function finish(c) {
  await c.query("rollback");
  await c.end();
  if (gaps) say(`== ${gaps} PARSE GAP(s): a precondition this script could not read out of the files is an UNCHECKED precondition ==`);
  say(stops === 0 ? "== verdict: CLEAN ==" : `== verdict: ${stops} STOP(s) ==`);
  process.exit(stops === 0 ? 0 : 1);
}

await main();
