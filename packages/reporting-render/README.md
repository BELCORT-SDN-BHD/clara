# @clara/reporting-render

A separate Fly batch worker for deterministic sealed-report PDFs. It is excluded from the pnpm
workspace and installs its own dependencies inside its Docker image.
System and product boundaries live in [ARCHITECTURE](../../docs/ARCHITECTURE.md).

## Current behavior

`scripts/render-worker.mjs` claims one `clara.render_jobs` job at a time using a short-lived
database session, reads its lease-scoped payload, assembles Typst source, renders PDF bytes,
extracts their text/metadata, scans the result, uploads at a content address, verifies the stored
bytes, and completes the database artifact. Failures are recorded on the job; lost leases stop
work before render or upload. The worker listens on no port.

Numbers arrive as database `displayed_text`; the sealed assembler does not calculate or round
them. Text is emitted as string literals. Fonts are fetched by content hash per job, then
typesetting runs without network/system-font fallback. The manifest pins image, source commit,
engine/extractor versions, assets and clock-free document metadata.

**Sandbox export is incomplete.** `lib/layout-sandbox.mjs` and sandbox database wrappers exist,
with tests and runtime dispatch machinery, but this worker does not import or run them.
A passing sandbox-layout test or watermark drill does not prove end-to-end sandbox export.

## Modules and validation

| Module | Responsibility |
|---|---|
| `lib/decisions.mjs`, `lib/lexicon.mjs` | Render admission and final-byte claim scan |
| `lib/chart.mjs`, `lib/layout.mjs` | Chart policy and sealed layout assembly |
| `lib/layout-sandbox.mjs` | Unwired sandbox assembly |
| `lib/manifest.mjs`, `lib/canonical-json.mjs` | Reproducible metadata and serialization |
| `lib/db.mjs`, `engine.mjs`, `extract.mjs`, `fonts.mjs`, `objects.mjs` | Database and binary/Storage adapters |

Frozen decision/assembly files are registered in the root workflow manifest. Retain their hashes
and import closure; a behavior change needs the corresponding version/deployment work.

From this package:

```sh
npm run check
npm test
npm run worker
```

`check` syntax-checks its explicitly listed modules. Tests exercise local decisions and adapters;
neither command proves a deployed render or Storage custody. `worker` runs real jobs when supplied
with the production connection and storage configuration.

Useful operational probes remain in `scripts/`: `verify-reports-prefix.mjs` writes synthetic
bytes and reads them back; `double-render-drill.mjs` compares repeated renders; and
`watermark-burn-drill.mjs` checks the produced bytes. Their prerequisites are in their headers.

## Configuration and deployment

Set `DATABASE_URL` for the runtime login/role and the restricted Storage variables
`CLARA_STORAGE_URL`, `CLARA_STORAGE_ROLE`, `CLARA_STORAGE_ROLE_JWT`.
The worker requires `CLARA_RENDER_IMAGE_DIGEST` (an immutable digest) and
`CLARA_RENDER_SOURCE_COMMIT`; absent provenance prevents sealing.
The Dockerfile pins Typst/Poppler binaries and intrinsic paths.
`CLARA_RENDER_LEASE_SECONDS` and `CLARA_RENDER_MAX_JOBS` bound one drain.

From the repository root:

```sh
fly deploy . --config packages/reporting-render/fly.toml --dockerfile packages/reporting-render/Dockerfile --build-only --push -a clara-render
```

Create/update the batch Machine from the verified image with explicit environment and VM settings.
A plain application deploy can start work; build-only does not.
Configure runtime dispatch separately through `packages/runtime/lib/reconciler-render.mjs`.
Verify the dedicated credential can write/read the reports prefix before the first real seal.
[Fly build/deploy documentation](https://www.fly.io/docs/blueprints/working-with-docker/)

After a deployment, verify a real queued job completes, its content hash matches the stored PDF,
and its manifest names the image actually used. Before replacing an image needed for reproducible
re-rendering, preserve that image and its pinned assets. A pure test result is not the report-chain
or disaster-recovery acceptance.