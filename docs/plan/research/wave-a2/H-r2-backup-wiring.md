# Lane H — R2 off-site backup wiring (grounding brief)

**Scope.** Design-options brief for wiring the *already-decided* R2 off-site backup
(`docs/ops/DR.md` §8 item 2, owner-decided 2026-07-20). **Do not build.** Everything
below is as-built truth + wiring options; the actual wiring is the remaining task and
the DR drill does not depend on it (DR.md:322-323).

FACTS-ONLY posture: file:line references throughout; UNVERIFIED where I could not confirm.

---

## 0. What is already decided vs. still open (don't relitigate the settled parts)

**Decided (DR.md §8 / DR-full-drill §6):**
- Off-site destination = **Cloudflare R2** (DR.md:317-323). PITR **deferred** (§8 item 1).
- Bundle = `age`-encrypted **full-profile dump + globals evidence + `auth` data-only +
  the `firm-docs` byte mirror + `manifest.json`** (DR.md:320-321, DR-full-drill:229-231).
- Upload tool = **`rclone`** (DR.md:320).
- Alerting = a **dead-man's-switch** that fires on the *absence* of a backup
  (DR-full-drill:233-234).
- The managed floor is **Supabase Pro, daily physical backups, 7-day retention, no PITR**
  (DR.md:46-70) → managed RPO ≤ 24h. Off-site R2 is what survives an account/region loss
  the same-account managed backups would not (DR.md:84-86).

**Still open (DR-full-drill:239-241):** the plan upgrade (Pro+PITR); R2 vs B2 (→ R2 chosen);
the dead-man's-switch service; capture `auth` data-only (PII) vs PITR+re-invite; confirm
`spike` is safe to omit forever. Plus the wiring-specific questions in §8 below.

**Environment reality that constrains every option (DR-full-drill:220-222):** single-maintainer
**Windows 11 laptop, no Docker, no always-on server besides Fly**. The scheduler must tolerate
the laptop being off, and the alarm must fire on *absence*.

---

## 1. What the backup job actually has to do (the as-built pipeline)

The manual full-profile drill (executed + passed 2026-07-20, DR.md §5b:200-256) already
encodes every step; wiring = making it scheduled + encrypted + uploaded. The steps and
their real tooling:

1. **Full-profile DB dump** — `pnpm db:backup:full` → `packages/db/scripts/backup.mjs`
   (`backupFull`, backup.mjs:138-167). Dumps the four authoritative schemas
   `["clara","workflow","workflow_drizzle","graphile_worker"]` (backup.mjs:48) **WITH owners
   + privileges** (`stripAclsAndOwners:false`, backup.mjs:164) — the two-lane security wall
   *is* the GRANT/REVOKE matrix + `clara_fn_owner` ownership, so a `--no-owner` dump is a
   privilege-escalation, not a cosmetic gap (backup.mjs:12-22). It **asserts the full
   inventory** and refuses a partial "full" (backup.mjs:151-162). Live full dump measured
   **51,891,128 bytes** (DR.md:209).
2. **Globals evidence dump** — `pg_dumpall --globals-only --no-role-passwords`
   (`dumpGlobals`, backup.mjs:117-132). **Evidence/diff artifact only** — roles are recreated
   on restore by `deploy/roles-bootstrap.sql`, not from this dump (backup.mjs:108-116).
3. **`auth` data-only dump** — `.tmp/hardening/auth-dump.mjs` (`pg_dump --data-only` of
   `auth`, drill-driver.mjs:291). **Carries PII (bcrypt hashes) → encryption is mandatory**
   (DR-full-drill:148-149).
4. **`firm-docs` byte mirror** — NOT a Postgres dump and **NOT rclone-from-Supabase**. The
   drill used `.tmp/hardening/storage-copy.mjs download` against the **Supabase Storage REST
   API** (`POST /storage/v1/object/list/firm-docs`, `GET /storage/v1/object/firm-docs/<path>`,
   storage-copy.mjs:44-67). Object names are **content-addressed** `firms/<uuid>/docs/<sha256>.<ext>`
   giving a built-in integrity anchor (storage-copy.mjs:58; verified on download + read-back).
   Live had **19 objects** in the drill (DR.md:214); the task frames the mirror as "a few GB".
5. **`manifest.json`** — the metadata/integrity record for the run.

**Client-version hard requirement:** `pg_dump`/`pg_dumpall`/`psql` **must be v17** (server is
17.6; a v16 client aborts) — point `PG_DUMP`/`PG_DUMPALL`/`PSQL` at a v17 build (backup.mjs:26-28,
DR.md:127-137; the laptop has `C:/Users/zhant/pgsql-17/pgsql/bin`, drill-driver.mjs:39-41).

**Secrets law (binding).** Connections are **libpq PG\* env or `DATABASE_URL` only — never a
DSN in code or argv** (`packages/db/lib/pg.mjs` header:1-20, backup.mjs:24-28). The leak-scan
gate `scripts/check-leaks.mjs` (confirmed present) enforces no committed credential. The drill
tooling reads every secret from **files** named by env and never prints them, only `host:port/db`
labels (drill-driver.mjs:63-90, storage-copy.mjs:6-16).

**Credentials each step needs (this is the crown-jewel inventory the wiring must custody):**

| Step | Credential | Power level |
|---|---|---|
| full dump + globals + auth dump | LIVE **session-pooler DSN**, port **5432 not 6543** (drill-driver.mjs:219-227, F6) | reads *all* schemas + ownership/ACLs + auth PII → effectively the project's `postgres` admin role (see §2 tension) |
| byte mirror | LIVE Supabase **`service_role` key** (drill-driver.mjs:34, 352; F10: the `clara_storage_docs` JWT **cannot LIST** folder rows, so the service key is required, drill-driver.mjs:373) | account-wide storage bypass |
| age-encrypt | age **recipient (public) key** | none (public) |
| rclone upload | **R2 API token** (S3 access-key/secret) | write to the DR bucket |
| dead-man's-switch | ping URL / alarm channel | low |

Note the job holds **two** high-power live secrets (the admin DSN + the `service_role` key).
That is the security weight that drives the "where does it run" recommendation.

---

## 2. (a) WHERE the scheduled job runs — options + recommendation

A cross-cutting fact first: **a faithful full-profile dump is not a least-privilege read.**
It dumps ownership + the full GRANT/REVOKE/RLS matrix + `auth`, which requires the project's
`postgres`/admin role (the drill's LIVE DSN is `postgres.<ref>`, drill-driver.mjs:84-88). The
DR-full-drill §6 fallback's "dedicated least-privilege SELECT-only backup role"
(DR-full-drill:236-237) would only suffice for a `--no-owner --no-privileges` **diagnostic**
dump — **not** the full profile. So *any* host running this job holds a near-admin DB
credential **plus** the `service_role` storage key. That reframes the tradeoff as "which
vendor do we trust to hold the keys to the 7-year source of truth + auth PII."

| Option | Pros | Cons |
|---|---|---|
| **Laptop scheduled Windows Task** (the Lane A §5.3 / §8 standing recommendation, DR-full-drill:227-231, DR.md:320) | Full **credential custody stays local** — no third vendor holds the SoT admin DSN or the `service_role` key. v17 client + the drill scripts already live here (drill-driver.mjs:39-41). Zero new attack surface. | **Laptop-off = no backup** (mitigated only by the dead-man's-switch firing on absence). Single point of operator failure. |
| **GitHub Actions cron** (private repo) | Always-on; free minutes; encrypted secrets store; the repo is already `BELCORT-SDN-BHD/clara`. | Puts the **LIVE admin DSN + `service_role` key into GitHub secrets** — a 4th vendor holding SoT+PII keys. Needs the Supabase pooler reachable from GitHub runner egress (IP allowlist or public). The "SELECT-only role" mitigation **does not work for the full profile** (above). Auth PII transiting GitHub infra. |
| **Fly scheduled machine in `sin`** (same city as Supabase `ap-southeast-1`; both Singapore — fly.toml:9-10) | **In-region** (low latency to the pooler); creds stay inside the **existing Fly secret boundary** (`fly secrets`, fly.toml:29-31) rather than adding a vendor; Fly Machines support scheduled runs. Egress to R2 is free (§7). | Must be a **SEPARATE Fly app/machine** — the runtime app is **explicitly NON-HA, single-leader, do-NOT-scale-\>1** (fly.toml:33-42), so the backup must never ride on that machine. New image needs pg17-client + age + rclone. Fly's `schedule` granularity is coarse (hourly/daily/monthly). Holds the admin DSN + service key in Fly secrets. |
| **The runtime supervisor itself** | No new host. | **Reject.** The runtime uses the deliberately least-privileged pooled roles `clara_runtime_login` / `clara_agent_read_login` (fly.toml:30, read-logins-ceremony) which **structurally cannot** read the full security envelope / `auth` / all schemas — so it *cannot* produce a faithful full-profile dump. It would also couple backup liveness to runtime liveness and violate the single-purpose non-HA design. |

**Recommendation.** Primary = the **laptop scheduled Windows Task** (matches the standing §8
decision and keeps custody local — the biggest security win given the two crown-jewel secrets),
with the **dead-man's-switch as the safety net** for laptop-off. If an always-on guarantee is
later required, prefer a **dedicated separate Fly app in `sin`** over GitHub Actions: it is
in-region and keeps the secrets inside the existing Fly boundary instead of handing the SoT
admin DSN + auth PII to a fourth vendor. **Do not** put it on the runtime machine or role.

---

## 3. (b) age key management

`age` (age-encryption.org) encrypts to a **recipient (public) key** and decrypts with an
**identity (private) key**; the encrypt side needs **no secret at all**.

- **Public (recipient) key → committable to the repo** (e.g. `docs/ops/age-recipient.txt` or
  `packages/db/deploy/`). It only encrypts; committing it is safe and lets the scheduled job
  encrypt with zero secret material — clean fit for the leak-scan gate.
- **Private (identity) key custody = owner, OFF the repo and OFF R2.** The bundle carries the
  full books + `auth` bcrypt hashes, so the identity key is the crown jewel: a bucket
  compromise + a co-located key = plaintext. Store it where the drill already keeps local
  secrets — a `~/.clara-*` file on the laptop (house pattern, drill-driver.mjs:32-37) — **plus
  an offline backup** (hardware token / printed / password manager). **Never** upload the
  identity key to the same R2 bucket, and never commit it (`.env`/`~/.clara-*` are gitignored).
- **Rotation:** age supports multiple recipients — encrypt to *both* an old and new recipient
  during a rotation window so historical bundles stay decryptable. Record which recipient a
  bundle used in `manifest.json`.
- UNVERIFIED: whether the owner prefers an age X25519 identity vs an SSH-key recipient
  (`age` supports `ssh-ed25519` recipients) — a design choice, not a fact in-repo.

---

## 4. (c) rclone vs an S3-compatible CLI to R2

R2 is **S3-API compatible** (endpoint `https://<accountid>.r2.cloudflarestorage.com`,
`region=auto`, egress free — §7). Candidates:

- **`rclone`** (the §8 decision, DR.md:320). Pros: cross-platform incl. Windows; one
  `rclone copy`/`sync` handles the multi-file bundle **and** the byte-mirror directory;
  resumable, per-object checksums, `--immutable`, built-in retention/pruning; token lives in
  `rclone.conf` (chmod-guarded) or `RCLONE_CONFIG_R2_*` env — **not in argv** (satisfies the
  secrets law). Recommended.
- **aws-cli v2** (`aws s3 cp --endpoint-url https://<acct>.r2.cloudflarestorage.com`). Works;
  token in `~/.aws/credentials` or env. Fewer sync/retention ergonomics than rclone; no benefit here.
- **Wrangler** (`wrangler r2 object put`). Dev-oriented, per-object, no bulk/dir sync — poor fit
  for a multi-GB byte mirror. Not recommended for the data path (fine only for tiny control writes).

**Recommendation:** **rclone** (matches §8; best Windows + directory-sync + retention ergonomics).
Set `region=auto` and the account S3 endpoint; keep the token in `rclone.conf`/env, never argv.

---

## 5. (d) Bundle contents, naming, retention, restore-verify cadence

**Contents (from §8 + §6):** full-profile dump (`clara-clara+workflow+workflow_drizzle+graphile_worker-<ts>.sql`,
~52 MB) + globals evidence dump (`clara-globals-<ts>.sql`) + `auth` data-only dump (PII) +
the `firm-docs` byte mirror (the `drill-bytes` tree with `.meta.json` sidecars carrying
`{path,mimetype,sha256,bytes}`, storage-copy.mjs:84) + **`manifest.json`**. Timestamps use the
`tsStamp()` ISO-with-`:.`→`-` convention (backup.mjs:50).

**`manifest.json` should record** (so freshness + integrity are checkable *without* decrypting):
source project ref; run timestamp; each artifact's filename + **sha256** + byte size; the
**migration head** = `clara.schema_migrations` `(version, checksum)` where `checksum = sha256`
of the migration file text with CRLF→LF normalized (migrate.mjs:40-41) — this is exactly the
completeness-floor manifest `dr-verify` §4.1 re-checks on both sides (dr-verify.mjs:34, 148;
DR-full-drill:167-172); firm-docs object count + total bytes; the age recipient used.

**Naming/layout (proposed):** one run = one prefix, e.g.
`r2://clara-dr/<YYYY>/<YYYY-MM-DD>T<hhmmss>/`. **Atomicity option A (recommended):** `tar` the
run dir → a single `clara-dr-<ts>.tar.age` (one integrity + retention unit), and drop a small
**un-encrypted metadata-only** `manifest.json` beside it for the age/freshness check (ensure it
carries no client-identifying data). Option B: encrypt each artifact separately (simpler partial
restore, more objects/ops). Note `age` does not compress — `gzip`/`zstd` **before** `age` to
shrink the ~52 MB SQL.

**Retention/rotation options:**
- **R2 Object Lifecycle rules** (native, no compute) — delete objects older than N days by
  prefix. Recommended primary.
- **rclone-side pruning** (`rclone delete --min-age`) as a portable alternative.
- **GFS** (daily 14-30d → weekly 8-12w → monthly 6-12m) if generational depth is wanted.
- **Cost makes retention cheap** (§7) — the binding constraint is *usefulness*, not spend.
  Off-site R2 is **DR, not the statutory archive**: the 7-year record (ITA s.82/82A, CA2016
  s.245, DR.md:6-10) is the **live DB + managed backups**, so a rolling **30-90 day** off-site
  window is sufficient for DR. **Steady-state tip:** keep the byte mirror as a single
  `rclone sync` prefix (near-static, content-addressed) and snapshot only the small DB dumps
  daily — avoids storing a full byte-mirror copy per day.

**Restore-verify cadence (a backup you never restored is not a backup, DR.md:184):**
- **Quarterly** = the full fresh-Supabase-project STRICT drill (DR.md:249, DR-full-drill §3):
  decrypt the latest bundle → `roles-bootstrap` → `restore-full` → ceremonies + storage
  re-upload → `dr-verify` STRICT (canary + AP gate `135093821` cents REQUIRED, dr-verify.mjs,
  DR-full-drill:110-123).
- **Monthly light** (proposed) = decrypt + restore the DB dumps into a **local throwaway PG17**
  (the scratchpad pg17 bins, port 55432 recipe) + a subset of `dr-verify` (schema presence +
  manifest floor + AP gate) — cheap continuous assurance the encrypted bundle is decryptable
  and loadable.

---

## 6. (e) Dead-man's-switch mechanism options (owner is Cloudflare-centric)

Requirement: the alarm must fire on the **absence** of a backup — laptop off, job crashed, or
upload silently failed (DR-full-drill:233-234). The job pings **on success**; no ping within
the window ⇒ alarm. The §7 SLO already sets the threshold: **backup age > 26h** (DR.md:292).

- **healthchecks.io** (§6-named, DR-full-drill:234). Purpose-built dead-man's-switch: cron-expr
  schedules, grace periods, email/webhook/Slack; free tier + self-hostable. **Zero build**,
  absence-native, most battle-tested. Recommended primary.
- **Cronitor** (§6-named) — equivalent heartbeat monitor.
- **UptimeRobot** — heartbeat/cron monitors; simpler, viable.
- **CF Worker Cron Trigger + email** (most on-brand for a Cloudflare-centric owner): a scheduled
  Worker lists the R2 DR prefix via S3 `ListObjects`, reads the newest object's timestamp (or a
  `last-success` marker the job writes), and **emails on staleness > 26h** via Cloudflare Email
  Routing / MailChannels. Keeps the alarm inside the owner's existing vendor and *also* catches
  "pinged success but uploaded nothing/corrupt" — but it is **custom code that must not silently
  die**, and a Worker error is silent.

**Recommendation:** **healthchecks.io as the primary absence alarm** (zero-build, absence-native,
route to `tools@belcort.com` per DR.md:299) — **and** a small **CF Worker Cron** freshness check
over the R2 prefix as *corroborating* evidence (the manifest-age check is corroboration, not the
primary alarm — DR-full-drill:234; matches the §7 "backup freshness age > 26h" SLO). If the owner
insists on all-Cloudflare, the Worker can be primary, but pair it with a second signal since a
lone Worker's own death is silent.

---

## 7. Cost sketch — R2 for ~a few GB/month (current pricing, fetched 2026-07-21)

Cloudflare R2 Standard (developers.cloudflare.com/r2/pricing): **storage $0.015/GB-month**,
**Class A (writes/LIST) $4.50/million**, **Class B (reads) $0.36/million**, **egress FREE**.
**Free tier: 10 GB-month storage, 1M Class A, 10M Class B per month.**

- **Storage.** DB dumps ~52 MB/run (DR.md:209) + tiny globals/auth. Byte mirror "a few GB"
  (~3 GB). If the mirror is kept as **one synced copy** + daily DB-dump snapshots for 30 days:
  ≈ 3 GB + 30 × ~60 MB ≈ **~4.8 GB** → **inside the 10 GB free tier** (≈ $0). If instead every
  daily run kept a **full** 3 GB copy for 30 days: ~93 GB-month → ~**$1.40/mo** (worst case).
- **Operations.** Daily uploads = a handful of PUTs + one LIST/sync pass. Even a 2000-object
  mirror LISTed daily is thousands of ops/month — **far under** the 1M Class A / 10M Class B
  free tier → ≈ $0.
- **Egress.** $0 — so the quarterly full-bundle restore-download costs **nothing** in transfer
  (only Class B GETs, within free tier). This free egress is precisely why R2 beats B2/S3 here.

**Bottom line:** R2 for this workload is **effectively free** (single-copy mirror + modest
retention sits inside the free tier; even generous retention is cents/month). The binding DR
spend is **not** R2 — it is the *deferred* Supabase **Pro + PITR** (~$25 + ~$100/mo), a separate
§8 item-1 decision (DR.md:307-316).

---

## 8. (f) Exact owner inputs + which steps the auto-mode classifier forces owner-run

**Owner inputs the wiring needs:**
1. **R2 bucket name** + the account S3 endpoint `https://<accountid>.r2.cloudflarestorage.com`
   (+ `region=auto`; note the bucket location hint, e.g. APAC, for latency).
2. **R2 API token** scoped to **Object Read & Write on that ONE bucket** (R2 → Manage API Tokens
   → S3 access-key-id + secret). Consider a **second read-only token** for the restore-verify /
   freshness-monitor path (least privilege).
3. **age recipient (public) key** → repo; **decision on where the age identity (private) key
   lives** (laptop `~/.clara-age-identity.*` + offline backup — §3).
4. **LIVE session-pooler DSN** (port **5432**, already `~/.clara-live-dsn.txt`, drill-driver.mjs:32)
   — confirm it is the session pooler, not 6543.
5. **LIVE Supabase `service_role` key** (already `~/.clara-live-service-key.txt`, drill-driver.mjs:34)
   for the byte mirror.
6. **Alarm channel** — the healthchecks.io ping URL + destination email (`tools@belcort.com`,
   DR.md:299), and/or the CF Worker + Email Routing setup.
7. **Schedule + window** — cadence (e.g. daily 02:00 MYT) and grace (26h per DR.md:292).
8. **Policy decisions** (DR-full-drill:239-241): capture `auth` data-only (PII) vs PITR+re-invite;
   confirm `spike` omission is permanent; R2 lifecycle retention window.

**Steps the auto-mode classifier / permission system forces OWNER-RUN** (the agent may
scaffold/validate on a throwaway PG17 but must not execute these):
- **Reading the `~/.clara-*` live secret files** and running anything against **LIVE** with real
  credentials — my own lane forbids reading those files; the first real encrypted upload against
  live is an owner-run step (house pattern: secret-bearing steps are owner-gated, e.g. the pw
  rotation "pending owner `!` run", per memory).
- **Creating/holding the R2 token + the age private key** (crown-jewel custody).
- **Any restore-into-a-project** — `restore-full`/`restore` require `CLARA_ALLOW_DESTRUCTIVE=1`
  **and** `CLARA_DESTRUCTIVE_TARGET="user@host:port/db"` (the destructive guard, guard.mjs:52-70;
  the `user@` prefix is load-bearing because a managed pooler shares host+db across projects,
  guard.mjs:14-24, pg.mjs:148-165).
- **`gh pr merge`** — merge is owner-gated; the classifier blocks the orchestrator's merge
  (CLAUDE.md / memory).

The AGENT can: author the scheduled-task/CF-Worker/rclone-config scaffolding, write the
healthchecks setup + runbook, and validate the encrypt→upload→download→decrypt→restore→dr-verify
round-trip on a **local throwaway PG17** and a **throwaway R2 bucket** — no live credential
touched.

---

## Open questions for design

1. **Host decision.** Accept the laptop-Windows-Task primary (custody-local, matches §8), or
   require an always-on host now? If always-on, confirm a **separate Fly app in `sin`** (not the
   non-HA runtime machine) over GitHub Actions — and accept that Fly then holds the admin DSN +
   `service_role` key.
2. **The full-profile privilege tension.** The DR-full-drill §6 "least-privilege SELECT-only
   backup role" fallback **cannot** produce a faithful full-profile dump (it needs owner/ACL/`auth`
   read ≈ the `postgres` admin role). Is that acknowledged, and does it change the host choice
   (i.e. is handing a near-admin DSN to any hosted runner acceptable)?
3. **age identity custody + rotation policy** — exact storage location(s) and the rotation window
   convention (multi-recipient during rotation).
4. **Bundle atomicity** — single `tar.age` per run (Option A) vs per-artifact encryption (Option B);
   and gzip/zstd-before-age to shrink the SQL.
5. **Byte-mirror strategy** — one synced prefix (cheap, near-static) vs full copy per snapshot
   (simpler point-in-time, higher storage); reconcile with the retention window.
6. **Retention window** — 30 / 60 / 90-day rolling vs GFS; and whether R2 Object Lifecycle or
   rclone pruning is the mechanism. (Confirm off-site is DR, not the 7-year statutory archive.)
7. **Dead-man's-switch vendor** — healthchecks.io primary (zero-build) vs an all-Cloudflare CF
   Worker primary; and whether the CF Worker freshness check is built as corroboration either way.
8. **`auth` capture** — data-only PII dump in the bundle (mandatory encryption) vs rely on
   PITR + owner re-invite (DR-full-drill:239-241, §4:145-149).
9. **Restore-verify cadence** — is the proposed monthly-light (local PG17) + quarterly-full
   (fresh Supabase project, STRICT) split accepted, and who runs each?
10. **Token scope** — one read+write token vs split read-only (monitor/verify) + read-write
    (upload); single-bucket confinement confirmed.
11. **Does R2 wiring block Wave A2 at all?** DR.md:322-323 says the DR drill does not depend on
    it — confirm the sequencing (Wave A2 = sales-invoice/AR + MyInvois + standing rules) proceeds
    independently, with R2 wiring as a parallel ops track.
