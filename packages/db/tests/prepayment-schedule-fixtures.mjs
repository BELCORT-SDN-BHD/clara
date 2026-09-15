// #653 — PREPAYMENT RECOGNITION AND AMORTISATION OVER AN EXPLICIT SERVICE PERIOD: the battery's
// gate, verb wrappers, scene builder and readers (NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it).
//
// IT JOINS TWO EXISTING WORLDS RATHER THAN BUILDING A THIRD, because #653's whole claim is that
// 0140's frozen evaluator and 0193's plan scheduler are ONE lane once a door ties them:
//
//   · `f-a4-pr2a-fixtures.mjs`'s `prepaidScene` supplies the PREPAYMENT half through governed
//     doors only — a closeable fiscal year, a verified document FILED to the client, a dedicated
//     prepaid-asset account, a dedicated expense target, and an APPROVED entry that binds the
//     document and debits exactly one asset line. A hand-built entry would prove the evaluator
//     reads rows, not that it reads BOOKS.
//   · `accounting-plans-fixtures.mjs` supplies the PLAN half — `instructionRef` (a real
//     `clara.accounting_work` row, because `create_accounting_plan` RESOLVES the authority), the
//     runtime scan, the catch-up door, the occurrence readers and the settle/post wrappers.
//
// EVERY DOOR CELL GOES THROUGH `humanQuery(sub, namedCall(...))` AS A BOOKKEEPER. The existing
// prepayment battery reaches the evaluator through `rootQuery` (`f-a4-pr2a-fixtures.mjs:178-179`),
// which is the defect gap-653 §AC8 diagnoses; repeating it here would repeat the defect. `rootQuery`
// appears below ONLY in readers that inspect a row the assertion is ABOUT, never as the caller of
// the door under test.
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`prepayment_amortisation$`), never its
// number — numbers are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs
// this package against databases pinned at EARLIER frontiers where none of these doors exists.
//
// THE PRE-INTEGRATION ESCAPE (`CLARA_ALLOW_MISSING_PREPAYMENT_0208`, set by
// prepayment-0208-preintegration-gate.mjs) is the package-wide sweep's own reason to be quiet. A
// FOCUSED run does not preload that module, so `assertPrepaymentCohortPresent` FAILS loudly there
// rather than skipping in silence: a skip is not evidence (WORK-ORDER item 7).

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk,
  instructionRef,
} from "./accounting-plans-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { prepaidScene, recordPeriod, account } from "./f-a4-pr2a-fixtures.mjs";

export * from "./accounting-plans-fixtures.mjs";
// …and the PREPAYMENT half. `account` is this module's only new spelling from that side; the plan
// chain exports neither it nor the scene builders, so no name is shadowed.
export { prepaidScene, recordPeriod, account };

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #653 migration's STABLE STEM. */
export const PREPAY_STEM = "prepayment_amortisation$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function prepaymentLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [PREPAY_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gatePrepayment(t)) return;` — the house per-cell frontier gate, COUNTED skip. */
export async function gatePrepayment(t) {
  if (await prepaymentLaneReady()) return false;
  markSkip();
  t.skip(`#653 prepayment-amortisation lane absent (no ${PREPAY_STEM} migration applied)`);
  return true;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. */
export async function assertPrepaymentCohortPresent(t) {
  if (await prepaymentLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_PREPAYMENT_0208 === "1") {
    markSkip();
    t.skip("#653 prepayment-amortisation lane absent (pre-integration sweep)");
    return true;
  }
  assert.fail(
    "#653: the prepayment-amortisation lane is absent. Apply the migration, or set "
    + "CLARA_ALLOW_MISSING_PREPAYMENT_0208=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on.
// ===========================================================================================

/** The typed `detail.reason` tokens #653's own door raises. The five prepayment tokens are
 *  0140's OWN spellings, re-derived rather than re-invented (brief: "Same tokens, no new ones"). */
export const PREPAY_REASON = {
  sourceUnfit: "prepayment_source_unfit",
  termUnderivable: "prepayment_term_underivable",
  targetIneligible: "prepayment_target_ineligible",
  targetUnderivable: "prepayment_target_underivable",
  belowGranularity: "prepayment_amount_below_period_granularity",
  scheduleExists: "prepayment_schedule_exists",
  scheduleNotFound: "prepayment_schedule_not_found",
  periodLineMissing: "amortisation_period_line_missing",
  // …and the 0193 tokens this lane inherits unchanged.
  planKindUnsupported: "plan_kind_unsupported",
  invalidSchedule: "invalid_schedule",
  invalidBasis: "invalid_basis",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  invalidOpKey: "invalid_op_key",
  authorityRefUnresolved: "authority_ref_unresolved",
  operationInFlight: "operation_in_flight",
};

export const AMORTISATION_KIND = "amortisation_schedule";
// `TZ` and `assert` already arrive through the star export above (accounting-plans-fixtures.mjs).
export const TARGET_BASIS =
  "#653 battery: the invoice narrates a twelve-month software subscription, charged to subscriptions";

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

export async function createPrepaymentSchedule(sub, {
  client, sourceEntry, expenseAccount, expenseBasis = TARGET_BASIS,
  purpose = "Prepaid subscription amortisation", authorityRef, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("create_prepayment_schedule", [
    { name: "p_client", cast: "uuid" }, { name: "p_source_entry", cast: "uuid" },
    { name: "p_expense_account", cast: "text" }, { name: "p_expense_basis", cast: "text" },
    { name: "p_purpose", cast: "text" }, { name: "p_authority_ref", cast: "jsonb" },
    { name: "p_op_key", cast: "text" },
  ]), [client, sourceEntry, expenseAccount, expenseBasis, purpose,
    JSON.stringify(authorityRef), opKey ?? opk("p653-create")]);
  return r.rows[0].result;
}

export async function getPrepaymentSchedule(sub, schedule) {
  const r = await humanQuery(sub, namedCall("get_prepayment_schedule", [
    { name: "p_schedule", cast: "uuid" },
  ]), [schedule]);
  return r.rows[0].result;
}

export async function listPrepaymentSchedules(sub, client) {
  const r = await humanQuery(sub, namedCall("list_prepayment_schedules", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

export async function listPrepaymentAttention(sub, client) {
  const r = await humanQuery(sub, namedCall("list_prepayment_attention", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · The scene.
// ===========================================================================================

/** Today, and the month arithmetic every scene is shaped against, computed IN POSTGRES in the
 *  plan's own zone. Never `new Date()`: the due arithmetic is Asia/Kuala_Lumpur's and a UTC
 *  "today" is a different calendar day for eight hours out of every twenty-four. */
export async function planCalendar() {
  const r = await rootQuery(
    `select ((now() at time zone $1)::date)::text as today,
            (date_trunc('month', (now() at time zone $1))::date)::text as month_start`, [TZ]);
  return r.rows[0];
}

/** `YYYY-MM-01` of the month `n` months before this one, in the plan zone. */
export async function monthStartBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', (now() at time zone $1)) - ($2 || ' months')::interval)::date)::text as d`,
    [TZ, String(n)]);
  return r.rows[0].d;
}

/** The last day of the month `k` months after `from`'s month. The same arithmetic
 *  `clara._plan_due_nth(..., 'last_day_of_month', ...)` performs, computed in Postgres for the
 *  same reason. */
export async function monthEndAfter(from, k) {
  const r = await rootQuery(
    `select ((date_trunc('month', $1::timestamp) + (($2 + 1) || ' months')::interval
              - interval '1 day')::date)::text as d`, [from, String(k)]);
  return r.rows[0].d;
}

/**
 * THE PREPAYMENT SCENE, shaped so its TERM is a whole number of calendar months ending in the
 * PAST where the cells need admissible occurrences.
 *
 * `termMonthsBack` is how many months before the current one the term's first charged month is;
 * `termMonths` is how many whole months it charges. The FISCAL YEAR is opened at the term's own
 * first day and runs twelve months, so a term of twelve months or fewer always sits inside ONE
 * opened year — the evaluator refuses a term that runs past its fiscal year with no open
 * successor (`0140:1097-1106`), and a scene that tripped that arm by accident would measure the
 * wrong refusal.
 *
 * The RECOGNITION ENTRY posts fourteen days into that year, binds the document and debits the
 * prepaid asset for `cents` — `prepaidScene`'s own shape, through `draft_entry`/`approve_entry`
 * with maker ≠ checker.
 */
export async function prepaymentScene(tag, {
  cents = 120000, termMonthsBack = 4, termMonths = 3, recordTerm = true,
} = {}) {
  const termStart = await monthStartBack(termMonthsBack);
  const termEnd = await monthEndAfter(termStart, termMonths - 1);
  const postingDate = await rootQuery("select (($1::date + 14))::text as d", [termStart])
    .then((r) => r.rows[0].d);
  const scene = await prepaidScene(tag, { cents, startsOn: termStart, postingDate });
  // THE TERM IS RECORDED BY THE BOOKKEEPER, not the owner: `record_document_service_period` is
  // bookkeeper-floored (`0140:944-959`) and a scene that only ever exercised it as an owner would
  // leave the floor itself unmeasured.
  if (recordTerm) {
    await recordPeriod(scene.bob, { document: scene.document, start: termStart, end: termEnd });
  }
  const ref = await instructionRef({ client: scene.client, author: scene.bob });
  return { ...scene, termStart, termEnd, postingDate, authorityRef: ref, termMonths };
}

/** A SECOND expense account on this client's chart, for the target cells. */
export async function expenseAccount(sub, client, { code, name = "Other subscriptions" }) {
  return account(sub, { client, code, name, type: "expense" });
}

// ===========================================================================================
// 5 · Readers. `rootQuery` ONLY — each of these inspects a row the assertion is ABOUT, never
//     the door under test.
// ===========================================================================================

export async function scheduleRow(id) {
  const r = await rootQuery(
    `select id, firm_id, client_id, plan_id, revision, source_entry_id, prepaid_account_code,
            expense_account_code, expense_account_basis, service_period_id, document_id,
            term_start::text as term_start, term_end::text as term_end, basis_kind, period_lines,
            total_cents, period_count, remainder_placement, schedule_version, created_by, created_at
       from clara.prepayment_schedules where id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function scheduleRowsFor(client) {
  const r = await rootQuery(
    "select id, plan_id, source_entry_id from clara.prepayment_schedules where client_id = $1 order by created_at",
    [client]);
  return r.rows;
}

/** The relation's ACL and RLS posture — the census cell's instrument. */
export async function relationPosture(relname) {
  const r = await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity, c.relacl::text as relacl
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = $1`, [relname]);
  return r.rows[0] ?? null;
}

/** Every EXECUTE grant on one function signature, as `{grantee, privilege}` rows. */
export async function functionGrants(signature) {
  const r = await rootQuery(
    `select a.grantee, a.privilege_type
       from pg_proc p, aclexplode(p.proacl) a
      where p.oid = to_regprocedure($1)
      order by 1, 2`, [signature]);
  return r.rows.map((x) => ({ grantee: x.grantee, privilege: x.privilege_type }));
}

/** The registered `clara.evaluator_versions` member hash for the frozen evaluator, recomputed
 *  LIVE off `pg_get_functiondef` — the same instrument `scripts/check-frozen-evaluators.mjs`
 *  uses, so the cell measures the freeze rather than restating it. */
export async function evaluatorFreezeMatches() {
  const r = await rootQuery(
    `select m.member_signature,
            encode(m.body_sha256, 'hex') as registered,
            encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature))::text, 'UTF8')), 'hex') as live
       from clara.evaluator_version_members m
       join clara.evaluator_versions e on e.id = m.evaluator_version_id
      where e.evaluator_name = 'prepayment_schedule'`);
  return r.rows;
}

/** The named period line of a live schedule, by `period_end` — the exact join key the fixed
 *  `last_day_of_month` cadence guarantees. */
export function lineFor(schedule, periodEnd) {
  const lines = schedule.period_lines ?? [];
  return lines.find((l) => String(l.period_end).slice(0, 10) === periodEnd) ?? null;
}

/** A fresh uuid, for the "names nothing" cells. */
export const nowhere = () => randomUUID();

// ===========================================================================================
// 6 · The two UNFIT sources, built through the estate's own doors.
//
//     Both exist so `prepayment_source_unfit` is measured on a REAL entry rather than on a row
//     a fixture wrote by hand: the evaluator's two arms are "the entry is not approved" and "the
//     entry's prepaid leg is ambiguous", and each needs an entry the estate actually admitted.
// ===========================================================================================

/** `wave-a-reads`' entry writers, imported lazily for the reason `f-a4-pr2a-fixtures.mjs` states
 *  for its own copy: the module is heavy and only the two cells below need it. */
async function entryWriters() {
  return import("./wave-a-reads.mjs");
}

/** A DRAFT (never approved) entry binding no document and debiting the prepaid asset. The
 *  evaluator refuses it `prepayment_source_unfit` BEFORE it ever looks for a term, so the absent
 *  document is not what this fixture is measuring. */
export async function unapprovedEntry(scene, { cents = 45000 } = {}) {
  const { draftEntryV3, freshResolution } = await entryWriters();
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: freshResolution(scene.alice, scene.client, { subjectKind: "manual", subjectId: null }),
    memo: `#653 unapproved recognition ${randomUUID().slice(0, 8)}`,
    postingDate: scene.postingDate,
    lines: [
      { account_code: scene.prepaid, debit_cents: cents, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p653-unappr"),
  });
  return d.entry_id;
}

/** An APPROVED entry that debits TWO asset accounts, so which leg is the prepayment is a guess —
 *  and the evaluator refuses a guess (`0140:1046-1057`). */
export async function ambiguousAssetEntry(scene, { cents = 60000, secondAsset = "19000002" } = {}) {
  const { draftEntryV3, approveEntry, freshResolution } = await entryWriters();
  await account(scene.alice, {
    client: scene.client, code: secondAsset, name: "Other prepayments", type: "asset" });
  const half = Math.floor(cents / 2);
  const d = await draftEntryV3(scene.alice, {
    client: scene.client,
    resolution: freshResolution(scene.alice, scene.client, { subjectKind: "manual", subjectId: null }),
    memo: `#653 two-asset recognition ${randomUUID().slice(0, 8)}`,
    postingDate: scene.postingDate,
    lines: [
      { account_code: scene.prepaid, debit_cents: half, credit_cents: 0, description: "prepaid a" },
      { account_code: secondAsset, debit_cents: cents - half, credit_cents: 0, description: "prepaid b" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("p653-two"),
  });
  await approveEntry(scene.bob, {
    entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("p653-twoa") });
  return d.entry_id;
}
