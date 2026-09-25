// Release ceremony for the riders CLOSING WAVE K (four migrations, 0362 to 0365, three database
// lanes, PLUS A VERSION CUT: chatTurn v22 -> v23 and claraWork v6 -> v7) - read-only preflight.
// Child of scripts/ops/dsn-pipe.mjs (DATABASE_URL in env) or PG* for a rig. Prints facts only,
// never the DSN, never an e-mail address, never any personal data.
//
// EVERY STATEMENT IS A SELECT INSIDE ONE `begin transaction read only`, and each one runs under
// its OWN SAVEPOINT, so a soft failure (a relation a rig does not carry) never poisons the rest.
// The transaction mode is the belt: a stray write raises 25006 rather than landing.
//
// NOTHING IN THIS FILE IS TRANSCRIBED FROM A MIGRATION. The pending list, every expected row
// count, every sha pin, every predicate and every refusal literal is PARSED out of the directory
// named by CLARA_MIGRATIONS_DIR at run time; the boot-line expectations and the manifest counts
// are PARSED out of CLARA_REPO's own packages/runtime/workflows/registry.ts and
// frozen-workflows.json. A literal this script cannot parse is reported as a PARSE GAP and counts
// as a STOP, because an unchecked precondition is unchecked.
//
// WHAT THIS WAVE IS, IN ONE SENTENCE, BECAUSE IT DECIDES EVERY MODE BELOW. It is BOTH KINDS OF
// RELEASE AT ONCE: four small migrations that create no relation, add no column, build no index,
// swap no constraint and back-fill nothing, AND a version cut that repoints two pins and adds
// fifteen unlocked manifest entries. The sweep wave (`ceremony-wS/reads-wS.mjs`) was the first
// half alone and deleted `--cut-only` because it had nothing to say; the cut phase
// (`ceremony-wC/reads-wC.mjs`) was the second half alone. This script is the union, and the four
// things it changes from `reads-wS.mjs` are each a measurement in these four files rather than a
// preference.
//
//  1. THE PIN PARSER IS REUSED WHOLE AND GAINS ONE ARM. Run unchanged over this pending set,
//     `reads-wS.mjs`'s parser reads 21 of the wave's 22 (file, signature) pins and leaves ONE
//     64-hex literal unattributed: 0362's bimodal pin of
//     `clara.withdraw_firm_standing_instruction(text,text,text)`, which HOISTS the body into a
//     local (`select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('…')`) and
//     then measures `sha256(convert_to(v_src,'UTF8'))`. Every scalar arm in the sweep's parser is
//     keyed on the literal token `prosrc` appearing INSIDE the sha256 call, so a hoisted body is
//     invisible to it. An unattributed pin is an UNCHECKED precondition wearing a clean ledger's
//     clothes, so arm (E) below binds the local to the signature the `to_regprocedure` names and
//     reads the digests compared against it. Everything else in the parser - the roster arm, the
//     column map, the flat-array arm, the disjunctive override, the refusal residue, the recipe
//     handling - is the sweep's, byte for byte.
//
//  2. THE RECIPE QUESTION IS ASKED AND ANSWERS ONE WAY. The sweep wave had seven pins measured
//     with `sha256(prosrc::bytea)` and met a real `22P02` at integration when a body gained a
//     backslash. EVERY pin in this wave uses `sha256(convert_to(prosrc,'UTF8'))`: measured, not
//     assumed - `grep -c 'prosrc::bytea'` over the four files is 0, and the parser still reports
//     the recipe per pin, so a future file that switches back is caught rather than absorbed.
//
//  3. TWO PINS MOVE, AND THAT IS THE RELEASE. `packages/runtime/workflows/registry.ts` repoints
//     `chatTurn` from `chatTurn_v22` to `chatTurn_v23` and `claraWork` from `claraWork_v6` to
//     `claraWork_v7`; the roster grows from 60 bodies to 62 and the frozen manifest from 347
//     entries to 362, of which FIFTEEN are still `deployed: false`. So step 11a's
//     `--lock-deployed` is back, and so is the whole rollback argument the cut phase wrote: the
//     previous image carries neither successor body, which makes it a lawful boot target ONLY
//     until the first non-terminal run of one of them exists. Section (v) derives the successor
//     set the way the cut derived it (a class with a predecessor, pinned at its newest, whose
//     module is still unlocked in the manifest) and MEASURES the run count on each, so the
//     runbook's step-9 snapshot has a denominator rather than a hope. `--cut-only` re-takes that
//     snapshot alone and is the cheapest way to re-read it later.
//
//  4. THIS WAVE'S ONE LOCK-SHAPED HAZARD IS A DROPPED DOOR, NOT A DDL QUEUE. There is no
//     `ALTER TABLE`, no `CREATE INDEX`, no `ADD CONSTRAINT`, no `SET NOT NULL`, no top-level
//     `UPDATE` or `DELETE`, no new relation and no new role anywhere in the four files - all
//     parsed, and the generated-read sections for those families print empty. What there IS is
//     0365's `drop function if exists clara.list_accrual_adjustments(uuid,date,date,text)`
//     followed by a `create or replace` at a SIX-argument signature. That door is granted to
//     `clara_authenticated` and reached FROM THE BROWSER through PostgREST, which no machine stop
//     quiesces, and PostgREST resolves a call by its argument names against a CACHED schema. So
//     `D-DROPPED-DOOR` reads how many overloads of the name resolve today and which ones, and
//     `D-HUMAN-DOOR-SIGNATURES` reads every door this wave hands `clara_authenticated`, because a
//     stale cache answers `PGRST202` on a signature that exists.
//
//  5. THE CAPABILITY QUESTION IS NARROWER THAN THE SWEEP'S AND IS STILL ASKED. All four files
//     take `set role clara_fn_owner` and every tail runs after `reset role`; NO file asks to
//     become `clara_authenticated` (the sweep's 0341 did, and that half is what its window read
//     for the first time). On every rig the migration runs as a SUPERUSER, which satisfies the
//     whole privilege path by bypass, so no rig run exercises it. D-ROLE-REACH reads
//     `current_user`, `rolsuper` and MEMBER/USAGE for every role a block in this wave asks to
//     become.
//
//   node reads-wK.mjs --plan --frontier-before <v>       OFFLINE. Parse the directory and print
//                                                        the pending set, the generated reads,
//                                                        the parsed pins, the parsed literals,
//                                                        the registry the boot line will print
//                                                        and the manifest's locked/unlocked
//                                                        counts. No database.
//   node reads-wK.mjs [--prod] [--baseline <f>]          PRE-WINDOW: identity, ledger, drift
//                                                        gate, pending set, estate fingerprint
//                                                        vs <f>, data preconditions, body pins,
//                                                        the version-cut census, quiescence.
//   node reads-wK.mjs --export-fingerprint <f> [--prod]  Write the estate fingerprint to <f>.
//   node reads-wK.mjs --census [--prod]                  The quiescence census AND the version-cut
//                                                        census, which is what step 6b re-reads
//                                                        with the machine stopped.
//   node reads-wK.mjs --cut-only [--prod]                Section (v) ALONE: the run census by
//                                                        body, the stranded census and the two
//                                                        successor bodies' run counts. This is
//                                                        the snapshot step 9 records and the
//                                                        cheapest way to re-take it later.
//   node reads-wK.mjs --post [--baseline <f>] [--prod]   AFTER the migrate: ledger 337+4 at 0365,
//                                                        every new row at its file checksum, the
//                                                        fingerprint vs the UPGRADED baseline,
//                                                        and the wave's own post reads by lane.
//
// Options: --state <f> (default: reads-wK.state.json beside this file) carries the pre-window
// ledger reading forward so --post can re-derive the 337 + 4 arithmetic; --frontier-before <v>
// overrides it and always wins. --no-state suppresses the write. --pins-only runs the pin
// re-measurement alone.
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
const ONLY_CUT = flag("--cut-only");
const PLAN_ONLY = flag("--plan");
const EXPORT_TO = opt("--export-fingerprint");
const BASELINE = opt("--baseline");
const STATE_FILE = opt("--state", join(HERE, "reads-wK.state.json"));
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
/**
 * The PRESTATE REGION of a file: everything above its first top-level `set role`. A migration in
 * this estate opens by measuring what it is about to edit, becomes `clara_fn_owner`, edits, resets
 * and then runs a §TAIL that asserts the post-image. The two halves ask the SAME questions of the
 * catalog and mean opposite things - the head says "what must be true before I run", the tail says
 * "what I made true" - so a preflight that reads a tail assertion as a precondition invents a STOP.
 * 0364 is the worked example: its head requires ZERO bodies deriving `:acplan`, and its tail
 * requires exactly TWO deriving `:plan`, which before the window are five.
 */
const headOf = (version) => {
  const code = codeOf(version);
  const m = /^[ \t]*set\s+role\b/im.exec(code);
  return m ? code.slice(0, m.index) : code;
};

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
    const vars = declaredSigNames(code);
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

/**
 * Declarations of the form `<name> [constant] text := '<clara signature>'`, `v_` or `c_` alike.
 *
 * WIDENED FROM THE CUT'S PARSER, and the widening is a measurement rather than a preference: 0360
 * declares BOTH its subjects as `c_verdict_sig` / `c_door_sig`, and a parser keyed on `v_` reads
 * that file as carrying no pin at all while it carries four (two bodies, each bimodal).
 *
 * An ARRAY declaration is deliberately NOT matched. `v_recut text[] := array['clara.x(...)', …]`
 * must never bind the ARRAY's name to its first element, or every later `v_recut[i]` reference
 * reads as that one signature. The `text` token must be followed immediately by `:=`.
 */
function declaredSigNames(code) {
  const out = new Map();
  for (const m of code.matchAll(
    /\b([vc]_[a-z_0-9]+)\s+(?:constant\s+)?text\s*(?::=|=)\s*'(clara\.[a-z_0-9]+\s*\([^')]*\))'/gi,
  ))
    out.set(m[1], m[2].replace(/\s+/g, ""));
  return out;
}

/** Declarations of the form `<name> [constant] text := '<64 hex>'`, on one line or two. */
function declaredShaNames(code) {
  const out = new Map();
  for (const m of code.matchAll(/\b([vc]_[a-z_0-9]+)\s+(?:constant\s+)?text\s*(?::=|=)\s*'([0-9a-f]{64})'/gi))
    out.set(m[1], m[2]);
  return out;
}

/** The balanced region opened by the bracket at `i`, inclusive of both brackets. Quote-aware. */
function balancedFrom(text, i) {
  const open = text[i];
  const close = open === "[" ? "]" : ")";
  let depth = 0;
  let q = false;
  for (let k = i; k < text.length; k++) {
    const ch = text[k];
    if (q) {
      if (ch === "'") {
        if (text[k + 1] === "'") k++;
        else q = false;
      }
      continue;
    }
    if (ch === "'") { q = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(i, k + 1);
    }
  }
  return null;
}

/** Split a bracket's inner text on TOP-LEVEL commas, quote- and bracket-aware. */
function splitTopLevel(inner) {
  const out = [];
  let depth = 0;
  let q = false;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (q) {
      cur += ch;
      if (ch === "'") {
        if (inner[i + 1] === "'") cur += inner[++i];
        else q = false;
      }
      continue;
    }
    if (ch === "'") { q = true; cur += ch; continue; }
    if (ch === "[" || ch === "(") { depth++; cur += ch; continue; }
    if (ch === "]" || ch === ")") { depth--; cur += ch; continue; }
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * THE COLUMN MAP OF A MULTI-SIGNATURE ROSTER, derived from the loop that CONSUMES it rather than
 * from a legend this parser would have to be told.
 *
 * 0353 carries the wave's one roster with two signatures per row: `[core_sig, human_sig, mode,
 * floor, pre_image_sha, derived_sha]`. Pairing "the signature, then the shas that follow it" would
 * attach BOTH shas to the human door and invent a bimodal admission the file does not make. So the
 * map is read off the file's own refusals: for every `… is distinct from <arr>[v_i][K]`, the
 * `raise` that follows names the subject, either as `<arr>[v_i][J]` or as a variable assigned from
 * one, and that gives K -> J. For 0353 this derives 5 -> 2 (the pre-image belongs to the human
 * door) and 6 -> 1 (the derived body belongs to the core), which is exactly what §0's loop does.
 */
function parsedRosterColumnMaps(code) {
  const alias = new Map();
  for (const m of code.matchAll(/\b(v_[a-z_0-9]+)\s*:=\s*(v_[a-z_0-9]+)\[\s*v_i\s*\]\[\s*(\d+)\s*\]/gi))
    alias.set(m[1], { arr: m[2], col: Number(m[3]) });
  const maps = new Map();
  // The `=` alternative must not swallow an ASSIGNMENT: `v_sig := v_jobs[v_i][1]` is how the
  // loop NAMES its subject, not how it compares one, and reading it as a comparison maps a
  // signature column onto itself.
  const re = /(?:is\s+distinct\s+from|<>|(?<![:<>!])=)\s*(v_[a-z_0-9]+)\[\s*v_i\s*\]\[\s*(\d+)\s*\]/gi;
  let m;
  while ((m = re.exec(code))) {
    const arr = m[1];
    const shaCol = Number(m[2]);
    const after = code.slice(re.lastIndex, re.lastIndex + 800);
    const r = /raise\s+exception\s+'[\s\S]{0,600}?'\s*,\s*([^,;\n]+)/i.exec(after);
    if (!r) continue;
    const first = r[1].trim();
    let sigCol = null;
    const direct = new RegExp(`^${arr}\\[\\s*v_i\\s*\\]\\[\\s*(\\d+)\\s*\\]$`, "i").exec(first);
    if (direct) sigCol = Number(direct[1]);
    else {
      const id = /^(v_[a-z_0-9]+)$/i.exec(first);
      if (id && alias.has(id[1]) && alias.get(id[1]).arr === arr) sigCol = alias.get(id[1]).col;
    }
    if (sigCol === null || sigCol === shaCol) continue;
    if (!maps.has(arr)) maps.set(arr, new Map());
    // FIRST SITE WINS. 0353 carries the same roster twice, once in §0 and once in §TAIL, and the
    // two loops ask different questions of the same columns: §0 compares column 5 against the
    // PRE-IMAGE of the human door (column 2) while §TAIL compares it against the core it has by
    // then installed (column 1). A pre-window read depends on the first reading, so a later site
    // never overwrites an earlier one.
    if (!maps.get(arr).has(shaCol)) maps.get(arr).set(shaCol, sigCol);
  }
  return maps;
}

/** The anchor literals a splicing file returns from its own `__t*_anchor()` helpers. */
function parsedSpliceAnchors() {
  const out = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    for (const m of code.matchAll(
      /create\s+function\s+(clara\.__[a-z_0-9]*anchor[a-z_0-9]*)\s*\([^)]*\)[\s\S]{0,260}?as\s+\$([a-zA-Z_0-9]+)\$\s*select\s+\$([a-zA-Z_0-9]+)\$([\s\S]*?)\$\3\$/gi,
    )) {
      const body = m[4];
      if (body && body.trim().length >= 4) out.push({ version: v, fn: m[1], anchor: body });
    }
  }
  return out;
}

/**
 * EVERY `sha256(prosrc)` PIN THE PENDING SET CARRIES, in the SIX spellings this wave uses, and the
 * RECIPE each one was measured under. Each entry is
 * `{ version, sig, shas[], recipes[], arms[] }`.
 *
 * WHAT THE CUT'S PARSER MISSED ON THIS WAVE, measured by running it over these twenty-five files
 * before this one was written: 124 pins parsed and 47 sixty-four-hex literals left unattributed,
 * among them every pin of 0344 (the wave's own four bimodal admissions), both of 0360's bimodal
 * pairs, and the five neighbour pins of 0346. Three idioms account for all of it, and the fourth
 * is this wave's own.
 *
 *   (A) THE ROSTER, in every arity. A tuple `('sig','sha')`, a pair row `['sig','sha']`, a FLAT
 *       paired array `array['sig','sha','sig','sha', …]` (0344's three arrays, which the cut's
 *       bracket-anchored matcher cannot see because the second element of each pair is followed by
 *       a comma and another SIGNATURE rather than by a closing bracket), and a row carrying more
 *       than one signature (0353), whose columns are read off the consuming loop.
 *   (B) THE SCALAR MEASUREMENT, in every recipe: `sha256(convert_to(p.prosrc,'UTF8'))`,
 *       `sha256(convert_to(prosrc,'UTF8'))` with no alias, `sha256(prosrc::bytea)` (0345, 0346),
 *       and the sub-select form where the oid sits INSIDE the hash call (0334). The signature may
 *       be a literal or a declared name (0360).
 *   (C) THE DISJUNCTIVE OVERRIDE, unchanged from the cut.
 *   (D) THE REFUSAL SUBJECT, this wave's own. 0352 recovers each pre-image through a helper
 *       (`clara.__t1136_queue_preimage()`) rather than reading `pg_proc` at the pin site, so no
 *       measurement names the body - but the refusal does, and it names exactly one. Run ONLY over
 *       the shas the first three arms did not place, so it can widen the ledger and never move a
 *       pin another arm already attributed.
 *
 * ONLY pins over a FUNCTION BODY are collected. A 64-hex literal measured over anything else is
 * reported separately under "digests this parser did not attribute", so what is covered and what
 * is not are both visible - the cut's rule, kept.
 */
function parsedBodyPins() {
  const pins = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    const sigOf = declaredSigNames(code);
    const shaOf = declaredShaNames(code);
    const colMaps = parsedRosterColumnMaps(code);
    const seen = new Map(); // sig -> { shas:Set, recipes:Set, arms:Set }

    const resolve = (tok) => {
      const t = String(tok).trim().replace(/::\s*text\s*$/i, "");
      let m = /^'(clara\.[a-z_0-9]+\s*\([^']*\))'$/i.exec(t);
      if (m) return { kind: "sig", value: m[1].replace(/\s+/g, "") };
      m = /^'([0-9a-f]{64})'$/i.exec(t);
      if (m) return { kind: "sha", value: m[1] };
      m = /^([vc]_[a-z_0-9]+)$/i.exec(t);
      if (m) {
        if (sigOf.has(m[1])) return { kind: "sig", value: sigOf.get(m[1]) };
        if (shaOf.has(m[1])) return { kind: "sha", value: shaOf.get(m[1]) };
      }
      return { kind: "other", value: t };
    };

    const record = (sig, shas, recipe, arm) => {
      const key = String(sig).replace(/\s+/g, "");
      if (!/^clara\.[a-z_0-9]+\(/i.test(key)) return;
      if (!seen.has(key)) seen.set(key, { shas: new Set(), recipes: new Set(), arms: new Set() });
      const e = seen.get(key);
      for (const s of shas) e.shas.add(s);
      e.recipes.add(recipe);
      e.arms.add(arm);
    };

    // ---- (A) THE ROSTERS ------------------------------------------------------------------
    // Only where the file measures a function body at all, so a `values` list of something else
    // never enters the ledger.
    const measuresBody = /sha256\s*\(\s*(?:convert_to\s*\(\s*)?(?:\(\s*select\s+)?(?:[a-z_0-9]+\.)?prosrc/i.test(code);
    const byteaFile = /sha256\s*\(\s*(?:[a-z_0-9]+\.)?prosrc\s*::\s*bytea/i.test(code);
    if (measuresBody) {
      const constructs = [];
      for (const m of code.matchAll(/\barray\s*\[/gi)) {
        const open = code.indexOf("[", m.index);
        const region = balancedFrom(code, open);
        if (!region) continue;
        const decl = /([vc]_[a-z_0-9]+)\s+text\s*(?:\[\s*\]\s*)+:=\s*$/i.exec(code.slice(Math.max(0, m.index - 80), m.index));
        constructs.push({ name: decl ? decl[1] : null, inner: region.slice(1, -1), nested: true });
      }
      for (const m of code.matchAll(/\bvalues\b/gi)) {
        let k = m.index + 6;
        const rows = [];
        while (k < code.length) {
          while (k < code.length && /[\s,\n]/.test(code[k])) k++;
          if (code[k] !== "(") break;
          const region = balancedFrom(code, k);
          if (!region) break;
          rows.push(region);
          k += region.length;
        }
        if (rows.length) constructs.push({ name: null, inner: rows.join(","), nested: true });
      }
      for (const c of constructs) {
        const elements = splitTopLevel(c.inner);
        const rows = elements.every((e) => /^[[(]/.test(e)) && elements.length
          ? elements.map((e) => splitTopLevel(e.slice(1, -1)))
          : [elements];
        for (const row of rows) {
          const resolved = row.map(resolve);
          const sigIdx = resolved.map((r, i) => (r.kind === "sig" ? i : -1)).filter((i) => i >= 0);
          const shaIdx = resolved.map((r, i) => (r.kind === "sha" ? i : -1)).filter((i) => i >= 0);
          if (!sigIdx.length || !shaIdx.length) continue;
          if (sigIdx.length === 1) {
            record(resolved[sigIdx[0]].value, shaIdx.map((i) => resolved[i].value), byteaFile ? "bytea" : "utf8", "roster");
            continue;
          }
          // MORE THAN ONE SIGNATURE IN ONE ROW. A FLAT roster (the row IS the whole array) pairs
          // by position: a signature opens a group and the shas after it join that group, which is
          // 0344's `array['sig','sha','sig','sha', …]`. A NESTED row uses the column map derived
          // from the loop; without one it is a PARSE GAP rather than a guess.
          const flat = rows.length === 1 && sigIdx.length * 2 <= row.length + 1;
          const map = c.name ? colMaps.get(c.name) : null;
          if (map && map.size) {
            for (const [shaCol, sigCol] of map) {
              const s = resolved[shaCol - 1];
              const g = resolved[sigCol - 1];
              if (s && g && s.kind === "sha" && g.kind === "sig")
                record(g.value, [s.value], byteaFile ? "bytea" : "utf8", "roster/colmap");
            }
          } else if (flat) {
            let cur = null;
            for (const r of resolved) {
              if (r.kind === "sig") cur = r.value;
              else if (r.kind === "sha" && cur) record(cur, [r.value], byteaFile ? "bytea" : "utf8", "roster/flat");
            }
          } else {
            gap(
              `attribute a ${row.length}-column pin roster in ${v.slice(0, 4)}`,
              `${sigIdx.length} signatures and ${shaIdx.length} digests in one row and no column map could be derived from the loop that reads ${c.name || "it"}`,
            );
          }
        }
      }
    }

    // ---- (C) THE DISJUNCTIVE OVERRIDE -----------------------------------------------------
    for (const m of code.matchAll(
      /'(clara\.[a-z_0-9]+\s*\([^')]*\))'\s*\n?\s*and\s+v_sha\s*(?:=|is not distinct from)\s*'([0-9a-f]{64})'/gi,
    ))
      record(m[1], [m[2]], "utf8", "override");

    // ---- (B) THE SCALAR MEASUREMENTS ------------------------------------------------------
    const MEAS = /sha256\s*\(\s*(?:convert_to\s*\(\s*)?(?:\(\s*select\s+)?(?:[a-z_0-9]+\.)?prosrc(\s*::\s*bytea)?/gi;
    const measured = [];
    let mm;
    while ((mm = MEAS.exec(code))) measured.push({ at: mm.index, end: MEAS.lastIndex, bytea: !!mm[1] });
    for (const me of measured) {
      const head = code.slice(me.end, me.end + 700);
      const om = /\boid\s*=\s*(?:'(clara\.[a-z_0-9]+\s*\([^')]*\))'|([vc]_[a-z_0-9]+))\s*::\s*regprocedure/i.exec(head);
      if (!om) continue;
      const sig = om[1] ? om[1].replace(/\s+/g, "") : sigOf.get(om[2]);
      if (!sig) continue;
      const from = me.end + om.index + om[0].length;
      const next = measured.find((x) => x.at > from);
      const win0 = code.slice(from, Math.min(next ? next.at : code.length, from + 900));
      const cut = win0.search(/'clara\.[a-z_0-9]+\s*\(/);
      const win = cut >= 0 ? win0.slice(0, cut) : win0;
      const shas = [...win.matchAll(/'([0-9a-f]{64})'/g)].map((x) => x[1]);
      for (const cm of win.matchAll(/\b([vc]_[a-z_0-9]+)\b/g)) if (shaOf.has(cm[1])) shas.push(shaOf.get(cm[1]));
      if (shas.length) record(sig, shas, me.bytea ? "bytea" : "utf8", "scalar");
    }

    // ---- (E) THE HOISTED BODY -------------------------------------------------------------
    // 0362's idiom, and the one shape the sweep's parser cannot see. The file lifts the body into
    // a local first (`select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('…')`)
    // and only then measures `sha256(convert_to(v_src,'UTF8'))`. Every scalar arm above keys on the
    // token `prosrc` appearing INSIDE the sha256 call, so a hoisted body leaves its digest
    // unattributed - an UNCHECKED precondition wearing a clean ledger's clothes. This arm binds the
    // local to the signature the `to_regprocedure` (or the `::regprocedure` cast) names, then reads
    // every digest compared against a measurement of that local, stopping at the next such
    // measurement so two hoisted bodies never borrow each other's shas.
    const hoisted = new Map();
    for (const m of code.matchAll(
      /\binto\s+((?:v|c)_[a-z_0-9]+)\b[\s\S]{0,260}?\bfrom\s+pg_proc\b[\s\S]{0,260}?\boid\s*=\s*(?:to_regprocedure\s*\(\s*'(clara\.[a-z_0-9]+\s*\([^')]*\))'\s*\)|'(clara\.[a-z_0-9]+\s*\([^')]*\))'\s*::\s*regprocedure)/gi,
    )) {
      const sig = (m[2] || m[3] || "").replace(/\s+/g, "");
      if (sig && !hoisted.has(m[1])) hoisted.set(m[1], sig);
    }
    if (hoisted.size) {
      const HOIST = /sha256\s*\(\s*(?:convert_to\s*\(\s*)?((?:v|c)_[a-z_0-9]+)(\s*::\s*bytea)?/gi;
      const hits = [];
      let hm;
      while ((hm = HOIST.exec(code))) if (hoisted.has(hm[1])) hits.push({ at: hm.index, end: HOIST.lastIndex, name: hm[1], bytea: !!hm[2] });
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        const stop = Math.min(i + 1 < hits.length ? hits[i + 1].at : code.length, h.end + 700);
        const win = code.slice(h.end, stop);
        const shas = [...win.matchAll(/'([0-9a-f]{64})'/g)].map((x) => x[1]);
        for (const cm of win.matchAll(/\b([vc]_[a-z_0-9]+)\b/g)) if (shaOf.has(cm[1])) shas.push(shaOf.get(cm[1]));
        if (shas.length) record(hoisted.get(h.name), shas, h.bytea ? "bytea" : "utf8", "hoisted");
      }
    }

    // ---- (D) THE REFUSAL SUBJECT, over the residue only -----------------------------------
    const placed = new Set([...seen.values()].flatMap((e) => [...e.shas]));
    for (const m of code.matchAll(
      /(?:is\s+distinct\s+from|<>)\s+((?:'[0-9a-f]{64}')|(?:[vc]_[a-z_0-9]+))\s+then\s*([\s\S]{0,800}?)using\s+errcode/gi,
    )) {
      const tok = resolve(m[1]);
      if (tok.kind !== "sha" || placed.has(tok.value)) continue;
      const sigs = [
        ...new Set([...m[2].matchAll(/\b(clara\.[a-z_0-9]+\s*\([a-z_0-9,\s.]*\))/gi)].map((x) => x[1].replace(/\s+/g, ""))),
      ];
      if (sigs.length === 1) record(sigs[0], [tok.value], "utf8", "refusal");
    }

    for (const [sig, e] of seen)
      pins.push({
        version: v,
        sig,
        shas: [...e.shas].sort(),
        recipes: [...e.recipes].sort(),
        arms: [...e.arms].sort(),
      });
  }
  return pins;
}

/** Every 64-hex literal in the pending set that `parsedBodyPins` did NOT attribute. */
/** Every `position('<literal>' in v_src)` a pending file uses to recognise its OWN post-image --
 *  the REDO arm of a recut pin, whose admitted value is a substring rather than a sha256 and so
 *  cannot live in the pin ledger. Keyed by version. */
function parsedRedoSubstrings() {
  const out = new Map();
  for (const v of PENDING) {
    const hits = [...headOf(v).matchAll(/position\(\s*'([^']{2,220})'\s+in\s+[vc]_[a-z_0-9]+\s*\)/gi)].map((m) => m[1]);
    if (hits.length) out.set(v, [...new Set(hits)]);
  }
  return out;
}

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

/** The lock-census membership rule, hoisted so parsedLockedRelations can use it before its own
 *  local `add` is declared. A relation the wave CREATES is never watched: nothing can hold a lock
 *  on a table that does not exist. */
const add0 = (set, created, t) => { if (t && !created.has(t)) set.add(String(t).replace(/^clara\./, "")); };

/**
 * The relations a quiescence census must watch: every relation an EXECUTED statement of the
 * pending set locks (alter table, create index, update, delete), minus the ones the wave itself
 * creates, plus the referenced side of every new foreign key. Parsed, not listed.
 */
function parsedInsertedRelations() {
  const out = new Set();
  for (const v of PENDING) {
    for (const m of execOf(v).matchAll(/\binsert\s+into\s+clara\.([a-z_0-9]+)/gi)) out.add(m[1]);
  }
  return [...out].sort();
}

function parsedLockedRelations() {
  const created = parsedCreatedTables();
  const set = new Set();
  for (const r of parsedInsertedRelations()) add0(set, created, r);
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

/** Every `insert into clara.wake_fn_allowlist(...) values (kind, fn), …` tuple the wave writes. */
function parsedAllowlistRows() {
  const out = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    for (const m of code.matchAll(/insert\s+into\s+clara\.wake_fn_allowlist\s*\([^)]*\)\s*values([\s\S]{0,900}?);/gi))
      for (const t of m[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_0-9]+)'\s*\)/gi))
        out.push({ version: v, kind: t[1], fn: t[2] });
  }
  return out;
}

/** Every EXECUTE or SELECT grant the wave's executed statements hand to a MACHINE-LANE role. */
function parsedMachineGrants() {
  const out = [];
  for (const v of PENDING) {
    const code = execOf(v);
    for (const m of code.matchAll(
      /grant\s+execute\s+on\s+function\s+(clara\.[a-z_0-9]+\s*\([^)]*\))\s*\n?\s*to\s+(clara_[a-z_0-9]+)/gi,
    ))
      out.push({ version: v, what: "execute", object: m[1].replace(/\s+/g, ""), role: m[2] });
    for (const m of code.matchAll(/grant\s+select\s+on\s+(clara\.[a-z_0-9]+)\s+to\s+(clara_[a-z_0-9]+)/gi))
      out.push({ version: v, what: "select", object: m[1], role: m[2] });
  }
  return out.filter((g) => g.role === "clara_agent_ro" || g.role === "clara_runtime");
}

/** The `clara.document_capabilities.registry_version` values the wave stamps, in file order. */
function parsedRegistryVersions() {
  const out = [];
  for (const v of PENDING)
    for (const m of execOf(v).matchAll(/update\s+clara\.document_capabilities\s+set\s+registry_version\s*=\s*(\d+)/gi))
      out.push({ version: v, to: Number(m[1]) });
  return out;
}

/** The append-only triggers a verb in this wave turns off and on again, with their relations. */
function parsedTriggerToggles() {
  const out = [];
  for (const v of PENDING)
    for (const m of codeOf(v).matchAll(/alter\s+table\s+(clara\.[a-z_0-9]+)\s+disable\s+trigger\s+([a-z_0-9]+)/gi))
      out.push({ version: v, table: m[1], trigger: m[2] });
  const seen = new Set();
  return out.filter((r) => (seen.has(r.trigger) ? false : (seen.add(r.trigger), true)));
}

/** The files that take `set role clara_fn_owner`, and every role a block asks to BECOME. */
function parsedRoleReach() {
  const files = PENDING.filter((v) => /^[ \t]*set\s+role\s+clara_fn_owner\s*;/im.test(codeOf(v)));
  const becomes = new Set();
  for (const v of PENDING) {
    for (const m of codeOf(v).matchAll(/set_config\s*\(\s*'role'\s*,\s*'(clara_[a-z_0-9]+)'/gi)) becomes.add(m[1]);
    for (const m of codeOf(v).matchAll(/\bset\s+(?:local\s+)?role\s+(clara_[a-z_0-9]+)/gi)) becomes.add(m[1]);
  }
  return { files, becomes: [...becomes].sort() };
}

/**
 * The backfill this wave performs, re-expressed as a COUNT. 0347 is the only file in the wave that
 * writes rows into a production relation from a SELECT over live data; its verb's body carries the
 * whole selector, and this lifts it verbatim (from the first `from` of the insert's select to the
 * statement's end) rather than retyping it.
 */
function parsedBackfills() {
  const out = [];
  for (const v of PENDING)
    for (const m of codeOf(v).matchAll(
      /insert\s+into\s+(clara\.[a-z_0-9]+)\s*\([\s\S]{0,400}?\)\s*select\s+[\s\S]{0,400}?\n(\s*from\s+clara\.[\s\S]*?);/gi,
    ))
      out.push({ version: v, table: m[1], tail: m[2].trim().replace(/\s+on\s+conflict\b[\s\S]*$/i, "") });
  return out;
}

/**
 * Every object a pending file's PRESTATE requires to be THERE already - the `to_regprocedure('X')
 * is null` / `to_regclass('X') is null` premise tests each file opens with, read out of the text
 * ABOVE its first `set role`. The signatures and relations the wave itself CREATES are
 * subtracted, because a file's own partial-birth census reads the same catalog the other way
 * round and a newborn is expected to be absent.
 */
function parsedPremiseObjects() {
  const born = new Set();
  for (const v of PENDING)
    for (const m of codeOf(v).matchAll(/create\s+(?:or\s+replace\s+)?function\s+(clara\.[a-z_0-9]+)\s*\(/gi))
      born.add(m[1]);
  for (const t of parsedCreatedTables()) born.add(`clara.${t}`);
  const out = [];
  for (const v of PENDING) {
    const head = headOf(v);
    for (const m of head.matchAll(
      /to_reg(procedure|class)\s*\(\s*'(clara\.[a-z_0-9]+(?:\s*\([^')]*\))?)'\s*\)\s*is\s+null/gi,
    )) {
      const id = m[2].replace(/\s+/g, "");
      if (born.has(id.replace(/\(.*$/, ""))) continue;
      out.push({ version: v, kind: m[1], id });
    }
  }
  const seen = new Set();
  return out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** Every EXECUTE grant the wave's executed statements hand to the HUMAN lane. These are the doors
 *  PostgREST serves, and PostgREST resolves a call by its ARGUMENT NAMES against a schema it has
 *  CACHED. A door whose signature this wave changes is therefore a cache question as well as a
 *  catalog one, which is why the human grants are parsed separately from the machine-lane ones. */
function parsedHumanGrants() {
  const out = [];
  for (const v of PENDING) {
    const code = execOf(v);
    for (const m of code.matchAll(
      /grant\s+execute\s+on\s+function\s+(clara\.[a-z_0-9]+\s*\([^)]*\))\s*\n?\s*to\s+(clara_authenticated)/gi,
    ))
      out.push({ version: v, sig: m[1].replace(/\s+/g, ""), role: m[2] });
  }
  return out;
}

/**
 * The operation-key SUFFIXES this wave's bodies derive, and the census each prestate takes of one.
 *
 * `clara._reserve_op` keys a receipt on (firm_id, fn, op_key), so a door that NESTS another door
 * hands it a DERIVED key, `p_op_key || ':<suffix>'`. Two lanes deriving the SAME suffix under the
 * same nested `fn` reserve the same row with different arguments, which is the untyped CLR10 this
 * wave's 0364 exists to remove. Both halves are parsed: the suffixes the file's own bodies derive
 * (minted), and the counts its prestate insists on before it will apply (asserted), including the
 * loop form where the suffix list is an `array[…]` indexed by the loop variable.
 */
function parsedOpKeySuffixes() {
  const minted = new Map();
  const asserted = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    for (const m of code.matchAll(/p_op_key\s*\|\|\s*'(:[a-z_]+)'/gi)) if (!minted.has(m[1])) minted.set(m[1], v);
    for (const m of headOf(v).matchAll(/prosrc\s*~\s*([\s\S]{0,420}?);[\s\S]{0,260}?if\s+v_n\s*<>\s*(\d+)/gi)) {
      const region = m[1];
      const expect = Number(m[2]);
      const arr = /array\s*\[([^\]]*)\]/i.exec(region);
      const toks = arr
        ? [...arr[1].matchAll(/'(:[a-z_]+)'/g)].map((x) => x[1])
        : [...region.matchAll(/''(:[a-z_]+)''/g)].map((x) => x[1]);
      for (const t of new Set(toks)) asserted.push({ version: v, suffix: t, expect });
    }
  }
  return { minted: [...minted].map(([suffix, version]) => ({ suffix, version })), asserted };
}

/** Every `clara.schema_migrations` row a prestate insists on, with the count it insists on. A file
 *  that continues another one's decision says so by counting its ledger row rather than by a
 *  comment, and a release can re-run exactly that read. */
function parsedLedgerPrerequisites() {
  const out = [];
  for (const v of PENDING)
    for (const m of headOf(v).matchAll(
      /from\s+clara\.schema_migrations\s*\n?\s*where\s+version\s*~\s*'([^']+)'\s*;[\s\S]{0,240}?if\s+v_n\s*<>\s*(\d+)/gi,
    ))
      out.push({ version: v, pattern: m[1], expect: Number(m[2]) });
  return out;
}

function handChecks() {
  const list = [];
  // `report` marks a check with NO verdict: a reading the operator has to make rather than a
  // predicate this script may decide. Every row of it is printed; none of them is counted.
  const push = (id, phase, guards, lit, sql, verdict, report = false) =>
    list.push({ id, phase, guards, lit, sql, verdict, report });

  // ---------------------------------------------------------------------------------------
  // THE WHOLE WAVE: what must already be there, and what must not be there yet.
  // ---------------------------------------------------------------------------------------

  // (a) THE PREMISE. Four prestates, each of which refuses outright if the cohort it extends is
  //     absent. Parsed out of each file's own `to_reg*(…) is null` premise tests.
  const premise = parsedPremiseObjects();
  if (premise.length) {
    const rows = premise
      .map((p) => `('${p.id.replace(/'/g, "''")}','${p.kind}','${p.version.slice(0, 4)}')`)
      .join(",");
    push(
      "D-WAVE-PREMISE",
      "pre",
      `${premise.length} object(s) the four prestates require to be PRESENT. ` +
        "Each file raises CLR10 by name on an absent one, before it writes anything",
      `${premise.length} present`,
      `select coalesce(string_agg(t.id || ' (' || t.v || ')', ', ' order by t.id), '(none)') as absent,
              ${premise.length} as expected
         from (values ${rows}) t(id, kind, v)
        where case when t.kind = 'class' then to_regclass(t.id) is null else to_regprocedure(t.id) is null end`,
      (r) => ({
        ok: r.absent === "(none)",
        detail:
          r.absent === "(none)"
            ? `all ${premise.length} present`
            : `ABSENT, and the file that needs it raises before anything is written: ${r.absent}`,
      }),
    );
  } else {
    gap("literal the prestates' premise objects", "no pending file carries a `to_reg*('clara.x') is null` premise test");
  }

  // (b) THE LEDGER PREREQUISITES. 0364 continues two earlier decisions and says so by counting
  //     their ledger rows rather than by a comment: 0336's namespace split and 0353's tenancy
  //     confirmation cores. Applied ahead of either it would splice bodies that do not exist in
  //     the shape it was written against, and it refuses rather than guessing.
  const prereq = parsedLedgerPrerequisites();
  if (prereq.length) {
    for (const p of prereq) {
      push(
        "D-CHAIN-PREREQUISITE",
        "pre",
        `${p.version.slice(0, 4)} refuses unless exactly ${p.expect} ledger row(s) match \`version ~ '${p.pattern}'\`. ` +
          "This is the file naming the decision it continues, in a form the target can answer",
        `${p.expect} row(s)`,
        `select count(*)::int as n, coalesce(string_agg(version, ', ' order by version), '(none)') as rows_found
           from clara.schema_migrations where version ~ '${p.pattern.replace(/'/g, "''")}'`,
        (r) => ({ ok: r.n === p.expect, detail: `${r.n} row(s): ${r.rows_found}` }),
      );
    }
  } else {
    note("no pending file names a ledger prerequisite", "none of the four counts another migration's row in its prestate");
  }

  // (c) RELATIONS. There are none, and saying so from the parse rather than from a memory is the
  //     point: `create table` appears nowhere in the four files, so the newborn-relation question
  //     this programme has asked at every prior window has no subject here.
  const created = [...parsedCreatedTables()].sort();
  if (created.length) {
    const rows = created.map((t) => `('${t}'::text)`).join(",");
    push(
      "D-WAVE-NEWBORN-RELATION",
      "pre",
      `the ${created.length} relation(s) this wave creates (${created.join(", ")}) must be ABSENT before the window`,
      "0 present",
      `select coalesce(string_agg(t.rel, ', ' order by t.rel), '(none)') as present,
              count(*) filter (where to_regclass(t.rel) is not null)::int as n
         from (values ${rows}) t(rel)
        where to_regclass(t.rel) is not null`,
      (r) => ({ ok: r.n === 0, detail: r.n === 0 ? "none exists yet, which is the first-apply branch" : `${r.n} already present: ${r.present}` }),
    );
  } else {
    note(
      "this wave CREATES NO RELATION, and that is parsed rather than claimed",
      "no `create table` appears in any of the four files, so there is no newborn relation to read and no RLS, policy, index or grant to apply to somebody else's table",
    );
  }

  // (d) THE NAMES THIS WAVE MINTS THAT NO FILE PINS. A name a pending file CREATES and ALSO pins a
  //     pre-image for is a recut, and the pin ledger measures it. A name created and never pinned
  //     is a NEW name; on a first-apply target it cannot exist, and one that does is either a
  //     half-applied lane or a collision with something else's.
  const produced = parsedProducedBodies();
  const pinnedBare = new Set(parsedBodyPins().map((p) => /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1]).filter(Boolean));
  const minted = [...produced.keys()].filter((n) => !pinnedBare.has(n) && !n.startsWith("__")).sort();
  if (minted.length) {
    const rows = minted.map((n) => `('${n}'::text)`).join(",");
    push(
      "D-WAVE-MINTED-NAMES",
      "pre",
      `${minted.length} function name(s) this wave's text creates and no file pins a pre-image for. ` +
        "One that does NOT resolve today is a new name; one that DOES is a body this wave recuts without pinning what it found",
      "a split, not a verdict",
      `select coalesce(string_agg(t.n, ', ' order by t.n), '(none)') as present, count(*)::int as n
         from (values ${rows}) t(n)
        where exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                       where ns.nspname = 'clara' and p.proname = t.n)`,
      (r) => ({
        ok: true,
        detail:
          r.n === 0
            ? `none of the ${minted.length} resolves today, so every one of them is a new name`
            : `${minted.length - r.n} are new names; ${r.n} already resolve and are therefore recut without a pinned pre-image: ${r.present}. ` +
              "Read the owning file before treating either group as the other",
      }),
    );
  } else {
    note("this wave mints no unpinned function name", "every name it creates is also pinned at a pre-image, i.e. every one is a recut");
  }

  // (e) THE REDO PROBES. Each file recognises its OWN post-image by a substring rather than by a
  //     second sha, which is how a redo (#957) is admitted while real drift still refuses by name.
  //     0362, 0363 and 0364 use an attribution tag (`#1147 [0362]` and its siblings); 0365 instead
  //     looks for features of the shape it would have installed (`p_cursor`, `next_cursor`,
  //     `accrual_cursor_malformed`), because its own redo path re-creates a dropped signature. A
  //     live body already carrying one means the REDO branch, and the operator should read that
  //     BEFORE the window rather than meet a prestate notice inside it. Report-only: which branch
  //     a file takes is a reading, not a predicate this script may decide.
  const redo = parsedRedoSubstrings();
  const markers = [...redo].flatMap(([v, arms]) => arms.map((a) => ({ version: v, marker: a })));
  if (markers.length) {
    const rows = markers.map((m) => `('${m.marker.replace(/'/g, "''")}','${m.version.slice(0, 4)}')`).join(",");
    push(
      "D-REDO-MARKERS",
      "pre",
      `${markers.length} substring probe(s) the PRESTATES use to tell a FIRST APPLY from a REDO - an attribution tag, ` +
        `or a feature of the post-image the file looks for ` +
        `(${markers.map((m) => `${m.version.slice(0, 4)}:"${m.marker.length > 24 ? m.marker.slice(0, 24) + "…" : m.marker}"`).join(", ")}). ` +
        "A body already carrying one is a REDO rather than a first apply",
      "0 bodies carry any of them (a FIRST APPLY target)",
      `select t.v as ver, t.m as marker,
              (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara' and position(t.m in p.prosrc) > 0) as bodies
         from (values ${rows}) t(m, v)
        order by 1, 2`,
      null,
      true,
    );
  }

  // ---------------------------------------------------------------------------------------
  // THE CAPABILITY QUESTION ONLY HOSTED CAN ANSWER
  // ---------------------------------------------------------------------------------------

  // (f) ALL FOUR FILES TAKE `set role clara_fn_owner`, and every tail runs after `reset role`. On
  //     every rig the migration runs as a SUPERUSER, which satisfies all of it by bypass, so no
  //     rig run has ever exercised the privilege path. The cut phase's window answered the
  //     `clara_fn_owner` half for hosted on 2026-09-25 and the sweep's answered it again on the
  //     same day together with `clara_authenticated`; it is re-read here rather than carried,
  //     because hosted was FACTORY RESET on 2026-09-26 and every role in the census was dropped
  //     and re-minted by the chain that day. A membership is an environment fact, and this one's
  //     environment changed after the last time it was read.
  const reach = parsedRoleReach();
  const wanted = reach.becomes.length ? reach.becomes : ["clara_fn_owner"];
  const roleCols = wanted
    .map(
      (r) =>
        `exists(select 1 from pg_roles where rolname = '${r}') as ${r}_exists,
         case when exists(select 1 from pg_roles where rolname = '${r}')
              then pg_has_role(current_user, '${r}', 'MEMBER') else false end as ${r}_member,
         case when exists(select 1 from pg_roles where rolname = '${r}')
              then pg_has_role(current_user, '${r}', 'USAGE') else false end as ${r}_usage`,
    )
    .join(",\n            ");
  push(
    "D-ROLE-REACH",
    "pre",
    `${reach.files.length} of the ${PENDING.length} files take \`set role clara_fn_owner\`, and every tail runs after \`reset role\`. ` +
      `The roles a block asks to BECOME across the wave: ${wanted.join(", ")}. A superuser satisfies all of them by bypass. ` +
      "THIS IS THE ONE CHECK NO RIG CAN ANSWER, because a rig migrates as a superuser",
    `superuser, or MEMBER (+USAGE where a tail relies on inheritance) of ${wanted.join(", ")}`,
    `select current_user::text as who,
            coalesce((select rolsuper from pg_roles where rolname = current_user), false) as superuser,
            ${roleCols}`,
    (r) => {
      const missing = wanted.filter((x) => r[`${x}_member`] !== true);
      return {
        ok: r.superuser === true || missing.length === 0,
        detail:
          `current_user=${r.who} superuser=${r.superuser} · ` +
          wanted
            .map((x) => `${x} exists=${r[`${x}_exists`]} MEMBER=${r[`${x}_member`]} USAGE=${r[`${x}_usage`]}`)
            .join(" · ") +
          (r.superuser === true
            ? " · a superuser bypasses every ACL, so every `set role` and every tail call is carried"
            : missing.length === 0
              ? " · not a superuser, but the memberships carry every `set role` this wave takes"
              : ` · the wave would raise 42501 on \`set role ${missing[0]}\``),
      };
    },
  );

  // ---------------------------------------------------------------------------------------
  // 0365 (#1152) - THE ONE STATEMENT IN THIS WAVE THAT TAKES A LOCK ON SOMETHING THE BROWSER USES
  // ---------------------------------------------------------------------------------------

  // (g) A DROPPED DOOR IS THIS WAVE'S WHOLE LOCK STORY. 0365 drops the four-argument
  //     `clara.list_accrual_adjustments` and re-creates it at six arguments, in one transaction.
  //     A `drop function` takes ACCESS EXCLUSIVE on that pg_proc entry, and the door is granted to
  //     `clara_authenticated` and reached FROM THE BROWSER through PostgREST, which no machine stop
  //     quiesces. Both sides are read: the signature being dropped must be PRESENT (its own
  //     prestate's FIRST branch) and every overload of the name that resolves today is listed,
  //     because two resolvable candidates for one name is the state PostgREST cannot disambiguate.
  const dropped = parsedDroppedFunctions();
  for (const d of dropped) {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(d.sig)?.[1];
    if (!bare) continue;
    const bornHere = (produced.get(bare) || []).includes(d.version);
    push(
      "D-DROPPED-DOOR",
      "pre",
      `${d.version.slice(0, 4)} drops \`${d.sig}\` and ${bornHere ? "re-creates the name at a DIFFERENT argument list in the same transaction" : "does not re-create it"}. ` +
        "A drop takes ACCESS EXCLUSIVE on the entry; the browser reaches this name through PostgREST, which no machine stop quiesces",
      "the dropped signature PRESENT, and exactly one overload of the name",
      `select coalesce(string_agg(p.oid::regprocedure::text || ' [' ||
                       coalesce(array_to_string(p.proacl, ' '), '(default)') || ']', E'\\n        '
                       order by p.pronargs), '(none)') as overloads,
              count(*)::int as n,
              (to_regprocedure('${d.sig.replace(/'/g, "''")}') is not null) as target_present
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = '${bare}'`,
      (r) => ({
        ok: r.target_present === true && r.n === 1,
        detail:
          `${r.n} overload(s) of clara.${bare} resolve today, the dropped target ${r.target_present ? "AMONG them" : "ABSENT (a REDO target, or the door is already at its post-image)"}:\n        ` +
          r.overloads,
      }),
    );
  }

  // (h) THE DOORS THIS WAVE HANDS THE HUMAN LANE, WITH THE POSTGREST QUESTION STATED. PostgREST
  //     resolves an RPC call by its ARGUMENT NAMES against a schema it caches, so a door whose
  //     argument list this wave changes is a cache question as well as a catalog one. Wave 4's
  //     runbook carried a `PGRST202` watch item for exactly this shape and the sweep wave had no
  //     analogue, because it changed no signature. This wave does.
  const human = parsedHumanGrants();
  if (human.length) {
    const rows = human.map((g) => `('${g.sig.replace(/'/g, "''")}','${g.version.slice(0, 4)}')`).join(",");
    push(
      "D-HUMAN-DOOR-SIGNATURES",
      "pre",
      `${human.length} door(s) this wave grants \`clara_authenticated\`: ${human.map((g) => `${g.version.slice(0, 4)}:${g.sig.replace(/\(.*$/, "")}`).join(", ")}. ` +
        "Each is reachable from the browser through PostgREST, which resolves by argument name against a CACHED schema",
      "each target's signature, ACL and overload count, read before the window",
      `select t.v as ver, t.sig as target,
              (to_regprocedure(t.sig) is not null) as resolves_today,
              (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara'
                  and p.proname = regexp_replace(split_part(t.sig, '(', 1), '^clara\\.', '')) as overloads_of_name
         from (values ${rows}) t(sig, v)
        order by 1, 2`,
      null,
      true,
    );
  }

  // ---------------------------------------------------------------------------------------
  // 0364 (#1150) - THE RESERVATION NAMESPACE, WHICH IS A CLAIM ABOUT EVERY BODY IN THE SCHEMA
  // ---------------------------------------------------------------------------------------

  // (i) NOTHING ALREADY OWNS THE SUFFIXES THIS FILE MINTS, AND THE LANES IT SAYS ARE ALREADY
  //     SEPARATE REALLY ARE. Both are claims about the LIVE catalog rather than about the file, and
  //     0364's own prestate raises CLR10 by name on either. The read is the same census the file
  //     takes, minus its own exclusion list, so a REDO target is recognised rather than refused:
  //     a suffix derived only by bodies this wave creates is this file's own work, already applied.
  const suf = parsedOpKeySuffixes();
  if (suf.asserted.length) {
    const own = [...produced.keys()].map((n) => `'${n}'`).join(",") || "''";
    for (const a of suf.asserted) {
      push(
        "D-OPKEY-NAMESPACE",
        "pre",
        `${a.version.slice(0, 4)} refuses unless exactly ${a.expect} live body/bodies derive \`p_op_key || '${a.suffix}'\`. ` +
          `\`clara._reserve_op\` keys a receipt on (firm_id, fn, op_key), so two lanes on one suffix under one nested fn reserve the SAME row with different arguments`,
        `${a.expect} deriving body/bodies`,
        `select count(*)::int as n,
                coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), '(none)') as bodies,
                count(*) filter (where p.proname not in (${own}))::int as outside
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'clara'
            and p.prosrc ~ ('p_op_key[[:space:]]*\\|\\|[[:space:]]*''' || '${a.suffix}' || '''')`,
        (r) => ({
          ok: r.n === a.expect || r.outside === a.expect,
          detail:
            `${r.n} body/bodies derive '${a.suffix}' (${r.outside} of them outside the set this wave writes): ${r.bodies}` +
            (r.n === a.expect
              ? ""
              : r.outside === a.expect
                ? " · the extra ones are bodies this wave itself creates, so this is a REDO target rather than drift"
                : " · the owning file raises CLR10 by name on this before it edits anything"),
        }),
      );
    }
    note(
      `the suffixes this wave's own bodies derive`,
      suf.minted.map((m) => `${m.suffix} (${m.version.slice(0, 4)})`).join(", ") || "(none)",
    );
  } else {
    note("no pending file censuses an operation-key suffix", "nothing in this wave moves a nested reservation namespace");
  }

  // ---------------------------------------------------------------------------------------
  // THE MACHINE LANE AND THE WAKE ALLOWLIST
  // ---------------------------------------------------------------------------------------

  // (j) THE WAKE ALLOWLIST ROWS. Each is written `on conflict do nothing` and each file's §TAIL
  //     then COUNTS the rows for its own names, so a row that is already there makes the insert a
  //     no-op and the tail count somebody else's row.
  const allow = parsedAllowlistRows();
  if (allow.length) {
    const rows = allow.map((a) => `('${a.kind}','${a.fn}','${a.version.slice(0, 4)}')`).join(",");
    push(
      "D-WAKE-ALLOWLIST",
      "pre",
      `${allow.length} clara.wake_fn_allowlist row(s), all \`on conflict do nothing\`: ` +
        allow.map((a) => `${a.kind}/${a.fn}`).join(", ") +
        ". A row already present makes the insert a no-op and the owning tail count a row it did not write",
      "0 of them present before the window",
      `select count(*)::int as present,
              coalesce(string_agg(w.wake_kind || '/' || w.function_name, ', ' order by w.function_name), '(none)') as already,
              (select count(*)::int from clara.wake_fn_allowlist) as allowlist_rows
         from clara.wake_fn_allowlist w
         join (values ${rows}) t(kind, fn, v) on t.kind = w.wake_kind and t.fn = w.function_name`,
      (r) => ({
        ok: r.present === 0,
        detail:
          r.present === 0
            ? `none of the ${allow.length} present; the allowlist holds ${r.allowlist_rows} row(s) and would go to ${r.allowlist_rows + allow.length}`
            : `${r.present} ALREADY PRESENT (${r.already}); the insert would be a no-op and the tail would count a row it did not write`,
      }),
    );
  } else {
    note("this wave writes no wake-allowlist row", "no pending file inserts into clara.wake_fn_allowlist");
  }

  // (k) THE MACHINE-LANE GRANTS. Every target is a name this wave mints, so none may hold the
  //     grant today. The whole `clara%` roster is printed beside it, because hosted carries more
  //     roles than a rig and the interesting direction is an unexpected ROLE rather than a count -
  //     and because hosted's roster was dropped and re-minted by the chain at the 2026-09-26
  //     factory reset, so it is a fresh reading rather than a carried one.
  const grants = parsedMachineGrants();
  if (grants.length) {
    const rows = grants
      .map((g) => `('${g.object.replace(/'/g, "''")}','${g.what}','${g.role}','${g.version.slice(0, 4)}')`)
      .join(",");
    push(
      "D-MACHINE-LANE-GRANTS",
      "pre",
      `${grants.filter((g) => g.what === "execute").length} EXECUTE grant(s) and ${grants.filter((g) => g.what === "select").length} SELECT grant(s) ` +
        `this wave hands the machine lane (${[...new Set(grants.map((g) => g.role))].join(", ")}). Every target is a name this wave mints, so none may hold the grant today`,
      "0 already held",
      `with t(obj, what, role, v) as (values ${rows})
       select count(*) filter (where t.what = 'execute' and to_regprocedure(t.obj) is not null
                                 and has_function_privilege(t.role, t.obj, 'execute'))::int
            + count(*) filter (where t.what = 'select' and to_regclass(t.obj) is not null
                                 and has_table_privilege(t.role, t.obj, 'select'))::int as already,
              (select count(*)::int from pg_roles where rolname like 'clara%') as clara_roles,
              (select string_agg(rolname, ' ' order by rolname) from pg_roles where rolname like 'clara%') as roster
         from t`,
      (r) => ({
        ok: r.already === 0,
        detail: `${r.already} of the ${grants.length} target(s) already hold the grant they are about to receive · ${r.clara_roles} clara% role(s): ${r.roster}`,
      }),
    );
  } else {
    note("this wave hands the machine lane nothing", "no EXECUTE or SELECT grant to clara_agent_ro or clara_runtime in any executed statement");
  }

  // ---------------------------------------------------------------------------------------
  // THE FAMILIES EVERY PRIOR WAVE HAD AND THIS ONE DOES NOT. Each is read off the parse rather
  // than remembered, so a future re-derivation of this file against a different pending set grows
  // the checks back by itself instead of silently omitting them.
  // ---------------------------------------------------------------------------------------
  const swaps = parsedCheckConstraints().filter((c) => !parsedCreatedTables().has(c.table));
  if (swaps.length) {
    for (const c of swaps) {
      CHECK_DEFERRALS.set(c.name, "D-CHECK-SWAP");
      push(
        "D-CHECK-SWAP",
        "pre",
        `${c.version.slice(0, 4)} drops and re-adds ${c.name} on ${c.table} as \`check (${c.expr})\``,
        "0 rows outside the new predicate",
        `select (select pg_get_constraintdef(oid) from pg_constraint
                  where conrelid = '${c.table}'::regclass and conname = '${c.name}') as today,
                (select count(*)::int from ${c.table} where not (${c.expr})) as violating,
                (select count(*)::int from ${c.table}) as rows_total`,
        (r) => ({
          ok: r.violating === 0 && r.today !== null,
          detail: `today: ${r.today ?? "ABSENT"} · ${r.rows_total} row(s), ${r.violating} outside the new predicate`,
        }),
      );
    }
  } else {
    note("this wave swaps no CHECK constraint", "no `add constraint … check` on an existing relation, so nothing takes ACCESS EXCLUSIVE on a table");
  }
  if (parsedRegistryVersions().length === 0)
    note("this wave stamps no capability registry version", "no pending file updates clara.document_capabilities.registry_version");
  if (parsedBackfills().length === 0)
    note("this wave back-fills nothing", "no pending file carries an `insert into clara.x(…) select … from clara.…` over live rows");
  if (parsedIndexes().length === 0)
    note("this wave builds no index", "no `create [unique] index` in any executed statement, so no relation is write-blocked for a build");
  if (parsedCreatedRoles().length === 0)
    note("this wave mints no cluster role", "0154 pins the cluster-wide clara% role count and this wave does not move it");
  if (parsedTriggerToggles().length === 0)
    note("this wave disables no trigger", "no `alter table … disable trigger` in any executed statement");
  const anchors = parsedSpliceAnchors();
  if (anchors.length === 0)
    note("this wave splices no body", "no substitution anchor helper in any file: every body it changes is written whole");

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
    // CUT-PHASE CHANGE 5: the "this file NAMES the object" map is built from execOf, not
    // codeOf. 0320 carries ~720 lines of #660's accounting body verbatim into a new core, and
    // that body names clara.journal_lines, clara.journal_entries, clara.cash_account_set_members
    // and a dozen more relations this cut does not touch. Under the whole-text rule real drift
    // on any of them printed as TOLERATED. execOf blanks create-function BODIES and keeps DO
    // blocks, which is exactly what the data-precondition generator already reads, so an object
    // named only inside a carried body no longer tolerates drift on itself. The PARSED PIN
    // LEDGER above is still the primary source of "which objects are PINNED"; this narrows only
    // the weaker half.
    for (const x of execOf(v).matchAll(/\b([a-z_][a-z_0-9]{3,})\b/g)) add(names, x[1], v);
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

  const reg = parsedRegistry();
  say("== the workflow registry, read out of CLARA_REPO's own registry.ts (this wave REPOINTS two of its pins) ==");
  if (!reg) {
    say(`  (registry.ts did not parse at ${REPO}/packages/runtime/workflows/registry.ts -- point CLARA_REPO at the release tree)`);
  } else {
    const pinned = Object.entries(reg.pins);
    say(`  bodies exported : ${reg.bodies.length}`);
    say(`  classes pinned  : ${pinned.length}`);
    say("  the boot line this image prints:");
    say(`     bodies=${reg.bodies.length} pins ${pinned.map(([k, v]) => `${k}=${v}`).join(" ")}`);
    const classOf = (id) => { const m = /^(.*?)_?[vV](\d+)$/.exec(id); return m ? m[1] : id; };
    const byClass = new Map();
    for (const b of reg.bodies) { const c = classOf(b); if (!byClass.has(c)) byClass.set(c, []); byClass.get(c).push(b); }
    const succ = pinned.filter(([cls, body]) => (byClass.get(cls) || []).length > 1 && (byClass.get(cls) || []).at(-1) === body);
    const unlocked = parsedUnlockedBodies();
    if (!unlocked) {
      say(`  (frozen-workflows.json did not parse at ${REPO} -- the successor set cannot be derived offline)`);
    } else {
      say(`  frozen manifest  : ${unlocked.total} entries, ${unlocked.unlockedPaths.length} UNLOCKED (deployed:false)`);
      say(`  step 11a will lock those ${unlocked.unlockedPaths.length} paths, covering bodies ${unlocked.bodies.join(", ") || "(none)"}`);
      const successors = succ.map(([, b]) => b).filter((b) => unlocked.bodies.includes(b));
      const served = succ.map(([, b]) => b).filter((b) => !unlocked.bodies.includes(b));
      say(`  SUCCESSOR BODIES this release introduces (a class with a predecessor, whose module no deployed image serves yet): ${successors.join(", ") || "(none)"}`);
      say(`  pinned at their newest but already deploy-locked, so a rollback does not strand them: ${served.join(", ") || "(none)"}`);
    }
  }

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
    "             (this wave's pins are sha256(prosrc) over FUNCTION BODIES, which no collation reaches, and EVERY one of them uses " +
      "convert_to(...,'UTF8') rather than the prosrc::bytea recipe the sweep wave met a 22P02 on - measured, not assumed, and still reported per pin)"
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
    await bodyCensus(soft);
    await census(soft);
    await finish(c);
    return;
  }

  if (ONLY_CUT) {
    await bodyCensus(soft);
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

    // ---- (v) the version-cut reads ---------------------------------------------------------
    await bodyCensus(soft);

    // ---- (d) quiescence census ------------------------------------------------------------
    await census(soft);
  } else {
    // ---- (e) post ------------------------------------------------------------------------
    say("== (e) post-migrate ==");
    if (!frontierBefore) {
      note("neither --frontier-before nor a state file: the <before> + N ledger arithmetic could not be re-derived");
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
    await bodyCensus(soft);
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
    // A REPORT-ONLY check has no verdict by design: it is a reading the operator has to make,
    // not a predicate the script can decide, and inventing a pass/fail for it would be worse
    // than printing the rows. Every row is printed, never only the first.
    if (h.report) { say(`  note ${h.id} ${h.guards}:\n  ` + fmt(rows)); continue; }
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
    const s = sig.replace(/'/g, "''");
    // BOTH RECIPES, and the reason is this wave's own. The estate hashes a body two ways:
    // `sha256(convert_to(prosrc,'UTF8'))` and `sha256(prosrc::bytea)`. They agree on every body
    // that carries no backslash and DIFFER on one that does, because the bytea input function
    // reads a backslash as the start of an escape - which is how the integration merge found
    // 0352 aborting with `invalid input syntax for type bytea` on a body lane L4 had given a
    // backslash at character 22284 (`waveS-merge.md` §14.2 finding 3). Two files in this wave
    // still pin under the bytea recipe, so the position of the first backslash is read here.
    const rows = await q(
      `select case when to_regprocedure('${s}') is null then null
                   else (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
                           from pg_proc p where p.oid = '${s}'::regprocedure) end as sha_utf8,
              case when to_regprocedure('${s}') is null then null
                   else (select case when position(chr(92) in p.prosrc) > 0 then null
                                     else encode(sha256(p.prosrc::bytea),'hex') end
                           from pg_proc p where p.oid = '${s}'::regprocedure) end as sha_bytea,
              case when to_regprocedure('${s}') is null then null
                   else (select position(chr(92) in p.prosrc)::int
                           from pg_proc p where p.oid = '${s}'::regprocedure) end as backslash_at`,
    ).catch(() => [{ sha_utf8: undefined, sha_bytea: undefined, backslash_at: undefined }]);
    measured.set(sig, rows[0] ?? {});
  }

  let okCount = 0;
  let chainedCount = 0;
  let newbornCount = 0;
  const bad = [];
  const recipeRisk = [];
  for (const p of pins) {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
    const makers = (produced.get(bare) || []).filter((v) => v < p.version);
    const m = measured.get(p.sig) || {};
    const bytea = p.recipes.includes("bytea");
    if (makers.length) {
      chainedCount++;
      continue;
    }
    if (m.sha_utf8 === null || m.sha_utf8 === undefined) {
      // A SIGNATURE THIS WAVE ITSELF CREATES AND HAS NOT CREATED YET IS NOT DRIFT. 0353 pins the
      // DERIVED shape of each core it embeds; a core is born by the file that pins it, so before
      // the window the signature does not resolve and that is the reading a first apply must give.
      if ((produced.get(bare) || []).includes(p.version)) {
        newbornCount++;
        continue;
      }
      bad.push({ ...p, measured: "<the signature does not resolve on this target>" });
      continue;
    }
    if (bytea && m.backslash_at > 0) {
      recipeRisk.push({ ...p, at: m.backslash_at });
      bad.push({ ...p, measured: `<carries a backslash at character ${m.backslash_at}, and this file hashes it with sha256(prosrc::bytea)>` });
      continue;
    }
    const value = bytea ? m.sha_bytea : m.sha_utf8;
    if (p.shas.includes(value)) okCount++;
    else bad.push({ ...p, measured: `${value}${bytea ? " (bytea recipe)" : ""}` });
  }

  check(
    `every measurable body pin is at a value its own file admits (${okCount} of ${okCount + bad.length})`,
    bad.length === 0,
    `${pins.length} (file, signature) pin(s) parsed · ${okCount + bad.length} measurable before the window · ` +
      `${chainedCount} CHAIN-INTERNAL (an earlier pending file produces the body) · ${newbornCount} NEWBORN (the pinning file creates the signature itself)`,
  );
  const redo = parsedRedoSubstrings();
  for (const b of bad) {
    say(`   STOP PIN ${b.version} ${b.sig}   [${b.arms.join("+")}, recipe ${b.recipes.join("+")}]`);
    say(`         measured: ${b.measured}`);
    say(`         admitted: ${b.shas.join(", ")}`);
    const bare = /clara\.([a-z_0-9]+)\(/.exec(b.sig)?.[1];
    const recutByItself = (produced.get(bare) || []).includes(b.version);
    const arms = redo.get(b.version) || [];
    if (recutByItself && arms.length) {
      say(
        `         …and this file RECUTS this signature, so it admits a second value its ledger cannot hold: a body carrying ` +
          arms.map((a) => `"${a.length > 90 ? a.slice(0, 90) + "…" : a}"`).join(" or ") +
          ` (its REDO arm). On a FIRST APPLY target that arm is not taken, so read the live body before calling this drift.`,
      );
    }
    say(`         this is the refusal that would fire INSIDE the window. Do NOT re-pin and do NOT edit the migration: report the body name and both sides.`);
  }
  for (const r of recipeRisk) {
    say(
      `   RECIPE  ${r.version.slice(0, 4)} hashes ${r.sig} with sha256(prosrc::bytea), and the live body carries a backslash at character ${r.at}.`,
    );
    say(
      `           That cast runs bytea's own INPUT function, which reads a backslash as an escape, so the file would abort with 22P02 ` +
        `\`invalid input syntax for type bytea\` before it edited anything. This is the class the integration merge fixed in 0352 (waveS-merge.md §14.2, finding 3).`,
    );
  }

  const byRecipe = pins.filter((p) => p.recipes.includes("bytea"));
  if (byRecipe.length) {
    note(
      `${byRecipe.length} pin(s) are measured under the sha256(prosrc::bytea) recipe rather than convert_to(...,'UTF8')`,
      `${[...new Set(byRecipe.map((p) => p.version.slice(0, 4)))].join(", ")} - the two agree on a backslash-free body and differ on any other, so each is re-measured here the way its OWN file measures it`,
    );
  }
  const byArm = new Map();
  for (const p of pins) for (const a of p.arms) byArm.set(a, (byArm.get(a) ?? 0) + 1);
  note(
    "how each pin was attributed to its body",
    [...byArm].sort().map(([a, n]) => `${a}=${n}`).join(", "),
  );
  const bimodal = pins.filter((p) => p.shas.length > 1);
  note(
    `${bimodal.length} pin(s) admit MORE THAN ONE value, which is this wave's own integration record`,
    bimodal.length
      ? bimodal.map((p) => `${p.version.slice(0, 4)}:${p.sig.replace(/\(.*$/, "")}(${p.shas.length})`).join(", ") +
        " - each second shape is a body another lane of this same wave, or the released cut phase, moved; a body at NEITHER shape still refuses by name"
      : "(none)",
  );
  if (chainedCount) {
    const chainedRows = pins
      .filter((p) => (produced.get(/clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1]) || []).some((v) => v < p.version))
      .map((p) => {
        const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
        const makers = (produced.get(bare) || []).filter((v) => v < p.version);
        return `${p.version.slice(0, 4)} pins ${p.sig} to a body ${makers.map((v) => v.slice(0, 4)).join("/")} produces`;
      });
    note(
      `${chainedCount} pin(s) are CHAIN-INTERNAL and are not measured here`,
      "this wave's lanes recut each other on purpose, which is what the integration merge's eleven recuts were for; a chain-internal pin can only be measured after the file that produces its body has applied",
    );
    for (const r of chainedRows) say(`     ${r}`);
  }

  const un = unattributedDigests(pins);
  if (un.length) {
    note(
      `${un.length} 64-hex digest(s) in the pending set are NOT attributed to a body pin`,
      "each is a view definition, a catalogue-row digest, a DERIVED body a file embeds rather than finds, or a collation-independent content digest, and each is covered by a named hand check rather than by this ledger: " +
        un.map((u) => `${u.version.slice(0, 4)}:${u.sha.slice(0, 10)}`).join(", "),
    );
  }
}

// ==========================================================================================
// 5c-bis · THE REGISTRY THE IMAGE WILL PRINT. Parsed out of CLARA_REPO's own
//          packages/runtime/workflows/registry.ts, never written down here, so the boot-line
//          expectation this script prints is the RELEASE_SHA tree's own answer and moves when
//          the tree does. `workflowPins` and `workflowBodies` are frozen literals of string
//          literals by construction (freeze-lint's REGISTRY-VIEW-INTEGRITY check enforces that
//          shape structurally), which is exactly why they can be read with a regex.
// ==========================================================================================
/**
 * The bodies whose module file is still UNLOCKED in the frozen manifest -- `deployed: false`, the
 * estate's own record that `--lock-deployed` has not been run for them. Read from CLARA_REPO's
 * frozen-workflows.json, never listed here.
 *
 * IT OVER-REPORTS BY DESIGN AND THE OVER-REPORT IS ITSELF WORTH SEEING. Wave 4's ten
 * `payrollFacts.v1.*` / `agreementFacts.v1.*` entries are SERVED on hosted and were never locked
 * (its § RESULTS records `--lock-deployed` as having "nothing further to do", which was not right),
 * so they are unlocked here too. Step 11a of this cut's runbook locks all of them, which is correct
 * at that point. What makes the rollback set exact is the INTERSECTION with "the class carries a
 * predecessor": payrollFacts_v1 and agreementFacts_v1 have none, so they drop out.
 */
function parsedUnlockedBodies() {
  const path = `${REPO}/frozen-workflows.json`;
  if (!existsSync(path)) return null;
  let m;
  try { m = JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
  const entries = Object.entries(m.workflows ?? {});
  const unlocked = entries.filter(([, e]) => e?.deployed !== true).map(([p]) => p);
  const bodies = new Set();
  for (const p of unlocked) {
    const s = /^packages\/runtime\/workflows\/([A-Za-z_0-9]+)\.v(\d+)(?:\.[A-Za-z_0-9]+)*\.(?:ts|mjs)$/.exec(p);
    if (s) bodies.add(`${s[1]}_v${s[2]}`);
  }
  return { total: entries.length, unlockedPaths: unlocked, bodies: [...bodies].sort() };
}

function parsedRegistry() {
  const path = `${REPO}/packages/runtime/workflows/registry.ts`;
  if (!existsSync(path)) return null;
  const src = readFileSync(path, "utf8");
  const pinBlock = /export const workflowPins[^{]*\{([\s\S]*?)\n\}\);/.exec(src);
  const bodyBlock = /export const workflowBodies[^[]*\[([\s\S]*?)\n\]\);/.exec(src);
  if (!pinBlock || !bodyBlock) return null;
  const pins = {};
  for (const m of pinBlock[1].matchAll(/^\s*([A-Za-z_][A-Za-z_0-9]*)\s*:\s*"([^"]+)"\s*,/gm)) pins[m[1]] = m[2];
  const bodies = [...bodyBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { pins, bodies };
}

/** The runtime's own derivation: the body identifier is whatever follows the LAST `//` in a
 *  workflow run's name (`lib/rollback-preflight.mjs`'s `bodyIdentifierOf`). Mirrored, not
 *  imported, because this script must run from a checkout the runtime is not built in. */
const TERMINAL_RUN_STATUSES = ["completed", "failed", "cancelled"];

// ==========================================================================================
// 5d · THE VERSION-CUT READS. What a cut that REPOINTS a pin owes, and what a wave that only
//      adds doors does not. Run in the pre-window pass, in --census, in --cut-only and again in
//      --post, so the two sides of the window sit beside each other.
//
//      The sweep wave repointed nothing and its own copy of this section existed to MEASURE that
//      the successor set was empty. This wave repoints two pins - chatTurn v22 to v23 and
//      claraWork v6 to v7 - so the section is back in the shape the cut phase gave it: the
//      successor set is derived (a class with a predecessor, pinned at its newest, whose module
//      is still unlocked in the manifest), the run count on each is MEASURED, and the rollback
//      note carries a timestamp because the answer degrades the moment the new image serves.
// ==========================================================================================
async function bodyCensus(soft) {
  say("== (v) the version-cut reads: which bodies live runs are on, and what that makes lawful ==");
  const reg = parsedRegistry();
  if (!reg) {
    gap("the RELEASE_SHA registry", `${REPO}/packages/runtime/workflows/registry.ts did not parse: point CLARA_REPO at the release tree`);
    return;
  }
  const bodies = reg.bodies;
  const pinned = Object.entries(reg.pins);
  say(`  the tree at CLARA_REPO exports ${bodies.length} bodies across ${pinned.length} pinned classes`);
  say(`  the boot line this image will print, derived from that file rather than written here:`);
  say(`     bodies=${bodies.length} pins ${pinned.map(([k, v]) => `${k}=${v}`).join(" ")}`);

  // WHICH CLASSES ARE PINNED AT A BODY THAT HAS A PREDECESSOR. That alone does not make a repoint:
  // half the roster has been pinned at its newest for waves. What makes a body a SUCCESSOR of THIS
  // release is the intersection with "its module is still unlocked in the frozen manifest", because
  // `--lock-deployed` is run only after an image carrying it is live. So the two are derived
  // separately and printed separately, and the operator reads the runbook's own table beside them.
  const classOf = (id) => {
    const m = /^(.*?)_?[vV](\d+)$/.exec(id);
    return m ? m[1] : id;
  };
  const byClass = new Map();
  for (const b of bodies) {
    const c = classOf(b);
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c).push(b);
  }
  const withPredecessor = pinned
    .filter(([cls, body]) => (byClass.get(cls) || []).length > 1 && (byClass.get(cls) || []).at(-1) === body)
    .map(([, body]) => body);
  const unlocked = parsedUnlockedBodies();
  if (!unlocked) {
    gap("the RELEASE_SHA frozen manifest", `${REPO}/frozen-workflows.json did not parse: point CLARA_REPO at the release tree`);
    return;
  }
  say(
    `  frozen manifest: ${unlocked.total} entries, ${unlocked.unlockedPaths.length} still UNLOCKED (deployed:false)${
      unlocked.bodies.length ? ` covering bodies ${unlocked.bodies.join(", ")}` : ""
    }`,
  );
  say("  (step 11a's --lock-deployed locks every one of those paths, this cut's and any earlier wave's that was never locked)");
  const successors = withPredecessor.filter((b) => unlocked.bodies.includes(b));
  const alreadyServed = withPredecessor.filter((b) => !successors.includes(b));
  check(
    "THIS RELEASE IS A VERSION CUT: the manifest carries entries no deployed image serves yet, so step 11a's --lock-deployed has work to do AFTER the image is live",
    unlocked.unlockedPaths.length > 0,
    unlocked.unlockedPaths.length > 0
      ? `${unlocked.unlockedPaths.length} unlocked entr(ies) of ${unlocked.total}, covering ${unlocked.bodies.join(", ")}. ` +
        "Locking BEFORE the deploy would freeze a body no parked run can yet exist for (packages/runtime/README.md), so this reading is expected here and must read 0 after step 11a"
      : `all ${unlocked.total} entries are already deployed:true - this is NOT the version cut the runbook describes, and nothing would be locked`,
  );
  check(
    "the SUCCESSOR BODIES this release introduces are exactly the classes whose module is still unlocked",
    successors.length > 0,
    successors.length > 0
      ? `${successors.join(", ")} - each is a class pinned at its newest body whose module no deployed image serves. ` +
        `The classes pinned at their newest but ALREADY deploy-locked (${alreadyServed.join(", ") || "none"}) are served by the previous image too, so a rollback does not strand them`
      : "no class carries a predecessor whose module is unlocked, so this tree introduces no successor body",
  );

  // (v1) EVERY NON-TERMINAL RUN, BY BODY. The runtime's own census, asked the runtime's own way.
  const runs = await soft(
    `select name, count(*)::int as n, min(created_at)::text as oldest
       from workflow.workflow_runs
      where status::text <> all(array['${TERMINAL_RUN_STATUSES.join("','")}'])
      group by name order by name`,
  );
  const censusErr = !Array.isArray(runs) || (runs.length === 1 && runs[0] && runs[0].err);
  if (censusErr) {
    check(
      "workflow.workflow_runs is readable, which is the whole subject of a version cut's preflight",
      false,
      `the run census answered ${(runs && runs[0] && runs[0].err) || "nothing"} - on a rig that means no WDK World is bootstrapped on this database, and on hosted it means the read failed. ` +
        "Either way the stranded-body census below cannot be computed, and a census that cannot be computed must never report zero",
    );
  }
  const rows = (runs || []).filter((r) => !r.err);
  const bodyOf = (name) => {
    const at = String(name).lastIndexOf("//");
    return at < 0 ? String(name) : String(name).slice(at + 2);
  };
  const perBody = new Map();
  for (const r of rows) {
    const b = bodyOf(r.name);
    perBody.set(b, (perBody.get(b) ?? 0) + Number(r.n));
  }
  say("  non-terminal workflow_runs by BODY (status not in completed/failed/cancelled):");
  if (!perBody.size) say("     (none)");
  for (const [b, n] of [...perBody].sort()) say(`     ${b.padEnd(28)} ${String(n).padStart(5)}`);

  // (v2) THE STRANDED-BODY CENSUS THE ENGINE ITSELF COMPUTES AT BOOT, run here against the bodies
  //      the RELEASE_SHA registry exports. A run parked on a SUPERSEDED body is not stranded:
  //      policy (c) (docs/ARCHITECTURE.md:428-429) keeps every superseded body exported, and this
  //      image carries all sixty-two. A non-zero reading means `getWorld().start()` refuses
  //      DATABASE-WIDE and the crash-only supervisor exits 1, which under Fly is a restart loop
  //      rather than a park (packages/runtime/README.md:569-614, :930-935).
  const stranded = [...perBody].filter(([b]) => !bodies.includes(b));
  check(
    "the incoming image carries every body a live run is parked on (the boot census, computed here)",
    !censusErr && stranded.length === 0,
    censusErr
      ? "NOT COMPUTED: the run census was unreadable, so this cannot be answered either way"
      : stranded.length === 0
        ? `${perBody.size} distinct body/bodies carry non-terminal runs, every one of them exported by this tree`
        : `STRANDED: ${stranded.map(([b, n]) => `${b} (${n} run(s))`).join(", ")} - the world would refuse to start`,
  );

  // (v3) THE SUCCESSOR BODIES CANNOT HAVE A RUN YET. Before the window they do not exist in any
  //      served image, so a non-zero reading is not a warning: it is proof this is not a preflight.
  const early = successors.filter((b) => (perBody.get(b) ?? 0) > 0);
  if (!POST) {
    check(
      "no run exists yet on a body this cut introduces",
      !censusErr && early.length === 0,
      censusErr
        ? "NOT COMPUTED: the run census was unreadable"
        : early.length === 0
          ? `${successors.length} successor body/bodies (${successors.join(", ") || "none"}) carry 0 non-terminal runs, which is what a pre-window reading must say`
          : `${early.map((b) => `${b}=${perBody.get(b)}`).join(", ")} already carry runs: the new image is already serving and this is a POST reading`,
    );
  } else {
    note(
      "runs on the bodies this cut introduces",
      successors.map((b) => `${b}=${perBody.get(b) ?? 0}`).join(", ") || "(no successor body derived)",
    );
  }

  // (v4) THE ROLLBACK DIRECTION, STATED RATHER THAN IMPLIED, AND IT DEGRADES. The previous image
  //      does not carry the successor bodies. It is therefore a lawful boot target ONLY until the
  //      first non-terminal run of one of them exists, which is why the runbook's step 9 runs
  //      immediately after step 7 and records a TIMESTAMP rather than a guarantee. The sweep wave
  //      moved no pin and its snapshot did not expire; this one does, exactly as the cut phase's
  //      did. This line is that snapshot's denominator.
  note(
    "rollback direction (the previous image carries none of the successor bodies)",
    censusErr
      ? "NOT COMPUTED: the run census was unreadable, so no rollback snapshot can be taken from this reading"
      : `a rollback to the previous image is lawful only while ${successors.join(" / ") || "(none)"} carry ZERO non-terminal runs; they carry ` +
        `${successors.map((b) => `${b}=${perBody.get(b) ?? 0}`).join(", ") || "n/a"} as of ${new Date().toISOString()}. ` +
        "The DATABASE is the part that does not roll back either way: nothing in this wave drafts a below-frontier rollback, and the only route is the step-3f dump",
  );

  // (v5) THE PARKED HALF, IN THE ESTATE'S OWN TABLES. A run is only half the picture: the
  //      reconciler's unbound LIVE tasks are the second census the rollback preflight reads, and a
  //      Work awaiting an answer is what a cutover most often interrupts.
  say(
    "  accounting_work non-terminal, by status (what a cutover interrupts):\n  " +
      fmt(
        await soft(
          `select status, count(*)::int from clara.accounting_work
            where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`,
        ),
      ),
  );
  say(
    "  agent_interruptions pending (an open Work question is answered on the body that opened it):\n  " +
      fmt(await soft(`select status, count(*)::int from clara.agent_interruptions where status = 'pending' group by 1 order by 1`)),
  );
}

// ==========================================================================================
// 5c · THE READS THIS WAVE OWES AFTER THE MIGRATE. Run by --post, beside the ledger and the
//      fingerprint, so the pre-window and post-window answers sit side by side. Organised by LANE,
//      because what shipped is three database lanes and a version cut; every roster that can be
//      parsed out of the files is parsed, and the family-specific questions are the ones each
//      lane's own §TAIL asks of itself. The cut's own evidence is section (v)'s and the boot
//      line's, because a version cut applies no migration and the catalog has nothing to say
//      about it.
// ==========================================================================================
async function postReads(q) {
  say("== (f) the reads this wave owes on hosted after the release ==");
  const rows = async (label, sql) => {
    const r = await q(sql).catch((e) => [{ err: e.code || e.message }]);
    say(`  ${label}:\n  ` + fmt(r));
  };

  // ---- THE PARSED ROSTERS, re-read on the far side of the window ------------------------
  const allow = parsedAllowlistRows();
  if (allow.length) {
    await rows(
      `the ${allow.length} wake-allowlist row(s) this wave writes, and the allowlist's own total`,
      `select w.wake_kind, w.function_name,
              (select count(*)::int from clara.wake_fn_allowlist) as allowlist_rows
         from clara.wake_fn_allowlist w
        where w.function_name in (${[...new Set(allow.map((a) => `'${a.fn}'`))].join(",")})
        order by 1, 2`,
    );
  }

  const grants = parsedMachineGrants();
  if (grants.length) {
    const fns = grants.filter((g) => g.what === "execute");
    if (fns.length)
      await rows(
        `the ${fns.length} machine-lane EXECUTE grant(s) this wave hands out, with the FULL ACL of each target ` +
          "(a model-lane twin must carry its own role and nothing beyond it)",
        `select p.oid::regprocedure::text as sig, p.prosecdef as secdef, p.provolatile as vol,
                pg_get_userbyid(p.proowner) as owner,
                coalesce(array_to_string(p.proconfig, ' '), '') as cfg,
                coalesce(array_to_string(p.proacl, ' '), '(default)') as acl
           from pg_proc p
          where p.oid in (${fns.map((g) => `'${g.object.replace(/'/g, "''")}'::regprocedure`).join(",\n                          ")})
          order by 1`,
      );
  }

  const human = parsedHumanGrants();
  if (human.length)
    await rows(
      `the ${human.length} HUMAN door(s) this wave grants clara_authenticated, with the posture a drop destroys and a create must re-issue ` +
        "(owner, SECURITY DEFINER, volatility and a pinned search_path)",
      `select p.oid::regprocedure::text as sig, p.prosecdef as secdef, p.provolatile as vol,
              pg_get_userbyid(p.proowner) as owner,
              coalesce(array_to_string(p.proconfig, ' '), '') as cfg,
              coalesce(array_to_string(p.proacl, ' '), '(default)') as acl
         from pg_proc p
        where p.oid in (${human.map((g) => `'${g.sig.replace(/'/g, "''")}'::regprocedure`).join(",\n                        ")})
        order by 1`,
    );

  // ---- L1 · 0362 (#1147): the standing instruction's model-lane read --------------------
  await rows(
    "L1/0362: the read door is a SECURITY DEFINER wrapper the model lane alone may call, and the relation it reads still grants the machine lane NOTHING (#1147, and 0338's own tail assertion re-read)",
    `select p.oid::regprocedure::text as sig, p.prosecdef as secdef, p.provolatile as vol,
            pg_get_userbyid(p.proowner) as owner,
            coalesce(array_to_string(p.proconfig,' '),'') as cfg,
            coalesce(array_to_string(p.proacl,' '),'(default)') as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('wake_get_firm_standing_instruction','record_firm_standing_instruction',
                          'withdraw_firm_standing_instruction')
      order by 1`,
  );
  await rows(
    "L1/0362: clara.firm_standing_instructions is still forced-RLS, SELECT to clara_authenticated alone and reachable by no machine role",
    `select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
            coalesce(array_to_string(c.relacl,' '),'(default)') as acl,
            (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
            (select count(*)::int from clara.firm_standing_instructions) as rows_held,
            has_table_privilege('clara_agent_ro', c.oid, 'select') as agent_ro_may_select,
            has_table_privilege('clara_runtime', c.oid, 'select') as runtime_may_select
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'firm_standing_instructions'`,
  );
  await rows(
    "L1/0362: the deferred-revenue ASYMMETRY, held by a census rather than by a comment - the prepayment core's closed lane set carries 'wake' and the revenue core's does not, and no wake wrapper exists for the revenue side (#1147 follow-up 3, an OWNER RULING, not a defect)",
    `select p.oid::regprocedure::text as sig,
            position('''wake''' in p.prosrc) > 0 as lane_set_carries_wake,
            (select count(*)::int from pg_proc q join pg_namespace m on m.oid = q.pronamespace
              where m.nspname = 'clara' and q.proname like 'wake\\_%revenue%') as revenue_wake_wrappers
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('_prepayment_schedule_core','_revenue_recognition_core')
      order by 1`,
  );
  await rows(
    "L1/0362: the withdraw door's receipt now carries plans_still_posting, and WHAT WITHDRAWAL DOES TO A PLAN IS UNCHANGED - the door names no plan-state verb (the ruling #1147 records rather than takes)",
    `select p.oid::regprocedure::text as sig,
            position('plans_still_posting' in p.prosrc) > 0 as names_the_count,
            (position('pause_plan' in p.prosrc) > 0
             or position('end_plan' in p.prosrc) > 0
             or position('update clara.accounting_plans' in p.prosrc) > 0) as touches_plan_state
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = 'withdraw_firm_standing_instruction'`,
  );

  // ---- L1 · 0363 (#1148): the payroll posting verdict's document-scoped read ------------
  await rows(
    "L1/0363: the granted read exists once at the viewer floor, and the INTERNAL it wraps is still nobody's to call (#1148; the file's own prestate refuses over a database where that has stopped being true)",
    `select p.oid::regprocedure::text as sig, p.prosecdef as secdef, p.provolatile as vol,
            pg_get_userbyid(p.proowner) as owner,
            coalesce(array_to_string(p.proacl,' '),'(default)') as acl,
            has_function_privilege('clara_authenticated', p.oid, 'execute') as authenticated_may,
            has_function_privilege('clara_agent_ro', p.oid, 'execute') as agent_ro_may,
            has_function_privilege('clara_runtime', p.oid, 'execute') as runtime_may
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('get_payroll_posting_state','_payroll_posting_verdict')
      order by 1`,
  );
  await rows(
    "L1/0363: the Needs-you queue is byte-unchanged beside it, which is what 'this file adds a read and moves no row kind' means as a measurement",
    `select p.oid::regprocedure::text as sig,
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname in ('list_review_queue','answer_payroll_completeness')
      order by 1`,
  );

  // ---- L2 · 0364 (#1150): one reservation namespace per lane, one on-behalf plan body ----
  const suf = parsedOpKeySuffixes();
  const sufList = [...new Set([...suf.minted.map((m) => m.suffix), ...suf.asserted.map((a) => a.suffix), ":plan", ":end"])];
  await rows(
    `L2/0364: the reservation namespace, lane by lane - every body that derives one of the ${sufList.length} suffixes in play, so "one lane one namespace" is a reading rather than a claim (#1150)`,
    `with s(suffix) as (values ${sufList.map((x) => `('${x}')`).join(",")})
     select s.suffix,
            (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'clara'
                and p.prosrc ~ ('p_op_key[[:space:]]*\\|\\|[[:space:]]*''' || s.suffix || '''')) as bodies,
            coalesce((select string_agg(p.proname, ', ' order by p.proname)
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'clara'
                         and p.prosrc ~ ('p_op_key[[:space:]]*\\|\\|[[:space:]]*''' || s.suffix || '''')), '(none)') as which
       from s order by 1`,
  );
  await rows(
    "L2/0364: the THIRD on-behalf-of plan step is a CALLER now, not a fourth snapshot - _tenancy_plan_core reaches _obo_plan_core, whose closed kind set gained recurring_journal, and #1051's ONE authority wall is still one body (#1150, and 0353's own follow-up 1)",
    `select p.oid::regprocedure::text as sig,
            position('clara._obo_plan_core' in p.prosrc) > 0 as calls_obo_core,
            position('clara._assert_plan_authority' in p.prosrc) > 0 as calls_the_one_wall,
            position('recurring_journal' in p.prosrc) > 0 as admits_recurring_journal,
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('_obo_plan_core','_tenancy_plan_core','_prepayment_plan_core',
                          '_accrual_plan_core','_assert_plan_authority')
      order by 1`,
  );
  await rows(
    "L2/0364: both tenancy cores now CLOSE their lane set, which no door could reach and which is why the cores are where it had to be driven (#1150 AC6)",
    `select p.oid::regprocedure::text as sig,
            position('p_lane' in p.prosrc) > 0 as takes_a_lane,
            position('plan_lane_unknown' in p.prosrc) > 0
              or position('unknown lane' in p.prosrc) > 0 as refuses_an_unknown_lane
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('_confirm_tenancy_rent_plan_core','_confirm_tenancy_rent_plan_revision_core')
      order by 1`,
  );
  await rows(
    "L2/0364: NOTHING IS BACK-FILLED, and this is the read that shows it - the receipts already spent on each suffix keep meaning what they meant, because a receipt records an act that happened",
    `with s(suffix) as (values ${sufList.map((x) => `('${x}')`).join(",")})
     select s.suffix, (select count(*)::int from clara.op_receipts r where r.op_key like ('%' || s.suffix)) as receipts_held
       from s order by 1`,
  );

  // ---- L3 · 0365 (#1152): the accrual register's page -----------------------------------
  await rows(
    "L3/0365: clara.list_accrual_adjustments resolves EXACTLY ONCE, at six arguments - the four-argument shape is GONE rather than left as a resolvable overload, which is the state PostgREST cannot disambiguate (#1152 tail)",
    `select p.oid::regprocedure::text as sig, p.pronargs, p.pronargdefaults,
            p.prosecdef as secdef, p.provolatile as vol,
            pg_get_userbyid(p.proowner) as owner,
            coalesce(array_to_string(p.proconfig,' '),'') as cfg,
            coalesce(array_to_string(p.proacl,' '),'(default)') as acl,
            obj_description(p.oid, 'pg_proc') is not null as has_comment
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = 'list_accrual_adjustments'
      order by p.pronargs`,
  );
  await rows(
    "L3/0365: the register's neighbours are untouched - the single-row read still resolves and the side vocabulary is the same one body (#1152's own tail claim)",
    `select p.oid::regprocedure::text as sig,
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha,
            coalesce(array_to_string(p.proacl,' '),'(default)') as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname in ('get_accrual_adjustment','_accrual_sides')
      order by 1`,
  );
  await rows(
    "L3/0365: what the page now has to page over, per client - the number that decides whether the register's first screen was ever a problem on this estate",
    `select 'accrual rows in total' as reading, count(*)::int as n from clara.accrual_adjustments
      union all select 'clients carrying any', count(distinct client_id)::int from clara.accrual_adjustments
      union all select 'most on any one client',
                       coalesce((select max(t.n)::int from (select count(*) as n from clara.accrual_adjustments
                                                             group by client_id) t), 0)
      order by 1`,
  );

  // ---- LC · the version cut, in the DATABASE's own terms ---------------------------------
  // The cut itself is runtime-only and its reads are section (v)'s. What the DATABASE can say
  // about it is the one thing the boot line cannot: which bodies the parked runs are on.
  note(
    "LC/#1144: the version cut applies no migration",
    "its evidence is step 7's boot line (bodies=62, chatTurn=chatTurn_v23, claraWork=claraWork_v7, SEVEN clara-work bundle banners), step 9's rollback preflight and section (v) below, not a catalog read",
  );

  // ---- The reference counts that MOVE ----------------------------------------------------
  await rows(
    "the reference counts this wave moves: the wake allowlist by one row, and NOTHING ELSE (parsed - no relation created, no column added, no backfill, no catalogue insert but the one allowlist row)",
    `select 'clara.wake_fn_allowlist  MOVES +1' as relation, count(*)::int as rows from clara.wake_fn_allowlist
      union all select 'clara.trigger_taxonomy', count(*)::int from clara.trigger_taxonomy
      union all select 'clara.knowledge_keys', count(*)::int from clara.knowledge_keys
      union all select 'clara.document_capabilities', count(*)::int from clara.document_capabilities
      union all select 'clara.onboarding_plan_items', count(*)::int from clara.onboarding_plan_items
      union all select 'clara.accrual_adjustments', count(*)::int from clara.accrual_adjustments
      union all select 'clara.firm_standing_instructions', count(*)::int from clara.firm_standing_instructions
      union all select 'clara.accounting_plans', count(*)::int from clara.accounting_plans
      union all select 'clara.op_receipts', count(*)::int from clara.op_receipts
      order by 1`,
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
  if (PENDING.length && !locked.length) {
    note(
      "this wave LOCKS NO RELATION, and that is parsed rather than claimed",
      "no ALTER TABLE, no CREATE INDEX, no SET NOT NULL, no VALIDATE, no top-level UPDATE and no top-level DELETE appear in any executed statement of the pending set"
    );
  }
  say(`  locks held by another backend on the relations this wave touches (${locked.join(", ") || "(none parsed)"}):\n  ` + fmt(await soft(
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
