// Release ceremony for the riders CUT PHASE (0320, 0321, 0323 - and a VERSION CUT that repoints
// three workflow pins) - read-only preflight. Child of scripts/ops/dsn-pipe.mjs (DATABASE_URL in
// env) or PG* for a rig. Prints facts only, never the DSN, never an e-mail address, never any
// personal data.
//
// EVERY STATEMENT IS A SELECT INSIDE ONE `begin transaction read only`, and each one runs under
// its OWN SAVEPOINT, so a soft failure (a relation a rig does not carry) never poisons the rest.
// The transaction mode is the belt: a stray write raises 25006 rather than landing.
//
// NOTHING IN THIS FILE IS TRANSCRIBED FROM A MIGRATION. The pending list, every expected row
// count, every sha pin, every CHECK/INDEX/COLUMN predicate and every refusal literal is PARSED
// out of the directory named by CLARA_MIGRATIONS_DIR at run time; the boot-pin expectations are
// PARSED out of CLARA_REPO's own packages/runtime/workflows/registry.ts. A literal this script
// cannot parse is reported as a PARSE GAP and counts as a STOP, because an unchecked
// precondition is unchecked.
//
// WHAT CHANGED FROM ceremony-w4/reads-w4.mjs, and why. The design is wave 4's, unchanged: the
// same parsers, the same fingerprint, the same role-level env rule, the same savepoint
// discipline. Six things are different, and every one of them is a measurement in these three
// files rather than a preference.
//
//  1. FRONTIER AND PENDING SET. The cut builds on 309 applied / 0318_knowledge_fye_pair_
//     applicability and adds exactly THREE files: 0320, 0321, 0323. 0319 and 0322 were reserved
//     by CUT-PLAN §1.2 A4 and §3.2 and went UNUSED, which is lawful - the runner does not ask for
//     gapless numbering. The arithmetic is still derived, never written down.
//
//  2. NO PIN IN THIS CUT IS CHAIN-INTERNAL, AND THAT IS MEASURED HERE RATHER THAN ASSERTED.
//     Wave 4 carried 189 pins of which 53 were chain-internal, because its lanes recut each
//     other on purpose. This cut's three files touch three disjoint families: 0320 recuts
//     `clara.get_client_financial_pack`; 0321 recuts `clara.revise_document_fact` and
//     `clara._question_source_corrected`; 0323 recuts NOTHING. No file pins a signature an
//     EARLIER pending file produces. So every pin is measurable on hosted BEFORE the window, and
//     section 5b prints the chained count so a reader sees the claim tested rather than made.
//
//     ONE SUBTLETY THE CLASSIFIER HAS TO SURVIVE, and it is this cut's own: all three files add
//     an OVERLOAD of a signature they also PIN. 0321 pins `clara._fact_value_changed(jsonb,jsonb)`
//     and creates `(jsonb,jsonb,text)`; 0323 pins `clara._trade_invoice_probe_core(uuid,text,
//     jsonb)` and `clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` and creates the
//     one-argument-wider sibling of each. The producer map is keyed on the BARE NAME (wave 4's
//     rule, kept, because it is the conservative direction), so those would read as produced -
//     but a pin is chain-internal only when an EARLIER file produces it, and here the producer IS
//     the pinning file, so the arithmetic is unchanged. Section 5b prints an ARITY NOTE per such
//     pin so nobody re-derives that reasoning at the window.
//
//  3. THE TAILS CALL THEIR OWN UNGRANTED BODIES AFTER `reset role`, AND THAT IS A CAPABILITY
//     QUESTION ONLY HOSTED CAN ANSWER. All three files `set role clara_fn_owner`, `reset role`,
//     and then run a §TAIL that CALLS functions owned by `clara_fn_owner` and granted to nobody:
//     0321 drives `clara._fact_value_changed(jsonb,jsonb,text)`, `clara._fact_calendar_day(text)`
//     and `clara._source_correction_rederivation_brief(text)`; 0323 drives
//     `clara._trade_invoice_probe_core(uuid,text,jsonb[,text])`; 0320 additionally does
//     `set_config('role','clara_agent_ro',true)` inside a subtransaction. On every rig the
//     migration runs as a SUPERUSER, which bypasses the ACL and therefore cannot answer this.
//     On hosted it runs as whatever the probe's DSN carries. D-TAIL-REACH reads `current_user`,
//     `rolsuper`, and `pg_has_role(current_user, 'clara_fn_owner', 'USAGE'/'MEMBER')` and
//     `'clara_agent_ro','MEMBER'` - the four facts that decide whether those tails run or raise
//     42501 inside the window. It is the check in this script a rig cannot stand in for.
//
//  4. 0323's §TAIL DRIVES ITSELF AGAINST A REAL RECORDING, AND ONLY HOSTED HAS ONE. Its (T4) arm
//     SELECTS a trade invoice under a keyed, still-postable Work with an unreversed entry, copies
//     that invoice's own particulars, and runs the probe twice. Its FIRST assertion is a VACUITY
//     CONTROL: the UNNARROWED core must match the invoice its particulars were built from, or the
//     tail raises. On a fresh rig the selector finds nothing and the arm is skipped by notice; on
//     hosted it may well find a row. D-PROBE-DRIVEN runs the file's own selector and, where it
//     finds a row, runs the vacuity control READ-ONLY - so the one refusal in this cut that a rig
//     structurally cannot reach is found before the window instead of inside it.
//
//  5. THE `names` HEURISTIC IS NARROWED TO EXECUTED STATEMENTS. Wave 3 and wave 4 collected every
//     identifier in a pending file's whole text, so a fingerprint difference on any object the
//     file merely MENTIONED printed as TOLERATED. 0320 is 1,354 lines of which ~720 are #660's
//     accounting body carried verbatim into a new core, naming `clara.journal_lines`,
//     `clara.journal_entries`, `clara.cash_account_set_members` and a dozen more - none of which
//     this cut changes. Under the old rule real drift on any of them would have printed as
//     TOLERATED. The map is therefore built from `execOf` (function BODIES blanked, DO blocks
//     kept, exactly as the data-precondition generator already reads them), so a relation named
//     only inside a carried body no longer tolerates drift on itself. The PARSED PIN LEDGER is
//     still the primary source of "which objects are pinned"; this narrows only the weaker half.
//
//  6. THE VERSION-CUT READS, WHICH WAVE 4 DID NOT OWE. Wave 4 added two brand-new CLASSES and
//     repointed nothing, so `stranded bodies n=0` was trivially true in both directions. This cut
//     REPOINTS three pins - chatTurn v21 -> v22, claraWork v5 -> v6, statementFacts v3 -> v4 - and
//     that changes two things a preflight has to read. Section (v) reads them:
//       · every non-terminal `workflow.workflow_runs` row BY BODY, using the runtime's own
//         derivation (the identifier after the last `//` in `name`, `lib/rollback-preflight.mjs`'s
//         `bodyIdentifierOf`), and the same non-terminal set (`status not in completed, failed,
//         cancelled`);
//       · the stranded-body census the engine itself computes at boot, run here against the
//         bodies the RELEASE_SHA registry exports. A run parked on chatTurn_v21 or claraWork_v5 is
//         NOT stranded: policy (c) keeps every superseded body exported, and the new image carries
//         all of them. The census must read ZERO, and if it does not, the boot refuses
//         database-WIDE before `getWorld().start()`;
//       · the successor bodies must have ZERO runs before the window, because they cannot exist
//         yet - a non-zero reading means the image is already serving and this is not a preflight;
//       · and the ROLLBACK DIRECTION, stated rather than implied: the previous image does not
//         carry v22, v6 or v4, so it is a lawful boot target only until the first non-terminal run
//         of one of them exists. The count printed here is that snapshot's denominator.
//
//   node reads-wC.mjs --plan --frontier-before <v>       OFFLINE. Parse the directory and print
//                                                        the pending set, the generated reads,
//                                                        the parsed pins, the parsed literals and
//                                                        the registry the boot line will print.
//                                                        No database.
//   node reads-wC.mjs [--prod] [--baseline <f>]          PRE-WINDOW: identity, ledger, drift
//                                                        gate, pending set, estate fingerprint
//                                                        vs <f>, data preconditions, body pins,
//                                                        the version-cut reads, quiescence census.
//   node reads-wC.mjs --export-fingerprint <f> [--prod]  Write the estate fingerprint to <f>.
//   node reads-wC.mjs --census [--prod]                  ONLY the quiescence + version-cut reads.
//   node reads-wC.mjs --post [--baseline <f>] [--prod]   AFTER the migrate: ledger 309+3 at 0323,
//                                                        every new row at its file checksum,
//                                                        fingerprint vs the UPGRADED baseline,
//                                                        the cut's own post reads, and the
//                                                        boot-pin expectations for the log check.
//
// Options: --state <f> (default: reads-wC.state.json beside this file) carries the pre-window
// ledger reading forward so --post can re-derive the 309 + 3 arithmetic; --frontier-before <v>
// overrides it and always wins. --no-state suppresses the write. --pins-only runs section 5b's
// pin re-measurement alone. --cut-only runs section (v)'s version-cut reads alone, which is what
// step 9's rollback snapshot re-reads.
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
const STATE_FILE = opt("--state", join(HERE, "reads-wC.state.json"));
const ONLY_CUT = flag("--cut-only");
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
/** Every `position('<literal>' in v_src)` a pending file uses to recognise its OWN post-image --
 *  the REDO arm of a recut pin, whose admitted value is a substring rather than a sha256 and so
 *  cannot live in the pin ledger. Keyed by version. */
function parsedRedoSubstrings() {
  const out = new Map();
  for (const v of PENDING) {
    const hits = [...codeOf(v).matchAll(/position\(\s*'([^']{2,220})'\s+in\s+v_src\s*\)/gi)].map((m) => m[1]);
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

/**
 * Every `('clara.sig(...)')` a pending file lists in a `from (values ...) t(sig) where
 * to_regprocedure` roster - which is the shape all three files write their PARTIAL BIRTH census
 * in, and 0321 its §TAIL completeness census. These are the signatures that must be ABSENT on a
 * first apply; the file refuses BY NAME on anything between zero and all of them.
 */
function parsedNewbornSignatures() {
  const out = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    for (const m of code.matchAll(/from\s*\(\s*values([\s\S]{0,900}?)\)\s*t\(sig\)\s*[\s\S]{0,80}?to_regprocedure\s*\(\s*t\.sig\s*\)/gi)) {
      for (const s of m[1].matchAll(/'(clara\.[a-z_0-9]+\s*\([^')]*\))'/gi)) {
        out.push({ version: v, sig: s[1].replace(/\s+/g, "") });
      }
    }
  }
  const seen = new Set();
  return out.filter((r) => (seen.has(r.sig) ? false : (seen.add(r.sig), true)));
}

/**
 * Every object a pending file's PRESTATE requires to be THERE already - the `to_regprocedure('X')
 * is null` / `to_regclass('X') is null` premise tests each file opens with. The newborn set is
 * subtracted, because a file's own partial-birth census reads the same catalog the other way
 * round.
 */
function parsedPremiseObjects() {
  const born = new Set(parsedNewbornSignatures().map((r) => r.sig));
  const out = [];
  for (const v of PENDING) {
    const code = codeOf(v);
    const head = code.slice(0, (() => {
      const m = /^[ \t]*set\s+role\b/im.exec(code);
      return m ? m.index : code.length;
    })());
    for (const m of head.matchAll(/to_reg(procedure|class)\s*\(\s*'(clara\.[a-z_0-9]+(?:\s*\([^')]*\))?)'\s*\)\s*is\s+null/gi)) {
      const id = m[2].replace(/\s+/g, "");
      if (born.has(id)) continue;
      out.push({ version: v, kind: m[1], id });
    }
  }
  const seen = new Set();
  return out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

function handChecks() {
  const L = (label, anchor) => literal(label, anchor);
  const list = [];
  const push = (id, phase, guards, lit, sql, verdict) =>
    list.push({ id, phase, guards, lit, sql, verdict });

  // ---------------------------------------------------------------------------------------
  // THE WHOLE CUT: what must already be there, and what must not be there yet.
  // ---------------------------------------------------------------------------------------

  // (a) THE PREMISE. All three files open by refusing outright if the cohort they extend is not
  //     applied - 0232's three doors plus the wake machinery and the estate floor body (0320),
  //     0268's whole cohort (0321), 0275's probe cohort (0323). A forward reference would
  //     otherwise resolve at first CALL rather than at apply, which is the failure this estate
  //     refuses by name; each file says so in its own §0.1.
  const premise = parsedPremiseObjects();
  if (premise.length) {
    const rows = premise
      .map((p) => `('${p.id.replace(/'/g, "''")}','${p.kind}','${p.version.slice(0, 4)}')`)
      .join(",");
    push(
      "D-CUT-PREMISE",
      "pre",
      `${premise.length} object(s) the three prestates require to be PRESENT (0232's doors and the wake machinery, 0268's cohort, 0275's probe cohort). ` +
        "Each file raises CLR10 '<file> is not applied - apply it first' on an absent one",
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
    gap("literal the three prestates' premise objects", "no pending file carries a `to_regprocedure('clara.x(...)') is null` premise test");
  }

  // (b) THE NEWBORNS. On a FIRST APPLY none of the ten signatures this cut creates exists; on a
  //     REDO all of them do. Anything between is a half-applied file and each prestate says so BY
  //     NAME rather than silently completing it. Hosted is a first apply, so the expected reading
  //     is ZERO - and a non-zero one is the finding, not the count.
  const newborns = parsedNewbornSignatures();
  if (newborns.length) {
    const rows = newborns.map((n) => `('${n.sig.replace(/'/g, "''")}','${n.version.slice(0, 4)}')`).join(",");
    push(
      "D-CUT-NEWBORN",
      "pre",
      `the ${newborns.length} signature(s) this cut CREATES must all be absent before the window (0320 x2, 0321 x6, 0323 x2). ` +
        "Each file's §0.3 refuses a partial birth by name; a full house would instead take its REDO branch",
      "0 present",
      `select coalesce(string_agg(t.sig || ' (' || t.v || ')', ', ' order by t.sig), '(none)') as present,
              count(*) filter (where to_regprocedure(t.sig) is not null)::int as n
         from (values ${rows}) t(sig, v)
        where to_regprocedure(t.sig) is not null`,
      (r) => ({
        ok: r.n === 0,
        detail:
          r.n === 0
            ? `none of the ${newborns.length} exists yet, which is the FIRST APPLY branch on every one of the three files`
            : `${r.n} of ${newborns.length} already exist: ${r.present}. Read the owning file's §0.3 before doing anything else`,
      }),
    );
  } else {
    gap("literal the cut's newborn signatures", "no pending file carries a `from (values ...) t(sig) where to_regprocedure(t.sig)` partial-birth census");
  }

  // ---------------------------------------------------------------------------------------
  // 0320 (#1000) - one body, two entrances. No DDL on any relation, one row written.
  // ---------------------------------------------------------------------------------------

  // (c) THE ONE ROW THIS CUT WRITES. 0320's §TAIL (8) requires EXACTLY ONE allowlist row for the
  //     new door, for the `interactive` kind. The insert is `on conflict do nothing`, so a row
  //     already present would make the tail's count read 1 for the wrong reason - and a row for a
  //     DIFFERENT kind would make it read 2 and refuse. Both are read here.
  const allow = (() => {
    for (const v of PENDING) {
      const m =
        /insert\s+into\s+clara\.wake_fn_allowlist\s*\([^)]*\)\s*values\s*\(\s*'([a-z_]+)'\s*,\s*'([a-z_0-9]+)'\s*\)/i.exec(
          codeOf(v),
        );
      if (m) return { version: v, kind: m[1], fn: m[2] };
    }
    return null;
  })();
  if (allow) {
    push(
      "D-PACK-ALLOWLIST",
      "pre",
      `${allow.version.slice(0, 4)} writes ONE clara.wake_fn_allowlist row, ('${allow.kind}','${allow.fn}'), on conflict do nothing. ` +
        "Its §TAIL then requires exactly one row for that function_name and that the one row is for that kind",
      "0 rows before the window",
      `select count(*)::int as rows,
              coalesce(string_agg(wake_kind, ', ' order by wake_kind), '(none)') as kinds
         from clara.wake_fn_allowlist where function_name = '${allow.fn}'`,
      (r) => ({
        ok: r.rows === 0,
        detail:
          r.rows === 0
            ? `no allowlist row for ${allow.fn} today, so the insert writes the one the tail counts`
            : `${r.rows} row(s) ALREADY exist for ${allow.fn}, kinds ${r.kinds}: the insert is a no-op and the tail's count is not this file's doing`,
      }),
    );
  } else {
    gap("literal 0320's wake_fn_allowlist row", "no pending file inserts into clara.wake_fn_allowlist");
  }

  // (d) 0232's POSTURE, RE-MEASURED BEFORE THE WINDOW. 0320's §TAIL (7) walks its own roster of
  //     the three #660 doors against `clara_runtime`, `clara_agent_ro` and every `clara_wake_%`
  //     role and refuses if ANY of them holds EXECUTE. That census is over `pg_roles`, so it
  //     grows with the estate - hosted carries more `clara%` roles than any rig (the 2026-09-24
  //     window measured 19 where a rig reads 18, because of `clara_storage_docs`) and the check
  //     is a NEGATIVE one, so extra roles widen what it examines rather than breaking a count.
  //     The roster is printed; the widening is what STOPs.
  const doorRoster = (() => {
    for (const v of PENDING) {
      const m = /from\s*\(\s*values([\s\S]{0,600}?)\)\s*d\(sig\)/i.exec(codeOf(v));
      if (!m) continue;
      const sigs = [...m[1].matchAll(/'(clara\.[a-z_0-9]+\s*\([^')]*\))'/gi)].map((x) => x[1].replace(/\s+/g, ""));
      if (sigs.length) return { version: v, sigs };
    }
    return null;
  })();
  const humanDoor = L(
    "0320's human door and the grant it must keep",
    /if not has_function_privilege\('clara_authenticated',\s*\n?\s*'(clara\.[a-z_0-9]+\([^')]*\))'/i,
  );
  if (doorRoster && humanDoor) {
    const rows = doorRoster.sigs.map((s) => `('${s.replace(/'/g, "''")}')`).join(",");
    push(
      "D-PACK-POSTURE",
      "pre",
      `${doorRoster.version.slice(0, 4)} §TAIL (7) refuses if clara_runtime, clara_agent_ro or any clara_wake_% role holds EXECUTE on any of #660's ${doorRoster.sigs.length} doors, ` +
        `and refuses if ${humanDoor.value.replace(/\(.*$/, "")} loses its clara_authenticated grant. Both read here, before the window`,
      "0 machine-lane grants",
      `select coalesce(string_agg(x.who || ' on ' || x.sig, ', '), '(none)') as widened,
              (select count(*)::int from pg_roles where rolname like 'clara%') as clara_roles,
              (select left(coalesce(string_agg(rolname, ' ' order by rolname), ''), 400)
                 from pg_roles where rolname like 'clara%') as roster,
              (select case when to_regprocedure('${humanDoor.value.replace(/'/g, "''")}') is null then null
                           else has_function_privilege('clara_authenticated', '${humanDoor.value.replace(/'/g, "''")}', 'execute') end) as human_door
         from (select r.rolname as who, d.sig as sig
                 from (values ${rows}) d(sig)
                 cross join (select rolname from pg_roles
                              where rolname in ('clara_runtime','clara_agent_ro')
                                 or rolname like 'clara\\_wake\\_%') r
                where to_regprocedure(d.sig) is not null
                  and has_function_privilege(r.rolname, d.sig, 'execute')) x`,
      (r) => ({
        ok: r.widened === "(none)" && r.human_door === true,
        detail:
          `${r.clara_roles} clara% role(s) on this server [${r.roster}] · ` +
          `machine-lane EXECUTE on #660's doors: ${r.widened} · ` +
          `the human door's clara_authenticated grant: ${r.human_door === true ? "held" : String(r.human_door)}`,
      }),
    );
  } else {
    if (!doorRoster) gap("literal 0320's #660 door roster", "no pending file carries a `from (values ...) d(sig)` posture roster");
    if (!humanDoor) gap("literal 0320's human door", "no pending file asserts has_function_privilege('clara_authenticated', ...)");
  }

  // ---------------------------------------------------------------------------------------
  // THE CAPABILITY QUESTION ONLY HOSTED CAN ANSWER
  // ---------------------------------------------------------------------------------------

  // (e) EVERY TAIL IN THIS CUT CALLS AN UNGRANTED BODY AFTER `reset role`. This is the check a rig
  //     cannot stand in for, and it is worth reading slowly.
  //
  //     All three files do `set role clara_fn_owner`, create their objects, `reset role`, and then
  //     run a §TAIL that CALLS functions owned by `clara_fn_owner` and revoked from everyone:
  //       · 0321 §TAIL (T3) drives `clara._fact_value_changed(jsonb,jsonb,text)` fifteen times,
  //         (T4) drives `clara._fact_calendar_day(text)`, (T8) drives
  //         `clara._source_correction_rederivation_brief(text)`;
  //       · 0323 §TAIL (T4) drives `clara._trade_invoice_probe_core(uuid,text,jsonb[,text])`;
  //       · 0320 §TAIL (9) additionally does `set_config('role','clara_agent_ro',true)` inside a
  //         subtransaction, to prove the ungranted core refuses that role directly.
  //     On every rig the migration runs as a SUPERUSER, which bypasses the ACL, so no rig run of
  //     these files has ever exercised the privilege path. On hosted the migration runs as
  //     whatever the probe's DSN carries, and the ANSWER DECIDES whether those tails run or raise
  //     42501 inside the window. `USAGE` is the load-bearing one: it is membership WITH
  //     inheritance, which is what confers the privilege without a SET ROLE.
  push(
    "D-TAIL-REACH",
    "pre",
    "the migrating role must be able to `set role clara_fn_owner` (all three files), to INHERIT clara_fn_owner's privileges (every tail calls an ungranted, owner-only body after `reset role`), " +
      "and to `set_config('role','clara_agent_ro')` (0320 §TAIL 9). A superuser satisfies all three by bypass. THIS IS THE ONE CHECK NO RIG CAN ANSWER",
    "superuser, or MEMBER+USAGE of clara_fn_owner and MEMBER of clara_agent_ro",
    `select current_user::text as who,
            coalesce((select rolsuper from pg_roles where rolname = current_user), false) as superuser,
            pg_has_role(current_user, 'clara_fn_owner', 'MEMBER') as fn_owner_member,
            pg_has_role(current_user, 'clara_fn_owner', 'USAGE') as fn_owner_inherits,
            exists(select 1 from pg_roles where rolname = 'clara_agent_ro') as agent_ro_exists,
            case when exists(select 1 from pg_roles where rolname = 'clara_agent_ro')
                 then pg_has_role(current_user, 'clara_agent_ro', 'MEMBER') else false end as agent_ro_member`,
    (r) => ({
      ok: r.superuser === true || (r.fn_owner_member === true && r.fn_owner_inherits === true && r.agent_ro_member === true),
      detail:
        `current_user=${r.who} superuser=${r.superuser} · clara_fn_owner MEMBER=${r.fn_owner_member} USAGE(inherits)=${r.fn_owner_inherits} · ` +
        `clara_agent_ro exists=${r.agent_ro_exists} MEMBER=${r.agent_ro_member}` +
        (r.superuser === true
          ? " · a superuser bypasses every ACL, so all four tails reach their own bodies"
          : r.fn_owner_inherits === true && r.agent_ro_member === true
            ? " · not a superuser, but the inherited membership is what carries the tails' calls"
            : " · the tails would raise 42501 inside the window on their OWN ungranted helpers"),
    }),
  );

  // ---------------------------------------------------------------------------------------
  // 0321 (#1030) - the typed no-op notion and the re-derivation lane. No DDL, no row at apply.
  // ---------------------------------------------------------------------------------------

  // (f) THE CORRECTING DOOR'S OWN GRANT. `create or replace function` PRESERVES privileges, which
  //     is why 0321 can recut a granted human door at all - and §TAIL (T6) is the cell that says
  //     so rather than the comment that assumes it. If the grant is not there TODAY it will not be
  //     there after, and T6 raises. Read before, so the refusal is not a surprise.
  const reviseDoor = L(
    "0321's correcting door",
    /p\.oid\s*=\s*'(clara\.revise_document_fact\([^')]*\))'::regprocedure\)\s*t\s*\n?\s*where\s+a::text\s+like/i,
  );
  const reviseGrantee = L(
    "0321's correcting door's grantee",
    /clara\.revise_document_fact no longer carries its ([a-z_]+) grant/i,
  );
  if (reviseDoor && reviseGrantee) {
    push(
      "D-REVISE-GRANT",
      "pre",
      `${reviseDoor.version} recuts ${reviseDoor.value} with create or replace, which preserves privileges; its §TAIL (T6) then requires exactly one ${reviseGrantee.value} aclitem on it`,
      `1 ${reviseGrantee.value} aclitem`,
      `select (select count(*)::int from (
                 select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
                  where p.oid = '${reviseDoor.value.replace(/'/g, "''")}'::regprocedure) t
                where a::text like '${reviseGrantee.value}=%') as grants,
              (select coalesce(array_to_string(p.proacl, ' '), '(default)') from pg_proc p
                where p.oid = '${reviseDoor.value.replace(/'/g, "''")}'::regprocedure) as acl`,
      (r) => ({
        ok: r.grants === 1,
        detail: `${r.grants} ${reviseGrantee.value} aclitem(s) today · acl ${String(r.acl).slice(0, 200)}`,
      }),
    );
  } else {
    if (!reviseDoor) gap("literal 0321's correcting door signature", "no pending file reads clara.revise_document_fact's proacl");
    if (!reviseGrantee) gap("literal 0321's correcting-door grantee", "no pending file names the grant the door must keep");
  }

  // (g) THE LANE SETTLES NOTHING AT APPLY, AND §TAIL (T9) PROVES IT - but only on the FIRST APPLY
  //     branch, which is the branch hosted takes. The receipt kind it counts cannot exist yet
  //     (the function that writes it is created by this very file), so the expected reading is
  //     ZERO and a non-zero one means something already ran this lane.
  //
  //     Beside it, 0321's §0.5 DATA-DEPENDENT BRANCH, entered rather than assumed (the wave-3
  //     addendum): the backlog read is only interesting where a `source_corrected:` cancellation
  //     receipt exists. That count is a NOTICE in the file and a FACT here - hosted carries such
  //     rows where a freshly seeded rig does not, and neither state is wrong.
  const settleFn = L(
    "0321's settlement receipt kind",
    /where fn = '(source_correction_rederivation)'/i,
  );
  const backlogKey = L(
    "0321's backlog op-key prefix",
    /fn = 'cancel_accounting_work' and op_key like '([^']+)'/i,
  );
  if (settleFn && backlogKey) {
    push(
      "D-REDERIVE-BACKLOG",
      "pre",
      `${settleFn.version} §TAIL (T9) refuses on a FIRST APPLY if any '${settleFn.value}' receipt exists (the file settles nothing at apply), ` +
        `and its §0.5 reads the '${backlogKey.value.replace(/\\/g, "")}' backlog for facts. Hosted takes the FIRST APPLY branch`,
      "0 settlement receipts",
      `select (select count(*)::int from clara.op_receipts where fn = '${settleFn.value}') as settled,
              (select count(*)::int from clara.op_receipts
                where fn = 'cancel_accounting_work' and op_key like '${backlogKey.value}') as backlog,
              (select count(*)::int from clara.op_receipts
                where fn = 'cancel_accounting_work' and op_key like '${backlogKey.value}'
                  and not exists (select 1 from clara.op_receipts s
                                   where s.fn = '${settleFn.value}' and s.op_key = clara.op_receipts.op_key)) as unsettled`,
      (r) => ({
        ok: r.settled === 0,
        detail:
          `${r.settled} '${settleFn.value}' receipt(s), which §TAIL requires to be 0 on a first apply · ` +
          `${r.backlog} source-corrected cancellation receipt(s) on this server, ${r.unsettled} of them unsettled - that is the backlog the new belt will read on its first sweep after the release, ` +
          "and it is the number worth watching in the first log sweep",
      }),
    );
  } else {
    if (!settleFn) gap("literal 0321's settlement receipt kind", "no pending file names the fn its settlement writes");
    if (!backlogKey) gap("literal 0321's backlog op-key prefix", "no pending file reads a cancel_accounting_work op_key prefix");
  }

  // ---------------------------------------------------------------------------------------
  // 0323 (#1135) - a sibling probe, and the one tail in this cut that DRIVES ITSELF ON REAL ROWS.
  // ---------------------------------------------------------------------------------------

  // (h) THE ARITY WALL. 0323 adds an OVERLOAD and pins that it added nothing else: §TAIL (T2)
  //     requires exactly two overloads of the probe twin afterwards and that neither new sibling
  //     carries a DEFAULT, because a default would make the four-argument call - the one
  //     chatTurn_v21's parked runs make - ambiguous. One overload today is what makes two after.
  const arity = (() => {
    for (const v of PENDING) {
      const m = /% overloads of ([a-z_0-9]+), expected (\d+)/i.exec(codeOf(v));
      if (m) return { version: v, proname: m[1], after: Number(m[2]) };
    }
    return null;
  })();
  if (arity) {
    push(
      "D-PROBE-ARITY",
      "pre",
      `${arity.version.slice(0, 4)} §TAIL (T2) requires exactly ${arity.after} overload(s) of clara.${arity.proname} afterwards and NO default on either new sibling ` +
        "(a default would make chatTurn_v21's own four-argument call ambiguous)",
      `${arity.after - 1} overload(s) before the window`,
      `select (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara' and p.proname = '${arity.proname}') as overloads,
              (select coalesce(string_agg(p.oid::regprocedure::text, ' | ' order by p.oid::regprocedure::text), '(none)')
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara' and p.proname = '${arity.proname}') as sigs,
              (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara' and p.proname = '${arity.proname}' and p.pronargdefaults > 0) as with_defaults`,
      (r) => ({
        ok: r.overloads === arity.after - 1 && r.with_defaults === 0,
        detail: `${r.overloads} overload(s) today [${r.sigs}], ${r.with_defaults} of them carrying a DEFAULT`,
      }),
    );
  } else {
    gap("literal 0323's overload census", "no pending file carries a `% overloads of <name>, expected N` refusal");
  }

  // (i) THE DRIVEN ARM, AND THE ONE REFUSAL IN THIS CUT A RIG STRUCTURALLY CANNOT REACH.
  //
  //     0323's §TAIL (T4) does not assert that its narrowing works - it DRIVES it. It SELECTS one
  //     trade invoice recorded under a keyed, still-postable Work with an unreversed entry, copies
  //     THAT invoice's own particulars, and runs the probe twice. Its FIRST assertion is a VACUITY
  //     CONTROL: `if not ((v_without->'matches') @> [{invoice_id}])` then `the unnarrowed core did
  //     not match the invoice it was built from - the driven arm proves nothing` - a CLR10 that
  //     rolls the whole migration back.
  //
  //     On a freshly seeded rig the selector finds nothing and the arm is skipped by notice, which
  //     is what every rig run of this file has exercised. Hosted may well hold such a row. So this
  //     read runs the FILE'S OWN selector verbatim (extracted, never retyped) and, where it finds
  //     a row, runs the vacuity control itself, read-only. A `false` here is the refusal that would
  //     fire inside the window; an unreadable one (the probe raising on an unresolvable party, say)
  //     surfaces as a PARSE GAP with its sqlstate, which is the same STOP by another name.
  const t4 = (() => {
    for (const v of PENDING) {
      const m = /select\s+w\.intent_key,\s*ti\.client_id\s+into\s+v_key,\s*v_client\s*([\s\S]{0,1200}?);/i.exec(codeOf(v));
      if (m) return { version: v, tail: m[1].trim() };
    }
    return null;
  })();
  const keyedCount = (() => {
    for (const v of PENDING) {
      const m = /select\s+count\(\*\)::int\s+into\s+v_n\s+(from\s+clara\.trade_invoices\s+ti[\s\S]{0,400}?);/i.exec(codeOf(v));
      if (m) return { version: v, tail: m[1].trim() };
    }
    return null;
  })();
  const probeCore = L(
    "0323's three-argument probe core",
    /v_without\s*:=\s*(clara\._trade_invoice_probe_core)\(v_client, v_kind, v_part\);/i,
  );
  if (t4 && keyedCount && probeCore) {
    const CORE3 = "clara._trade_invoice_probe_core(uuid,text,jsonb)";
    push(
      "D-PROBE-DRIVEN",
      "pre",
      `${t4.version.slice(0, 4)} §TAIL (T4) runs its narrowing against a REAL recording where this server holds one, and its first assertion is a vacuity control that REFUSES the migration ` +
        "if the unnarrowed core does not match the invoice its own particulars were copied from. The file's selector is re-run here, read-only, and the control with it",
      "no row picked, or the control holds",
      `with pick as (
         select w.intent_key as k, ti.client_id as c, ti.id as inv, ti.kind as knd,
                jsonb_build_object('counterparty', jsonb_build_object('id', ti.counterparty_id),
                  'reference', ti.reference, 'document_date', to_char(ti.document_date,'YYYY-MM-DD'),
                  'total_cents', ti.total_cents) as part
         ${t4.tail}
       ), probed as (
         select p.*, case when has_function_privilege(current_user, '${CORE3}', 'execute')
                          then ${probeCore.value}(p.c, p.knd, p.part) end as probe
           from pick p
       )
       select (select count(*)::int from pick) as picked,
              (select count(*)::int ${keyedCount.tail}) as keyed_invoices,
              has_function_privilege(current_user, '${CORE3}', 'execute') as can_probe,
              (select inv::text from probed) as invoice_id,
              (select (probe->'matches') @> jsonb_build_array(jsonb_build_object('invoice_id', inv)) from probed) as vacuity_holds,
              (select (probe->>'match_count')::int from probed) as match_count`,
      (r) => ({
        ok: r.picked === 0 || r.vacuity_holds === true,
        detail:
          r.picked === 0
            ? `${r.keyed_invoices} trade invoice(s) under a keyed Work on this server, but the file's own selector (keyed + still-postable + a reference + no reversed entry) picks NONE, ` +
              "so §TAIL's driven arm is skipped by notice and T1 to T3 stand alone"
            : r.can_probe !== true
              ? `a row IS picked (invoice ${r.invoice_id}) but this role cannot execute ${CORE3}, so the control could not be run here - see D-TAIL-REACH, and expect §TAIL (T4) to raise 42501`
              : `${r.keyed_invoices} keyed trade invoice(s); the selector picks invoice ${r.invoice_id}; the UNNARROWED core ` +
                `${r.vacuity_holds === true ? "MATCHES it, so the vacuity control holds and the driven arm will run" : "does NOT match it, and §TAIL (T4) will REFUSE the migration on exactly this"}` +
                ` · match_count ${r.match_count}`,
      }),
    );
  } else {
    if (!t4) gap("literal 0323's §TAIL selector", "no pending file selects `w.intent_key, ti.client_id into v_key, v_client`");
    if (!keyedCount) gap("literal 0323's keyed-invoice census", "no pending file counts clara.trade_invoices under a keyed Work");
    if (!probeCore) gap("literal 0323's three-argument probe core", "no pending file drives `v_without := clara._trade_invoice_probe_core(...)`");
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
  say("== the version cut, read out of CLARA_REPO's own registry.ts ==");
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
    "             (this cut pins no content digest at all - its 40 pins are sha256(prosrc) over FUNCTION BODIES, which no collation reaches; the line is printed because a release read that stops printing it stops being comparable with wave 4 s)",
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
    await versionCut(soft);
    await census(soft);
    await finish(c);
    return;
  }

  if (ONLY_CUT) {
    await versionCut(soft);
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
    await versionCut(soft);

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
    await versionCut(soft);
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
  const redo = parsedRedoSubstrings();
  for (const b of bad) {
    say(`   STOP PIN ${b.version} ${b.sig}`);
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
    say(
      `         this is the refusal that would fire INSIDE the window. Do NOT re-pin and do NOT edit the migration: report the body name and both sides.`,
    );
  }
  // THE ARITY NOTE, which this cut needs and wave 4 did not. All three files add an OVERLOAD of
  // a signature they also PIN: 0321 pins clara._fact_value_changed(jsonb,jsonb) and creates the
  // (jsonb,jsonb,text) sibling; 0323 pins the three-argument probe core and the four-argument
  // twin and creates the one-argument-wider sibling of each. The producer map is keyed on the
  // BARE NAME (wave 4's rule, kept, because calling a pin chained is the conservative direction),
  // so those read as produced -- but a pin is chain-internal only when an EARLIER file produces
  // it, and here the producer IS the pinning file. Printed so nobody re-derives that reasoning
  // at the window.
  const sameFileOverload = pins.filter((p) => {
    const bare = /clara\.([a-z_0-9]+)\(/.exec(p.sig)?.[1];
    return (produced.get(bare) || []).includes(p.version);
  });
  if (sameFileOverload.length) {
    note(
      `${sameFileOverload.length} pin(s) name a bare function name their OWN file also creates an overload of`,
      "measurable, not chained: the producer is the pinning file itself, so there is no earlier body to wait for -- " +
        sameFileOverload.map((p) => `${p.version.slice(0, 4)}:${p.sig}`).join(", "),
    );
  }
  if (chainedCount === 0) {
    note(
      "ZERO pins in this cut are CHAIN-INTERNAL, and that is measured here rather than assumed",
      "the three files touch three disjoint families (0320 recuts clara.get_client_financial_pack; 0321 recuts clara.revise_document_fact and " +
        "clara._question_source_corrected; 0323 recuts nothing), so every pin is measurable on the target BEFORE the window -- unlike wave 4, where 53 of 189 were not",
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
//      adds classes does not. Run in the pre-window pass, in --census, in --cut-only and again
//      in --post, so the two sides of the window sit beside each other.
// ==========================================================================================
async function versionCut(soft) {
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

  // Which pins this cut MOVES. Derived by comparing each class's pin against the newest OTHER
  // version of the same class the roster carries: a repointed class is one whose pin is the
  // newest body of its class AND whose class carries an earlier body too. That is not what makes
  // it a repoint, though - what makes it a repoint is that the PREVIOUS image pinned the earlier
  // one, and only the operator knows the previous image. So both are printed and the operator
  // reads the runbook's own table beside this.
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
  } else {
    say(
      `  frozen manifest: ${unlocked.total} entries, ${unlocked.unlockedPaths.length} still UNLOCKED (deployed:false) covering bodies ${unlocked.bodies.join(", ") || "(none)"}`,
    );
    say("  (step 11a's --lock-deployed locks every one of those paths, this cut's and any earlier wave's that was never locked)");
  }
  const successors = unlocked
    ? withPredecessor.filter((b) => unlocked.bodies.includes(b))
    : withPredecessor;
  say(
    `  SUCCESSOR BODIES this release introduces (a class with a predecessor whose module no deployed image serves yet): ${successors.join(", ") || "(none)"}`,
  );
  const alreadyServed = withPredecessor.filter((b) => !successors.includes(b));
  if (alreadyServed.length) {
    note(
      "classes pinned at their newest whose module IS already deploy-locked",
      `${alreadyServed.join(", ")} - served by the previous image too, so a rollback does not strand them`,
    );
  }

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
  if (runs && runs[0] && runs[0].err) note("the run census could not be read", String(runs[0].err));

  // (v2) THE STRANDED-BODY CENSUS THE ENGINE ITSELF COMPUTES AT BOOT, run here against the bodies
  //      the RELEASE_SHA registry exports. A run parked on a SUPERSEDED body is not stranded:
  //      policy (c) (docs/ARCHITECTURE.md:428-429) keeps every superseded body exported, and this
  //      image carries all of them. A non-zero reading means `getWorld().start()` refuses
  //      DATABASE-WIDE and the crash-only supervisor exits 1, which under Fly is a restart loop.
  const stranded = [...perBody].filter(([b]) => !bodies.includes(b));
  check(
    `the incoming image carries every body a live run is parked on (the boot census, computed here)`,
    !censusErr && stranded.length === 0,
    censusErr
      ? "NOT COMPUTED: the run census was unreadable, so this cannot be answered either way"
      : stranded.length === 0
      ? `${perBody.size} distinct body/bodies carry non-terminal runs, every one of them exported by this tree`
      : `STRANDED: ${stranded.map(([b, n]) => `${b} (${n} run(s))`).join(", ")} - the world would refuse to start`,
  );

  // (v3) THE SUCCESSOR BODIES CANNOT HAVE A RUN YET. Before the window they do not exist in any
  //      served image, so a non-zero reading is not a warning, it is proof this is not a preflight.
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

  // (v4) THE ROLLBACK DIRECTION, STATED RATHER THAN IMPLIED. The previous image does not carry the
  //      successor bodies. It is therefore a lawful boot target ONLY until the first non-terminal
  //      run of one of them exists - and that degrades within minutes of the image serving, which
  //      is why the runbook's step 9 runs immediately after step 7 and records a timestamp rather
  //      than a guarantee. This line is that snapshot's denominator.
  note(
    "rollback direction (the previous image carries none of the successor bodies)",
    censusErr
      ? "NOT COMPUTED: the run census was unreadable, so no rollback snapshot can be taken from this reading"
      : `a rollback to the previous image is lawful only while ${successors.join(" / ") || "(none)"} carry ZERO non-terminal runs; they carry ` +
        `${successors.map((b) => `${b}=${perBody.get(b) ?? 0}`).join(", ") || "n/a"} as of ${new Date().toISOString()}`,
  );

  // (v5) THE PARKED HALF, IN THE ESTATE'S OWN TABLES. A run is only half the picture: the
  //      reconciler's unbound LIVE tasks are the second census the rollback preflight reads, and a
  //      Work awaiting an answer is what a cutover most often interrupts.
  say("  accounting_work non-terminal, by status and origin (what a cutover interrupts):\n  " + fmt(await soft(
    `select status, count(*)::int from clara.accounting_work
      where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
  say("  agent_interruptions pending (an open Work question is answered on the body that opened it):\n  " + fmt(await soft(
    `select status, count(*)::int from clara.agent_interruptions where status = 'pending' group by 1 order by 1`)));
}

// ==========================================================================================
// 5c · THE READS THIS CUT OWES AFTER THE MIGRATE. Run by --post, beside the ledger and the
//      fingerprint, so the pre-window and post-window answers sit side by side.
// ==========================================================================================
async function postReads(q) {
  say("== (f) the reads this cut owes on hosted after the release ==");
  const rows = async (label, sql) => {
    const r = await q(sql).catch((e) => [{ err: e.code || e.message }]);
    say(`  ${label}:\n  ` + fmt(r));
  };
  await rows(
    "0320: the three names resolve at exactly one pg_proc row each, with their posture (its §TAIL 1 and 2)",
    `select p.oid::regprocedure::text as sig, p.prosecdef as secdef, p.provolatile as vol,
            pg_get_userbyid(p.proowner) as owner, coalesce(array_to_string(p.proconfig,' '),'') as cfg
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in
            ('_client_financial_pack_core','get_client_financial_pack','wake_get_client_financial_pack')
      order by 1`,
  );
  await rows(
    "0320: the ACL delta, complete - the core granted to nobody, the model door to clara_agent_ro alone, the human door unmoved",
    `select p.oid::regprocedure::text as sig, coalesce(array_to_string(p.proacl,' '),'(default)') as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in
            ('_client_financial_pack_core','get_client_financial_pack','wake_get_client_financial_pack')
      order by 1`,
  );
  await rows(
    "0320: the one allowlist row, and its kind (§TAIL 8)",
    `select wake_kind, function_name from clara.wake_fn_allowlist
      where function_name = 'wake_get_client_financial_pack' order by 1`,
  );
  await rows(
    "0320: #660's three doors gained no machine-lane grant (§TAIL 7, re-read after the window)",
    `select coalesce(string_agg(r.rolname || ' on ' || d.sig, ', '), '(none)') as widened
       from (values ('clara.get_client_financial_pack(uuid,date,date)'),
                    ('clara.propose_client_cash_accounts(uuid)'),
                    ('clara.publish_client_cash_account_set(uuid,jsonb,date,text)')) d(sig)
       cross join (select rolname from pg_roles
                    where rolname in ('clara_runtime','clara_agent_ro') or rolname like 'clara\\_wake\\_%') r
      where to_regprocedure(d.sig) is not null and has_function_privilege(r.rolname, d.sig, 'execute')`,
  );
  await rows(
    "0321: the six new bodies exist, with their grants (§TAIL T5, T7, T8b)",
    `select p.oid::regprocedure::text as sig, coalesce(array_to_string(p.proacl,' '),'(default)') as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in
            ('_fact_calendar_day','_fact_value_changed','_source_correction_rederivation_brief',
             'source_correction_rederivations','settle_source_corrected_rederivation',
             'source_correction_successor_brief')
      order by 1`,
  );
  await rows(
    "0321: the correcting door kept its own ACL, and 0268's two-argument notion was not recut (§TAIL T2, T6)",
    `select p.oid::regprocedure::text as sig,
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha,
            coalesce(array_to_string(p.proacl,' '),'(default)') as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in ('revise_document_fact','_question_source_corrected','_fact_value_changed')
      order by 1`,
  );
  await rows(
    "0321: the lane settled nothing at apply, and the backlog it inherits (§TAIL T9, and the first sweep's workload)",
    `select (select count(*)::int from clara.op_receipts where fn='source_correction_rederivation') as settled,
            (select count(*)::int from clara.op_receipts
              where fn='cancel_accounting_work' and op_key like 'source\\_corrected:%') as backlog`,
  );
  await rows(
    "0323: both siblings born, neither carrying a DEFAULT, and the four-argument call still resolves (§TAIL T2)",
    `select p.oid::regprocedure::text as sig, p.pronargs, p.pronargdefaults,
            coalesce(array_to_string(p.proacl,' '),'(default)') as acl
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in ('_trade_invoice_probe_core','probe_trade_invoice_duplicates_for')
      order by p.proname, p.pronargs`,
  );
  await rows(
    "0323: nothing it delegates to was recut (§TAIL T1, the five pinned bodies re-measured)",
    `select p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as prosrc_sha
       from pg_proc p
      where p.oid in ('clara._trade_invoice_probe_core(uuid,text,jsonb)'::regprocedure,
                      'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)'::regprocedure,
                      'clara.probe_trade_invoice_duplicates(uuid,text,jsonb)'::regprocedure,
                      'clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)'::regprocedure,
                      'clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)'::regprocedure)
      order by 1`,
  );
  await rows(
    "the reference relations this cut writes to: ONE allowlist row and nothing else (no new relation, no column, no backfill)",
    `select (select count(*)::int from clara.wake_fn_allowlist) as wake_fn_allowlist,
            (select count(*)::int from clara.trade_invoices) as trade_invoices,
            (select count(*)::int from clara.trade_invoice_duplicate_acks) as duplicate_acks,
            (select count(*)::int from clara.accounting_work) as accounting_work,
            (select count(*)::int from clara.op_receipts) as op_receipts`,
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
      "this cut LOCKS NO RELATION, and that is parsed rather than claimed",
      "no ALTER TABLE, no CREATE INDEX, no SET NOT NULL, no VALIDATE, no top-level UPDATE and no top-level DELETE appear in any executed statement of the pending set; " +
        "the three files are function recuts, comments, grants and ONE insert, which take no table lock above what create-or-replace-function needs",
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
