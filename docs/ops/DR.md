# Clara — Backup / Restore / Disaster-Recovery contract

*Fixes the audit's GAP1-6 (no DR contract for the 7-year source of truth) and
GAP1-7 (liveness-only, no readiness). Status: Slice-1 ops floor, 2026-07-17.*

The shared Supabase Postgres is Clara's **single source of truth** and a
**7-year statutory record** (ITA s.82/82A, CA2016 s.245 — retention anchors at
period-end + filing date, `docs/architecture/ARCHITECTURE.md` §7a). Losing it is
unrecoverable in a way losing the runtime or dashboard is not. This document is
the binding DR contract.

---

## 1. What is protected, and the targets

| | |
|---|---|
| **Protected asset** | The shared Postgres (all firm books, subledgers, registers, documents index, events, runtime tables). |
| **Derived state** | Projections/read models are **rebuildable from the event log** (ARCHITECTURE §2.2) — they are not separately backed up; the event log is. |
| **Storage objects** | Firm document bytes live in Supabase Storage (firm-scoped, write-once). Backed up separately from the DB — see §5. |
| **RPO (max data loss)** target | ≤ 24h on the managed floor; ≤ few minutes with PITR (see §3). |
| **RTO (max downtime)** target | ≤ 4h to restore into a fresh project from the latest dump/backup. |

These are **targets for the pilot**, to be re-set with the owner before any real
client data lands. They are not yet SLAs.

---

## 2. Supabase managed backups — what each plan actually provides

Verified against Supabase docs (`https://supabase.com/docs/guides/platform/backups`,
fetched 2026-07-17):

| Plan | Daily backups | Retention | PITR |
|---|---|---|---|
| **Free** | **Not included** | — | **Not available** |
| Pro | Included | last **7 days** | Paid add-on (requires ≥ Small compute add-on) |
| Team | Included | last **14 days** | Paid add-on |
| Enterprise | Included | up to **30 days** | Paid add-on |

- Projects on Postgres **15.8.1.079+** use **physical** backups; older use logical.
  This project is **Postgres 17.6**, so managed backups (on a paid plan) are physical.
- Supabase's own guidance for Free projects: *"regularly export their data using
  the Supabase CLI `db dump` command"* and keep off-site copies.

### Current posture (ACTION REQUIRED — owner decision)

The fresh project `bzecqklouchkmdmdxlln` (region ap-southeast-1) is on the
**Free plan** unless upgraded (confirm in Dashboard → Settings → Billing).

> **On Free, there are NO managed backups and NO PITR.** For a 7-year source of
> truth this is not acceptable at pilot. The **repo-side backup tooling in §4 is
> the only DR floor until the plan is upgraded.**
>
> **Recommended before any real client data:** upgrade to **Pro** (daily
> backups, 7-day retention) **and enable the PITR add-on** (drops RPO from ~24h
> to minutes). This is an owner/billing decision, tracked from this slice.

---

## 3. Recovery scenarios

| Scenario | With PITR (paid) | Managed daily only (Pro) | Free (today) |
|---|---|---|---|
| Accidental bad write / bad migration | Roll back to a timestamp before it | Restore latest daily (≤24h loss) | Restore from the most recent repo-side dump (§4) |
| Project/region loss | Restore to a new project from physical backup | Same | Re-provision + restore the last off-site dump (§4) |
| Single-table/schema corruption | PITR clone + selective copy | Dump-from-backup + selective restore | `restore.mjs` a scoped dump (§4) |

Until PITR is enabled, **the RPO equals the age of the last repo-side dump** — so
the dump cadence in §4 is the real RPO lever.

---

## 4. Repo-side backup/restore (runnable; the Free-tier floor)

Two dependency-light scripts in `@clara/db` (Supabase's recommended `db dump`
path, implemented directly so it runs anywhere with a Postgres client):

- `packages/db/scripts/backup.mjs` — `pg_dump` (schema+data) → timestamped
  plain-SQL file under `packages/db/backups/` (gitignored — dumps may hold data).
- `packages/db/scripts/restore.mjs` — `psql` apply of a dump into a target.
- `packages/db/scripts/dr-selftest.mjs` — a full **dump → drop → restore →
  verify** round-trip in a throwaway `dr_selftest` schema.

Connection is via **libpq env vars only** (`PGHOST/PGPORT/PGUSER/PGPASSWORD/
PGDATABASE`) — no DSN in code or argv, so no credential is ever committed.

### pg_dump version requirement

`pg_dump` **must match the server major version** (this server is **17**). A
v16 client aborts with *"server version mismatch"*. On a machine whose PATH
`pg_dump` is older, point `PG_DUMP` at a v17 binary:

```sh
export PG_DUMP=/path/to/pg17/bin/pg_dump   # v17 client
```

CI installs `postgresql-client-17` for this reason (`.github/workflows/ci.yml`).

### Running a real backup

```sh
export PGHOST=... PGPORT=5432 PGUSER=... PGPASSWORD=... PGDATABASE=postgres
export PG_DUMP=/path/to/pg17/bin/pg_dump      # if PATH pg_dump < 17
pnpm db:backup                                 # whole clara schema -> backups/
node packages/db/scripts/backup.mjs --all      # or the whole database
```

Keep the resulting file **off-site** (the project itself is not a backup of itself).

---

## 5. Exercised evidence (a real restore, not a described one)

The `dr:selftest` was executed **against the live Postgres 17.6 project** on
2026-07-17 using a v17 `pg_dump`. It creates a throwaway `dr_selftest` schema,
backs it up, **drops it** (simulating loss), restores from the dump, and asserts
the rows returned identical — then cleans up. Verbatim run:

```
DR self-test · target aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
step 1: create dr_selftest schema + synthetic rows
  before: rows=5 sum_cents=15000
step 2: backup (pg_dump) dr_selftest
  backup file: clara-dr_selftest-2026-07-17T07-56-07-419Z.sql (2114 bytes)
step 3: DROP schema dr_selftest (simulate data loss)
  schema dropped, confirmed absent
step 4: restore (psql) from backup
  CREATE SCHEMA / CREATE TABLE / COPY 5 / setval 5
step 5: verify restored rows are identical
  after:  rows=5 sum_cents=15000
step 6: clean up (drop dr_selftest)

DR self-test: PASS — dump+restore round-trip verified, rows identical, target left clean.
```

The dump was a valid PG17 plain-SQL file (`Dumped by pg_dump version 17.6`), and
the restore replayed `CREATE SCHEMA → CREATE TABLE → COPY 5 → setval` cleanly.
This proves the tooling works end-to-end against the real SoT. The throwaway
schema and backup file were removed; the project was left clean (the Slice-0
spike's `workflow`/`graphile_worker`/`spike` schemas and its parked run were
never touched — the DR test is fully schema-isolated).

Re-run this **quarterly** and after any change to the backup tooling — a backup
you have never restored is not a backup.

---

## 6. Readiness probe (fixes GAP1-7: readiness, not liveness-only)

`@clara/runtime` exposes two probes (`packages/runtime/src/index.ts`):

- `GET /health` — **liveness**: the process is up (no dependencies). For
  restart/keepalive.
- `GET /ready` — **readiness**: performs a real DB round-trip (`select 1`) and
  returns **503** when the DB is unreachable, so an orchestrator/load balancer
  holds traffic instead of routing to an instance that cannot reach the source
  of truth. Also reports whether the durable world is enabled.

Verified locally (2026-07-17) against the live DB:

```
GET /health -> {"ok":true,"service":"clara-runtime",...}
GET /ready  -> {"ready":true,"checks":{"db":{"ok":true,"latency_ms":122},"world":{"enabled":false}}}  HTTP 200
```

When the DB is down, `/ready` returns `{"ready":false,...}` with HTTP 503.

---

## 7. SLO + alerting plan

Targets to enforce once the runtime is deployed (Fly) — the probe and DB-backed
run history exist now; the alert wiring is a fast follow-up.

| SLO | Target | Signal | Alert when |
|---|---|---|---|
| Runtime availability | 99.5% monthly | `/ready` == 200 (external check, 30s) | 2 consecutive failures |
| DB reachability | 99.9% | `/ready` `checks.db.ok` | any false for >1 min |
| DB read latency | p95 < 300ms | `/ready` `checks.db.latency_ms` | p95 > 1s for 5 min |
| Backup freshness (Free/Pro) | dump age < 24h | last `backups/` timestamp / managed backup age | age > 26h |
| Restore drill | passes quarterly | `dr:selftest` exit code | any failure |
| Durable-run backlog (Slice 4+) | drained < 5 min | outbox / graphile queue depth | depth rising 10 min |

**Where:** external uptime check (e.g. a scheduled probe / uptime monitor)
hitting `/ready`; DB metrics from Supabase's dashboard + the `/ready` latency
field; backup-age from a scheduled job comparing the newest dump timestamp.
Route alerts to the owner (email/tools@belcort.com) — a single-maintainer
escalation path for the pilot. The alerting **wiring** is a follow-up; the
**probe + the plan** land here so nothing ships blind.

---

## 8. Open items (owner)

1. **Confirm the project plan and, before real data, upgrade to Pro + PITR.**
   On Free there is zero managed DR; the repo-side dump is the only floor.
2. **Off-site dump destination** — decide where scheduled dumps are stored
   (they must leave the Supabase account to survive account/region loss).
3. **Storage-bucket backup** — document bytes in Supabase Storage need their own
   copy path (the DB dump does not include Storage objects). Wire in Slice 5
   when the document pipeline lands.
4. **Wire the alerting** in §7 once the runtime is deployed.
