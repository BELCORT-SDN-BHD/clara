// #630 — SETTLING ADMITTED OPERATIONS UNDER CANCEL / REVOKE / LOCK-PERIOD RACES: the battery's
// gate and verb wrappers (NOT a test file: the name does not end in `.test.mjs`, so `node --test`
// ignores it).
//
// It EXTENDS `work-journal-fixtures.mjs` rather than rebuilding its world: #630 adds two doors and
// four recuts to the SAME accounting-work lane #623 built, and a second world would mean a second
// chart, a second admission path and two places for a divergence to hide. Everything that file
// exports is re-exported here so one import line serves a cell.
//
// THE FRONTIER GATE keys on THIS migration's own STABLE STEM (`work_cancel_ordering$`), never its
// number — numbers are claimed at MERGE (standing law). The `db-slice-frontiers` matrix runs this
// package against databases pinned at EARLIER frontiers, where `clara.cancel_accounting_work` does
// not exist and an unconditional assertion would red the leg while saying nothing about the thing
// under test.
//
// THE WIRE CONTRACT THIS MODULE ENCODES (#630's own contract, §A):
//
//   clara.cancel_accounting_work(p_work, p_author, p_op_key)
//        -> {work_id, task_id, status, cancelled, reason?, receipt_id?, entry_id?,
//            cancelled_by?, cancelled_at?, replayed}
//   clara.take_over_accounting_work(p_work, p_author, p_op_key, p_basis_digest)
//        -> {work_id, task_id, logical_op_id, status, responsible, previous_responsible,
//            initiated_by, taken_over, replayed}

import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, insertUser, addMember,
} from "./rig-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export * from "./work-journal-fixtures.mjs";
// Two world builders #623's own fixtures did not need: #630's races want a SECOND active
// bookkeeper (the takeover's taker) and a throwaway member to revoke.
export { insertUser, addMember };

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #630 migration's STABLE STEM. */
export const CANCEL_STEM = "work_cancel_ordering$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function cancelLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [CANCEL_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateCancel(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateCancel(t) {
  if (await cancelLaneReady()) return false;
  markSkip();
  t.skip(`#630 work-cancel lane absent (no ${CANCEL_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The closed vocabulary this battery asserts on.
// ===========================================================================================

/** The typed `detail.reason` tokens #630's own doors and recuts raise. */
export const CANCEL_REASON = {
  workCancelled: "work_cancelled",
  workSettled: "work_settled",
  notTakeable: "not_takeable",
  basisConfirmationRequired: "basis_confirmation_required",
  opKeyConflict: "op_key_conflict",
  operationInFlight: "operation_in_flight",
  invalidOpKey: "invalid_op_key",
  workNotFound: "work_not_found",
  actorNotActive: "actor_not_active",
  insufficientRole: "insufficient_role",
  clientInactive: "client_inactive",
};

/** The non-raising `reason` tokens a cancel's OWN answer carries. */
export const CANCEL_ANSWER = {
  alreadyTerminal: "already_terminal",
  alreadyCompleted: "already_completed",
  alreadyStopping: "already_stopping",
};

// ===========================================================================================
// 3 · Verb wrappers. Named arguments only — the contract states parameter NAMES, and a
//     divergence there is a real finding rather than a silent positional mismatch.
// ===========================================================================================

const RUNTIME = ROLES.runtime;

export async function cancelAccountingWork({ work, author, opKey = null }) {
  const r = await roleQuery(RUNTIME, namedCall("cancel_accounting_work", [
    { name: "p_work", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_op_key", cast: "text" },
  ]), [work, author, opKey ?? opk("w630-cancel")]);
  return r.rows[0].result;
}

/** Re-open a terminal Work through 0178's own door: a NEW queued task becomes
 *  `accounting_work.current_task_id` and the old, terminal one stays on the row's history. The
 *  cells that prove a late settle cannot speak for a Work it no longer runs need exactly this. */
export async function retryAccountingWork({ work, author, opKey = null }) {
  const r = await roleQuery(RUNTIME, namedCall("retry_accounting_work", [
    { name: "p_work", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_op_key", cast: "text" },
  ]), [work, author, opKey ?? opk("w630-retry")]);
  return r.rows[0].result;
}

export async function takeOverAccountingWork({ work, author, opKey = null, basisDigest = null }) {
  const r = await roleQuery(RUNTIME, namedCall("take_over_accounting_work", [
    { name: "p_work", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_op_key", cast: "text" }, { name: "p_basis_digest", cast: "text" },
  ]), [work, author, opKey ?? opk("w630-takeover"), basisDigest]);
  return r.rows[0].result;
}

export async function workAuthoritySnapshot(task) {
  const r = await roleQuery(RUNTIME, namedCall("work_authority_snapshot", [
    { name: "p_task", cast: "uuid" },
  ]), [task]);
  return r.rows[0].result;
}

// ===========================================================================================
// 4 · World manipulations the races need. Each one is a REAL door where the estate has one.
// ===========================================================================================

/** Deactivate a membership through the estate's own door, as a firm owner would. Returns the
 *  membership id so a cell can prove the row moved rather than assuming it. */
export async function deactivateMember(ownerSub, { firm, user }) {
  const m = await rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [firm, user]);
  const membership = m.rows[0]?.id ?? null;
  if (membership === null) return null;
  await humanQuery(ownerSub, "select clara.remove_member(p_membership => $1::uuid, p_op_key => $2::text)",
    [membership, opk("w630-revoke")]);
  return membership;
}

/** Demote a membership to `viewer` through the estate's own door. */
export async function demoteMember(ownerSub, { firm, user, role = "viewer" }) {
  const m = await rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [firm, user]);
  const membership = m.rows[0]?.id ?? null;
  if (membership === null) return null;
  await humanQuery(ownerSub,
    "select clara.set_member_role(p_membership => $1::uuid, p_role => $2::text, p_op_key => $3::text)",
    [membership, role, opk("w630-demote")]);
  return membership;
}

// ===========================================================================================
// 5 · Readers.
// ===========================================================================================

export async function interruptionsForTask(task) {
  const r = await rootQuery(
    "select id, status, kind from clara.agent_interruptions where task_id=$1 order by created_at", [task]);
  return r.rows;
}

/** The Work row's TWO authority columns. `initiated_by` is #630's new immutable historical fact;
 *  `initiator` is the human the Work is currently executed AS — the one the deploy-locked closure
 *  mints its credentials on behalf of. Read as a pair so a cell can assert they moved apart. */
export async function responsibleOf(work) {
  const r = await rootQuery(
    "select initiated_by, initiator as responsible from clara.accounting_work where id=$1", [work]);
  return r.rows[0] ?? null;
}

export async function timelineEvents(firm, type) {
  const r = await rootQuery(
    "select event_type, actor, client_id, payload from clara.domain_events where firm_id=$1 and event_type=$2 order by seq",
    [firm, type]);
  return r.rows;
}
