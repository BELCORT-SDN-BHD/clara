# syntax=docker/dockerfile:1
# Clara runtime (Slice 4, contract §5). BUILD FROM THE REPO ROOT (pnpm workspace):
#     fly deploy --config packages/runtime/fly.toml        # context = repo root
#
# NO secrets are baked: source is copied SELECTIVELY (never .env or node_modules),
# and the runner carries only the self-contained nitro output. The native
# cbor-extract binding is TARGET-correct because the build runs in THIS linux image
# (a Windows-built .output would carry a win32 binding — never copy a host .output).

# ---------------------------------------------------------------------------
# builder — install (cached on manifests) then nitro build.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
RUN corepack enable
WORKDIR /app

# 1. Workspace manifests ONLY (this layer re-runs only when a manifest/lockfile
#    changes). The install is FILTERED to @clara/runtime and its dependency
#    closure, so only that closure's manifests need to be present — apps/web is a
#    workspace member and has never been copied here. The `apps/dashboard`
#    manifest that used to sit beside these was deleted with that app at P6-X;
#    leaving the COPY behind would fail the image build on a missing path.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
RUN pnpm install --filter @clara/runtime... --frozen-lockfile

# 2. Runtime source — deliberately NOT .env / node_modules / .output / tests / .swc.
#    tsconfig.base.json is the workspace base the runtime tsconfig extends — without
#    it the TS resolution chain collapses and nitro's rolldown build fails (proven
#    at first deploy).
COPY tsconfig.base.json ./
COPY packages/runtime/tsconfig.json packages/runtime/nitro.config.ts ./packages/runtime/
COPY packages/runtime/src ./packages/runtime/src
COPY packages/runtime/lib ./packages/runtime/lib
COPY packages/runtime/workflows ./packages/runtime/workflows
COPY packages/runtime/plugins ./packages/runtime/plugins
COPY packages/runtime/scripts ./packages/runtime/scripts
RUN pnpm --filter @clara/runtime build

# 3. A PRUNED PRODUCTION node_modules for the runner (S4-AB2). The nitro bundle does
#    NOT bundle the WDK world — plugins/startWorld.ts loads @workflow/world-postgres
#    via a RUNTIME require (WORKFLOW_TARGET_WORLD), so it must resolve from the runner
#    cwd. `pnpm deploy` produces a self-contained, prod-only node_modules.
RUN pnpm --filter @clara/runtime deploy --legacy --prod /app/deploy

# ---------------------------------------------------------------------------
# runner — the nitro output + the supervisor + the pruned engine node_modules.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Locally controlled malware scanner. The runtime supervises clamd and refreshes
# signatures; every production upload still uses the socket INSTREAM protocol and
# fails closed while the daemon is unavailable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends clamav-daemon clamav-freshclam ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/clamav /var/lib/clamav \
 && chown -R clamav:clamav /run/clamav /var/lib/clamav

# Engine deps for the runtime require()s (@workflow/world-postgres, workflow, pg, ...)
# — resolved from the cwd node_modules by the .output bundle at runtime (S4-AB2).
COPY --from=builder /app/deploy/node_modules ./node_modules
# The nitro node-server output (bundled deps in _libs + traced native cbor modules).
# serve.mjs resolves ../.output relative to itself — keep the scripts/.output layout.
COPY --from=builder /app/packages/runtime/.output ./.output
COPY --from=builder /app/packages/runtime/scripts ./scripts
# The entry scripts import ../lib/* at RUNTIME (serve.mjs + worker.mjs → lib/pools.mjs;
# relay.mjs → lib/relay.mjs) — these are NOT the bundled copies, so ship lib/ (S4-FX1).
COPY --from=builder /app/packages/runtime/lib ./lib
COPY --from=builder /app/packages/runtime/package.json ./package.json

# H-43: the Supabase pooler CA. `ca-certificates` above is the ~150-root PUBLIC Mozilla store,
# and the pooler's root is SELF-SIGNED — so `sslmode=verify-full` cannot resolve without this
# file. Copied from the REPO ROOT (the build context is the repo root, the same reason
# `COPY tsconfig.base.json ./` works above). A trust anchor is the OPPOSITE of a secret: it is
# published precisely so clients can pin it (docs/ops/dsn-bridge.md, "why committing it is
# lawful"). THIS PATH IS BAKED INTO EVERY LANE DSN SECRET as
# `sslrootcert=/app/ops/tls/pooler-ca.crt` — changing it later is another secrets ceremony
# across all six DSNs, so it is fixed here and in lib/tls-ca.mjs's IN_IMAGE_CA_PATH, with a
# drift cell pinning both. CEREMONY ORDER IS FAIL-CLOSED IN THE WRONG DIRECTION IF REVERSED:
# ship this image FIRST, verify it boots, THEN move the secrets — a secret carrying
# `sslrootcert` before the file exists makes every lane throw at readFileSync.
COPY ops/tls/pooler-ca.crt /app/ops/tls/pooler-ca.crt

# CB-AE2E-035: the commit this image was built from, for GET /api/build-info. Passed at deploy
# (`fly deploy --build-arg CLARA_BUILD_SHA=$(git rev-parse HEAD)`) and UNSET when it is not —
# the route reports null rather than a guess, because a fabricated sha is worse than no sha.
ARG CLARA_BUILD_SHA=""
ENV CLARA_BUILD_SHA=$CLARA_BUILD_SHA

EXPOSE 3200

# The crash-only supervisor: HTTP + world + control listener + leader loop. The
# world starts ONLY when CLARA_START_WORLD=1 (explicit opt-in; fly.toml/[env] sets
# it for production, secrets can override). All secrets come from the environment,
# never the image. Fly restarts the machine on any non-zero exit (crash-only, §4.1).
CMD ["node", "scripts/serve.mjs"]
