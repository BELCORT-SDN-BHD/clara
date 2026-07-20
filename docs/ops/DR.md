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

Dependency-light scripts in `@clara/db` (Supabase's recommended `db dump` path,
implemented directly so it runs anywhere with a Postgres client):

- `packages/db/scripts/backup.mjs` — `pg_dump` (schema+data) → timestamped
  plain-SQL file under `packages/db/backups/` (gitignored — dumps may hold data).
- `packages/db/scripts/restore.mjs` — `psql` apply of a dump into a target.
- `packages/db/scripts/dr-selftest.mjs` — a full **dump → drop → restore →
  verify** round-trip in a throwaway `dr_selftest` schema.
- `packages/db/deploy/roles-bootstrap.sql` · `scripts/restore-full.mjs` ·
  `scripts/dr-verify.mjs` — the **full-profile** DR path (recreate roles → ordered
  restore → verification battery). See **`docs/ops/DR-full-drill.md`**.

### Two backup profiles (be honest about what each protects)

- **DEFAULT** (`pnpm db:backup`, schema `clara`) — a **DIAGNOSTIC** books snapshot
  ONLY, dumped **WITHOUT** owners/privileges (`--no-owner --no-privileges`) and without
  the durable schemas. It **must NEVER be started as an application database** (Codex
  HIGH-2): a restore yields postgres-owned, PUBLIC-EXECUTABLE functions (the write wall
  is OPEN — `clara_agent_ro` can execute `approve_entry`), and because it carries
  `clara.schema_migrations`, a re-migrate is a **no-op** that never rebuilds the
  ownership/GRANT wall. Use it for inspection/diffing; **production recovery is
  full-profile only.**
- **FULL** (`pnpm db:backup:full`) — the **production DR profile**: all four
  authoritative schemas (`clara` + the durable trio `workflow` /
  **`workflow_drizzle`** / `graphile_worker`) dumped **WITH owners AND privileges**.
  The two-lane security model *is* the GRANT/REVOKE matrix + `clara_fn_owner` object
  ownership — a `SECURITY DEFINER` writer runs as its owner, so a `--no-owner` restore
  is a **privilege-escalation**, not a cosmetic gap. Roles are cluster-level (not in a
  `pg_dump`) and recreated by `deploy/roles-bootstrap.sql`; the globals dump beside the
  backup is an **evidence/diff** artifact only. Scheduled DR **must** use the full
  profile. Full runbook + tooling + off-site scheduling design: `docs/ops/DR-full-drill.md`.

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

> **Scope of what is exercised vs. what is still required (finding 10).** This
> drill exercises the **default** profile (a single throwaway schema) — it proves
> the `pg_dump`/`psql` tooling round-trips, not that a real recovery is complete.
> The **full-profile tooling is now built and rehearsed** (hardening interlude):
> `db:backup:full` (owners + privileges + the four authoritative schemas incl.
> `workflow_drizzle`), `deploy/roles-bootstrap.sql`, `db:restore:full`, and the
> `db:dr:verify` battery — see **`docs/ops/DR-full-drill.md`**. It was rehearsed
> end-to-end on a local `postgres` throwaway (§5b), and CI runs the whole
> backup→restore→verify chain on an ephemeral pair (the "DR full-profile round-trip" CI step). What
> **remains** is the **fresh-Supabase-project drill** (real `auth`/`storage`
> recovery + encrypted off-site scheduling + freshness alerts), which is
> **OWNER-GO-gated** and tracked in `docs/PROJECTLOG.md` PART 2. Do not treat the
> single-schema drill as evidence of full recoverability.

### 5b. Full-profile fresh-project drill evidence — PENDING (OWNER GO)

The local-throwaway rehearsal (2026-07-20) passed the full sequence
(`db:backup:full` → `roles-bootstrap` → `db:restore:full` → `db:dr:verify`: **all
battery probes PASS**, ownership + grant matrix + RLS + policies + role census +
memberships all identical, the confinement smoke returned 42501, and the AP-gate
expression matched source == target). The **fresh-Supabase-project** evidence (a real
`auth`/`storage` recovery + the parked-canary resume + the AP gate at RM 1,350,938.21)
is pasted here once the owner-GO drill runs. The post-restore ceremonies
(`roles-bootstrap` → full restore → `storage-provision` + bucket + bytes →
`write-login-ceremony` → **`acl-baseline` re-apply** → engine-sanity → `dr-verify`)
are the runbook in `docs/ops/DR-full-drill.md` §3. Note the **ACL baseline is not
carried by any dump** — re-applying `deploy/acl-baseline.sql` is a mandatory
post-restore step (a restore recreates `public` with its default PUBLIC USAGE, which
would re-open the confined agent/wake lanes' reach).

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
   (they must leave the Supabase account to survive account/region loss). A design
   with a recommendation (scheduled Windows Task + `age` + `rclone` to R2/B2, plus a
   dead-man's-switch freshness alarm) is in `docs/ops/DR-full-drill.md` §6 — **OWNER
   DECISION pending**.
3. **Storage-bucket backup** — document bytes in Supabase Storage need their own
   copy path (the DB dump does not include Storage objects); the recovery path is
   `docs/ops/DR-full-drill.md` §4 (re-provision bucket → `storage-provision.sql` →
   re-upload byte mirror → sha256-verify). The scheduled byte mirror is part of the
   §6 off-site design (OWNER DECISION).
4. **Wire the alerting** in §7 once the runtime is deployed (the dead-man's-switch
   freshness alarm is the §6 recommendation).
5. **Full-profile DR — tooling BUILT + rehearsed; the fresh-project drill is the
   remaining gate.** `db:backup:full` (owners+privileges, four schemas),
   `deploy/roles-bootstrap.sql`, `db:restore:full`, and the `db:dr:verify` battery
   are built, rehearsed on a local throwaway (§5b), and CI-guarded (the "DR full-profile round-trip" CI step).
   The **fresh-Supabase-project drill** (real `auth`/`storage` recovery + off-site
   scheduling + freshness alerts) is **OWNER-GO-gated** and **REQUIRED before any real
   client data**. Runbook: `docs/ops/DR-full-drill.md`. Tracked in `docs/PROJECTLOG.md` PART 2.
