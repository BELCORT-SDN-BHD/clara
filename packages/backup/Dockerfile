# syntax=docker/dockerfile:1
# Off-site backup worker. Build from the repository root to include shared DB tooling.
# See README.md, "Validate and deploy", for build-only and Machine configuration.
# Credentials arrive through environment/mounted files; local secrets are excluded.
# #616 follow-up: Node 22, matching the rest of the estate. Node 20 reached end-of-life, and this
# app is not a pnpm workspace member, so nothing about the root engines pin reached it — it was the
# last node:20 line under packages/backup. The Debian codename below (bookworm, for the PGDG
# sources.list entry) is the same on the node:22 tag, so the pgdg pin needs no change with it.
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# PostgreSQL 17 client tools, age encryption, zstd compression and supporting utilities.
# pg_dump must not be older than the server's major version. PGDG supplies the client.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg age unzip zstd; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-17; \
    rm -rf /var/lib/apt/lists/*

# Checksum-verified rclone release. For an upgrade, verify the linux-amd64 archive
# against the official release's SHA256SUMS before changing both pins.
# Avoid RCLONE_-prefixed ARG names: rclone treats that prefix as configuration.
ARG PINNED_RCLONE_VERSION=1.74.4
ARG PINNED_RCLONE_SHA256=fe435e0c36228e7c2f116a8701f01127bb1f694005fc11d1f27186c8bca4115d
RUN set -eux; \
    curl -fsSL -o /tmp/rclone.zip "https://downloads.rclone.org/v${PINNED_RCLONE_VERSION}/rclone-v${PINNED_RCLONE_VERSION}-linux-amd64.zip"; \
    echo "${PINNED_RCLONE_SHA256}  /tmp/rclone.zip" | sha256sum -c -; \
    unzip -j /tmp/rclone.zip "rclone-v${PINNED_RCLONE_VERSION}-linux-amd64/rclone" -d /tmp/rclone-bin; \
    install -m 0755 /tmp/rclone-bin/rclone /usr/local/bin/rclone; \
    rm -rf /tmp/rclone.zip /tmp/rclone-bin; \
    rclone --version

# PostgreSQL 17 client binary paths.
ENV PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump \
    PG_DUMPALL=/usr/lib/postgresql/17/bin/pg_dumpall \
    PSQL=/usr/lib/postgresql/17/bin/psql

# Shared pg dependency resolves from /app for the backup and DB helper packages.
COPY packages/backup/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Backup source and shared dump tooling; .dockerignore excludes local secrets/dependencies.
COPY packages/backup ./packages/backup
COPY packages/db ./packages/db

# Ephemeral bundle and encrypted document staging. Document plaintext streams from
# memory into encryption. A large delta can use a mounted staging volume instead.
ENV CLARA_BACKUP_STAGING_DIR=/tmp/clara-backup
RUN mkdir -p /tmp/clara-backup

# Public encryption recipients are included; the private age identity is not.
# Machine configuration must mount the Storage credential at this path, for example:
# --file-secret /run/secrets/clara_storage_service_key=CLARA_BACKUP_STORAGE_SERVICE_KEY_B64
# The Fly file secret contains the base64-encoded value. See README.md, "Configuration".
ENV CLARA_BACKUP_AGE_RECIPIENTS_FILE=/app/packages/backup/deploy/age-recipient.txt \
    CLARA_BACKUP_STORAGE_KEY_FILE=/run/secrets/clara_storage_service_key

# R2 remote constants. The token and endpoint remain runtime secrets.
# no_check_bucket avoids a CreateBucket fallback that a bucket-scoped token cannot use.
ENV RCLONE_CONFIG_R2_TYPE=s3 \
    RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    RCLONE_CONFIG_R2_REGION=auto \
    RCLONE_CONFIG_R2_ACL=private \
    RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# Run to completion. A real run reports success/failure to the configured monitor;
# scheduling is configured on the Machine. Credentials are never embedded here.
CMD ["node", "packages/backup/scripts/backup-run.mjs"]
