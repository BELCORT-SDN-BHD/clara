# riders closing wave — lane L3 — FIX ROUND (one implementer, all three review axes)

**Branch** `riders/wK-lane03` · **worktree** `C:\Users\zhant\Desktop\clara-wt\703` · **base**
`ffb629d73` · **new head `2437dca83`**

**Lane database** `clara_c03` @ 127.0.0.1:55742 — 338 files, max
`0365_accrual_register_pagination`, checksum now
`4983f44a3e27e6997fd1a82c5cb181eadd148ec0c17b3cf362937c8ab86bb8a4` (0365 was redone; see FIX-1).

## Commits added by this round

| commit | subject |
|---|---|
| `74edb4d63` | `fix(db): #1152 a JSON-null cursor element is malformed, not "page one" (0365)` |
| `75d8c0a3d` | `test(web): #1152 the REGISTER renders and drives Load more, not only its hook` |
| `7466b1ee6` | `fix(runtime): #1151 the firm scope leaves the shipped library, and the batch census is bounded` |
| `2437dca83` | `test(web): #1152 the load-more cell states its cursor id instead of indexing the fixture` |

The four commits from the build round (`6ee02513d` … `aec3f45d7`) are untouched.

## Verdict per finding

| id | severity | verdict |
|---|---|---|
| ADV-01 | major | **FIXED** — reproduced at the door, guard added, 0365 redone, four cases added |
| SPEC-K3-01 | major | **FIXED** — a render-level Load more cell, with its vacuity control |
| SPEC-K3-02 | major | **PERFORMED and RECORDED** — `intake-e2e.mjs` run twice through `world-gate.mjs`; exit 1 both times, on rows that are provably not the leg's; the behaviour-unchanged half is now proven structurally instead |
| SPEC-K3-03 | major | **FIXED** — the shipped library is byte-identical to the base again |
| SPEC-K3-04 | major | **FIXED** — the cell ran **unskipped**, 48/48, on a world-bootstrapped clone |
| SPEC-K3-05 | minor | **FIXED** — the deleted observable is restored as an assertion |
| SPEC-K3-06 | minor | **FIXED** — the drive asserts its own precondition and the settle fails loudly |
| SPEC-K3-07 | minor | **FIXED** in the durable artifact; the two ticket reports are superseded by §7 below |
| ADV-02 | minor | **FIXED** — the fixture sends explicit nulls, and the defaults are read off the catalog |
| ADV-03 | minor | **FIXED** — a revenue row, interleaved, with a control and a vacuity drill |
| ADV-04 | minor | **FIXED** (same slice as SPEC-K3-06) |
| ADV-05 | minor | **FIXED** — the tolerance is bounded by a snapshot taken one query before the belt |
| STD-1 | minor | **STAYS**, with reasons — §8 |

---

## FIX-1 · ADV-01 — a JSON-null cursor element was admitted (major, #1152)

**Reproduced** before touching the migration. Four cases added to `p1152.cursor.malformed`; the
first one red for exactly the right reason:

```
not ok 4 - p1152.cursor.malformed …
  error: 'a malformed cursor (every tuple element JSON null): expected SQLSTATE CLR10
          but the call SUCCEEDED (no error)'
```

and the mechanism confirmed on `clara_c03` directly:
`select array['a','b','c']::text[] < array[null,null,null]::text[]` → **true**, so the cursor
predicate `s.sort_tuple < v_cursor` admitted every row.

**The fix** (`packages/db/migrations/0365_accrual_register_pagination.sql`, §W): after the
`array_agg`, and **before** the cast probe (which cannot see the case, because `NULL::date`,
`NULL::timestamptz` and `NULL::uuid` all cast without raising):

```sql
if v_cursor[1] is null or v_cursor[2] is null or v_cursor[3] is null then
  raise exception 'the accrual register cursor is malformed' using errcode='CLR10',
    detail='{"reason":"accrual_cursor_malformed","field":"cursor"}';
end if;
```

plus a tail assertion pinning that line by name (`§T 3`), so a later recut cannot drop it silently.

**Re-applied with the supported redo path**, as the prompt permits for an unmerged migration:
`CLARA_MIGRATION_REDO=0365_accrual_register_pagination pnpm --filter @clara/db migrate` on
`clara_c03` → `redone 0365_accrual_register_pagination · new checksum 4983f44a…`, prestate took its
own "my own body is already live" branch, tail OK. **No new migration number was taken**, and
`0380` upward remains untouched — the orchestrator was not asked for one because none was needed.

**Green after:** `packages/db/tests/accrual-register-pagination.test.mjs` 5/5 (9 malformed shapes:
five structural, four carrying a JSON `null`).

**Docs:** `packages/db/README.md` § `0365` gains "A SECOND NULL trap in the same guard", with the
measured duplicate-row consequence and the new checksum; the redo count there is corrected from
once to twice.

**Rule (d):** a migration file changed, so `apps/web/tests/firm-scope-db-pins.test.ts` was re-run:
**22 pass / 0 fail / 0 skip**. No barrier entry was owed and this was measured rather than assumed
— the three `execute`/`format` matches in 0365 are `grant execute`, a comment and a `raise
exception` message; there is no `EXECUTE`-of-a-string and no `pg_get_functiondef` splice.

---

## FIX-2 · ADV-02 — the "six-argument call" was a three-argument call (minor, #1152)

`listAccrualAdjustments` appended a parameter spec only when its value was non-null, so AC2's
"EXPLICIT NULLS, the six-argument shape" rendered byte-identically to the three-argument call above
it. The fixture now takes `explicitNulls`, which emits every optional parameter whatever its value,
and the cell uses it.

The claim the comment actually made — *that the defaults are null and not something that renders
the same today* — is now asserted where it lives, off the catalog:

```
pg_get_expr(proargdefaults, 0) = "NULL::text, NULL::jsonb, NULL::integer",  pronargdefaults = 3
```

which is the line that would red on a `p_limit` default of 50. (Measured on `clara_c03`.)

---

## FIX-3 · ADV-03 — the side-composition cell had no row of the other side (minor, #1152)

`p1152.page.composes_with_side` created three expense accruals and no revenue accrual, so
`every(r => r.side === 'expense')` was true of a door with no `p_side` predicate at all.

The cell now builds a genuinely two-sided client (the `freshTwoSideClient` shape
`accrual-list-side-filter.test.mjs` uses) and **interleaves** the revenue row into the unfiltered
order — expense at months 1, 3 and 4 back, revenue at month 2 — with a control that proves it:

```
unfiltered, limit 2  →  ["expense", "revenue"]
```

so the revenue row demonstrably sorts *inside* the expense walk. It then asserts the walk never
carries it, and drives the revenue side too (AC3's other half).

**Vacuity control, run for real.** `pg_get_functiondef` of the live door was re-issued as
`clara_fn_owner` with `and (p_side is null or a.side = p_side)` replaced by `and (true)`:

```
not ok 3 - p1152.page.composes_with_side …
  error: 'every row on a side-filtered page carries that side'
```

The body was restored **byte for byte** by a migration redo (not by hand), and the battery is 5/5.

---

## FIX-4 · SPEC-K3-01 — nothing rendered or drove Load more (major, #1152)

AC5 names the register. `1152.list.loadMore` was added to
`apps/web/components/accruals/accruals-list.test.tsx` in the sibling register's own shape
(`activity-feed.test.tsx` finds the BUTTON and clicks it):

- a 50-row first page (the hook's `PAGE_LIMIT`) with a `next_cursor`;
- the first request body asserted to carry `p_limit: 50`;
- the control found, asserted **enabled**, then clicked through `clickButton`;
- the **second** request body asserted to carry the first page's own cursor back verbatim — the
  mock answers a second page *only* to a caller that echoed it, so a component that rendered a
  control but never carried the cursor forward reds here;
- the second page's rows asserted **appended** to the first page's, which is still on screen;
- the control asserted **gone** after the short page.

**Vacuity control:** with `{hasMore ? (` replaced by `{false ? (` the cell reds at "a full first
page renders a Load more control"; `accruals-list.tsx` was restored byte for byte (`git diff`
empty) and the file is 7/7.

Not done, and deliberately: `apps/web/e2e/accrual-mock.mjs` still answers `next_cursor: null` in one
page. That is the build round's own disclosed scope line and widening it would put a second page
into a browser walk this fix round was not asked to change. Carried as follow-up 1.

---

## FIX-5 · SPEC-K3-03 — a shipped library edited by a test-only ticket (major, #1151)

`packages/runtime/lib/rollback-preflight.mjs` is **byte-identical to `ffb629d73` again**:

```
$ git diff ffb629d73..HEAD --stat -- packages/runtime/lib/
(empty)
```

The narrowing moved into `packages/runtime/tests/queue-drain.mjs`, where #1151's own Key interfaces
put it. `waitForQueueDrain` calls `censusUnboundTasks(query)` exactly as every other caller does and
narrows its **answer** with one further statement (`narrowTasksToFirms`), issued only when a caller
named `firmIds`:

```sql
select 'clara.agent_tasks' as tbl, t.id::text as id   -- queue-drain firm scope
  from clara.agent_tasks t
 where t.id = any($1::uuid[]) and t.firm_id = any($3::uuid[])
 union all
select 'clara.document_processing_tasks' as tbl, d.id::text as id
  from clara.document_processing_tasks d
 where d.id = any($2::uuid[]) and d.firm_id = any($3::uuid[])
```

Three properties fall out and are asserted:

- **an omitted `firmIds` issues no statement at all**, so an existing caller's answer cannot have
  moved — a stronger guarantee than the old "the 4th bind is null" argument;
- **an empty array is refused BY NAME** (ADV-06's footgun, which arrived in the same code I was
  rewriting): `firm_id = any('{}')` matches no row, so it would have reported DRAINED over a full
  database;
- **a census table the narrowing cannot place fails closed**, naming it. This branch is
  unreachable today (`censusUnboundTasks` emits exactly two labels) and therefore carries **no
  cell**; it is stated here rather than tested through an internal collaborator.

`queue-drain.test.mjs`'s two bind-parameter cells are replaced by four that drive the gate and
assert the **answer** against an in-memory two-firm database: scoped it drains past a stranger's
live row; unscoped on the same rows it times out naming that row; scoped it still fails naming the
leg's own row and never the excluded one; and the empty array is refused before any poll.
**Vacuity control:** with `narrowTasksToFirms` returning its input unchanged, cells 7 and 9 red;
restored, **10/10**.

`rollback-preflight.test.mjs`'s `637.pf: #1151` cell is reshaped to the new seam: it drives the
gate, and reads `censusUnboundTasks` only as the corroborating "both rows really are live and
unscoped-visible" half — including, after the scoped drain resolves, an assertion that the shipped
census **still reports the stranger's row unscoped**, i.e. that #1151 added no scope to it.

The build round's report claim that the ticket's "Key interfaces" names `rollback-preflight.mjs` was
false. It does not; it names `queue-drain.mjs:105`. That sentence is withdrawn here and the module
is no longer touched, so no ruling is owed by the orchestrator.

---

## FIX-6 · SPEC-K3-04 — the AC2 cell skipped everywhere it could run (major, #1151)

Measured first: on `clara_c03` only `to_regclass('workflow.workflow_runs')` is absent (the other
four probes in `preflightReady()` are all true), so the skip is the WDK world and nothing else.

A disposable world was therefore built and the file run on it:

```
create database clara_rt_test template clara_c03          (on 55742, the lane's own cluster)
WORKFLOW_POSTGRES_URL=…/clara_rt_test pnpm --filter @clara/runtime exec bootstrap
node --test tests/rollback-preflight.test.mjs
  →  # tests 48   # pass 48   # fail 0   # skipped 0
```

with `637.pf: #1151` among the 48. A final confirmation run of both runtime files on the same
clone: **58 tests, 58 pass, 0 skipped**. On `clara_c03` the same two files read 58 / 35 pass /
23 skip, which is the world-absent shape and is reported as such.

The clone was **dropped** afterwards (`drop database clara_rt_test`); the cluster's `clara%` role
count read **20 before and 20 after** (the bootstrap mints no role), and the eleven other databases
on 55742 are exactly as they were. No other lane's database was opened at any point.

The reviewer's second branch — adding the bootstrap to `.github/actions/db-estate-suite` so the cell
stops skipping in CI — was **not** taken: it is CI infrastructure outside #1151's scope ("the rest
of `db-live-gates` … stays CI's to prove"), it changes a step every lane's suite runs, and it cannot
be verified from this host. Carried as follow-up 2, which is the highest-value one in this report.

---

## FIX-7 · SPEC-K3-05 / SPEC-K3-06 / ADV-04 / ADV-05 — the batch drill

**SPEC-K3-05, "decided twice".** The deleted observable is restored as an assertion rather than a
comment:

```js
assert.equal(opReceipts.rows.length, cancelledWorkIds.size, …)
```

A `Set` of work ids collapses duplicates by construction; this line is what the removed
`count(*) === live.length` actually carried.

**SPEC-K3-06 / ADV-04, the drift.** The drive was `if (spontaneousTask) { await settleRun(…).catch(() => {}) }`
while the assertion on it was unconditional, so a child with no `current_task_id` — or a settle the
door refused — reddened the leg with a message blaming the belt. Now: the precondition is asserted
by name, the settle is awaited **unguarded**, and the child is proven terminal **before** the belt
reads.

**ADV-05, the bound.** "Settled on its own" was unbounded. The leg now snapshots every child's
status **one query** before the belt call; every child non-terminal at that instant — the set the
belt's own worklist offers — must carry a receipt afterwards. Only a child already terminal when
the belt read is lawfully receipt-less, which is the correct semantics and the reviewer's own
proposal. The window shrinks from the whole decision-to-belt span (this leg's half fan-out of
transactions, which is what reddened it at 3 of 7) to a single round trip.

**Vacuity control, run for real.** With the belt call replaced by
`{batchCancelOk:true, batchCancelSettled:0, batchCancelChildren:0}`:

```
AssertionError: every child STILL LIVE when the belt read must carry a cancel receipt
  — 47 were live, 47 have none: [ … 47 rows, each before:"queued" now:"queued" … ]
```

The call was restored byte for byte and the leg is green again.

---

## FIX-8 · SPEC-K3-02 — `intake-e2e.mjs` was never run (major, #1151)

It was run, twice, through `scripts/ci/world-gate.mjs` on the world-bootstrapped clone. **Both runs
exited 1, and neither failure is this lane's.** Every one of the leg's own assertions passed; the
throw is from the very last statement before its PASS line, the **unscoped** `waitForQueueDrain`:

| run | exit | what held the drain open |
|---|---|---|
| 1 (as cloned) | 1 | `autoDraft_v10` non-terminal since **2026-09-25**, plus queued `accounting_work` tasks of the estate |
| 2 (residue settled) | 1 | eleven `chat_turn` tasks `awaiting_input`, created **2026-09-25T17:38**, one estate firm |

Both sets are dated before the run that reported them, so they are the estate's, not the leg's. And
the run produced a measurement #1151 did not have: **one run of an intake leg on a used estate
minted 799 `held` wake tasks across 365 distinct firms inside one second**
(`19:38:02.144` → `19:38:03.113`), none of which any engine in that process can ever clear. That is
candidate E27's mechanism, quantified.

So AC4's stated method cannot produce a green here, by the ticket's own design: #1151 scopes the
**admission** leg and says in as many words that "the other caller in the same chain keeps working
unchanged". What AC4 actually asks — that the other caller is unchanged in behaviour — is now
proven far more strongly than by a run, because FIX-5 makes it structural:
`packages/runtime/lib/rollback-preflight.mjs` is byte-identical to the base, `intake-e2e.mjs` passes
no `firmIds`, and with `firmIds === null` the new code issues no statement and returns the census's
own object unchanged.

**Follow-up 3** records the open question this surfaced: `intake-e2e.mjs`'s unscoped drain can never
finish on a used estate, and the fix is the `firmIds` it now has available — a decision for the
orchestrator, not a widen a fix worker may take.

---

## §7 · SPEC-K3-07 — the round counts now agree, and every figure is a round that ran

`packages/runtime/README.md` is the durable artifact and it is corrected there. The old text claimed
"6-9 polls / ~2-2.6s every time, three consecutive rounds" (a range the build round's own fourth
round at 7,163 ms fell outside) and "Three consecutive solo rounds". Both are replaced by measured
rounds only, with no range claimed beyond them. The two ticket reports
(`waveK-lane03-ticket1151.md`) are **superseded by this section**; they were not rewritten, because
the fix round writes one report.

All of the following ran on `clara_rt_test` — a world-bootstrapped template copy of `clara_c03`
carrying **1,715 `held` wake tasks across 365 other firms**, a harder database than CI's fresh
`clara_intake_ci`:

**Admission leg (`intake-admission-e2e.mjs`), 4 green rounds:**

| round | exit | drain |
|---|---|---|
| 2 | 0 | 6 polls / 2,499 ms |
| 3 | 0 | 5 polls / 1,935 ms |
| 4 | 0 | 4 polls / 1,968 ms |
| ordered (after the batch leg) | 0 | 6 polls / 2,780 ms |

Round 1 exited 1 and is reported, not hidden: it failed on `censusNonTerminalRuns` — seven
`claraWork_v6` runs parked by the **batch** rounds I had run before it, which is the wrong order
(the action runs the batch leg last, precisely because it ends with live rows by design). The
unbound-task census read `[]` in that same failure, i.e. **the firm scope worked**: all 799 stranger
wake rows were already excluded.

**Batch leg (`intake-batch-e2e.mjs`), 4 green rounds:**

| round | exit | receipt rows / distinct work ids | live at the belt read | settled on their own | unexplained |
|---|---|---|---|---|---|
| 1 | 0 | 94 / 94 | 47, all with a receipt | 1 | 0 |
| 2 | 0 | 94 / 94 | 47, all with a receipt | 1 | 0 |
| 3 | 0 | 83 / 83 | 41, all with a receipt | 1 | 0 |
| ordered | 0 | 94 / 94 | 47, all with a receipt | 1 | 0 |

**Both legs in the action's own order on one database:** admission exit 0, then batch exit 0.
(A first attempt at the ordered pair failed at the admission leg's `leg 1(b)` — "the classify task
itself reaches DONE … timed out; last={status:queued}" — with 2,040 queued `classify` and 846 queued
`ocr` tasks accumulated on that clone from eight previous full e2e runs. That is a throughput
artefact of re-using one non-CI-shaped database, not an assertion about either drill; the backlog
was settled and the ordered pair re-run green. It is reported because a reader re-running this needs
to know it, and `packages/runtime/README.md`'s "Reproduction rig" paragraph now says so.)

---

## §8 · STD-1 — the judgement call, and why it stays

**It stays.** Three reasons, in order of weight.

1. **The remedy is not available to a fix worker.** `6ee02513d` and `05aad4851` are landed commits
   on a branch the integrator will merge; rule 1 of the work order says "never redo landed commits;
   continue from them". Interleaving them would mean rewriting history that three review reports
   already cite by hash.
2. **The reviewer's own evidence says the loop was red-green**, and the required_fix says "None
   required for this ticket given precedent". The migration was exercised against real tests and
   fixed before its final commit (the `IS DISTINCT FROM` trap, recorded in `packages/db/README.md`),
   and the split mirrors #1075/0334 (`705520ed9` then `c6355d4ef`) in the same family.
3. **This round's own commits are the counter-example the house law wanted.** Every fix here landed
   as one commit carrying the red, the change and the green together — `74edb4d63` names the red
   ("expected SQLSTATE CLR10 but the call SUCCEEDED"), the guard and the redo; `7466b1ee6` names
   two vacuity controls and their restores.

What I would keep from the finding is its `required_fix`, unchanged: the house law should say
whether a migration's own §0/§T structural cells satisfy rule 4's loop on their own. That is a
WORK-ORDER edit, not a lane edit. **Follow-up 4.**

---

## Gates, with counts

| gate | result |
|---|---|
| `packages/db` — `accrual-register-pagination.test.mjs` | **5 pass / 0 fail / 0 skip** |
| `packages/db` — the touched-fixture cone (12 files) + `operation-census` + `rig-isolation`, full `$GATES` chain | **171 tests, 170 pass / 0 fail / 1 skip** — the skip is `T19 poison-role`, which needs `CLARA_RIG_ALLOW_RESET` and is never run here |
| `apps/web` — whole unit suite (`node scripts/run-tests.mjs`) | **5,253 tests, 5,251 pass / 0 fail / 2 skip** |
| `apps/web` — `tests/firm-scope-db-pins.test.ts` (rule d) | **22 pass / 0 fail / 0 skip** |
| `apps/web` — `components/accruals/accruals-list.test.tsx` | **7 pass / 0 fail** |
| `packages/runtime` — `queue-drain.test.mjs` + `rollback-preflight.test.mjs` on `clara_c03` | **58 tests, 35 pass / 0 fail / 23 skip** (no world) |
| `packages/runtime` — the same two on the bootstrapped clone | **58 tests, 58 pass / 0 fail / 0 skip** |
| `node scripts/check-frozen-workflows.mjs` (`FREEZE_BASE_REF=ffb629d73`) | **OK — 347 frozen files, append-only; 60 modules frozen+registered; 3 retired** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `pnpm typecheck` | **Done** (both projects) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| browser walk | **none owed** — no `apps/web` e2e spec, mock or component changed in this round |

**Frozen law (rule a):** `git diff ffb629d73..HEAD --name-only -- packages/runtime/workflows
registry.ts plugins/startWorld.ts frozen-workflows.json` is **empty**, and so is the same diff
against the real paths under `packages/runtime/`.

**Shared files:** this round touched none of them. No new `apps/web` test file, so
`apps/web/test/manifest.txt` is unchanged; no new i18n key, so `apps/web/messages/en.json` is
unchanged; no new gate, so `packages/db/package.json`'s `$GATES` is unchanged; `rig-meta.mjs`
unchanged. `packages/db/README.md` and `packages/runtime/README.md` were edited **inside this lane's
own sections only**.

---

## Successor contracts

**None new.** Nothing in this round needs anything from a frozen `chatTurn`, `claraWork` or
`statementFacts` body, and LC's roster is closed to additions.

---

## Follow-ups worth filing

1. **The accrual browser walk never sees a second page.** `apps/web/e2e/accrual-mock.mjs` hard-codes
   `next_cursor: null` and ignores `p_limit`, so `accrual-walk.spec.ts` exercises the server-side
   side filter but never the page. The unit cell added in FIX-4 covers the render and the click; a
   walk that pages is a separate, disclosed scope.
2. **The runtime half of `db-estate-suite` has no World, so 23 cells skip in CI** — including the
   one carrying #1151's AC2. `.github/actions/db-estate-suite/action.yml` runs `@clara/runtime`
   against `clara_runtime_ci` with no `pnpm --filter @clara/runtime exec bootstrap` step anywhere.
   This is the same silent-skip shape #1145's README paragraph documents and gate C measured (22
   lane-L6 cells). Highest-value follow-up in this report.
3. **`intake-e2e.mjs`'s unscoped drain can never finish on a used estate**, measured in FIX-8: one
   run mints 799 `held` wake tasks across 365 firms that nothing can clear. #1151 deliberately left
   this caller alone; whether it should now take the `firmIds` it has available is an orchestrator
   decision.
4. **House law on migrations and rule 4** — STD-1's own `required_fix`: say whether a migration's
   §0/§T structural cells satisfy the red-green loop on their own, so future db tickets and
   reviewers are not inferring it from commit messages.
5. **ADV-07 (note, not assigned).** `p_limit` above the 500 clamp truncates silently and the
   envelope does not echo the effective limit. Nothing live is affected (`apps/web` sends 50) and
   the fix must be a later migration, never an edit to 0365.
6. **ADV-08 (note, not assigned) — left deliberately, and NOT as a one-liner.** Making `reload`'s
   `setLoading(false)` unconditional, as the note proposes, would break the reload-supersedes-reload
   case it was written for: a superseded reload would clear the flag of the reload that replaced it.
   The honest fix is a second epoch, one per operation, which is a redesign of the hook's
   concurrency and larger than a fix round should take on an unassigned note. The reviewer's own
   analysis agrees it is unreachable through today's single caller, because `DataState` unmounts the
   button for the whole of a reload.
7. **ADV-09 (note, not assigned).** `loadAccruals`'s `return answer ?? empty` no longer coalesces a
   missing `accruals` array, so a 200 with a body lacking that key throws a `TypeError` instead of
   rendering the empty register. One line, but outside the assigned list; recorded rather than taken.
8. **SPEC-K3-09 (note, #1145).** `RIG.md`'s interim bootstrap paragraph was left in place, departing
   from #1124's own precedent (`1d91f1839` redirected the rig copy at the README). This was the
   orchestrator's call to make and is left to it.

## Anything unverified

- **The from-scratch chain for 0365 is still the integrator's** (SPEC-K3-08, permitted by
  CLOSING-PLAN risk 1). 0365 changed in this round, so the integrator's gate-A run is now testing a
  different file than the review did — the checksum to expect is
  `4983f44a3e27e6997fd1a82c5cb181eadd148ec0c17b3cf362937c8ab86bb8a4`.
- **The fail-closed branch in `narrowTasksToFirms`** is unreachable through the public gate today
  and carries no cell, by choice (FIX-5).
- **Nothing in this round was run on the Linux runner.** `CI=true GITHUB_ACTIONS=true pnpm lint` is
  exit 0 here; the three runtime test files this round touched are `queue-drain.mjs`,
  `queue-drain.test.mjs`, `intake-batch-e2e.mjs` and `rollback-preflight.test.mjs`, and the wave-3
  addendum asks the integrator to re-run new runtime test files once under WSL as `runner`.
  `queue-drain.test.mjs`'s new cells are pure in-memory and depend on no path, no spool and no
  leftover row; the two e2e drivers already set `CLARA_SPOOL_DIR` through their own scratch
  directories.
