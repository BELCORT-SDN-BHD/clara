# Slice-0 spike results — 2026-07-17

Executed against a fresh hosted Supabase project, Supavisor **session mode**
(`aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`, PostgreSQL 17.6),
from Windows 11 / Node v20.19.5 / pnpm 10.33.0. Worker = the built
`.output/server/index.mjs` via `scripts/worker.mjs` (long-lived Node process,
`@workflow/world-postgres` world). Versions as pinned in `package.json`
(`workflow@4.6.0`, `@workflow/world-postgres@4.3.0`, `graphile-worker@0.16.6`).

**Verdicts: T1 PASS · T2 (5-min variant) PASS · T3 PASS · T4 PASS · T5 PASS.**

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

## WDK behavior findings from the live run

1. **The world self-recovers active runs at startup** (not in the docs, missed
   in the pre-run source read): boot logs `[world-postgres] Re-enqueued 1
   active run(s) on startup`, which re-enqueues the interrupted run under its
   dedup job key and bypasses the dead worker's stale job lock. Consequence:
   crash recovery after restart was **automatic and immediate** in T4 —
   `pnpm unstick` was NOT needed for this path. The graphile 4-hour stale-lock
   reclaim (verified in graphile-worker 0.16.6 sources) still exists
   underneath; `unstick` stays as an instrument for any state the startup
   sweep does not cover (none observed in this spike).
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
