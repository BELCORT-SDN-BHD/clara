// Adjustments register — plain RLS table reads (this build's coordinator ruling),
// not the RPC summaries. clara.adjustment_templates (packages/db/migrations/
// 0045_wave_d_b2_recurring_adjustments.sql:1139-1238, granted :1445) and
// clara.adjustment_runs (0045:1459-1482, granted :1515) — both firm-scoped by RLS
// (firm_id = jwt_firm()); the client_id filter below narrows to this workspace.
//
// T4 (port wave) rung-0 census, 2026-08-28, instance-unique throwaway rig, migrated
// 0001..0140, LIVE catalog read directly via pg_proc/pg_get_functiondef (apps/web/
// AGENTS.md's "chase the LIVE body" rule) — never the plan's own door names on trust.
// Two naming/shape notes the census found, both scope notes rather than a redesign:
//
//   - The plan's `get_adjustment_runs` does not exist at the live body. The live pair
//     is `clara.list_adjustment_runs(p_client)` (the list) and `clara.get_adjustment_run
//     (p_run)` (one run's receipt, singular, keyed by the run's own id) — the SAME shape
//     T3's census found for depreciation runs. This module wires `list_adjustment_runs`
//     (below) because it is what the pair-reversal ceremony needs (every run's own
//     correctability projection in one call); `get_adjustment_run` is NOT wired — nothing
//     in this train's surface needs one run fetched in isolation once the list already
//     carries the same projection for every row.
//   - `clara.adjustment_run_due(p_client)` reads ONLY `clara.adjustment_templates`/
//     `clara._adj_oldest_unmet_period` — nothing depreciation-shaped — so the plan's own
//     "if the census finds it keyed to depreciation instead, re-home to T3" note (§4)
//     does not fire; it stays here.
//
// `clara.list_adjustment_templates(p_client)` also exists live and is EXECUTE-granted to
// clara_authenticated, but is deliberately NOT wired here either: every field this train's
// template ceremony needs (id, status, cadence — to gate which of Sign/Retire renders) is
// already on the row `loadAdjustmentTemplates` below returns, and Propose creates a fresh
// row rather than reading an existing one. Wrapping a door with no caller would be dead
// code, not evidence of a wider read.
//
// GOVERNED WRITES (this train's own owed half — Q3's "apps/web deliberately reads the
// adjustment tables directly… so the owed half is the WRITE surface"): propose/sign/retire
// a template, run one manually, and the pair-reversal ceremony (reverse → approve/cancel).
// Every write below is bookkeeper+ except sign/retire (admin+, matching the depreciation-
// authority precedent: the signature is what makes a template able to post). Every write
// takes a required `p_op_key` (a fresh `crypto.randomUUID()` per call — never reused across
// a retry, doors.ts's own header) and returns the shared `clara._finish_op` envelope
// VERBATIM — this module reports it, never re-shapes it (hydrate-never-trust: the caller
// re-reads via useHydratedPart().act()).
//
// `propose_adjustment_template` also accepts `p_replaces` (supersede a live template with a
// revised proposal) and `p_schedule` (a variable, period-by-period amortisation schedule —
// the F-A4 PR-2a prepayment limb). Both default to `null` at the live body and this dialog
// deliberately leaves them there: `p_replaces` is a template-lineage flow with its own
// ancestor-bridging rules and `p_schedule` is a whole second congruence-checked sub-language
// (0140's own core body runs ~650 lines partly validating it) — neither is "not built," both
// are a scope trim this pass makes on a door that is fully functional without them. A plain,
// constant-lines recurring template (the common case) needs neither.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

const opKey = (): string => crypto.randomUUID();

export type AdjustmentTemplateRow = {
  id: string;
  client_id: string;
  status: "proposed" | "live" | "retired" | string;
  name: string;
  cadence: "monthly" | "annual" | string;
  start_date: string;
  end_date: string | null;
  auto_reverse: boolean;
  memo_template: string;
};

const TEMPLATE_COLS = "id,client_id,status,name,cadence,start_date,end_date,auto_reverse,memo_template";

export function loadAdjustmentTemplates(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentTemplateRow[]> {
  return getRows<AdjustmentTemplateRow>("adjustment_templates", {
    select: TEMPLATE_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "start_date.desc",
    session,
  });
}

export type AdjustmentRunRow = {
  id: string;
  client_id: string;
  template_id: string;
  period_start: string;
  period_end: string;
  mode: "post" | "draft" | string;
  entry_id: string;
  reversal_entry_id: string | null;
  amount_cents: number;
  created_at: string;
};

const RUN_COLS =
  "id,client_id,template_id,period_start,period_end,mode,entry_id,reversal_entry_id,amount_cents,created_at";

export function loadAdjustmentRuns(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentRunRow[]> {
  return getRows<AdjustmentRunRow>("adjustment_runs", {
    select: RUN_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "period_end.desc",
    session,
  });
}

// =====================================================================
// clara.adjustment_pair_reversals — a plain RLS table read (the same Q3
// pattern as templates/runs above): forced RLS, firm-scoped, clara_authenticated
// holds SELECT (census-confirmed by a direct relacl read). One row per reverse-
// pair ceremony in flight or completed for this client.
// =====================================================================

export type AdjustmentPairReversalRow = {
  id: string;
  client_id: string;
  template_id: string;
  occurrence_id: string;
  mirror_id: string;
  occurrence_correction_id: string;
  mirror_correction_id: string;
  maker: string;
  status: "pending" | "approving" | "completed" | "cancelled" | string;
  completed_at: string | null;
  op_key: string;
  created_at: string;
};

const PAIR_REVERSAL_COLS =
  "id,client_id,template_id,occurrence_id,mirror_id,occurrence_correction_id,mirror_correction_id," +
  "maker,status,completed_at,op_key,created_at";

export function loadAdjustmentPairReversals(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentPairReversalRow[]> {
  return getRows<AdjustmentPairReversalRow>("adjustment_pair_reversals", {
    select: PAIR_REVERSAL_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.desc",
    session,
  });
}

// =====================================================================
// clara.list_adjustment_runs — the ONE RPC this train wires (see the header
// for why its sibling reads are not). Returns every field `loadAdjustmentRuns`
// above does, PLUS the per-run correction projection `clara._adj_correction_door`
// computes: whether the run is correctable right now, by which verb, and — if
// not — which wall and (when the DB has one) a followable sentence why. Never
// re-derived client-side (hard constraint 2: a client-side guess at
// correctability is exactly the class of bug the "spelling is not identity" /
// review laws exist to catch — this projection is the DB's own considered
// answer, including walls this module cannot see the other side of, e.g. a
// staff-advance enrolment state).
// =====================================================================

export type AdjustmentRunWithCorrection = AdjustmentRunRow & {
  correctable: boolean;
  active_pair_id: string | null;
  active_pair_status: "pending" | "approving" | "completed" | "cancelled" | string | null;
  /** `"clara.reverse_entry"` for a solo occurrence (T6's surface, not this
   *  train's) or `"clara.reverse_adjustment_pair"` for an auto-reverse pair
   *  (this train's own verb) — null when `correctable` is false. */
  correction_verb: "clara.reverse_entry" | "clara.reverse_adjustment_pair" | null;
  correction_wall: string | null;
  correction_wall_advice: string | null;
};

/** clara.list_adjustment_runs(p_client) — viewer+. CLR11 if the client is not
 *  in your firm. Newest period first (the live body's own ordering). */
export async function listAdjustmentRuns(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentRunWithCorrection[]> {
  const out = await callDoor<{ client_id: string; runs: AdjustmentRunWithCorrection[] }>(
    "list_adjustment_runs",
    { p_client: clientId },
    { session },
  );
  return out.runs;
}

// =====================================================================
// clara.adjustment_run_due — a state-banner read (port-wave plan §5's own
// pattern for fa_register_tie): rendered verbatim, never re-derived from the
// template list client-side.
// =====================================================================

export type AdjustmentRunDueBlocked = { template_id: string; reason: string };

export type AdjustmentRunDueResult =
  | { due: true; template_id: string; period_start: string; period_end: string; blocked: AdjustmentRunDueBlocked[] }
  | { due: false; reason: "nothing_due" | "all_blocked" | "client_not_found" | string; blocked: AdjustmentRunDueBlocked[] };

/** clara.adjustment_run_due(p_client) — admits before answering anything,
 *  including `client_not_found` (the door's own comment: an unadmitted caller
 *  cannot use this oracle to probe which client ids exist), so a refusal here
 *  is a real admission failure, not a soft 404. */
export function adjustmentRunDue(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentRunDueResult> {
  return callDoor<AdjustmentRunDueResult>("adjustment_run_due", { p_client: clientId }, { session });
}

// =====================================================================
// Governed writes — callDoor, refusal verbatim, never retried. See this
// file's header for the full grounding on every door below.
// =====================================================================

export type AdjustmentTemplateLineInput = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
};

export type ProposeAdjustmentTemplateInput = {
  clientId: string;
  name: string;
  cadence: "monthly" | "annual";
  startDate: string;
  endDate: string | null;
  autoReverse: boolean;
  lines: AdjustmentTemplateLineInput[];
  memoTemplate: string;
};

export type ProposeAdjustmentTemplateResult = {
  template_id: string;
  status: "proposed";
  content_hash: string;
  /** ALWAYS present, empty array included (the live body's own stable-shape
   *  rule) — e.g. a period-overlap advisory against another live template on
   *  the same account. Advisory only: never a gate. */
  warnings: unknown[];
};

/** clara.propose_adjustment_template(p_client,p_name,p_cadence,p_start_date,
 *  p_end_date,p_auto_reverse,p_lines,p_memo_template,p_op_key,p_replaces,
 *  p_schedule) — bookkeeper+. `lines` needs >=2 rows, each exactly one
 *  positive debit XOR credit in cents, balanced to the sen — the DB is the
 *  authority; a real CLR10 renders verbatim. `p_replaces`/`p_schedule` are
 *  deliberately not exposed by this dialog (this file's header). */
export function proposeAdjustmentTemplate(
  session: SessionTokenAccessor,
  input: ProposeAdjustmentTemplateInput,
): Promise<ProposeAdjustmentTemplateResult> {
  return callDoor<ProposeAdjustmentTemplateResult>(
    "propose_adjustment_template",
    {
      p_client: input.clientId,
      p_name: input.name,
      p_cadence: input.cadence,
      p_start_date: input.startDate,
      p_end_date: input.endDate,
      p_auto_reverse: input.autoReverse,
      p_lines: input.lines,
      p_memo_template: input.memoTemplate,
      p_op_key: opKey(),
      p_replaces: null,
      p_schedule: null,
    },
    { session },
  );
}

/** clara.sign_adjustment_template(p_client,p_template,p_op_key) — admin+ (the
 *  same floor as sign_depreciation_authority: the signature is what makes the
 *  template able to post). Re-derives start/end-date freshness against the
 *  client's FY as of NOW — refuses CLR10 `template_fy_stale` if the FY moved
 *  since propose. */
export function signAdjustmentTemplate(
  session: SessionTokenAccessor,
  clientId: string,
  templateId: string,
): Promise<unknown> {
  return callDoor("sign_adjustment_template", { p_client: clientId, p_template: templateId, p_op_key: opKey() }, { session });
}

/** clara.retire_adjustment_template(p_client,p_template,p_reason,p_op_key) —
 *  admin+. `reason` is required (CLR10 blank). Refuses CLR38
 *  `occurrence_draft_outstanding` while a draft occurrence for this template
 *  is still unapproved/unwithdrawn. */
export function retireAdjustmentTemplate(
  session: SessionTokenAccessor,
  clientId: string,
  templateId: string,
  reason: string,
): Promise<unknown> {
  return callDoor(
    "retire_adjustment_template",
    { p_client: clientId, p_template: templateId, p_reason: reason, p_op_key: opKey() },
    { session },
  );
}

/** clara.run_adjustment_manual(p_client,p_template,p_period_start,
 *  p_period_end,p_op_key) — bookkeeper+. The period must exactly match the
 *  live template's own cadence window and must have already ended; refuses
 *  CLR38/CLR10 with a named reason otherwise (rendered verbatim). */
export function runAdjustmentManual(
  session: SessionTokenAccessor,
  clientId: string,
  templateId: string,
  periodStart: string,
  periodEnd: string,
): Promise<unknown> {
  return callDoor(
    "run_adjustment_manual",
    { p_client: clientId, p_template: templateId, p_period_start: periodStart, p_period_end: periodEnd, p_op_key: opKey() },
    { session },
  );
}

/** clara.reverse_adjustment_pair(p_client,p_occurrence,p_reason,p_op_key) —
 *  bookkeeper+. `occurrenceEntryId` is a run's own `entry_id` (a
 *  `journal_entries.id`) — NOT the `adjustment_runs.id` — the census's own
 *  finding reading `clara._pair_reverse_core`: it locks and reads the
 *  occurrence by that journal-entry id and its live auto-reversal mirror.
 *  Mints two draft corrections (leg-swapped, dated from each half it
 *  reverses) and a `pending` `adjustment_pair_reversals` receipt for a
 *  DISTINCT checker to approve or cancel — this call never approves anything
 *  itself. */
export function reverseAdjustmentPair(
  session: SessionTokenAccessor,
  clientId: string,
  occurrenceEntryId: string,
  reason: string,
): Promise<unknown> {
  return callDoor(
    "reverse_adjustment_pair",
    { p_client: clientId, p_occurrence: occurrenceEntryId, p_reason: reason, p_op_key: opKey() },
    { session },
  );
}

/** clara.approve_pair_reversal(p_client,p_pair,p_op_key,p_attestation) —
 *  bookkeeper+ (a DISTINCT checker from whoever raised the reversal — maker-
 *  checker, enforced at the door). `attestation` is optional at the live
 *  signature. Refuses CLR10 `pair_not_pending` if the receipt already moved,
 *  CLR39 `pair_correction_stale` if either correction was edited since it was
 *  minted. */
export function approvePairReversal(
  session: SessionTokenAccessor,
  clientId: string,
  pairId: string,
  attestation: string | null = null,
): Promise<unknown> {
  return callDoor(
    "approve_pair_reversal",
    { p_client: clientId, p_pair: pairId, p_op_key: opKey(), p_attestation: attestation },
    { session },
  );
}

/** clara.cancel_pair_reversal(p_client,p_pair,p_reason,p_op_key) —
 *  bookkeeper+. Withdraws both draft corrections and releases their reserved
 *  approve op-keys (they are CLOSED, never spendable again — `_finish_op`
 *  with `deferred: true`). Refuses CLR10 `pair_not_pending` /
 *  `pair_half_not_draft` if either half already moved. */
export function cancelPairReversal(
  session: SessionTokenAccessor,
  clientId: string,
  pairId: string,
  reason: string,
): Promise<unknown> {
  return callDoor(
    "cancel_pair_reversal",
    { p_client: clientId, p_pair: pairId, p_reason: reason, p_op_key: opKey() },
    { session },
  );
}
