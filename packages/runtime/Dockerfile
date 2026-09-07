# syntax=docker/dockerfile:1
# Clara runtime. Build from the repository root.
# See packages/runtime/README.md, "Deployment and rollback".
# Selective COPY keeps local secrets and host-built output out of the image.
# Build native bindings inside Linux; never reuse a Windows .output directory.

# Builder: install dependencies, then compile Nitro.
FROM node:20-bookworm-slim AS builder
RUN corepack enable
WORKDIR /app

# Cache installation on manifests and the lockfile. Install only the runtime
# workspace and its dependency closure.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
RUN pnpm install --filter @clara/runtime... --frozen-lockfile

# Copy the runtime source and shared TypeScript configuration.
# Tests, local dependencies and host-built output are excluded.
COPY tsconfig.base.json ./
COPY packages/runtime/tsconfig.json packages/runtime/nitro.config.ts ./packages/runtime/
COPY packages/runtime/src ./packages/runtime/src
COPY packages/runtime/lib ./packages/runtime/lib
COPY packages/runtime/workflows ./packages/runtime/workflows
COPY packages/runtime/plugins ./packages/runtime/plugins
COPY packages/runtime/scripts ./packages/runtime/scripts
RUN pnpm --filter @clara/runtime build

# The Postgres world is loaded at runtime, so the runner needs production
# node_modules in addition to the compiled Nitro output.
RUN pnpm --filter @clara/runtime deploy --legacy --prod /app/deploy

# Runner: compiled server, supervisor and production dependencies.
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# The runtime supervises clamd and refreshes signatures.
# Production intake uses INSTREAM and refuses uploads while scanning is unavailable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends clamav-daemon clamav-freshclam ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/clamav /var/lib/clamav \
 && chown -R clamav:clamav /run/clamav /var/lib/clamav

# Runtime-loaded engine dependencies resolve from /app/node_modules.
COPY --from=builder /app/deploy/node_modules ./node_modules
# serve.mjs resolves ../.output relative to itself; preserve this layout.
COPY --from=builder /app/packages/runtime/.output ./.output
COPY --from=builder /app/packages/runtime/scripts ./scripts
# Entry scripts import lib directly, outside the compiled server bundle.
COPY --from=builder /app/packages/runtime/lib ./lib
COPY --from=builder /app/packages/runtime/package.json ./package.json

# Public trust anchor; its path is also pinned by lib/tls-ca.mjs.
# Deploy an image containing this file before configuring DSNs to reference it.
# See README.md, "Health, TLS and serving identity"; shipping the file does not
# establish that the live DSNs verify certificates.
COPY ops/tls/pooler-ca.crt /app/ops/tls/pooler-ca.crt

# Supply CLARA_BUILD_SHA at build time for authenticated /api/build-info.
# If omitted, the endpoint reports a null SHA.
ARG CLARA_BUILD_SHA=""
ENV CLARA_BUILD_SHA=$CLARA_BUILD_SHA

EXPOSE 3200

# The supervisor runs the server and consumers. The durable world starts only
# with CLARA_START_WORLD=1; production credentials come from environment/secrets.
CMD ["node", "scripts/serve.mjs"]
