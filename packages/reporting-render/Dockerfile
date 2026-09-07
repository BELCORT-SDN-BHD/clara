# syntax=docker/dockerfile:1
# Sealed report renderer. Build from the repository root for the shared runtime modules.
# Build/push and execution are separate; see README.md, "Configuration and deployment".
# Credentials are supplied at runtime; the root .dockerignore excludes local secrets.
#
# Pin the base, extractor and engine; retain the finished image by digest for replay.
# Base: node:20-bookworm-slim. The digest below selects the actual image.
FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runner
ENV NODE_ENV=production
WORKDIR /app

# Poppler supplies pdftotext/pdfinfo; the manifest records the binary's actual version.
# Package pins may disappear from Debian's current mirror. When updating a pin,
# inspect apt-cache policy in the pinned base, then rebuild and run the full
# double-render drill: repeat equality, clock independence and changed-input control.
# Keep old/new versions in the change record. Do not silently float the versions.
ARG PINNED_POPPLER_VERSION=22.12.0-2+deb12u3
ARG PINNED_XZ_VERSION=5.4.1-1+deb12u1
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl \
      "poppler-utils=${PINNED_POPPLER_VERSION}" \
      "xz-utils=${PINNED_XZ_VERSION}"; \
    rm -rf /var/lib/apt/lists/*; \
    pdftotext -v 2>&1 | head -1

# Checksum-verified Typst release. For an upgrade, verify the official release asset
# and checksum, update both pins, then repeat all three double-render drill arms.
# The original checksum was measured from this release's tarball.
ARG PINNED_TYPST_VERSION=0.12.0
ARG PINNED_TYPST_SHA256=605130a770ebd59a4a579673079cb913a13e75985231657a71d6239a57539ec3
RUN set -eux; \
    curl -fsSL -o /tmp/typst.tar.xz \
      "https://github.com/typst/typst/releases/download/v${PINNED_TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz"; \
    echo "${PINNED_TYPST_SHA256}  /tmp/typst.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/typst.tar.xz -C /tmp; \
    install -m 0755 /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst; \
    rm -rf /tmp/typst.tar.xz /tmp/typst-x86_64-unknown-linux-musl; \
    typst --version

# Install shared pg dependencies at /app so both packages can resolve them.
COPY packages/reporting-render/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Copy the worker and its reused runtime storage helpers with their dependency closure.
COPY packages/reporting-render ./packages/reporting-render
COPY packages/runtime ./packages/runtime

# Fonts are fetched per job by content hash and verified before typesetting.
# The engine uses the job's explicit font path and ignores system fonts.
# No persistent font directory is baked into the image.

# Intrinsic executable paths live in the image. Machine-specific environment and
# secrets must be supplied explicitly; see README.md, "Configuration and deployment".
ENV CLARA_RENDER_TYPST_BIN=/usr/local/bin/typst \
    CLARA_RENDER_PDFTOTEXT_BIN=/usr/bin/pdftotext \
    CLARA_RENDER_PDFINFO_BIN=/usr/bin/pdfinfo \
    CLARA_RENDER_ASSEMBLER_VERSION=clara.reporting-render/v1 \
    TZ=UTC \
    LC_ALL=C

# The worker requires the finished image digest and source commit in its manifest.
# Supply them when configuring the Machine; the image digest is unavailable at build time.
#   -e CLARA_RENDER_IMAGE_DIGEST=sha256:<64 hex>
#   -e CLARA_RENDER_SOURCE_COMMIT=<40 hex>

# Claim, render, extract/validate, upload and settle sealed jobs, then exit.
# A refused job is recorded individually; worker startup/run failure exits nonzero.
CMD ["node", "packages/reporting-render/scripts/render-worker.mjs"]
