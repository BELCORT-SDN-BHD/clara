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

## Firm knowledge defaults (#654, `0205_firm_knowledge_defaults.sql`)

`knowledge-firm-defaults.test.mjs` is the firm-default half of the governed Knowledge lane, above
`knowledge-records.test.mjs` (#644, `0192`). Twenty cells, all through `humanQuery` at the least
privilege that should succeed: the eligibility wall (only a catalogued firm-defaultable key becomes
a firm default), the cross-client evidence wall in BOTH directions and on BOTH client-bearing pins
(a firm-scope record may not pin a document with any live client filing, at N=1 and N>1, nor any
`accounting_work` at all; and a document a live firm rule cites may no longer be FILED to a client
afterwards, while a correction or withdrawal carrying the predecessor's pins stays admissible so a
contaminated rule can always be retracted), the client exception surviving a later firm default in
both the register and the runtime pack, the promotion floor and what the act records, revoked
membership on all three knowledge lanes, the trust wall at the firm boundary, the two new reads,
the promotion as an operation (op_key replay is one receipt, a reused key with different arguments
is refused by name, two admins racing behind the `uq_knowledge_live` barrier leave exactly one live
rule), and the negative census proving no function outside the knowledge cohort reads
`clara.knowledge_records`.

Its frontier gate is `knowledge-firm-defaults-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_KNOWLEDGE_FIRM_0205`), wired into the package `test` script. A package-wide run
against a chain below `0205` SKIPS the battery loudly; a focused run (no gate preloaded) FAILS. A
skip is not evidence. The shared world is `knowledge-fixtures.mjs` (#644's firm, four ranks, two
clients) plus `knowledge-firm-fixtures.mjs` (documents with and without live client filings, a live
Work to cite, membership deactivation, a session-local `session_replication_role = 'replica'` filing
that manufactures the pre-0205 contaminated state the retraction hatch exists for, and the runtime
form of 0205's own violator census).

Read test helper contracts before adding teardown or starting parallel suites against one cluster.
Database cleanup and cluster-role cleanup must account for other live test connections.