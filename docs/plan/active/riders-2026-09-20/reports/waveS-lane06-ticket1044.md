# Wave S · lane 06 · ticket #1044 — the reconciler merge can drop the intake transport fields

**Status: DONE.** No migration (none needed, none written).

- Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
- Lane database `clara_l08` (127.0.0.1:55748), 309 migrations, untouched by this ticket.
- Commits (`git log --oneline 7bc5a710f..HEAD`):

| commit | subject |
|---|---|
| `0e2ee52ba` | `fix(runtime): #1044 one sidecar, one mutation at a time — the merge can no longer drop the intake's transport` |
| `7ab0d4ebb` | `test(runtime): #1044 the real sweep's merge keeps the transport an intake write lands mid-merge` |
| `1e33ce123` | `test(runtime): #1044 200 rounds at the natural body size, and the lock map leaves nothing behind` |
| `5b31ea95b` | `refactor(runtime): #1044 one taskMetaPath per merge — the lock's key IS the write's target` |

Files: `packages/runtime/lib/spool.mjs`, `packages/runtime/tests/intake-sidecar-race.test.mjs`,
`packages/runtime/README.md`. Nothing else.

**The ticket is live on this branch.** `gh issue view 1044` — OPEN, labels `bug` + `ready-for-agent`,
no comments, so the body's Agent Brief is the contract. The repository still admitted the defect at
the base: `packages/runtime/README.md:2081-2086` ("a full transport write and a DB-row merge landing
together can still leave the merge's shorter body on disk … now tracked as its own defect, #1044")
and `packages/runtime/lib/spool.mjs:207-209` ("A hard guarantee needs real locking or a version/mtime
compare-and-swap, which is a larger change and out of scope here"). No cell exercised the interleave;
`p1043.collide` raced two direct `writeTaskMeta` calls and asserted only that the body on disk is
WHOLE.

---

## The seams I tested at (written down before the first cell)

| # | seam | why it is a seam the brief gives me |
|---|---|---|
| **S1** | `lib/spool.mjs`'s public sidecar interface — `mergeTaskMeta(id, patch, opts)`, `writeTaskMeta(id, value)`, `readTaskMeta(id)` | the brief's "Key interfaces" names exactly these (plus `atomicJson`, which is module-private and is reached through them) |
| **S2** | `lib/reconciler.mjs`'s `reconcileDocumentTasks(client, deps)` — the reconciler's per-sweep merge | the brief names "the reconciler's per-sweep merge (`lib/reconciler-documents.mjs` near line 267)" as the second writer. Driven with a fake DB client (a system boundary) and observed through the sweep's OWN return counters and the sidecar on disk, never through `documentTaskIndex`, which is module-private |

Not tested at, deliberately: `finalizeDocumentIntake` itself. Its sidecar write is
`writeTaskMeta(task.taskId, task)` verbatim (`lib/intake.mjs:439`), which is what both cells drive;
reaching the function itself needs a database and a World, and that is the live-gate leg below.

## What was wrong, and what the fix is

`mergeTaskMeta` read its base, computed, and renamed. A write landing between the read and the
rename was **erased**, because the merge's body was computed from a base that no longer existed. On
the document path the erased keys are the transport ones (`storageKey`/`sha256`/`mime`/`format`):
the reconciler's patch is the `clara.document_processing_tasks` row, which carries none of them,
while `lib/intake.mjs:439` carries all of them — and the row is committed by
`clara.finalize_document_intake` **before** that write runs. Nothing restores them: the runtime holds
no SELECT on `clara.documents` (PIN-AB-6), so the belt then refuses to dispatch
(`documentTransportless`, `reconciler-documents.mjs:419-424`, the counter set at :421) or `documentIngest_v2` manufactures a
`storage_error` on an already-enqueued run.

The fix is `withSidecarLock` in `lib/spool.mjs`: one in-process queue per sidecar **path**.
`mergeTaskMeta` holds that lock across its read AND its rename. **The lock's scope is the rename,
not the whole write** — deliberate, because a mutation is only observable when its rename lands, so
serialising the renames of one path is all the exclusion a read-modify-write needs, and the two temp
writes still run in parallel. That is what keeps `p1043.collide`'s own non-vacuity control ("both
writers must win rounds") true; locking the whole write would have made the winner the later CALLER
and turned that control into a deterministic loss.

`atomicJson` gained one option, `{ locked }`, for the caller that already holds the path's lock.
`mergeTaskMeta`'s `const next = { ...(current ?? {}), ...patch, updatedAt: … }` statement is
byte-identical, so its two parts-parity exemption tuples still match (checked, below).

## Acceptance criteria, each with its evidence

### AC1 — "a regression cell that interleaves the merge's read, the intake's write and the merge's rename deterministically (no sleeps) and fails on the current code by showing the missing storage key"

**Met.** `packages/runtime/tests/intake-sidecar-race.test.mjs`, section `2b`, beside `p1043.collide`
as the brief asks.

- `p1044.lost_update: a merge cannot drop the transport fields a concurrent writer put on disk` —
  one round per launch order, no sleeps and no timers. Run against the code as it stood at
  `7bc5a710f` it reds:

  ```
  not ok 1 - p1044.lost_update: …
    merge first: the sidecar lost 'storageKey'. …
    + undefined
    - 'firms/225742ed-…/docs/aaaa….pdf'
  ```

- **Determinism is by construction, and the construction is named in the cell.** The merge's patch
  carries a 1 MiB `engineConfig` (a jsonb column `documentTaskSnapshot` passes through verbatim), so
  the merge's own temp write is always longer than the intake's whole write. Measured against the
  pre-fix `spool.mjs`, 100 rounds per arm:

  | body size | launch order | Windows rig | WSL (the runner's platform) |
  |---|---|---|---|
  | natural | merge first | 95 of 100 lost | 97 of 100 lost |
  | natural | intake write first | 99 of 100 lost | 99 of 100 lost |
  | 1 MiB widener | merge first | **100 of 100** | **100 of 100** |
  | 1 MiB widener | intake write first | **100 of 100** | **100 of 100** |

  The widener is a clock, not the defect; the natural-size window is the first two rows, and
  `p1044.rounds` keeps a 200-round loop at that size.

### AC2 — "the fix keeps every key a writer does not own; the cell passes; #1043's cells still pass"

**Met.**

- Every new cell green: `node --test tests/intake-sidecar-race.test.mjs` → **20 pass / 0 fail**
  (Windows) and **20 pass / 0 fail** under WSL as user `runner` (`/opt/node/bin/node`).
- "Keeps every key a writer does not own" is asserted, not assumed, in two places that a
  do-nothing merge could not satisfy: `p1044.lost_update`'s third arm (the merge is the LAST writer,
  so its own body is on disk, and it must carry both its patch and the four transport keys it was
  not given) and `p1044.rounds`'s per-round settling merge (200 of them).
- **`p1043.collide` still passes**, five consecutive runs on each platform, and its distribution did
  not move: post-fix `intake=42 / reconciler=158` on this rig and `7-10 / 190-193` under WSL,
  against `8 / 192` under WSL measured on the pre-fix copy of `spool.mjs`. All 18 pre-existing cells
  in the file pass.
- **Vacuity control** (work order rule 4, last bullet). With `withSidecarLock` reduced to
  `return fn();` — the pre-#1044 behaviour — all three new cells red:
  `p1044.lost_update` on `merge first: the sidecar lost 'storageKey'`, `p1044.sweep` on
  `the sweep's merge dropped 'storageKey' (documentTransportless=1)`, and `p1044.rounds` at
  **169 of 200 rounds**. `spool.mjs` was restored with `git checkout --` and `git status` was clean
  before the next edit (and again with a byte copy for the second control).

### AC3 — the live gates, the runner's lint, and the WSL run

| part | result |
|---|---|
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| the runtime test file once under WSL as user `runner` | **20 pass / 0 fail** |
| "the driver of `.github/actions/db-live-gates` green five consecutive times on a fresh database" | **PARTIAL — see below** |

The `db-live-gates` intake chain is three steps on one throwaway database: `intake-e2e.mjs`,
`intake-admission-e2e.mjs`, `intake-batch-e2e.mjs`. I ran the third — **`#636 intake batch e2e`, the
100-concurrent-upload leg and the most spool-intensive step in the action** — many times, each round
on a database created fresh and world-bootstrapped for that round. **Sixteen rounds in all, nine on
this branch and seven on the base for comparison**, and I did not get five consecutive greens
without a red in the series, so this criterion is reported as PARTIAL with the whole dataset rather
than as a pass.

| round | code | exit | wall clock | live children at the belt |
|---|---|---|---|---|
| 1 | this branch (`1e33ce123` bundle) | 0 | 544 s | 50 |
| 2 | this branch | 0 | 550 s | 29 |
| 3 | this branch | 0 | 542 s | 25 |
| 4 | this branch | 0 | 684 s | 14 |
| 5 | this branch | **1** | 707 s | 10 |
| 6 | this branch (final HEAD bundle) | 0 | 430 s | 33 |
| 7 | this branch | 0 | 343 s | 33 |
| 8 | this branch | 0 | 466 s | 9 |
| 9 | this branch | **1** | 387 s | 14 |
| B1-B7 | **base `spool.mjs` (`7bc5a710f`), fix reverted, bundle rebuilt** | 0 ×7 | 307-593 s | 35, 26, 19, 42, 25, 13, 27 |
| 11-15 | this branch (final HEAD bundle) | FINAL5 | | |

Each round: `drop database if exists clara_intake_ci; create database clara_intake_ci template
clara_l08` (the recipe the action's own comment prescribes for this rig, because migration 0154's
cluster-wide role pin forbids a second from-scratch chain here), then
`pnpm --filter @clara/runtime exec bootstrap`, then the leg through `scripts/ci/world-gate.mjs` with
`CLARA_GATE_STEP` set, exactly as the action launches it. A green round ends
`[p636] intake-batch-e2e: ALL LEGS PASSED`. The bundle the legs import was rebuilt each time it
mattered and was checked to carry (or not carry) the fix: `grep -c sidecarLocks
packages/runtime/.output/server/index.mjs` → 4 on this branch, 0 on the base. The base experiment
restored `spool.mjs` with `git checkout HEAD --` and rebuilt; `git status --porcelain` → 0 changes.

**Both reds are the same assertion, and it is not this ticket's.** `intake-batch-e2e.mjs:650`, in
LEG 3 (the resumable fan-out): `exactly one op receipt per live child (16 of 17)` in round 5 and
`(29 of 31)` in round 9. It counts rows in `clara.op_receipts` for `fn='cancel_accounting_work'`
under the decision's op-key prefix, and asserts that number EQUALS the live-child list
`clara.cancel_intake_batch` returned. Between that decision and the belt sweep, a child that settles
on its own leaves the belt's worklist — the belt reads it fresh from the door — so it gets no cancel
receipt and the equality breaks. The leg tolerates exactly that drift in the window BEFORE the
decision (its own comment at :616-619, "the World is running, so some of the other children may
legitimately have settled on their own") and not in the window after it.

**Why I am confident it is not the lock, stated as evidence rather than as reassurance:**

- the failing assertion reads `clara.op_receipts` and `clara.cancel_intake_batch`; no spool sidecar
  is on that path;
- the leg's own resume fixture mints its 100 documents with raw SQL (`seedChildren`,
  `intake-batch-e2e.mjs:1007-1031`, which calls `clara.finalize_document_intake` directly), so those
  documents never get a task sidecar at all and cannot exercise #1044's window either way;
- **the two codes leave identical footprints in the same logs**: every round on both sides has
  exactly **38** distinct `ingest task <id> … has no transport metadata in its sidecar` ids and
  exactly **21** `code=storage_error` lines, and all 38 ids are rows inherited from the `clara_l08`
  template (checked by querying `clara.document_processing_tasks` for that exact id list: 38 of 38
  present, 0 unexplained, on three base logs and three branch logs). The leg's sensitivity to #1044
  is nil in both directions — which also means these rounds prove the lock does not stall, deadlock
  or starve the intake path under a live World, and prove nothing about the defect itself. The cells
  are what reproduce the defect;
- the live-child counts overlap: base 13-42, this branch 9-50, and base's 13 passed while this
  branch's 14 failed once and passed once.

Seven base rounds without a red is a small sample and does NOT establish that the base never fails
this assertion; 2 reds in 9 against 0 in 7 is not a difference this sample can resolve. What it does
establish is that the assertion is load-sensitive and that I could not find a path from the lock to
it. **Filed as follow-up 3 below.**

**The other two legs cannot be run on this rig at all, for a reason that has nothing to do with this
change.** Both end with `waitForQueueDrain`, which censuses **unbound tasks across the whole
database** (`tests/queue-drain.mjs` → `censusUnboundTasks`). The only template available here is the
lane's own database, which four waves of work have left with 931 documents, 1622 firms and ~76
permanently unbindable non-terminal tasks (28 queued `ocr`, 20 queued `classify`, 12 queued
`llm_witness`, 8 queued `none`, 8 queued `local_facts`, plus running rows). Run against a copy of
it, leg 1 reds in 40 s with

```
INTAKE E2E: FAIL Error: waitForQueueDrain: TIMED OUT after 30000ms (polls=111) with live work
still on this database
```

after a storm of `local_facts FAILED … canonical storage read failed (object absent)` from those
inherited rows. No deadline would help: the rows can never bind. Pruning them is refused by the
estate itself (`CLR08 document processing tasks are not deleted`, `_tf_processing_task_update`), and
I did not disable that trigger — RIG.md's "never widen a gate for the rig". A genuinely fresh
database needs either a from-scratch chain (forbidden on this cluster) or a disposable cluster,
which RIG.md assigns to the integrator. **Legs 1 and 2 are owed to CI / the integrator.**

## Gates, with counts

| gate | command | result |
|---|---|---|
| the test file I touched | `node --test tests/intake-sidecar-race.test.mjs` | **20 pass / 0 fail** |
| …under WSL as `runner` | `/opt/node/bin/node --test tests/intake-sidecar-race.test.mjs` | **20 pass / 0 fail** |
| whole runtime unit suite | `node --test --test-concurrency=1 "tests/**/*.test.mjs"` against `clara_l08` | **2973 tests, 2933 pass, 2 fail, 38 skipped** — twice, identically |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files verified, no manifest diff, 57 `use workflow` modules frozen+registered |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK — the two `mergeTaskMeta` spread exemptions still match one live site each |
| typecheck | `pnpm typecheck` | Done (`apps/web`, `packages/runtime`) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| live gate | `#636 intake batch e2e` through `scripts/ci/world-gate.mjs`, fresh DB per round | see the table above |

Both suite failures are RIG.md's documented Windows-only reds and are **not** fixed or claimed
fixed: `scanner rejects EICAR, encrypted PDF, and XML entity expansion` (Defender eats the EICAR
fixture) and `(#806) this host's OWN probe: pg_dump/psql are on PATH here` (no `pg_dump` on the
Windows PATH).

Not run, because nothing in this ticket touches them: the `apps/web` unit suite and any browser walk
(no `apps/web` file changed), the `packages/db` gate chain, `operation-census.test.mjs` and
`rig-isolation.test.mjs` (no SQL function added, no migration), and the web pins corpus
`apps/web/tests/firm-scope-db-pins.corpus.ts` (sweep rule (d) arms it only when a migration file
changed; none did).

## Migration

**None, and none was needed.** The ticket predicted no migration and that held: the change is one
module-private lock and one option on a module-private helper in `packages/runtime/lib/spool.mjs`.
No PostgreSQL object was created, altered or recut, so there are no prestate pins to list.
`clara_l08` still reads 309 migrations, max `0318_knowledge_fye_pair_applicability`, unchanged.

## Docs

`packages/runtime/README.md` — a new `## #1044` section immediately after `## #1043` (it continues
it), landed in the same commits as the code. It states the defect and why it is not #1043, the
measured pre-fix figures, the fix and why the lock's scope is the rename, the evidence per cell with
the vacuity control, and two residuals. The stale sentence in `mergeTaskMeta`'s own header ("A hard
guarantee needs real locking … out of scope here — recorded, not silently claimed") was rewritten in
the same commit, because leaving it would have been a false claim in the file the fix lives in.

`CONTEXT.md`: nothing owed. It carries no spool or sidecar vocabulary at all (`grep -n
"sidecar\|spool" CONTEXT.md` → no match), and the sweep plan assigns that file to L3 this wave.

## Successor contract

**None owed.** Nothing frozen was touched and nothing a frozen chat or Work tool consumes changed:
no door, no zod input, no refusal mapping, no part kind, no prompt stanza. `mergeTaskMeta`'s
signature, return value and `requireExists` behaviour are byte-for-byte the contract they were —
`makeDocumentServices`' surface (`lib/intake.mjs:611-625`) is unchanged, so `documentIngest_v2` and
`invoiceFacts.v1`'s aliased `noteTaskFailure` see exactly what they saw.
`node scripts/check-frozen-workflows.mjs` shows no manifest diff.

The one new export is a test probe, `_sidecarLockCountForTest()`, the same shape as the file's
existing `_resetIntakeGateForTest`; it is read by `p1044.rounds`'s leak assertion and by nothing in
the product.

## Follow-ups worth filing

1. **`lib/intake.mjs:442` has its own stale-base write.** The post-enqueue write rebuilds the body
   from the `task` snapshot taken BEFORE the enqueue, so a `status` or `lastError` the reconciler
   wrote during that round trip is still overwritten. It can no longer cost the transport (that body
   carries it), so it is outside #1044's scope and I left it. The fix would be
   `mergeTaskMeta(task.taskId, { runId: run?.runId ?? null })`; note that removing that `...task`
   spread also retires the parts-parity tuple
   `["packages/runtime/lib/intake.mjs","finalizeDocumentIntake","...task","4974d947…","0"]`, which
   the census would otherwise report as stale.
2. **The lock is in-process.** It is a hard guarantee exactly as far as "one spool directory belongs
   to one runtime process" holds — which is how the spool is deployed (the default `CLARA_SPOOL_DIR`
   is a Fly volume, attached to one machine). Two processes on one directory would need an on-disk
   compare-and-swap or an advisory file lock. Stated in the code and the README; worth a ticket only
   if a shared-spool deployment is ever contemplated.
3. **`intake-batch-e2e.mjs:650` is load-sensitive and should be filed.** LEG 3's resume assertion
   requires that NO child settles between `clara.cancel_intake_batch` and the belt sweep, while the
   same block's earlier assertion explicitly tolerates children settling on their own (`:616-619`).
   Two of sixteen rounds here reddened on it (`16 of 17`, `29 of 31`). The fix is the same shape the
   leg already uses twenty lines above: judge by IDENTITY, not by arithmetic — every child that IS
   on the belt's worklist gets exactly one receipt, and a child that left the worklist by settling
   is not a skipped decision. `db-live-gates` is a required job, so this is worth a ticket on its
   own regardless of this branch.
4. **RIG.md should record that the intake e2e CHAIN is no longer runnable from a lane rig** (the
   `waitForQueueDrain` census against an inherited backlog, above). Lane 06's own #1124 is the
   ticket that edits RIG.md, so this belongs to that worker rather than to a new issue — handing it
   over rather than editing RIG.md from this ticket.
5. **A sweep's merge can resurrect a sidecar `documentIngest_v2` has just deleted** — found while
   reading the writers, pre-existing, and NOT fixed by this lock. The sweep snapshots task T as
   `running`; the run finishes, persists `done` and calls `removeTaskMeta(T)`; the sweep's merge
   for T then runs `mergeTaskMeta(T, row)` with `requireExists:false` (lenient by design, so it can
   rebuild a missing sidecar) and writes the file back. Nothing collects it afterwards:
   `removeTaskMeta` is the only deleter of a `task-*.json`, and `SPOOL_REAPABLE`
   (`spool.mjs:482`) matches `intake-*` only, so the phantom sits in the spool for the life of the
   volume and is counted by `checkReadiness`'s `listTaskMetas`. Ordering `removeTaskMeta` under the
   same lock would NOT fix it (the merge still recreates the file when the delete goes first); the
   real fix is for the merge to skip a task whose snapshot row is gone or terminal. Worth its own
   ticket.
6. The same lock also closes the **task #28 / P4** race `mergeTaskMeta`'s header describes (a
   reconciler sweep erasing a concurrent `noteTransientFailure`'s `lastError`). No cell drives that
   pair specifically; the property is the same one `p1044.rounds` pins, at a different pair of
   writers.

## Anything unverified

- **Legs 1 and 2 of the `db-live-gates` intake chain** (`intake-e2e.mjs`, `intake-admission-e2e.mjs`)
  were NOT run green here, for the reason and with the evidence given under AC3. They are owed to CI
  or to the integrator's disposable cluster.
- **A third failure appeared in the first run of the full runtime suite and was not reproduced.**
  That run printed `# fail 3`; its output was not captured. The two runs I did capture both printed
  `# fail 2`, the same two documented Windows-only reds. I do not know what the third was, and I am
  not claiming it was benign.
- **Whether the base is genuinely immune to `intake-batch-e2e.mjs:650` is NOT established.** Seven
  base rounds without a red is a small sample; 2 in 9 against 0 in 7 is not a difference this sample
  resolves. My argument that the lock cannot reach that assertion is a mechanism argument backed by
  identical log footprints on both sides (38 transport-less ids, 21 storage_errors, every round),
  not a statistical one. If the integrator sees this assertion red in CI on this branch, follow-up 3
  is the ticket, not a revert.
- **Peak RSS is not evidence on this host.** `world-gate.mjs` prints
  `peak RSS unavailable (no /proc on this platform)` on Windows, so the #1026 memory line says
  nothing about these runs either way.
- The pre-fix loss figures are measurements taken on this rig and under WSL on this host. CI's
  runner is a different machine; the direction (Linux loses more often than Windows) matches what
  #1043 measured on the same two platforms, but the exact ratios are this host's.

### Orchestrator addendum (2026-09-25 14:27 MYT)

The implementer was stopped by the orchestrator while it waited on its final five-round WSL chain (rounds 11 to 15), after the weekly limit had cut the run it belonged to. That chain finished on its own before the stop, green, and its log (the background task b1v86pxjf) ends with:

```
round 15 intake-batch-e2e exit=0 secs=526
[world-gate] peak #636 intake batch e2e | node tests/intake-batch-e2e.mjs | budget 2048 MB | peak RSS unavailable (no /proc on this platform) | exit 0
belt after the interruption: {"batchCancelOk":true,"batchCancelSettled":0,"batchCancelChildren":10,"batchCancelFailed":0,"batchCancelBlocked":0}
FIVE CONSECUTIVE GREEN

[exited with code 0]
```

No commit followed the stop; the branch head for this ticket is 5b31ea95b and the tree was clean. The FINAL5 row of the table above is filled by this addendum.
