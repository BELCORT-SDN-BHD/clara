# #640 — fix round on `impl/640-accounting-plans`

**Worktree** `C:\Users\zhant\Desktop\clara-wt\640` · **branch** `impl/640-accounting-plans` · worktree CLEAN.
**New commits** (on top of the 7 already there): `af2b9ca3` fix(db) · `88829aa4` test(db) · `2803fc5e` fix(runtime) · `52413c53` fix(web) · `28db2338` docs.
**Rig** `rig640b` 127.0.0.1:55443/clara_640, **dropped and rebuilt from scratch on the final 0193**: `migrate: 183 new migration(s) applied · 183 total`, exit 0, 249 s. Red-first measurements used `rig640` (55438) with the pre-fix file re-applied from `git show 2fa5ad4e:packages/db/migrations/0193_accounting_plans.sql`.

## finding → what I did → evidence

| finding | what I did | evidence (cell + output) |
|---|---|---|
| **B1** revision double-posts the current period | `period_key` (step-aligned, anchored on the frozen `authority_from`) + `unique (plan_id, leg, period_key)`; picker and door both refuse `period_already_admitted` (CLR13) | `p640.revision.no_double_post` — pre-fix red "the revision must not re-admit a period already run; got [["2026-09-13",null],["2026-09-14",null]] · 2 !== 1"; now ok |
| **B2** naked reversal | `clara._plan_admissible_event` reads the plan's occurrence rows; a reversal is a candidate only when its accrual stands; the door holds the same wall (`reversal_before_primary`, CLR13, recorded on the occurrence) | `p640.occ.reversal_before_primary` — pre-fix red "+ 'reversal' − 'primary'"; `p640.occ.reversal_refusal` — pre-fix red "nothing is admitted · 1 !== 0"; both ok |
| **B3** `effective_from` moves backwards | `accounting_plans.authority_from` written once and frozen; `revise` refuses CLR10 `effective_from_before_authority` | `p640.revision.authority_floor` — pre-fix red "expected SQLSTATE CLR10 but the call SUCCEEDED (no error)"; now ok |
| **S4** ended-plan test made on an unlocked read | status re-read under the plan row lock in `revise_accounting_plan` | `p640.revision.end_race` ok — asserts on `pg_proc.prosrc` that `plan_ended` is tested *after* `for update` |
| **S5** occurrence printed a revision it did not run under | `revision`/`intent_key`/`attempt` taken out of the immutable identity, moved with the admission they describe | `p640.occ.retry_intent_key` ok |
| **S6** a final accrual could never be reversed | `_plan_window_ceiling` extends the reversal leg to `_plan_reversal_date(effective_to)` | `p640.occ.final_reversal` ok |
| **S7** a cancelled Work made a period unpostable forever | `attempt` + `:a<n>` key suffix; catch-up only; never over a committed receipt | `p640.catchup.reattempt` ok (also proves a **completed** period is not re-attemptable) |
| **S8** tail claimed more than it checked | the five 0045 door bodies pinned by digest in §0 and re-read byte-for-byte in §J; CHECKs, the period unique, `authority_from`, the lock order and both walls read off the catalog / `prosrc` | the whole chain applies with the tail live: `migrate … 183 total`, exit 0 |
| **MINE — B2 again, through 0184's cancel door** | "admitted" ≠ "stands": `clara._plan_primary_stands` (admitted **and** the Work not cancelled/failed without a committed receipt), used by picker *and* door | `p640.occ.reversal_after_cancel` — red on the *partially fixed* file: "a reversal behind a cancelled accrual is not a due event; got [["2026-08-31","primary"],["2026-09-01","reversal"]]"; now ok |
| **MINE — dead code** `_plan_due_event_on_or_before` unreachable, still commented "the ONE event a scan considers" | deleted with its tail assertions and rig-meta row; tail now proves the reversal arithmetic through the functions the lane uses | full chain green; rig-meta consumers 117 pass / 1 skip |
| **MINE — false cadence claim** ("one indexed query, nothing per client") in the 0193 header, `plan-occurrences.mjs` and ARCHITECTURE §8 | restated: the row source is active plans; each costs a few equality probes, all served by `uq_plan_occurrences_plan_due` / `uq_plan_occurrences_period`; the due-date gate lives inside the picker | 0193 header, `packages/runtime/lib/plan-occurrences.mjs`, ARCHITECTURE §8 |
| **MINE — B3 had no form mirror** | `validatePlanSchedule` takes `authorityFrom`; `effectiveFromBeforeAuthority` reported at the control; one `en.json` key | `lib/plans/schedule.test.ts` "a REVISION cannot start before the plan's own authority floor" — witnessed red with the guard disabled, then ok |
| **MINE — sweep red** the unconditional plan belt's `to_regprocedure` probe tripped a sibling cell | the adjustment cell now matches `adjustment_run_due`, its own door | `reconcile-adjustments-unit.test.mjs` 22/22 (was "not due → not invoked at all · expected true, actual false") |
| **MINE — two census reds** | `app-sidebar.test.tsx` still expected the Plans child at `registers?tab=adjustments`; the REVERSE GATE reported the three plan sub-routes as orphans → three `REGISTRY_BUILT` rows naming their builders | `app-sidebar.test.tsx` + `lib/command/routes.test.ts` 24/24 |
| **MINE — untested new laws** | `p640.revision.immutable` now covers frozen `authority_from`, frozen `period_key`, and the trigger-level narrowness of the S7 exit | cell ok |

Verified, no change needed: both walls run **inside** `_plan_admit_occurrence` under the plan row lock, so the picker's unlocked choice cannot be raced into a violation. Grants/ACL exactness, `explicit_instruction`-only authority (`authority_rule_unsupported`) and the advisory `overlap_warning` are unchanged and still asserted by the tail and by `p640.auth.ref` / `p640.schedule.overlap`.

## Commands and counts

- **db** (gates copied verbatim from `packages/db/package.json` "test"): `node --test --test-concurrency=1 $GATES tests/accounting-plans.test.mjs tests/accounting-plan-occurrences.test.mjs` → **31 tests, 31 pass, 0 fail, 0 skipped**. Neighbours `operation-census` + `rig-isolation` + `x40-wave-c-c-tieout` + `work-cancel` → **118 / 117 pass / 1 skipped** (rig-isolation's destructive cell; `CLARA_RIG_ALLOW_RESET` never set).
- **runtime unit**: `node --test tests/reconcile-belt-isolation-unit tests/reconcile-work-unit tests/reconcile-adjustments-unit tests/reconcile` → **74 / 74 pass**.
- **runtime World e2e**: after `pnpm --filter @clara/runtime build` and one `pnpm --filter @clara/runtime exec bootstrap`, `RELAY_TEST_MODE=1 node tests/plan-occurrence-e2e.mjs` → `[plan-e2e] OK`, exit 0 (4 passes incl. the SIGKILL-between-commit-and-checkpoint replay).
- **web touched**: **50 / 50 pass**; `app-sidebar` + `routes` **24 / 24**.
- **whole apps/web suite** (`node scripts/run-tests.mjs`, 273 s): **3393 tests, 3391 pass, 2 fail, 0 skipped**. Both reds are **load flakes**, green in isolation: `journal-composer.test.tsx` t728 (39/39 alone) and `checkout-faces-a11y.test.tsx` "bounded wait" (25/25 alone). Neither touches plans. #707/#693 did not appear in this suite.
- `pnpm typecheck` exit 0 · `pnpm lint` exit 0.
- **Named, not fixed**: `packages/runtime/tests/leader-state.test.mjs` fails on this host with `pg_dump failed to start (spawnSync pg_dump ENOENT)` — the Windows box has no `pg_dump` (RIG.md). Environment, not #640.

## Docs updated

`docs/ARCHITECTURE.md` §8 (occurrence laws, the accrual-stands rule, the restated cadence paragraph) and the §11 row (measured counts: db 31/31, 0 skip; hosted evidence still pending). 0193's own header and `packages/runtime/lib/plan-occurrences.mjs`'s header carry the same corrections.

## Open questions to carry back

- **Owner-flagged (unchanged by me):** create / revise / catch-up floor at `bookkeeper`, while the live 0045 adjustment-template lane needs admin twice (propose at bookkeeper, sign at admin). One lane authorises recurring journal postings with one person; the other needs two. Still open.
- **0045 ↔ 0193 convergence:** two lanes post recurring journals for one client. 0193 only warns (`overlap_warning`, advisory, never a refusal) and now pins the five 0045 door bodies by digest so it cannot touch them. Worth its own ticket.

## Assumptions / residuals

- A revision that changes **frequency** (monthly → quarterly) re-aligns period keys, so a month already posted can also take a quarterly entry. Left alone: that is a genuine change of what gets posted, and refusing it would refuse a legitimate schedule change. Worth filing.
- An S7 re-attempt replaces `work_id` on the same occurrence row, so the plan's history shows only the latest attempt and the cancelled Work drops out of the plan view. `attempt` and `period_key` reach `PlanOccurrenceRow` but nothing renders them — conservative (no false claim shown), and `en.json` is a concurrently edited shared file, so I did not widen the UI. Worth filing.
- `request_plan_catch_up` measures its wall against the live revision's `effective_from`, which B3 pins at or after `authority_from` — i.e. only ever equal or tighter, never looser. Header, function comment and ARCHITECTURE now say this rather than "the plan's own authority".

**Unverified:** hosted evidence (none claimed). The Playwright walk `plans-walk.spec.ts` was not re-run this round — my web change only adds a refusal for `effective_from < authority_from`, and the lane mock's live revision starts exactly on `authority_from` (`2026-07-01`), so the revise form seeds a clean draft; that is reasoning, not a measurement.
