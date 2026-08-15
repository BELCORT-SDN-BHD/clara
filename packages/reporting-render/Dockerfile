# syntax=docker/dockerfile:1
# clara-render — the deterministic report render worker (Wave E lane ζ; design part2 §10).
#
# A SEPARATE Fly app from the runtime (NEVER the non-HA runtime machine). BUILD FROM THE REPO ROOT
# so the context carries packages/reporting-render AND packages/runtime (the safeReportKey object
# family is REUSED from @clara/runtime rather than copied — the packages/backup ↔ packages/db
# precedent). Build-only + push; a plain `fly deploy` would START a machine, i.e. fire a live
# render run. The command of record: docs/ops/DR.md §10.
#
# NO secrets are baked: the root .dockerignore excludes .env / node_modules / .git, and every
# credential is supplied at RUN time as a Fly secret (env) — see docs/ops/DR.md §10.
#
# ============================================================================================
# DETERMINISM IS A PROPERTY OF THIS FILE, NOT OF THE WORKER'S CODE.
# The worker can refuse to use an ambient clock, but only the image can guarantee that the same
# fonts, the same typesetting engine and the same text extractor are present seven years from now.
# So: one pinned base by DIGEST, one pinned engine binary verified by sha256, one pinned extractor
# from the distribution, and NO system fonts on the path the engine is allowed to read.
# The archived artefact is the image DIGEST (recorded in every manifest), never a tag.
# ============================================================================================
# THE BASE IS PINNED BY DIGEST, NOT BY TAG (codex M10). `node:20-bookworm-slim` is a MUTABLE
# pointer: the same Dockerfile at the same source commit would pull a different Node, a different
# libc and a different set of system libraries after any upstream push — which is precisely the
# cross-rebuild guarantee this lane measured and wrote into DR-render.md. A tag here would have
# made that measured claim false the first time upstream moved, and nothing would have said so.
# The tag is kept in the comment for readability; the digest is what builds.
#   node:20-bookworm-slim as of 2026-08-14
FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runner
ENV NODE_ENV=production
WORKDIR /app

# poppler-utils supplies pdftotext + pdfinfo (the §7 gate-3 extractor). The version is READ FROM
# THE BINARY at run time and written into every manifest — this line pins WHICH build is present,
# and the manifest records WHICH VERSION actually ran, so the two can be checked against each
# other rather than trusted.
# fontconfig is deliberately NOT installed: the engine runs with --ignore-system-fonts and an
# explicit --font-path, and an absent system font stack is a stronger guarantee than a flag.
# apt packages are VERSION-PINNED (codex M10). Unversioned `apt-get install` resolves against
# whatever the Debian mirror holds that day, so a rebuild could silently change the extractor —
# and the extractor's exact version is a REQUIRED manifest key precisely because the gate-3 scan
# must be repeatable seven years later. Pinning here and reading the version from the binary at
# run time are two halves of one claim: the pin says what should be there, the read says what is.
# To bump: change the version, rebuild, and re-run the double-render drill including its control.
# Read from `apt-cache policy` inside the pinned base, not guessed — an invented version number
# fails the build loudly, which is the good direction, but it also proves the pin was never
# verified against the image it pins.
#
# WHEN THE PIN VANISHES, AND IT WILL. Debian mirrors carry only the CURRENT point release of a
# stable package, so the day bookworm rolls poppler to deb12u4 this exact version disappears and
# `apt-get install` fails with "Version ... not found" — on every PR in the repo, including ones
# that touch nothing here. That is the accepted cost of a reproducible image, not a defect, and the
# remedy is a two-minute bump rather than a floating pin:
#
#   1. docker run --rm node@<the digest pinned above> sh -c 'apt-get update >/dev/null && apt-cache policy poppler-utils xz-utils'
#   2. copy the reported Candidate versions into the two ARGs below
#   3. rebuild and run scripts/double-render-drill.mjs — ALL THREE arms, because a new poppler is a
#      new extractor and the artifact's extracted_text_sha256 is part of what gets sealed
#   4. record the old and new versions in the PR body; a sealed artifact names its extractor
#      version in its manifest, so this is a change a reader seven years out may need to explain
#
# The alternative — pointing apt at snapshot.debian.org so the exact version never vanishes — was
# considered and NOT taken: it makes every image build depend on a single upstream archive whose
# availability nobody here controls, and trades a loud, dated, two-minute failure for a silent
# dependency on someone else's uptime.
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

# The typesetting engine: a PINNED upstream release binary, checksum-verified, not a distro
# package (bookworm ships none, and a distro version would move under an apt update). To bump:
# edit these two lines to the new version and its checksum from the release's own SHA256 listing,
# then re-run the double-render drill — a new engine version is a new determinism claim and it is
# MEASURED, never assumed.
#
# PROVENANCE OF THE CHECKSUM, stated because a hash with no story is a hash nobody can re-derive:
# the tarball was fetched from the official GitHub release URL below and hashed locally at the
# build spike (2026-08-14). That bootstrap proves the pin matches what upstream served at that
# moment; from then on the PIN is what matters — every later build must produce this exact hash or
# it stops.
#
# A BUMP RE-RUNS THE FULL DRILL, ALL THREE ARMS. A new engine version is a new determinism claim,
# and the claim is not "two renders matched" — it is "two renders matched, a changed wall clock did
# NOT move the bytes, and a changed pinned input DID". Byte-equality proves nothing unless the
# output is CAPABLE of varying: a drill that passes because it is measuring a constant has measured
# nothing. So the bump procedure is fetch the new asset, record its hash the same way, then run
# docs/ops/DR-render.md's drill in full — determinism (A==B), the clock arm (a different
# SOURCE_DATE_EPOCH must produce IDENTICAL bytes, because a real document pins its date from the
# reporting period), and the control (a different pinned input must produce different bytes).
# Reporting only the A==B arm would be a green light nobody earned.
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

# Node deps (just `pg`, for the short-lived per-job session). Installed at the APP ROOT so BOTH
# packages/reporting-render/**.mjs AND the reused packages/runtime/lib/storage.mjs resolve by
# walking up.
COPY packages/reporting-render/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# The worker plus the ONE runtime module it reuses. packages/runtime is copied in full because a
# partial copy of a package is a copy that breaks the next time an import is added; nothing in it
# is executed here beyond lib/storage.mjs.
COPY packages/reporting-render ./packages/reporting-render
COPY packages/runtime ./packages/runtime

# CONTENT-ADDRESSED FONTS ONLY, AND NO FONT DIRECTORY IN THE IMAGE AT ALL.
#
# There is deliberately no /app/fonts here. The worker fetches each job's fonts BY CONTENT HASH
# from the firm's published house-style assets, into that job's own temp directory, verifying every
# file against the sha256 the manifest pins (lib/fonts.mjs), and points the engine at THAT.
#
# A long-lived font directory baked into the image would be a place fonts could accumulate outside
# content addressing — the system-font hazard wearing a different path. It would also make the
# typeface a property of the BUILD rather than of the firm's house style, so a firm changing its
# typeface would need a new image and an artifact sealed years ago could not name the font it
# actually used. fontconfig is likewise NOT installed, and the engine runs with
# --ignore-system-fonts: an absent font stack is a stronger guarantee than a flag.

# Image-intrinsic paths and pins. These live HERE (not fly.toml [env]) because the machine is
# created with `fly machine run`, which DISREGARDS fly.toml configuration — only Dockerfile ENVs
# and machine-run flags reach the machine (docs/ops/DR.md §10).
ENV CLARA_RENDER_TYPST_BIN=/usr/local/bin/typst \
    CLARA_RENDER_PDFTOTEXT_BIN=/usr/bin/pdftotext \
    CLARA_RENDER_PDFINFO_BIN=/usr/bin/pdfinfo \
    CLARA_RENDER_ASSEMBLER_VERSION=clara.reporting-render/v1 \
    TZ=UTC \
    LC_ALL=C

# The image's OWN digest and source commit are REQUIRED manifest keys and cannot be known while
# the image is being built (the digest is the hash of the finished image). They are passed at
# machine-create time as -e flags; the worker REFUSES to seal without them, and refuses a tag in
# place of a digest. That refusal is the whole point: "unknown" and "reproducible" must never be
# indistinguishable in a sealed artifact.
#   -e CLARA_RENDER_IMAGE_DIGEST=sha256:<64 hex>
#   -e CLARA_RENDER_SOURCE_COMMIT=<40 hex>

# A Fly machine boots this to completion: claim → typeset → extract → scan → put → seal, then
# exit. Exit 0 = the queue was drained (a per-job REFUSAL is recorded on its row and is not a
# crash); non-zero = the worker itself could not run.
CMD ["node", "packages/reporting-render/scripts/render-worker.mjs"]
