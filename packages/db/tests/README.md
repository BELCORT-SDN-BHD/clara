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
merely an empty schema. Do not run the suite against the production project. A from-scratch chain
re-applied into a fresh database on a cluster that already ran it once reds migration 0154's role
census — see [../README.md#from-scratch-reapply-on-a-reused-cluster-867](../README.md#from-scratch-reapply-on-a-reused-cluster-867).

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
unset and must count zero skips. The SAME file also drives #872's fifth, read-time-only effective
status, `issuer_lapsed` (migration 0269): a demoted or removed issuer makes a still-pending invite
read `issuer_lapsed` on BOTH `clara.preview_invite` and `clara.firm_invites_visible` (one shared
CASE expression, so the two cannot disagree), reversibly, with `clara.accept_invite`'s own
issuer-rank wall left unchanged — an `issuer_lapsed` invite still accepts whenever the invited
role does not outrank the issuer's current rank. Its OWN gate,
`invite-issuer-lapsed-preintegration-gate.mjs`, is detected off a `clara.schema_migrations` row
matching `'^0269_'` rather than a function's existence, because 0269 recuts two EXISTING bodies
and adds no new catalog object; a focused run leaves `CLARA_ALLOW_MISSING_ISSUER_LAPSED` unset and
must also count zero skips.

`subledger-hook-caller-roster.test.mjs` reads `clara._subledger_on_approve`'s catalog comment
(0236, #868): all six live callers named with the migration each arrived in, the historical
four-name pin (0037) stated as stale, and the AC3 non-regression pins (`prosrc` sha, owner,
`SECURITY DEFINER` flag, grant, trigger reachability) that prove 0236 changed nothing but the
comment. Its gate is `subledger-hook-caller-roster-preintegration-gate.mjs`; a focused run leaves
`CLARA_ALLOW_MISSING_SUBLEDGER_HOOK_ROSTER` unset and must count zero skips.

`journal-basis-zero-total-unreachable.test.mjs` calls `clara._assert_journal_basis` directly
(0237, #906): its catalog comment names the `nonzero_total` arm unreachable and names both
guarding arms (`at_least_two`, `exactly_one_side`), the AC2 non-regression pins (`prosrc` sha,
owner, `SECURITY DEFINER` flag, owner-only ACL) prove 0237 changed nothing but the comment, and two
direct calls prove an all-zero basis lands on `exactly_one_side` while an all-credit
(zero-debit-total) basis lands on `balanced` — never on `nonzero_total` either way. Its gate is
`journal-basis-zero-total-unreachable-preintegration-gate.mjs`; a focused run leaves
`CLARA_ALLOW_MISSING_JOURNAL_BASIS_ZERO_TOTAL_ARM` unset and must count zero skips.

`correction-client-rung-order.test.mjs` drives `clara.approve_wrong_client_correction` under forced
two- and three-session schedules (0238, #914): an adversary in the rung-first order every sibling
door uses no longer deadlocks against a concurrent correction (the 40P01 SQLSTATE is the oracle,
and the door is proven blocked on the rung with `pg_blocking_pids` first, so the schedule really
interleaved); a catalogue census over every `clara` body proves no door is left that takes a
`clara.clients` row before the client rung `203005004`; and the source client is still serialised
against wiki publication in both directions, measured on a SECOND document filed to the same
client so the only shared object is that client, with the blocked side's own `pg_locks` read to
say which lock it is queued behind. Its gate is
`correction-client-rung-order-preintegration-gate.mjs`; a focused run leaves
`CLARA_ALLOW_MISSING_CORRECTION_CLIENT_RUNG_ORDER` unset and must count zero skips — and against a
pre-0238 chain it fails on the deadlock, which is the evidence.

`opening-balance-work.test.mjs` drives both opening approval doors through the wave-B fixture
(0239, #984) and asserts what the approval now leaves behind: exactly one `clara.accounting_work`
row and one `clara.operation_receipts` row of the new `opening_balance` purpose per approved batch,
with no `clara.agent_tasks` row for the client and none pointing at the Work, `task_id` null on the
receipt, `effects` naming the seed and NOT an entry, and `clara.opening_seed_approvals` unchanged;
a correction batch mints a SECOND Work and leaves the seed's byte-for-byte. Its counts are
client-scoped so an estate sweep cannot move them, and the same predicate is what sees the Work,
so the scoping is not vacuous. It also carries the catalogue census of the four places the columns
close the purpose vocabulary, the two admission cores (only the sibling learned the value) and
`clara._record_journal_entry_core`'s untouched three-value lookup — which is AC5's own wording for
how the posting core is proven unchanged. Its gate is
`opening-balance-work-preintegration-gate.mjs`; a focused run leaves
`CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK` unset and must count zero skips, and against a pre-0239
chain the premise check throws rather than skipping. `obw984.zero_entry` (fix round) pins the one ordering that block depends on: each door's own
"has no draft entries" arm refuses an empty batch BEFORE the loop that builds the Work's entry
array, so no `entry_count = 0` Work is reachable and a later recut that hoists the minting above
that arm is a red cell. The sibling pin lives in
`staff-expense-claim.test.mjs`'s `p638.core.no_regression`, whose CHECK literal #984 re-derived to
the four-value text (deliberately, with each prior value re-asserted by name) rather than deleting
or skipping the cell.

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

**The chain has one roster, and one way to read it (#1041).** `package.json`'s `test` script IS
the gate chain; `scripts/print-gate-chain.mjs` prints it as `--import` flags so a caller that is
not `pnpm test` never grows a second copy. `ci-frontier-leg-contract.test.mjs` holds that output
to the gate modules ON DISK, in both directions — a gate that ships without joining the `test`
script is a gate no sweep preloads, and a chain entry with no file kills every run that preloads
it. Use it wherever a sweep needs the chain by hand:

```
GATES="$(node scripts/print-gate-chain.mjs)"
node --test --test-concurrency=1 $GATES tests/<file>.test.mjs
```

**`db-slice-frontiers` is an estate sweep, and preloads the whole chain.** The leg replays the
CURRENT corpus against a chain that stops at this slice's own migration (0042–0045), so every
premise migration above that frontier is legitimately absent — the exact state a gate exists for,
and the one #927's own refusal message tells the reader to preload for. Until #1041 the leg ran a
bare `node --test`, and four d-b2 cells plus one d-b0 cell died loudly on that sentence (dispatch
run 35893727271). A gate never turns a PASSING cell into a skip: its flag is read only on the
branch where the premise is missing, which is a branch that fails without it.

**A fixture that runs at two frontiers is not a gate.** A gate lets a cell stand down; a
FRONTIER-COMPAT fixture keeps the cell running on both sides of the migration that changed a
door's grammar. `fa-authority-sign-compat.mjs` holds both of the x41 rig's:
`signTakesAuthorityRef()` (0227 moved the sign door's ARITY — feature-detected off
`to_regprocedure`) and `reviseTakesChangeClass()` (0227 added the `change_class` /
`change_reason` KEYS inside `p_particulars` — keyed on the migration's stem in
`clara.schema_migrations`, because a key leaves no signature to detect and probing the door's own
body would ask the subject under test what it should be).
`fa-rig-frontier-compat.test.mjs` cross-checks the second against the live door from the other
side.

## document_regions.field_path literals, kept honest (#857)

`clara._assert_field_path` (migration 0191) is enforced at `clara.persist_document_extraction`
alone — the table accepts anything written to it directly, and both `packages/db/tests/` and
`packages/runtime/tests/` do write it directly (71 raw `insert into clara.document_regions`
statements across 35 files, at last count — the ONLY two trees that ever bypass the audited
door). `scripts/check-document-region-field-paths.mjs` (repo root, chained into the root `lint`
script beside `check-dead-citations.mjs`) scans exactly those two trees for a literal
`field_path` value — an inline SQL string literal positioned at the column's own slot in a raw
insert, or a `field_path: "…"` object-literal property one step removed from it — and refuses one
that does not conform to 0191's grammar, read from 0191's own source text rather than duplicated
by hand. A `$N` placeholder, a variable or a `${…}`-interpolated template literal carries no
literal to check statically and is skipped; an evidence-CITATION object
(`{ region_idx, quote, field_path }`, the chat/prompt-tool shape, unrelated to this table) is
excluded by its own `region_idx` marker. `scripts/check-document-region-field-paths.selftest.mjs`
proves the detector against seeded fixtures and re-verifies the real two trees are clean today.

**Scans untracked files too (L04B-SPEC-06):** `scanTargetFiles()` lists both git's INDEX
(`--cached`) and any untracked-but-not-`.gitignore`d file (`--others --exclude-standard`), not the
INDEX alone — the gap a tracked-only listing left was exactly the one commit AC1's "exits non-zero
on a seeded malformed path" cares most about, the one that INTRODUCES a malformed fixture, before
its author has ever run `git add`. Proven both ways: a real subprocess run against an unstaged
decoy now exits 1 and names it, and a staged one still does too.

This is the LINT half of #857 only. The ticket's other half — a `clara.document_regions` table
`CHECK` built on a boolean sibling of `clara._assert_field_path` — needs a new migration, which a
wave-1 lane may not cut (docs/plan/active/riders-2026-09-20/WORK-ORDER.md rule 5); left to a
follow-up. The lint is preventive on its own (every literal conforms today) but structural only
once the `CHECK` lands — see this ticket's final report.

## World contamination and T10b (#866)

`rig-isolation.test.mjs`'s T10b asserts that `clara_agent_ro` and the two wake roles can
`EXECUTE` nothing outside `pg_catalog`/`clara`. Once a Workflow/WDK **World** is bootstrapped
on a database (`pnpm --filter @clara/runtime exec bootstrap`, [runtime README §engine-bootstrap]
(../../runtime/README.md)), that stops being true for a reason that has nothing to do with clara's
RBAC: PostgreSQL grants `EXECUTE` on a newly-created function to `PUBLIC` by default, and
`graphile-worker`'s own bootstrap never revokes it on `workflow`/`workflow_drizzle`/
`graphile_worker`. Every role — including the two clara roles T10b checks — can then reach
`graphile_worker.add_job` and friends. That is upstream default-grant behaviour on schemas T10b
was never scoped to police, not a leak in the grant matrix this package owns.

`worldSchemaPresent()` (`rig-meta.mjs`) checks for those three schema names and T10b skips with a
named reason (`World contamination (#866): …`, distinct from the `unready` pre-integration skip)
the moment any of them exist, so the cell never has to guess. On a database with **no** World
bootstrapped it runs unchanged and still reds on a genuine RBAC leak — nothing about what the
read/wake roles are actually granted changed. Two AC2 cells in `rig-isolation.test.mjs` pin
exactly that: `T10b-AC2 worldSchemaPresent() reads false on a no-World rig` guards the skip arm
from ever becoming universal by accident, and `T10b-AC2 a genuine PUBLIC-executable leak outside
clara is named by agentReachableOutsideClara()` plants a real PUBLIC-executable function in a
throwaway schema and asserts the enumeration names it (vacuity-controlled against a
deliberately-neutered `agentReachableOutsideClara()`). The first of those two ALSO carries a
named skip arm (L04B-SPEC-03): its own job is to guard T10b's skip arm from becoming universal on
a CLEAN rig, which has nothing to say about a genuinely World-contaminated one — without the
guard's own skip, it reds on exactly the rig shape T10b's skip exists to make pass, defeating its
own requirement. Reproduced on a cloned sibling database with only a bare `create schema
workflow` (no full bootstrap needed — `worldSchemaPresent()` checks namespace existence alone):
red before the fix, skip after, T10b itself unaffected either way.

**Recipe:** if your session needs both a bootstrapped World (for `WORKFLOW_POSTGRES_URL`-driven
runtime work) and a clean T10b run, keep them on separate databases rather than relying on the
skip — clone a sibling first (`create database <sibling> template <source>`, no active connections
on the source) and bootstrap the World only on the sibling. `RIG.md` in an active wave plan
restates this per-lane; this section is the durable copy.

## The opening-balance evidence-link race, measured (#854) and repaired (#1014)

`coding-lane-evidence-link.test.mjs`'s `cle.race.*` cells and `opening-balance-evidence-link.test.mjs`'s
`obw.race.*` cells share ONE two-session driver, `humanHoldThenContend`
(`coding-lane-evidence-link-fixtures.mjs`): side `a` runs and holds a transaction open, side `b`
fires and must be PROVEN blocked (`wait_event_type = 'Lock'` and `pg_blocking_pids` naming `a`'s
backend — a schedule that never blocked proves nothing about a race) before `a` commits and `b`
resolves against `a`'s committed state.

`obw.claim.unknown_document` (fix round) sits beside them and is not a race cell: it drives
`clara._lock_document_binding` directly with an id that names no document, because 0197's
"locks nothing and RAISES NOTHING" tolerance is a SEAM contract no door can express (both lanes'
writes are foreign-keyed to `clara.documents`). The claim is gated on the document existing, so
the helper writes no token on a key no document owns.

`clara.approve_opening_seed` / `clara.approve_opening_correction` refuse `CLR31 not_serializable`
outside a genuinely SERIALIZABLE transaction, so driving the opening lane through this helper needs
`side.isolation = "serializable"` — the ONLY level it accepts. A SERIALIZABLE side can also lose at
**commit** rather than at the statement its `run()` awaited (PostgreSQL defers a `40001`
serialization failure discovery to `COMMIT` in some shapes); `commitOrCapture` folds that outcome
into the same `out.a`/`out.b` shape a statement-level refusal already uses, so a cell asserts one
shape regardless of where Postgres actually raised it.

**What #854 measured, twice, reproducibly — and what 0235 changed.** `clara.documents` was locked
`FOR UPDATE` by both lanes purely for serialization (`clara._lock_document_binding`) and neither
lane's body ever wrote a column on that row. A row lock that is only TAKEN AND RELEASED forces
nothing on a waiter under a snapshot isolation level: when `attach_entry_evidence` (plain READ
COMMITTED, holds first) committed a document it had only locked, the blocked `approve_opening_seed`
(SERIALIZABLE since 0171) was granted the SAME byte-identical row, found no reason to abort, and
evaluated its conflict probe against a snapshot taken BEFORE the attachment committed — which never
saw the live link. **Both sides committed.** The reverse arrival order
(`obw.race.opening_then_evidence`) never had this hole: its contender is plain READ COMMITTED,
which always re-reads fresh per statement once unblocked.

Migration `0235_opening_binding_claim` (#1014) closes it. `clara._lock_document_binding` keeps its
`FOR UPDATE` on `clara.documents`, unmoved and still first, and then upserts that document's row in
`clara.document_binding_claims` — a serialization token, one row per document, written by that
helper alone and read by nothing. An `ON CONFLICT DO UPDATE` is arbitrated by the index, not by
anyone's snapshot, so the blocked SERIALIZABLE session now hits a real write conflict where before
it saw an unchanged row. `ON CONFLICT DO NOTHING` would not do: against a VISIBLE conflicting row
it takes no lock at all, which would leave the race open from a document's second binding onwards.
The walls themselves are untouched — they still decide from their own probes.

**The mechanism, measured rather than reasoned (this is what #854's own note asked a successor to
settle).** Three outcomes, re-measured on three throwaway relations on a rig PostgreSQL 17 before
0235 was written: a holder that only LOCKS a row lets a SERIALIZABLE waiter proceed (the defect); a
holder that UPDATES a row the waiter can see gives the waiter `40001 could not serialize access due
to concurrent update`; and a holder that INSERTS a row the waiter's snapshot cannot see gives the
same `40001` to a waiter upserting that key with `ON CONFLICT DO UPDATE`. The repair rests on those
three measurements, not on either causal account #854 floated — and note that neither of those
accounts pointed at a reachable repair: a SERIALIZABLE transaction cannot READ what committed after
its snapshot at all, so "re-read the evidence links under the lock" was never available. What was
available is a CONFLICT.

**What the loser is told.** The upsert's `serialization_failure` is caught in the helper and
re-raised as the walls' own `CLR13` / `source_already_posted` — 0182's shape, naming the document
and flagging the conflict — so a raw `40001 could not serialize access due to concurrent update`
never reaches a person. The handler wraps THE UPSERT ALONE: a serialization failure on the
`clara.documents` row itself would mean the document row changed (the legacy bytes/storage upgrade
is its only writer), which is a different fact and keeps its own spelling. **`detail.entry_id` is
null on this arm and that is a documented limit, not a gap:** the winner committed after the losing
transaction's snapshot, and nothing inside a SERIALIZABLE transaction can read it. The key is
present-and-null rather than absent, so the detail's KEY SET is unchanged. A caller that wants the
standing entry's name re-reads the document's links in a fresh transaction.

**The gates.** `obw.race.evidence_then_opening` asserts the repaired outcome (exactly one commit,
the tie document carrying ONE posted entry, the refused batch still wholly draft, and the loser
refused `CLR13`), and `obw.race.typed_refusal` pins what the loser sees against the SAME refusal
reached sequentially — byte-identical message, same detail keys, and the one honest difference
(`entry_id`) asserted explicitly in both directions. Both are frontier-gated on the
`opening_binding_claim$` stem (`gateBindingClaim`), so a leg pinned between 0213 and 0235 skips
cleanly; a FOCUSED run below 0235 fails loudly in the battery's `before` unless
`opening-binding-claim-preintegration-gate.mjs` is preloaded.

**AC2's "exactly one", reinterpreted (L04B-SPEC-04):** the brief's literal wording is "asserts
exactly one". Neither race cell pins a bare `1` — `obw.race.opening_then_evidence` asserts
`s.drafts.all.length` (the seed's own item count, `>= 3` by `obw.siblings_ok`'s mandatory
multi-item setup) and `obw.race.evidence_then_opening` asserts `s.drafts.all.length + 1`. This is
deliberate: #821's carve-out is that many opening items legitimately share one tie document, so a
single-item seed is not a shape available to pin a literal `1` against without weakening the
multi-item coverage the ticket also requires. "Exactly one" is read as "exactly the seed's own item
count and nothing else"; the second order's `+ 1` count IS the measured defect above, not a looser
reading of the AC.

**`approve_opening_correction` is never driven (L04B-SPEC-07):** the brief names it beside
`approve_opening_seed` as one of "the contending doors", but both race cells drive the seed door
only. It shares the exact lock path: `clara.approve_opening_correction` (0017:4162) and
`clara.approve_opening_seed` (0017:3784) both call `clara._approve_opening_entry` per draft entry
(0017:4241 and 0017:3962 respectively) — the same helper, whose `UPDATE` into `journal_entries`
fires `t_source_binding_wall_upd` (0213), which takes `clara._lock_document_binding` first
regardless of which approver's `UPDATE` tripped it. So the double-posting hole measured above is
architecturally reachable from the correction door too, untested by this ticket — the residual
issue (above) should name both doors, not only the seed one.

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
firm setup doors, `clara.get_firm_setup()` and `uq_onboarding_plans_one_firm` (RENAMED from
`uq_onboarding_plans_one_open_firm` by #894, `0255_onboarding_plan_firm_uniqueness.sql` — see
below). A focused run against a chain below that frontier FAILS by name; the package run preloads
`firm-setup-preintegration-gate.mjs`, which turns the same absence into a loud skip. Its world is
planted through the root connection because the subject is the setup doors rather than firm
creation, but every assertion under test runs through a least-privileged persona (`humanQuery`) —
the one deliberate root write is the `ck_onboarding_plan_items_answer` mechanism probe in
`p648.defer.reason`, whose subject is the CHECK itself and which no door owns. Two of its cells exist to pin what the WEB surface is allowed to assume about the doors rather than to test a new body: `p648.answer.correct` (answering again is the correction path, and a live firm default is corrected on the knowledge register instead) and `p648.opkey.attempt` (one op key names one request, so an op key derived from the answer VALUE can never be re-sent). Its cell `p648.plans.one_firm` proves only the ORIGINAL open-vs-open case that motivated 0218, now under the new name — the full any-state regression, including a CLOSED first plan, lives in `onboarding-plan-firm-uniqueness.test.mjs` below.

## Onboarding plan firm uniqueness (#894, `0255_onboarding_plan_firm_uniqueness.sql`)

`onboarding-plan-firm-uniqueness.test.mjs` is frontier-gated on its own stable stem
(`onboarding_plan_firm_uniqueness$`), the `legal_acceptance$` / `checkout_convergence$` idiom, and
preloads `onboarding-plan-firm-uniqueness-preintegration-gate.mjs` in the package run. It proves
the widened index — `uq_onboarding_plans_one_firm`, partial UNIQUE on `(firm_id)` where
`scope_kind='firm'` alone, no `state` term — three ways: the committed definition read off
`pg_index` (root, by construction: it probes the catalog directly), a second firm-scope plan
refused for the same firm in ANY state including when the FIRST is already CLOSED (cancelled;
again root, since no door ever closes a firm plan), and `clara.claim_paid_firm`'s replay arm still
answering the ORIGINAL `firm_id`/`plan_id` once a real firm is claimed through the live checkout
doors — that one driven end-to-end through `checkout-convergence-fixtures.mjs`'s own
`liveCheckout` / `deliver` / `claimPaidFirm`, the same helpers `checkout-convergence.test.mjs`
drives, so this file adds no second implementation of that world.

## Firm setup polish (#895, `0256_firm_setup_polish.sql`)

`firm-setup-polish.test.mjs` is frontier-gated on its own stable stem (`firm_setup_polish$`), the
`onboarding_plan_firm_uniqueness$` idiom, and preloads `firm-setup-polish-preintegration-gate.mjs`
in the package run. Three cells, one per recut defect: `p895.seed.noop` seeds a fully-empty plan
(bumps, seeded=10 as of #891 below — `mpers_eligibility`/`tin` are UNDETERMINED on a plan whose
`entity_type`/`turnover` are still unanswered, so neither of the twelve is seeded yet), then seeds
again under a DIFFERENT op_key once every DETERMINABLE catalogue row is already present (adds
nothing) and asserts the plan's `revision_token`/`revision_n`/revision-history count
are BYTE-UNCHANGED by the no-op call while `clara.audit_log` and `clara.domain_events` still gained
a row each (seeded=0); `p895.read.honest_no_plan` plants a firm with NO firm-scope plan at all
(root, by construction — no door ever creates one on its own) and asserts `get_firm_setup()` reads
`counter={required_answered:0,required_total:0}` rather than the catalogue's constant borrowed as
if it were progress; `p895.facts.state_filter` answers one firm-defaultable key and withdraws it,
answers a second and CORRECTS it, and asserts `confirmed_facts` excludes the withdrawn revision and
the pre-correction (superseded) revision while including only the corrected (live) one — cross-
checked directly against `clara.knowledge_records` by `id`/`state`/`superseded_at`, independent of
the door's own answer. `record_id` (the STABLE thread identity `clara._knowledge_row_json` exposes)
is shared by every revision of one fact; `revision_id` (`clara.knowledge_records.id`) is what a
capture, a correction and a withdrawal each mint fresh — the cells assert on `revision_id`, never on
`record_id`, for exactly that reason. All three cells were run against the recut migration's OWN
pre-image (the pre-#895 `create or replace function` text, applied by hand outside the migration
ledger) and failed for the reason the header names, then re-run green after restoring the exact
post-#895 bodies — the vacuity control, since #895's whole deliverable is three SQL-level fixes with
no new relation or grant to independently anchor a cell to.

## Firm setup applicability (#891, `0257_firm_setup_applicability.sql`)

`firm-setup-applicability.test.mjs` is frontier-gated on its own stable stem
(`firm_setup_applicability$`), the `firm_setup_polish$` idiom, and preloads
`firm-setup-applicability-preintegration-gate.mjs` in the package run. Four cells, one per
acceptance criterion, all through `humanQuery`: `p891.mpers.entity_type` seeds a Sdn Bhd and a
sole proprietorship through the doors and shows the eligibility item seeded (`pending`) for the
first and permanently unseeded for the second, even after a later reconciliation; `p891.tin.
turnover` does the same for the TIN item against the turnover answer, including the unanswered
(`'undetermined'`) case before either firm states a turnover band; `p891.counter.excludes` answers
turnover above the exemption threshold, reconciles (TIN joins `counter.required_total` at 9,
unanswered), answers TIN (joins `required_answered` too), then RE-answers turnover back under the
threshold and shows TIN drop out of BOTH sides of the counter on the very next read while its own
recorded answer is untouched — the regression this file's own migration header measured and
guarded against (`p648.commit.outstanding`'s `required_total=8` invariant, which answers
`entity_type` as `'sdn_bhd'` without ever re-seeding, stays true only because a conditional item's
counter contribution requires it to be ACTUALLY SEEDED, not merely live-applicable); `p891.answer.
survives` answers `mpers_eligibility` while `entity_type='sdn_bhd'`, then corrects `entity_type`
away and shows the item's own `state`/`answer` untouched while its reported `applicability` and
`required` flip live. All four cells were run against a deliberately broken variant of the
migration (seed's applicability filter removed, `get_firm_setup`'s applicability/counter/`v_unseeded`
guards reverted, applied via the `CLARA_MIGRATION_REDO` mechanism on this lane's own rig) and failed
for the reasons this file's own assertions name, then re-run green after restoring the migration
byte-for-byte — the vacuity control.

`firm-setup.test.mjs` (#648) and `firm-setup-polish.test.mjs` (#895) both needed narrow, direct
consequences of #891's seed-time change fixed alongside it: `p648.seed.reconcile` /
`p648.seed.empty` / `p895.seed.noop`'s literal seeded-row counts (9→7, 12→10, 12→10 respectively —
`mpers_eligibility`/`tin` are UNDETERMINED on a freshly-seeded plan and are no longer among the rows
a first reconciliation inserts), and `p648.capture.ineligible`'s loop — which answers `entity_type`
and `turnover` as part of proving the OTHER nine items capture no knowledge record — now
reconciles again immediately after each dependency answer (so `tin`/`mpers_eligibility` are
actually seedable before the loop tries to answer them) and answers `turnover` with `'RM1M-5M'`
rather than its own `sampleAnswer` helper's first option (`'<RM1M'`, which would make TIN
permanently exempt and refuse this very loop's later attempt to answer it).

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

- `p649.identity.direct_birth_residual` used to assert that `begin_client_onboarding` **still
  succeeded** at arity ≥ 2 — the residual, documented rather than hidden. #899
  (`0287_client_birth_wall.sql`) CLOSED it: the cell now asserts the opposite, that the door
  refuses the same way the read does, with no prior read required. The name is kept so the history
  reads honestly; the dedicated battery for the door that closed it is
  `client-birth-wall.test.mjs` below.
- `p649.identity.census_replay` re-runs `0103:1225-1239`'s five-role EXECUTE census over the three
  `name_family_*` helpers and asserts it is still EMPTY. The whole wrapper design turns on that
  negative, so a cell that ever needs relaxing is a design change, not a test change.

Counterparty fixtures are planted as post-images: `clara.counterparties` carries an immutability
trigger (CLR08) and `ck_counterparties_merge_retirement` admits retirement only as a merge, so a
retired counterparty is inserted with both `merged_into` and `retired_at` set.

## `client-birth-wall.test.mjs` (0287, #899)

Fourteen cells over the two granted doors `0287_client_birth_wall.sql` wires to the shared, ungranted
`clara._client_birth_core`, plus a live catalogue census. Frontier-gated on the live catalog through
`client-birth-wall-preintegration-gate.mjs`: a package-wide run against a chain below 0287 SKIPS
loudly, a focused run FAILS, and a PARTIAL cohort (some but not all of `_client_birth_core`,
`open_client_onboarding` and the re-pointed `begin_client_onboarding` present) throws rather than
skipping — the estate's "wholly present or wholly absent" rule.

- `p899.new_verb.*` — `clara.open_client_onboarding`, called with **no prior read**: arity 0
  creates; arity ≥ 2 refuses with the same CLR10 `name_family_collision` token and candidate rows
  `client_identity_candidates` itself returns (AC1); arity 1 refuses without an acknowledgement and
  succeeds with the read's own candidate id, and a WRONG id refuses the same way as none at all
  (AC2); a same-op_key replay returns the byte-identical receipt exactly once; the admin floor
  refuses a bookkeeper and a viewer. Two more cells own the door's guarantees BEYOND one caller:
  `identifier_is_recorded_not_only_consulted` proves the door STORES the identifier it walled
  against (so the next caller's read matches it, and a malformed one refuses before anything is
  created), and `concurrent_same_family_serialised` drives TWO real connections — session A holds
  its birth open, session B blocks on the door's own family lock (proved from `pg_blocking_pids`,
  never a sleep), and once A commits B meets the wall a sequential caller meets instead of minting
  a third same-family client.
- `p899.legacy.*` — `clara.begin_client_onboarding`, re-pointed: arity ≥ 2 now refuses (closing
  `client-onboarding-identity.test.mjs`'s own `p649.identity.direct_birth_residual`); arity 0 and
  arity 1 are unchanged from before 0287 — the deliberate scope boundary the migration's own header
  argues for, proved here rather than left assumed.
- `p899.census.*` — a live, catalogue-derived sweep of every granted human/agent/wake-reachable
  body that mints a `clara.clients` row (directly, or by delegating to `_client_birth_core`), plus a
  belt asserting `_client_birth_core` itself holds no application-role grant. **These cells BOUND
  the one residual; they do not claim the ticket's census criterion is met, because it is not.**
  `clara.create_client` is still granted and still unwalled, so the roster of unwalled granted
  minters is asserted to be exactly `["create_client"]` — a new member is a regression and an empty
  array means the residual was closed and both this census and the criterion should be rewritten.
  `create_client_residual_is_bounded` then measures the reach: the catalogue comment marking the
  verb superseded is live, no product tree calls it, and the single operator script that does runs
  as the superuser rather than on the grant. See `packages/db/README.md`, "The client birth wall".

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

## `document-capability-high-water.test.mjs` — #846 / migrations 0244 and 0272

Ten cells over `clara.document_capabilities` and its new high-water relation. Gated on the LIVE
CATALOG (the relation, the four trigger bodies, the five triggers and the deferred `pg_constraint`
row), never on a migration number; a PARTIAL cohort THROWS. 0244 and 0272 are ONE cohort because
they land in one pull request: no shipped chain sits between them, so a database carrying one and
not the other is a half-applied migration, which is what the cohort reports. Its gate module is
`document-capability-high-water-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY_HIGH_WATER`), and the focused run with that variable
UNSET is the acceptance shape — zero skips.

- **The two refusals**: a pair's published version survives DELETE (re-inserting below it raises
  `CLR08` / `registry_version_high_water` carrying the mark and the attempted version), and the
  mark itself is append-only (DELETE and any lowering raise `CLR08` /
  `registry_version_high_water_append_only`, a raise is admitted).
- **The uniformity wall**, from both sides: a transaction raising ONE pair is refused **at a real
  COMMIT**, and the registry is re-read afterwards to prove nothing was written; a whole-registry
  raise passes the same wall, forced early with `set constraints
  clara.t_document_capabilities_version_uniform immediate` so the probe can roll back instead of
  republishing the live registry. **The commit cell is the only cell in this file that commits**,
  and its safety rests on the gate: the deferred constraint trigger is proven present before the
  transaction opens. With the wall absent the same transaction commits and leaves the registry
  publishing two versions — measured while writing it.
- **The three routes the first cut left open** (0272, the fix round after the adversarial lens
  drove them as `clara_fn_owner` on the lane database): **TRUNCATE** of the mark ledger, which no
  ROW trigger sees, refused by 0003's `clara._tf_no_truncate` armed `before truncate … for each
  statement` (`CLR08`, and no `detail.reason` — the estate's single truncate guard carries none);
  a **RE-KEYING UPDATE** of the registry onto a published pair's key, refused by the same
  high-water body armed a second time as `t_document_capabilities_version_high_water_rekey`,
  `before update … when` the key changes (`CLR08` / `registry_version_high_water`, naming the
  DESTINATION); and a **backwards `recorded_at`** on the mark, refused by one more case arm in the
  append-only body. Each cell FAILED against 0244 alone before 0272 closed it. The re-key wall is
  a SECOND trigger with a `when` clause rather than a wider event list on 0244's, because BEFORE
  ROW triggers fire in name order: the wide cut was applied and measured to re-label an ordinary
  in-place lowering from 0207's `registry_version_monotone` to `registry_version_high_water`, and
  `document-capability-registry.test.mjs` caught it.
- **The three positive controls** — re-publishing a retired pair at and above its mark, the first
  publication of a never-seen pair (which mints its mark in the same statement), and rollback
  hygiene over both tables — exist because a refusal that refuses everything would pass the two
  cells above and fail the estate. Proven non-vacuous: with
  `clara._tf_document_capabilities_version_high_water` recut to refuse every insert, cells 1, 5 and
  6 go red; the body is restored byte for byte through the redo path and re-measured by
  `sha256(prosrc)`.

`document-capability-registry.test.mjs` (0191/0207's own battery) is untouched by 0244 — every
probe in the new file is rolled back, which is what keeps that file's registry-wide invariants
true.

**#782 (migration 0245)** edits that same battery in place rather than adding a cell: `PUBLISHED_
REGISTRY_VERSION` re-bases 2 → 3 (its own doc comment says why, in the one place a future
republication re-bases), and the invoice-shaped-PDF / monotone-probe / rollback-hygiene cells' pins
move from `limits.invoice_line_items = "planned"` to `{ invoice_line_items: "accepted_limitation",
invoice_line_items_reason: "no_consumer_reads_line_facts" }`. This file's own rollback-hygiene cell
(above) pins the SAME row's limits and needed the identical edit — a reminder that a value pinned
in two batteries over one table moves in both or the second one reds after the first migration
that changes it. See `packages/db/README.md`'s "#782" section for the migration itself.

**#988 (migration 0246)** adds three cells to the registry battery, behind their own catalog
frontier (`proposalLevelApplied()` greps `pg_get_constraintdef` for the `proposal_only` token,
never a migration number), with its own `EXPECTED_CELLS_PRE_988`.

**The fix round (migration 0272)** adds three cells to the high-water battery and one to the
registry battery — the registry's own `comment on column … limits` stops calling invoice line
items planned (#782's AC2), behind `wallCompletionApplied()`, which reads 0272's truncate trigger
rather than the comment it asserts.

**Counts, measured on the lane database with the whole chain applied:** 10/10 for
`document-capability-high-water.test.mjs` and 23/23 for `document-capability-registry.test.mjs`
(17 below 0207, 20 below 0246, 22 below 0272 — each named by its own `EXPECTED_CELLS_*` constant,
and the `after` hook asserts whichever the live frontier makes true, so forgetting to bump one
reds the battery).

## `operator-support.test.mjs` `os.19` — #844

os.14 (#774) pins the arm-1 lateral's SECOND ordering key (a money-carrying intent status beats a
bare `opened_at desc`), but every world it or any other cell in the file builds gives a
registration at most one intent pair with distinct `opened_at` values — so migration 0188's THIRD
key (`i.id desc`) was provable only by reading the migration's own text. os.19 builds the one
world in which it is observable at all: three checkout intents on one registration, two forced to
the exact same `opened_at` instant, none of the three carrying the money.

(Numbered os.19, not os.15: the file's own section-7 series already runs os.15 through os.18 —
the new cell originally shipped as a second, colliding "os.15" and was renumbered in fix-round 1.)

**Minting three intents without ever landing one in `session_created` or `processing`.**
`clara.open_checkout_intent` (0186 §G) reuses only an unstamped, still-`open` intent, and
separately refuses CLR09 `checkout_in_progress` outright while ANY intent sits in
`session_created` or `processing` — so os.14's own "stamp then pay" idiom would BLOCK the next
open rather than merely fail to be reused. os.19 instead force-transitions each intended
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

**Acceptance #3 ("the cell fails if the id key is removed") is checked two ways, since one alone
does not cover the criterion (code review L03-CRS1).** Half one checks the key's DIRECTION: os.19
runs a companion `SELECT` — the identical predicate from 0188's arm-1 lateral, never the deployed
function or the migration body — with `i.id desc` reversed to `i.id asc`, and reads that it
deterministically names the OTHER (loser) intent; a second companion run with the shipped
direction is asserted to agree with the door, confirming the companion query is faithful. THIS
HALF ALONE DOES NOT PROVE REMOVAL: a hand-written copy of the predicate still compares on id
either way, so it cannot go red for a recut that drops the clause outright — measured on this rig,
doing exactly that to a copy of the predicate named the SAME row as the shipped predicate in 6 of
10 three-intent/two-instant worlds. Half two closes that gap with a STRUCTURAL pin against the
ACTUAL deployed function body (`normalizedBody(SHARED_SIG)`, this file's own os.11 census idiom):
it asserts the live, lower-cased, whitespace-stripped `clara._operator_support_cases` source still
contains the exact ORDER BY clause ending `i.iddesc`, which is present in the real body and absent
from both a simulated id-removed variant and a simulated id-reversed variant (checked directly
against the live catalog and against string variants of it, not merely reasoned about).

`EXPECTED_CELLS` (this file's own `os.VACUITY CONTROL`) is 19, one more than before this ticket.

## `operator-support.test.mjs` `os.20` / `os.21` — #843 / migration 0263

The operator console offers THREE support acts and, until this ticket, only one of them was
readable anywhere: `clara.reject_firm_registration` has appended `firm_registration.rejected`
since 0145 §D, while `clara.set_admission_capacity` and `clara.resolve_stripe_event_problem`
stamped `clara.audit_log` and nothing else — and no door in the estate reads that table (os.13's
firm-scoped SELECT is the only human reach). 0263 gives the two silent acts one
`clara._append_event` each, registering `admission.capacity_set` and
`stripe_event.problem_resolved` firm-level and routing both `context_update` at the active
taxonomy version.

**The read is `clara.list_activity`, not `clara.list_firm_timeline`.** #843's own 2026-09-20
correction records that the latter (and `apps/web/lib/firm/timeline.ts`) retire under #998 and
that #659 already swapped Firm Home's "Recent activity" band onto `clara.list_activity`. Both
doors page the SAME `clara.firm_timeline_visible` view at the same bookkeeper floor, so only the
read moved — the mechanism (one event under the operator firm, inside the reservation) is
unaffected.

**os.20** drives all three acts and reads them back by type, asserting actor, a null `client_id`,
the registered description sentence and the KIND each lands on; then that another firm's owner
reads none of the three; then that an operator-firm VIEWER meets CLR04 rather than an empty page.
`firm_registration.rejected` is asserted FIRST as the control: it has been appended since 0145, so
a page that cannot find it is a broken read rather than a missing event type.

**The kind is the door's STATED DEFAULT (`documents`), decided rather than inherited.**
`clara.list_activity`'s ladder (0202) recognises `sweep.run_completed`, `entry.%`, `document.%`,
`close.%` and `work.%` and files everything else under `documents`. #843's correction asks the
acceptance cell to settle this with #861 (the open recut of the same ladder) and say which: all
three operator acts ride the default TOGETHER. The owner's #861 ruling fixes five new kinds —
`people`, `assets`, `counterparties`, `clients`, `firm` (`firm.*`) — and none covers an admission
act; `firm_registration.rejected` is not matched by `firm.%` either (its fifth character is `_`,
and `.` is a literal in a LIKE pattern), so the already-visible act stays on the default after
that recut too. A sixth kind would be new user-visible vocabulary, which is the owner's call. If
#861 ever does give the operator acts a kind, os.20's `SUPPORT_EVENT_KIND` moves with it — the
constant is spelled once, in `operator-support-fixtures.mjs`.

**os.21** proves the replay half: the same op_key on both doors returns the original receipt and
appends no second line, counted in `clara.domain_events` as root and then read back through the
door. That is the reason both appends sit between `_reserve_op` and `_finish_op`, and 0263's tail
asserts the POSITION (not merely the presence) of each one.

**Frontier**: stem `operator_support_timeline_events$`, gate module
`operator-support-timeline-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_OPERATOR_SUPPORT_TIMELINE=1`), wired into `package.json`'s `test` script in
migration order after `activity-successor-link-preintegration-gate.mjs`. The FIRST #843 cell uses
the LOUD discriminator (`assertSupportTimelineCohortPresent`) and the second the quiet
`gateSupportTimeline`, the double-gate idiom `accrual-adjustments-fixtures.mjs` documents. Both
cells ride 0188's stem as well, because every one of them builds its world through the #615
fixtures.

**`EXPECTED_CELLS` stays 19** and the two new cells are counted separately
(`EXPECTED_TIMELINE_CELLS`), added to the expected total only when `supportTimelineLaneReady()` is
true — so a database pinned between 0188 and 0263 reports a clean vacuity control instead of a
false finding. (The four #776 name cells predate that shape and are still counted
unconditionally; a database carrying 0188 and not 0206 would red the control. Untouched here,
worth a follow-up.)

**No new rig-meta cohort, and that is measured rather than omitted.** Both doors keep their
existing cohorts (`CHECKOUT_CONVERGENCE_0186_COHORT`, `CHECKOUT_GATE_C2_HUMAN_FNS`): no new
function name, no signature change, no grant change, each re-read by 0263's own §T. The file's
other effect is reference data — two `clara.event_types` rows and their `clara.trigger_taxonomy`
routing — which no cohort here enumerates; the estate's coverage law over the catalog lives in
`rig-events-structure.test.mjs` §7, and 0263's tail re-reads that anti-join for itself. A `#843` /
`#843 END` bracketed note beside the cohort records it, the same shape #840's note carries.

**Where the capacity act's append sits, and why it is not beside its audit row (fix round,
ADV-L08-1).** `clara._append_event` opens by taking the acting firm's `clara.firm_event_seq` row
and holds it to commit. Three peer operator acts take that same OPERATOR-firm row and take no
advisory lock (`reject_firm_registration`, `approve_firm_registration`, and 0263's own recut of
`resolve_stripe_event_problem`), while `clara.set_admission_capacity` also holds
`pg_advisory_xact_lock(hashtextextended('clara.admission-capacity', 0))` — the key
`clara.claim_paid_firm` takes for a paid applicant's firm claim. Appending INSIDE that critical
section made the estate's admission lock wait on an unrelated operator act: measured with three
connections on the rig, S1 holding the operator firm's seq row, S2 inside the capacity door on a
`Lock/transactionid` wait with the advisory lock already taken, S3's `pg_try_advisory_xact_lock`
returning FALSE — i.e. a firm claim queueing behind a support act, which `claim_paid_firm`'s own
comment refuses ("no business queueing behind the estate's admission lock"). The append therefore
runs BEFORE the advisory lock (still inside the reservation, so os.21's replay proof is unmoved),
and 0263 §T pins the order in the committed body. No cycle is created by taking the seq row first:
`claim_paid_firm`, the only other holder of that key, appends under the firm it is CREATING in the
same transaction, never under the operator firm. `resolve_stripe_event_problem` takes no advisory
lock, so its append stays beside its audit row.

**The registered sentence is pinned, not just the name (fix round, ADV-L08-2).** §1 registers both
types with `on conflict (name) do nothing` — which is what makes a redo idempotent, and also what
would silently KEEP a colliding registration written by someone else. `clara.firm_timeline_visible`
projects `clara.event_types.description` as `event_description` and both activity doors return it,
so that column IS the line the operator reads. 0263 §T now asserts the exact text of both
descriptions alongside `client_scoped` and the taxonomy routing, so a collision refuses the
migration instead of being left to a human glance at integration time. Control: with the
append-only guard (`t_event_types_append_only`) suspended inside a rolled-back transaction, each
description was replaced in turn and §T refused with CLR10 naming the foreign sentence; the
subject was restored byte for byte.

**Why #840's and #861's door recuts landed in TWO migrations and not one.** #840's triage comment
and #861's owner ruling each asked for ONE migration if both were in flight together. They were —
in this lane — but the wave-2 work-order addendum (`docs/plan/active/riders-2026-09-20`) overrides
it: one implementer per ticket, and "a ticket that needs a schema or function change writes EXACTLY
ONE new migration file at the number reserved for it". So 0262 (#840) and 0264 (#861) each recut
`clara.list_activity` and `clara.get_activity_event` in turn, and they compose because 0264's
prestate pins 0262's OUTPUT shas rather than 0202/0184's and its body was rebuilt from 0262's
committed text. A chain that applies 0262 then 0264 therefore reaches the same body a single
migration would have written; the two files are never applied out of order because migration
numbers are a total order.

## `activity-feed.test.mjs` `af.33`–`af.39b` — #861 / migration 0264

Both activity doors computed a row's `kind` from a five-rung ladder — `sweep.run_completed`,
`entry.%`, `document.%`, `close.%`, `work.%` — and swept everything else into `else 'documents'`.
Six wave-2026-09-15 tickets (#625, #633, #639, #646, #647, #650) each hit the same residual and
DECISIONS D13 deferred it rather than let six lanes patch one shared ladder mid-wave. The owner's
ruling of 2026-09-18 on #861 fixes the vocabulary, and 0264 recuts BOTH bodies and the door's
closed `p_kinds` roster in one transaction:

| prefix(es) | kind |
|---|---|
| `member.%`, `invite.%` | `people` |
| `asset.%` | `assets` |
| `counterparty.%` | `counterparties` |
| `client.%`, `knowledge.%` | `clients` |
| `firm.%` | `firm` |

Everything else still rides the STATED DEFAULT, `documents`.

**`firm.%` is written with the dot on purpose.** In a SQL LIKE pattern `.` is an ordinary
character but `_` is a single-character WILDCARD, so the natural-looking `firm_%` would also have
swallowed `firm_registration.*` (the operator admission surface, three types) and `firm_setup.*`
(the setup checklist, four) — two families the ruling does not name, and one of which os.20 pins
on the stated default two commits earlier on this same branch. **os.20's own reading survives
0264 unchanged**: all three operator support acts still ride `documents`, and af.37 asserts the
`firm_registration.*` half of that from the other side.

**The five cells that name a family** are af.33 (people), af.34 (assets), af.35 (counterparties),
af.36 (clients) and af.37 (firm). Each proves the same three things and nothing more: the door's
filter ADMITS the kind (before 0264 every one of them answered `CLR10 invalid_kind` — that is the
red each cell was first seen in), `clara.list_activity` files the family's event type under it,
and `clara.get_activity_event` answers the same kind for the same row. af.34 adds the departure
half (the acquisition has LEFT the documents rung) and af.37 adds the look-alike negative above.

**Real rows where the world has them, appended rows where it does not.** af.33's `member.added`
and af.37's `firm.created` are written by `clara.add_member`/`clara.create_firm` when
`buildWorld()` runs, so those two cells read product-written rows. The rest go through `mkEvent`,
the same direct `clara._append_event` idiom `mkSweepEvent` uses: the ladder reads `event_type` and
nothing else, so a row a real door would write and a row this writes are indistinguishable to it.
One finding came out of drawing that line — **`client.created` is a REGISTERED but UNEMITTED event
type** on this estate (measured on `clara.domain_events`: `client.activated`,
`client.onboarding_started` and `client.resolved` are written, `client.created` never is), so
af.36's first cut, which looked for a real one, was waiting for a row no door writes.

**af.38 is the stated default**, driven through three families the ruling does not name
(`bank.statement_ingested`, `egress.purpose_activated`, `open_item.created`) so the claim is about
the `else` arm and not one lucky prefix. It is green before the recut as well as after, so it
carries the vacuity control the house asks of such a cell: both installed bodies were hand recut
on the rig with `else 'documents'` replaced by `else 'clients'` and af.38 failed; the bodies were
restored by reversing that one replacement and re-applying 0264 through `CLARA_MIGRATION_REDO`.

**af.39a and af.39b are the ticket's "the two ladders agree for EVERY event type" criterion, from
both sides.** af.39a reads both INSTALLED bodies out of `pg_proc`, slices each one's ladder from
the sweep rung to the stated default, drops comment lines and normalises whitespace, and asserts
the two are the same sentence — comments are dropped because the two doors document identical
rungs at different lengths, and what must match is the DECISION, not the prose. It then compares
that sentence to `EXPECTED_LADDER`, written out once in the test from #728/#630 and the owner's
ruling rather than re-derived from the SQL under test. af.39b is the behavioural half: it appends
ONE event of every registered `clara.event_types` name, pages the feed until every one is seen,
and asserts both doors answer the kind an independent prefix table predicts, then asks the door
for each kind it saw so "correctly labelled" and "reachable" are one claim. `sweep.run_completed`
is the single excluded name, with its reason: #728 keeps an effectless heartbeat out of the feed
entirely, so a bare append of one could never reach a page; af.15 owns that rung behaviourally and
af.39a covers it structurally. Both cells were shown red by hand-recutting the detail door's
`assets` rung to `documents`, which makes the two ladders disagree for exactly one family.

**Frontier**: stem `activity_kind_ladder$`, gate module
`activity-kind-ladder-preintegration-gate.mjs` (`CLARA_ALLOW_MISSING_ACTIVITY_KIND_LADDER=1`),
wired into `package.json`'s `test` script in migration order after
`operator-support-timeline-preintegration-gate.mjs`. af.33 uses the LOUD discriminator
(`assertKindLadderCohortPresent`); af.34–af.39b use the quiet `gateKindLadder` — the double-gate
idiom `accrual-adjustments-fixtures.mjs` documents, and the same shape #840's af.31/af.32 use one
frontier earlier in this file.

**No new rig-meta cohort, measured rather than omitted.** `clara.list_activity` and
`clara.get_activity_event` are still 0181's same two doors at their same signatures and grant
(`ACTIVITY_FEED_0181_HUMAN_FNS` already covers them; 0183, 0202 and 0262 each recut these bodies
before). 0264 changes body text only — no parameter, no new function, no widened or narrowed ACL —
and its own tail re-reads owner, `SECURITY`, both pinned settings and the exact ACL for both names
and refuses on drift. A `#861` / `#861 END` bracketed note beside the cohort records it, the same
shape #840's and #843's notes carry.

**The browser half is a separate contract kept in two places.** `apps/web/lib/firm/activity.ts`'s
`ACTIVITY_KINDS` must equal the door's roster exactly — a value there the door refuses is a filter
chip that answers CLR10, and a value the door carries that is missing there is a kind no bookmark
can name. `lib/firm/activity.test.ts` pins the roster and the label map; the URL parser needed no
change, because it already drops an unrecognised token (which is what makes a bookmark naming a
retired kind degrade to "no filter on that axis").

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
constant): it WALKS `packages/db/tests` for every module whose source imports
`<path>/scripts/reset.mjs`, either dynamically (`import("…")`) or via a static
`import … from "…"` (widened by code review L03-CRS2 — the dynamic-only spelling this suite
shipped with let a static-import caller with a bare `reset()` keep the whole suite green;
demonstrated with a temporary probe module, removed before commit), asserts that set is a
SUPERSET of the audited 14 (T19's own file plus the 13 this ticket fixed) — a missing known file
fails, an extra file is logged, not failed (code review L03-CRS4 — an exact match went red for a
correctly-wrapped FUTURE file, a false red a later lane could misread as its own regression; the
hard bar for an extra file's call sites is the next cell, which needs no list). It then blanks out
comments and string/template literals and asserts none of the discovered files has an unwrapped
`reset(` call token left (not only the `await reset(` spelling — `const r = await reset(...)`,
`return reset(...)` and an extra space before the paren are all caught the same way), and that
each imports `guardedReset` at least as many times as it imports the raw `reset`. A file added
later that imports the destructive `reset` unwrapped, dynamically or statically, is caught by this
suite without anyone maintaining a list. One behavioural cell imports the ACTUAL
`scripts/reset.mjs` export — the identical module object every one of the 14 files resolves — to
prove it is a real, callable export, then proves `guardedReset` refuses a non-disposable name
(`clara_631`) before a spy that never delegates to that export is entered; because the structural
cells already show every drill funnels through this same `guardedReset`, that one proof
generalises to all 14 call sites.

**Acceptance #3 ("every affected drill still passes its ordinary run") is PARTIAL, not done (code
review L03-CRS3).** What runs here is only "no import-time crash from the added import" — a skip
is not the drill's ordinary run — and, as the next paragraph says plainly, 3 of the 14 files HAD
no CI leg anywhere to run the real thing at the time (#1023 has since closed that gap; this
paragraph is #845's own acceptance record, not a live claim). The fix-round report states this
criterion's status as PARTIAL rather than folding it into the ticket's overall DONE.

**This suite never sets `CLARA_RIG_ALLOW_RESET`.** The 14 drills' own destructive paths are meant
to be CI's job, one file at a time, on an isolated database — as of #845 only 11 of the 14 had a
CI leg: `.github/actions/closed-wave-upgrade-drills/action.yml` ran hrd-a-recut-guard,
hrd-b-upgrade-kit, rig-docs-upgrade, rig-events-upgrade, s6-upgrade, wave-b/wb-0020-upgrade,
x37/x40/x41-upgrade, and `.github/actions/frontier-leg/action.yml` ran x42-split-upgrade-kit; T19
(`rig-isolation.test.mjs`) runs in the ordinary battery and skips without the flag.
`checkout-convergence-upgrade.test.mjs`, `rig-runtime-upgrade.test.mjs` and
`wave-a-upgrade.test.mjs` had **no CI leg at all** — their destructive path had never run anywhere
but a worker's own machine, by hand, per that file's own header recipe (a gap #845 tracked as a
follow-up, not closed by that ticket).

**#1023 closed that gap.** All three now have their own step in
`.github/actions/closed-wave-upgrade-drills/action.yml`, following the established pattern
exactly: their own throwaway `*_ci` database (the same name each file's own header recipe already
documented — `clara_0186_upgrade_ci`, `clara_runtime_upgrade_ci`, `clara_wave_a_upgrade_ci`), both
destructive flags, and a between-step cluster cleanup. All 14 audited files now have a CI leg;
only T19 still never exercises its destructive path anywhere but the ordinary battery's skip.
`reset-gate-routing.test.mjs` carries the structural proof: it parses the action file itself and
asserts, per newly-covered drill, that a step RUNS it — located by the one line carrying both
`node --test` and `tests/<file>`, never by the step's prose, because a step chunk carries the
comment block that precedes the NEXT step and a comment naming a drill would otherwise point every
assertion at the wrong step (review SPEC-1023-03, with its own cell) — sets both
`CLARA_RIG_ALLOW_RESET=1` and `CLARA_ALLOW_DESTRUCTIVE=1`, targets the documented database name, and that name passes the SAME
`EPHEMERAL_DB` guard `rig-reset-guard.mjs`'s `guardedReset` enforces (imported, never re-spelled)
— a leg whose own database name the guard would refuse proves nothing. What this suite proves
locally, safely, and on a shared rig is still only the ROUTING and (since #1023) the WIRING —
never that the destructive body itself has actually been exercised, which remains CI's job alone
(RIG.md: this rig must never set `CLARA_RIG_ALLOW_RESET`).

**The drill database-name grammar (#1041).** A throwaway drill database is named by a plain,
already-lowercase SQL identifier — `CONFORMING_DB_NAME` (`/^[a-z][a-z0-9_]*$/`), exported by
`rig-cluster-reset.mjs` and enforced by its own `dropDatabase`. Two reasons, and the second is the
one that decides the rule when a name and the grammar disagree:

1. `dropDatabase` interpolates the name into `drop database if exists <name>` UNQUOTED (a database
   name cannot be a bind parameter), so the grammar is an injection wall.
2. **A name outside the grammar does not round-trip.** `create database <x>` case-folds an
   unquoted identifier while `PGDATABASE` is a LITERAL libpq name, so a mixed-case drill name
   names two different databases in the two lines of its own step. Measured on PostgreSQL 17
   (lane 07, 2026-09-24): `create database clara_case_probe_A_ci` puts `clara_case_probe_a_ci` in
   `pg_database`, and connecting with `PGDATABASE=clara_case_probe_A_ci` raises
   `3D000 database "clara_case_probe_A_ci" does not exist`.

So when #1023's `clara_waveA_upgrade_ci` was refused by the cleanup step on the first dispatch
after riders wave 3 (run 35893727271), the remedy was to move the NAME, not to widen the grammar:
widening it would have let the step reach its own second defect. The name is now
`clara_wave_a_upgrade_ci` in the action, in `wave-a-upgrade.test.mjs`'s header recipe and in
`reset-gate-routing.test.mjs`'s `NEWLY_COVERED`, and
`ci-drill-database-names.test.mjs` holds EVERY literal database name in
`.github/actions/closed-wave-upgrade-drills` and `.github/actions/frontier-leg` to both halves —
the grammar (imported from `rig-cluster-reset.mjs`, never re-spelled) and the round trip, which it
asks PostgreSQL's own `quote_ident` rather than re-implementing.

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

`p639.birth.opening_excluded` builds a fresh onboarding client via `freshEnrolledFaClient`
(`x41-fa-world.mjs` — the enrol-and-chart prefix `kSeededFaClient` also composes, factored out to
one place rather than duplicated across the two, code review STD-1), which explicitly ENROLS
COST/ACCUM/EXPENSE (`upsert_fa_account_profile` is a deliberate act, never automatic — the belt
only sees an account as enrolled once this door has run for it). The cell then drafts a plain
`gl_balance` opening item naming the enrolled COST account directly (never itemised as
`item_kind='fixed_asset'`) plus a second, ordinary item on SHARE so the set's net OBE ties to zero
ahead of the belt, and asserts the approval refuses CLR40 `fa_k_gl_balance_on_enrolled` naming the
account code, with the register row count PINNED TO THE LITERAL ZERO the criterion names both
before and after the refused approval (code review L03-CRS5 — a before/after delta alone would
stay green on a fixture that already carried a register row) and both entries still `draft` — the
belt is a DEFERRED constraint trigger, so its exception unwinds the WHOLE approval, not just the
register write.

`p639.birth.opening_admitted` drives `kSeededFaClient` and asserts EXACTLY ONE `clara.fixed_assets`
row ties to the opening entry (`acquisition_entry_id`), and it is the SAME id `seed_fixed_asset`'s
own receipt named — the behavioural proof that `_tf_fa_acquisition_birth`'s
`if new.is_opening_balance then return null; end if;` guard actually prevented a second birth,
rather than a `prosrc` string match proving only that the guard's TEXT exists.

## The fixed-asset birth-watermark battery (#972)

`fa-birth-watermark.test.mjs` is frontier-gated on the `fa_birth_watermark$` stem (migration 0247)
— never on a number — and shares `fa-birth-watermark-fixtures.mjs`. Five `p972.*` cells:
`p972.law` reads the recut birth body off the CATALOG (the watermark expression present exactly
once, 0216's watermark-free join gone, NO bare clock token — arm (D)'s own detector, imported from
`x42-s5-helpers.mjs` rather than restated — and `clara.fa_register_tie` still phrasing the
pre-enrolment test the watermark negates, twice; `t_je_fa_acquisition_birth` still the deferred
insert-or-update constraint trigger whose re-firing is the mechanism); `p972.retro` drives the
defect's own shape at the door seam and then through `clara.fa_register_tie` at `x41.s4`'s three
as-ofs, classified by `x41.s4`'s own `isRed`/`isExplained`; `p972.refire` proves the narrowed join
did not close the lane 0216 opened; `p972.source` drives the assumption the predicate rests on
instead of asserting it — an approved entry can never carry a NULL `approved_at`, because
`clara._tf_entry_immutable` refuses the draft→approved transition without one and its
approved→approved allow-list is exactly `{reversed_by, reversal_reason, updated_at}`;
`p972.sites` records the SECOND birth site rather than aligning it.

**Why the predicate is the TIE's, negated, and not the BELT's.** The belt
(`clara._tf_fa_movement_belt`, 0041 §S2.6) spells its own watermark
`coalesce(new.approved_at, now()) >= fp.enrolled_at`, and the first cut of 0247 copied it. That
session clock is wrong here and the review caught it twice over: the whole finding is that this
trigger RE-FIRES in a LATER transaction (`clara.reverse_entry`'s `reversed_by` stamp), where
`now()` is the REVERSING transaction's instant — always at or after enrolment — so the fallback
would re-admit exactly the entry the file excludes; and the clock read reddened `x42.r7.s5c.5` and
`x42.s5c.6`, whose arm (D) roster (`FA_ACQUISITION_0216_CLOCK_NAMES`) says in prose that this body
"takes its dates from the entry it fires for". The shipped predicate is
`coalesce(new.approved_at, new.created_at) >= fp.enrolled_at` — the exact negation of
`clara.fa_register_tie`'s own pre-enrolment test (`coalesce(j.approved_at, j.created_at) <
v_enrolled`, once per column), so the instrument that BIRTHS a register row and the instrument
`x41.s4` reads to AUDIT it cannot disagree about scope. It spends no clock read, so arm (D)'s
roster stays true unwidened, and 0247's own tail (T.8) re-proves that off the catalog.

**The second birth site is PINNED, not aligned (`p972.sites`).** `clara._fa_on_approve` arm 4
makes the same insert with the same conflict target, and 0247 deliberately leaves its join
watermark-free — two birth sites that now differ in text is exactly the condition that produced
#972's defect, so the reasons it is safe here are measured off the catalog instead of argued.
Three facts, and the cell reds if any moves. (1) The DIVERGENCE is real: arm 4 carries its
watermark-free join exactly once and no copy of the trigger's watermark — an absence nothing
checks is not an absence. (2) Arm 4's own guard still reads `not e.is_opening_balance and
e.reversal_of is null and not (e.flags ? 'fa_disposal')`, which excludes the reversal MIRROR —
the only entry arm 4 sees during a reversal, since `clara.reverse_entry` hands its hook
`v_mirror`, never the original. That is the precise difference from the trigger, which the house
reversal law re-fires on the ORIGINAL. (3) `clara._fa_on_approve`'s caller set is exactly
`{_subledger_on_approve}`: every approve writer reaches arm 4 through that one function, in the
same statement run that flips the entry to approved, so arm 4 only ever sees an entry whose
`approved_at` is this transaction's instant. A caller reaching `_fa_on_approve` DIRECTLY would
not, and reds this cell. The OUTER rung of that ladder — `_subledger_on_approve`'s own caller set
— is `x41.a3`'s frontier-gated census and is deliberately not restated here. The behavioural half
is already driven by `p972.retro`, whose reversal runs `reverse_entry`'s own hook call inside the
same transaction. VACUITY CONTROL RUN (twice, before and after the cell was simplified to the
inner rung): a throwaway `clara._p972_vacuity_probe(uuid)` calling `clara._fa_on_approve` was
created on the lane rig, the cell went RED on the caller-set assertion (5 tests, 4 pass, 1 fail),
and the probe was dropped, its absence re-measured at 0 `pg_proc` rows, and the file re-run 5/5.

**`x41.s4` and the pre-0247 residue: the reproducible measurement.** On a long-lived rig the two
register rows the PRE-0247 body birthed survive — `clara.fixed_assets` forbids DELETE (CLR13) —
so `x41.s4` keeps reporting them as one unexplained difference per client at its settled as-of,
and #972 puts cleaning them out of scope. That made #972's AC5 green unreproducible, because it
was taken on a throwaway clone that was then dropped. The recipe, and the figure it produced,
re-taken 2026-09-20 on the lane rig and recorded here so the integrator can repeat it:

1. `create database clara_l04_s4fix template clara_l04` (a template copy, NOT a second
   from-scratch chain — no migration runs, so 0154's cluster-wide role census is untouched).
2. On the clone only: `alter table clara.fixed_assets disable trigger
   t_fixed_assets_immutable_0017`, `delete from clara.fixed_assets f using clara.clients cl
   where cl.id = f.client_id and cl.name like 'x41_b3%'`, then `enable trigger` again and
   re-read `pg_trigger.tgenabled` to prove it is back on (`O`).
3. Run `x41-round35-tie.test.mjs` and `x41-wave-d-a-fa.test.mjs` against the clone on the full
   gate chain, then `drop database clara_l04_s4fix`.

Measured: 2 rows deleted; **16 tests, 16 pass, 0 fail, 0 skip — `x41.s4` GREEN**, with
`ALLOWED_RED` untouched at its single `/^x41_r3_/` entry (the file is byte-identical to the
wave-2 base). The attribution is independently checkable on the lane rig itself without any
surgery: 14 `x41_b3_…` clients have been created there, and only TWO carry a register row — both
created at 04:36:37 and 04:37:42 on 2026-09-20, before 0247 first applied at 04:53:08. Every
`x41.b3` run since has birthed none, which is also what #972's own
`faRows(client).length === 0` assertion inside `x41.b3` now asserts on every run.

`fa-birth-watermark-preintegration-gate.mjs` is the package-wide sweep's escape
(`CLARA_ALLOW_MISSING_FA_BIRTH_WATERMARK=1`), registered in `packages/db/package.json`'s `"test"`
chain at its MIGRATION-order position (last, after `legal-enforcement-mode-preintegration-gate.mjs`,
0234). A FOCUSED run does not preload it and FAILS LOUDLY below 0247; final acceptance is exactly
that focused shape counting ZERO skips.

**The gate also covers one assertion in a cell older than it.** `x41.b3`
(`x41-wave-d-a-fa.test.mjs`) gained the post-reversal register re-look #972's AC2 asks for, and
that one `assert` is wrapped in `faBirthWatermarkEnforced()` — the inline half of the same gate,
which returns a boolean instead of calling `t.skip()` so the rest of the host cell still runs.

**Its clients are `p972_…`, outside the x41 family, on purpose.** Every fixture here is a
deliberate pre-enrolment shape, and `x41.s4` holds each EXPLAINED difference among `x41_…` clients
to an allow-list pinned at exactly one entry. Naming them `x41_…` would put pressure on that list;
the classification law is still the sweep's own, imported rather than restated.

**What 0247 changed about `x41.s4`'s reading of `x41.b3`, and why no allow-list moved.** Before
0247 the reversal birthed a phantom register row whose cost netted the GL out at the two earlier
as-ofs and left one UNEXPLAINED difference at the settled one. After it the register is empty, and
the difference the two earlier as-ofs now show is pre-enrolment GL the register can never hold —
which `x41.s4` classifies as an **A6 correction window** (derived from the data, not from a name:
an approved entry the GL still carries at that as-of whose approved mirror is dated LATER), a class
that has provably closed by the settled as-of and never reaches `ALLOWED_RED` at all. Both
allow-lists are therefore untouched by #972; `ALLOWED_RED` is still its single `/^x41_r3_/` entry.

A register row born by the PRE-0247 body does survive on a long-lived rig — the `fixed_assets`
immutability trigger forbids DELETE (CLR13) — so a rig that ran the defect keeps reading those
clients as one UNEXPLAINED difference at the settled as-of until it is rebuilt. #972 puts cleaning
them out of scope explicitly, and the count drifts run to run; it is not a number to quote.

## The depreciation leg-pairing fold (#973)

`fa-depreciation-leg-fold.test.mjs` is frontier-gated on the `fa_depreciation_leg_fold$` stem
(migration 0248) — never on a number — and shares `fa-depreciation-leg-fold-fixtures.mjs`, which
itself re-exports the whole `depreciation-history-fixtures.mjs` world (`p651Client`, `faWorld`,
`buyAsset`, `completeSL`, `liveAuthorityWithRef`, `previewRun`, `runManual`, …) rather than forking
a second copy of it: #973 changes nothing about what a preview or a run MEANS, only where the leg
pairing they agree on lives. Four `p973.*` cells: `p973.core.shape` reads the new routine
`clara._fa_depreciation_leg_pairing(jsonb)` off the catalog — owned by `clara_fn_owner`, `stable`,
SECURITY DEFINER, UNGRANTED (PUBLIC and every named application role denied EXECUTE) — the vacuity
anchor, red against 0227 alone; `p973.core.pairs` calls the routine directly (root, since it is
ungranted) with a synthetic charge set spanning TWO account pairs and asserts the four legs against
an independent, hand-computed expectation; `p973.callers.recut` re-reads both `_fa_run_period_core`
and `preview_depreciation_run` off the catalog and asserts each now calls the shared core, neither
still carries the raw duplicated fragment, and the fragment survives in exactly one clara function
afterwards; `p973.behaviour.two_pairs` is the behavioural proof at the public seam neither #651
cell reaches — #651's own `p651.preview.matches_run` uses a single account pair throughout, which
cannot tell "grouped by the pair" from "grouped by the expense account alone" — a client with two
chargeable assets under two different account pairs proves the preview's four legs, hand-computed,
and the run that follows posts the identical four.

**The two splices `_fa_run_period_core` already carried, and the mistake of forgetting them.**
Neither 0042 §S5.15d (the re-run admission gate, `clara._wdb_rerun_breach`) nor 0227 §E (the
locked-period wall, `clara._fa_assert_period_open`) re-declares `clara._fa_run_period_core` with a
`create or replace` in its own migration file — both install their change at RUNTIME, via a
`pg_get_functiondef` read plus a string-replace, so neither shows up in a plain `grep` of the
migrations directory for the function's name. A first draft of 0248 recut the poster against
0041's ORIGINAL file text alone and silently dropped both, which reddened `p651.period.closed_refused`
and `p651.census.rerun_gate` — an existing regression this ticket's own gates caught before it
shipped. Both are restored, in their original positions, and 0248's own tail (T.8, T.9) now proves
each survives independently: present exactly once, phrased identically, and ordered correctly
relative to the arithmetic and the first write, so a future recut of this body cannot lose either
silently again.

`fa-depreciation-leg-fold-preintegration-gate.mjs` is the package-wide sweep's escape
(`CLARA_ALLOW_MISSING_FA_DEPRECIATION_LEG_FOLD=1`), registered in `packages/db/package.json`'s
`"test"` chain at its MIGRATION-order position (last, after
`fa-birth-watermark-preintegration-gate.mjs`, 0247). A FOCUSED run does not preload it and FAILS
LOUDLY below 0248; final acceptance is exactly that focused shape counting ZERO skips.

**0227's own tail assertion T.13 is untouched.** An applied migration is immutable, and T.13 (the
normalized-fragment agreement it enforced by text comparison) is not this file's to edit. It still
passes at its own point in a from-scratch chain, against the pre-fold bodies the chain has built up
to that point; what replaces its JOB going forward is 0248's own tail (T.2–T.4).

## The fixed-asset particulars completion-wall fold (#976)

`fa-particulars-completion-fold.test.mjs` is frontier-gated on the `fa_particulars_completion_fold$`
stem (migration 0249) — never on a number — and shares `fa-particulars-completion-fold-fixtures.mjs`,
which itself re-exports the whole `depreciation-history-fixtures.mjs` world (`p651Client`,
`faWorld`, `buyAsset`, `completeWith`, `completeForWith`, `refuses`, `caught`, `reasonToken`, …)
rather than forking a second copy of it: #976 changes nothing about what a completion MEANS, only
where the wall it enforces lives. Four `p976.*` cells: `p976.core.shape` reads BOTH new routines
— `clara._fa_assert_completion_not_a_change(uuid,jsonb)` and
`clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)` — off the catalog, each
owned by `clara_fn_owner`, SECURITY DEFINER, UNGRANTED (PUBLIC and every named application role
denied EXECUTE), with the volatility its reads earn (`immutable` for the payload-only guard,
`stable` for the post-lock core) — the vacuity anchor, red against 0248 alone;
`p976.callers.recut` re-reads both `complete_fixed_asset_particulars` and
`_fa_complete_particulars_core` off the catalog and asserts each now calls BOTH shared routines,
neither still carries EITHER raw duplicated fragment (the change-class check and the
already-complete-onward check are censused independently), and each fragment survives in exactly
one clara function afterwards; `p976.wall.before_reserve` drives the PRECEDENCE 0227 wrote down
twice ("Refused BEFORE the op key is reserved, so a retry is clean") through both doors on two
shapes that can only answer it if the guard really does run first — a change-class payload
carrying an already-spent `op_key`, and a change-class payload naming an asset outside the client
— then re-reads both bodies to prove the guard's call offset precedes `clara._reserve_op`'s;
`p976.behaviour.already_complete_both_doors`
is the behavioural proof at the public seam NOTHING in this repo's existing suite ever reached —
measured: `grep -rln fa_particulars_already_complete packages/db/tests` before this ticket names
only the two fixture files that DEFINE the token string, never a test that drives the refusal
through either door. A client completes one asset through the human door, then a second completion
attempt on the SAME asset through the human door is refused `fa_particulars_already_complete`; a
second asset completes through the runtime door, then a second attempt on IT through the runtime
door is refused the same way — same code, same detail shape.

**Why the wall could not be lifted as ONE contiguous fragment, and why it is TWO routines.** The
two bodies' "already complete onward" text (the lifecycle check, the validator call, the
non-depreciable/residual bounds) sits immediately AFTER their "first completion is not a change"
check in BOTH bodies, but the text BETWEEN the two checks — `_reserve_op`, the firm-membership
check, the advisory lock, the select-for-update — is NOT identical (the human door resolves
`c := clara._human_ctx(...)` and reserves under a literal verb name with no DETAIL on its
CLR10/CLR11 refusals; the core takes `p_firm`/`p_actor`/`p_door` as arguments and carries a DETAIL
on the same two refusals). The fold therefore lifts TWO separate fragments — `FRAG_CHANGE_CLASS`
and `FRAG_ALREADY_COMPLETE` in `fa-particulars-completion-fold-fixtures.mjs`, copied from the
migration's own prestate/tail constants so a drift in either file is visible as a diff — into TWO
new functions, each called where its own fragment already ran. That is still exactly one place per
check, which is what #976 asks for.

**The first cut of this fold put both halves in the post-lock routine, and that was wrong.** The
change-class check reads nothing but the payload, and 0227 therefore anchored it ahead of
`clara._reserve_op` in both bodies and said why, twice, in its splice text: "Refused BEFORE the op
key is reserved, so a retry is clean." Folding it in with the post-lock half moved it behind the
reservation, the firm-membership check, the advisory lock and the row lock, and deleted the
sentence. Two observable consequences, both since MEASURED at the door seam and now driven by
`p976.wall.before_reserve`: a change-class payload carrying an already-spent `op_key` answered
CLR10 "op_key reused with different args" (because `_reserve_op` compares request hashes before
the wall ran), and a change-class payload naming an asset outside the client answered CLR11
`asset_not_found`. Both told the caller about a collision instead of about the mistake that is
theirs to fix. The transaction-rollback argument the first cut made is true and is not the point:
the refusal a caller SEES is a contract, and it had changed. 0249's tail T.2d now proves the
ordering off the catalog, by call offset, in both bodies.

`fa-particulars-completion-fold-preintegration-gate.mjs` is the package-wide sweep's escape
(`CLARA_ALLOW_MISSING_FA_PARTICULARS_COMPLETION_FOLD=1`), registered in
`packages/db/package.json`'s `"test"` chain at its MIGRATION-order position (last, after
`fa-depreciation-leg-fold-preintegration-gate.mjs`, 0248). A FOCUSED run does not preload it and
FAILS LOUDLY below 0249; final acceptance is exactly that focused shape counting ZERO skips.

## What counts as a person's instruction, for both authority doors (#977)

`authority-ref-human-instruction.test.mjs` is frontier-gated on the
`authority_ref_human_instruction$` stem (migration 0250). It is the estate's first CROSS-LANE
battery: it drives BOTH `clara.sign_depreciation_authority` (the fixed-asset lane, CLR38, ADMIN+)
and `clara.create_accounting_plan` (the plan lane, CLR10, BOOKKEEPER+) in one file, because #977's
whole claim is that the two stop holding two meanings for one word. It therefore imports each
lane's OWN world rather than building a third — `depreciation-history-fixtures.mjs` for the
fixed-asset half, `accounting-plans-fixtures.mjs` for the plan half — and both sit on the same
`rig-helpers.mjs` pool, so one `endPool()` closes it. `authority-ref-human-instruction-fixtures.mjs`
holds only what the cross-lane claim needs: the frontier gate, the two reason tokens, `refusedWith`
(a STRICTER assertion than `x41-fa-fixtures.mjs`'s `refuses`, which falls back to matching a token
anywhere in the message text — #977's claim is that two refusals are TOLD APART by their token, so
a cell that accepted the token in prose could not see the defect), and the catalog constants.

Six `p977.*` cells:

* `p977.sign.machine_task_refused` / `p977.plan.machine_task_refused` — a `wake` task (no author by
  construction) and an `autodraft` run that DOES carry a named author are both refused, at each
  door's own error class, with `authority_ref_not_human_instruction`; the authority stays
  `proposed` with no window floor and no recorded instruction, and no plan row is written. Each
  cell also drives a reference naming NO row, which still answers `authority_ref_unresolved` — the
  two tokens are the point.
* `p977.definition.shape` — the house shape cell for a new ungranted internal:
  `clara._authority_ref_refusal(text,uuid,uuid,uuid)` exists, `stable`, SECURITY DEFINER, owned by
  `clara_fn_owner`, `search_path` pinned, EXECUTE held by nobody (not PUBLIC, not
  `clara_authenticated`/`clara_runtime`/`clara_agent_ro`).
* `p977.definition.one` — the catalog census: both doors READ the shared definition, neither still
  carries its own inline chat-lane existence test, that inline test now survives in EXACTLY ONE
  `clara` function (`_accrual_plan_core`, the accrual lane's copy, which the owner's ruling
  deliberately leaves alone), and EXACTLY the two doors the ruling names read the one definition.
  Normalized in JS by the same rule 0250's tail normalizes `prosrc` in SQL, so the cell and the
  migration cannot disagree about what "the fragment" is.
* `p977.both.unauthored_chat_turn_refused` — the cell that forces the rule to be a CONJUNCTION:
  `clara.agent_tasks.created_by` is nullable for every kind, so a `chat_turn` nobody signed is
  refused too.
* `p977.both.person_instruction_accepted` and `p977.both.accounting_work_ref_unchanged` — the
  "unmoved" half. A `chat_turn` carrying an author still signs and still creates a plan, with the
  same receipts; an `accounting_work` reference is accepted by both doors exactly as before (and
  the cell reads `clara.accounting_work.initiator`'s NOT NULL off the catalog first, because that
  column is what the owner's ruling rests on), while another client's Work still resolves to
  nothing.

**The fixture that had to move.** `fa-authority-sign-compat.mjs`'s `mintChatTaskRef` minted an
`autodraft` task — the cheapest arm to mint while ANY kind resolved, and #651's own comment named
that as the residual this ticket closes. It now mints a `chat_turn` carrying an author, through a
real `clara.chat_sessions` row, which also removes the trigger-off fallback the old helper needed
for a not-yet-active client (a chat session only asks that its client be IN the firm).
`mintAgentTaskRef` beside it mints the four shapes the refusal cells need — `chat_turn` with and
without an author, `autodraft`, and `wake` (that last one as LABELLED fixture DML with the insert
trigger off for exactly one statement, inside one transaction, because a wake task's firm and
client are stamped FROM its intent's event and the cell needs the row to land on a named client).
`packages/runtime/tests/reconcile-fa.test.mjs` inlines the same change for the belt rig's own
signature.

`authority-ref-human-instruction-preintegration-gate.mjs` is the package-wide sweep's escape
(`CLARA_ALLOW_MISSING_AUTHORITY_REF_HUMAN_INSTRUCTION=1`), registered in
`packages/db/package.json`'s `"test"` chain at its MIGRATION-order position (last, after
`fa-particulars-completion-fold-preintegration-gate.mjs`, 0249). A FOCUSED run does not preload it
and FAILS LOUDLY below 0250; final acceptance is exactly that focused shape counting ZERO skips.

## The depreciation authority retired-read fallback (#979)

`fa-authority-retired-read.test.mjs` is frontier-gated on the `fa_authority_retired_read$` stem
(migration 0251) via `fa-authority-retired-read-fixtures.mjs`, which re-exports the whole
`x41-fa-world.mjs` world (`proposeAuthority`, `signAuthority`, `retireAuthorityVerb`,
`getAuthority`, `freshFaClient`, …) rather than forking a second copy of it — this ticket changes
a READ, not the shape of what gets written, so its clients need no ties out of the `x41_…` family
the way `fa-birth-watermark-fixtures.mjs` (#972) did for a deliberately pre-enrolment, defect-shaped
fixture. Four `p979.*` cells: `p979.none` pins AC1 (a client with no authority at all still reads
back a bare `authority: null`); `p979.retired` is AC2's behavioural proof — propose, sign and
retire one authority, then read it back through `clara.get_depreciation_authority` at the `viewer`
floor and assert its `status`, `retired_reason`, the now-populated `retired_by`, `retired_at` (to
the second, cross-checked against a direct table read cast to `epoch` so the assertion never
depends on the pg driver's own timezone parsing) and `authority_from`, all against the SAME row
read directly off `clara.fa_depreciation_authorities` as an independent source of truth;
`p979.recent` proves the fallback picks the MOST RECENT of two retired authorities, never the
first; `p979.preferred` is AC3/AC5 — a live authority still wins over an older retired one, and
its returned object carries NONE of the three keys the retired arm adds (asserted by key absence,
not by an empty value).

`fa-authority-retired-read-preintegration-gate.mjs` is the package-wide sweep's escape
(`CLARA_ALLOW_MISSING_FA_AUTHORITY_RETIRED_READ=1`), registered in `packages/db/package.json`'s
`"test"` chain at its MIGRATION-order position (last, after
`authority-ref-human-instruction-preintegration-gate.mjs`, 0250). A FOCUSED run does not preload it
and FAILS LOUDLY below 0251; final acceptance is exactly that focused shape counting ZERO skips.

No CONTEXT.md change: `retired` is already this estate's vocabulary (filings, counterparty
aliases), and 0251 coins no new domain term — it only widens which existing authority state one
existing read surfaces, matching #973's and #976's own conclusion for their sibling folds.

## `seeding-lane-retired.test.mjs` (0288, ticket 1012)

Five cells over the retirement of the prior-GL seeding lane. Frontier-gated on the LIVE CATALOG
through `seeding-lane-retired-preintegration-gate.mjs`: a package-wide run against a chain below
0288 SKIPS loudly, a focused run FAILS, and a PARTIAL cohort (some but not all of the three write
doors carrying the retirement marker) throws rather than skipping.

- `p1012.create.*` — `clara.create_seeding_batch`, driven through the runtime lane on a filed,
  verified, `prior_gl`-stamped document it would have ACCEPTED before: `CLR34` with
  `detail.reason = "seeding_lane_retired"`, no batch row, no `clara.op_receipts` row (the door
  refuses ahead of the reservation) and no `seeding.batch_created` event. A human caller still
  meets the privilege wall, not the new body — the retirement loosens no access.
- `p1012.deciders.*` — `clara.tick_seeding_proposal` and `clara.decline_seeding_proposal`, driven
  by a real ADMIN (the exact floor both doors used to enforce, so the refusal is the retirement and
  not an authorisation failure in disguise) against a planted OPEN proposal. Same code, same
  reason, byte-identical message on both; both proposals stay `proposed`, nothing is reserved and
  no `seeding.proposal_decided` event is appended.
- `p1012.closers.*` — `clara.cancel_seeding_batch` and `clara.complete_seeding_batch` still close a
  batch left open at the retirement, with the cancellation reason recorded verbatim and
  `complete`'s stats deriving `still_proposed` from the proposals nobody can decide any more. Both
  batches keep their proposal rows afterwards.
- `p1012.queue.*` — `clara.list_review_queue` emits NO `seeding_proposal` row for a client carrying
  two OPEN proposals in an OPEN batch, firm-wide and client-scoped, with an open question on a
  sibling client as the positive control so an empty result cannot be an envelope that returned
  nothing.
- `p1012.registry.*` — the seven `prior_gl` `document_capabilities` rows state the retirement in
  BOTH `basis` and `limits`, no row anywhere still carries `browser_entrance`, every `prior_gl`
  row keeps `business_operation = stored_only`, the registry publishes one version at or above 4,
  and every high-water mark agrees.
- `p1012.reads.*` — a planted batch and its proposals read back through a REAL per-role session
  under real RLS, with state, source binding, kind and payload intact, and a member of another
  firm reads none of it. The other half of the same claim is structural and cannot be measured
  from the catalog: 0288's own file text contains no `update`/`delete` against either relation,
  so history is not rewritten BY CONSTRUCTION rather than by counting rows.

**History is PLANTED, not minted.** After 0288 no door can create a seeding batch, so the
pre-retirement state these cells read is written by root INSERT — the same posture
`client-birth-wall.test.mjs` uses for a fixture whose creating door is out of reach. Every
ASSERTION still runs through a real door or a real per-role session.

`ninth-rowkind-seeding-proposal.test.mjs` is the other half: it now carries the row kind's story
from its birth at 0146 to its retirement at 0288 — no client produces the row, and the eight
surviving kinds its own fixtures can produce are each observed at the unchanged 31-key shape with
the three seeding-only columns null on every row. `wb-s-seeding.test.mjs` keeps only what survives
the lane (the `prior_gl` document kind, the facts gate, the structural negatives, the wiki ingest,
O8 row 13) and its header names every cell it lost and why.

No CONTEXT.md change: the retirement coins no domain term. `Opening source` still describes the
prior general ledger a firm receives, and the `business operation` entry's note that `prior_gl`
stays `stored_only` pending the Client Knowledge Base's own ingestion path is exactly what 0288
makes true rather than something it changes.

## `merge-alias-lane.test.mjs` (0289, #889)

Three cells over `clara.merge_counterparties`, the one door `0289_merge_alias_lane.sql` recuts.
Frontier-gated on a BEHAVIOUR rather than a structure — 0289 adds no catalog object, so the probe
is the body's own `sha256(prosrc)` — through `merge-alias-lane-preintegration-gate.mjs`: a
package-wide run below 0289 SKIPS loudly, a focused run FAILS.

- `p889.merge.human_lane` — one real merge, then read back: the residue alias row, BOTH identity
  revisions it produces (`alias_added` on the survivor, `merged` on the merged party) and the
  emitted `counterparty.alias_added` event all carry `recorded_via = 'human_ui'` and agree. Before
  #889 the first read `legacy_unknown` and the second `human_ui` for the same human act.
- `p889.merge.no_cross_tenant_oracle` — another firm's REAL counterparty ids and ids that exist
  nowhere get the SAME refusal (code, message and typed reason), so the door cannot be used to
  test whether an arbitrary uuid is live elsewhere in the estate; a same-firm, different-client
  pair still answers `CLR23 cross_client`.
- `p889.census.no_legacy_writer` — the closed-world census, run again here so drift is caught by
  the daily battery and not only at apply time. It is keyed on the SIGNATURE (an overload cannot
  hide inside a member), it inspects EVERY alias insert in each body rather than the first, and it
  reads the VALUE written at `recorded_via` rather than only the column name — a body that named
  the column and bound it to a variable used to pass. Its own parser is proved non-vacuous against
  a crafted body in the same cell.
