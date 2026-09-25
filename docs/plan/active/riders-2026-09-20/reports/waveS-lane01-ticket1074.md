# riders sweep wave · lane 01 · ticket #1074 — a reversal reverses what its occurrence POSTED

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744`. Playwright triple unused (no `apps/web` change).

Start state, as the work order requires: `git status` clean; `git log --oneline 7bc5a710f..HEAD`
showed the two #1051 commits (`b1e0f9c3c`, `2ada717aa`) and the five #1080 commits (`012d31ac8`,
`fe77786ea`, `d9172f450`, `b28375a4d`, `f762c1a87`); the lane database read **311 files, max
`0331_accrual_plan_authority_wall`**.

Commits added by this ticket:

| sha | message |
|---|---|
| `ea77f059c` | `fix(db): #1074 a reversal reverses what its occurrence posted (0332)` |
| `679c99c85` | `test(db): #1074 both sides, both calculation rules, the basis seam and the census` |
| `ab42ceb55` | `docs: #1074 the 0332 section, the battery's own section, CONTEXT, and a #942 comment that is no longer true` |
| `5075d8fb3` | `docs: #1074 the 0332 section states how wide the blast radius actually is` |

Working tree clean. Nothing pushed, no PR, no GitHub write of any kind. **No message arrived
mid-task** (sweep rule (f) did not fire).

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`clara.create_accrual_adjustment`** — the human configuration door (`clara_authenticated`,
   bookkeeper floor), driven as BOB. It is where the accrual and its first occurrence are born.
2. **`clara.correct_accrual_adjustment`** — the correction door the brief names as half the root
   cause. Driven as BOB, unchanged by this ticket, and pinned at both ends of the migration.
3. **`clara.request_plan_catch_up`** — the human door that admits a named due event, and therefore
   the reachable entrance to `clara._plan_admit_occurrence`, the body the brief names as the other
   half. Driven as BOB.
4. **The posted ledger** — `clara.journal_entries` / `clara.journal_lines`, reached by posting each
   admitted Work all the way to a committed receipt through the estate's own lane (claim the run,
   mint the client OBO credential, call the wake verb, settle completed). Every figure in this
   report was read back off the ledger, never off a basis this battery constructed.
5. **`clara.accounting_work.basis`** — the admitted basis of the reversal Work, so "only the LINES
   move" is a measurement rather than a promise.
6. **The catalog** — the estate's documented structural standard for a new ungranted internal (a
   census, a prestate pin, a tail assertion). Work order rule 4 says that standard wins where it
   applies, and `clara._plan_posted_entry_lines` has no public interface of its own: it reaches no
   application role by design, because it reads every client's journal lines under a definer.

---

## The ticket, verified live before building

`gh issue view 1074 --comments`: the issue body carries the only Agent Brief and there are **zero
comments** (the header prints `comments: 0`), so there is no owner ruling comment on this ticket.
The binding shape is the brief plus the sweep wave's plan of record (`SWEEP-PLAN.md`, "Why each lane
is grouped this way", L1).

| the ticket's claim | measured on this branch, before a line was written | verdict |
|---|---|---|
| "the reversal is built from the LIVE revision's basis, so it reverses 275,000 cents, not the 300,000 that was actually posted" | driven end to end on `clara_l04`: 300,000c posted (Dr 6100 / Cr 2020), corrected to 275,000c, reversal admitted and posted **Dr 2020 275,000 / Cr 6100 275,000** | **live** |
| "a stranded 25,000-cent balance on the accrual's balance-sheet leg that never clears" | `sum(credit - debit)` over every approved, un-reversed line on 2020 for that client came to **25,000**, not 0 | **live** |
| "it is identical on the expense side" (the brief measured it on the revenue side during #942) | driven on BOTH sides; both were wrong before 0332 and both are right after | **live, both sides** |
| "the body is shared by every plan kind, so the blast radius is wider than the ticket's accrual framing" (SWEEP-PLAN) | true of the CODE — `clara._plan_admit_occurrence` is the ONE body that turns a due date into a Work for all three kinds — but **narrower in the live estate, and I corrected the framing rather than inheriting it**: `ck_plan_revisions_auto_reverse` (0193:561) is `auto_reverse = (plan_kind = 'reversing_journal')`, so only a reversing journal can have a reversal leg at all. On this rig all 136 `amortisation_schedule` and all 64 `revenue_recognition_schedule` revisions carry `auto_reverse = false`; all 374 `reversing_journal` revisions carry true | **true of the body, narrower in fact** |

**One addition to the ticket's framing, measured rather than assumed.** The brief describes one
route to the defect (the revision's `stated_amount` basis). There is a **second**: under
`stated_period_amount` (#937) the figure never touches the plan revision at all — it lives in
`clara.accrual_period_amounts`, and `clara._plan_accrual_period_line` reads the **highest revision**
of the accrual detail, which a correction also supersedes. So a per-period accrual stranded a
balance the same way by a different path. Worse, a correction that dropped the stated amount for a
period already on the books left that period's reversal **refused** `CLR10
accrual_period_amount_missing` — a posted balance with no lawful way off the books at all. One
mechanism closes both, and `p1074.per_period` is the cell.

---

## Acceptance criteria, each with its evidence

### AC1 — "An accrual posts at amount X, is corrected to amount Y before its reversal runs, and the reversal posts exactly X (undoing what was actually posted), leaving no stranded balance." ✅

* Migration `packages/db/migrations/0332_plan_reversal_posted_basis.sql`.
* **`p1074.expense.reverses_what_posted`** — 300,000c configured and posted (asserted off
  `clara.journal_lines` as `[[6100, 300000, 0], [2020, 0, 300000]]`), corrected to 275,000c through
  `clara.correct_accrual_adjustment` (asserted on the live detail read), reversal admitted through
  `clara.request_plan_catch_up` and posted as `[[6100, 0, 300000], [2020, 300000, 0]]`. The
  occurrence still names the entry it undid (`reverses_entry_id`). **PASS** (was **RED** with
  `275000` before 0332 — that first red is the measurement the migration header quotes).

### AC2 — "A test sums the journal lines for the accrual's balance-sheet account after the full posting-correction-reversal sequence and asserts it nets to zero." ✅

* The same cell's `netOnAccount(client, ACHART.liability)` sums `credit_cents - debit_cents` over
  every APPROVED, un-reversed entry of the client, joined through `clara.journal_entries` — the
  ledger's own answer, not a sum of the two entries the cell posted. It is **0**, and the
  profit-and-loss leg is **0** beside it. The same two sums are asserted in `p1074.revenue` (on the
  accrued-income asset and the revenue account) and in `p1074.per_period`.

### AC3 — "The fix applies identically to both the expense and revenue sides." ✅

* **`p1074.revenue.reverses_what_posted`** — a #942 revenue accrual (Dr 1320 accrued income / Cr
  4000 revenue at 300,000c), corrected to 275,000c, reversed at **300,000c** with the sides
  exchanged, and both legs netting to zero. **PASS.**
* It is identical by construction and not by duplication: the fix hands an override to
  `clara._plan_occurrence_basis`, which was already side-agnostic (0304's own header says so of the
  reversal leg), and the tail re-asserts that body byte-identical and still IMMUTABLE.

### Out of scope, respected — and DRIVEN rather than asserted

* **"Any change to how a correction affects occurrences that have NOT yet posted (those should keep
  reading the live revision)."** `p1074.not_posted.reads_live_revision` posts the latest period,
  corrects, then catches up an EARLIER period that was never admitted: it has no entry behind it,
  takes no override, and posts the **corrected** figure. Structurally the guarantee is the gate
  `if p_leg = 'reversal' and v_primary_entry is not null then`, which the migration's tail T.4b
  pins as a literal. **This is the one cell that stays GREEN against the pre-image**, and
  deliberately so: it guards against over-application, so it must pass on both sides of the change.
* **"Any change to the correction door's own validation rules."** `clara.correct_accrual_adjustment`
  is pinned at `6a59591a…` in the prestate AND re-pinned in the tail (T.3e). Not a promise in prose:
  the migration refuses to apply over a moved body and refuses to finish if the body moved while it
  applied.

---

## What moves, beyond the amount the ticket is about

Three things, each measured, each recorded in the README section:

| what | before 0332 | after 0332 |
|---|---|---|
| a reversal whose period's stated amount a correction **removed** (`stated_period_amount`) | refused `CLR10 accrual_period_amount_missing` — a posted balance with no lawful way off the books | reverses what the period posted |
| a correction that moved the accrual onto **different accounts** after a period posted | the reversal posted to the NEW accounts, stranding the balance on the old pair | the reversal posts to the ORIGINAL pair; if one has since been deactivated it REFUSES at posting time through `clara._validate_entry_lines`'s existing "line codes to a non-existent account" floor (0009, unchanged, no new refusal minted) |
| a basis carrying a 1..5c rounding residual | the reversal dropped the rounding line and `clara._validate_entry_lines` minted its own mirror at posting time | the reversal carries the mirror explicitly; the netted ledger is identical and the reversal now names every line it undoes |

Row 1 is a refusal **ceasing to fire**, never a new one appearing. Row 3 cannot arise from any
accrual, prepayment or recognition basis that ships today (both legs of each carry the same figure),
so it is a statement about the shared body rather than about a live lane. **No refusal reason, no
SQLSTATE and no message anywhere in the estate changes**, and no grant moves.

---

## The migration

**`packages/db/migrations/0332_plan_reversal_posted_basis.sql`** (859 lines). Exactly one new file,
at the number reserved for me. **No overflow number was needed.**

### Prestate pins — MEASURED on `clara_l04` now, after #1051's 0330 and #1080's 0331, never copied from a header

| signature | pin | role |
|---|---|---|
| `clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)` | `cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e` | the SEAM this file uses. Pinned unconditionally AND re-asserted `provolatile = 'i'` at both ends: the override arriving as an argument is the whole reason that body can be IMMUTABLE |
| `clara._plan_primary_entry(uuid,date)` | `e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46` | the gate on the new block — "money on the books, still live" (0193, review round 2 BLOCKER-1) |
| `clara._plan_accrual_period_line(uuid,date)` | `9951a63f8eb0926b99917a3ef7dfedd32689af88ff25598b75075f174adf7941` | the arm the override SUPERSEDES for a `stated_period_amount` reversal; pinned so "superseded" is a claim about a known body |
| `clara._validate_entry_lines(uuid,jsonb)` | `37b03159a535770d6d7053aa826270703fcafa86f3864e9e344fe5bb886d3c71` | the two-line floor the NULL belt rests on (0009) |
| `clara.correct_accrual_adjustment(uuid,jsonb,text)` | `6a59591a6211acdb6975c7dcfe1dc5c2b3334a8d68ad4281635e7d38ac19fdfa` | the ticket's out-of-scope body, pinned at both ends rather than promised |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | pre `02ea6afe635dc9a8453d69918f5f48cb05f404f6e404973096db2ec92d0a655e` → post `5cc0fa562dec69faf702fee1a2847a6c0557471b28908836d1601bea5818baeb` | RECUT, bimodal |
| `clara._plan_posted_entry_lines(uuid)` | absent-or-`e13df9d08204a3ebb6b7628af71b41e3f76781f062e07ec21183d7c671545fa5` | the ONE name this file mints; absence-or-own-output, so a redo is safe and a name another lane had taken would red |

The prestate also pins `clara._plan_admit_occurrence`'s **grant posture** (owner-only ACL, PUBLIC
denied) so the tail can prove the recut preserved it, and asserts the trigger
`t_jl_immutable` is still on `clara.journal_lines` — the belt the NULL guard's unreachability rests
on, made checkable instead of claimed.

**`clara._plan_admit_occurrence`'s pre-image `02ea6afe…` is 0308's own output**, verified by
extracting the body from `0308_deferred_revenue_recognition.sql` between its dollar tags and hashing
it: byte-identical to the live `prosrc`. It is pinned **nowhere else in the repository** — 0303's and
0308's own prestates pin the PRE-0308 images, and the only other occurrences are two wave-4 report
documents (`reports/wave4-merge.md:549`, `reports/wave4-gates-A.md:281`), which nothing runs.

**No data-dependent branch.** Every prestate and tail arm reads `pg_proc` and `pg_trigger` only, so
no arm needed rows to be entered before applying (wave-3 addendum).

### The change

One `create or replace function clara._plan_posted_entry_lines(uuid)` with its `revoke` and
`comment on`, and one `create or replace function clara._plan_admit_occurrence(…)` with the same.
No table, no CHECK, no chart row, no grant, no new name beyond the resolver. The whole of the
behaviour change is:

```sql
  if p_leg = 'reversal' and v_primary_entry is not null then
    v_posted_basis := clara._plan_posted_entry_lines(v_primary_entry);
    if v_posted_basis is not null then
      v_line := v_posted_basis;
      v_line_missing := false;
    end if;
  end if;
```

The recut body was produced **mechanically** from the LIVE pre-image by two insertions (one
declaration, one block), and the generator asserted before the file was written that each anchor
occurs exactly once, that each insertion occurs exactly once in the output, and that removing both
reproduces the pre-image byte for byte.

### Tail

T.1/T.1b/T.1c/T.1d the recut body at its post-image with definer/volatile/owner/`search_path` and
owner-only ACL, unreachable by `clara_authenticated` / `clara_runtime` / `clara_agent_ro` /
PUBLIC · T.2 to T.2e the same five facts for the new resolver, plus `provolatile = 's'` · T.3 to
T.3e the seam byte-identical AND still IMMUTABLE, and `_plan_primary_entry`,
`_plan_accrual_period_line` and `correct_accrual_adjustment` byte-identical · **T.4 the census**: the
resolver is called by exactly `_plan_admit_occurrence` · **T.4b** the override's gate as a literal,
which is how the out-of-scope line is structural · **T.4c** the resolver's own text names none of
`accounting_plan_revisions`, `accrual_adjustments`, `accrual_period_amounts`,
`prepayment_schedules`, `revenue_recognition_schedules`, `now(` — it answers from
`clara.journal_lines` alone · **T.5 reverse substitution** back to `02ea6afe…`.

The census compares against a literal built with `order by p.proname`, the catalog's own C ordering
(`proname` is `name`), so it is collation-proof by construction (sweep rule (e)). **No digest over
text-ordered row content is pinned anywhere**, and the resolver's own `order by jl.line_no` is an
INTEGER ordering.

### Apply history on this rig

1. `pnpm --filter @clara/db migrate` → `applied 0332_plan_reversal_posted_basis`, prestate printed
   **`FIRST APPLY … clara._plan_posted_entry_lines is absent`**, tail printed OK including the
   reverse substitution. **The first-apply branch of the bimodal pin was therefore exercised for
   real**, so the wave-3 addendum's hand proof was not needed; the header says exactly that.
2. The header's own redo-safety paragraph was then corrected (it had been written to promise a hand
   proof that the real first apply made unnecessary), and the file re-applied with
   **`CLARA_MIGRATION_REDO=0332_plan_reversal_posted_basis`** (`CLARA_ALLOW_DESTRUCTIVE=1`,
   `CLARA_RIG_DB=1`) → `redone … new checksum d2b3fb8e997453c7b3559efd89e423ddf7d72198086424895bc6c2f7f0f311b9`,
   prestate printed **`REDO APPLY … own output`**, tail OK. **Recorded as the work order requires.**
3. A third `migrate` → `0 new migration(s) applied · 312 total`, no drift. Ledger now **312 files,
   max `0332_plan_reversal_posted_basis`**.

---

## TDD — the slices, and the red I saw

**Slice 1 — the defect itself.** `p1074.expense.reverses_what_posted` was written first and run
against the un-migrated lane database: **RED, for exactly the right reason —**

```
the reversal undoes the 300000c that actually posted, not the 275000c the plan now states
  actual   [ [ '6100', 0, 275000 ], [ '2020', 275000, 0 ] ]
  expected [ [ '6100', 0, 300000 ], [ '2020', 300000, 0 ] ]
```

That is the ticket's own claim, measured on this rig. Then the migration (the minimal change: one
resolver, one gated override), then **GREEN**. The frontier gate and the preintegration gate module
landed with the migration in the same commit, which is the house shape for a new db test file; the
first red was run with the gate scaffolded out, and that is recorded here rather than hidden.

**Slice 2 — the other side.** `p1074.revenue`, shaped by what slice 1 taught (that the fix routes
through a side-agnostic body, so parity is the claim worth making).

**Slice 3 — the other calculation rule.** `p1074.per_period`. Written because slice 1 raised the
question "where else does the reversal's figure come from", and reading
`clara._plan_accrual_period_line` answered it: the accrual detail's highest revision, which a
correction supersedes too. It went green on the fixed body, and RED on the pre-image with `160000`.

**Slice 4 — the boundary.** `p1074.not_posted`, the out-of-scope guard. One fixture bug on the first
run (my `span()` helper produced two month-ends where three were owed); the helper was corrected to
end every window at LAST month's month end, which is what the 0193 picker's "latest accrual at or
before today" needs, and then green.

**Slice 5 — the whole basis.** `p1074.basis.only_the_lines_move`, written because slice 1 proves the
lines and says nothing about the memo, the posting date or the key set — and the estate has a
measured hazard here (`plan-occurrence-e2e.mjs` leg 5: a new top-level basis key once made the run's
echo fail the frozen tool's `.strict()` validation). The cell pins the basis's key set at exactly
`{currency, lines, memo, posting_date}`.

**Slice 6 — the catalog.** `p1074.catalog.one_resolver`.

**The vacuity control (work order rule 4), run once over the whole file.** With
`clara._plan_admit_occurrence` recut **on the rig only** back to its 0308 pre-image (sha re-measured
as `02ea6afe…` to prove the break was exact), **five of the six cells went RED**, each for its own
reason:

```
not ok 1 … the reversal undoes the 300000c that actually posted, not the 275000c the plan now states
not ok 2 … the reversal undoes the 300000c that actually posted, sides exchanged, not the 275000c now stated
not ok 3 … the reversal undoes the 200000c this period posted, not the 160,000c the restated set now names
ok   4 … (p1074.not_posted — the out-of-scope guard, correctly GREEN on both sides of the change)
not ok 5 … the admitted basis reverses the posted lines
not ok 6 … exactly ONE body reaches the resolver: the one that turns a due date into a Work
```

The subject was then restored **byte for byte** by re-running 0332's own function statement, and the
body re-measured (`5cc0fa56…` before the break and `5cc0fa56…` after the restore); all six green
again. Cell 4's green under the break is the point of cell 4 and is recorded as such in
`packages/db/tests/README.md`.

No battery of red cells was written ahead of implementation.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| my new test file, **full gate chain** (128 `--import` gate modules, mine included) | `node --test --test-concurrency=1 $GATES tests/plan-reversal-posted-basis.test.mjs` | **6 tests, 6 pass, 0 fail, 0 skipped** |
| behaviour preservation, accrual + plan part 1 (`plan-reversal-posted-basis`, `accrual-adjustments`, `accrual-correction`, `accrual-bill-conflict`, `accrual-period-amounts`, `accrual-revenue-side`, `accounting-plans`, `accounting-plan-occurrences`), full chain | as above | **109 tests, 109 pass, 0 fail, 0 skipped** |
| behaviour preservation, plan family part 2 (`plan-schedule-yield-wall`, `plan-overlap-sibling-arm`, `plan-overlap-template-arm-retired`, `plan-authority-wall`, `accrual-plan-authority-wall`, `prepayment-schedule`, `prepayment-schedule-obo`, `prepayment-occurrences`, `prepayment-wake-reroute`, `revenue-recognition`, `tenancy-rent-plan`, `depreciation-history`, `schedule-term-correction`), full chain | as above | **153 tests, 153 pass, 0 fail, 0 skipped** |
| operation census + rig isolation (I added an SQL function), **no reset flags** | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** — the skip is `T19 poison-role`, skipped *because* `CLARA_RIG_ALLOW_RESET` is unset, which is the rig rule. `T17` (exact grant matrix) and `T18` (every SECURITY DEFINER pins `search_path` and is owned by `clara_fn_owner`) both PASS with the new function. Re-run after the clone below: **29 tests, 28 pass, 1 skipped**. |
| the clock and catalog censuses that roster `_plan_admit_occurrence` (`x42b0-r7-s5-census`, `x42b0-r7-s5-clock`, `x42b2-r7-s5-census`, `x42b2-r7-s5-clock`, `x42b0-s5c-clock`, `x42b2-s5c-clock`), full chain | as above | **18 tests, 18 pass, 0 fail** — the new resolver reads no clock, so no roster entry is owed and none was added |
| web migration-pins corpus (sweep rule (d): in scope because a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` from `apps/web` | **22 tests, 22 pass, 0 fail** — confirms **no barrier entry is owed for 0332** (the corpus holds reviewed DYNAMIC-SQL barriers; 0332 is static DDL) |
| the runtime end-to-end that drives this very body through the FROZEN tool schema | `PGDATABASE=clara_rt_test WORKFLOW_POSTGRES_URL=… RELAY_TEST_MODE=1 node tests/plan-occurrence-e2e.mjs` on a **clone** of the lane database | **exit 0**, all five legs, including **`PASS 5: the reversal waited for the accrual's entry (0d45c8f6…), named it, and posted`** — the leg that proves the run's echo of the reversal basis still matches the digest admission stored |
| typecheck | `pnpm typecheck` | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | `OK — 322 frozen file(s) verified …` no manifest diff |
| migration ledger | `pnpm --filter @clara/db migrate` (third run) | `0 new migration(s) applied · 312 total`, max `0332_plan_reversal_posted_basis` |

**262 plan-family cells** were run for behaviour preservation (109 + 153). That is beyond the letter
of rule 8; I ran them because the body I recut is the ONE admission core for every plan kind, and
several of those cells compare a reversal's basis or its posted lines against the plan revision's —
which is exactly the comparison this change could have broken. All of them stay green, which is the
evidence for the README's claim that an uncorrected plan's reversal is byte-identical to before.

**The runtime e2e clone, in full** (RIG.md's own recipe, recorded because it touched the cluster):
`create database clara_rt_test template clara_l04` on the lane cluster, `pnpm --filter @clara/runtime
exec bootstrap` to provision the Workflow World **on the clone only** (never on `clara_l04`, which
is what would make `rig-isolation` T10b red, #866), the e2e run, then `drop database clara_rt_test`.
The cluster is back to `clara_l04` + `postgres` + the two templates, and `pg_roles` reads **36**
before and after (0154's cluster-wide role pin is untouched). `rig-isolation.test.mjs` was re-run
afterwards and is green. The e2e's stderr carries unrelated `chatTurn_v21` errors from chat Work
rows the clone inherited; they are not this ticket's and the e2e exited 0.

**`apps/web` and `packages/runtime` carry no source change from this ticket**
(`git diff --name-only ea77f059c^..HEAD` lists only `CONTEXT.md`, `packages/db/**` and
`packages/db/tests/accrual-revenue-side.test.mjs`), so the whole web unit suite and the browser
walks were not required and were not run. The one `apps/web` file I did run is the pins corpus,
which sweep rule (d) puts in scope for any migration change.

---

## Docs, in the same commits

* **`packages/db/README.md`** — new `## 0332` section (146 lines): the defect as measured on the
  rig, the one line of the pre-image that caused it, why the fix reads the LEDGER and not the
  revision the occurrence named (the three ways that alternative is weaker), the code of the whole
  change, why the override supersedes every per-kind arm, the refusal it clears, the measurement
  behind "nothing changes for an uncorrected plan", the rounding-line and deactivated-account
  consequences, the unreachability of the NULL belt and what makes that checkable, the reverse
  substitution, the four tail censuses, the redo record, and what the file does not do (including
  why `clara.preview_accounting_plan` is untouched). **No existing section was edited** and no
  applied migration was touched (`git show --stat` on every commit: 0003, 0009, 0193, 0223, 0225,
  0284, 0303, 0304, 0308, 0330 and 0331 are all untouched).
* **`packages/db/tests/README.md`** — a new `## A reversal reverses what its occurrence POSTED
  (#1074, …)` section describing all six cells, including why `p1074.not_posted` stays GREEN against
  the pre-image, and the non-vacuity control with its five red reasons.
* **`packages/db/package.json`** — one `--import ./tests/plan-reversal-posted-basis-preintegration-gate.mjs`,
  at the sorted position in migration order (immediately after 0331's). Minimal hunk on a shared
  file; JSON re-parsed after the edit.
* **`packages/db/tests/rig-meta.mjs`** — `PLAN_REVERSAL_POSTED_BASIS_0332_COHORT` (one name,
  `_plan_posted_entry_lines`, ungranted) with its own bimodal `cohortFailures()` call in the same
  shape as 0330's, plus the block explaining why the cohort is owed and why it is exactly one name.
  Owed here, unlike 0331: **0332 mints a name.**
* **`CONTEXT.md`** — three minimal corrections inside existing entries, no new term and no new
  heading: **"Plan occurrence"** (a reversing occurrence posts the named entry's OWN lines with the
  sides exchanged), **"Accrual reversal"** ("the same entry with both sides exchanged" is now
  literal, and the `_Avoid_` gains "reversing what the accrual says today rather than what its own
  period posted"), and **"Accrual correction"** (a period that has already POSTED is still reversed
  at the figure it posted).
  **Flagged for the merger:** `SWEEP-PLAN.md`'s shared-file table assigns `CONTEXT.md` to **L3 only,
  and only if #1049 stays in the wave**. This is the **third** L1 hunk (#1051's and #1080's were the
  first two, both in the "Authorising instruction" paragraph). Mine are in three different entries
  (`Plan occurrence`, `Accrual reversal`, `Accrual correction`), none of which the earlier two
  touched, so the four hunks are disjoint regions.
* **`packages/db/tests/accrual-revenue-side.test.mjs`** — a COMMENT-ONLY correction. `p942.correct`
  carried the sentence *"the reversal admitted after the correction is built from the LIVE
  revision's basis"* and named the gap as a follow-up `#942`'s report would file. That follow-up is
  this ticket, and the sentence is no longer true of this estate. The cell's own assertions are
  unchanged and needed no edit, because it only ever asserted the SIDE of each leg (it explicitly
  declined to assert the amount). Flagged because it is a file another lane could touch — the change
  is one comment block, no code.

---

## Successor contract

**None is owed.** This ticket touches no frozen workflow body and no module in a frozen closure
(`check-frozen-workflows.mjs` clean, 322 files), and it changes no door's name, signature, argument
order, grant, part kind or `detail.reason` vocabulary. No zod input moves. No prompt stanza moves.

What a frozen caller should know is a **behaviour** note, not a new interface, and it is the reason
`p1074.basis.only_the_lines_move` exists: the admitted basis of a plan reversal still carries
**exactly** `{currency, lines, memo, posting_date}` and nothing else. `clara._plan_posted_entry_lines`
returns `{source, entry_id, lines}`, but only its `lines` key ever reaches a basis —
`clara._plan_occurrence_basis` substitutes `lines` and ignores the rest. That matters because a new
top-level basis key is a measured failure mode in this estate: it makes the run's echo fail the
frozen tool's `.strict()` validation and the Work settles `failed / no_effect`
(`packages/runtime/tests/plan-occurrence-e2e.mjs` leg 5). The cell pins the key set, and the e2e was
run end to end on a clone and passed leg 5.

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

1. **The same defect would exist for a PREPAYMENT or RECOGNITION schedule corrected between a
   posting and a reversal — if those kinds ever gain a reversal leg.** 0332 fixes them in advance
   for free (the block is gated on a posted entry, not on a kind), and no cell of mine drives them
   because there is nothing to drive: `ck_plan_revisions_auto_reverse` (0193:561) is
   `auto_reverse = (plan_kind = 'reversing_journal')`, so a non-reversing kind cannot carry a
   reversal leg at all. Recorded so a later lane that opens one knows the basis question is already
   answered — and so the SWEEP-PLAN's "the blast radius is wider than the ticket's accrual framing"
   is read as a statement about the body rather than about what shipped broken.
2. **`clara.preview_accounting_plan` still projects a future reversal from the live revision.**
   That is correct today and deliberately out of scope (a preview only ever projects events AFTER
   the plan's last existing occurrence, so no previewed reversal can have a posted accrual behind
   it, and it already passes `null` for the reversed entry). If a surface ever previews the PAST —
   "what will this reversal post?" for an already-posted period — it must resolve the posted entry
   the way the admission core now does, or it will show the operator a figure the ledger will not
   write. One line of prose in the README's §0332 says so; a ticket would be cheap.
3. **Two wave-4 report documents pin `_plan_admit_occurrence` at `02ea6afe…`**
   (`reports/wave4-merge.md:549`, `reports/wave4-gates-A.md:281`). Nothing runs them, and an as-run
   report is a record of its own moment, so I left both alone. Recorded so a reviewer grepping the
   sha does not read them as live pins that 0332 broke.
4. **A `CLARA_MIGRATION_REDO` of 0331 after 0332 would red.** 0331's tail `T.4b` pins the predicate's
   caller roster as a literal; that is still true after 0332 (0332 adds no caller of
   `_assert_plan_authority`), so this is precautionary rather than known-broken — but 0331's `T.5`
   reverse substitution reads the installed `_accrual_plan_core`, which 0332 does not touch, so in
   fact a 0331 redo is safe. The redo mode only ever takes the highest applied version anyway.
   Recorded so nobody reads the possibility as a defect.
5. **The estate has no cell driving `clara._plan_posted_entry_lines` against an entry with more than
   two lines.** Every plan basis that ships has exactly two, so `order by line_no` on a three-line
   entry is unexercised by behaviour (it is asserted structurally: the resolver orders by an integer
   column). A cell would need a plan basis nobody configures today; cheap to add whenever one exists.

---

## Anything unverified

* **The from-scratch chain.** Not run, and deliberately not runnable here (RIG.md forbids a second
  from-scratch chain on a lane cluster; the integrator runs it on a disposable cluster). What
  supports it: 0332's prestate took its **FIRST APPLY** branch for real against the live pre-image;
  the tail's reverse substitution proves the installed body reduces to exactly `02ea6afe…`, which is
  0308's own output and 0308 applies before 0332 in file order; and `02ea6afe…` was re-grepped
  across the repository after the change — it survives only in 0332's own two pin constants and in
  two historical report documents.
* **Hosted rows I could not exercise.** Every scene in this battery is built on a fresh client of
  firm A through the real doors; no hosted state was available to me. In particular I could not
  exercise a reversal against an entry posted before 0223 existed (a basis with a different line
  shape); the resolver reads whatever `clara.journal_lines` holds, so shape drift there is answered
  by the ledger rather than by any assumption of mine, but I did not drive it.
* **The deactivated-account consequence** (row 2 of "What moves") is reasoned from
  `clara._validate_entry_lines`'s existing floor and is recorded in the README; **no cell of mine
  drove it**, because it needs a correction onto a second account pair followed by a deactivation of
  the first, which is three doors deep and outside this ticket's scope. Stated as unverified rather
  than asserted.
* **The rounding-residual consequence** (row 3) is likewise reasoned, not driven: no accrual,
  prepayment or recognition basis that ships can produce a 1..5c residual, so there is no door to
  reach it through.
* **The runtime e2e's other consumers.** I ran `plan-occurrence-e2e.mjs` because its leg 5 drives
  this body's reversal through the frozen tool schema. I did NOT run the other ten runtime e2es:
  rule 8 asks for them only when `packages/runtime` is touched, and it is not. `periodic-adjustment-e2e.mjs`
  in particular admits a `clara_l<NN>` name and would have bootstrapped a World on the lane database
  itself (#866), so it was not run.
* **The lane database is now three migrations ahead of the other lanes' databases** (312 files vs
  309). Expected; recorded so #1073, the next ticket of this lane, does not read it as drift, and so
  it knows its own prestate must pin what is live AFTER 0330, 0331 and 0332 — in particular
  `clara._plan_admit_occurrence` is now `5cc0fa56…`, not `02ea6afe…`.
