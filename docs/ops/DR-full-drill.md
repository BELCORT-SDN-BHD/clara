# Clara — Full-profile DR drill (runbook, tooling, scheduling)

*Companion to `docs/ops/DR.md` (kept separate for the 500-line doc cap; house
precedent: `slice5-as-built-amendments.md`). This is the **full-fidelity** DR path
— a real restore of every authoritative schema **+ roles/grants/RLS + ownership +
Supabase Auth/Storage** into a *fresh* project. Design authority: Lane A DR-fidelity
report (hardening interlude). Status: tooling built + rehearsed on a local throwaway
(2026-07-20); the fresh-Supabase-project drill is OWNER-GO-gated (`docs/ops/DR.md` §5b).*

---

## 1. What "full fidelity" means (and why the default profile is not it)

A faithful restore is not "the tables and rows came back." It is the **source of
truth**, its **security envelope**, and its **in-flight durable state**, byte- and
behaviour-identical, with the engine ready to resume. Categories the full profile
must reproduce (Lane A §1):

- **Books:** schema `clara` — tables/views/sequences/functions/types/triggers + data;
  `clara.schema_migrations` (version + sha256). Money is `bigint` cents (no float drift).
- **Durable runtime:** `workflow`, `workflow_drizzle` (the drizzle journal
  `workflow_migrations` — **its own schema**, missed by the old profile), and
  `graphile_worker` (+ its `migrations` tracker) — captured as **one consistent unit**
  so the engine **resumes** rather than re-bootstraps.
- **Roles (cluster-level — NOT in a `pg_dump`):** the clara-custom roles `roles-bootstrap.sql`
  enumerates — 19 at `265a8ee7` (11 group + 7 login shells + `clara_storage_docs`); count the
  file, not this line — recreated
  by `packages/db/deploy/roles-bootstrap.sql` (§2).
- **Ownership + the GRANT/REVOKE/RLS matrix:** the two-lane security model **is** the
  grants + `clara_fn_owner` object ownership. A `SECURITY DEFINER` writer executes as
  its owner, so a `--no-owner`/`--no-privileges` restore is a **privilege-escalation**,
  not a cosmetic gap. The full profile therefore dumps **WITH** owners + privileges.
- **Auth + Storage (out-of-band):** no FK couples `clara` to `auth`/`storage`, so the
  books restore independently — but humans can't log in until `auth.users` is recovered,
  and document **bytes** live in Supabase Storage, not Postgres (§4).

## 2. The tooling (all in `@clara/db`)

| Artifact | Role |
|---|---|
| `scripts/backup.mjs --profile full` (`pnpm db:backup:full`) | dumps the four authoritative schemas **WITH owners + privileges**; asserts the full inventory; writes a globals **evidence/diff** artifact (not restored). |
| `packages/db/deploy/roles-bootstrap.sql` | idempotent recreation of the clara-custom roles `roles-bootstrap.sql` enumerates — 19 at `265a8ee7` (11 group + 7 login shells + `clara_storage_docs`); count the file, not this line — with exact attributes/memberships/settings. **FRESH-TARGET-ONLY — never on a live project** (it fails closed if a login shell is already LOGIN unless `-v allow_relogin_reset=1`; re-running on live would NOLOGIN the pools). **Run FIRST** on a fresh target. |
| `packages/db/scripts/restore-full.mjs` (`pnpm db:restore:full`) | one destructive-guard; runs roles-bootstrap → single-transaction restore → prints the manual post-restore checklist. Does **not** auto-run ceremonies or touch Storage. |
| `packages/db/scripts/dr-verify.mjs` (`pnpm db:dr:verify`) | the §5 verification battery — diffs source↔target across every fidelity category, enforces a completeness floor, refuses a self-comparison; exits non-zero on any FAIL. `CLARA_DR_STRICT=1` for the live drill (canary + AP REQUIRED). |
| `packages/db/deploy/write-login-ceremony.sql` · `packages/db/deploy/read-logins-ceremony.sql` · `packages/db/deploy/storage-provision.sql` · `packages/db/deploy/acl-baseline.sql` | the post-restore ceremonies a dump can't carry: the write-pool LOGIN password, the runtime + read-pool LOGIN passwords (`clara_runtime_login` / `clara_agent_read_login`), Storage, and the public-schema ACL baseline. |

**Client version:** `pg_dump`/`pg_dumpall`/`psql` must be **v17** (the server is 17.6;
a v16 `pg_dump` aborts on a 17 server). On Windows point `PG_DUMP`/`PG_DUMPALL`/`PSQL`
at a portable v17 build; CI installs `postgresql-client-17`.

## 3. Restore runbook (fresh project) — concrete order

**Preconditions:** owner GO; a *fresh* Supabase project (or a local throwaway for a
rehearsal); v17 client on PATH via `PG_DUMP`/`PG_DUMPALL`/`PSQL`; the latest encrypted
off-site bundle decrypted to a private dir; `CLARA_ALLOW_DESTRUCTIVE=1` and
`CLARA_DESTRUCTIVE_TARGET="<user@host:port/db>"` set to the *exact* fresh-target
identity. **The `user@` prefix is load-bearing:** on a managed pooler every project in
a region shares one host and the `postgres` database, so the USERNAME is what identifies
the project — a host-only match could authorize a destructive op against the WRONG
project. Copy the exact string out of the guard's refusal message rather than typing it.

1. **Provision the fresh project.** Confirm the Supabase-managed roles + schemas exist
   (`auth`, `storage`, `authenticator`, `authenticated`, `anon`, `service_role`,
   `supabase_*`). Snapshot `pg_extension`; confirm it is a superset of the source's.
   Confirm `postgres` is **BYPASSRLS** (else the verify parity probes under-count).
2. **Roles bootstrap.** `psql -f deploy/roles-bootstrap.sql`. Creates the clara-custom roles
   `roles-bootstrap.sql` enumerates — 19 at `265a8ee7` (11 group + 7 login shells +
   `clara_storage_docs`); count the file, not this line — + memberships + the `clara_agent_ro`
   read-only setting. No passwords yet; every login role stays NOLOGIN.
3. **Full restore.** `pnpm db:restore:full --file <full-dump.sql>` (re-runs
   roles-bootstrap idempotently, then a single-transaction restore). On success the
   books, the durable trio (incl. the parked canary), ownership, and the full grant
   matrix are all in place.
4. **Auth recovery.** Either managed PITR/backup carried `auth` whole-cluster, **or**
   apply the off-site **data-only** `auth.users`/`auth.identities` dump into the
   GoTrue-provisioned `auth` schema (match the GoTrue version; data-only, never DDL),
   **or** owner re-invites users. Books are valid regardless.
5. **Storage recovery.** Recreate the private `firm-docs` bucket; `psql -f
   deploy/storage-provision.sql`; re-upload the document bytes from the off-site mirror;
   verify every `clara.documents.sha256` matches a re-uploaded object (dr-verify §4.10
   proves the DB-side path↔sha256 anchor; the byte re-upload is operator-side).
6. **LOGIN ceremonies.** In a PRIVATE session: `psql -f deploy/write-login-ceremony.sql`
   (`clara_wake_write_login`) and `psql -f deploy/read-logins-ceremony.sql`
   (`clara_runtime_login` + `clara_agent_read_login`) — each `\prompt`s for the password,
   sets LOGIN, and runs role/membership post-checks (all must pass). Update
   `CLARA_WRITE_DATABASE_URL` + the runtime/read DSNs out of band.
7. **ACL baseline (MANDATORY re-apply).** `psql -f deploy/acl-baseline.sql` as the db
   owner. A restore does **not** carry the `public`-schema ACL — the restore recreates
   `public` with its default PUBLIC USAGE, re-opening the confined lanes' reach unless
   re-applied (Lane C §9).
8. **Engine sanity (do NOT re-bootstrap blindly).** Confirm
   `workflow_drizzle.workflow_migrations` == source **before** any worker could start — a
   mismatch is the silent-no-op / `CREATE SCHEMA` collision trap. What you do next
   **depends on which mode you are in, and the two are opposites:**

   > ### ⛔ MODE CARVE-OUT — read before starting any runtime
   >
   > **REAL RECOVERY (production is gone; this target becomes the new production):**
   > start the runtime (`CLARA_START_WORLD=1`). It **should resume** the parked canary —
   > that resume *is* the recovery, and seeing it complete is the point.
   >
   > **DRILL / REHEARSAL (production is alive; this target is a scratch project):**
   > **NEVER start a runtime, worker, or world against the scratch.** The restored canary
   > is a **copy** of the LIVE interruption `daba7f2e`, which must stay parked on **both**
   > sides — resuming it here would execute a duplicate of a live run against a database
   > holding real books, and it would move the target's canary state so §4.9 parity FAILs.
   > Drill verification is **SQL-only** (the §5 battery). The resume path is already
   > proven: the GATE-3 kill-mid-workflow demo exercised exactly-once resume **on live**
   > (2026-07-19/20). You are verifying that the durable state is present and consistent
   > so a worker *would* resume — not making one resume.
   >
   > If you are unsure which mode you are in, you are in a DRILL. Do not start the world.
9. **Verification battery (§5) — STRICT.** Run the drill in STRICT mode with the canary +
   AP gate REQUIRED, so it cannot silently SKIP the highest-value checks:
   ```sh
   CLARA_DR_STRICT=1 \
   CLARA_DR_SOURCE_URL="<source read-only DSN>" \
   CLARA_DR_TARGET_URL="<target read-only DSN>" \
   CLARA_DR_AP_CLIENT_NAME_ILIKE='RPR%' \
   CLARA_DR_EXPECT_AP_CENTS=135093821 \
   CLARA_DR_VERIFY_OUT=./dr-verify.json \
     node packages/db/scripts/dr-verify.mjs
   ```
   All green ⇒ paste the generated dr-verify.json evidence into `docs/ops/DR.md` §5b and close the gate.
   **Teardown** the scratch project. (Set `CLARA_DR_AP_CLIENT_NAME_ILIKE` to the exact RPR
   client and confirm account `400-000`; the S6 AP figure is RM 1,350,938.21 = 135,093,821 cents.)

### POST-RESTORE CEREMONIES checklist (none are carried by the dump)

```
roles-bootstrap.sql   -> (restore-full runs it)   recreate the clara-custom roles (19 at 265a8ee7; count the file, not this line)
<full restore>        -> restore-full             schema+data+owners+GRANT/RLS matrix
storage-provision.sql + firm-docs bucket + bytes  Storage recovery (out-of-band)
write-login-ceremony.sql                          write-pool LOGIN + password
read-logins-ceremony.sql                          runtime + read-pool LOGIN + passwords
acl-baseline.sql                                  public-schema ACL baseline (MANDATORY)
engine-sanity check                               workflow_drizzle == source (world-on:
                                                  REAL RECOVERY only — NEVER in a drill, step 8)
dr-verify.mjs                                     the §5 battery — all PASS
```

**Intentional, expected differences** the battery whitelists (not FAILs): the `spike`
schema (Slice-0 cruft, deliberately omitted); Supabase-managed schema internals the
fresh project provisions itself; login passwords (re-set by ceremony); `applied_at`
timestamps (compare version + checksum, not the timestamp).

## 4. Auth & Storage recovery — detail

- **Auth (`auth`):** Postgres-resident (GoTrue), owned by `supabase_auth_admin`; **no
  FK from clara**, so clara restores independently. Prefer managed PITR (whole-cluster,
  version-consistent); the data-only dump is a best-effort fallback (**PII → the
  off-site bundle encryption is mandatory**); owner re-invite is acceptable for a pilot.
- **Storage (`storage` + bytes):** bytes live in Supabase Storage (S3-backed), not
  Postgres; the DB dump captures neither the bytes nor the managed `storage.objects`
  rows. Recovery = re-provision bucket → `storage-provision.sql` → re-upload the byte
  mirror → sha256-verify against `clara.documents.sha256` (dr-verify §4.10).

## 5. Verification battery (`packages/db/scripts/dr-verify.mjs`)

Two READ-ONLY connections (`CLARA_DR_SOURCE_URL`, `CLARA_DR_TARGET_URL`; never printed
— only host:port/db labels). The verifying role must be BYPASSRLS (clara tables are
FORCE-RLS). Source and target must be **distinct physical databases** — a self-comparison
is REFUSED (label + `system_identifier`/oid, Codex HIGH-3). Each probe prints
PASS/FAIL/SKIP/INFO; any FAIL exits non-zero. Coverage:

- **Preflight** — distinctness refusal + BYPASSRLS visibility + mode (normal vs STRICT).
- **4.1** schema presence (the four authoritative on both; `auth`/`storage`
  present-on-source ⇒ required-on-target) + a **completeness floor**: `clara.schema_migrations`
  non-empty AND equal to the on-disk manifest by **(version, sha256 checksum)** on BOTH sides —
  computed exactly as `migrate.mjs` records them, so an empty/half-built DB OR a forged
  name-only ledger FAILs — plus `workflow_drizzle.workflow_migrations` + `graphile_worker.migrations`
  parity (present engine journals must be NON-EMPTY). A non-allowlisted asymmetric **user**
  schema FAILs (`{spike}` + platform schemas are INFO). *Scope note: the battery proves restore
  fidelity relative to a **trusted source** — source integrity itself is out of scope (deliberately
  forging BOTH sides identically is not a DR-drill threat model).*
- **4.2 / 4.3** per-table row-count **and** md5 content-checksum parity across all four schemas.
- **4.4 / 4.5** clara_% role attributes (incl. `rolconfig`) + memberships (inherit/set/**admin** options).
- **4.6** ownership parity + the `--no-owner` escalation guard (clara_fn_owner relations
  preserved; all clara functions clara_fn_owner-owned); **type parity** (enum labels, domains,
  composites for the four schemas); the **full** GRANT matrices read
  from the catalog via `aclexplode` — relation (incl. **sequences**), **column**, routine,
  schema, and default-privilege — each projecting **grantee, privilege, `is_grantable`,
  grantor**; schema ACLs normalized to ignore owner-self entries (compared against owner
  identity + effective owner privileges); RLS flags; the full `pg_policies` diff; and
  **executable DDL** parity — function definitions + `prosecdef`/`provolatile`/`proleakproof`/
  `proconfig`, triggers, constraints, indexes, and view defs (so a swapped SECURITY DEFINER
  body cannot hide behind an unchanged signature).
- **4.7** behavioural confinement smoke on the TARGET, guarded by boundary-specific catalog
  asserts (`clara_agent_ro` HAS clara USAGE **and** LACKS `approve_entry` EXECUTE) so a
  42501 from a different cause is not a false PASS; then `set role clara_agent_ro` →
  `clara.approve_entry(...)` must fail **42501 for the function** (executed, not just diffed).
- **4.8** AP gate (env `CLARA_DR_AP_CLIENT_NAME_ILIKE` + `CLARA_DR_EXPECT_AP_CENTS`, optional
  `_ACCOUNT_CODE` [400-000]): computes `clara.trial_balance` on both sides under BYPASSRLS
  and asserts `source == target == expected` on the **net = credit − debit** measure —
  HARD-PINNED, no side selector (Codex HIGH-6: the authoritative S6 AP measure is credit
  minus debit; reversals make gross credit wrong). The S6 figure is RM 1,350,938.21 =
  135,093,821 cents.
- **4.9** parked-canary: interruption `daba7f2e%` + task `032767e6%` count/**status** parity;
  in STRICT the interruption must be `pending` and the task a resumable (non-terminal) status
  whose `workflow_run_id` resolves to a `workflow.workflow_runs` row on the target. The
  **graphile orphan-job** check is a documented SKIP (the job→run link is opaque application
  JSON — not derivable from the schema). Auto-SKIP when absent on both (FAIL in STRICT).
- **4.10** documents storage-path integrity: for `clara.documents` rows with a
  `storage_path`, the path's `<sha256>` segment must equal the `sha256` column (both sides;
  auto-SKIP at zero documents). The byte re-upload itself is operator-side (§4).

**STRICT / live-drill mode** (`CLARA_DR_STRICT=1`) makes the canary + AP gate REQUIRED
(their SKIP paths become FAIL). **Behavioural resume is verified SQL-only** here — no
world ever starts against the scratch project; that exactly-once **resume execution was
proven by the GATE-3 kill-mid-workflow demo on live** (2026-07-19/20), and this battery
proves the durable state is present + consistent so a worker *would* resume.
**CI residual:** the `postgres:17` round-trip has **no** parked canary, so §4.9 exercises
its absent-on-both SKIP there, not recovery semantics — a synthetic-canary seed in CI is a
deferred follow-up.

`CLARA_DR_VERIFY_OUT=<path>` writes the JSON result set. CI runs the whole
backup→restore→verify chain across **two independent `postgres:17` clusters** (the "DR
full-profile round-trip" step in `.github/workflows/ci.yml`) so cluster-role recovery is
genuinely exercised and the tooling can never silently regress.

## 6. Off-site scheduling + freshness alerts (OWNER DECISION — pending)

**Environment reality:** single-maintainer Windows 11 laptop, no Docker, no always-on
server besides Fly. The scheduler must tolerate the laptop being off, and the freshness
alert must fire on the **absence** of a backup.

**Recommendation (Lane A §5.3):**
- **Managed floor:** upgrade to **Supabase Pro + PITR** before real client data
  (minutes-RPO, auth/storage-consistent) — the standing `DR.md` §2 recommendation.
- **Off-vendor independence:** a scheduled Windows Task runs `pnpm db:backup:full`, then
  `age`-encrypts the bundle (full dump + globals-evidence + `auth` data-only + a
  `firm-docs` byte mirror + `manifest.json`) and `rclone`-uploads to **Cloudflare R2 /
  Backblaze B2** — so an account/region loss is survivable and the periodic full-profile
  drill has a real bundle to restore from.
- **Alerting:** a **dead-man's-switch** (healthchecks.io / Cronitor) the backup job pings
  **on success** — the only option that alerts on *absence* (laptop off, job crashed,
  upload failed); the manifest-age check is corroborating evidence, not the alarm.
- **Fallback only if the laptop can't be relied on:** a GitHub Actions cron with a
  **dedicated least-privilege SELECT-only backup role** (never the write/postgres creds),
  IP allowlist, rotation.

**Owner decisions still open:** the plan upgrade (Pro + PITR); the off-site destination
(R2 vs B2); the dead-man's-switch service; whether to capture `auth` data-only (PII) or
rely on PITR + re-invite; confirm `spike` is safe to omit from the DR profile forever.
