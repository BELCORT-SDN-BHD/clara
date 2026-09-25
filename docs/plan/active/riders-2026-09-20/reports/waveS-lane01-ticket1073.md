# riders sweep wave · lane 01 · ticket #1073 — a third accrual/bill-conflict remedy: one period's own correcting entry

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744`. Playwright triple `https://127.0.0.1:3530 / 3531 / 3532`.

Start state, as the work order requires: `git status` clean; `git log --oneline 7bc5a710f..HEAD`
showed the two #1051 commits (`b1e0f9c3c`, `2ada717aa`), the five #1080 commits (`012d31ac8`
… `f762c1a87`) and the four #1074 commits (`ea77f059c` … `5075d8fb3`); the lane database read
**312 files, max `0332_plan_reversal_posted_basis`**.

Commits added by this ticket:

| sha | message |
|---|---|
| `210c22475` | `fix(db): #1073 a third accrual/bill-conflict remedy, one period's own correcting entry (0333)` |
| `3e62137a5` | `test(db): #1073 the scope claim, and the header claim it disproved` |
| `f2f0271ac` | `test(db): #1073 the receipt, the floor, every typed refusal, and the revenue side` |
| `fc9d61b2b` | `feat(web): #1073 "Reverse this period only" on both conflict surfaces` |

Working tree clean. Nothing pushed, no PR, no GitHub write of any kind. **No message arrived
mid-task** (sweep rule (f) did not fire).

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`clara.reverse_plan_occurrence(uuid,date,text)`** — the new human door the brief's "or a new one
   if none does" resolves to. Driven as BOB (bookkeeper) and as CAROL (viewer, for the floor).
2. **`clara.request_plan_catch_up`** — the existing "reverse now" remedy, driven UNCHANGED beside the
   new door so "the same net state" is a comparison and not a promise.
3. **`clara.list_review_queue`** — the read that produces the `accrual_bill_conflict` row. Driven to
   build the scene and to see the row clear itself; never modified (out of scope).
4. **`clara.create_accrual_adjustment` / `clara.create_accounting_plan` / `clara.correct_…`** — the
   configuration doors that make the scene real, plus `clara._assert_plan_schedule`'s own refusal,
   driven because a claim about the window rests on it.
5. **`clara.journal_lines`** — the ledger itself, read back for every "what is left on the books"
   claim, never the envelope a door returned.
6. **`clara.op_receipts`** — the receipt convention the brief's third criterion names.
7. **`lib/accruals/api.ts`'s wrapper** — the RPC name and the exact argument set the browser sends.
8. **The rendered affordance** — which controls are offered, what each sentence says, and the
   Needs-you registry entry.
9. **The browser, on the Accruals page** — that the third control is on that surface and that a
   governed refusal reaches a person verbatim.
10. **The catalog** — the estate's documented structural standard for a new granted door (a census,
    prestate pins, tail assertions). Work order rule 4 says that standard wins where it applies.

---

## The ticket, verified live on this branch before building

`gh issue view 1073`: the issue body carries the only Agent Brief and there are **zero comments**,
so there is no owner ruling comment on this ticket. The binding shape is the brief plus
`SWEEP-PLAN.md`'s L1 note ("#1073's third remedy must net to the same ledger state as the existing
'reverse now' for one period, which is only true once #1074 lands").

| the ticket's claim | measured on `clara_l04` before a line was written | verdict |
|---|---|---|
| "the Needs-you item and the Accruals page both offer exactly two remedies" | `apps/web/components/firm/accrual-bill-conflict-affordance.tsx` renders exactly `Reverse now` and `Skip this period's next occurrence`; both surfaces mount THAT component (`NEEDS_YOU_AFFORDANCES.accrual_bill_conflict`, and `components/accruals/accrual-bill-conflicts.tsx`) | **live** |
| "whatever plan-lane door already exists for reversing a single occurrence's own accrual leg, or a new one if none does" | exactly FIVE bodies reach `clara._plan_admit_occurrence` — `_accrual_finish`, `_prepayment_schedule_core`, `_record_journal_entry_core`, `request_plan_catch_up`, `wake_due_plan_occurrences` — and not one takes "one occurrence, named" from a human | **a new door is owed** |
| "'reverse now' works at the window/catch-up level rather than as a single scoped entry" | true: `reverseAccrualNow` builds `[dueDate, accrualReversalDate(dueDate)]` and calls the catch-up, which admits every due event in the window up to its cap of 12 | **live** |
| "should leave the ledger in the same net state the existing 'reverse now' remedy would for that one period" | measured on two identically configured clients after the build: identical reversal lines, identical sums on both legs | **true, and it is the ticket's own prediction** |

### One claim I made, measured, and WITHDREW

0333's first draft argued the window is **wider** than one period: on a monthly schedule due on the
1st, `clara._plan_reversal_date` of period k is period k+1's own due date, so a catch-up would admit
the next accrual beside the reversal. **That schedule does not exist in this estate.**
`clara._assert_plan_schedule` (`0193_accounting_plans.sql:1611`, restated by
`0223_prepayment_amortisation.sql:512`) refuses `monthly + day_of_month + 1` on a
`reversing_journal` plan by name — `reversal_collides_with_next_occurrence` — precisely so period
k's reversal never lands on period k+1's accrual day, because `unique (plan_id, due_date)` would
otherwise refuse the collision as a bare 23505.

I found this by driving it (the cell red-failed with that very message), corrected the migration
header and `packages/db/README.md`'s §0333 in place, and made the refusal the FIRST assertion of the
scope cell, so the correction is checkable rather than a note. **The honest position is that on this
lane the two remedies admit the same occurrence** — which is what the ticket predicts — **and that
what the third remedy adds is a different KIND of act**, with its "exactly one occurrence" guarantee
structural (read off the catalog) rather than visible on today's schedules.

---

## Acceptance criteria, each with its evidence

### AC1 — "A third remedy is available from both the Needs-you item and the Accruals page's conflict item, scoped to exactly the conflicting period." ✅

* **The control.** `apps/web/components/firm/accrual-bill-conflict-affordance.tsx` renders a third
  button, `Reverse this period only`, calling `reverseAccrualPeriod(planId, dueDate)`. The cell
  `AccrualBillConflictAffordance: the THREE remedies say what each one settles …` asserts the exact
  button list `["Reverse now", "Reverse this period only", "Skip this period's next occurrence"]`.
  **PASS** (was **RED** with the two-button list before the component changed).
* **Both surfaces, by construction and by assertion.** The cell
  `… the Needs-you inbox mounts THIS component for the conflict row …` asserts
  `NEEDS_YOU_AFFORDANCES.accrual_bill_conflict === AccrualBillConflictAffordance`; the Accruals page
  mounts the same component directly and is **driven in a real browser** by
  `accrual.walk.reversePeriod` (the control is visible, its sentence is on screen, and clicking it
  is a real governed write). **PASS.**
* **Scoped to exactly the conflicting period.** `p1073.scope.one_occurrence_only`: the plan gains
  EXACTLY one occurrence (`reversal@<reversal date>`), the flagged period's own primary row is
  unchanged (same `work_id`, same `attempt`, same `revision`), and the door's `prosrc` mentions
  neither `clara._plan_due_events(` nor either existing remedy. **PASS.**
* The door takes `p_due` = the conflict row's `period`, byte for byte (the cells pass
  `row.period`, never a value they derived), and the web wrapper sends exactly
  `{p_plan, p_due, p_op_key}` — asserted as a key-set equality in
  `reverseAccrualPeriod: … and sends NO window`.

### AC2 — "Booking it leaves the ledger in the same net state (one live expense or revenue amount for the period) as the existing 'reverse now' remedy would for that single period, verified by a cell that sums the journal lines after the remedy." ✅

* **`p1073.one_period.nets_like_reverse_now`** — two identically configured clients, each with a
  300,000c accrual posted and a 290,000c document-sourced bill inside the same period. Client A is
  settled through `clara.request_plan_catch_up`, client B through the new door. The two reversal
  entries are line-for-line identical (`[[6100,0,300000],[2020,300000,0]]`); the profit-and-loss leg
  is left carrying **290,000c — the bill's own amount**, an independent figure; and B's sums equal
  A's on both legs. Summed over `clara.journal_lines` joined through `clara.journal_entries`
  (approved, un-reversed), never over the entries the cell posted. **PASS.**
* **`p1073.revenue.one_live_amount`** — the ticket's "expense OR REVENUE" half. A revenue accrual
  (Dr accrued income 1320 / Cr revenue 4000) with a document-sourced invoice crediting the same
  income account inside the period: the reversal exchanges the sides of what that period posted, the
  income account is left carrying the invoice's own amount alone, and the accrued-income asset nets
  to zero. **PASS.**
* Both cells also assert the `accrual_bill_conflict` row is GONE from the next
  `clara.list_review_queue` read — the derived-row law, nothing dismissed.

### AC3 — "The remedy writes a receipt and is idempotent under a replayed op_key, matching the existing two remedies' conventions." ✅

* **`p1073.receipt.idempotent`** — a replayed op_key returns the stored answer byte for byte
  (`assert.deepEqual(replay, first)`) and the plan gains no second occurrence; `clara.op_receipts`
  carries exactly ONE finished row for `(firm, reverse_plan_occurrence, key)`; and a FRESH key
  naming a period already reversed is refused `CLR13 reversal_already_admitted`. **PASS.**
* **`p1073.receipt.floor`** — a viewer is refused `CLR04 insufficient_role`, nothing is written, and
  the conflict row is still there. **PASS.**
* The conventions are literally the sibling's: `clara._reserve_op` / `clara._finish_op` with the
  request hash over `(plan, due)`, `clara._audit` under its own verb `reverse_plan_occurrence`, and
  the `clara._plan_door_ctx` typed-reason wrapper `clara.skip_plan_occurrence` uses.

### Out of scope, respected — and made STRUCTURAL rather than promised

* **"Removing or changing either of the two existing remedies."** `clara.request_plan_catch_up`
  (`4ed6f110…`) and `clara.skip_plan_occurrence` (`872edfce…`) are `sha256(prosrc)`-pinned in
  0333's prestate AND re-pinned at its tail, where their ACLs are re-read too. The migration refuses
  to apply over a moved body and refuses to finish if one moved while it applied. The tail
  additionally refuses a door body that so much as mentions `clara.request_plan_catch_up(` or
  `clara.skip_plan_occurrence(`.
* **"Any change to the read that surfaces the conflict item itself."** `clara.list_review_queue` is
  **deliberately NOT sha-pinned**: a sibling lane of this wave (L4's #1048) splices a seventeenth
  `row_kind` onto that body, and pinning a body another lane writes is the collision
  `SWEEP-PLAN.md` forbids. The prestate and the tail assert it STRUCTURALLY instead — the
  `accrual_bill_conflict` arm is still there.

---

## The migration

**`packages/db/migrations/0333_plan_occurrence_reversal_door.sql`** (534 lines). Exactly one new
file, at the number reserved for me. **No overflow number was needed.**

### Prestate pins — MEASURED on `clara_l04` now, after #1051's 0330, #1080's 0331 and #1074's 0332

| signature | pin | role |
|---|---|---|
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb` | the body this door delegates to; **#1074's own output, of THIS lane** — pinned at what is LIVE, never copied from a header. Re-pinned at the tail. |
| `clara._plan_reversal_date(date)` | `faaaafe9d74650a06eca2675619d9a509ebf6128d086fa6c269a35e04759b8b3` | the schedule rule the door resolves so the web layer no longer has to for this act |
| `clara._plan_door_ctx(uuid,integer)` | `97bd6c12ed368f7a2e5f2c96b548f7d77c6a49e603210203e282a011310e289b` | the bookkeeper floor |
| `clara._plan_due_index_on_or_before(date,text,text,integer,date)` | `edd611e5d5a1da8da88aaf0ac4dcc13c411f1d4aef98ec16cba8947bd47d692d` | the "is `p_due` a due date of this schedule" pair |
| `clara._plan_due_nth(date,text,text,integer,integer)` | `f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e` | …the other half |
| `clara._plan_run_model()` | `c0bdc01a3f61a9ac384de879f124336d28c961468800eecb2dcdd696306913c3` | the model snapshot a database-side admission records |
| `clara.request_plan_catch_up(uuid,date,date,text)` | `4ed6f110e05717f387a7ca3715342597e64a63a4595b5ca4f60f2cc48f0d31b2` | **out of scope, pinned at both ends** |
| `clara.skip_plan_occurrence(uuid,date,text,text)` | `872edfce81e27aa43a077a9ce8a4367531c0dcec72e5dc4731d42d6f9b506a37` | **out of scope, pinned at both ends** |
| `clara.reverse_plan_occurrence(uuid,date,text)` | absent-or-`3f6f656d805ebecbf09999591eb1dd1b7fd73eb39d5f9035375d9f56eb79dd86` | the ONE name this file mints; bimodal, so a redo is safe and a name another lane had taken REDs |
| `clara.list_review_queue(jsonb,jsonb,integer)` | **not pinned — structural only** | a sibling lane writes that body; the arm's presence is asserted instead |

**No data-dependent branch.** Every prestate and tail arm reads `pg_proc` and `pg_namespace` only,
so no arm needed rows to be entered before applying (wave-3 addendum).

### The change

One `create or replace function clara.reverse_plan_occurrence(uuid,date,text)` with its `revoke`,
its one `grant execute … to clara_authenticated` and its `comment on`. No table, no CHECK, no chart
row, no trigger, no other grant. The door:

1. refuses an empty `p_op_key` and a null `p_due` by name;
2. takes the bookkeeper floor through `clara._plan_door_ctx` with the typed-reason wrapper;
3. reserves the op key on `(plan, due)`;
4. takes the plan row lock BEFORE reading the revision (so the schedule it validates `p_due`
   against and the schedule the core then admits under are the same one — the core re-takes the
   lock re-entrantly);
5. refuses `no_live_revision`, `plan_does_not_reverse` and `accrual_occurrence_not_found`;
6. resolves `clara._plan_reversal_date(p_due)`;
7. calls `clara._plan_admit_occurrence(plan, that date, 'reversal', clara._plan_run_model(),
   p_allow_reattempt => true)` — **once**;
8. RAISES, with the core's own `reason` and `code`, if the admission was not made;
9. audits and finishes the receipt, returning the core's answer verbatim under `occurrence`.

**Why `plan_does_not_reverse` is not redundant, measured rather than assumed.** On a
`recurring_journal` plan whose schedule is monthly/`last_day_of_month`,
`clara._plan_primary_for_reversal` resolves a reversal date back to a real primary due date from the
date arithmetic alone, so without this wall the admission core would admit a swapped-sides entry for
a plan whose revision says `auto_reverse = false` (`ck_plan_revisions_auto_reverse`, 0193:561, ties
that flag to `plan_kind='reversing_journal'`). `p1073.refusals.own` builds a real recurring plan
through `clara.create_accounting_plan` and drives the refusal.

**Why a refusal is RAISED rather than reported.** `clara.request_plan_catch_up` answers a window
with per-event outcomes and commits its receipt either way, which is right for a window. This is ONE
act a person asked for by name, so it follows `clara.skip_plan_occurrence`: the transaction rolls
back and the op key is left FREE for a real retry instead of pinned to a receipt that recorded
nothing. `p1073.refusals.core` proves exactly that — the key a `plan_paused` refusal rolled back does
the real act once the plan is resumed.

**New refusal vocabulary: exactly two tokens.** `plan_does_not_reverse` (CLR10) and
`reversal_already_admitted` (CLR13, the name this door gives the core's CONVERGED answer, which
carries no `reason` key of its own). `invalid_op_key`, `invalid_request` and
`accrual_occurrence_not_found` are `clara.skip_plan_occurrence`'s own, reused deliberately; every
core token (`not_yet_due`, `reversal_before_primary`, `plan_paused`, `plan_ended`,
`outside_authority_window`, `client_inactive`) travels outward unchanged. **No existing SQLSTATE,
message or reason anywhere in the estate changes, and no grant moves.**

### Tail

T.1 the door resolves at exactly `(uuid,date,text)` · T.1b posture (`clara_fn_owner`, SECURITY
DEFINER, VOLATILE, `search_path=clara, pg_temp`) · T.1c ACL: `clara_authenticated` alone, with
PUBLIC, `clara_runtime`, both agent roles and all four wake roles each proved unable to execute ·
T.1d fifteen body markers, including every typed reason · **T.1e the SCOPE, structural**: the body
must NOT mention `clara._plan_due_events(`, `clara.request_plan_catch_up(` or
`clara.skip_plan_occurrence(` · T.2 the admission core byte-identical to its #1074 image · **T.3 the
two existing remedies byte-identical AND their ACLs unmoved** · **T.4 the census**: exactly six
bodies reach the admission core and this door is one of them · **T.4b** exactly ONE body mentions
`reverse_plan_occurrence` (itself) — nothing nests this door, so there is no second, ungoverned
entrance to the act · T.5 `clara.list_review_queue` still carries its `accrual_bill_conflict` arm.

Every comparison is over `prosrc` text and `proname`; **no digest over text-ordered row content is
pinned anywhere** (sweep rule (e)).

### Apply history on this rig

1. `pnpm --filter @clara/db migrate` → `applied 0333_plan_occurrence_reversal_door`, prestate
   printed **`FIRST APPLY`** (the name absent, five bodies reaching the core), tail printed OK.
   **The first-apply branch of the bimodal pin was exercised for real**, so the wave-3 addendum's
   hand proof was not needed.
2. The post-image sha was measured (`3f6f656d…`) into the prestate's own redo branch, and the file
   re-applied with **`CLARA_MIGRATION_REDO=0333_plan_occurrence_reversal_door`**
   (`CLARA_ALLOW_DESTRUCTIVE=1`, `CLARA_RIG_DB=1`) → prestate printed **`REDO APPLY`** (six bodies),
   tail OK. **Recorded as the work order requires.**
3. After the header correction (the withdrawn window claim) the file was re-applied with the SAME
   redo mode → `redone … new checksum 0960f676cf7e0febba14a61af8f67bf71b8919a74d55e8e273f3e9d4d5937291`.
4. A final `migrate` → `0 new migration(s) applied · 313 total`, no drift. Ledger now **313 files,
   max `0333_plan_occurrence_reversal_door`**, confirmed directly against `clara_l04` at
   `127.0.0.1:55744`.

---

## TDD — the slices, and the red I saw

**Slice 1 — the remedy itself.** `p1073.one_period.nets_like_reverse_now` was written first and run
against the un-migrated lane database with the frontier gate temporarily scaffolded out (recorded
here rather than hidden; the gate line was restored and `git diff` confirms the file is otherwise
untouched): **RED, for exactly the right reason —**

```
function clara.reverse_plan_occurrence(p_plan => uuid, p_due => date, p_op_key => text) does not exist
code: 42883
```

Everything before that line in the cell had already run green: the scene built, the existing
"reverse now" remedy settled client A, and the pre-assert saw 590,000c live on the expense leg. Then
the migration, then **GREEN**. The gate module, the `rig-meta` cohort and the gate-chain entry landed
with the migration in the same commit, which is the house shape for a new db test file.

**Slice 2 — the scope.** Written to answer "is it actually narrower?", and its first draft was
**RED for a reason I did not expect**: `a monthly reversing plan cannot accrue on the 1st: its
reversal would land on the next accrual's own day` (CLR10
`reversal_collides_with_next_occurrence`). That refusal disproved the claim I had written into the
migration header, so the cell was rebuilt around what is true and the header and README were
corrected in place. Shaped by what slice 1 taught: the ledger cannot distinguish the two acts on
this lane, so the catalog must.

**Slice 3 — the governed act.** `p1073.receipt.idempotent` and `.floor`.
**Slice 4 — the refusals.** `p1073.refusals.own` and `.core`.
**Slice 5 — the other side.** `p1073.revenue.one_live_amount`.

Slices 3 to 5 went green on their first run, and I say so plainly rather than claiming reds I did
not see: a migration reserves ONE file, so the door's four own walls had to be correct in slice 1 for
the first cell to be honest at all. Their non-vacuity is established by the break control below,
which is the control the work order names for exactly this case.

**Slices 6 to 8 — the web.** `reverseAccrualPeriod`'s cell was **RED** (`The requested module './api'
does not provide an export named 'reverseAccrualPeriod'`), then green. The affordance cell was
**RED** on the two-button list and on both plan-not-active sentences, then green. The browser walk
leg was written last, against the mock handler it needs.

**The vacuity control (work order rule 4), run once over the whole db file.** The subject was recut
**on the rig only** into the null hypothesis a reviewer would raise — "the third remedy is 'reverse
now' under another name": same signature, same floor, same receipt, with the single admission
replaced by `clara.request_plan_catch_up(p_plan, p_due, clara._plan_reversal_date(p_due), …)`.
**Four of the seven cells went RED**, each for its own reason:

```
ok     1 … p1073.one_period      (the ledger really is the same on this lane)
not ok 2 … the one-period remedy must not reach clara.request_plan_catch_up(
not ok 3 … reversing the same period twice under a fresh key: expected SQLSTATE CLR13 but the call SUCCEEDED
ok     4 … p1073.receipt.floor   (the floor is the same either way)
not ok 5 … a plan whose schedule has no reversal leg: expected SQLSTATE CLR10 but the call SUCCEEDED
not ok 6 … expected detail.reason="not_yet_due" beside CLR10, got {"reason":"catch_up_in_future"}
ok     7 … p1073.revenue         (the ledger again)
```

Cells 1, 4 and 7 stayed green **and that is the point**: the ledger cells cannot tell a scoped act
from a window, because on this lane both leave the same ledger — which is exactly what the ticket
predicts. It is why the scope cell reads the CATALOG as well as the occurrence set.

The subject was then restored **byte for byte** by re-running 0333's own function statement:
`3f6f656d…` before the break, `c9ab7ff4…` while broken, `3f6f656d…` after the restore, and all seven
green again. No battery of red cells was written ahead of implementation.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| my new db file, **full gate chain** (129 `--import` gate modules, mine included) | `node --test --test-concurrency=1 $GATES tests/plan-occurrence-reversal-door.test.mjs` | **7 tests, 7 pass, 0 fail, 0 skipped** |
| behaviour preservation, accrual + plan part 1 (`plan-occurrence-reversal-door`, `accrual-bill-conflict`, `accrual-adjustments`, `accrual-correction`, `accrual-period-amounts`, `accrual-revenue-side`, `accounting-plans`, `accounting-plan-occurrences`, `plan-reversal-posted-basis`), full chain | as above | **116 tests, 116 pass, 0 fail, 0 skipped** |
| behaviour preservation, plan family part 2 (`plan-schedule-yield-wall`, `plan-overlap-sibling-arm`, `plan-overlap-template-arm-retired`, `plan-authority-wall`, `accrual-plan-authority-wall`, `prepayment-schedule`, `prepayment-schedule-obo`, `prepayment-occurrences`, `prepayment-wake-reroute`, `revenue-recognition`, `tenancy-rent-plan`, `depreciation-history`, `schedule-term-correction`), full chain | as above | **153 tests, 153 pass, 0 fail, 0 skipped** |
| operation census + rig isolation (I added an SQL function), **no reset flags** | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** — the skip is `T19 poison-role`, skipped *because* `CLARA_RIG_ALLOW_RESET` is unset, which is the rig rule. `T17` (exact grant matrix) and `T18` (every SECURITY DEFINER pins `search_path` and is owned by `clara_fn_owner`) both PASS with the new door. |
| web migration-pins corpus (sweep rule (d): in scope because a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` from `apps/web` | **22 tests, 22 pass, 0 fail** — confirms **no barrier entry is owed for 0333** (the corpus holds reviewed DYNAMIC-SQL barriers; 0333 is static DDL, and its only `execute` tokens are `grant execute` and two prose strings) |
| the WHOLE web unit suite, once | `node scripts/run-tests.mjs` from `apps/web` | **5175 tests, 5173 pass, 0 fail, 2 skipped** — both skips are the pre-existing live-Supabase-auth pair (`CLARA_LIVE_SUPABASE_AUTH_URL` not configured), unrelated to this ticket |
| the browser walk I touched, on MY triple | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531 CLARA_E2E_RUNTIME_PORT=3532 pnpm --filter @clara/web e2e accrual-walk` | **21 passed** (20 pre-existing + `accrual.walk.reversePeriod`), 43.2s |
| typecheck | `pnpm typecheck` | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** (see the base-drift note below) |
| migration ledger | `pnpm --filter @clara/db migrate` (final run) | `0 new migration(s) applied · 313 total`, max `0333_plan_occurrence_reversal_door` |

**Two lint findings of mine, both fixed:** the raw-colour selector (owner ruling Q4) trips on a
ticket reference in a STRING literal, so the two test titles carrying `#1073` were reworded to
"ticket 1073" — the rule's own recommended fix, never a weakening.

### The lint base-drift, which is NOT this ticket's and must not be read as a green

`CI=true GITHUB_ACTIONS=true pnpm lint` **fails at its first step** on this branch with 28
frozen-workflow violations, all of the form `REMOVED-VS-BASE packages/runtime/workflows/chatTurn.v22.ts`
(plus `claraWork.v6.*`, `statementFacts.v4.*` and three `REGISTRY-DOWNGRADE` lines). The cause is
measured, not guessed: `origin/main` has moved to `061a6992` and now carries **29** of those files,
while this lane's base `7bc5a710f` carries **0** — the cut phase merged after the sweep lanes were
cut. My own diff touches **no `packages/runtime` file at all** (`git diff --name-only 7bc5a710f..HEAD`).
Run against the lane's OWN base with the script's supported override
(`FREEZE_BASE_REF=7bc5a710f`, `scripts/check-frozen-workflows.mjs:153`) the whole chain is **exit 0**.
Every sweep lane on this base will hit the identical red; **the orchestrator should decide whether
the lanes rebase onto the merged cut head or whether integration runs the freeze lint against the
wave base.** I did not rebase and I did not touch `frozen-workflows.json`.

---

## Docs, in the same commits

* **`packages/db/README.md`** — a new `## 0333` section: the gap, the census that proves no such
  door existed, the whole signature, the withdrawn window claim and what disproved it, why the net
  ledger state agrees and how that is known, what the door owns versus what it refuses to re-decide,
  why a refusal is raised rather than reported, what the file does not do, and the redo record.
  **No existing section was edited** and no applied migration was touched (`git show --stat` on
  every commit: only `0333` appears under `migrations/`).
* **`packages/db/tests/README.md`** — a new section describing all seven cells and the non-vacuity
  control with its exact four red reasons and the three deliberate greens.
* **`packages/db/package.json`** — one `--import ./tests/plan-occurrence-reversal-door-preintegration-gate.mjs`,
  at the sorted position in migration order (immediately after 0332's). Minimal hunk on a shared
  file; JSON re-parsed after the edit.
* **`packages/db/tests/rig-meta.mjs`** — `PLAN_OCCURRENCE_REVERSAL_DOOR_0333_COHORT` (one name,
  `reverse_plan_occurrence`, `clara_authenticated`-only), its spread into the authenticated roster,
  and its bimodal `cohortFailures()` call — three minimal hunks in the same shape 0302's carry.
* **`apps/web/README.md`** — a new `## #1073` section: what makes the third remedy a third, why the
  surface computes no window for it, why the copy claims no ledger difference, "one component, both
  surfaces", and the plan-not-active face.
* **`apps/web/messages/en.json`** — TWO new keys appended at the sorted position inside the existing
  `NeedsYou` block (`accrualBillConflictReversePeriod`, `accrualBillConflictReversePeriodHint`) and
  two existing sentences corrected from "neither remedy" to "none of the remedies" now that there
  are three. The file was NOT re-serialized (4 insertions, 2 deletions), and duplicate keys were
  scanned for with an independent per-section text scanner, not `JSON.parse`: **0 duplicates**.
* **`CONTEXT.md`** — ONE minimal correction inside the existing **"Settlement candidate row"** entry,
  whose neighbour note said the conflict row "offers … only two remedies (skip the next occurrence,
  or reverse now)" and that "they both refuse" when the plan is not active. Both are now untrue.
  **Flagged for the merger:** `SWEEP-PLAN.md`'s shared-file table assigns `CONTEXT.md` to **L3 only**.
  This is the **fourth** L1 hunk (#1051's and #1080's were in the "Authorising instruction"
  paragraph, #1074's in "Plan occurrence" / "Accrual reversal" / "Accrual correction"). Mine is in
  "Settlement candidate row", which none of the earlier three touched, so all four regions are
  disjoint.
* **`apps/web/test/manifest.txt` — no hunk owed.** Both web files I touched are already listed; this
  ticket adds no new web test file.

---

## Successor contract

**None is owed as an edit, and the contract below is what a frozen caller would need.** This ticket
touches no frozen workflow body and no module in a frozen closure (the freeze lint is clean against
the lane base, and `git diff --name-only` lists no `packages/runtime` file). No existing door's name,
signature, argument order, grant, part kind or `detail.reason` vocabulary moves.

If a chat or Work tool is ever to offer this remedy, the whole of what it needs is:

* **name** — `reverse_plan_occurrence` (PostgREST RPC; `clara_authenticated`, bookkeeper floor
  enforced in the body).
* **zod input** —
  ```ts
  z.object({
    plan_id: z.string().uuid(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // the FLAGGED PERIOD's own due date:
                                                         // the accrual_bill_conflict row's `period`,
                                                         // byte for byte. NEVER a window, never a
                                                         // date the model computed.
    op_key: z.string().min(1),
  }).strict()
  ```
* **door call, argument order** — `clara.reverse_plan_occurrence(p_plan => plan_id, p_due => due_date,
  p_op_key => op_key)`. Exactly three arguments; there is no `p_from`/`p_to`, because the database
  resolves the scheduled reversal date itself.
* **answer** — `{plan_id, due_date, reversal_due_date, leg: 'reversal', reversed: true, occurrence}`,
  where `occurrence` is `clara._plan_admit_occurrence`'s own answer verbatim (`admitted`, `work_id`,
  `task_id`, `occurrence_id`, `logical_op_id`, `replayed`, `revision`, `attempt`, `period_key`,
  `reverses_entry_id`). A tool schema over this MUST allow `occurrence` to carry the core's keys, or
  a `.strict()` echo will fail the way `plan-occurrence-e2e.mjs` leg 5 measures.
* **refusal mapping** — every failure is a raise, never a reported outcome. Door-owned:
  `CLR10 invalid_op_key`, `CLR10 invalid_request` (field `due`), `CLR10 plan_does_not_reverse`
  (carries `plan_kind`), `CLR10 accrual_occurrence_not_found` (field `due`), `CLR13 no_live_revision`,
  `CLR13 operation_in_flight`, `CLR04` with `no_authenticated_actor` / `actor_not_active` /
  `insufficient_role`. Passed through from the admission core under the core's own token and code:
  `not_yet_due`, `reversal_before_primary` (carries `primary_state` and `primary_due_date`),
  `plan_paused`, `plan_ended`, `client_inactive`, `outside_authority_window`,
  `period_already_admitted`, plus `CLR13 reversal_already_admitted` for the core's converged answer.
  A refusal ROLLS BACK, so the same `op_key` may be retried once the cause is gone.
* **part kind** — none new. The act produces an `accounting_work` the ordinary plan-occurrence
  machinery already renders; nothing here mints a part.
* **prompt stanza** — "To settle a bill that posted inside an accrued period, you may reverse THAT
  PERIOD's accrual on its own. Send the period's own due date exactly as the Needs-you row gives it;
  never compute a window and never guess the reversal date — the books decide it. If the reversal is
  not yet due, or the accrual for that period never posted, say so in the refusal's own words."

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

1. **`apps/web/lib/accruals/api.ts` still mirrors `clara._plan_reversal_date` by hand**
   (`accrualReversalDate`), because `reverseAccrualNow` needs a `p_to` for the catch-up. The new
   remedy does not use it, so the mirror now serves exactly one caller. If "reverse now" is ever
   re-expressed as a period rather than a window, that mirror and its three unit cells go with it —
   a schedule rule with two homes eventually has two answers. Not done here: changing either
   existing remedy is the ticket's own out-of-scope line.
2. **A catch-up's window can admit more than the reversal in principle, and only
   `clara._assert_plan_schedule`'s `reversal_collides_with_next_occurrence` keeps that from being
   reachable today.** That wall lives in the plan-CONFIGURATION lane, not in the catch-up; a future
   schedule shape (a non-monthly reversal rule, a different `_plan_reversal_date`) would reopen it
   for "reverse now" while leaving the new remedy untouched. Worth a line in a schedule-widening
   ticket rather than a ticket of its own.
3. **`clara.reverse_plan_occurrence` is plan-generic but only the accrual surface offers it.** The
   door refuses `plan_does_not_reverse` for every non-reversing kind, so a prepayment or recognition
   schedule cannot reach it at all today — correctly, since those kinds carry no reversal leg
   (`ck_plan_revisions_auto_reverse`). If a future kind gains one, the remedy is already there and
   needs only a surface.
4. **The freeze-lint base drift (see the gates table)** is a wave-level decision for the
   orchestrator, not a ticket.

---

## Anything unverified

* **The browser walk does not drive the new remedy's SUCCESS path.** The Accruals-page mock answers
  `reverse_plan_occurrence` with a real `CLR10 not_yet_due` refusal, deliberately: the walk has no
  per-test reset, and a success would clear the derived row that the pre-existing
  `accrual.walk.billConflict` cell needs in order to prove its own re-read. So the browser proves
  the control is on that surface and that a governed refusal reaches the person verbatim; **the
  success path is proven against a real Postgres by the seven db cells, and the button-to-RPC wiring
  by two unit cells.** Stated rather than papered over.
* **No runtime end-to-end was run for this ticket.** `packages/runtime` carries no change from it and
  no frozen tool calls the new door; `packages/runtime/tests/plan-occurrence-e2e.mjs` exercises the
  admission core, which is byte-unchanged (pinned at both ends of 0333) and was already driven for
  #1074 on this branch.
* **Cross-agent scratchpad collision, recorded because it could have corrupted a measurement.**
  This session's scratchpad directory is shared by the sweep wave's other lane workers, and a
  sibling overwrote a query helper I had written there, re-pointing it at `clara_l05:55745`. Two
  late ledger reads went to the wrong database before I noticed. **No measurement in this report
  depends on that file after the collision**: every authoritative run (`pnpm … migrate`, every
  `node --test`) used the lane's own `PGPORT=55744 PGDATABASE=clara_l04` env, the prestate pins were
  proved by 0333's own FIRST APPLY against `clara_l04`, and the final state was re-read with a
  uniquely named script — `clara_l04 @ 55744 · 313 files, max 0333_plan_occurrence_reversal_door`,
  with the door at `3f6f656d…` and both existing remedies byte-unchanged. **No write of mine reached
  another lane's database.** Worth telling the orchestrator: a per-agent scratchpad subdirectory
  would remove the hazard.
* **The tail's census of SIX callers of `clara._plan_admit_occurrence` and the prestate's pin of it**
  assume no sibling lane with a migration number BELOW 0333 recuts that body or adds a caller.
  `SWEEP-PLAN.md` says only L1 writes it, and L1 merges first, so this holds as planned — but it is
  the one assertion in 0333 that a re-numbering at integration could invalidate, and the integrator
  should know it.
