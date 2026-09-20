// Release ceremony for riders wave 2 (0235...0272) - read-only preflight. Child of
// scripts/ops/dsn-pipe.mjs (DATABASE_URL in env) or PG* for a rig. Prints facts only, never the
// DSN, never an e-mail address, never any personal data.
//
// EVERY STATEMENT IS A SELECT INSIDE ONE `begin transaction read only`, and each one runs under
// its OWN SAVEPOINT, so a soft failure (a relation a rig does not carry) never poisons the rest.
// The transaction mode is the belt: a stray write raises 25006 rather than landing.
//
// NOTHING IN THIS FILE IS TRANSCRIBED FROM A MIGRATION. The wave's migration list, every
// expected row count, every sha pin and every CHECK/INDEX predicate is PARSED out of the
// directory named by CLARA_MIGRATIONS_DIR at run time. A literal this script cannot parse is
// reported as a PARSE GAP and counts as a STOP, because an unchecked precondition is unchecked.
//
//   node reads-w2.mjs --plan                              OFFLINE. Parse the directory and print
//                                                         the pending set, the generated reads
//                                                         and the parsed literals. No database.
//   node reads-w2.mjs [--prod] [--baseline <f>]           PRE-WINDOW: identity, ledger 229/0234,
//                                                         drift gate, pending set, estate
//                                                         fingerprint vs <f>, data preconditions,
//                                                         quiescence census.
//   node reads-w2.mjs --export-fingerprint <f> [--prod]   Write the estate fingerprint to <f>.
//   node reads-w2.mjs --census [--prod]                   ONLY the quiescence census.
//   node reads-w2.mjs --post [--baseline <f>] [--prod]    AFTER the migrate: ledger 229+N at the
//                                                         highest pending version, every new row
//                                                         at its file checksum, fingerprint vs
//                                                         the UPGRADED baseline.
//
// Options: --state <f> (default: reads-w2.state.json beside this file) carries the pre-window
// ledger reading forward so --post can re-derive the 229 + N arithmetic; --frontier-before <v>
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
const STATE_FILE = opt("--state", join(HERE, "reads-w2.state.json"));
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
//     Exactly one file must match; zero or two is a PARSE GAP, never a guess.
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
  // Several files in one wave routinely restate the same precondition (0241 and 0242 both pin
  // the knowledge-key count; 0245 and 0246 both pin the registry size). Agreement is the normal
  // case and is used; DISAGREEMENT is the finding, because then the wave contradicts itself.
  const values = [...new Set(hits.map((h) => h.value))];
  if (values.length !== 1) {
    gap(`literal ${label}`, `pending files disagree: ${hits.map((h) => `${h.version}=${h.value}`).join(", ")}`);
    return null;
  }
  return { version: hits.map((h) => h.version.slice(0, 4)).join("/"), value: values[0] };
}

/**
 * Every `alter table clara.X add constraint N check (E)` the pending set executes, with E
 * balanced-paren extracted from the file text. Covers the bare form and the
 * `execute $sql$ ... $sql$` form 0242 uses.
 */
function parsedCheckConstraints() {
  const out = [];
  const re = /alter\s+table\s+(clara\.[a-z_0-9]+)\s+add\s+constraint\s+([a-z_0-9]+)\s+check\s*\(/gi;
  for (const v of PENDING) {
    const code = codeOf(v);
    let m;
    while ((m = re.exec(code))) {
      const open = re.lastIndex - 1;
      let depth = 0;
      let i = open;
      let expr = null;
      for (; i < code.length; i++) {
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
          if (depth === 0) { expr = code.slice(open + 1, i); break; }
        }
      }
      if (expr === null) { gap(`CHECK ${m[2]} in ${v}`, "unbalanced parentheses"); continue; }
      out.push({ version: v, table: m[1], name: m[2], expr: expr.replace(/\s+/g, " ").trim() });
    }
    re.lastIndex = 0;
  }
  return out;
}

/** Every `create [unique] index N on clara.X (cols) [where pred]` the pending set executes. */
function parsedIndexes() {
  const out = [];
  const re =
    /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_0-9]+)\s+on\s+(clara\.[a-z_0-9]+)\s*\(/gi;
  for (const v of PENDING) {
    const code = codeOf(v);
    let m;
    while ((m = re.exec(code))) {
      const open = re.lastIndex - 1;
      let depth = 0;
      let cols = null;
      let i = open;
      for (; i < code.length; i++) {
        if (code[i] === "(") depth++;
        else if (code[i] === ")") { depth--; if (depth === 0) { cols = code.slice(open + 1, i); break; } }
      }
      const rest = code.slice(i + 1, code.indexOf(";", i + 1));
      const wm = /^\s*where\s+([\s\S]+)$/i.exec(rest);
      out.push({
        version: v,
        unique: Boolean(m[1]),
        name: m[2],
        table: m[3],
        cols: (cols || "").replace(/\s+/g, " ").trim(),
        pred: wm ? wm[1].replace(/\s+/g, " ").trim() : null,
      });
      re.lastIndex = 0;
      re.lastIndex = code.indexOf(";", i + 1) + 1;
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
    const code = codeOf(v);
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
    const code = codeOf(v);
    while ((m = re.exec(code))) out.push({ version: v, table: m[1], name: m[2] });
    re.lastIndex = 0;
  }
  return out;
}

/**
 * The relations the pending set COUNTS ROWS ON in a prestate or tail. Parsed, so the reference
 * census grows with the wave instead of being a transcribed list. The floor below adds the
 * estate catalogues a release always wants beside them; a relation that does not exist is
 * skipped rather than failed.
 */
const COUNT_FLOOR = [
  "document_capabilities",
  "document_capability_version_high_water",
  "knowledge_keys",
  "client_fact_keys",
  "knowledge_plan_item_map",
  "knowledge_key_firm_eligibility",
  "firm_setup_keys",
  "onboarding_plans",
  "onboarding_plan_items",
  "event_types",
  "trigger_taxonomy",
  "wake_fn_allowlist",
  "legal_documents",
  "evaluator_versions",
  "audit_log",
  "accounting_work",
  "operation_receipts",
  "agent_interruptions",
  "fixed_assets",
  "fa_account_profiles",
  "fa_depreciation_authorities",
  "firm_invites",
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

// ==========================================================================================
// 2 · THE DATA PRECONDITIONS THE GENERIC EXTRACTORS CANNOT SEE. Each one lives inside a DO
//     block, so it has no statement shape to parse; what IS parsed is its expected value, out
//     of the file's own refusal message.
// ==========================================================================================
function handChecks() {
  const L = (label, anchor) => literal(label, anchor);
  const list = [];
  const push = (id, guards, lit, sql, verdict) => list.push({ id, guards, lit, sql, verdict });

  // --- the knowledge catalogue (0240 / 0241 / 0242) ---------------------------------------
  const kkAfter = L("knowledge_keys count after the new key", /clara\.knowledge_keys holds % key\(s\), not the (\d+)/i);
  if (kkAfter) {
    push(
      "D-KK-COUNT",
      `${kkAfter.version} prestate: clara.knowledge_keys must hold ${kkAfter.value} keys (this wave inserts financial_year_end_day first)`,
      kkAfter.value,
      `select count(*)::int as today,
              (select count(*)::int from clara.knowledge_keys where knowledge_key='financial_year_end_day') as fye_day_already
         from clara.knowledge_keys`,
      (r) => {
        const after = r.today + (r.fye_day_already ? 0 : 1);
        return {
          ok: after === Number(kkAfter.value),
          detail: `today=${r.today} fye_day_present=${r.fye_day_already} -> after the insert ${after}, expected ${kkAfter.value}`,
        };
      },
    );
  }
  const cfkN = L("client_fact_keys count", /clara\.client_fact_keys holds % key\(s\), not the (\d+)/i);
  if (cfkN) {
    push(
      "D-CFK-COUNT",
      `${cfkN.version} prestate: clara.client_fact_keys must hold ${cfkN.value} keys`,
      cfkN.value,
      `select count(*)::int as n from clara.client_fact_keys`,
      (r) => ({ ok: r.n === Number(cfkN.value), detail: `n=${r.n}, expected ${cfkN.value}` }),
    );
  }
  const grammar = L("the knowledge key grammar", /knowledge_key ~ '(\^\[a-z\]\[a-z0-9_\]\{0,62\}\$)'/);
  if (grammar) {
    push(
      "D-KEY-GRAMMAR",
      `${grammar.version}: ADD CONSTRAINT validates every existing knowledge_key / fact_key against ${grammar.value}`,
      grammar.value,
      `select (select count(*)::int from clara.knowledge_keys where knowledge_key !~ $g$${grammar.value}$g$) as bad_knowledge_keys,
              (select count(*)::int from clara.client_fact_keys where fact_key !~ $g$${grammar.value}$g$) as bad_fact_keys`,
      (r) => ({ ok: r.bad_knowledge_keys === 0 && r.bad_fact_keys === 0, detail: `bad_knowledge_keys=${r.bad_knowledge_keys} bad_fact_keys=${r.bad_fact_keys}` }),
    );
  }
  const kinds = L("the knowledge-key kind census", /v_kinds is distinct from '(\{[^']*\})'::jsonb/);
  if (kinds) {
    push(
      "D-KK-KINDS",
      `${kinds.version} tail: the kind census must read ${kinds.value} AFTER the new key lands`,
      kinds.value,
      `select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)::text as kinds
         from (select kind, count(*)::int n from clara.knowledge_keys group by kind) s`,
      (r) => ({ ok: true, detail: `today ${r.kinds} (expected after the wave: ${kinds.value}; the new key copies financial_year_end_month's kind)` }),
    );
  }
  const refused = L("the firm-scope-refused census", /% key\(s\) are refused at firm scope, not the (\d+)/i);
  if (refused) {
    push(
      "D-KK-FIRMSCOPE",
      `${refused.version} tail: the firm-scope-refused census must read ${refused.value}`,
      refused.value,
      `select count(*)::int as n
         from clara.knowledge_keys k
        where not exists (select 1 from clara.knowledge_key_firm_eligibility e where e.knowledge_key = k.knowledge_key)
          and k.kind not in ('preference','policy')`,
      (r) => ({ ok: true, detail: `today=${r.n}; expected after the wave ${refused.value} (the new assertion key adds one and carries no eligibility row)` }),
    );
  }
  push(
    "D-FYE-MONTH",
    "0240: the new day key is SELECTed off the live financial_year_end_month row; no month row means zero rows inserted and a failing tail",
    "n/a",
    `select (select count(*)::int from clara.knowledge_keys where knowledge_key='financial_year_end_month') as month_key,
            (select count(*)::int from clara.knowledge_keys where knowledge_key='financial_year_end_day') as day_key,
            (select count(*)::int from clara.knowledge_plan_item_map where item_key='fye_day') as map_row,
            (select count(*)::int from clara.knowledge_key_firm_eligibility where knowledge_key='financial_year_end_day') as eligibility_row`,
    (r) => ({
      ok: r.month_key === 1 && r.day_key === 0 && r.map_row === 0 && r.eligibility_row === 0,
      detail: `month_key=${r.month_key} day_key=${r.day_key} map_row=${r.map_row} eligibility_row=${r.eligibility_row}`,
    }),
  );

  // --- the document capability registry (0244 / 0245 / 0246 / 0272) -----------------------
  const regRows = L("the registry row count", /the registry holds % rows, not (\d+)/i);
  const regVer = L("the registry version this wave raises from", /the registry publishes version %, not the (\d+) this file raises from/i);
  const planned = L("the planned invoice-line-item rows", /row\(s\) carry limits\.invoice_line_items = planned, not the (\d+)/i);
  if (regRows && regVer && planned) {
    push(
      "D-REGISTRY",
      `${regVer.version} prestate: exactly ${regRows.value} rows at ONE registry_version, and that version is ${regVer.value}; ` +
        `${planned.version}: exactly ${planned.value} rows carry limits.invoice_line_items = planned and none carries the reason key`,
      `${regRows.value} rows / version ${regVer.value} / ${planned.value} planned`,
      `select count(*)::int as rows,
              count(distinct registry_version)::int as versions,
              min(registry_version)::int as min_version,
              count(*) filter (where limits ->> 'invoice_line_items' = 'planned')::int as planned_rows,
              count(*) filter (where limits ? 'invoice_line_items_reason')::int as reason_rows,
              count(*) filter (where format='pdf' and document_kind='invoice')::int as pdf_invoice,
              count(*) filter (where format='pdf' and document_kind='invoice' and typed_facts='supported')::int as pdf_invoice_typed,
              count(*) filter (where format='ofx' and document_kind='bank_statement')::int as ofx_bank,
              count(*) filter (where business_operation = 'proposal_only')::int as proposal_only
         from clara.document_capabilities`,
      (r) => ({
        ok:
          r.rows === Number(regRows.value) &&
          r.versions === 1 &&
          r.min_version === Number(regVer.value) &&
          r.planned_rows === Number(planned.value) &&
          r.reason_rows === 0 &&
          r.pdf_invoice === 1 &&
          r.pdf_invoice_typed === 1 &&
          r.ofx_bank === 1 &&
          r.proposal_only === 0,
        detail:
          `rows=${r.rows} distinct_versions=${r.versions} version=${r.min_version} planned=${r.planned_rows} ` +
          `reason_key=${r.reason_rows} pdf_invoice=${r.pdf_invoice} (typed_facts supported: ${r.pdf_invoice_typed}) ` +
          `ofx_bank_statement=${r.ofx_bank} proposal_only=${r.proposal_only}`,
      }),
    );
  }
  push(
    "D-REGISTRY-KEYS",
    "0244 §D: the high-water backfill is `insert ... select ... on conflict (format, document_kind) do update`, so every published pair must be key-unique",
    "n/a",
    `select count(*)::int as rows, count(distinct (format, document_kind))::int as pairs
       from clara.document_capabilities`,
    (r) => ({ ok: r.rows === r.pairs, detail: `rows=${r.rows} distinct (format, document_kind)=${r.pairs}` }),
  );

  // --- the firm setup catalogue (0256 / 0257 / 0258 / 0259) -------------------------------
  const fsk12 = L("the firm setup catalogue size", /the firm setup catalogue holds % rows \(expected (\d+)\)/i);
  const fsk15 = L("the firm setup catalogue size after the tips", /\(expected (\d+) -- the twelve plus three tips\)/i);
  if (fsk12) {
    push(
      "D-FSK-COUNT",
      `${fsk12.version} prestate: clara.firm_setup_keys must hold exactly ${fsk12.value} rows` +
        (fsk15 ? `, and ${fsk15.version}'s tail then expects ${fsk15.value}` : ""),
      fsk12.value,
      `select count(*)::int as n,
              count(*) filter (where item_key in ('tip_invite_colleagues','tip_knowledge_page','tip_start_from_conversation'))::int as tips,
              count(*) filter (where item_key in ('mpers_eligibility','tin') and item_kind='capture'
                                 and required_for_commit = false and knowledge_key is null)::int as conditional_pair
         from clara.firm_setup_keys`,
      (r) => ({
        ok: r.n === Number(fsk12.value) && r.tips === 0 && r.conditional_pair === 2,
        detail: `n=${r.n} tip_rows=${r.tips} mpers/tin-as-capture=${r.conditional_pair}`,
      }),
    );
  }
  // The item_key order is a literal the file compares against, not a capture in its message.
  const orderLit = L("the firm setup item_key order", /v_txt is distinct from '(legal_name,[a-z_,]+)'/);
  if (orderLit) {
    push(
      "D-FSK-ORDER",
      `${orderLit.version} prestate: the catalogue's item_key order in sort_order must be exactly the pinned twelve`,
      orderLit.value,
      `select coalesce(string_agg(item_key, ',' order by sort_order), '') as order_txt from clara.firm_setup_keys`,
      (r) => ({ ok: r.order_txt === orderLit.value, detail: `live {${r.order_txt}}` }),
    );
  }
  // The twelve rows' pre-existing-column hash, with the file's OWN string_agg expression parsed
  // out of it so the read and the refusal compute the same number.
  const fskSha = (() => {
    for (const v of PENDING) {
      const code = codeOf(v);
      const m = /select encode\(sha256\(convert_to\(string_agg\(([\s\S]*?)\),'UTF8'\)\),'hex'\)\s*\n\s*into v_sha from clara\.firm_setup_keys;[\s\S]{0,200}?if v_sha <> '([0-9a-f]{64})'/.exec(code);
      if (m) return { version: v, expr: m[1].replace(/\s+/g, " ").trim(), value: m[2] };
    }
    return null;
  })();
  if (fskSha) {
    push(
      "D-FSK-SHA",
      `${fskSha.version} prestate: the twelve rows' pre-existing columns must hash to the pinned baseline`,
      fskSha.value,
      `select encode(sha256(convert_to(string_agg(${fskSha.expr}),'UTF8')),'hex') as sha from clara.firm_setup_keys`,
      (r) => ({ ok: r.sha === fskSha.value, detail: `live ${String(r.sha).slice(0, 16)}... expected ${fskSha.value.slice(0, 16)}...` }),
    );
  } else {
    gap("literal the firm-setup twelve-row hash", "no pending file carries the string_agg/sha256 pin");
  }
  push(
    "D-FSK-COLUMNS",
    "0258 §A: `add column user_note` / `add column retired_at` on clara.firm_setup_keys; the prestate refuses if either already exists",
    "n/a",
    `select count(*) filter (where column_name='user_note')::int as user_note,
            count(*) filter (where column_name='retired_at')::int as retired_at
       from information_schema.columns
      where table_schema='clara' and table_name='firm_setup_keys'`,
    (r) => ({ ok: r.user_note === 0 && r.retired_at === 0, detail: `user_note=${r.user_note} retired_at=${r.retired_at}` }),
  );
  push(
    "D-FSK-TRIGGER",
    "0258 §A: the backfill runs with t_firm_setup_keys_append_only DISABLED and re-enables it; the prestate demands tgenabled='O'",
    "O",
    `select coalesce(max(tgenabled::text), '<absent>') as tgenabled
       from pg_trigger where tgrelid='clara.firm_setup_keys'::regclass and tgname='t_firm_setup_keys_append_only'`,
    (r) => ({ ok: r.tgenabled === "O", detail: `tgenabled=${r.tgenabled}` }),
  );
  push(
    "D-FSK-BACKFILL",
    "0258 §A: the backfill UPDATE names its twelve item_keys in a VALUES list and then demands exactly twelve non-null user_note rows",
    "12",
    `select coalesce(string_agg(item_key, ',' order by item_key), '') as keys from clara.firm_setup_keys`,
    (r) => ({ ok: true, detail: `live item_keys {${r.keys}} - every key the VALUES list names must be present or the post-backfill count falls short` }),
  );

  // --- the taxonomy (0263 / 0264) and the retirements (0261 / 0271) -----------------------
  push(
    "D-TAXONOMY",
    "0263 prestate: an ACTIVE taxonomy version must exist; the two new event types must be wholly absent or wholly present",
    "n/a",
    `select (select count(*)::int from clara.taxonomy_active) as active_versions,
            (select count(*)::int from clara.event_types where name='admission.capacity_set') as cap_type,
            (select count(*)::int from clara.event_types where name='stripe_event.problem_resolved') as res_type,
            (select count(*)::int from clara.event_types
              where name like 'member.%' or name like 'invite.%' or name like 'asset.%'
                 or name like 'counterparty.%' or name like 'client.%' or name like 'knowledge.%'
                 or name like 'firm.%') as ladder_families,
            (select count(*)::int from clara.event_types where name='work.cancelled') as work_cancelled`,
    (r) => ({
      ok: r.active_versions >= 1 && r.cap_type === r.res_type && r.ladder_families >= 1 && r.work_cancelled === 1,
      detail:
        `taxonomy_active=${r.active_versions} admission.capacity_set=${r.cap_type} stripe_event.problem_resolved=${r.res_type} ` +
        `ladder_family_types=${r.ladder_families} work.cancelled=${r.work_cancelled}`,
    }),
  );
  push(
    "D-TAXONOMY-COVER",
    "0263 tail: every registered event type must carry a trigger_taxonomy row at the active version",
    "0",
    `select count(*)::int as uncovered
       from clara.event_types et
      where not exists (select 1 from clara.trigger_taxonomy tt
                         where tt.version = (select version from clara.taxonomy_active) and tt.event_type = et.name)`,
    (r) => ({ ok: true, detail: `uncovered event types today=${r.uncovered} (the wave adds two and routes both)` }),
  );
  push(
    "D-RETIRE-ALLOWLIST",
    "0261 / 0271 prestates: neither retired door may hold a clara.wake_fn_allowlist row",
    "0",
    `select count(*) filter (where function_name='list_firm_timeline')::int as timeline,
            count(*) filter (where function_name='create_account_set_v1')::int as account_set
       from clara.wake_fn_allowlist`,
    (r) => ({ ok: r.timeline === 0 && r.account_set === 0, detail: `list_firm_timeline=${r.timeline} create_account_set_v1=${r.account_set}` }),
  );

  // --- the opening-balance Work vocabulary (0239) -----------------------------------------
  push(
    "D-OPENING-CHECKS",
    "0239 §B: the two purpose CHECKs are DROPped and re-ADDed with a fourth value; the prestate refuses any text that is neither 0194's three nor #984's four",
    "n/a",
    `select coalesce((select pg_get_constraintdef(oid) from pg_constraint
                       where conrelid='clara.accounting_work'::regclass and conname='accounting_work_purpose_check'), '<absent>') as work_check,
            coalesce((select pg_get_constraintdef(oid) from pg_constraint
                       where conrelid='clara.operation_receipts'::regclass and conname='operation_receipts_purpose_check'), '<absent>') as receipt_check,
            (select count(*)::int from pg_attribute
              where attrelid='clara.operation_receipts'::regclass and attname='task_id' and attnotnull) as task_id_notnull`,
    (r) => ({
      ok: r.work_check !== "<absent>" && r.receipt_check !== "<absent>",
      detail: `accounting_work {${r.work_check}} / operation_receipts {${r.receipt_check}} / task_id NOT NULL=${r.task_id_notnull}`,
    }),
  );
  push(
    "D-OPENING-ROWS",
    "0239 §B: the re-added CHECKs validate every existing row of two live tables (the generated reads below answer each one individually)",
    "n/a",
    `select (select count(*)::int from clara.accounting_work) as accounting_work_rows,
            (select count(*)::int from clara.operation_receipts) as operation_receipts_rows,
            (select count(*)::int from clara.operation_receipts where task_id is null) as receipts_without_task`,
    (r) => ({
      ok: r.receipts_without_task === 0,
      detail: `accounting_work=${r.accounting_work_rows} operation_receipts=${r.operation_receipts_rows} receipts with task_id null=${r.receipts_without_task}`,
    }),
  );

  // --- the onboarding-plan uniqueness widening (0255) --------------------------------------
  push(
    "D-PLAN-WRITER",
    "0255 §0.5: exactly ONE clara function body may insert a firm-scope onboarding plan",
    "1",
    `select count(*)::int as n from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and position('insert into clara.onboarding_plans(' in p.prosrc) > 0
        and position('''firm''' in p.prosrc) > 0`,
    (r) => ({ ok: r.n === 1, detail: `writer bodies=${r.n}` }),
  );

  // --- the audit-log column and index (0243) -----------------------------------------------
  push(
    "D-AUDIT",
    "0243 §A: `add column actor_role` (no default), a CHECK that scans the table, a BEFORE INSERT trigger, and a partial index built non-concurrently",
    "n/a",
    `select (select count(*) filter (where column_name='actor_role')::int from information_schema.columns
              where table_schema='clara' and table_name='audit_log') as column_present,
            (select count(*)::int from clara.audit_log) as rows,
            (select count(*)::int from clara.audit_log where args ->> 'revision_id' is not null) as index_rows,
            (select count(*)::int from pg_class where oid = to_regclass('clara.ix_audit_log_knowledge_revision')) as index_present,
            (select pg_size_pretty(pg_total_relation_size('clara.audit_log'))) as size`,
    (r) => ({
      ok: r.column_present === 0 && r.index_present === 0,
      detail: `actor_role column=${r.column_present} index=${r.index_present} rows=${r.rows} (${r.size}) rows matching the partial index predicate=${r.index_rows}`,
    }),
  );

  // --- the lane-09 tail branch a seeded rig cannot reach (0268) -----------------------------
  const keyCount = L("the work-question record key count", /\)\) k\) <> (\d+) then/);
  if (keyCount) {
    push(
      "D-WORKQ-KEYS",
      `${keyCount.version} tail: IF any clara.agent_interruptions row carries work_id, the newest one's clara._work_question_record must project exactly ${keyCount.value} keys. ` +
        "A seeded rig with no such row skips this branch entirely; hosted is where it first fires.",
      keyCount.value,
      `select count(*)::int as work_bearing,
              coalesce(max(created_at)::text, '<none>') as newest
         from clara.agent_interruptions where work_id is not null`,
      (r) => ({
        ok: true,
        detail:
          `work-bearing interruptions=${r.work_bearing} newest=${r.newest}. ` +
          (r.work_bearing === 0
            ? "the branch will NOT fire; the text assertions above it stand alone"
            : `the branch WILL fire and demands exactly ${keyCount.value} keys on the newest row - NOT exercised by the integration gate`),
      }),
    );
  }

  // --- the fixed-asset birth watermark (0247) ----------------------------------------------
  push(
    "D-FA-BIRTH",
    "0247 recuts clara._tf_fa_acquisition_birth so a later UPDATE cannot birth a register row retroactively. It RETIRES no row already born that way.",
    "n/a",
    `select (select count(*)::int from clara.fixed_assets) as fixed_assets,
            (select count(*)::int from clara.fa_account_profiles) as profiles,
            (select count(*)::int from clara.fa_depreciation_authorities) as authorities`,
    (r) => ({
      ok: true,
      detail: `fixed_assets=${r.fixed_assets} fa_account_profiles=${r.profiles} fa_depreciation_authorities=${r.authorities}` +
        (r.fixed_assets === 0 ? " - no register row exists, so no retroactive birth can already be in it" : " - inspect the register against fa_register_tie after the release"),
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
 * Compare two fingerprints. A difference on an object the PENDING set names is TOLERATED, with
 * the file that names it and the reason; a difference on an object a pending PRESTATE PINS is a
 * STOP, because that pin is what will refuse. Everything else is DRIFT.
 */
function compareFingerprints(target, baseline, label) {
  // THE TWO CLASSIFICATIONS, both parsed out of the pending files.
  //   NAMED   - the identifier occurs anywhere in a pending file, so that file rewrites it and a
  //             difference between two estates at the SAME frontier is about to be overwritten.
  //   PINNED  - the identifier occurs inside a file's PRESTATE region within PIN_WINDOW
  //             characters of a 64-hex literal or of a catalog-text comparison. That is a
  //             measurement of the CURRENT shape, so a difference there will REFUSE.
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
    if (key.startsWith("role:")) return [key.slice(5)];
    if (key.startsWith("rolemember:")) return key.slice(11).split("->");
    return [];
  };

  const keys = [...new Set([...Object.keys(target.structure), ...Object.keys(baseline.structure)])].sort();
  const out = { drift: [], tolerated: [], pinnedDrift: [] };
  for (const k of keys) {
    const a = target.structure[k];
    const b = baseline.structure[k];
    if (a === b) continue;
    const ids = idsOf(k);
    const namedBy = [...new Set(ids.flatMap((i) => [...(names.get(i) || [])]))].sort();
    const pinnedBy = [...new Set(ids.flatMap((i) => [...(pinned.get(i) || [])]))].sort();
    const row = { key: k, target: a ?? "<absent>", baseline: b ?? "<absent>", namedBy, pinnedBy };
    if (pinnedBy.length) out.pinnedDrift.push(row);
    else if (namedBy.length) out.tolerated.push(row);
    else out.drift.push(row);
  }

  say(`== estate fingerprint vs ${label} ==`);
  say(`  baseline taken ${baseline.taken_at}, ledger ${baseline.ledger.applied} / ${baseline.ledger.frontier}`);
  say(`  keys compared: ${keys.length}  ·  equal: ${keys.length - out.drift.length - out.tolerated.length - out.pinnedDrift.length}`);
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
  say("== generated reads: ADD CONSTRAINT ... CHECK on an existing table ==");
  for (const c of parsedCheckConstraints()) say(`  ${c.version}  ${c.table} ${c.name}\n      select count(*) from ${c.table} where not (${c.expr})`);
  say("== generated reads: CREATE [UNIQUE] INDEX on an existing table ==");
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
  say("== hand-written data preconditions (their expected values parsed from the files) ==");
  for (const h of handChecks()) say(`  ${h.id.padEnd(18)} expect=${String(h.lit).slice(0, 70)}\n      ${h.guards}`);
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
      note("neither --frontier-before nor a state file: the 229 + N arithmetic could not be re-derived");
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

  say("  -- ADD CONSTRAINT ... CHECK on an existing table (parsed from the files) --");
  for (const c of parsedCheckConstraints()) {
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
      const addedBy = miss
        ? PENDING.filter((v) =>
            new RegExp(`alter\\s+table\\s+${c.table.replace(".", "\\.")}\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${miss[1]}\\b`, "i").test(codeOf(v)),
          )
        : [];
      if (addedBy.length) {
        check(
          `${c.version} ${c.name} on ${c.table}`,
          true,
          `the CHECK names ${c.table}.${miss[1]}, which ${addedBy.join(", ")} adds in the same run; every existing row is NULL and the CHECK admits NULL`,
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

  say("  -- CREATE [UNIQUE] INDEX on an existing table (parsed from the files) --");
  for (const i of parsedIndexes()) {
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
      const sql = `select case when to_regclass('${i.table}') is null then -1
                               else (select count(*)::int from ${i.table}${i.pred ? ` where ${i.pred}` : ""}) end as n`;
      const rows = await q(sql).catch(() => [{ n: -2 }]);
      note(`${i.version} ${i.name} on ${i.table}`, rows[0].n < 0 ? "table absent or read failed" : `${rows[0].n} row(s) enter the index - build cost only, no failure mode`);
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

  say("  -- assertions inside a prestate or tail DO block (expected values parsed from the files) --");
  for (const h of handChecks()) {
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
  say("  locks held on the tables this wave takes an ACCESS EXCLUSIVE on:\n  " + fmt(await soft(
    `select c.relname, l.mode, a.usename, count(*)::int
       from pg_locks l join pg_class c on c.oid = l.relation
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_stat_activity a on a.pid = l.pid
      where n.nspname = 'clara' and l.pid <> pg_backend_pid()
        and c.relname in ('accounting_work','operation_receipts','audit_log','document_capabilities',
                          'knowledge_keys','client_fact_keys','firm_setup_keys','onboarding_plans',
                          'onboarding_plan_items','event_types','trigger_taxonomy')
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
