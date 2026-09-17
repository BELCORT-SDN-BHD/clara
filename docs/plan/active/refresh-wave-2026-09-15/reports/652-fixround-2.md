# #652 — review round 2, fix report

**Branch** `impl/652-accrual-adjustments` · **worktree** `C:\Users\zhant\Desktop\clara-wt\652` · rig PG `127.0.0.1:55510` / `clara_652` · Playwright `3320/3321/3322`. Review head was `cebfcca5`; this round adds ONE commit.

```
f917c4ae fix(db,runtime,web): #652 review round 2 — a schedule that reaches no accrual date inside its own window is refused, not silently configured
```

The round carried a single finding. It is applied in full, red first.

## Finding → what I did → evidence

| # | Finding | What I did | Evidence (red → green) |
|---|---|---|---|
| **NB1** (recheck-1, severity `blocker`; the finding's own text says NOTE and hands the orchestrator a choice between refusing at the door and naming a residual) | A stated term SHORTER than one period of its own schedule is accepted silently and can never post. Round 1's window wall made that the shape a preparer lands on by default, because the "leave the authority open-ended" escape that used to rescue a short term is gone | **Applied — BOTH halves: the refusal AND the residual.** (a) 0207 gains THE SEVENTH MEASUREMENT: `clara._assert_accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month, p_effective_from, p_effective_to)`, payload-half in BOTH doors immediately after `_assert_accrual_term_window`, asking the plan lane's own `clara._plan_due_events` (0193:845 — **called, never recut**) whether one `primary` due date falls inside `[effective_from, effective_to]`, and raising CLR10 `accrual_schedule_yields_no_occurrence` with `field` = `day_rule` (or `day_of_month` under that rule) and `constraint` = `yields_occurrence`. A schedule shape 0193's OWN validator owns — unknown frequency, unknown day rule, a day outside 1..28, a window ending before it starts — falls THROUGH to that validator rather than being re-spelled in this lane's vocabulary at the wrong control. Mirrored in `packages/runtime/lib/accrual-basis.ts` (`accrualScheduleYields` + the refusal in `localAccrualRefusal`) and in `apps/web/lib/accruals/api.ts` + `validateAccrualDraft`, so a model and a preparer are each told before the round trip. (b) the residual the finding's option (b) asked for is NAMED rather than quietly closed: the 0207 header's SEVENTH MEASUREMENT states that the PLAN lane's own door still accepts a plan that reaches nothing, that those six bodies are #640/#653's and are pinned here, and `652-final.md` carries it as follow-up 6 | **RED first**, exactly the reviewer's shape: `p652.schedule.yields` → *"a half-month term whose month-end rule falls outside it: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)"*. **GREEN after**: the cell passes and the battery is **21 / 21 / 0 fail / 0 skipped**. The web halves were proven red by mutation (`if (false && scheduleStands …)`): the form cell → *expected 0 sent, actual 1*; the draft cell → an empty issue list. The runtime half likewise (`if (false && !accrualScheduleYields(…))`) → *"Cannot read properties of null (reading 'reason')"*. Guards restored → all green |

### The wall is a wall, not a ban — measured

- `p652.schedule.yields` leg 4: the SAME half-month term (`2026-07-01..2026-07-15`) with `day_rule='day_of_month'`, `day_of_month=15` is **configured**, and `clara.request_plan_catch_up` over that window materialises a **`primary` occurrence on 2026-07-15**. That is why the refusal names the DAY RULE and not the term: the term is the fact a human stated; the schedule is the thing to change.
- The three refused legs write **nothing at all** — `footprint()` is zero across plans / revisions / occurrences / accruals — and `clara.op_receipts` holds **no row** for the key, because the wall is payload-half and is asked before `_reserve_op`.
- **TS ↔ SQL parity, measured**: `clara._accrual_schedule_yields` and the TS mirror compared over **180 schedule/window shapes** (3 frequencies × 5 day rules × 12 windows) → **0 mismatches**. The new cell `652.schedule: the mirrored due-date walk answers the plan lane's own question` caught one of MY OWN wrong expectations while it was being written (a quarterly schedule's first period is the month of `effective_from`, so a Feb–Mar window does reach the February month end); the expectation was corrected against the database's arithmetic, not the other way round.

## Counts (all local; hosted evidence still pending)

| Command | Result |
|---|---|
| `node --test --test-concurrency=1 $GATES tests/accrual-adjustments.test.mjs` (29 gates) | **21 / 21 pass / 0 fail / 0 skipped** (was 20/20) |
| `node --test --test-concurrency=1 tests/operation-census.test.mjs` (alone) | **10 / 10 pass** |
| `node --test --test-concurrency=1 tests/rig-isolation.test.mjs` (alone, no reset flags) | **21 / 19 pass / 1 fail (T10b, rig state — unchanged) / 1 skip (T19)** |
| `node --test tests/accrual-basis-unit.test.mjs` | **20 / 20 pass** (was 18/18) |
| `node tests/accrual-e2e.mjs` (real Postgres/Workflow World, `RELAY_TEST_MODE=1`) | **PASS 1 · PASS 2 · PASS 3+4, exit 0** |
| `node --import ./test/bootstrap.mjs --import tsx --test components/accruals/accrual-form.test.tsx lib/work/accrual-draft.test.ts` | **35 / 35 pass** (13 + 22; was 12 + 21) |
| `node scripts/run-tests.mjs` (whole `apps/web`) | **3759 tests / 3757 pass / 0 fail / 2 skipped, exit 0**, zero `not ok` lines (was 3757/3755) |
| `pnpm --filter @clara/web e2e accrual-walk` on 3320/3321/3322 | **14 passed (1.4 m), exit 0 — GREEN ON THE FIRST RUN**, nothing else on the host; my three ports were free before the run and no other lane's listener was touched |
| `pnpm typecheck` · `pnpm lint` (worktree root) | **exit 0** · **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen files, 51 `"use workflow"` modules** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK, exit 0** (`work_accepted` still emittable from v18/v19 only) |
| migration rollback + re-apply from a TRUE prestate | dropped the relation + all **17** `%accrual%` functions + the `schema_migrations` row → `PRESTATE: accrual functions 0 \| table null \| migration rows 0` → `pnpm db:migrate` → **1 new migration applied · 194 total**, prestate notice **"clean"**, tail notice **"OK"**. The notice now names the yield rule, and §E exercises the wall live: the half-month refusal, the `day_of_month=15` pass, a three-month window, and a `weekly` frequency falling THROUGH to 0193's own validator |

## What changed on the branch

`packages/db/migrations/0207_accrual_adjustments.sql` (+120): THE SEVENTH MEASUREMENT in the header (with the measured before-state and the named plan-lane residual), one new row in the refusal vocabulary, `clara._accrual_schedule_yields` + `clara._assert_accrual_schedule_yields` (both `revoke … from public`, so §C's "nothing PUBLIC on any `%accrual%` function" still passes), one `perform` in each of the two doors, four live §E exercises and the tail notice. `packages/db/tests/accrual-adjustments{.test,-fixtures}.mjs`: the new cell and its reason token. `packages/runtime/lib/accrual-basis.ts` (+64) and `tests/accrual-basis-unit.test.mjs` (+52). `apps/web`: `lib/accruals/api.ts` (the mirrored walk), `lib/work/accrual-draft.ts` (+ its cell), `components/accruals/accrual-form.tsx` (one issue-code row) + its cell, `messages/en.json` (ONE key, in this lane's own namespace). Docs: `CONTEXT.md` (**Accrual adjustment** gains the yield sentence), `packages/db/README.md` (the door-level rule and the plan-lane residual beside the two structural ones). `652-final.md` updated in place: commit list, AC1 row, four tests-added rows, five counts, a new assumption 8, a new follow-up 6, and the successor stanza's token list.

**Standards**: `git diff cebfcca5..HEAD --name-only` → 13 files, none of `workRoutes.ts` / `purpose-label.ts` / `accounting-work-list.tsx` / `work-list-filters.tsx` / `client-workspace-overview.tsx` / `lib/firm/capabilities.ts`; `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched; zero `create or replace` and zero foreign `alter table` in 0207 (its only `alter table` lines are the two RLS statements on its own relation); the six pinned 0193 bodies still hash byte-identically, which the tail proves on every apply.

## What I deliberately left

- **RATIFICATION REQUESTED (orchestrator).** Like round 1's A1, this wall is a **narrowing of the product surface the brief did not spell out**: a term too short for its own day rule is now a refusal. I took it because the alternative is an accrual that is recorded, shows a live plan and a "No due dates reached yet" sentence, and can never post — the same class of defect as A2's recorded-but-never-performed method — and because it blocks no reachable use case (measured: the same term with `day_of_month=15` configures and materialises). If the owner would rather let a preparer configure a schedule that reaches nothing, the honest alternative is an **advisory** on the form (the `_plan_overlap_warning` precedent) rather than silence, and the door refusal comes back out.
- **The PLAN lane's own door still accepts a plan that reaches nothing.** `clara.create_accounting_plan` is one of the six bodies 0207 pins and #653 owns; fixing it there would be a recut the brief and DECISIONS §1.3 forbid. Named in the 0207 header, in `packages/db/README.md`, and as follow-up 6 in `652-final.md`.
- **T10b on `rig-isolation.test.mjs`** is still red on this rig and is still WDK-world state, not 0207 — the reviewer's own from-scratch chain measured the same file green (cluster `rig652r`, 55610). Unchanged this round.
- **Hosted evidence** (AC7 / C88.13) is still pending; nothing hosted was read or produced.
- **The unreachable `nonzero_total` arm**, **#640 SHOULD-1** and **the three withdrawn method rules** are unchanged from round 1 — other lanes' bodies or successor residuals, all already named in `652-final.md`.
