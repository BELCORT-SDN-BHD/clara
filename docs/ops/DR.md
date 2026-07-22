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

### Current posture (VERIFIED 2026-07-20)

The project `bzecqklouchkmdmdxlln` (ap-southeast-1) sits in an organization on the
**Pro plan** — owner-confirmed in Dashboard → Settings → Billing. It therefore has
**managed daily physical backups with 7-day retention**.

> **Correction of record.** This section previously stated the project was "on the
> Free plan unless upgraded" — an unverified Slice-1 assumption that was carried
> forward and later reasoned on as if settled (it produced an "upgrade to Pro"
> recommendation for a plan that was already active). Supabase billing is
> **per-organization**; confirm the ORG, not the project.
>
> **What is actually in place:** daily physical backups, 7-day retention → managed
> **RPO ≤ 24h**. **PITR is NOT enabled** (owner decision 2026-07-20 — deferred for
> later re-assessment, §8 item 1). The residual: no roll-back-to-a-timestamp for a
> bad write or migration; recovery granularity is the last daily backup. That is why
> the §4 off-site cadence and the D1 write-quiesce discipline on writer-body
> migrations carry real weight.
>
> **Spend cap is ENABLED on the org.** Supabase's warning is explicit: exceeding the
> included usage quota can make projects **unresponsive or read-only**. Consequence
> for operations: never provision an additional project (e.g. a DR scratch target) in
> this organization — a rehearsal must not be able to consume the live books' compute
> budget. Use a separate Free organization.

---

## 3. Recovery scenarios

**Bold = our posture today** (Pro, daily backups, no PITR — §2).

| Scenario | With PITR (not enabled) | **Managed daily only (Pro) — TODAY** | If ever unplanned/Free |
|---|---|---|---|
| Accidental bad write / bad migration | Roll back to a timestamp before it | **Restore latest daily (≤24h loss)** | Restore from the most recent repo-side dump (§4) |
| Project/region loss | Restore to a new project from physical backup | **Same** | Re-provision + restore the last off-site dump (§4) |
| Single-table/schema corruption | PITR clone + selective copy | **Dump-from-backup + selective restore** | `restore.mjs` a scoped dump (§4) |

Without PITR, **the finest recovery granularity is the last daily backup** — so for
anything that happened since it, the repo-side dump cadence in §4 is the real RPO
lever, and the off-site copy is what survives an account/region loss the managed
backups (same account) would not.

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
> end-to-end on a local `postgres` throwaway, CI runs the whole
> backup→restore→verify chain on an ephemeral pair (the "DR full-profile round-trip" CI step), and the
> **fresh-Supabase-project drill is DONE** (2026-07-20, **177/0 STRICT** — §5b;
> real `auth`/`storage` recovery included). What **remains** is only the **R2
> off-site wiring** (encrypted scheduled dumps + freshness alerts; PITR stays a
> deferred owner item — §8). Do not treat the single-schema drill alone as
> evidence of full recoverability — §5b is that evidence.

### 5b. Full-profile fresh-project drill — **EXECUTED AND PASSED, 2026-07-20**

**The ADR-012 / finding-10 gate is CLOSED.** A real restore of the live project
(`bzecqklouchkmdmdxlln`, PG 17.6) into a **brand-new Supabase project** created in a
**separate Free organization** (quota isolation — the live org runs a spend cap, and an
extra project there could push the live books read-only), same region, PG 17.6.

| Phase | Result |
|---|---|
| Full-profile backup | **51,891,128 bytes**, all four authoritative schemas (`clara`, `workflow`, `workflow_drizzle`, `graphile_worker`) **with owners + ACLs** |
| `roles-bootstrap` | **10 roles + 24 memberships rebuilt from an EMPTY `pg_authid`** |
| Restore | single-transaction; schema + data + ownership + the whole GRANT/REVOKE/RLS matrix |
| Auth recovery | `auth.users` + `auth.identities` data-only (FK order via `session_replication_role=replica`); **password-grant login returned HTTP 200** — bcrypt hashes survived onto a project with different JWT signing keys |
| Storage | **19/19 objects** downloaded, uploaded and **byte-identical on read-back** |
| Ceremonies | `write-login` + `read-logins` + **`acl-baseline`** applied on a real hosted project; baseline `VERIFY: OK` |
| **Battery (STRICT)** | **177 PASS · 0 FAIL · 1 SKIP · 10 INFO (188 probes)** |

Load-bearing assertions inside that battery: **AP gate exact — `400-000` net
(credit−debit) `source = target = 135,093,821` cents = RM 1,350,938.21**; the **S4-V2
canary parked on both sides** (`daba7f2e` `status=pending`, task `032767e6` resumable,
its `workflow_runs` row present — never answered); the security envelope identical
(**505 relation grants, 281 routine grants, 2 column grants, 137 RLS policies, 180
function definitions + security metadata, 126 triggers, 338 constraints, 141 indexes**);
completeness floor matched the on-disk migration manifest by **sha256** on both sides;
and the behavioural confinement smoke returned **42501** on the restored target.

**The 10 INFO are deliberate, not waived failures.** Three runtime-churn tables
(`runtime_heartbeats`, `trace_prune_log`, `trace_spans`) are compared **directionally**
— a point-in-time restore can never byte-match a source whose runtime is still writing
(`trace_prune_log` moved 868 → 880 → 885 across the run). The target must never *exceed*
the source; anything a books figure, provenance link, or audit receipt depends on stays
byte-exact, and did.

**Five real defects the drill found — none of which four review stages had:**
`storage-provision.sql`, `write-login-ceremony.sql` and `read-logins-ceremony.sql` (×2)
all ran `ALTER ROLE … NOSUPERUSER/NOBYPASSRLS/NOCREATEDB` **unguarded**, which PostgreSQL
refuses without SUPERUSER *even when setting them false* — so each worked exactly once,
at role creation, and **would have failed 42501 mid-recovery**, leaving the books
restored with no login able to reach them. `dr-verify`'s distinctness check keyed on
`host:port/db` and refused every legitimate cross-project run (Supabase's regional pooler
shares host, and — measured — every project shares database **oid 5** and the same
**`system_identifier`**, because projects are cloned from one base image; only the DSN
**username** and the server address discriminate). And the driver's triage reported
*"the restore is faithful"* after a battery that ran **zero** probes.

**Also surfaced:** one live storage object whose content-address is false
(`firms/1111…/docs/aaaa….pdf` — synthetic b7 residue whose name never hashed to its
bytes). Copied faithfully; no books depend on it; recorded as a provenance curiosity.

Re-run this drill **quarterly** with `node .tmp/hardening/drill-driver.mjs` (or the
runbook by hand). The post-restore ceremonies
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

Targets to enforce — the runtime is deployed (Fly); the probe and DB-backed
run history exist now; the alert wiring itself is the open piece.

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

1. **Plan upgrade — OWNER DECIDED 2026-07-20: upgrade to Pro ($25/mo); PITR
   DEFERRED for later assessment.** Pro gives daily physical backups with 7-day
   retention, restorable to a new project → managed **RPO ≤ 24h** (vs. Free's zero
   managed DR). **The residual the owner accepted:** without PITR there is no
   roll-back-to-a-timestamp for a bad write or migration — recovery granularity is
   the last daily backup, so the §4/§6 off-site dump cadence remains a real RPO
   lever, and the D1 write-quiesce discipline on writer-body migrations matters more.
   PITR (~$100/mo per 7-day window, requires ≥ Small compute) is a **deferred item to
   re-assess** — revisit when client count, transaction volume, or a near-miss makes
   minutes-RPO worth the cost.
2. **Off-site dump destination — OWNER DECIDED 2026-07-20: Cloudflare R2.**
   The §6 design applies, executed per §9 as the **`clara-backup` Fly scheduled machine
   (`sin`)**: one daily run does `db:backup:full`, `age`-encrypts the bundle (full dump +
   globals evidence + `auth` data-only + the `firm-docs` byte mirror + `manifest.json`),
   and `rclone`-uploads to R2 — off-vendor, so an account or region loss is survivable.
   Alerting = the dead-man's-switch (§6). **Wiring is the remaining task** (the DR drill
   does not depend on it); the runbook is §9.
3. **Storage-bucket backup** — document bytes in Supabase Storage need their own
   copy path (the DB dump does not include Storage objects); the recovery path is
   `docs/ops/DR-full-drill.md` §4 (re-provision bucket → `storage-provision.sql` →
   re-upload byte mirror → sha256-verify). The scheduled byte mirror is part of the
   §6 off-site design (OWNER DECISION).
4. **Wire the alerting** in §7 once the runtime is deployed (the dead-man's-switch
   freshness alarm is the §6 recommendation).
5. **Full-profile DR — DONE.** `db:backup:full` (owners+privileges, four schemas),
   `deploy/roles-bootstrap.sql`, `db:restore:full`, and the `db:dr:verify` battery
   are built, rehearsed, and CI-guarded (the "DR full-profile round-trip" CI step);
   the **fresh-Supabase-project drill EXECUTED AND PASSED 2026-07-20** (**177/0
   STRICT**, ADR-020 — §5b; real `auth`/`storage` recovery included). The only
   remaining off-site gate is the **R2 wiring** (item 2: scheduling + freshness
   alerts). Runbook: `docs/ops/DR-full-drill.md`.

---

## 9. R2 off-site backup wiring — runbook (§8 item 2 built; Wave A2 §8 / WA2-R6)

The §8-item-2 decision is now **scaffolded** as a self-contained app, **`packages/backup`**
(`@clara/backup`) — a **separate Fly app `clara-backup` in `sin`** (WA2-R6; **never** the
non-HA runtime machine), NOT a pnpm workspace member (excluded in `pnpm-workspace.yaml`; its
deps install inside its own image). It is **built + locally dry-run-validated**; the **first
live run is OWNER-GATED** (no live credential is touched by the agent). Full detail:
`packages/backup/README.md`. Pipeline (one daily run): full-profile dump (reuses
`db:backup:full`) + globals evidence + `auth` data-only + the `firm-docs` byte mirror
(Storage REST) → `manifest.json` (migration-head fingerprint = the `dr-verify` completeness
floor) → `tar --zstd` → **age-encrypt** → `rclone copy` to R2 → **healthchecks.io** success
ping (`/fail` on error).

### Crown-jewel secret inventory (what the app custodies)

| Secret | Power | Where it lives |
|---|---|---|
| Session-pooler DSN (**port 5432**) | reads all schemas + ownership/ACLs + `auth` PII ≈ project admin | `fly secrets` (`DATABASE_URL`) |
| Supabase `service_role` key | account-wide Storage bypass (firm-docs LIST/READ) | `fly secrets` **`CLARA_BACKUP_STORAGE_SERVICE_KEY_B64`** (base64-encoded — Fly file-secrets require it); materialized at `/run/secrets/clara_storage_service_key` by machine-run `--file-secret`; the image bakes `CLARA_BACKUP_STORAGE_KEY_FILE` to that path. Neither is ever logged; note the machine ALSO receives every app secret as env, so the base64 form rides in process env — the code reads only the file |
| R2 API token | write to the DR bucket | `fly secrets` **`RCLONE_CONFIG_R2_ACCESS_KEY_ID` / `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` / `RCLONE_CONFIG_R2_ENDPOINT`** (rclone env-remote config — never argv; `deploy/rclone.conf.example` remains the LOCAL-rehearsal form) |
| age **recipient (public)** key | none (encrypt-only) | committed: `packages/backup/deploy/age-recipient.txt` |
| age **identity (private)** key | decrypts the whole bundle (books + `auth` PII) | **owner custody, off-repo AND off-R2** — laptop `~/.clara-age-identity.*` + an offline backup; NEVER in the bucket |
| healthchecks.io ping URL | low (UUID) | `fly secrets` (`CLARA_BACKUP_PING_URL`) |

### Exact owner inputs (at wiring time)

> Fly mechanics these steps rely on (verified against fly.io/docs, 2026-07-22): a plain
> `fly deploy` on a service-less app still creates AND STARTS a machine (+1 stopped
> standby) — i.e. it would fire a live backup run on every deploy, so the image is
> shipped **build-only + push** and the ONE scheduled machine is created from the
> pushed image. `fly machine run` **disregards fly.toml** (env/files/vm — it reads only
> the app name), so the step-6 flag set IS the runtime contract. A `--file-secret`'s
> Fly secret must hold the **base64** of the file content (machine creation fails
> otherwise). A scheduled machine **starts once immediately at creation** — that
> supervised boot is the owner-gated first live run — then re-runs ~daily (fuzzy;
> the 26h grace tolerates it), exit 0 → stopped until the next cycle. The corollary
> of the on-fail restart policy: a NON-zero exit makes Fly retry the run (repeated
> live dump attempts), each failure firing the `/fail` ping — the switch alarms
> promptly instead of waiting out the grace window.

1. Create the **R2 bucket** + a **scoped R2 API token** (Object Read&Write on the ONE DR
   bucket). Its access-key pair + account endpoint become the `RCLONE_CONFIG_R2_*` Fly
   secrets in step 4 (for a LOCAL rehearsal use `deploy/rclone.conf.example` instead).
2. `age-keygen` → paste the `age1…` **recipient** into `deploy/age-recipient.txt` (replaces
   the placeholder — the job **refuses to run** until it is real); custody the **identity**
   key off-repo/off-R2 (+ offline backup).
3. A **healthchecks.io** check (period 1 day, **26h grace**) → `tools@belcort.com`; its
   ping URL becomes the `CLARA_BACKUP_PING_URL` secret.
4. `fly apps create clara-backup`, then stage the six secrets from a NAME=VALUE file
   written **OUTSIDE the repo** (e.g. `%USERPROFILE%\clara-backup-secrets.env`, in
   Notepad — **never** via chat or argv, and never inside the working tree, where no
   ignore pattern covers it; delete it after the import):

   ```text
   DATABASE_URL=              # session pooler, port 5432 (NOT 6543)
   CLARA_BACKUP_STORAGE_SERVICE_KEY_B64=   # base64 of the service_role key
   RCLONE_CONFIG_R2_ACCESS_KEY_ID=
   RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=
   RCLONE_CONFIG_R2_ENDPOINT= # https://<account-id>.r2.cloudflarestorage.com
   CLARA_BACKUP_PING_URL=     # https://hc-ping.com/<uuid>
   ```

   ```sh
   fly secrets import -a clara-backup --stage < "$env:USERPROFILE\clara-backup-secrets.env"
   ```

5. An **R2 Object-Lifecycle rule**: delete `db-snapshots/` objects older than 30 days (the
   `firm-docs-mirror/` prefix is write-once, delete-never — do not lifecycle it away).
6. Build + push the image, then create the ONE scheduled machine from it (from the
   **repo root**; `--dockerfile` is explicit because `[build].dockerfile` resolution
   relative to a nested `--config` is not doc-guaranteed):

   ```sh
   fly deploy . --config packages/backup/fly.toml \
       --dockerfile packages/backup/Dockerfile \
       --build-only --push --image-label dr-wiring-1 -a clara-backup

   fly machine run registry.fly.io/clara-backup:dr-wiring-1 \
       -a clara-backup --region sin --schedule daily \
       --vm-size shared-cpu-1x --vm-memory 1024 \
       --file-secret //run/secrets/clara_storage_service_key=CLARA_BACKUP_STORAGE_SERVICE_KEY_B64 \
       -e CLARA_BACKUP_STORAGE_URL=https://<project-ref>.supabase.co \
       -e CLARA_BACKUP_R2_BUCKET=<bucket>
   ```

   The machine boots immediately (the supervised first live run: watch `fly logs
   -a clara-backup` for the `clara-backup: DONE` line, then the healthchecks green
   ping + the R2 objects). Non-secret deploy-specific env rides as `-e`; the rclone
   remote constants (incl. the load-bearing `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true`
   — see the Dockerfile) are baked in the image; every secret is already on the app
   from step 4.

   **Running flyctl from Windows (learned live, 2026-07-22):** the guest path is
   written `//run/…` on purpose — flyctl validates it with the HOST's path rules, so
   a single `/run/…` is rejected as non-absolute on Windows (the UNC-shaped double
   slash passes, and Linux resolves `//run` = `/run`); prefix the command with
   `MSYS_NO_PATHCONV=1` under Git Bash (MSYS otherwise rewrites the guest path); and
   any command override must sit after a `--` terminator or flyctl eats `sh -c`'s
   `-c` as its own `--config` flag.

   **Known residual (queued in the A2.1 finding ledger):** the image's Debian
   bookworm rclone (1.60) gets a first-attempt `501 NotImplemented` on R2
   single-file PUTs which its internal retry clears — uploads succeed, logs are
   noisy. The clean fix is a modern rclone in the image.
7. *(Optional corroboration)* deploy the freshness Worker (`deploy/cf-worker/`).

### Steps the classifier FORCES owner-run (the agent may only scaffold/dry-run)

Reading any `~/.clara-*` / live secret; the first **real** encrypted upload against live;
creating/holding the **R2 token** + the **age identity** key; any **restore-into-a-project**
(needs `CLARA_ALLOW_DESTRUCTIVE=1` + `CLARA_DESTRUCTIVE_TARGET="user@host:port/db"`);
`gh pr merge`. The agent validates only on a **throwaway PG17 + a throwaway R2 bucket**.

### Verify cadence (a backup you never restored is not a backup)

- **Monthly-light:** decrypt the latest bundle + restore the DB dumps into a **local
  throwaway PG17** (scratchpad pg17 bins, port 55432) + a subset of `dr-verify` (schema
  presence + the manifest floor + the AP gate).
- **Quarterly-full:** the STRICT fresh-project drill (§5b / `DR-full-drill.md` §3) against a
  bundle decrypted from R2 — canary + AP gate (`135093821` cents) REQUIRED.
