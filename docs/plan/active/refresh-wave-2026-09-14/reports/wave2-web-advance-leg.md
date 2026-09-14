# #643 wave-2 web fix round — the direct form's advance leg

**Branch** `integration/wave-2-web` · worktree `C:\Users\zhant\Desktop\clara-wt\int2web` · one commit
(`4dac9fc5`) on top of `integration/wave-2` at `3adc3043`. Not pushed; worktree left clean.

## The gap

Named, not fixed, in v19's own report (`docs/plan/active/refresh-wave-2026-09-14/reports/v19-final.md`,
"Unverified / named, not fixed"): `apps/web/components/accounting/periodic-adjustment-form.tsx`
offered `advanceAccountCode` but `apps/web/lib/work/periodic-adjustment.ts`'s `derivedLines` derived
no leg for it, so choosing a staff-advance account earned 0194's `advance_leg` refusal at admission.

## What changed

- `lib/work/periodic-adjustment.ts:97` — new `advanceCents: number` on `AdjustmentDraft` (derivation
  input only, mirroring `settledCents`'s own N3 rule).
- `lib/work/periodic-adjustment.ts:313-330` — local refusals mirroring 0194's `_assert_adjustment_relationships`:
  `distinct` (advance repeats expense/liability) and `advanceLegUnused`/`overAdvanced` (0194's
  `advance_leg`, and the control's own `≤ amount` bound).
  `advanceCents` stays out of `ADJUSTMENT_FIELDS` (periodic-adjustment.ts:526) — no server path can
  ever name it, exactly like `settledCents`.
- `lib/work/periodic-adjustment.ts:375-431` (`derivedLines`) — liability credit is now
  `amount - settled - advance`; a third leg (advance account, Cr advance) is pushed before the
  payment leg, byte-identical in order and shape to the chat lane's
  `packages/runtime/lib/periodic-adjustment-basis.ts`'s `basisFromAdjustment`.
- `lib/work/periodic-adjustment-draft.ts:88` — `advanceCents` added to the sessionStorage round-trip
  whitelist, so a restored draft doesn't silently drop the figure and reintroduce the refusal.
- `components/accounting/periodic-adjustment-form.tsx:667-698` — `advanceCents` control, shown only
  once an advance account is chosen; clearing the account clears the stale figure with it.
- `messages/en.json` — 4 new keys: `advanceCents`, `advanceCentsHelp`, `issues.advanceLegUnused`,
  `issues.overAdvanced`.

## Cells (red → green)

- `lib/work/periodic-adjustment.test.ts` (44 total, was 22): new cases in the mirror table
  (periodic-adjustment.test.ts:179-217) plus two rewritten tests for the derived 3/4-leg split and
  the local `advance_leg` refusal, plus `fieldForAdjustmentPath` coverage for `advance_cents`.
- `components/accounting/periodic-adjustment-form.test.tsx` (22 total, was 18): 4 new tests
  (lines 448-540) — derive+submit, zero-cents local refusal, `distinct` refusal, and clearing the
  account clears the stale amount.
- `e2e/periodic-adjustment-walk.spec.ts` (13 total, was 12): one new walk cell (line 178) — fills a
  payroll obligation, names an advance account+amount, asserts the 3-line grid and the submitted
  body (`advanceAccountCode` present, `advanceCents` absent, 3 basis lines). Mock needed no change —
  its admission route already echoes whatever body it receives.

## Run

`node --test` on both unit files: 44/44 and 22/22. `pnpm --filter @clara/web lint`: exit 0 (eslint,
contrast, manifest, message-keys all green). `pnpm typecheck`: exit 0. Walk
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3240 CLARA_E2E_NEXT_PORT=3241 CLARA_E2E_RUNTIME_PORT=3242
pnpm --filter @clara/web e2e periodic-adjustment`): 13/13 passed. No db change; no other worktree
touched.
