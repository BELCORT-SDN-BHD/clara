// T6 (port-wave plan §4/§5) — the drafts workbench's governed writers beyond
// the P3-shipped approve_entry/revise_entry/reverse_entry/draft_entry quartet:
// a routine (non-high-stakes) quick-approve, a draft withdrawal, and the
// firm-wide agent-clarify answer door. Every verb below is grounded at the
// LIVE catalog (instance-unique throwaway rig, migrate 0001..0140,
// `pg_get_functiondef`, 2026-08-28) — see each function's own citation. All
// calls ride lib/doors.ts's `callDoor`: a `DoorRefusal` propagates VERBATIM,
// never caught, re-worded or retried here (doors.ts's own header).

import { callDoor } from "@/lib/doors";
import { getRows } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";
import type { AgentInterruptionRow } from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opKey = () => crypto.randomUUID();

/** clara.approve_routine_entry(p_entry uuid, p_expected_revision uuid,
 *  p_op_key text) -> jsonb — bookkeeper+. No attestation input at all (unlike
 *  `approveEntry`): it self-refuses CLR05 up front ("routine approval refuses
 *  high-stakes entries") for any entry `clara.is_high_stakes` flags, then
 *  delegates to `clara.approve_entry` with a null attestation. This is the
 *  fast path for the ordinary, non-high-stakes majority of drafts — the
 *  attestation-bearing `approveEntry` (api.ts) remains the door for a
 *  high-stakes entry needing a distinct-checker attestation. Both are real,
 *  DB-gated doors; this module offers both and lets the DB's own CLR05/CLR06
 *  refusal be the arbiter of which one a given entry actually accepts. */
export async function approveRoutineEntry(entryId: string, expectedRevision: string, opts: Opts = {}): Promise<void> {
  await callDoor(
    "approve_routine_entry",
    { p_entry: entryId, p_expected_revision: expectedRevision, p_op_key: opKey() },
    opts,
  );
}

/** clara.withdraw_draft(p_entry uuid, p_reason text, p_expected_revision uuid,
 *  p_op_key text) -> jsonb — bookkeeper+. The abandon-a-draft door (distinct
 *  from `reverseEntry`, api.ts's LAW 6 door for a POSTED entry — a draft has
 *  never posted, so there is nothing to reverse). A non-blank reason is
 *  required (CLR22 otherwise); refuses CLR31 for an opening-balance entry
 *  (K-family only), CLR10 for a draft still anchoring a pending bank-match
 *  reservation (`unmatch_bank_match` owns that door instead), CLR39 for one
 *  half of an outstanding auto-reversal pair correction
 *  (`cancel_pair_reversal` owns that door instead), and CLR06 for a stale
 *  revision token — every one of these is a real, expected refusal, rendered
 *  verbatim by the caller, never replicated client-side. */
export async function withdrawDraft(entryId: string, reason: string, expectedRevision: string, opts: Opts = {}): Promise<void> {
  await callDoor(
    "withdraw_draft",
    { p_entry: entryId, p_reason: reason, p_expected_revision: expectedRevision, p_op_key: opKey() },
    opts,
  );
}

/** clara.agent_interruptions — a plain RLS-scoped table read (forced RLS,
 *  `p_agent_interruptions_human`: clara_authenticated, `firm_id =
 *  jwt_firm()`). FIRM-WIDE, not client-scoped: the table carries no
 *  `client_id` column (only `task_id`, and `clara.agent_tasks` itself has no
 *  human-lane SELECT policy at all — a client-scoped join is not reachable
 *  from this role). Bounded to `status='pending'` — answered/expired/
 *  cancelled rows are the runtime's own delivery-queue history, not a human
 *  action surface. */
export async function listPendingInterruptions(opts: Opts = {}): Promise<AgentInterruptionRow[]> {
  return getRows<AgentInterruptionRow>(
    "agent_interruptions?status=eq.pending&select=id,task_id,kind,question,answer,status,asked_of,answered_by,expires_at,created_at,answered_at&order=created_at.asc",
    opts,
  );
}

/** clara.answer_interruption(p_id uuid, p_answer jsonb, p_op_key text) ->
 *  jsonb — bookkeeper+. Answers a pending `agent_interruptions` row, which
 *  the runtime's control listener then delivers back to the parked workflow
 *  hook (packages/runtime/lib/control.mjs). Refuses CLR11 (not in your firm)
 *  and CLR13 (not pending any more, or the clarify's own deadline has already
 *  passed) — both real, rendered verbatim; this module invents no client-side
 *  pending/expiry check ahead of the DB's own `for update` read. */
export async function answerInterruption(interruptionId: string, answer: Record<string, unknown>, opts: Opts = {}): Promise<void> {
  await callDoor(
    "answer_interruption",
    { p_id: interruptionId, p_answer: answer, p_op_key: opKey() },
    opts,
  );
}
