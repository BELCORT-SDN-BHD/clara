// T7 governed writes — every doors.ts caller re-reads afterward via
// lib/parts/hooks.ts's `useHydratedPart().act()` (hydrate-never-trust; no
// optimistic UI). A fresh `crypto.randomUUID()` op_key per call, never reused
// across a retry (doors.ts's own "never retry a refusal" law). Signatures
// transcribed from the LIVE catalog (2026-08-28 census) — see
// lib/coding/types.ts's header for citations.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };
const opKey = () => crypto.randomUUID();

/** `clara.open_coding_task(p_client, p_document, p_filing, p_reason,
 *  p_op_key)` — bookkeeper+. CLR24 "coding-task reason is required" /
 *  "active coding-task filing not found". */
export function openCodingTask(
  clientId: string, documentId: string, filingId: string, reason: string, opts: Opts = {},
): Promise<unknown> {
  return callDoor("open_coding_task", {
    p_client: clientId, p_document: documentId, p_filing: filingId, p_reason: reason, p_op_key: opKey(),
  }, opts);
}

/** `clara.complete_coding_task(p_task, p_result_entry, p_op_key)` —
 *  bookkeeper+. CLR24 "coding task not found" / "coding task is not open" /
 *  "coding-task result is not an active approved entry" — the last one is the
 *  door's OWN re-check of exactly what
 *  reads.ts's `listApprovedEntriesForFiling` helped the human pick from; a
 *  stale pick still refuses honestly rather than silently succeeding. */
export function completeCodingTask(taskId: string, resultEntryId: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("complete_coding_task", { p_task: taskId, p_result_entry: resultEntryId, p_op_key: opKey() }, opts);
}

/** `clara.dismiss_coding_task(p_task, p_reason, p_op_key)` — bookkeeper+.
 *  CLR24 "dismissal reason is required" / "coding task not found" / "coding
 *  task is not open". */
export function dismissCodingTask(taskId: string, reason: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("dismiss_coding_task", { p_task: taskId, p_reason: reason, p_op_key: opKey() }, opts);
}

/** `clara.resolve_lint_finding(p_finding, p_conclusion, p_note, p_op_key)` —
 *  bookkeeper+. `p_conclusion` MUST be one of
 *  `LINT_FINDING_CONCLUSIONS` (types.ts) or the door itself refuses CLR33
 *  "bad_conclusion" — this wrapper passes the caller's value through
 *  unchanged rather than re-validating it client-side (the door is the one
 *  authority). CLR33 "finding_not_open" on a race. */
export function resolveLintFinding(
  findingId: string, conclusion: string, note: string, opts: Opts = {},
): Promise<unknown> {
  return callDoor("resolve_lint_finding", {
    p_finding: findingId, p_conclusion: conclusion, p_note: note, p_op_key: opKey(),
  }, opts);
}

/** `clara.acknowledge_sweep_run(p_run, p_op_key)` — bookkeeper+, human
 *  identity only (an agent/wake credential refuses CLR03). CLR29
 *  "not_finalized" if the run hasn't finalized yet, CLR11 if not found. Built
 *  and wire-tested against the live verb (Q9 rung 1's "no affordance without
 *  a named verb" is about the UI, not this module) — NOT wired to a control
 *  on the queue-altitude sweep panel: no BROWSABLE list of sweep run ids
 *  exists there (types.ts's own SweepStatus header). A run id does reach a
 *  human through the Clara thread's own `sweep_receipt` part, but that
 *  part's card is a standing, out-of-this-wave P3-era gap (same header) —
 *  components/firm/sweep-status-panel.tsx names the reason honestly rather
 *  than fabricating a control. */
export function acknowledgeSweepRun(runId: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("acknowledge_sweep_run", { p_run: runId, p_op_key: opKey() }, opts);
}

/** `clara.cancel_agent_task(p_task, p_op_key)` — bookkeeper+. Idempotent on
 *  an already-terminal or already-cancel_requested task (the live body
 *  returns the current status rather than refusing); this wrapper never
 *  pre-filters by status — the caller (components/firm/agent-tasks-panel.tsx)
 *  only offers the control for AGENT_TASK_CANCELLABLE_STATUSES, but the door
 *  itself is the authority on what actually happens. */
export function cancelAgentTask(taskId: string, opts: Opts = {}): Promise<unknown> {
  return callDoor("cancel_agent_task", { p_task: taskId, p_op_key: opKey() }, opts);
}

/** `clara.open_question(p_client, p_scope_kind, p_scope_id, p_question,
 *  p_op_key)` — bookkeeper+, the RAISING half (resolve/dismiss are already
 *  wired — lib/firm/needs-you.ts). `p_scope_kind` is constrained by
 *  `ck_open_questions_scope` (live) to exactly `document|vendor|client|
 *  bank_line`, each with its own `scope_id` identity rule — see
 *  lib/coding/types.ts's `OpenQuestionScopeKind`. This surface only ever
 *  calls it with 'document' (a filing's own document_id) or 'client' (the
 *  current workspace's own clientId) — both ids this UI genuinely holds, per
 *  the CHECK's own requirement that scope_id BE the right identity for its
 *  kind. CLR10 "malformed", CLR11 "client not found"/"question document not
 *  found"/"question vendor not found". */
export function openQuestion(
  clientId: string, scopeKind: "document" | "client", scopeId: string, questionText: string, opts: Opts = {},
): Promise<unknown> {
  return callDoor("open_question", {
    p_client: clientId, p_scope_kind: scopeKind, p_scope_id: scopeId, p_question: questionText, p_op_key: opKey(),
  }, opts);
}

/** `clara.promote_clarify_to_question(p_interruption, p_scope_kind,
 *  p_scope_id, p_op_key)` — bookkeeper+. The core resolves the question's
 *  `client_id` from the interruption's OWN task internally; `p_scope_id` for
 *  `scope_kind='client'` must still equal that SAME client (the shared
 *  `ck_open_questions_scope` CHECK, not re-validated by this door before
 *  insert) — the caller (journals/interruptions-panel.tsx) only offers this
 *  action once it has independently read that exact client_id (lib/coding/
 *  reads.ts's `listAgentTaskClientIds`), never a guess. CLR10 "malformed",
 *  CLR11 "interruption not found". */
export function promoteClarifyToQuestion(
  interruptionId: string, scopeKind: "client", scopeId: string, opts: Opts = {},
): Promise<unknown> {
  return callDoor("promote_clarify_to_question", {
    p_interruption: interruptionId, p_scope_kind: scopeKind, p_scope_id: scopeId, p_op_key: opKey(),
  }, opts);
}
