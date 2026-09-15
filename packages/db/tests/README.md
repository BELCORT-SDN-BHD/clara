# Database tests

This suite exercises the migration chain, tenant isolation, audited writers, accounting constraints,
document processing, onboarding, close/reporting, and operational tooling against real PostgreSQL.
Older test names often identify a regression or migration boundary that is still needed.

## Running

Use a disposable PostgreSQL 17 target with credentials in `PG*` or the connection environment
described in [the package README](../README.md). Set `CLARA_ALLOW_DESTRUCTIVE=1` only for that
target, then run from the repository root:

```sh
pnpm --filter @clara/db migrate
pnpm --filter @clara/db seed
pnpm --filter @clara/db test
```

The package test command includes the preintegration gates and serializes files within this package.
Some fixtures create sibling databases or cluster roles; they need a disposable **cluster**, not
merely an empty schema. Do not run the suite against the production project.

Use matching PostgreSQL 17 client binaries for clone/dump tests; `PG_DUMP` and `PSQL` override PATH.
The migration helper's `cloneAmbientDatabase` enforces the destructive guard against its source
environment before cloning.

## Frontier-gated batteries and the focused-run rule

A battery whose subject is one migration gates on that migration's STABLE STEM in
`clara.schema_migrations`, never on a number: numbers are claimed at merge, and a `like '0201_%'`
gate stops gating the moment a file is renumbered. `tests/fixed-asset-acquisition.test.mjs`
(#639, stem `fixed_asset_acquisition$`) carries the discipline in its clearest form:

* the package-wide sweep preloads `tests/fixed-asset-acquisition-preintegration-gate.mjs`
  (one `--import` in `package.json`'s `test` script), which sets
  `CLARA_ALLOW_MISSING_FA_ACQUISITION=1` so a database BELOW the migration skips, counted;
* a FOCUSED invocation does not preload it and therefore **fails loudly** on a database that lacks
  the migration. A skip is not evidence, and a worker running one file by hand should be told so
  rather than shown a green run about nothing.

Every assertion under test in that battery runs through a `humanQuery` / `roleQuery` persona
(least-privileged role) or a real wake credential; `rootQuery` appears only as a readback.

## Freshness and split chains

A fresh database per full run is the reliable default. Some tests prove one-way evaluator
deployment or append-only reference seeds; reusing their database cannot reproduce the initial
state. `CLARA_ESTATE_REUSED_DB=1` acknowledges reuse for tests that support it; it does not make
every test repeatable.

`split-lists/` defines bounded historical-chain suites. Set `CLARA_MIGRATIONS_DIR` to the
suite's matching chain, rather than running those lists against the full frontier.
A skipped preintegration suite is not evidence that its feature passed.

Read test helper contracts before adding teardown or starting parallel suites against one cluster.
Database cleanup and cluster-role cleanup must account for other live test connections.