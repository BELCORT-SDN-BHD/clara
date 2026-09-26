# Riders closing wave — lane 03, ticket #1151

Branch `riders/wK-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\703`, base `ffb629d73`.
Database `clara_c03` on `127.0.0.1:55742` (untouched by this ticket — no migration, no SQL object).
Playwright triple `3620 / 3621 / 3622` (unused — this ticket touches no `apps/web` file).

Starting state, checked first per rule 1: `git status` clean, `git log --oneline ffb629d73..HEAD` =
the three #1152 commits already landed by this lane's earlier implementer
(`6ee02513d`, `05aad4851`, `3a26bc94a`). No landed work was redone.

**New head after this ticket:** `fe48906db` (`b141cf186` then `fe48906db`), two commits, both naming
`#1151`, both ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## The ticket, verified still live

`gh issue view 1151 --comments` (no comments; the body is the only Agent Brief, filed 2026-09-26
as part of this closing wave, sourced from candidates E26/E27 of the sweep wave's own
follow-up-candidates report). Both named cells still carried the exact defects the brief describes
on this branch: `packages/runtime/tests/intake-batch-e2e.mjs`'s receipt census still asserted a
blunt count with no allowance for the decision-to-sweep drift, and
`packages/runtime/tests/intake-admission-e2e.mjs`'s terminal `waitForQueueDrain` call was still
unscoped. Both were reproduced (below) before anything was changed.

## Seams tested at

- `packages/runtime/lib/rollback-preflight.mjs`'s `censusUnboundTasks(query, scope)` — the public
  function both the admission drill and `rollback-preflight.test.mjs`'s own cells call, and the one
  the ticket's "Key interfaces" names as the read boundary.
- `packages/runtime/tests/queue-drain.mjs`'s `waitForQueueDrain(rig, opts)` — the public function
  both `intake-admission-e2e.mjs` and `intake-e2e.mjs` call at their own end.
- `packages/runtime/tests/intake-batch-e2e.mjs`'s LEG 3 (`p636.batch.cancel_resume`) — the receipt
  census after the belt sweep, and the identity assertions immediately above it that already model
  the lawful seed-to-decision drift.
- The two standalone e2e drivers themselves, run end to end through `scripts/ci/world-gate.mjs`, in
  the action's own order, on a disposable world-bootstrapped database — the only honest seam for
  "the drill passes end to end."

No test at a seam the brief did not give me: no door, no migration, no `packages/runtime/workflows`
edit (confirmed clean throughout, see Gates).

## Rig built for this ticket (no lane database touched)

`clara_c03` cannot carry a bootstrapped World (RIG.md: doing so reds `rig-isolation.test.mjs` T10b
afterwards, #866) and is shared with ticket #1145 still to come in this lane. `clara_intS6` and
`clara_l02` are off limits by rule (e). A disposable WSL Postgres 17 cluster was built instead, on a
free port below 55772 that no other concurrent lane/fix-worker cluster was using at the time
(checked via `wsl -- pg_lsclusters`): `rig151`, port `55712`, trust auth, `127.0.0.1` — never
`rigl06ac3` (CLOSING-PLAN risk 2 reserves that one for LC's two-build drill).

```
wsl -- sudo pg_createcluster 17 rig151 --port=55712 -- --auth-host=trust --auth-local=trust
wsl -- sudo bash -c "echo \"listen_addresses = '127.0.0.1'\" >> /etc/postgresql/17/rig151/postgresql.conf"
wsl -- sudo pg_ctlcluster 17 rig151 start
createdb clara_151          # fresh cluster, first chain — migration 0154's role count is unaffected
PGDATABASE=clara_151 pnpm --filter @clara/db migrate    # 338/338 applied, 0001 -> 0365, exit 0
PGDATABASE=clara_151 pnpm --filter @clara/db seed       # 2 seed files, exit 0
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55712/clara_151 pnpm --filter @clara/runtime exec bootstrap
```

`clara_151` read 338 files / max `0365_accrual_register_pagination` (matching `clara_c03`'s own
head after #1152) before any World object existed, and `to_regclass('workflow.workflow_runs')`
confirmed the bootstrap afterward. Torn down at the end of this ticket:
`wsl -- sudo pg_dropcluster 17 rig151 --stop`; the shared lane cluster (`127.0.0.1:55742`) was never
migrated, seeded or bootstrapped for this ticket and reads exactly the eleven databases it had
before (`clara_c01..04`, `clara_intS..intS6`, `clara_l02`) — a stray template copy I made there
early on (`clara_151`, before deciding the disposable-cluster route) was dropped once superseded,
confirmed by re-listing `pg_database`.

A stranger firm's `held` wake task — the exact shape the admission-drill defect needs — was planted
with `packages/runtime/tests/g1-wake-bodies.fixtures.mjs`'s own `plantHeldWakeTask({ owner, client,
payload })`: no `registerSource` call, so it is born `held` with no `clara.wake_engine_sources` row
to place it, matching the ticket's own "both rows disabled" description exactly rather than a
hand-typed approximation.

## Acceptance criteria, each with its evidence

**AC1 — "The batch drill's receipt census passes when a child settles between the cancel decision
and the belt sweep, driven deliberately rather than waited for, and still fails when a child on the
worklist is genuinely skipped or decided twice."** MET.//

- *Driven deliberately*: `intake-batch-e2e.mjs` LEG 3 now forces one live child (`live[live.length -
  1]`, outside the interruption loop's own half) to `clara.settle_work_run(task, 'failed', …)`
  strictly between the decision and the belt sweep, every round — not waited for.
- *Passes with the drift*: four consecutive SOLO rounds on `clara_151` (round 2 through round 4
  below; round 1 is reported separately as a self-inflicted concurrency artifact, not evidence) —
  green every time, with the forced child settled `failed` and holding no cancel receipt every time.
  Round 3's own console line: `[p636] belt receipt census: 1 cancelled by receipt, 1 settled on
  their own (incl. the forced spontaneous child), 0 unexplained`. Round 4 (23 live children that
  round): `22 cancelled by receipt, 1 settled on their own …, 0 unexplained`.
- *Still fails when genuinely skipped*: structural, not merely asserted — `unexplained` is exactly
  the set of live children with neither a cancel receipt nor a non-cancel terminal status; a child
  left `queued`/`running` with nothing settling it is in that set by construction, and the assertion
  reds on a non-empty set.
- *Still fails when decided twice*: `clara.op_receipts`'s own primary key is `(firm_id, fn,
  op_key)`, and `childCancelKey` embeds the work id exactly once inside `op_key`, so two distinct
  receipt rows for one work id are unobservable at the database level — the new cell says this in
  its own comment rather than asserting something the schema already forbids from happening.
- **Vacuity control** (below): the old blunt count, restored with the drift still forced, reds
  every time; the file was then restored byte for byte.

**AC2 — "The admission drill passes end to end on a database that carries unrelated client data
producing held wake tasks, and the drain still fails, with its own named message, when the leg's own
work is left live."** MET, both halves, both at the standalone-driver level and at the unit level.

- *Fails first, unscoped, on unrelated data* (the control): with the stranger's held task planted
  and the PRE-FIX call site (`waitForQueueDrain(rig, { log })`, no `firmIds`), `intake-admission-
  e2e.mjs` ran all 8 legs PASS and then timed out naming exactly that one row:
  `TIMED OUT after 30000ms … unbound live tasks:
  [{"id":"c12be747-…","kind":"wake","status":"held","known":false}]` — the taskId matches the
  planted stranger's task id exactly.
- *Passes end to end, scoped, with the same row still live*: after the fix (`firmIds: [firm]`), the
  SAME leg on the SAME database with the SAME stranger row still `held` — `INTAKE ADMISSION E2E:
  PASS (8 legs …)`, `[queue-drain] drained (polls=9, waited=2561ms)`, exit 0. The stranger row was
  re-queried immediately after and read `held`, untouched — excluded, not settled.
- *Several consecutive rounds*: four rounds total on the same database, the stranger row present
  throughout — round 1 (post-fix) 2561ms/9 polls, round 2 2167ms/6 polls, round 3 2015ms/8 polls,
  round 4 7163ms/7 polls — all exit 0, all 8 legs PASS every round.
- *Still fails naming the leg's own live task*: proved at the unit level (real database, no
  standalone driver needed to sabotage its own work) — `rollback-preflight.test.mjs`'s new `#1151`
  cell scopes `waitForQueueDrain` to a firm whose OWN close_prep task is left live, and the call
  throws `TIMED OUT`, its message matching the leg's own task id and NOT matching the excluded
  stranger's id; settling the leg's own task then lets the same scoped call resolve, with the
  stranger row still `held` throughout.
- **Vacuity control** (below): the SQL firm filter disabled, the new unit cell reds naming the
  stranger row it should have excluded; the file was then restored byte for byte.

**AC3 — "Both legs run green in the action's own order on one database, several consecutive rounds,
and the rounds are reported with counts."** MET. `intake-e2e.mjs` → `intake-admission-e2e.mjs` →
`intake-batch-e2e.mjs` is `db-live-gates`'s own step order; this ticket's two touched legs were run
in that relative order (admission before batch) through `scripts/ci/world-gate.mjs`, on one database
(`clara_151`), several consecutive rounds each, reported above with polls/waited-ms (admission) and
cancelled/settled/unexplained counts (batch). `intake-e2e.mjs` itself is untouched by this ticket
(AC4) and was not re-run as part of the round sequence — its own contract is unaffected and #1152's
report does not touch it either; naming this as a residual rather than asserting coverage I do not
have.

**AC4 — "`waitForQueueDrain`'s other caller is unchanged in behaviour, asserted by running the leg
that uses it."** PARTIAL, and the gap is named. `intake-e2e.mjs`'s call site is byte-identical
(`git diff --stat -- packages/runtime/tests/intake-e2e.mjs` empty on both commits), and
`queue-drain.test.mjs`'s new wiring cell proves an omitted `firmIds` reaches the census as `null` —
SQL's own "no filter", unchanged from before this ticket. What is NOT run here: `intake-e2e.mjs`
itself, end to end, on this rig (time budget; it is the cheapest of the three legs at 3-5s per the
sweep wave's own measurements and is a safe, fast follow-up rather than a defect).

**AC5 — "The vacuity control is shown for each changed cell: seen failing against a deliberately
broken subject, then the subject restored byte for byte."** MET for both changed production files.

1. `rollback-preflight.mjs`: the firm filter's WHERE clause temporarily changed to `(true or
   t.firm_id = any($4::uuid[]))` (i.e. always-true, simulating pre-fix). The new `#1151` cell in
   `rollback-preflight.test.mjs` reds: `firmIds-scoped to the leg's own firm must exclude another
   firm's held wake row; got [{"id":"...","kind":"wake",...,"status":"held",...}, {"id":"...",
   "kind":"close_prep",...}]` — naming the stranger row it should have excluded. Restored;
   `sha256sum` before and after: `152fdaf0e560cc7a7ac18534611c99f8e627ac62ad2d13024233c96989a594b5`
   both times. Cell re-run green after restore.
2. `intake-batch-e2e.mjs`: the identity census's own assertion temporarily preceded by
   `assert.equal(cancelledWorkIds.size, live.length, "VACUITY CONTROL: …")` — the old blunt count,
   with the forced spontaneous drift still in place. Full leg run: exit 1,
   `AssertionError [ERR_ASSERTION]: VACUITY CONTROL: the old blunt count, temporarily restored`.
   Restored; `sha256sum` before and after:
   `118c1d16b7931b7f109ec73954d62852f4161634e40cc193c54c5ba26741aec8` both times. Full leg re-run
   green after restore (round 4 above).

**AC6 — `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0.** MET (Gates, below).

**AC7 — no frozen workflow body or manifest entry moves.** MET (Gates, below); nothing in
`packages/runtime/workflows`, `registry.ts`, `startWorld.ts` or `frozen-workflows.json` was touched.

## What was deliberately left

- `intake-e2e.mjs` run end to end on this rig (AC4's residual, above) — the safest, cheapest
  follow-up, not attempted here for time.
- The Wave-B fault-gate leg and the two DR steps of `db-live-gates` — explicitly out of scope per
  the ticket's own "Out of scope" (need clusters and a `pg_dump` this host does not carry).
- Neither `clara.wake_engine_sources` row was enabled, on any rig or in CI — explicitly out of
  scope.
- `censusNonTerminalRuns`/`censusFailedRuns` (`workflow.workflow_runs`) were left unscoped by
  `firmIds` — the ticket's own "Key interfaces" names only `clara.agent_tasks` and
  `clara.wake_engine_sources`, and a database `waitForQueueDrain` runs against has never had a body
  execute against it before the calling leg's own process started one (`clara_intake_ci` is always
  fresh; a rig clone's residue was seeded, not worked by a live engine) — recorded as a design
  decision in both the code comment and the README section, not silently narrowed.

## Gates, with counts

| gate | command | result |
|---|---|---|
| `pnpm typecheck` | worktree root | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | worktree root | **exit 0** |
| `FREEZE_BASE_REF=ffb629d73 node scripts/check-frozen-workflows.mjs` | worktree root | **OK** — 347 frozen files verified (append-only vs `ffb629d73`), 60 `use workflow` modules frozen+registered, 3 retired entries |
| `node packages/runtime/scripts/check-parts-parity.mjs` | worktree root | **OK** |
| touched unit test files, on the LANE database (`clara_c03`, no World — the ordinary posture) | `node --test tests/queue-drain.test.mjs tests/rollback-preflight.test.mjs` | 56 tests, **33 pass / 0 fail / 23 skip** (the pre-existing WDK-World-gated skips, unaffected in count) |
| the SAME two files, on the disposable world-bootstrapped `clara_151` (the real proof, unskipped) | same command, `WORKFLOW_POSTGRES_URL` set | 56 tests, **56 pass / 0 fail / 0 skip**, run twice consecutively with the same result |
| `intake-admission-e2e.mjs`, four consecutive rounds, `clara_151` | `node scripts/ci/world-gate.mjs tests/intake-admission-e2e.mjs` | **4/4 exit 0**, all 8 legs PASS every round, drain polls/ms reported above |
| `intake-batch-e2e.mjs`, solo (concurrency-isolated), `clara_151` | same, per round | **3/3 exit 0** (rounds 2, 3, 4 — round 1 discarded, see below), receipt census counts reported above |
| `packages/db` gate chain, `operation-census.test.mjs`, `rig-isolation.test.mjs` | not run | **not applicable** — no `packages/db/tests` file touched, no SQL function added |
| `apps/web` whole unit suite / browser walks / `firm-scope-db-pins.test.ts` | not run | **not applicable** — no `apps/web` file touched, no migration in this ticket (rule (d)) |

**Known Windows-only reds:** none encountered by this ticket's own gates.

**A discarded, contaminated round, named rather than hidden.** The very first `intake-batch-e2e.mjs`
round was launched while a SECOND, independent invocation of the same leg was still running against
the same `clara_151` database (a self-inflicted background-job accident on my part — two `Bash
run_in_background` calls issued close together). That round reported `batchCancelChildren: 0` on
what should have been a productive sweep and 7 children left genuinely unexplained — a symptom
consistent with the belt sweep contending with a second concurrent leader/engine on the same
database rather than with the fix. It was NOT counted as evidence either way; the second concurrent
run (same code) passed cleanly on its own, and every SOLO re-run afterward (rounds 2-4, and the
vacuity control) was consistent and green. I did not touch `intake-batch-e2e.mjs`'s own concurrency
handling in response to this — it is a property of running two heavy World-booting processes against
one database at once, not of the leg or the fix.

**Rig hygiene.** `clara_151` on the disposable `rig151` cluster (port 55712) accumulates live
`clara.agent_tasks` / `clara.document_processing_tasks` / `workflow.workflow_runs` rows across
`intake-batch-e2e.mjs` rounds by the file's own design (LEG 3 deliberately does not drain; §5 ends
with live rows on purpose) — this was settled between rounds when the unit-test gate needed a clean
read (documented inline above), through the estate's own lawful transitions where one exists
(`cancel`) and a direct terminal write where the door's own transition table refused one (a `wake`
task `running` cannot go straight to `cancelled`; settled `completed` instead, matching the pattern
`packages/runtime/README.md`'s own #967 section already documents for this exact rig recipe). The
whole cluster (`rig151`) was torn down at the end (`pg_dropcluster 17 rig151 --stop`); the lane's own
`clara_c03` was never connected to except as the source of an early, since-dropped, superseded
template copy on the shared cluster.

## Docs

- `packages/runtime/README.md`: new `<!-- #1151 --> … <!-- /#1151 -->` section immediately after the
  existing `#967` section it extends, covering both fixes, the measured evidence and the
  reproduction rig recipe for whoever re-runs this. Landed in the second commit.
- `CONTEXT.md`: not touched — no new domain/accounting vocabulary, only a test-infrastructure scope
  parameter.
- `apps/web/messages/en.json`, `apps/web/test/manifest.txt`: not touched — no `apps/web` file in this
  ticket.

## Successor contract

None. This ticket touches no frozen workflow body, no chat tool, no Work tool — it is entirely
`packages/runtime/lib/rollback-preflight.mjs` (a plain library function) and three
`packages/runtime/tests` files (two standalone e2e drivers, two `node --test` unit files). Nothing
here is a door, a part kind or a prompt stanza a frozen chat or Work tool would need.

## Follow-ups worth filing (I cannot file issues)

1. **`intake-e2e.mjs` was not run end to end on this rig** (AC4's residual). It is untouched by this
   ticket and the cheapest of the three legs; running it once, in sequence before the other two, on
   a fresh clone would close AC3's own gap about "the action's own order" including all three legs
   rather than the two this ticket owns.
2. **A concurrency note for whoever else runs a standalone World e2e driver on a shared rig**: two
   simultaneous invocations of the same (or a different) World-booting leg against ONE database can
   starve each other's leader/belt sweeps in a way that looks exactly like a product defect (an empty
   worklist where a full one was expected) — this cost one discarded round in this ticket's own
   evidence (above) before it was diagnosed as environmental. Worth a line in `RIG.md` or this file's
   own `README.md` #967/#1151 sections for the next agent who reaches for `run_in_background` twice.

## Anything unverified

- `intake-e2e.mjs` end to end (named above, AC4).
- The Wave-B fault-gate leg and the two DR steps of `db-live-gates` — explicitly out of scope, need
  infrastructure this host does not carry (named in the ticket itself).
- Whether hosted CI's own `clara_intake_ci` ever happens to inherit unrelated held wake tasks from
  `intake-e2e.mjs`'s own leg running first in the same job — the ticket's own scope is the drill
  passing on a database that CAN carry such rows (a rig clone), not a claim about what CI's fresh
  database does or does not produce today.
