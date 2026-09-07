# @clara/backup

A separate Fly batch app that creates encrypted off-site recovery copies. It is excluded from
the pnpm workspace and installs its own dependencies inside its Docker image.
System boundaries live in [ARCHITECTURE](../../docs/ARCHITECTURE.md).

## One run

The runner reuses [the database full-profile backup](../db/README.md), captures globals evidence
and selected Auth data (`auth.users` and `auth.identities`), and mirrors private document
objects incrementally. It verifies content addresses, compresses database files with zstd,
encrypts the bundle and individual document copies with age, uploads to R2, and sends success
or failure to a dead-man switch.

The cleartext manifest contains integrity/freshness metadata. Detailed document paths remain in
the encrypted bundle. Plaintext staging is removed on success or failure.
The mirror is additive; snapshot expiry is an R2 lifecycle setting, not deletion performed by
this script. The default rolling DR window is 30 days. It does not establish statutory retention
or prove that a backup can be restored.

## Configuration

[.env.example](.env.example) lists the variables; the script does not automatically load that file.
Supply environment variables directly or use Node's `--env-file` option for local rehearsals.

- Database: `DATABASE_URL` or `PG*`; the shared helper derives the external tools' environment.
- Storage: `CLARA_BACKUP_STORAGE_URL`, `CLARA_BACKUP_STORAGE_KEY_FILE`,
  `CLARA_BACKUP_STORAGE_BUCKET`.
- R2: `CLARA_BACKUP_R2_BUCKET`, `CLARA_BACKUP_R2_REMOTE`, and rclone configuration or
  `RCLONE_CONFIG_R2_*` variables.
- Encryption: `CLARA_BACKUP_AGE_RECIPIENTS_FILE`. The committed recipient key is public;
  the private age identity stays outside the repository and backup store.
- Monitoring: `CLARA_BACKUP_PING_URL` or `CLARA_BACKUP_PING_URL_FILE`.
  A real run refuses missing monitoring unless the explicit rehearsal override
  `CLARA_BACKUP_ALLOW_NO_PING=1` is set.
- Scratch/retention: `CLARA_BACKUP_STAGING_DIR`, `CLARA_BACKUP_RETENTION_DAYS`.
- Tools: PostgreSQL 17 `PG_DUMP`/`PG_DUMPALL`/`PSQL`, plus age, tar/zstd and rclone.

Credentials stay in environment or mounted secret files. The backup Storage credential is a
privileged service credential and is separate from the runtime's restricted custody role.

## Validate and deploy

From this package:

```sh
node scripts/backup-run.mjs --dry-run
node --check scripts/backup-run.mjs
npm test
```

Dry-run performs no database, Storage, R2 or monitoring I/O. It checks configuration shape and
prints missing values; it does not certify a real backup.

From the repository root, build and push without starting a backup:

```sh
fly deploy . --config packages/backup/fly.toml --dockerfile packages/backup/Dockerfile --build-only --push -a clara-backup
```

Create/configure the scheduled Machine from the verified image with explicit region, VM size,
environment and secret-file mounts; `fly machine run` is a Machine operation, not a replay of
this app's `fly.toml`. The Dockerfile names the expected mounted Storage secret and intrinsic
rclone settings. Review the actual Machine configuration after changes.
[Fly Machine documentation](https://www.fly.io/docs/machines/flyctl/fly-machine-run/)

## Verify recovery

Check the uploaded manifest's freshness, checksum and expected migration frontier, and confirm
the dead-man switch observed the run. Periodically decrypt a bundle into isolated storage,
restore it on a disposable PostgreSQL target, verify roles/ACLs/engine journals and document
hashes, then record the result. Keep the restored workflow engine off during a drill.

Use [the database recovery instructions](../db/README.md) for restore and strict verification.
A successful upload or recent monitoring ping is not a restore result.