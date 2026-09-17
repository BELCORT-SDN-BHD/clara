# #652 — evidenced accrual and reversal adjustments · final report

**Branch** `impl/652-accrual-adjustments` · **worktree** `C:\Users\zhant\Desktop\clara-wt\652` · rig PG `127.0.0.1:55510` / `clara_652` (frontier **0207**) · Playwright `3320/3321/3322`. All evidence below is **local**; **hosted evidence pending**.

**No prior attempt existed to salvage**: `git status` clean and `git log origin/main..HEAD` empty at start.

**Review rounds 1 and 2 applied** (`reports/652-fixround-1.md`, `reports/652-fixround-2.md`): three
further commits below the fold — `abdb8716` (F1, F2, A6), `cebfcca5` (A1, A2, A3, A4, A5) and
`f917c4ae` (NB1). Every count in this report is the POST-FIX one.

```
f917c4ae fix(db,runtime,web): #652 review round 2 — a schedule that reaches no accrual date inside its own window is refused, not silently configured
cebfcca5 fix(db,runtime,web): #652 review round 1 — the schedule runs inside the term it names, one honoured method rule, a typed op-key conflict
abdb8716 fix(web): #652 review round 1 — drop the two unreachable accrual nav leaves, cover the empty list, keep the Plans ⌘K word
b579e25a test(web): #652 — register the two accrual leaves in the nav reverse gate
c5e1d69e fix(web): #652 — the accrual walk, green 14/14 on the 3320/3321/3322 triple
a87c11e0 feat(web,docs): #652 — the accrual e2e mock and browser walk, plus the READMEs and CONTEXT.md
1dc9f255 feat(web): #652 — the accrual route, its two reads, the configuration form and its cells
8d87bcdc fix(runtime): #652 — the accrual World e2e, green end to end on the rig
56b0b98b feat(runtime): #652 — the non-frozen accrual basis module, its unit cells and the real-World e2e
57833d06 fix(db): #652 drop two unused imports from the accrual battery
31d09ca6 feat(db): #652 0207 — clara.accrual_adjustments, its four doors and the term law
a7b14c9f test(db): #652 red — the accrual battery and its fixtures, before any door exists
```

## Per acceptance criterion / historical row

| Row | State | Evidence |
|---|---|---|
| **AC1** particulars + term law + zero refused | **done** | `0207 §B` `_assert_accrual_particulars` + `_assert_accrual_term_window`; cells `p652.basis.required`, `p652.basis.silent_term`, `p652.basis.zero`, `p652.accounts.roles`, `p652.term.window`, `p652.method.honoured` (all pass). Round 1 added the TERM/WINDOW law (the authority window is bracketed by the stated term, `effective_to` NOT NULL) and narrowed `method` to the one rule the schedule performs; round 2 added the YIELD law (`clara._assert_accrual_schedule_yields`, cell `p652.schedule.yields`): a term too short for its own day rule is refused AT THE DAY RULE instead of being configured into a plan that can never post |
| **AC2** originating record + reversal relationship + config≠occurrence | **done** (reversal half verify-only, as briefed) | `clara.accrual_adjustments` (0207 §A, `unique (plan_id, revision)`, tenant-carrying `fk_accrual_adjustments_plan_revision`); `p652.config.atomic`, `p652.config.vs.occurrence`, `p652.reversal.binds` |
| **AC3** one commit; accepted configuration ≠ posted occurrence | **done** as two commits (Q3) | `p652.config.atomic` (a fault after the accrual insert rolls back all five relations); `p652.config.vs.occurrence`; `accrual-e2e.mjs` PASS 1 + PASS 2 |
| **AC4** park / catch-up / future instruction | **partial, residual named** | built: `p652.authority.future`, `p652.catchup.locked`, e2e PASS 4. **Not built:** the PARK arm (claraWork successor contract, below). "Accepted *treatment*" stays out — `request_plan_catch_up` takes a window only (0193:1878) |
| **AC5** boundary with #643 | **done** (the build half) | `AccrualShapeBoundary` + `AccrualConfigurationBoundary` (`components/accruals/accrual-statement.tsx`), asserted persistent on list/detail/form by `accrual-form.test.tsx` cell 2 and by four walk cells |
| **AC6** the real journey, all states | **done** | `accrual-walk.spec.ts` 14/14 + `accrual-form.test.tsx` 12/12 + `accruals-list.test.tsx` 3/3 — the last file is round 1's: the EMPTY list state (and the negative that an unresolved read never renders it) had no cell before |
| **AC7** production-facing reads/commands, real World | **done locally**; **hosted evidence pending** | db battery through `humanQuery`/`clara_runtime` personas only; `packages/runtime/tests/accrual-e2e.mjs` exit 0 on a real Postgres/Workflow World |
| **C08.1** locate route, inspect/select with authority + period feedback | **done** | `/clients/[clientId]/accruals` list + detail; walk cells 1–3 |
| **C08.2** zero-value not meaningful; name the owner | **done, with a FINDING** | `p652.basis.zero`. Owner is `clara._assert_journal_basis` (0178:693). **`nonzero_total` (0178:785-787) is UNREACHABLE**: `_journal_cents` (0178:672) refuses negatives and the per-line `exactly_one_side` arm (0178:770-774) refuses an all-zero line, so ≥2 lines each carrying one positive side can never sum to zero. The cell asserts the LIVE token (`exactly_one_side`, `field: lines[1]`) and names the dead arm rather than editing the expectation. Follow-up filed below |
| **C55.13** re-read evidence, ask bounded, never fabricate a term | **partial, residual named** | the term law ships (`silent_term`, one-member `term_source` CHECK, `p652.basis.silent_term`, `p652.term.document`). The *bounded question* half is the claraWork park contract |
| **C83.7** | **discharged via C55.13** | duplicate pointer; no separate work |
| **C88.13** synthetic then real-environment | **partial, hosted leg owed** | `accrual-e2e.mjs` proves trigger / one effect / retry / cancellation on a real World locally; hosted leg filed as a follow-up |

## Tests added

| File | What it proves |
|---|---|
| `packages/db/tests/accrual-adjustments.test.mjs` (+ `-fixtures.mjs`, `-preintegration-gate.mjs`) | 21 cells: required particulars, silent term, stated zero, one-commit atomicity (with SQL fault injection), configuration-vs-occurrence, future authority, the orphan wall and the reversal binding, locked-period catch-up, role floors + no cross-firm oracle, account roles, the whole lineage join + the composite FK by name, the grant matrix, entrance independence, the nested reservation, the two plan paths' equivalence, the OBO door on a real `clara_runtime` connection, the document-anchored term, and (round 1) the term/window law, the ledger text every occurrence posts, and the single honoured selection rule, and (round 2) the yield law — a half-month, a one-day and a wrong-day schedule each refused by name with nothing written, beside the same term with a rule that reaches inside it, configured and materialising 2026-07-15 |
| `packages/runtime/tests/accrual-basis-unit.test.mjs` | 20 cells over `lib/accrual-basis.ts`: `.strict()`, the one-literal `term_source`, the closed method set, the local refusals' tokens, the emitted shape, and (round 2) the mirrored yield refusal plus the due-date walk itself, cross-checked against `clara._accrual_schedule_yields` over 180 schedule/window shapes with 0 mismatches |
| `packages/runtime/tests/accrual-e2e.mjs` | real Postgres/Workflow World: configure with no engine and nothing posted; `exit_after_commit` crash replays onto one entry/receipt/occurrence/accrual; the reversal waits, names the entry and posts; cancel + human catch-up retry under one occurrence identity |
| `apps/web/lib/work/accrual-draft.test.ts` | 22 cells: scope key, op-key lifecycle, untrusted parse, the field mapper over both prefixes, the local validation, the wire shape, and (round 2) the yield refusal at the day rule — including that it never piles onto a day number already refused |
| `apps/web/components/accruals/accrual-form.test.tsx` | 13 cells: viewer DENIED face, both boundaries persistent, focus on first invalid, server field → focused control, refusal verbatim, CLR04, lost-response same op key exactly once, draft across remount, derived lines disabled, accepted → own address, overlap advisory, and (round 1) a schedule outside its own stated term refused BEFORE the door at the control, and (round 2) a term too short for its own schedule refused BEFORE the door at the day rule |
| `apps/web/components/accruals/accruals-list.test.tsx` (round 1) | 3 cells: a successful EMPTY read has its own sentence and no table shell, an UNRESOLVED read never renders it, one row carries term/legs/state |
| `apps/web/lib/navigation/tree.test.ts` (round 1, one cell added) | every `CLIENT_LEAVES` row is one `resolveActive` can actually produce — the wall that caught #652's two dead leaves |
| `apps/web/e2e/accrual-walk.spec.ts` (+ `accrual-mock.mjs`) | 14 browser cells **including the CREATE cell `plans-walk.spec.ts` lacks** |

### Commands and counts (local)

| Command | Result |
|---|---|
| `node --test --test-concurrency=1 $GATES tests/accrual-adjustments.test.mjs` (29 `--import` gates from `packages/db/package.json`) | **21 tests / 21 pass / 0 fail / 0 skip** |
| `node --test --test-concurrency=1 tests/operation-census.test.mjs` (alone) | **10 / 10 pass** |
| `node --test --test-concurrency=1 tests/rig-isolation.test.mjs` (alone, no reset flags) | **21 / 19 pass / 1 fail (T10b) / 1 skip (T19)** — see "unverified / rig state". *(An earlier draft of this table reported 31/29/1/1 against this command; that total is the two files run in ONE invocation, corrected in review round 1, F3.)* |
| `node --test tests/accrual-basis-unit.test.mjs` | **20 / 20 pass** |
| `node tests/accrual-e2e.mjs` (PG env + `WORKFLOW_POSTGRES_URL` + `RELAY_TEST_MODE=1`) | **PASS 1 · PASS 2 · PASS 3 · PASS 4, exit 0** |
| `node scripts/run-tests.mjs` (whole `apps/web`) | **3759 tests / 3757 pass / 0 fail / 2 skipped, exit 0** (round 1 added six cells, round 2 two more; the pre-fix run was 3751/3749) |
| `pnpm --filter @clara/web e2e accrual-walk` on 3320/3321/3322 | **14 passed, exit 0** (round 2 re-run: 14 passed in 1.4 m, green on the first run) |
| `node --import ./test/bootstrap.mjs --import tsx --test components/accruals/*.test.tsx lib/work/accrual-draft.test.ts` | **38 / 38 pass** (13 + 3 + 22) |
| `pnpm db:migrate` after rolling 0207 back to a true prestate (three times in round 1, once more in round 2) | **1 new migration applied · 194 total**, prestate notice "clean", tail notice "OK" |
| `pnpm typecheck` (worktree root) | **exit 0** |
| `pnpm lint` (worktree root) | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen files, 51 `"use workflow"` modules** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK, exit 0** |

Known reds **not** touched: #707 and #693 never appeared (neither is in the `apps/web` suite). The `thread-live-clarify.test.tsx` flake did **not** fire in either whole-suite run; in isolation **2/2 pass**. A *different* load flake did fire once — `lib/clara/use-clara-thread-stop.test.ts` cell 630 — and passes in isolation (**25/25**) and did not recur.

## Docs updated

`packages/db/README.md` (§Migration and deployment behavior: 0207's own consumer-first note and the bare-FK-plus-trigger reason; §Operation-contract census: the four new public names and their cohort) · `packages/db/tests/README.md` (§Running: the focused-vs-sweep gate for this battery) · `packages/runtime/README.md` (§Standalone e2es) · `apps/web/README.md` (route table + why `/accruals` is a top-level segment) · `CONTEXT.md` (**Accrual adjustment**, **Accrual reversal**, **Service period**, **Calculation method**, house "term / _Avoid_" shape — round 1 added the window-inside-term sentence and narrowed the method entry to the rule that is performed; round 2 added the yield sentence to **Accrual adjustment**, and `packages/db/README.md` gained the door-level yield rule and the named plan-lane residual beside it).

**Blueprint drift:** none found. `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched.

## Successor contract — `chatTurn_vN`'s `start_accrual_work`

Module: **`packages/runtime/lib/accrual-basis.ts`** (new, non-frozen; its footer carries this stanza verbatim). **No frozen file may import it before the cut.**

- **Tool name** `start_accrual_work` (`START_ACCRUAL_WORK_TOOL`), registered beside `start_journal_work` and `start_periodic_adjustment_work`, both unchanged.
- **Input schema** `startAccrualWorkInputSchema` — `z.object({...}).strict()`: `purpose`, `expense_account_code`, `liability_account_code`, `amount_cents` (int, positive), `service_period_start`, `service_period_end` (ISO), `term_source: z.literal("human_stated")`, `method: z.enum(ACCRUAL_METHODS)` (**one member, `stated_amount`**), `instruction`, `authority_work_id` (uuid), `effective_from`, **`effective_to` (REQUIRED, and bracketed by the stated term)**, `frequency` (default `monthly`), `day_rule` (default `last_day_of_month`), `day_of_month?` (1–28), `memo?`, `source_document_id?`, `document_service_period_id?`.
- **Execute**: v18 client pin → `const local = localAccrualRefusal(input); if (local) return local;` → `stableOpKey(ctx.taskId, START_ACCRUAL_WORK_TOOL, input)` → ONE query:
  `clara.create_accrual_adjustment_for($1 ctx.clientId::uuid, $2 ctx.createdBy::uuid, $3 input.purpose::text, $4 {kind:'accounting_work', id: input.authority_work_id}::jsonb, $5 accrualFromInput(input)::jsonb, $6 input.frequency::text, $7 input.day_rule::text, $8 input.day_of_month ?? null::int, $9 'Asia/Kuala_Lumpur'::text, $10 input.effective_from::date, $11 input.effective_to::date, $12 opKey::text)`.
- **Refusal → message**: hand the database's typed `(code, detail.reason)` back unchanged. Tokens: CLR10 `invalid_accrual` / `silent_term` / `accrual_zero_amount` / `accrual_term_window_mismatch` / `accrual_schedule_yields_no_occurrence` / `op_key_conflict` / `accrual_method_unsupported` / `accrual_account_relationship` / `accrual_term_document_mismatch` / `invalid_purpose` / `invalid_op_key` / `invalid_source_ref` / `invalid_schedule` / `authority_ref_invalid` / `authority_ref_unresolved` / `client_inactive`; CLR11 `client_not_found`; CLR04 `authority_lost` / `insufficient_role`; CLR13 `operation_in_flight`. None is a new error CLASS — `claraWork.v1.errors.ts` needs no change.
- **Part kind** `work_accepted`, naming `answer.occurrence.work_id`; when the authority starts in the future `occurrence` is **null** — say "configured, nothing due yet" rather than inventing a Work id.
- **`WORK_ACCEPTED_PURPOSES` NEEDS NO WIDENING** (`chatTurn.v19.parts.ts:91`, pinned by `p6-1-parts-parity.test.mjs:548`): an accrual occurrence is admitted by `clara._plan_admit_occurrence` through `clara.admit_journal_work` with `purpose='journal_entry'` and `adjustment_basis` NULL (0193:1367-1369). Measured on the rig by `accrual-e2e.mjs` PASS 1.
- **No new claraWork bundle.** The particulars live in `clara.accrual_adjustments`, which the run never reads and never echoes.

### Successor contract — the claraWork park (NOT built)

Tool `answer_accrual_term` on the claraWork successor, for the one entrance the form cannot cover: a Work admitted **from a document or an instruction whose term is genuinely absent**. It opens ONE `clara.open_work_question` (0180:578) with fields `service_period_start` / `service_period_end`, answers through `answer_work_question` (0180:761), and **may not** accept a period the model derived — the answer's actor must be the human (0140's law). It is *not* a way to complete an accrual's basis after admission: an accrual configured through either door already carries its term, and the form refuses without one.

## Assumptions

1. **Both plan-writing paths ship** — the human door nests `clara.create_accounting_plan` on `op_key||':plan'` (the brief's preferred mechanism, proven by `p652.plan.nested_op`), and the `_for` door uses the inline actor-explicit `_accrual_plan_core`. `p652.plan.equivalence` `deepEqual`s the two plans field for field (basis digest included) so they cannot drift.
2. **`document_service_period_id` is a BARE FK plus a congruence TRIGGER**, not a composite FK. `clara.document_service_periods` carries no `(id, firm_id)` unique and the brief forbids a foreign `alter table`; the trigger proves firm, document, liveness, `basis_kind` and both dates — 0140's own `t_dsp_region_congruent` division. The tail asserts that relation's constraint count is unchanged (14, measured).
3. **`method` is `{"rule": <enum>}` with exactly one key**, spelled in the CHECK as `method - 'rule' = '{}'` because a CHECK may not carry a subquery. **One admitted rule** — `stated_amount`, "the amount stated here, accrued in every period of the window", which is what the schedule performs. Three further rules were drafted and withdrawn in review round 1 (A2): each would have posted the same cents, because no lane reads `clara.accrual_adjustments` at run time. They are a successor residual.
4. **The `_for` door reserves under `fn='create_accrual_adjustment'`**, the same key space as the human door, so a chat-initiated configuration and a human replay of it converge on one operation identity.
5. **The list window filters on `effective_from`.** The brief gave `(p_client, p_from, p_to)` without naming the column.
6. ~~**`accruals` moved off the `plans` ⌘K row's keyword list**~~ — REVERSED in review round 1 (A6): the word stays on the shipped `plans` row and is ADDED to the new `accruals` row. Keywords are not a unique index in that registry, and a new row registers rather than narrowing another (`lib/command/routes.test.ts` cell).
7. **The authority window is bracketed by the stated term** (round 1, A1): `effective_to` is required and the window runs inside `[service_period_start, service_period_end]`, so every occurrence posts inside the term its line names. An open-ended accrual is now a refusal, not a default — the form's "Leave empty for an open-ended authority" copy is gone.
8. **A schedule that reaches no accrual date inside its own window is refused** (round 2, NB1): `clara._assert_accrual_schedule_yields` asks `clara._plan_due_events` (called, never recut) for one primary due date in `[effective_from, effective_to]` and refuses CLR10 `accrual_schedule_yields_no_occurrence` naming `day_rule` / `day_of_month` when there is none. It blocks no use case that was reachable before — the same half-month term with `day_of_month = 15` configures and materialises 2026-07-15 (measured) — but it IS a narrowing the brief did not spell out, so it is flagged for ratification beside assumption 7. The plan lane's own door still accepts a plan that reaches nothing; that is #653's, named as follow-up 6 rather than fixed behind their back.

## Follow-ups worth filing

1. **`clara._assert_journal_basis`'s `nonzero_total` arm is unreachable (0178:785-787).** `clara._journal_cents` refuses negatives and the per-line `exactly_one_side` arm refuses a both-sides-zero line, so two or more lines each carrying exactly one positive side can never sum to zero — the arm cannot fire from any caller. Either retire it, or give it a reachable caller (a basis assembled by a writer that bypasses the per-line rule). Until then "a zero-value proposal is refused by `nonzero_total`" is a sentence no test can make true; `p652.basis.zero` asserts the live token instead.
2. **Hosted real-environment evidence for C88.13 / AC7.** The local World e2e is the representative synthetic; the row's own wording requires separately authorised real-environment evidence for trigger, one effect, retry and cancellation. Nothing hosted is claimed here.
3. **`packages/db/tests/rig-isolation.test.mjs` T10b vs the WDK world bootstrap.** T10b reds on any rig database that also carries the WDK world, because `graphile_worker`'s functions are PUBLIC-executable and every `clara_*` role therefore "reaches outside pg_catalog + clara". CI keeps the two apart by database; a local rig cannot, because the runtime e2es need the world on the database the batteries use. Either scope T10b's probe to exclude `graphile_worker`, or say in `RIG.md` that T10b is expected red after `pnpm --filter @clara/runtime exec bootstrap`.
4. **The three withdrawn selection rules need the lane that honours them.** `stated_period_amount`, `source_document_amount` and `prior_period_amount` are a successor residual (round 1, A2): a per-period amount selection needs a run-time reader of `clara.accrual_adjustments` and a per-occurrence basis, which `clara._plan_occurrence_basis` (#653-owned) does not do today. Widening the `method` CHECK is the migration that must arrive WITH that reader, never before it.
5. **#640 SHOULD-1 is inherited, not fixed.** A frequency change can double-cover a period across alignments (`reports/640-review-closure.md` §B). An accrual rides the same arithmetic. Noted, not touched.
6. **A plan whose schedule reaches no due date is still accepted by the PLAN lane's own door.** #652's own entrance now refuses it (`clara._assert_accrual_schedule_yields`, round 2, NB1), but `clara.create_accounting_plan` will still write a live `reversing_journal` or `recurring_journal` plan whose window holds no due date at all, and the same silence follows: a live plan, a list that says "No due dates reached yet", and no due date ever. That body is #640/#653's and 0207 pins it byte-identically, so the fix belongs with the lane that owns it — either the same yield assertion inside `_assert_plan_schedule`, or a documented "a plan may legitimately reach nothing" ruling. Filed for #653, not taken here.
7. **Three scheduled-adjustment carriers still only warn.** `_plan_overlap_warning` (0193:1155) is advisory and this lane renders it persistently rather than adding a refusal; the legacy 0045 belt and 0140 §A2's extension can still overlap an accrual. Unchanged by design.

## Unverified / rig state

- **`packages/db/tests/rig-isolation.test.mjs` T10b fails on this rig.** It reports `clara_agent_ro` / `clara_wake_*` reaching seven `graphile_worker.*` functions. **This is rig state, not 0207**, and the proof is direct: the same suite on the same database was green *before* I ran `pnpm --filter @clara/runtime exec bootstrap` (required by `accrual-e2e.mjs`) and reds after — and the reviewer reproduced the same file at **21 / 20 pass / 0 fail / 1 skip** on a from-scratch 0207 chain with no WDK world (cluster `rig652r`, 55610). No migration creates the `graphile_worker` schema (`grep -rn "create schema[^;]*graphile" packages/db/migrations/` → nothing) and `0207_accrual_adjustments.sql` does not mention it (`grep -c` → 0). Filed as follow-up 3.
- **Hosted evidence: pending.** No hosted artefact was read or produced.
- **One Playwright contention flake, recorded rather than re-run away.** On the second walk run (with two db suites sharing the host) the 320 px cell timed out at 30 s; it passed on the first and third runs, and the third run — nothing else running — was **14 passed, exit 0**.
- **The `packages/db` estate suite, the `packages/runtime` unit suite and the whole browser suite were not run** — the WORK-ORDER assigns those to the orchestrator/CI.
- **`CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set**, so `rig-isolation`'s destructive cell T19 skipped (counted).
