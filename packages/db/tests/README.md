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

## `client-onboarding-identity.test.mjs` (0204, #649)

Thirteen cells over the two 0204 doors, every assertion under test issued through `humanQuery` as a
real per-role session under real RLS. `rootQuery` appears only where the subject IS the catalog
(the `has_function_privilege` census), where a fixture is being planted, or where the ADVERSARY in a
concurrency cell performs an acquisition no application role may issue directly (no app-role DML, so
a human session cannot take a row lock or an advisory rung at all).

Frontier-gated on the live catalog through
`client-onboarding-identity-preintegration-gate.mjs`, which the package `test` script preloads: a
package-wide run against a chain below 0204 SKIPS loudly, a focused run FAILS. A **partial** cohort
throws rather than skipping — a settle door without its identity read is a narrower boundary nobody
chose.

Three of the thirteen are concurrency cells that pin the settle door's lock order — the two row
locks against `commit_client_onboarding` / `cancel_client_onboarding` (`p649.settle.lock_order`),
the client advisory rung `203005004` against `approve_opening_seed` / `set_client_fy_end`
(`p649.settle.opening_rung_order`), and the absence of ANY lock on another firm's plan
(`p649.settle.foreign_plan_takes_no_lock`, which turns the timing difference into a SQLSTATE by
running the outsider under `lock_timeout = '1s'` and carries a same-firm control proving the
timeout was live). They are barrier-driven, not sleep-driven, and each asserts the door still does
its work once the adversary rolls back.

Two cells are worth knowing about before editing them:

- `p649.identity.direct_birth_residual` asserts that `begin_client_onboarding` **still succeeds**
  at arity ≥ 2. It documents the residual deliberately; it is not a missing wall to "fix" by
  strengthening the assertion.
- `p649.identity.census_replay` re-runs `0103:1225-1239`'s five-role EXECUTE census over the three
  `name_family_*` helpers and asserts it is still EMPTY. The whole wrapper design turns on that
  negative, so a cell that ever needs relaxing is a design change, not a test change.

Counterparty fixtures are planted as post-images: `clara.counterparties` carries an immutability
trigger (CLR08) and `ck_counterparties_merge_retirement` admits retirement only as a merge, so a
retired counterparty is inserted with both `merged_into` and `retired_at` set.