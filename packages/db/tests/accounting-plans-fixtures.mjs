// #640 — EXPLICITLY AUTHORISED RECURRING / REVERSING ACCOUNTING PLANS: the battery's gate, verb
// wrappers and readers (NOT a test file: the name does not end in `.test.mjs`, so `node --test`
// ignores it).
//
// It EXTENDS `work-cancel-fixtures.mjs` (which extends `work-journal-fixtures.mjs`) rather than
// building a second world: #640's whole claim is that a plan's due event admits Work through
// 0178's OWN door and settles under 0184's OWN boundary, so the cells need exactly the chart, the
// basis builders, the admission wrappers and the settle/cancel wrappers those two files already
// carry. A second world would mean a second chart and two places for a divergence to hide.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (#640's own doors):
//
//   clara.create_accounting_plan(p_client, p_kind, p_purpose, p_authority_kind, p_authority_ref,
//       p_frequency, p_day_rule, p_day_of_month, p_timezone, p_effective_from, p_effective_to,
//       p_basis, p_reversal_day_rule, p_op_key)
//         -> {plan_id, revision_id, revision, status, kind, next_occurrences, overlap_warning}
//   clara.revise_accounting_plan(p_plan, …, p_op_key) -> {plan_id, revision, superseded_revision}
//   clara.pause_accounting_plan(p_plan, p_reason, p_op_key)  -> {plan_id, status, changed}
//   clara.resume_accounting_plan(p_plan, p_op_key)           -> {plan_id, status, changed}
//   clara.end_accounting_plan(p_plan, p_reason, p_op_key)    -> {plan_id, status, changed}
//   clara.request_plan_catch_up(p_plan, p_from, p_to, p_op_key)
//         -> {plan_id, from, to, admitted, cap, events[]}
//   clara.preview_accounting_plan(p_plan, p_count)           -> {plan_id, admitting, occurrences[]}
//   clara.list_accounting_plans(p_client)                    -> {client_id, plans[]}
//   clara.get_accounting_plan(p_plan)                        -> {plan_id, live_revision, revisions[]}
//   clara.list_accounting_plan_occurrences(p_plan)           -> {plan_id, occurrences[]}
//   clara.get_work_plan_origin(p_work)                       -> {plan_id, purpose, …} | null
//   clara.wake_due_plan_occurrences(p_limit, p_model)
//         -> {scanned, admitted, converged, refused, limit, occurrences[]}
//
// THE FRONTIER GATE keys on this migration's STABLE STEM (`accounting_plans$`), never its number —
// numbers are claimed at MERGE (standing law), and the `db-slice-frontiers` matrix runs this
// package against databases pinned at EARLIER frontiers where none of these doors exists.
//
// THE PRE-INTEGRATION ESCAPE (`CLARA_ALLOW_MISSING_ACCOUNTING_PLANS`, set by
// accounting-plans-preintegration-gate.mjs) is the package-wide sweep's own reason to be quiet. A
// FOCUSED run does not preload that module, so `assertPlanCohortPresent` FAILS loudly there rather
// than skipping in silence: a skip is not evidence.

import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, admitJournalWork,
} from "./work-cancel-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./work-cancel-fixtures.mjs";

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #640 migration's STABLE STEM. */
export const PLAN_STEM = "accounting_plans$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function planLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [PLAN_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gatePlans(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gatePlans(t) {
  if (await planLaneReady()) return false;
  markSkip();
  t.skip(`#640 accounting-plan lane absent (no ${PLAN_STEM} migration applied)`);
  return true;
}

/** The pre-integration discriminator: a FOCUSED run against a database without the lane is a real
 *  failure, and only the package-wide sweep's preloaded gate module turns it into a skip. */
export async function assertPlanCohortPresent(t) {
  if (await planLaneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCOUNTING_PLANS === "1") {
    markSkip();
    t.skip("#640 accounting-plan lane absent (pre-integration sweep)");
    return true;
  }
  assert.fail(
    "#640: the accounting-plan lane is absent. Apply the migration, or set "
    + "CLARA_ALLOW_MISSING_ACCOUNTING_PLANS=1 for the package-wide pre-integration sweep.");
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on.
// ===========================================================================================

/** The typed `detail.reason` tokens #640's own doors raise. */
export const PLAN_REASON = {
  planNotFound: "plan_not_found",
  planEnded: "plan_ended",
  planPaused: "plan_paused",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  invalidOpKey: "invalid_op_key",
  invalidPurpose: "invalid_purpose",
  invalidSchedule: "invalid_schedule",
  invalidAuthorityKind: "invalid_authority_kind",
  authorityRuleUnsupported: "authority_rule_unsupported",
  authorityRefInvalid: "authority_ref_invalid",
  authorityRefUnresolved: "authority_ref_unresolved",
  planKindUnsupported: "plan_kind_unsupported",
  timezoneUnsupported: "timezone_unsupported",
  reversalCollides: "reversal_collides_with_next_occurrence",
  reversalBeforePrimary: "reversal_before_primary",
  periodAlreadyAdmitted: "period_already_admitted",
  effectiveFromBeforeAuthority: "effective_from_before_authority",
  catchUpBeforeAuthority: "catch_up_before_authority",
  catchUpInFuture: "catch_up_in_future",
  invalidCatchUpWindow: "invalid_catch_up_window",
  noLiveRevision: "no_live_revision",
  operationInFlight: "operation_in_flight",
  planImmutable: "accounting_plan_immutable",
  revisionImmutable: "plan_revision_immutable",
  occurrenceImmutable: "plan_occurrence_immutable",
};

/** The non-raising `reason` tokens the SCAN's own answer carries for a plan it did not admit. */
export const SCAN_REASON = {
  planPaused: "plan_paused",
  planEnded: "plan_ended",
  clientInactive: "client_inactive",
  notYetDue: "not_yet_due",
  outsideWindow: "outside_authority_window",
  noLiveRevision: "no_live_revision",
  planNotFound: "plan_not_found",
  reversalBeforePrimary: "reversal_before_primary",
  periodAlreadyAdmitted: "period_already_admitted",
};

export const PLAN_KIND = { recurring: "recurring_journal", reversing: "reversing_journal" };
export const TZ = "Asia/Kuala_Lumpur";
export const PLAN_MODEL = "clara-opus-5-plan-test";

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================


export async function createAccountingPlan(sub, {
  client, kind = PLAN_KIND.recurring, purpose = "Monthly office rent accrual",
  authorityKind = "explicit_instruction", authorityRef,
  frequency = "monthly", dayRule = "day_of_month", dayOfMonth = 1, timezone = TZ,
  effectiveFrom, effectiveTo = null, basis: b, reversalDayRule = null, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("create_accounting_plan", [
    { name: "p_client", cast: "uuid" }, { name: "p_kind", cast: "text" },
    { name: "p_purpose", cast: "text" }, { name: "p_authority_kind", cast: "text" },
    { name: "p_authority_ref", cast: "jsonb" }, { name: "p_frequency", cast: "text" },
    { name: "p_day_rule", cast: "text" }, { name: "p_day_of_month", cast: "int" },
    { name: "p_timezone", cast: "text" }, { name: "p_effective_from", cast: "date" },
    { name: "p_effective_to", cast: "date" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_reversal_day_rule", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [client, kind, purpose, authorityKind, JSON.stringify(authorityRef), frequency, dayRule,
    dayOfMonth, timezone, effectiveFrom, effectiveTo, JSON.stringify(b), reversalDayRule,
    opKey ?? opk("p640-create")]);
  return r.rows[0].result;
}

export async function reviseAccountingPlan(sub, {
  plan, frequency = "monthly", dayRule = "day_of_month", dayOfMonth = 1, timezone = TZ,
  effectiveFrom, effectiveTo = null, basis: b, reversalDayRule = null, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("revise_accounting_plan", [
    { name: "p_plan", cast: "uuid" }, { name: "p_frequency", cast: "text" },
    { name: "p_day_rule", cast: "text" }, { name: "p_day_of_month", cast: "int" },
    { name: "p_timezone", cast: "text" }, { name: "p_effective_from", cast: "date" },
    { name: "p_effective_to", cast: "date" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_reversal_day_rule", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [plan, frequency, dayRule, dayOfMonth, timezone, effectiveFrom, effectiveTo,
    JSON.stringify(b), reversalDayRule, opKey ?? opk("p640-revise")]);
  return r.rows[0].result;
}

export async function pauseAccountingPlan(sub, { plan, reason = "paused by the rig", opKey = null }) {
  const r = await humanQuery(sub, namedCall("pause_accounting_plan", [
    { name: "p_plan", cast: "uuid" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [plan, reason, opKey ?? opk("p640-pause")]);
  return r.rows[0].result;
}

export async function resumeAccountingPlan(sub, { plan, opKey = null }) {
  const r = await humanQuery(sub, namedCall("resume_accounting_plan", [
    { name: "p_plan", cast: "uuid" }, { name: "p_op_key", cast: "text" },
  ]), [plan, opKey ?? opk("p640-resume")]);
  return r.rows[0].result;
}

export async function endAccountingPlan(sub, { plan, reason = "the client cancelled the standing instruction", opKey = null }) {
  const r = await humanQuery(sub, namedCall("end_accounting_plan", [
    { name: "p_plan", cast: "uuid" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [plan, reason, opKey ?? opk("p640-end")]);
  return r.rows[0].result;
}

export async function requestPlanCatchUp(sub, { plan, from, to, opKey = null }) {
  const r = await humanQuery(sub, namedCall("request_plan_catch_up", [
    { name: "p_plan", cast: "uuid" }, { name: "p_from", cast: "date" },
    { name: "p_to", cast: "date" }, { name: "p_op_key", cast: "text" },
  ]), [plan, from, to, opKey ?? opk("p640-catchup")]);
  return r.rows[0].result;
}

/** Today's day-of-month in the plan timezone, as an integer — several cells shape their schedule
 *  relative to it so the scenario holds on whatever day the battery runs. */
export async function todayDayOfMonth() {
  const r = await rootQuery("select extract(day from (now() at time zone $1))::int as d", [TZ]);
  return r.rows[0].d;
}

export async function previewAccountingPlan(sub, { plan, count = 3 }) {
  const r = await humanQuery(sub, namedCall("preview_accounting_plan", [
    { name: "p_plan", cast: "uuid" }, { name: "p_count", cast: "int" },
  ]), [plan, count]);
  return r.rows[0].result;
}

export async function listAccountingPlans(sub, client) {
  const r = await humanQuery(sub, namedCall("list_accounting_plans", [
    { name: "p_client", cast: "uuid" },
  ]), [client]);
  return r.rows[0].result;
}

export async function getAccountingPlan(sub, plan) {
  const r = await humanQuery(sub, namedCall("get_accounting_plan", [
    { name: "p_plan", cast: "uuid" },
  ]), [plan]);
  return r.rows[0].result;
}

export async function listPlanOccurrences(sub, plan) {
  const r = await humanQuery(sub, namedCall("list_accounting_plan_occurrences", [
    { name: "p_plan", cast: "uuid" },
  ]), [plan]);
  return r.rows[0].result;
}

export async function getWorkPlanOrigin(sub, work) {
  const r = await humanQuery(sub, namedCall("get_work_plan_origin", [
    { name: "p_work", cast: "uuid" },
  ]), [work]);
  return r.rows[0].result;
}

/** The runtime leader's own scan, on the runtime role — the only lane granted it. */
export async function wakeDuePlanOccurrences({ limit = 10, model = PLAN_MODEL } = {}) {
  const r = await roleQuery(ROLES.runtime, namedCall("wake_due_plan_occurrences", [
    { name: "p_limit", cast: "int" }, { name: "p_model", cast: "text" },
  ]), [limit, model]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · Readers.
// ===========================================================================================

export async function planRow(id) {
  const r = await rootQuery("select * from clara.accounting_plans where id=$1", [id]);
  return r.rows[0] ?? null;
}

export async function liveRevision(plan) {
  const r = await rootQuery(
    "select * from clara.accounting_plan_revisions where plan_id=$1 and superseded_at is null", [plan]);
  return r.rows[0] ?? null;
}

export async function revisionRows(plan) {
  const r = await rootQuery(
    "select * from clara.accounting_plan_revisions where plan_id=$1 order by revision", [plan]);
  return r.rows;
}

/** `due_date` comes back as ::text on purpose: node-postgres hands a `date` column to JS as a
 *  LOCAL-midnight Date, and `toISOString()` on one shifts the calendar day under any non-UTC
 *  offset (MYT is UTC+8). A battery about exact due dates never lets one through a timezone. */
export async function occurrenceRows(plan) {
  const r = await rootQuery(
    `select id, firm_id, client_id, plan_id, revision, leg, due_date::text as due_date,
            period_key::text as period_key, attempt, intent_key, work_id, admitted_at, outcome,
            created_at
       from clara.accounting_plan_occurrences where plan_id=$1 order by due_date`, [plan]);
  return r.rows;
}

export async function occurrenceCount(plan) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.accounting_plan_occurrences where plan_id=$1", [plan]);
  return r.rows[0].n;
}

/** Every Work this plan's occurrences admitted, oldest first. */
export async function planWorkRows(plan) {
  const r = await rootQuery(
    `select w.* from clara.accounting_work w
       join clara.accounting_plan_occurrences o on o.work_id = w.id
      where o.plan_id = $1 order by o.due_date`, [plan]);
  return r.rows;
}

// ===========================================================================================
// 5 · World manipulations the cells need.
// ===========================================================================================

/** An admitted Work whose id is a LEGITIMATE `authority_ref` for a plan on the same client — the
 *  "sufficiently scoped instruction" a plan cites. Returns `{kind, id}`, the shape the door takes.
 *
 *  IT IS A REAL ROW, and that is the point: `clara.create_accounting_plan` RESOLVES the reference
 *  against clara.accounting_work / clara.agent_tasks in the same firm and client, so a Knowledge
 *  preference or an invented uuid cannot supply authority. */
export async function instructionRef({ client, author }) {
  const w = await admitJournalWork({ client, author, intentKey: `p640-authority-${randomUUID()}` });
  return { kind: "accounting_work", id: w.work_id };
}

/** REACTIVATE a membership a cell revoked. `clara.add_member` refuses a user who already holds a
 *  membership row in the firm, and the estate has no re-admit door, so this is a FIXTURE shortcut
 *  around an absent writer — stated as one rather than hidden, exactly as `setClientStatus` below
 *  and work-journal-fixtures.mjs's retired-account shortcut are. */
export async function reactivateMember({ firm, user }) {
  await rootQuery(
    "update clara.firm_memberships set status='active' where firm_id=$1 and user_id=$2",
    [firm, user]);
}

/** Deactivate a client through the estate's own column. `clara.clients` has no retire door in this
 *  estate, so this is a FIXTURE shortcut around an absent writer and is stated as one rather than
 *  hidden — exactly as work-journal-fixtures.mjs does for the retired account. */
export async function setClientStatus(client, status) {
  await rootQuery("update clara.clients set status=$2 where id=$1", [client, status]);
}

/** Close the fiscal year that contains `day` for `client`, walking the estate's own lifecycle
 *  edges (open -> closing -> closed), which is the only ladder its trigger admits. The row is
 *  append-only, so a cell that uses this must own a DEDICATED client. */
export async function closeYearAround(firm, client, day, owner) {
  const year = Number(String(day).slice(0, 4));
  const fy = await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
       values ($1,$2,$3,$4,$5,1,'open','asserted',$6) returning id`,
    [firm, client, `${year}`, `${year}-01-01`, `${year}-12-31`, owner]);
  for (const s of ["closing", "closed"]) {
    await rootQuery("update clara.fiscal_years set status=$2 where id=$1", [fy.rows[0].id, s]);
  }
  return fy.rows[0].id;
}

/** A calendar day as YYYY-MM-DD in the plan timezone — never `toISOString().slice(0,10)`, which
 *  shifts the day under any non-UTC offset. The whole battery is about exact due dates. */
export async function todayInPlanZone() {
  const r = await rootQuery("select ((now() at time zone $1)::date)::text as d", [TZ]);
  return r.rows[0].d;
}

/** `YYYY-MM-DD` shifted by whole months, keeping the day-of-month (1..28 only in this lane, so no
 *  clamping is ever needed). Computed in Postgres rather than in JS for the same reason. */
export async function shiftMonths(day, months) {
  const r = await rootQuery("select (($1::date) + ($2 || ' months')::interval)::date::text as d",
    [day, String(months)]);
  return r.rows[0].d;
}

export { assert };
