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

## Batteries worth naming

`rig-docs-source-revision.test.mjs` (#646, frontier `document_source_revision$`) drives the human
source-revision doors on the real chain under the real role matrix: a revision APPENDS and leaves
the superseded extraction's regions byte-identical, a revision quoting a moved reading refuses
CLR19 and echoes the attempted value, the arithmetic belt measures the NEW numbers, the orphaned
classification door is narrow (zero live filings — a retired-then-re-filed document still refuses),
op-key replay returns the original receipt, and NOTHING in the ticket reaches
`clara.accounting_work`, `clara.agent_tasks` or `clara.knowledge_records`. Its pre-integration gate
is `document-source-revision-preintegration-gate.mjs`; a focused run without that module FAILS
rather than skipping.
