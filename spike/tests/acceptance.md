# Slice-0 acceptance tests (T1-T5)

Five copy-paste-runnable procedures proving the Workflow DevKit durable engine
against Supabase Postgres. **No LLM anywhere** - these test the ENGINE
(durability / HITL / idempotency).

## Prerequisites (once)

```powershell
cd C:\Users\zhant\Desktop\clara-rebuild\spike
pnpm install
Copy-Item .env.example .env      # then paste the Supabase SESSION-mode DATABASE_URL (port 5432)
pnpm run db:setup                # engine bootstrap (workflow + graphile_worker schemas) + domain schema.sql
pnpm build                       # compile once; do NOT rebuild between a kill and a restart mid-test
```

Two terminals: **A** runs the worker, **B** runs commands.

### Shared vocabulary

| Action | Command |
|---|---|
| start worker | `pnpm worker` (terminal A, leave running) |
| worker pid | `(Invoke-RestMethod http://localhost:3100/health).pid` (also printed at boot: `[spike] worker up pid=...`) |
| **hard kill** (crash simulation) | `taskkill /F /PID <pid>` |
| observe everything | `pnpm status` (works with the worker down - reads Postgres directly) |
| clean slate | `pnpm reset --yes` |

> **Ctrl+C is NOT a crash.** graphile-worker installs signal handlers and
> releases its job locks on graceful shutdown. Crash tests MUST use
> `taskkill /F` (or the T4 fault, which calls `process.exit(1)`).

> **Crash-lock recovery (revised after the 2026-07-17 live run).** On boot the
> world re-enqueues interrupted active runs (`[world-postgres] Re-enqueued N
> active run(s) on startup`) under their dedup job keys, bypassing the dead
> worker's stale graphile lock - in the live T4, replay resumed within ~5s of
> the restart with **no intervention**. Underneath, graphile-worker 0.16.6's
> own stale-lock reclaim is a fixed **4 hours** (`resetLockedAt`); keep
> `pnpm unstick` in the toolbox for any state the startup sweep does not
> cover (none observed live). Killing while a run is **parked at a hook**
> (T1/T2/T3 deterministic path) leaves no locked job at all.

---

## T1 - parked hook survives worker restart

1. `pnpm reset --yes`
2. Terminal A: `pnpm worker` - wait for `[spike] worker up pid=...`
3. Terminal B: `pnpm enqueue` - record `runId`, `opKey`, `hookToken`.
4. Wait ~5s, then `pnpm status`. Expect:
   - `workflow.workflow_runs`: the run present, **not** `completed`
   - `workflow.workflow_steps`: `post_entry` **completed**
   - `workflow.workflow_hooks`: a row with token `approval:<opKey>`
   - `spike.postings`: **1 row** for opKey; `spike.receipts`: 1 row `rcpt-<opKey>`
   - `spike.step_invocations`: `post_entry` x1; **no** `finalize`; no completions
5. Hard-kill the worker: `taskkill /F /PID <pid>`
6. `pnpm status` again → **identical state** (everything lives in Postgres; nothing was lost with the process).
7. Terminal A: `pnpm worker` (restart, same build).
8. Terminal B: `pnpm resume approval:<opKey>`
9. Within ~5s, `pnpm status`:
   - run `completed`; `spike.completions` has 1 row (`approved=true`, `approver=spike-operator`)
   - `spike.step_invocations`: `post_entry` **still x1** (no re-execution), `finalize` x1
   - still exactly 1 posting + 1 receipt

**PASS:** completion row exists AND postings(opKey)==1 AND post_entry invocations==1.

---

## T2 - parked hook survives >=48h (procedure; 5-minute variant runnable now)

**5-minute variant (run now):** exactly T1, but between step 5 (kill) and
step 7 (restart) leave the worker **fully down for >=5 minutes**. Then restart,
resume, and apply T1's PASS assertions. While parked: zero compute anywhere -
verify no process is running and the hook row simply sits in
`workflow.workflow_hooks`.

**Full 48h procedure (needs calendar time):**
1. Day 0: `pnpm reset --yes`; start worker; `pnpm enqueue`; record token; verify parked state (T1 step 4).
2. Over the next 48h+, hard-kill and restart the worker **at least 3 times**
   (the Grt-7 scenario: redeploys while an interview waits). Between restarts,
   optionally `pnpm status` - parked state must be byte-identical.
3. After >=48h: `pnpm resume approval:<opKey>`.
4. Apply T1's PASS assertions. Additionally expect `workflow_hooks.created_at`
   to be >=48h older than `spike.completions.created_at`.

**PASS:** same as T1, with the park duration >=48h and >=3 worker restarts in between.

---

## T3 - mid-run kill + restart: replay with ZERO re-execution of completed steps

Deterministic path (kill after step A completed, before the run finishes):

1. `pnpm reset --yes`; Terminal A: `pnpm worker`.
2. Terminal B: `pnpm enqueue`; wait ~5s until `pnpm status` shows `post_entry`
   **completed** and the hook row present (the run is mid-flight: step A done,
   step B not yet reachable).
3. Hard-kill the worker (`taskkill /F /PID <pid>`).
4. Terminal A: `pnpm worker` (restart).
5. Terminal B: `pnpm resume approval:<opKey>` - resuming forces the engine to
   **replay** the workflow function over its recorded history to continue.
6. `pnpm status` after ~5s:
   - run `completed`; completion row present
   - **`spike.postings` has exactly ONE row** for opKey
   - **`spike.step_invocations` shows `post_entry` x1** - the replay consumed
     the memoized step result; the step body never re-ran
   - `finalize` x1

**PASS:** postings(opKey)==1 AND post_entry invocations==1 AND run completed.

Racy variant (optional, converges with T4): kill within <1s of `pnpm enqueue`
so the kill lands **while** the `post_entry` job is locked and executing. On
restart the world's startup sweep re-enqueues the active run and the job
re-runs (live-verified in T4); if the first invocation had already committed,
the second lands on ON CONFLICT (wasDuplicate) - same assertions as T4.

---

## T4 - KILL-AFTER-COMMIT (the Codex-mandated test)

Simulates worker death **after** the financial transaction commits but
**before** the engine records step completion - the exact window where step
memoization cannot be exactly-once and the DB idempotency key must catch the
re-invocation (runtime-recommendation Addendum 3, refinement 1).

1. `pnpm reset --yes`
2. Terminal A: `pnpm worker:fault` (runs with `FAULT=kill-after-commit`).
3. Terminal B: `pnpm enqueue` - record `opKey`, `runId`, `hookToken`.
4. Within ~2s Terminal A prints
   `[FAULT] kill-after-commit: posting committed (op_key=...) ; exiting before step-completion ack`
   and the process **exits(1)**.
5. `pnpm status` - the forensic snapshot:
   - `spike.postings`: **1 row** (the transaction COMMITTED before death)
   - `spike.receipts`: 1 row `rcpt-<opKey>` (same transaction)
   - `workflow.workflow_steps`: `post_entry` **not completed**
   - `spike.step_invocations`: `post_entry` x1, note `fault-armed`
   - `graphile_worker jobs`: the step job **locked** by the dead worker
6. Terminal A: `pnpm worker` (restart WITHOUT the fault - plain `pnpm worker`).
   The boot log prints `[world-postgres] Re-enqueued 1 active run(s) on
   startup` - the world's own crash recovery (live-verified 2026-07-17); no
   `pnpm unstick` was needed. (Keep unstick in reserve per the caveat at top.)
7. Within ~5s the engine **re-invokes** `post_entry` (an at-least-once replay -
   expected!). `pnpm status`:
   - `spike.step_invocations`: `post_entry` **x2**
   - `spike.postings`: **STILL exactly 1 row** for opKey (ON CONFLICT caught it)
   - `spike.receipts`: **STILL exactly 1 row**, SAME `receipt_no` (`rcpt-<opKey>`), SAME `posting_id`
   - `workflow.workflow_steps`: `post_entry` now completed; hook row present
8. `pnpm resume approval:<opKey>` → run completes. The recorded step result
   carries `wasDuplicate: true` (visible in the run's returnValue via
   `Invoke-RestMethod http://localhost:3100/demo/run/<runId>`) - positive
   evidence the idempotent replay path executed.

**PASS:** EXACTLY ONE posting AND exactly one receipt with the same
receipt_no/posting_id AND post_entry invocations==2 AND the run completes
after resume.

---

## T5 - LISTEN/NOTIFY through Supavisor session mode

```powershell
pnpm probe
```

Expected output: the Postgres server version, then
`PASS: LISTEN/NOTIFY round trip ok (payload matched, <n>ms)` - exit code 0.
The probe uses **two separate connections** on DATABASE_URL (one LISTEN, one
NOTIFY), so the notification round-trips through the pooler and server, not a
single socket.

Failure mode worth demonstrating once: point DATABASE_URL at transaction mode
(port 6543) and re-run - it must FAIL with the 10s timeout message. Session
mode (5432) is a hard requirement of the engine (graphile-worker job pickup
and stream distribution both ride LISTEN/NOTIFY).

**PASS:** probe exits 0 on the session-mode DATABASE_URL. Corroborating
evidence: T1 completing at all (job pickup uses LISTEN/NOTIFY with a 500ms
poll fallback - watch for sub-second step pickup, which indicates NOTIFY, not
the poll).
