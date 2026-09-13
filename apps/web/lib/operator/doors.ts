// THE OPERATOR CONSOLE'S GOVERNED ACTS (#615) — the three doors #615's scope decision admits,
// and nothing else. Every one already existed before this ticket; #615 gives two of them their
// first web lane and leaves the third exactly where `lib/registration/doors.ts` already had it.
//
//   clara.resolve_stripe_event_problem(p_problem uuid, p_resolution text, p_op_key text)
//     0160 §5, grants at :635-641. Owner of the OPERATOR firm (the byte-copied
//     approve_firm_registration fragment). Refuses CLR10 "problem is required" /
//     "resolution is required" / "op_key is required", CLR11 "stripe event problem not found",
//     CLR09 "stripe event problem is already resolved". Returns
//     `{problem_id, event_id, resolved: true}` through `clara._finish_op`, which replays the
//     ORIGINAL receipt verbatim for a repeat of the SAME op_key.
//
//   clara.get_admission_capacity() -> {max_firms, firms_count, full}
//   clara.set_admission_capacity(p_max_firms integer, p_reason text, p_op_key text)
//     -> {status:'set', max_firms, reason, firms_count, full, updated_at}
//     0186 §C. Same operator-owner predicate; `set` is op_receipts-idempotent and writes a
//     `clara._audit` receipt. Refusals carry detail.reason: invalid_op_key | invalid_capacity |
//     reason_required | reason_too_long | op_key_conflict | capacity_row_missing (CLR10),
//     operation_in_flight (CLR13), not_operator_firm (CLR04).
//     THIS IS `get_admission_capacity`'s FIRST WEB CALLER. 0186's own comment said there was none;
//     migration 0188 §4 recuts that sentence rather than leaving it to rot, and
//     `lib/registration/checkout-doors.test.ts` still holds the property that matters — that no
//     APPLICANT-facing lane may name it, because `firms_count` is business-confidential.
//
// APPROVE / REJECT ARE NOT RE-DECLARED HERE. `lib/registration/doors.ts` already owns them, with
// the rung-0 census of their live bodies in its header; this module imports and re-exports them so
// the console has ONE import site without a second, driftable declaration of the same two doors.
//
// OP KEYS ARE CALLER-OWNED, always. `clara._reserve_op`'s replay contract is keyed on
// `(firm, fn, op_key)` and re-hashes the arguments (0004:46-60): a FRESH random key on every
// attempt is exactly what defeats it — a retry after a lost response would never find the original
// receipt, would re-enter the body, and would meet a spurious CLR09 instead of replaying. Every
// key this console mints is a pure function of (case id, caller id, normalised arguments); see
// `components/operator/support-case-sheet.tsx`.

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export {
  approveFirmRegistration,
  rejectFirmRegistration,
  isOperatorConsoleEligible,
} from "../registration/doors";

export type ResolveProblemReceipt = {
  problem_id: string;
  event_id: string;
  resolved: boolean;
};

/** `clara.resolve_stripe_event_problem`. `resolution` is REQUIRED by the DB (0160 §5's own
 *  `nullif(btrim(p_resolution),'')`); the Sheet additionally disables Confirm on an empty one, but
 *  that UI gate is a courtesy — a caller that bypassed it gets the same CLR10. */
export function resolveStripeEventProblem(
  session: SessionTokenAccessor,
  problemId: string,
  resolution: string,
  opKey: string,
): Promise<ResolveProblemReceipt> {
  return callDoor(
    "resolve_stripe_event_problem",
    { p_problem: problemId, p_resolution: resolution, p_op_key: opKey },
    { session },
  );
}

export type AdmissionCapacity = {
  /** `null` means UNLIMITED — never "zero", and never a placeholder the UI may paint as one. */
  max_firms: number | null;
  firms_count: number;
  full: boolean;
};

export type SetAdmissionCapacityReceipt = AdmissionCapacity & {
  status: string;
  reason: string;
  updated_at: string;
};

export function getAdmissionCapacity(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<AdmissionCapacity> {
  return callDoor("get_admission_capacity", {}, { session, signal });
}

/** `maxFirms: null` sets the estate back to UNLIMITED — the door's own vocabulary, passed through
 *  rather than translated into a sentinel number this build would then have to translate back. */
export function setAdmissionCapacity(
  session: SessionTokenAccessor,
  maxFirms: number | null,
  reason: string,
  opKey: string,
): Promise<SetAdmissionCapacityReceipt> {
  return callDoor(
    "set_admission_capacity",
    { p_max_firms: maxFirms, p_reason: reason, p_op_key: opKey },
    { session },
  );
}
