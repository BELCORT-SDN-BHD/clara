# #653 — fix round 1 (review verdicts of `cc2beaa5`)

**Branch** `impl/653-prepayment-amortisation` · **worktree** `C:\Users\zhant\Desktop\clara-wt\653` ·
rig `127.0.0.1:55511/clara_653` (PG 17.11). All evidence **LOCAL**; hosted evidence still pending.

Four new commits on top of `cc2beaa5`:

```
6252a08d docs: #653 review round 1 — CONTEXT's Prepayment schedule term …
1cebbe56 fix(web): #653 review round 1 — the instruction a schedule cites is a field …
8d151d4a fix(ci): #653 review note F1 — the per-line continuation …
5bebc528 fix(db): #653 review round 1 — the prepaid leg is judged too …
```

Every blocker and should below was **red-celled first**, seen to fail for the reviewer's own reason,
then fixed and seen to pass. The migration changed, so `clara_653` was **dropped and re-created and
the whole chain re-applied from a true prestate** (see "The rig was rebuilt").

---

## Finding → what I did → evidence

### 653-B1 · blocker — the create form could never succeed: a journal-entry id posing as an authority

**What I did — applied in full.** `prepayment-form.tsx` now renders the plans lane's own authority
control: a required Select over `listAuthorityCandidates` (reused from `lib/plans/api.ts`, not
re-cut — a second reader would be a second answer to "what Work does this client have").
`authorityWorkId` is a fifth draft field validated by the mirror, and the `?? draft.sourceEntryId`
fallback is **deleted**: a blocked submit beats a fabricated authority. `prepaymentRefusalKey` gains
`authority_ref_unresolved → refusalAuthorityUnresolved`; `en.json` gains `fieldAuthority`,
`authorityNote`, `authorityChoose`, `authorityEmpty`, `issueAuthorityRequired`,
`refusalAuthorityUnresolved`. The walk now proves it rather than ignoring it: `prepayments-mock.mjs`
refuses `create_prepayment_schedule` with `authority_ref_unresolved` unless the payload cites
`PREPAY.workId`, and serves the picker's own `/rest/v1/accounting_work` read scoped to its client.

**Evidence.** RED first: `prepayments.keyboard` (the control set), the new `prepayments.authority`
cell and three mirror cells all failed — `error: 'no control with id prepayment-authority'`. GREEN
after: the four `apps/web` prepayments unit files **33/33** (was 30). The new db guard
`p653.schedule.authority_ref_unresolved` calls the door with *exactly* the object the old form built
and gets CLR10 `authority_ref_unresolved` with no plan and no schedule row; the same call with a real
instruction Work is accepted. `select count(*) from clara.accounting_work w join
clara.journal_entries j on j.id=w.id` → **0**, re-measured on the rebuilt rig. `prepayments.authority`
reads the **request body**, not the screen: no door call at all without an instruction, focus on the
missing control, and `p_authority_ref.id === WORK ≠ p_source_entry` once one is chosen.

### 653-B2 · blocker — any single-debited-asset entry was amortisable, and arm B advertised them

**What I did — applied in full, on both sides.** `create_prepayment_schedule` runs
`clara._adj_line_eligibility_breach(p_client, [{account_code: v_prepaid, credit_cents: 1}])`
immediately after reading the prepaid leg off the evaluator's output, and refuses **0140's own**
`prepayment_source_unfit` with `axis: prepaid_account_ineligible`, the account code, the source entry
and the helper's own breach object. §E arm B carries the identical predicate in its `where`, so the
band cannot advertise what the door refuses. No new vocabulary and no second rule — it is the same
0042:643 helper the expense half already used.

**Evidence.** RED first: `p653.schedule.prepaid_leg_ineligible` → `a schedule whose prepaid leg is a
receivable control account: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)`;
`p653.attention.arm_b_ineligible` → `expected 0, actual 1`. GREEN after: both pass —
`prepayment-schedule` **18/18**, `prepayment-occurrences` **10/10**. The scene posts to the estate's
**real** receivable control `374-C56` (`account_class='receivable'`, measured on the rig), with a
counterparty born at approve because a control-class line requires one (CLR23, measured). That
choice is deliberate and recorded in `packages/db/tests/README.md`: a hand-made "13000001 Trade
receivables" carries a NULL `account_class` and is therefore **not** a control account by 0042's own
rule, so a fixture that minted its own code would measure a different estate.

### 653-S1 · should — `limit 50` inside an unordered select, and no truncation flag

**What I did — applied in full.** Both arms became `with cand_x as (…) select jsonb_agg(… order by
sk desc …), (select count(*) from cand_x) > 50 … from (select … order by sk desc limit 50)`: the page
is ordered before it is cut. The envelope gains `refusing_truncated`, `unscheduled_truncated` and
`cap`; `PrepaymentAttention` carries them and the band renders `attentionTruncated`.

**Evidence.** RED first: `p653.attention.window` builds 51 arm-B recognitions on one client with
distinct posting dates and failed at `the page is the newest fifty, not an arbitrary fifty —
expected true, actual false`. GREEN after: 50 rows, newest first, the oldest absent,
`unscheduled_truncated=true`, `refusing_truncated=false`. Web: two new render cells — a truncated
read shows the notice, an untruncated one shows nothing, so the notice means what it says.

### 653-S2 · should — a raced duplicate surfaced a bare 23505 naming an index

**What I did — applied in full.** The INSERT is wrapped in `begin … exception when unique_violation
then`, which re-reads the winning row and re-raises the **same** CLR13 `prepayment_schedule_exists`
payload the typed pre-check raises (plus `raced: true`). The unique index is still the authority; the
surface already had a case for that token, so the person is now told to open the schedule that exists.

**Evidence.** RED first: `p653.schedule.duplicate_race` — two `clara_authenticated` sessions as bob,
different op keys, same recognition, B queued behind A's uncommitted row with the barrier witnessed
through `pg_stat_activity.wait_event_type='Lock'` — failed at `the loser is answered by the lane's
own vocabulary, not by an index name: duplicate key value violates unique constraint
"uq_prepayment_schedules_source"`. GREEN after: `code=CLR13`, `detail.reason=prepayment_schedule_exists`,
`detail.source_entry` and `detail.schedule_id` both present, exactly one schedule survives.

### 653-S3 · should — a cell title claimed a negative it never measured

**What I did — applied in full, and found the same drift one cell earlier.**
`p653.attention.arm_b`'s last leg keeps its real name ("an entry that has NOT POSTED is not a
recognised prepayment") and says in source why the two were split; the cell the old title promised is
the new `p653.attention.arm_b_ineligible`, which doubles as 653-B2's regression guard.
`p653.schedule.target_ineligible`'s title had likewise promised "a control/bank account" and measured
none — it now has that leg, and records what the leg measures: the axis that answers is
`not_expense_class`, because every control class this estate carries is an asset or a liability and
the expense-class wall fires first, so `_adj_line_eligibility_breach`'s `control_account` arm is
**structurally unreachable from the expense side**. It is reachable from the prepaid side, which is
what the next cell measures.

### F1 · note — the CI step lost its per-line continuation

**Applied.** Reformatted to the #640 sibling block's `\`-per-line style. My first attempt wrote a
literal backslash-`n`; I caught it by re-reading the file and repaired it in `8d151d4a`, then
syntax-checked the exact five lines (`awk` them out, substitute the port, `bash -n`) → exit 0.

### F2 · note — `plans-mock.mjs` moved on this branch

**Left as-is, recorded.** No code change was requested; the edit is the one already disclosed as
finding #4 of the final report, and it stays a note for the wave's integration pass.
`git diff origin/main...HEAD -- apps/web/e2e/plans-mock.mjs` is unchanged by this round.

### 653-N1 · note — reuse `rig653r`/55611

**Not used; a different route taken and recorded.** Because the migration changed I had to re-apply
on the lane's own rig anyway, so `clara_653` on 55511 was dropped, re-created and re-migrated from a
true prestate. `rig653r` is untouched and still running for whoever closes the wave.

### 653-N2 · note — `plans-walk` was never re-run · 653-N3 · note — the `thread-live-clarify` flake

See "Counts" below: both were run this round and both runs are reported.

---

**Nothing was declined, and nothing contradicted the brief or DECISIONS.** The one place the brief's
*wording* had to move is arm B: brief §3 describes its predicate as "the evaluator's own predicate:
no new judgement, no expense-coding false positives". The wall added here is not a judgement invented
in this lane — it is a second predicate the estate already owns (`clara._adj_line_eligibility_breach`,
0042:643), applied so the band and the door give one answer. The brief's stated *goal* for that
parenthetical is exactly what it serves. **No "should" asked the orchestrator to ratify an
assumption, so there is no ratification request in this round.**

---

## The rig was rebuilt (the migration changed)

`clara_653` was dropped and re-created empty — measured prestate: `clara schema present: false ·
schema_migrations: null` — then `pnpm db:migrate` ran the whole chain and `pnpm db:seed` re-seeded.

* Final state: `select count(*), max(version) from clara.schema_migrations` → **194 /
  `0208_prepayment_amortisation`**; seed → 2 files, exit 0.
* 0208 raised **`#653 prestate: clean …`** and **`#653 tail: OK …`** on that from-scratch chain.
* Post-apply catalog probe: `accounting_plans_kind_check` admits exactly the three members;
  `clara.prepayment_schedules` `relrowsecurity=t relforcerowsecurity=t relacl=null`;
  `clara._plan_occurrence_basis` has **one** overload; `node scripts/check-frozen-evaluators.mjs`
  against the rebuilt database → OK, 9 evaluators.
* The WDK world was re-bootstrapped (`pnpm --filter @clara/runtime exec bootstrap` → "Database schema
  created successfully!") so the real-World e2e could run against it.

**One finding met on the way, worth the wave's attention.** The chain stopped at
`0154_binding_proposal_pr_1`, whose tail asserts `count(*) from pg_roles where rolname like 'clara%'`
**= 14** — a literal over a **cluster-global** catalog. Roles survive `drop database`, so a fresh
*database* in a cluster that has already run the chain carries 18 and 0154 reds
(`the clara role count moved from 14 to 18`). I restored the true prestate by dropping the four roles
minted **after** 0154 — `clara_stripe_webhook`, `clara_stripe_webhook_login` (0160:120,123) and
`clara_auth_wall`, `clara_auth_wall_login` (0163:165,168), located by `grep -rn "create role"
migrations/` — which took the count back to 14; the chain then completed and 0160/0163 re-minted
them. Follow-up filed below.

---

## Counts

`$GATES` = the 29 `--import ./tests/*-preintegration-gate.mjs` flags from `packages/db/package.json`.
Env on every db command: `PGHOST=127.0.0.1 PGPORT=55511 PGUSER=postgres PGDATABASE=clara_653
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; the reset/role-sweep flags were never set.

| Command | Result |
|---|---|
| `packages/db$ node --test --test-concurrency=1 $GATES tests/prepayment-schedule.test.mjs` | **18 / 18 pass / 0 fail / 0 skip**, 9.4 s, exit 0 (was 15) |
| `packages/db$ node --test --test-concurrency=1 $GATES tests/prepayment-occurrences.test.mjs` | **10 / 10 pass / 0 fail / 0 skip**, 10.0 s, exit 0 (was 8) |
| `packages/runtime$ node --test tests/prepayment-schedule-basis-unit.test.mjs` | **11 / 11 pass / 0 fail**, exit 0 |
| `packages/runtime$ RELAY_TEST_MODE=1 WORKFLOW_POSTGRES_URL=… node tests/prepayment-occurrence-e2e.mjs` | **PASS 1 · PASS 2+3 · PASS 4 · PASS 5, exit 0** — `2026-05-31=50000, 2026-06-30=50001`; the `exit_after_commit` crash replays onto ONE entry charging 50001; the catch-up admits 50000 |
| `apps/web$ node --import ./test/bootstrap.mjs --import tsx --test components/prepayments/*.test.tsx lib/prepayments/schedule.test.ts` | **33 / 33 pass / 0 fail / 0 skip** (was 30) |
| `apps/web$ node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` | **15 / 15 pass / 0 fail** |
| `apps/web$ node scripts/run-tests.mjs` (whole unit suite) | **3752 tests / 3750 pass / 0 fail / 2 skipped**, 309.7 s, exit 0 (was 3749/3747/0/2 at `cc2beaa5`; +3 = this round's new cells). **653-N3: the `thread-live-clarify.test.tsx` flake did NOT fire** — zero failures in the whole suite, so there is no second run to report. |
| `pnpm typecheck` (worktree root) | **exit 0** — `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` (worktree root) | **exit 0** — 3042 static `t("…")` keys all resolve, 370 manifest files ordered, token contrast AA |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen file(s), 51 `"use workflow"` modules frozen+registered**, exit 0 |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK**, exit 0 |
| `PGPORT=55511 node scripts/check-frozen-evaluators.mjs` | **OK — 9 evaluator(s) verified**, exit 0 |
| `apps/web$ pnpm --filter @clara/web e2e prepayments-walk` (ports 3330/3331/3332), **run A**, whole file | **5 passed / 1 failed**, 3.9 m, exit 1. The one failure is `walk.detail`, inside the shared `signInTo` helper: `Test timeout of 30000ms exceeded · page.goto: net::ERR_ABORTED` at `prepayments-walk.spec.ts:44` — never an assertion about prepayment behaviour. |
| the same cell alone — `-g "walk.detail"` | **1 failed**, 32.2 s, exit 1 — again inside `signInTo`, this time at `:50` (`toHaveURL` still on `/login?next=…` when the 30 s TEST budget ran out). Reported rather than hidden: run alone it becomes the FIRST cell and absorbs the server's cold start, which is exactly the harness-budget defect the final report files as follow-up 8. |
| the same command — **run B**, whole file, quiet host | **6 passed / 0 failed, 34.8 s, exit 0** — the green whole-file run the previous report said an orchestrator would still need. Wall clock fell from 3.9 m to 34.8 s on the same build, which is the contention/cold-start diagnosis measured rather than asserted. `walk.refusal` is the cell that proves 653-B1 end to end: it now selects the instruction, and the lane mock refuses any payload that does not cite it. |
| `apps/web$ pnpm --filter @clara/web e2e plans-walk` (same ports — **653-N2**) | **9 passed / 0 failed**, 41.5 s, exit 0. The evidence gap the reviewer named is closed: `plans-mock.mjs`'s `readCachedJson` refactor does not move #640's own walk. |

**Net cell delta:** +3 `packages/db` schedule cells, +2 `packages/db` occurrence cells, +3 `apps/web`
unit cells (one authority-payload cell, two truncation render cells). Two existing cells had their
titles brought back to what they measure.

---

## Files touched (worktree only)

`packages/db/migrations/0208_prepayment_amortisation.sql` ·
`packages/db/tests/prepayment-schedule-fixtures.mjs` ·
`packages/db/tests/prepayment-schedule.test.mjs` ·
`packages/db/tests/prepayment-occurrences.test.mjs` · `packages/db/README.md` ·
`packages/db/tests/README.md` · `.github/actions/db-live-gates/action.yml` ·
`apps/web/components/prepayments/prepayment-form.tsx` ·
`apps/web/components/prepayments/prepayment-attention.tsx` ·
`apps/web/components/prepayments/prepayments-keyboard.test.tsx` ·
`apps/web/components/prepayments/prepayments-render-states.test.tsx` ·
`apps/web/lib/prepayments/schedule.ts` · `apps/web/lib/prepayments/schedule.test.ts` ·
`apps/web/lib/prepayments/api.ts` · `apps/web/messages/en.json` ·
`apps/web/e2e/prepayments-mock.mjs` · `apps/web/e2e/prepayments-walk.spec.ts` ·
`apps/web/e2e/e2e-fixture-ownership.test.ts` · `CONTEXT.md`.

One already-shared route was newly claimed: `prepayments-mock.mjs` answers `/rest/v1/accounting_work`
scoped to its own client, declared in the fixture-ownership census (two other lane mocks answer the
same route for their own clients and each falls through otherwise). `docs/PRD.md` and
`docs/ARCHITECTURE.md` untouched. `docs/plan/.../reports/653-final.md` updated in place where a fix
changed a claim or a count; not committed.

---

## What I deliberately left

1. **A positive prepayment-class roster.** The wall added for 653-B2 is **negative** — it asks "is
   this leg ineligible?" by 0042's five conditions (unknown / inactive / control class / bank /
   reserved role). An ordinary asset with no class, no bank stamp and no reserved role still passes.
   The reviewer named the narrower positive test as a possible follow-up and I agree it is one: a
   chart-level "this account holds prepayments" classification does not exist in this estate, and
   minting one is a product decision with consequences for every lane that reads the chart. Stated in
   the migration's own comment, in `packages/db/README.md` and as follow-up 1 below.
2. **F2 / `plans-mock.mjs`.** Unchanged this round; the integration pass's call.
3. **`rig653r` / 55611.** Left running and untouched.
4. **Everything the final report already named as owed:** the `nonzero_total` unreachable-arm
   follow-up, the memo-only recognition residual, the one-sided 0045 overlap warning, re-derivation
   from a corrected term, AC5's park / C55.13 / C83.7, `adjustment_templates.schedule`, and hosted
   real-environment evidence. No verdict asked for any of them and none is a fix-round item.

## Follow-ups this round adds

1. **A positive prepayment-eligibility roster for the prepaid leg.** The negative wall closes the
   receivable-control, bank, inactive and reserved-role cases by the estate's own rule; it does not
   stop a plain unclassified asset being amortised. Closing that needs a chart-level classification
   (or a `coa_accounts.account_class` member for prepayments), which touches every lane that reads
   the chart.
2. **`0154_binding_proposal_pr_1`'s role census is a cluster-global literal (`= 14`).** Any
   from-scratch re-apply into a fresh *database* on an *existing* cluster reds there, because roles
   survive `drop database`. Either scope that census to the roles the chain has minted by the 0154
   frontier, or record in `RIG.md` that a re-apply needs a fresh cluster (or the four post-0154 roles
   dropped first). It cost this fix round a full chain restart, and it will cost every lane that
   re-applies.
