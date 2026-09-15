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

## Named suite families

`p4t1-*` (`p4t1-invite`, `p4t1-identity`, `p4t1-reads`, `p4t1-add-member-regression`) drive the
invitation and identity doors — `invite_member`, `accept_invite`, `revoke_invite`,
`claim_identity` — through `p4t1-fixtures.mjs`, whose `asHumanEmail` sets a real
`request.jwt.claims` blob carrying **both** `sub` and `email`, because those doors read the address
from the claim and never from an argument.

`mdrw-*` (`mdrw-rank-walls`) drive the member doors' rank walls: the target-rank wall, the self-act
refusal, the authz-before-lifecycle ordering, the replay contract and a two-session lock race.

`preview-invite.test.mjs` drives `clara.preview_invite` (0209): the recipient's own read, the
byte-identical no-oracle refusal, the three non-pending effective statuses, the grant posture, and
the six non-regression `prosrc` pins that prove 0209 recut nothing. Its gate is
`preview-invite-preintegration-gate.mjs`; a focused run leaves `CLARA_ALLOW_MISSING_PREVIEW_INVITE`
unset and must count zero skips.

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