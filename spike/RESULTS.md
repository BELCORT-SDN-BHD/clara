# Slice-0 spike results — 2026-07-17

Executed against a fresh hosted Supabase project, Supavisor **session mode**
(`aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`, PostgreSQL 17.6),
from Windows 11 / Node v20.19.5 / pnpm 10.33.0. Worker = the built
`.output/server/index.mjs` via `scripts/worker.mjs` (long-lived Node process,
`@workflow/world-postgres` world). Versions as pinned in `package.json`
(`workflow@4.6.0`, `@workflow/world-postgres@4.3.0`, `graphile-worker@0.16.6`).

**Verdicts: T1 PASS · T2 (5-min variant) PASS · T3 PASS · T4 PASS · T5 PASS ·
T6 (code-change-under-parked-run + name-versioning mitigation) PASS ·
T2-48h IN PROGRESS (parked 2026-07-17 15:15 +08, resume due ≥2026-07-19 15:15 +08).**

Engine setup (`pnpm run db:setup`) created the `workflow` + `graphile_worker`
schemas and the `spike` domain schema on the first run, idempotently. Hard
kills throughout = `Stop-Process -Force` (TerminateProcess; no signal
handlers run), per `tests/acceptance.md`.

---

## Execution fixes made during the live run (committed)

1. **`pnpm setup` is shadowed by pnpm's built-in `setup` command** (it silently
   configured `PNPM_HOME` instead of running the package script). The aggregate
   script is renamed **`db:setup`**; sub-scripts `setup:engine` / `setup:domain`
   are unaffected.
2. **The world's `DATABASE_URL` fallback is CLI-only.** The runtime of
   `@workflow/world-postgres@4.3.0` reads **only `WORKFLOW_POSTGRES_URL`**
   (default `postgres://world:world@localhost:5432/world`) — the fallback the
   docs describe exists only in the bootstrap CLI (`dist/cli.js`), not the
   runtime (`dist/index.js`). First enqueue failed with a 500 `AggregateError`
   (pg trying localhost). Fixed with `scripts/worker.mjs`, which maps
   `DATABASE_URL → WORKFLOW_POSTGRES_URL` and defaults
   `WORKFLOW_TARGET_WORLD` / `PORT` before importing the built server.
3. A rename slip from the naming-convention pass (`setup:domain` still pointed
   at `apply-schema.ts` instead of `applySchema.ts`) — fixed.

---

## T5 — LISTEN/NOTIFY through Supavisor session mode: **PASS**

```
> pnpm probe
target:  aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
server:  PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
PASS: LISTEN/NOTIFY round trip ok (payload matched, 32ms)
```

Two separate connections (LISTEN on one, `pg_notify` on the other) — the
round trip crossed the pooler and server in 32ms. Corroboration: every test
below showed sub-second job pickup (NOTIFY-driven, not the 500ms poll).

## T1 — parked hook survives worker restart: **PASS**

Run `wrun_01KXQDW6S5651T3RDPZHSRS0C1`, opKey `t1-restart`, worker pid 82564.

- Parked state (before kill): run `running`; step
  `step//./workflows/steps//postEntry` **completed** (attempt 1); hook
  `approval:t1-restart` registered; `graphile_worker` queue **empty** (a
  parked hook holds no job — zero compute); postings=1, receipts=1
  (`rcpt-t1-restart`), step_invocations: post_entry x1; completions=0.
- `Stop-Process -Id 82564 -Force` → `pnpm status` re-run: **byte-identical
  state**, HTTP listener confirmed down.
- Restart (new pid 45040) → `pnpm resume approval:t1-restart` → within ~8s
  run `completed` (completed_at 2026-07-16T22:59:08Z engine clock).
- Final counts for `t1-restart`:
  `{ postings: 1, receipts: 1, completions: 1, post_entry_invocations: 1 }`
  — completion row carries run_id + `approved=true` + `approver=spike-operator`;
  finalize x1.

**PASS criteria met:** completion exists, postings==1, post_entry invocations==1
(no re-execution across the restart).

## T3 — mid-run kill + restart: replay with ZERO re-execution: **PASS**

Run `wrun_01KXQDZ7Q51CJEF31R0QF1K47J`, opKey `t3-midrun`, worker pid 45040.

- Mid-flight state verified before the kill: postEntry `completed` (attempt 1),
  hook `approval:t3-midrun` present, run not finished.
- Hard-killed pid 45040 → restart (pid 98416) → `pnpm resume approval:t3-midrun`.
- Run `completed` (23:00:35Z engine clock). Final counts:
  `{ postings: 1, receipts: 1, completions: 1, post_entry_invocations: 1, finalize_invocations: 1 }`

**PASS criteria met:** the resumed replay consumed the memoized `postEntry`
result — the step body never ran a second time (canary count stayed 1) and
exactly one posting exists.

## T4 — KILL-AFTER-COMMIT (Codex-mandated): **PASS**

Run `wrun_01KXQE2BKSSHQ713XWANP9QTKD`, opKey `t4-killcommit`, fault-armed
worker pid 49384 (`FAULT=kill-after-commit`).

- On enqueue the worker died within ~2s, printing:
  `[FAULT] kill-after-commit: posting committed (op_key=t4-killcommit, posting_id=3); exiting before step-completion ack`
- **Forensic snapshot with the worker dead** (the exact not-exactly-once
  window): `spike.postings` **1 row committed**, `spike.receipts` 1 row
  (`rcpt-t4-killcommit`, posting_id 3); engine step postEntry status
  **`running`** (completion never acked); canary post_entry x1 (note
  `fault-armed`); graphile job id 16 **locked by the dead worker**
  (`worker-87062210db7f1ddc8d`), attempts=1.
- Restarted a plain worker (pid 86312). Its boot log printed
  **`[world-postgres] Re-enqueued 1 active run(s) on startup`** and within
  ~5s — **before** `pnpm unstick` was run — the replay had already
  re-invoked the step: canary post_entry x2, engine step `completed`
  (attempt 2), hook re-registered. The DB idempotency key caught the
  re-invocation: postings **still 1**, receipts **still 1** with the **same**
  receipt id 3 / posting_id 3 / receipt_no.
- `pnpm resume approval:t4-killcommit` → run `completed`. The run's
  returnValue records `posted.wasDuplicate: true` — positive proof the
  memoized step result came from the idempotent replay path:
  `{"posted":{"postingId":"3","receiptId":"3","receiptNo":"rcpt-t4-killcommit","amountCents":12345,"wasDuplicate":true}, ...}`
- Final counts: `{ postings: 1, receipts: 1, completions: 1, post_entry_inv: 2, finalize_inv: 1 }`

**PASS criteria met: EXACTLY ONE posting, the SAME single receipt, post_entry
invocations == 2 (original + idempotent replay), run completes after resume.**

## T2 — parked hook survives a 5-minute park with the worker DOWN: **PASS**

Run `wrun_01KXQE7PQ6KM94A736NNMPED1M`, opKey `t2-park5min`.

- Parked state verified (postEntry completed, hook `approval:t2-park5min`
  registered), then worker pid 86312 hard-killed at **15:04:31 (+08:00)**.
- Worker fully DOWN for the whole park (listener probed dead at 15:08:30; no
  process, no compute; state held only by Postgres rows).
- Restarted at **15:10:00** (park ≈ **5m29s**, new pid 94416) → resume → run
  **completed** (~2s after resume);
  counts `{ postings: 1, receipts: 1, completions: 1, post_entry_invocations: 1 }`.
- The full 48h/3-restarts procedure remains documented in
  `tests/acceptance.md` (calendar time; not runnable in-session).

---

## T2-48h — IN PROGRESS (started 2026-07-17)

- Run `wrun_01KXQEVPPMX4XGZ2F4GFCYT3YE`, opKey `t2-park48h`, hook token
  `approval:t2-park48h`. **Enqueued 2026-07-17 15:15:08 (+08:00)** under
  build A; parked state verified (postEntry completed, hook registered,
  posting/receipt committed, canary post_entry x1); worker hard-killed
  15:15:48 and — after the T6 phases below — left **DOWN** at 15:22:07.
- The park has already survived (a) two hard kills, (b) two rebuilds
  (builds B and C), and (c) two boot-time re-enqueue replays, with the
  canary still at x1 and zero queue jobs held while parked.
- **Resume procedure (due ≥ 2026-07-19 15:15 +08):**
  `pnpm worker` → `pnpm resume approval:t2-park48h` → assert run completed,
  postings(t2-park48h)==1, post_entry invocations==1, completion row exists.
  NOTE: closeDemo was in-place-changed in build C (T6a below), so the resumed
  run is EXPECTED to complete with the adopted new-code markers:
  `approver='inplace-v2:spike-operator'`, an `audit_mark` canary row
  (`closeDemo-inplace-v2`), and `codeVersion` in the returnValue — that is
  the documented in-place-change behavior, not a failure.
- One permanently-failed tombstone job (id 16, the T4 crash's step job,
  attempts 3/3, unlocked) remains in `graphile_worker._private_jobs`; it can
  never run again (`is_available` requires attempts < max_attempts) and is
  kept as evidence. The parked 48h run holds NO queue job.

## T6 — workflow-code-change under a parked run + name-versioning: **PASS**

Setup: three runs parked under **build A** (the T1-T5 code state):
`t2-park48h` (above), `t6-inplace` (`wrun_01KXQEVQMVC94Z6MWP7ETM0PAG`),
`t6-pinned` (`wrun_01KXQEVRHDJ3EX2J01V42KB8VN`). Worker killed.

**Build B — the MITIGATION deploy (name-versioned V2 alongside untouched V1):**
added `closeDemoV2` (new workflow file; observable markers: `v2:` approver
prefix, extra `audit_mark` step, `codeVersion` in return) + `auditMark` step +
`--v2` enqueue support. `closeDemo` byte-identical. Rebuilt, restarted.

- Boot log: `[world-postgres] Re-enqueued 3 active run(s) on startup` —
  **parked runs count as "active" and are re-enqueued on every boot.** The
  replays consumed memoized steps and re-parked: canary counts stayed x1 for
  all three runs; no domain writes.
- `pnpm resume approval:t6-pinned` → run completed **on pure V1 semantics**:
  approver `spike-operator` (no prefix), NO `audit_mark` row, returnValue has
  NO `codeVersion` field, workflowName `workflow//./workflows/closeDemo//closeDemo`.
  **Old parked runs are untouched by a V2-alongside deploy.**
- `pnpm enqueue t6-v2-fresh --v2` → new run `wrun_01KXQF2Y56GWSGTEQMJATP233H`
  on workflowName `workflow//./workflows/closeDemoV2//closeDemoV2`; parked;
  resumed → completed **with full V2 markers** (approver `v2:spike-operator`,
  `audit_mark` = `closeDemoV2`). **New work rides V2 while V1 runs coexist.**

**Build C — the HAZARD (in-place change to closeDemo itself):** the post-hook
continuation now writes approver `inplace-v2:<name>`, runs an extra
`audit_mark` step, and returns `codeVersion` — the parked `t6-inplace` run
(created under build A) was then resumed under build C.

- Result: **the parked run silently ADOPTED THE NEW CODE mid-run.** Run
  completed (no error): approver `inplace-v2:spike-operator`, `audit_mark`
  canary row `closeDemo-inplace-v2` x1, returnValue
  `codeVersion: "closeDemo-inplace-v2"`. The already-completed `post_entry`
  stayed memoized (canary x1, `wasDuplicate:false` from the ORIGINAL
  invocation) — only the not-yet-executed portion ran on new code.
- Boot replay of the still-parked runs under the changed code was harmless
  (memoized prefix, re-park) because the change is entirely post-hook.

**Verdict:** confirmed empirically — self-hosted WDK has **no run pinning**:
an in-place edit silently changes the semantics of the un-executed remainder
of every in-flight run (it does not fail loud, and it does not preserve old
semantics). Additive post-park changes complete "successfully" with the NEW
semantics, which for accounting workflows is a silent-correctness hazard, not
a crash hazard. The name-versioning discipline fully mitigates it.

**Recommended production versioning policy (Clara runtime):**
1. A deployed workflow's body is **immutable** once any run of it can be
   in flight. Every behavioral change ships as a NEW exported workflow
   (`closeDemo_v2`, `closeDemo_v3`, ...); the old export stays in the tree
   until zero non-terminal runs reference its workflowName (queryable:
   `workflow.workflow_runs where name = ... and status not in ('completed','failed','cancelled')`).
2. Enqueue sites always target the newest version; a CI check should forbid
   editing the body of any workflow file marked frozen (lint rule /
   golden-hash test per frozen workflow).
3. Renaming or deleting a workflow export with in-flight runs is forbidden -
   the workflowName is derived from file path + export name, so a rename
   strands parked runs (their re-enqueue would find no matching workflow).
4. Exception permitted only for provably pre-park-idempotent hotfixes
   (bug in a step body whose DB writes are idempotency-keyed), because
   completed steps are memoized and never re-run - and even then prefer
   cancel + re-run-on-latest for anything money-touching.
5. Restart discipline: every boot re-enqueues ALL non-terminal runs and
   replays them against CURRENT code - deploys must therefore never ship a
   workflow-body change and assume parked runs are frozen. (This is also
   why the boot replay is cheap: memoized steps + re-park.)

## WDK behavior findings from the live run

1. **The world self-recovers active runs at startup** (not in the docs, missed
   in the pre-run source read): boot logs `[world-postgres] Re-enqueued N
   active run(s) on startup`, which re-enqueues interrupted runs under their
   dedup job keys and bypasses the dead worker's stale job lock. Consequence:
   crash recovery after restart was **automatic and immediate** in T4 —
   `pnpm unstick` was NOT needed for this path. The graphile 4-hour stale-lock
   reclaim (verified in graphile-worker 0.16.6 sources) still exists
   underneath; `unstick` stays as an instrument for any state the startup
   sweep does not cover (none observed in this spike). T6 refinement: the
   sweep counts **parked-at-hook runs too** — every boot replays ALL
   non-terminal runs against current code (memoized steps, re-park; harmless
   for unchanged prefixes, and the mechanism behind T6a's mid-run code
   adoption).
2. **At-least-once is real, and the DB idempotency key is the floor.** T4 is
   the direct demonstration: the engine re-invoked a step whose transaction
   had already committed; only `ON CONFLICT (op_key)` kept the books correct.
   Codex Addendum 3, refinement 1 is confirmed empirically: DB idempotency
   keys on every mutation are permanent and mandatory.
3. **Step memoization works as claimed** (T1/T3): completed steps are never
   re-executed on replay — the canary table proves invocation counts stayed
   at 1 across kill/restart/resume cycles.
4. **A parked hook holds no queue job** — `graphile_worker._private_jobs` is
   empty while parked, confirming the zero-compute claim; resume creates the
   continuation job.
5. **Engine `timestamp` columns are timezone-naive.** The engine's drizzle
   schema uses `timestamp` (no tz), so node-postgres renders them shifted by
   the local UTC offset when read from a +08:00 machine (engine rows appear
   8h behind the `timestamptz` domain rows in `pnpm status`). Display
   artifact only — internally consistent — but worth remembering when eyeballing
   engine tables from Malaysia time.
6. **Sub-second pickup everywhere** — enqueue-to-step and resume-to-completion
   latencies were dominated by the ~8s assertion sleeps in the procedures;
   observed pickup was consistently <1s (LISTEN/NOTIFY working through the
   session pooler, matching the 32ms probe).
7. Windows quirk (cosmetic): graphile-worker logs
   `Executable file detection not yet supported on 'win32'` twice at boot;
   no functional impact observed.

---

## T2-48h FINAL SIGN-OFF (2026-07-19, the cutover ceremony)

**PASS — owner-ratified.** The 48-hour park (`approval:t2-park48h`, run
`wrun_01KXQEVPPMX4XGZ2F4GFCYT3YE`, enqueued 2026-07-17 15:15:10 +08) was resumed
at the ceremony after **46h 17m** — the owner explicitly ruled the evidence
sufficient ahead of the full 48h mark. Observed on resume: hook consumed and run
`completed` in seconds; `t2-park48h` posting count STILL exactly 1 (memoized
prefix did not re-execute); receipt 1; canary invocation 1; the documented T6a
in-place-change markers present (`approver='inplace-v2:spike-operator'`,
`audit_mark='closeDemo-inplace-v2'`). Full `pnpm status` output archived in the
ceremony evidence file; forensic JSON dump of all four schemas taken BEFORE the
owner-approved drop of `workflow`/`graphile_worker`/`spike` — plus the
**fourth spike-era schema `workflow_drizzle`** (the engine's migration journal),
whose survival initially made the fresh engine bootstrap silently no-op (a
runbook lesson: the drop list was one schema short). Slice 0 is CLOSED; the
production engine schemas were re-bootstrapped clean and the world is ON.
