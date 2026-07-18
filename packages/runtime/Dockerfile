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
COPY packages/runtime/tsconfig.json packages/runtime/nitro.config.ts ./packages/runtime/
COPY packages/runtime/src ./packages/runtime/src
COPY packages/runtime/lib ./packages/runtime/lib
COPY packages/runtime/workflows ./packages/runtime/workflows
COPY packages/runtime/plugins ./packages/runtime/plugins
COPY packages/runtime/scripts ./packages/runtime/scripts
RUN pnpm --filter @clara/runtime build

# ---------------------------------------------------------------------------
# runner — the self-contained nitro output + the supervisor. No install, no secrets.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# The nitro node-server output is self-contained (bundled deps in _libs + traced
# native modules under .output/server/node_modules), so no runtime install is needed.
# serve.mjs resolves ../.output relative to itself, so keep the scripts/.output layout.
COPY --from=builder /app/packages/runtime/.output ./.output
COPY --from=builder /app/packages/runtime/scripts ./scripts
COPY --from=builder /app/packages/runtime/package.json ./package.json

EXPOSE 3200

# The crash-only supervisor: HTTP + world + control listener + leader loop. It
# defaults CLARA_START_WORLD=1; all secrets come from the environment (fly secrets),
# never the image. Fly restarts the machine on any non-zero exit (crash-only, §4.1).
CMD ["node", "scripts/serve.mjs"]
