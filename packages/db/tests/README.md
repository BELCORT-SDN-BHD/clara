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

`firm-portfolio-pack.test.mjs` and `compliance-watch-disposition.test.mjs` (#659, journey B1) are
TWO batteries behind ONE stem, ONE gate module (`firm-portfolio-pack-preintegration-gate.mjs`) and
ONE `rig-meta.mjs` cohort (`FIRM_PORTFOLIO_PACK_0231_COHORT`), because 0231 installs two doors in
one file: they are wholly present or wholly absent together. Each takes owner-level fixture DML
twice, labelled at the call site: it archives a client (the only door that archives one,
`clara.cancel_client_onboarding`, needs an open onboarding plan and an admin — a four-verb detour to
set one column the battery only reads) and it backdates an `operation_receipts` instant under
`session_replication_role = replica`, the same shape `client-work-pack.test.mjs` uses.

`firm-portfolio-pack.test.mjs` is also the one battery in this package that builds a FRESH FIRM PER
CELL rather than sharing a world. Its subject is a FIRM-WIDE read with no client argument, so a
shared firm would make every cell's row set depend on every cell that ran before it; each cell
therefore mints its own owner/bookkeeper/viewer and exactly the clients it means to count. The
cross-firm cell needs a second firm with a second member for the same reason
`compliance-watch-disposition.test.mjs` adds one to firm B — the approval door enforces
maker-checker distinctness, so a one-member firm cannot produce the foreign fixture the cell
contrasts against.

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

### The trade-invoice battery (#655)

`trade-invoice.test.mjs` (+ `trade-invoice-fixtures.mjs`) is the #638 three-file shape applied to
the lane that births AR/AP: it is frontier-gated on the `trade_invoices$` STEM, never on `0225`,
and its gate module is `trade-invoice-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_TRADE_INVOICES=1`), wired into [package.json](../package.json)'s `test`
script in MIGRATION order after `preview-invite-preintegration-gate.mjs`. A FOCUSED run does not
preload it and FAILS loudly below the migration; the cohort is `TRADE_INVOICES_0225_COHORT` in
[rig-meta.mjs](rig-meta.mjs), so the rig census stays wholly-present-or-wholly-absent.

Every assertion under test runs through a `humanQuery` persona or the real `clara_runtime`
credential; `rootQuery` appears only as a readback or as labelled fixture DML.

**Five cells measure the rig before they assert anything, and they are the reason the migration is
shaped the way it is.** `p655.rig.trigger_order` enumerates `pg_trigger` on
`clara.journal_entries`, finds the deferred constraint triggers that read `clara.open_items` at
commit, and proves `t_je_open_item_birth` sorts before every one of them — 0216's measurement
reproduced with THIS trigger's name in place, never assumed. `p655.rig.receipt_join` proves which
of the three subject-resolution paths is actually satisfiable when the deferred queue runs (both
the status-ledger handle and the TEXT-compared receipt join are; the migration implements the
first and names the second as the fallback). `p655.rig.coding_kind_untouched` proves this lane
leaves `journal_entries.coding_kind` NULL, which is what keeps the document-anchored shape belts
disarmed. `p655.rig.lines_validator_path` proves `clara._validate_entry_lines` is the only path
into `journal_lines` here, which is why the counterparty is stamped AFTER the insert.
`p655.rig.aging_floor` records `ar_aging`/`ap_aging`'s real grants and floors before any cell
reads an aging number.

**`p655.belts` records the finding that changed the migration.** A `coding_kind IS NULL` entry
classifies as `'adjustment'` (LADDER 5), so `clara._tf_subledger_entry_belt` raised
`subledger_entry_untied` against a `'bill'` item and `clara._tf_subledger_item_belt` hard-coded
`item_kind='bill'` ⟺ `coding_kind='supplier_bill'`. Both were measured RED before the belts were
recut, and `p655.classify.ladder_3t` pins that the classifier's answer is byte-identical for every
input that is not a trade invoice.

The rest of the battery: one commit yielding all four artefacts on both polarities
(`p655.post.bill_one_commit`, `.invoice_one_commit`), the control-leg refusal still standing for
every Work that is NOT a trade invoice (`p655.post.control_leg_still_refused` — the recut opened a
door, not a hole), the three due-date bases end to end (`p655.due.stated` / `.terms_fallback` /
`.absent`), the polarity matrix refusing a negative total, a cross-domain party and a credit-shaped
payload BY NAME and as typed CLR10s rather than bare 23514s (`p655.polarity.matrix`), replay and
its race (`p655.replay.one_receipt` asserts the second call writes NOTHING; `p655.replay.race`
races the SAME payload with itself and then a DIVERGENT pair -- two parties, two references, one
key -- and asserts that exactly one caller is answered, that the other leaves as
`intent_payload_conflict`, and that the answered caller's party, kind and due-date basis are the
ones the surviving row holds. That divergent arm is the cell that caught the door answering a
raced loser about somebody else's invoice), the residual it does NOT close
(`p655.duplicate.same_reference_is_NOT_probed` measures that one supplier bill number under two
intent keys lands twice and doubles the payable -- "duplicate" on this lane means a replayed
INTENT, and a same-document-number probe is nobody's yet), atomicity (`p655.atomic.no_partial`),
the authority floors with no existence oracle (`p655.authority.floors`) and the two ladder tokens
the first cut never drove (`p655.authority.cited_and_inactive`: a document that already backs a
posted entry, and an archived client), admission-time party
ambiguity carrying its candidates (`p655.party.resolution`), the control tie-out from zero
(`p655.tieout.control`), LADDER 1 unwinding a reversal unchanged (`p655.reversal.unwinds`), the
two-lane equivalence proof (`p655.parity.source_vs_direct` — a coding-lane bill and a Work-lane
trade invoice for the same facts move the same control account by the same signed cents with the
same due date -- on a fixture whose document date IS its posting date, so the parity claim is
about the accounting and not about which anchor won), the due-date anchor and the legacy lane's
disagreement with it (`p655.due.anchor_document_date` -- DECISIONS §6.2.0 R-A: this lane derives
`document_date + terms` = 2026-04-03 while the coding lane's 0040:6010-6015 splice still derives
`posting_date + terms` = 2026-04-30 for the same bill, and both numbers are asserted BY NAME so
neither side can drift silently; #665's cutover owns retiring the legacy anchor), the grant posture including the absent attestation (`p655.grants`), the three
re-derived catalog censuses (`p655.census.writers`), the append-only belts (`p655.appendonly`) and
the read's viewer floor (`p655.read.floor`).

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

## `bank-line-existing-booking.test.mjs` — #657 (migration 0226)

Eleven cells, all through `humanQuery` least-privileged personas except where a catalog fact or a
labelled fixture needs root. The centre is `p657.db.no-new-cash`: matching an already-approved
booking must leave `journal_entries`, `journal_lines`, `open_items`, `open_item_allocations` and
`list_bank_statements`' own `tie.gl_balance_cents` all unchanged, and write exactly one
`op_receipts` row. Nothing in the estate asserted that negative before — `x38.a` stops at group
ties and `snap()` serves only `x38.y` — which is why the same argument had to be re-made in every
review.

**`bank-no-new-cash.mjs` is a FIXTURE module, not a test.** It exports `snapshotNoNewCash`,
`assertNoNewCash` and `assertReceiptStatesNoNewCash` so #666 and #667, which land on this chassis
next, prove the same negative the same way rather than each writing a slightly different "nothing
was created".

The other ten: `one-receipt-under-retry` (a replayed key returns the BYTE-IDENTICAL enriched
receipt), `rematch-needs-a-new-key` (the other half of that fact, and the premise the FACE's key
renewal clause rests on: after an `unmatch_bank_match`, replaying the SAME key returns the DEAD
match's receipt and writes nothing, so only a RENEWED key re-decides), `capacity-race` (two sessions, two lines, ONE entry — blocking PROVEN behind a gate, in
`x38.g`'s shape, then a refusal naming `already_matched` with its `side`), `candidate-enrichment`,
`pack-parity` (the two marked candidate projections are identical), `matching-context`,
`exception-context`, `opkey-parse-free`, `digest-census` (exactly thirteen cores, all at #657's
post-image) and `acl`.

**Two measured constraints a later hand will otherwise re-discover.**
(1) `clara._agent_bank_receipt` derives `acting_actor` from `clara.wake_context()`, which returns
ZERO rows without a live wake secret — so a rig session CANNOT call that writer at all
(`null value in column "acting_actor"`). `p657.db.opkey-parse-free` therefore arranges both row
shapes as labelled fixture INSERTs and asserts the writer's own storing of the column from its
source; the writer is exercised for real by `packages/runtime/tests/g1-wake-bank-e2e.test.mjs`
under a REAL `bank_agent` credential.
(2) `_draft_entry_core` stamps `journal_lines.counterparty_id` only under a vendor BINDING and
only on a payable/receivable-class line, so a Dr bank / Cr revenue receipt — the #657 shape —
never carries one through the ordinary draft path (measured: zero of 48 journal_lines on a fresh
rig). The battery's `bankEntryWithCounterparty` stamps it on the DRAFT, where the line is still
mutable, and approves through the real door afterwards; it also re-reads `revision_token` after
that DML, because the fixture write moves it and the approve carries an optimistic-concurrency
check.

`bank-match-evidence-preintegration-gate.mjs` is the package-wide sweep's escape; a FOCUSED run
does not preload it and fails LOUDLY on a database without 0226, because a skip is not evidence.
### The depreciation-history battery (#651)

`depreciation-history.test.mjs` is frontier-gated on the `_depreciation_history$` stem (migration
0227) — never on a number — and shares `depreciation-history-fixtures.mjs`. Nineteen `p651.*`
cells: the change class (required, `policy`/`error` refused by name with **#680** and #679's lock
law in the `detail`, prior charges byte-identical after a revision, a first completion refused
through BOTH completion doors), the locked-period law (refused at the RUNNING door before anything
is drafted, the oracle skipping the closed period and reporting `skipped_closed`, and the
withdraw-and-reopen recovery leg no battery held before), the authority's resolved instruction
reference and its frozen window (including the floor's MEASURED cost — the parked agent catch-up
lane can no longer reach a pre-floor period — the write-once wall on both sign-time columns, and
the withdrawal of a NEVER-SIGNED authority, which 0227's own window CHECK would otherwise turn into
a raw 23514), the preview (exact agreement with the run that
follows it, and the proof it writes nothing), the OBO door (live-authority ladder, replay identity,
and the three writer variants' mechanics asserted identical in one assertion — C86.2's re-derived
pin), and four catalog censuses (the `_wdb_rerun_breach` consumer set, the `origin='scheduled_run'`
writer set, `_fa_run_period_core`'s caller set at FOUR, and the replay census).

Four things a later hand will trip over if they are not stated here.

**The fixture world is `p651_`, not `x41_`, and that prefix is load-bearing.** These cells
deliberately build broken books — an asset with no particulars, an asset under a disposal draft, a
closed fiscal year — and `x41.s4` sweeps every `x41_` client expecting a healthy one. A fixture
that named an `x41_` client would enrol this ticket's wreckage in a sibling battery's sweep.

**Four other batteries sign a depreciation authority, and 0227 changed that door's arity.**
`fa-authority-sign-compat.mjs` is the ONE place they all go through: it feature-detects the
four-argument door off `to_regprocedure`, so `x41-fa-fixtures.mjs`, `client-onboarding-identity`,
`f-a4-pr1c-rungs`, `x56-rest-j` and `packages/runtime/tests/reconcile-fa.test.mjs` all run at BOTH
frontiers. It also owns the two labelled fixture writes no audited verb can reach: an instruction
row for a client that is not yet ACTIVE, and an authority floor back-dated into a PAST month.

**Back-dating the floor is a fixture act, not a product one.** `authority_from` is written once at
signature and never moves, so every pre-existing arithmetic cell that charges a period earlier than
"this month" needs the floor moved by labelled owner DML. `x41-fa-world.mjs`'s `liveAuthority` does
exactly that, which is why the x41 arithmetic cells keep measuring arithmetic. MEASURED blast
radius before that one line: 69 of 123 x41 cells red.

**A fixture that turns a trigger off does it in ONE transaction.** `alter table … disable trigger`
is DDL: inside a transaction it takes ACCESS EXCLUSIVE and the guard is off for that transaction
alone, so a concurrent session blocks rather than writing past a disabled trigger and a killed
process rolls the disable back. Run as separate autocommitted statements — which is how
`fa-authority-sign-compat.mjs`'s two fixtures were first written — the window is open to EVERY
session on the rig, and `--test-concurrency=1` bounds that only within this package while the
estate runs real-DB cells from `packages/runtime` against the same database. `withTriggerOff` in
that module is the shape; migration 0227:338-342 is the same manoeuvre inside the runner's own
per-migration transaction.

`depreciation-history-preintegration-gate.mjs` is the package-wide sweep's escape
(`CLARA_ALLOW_MISSING_DEPRECIATION_HISTORY`); a FOCUSED run does not preload it and fails loudly on
a database below 0227, because a skip is not evidence.
## `opening-ledger-source.test.mjs` (#656, migration 0228)

Twelve cells over the opening lane's DOCUMENT half, which Wave B modelled completely and nothing
ever exercised end to end because no producer existed. The premise probe is NOT a
`to_regprocedure` check — 0228 installs no function — it is the republication itself: the registry
publishes `registry_version = 2`. Its gate module is
`opening-ledger-source-preintegration-gate.mjs` and the pairing is by the env-var STRING
`CLARA_ALLOW_MISSING_OPENING_LEDGER_SOURCE`, never by a shared file-name stem (at least seven of
the estate's forty gate modules do not transform their own stem). A FOCUSED run without the gate
fails loudly; a sweep with it loud-skips all twelve.

Every `opening_tb.line` region fixture is created through `clara.persist_document_extraction`
(#857's rule, adopted early). A raw INSERT would let a cell prove the database accepts evidence the
real producer could never have written — the writer's own chain of responsibility
(`_derive_opening_region_fact` → the monetary corroboration → `ck_document_regions_opening_fact_0017`)
is part of what is under test, not scaffolding around it.

Three cells record facts that are NOT what their names suggest, each measured on the rig:

- `p656.tie.unmapped_blocks` — on a DOCUMENT-sourced basis an unmapped target is structurally
  IMPOSSIBLE. `_assert_opening_target_fact` refuses unless the account matches the stored region
  exactly, and `fk_opening_tb_targets_account` refuses unless it exists in the chart. The nullable
  `account_code` that `get_opening_dryrun.unmapped_labels` reports belongs to the KEYED lane alone,
  so a surface reading an empty `unmapped_labels` on a document basis as "everything is mapped"
  would paint C-25's quiet pass all over again.
- `p656.tie.approve_rebinds` — the mutation is a SECOND PRODUCER RUN, not an edit.
  `clara.document_regions` is append-only, so nothing in this estate can change a region after the
  fact; what happens in production is that the document is read again, the authority trigger moves
  the pointer, and every target recorded against the older run is refused AT APPROVAL.
- `p656.period.closed_fy` — the wall that fires is `clara._tf_period_wall_lines()` on
  `clara.journal_lines`, at the DRAFT. `approve_opening_seed` carries no period guard of its own
  and never gets the chance to need one. That measurement is why 0228's conditional narrow recut
  was not written.

Three cells were corrected in the fix-round, each because a cell must assert what its name says:

- `p656.tie.obe_not_nil` (finding A2) once drafted ONE item against a three-line target set, so
  `_assert_opening_tie`'s DELTA arm fired first and the cell asserted `tie_mismatch` under a name
  promising `obe_not_nil` — its own negation. The fixture now records a target pair whose two
  printed figures do not sum and drafts an item for EACH, so every non-OBE account matches its
  target (`_opening_seed_deltas` excludes the OBE account by construction), the delta arm passes,
  the drafted entries' plug lands on opening-balance-equity, and the OBE arm fires with its own
  token. The residue is asserted cent-for-cent (`shareCr - cashDr`).
- `p656.tie.stale_extraction` and `p656.tie.approve_rebinds` (finding A7) pinned their refusal with
  a disjunction over two tokens, so neither recorded WHICH wall fired. MEASURED: a second producer
  run sets `superseded_by` on the first and `_assert_opening_extraction_ref` checks
  `status<>'done' or superseded_by is not null` BEFORE the authoritative-pointer comparison, so a
  re-read always refuses `extraction_not_accepted`. `stale_extraction_version` is the OTHER wall —
  a run that is itself current while `documents.authoritative_extraction_id` names another.
- `produceTbRegions` is a MIRROR of the runtime producer's element shape, not a call into it
  (finding A8): packages/db carries no dependency on packages/runtime. The mirror is pinned next
  door — `packages/runtime/tests/opening-tb-produce.test.mjs`'s last cell states the exact key set
  and value grammar, so a `toRegion` drift reds there instead of leaving this whole family green
  while production breaks — and the World leg drives the real producer's bytes into the real
  writer end to end.
### The intake-batch battery (#636)

`intake-batch.test.mjs` is frontier-gated on the `intake_batches$` stem, never on a migration
number, and `intake-batches-preintegration-gate.mjs` is the package-wide sweep's escape; a FOCUSED
run does not preload it and fails loudly on a database without the lane, because a skip is not
evidence (measured: 27/27 fail with the lane absent, 27/27 pass with 0229 applied).

Its 0229 cohort in `rig-meta.mjs` (`INTAKE_BATCHES_0229_COHORT`) counts **SIX** granted names, not
five. The sixth, `sweep_intake_batch_cancellations`, exists because `clara_runtime` holds neither a
grant nor a policy on `clara.operation_receipts` (0178:1619-1630 asserts both) and none on the
batch parent, so the reconciler belt cannot otherwise find the live children of a `cancelling`
parent. Orchestrator ruling, refresh-wave-2026-09-18 DECISIONS §6.1.

The battery joins TWO existing worlds rather than building a third: `work-journal-fixtures.mjs`
supplies the Work half (admission, runs, the wake posting verb, the committed receipt) and
`rig-docs-fixtures.mjs` supplies the intake half. `seedIntake` is LABELLED fixture DML — the estate
has no single door that drives bytes from `uploading` to `verified` without a real upload — but
`clara.finalize_document_intake` (the REAL door) is what creates the document, which is what the
custody trigger keys on, and `clara.file_document` is what makes a Work's `source_refs` admissible.

Three things a later hand will trip over. `clara.document_ingest_reservations.created_at` is
IMMUTABLE (`_tf_reservation_update` raises CLR08), so `p636.batch.capacity_window_utc` pins the
window by evaluating the reservation body's OWN predicate over crafted instants rather than by
back-dating a row. `clara.firm_memberships.status` admits only `active` / `removed`, so the
mid-batch revocation cell flips to `removed`. And a child whose run is merely STOPPING is still
live: `p636.batch.sweep_settles` proves the sweep does NOT settle its parent until the engine
settles that run, which is `appendix-C-journeys.md:82`'s "do not show terminal cancellation early"
as an executable cell.
## `knowledge-retrieval.test.mjs` (#658, migration 0230)

28 cells over the bounded core-first read, the recorded read-set, the drift doors and
`DECISIONS.md:83`'s seventh door. Every assertion under test runs through
`humanQuery`/`roleQuery` at the least privilege that should succeed; `rootQuery` appears only
to mint a world or to read a catalog back for a census.

- `p658.retrieve.*` — core-first tiering with an exact `hidden_count`, an out-of-effect row
  MARKED and returned rather than dropped, the runtime lane's tenancy refusals with no
  existence oracle, the **#783** negative-grant cell, the two-persona `shadow_parity` cell that
  proves "one register, one pack, one answer" without a shared grant, the five legacy-carried
  keys riding in as core with `authoritative:true`, the `1..200` bound and the unknown-key
  refusal, the C7 cell that holds `p_purpose` to RECORDED-not-filtered, the FINITE-`as_of` wall
  (`infinity` is a real date value the sole writer would have stamped permanently), and
  `envelope_is_atomic`, which pins the envelope's key set and the ABSENCE of an exception arm in
  the catalogued body -- the door either answers with every tier or raises, so no per-tier
  readability signal exists for a v5 caller to design against.
- `p658.inspect.*` — the two runtime twins return source metadata and **no document bytes**.
- `p658.reads.*` — no FK to `clara.accounting_work` (with the positive join proved to carry the
  binding instead), replay-idempotence on `(work_id, run_id, seq)`, UPDATE/DELETE refused even
  as `clara_fn_owner`, the four-word status vocabulary with `unavailable` refused, the closed
  `tiers` vocabulary of non-negative integers (walled by the COLUMN, not only by the writer), and
  the replay cell: an identical replay is named as one, and a replay carrying DIFFERENT facts says
  so through `payload_match` instead of being answered with a silent ok.
- `p658.record_reads.*` — the seventh door: it lists, it floors at viewer and answers a foreign
  record and a random uuid identically, it EXCLUDES a client whose own live record shadows a
  firm-scope key, it caps at 100 with an exact `hidden_count`, and it carries no record value.
  `bounded` also pins the key predicate's WRITTEN FORM (containment, not scalar `= any`) and
  explains the containment query with `enable_seqscan` off, because only the containment form can
  reach the GIN index on `keys` — measured `idx_scan = 0` before the fix, i.e. an index that was
  pure write amplification on an append-only relation.
- `p658.drift.*` -- relevance from the read-set, `relevant: null` on the trace fallback, the two
  lanes' floors, cross-firm isolation, and the SHADOW cell: a firm default this client never read,
  because its own record shadows it, is not relevant -- asserted in BOTH directions, so the fix
  cannot over-correct into silencing a client that really was reading the firm default.
- `p658.census.no_recut` — the eight pinned bodies byte-identical, `get_context_pack` at exactly
  one overload, one `pg_proc` row per installed name, and the CORE tier small and enumerable.

Fixtures: `knowledge-retrieval-fixtures.mjs`. Gate: `knowledge-retrieval-preintegration-gate.mjs`
(preloaded, the battery SKIPS loudly below 0230; a FOCUSED run without it FAILS loudly — both
arms were measured by renaming the cohort's objects on the rig and restoring them).
## #660 — `client-financial-pack.test.mjs` (0232)

Frontier-gated on the `client_financial_pack$` stem. Its escape is
`client-financial-pack-preintegration-gate.mjs`, registered in `packages/db/package.json`'s `"test"`
chain at its MIGRATION-order position (after `preview-invite-preintegration-gate.mjs`, 0224). A
FOCUSED run does not preload it and FAILS loudly on a database without the lane, because a skip is
not evidence — proven both ways on a rig: dropped-lane focused run without the module errors with
its own message; with the module preloaded, 29 cells skip and none fail.

`rig-meta.mjs` carries `CLIENT_FINANCIAL_PACK_0232_COHORT` at the three sites the 0214 cohort uses.
It is bimodal (asserted only once any of its names is live) because the `db-slice-frontiers` matrix
runs this package against earlier frontiers. Cohorts are FUNCTION-name lists — `liveNames` is built
from `pg_proc` rows — so 0232's two new RELATIONS are asserted by the migration's own tail and by
this battery, never by the cohort.

SEVEN CELLS WERE ADDED IN THE FIX ROUND, each for a defect a review found and each red before its
fix: `historic_comparison_full_prior_month` (a complete month compares against the WHOLE prior
month), the `pre_coverage_point` extension (an unavailable month-end produces no comparison amount),
the `composition_bounded` extension (`profit.composition` lives in the profit group, where the
browser's parser reads it), `composition_account_cap_disclosed` (51 accounts; the 50-row cap reports
itself), `cash_set_published_after_books_start` (one revision plus a backdated import is not a
version change), `unmarked_history_series_disclosed` (the disclosure covers all six drawn months)
and the `cash_set_members_sealed` extension (sealed against UPDATE and DELETE, not only INSERT).

FIX ROUND 2 ADDED ONE MORE, `p660.set.publish_race_loser_code` (recheck NF-1), and it is the only
cell in this battery that needs TWO REAL BACKENDS: `select … for update` is the mechanism under
test and a lock is only a lock when a second transaction actually waits on it. The local
`twoSessions` / `asHumanSession` / `waitBlockedByOrThrow` helpers in
`client-financial-pack-fixtures.mjs` are copies of `binding-proposal-pr-1-helpers.mjs:22-67` and
`checkout-convergence-fixtures.mjs:364-384` — the house idiom is a LOCAL copy per lane, and the
block is proved from `pg_blocking_pids` rather than slept through. The cell was red first for the
exact shape the recheck measured: the loser was refused CLR10 `first_version_after_books_start`
instead of CLR11 `cash_set_version_raced`.

FOUR FIXTURE SHORTCUTS, EACH LABELLED in `client-financial-pack-fixtures.mjs`'s header, because
each builds a condition no live writer can produce:

- `coa_accounts.is_bank_account` — minted only by `add_bank_account` / `remap_bank_account_coa`
  (0121:4721-4722), both of which want a whole bank-account registration.
- `coa_accounts.is_active = false` — there is no retire door (the same gap
  `work-journal-fixtures.mjs:196-201` states for its own retired account).
- `journal_entries.close_receipt_id` on an entry whose `closing_transfer` is still false — the
  exact shape a PRE-0120 close left behind, which `finalize_close` can no longer produce. Runs
  under `session_replication_role = replica` because `clara.journal_entries` is append-only by
  trigger, and every `close_receipts` column is stated BY NAME rather than derived from the
  catalogue: a receipt row assembled by guessing from column names is a fixture that can silently
  mean something else after a schema change.
- withdrawing a plan's `first_year_zero_opening` answer, so the opening is GENUINELY uncaptured.
  The estate's own precedence (`components/registers/opening-position-gate.tsx:85, :95-97`) ranks
  that row ABOVE `carry_down_deferred`, and the rig's legacy-activation bridge plants both, so a
  client carrying both has a KNOWN opening. This is the only way to build the shape
  `opening_carry_down_deferred` is actually about — and the red cell that forced it found a real
  defect in the door, which 0232 now fixes by respecting that same precedence.
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


## `legal-enforcement-mode.test.mjs` — #1008 / migration 0234 (cell prefix `p1008.db.`)

26 cells. The platform's legal enforcement mode, the derived basis under each of its two values,
the truthfulness of the evidence the mint and the restore write, the operator-firm-owner door that
flips it, and — added in fix round 1 — whose acceptance may found the basis at all and what two
concurrent first dispatches mint.

**EVERY BEHAVIOURAL CELL ASSERTS BOTH MODES, and that is the battery's own vacuity control.** A
body that ignored the mode could not pass `p1008.db.prompt_belcort` (UNKNOWN under `enforce`,
`granted` under `prompt`, same firm, same client, same cell) or
`p1008.db.prompt_survives_publication` (a newer published version withdraws under `enforce` and
does not under `prompt`). The cells that are about something the mode does NOT change —
`revoke_sticky`, `deactivate_reactivate`, `prompt_inactive_client` — loop over both values and
assert the same outcome in each.

**THE MODE IS ARRANGED AT ROOT, AND EXERCISED THROUGH THE DOOR.** `clara.legal_enforcement` carries
FORCE RLS with a single `clara_fn_owner` policy and no application-role privilege, and its only
human writer is floored on the OPERATOR FIRM's owner — of which the estate admits exactly one at a
time (`uq_firms_one_operator`). Driving every cell's arrangement through that door would serialise
the battery behind a global lock other files also take, so `forceMode()` is a LABELLED root UPDATE
(the same disposition `publishNextVersion` carries for `clara.legal_documents`) and the door itself
is exercised by the four cells that are ABOUT the door: `mode_door_floor`, `mode_door_vocabulary`,
`mode_door_receipt` and `mode_doors_posture`. Nothing under test is arranged by root DML.

**`work-egress-authority.test.mjs`'s ONE enforcement cell SETS the mode rather than weakening its
assertion.** `w631.prep.superseded` is about the `enforce` rule, and 0234's landing value is
`prompt`; it now wraps its body in `forceLegalEnforcementMode("enforce")` and puts the previous
value back in a `finally`. That helper is frontier-tolerant: below 0234 the relation does not exist
and the estate already behaves as `enforce`, so it is a no-op.

**THE PROMPT ARM IS PINNED FROM THE HOSTILE SIDE TOO** (fix round 1, review finding A4).
`prompt_wrong_person` seeds REAL acceptances of both published kinds on people who are not this
firm's active owner — a non-owner MEMBER of the firm, and another firm's owner — and requires the
same indistinguishable `{"live": false}` in both modes. `prompt_owner_leaves` demotes the accepting
owner through `set_member_role`, puts the role back, then removes the membership through
`remove_member`, and requires the basis to follow. MEASURED: with `m.status='active' and
m.role='owner'` deleted from the prompt arm's owner selection on the rig, the 23 cells that
preceded these two ALL stayed green and only these two red — which is the gap they close.

**AND THE CONCURRENT FIRST DISPATCH IS A FORCED WINDOW, NOT A HOPED-FOR ONE** (finding A3).
`prompt_first_dispatch_race` goes through `racedFirstDispatch`, which mints on session A inside an
open transaction, starts session B, OBSERVES B waiting on a lock in `pg_stat_activity` from a third
session, and only then lets A commit. The observation is asserted (`blocked`), because the obvious
spelling is worthless: MEASURED on this rig, a bare `Promise.all` of two `prepareEgressDispatch`
calls does NOT overlap — the first commits before the second reads its guard — and that pair passes
even against a `prepare_egress_dispatch` whose `on conflict do nothing` has been deleted. The forced
version reds with `23505` against that same mutation and is green against the shipped body.

**The battery leaves the estate as the MIGRATION leaves it** (`prompt`) in its `after` hook, so a
later file in the same sweep does not inherit this one's arrangement.

`legal-enforcement-mode-preintegration-gate.mjs` is the package-wide sweep's escape; a FOCUSED run
does not preload it and fails loudly on a database without 0234, because a skip is not evidence.

## `operator-support.test.mjs` os.15 — #844

os.14 (#774) pins the arm-1 lateral's SECOND ordering key (a money-carrying intent status beats a
bare `opened_at desc`), but every world it or any other cell in the file builds gives a
registration at most one intent pair with distinct `opened_at` values — so migration 0188's THIRD
key (`i.id desc`) was provable only by reading the migration's own text. os.15 builds the one
world in which it is observable at all: three checkout intents on one registration, two forced to
the exact same `opened_at` instant, none of the three carrying the money.

**Minting three intents without ever landing one in `session_created` or `processing`.**
`clara.open_checkout_intent` (0186 §G) reuses only an unstamped, still-`open` intent, and
separately refuses CLR09 `checkout_in_progress` outright while ANY intent sits in
`session_created` or `processing` — so os.14's own "stamp then pay" idiom would BLOCK the next
open rather than merely fail to be reused. os.15 instead force-transitions each intended
predecessor straight `open -> cancelled` (the transition table's first lawful row, no session
stamp needed) between opens.

**`forceOpenedAt` (local to this file)** disables and re-arms
`t_checkout_intents_session_stamp` around a bare `opened_at` UPDATE — the one identity column the
0186 trigger's FIRST check otherwise freezes unconditionally — mirroring
`checkout-convergence-fixtures.mjs`'s own `backdateStatus` idiom for `status_at`.

**The winner is read from `get_operator_support_case`, never inferred from status content.**
`list_operator_support_queue` deliberately projects only its twenty declared columns and drops
`extra` (0188 §1's own comment); the tied intent's id is exposed only through
`get_operator_support_case`'s merged `extra.intent_id`. The queue is still asserted for arm
membership and the reported status/reason/timestamp, corroborated against the intent read as
root.

**Acceptance #3 ("the cell fails if the id key is removed") is checked by reversing the key's
direction, not omitting it.** Without any id clause Postgres does not promise which of two
`opened_at`-tied rows a bare `LIMIT 1` returns, so that comparison would prove nothing
reproducible. os.15 runs a companion `SELECT` — the identical predicate from 0188's arm-1 lateral,
never the deployed function or the migration body — with `i.id desc` reversed to `i.id asc`, and
reads that it deterministically names the OTHER (loser) intent; a second companion run with the
shipped direction is asserted to agree with the door, confirming the companion query is faithful.

`EXPECTED_CELLS` (this file's own `os.VACUITY CONTROL`) is 19, one more than before this ticket.

## `reset-gate-routing.test.mjs` — #845

Every `reset()`-gated upgrade-drill suite (checkout-convergence, hrd-a/hrd-b, rig-docs,
rig-events, rig-runtime, s6, wave-a, wave-b, x37/x40/x41 and the x42 split kit — 13 files) now
obtains the destructive `reset` from `../scripts/reset.mjs` and calls it as
`guardedReset(reset, options)`, the same `rig-reset-guard.mjs` wrapper T19 in
`rig-isolation.test.mjs` has used since #773. Before this ticket only T19 was wrapped; the shared
gate in `lib/guard.mjs` admits any loopback host regardless of database name, so any of those 13
files could still drop a named, in-use rig database under `CLARA_RIG_ALLOW_RESET=1` +
`CLARA_ALLOW_DESTRUCTIVE=1`.

`reset-gate-routing.test.mjs` does not hand-list the files it checks (beyond one cross-check
constant): it WALKS `packages/db/tests` for every module whose source contains an
`import("<path>/scripts/reset.mjs")` call, asserts that set is exactly the audited 14 (T19's own
file plus the 13 this ticket fixed), then asserts none of them has a bare `await reset(` call site
left, and that each imports `guardedReset` at least as many times as it imports the raw `reset`. A
file added later that imports the destructive `reset` unwrapped is caught by this suite without
anyone maintaining a list. One behavioural cell imports the ACTUAL `scripts/reset.mjs` export —
the identical module object every one of the 14 files resolves — wraps it in a non-delegating spy,
and proves `guardedReset` refuses a non-disposable name (`clara_631`) before that spy is ever
entered; because the structural cells already show every drill funnels through this same
`guardedReset`, that one proof generalises to all 14 call sites.

**This suite never sets `CLARA_RIG_ALLOW_RESET`.** The 14 drills' own destructive paths are
CI's job, one file at a time, on an isolated database (see each file's own header for its
`PGDATABASE=... CLARA_RIG_ALLOW_RESET=1` invocation). What this suite proves locally, safely, and
on a shared rig is the ROUTING: the name check runs before any of those paths could reach a real
`reset()`.

## `fixed-asset-acquisition.test.mjs` `p639.birth.opening_excluded` / `p639.birth.opening_admitted` — #884

`p639.birth.exclusions`'s own comment used to name the wrong arm and the wrong code for the
fixed-asset K-family opening-balance exclusion: it said the arm was proven only by a `prosrc`
string search because "no opening-seed fixture exists anywhere in packages/db/tests", and it
implied the birth trigger (`clara._tf_fa_acquisition_birth`) itself raised the refusal. Both were
wrong. A fixture already existed — `kSeededFaClient` (`x41-fa-world.mjs`), a thin wrapper over the
wave-b opening-seed doors (`wb.onboardingClient`, `wb.createOpeningSeed`, `wb.seedFixedAsset`,
`wb.draftOpeningItem`, `wb.approveOpeningSeed`) that `x41.b2`'s door-(e) sub-case, K8/K9
(`wave-b/wb-k-supersede-fa.test.mjs`) and several depreciation batteries already reuse — and the
refusal for a gl-balance leg on an ENROLLED fixed-asset account is raised by the BELT
(`clara._tf_fa_movement_belt`, migration 0041's arm (e)), SQLSTATE CLR40, reason
`fa_k_gl_balance_on_enrolled`, not the birth trigger and not CLR38.

`p639.birth.opening_excluded` builds a fresh onboarding client, explicitly ENROLS COST/ACCUM/EXPENSE
(`upsert_fa_account_profile` is a deliberate act, never automatic — the belt only sees an account
as enrolled once this door has run for it), drafts a plain `gl_balance` opening item naming the
enrolled COST account directly (never itemised as `item_kind='fixed_asset'`) plus a second,
ordinary item on SHARE so the set's net OBE ties to zero ahead of the belt, and asserts the
approval refuses CLR40 `fa_k_gl_balance_on_enrolled` naming the account code, with zero
`clara.fixed_assets` rows and both entries still `draft` — the belt is a DEFERRED constraint
trigger, so its exception unwinds the WHOLE approval, not just the register write.

`p639.birth.opening_admitted` drives `kSeededFaClient` and asserts EXACTLY ONE `clara.fixed_assets`
row ties to the opening entry (`acquisition_entry_id`), and it is the SAME id `seed_fixed_asset`'s
own receipt named — the behavioural proof that `_tf_fa_acquisition_birth`'s
`if new.is_opening_balance then return null; end if;` guard actually prevented a second birth,
rather than a `prosrc` string match proving only that the guard's TEXT exists.
