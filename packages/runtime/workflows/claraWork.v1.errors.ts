// @frozen
//
// FROZEN — part of the claraWork_v1 closure (#623). THE REPAIR ROUTER, and it is the whole of
// ARCHITECTURE §5's last paragraph made executable:
//
//   "修复按原因分流：格式或选择错误可在预算内改正；可安全重算的状态冲突重新读取；基础设施失败有限
//    退避；缺事实或决定才问用户。权限、锁期或业务拒绝不能靠换参数无限尝试。内部不变量失败成为可见
//    故障。"
//
// Seven kinds, and each one has exactly one consequence:
//
//   invalid_input   the model got the shape or the echo wrong → back to the model, INSIDE
//                   budgets.replans. Not a Work failure yet.
//   state_changed   the world moved under a safe-to-recompute read → re-read and retry, INSIDE
//                   budgets.replans. Not a Work failure yet.
//   transient       infrastructure (a dropped socket, a deadlock, a lock timeout) → retry the
//                   SAME tool call with bounded backoff, INSIDE budgets.transientRetries. The
//                   model is not told; there is nothing for it to decide.
//   refusal         authority, a locked period, or a business rule said no → TERMINAL for the
//                   loop. Settles the Work `refused` with the database's own typed reason. The
//                   model may NOT retry with mutated parameters (spec §4, and the estate's own
//                   law: "权限、锁期或业务拒绝不能靠换参数无限尝试").
//   conflict        the same logical operation identity was already used with a different
//                   payload → TERMINAL, no effect, settles `refused` naming the conflict.
//   cancelled       a human asked this Work to stop → TERMINAL, settles `cancelled`.
//   invariant       something that cannot be true is true (a verb that is not deployed, a
//                   privilege the runtime should hold, an immutability trigger firing on our own
//                   write) → TERMINAL, settles `failed` with error.code 'internal'. A VISIBLE
//                   fault, never a swallowed one.
//
// THE TABLE IS CLOSED AND KEYED ON `(errcode, detail.reason)`, because that pair is what the
// database actually hands back: `clara.wake_record_journal_entry` raises with a typed
// `detail` jsonb so the runtime never has to read an English sentence to decide what happened
// (chatTurn.v11.tools' `authoringRefusal` established that vocabulary and this module reuses its
// `detail` parser BY IMPORT so the two cannot drift).
//
// EVERY PAIR BELOW IS COPIED FROM THE RAISER, NOT GUESSED. Migration 0178's own header carries
// the complete roster of `(errcode, detail.reason)` pairs each verb raises, per verb; this table
// is that roster read back. Two of them are the ESTATE's rather than 0178's and are the reason
// the table is keyed on the CODE as well as the reason: the period wall raises CLR19
// `write_into_closed_period` (0056), and `clara._assert_balanced` raises a bare CLR07 with no
// detail at all (0003).
//
// ONE THING 0178'S ROSTER LISTS THAT THIS TABLE DELIBERATELY DOES NOT CARRY: the RECEIPT
// OVERRIDE. A settle of `cancelled`/`refused`/`failed`/`expired` over a Work that already holds a
// committed operation receipt does not raise at all — `clara.settle_work_run` succeeds and writes
// `completed`, answering with `requested_outcome` and `overridden_by_receipt` so the caller can
// see it was overridden. It is a RESULT FLAG, not an error, so there is nothing here to classify;
// the runtime's own half of that law lives in lib/reconciler-work.mjs, which asks the books before
// it names a terminal so it never requests the false outcome in the first place.
//
// THE DEFAULT IS FAIL-CLOSED-TOWARD-THE-HUMAN, AND THAT CHOICE IS DELIBERATE. An unrecognised
// CLR10 reason is classified `refusal`, not `invalid_input`: a business refusal this table has
// not been taught is still a refusal, and settling the Work `refused` with the database's own
// words leaves a human a Retry and a readable reason. Classifying it `invalid_input` would hand
// an unknown business rule back to a model to guess around, which is exactly the "换参数无限尝试"
// the architecture forbids. An unrecognised SQLSTATE with no CLR code is `invariant` — a fault
// nobody designed for must be visible, never retried.

import { authoringRefusal } from "./chatTurn.v11.tools.js";

export type WorkErrorKind =
  | "invalid_input"
  | "state_changed"
  | "conflict"
  | "transient"
  | "refusal"
  | "cancelled"
  | "invariant";

export type WorkErrorClass = {
  kind: WorkErrorKind;
  /** The database's own SQLSTATE / CLR code, or a runtime-minted one for a non-DB fault. */
  code: string;
  /** The typed `detail.reason`, when the raiser supplied one. */
  reason: string | null;
  /** A message safe to put in front of a human. Never an existence oracle. */
  message: string;
  /** TRUE when a human Retry on the SAME Work can legitimately succeed later. */
  recoverable: boolean;
  /** TRUE when the model must not be given another attempt at this tool in this run. */
  terminal: boolean;
};

type DbLikeError = { code?: string; message?: string; detail?: string; errno?: string; cause?: unknown };

/** PostgreSQL SQLSTATEs that mean "try again", never "you were wrong". Enumerated rather than
 *  class-prefixed: `08` and `57` and `53` carry members that are NOT retryable in general, and a
 *  prefix test would quietly promote one of them into an infinite retry. */
export const PG_TRANSIENT_SQLSTATES = Object.freeze([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "57014", // query_canceled (a statement_timeout — the work itself may still be sound)
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08007", // transaction_resolution_unknown
  "08P01", // protocol_violation
  "58000", // system_error
  "58030", // io_error
] as const);

/** Node socket-level errno codes that mean the same thing one layer down. */
export const NODE_TRANSIENT_ERRNOS = Object.freeze([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
] as const);

/** `(code, reason)` → kind. The FULL vocabulary this closure understands, spelled once. A pair
 *  absent from here falls to the documented defaults (see this file's header). */
const REASON_TABLE: ReadonlyArray<readonly [string, string, WorkErrorKind]> = Object.freeze([
  // --- the model's own mistakes: fixable inside budgets.replans -------------------------
  // The echoed basis did not re-hash to the admitted basis. The model changed something it had
  // no authority to change; handing the admitted basis back is a legitimate repair.
  ["CLR10", "basis_mismatch", "invalid_input"],
  // Admission-shape refusals, raised by clara._assert_journal_basis with a typed `field` AND a
  // typed `constraint`. ONE reason covers the whole family — the constraint token rides in the
  // detail rather than in the key, so `iso_date`, `exactly_one_side`, `balanced`, `integer_cents`
  // and `max_length` all classify here without widening this table. `max_length` is the newest of
  // them (the memo's 4000 and a line narration's 2000, restated by 0178 from THIS closure's own
  // frozen tool schema) and it is `invalid_input` for the same reason the rest are: the model
  // echoed something the schema cannot carry, and handing the admitted basis back is a legitimate
  // repair inside budgets.replans.
  // Reachable from the chat tool (which builds a basis from prose) and as the belt behind
  // admission inside clara._record_journal_entry_core.
  ["CLR10", "invalid_basis", "invalid_input"],

  // --- the world moved under a safe re-read -------------------------------------------
  ["CLR13", "task_transition", "state_changed"],
  // clara.retry_accounting_work: the Work is not in a terminal state (or its run is still live).
  ["CLR13", "not_retryable", "state_changed"],

  // --- an in-flight sibling holds the identity: WAIT, never re-plan --------------------
  // clara._reserve_op found the logical identity reserved by an uncommitted transaction. There
  // is nothing for the model to fix and nothing to settle: the right act is the same call again
  // after a bounded backoff, which is exactly what `transient` buys.
  ["CLR13", "operation_in_flight", "transient"],

  // --- one logical identity, two payloads: no effect, and the run stops ----------------
  ["CLR10", "operation_payload_conflict", "conflict"],
  ["CLR10", "intent_payload_conflict", "conflict"],

  // --- business refusals: TERMINAL, recoverable by a human, never by a parameter change --
  // The period wall is the ESTATE's (clara._tf_period_wall, 0056), and it raises CLR19 — NOT a
  // CLR10. Keyed on the code the database actually uses; a CLR19 read as an unknown SQLSTATE
  // would settle this Work `failed`/internal instead of `refused`, and a human would lose the
  // one action that fixes it (reopen the period, then Retry).
  ["CLR19", "write_into_closed_period", "refusal"],
  ["CLR10", "generic_control_leg", "refusal"],
  // Absent OR inactive — 0178 folds both into one reason with the offending code in `detail`.
  ["CLR10", "unknown_account", "refusal"],
  ["CLR10", "client_inactive", "refusal"],

  // --- authority: the human's live role/access, rechecked AT COMMIT ---------------------
  ["CLR04", "obo_not_active", "refusal"],
  ["CLR04", "actor_not_active", "refusal"],
  ["CLR04", "insufficient_role", "refusal"],

  // --- the subject is not what this run was told it was ---------------------------------
  ["CLR11", "work_not_found", "refusal"],
  ["CLR11", "client_not_found", "refusal"],

  // --- invariants: every one of these arguments is supplied by THIS runtime --------------
  // A blank key can only come from the runtime (C82.1: the database refuses it BEFORE any
  // reservation). It is never the model's fault and never worth a retry.
  ["CLR10", "invalid_op_key", "invariant"],
  ["CLR10", "invalid_intent_key", "invariant"],
  // `invalid_request` carries a `class` in {rationale, run_id, bundle_digest} — all three are
  // filled in by the tool, so a blank one is this runtime's own bug.
  ["CLR10", "invalid_request", "invariant"],
  ["CLR10", "invalid_bundle", "invariant"],
  ["CLR10", "invalid_run_id", "invariant"],
  ["CLR10", "invalid_outcome", "invariant"],
  ["CLR10", "invalid_error_code", "invariant"],
  ["CLR10", "invalid_basis_origin", "invariant"],
  ["CLR10", "invalid_source_refs", "invariant"],
  ["CLR10", "wrong_task_kind", "invariant"],
  // The runtime reads the Work row and passes back its own logical identity; a mismatch means
  // this process paired a task with the wrong Work.
  ["CLR10", "logical_op_mismatch", "invariant"],
  // The whole credential path is minted by `workScoped` in this closure. Every one of these is
  // "the runtime built the credential wrong", not "the human may not".
  ["CLR03", "no_wake_credential", "invariant"],
  ["CLR03", "wrong_wake_kind", "invariant"],
  ["CLR03", "wake_obo_unbound", "invariant"],
  ["CLR03", "wake_task_unbound", "invariant"],
  ["CLR11", "credential_client_pin", "invariant"],
  // THE CREDENTIAL NAMES THE WRONG HUMAN. 0178's `clara._record_journal_entry_core` binds the
  // wake credential's `on_behalf_of` to the Work's OWN initiator, so a credential minted OBO some
  // OTHER live bookkeeper cannot commit this Work — authority alone is not enough, the receipt
  // must attribute the posting to the human who asked.
  //
  // IT IS AN INVARIANT AND NOT A REFUSAL, WHICH IS WHERE THE CLR04 DEFAULT WOULD HAVE PUT IT.
  // Every other CLR04 in this table is the HUMAN'S standing changing under a run — no longer
  // active, no longer bookkeeper+ — and a human's Retry after the role is restored can genuinely
  // succeed, which is what `refusal` promises. This one cannot be that: `workScoped` mints the
  // credential with `work.initiator`, read by `loadWorkStep` from the Work row this very run is
  // executing, so the two can only disagree if THIS runtime paired a credential with the wrong
  // Work. Classifying it `refusal` would tell a human their authority was declined and offer a
  // Retry that must fail identically forever; `invariant` settles the Work `failed`/internal and
  // makes the pairing bug visible, which is the whole point of the kind. It sits with
  // `logical_op_mismatch` and the credential-shape CLR03s for exactly that reason.
  ["CLR04", "obo_not_initiator", "invariant"],
]);

/** Parse a raiser's `detail` jsonb through v11's own parser so the two vocabularies cannot
 *  drift, then read the typed reason out of it. */
function reasonOf(err: DbLikeError): { reason: string | null; detail: Record<string, unknown>; message: string } {
  const parsed = authoringRefusal(err);
  if (parsed.ok === true) return { reason: null, detail: {}, message: "" };
  return { reason: parsed.reason, detail: parsed.details, message: parsed.message };
}

function errnoOf(err: DbLikeError): string | null {
  const direct = typeof err?.errno === "string" ? err.errno : null;
  if (direct) return direct;
  const code = typeof err?.code === "string" ? err.code : null;
  if (code && (NODE_TRANSIENT_ERRNOS as readonly string[]).includes(code)) return code;
  const cause = err?.cause as DbLikeError | undefined;
  if (cause && typeof cause.code === "string" && (NODE_TRANSIENT_ERRNOS as readonly string[]).includes(cause.code)) {
    return cause.code;
  }
  return null;
}

function classified(kind: WorkErrorKind, code: string, reason: string | null, message: string): WorkErrorClass {
  const terminal = kind === "refusal" || kind === "conflict" || kind === "cancelled" || kind === "invariant";
  // RECOVERABLE means "a human's Retry on this same Work could legitimately succeed later".
  // A refusal (open the period, add the account, restore the role) and a cancel qualify; a
  // payload conflict does not (the identity is spent and the payload is what it is), and an
  // invariant does not (something is broken, and retrying it changes nothing).
  const recoverable = kind !== "conflict" && kind !== "invariant";
  return { kind, code, reason, message, recoverable, terminal };
}

/** THE ROUTER. Pure: an error object in, a classification out — no DB, no clock, no I/O, so
 *  tests/work-errors.test.mjs drives this function itself rather than a copy of its predicate. */
export function classifyWorkError(error: unknown): WorkErrorClass {
  const err = (error ?? {}) as DbLikeError;
  const code = typeof err.code === "string" && err.code.length > 0 ? err.code : "internal";
  const { reason, message } = reasonOf(err);
  const humanMessage = message || String(err.message ?? "That accounting operation could not be completed.");

  // 0. A cancel is a decision, not a fault: the workflow tags its own abort with this code.
  if (code === "clara_work_cancelled") {
    return classified("cancelled", code, reason, "This Work was cancelled before the entry was recorded.");
  }

  // 1. The closed (code, reason) table.
  for (const [tableCode, tableReason, kind] of REASON_TABLE) {
    if (code === tableCode && reason === tableReason) return classified(kind, code, reason, humanMessage);
  }

  // 2. Infrastructure, by SQLSTATE then by socket errno. Checked BEFORE the CLR defaults so a
  //    connection failure inside a wake call is never read as a business refusal.
  if ((PG_TRANSIENT_SQLSTATES as readonly string[]).includes(code)) {
    return classified("transient", code, reason, "The database was briefly unavailable; retrying.");
  }
  const errno = errnoOf(err);
  if (errno !== null) return classified("transient", errno, reason, "The database connection dropped; retrying.");

  // 3. Deploy-order and privilege faults are INVARIANTS with a named cause, because the honest
  //    reading of `undefined_function` here is "this image is running ahead of migration 0178".
  if (code === "42883") {
    return classified(
      "invariant",
      code,
      reason,
      "The accounting-work database verbs are not deployed to this database yet (migration 0178). Nothing was recorded.",
    );
  }
  if (code === "42501") {
    return classified("invariant", code, reason, "The runtime lacks a grant this operation needs. Nothing was recorded.");
  }
  if (code === "23505") {
    return classified("conflict", code, reason, "That operation identity is already used by a different payload.");
  }
  if (code === "CLR08") {
    return classified("invariant", code, reason, "An immutability rule refused this write. Nothing was recorded.");
  }
  // The balance law (clara._assert_balanced, 0003) raises a BARE CLR07 with no typed detail. It
  // is already enforced at ADMISSION, so a disagreement at commit means the two halves of the
  // estate disagree — a visible fault, never a repair the model could attempt.
  if (code === "CLR07") {
    return classified("invariant", code, reason, "The entry did not balance at commit. Nothing was recorded.");
  }

  // 4. CLR defaults — fail closed toward the human (see this file's header).
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11" || code === "CLR12" || code === "CLR19") {
    return classified("refusal", code, reason, humanMessage);
  }
  if (code === "CLR13" || code === "CLR14") {
    return classified("state_changed", code, reason, humanMessage);
  }

  // 5. Anything nobody designed for is a VISIBLE fault.
  return classified("invariant", code, reason, humanMessage);
}

/** The `agent_tasks.error_code` value each terminal kind settles with. The CHECK on that column
 *  is the estate's, not this closure's — 'limit' is what budget exhaustion must use, and
 *  'tool_error' is what a typed refusal must use (a task status set has no `refused`). */
export function taskErrorCodeFor(kind: WorkErrorKind | "budget_exhausted"): string | null {
  if (kind === "budget_exhausted") return "limit";
  if (kind === "cancelled") return null;
  if (kind === "refusal" || kind === "conflict") return "tool_error";
  return "internal";
}

/** The `clara.accounting_work.status` a terminal kind settles the WORK to. */
export function workOutcomeFor(kind: WorkErrorKind | "budget_exhausted"): "refused" | "failed" | "cancelled" {
  if (kind === "refusal" || kind === "conflict") return "refused";
  if (kind === "cancelled") return "cancelled";
  return "failed";
}

/** The `clara.accounting_work.error` jsonb for a terminal classification. */
export function workErrorPayload(c: WorkErrorClass): Record<string, unknown> {
  return { code: c.code, reason: c.reason, message: c.message, recoverable: c.recoverable };
}

/** The budget-exhaustion error payload — its own shape because no database error produced it. */
export function budgetExhaustedPayload(which: string): Record<string, unknown> {
  return {
    code: "budget_exhausted",
    reason: which,
    message: `This Work reached its ${which} budget before recording the entry. Nothing was posted; retry to run it again.`,
    recoverable: true,
  };
}
