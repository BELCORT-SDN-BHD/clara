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
#    changes). A --frozen-lockfile install validates against EVERY workspace member,
#    so all three package.json files must be present.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
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

EXPOSE 3200

# The crash-only supervisor: HTTP + world + control listener + leader loop. The
# world starts ONLY when CLARA_START_WORLD=1 (explicit opt-in; fly.toml/[env] sets
# it for production, secrets can override). All secrets come from the environment,
# never the image. Fly restarts the machine on any non-zero exit (crash-only, §4.1).
CMD ["node", "scripts/serve.mjs"]
