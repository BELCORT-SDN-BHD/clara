// #624 — THE DOCUMENT CAPABILITY REGISTRY, as data rather than as four opinions scattered
// through function bodies. Migration: 0191_document_capability_registry.sql.
//
// Every cell gates on the LIVE CATALOG, never on a migration number (review law 3; the
// counterparty-alias-kind / web-reads batteries' own shape). A PARTIAL cohort THROWS: a
// half-applied migration is a defect, not a reason to skip.
//
// WHAT THIS BATTERY IS FOR. The ticket's first acceptance criterion is that Clara publishes a
// VERSIONED capability registry separating custody, byte extraction, typed facts and business
// operation for each admitted format/kind, and that a skipped kind can never be presented as
// executable. The registry is only worth anything if it is TOTAL over the live vocabulary and
// if it tells the truth about the lanes that actually exist — so these cells check totality in
// both directions against `documents_document_kind_check`, and check the individual verdicts
// that the honest-defaults argument rests on.
//
// THE OFX ROW IS THE HEADLINE (C-37, "no support promise from a filename alone"). A reader
// exists — `packages/runtime/lib/statement-parse.mjs`'s `parseStatementOfx` — but the format
// carries NO opening balance, `parseStatementOfx` therefore returns `opening_cents: null` by
// construction, and `statement-corroboration.mjs`'s `missingHeaderFields` counts
// `opening_cents` as a required header field, so `corroborateChain` raises `header_unreadable`
// on EVERY OFX statement. `ofx × bank_statement` is therefore NOT typed-facts supported, and
// this battery refuses a registry that says otherwise.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRoot, endPool } from "./rig-fixtures.mjs";

const CLR10 = "CLR10";
// #779 — the immutability/append-only family code, the one clara._tf_accounting_plans_immutable
// already raises for "a plan revision number never goes backwards" (0193). The registry's
// version wall is the same refusal about a different counter, so it keeps the same code rather
// than minting a second spelling.
const CLR08 = "CLR08";

/** The twelve canonical formats the runtime's intake admits, and the ONE canonical mime each
 *  spelling canonicalizes to. Transcribed from `packages/runtime/lib/intake.mjs`'s
 *  `MIME_ALIASES` map and `packages/runtime/lib/scan.mjs`'s detector — written out here rather
 *  than imported, because packages/db never imports from packages/runtime. The registry's own
 *  rows are compared against this list, so a format that silently leaves either side is a
 *  finding rather than a quiet pass. */
const FORMATS = Object.freeze({
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tiff: "image/tiff",
  heic: "image/heic",
  xml: "application/xml",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  ofx: "application/x-ofx",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

const LEVELS = Object.freeze(["supported", "stored_only", "unsupported", "planned"]);

/** #988 — `business_operation`'s OWN fifth level ("Clara proposes, a person confirms"; the exact
 *  token, left to the implementer by the ticket, is `proposal_only`). `custody`, `byte_extraction`
 *  and `typed_facts` are OUT OF SCOPE for #988 (its own words) and keep the original four-value
 *  CHECK unchanged — only `business_operation`'s (0246_business_operation_proposal_only.sql)
 *  admits the fifth. A shared five-value set for all four columns would silently loosen the other
 *  three's own closed-vocabulary assertion below, so this is its OWN constant rather than a widen
 *  of LEVELS. */
const BUSINESS_OPERATION_LEVELS = Object.freeze([...LEVELS, "proposal_only"]);

/** THE VERSION THE REGISTRY PUBLISHES TODAY, written as a LITERAL rather than read back out of
 *  the table — a cell that reads the number it is about to assert proves nothing.
 *
 *  1 from 0191 (the seed) until #656's `0228_opening_ledger_source.sql`, which republished the
 *  WHOLE registry at 2. It had to be the whole registry and not only the rows whose content
 *  changed, because THIS FILE's own `:204-212` cell asserts `count(distinct registry_version) = 1`
 *  ("the registry publishes exactly one version at a time") and the rollback-hygiene cell below
 *  asserts the published minimum besides — so a two-row raise would have redded a battery whose
 *  whole subject is registry-wide uniformity. 0228 moves every row by UPDATE (never
 *  DELETE-then-INSERT, #846) and changes CONTENT on thirteen rows only: six `opening_balance_doc`
 *  azure-di rows to `typed_facts`/`business_operation` = supported, now that #656 wires the
 *  `opening_tb.line` producer in line at the OCR pass, and seven `prior_gl` rows' basis + a named
 *  `{"browser_entrance":"absent"}` limit — the limit ticket 1012's 0288 later REPLACES (see 4,
 *  below).
 *
 *  2 until #782's `0245_invoice_line_items_accepted_limitation.sql`, which republished the WHOLE
 *  registry again at 3 (owner ruling 2026-09-18: no invoice line items this round) and changed
 *  CONTENT on the 28 invoice-family rows only (pdf/png/jpeg/webp/tiff/heic x
 *  invoice/credit_note/debit_note/receipt, plus xml x invoice/credit_note/debit_note/
 *  e_invoice_xml): `limits.invoice_line_items` moves from `planned` to `accepted_limitation`,
 *  with a sibling `invoice_line_items_reason` naming why — no consumer reads per-line facts
 *  (`packages/runtime/lib/trade-invoice-basis.ts`'s `.strict()` schema admits no `line_items`
 *  field), so header-only is a standing boundary rather than a future build.
 *
 *  STILL 3 after #988's `0246_business_operation_proposal_only.sql`. #988 widens ONE column's
 *  CHECK (business_operation gains its own fifth level, `proposal_only`) and moves ZERO rows: the
 *  owner's ruling names no row for reclassification this round (`prior_gl` stays `stored_only`,
 *  #983/#1012). registry_version is a per-row PUBLICATION mark; a vocabulary change that
 *  republishes no row's content does not raise it, exactly as this lane's own #846 (0244, which
 *  minted a whole relation and two walls, touched zero rows and did not move the version either)
 *  precedents.
 *
 *  4 since ticket 1012's `0288_seeding_lane_retired.sql`, which republished the WHOLE registry
 *  again and changed CONTENT on the SEVEN `prior_gl` rows `packages/runtime/lib/seeding-parse.mjs`
 *  has a reader for (heic/jpeg/pdf/png/tiff/webp/xlsx): 0228's `limits {"browser_entrance":
 *  "absent"}` is REPLACED by `{"seeding_lane":"retired", "seeding_lane_reason":
 *  "client_kb_replaces_manual_pre_registration"}`, and the basis sentence promising an entrance
 *  nobody had built is replaced by one naming the retirement. "Not built yet" was a promise;
 *  after 0288 the three write doors answer a typed refusal and the runtime route is deleted, so
 *  the registry would otherwise advertise an operation that no longer exists.
 *  `business_operation` moves on NO row — `prior_gl` stays `stored_only`, exactly as #988's
 *  ruling above already settled — so the honesty cell at the foot of this file is unaffected.
 *
 *  5 since #945's `0296_payroll_summary_typed_facts.sql`, which republished the WHOLE registry
 *  again and changed CONTENT on the SIX `payroll_summary` rows the facts router now has a reader
 *  for (heic/jpeg/pdf/png/tiff/webp — the pairs whose mime is application/pdf or image/*, which
 *  is exactly the branch 0296's new `payroll_facts` arm sits on). `typed_facts` moves from
 *  `stored_only` to `supported`, `limits` gains the two-key
 *  `{"payroll_employee_detail":"accepted_limitation", "payroll_employee_detail_reason":
 *  "quotes_are_summed_then_discarded"}` in #782's own shape, and the basis sentence that
 *  described the router's dead end ("The facts router terminates this pair cleanly") is replaced
 *  by one naming what is now read and what Clara still will not do. The verdict was DERIVED from
 *  that dead end, so #926's owner ruling (2026-09-18, option G) removing it and this
 *  republication are one change, not two. `business_operation` moves on NO row — #945 is the
 *  READING half and #946 is the drafting one — so the honesty cell at the foot of this file is
 *  unaffected, and the six csv/tsv/xlsx/docx/ofx/xml payroll rows keep their pre-#945 verdicts
 *  because the router's payroll arm never reaches them.
 *
 *  6 since #948's `0299_agreement_contract_acquisition.sql`, which republished the WHOLE registry
 *  again and changed CONTENT on the SIX `agreement_contract` rows the facts router now has a
 *  reader for (heic/jpeg/pdf/png/tiff/webp — the pairs whose mime is application/pdf or image/*,
 *  which is exactly the branch 0299's new `contract_facts` arm sits on). `typed_facts` moves from
 *  `stored_only` to `supported`, `limits` gains two two-key pairs in #782's own shape
 *  (`agreement_non_financing` / `agreement_asset_account`, both `accepted_limitation`), and the
 *  basis sentence describing the router's dead end is replaced by one naming what is read and
 *  what is posted. UNLIKE #945, `business_operation` DOES move on those six rows, to `supported`:
 *  0296 was the reading half with its posting half in a later file, whereas 0299 carries these
 *  typed facts into a posted acquisition itself, which is the column's own published definition
 *  of `supported`. The honesty cell at the foot of this file is one-directional
 *  (`business_operation` never `supported` where `typed_facts` is not), so it is satisfied rather
 *  than affected; the payroll rows are untouched, and the six csv/tsv/xlsx/docx/ofx/xml agreement
 *  rows keep their pre-#948 verdicts because the router's agreement arm never reaches them.
 *
 *  A future republication re-bases HERE, in one place, and says why beside the number — the
 *  precedent for editing this battery in the same commit as the migration is `af3b5955` (#779),
 *  which shipped 0207 and +147 lines of this file together. */
const PUBLISHED_REGISTRY_VERSION = 6;

let live = false;
let executed = 0;
// #779 — the three monotonicity cells below ride 0207's BEFORE UPDATE trigger, which sits ABOVE
// 0191 in the chain. They are gated on THAT object (by its stem's own catalog shape, never by a
// migration number), so this file keeps passing on a database that has 0191 and not yet 0207 —
// the frontier rule every battery here follows. EXPECTED_CELLS is the count WITH 0207 AND #988's
// 0246 both applied; EXPECTED_CELLS_PRE_988 is 0207 applied but not yet 0246 (0246 cannot apply
// before 0207 — migrations run in strict numeric order — so there is no "0246 without 0207" state
// to name); the `after` hook below asserts the executed count equals whichever constant the live
// frontier makes true, so forgetting to bump one of these still fails the whole battery.
const EXPECTED_CELLS = 23;
const EXPECTED_CELLS_PRE_0272 = 22;
const EXPECTED_CELLS_PRE_988 = 20;
const EXPECTED_CELLS_PRE_0207 = 17;
let monotoneLive = false;
let proposalLevelLive = false;
let wallCompletionLive = false;

async function cohortApplied() {
  const r = await rootQuery(`select
      to_regclass('clara.document_capabilities')                                is not null as t1,
      to_regclass('clara.document_fact_validations')                            is not null as t2,
      to_regprocedure('clara._document_capability(text,text)')                  is not null as f1,
      to_regprocedure('clara._document_format(text)')                           is not null as f2,
      to_regprocedure('clara._assert_field_path(text)')                         is not null as f3,
      to_regprocedure('clara.get_document_state(uuid,uuid)')                    is not null as f4`);
  const flags = Object.entries(r.rows[0]);
  const present = flags.filter(([, v]) => v).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(
      `document-capability cohort is PARTIAL: ${flags.map(([k, v]) => `${k}=${v}`).join(" ")}. `
      + "A half-applied migration is a defect; refusing to skip past it.",
    );
  }
  return present === flags.length;
}

async function monotoneWallApplied() {
  const r = await rootQuery(`select exists (
      select 1 from pg_trigger t
       where t.tgrelid = 'clara.document_capabilities'::regclass
         and t.tgname = 't_document_capabilities_version_monotone'
         and not t.tgisinternal) as ok`);
  return r.rows[0].ok === true;
}

/** #988 — is `document_capabilities_business_operation_check` at ITS FIVE-VALUE FORM (0246), or
 *  still at 0191's original four? Read from the LIVE CATALOG, never from a migration number, the
 *  same law `monotoneWallApplied` follows for 0207. */
async function proposalLevelApplied() {
  const r = await rootQuery(`select pg_get_constraintdef(c.oid) as def from pg_constraint c
     where c.conrelid = 'clara.document_capabilities'::regclass and c.contype = 'c'
       and c.conname = 'document_capabilities_business_operation_check'`);
  return (r.rows[0]?.def ?? "").includes("proposal_only");
}

/** #782 fix round — is 0272 (`document_capability_wall_completion`) applied? Read from a CATALOG
 *  fact that file installs — the mark ledger's BEFORE TRUNCATE trigger — never from a migration
 *  number and never from the comment the cell below asserts, which would be circular. 0272
 *  installs the trigger and re-issues the `limits` comment in ONE file, so the trigger is that
 *  file's frontier, exactly as the five-value CHECK is 0246's above. */
async function wallCompletionApplied() {
  const r = await rootQuery(`select exists (
      select 1 from pg_trigger t
       where t.tgrelid = 'clara.document_capability_version_high_water'::regclass
         and t.tgname = 't_document_capability_high_water_no_truncate'
         and not t.tgisinternal) as ok`);
  return r.rows[0].ok === true;
}

before(async () => {
  live = await cohortApplied();
  monotoneLive = live && await monotoneWallApplied();
  proposalLevelLive = live && await proposalLevelApplied();
  wallCompletionLive = live && await wallCompletionApplied();
});
after(async () => {
  const want = !monotoneLive
    ? EXPECTED_CELLS_PRE_0207
    : (!proposalLevelLive
      ? EXPECTED_CELLS_PRE_988
      : (wallCompletionLive ? EXPECTED_CELLS : EXPECTED_CELLS_PRE_0272));
  if (live) assert.equal(executed, want, `expected ${want} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY === "1") {
    console.warn("SKIP document-capability-registry: the cohort is not applied (explicit pre-integration run).");
    t.skip("document-capability cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "document-capability-registry is required for a focused run: apply "
    + "0191_document_capability_registry.sql (or its numbered suite copy)",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

/** A cell that additionally needs 0207's version wall. It SKIPS (never fails) below that
 *  frontier and is counted only when it actually ran, so the `after` hook stays exact. */
const monotoneCell = (name, fn) => test(name, async (t) => {
  if (gate(t)) return;
  if (!monotoneLive) {
    t.skip("0207_document_capabilities_version_monotone is not applied on this database");
    return;
  }
  executed += 1;
  await fn(t);
});

/** #988 — a cell that additionally needs 0246's five-value business_operation CHECK. SKIPS (never
 *  fails) below that frontier, counted only when it actually ran, the same shape monotoneCell
 *  uses for 0207. */
const proposalLevelCell = (name, fn) => test(name, async (t) => {
  if (gate(t)) return;
  if (!proposalLevelLive) {
    t.skip("0246_business_operation_proposal_only is not applied on this database");
    return;
  }
  executed += 1;
  await fn(t);
});

/** #782 fix round — a cell that additionally needs 0272's re-issued `limits` column comment.
 *  SKIPS (never fails) below that frontier, counted only when it actually ran. */
const wallCompletionCell = (name, fn) => test(name, async (t) => {
  if (gate(t)) return;
  if (!wallCompletionLive) {
    t.skip("0272_document_capability_wall_completion is not applied on this database");
    return;
  }
  executed += 1;
  await fn(t);
});

/** Run `fn(client)` inside a transaction that is ALWAYS rolled back. Every probe in this file
 *  writes through the owner/root connection (no application role may write the registry at
 *  all), and the battery's other cells assert registry-wide invariants — exactly one distinct
 *  registry_version, one custody/byte engine per format, the OFX and CSV verdicts — so a probe
 *  write left behind would turn them red. */
async function inRolledBackTxn(fn) {
  return asRoot(async (c) => {
    await c.query("begin");
    try {
      return await fn(c);
    } finally {
      await c.query("rollback");
    }
  });
}

const PDF_INVOICE = "where format = 'pdf' and document_kind = 'invoice'";

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

async function kinds() {
  return (await rootQuery("select unnest(clara._document_kind_roster()) as k order by 1")).rows.map((r) => r.k);
}

async function capability(format, kind) {
  return (await rootQuery("select clara._document_capability($1,$2) as c", [format, kind])).rows[0].c;
}

// ---------------------------------------------------------------------------------------------
// TOTALITY — the registry covers every admitted format × every live kind, and nothing else.
// ---------------------------------------------------------------------------------------------

cell("every live document kind × every canonical intake format has EXACTLY ONE registry row", async () => {
  const roster = await kinds();
  const formats = Object.keys(FORMATS);
  const rows = (await rootQuery(
    "select format, document_kind, count(*)::int as n from clara.document_capabilities group by 1,2")).rows;
  assert.equal(rows.length, roster.length * formats.length,
    `expected ${roster.length} kinds x ${formats.length} formats = ${roster.length * formats.length} rows, found ${rows.length}`);
  for (const r of rows) assert.equal(r.n, 1, `duplicate row for ${r.format} x ${r.document_kind}`);

  const missing = [];
  const have = new Set(rows.map((r) => `${r.format}\u0000${r.document_kind}`));
  for (const f of formats) for (const k of roster) if (!have.has(`${f}\u0000${k}`)) missing.push(`${f}x${k}`);
  assert.deepEqual(missing, [], "the registry is not total over (format, kind)");

  const extra = (await rootQuery(
    "select format, document_kind from clara.document_capabilities where not (document_kind = any (clara._document_kind_roster()))")).rows;
  assert.deepEqual(extra, [], "the registry names a kind the live vocabulary does not admit");
});

cell("every registry row names a canonical intake mime, one mime per format, and the level vocabulary is closed (four shared levels, business_operation's own fifth beside them, #988)", async () => {
  const rows = (await rootQuery(
    "select distinct format, mime_type from clara.document_capabilities order by 1")).rows;
  assert.deepEqual(
    rows.map((r) => [r.format, r.mime_type]),
    Object.entries(FORMATS).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    "the registry's format -> canonical mime map drifted from the runtime intake allowlist",
  );
  const bad = (await rootQuery(
    `select format, document_kind, custody, byte_extraction, typed_facts, business_operation
       from clara.document_capabilities
      where custody <> all($1::text[]) or byte_extraction <> all($1::text[])
         or typed_facts <> all($1::text[]) or business_operation <> all($2::text[])`,
    [LEVELS, BUSINESS_OPERATION_LEVELS])).rows;
  assert.deepEqual(bad, [], "a level outside the closed vocabulary");
});

cell("the registry carries ONE monotone registry_version and a non-blank basis on every row", async () => {
  const r = (await rootQuery(
    `select count(distinct registry_version)::int as versions, min(registry_version)::int as v,
            count(*) filter (where basis is null or btrim(basis) = '')::int as blank
       from clara.document_capabilities`)).rows[0];
  assert.equal(r.versions, 1, "the registry publishes exactly one version at a time");
  assert.ok(r.v >= 1, "registry_version starts at 1");
  assert.equal(r.blank, 0, "every row states its basis");
});

// ---------------------------------------------------------------------------------------------
// THE VERDICTS THAT CARRY THE TICKET'S CLAIMS.
// ---------------------------------------------------------------------------------------------

cell("custody and byte_extraction are FORMAT-invariant: a kind never changes what the intake pass did with the bytes", async () => {
  const rows = (await rootQuery(
    `select format, count(distinct custody)::int as c, count(distinct byte_extraction)::int as b,
            count(distinct engine_byte)::int as e
       from clara.document_capabilities group by 1 order by 1`)).rows;
  for (const r of rows) {
    assert.equal(r.c, 1, `${r.format}: custody varies by kind`);
    assert.equal(r.b, 1, `${r.format}: byte_extraction varies by kind`);
    assert.equal(r.e, 1, `${r.format}: the byte-extraction engine varies by kind`);
  }
});

cell("OFX is STORED-ONLY at intake and its bank_statement pair is NOT typed-facts supported (C-37: no promise from a filename)", async () => {
  const row = (await rootQuery(
    "select * from clara.document_capabilities where format='ofx' and document_kind='bank_statement'")).rows[0];
  assert.ok(row, "the ofx x bank_statement row exists");
  assert.equal(row.custody, "supported", "the bytes are sealed — custody is real");
  assert.equal(row.byte_extraction, "stored_only",
    "intake takes the store-only lane for ofx (packages/runtime/lib/intake-lanes.mjs laneSnapshot)");
  assert.notEqual(row.typed_facts, "supported",
    "ofx statements cannot corroborate: parseStatementOfx leaves opening_cents null and corroborateChain raises header_unreadable");
  assert.match(row.basis, /opening/i, "the basis names the reason rather than asserting a bare verdict");
});

cell("a CSV bank statement IS typed-facts supported and a TSV one is not — the live router admits text/csv and never text/tab-separated-values", async () => {
  const csv = await capability("csv", "bank_statement");
  const tsv = await capability("tsv", "bank_statement");
  assert.equal(csv.typed_facts, "supported", "csv x bank_statement rides the statement_parse lane");
  assert.notEqual(tsv.typed_facts, "supported", "the csv/ofx router arm never names text/tab-separated-values");
});

cell("an invoice-shaped PDF is facts-supported and records the line-item deferral as a named LIMIT, never as silent completeness", async () => {
  const row = (await rootQuery(
    "select * from clara.document_capabilities where format='pdf' and document_kind='invoice'")).rows[0];
  assert.equal(row.typed_facts, "supported");
  assert.equal(row.business_operation, "supported");
  assert.equal(row.engine_id, "llm-openai:gpt-5.6-terra:v2", "the witness pair is the live facts engine for this pair");
  assert.equal(row.limits?.invoice_line_items, "accepted_limitation",
    "invoice LINE ITEMS are an accepted limitation, not a planned feature (#782 owner ruling 2026-09-18), "
    + "and the registry says so in machine-readable form");
  assert.equal(row.limits?.invoice_line_items_reason, "no_consumer_reads_line_facts",
    "the limitation carries its own reason, not a bare verdict");
});

wallCompletionCell("the registry's OWN documentation of `limits` stops calling invoice line items planned (#782)", async () => {
  const doc = (await rootQuery(
    `select col_description('clara.document_capabilities'::regclass, a.attnum) as d
       from pg_attribute a
      where a.attrelid = 'clara.document_capabilities'::regclass and a.attname = 'limits'`)).rows[0].d;

  assert.ok(doc, "the limits column carries a comment at all");
  // #782's AC2 names three surfaces where the deferred-target wording had to stop: the registry
  // seed, the web copy and the PRD. 0245 moved the DATA and left 0191's column comment behind —
  // the registry's own machine-readable documentation of the very key it re-seeded.
  assert.doesNotMatch(doc, /planned/i,
    "the limits column comment still describes a limit as planned (#782 owner ruling 2026-09-18: "
    + "stop promising line items)");
  assert.doesNotMatch(doc, /\bcoming\b|no table yet|accepted target/i,
    "the limits column comment still describes line items as a target Clara intends to build");
  assert.match(doc, /invoice_line_items/,
    "…and it still documents the key it is about, rather than going silent on it");
  assert.match(doc, /accepted_limitation/,
    "…at the value 0245 actually seeded");
  assert.match(doc, /invoice_line_items_reason/,
    "…with the sibling reason key that makes the limitation checkable");
});

// #945 (migration 0296) MOVED THIS CELL'S SUBJECT and the cell moved with it. Until then the
// router terminated a payroll_summary as skipped_kind and this registry row was DERIVED from
// that dead end. #926's owner ruling (2026-09-18, option G) reopened payroll reading, so the pdf
// pair now has a reader. The half of the claim that was always the point — a pair whose facts
// Clara does not post must never present as EXECUTABLE — is unchanged and still asserted.
cell("a payroll_summary PDF is stored, byte-extracted and NOW facts-readable (#945), and still NEVER operation-executable", async () => {
  const c = await capability("pdf", "payroll_summary");
  assert.equal(c.custody, "supported");
  assert.equal(c.byte_extraction, "supported");
  assert.equal(c.typed_facts, "supported", "the router's payroll_facts lane reads this pair (#945)");
  assert.notEqual(c.business_operation, "supported",
    "nothing is posted from a payroll read: #945 is the reading half, #946 the drafting one");
  assert.equal(c.limits.payroll_employee_detail, "accepted_limitation",
    "the per-employee detail is a named, permanent boundary — the persist door strips the quotes");
  // A format the router's pdf/image branch never reaches keeps its pre-#945 verdict, which is
  // what makes the six-row scope of the re-derivation checkable from outside the migration.
  const csv = await capability("csv", "payroll_summary");
  assert.equal(csv.typed_facts, "stored_only", "a csv payroll export has no reader on this lane");
});

cell("consent_evidence is facts-UNSUPPORTED and operation-UNSUPPORTED on every format (0014/H-53)", async () => {
  const rows = (await rootQuery(
    "select format, typed_facts, business_operation from clara.document_capabilities where document_kind='consent_evidence'")).rows;
  assert.equal(rows.length, Object.keys(FORMATS).length);
  for (const r of rows) {
    assert.equal(r.typed_facts, "unsupported", `${r.format}: consent evidence is structurally exempt from facts extraction`);
    assert.equal(r.business_operation, "unsupported", `${r.format}: consent evidence never carries an entry`);
  }
});

cell("business_operation never claims 'supported' where typed_facts is not supported — Clara cannot drive what it cannot read", async () => {
  const rows = (await rootQuery(
    `select format, document_kind, typed_facts, business_operation
       from clara.document_capabilities
      where business_operation='supported' and typed_facts<>'supported'`)).rows;
  assert.deepEqual(rows, [], "an operation promised over facts that do not exist");
});

// #988 — proposal_only's OWN honesty rule, stated the same way its sibling above is: a repeatable
// TEST cell, never a table CHECK. The pre-existing rule for `supported` has ALWAYS lived only
// here (and, once, in 0191's own apply-time tail) — never as a cross-column CHECK constraint —
// and #988's brief names this cell "the existing check" the new rule sits beside, so the new rule
// is added the same way rather than minting a mechanism the estate does not otherwise use for
// this family of invariant.
cell("proposal_only reclassifies no row for #988 itself, and business_operation never claims it where typed_facts is not supported (the new level's own honesty rule)", async () => {
  const rows = (await rootQuery(
    `select format, document_kind, typed_facts from clara.document_capabilities
      where business_operation = 'proposal_only'`)).rows;
  assert.deepEqual(rows, [],
    "the owner named no row for #988's migration -- prior_gl stays stored_only pending the Client KB (#983/#1012)");
  const violations = (await rootQuery(
    `select format, document_kind from clara.document_capabilities
      where business_operation = 'proposal_only' and typed_facts <> 'supported'`)).rows;
  assert.deepEqual(violations, [], "a proposal promised over facts that do not exist");
});

// ---------------------------------------------------------------------------------------------
// THE READER — honest defaults for the two unknowns.
// ---------------------------------------------------------------------------------------------

cell("an UNKNOWN (format, kind) pair reads typed_facts='unsupported' — the honest default, never a silent yes", async () => {
  const c = await capability("zzz_not_a_format", "invoice");
  assert.equal(c.known_pair, false);
  assert.equal(c.typed_facts, "unsupported");
  assert.equal(c.business_operation, "unsupported");
  assert.equal(c.custody, "unsupported", "a format the intake never admits has no custody to claim either");
});

cell("a NOT-YET-CLASSIFIED document reads its real custody and byte_extraction but promises NO facts level", async () => {
  const c = await capability("pdf", null);
  assert.equal(c.kind_known, false, "the reader says out loud that the kind is not yet known");
  assert.equal(c.custody, "supported");
  assert.equal(c.byte_extraction, "supported");
  assert.equal(c.typed_facts, "unsupported", "no facts promise can be made before the kind is known");
  assert.equal(c.business_operation, "unsupported");
});

cell("clara._document_format resolves every canonical mime AND the live alias spellings, and refuses everything else", async () => {
  for (const [format, mime] of Object.entries(FORMATS)) {
    const r = (await rootQuery("select clara._document_format($1) as f", [mime])).rows[0].f;
    assert.equal(r, format, `${mime} must resolve to ${format}`);
  }
  for (const [declared, format] of [
    ["text/xml", "xml"], ["application/ofx", "ofx"], ["application/x-qfx", "ofx"],
    ["application/vnd.intu.qfx", "ofx"], ["application/csv", "csv"], ["APPLICATION/PDF", "pdf"],
  ]) {
    const r = (await rootQuery("select clara._document_format($1) as f", [declared])).rows[0].f;
    assert.equal(r, format, `${declared} must resolve to ${format}`);
  }
  for (const junk of ["application/zip", "", null, "text/plain"]) {
    const r = (await rootQuery("select clara._document_format($1) as f", [junk])).rows[0].f;
    assert.equal(r, null, `${junk} must not resolve to a format`);
  }
});

// ---------------------------------------------------------------------------------------------
// THE WALL — the registry is a READ surface, never a writable one.
// ---------------------------------------------------------------------------------------------

cell("the registry is forced-RLS, readable by the app roles and writable by none of them", async () => {
  const r = (await rootQuery(`select
      c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
      (select count(*)::int from pg_policies p where p.schemaname='clara' and p.tablename='document_capabilities') as policies,
      has_table_privilege('clara_authenticated','clara.document_capabilities','SELECT') as auth_read,
      has_table_privilege('clara_authenticated','clara.document_capabilities','INSERT') as auth_insert,
      has_table_privilege('clara_authenticated','clara.document_capabilities','UPDATE') as auth_update,
      has_table_privilege('clara_authenticated','clara.document_capabilities','DELETE') as auth_delete,
      has_table_privilege('clara_agent_ro','clara.document_capabilities','SELECT') as agent_read,
      (select count(*)::int from pg_policies p where p.schemaname='clara'
        and p.tablename='document_capabilities' and 'clara_agent_ro' = any (p.roles)) as agent_policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_capabilities'`)).rows[0];
  assert.equal(r.enabled, true, "RLS enabled");
  assert.equal(r.forced, true, "RLS forced");
  assert.equal(r.policies, 2, "owner ALL + the HUMAN lane's SELECT, and nothing else");
  assert.equal(r.auth_read, true, "the workbench renders this registry");
  // THE AGENT LANE HOLDS NO TABLE PRIVILEGE, and that is the design rather than an omission --
  // 0165's ruling for its twin (clara.document_kind_codeability: "clara_agent_ro holds NO table
  // privilege and reaches the vocabulary only through clara._is_codeable_kind"), and the law
  // rig-runtime-visibility.test.mjs's §6 agent sweep states for every new table. What the lane
  // holds instead is the next cell's three SECURITY DEFINER doors; a `using (true)` policy for a
  // role that already holds those measures nothing, so the policy must not name it either.
  assert.equal(r.agent_read, false,
    "clara_agent_ro holds SELECT on the registry table — it reads the registry through " +
    "clara._document_capability / clara.get_document_state, never off the table");
  assert.equal(r.agent_policies, 0,
    "a document_capabilities policy still names clara_agent_ro — a policy for a role with no grant measures nothing");
  assert.equal(r.auth_insert, false);
  assert.equal(r.auth_update, false);
  assert.equal(r.auth_delete, false);
});

cell("clara._document_capability is EXECUTE-granted to both application read lanes", async () => {
  const r = (await rootQuery(`select
      has_function_privilege('clara_authenticated','clara._document_capability(text,text)','EXECUTE') as a,
      has_function_privilege('clara_agent_ro','clara._document_capability(text,text)','EXECUTE') as b,
      has_function_privilege('clara_authenticated','clara.get_document_state(uuid,uuid)','EXECUTE') as c,
      has_function_privilege('clara_agent_ro','clara.get_document_state(uuid,uuid)','EXECUTE') as d`)).rows[0];
  assert.equal(r.a, true);
  assert.equal(r.b, true);
  assert.equal(r.c, true);
  assert.equal(r.d, true);
});

// A control so the CLR10 import is not dead weight: the registry's own level CHECK refuses a
// value outside the closed set even through the owner role.
cell("CONTROL: an out-of-set level is refused by the table's own CHECK, not merely by convention", async () => {
  const err = await caught(() => rootQuery(
    `insert into clara.document_capabilities(format,document_kind,mime_type,custody,byte_extraction,
        typed_facts,business_operation,engine_id,engine_byte,registry_version,basis)
     values ('zzz','invoice','application/zzz','supported','supported','maybe','supported',null,null,1,'probe')`));
  assert.ok(err, "an out-of-set level was accepted");
  assert.equal(err.code, "23514", `expected a CHECK violation, got ${err.code} (${CLR10} is the migration's own code)`);
});

// ---------------------------------------------------------------------------------------------
// #779 — THE VERSION WALL. `registry_version` monotonicity was CONVENTION (0191's header prose
// and this file's own table-wide "exactly one distinct version" cell); 0207 makes it a DATABASE
// refusal. A column CHECK cannot see the value it replaces, so the invariant is a BEFORE UPDATE
// trigger comparing OLD to NEW on the same (format, document_kind) key.
//
// THE OWNER CONNECTION IS THE ONLY WRITER THERE IS, and that is why these probes run through it.
// The table is forced-RLS with an owner `for all` policy, `clara_authenticated` holds SELECT
// only and `clara_agent_ro` holds no table privilege at all — so a wall enforced by grants or by
// RLS would not reach the one role that can actually lower a version. The trigger does.
// ---------------------------------------------------------------------------------------------

monotoneCell("an UPDATE that LOWERS registry_version for an existing (format, kind) row is refused BY THE DATABASE", async () => {
  const stored = await inRolledBackTxn(async (c) => {
    // Raise first, so the refusal below is unambiguously the TRANSITION wall and not the
    // column's own `registry_version >= 1` positivity CHECK: a "one lower than the current
    // value" probe against a low published version could be 0 and would trip that CHECK too.
    // Raised to one ABOVE whatever the registry publishes and then lowered to 3, so the probe
    // stays a clean transition test at every published version this registry has had — a raise
    // to a literal below the published version would itself be the refusal under test (#948:
    // measured, when 0299 carried the registry to 6 and the literal `5` became a lowering).
    await c.query(`update clara.document_capabilities set registry_version = ${PUBLISHED_REGISTRY_VERSION + 1} ${PDF_INVOICE}`);
    // A savepoint, so the REFUSED statement aborts only its own sub-transaction and the row can
    // still be re-read afterwards — the refusal is the subject, and an aborted outer transaction
    // would hide whether the stored value moved.
    await c.query("savepoint probe_779");
    const err = await caught(() => c.query(
      `update clara.document_capabilities set registry_version = 3 ${PDF_INVOICE}`));
    await c.query("rollback to savepoint probe_779");
    assert.ok(err, "a BACKWARDS registry_version was accepted — monotonicity is still only a convention");
    assert.equal(err.code, CLR08,
      `expected the immutability-family code ${CLR08} (0193's "a plan revision number never goes backwards"), got ${err.code}`);
    const detail = JSON.parse(err.detail ?? "{}");
    assert.equal(detail.reason, "registry_version_monotone",
      "the refusal must carry a MACHINE-READABLE reason, so a caller classifies it by code and reason rather than by message text");
    assert.equal(detail.column, "registry_version");
    assert.equal(detail.format, "pdf");
    assert.equal(detail.document_kind, "invoice");
    // The refused UPDATE changed nothing: the row still carries what the successful raise left.
    return (await c.query(`select registry_version from clara.document_capabilities ${PDF_INVOICE}`))
      .rows[0].registry_version;
  });
  assert.equal(stored, PUBLISHED_REGISTRY_VERSION + 1,
    "the refused UPDATE must leave the stored registry_version exactly as it was");
});

monotoneCell("an UPDATE that RAISES registry_version, and one that leaves it UNCHANGED while changing another column, both still succeed", async () => {
  const seen = await inRolledBackTxn(async (c) => {
    const raised = (await c.query(
      `update clara.document_capabilities set registry_version = registry_version + 1 ${PDF_INVOICE}
         returning registry_version`)).rows[0].registry_version;
    // UNCHANGED version, a different column moving — the ordinary corrective republish.
    const same = (await c.query(
      `update clara.document_capabilities set limits = limits || '{"probe_779":"transient"}'::jsonb ${PDF_INVOICE}
         returning registry_version, limits`)).rows[0];
    return { raised, same: same.registry_version, limits: same.limits };
  });
  // +1 from whatever the registry publishes: 2 before #656, 3 after 0228 republished at 2, 4
  // after 0245 republished at 3 (#782). The SUBJECT of this cell is the transition (a raise is
  // admitted, an unchanged version beside another column's move is admitted), never the absolute
  // number — so the number is derived from the one literal above and re-bases with it.
  assert.equal(seen.raised, PUBLISHED_REGISTRY_VERSION + 1, "raising registry_version must still succeed");
  assert.equal(seen.same, PUBLISHED_REGISTRY_VERSION + 1, "an UPDATE that does not touch registry_version leaves it where it was");
  assert.equal(seen.limits.probe_779, "transient", "the non-version column change was accepted");
  assert.equal(seen.limits.invoice_line_items, "accepted_limitation", "the existing named limit survived the probe write");
});

monotoneCell("ROLLBACK HYGIENE — after the probes the registry is byte-identical: one distinct version, the seeded verdicts and limits intact", async () => {
  const r = (await rootQuery(
    `select count(distinct registry_version)::int as versions,
            min(registry_version)::int as v,
            count(*) filter (where limits ? 'probe_779')::int as probe_limits
       from clara.document_capabilities`)).rows[0];
  assert.equal(r.versions, 1, "a probe write survived: the registry no longer publishes exactly one version");
  // 1 until #656; 2 since 0228 republished the whole registry; 3 since 0245 republished it again
  // (#782; see PUBLISHED_REGISTRY_VERSION). The claim is unchanged — the probes above left
  // NOTHING behind — only the published number is.
  assert.equal(r.v, PUBLISHED_REGISTRY_VERSION, "a probe write survived: the published registry_version moved");
  assert.equal(r.probe_limits, 0, "a probe `limits` write survived on some row");
  const pdf = (await rootQuery(`select registry_version, limits from clara.document_capabilities ${PDF_INVOICE}`)).rows[0];
  assert.equal(pdf.registry_version, PUBLISHED_REGISTRY_VERSION, "the probed row's own version is back where it started");
  assert.deepEqual(
    pdf.limits,
    { invoice_line_items: "accepted_limitation", invoice_line_items_reason: "no_consumer_reads_line_facts" },
    "the probed row's limits are back where they started",
  );
  const ofx = (await rootQuery(
    "select byte_extraction, typed_facts from clara.document_capabilities where format='ofx' and document_kind='bank_statement'")).rows[0];
  assert.equal(ofx.byte_extraction, "stored_only");
  assert.notEqual(ofx.typed_facts, "supported");
  // The positivity CHECK stays EXACTLY as 0191 wrote it: the trigger constrains TRANSITIONS,
  // the CHECK constrains VALUES, and #779 replaces neither with the other.
  const positivity = (await rootQuery(
    `select count(*)::int as n from pg_constraint
      where conrelid = 'clara.document_capabilities'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%registry_version >= 1%'`)).rows[0].n;
  assert.equal(positivity, 1, "0191's registry_version >= 1 positivity CHECK must still be on the column");
});

// ---------------------------------------------------------------------------------------------
// #988 — business_operation's FIFTH LEVEL. `document_capabilities_business_operation_check`
// widens (0246_business_operation_proposal_only.sql); custody, byte_extraction and typed_facts
// stay on the original four (out of scope, the ticket's own words). Behavioural, not merely
// textual: this cell PROVES the CHECK actually admits the new value (not only that its
// pg_get_constraintdef mentions the token) and PROVES the honesty rule above actually
// discriminates rather than passing only because zero real rows carry the level yet.
// ---------------------------------------------------------------------------------------------

proposalLevelCell(
  "business_operation admits proposal_only, distinct from stored_only, and the level's own honesty rule actually discriminates",
  async () => {
    const seen = await inRolledBackTxn(async (c) => {
      // (a) A pair whose typed_facts IS supported may carry the new level — exactly the shape
      // #988 exists for: Clara reads deterministically and proposes. pdf x invoice's typed_facts
      // is 'supported' (this file's own cell above), so this is an HONEST use of the level.
      const honest = (await c.query(
        `update clara.document_capabilities set business_operation = 'proposal_only' ${PDF_INVOICE}
           returning business_operation`)).rows[0].business_operation;

      // (b) The SAME level over a pair whose typed_facts is NOT supported (ofx x bank_statement,
      // C-37) is the exact over-claim #988's honesty invariant exists to catch. The CHECK itself
      // has no opinion on typed_facts — only the cross-column rule does — so this UPDATE succeeds
      // and the invariant query below must be what flags it.
      await c.query(
        "update clara.document_capabilities set business_operation = 'proposal_only' "
        + "where format = 'ofx' and document_kind = 'bank_statement'");
      const violations = (await c.query(
        `select format, document_kind from clara.document_capabilities
          where business_operation = 'proposal_only' and typed_facts <> 'supported'`)).rows;

      return { honest, violations };
    });
    assert.equal(seen.honest, "proposal_only",
      "the CHECK refused a value document-capability-registry.test.mjs itself now names as admitted");
    assert.notEqual(seen.honest, "stored_only", "the new level must not collapse into stored_only");
    assert.deepEqual(seen.violations, [{ format: "ofx", document_kind: "bank_statement" }],
      "the new level's own honesty rule must actually flag a pair proposing from facts it does not have, not merely pass because no real row uses the level yet");
  },
);

proposalLevelCell(
  "the CHECK still refuses a sixth, out-of-set value — widening the vocabulary did not remove the wall", async () => {
    const err = await caught(() => rootQuery(
      `insert into clara.document_capabilities(format,document_kind,mime_type,custody,byte_extraction,
          typed_facts,business_operation,engine_id,engine_byte,registry_version,basis)
       values ('zzz988','invoice','application/zzz988','supported','supported','supported','maybe_someday',null,null,1,'probe')`));
    assert.ok(err, "an out-of-set level was accepted after #988 widened the CHECK");
    assert.equal(err.code, "23514", `expected a CHECK violation, got ${err.code}`);
  },
);
