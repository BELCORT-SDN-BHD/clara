# @clara/backup — off-site DR backup app (`clara-backup`)

The scheduled off-site backup wiring decided in `docs/ops/DR.md` §8 (item 2) and scoped
by the Wave A2 contract §8 / **WA2-R6**. A **separate, self-contained Fly app** (`sin`) —
**never** the non-HA runtime machine, and **not** a pnpm workspace member (it is excluded
in `pnpm-workspace.yaml`; its deps install inside its own Docker image). It exists so an
**account/region loss** the same-account Supabase managed backups could not survive is
recoverable.

> **Off-site is DR, not the archive.** The 7-year statutory record (ITA s.82/82A, CA2016
> s.245) is the **live DB + Supabase managed backups**. This off-site copy is a rolling
> **30–90 day** DR window. Retention here is about *usefulness*, not the statute.

## What it does (one run, daily)

1. **Full-profile DB dump** — reuses `@clara/db` `backup.mjs --profile full` (four
   authoritative schemas `clara`/`workflow`/`workflow_drizzle`/`graphile_worker`, **WITH
   owners + ACLs**; asserts the full inventory; **v17 client required**). Reused, not
   re-implemented, so the "refuse a partial full" safety is never lost.
2. **Globals evidence dump** — `pg_dumpall --globals-only` (evidence/diff artifact; roles
   are restored by `deploy/roles-bootstrap.sql`, not this dump).
3. **`auth` data-only dump** — `auth.users` + `auth.identities` (**PII + bcrypt hashes →
   age encryption is mandatory**).
4. **`firm-docs` byte mirror** — Supabase Storage REST (`service_role`); content-address
   (`firms/<uuid>/docs/<sha256>.<ext>`) verified on download. Mirrored to R2 as an
   **incremental, individually age-encrypted** prefix — write-once + delete-never, so only
   **new** objects are encrypted + uploaded (no daily re-store of the whole mirror).
5. **`manifest.json`** — records the migration-head `(version, checksum)` fingerprint (the
   `dr-verify` completeness floor), the bundle sha256, and firm-docs aggregate — **no
   client-identifying paths** (the detailed index rides *inside* the encrypted bundle).
6. **Bundle** — `tar --zstd` → **age-encrypt** → `clara-dr-<ts>.tar.zst.age` (age does not
   compress, so zstd first).
7. **Upload** — `rclone copy` to R2: the incremental `firm-docs-mirror/` prefix + a dated
   `db-snapshots/<YYYY>/<ts>/` snapshot (pruned by an R2 Object-Lifecycle rule at 30d).
8. **Success ping** — the dead-man's-switch (healthchecks.io); `/fail` on error so the
   alarm fires promptly instead of waiting out the grace window.

## Secrets law

The DB connection is **libpq PG\*/`DATABASE_URL` only — never a DSN in code/argv**
(`packages/db/lib/pg.mjs`). Every other secret comes from a **file named by env** or from
rclone's own config, and its value is **never logged**. The age **recipient (public)** key
is committed (`deploy/age-recipient.txt`) — encryption needs no secret. The age **identity
(private)** key is **owner custody, off-repo and off-R2**. The leak-scan gate
(`scripts/check-leaks.mjs`) covers every file here.

## Build + deploy (owner)

The image is shipped **build-only + push** (a plain `fly deploy` would create AND start
a machine — i.e. fire a live backup run — even with no services), and the ONE scheduled
machine is created from the pushed image. `fly machine run` **disregards fly.toml**
(env/files/vm), so image-intrinsic env is baked in the Dockerfile and the rest rides as
flags — the exact flag set (the runtime contract) is `docs/ops/DR.md` §9 step 6:

```sh
fly apps create clara-backup
# Stage ALL secrets first from a NAME=VALUE file (see DR.md §9 step 4; the
# service_role key goes BASE64-encoded as CLARA_STORAGE_SERVICE_KEY_B64):
fly secrets import -a clara-backup --stage < clara-backup-secrets.env
# Build from the REPO ROOT (context needs packages/backup + packages/db);
# --dockerfile explicit (nested-config resolution is not doc-guaranteed):
fly deploy . --config packages/backup/fly.toml --dockerfile packages/backup/Dockerfile \
    --build-only --push --image-label dr-wiring-1 -a clara-backup
# Create ONE daily scheduled machine from the pushed image (full flag set: DR.md §9).
# It boots ONCE immediately at creation — that supervised run IS the first live run:
fly machine run registry.fly.io/clara-backup:dr-wiring-1 -a clara-backup \
    --region sin --schedule daily ... # + --file-secret / -e flags per DR.md §9
```

## Local validation (no live anything)

```sh
node scripts/backup-run.mjs --dry-run   # validates env-wiring + the step plan, ZERO install
node --check scripts/backup-run.mjs      # syntax
```

The **first live run** and all credential-bearing steps are **owner-gated** (the classifier
blocks the agent from reading `~/.clara-*` secrets or running against live). Verify cadence:
**monthly-light** (decrypt + restore the DB dumps into a local throwaway PG17) and
**quarterly-full** (the `docs/ops/DR-full-drill.md` STRICT drill). See `docs/ops/DR.md` §9.
