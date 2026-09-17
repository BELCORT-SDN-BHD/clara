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

## Preintegration gates

A **preintegration gate** is a tiny `--import` module, one per feature battery, wired into this
package's `test` script in [package.json](../package.json). It probes the live catalog once and
makes the battery it guards SKIP on a database that lacks the battery's migration, so a chain
older than the feature reports "skipped" instead of a wall of false reds. A skip is therefore not
evidence — see the line above — and a battery must be run against a database at or past its own
migration before its result counts.

A new feature battery ships three things together: the battery itself, its own gate module beside
it, and a cohort row in [rig-meta.mjs](rig-meta.mjs) that names every object the migration adds so
the rig census stays wholly-present-or-wholly-absent. `counterparty-identity.test.mjs` +
`counterparty-identity-preintegration-gate.mjs` (migration `0200`, #647) is the current example.

## Owner-level fixture DML, where it is unavoidable

A cell that needs a state no verb can produce says so in source and builds it as the superuser,
rather than pretending the verbs reached it. `client-work-pack.test.mjs` (#650, frontier stem
`client_work_pack$`, preintegration gate `client-work-pack-preintegration-gate.mjs`) does this
three times, each labelled at the call site: it backdates a `clara.operation_receipts` instant
under `session_replication_role = replica` because that relation is append-only by design; it
plants an `outcome='refused'` receipt because every live writer in the estate inserts `committed`;
and it plants a second pending `clara.agent_interruptions` row at a higher `question_version`,
which `uq_agent_interruptions_work_version` permits but `open_work_question` refuses (the same
cell proves that refusal first, so the reader can tell a defence-in-depth assertion from a
verb-reachable one).

`firm-setup.test.mjs` (#648, journey A5) needs the 0203 cohort — `clara.firm_setup_keys`, the four
firm setup doors, `clara.get_firm_setup()` and `uq_onboarding_plans_one_open_firm`. A focused run
against a chain below that frontier FAILS by name; the package run preloads
`firm-setup-preintegration-gate.mjs`, which turns the same absence into a loud skip. Its world is
planted through the root connection because the subject is the setup doors rather than firm
creation, but every assertion under test runs through a least-privileged persona (`humanQuery`) —
the one deliberate root write is the `ck_onboarding_plan_items_answer` mechanism probe in
`p648.defer.reason`, whose subject is the CHECK itself and which no door owns. Two of its cells exist to pin what the WEB surface is allowed to assume about the doors rather than to test a new body: `p648.answer.correct` (answering again is the correction path, and a live firm default is corrected on the knowledge register instead) and `p648.opkey.attempt` (one op key names one request, so an op key derived from the answer VALUE can never be re-sent).

Read test helper contracts before adding teardown or starting parallel suites against one cluster.
Database cleanup and cluster-role cleanup must account for other live test connections.
## Intake-surface batteries (#633)

Four cells cover the reads the document-intake surfaces make. #633 ships no SQL, so each
one pins an EXISTING grant or an existing function rather than a new object; they are the
non-regression wall under a slice whose whole delivery is a set of reads.

- `document-intake-receipts.test.mjs` — the durable upload receipt. The list-form read the
  web rehydrates at mount (`apps/web/lib/documents/receipts.ts`) projects exactly the
  masked view's own column set and none of 0007:2231-2232's never-exposed columns; a
  foreign firm's persona reads zero rows, with a non-vacuity control; an adopted, unfiled
  intake reads as unassigned to its uploader and is attributed to no client.
- `unassigned-intake-reuse.test.mjs` — the firm leaf's read and the floor its nav row is
  set from. `clara.list_unassigned_documents` is SECURITY INVOKER, so its floor is
  whatever RLS admits: MEASURED, a viewer reads it, while `record_client_resolution`
  refuses a viewer CLR04 and admits a bookkeeper. Also pins the function's own
  `p_limit` clamp and that filing removes a document from the population. Since fix round
  1 it also pins what "ask once" actually buys (`p633.unassigned.second_attempt`): a
  repeat to the SAME client is refused CLR10 in the estate's own words and mints no
  second filing, while a second attribution to a DIFFERENT client is ACCEPTED and leaves
  two live filings — which 0123's classify gate then refuses as
  `document_processing_multi_client`, stopping that document's processing.
- `document-intake-capabilities.test.mjs` — the four tiers as an intake-surface read.
  Every canonical intake mime resolves to exactly one registry format, an unseeded pair
  yields no row (so the surface's unknown default is the only honest answer), and the
  catalogue carries no tenant column — which is why it is read once per mount and never
  polled. Fix round 1 adds the invariant the browser's `byFormat` join rests on: for
  EVERY format, `custody` and `byte_extraction` take exactly one level across all of that
  format's kinds, so publishing them from the format alone is a level and not a guess.
- `document-intake-noncoding.test.mjs` — H-53 re-measured on the intake route. A
  `consent_evidence` (and an `identity_document`) born through `finalize_document_intake`
  keeps custody and source authority and enters neither `list_uncoded_filings` nor
  `list_review_queue`, with a codeable sibling built the same way as the control.

`rig-docs-isolation-grants.test.mjs` carries the `p633.grants.nonregression` cells: the
four load-bearing reads keep their SELECT grant, no application role holds DML on any of
them, and `entry_evidence_links` stays FORCE-RLS'd and firm-scoped — the guarantee that
made a SECURITY DEFINER wrapper the wrong answer for the document→Work link. The
cross-firm cell SEEDS a real `late_attachment` link (the shape
`ck_entry_evidence_links_receipt` admits without a receipt or a Work) and asserts firm
A's own persona reads it BEFORE asserting the foreign firm's zero — fix round 1: it
previously logged the population count and asserted two zeroes over an empty table, which
would have passed with RLS removed.

## Batteries worth naming

`rig-docs-source-revision.test.mjs` (#646, frontier `document_source_revision$`) drives the human
source-revision doors on the real chain under the real role matrix: a revision APPENDS and leaves
the superseded extraction's regions byte-identical, a revision quoting a moved reading refuses
CLR19 and echoes the attempted value, the arithmetic belt measures the NEW numbers, the orphaned
classification door is narrow (zero live filings — a retired-then-re-filed document still refuses),
op-key replay returns the original receipt, a `'fact'` row names the `invoice_facts` reading it
superseded even after a kind change has repointed the document-wide pointer at a classification,
and NOTHING in the ticket reaches
`clara.accounting_work`, `clara.agent_tasks` or `clara.knowledge_records`. Its pre-integration gate
is `document-source-revision-preintegration-gate.mjs`; a focused run without that module FAILS
rather than skipping.
