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

### The prepayment-amortisation battery (#653)

`prepayment-schedule.test.mjs` and `prepayment-occurrences.test.mjs` are frontier-gated on the
`prepayment_amortisation$` stem, never on a migration number, and they share
`prepayment-schedule-fixtures.mjs`. That module JOINS TWO EXISTING WORLDS rather than building a
third: `f-a4-pr2a-fixtures.mjs`'s `prepaidScene` supplies the prepayment half (a fiscal year, a
filed verified document, a prepaid-asset account, an expense target and an APPROVED entry binding
the document and debiting exactly one asset line) and `accounting-plans-fixtures.mjs` supplies the
plan half (a real authority row, the runtime scan, the catch-up door, the occurrence readers).

Two things a later hand will trip over if they are not stated here. The scene opens CALENDAR-YEAR
fiscal years — `clara.propose_fiscal_year` derives `ends_on` from the client's fy-end, so a year
opened on any other day is a short year `clara.open_fiscal_year` refuses without a stated
`length_reason` — and it opens the SUCCESSOR year too when the term crosses into it, because the
frozen evaluator refuses a term running past its fiscal year with no open successor. And the scene
ACCEPTS the published Terms and DPA as the firm owner: model egress is a standing precondition for
every occurrence (0195), so a scene that skipped it measures `egress_not_authorized` where it meant
to measure something else. Both were measured, not assumed — the locked-period cell answered CLR13
instead of CLR19 before the acceptance was added.

`prepayment-0208-preintegration-gate.mjs` is the package-wide sweep's escape; a FOCUSED run does
not preload it and fails loudly on a database without the lane, because a skip is not evidence.