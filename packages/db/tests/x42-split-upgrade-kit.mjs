// WAVE D-b SPLIT — THE SHARED UPGRADE-DRILL KIT.
//
// census §6 ADJUDICATED: ONE DRILL PER SLICE, four drills — because each slice has a
// DIFFERENT deploy risk against a database that already has a book (D-b0 alone carries
// `cost_cents SET NOT NULL` against a populated register plus 25 live-body splices; D-b1
// the four new tables + `t_je_adv_movement_belt` ON clara.journal_entries; D-b3 the
// bank_matches widening against live match rows; D-b2 the three adjustment tables + the
// two journal_entries hot-loop indexes) and each slice's FRONTIER differs.
//
// This kit is the part of `x42-0042-upgrade.test.mjs` that is IDENTICAL in all four: the
// pre-0042 staging, the book the drill builds through the AUDITED 0037–0041 verbs, and the
// shared catalog probes. Every drill file below owns only its OWN slice's post-state claims
// plus the REGRESSION FLOOR of the slices before it (census §6: "D-b2's drill still asserts
// D-b0's cost_cents post-state").
//
// MIGRATIONS DIRECTORY. In each slice's own PR `packages/db/migrations` IS that slice's
// chain, so the default resolves correctly and nothing needs setting. `CLARA_MIGRATIONS_DIR`
// is honoured first so ONE checkout can exercise all four chains (E17's instrument law: a
// sweep against a slice-shaped rig must name the migrations copy the rig was built from, or
// the rig's own ensureReady() re-migrate fails its history-integrity check).
//
// RESET-GATED (drops schema clara) — every drill runs ALONE, in its own throwaway DB.

import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk, idOf, noteLane,
  freshResolution, draftEntryV3, approveEntry, createClient, upsertAccountClassed, grantConsent,
  x41EnsureReady, mon,
  upsertFaProfile, completeParticulars, proposeAuthority, signAuthority, runPeriod, runDue, reviseParticulars,
  faRow, entryRowOf, wb,
} from "./x41-fa-world.mjs";
import {
  addBankAccount, enterStatement, settleFromBankLine,
  matchRow, matchIdOf, birthCounterparty, counterpartyStampedItem,
  BANKCOA1, AR1, REVN, EXPN,
} from "./x38-match-fixtures.mjs";
// F-A3 PR-3 RETIREMENT SUCCESSION (migration 0129) — split into its own module to keep this
// file under the repo's 500-line cap; see that file's header for the full "why". Used by
// assertB3Floor() below, and re-exported so a drill can ask the same succession question.
import {
  RETIREMENT_WITNESS_SIG, RETIRED_BANK_RULE_SIGS, SURVIVING_BANK_LINE_SIGS, sigExists,
  assertB3ProducerSuccession,
} from "./x42-b3-retirement-succession.mjs";

export const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
export const MIG_DIR =
  process.env.CLARA_MIGRATIONS_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** The drill's own FA chart (the bank side reuses x38-match-fixtures.mjs's OWN codes —
 *  every drill is reset-gated and runs alone, so there is no cross-battery collision). */
export const COST = "200-U42";
export const ACCUM = "210-U42";
export const EXPN_FA = "900-U42";
export { BANKCOA1, AR1, REVN, EXPN };

/** Copy a SUBSET of MIG_DIR into a throwaway dir: every migration whose four-digit prefix
 *  passes `keep(num)`. This is how a drill stages a CEREMONY-SHAPED chain — the D-a frontier,
 *  one slice, or (the out-of-order probe) a chain with a slice deliberately missing. */
export function exportChain(keep, tag = "chain") {
  const tmp = mkdtempSync(join(tmpdir(), `clara-${tag}-`));
  for (const f of readdirSync(MIG_DIR)) {
    const m = /^(\d{4})_.*\.sql$/.exec(f);
    if (m && keep(Number(m[1]))) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

/** Copy 0001–0041 (the D-a frontier — NOT any D-b slice) into a throwaway dir. */
export function exportPre0042() {
  return exportChain((n) => n >= 1 && n <= 41, "pre0042");
}

export function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

/** Bring the schema fully up FIRST (so x41EnsureReady's 0041 gate passes and it memoises the
 *  DB-clock anchor), then reset and stage back down to 0001..0041. ORDER IS LOAD-BEARING and
 *  it is the opposite of the obvious one — see x42-0042-upgrade.test.mjs's own comment: called
 *  after the staging, x41EnsureReady's best-effort migrate() silently re-applies the whole
 *  chain and destroys the premise the drill exists to establish. */
export async function freshDb() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  await x41EnsureReady();
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0042(), log: () => {} });
  return { migrate };
}

// --- shared catalog probes -------------------------------------------------------

export const tableExists = async (name) => (await rootQuery(
  "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'", [name])).rowCount > 0;
export const columnExists = async (table, column) => (await rootQuery(
  "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2", [table, column])).rowCount > 0;
export const columnNullable = async (table, column) => (await rootQuery(
  "select is_nullable from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2", [table, column])).rows[0]?.is_nullable ?? null;
export const rlsForced = async (name) => (await rootQuery(
  "select relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1", [name])).rows[0];
export const triggerCount = async (name) => Number((await rootQuery(
  "select count(*)::int as n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and not t.tgisinternal", [name])).rows[0].n);
export const triggerExists = async (table, trigger) => (await rootQuery(
  "select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and t.tgname=$2 and not t.tgisinternal", [table, trigger])).rowCount > 0;
export const indexDef = async (name) => (await rootQuery(
  "select indexdef from pg_indexes where schemaname='clara' and indexname=$1", [name])).rows[0]?.indexdef ?? null;
export const fnExists = async (name) => (await rootQuery(
  "select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1", [name])).rowCount > 0;
export const eventRegistered = async (type) => (await rootQuery(
  "select 1 from clara.event_types where name=$1", [type])).rowCount > 0;
export const taxonomyDecision = async (type) => {
  const v = (await rootQuery("select version from clara.taxonomy_active")).rows[0]?.version;
  const r = await rootQuery("select decision from clara.trigger_taxonomy where event_type=$1 and version=$2", [type, v]);
  return r.rowCount === 1 ? r.rows[0].decision : null;
};
export const appliedCount = async (re) => Number((await rootQuery(
  "select count(*)::int as n from clara.schema_migrations where version ~ $1", [re])).rows[0].n);

/** ------------------------------------------------------------------------------------------
 *  FRONTIER PREDICATES BY STABLE NAME, NEVER BY NUMBER  [light re-confirm RC4 / LENS-3]
 *  ------------------------------------------------------------------------------------------
 *  Each drill legitimately pins ITS OWN number (RENUMBER.md §2(4) renames the drill file and
 *  re-points those pins in the same breath, and the pin is what proves the drill ran at the
 *  frontier it is named for). What must NOT be numeric is a pin in this SHARED module: the four
 *  floors below run at four different frontiers and are read by four drills, so a `^0045_` here
 *  is a number nobody's renumber ceremony owns. The slice NAME never moves — key on it.
 *  Used by assertB3Floor()'s withheld-grant arm; exported so a drill can ask the same question. */
export const V_B0 = "^[0-9]{4}_wave_d_b0_shared_authorities$";
export const V_B1 = "^[0-9]{4}_wave_d_b1_staff_advances$";
export const V_B3 = "^[0-9]{4}_wave_d_b3_af2_composite$";
export const V_B2 = "^[0-9]{4}_wave_d_b2_recurring_adjustments$";
export const grantedTo = async (fn, role) => (await rootQuery(
  `select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1
     and has_function_privilege($2, p.oid, 'EXECUTE')`, [fn, role])).rowCount > 0;

export { RETIREMENT_WITNESS_SIG, RETIRED_BANK_RULE_SIGS, SURVIVING_BANK_LINE_SIGS, sigExists };

/** A body with its SQL comments removed — block comments first, then line comments. The house
 *  `stripSqlComments` idiom (x41-surface.test.mjs, tail 3's two-instrument lesson), and the
 *  split makes it MANDATORY for any absence probe: every extracted slice carries `[SPLIT D-bN]`
 *  notes that NAME the later-slice objects the slice deliberately does not ship, and
 *  `pg_get_functiondef` returns those comments verbatim. R1 self-caught the same trap inside
 *  the migration (a split NOTE naming clara.adjustment_templates failed the block's OWN absence
 *  census); this is its test-side twin. */
export const stripSqlComments = (src) => (src ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

/** The COMMENT-STRIPPED definition of a clara function — the instrument every absence probe
 *  in these drills uses, so a split note can never be mistaken for a dependency. */
export const strippedDef = async (name) => stripSqlComments((await rootQuery(
  "select pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1",
  [name])).rows[0]?.def ?? null);

export const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });
export const exceptBankLine = async (sub, { line, kind, reason, opKey }) => (await humanQuery(sub, namedCall("except_bank_line", [
  { name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" },
]), [line, kind, reason, opKey ?? opk("u42exc")])).rows[0].result;

// --- THE BOOK -------------------------------------------------------------------

/** Build the pre-slice book through the AUDITED 0037–0041 verbs: a real FA lineage edge, a
 *  signed depreciation authority and ONE posted charge (with work still due afterwards), a
 *  LIVE bank match, a HIGH-STAKES PENDING bank match, and an OPEN bank exception.
 *  This is byte-for-byte the shape x42-0042-upgrade.test.mjs builds — the four drills differ
 *  only in what they claim about the apply, never in what they deploy onto. */
export async function buildPre0042Book() {
  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `u42_${randomUUID().slice(0, 6)}`, opKey: opk("u42cli") });
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});

  for (const [code, name, type, klass] of [
    [COST, "Plant (u42)", "asset", null], [ACCUM, "Accum Depr (u42)", "asset", null],
    [EXPN_FA, "Depreciation Expense (u42)", "expense", null],
    [BANKCOA1, "Bank (u42)", "asset", null], [AR1, "Trade Debtors (u42)", "asset", "receivable"],
    [REVN, "Revenue (u42)", "income", null], [EXPN, "Sundry (u42)", "expense", null],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: klass, opKey: opk("u42coa") });
  }

  await upsertFaProfile(sub, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPN_FA });
  const acqDate = mon(-6).start;
  const acq = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "u42 acquisition", postingDate: acqDate,
    lines: [
      { account_code: COST, debit_cents: 240_000, credit_cents: 0, description: "asset" },
      { account_code: BANKCOA1, debit_cents: 0, credit_cents: 240_000, description: "paid" },
    ],
    opKey: opk("u42acq"),
  });
  await approveEntry(sub, { entry: acq.entry_id, expectedRevision: acq.revision_token, opKey: opk("u42acqa") });
  const born = (await rootQuery("select id from clara.fixed_assets where acquisition_entry_id=$1", [acq.entry_id])).rows[0];
  assert.ok(born?.id, "mandatory setup: the acquisition soft-birthed a register row");
  await completeParticulars(sub, {
    client, asset: born.id,
    particulars: { method: "straight_line", useful_life_months: 24, residual_cents: 0, start_date: acqDate, description: "u42 asset" },
  });
  await reviseParticulars(sub, {
    client, asset: born.id, effectiveFrom: mon(-4).start,
    particulars: { method: "straight_line", useful_life_months: 20, residual_cents: 0, start_date: acqDate, description: "u42 asset revised" },
  });
  const predecessor = await faRow(born.id);
  assert.ok(predecessor.superseded_by_asset_id, "mandatory setup: a REAL lineage edge exists pre-apply");

  const propAuth = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  await signAuthority(w.users.hana, { client, authority: idOf(propAuth, "authority_id", "id") });

  // Drive the sweep through the DUE ORACLE (D-a refuses an out-of-order period), and STOP at
  // the first real charge so there is genuinely work still due AFTER the apply.
  let rampEntryId = null;
  for (let i = 0; i < 24; i++) {
    const due = await runDue(client);
    if (!due?.due) break;
    const r = await runPeriod({ client, periodStart: due.period_start, periodEnd: due.period_end });
    const entryId = r?.entry_id ?? null;
    if (!entryId) continue;
    const row = await entryRowOf(entryId);
    if (row?.status === "draft") {
      await approveEntry(sub, { entry: entryId, expectedRevision: row.revision_token, opKey: opk(`u42ramp${i}`) });
    }
    rampEntryId = entryId;
    break;
  }
  assert.ok(rampEntryId, "mandatory setup: draining the due oracle minted at least one depreciation charge");
  assert.equal((await entryRowOf(rampEntryId)).status, "approved", "mandatory setup: one live depreciation charge exists pre-apply");

  const bankAcct = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: `u42${randomUUID().slice(0, 10)}`, coaAccountCode: BANKCOA1 });
  const bankAccountId = idOf(bankAcct, "bank_account_id", "id");
  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAccountId, periodStart: "2033-01-01", periodEnd: "2033-01-31", opening: 0, keepPeriod: true,
    specs: [
      { amountCents: 5_000, entryDate: "2033-01-05", description: "u42 live deposit" },
      { amountCents: 2_500_000, entryDate: "2033-01-10", description: "u42 pending deposit" },
      { amountCents: -900, entryDate: "2033-01-15", description: "u42 excepted debit" },
    ],
  });
  const cpLive = await birthCounterparty(sub, { client, name: `u42 live cust ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const invLive = await counterpartyStampedItem(sub, { client, domain: "ar", cp: cpLive, cpKind: "customer", cents: 5_000, control: AR1 });
  const liveMatch = matchIdOf(await settleFromBankLine(sub, {
    client, line: stmt.lines[0].id, counterparty: cpLive, allocations: [{ item_id: invLive.item, amount_cents: 5_000 }], memo: "u42 live settle",
  }));
  assert.equal((await matchRow(liveMatch)).status, "live", "mandatory setup: a genuinely LIVE bank match exists pre-apply");

  const cpPending = await birthCounterparty(sub, { client, name: `u42 pending cust ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const invPending = await counterpartyStampedItem(sub, {
    client, domain: "ar", cp: cpPending, cpKind: "customer", cents: 2_500_000, control: AR1, checker: w.users.bob,
  });
  const pendingMatch = matchIdOf(await settleFromBankLine(sub, {
    client, line: stmt.lines[1].id, counterparty: cpPending,
    allocations: [{ item_id: invPending.item, amount_cents: 2_500_000 }], memo: "u42 pending settle (high-stakes)",
  }));
  assert.equal((await matchRow(pendingMatch)).status, "pending", "mandatory setup: a genuinely PENDING bank match exists pre-apply");

  await exceptBankLine(sub, { line: stmt.lines[2].id, kind: "bank_error", reason: "u42 disputed debit" });
  const exceptionId = (await rootQuery("select id from clara.bank_line_exceptions where line_id=$1 and status='open'", [stmt.lines[2].id])).rows[0]?.id;
  assert.ok(exceptionId, "mandatory setup: an OPEN bank exception exists pre-apply");

  return { w, sub, client, asset: born.id, rampEntryId, bankAccountId, stmt, liveMatch, pendingMatch, exceptionId };
}

// --- the shared POST-APPLY claims, per slice ------------------------------------

/** D-b0's floor (every later drill re-asserts it — census §6's regression-floor rule).
 *  `cost_cents` is the ceremony's own risk: SET NOT NULL against a POPULATED register. */
export async function assertB0Floor() {
  assert.equal(await columnExists("fixed_assets", "cost_cents"), true, "[D-b0 floor] fixed_assets.cost_cents exists");
  assert.equal(await columnNullable("fixed_assets", "cost_cents"), "NO", "[D-b0 floor] cost_cents is NOT NULL");
  assert.equal(await columnExists("journal_entries", "auto_reversal_of"), true, "[D-b0 floor] journal_entries.auto_reversal_of shipped early (census §4 Option A)");
  assert.equal(await columnNullable("journal_entries", "auto_reversal_of"), "YES", "[D-b0 floor] …nullable");
  assert.ok(await indexDef("uq_je_auto_reversal_of"), "[D-b0 floor] its partial unique index exists");
  for (const fn of ["_book_today", "_acct_role_reserved", "_acct_role_reserved_at", "_wdb_rerun_breach",
    "_wdb_correction_posting_date", "_assert_due_read_ctx", "_fa_role_claim_conflict"]) {
    assert.equal(await fnExists(fn), true, `[D-b0 floor] clara.${fn} exists`);
  }
}

/** D-b1's floor: the four advance relations, the ea1955 seed, the shared-table trigger, and
 *  the two entry_id indexes (census §4's ADJUDICATED "D-b1, TAIL 21 as its own tail"). */
export async function assertB1Floor() {
  for (const tbl of ["staff_advance_accounts", "staff_advances", "staff_advance_applications", "ea1955_policy"]) {
    assert.ok(await tableExists(tbl), `[D-b1 floor] clara.${tbl} exists`);
    const rls = await rlsForced(tbl);
    assert.ok(rls?.relrowsecurity && rls?.relforcerowsecurity, `[D-b1 floor] clara.${tbl} is RLS ENABLE+FORCE (got ${JSON.stringify(rls)})`);
    assert.ok((await triggerCount(tbl)) >= 1, `[D-b1 floor] clara.${tbl} carries at least one trigger`);
  }
  const facts = (await rootQuery("select fact from clara.ea1955_policy order by fact")).rows.map((r) => r.fact);
  assert.deepEqual(facts, ["s22_prior_month_wage_cap", "s24_2c_interest_free_recovery", "s27_no_interest"],
    `[D-b1 floor] the three EA1955 facts are seeded (got ${facts.join(",")})`);
  assert.equal(await triggerExists("journal_entries", "t_je_adv_movement_belt"), true,
    "[D-b1 floor] the advance movement belt lands on the SHARED clara.journal_entries");
  for (const ix of ["ix_staff_advances_entry", "ix_staff_advance_applications_entry"]) {
    assert.ok(await indexDef(ix), `[D-b1 floor] ${ix} exists (TAIL 21)`);
  }
  assert.equal(await fnExists("_wdb_reversal_blocked"), true, "[D-b1 floor] the reversal wall body exists");
  assert.equal(await fnExists("_adv_assert_proposal"), true, "[D-b1 floor] the ONE authoritative application guard exists");
}

/** D-b3's floor: the bank_matches widening (against LIVE rows), the set-once trigger, the
 *  reopen event, and the two s4 indexes. `handles` is buildPre0042Book()'s return. */
export async function assertB3Floor(handles) {
  for (const col of ["pending_resolution", "resolution_exception_id"]) {
    assert.equal(await columnExists("bank_matches", col), true, `[D-b3 floor] clara.bank_matches.${col} exists`);
  }
  assert.equal(await triggerExists("bank_matches", "t_bank_matches_resolution_exception_immutable"), true,
    "[D-b3 floor] the set-once trigger lands on clara.bank_matches");
  for (const m of [handles.liveMatch, handles.pendingMatch]) {
    const row = await matchRow(m);
    assert.equal(row.pending_resolution, null, `[D-b3 floor] match ${m}: pending_resolution lands NULL — the widening backfills nothing`);
    assert.equal(row.resolution_exception_id, null, `[D-b3 floor] match ${m}: resolution_exception_id lands NULL`);
  }
  assert.equal((await matchRow(handles.liveMatch)).status, "live", "[D-b3 floor] the live match's status is untouched");
  assert.equal((await matchRow(handles.pendingMatch)).status, "pending", "[D-b3 floor] the pending match's status is untouched");
  assert.equal(await eventRegistered("bank.line_exception_reopened"), true, "[D-b3 floor] the reopen event type is registered");
  assert.equal(await taxonomyDecision("bank.line_exception_reopened"), "ignore", "[D-b3 floor] …covered at the ACTIVE taxonomy version, decision 'ignore'");
  assert.ok(await indexDef("ix_ble_line"), "[D-b3 floor] ix_ble_line exists");
  assert.ok(await indexDef("uq_je_bank_rule_suggested_line"), "[D-b3 floor] uq_je_bank_rule_suggested_line exists");
  // [FIX WAVE W-B — CF-B3-1/CX1, SUCCESSION-AWARE per F-A3 PR-3 / 0129 — see
  // x42-b3-retirement-succession.mjs for the full "why"] the producer claims below flip WHOLE
  // once 0129 retires the bank-rules machine; branch on its exact-signature witness.
  await assertB3ProducerSuccession({ fnExists, grantedTo, appliedCount, V_B2 });
}

/** D-b2's floor: the three adjustment relations, the two hot-loop partial indexes and the
 *  posted event — the LAST slice, so this is also the whole unit's final post-state. */
export async function assertB2Floor() {
  for (const tbl of ["adjustment_templates", "adjustment_runs", "adjustment_pair_reversals"]) {
    assert.ok(await tableExists(tbl), `[D-b2 floor] clara.${tbl} exists`);
    const rls = await rlsForced(tbl);
    assert.ok(rls?.relrowsecurity && rls?.relforcerowsecurity, `[D-b2 floor] clara.${tbl} is RLS ENABLE+FORCE (got ${JSON.stringify(rls)})`);
    assert.ok((await triggerCount(tbl)) >= 1, `[D-b2 floor] clara.${tbl} carries at least one trigger`);
  }
  const ixDraft = await indexDef("ix_je_adj_draft");
  assert.ok(ixDraft && /status\s*=\s*'draft'/.test(ixDraft) && /recurring_adjustment/.test(ixDraft), `[D-b2 floor] ix_je_adj_draft exists with its WHERE clause (got ${ixDraft})`);
  const ixOcc = await indexDef("ix_je_adj_occurrence");
  assert.ok(ixOcc && /template_id/.test(ixOcc) && /period_start/.test(ixOcc), `[D-b2 floor] ix_je_adj_occurrence exists with its WHERE clause (got ${ixOcc})`);
  assert.equal(await eventRegistered("adjustment.posted"), true, "[D-b2 floor] the adjustment.posted event type is registered");
  assert.equal(await taxonomyDecision("adjustment.posted"), "ignore", "[D-b2 floor] …covered at the ACTIVE taxonomy version, decision 'ignore'");
  assert.equal(await grantedTo("run_adjustment_occurrence", "clara_runtime"), true,
    "[D-b2 floor] the ONLY two clara_runtime EXECUTE grants the whole unit adds land here");
  assert.equal(await grantedTo("adjustment_run_due", "clara_runtime"), true, "[D-b2 floor] …and the due probe");
}

/** THE SHARED "PRE-EXISTING BEHAVIOUR SURVIVES" PROBE. Every drill runs it: a depreciation
 *  run still posts (driven by the due oracle, because D-a refuses an out-of-order period —
 *  buildPre0042Book deliberately stopped after its first charge), and an ordinary bank settle
 *  still lives. This is the claim that makes a drill a DEPLOY drill rather than a schema diff. */
export async function assertPreExistingSurfacesStillWork(h, label) {
  const due2 = await runDue(h.client);
  assert.ok(due2?.due, `[${label}] mandatory setup: a depreciation period is still due after the apply`);
  const run2 = await runPeriod({ client: h.client, periodStart: due2.period_start, periodEnd: due2.period_end });
  assert.ok(run2?.entry_id, `[${label}] the post-apply sweep minted a charge entry`);
  const run2Entry = await entryRowOf(run2.entry_id);
  if (run2Entry.status === "draft") {
    await approveEntry(h.sub, { entry: run2.entry_id, expectedRevision: run2Entry.revision_token, opKey: opk("u42run2a") });
  }
  assert.equal((await entryRowOf(run2.entry_id)).status, "approved", `[${label}] a depreciation run still posts after the apply`);

  const cpPost = await birthCounterparty(h.sub, { client: h.client, name: `u42 post cust ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const invPost = await counterpartyStampedItem(h.sub, { client: h.client, domain: "ar", cp: cpPost, cpKind: "customer", cents: 7_000, control: AR1 });
  const stmt2 = await enterStatement(h.sub, {
    client: h.client, bankAccount: h.bankAccountId, periodStart: "2033-02-01", periodEnd: "2033-02-28", opening: 0,
    specs: [{ amountCents: 7_000, entryDate: "2033-02-05", description: "u42 post-apply deposit" }],
  });
  const postMatch = matchIdOf(await settleFromBankLine(h.sub, {
    client: h.client, line: stmt2.lines[0].id, counterparty: cpPost, allocations: [{ item_id: invPost.item, amount_cents: 7_000 }], memo: "u42 post-apply settle",
  }));
  assert.equal((await matchRow(postMatch)).status, "live", `[${label}] an ordinary bank settle still lives cleanly after the apply`);
  noteLane(`[${label}] pre-existing surfaces survive the apply: a depreciation run posts, an ordinary bank settle lives`);
}

/** EVERY function body a LATER slice creates, by slice. MEASURED, not enumerated by hand:
 *  each list is the set difference of `select distinct proname from pg_proc where
 *  pronamespace='clara'::regnamespace` between two adjacent frontier rigs built from the slice
 *  chains themselves (0043 minus 0042 · 0044 minus 0043 · 0045 minus 0044) — 24 + 16 + 36 = 76.
 *  A name that merely gets RE-CREATED by a later slice exists at both frontiers and is
 *  therefore (correctly) absent from these lists; only genuinely NEW names appear.
 *
 *  WHY THIS EXISTS [cross-lens F6]. The leak probe below used to check tables, columns and
 *  event types only, and FUNCTIONS are precisely where the split's risk lives: erratum E9's
 *  hazard is `create or replace` silently CREATING a body the slice never meant to ship, which
 *  leaves no table, no column and no event behind. Two decoy later-slice functions planted on a
 *  0042 frontier were missed by the old probe entirely. */
export const LATER_SLICE_BODIES = {
  advances: [
    "_adv_assert_proposal", "_adv_enrolment_admission", "_adv_enrolment_at",
    "_adv_entry_carries_correction", "_adv_net_applications", "_adv_on_approve",
    "_adv_outstanding", "_adv_over_application", "_adv_release_one_way",
    "_adv_reversal_admission", "_adv_reversal_blocked", "_adv_window_closed_under",
    "_tf_adv_movement_belt", "_tf_staff_advance_account_no_delete",
    "_tf_staff_advance_append_only", "_tf_staff_advance_application_correction_guard",
    "_wdb_reversal_blocked", "book_staff_advance_application",
    "complete_staff_advance_particulars", "enrol_staff_advance_account",
    "retire_staff_advance_account", "staff_advance_statement", "staff_advance_summary",
    "staff_advance_tie",
  ],
  af2: [
    "_allocate_payment_core", "_allocate_receipt_core", "_bank_adjustments_norm",
    "_bank_parked_cascade_admitted", "_bank_recon_snapshot_parked",
    "_settle_from_bank_line_core", "_settle_request_hash",
    "_tf_bank_matches_resolution_exception_immutable", "_wdb_assert_line_booking_lawful",
    "_wdb_born_in_booking_act", "_wdb_exception_booking_block", "_wdb_line_booking_block",
    "_wdb_suggestion_lines", "_wdb_suggestion_rule_hit", "accept_bank_rule_suggestion",
    "resolve_and_book_bank_line",
  ],
  adjustments: [
    "_adj_canon_lines", "_adj_correction_door", "_adj_occurrence_outstanding",
    "_adj_oldest_unmet_period", "_adj_on_approve", "_adj_period_end", "_adj_period_label",
    "_adj_period_start", "_adj_run_json", "_adj_run_occurrence_core", "_adj_template_hash",
    "_adj_template_json", "_pair_reverse_core",
    "_tf_adjustment_pair_reversal_no_commit_approving",
    "_tf_adjustment_pair_reversal_transition", "_tf_adjustment_run_immutable",
    "_tf_adjustment_template_transition", "_wdb_correction_admission", "_wdb_entry_shape",
    "_wdb_line_shape", "_wdb_overlapping_siblings", "_wdb_shape_overlap",
    "_wdb_template_ancestry", "_wdb_template_standing_charges", "adjustment_run_due",
    "approve_pair_reversal", "cancel_pair_reversal", "get_adjustment_run",
    "list_adjustment_runs", "list_adjustment_templates", "propose_adjustment_template",
    "retire_adjustment_template", "reverse_adjustment_pair", "run_adjustment_manual",
    "run_adjustment_occurrence", "sign_adjustment_template",
  ],
};

/** Assert that the slices AFTER this one have shipped NOTHING. The anti-"the split leaked"
 *  probe: a slice that quietly carries a later slice's object would green its own drill and
 *  break the ship order. Relations, columns and events — AND every later-slice FUNCTION BODY
 *  by name (F6): the E9 hazard leaves no other trace. */
export async function assertNoLaterSliceObjects({ advances = true, af2 = true, adjustments = true }) {
  if (advances) {
    for (const t of ["staff_advance_accounts", "staff_advances", "staff_advance_applications", "ea1955_policy"]) {
      assert.equal(await tableExists(t), false, `no later-slice leak: clara.${t} must NOT exist yet`);
    }
  }
  if (af2) {
    for (const c of ["pending_resolution", "resolution_exception_id"]) {
      assert.equal(await columnExists("bank_matches", c), false, `no later-slice leak: clara.bank_matches.${c} must NOT exist yet`);
    }
    assert.equal(await eventRegistered("bank.line_exception_reopened"), false, "no later-slice leak: the reopen event must NOT be registered yet");
  }
  if (adjustments) {
    for (const t of ["adjustment_templates", "adjustment_runs", "adjustment_pair_reversals"]) {
      assert.equal(await tableExists(t), false, `no later-slice leak: clara.${t} must NOT exist yet`);
    }
    assert.equal(await eventRegistered("adjustment.posted"), false, "no later-slice leak: adjustment.posted must NOT be registered yet");
  }
  const bodies = [
    ...(advances ? LATER_SLICE_BODIES.advances : []),
    ...(af2 ? LATER_SLICE_BODIES.af2 : []),
    ...(adjustments ? LATER_SLICE_BODIES.adjustments : []),
  ];
  const leaked = [];
  for (const fn of bodies) {
    if (await fnExists(fn)) leaked.push(fn);
  }
  assert.deepEqual(leaked, [], `no later-slice leak: ${leaked.length} later-slice FUNCTION BODIES exist at this frontier — ${leaked.join(", ")}`);
  noteLane(`no later-slice leak: ${bodies.length} later-slice function bodies all absent (advances=${advances} af2=${af2} adjustments=${adjustments})`);
}

export { rootQuery, humanQuery, namedCall, opk, idOf, noteLane, assert };
export { matchRow, matchIdOf, birthCounterparty, counterpartyStampedItem, settleFromBankLine, enterStatement };
export { runDue, runPeriod, entryRowOf, approveEntry, draftEntryV3, upsertAccountClassed, mon, wb };
