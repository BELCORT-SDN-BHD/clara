// Release ceremony for riders wave 3 (0273...0293) - read-only preflight. Child of
// scripts/ops/dsn-pipe.mjs (DATABASE_URL in env) or PG* for a rig. Prints facts only, never the
// DSN, never an e-mail address, never any personal data.
//
// EVERY STATEMENT IS A SELECT INSIDE ONE `begin transaction read only`, and each one runs under
// its OWN SAVEPOINT, so a soft failure (a relation a rig does not carry) never poisons the rest.
// The transaction mode is the belt: a stray write raises 25006 rather than landing.
//
// NOTHING IN THIS FILE IS TRANSCRIBED FROM A MIGRATION. The wave's migration list, every
// expected row count, every sha pin and every CHECK/INDEX/COLUMN predicate is PARSED out of the
// directory named by CLARA_MIGRATIONS_DIR at run time. A literal this script cannot parse is
// reported as a PARSE GAP and counts as a STOP, because an unchecked precondition is unchecked.
//
// WHAT CHANGED FROM ceremony-w2/reads-w2.mjs, and why (all four are wave-3 findings, not taste):
//
//  1. FRONTIER. The wave builds on 267 applied / 0272_document_capability_wall_completion and
//     adds 21 files, 0273...0293. The arithmetic is still derived, never written down: the
//     ledger is read and the pending set is whatever sorts above the live frontier.
//
//  2. ROLE ATTRIBUTES AND ROLE MEMBERSHIPS ARE ENVIRONMENT FACTS, NOT DRIFT. The wave-2 window
//     STOPPED on 14 role-level fingerprint differences that were all Supabase-only facts about
//     the managed estate (LOGIN on the *_login roles, the clara_storage_docs role and its
//     memberships, authenticated -> clara_authenticated, postgres -> clara_*), and the operator
//     had to overrule every one of them by hand at window time. A check that is always overruled
//     is not a check. `role:` and `rolemember:` keys are now printed as `env` lines with BOTH
//     sides and never counted as a STOP. Everything else a migration can define - functions,
//     relations, columns, constraints, indexes, RLS, policies, triggers, types, grants - is
//     unchanged and still STOPs on drift.
//
//  3. THE DATA PRECONDITIONS ARE RE-DERIVED FROM THESE 21 FILES. Section 2's list is wave 3's,
//     not wave 2's. The generic extractors now also read ADD COLUMN, ADD FOREIGN KEY and
//     whole-table UPDATE, and they read the EXECUTED text only (a `create function` body is
//     inert at apply time and must not generate a read).
//
//  4. A GENERATED CHECK READ MAY DEFER TO A HAND CHECK. 0290's CHECK is
//     `check (clara._field_path_conforms(field_path))` and that function does not exist on the
//     target yet, so the generic read cannot run. It defers to D-REGION-PATH, which runs the
//     file's OWN prestate predicate - parsed out of the file, never retyped. A deferral is only
//     accepted when the hand check it names actually parsed; otherwise it is a GAP.
//
//   node reads-w3.mjs --plan --frontier-before <v>       OFFLINE. Parse the directory and print
//                                                        the pending set, the generated reads
//                                                        and the parsed literals. No database.
//   node reads-w3.mjs [--prod] [--baseline <f>]          PRE-WINDOW: identity, ledger 267/0272,
//                                                        drift gate, pending set, estate
//                                                        fingerprint vs <f>, data preconditions,
//                                                        quiescence census.
//   node reads-w3.mjs --export-fingerprint <f> [--prod]  Write the estate fingerprint to <f>.
//   node reads-w3.mjs --census [--prod]                  ONLY the quiescence census.
//   node reads-w3.mjs --post [--baseline <f>] [--prod]   AFTER the migrate: ledger 267+N at the
//                                                        highest pending version, every new row
//                                                        at its file checksum, fingerprint vs
//                                                        the UPGRADED baseline.
//
// Options: --state <f> (default: reads-w3.state.json beside this file) carries the pre-window
// ledger reading forward so --post can re-derive the 267 + N arithmetic; --frontier-before <v>
// overrides it. --no-state suppresses the write.
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
const PLAN_ONLY = flag("--plan");
const EXPORT_TO = opt("--export-fingerprint");
const BASELINE = opt("--baseline");
const STATE_FILE = opt("--state", join(HERE, "reads-w3.state.json"));
const NO_STATE = flag("--no-state");
const FRONTIER_BEFORE_ARG = opt("--frontier-before");

const MIGRATIONS_DIR =
  process.env.CLARA_MIGRATIONS_DIR || `${REPO}/packages/db/migrations`;

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
const textOf = (version) => readFileSync(join(MIGRATIONS_DIR, `${version}.sql`), "utf8").replace(/\r\n/g, "\n");
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
const gap = (label, detail = "") => {
  say(`  GAP  ${label}${detail ? " - " + detail : ""}`);
  gaps++;
  stops++;
};
const fmt = (rows) =>
  rows.map((r) => Object.values(r).map((v) => (v === null ? "null" : String(v))).join(" | ")).join("\n  ") || "(none)";

// ==========================================================================================
// 1 · THE LITERAL PARSER. Every expected number, sha and census this script asserts is pulled
//     out of a migration's own text by an anchor regex, searched across the PENDING files only.
//     Exactly one file must match; zero or two disagreeing is a PARSE GAP, never a guess.
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
    gap(`literal ${label}`, `pending files disagree: ${hits.map((h) => `${h.version}=${h.value}`).join(", ")}`);
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
  const re = /alter\s+table\s+(clara\.[a-z_0-9]+)\s+(?:[\s\S]{0,400}?)?add\s+constraint\s+([a-z_0-9]+)\s+check\s*\(/gi;
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

/** Every `alter table clara.X add constraint N foreign key (cols) references R(...)` executed. */
function parsedForeignKeys() {
  const out = [];
  const re =
    /alter\s+table\s+(clara\.[a-z_0-9]+)\s+(?:[\s\S]{0,400}?)?add\s+constraint\s+([a-z_0-9]+)\s+'?\s*\|?\|?\s*'?\s*foreign\s+key\s*\(/gi;
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
 * Every column the pending set ADDS to an EXISTING relation. Covers three spellings, all of
 * which occur in this wave: the bare `alter table X add column c t`, the comma-separated
 * multi-column list (0291) and the dynamic `execute 'alter table X add column c t'` (0277).
 */
function parsedAddColumns() {
  const out = [];
  for (const v of PENDING) {
    const code = execOf(v);
    // static, including multi-column lists: take the whole statement and scan it
    const re = /alter\s+table\s+(clara\.[a-z_0-9]+)\b([\s\S]*?);/gi;
    let m;
    while ((m = re.exec(code))) {
      const table = m[1];
      const body = m[2];
      const cre = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_0-9]+)/gi;
      let c;
      while ((c = cre.exec(body))) out.push({ version: v, table, column: c[1] });
    }
    // dynamic
    const dre = /execute\s+'alter\s+table\s+(clara\.[a-z_0-9]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_0-9]+)/gi;
    let d;
    while ((d = dre.exec(code))) out.push({ version: v, table: d[1], column: d[2] });
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
 * Every top-level `update clara.X set ...` with NO where clause: a WHOLE-TABLE rewrite.
 * ANCHORED TO A LINE START. A migration writes its statements at a line start; a marker string
 * inside a prestate's `foreach r in array array['update clara...']` census does not, and matching
 * one would invent a statement the file never runs.
 */
function parsedWholeTableUpdates() {
  const out = [];
  const re = /^[ \t]*update\s+(clara\.[a-z_0-9]+)\s+set\s+([^;]*);/gim;
  for (const v of PENDING) {
    const code = execOf(v);
    let m;
    while ((m = re.exec(code))) {
      if (/\bwhere\b/i.test(m[2])) continue;
      out.push({ version: v, table: m[1], set: m[2].replace(/\s+/g, " ").trim() });
    }
    re.lastIndex = 0;
  }
  return out;
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
 * The relations the pending set COUNTS ROWS ON in a prestate or tail, plus the floor below.
 * Parsed, so the reference census grows with the wave instead of being a transcribed list.
 */
const COUNT_FLOOR = [
  "document_capabilities",
  "document_capability_version_high_water",
  "document_regions",
  "document_extractions",
  "bank_statement_lines",
  "counterparties",
  "counterparty_aliases",
  "trade_invoices",
  "trade_invoice_duplicate_acks",
  "adjustment_templates",
  "adjustment_runs",
  "accounting_plans",
  "accounting_plan_revisions",
  "accrual_adjustments",
  "prepayment_schedules",
  "document_service_periods",
  "opening_tb_targets",
  "opening_target_refreshes",
  "seeding_batches",
  "seeding_proposals",
  "clients",
  "client_identifiers",
  "onboarding_plans",
  "fixed_assets",
  "fa_account_profiles",
  "fa_account_depreciation_policies",
  "fa_depreciation_authorities",
  "fa_arrears_resolutions",
  "fiscal_years",
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
 * pending set locks (alter table, create index, whole-table update, delete), minus the ones the
 * wave itself creates, plus the referenced side of every new foreign key. Parsed, not listed.
 */
function parsedLockedRelations() {
  const created = parsedCreatedTables();
  const set = new Set();
  const add = (t) => { if (t && !created.has(t)) set.add(t.replace(/^clara\./, "")); };
  for (const c of parsedCheckConstraints()) add(c.table);
  for (const f of parsedForeignKeys()) { add(f.table); add(f.references); }
  for (const c of parsedAddColumns()) add(c.table);
  for (const i of parsedIndexes()) add(i.table);
  for (const n of parsedSetNotNull()) add(n.table);
  for (const u of parsedWholeTableUpdates()) add(u.table);
  for (const d of parsedDeletes()) add(d.table);
  return [...set].sort();
}

// ==========================================================================================
// 2 · THE DATA PRECONDITIONS THE GENERIC EXTRACTORS CANNOT SEE. Each one lives inside a DO
//     block, so it has no statement shape to parse; what IS parsed is its expected value or its
//     own predicate, out of the file's refusal message or the file's own executed SELECT.
//
//     RE-DERIVED FOR WAVE 3 by reading all 21 files' EXECUTED text. Only four files read a real
//     row at apply time - 0282, 0288, 0290, 0291 - and only three of them can REFUSE on one.
//     The rest pin catalog shape (prosrc shas, ACLs, constraint text), which section 3's
//     fingerprint covers in one place for all of them.
// ==========================================================================================

/** The constraint names whose generated CHECK read defers to a hand check, and to which one. */
const CHECK_DEFERRALS = new Map();

function handChecks() {
  const L = (label, anchor) => literal(label, anchor);
  const list = [];
  const push = (id, guards, lit, sql, verdict) => list.push({ id, guards, lit, sql, verdict });

  // --- 0282 (#927): the three 0045 template write doors close -----------------------------
  // The file REFUSES if any clara.adjustment_templates row is not retired, and its own WHERE
  // clause is parsed out of the executed SELECT rather than retyped.
  const adjPred = (() => {
    for (const v of PENDING) {
      const m = /select\s+count\(\*\)::int\s+into\s+\w+\s+from\s+clara\.adjustment_templates\s+where\s+([^;]+);/i.exec(codeOf(v));
      if (m) return { version: v, pred: m[1].replace(/\s+/g, " ").trim() };
    }
    return null;
  })();
  if (adjPred) {
    push(
      "D-ADJ-TEMPLATES",
      `${adjPred.version.slice(0, 4)} prestate: it REFUSES while any clara.adjustment_templates row satisfies (${adjPred.pred}); ` +
        "a proposed or live template would be orphaned by closing propose/sign/run_adjustment_manual",
      `0 rows where ${adjPred.pred}`,
      `select case when to_regclass('clara.adjustment_templates') is null then -1
                   else (select count(*)::int from clara.adjustment_templates where ${adjPred.pred}) end as blocking,
              case when to_regclass('clara.adjustment_templates') is null then -1
                   else (select count(*)::int from clara.adjustment_templates) end as total`,
      (r) => ({
        ok: r.blocking === 0,
        detail: `rows satisfying the refusal predicate=${r.blocking} · clara.adjustment_templates total=${r.total}` +
          (r.blocking > 0 ? " - retire each one with clara.retire_adjustment_template (still open) BEFORE the window" : ""),
      }),
    );
  } else {
    gap("literal the 0045 template refusal predicate", "no pending file carries the adjustment_templates count/refusal shape");
  }

  // --- 0288 (#1012): the prior-GL seeding lane retirement ---------------------------------
  // The one file in this wave that REWRITES published rows. It retires NO row of the seeding
  // lane itself: clara.seeding_batches and clara.seeding_proposals are counted and must survive
  // untouched. What it rewrites is the document-capability REGISTRY, and that is where a hosted
  // row can block it.
  const priorGl = L("the prior_gl rows carrying browser_entrance", /prior_gl row\(s\) carry limits\.browser_entrance, not the (\d+)/i);
  const regFloor = L("the registry version floor this file republishes from", /the registry publishes version %, below #782''s (\d+)/i);
  const regRows = L("the registry row count", /the registry holds % rows, not (\d+)/i);
  if (priorGl && regFloor && regRows) {
    push(
      "D-REGISTRY-1012",
      `${priorGl.version} sectionD prestate: exactly ${priorGl.value} prior_gl rows carry limits.browser_entrance AND the basis sentence it rewrites; ` +
        `no row anywhere already carries limits.seeding_lane; zero rows OUTSIDE prior_gl carry browser_entrance; ` +
        `the registry publishes ONE distinct registry_version, at or above ${regFloor.value}; and it holds exactly ${regRows.value} rows`,
      `${priorGl.value} prior_gl / ${regRows.value} rows / one version >= ${regFloor.value}`,
      `select count(*)::int as rows,
              count(distinct registry_version)::int as versions,
              min(registry_version)::int as min_version,
              count(*) filter (where document_kind='prior_gl' and limits ? 'browser_entrance')::int as prior_gl_entrance,
              count(*) filter (where document_kind<>'prior_gl' and limits ? 'browser_entrance')::int as other_entrance,
              count(*) filter (where limits ? 'seeding_lane')::int as already_retired,
              count(*) filter (where document_kind='prior_gl')::int as prior_gl_rows,
              count(*) filter (where document_kind='prior_gl' and business_operation='stored_only')::int as prior_gl_stored_only
         from clara.document_capabilities`,
      (r) => ({
        ok:
          r.rows === Number(regRows.value) &&
          r.versions === 1 &&
          r.min_version >= Number(regFloor.value) &&
          r.prior_gl_entrance === Number(priorGl.value) &&
          r.other_entrance === 0 &&
          r.already_retired === 0,
        detail:
          `rows=${r.rows} distinct_versions=${r.versions} version=${r.min_version} ` +
          `prior_gl_with_browser_entrance=${r.prior_gl_entrance} (expected ${priorGl.value}) ` +
          `browser_entrance_outside_prior_gl=${r.other_entrance} seeding_lane_already=${r.already_retired} ` +
          `prior_gl_rows=${r.prior_gl_rows} of which stored_only=${r.prior_gl_stored_only}`,
      }),
    );
  }
  // The same file's basis-sentence arm: all N rows must carry the marker string it rewrites.
  // The marker is built by string concatenation in the file, so what is parsed is its FIRST
  // literal segment - enough to find the rows, and parsed rather than retyped.
  const marker = (() => {
    for (const v of PENDING) {
      const m = /position\(v_marker in basis\)\s*>\s*0/i.exec(codeOf(v));
      if (!m) continue;
      const decl = /v_marker\s+(?:constant\s+)?text\s*(?::=|=)\s*'([^']{20,200})'/i.exec(codeOf(v));
      if (decl) return { version: v, value: decl[1] };
    }
    return null;
  })();
  if (marker) {
    push(
      "D-REGISTRY-BASIS",
      `${marker.version.slice(0, 4)} sectionD prestate: every prior_gl row it rewrites must still carry 0228's own basis sentence, ` +
        "or 0228's text has DRIFTED and this file refuses rather than republishing over something it does not recognise",
      marker.value.slice(0, 48) + "...",
      `select count(*) filter (where document_kind='prior_gl' and limits ? 'browser_entrance')::int as entrance,
              count(*) filter (where document_kind='prior_gl' and limits ? 'browser_entrance'
                                 and position($m$${marker.value}$m$ in basis) > 0)::int as with_marker
         from clara.document_capabilities`,
      (r) => ({
        ok: r.entrance === r.with_marker,
        detail: `prior_gl rows with browser_entrance=${r.entrance}, of which carrying the 0228 basis sentence=${r.with_marker}`,
      }),
    );
  } else {
    gap("literal the 0228 basis sentence 0288 rewrites", "no pending file declares a v_marker text literal beside its `position(v_marker in basis)` test");
  }
  // The high-water agreement arm: 0288's OWN join, parsed out of it rather than rewritten, so
  // the read and the refusal ask exactly the same question.
  const hwQuery = (() => {
    for (const v of PENDING) {
      for (const m of codeOf(v).matchAll(/into\s+v_n\s+(from\s+clara\.document_capabilities[\s\S]*?where\s+[\s\S]*?);/gi)) {
        // ONE statement only: a capture that swallowed a `;` ran past its own statement and is
        // not a query. And it must be the high-water join, not any other census on the registry.
        if (/;/.test(m[1]) || /\braise\b/i.test(m[1])) continue;
        if (!/left\s+join\s+clara\.document_capability_version_high_water/i.test(m[1])) continue;
        return { version: v, body: m[1].replace(/\s+/g, " ").trim() };
      }
    }
    return null;
  })();
  if (hwQuery) {
    push(
      "D-REGISTRY-HIGHWATER",
      `${hwQuery.version.slice(0, 4)} sectionD prestate: every published (format, document_kind) pair must already carry a high-water mark that AGREES with ` +
        "the registry, because the whole-registry `registry_version + 1` then fires the monotonicity, high-water and uniformity triggers once per row",
      "0 disagreeing pairs",
      `select (select count(*)::int ${hwQuery.body}) as disagreeing,
              (select count(*)::int from clara.document_capabilities) as reg_rows,
              (select count(distinct (format, document_kind))::int from clara.document_capabilities) as reg_pairs,
              (select count(*)::int from clara.document_capability_version_high_water) as marks`,
      (r) => ({
        ok: r.disagreeing === 0 && r.reg_rows === r.reg_pairs,
        detail:
          `pairs whose high-water mark disagrees with the published registry=${r.disagreeing} · ` +
          `registry rows=${r.reg_rows} (distinct format x kind pairs=${r.reg_pairs}) · high-water marks=${r.marks}`,
      }),
    );
  } else {
    gap("literal the 0288 high-water agreement join", "no pending file carries the document_capabilities/high_water left join census");
  }
  push(
    "D-SEEDING-HISTORY",
    "0288 prestate/tail: the seeding lane's HISTORY is counted and must survive the file untouched. " +
      "It is a NOTICE, never a refusal, so no number of hosted seeding rows can block this migration; " +
      "the tail re-counts and refuses only if the count MOVED",
    "must not move",
    `select (select count(*)::int from clara.seeding_batches) as batches,
            (select count(*)::int from clara.seeding_proposals) as proposals,
            (select count(*)::int from clara.seeding_batches where state not in ('cancelled','completed')) as open_batches`,
    (r) => ({
      ok: true,
      detail:
        `seeding_batches=${r.batches} (open=${r.open_batches}) seeding_proposals=${r.proposals} - all stay readable; ` +
        "the three WRITE doors answer CLR34 seeding_lane_retired from this file on, and an open batch can still be cancelled or completed",
    }),
  );

  // --- 0290 (#857): the field_path CHECK on a table that may hold rows --------------------
  // The generated CHECK read cannot run (the CHECK calls a function this file creates), so the
  // file's OWN prestate query is parsed and run instead. This is the read 0290's own header
  // names as "the query a release preflight runs on hosted before applying this file".
  const regionPre = (() => {
    for (const v of PENDING) {
      const m = /into\s+v_bad\s+from\s+\(([\s\S]*?)\)\s*s\s+where\s+([\s\S]*?);/i.exec(codeOf(v));
      if (m) return { version: v, inner: m[1].replace(/\s+/g, " ").trim(), pred: m[2].replace(/\s+/g, " ").trim() };
    }
    return null;
  })();
  if (regionPre) {
    CHECK_DEFERRALS.set("ck_document_regions_field_path_grammar", "D-REGION-PATH");
    push(
      "D-REGION-PATH",
      `${regionPre.version.slice(0, 4)} prestate: it REFUSES if any stored clara.document_regions.field_path would be refused by the new CHECK. ` +
        "This runs the file's OWN predicate, parsed out of it, which is also the CHECK's own grammar",
      "0 non-conforming field_path values",
      `select (select count(*)::int from clara.document_regions) as regions,
              (select count(*)::int from (${regionPre.inner}) s where ${regionPre.pred}) as bad,
              (select count(*)::int from clara.document_regions where field_path is not null) as with_path`,
      (r) => ({
        ok: r.bad === 0,
        detail:
          `clara.document_regions rows=${r.regions} (with a field_path: ${r.with_path}) · non-conforming=${r.bad}` +
          (r.bad > 0
            ? " - the ADD CONSTRAINT will REFUSE; census them with the file's own query and repair the producer, or widen clara._assert_field_path in a NEW migration"
            : "") +
          ". COST: the CHECK is `clara._field_path_conforms(field_path)`, a PLPGSQL call, so validating it costs ONE function call per row and the table is held ACCESS EXCLUSIVE for the whole scan",
      }),
    );
  } else {
    gap("literal the 0290 field_path prestate predicate", "no pending file carries the `into v_bad from ( ... ) s where ...` census");
  }
  push(
    "D-REGION-INSERT-ACL",
    "0290 prestate: it REFUSES unless clara_fn_owner is the ONLY role holding INSERT on clara.document_regions - " +
      "the CHECK is enforced by an UNGRANTED function, and that is only sound while the owner is the sole writer",
    "{clara_fn_owner}",
    `select coalesce(string_agg(distinct grantee, ',' order by grantee), '(none)') as inserters
       from information_schema.role_table_grants
      where table_schema='clara' and table_name='document_regions' and privilege_type='INSERT'`,
    (r) => ({ ok: r.inserters === "clara_fn_owner", detail: `INSERT held by {${r.inserters}}` }),
  );

  // --- 0291 (#990): three nullable columns, one FK and three CHECKs on a live table --------
  push(
    "D-BSL-SHAPE",
    "0291 prestate: the three citation columns must be wholly absent (first apply) or wholly present with the splice (redo); " +
      "half of either is refused. The three CHECKs and the FK then scan the WHOLE table",
    "3 columns absent",
    `select count(*) filter (where column_name='citation_extraction_id')::int as ext,
            count(*) filter (where column_name='citation_page')::int as page,
            count(*) filter (where column_name='citation_region')::int as region,
            (select count(*)::int from clara.bank_statement_lines) as rows,
            (select pg_size_pretty(pg_total_relation_size('clara.bank_statement_lines'))) as size
       from information_schema.columns
      where table_schema='clara' and table_name='bank_statement_lines'`,
    (r) => ({
      ok: r.ext === r.page && r.page === r.region,
      detail:
        `citation_extraction_id=${r.ext} citation_page=${r.page} citation_region=${r.region} · ` +
        `clara.bank_statement_lines rows=${r.rows} (${r.size}) - ACCESS EXCLUSIVE seven times, four whole-table scans ` +
        "(one FK validate plus three ADD CONSTRAINT CHECK), every one trivially satisfied because the columns are created NULL",
    }),
  );

  // --- 0277 (#932): two nullable columns plus a composite FK on the live register ----------
  push(
    "D-FA-REGISTER-SHAPE",
    "0277 §A: `add column depreciation_policy_id` / `depreciation_policy_version` on clara.fixed_assets and a composite FK to the NEW " +
      "policy relation; each piece is guarded by its own `if not exists`, so a redo is safe over its old effect",
    "both columns absent, FK absent",
    `select (select count(*) filter (where column_name='depreciation_policy_id')::int from information_schema.columns
              where table_schema='clara' and table_name='fixed_assets') as col_id,
            (select count(*) filter (where column_name='depreciation_policy_version')::int from information_schema.columns
              where table_schema='clara' and table_name='fixed_assets') as col_version,
            (select count(*)::int from pg_constraint
              where conrelid='clara.fixed_assets'::regclass and conname='fk_fa_depreciation_policy_congruent') as fk,
            (select count(*)::int from clara.fixed_assets) as rows,
            (select count(*)::int from clara.fa_account_profiles) as profiles,
            (select count(*)::int from clara.fa_depreciation_authorities) as authorities`,
    (r) => ({
      ok: r.col_id === r.col_version && r.fk === (r.col_id > 0 ? r.fk : 0) && r.col_id === 0 && r.fk === 0,
      detail:
        `depreciation_policy_id=${r.col_id} depreciation_policy_version=${r.col_version} fk=${r.fk} · ` +
        `clara.fixed_assets rows=${r.rows} fa_account_profiles=${r.profiles} fa_depreciation_authorities=${r.authorities} ` +
        "- the FK validates the whole register, trivially, because the referencing column is created NULL on every existing row",
    }),
  );

  // --- 0279 / 0293 (#975): the run door gains a FOURTH outcome, `parked` -------------------
  // This wave's own "branch the rig cannot reach". A seeded rig has no closing/closed fiscal
  // year with unmet depreciation, so the parked arm has never fired anywhere; and the SERVING
  // runtime image does not understand it (see the runbook's deploy-order section).
  push(
    "D-FA-PARKED",
    "0279/0293: clara.run_depreciation_period and clara.run_depreciation_manual can now answer {status:'parked'} instead of posting, " +
      "when a period's charge would fold a CLOSING or CLOSED fiscal year's months forward and nobody has judged their materiality. " +
      "The SERVING runtime counts a parked run as POSTED and does not break its chase - so this read decides how urgent the runtime release is",
    "n/a",
    `select (select count(*)::int from clara.fixed_assets) as assets,
            (select count(*)::int from clara.fixed_assets where status='active') as active_assets,
            (select count(*)::int from clara.fa_depreciation_authorities where status='live') as live_authorities,
            (select coalesce(string_agg(s, ',' order by s), '(none)')
               from (select status || '=' || count(*)::text as s from clara.fiscal_years group by status) x) as fiscal_years,
            (select count(*)::int from clara.fiscal_years where status in ('closing','closed')) as closed_years,
            (select count(*)::int from pg_class where oid = to_regclass('clara.fa_arrears_resolutions')) as resolutions_relation`,
    (r) => ({
      ok: true,
      detail:
        `fixed_assets=${r.assets} (active ${r.active_assets}) live depreciation authorities=${r.live_authorities} ` +
        `fiscal_years {${r.fiscal_years}} closing-or-closed=${r.closed_years} · clara.fa_arrears_resolutions relation present=${r.resolutions_relation} (0 on a first apply, since 0279 creates it). ` +
        (r.live_authorities === 0 || r.closed_years === 0
          ? "NO client can reach the parked branch today: the old runtime's mis-count cannot fire during the window"
          : "A client CAN reach the parked branch: the old runtime would count a parked run as posted and re-drive it up to its per-client cap. Release the runtime promptly and keep the machine STOPPED across the migrate"),
    }),
  );

  // --- 0274 (#982): TIN becomes a resolution key -------------------------------------------
  // Not an apply-time failure mode (the index is NOT unique), but a BEHAVIOUR change decided by
  // hosted rows: where two live counterparties of one client share a normalised TIN, the
  // resolver stops and asks instead of resolving. The predicate is the file's own index
  // predicate, parsed from it.
  const tinIdx = parsedIndexes().find((i) => /tin/i.test(i.name));
  if (tinIdx) {
    push(
      "D-TIN-CONFLICT",
      `${tinIdx.version.slice(0, 4)}: the new identifier tier resolves a trade-invoice party by normalised TIN over ` +
        `${tinIdx.table}${tinIdx.pred ? ` where ${tinIdx.pred}` : ""}. Two live rows of one client on one TIN is an IDENTIFIER CONFLICT the door hands to a person`,
      "facts only",
      `select count(*)::int as rows_in_index,
              (select count(*)::int from (
                 select 1 from ${tinIdx.table}
                  ${tinIdx.pred ? `where ${tinIdx.pred}` : ""}
                  group by ${tinIdx.cols}
                 having count(*) > 1) d) as colliding_keys
         from ${tinIdx.table}${tinIdx.pred ? ` where ${tinIdx.pred}` : ""}`,
      (r) => ({
        ok: true,
        detail:
          `rows entering ${tinIdx.name}=${r.rows_in_index} · (client, kind, normalised tin) keys already held by more than one live row=${r.colliding_keys}. ` +
          "The index is NOT unique, so neither number can fail the migration; a non-zero collision count is what the new arm will ask a person about",
      }),
    );
  }

  // --- 0287 (#899): the name-collision wall moves to the door that creates a client ---------
  push(
    "D-CLIENT-BIRTH-WALL",
    "0287: clara.begin_client_onboarding and clara.open_client_onboarding now enforce the two-or-more name-family collision wall " +
      "that only clara.client_identity_candidates enforced before. No existing row is touched; what changes is what the NEXT create does",
    "facts only",
    `select (select count(*)::int from clara.clients) as clients,
            (select count(*)::int from clara.clients where status <> 'archived') as live_clients,
            (select count(*)::int from (
               select firm_id, lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) as fam, count(*) n
                 from clara.clients where status <> 'archived'
                group by 1,2 having count(*) > 1) d) as families_with_two_or_more`,
    (r) => ({
      ok: true,
      detail:
        `clients=${r.clients} (live ${r.live_clients}); firm x squashed-name families already holding two or more live clients=${r.families_with_two_or_more}. ` +
        "Informational: the wall applies to a NEW create, never to rows already there. The normalisation here is an approximation of the door's own; " +
        "the door is the authority",
    }),
  );

  // --- 0275 (#1007): the duplicate probe's premise about clara.trade_invoices ---------------
  push(
    "D-TI-REFERENCE",
    "0275 prestate: it REFUSES if a UNIQUE index already constrains clara.trade_invoices.reference - the probe was written for a lane " +
      "where a reference is free to repeat, and it WARNS rather than refusing",
    "no unique index on reference",
    `select coalesce(count(*) filter (where x.indisunique and pg_get_indexdef(i.oid) like '%(reference%'), 0)::int as unique_on_reference,
            (select count(*)::int from clara.trade_invoices) as invoices
       from pg_index x join pg_class i on i.oid = x.indexrelid
       join pg_class c on c.oid = x.indrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='clara' and c.relname='trade_invoices'`,
    (r) => ({ ok: r.unique_on_reference === 0, detail: `unique indexes over (reference...)=${r.unique_on_reference} · clara.trade_invoices rows=${r.invoices}` }),
  );

  // --- 0273 (#921): three granted doors lose their human EXECUTE ---------------------------
  // Both arms are PARSED, never guessed: the WRITE arm from the file's own REVOKE statements,
  // the surviving READ arm from the signature literals its prestate declares and demands stay
  // granted. (A guessed signature is how a preflight quietly checks nothing: an earlier draft of
  // this check named two doors that do not exist and reported "1 of 3 present" as a pass.)
  const revokedDoors = (() => {
    const out = new Set();
    const re = /revoke\s+execute\s+on\s+function\s+(clara\.[a-z_0-9]+\([^)]*\))\s+from\s+clara_authenticated/gi;
    for (const v of PENDING) {
      let m;
      const code = execOf(v);
      while ((m = re.exec(code))) out.add(m[1].replace(/\s+/g, ""));
      re.lastIndex = 0;
    }
    return [...out];
  })();
  const keptDoors = (() => {
    const out = new Set();
    const re = /v_(?:revoke_fn|list|get)\s+text\s*:=\s*'(clara\.[a-z_0-9]+\([^)]*\))'/gi;
    for (const v of PENDING) {
      let m;
      const code = codeOf(v);
      while ((m = re.exec(code))) out.add(m[1].replace(/\s+/g, ""));
      re.lastIndex = 0;
    }
    return [...out];
  })();
  if (revokedDoors.length && keptDoors.length) {
    const vals = (arr, arm) => arr.map((s) => `('${s.replace(/'/g, "''")}','${arm}')`).join(",");
    push(
      "D-VENDOR-GRANTS",
      `0273 prestate: the ${revokedDoors.length} write door(s) it revokes must be in the SAME grant state (a partial prior revoke is not a state it repairs), ` +
        `the ${keptDoors.length} surviving READ door(s) must still be granted to clara_authenticated, and PUBLIC must hold EXECUTE on none of them`,
      `${revokedDoors.length} granted / ${keptDoors.length} granted / 0 PUBLIC`,
      `with d(sig, arm) as (values ${vals(revokedDoors, "write")},${vals(keptDoors, "read")})
       select count(*) filter (where arm='write')::int as write_present,
              count(*) filter (where arm='write' and human)::int as write_granted,
              count(*) filter (where arm='read')::int as read_present,
              count(*) filter (where arm='read' and human)::int as read_granted,
              count(*) filter (where pub)::int as public_any
         from (select arm,
                      coalesce(has_function_privilege('clara_authenticated', sig, 'execute'), false) as human,
                      coalesce(has_function_privilege('public', sig, 'execute'), false) as pub
                 from d where to_regprocedure(sig) is not null) s`,
      (r) => ({
        ok:
          r.write_present === revokedDoors.length &&
          r.read_present === keptDoors.length &&
          r.write_granted === r.write_present &&
          r.read_granted === r.read_present &&
          r.public_any === 0,
        detail:
          `write doors resolving=${r.write_present}/${revokedDoors.length} granted to clara_authenticated=${r.write_granted} (must be all, and all alike) · ` +
          `read doors resolving=${r.read_present}/${keptDoors.length} granted=${r.read_granted} (must be all) · PUBLIC holds EXECUTE on ${r.public_any}`,
      }),
    );
  } else {
    gap("literal the 0273 vendor-binding door roster", "no pending file carries both a `revoke execute ... from clara_authenticated` and the surviving read-door literals");
  }

  // --- 0284 (#936): the correction door's relation premise ----------------------------------
  push(
    "D-ACCRUAL-CORRECTION",
    "0284 prestate: clara.accrual_adjustments must already carry corrects_accrual_id, corrected_by_accrual_id and " +
      "uq_accrual_adjustments_corrects (0222). The new door writes a SECOND revision row per corrected accrual",
    "3 present",
    `select (select count(*) filter (where column_name in ('corrects_accrual_id','corrected_by_accrual_id'))::int
               from information_schema.columns where table_schema='clara' and table_name='accrual_adjustments') as cols,
            (select count(*)::int from pg_class where oid = to_regclass('clara.uq_accrual_adjustments_corrects')) as uq,
            (select count(*)::int from clara.accrual_adjustments) as rows`,
    (r) => ({ ok: r.cols === 2 && r.uq === 1, detail: `columns=${r.cols}/2 uq_accrual_adjustments_corrects=${r.uq} · clara.accrual_adjustments rows=${r.rows}` }),
  );

  // --- 0286 (#986): the opening re-read door's premise --------------------------------------
  push(
    "D-OPENING-PREMISE",
    "0286 prestate: clara.opening_tb_targets must carry uq_opening_tb_targets_key and uq_opening_tb_targets_extraction_fact_0017, " +
      "and clara.documents must carry authoritative_extraction_id. The new door RETIRES targets at run time, never at apply time",
    "2 uniques + 1 column",
    `select (select count(*)::int from pg_class where oid = to_regclass('clara.uq_opening_tb_targets_key')) as uq_key,
            (select count(*)::int from pg_class where oid = to_regclass('clara.uq_opening_tb_targets_extraction_fact_0017')) as uq_fact,
            (select count(*) filter (where column_name='authoritative_extraction_id')::int from information_schema.columns
              where table_schema='clara' and table_name='documents') as doc_col,
            (select count(*)::int from clara.opening_tb_targets) as targets`,
    (r) => ({
      ok: r.uq_key === 1 && r.uq_fact === 1 && r.doc_col === 1,
      detail: `uq_opening_tb_targets_key=${r.uq_key} uq_opening_tb_targets_extraction_fact_0017=${r.uq_fact} documents.authoritative_extraction_id=${r.doc_col} · clara.opening_tb_targets rows=${r.targets}`,
    }),
  );

  // --- 0283 (#929): the advisory's retirement and the three plan writers --------------------
  push(
    "D-PLAN-OVERLAP",
    "0283 drops clara._plan_overlap_warning(uuid,jsonb) and recuts the three plan writers to take the client advisory rung " +
      "ABOVE any plan row lock. Nothing is retired in clara.adjustment_templates; the arm that SCANNED it is",
    "facts only",
    `select (select count(*)::int from clara.accounting_plans) as plans,
            (select count(*)::int from clara.accounting_plans where status in ('active','paused')) as live_plans,
            (select count(*)::int from clara.accounting_plan_revisions) as revisions,
            (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='clara' and p.proname='_plan_overlap_warning') as advisory_bodies`,
    (r) => ({
      ok: true,
      detail: `accounting_plans=${r.plans} (live ${r.live_plans}) revisions=${r.revisions} · clara._plan_overlap_warning bodies today=${r.advisory_bodies} (0283 leaves exactly one, the one-argument form)`,
    }),
  );

  return list;
}

// ==========================================================================================
// 3 · THE ESTATE FINGERPRINT. Everything a migration can define, flattened into one ordered
//     map of key -> value so a difference prints with both sides.
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
 * ROLE ATTRIBUTES AND ROLE MEMBERSHIPS ARE ENVIRONMENT FACTS (wave-2 as-run lesson). The rig is
 * a trust-auth cluster the integrator built; hosted is a managed Supabase estate. Their role
 * catalogs differ for reasons NO migration in this wave touches - LOGIN on the *_login roles,
 * the storage role and its memberships, the managed `authenticated` -> `clara_authenticated`
 * grant, `postgres` -> `clara_*`. Wave 2 STOPPED on 14 of these and the operator overruled every
 * one at window time. They are printed here with both sides, under `env`, and never counted.
 *
 * A migration that MEANT to change a role would show up as a fn/rel/grant difference as well,
 * which is still a STOP - so this widens no wall that a wave-3 file actually touches. Checked:
 * zero `create role` / `alter role` / `grant ... to clara_` role-level statements across the 21.
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
  const PIN_EVIDENCE = /[0-9a-f]{64}|DRIFTED|pre-image|pinned|byte-identical|pg_get_constraintdef|pg_get_indexdef|pg_get_triggerdef|pg_get_viewdef|is distinct from/i;
  const names = new Map();
  const pinned = new Map();
  const DDL_RE =
    /^[ \t]*(?:set\s+role\b|create\s+(?:or\s+replace\s+)?(?:constraint\s+)?(?:function|table|trigger|index|unique\s+index|view|materialized\s+view|type|policy|schema|sequence)\b|alter\s+table\b|drop\s+(?:function|index)\b|update\s+clara\.|insert\s+into\s+clara\.|delete\s+from\s+clara\.|grant\s+|revoke\s+)/im;
  const add = (map, id, v) => { if (!map.has(id)) map.set(id, new Set()); map.get(id).add(v); };
  for (const v of PENDING) {
    const code = codeOf(v);
    const m = DDL_RE.exec(code);
    const prestate = m ? code.slice(0, m.index) : code;
    for (const x of code.matchAll(/\b([a-z_][a-z_0-9]{3,})\b/g)) add(names, x[1], v);
    for (const x of prestate.matchAll(/\b([a-z_][a-z_0-9]{3,})\b/g)) {
      const from = Math.max(0, x.index - PIN_WINDOW);
      if (PIN_EVIDENCE.test(prestate.slice(from, x.index + PIN_WINDOW))) add(pinned, x[1], v);
    }
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
  for (const rel of relSet) say(`     ${rel.padEnd(42)} target=${String(target.counts[rel] ?? "<absent>").padStart(9)}  baseline=${String(baseline.counts[rel] ?? "<absent>").padStart(9)}`);
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
  say("== generated reads: ADD CONSTRAINT ... CHECK on an existing table ==");
  const hands = handChecks(); // populates CHECK_DEFERRALS
  for (const c of parsedCheckConstraints()) {
    const def = CHECK_DEFERRALS.get(c.name);
    if (def) say(`  ${c.version}  ${c.table} ${c.name}\n      DEFERRED to ${def} (the CHECK calls a function this wave creates)`);
    else if (created.has(c.table)) say(`  ${c.version}  ${c.table} ${c.name}\n      (table created by this wave - no existing row to fail)`);
    else say(`  ${c.version}  ${c.table} ${c.name}\n      select count(*) from ${c.table} where not (${c.expr})`);
  }
  say("== generated reads: ADD CONSTRAINT ... FOREIGN KEY on an existing table ==");
  const addedCols = parsedAddColumns();
  for (const f of parsedForeignKeys()) {
    const newCols = f.cols.filter((c) => addedCols.some((a) => a.table === f.table && a.column === c));
    say(
      `  ${f.version}  ${f.table} ${f.name} (${f.cols.join(", ")}) references ${f.references}\n` +
        `      ${newCols.length ? `${newCols.length}/${f.cols.length} referencing column(s) are ADDED by this wave (NULL on every existing row) - build cost only` : "PRE-EXISTING referencing columns - needs a real read"}`,
    );
  }
  say("== generated reads: ADD COLUMN on an existing relation ==");
  for (const c of addedCols) say(`  ${c.version}  ${c.table}.${c.column}${created.has(c.table) ? " (on a relation this wave creates)" : "  -> must be ABSENT before the window"}`);
  say("== generated reads: CREATE [UNIQUE] INDEX ==");
  for (const i of parsedIndexes()) {
    if (i.unique) say(`  ${i.version}  ${i.name} UNIQUE on ${i.table} (${i.cols})${i.pred ? ` where ${i.pred}` : ""}\n      select count(*) from (select 1 from ${i.table}${i.pred ? ` where ${i.pred}` : ""} group by ${i.cols} having count(*) > 1) d`);
    else say(`  ${i.version}  ${i.name} on ${i.table} (${i.cols})${i.pred ? ` where ${i.pred}` : ""}\n      select count(*) from ${i.table}${i.pred ? ` where ${i.pred}` : ""}   (build cost only)`);
  }
  const nn = parsedSetNotNull();
  say(`== generated reads: SET NOT NULL on an existing column == ${nn.length ? "" : "(none in this wave)"}`);
  for (const n of nn) say(`  ${n.version}  select count(*) from ${n.table} where ${n.column} is null`);
  const val = parsedValidate();
  say(`== generated reads: VALIDATE CONSTRAINT == ${val.length ? "" : "(none in this wave)"}`);
  for (const v of val) say(`  ${v.version}  ${v.table} ${v.name}`);
  const wu = parsedWholeTableUpdates();
  say(`== generated reads: WHOLE-TABLE UPDATE (no where clause) == ${wu.length ? "" : "(none in this wave)"}`);
  for (const u of wu) say(`  ${u.version}  update ${u.table} set ${u.set}\n      select count(*) from ${u.table}   (rows rewritten, each firing every row trigger)`);
  const dl = parsedDeletes();
  say(`== generated reads: top-level DELETE == ${dl.length ? "" : "(none in this wave)"}`);
  for (const d of dl) say(`  ${d.version}  delete from ${d.table} ${d.where}`);
  say("== hand-written data preconditions (their expected values parsed from the files) ==");
  for (const h of hands) say(`  ${h.id.padEnd(22)} expect=${String(h.lit).slice(0, 60)}\n      ${h.guards}`);
  say("== relations the quiescence census watches (parsed from the executed statements) ==");
  say("  " + parsedLockedRelations().join(", "));
  say("== reference relations counted in the fingerprint ==");
  say("  " + parsedCountRelations().join(", "));
}

async function main() {
  // --- offline plan -----------------------------------------------------------------------
  if (PLAN_ONLY) {
    const fb = FRONTIER_BEFORE_ARG || (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")).frontier_before : null);
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
              left(version(), 24) as ver, current_user as who, clock_timestamp() as db_clock`,
    )
  )[0];
  say(`== server == db=${ident.db} port=${ident.port} addr=${ident.addr} ${ident.ver} user=${ident.who} clock=${ident.db_clock.toISOString?.() ?? ident.db_clock}`);
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
  if (!frontierBefore && POST && existsSync(STATE_FILE)) frontierBefore = JSON.parse(readFileSync(STATE_FILE, "utf8")).frontier_before;
  PENDING = frontierBefore ? VERSIONS.filter((v) => v > frontierBefore) : [];

  const appliedRows = await q("select version, checksum from clara.schema_migrations order by version");

  if (ONLY_CENSUS) {
    await census(soft);
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
    say(`  after the migrate the ledger should read ${led.applied} + ${PENDING.length} = ${led.applied + PENDING.length} / ${PENDING[PENDING.length - 1] ?? "<none>"}`);
    if (!NO_STATE) {
      writeFileSync(
        STATE_FILE,
        JSON.stringify({ frontier_before: led.frontier, applied_before: led.applied, pending: PENDING, taken_at: new Date().toISOString() }, null, 1),
      );
      say(`  state written to ${STATE_FILE} (so --post can re-derive the arithmetic)`);
    }

    // ---- (b) fingerprint ------------------------------------------------------------------
    const fp = await buildFingerprint(q, parsedCountRelations());
    if (BASELINE) compareFingerprints(fp, JSON.parse(readFileSync(BASELINE, "utf8")), `baseline ${BASELINE}`);
    else note("no --baseline given: the estate fingerprint comparison was NOT run", `${Object.keys(fp.structure).length} keys read`);

    // ---- (c) data preconditions -----------------------------------------------------------
    await dataPreconditions(q);

    // ---- (d) quiescence census ------------------------------------------------------------
    await census(soft);
  } else {
    // ---- (e) post ------------------------------------------------------------------------
    say("== (e) post-migrate ==");
    if (!frontierBefore) {
      note("neither --frontier-before nor a state file: the 267 + N arithmetic could not be re-derived");
      check("the ledger equals the directory", led.applied === FILES.length && led.frontier === VERSIONS[VERSIONS.length - 1], `${led.applied} applied vs ${FILES.length} files, frontier ${led.frontier} vs ${VERSIONS[VERSIONS.length - 1]}`);
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
    check(`every one of the ${PENDING.length} new migrations has a ledger row at its file checksum`, missing === 0 && wrong === 0, `missing=${missing} checksum-mismatch=${wrong}`);
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
    const sql = `select case when to_regclass('${c.table}') is null then -1
                             else (select count(*)::int from ${c.table} where not (${c.expr})) end as bad`;
    let rows;
    try {
      rows = await q(sql);
    } catch (e) {
      // 42703: the CHECK names a column that does not exist YET. That is lawful exactly when a
      // pending file ADDS it - a brand-new nullable column with no default leaves every existing
      // row NULL, and these CHECKs all admit NULL. Proved by parsing the add, never assumed.
      const miss = /column "([a-z_0-9]+)" does not exist/i.exec(String(e.message || ""));
      const addedBy = miss ? parsedAddColumns().filter((a) => a.table === c.table && a.column === miss[1]).map((a) => a.version) : [];
      if (addedBy.length) {
        check(
          `${c.version} ${c.name} on ${c.table}`,
          true,
          `the CHECK names ${c.table}.${miss[1]}, which ${[...new Set(addedBy)].join(", ")} adds in the same run; every existing row is NULL and the CHECK admits NULL`,
        );
      } else {
        gap(`${c.version} ${c.name}`, `the generated read did not run: ${e.code || e.message}`);
      }
      continue;
    }
    const bad = rows[0].bad;
    if (bad < 0) { note(`${c.version} ${c.name}`, `${c.table} does not exist yet - the constraint rides a table this wave creates`); continue; }
    check(`${c.version} ${c.name} on ${c.table}`, bad === 0, `${bad} existing row(s) would fail  ·  check (${c.expr.slice(0, 120)}${c.expr.length > 120 ? "..." : ""})`);
  }

  say("  -- ADD CONSTRAINT ... FOREIGN KEY on an existing table (parsed from the files) --");
  const addedCols = parsedAddColumns();
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
      `${fromThisWave.length} of ${f.cols.length} referencing column(s) are created by this wave and are NULL on every existing row, so MATCH SIMPLE satisfies the FK trivially; ` +
        `the VALIDATE scan still reads ${rows[0].n} row(s) under ACCESS EXCLUSIVE`,
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
    check(`${a.version} add column ${a.table}.${a.column}`, rows[0].n === 0, rows[0].n === 0 ? "absent, as a first apply requires" : `ALREADY PRESENT (${rows[0].n}) - this is a redo or a half-applied estate`);
  }

  say("  -- CREATE [UNIQUE] INDEX (parsed from the files) --");
  for (const i of parsedIndexes()) {
    if (created.has(i.table)) { note(`${i.version} ${i.name} on ${i.table}`, "the relation is CREATED by this wave - the index builds over zero rows"); continue; }
    if (i.unique) {
      const sql = `select case when to_regclass('${i.table}') is null then -1
                               else (select count(*)::int from (select 1 from ${i.table}${i.pred ? ` where ${i.pred}` : ""} group by ${i.cols} having count(*) > 1) d) end as dupes`;
      let rows;
      try { rows = await q(sql); } catch (e) { gap(`${i.version} ${i.name}`, `the generated read did not run: ${e.code || e.message}`); continue; }
      if (rows[0].dupes < 0) { note(`${i.version} ${i.name}`, `${i.table} does not exist yet`); continue; }
      check(
        `${i.version} ${i.name} UNIQUE on ${i.table} (${i.cols})${i.pred ? ` where ${i.pred}` : ""}`,
        rows[0].dupes === 0,
        `${rows[0].dupes} key(s) already hold more than one row`,
      );
    } else {
      // A predicate or column list naming a column this wave ADDS cannot be read yet, and that
      // is lawful: every existing row will be NULL in it, so ZERO rows enter the index and the
      // build is free. Proved by parsing the add, never assumed.
      const newCols = addedCols.filter(
        (a) => a.table === i.table && new RegExp(`\\b${a.column}\\b`).test(`${i.cols} ${i.pred ?? ""}`),
      );
      const totalRows = await q(`select case when to_regclass('${i.table}') is null then -1 else (select count(*)::int from ${i.table}) end as total`).catch(() => [{ total: -1 }]);
      if (newCols.length) {
        note(
          `${i.version} ${i.name} on ${i.table}`,
          `the index keys on ${[...new Set(newCols.map((c) => c.column))].join(", ")}, which ${[...new Set(newCols.map((c) => c.version))].join(", ")} adds in the same run; ` +
            `every one of the ${totalRows[0].total} existing row(s) is NULL there, so ZERO rows enter the index - build cost only`,
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

  const wu = parsedWholeTableUpdates();
  say(`  -- WHOLE-TABLE UPDATE -- ${wu.length ? "" : "(none in this wave)"}`);
  for (const u of wu) {
    const rows = await q(`select case when to_regclass('${u.table}') is null then -1 else (select count(*)::int from ${u.table}) end as n`).catch(() => [{ n: -1 }]);
    note(`${u.version} update ${u.table} set ${u.set.slice(0, 60)}`, `${rows[0].n} row(s) rewritten, each firing every row-level trigger on the relation`);
  }
  const dl = parsedDeletes();
  say(`  -- top-level DELETE -- ${dl.length ? "" : "(none in this wave)"}`);
  for (const d of dl) note(`${d.version} delete from ${d.table}`, d.where.slice(0, 120));

  say("  -- assertions inside a prestate or tail DO block (expected values parsed from the files) --");
  for (const h of hands) {
    let rows;
    try { rows = await q(h.sql); } catch (e) { gap(h.id, `${h.guards} :: the read did not run: ${e.code || e.message}`); continue; }
    const v = h.verdict(rows[0]);
    check(`${h.id} ${h.guards.slice(0, 150)}${h.guards.length > 150 ? "..." : ""}`, v.ok, v.detail);
  }
}

// ==========================================================================================
// 6 · THE QUIESCENCE CENSUS - what a stopped machine would interrupt
// ==========================================================================================
async function census(soft) {
  say("== (d) quiescence census ==");
  say("  agent_tasks non-terminal by kind/status:\n  " + fmt(await soft(
    `select kind, status, count(*)::int from clara.agent_tasks
      where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2`)));
  say("  agent_tasks unbound (workflow_run_id null) and LIVE - the preflight's second census:\n  " + fmt(await soft(
    `select kind, status, count(*)::int from clara.agent_tasks
      where workflow_run_id is null and status in ('queued','running','held','awaiting_input','stopping') group by 1,2 order by 1,2`)));
  say("  accounting_work non-terminal:\n  " + fmt(await soft(
    `select status, count(*)::int from clara.accounting_work
      where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
  say("  document_processing_tasks by lane/status:\n  " + fmt(await soft(
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
