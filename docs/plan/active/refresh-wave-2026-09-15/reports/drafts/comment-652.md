Landed on `impl/652-accrual-adjustments` via twelve commits (`a7b14c9f` red battery → `31d09ca6` migration 0207 → `56b0b98b`/`8d87bcdc` runtime basis + World e2e → `1dc9f255`/`a87c11e0`/`c5e1d69e` web route + walk → `b579e25a` nav gate → two review rounds: `abdb8716`/`cebfcca5` round 1, `f917c4ae` round 2).

Migration 0207 rides `kind='reversing_journal'` per DECISIONS D12: **no** new `accounting_work` purpose, **no** posting-core recut, **no** widening of `accounting_plans.kind`. New append-only relation `clara.accrual_adjustments` (amount basis, expense/liability accounts, service period, method as a jsonb selection-rule enum, authority + source refs). Door `create_accrual_adjustment` writes the particulars, creates the plan/revision through the existing 0193 plan core, and admits the current-period occurrence in one commit; posted entry/reversal are derived by join. Two ratified narrowings beyond the brief: `effective_to` is now required so the authority window can't outrun the stated term, and round 2 added `_assert_accrual_schedule_yields` (CLR10 `accrual_schedule_yields_no_occurrence`) refusing a term whose own day rule can never reach a due date. Route `/clients/[clientId]/accruals`; real Postgres/Workflow World e2e (crash replay, reversal binding, cancel + catch-up). Local evidence after round 2: DB battery 21/21, runtime unit 20/20, World e2e PASS 1–4, web unit 79/79, walk 14/14, whole `apps/web` suite 3759/3757 (one pre-existing unrelated flake, solo 2/2), clean from-scratch chain. Two review rounds closed. Hosted evidence pending.

## Per acceptance criterion / historical row

| Row | State | Evidence |
|---|---|---|
| AC1 particulars + term law + zero refused | done | `_assert_accrual_particulars` + `_assert_accrual_term_window` (round 1) + `_assert_accrual_schedule_yields` (round 2); cells `p652.basis.*`, `p652.term.window`, `p652.schedule.yields` all pass |
| AC2 originating record + reversal relationship + config≠occurrence | done (reversal half verify-only, as briefed) | `clara.accrual_adjustments` unique(plan_id, revision); `p652.config.atomic`, `p652.config.vs.occurrence`, `p652.reversal.binds` |
| AC3 one commit; accepted config ≠ posted occurrence | done | fault-injection rollback proof; `accrual-e2e.mjs` PASS 1+2 |
| AC4 park / catch-up / future instruction | partial, residual named | future authority + locked catch-up built; the claraWork park (`answer_accrual_term`) is a successor contract, not built |
| AC5 boundary with #643 | done (build half) | `AccrualShapeBoundary` / `AccrualConfigurationBoundary`, persistent on list/detail/form |
| AC6 real journey, all states | done | walk 14/14 + form 13/13 + list 3/3 (round 1 added the empty-list cell per SPEC finding F2) |
| AC7 production reads/commands, real World | done locally; hosted pending | db battery via `humanQuery`/`clara_runtime` personas only; `accrual-e2e.mjs` exit 0 |
| C08.1 locate/inspect/select with feedback | done | route + walk cells 1–3 |
| C08.2 zero-value not meaningful; name the owner | done, with a finding | owner is `clara._assert_journal_basis`; its `nonzero_total` arm is structurally unreachable (follow-up filed, not this ticket's body) |
| C55.13 re-read evidence, ask bounded, never fabricate | partial, residual named | term law ships; the bounded-question half is the claraWork park (not built) |
| C88.13 synthetic then real-environment | partial, hosted leg owed | World e2e proves trigger/effect/retry/cancellation locally; hosted leg is a follow-up |

## Review summary

- **SPEC** (round 1): F1 should — two dead breadcrumb rows removed. F2 should — AC6's empty-list state had no cell → added (3 cells). F3 note — a rig-isolation count in the final report was a combined-invocation total, not the file alone → corrected in place.
- **ADVERSARIAL** (round 1): A1 should — a frozen term could post dates outside its own window on multi-period schedules → `_assert_accrual_term_window`, `effective_to` required. A2 should — `method` was recorded but never applied → narrowed to the one honoured rule (`stated_amount`), other three named as successor residual. A3–A7 notes (typed conflict detail, foreign-pin capture, fixture-window reshape, ⌘K keyword restored, rig housekeeping) — all applied.
- **STANDARDS**: zero findings both rounds.
- **Round 2** carried one finding, NB1 (recheck-1, orchestrator-flagged): round 1's window wall left a term too short for its own day rule to ever post, silently accepted. Closed by `_assert_accrual_schedule_yields`, swept against the plan lane's own oracle over 3168 shapes. Recheck-2 also flagged, non-blocking, that a term made only of days ≥29 with no month end has no admissible schedule — named beside follow-up 6, not fixed.

## Ratifications applied (DECISIONS §3.1)

> **#652** | Authority window must lie inside the stated term (`effective_to` required) | **Ratified** (R4). The chat tool's schema is the module's (`lib/accrual-basis.ts`): `effective_to` is no longer optional there and the cut follows the module, not the older stanza text.
> **#652** | CLR10 `accrual_schedule_yields_no_occurrence` for a schedule that reaches no due date | **Ratified** (R4). Follow-up for the plan lane's own door (owned by #653's recuts) to share the refusal.

## Residuals / follow-ups (named, not fixed here)

- C88.13 hosted leg (trigger/effect/retry/cancellation on a real environment) owed.
- Three withdrawn selection rules need a run-time reader `_plan_occurrence_basis` (#653-owned) doesn't provide today.
- Plan lane's own door (`create_accounting_plan`, #653-owned) still accepts a schedule reaching no due date — #652's own entrance refuses it, that door does not.
- Scheduled-adjustment overlap detection stays advisory-only and one-sided; `_assert_journal_basis`'s `nonzero_total` arm is structurally unreachable; `rig-isolation` T10b fails from WDK-world contamination (rig state, not a defect) — all three shared with #653.
- Lane-mock private body-reader hazard is a cross-cutting risk shared with #633/#647/#653.

## Successor contracts

- `chatTurn_v20`'s `start_accrual_work` — no migration, no `WORK_ACCEPTED_PURPOSES` widening (purpose stays `journal_entry`). Stanza in `packages/runtime/lib/accrual-basis.ts`'s footer.
- `claraWork_v4`'s `answer_accrual_term` term park — **not built**, uses existing `open_work_question`/`answer_work_question` doors, no migration needed.
- **Flag for the integration cut worker:** neither stanza is named in DECISIONS §1.1's own cut lists (WAVE-DIGEST §5) — read `652-final.md`'s successor sections directly, not just the DECISIONS summary line.

**Integration evidence:** <INTEGRATION_PLACEHOLDER>
