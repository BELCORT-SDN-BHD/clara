# Runtime hard restart — the recovery steps (standing runbook)

*Minted 2026-08-20 from the F-A1 corpus run's live incident (F-A2 opener ⑤). Full record:
`docs/plan/completed/f-a1-corpus-measurement.md`, "The incident the run exposed" §2.*

A **hard** restart is any restart that was not a graceful drain: a kill, an OOM, a crash, a
forced machine replacement, a `fly machine restart` on a wedged VM. The runtime recovers its own
durable state on its own (that is what the reconciler is for) — but it cannot recover the
**connections the dead VM never closed**. That is this runbook.

---

## 1. Clear the zombie pooler sessions (MANDATORY after any hard restart)

**The symptom.** A machine that dies without a clean shutdown does not get to close its pooler
sessions. Supabase's **session** pooler keeps them: `idle`, each still holding a server
connection. The replacement VM then cannot connect at all — it is competing for a pool the
corpse still owns. Measured live on 2026-08-20: **15 idle `clara_runtime_login` sessions**
survived the old VM and starved the new one's connects entirely. `/ready` flapped and the
runtime's heartbeats starved.

It does not heal on its own within any useful window: an `idle` session is not `idle in
transaction`, so `idle_in_transaction_session_timeout` (set on every runtime checkout —
`packages/runtime/lib/pools.mjs`) never reaps it.

**Run as the project admin identity** — the session-pooler DSN on **port 5432**, the same one
`docs/ops/DR.md` §9 inventories as `DATABASE_URL`. **Never** as `clara_runtime_login` itself:
that login cannot terminate its siblings, and it is the identity being cleaned up. The DSN comes
from the environment only — never code, never argv. TLS: pipe it through the committed CA-pinned
bridge (`docs/ops/dsn-bridge.md`) — `sslmode=verify-full`, never `no-verify`.

It is cheap and idempotent, so run it whenever a restart *might* have been hard rather than
trying to establish that it was soft.

### Step 1 — LOOK. Never terminate a population you have not counted

```sql
select pid, state, state_change, left(coalesce(query, ''), 60) as last_query
  from pg_stat_activity
 where usename = 'clara_runtime_login'
   and state = 'idle'
   and state_change < now() - interval '5 minutes'
 order by state_change;
```

A healthy live VM shows few rows or none: its pool churns, so its idle sessions are young. Rows
whose `state_change` predates the restart are the corpse's. Write the count down — step 3
compares against it.

### Step 2 — terminate exactly that set

```sql
select pg_terminate_backend(pid) as terminated, pid, state_change
  from pg_stat_activity
 where usename = 'clara_runtime_login'
   and state = 'idle'
   and state_change < now() - interval '5 minutes'
   and pid <> pg_backend_pid();
```

Four fences, each load-bearing:

| Fence | Why |
|---|---|
| `usename = 'clara_runtime_login'` | Scopes the blast radius to the runtime pool alone. The read (`clara_agent_read_login`) and write (`clara_wake_write_login`) pools have their own sessions and are never touched. |
| `state = 'idle'` | Excludes both `active` and `idle in transaction`, so nothing mid-statement and nothing holding a transaction is killed. |
| `state_change < now() - interval '5 minutes'` | Spares a session the **new** VM has just opened. Every runtime checkout is short-lived, so a genuinely-in-use session is never this old. |
| `pid <> pg_backend_pid()` | Stops the cleanup session terminating itself before it finishes. |

### Step 3 — confirm recovery POSITIVELY

1. Re-run step 1. It must return no rows older than the restart.
2. Read `/ready` on the runtime: HTTP **200** with `checks.db.ok = true`.

A `/ready` still returning 503 means the starvation had a different cause and this step was not
it — escalate rather than widening the predicate above. In particular, **do not** extend step 2
to `idle in transaction`: those rows are a different fault (a session that died mid-transaction)
with its own timeout, and terminating them by hand can abort work that is still legitimately
open.

---

## 2. The rest of the restart checklist

- **Rollback preflight is separate and still mandatory** if the restart is also a version
  change — a blind revert strands every non-terminal run. `packages/runtime/README.md`,
  "Rollback preflight".
- **A deep queue is not a stuck queue.** After a restart the document reconciler paces its
  re-minting to the lanes' free concurrency slots (`packages/runtime/lib/reconciler-pacing.mjs`),
  so a backlog drains at lane speed rather than storming the pool. `documentPacedDeferred` in the
  sweep receipt is the count it deliberately held back; it is not an error.
- **Backup / restore / DR proper** — a hard restart is not a data-loss event and needs none of
  it — lives in `docs/ops/DR.md`.
