# syntax=docker/dockerfile:1
# clara-backup — the off-site DR backup app (Wave A2 §8 / WA2-R6). A SEPARATE Fly app
# from the runtime (NEVER the non-HA runtime machine). BUILD FROM THE REPO ROOT so the
# context carries both packages/backup AND packages/db (the full-profile dump tooling
# is reused from @clara/db) — build-only + push; a plain `fly deploy` would START a
# machine, i.e. fire a live backup run. The command of record: docs/ops/DR.md §9 step 6.
#
# NO secrets are baked: the root .dockerignore excludes .env / node_modules / .git, and
# every credential is supplied at RUN time as a Fly secret (env) — see docs/ops/DR.md §9.
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# System tools: the v17 Postgres CLIENT (server is 17.6 — a v16 client aborts), age
# (encryption), rclone (R2 upload), zstd (compress-before-age), curl (dead-man's-switch
# ping is done in-process via fetch, but curl is handy for debugging), ca-certificates.
# postgresql-client-17 comes from the PGDG apt repo (bookworm ships only 15/16).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg age rclone zstd; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-17; \
    rm -rf /var/lib/apt/lists/*

# The v17 client binaries (Debian installs them under /usr/lib/postgresql/17/bin).
ENV PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump \
    PG_DUMPALL=/usr/lib/postgresql/17/bin/pg_dumpall \
    PSQL=/usr/lib/postgresql/17/bin/psql

# Node deps (just `pg`, for the schema-presence check in @clara/db's backup.mjs and the
# migration-head query). Installed at the APP ROOT /app/node_modules so BOTH
# packages/backup/scripts/*.mjs AND packages/db/lib/pg.mjs resolve `pg` by walking up.
COPY packages/backup/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# The backup app + the reused @clara/db dump tooling (source only — node_modules and
# .env are excluded by the root .dockerignore).
COPY packages/backup ./packages/backup
COPY packages/db ./packages/db

# Ephemeral scratch for the run (bundle + only the NEW encrypted firm-docs; firm-doc
# PLAINTEXT is never written to disk — it is encrypted from memory). Mount a Fly volume
# at /data and set CLARA_BACKUP_STAGING_DIR=/data/staging if the firm-doc delta is large.
ENV CLARA_BACKUP_STAGING_DIR=/tmp/clara-backup
RUN mkdir -p /tmp/clara-backup

# Image-intrinsic paths. These live HERE (not fly.toml [env]) because the scheduled
# machine is created with `fly machine run`, which DISREGARDS fly.toml configuration —
# only Dockerfile ENVs and machine-run flags reach the machine (docs/ops/DR.md §9).
#   - The age RECIPIENT (public) key ships in the image at this path.
#   - The service_role key file is materialized at machine-create time via
#     `--file-secret /run/secrets/clara_storage_service_key=CLARA_BACKUP_STORAGE_SERVICE_KEY_B64`
#     (the Fly secret holds the BASE64-encoded key; Fly decodes it to this file).
ENV CLARA_BACKUP_AGE_RECIPIENTS_FILE=/app/packages/backup/deploy/age-recipient.txt \
    CLARA_BACKUP_STORAGE_KEY_FILE=/run/secrets/clara_storage_service_key

# A Fly SCHEDULED machine boots this to completion daily. Exit 0 = success (pings the
# dead-man's-switch); any non-zero exit = failure (fires the /fail ping). All secrets
# come from the environment (Fly secrets), never the image.
CMD ["node", "packages/backup/scripts/backup-run.mjs"]
