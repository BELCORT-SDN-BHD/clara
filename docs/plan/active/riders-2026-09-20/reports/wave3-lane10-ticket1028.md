# Wave 3 · Lane 10 · Ticket #1028 — DONE

Branch: `riders/w3-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`ffe63a0dd084e99b84c1368119845be273c421ce`. At session start `git status` was clean and
`git log ffe63a0dd08..HEAD` showed 19 commits, ending at `90064494f`, naming `#1015` (4 commits),
`#1016` (1), `#1018` (7) and `#1023` (7) — all four of this lane's earlier tickets already landed
and committed, matching the prompt's own claim. Nothing left over to resume.

## Commit (1, named `#1028`)

```
3f15508b4 fix(runtime): #1028 stop LEG 4's disjointness check from racing the engine
```

`git diff --stat 90064494f..HEAD`: 2 files changed, 142 insertions(+), 19 deletions(-) —
`packages/runtime/tests/intake-batch-e2e.mjs` (+114/-19), `packages/runtime/README.md` (+47/-4
inside the +47). Working tree clean at the end (`git status --porcelain` empty). **No migration
applied or written** — matches the ticket's own prestate ("This ticket is expected to need NO
migration") and touches no `packages/db` file at all; the change is a standalone runtime e2e driver
plus its own docs, no product code.

## Ticket

`gh issue view 1028 --repo BELCORT-SDN-BHD/clara` (the `--comments` flag itself returned no output on
this host for unrelated reasons — a plain `view` carries the full body and reports `comments: 0`, so
the issue body's own "Agent Brief" is the only, and therefore newest, contract). No owner-ruling
comment dated 2026-09-20 exists. Title: "CI live gates: the intake batch e2e can lose its poisoned
firm's children to the World before the belt is observed (third race)" (bug, ready-for-agent). Filed
verbatim from `docs/plan/active/riders-2026-09-20/reports/wave1-ci-gates-1026-1027.md`'s "The third
race: a ticket body for the orchestrator to file" — confirmed by diffing the issue body against that
report's drafted text; byte-identical.

**Verified still live on this branch** at session start: `packages/runtime/tests/intake-batch-e2e.mjs`
still carried the exact code the ticket describes — LEG 4's disjointness check read
`assert.equal(pFinal.state, "cancelling", …)` unconditionally (confirmed by reading the file before
any edit; line numbers shifted from the report's own citations because #1018 inserted the shared
`local-db-gate.mjs` call above it, but the assertion itself was byte-identical). The gap the ticket
names was still open.

## Seams (written before the first change, per /tdd)

- **The leg's LEG 4 disjointness check** in `packages/runtime/tests/intake-batch-e2e.mjs` — the one
  public surface the ticket names. Nothing outside LEG 4 was touched, and no product code changed.
- **The gate's own poisoned fixture**: `seedChildren(P, pBatch, 2)` and `applyPoison()` — read, not
  changed; the ticket's brief instructed keeping firm P's children live OR making the assertion
  precise, and this reads the children's own Work status rather than altering how they are built.
- **The cancellation belt's per-parent outcome and blocked counter**
  (`reconcileIntakeBatchCancellations`, `clara.get_intake_batch(...).cancel_blocked`) — read-only;
  their meaning is untouched, proved by the vacuity control below.
- **The leg's own failure message** (`leg4Diagnosis`) — extended with the raw child census on the new
  branch, not restructured.

## Each acceptance criterion, with its evidence

Every run below is on a throwaway clone of this lane's own migrated database (`clara_l10`, WSL 2,
Ubuntu, user `runner`, `/opt/node/bin/node` v22.23.2, PostgreSQL 17.11 on `127.0.0.1:55750`), created
with `createdb -T clara_l10 clara_<NNN>` (no open connection to the source), the Workflow World
bootstrapped fresh on each (`pnpm exec bootstrap`), dropped after. **All ten throwaway databases
(`clara_701`–`clara_710`, plus one mis-named `clara_` from a shell-quoting slip) were dropped; the
cluster is back to exactly `clara_l10`, verified by `select datname from pg_database where datname
like 'clara%'` after the last run.** `clara_l10` itself was never written to — confirmed both by
`select to_regclass('workflow.workflow_runs') is not null` reading `f` before and after this session,
and by `git status`/no connections at clone time.

**An environment defect found and fixed before any of this could run, unrelated to #1028.** The
worktree's pre-built `packages/runtime/.output/server/index.mjs` (Sep 20 04:09) predated the
worktree's own source files (Sep 20 22:53) by ~19 hours. Running the leg against the stale bundle
made LEG 5 (the capacity wall, out of this ticket's scope) fail — `refused.status` read `201`
instead of `429` — because the bundled route handler predated the #965 refusal-propagation code
already on disk. `pnpm run build` (nitro) rebuilt it once at session start; every run below is
against the rebuilt bundle. **Follow-up worth flagging to the orchestrator**: any other lane running
a World-booting leg under WSL against a worktree whose `.output` was built before the worktree's
current `HEAD` will hit the same false leg-5 red; it is a rig/build-freshness issue, not a product
defect, and is out of #1028's own scope to fix generally.

> **AC1 — "The leg's disjointness assertion no longer depends on the engine being slower than the
> leg."**
> The check now branches on `pFinal.state === "cancelling"` (unchanged, unpolled) vs. every other
> state, and the other branch is decided by whether firm P's children are ALL terminal
> (`TERMINAL_WORK` — `completed/refused/failed/cancelled/expired`, read fresh from
> `clara.accounting_work`), never by elapsed time. Proved directly: the SAME fixed code passes
> whether the engine wins the race (below, `engine_wins` fault, children terminal in 5051 ms) or
> loses it (the five clean runs, children still live when the leg finishes, `clara_706`–`710`).

> **AC2 — "A poisoned parent whose children the engine has finished is either prevented or reported
> as a correct outcome, never as an assertion failure that reads like a belt defect."**
> Reported, not prevented (the brief's own "either/or"; preventing it would touch the fixture's
> timing or the World, both out of scope). Verbatim log line, throwaway `clara_703`:
> `[p636] LEG4 firm P's parent reached 'cancelled' because the World finished its own children first
> (the #1028 race, not a belt defect) — refusals were still COUNTED (2) and ATTRIBUTED (blocked=1,
> door read canceller_not_active during polling) before the engine got there.` No exception thrown;
> the leg reaches `ALL LEGS PASSED` in the same run.

> **AC3 — "What the leg proves today is unchanged: the belt never claims ignorance about the whole
> estate because one firm refuses, the refusals are counted and attributed to the poisoned firm, and
> the healthy firm swept in the same call still reaches its terminal state."**
> None of the three earlier assertions were touched: `batchCancelOk` is still asserted on every
> sweep, `pWatch.refusals >= 1` / `pWatch.blocked >= 1` / `doorVerdict === "canceller_not_active"`
> still gate the P-loop before the disjointness check is ever reached, and `qWatch.state === "cancelled"`
> is still asserted unconditionally. Evidence the discriminator still works and still runs FIRST: the
> broken-belt vacuity control (below) reds at the P-loop's own deadline, never reaching the
> disjointness check at all.

> **AC4 — "The change is proved by a deliberately slowed run in which the engine does finish the
> poisoned firm's children, which passes, and by a deliberately broken belt, which still reds."**
> Both, plus the counterpart the ticket implies (the pre-fix code reds under the same fault) and the
> full five-run acceptance:
>
> | # | db | code under test | fault | result |
> |---|---|---|---|---|
> | 1 | `clara_704` | **pre-#1028** (temporarily reverted, restored after) | `CLARA_P636_LEG4_FAULT=engine_wins` | **RED** — children terminal in 6205 ms; `AssertionError […] actual: 'cancelled', expected: 'cancelling'` |
> | 2 | `clara_703` | fixed | `CLARA_P636_LEG4_FAULT=engine_wins` | **PASS** — children terminal in 5051 ms; logged as the correct outcome (AC2 quote above) |
> | 3 | `clara_705` | fixed, belt broken (`fanOutCancel`'s `refused.push` → `cancelled.push`, restored byte-for-byte after — `git diff` empty, confirmed) | none | **RED** at the P-loop's own deadline: `refusals=0 blocked=0` after 9 sweeps in 5604 ms — the disjointness check is never reached |
> | 4–8 | `clara_706`…`710` | fixed | none | **5/5 PASS**, each logging `LEG4 firm P is honestly still stopping — a live child remains` (the ordinary, unpolled path, unchanged) |
>
> Row 1 is the vacuity control on the FIX itself, in the house shape (work order rule 4: "show the
> new cell FAILING against a deliberately broken subject once, then restore the subject byte for
> byte") — here the "deliberately broken subject" is a temporary revert of just the disjointness
> branch, `engine_wins` kept, confirmed restored via `node --check` + `eslint` + a final `git diff`
> showing only the intended, permanent change.

> **AC5 — "The gate passes five consecutive runs against a freshly provisioned database."**
> Rows 4–8 above: `clara_706`, `707`, `708`, `709`, `710`, each a fresh clone + fresh World bootstrap,
> 5/5 PASS, no fault.

**Out of scope, respected.** The cancellation belt's behaviour, counters and receipt shape: untouched
(verified by the broken-belt control reproducing the SAME `refusals=0 blocked=0` signature #1027's
own vacuity control produced). The two #1027 convergence fixes: untouched (their own P/Q deadlines,
poll shape and messages are byte-identical except for the two stale cross-references corrected — see
Docs). The gate's other legs: not touched; LEG 5's stale-bundle false-red was an environment fix
(rebuilding `.output`), not a code change to LEG 5 itself. The gate's workload: unchanged — still two
firms, two children each.

## Gates, with counts

| gate | command | result |
|---|---|---|
| The leg itself, all scenarios above | 8 runs total (1 pre-fix red, 1 fixed+fault pass, 1 broken-belt red, 5 clean pass) | every result matches AC4/AC5 exactly, quoted above |
| Syntax | `node --check packages/runtime/tests/intake-batch-e2e.mjs` | OK, after every edit including the temporary revert and its restore |
| Lint, this file alone | `npx eslint packages/runtime/tests/intake-batch-e2e.mjs` | clean, no output |
| Lint, the whole `packages/runtime` package | `npx eslint .` (from `packages/runtime`) | clean, no output |
| Lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root) | **exit 0**, full chain including `world-gate.selftest.mjs`, both `dsn-pipe` selftests, `check-frozen-workflows.mjs`, `eslint scripts eslint.config.mjs`, every workspace's own `lint`, `packages/reporting-render`'s `lint` |
| Typecheck | `pnpm typecheck` (repo root) | **exit 0** — `packages/runtime typecheck: Done`, `apps/web typecheck: Done` |
| Frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen file(s), no manifest diff** |
| Parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| Working tree | `git status --porcelain` | empty at `3f15508b4` |
| Throwaway databases | `select datname from pg_database where datname like 'clara%'` on port 55750 | only `clara_l10` remains |

**Not run, and why.** `packages/runtime`'s `node --test` unit suite: this ticket touches no file that
suite collects (`tests/intake-batch-e2e.mjs` is explicitly standalone — "not collected by node
--test" per its own header — and the one library file touched during the broken-belt control,
`lib/intake-batches.mjs`, was restored byte-for-byte before any commit, confirmed by `git diff`
returning nothing). One accidental attempt without `PGHOST`/`PGPORT`/`PGDATABASE` set produced 77
failures, every one of them `rig.mjs`'s own "runtime tests need a DB target in the ENVIRONMENT" —
an environment omission on my part, not a code result, and it is not reported as gate evidence.
`apps/web`'s suites: this ticket never touches `apps/web`. `packages/db`'s gate chain
(`operation-census.test.mjs`, `rig-isolation.test.mjs`): no SQL function was added.

## Docs (same commit)

`packages/runtime/README.md`'s "#636 intake batch lane" section gains a new `**#1028 — THE THIRD
RACE…**` paragraph block (defect, the fix's shape, the new fault, and the same measured evidence
table above, by database name) immediately after the existing "What #1027 did NOT fix" paragraph and
before "## #1026". Two stale cross-references inside that older paragraph and inside the test file's
own header comments ("the separate defect below … NOT fixed here", "That is the separate, unfixed
defect.") are corrected to point at the #1028 fix instead of asserting it is still open. No
`CONTEXT.md` change: this ticket introduces no new domain vocabulary, only a test-infrastructure
fault knob local to one file.

## Successor contract

None. This ticket touches no door, no frozen workflow body, no closure module, and nothing a FROZEN
chat or Work tool would ever call.

## Follow-ups worth filing

1. **The stale-`.output` trap** (see "An environment defect found" above): a wave-3 addendum note in
   `RIG.md` for lanes running World-booting legs under WSL — rebuild `packages/runtime` before the
   first such run if the worktree's `.output` predates its own `HEAD`. Not filed as a ticket by this
   session (out of #1028's scope to decide RIG.md's own maintenance), named here for the orchestrator.
2. Nothing else new. The gate's remaining known-Windows reds (RIG.md) were not touched or exercised
   by this ticket (the leg ran under WSL/Linux throughout, where those specific reds do not apply).

## Anything unverified

1. **CI job 105954490814's own identity is still unresolved.** #1027's report already flagged that
   this historical red might have been this race rather than the one #1027 fixed; nothing in that
   job's log distinguishes them, and this ticket adds no new way to re-examine a closed job.
2. **The exact production frequency of this race remains unmeasured** — as the ticket itself says, it
   has never been observed in CI; this session did not attempt to estimate a live probability, only
   to prove the fix is correct once the race occurs.
3. **The runtime unit suite was not run with a database target** (see "Not run, and why" above) — its
   77 no-DB failures are not evidence of anything about this change, and a DB-configured re-run was
   judged not required because no unit test file was touched.
