# Wave 4 · lane 07 — fix round 2

* **Branch** `riders/w4-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, database `clara_l07` (127.0.0.1:55747)
* **Base** `cd2925391` · **head entering this round** `9ed265e54` · **head leaving it** `8c13bce95`
* **Input** `docs/plan/active/riders-2026-09-20/reports/wave4-lane07-recheck.json`, one open finding:
  `RECHECK-877-D-1` (major, #877)
* Working tree **clean**. No push, no PR, no GitHub write.

## Commits added this round

| commit | subject |
|---|---|
| `8c13bce95` | `docs(runtime): #877 make the recipe section's own citations checkable, on a third clone` |

`9ed265e54` (`docs(runtime): #877 the e2e's rig recipe is run -> settle -> run, and why`) was already
on the branch when this session started — it was committed at 07:23, after the recheck was taken at
`c6f465a33`, by an earlier fix-round-2 session that stopped before writing this report. Per work
order rule 1 it was **not redone**: this session verified it independently and then corrected what
did not hold in it.

---

## RECHECK-877-D-1 — the claimed exit 0 did not reproduce

> *required fix:* re-run the recipe and attach the actual terminal output, **or** name the
> environment condition the passing runs depended on, in the report and in
> `packages/runtime/README.md`'s recipe section.

**Both halves are now done, and the answer is neither credentials nor WSL timing: the recipe itself
was wrong.** The order is **run → settle → run**, never settle → run. The first run on a clone is a
PRIME run: it is what burns a one-shot piece of state, and it exits 1 while doing so.

### The reproduction, from scratch, on a third independent clone

Built the way the recheck built its two, with nothing borrowed from the earlier session:

```
create database clara_883 template clara_l07              # no open connection to the source
node node_modules/@workflow/world-postgres/bin/setup.js   # WDK world bootstrap on the clone
update clara.wakes_outbox set status='cancelled' where status='held';
update clara.agent_tasks  set status='cancelled' where status in ('queued','held','running','awaiting_input');
```

The settle reported `wakes_outbox held->cancelled = 8 | agent_tasks nonterminal->cancelled = 21`,
and the clone then entered run 1 in **exactly** the state fix round 1's recipe describes — every
wake counter at zero:

```
compliance_watches                  0
compliance.watch_transition events  0
held wakes_outbox                   0
held agent_tasks kind=wake          0
nonterminal agent_tasks             0
pending wake_intents                0
```

**Run 1 — Windows, `node tests/intake-admission-e2e.mjs`, exit 1.** All eight legs PASS
(`[leg 1] … [leg 8] PASS`), then, verbatim from the log (`run1.log`, 197 lines, lines 192-197):

```
INTAKE ADMISSION E2E: FAIL Error: waitForQueueDrain: TIMED OUT after 30000ms (polls=141) with live work still on this database — the NEXT leg's fresh engine would inherit and re-attempt it as cross-leg noise (#967).
  non-terminal runs: []
  unbound live tasks: [{"table":"clara.agent_tasks","id":"14219ad3-610d-48e8-a1e8-44c33f84f941","kind":"wake","lane":null,"workId":null,"status":"held","workflowClass":null,"needsWorkflow":true,"known":false},{"table":"clara.agent_tasks","id":"69de240d-d6ec-46ca-9f6b-45127dc5a01e","kind":"wake","lane":null,"workId":null,"status":"held","workflowClass":null,"needsWorkflow":true,"known":false},{"table":"clara.agent_tasks","id":"104dec9c-bf12-4d44-b852-2646bad8602e","kind":"wake",…}, … eight rows in total, every one kind="wake" status="held" …]
    at waitForQueueDrain (file:///C:/Users/zhant/Desktop/clara-wt/657/packages/runtime/tests/queue-drain.mjs:141:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async main (file:///C:/Users/zhant/Desktop/clara-wt/657/packages/runtime/tests/intake-admission-e2e.mjs:1026:3)
```

This is the recheck's failure, reproduced **to the poll count** (`polls=141`, eight `held` `wake`
rows). The recheck was right and fix round 1's evidence line was wrong.

**The cause, measured across that one run.** The same six counters, immediately after run 1:

```
compliance_watches                  8     (was 0)
compliance.watch_transition events  8     (was 0)
held wakes_outbox                   8     (was 0)
held agent_tasks kind=wake          8     (was 0)
nonterminal agent_tasks             8     (was 0)
pending wake_intents                0
```

All eight `clara.compliance_watches` rows carry `watch_kind='sst_registration'`, and all eight
events carry `{"kind": "created", "state_before": null, "state_after": "monitored"}`, written
between `07:34:18.942932+08` and `07:34:19.426626+08` — inside half a second, during the SST
compliance-watch belt's single boot pass. They are not residue a settle could have cleared: they
existed nowhere on the clone, and none on `clara_l07` either (`clara_l07` reads 0 / 0 for both to
this day, re-measured at the start of this session).

**Run 2 — Windows, after settling again (8 outbox + 8 task rows), exit 0** (`run2.log`, lines 68-69):

```
[queue-drain] drained (polls=4, waited=854ms)
INTAKE ADMISSION E2E: PASS (8 legs — no human gate, no kind from a failed read, duplicates converge, mixed batch independent, replayed finalize idempotent, H-53 custody, C-37 OFX/XLSX, #877 genuine admission)
```

**Run 3 — WSL as user `runner`, `/opt/node/bin/node tests/intake-admission-e2e.mjs`, NO settle at
all before it, exit 0** (`run3-wsl.log`, lines 72-73):

```
[queue-drain] drained (polls=4, waited=813ms)
INTAKE ADMISSION E2E: PASS (8 legs — no human gate, no kind from a failed read, duplicates converge, mixed batch independent, replayed finalize idempotent, H-53 custody, C-37 OFX/XLSX, #877 genuine admission)
```

Run 3 is the load-bearing one for the recheck's question. It needed **no settle**, because run 2
left nothing `held`: the one-shot is spent after the prime run. So the passing runs depend on
neither Fly render/sandbox credentials (both Windows runs and the WSL run logged
`render dispatch UNWIRED … sandbox dispatch UNWIRED` throughout — it is unwired here and the leg
passes anyway) nor WSL-only timing (run 2 passed on plain Windows). **The environment condition is
simply: it is not the database's first boot.**

### What I corrected in the round-2 documentation

The mechanism holds. Two of its **citations** do not, and both would send the next reader somewhere
that refutes the section:

1. **"`lib/reconciler-sst.mjs`; `lastSstRun` starts null."** It starts **`0`**, and it is declared
   in `packages/runtime/lib/leader.mjs:184` — `let lastSstRun = 0;` — not in `reconciler-sst.mjs`,
   where the name occurs only inside the cadence-law comment at line 101. A reader who opens the
   cited file to check finds no declaration at all. The section now names the belt body and the
   cadence site separately, with the real initial value and the real call
   (`sstReconcileDue(lastSstRun, Date.now())`).
2. **"the belt examined 181 active clients (`clara.compliance_eval_runs`)."** The table is the right
   source (`clients_examined`, `clients_changed`, `clients_failed`), but the figure is not a
   constant: it is every `status='active'` client at that instant, and it drifts by exactly one per
   run of this leg. Observed this session: **183** (run 1) → **184** (run 2) → **185** (run 3).
   Rewritten as a *how to check this yourself* paragraph rather than a pinned number.

And one trap the section did not warn about, which is precisely how a careful reader would wrongly
conclude the belt was innocent: **the belt's own counters read zero on the run that creates the
watches.** The receipt's `clients_changed` and the log line

```
[reconcile] sst watches examined=183 changed=0 failed=0
```

both read `0` on run 1 — the run that created all eight watches — because a CREATION is not counted
as a change (`out.sstChanged` only increments on `r?.changed === true`,
`packages/runtime/lib/reconciler-sst.mjs:76-79`). The section now says so, and points at the
evidence that does move: the two counts going 0 → 8, and each new row's own `created` payload.

Also restored: the CI paragraph's **"WHAT THIS MAY MEAN FOR CI — NAMED, AND UNVERIFIED HERE"**
heading, which the round-2 rewrite had folded into the preceding paragraph. Nothing in it is
upgraded to a claim — that job is dispatch-only and was not dispatched for this branch (#1041).

The three new measurements (`clara_883` runs 1-3) are in the README table beside `clara_881` and
`clara_882`, so the section now rests on three independent clones rather than one session's.

**Not done, deliberately:** the drain deadline is untouched (it refuses correctly — a fix that only
widens a timeout is refused by the lane rules and would be wrong here anyway); no code changed; and
no test was added to assert README prose, which is not a seam #877's brief gives.

**Verdict on the finding:** the recheck's observation is **upheld**, fix round 1's evidence line is
withdrawn, and the corrected recipe is now reproduced on a third clone with logs. #877 should be
closed on the round-2 recipe (`run → settle → run`), not on round 1's.

---

## Gates

| gate | command | result |
|---|---|---|
| runtime unit, touched files | `node --test --test-concurrency=1 tests/rollback-preflight.test.mjs tests/runtime-contracts.test.mjs tests/l9-build-info.test.mjs` | **63 tests / 41 pass / 0 fail / 22 skipped** |
| runtime unit, the #1033 file | `node --test --test-concurrency=1 tests/ready.test.mjs` | **25 / 25 / 0 / 0** |
| db, touched files + neighbours, full gate chain | `node --test --test-concurrency=1 $GATES tests/ci-frontier-leg-contract tests/ci-drill-database-names tests/drill-fixture-name-family tests/reset-gate-routing tests/fa-rig-frontier-compat tests/operation-census tests/rig-isolation` (no reset flags) | **57 / 56 / 0 / 1** |
| runtime standalone leg | `node tests/intake-admission-e2e.mjs` on `clara_883` | run 1 **exit 1** (expected, prime), run 2 **exit 0**, run 3 **exit 0** under WSL as `runner` |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen / 55 `use workflow` / 3 retired, no manifest diff |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| typecheck | `pnpm typecheck` | **exit 0** (`apps/web` Done, `packages/runtime` Done) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |

Every count reproduces the recheck's own re-run exactly (63/41/0/22, 57/56/0/1, 25/25/0/0).

No migration in this lane, so no `CLARA_MIGRATION_REDO`, no prestate re-measure and no web census
re-key. No `apps/web` file touched, so no web unit suite and no browser walk. This round's only
changed file is `packages/runtime/README.md`.

## Rig hygiene

`clara_883` was created from `clara_l07`, world-bootstrapped, mutated and **dropped**. After:
databases = `clara_l07, postgres, template0, template1`; `clara%` roles = **18** — both identical to
the readings taken before the round began. `CLARA_RIG_ALLOW_RESET` and
`CLARA_RIG_ALLOW_ROLE_SWEEP` were never set; no role sweep, no second from-scratch chain. Scratch
probe scripts lived in the session scratchpad, never in the worktree; `git status` is clean.

## What still needs the orchestrator's dispatch (unchanged from fix round 1)

`gh workflow run ci.yml --ref riders/w4-lane07`, before integration — #1041's AC1, AC3's drill
execution and the six never-run closed-wave steps. Nothing in this round changes that list, and the
CI risk this round names for `db-live-gates` (a client left by `tests/intake-e2e.mjs` on the same
fresh `clara_intake_ci` acquiring a watch on this leg's first boot) would be answered by that same
dispatch. It is named, not asserted.

## New head

`8c13bce95fcea162df18ca09a6c5e2d46d9616c2`
