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

A focused run of one frontier-gated battery does **not** preload those gates, which is the point:
`tests/accrual-adjustments.test.mjs` (#652) fails loudly on a database without migration 0222
rather than skipping in silence, while the package-wide sweep's
`tests/accrual-adjustments-preintegration-gate.mjs` turns that same absence into a counted skip.
Run it focused with the 29 `--import ./tests/*-preintegration-gate.mjs` flags from
[package.json](../package.json)'s `test` script:

```sh
node --test --test-concurrency=1 $GATES tests/accrual-adjustments.test.mjs
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

## Named suite families

`p4t1-*` (`p4t1-invite`, `p4t1-identity`, `p4t1-reads`, `p4t1-add-member-regression`) drive the
invitation and identity doors — `invite_member`, `accept_invite`, `revoke_invite`,
`claim_identity` — through `p4t1-fixtures.mjs`, whose `asHumanEmail` sets a real
`request.jwt.claims` blob carrying **both** `sub` and `email`, because those doors read the address
from the claim and never from an argument.

`mdrw-*` (`mdrw-rank-walls`) drive the member doors' rank walls: the target-rank wall, the self-act
refusal, the authz-before-lifecycle ordering, the replay contract and a two-session lock race.

`preview-invite.test.mjs` drives `clara.preview_invite` (0224): the recipient's own read, the
byte-identical no-oracle refusal, the three non-pending effective statuses, the grant posture, and
the six non-regression `prosrc` pins that prove 0224 recut nothing. Its gate is
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
`counterparty-identity-preintegration-gate.mjs` (migration `0215`, #647) is the current example.

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

`firm-setup.test.mjs` (#648, journey A5) needs the 0218 cohort — `clara.firm_setup_keys`, the four
firm setup doors, `clara.get_firm_setup()` and `uq_onboarding_plans_one_open_firm`. A focused run
against a chain below that frontier FAILS by name; the package run preloads
`firm-setup-preintegration-gate.mjs`, which turns the same absence into a loud skip. Its world is
planted through the root connection because the subject is the setup doors rather than firm
creation, but every assertion under test runs through a least-privileged persona (`humanQuery`) —
the one deliberate root write is the `ck_onboarding_plan_items_answer` mechanism probe in
`p648.defer.reason`, whose subject is the CHECK itself and which no door owns. Two of its cells exist to pin what the WEB surface is allowed to assume about the doors rather than to test a new body: `p648.answer.correct` (answering again is the correction path, and a live firm default is corrected on the knowledge register instead) and `p648.opkey.attempt` (one op key names one request, so an op key derived from the answer VALUE can never be re-sent).

## Firm knowledge defaults (#654, `0220_firm_knowledge_defaults.sql`)

`knowledge-firm-defaults.test.mjs` is the firm-default half of the governed Knowledge lane, above
`knowledge-records.test.mjs` (#644, `0192`). Twenty-one cells, all through `humanQuery` at the least
privilege that should succeed: the eligibility wall (only a catalogued firm-defaultable key becomes
a firm default), the cross-client evidence wall in BOTH directions and on BOTH client-bearing pins
(a firm-scope record may not pin a document with any live client filing, at N=1 and N>1, nor any
`accounting_work` at all; and a document a live firm rule cites may no longer be FILED to a client
afterwards, while a correction or withdrawal carrying the predecessor's pins stays admissible so a
contaminated rule can always be retracted), the same wall under CONCURRENCY (the capture and the
filing staged as two overlapping transactions in both arrival orders, and with the filing made both
through `clara.file_document` and as a raw table write, so the serialisation is shown to come from
the wall's own advisory lock rather than from the filing door's row lock), the client exception
surviving a later firm default in
both the register and the runtime pack, the promotion floor and what the act records, revoked
membership on all three knowledge lanes, the trust wall at the firm boundary, the two new reads,
the promotion as an operation (op_key replay is one receipt, a reused key with different arguments
is refused by name, two admins racing behind the `uq_knowledge_live` barrier leave exactly one live
rule), and the negative census proving no function outside the knowledge cohort reads
`clara.knowledge_records`.

Its frontier gate is `knowledge-firm-defaults-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_KNOWLEDGE_FIRM_0220`), wired into the package `test` script. A package-wide run
against a chain below `0220` SKIPS the battery loudly; a focused run (no gate preloaded) FAILS. A
skip is not evidence. The shared world is `knowledge-fixtures.mjs` (#644's firm, four ranks, two
clients) plus `knowledge-firm-fixtures.mjs` (documents with and without live client filings, a live
Work to cite, membership deactivation, a session-local `session_replication_role = 'replica'` filing
that manufactures the pre-0220 contaminated state the retraction hatch exists for, and the runtime
form of 0220's own violator census); the race cell additionally uses `rig-fixtures.mjs`'
`freshResolution` so the filing half can run through the real `clara.file_document` door, which
refuses a document with no client attribution.

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

## `client-onboarding-identity.test.mjs` (0219, #649)

Thirteen cells over the two 0219 doors, every assertion under test issued through `humanQuery` as a
real per-role session under real RLS. `rootQuery` appears only where the subject IS the catalog
(the `has_function_privilege` census), where a fixture is being planted, or where the ADVERSARY in a
concurrency cell performs an acquisition no application role may issue directly (no app-role DML, so
a human session cannot take a row lock or an advisory rung at all).

Frontier-gated on the live catalog through
`client-onboarding-identity-preintegration-gate.mjs`, which the package `test` script preloads: a
package-wide run against a chain below 0219 SKIPS loudly, a focused run FAILS. A **partial** cohort
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

## Batteries with their own frontier gate

Each of these is keyed on a migration's stable STEM in `clara.schema_migrations` (never a number)
and skips only when the package-wide sweep preloads its `*-preintegration-gate.mjs`; a focused run
against a chain below the frontier FAILS, because a skip is not evidence.

- `staff-expense-claim.test.mjs` (+ `staff-expense-claim-fixtures.mjs`) — #638, stem
  `staff_expense_claims$` (migration 0221). Twenty-four cells over the claim lane: the Work-lane
  posting of a claim (claim row born at admission, one approved entry, one committed receipt, one
  `posted` status-ledger row and one `clara.op_receipts` row under the same `logical_op_id`), all
  THREE settlements posted through the real door — reimbursement, advance application and
  `already_settled` (which is not "no journal": the expense debits land against the stated payment
  account, and a non-asset payment leg is refused by name) — the
  proof that #638 recuts nothing shared (both purpose CHECK texts and six pinned bodies
  byte-identical), the CLR40 advance-DEBIT wall this ticket deliberately leaves standing, the birth
  trigger's firing position before `t_je_adv_movement_belt`, the advance-application arm with its
  over-application refusal and its two-session race, auto-enrolment of a new claimant against the
  admin floor that still refuses the same bookkeeper directly, per-item continuation, the whole
  typed refusal vocabulary (including CLR19 at ADMISSION for a sealed fiscal year, so no register
  row is stranded on a claim that can never post), PRD:114's no-second-approval posture, 0042 tail
  20(a)/(b), the correction chain — its two-session race, whose loser is a typed
  `correction_target_already_corrected` rather than a raw 23505, and its document half, where
  `t_entry_evidence_release` frees the receipt so the correcting claim may cite it —
  `get_work_claim_origin`, the three reads, RLS posture and replay. Gate module:
  `staff-expense-claim-preintegration-gate.mjs` (`CLARA_ALLOW_MISSING_STAFF_EXPENSE_CLAIMS=1`).

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

A THIRD thing, added in the fix round: the ineligible-asset cells post to the estate's OWN
receivable CONTROL account, `374-C56` (`account_class = 'receivable'`, measured on the rig), never
to a hand-made "trade receivables" code — a minted account carries a NULL `account_class` and is
therefore not a control account by `clara._adj_line_eligibility_breach`'s own rule, so a fixture
that built its own code would measure a different estate. Posting to a control account needs a
counterparty (CLR23), which `ineligibleAssetEntry` births at approve the x56/x37 way.

`prepayment-0223-preintegration-gate.mjs` is the package-wide sweep's escape; a FOCUSED run does
not preload it and fails loudly on a database without the lane, because a skip is not evidence.

## `firm-commercial-settings.test.mjs` — #635 / migration 0233 (cell prefix `p635.db.`)

24 cells, every assertion through a `humanQuery` persona under a real least-privileged role.
`rootQuery` appears only for LABELLED fixture arrangement (`firm-commercial-settings-fixtures.mjs`)
and for reading catalog facts a masked door deliberately never returns — ACLs, `prosrc`, table
grants.

`buildWorld()` HAS NO ADMIN PERSONA, so the battery mints its own firms through
`createFirm`/`addMember` rather than raw DML: a fresh firm per cell, because `legal_acceptances` is
keyed on the PERSON and `legal_documents` is GLOBAL, so two cells sharing a firm would each be
reading the other's arrangement.

**THE SHELF IS NOT RESTORED, AND THAT IS THE HOUSE PRECEDENT.** `p635.db.legal_standing_new_version`
publishes a successor version, and 0185 makes that irreversible in both directions:
`t_legal_documents_append_only` refuses every DELETE and `_tf_legal_documents_transition`
(0185:299-302) allows only `draft→published` and `published→superseded`, so a superseded row cannot
be put back. `checkout-gate-c1.test.mjs:393` and `checkout-gate-c3.test.mjs:266` already
supersede-and-publish the same way and leave the successor standing — which is why every battery
here reads the CURRENT published version out of the catalog instead of assuming 0187's v1. The
pre-run shelf is RECORDED (`readLegalBaseline`) for the report rather than for a restore.

**The platform usage bucket is estate-global by construction** (a `scope='platform'` row carries no
firm at all, 0110:355-358), so `p635.db.usage_buckets_separate` asserts the FIRM bucket's absolute
count and only the PRESENCE of the platform one — an absolute count there would couple the cell to
whatever else ran on the cluster.

`firm-commercial-settings-preintegration-gate.mjs` is the package-wide sweep's escape; a FOCUSED run
does not preload it and fails loudly on a database without 0233, because a skip is not evidence.

