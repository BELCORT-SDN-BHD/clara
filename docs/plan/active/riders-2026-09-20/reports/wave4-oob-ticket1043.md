# Wave 4 out-of-band — #1043: `db-live-gates` reds in the intake admission e2e

**Branch** `fix/1043-live-gates-intake-e2e`, cut from `origin/main` (67f70ea0f) in
`C:\Users\zhant\Desktop\clara-wt\658`.
**Head** `73b78c7ab`. Two commits, tree clean, nothing pushed.

| commit | |
|---|---|
| `1ecf1f3d9` | fix(runtime): a spool sidecar's temp file is unique per call (#1043) |
| `73b78c7ab` | docs(runtime): the #1043 sidecar-collision defect, with the Linux measurement (#1043) |

**Ticket** #1043 (bug, ready-for-agent).
**Method** /diagnosing-bugs: feedback loop first, root cause named at a code path, fix at that seam
with a regression cell. No timeout was widened, no retry added, no sleep introduced.

---

## 1 · The feedback loop, and its red, before any product change

One command, a bounded loop, the composite's own shape: a FRESHLY PROVISIONED `clara_intake_ci`
(template copy of the lane database `clara_l09` — migration 0154 pins a cluster-wide `clara%` role
count, so a second from-scratch chain on this cluster is forbidden; the template copy is the
recipe `.github/actions/db-live-gates/action.yml` itself records), the WDK world bootstrap, then
leg 1 (`tests/intake-e2e.mjs`) and leg 2 (`tests/intake-admission-e2e.mjs`) through
`scripts/ci/world-gate.mjs` on the SAME database and world, exactly as the two composite steps do.

Script: `…/scratchpad/loop-1043.sh` (reproduced at the end of this report). Invocation:

```
bash loop-1043.sh 8 prefix
```

Per cycle it runs:

```
psql -c 'drop database if exists clara_intake_ci' -c 'create database clara_intake_ci template clara_l09'
PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55749/clara_intake_ci \
  pnpm --filter @clara/runtime exec bootstrap
cd packages/runtime && PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL=… \
  node ../../scripts/ci/world-gate.mjs tests/intake-e2e.mjs
cd packages/runtime && PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL=… \
  node ../../scripts/ci/world-gate.mjs tests/intake-admission-e2e.mjs
```

**Result on the PRE-FIX tree** (`origin/main`'s `lib/spool.mjs`, runtime bundle rebuilt from it):

| | |
|---|---|
| cycles | 8 |
| green | 6 |
| red | 2 |

Both reds are the two shapes the ticket quotes from CI, and each carries the same upstream line:

- **run 3, leg 1** — `[reconcile] task sidecar unreadable, rebuilding from Postgres alone
  (transport + diagnostic fields dropped) task=4f993d27-…: Unexpected non-whitespace character
  after JSON at position 737 (line 2 column 1)`, then
  `FatalError: document ingest terminally failed (storage_error): canonical storage key is invalid`,
  then `INTAKE E2E: FAIL Error: document workflow timed out; last={"status":"failed",…}`.
- **run 5, leg 2 (the ticket's own driver)** — the same `task sidecar unreadable … position 737`
  line, the same `storage_error: canonical storage key is invalid`, then
  `INTAKE ADMISSION E2E: FAIL Error: waitForQueueDrain: a run left behind by an earlier leg's
  queued work FAILED while this leg's own engine drove it (#967 AC3) … newly failed:
  [{"id":"wrun_01M37WB5FQD35DSRGT4Q1E4854","name":"workflow//./workflows/documentIngest.v2//documentIngest_v2"}]`
  — **attempt 1's CI failure, verbatim.**

A second, deterministic loop at the unit seam, which reds in ~2 s rather than ~5 min:

```
cd packages/runtime && node --test --test-name-pattern "p1043" tests/intake-sidecar-race.test.mjs
```

and a raw probe of the same two writers (`…/scratchpad/probe-atomic.mjs`), 300 rounds, **on both
platforms — and the runner's is the bad one**:

| 300 rounds | Windows pre-fix | Windows post-fix | Linux (WSL) pre-fix | Linux post-fix |
|---|---|---|---|---|
| rename rejections (`ENOENT`) | 6 | 0 | 286 | 0 |
| sidecars left unparseable on disk | 116 | 0 | 271 | 0 |

On a fast filesystem the two writes land in the same millisecond nearly every time, which is why CI
reds so readily and this Windows rig needed eight cycles to show two.

---

## 2 · Root cause

`packages/runtime/lib/spool.mjs`'s `atomicJson` named its temp file

```
`${path}.${process.pid}.${Date.now()}.tmp`
```

whose only per-call component is a **millisecond**. Two writers of the SAME sidecar inside ONE
process therefore compute the SAME temp path whenever they land in the same millisecond, and both
`writeFile` into it and `rename` it away. Two failures follow:

1. the loser's `rename` finds nothing to move and throws `ENOENT` — which `renameIntoPlace`
   deliberately does not retry (only `EPERM`/`EACCES`/`EBUSY` do) — so the intake is failed with
   an untyped `internal`;
2. far more often the two `writeFile`s interleave on the one inode and the body the WINNER renames
   into place is a **splice** of both: the shorter body, its newline, then the longer body's tail.
   That is the `position 737 (line 2 column 1)` parse error above.

**The two writers, with line numbers.** `lib/intake.mjs:439` — `writeTaskMeta(task.taskId, task)`
inside `finalizeDocumentIntake`, the full transport sidecar for the task
`clara.finalize_document_intake` has just minted — races `lib/reconciler-documents.mjs:267` —
`mergeTaskMeta(row.taskId, row)` inside `documentTaskIndex`, which merges EVERY
`clara.document_processing_tasks` row onto its own sidecar on every reconciler sweep. The DB row is
committed BEFORE intake.mjs:439 runs, so the belt can see the task before its sidecar exists. The
two bodies are different lengths, because `documentTaskSnapshot`
(`lib/reconciler-documents.mjs:199-214`) selects task columns only and carries no transport at all.

**What each symptom in the ticket actually is.**

- `ENOENT … rename '/tmp/clara-intake-admission-AdS9Jw/spool/task-c6245da9-….json.7113.1790191021685.tmp'`
  (CI attempt 2, job 107339673336, 19:17:01Z, 1.8 s after the admission leg's world booted) is
  failure 1 above, on the leg's very first upload. The `pid` and the millisecond are in the file
  name, which is exactly the evidence that both writers computed the same name. The admission
  driver's `upload()` helper returns `refusedAt: null` for a failed finalize, so the leg reported
  it one assertion later as `the control document was adopted`.
- `waitForQueueDrain … a run left behind by an earlier leg's queued work FAILED (#967 AC3)`
  (CI attempt 1) is failure 2: a spliced `task-<id>.json` → the reconciler rebuilds it from
  Postgres alone, dropping the transport → `documentIngest_v2` reads no `storageKey` →
  `storage_error: canonical storage key is invalid` → that run reaches `failed` DURING the leg's
  own drain wait → #967 AC3 throws. Reproduced locally at run 5 above. Note the drain rule was
  telling the truth: the run genuinely failed under this leg's engine. It was not an earlier leg's
  leftover.
- **The two `code=internal … detail=not found` lines are NOT a defect.** They are logged by
  `lib/intake.mjs:456` for the intake-e2e leg's own deliberate token-lock assertions
  (`tests/intake-e2e.mjs:190-201`: finalize the real intake with `Bearer wrong`, and finalize a
  random uuid) — two different intake ids, in a leg that PASSED, at 19:16:56Z, before the admission
  step even started (the step boundary is at 19:16:59.88Z in the same log). `failureCode` maps
  `not_found` to `internal` because `not_found` is not in its list. The ticket read them as part of
  the failure; they are the passing leg's own control.

The spool directory was never removed by anything. The ENOENT is the temp file, not the directory.

---

## 3 · The fix

`packages/runtime/lib/spool.mjs:140` — one line, at the seam the cause lives at:

```js
const next = `${path}.${process.pid}.${randomUUID()}.tmp`;
```

plus `randomUUID` on the existing `node:crypto` import, and a header explaining the defect. This is
the same per-call uniqueness `lib/intake.mjs`'s `taskTempPath` already uses for the spool's other
temp file, so the two temp shapes agree. The pid stays because it is what tells a human reading a
spool directory whose leftover a temp file is. Both shapes still end in `.tmp`, so `SPOOL_REAPABLE`
and `listJsonEntries` ignore them exactly as before, and `atomicJson`'s own catch now removes
exactly its own temp file rather than possibly a sibling's.

No product code outside `atomicJson` changed. The cause is test plumbing in no sense: it is on the
ordinary intake path, and one of the two racing writers is a belt that runs on every sweep. It is
reachable in production on any host, not only under CI.

**What is deliberately NOT changed, and stays a named residual.** Two writers of one sidecar still
race on the rename itself and the last rename wins, so a DB-row merge landing after a transport
write can still leave the shorter body on disk. That is the read-then-write residual
`mergeTaskMeta`'s own header already names (documentIngest task #28, P4); closing it needs a
version/mtime compare-and-swap or real locking across `lib/spool.mjs` and the belt, which is a
different change from this one. What #1043 changes is that no reader ever sees a body **no writer
wrote**, and no writer is told its write failed because a sibling won.

---

## 4 · The regression cell

`packages/runtime/tests/intake-sidecar-race.test.mjs:251` —
`p1043.collide: 200 rounds of TWO writers on ONE sidecar leave a WHOLE body every time`, in the
file that already owns this seam (#966). It drives the two REAL writer shapes (the full transport
sidecar and the DB-row merge) concurrently against one task sidecar, and asserts three things:

- no write is rejected (pre-fix this catches the `ENOENT`);
- the body on disk is one of the two **field for field**, not merely parseable — a splice that
  happens to parse is exactly what a `JSON.parse` check would wave through;
- both writers won rounds, so the cell is not vacuous.

Red on the pre-fix code, green after:

```
pre-fix : fail 1 — "2 of 400 writes threw ([{"round":51,"code":"ENOENT"},{"round":149,"code":"ENOENT"}])"
post-fix: pass 1
```

---

## 5 · Gates, with counts

| gate | command | result |
|---|---|---|
| the driver, five consecutive green on a freshly provisioned database | `bash loop-1043.sh 6 postfix` | **6 of 6 cycles green, 0 red** (12 leg runs; every cycle drops, template-copies, bootstraps its own `clara_intake_ci`) |
| the same loop, pre-fix | `bash loop-1043.sh 8 prefix` | 6 green, 2 red — both CI shapes |
| the regression cell, red then green | `node --test --test-name-pattern "p1043" tests/intake-sidecar-race.test.mjs` | pre-fix `# fail 1`; post-fix `# pass 1` |
| the whole file I touched (Windows) | `node --test tests/intake-sidecar-race.test.mjs` | 17 pass, 0 fail |
| the whole file I touched (WSL, user `runner`, `/opt/node/bin/node`) | same | 17 pass, 0 fail |
| every runtime unit file that imports `lib/spool.mjs`, non-db (Windows) | `node --test tests/intake-unit… tests/document-ingest-v2.test.mjs` (6 files) | 62 pass, **1 fail** — see below |
| every runtime unit file that imports `lib/spool.mjs`, db-backed (Windows, `clara_l09`) | `node --test tests/intake-db… tests/s6-matcher-reconcile.test.mjs` (5 files) | 36 pass, 0 fail |
| typecheck | `pnpm --filter @clara/runtime typecheck` | exit 0 |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` (worktree root) | exit 0 |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | exit 0 — 312 frozen files verified, no manifest diff |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | exit 0 |

**The one unit red is the documented Windows-only one.**
`intake-unit.test.mjs`'s `scanner rejects EICAR, encrypted PDF, and XML entity expansion` — the
Defender/EICAR family RIG.md lists as a known Windows-only red (#693). It **passes under WSL on
Linux**, where the fixture survives. Reported as such, not "fixed".

**The WSL run of those six files shows four reds that are neither mine nor code.** `intake-unit`'s
four `MATERIAL-1 … through the shipped intake router` cells fail with
`You installed esbuild for another platform than the one you're currently using` — the Windows
`node_modules` of this checkout, run under Linux. **Identical on the pre-fix tree** (checked by
reverting `lib/spool.mjs` to `HEAD~1`, re-running, and restoring), so it is an artifact of running a
Windows checkout under WSL and not a property of this change. CI installs on Linux and does not have
it.

Databases: the loops used `clara_intake_ci`, provisioned fresh each cycle as a template copy of
`clara_l09` on `127.0.0.1:55749`; the db unit files ran against `clara_l09` itself. No migration was
written or applied; `clara_l09` is still at 288 files / 0293.

---

## 6 · Anything unverified

- **CI itself.** I never push, so `db-live-gates` has not run on this branch. The ticket's last
  acceptance criterion ("CI green on the fix PR, including `db-live-gates`") is open until someone
  opens the PR.
- **CI attempt 1's own log.** `gh` serves only the latest attempt, so attempt 1's failure is known
  only from the ticket's quote. Its shape is reproduced locally at pre-fix run 5 (the #967 AC3
  throw with the same upstream `task sidecar unreadable` and `storage_error` lines), which is strong
  but is my reproduction, not that attempt's log.
- **The 116 vs 286 gap is explained, not proven.** I attribute the Windows/Linux difference to
  filesystem speed collapsing two writes into one millisecond more often on Linux. I measured both
  numbers; I did not instrument the clock to prove the mechanism of the difference.
- **The residual named in §3 is not measured.** I did not try to provoke the last-rename-wins
  transport loss after the fix; 6 clean cycles is evidence it is not frequent, not evidence it
  cannot happen. If a future `db-live-gates` red shows
  `[reconcile] ingest task … has no transport metadata in its sidecar — NOT dispatched` **without**
  a preceding `task sidecar unreadable` line, that is this residual and not #1043.
- **`spoolHealth`'s probe file** (`lib/spool.mjs`, `.ready-${pid}-${Date.now()}`) has the same
  non-unique shape. I read it and left it: both removals are `rm(..., {force:true})`, so two
  concurrent health probes in one millisecond cannot fail each other. Inspected and judged benign,
  not measured.
- **Nothing was done about the dispatch-only legs (#1041)**, which the ticket puts out of scope, and
  nothing about what the admission e2e asserts was changed.

---

## 7 · Follow-ups worth filing

1. **The admission driver's `upload()` helper reports a failed finalize as a success.**
   `tests/intake-admission-e2e.mjs:271-282` returns `refusedAt: null` whatever status `finalize`
   answered, so a 500 on finalize surfaces one assertion later as `the control document was
   adopted` — which is why both CI attempts named the wrong thing. Asserting the finalize status in
   the helper would have put the real error on screen. Not done here: changing what the driver
   asserts is out of this ticket's scope.
2. **`requireCapability` turns any unreadable sidecar into `not found`**
   (`lib/intake.mjs:113` — `readIntakeMeta(intakeId).catch(() => null)`). A corrupt or
   permission-denied sidecar is indistinguishable from an absent one, for the client and in the log.
   Separating them would have named this defect in one line.

---

## 8 · The loop script

`…/scratchpad/loop-1043.sh` (kept out of the repo; reproduced here so it can be re-created):

```bash
#!/usr/bin/env bash
set -u
export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
WT="C:/Users/zhant/Desktop/clara-wt/658"
RUNS="${1:-8}"; LABEL="${2:-run}"; OUT="<scratchpad>/loop-$LABEL"; mkdir -p "$OUT"
export PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
DSN="postgres://postgres@127.0.0.1:55749/clara_intake_ci"
pass=0; fail=0
for i in $(seq 1 "$RUNS"); do
  wsl -- psql "postgres://postgres@127.0.0.1:55749/postgres" -v ON_ERROR_STOP=1 \
      -c "drop database if exists clara_intake_ci" \
      -c "create database clara_intake_ci template clara_l09" >"$OUT/$i.provision.log" 2>&1
  (cd "$WT" && PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL="$DSN" \
      pnpm --filter @clara/runtime exec bootstrap) >>"$OUT/$i.provision.log" 2>&1
  (cd "$WT/packages/runtime" && PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL="$DSN" \
      CLARA_GATE_STEP="Slice-5 intake transport e2e" \
      node "$WT/scripts/ci/world-gate.mjs" tests/intake-e2e.mjs) >"$OUT/$i.leg1.log" 2>&1
  leg1=$?
  (cd "$WT/packages/runtime" && PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL="$DSN" \
      CLARA_GATE_STEP="#633 intake admission e2e" \
      node "$WT/scripts/ci/world-gate.mjs" tests/intake-admission-e2e.mjs) >"$OUT/$i.leg2.log" 2>&1
  leg2=$?
  if [ "$leg1" -eq 0 ] && [ "$leg2" -eq 0 ]; then pass=$((pass+1)); v=GREEN; else fail=$((fail+1)); v=RED; fi
  echo "run $i: $v (leg1=$leg1 leg2=$leg2)"
done
echo "== $LABEL: $pass green, $fail red of $RUNS =="
```

A cycle costs about 36 s on this rig. The runtime bundle must be rebuilt
(`pnpm --filter @clara/runtime build`) whenever `lib/` changes, because the drivers import
`../.output/server/index.mjs` rather than the source.
