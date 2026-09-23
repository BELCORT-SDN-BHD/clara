// Depreciation authority + runs — T3 (port wave), verb census at the live
// 0140 catalog. `get_depreciation_runs` in the port-wave plan's own door list
// (port-wave-plan-2026-08-28.md §4, T3) does not exist at the live body —
// the census's own scope note (§7.0): the live pair is `list_depreciation_runs
// (p_client)` (the runs list) and `get_depreciation_run(p_run)` (one run's
// full receipt, singular, keyed by run id not client). Built against the
// live names.

import { useRef } from "react";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FaDepreciationAuthority = {
  id: string;
  /** #979 (0251): WIDENED to the three values `clara.fa_depreciation_authorities.status` admits.
   *  Before 0251, `get_depreciation_authority`'s own live query selected only
   *  `where status in ('live','proposed')`, so a client whose ONLY authority was retired got
   *  `authority: null` back — indistinguishable from a client that never proposed one. 0251 adds
   *  a fallback to the client's most recent RETIRED authority when neither exists, so `retired`
   *  is a value this field can now actually carry. */
  status: "proposed" | "live" | "retired";
  cadence: "monthly" | "annual";
  proposed_by: string;
  signed_by: string | null;
  retired_by: string | null;
  created_at: string;
  /** #979 (0251) — the retirement's own reason, REQUIRED at retire time (CLR10 blank) and
   *  present on this object ONLY when `status` is `retired` — a live or a proposed authority
   *  carries no such key at all. */
  retired_reason?: string | null;
  /** #979 (0251) — when the retirement happened, present ONLY when `status` is `retired`. */
  retired_at?: string | null;
  /** #651 [0227] — THE AUTHORITY WINDOW'S FLOOR: the first day of the month the authority was
   *  SIGNED, in the book's Asia/Kuala_Lumpur calendar, written once and frozen (D8). The due
   *  oracle never proposes a period starting before it, so a signature is not permission to charge
   *  every past period. #979 (0251): present on this object ONLY when `status` is `retired` — a
   *  live authority's window floor exists on the same row but this read does not surface it yet
   *  (a different ticket's widening; `components/registers/fa-authority-ceremony.tsx` still
   *  carries the dead code that expects it one day). `null` on a proposed authority.
   *  `undefined` on a live one. */
  authority_from?: string | null;
  /** #651 [0227] — the row in THIS database that carries the firm's instruction. REQUIRED at sign
   *  time and RESOLVED against the same firm AND client; a Knowledge preference or a calculation
   *  policy resolves to nothing and is refused by name (CLR38 `authority_ref_unresolved`).
   *  `null` on rows signed before 0227. */
  authority_ref?: FaAuthorityRef | null;
  authority_kind?: string | null;
};

/** The two relations an instruction may live in. `chat_task` names `clara.agent_tasks`;
 *  `accounting_work` names `clara.accounting_work`. */
export type FaAuthorityRef = { kind: "accounting_work" | "chat_task"; id: string };

export type FaDepreciationAuthorityEnvelope = {
  client_id: string;
  authority: FaDepreciationAuthority | null;
  /** True once at least one OTHER approved, un-reversed `scheduled_run` entry
   *  exists under this live authority — the autopost ramp predicate, DERIVED
   *  by the DB (design SS1.4). Never recomputed client-side. */
  ramp_earned: boolean;
  fy_end: { month: number; day: number; fallback: boolean };
  high_stakes_threshold_cents: number | null;
};

/** clara.get_depreciation_authority(p_client) — viewer+. CLR11 if the client
 *  is not in your firm. `authority` is null when none has ever been
 *  proposed. #979 (0251): when the client's most recent authority is
 *  retired and no live-or-proposed one exists, `authority` is THAT
 *  retired row (never null) — see `FaDepreciationAuthority.status`'s own
 *  comment. */
export function getDepreciationAuthority(session: SessionTokenAccessor, clientId: string): Promise<FaDepreciationAuthorityEnvelope> {
  return callDoor<FaDepreciationAuthorityEnvelope>("get_depreciation_authority", { p_client: clientId }, { session });
}

/** clara.propose_depreciation_authority(p_client, p_cadence, p_op_key) —
 *  bookkeeper+. `cadence` must be `monthly` or `annual` (CLR38 otherwise);
 *  refuses CLR38 `authority_already_live` if a live-or-proposed authority
 *  already exists — retire it first. */
export function proposeDepreciationAuthority(
  session: SessionTokenAccessor,
  args: { clientId: string; cadence: "monthly" | "annual"; opKey: string },
): Promise<unknown> {
  // #651 — ONE DECISION, ONE KEY (see `authorityIntent` / `useDepreciationDecisionKey` below).
  // The caller holds the key for the life of the open dialog; minting one here would make every
  // retry a NEW operation the database's replay ladder cannot recognise.
  return callDoor(
    "propose_depreciation_authority",
    { p_client: args.clientId, p_cadence: args.cadence, p_op_key: args.opKey },
    { session },
  );
}

/** clara.sign_depreciation_authority(p_client, p_authority, p_op_key) —
 *  ADMIN+ (WD-R9: the sign floor is stronger than bookkeeper — the signature
 *  is what the autopost ramp derives its authority from). Refuses CLR38 if
 *  the authority is not `proposed`, or another authority is already live.
 *  This module does NOT pre-hide the Sign trigger on a client-side role
 *  guess — the door is the wall; a non-admin sees its own CLR05-shaped
 *  refusal verbatim on attempt. */
export function signDepreciationAuthority(
  session: SessionTokenAccessor,
  args: { clientId: string; authorityId: string; authorityRef: FaAuthorityRef; opKey: string },
): Promise<unknown> {
  return callDoor(
    "sign_depreciation_authority",
    {
      p_client: args.clientId,
      p_authority: args.authorityId,
      // #651 — ONE DECISION, ONE KEY, and on THIS door it is the one a person meets: the sign
      // door's replay identity is {client, authority} (0227), so a retry that mints a fresh key
      // reserves a new operation, reaches the `authority_already_live` arm and refuses instead of
      // handing back the receipt the lost response already earned.
      p_op_key: args.opKey,
      // #651 [0227] — REQUIRED and RESOLVED. The door refuses CLR38 `authority_ref_invalid`
      // (constraint object | kind | id) on a malformed one and `authority_ref_unresolved` when it
      // names no row in this firm AND client. Both refusals render verbatim, with their code.
      p_authority_ref: args.authorityRef,
    },
    { session },
  );
}

/** clara.retire_depreciation_authority(p_client, p_authority, p_reason,
 *  p_op_key) — ADMIN+. `reason` is required (CLR10 blank). Refuses CLR38
 *  `authority_not_live` if already retired. */
export function retireDepreciationAuthority(
  session: SessionTokenAccessor,
  args: { clientId: string; authorityId: string; reason: string; opKey: string },
): Promise<unknown> {
  // #651 — ONE DECISION, ONE KEY. A second retirement of the same authority refuses CLR38
  // `authority_not_live`; with the caller's key the retry returns the first receipt instead.
  return callDoor(
    "retire_depreciation_authority",
    { p_client: args.clientId, p_authority: args.authorityId, p_reason: args.reason, p_op_key: args.opKey },
    { session },
  );
}

export type FaDepreciationRunRow = {
  id: string;
  authority_id: string;
  period_start: string;
  period_end: string;
  mode: "post" | "draft";
  entries: number;
  charged_cents: number;
  skipped: unknown[];
  entry_id: string | null;
  created_at: string;
};

/** clara.list_depreciation_runs(p_client) — viewer+. CLR11 if the client is
 *  not in your firm. */
export async function listDepreciationRuns(session: SessionTokenAccessor, clientId: string): Promise<FaDepreciationRunRow[]> {
  const out = await callDoor<{ client_id: string; runs: FaDepreciationRunRow[] }>(
    "list_depreciation_runs",
    { p_client: clientId },
    { session },
  );
  return out.runs;
}

/** clara.get_depreciation_run(p_run) — viewer+. Keyed by the run's OWN id
 *  (not `p_client` — the live signature the port-wave plan's
 *  `get_depreciation_runs` name does not match; see this file's header).
 *  CLR11 if the run is not in your firm. */
export async function getDepreciationRun(session: SessionTokenAccessor, runId: string): Promise<FaDepreciationRunRow> {
  const out = await callDoor<{ run: FaDepreciationRunRow }>("get_depreciation_run", { p_run: runId }, { session });
  return out.run;
}

/** clara.run_depreciation_manual(p_client, p_period_start, p_period_end,
 *  p_op_key) — bookkeeper+. The period must be EXACTLY the live authority's
 *  own cadence window (CLR38 `not_cadence_aligned` otherwise — the door
 *  states the exact `period_start`/`period_end` it wanted in the refusal
 *  detail) and must have already ENDED (CLR38 `not_ended`). Refuses CLR38
 *  `authority_not_live` with no live authority, `period_draft_outstanding` /
 *  `period_earlier_unmet` on sequencing, `period_correction_unsound` on a
 *  reversed-and-relanded prior charge. A zero-charge period is a genuine
 *  `noop` — no entry, no receipt — reported, not an error. */
export function runDepreciationManual(
  session: SessionTokenAccessor,
  args: { clientId: string; periodStart: string; periodEnd: string; opKey: string },
): Promise<unknown> {
  return callDoor(
    "run_depreciation_manual",
    {
      p_client: args.clientId,
      p_period_start: args.periodStart,
      p_period_end: args.periodEnd,
      // #651 — ONE DECISION, ONE KEY. This used to mint `crypto.randomUUID()` inside itself, so a
      // LOST RESPONSE answered the retry a person makes with a refusal instead of the receipt it
      // had already earned. The caller now holds the key for the life of the open decision
      // (`useDepreciationDecisionKey` below).
      p_op_key: args.opKey,
    },
    { session },
  );
}

// ---------------------------------------------------------------------------------------------
// #651 [0227] — THE PREVIEW READ. `clara.preview_depreciation_run(p_client)` is VIEWER+ and
// `stable` in the database, so it cannot write: no operation key, no receipt, no ledger row. What
// it returns is the EXACT period the database chose (a caller never names one), the per-asset
// amounts, the two GL legs the entry will carry, and every asset it will skip with its reason.
// ---------------------------------------------------------------------------------------------

export type FaPreviewCharge = {
  asset_id: string;
  description: string | null;
  period_start: string;
  period_end: string;
  amount_cents: number;
};

export type FaPreviewSkip = { asset_id: string; reason: string };

export type FaPreviewLeg = { account_code: string; debit_cents: number; credit_cents: number };

/** A period the due oracle SKIPPED because its fiscal year is closing or closed. It will never be
 *  run in its own right. Its months are NOT lost: they are carried by the next OPEN period's
 *  charge — but, since #975 (0279), only once the accountant has judged them. See
 *  `FaClosedArrears` below, and `CONTEXT.md`'s "Closed-year arrears resolution". */
export type FaSkippedClosedPeriod = {
  period_start: string;
  period_end: string;
  fiscal_year_id: string;
  fy_label: string | null;
  fy_status: string;
};

/** #975 [0279] — the ONE answer a person may give to the closed-year arrears question. Under
 *  IAS 8 a material prior-period error is restated in the year it belongs to and only an
 *  immaterial one is folded into the current period, so materiality is ASKED for and never
 *  inferred. `fold_current` lets the next open period's run carry the months; `reopen_prior`
 *  keeps them where they belong and points at `clara.reopen_fiscal_year`. */
export type FaArrearsResolution = {
  id: string;
  choice: "fold_current" | "reopen_prior";
  arrears_cents: number;
  decided_by: string;
  decided_at: string;
  reason: string | null;
};

/** #975 [0279] — what the NEXT run would fold forward out of closing or closed fiscal years, and
 *  whether anybody has judged it yet. Reported beside `skipped_closed` rather than inside it: a
 *  closed year can carry arrears with no period skipped at all. Always present, EMPTY rather than
 *  absent, so a reader never has to tell "none" from "this build does not say". */
export type FaClosedArrears = {
  arrears_cents: number;
  fiscal_years: Array<{
    fiscal_year_id: string;
    fy_label: string | null;
    fy_status: string;
    fy_starts_on: string;
    fy_ends_on: string;
    arrears_cents: number;
    resolution: FaArrearsResolution | null;
  }>;
};

export type FaRunPreview = {
  client_id: string;
  due: boolean;
  /** The database's own reason when nothing is due — `period_not_ended`, `nothing_due`,
   *  `authority_not_live`, `period_draft_outstanding`, `period_correction_unsound`. */
  reason?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  cadence?: "monthly" | "annual" | null;
  authority_from?: string | null;
  authority_ref?: FaAuthorityRef | null;
  skipped_closed?: FaSkippedClosedPeriod[];
  closed_arrears?: FaClosedArrears;
  charges: FaPreviewCharge[];
  skipped: FaPreviewSkip[];
  legs: FaPreviewLeg[];
  charged_cents: number;
  entries: number;
  /** What the run WOULD do — `post` once the one-time ramp is earned, `draft` before that. A
   *  high-stakes entry still drafts, which the surface says beside it. */
  mode_would_be?: "post" | "draft";
  ramp_earned?: boolean;
};

/** clara.preview_depreciation_run(p_client) — viewer+. CLR11 if the client is not in your firm. */
export function previewDepreciationRun(session: SessionTokenAccessor, clientId: string): Promise<FaRunPreview> {
  return callDoor<FaRunPreview>("preview_depreciation_run", { p_client: clientId }, { session });
}

/** THE FIVE SKIP REASONS a run receipt can carry, MEASURED off the live catalog: four from
 *  `clara._fa_asset_charges` plus `disposal_draft_outstanding`, which `clara._fa_compute_charges`
 *  writes itself and the per-asset body can NEVER return. An asset that is simply up to date is
 *  not a skip and never appears. A reason outside this list still renders — as its verbatim code
 *  beside a neutral sentence — because a vocabulary that was measured once can grow. */
export const FA_SKIP_REASONS = [
  "incomplete", "not_in_service", "fully_depreciated", "none_method", "disposal_draft_outstanding",
] as const;
export type FaSkipReason = (typeof FA_SKIP_REASONS)[number];

/** A skip reason is BENIGN when it states a settled fact about the asset rather than work somebody
 *  still owes. Appendix D row 17: a collapsible may never hide an unresolved question by default,
 *  so a skipped list carrying a non-benign reason renders OPEN. */
export const FA_BENIGN_SKIP_REASONS: readonly string[] = ["fully_depreciated", "none_method", "not_in_service"];

export function faSkipListStartsOpen(skipped: readonly { reason: string }[]): boolean {
  return skipped.some((s) => !FA_BENIGN_SKIP_REASONS.includes(s.reason));
}

// ---------------------------------------------------------------------------------------------
// #651 — ONE DECISION, ONE KEY.
//
// The shape is `components/work/work-cancel-dialog.tsx:95`'s `useDecisionKey`, keyed on the INTENT
// TUPLE so that changing what is being decided inside an open dialog mints a new key while
// pressing Confirm twice on the same decision does not. `renew()` ends a decision explicitly — a
// withdrawn draft being run again is a NEW operation, and reusing the old key would hand back the
// receipt of the run that was withdrawn.
// ---------------------------------------------------------------------------------------------

/** The intent tuple a depreciation run is identified by — exactly the tuple
 *  `clara._fa_run_period_core` hashes into its own operation key. */
export function depreciationIntent(args: { clientId: string; periodStart: string; periodEnd: string }): string {
  return `${args.clientId}|${args.periodStart}|${args.periodEnd}`;
}

/** The intent tuple an AUTHORITY CEREMONY decision is identified by — the act, the authority it
 *  acts on, and the value being decided (the cadence proposed, the instruction cited, the reason
 *  given). Two attempts at the same decision are ONE intent; changing what is being decided inside
 *  the open dialog is a different one and earns a new key.
 *
 *  #651 fix-round 1 (adversarial review ADV-651-8): "one decision, one key" was applied to the run
 *  door alone, so propose / sign / retire each minted a key inside the wrapper and a retry after a
 *  lost response was a new operation. The doors were already idempotent; only the key transport
 *  was not. */
export function authorityIntent(
  act: "propose" | "sign" | "retire",
  args: { clientId: string; authorityId?: string | null; value?: string | null },
): string {
  return `${act}|${args.clientId}|${args.authorityId ?? ""}|${args.value ?? ""}`;
}

/** A stable key per OPEN DECISION: minted on first ask, reused for every attempt at the SAME
 *  intent, renewed when the intent changes or the caller ends the decision. ONE hook serves every
 *  FA door on this lane — the run dialog and the three authority ceremonies — because they all
 *  need the same thing: a key that survives a retry and dies with the decision. */
export function useDepreciationDecisionKey(): { key: (intent: string) => string; renew: () => void } {
  const ref = useRef<{ intent: string; key: string } | null>(null);
  return {
    key: (intent: string) => {
      if (ref.current === null || ref.current.intent !== intent) {
        ref.current = { intent, key: crypto.randomUUID() };
      }
      return ref.current.key;
    },
    renew: () => {
      ref.current = null;
    },
  };
}
