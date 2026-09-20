// #976 [0249, fold the fixed-asset particulars completion wall shared by
// `clara.complete_fixed_asset_particulars` and `clara._fa_complete_particulars_core`] — the
// battery's frontier gate. NOT a test file: the name does not end in `.test.mjs`, so
// `node --test` ignores it.
//
// NO SECOND CLIENT FACTORY. #976 changes nothing about what a completion MEANS — only where the
// "first completion is not a change" and "already complete" checks live — so it reuses #651's
// whole world (`p651Client`, `faWorld`, `buyAsset`, `completeWith`, `completeForWith`,
// `refuses`, `caught`, `reasonToken`, `faRow`, `rootQuery`, `opk`) via `export *` rather than
// forking a second copy of the same fixed-asset world. Its own clients are still labelled
// `p976_…` (through `p651Client`'s own label argument) so a leftover rig's rows are traceable to
// this ticket.

import { assert, rootQuery, markSkip } from "./depreciation-history-fixtures.mjs";

export * from "./depreciation-history-fixtures.mjs";

// ===========================================================================================
// The frontier gate — on 0249's STABLE STEM, never its number (a number is claimed at MERGE, a
// stem is not).
// ===========================================================================================

/** `0249_fa_particulars_completion_fold.sql` → `fa_particulars_completion_fold$`. */
export const FA_PARTICULARS_COMPLETION_FOLD_STEM = "fa_particulars_completion_fold$";

let _ready = null;
export async function faParticularsCompletionFoldReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [FA_PARTICULARS_COMPLETION_FOLD_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

const MISSING = `#976 migration (${FA_PARTICULARS_COMPLETION_FOLD_STEM}) is NOT applied to this database`;

/** The per-CELL frontier gate, COUNTED. A FOCUSED invocation (no `--import` of
 *  fa-particulars-completion-fold-preintegration-gate.mjs) FAILS LOUDLY below 0249 — a skip is
 *  not evidence, and final acceptance is exactly that focused shape counting ZERO skips. */
export async function gate976(t) {
  if (await faParticularsCompletionFoldReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_FA_PARTICULARS_COMPLETION_FOLD !== "1") {
    assert.fail(
      `${MISSING}, and this is a FOCUSED run. A skip is not evidence: apply the migration, or `
      + "preload tests/fa-particulars-completion-fold-preintegration-gate.mjs for a "
      + "package-wide sweep.");
  }
  markSkip();
  t.skip(`#976 fa-particulars-completion-fold absent (no ${FA_PARTICULARS_COMPLETION_FOLD_STEM} migration applied)`);
  return true;
}

/** The two normalized WALL fragments #976 folds — copied here rather than re-derived, so a
 *  drift in either file is visible as a diff instead of a coincidence. Lowercased,
 *  whitespace-collapsed, comments stripped: the same normalization the migration's own tail
 *  assertions use.
 *
 *  FRAG_CHANGE_CLASS is the "a first completion is not a change" refusal (CLR37
 *  fa_change_class_on_completion). FRAG_ALREADY_COMPLETE is the "already complete" refusal
 *  (CLR37 fa_particulars_already_complete) THROUGH the lifecycle check, the validator call and
 *  the non-depreciable/residual bounds that followed it in both original bodies — one
 *  contiguous chunk, never independently duplicated within itself. */
export const FRAG_CHANGE_CLASS =
  "if p_particulars ? 'change_class' or p_particulars ? 'change_reason' then raise exception "
  + "'depreciation particulars are being completed for the first time; a change class describes "
  + "a revision (clara.revise_fixed_asset_particulars), not a completion' using errcode = "
  + "'clr37', detail = jsonb_build_object('reason', 'fa_change_class_on_completion', "
  + "'asset_id', p_asset, 'remedy', 'revise_fixed_asset_particulars')::text; end if;";

export const FRAG_ALREADY_COMPLETE =
  "if clara._fa_particulars_complete(fa) then raise exception 'this asset''s particulars are "
  + "already complete; use revise_fixed_asset_particulars for a prospective change' using "
  + "errcode = 'clr37', detail = jsonb_build_object('reason', 'fa_particulars_already_complete', "
  + "'asset_id', p_asset)::text; end if; if fa.status not in ('pending', 'active') then raise "
  + "exception 'only a pending or active register row can be completed' using errcode = "
  + "'clr37', detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', "
  + "'lifecycle', 'asset_id', p_asset, 'status', fa.status)::text; end if; v_p := "
  + "clara._fa_validate_particulars(p_particulars); if fa.accum_depr_account_code is null and "
  + "(v_p ->> 'method') <> 'none' then raise exception 'this asset sits on a non-depreciable "
  + "enrolment (no accumulated-depreciation account); its method must be none' using errcode = "
  + "'clr37', detail = '{\"reason\":\"fa_particulars_invalid\",\"axis\":\"non_depreciable\"}'; "
  + "end if; v_res := coalesce((v_p ->> 'residual_cents')::bigint, 0); if (v_p ->> 'method') <> "
  + "'none' and v_res > fa.cost_cents then raise exception 'a residual value cannot exceed cost' "
  + "using errcode = 'clr37', detail = "
  + "'{\"reason\":\"fa_particulars_invalid\",\"axis\":\"residual\"}'; end if;";

/** The fully-qualified calls the fold wires into both recut bodies. TWO routines, because the
 *  wall has two halves with two different PLACES in a door: the change-class guard needs only
 *  the payload and 0227 put it AHEAD of clara._reserve_op ("refused BEFORE the op key is
 *  reserved, so a retry is clean"); the rest needs the locked register row and has always run
 *  after it. Each half is still owned in exactly one place, which is the ticket. */
export const PARTICULARS_CHANGE_GUARD_CALL = "clara._fa_assert_completion_not_a_change(";
export const PARTICULARS_WALL_CALL = "clara._fa_assert_particulars_completable(";
