# @clara/db

Clara's PostgreSQL migrations, synthetic seeds, database tests, and backup/restore tools.
Product boundaries and the intended architecture live in [ARCHITECTURE](../../docs/ARCHITECTURE.md).

## Layout and commands

| Path | Purpose |
|---|---|
| `migrations/` | Ordered schema and function changes; applied files are checksum-verified |
| `seeds/` | Synthetic test data |
| `lib/` | Connection resolution and destructive-operation guards |
| `scripts/` | Migration, seed, reset, backup, restore and verification entry points |
| `deploy/` | Role, login, Storage and platform configuration outside the migration runner |
| [storage-battery/](storage-battery/README.md) | Allowed/denied battery for `deploy/storage-provision.sql` against a real Supabase Storage service |
| [tests/README.md](tests/README.md) | Database test prerequisites and isolation |

Run from the repository root:

```sh
pnpm --filter @clara/db migrate
pnpm --filter @clara/db seed
pnpm --filter @clara/db test
pnpm --filter @clara/db reset
pnpm --filter @clara/db backup
pnpm --filter @clara/db backup:full
pnpm --filter @clara/db restore:full --file /path/to/full-dump.sql
pnpm --filter @clara/db dr:selftest
pnpm --filter @clara/db dr:verify
```

This package is plain ESM. It has lint and executable tests, but no TypeScript build gate.

## Connections and destructive operations

Supply connection credentials through `DATABASE_URL`, `WORKFLOW_POSTGRES_URL`, or libpq
`PG*` environment variables. [lib/pg.mjs](lib/pg.mjs) resolves one target, rejects conflicting
URL/PG settings, and derives the child process's `PG*` environment for `pg_dump` and `psql`.
Do not put credentials in source or command arguments.

Use a disposable database for tests, seeds and resets. These operations require
`CLARA_ALLOW_DESTRUCTIVE=1`; non-disposable targets also require
`CLARA_DESTRUCTIVE_TARGET` to match the resolved `user@host:port/database` exactly.
The guard recognizes host/name patterns; it cannot establish that a local database contains
only disposable data. `reset` drops the `clara` schema, not the durable engine or platform schemas.
`migrate` applies to its configured target without an interactive confirmation.

Use PostgreSQL 17 client tools for this estate. Override `PG_DUMP`, `PG_DUMPALL` and `PSQL`
when PATH points at a different installation. An older-major `pg_dump` refuses a newer server.
[PostgreSQL documentation](https://www.postgresql.org/docs/17/app-pgdump.html)

## Migration and deployment behavior

The runner uses a session connection, a session advisory lock, and one transaction per migration.
Use a direct connection or session pooler. Transactions default to READ COMMITTED; the
checksum-keyed exceptions in [migration-atomicity.mjs](scripts/migration-atomicity.mjs) select
a different isolation level where required.

Applied migration bytes are immutable. Add a successor migration instead of changing the stored
checksum. Filenames must be `NNNN_name.sql`; the runner rejects late insertion below the applied
frontier. Files with no leading digit, including `UNNUMBERED_*.sql`, are silently skipped.
`CLARA_MIGRATIONS_DIR` selects an alternate chain and must be set correctly for a split test rig.

**Redo (#957).** Immutability is for *merged* history. A migration already applied to a rig but
not yet merged sometimes needs one more fix-round edit, and the ordinary path above correctly
refuses that on checksum drift. `redo`, passed to `migrate()` the same way `dir` is (or
`CLARA_MIGRATION_REDO=<version>`), re-applies exactly one such version as a guarded, measured
operation: it requires the same destructive guard `reset`/`restore`/`dr:selftest` already use
(`CLARA_ALLOW_DESTRUCTIVE=1` and a disposable or explicitly-named target), refuses a version that
is not currently applied or is not the *highest* applied version (so nothing built on top of it is
silently invalidated), then deletes its ledger row and re-runs the edited file in the same
transaction, under the same isolation/timeout/atomicity rules a normal apply uses. A failure
anywhere in that transaction rolls the delete back with it, leaving the ledger exactly as it was.
Write the redo target so re-running it against a database that already carries its OLD effects is
safe — `create or replace function`/`procedure` and other naturally idempotent DDL, not a bare
`create table`. This replaces the hand procedure (`SET ROLE clara_fn_owner`, re-run the body by
hand, repair the ledger row by hand) six wave-2026-09-18 tickets independently reinvented.

### From-scratch reapply on a reused cluster (#867)

Cluster roles (created by `create role`) are cluster-global, not per-database — `drop database`
never removes them. Migration
[0154_binding_proposal_pr_1.sql](migrations/0154_binding_proposal_pr_1.sql)'s tail pins the
cluster-wide `clara%` role count at the literal `14`, a measured proof that 0154 itself mints no
role. `0154` is applied and immutable; this section documents the hazard around it, it does not
change it. Three migrations after 0154 mint six more roles:
[0160_checkout_gate_c2_stripe_events.sql](migrations/0160_checkout_gate_c2_stripe_events.sql)
(`clara_stripe_webhook`, `clara_stripe_webhook_login`) and
[0163_checkout_gate_c3_folded_door.sql](migrations/0163_checkout_gate_c3_folded_door.sql)
(`clara_auth_wall`, `clara_auth_wall_login`) and
[0309_invite_preview_public_door.sql](migrations/0309_invite_preview_public_door.sql)
(`clara_invite_preview`, `clara_invite_preview_login` — #871's signed-out invite preview), each
guarded by `if not exists` so a normal single from-scratch chain only creates them once.

Re-applying the WHOLE chain from scratch into a **fresh database on a cluster that already ran the
chain once** hits those six leftover roles before it reaches 0154 again: the count already reads
`20`, not `14`, and 0154 raises `CLR10` — a cluster-reuse hazard, not a migration defect. (0309
names the roles it relies on rather than counting them: its prestate lists the eighteen chain-minted
`clara%` roles BY NAME and merely RECORDS the cluster-wide count, so its own tail can prove a delta
of exactly two. An absolute count there would have been wrong on any live project — hosted also
carries `clara_storage_docs`, from `deploy/storage-provision.sql`, which the chain never mints — and
the first cut of 0309 did pin one; the adversarial round measured it aborting on a hosted-shaped
census, 2026-09-24.)

**Preferred:** one from-scratch chain per cluster (a fresh disposable Postgres cluster, or a fresh
container/instance). [tests/README.md](tests/README.md) states the same rule for the test rig.

**If a cluster must be reused** (the same single working database is being wiped and re-migrated,
so nothing else on the cluster still depends on the four roles once the old database is gone):
[scripts/role-census-reset.mjs](scripts/role-census-reset.mjs) automates it —

```sh
node scripts/role-census-reset.mjs           # --check (default, read-only): reports whether a
                                              # from-scratch reapply would pass 0154 today, and
                                              # names anything on the cluster still depending on
                                              # one of the four roles (pg_shdepend, cluster-wide)
CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs --apply   # drops exactly those four
                                              # roles, and ONLY if none of them has a live
                                              # dependent anywhere on the cluster; otherwise it
                                              # refuses outright (never a partial drop) and names
                                              # what to `drop owned by <role>` first
```

The exact statements it runs, for the record (base role before its `_login` twin — the order
`rolesMintedAfterPin()` reads off the migration files, `apply()` iterates, and
`role-census-reset.test.mjs`'s "rcr.mint against the REAL migrations directory" cell pins):
`drop role clara_stripe_webhook; drop role clara_stripe_webhook_login; drop role
clara_auth_wall; drop role clara_auth_wall_login; drop role clara_invite_preview; drop role
clara_invite_preview_login;` — after which a from-scratch chain is
**expected** to pass 0154's census (14) and let migrations 0160/0163/0309 recreate the six roles
fresh partway through the same chain (back to 20). **Verified end to end (2026-09-20)**, on the
chain as it stood then — 229 files, four post-pin roles, 18 live; #871's 0309 adds the fifth and
sixth without changing a line of the recipe, because the script derives its roster from the
migration files themselves: a
genuinely separate, disposable PostgreSQL 17 cluster was provisioned for this proof alone —
`sudo pg_createcluster 17 l04chk --port=55799`, `pg_hba.conf` edited to the same trust lines this
rig's own lane clusters carry — never RIG.md's shared lane cluster at 55744, so its "never run a
second from-scratch chain on your cluster" rule was not touched. First pass:
`createdb clara_scratch1` then `node scripts/migrate.mjs` — 229/229 applied, target
`0234_legal_enforcement_mode`, clara% role count 18. `clara_scratch1` was then dropped
(`drop database clara_scratch1`) so nothing on the cluster still depended on the four roles —
this recipe's own stated precondition ("the same single working database is being wiped ...
so nothing else on the cluster still depends on the four roles once the old database is gone"),
confirmed with `node scripts/role-census-reset.mjs` (read-only): both base roles read "no shared
dependents" once the old database was gone. `CLARA_ALLOW_DESTRUCTIVE=1 node
scripts/role-census-reset.mjs --apply` then dropped exactly the four roles, cluster at clara% = 14
(0154's pin, exact match). A fresh `createdb clara_scratch2` plus a second
`node scripts/migrate.mjs` — the from-scratch reapply on a cluster that already ran the chain
once, which is exactly what AC1 asks for — completed 229/229 with no CLR10 and no other error,
`clara.schema_migrations` reading `count=229, max=0234_legal_enforcement_mode`, and the live
clara% role count back at 18 exactly as this recipe predicts. `clara_scratch2` was dropped and the
whole disposable cluster removed (`pg_dropcluster --stop 17 l04chk`) immediately after; this lane's
own `clara_l04` was never touched by any step above (`schema_migrations` read `count=229,
max=0234` before and after, unmoved) and RIG.md's ten lane clusters stayed online throughout.
**#867's AC1 is closed on this record**: the recipe was correct all along; what earlier rounds
lacked was a cluster with the chain to spare, not a working fix, and `pg_createcluster`/
`pg_dropcluster` (from this host's already-installed `postgresql-common` package) supplies
exactly that without needing a second physical machine. The script reads 0154's pinned literal and the
post-0154 role manifest from the migration files themselves (never a hand-kept copy), so a future
migration minting another role is picked up automatically — #871's 0309 is the first one that did,
and it needed no edit here beyond this paragraph's arithmetic. Verified on this package's own rig
(`packages/db/tests/role-census-reset.test.mjs`): the live cluster's count (20) minus its six
minted roles matches 0154's pin (14) exactly, and dropping/recreating the two `_login` roles
(no direct grants, membership only) round-trips cleanly with the checkout-gate-c2 (18/18) and
checkout-gate-c3 (69/69) batteries re-run green afterward. The two base roles
(`clara_stripe_webhook`, `clara_auth_wall`) stay blocked on any rig that still has a live
checkout-gate lane, by design — that lane's own table grants are the dependents `DROP ROLE`
correctly refuses on, and the script reports that refusal by name rather than guessing past it.
The dependent-check (`sharedDependents()`) sees a SHARED-object dependency (a grant directly on a
database or tablespace, `pg_shdepend.dbid = 0`) as well as a per-database one, so `apply()`'s
"never a partial drop" contract holds even for that shape (L04B-SPEC-05; latent on today's rig —
`role-census-reset.test.mjs` proves it against a planted `GRANT ... ON DATABASE`, not a live
dependency this cluster happens to carry).

Read the repository frontier from `migrations/` and the target frontier from:

```sql
select count(*), max(version) from clara.schema_migrations;
```

That ledger is the only statement of what has landed. A migration body that ran to completion,
a `raise notice ... OK` tail, and a green `migrate` exit each describe one attempt; the row in
`clara.schema_migrations` describes the target. A green chain is not a landed frontier.

Before deploying a change to an active writer body, stop new writes and drain in-flight calls,
apply the migration, then resume. Calls already executing can finish on their previous body.
A changed function named in `clara.control_witnesses` must receive the matching reviewed
`prosrc_sha` in the same migration, or its dependent gate refuses.

A migration can invert that order, so read its header before applying it. Not every migration
carries one: [0178_accounting_work_journal_successor.sql](migrations/0178_accounting_work_journal_successor.sql)
states in its header that it owes **no** consumer-first obligation, and why — every object it adds
is new, no deployed lane produces or consumes the `accounting_work` task kind until its own
admission verb is called, and the one live body it replaces (`clara._tf_assert_agent_post_receipt`)
is replaced with a strict widening, so nothing legal before the migration becomes illegal after it.
It still rides the writer quiescence window for function-body replacement, because a call already
executing finishes on its previous body.
[0177_classify_after_extraction.sql](migrations/0177_classify_after_extraction.sql) requires the
extraction-aware facts_gate consumer ([../runtime/lib/facts-gate.mjs](../runtime/lib/facts-gate.mjs))
to be deployed before the migration is applied, so a `document.extraction_completed` event emitted
during the cutover cannot be checkpointed as irrelevant and leave the document waiting. It also
refuses the cutover while any pre-cutover classify task is still claimable without a successful
extraction, and its rollback is a new append-only recovery migration applied while that consumer
stays live. The hosted rollout applied it in that consumer-first order inside the quiescence window.

**Pinning another function's body hash is a named convention in this file, not one migration's
habit — record it here rather than let each instance read as its own idea.** When a migration
CALLS a function it does not itself recut, and some part of its own safety argument, its granted
ACL, its returned shape or an excluded value depends on that function's CURRENT body, it pins a
pre-image `sha256(prosrc)` of that body: measured on a migrated rig by reading `pg_proc.prosrc`
through `to_regprocedure`, never transcribed from the creating migration's file text, and asserted
again, unchanged, in its own prestate (before touching anything) and usually again in its tail
(after). That pin is a durable COUPLING placed on a function this migration does not own. **The
rule it creates: a later migration whose OWN NUMBER is BELOW the pinning migration's, and which
recuts the pinned function, must locate every existing pin on that function and re-measure each
one against the function's NEW body, in the SAME COMMIT as the recut** — the pin does not update
itself, and only the migration that changes the body can know whether the pinning migration's
argument still holds against the new one. The qualifier matters because this repo assigns
migration numbers per lane in advance, so they can land out of chronological order: "a later
migration" means one whose number is still below the pin's, not merely one applied after it in
git history.

A recut whose own number is ABOVE the pinning migration's is a different case, not this rule's
obligation: the pinning migration is already APPLIED, and this house never edits an applied
migration to make it re-measure a body that postdates it. Such a recut pins its OWN pre-image of
the function instead (in its own prestate and tail, the same convention, argued from its own safety
case) and leaves the earlier, lower-numbered pin exactly as it was — historical, not current, and
never re-measured, because it was never wrong: it correctly pinned the body that existed at ITS
number.
[0234_legal_enforcement_mode.sql](migrations/0234_legal_enforcement_mode.sql), documented further
down this file, is the worked example: it recuts `clara._accounting_work_egress_live(uuid,uuid)`,
one of 0233's three non-regression pins named below, but 0233 is applied and unedited — 0234 pins
its own pre-image of that function instead (0234's "THE SIX PINS", four of them its own recut
pre-images) and 0233's pin stands, describing 0233's own moment, not 0234's.

The failure this coupling exists to produce is quoted here in its most common shape, but several
raise wordings coexist across the estate and NONE of them settled the phrasing once and for all —
`0233`'s three non-regression pins below read **`<name> has DRIFTED from its pinned body -- <reason>`**,
while `0222` (right after `0221`) raises **`<name> has DRIFTED from the pinned NNNN body`** on all
six of its own pins, and `0228` raises **`<name> has DRIFTED from its measured live body`** on all
thirteen of its own. `0231` carries BOTH shapes in one file (four `its pinned body`, one `the pinned
0189 body`), so "settled from 0221 onward" is not a claim this file can make. The one invariant
across every wording is the phrase **`has DRIFTED`**: `grep -rn "has DRIFTED"
packages/db/migrations/` finds every instance regardless of which noun follows it. 0214 below reads
`has DRIFTED from the pinned 0189 body` — a numbered form, like several others, not a "first"
anything; migrations as early as 0107 already raise on a drifted pin. Either way it means the LIVE
function no longer hashes to the sha the pinning migration recorded. Two readings, and the pinning
migration cannot tell them apart on its own:
either an intervening migration recut the pinned function and never re-derived this argument
against the new body (the pin did its job — go re-measure it, in the recutting migration's own
commit, before this one can be trusted again), or the pin was wrong from the start. Either way the
check fires from the PRESTATE, before the migration changes anything, and fails CLOSED: a drifted
pin blocks the migration rather than letting it apply against a body its own stated reasoning no
longer describes.

The instances DOCUMENTED below are findable by the pinned function's name — for example
`clara._work_run_attempts` (0214, immediately below, and again in 0231's five pins) and
`clara.list_review_queue` / `clara.list_accounting_work` / `clara.get_client_work_pack` /
`clara.list_activity` (0231). 0233's own three non-regression pins are named where 0233 is
documented, further down this file. This is NOT a complete index of every migration that pins a
function it does not itself change — 0178, 0182, 0183, 0184, 0189, 0194, 0195, 0197, 0202, 0203,
0204, 0209, 0212, 0213, 0215, 0216 and others carry the same convention and are not named here. The
authoritative, complete list is the migrations themselves:
`grep -rn "has DRIFTED" packages/db/migrations/`.

[0214_client_work_pack.sql](migrations/0214_client_work_pack.sql) owes **no** consumer-first
obligation either, for a narrower reason: it adds exactly one SECURITY INVOKER read door,
`clara.get_client_work_pack(p_client, p_preview)`, grants EXECUTE to `clara_authenticated` alone,
and creates no relation, column, policy, index or trigger and recuts nothing. Its only consumer is
a new browser module ([../../apps/web/lib/work/client-work-pack.ts](../../apps/web/lib/work/client-work-pack.ts)),
which cannot call a function that is not there yet. It keeps ONE prestate pin — a pre-image
`sha256(prosrc)` of `clara._work_run_attempts` — not because it recuts that body but because it
CALLS it and its own safety argument depends on that helper's 101-id ceiling and its in-body
bookkeeper floor; the pin is what forces a later recut of the helper to re-derive this door's
argument rather than discover it at 102 running Works.

[0231_firm_portfolio_pack.sql](migrations/0231_firm_portfolio_pack.sql) owes no consumer-first
obligation for the same narrow reason, one altitude up. It adds exactly TWO read doors and nothing
else — no relation, column, policy, index or trigger, and no recut.

`clara.get_firm_portfolio_pack(p_limit, p_cursor, p_preview)` is SECURITY INVOKER over
`clara.clients`, `clara.accounting_work` and `clara.operation_receipts` (all three already granted
to `clara_authenticated` behind forced firm-scoped RLS), floored at bookkeeper by 0189's own three
inline predicates restated in the body — the idiom every INVOKER door in this estate uses, because
an INVOKER body cannot call the ungranted `clara._human_ctx`. EXECUTE goes to `clara_authenticated`
alone; `clara_runtime`, the agent role and both wake roles gain nothing. The firm comes from
`clara.jwt_firm()` and there is no client argument at all, so the only channel a client identity can
enter through is the `lower(name)|uuid` pair inside `p_cursor` — which the body compares as a SORT
KEY and never resolves against the register. A cursor naming another firm's real client and one
naming an invented pair answer identically (`p659.portfolio.cross_firm`), which is deliberately
UNLIKE `clara.list_review_queue`: that door takes an explicit client scope and raises CLR10 off a
cross-firm existence probe. The preview ids are assembled across the whole page and **cut at 101**
before `clara._work_run_attempts` is called, because at firm altitude 100 clients x 5 preview ids
would exceed that helper's ceiling and make the whole board refuse in order to report a row label;
rows past the cut carry 0214's own `retry_label_preview_only`. **The tail asserts, from `prosrc`,
that the body names no money or sum key anywhere — in code or in comment** — because Firm Home
consolidates no client figures and a portfolio table is the easiest place in the product to reduce
rows into a false cross-client one.

`clara.get_compliance_watch_disposition(p_watch)` is SECURITY **DEFINER** for one reason, and the
tail proves it: `clara.compliance_watches` and `clara.compliance_watch_events` FORCE RLS with a
single `clara_fn_owner` policy and **no application role holds any privilege on either**, so an
INVOKER body would see nothing. It grants nothing on either relation. It returns no revision
number, because the table carries none — each event's `state_before -> state_after` is what the
receipt names instead. Measured on clara_659 after 0231: the only non-owner privilege on either
relation is 0131's `clara_freeform_ro` SELECT on the watch table (the freeform analytics identity,
which reaches no PostgREST surface); the event trail has no non-owner grantee at all.

Its five prestate pins recut nothing — `clara.list_review_queue`, `clara.list_accounting_work`,
`clara.get_client_work_pack`, `clara._work_run_attempts` and `clara.list_activity` are read-only
dependencies, pinned so that "0231 recut nothing" is a checked fact and so a later recut of any of
them has to re-derive this door's arguments. **No supporting index is owed, and that is a
measurement**: on a seeded 300-client / 20 100-Work firm the client page plans `Index Scan using
uq_clients_firm_name` (102 rows, 7 buffers, 0.080 ms) with only an *Incremental* Sort above it, and
the per-client aggregate plans `GroupAggregate` over `Index Scan using uq_accounting_work_intent`
(6 700 rows, 2.3 ms; 4.7 ms for the whole join). No sequential scan appears anywhere. End to end the
door answers a 100-client page in 17-18 ms at `p_preview=3` and 7-8 ms at `p_preview=0`.

Three sentences in 0231's own header are sharpened here rather than in the file, which is
append-only. **The disclosure token `onboarding_client_excluded_from_queue`** covers `onboarding`
**and** `archived` because the 0017 join excludes both, but its only door-reachable subject today is
the ARCHIVED client — `clara.admit_accounting_work` refuses a client that is not `active`, so an
onboarding client cannot accumulate Work in the first place.

**`p_preview = 0` really does call `clara._work_run_attempts` zero times, and it is now COUNTED
rather than asserted.** The header says so; the body comment beside the join says the helper is
"reached with no ids rather than with a null", and the two read as a contradiction. They are not,
and the resolution is worth writing down because it is not obvious from the text: the argument
handed to the helper is an EMPTY array and never a NULL one (which 0189 refuses), and *separately*
the helper is not executed at all, because `v_preview_ids` is empty, the outer scan over
`clara.accounting_work` yields no rows, and the inner function scan of a nested loop never runs.
That zero is therefore a PLAN SHAPE rather than a guard in the SQL — which is exactly why it is
measured: `p659.portfolio.preview_zero_calls_helper_zero_times` counts the calls through
`pg_stat_user_functions` with `track_functions='all'` and `pg_stat_force_next_flush()` (0 across a
`p_preview=0` call, 1 across a `p_preview=3` call). The empty-never-null argument is what keeps the
door correct if a future plan shape ever does execute it.

**The cursor grammar depends on a non-blank client name**, and a later lane that adds a rename door
needs to know it. The mint is `lower(name)||'|'||id` and the decode raises CLR10 `invalid_cursor`
when the name component is blank, so a client whose name were whitespace-only would mint a cursor
the door then refuses, dead-ending paging at that row. It is unreachable today — `clara.create_client`
refuses a blank name (CLR10) and there is no rename door anywhere in the estate, so
`clara.clients.name` cannot become blank after birth through any door — which is why 0231 carries no
guard for it. A rename door must refuse a blank name, or this fence must move.

Two sentences in 0214's own header are corrected here rather than in the file, which is
append-only. **The planner does not use `ix_accounting_work_client` for the active facet.** Forced
RLS adds `firm_id = clara.jwt_firm()` to every read of `clara.accounting_work`, which makes
`uq_accounting_work_intent (firm_id, client_id, intent_key)` the better leading prefix. Re-measured
as a bookkeeper with RLS in force on the #650 rig (1,317 `accounting_work` rows, 81
`operation_receipts`; probed client with 102 active): the active facet plans `Bitmap Heap Scan ←
Bitmap Index Scan on uq_accounting_work_intent`, `Index Cond ((firm_id = clara.jwt_firm()) AND
(client_id = …))`, 0.45 ms; the recent-success facet plans `Index Scan using
ix_operation_receipts_client` with the half-open MYT range in the Index Cond (0.05 ms), and
`Bitmap Index Scan` on the same index for a client that has receipts (0.08 ms). Neither degrades to
a sequential scan, so the header's CONCLUSION — no new index is owed — stands; its attribution and
its "measured on a rig cohort before this file was written" clause are superseded by that later
measurement. The receipts cohort is small, so that leg is a structural result (the index condition
matched) rather than a load measurement.
**And the recent-success drilldown is the same WEEK over a different SUBJECT.** The tile counts a
committed `clara.operation_receipts` row inside the seven Malaysian dates; the list its number
opens, `clara.list_accounting_work`, fences `p_since`/`p_until` on
`clara.accounting_work.created_at` — when the Work was admitted (0189:427-428) — because that door
has no receipt-dated axis and this wave recuts nothing in 0189. The two populations therefore
diverge in exactly two ways, both pinned by `tests/client-work-pack.test.mjs`
`p650.pack.recent_success_drilldown`: a Work admitted before the window and posted inside it is
counted and not listed, and a Work admitted and completed inside the window with no receipt is
listed and not counted (the second is the population the door already names through
`uncounted_completions`); a Work admitted and posted in the same week is in both. The board
discloses this beside the number rather than implying the list is the tile's own population.

[0222_accrual_adjustments.sql](migrations/0222_accrual_adjustments.sql) (#652) owes no
consumer-first obligation and states why in its header: every object it adds is new, it recuts
nothing, and it re-hashes the six 0193 plan-lane bodies it depends on in its own tail so a stray
`create or replace` reds the migration rather than shipping. It rides `kind='reversing_journal'`
rather than minting a plan kind or an `accounting_work` purpose — an accrual occurrence is admitted
by `clara._plan_admit_occurrence` exactly as every other occurrence is, with `adjustment_basis`
NULL, and its typed particulars live in `clara.accrual_adjustments`, keyed by `(plan_id, revision)`
so the durable record behind a due event is the same one whether the configuration door or the
runtime scan admitted it. Its one foreign reference without a composite key —
`document_service_period_id` into 0140's `clara.document_service_periods`, which carries no
`(id, firm_id)` unique — has its tenant and its document proven by
`t_accrual_adjustments_term_congruent` instead, because adding a unique to a foreign table is
outside a slice migration's remit and its tail asserts that relation's constraint count is
unchanged against a value its own prestate MEASURED (never a transcribed literal, which would
assert a property of the chain below it rather than of this file).

Three of its rules are worth knowing before reading the doors. `effective_to` is
NOT NULL and `ck_accrual_adjustments_window_in_term` requires the authority window to sit inside the
stated service period, so every occurrence posts a date INSIDE the term its own journal line names —
0193's `_plan_window_ceiling` already lifts an auto-reversing plan's ceiling to the reversal of
`effective_to`, so an authority ending on its last accrual can still be undone. A third rule lives
in the doors rather than in the relation: `clara._assert_accrual_schedule_yields` asks the plan
lane's own date arithmetic (`clara._plan_due_events`, called and never recut) whether the schedule
reaches one accrual date inside `[effective_from, effective_to]`, and refuses
`accrual_schedule_yields_no_occurrence` when it does not — a term shorter than one period of its own
schedule was otherwise accepted in full and could never post. It names the day rule, not the term:
the same term with a day that falls inside it configures. The PLAN lane's own door still accepts a
plan that reaches nothing; that relation is #640/#653's and this file only pins it. And the `method`
CHECK admits exactly one selection rule (`stated_amount`), because exactly one is performed: the
configuration freezes the stated amount into the plan revision's basis and
`clara._plan_occurrence_basis` only moves the posting date. Three further rules were drafted and
would each have posted the same cents; they are a successor residual, and widening that CHECK is the
migration that must arrive with the lane that honours them.

Rebuilding a target from the migration chain and restoring a dump are different operations.
A full replay creates login shells as NOLOGIN; restore the intended LOGIN state and credentials
afterward and probe every configured runtime lane. Existing platform roles can also collide
with historical migration census assertions. A green local chain does not prove that a live
cluster can be replayed without a target-specific preflight.

## Collation and pinned order (#1047)

**The house rule.** A value that is **pinned** — compared against a literal, or digested and
compared against a digest literal — and that was produced by an aggregate **ordered by a text
expression** must spell `collate "C"` on that ORDER BY. Without it the pin records the server's
`lc_collate`, not the data.

Under glibc's `en_US.UTF-8` — CI's `postgres:17` container and hosted Supabase — punctuation
carries no primary weight and case is not a primary weight either, so `taxation` sorts **before**
`tax_liabilities` and `clara_x` before `PUBLIC`; under `C`, which is defined by code point, both
sort the other way round. 0295's first cut pinned a digest over rows ordered that way, was green on
every `C.UTF-8` rig, and stopped the chain on CI (run 35954298990). Its own section below records
that fix; this section is the rule the estate follows from now on.

**Most ORDER BYs do not need it, and the reason is the TYPE, not luck.** PostgreSQL's `name` type
carries collation `C` in the type itself, so a census ordered by a catalog identifier —
`proname`, `relname`, `conname`, `tgname`, `polname`, `rolname`, `attname`, and
`information_schema`'s `grantee` / `table_name` / `column_name`, which ARE `name` — sorts by code
point on every server. So does an expression that merely *contains* one: a `name` cast to `text`
keeps `C`, and in `proname || '=' || <text>` the `name`'s non-default collation wins over the
default (0020:2304's ACL pin has always been portable for exactly this reason).

These do NOT keep it, and are the shapes to look at:

| shape | collation | why |
|---|---|---|
| `oid::regprocedure::text`, `::regrole::text`, `::regclass::text` | database default | `reg*` carries no collation, so the cast takes the default |
| `privilege_type` | database default | `information_schema.character_data` is a domain over `character varying`, not over `name` |
| `aclitem::text` | database default | same |
| any ordinary `text` / `varchar` column (`family_key`, `account_code`, `wake_kind`, …) | database default | |

`select pg_collation_for(<expr>)` answers this on the live server for any expression; it is what
`tests/collation-pin-portability.test.mjs` measures rather than asserting from memory.

**Two verdict shapes, not one.** The estate writes a set verdict either as a joined literal
(`v_txt <> 'a,b'`) or as an **array constructor** (`v_keys is distinct from array['a','b']`).
Both pin the ORDER equally hard, because an array is ordered; 0132:1545/1549, 0220:960/965,
0038's six token censuses and thirty more sites use the second shape.

**The record and the guard.** `tests/collation-pin-scan.mjs` holds `RECORDED_SITES`: every pinned,
text-ordered site the scanner finds in `migrations/` and `tests/` — **99 movable keys over 56
files, of which 61 keys in 34 applied migrations**, each with the reason it cannot flip. Applied
migrations are never edited, so for those the entry is the proof.
`tests/collation-pin-scan.test.mjs` scans the corpus on every run and refuses a site the record
does not hold, naming the file and saying what to write; it needs no database, so it runs on every
leg. A NEW site is fixed with `collate "C"`, never added to the record.

The record is only as complete as the instrument, and #1047's own adversarial round proved that
twice over. Its first cut read **66 keys over 37 files**: it recognised a verdict only when the
right-hand side began with a quote (so every array verdict was invisible), and it hard-freed the
bare aliases `k`, `n`, `i`, `o` and every `%_id` spelling (so a `jsonb_object_keys(...) k` TEXT
alias looked like an integer, and `stripe_session_id` / `trace_id` / `run_id` — about forty TEXT
`%_id` columns in `clara` — looked like uuids). Both blind spots are closed, and the free `%_id`
list is now a short closed list that
`collation-pin-portability.test.mjs` re-measures against the live catalog.

**The live proof, taken on BOTH collations.** `tests/collation-pin-portability.test.mjs`
re-measures, on whatever server the suite runs on: it builds a comparator (the real glibc
`en_US.UTF-8` where the OS has the locale, otherwise an ICU `ka-shifted` collation), makes it prove
it reorders 0295's own pair, and then orders each recorded site's live value set under both `C` and
that comparator. Where a site's
subject no longer exists at the head of the chain — 0038's four document CHECK censuses were
renamed by a later migration, and a tail runs against the schema at its OWN point in the chain —
the battery instead re-orders the **array verdict the migration carries in its own text**, read
back out of the file by the scanner rather than hand-copied. 33 such verdicts are proved today.

Both legs have now been run, which is what #1047's own AC2 and AC4 ask for and what the estate had
never had:

| leg | cluster | result |
|---|---|---|
| `C.UTF-8` | the lane rig, rebuilt from scratch by the #867 recipe | 313/313 applied `0001` → `0350`; a second `migrate` reports 0 new and no drift; the batteries green with an ICU `ka-shifted` comparator |
| **glibc `en_US.UTF-8`** | a disposable cluster stood up for the purpose (`pg_createcluster … --locale=en_US.UTF-8`), used and dropped | **313/313 applied from scratch**, then `collation-pin-portability` + `collation-pin-scan` 21/21 green with the REAL `provider = libc, locale = 'en_US.UTF-8'` comparator — measured: it creates, and it reorders 0295's pair (`taxation` before `tax_liabilities`) while `C` does not |

The second row is the stronger of the two, and not only because the locale is the named one. On
that cluster the DATABASE default IS `en_US.UTF-8`, so the battery's "this server's default
ordering already differs from C" control was itself taken under glibc and still passed at every
recorded site — i.e. every ordering the estate pins is identical under `C` and under the collation
CI and hosted Supabase actually run. A rig whose default is `C.UTF-8` cannot say that.

**Portable today, fragile by construction.** The orderings the estate pins do not move — but the
name space they draw on does. Measured on the lane rig at 309 migrations:
`clara.bank_accounts`' index names already sort differently under the two collations
(`uq_bank_accounts_id_firm_client` against `uq_bank_accounts_identity_active`, because `_` sorts
before `e` under `C` and carries no primary weight under the other). Nothing pins that relation's
index names today. One new `clara._x` landing beside an unprefixed `clara.x_y` does the same to a
function census, which is why the rule is a rule and not a case-by-case judgement.

The same measurement, widened in the fix round, shows how close the hazard sits to what IS pinned.
Take the quoted tokens of **every** `clara` CHECK constraint and sort them under both collations
and they DO move — `cancel_requested` against `cancelled` in `agent_tasks_status_check`, `op_key`
against `open` in `clara._abandon_close_core`'s own body. The sets the estate actually pins escape
only because none of them happens to hold such a pair. That is luck with a guard around it, not
safety, and it is why a new census writes `collate "C"` instead of being reasoned about.

## Member doors: the lock order other migrations depend on

`clara.set_member_role`, `clara.remove_member` and `clara.revoke_invite` take `clara.firms` (or a
firm-qualified row lock) **before** the member or invite row, and they must keep doing so. That
order is not a local convenience: `clara._record_journal_entry_core` takes `clara.firms … for key
share` *because* of it — the alternative was a measured `40P01` deadlock between a posting
transaction and a role change
([0194_periodic_adjustments.sql](migrations/0194_periodic_adjustments.sql) `:1461-1470`) — and that
core is sha-pinned at `0194:192-195` and `0195:396-400`. A future recut that reverses
firms-then-row is therefore a deadlock regression against a pinned body, not a style change.

[0224_preview_invite.sql](migrations/0224_preview_invite.sql) adds `clara.preview_invite(p_token)`,
the read an invited person makes after signing in and **before** setting a password, so the invite's
firm, role and effective status are visible before the workspace. Deployment notes: it creates one
SECURITY DEFINER function granted to `clara_authenticated` only, recuts **no** body (its §0 pins the
five member doors and `clara._jwt_email()` by pre-image `sha256(prosrc)` and its §C re-reads the same
six), adds **no** grant on `clara.firm_invites`, and takes **no** row lock of any kind — so it owes
no writer-quiescence window and cannot join the lock order above. Its refusal is deliberately ONE
shape for three different facts (unknown token, real token / wrong signed-in address, session with
no verified address), because distinguishing them would rebuild the existence oracle
[0141_p4_tranche1_invite_rbac.sql](migrations/0141_p4_tranche1_invite_rbac.sql) §B closed.

[0269_invite_issuer_lapsed_status.sql](migrations/0269_invite_issuer_lapsed_status.sql) (#872, riders
wave 2 lane 10) RECUTS TWO bodies above rather than creating a new one: `clara.firm_invites_visible`
(0141 §H) and `clara.preview_invite` (0224 §A) each gain ONE new `WHEN` arm in the status `CASE`
expression they already shared, so a still-`pending` invite whose issuer's CURRENT active
`clara.firm_memberships` rank is below `clara.role_rank('admin')` reads `issuer_lapsed` on BOTH
reads instead of `pending` — reversibly, with no write anywhere. `clara.accept_invite`'s own
issuer-rank wall is untouched and re-pinned byte-for-byte at the tail, the same layered-pin
discipline 0234 uses for a body it does not itself recut. No new function and no new grant: the
shared arm is a correlated subquery against `clara.firm_memberships`, not a standalone helper —
MEASURED on this rig that a view referencing a `SECURITY DEFINER` function still needs the querying
role's own `EXECUTE` grant (Postgres checks it against the invoker, never the view owner, for every
function a view's body names), so a bare `(firm_id, user_id) -> rank` helper granted to
`clara_authenticated` would have been a cross-tenant membership oracle, the exact class
`clara.shares_my_firm_human`/`_wake` (0002:453-465) exist to avoid. See the "CLOSED by #872" note
above for R1's supersession.

[0225_trade_invoices.sql](migrations/0225_trade_invoices.sql) adds the trade-invoice lane (#655):
`clara.trade_invoices` (the typed business object — one counterparty, the document's own date, the
due date **and the basis it was decided on**, an exact positive total in sen, opaque tax facts) and
its append-only status ledger `clara.trade_invoice_status`. Both are FORCE-RLS with **zero**
application-role DML and tenant-carrying composite FKs throughout. The object admits **no** update
at all — the entry, the receipt and the open item are DERIVABLE BY JOIN and are never stored on it,
which is what lets it stay append-only.

**Three doors and their floors.** `clara.admit_trade_invoice_work(p_client, p_author, p_intent_key,
p_kind, p_particulars, p_basis, p_basis_origin, p_source_refs, p_model)` is granted to
**`clara_runtime` and nothing else** — there is no `clara_authenticated` twin and no `_for`
sibling, for the reason 0221:1202-1206 states: Work admission on this lane is a runtime act OBO a
named human, and admission also ENQUEUES a run, which PostgREST cannot produce. §F asserts both
halves of that negative. `clara.get_trade_invoice(p_work)` is viewer-floored and reachable by
`clara_authenticated` and `clara_runtime`. `clara._assert_trade_invoice_basis` and the seven
other internals are ungranted to every application role. The door carries **no `p_attestation`**
and `is_high_stakes` is unreachable from it.

**AGREED TERMS RUN FROM THE DOCUMENT, AND THE LEGACY LANE DISAGREES.** `clara._trade_invoice_due`
resolves `stated → counterparty_terms → absent`, and when the terms decide it the arithmetic is
`document_date + payment_terms_days` — DECISIONS.md §6.2.0 R-A, which overruled this file's first
cut: "30 days net" is thirty days after the invoice, so the day a bookkeeper keys it in cannot move
the money's due date or tell `ap_aging` that an overdue bill is current. The posting date remains
the anchor only when no document date was stated, which this door refuses outright
(`invalid_due_date` / `field:"document_date"` / `constraint:"required"`), so that arm is a belt
behind a closed door rather than a path. The LEGACY coding/upload lane still anchors on the posting
date (0040:6010-6015's splice, untouched this wave); R-A names that the legacy lane's own defect
and gives it to **#665**'s cutover. The divergence is measured, not implied: cell
`p655.due.anchor_document_date` drives one bill — dated 2026-03-04, posted 2026-03-31, 30-day terms
— down both lanes and asserts **2026-04-03** here and **2026-04-30** there, by name; and
`p655.parity.source_vs_direct` deliberately uses a fixture whose document date IS its posting date,
so the parity claim is about the accounting rather than about which anchor won.

**A RACED PAIR UNDER ONE INTENT KEY IS ANSWERED ABOUT ITS OWN INVOICE, or refused.** The typed row
is written with `on conflict (work_id) do nothing`, which converges the core's replay branch onto
one row — but converging is not agreeing. The door's particulars comparison at step 4 runs on the
UNLOCKED path, so two admissions under one key are both past it before either commits, and
`clara._admit_accounting_work_core` compares only basis digest / purpose / source_refs /
adjustment (0194:1171-1190) — nothing of the counterparty, the reference, the dates or the total.
Step 8b therefore re-reads the surviving row and raises `intent_payload_conflict` when it is not
the one this caller sent, the idiom the core already uses for its own race (0194:1239-1256).
Measured before that arm existed: both callers left as SUCCESS and the loser was handed the
winner's `invoice_id` folded together with its own party and due date. Cell `p655.replay.race`'s
divergent arm.

**ONE REASON NAMES ONE THING.** The door's raise ladder is the contract (DECISIONS.md:50), and it
holds **eighteen** tokens: the fourteen that ruling fixes, plus `invalid_kind` for a kind that is
neither admitted value, and — because `_assert_trade_invoice_basis` measurably raised one token
for four different failures — `invalid_particulars`, `invalid_currency` and `invalid_tax_facts`.
The runtime's wire half (`toDbTradeInvoice`) names the same four, so a browser cannot tell the two
halves of one validation apart. `p655.polarity.matrix(d2)` drives each.

**One measured correction to #638's eight-step body order.** The authority preamble runs BEFORE the
payload half here, not after. Measured on clara_655 with the payload half first: an UNKNOWN client
left as CLR10 `control_leg_missing` (the chart lookup inside `_assert_trade_invoice_basis` is
client-scoped) while a REAL client of another firm left as CLR11 `client_not_found` — and the
difference between those two answers tells an unauthorised caller whether the client exists, which
is exactly what 0194's no-existence-oracle rule forbids.

**THE OPEN ITEM IS BORN BY A DEFERRED CONSTRAINT TRIGGER, and its ordering premise is MEASURED, not
argued.** `t_je_open_item_birth` on `clara.journal_entries` is 0216's lane-agnostic instrument,
declared identically and for 0216's stated reason. Enumerated from `pg_trigger` on clara_655
(PG 17.11), AFTER 0225 applies: **twenty-four** triggers, three of which touch `clara.open_items`
(`t_je_open_item_birth`, `t_je_subledger_belt`, `t_snapshot_staleness`) and of which exactly ONE
DEFERRED constraint trigger reads `clara.open_items` at commit — `t_je_subledger_belt`
(`t_snapshot_staleness` is not deferred). Deferred events for one row are queued in
trigger-NAME order and fire at commit in queue order, so the birth is named to sort before it
('o' < 's'), and `p655.rig.trigger_order` re-derives the whole ordering from the catalog rather
than trusting this paragraph. The trigger resolves its subject through
`clara.trade_invoice_status` (state='posted', entry_id), falls back to the committed operation
receipt through the TEXT-compared `effects->>'entry_id'`, and returns immediately for every entry
no trade invoice names — one indexed lookup, which is the whole cost it adds to every other lane.

**THREE BODIES ARE RECUT, and the second and third were forced by a measurement.** The sixth full
copy of `clara._record_journal_entry_core` was budgeted (D11: the control-leg refusal stands
unless the Work carries a `clara.trade_invoices` row). The other two were not. Measured on
clara_655 BEFORE the file was written: a `coding_kind IS NULL` entry with a payable control leg
classifies as `'adjustment'` (LADDER 5), so `clara._tf_subledger_entry_belt` ARM 1 — which
compares the entry's items against `clara._subledger_classify_entry` — raises CLR10
`subledger_entry_untied` for a `'bill'` item (v_bad = 1, measured; 0 for today's
`'adjustment'`), and `clara._tf_subledger_item_belt` hard-codes `item_kind='bill'` ⟺
`coding_kind='supplier_bill'` without consulting the classifier at all. So the classifier gains
LADDER 3T and the item belt's two arms learn the second lawful source, each firing ONLY when
`clara.trade_invoices` names the entry. Setting `journal_entries.coding_kind` instead would have
avoided both recuts and was rejected on measurement: it arms
`clara._assert_supplier_bill_shape_at_projected`, whose `sst_purchase_cost` arm requires a
DOCUMENT-STATED tax total, which a chat- or UI-stated bill has not got.

**Three catalog censuses move, and each is re-derived rather than transcribed** (this closes #868's
copies in this file): the `clara.open_items` WRITER set is now **TWO** (`_subledger_on_approve`
+ `_tf_je_open_item_birth`), superseding 0037:3830-3833's ONE; the subledger-hook CALLER set is
**unchanged** at the measured SIX (0216:938-947), because the birth trigger births directly and
names neither the hook nor the classifier; and the approve-path census is re-asserted to include
`_record_journal_entry_core`, superseding 0037:3774-3782's stale four.

**CLOSED by #872 (migration 0269, 2026-09-20) — the residual below is HISTORICAL.** R1 (wave
2026-09-15, `docs/plan/active/refresh-wave-2026-09-15/DECISIONS.md` §3.0) ruled the divergence this
paragraph describes IN — "do not add a fifth status, keep the two reads agreeing on four". The
owner's 2026-09-18 ruling on #872 reverses that: a fifth, READ-TIME-ONLY effective status,
`issuer_lapsed`, is now computed by ONE CASE expression `clara.firm_invites_visible` (0141 §H) and
`clara.preview_invite` (0224 §A) both carry verbatim — a still-`pending` invite whose issuer's
CURRENT active `clara.firm_memberships` rank is below `clara.role_rank('admin')` (demoted, or no
active membership at all) reads `issuer_lapsed` on BOTH surfaces, reversibly (re-promoting the
issuer restores `pending` on the very next read, no write anywhere). `clara.accept_invite`'s OWN
issuer-rank wall (quoted below) is UNTOUCHED — 0269's own tail re-measures its `prosrc` byte for
byte — so an `issuer_lapsed` invite still accepts whenever the invited role's rank does not exceed
the issuer's (lapsed but not erased) current rank; only a FULLY REMOVED issuer refuses every role,
which is what `coalesce(…, -1)` already did before this ticket. 0269 adds NO new function and NO
new grant: the shared expression is a correlated subquery against `clara.firm_memberships` inside
each body, not a standalone helper, because a bare two-argument `(firm_id, user_id) -> rank` door
granted to `clara_authenticated` would be exactly the cross-tenant membership oracle
`clara.shares_my_firm_human`/`_wake` were split apart to avoid (see 0269's own header for the
scratch probe that measured why). Original text, for the historical record:

The acceptance door also re-checks the ISSUER's *current* rank (`clara.role_rank(inv.role) > coalesce(v_issuer_rank,
-1)` → `CLR04 'invite exceeds the issuer''s rank -- re-issue by an owner'`), a fact that lives in
`clara.firm_memberships` and that `clara.firm_invites_visible` does not carry either. So an
invitation whose issuer has since been demoted — or who has left the firm at all, which the
`coalesce(…, -1)` refuses for every role — still reads `pending` in BOTH the preview and the admin
roster, and the acceptance door is what refuses it, at the last step, in its own words. Closing it
means a fifth effective status in the view *and* in the door (the invite-outcome face set is fixed at
four for this delivery), so it is a ticket of its own. The divergence was pinned meanwhile by
`packages/db/tests/preview-invite.test.mjs` → `p625.preview.issuer_rank`, which has itself been
REWRITTEN by #872 to assert the new, agreeing behaviour (it now demotes an issuer, asserts
`issuer_lapsed` on both reads, and shows `accept_invite` still refusing CLR04 for an invited role
that outranks the issuer's now-lower current rank — the wall, not the read, is what still refuses).

## The counterparty merge door's own lock order

`clara.merge_counterparties` (0011:1820, body replaced by 0015, spliced by 0149 S2 and again by
[0289_merge_alias_lane.sql](migrations/0289_merge_alias_lane.sql) — #889) takes its locks in
THREE rungs, in this order, and the order is not incidental — it is the one thing standing
between two concurrent merges and a `40P01` deadlock:

1. **Both counterparty rows, `for update`, in `id` ORDER — never in `(survivor, merged)`
   argument order.** `perform 1 from clara.counterparties cp where cp.id in (p_survivor,
   p_merged) order by cp.id for update;` (0015:2260-2261). Two sessions merging the same pair
   in OPPOSITE roles — one calling `merge(A, B)`, the other `merge(B, A)` — would lock A-then-B
   and B-then-A respectively if the door locked in call-argument order, the classic AB/BA
   deadlock shape. Sorting by `id` before the lock makes BOTH sessions request the SAME global
   order regardless of which argument named which row, so one session waits and the other
   proceeds — never a cycle.
Before any of the three rungs, the door decides whether the two ids are its caller's business at
all — and **a counterparty outside the caller's firm is answered `CLR11 counterparty not found`,
exactly as an id that exists nowhere is.** 0289's second splice lifted the firm test out of the
combined guard that used to answer `CLR23 cross_client` for a foreign firm's REAL rows, which made
the door a cross-tenant existence oracle against the estate's own rule that CLR11 means
"not-found-in-your-firm, no existence oracle". `cross_client` still answers for the case it was
written for: two counterparties of the caller's OWN firm under different clients
(`p889.merge.no_cross_tenant_oracle` drives both sides).

2. **The alias insert**, into `clara.counterparty_aliases` (0015:2295, recut by 0289 to name
   `recorded_via`). An insert of a new row takes no lock on any EXISTING row, so this rung adds
   no deadlock surface of its own; it sits between the two rungs that do because the merged
   party's former name must be recorded before its `coding_rules` are touched (a professional
   reading the identity page mid-merge sees the alias before the retirement, never after).
3. **The merged party's `coding_rules` rows, `for update`** — vendor_account first, then
   autopost (0015:2299-2301, :2317-2319). Each `select … for update` locks at most the one live
   rule of its type for `p_merged`; unlike rung 1, there is no cross-row ordering concern here
   because no other door takes a `coding_rules` lock keyed on more than one counterparty at
   once.

**The deadlock class this order avoids is the same one the member-doors section above names for
`clara.firms`**: two sessions that would otherwise acquire the SAME two row locks in opposite
orders. The fix is the same shape too — sort a fixed key (`id`, not the caller's argument
position) before locking — but the two orders are independent of each other: nothing here takes
a `clara.firms` lock, and nothing in the member-doors chain touches `clara.counterparties`. A
future recut that locks `p_survivor` then `p_merged` (or vice versa) directly, without the
`order by cp.id`, is a deadlock regression against 0289's own `sha256(prosrc)` pin on this body
(the value 0215's own P6 residue pin already carries too) — not a style change.

## The `interactive_client` wake kind

`clara.wake_fn_allowlist` rows for the `interactive_client` wake kind are not "structurally
incapable of posting" — that claim, stated in
[0107_f_a2_posting_grants.sql](migrations/0107_f_a2_posting_grants.sql)'s header and quoted in
the frozen `packages/runtime/workflows/chatTurn.v13.post.ts` header, was superseded at 0129 (four
of the thirteen mirrored bank verbs post) and again at 0178 (`wake_record_journal_entry`, the
accounting-work commit door). Both citations are historical wording: applied migration bytes and
the frozen v13 closure are each immutable, so neither is edited — this paragraph is the
correction. What the kind actually guarantees is the CLIENT PIN, which every verb allowlisted
for `interactive_client` enforces unconditionally, keeping a chat session's authority scoped to
the one client its credential names.

The live `interactive_client` allowlist rows, and the migration whose statement inserted each
(the asserted source of truth is
[tests/fixtures/wake-allowlist-roster.mjs](tests/fixtures/wake-allowlist-roster.mjs)'s
`WAKE_ALLOWLIST_ROSTER.interactive_client`; the census cells in `f-a2-grants.test.mjs` and
`f-a2-chat-limb.test.mjs` compare it against the live catalog and fail the moment this list
drifts):

- `wake_open_question` — [0107_f_a2_posting_grants.sql](migrations/0107_f_a2_posting_grants.sql)
- `wake_freeform_read` — [0131_f_a6_freeform_read.sql](migrations/0131_f_a6_freeform_read.sql)
- thirteen mirrored bank verbs (`wake_add_bank_account`, `wake_complete_bank_reconciliation`,
  `wake_get_bank_pack`, `wake_match_bank_line`, `wake_propose_bank_identifier_promotion`,
  `wake_propose_bank_line_exception`, `wake_resolve_and_book_bank_line`,
  `wake_resolve_bank_line_exception`, `wake_settle_from_bank_line`, `wake_unmatch_bank_match`,
  `wake_upsert_account`, `wake_void_bank_reconciliation`, `wake_void_bank_statement`) —
  [0129_f_a3_pr3_retirement_parity_doors.sql](migrations/0129_f_a3_pr3_retirement_parity_doors.sql)
- twelve close-prep verbs (`wake_list_fiscal_years`, `wake_get_close_plan`,
  `wake_get_close_readiness`, `wake_verify_close`, `wake_snapshot_state`,
  `wake_dry_run_close_readiness`, `wake_open_fiscal_year`, `wake_begin_close`,
  `wake_abandon_close`, `wake_propose_close`, `wake_run_depreciation_catchup`,
  `wake_mint_month_snapshot`) —
  [0159_f_a4_pr_2c_close_chat_lane.sql](migrations/0159_f_a4_pr_2c_close_chat_lane.sql)
- `wake_record_journal_entry` —
  [0178_accounting_work_journal_successor.sql](migrations/0178_accounting_work_journal_successor.sql)

Twenty-eight rows in total, as of this writing. The next migration that touches this allowlist
repeats this correction in its own header rather than leaving a reader to rediscover it.

## Client identity candidates and the onboarding-facts settle door (0219)

[0219_client_onboarding_facts.sql](migrations/0219_client_onboarding_facts.sql) adds two human-lane
doors and one ungranted helper. It recuts nothing: `begin_client_onboarding(text,text)`,
`create_client(text,text)`, `commit_client_onboarding` and `set_client_fy_end` keep their live
bodies, pinned by pre-image `sha256(prosrc)` in 0219's own prestate and re-asserted in its tail.

`clara.client_identity_candidates(p_name text, p_identifier jsonb default null)` — SECURITY
DEFINER, admin floor (the same floor `begin_client_onboarding` enforces), firm taken from the
session and never from a parameter. It answers which clients or live counterparties of the
caller's own firm already share the name's leading token, plus an exact-name hit and, when an
identifier is supplied, a `client_identifiers (kind, value_normalized)` match normalised exactly
as `add_client_identifier` normalises it. Three arities, ruled by the owner: 0 proceeds, 1 is
returned for the human face to show and acknowledge, and **2 or more RAISES** CLR10
`name_family_collision` carrying the same candidate rows in `detail` (each with its `id`, name,
party kind, status and match reason) — so the refused face renders the database's message verbatim
beside the same linkable list it would have shown at arity 1, rather than going looking for the
names through a second read of the same fact.

**This is the ungranted-core / granted-wrapper idiom, and the reason is executable law rather than
style.** `clara.name_family_token`, `clara.name_family_candidates` and
`clara.name_family_is_ambiguous` may not be granted to any application role:
[0103_f_a7_pi_additive.sql](migrations/0103_f_a7_pi_additive.sql) ends with a live
`has_function_privilege` census over five application roles × those three signatures that raises
CLR10 on any EXECUTE, repeated in [0126](migrations/0126_f_a7_pr_2_agent_receipt_surface.sql) and
[0154](migrations/0154_role_membership_census.sql). So the browser is granted the WRAPPER and never
the predicate; 0219's tail re-measures that census against the committed catalog, and
`tests/client-onboarding-identity.test.mjs`'s `p649.identity.census_replay` re-measures it again at
test time.

**What the wall was, and is not any more.** The read used to block nothing by itself: a caller
that never asked could still call `begin_client_onboarding` at any arity and a client was born.
[0287_client_birth_wall.sql](migrations/0287_client_birth_wall.sql) (#899) closed that residual —
see "The client birth wall (0287, #899)" below. `p649.identity.direct_birth_residual` now asserts
the CLOSURE, not the gap; the name is kept so the history reads honestly.

`clara.settle_client_onboarding_facts(p_plan uuid, p_fy_end_month int, p_fy_end_day int,
p_op_key text)` — SECURITY DEFINER, bookkeeper floor, human lane only. It carries a **committed**
client onboarding plan's financial-year end onto `clara.clients` by calling
`clara.set_client_fy_end` unchanged.

- **The day is a parameter, asked and never derived** (owner ruling D7, 2026-09-15). The interview
  asks only a month; `ck_clients_fy_end` admits only both-NULL or both-set, so the day has to come
  from somewhere, and deriving month-end would invent an accounting fact on a professional's
  record. A NULL `p_fy_end_day` is CLR10 `fy_end_day_required`. The web form offers month-end as a
  visible suggestion the human clicks, never as a silent default.
- **The month is the plan's** unless the caller names one: absent, it reads the plan's own `fye`
  answer through the ungranted `clara._plan_fye_month(uuid)`; supplied and different, it refuses
  CLR10 `fy_end_month_contradicts_plan` naming both numbers; absent on both sides, CLR10
  `fy_end_month_unanswered`.
- **CLR38 is surfaced, never swallowed.** The live `set_client_fy_end` body is not 0041's text
  (0042 §S5.12 and 0045 §S5.12-b2 spliced two live-ANNUAL cadence guards into it); both raise CLR38
  `fy_end_locked_by_annual_cadence`, and 0219 lets them propagate with the inner door's own
  message, code and detail. The raise aborts the transaction, so the settle receipt goes with it.
- **One lock order, three rungs, and not one of them taken outside the caller's firm.** The door
  takes the client advisory rung `203005004`, then the `clara.clients` row, then the
  `clara.onboarding_plans` row. Each step is another door's existing law, measured off the LIVE
  bodies: `commit_client_onboarding` (`0017:2764` then `:2768`) and `cancel_client_onboarding`
  (`0017:2852` then `:2853`) take the client row before the plan row; `set_client_fy_end` takes the
  rung before it touches `clara.clients` (0042 §S5.12, "the rung before the guard reads");
  `approve_opening_seed` takes the rung before the plan row. 0037 SECTION K states the rung ladder
  as a partial order and says why the rungs are taken EARLY — that is what makes an extension
  deadlock-free rather than merely documented. `p649.settle.lock_order` and
  `p649.settle.opening_rung_order` race the real door against each of those orders and require a
  queued success, never 40P01. Both plan reads carry `firm_id = c.firm`, so a foreign or unknown
  plan locks nothing at all: a lock is a side effect an outsider can time, and 0021's
  no-existence-oracle rule is not only about the words in the refusal
  (`p649.settle.foreign_plan_takes_no_lock`).
- **There is no machine twin, and the ground is structural**: `set_client_fy_end` opens with
  `clara._human_ctx`, which raises CLR04 with no `jwt_sub`, and is EXECUTE-granted to
  `clara_authenticated` alone. A runtime-role twin could not call it.
- **The day is not in Knowledge this wave** — a named residual. `clara.knowledge_keys` and
  `clara.knowledge_plan_item_map` belong to #654, and 0219's tail asserts it minted no row in
  either.

## The client birth wall (0287, #899)

[0287_client_birth_wall.sql](migrations/0287_client_birth_wall.sql) moves the name-collision wall
0219 added from a READ a caller can skip to the DOOR that mints a `clara.clients` row, closing the
residual 0219's own header named. The ticket's 2026-09-19 triage measured **two** still-open
granted entrances: the command palette's dispatch to `begin_client_onboarding`, and
`clara.create_client(text,text)`'s standing `clara_authenticated` grant. **One of the two is
closed** (the palette, and with it the legacy door, at arity ≥ 2). **The other is still open**:
`create_client` keeps its body and its grant, and 0287 marks it SUPERSEDED in the catalogue rather
than closing it — so the ticket's "no granted human role can reach a client-minting verb that lacks
the wall" is NOT yet true. What IS measured is how far that gap reaches; see below.

`clara._client_birth_core(p_actor, p_firm, p_name, p_identifier, p_acknowledged_candidate,
p_require_ack_at_one, p_fn, p_op_key)` — ungranted, `security definer`. The ONE body that performs
the candidate resolution `clara.client_identity_candidates` already performs (it CALLS that
function, never a second copy of the family predicate) ahead of the `insert into clara.clients`,
in the same transaction as the onboarding plan it also mints. Reserves the op **before** the wall
(house guard order): the name an op_key is minting legitimately matches itself as an exact-name
candidate on a byte-identical replay, so checking the wall first would make a successful retry
refuse itself.

Two granted doors share this one core:

- `clara.open_client_onboarding(p_name, p_op_key, p_identifier default null, p_acknowledged_candidate default null)`
  — NEW, admin floor. Arity 0 proceeds; arity 1 raises CLR10
  `identity_acknowledgement_required` unless `p_acknowledged_candidate` names the one candidate the
  read returns; arity ≥ 2 raises the same CLR10 `name_family_collision` the read raises, carrying
  the same rows. This is the birth verb the ticket asks for — both `AddClientControl` (the client
  register's Add Client control) and the ⌘K command palette dispatch through it.
- `clara.begin_client_onboarding(p_name, p_op_key)` — RE-POINTED (`create or replace`, signature
  and grant unchanged). Now raises the same CLR10 `name_family_collision` at arity ≥ 2 — this is
  what closes `p649.identity.direct_birth_residual`. Arity 1 is **deliberately unchanged**: the
  two-argument signature has no parameter to carry an acknowledgement, and a defaulted third
  parameter would create the overload `0103:1055-1070` refuses, so an arity-1 wall through this
  door would be an unconditional refusal rather than a gate a caller could clear. Measured against
  every real caller on this branch (`rig-fixtures.mjs`, `wave-b/wb-fixtures.mjs` and its test
  files, the interview and opening-ledger e2e spawners): none ever accumulates a THIRD same-family
  party under one firm through this door, so the arity-≥-2 wall costs them nothing while the
  arity-1 boundary stays exactly where the owner's 2026-09-15 ruling put it.

**`clara.create_client(text,text)` kept its body and its grant, and was the one place 0287
departed from the brief's literal "no granted role reaches an unwalled client-minting verb".** It
was an OPEN residual, not a closed question, when this section was written. 0287 §C2 gave the
brief's third per-verb answer — SUPERSEDED — where a reader of the catalogue can see it: a
`comment on function` naming `open_client_onboarding` as the successor and saying in the same
sentence that the gap was still open. The comment was the only thing about this verb 0287 changed;
the prestate and the tail pinned its body and its grant byte-for-byte. `rig-fixtures.mjs`'s shared
`buildWorld()` (read by dozens of battery files) and `wave-b/wb-fixtures.mjs`'s `buildWaveBWorld()`
both construct a THIRD same-leading-token client in one firm through `create_client`, and
`name-only-guard.test.mjs` constructs six more through the same shared JS fixture helper —
re-pointing `create_client`'s body would have turned all of those red for a fixture-naming
coincidence unrelated to what any of them test. **This residual is CLOSED by #1038 (migration
0316) — see "`clara.create_client`'s human grant withdrawn (0316, #1038)" below**; the reasoning
above is left in place because it explains WHY the closing migration only revokes a grant and
never re-points the body.

Three cells bounded the gap rather than claiming it away, when this section was written; #1038
rewrote all three onto the closed shape (see below), moving them onto their OWN stem separate
from 0287's, so a database carrying 0287 without 0316 skips them loudly (an explicit
pre-integration run) or fails loudly (a focused one) instead of asserting either the old,
now-impossible OPEN shape or the new, not-yet-true CLOSED one.

**Two guarantees the core carries that the doors above do not state.** (1) The wall is
SERIALISED: `_client_birth_core` takes `pg_advisory_xact_lock(203005008, hashtext(firm || ':' ||
name_family_token(name)))` BEFORE the candidate read. A read followed by an insert is a
time-of-check/time-of-use window — two concurrent sessions each see the other's uncommitted client
as absent, each clears the same arity-1 acknowledgement, and the firm ends with three same-family
parties, a state the door refuses to reach one caller at a time. Measured with two real
connections; the cell is `p899.new_verb.concurrent_same_family_serialised`. The key is (firm,
family), not the whole firm, so unrelated births never wait on each other. (2) `p_identifier` is
RECORDED, not only consulted: the core writes it into `clara.client_identifiers` under
`clara.add_client_identifier`'s own normalisation, so a wall a caller cleared with an identifier
also holds for the next caller. Both are re-asserted structurally by 0287's own tail (T.5b).

## `clara.create_client`'s human grant withdrawn (0316, #1038)

[0316_create_client_human_grant_withdrawn.sql](migrations/0316_create_client_human_grant_withdrawn.sql)
closes the residual the section above bounded: `clara.create_client`'s `clara_authenticated`
EXECUTE grant is **revoked**. Its body — unwalled, no identity check — is untouched (prestate and
tail both pin it byte-for-byte), because the reasoning above still holds: `buildWorld()`,
`buildWaveBWorld()` and `name-only-guard.test.mjs` still need to mint same-family clients by
fixture convention, and re-pointing the body would break them for a naming coincidence unrelated
to what any of them test. Only WHO can call it moved, never WHAT it does when called.

**How the rig's own callers keep working with no grant at all.** Every caller that used to reach
`create_client` through the `clara_authenticated` grant now reaches it the same way
[`packages/db/scripts/onboard-rpr.mjs`](scripts/onboard-rpr.mjs) always has, for its own one
non-test call site — the "HUMAN-CONTEXT IDIOM" that script's own header names, itself
[`seeds/0002_core_seed.sql`](seeds/0002_core_seed.sql)'s house pattern: stay at the base
connection identity (the postgres superuser, which bypasses EXECUTE-grant checks entirely — a
plain PostgreSQL property, not something this ticket invented) and hand-set
`request.jwt.claims` so `clara._human_ctx` resolves the same actor/firm/floor a granted
`clara_authenticated` caller would have gotten. `packages/db/tests/rig-fixtures.mjs`'s
`createClientRaw(sub, {name, opKey})` is the ONE place this idiom lives for the test rig
(`withActor({ jwtSub: sub }, …)`, `rig-helpers.mjs`'s own `role: null` branch); `createClient()`
wraps it and then drives the legacy activation bridge exactly as before. A dozen direct callers
that used to inline `humanQuery(sub, "select clara.create_client(…)")` across
`packages/db/tests` were moved onto `createClientRaw` in the same ticket, and a NEW census cell
(`p899.census.no_test_file_calls_create_client_directly`, AC1) sweeps the whole `tests/` tree and
fails loudly if a new direct caller ever reappears outside that one fixture.

**The grant-matrix census.** `packages/db/tests/rig-meta.mjs`'s `WRITERS` array no longer lists
`create_client` — the exact-match sweep `rig-isolation.test.mjs`'s T17 runs now expects
`clara_authenticated` (and every other application-facing role) to hold **zero** EXECUTE on it,
and fails loudly if the grant ever returns. `clara.open_client_onboarding` (already in
`CLIENT_BIRTH_WALL_0287_COHORT`) is the granted human door in its place.

**Two RBAC cells that used `create_client` as their example human writer were repointed to
`open_client_onboarding`** — not a behavioural change to what either cell proves, since both
subjects (a human writer ignoring a foreign wake credential; a non-authenticated role never
reaching a real writer) are equally true of either door:
`rig-isolation.test.mjs`'s "T16 CRITICAL-1" and `rig-runtime-catalog.test.mjs`'s agent-read-login
writer-denial cell.

**The three #899 census cells, rewritten and moved onto their own stem
(`create_client_human_grant_withdrawn$`)**, separate from 0287's own gate — the
`firm-setup-applicability.test.mjs` / `TIN_REQUIRED_STEM` idiom (see "The firm-setup TIN item"
section elsewhere in this file):
`p899.census.no_unwalled_granted_client_minters` now asserts the granted-minter sweep's unwalled
set is EMPTY (the ticket's own criterion — "no granted human role can reach a client-minting verb
that lacks the wall" — is MET, not merely bounded); `p899.census.create_client_residual_closed`
asserts the catalogue comment names `#1038`/"withdrawn" and directly re-measures
`has_function_privilege('clara_authenticated', …) = false`;
`p899.census.create_client_refuses_the_human_grant` is the vacuity control — the EXACT call shape
an earlier cell in this file's history once proved SUCCEEDING now REFUSES `42501`
`insufficient_privilege`.

## Storage grant/policy battery

[deploy/storage-provision.sql](deploy/storage-provision.sql) cannot run against the local rig —
there is no `storage` schema there — so its posture used to be ceremony-tested only.
[storage-battery/](storage-battery/README.md) closes that: `node packages/db/storage-battery/run.mjs`
boots a real, disposable Supabase stack with the vendor's pinned CLI, applies that file to it, and
measures the boundary through the runtime's own door (`putCanonical`/`verifyCanonical`/
`downloadCanonical`), dropping to raw HTTP only for verbs the runtime never calls. It proves what
the ceremony **produces** — create, duplicate-as-existed, read-back verify, upsert/PUT/DELETE
refused, non-conforming and cross-bucket keys refused, a non-designated and an expired credential
refused, no escalation bit and no admin inheritance on `clara_storage_docs`, exactly two policies —
and it asserts two limits positively rather than by omission: a conforming key in **another firm's**
namespace is allowed (Storage RLS here is key-shaped, not tenant-shaped; firm isolation rests on
the definer door), and a conforming **wiki** key is refused because this ceremony creates no wiki
policy pair. It proves nothing about what the **live** project currently carries — whether
[deploy/wave-b-storage-update-amendment-REVERT.sql](deploy/wave-b-storage-update-amendment-REVERT.sql)
was ever applied, or whether an out-of-band wiki/reports policy exists — because both that
amendment and its revert are manual ceremony scripts with no applied/pending ledger; the ledger
above covers `migrations/` only. `storage-battery/hosted-probe.sql` is the read-only probe that
answers those against the live estate, and its output is hosted evidence, recorded separately.

## Operation-contract census

[scripts/operation-census.mjs](scripts/operation-census.mjs) rebuilds the public SQL operation
boundary from the live catalog and the current sources: every routine in schema `clara`, its
owner, `SECURITY DEFINER` and `search_path`, its ACL per grantee, the CLR/SQLSTATE codes its
body raises, and every call site in `apps/web` and `packages/runtime` that names it. Run it
against a migrated database from any working directory:

```sh
node packages/db/scripts/operation-census.mjs --out /tmp/census        # JSON + markdown
node packages/db/scripts/operation-census.mjs --out /tmp/census --strict  # exit 1 on a finding
```

Connection details come from the environment, as for every script here. Findings carry one of
seven labels: `public_execute`, `called_missing`, `called_ungranted`, `named_arg_mismatch`,
`unattributed`, `granted_uncalled` (informational) and `frontier_mismatch`. An exemption is one
`<label>:<target>` pair in [tests/fixtures/operation-census-waivers.mjs](tests/fixtures/operation-census-waivers.mjs)
with a reason of at least 40 characters; there is no function-level blanket exemption, and a
waiver that suppresses nothing is reported as a dead exemption.
[tests/operation-census.test.mjs](tests/operation-census.test.mjs) is the gate, and it breaks
every label it asserts to prove the analyser can still see.

`granted_uncalled` — the informational label — groups by bare function name, so an uncalled
OVERLOAD of an otherwise-called name is not reported: a scanned call site resolves to every
overload of the name it spells, and choosing one would need overload resolution the scanner
does not attempt. At frontier 0178 that covers three of 475 distinct public names
(`consume_egress_dispatch`, `prepare_egress_dispatch`, `settle_autodraft_task`), each called
only from runtime SQL with positional arguments. The labels that gate — `called_ungranted` and
`named_arg_mismatch` among them — are decided per call site and are unaffected.

The census reports its frontier from `clara.schema_migrations` and compares it against the
migration files on disk. It never reads a migration's own success text: a chain that ran green
and a frontier that landed are different claims, and only the ledger states the second.

### Firm setup (0218, journey A5)

The firm's own `scope_kind='firm'` onboarding plan gained its first human doors at 0218. All six
names (five from 0218, plus `dismiss_firm_setup_tip` from #935/0259 below) are `clara_authenticated`-only, owned by `clara_fn_owner`, `SECURITY DEFINER` with
`search_path` and `plan_cache_mode` pinned, and floored at **admin** inside their own bodies; no
runtime, agent or wake role holds EXECUTE on any of them, and `clara.firm_setup_keys` grants SELECT
to `clara_authenticated` alone.

| Operation | Floor | What it does |
|---|---|---|
| `clara.seed_firm_setup_plan(p_op_key)` | admin | RECONCILES the firm plan against `clara.firm_setup_keys`: inserts only the catalogue rows the plan is missing and never touches an existing item, so an answer `firmInterview_v3` already wrote is neither rewritten nor re-asked. Rotates the CAS token and appends a revision snapshot. |
| `clara.answer_firm_setup_item(p_plan, p_expected_revision, p_item_key, p_answer, p_op_key)` | admin, then the catalogue row's `min_role` | Validates the answer against the catalogue's declared shape, records it with its author, and — for the three firm-defaultable keys only — captures a firm-scope `clara.knowledge_records` row through the live `clara.capture_knowledge`. CAS mismatch is `CLR06` + `detail.reason='stale_plan'`. It is also the journey's CORRECTION PATH: it sets `state='answered'` from any non-committed state and replaces `answer` wholesale, so a recorded fact is corrected and a deferral is un-skipped by the same act (no deferral reason survives beside the new value). The one exception is a key that already carries a LIVE firm-scope knowledge record — the second capture is refused `knowledge_already_live`, and correction belongs to `clara.correct_knowledge`. |
| `clara.defer_firm_setup_item(p_plan, p_expected_revision, p_item_key, p_reason, p_op_key)` | admin, then `min_role` | Skips an item that is not required — the catalogue's own `required_for_commit`, OR (#1032, 0311) a LIVE `'required'` verdict off `clara._firm_setup_applicability` — parking the stated reason in the item's `answer` as `{"deferred_reason": …}` (`clara.onboarding_plan_items` has no `reason` column and its deferred CHECK arm constrains none). Refuses a required item (static or dynamic) and an already-answered one. |
| `clara.commit_firm_setup(p_plan, p_expected_revision, p_op_key)` | admin | Commits the plan once every row that is required — the catalogue's own `required_for_commit`, OR (#1032, 0311) a live `'required'` verdict — is answered, resolved or deferred; otherwise `CLR10 required_items_outstanding`, naming them. It reads the catalogue plus the applicability door, not the plan row's own flag, so a foreign plan item (`bookkeeper_email` → #625, `first_client_onboarding` → #649) cannot block this journey. |
| `clara.get_firm_setup()` | admin | The journey's ONE production-facing read: plan identity and CAS token, every catalogue row with its plan state, the required-answered/required-total counter, the outstanding required keys, and the confirmed firm-scope facts with scope, source, actor and an authority verdict taken from the author's CURRENT membership rank. |
| `clara.dismiss_firm_setup_tip(p_plan, p_item_key, p_action)` | admin, then `min_role` | #935 — the ONLY door that may settle an `item_kind='education'` row (`p_action` is `'acknowledged'` or `'deferred'`). No `p_op_key`, no `p_expected_revision`: it writes no audit row, emits no domain event, never rotates the plan's CAS token, and is idempotent by construction (a repeat call on an already-settled tip echoes its actual state rather than re-writing or erroring). Refuses a non-education item by name (`CLR10 firm_setup_item_not_a_tip`). |

`clara.update_onboarding_plan` stays byte-identical and `clara_runtime`-only; `clara.commit_client_onboarding`
still forces a client; `clara.promote_plan_answers_to_knowledge` is deliberately not used (its
promotion loop joins one global `item_key` namespace with no scope discriminator). 0218 also added
`uq_onboarding_plans_one_open_firm` — a partial unique index on `(firm_id) where state='open' and
scope_kind='firm'`, which was what made `clara.claim_paid_firm`'s bare `select … into` replay arm
single-row rather than silently first-row, for as long as no firm ever held a SECOND firm-scope
plan in any other state.

**#894 (0255, hardened further)** replaced that index with `uq_onboarding_plans_one_firm` —
same column, `(firm_id)`, predicated on `scope_kind='firm'` ALONE, with no `state` term at all.
A second firm-scope plan for the same firm is now refused in EVERY state (open, committed or
cancelled), not merely a second open one, so `claim_paid_firm`'s replay arm is single-row
structurally rather than only because `clara._create_firm_core` is the sole writer and nothing
today closes a firm plan. `clara.claim_paid_firm` itself is untouched — pinned pre- and
post-image by `sha256(prosrc)` in 0255's own prestate/tail — and 0017's client-scope sibling
index, `uq_onboarding_plans_one_open` on `(firm_id, client_id)`, is untouched too.

**#895 (0256, three defects `#648`'s own fix round found and left)** recuts `seed_firm_setup_plan`
and `get_firm_setup` in full (`create or replace function`, both pre-images pinned by
`sha256(prosrc)`), fixing three gaps each previously masked by a web-side guard or an unreachable
path: (1) a reconciliation that inserts nothing no longer rotates the plan's CAS token, advances
`revision_n` or appends a revision snapshot — the audit row and `firm_setup.seeded` event still
fire, carrying `seeded=0`, so the no-op act stays a receipted fact; (2) `get_firm_setup`'s
`counter.required_total` is now gated on `p.id is not null`, exactly as `required_answered`
already was, so a firm with NO firm-scope plan reads `counter={0,0}` rather than the catalogue's
constant required-row count borrowed as if it were this firm's own progress; (3) the
`confirmed_facts` projection gained the `r.state = 'live'` filter the per-item join two blocks
above already carried, so a WITHDRAWN firm default — `clara.withdraw_knowledge` leaves
`superseded_at` NULL, exactly as a LIVE row does, per `ck_knowledge_records_state` — no longer
lingers in `confirmed_facts` forever. `required_outstanding` is a stated residual: it lists every
required catalogue key for a plan-less firm too, and #895's Agent Brief named only the counter and
the unseeded count, so it is untouched here. Neither door's ACL, floor or signature moved.

**#891 (0257, applicability predicates)** lets the catalogue skip an item that does not apply to
this firm, without editing any of the twelve shipped `clara.firm_setup_keys` rows. The new,
ungranted `clara._firm_setup_applicability(p_plan, p_item_key)` mirrors exactly two predicates from
the pre-admission interview — `mpers_eligibility` applies only where `entity_type = 'sdn_bhd'`;
`tin` applies unless `turnover = '<RM1M'` — reading the SAME plan's own answer to that dependency,
live, on every call: `'applicable'`, `'inapplicable'`, or `'undetermined'` while the dependency is
still unanswered. `seed_firm_setup_plan`'s reconciliation now inserts a catalogue row only while it
reads `'applicable'`; an inapplicable or undetermined one is simply never seeded, and a LATER
reconciliation picks it up once its dependency is answered. `get_firm_setup` carries a live
`applicability` field on every item; an item answered before it became inapplicable keeps that
answer untouched and is simply reported inapplicable beside it.

0257's first cut ALSO widened `items[].required` and both sides of `counter` to count a seeded,
applicable `mpers_eligibility`/`tin`. The lane's code review withdrew that widening and
**0259 SS G** (the fix round; see #935 below) recut the read so there is ONE notion of required
across the estate: the catalogue's own `required_for_commit` column, which is what
`clara.commit_firm_setup` gates on, what `required_outstanding` names, what both counter sides
count and what `items[].required` reports. `required_total - required_answered` is therefore by
construction the length of `required_outstanding`, and an inapplicable item is excluded from both
sides because neither conditional row is `required_for_commit` at all. Making the counter's
honesty a real gate — i.e. deciding that a seeded, applicable TIN should block a commit — remains
the follow-up ticket 0257's own header proposed; it is one decision about the gate, not two
half-decisions about the counter.

**#934 (0258, user-facing catalogue notes and a retire column)** replaces the twelve engineer
provenance notes (file names, line numbers) a firm admin used to see under each question with one
owner-approved, accountant-readable sentence. `clara.firm_setup_keys` gains two nullable columns —
`user_note` (the accountant sentence) and `retired_at` — added by plain `alter table`, never a
`create table`; the twelve shipped rows' PRE-EXISTING columns (`note`, `question`, everything else)
are untouched, pinned by a comprehensive row hash in the migration's own prestate and re-measured
byte-identical at its tail. Populating `user_note` for twelve ALREADY-EXISTING rows needs one
backfill `update`, run with the table's append-only trigger (0218 SS A) deliberately disabled for
that one statement and re-enabled immediately, inside the runner's own per-migration transaction --
the `0176_counterparty_alias_kind_scope.sql` SS 3 house shape, applied here for the first time to
`firm_setup_keys`. `clara.get_firm_setup` is recut (`create or replace function`, pre-image pinned)
to PREFER `user_note` over `note` (`coalesce(k.user_note, k.note)` -- a precedence rule, not a hard
replacement, so a future catalogue row with no accountant sentence yet still renders its engineer
note rather than nothing) and to OMIT a retired row from every surface it computes over the
catalogue: `items[]`, `catalogue_total`, `required_outstanding`, and both sides of `counter`. This
file retires nothing -- every `retired_at` it ever writes is null -- so "omit retired rows" is
proved BEHAVIOURALLY by `firm-setup-user-notes.test.mjs` against a synthetic row planted and removed
by the same disable-trigger idiom, never against one of the twelve. `clara.seed_firm_setup_plan` is
untouched (pinned pre-image, re-measured byte-identical at the tail): whether a retired row should
still be reconciled into a plan is a NAMED RESIDUAL for whichever later ticket first actually
retires something, exactly the shape #891 (0257) left for `commit_firm_setup`'s own gate. **#935**
(the sibling education-tips ticket) depends on this file's retire column and lands after it in the
same lane.

**#935 (0259, three optional education tips)** adds `item_kind='education'` rows to
`clara.firm_setup_keys` (`tip_invite_colleagues`, `tip_knowledge_page`,
`tip_start_from_conversation`; `required_for_commit=false`, group `tips`, no `knowledge_key`) by a
plain `insert` — brand-new rows, so the append-only trigger is never touched, unlike #934's
backfill of twelve EXISTING ones. `clara.onboarding_plan_items.item_kind`'s CHECK is widened to
admit `education` too, so `seed_firm_setup_plan`'s reconciliation carries the catalogue's own kind
straight through instead of folding it onto `todo` (0218's own reason for that fold — "a fourth
value would be a CHECK violation" — no longer holds once this file lands). `commit_firm_setup` is untouched (pinned pre-image,
re-measured byte-identical at the tail): every counter/outstanding/gate arm reads
`required_for_commit` alone, so a tip — never required — can neither inflate a counter nor block a
commit, for free, from the catalogue data alone. `get_firm_setup` was untouched by this file's
FIRST cut, for the same reason; the lane's code review then found three defects in that read —
the withdrawn effectively-required widening (#891 above), the counter disagreeing with
`required_outstanding`, and a `confirmed_facts` join that had missed #934's retirement filter —
which all land on the one door, so **SS G** of this same file (re-applied through #957's
`CLARA_MIGRATION_REDO`, rather than claiming a sixth migration number no lane reserved) recuts it:
one notion of required, and seven `retired_at is null` filters instead of six. `answer_firm_setup_item` and
`defer_firm_setup_item` are each recut with one new guard refusing an `education` row by name
(`CLR10 firm_setup_item_is_a_tip`) — a gap this file closes rather than one the Agent Brief named,
because until this file no `education` row existed to expose it: without the guard, either generic
door would happily record an AUDITED "accounting item" against a tip, which is exactly the
invariant the ticket's two hard properties forbid. The new door itself,
`clara.dismiss_firm_setup_tip`, is the table above's own row.

**#1032 (0311, riders wave 4: TIN becomes required-or-optional, not seeded-or-not)** takes the
follow-up 0257's own header proposed and #891's paragraph above restates ("deciding that a seeded,
applicable TIN should block a commit") and settles it the owner's way (ruling 2026-09-23, Option
A): the TIN item is now asked of EVERY firm, whatever the turnover answer. Only `tin`'s own branch
of `clara._firm_setup_applicability` changes — `mpers_eligibility`'s branch and the unconditional
`else` for the other ten rows are byte-identical to 0257 — and it now returns `'required'` or
`'optional'`, never `'inapplicable'`/`'undetermined'`: required once turnover makes MyInvois
mandatory, optional otherwise, including while turnover is itself still unanswered (the ruling's
own "otherwise ... optional", not a third undetermined state — unreachable in practice regardless,
since `turnover` and `tin` are always seeded together in the same reconciliation).
`seed_firm_setup_plan`'s guard widens from `= 'applicable'` to `not in ('inapplicable',
'undetermined')`, so `tin` is now always seed-eligible while `mpers_eligibility`'s own
seeded-or-not behaviour is unchanged. Required-ness becomes ONE PREDICATE —
`k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'` — used
at every site that ever asked "is this required": `get_firm_setup`'s `items[].required`,
`required_outstanding` and both `counter` sides (four sites, one recut), `commit_firm_setup`'s
outstanding-items gate (its FIRST recut ever — 0257 and 0259 both left it a measured, untouched
baseline), and `defer_firm_setup_item`'s required-refusal guard (not named in the ticket's own Key
Interfaces, recut anyway: without it the database would admit a skip the web surface's Required
badge already hides the control for, the same "two notions disagreeing" defect class 0259's fix
round exists because of, closed here before it could recur). `mpers_eligibility` is a no-op under
this predicate everywhere it appears, because its branch never returns the literal `'required'` —
so `#891`'s own "eligibility item keeps its present behaviour" holds by construction, re-verified
byte-for-byte rather than merely claimed. One data cell moves: `tin`'s `user_note`
(0258/0259_firm_setup_user_notes.sql's own accountant sentence), backfilled through the SAME
disable/enable-append-only-trigger shape 0258 established, since "otherwise skip with a reason" is
no longer true once tin is answerable rather than inapplicable. No new function is minted and no
grant changes, so — like 0257 itself, and like `rig-meta.mjs`'s own `#979` precedent ("NO COHORT,
NO NEW NAME, NO GRANT CHANGE, each measured rather than assumed") — this file adds no
`rig-meta.mjs` cohort.

**The population 0311 does NOT reach, stated rather than left silent** (#1032's own fix round,
review finding L06-SPEC-06). 0311 recuts `clara.seed_firm_setup_plan` but backfills no existing
plan, and that door refuses outright when the plan is not open (`CLR10 firm_setup_not_open`). A
firm that COMMITTED its firm-setup plan before 0311 therefore has no `tin` row and no path to one:
the catalogue carries no reopen door (measured on the live catalog — `_assert_firm_setup_answer`,
`_firm_setup_applicability`, `_firm_setup_bump`, `_firm_setup_plan`, `answer_firm_setup_item`,
`commit_firm_setup`, `defer_firm_setup_item`, `dismiss_firm_setup_tip`, `get_firm_setup`,
`seed_firm_setup_plan`, and nothing else), and the web checklist guards every write control behind
`!committed`. This is NOT specific to `tin`: a committed firm-setup plan has always been closed to
every later catalogue row, including #935's three education tips, so backfilling `tin` alone would
reach only the one item and would have to invent either a reopen door or a write into a committed
plan — both of them product decisions well outside #1032's brief, which is why neither is taken
here. Against the standing beta ruling ("nothing is dark") this is a REAL, disclosed gap for
firms that committed below the RM1M threshold before 0311; it wants its own ticket — reopening, or
amending, a committed firm-setup plan — and it is named here and in the lane's fix report so the
owner can rule on it rather than discover it.

At frontier 0222 the accrual lane adds four public names to that boundary:
`create_accrual_adjustment`, `list_accrual_adjustments` and `get_accrual_adjustment` on
`clara_authenticated`, and `create_accrual_adjustment_for` on `clara_runtime` alone. They are
attributed by `ACCRUAL_ADJUSTMENTS_0222_COHORT` in [tests/rig-meta.mjs](tests/rig-meta.mjs), whose
cohort check is bimodal (wholly present once 0222 applies, wholly absent before it) because the
`db-slice-frontiers` matrix runs this package against earlier frontiers.

The census audits the public operation boundary, so a trigger below it is invisible to every
label above. Read [#692](https://github.com/BELCORT-SDN-BHD/clara/issues/692) before adding the
first writer for `clara.firm_document_limits`. Its BEFORE-INSERT pseudo-upsert is column-preserving:
a limit the caller leaves out — or sends as NULL — keeps the value the firm already had, and so does
`updated_by`. That holds because the four limit columns carry no table default; the trigger is the
only thing that supplies 100 / 1000 / 2 / 2, and it does so on a firm's first insert alone.

### The fixed-asset acquisition boundary (#639, migration 0216)

An acquisition and its fixed-asset register row commit TOGETHER, on every lane, and the instrument
is a DEFERRED CONSTRAINT TRIGGER rather than a hook:

| object | grant | what it is |
|---|---|---|
| `clara._tf_fa_acquisition_birth()` + `t_je_fa_acquisition_birth` | none (trigger) | The lane-agnostic birth. `after insert or update on clara.journal_entries … deferrable initially deferred … when (new.status='approved')`, named to fire BEFORE `t_je_fa_movement_belt` — deferred triggers fire in alphabetical trigger-name order, measured on PG 17.11, not creation order. It carries `_fa_on_approve` arm 4's predicate verbatim plus an `origin='scheduled_run'` exclusion arm 4 does not have, and is idempotent against the hook through the same `on conflict (acquisition_line_id) do nothing`. |
| `clara.fixed_assets.acquisition_document_id` | — | The source document, copied AT BIRTH. Write-once: `clara._tf_fixed_assets_immutable_0017` forbids any later write to a column outside its post-approval allowlist, so a row birthed by the hook carries NULL and the READ resolves the acquisition entry's own `document_id`. The two can never disagree (0216 tail T.7). |
| `clara._fa_acquisition_json(uuid)` / `clara._fa_acquisition_history(uuid)` | none | The acquisition as its own fact, and the correction chain. The Work and the receipt are DERIVED BY JOIN from `acquisition_entry_id`: the receipt is inserted AFTER the approve and the Work `result` is built inside the posting core, so an approve-time write of either would stamp NULL forever. The chain's vocabulary is `supersede` / `co_acquired_on_same_document` / `source_document` / `reversed_acquisition_on_same_enrolment`; **two rows born from the SAME invoice are `co_acquired`, which is orderless** — one cost line births one row by design, so a two-line invoice is ordinary and neither row supersedes the other — and the `source_document` ordering is STRICT, so an equal `approved_at` can never make two rows each other's successor. |
| `clara.get_fixed_asset(uuid)` / `clara._fa_asset_json(uuid,date)` | `clara_authenticated` (read) | Recut. `acquisition`, `particulars` and `history` are THREE separate blocks, so "policy and schedule clearly separate" is structural rather than a layout choice. |
| `clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)` | `clara_runtime` ONLY | The particulars door a run may call ON BEHALF OF the human whose Work asked the dependent question. Live-authority rechecks (active membership, bookkeeper floor, active client) taken UNDER A LOCK — `clara.firms … for key share` then `firm_memberships … for share`, the pair `0195:1792-1797` measured, so a demotion queues behind the answer instead of slipping between the read and the write — complete-once, op-keyed, and it writes NO journal entry. The browser keeps `clara.complete_fixed_asset_particulars`, which is `clara_authenticated`-only. Its three failures are deliberately distinguishable (CLR11 `client_not_found`, CLR04 `obo_not_active` / `insufficient_role`, CLR10 `client_inactive`): this door is runtime-only and names an explicit `p_obo`, so the estate's no-existence-oracle rule — which is about browser-reachable doors — is carried by the human door beside it. |

**Two boundaries this lane states rather than widens.**

* **A credit-financed acquisition does not reach the register through the Work lane.** The posting
  core refuses a payable or receivable leg on a generic basis (`0178:1355-1367`, CLR10
  `generic_control_leg`), so an acquisition on supplier credit reaches the register only through
  document intake → coding, where the AP leg is lawful. Cash and bank acquisitions go through the
  journal composer or the Work lane. The composer's refusal names the other door.
* **MYR only, at admission.** `0178:734-736` admits no other currency, and the acquisition read
  says `MYR` out loud rather than leaving a silent absence. Multi-currency is the accepted PRD:127
  deferral, not a gap in this lane.

**And one census this migration re-derived.** `0037_wave_c_a_subledger.sql:3840-3845` pinned the
subledger hook's callers at FOUR. Measured on a migrated chain the live set is SIX: 0056's close
model added `finalize_close` and `reopen_fiscal_year`. 0216's tail re-derives and re-pins the
measured six, so a seventh is caught.

### The depreciation-history lane (#651, migration 0227)

Depreciation runs under an EXPLICIT, RESOLVED instruction with a FROZEN window; a locked period is
refused at the RUNNING door instead of at approve; and every revision names what kind of change it
is.

| object | grant | what it is |
|---|---|---|
| `clara.fixed_assets.change_class` / `.change_reason` | — | The depreciation change class, stamped on the SUCCESSOR row by `revise_fixed_asset_particulars` and never back-filled. `ck_fixed_assets_change_class` is ONE-DIRECTIONAL on purpose: a two-directional form could not validate against a pre-existing hosted revision row, which carries neither column and which 0017's post-approval immutability wall makes unwritable. The REQUIREMENT that every new revision names a class lives in the door — the estate's standing "door enforces, CHECK guards shape" split. |
| `clara.fa_depreciation_authorities.authority_kind` / `.authority_ref` / `.authority_from` | — | `clara.accounting_plans`' own shape (0193:415-430), relaxed to NULL-able for the backfill alone. The reference is REQUIRED at signature and RESOLVED against `clara.accounting_work` / `clara.agent_tasks` in the same firm AND client — and, since **#977 (migration 0250)**, a `chat_task` reference resolves ONLY for a `chat_turn` task carrying an author (CLR38 `authority_ref_not_human_instruction` otherwise, distinct from `authority_ref_unresolved`); `authority_from` is the first day of the SIGNING month in the book's `Asia/Kuala_Lumpur` calendar, written once and frozen. `clara._tf_fa_authority_transition`'s write allowlist gained exactly these two sign-time columns, or the door could not write them at all — and, because an ALLOWLIST IS NOT A FREEZE, the same trigger carries the write-once wall for both: once either value is set, no transition may move it (CLR38 `authority_immutable`, naming the column). 0193:476-478 freezes the plan lane's twin pair the same way. |
| `clara._fa_assert_period_open(uuid,date)` | NONE — ungranted | **The fixed-asset lane's whole locked-period law, in one body.** It selects the fiscal year containing `p_date` exactly the way `0056:656-662` does, returns silently when there is none or it is `open`/`reopened`, and otherwise raises CLR38 `period_request_invalid` / axis `period_closed` naming the year, its status and the reopen path. **#678 adopts it unchanged rather than minting a second predicate.** |
| `clara.preview_depreciation_run(uuid)` | `clara_authenticated` | What the NEXT run would do: the period the DATABASE chose, per-asset amounts, the two GL legs, the skipped assets with reasons, and `mode_would_be`. It is `stable`, so the LANGUAGE refuses to let it write. The ungranted-core/granted-wrapper idiom: `clara._fa_compute_charges` stays ungranted and `rig-meta.mjs`' main sweep fails the moment a grant appears on it. |
| `clara._fa_depreciation_leg_pairing(jsonb)` | NONE — ungranted | **#973 (migration 0248).** The ONE routine that turns a charge set into the two-line-per-pair GL legs both `preview_depreciation_run` and `_fa_run_period_core` post, grouped by the PAIR of (expense account, accumulated account) — never by either account alone. Folds what used to be two independent copies of the same aggregation. **The caller owns the tenant check** — it resolves whatever asset ids it is handed, with no firm or client predicate, faithful to the two inline copies it replaces, each of which only ran inside a door that had already resolved the client and checked the firm. If a later ticket grants or widens it, the firm/client predicate has to arrive with the grant. |
| `clara._fa_assert_completion_not_a_change(uuid,jsonb)` | NONE — ungranted | **#976 (migration 0249).** The ONE routine that owns the fixed-asset "a first completion is not a change" refusal (`fa_change_class_on_completion`). It reads only the payload, which is why 0227 anchored it BEFORE `clara._reserve_op` in both completion bodies — "refused before the op key is reserved, so a retry is clean", and before the client/asset walls, so a caller who also named the wrong asset is still told what is wrong with the CALL they made. `immutable`. 0249's tail T.2d proves the call offset precedes `_reserve_op`'s in both doors. |
| `clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)` | NONE — ungranted | **#976 (migration 0249).** The ONE routine that owns the POST-LOCK half of the fixed-asset particulars completion WALL — "already complete" (`fa_particulars_already_complete`), the lifecycle check, the `_fa_validate_particulars` call and the non-depreciable/residual bounds. Everything here needs the LOCKED register row, so it runs after the select-for-update. Called by both `clara.complete_fixed_asset_particulars` and `clara._fa_complete_particulars_core` in place of each carrying its own copy. |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | NONE — ungranted | **#977 (migration 0250).** THE ONE definition of what counts as a person's instruction for an `authority_ref`, read by `clara.sign_depreciation_authority` AND `clara.create_accounting_plan`. Takes the `{kind, id}` pair each door has already validated for SHAPE plus the firm/client ladder each already applied, and returns `null` (it names a person's instruction), `authority_ref_unresolved` (no such row here) or `authority_ref_not_human_instruction` (a real chat-lane row that is not an instruction). An `accounting_work` reference still resolves by EXISTENCE alone, because `clara.accounting_work.initiator` is NOT NULL; a `chat_task` reference resolves only for a `chat_turn` task carrying an author. Each door keeps its own error class (CLR38 / CLR10) and its own sentences. |
| `clara.run_depreciation_period_for(uuid,date,text,uuid)` | `clara_runtime` ONLY | The OBO machine door, on `complete_fixed_asset_particulars_for`'s live-authority ladder verbatim (including the measured `firms … for key share` then `firm_memberships … for share` lock pair). It DELEGATES to `clara._fa_run_period_core` and inserts nothing, and carries NO floor bypass. **A NEW NAME is mandatory, not stylistic:** `rig-meta.mjs:691-693` is an executable census that fails the moment `run_depreciation_manual` reaches a machine role, because that would give the maker-checker ladder a bypass. |
| `clara.sign_depreciation_authority(uuid,uuid,text,jsonb)` | `clara_authenticated` | DROP + CREATE'd from three arguments to four — one `pg_proc` row per name, never an overload. The `0018:188` scar is the precedent: the old arity's grant died with it, so this file re-states the grant and the owner. |
| `clara.retire_depreciation_authority(uuid,uuid,text,text)` | `clara_authenticated` | RECUT by 0227 §B.3 because 0227's own `ck_fa_authorities_window` broke it. It is the ONE way a NEVER-SIGNED authority leaves `proposed` (a firm withdraws the wrong cadence), and 0041 wrote it for that case by coalescing the signature stamps rather than demanding them. It now stamps the window floor by the same `coalesce`, so the withdrawal cannot meet the CHECK as a raw 23514 with no CLR code. A SIGNED authority's floor is carried through untouched. |

**The measurement that re-aimed this slice.** The spec said a run over a closed fiscal year drafts
and dies at approve on 0056's entry-level CLR19. It does not. `clara._tf_period_wall_lines` — a
BEFORE trigger on `clara.journal_lines` — refuses the LINE insert with the same reason token, the
whole transaction rolls back, and NO draft survives. The real defect is one step further on: the due
oracle then keeps advertising that same period, once per sweep, forever — which is exactly the
failure `0042:4441` names in its own words and which `reconciler-fa.mjs:108-157` records as one
`faFailed` per client per cycle and nothing louder. 0227 therefore does BOTH halves in one file: the
wall moves to the running door (typed, before any work), AND the oracle skips a closed period and
offers the next open one, reporting what it skipped under `skipped_closed`.

**What a skip does NOT mean.** The skipped months' ARREARS are still charged by the next open
period's run, because `clara._fa_asset_charges` charges every uncharged month up to the period end
and 0227 does not touch that arithmetic (it is pinned NON-REGRESSION in the prestate and the tail).
The charge ROWS keep their own `period_start`/`period_end`, so a reader sees which month each
belongs to; the journal ENTRY is dated in the OPEN period, which is what keeps 0056's walls
satisfied and the closed year's reported figures unmoved. `skipped_closed` means "this period will
never be RUN in its own right", never "this money is gone".

**The floor removes the agent catch-up lane's reach, deliberately.** `_agent_depreciation_catchup_core`
derives every period it runs from `clara._depreciation_run_due_core` (a one-line passthrough to the
floored oracle) and `p_through` bounds only the loop's upper exit, so after 0227 that parked lane can
never propose a pre-floor period, and a future `closePrep_v2` inherits the loss. The human catch-up
door `clara.run_depreciation_manual` (bookkeeper+, caller-named period, identical mechanics) is
unchanged and is the one way back.

**One residual this lane names rather than hides.** The `period_earlier_unmet` sequencing
guarantee — the thing that pins the reducing-balance arithmetic so a run can never read around an
unapproved period — STOPS BINDING BELOW THE FLOOR for a caller-named period, because the only
instruments that could re-derive it unfloored are the one 1-arg oracle (whose consumer set is
`deepEqual`-pinned by two live CI batteries) or a bypass parameter on it (a DROP + CREATE against
§2.2 rule 4). `p651.authority.floor_sequencing` pins the exposure.

**The leg-pairing duplication this lane named as a residual is FOLDED (#973, migration 0248).**
`preview_depreciation_run` used to duplicate the poster's leg aggregation verbatim rather than
extract it (SYNTHESIS J3's ruling for this wave: a shared core inside a 0042 splice was the
riskiest edit available for a cosmetic gain), bound only by a normalized-fragment assertion in
0227's tail (T.13) and the behavioural cell `p651.preview.matches_run`. #973 lifts that fragment,
unchanged, into `clara._fa_depreciation_leg_pairing(jsonb)` — an ungranted internal core, `stable`,
owned by `clara_fn_owner` like `_fa_compute_charges` and `_fa_assert_period_open` — and both
`preview_depreciation_run` and `_fa_run_period_core` now call it. The two can no longer disagree,
because there is only one aggregation; 0227's own T.13 is untouched (it still passes at its own
point in a from-scratch chain, against the pre-fold bodies), and 0248's own tail proves the shared
call replaces its job going forward.

**The particulars-completion wall this lane named as a residual is FOLDED too (#976, migration
0249).** `clara.complete_fixed_asset_particulars` (the human door, 0041) and
`clara._fa_complete_particulars_core` (the shared core behind the runtime door
`complete_fixed_asset_particulars_for`, 0216) never routed through each other and each carried
its own copy of the "first completion is not a change" refusal and the "already complete"
refusal — #651 (0227) had to splice its new `fa_change_class_on_completion` check into BOTH
bodies separately, as two unrolled blocks with different anchors, because the human door's
anchor carries `_human_ctx` first and the core's does not. #651's own final report named the
duplication and deferred the fold; #973 named it again, out of its own scope. #976 lifts both
wall fragments, byte-for-byte unchanged, into TWO ungranted internals owned by `clara_fn_owner`
like `_fa_depreciation_leg_pairing` above — `clara._fa_assert_completion_not_a_change(uuid,
jsonb)` (`immutable`) and `clara._fa_assert_particulars_completable(uuid, clara.fixed_assets,
jsonb)` (`stable`) — and both completion bodies now call each one in place of their own copy.
Each door keeps its own op-key check, firm-membership check, row-lock, UPDATE, audit and
finish-op exactly as they were (including the DIFFERING detail shapes those OTHER refusals
already carried).

**TWO routines, not one, and that is the point.** Each half of the wall needs different things
and therefore belongs at a different point in a door. The change-class check reads only the
payload, and 0227 anchored it ahead of `clara._reserve_op` for a stated reason — "Refused BEFORE
the op key is reserved, so a retry is clean" — so it stays there. Everything else needs the
LOCKED `clara.fixed_assets` row and stays after the select-for-update. The first cut of 0249
folded both halves into the post-lock routine and deleted that sentence; two refusals a caller
SEES changed as a result (a replayed `op_key` carrying `change_class` answered CLR10 "op_key
reused with different args"; a `change_class` payload naming an asset outside the client answered
CLR11 `asset_not_found`), which the review caught and `p976.wall.before_reserve` now drives
through both doors. Two routines is still exactly ONE place per check, which is what the ticket
asks for.

**What counts as a person's instruction is now ONE rule, not two (#977, migration 0250).**
`clara.sign_depreciation_authority` and `clara.create_accounting_plan` both resolved a
`{kind:'chat_task', id}` authority reference by a BARE EXISTENCE test — a row with that id, in the
same firm and client — and both bodies said in their own comments that the named row's kind,
status and author were deliberately not read. `clara.agent_tasks` admits `chat_turn`, `wake`,
`autodraft`, `close_prep` and `accounting_work`; only a `chat_turn` is typed by a person and a
`wake` row carries no author by construction, so a task the estate enqueued for ITSELF satisfied
the same check as an instruction somebody actually gave. #651's own final report named this a
CROSS-LANE ruling rather than a lane-local patch, because narrowing one lane alone would give a
firm two meanings for one word. The owner's ruling of 2026-09-20 is narrower than the ticket's own
recommendation and says exactly which check moves: the CHAT-LANE arm, in both doors, and nothing
else. 0250 mints `clara._authority_ref_refusal(text,uuid,uuid,uuid)` (the grants table above) and
both doors read it. **The `accounting_work` arm is unchanged on purpose:**
`clara.accounting_work.initiator` is `NOT NULL` (`0178:308`), so a Work row cannot exist without
naming the person who asked for it — its existence IS the proof. **The accrual lane's own copy
(`clara._accrual_plan_core`, 0222) is DELIBERATELY untouched** and pinned byte-for-byte unmoved in
0250's prestate and tail, because the ruling names two doors and the brief puts every other lane
out of scope; the lane report files the follow-up. `clara.create_prepayment_schedule` needed no
line of its own — it passes its caller's `p_authority_ref` straight through to
`clara.create_accounting_plan`.

**A retired authority now reads back AS retired, not as "never had one" (#979, migration 0251).**
`clara.get_depreciation_authority` selected only a `live`-or-`proposed` authority (0041:4225-4227);
a client whose only authority was RETIRED read back the same bare `authority: null` a client that
never proposed one reads back — the two states were indistinguishable to any caller. The owner's
2026-09-20 ruling (on the ticket's own recommendation) says surface the retired case instead: when
the live-or-proposed select finds nothing, 0251 adds ONE fallback select to the client's most
recent retired authority (`order by retired_at desc, created_at desc`) and merges
`retired_reason`/`retired_at`/`authority_from` onto the returned object — ONLY on that retired
arm, so a live or a proposed authority's object keeps exactly the keys it always carried, byte
for byte. The existing `retired_by` field (0041:4239), previously always empty because no
retired row was ever selected, is now populated. Nothing about HOW an authority is retired, or
`clara.retire_depreciation_authority` itself, moves — that door is pinned byte-for-byte unmoved
in 0251's prestate and tail, matching the ticket's own out-of-scope line.

**And one thing this file is not.** It does NOT unpark `close_prep`: the wake source stays
registered-and-disabled, asserted in the prestate AND the tail in `0223:247-250`'s own idiom.

### Document source revision (#646, migration 0217)

A document's own *reading* now has two governed human doors and two reads, all four
`clara_authenticated` only and bookkeeper-floored inside their own bodies:

| Door | What it does |
|---|---|
| `clara.revise_document_fact(uuid,text,jsonb,int,text,text)` | Appends ONE `clara-fact-human:v1` / `invoice_facts` extraction carrying the whole fact set with one field revised. It never UPDATEs `clara.document_regions`: the kind-scoped supersede chain (0089) is what keeps the previous reading readable, and the DEFERRABLE arithmetic belt (0191) re-derives the six-term identity over the new numbers. Refusals: `stale_source_version` (CLR19, echoing the attempted value), `field_path_syntax` / `field_path_namespace` (CLR10, from `clara._assert_field_path`), `field_path_not_revisable`, `typed_facts_not_supported`, `no_facts_to_revise`, `monetary_value_malformed`, `component_must_not_be_negative`, `live_bank_statement_present`, `value_unchanged` (#885/#1030 — a revision that leaves the recorded value where it was, judged per field against the canonical form the estate keeps for it), CLR11 for a foreign document, CLR03 for an agent identity. |
| `clara.dismiss_orphaned_classification_question(uuid,text,text)` | Closes the dead end `clara.set_document_kind`'s own prose names (0169:236-255). It admits `origin='classification'` + `status='open'` + **zero live filings** for that (document, client) and nothing else; `clara._active_document_filing` is untouched, because `resolve_open_question` and `dismiss_open_question` ride it. |
| `clara.list_source_revisions(uuid)` | One chronological lineage: `clara.document_fact_revisions` LEFT-JOINED read-side to `clara.filing_corrections` and to the filings a correction retired. No door ever denormalises a wrong-client refile into the new ledger. |
| `clara.list_source_dependents(uuid)` | A READ-ONLY projection of the knowledge records, open questions and parked Work questions standing on this document. It writes nothing: automatic re-assessment is accepted-but-deferred (`docs/PRD.md:123`, owned by #658/#663). |

`clara.document_fact_revisions` is the append-only identity + receipt relation behind them — FORCE
RLS, SELECT-only for `clara_authenticated`, no DML for any application role, two `revision_kind`
values (`fact`, `kind`) and **no** `correction_id` column. `observed_extraction_id` is the
reading the decision was made against, as it stood inside the revising transaction, and which row
that is depends on the kind: a `'fact'` row names the kind-current `invoice_facts` extraction it
superseded, a `'kind'` row names `clara.documents.authoritative_extraction_id` (the document-wide
pointer, which a human kind change repoints at a `doc_classify` row).
`observed_version_n` is the facts version (the count of done `invoice_facts` extractions), which a
fact revision QUOTES and a kind revision derives.

`document.fact_revised` is registered `client_scoped` and emitted with the document's **sole live
filing's** client, which is SQL NULL when the document is live in zero or in more than one client.
`clara.list_activity` filters `(p_client is null or client_id = p_client)`, so such a revision
appears in the firm-wide activity feed and in **no** client's feed. That is the deliberate
consequence of not guessing a client for a multi-filed document (the ledger row's `client_id`
carries the same NULL for the same reason); emitting one event per live filing is a change #676's
posted-effect work should decide, not this ticket.

0217 also recuts `clara.set_document_kind` — signature unchanged — so a kind change records the
same observation and its own `'kind'` revision row. **D1 write-quiesce is owed** for that recut
(see the Deploy contract above). #646 mints no `clara.accounting_work` row and widens no purpose
CHECK; the posted-effect integration is #676. What a correction does to the Work *waiting* on the
document is migration 0268's, below.

### A source correction retires the Work waiting on it (#885, migration 0268)

Owner ruling, 2026-09-17 and re-confirmed 2026-09-20: **a person must never be able to answer a
question asked against a reading that has been corrected.** 0268 makes that structural rather than
advisory. #658's `WorkKnowledgeDriftBanner` does not discharge it — it is keyed on
`clara.knowledge_records.knowledge_version`, and a fact revision writes nothing there (0217:53), so
on this very case it never appears, and it only warns.

`clara.revise_document_fact` now cancels and re-admits, **inside its own transaction** (the ruling's
recorded preference, so no frozen document-ingest closure is touched and there is no window in which
the corrected document and the still-answerable question coexist):

| Object | What it is |
|---|---|
| `clara._source_corrected_work(uuid,uuid)` | The ONE rule: a Work of this firm that still has a PENDING question, names this document in its own `source_refs`, holds NO committed receipt, and is in `queued` / `running` / `awaiting_input`. The write-side twin of `list_source_dependents`' `work_questions` arm, narrowed by the last two terms. Ungranted. |
| `clara._lock_source_corrected_work(uuid,uuid)` | Takes the `accounting_work → agent_tasks → agent_interruptions` rungs for that set and returns exactly the ids it locked. Ungranted. |
| `clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)` | Re-asks the rule under those locks and retires each Work through `clara.cancel_accounting_work`, admitting **no** successor on any arm. Ungranted. |
| `clara._question_source_corrected(uuid)` | WHEN the source a question stands on was last corrected, if it was corrected **after** the question was asked AND that revision changed the value — the instant, or NULL. Same firm and `source_refs` terms as the rule above. Ungranted. |
| `clara._fact_value_changed(jsonb,jsonb)` | Did a revision change the RECORDED value? Normalised cents when both sides carry them, else the trimmed text. The one notion the correcting door refuses a no-op with and the predicate above reads a revision row through. Ungranted. |

**The retirement rides 0199's own door.** `clara.cancel_accounting_work` appends the single
`work.cancelled` domain event; 0268 registers **no** new event type and **no** taxonomy row, and
mints no `supersedes` / `superseded_by` of its own.

**Every affected Work is retired, and NOTHING is re-admitted in its place.** The first cut
re-admitted a successor when `basis_origin = 'user_direct'`, on the argument that a human's
instruction survives a correction of the document it was read from. Measured end to end on the
lane rig, that argument costs the ruling its second half: the successor's `basis_digest` is
byte-identical to the retired Work's (it is fixed at admission), `clara._record_journal_entry_core`
compares a posted basis against it, and nothing in the estate compares a posted AMOUNT against the
document's facts — so posting the CORRECTED figure under the successor is refused CLR10
`basis_mismatch` while posting the RETIRED one is ACCEPTED and evidence-linked to the corrected
document. A person who typed the figure printed on the invoice typed the reading that has just
moved. So no basis kind is carried forward: every affected Work is cancelled, `replaced` is always
`false`, `new_work_id` is always null, and the receipt says WHY in one of two words —
`interpreted_basis` (the figures were derived from the value that changed) or
`basis_predates_correction` (a person stated them before it changed). Both mean *state it again*,
through #721's own restatement door. `packages/db/tests/work-source-correction-supersede.test.mjs`
`w885.no_stale_post` pins the property as an absence: after a correction from RM 640.00 to
RM 999.00, no Work the door touched or created can put a 64000-cent line on the books against that
document.

**A KEYSTROKE IS NOT A CORRECTION.** `clara.revise_document_fact` refuses a revision that leaves
the recorded value where it was: CLR10 `value_unchanged`, raised before anything is written — no
extraction, no revision row, no `facts_version`, and above all no retirement and no question turned
unanswerable. *Unchanged* means the STORED value, not the keystrokes: the normalised cents when both
sides carry them (so `RM 880.00` typed over `880.00` is the same fact), otherwise the trimmed text; a
fact the reader never persisted has no prior value, and anything is a change against nothing.
`clara._fact_value_changed(jsonb,jsonb)` is that one notion, and BOTH the door and
`clara._question_source_corrected` ask it — the predicate reads revision rows through it too, so a
row written before this guard existed cannot make a question read as source-corrected either.
Pinned by `w885.noop.refused`.

**…AND A RE-SPELLING IS NOT A CORRECTION EITHER, WHERE THE ESTATE HAS A CANONICAL FORM** (#1030,
`0321_work_source_correction_rederivation.sql`). #885 implemented "the stored value, not the
keystrokes" for MONEY only, so re-casing `MYR` to `myr` or respelling a date to the same calendar
day still retired every Work parked on that document and made a carved-out question's answer
permanently refused. The rule is now decided **per field, and the test is whether the estate has a
canonical form for that field's value**:

| field | what "unchanged" means | why |
|---|---|---|
| every monetary path | the normalised **cents** | 0268's own rule, unchanged and reached by delegation |
| `invoice.currency` | the **ISO 4217 code**, case-insensitively, **when both sides spell a three-letter code** | the standard defines the code, not its typography, and this estate stores it upper-cased everywhere it reaches the books — but a region carrying PROSE ("Ringgit Malaysia") has no canonical form and gets the text rule, which the first cut got wrong (ADV-C1-06) |
| `invoice.invoice_date` | the **calendar day**, when both sides spell one **unambiguously** | `5 March 2026` and `2026-03-05` are the same day. `clara._fact_calendar_day` pins `DateStyle` to `ISO, YMD`, so a slash or dot date whose meaning depends on the session (`03/05/2026` is 3 May on a Malaysian invoice and 5 March under this cluster's MDY) answers NULL and falls through to the text rule. Without the pin the guard REFUSED a real correction of an ambiguous printed date, and which one it refused moved with the session — measured across all three orderings (ADV-C1-04) |
| everything else (`invoice.vendor_name`, `invoice.invoice_id`, a registration number, …) | the **trimmed text**, exactly as before | the estate has no canonical form for a name or an identifier, so the recorded spelling IS the fact — a professional correcting `ACME SDN BHD` to the mixed case actually printed on the page is making a real correction, and folding that into the guard would leave them a door that refuses the only edit they wanted |

`clara._fact_value_changed(jsonb,jsonb)` is **not** recut: it still answers exactly what it always
answered for a caller with no field path. The typed notion is a three-argument sibling,
`clara._fact_value_changed(jsonb,jsonb,text)`, which delegates to it for every field the estate
does not canonicalise, and both of 0268's callers pass the path they already hold — the door's
`p_field_path` and the predicate's `r.field_path` — so the one-notion property is kept. A NULL path
is the two-argument answer, so a caller who does not know the field can never get the widened one.
Pinned by `r1030.cosmetic.canonical`, `r1030.cosmetic.control` and `r1030.cosmetic.text`, and by
0321's own §TAIL, which drives all four arms and re-derives both recut bodies by reversing their
single substitution.

**THE RE-DERIVATION LANE — the successor #885 could not admit** (#1030, 0321). #885 retires a Work
and admits nothing, because deriving a basis from a corrected reading is an interpretation act and
`journalBasisSchema` has no back-link from a line to a document field path. 0321 does not derive
anything either: it hands the Work runtime what it needs and takes back one answer.

| door | granted to | what it is |
|---|---|---|
| `clara.source_correction_rederivations(int)` | `clara_runtime` | every source correction that retired a Work and is still owed a successor, oldest first, each as a full brief: the correction (`prior_value`, `new_value`, `corrected_by`), the RETIRED INSTRUCTION (`retired_purpose`, `retired_source_refs`, `retired_basis`, `retired_basis_origin`) and the document's **live facts** off its newest done `invoice_facts` extraction. The figures' only source of truth is `live_facts`; the retired basis is there to be QUOTED, never carried. Capped at 200 per call. |
| `clara.settle_source_corrected_rederivation(text,uuid,text)` | `clara_runtime` | the ONE answer per correction: the successor that was admitted, or the reason none could be. Claiming sets `superseded_by` on the retired Work and `supersedes` on the successor — the link #885 deliberately left NULL — and it is **proved, not asserted**: the successor must be a Work of the same firm and client whose own `intent_key` IS this correction's op key. Exactly once, through `clara._reserve_op` / `clara._finish_op` under `fn = 'source_correction_rederivation'`. Refusals: CLR10 `invalid_op_key`, CLR11 `correction_not_found`, CLR10 `successor_not_for_this_correction`, CLR10 `decline_reason_required`. |
| `clara.source_correction_successor_brief(uuid)` | `clara_runtime` | is this Work the successor a correction owed, and if so BOTH figures its own run must name before anything may post (`retired_reading`, `corrected_reading`) plus the retired basis. NULL for every ordinary Work, so a run can ask unconditionally. |

**Why a backlog and not the retired run.** The retirement puts the parked task into
`cancel_requested`, and the runtime's control listener then ABORTS that engine run — so the retired
run is not guaranteed to be resumed at all and cannot be the lane that re-derives. A durable,
restartable backlog plus an exactly-once settlement is what survives that. A lane that crashes
between admitting and settling re-reads the SAME correction and re-admits idempotently, because the
successor's `intent_key` is the op key and `clara.admit_journal_work` replays on it.

**0321 writes no row at apply** (§TAIL T9) — on a FIRST APPLY, which is the only mode that can
state it. §0 hands §TAIL its mode through 0115's temporary-table idiom, because between the first
apply and a REDO of an unmerged file a rig runs the battery and the lane writes real settlements
this file did not write; the redo branch reports the count instead of refusing over it. A
from-scratch chain always takes the first-apply branch. Corrections retired before 0321 stay
exactly where #885 left them until the runtime lane reaches them.

**A RECORDING IS NOT ITS OWN LOOK-ALIKE** (#1135's cut-phase fix round,
`0323_trade_invoice_probe_self_exclusion.sql`). `chatTurn_v22` calls #1007's duplicate probe BEFORE
`clara.admit_trade_invoice_work`, and the admission door is idempotent on its intent key — so a
retried tool call was shown the invoice its OWN earlier attempt had admitted, and the tool asked
the person whether to record a duplicate of their own recording. Measured on `clara_l01` as
`clara_runtime` in one rolled-back transaction: probe 0 matches → admit invoice X → admit again
under the same key replays X → probe now returns X.

0323 adds SIBLINGS and edits nothing: `clara._trade_invoice_probe_core(uuid,text,jsonb,text)` calls
0275's three-argument core and removes the invoices recorded under the caller's own intent key,
restating `match_count` over what survives; `clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)`
(`clara_runtime`) is the door that carries the key. Neither new argument has a DEFAULT, so a
four-argument call still resolves to 0275's own door — which `chatTurn_v21`'s parked runs reach and
which §TAIL pins byte-for-byte along with four other bodies. The acknowledgement door is
deliberately untouched: with the self-match gone a retried identical recording is shown the same
earlier invoices, hashes the same `ack_digest` and replays the first row, while 0275's own
ADV-1007-1 ruling — a second acknowledgement under one key for DIFFERENT figures is a second record
by design — stays true and stays green. Pinned by
`packages/db/tests/trade-invoice-probe-self-exclusion.test.mjs` (4 cells, one of which reproduces
the self-match against the four-argument door so the fix cannot be quietly undone).

**A question whose source was corrected is not answerable — even where the Work is carved out.**
The retirement rule deliberately does not touch a Work holding a committed receipt (#676's
territory), and before this round a person could still answer that Work's pending question after
the document's reading had moved — measured ACCEPTED. `clara.answer_work_question` now asks
`clara._question_source_corrected(question)` and refuses CLR13 `source_corrected` whenever the
source moved after the question was asked, carrying the instant on `detail.current
.source_corrected_at`; the same word replaces `cancelled` for a question the retirement closed, so
the refusal says what changed rather than only that something did. The Work itself is still
untouched: it is the ANSWER that is refused. `clara._work_question_record` projects
`source_corrected_at` **and `work_posted`** beside 0180's own keys, so B3/B4/B6 render the sentence
instead of an answer form — and render the RIGHT sentence: a retired Work is restated on the
corrected document, while a Work that already posted cannot be restated at all
(`clara.restate_accounting_work` refuses it CLR13 `not_restatable`), so its sentence names Cancel
Work and the rail withholds the restate control there.

**What is NOT delivered here, and who owes it.** "Re-admitted ON THE CORRECTED FACTS" needs
somebody to re-read the corrected document and propose a basis from it. `journalBasisSchema`
(`packages/runtime/workflows/claraWork.v1.tools.ts`) is posting date, memo, currency and lines of
integer cents with NO back-link from a line to a document field path, so mapping a corrected
`invoice.total` onto debit and credit lines is an interpretation act, not a projection — it cannot
be constructed in SQL. That step belongs to the wave-4 shared cut (`claraWork_v6` /
`chatTurn_v22`); until it lands, the honest mechanism is the one above: retire, tell the person,
and let them restate.

The REASON is durable on the cancellation's own op key, `source_corrected:<revision id>:<old work
id>` on `clara.op_receipts`, plus the `superseded_work` array 0268 adds to the revision's receipt
and audit row. It is a *derived key*, not a first-class cancellation
reason: `clara.cancel_accounting_work(uuid,uuid,text)` takes no reason argument and its
`work.cancelled` payload carries none, so a feed row recovers the cause by reading that key. Giving
the cancellation a reason column or event key is a recut of 0199's door and belongs to the ticket
that needs it (#840).

**The lock order is why `clara.documents` is no longer this door's first lock.** The declared global
order is `accounting_plans → accounting_work → agent_tasks → agent_interruptions` (0193:248). The
journal lane already takes `clara.documents` *while holding* the `accounting_work` rung —
`clara._lock_document_binding` (0197:329) fires from BEFORE ROW triggers on `clara.journal_entries`
and `clara.entry_evidence_links`. A correcting transaction that took `clara.documents` first and then
reached for a Work row would be the opposite direction of that same edge, i.e. an ABBA deadlock
against any posting transaction. So `clara.revise_document_fact` takes the Work rungs first, through
the lock helper, and 0217's own document lock — unmoved, not one line changed — now sits below them.
0268's tail asserts that order positionally in the committed body text.

**A bookkeeper's correction is never refused because of a Work they were not acting on.** The first
cut called `restate_accounting_work`, whose typed refusals are about a *Work* rather than about the
document — a non-journal purpose, a document that already backs a posted entry **of some other
Work**, a client gone inactive — and let them propagate, which made a human door hostage to a Work
the human was not acting on. Measured on the lane rig: a sibling Work's posting refused a bookkeeper's
correction outright with CLR13 `source_already_posted`, naming an entry they never touched. The
second cut removed the call altogether — no arm re-admits, so no refusal from that door can reach
this one — and the property is now structural rather than caught: nothing in this path can raise a
refusal about a sibling Work.

**`clara.answer_work_question` gains two words and one arm.** Its existing CLR13 status refusal
reads `detail.reason = 'source_corrected'` when the source moved after the question was asked, and
`'superseded'` — instead of `cancelled` — when the question was closed by the cancel cascade *and*
the Work carries `superseded_by` (a #721 restatement; a source correction no longer writes one), with
`detail.current.superseded_by` naming the successor. The ARM is the new one: a question that is still
PENDING is refused outright when its source was corrected, which is the only way #676's
committed-receipt carve-out and the ruling's absolute sentence can both hold. Every other status keeps the exact word 0180 gave it, `already_answered` still wins, and a
plain cancel (no successor) still answers `cancelled`. A #721 restatement reaches the same new word,
which is correct: the reason the question was retired is the same in both cases.

**D1 write-quiesce is owed** for both recut bodies (`clara.revise_document_fact`,
`clara.answer_work_question`) — see the Deploy contract above. Not covered by 0268, deliberately:
re-evaluating a *posted* result (#676) and re-assessing recorded experience (`docs/PRD.md:123`,
#658/#663) both stay parked, and `clara.list_source_dependents` is NOT recut — its job is to show a
human everything standing on the document, including the rows this rule leaves alone.

## Knowledge scope, firm defaults and exceptions

A governed knowledge record (`0192_client_knowledge_records.sql`) carries one of two scopes.
`client` is the default; `firm` is an explicit act that `clara._knowledge_floor` floors at admin+
no matter what the key's own floor says (#603 Q22). Both reads — `clara.list_client_knowledge` for
the register and `clara.get_knowledge_pack` for a run — shadow a firm row behind a client row only
at the **same key AND the same `applies_when_digest`**. That is what makes a client exception a
first-class fact rather than a race: `uq_knowledge_live` already treats two live rows of one key as
independent whenever their applicability differs, so a client row scoped to one narrow condition
overrides the firm row carrying that condition and leaves an unconditional firm default standing.

`0220_firm_knowledge_defaults.sql` adds what that model was missing, and no write door:

- **Which keys may be defaulted** — `clara.knowledge_key_firm_eligibility`, an append-only,
  code-populated, FORCE-RLS catalog seeded with `default_currency`, `reporting_framework` and
  `accounting_basis` (owner ruling D8). `clara._tf_knowledge_firm_eligibility`, a BEFORE INSERT
  trigger on `clara.knowledge_records`, refuses any other key at firm scope with CLR10
  `knowledge_scope_not_firm_defaultable` — unless the catalog types it a `preference` or a
  `policy`, the two kinds a firm can hold on its own behalf. On the 14-key catalog
  (`0240_financial_year_end_day.sql` added the fourteenth) that admits four keys in all (the three
  seeds plus `coa_seed_decision`) and refuses ten, `entity_type`, `msic`, `sst_regime`,
  `financial_year_end_month` and `financial_year_end_day` among them: a client-identity fact is
  never a firm default. `knowledge_keys.scope_default` was never the mechanism — that table is
  append-only on UPDATE, so its already-seeded rows could never have been re-defaulted — and
  `0241_knowledge_scope_default_drop.sql` (#913) has since dropped the column outright: three
  writes, zero reads, confirmed dead by #654's own triage before this file ever named it a
  non-mechanism.
- **What a firm default may cite** — `clara._tf_knowledge_firm_evidence`, the second BEFORE INSERT
  trigger, refuses a firm-scope record pinning a document that carries **any** live
  `clara.document_filings` row (CLR10 `firm_scope_client_evidence`) and a firm-scope record pinning
  **any** `clara.accounting_work` at all (CLR10 `firm_scope_client_work`; `accounting_work.client_id`
  is NOT NULL, so every Work is one client's). Those are the only two client-bearing pins — the
  extraction / region / field pins cannot exist without `source_document_id` and are covered
  transitively. `uq_document_filing_active` is over `(document_id, client_id) where retired_at is
  null`, so one document may hold N live filings and the wall counts rather than probes for one. An
  **unfiled firm document stays admissible** — the case 0192 reserves in its own voice — and
  retiring the last filing makes a document admissible again. This is not an RLS disclosure fix
  (`clara.documents` is already firm-readable); it stops one client's evidence travelling as the
  stated basis of a rule applied to every other client, first of all inside a model's knowledge pack.
- **The same wall from the filing side** — `clara._tf_document_filing_firm_knowledge`, a BEFORE
  INSERT OR UPDATE trigger on `clara.document_filings`, refuses filing a document that a **live**
  firm-scope record cites (CLR10 `document_cited_by_firm_default`, naming the record and the key).
  Without it the wall was one-way: filing the document *after* the rule cited it produced the same
  contamination, and the INSERT wall then refused the retraction too, because a withdrawal carries
  the predecessor's pins verbatim. So `_tf_knowledge_firm_evidence` also **admits a correction or
  withdrawal that introduces no new pin** — narrowly: a correction that re-aims a firm rule onto a
  client's document or Work is still refused. The invariant, stated once: *no live firm-scope
  knowledge record may cite a document carrying a live client filing, or any accounting_work at
  all.* A superseded or withdrawn revision reaches no client and blocks no filing.
- **And the wall decides the concurrent case, not only the sequential one** — two BEFORE-row
  triggers that each read the other's table do not give that for free: under READ COMMITTED neither
  sees the other transaction's uncommitted row, so a capture and a filing naming the same document
  could both commit. Measured on the rig before the lock: three of the four arrival orders left one
  live firm-scope record citing a live client filing, and the fourth was safe only because
  `clara._file_document_write` happens to take `clara.documents ... for update`. Both halves now
  take one shared **advisory transaction lock** keyed on the document
  (`clara.firm_knowledge_evidence:<document_id>`), and `_tf_knowledge_firm_evidence` takes the
  `clara.documents` FOR KEY SHARE row lock first — the same lock its own FK check takes moments
  later — so both lanes acquire in the order the filing lane already uses and the pair cannot
  deadlock. Cell: `p654.evidence.race_capture_vs_filing`, all four arrival orders, with and without
  the filing door's own row lock.
- **Two viewer-floored reads, `clara_authenticated` only** — `clara.list_firm_knowledge()` returns
  this firm's rules with the authority each promotion recorded, the live client exceptions at the
  same key and applicability, and the non-terminal Work citing the key;
  `clara.get_knowledge_applicability(p_client, p_knowledge_key)` answers, per applicability, which
  of the firm rule and the client exception is in force and why. Nothing is granted to
  `clara_runtime`, `clara_agent_ro` or either wake role (0057's dark-grant rule). "Today" in both
  reads is resolved server-side in `Asia/Kuala_Lumpur` and returned as `as_of`.

Both `knowledge_records` guards fire only for `scope_kind = 'firm'`; the client lane is
byte-unaffected. They are named so they sort AFTER 0192's own `t_knowledge_records_authority`, which
stamps `applies_when_digest` and refuses an unknown key first — `0220`'s tail asserts that order off
`pg_trigger` rather than trusting the alphabet, and asserts the filing-side guard's attachment
beside it. 0220 recuts no 0192 body and therefore pins none.

A promotion is `clara.capture_knowledge(p_scope_kind => 'firm')` with an **authored** reason, never
the client row's own basis, and no source pins; a correction or withdrawal of a firm rule rides the
shipped `correct_knowledge` / `withdraw_knowledge` at the same floor, from `/settings/knowledge`. Automatic re-evaluation of
affected work is NOT built here — `docs/PRD.md:123` defers it to #658/#663 — so the register ships
the human-review affordance instead.

Battery: [tests/knowledge-firm-defaults.test.mjs](tests/knowledge-firm-defaults.test.mjs), gated by
`knowledge-firm-defaults-preintegration-gate.mjs`.

### Bounded knowledge retrieval, the recorded read-set and drift (#658, 0230)

`0230_knowledge_retrieval.sql` adds **seven granted functions, one ungranted core and one
relation**, and **recuts nothing** — eight bodies (`get_knowledge_pack`, `list_client_knowledge`,
`_knowledge_legacy_rows`, `_knowledge_capture_core`, `_knowledge_floor`, `capture_knowledge`,
`get_context_pack`, `answer_work_question`) are pinned by pre-image `sha256(prosrc)` **measured on
a migrated rig**, never transcribed from file text, and re-read from the catalog in the tail.

The doors, their floors and their grants:

| Door | Lane | Floor / binding |
|---|---|---|
| `retrieve_knowledge(p_client, p_purpose, p_as_of, p_keys, p_limit, p_firm)` | `clara_runtime` ONLY | the pack's own lane picker (0192:1474-1500); `p_firm` required on the machine arm |
| `read_knowledge_record_for(p_firm, p_client, p_record)` | `clara_runtime` ONLY | actor-explicit; CLR11 with no existence oracle |
| `read_knowledge_history_for(p_firm, p_client, p_record)` | `clara_runtime` ONLY | actor-explicit; CLR11 with no existence oracle |
| `record_work_knowledge_read(p_task, …)` | `clara_runtime` ONLY | work/firm/client DERIVED from the positive `agent_tasks → accounting_work` join |
| `work_knowledge_drift_for(p_firm, p_work)` | `clara_runtime` ONLY | firm explicit |
| `work_knowledge_drift(p_work)` | `clara_authenticated` ONLY | `_human_ctx(role_rank('viewer'))`, firm from the session |
| `list_work_knowledge_reads_for_record(p_record)` | `clara_authenticated` ONLY | viewer floor; scope taken from the RECORD, firm-bounded |

**`retrieve_knowledge` is pack-shaped, so #783 binds it.** The ruling lives at
`.out-of-scope/human-read-of-knowledge-pack.md` — "the register is the human surface; the pack is
the model's" — and the tail asserts the ABSENCE **positively**: no human role, no agent read role
and no wake lane holds EXECUTE on any of the three pack-shaped reads, with #783 named in the
failure message. "One register, one pack, one answer" is proven BEHAVIOURALLY instead, by
`p658.retrieve.shadow_parity` across two personas.

**#991 restates that rule as a CLASS, with its own census.** The owner's ruling (2026-09-20, issue
#991) reads #783 as covering every *assembled pack-shaped knowledge read* — not only the three
functions it happened to name. `tests/pack-shaped-knowledge-read-census.test.mjs` holds the class as
DATA (`PACK_SHAPED_KNOWLEDGE_READS`, seeded with `get_knowledge_pack`, `retrieve_knowledge`,
`read_knowledge_record_for` and `read_knowledge_history_for`) and walks it against every `clara%`
role the LIVE catalog reports — not a hand list of eight — so a fifth pack-shaped read is a new
array entry, never a new assertion, and a role born in a migration written after #991 is caught the
same as one of the original eight. `get_context_pack` stays outside the class on purpose: it is
granted to `clara_authenticated` and `clara_agent_ro` by design (0005:1137) because it is a
different door's assembled read, not a knowledge pack, and the file's own CONTROL cell (`pkc.4`)
proves that exclusion is curation — run through the identical detector, `get_context_pack`'s grants
DO trip it — rather than the detector missing it. The blueprint wording for the rule itself
(`.out-of-scope/human-read-of-knowledge-pack.md`, referenced above) is left as #783's; #991's
acceptance keeps that drift under #683, moved only in a Wayfinder or to-spec pass.

**The seventh door does not breach that, and its own header says why.**
`list_work_knowledge_reads_for_record` IS granted to `clara_authenticated` because it returns READ
METADATA — which Work, at which `knowledge_version` and `as_of`, under which `purpose`, with which
face word, over which key NAMES — and never a record's value, its `applies_when`, source bytes or
any assembled pack content. `DECISIONS.md:83` mandates exactly this door for exactly this reason:
`clara.work_knowledge_reads` is FORCE-RLS with **no app-role SELECT**, so a SECURITY DEFINER door is
the only human path to it and a `grant select` is not an alternative. The tail asserts that grant
positively too — `clara_authenticated` and NOBODY else — and re-proves that the relation itself
gains no privilege of any kind after it.

**`clara.work_knowledge_reads` carries NO foreign key to `clara.accounting_work`, deliberately.**
The reason is quoted from 0195's own measurement (`0195:254-268`) so a later "hardening" pass
cannot add it back for want of a written reason: an FK takes `FOR KEY SHARE` on the Work row, the
posting core holds `FOR UPDATE` on exactly that row, and a measured trace insert **blocked 4001 ms
behind a posting lock and was then silently cancelled**. The binding is enforced by the sole writer
instead. The status CHECK admits exactly `ok` / `partial` / `unknown` / `denied` and **refuses the
runtime's own `unavailable`**, so that word can never reach a register through a column; the
mapping between the two vocabularies is exported once, as `faceStatusOf` in
`packages/runtime/lib/knowledge-retrieval.mjs`.

`work_knowledge_drift` / `_for` answer over ONE ungranted core, which prefers the recorded
read-set and falls back to `work_execution_traces.observed_revisions->>'knowledge_version'`. On
that fallback arm `relevant` is **null, never false**: no read-set was recorded, so "nothing
relevant moved" would be a claim about keys nobody wrote down. The envelope also carries `read` —
the last attempt's face word, reason, tier counts and key NAMES — so B3's Work detail needs no
eighth door for one panel.

**The moved-key scan applies the same per-applicability shadow the READ applied** (`0192:1355-1363`,
copied into `retrieve_knowledge` and into the seventh door). A firm default that is shadowed for
this client is a record the run provably did not read, so intersecting it with the read-set on the
key name would report `relevant` for a basis that did not move — and the Work detail would tell a
person "a record this Work read has changed" about a record it never read. Two deliberate
non-symmetries around it, both asserted: the scan applies **no `state`/`superseded_at` filter**,
because a withdrawn record is a revision at a higher version and "the exception you were relying on
was withdrawn" is the most relevant thing that can happen to a basis; and the **watermark stays
unshadowed**, because it is the shipped `0192:1333-1335` expression the read itself records, so
`drifted` keeps meaning "something in your scope moved" while `relevant` means "and it was yours".

**What a read-set row may contain is walled by the column, not only by the writer.** `keys` has a
grammar (`^[a-z][a-z0-9_]{0,62}$` — originally stricter than each catalog's own `btrim(...) <> ''`,
which this file's header recorded as a hazard for the next key-minting migration;
`0242_knowledge_key_grammar.sql` (#993) has since tightened `clara.knowledge_keys.knowledge_key`
and `clara.client_fact_keys.fact_key` to the SAME grammar under their own
`ck_..._key_grammar` CHECK constraints, so a key either catalog accepts and a key this recorder can
record are now the same set by construction — this function's own check stays the source of truth
and was not touched, which `tests/knowledge-key-grammar.test.mjs` kg.05 proves by pinning the
recorder's `prosrc` sha256 against the value 0230 produces and re-asserting that the recorder
still runs that same grammar literal; 0242's own tail asserts only that the recorder still
RESOLVES at its 0230 signature and prints the sha as as-run evidence, so kg.05 is the pin) and a
400-key cap; `tiers` is a closed
vocabulary `{core, requested, remainder}` of non-negative integers; `as_of` must be a **finite**
date (`infinity` is a real date value, and this relation can never delete a row); and
`payload_digest` records the facts the row carries. The reason is the file's own: the read-set must
not become a payload slot by the back door, on an APPEND-ONLY relation that both drift doors hand
back verbatim to the human lane and the runtime lane alike.

**A replay is named.** `record_work_knowledge_read` stays replay-idempotent on `(work_id, run_id,
seq)` — a WDK re-execution lands on the original row — but the receipt now carries `replayed`,
`payload_digest`, `stored_digest` and `payload_match`, so a re-execution that carried **different**
facts (first attempt `ok`, second `denied` because a record was withdrawn mid-flight) is reported
rather than answered with a silent `ok`. It does not refuse the way `clara._reserve_op` does on the
same mismatch: an op-key governs a WRITE, this governs a record OF A READ, and a diagnostic write
that could settle a Work would be worse than the divergence it reports.

**Non-goals, stated here as well as in the file**: #658 captures nothing, corrects nothing,
promotes nothing, accrues no experience and writes no wiki/OKF page (#663's engine); it registers
no domain event; it mints no knowledge key and no per-key side table; it widens no
`accounting_work.purpose`; and `p_purpose` is RECORDED and ECHOED and filters NOTHING —
`p658.retrieve.purpose_is_recorded_not_filtered` asserts that so a later ticket has a red cell to
flip.

Battery: [tests/knowledge-retrieval.test.mjs](tests/knowledge-retrieval.test.mjs), gated by
`knowledge-retrieval-preintegration-gate.mjs`.


### The prepayment-amortisation lane (#653, 0223)

`clara.create_prepayment_schedule` is the one write of that lane and it is unusual in two ways a
census reader should know about. It CALLS A FROZEN EVALUATOR AS A DEFINER rather than through a
grant: `clara.prepayment_schedule_v1` is a registered single-member `clara.evaluator_versions`
closure AND a member of the rig's closed ungranted census
([tests/rig-meta.mjs](tests/rig-meta.mjs)), so minting a grant to reach it would red the rig and
editing it would red the apply. And it RE-DERIVES the expense half of the schedule — the judged
account, its eligibility wall, its stated-grounds wall and the "this term charges nothing per
period" refusal — because those live only inside `clara._agent_prepayment_schedule_core`, which is
bound to the 0045 template lane behind a registered-and-disabled wake source. The re-derivation
uses 0140's OWN three tokens and 0042's own eligibility helper; a second vocabulary for one rule is
how two lanes start disagreeing about what is eligible.

The door applies that same 0042 eligibility helper to the PREPAID leg as well as to the judged
expense account, and that is not symmetry for its own sake. `clara.prepayment_schedule_v1` takes
"the one debited asset leg" verbatim and never asks which asset, so its whole predicate is
satisfied by every ordinary sales invoice, every documented bank receipt and every fixed-asset
purchase; without the wall the door would amortise a receivable into an expense for a whole stated
term. The refusal is 0140's own `prepayment_source_unfit` with `axis: prepaid_account_ineligible`
— no new vocabulary. The wall is NEGATIVE (is this leg ineligible?) rather than a positive
prepayment-class roster, so an ordinary unclassified asset still passes; that residual is named.

The three reads sit at the viewer floor. `clara.list_prepayment_attention` is the lane's
refusal-visibility read and has TWO arms because one cannot reach both residues: arm A is a live
amortisation plan whose most recent occurrence put no money on the books (at admission, or at the
posting core — a locked period is the posting core's refusal, not the plan's), and arm B is an
approved, document-bound, single-asset-debit entry **whose debited asset passes the same
eligibility wall the door applies** and that no schedule names, which is the only durable trace of
a create-time refusal. The band and the door therefore cannot advertise and refuse the same entry.
Each arm is ORDERED NEWEST FIRST AND THEN CUT at fifty, and the envelope carries
`refusing_truncated` / `unscheduled_truncated` / `cap`: a cut applied to an unordered select is an
arbitrary fifty, and the row this read exists to surface is precisely the newest one. A memo-only
recognition binds no document and is reachable by neither arm; that residual is named rather than
closed.

## Frozen evaluator deployment

An evaluator registered as undeployed remains unavailable until deliberately activated.
There are two separate steps:

1. `node packages/db/scripts/deploy-evaluator-version.mjs --name <name> --version <version>`
   changes the database row under the bare migration principal, with no active SET ROLE.
2. `node scripts/check-frozen-evaluators.mjs --lock-deployed` locks the repository manifest.

The database transition is one-way and hash-verified. The manifest command marks **every**
currently unlocked entry deployed; it is not a per-entry operation. Reconcile the intended
deployment set first. Neither step substitutes for the other.

## Backup and recovery

The default `backup` is a **diagnostic snapshot only**: it omits engine state and strips
owners/privileges. Do not start a restored diagnostic snapshot as an application database.

`backup:full` preserves owners and privileges across `clara`, `workflow`,
`workflow_drizzle` and `graphile_worker`. Its globals dump is supporting evidence;
[deploy/roles-bootstrap.sql](deploy/roles-bootstrap.sql) recreates custom roles on a fresh target.

A hosted ceremony's full backup goes through `scripts/ops/dsn-pipe.mjs`, which pins the ceremony
CA onto the DSN and never lets the DSN itself reach argv or disk. PostgreSQL 17 client tools live
only in WSL on the Windows release rig, and the committed CA's path is written in the Windows
spelling, which a WSL child cannot open — pass `--child-os wsl` (or simply invoke `wsl` as the
child command; it is auto-detected too) and dsn-pipe respells the DSN's `sslrootcert` plus
`PGSSLROOTCERT`/`NODE_EXTRA_CA_CERTS` to the `/mnt/<drive>/…` form, and sets `WSLENV` so those two
vars, the six PG identity vars and `CLARA_BACKUP_DIR` (translated by WSL's own `/p` flag, since
dsn-pipe never touches it directly) actually cross the Windows/WSL boundary (`DATABASE_URL` is
deliberately never listed there — the DSN itself stays local to this process and its direct
`wsl` child; only the individual PG\*/backup-dir vars cross):

```sh
<dsn> | node scripts/ops/dsn-pipe.mjs --child-os wsl -- \
  wsl -u root -- bash -c 'node packages/db/scripts/backup.mjs --profile full'
```

The CA fingerprint check always runs against the original Windows-spelled file; only the emitted
values are respelled (#917).

**TLS exclusivity on the WSL side is narrower than on the Windows side (#917, L05B-S01).** A bare
`pg_dump`/`psql` on the WSL side reads `PGSSLMODE=verify-full` + `PGSSLROOTCERT` and still treats
the pinned CA as EXCLUSIVE, same as any native invocation. But `backup.mjs --profile full` also
opens a Node `pg` client, and on the WSL side that client sees no `DATABASE_URL` (it is
deliberately not in `WSLENV`), so `packages/db/lib/pg.mjs`'s `connConfig()` returns `{}` and
node-postgres falls back to reading TLS settings from the environment: `PGSSLMODE=verify-full`
becomes a bare `ssl: true`, and `NODE_EXTRA_CA_CERTS` only AUGMENTS Node's global trust store
rather than PINNING it the way an explicit DSN `sslrootcert` does on the Windows side. This is not
a regression — the hand wrapper this flag replaces had the identical shape — but it means the
DSN-level pin's exclusivity is unchanged for libpq tools only, not for a WSL-side Node client.

`restore:full` runs role bootstrap before the transactional dump restore, then prints manual
follow-ups. Complete those follow-ups against the current estate: private Storage bucket/policies
and bytes, every configured login and credential, public-schema ACL baseline, and engine migration
journal parity. Use the [runtime README](../runtime/README.md) for the complete lane roster,
including freeform, bank and checkout logins.

For an isolated drill, keep the restored engine off. A real recovery may resume parked runs
only after verifying the target's custody, roles and workflow compatibility.
`dr:verify` uses distinct `CLARA_DR_SOURCE_URL` and `CLARA_DR_TARGET_URL`, with a principal
able to read all rows; `CLARA_DR_STRICT=1` makes its canary/AP checks mandatory, and
`CLARA_DR_VERIFY_OUT` writes evidence. Inspect PASS/FAIL/SKIP outcomes, not just the command's exit.
The §4.6 relation-grant matrix (tables, views, matviews, partitioned tables AND sequences) compares
EFFECTIVE grants: a `NULL` `pg_class.relacl` is read as `coalesce(relacl, acldefault(...))`, so it
reads identically to an explicit owner-only ACL that means the same thing. This is necessary
because `pg_dump` never emits anything for an ACL that equals the object's default, so the FIRST
grant/revoke ever run against a relation — even a semantic no-op like `revoke all ... from public`
on a table PUBLIC never held anything on — permanently materialises the owner's implicit privileges
on one side while a restored copy's ACL comes back `NULL` again (first seen with 0235's
`clara.document_binding_claims`, PR #1029).

Database dumps do not include Storage bytes or managed Auth configuration.
The [backup service](../backup/README.md) adds encrypted off-site document copies and selected Auth
data. Restore verification is necessary before treating a backup as recoverable.

## Web consumers added by #633 — no new door

#633 shipped ZERO SQL. Three existing objects gained their first (or their first
list-form) `apps/web` caller, and the batteries in `tests/` that pin them are named in
`tests/README.md`:

- `clara.list_unassigned_documents(p_limit)` (0009:2590, SECURITY INVOKER, granted
  `clara_authenticated` + `clara_agent_ro` at :2908-2913) — the firm's
  unassigned-sources leaf. The function was never the gap; the caller was.
- `clara.document_capabilities` (0191:200-214, granted :271) — read ONCE per mount as a
  global catalogue and joined per row in the browser, rather than calling
  `clara.get_document_state` per list row (an N+1 under the user's own JWT).
- `clara.document_intakes_visible` (0007:2233, granted :2747) — read in LIST form, not
  only single-row, so an upload receipt survives a reload.

`clara.entry_evidence_links` is read DIRECTLY for the document→Work link. It carries
`grant select … to clara_authenticated` (0182:360) under FORCE RLS
`firm_id = clara.jwt_firm()` (:358-359); a SECURITY DEFINER wrapper would REMOVE that
guarantee and force a hand re-implementation of it, for zero new capability.

## #657 — matching bank evidence to an already-approved booking (migration 0226)

**One new granted read, one new ungranted helper, five measured recuts, no new table.**

`clara.get_bank_line_matching_context(p_line uuid) returns jsonb` — bookkeeper floor, firm from
the session, EXECUTE to `clara_authenticated` and nobody else. It answers everything ONE bank
statement line can say about itself before a match is decided: its own facts, its statement's
header, lineage, `source_doc_sha256` (a column on `bank_statements` since 0038 that no other read
emitted) and `documents.original_filename`, the period coverage, the governing
`bank_line_exceptions` row, `clara._wdb_line_booking_block`'s payload verbatim, and one
deterministic basis row per candidate entry.

**THE GRANTED-WRAPPER / UNGRANTED-BLOCK IDIOM, and why it is the shape.**
`clara._wdb_line_booking_block(uuid,uuid,uuid)` (0044:2459) has answered "what did this line
cause to exist, and is any of it still outstanding?" since 0044 and is `revoke`d from PUBLIC at
0044:2780 — it had ZERO consumers in `apps/web` or `packages/runtime`, a named door with no UI.
Granting it would publish a PREDICATE; the wrapper publishes its ANSWER, which is the same
posture 0219's identity read takes over the deliberately ungrantable `name_family_*` family. The
block's grant state is asserted both in 0226's prestate (before the wrap) and in its tail (after).

**THE TWO-COPY CANDIDATE DISCIPLINE.** `clara.list_bank_match_candidates(uuid,uuid)` and the copy
inlined in `clara._agent_get_bank_pack_core` are the same projection written twice — the agent
lane cannot call the public read because that read calls `clara._human_ctx`. Nothing fails at
runtime if only one moves. So 0226 types the projection IDENTICALLY IN BOTH BODIES, between the
sentinel comments `/* P657-CAND-BEGIN */` and `/* P657-CAND-END */`, as two static
`create or replace` statements — and the TAIL is what keeps them honest: it reads both marked
regions out of the live catalog, whitespace-normalises them and refuses if they differ, and
`p657.db.pack-parity` proves the same thing behaviourally, field for field, against real data.
**A future change to the candidate projection edits BOTH bodies by hand**, and the tail plus
that cell are what catch a hand that edits only one.

A first cut did splice instead — write the projection once in the public read, then extract that
exact text out of the freshly recut catalog body and re-install the pack core around it — and it
had to be REVERTED: `apps/web/test/sqlFunctionCensus.ts` refuses a dynamic statement it cannot
resolve to exactly one function definition (`sql_function_census_unresolved_execute`). The
splice-by-construction guarantee is therefore not available here; two typed copies plus an
executable equality assertion is what this estate's census leaves standing.

The three additions: `counterparty_name` (the name of
`clara._canonical_counterparty(p_client, …)`, so a merged payer reads as its SURVIVOR),
`high_stakes` = `clara.is_high_stakes(entry_id)` (replacing a hardcoded `false` that told every
human no candidate was ever high-stakes), and a DB-bounded `match_history`
(`order by acted_at desc limit 5`).

**THE STRUCTURED TASK BINDING (C33.8).** `clara._agent_verify_inputs_digest` was DROP+CREATEd from
`(uuid,text,text)` to `(uuid,text,uuid)`: the two `split_part` calls that derived and compared a
task id out of an operation key are gone, and the comparison is
`coalesce(r.wake_task_id, clara._bank_op_key_task(r.op_key)) = p_task` — a STORED column first,
with a total, never-raising key reader as the fallback for rows written before 0226 (the table is
append-only, so no backfill is lawful). `clara._agent_bank_receipt` now writes
`bank_agent_receipts.wake_task_id`. **`clara._bank_op_key_task(text)` is the ONE place the bank
operation-key schema is parsed** — IMMUTABLE, STRICT, uuid-regex guarded, ungranted.

**LOUD, for every future bank-family pin.** 0226 re-patches the THIRTEEN `clara._agent_*_core`
bodies rostered at 0129:1067-1081, so every one of them has a NEW `prosrc` sha. A later migration
pinning any of them must measure against #657's POST-image, never 0129's.
## #656 — the capability registry's second publication (0228)

`0228_opening_ledger_source.sql` creates nothing and recuts nothing. It republishes
`clara.document_capabilities` at `registry_version = 2` — an UPDATE that RAISES, never a
DELETE-then-INSERT (#846; 0207's BEFORE UPDATE monotone trigger permits a raise and refuses a
decrease with CLR08 `registry_version_monotone`) — and corrects the content of thirteen of the 240
rows. It is the second file ever to touch this table; 0191 seeded it and 0207 walled its counter.

**Why EVERY row moves when only two kinds change.** `tests/document-capability-registry.test.mjs`
asserts `count(distinct registry_version) = 1` registry-wide — "the registry publishes exactly one
version at a time" — and its rollback-hygiene cell asserts the published minimum besides. Raising
two kinds alone reds that battery, whose whole subject is registry-wide uniformity. So the
republication is whole-registry and the battery is re-based in the SAME commit, on the exact
precedent `af3b5955` (#779) set when it shipped 0207 and +147 lines of that file together.

**The two corrections are NOT symmetric, and the asymmetry is the point.**

- `opening_balance_doc` × the six `azure-di:prebuilt-layout` formats moves `typed_facts` AND
  `business_operation` to `supported`, because this branch BUILDS that operation: the
  `opening_tb.line` producer is wired in line at the OCR pass and its regions are carried into the
  governed opening-seed door. It ships in the same merge as that wiring and never one migration
  ahead of it — shipping a level before its capability is exactly the "success that did not happen"
  `0191:217-218` promises a professional will never be shown. The other six formats have no
  producer (`structured_parse` emits `rows.*` / `sheets.*`, never `tables.*`) and stay `stored_only`.
- `prior_gl` × the seven formats with a reader keeps its LEVEL and loses its LIE. Its basis said
  "Clara derives nothing to drive it", which is false: `packages/runtime/lib/seeding-parse.mjs`
  drives `clara.create_seeding_batch` off a filed prior GL today, from a printed ledger's table
  cells or from xlsx bytes. The corrected sentence names the operation, its reader, its proposal
  shape (counterparty, account and date, NEVER an amount) and the fact that **no browser entrance
  exists** — nothing in `apps/web` calls `POST /api/seeding/prepare` — with
  `limits = {"browser_entrance":"absent"}` making that gap machine-readable, which is 0191's own
  instrument for a named gap (`:235-236`, "A limit is not a lower level"). **Both halves of that
  wording were replaced by 0288** (ticket 1012): the operation is retired and the entrance is not
  merely unbuilt, so the rows now carry `limits = {"seeding_lane":"retired", …}` and a basis that
  says so — see "0288 — the prior-GL seeding lane is retired" at the foot of this file. The LEVEL
  argument below is unaffected and still stands.

**Why the prior_gl LEVEL was held, measured rather than preferred.** #656's brief rules it to
`supported`. 0228 was written that way, applied to a rig, and the registry's own cell
(`document-capability-registry.test.mjs:278-284`, "business_operation never claims 'supported'
where typed_facts is not supported") went red across all 240 rows; this column's own contract says
the same in words (`0191:229-230`: "`supported` where Clara can carry TYPED FACTS into it").
`prior_gl` has no typed-facts producer — `prior_gl.line` has never been written — and its operation
yields human-ticked PROPOSALS, not carried facts. Raising the level needs either a false
`typed_facts` claim or the relaxation of a 240-row honesty law for one row, so the level stands and
the question is a named residual.

**The two writers this lane splits across, and their floors.** `clara.record_opening_target(uuid,
jsonb,text)` is the HUMAN door (bookkeeper+, `clara_authenticated`) and refuses ANY tied basis with
CLR31 `parsed_target_writer_required`. `clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)`
is `clara_runtime`-only with no `_human_ctx` twin, and re-derives every triple from the cited
extraction region before it writes. A document-sourced figure is therefore written only by the lane
that read it, and a keyed figure only by a named person — which is what makes `provenance_kind`
mean something.

**Two walls a caller meets that no CLR code names**, both measured while writing this slice:
`fk_opening_tb_targets_account (client_id, account_code) → clara.coa_accounts` refuses a printed
account this client's chart has not got with a bare SQLSTATE 23503; and `clara._tf_period_wall_lines`
on `clara.journal_lines` refuses an opening DRAFT into a closed fiscal year with CLR19
`write_into_closed_period`, long before `approve_opening_seed` is reached. The runtime classifies
the first (`lib/opening-parse.mjs`'s `mapOpeningFkError`); the second is why 0228 writes no recut.
## The intake batch relation family (#636, 0229)

`0229_intake_batches.sql` adds a firm-scoped, durable parent over client-attributed child Work, so
a hundred uploaded sources can be watched as one thing while each child keeps its own address.
It **recuts nothing**: twelve live bodies are pinned by `sha256(prosrc)` in the prestate and
re-read byte-identical in the tail, which is the file's own machine-checkable proof.

**Three relations.** `clara.intake_batches` (the parent: firm-scoped, **no `client_id`** because the
members that wait are the unattributed ones, **no stored counts**, three states `open` /
`cancelling` / `cancelled`), `clara.intake_batch_members` (one admitted source, carrying up to three
identities **in order** — intake always, document once in custody, Work once admitted — and at most
one declared dependency) and `clara.intake_batch_member_events` (the append-only history, with the
`_tf_append_only` / `_tf_no_truncate` pair). All three are FORCE RLS with an owner policy and a
`clara_authenticated` SELECT predicated on `clara.jwt_firm()`; **no application role holds DML on
any of them**. `clara_runtime` gets SELECT on the two CHILDREN only — the reconciler belt needs to
see them — and nothing at all on the parent.

**DERIVE, NEVER STORE.** The shape copied is `clara.seeding_batches` (0017:1252, facets derived at
read time by live counts, 0017:4602-4610); the shape rejected by name is
`clara.sales_backfill_batches` (0046:496) whose `admitted_count` is a stored counter a verb
increments (0046:2287). A counter drifts from its children the moment one is cancelled.

**Six granted names.** Five write/sweep doors are `clara_runtime` ONLY, actor-explicit, SECURITY
DEFINER, `_reserve_op`/`_finish_op` + `_audit`, with no `_human_ctx` twin (the pool carries no JWT,
0004:299-309) — `open_intake_batch`, `attach_intake_to_batch`,
`set_intake_batch_member_dependency`, `cancel_intake_batch` and
`sweep_intake_batch_cancellations`. One read, `get_intake_batch`, is `clara_authenticated` ONLY and
SECURITY INVOKER with the inline bookkeeper floor (0214:262-274's reason).

**Why the sixth name exists.** `clara.operation_receipts` carries no `clara_runtime` grant and no
`clara_runtime` policy — 0178's own tail asserts both (0178:1619-1630) — and the runtime holds no
SELECT on the batch parent. So the pool can read neither the committed receipts that decide which
children are still live nor the `cancelling` parent itself. `sweep_intake_batch_cancellations` is
the bounded, oldest-first, op-key-less worklist door on the `release_held_document_tasks(int)`
precedent, and it performs the terminal flip.

**The fan-out cancel, and why the parent STORES its decision.** `cancel_intake_batch` is NOT one
transaction and must not be: it returns the live child list and the caller invokes
`clara.cancel_accounting_work` once per child, one call per transaction, so a child that already
posted answers `already_completed` and KEEPS its receipt (0199:230-272). Each child's key is
derived as `<cancel_op_key>:<work_id>`, and the author is the STORED `cancel_requested_by` —
`clara._work_door_ctx` hashes `{work, author}` (0184:262-264), so a resumed fan-out that passed the
sweep's own identity would raise CLR10 `op_key_conflict` on every child. Measured on the rig, not
argued.

**Two lane-agnostic stamp triggers.** `_tf_intake_batch_member_intake_stamp` (AFTER UPDATE on
`clara.document_intakes`) stamps custody on the `document_id` NULL → non-NULL transition and, as a
belt, declares `awaiting_capacity` when an intake fails with `failure_code='limit'`.
`_tf_intake_batch_member_work_stamp` (AFTER INSERT on `clara.accounting_work`) joins whatever Work
names the member's document — at most one document per Work is possible (0182:520-527) — so #655's
invoice lane and the autodraft lane stamp it without knowing this table exists. Both open with a
cheap negative; the Work-side one reads `ix_intake_batch_members_open`, which is empty on a firm
with no open batch.

**What "cancelled" means, exactly.** A batch reaches `cancelled` only when nothing is live AND
nothing can still become live: `_intake_batch_live_children` is the fan-out's worklist (members
holding a Work that is neither terminal nor already carrying a committed receipt) and
`_intake_batch_pending_members` is the other half — members with no Work yet whose intake is still
arriving or whose document still has a queued/running processing task. Both the door and the sweep
require both to be empty. Without the second, a batch stopped during ingest — which is exactly when
a hundred-file batch gets stopped — flipped terminal at once, the sweep never looked at it again,
and every one of its files went on to be admitted and posted. A member merely sitting in custody
with nothing running is NOT pending: a Work another lane admits for it afterwards is that lane's
own new decision, taken after the stop.

**A stop that can never finish is NAMED — and, since #968, remedied.** The fan-out must re-issue
with the stored `cancel_requested_by`; if that person's membership goes away, every child refuses
CLR04 on every sweep for ever. `get_intake_batch` derives `cancel_blocked='canceller_not_active'`
from the live membership rather than storing a fourth state, the card renders the remedy, and the
reconciler belt counts that parent as `batchCancelBlocked` rather than as one more transient
failure.

**#968** (migration 0253) gives that block a remedy at the door. `cancel_intake_batch`'s
refusal-on-duplicate rule (CLR13 `batch_already_cancelling`) gains ONE named exception: while the
batch is still `cancelling` AND its stored canceller no longer holds an active bookkeeper+
membership — the EXACT predicate above, re-read rather than restated — a call from a DIFFERENT
actor under a FRESH op key is admitted as a genuinely new decision, re-pointing
`cancel_requested_by` / `cancel_op_key` / `cancel_requested_at` at the new actor, key and moment.
`_intake_batch_actor_ctx`'s own live re-check (run before the row lock) already proves the new
caller is active, so the new decision's actor can never be the same blocked identity re-keying
itself. A batch whose stored canceller is still active, or one already `cancelled` (terminal),
keeps refusing a second decision exactly as 0229 shipped it — the exception is gated on
`b.state = 'cancelling'` and nothing else. Neither `get_intake_batch` nor
`sweep_intake_batch_cancellations` needed a single line changed: the read already evaluates
`cancel_blocked` LIVE off the row on every call, so the block clears itself the moment the row's
canceller changes, and the sweep already reads `cancel_requested_by`/`cancel_op_key` LIVE too. Every
decision — the original AND the re-issue — reaches `clara._audit`'s append-only `audit_log`
unconditionally, so the original decision (its actor, its op key) stays readable forever; nothing
in this file adds a new column or table to hold it. See `p968.reissue.*` in
`intake-batch.test.mjs` for the door proof.

**`settled` and `failed` are NOT compatible facets.** The five facets overlap by construction and
are never summed, but a member holding a committed receipt is business-complete and is excluded
from `failed` outright; the task-error arm looks only at the CURRENT attempt per lane
(`distinct on (lane)` by descending `version_n`), because a retry is a new row
(`unique (document_id, engine_id, version_n)`) and a terminally-failed row is immutable. Measured
on the World leg's own data before the fix: 31 of 35 members reported "failed" held a committed
receipt.

**The capacity wall is a WAITING state, not a raised limit.** #636 changes no default and touches
none of the three reservation bodies. Measured on a migrated rig: 100 ≤1MB PDFs are admitted and
the 101st is refused CLR18 on the DOCS guard with both ceilings flush (docs 100 / pages 1000); 100
images refuse on docs; 20 ≤5MB PDFs refuse on PAGES. The daily window WAS
`date_trunc('day', now() at time zone 'utc')` (0007:1644), i.e. 08:00 Asia/Kuala_Lumpur, until
**#964** (migration 0252) moved all FOUR bodies that enforce it — the three reservation helpers
`_reserve_document_ingest`, `_resize_document_reservation`, `_settle_document_reservation`, AND the
shipped, `clara_runtime`-granted door `settle_ingest_reservation`, which counts `pages_per_day`
itself instead of delegating the way its siblings `resize_ingest_reservation` /
`refund_ingest_reservation` do — to
`date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur')`, i.e. **MYT MIDNIGHT**. They move
together, byte-identically, because a mixed state would let one instant pass one check and fail
another; `get_intake_batch`'s `capacity` block reports `window: 'myt_day'`,
`resets_at_local: '00:00'` accordingly. Default quotas and the five-rung page ladder are
unchanged. 0252's tail proves the move by CENSUS, not by naming bodies: every `clara` function
that reads `document_ingest_reservations` AND `pages_per_day` is re-read for either spelling of
the UTC idiom (the fourth door writes `date_trunc('day',now()` with no space, which is how it
slipped past the first generation's four-name tail) and the set must be empty. See
`document-ingest-window-myt.test.mjs` for the mechanism proof (0234's own anchored-splice /
reverse-substitution discipline, applied to a small internal-function recut with no
time-travelling public door to observe through).

**The move costs one transition, once.** MYT midnight is EIGHT HOURS EARLIER than the retired UTC
boundary, so at the instant 0252 commits, reservations created between 00:00 and 08:00 MYT of the
current day move from "yesterday" into "today" — a firm inside its ceiling one second before the
deploy can be refused one second after it, while the card names a reset moment that has already
passed for that day. Nothing about this is a defect (no quota changed, and the next MYT midnight
resets everything), but a release that lands inside that window has to be able to explain the
first refusal: apply outside 00:00–08:00 MYT where the schedule allows, and carry the paragraph
into the as-run where it does not.

**A file the ceiling refuses at CREATION now leaves a record — #965 (migration 0254).** Until it,
`create_document_intake` inserted the intake row and then reserved in the SAME transaction, so a
CLR18 refusal rolled the row back and the file it named disappeared: the uploader saw one 429 and
nothing survived it. 0254 wraps the ONE `_reserve_document_ingest` call in a plpgsql block whose
`exception when sqlstate 'CLR18'` arm moves the already-inserted row (inserted ABOVE the block, so
the implicit subtransaction cannot reach it) to the lane's EXISTING `failed` status with its
EXISTING `limit` failure reason, and RETURNS a refusal outcome — `refused: true`, which ceiling
(`documents` / `pages`, read off the reserve helper's own two sentences with `get stacked
diagnostics`), the firm, the filename, the moment, and the database's sentence verbatim — through
the same `_finish_op` receipt every other answer goes through. The refusal reaches the append-only
`audit_log` through the SAME `clara._audit` call the admission uses. No new status, no new failure
reason, no new column, no new table and no new granted name; the ACCEPTED path executes the
identical statements in the identical order, gaining only the block's implicit savepoint.
`get_intake_batch` needed no edit at all: its `waiting` facet already counts a member whose intake
carries `failure_code='limit'` and its `failed` facet already excludes one (D4 above). What 0229's
BELT cannot do is declare the wait — arm (b) fires on an UPDATE moving `failure_code` on an intake
that already HAS a member, and a file refused at creation has none yet — so the runtime attaches
the refused intake and declares `awaiting_capacity` through the governed
`set_intake_batch_member_dependency` door (`beginIntakeInBatch` → `commitRefusedMember`,
`packages/runtime/lib/intake-batches.mjs`), under savepoints, so a closed batch costs the
membership and never the record. See `intake-refusal-record.test.mjs` for the door proof and
`packages/runtime/tests/intake-refusal-unit.test.mjs` for the caller's.

**WHICH ceiling turned a file away lives in `audit_log`, never on the intake row.** Say it plainly,
because the intake relation is what a reader reaches for first: `document_intakes` carries
`status='failed'` and `failure_code='limit'` and NOTHING that separates a docs refusal from a pages
one — 0254 adds no column, by the ticket's own "no new vocabulary" rule. The durable home of the
ceiling is the append-only `clara.audit_log` row the refusal writes (and, for the caller that made
the attempt, the stored `op_receipts` result). The query that answers it:

```sql
select a.at, a.actor, a.args->>'ceiling' as ceiling, a.args->>'reason' as db_sentence,
       i.original_filename, i.declared_mime, i.declared_bytes
  from clara.audit_log a
  join clara.document_intakes i on i.id = (a.args->>'intake')::uuid
 where a.fn = 'create_document_intake' and (a.args->>'refused')::boolean
   and a.firm_id = $1
 order by a.at desc;
```

(The audit row carries `intake`, `op_key`, `origin`, `reason`, `ceiling` and `refused`; the file's
own identity — filename, mime, bytes, moment — stays on the intake row it points at, which is the
whole point of committing that row. MEASURED on the lane rig, 2026-09-20.)

So a firm-facing "why was this file refused" surface reads `audit_log`, not `document_intakes`
alone. (Owner check outstanding: whether `document_intakes` alone SHOULD be able to answer it —
that would be a new column and a new ticket.)

## #660 — the client home's money band (0232)

TWO RELATIONS and THREE DOORS, all `clara_authenticated` only. No agent twin, no wake wrapper, no
allowlist row: `clara_runtime`, `clara_agent_ro` and every `clara_wake_*` role hold ZERO on all
three, asserted door by door and role by role in 0232's own tail and again behaviourally by
`p660.pack.no_agent_reach`.

- `clara.cash_account_set_versions` / `clara.cash_account_set_members` — a client's governed,
  versioned CASH ACCOUNT SET. Exactly one `published` row per client (a partial unique index) and
  contiguous, non-overlapping windows (`clara._tf_cash_account_set_integrity`, one trigger function
  serving two triggers on 0058:362's pattern). Members are SEALED to the creating transaction
  against INSERT, UPDATE **and** DELETE: the version row's `member_count` / `members_sha256` are
  computed once, by the deferred trigger on the versions table, and are never re-checked
  afterwards — so a member removed later would leave the frozen sha describing a membership that
  no longer exists. A version is superseded, never edited.
  `member_reason` is `bank_registry` | `declared_cash` | `declared_petty_cash`. FORCE RLS, two
  policies each, `select` to `clara_authenticated` and ZERO INSERT/UPDATE/DELETE to any non-owner
  role — which is what keeps the read doors honestly `SECURITY INVOKER`.

  **There is NO `is_active` predicate on this family or on any read of it, and that is the whole
  reason it exists rather than riding `clara.account_set_versions`.** That family resolves
  membership through `clara._metric_selector_account_ids` (0058:344-358), which filters `is_active`
  TWICE and REFUSES an explicitly named inactive account — exactly the population a cash set must
  contain, since a retired bank account still holds the balance it held. Relaxing that resolver
  would change membership semantics for every account set in the estate silently, because the
  freeze checks re-derive from stored shas.

- `clara.publish_client_cash_account_set(p_client, p_members, p_effective_from, p_op_key)` —
  SECURITY DEFINER, **admin** floor (`clara._human_ctx(clara.role_rank('admin'))`, the floor
  `create_account_set_v1` uses), op-key idempotent over all three payload arguments. `p_members` is
  ONE jsonb array of `{account_id, member_reason}` and ITS ORDER IS THE ORDINAL. A first version
  with a null `p_effective_from` is stamped at the books' own start; a first version dated AFTER
  that start is refused `first_version_after_books_start`, because it would make every historic
  month unreadable. Two admins superseding at once SERIALISE (the current version row is taken
  `for update`) and the loser is refused CLR11 `cash_set_version_raced` — a typed refusal the face
  can turn into a sentence, never a raw 23505 naming an internal constraint.

  **AND THE LOCK ALONE IS NOT ENOUGH, WHICH IS A MEASURED FACT.** Under READ COMMITTED the waiter's
  statement snapshot is taken BEFORE it blocks, so when the winner commits, EvalPlanQual re-checks
  the row the waiter was queued on against its LATEST version — now `superseded` — the
  `state = 'published'` predicate fails, the row drops out, and the winner's new published row is
  invisible to that same pre-block snapshot. The waiter therefore reads NO current version at all.
  The door does not read that null as "this client has never had one": it RE-READS in a separate
  statement (a fresh snapshot) and, if any version row exists, refuses `cash_set_version_raced`.
  Without the re-read the loser was refused CLR10 `first_version_after_books_start` — a true
  sentence about a different mistake, which would send an admin off to check a books-start date
  that had nothing to do with what happened. Cell: `p660.set.publish_race_loser_code`, two real
  backends, the block proved from `pg_blocking_pids` rather than slept through.

- `clara.propose_client_cash_accounts(p_client)` — STABLE SECURITY INVOKER, **viewer** floor. Lists
  every `is_bank_account` row of the client, ACTIVE OR INACTIVE, with its cumulative approved
  balance and whether it is already a member. It NEVER proposes declared cash or petty cash under
  any account name or code: neither has a structural marker in this schema and `0121:4749` is house
  law — structure and declared facts only. A human declares them.

- `clara.get_client_cash_account_set_members(p_client)` — (0276, #1002) STABLE SECURITY INVOKER,
  **viewer** floor, the same inline floor `propose_client_cash_accounts` uses (copied rather than
  shared). Enumerates the client's CURRENT PUBLISHED version's membership, each member carrying its
  RECORDED `member_reason` — the complement `propose_client_cash_accounts` cannot give, since that
  read flags `already_member` for bank-registry candidates only and never lists a member with no
  bank-registry candidacy at all (a declared cash or petty cash account). NO `is_active` filter,
  matching the rest of this family. A client with no published version answers
  `published_version_id: null, members: []`, never a fabricated version. This is the second-pass
  membership editor's own read (`apps/web/components/firm/client-home/client-cash-set-dialog.tsx`);
  `publish_client_cash_account_set` is unrecut and reused unchanged as the editor's write.

- `clara.get_client_financial_pack(p_client, p_as_of, p_month)` — STABLE SECURITY INVOKER,
  **viewer** floor, `plan_cache_mode` pinned. Book cash with six points, period profit with income
  and expense, a six-calendar-month series, per-account composition with capped entry lists, and a
  ten-field envelope plus a comparison on every figure group. `status`/`coverage` take only
  `ok | partial | unknown`; the door never says `denied` about itself (it raises CLR04) and never
  says `unavailable`. A client the caller cannot see and an invented uuid answer IDENTICALLY.

  **The comparison is TWO rules, not one.** A COMPLETE month (a historic month read to its own last
  day, or an MTD read on the last day of the month) compares against the prior month IN FULL; an
  in-progress month-to-date compares against the same ELAPSED stretch of the prior month, capped at
  that month's last day. Applying the elapsed rule to a complete month truncates a LONGER
  predecessor to the selected month's length — February against January drops three days — and the
  same response's series row for that month then contradicts the comparison beside the headline.
  `p660.pack.historic_comparison_full_prior_month` holds both arms to it.

  **A comparison period the books cannot answer for is UNKNOWN, not zero.** When the comparison
  interval ends before the coverage floor, every amount on it is null and it carries
  `available:false, reason:'pre_coverage'` — the same answer `points[]` already gives that date.
  The alternative is one read saying two different things about one date, and a whole balance
  printed as growth from nothing.

  **Each composition carries its own `composition_total` + `composition_truncated`,** beside the
  entry level's `entries_total` + `entries_truncated`, and both live INSIDE the figure group they
  are about (`cash.composition`, `profit.composition`). A top-level spelling is a key no consumer
  of the envelope reaches: the browser hydrates each group through one parser, so the drilldown
  renders nothing against the real door while a hand-written fixture stays green.

  **A version window a point precedes means one of two things, and the read names the true one.**
  More than one revision → `cash_set_version_changed_in_series` (the definition really changed
  inside the trend). Exactly one revision → `cash_set_published_after_books_start`: nothing changed,
  the set was DECLARED after those months were booked, which is the ordinary onboarding order and
  the one case `first_version_after_books_start` cannot refuse.

THE VIEWER FLOOR IS STRUCTURAL, not a judgement call: `journal_entries`, `journal_lines` and
`coa_accounts` are table-SELECT-granted to the whole `clara_authenticated` role (0003:522-525)
behind a FIRM-ONLY RLS predicate (0003:514). A viewer can already `SELECT` every row these reads
aggregate, so flooring higher would protect nothing and only take the money band away from the
people who read it most.

THE COMPUTE SHAPE IS A MEASUREMENT, recorded in 0232's header. Seven `clara.trial_balance_as_of`
calls cost 18.12 ms / 2,008 shared buffer hits against 2.04 ms / 176 for one filtered pass with six
`filter (where posting_date <= point_k)` aggregates, on a 6,000-line corpus on a rig cluster
(8.87x). The cash arm is therefore ONE scan — and because that is a SECOND spelling of a shared
definition, the tail asserts from `prosrc` that it is still the same one: `status = 'approved'`
present, a cumulative `posting_date <=` bound present, `is_opening_balance` ABSENT and `fiscal_year`
ABSENT. `p660.pack.matches_trial_balance` is the behavioural half.

AND THE WHOLE DOOR WAS MEASURED, not only that arm. On a 160-entry / 320-line / 19-account client
with a three-member cash set (rig `clara_660`, PostgreSQL 17.11), `explain (analyze, buffers)` over
`clara.get_client_financial_pack` reported **36.4-40.4 ms / 28,886 shared hits** while the two
compositions each re-read their account's lines through six correlated subqueries. Collapsing the
cash composition to ONE scan per member account with three FILTERED aggregates brought the same
call to **18.9-21.7 ms / 12,134 shared hits** with a BYTE-IDENTICAL payload (14,558 bytes). The
read is polled every thirty seconds while the client home is visible, so that is the number that
matters rather than the cash arm's alone.

### KNOWN COVERAGE LIMIT — pre-0120 unmarked closing transfers

Entries finalised before 0120 stayed `closing_transfer = false` "forever" (0120:518-521), and
0016:211-219's `closing_transfer_review` notification was never discharged by any migration. The
pack DISCLOSES this and repairs none of it: an approved entry inside the period with
`closing_transfer = false` AND (its own `close_receipt_id` — only `finalize_close` births one,
0056:3010-3024 — OR a `reversal_of` naming an entry that has one, the reopen mirror 0120:797-814)
drives `coverage = 'partial'` with reason `closing_transfer_unmarked_history`.

**The detected rows are NOT also excluded.** A second, wider exclusion inside one read would make
two reads of one ledger disagree; the exclusion predicate stays the estate's one definition
(`not (is_year_end and closing_transfer)`, 0016:602, asserted verbatim in the tail) and the read
says what it cannot vouch for. **The detector's own limit**: a close finalised before
`close_receipt_id` existed (pre-0056) carries neither marker and is undetectable. The affected
hosted row count is a release-time read, not an assumption.

**The disclosure covers every month the chart draws.** `unmarked_closing_entries` is scoped to the
SELECTED period; `unmarked_closing_entries_series` and `series_coverage_reason` run the identical
detector over the six calendar months the series carries, because an unmarked close three months
back is counted into that month's bar and the period-scoped count cannot see it
(`p660.pack.unmarked_history_series_disclosed`).
## 0233 — the firm's own legal, commercial and model-usage state (#635)

THREE new `security definer` reads, granted to `clara_authenticated` and to nobody else, plus ONE
body-only recut. Nothing else: 0233 creates, alters and drops no relation, issues no table grant,
adds no trigger, CHECK or policy, and takes no row lock of any kind.

| door | floor | answers |
|---|---|---|
| `clara.get_firm_legal_standing()` | `viewer` | one entry per legal kind on the shelf (0185:653-659's own `distinct on (kind)` selection, so a draft-only kind appears as a draft), whether an ACTIVE OWNER of the caller's firm accepted each current version, the caller's own acceptance, and whether the CALLER may accept for the firm |
| `clara.get_firm_commercial_state()` | `admin` | the firm, the CURRENT billing plan (amount AND `amounts_ruled` together), whether a registration payment is recorded, the declared absence of subscription invoices, and the firm's stored processing caps or NULLs |
| `clara.get_firm_ai_usage(date)` | `admin` | the caller's own firm's monthly model usage, bound to `clara.jwt_firm()` INSIDE the database, with `price_currency` |

**`get_firm_legal_standing` is ARITY 0 FOREVER.** `clara._accounting_work_egress_live(p_firm,
p_client)` is ungranted (0195:911) precisely because a per-client answer is an existence oracle for
another firm's books (0195:871-874). This door answers that basis's limb (a) ONLY — the firm's legal
standing — and takes no client argument. §C asserts the arity; `p635.db.legal_standing_no_client_arg`
asserts it again from the other side. It carries neither the legal `body` nor its digest: those stay
`clara.get_current_legal_documents()`'s (0185:634-671), so no second surface can render bytes a
third digest was taken over. The attribution triple (`accepted_by` / `accepted_at` /
`accepted_by_name`) is masked to NULL below bookkeeper, mirroring `0141:526`; `firm_accepted` is
never masked, so a viewer reads WHETHER without WHO.

**`get_firm_commercial_state` publishes booleans, not identifiers.**
`clara.firm_registration_payments` carries `stripe_customer_id` and `stripe_subscription_id`; this
door projects `... is not null` and the `recorded_at` date, and §C reads that off the door's own
RETURN expression. It also forwards `amounts_ruled` beside the amount, which is what lets a surface
use the flag as its RENDER CONDITION: the beta plan is seeded UNRULED (`0163:214-215`), so no
figure appears at all today and a later owner ruling shows one with no code change.

**IT WIDENS C-3's MONEY-STORE ROSTER, AND THAT IS A REVIEWED ACT.** `get_firm_commercial_state`
reads `clara.firm_registration_payments` — it is the FIRST firm-scoped reader of that relation (the
only reader outside the checkout chain until now was the operator console, `0188:304`). The name is
added to `packages/db/tests/checkout-gate-c3.test.mjs`'s `c3.53` closed-world census with the reason
beside it, exactly as `0164`'s and `0188`'s widenings were. It also READS `pages_per_day`, so it
enters `f-a9-pr-1b.test.mjs`'s gate-7 roster too — classified there, in writing, as a READER and not
a live usage gate.

**THE RECUT: `clara.get_llm_usage_summary(uuid,date,uuid)` gains the rank floor it never had.**
Created at `0110:706` and never spliced, that door's only wall was `p_firm is distinct from
clara.jwt_firm()` — so before 0233 a VIEWER could read the firm's entire model spend (measured on
the #635 rig). 0233 adds `perform clara._human_ctx(clara.role_rank('admin'));` as the FIRST
statement of the body, ahead of that wall, so an under-ranked caller meets CLR04 whatever firm they
name and a correctly-ranked caller naming a FOREIGN firm still meets CLR11 `client_not_in_firm`.
Everything else is carried verbatim, and that is PROVEN rather than promised: §C squeezes the live
body, subtracts 0233's floor block and requires the remainder to hash to the pre-image squeezed the
same way. The grant is NOT re-issued — `create or replace` preserves the ACL, and §C asserts the
live ACL is byte-identical to the pre-image, which is what makes that claim a measurement.

**A CENSUS THAT READS THE WRONG BODY PROVES NOTHING.** §C's name-resolution guard — the standing
door must resolve `display_name` inside its own definer body and never through
`clara.users_visible` (0137:291-298 re-derives `jwt_firm()` and admits agents) — originally tested a
variable last assigned inside the preceding loop, whose final iteration is `get_firm_ai_usage`. It
therefore passed whatever the standing door said: measured on the rig by splicing `users_visible`
into the standing body inside a rolled-back transaction, the whole tail still returned OK. The guard
now re-derives the comment-stripped source from the standing door's own `prosrc` immediately before
the test, and the same mutant raises. Comment-stripped and not raw, because this body legitimately
NAMES `clara.users_visible` in the comment explaining why it does not use it.

**`clara.firm_document_limits` IS UNTOUCHED.** Its viewer-readable SELECT (`0007:810-811`,
`:2742-2744`) is unmoved in both directions, asserted in the prestate and again in the tail. The
capacity numbers ride door 2 only so a settings card can render them beside the plan; that is an
AFFORDANCE, not a wall. The residual stands: that relation still has NO human writer anywhere
(`0196:36-40`).

**THREE NON-REGRESSION PINS, an instance of the "Pinning another function's body hash" convention
named above this file's "Migration and deployment behavior" section.** 0233 CALLS three functions
it does not itself change and pins each one's pre-image `sha256(prosrc)` in both its prestate and
its tail: `clara.get_current_legal_documents()` (the standing door's own text says its `body` and
digest stay that function's, never a second copy), `clara.accept_legal_document(text,integer,text,text)`,
and `clara._accounting_work_egress_live(uuid,uuid)` (the arity-0 argument above copies that door's
own limb-(a) predicate, 0195:890-906). A later migration whose OWN NUMBER is below 0233's, and
which recuts any one of these three, must find this pin — and 0231's and 0232's, if it is one of
theirs too — and re-measure it against the new body in the SAME commit as the recut, or risk the
exact `has DRIFTED from its pinned body` refusal this file's general note explains. A recut at a
number ABOVE 0233 is not this obligation: 0233 is applied and this house never edits an applied
migration, so the recutting migration pins its own pre-image instead and 0233's pin is left
standing, historical rather than current — 0234 immediately below is exactly that case for
`clara._accounting_work_egress_live`. (0233's FOURTH pin, on `clara.get_llm_usage_summary`, is
a different thing: a pre-image of the body 0233 itself recuts, not a non-regression pin on a
function it leaves alone.)


## 0234 — the platform's legal enforcement mode (#1008)

The owner ruled on 2026-09-20 that during the beta **the state of a firm's agreements must never
switch a capability off**. 0234 gives the platform ONE setting with TWO values and teaches the
derived model-egress basis to read it.

| value | the derived `accounting_work` basis is live when… |
|---|---|
| `enforce` | ONE active OWNER of the firm holds acceptances of the currently PUBLISHED version of BOTH kinds, and the client is active — 0195's rule, unchanged |
| `prompt` (0234's landing value) | the client is active, and an active OWNER of the firm holds AT LEAST ONE real `clara.legal_acceptances` row, of either kind, at any version |

**`prompt` NEVER MANUFACTURES A CITATION.** A firm whose active owner has never accepted anything
at all is still refused, with the same indistinguishable `{"live": false}` every other negative
answers. On the hosted estate that class is expected to be empty, because checkout has always
required a data processing agreement acceptance to admit a firm (0186). The acceptance the basis
CITES is that owner's most recent DPA acceptance when one exists and their most recent Terms
acceptance otherwise, and it travels on kind-NEUTRAL keys (`basis_acceptance`, `basis_kind`,
`basis_version`) beside the kind-named ones (`terms_acceptance` / `dpa_acceptance`), either of
which may be NULL. **A Terms acceptance is never filed under a DPA-named key**, in any payload,
audit row or event. Under `prompt`, `terms_version` / `dpa_version` are the ACCEPTED versions, not
the published ones — under `prompt` no published version need exist at all.

| object | floor | what it is |
|---|---|---|
| `clara.legal_enforcement` | — | one row, FORCE RLS, one `clara_fn_owner` policy, ZERO application-role privilege, a two-value CHECK, no-delete + no-truncate (0186's `clara.admission_capacity` shape) |
| `clara._legal_enforcement_mode()` | granted to **nobody** | the ONE body every wall and every read consults; coalesces an absent row to `enforce` (fail closed) |
| `clara.set_legal_enforcement_mode(text,text,text)` | operator-firm **owner** | the only writer; `op_receipts`-idempotent, `clara._audit` receipt naming actor, new mode and previous mode |
| `clara.get_legal_enforcement_mode()` | operator-firm **owner** | `{mode, reason, updated_at, updated_by}`; takes its `mode` from the predicate, not the row, so the operator's answer cannot drift from the wall |

**THE WRITE DOOR IS `clara.set_admission_capacity`'s SHAPE, COPIED.** Rank through
`_human_ctx(role_rank('owner'))`, then the operator-firm `exists()` re-derived at call time; one
advisory transaction key of its own (`clara.legal-enforcement`); `now()` sampled ONCE into a local
and written both to `legal_enforcement.updated_at` and into the receipt. §0 PINS
`set_admission_capacity`'s own `prosrc` sha, which is what makes "copied from that door" a checked
claim. There is **no web control for the flip** in this ticket; the operator console row for it is
a follow-up.

**THREE SPLICES, EACH PROVEN BYTE FOR BYTE.** `prepare_egress_dispatch`'s `accounting_work` mint
arm (three anchors), `restore_client_egress_purpose` (three anchors) and `get_firm_legal_standing`
(one anchor) are patched by the house string-splice over `pg_get_functiondef`: every anchor is
asserted to occur EXACTLY ONCE, the pre-image `prosrc` sha is pinned, and after the splice the
REVERSE substitution is applied to the committed body and required to reproduce the pre-image sha
exactly. That last step is what turns "mint arm only" into a measurement rather than a promise.
`clara.consume_egress_dispatch` is NOT touched in either direction, and §T re-reads its pinned sha
to say so.

**WHY `restore_client_egress_purpose` HAD TO MOVE AT ALL** — the brief allowed it to stand "if it
only calls the helper", and it does not. It cites `v_live->>'dpa_acceptance'` in its consent
insert, in its audit row and in its event.
`ck_client_egress_purpose_consents_evidence` (0195:502) requires `legal_acceptance_id IS NOT NULL`
for `accounting_work`, so under `prompt` a Terms-only firm that revoked and then restored would
have raised `23514` — an estate defect, not a refusal, and exactly the class 0195's own review
round closed. Its CLR28 `derived_basis_not_live` refusal is untouched and still fires in BOTH modes
whenever the helper says the basis is not live.

**`clara.get_firm_legal_standing` KEEPS ITS OWN FACTS.** `standing_live` is still 0195:890-906's
limb (a) in both modes, so "this firm's legal standing is not current" is STILL reported under
`prompt` — the settings card and #1009's Firm Home prompt both need that fact in order to ask. The
door stays ARITY 0 FOREVER (0233's safety property); §T re-asserts it after the splice.

**DEPLOYMENT.** 0234 recuts FOUR live bodies, so it rides a writer-quiescence window: stop new
writes, drain in-flight calls, apply, resume — a call already executing finishes on its previous
body ("Migration and deployment behavior" above). It owes NO consumer-first obligation in the other
direction: the landing mode is strictly more permissive than the rule it replaces, the web reads a
NEW key and defaults a missing one to `enforce`, and no runtime lane calls any of the three new
names. ROLLBACK is a new append-only migration — or, with no migration at all, the operator firm's
owner setting the mode back to `enforce` through the door this file ships.

**WHAT A `prompt`-ERA CONSENT KEEPS AFTER THE FLIP, AND WHY IT IS AN EVIDENCE FACT AND NOT A HOLE.**
A consent is minted ONCE per (firm, client, `accounting_work`) and is never re-derived:
`prepare_egress_dispatch`'s guard is `not exists` over EVERY row of the purpose, live or revoked
(0195's own, carried through 0234's splice unchanged). So a row minted during the beta SURVIVES the
flip to `enforce` exactly as it was written — with its `derived under the beta legal enforcement
mode (prompt) …` scope note and, for a Terms-only owner, a `legal_acceptance_id` that points at a
TERMS acceptance. Nothing is granted by that row on its own: the live gate is
`clara._accounting_work_egress_live`, which `prepare_egress_dispatch` re-derives on EVERY
`accounting_work` call, so the flip withdraws authority on the next dispatch
(`clara.consume_egress_dispatch` re-checks the authorization's binding and its 120s TTL, not the
basis — that is the only residual window, and it is 0195's shape). What DOES persist is the
estate's durable record of the lawful basis. Two consequences for whoever builds the evidence
surface: join each consent to a FRESH `clara._accounting_work_egress_live` answer rather than
trusting its stored `scope_note`, and read `enforcement_mode` BEFORE rendering `terms_version` /
`dpa_version`, which carry the ACCEPTED versions under `prompt` and the PUBLISHED ones under
`enforce`. Whether the launch flip should re-derive or annotate the beta-era rows is a decision a
later ticket owes; 0234 deliberately does neither.

**THE ROLLBACK, LITERALLY.** There is no web control for the flip (that is the operator-console
follow-up), so both directions are a `psql` act by a person who is an ACTIVE OWNER of the firm
carrying `is_operator`. Measure the precondition FIRST — `clara.firms.is_operator` is set only by a
raw ops act (0133's tail: "ZERO firms are marked operator by this migration"), so an estate can
have none:

```sql
-- read-only. ZERO rows means NOBODY can reach the door, and the last resort below is the only way.
select f.id as operator_firm_id, f.name as operator_firm_name,
       m.user_id as owner_user_id, u.email as owner_email
  from clara.firms f
  join clara.firm_memberships m
    on m.firm_id = f.id and m.status = 'active' and m.role = 'owner'
  join clara.users u on u.id = m.user_id
 where f.is_operator
 order by m.created_at;
```

Then flip, as that owner, through the door — which is what leaves the `clara._audit` receipt naming
the actor, the new mode and the previous one:

```sql
begin;
  set local role clara_authenticated;                    -- the door is granted to this role only
  select set_config('request.jwt.claims',
    json_build_object('sub', '<owner_user_id from the query above>',
                      'role', 'authenticated')::text, true);
  select clara.set_legal_enforcement_mode(
    'enforce', 'rollback: <why>', 'rollback-<yyyy-mm-dd>-<unique>');  -- op_key is idempotency
commit;
```

LAST RESORT ONLY, if no operator firm with an active owner exists: `update clara.legal_enforcement
set mode = 'enforce' where id;` as the superuser satisfies the relation's CHECK and the wall reads
it immediately, but it writes NO `clara._audit` row, NO `updated_by` and no receipt — the change
becomes invisible to the estate's own record. Prefer creating the operator-firm precondition over
using it.

## 0235 — the document binding claim (#1014)

Two lanes may bind one client document: the **document-coding / evidence** lane
(`clara.attach_entry_evidence`, `clara.admit_journal_work`) and the **opening** lane
(`clara.approve_opening_seed`, `clara.approve_opening_correction`). Since
[0197](migrations/0197_coding_lane_evidence_link.sql) both reach that binding through ONE helper,
`clara._lock_document_binding`, which takes `clara.documents … for update` before either wall asks
its question. Since [0171](migrations/0171_opening_approval_isolation_pin.sql) the two opening
approvers run SERIALIZABLE.

Those two facts together were a double-posting hole, measured twice by #854 and repaired by
[0235_opening_binding_claim.sql](migrations/0235_opening_binding_claim.sql). **A row lock that is
only taken and released forces nothing on a waiter under a snapshot isolation level.** Neither lane
ever wrote a column on the document row it locked, so an opening approval that blocked on a
concurrent evidence attachment was granted the same byte-identical row when the attachment
committed, found no reason to abort, and decided against its own pre-block snapshot — which could
not see the new link. Both sides committed. (The reverse arrival order never had the hole: its
contender is plain READ COMMITTED and re-reads fresh per statement once unblocked.)

0235 keeps that `for update` unmoved and first, and appends one statement to the same helper: an
upsert of the document's row in `clara.document_binding_claims`. The claim is a **serialization
token** — one row per document, `document_id` / `claim_seq` / `claimed_at`, written by that helper
alone, read by nothing, no grant for any application role, RLS forced with a single owner policy.
Its conflict is arbitrated by an index rather than by either session's snapshot, so the blocked
side now meets a real write conflict. `ON CONFLICT DO UPDATE` is load-bearing: `DO NOTHING` takes no
row lock against a VISIBLE conflicting row and would leave the race open from a document's second
binding onwards.

The upsert's `serialization_failure` is caught in the helper and re-raised as the walls' own
`CLR13` / `source_already_posted` naming the document, so no raw `40001 could not serialize access
due to concurrent update` reaches a person. The handler wraps **the upsert alone**: a serialization
failure on the `clara.documents` row would mean the document row itself changed (the legacy
bytes/storage upgrade is its only writer) and keeps its own spelling. `detail.entry_id` is
present-and-null on this one arm — the winner committed after the loser's snapshot and no read
inside a SERIALIZABLE transaction can reach it.

**It serializes on the document, not on the conflict, and that over-refuses on purpose.** A
SERIALIZABLE session that blocked on *any* other transaction binding the same document is refused,
including one that left no live evidence link. Measured with both sides driving
`clara._lock_document_binding` directly: the waiter blocks on a `Lock` and is refused `CLR13`; the
same call unraced succeeds. The one case where this is stricter than the sequential path is a plain
coded approval carrying the tie document racing an opening approval — 0213's opening arm probes live
links alone, so sequentially both stand. Narrowing it is not available: the losing session cannot
read *what* the winner claimed, which is the same snapshot limit the claim exists to work around.
The outcome is conservative, typed and retryable.

**An id that names no document still claims nothing** (fix round, ADV-L01-02). 0197's contract for
the helper is that an unknown document "locks nothing and raises nothing"; the claim is gated on the
`for update` having found the row (`if not found then return`), so the token is never written for a
key no document owns. Without that gate the helper left an unreachable row behind and — measured
with two sessions on two such ids — gave them a contention point OUTSIDE `clara.documents`' own
ordering, where they deadlocked and the loser saw a raw `40P01`. Re-measured after the gate: both
sessions return `ok` and no claim row exists.

**Retention** (fix round, ADV-L01-03): the life of the document. One row per document, upserted in
place, written only by this helper and only for a document that exists; nothing prunes it and
nothing should, because the token's value is that the key is there to conflict on. The row count is
bounded above by `clara.documents`, and the dead tuples an upsert leaves are ordinary autovacuum
work.

**Lock order.** The claim is taken after the document row and only ever for the same document, so a
transaction binding documents A then B takes `A.doc, A.claim, B.doc, B.claim`: the relative order
of two documents is the one `clara.documents` already imposed, and two transactions that inverted it
would already have deadlocked on `clara.documents`. It joins neither the member-door order above
nor the wave ladder `accounting_plans → accounting_work → agent_tasks → agent_interruptions`.
`deadlock_detected` (40P01) is therefore not caught beside `serialization_failure`: with the claim
taken only after — and only for — a document row that exists, two sessions contending for one
document meet on that row first and cannot form a cycle on the claim's primary key. A deadlock on
`clara.documents` itself predates this file and stays raw, for the same reason a serialization
failure on that row does.

Deployment notes: it recuts exactly one body (`clara._lock_document_binding`, a `create or
replace`, so no catalog entry enters or leaves and the grant matrix is unchanged), mints one table,
edits no applied migration, and re-pins `clara._tf_source_binding_wall`,
`clara._tf_evidence_link_binding_wall`, `clara._document_posting_entry`,
`clara._approve_opening_entry` by `sha256(prosrc)` in its prestate and again in its tail. The two
opening DOOR pins are two-state, because 0239 recuts both to mint the opening Work: on a
from-scratch chain 0235 runs first and the pinned bodies are the only lawful ones, while on a lane
rig mid-wave a redo meets 0239's bodies (recognised by their call to `clara._admit_opening_work`,
not by a ledger row — a redo rewrites the ledger). What the prestate accepted is handed to the tail
through a session setting, so the tail still proves this file moved neither door. It owes **no** writer-quiescence window: a transaction that began under the old body
simply does not take the claim, which is the behaviour that shipped before it. Rollback is a
successor migration restoring 0197's two-line body; the table may stay, since nothing reads it.

## 0236 — the subledger hook's caller roster, stated on the hook itself (#868)

`clara._subledger_on_approve` ([0037](migrations/0037_wave_c_a_subledger.sql)) is the one hook that
births `clara.open_items` rows and classifies a coding kind when a journal entry is approved. It
carried no statement of its own reachability: the first thing a reader who greps its name finds is
0037's own tail, which pins its caller set at **four** — a pin that was already two migrations
stale by the time [0216](migrations/0216_fixed_asset_acquisition.sql) and
[0221](migrations/0221_staff_expense_claims.sql) each independently re-derived and re-pinned the
live set at **six**, because neither had one shared place to read it from.

The live six, and where each one's direct call arrived:

| caller | arrived |
|---|---|
| `_approve_entry_core` | [0037](migrations/0037_wave_c_a_subledger.sql) (hook's own creation) |
| `_approve_opening_entry` | [0037](migrations/0037_wave_c_a_subledger.sql) |
| `approve_wrong_client_correction` | [0037](migrations/0037_wave_c_a_subledger.sql) |
| `reverse_entry` | [0037](migrations/0037_wave_c_a_subledger.sql) |
| `finalize_close` | [0056](migrations/0056_wave_e_close_model.sql) (created already calling it) |
| `reopen_fiscal_year` | [0085](migrations/0085_b3_reopen_ends_on.sql) / [0086](migrations/0086_b3_reopen_ends_on_part2.sql) |

`reopen_fiscal_year` is the one entry worth a note: through 0056 it unwound a closed year by
calling `clara.reverse_entry`, so it was not itself a direct caller yet — measured absent from
0056's own body, and stated in 0085's own header ("0056's reopen routes its unwind through
`clara.reverse_entry`"). 0085 gave it a dedicated reversal mirror and its own direct call; 0086 (its
obligatory sibling file) pinned the resulting six-name caller census and the six-count
approve-writer census, both re-derived from the live catalog. 0216's own comment attributes both
new callers to "0056" — imprecise on this one point; 0085/0086 is the correct citation, and 0236's
comment carries the corrected one.

[0236_subledger_hook_caller_roster.sql](migrations/0236_subledger_hook_caller_roster.sql) closes
the discoverability gap with exactly one statement: a `comment on function` naming all six callers
and the migration each arrived in, and stating that 0037's four-name census is stale by two. Its
prestate re-derives the roster from the catalog the same way 0216/0221's own tails do and refuses
to apply unless it is still that measured six; its tail re-reads the comment's content and
re-confirms the hook's body (`sha256(prosrc)`), owner, `SECURITY DEFINER` flag and (empty) grant
are byte-for-byte unmoved, and that the hook is still reachable by no trigger directly. No door, no
wire shape, no new relation, and no shared roster-census helper (out of scope, Agent Brief): the
next migration that needs the count still re-derives it in its own tail, exactly as 0216 and 0221
did — this file only gives the first reader a durable place to learn what that census currently
reads.

## 0237 — `clara._assert_journal_basis`'s `nonzero_total` arm, stated as unreachable (#906)

`clara._assert_journal_basis` ([0178](migrations/0178_accounting_work_journal_successor.sql))
validates a journal basis before either of its two live callers
(`clara.create_accounting_plan` at [0193](migrations/0193_accounting_plans.sql):1521 and the
prepayment door at [0223](migrations/0223_prepayment_amortisation.sql):1246) records it. Its own
constraint vocabulary lists `nonzero_total` ("the basis moves no money") beside three reachable
tokens with no note — a reader might assume it is live defence-in-depth. It is not: found
independently from both the accrual (#652) and prepayment (#653) sides while each wired refusal
logic through this shared predicate, and recorded in the accrual gap map as untested because it is
unreachable.

**Why it is unreachable.** Two earlier arms in the same function foreclose it:

* `at_least_two` (0178:743-745) refuses fewer than two lines, so the per-line loop always runs —
  the vacuous "zero lines, both totals initialise to zero" shape can never reach the totals check.
* `exactly_one_side` (0178:769-772) refuses any line whose debit and credit are equally signed,
  including both zero. Combined with `clara._journal_cents` refusing a negative minor-unit value,
  every surviving line carries exactly one strictly positive side.

An all-zero basis (every line's debit AND credit are zero) is therefore refused by
`exactly_one_side` on its first line — control never leaves the per-line loop. A basis whose debit
total is genuinely zero but whose lines are each one-sided forces every line's credit to be
strictly positive (by the same arm), so the credit total is positive while the debit total is
zero; `balanced` (0178:780-783) refuses that mismatch — `v_dr <> v_cr` — before `nonzero_total`'s
own `if v_dr = 0` line is ever reached. `nonzero_total` is retained as a fold guard only. This was
already downstream knowledge (0223:1257-1266, the prepayment door's own comment, carries the same
finding at its call site); the predicate itself carried no statement of its own contract.

[0237_journal_basis_zero_total_unreachable.sql](migrations/0237_journal_basis_zero_total_unreachable.sql)
closes the gap with exactly one statement: a `comment on function` naming `nonzero_total` as
unreachable by construction and naming both guarding arms, `at_least_two` and `exactly_one_side`.
Its prestate pins the predicate's body (`sha256(prosrc)`), owner, `SECURITY DEFINER` flag and
owner-only ACL, and refuses to apply if the body has drifted or no longer carries all three
tokens; its tail re-reads the comment and re-confirms the same four facts are byte-for-byte
unmoved. No door, no wire shape, no new relation, no reordering and no recut of either caller
(explicitly out of scope, Agent Brief): `at_least_two`, `exactly_one_side`, `balanced` and
`nonzero_total` all still exist, in the same order, raising the same messages.
[tests/journal-basis-zero-total-unreachable.test.mjs](tests/journal-basis-zero-total-unreachable.test.mjs)
calls the predicate directly (the ticket's own named seam) and proves both shapes above land on
the arm this section says they do, never on `nonzero_total`.

## 0238 — the correction door takes the client rung before any client row (#914)

`clara.approve_wrong_client_correction` was the **only** door in the estate that acquired a
`clara.clients` row **before** the client advisory rung `203005004`. #649's round-two re-check
censused every rung-bearing body, found exactly one such door, measured a real deadlock against an
adversary in the prescribed order, and recorded it in `DECISIONS.md` §3.1 as a pre-existing
violation — explicitly not #649's to fix.

**The ladder, before and after** (acquisition sequence, not source order):

| step | before (0027 → 0037 → 0038 → 0125) | after (0238) |
|---|---|---|
| 1 | firm rung `203005002` | firm rung `203005002` |
| 2 | `filing_corrections` row `for update` | `filing_corrections` row `for update` |
| 3 | `clara.documents` row `for update` (0027 task #29) | unchanged |
| 4 | `clara.document_filings` rows `order by id for update` | unchanged |
| 5 | **`clara.clients` row on `x.from_client`** | `clara.journal_entries` rows `for update of je` |
| 6 | `clara.journal_entries` rows `for update of je` | **client rung `203005004` on `x.from_client`, once, unconditionally** |
| 7 | client rung `203005004` on `o.client_id`, per item, inside the reverse branch | **`clara.clients` row on `x.from_client`** |

**Why the remedy is to move the ROW down, not the rung up.** 0037 §K states the rung ladder as a
partial order with one named exception: `clara.reverse_entry` and this door lock a *pre-existing*
`clara.journal_entries` row **first**, because `clara._approve_entry_core` does, and inverting that
in one verb would itself be the deadlock. 0037 §H.3 installed a body census pinning the rung after
`for update of je` and before `clara._subledger_allocated_items_present(`
([tests/x37-wave-c-a-subledger.test.mjs](tests/x37-wave-c-a-subledger.test.mjs) still asserts it
live). Hoisting the rung to the top of the body — the obvious-looking remedy — would break that
pin and invert against the core. 0238 therefore moves the client row *down*, below a rung that
stays exactly where 0037 put it relative to the entry row locks.

**Which client the rung covers, and why once is enough.** The correction's **source** client,
`x.from_client`. Every captured item is an entry selected by `je.filing_id = <the source client's
active filing>` (`clara.preview_wrong_client_correction`,
[0007](migrations/0007_document_pipeline.sql):2460, whose plan `propose_wrong_client_correction`
stores verbatim); `ck_je_document_filing_pair` makes `document_id` and `filing_id` null together,
and the `t_je_provenance` constraint trigger refuses any entry with a document whose filing's
`client_id` differs from the entry's own. So `o.client_id = x.from_client` for every item,
structurally — and neither column can drift afterwards (neither appears in any allowset of
`t_je_immutable`, and a filing's identity is immutable as well). Advisory xact locks are
re-entrant, so the old per-item acquisition was already a no-op after the first item; 0238 takes
the same key once, earlier, and holds it a little longer. The hoist also drops a **condition**
(fix round, ADV-L01-07): in 0125 the rung sat inside `if it.action = 'reverse'`, so a correction
whose items are all `withdraw_draft` or `already_reversed` — one that reverses nothing — took no
client rung at all, and now takes it like every other correction. That is strictly more locking and
adds no pair: every `rung → Y` the straight-line acquisition creates already existed on the reverse
arm, and 0037 §H.3's "rung before `clara._subledger_allocated_items_present(`" order is intact. Its prestate refuses to apply if either
of those two walls is missing.

**The new pair this creates, stated rather than hoped.** The `journal_entries` row locks now
precede the `clara.clients` row, so a door taking a client row and *then* a `journal_entries` row
would invert against 0238. There is none: of the eleven live bodies that acquire a `clara.clients`
row, this is the only one that also locks a `clara.journal_entries` row.

[0238_correction_client_rung_order.sql](migrations/0238_correction_client_rung_order.sql) is one
`create or replace function` carrying 0125's body with exactly three edits (the `for update of je`
statement moves up, one `pg_advisory_xact_lock(203005004, hashtext(x.from_client::text))` is
inserted, the per-item acquisition becomes a comment). Everything else — every refusal code and
message, the reversal mirror and its adoption branch, the single `clara._subledger_on_approve` call,
`clara._book_today()`, the filing retirement and re-filing, the coding task, the notification, the
audit row, the domain events and the receipt — is 0125's, verbatim. Its prestate pins the 0125 body
by `sha256(prosrc)` (and accepts its own body, so a #957 redo is safe), the owner, the
`SECURITY DEFINER` flag and the ACL; its tail re-reads the new ladder off the catalog, re-asserts
0027's documents-before-`document_filings` order, counts the fifteen refusals and both rungs, proves
the source filing is still retired under the source client's row lock, and runs a
catalogue-derived census over **every** `clara` body proving no door is left that takes a
`clara.clients` row before the rung.
[tests/correction-client-rung-order.test.mjs](tests/correction-client-rung-order.test.mjs) drives
the schedule that deadlocked — an adversary holding the rung, then taking the row — with the
deadlock SQLSTATE as its oracle, races the door against `clara.record_wiki_source_ingest` to prove
the source client is still serialised against publication, and re-runs the same census from the
other side.

## 0239 — the opening lane becomes a Work (#984)

**What was wrong.** Approving an opening seed or an opening correction wrote opening's own receipt
relation (`clara.opening_seed_approvals`, one row per approved entry) and nothing else: no
`clara.accounting_work` row and no `clara.operation_receipts` row. The one accounting act every
later figure carries down from got none of the Work list, Work detail, Work audit or firm Activity
treatment every other accounting act gets, so a firm could not see its own opening at all. #656's
AC5 asked for the Work-and-receipt pair here and the 2026-09-15 wave recorded it as "descoped
(authority)"; the owner's ruling of 2026-09-20 on #984 settles that authority question and reverses
that ticket's own recommended Option B.

**Why it is a governed widening.** The purpose vocabulary is closed independently in six places,
each of which refuses a fourth value on its own. 0239 widens four of them and deliberately leaves
two alone:

| where | 0239 |
|---|---|
| `accounting_work_purpose_check` | widened to four |
| `operation_receipts_purpose_check` | widened to four |
| `ck_accounting_work_adjustment_basis` | widened: `opening_balance` joins `journal_entry` on the no-particulars side |
| `clara._assert_adjustment_basis` | one new arm, in the journal-entry arm's position and with its spelling |
| `clara._admit_accounting_work_core` | **not** widened — it inserts an `agent_tasks` row and demands a model name |
| `clara._record_journal_entry_core` | **not** widened — an opening Work never reaches the posting core |

**No Work is minted out of nothing** (fix round, ADV-L01-08). Both doors build the Work's entry
array from the seed's DRAFT opening items and hand it to `clara._admit_opening_work`
unconditionally, so on a reading of that block alone an empty batch would mint a Work with
`basis.entry_count = 0`. It cannot happen, and the guard is each door's own "opening seed / opening
correction has no draft entries" arm (0017's, kept verbatim by 0239 at :730 and :889), which runs
before the loop that builds the array. Measured on the rig: approving a seed with nothing staged
raises `CLR31` and leaves no `clara.accounting_work` and no `clara.operation_receipts` row
(`obw984.zero_entry` in
[tests/opening-balance-work.test.mjs](tests/opening-balance-work.test.mjs) pins the ordering, so a
later recut that hoists the minting above the guard is a red cell).

**Two shape CHECKs also read the purpose,** and they are why this file is bigger than a CHECK swap.
`clara.operation_receipts.task_id` was `NOT NULL` with an FK to `clara.agent_tasks`; an opening
approval owns no run, so the column becomes nullable behind a NEW purpose-keyed CHECK
(`ck_operation_receipts_task_by_purpose`) that makes the nullability *exact*: the three
model-served purposes still **require** a task and the opening purpose **refuses** one. The
invariant is tightened, not loosened. `ck_operation_receipts_outcome_shape` demanded a non-blank
`effects->>'entry_id'` on every committed receipt; an opening batch commits N entries and owns none
singly, so its arm names `effects->>'seed_id'` instead and the other three keep the entry arm
byte-for-byte. Leaving `entry_id` out is load-bearing twice: `clara._tf_assert_agent_post_receipt`
counts receipts that name an entry and refuses any count but one, and
`clara.list_activity` / `clara.get_activity_event` join their entry through that same text
expression with left joins that already tolerate its absence.

**The sibling admission path.** `clara._admit_opening_work(uuid,uuid,uuid,uuid,integer,jsonb,text,
uuid,text)` is a `clara_fn_owner` `SECURITY DEFINER` internal granted to **nobody**, reached only
from the two opening approvers, which have already taken `clara._human_ctx(role_rank('admin'))`,
the registry row lock, the client advisory rung and the whole tie assertion before they call it. It
mints **one Work per approved batch** (not per entry — `clara.opening_seed_approvals` already owns
the per-entry record) at `status = 'completed'`, `basis_origin = 'user_direct'`,
`adjustment_basis` null, `current_task_id` null, and its receipt with `task_id` null,
`acting_actor` = `on_behalf_of` = the approving human and `via_wake_kind = 'opening_approval'`. The
`run_id` is the door's own operation key, which is the only run identity a human door has. The
intent key is `opening:<seed|correction>:<seed_id>:<batch_n>`, so a correction batch is a second
Work rather than a conflict under `uq_accounting_work_intent`. The one authority question it
re-derives for itself is membership, and it asks it the way the rest of the estate does —
`and m.status = 'active'` — so the `actor_not_active` refusal it raises names the predicate it
actually tested and `initiator_role` can only be read off a live membership row. (It first ordered
active rows first and took the top one, which admitted a **removed** member; unreachable through
the two doors, whose `clara._human_ctx` already filters on `active`, but the seam's own guard is
what a third caller would inherit. Fixed in the #984 fix round, ADV-L01-04; the tail re-reads the
predicate off the live body and `obw984.admit.membership` drives it.)

**The basis is what was approved, not a journal basis.** No lines, no posting date, no memo: the
entries were approved by `clara._approve_opening_entry` and tied out by `clara._assert_opening_tie`
*before* the Work row is written. `source_refs` stays the empty array even on a tied seed — a
source ref is the journal lane's evidence **claim** and stamping one would enrol the tie document
in `clara._tf_intake_batch_member_work_stamp`'s open-batch hand-off — and the tie document is
recorded as `basis.tie_document_id`, a fact rather than a claim. `apps/web`'s Work detail gained
the matching guard: a basis with no `lines` array renders a sentence saying so instead of throwing
on `basis.lines.map`.

**Known cosmetic consequence, recorded rather than left to be discovered.** The firm Activity row
renders "*person* on behalf of *the same person*" for an opening receipt, because
`clara.operation_receipts.on_behalf_of` is `NOT NULL` and the approver acted for themselves. That
is what the receipt says and it is true; suppressing the phrase when the two are equal is a web
change 0239 deliberately does not reach for.

[0239_opening_balance_work.sql](migrations/0239_opening_balance_work.sql) is redo-safe by
construction (`create or replace`, `drop constraint if exists` before `add constraint`, an
idempotent `drop not null`) and its prestate admits **both** lawful states of every object it
replaces, naming which one it found. Its tail re-reads all four CHECKs (each must carry the three
prior values *and* the fourth), the nullable-but-FK-bound `task_id`, the new internal's empty
EXECUTE audience and the absence of `agent_tasks`/model from its body, both doors' owner,
`SECURITY DEFINER` flag, pinned `search_path`, 0171 `SERIALIZABLE` proconfig and
`clara_authenticated`-only audience, the whole-database count of isolation-pinned bodies (2, and
they are the opening doors), and the two cores it must not have moved, by `sha256(prosrc)` and by
re-reading the posting core's closed three-value IN-list.
[tests/opening-balance-work.test.mjs](tests/opening-balance-work.test.mjs) drives both human doors
for real and asserts what appears, what does not, and that opening's own relations are unchanged.

## 0243 — the role at the instant of a governed act (#912)

`clara.firm_memberships` has no history: `clara.set_member_role` updates the role in place and
`clara.remove_member` flips `status` in place. So before this migration, "what authority did this
act actually run under" was unanswerable once anybody was promoted or demoted, and
`clara.list_firm_knowledge` could only report the promoter's role **now** — which is what its
`_now` suffix has always said out loud.

`0243_audit_actor_role.sql` closes it the way the owner ruled (issue #912, 2026-09-18): on the
audit row, not in a new membership-revision relation.

- **The column.** `clara.audit_log.actor_role`, nullable `text` under `ck_audit_log_actor_role`.
  It carries **four words, one fact each**, and the two markers are the point:

  | value | meaning |
  |---|---|
  | `NULL` | the row predates this mechanism. **Unknown**, and never guessed. |
  | `'no_actor'` | measured at the write: the row names **no actor at all**. |
  | `'none'` | measured at the write: a **named** actor who held **no active membership** in that firm. |
  | `viewer`/`bookkeeper`/`admin`/`owner` | measured at the write: the role that actor held. |

  Without `'none'`, `NULL` would mean both "before the mechanism" and "the wake lane's agent
  identity, which holds no membership by construction" — and the ruling's own "unknown" would be a
  guess. `'no_actor'` is the same discipline one step further: `clara.audit_log.actor` is nullable
  and much of this estate's traffic (estate notices, seeding, sweeps) carries no person at all, and
  saying *"the mechanism looked and found no membership"* about a row with nobody in it would be
  the same conflation in a third place. `clara.role_rank(...)` is `NULL` for both markers, so
  neither can ever be compared as authority.

- **Where it is filled, and why not in `clara._audit`.** The ruling names `clara._audit`, the sole
  writer of the table. It cannot be edited: it is **ordinal 10 of the frozen `metric_input_snapshot`
  v1 producer closure**. `clara.metric_input_producer_version_members` pins
  `sha256(pg_get_functiondef(...))` for each of the 15 members,
  `clara.verify_metric_input_producer_freeze()` hard-codes that roster and raises
  `metric input producer freeze mismatch` on drift, and `scripts/migrate.mjs`'s `FREEZE_GUARDS`
  re-read every protected row's evidence around each migration. A first draft of 0243 did recut
  `_audit` and the runner rolled the whole migration back with *"metric input producer protected
  freeze evidence changed during the migration — refusing to migrate"*. There is no version-bump
  escape: the freeze reads the LIVE body of every version row's members. **If you need to change
  `clara._audit`, `clara._human_ctx`, `clara.role_rank`, `clara.jwt_sub`, `clara.jwt_firm`,
  `clara.actor_role_rank`, `clara._reserve_op`, `clara._hash`, `clara._finish_op` or any other
  member of that roster, you cannot — find a seam beside it.**

  So the stamp is `clara._tf_audit_actor_role()`, a BEFORE INSERT row trigger
  (`t_audit_actor_role`) on `clara.audit_log` itself. It is **wider** than the recut would have
  been — it reaches the table, not one function — and all 304 `_audit` callers inherit the column
  with no per-door change, which is exactly the ruling's own acceptance criterion.

- **History is never handed a guess.** The column is added with no `DEFAULT` (a default could not
  have been right anyway: a column default cannot see the row's own `firm_id` and `actor`), the
  file contains no `UPDATE` of `clara.audit_log`, and §A *measures* on the live database that every
  pre-existing row stayed `NULL`. The table's append-only triggers refuse any later back-fill. The
  stamp also refuses to invent a role for **any row whose own `at` predates the transaction** — a
  rig minting a pre-mechanism world, or a hand-loaded row. That arm **clears** the column rather
  than keeping what the insert supplied: otherwise `at` would be a dial, and as `clara_fn_owner`
  (the identity every `SECURITY DEFINER` body runs as) a row backdated by one second could carry
  a forged `'owner'` past `ck_audit_log_actor_role`. So the guarantee is a property of the
  **table's** write path, not of `clara._audit` alone: **no insert can assert a role this
  database did not measure.** A restore is unaffected, measured rather than assumed —
  `scripts/restore.mjs` replays a plain `pg_dump` through `psql`, and pg_dump emits triggers in
  its **post-data** section, after the data (`pg_dump --section=post-data -t clara.audit_log` is
  where `CREATE TRIGGER t_audit_actor_role` appears), so `clara.audit_log`'s `COPY` runs before
  the trigger exists and every restored row keeps the `actor_role` the dump carried.

- **When the role is resolved, exactly.** At the **audit write**, inside the act's own
  transaction — not at the moment the door admitted the call. Under `READ COMMITTED` each statement
  takes a fresh snapshot, so a role change that *commits* between a door's `clara._human_ctx`
  admission check and the act's audit write is what the column then reports (reproduced on the rig
  with two connections: a bookkeeper's `clara.correct_knowledge` parks on a row lock, the caller is
  promoted to owner and commits, and the resulting audit row reads `owner`). Carrying the
  admission-time role instead would mean a transaction-local value set where the admission happens
  — and **every** function on that path is a frozen `metric_input_snapshot` v1 producer member:
  `clara._human_ctx`, `clara.role_rank`, `clara.actor_role_rank`, `clara.jwt_sub`,
  `clara.jwt_firm`, `clara._reserve_op` and `clara._audit` itself. The same freeze that forbids the
  recut forbids the carry, so the column's meaning is stated rather than stretched: *the role the
  actor held when the database recorded the act*. `tests/audit-actor-role.test.mjs` ar.07 pins it.

- **Who cites it.** `clara.list_firm_knowledge`'s authority block gains `promoter_role_at_act`,
  matched to the audit row the promotion itself wrote (`clara._knowledge_insert_revision` audits
  every revision with that revision's own id in `args.revision_id`, and `actor` is re-checked
  against `asserted_by` because the promotion lane audits each record under the **answerer**). It
  sits beside `promoter_role_now` and `required_role` as a third, separately-labelled fact; the web
  register renders all three, says *"Not recorded — this rule predates the record of authority"*
  for a null, and says *"No membership in this firm when the rule was recorded"* for `'none'` —
  the marker is never rendered raw, because it is not a rank. (`'no_actor'` cannot reach this
  block: `clara.knowledge_records.asserted_by` is `NOT NULL` and the subquery matches
  `a.actor is not distinct from r.asserted_by`.) `ix_audit_log_knowledge_revision` keeps that
  citation off a sequential scan of the whole log.

- **Why a viewer may read it, although `clara.audit_log` itself starts at bookkeeper.** Review
  (ADV-04) asked whether this lowers an audit-log fact to the register's own viewer floor.
  Measured on the lane database: `p_audit_log_human` is
  `firm_id = clara.jwt_firm() AND coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper')`,
  but `p_firm_memberships_human` is `firm_id = clara.jwt_firm()` with **no rank floor at all**
  and `clara_authenticated` holds `SELECT` on `clara.firm_memberships` — so *"what role does
  this colleague hold in my firm"* is already a viewer-readable fact at the table that owns
  roles. The bookkeeper floor protects the **log** — which acts ran, by whom, with which
  arguments and outcome — and this key discloses none of that: one role word, about the promoter
  of a rule the same viewer is already being shown, beside `promoter_role_now`, which that
  viewer can read from `firm_memberships` directly. Nothing was loosened; the datum is the same
  KIND of fact at the same firm scope, pinned to an instant.

Battery: `tests/audit-actor-role.test.mjs` (ar.01–ar.07), gated by
`tests/audit-actor-role-preintegration-gate.mjs`.

## 0244 — the capability registry's version high-water mark (#846)

`0207_document_capabilities_version_monotone.sql` made `registry_version` monotonicity a database
refusal for **UPDATE transitions** and named two residuals in its own header rather than closing
them. `0244_document_capability_version_high_water.sql` closes both. Measured on a lane rig before
the change: `pdf × invoice` published `2`, deleting the row and re-inserting it at `1` was
ACCEPTED and the table then read `1`.

| object | what it is |
|---|---|
| `clara.document_capability_version_high_water` | one row per `(format, document_kind)` carrying the highest `registry_version` that pair has ever published, backfilled TOTAL over the live registry. FORCE RLS, one `clara_fn_owner` policy, **ZERO application-role privilege** — it is an integrity ledger, not a read surface |
| `clara._tf_document_capabilities_version_high_water()` | BEFORE INSERT wall (and, since 0272, a BEFORE UPDATE wall on a key change too): a row may not LAND below the mark of the pair it lands on. `CLR08` / `detail.reason = registry_version_high_water`. A pair with no mark has never been published and is admitted |
| `clara._tf_document_capabilities_high_water_record()` | AFTER INSERT OR UPDATE writer: raises the mark, never lowers it (`where excluded.registry_version > h.registry_version`) |
| `clara._tf_document_capability_high_water_monotone()` | BEFORE UPDATE OR DELETE on the mark: DELETE refused outright; UPDATE refused when it lowers the version, re-keys the row, moves `first_seen_at` or (since 0272) moves `recorded_at` backwards. `CLR08` / `registry_version_high_water_append_only` |
| `clara._tf_document_capabilities_version_uniform()` | DEFERRABLE INITIALLY DEFERRED **constraint trigger** body: a transaction may not LEAVE more than one distinct `registry_version` on the registry. `CLR08` / `registry_version_uniform`, with `detail.versions` |

**RETIRING A ROW STAYS POSSIBLE, which is why the mark is a separate relation.** Refusing DELETE on
the registry would have closed the hole too, and #846 rules it out in its own words: 0191 publishes
one row per pair for the LIVE vocabulary, so a kind or a format that leaves that vocabulary must be
able to leave the registry with it. A mark keeps the memory of what was published without keeping
the publication. A column on the registry could not — it would be deleted with the row it is meant
to outlive, which is the defect restated.

**WHY THE UNIFORMITY WALL IS DEFERRED, and why it is not statement-level.** Every republication the
registry has had moves all 240 rows (`0228` is the precedent), so a check at the end of each
STATEMENT would refuse the first one — a republish is non-uniform in the middle by construction. A
transaction is therefore judged on what it LEAVES. PostgreSQL has no statement-level constraint
trigger: `create constraint trigger … for each statement` is a syntax error (42601) and `create or
replace constraint trigger` is unsupported (0A000), both measured on PG 17.11, and the upstream
grammar hard-codes `FOR EACH ROW`. The wall is therefore an AFTER ROW constraint trigger with a
table-wide body, and 0244 drops before it creates. An EMPTY registry is uniform — the refusal is
for MORE THAN ONE version, spelled as such.

**The cost, stated.** A deferred AFTER ROW trigger fires once per changed row at commit, so a
240-row republication runs the uniformity body 240 times over a 240-row table. Migrations are the
only writer this table has ever had.

**Redo-safe by construction** (wave-2 rule; "Redo (#957)" above): `create table if not exists`,
`create or replace function`, `drop trigger if exists` before each `create trigger`, `drop policy if
exists` before the policy, and a backfill that is an `on conflict … do update` which only ever
raises. The prestate reports FIRST or REDO instead of refusing on its own objects; it still pins
0207's body by `sha256(prosrc)` and refuses a registry that already publishes two versions.

**What 0244 did NOT close, and 0272 does.** 0244's header states the invariant as an absolute —
"a version once published for a pair can never be undercut BY ANY ROUTE". The adversarial lens
then drove three routes to the opposite end, as `clara_fn_owner`, the role every migration runs as
and the only writer either table has. See "0272" below; the sentence is true of those three only
because 0272 exists.

## #782 — the invoice family's line-item limit becomes an accepted limitation (0245)

`0245_invoice_line_items_accepted_limitation.sql` creates nothing and recuts nothing — the
registry's THIRD publication, riding the same UPDATE idiom `0228` set and `0244`'s walls now
enforce rather than merely convention. Owner ruling 2026-09-18: no invoice line items this round;
the registry stops calling the gap `planned` (future tense) and names it what it is — a standing,
accepted limitation.

**The change, exactly.** The 28 invoice-family rows (the six OCR-family formats ×
`invoice`/`credit_note`/`debit_note`/`receipt`, plus `xml` ×
`invoice`/`credit_note`/`debit_note`/`e_invoice_xml`) move `limits.invoice_line_items` from
`planned` to `accepted_limitation`, with a new sibling `invoice_line_items_reason` =
`no_consumer_reads_line_facts` — the same two-key shape `limits` already carries for the OFX row
(`opening_balance` + `reader`). Then the whole registry raises `registry_version` 2 → 3
(`registry_version = registry_version + 1` over all 240 rows), never DELETE-then-INSERT. Neither
`typed_facts`, `business_operation` nor `basis` moves on any row: Clara's read of invoice HEADER
facts and the operation it drives are unchanged, which is the ticket's own "no reading, drafting or
posting behaviour changes".

**The reason is checkable, not asserted.** `packages/runtime/lib/trade-invoice-basis.ts`'s posting
tool schemas are `.strict()` throughout and admit no `line_items` field — a model that invented one
is refused by the schema, not silently dropped — and no reader anywhere in `packages/runtime`
persists a per-line invoice fact. Header-only is therefore a structural fact about the schema
Clara posts through, not a scheduling choice.

**Why this migration's prestate re-pins #846's five wall bodies.** #846 is this same lane's own
prior ticket; the wave-2 addendum's own rule is "an earlier ticket of this lane may already have
recut a body you touch: pin what is live". 0245's raise rides `_tf_document_capabilities_version_
monotone` (0207), `_tf_document_capabilities_version_high_water`, `_tf_document_capabilities_high_
water_record`, `_tf_document_capability_high_water_monotone` and `_tf_document_capabilities_
version_uniform` (all four 0244), so the prestate re-measures every one of the five by
`sha256(prosrc)` rather than trusting 0244's own pins, which were taken a commit earlier on the
same branch. The tail re-hashes all five again, and asserts the high-water mark rose to 3 for
every pair via #846's ordinary AFTER-trigger writer path — never a first publication, never a
partial raise.

## #988 — a fifth business_operation level, proposal_only (0246)

`0246_business_operation_proposal_only.sql` widens ONE column CHECK — nothing else.
`business_operation` now admits a fifth value, `proposal_only` ("Clara proposes, a person
confirms": Clara reads the pair deterministically and derives a real proposal, but never carries
it into a posted operation on its own authority), alongside the four `custody`, `byte_extraction`
and `typed_facts` keep unchanged (`supported`/`stored_only`/`unsupported`/`planned`) — those three
are out of scope for #988 and the tail proves them byte-identical.

**No row moves.** Owner ruling 2026-09-20 names no row for reclassification here: `prior_gl` —
the pairing #656 measured as fitting the new level's own description — stays `stored_only`,
because the SAME session's #983 ruling retires the prior-GL seeding lane outright (the Client KB,
not a hand-registered pairing, is the intended ingestion path for it going forward, #1012). Since
zero rows' data changes, `registry_version` does NOT move. The direct precedent is this lane's own
#846 (0244): it minted a whole new relation and two new walls, touched zero registry rows, and
left `registry_version` exactly where 0228 published it (2) until 0245 (#782) separately raised it
for an actual content correction. `0246` follows that shape — it changes VOCABULARY, not DATA —
and its tail proves the registry is still uniformly at 3 (0245's own publish) after it runs.

**The honesty invariant is a test cell, matching the one it sits beside.** `business_operation`
never claiming `supported` where `typed_facts` is not has ALWAYS lived only in
`document-capability-registry.test.mjs`'s repeatable battery, never in a table CHECK (0191's own
one-time apply-tail is the only other place it was ever stated, and that runs once, at migration
time, never again). `proposal_only`'s own rule — never claiming the level where `typed_facts` is
not `supported` either, since a proposal with no facts to propose from is the identical
over-claim — is added the same way, beside it, and PROVEN discriminating: the migration's own tail
(§C.4) sets up one honest row and one dishonest one inside a rolled-back probe, and the repeatable
test file's own new cell reads the same shape live.

**What that costs, said plainly (a knowingly-accepted residual).** Because the rule lives in a
test and not in a CHECK, **nothing refuses it at write time**. Measured on the lane database
inside a rolled-back transaction: `update clara.document_capabilities set
business_operation='proposal_only' where format='ofx' and document_kind='bank_statement'` — a row
whose `typed_facts` is `unsupported` — was ACCEPTED, and `set constraints all immediate` passed it
too. The only thing that fails is a later test run. This is accepted rather than closed because
the pre-existing `supported`-over-unsupported-facts rule has always lived in exactly the same
place, and splitting the pair across a CHECK and a test would make the weaker half look stronger.
The cross-column CHECK `business_operation not in ('supported','proposal_only') or typed_facts =
'supported'` validates clean against the live 240 rows today and is the shape a later ticket would
add — together with pinning 0246's `SELECT INTO` by `conname`, since that CHECK would itself name
`business_operation` and 0246's unordered `ilike` probe would then be a coin flip on a redo.

**Web.** `BusinessOperationLevel` (`apps/web/lib/documents/document-state.ts`) is this axis's OWN
union — the shared `CapabilityLevel` stays at the four values custody, byte extraction and typed
facts still carry in their own CHECKs — and the readers keyed off it (`capability-tiers.tsx`'s
tone map, now keyed by that closed set so the compiler enforces it; `capabilityTier.*` in
`en.json`) render it distinctly from `stored_only`. `resolveCapability`/`tierStateKey`
(`capability-registry.ts`) pass any level through generically.

The DETAIL panel's own reader needed a real change, and did not get one in 0246's own round:
`operationVerdict()` branched on the level exactly once (`=== 'unsupported'` → `not_applicable`)
and sent `proposal_only` down the same ladder as `stored_only`, so the one surface a professional
opens for a filed document rendered the two identically — "Not coded yet" for both, which are
opposite facts. It now returns its own `awaiting_confirmation` verdict where the two levels really
differ (nothing coded, nothing posted, no statement), with its own message key, its own tone and a
sentence saying why nothing is booked; once a person has acted, a confirmed proposal reads `coded`
or `posted` like any other entry.

## 0265 — the shared question record carries the admitted basis (#839)

`clara._work_question_record` (0180's "one record every surface renders") gains ONE key, `basis` —
the Work's own `clara.accounting_work.basis`, transcribed verbatim — beside the
`basis_digest`/`work_basis_digest` pair it already carried.

**A BODY-ONLY RECUT OF THE UNGRANTED PROJECTION.** `_work_question_record` is `revoke all … from
public` in 0180 and has never been granted to any role; `clara.get_work_question` and
`clara.get_work_pending_question` are NOT recut at all, because both do nothing but delegate to it
and return its jsonb unexamined. §T re-reads both doors' `pg_get_functiondef` and requires them
byte-identical to their pre-images, so "additive, and to one body only" is a measurement.

**WHY.** A surface that holds ONLY the shared record (Needs-you's row, the Clara rail's cards) had
the question but not the figures, so it could not offer "Restate as a new instruction" the way the
Work detail does — that page loads the full `AccountingWorkRow` (basis included) from a separate
read. The key is what makes the admitted posting date, memo and lines reachable from the one record
every surface already asks for.

**NO NEW COHORT** in `packages/db/tests/rig-meta.mjs`, and that is a finding rather than an
omission: the name is already on `WORK_QUESTIONS_0180_UNGRANTED_FNS` at the same arity and the same
"granted to nobody" disposition, and `cohortFailures()` fails a HALF-present cohort, so a cohort of
its own would red every database between the two frontiers. #720 (0198) recorded the identical
shape. The frontier-gated battery is `tests/work-question-admitted-basis.test.mjs`, preloaded by
`tests/work-question-admitted-basis-preintegration-gate.mjs`.

**DEPLOY ORDER: none owed, in either direction.** An older web build ignores a jsonb key it never
asks for; a newer build against a database below this frontier reads `record.basis` as `undefined`
and gates its restate entry point on the key's PRESENCE, so it renders nothing rather than throwing.

## 0266 — the Work list labels a staff expense claim without an N+1 read (#880)

`clara.list_accounting_work` and `clara.get_accounting_work_row` each gain TWO projected fields,
`claim_id` and `claimant_label`, LEFT JOINED from `clara.staff_expense_claims` by `work_id` — so a
claim Work's list row (and its addressed row) carries its own label with ZERO additional round
trips, rather than a per-row call to `clara.get_work_claim_origin`.

**THE ADDITIVE PROJECTION IS 0203/#809'S OWN SHAPE**, which widened this same pair in the same
lockstep; the brief allowed a batched door instead, and that would still have cost the browser one
round trip and would have had to re-derive `get_work_claim_origin`'s firm scoping for an array of
ids. `clara.get_work_claim_origin` is UNCHANGED, so the Work detail's existing single-Work read is
untouched by construction.

**THE JOIN CANNOT DUPLICATE A ROW.** `clara.staff_expense_claims` carries
`uq_staff_expense_claims_work unique (work_id)` (0221) — at most one claim per Work, structurally —
and `sec.firm_id = w.firm_id` is restated on the join condition, belt-and-braces over the composite
FK, in the same explicit-correlation style 0189 uses for the `clara.clients` join beside it. Both
doors stay SECURITY INVOKER: the claim rows are admitted by `p_staff_expense_claims_read`
(`firm_id = clara.jwt_firm()`), the same RLS the list already leans on for its other sources.

**A BODY-ONLY `CREATE OR REPLACE` AT THE EXISTING SIGNATURE** — both doors return a jsonb envelope,
so a projection field changes neither signature nor return type. The replace restates
`security invoker`, `search_path` and `plan_cache_mode`, and §T re-reads all three from `pg_proc`
together with the owner and the literal ACL. NO roster change is owed in `rig-meta.mjs`: same
names, same grants (see the note this migration adds beside `WORK_LIST_0189_HUMAN_FNS`). The
frontier-gated cells are `wl.29` in `tests/work-list.test.mjs`, preloaded by
`tests/work-list-claim-label-preintegration-gate.mjs`.

## 0267 — the Work list gains a receipt-dated window (#905)

`clara.list_accounting_work` gains TWO parameters, `p_receipt_since`/`p_receipt_until`, that fence a
Work by its own COMMITTED receipt (`clara.operation_receipts`, `outcome='committed'`) instead of its
admission instant — so the client home's recent-success tile, which has always COUNTED by receipt
(0214), can LINK by receipt too and the two describe one population.
`clara.get_accounting_work_row` is untouched (§T pins it byte-identical to its 0266 pre-image).

**A DROP AND A CREATE, NOT A REPLACE** — `create or replace function` cannot ADD a parameter:
PostgreSQL identifies a function by (schema, name, ARGUMENT TYPES), so a longer list is a DIFFERENT
overload left resolvable beside the old one, and PostgREST would face two candidates for one name.
The nine-argument signature is dropped and the eleven-argument one created in the same transaction,
the 0202/#770 precedent the brief named. A drop takes five things with it that a replace would have
kept — owner, SECURITY INVOKER, both pinned settings, the literal ACL and the comment — and all
five are re-issued and then re-read from the catalog in §T. Every new parameter is DEFAULTED, so a
nine-positional caller still resolves and exactly ONE `list_accounting_work` remains in the catalog.

**THE RECEIPT JOIN IS A LATERAL WITH `limit 1`**, the same "at most one" idiom the pending-question
join beside it uses, so even a violation of `uq_operation_receipts_committed` could not duplicate a
list row. The window is half-open on both axes (`>= since`, `< until`) over the same
Asia/Kuala_Lumpur calendar-day construction 0214's own pack window uses, and a Work with NO
committed receipt is excluded by the NULL comparison rather than dated by something else.

**WRITTEN SO A #957 REDO OVER ITS OWN EFFECTS IS SAFE**: §W is `drop function if exists` on the
nine-argument signature followed by `create or replace` on the eleven-argument one, and §0's
prestate recognises BOTH starting shapes. NO roster change is owed in `rig-meta.mjs`: a
drop-and-create of the SAME name is not a new name (see the note this migration adds beside
`WORK_LIST_0189_HUMAN_FNS`). The frontier-gated cells are `wl.30`–`wl.32` in
`tests/work-list.test.mjs` and `p650.pack.recent_success_drilldown` in
`tests/client-work-pack.test.mjs`, both preloaded by
`tests/work-list-receipt-window-preintegration-gate.mjs`.

## 0270 — the firm's own document-processing caps (#960)

`clara.set_firm_document_limits(p_docs_per_day, p_pages_per_day, p_ocr_concurrency,
p_llm_witness_concurrency, p_op_key)` is the FIRST human writer `clara.firm_document_limits` has
ever had. The owner ruled on 2026-09-20 that the firm's own owner or admin sets all four caps with
no operator gate, so the door takes NO `p_firm` argument — it always acts on
`clara._human_ctx(clara.role_rank('admin'))`'s own firm — rides 0196's column-preserving trigger
rather than re-implementing "preserve what the caller did not name", is receipted through
`clara.op_receipts` and writes a `clara.audit_log` row carrying the before AND after value of every
cap that actually moved. `clara._firm_document_limit_ceiling` (owned by `clara_fn_owner`, granted
to NOBODY) carries the maximum. The full reasoning is in
[0270's own header](migrations/0270_firm_document_limits_writer.sql); the two paragraphs below are
CORRECTIONS TO THAT HEADER, which is applied and therefore immutable, recorded here because this is
the nearest editable home a db-side reader will find.

**WHAT THE CEILING BOUNDS IS ONE FIRM, NOT THE ESTATE** (adversarial review ADV-L10-07, fix round
2026-09-20). §A justifies `ocr_concurrency`/`llm_witness_concurrency` = 16 by the estate running one
always-on `clara-runtime` machine, but the body that ENFORCES those two numbers,
`clara.claim_document_processing_task`, counts only THIS firm's running `ocr`/`invoice_facts`/
`statement_facts` tasks against THIS firm's own `ocr_concurrency`; there is no estate-wide counter
anywhere in it. Before #960 every firm sat at the 2/2 fallback because the relation had no human
writer at all, so the gap was unreachable; after it, N firms at 16 give 16N concurrent tasks against
the one machine with no backstop. Nothing in #960's acceptance is broken — a firm still cannot
exceed its own ceiling, which is all the door promises — but the header's sentence is stronger than
the code, and the estate-wide backstop is a follow-up for the owner to rule on, not something this
door can carry. The per-firm numbers stay where they are meanwhile.

**NAMED RESIDUAL — THE FOUR PARAMETERS ARE `int`, SO A VALUE ABOVE INT4_MAX DIES IN THE CAST**
(adversarial review ADV-L10-05, fix round 2026-09-20). Re-measured on the lane rig, through the
cast PostgREST actually performs — it binds each JSON body value and casts it to the parameter's
declared type, so `p_docs_per_day => ($1)::integer` with `'2147483648'` raises a bare
`22003 value "2147483648" is out of range for type integer` with NO `detail`, BEFORE the body's
`v_asked > ceiling` check can answer with its own typed `CLR10 cap_above_ceiling` sentence. (A bare
SQL literal `2147483648` does not even get that far: it is a `bigint` to the parser, so overload
resolution refuses it `42883`. The 22003 is the shape the web caller can actually produce, which is
why it is the one that matters.)
`ProcessingCapacityCard` now refuses to send such a number (`apps/web/README.md` records the
surface half), but a caller reaching the RPC directly still meets the raw cast error. Closing it
properly means declaring the four parameters `bigint` and leaving the in-body ceiling check to
answer every number a caller can send — which means EDITING 0270, and #957's supported redo path
(`CLARA_MIGRATION_REDO`, "Redo (#957)" above) takes the HIGHEST applied version only. Measured on
`clara_l10` during the fix round:

```
migrate: FAIL — redo refused: 0270_firm_document_limits_writer is not the highest applied version
(0271_retire_create_account_set_v1 is) — redoing anything below the frontier would silently
invalidate whatever was applied on top of it.
```

So an edited 0270 could be neither applied nor re-measured on the lane that wrote it, and shipping
an unverified migration edit is worse than a named residual. The widening belongs to a follow-up
ticket that owns its own migration number, where the prestate pins can be measured on a chain that
carries it.

## 0271 — retiring the human account-set writer (#1003)

The owner ruled on 2026-09-20 to retire `clara.create_account_set_v1` (0058): two independently
measured censuses (the T9 rung-0 sweep, 2026-08-28, and #660's re-confirmation) found zero callers
in `apps/web` or `apps/dashboard` history, and its capability was already covered by the live
agent-lane sibling `clara._agent_create_account_set_core` / `clara.wake_create_account_set`,
DERIVED from this same body at 0113 and standing on its own since. 0271 `drop function`s it
outright rather than only revoking its grant — the owner's own Option A reasoning: "removes a
decoy a future UI could be wired to instead of the newer door, and one more body every security
census has to re-confirm as dead."

**NOTHING ELSE MOVES.** No table, column, trigger or policy changes; the agent core and its wake
door are pinned in 0271's prestate and tail and are byte-identical before and after. Historical
`clara.op_receipts` rows under `fn='create_account_set_v1'`, if any are ever found on a real
estate database, are untouched — out of scope by the ticket's own ruling.

**FOUR LIVE TEST-SIDE FILES NAMED THE RETIRING SIGNATURE AND ARE UPDATED IN THE SAME CHANGE**,
not inside 0271 itself (they are source, not DDL):
- `packages/db/tests/rig-meta.mjs` — `METRICS_0058_HUMAN_FNS`/`_COHORT` drop the name (ten
  members now, not eleven); left in place it would read `cohortFailures()` as a PARTIAL cohort.
  It is NOT dropped from `ALLOWED`: see the retirement window below.
- `packages/db/tests/client-financial-pack.test.mjs` — `p660.census.pins_unmoved` drops the
  now-meaningless pin (a `::regprocedure` cast on a dropped function raises, it does not fail an
  assertion) and asserts the retirement directly instead, frontier-gated on 0271's own stem.
- `packages/db/tests/delta-fixtures.mjs` — `DELTA_ENTRYPOINTS`/`DELTA_ARGUMENT_NAMES` drop the
  entry (the readiness roster no longer requires it), and `createAccountSet()` — the delta suite's
  one remaining caller of the retiring door — now mints through `clara.wake_create_account_set`
  under a cached per-firm interactive wake credential, the SAME agent-lane path the runtime uses,
  never a copy of its validation logic. The op-reservation `fn` key for account-set creation is
  therefore `agent_create_account_set` from this point on, not `create_account_set_v1` (0113's own
  derivation renamed it); the two delta phase files that asserted zero leftover receipts under the
  old key (`delta-algebra-phase.mjs`, `delta-account-set-acceptance-phase.mjs`) now check the new
  one.
- `packages/db/tests/f-a5-reporting-agency-pr2-cores.test.mjs` is untouched and stays the wake
  door's own direct battery — the delta suite's retarget exercises the same door end to end but is
  not a substitute for it.

### 0271's retirement window — the removal-shaped mirror of a bimodal cohort

Added in the 2026-09-20 review fix round (standards L10-STD-02, spec S-1003-1, adversarial
ADV-L10-03), which all three reported the same gap: 0271 shipped without the wave-2 work order's
migration triad (a preintegration gate with a stable stem, a rig-meta cohort, the gate-chain entry
in migration order).

**An ADDITION needs no frontier arm; a REMOVAL does.** Both consumers of `rig-meta.mjs`'s `ALLOWED`
iterate the LIVE catalog — `grantMatrixFailures()` compares each live body's grants against it, and
`scripts/operation-census/findings.mjs`'s `unattributed` label attributes each live PUBLIC door
against it flattened. A name added to `ALLOWED` before its migration lands is simply never reached
on an earlier frontier. A name REMOVED from it is the opposite: below 0271 the body is still live
and still granted, so both consumers hard-FAIL rather than skip. Measured on `clara_l10` inside a
transaction that was rolled back and verified rolled back: with the pre-0271 catalog state
recreated, the grant sweep reported `clara_authenticated EXECUTE clara.create_account_set_v1:
expected false, got true` and the census reported the name `unattributed` — and with the arm in
place both passed.

The three artefacts:
- `RETIRED_0271_HUMAN_FNS` in `tests/rig-meta.mjs`, spread into `ALLOWED[clara_authenticated]` and
  deliberately NOT a `cohortFailures()` cohort (above the frontier this name is SUPPOSED to be
  absent from the catalog while its exemption survives, which is the one shape that instrument
  reports). **Scheduled for deletion** once every rig and frontier leg this package runs against
  carries 0271.
- `tests/retire-create-account-set-preintegration-gate.mjs`, keyed on the stem
  `retire_create_account_set_v1$` — never a migration NUMBER (claimed at merge) and never the
  function's ABSENCE (a chain below 0059 is absent too, because the body was never created there).
- its `--import` token in `package.json`'s test script, in migration order after 0270's.

## 0272 — the routes 0244 left open, and #782's column comment (fix round)

`0272_document_capability_wall_completion.sql` is the fix round after 0244/0245/0246's two-axis
review plus the adversarial lens. It mints NO function and moves NO row.

| route | measured before 0272 | what 0272 does |
|---|---|---|
| **TRUNCATE of the mark ledger** | `truncate clara.document_capability_version_high_water` took 240 marks to 0 with no refusal — no ROW trigger fires on TRUNCATE — after which #846's own reproducer (delete `pdf × invoice`, re-insert BELOW its version) was ADMITTED | arms 0003's `clara._tf_no_truncate` as `before truncate … for each statement`, the same body every other append-only relation in the estate uses. `CLR08`, and **no `detail.reason`** — the estate's single truncate guard carries none |
| **A re-keying UPDATE** | a never-seen pair published at version 1 (admitted: no mark), then `update … set format='pdf', document_kind='invoice'` — the pair read 1 while its mark read 3, and the deferred uniformity wall passed it | arms the SAME high-water body a second time as `t_document_capabilities_version_high_water_rekey`, `before update … when (new.format is distinct from old.format or new.document_kind is distinct from old.document_kind)`. The body is byte-unchanged: it reads `new`, so on a re-key it already asks about the destination |
| **`recorded_at` backwards** | rewritten to 1999-01-01 with no refusal, although 0244 comments the column "Moves only upward with `registry_version`" | one more case arm, LAST, in the append-only body, strictly `<` |
| **#782's column comment** | `col_description(clara.document_capabilities.limits)` still carried 0191's "per-LINE facts are an accepted target with no table yet" after 0245 moved the data | re-issues the comment from a successor file (0191 unedited), the way 0246 already re-issued the `business_operation` one. The tail proves the comment and the rows agree: 28 rows at `accepted_limitation`, zero rows publishing a limit valued `planned` |

**Why a second trigger and not a wider event list.** Re-arming 0244's own trigger as
`BEFORE INSERT OR UPDATE` was written, applied and MEASURED to be wrong: BEFORE ROW triggers fire
in trigger-NAME order, `…_version_high_water` sorts before `…_version_monotone`, and an ordinary
in-place LOWERING update then came back as `registry_version_high_water` instead of 0207's
`registry_version_monotone`. `document-capability-registry.test.mjs` caught it on the next run.
Re-labelling a refusal a caller already classifies is a breaking change a fix round has no mandate
for, so the widening is confined to a genuine re-key by a `when` clause — which has to live on its
own trigger, because a combined INSERT OR UPDATE trigger may not reference `OLD` at all. 0272's
tail pins that non-regression itself, and the file repairs the earlier arming on redo.

**Why a new file rather than an edit of 0244.** Both 0244 and 0245 are unmerged and both *could*
be edited under the wave-2 rule, but the supported re-apply path ("Redo (#957)" above) refuses any
version that is not the HIGHEST applied one, and 0245/0246 sit on top of 0244 on every lane
database. Editing 0244 in place would mean the hand procedure #957 exists to abolish. 0272's
number is deliberately ABOVE the wave-2 reservation (0235…0271, each belonging to a named ticket
in another lane); nothing depends on it, so renumbering at integration is free.

**The honesty boundary, stated.** "By any route" means *by any route a writer of this estate has*.
A superuser who sets `session_replication_role = replica` or drops a trigger disables every wall
here, exactly as 0003's own truncate guard says of itself ("blocks truncate for everyone but a
superuser who drops the trigger"). Measured: `clara_fn_owner` gets `42501` on
`session_replication_role`, so that is an explicit act by a different actor, not a route.

**Redo-safe by construction**: `drop trigger if exists` before each `create trigger` (including a
re-creation of 0244's own trigger at 0244's spelling, so a database carrying the earlier wide cut
comes back), `create or replace function`, and an idempotent `comment on`. The prestate reports
FIRST or REDO, and its pin for the ONE body this file recuts is two-valued by construction —
0244's pre-image or 0272's own post-image, both measured.

## 0273 — making the legacy vendor-bindings panel read-only (#921)

`0273_vendor_binding_write_doors_revoked.sql` revokes `clara_authenticated`'s EXECUTE on three of
the five vendor-binding doors 0028 created — `propose_vendor_identity_binding(jsonb,text)`,
`sign_vendor_identity_binding(uuid,text,text)` and `decline_vendor_identity_binding(uuid,text,text)`
— and nothing else. The blueprint retires the vendor-binding workflow (O37); D6 keeps only
"historical receipts and in-flight legacy visibility" for this legacy lane, and the Client-KB /
counterparty-identity lane (#647) is its replacement.

**REVOKE, never DROP** — #921's own "Out of scope" line: "Removing the lane's tables, doors or
historical rows (D6 keeps them)." These three bodies remain the only record of how a still-visible
`proposed` / `live` / `declined` historical row came to exist; revoking rather than dropping keeps
every one of those rows' provenance columns meaningful. `revoke_vendor_identity_binding(uuid,text,text)`,
`list_vendor_bindings(uuid)` and `get_vendor_binding(uuid)` are UNTOUCHED — still granted to
`clara_authenticated`, bodies byte-identical, pinned in both the prestate and the tail. Also
untouched: the two wake/agent doors (0154), `reset_binding_decline` (0154 — it lifts a decline on
an ALREADY-EXISTING historical row, exactly the visibility D6 keeps), and the lane's tables,
triggers, policies and rows.

**The web side moved in the same PR, not in this file** (frontend carries no schema):
`components/firm-admin/vendor-bindings-panel.tsx` and `vendor-binding-ceremony.tsx` deleted the
Propose and Sign controls outright (a "proposed" row is now display-only history; a "live" row
still offers Revoke), `lib/firm/capabilities.ts` retired `canProposeVendorBinding` and
`canSignVendorBinding` (a control no rank can use has no floor left to mirror), and
`lib/firm-admin/vendor-bindings.ts` dropped the two wrapper functions whose call sites
`operation-census.test.mjs`'s `called_ungranted` sweep would otherwise correctly refuse.

**The migration triad**, in migration order in `packages/db/package.json`'s test script:
`tests/vendor-binding-write-doors-revoked-preintegration-gate.mjs` (stem
`vendor_binding_write_doors_revoked$`) and `tests/vendor-binding-write-doors-revoked.test.mjs`. In
`tests/rig-meta.mjs`: `VENDOR_BINDING_0028_HUMAN_FNS` narrowed from all five names to the three D6
keeps as human doors (the EXISTENCE cohort, renamed `VENDOR_BINDING_0028_ALL_FNS`, still names all
five — a REVOKE never changes whether a function exists), and `BINDING_PROPOSAL_PR1_HUMAN_FNS`
dropped `decline_vendor_identity_binding`. Unlike 0271's DROP, this needs no bimodal retirement
window: `grantMatrixFailures()` judges every name it finds live in the catalog on every frontier, so
an unlisted name simply reads as the correct `expected=false` on both sides of 0273, with no
frontier arm to maintain and nothing scheduled for later deletion.

**What the rig batteries did about it.** Six pre-existing `packages/db` batteries fixture or test a
vendor binding by calling `propose` / `sign` / `decline`, and a bare REVOKE turns all of them 42501
(57 cells, measured on a lane database before the fix): `x36-vendor-binding-ceremony`,
`x36-vendor-binding-resolver`, `x30-f1-lcp`, `x31-autopost-lane-unify`,
`x36-p-round-regressions` and `binding-proposal-pr-1`. None was retired. 0273 moves the GRANT and
nothing else, and what those cells are about is the BODIES — the rank floors, 裁-18a's
signer<>proposer wall, the loop brake, the sign-time drift and corpus re-runs, H5's roster window,
H6's lock order, C3's post-time interlock and their mutants — which D6 keeps precisely so the
ruling stays reversible. Retiring them would let a future restore of the grant ship unguarded.

So the shared wrappers in `tests/x36-vendor-binding-helpers.mjs` are renamed `proposeAsFnOwner` /
`signAsFnOwner` / `signLiveAsFnOwner` (and `declineBindingAsFnOwner` in
`tests/binding-proposal-pr-1-helpers.mjs`, with `asRetiredWriteDoorSession` for the two-session
lock-order cells and `retiredWriteDoorQuery` for the attestation drives). Each carries its call as
`clara_fn_owner` — which still holds EXECUTE — with the SAME human actor in
`request.jwt.claims`, so `clara._human_ctx` resolves the same person and every wall inside each
body still runs. Measured on a lane database: `propose` as `clara_fn_owner` with an unknown `sub`
raises CLR04 `actor has no active membership` (the body), while the same call as
`clara_authenticated` raises 42501 (the ACL, before the body). `revoke` keeps its bare name and is
still driven as a human, because 0273 did not move it.

None of that shows a human can still call these doors: the opposite is what
`tests/vendor-binding-write-doors-revoked.test.mjs` proves, driving `clara_authenticated` at all
three doors and at every rank and seeing 42501. `bp1.F1`'s ACL invariant ("DROP destroys the ACL —
the grant must have been re-made", 0154's own claim about the recreated 3-arg signer) is re-trued
rather than deleted: the OWNER's EXECUTE is asserted at every frontier, and the HUMAN's EXECUTE is
asserted to track the `vendor_binding_write_doors_revoked` ledger row, so the cell reads true on
both sides of this migration.

## 0274 — a trade-invoice party resolves by its TIN (#982)

The owner ruled on 2026-09-20 that a TIN becomes a real resolution key for a trade-invoice
counterparty, **at the same tier as the normalised registration number**, and that when a TIN and
a registration number point at two different live counterparties Clara stops and lets the person
choose. The reason was checked before the mechanism: LHDN MyInvois requires the buyer TIN and BRN
and validates both from 2026-08-01, so a document whose clearest printed identifier is a TIN is an
ordinary case.

`0274_trade_invoice_party_tin.sql` recuts exactly ONE body — 0225's
`clara._trade_invoice_resolve_party` — and creates one index. No table, column, trigger, policy or
grant moves, and no other function is created or recut. The recut keeps the body's owner
(`clara_fn_owner`), `security definer`, `set search_path = clara, pg_temp`, `stable` volatility and
its owner-only ACL; 0225's tail assertion that this internal is ungranted to every application role
still holds and 0274's tail re-asserts it.

**The resolution order after 0274.** The id arm is 0225's, verbatim. Then the registration number
and the TIN are ONE tier, each arm needing a single live, unmerged match of the kind the invoice
kind requires; then the normalised name and its live aliases, 0225's own arm, unchanged.

| submitted | live parties of the wanted kind | outcome |
|---|---|---|
| TIN only | exactly one holds it | resolves to it |
| TIN only | two or more hold it | `party_ambiguous`, both candidates carried |
| registration + TIN | the registration-matched row also holds the TIN | resolves to it |
| registration + TIN | the TIN reaches nobody | resolves by registration (0225's outcome) |
| registration + TIN | each reaches a DIFFERENT live party | `party_identifier_conflict`, both carried |
| counterparty id | — | 0225's outcome, whatever the TIN says |

**The third refusal reason, `party_identifier_conflict`**, is distinct from `party_unresolved`
(nothing answered) and `party_ambiguous` (one identifier, several parties) because the remedy is
different: the person is choosing between two identifiers the document itself carries. Its
`detail` carries `registration_no`, `tin`, `expected_counterparty_kind` and `candidates`, and each
candidate carries the same four keys `party_ambiguous` already uses plus `matched_on`
(`registration` or `tin`), so every reader of this lane's refusals renders one candidate one way.

**Why the TIN is normalised the way the registration number is.** The estate has exactly ONE
identifier normalisation — `lower(regexp_replace(v, '[^a-zA-Z0-9]', '', 'g'))` — byte-identical in
`clara.create_counterparty` (0021:99-101), `clara.set_counterparty_identifiers` (0215:965-967) and
the resolver's registration arm. A TIN is printed with spaces and dashes exactly as a registration
number is, and the ruling puts it at the same tier. There is no `tin_normalized` COLUMN, so the arm
normalises both sides at read time, and `ix_counterparties_client_kind_tin_normalized` — a partial
expression index on `(client_id, kind, lower(regexp_replace(tin, …)))` over live, unmerged rows —
is what keeps that an index scan rather than a sweep of every firm's parties, twice per admission
(0225 step 5 and step 7 both call the resolver). 0215's cross-client identity WATCH (0215:1157-1164)
still compares `o.tin = cp.tin` raw and is NOT changed here: it answers a different question.

**A nested `if`, not a conjunction.** PostgreSQL does not promise to short-circuit `and`, so the
conflict test reads `v_reg_row.tin` only inside an `if v_reg_hit …` that has already passed.
Measured, not feared: the conjoined first cut raised 55000 ("record `v_reg_row` is not assigned
yet") on every submission carrying no registration number.

**Redo-safe by construction** (#957): `create or replace function`, `create index if not exists`,
and a prestate that accepts EITHER the pinned 0225 pre-image
(`4967217e8d413f3f58d935aea966764a91c42afc2c15342e8bfcfe2a23a7a0a8`) OR a body already carrying the
file's `#982` marker. Because the marker branch is the only one a redo can take, the FIRST-APPLY
branch was proved separately: inside one transaction that was rolled back, 0225's own create
statement was re-run (restoring prosrc to exactly the pinned sha) and the prestate block was run
verbatim, reporting `clean` without the redo notice.

**The frontier triad**, per the wave-2/3 work order: `tests/trade-invoice-party-tin.test.mjs`
(#982's cells, in their own file so a chain carrying 0225 and not 0274 still runs #655's battery in
full), `tests/trade-invoice-party-tin-preintegration-gate.mjs` keyed on the stem
`trade_invoice_party_tin$`, and its `--import` token in `package.json`'s test script in
migration order. No `rig-meta.mjs` cohort changes: 0274 mints no function and moves no grant.

**Two things this file's own text no longer tells the whole truth about**, recorded here because
0274 is byte-frozen (its ledger row is not the frontier any more — see 0275's "fix round"):

- **A TIN several parties hold.** 0274's `v_tin_hits > 1` arm refused before the name tier was
  consulted. 0275 section 10 recuts that arm: a shared TIN no longer outranks the name printed
  beside it, and the chooser carries every party either identifier reached. The rule is stated in
  0275's section below.
- **A TIN outranks a uniquely-resolving name, silently.** A bill naming Beta and carrying Alpha's
  TIN is admitted against **Alpha**. This is not new and not a defect of 0274: 0225 already does
  exactly this for a registration number (a name that uniquely resolves to Beta plus Alpha's
  registration number has always admitted against Alpha), and the owner's ruling put the TIN "at
  the same tier as the normalised registration number". A **name is never a conflict partner** on
  this lane; only the two identifiers are. If the estate should stop on name-vs-identifier
  disagreement too, that is a ticket, not a fix.

## 0275 — warn before recording a trade invoice that looks like one already recorded (#1007)

On the trade-invoice lane 0225 shipped, "duplicate" meant a replayed *intent* and nothing else:
`uq_accounting_work_intent` converges a repeated `(firm, client, intent_key)` onto one Work, and
nothing in the door, the birth trigger or the belts ever looked at
`(client_id, counterparty_id, reference)`. The same supplier bill sent twice under two intent keys
posted twice and doubled the payable. The owner ruled on 2026-09-20: check at the **recording**
step, **warn and let the person decide, never refuse**, and do not look at the document number
alone — also look at the amount and the counterparty.

For #1007 `0275_trade_invoice_duplicate_probe.sql` is **purely additive**. It recuts nothing of
0225's: `clara.admit_trade_invoice_work`'s replay semantics, its refusal ladder and the posting
core are untouched, and the file's tail re-reads that door to prove its `sha256(prosrc)` did not
move while it applied. **A unique constraint on `reference` would be wrong and is not added**: the
column is nullable and suppliers legitimately reuse numbers. The one body it *does* recut is
0274's party resolver, for #982's fix round — see "The fix round" below.

**The two signals, and why there are two rather than one conjunction.**

| signal | fires when | skipped when |
|---|---|---|
| `same_reference` | same counterparty **and** the same reference after normalisation | the new document states no reference, or the stored one states none |
| `same_total_and_date` | same counterparty, same `total_cents` **and** the same `document_date` | the new document states no date or no total |

They are joined by OR, and amount alone or counterparty alone is never a match — a monthly rent
bill legitimately repeats its amount. The shape is chosen against two real products: QuickBooks
Online warns on vendor + bill number and still lets the person save, while SAP's standard duplicate
check requires vendor, currency, company code, gross amount, reference and invoice date to *all*
match, which is known to let a duplicate through whenever the reference was typed differently.

**The reference normalisation is the estate's one identifier normalisation** —
`lower(regexp_replace(v, '[^a-zA-Z0-9]', '', 'g'))`, byte-identical in `clara.create_counterparty`
(0021), `clara.set_counterparty_identifiers` (0215) and 0274's registration and TIN arms — so
`INV-001`, `inv 001` and `INV001` are one document number here too. A reference that normalises
away entirely is folded to NULL rather than matched, or every unnumbered bill would match every
other unnumbered bill. `clara._trade_invoice_reference_key(text)` is `immutable` and is the one
place that answer lives.

**"The same counterparty" means the merged family.** `clara.merge_counterparties` (0011) stamps
`merged_into` on the absorbed row and rewrites no history, so a bill keeps the
`clara.trade_invoices.counterparty_id` it was recorded under; the resolver, meanwhile,
canonicalises what the caller submitted (0149's rule) and always answers the *survivor*. The first
cut compared the survivor against the stored id and was therefore blind across a merge — measured
on a lane database, a bill recorded against the absorbed party stopped warning the moment the merge
landed, and the same bill number was then recorded a second time with no warning at all. The
matcher now walks the merge tree down from the survivor (`ix_counterparties_merged_into` indexes
that edge) and compares against the whole family, which is one row wherever nothing was ever
merged. `p1007.probe.across_a_merge` drives it through `clara.merge_counterparties` itself.

**Which earlier invoices count.** Only ones that are, or still may become, a posting: the Work is
not in the estate's own closed terminal-without-posting set
(`refused`, `failed`, `cancelled`, `expired` — the four 0178 and 0184 already treat as one class),
and the posted entry, if there is one, has no `clara.journal_entries.reversed_by`. An invoice whose
Work is still queued or running **does** count: it is about to post, and a second recording would
double the payable exactly as a posted one would. `expired` is the fourth member of the class the
ticket named in prose, not a widening of it: an expired Work has no more chance of posting than a
cancelled one, and leaving it in would warn about a bill nobody can record.

**The probe is a read.** Every body is `stable`, so PostgreSQL refuses a write inside it, and the
matcher takes no `for update` / `for share`. `p1007.probe.is_a_read` proves both from outside: a
row census across the lane's four tables and `clara.audit_log` is unchanged by a probe (a read that
audited itself would be a write), and a second session takes `for update nowait` on the very row
the probe just reported while the probe's transaction is still open.

**Authority, and why there are two probe doors.** `clara.probe_trade_invoice_duplicates(uuid,text,jsonb)`
takes its firm **and** actor from the session (`clara._human_ctx`, bookkeeper floor — the floor of
the recording step it precedes) and is granted to `clara_authenticated` alone: a `security definer`
function with a caller-supplied tenant parameter is the cross-tenant-oracle shape 0219 names.
Another firm's client and an unknown id leave with the byte-identical `CLR11 client_not_found`
sentence. The chat lane cannot use that door, and this is measured rather than assumed:
`packages/runtime/lib/pools.mjs` issues only `set role clara_runtime` plus two timeouts and never
sets `request.jwt.claims`, so `clara._human_ctx` raises `CLR04` on every runtime connection. Hence
`clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)`, actor-explicit and
`clara_runtime`'s alone — the shape `clara.create_accrual_adjustment_for` (0222) already has here.
It carries `clara.admit_trade_invoice_work`'s own authority preamble arm for arm
(`clara._trade_invoice_actor_firm`), and **both doors delegate to the one ungranted matcher**, so
the form and the chat lane can never be shown different answers. The four internals —
`_trade_invoice_reference_key`, `_trade_invoice_duplicate_matches`, `_trade_invoice_probe_core` and
`_trade_invoice_actor_firm` — are granted to nobody and the tail asserts it.

**The "recorded anyway" record.** When the person goes ahead, that choice is kept in
`clara.trade_invoice_duplicate_acks`: who, when, and which earlier invoices they were shown,
**re-read from `clara.trade_invoices` at write time rather than echoed from the browser**, so a
reviewer is reading the books and not a browser's memory of them. Three things about its shape are
deliberate.

- **It is keyed on the recording attempt’s intent key, not on the new invoice**, because it is
  written *before* the admission it authorises. `withRuntime` is autocommit, so the route’s two
  calls are two transactions whichever way round they go; writing the acknowledgement first makes
  the only possible inconsistency "a choice that led nowhere" — an acknowledgement whose admission
  then refused, which no read surfaces, because `clara.get_trade_invoice_duplicate_ack(uuid)`
  reaches it *through an admitted Work*. The other order would make it "a knowing second recording
  that looks like an accident", which is the distinction this ticket exists to preserve.
  `uq_accounting_work_intent` already makes `(firm, client, intent_key)` the identity of one
  recording attempt, so the join from a Work back to its acknowledgement is exact.
- **It is idempotent on the act, not on the key**: `(firm, client, intent_key, ack_digest)`, where
  the digest covers the particulars and the sorted ids that were shown. A lost-response retry
  re-sends the identical act and converges on one row; a person who changed the figures after a
  refusal and was shown a *different* set appends a truer second row instead of leaving the first
  standing as a record of a choice they did not make.
- **It is append-only and the browser lane cannot write it.** RLS is enabled *and* forced, the
  append-only and no-truncate belts are installed, `clara_authenticated` holds `SELECT` and no DML,
  and the writer `clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)` is
  `clara_runtime`'s alone, acting OBO a named human — it authorises
  `clara.admit_trade_invoice_work`'s own act, so it carries that door's authority model. It admits
  nothing, enqueues nothing and refuses no duplicate. Its two named refusals are
  `nothing_acknowledged` (an acknowledgement that names no earlier invoice) and
  `unknown_acknowledged_invoice` (an id this client's books of this kind do not hold), both
  `CLR10` with a `detail.reason` the route can map — never a bare CHECK violation.

**What a reviewer reads afterwards, and how it is bound to the recording.**
`clara.get_trade_invoice_duplicate_ack(uuid)` is viewer-floored and firm-scoped, and it reaches the
acknowledgement **through the Work and through what that Work actually recorded**: the same kind,
counterparty, document date and total in sen, the same document number under this lane's one
normalisation, and an `acknowledged_at` at or before the Work's own `created_at`. The first cut
joined on `(firm, client, intent_key)` alone and took the newest row, which was wrong in the one
direction that matters — driven on a lane database (`p1007.ack.rode_this_recording`), a Work that
recorded RM 1,060.00 read back an acknowledgement for RM 9,999.00 naming **its own invoice** as the
earlier document, because the browser mints one intent key per draft and an edited resubmit
acknowledges again under it before the admission refuses `intent_payload_conflict`. Between two
acknowledgements the admission could equally have ridden, the last one before it wins, and the
tie-break after that is the act's own digest rather than a random primary key (two real connections
were measured writing `acknowledged_at` equal to the microsecond). A Work with no trade-invoice row
of its own — another lane's Work that happens to share an intent key — now answers NULL.

`apps/web`'s Work page reads it: a recording somebody was warned about says who was warned and
which earlier document they were shown, and a recording nobody was warned about says nothing at
all. The page never claims a recording was *not* a duplicate.

**No index is added.** The matcher reads one counterparty's invoices of one client, which
`ix_trade_invoices_counterparty` (0225, on `(counterparty_id, document_date desc)`) already reduces
to an index scan; the merged-family walk reads `ix_counterparties_merged_into`.

**The fix round (wave 3, lane 02) — and why a #1007 file carries a #982 recut.** The lane's review
round raised one change to 0274's `clara._trade_invoice_resolve_party`: a TIN held by several
parties refused before the name tier was consulted, so a document naming one vendor and carrying a
TIN two *other* vendors share was answered with a chooser offering those two and omitting the one
the document names — a submission that resolved cleanly before 0274. 0274 could not carry the fix:
the supported re-apply path (`CLARA_MIGRATION_REDO`, "Redo (#957)" above) takes the **highest
applied version only**, so that nothing built on top of a file is silently invalidated, and 0275
sits on top of 0274 on every lane database. Editing 0274 in place would mean the hand procedure
#957 exists to abolish. 0272 gives the same reason for not editing 0244. So section 10 of 0275
recuts that one body, 0274 stays byte-frozen with its ledger row intact, and the rule now reads:

> An identifier that answers with several parties has not identified anybody, so it does not
> outrank the name printed beside it. Where the name answers to exactly one of the parties holding
> that TIN, the two identifiers agree on it and the document resolves. Otherwise Clara stops, and
> the chooser carries every party either identifier reached, each saying which one reached it
> (`matched_on` ∈ `registration` | `tin` | `name` | `tin_and_name`).

Everything else in that body — the id arm, the registration arm, the identifier conflict, the
one-TIN-hit resolution, `party_unresolved` and the NAME branch's `party_ambiguous`, whose detail
shape is #982's AC4 — is carried over byte for byte. The recut keeps 0274's `#982` marker and adds
`#982R2`, which is what 0275's prestate reads to tell a redo from a first apply; that pin is
two-valued by construction and both values are measured.

The same round also: restated the acknowledgement writer's total and document-date guards with
`clara._assert_trade_invoice_basis`'s own `invalid_total` / `invalid_due_date` tokens, so the CHECK
constraints are a belt rather than the message a caller reads
(`p1007.ack.typed_shape`); and gave `clara.probe_trade_invoice_duplicates` the admission's
`client_inactive` arm, because on an archived client the form used to warn about a recording the
admission then refused (`p1007.probe.client_inactive`).

**Redo-safe by construction** (#957): every statement is `create table if not exists`,
`create index if not exists`, `create or replace function`, a `revoke`/`grant` on one, or a
`drop … if exists` before its `create` (the policies and the two belts); the prestate reports FIRST
or REDO from a catalog probe rather than branching on a body's shape, except for the one
two-valued pin on the body section 10 recuts, whose first-apply branch is proved by hand in a
rolled-back transaction.

**The frontier triad**, per the wave-2/3 work order:
`tests/trade-invoice-duplicate-probe.test.mjs` (#1007's cells, in their own file so a chain
carrying 0225 and 0274 and not 0275 still runs #655's and #982's batteries in full),
`tests/trade-invoice-duplicate-probe-preintegration-gate.mjs` keyed on the stem
`trade_invoice_duplicate_probe$`, and its `--import` token in `package.json`'s test script in
migration order. `TRADE_INVOICE_DUPLICATE_0275_COHORT` in [tests/rig-meta.mjs](tests/rig-meta.mjs)
attributes the new names.

## 0277 — a default depreciation policy per enrolled fixed-asset account (#932, riders wave 3 lane 04)

`0277_fa_default_depreciation_policy.sql` mints `clara.fa_account_depreciation_policies` (append-
only, version-forward, keyed on the same `(client_id, asset_account_code)` pair
`clara.fa_account_profiles` already uses — no finer class, one live policy per account by a partial
unique index) and its two bookkeeper+ doors, `clara.set_fa_depreciation_policy` /
`clara.retire_fa_depreciation_policy`. Setting a policy never mutates a prior version: it retires
the live row (if any) and inserts a fresh one at `version + 1`, mirroring
`clara.upsert_fa_account_profile`'s own law for the enrolment it is keyed on.

**BOTH birth sites, not one — measured, not assumed.** `clara._fa_on_approve` arm 4 fires
SYNCHRONOUSLY inside the approve statement (through `clara._subledger_on_approve`, every approve
writer's own call); `clara._tf_fa_acquisition_birth` is a DEFERRED constraint trigger that fires at
COMMIT, after arm 4 already ran. Both target the same conflict key
(`on conflict (acquisition_line_id) do nothing`), and 0247's own comment on the trigger already
says which one wins for an ordinary acquisition. Driven on the lane-04 rig before this file's final
cut: a policy planted only in the deferred trigger (0247's own scope) left an ordinary
`buyAsset`-shaped approve still birthing the pre-0277 pending row, because arm 4 got there first
with no policy logic of its own. 0277 therefore recuts BOTH sites with the SAME policy lookup and
the same two-branch column choice — the trigger for the Work lane (where arm 4 is never reached)
and arm 4 for every other lane (where the trigger's own insert is absorbed by the conflict target).
It also recuts `clara._fa_asset_json` (0216's recut, the one source both `clara.list_fixed_assets`
and `clara.get_fixed_asset` read a row through) to surface the two new provenance columns,
`depreciation_policy_id` / `depreciation_policy_version`, on `clara.fixed_assets`.

**The ticket's own triage comment is stale — its sequencing note is superseded here.** The comment
on #932 was checked against `origin/main` at 0233 / `dc9acfe1`, before riders existed, and pins
0227's text for `clara._fa_validate_particulars` and the two completion doors. Wave 2 already
recut all three (0249's fold) and 0247 already recut `clara._tf_fa_acquisition_birth` on top of
0216. 0277's own prestate pins the LIVE text of every body it touches or relies on, MEASURED on the
lane-04 database moments before the file was written (267 files / 0272), never transcribed from an
earlier migration's own header — the riders wave-3 addendum's own rule (RIG.md).

**What 0277 does NOT touch**, pinned unmoved in its prestate/tail: `clara.upsert_fa_account_profile`
/ `clara.retire_fa_account_profile` and the enrolment belt watermark (AC1's own requirement);
`clara._fa_validate_particulars`, either completion door, `clara._fa_assert_completion_not_a_change`,
`clara._fa_assert_particulars_completable` (a policy-born row is populated directly from the
policy's own already-validated columns, never through the validator, and a SUBSEQUENT change still
goes through `clara.revise_fixed_asset_particulars`, the existing prospective revision door);
`clara._fa_compute_charges`, `clara._fa_asset_charges`, `clara.fa_register_tie` (the depreciation
engine needs no change — AC4's "picked up on its next run" is a consequence of the row being
COMPLETE, not a new arithmetic path).

**"Stated particulars always win" (AC2) has nothing to override, today.** There is no mechanism yet
for an acquisition entry itself to carry particulars at posting time (grepped, none exists), so a
policy can never have anything stated to override; `packages/db/tests/fa-depreciation-policy.test.mjs`
(`p932.frozen`) drives the one way this estate CAN prove the law — a policy-born row is a COMPLETE
row like any other, so `complete_fixed_asset_particulars` refuses it `fa_particulars_already_complete`
exactly as it would a hand-completed one, and `revise_fixed_asset_particulars` still reaches it.

**Redo-safe by construction**: every schema/door section is naturally redo-safe
(`create table if not exists`, guarded `alter table ... add column/constraint`,
`create or replace function/trigger`); only the three recut bodies' prestate pins need a redo
branch, keyed on `clara.set_fa_depreciation_policy`'s own presence as the "this is a redo of 0277
itself" signal.

Frontier gate: `tests/fa-depreciation-policy-preintegration-gate.mjs`, keyed on the stem
`fa_default_depreciation_policy$` (never the migration number, claimed at merge). Rig-meta cohort:
`FA_DEFAULT_DEPRECIATION_POLICY_0277_COHORT` in `tests/rig-meta.mjs`, bimodal like 0270's (the
`db-slice-frontiers` matrix runs this package against earlier frontiers). Both new doors are
`clara_authenticated`-only, `_human_ctx`-floored at bookkeeper — `clara_runtime` and every agent/wake
lane gain zero.

## 0278 — the belt and the birth trigger disagree on purpose, and now the catalog says so (#882(b), riders wave 3 lane 04)

`0278_fa_belt_birth_convention.sql` is a comment-only migration: two `comment on function`
statements, no row moved, no function minted. #882 triaged that `clara._tf_fa_movement_belt`
(0041) and `clara._tf_fa_acquisition_birth` (0216, recut by 0247 then 0277) read an account's
enrolment with two DIFFERENT signals — the belt a CLOSED `approved_at` interval, the birth the
CURRENT `fp.active` flag — and that the two only ever disagree at one instant: an entry approved
in the SAME transaction that retires its cost account's enrolment profile. `now()` being
transaction-constant means that transaction stamps `retired_at` EXACTLY EQUAL to `approved_at`; the
belt's closed interval still matches at that equality instant while the birth's `fp.active` reads
false by the time it fires, so the birth declines to register the row and the belt then refuses the
whole transaction CLR40 `fa_belt_unregistered_movement`.

**The owner ruling (2026-09-18) was already settled: no trigger change.** The same-transaction
retire-and-approve instant is reachable by NO production door — `clara.retire_fa_account_profile`
is human-only and always its own transaction — so today's refusal stays. What #882(b) actually owed
was that the convention lived only in triage prose and in 0041's own in-body `--` comment
(2680-2689), never in either function's catalog `comment on function`, and never naming the OTHER
trigger's differing signal. 0278 writes it on both sides: the belt's comment (its first ever) states
its own closed-interval design AND names the birth's `fp.active` reading; the birth's comment
(already accretive across `#639`/0216, `#972`/0247, `#932`/0277) gains one more sentence doing the
same from the other direction.

**The birth's accretion is a proven byte-exact prefix, never a rewrite.** `comment on function`
replaces the whole comment, so 0278's literal for `clara._tf_fa_acquisition_birth` opens with
0277's own text copied VERBATIM from `0277_fa_default_depreciation_policy.sql:601-609` — never
retyped from a printed value — and the tail hashes the first 842 characters (0277's own measured
`comment_len`) against 0277's measured pre-image sha256, so a single mistyped character in the
copied prefix would fail the tail rather than silently corrupting the earlier provenance. Both
bodies' `prosrc` are pinned in the prestate and re-pinned in the tail at the SAME sha256 — this
file recuts neither.

**No new function, no new grant, no rig-meta cohort.** Both trigger bodies are already granted
exactly as 0041/0216 left them (`revoke all ... from public`); `tests/rig-meta.mjs`'s
`cohortFailures()` / `grantMatrixFailures()` need no new roster entry — the same finding 0265
(#839) and 0266 (#880) each recorded above for their own comment/projection-only migrations.

**Redo-safe by construction**: `comment on function ... is '<literal>'` is a flat SET, so applying
this file twice sets the identical final text both times; no branch is needed in the change section
itself. The prestate is still bimodal on the one thing a redo could otherwise hide (accepts either
the pre-#882 catalog state or 0278's own already-applied text) — this run on `clara_l04` was a
GENUINE FIRST APPLY, so the prestate's first-apply branch was exercised directly, not merely
asserted.

Frontier gate: `tests/fa-belt-birth-convention-preintegration-gate.mjs`, keyed on the stem
`fa_belt_birth_convention$` (never the migration number). The frontier-gated cells are
`p639.belt.same_txn_retire_approve` (drives the production Work lane — `wake_record_journal_entry`
— through a hand-opened transaction that also retires the profile, and pins the refusal from
scratch, gated only by 0216/0041's own stems since the BEHAVIOUR predates 0278) and
`p639.belt.convention_comment` (reads `pg_proc`/`obj_description` and pins the catalog text itself,
gated on 0278's own stem) in `tests/fixed-asset-acquisition.test.mjs`.

## 0279 — the closed-year arrears question (#975, riders wave 3 lane 04)

`0279_fa_closed_year_arrears.sql` closes the half of the locked-period law that #651 (0227) left
open. 0227 refuses a charge **dated** into a closing or closed fiscal year and teaches the due
oracle to skip such a period. It says nothing about the months **inside** that year which the next
OPEN period's charge folds forward — `clara._fa_asset_charges` charges every uncharged month up to
the period end — so a closed year's depreciation rode into the next entry with nobody asked.

**Owner ruling 2026-09-20, checked against IAS 8.** A MATERIAL prior-period error is restated in
the year it belongs to; only an IMMATERIAL one is folded into the current period. Which of the two
this is turns on materiality, a professional judgement Clara may not default. So the run states the
amount and the year and asks for one of exactly two resolutions — `fold_current` or `reopen_prior`
— and chooses neither. The ruling also records that 0227's own comment calling arrears "the
ordinary accounting treatment" overstates the standard, and that the correction goes in
`CONTEXT.md` ("Closed-year arrears resolution"), never into the applied migration file.

**What it installs.**

- `clara.fa_arrears_resolutions` — one live answer per `(client_id, fiscal_year_id)` by partial
  unique index, append-only (a change of mind supersedes and mints a fresh row), carrying the
  amount that was judged, the choice, the run's period, the author and the timestamp. RLS
  enabled+forced; `clara_authenticated` holds SELECT and nothing else.
- `clara._fa_closed_arrears(uuid,date)` — an UNGRANTED internal (no role holds EXECUTE; both doors
  reach it from their own DEFINER bodies). It reads a closed year's share as a PREFIX DIFFERENCE
  over the estate's own arithmetic: `charged(year end) − charged(the day before it opened)`, where
  `charged(X)` is `clara._fa_compute_charges(client, X, X) ->> 'charged_cents'`. That is exact
  because `_fa_compute_charges` passes only its period END to `_fa_asset_charges`, so `charged` is
  a prefix sum over the same forward month walk the poster runs. Measured before the cut: a charge
  BLOCK is closed at a fiscal-year boundary only on the reducing-balance arm, so a straight-line
  block may straddle a year and the share can **not** be read off the blocks — the prefix
  difference needs no apportionment at all. The year's END is measured first and a zero ends the
  year there: `charged` is monotone and never negative, so the second computation would only
  re-confirm it, and the steady state (closed years with nothing uncharged) costs one computation
  per year inside the belt's own probe.
- `clara.record_fa_arrears_resolution(...)` — bookkeeper+, the SAME floor `run_depreciation_manual`
  takes. It RE-MEASURES the figure and refuses (`arrears_changed`) if it moved since the question
  was asked: a materiality judgement is made about an amount, and filing it against a stale one
  would put a ruling on the file that was never made. No machine role holds EXECUTE.

**What it recuts, and nothing else.** `clara._fa_run_period_core` (the question, between 0227's
locked-period wall and the first write); `clara._fa_oldest_unmet_period` and
`clara.preview_depreciation_run` (one sibling key, `closed_arrears`, beside `skipped_closed` —
whose own entries keep every key #651 gave them); `clara.run_depreciation_period_for` (one word in
its loop exit: a parked period ends the chase as a noop does).
`clara._agent_depreciation_catchup_core` has the same loop and is deliberately NOT recut: its wake
source `close_prep` is registered-and-disabled, so no lane can drive it, and the tail pins its body
unmoved. Its safety property holds regardless — it runs under the verb `run_depreciation_period`,
so it parks and never posts.

**Two renderings of one guard, discriminated by the verb.** `run_depreciation_manual` RAISES
(`CLR38`, reason `arrears_resolution_required` or `arrears_awaiting_reopen`, axis
`closed_year_arrears`); every other verb returns a receipted `parked` status with the same facts.
Nothing is switched off: both doors stay callable, every branch stays testable, and
`clara.reopen_fiscal_year` — the destination of the restatement choice — is untouched and pinned.

**Redo-safe by construction**: `create table if not exists` with every constraint inside the
statement, `create index if not exists`, `drop policy if exists` + `create policy`,
`create or replace function`, `create or replace trigger`. The prestate reports FIRST or REDO and
skips only the four RECUT pre-image pins on a redo; §T re-proves the whole post-state either way.
This lane applied it FIRST (a genuine first apply, the prestate's first-apply branch exercised for
real) and then re-applied it through the supported `CLARA_MIGRATION_REDO` path several times while
the slices landed.

Frontier gate: `tests/fa-arrears-resolution-preintegration-gate.mjs`, keyed on the stem
`fa_closed_year_arrears$` (never the migration number). The battery is
`tests/fa-arrears-resolution.test.mjs` (`p975.ask`, `p975.fold`, `p975.reopen`, `p975.parks`,
`p975.probe`, `p975.no_closed`, `p975.work_lane`), and `p651.period.closed_belt_skips` in
`tests/depreciation-history.test.mjs` is BIMODAL on this file's stem: once the fold is recorded,
everything #651 measured is unchanged.

## 0280 — the plan lane's own door gains the accrual entrance's wall (#908)

**Context.** #652 (migration 0222) added `clara._assert_accrual_schedule_yields`, an entrance-level
refusal for a schedule whose day rule can never reach a due date inside its own effective window,
but wired it ONLY into `clara.create_accrual_adjustment`/`clara.revise_accrual_adjustment`. The
underlying `clara._assert_plan_schedule` (0193:1572, recut by 0223) — the ONE validator
`clara.create_accounting_plan` and `clara.revise_accounting_plan` both call, and the one
`clara._accrual_plan_core` (0222:961) also reaches directly with `p_kind = 'reversing_journal'` —
carried no such refusal, so a caller of the shared door directly (bypassing the two accrual doors)
could still record a `'reversing_journal'`, `'recurring_journal'` or `'amortisation_schedule'` plan
that is recorded and never performs.

**What 0280 does.** `0280_plan_schedule_yield_wall.sql` recuts `clara._assert_plan_schedule` with
ONE new arm, added after every arm 0223 wrote, unconditionally on `p_kind`: when
`p_effective_to is not null` and `clara._accrual_schedule_yields` (0222:796, IMMUTABLE, untouched)
answers false for the same five arguments the function already carries, it raises CLR10
`plan_schedule_yields_no_occurrence`, naming `day_of_month` for a day-of-month rule and `day_rule`
otherwise — the accrual entrance's own field logic, restated. No signature change, no volatility
change (still IMMUTABLE), no new relation, no new function; `clara.create_accounting_plan` and
`clara.revise_accounting_plan` keep byte-identical bodies and inherit the arm through the one
function they already call, exactly as 0223's own amortisation-cadence arm already does for
`revise_accounting_plan`.

**Why the accrual entrance keeps its own token.** `create_accrual_adjustment` (0222:1134) and
`revise_accrual_adjustment` both call `_assert_accrual_schedule_yields` — their OWN CLR10 token —
at 0222:1182/1283, strictly BEFORE either door's nested `_accrual_plan_core` ever reaches
`_assert_plan_schedule` at 0222:1027. A `raise exception` stops the transaction outright, so 0280's
new arm is never reached through either accrual door; it only ever fires for a caller that reaches
`_assert_plan_schedule` without going through `_assert_accrual_schedule_yields` first —
`clara.create_accounting_plan`, `clara.revise_accounting_plan`, and `_accrual_plan_core`'s own
direct call, which nothing upstream of it protects on the bypass path the ticket names.
`tests/plan-schedule-yield-wall.test.mjs`'s `pw908.accrual-entrance-unmoved` cell drives
`create_accrual_adjustment` with a no-yield shape and measures the accrual token still answers.

**Why an open-ended plan (`effective_to is null`) is not this wall's business.**
`clara._plan_due_events` returns no rows once its own `p_end` argument is null (0193:851), which
would make the boolean predicate read "no occurrence" for every open-ended schedule — this lane's
own DEFAULT shape (`accounting-plans-fixtures.mjs`'s `createAccountingPlan` defaults `effectiveTo`
to `null`). The new arm is therefore gated on `p_effective_to is not null`, mirroring
`_assert_accrual_schedule_yields`'s own guard (0222:820). Measured: the whole pre-existing
`accounting-plans.test.mjs` (20/20), `accrual-adjustments.test.mjs` (21/21),
`prepayment-schedule.test.mjs` (18/18) and `accounting-plan-occurrences.test.mjs` (16/16) batteries
are green after this file applies, and `pw908.legitimate-plans` additionally drives an open-ended
plan and a bounded, genuinely-reaching plan of each of the three kinds — including a
`'reversing_journal'` plan created DIRECTLY through `create_accounting_plan`, the very bypass the
issue names — and measures every one accepted.

**Prestate/tail.** Pins (pre-image `sha256(prosrc)`, MEASURED on a 267-migration, `0001->0272`
rig): `clara._assert_plan_schedule` (`e3640588afe0…67fd7`, the post-0223 body), and as
non-regression `clara._accrual_schedule_yields` (`c75bf4c036cb…1a42`),
`clara._plan_due_events` (`66100718e518…3384`), `clara.create_accounting_plan`
(`84b67058244b…8d6c4`), `clara.revise_accounting_plan` (`87c9f1e9bcf4…431f`) and
`clara._assert_accrual_schedule_yields` (`fd504b300a89…ec9f`). The prestate is REDO-tolerant by
construction (#957): it recognises either the measured pre-0280 pre-image or this file's own prior
output (its new token together with every pre-existing arm's own token), and refuses anything else
rather than guessing. `create or replace function` on the unchanged signature converges to the same
text either way, so §A itself carries no branch. The tail re-reads every pin, re-asserts every
existing arm's token is still present BY NAME (0280 adds, it does not rewrite), and re-confirms
owner, `SECURITY DEFINER`, `search_path`, `IMMUTABLE` volatility and the owner-only ACL are
unmoved. Measured redo: applied FIRST (with a cosmetic notice-message bug — a reused loop variable
printed the wrong sha in the closing `raise notice`, never in an `if` check), then fixed and
re-applied via `CLARA_MIGRATION_REDO=0280_plan_schedule_yield_wall`, which took the REDO branch
correctly and converged to the same functional body.

**What 0280 does not do (Agent Brief "Out of scope").** It does not rename
`accrual_schedule_yields_no_occurrence` or touch `clara._assert_accrual_schedule_yields`. It does
not touch `clara._plan_due_events` or `clara._accrual_schedule_yields` — both pinned, both
untouched; 0280 adds no logic of its own, only a call. It does not recut
`clara.create_accounting_plan` or `clara.revise_accounting_plan`.

**Known gap, not this ticket's scope.** `apps/web/lib/plans/schedule.ts`'s `validatePlanSchedule`
is the general plan form's own mirror of `_assert_plan_schedule` and carries no yield check (unlike
`apps/web/lib/work/accrual-draft.ts`, which already mirrors the accrual entrance's own wall) —
after 0280, a well-shaped but non-yielding schedule submitted through the general plan form now
gets a correct but LATE refusal from the door rather than an early one beside the field. Filing a
follow-up to add the mirror is recommended; #908's Agent Brief names only the SQL validator and its
two doors as in scope.

## 0281 — the plan-overlap advisory gains a sibling-plan arm (#909)

**Context.** `clara._plan_overlap_warning` (0193:1155) has scanned `clara.adjustment_templates`
since the plan lane's own birth — a plan created over a live 0045 template's accounts has always
been warned — but it never scanned `clara.accounting_plans` itself. An accrual plan
(`reversing_journal`) and an amortisation plan (`amortisation_schedule`) on the same account
therefore warned about NEITHER each other NOR anything else: nothing on the plan side ever looked
at a sibling plan at all. #909 was originally filed wider (a cross-lane, template-vs-plan
direction, and a refuse-vs-advise question); the owner's 2026-09-18 ruling on #788 retires the
whole 0045 lane in three tracer-bullet tickets (#927 → #928 → #929, "blueprint and vocabulary",
which drops the template arm entirely when it closes) and re-scoped #909 to exactly the
sibling-plan half, independent of that retirement.

**What 0281 does.** `0281_plan_overlap_sibling_arm.sql` recuts `clara._plan_overlap_warning` with
a second arm, `UNION ALL`ed with the existing (unchanged) template arm: every OTHER live (`active`
or `paused` — an `ended` plan can never run again) `clara.accounting_plans` row of the same client
whose CURRENT (unsuperseded) revision's basis lines intersect the basis being evaluated. Both arms
are merged into the ONE `templates` list the three plan-creating doors and their web forms already
render (`overlap_warning.templates.map((x) => x.name)`, which does not branch on `kind`), so none
of them needs a single line changed — a sibling plan's entry reuses `name`/`cadence`/`accounts`
from the template shape and adds its own honestly-named `plan_id` rather than borrowing
`template_id`. `kind` keeps its literal `'adjustment_template_overlap'` value whenever any template
row matches (byte-for-byte what `accounting-plans.test.mjs`'s own `p640.schedule.overlap` already
asserts, unedited by this file) and reads `'accounting_plan_overlap'` only when the match set is
purely sibling plans — a stated, transitional imprecision for the case where both match at once,
accepted because a hosted census the same day found ZERO rows in `clara.adjustment_templates` and
#929 deletes the template arm shortly regardless. No signature change, no new relation, no new
door; `clara.create_accounting_plan`, `clara.revise_accounting_plan` and `clara._accrual_plan_core`
keep byte-identical bodies and inherit the widened warning through the one function they already
call.

**Self-exclusion, by basis identity.** The function carries no plan id (the Agent Brief's own "Key
interfaces" line names only this function for change, and "the three plan-creating doors ...
unchanged"), so the plan being evaluated is excluded with `r.basis is distinct from p_basis`: every
call site (`create_accounting_plan` 0193:1552, `revise_accounting_plan` 0193:1751,
`_accrual_plan_core` 0222:1045 — all pinned as non-regression) already writes the row a call is FOR
— inserting it, or superseding the live revision with a freshly-inserted one — strictly BEFORE
reaching this function, always carrying `r.basis = p_basis` exactly. A genuinely different
sibling's own basis is a different jsonb value and is never excluded. The accepted, stated
limitation: two INDEPENDENT plans whose bases are byte-for-byte identical would hide each other
from this advisory — judged acceptable because the advisory is advisory (a false negative here
costs a missed warning, never a wrong refusal) and this estate has never produced that coincidence
in practice. `tests/plan-overlap-sibling-arm.test.mjs`'s `p909.no-overlap` cell proves the ordinary
case (a fresh plan's own basis never warns about itself) is unaffected.

**Prestate/tail.** Pins (pre-image `sha256(prosrc)`, MEASURED on a 269-migration, `0001->0280` rig):
`clara._plan_overlap_warning` (`f550d0b393f9…9a074`, the post-0193 body, unmoved through 0222/0223/
0250/0280 since none of them recut it), and as non-regression `clara.create_accounting_plan`
(`84b67058244b…8d6c4`), `clara.revise_accounting_plan` (`87c9f1e9bcf4…431f`) and
`clara._accrual_plan_core` (`b3bd10065ed7…9da8`). The prestate is REDO-tolerant by construction
(#957): it recognises either the measured pre-0281 pre-image or this file's own prior output (its
new token, the existing arm's own token, the new tables it reaches and the self-exclusion guard,
together), and refuses anything else rather than guessing. `create or replace function` on the
unchanged signature converges to the same text either way, so §A itself carries no branch. The tail
re-reads every pin, re-asserts the existing arm's own tokens are still present BY NAME (0281 adds,
it does not rewrite), and re-confirms owner, `SECURITY DEFINER`, `search_path`, `STABLE` volatility
and the owner-only ACL are unmoved. Measured: applied FIRST (the fresh-apply branch, confirmed by
the prestate's own notice naming "measured pre-0281 pre-image"), then a temporary hand-swap back to
the pre-#909 body proved every new cell in `plan-overlap-sibling-arm.test.mjs` red for the right
reason except the one negative case both bodies happen to satisfy (`p909.no-overlap`), the body
restored byte-for-byte from this file's own §A, and then genuinely re-applied via
`CLARA_MIGRATION_REDO=0281_plan_overlap_sibling_arm`, which took the REDO branch ("own prior
output") correctly.

**What 0281 does not do (Agent Brief "Out of scope").** It does not touch the 0045-side advisory
(`_wdb_period_overlap_advisory`) or add any refusal on top of either arm — still advisory, per the
Agent Brief's own words. It does not recut `clara.create_accounting_plan`,
`clara.revise_accounting_plan` or `clara._accrual_plan_core`. It does not widen this function's
signature or edit any of the three plan-creating doors or their web forms — the section above
states why that was unnecessary rather than merely deferred. The cross-lane direction and the
refuse-vs-advise question #909 was originally filed with are #788's, closed as split into
#927 → #928 → #929.

## 0282 — the 0045 recurring-adjustment template lane's three human-write doors close (#927)

**Context.** #788 (owner ruling, 2026-09-18): "retire the 0045 recurring-adjustment template lane
fully" — the hosted census the same day found ZERO rows in `clara.adjustment_templates`, of any
status, so no data migration is owed. The ruling is delivered in three tracer-bullet tickets,
#927 → #928 → #929. This is #927, step one: it closes the three doors that could ever CREATE or
ADVANCE a template's schedule — `clara.propose_adjustment_template`, `clara.sign_adjustment_
template` and `clara.run_adjustment_manual` — leaving everything else in the lane exactly as it
was. #928 removes the daily runtime sweep next (the only OTHER way a period could ever fall due);
#929 drops the plan-overlap advisory's now-dead template arm and rewrites the product record.

**What 0282 does.** `0282_retire_adjustment_template_doors.sql` recuts the three doors' bodies —
same signatures, same owner, same `SECURITY DEFINER` flag, same `search_path`, same
`clara_authenticated`-only ACL — to `raise exception` unconditionally, before touching any
argument, any table or `clara._human_ctx`: the door is closed to every caller alike, not merely
re-floored. All three share ONE token — `errcode = 'CLR10'`, `detail.reason =
'adjustment_template_lane_retired'` — and a message naming the specific verb that no longer exists,
ending by pointing at the surviving lane ("create an accounting plan instead — Client → Plans").
No new relation, no new grant, no `DROP`.

**The prestate guard: no non-retired template may exist when this file lands.** A `proposed` row
could never be signed again (sign closes in the same transaction); a `live` row could never run
another occurrence by hand again (manual-run closes too) and, once #928 lands, never again at all —
either shape would be this file silently orphaning a schedule a firm is still relying on. Only
`status = 'retired'` is admitted; a from-scratch chain carries no row at all and passes vacuously.
Measured on `clara_l05` (riders wave 3, lane 05) before this file was authored: ten leftover
`status='live'` rows from #909's own rig fixtures (`plan-overlap-sibling-arm.test.mjs`'s "Rig combo
template" / "Rig overlap template" cells, born 2026-09-20 by direct `INSERT`, never cleaned up
because that file's own fixture never retires them) — retired by hand through the still-open
`retire_adjustment_template` door before applying, which is the guard's own intended remedy for any
lane that meets it non-empty; never a silent `DELETE` (retire, never delete, is this table's own
law throughout 0045).

**What stays exactly as it is (D6: "historical receipts and in-flight legacy visibility are
retained"), and how the prestate/tail prove it.** `clara.retire_adjustment_template`
(`66a113f25326…d8b45`), the reversal-pair machine (`reverse_adjustment_pair` `f167cab16f5c…8580`,
`approve_pair_reversal` `5fa46ad5ca2a…d9d`, `cancel_pair_reversal` `ad7e0fc6ebee…8192`), the
correction door (`_adj_correction_door` `5b22b62819fe…93e52`) and the three reads
(`list_adjustment_templates` `97cabd663904…75ff`, `list_adjustment_runs` `197872e84d54…c93f`,
`get_adjustment_run` `ff75553cab62…8ac3`) are pinned by pre-image `sha256(prosrc)` in §0 and
re-pinned unchanged in §T — none of those seven bodies is touched, recut or re-granted. Also pinned
non-regression, for the same reason: `clara.run_adjustment_occurrence` (`d61707e27aa4…8a252`) and
`clara.adjustment_run_due` (`f01e9e403a73…26052`) — #928, not this file, retires the runtime belt
that is their only remaining caller, so the doors themselves must keep working exactly as today
until it does — and `clara._propose_adjustment_template_core` (`b975d0af972d…9ee810`), the OLD
propose door's own former callee, still reachable through `clara._agent_prepayment_schedule_core`
(0140), which this file does not go near.

**Prestate/tail.** Pins (pre-image `sha256(prosrc)`, MEASURED on `clara_l05`, 281 migrations,
`0001->0281`, 2026-09-21): `clara.propose_adjustment_template` (`1319ba44fe95…3c7cd5`),
`clara.sign_adjustment_template` (`e7ace43b0043…88c2dff`) and `clara.run_adjustment_manual`
(`45c4546994c7…f1edc6`), each redo-tolerant by construction (#957) — the prestate recognises either
the measured pre-#927 pre-image or this file's own prior output (the `adjustment_template_lane_
retired` token in the body), and refuses a MIXED state (some old, some already recut) outright
rather than building on a partial prior apply. The tail does not merely re-read `prosrc`: it CALLS
all three, as `clara_fn_owner` (no PostgREST session needed — none of the three reaches
`_human_ctx` any more), and asserts the caught `CLR10`'s `detail.reason` is exactly
`adjustment_template_lane_retired` — a behavioural proof, not only a static one — before re-reading
owner/`SECURITY DEFINER`/`search_path`/ACL and the nine non-regression pins above.

**What 0282 does not do.** It does not touch `clara.retire_adjustment_template`, the reversal-pair
machine, the correction door, any read, `run_adjustment_occurrence`, `adjustment_run_due` or
`_propose_adjustment_template_core` — the section above states why each survives rather than
merely asserting it. It does not remove the daily runtime sweep (#928) or rewrite `CONTEXT.md` /
`ARCHITECTURE.md` / `PRD.md` or the plan-overlap advisory's template arm (#929). It does not
migrate data — the prestate's own guard is what makes that safe, not a claim that no live template
could exist.

**Two operational facts a release or a redo of 0282 must carry (fix round, 2026-09-23).**

- **Its live-template guard is a LIVE gate, not a recorded fact.** 0282 refuses to apply while any
  `clara.adjustment_templates` row is non-retired. The hosted census that found zero was taken on
  2026-09-18; on release day the count must be taken again, and a non-zero answer is cleared by a
  retire-by-hand pass through `clara.retire_adjustment_template` (which admits `proposed ->
  retired` and back-fills `signed_by`/`signed_at` for a never-signed row) before the migration is
  run, not by loosening the guard.
- **A redo of 0282 on any rig that has run the db suite is REFUSED, by design.** This lane's own
  fixtures mint non-retired rows by direct INSERT and do not clean up
  (`tests/x42-adj-helpers.mjs`'s `insertTemplateRaw`, `tests/plan-overlap-sibling-arm.test.mjs`'s
  and `tests/plan-overlap-template-arm-retired.test.mjs`'s planted rows), so the guard's own count
  is non-zero the moment the batteries have run — measured at 491 non-retired rows on `clara_l05`.
  That is the guard working: those rows are exactly the orphans it refuses to create. A
  from-scratch chain passes it vacuously (nothing under `seeds/` or `scripts/` inserts the table),
  so the integrator's from-scratch proof is the one that carries this migration, and a rig that
  needs the redo retires its own fixture rows first.

**A citation 0280 carries that resolves to nothing (fix round, 2026-09-23).**
`0280_plan_schedule_yield_wall.sql` names `clara.revise_accrual_adjustment` three times — twice in
its header and once at `:265`, inside the `clara._assert_plan_schedule` body it ships, so the
string is permanent `prosrc` on every estate it reaches. No such function exists: the `clara`
functions matching `%accrual%` are `create_accrual_adjustment`, `create_accrual_adjustment_for`,
`get_accrual_adjustment`, `list_accrual_adjustments` and the private helpers. The two real callers
of `clara._assert_accrual_schedule_yields` are **`clara.create_accrual_adjustment`** (granted
`clara_authenticated`) and **`clara.create_accrual_adjustment_for`** (granted `clara_runtime` — the
on-behalf-of door), so the accrual entrance's yield wall guards the runtime door too, which 0280's
header does not say. The behaviour is correct either way; only the record was wrong. 0280 is
applied and immutable, and is not the highest applied version, so #957's redo cannot reach it — the
correction lives here and in `0283`'s own header.

## 0283 — the plan-overlap advisory loses its 0045 template arm, and the arm that survives is fixed twice (#929)

**Context.** #788 (owner ruling, 2026-09-18): "retire the 0045 recurring-adjustment template lane
fully," delivered in three tracer-bullet tickets. #927 closed the three human-write doors; #928
retired the daily runtime sweep; this is #929, step three: the LAST live surface the 0045 lane
still reached — `clara._plan_overlap_warning`'s template arm, which 0281 (#909) left in place
alongside its own new sibling-plan arm — closes too. `clara.adjustment_templates` itself and every
read of it (D6's retained historical surface: `list_adjustment_templates`, Registers →
Adjustments) are untouched; this migration only stops the plan-creation advisory from SCANNING
that table.

**What 0283 does.** `0283_retire_plan_overlap_template_arm.sql` recuts `clara._plan_overlap_warning`
a second time: 0281's own ARM 1 (the `clara.adjustment_templates` scan and its `UNION ALL`) is
deleted outright; 0281's ARM 2 (the sibling-plan scan) survives, unindented to the top level.
`kind` collapses from a two-branch `case` to the single literal `'accounting_plan_overlap'` — the
only value this function can ever answer from here on. No new relation, no new door, no data
migration (a live `clara.adjustment_templates` row, historical or a rig fixture, simply stops being
named — it is neither read nor written by this file). The three plan-creating doors and their web
forms (`apps/web/components/{plans,accruals,prepayments}-form.tsx`) read only
`overlap_warning.templates.map((x) => x.name)` and never branch on `kind` (0281's own header,
unmoved), so no FORM needed a code change; the `PlanOverlapWarning`-shaped TypeScript types
(`lib/{plans,accruals,prepayments}/api.ts`) and the `overlapTitle`/`overlapBody` copy in
`messages/en.json` were corrected in the same commit to stop describing a "recurring adjustment
template" that can no longer exist, and no longer carry a `template_id` field that can no longer
appear.

**…and what its FIX ROUND (2026-09-23, second round) added to the same file.** Two review findings
were defects in the arm that SURVIVES the retirement, not in the retirement. Round one deferred
both on the ground that the honest fix recuts three caller bodies four migrations pin
byte-unchanged; that ground was withdrawn in round two, because 0280–0283 are one unmerged lane's
own migrations, 0283 is the highest applied version (so #957's redo can reach it), and the pins in
0280/0281/0282 run BEFORE this file in every chain and still see the pre-images they name. Wave 3
reserved `0280–0283` for this lane and `0284` onward belongs to another, so a fourth file was never
an option: this one grows, and its NAME is now narrower than its content.

- **FIX 1 — self-exclusion by identity.** All three doors compute this advisory AFTER writing their
  own plan row or their own new live revision, so the function has always had to exclude the
  caller's own plan. 0281 excluded it by BASIS VALUE (`r.basis is distinct from p_basis`), which
  also hid every OTHER plan carrying the same basis — total overlap, the case a human most needs
  told. Measured on `clara_l05`: 7 `(client, basis_digest)` groups held 28 live plans with
  byte-identical bases (four at a time, 4 ms apart, from the rig's own seed) and the advisory
  answered `NULL` for them. The signature becomes
  `clara._plan_overlap_warning(p_client uuid, p_basis jsonb, p_self_plan uuid)`, the predicate
  becomes `p.id is distinct from p_self_plan`, and **the two-argument signature is dropped** so the
  blind spot cannot be reached through a surviving overload. Not a by-value heuristic instead:
  excluding "the most recently written identical-basis plan" would make `revise_accounting_plan`
  warn a firm about the very plan it is revising, and a warning that names your own row teaches the
  reader to skip the key.
- **FIX 2 — the concurrency window.** The advisory is computed inside the creating transaction, so
  two sessions creating overlapping plans for one client each read the other's row as uncommitted
  and BOTH answered null. All three doors now take the client advisory rung
  `pg_advisory_xact_lock(203005004, hashtext(<client>::text))` — the same rung
  `clara.retire_adjustment_template` takes — after their op-receipt reservation (0037 §K's own
  order) and above any `clara.accounting_plans` row lock (0238's order for this rung). Censused
  before it was added: of the 51 bodies that take 203005004, **none** reads or locks
  `clara.accounting_plans`, so the only new ordered pair is "client rung → plan row" and no body
  holds a plan row while waiting for that rung.

**Prestate/tail.** The prestate decides which of two admissible starting shapes it is looking at
BY SIGNATURE — a fact about the catalog, not a marker inside a body, which is what the wave-3
addendum asks for — and then every pin on the branch it picked is a hard sha:

| | FRESH APPLY (two-argument advisory live, no three-argument one) | REDO #957 (three-argument live, no two-argument one) |
|---|---|---|
| `clara._plan_overlap_warning` | `33b23167…1e0b` (0281's own two-arm output) | `c2566349…f7dc` |
| `clara.create_accounting_plan` | `84b67058…d6c4` | `99f60787…b424` |
| `clara.revise_accounting_plan` | `87c9f1e9…431f` | `8a6e69ef…2886` |
| `clara._accrual_plan_core` | `b3bd1006…9da8` | `31adc6d4…9bc5` |

Both signatures present at once, or neither, is refused rather than guessed past. The tail re-reads
`prosrc` and asserts: the template tokens are GONE; the two-argument signature is gone and exactly
one `_plan_overlap_warning` resolves; the surviving arm self-excludes by `p.id is distinct from
p_self_plan` and NO LONGER by basis value; each of the three callers takes the client rung, passes
its own plan id, and takes that rung above any `clara.accounting_plans` row lock; all three keep
their ACLs across the recut; `revise_accounting_plan` still re-reads `plan_ended` under the plan row
lock (0193's review finding S4, which `p640.revision.end_race` also censuses); and the recut
advisory keeps its owner, `SECURITY DEFINER` flag, `search_path`, `STABLE` volatility and owner-only
ACL. **Both branches were exercised for real on `clara_l05`**: the pre-image was restored by
re-running 0281's own `§A` statement, then `CLARA_MIGRATION_REDO=0283_retire_plan_overlap_template_arm`
reported `FRESH APPLY`; a second redo over that result reported `REDO (#957)`. See
`tests/plan-overlap-template-arm-retired.test.mjs` for the outside-in re-proof and the
red-then-green trace of both fixes.

**What stays exactly as it is.** `clara.adjustment_templates` keeps every row it has (live,
proposed or retired); `clara.list_adjustment_templates`, `clara.list_adjustment_runs`,
`clara.get_adjustment_run` and Registers → Adjustments (#927) still show them in full — only the
PLAN-CREATION advisory stops consulting the table. `tests/plan-overlap-sibling-arm.test.mjs`
(#909's own file) keeps every cell that is still true unconditionally from 0281 on (the sibling
arm's own five design-decision cells, its tail's non-template assertions); its one cell that is no
longer true anywhere (`p909.combined-with-template`, 0281's own documented "moot once #929 lands"
case) is removed, with a pointer to this migration's own dedicated file,
`tests/plan-overlap-template-arm-retired.test.mjs`, which owns the current-contract proof
(`p929.template-alone`, `p929.template-with-sibling`, `p929.tail`). `accounting-plans.test.mjs`'s
`p640.schedule.overlap` is retargeted the same way, gated locally on this migration's own stem.

**What 0283 does not do.** It does not touch `clara.adjustment_templates` or any of its readers —
D6's retained historical surface is untouched. It recuts `clara.create_accounting_plan`,
`clara.revise_accounting_plan` and `clara._accrual_plan_core`, but only by the two edits FIX 1 and
FIX 2 name: every other line of those three bodies is reproduced from the pre-image the table above
pins. It does not edit `CONTEXT.md`'s two
`_Avoid_` lines (a separate, non-migration commit in this same ticket), `docs/ARCHITECTURE.md` or
`docs/PRD.md` — the blueprints are never edited outside a #683 sync; this ticket's closing report
carries the `ARCHITECTURE.md:500` blueprint-drift line and the C08.1 nested-obligation disposition
addressed to #683 instead. It does not close #788 or edit #909's comment — the ticket's own triage
correction records both are already satisfied.

**What the three-step retirement leaves standing, and the cell that watches it (fix round,
2026-09-23).** None of #927/#928/#929 touches `clara._propose_adjustment_template_core`, and one
path still reaches it: `clara.wake_establish_prepayment_schedule` (0140's agent prepayment limb,
granted to `clara_wake_interactive` and carried in `clara.wake_fn_allowlist` as `(close_prep,
wake_establish_prepayment_schedule)`) → `clara._agent_prepayment_schedule_core` → that core, which
INSERTs a `proposed` template row. Driven, not read off the source: calling the core inside a
rolled-back transaction on `clara_l05` answered `{"status":"proposed","template_id":…}` and left
one row before the rollback. Such a row could never be signed, run, swept or named by the
advisory — exactly the orphan 0282's live-template guard exists to prevent. Two things hold it
shut, and neither is a wall in this database. First, `clara.wake_engine_sources.close_prep.enabled
= false` (parked since 0133; 0138/0140/0159/0223 each pin it) — but the flag bites in the RUNTIME,
not here: `clara.mint_wake_credential_for_task` is granted to `clara_runtime` and never reads it
(hence the 771 `close_prep` credentials the batteries themselves minted on `clara_l05`), while
`packages/runtime/lib/wake-engine.mjs:392-397` and `:801-804` promote a task to `running` only
`… and exists (select 1 from clara.wake_engine_sources where source_key=$2 and enabled)`. Second,
`clara.wake_fn_allowlist` names that wrapper for `close_prep` **and for no other wake kind** —
which matters because every other kind is live, and `interactive_client` (minted from a chat turn
by `clara.mint_chat_close_credential`) has no `wake_engine_sources` row the flag could speak for.
Retiring or rerouting the limb at `clara.create_prepayment_schedule` (0223) is a product act the
#788 split did not publish, so it is deliberately not done here; instead the containment is a live
cell — `tests/plan-overlap-template-arm-retired.test.mjs`'s `p929.containment`, whose two
rolled-back mutants flip the flag and widen the allowlist — which goes red with the remedy in its
message the day anyone unparks `close_prep` or registers that wrapper under a live wake kind.
0283's own header carries the same statement. It is the ONE finding of the three the fix rounds
left open: unlike FIX 1 and FIX 2 it is not a wrong answer in code this lane wrote but a product
capability nobody has ruled on, so the ruling — retire the limb, or reroute it onto
`clara.create_prepayment_schedule` (0223), or accept the residual — is owed before the code is.
The two sibling-arm defects it used to sit beside are NOT open: 0281's "a coincidence this estate
has never produced" justification was withdrawn as measurably false and then fixed (FIX 1), and the
concurrency window is closed (FIX 2). Ledger checksum after the fix round's two redos:
`0832489ac90494c17e31d90ca570bd35127ec229e8552d663534b180e7520ef3`.

## 0284 — a dedicated accrual-correction door (#936, riders wave 3, lane 06)

`0284_accrual_correction.sql` closes the bug measured during #907's review: the only way to
change an accrual's amount was `clara.revise_accounting_plan` (0193), which advances the plan to a
new revision while `clara.accrual_adjustments` (0222) — keyed on `(plan_id, revision)` — stayed at
the FIRST revision, because the accrual configuration door only ever writes the first one. A reader
joining plan → revision → accrual detail then saw the OLD amount beside the NEW one the ledger
would post from the next due date on.

**The choice, and why it is the only one of the ticket's two the lane could take.** The Agent Brief
offered two shapes — the plan revision door itself writes the accrual detail, or a dedicated
correction door writes a successor row. Lane 05 (#908) pins `clara.revise_accounting_plan`'s body
as UNCHANGED in its own migration, so recutting it here would collide with that pin at
integration. `clara.correct_accrual_adjustment` therefore NESTS `clara.revise_accounting_plan` —
calling it, never recutting it — exactly as `clara.create_accrual_adjustment` already nests
`clara.create_accounting_plan` (0222 §D).

**What the file adds, and what it does not.** One function, its grant, and nothing else: no table,
no column, no trigger, no index. `corrects_accrual_id`, `corrected_by_accrual_id`,
`t_accrual_adjustments_append_only`'s one-admitted-update arm and the partial unique index
`uq_accrual_adjustments_corrects` all already existed in 0222 — the ticket's own acceptance line
("the columns and the unique index exist; no writer does today") is why. The door carries the LIVE
revision's own schedule and authority window through to the nested `revise_accounting_plan` call
unchanged; it corrects what was STATED (amount, either leg, term, method, instruction), never when
or how often the plan runs.

**"The LIVE revision" means the live revision** (review round 1, ADV-01 — driven on the lane rig
inside rolled-back transactions). An accrual's plan is reachable by the GENERIC plan-revision door
a bookkeeper uses today, so a firm may lawfully move its window afterwards — withdrawing future
authority it no longer grants, or extending it. `clara.accrual_adjustments.effective_from/
effective_to` is a fact derived when that row was written, and after such a revision it is STALE.
The first cut of this file read five schedule arguments from the live revision and the
`(effective_from, effective_to)` pair from the SUPERSEDED accrual row, so a correction silently
reverted a lawful plan revision: it restored an authority the firm had withdrawn — the
money-posting direction, since the plan then accrues months nobody authorised — or dropped one it
had extended, with no refusal and no overlap warning. Every use of the window now reads the live
revision, which also means `clara._assert_accrual_term_window` judges the corrected term against
the authority that is actually live: a term that no longer brackets it is refused by name
(`accrual_term_window_mismatch`) instead of quietly shrinking the window to fit. The term-window
wall consequently sits in the WORLD half, after the reservation branch and under the RUNG-1 lock,
because one of its two operands is mutable world state; only `clara._assert_accrual_particulars`,
which reads nothing but the payload, stays above the reservation. The tail census pins both: the
two `v_cur` uses must be present and `v_old.effective_from`/`v_old.effective_to` must be ABSENT
from the body, because an assertion about what IS present cannot catch a second, forgotten use of
the stale pair.

**The derived nested key's collision is typed** (ADV-06). `clara._reserve_op` keys on
`(firm_id, fn, op_key)`, so the nested `p_op_key || ':plan'` shares the
`(firm, 'revise_accounting_plan')` namespace with keys a caller chooses for that door DIRECTLY —
and #936 is the first place the nested door is one a human reaches with an arbitrary key of their
own. The nested call is wrapped: an UNTYPED CLR10 out of it (which is exactly `_reserve_op`'s own
detail-less "op_key reused with different args") re-raises with
`{"reason":"plan_op_key_conflict"}`, and every other refusal re-raises byte-identically through a
bare `raise`, so nothing the plan door already classifies is masked or renamed. Already-posted occurrences and their reversals are consequently
untouched by construction — `clara.accounting_plan_occurrences` is never written by this door, and
a past occurrence keeps naming the revision it ran under, exactly as 0193's own supersede-and-keep
shape already guarantees for every other revision.

**The race this door closes itself.** Two concurrent corrections of the same accrual would both
pass an unlocked read of `corrected_by_accrual_id` and then collide on
`uq_accrual_adjustments_corrects` as a bare `23505` neither could classify. The door instead takes
RUNG 1 — the same `accounting_plans` row lock `clara.revise_accounting_plan` itself takes — BEFORE
re-reading `corrected_by_accrual_id`, so a second caller targeting the same accrual (always the
same plan) blocks on that lock and, once it proceeds, is refused by name
(`accrual_already_corrected`) rather than by an unclassifiable constraint error.

**Migration triad.** `tests/accrual-correction-preintegration-gate.mjs` (stem
`accrual_correction$`), `ACCRUAL_CORRECTION_0284_COHORT`/`ACCRUAL_CORRECTION_0284_HUMAN_FNS` in
`tests/rig-meta.mjs` (spread into `ALLOWED[clara_authenticated]` and its own bimodal
`cohortFailures()` call, the wave-2 `0270` pattern), and the gate's `--import` token in
`package.json`'s test script, last in migration order. Battery:
`tests/accrual-correction.test.mjs`, frontier-gated on the same stem, extending
`tests/accrual-adjustments-fixtures.mjs` (0222's own) rather than building a second world.

**Redo-safe by construction**: the one statement that changes the catalog is
`create or replace function`; the grant/revoke pair is idempotent. The prestate asserts nothing
about this file's own function being absent.

## 0285 — the prepayment schedule reads gain a term-liveness flag (#919, riders wave 3, lane 06)

`0285_prepayment_term_liveness.sql` closes the gap #919's Agent Brief names: `clara.
prepayment_schedules.service_period_id` (0223) echoes the `clara.document_service_periods` row a
schedule was DERIVED from, but neither `clara.get_prepayment_schedule` nor
`clara.list_prepayment_schedules` ever said whether that row was still the LIVE one on its
document. 0223's own header already states the design in full — a corrected term supersedes the
row and the stored allocation never moves, because a re-derived schedule is a NEW schedule on a
NEW plan — but nothing on the read side made "this schedule is riding a since-superseded term"
visible without a person already holding that rule as tribal knowledge.

**What the file adds, and what it does not.** `term_live` (boolean), `term_superseded_by` (uuid,
null while live), `term_moved` (boolean) and the live term itself as `term_current_start` /
`term_current_end`, joined from `clara.document_service_periods` on `service_period_id`, on
BOTH reads — no new argument, no floor change, no new relation, no new grant, no recut of
`clara.record_document_service_period` or any other 0140/0223 body. The join is safe inside each
definer body without minting one: both reads already run as `clara_fn_owner`, and
`document_service_periods` carries the same RLS-forced, owner-exempt-nothing-but-the-owner-policy
posture `prepayment_schedules` does (`p_dsp_owner … for all to clara_fn_owner using (true)`,
0140), pinned in this file's own prestate and re-measured in its tail.

**Why `term_moved` exists beside `term_live`** (review round 1, ADV-02 — driven on the lane rig
inside a rolled-back transaction). `clara._record_document_service_period_core` (0140) supersedes
the live row UNCONDITIONALLY: it compares no dates. So `term_live` goes FALSE on ANY re-record of a
document's service period, including one that restates the term byte for byte — a second
verification against the same invoice, a retyped basis sentence. A surface keyed on `term_live`
alone therefore told a firm that its term "has since been corrected" and that "a corrected term
needs a new schedule" when nothing about the term had moved: a false statement of fact, and
materially wrong advice about a running amortisation. The two facts are different in kind and both
are reported. `term_live`/`term_superseded_by` are the AUDIT pair — which row this schedule was
derived from, and whether it is still the live statement of the term. `term_moved` is the one a
SURFACE may act on: true only when the row is superseded AND the term that stands today states a
different `(period_start, period_end)`. The comparison is against the document's one
`superseded_at is null` row (`uq_document_service_period_live`), never against `superseded_by`'s,
so a twice-corrected term answers about the term in force rather than an intermediate one.

**The prestate pin is bimodal, and the FIRST branch was proved by hand.** This file RECUTS the two
bodies it pins, so after one apply their live `sha256(prosrc)` is no longer the 0223 pre-image the
prestate was measured against; an unconditional pin would refuse its own redo (the wave-3
work-order addendum names exactly this trap). The prestate admits two pre-images per body and says
which it found — the 0223 sha (`FIRST`) or a body already carrying this file's own `term_live`
field beside its `#919` attribution (`REDO`) — and refuses a body matching neither. Half and half
is not a mode: one read at its pre-image and the other already recut means something outside this
file moved one of them, and the prestate refuses rather than papering over it. Because
`CLARA_MIGRATION_REDO` only ever takes the `REDO` branch, the `FIRST` branch was driven by hand:
inside one transaction that was rolled back, 0223's own two `create function` statements were
re-run as `create or replace` to restore the pre-images (both re-measured equal to the pinned
shas), this prestate block was executed verbatim, and it reported `FIRST`.

**Why a join, never a stored column.** `clara.prepayment_schedules` is APPEND-ONLY IN FULL
(`_tf_prepayment_schedules_append_only`) precisely because every column on it is a fact derived at
creation. Whether the term row it names is *still* live is not such a fact — it can change at any
later moment a bookkeeper corrects the term on the same document — so it is computed against the
CURRENT catalog on every read rather than stored and left to go stale on a row this estate has
already promised never to touch again.

**Migration triad.** `tests/prepayment-term-liveness-preintegration-gate.mjs` (stem
`prepayment_term_liveness$`) and the gate's `--import` token in `package.json`'s test script, last
in migration order. No `rig-meta.mjs` cohort: this file mints no new function and changes no
grant, so there is nothing for `ALLOWED`/`cohortFailures()` to track — the `0257_firm_setup_
applicability.sql` precedent (a same-shape recut of an existing read) carries none either. Battery:
`tests/prepayment-term-liveness.test.mjs`, frontier-gated on the same stem, reusing
`tests/prepayment-schedule-fixtures.mjs`'s own scene builder and verb wrappers rather than building
a second world.

**Redo-safe by construction**: the two statements that change the catalog are
`create or replace function`; the prestate asserts nothing about this file's own additions being
absent.

## 0286 — a re-read opening document becomes re-parsable (#986, riders wave 3, lane 06)

`0286_opening_source_reread.sql` closes the dead end #656 measured and filed (its `656-final.md`
residual R4 / follow-up F4). A tied opening basis's document-primary targets are recorded from ONE
reading of the tie document by `clara.record_opening_targets_parsed` (0017), under an op key the
runtime mints as `openingparse:<seed>:<document>` — deliberately stable per (seed, document), so a
retried POST cannot double a basis — while the payload that key hashes is keyed by REGION ID. When
the document is genuinely READ AGAIN, two walls close at once: the re-parse refuses (`_reserve_op`
sees the same key with different args, CLR10, mapped by the runtime to the typed conflict
`source_reread_since_parse`) and so does the APPROVAL (`clara.approve_opening_seed` re-runs
`clara._assert_opening_target_fact` over every target, and `_assert_opening_extraction_ref` refuses
a citation whose extraction is superseded — CLR31 `extraction_not_accepted`). The basis can be
neither re-parsed nor approved; the only escape was to cancel it and start another, discarding
every drafted opening item with it.

**And a fresh op key is not the fix.** Handing the parse door a random key after a re-read succeeds
and leaves the OLD targets standing beside the new ones — the new reading mints new region ids and
therefore new `line_key`s, and `uq_opening_tb_targets_key` is on (seed_id, line_key). A three-line
trial balance would carry six targets and tie to nothing. That is what the stable key exists to
prevent, and it is why the remedy has to RETIRE the superseded set rather than merely record
another one.

**What the file adds.** (1) `clara.opening_target_refreshes` — an append-only, FORCE-RLS receipt
relation: one row per refresh naming the basis, the document, the reading LEFT and the reading
ARRIVED AT, the retired and recorded counts, and the retired rows VERBATIM. (2)
`clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)` — ONE door, `clara_runtime`
only, exactly as `record_opening_targets_parsed` is, whose op key carries the NEW EXTRACTION
(`openingreread:<seed>:<document>:<extraction>`). It runs the parse door's own front-door walls, then
three of its own (`stale_extraction_version` — the reading refreshed onto must be the document's
authoritative run; `refresh_extraction_mixed` — every line cites that one reading;
`no_reread_to_refresh` — the basis must already stand on a different reading), retires the stale
targets, records the new ones through the same field-level fact assertion, and writes the receipt.
(3) Nothing else: no column on `clara.opening_tb_targets`, no trigger on it, no recut of any 0017
body, no new grant to any human or agent lane.

**Why a receipt relation and not a `state` column on the targets.** `clara.opening_items` carries
the estate's supersede-chain shape (`state`, `superseded_by_item`, `supersedes_item_id`) and was the
first candidate. Measured, it does not fit: `clara._opening_seed_deltas`, `clara._assert_opening_tie`,
`clara.get_opening_dryrun`, `clara.approve_opening_seed`'s two target sweeps, 0056's close-model read
and 0239's three `opening_balance_work` reads ALL sum or scan `clara.opening_tb_targets` with no
state predicate. A retired state on that table would silently make nine bodies wrong until each was
recut — in the one lane whose whole point is that a stale figure must never stand quietly beside a
fresh one. The live target set stays exactly "the rows in the table", which is what all nine already
believe, and the supersession is recorded where a reader can ask for it.

**The caller's echo is walled the same way the parse door walls it** (review round 1, ADV-07).
`clara.record_opening_targets_parsed` admits an OPTIONAL `opening_fact` on a line — a parser
echoing the triple it believes it read — and accepts that echo only when it is exactly the triple
the database independently proved from the cited region, refusing
`opening_extraction_fact_malformed` / `opening_extraction_fact_mismatch` otherwise. The first cut
of this file ran the field-level fact assertion but IGNORED the key, so the refresh door silently
accepted a payload the parse door would have refused, while its own header claimed "byte for byte
the parse door's own per-line validation". Two write doors on one lane must not disagree about
what a payload may CLAIM — the more so because #986's successor contract hands this core to #985's
chat tool — so the wall runs here too, in the same position, with the same two tokens, and pinned
by the tail census. It is a wall, never a source of figures: nothing stored is taken from the echo.

**The reservation comes before the precondition the door consumes**, and the ordering was measured
(`tests/opening-source-reread.test.mjs`, `p986.reread.refresh_walls`, found the other order on its
first run). Everything above `_reserve_op` is a FRONT-DOOR wall — the same set the parse door checks
before ITS reservation — and a replay is honoured only while those hold. `no_reread_to_refresh` is
different in kind: a successful refresh makes it false, because the stale targets it names are the
ones the door has just retired, so checking it first made a retried POST refuse instead of replaying
its own receipt.

**Migration triad.** `tests/opening-source-reread-preintegration-gate.mjs` (stem
`opening_source_reread$`, detected off the CATALOG rather than a migration number) and the gate's
`--import` token in `package.json`'s test script, last in migration order; a
`OPENING_SOURCE_REREAD_0286_COHORT` in `tests/rig-meta.mjs`, spread into `ALLOWED[clara_runtime]`
and given its own bimodal `cohortFailures()` call. Battery: `tests/opening-source-reread.test.mjs`,
standing on the real-producer fixture `tests/wave-b/wb-opening-producer.mjs` — its own module
because a test file cannot import another test file without running its cells, and #656's battery
grew the same helper inline. Every `opening_tb.line` region it creates goes through
`clara.persist_document_extraction`, never a raw INSERT, so a genuine second reading supersedes the
first and moves `documents.authoritative_extraction_id` exactly as production does.

**Redo-safe by construction**: `create table if not exists`, `create index if not exists`,
`alter table … enable/force row level security`, `drop policy if exists` before each `create policy`,
`create or replace trigger` (PostgreSQL 14+; this estate runs 17), `create or replace function`, and
an idempotent `grant`. The prestate asserts nothing about this file's own door or relation being
absent, and there is no backfill and no data-dependent branch anywhere in the prestate or the tail.
A `CLARA_MIGRATION_REDO` of this file was exercised during authoring; note that `create table if not
exists` SKIPS an existing relation, so a redo that also changed the table's own definition would
need the table dropped first — the redo used here changed only the function body.

## 0288 — the prior-GL seeding lane is retired (ticket 1012)

Owner ruling 2026-09-20 (on ticket 983): the prior-GL seeding lane gets no browser entrance,
because the product direction is the Client KB — `docs/PRD.md`'s Client Knowledge section states
it, and nobody pre-registers by hand what Clara can learn from a source. There is no successor UI
to build for a lane that asked a professional to tick a pre-registration list, so the lane is
retired instead.

**The change, in four sections of one file.**

| § | What it does |
|---|---|
| B | `clara.create_seeding_batch`, `clara.tick_seeding_proposal` and `clara.decline_seeding_proposal` are recut IN PLACE to ONE shared typed refusal: `CLR34`, `detail.reason = "seeding_lane_retired"`, one sentence, identical in all three bodies (the tail asserts the literal on each). |
| C | `clara.list_review_queue` loses its ninth row kind, `seeding_proposal` — the `seeding_rows` CTE and its union arm are spliced out. |
| D | The seven `prior_gl` `document_capabilities` rows republish: `limits {"browser_entrance":"absent"}` becomes `{"seeding_lane":"retired","seeding_lane_reason":"client_kb_replaces_manual_pre_registration"}`, and the basis says the lane is retired instead of promising an entrance. Whole-registry version raise, by UPDATE, 0228's and 0245's idiom. |
| E | Tail: posture, ACLs, the two closers' byte-identity, and a forced-rollback behavioural probe driving all three refusals and proving they write nothing. |

**Why a refusal and not a drop — the 0271 question, answered the other way.** 0271 dropped
`clara.create_account_set_v1` because it had zero live callers and a dropped body needs no
re-derivation by a future census. These three had live callers: the runtime's seeding-prepare
route and the web Reports panel's tick/decline dialogs. A caller that meets `42883
undefined_function` reports an internal error, not a retirement, and a caller that meets `42501
insufficient_privilege` (had the grants been revoked) reports a permission problem it can neither
diagnose nor fix. The estate's own idiom for this case is 0007's `clara.ingest_document`: keep the
signature, keep the arity, keep the grant, answer a deterministic typed retirement. **No grant
moves**, so exactly the roles that could call these doors before can call them now, and receive an
answer they can render.

**Why the refusal is the WHOLE body.** The three doors' first statements were a `_reserve_op`
idempotency reservation (the creator) and a `clara._human_ctx(role_rank('admin'))` ladder (both
deciders). Raising ahead of either is deliberate: a retired door must write nothing at all, and a
reservation is a write. A caller replaying a retired `op_key` therefore meets the same refusal
every time rather than a cached receipt — the lane has no state left to be idempotent about. The
cost is named rather than hidden: the deciders no longer distinguish "not an admin" from
"retired", and the creator no longer distinguishes "not a prior GL" from "retired". That is what a
retirement means — the answer does not depend on the request.

**What survives, and why each one had to.**

- `clara.cancel_seeding_batch` and `clara.complete_seeding_batch` are **byte-unchanged**, pinned in
  the prestate and re-pinned in the tail. A batch left open at the moment of retirement must still
  be closeable by the firm that owns it; retiring the closers would strand its history open
  forever. `seeding-lane-retired.test.mjs` drives both on a planted pre-retirement batch.
- Every READ of a batch or a proposal, both relations, their policies and their grants. This file
  deletes no batch, no proposal and no published wiki page.
- `packages/runtime/lib/wiki-projection.mjs`'s `seeding.proposal_decided` lane. A hosted firm's
  HISTORICAL ticked proposals still replay into deterministic wiki pages; the lane simply never
  receives a new event again.

**The queue splice, and its named residual.** §C is the NINTH splice of `clara.list_review_queue`
(after 0017, 0036, 0041, 0043, 0146, 0168, 0180, 0260) and the FIRST that removes a row kind. It is
boundary-anchored — cut between the CTE's own opener and the next CTE's, with a gravestone comment
in its place — because the block being removed is thirty lines of prose no migration should have to
re-type in order to delete. The ELEVEN pre-splice row kinds are witnessed in code AND cross-checked
against the raw text (0260's HIGH-1 guard), and the TEN survivors are re-witnessed after. The
residual: the three columns that CTE alone ever populated (`client_name`, `batch_ids`,
`open_proposal_count`) STAY in the shared column vector and are now null on every row. Dropping
them would mean recutting all ten surviving CTEs and the row-json builder — a far wider change to a
body ten other row kinds share — for no behavioural gain, and it would move a 31-key row shape that
two independent test rosters and the web's `ReviewQueueRow` type all restate.

**Why the whole registry's version rises for seven rows.** The registry's own executable law is
`count(distinct registry_version) = 1` over all 240 rows — asserted by
`document-capability-registry.test.mjs` and, since #846 (0244), by a `DEFERRABLE INITIALLY
DEFERRED` constraint trigger that judges the transaction on what it LEAVES. A seven-row raise would
leave two versions and be refused. §D therefore corrects the content and then raises every row by
one, by UPDATE, never DELETE-then-INSERT. **The version is measured, not pinned**: ticket 1012's
own sequencing note says these rows share a monotone wall with #782 and #990, so the prestate
asserts uniformity and a floor (`>= 3`), remembers what it measured, and the tail asserts exactly
measured + 1. On this lane's database that is 3 → 4.

**Redo-safe (#957), and bimodal by construction.** Every pin on a body this file RECUTS succeeds on
either branch: FIRST APPLY (the live body is the measured pre-image, pinned by sha) or REDO (the
live body already carries this file's own `seeding_lane_retired` marker). §C recognises "already
spliced" from the live body and skips itself; §D recognises its own limits and skips itself, so a
redo never raises the registry version twice. Because `CLARA_MIGRATION_REDO` can only ever exercise
the second branch, the FIRST branch was proven by hand on the lane rig: the three pre-images were
restored, the file was re-applied, and §A took the pinned-sha arm — see the ticket report for the
transcript.

## 0290 — a table CHECK proves the field_path grammar at every writer, including a raw insert (#857)

`0290_document_regions_field_path_check.sql` closes AC2 of #857, the half wave-1 (PR #1025,
`ddb5a125`) explicitly left open. AC1 shipped there: `scripts/check-document-region-field-paths.mjs`
is a repository LINT, scanning `packages/{db,runtime}/tests` for a `field_path` literal outside
0191's grammar and refusing at commit time. A lint cannot see a value assembled at runtime, and it
runs only when someone runs it; `clara._assert_field_path` (0191) is the runtime grammar, but it
was reachable from exactly ONE writer, `clara.persist_document_extraction`'s region loop, so any
RAW `insert into clara.document_regions` — which is most of the 71 the ticket's own triage
counted — never ran it at all.

0290 mints `clara._field_path_conforms(text) returns boolean`, an IMMUTABLE boolean sibling that
does nothing but `perform clara._assert_field_path(p_path); return true;`, and adds
`ck_document_regions_field_path_grammar check (clara._field_path_conforms(field_path))` to the
table. Because a CHECK's boolean expression may call any function, and a function that RAISES
instead of returning propagates its exception unchanged, an insert that fails this CHECK is
refused with `_assert_field_path`'s own typed `(CLR10, detail.reason)` — never Postgres's generic
`23514 check_violation` an inline regex CHECK would have produced. The sibling is deliberately
UNGRANTED to every application role: `clara.document_regions` carries exactly one role with
INSERT, `clara_fn_owner` (every application writer reaches the table through a `SECURITY DEFINER`
function it owns), and an object's owner may always execute a function it owns regardless of ACL,
so the CHECK fires on every real writer with no GRANT at all — the same disposition #984's 0239
(`_admit_opening_work`) and #960's 0270 (`_firm_document_limit_ceiling`) carry, so no
`packages/db/tests/rig-meta.mjs` cohort is owed (see the "#857 [0290]" comment there).

**The two plural literals are untouched, by construction.** `opening_tb.line` and `prior_gl.line`
(0201's own two partial-unique-index exclusions) are ordinary registered-namespace paths as far as
the grammar is concerned. A CHECK is evaluated once PER ROW and carries no uniqueness concept, so
a forty-row trial balance at ONE `(extraction_id, field_path)` is forty rows each independently
passing the same per-row test a single invoice fact passes — proved live, with a REAL forty-row
insert, in `packages/db/tests/document-regions-field-path-check.test.mjs`.

**An empty table is a lawful apply state, and the row count is measured, not refused.** Every
fresh database starts with zero regions: CI's `db-estate-suite` deploys main's chain and then HEAD's
onto a throwaway `clara_ci` BEFORE anything seeds, `frontier-leg` migrates a fresh service
database, and the integrator's from-scratch chain runs on a disposable cluster. An earlier draft of
0290 RAISED on a zero-row `clara.document_regions`, which made it unappliable on all three
(SPEC-L08-01, riders wave 3 lane 08); the prestate now reports the count in a NOTICE — the same
shape 0291 beside it uses — and the tail takes an EMPTY branch that proves the same three claims
through the CHECK's own expression (`clara._field_path_conforms`) rather than through a raw insert
it has no FK-satisfiable row to make. Which branch ran is stated in the tail notice. The wall's
POPULATED-row proof does not live at apply time at all: it lives in
`packages/db/tests/document-regions-field-path-check.test.mjs`, which seeds its own regions and
drives eight raw inserts through the CHECK. On the lane database the rig happened to be populated
first — a preparatory script called `clara.persist_document_extraction` three times (THROUGH the
real writer door, never a raw fixture insert), leaving 14 rows across 10 distinct `field_path`
values, including five `opening_tb.line` rows from one real trial balance — so the tail took its
POPULATED branch there. What the prestate DOES still refuse is a stored value the new CHECK would
reject, named row by row. `packages/db/deploy/0290-field-path-check-census.sql` is the read-only
preflight a release session runs on hosted first — the SAME predicate the prestate itself
re-checks, so "census says clean" and "the migration will apply" can never disagree.

**Redo-safe by construction (#957).** S1 is `create or replace function`; S2 is an unconditional
`drop constraint if exists` before `add constraint` — never a guard-by-name, which would skip
re-adding a body an edit changed. The prestate accepts two starting states, wholly absent (first
apply) or wholly present (redo), and refuses only a half state.

## 0291 — a bank-statement line can name its source citation, on the machine intake lane only (#990)

Owner's ruling, 2026-09-20: build the per-line page/region citation now, overruling #990's own
"accept the gap" recommendation (the #782 precedent this ticket's triage drew on). #990's Agent
Brief describes "the OCR lane" as running two Azure readers under two engine ids — 0038's ORIGINAL
design; the LIVE lane (`statementFacts_v3` → `persist_statement_facts_v2` →
`clara._persist_statement_core_v2`) has since moved to the witness pair (two engine KINDS sharing
one engine_id, 0098 §3.7/§3.9). "The OCR lane" in this section means `ingest_mode IN ('ocr',
'witness')` — the core's own `v_two` flag — which is what the function actually gates its two-reader
ladder on; the CSV/structured and hand-keyed lanes go through the untouched ancestor
`clara._persist_statement_core` and never reach this column at all.

`clara.bank_statement_lines` gains three nullable columns, all-or-nothing by CHECK:
`citation_extraction_id` (FK into `clara.document_extractions`), `citation_page` (a 1-based printed
page number) and `citation_region` (an opaque jsonb locator this table does not interpret, matching
`clara.document_regions.locator`'s own posture). `citation_extraction_id` is NEVER caller-supplied —
`clara._persist_statement_core_v2` stamps it with `v_ext1`, the `document_extractions` row the SAME
transaction just banked reader1's own read into, so "which stored extraction it came from" is a fact
the core proves about itself. The citation itself is read RAW off `p_payload #>
'{readers,reader1,lines}'` — never through `clara._stmt_lines_norm` (untouched; it is a strict
five-key allowlist that would otherwise silently drop `page`/`region`) — and joined back onto the
chain-proven line set by `line_no`, a join that is provably 1:1 because `_stmt_lines_norm`'s own
contiguous-1..N proof guarantees one raw element per persisted line. A citation supplied on a lane
with no second reader (structured/human) is refused as a runtime wiring error, mirroring the
function's existing sibling guard for a stray reader2 read; a malformed per-line shape (a page with
no region, or vice versa) is refused whole-statement.

**Why not a `clara.document_regions` row.** 0191 §S5 reserved a `statement` field_path namespace for
exactly this future producer, which reads as an invitation — 0291 declines it. A `document_regions`
row's `field_path` identifies which FIELD a value answers; a bank statement line is a table row this
estate already persists in full (`clara.bank_statement_lines`), so minting a region row per cited
line would duplicate storage and would additionally have to clear #857/0290's brand-new
`ck_document_regions_field_path_grammar` CHECK for a namespace no producer yet uses. Three plain
columns say the same fact without borrowing a wall built for a different shape of evidence; the
`statement` namespace stays reserved and untouched.

**Why no `packages/runtime` file changes.** Every module on the live statement-witness path —
`statementFacts.v2.{dispatch,behavior,impl,prompts}` and `statementFacts.v3.{behavior,header,impl,
prompts}` — is a FROZEN workflow body or a module in its frozen closure. Actually asking the witness
model for a per-line citation index and mapping it back to a region (the mechanism
`clara.witness_citation_regions` / `readStatementWitnessCitationRegions` already exists for — its own
header states in so many words "no citation is asked back") needs an edit to that frozen prompt/
behavior pair; #990's ticket report carries that edit as a successor contract. What ships here is the
plumbing a future, unfrozen runtime change can populate without a second migration.

`clara.get_bank_line_matching_context` (the Matching tab's own detail-pane door) is recut to add
`citation_page` to the `line` object it already builds from `l.*` — a one-line addition since `l` is
already `bank_statement_lines%rowtype`. `citation_region` is deliberately NOT surfaced to this read:
a raw polygon locator is not something the Matching tab renders (out of scope, per the ticket: "OCR
region-detection accuracy itself").

**Populated rows, not an empty table.** `clara.bank_statement_lines` started EMPTY on a freshly
migrated+seeded rig, so the live proof of the new guard/join/CHECK runs in
`packages/db/tests/bank-statement-line-citation.test.mjs` (cells 990.a-e), driven through the real
writer door (`clara.persist_statement_facts_v2`) immediately after the migration applies, never a
raw fixture insert.

**Redo-safe by construction (#957), the bimodal-pin trap named and avoided.** S1 (`add column if
not exists` / unconditional drop-then-add for its constraints) is safe to re-run unconditionally.
S2/S3's textual splice is NOT re-run on a redo — the first-apply anchor text no longer exists in an
already-recut body — so the prestate instead proves, on the redo branch, that the live bodies already
carry this file's own citation markers, and S2/S3 skip with a `NOTICE` rather than re-searching for
an anchor that would never be found.

## 0292 — a default depreciation policy applies only while it still fits its enrolment (#932 fix round, riders wave 3 lane 04)

`0292_fa_policy_enrolment_congruence.sql` closes the blocker the lane's adversarial review drove
(ADV-L04-1). `clara.set_fa_depreciation_policy` refuses every method but `none` on a
NON-depreciable enrolment (0277 §B), but that is a wall at SET time only, and
`clara.upsert_fa_account_profile` is version-forward and reads no policy (0277 pins it unmoved, and
so does this file). ONE ordinary re-enrolment with `accum_depr_account_code = null` therefore left a
`straight_line` policy live; the next acquisition was born COMPLETE from it while taking its
accumulated and expense codes from the NEW profile — i.e. NULL. `clara.preview_depreciation_run`
then offered two legs with `account_code: null` and `clara.run_depreciation_manual` died on an
untyped `23502` (`journal_lines.account_code`), which no door can rescue —
`complete_fixed_asset_particulars` refuses `fa_particulars_already_complete` and
`revise_fixed_asset_particulars` refuses the `depreciation_method` key — and which
`packages/runtime/lib/reconciler-fa.mjs` isolates per client, silently stopping that client's
depreciation for good.

**The change is one line in each of the two birth sites**, plus the comment that names it: the
policy-covered branch is entered only when `not (l.accum_code is null and v_pol.method <> 'none')`.
A declined policy falls through to 0247's own UNCOVERED branch, so the row births exactly as an
uncovered non-depreciable acquisition does — method `none`, no start date, no provenance, the
"particulars pending" description — and a person is asked, which is what the estate already does
for every account carrying no policy at all. The enrolment door keeps accumulated and expense a
PAIR (`0041:2785-2789`), so the accumulated code alone decides it.

**Why a separate file rather than an edit to 0277.** 0278's prestate pins 0277's post-image of
`clara._tf_fa_acquisition_birth` by `sha256(prosrc)` and accretes onto its 842-character comment,
and #957's redo path re-applies only the HIGHEST applied version — so editing 0277 in place would
have broken 0278's prestate on a from-scratch chain and could not have been re-applied to the rig
at all. The number is provisional and claimed at MERGE; the battery gates on the stable stem
`fa_policy_enrolment_congruence$`.

**Shape.** Prestate pins both recut bodies at their measured 0277 post-images
(`c2c62b29…`, `ea7499ae…`) with a redo branch keyed on this file's own marker, pins four bodies it
does NOT touch (`clara.upsert_fa_account_profile`, `clara._fa_particulars_complete`,
`clara.set_fa_depreciation_policy`, `clara._fa_asset_json`), and hashes the birth's catalog comment
at 0278's own 1553 characters before accreting one sentence onto it. The tail re-reads both bodies
for the guard marker AND for every marker 0277's own tail pinned (0247's four exclusions, the #972
watermark, the single conflict-targeted insert, both description literals, the three untouched arms
of `clara._fa_on_approve`), proves the UNGUARDED form is gone from both, re-checks
owner/definer/search_path/ACL and the deferred trigger's binding, and re-reads the four unmoved
bodies. It creates no relation, mints no function and moves no grant, so it owes no `rig-meta.mjs`
cohort (0278 makes the same claim for the same reason) and no
`apps/web/tests/firm-scope-db-pins.corpus.ts` barrier entry — it contains no dynamic SQL at all.

**Cells.** `p932.drift` in `tests/fa-depreciation-policy.test.mjs`, gated on this file's own stem
through `gate932c` (`tests/fa-depreciation-policy-fixtures.mjs`) and
`tests/fa-policy-enrolment-congruence-preintegration-gate.mjs`: set a `straight_line` policy,
re-issue the enrolment as non-depreciable through the real door, acquire, and see the row born
pending with no provenance — then drive `liveAuthority` + the due ladder and see no `23502`.

## 0293 — a materiality judgement licenses the figure it was made about (#975 fix round, riders wave 3 lane 04)

`0293_fa_arrears_judgement_scope.sql` closes three defects the lane's review drove against 0279.
0279 asks the right question; what it got wrong is the answer's SCOPE. It recuts exactly two
bodies — `clara.record_fa_arrears_resolution` and `clara._fa_run_period_core` — and contains no
dynamic SQL at all.

**(1) A judgement about one amount authorised folding any later amount** (ADV-L04-2 blocker,
SPEC-975-2). The record door already enforces "a materiality judgement is made ABOUT an amount": it
re-measures the year and refuses CLR37 `arrears_changed` when the figure moved between the question
and the answer. `clara._fa_run_period_core` applied no such test at FOLD time — it read the
CURRENTLY measured arrears and the STORED choice and never compared them. DRIVEN: a `fold_current`
recorded about 10,000 sen proceeded to fold 20,000, and the receipt named the very record whose own
stored figure was 10,000. The guard now splits the affected years THREE ways — no live resolution,
a live resolution made about a different figure, or a `reopen_prior` at the figure that still
stands — and the middle bucket refuses (or parks) on its own reason
`arrears_changed_since_judgement`, naming `judged_cents` and `arrears_cents` both. AC2's "a later
run proceeds on the record without asking again" is untouched for an unmoved figure, which is what
AC2 is about.

**(2) The refusal stated the client-wide TOTAL as the named year's amount** (ADV-L04-3,
SPEC-975-1). 0279 raised and parked with the sum over every closing/closed year carrying arrears —
including years already answered — while naming only the first unresolved year. It compounded: the
record door re-measures PER YEAR, so a caller answering with the number the refusal had just stated
was refused `arrears_changed` and the run stayed blocked. The web panel escaped it only because it
passes its own per-year figure. Every sentence and every `detail.arrears_cents` now carries the
NAMED year's own amount, and the client-wide total rides beside it under `total_arrears_cents`.

**(3) `reopen_prior` was admitted on a year that is only CLOSING** (ADV-L04-4).
`clara._tf_fiscal_years_lifecycle` admits `open|reopened → closing`, `closing → open|closed` and
`closed → reopened`; there is no `closing → reopened` edge, and `clara.reopen_fiscal_year` is the
`closed → reopened` verb. DRIVEN: the judgement was admitted, the run then refused
`arrears_awaiting_reopen` with remedy `reopen_fiscal_year`, and that remedy's own write was refused
CLR10 `fy_lifecycle_edge_invalid`. The record door now refuses `reopen_prior` while the year is
still closing, on its own axis `year_still_closing`, naming `clara.finalize_close`. `fold_current`
stays open on a closing year: this refuses one unreachable remedy, never the question. The run core
also derives its awaiting-remedy from the named year's own status, for the one path that can still
reach a closing year carrying a live `reopen_prior` (`closed → reopened → closing` after the
judgement was made).

**Not touched, and pinned in both the prestate and the tail:** `clara._fa_closed_arrears` (the
arithmetic was never wrong — only the scope the refusal quoted it at), the due oracle, the preview,
both run verbs, the Work lane's run door, `clara._fa_assert_period_open`,
`clara.reopen_fiscal_year` and `clara.finalize_close`. It mints no function and moves no grant, so
it owes no `rig-meta.mjs` cohort, and being free of dynamic SQL it needs no barrier entry in
`apps/web/tests/firm-scope-db-pins.corpus.ts`. Its ACL section is three literal statements rather
than 0279's bulk `execute format` loop, for exactly that reason.

**Cells** (`tests/fa-arrears-resolution.test.mjs`, gated on the stable stem
`fa_arrears_judgement_scope$` through `gate975b` and
`tests/fa-arrears-judgement-scope-preintegration-gate.mjs`): `p975.two_years` builds the first
TWO-closed-year state the battery ever had and answers the first year with the number the refusal
stated; `p975.stale.park` drives the swept lane over a moved figure; `p975.closing_reopen` drives
the closing-year refusal and then shows `fold_current` still admitted; and `p975.fold`'s later-run
segment — which previously MEASURED the silent larger fold — now drives the re-ask and the
re-judgement.

**Why a separate file rather than an edit to 0279.** #957's redo path re-applies only the HIGHEST
applied version, and 0279 is no longer it. The number is provisional and claimed at MERGE.

## 0295 — the wave-4 chart pre-step: four standard-chart rows, minted as a new template version (#941/#942/#946/#949)

`0295_wave4_chart_rows.sql` is the ONE migration wave-4's deferred-revenue (#941),
accrued-income (#942), payroll-posting (#946) and tenancy-rent (#949) lanes share: it lands the
standard-chart rows all four name, alone, before any of those lanes is cut, so every lane
resolves the accounts by name and none of them inserts its own. Codes and rulings (owner,
2026-09-20; `gh issue view <n> --json body,comments`): `2030 Deferred Revenue` (liability, #941),
`1180 Accrued Income` (asset, SHARED by #941 and #942 — Clara suggests it by default, the
accountant may pick another suitable active, non-control asset account), `Salaries Payable`
(liability, #946, "an ordinary liability with no class") and `Rent Payable` (liability, #949,
"not 2010 Other Payables and not 2020 Accruals... so each month's unpaid rent is visible on its
own"). 2030 and 1180 are the rulings' own literals; this file chose `2040 Salaries Payable` and
`2050 Rent Payable`, continuing `trade_payables`' own contiguous 2000/2010/2020/2030 run, next to
the rows they sit beside — a band this file's own prestate measures empty before choosing it.
`1180 Accrued Income` joins `trade_receivables` at `sort_ordinal 45`, between `1130 Prepayments`
(40) and `1190 Allowance for Doubtful Debts` (50).

**Why a new template VERSION, not a new row on v1.** MEASURED on the rig, not asserted: inserting
a fifth account against the live, published `my_sme_starter` v1 raises `CLR08 "coa template <id>
is published, not a draft -- its families and accounts are frozen"` from
`t_coa_template_accounts_freeze` / `clara._tf_coa_template_child_freeze()` (0150:604-663) — D-2's
own promise that a published template's content, and the hash over it, never move again.
Disabling that trigger to write into v1 directly would falsify `content_sha256` for every past
reader who trusted it and would turn `coa-template-pr-a.test.mjs`'s C1/C2 ("the seed's structural
invariants — 42 families / 142 accounts") into a description of a moving target instead of 0150's
own fixed artifact. `clara.coa_templates.version` and
`uq_coa_templates_platform_version (template_key, version) where scope='platform'` exist for
exactly this case, so 0295 mints `my_sme_starter` **v2**: `INSERT ... SELECT` copies v1's 42
families and 142 accounts verbatim (the same shape `clara.fork_coa_template` itself uses,
0150:889-899), the four new accounts are appended, and the row is published with a raw
`UPDATE ... SET state='published', published_at=now(), content_sha256=...` — exactly how 0150
published v1 (0150:1649-1652), because `clara._coa_template_for_edit` refuses ANY edit of a
platform-scope template by name (`platform_template_not_editable`) whether it is v1 or v2. v1's
CONTENT is never touched — this file issues no INSERT, DELETE or content UPDATE against its own
rows — so `coa-template-pr-a.test.mjs`'s C1–C5 and its J4 field-by-field comparison against the two
research dossiers keep testing 0150's own fixed artifact. `coa-template-pr-a-helpers.mjs`'s
`platformTemplate()` had no version filter — nothing needed one while only one platform row ever
existed — so this migration adds the one line `and version = 1` to it, in the same commit.

**v1 is RETIRED, in the same migration** (orchestrator ruling 2026-09-24 under the owner's standing
delegation, recorded on #941, answering the review finding that the four rows were reachable but
not delivered). Two PUBLISHED starters carry the identical title
`Malaysian SME Standard Chart of Accounts (starter)`; `clara.list_coa_templates` orders by version
ASCENDING (0150:1286) so the 142-account v1 renders ABOVE the 146-account v2 in
`ApplyStandardChartControl`, nothing preselects either and nothing marks one as current — a
bookkeeper who picks the first familiar option gets a client whose chart has NONE of the four rows
all four wave-4 lanes then resolve by name. `update ... set state='retired', retired_at=now()` is
the one transition `clara._tf_coa_template_freeze` admits out of `published` (0150:624-630) and it
moves no content: neither `get_coa_template` nor `list_coa_templates` filters on state, so every
firm that adopted v1 still reads exactly what it adopted and `listPublishedCoaTemplates`
(`apps/web/lib/onboarding/coa.ts:137-149`) simply stops offering it. The UPDATE is conditional on
`state='published'`, which is what makes the redo branch a no-op for v1 (a retired template is
immutable, so the redo cannot and must not put it back).

**What retiring v1 costs, measured.** Two doors refuse a template that is not published:
`apply_coa_template` rung 4 (0156:768, `template_not_published`) and `fork_coa_template`
(0150:869-872, `source_not_published`). The two batteries that DRIVE those doors against the
platform starter move to the published one in the same commit — `coa-template-pr-b-helpers.mjs`'s
`platformStarter()` now reads the highest PUBLISHED version (its expectations all come from the
template itself, via `expectedChartMap` / `coreFamilies`, so the battery follows the shipped
starter), and `coa-template-pr-a.test.mjs` keeps `platform` pinned to v1 for its content census
while a new `publishedPlatformStarter()` handle feeds its twelve fork sites and its two
fork-count assertions read the source's own counts instead of the literal 142.
`dba-coding-lane-classification.test.mjs` already reads
`... where state='published' order by version desc limit 1` and needed no change. No migration
between 0150 and 0294 is affected: 0156 is the only other file naming `my_sme_starter`, it asserts
v1 published in its own prestate (0156:283-297), and it runs long before 0295 in the ladder.
`apps/web`'s two `list_coa_templates` fixtures (`onboarding-amend-and-chart.test.tsx:248-254`,
`e2e/agentic-finish-mock.mjs:336-345`) each model a ONE-row published list, which is what the
estate now ships again; no cell asserts the version they carry, so neither was changed.

**Existing clients are not touched, by construction.** A client's chart
(`clara.coa_accounts`) is copied once, at `apply_coa_template` time, out of whichever
`template_id` the caller names (0156's own "copy-not-reference" header); no door in the estate
re-syncs an already-planted chart against a template afterward — MEASURED: no
publish-template-row-to-existing-clients mechanism exists anywhere in `packages/db`,
`packages/runtime` or `apps/web`, and none of the four rulings asks for one, so none is invented
here. A client who already adopted v1 keeps exactly the chart they were given; a NEW client
reaches the four rows through the unchanged `list_coa_templates` / `apply_coa_template` doors, and
since v1 is retired the ONE starter those doors offer is the one that carries them.

**A new version carries FOUR tiers, not two.** `clara.coa_template_entity_overrides`
(0156:388-412) is a template's third child tier and it is keyed by `template_id`
(`primary key (template_id, entity_type, account_code)`), with 0156's two reviewed society rows
seeded against v1 only (`... and t.version = 1`, 0156:443-459). A version that copied only the
families and the accounts would ship a chart whose society variant is GONE — a society client on
it is planted BOTH `3040 Accumulated Fund` and an un-relabelled `3900 Retained Earnings`, the
two-accounts-one-name defect 0156's seed exists to discharge. 0295 therefore copies that tier too,
verbatim (the `basis` text travels with each row), after the accounts because
`fk_coa_override_account` references `coa_template_accounts(template_id, account_code)`; the tail
proves v2's census EQUALS v1's row for row (a symmetric `except` in both directions, not a count).
The tier does not enter `clara._coa_template_content_sha256`, which hashes families and accounts
only, so the copy leaves v2's published hash unchanged. `coa-template-pr-b.test.mjs` §5.2's
restore assertion moved from a global `count(*) = 2` to a per-template count in the same commit:
a global census is satisfied by a version that carries none of them, which is precisely the
omission this review caught.

**No rig-meta cohort is owed.** This file mints no relation, no function, no role and no grant —
four INSERTs and one UPDATE against tables 0150 already created — the same claim 0278 and 0292
make for the same reason. A template row is data, not a name a cohort would track.

**Redo (#957).** The prestate detects an existing `my_sme_starter` v2 (this file's own marker,
since a data-only migration has no `prosrc` to embed one in), decides FIRST vs REDO from it before
it judges v1's state, and on the redo branch tears v2's rows down — entity overrides FIRST (the
composite `fk_coa_override_account` points at the accounts), then accounts, families and the
header, with the three freeze triggers disabled for exactly those statements and re-enabled
immediately in the same transaction (precedent 0227:346-348, 0176:261-266, 0184:406-408,
0007:831-853). v1 is admitted `published` OR `retired` on the redo branch and only `published` on
a first apply, because a retired template is immutable and the redo cannot put it back; the
retirement UPDATE is conditional so it matches zero rows there. A second apply after a redo is
therefore byte-identical for v2 — measured across four redos, `content_sha256` is
`6a36ad00be8c20c231740f89f4308729b0b540c1c2ca8fe2878c979696b7b4ef` every time, the surrogate uuid
and the timestamps being the only things that differ and nothing pinning those — and a no-op for
v1.

The redo refuses outright if v2 already carries a client adoption. **On a lane database that is
expected, not exceptional:** `wave4-chart-rows.test.mjs` S3/S5 and
`dba-coding-lane-classification.test.mjs` all plant real adoptions of the CURRENT published
template, so after any battery run the rig's own adoption rows must be deleted before a redo (the
refusal message says so). On a database carrying real client data, do not redo at all.

**Why v1's stored `content_sha256` is NOT pinned as a literal — and what is pinned instead.** A
published template's `content_sha256` is **collation-dependent**, so it is not a portable pin.
`clara._coa_template_content_sha256(uuid)` (0150:763-785) canonicalises with `order by
f.family_key` and `order by a.account_code` — plain TEXT ordering, which takes the database's
default collation. Under `C`/`C.UTF-8` an underscore (0x5F) sorts before every lowercase letter;
under glibc's `en_US.UTF-8` punctuation carries no primary weight, so the comparison falls to the
letters alone. `my_sme_starter` v1's 42 family keys contain exactly one pair this separates —
`tax_liabilities` and `taxation` — and that single swap reorders the `families` array the digest
covers. MEASURED, on the same from-scratch chain:

| server | `datcollate` | v1's stored `content_sha256` |
|---|---|---|
| CI's `postgres:17` container, and a local cluster made with `--locale en_US.UTF-8` | `en_US.UTF-8` | `673ede910a7a3bb5f0b3197cbda9bdf7cfa269eb0068a3bb3ac7d6655bf9262b` |
| every rig cluster here, and a fresh cluster made with `--locale C.UTF-8` | `C.UTF-8` | `d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df` |

The rows are identical on both and each digest reproduces from its own rows, so neither database is
corrupt — the digest is. 0295's first cut pinned the `C.UTF-8` value as a literal and stopped the
chain on CI (run 35954298990); hosted Supabase is `en_US.UTF-8` too, so it would have stopped the
hosted migrate for the same reason. What 0295 pins now is a **structural digest**:
`pg_temp.p295_struct_sha256`, which is 0150's own canonical jsonb field for field with `collate "C"`
written onto both ORDER BYs, hashed by `clara._hash`. `C` is a built-in collation defined by code
point, so the value is the same on every server by construction — measured
`d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df` on both clusters above. The
stored digest is still checked twice, but only against values the transaction itself measured: the
prestate proves it reproduces from v1's rows through 0150's own helper, and the tail proves it is
still the value the prestate read, carried in the temp table `_p295_pre` (the 0289/0291/0261 idiom)
rather than re-typed. v2's hash is computed at seed time on the target server and pinned nowhere.

**The general rule this file now follows.** Any digest taken over ROW CONTENT that is ordered by a
text expression must spell `collate "C"` on that ORDER BY before its value is pinned as a literal;
otherwise the pin records the server's `lc_collate`, not the data. Digests over a function body
(`prosrc`, `pg_get_functiondef`) or over a migration file's bytes are unaffected — no ordering is
involved. Several files in the ladder already write `collate "C"` for exactly this reason
(0090:1105, 0092:575, 0093:296, 0099:576, 0100:673, 0101:1005, 0221:279).

**Cells** (`tests/wave4-chart-rows.test.mjs`, gated on
`tests/wave4-chart-rows-preintegration-gate.mjs`): S1 reads the four rows absent from v1 and
present on v2 by code/name/type/family/flag; S2 reconstructs the world before 0295 inside a
rolled-back transaction — v1 put back to `published`, a freshly-born client (through
`clara.create_client` + the onboarding commit door) planted off it through the real
`apply_coa_template` — shows none of the four codes land, and then checks the rollback restored
the retirement; S3 drives the same doors against the CURRENT published template and shows all four
land with the right types and no control-account flag; S4 shows none of the four codes collides
across every `scope='platform'` row in `clara.coa_template_accounts`; S5 drives a SOCIETY client
through the same doors and shows 3900 relabelled `Accumulated Fund` and 3040 absent, with the
override census equal to v1's row for row; S6 drives `clara.list_coa_templates()` through a real
firm session and shows exactly ONE published `my_sme_starter` row — version 2, 146 accounts — with
v1 retired, unmoved at 42/142 and still carrying 0150's own content: the battery pins the
collation-independent structural digest and separately asserts that v1's stored `content_sha256`
still reproduces from its own rows, never the stored value as a literal (see the collation note
above). Each carries its own vacuity control (a rolled-back mutation of the exact fact under test).
The battery is proven on both collations: all six cells pass against a `C.UTF-8` database and
against an `en_US.UTF-8` one built from the same chain.

## #945 — a payroll summary is read the way an invoice is read (0296)

`0296_payroll_summary_typed_facts.sql` is the READING half of #926's owner ruling (2026-09-18,
option G: "a payroll summary and a contract go down the same lane as any other accounting
document, read and posted, not merely stored"). It supersedes two standing exclusions by name —
mainline #612's Out-of-Scope third bullet and #643's acceptance criterion, both of which excluded
"first-class payroll-document ingestion" — for the reading half only. Full payroll processing
(employee masters, statutory rate tables, per-employee durable records) stays out, and this file's
own walls are what keep it out.

**Deploy order: DATABASE FIRST, RUNTIME SECOND.** The persist door validates the answer envelope
against `clara._payroll_answers_ok`, so a runtime image answering a WIDER questionnaire than the
live validator admits would be refused on every persist and the lane would bank nothing. In the
other order the router's new lane simply queues tasks that the pre-#945 reconciler declines to
dispatch (an unknown lane is never fallen through to `documentIngest`) and the image that lands
second drains them. Between the two, the only behavioural change on a payroll summary is that the
router stops minting `failed/skipped_kind` and mints `queued` instead — no extraction, no region,
no fact, no event, no journal effect.

**Seven parts.**

1. **The field-path namespace.** `clara._assert_field_path` (0191) gains ONE entry, `payroll`,
   beside the five other fact families. Its boolean sibling `clara._field_path_conforms` (0290,
   #857) is byte-untouched, so the `clara.document_regions` CHECK and the persist boundary stay on
   one grammar.
2. **The answer vocabulary.** `clara._payroll_answers_ok(jsonb, text)` — its OWN closure, never an
   arm of `clara._witness_answers_ok`, because a versioned workflow may not couple its shape to
   another family's frozen files. Eleven run-level questions (the month plus the nine statutory and
   pay totals, mapping one-to-one onto codes 0150 already seeds: 2100/2110/2120/2130/2140 and
   6000/6010/6020/6030/6040) and six per-employee cells. Every question is answered or the read is
   malformed; `not_printed` is a first-class answer, never a zero; an unknown key at any level is
   refused outright.
3. **The deterministic evaluator.** `clara.evaluate_payroll_run_state_v1(jsonb, jsonb)`: two channel
   envelopes in, one fact state out — the column sums over the quoted rows, each row's own
   gross-minus-deductions identity, the cross-check against a printed totals row where one exists,
   and the text-vs-vision comparison. IMMUTABLE, table-free and calling no other `clara` function,
   which is what keeps its `clara.evaluator_versions` closure at ONE member and the freeze
   meaningful (0140's own recorded reason). The rendering-to-cents rule is inline for exactly that
   reason: reaching for `clara._normalize_invoice_cents` would have dragged the F-A1 witness freeze
   in with it. Registered in the same file, `deployed = false` (the flip is a one-way ceremony act),
   and hand-inserted into `frozen-evaluators.json` so the change blesses ONE body.
4. **The router.** A `payroll_summary` pdf/image stops falling through to `skipped_kind` and enters
   `payroll_facts`, an LLM witness-pair lane of its own — never `llm_witness`, which is claimed BY
   LANE ALONE and whose regime `clara._invoice_fact_state` reads as an invoice corroboration. Five
   CHECK widenings (lane, lane-to-engine, error code, task binding, extraction engine kind), two
   registered and routed event types, and five surgical recuts, each produced by reading the live
   `pg_get_functiondef` and applying named substitutions: `_enqueue_invoice_facts_core`,
   `enqueue_invoice_facts` (so a payroll refusal is never a phantom invoice failure that wakes
   autodraft), `_tf_processing_task_update`, `claim_document_processing_task` and
   `release_held_document_tasks`. The lane holds the SAME typed `witness_extraction` consent the
   invoice and statement witness lanes hold, with its own named refusal codes.
5. **The persist door.** `clara.persist_payroll_facts(uuid, jsonb, jsonb, integer)` evaluates the
   pair BEFORE writing, then banks the two channels' run-level answers plus the fact state and
   STRIPS the per-employee quotes — no employee name or salary becomes a durable record. The tail
   proves that strip from the body's own bytes. One `clara.document_regions` row per run-level
   question, hung off the canonical text row, with the verbatim rendering, the DB's own integer
   cents where the two channels agreed on a readable figure, and a locator resolved through the
   estate's one region numbering. AN UNPRINTED ANSWER STILL GETS A ROW, carrying neither: that row
   IS the reading "the page does not print this".
6. **The fail verb.** `clara.fail_payroll_facts(uuid, text)`, `fail_witness_facts`' shape with the
   payroll lane's own admitted code vocabulary and its own lane-true event twin.
7. **The capability registry, re-derived.** `stored_only` on the payroll summary's typed-facts axis
   was DERIVED from the router's dead end (its own reason sentence said so), so removing the dead
   end and re-publishing are one change. Six pairs move — heic/jpeg/pdf/png/tiff/webp, exactly the
   mimes the router's payroll arm sits on — to `typed_facts = supported`, with the reason sentence
   rewritten and `limits` gaining #782's two-key shape for the per-employee detail.
   `business_operation` moves on NO row: #945 is the reading half, #946 the drafting one.

**Rig-meta cohort:** `PAYROLL_0296_COHORT` — the two granted doors, in their own cohort per the
"wholly present or wholly absent" rule. The evaluator and the vocabulary gate stay UNGRANTED to
every application role and the tail asserts it. #945 adds no human EXECUTE at all.

**Redo (#957).** Every recut body is `create or replace`, every constraint is dropped-if-exists
before it is added, every insert is `on conflict do nothing`, and the registry raise is a
SET-TO-LITERAL (`registry_version = 5 where registry_version <> 5`) rather than 0245's `+ 1`,
because a `+ 1` re-run would carry the registry past the version this file publishes. Every prestate
pin is BIMODAL: the pre-image sha OR a body already carrying this file's own marker. THE ONE THING A
REDO CANNOT REPLAY is the evaluator's freeze registration — `clara.evaluator_versions` is historical
and `clara.evaluator_version_members` is append-only, which is the point of a freeze — so that block
INSERTS when absent and, when present, RE-DERIVES the closure hash and refuses by name if it moved.
A redo after an edit to the evaluator body therefore fails loudly, and its only lawful repair is a
`_v2`.

**Cells** (`tests/payroll-summary-facts.test.mjs`, gated on
`tests/payroll-summary-facts-preintegration-gate.mjs`): S1 the namespace and the still-closed
roster; S2 the vocabulary gate (admitted shape, `not_printed`, every missing question, an unknown
key at three levels, an incomplete row, the channel receipt, a blank rendering, zero rows, a
duplicated row number); S3 the evaluator against a worked example whose arithmetic is done by hand
in the file — a payslip with a printed totals row, one without, one whose row does not balance, one
whose printed total contradicts the row sum, one whose channels disagree, one with an unprinted
HRDF line, one printed unreadably, and the single-member closure proof; S4 the router (the lane, the
idempotent re-fire, the consent gate, and every other kind's route unchanged); S5 the persist door
(the eleven regions including the not-printed one, the pair's own engine kinds, the replay, the
proof that no per-employee rendering reaches durable storage, and the four structural refusals);
S6 the capability read and the whole-registry republication.

## #946 — a payroll summary that was read and whose arithmetic holds posts itself (0297)

`0297_payroll_summary_posting.sql` is the DRAFTING AND POSTING half of the same owner ruling
(#926, 2026-09-18, option G). #945 read the payslip; this file turns what it read into an entry
and posts it unattended, or says why it did not.

**AC1 was already satisfied when this file was written, and it appends no chart row.**
`0295_wave4_chart_rows.sql` — the wave-4 pre-step that landed the four standard-chart rows
#941/#942/#946/#949 share, once, before those lanes were cut — already minted
`2040 Salaries Payable` (liability, no class, no statutory tag) as `my_sme_starter` version 2.
This file CONSUMES it by code and name. The other ten accounts it reaches are `0150`'s and are
likewise resolved by code: 6000 Salaries and Wages and 6010/6020/6030/6040 (employer
EPF/SOCSO/EIS/HRDF), 2100/2110/2120/2130/2140 (EPF/SOCSO/EIS/PCB/HRDF payable).

**The entry.** Gross to salaries and wages; each employer contribution the page prints to its own
employment-cost account; every statutory deduction — employee AND employer portions together — to
its own payable; PCB to its payable (employee side only; PCB has no employer half); the net to
2040. The employee's own EPF, SOCSO, EIS and PCB are deductions from gross, never a second
expense, which is exactly why the entry balances: gross minus those four equals net, 0296's own
row identity read at run level. A line the document does not print produces no leg at all — not a
zero one — and a printed `0.00` is the same answer for posting purposes.

**Why the database posts it and not an agent.** The gate DISCIPLINE is the invoice lane's: a
closed rung roster walked in order, every rung carrying an explicit verdict (a missing key is how
a gate fails open — the invoice lane's own D26 lesson), the first failure being the reason a
person is told, a refusal that commits so the reason is durable and writes no receipt, and exactly
one `clara.entry_post_receipts` row on a successful post. What is NOT reused is
`clara._agent_post_entry_core` itself: its rungs bind on `clara._invoice_fact_state` corroboration
anchored to `invoice.total`, on coding kinds, AR/AP control legs and counterparty identity — none
of which a payroll run has, so it would answer "no" for reasons unrelated to payroll. And no model
is needed: coding an invoice is a judgement, coding a payroll run is fixed by the statutory chart
and 0296's frozen evaluator has already done every sum. Putting a model in the loop would add a
guess to a lane whose whole promise is that it never guesses. The receipt says so: its
`model_snapshot` names the deterministic producer (`clara_db`), and `gate_verdicts` carries the
READING's own extraction and engine id so the model call that produced the facts stays reachable.

**The four bodies.**

| Body | What it decides |
|---|---|
| `clara._payroll_period_month(text)` | The payslip's own month, from the rendering the page printed. A CLOSED set of unambiguous renderings (`2026-08`, `2026/08`, `08/2026`, `2026-08-31`, `August 2026`, `Aug 2026`, `2026 August`); everything else — in particular any all-numeric triple, which cannot be told apart from its own reversal — returns NULL so the run is ASKED rather than posted on a guess. Locale-free (its own month array, never `to_date('Month YYYY')`), which is what makes it honestly IMMUTABLE. |
| `clara._payroll_entry_plan(uuid, jsonb)` | THE DRAFTING BODY. A fact state plus this client's chart in, the entry out: every leg carrying the account it resolved and the basis it resolved from. It drafts from `established` facts ALONE — never from `computed_cents`, the row sum the evaluator offers when the page prints rows but no totals row, because re-judging a frozen evaluator's own verdict from outside its closure is what the freeze exists to prevent. Balance is EXACT: `_validate_entry_lines`' 5-cent rounding tolerance would hide the defect the gate exists to catch. |
| `clara._payroll_posting_verdict(uuid)` | THE GATE. Ten rungs: `filed`, `facts_read`, `channels_agree`, `arithmetic_holds`, `period_established`, `period_open`, `run_totals_printed`, `accounts_resolve`, `entry_balances`, `no_duplicate_entry`. It WRITES NOTHING (STABLE), and it carries the SENTENCE a person reads — so the queue renders that body's own words and the decision the lane took can never drift from what is on screen. |
| `clara._post_payroll_run(uuid)` | The post. Ready: one draft entry with its legs, the approval, the receipt, the `entry.posted` event. Blocked: nothing at all, and the verdict comes back. It RETURNS rather than raises, because it runs inside the read's own transaction and a raise would lose the facts a person needs in order to clear the block. |

**The duplicate guard (AC4) sees BOTH payroll lanes.** Four scopes, first match reported:
`same_document` (the estate's own `clara._document_posting_entry`, asked here so the answer is a
named refusal rather than the source-binding wall's raise at the write), `same_filing` (a live
draft or approved entry already on this filing), `same_month_payroll_run` (another document's run
already covers the month, read off this lane's own `flags->'payroll_run'` marker) and
`payroll_obligation` (the month was booked through `0194_periodic_adjustments.sql`'s lane, whose
own `flags->'payroll_obligation'` marker carries the period it covers — #946's triage note asked
for exactly this, and without it a client whose September obligation was booked that way would get
a second, conflicting entry the moment a September payslip was read). The refusal carries the
entry's id, date and memo, so a person can tell a correction from a re-upload without opening the
ledger. A reversed entry is not a duplicate: `reversed_by is null` throughout, so a reversal
re-opens the month.

**Why the marker is written at the draft insert.** `clara._tf_entry_immutable`'s draft→approved
allowset does not include `flags`, and its approved→approved allowset is the reversal pair alone,
so `flags->'payroll_run'` has exactly one moment in which it can be written. It sits on the same
footing as 0194's `payroll_obligation` marker (0225:1830): no gate reads it for permission, and an
entry that moved a statutory liability should say so on its face.

**Needs you (AC3).** `clara.list_review_queue` gains `row_kind='payroll_posting_blocked'`
(section `needs_you`, lane `needs_you`), spliced additively the way #974 (0260) added the
depreciation kind. The row is DERIVED from the verdict and stores nothing: it appears for a filed
payroll summary that has been READ and whose filing carries no live entry, and it clears itself
when the block clears — add the missing account, or post the run, and it is gone on the next read.
No dismissal act, no attempt table, nothing to reconcile. It coexists with the filing's own
`uncoded_filing` row, which is the brief's own model: AC6 says the summary "stops appearing as
uncoded once its entry exists", so before that it IS an uncoded filing and this row sits beside it
saying why. No `counts.*` key and no new json key are minted, so both `FULL_ROW_KEYS` rosters are
byte-unchanged.

**AC6 costs no mechanism at all.** The posted entry is a DOCUMENT entry bound to the filing
(`origin='document'`, `document_id`, `source_doc_sha256`, `filing_id`), and `list_review_queue`'s
`filing_rows` CTE already excludes a filing carrying a live draft or approved entry. The uncoded
row therefore disappears the moment the entry exists and comes back if it is ever reversed — with
no dismissal mechanism, exactly as the brief asks.

**The one widened constraint.** `clara.entry_post_receipts.via_wake_kind` gains `payroll_facts`.
Writing `autodraft` instead would have been the cheaper edit and a lie: no autodraft credential
exists for this post and an auditor reading receipts by lane would find payroll runs filed under
the invoice lane's name.

**No new granted object, so no rig-meta cohort** (0260's posture and its reason). All four bodies
are internals reached from `clara.persist_payroll_facts` (already `clara_runtime`) and
`clara.list_review_queue` (already `clara_authenticated`); the tail asserts each is owned by
`clara_fn_owner`, pins its `search_path` and is EXECUTE-reachable by no application role and not
by PUBLIC. #946 adds NO human door.

**Redo posture.** Every body is `create or replace`; the constraint swap is
`drop constraint if exists` then `add`; both splices (`persist_payroll_facts` and
`list_review_queue`) detect their own marker in the installed body and no-op with a notice, and
their postchecks re-read the COMMITTED catalog in BOTH branches so a redo proves them too.
`CLARA_MIGRATION_REDO=0297_payroll_summary_posting` was used repeatedly while this file was built.

**Cells** (`tests/payroll-summary-posting.test.mjs`, gated on
`tests/payroll-summary-posting-preintegration-gate.mjs`): S0 the standard chart's salaries-payable
row (evidence for AC1, already satisfied by 0295); S1 the drafting body against a worked example
whose arithmetic is done by hand in the file — the eleven-leg entry, an unprinted line and a
printed zero, the employee-portion treatment on both the figures and the bases, a missing account,
the nine admitted month renderings and the six refused ones, and a page with no totals row; S2 the
gate — the verdict re-read as DERIVED after the chart is fixed, channels disagreeing, a row that
does not balance, a printed total the rows contradict, a month that cannot be established, a chart
that resolves nothing, an unread document, a second upload of the same month, and an obligation
already booked through 0194's lane; S3 the unattended post — the approved entry with its legs, its
receipt, its event and no counterparty on any leg, a blocked run that writes nothing while keeping
its facts, and a closed fiscal year; S4/S5 the Needs-you row and the uncoded filing, both read
through the real `clara.list_review_queue`.

## #947 — find the net-pay payment on the bank statement and propose its settlement (0298)

`0298_payroll_net_pay_settlement.sql` is the SECOND half of #926's "always two steps" ruling
(question 4): #946 (0297) posts the run to 2040 Salaries Payable; this file finds the bank line
that pays it and lets a person accept the settlement. Blocked by #946 alone — there is nothing to
settle until a payroll entry posts.

**The shape is #657's own, reused, never re-invented** (WAVE-4 LANE RULE (c)). CONTEXT.md's
"Settlement candidate row": derived, stores nothing, offers candidates and never chooses, clears
itself the moment the underlying facts stop producing it. #657's pending bank line is its first
instance; this is the second.

**Why not `clara.settle_from_bank_line` (#655/#657's own composite).** MEASURED before writing a
line of this file: `clara._settle_from_bank_line_core` (0044:1706) requires a `p_counterparty`
whose `kind` is `customer` or `vendor` (`counterparties_kind_check`, 0015:160) and posts through
the AR/AP subledger composites (`clara.open_items.domain in ('ar','ap')`). A payroll run's net-pay
leg carries no counterparty — #946's own S3 cell proves it ("salaries payable is deliberately not
a control account") — so forcing one through that door would mean inventing a fictitious
counterparty to satisfy a domain check that does not describe what a payroll run is. #657's own
header declines to mint a second settlement door for exactly this reason ("#655 births the open
item, #657 allocates"); this file is in #655's own position (no subledger, and 2040 will never have
one) and mints the ONE settlement door a non-subledger liability needs.

**"Unsettled" is a ledger fact, not a marker.** `clara._payroll_net_pay_unsettled(p_client)` FIFO-
allocates every approved, non-reversed 2040 DEBIT — however it was booked — against every approved,
non-reversed `payroll_run`-flagged 2040 CREDIT, oldest run first. No new marker convention decides
"this debit settles that run": the row disappears the moment the account's own balance says the run
is covered, which is what lets AC3's three routes (Clara's own door, a person's own hand-booked
entry, a hand-booked entry reconciled through the ordinary `match_bank_line` door) all clear it
through the same read, with no dismissal mechanism of any kind.

**2040 is not payroll-run-exclusive, measured, not assumed.** A first cut of this file assumed it
was; its own prestate, run against the lane database, proved that wrong — #946's own duplicate
guard names a second lane, `0194_periodic_adjustments.sql` (#643), whose recurring-obligation
templates can credit ANY liability account a bookkeeper names, including 2040, flagged
`payroll_obligation`. Both the credit and the debit sides of the FIFO read exclude anything so
flagged: it is a different liability instance sharing the account by a firm's own bookkeeping
choice, never a payroll run's own net pay or a payment toward it. An unflagged 2040 leg belonging
to NEITHER lane is expected and correct once AC3's hand-booked routes (b)/(c) are in normal use —
the prestate/tail note it (informational only, never a refusal), a lesson this file's own redo
cycle taught it: a first cut refused any such leg outright and immediately refused its own battery's
"a person recorded it by hand" fixture.

**The window.** Candidates are offered within ten calendar days either side of the run's own
posting date (`c_window_days`, `clara._payroll_settlement_bank_candidates`) — generous enough for
an early run ahead of a public holiday, narrow enough to keep out an unrelated payment from a
different month. AMOUNT is never "within tolerance" (Q3/SYNTHESIS J2's own law from #657): a
candidate's signed cents must equal the negative of the run's own unsettled cents, to the cent, or
it is not offered.

**The five bodies.**

| Body | What it does |
|---|---|
| `clara._payroll_net_pay_unsettled(uuid)` | THE LEDGER READ. Per-client FIFO allocation, oldest run first. STABLE, ungranted. |
| `clara._payroll_settlement_bank_candidates(uuid,bigint,date,int)` | THE MATCH BASIS. Live, unspent, unexcepted bank lines at the exact negative amount, within the window. STABLE, ungranted. |
| `clara.get_payroll_settlement_candidates(uuid)` | AC1's granted read. bookkeeper+, `clara_authenticated` only. |
| `clara._settle_payroll_net_pay_core(jsonb,uuid,uuid,uuid,text)` | THE SETTLEMENT. Books Dr 2040 / Cr the bank's own COA for the run's own unsettled cents, approves it directly (`via_wake_kind='interactive'`, an ALREADY-admitted value — no CHECK widening owed), writes the receipt, then calls `clara._match_bank_line_core` DIRECTLY (the #655/#657 idiom: ctx threaded, never re-derived) to bind the new entry to the chosen line — literally "through an existing bank-side door" (AC2). Lock order: the pre-existing payroll entry first, the client advisory rung, the bank rows LAST (one frame further in, inside the reused core) — the estate's own law, unchanged. Ungranted. |
| `clara.settle_payroll_net_pay(uuid,uuid,uuid,text)` | AC2's granted door. bookkeeper+, `clara_authenticated` only. |

**Needs you (AC2's arm).** `clara.list_review_queue` gains `row_kind='payroll_net_pay_unsettled'`
(section `needs_you`, lane `needs_you`), spliced additively beside #946's own `payroll_rows` CTE.
`id`/`filing_id` carry the run's own filing; `entry_id` names the posted payroll entry itself (no
duplicate to point at, unlike #946's arm). No `counts.*` key, no new json key. "Declining leaves the
row untouched" (AC2) costs no code: there is no dismissal act to build, only the read itself, which
keeps returning the row until the ledger says otherwise.

**Ambiguity is shown, never resolved (AC4).** Two bank lines that both carry the run's own exact
unsettled amount, within the window, are BOTH returned by
`clara._payroll_settlement_bank_candidates` — nothing in this file ranks, scores or auto-selects
either. The person names ONE line to `clara.settle_payroll_net_pay`; the other stays live and
unmatched.

**No rig-meta cohort omission (unlike #946).** This file DOES mint newly-granted, callable objects
— `get_payroll_settlement_candidates` and `settle_payroll_net_pay`, both `clara_authenticated`
only. Both are in `tests/rig-meta.mjs`'s `ALLOWED[clara_authenticated]` roster and in their own
`PAYROLL_SETTLEMENT_0298_COHORT`, checked by `operation-census.test.mjs`'s grant-correctness sweep
(T17). The three internals stay ungranted to every role, covered by that same sweep's default
"no role may execute anything unlisted" posture — no cohort entry needed for them, #946's own 0260
posture restated.

**Redo posture.** All five bodies are `create or replace` (a first cut used bare `create function`
for the four new-to-this-file ones and had to be converted after a redo hit `already installed`
this migration's own tail caught, below). The queue splice detects its own marker in the installed
body and no-ops with a notice; its postcheck re-reads the COMMITTED catalog in both branches.
`CLARA_MIGRATION_REDO=0298_payroll_net_pay_settlement` was used repeatedly while this file was
built, including once to restore `list_review_queue` to its pinned pre-image after an early splice
bug (a wrong CTE column reference) reached the catalog — the redo mechanism cannot itself undo an
already-spliced marker, so the pre-image was reconstructed by reversing the file's own two
substitutions and reinstalled by hand before the redo, the same "prove the first-apply branch
yourself" discipline the wave-3 addendum names for a marker-tolerant pin.

**Cells** (`tests/payroll-settlement.test.mjs`, gated on
`tests/payroll-settlement-preintegration-gate.mjs`): S1 the ledger read — a clean run fully
unsettled, a hand-booked debit reducing it to the cent, a `payroll_obligation`-flagged credit and
its own (labelled-fixture) debit never mixing into the run's own balance, and two runs settled
oldest-first; S2 the candidate read (AC1) — an empty list with no bank line yet, an exact-amount
in-window line offered while a wrong amount and a far date are not, and an already-matched or
excepted line never offered; S3 the settlement door (AC2) driven end to end — the Dr 2040/Cr bank
entry, the receipt, the reused core's own `bank_matches`/line-member/entry-member rows, an idempotent
replay, an amount-mismatch refusal, an already-settled refusal and a non-payroll-entry refusal, each
driven for real; S4 the three routes (AC3) each clearing the row, with a cell counting exactly one
new journal entry and one new `bank_matches` row across the whole run (no dismissal record
anywhere); S5 ambiguity (AC4) — two equal candidates both offered, neither settled; S6 the
Needs-you row's own fields and its clearing, plus "declining leaves the row untouched" read twice
with no act in between.

**Vacuity control, run and it bites.** A mutant `clara._payroll_net_pay_unsettled` that always
reports a run fully unsettled (ignoring every debit) was installed and the battery run against it:
8 of 17 cells failed (S1's arithmetic cells, S3's already-settled/replay cells, S4's three
clearing cells, S6's clearing cell), then `CLARA_MIGRATION_REDO` restored the real body and all 17
passed again.

**S7 (a later fix round) and S8 (#1059) are cells this file's own body never grew for.** Both
sections are additive test coverage only — NO body in the table above changed for either. S7
(ADV-01/ADV-04) proves reversing a run's own POSTED CREDIT drops it out of the read without
disturbing any other run's FIFO share, and that a high-stakes settlement is left a draft for a
distinct checker. S8 (#1059, "give a wrongly accepted payroll net-pay settlement an explicit
reopen path") proves the opposite direction — reversing the SETTLEMENT's own DEBIT — end to end:
`clara.reverse_entry` refuses an entry that still rides a live `bank_matches` row (CLR10
`live_bank_match_present`) so `clara.unmatch_bank_match` MUST run first; once both general-purpose
doors have landed, in that order, `_payroll_net_pay_unsettled` counts the run unpaid again (the
settlement's own debit now carries `reversed_by`; the reversal mirror's own 2040 leg is a CREDIT,
never counted as a debit — the ADV-01 exclusion already covers it), `get_payroll_settlement_
candidates` offers the run and its ORIGINAL bank line again, and `clara.bank_matches.status` reads
`unmatched`. Neither door is new, widened or touched by #1059 — the client surface that composes
them (apps/web's `PayrollSettlementsSection`) is documented in that component's own file header.

## #948 — hire-purchase and finance-lease agreements are read, and the acquisition they create is posted (0299)

`0299_agreement_contract_acquisition.sql` does for an agreement contract what 0296 and 0297
together did for a payslip: it widens the estate so the pair can be READ, and — when the page is a
financing agreement whose arithmetic holds — POSTED into the fixed-asset lane. Parent #926, owner
ruling 2026-09-18 (option G). The issue body is the contract; its single comment (2026-09-19) is an
AI triage note whose factual correction is followed below.

**There is no fixed-asset birth door, and this file invents none.** The triage note is right:
`clara._tf_fa_acquisition_birth` (0216) is a lane-AGNOSTIC deferred constraint trigger on
`clara.journal_entries` that fires on any entry reaching `approved` and, for every line debiting an
account enrolled in `clara.fa_account_profiles` (0041), inserts the `clara.fixed_assets` row itself,
reading the account's live depreciation policy (`clara.fa_account_depreciation_policies`, #932) for
the particulars. So this lane posts an ORDINARY entry that debits the enrolled asset account and the
trigger does the rest — which is also how AC4's "depreciation particulars come from the account's
policy and are never invented here" is made true STRUCTURALLY: 0299 writes no depreciation column
anywhere.

**The accounting treatment differs by kind, and the standard chart already says so.**
`0150_coa_template_pr_a.sql` ships *2440 Hire Purchase Interest Suspense* beside *2430 Hire Purchase
Creditor*, and *2450 Finance Lease Obligation* with no interest-suspense counterpart. That is the
gross method for hire purchase and the net method for a finance lease, which is what MPERS Section
20.9 asks of a lessee (recognise the asset and the liability at the lower of fair value and the
present value of the minimum lease payments, the finance charge allocated over the term). This file
plants no chart row; the wave's shared rows are 0295's.

**§A prestate.** Every pin is BIMODAL by construction — the pre-image sha OR a body already carrying
this file's own marker — because three tickets of the same lane (#945, #946, #947) recut bodies
between 0295 and here, so the pins are what is LIVE on the lane database, never what an older
header pinned.

**§B the field-path namespace.** `clara._assert_field_path` gains `contract`, in the roster's own
reading order. `clara._field_path_conforms` — the boolean sibling the `clara.document_regions` CHECK
evaluates — is byte-untouched, so the wall and the persist boundary stay on one grammar. The
namespace names the FACT FAMILY, not the document kind, which is why #949's tenancy terms read the
same one rather than minting a second.

**§C the answer vocabulary** — `clara._agreement_answers_ok(jsonb,text)`, the family's OWN belt and
never an arm of `clara._witness_answers_ok` or `clara._payroll_answers_ok`: a versioned workflow may
not couple its shape to another family's frozen files. Eleven run-level questions (what the
agreement calls itself, the financier, the signing date, what was acquired, the cash price, the
deposit or trade-in, the amount financed, the total charges, the total payable, the term, the
instalment) and four per-instalment cells, which are exactly the terms of the row identity
`principal + interest = instalment`. Every question is answered, `not_printed` is an answer, there
is no third state, and the envelope itself is closed to three members so a totals bag cannot travel
beside the answers as a read.

**§D the deterministic evaluator** — `clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)`,
registered in `clara.evaluator_versions` in this same file, closure ONE member by construction (it
reads no table and calls no `clara` function, asserted by a call-shape scan of `prosrc`). It does
AC2's two named checks — deposit + amount financed = cash price, and the printed schedule's
instalments reconciled to financed plus charges — and it CLASSIFIES, from the rendering the page
uses for itself against a closed ordered keyword roster (the Malay forms included). An unrecognised
rendering is `other`; a page that does not say is `not_established`; neither is ever guessed into a
financing class. Both checks read the PRINTED figures rather than the `established` verdict, which
is measured rather than reasoned: the first cut required `established` and its `fails` arm turned
out to be unreachable exactly when a schedule column contradicted its printed total.

**§E the facts router.** An `agreement_contract` pdf or image fell straight through to the router's
`skipped_kind` dead end, and the capability registry's `stored_only` verdict for the pair was DERIVED
from that fall-through. The lane is its OWN, `contract_facts`, not `llm_witness` and not
`payroll_facts`: every facts lane is claimed BY LANE ALONE, so a contract pair parked on either
would be read with that family's prompts. Five CHECK widenings, two registered and routed event
types, and five surgical SPLICES of live bodies (the router core, the wrapper's invoice-twin
exclusion, the transition wall, the claim body and the release sweep) — never re-typed, because
three of the five were last recut by #945 in this same lane.

**§F the persist door** — `clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)`, the ONE writer
of agreement facts, and `clara.fail_agreement_facts(uuid,text)`, its terminal twin. Both
`clara_runtime` only; #948 adds no human door, because the terms a person reads come back through
the same document read every other family's facts come back through.

*Where the payslip lane STRIPS, this one BANKS.* 0296 discards the per-employee rows because #945's
brief forbids persisting an employee figure. #948's brief asks for the opposite in terms — "where
the agreement prints a repayment schedule, each scheduled instalment with its principal and interest
split" is part of what Clara reads — and a repayment schedule is the agreement's own printed table,
not a third party's pay. It is also the record an MPERS 20 / MFRS 16 interest-allocation successor
must read. So both channel rows carry the channel's answers AND its quoted schedule; the text row
additionally carries the fact state.

*Eleven typed facts and no more.* `uq_document_regions_extraction_field_path` admits ONE region per
field path per extraction, so a schedule cell could not have a region of its own even if the door
wanted one: the schedule lives in the envelope, the typed facts are the run-level terms. An
unprinted term still gets a row carrying no rendering and no cents — that row IS the reading "the
page does not print this". The five non-monetary questions (a name, a name, a date, prose and a
count) carry no monetary column at all.

**rig-meta cohort.** `AGREEMENT_0299_RUNTIME_FNS` (`persist_agreement_facts`,
`fail_agreement_facts`) — its own cohort per the "wholly present or wholly absent" rule, and both
names are in `ALLOWED[clara_runtime]`. Every other body this file mints stays ungranted to every
application role; the T17 sweep's default "no role may execute anything unlisted" posture IS that
assertion.

**Redo posture.** Every body is `create or replace`, every constraint is dropped-if-exists before it
is added, every insert is `on conflict do nothing`, and every splice detects its own marker in the
installed body and no-ops with a notice. `CLARA_MIGRATION_REDO=0299_agreement_contract_acquisition`
was used for each fix round while this file was built. THE ONE THING A REDO CANNOT REPLAY is §D.1's
freeze registration (`clara.evaluator_versions` is historical and `clara.evaluator_version_members`
append-only, which is the point of a freeze): that block INSERTs when absent and, when present,
re-derives the closure hash and refuses by name if it moved — so an edit to the evaluator body fails
loudly and its only lawful repair is a `_v2`.

**§G the capability registry is re-derived (AC3).** `stored_only` on the agreement contract's
typed-facts axis was DERIVED from the router's own dead end and said so in words, so §E and this
re-derivation are one change. BOTH axes move on the six pdf/image formats, which is where #945 and
#948 differ: 0296 moved `typed_facts` alone because #945 was the reading half and #946 shipped the
posting half in a later file, whereas 0299 carries these typed facts into a posted acquisition
itself — the column's own published definition of `business_operation = supported`. #946's payroll
row is NOT touched; this file re-publishes the registry's VERSION, it does not restate another
ticket's verdict. Two limits are named in #782's two-key shape, both `accepted_limitation` because
both are permanent: `agreement_non_financing` (a tenancy or supply contract creates no asset at
signing, so there is no entry to draft — the accounting, not a gap) and `agreement_asset_account`
(the page prints prose, and the account comes from the client's own enrolments, never from a guess).
The registry-wide raise is a SET-TO-LITERAL `= 6 where registry_version <> 6`, never `+ 1`: that
form is redo-safe AND composes with another lane raising to the same literal in the same wave.
`tests/document-capability-registry.test.mjs`'s `PUBLISHED_REGISTRY_VERSION` re-bases to 6 in the
same commit (that file's own instruction, and `af3b5955`/#779's precedent), and its lowering probe
now raises to `PUBLISHED_REGISTRY_VERSION + 1` instead of the literal `5`, which had itself become
a lowering.

**§H the signing date** — `clara._agreement_signed_date(text)`. The entry is dated the day the
agreement was SIGNED, because that is the day the asset and the liability exist. Where 0297's
`_payroll_period_month` refuses EVERY all-numeric triple, this body admits one when exactly one of
the two orderings is a real date: `14/03/2026` resolves (14 is not a month), `03/04/2026` is asked
rather than guessed, `31/02/2026` is neither. Month names are admitted in English AND Malay, full or
three-letter prefix, for the same reason §D's classification roster carries `sewa beli` — a
Malaysian agreement prints `14 Mac 2026` as readily as `14 March 2026`, and refusing the rendering
it actually printed would send a readable page to a person for no reason. Locale-free by
construction, which is what makes it honestly IMMUTABLE.

**§I the drafting body** — `clara._agreement_entry_plan(uuid, jsonb)`. An established fact state
plus this client's chart and enrolments in; the acquisition entry out. Hire purchase is GROSS (the
whole amount payable is a liability, the unexpired charge in suspense at 2440); a finance lease is
NET (MPERS 20.9 — the liability is the present value of the minimum lease payments, and the chart
ships 2450 with no suspense counterpart). Both balance on §D's own `deposit + financed = cash price`
identity. The deposit credits **2010 Other Payables**, never a bank account: Clara did not see the
money move, and the agreement states a deposit without saying which account paid it — the bank line
that did clears the payable through the ordinary matcher. An unprinted line produces no leg and a
printed zero produces none either. A NON-FINANCING agreement returns at once with ONE named refusal
and no legs at all (AC5), and "we could not read what kind of page this is" gets a different reason
from "it is a tenancy", because a person clears them differently. The asset account comes from the
client's ACTIVE `fa_account_profiles` enrolments — exactly one resolves, none or several is a named
refusal carrying the accounts it could not choose between — which is the standing owner ruling and
also what makes `clara._tf_fa_acquisition_birth`'s own precondition true by construction. The body
touches no depreciation column anywhere, so AC4's "never invented here" is structural. Balance is
EXACT, never `clara._validate_entry_lines`' 5-cent rounding tolerance, and is checked only when
nothing else already refused.

**§J the unattended gate** — `clara._agreement_posting_verdict(uuid)`. 0297 §D's shape condition
for condition (a closed rung roster walked in order, every rung carrying an explicit verdict, the
FIRST failure being the reason a person is told, and the body itself STABLE so a blocked acquisition
leaves nothing to reconcile), plus the two rungs this family has and the payroll lane does not:
WHICH KIND of agreement the page says it is, and WHICH fixed-asset account the client enrolled.
Fifteen rungs: `filed`, `facts_read`, `channels_agree`, `arithmetic_holds`, `agreement_kind_read`,
`financing_agreement`, `agreement_date_established`, `period_open`, `price_terms_printed`,
`price_identity_holds`, `schedule_reconciles`, `asset_account_resolves`, `accounts_resolve`,
`entry_balances`, `no_duplicate_entry`.

*`not_evaluated` is a verdict; an absent key is a hole.* §I returns EARLY at two points, so the
questions past them were genuinely never asked. The plan reports how far it got in `stage`
(`kind` / `price` / `complete`) and the gate writes `not_evaluated` for everything beyond it rather
than reading a missing refusal as a pass — the same fails-open defect from the other direction.
`no_duplicate_entry` is guarded the same way: "is it already posted" is a question about an entry a
tenancy will never make.

*The duplicate guard's three scopes*: `same_document` (the estate's own
`clara._document_posting_entry`), `same_filing` (this lane never overwrites another writer's work),
and `same_agreement` — another document's approved, unreversed entry whose
`flags->'agreement_acquisition'` carries the same financier, signing date and cash price. Those three
printed terms ARE the agreement's identity; a reversed entry is never a duplicate, so a reversal
re-opens the agreement.

**§K/§L/§M the post, and the lane posting what it reads.** `entry_post_receipts.via_wake_kind` gains
`contract_facts` — widened rather than borrowed, because writing `autodraft` on an agreement receipt
would file acquisitions under the invoice lane's name for anyone reading receipts by lane.
`clara._post_agreement_acquisition(uuid)` asks the gate and acts: ready means one document-bound,
filing-bound approved entry with its legs, its receipt (`approval_arm = agreement_unattended`,
`model_snapshot.provider = clara_db`, because no model took part — the frozen evaluator did every sum
at read time) and an `entry.posted` event; blocked means nothing at all is written and the verdict
comes back. It RETURNS rather than raises, because it runs inside the read's own transaction and a
raise would lose the facts a person needs to clear the block.

*The fixed asset is born by the trigger, not by this file.* Nothing in §L calls anything
fixed-asset-specific. The entry debits the account the client ENROLLED, so
`clara._tf_fa_acquisition_birth` (0216) fires on `approved`, inserts the `clara.fixed_assets` row
and reads the account's own accumulated-depreciation and expense codes and its live policy (#932) for
the particulars — measured end to end by a cell that reads the register row back. §M splices the
post into `clara.persist_agreement_facts` (never re-typed; the postcheck re-reads the committed
catalog in both branches), because the questionnaire family is frozen and a posting step with no
model in it does not deserve a new workflow, a new lane and a reconciler arm. The settle receipt
gains a `posting` object; the idempotent-replay arm returns before the post, so re-settling a done
task neither re-posts nor re-refuses.

**§N Needs you** — `clara.list_review_queue` gains `row_kind='agreement_posting_blocked'`, the
FOURTEENTH kind. DERIVED from `clara._agreement_posting_verdict`, stores nothing, clears itself:
add the missing account and the sentence changes on the next read; post the acquisition and the row
is gone; retire the filing and it is gone. No refusal table, no attempt record, no dismissal act —
the Settlement candidate row's own discipline (CONTEXT.md) applied to a posting block. It shows an
agreement contract that is FILED, has been READ and whose filing carries no live entry, which off
the ledger is exactly "was read, and did not post". A NON-FINANCING agreement gets a row too, and
that is the point of AC5: it was read, it will never post, and a person is told what the page IS
rather than left to wonder why a filed agreement produced nothing. Section `needs_you`, lane
`needs_you`, no new `counts.*` key and no new json key. The row coexists with `uncoded_filing`, the
same model #946 recorded. The web side gains the kind in `REVIEW_QUEUE_ROW_KINDS`, its two
`messages/en.json` phrases, its `/documents` link and a `null` affordance, with its own test file
(`lib/firm/needs-you-agreement-posting.test.ts`) rather than more cells in the two shared ones.

**§Z tail.** Everything the file claims, re-derived from the LIVE catalog after every section has
run: the namespace live and the roster still closed (driven through the CHECK's own boolean, with
the three neighbour namespaces re-read); `clara._field_path_conforms` byte-unmoved; all eight new
bodies owned by `clara_fn_owner` and `search_path`-pinned, the two `clara_runtime` doors reachable
by `clara_runtime` alone and the six internals by no application role at all; the vocabulary gate
DRIVEN (a complete envelope admitted, a missing question and an unknown key each refused); the
evaluator registered, frozen at ONE member and `clara.verify_evaluator_freeze()` re-run; each
family's routing arm at its MEASURED count (a bare substring count would have been wrong —
`llm_witness` appears 12 times in the live definition and only 2 of them are lane assignments);
the persist door calling the post and keeping its grant; the queue projecting the new kind exactly
once; `entry_post_receipts` admitting `contract_facts` beside what it already carried; the registry
at ONE version with all six agreement pairs re-derived and #946's payroll row untouched; the
published chart still carrying the four codes 0150 seeds and none appended. It ends with a
FIXTURE-FREE probe that drives the evaluator, the date parser and the drafting body together
against a client id that cannot exist — classifying a hire purchase, holding the price identity,
establishing `14 March 2026`, refusing an unenrolled client by name, and refusing a tenancy with
exactly one reason and no legs.

**The FIRST-APPLY branch, proven separately** (wave-3 addendum: `CLARA_MIGRATION_REDO` can only ever
take the marker branch). Inside one rolled-back transaction the lane database's
`clara._assert_field_path` was restored to 0296's own body, measured back to the exact sha this
file's prestate pins (`9783e0e7…`), and §A was run verbatim: it reported `OK (FIRST apply)`. The
transaction was rolled back and the live body re-measured at its post-#948 sha.

**Two lint contracts this file was measured against, both of them the hard way.**
(a) `scripts/wiki-lint-checks.mjs` classifies any `do` block that so much as NAMES
`pg_get_functiondef` as a change-of-record PATCH site, and then requires every target it can
attribute to sit in the wiki whitelist — its census-read exemption is consulted only where
attribution FAILED, so a literal signature cannot inherit it. §Z therefore reads `p.prosrc`, and
the comment explaining why does not spell the rendering function's name (a mention inside the block
is enough to re-classify it). (b) `apps/web/test/sqlFunctionCensus.ts` reconstructs what a dynamic
`execute` installs by following the variable back to the body it was read from; a bare
`v_next := v_def;` alias breaks that chain, and §E3(1)'s first cut had one —
`sql_function_census_unresolved_execute` reddened `do-action-floors.test.ts` and three of its
neighbours. Its first substitution now reads `v_def` directly, like the other four splices in the
file, and the corrected FIRST-APPLY branch was exercised for real: in one rolled-back transaction
the live router body was reversed through the block's own five (anchor, replacement) pairs, the
pre-image installed, the block run, and all four arms re-read out of the catalog.

## #949 — a tenancy's contract-terms record, and the recurring rent plan a person confirms (0300)

`0300_tenancy_terms_rent_plan.sql` closes the tenancy half of #926's question 7. It builds on
#948's landed contract lane (0299): a tenancy is already READ — the evaluator classifies it, the
persist door banks eleven typed facts as `clara.document_regions` rows, and the fixed-asset lane
drafts nothing for it, by name. What was missing is somewhere to put what the page states, a
decision about whether Clara may draft a monthly rent expense at all, and the plan a person
confirms.

**The owner's ruling of 2026-09-20 is the spine of the file, and both halves of it land.** The
credit account is `2050 Rent Payable`, a dedicated standard-chart liability minted by the shared
chart migration 0295 and CONSUMED here by code and name — this file appends no chart row, and its
own tail re-derives that structurally (no body of the lane names `clara.coa_template_accounts` at
all). And when the simple monthly-rent treatment may not comply with the standard, Clara stops and
asks: `clara._tenancy_lease_treatment` walks the ruling's own branch —

| case | verdict | standard |
|---|---|---|
| a stated escalation, under EITHER framework | asks | the one in force |
| the framework is not recorded | asks | — |
| the framework is neither MPERS nor MFRS | asks | — |
| MPERS, level rent | **drafts** | MPERS Section 20 (straight-line over the term) |
| MFRS, term of 12 months or less | **drafts** | MFRS 16 (the short-term lease exemption) |
| MFRS, term over 12 months | asks | MFRS 16 (right-of-use asset + lease liability) |

Every answer carries the WRITTEN accounting basis naming both standards, the term and the rent it
read, and — where it asks — the question the accountant answers. It measures nothing: no discount
rate, no present value, no lease-liability schedule; full MFRS 16 measurement is out of scope by
the ruling's own last line. The MFRS 16 LOW-VALUE exemption is deliberately not a branch, and the
basis says so: the asset a tenancy of premises conveys is never low value, and this lane only ever
sees a tenancy.

**"Asks" is a prompt, never a wall** (the standing owner ruling "beta, nothing dark"). The confirm
door still admits the plan when the branch asks — but only against a written PROFESSIONAL
JUDGEMENT the accountant types, which is recorded on the confirmation row, printed into the plan's
own purpose, and enforced by a CHECK on the table so no code path can drop it.

**The triage question the owner left to the implementer, measured rather than assumed:** whether
the contract-terms record is redundant with `clara.client_facts`. It is not, for three reasons all
read off the live database — `uq_client_fact_live` is unique on (client_id, fact_key) where live,
so a client with two shoplots could not hold two rents; `clara.client_fact_keys` is a closed
five-member registry behind a foreign key whose successor role 0192 carried to
`clara.knowledge_records`; and it carries a `source_document_id` but no region pointer, while AC1
asks for each term to carry the region it was read from. The knowledge lane was checked too and is
the same shape problem: its subject is the client or the firm, never one agreement.

**`clara.contract_terms`** is therefore its own relation: one live row per (agreement document,
term key) over a closed five-member vocabulary (`monthly_rent`, `deposit`, `term_start`,
`term_end`, `escalation`), append-only and supersede-only at the TABLE (a correction opens a
successor; the predecessor is never edited), with `clara.document_regions`' own RLS shape — forced
RLS, the owner's ALL policy, a firm-scoped SELECT for `clara_authenticated` and one for
`clara_agent_ro`, and nothing at all for the runtime. `basis_kind` is the honesty column:
`document_region` (a region of this agreement printed this), `derived_from_regions` (computed from
regions by the rule the basis sentence states) or `person_stated` (a named human typed it, no
region claimed), tied to `source_region_ids` by a CHECK in both directions.

**Why the terms are not simply more questions on #948's questionnaire.** `agreementFacts_v1` is a
FROZEN closure, so an ESCALATION — which its eleven-question roster has no question for — cannot be
read by that family at all. `clara.propose_contract_terms` is honest about which term comes from
where: the rent and the deposit ARE readings of their own regions, the term's first and last day
are DERIVATIONS from two of the same regions (the first day is the signing date, corrected by a
person where the tenancy commences later; the last day is inclusive, so 24 months from 5 January
2026 ends on 4 January 2028), and the escalation is reported as `no_question_in_the_questionnaire`
— never silence, and never a zero.

**The person's confirmation is the plan's own instruction, and that needed a third
`authority_ref` kind.** The plan lane admits an `accounting_work` (accepted because
`accounting_work.initiator` is NOT NULL — the owner's #977 ruling says exactly that) and a
`chat_task` narrowed to a human-authored `chat_turn`. A person clicking Confirm on a contract page
is neither. Three routes were considered and rejected: admitting a Work would start a run nobody
asked for; minting a `chat_turn` would fabricate the very thing #977 exists to stop; and naming
the DOCUMENT would make a thing a model read into a thing a person said, which REGRESSES #977
rather than extending it. So the confirmation itself is the row —
`clara.contract_plan_confirmations`, INSERT-only, whose `confirmed_by` is NOT NULL, which is the
SAME property that makes an `accounting_work` acceptable — and the agreement rides on that row
(`document_id`), which is how "the agreement is recorded as the source document" is satisfied
without weakening what an instruction is. 0250's own closing line invited this ("a raise rather
than a quiet refusal, so a future lane that widens the admitted kinds finds this line"); §G.1
splices the arm in immediately above that raise, and §G.2 widens
`clara.create_accounting_plan`'s shape wall by name. `clara.sign_depreciation_authority` carries
the same wall and is deliberately untouched: a depreciation authority is not a tenancy.

**The settlement is the Settlement candidate row, third instance** (CONTEXT.md; #657's pending
bank line first, #947's unsettled payroll net pay second). 0298's four bodies are the template,
line for line: `clara._rent_payable_unsettled` is a per-client FIFO ledger read over the confirmed
plan's OWN payable account (which account is read off the CONFIRMATION, because the ruling lets
the accountant choose another liability account), `clara._rent_settlement_bank_candidates` is the
deterministic match basis (exact amount, ten-day window, live/unspent/unexcepted lines only, never
a score), and `clara.settle_rent_payable` books Dr payable / Cr bank and then calls
`clara._match_bank_line_core` DIRECTLY — no `bank_matches`, `bank_match_line_members` or
`bank_match_entry_members` row is written anywhere in this file's own code. Because "unsettled" is
a LEDGER fact and not a marker, the row clears itself by any route: a cell books a cheque by hand
with no door of this lane involved and the row is already gone, with one new entry and no match,
marker or dismissal row anywhere. A cheque is the same case by construction — the payable stays
open until the cheque appears on the statement, which is the only moment Clara can see.

**The deposit is a term and an offer, never a draft.** Signing does not say the money moved, so
`clara.get_tenancy_deposit_coding` records nothing and posts nothing: it offers `1120 Deposits
Paid` (consumed by code and name; a client who does not hold it is TOLD so) against bank lines of
exactly the recorded deposit, inside a SIXTY-day window around the term's first day rather than
the rent settlement's ten, because a deposit is paid once around commencement while a month's rent
is paid within days of its month. `already_coded` is a ledger read, so the offer clears itself.
There is deliberately NO write door for a deposit at all — coding a bank line is the coding lane's
own act.

**The escalation surfaces before its date and moves nothing by itself.**
`clara._tenancy_escalation_state` is derived from the live plan revision and the live escalation
term, so it clears the moment the plan carries the escalated amount. Sixty days' notice, stated
out loud rather than hidden in a body, and the row does NOT disappear once the date passes — an
escalation that took effect and was never confirmed is exactly the case a person most needs to
see. `clara.confirm_tenancy_rent_plan_revision` records a SECOND confirmation row
(`kind='rent_plan_revision'`) and moves the schedule through `clara.revise_accounting_plan`, so
"no amount changes without that confirmation" is a record rather than a promise. A stepped rent
always makes the branch ask, so that door carries the same written-judgement wall and quotes the
same body's own question.

**Needs you gains TWO kinds, not one** — `rent_payable_unsettled` and `rent_escalation_pending` —
spliced additively in the 0146/0168/0180/0260/0288/0297/0298/0299 family. Two, because accepting a
settlement candidate on the bank surface and confirming a plan revision on the contract page are
different decisions in different places, and folding them would leave the label, the link and the
affordance all guessing which. Both are DERIVED, neither mints a dismissal act, a `counts.*` key
or a json key, and both are appended contiguously in one hunk at the end of every roster.

**The prepayment lane is untouched, and AC7 is proven by driving it.** A tenancy whose 24-month
term is recorded in `clara.contract_terms` is prepaid a year up front, and
`clara.prepayment_schedule_v1` still refuses `prepayment_term_underivable`, naming
`document_service_periods` — not the contract term this lane holds. Once a person states twelve
months through the estate's own door the schedule derives, twelve lines, never twenty-four. The
tail's own T.6 reads the catalog: no body of this lane names that table at all.

**The migration's shape.** §A prestate · §B the record · §C its two doors · §D the proposal ·
§E the framework read and the lessee branch · §F the draft and the confirmation relation ·
§G the two authority splices and the confirm door · §H the settlement · §I the deposit ·
§J the escalation · §K the queue splice · §Z the tail.

**Prestate pins, MEASURED on the lane database after #948.** Three `sha256(prosrc)` pins in §A —
`clara.persist_agreement_facts(uuid,jsonb,jsonb,integer)`
(`d3b22a8ae6cd6ef47e3e1765fd52b95f3b0f8a27cc0d2a255dcdd1c0be47d1de`, the writer of the regions
this file cites), `clara._agreement_entry_plan(uuid,jsonb)`
(`1db0f2be1a1e9ce75e407f867da9498d593dfb92d76d68f2960fa6cb6680b9ca`, whose early return is why a
tenancy never reaches the fixed-asset lane) and the REGISTERED frozen
`clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)`
(`0c99e23bfd5d69aa733f0c180a42e4eb4b9bd3b7f856a0332dbbb8bfe5057c1c`) — plus three non-sha claims
(the three chart rows on the current published platform template, `clara._tf_no_truncate()`, and
the `reporting_framework` knowledge key). THREE MORE pins live inside the splice blocks that recut
their targets, in 0298 §E's own idiom, each keyed on `sha256(pg_get_functiondef(...))`:
`clara._authority_ref_refusal(text,uuid,uuid,uuid)`
(`d70256f4208f6caf20e30259958f66d08ff1b445522399fc0c7f844f2cdea435`),
`clara.create_accounting_plan(...)`
(`13f0d80556e60828875203bc9a290f7d325d4d067c4079e5ef6d25632a25a055`) and
`clara.list_review_queue(jsonb,jsonb,integer)`
(`bc7f9250bf58562e893dee83623d4e2abc6bc42480bfd69f65944a76f893ed6e`). All three splices detect
their own marker and no-op on a redo.

**Redo posture.** Every body is `create or replace`, both relations are `create table if not
exists` with `if not exists` indexes and `drop policy if exists` before each policy, every trigger
is dropped-if-exists before it is created, and all three splices are marker-detecting.
`CLARA_MIGRATION_REDO=0300_tenancy_terms_rent_plan` was used for every build round of this file
and is recorded here as the work order asks.

**The lint contract this file was written against.** #948 measured that
`scripts/wiki-lint-checks.mjs` classifies any `do` block that so much as NAMES the
definition-rendering catalog function as a change-of-record patch site. §Z therefore reads
`p.prosrc` everywhere, and its own explanatory comment does not spell that function's name.

**The reporting-framework key gets its first reader.** `clara.knowledge_keys` has carried
`reporting_framework` since 0192/#644 with a label saying it is "DESCRIPTIVE in this slice — no
posting or presentation code reads this row". `clara._client_reporting_framework` is that first
reader, and it reads the key only to decide whether Clara may DRAFT, never to post: a live CLIENT
record shadows a live FIRM record inside its effective window, and two live records of one scope
carrying different codes answer `ambiguous` rather than picking.

## Riders wave 4, lane 01 — the review fix round (0296–0300)

Three reviews (spec, standards, adversarial) ran against this lane's integrated head and the
findings were fixed in one pass. Two of this lane's own unmerged migrations were EDITED and
re-applied; everything else was a test, a census or a surface. What changed in the database, and
why, is recorded here because five of these are facts about what the estate now REFUSES.

**The migrations edited, and the ceremony.** `CLARA_MIGRATION_REDO` takes the HIGHEST applied
version only, and the first defect was in 0298, which sits two files below the frontier. So the
supported path was reached the way `wave3-lane06` reached it, and the one hand step is recorded
here in full rather than left implicit:

1. `delete from clara.schema_migrations where version in ('0299_agreement_contract_acquisition',
   '0300_tenancy_terms_rent_plan')` — one statement, returning exactly those two rows. It exists
   only to make 0298 the highest applied version so the supported redo can take it.
2. `CLARA_MIGRATION_REDO=0298_payroll_net_pay_settlement node scripts/migrate.mjs` — prestate
   clean, splice reported its own marker (a redo no-op), tail OK, redone.
3. `node scripts/migrate.mjs` — 0299 and 0300 re-applied by the ordinary path, each prestate
   taking its own already-applied branch and each splice no-opping on its marker.
4. 0300 was later redone twice more, by the ordinary `CLARA_MIGRATION_REDO` path, for the two
   fixes that landed after the first pass (the MPERS threshold and the settlement core's lock
   ordering).
5. Final drift check: `node scripts/migrate.mjs` applies nothing and reports no checksum drift,
   so the committed files and the applied catalog agree.

**The five walls this round added to the SQL.**

- *A reversal mirror is not a payment* (#947's `clara._payroll_net_pay_unsettled`, #949's
  `clara._rent_payable_unsettled`). `clara.reverse_entry` builds its mirror with the legs
  SWAPPED and does not copy `flags`, so reversing a posted payroll run or a month of rent left an
  approved, non-reversed DEBIT on the payable that belonged to no payment at all — and the FIFO
  allocated it against an OLDER, genuinely unpaid item, which then vanished from the read, from
  Needs you and from the settlement door. Both pools now exclude `je.reversal_of is not null`,
  and the rent read excludes it on the CREDIT side too (reversing a rent SETTLEMENT mirrors a
  credit to the payable, which the first cut counted as a fresh month of rent). Driven in
  `payroll-settlement.test.mjs` S7 and `tenancy-rent-plan.test.mjs` S10.
- *A high-stakes settlement is left a DRAFT* (`clara._settle_payroll_net_pay_core`,
  `clara._settle_rent_payable_core`). Both doors booked AND approved in one act, so one
  bookkeeper alone could post and approve an unlimited settlement through /bank while the same
  entry booked by hand was refused `CLR05 distinct_checker`. They now probe
  `clara.is_high_stakes` on the entry they have just built and, where it is high-stakes, return
  `status='awaiting_checker'` with the entry left a draft, no post receipt and no bank match —
  `clara.reverse_entry`'s own posture for exactly this case. Nothing is dark: the entry is
  balanced and already on the bank's own GL code, so a distinct checker approves it through
  `clara.approve_entry` and binds it through the ordinary matcher, and until then the item stays
  open BY THE LEDGER and keeps its Needs-you row. A second accept while one is waiting is refused
  `settlement_awaiting_checker` rather than minting a second draft.
- *One live rent plan per payable account* (`clara.confirm_tenancy_rent_plan`). The open-rent
  read is a FIFO over the payable ACCOUNT's own balance, because `2050` has no subledger, so two
  live tenancies pointed at one account shared a single payment pool and each other's months. The
  first cut refused only a second plan on the same DOCUMENT. A fifth named refusal,
  `payable_account_in_use`, now names the tenancy that already holds the account; the remedy is
  the accountant's own choice the owner's ruling already gives them (its own liability account).
  `clara._rent_payable_unsettled` accordingly emits ONE ROW PER LIVE PLAN rather than one per
  account, and attributes a credit to the plan whose own term window contains it.
- *The MPERS arm asks for the classification* (`clara._tenancy_lease_treatment`). The first cut
  drafted for EVERY MPERS lease however long, which quietly assumed the OPERATING classification
  that MPERS Section 20 makes the accountant establish. Above ten years the branch now returns
  `drafts=false` with reason `mpers_lease_classification`, and `confirm_tenancy_rent_plan`
  demands the written professional judgement it already knows how to demand. TEN YEARS is this
  lane's own bound on WHEN to ask, not a threshold MPERS states (MPERS states indicators, not a
  number): premises have an economic life measured in decades, so a two-year shoplot tenancy is
  not in doubt while a decade-long lease is, and asking on every ordinary tenancy would be noise
  rather than care. The number lives in one place and the owner may move it.
- *The legal business date has ONE owner.* `clara._client_reporting_framework` and
  `clara._tenancy_escalation_state` each spelled `(now() at time zone 'Asia/Kuala_Lumpur')::date`
  and now call `clara._book_today()`. `clara._tenancy_rent_plan_draft` still carries the zone
  NAME, because it passes it as `create_accounting_plan`'s `p_timezone` argument and there is no
  authority returning a zone — that one is on the x42 arm-(B) roster with its reason.

**And two grants that should never have been written.** `clara.contract_terms` and
`clara.contract_plan_confirmations` shipped a firm-scoped `clara_agent_ro` SELECT, copied from
`clara.document_regions`' posture. `rig-runtime-visibility.test.mjs`'s "the agent lane has ZERO
access to every new table" sweep admits an agent table grant only where the lane has NO DOOR to
route the read through (0192 §H's `knowledge_records` is the type case). This lane has doors. The
grant and the agent policy are gone, and 0300's own tail now asserts both facts in-migration so a
later recut cannot restore them quietly.

**A governance change this round makes explicit.** The approve-writer census
(`x56-rest-c.test.mjs`, 0045's own instrument) bounds who may flip a journal entry to
`approved` in-body. It was four bodies, then five with #623. This lane makes it NINE:
`clara._post_payroll_run` and `clara._post_agreement_acquisition` (unattended AGENT posts,
`approval_arm='agent_unattended'`, the F-A2 D10 arm that does not participate in maker/checker at
all) and `clara._settle_payroll_net_pay_core` and `clara._settle_rent_payable_core` (HUMAN
accept acts, which do participate — see the high-stakes wall above). Four to nine is an
owner-visible widening of who may approve an entry, not a test re-base, and the roster names each
new body with its reason.

**The knowledge cohort gains a declared reader.** `clara._client_reporting_framework` reads
`clara.knowledge_records`, which #654's own census forbids from outside the knowledge cohort
("a firm preference is becoming an authority somewhere"). It is declared in that census with its
reason and measured there like every other declared consumer — STABLE, no DML against the
relation — plus one property this lane owes and the loop does not check: it is UNGRANTED,
reachable by no application role at all. The thing the census exists to stop does not happen here:
the plan cites `clara.contract_plan_confirmations`, a named person's own act, and
`clara.create_accounting_plan` still refuses a `knowledge_record` reference outright.

**And one amendment to a frozen contract.** 0020 §6's byte-identity battery pins
`clara.claim_document_processing_task` and `clara._enqueue_invoice_facts_core` against the
19-migration prestate through a stack of ratified reversal layers. #945's 0296 and #948's 0299
widened both bodies' EGRESSING-LANE roster for `payroll_facts` and `contract_facts` — the same
four sites F-A1 PR-1 widened for `llm_witness`, for the same reason — and the contract was not
amended, so the battery went red. AMENDMENT W4 is that amendment: four reversal pairs per member,
the router's machine-derived by diffing the live body against 0123's own source and asserted
byte-equal to it before transcription. Neither edit adds a call edge into the LEGACY consent
relation, which is §6's own structural claim about these bodies.

## #931 — one staff expense claim discharges SEVERAL advances (0301)

`0301_staff_expense_claim_allocations.sql` adds `clara.staff_expense_claim_allocations` — the
CONFIRMED allocation list of one claim (advance, amount, ordinal) — plus the pure normalisation
`clara._claim_allocations`, and recuts the seven 0221 bodies that have to read a list where they
read one advance: the validator, the canonical form, the settlement-account reader, the journal
derivation, the door, the lane-agnostic birth trigger and the two reads.

**Why a child table rather than a jsonb column.** 0221's own header states the rule: *every foreign
key carries the tenant*, because the alternative "is a property of CODE, not of DATA". A jsonb array
of advance ids would be exactly that. Every allocation row carries the same three-column FK to
`clara.staff_advances` and to the claim that `advance_id` already carried.

**One credit leg per advance ACCOUNT.** `clara._tf_adv_movement_belt` counts coverage PER JOURNAL
LINE, and `uq_staff_advance_applications_line_advance` admits several allocations on one line as
long as they name different advances. So `clara._claim_journal_basis` groups the confirmed
allocations by account code and emits one credit leg each. Two advances on one dedicated account →
one leg, two register allocations keyed to it. Two accounts → two legs. Neither needs the belt, the
hook roster or the shared cap to change.

**The cap is asked ONCE PER ALLOCATION**, in both places 0221 asks it (the door's world half and
the deferred birth trigger), never once for the claim total — a cap asked against the head advance
would refuse a lawful split and admit an unlawful one. The refusal carries the advance, the
boundary date, the outstanding at it and `shortfall_cents`, and addresses
`claim.advance_allocations[N].amount_cents` when the claim states a list (0221's unmoved
`claim.amount_cents` when it names one advance).

**"Belongs to this claimant" has one enforceable reading, and its limit is named.** There is no
staff master (0221 D4), so ownership is read in two arms: the advance's own `enrolment_id` IS the
claim's claimant enrolment, or it is another LIVE enrolment of this client whose `person_label` is
byte-identical after `btrim`. The second arm is what makes a claimant's SECOND dedicated account
reachable; it compares two admin-attested enrolment rows, not a free-text claimant string against a
record, and it is case-sensitive, so strictness there can only refuse a lawful claim (which the
preparer fixes by naming the other claimant) and never admit an unlawful one. **This is a NEW wall:
0221 asked only which account the advance sat on, never whose it was.** A staff master is what
replaces the second arm. **`p931.claimant.samelabel` pins what that arm cannot tell apart**: two
enrolments of one client written with the SAME `person_label` are one claimant to this rule, even
when the claim states a `claimant.identifier` of its own — the rule never reads it, and
`clara.staff_advance_accounts` carries no other discriminator. The narrow reading (arm (a) only) is
a two-line change; measured on the rig, it also reds `p931.accounts`, i.e. it makes #931's own
listed default — advances on different enrolled accounts discharged together — unreachable until a
staff master lands. Awaiting the owner's ruling.

**The single-advance shape is untouched, and that is structural.** The claim row's `advance_id` and
`advance_account_code` carry the HEAD of the list; `clara._claim_basis_canonical` gains the
`advance_allocations` key ONLY when the normalised list has two or more members, so `{advance_id: X}`
and a one-element list naming X canonicalise to the SAME bytes and every claim stored before this
migration still REPLAYS instead of conflicting. §G backfills each stored advance-application claim
into its own one-element list, exactly (the settlement CHECK guarantees `advance_id`, and the old
derivation credited the whole `amount_cents` to it), so the reads have one shape to answer with.

**A SECOND WRITE UNDER ONE INTENT KEY DOES NOT CONVERGE — IT MERGES, so the door asks the payload
question twice.** Before this migration the door's only post-lock write was the claim insert's own
`on conflict (work_id) do nothing`: two concurrent admissions under one key ended on ONE claim
whatever they carried. The allocation list is a second write, and `on conflict do nothing` on it
grafts rather than converges. The three facts that meet: step 4's canonical comparison is the only
place a CHANGED SPLIT is caught and it runs BEFORE `pg_advisory_xact_lock`, so it cannot see an
uncommitted sibling; `clara._admit_accounting_work_core` answers `replayed` on a matching
`basis_digest`; and one credit leg per ACCOUNT (above) makes that digest EQUAL for a single-advance
claim and a split of the same total on that account. Measured on a throwaway clone of the lane rig
before the fix: the second payload's extra advance landed on the first payload's claim, leaving
`81000` sen allocated against a `60500` claim — which tail T.3b counts as broken and
`clara._tf_adv_movement_belt` would refuse to post for ever; with the heads swapped, the loser
escaped as an untyped `23505` on `uq_sec_allocations_claim_ordinal`. So the claim insert now
REPORTS whether it created the row (`returning id into v_claim`), the allocation insert runs ONLY on
the branch that did, and the other branch re-reads the stored `basis` under the rung and answers
step 4's own `intent_payload_conflict`. Cells: `p931.race.graft`, `p931.race.ordinal`.

**Redo-safe by construction** ("Redo (#957)" above): `create table if not exists`,
`create index if not exists`, `create or replace function|trigger`, policies created only when
absent, and a backfill that is `on conflict … do nothing`. The prestate reports FIRST or REDO on
the marker only this file writes; the FIRST-apply branch was proved separately on the lane rig by
restoring 0221's own pre-images inside a transaction that was rolled back.

**Gate:** `tests/staff-expense-claim-allocations.test.mjs`, frontier-gated on the stable stem
`staff_expense_claim_allocations$` with `tests/staff-expense-claim-allocations-preintegration-gate.mjs`.

## 0302 — a bill posts inside an accrued period, and Clara notices (#938, riders wave 4, lane 03)

`0302_accrual_bill_conflict.sql` closes the gap #907's own review measured: a `reversing_journal`
plan's reversal nets an estimate against a bill that arrives in the FOLLOWING period correctly, but
nothing links a bill to an open accrual, so one that arrives in the SAME period is charged twice
until the reversal runs — and nobody is told.

**The read is a twelfth `clara.list_review_queue` row_kind, `accrual_bill_conflict`, spliced in
exactly the way #974 (0260) added the eleventh** — read the installed definition, splice a new CTE
+ union arm via `replace()` on the live prosrc, re-verify every prior row_kind survived at its
exact marker count. No AC1 shape (a new door vs. an arm on an existing read) required a choice: no
"accrual attention read" exists on this base, and the ticket also wants the item on Needs-you,
which is this function. `id` is the PLAN's own id — not the occurrence's, unlike
`asset_id`/`advance_id`/`authority_id`, which all mirror the shared `id` because that entity's OWN
id is what a caller needs back. This row's two remedies both act on the plan
(`clara.skip_plan_occurrence`, and `clara.request_plan_catch_up` for "reverse now"), so no new
column joins the 28-wide shared vector at all — the smaller of the two splice shapes 0146/0260
demonstrate. `period` carries the flagged occurrence's own due date as ISO text, never a formatted
month, because a remedy must name the exact occurrence back byte for byte. `AT MOST ONE ROW PER
PLAN` (`distinct on`): a plan has at most one open (posted, unreversed) accrual occurrence at a
time in ordinary use.

**The period boundary is `clara._plan_covered_through`'s own expression** (`period_key +
step_months - 1 day`, step from the admitting revision's `frequency`), inlined rather than called
because that function answers a different question (the plan's high-water mark). It is
DELIBERATELY NOT `clara._plan_reversal_date`: that function answers "when does the scheduled
reversal fall" (always the first of the next CALENDAR month, 0193:837, whatever the plan's
frequency), not "how long is this accrual's own period" — conflating the two would flag a bill in
month two of a quarterly accrual as "next period" when it is not. "Document-sourced" is
`clara.journal_entries.origin='document'`, the estate's own predicate (0009's `_draft_entry_core`);
the candidate must also hit the accrual's own `expense_account_code` (joined by `(plan_id,
revision)`, so a corrected accrual's later revision reads its own particulars) and be a live
approved entry. "Not yet reversed" is an occurrence-row EXISTENCE check (`leg='reversal'`, same
`period_key`, `work_id` not null) — never a date comparison — because the flagged case is exactly
"the scheduled reversal is very often not yet due either", and a refused reversal attempt (`work_id`
null) does not clear the flag: money has not moved.

**"Reverse now" needed no new door.** AC2 names exactly ONE new door ("add a skip-one-occurrence
door IF NONE EXISTS"). "Reverse now" rides `clara.request_plan_catch_up` (0193, UNCHANGED) with a
window from the flagged occurrence's own due date through its scheduled reversal date — precisely
what a bookkeeper could already send that door. When the reversal is due, it admits and the row
clears on the next read; while it genuinely is not yet due, the door's own `catch_up_in_future`
refusal answers honestly rather than the surface pretending an early reversal happened.

**`clara.skip_plan_occurrence` removes exactly one future due date, without recutting the frozen
admission core.** `clara._plan_admissible_event` (0193:1077) is the ONE candidate picker
`wake_due_plan_occurrences` calls, and its primary-candidate arm requires BOTH `not exists (…
due_date = v_dp)` and `not exists (… period_key = …)` before it will ever offer a date again.
Writing an `accounting_plan_occurrences` row for the target date (`leg='primary'`, `work_id` NULL,
`outcome.state='skipped'`) satisfies the first predicate outright, so the automatic scan never
re-offers it. `clara._tf_plan_occurrences_append_only`'s two raising arms both gate on `old.work_id
is not null`, which a skip marker never is, so a later DELIBERATE `request_plan_catch_up` naming
that exact date can still override the skip — the admission core's own convergence law is what
makes the marker binding, and this door touches no other body. It never targets the CURRENT
(already posted) occurrence — only a future date with no occurrence row yet, computed via
`clara._plan_due_index_on_or_before`/`clara._plan_due_nth`, the same arithmetic the schedule itself
uses.

**Migration triad.** `tests/accrual-bill-conflict-preintegration-gate.mjs` (stem
`accrual_bill_conflict$`), `ACCRUAL_BILL_CONFLICT_0302_COHORT`/`_HUMAN_FNS` in `tests/rig-meta.mjs`
(spread into `ALLOWED[clara_authenticated]` and its own bimodal `cohortFailures()` call, the
wave-2 `0270` pattern — the read itself mints no new granted name, exactly as 0260's own splice did
not), and the gate's `--import` token in `package.json`'s test script, last in migration order.
Battery: `tests/accrual-bill-conflict.test.mjs`, frontier-gated on the same stem, extending
`tests/accrual-adjustments-fixtures.mjs` (0222's own) and `tests/s6-helpers.mjs`/`rig-fixtures.mjs`
for the real document-filing/draft/approve pipeline a document-sourced bill needs.

**Redo-safe by construction**: the splice's one statement that changes the catalog is `create or
replace function`; `clara.skip_plan_occurrence`'s create/grant/revoke are idempotent. The prestate
asserts nothing about the splice marker or the door's own absence beyond what a redo already
tolerates.

**Composable with its own wave (fix round 1).** This file's first draft pinned
`clara.list_review_queue` at an EXACT `sha256(prosrc)` and anchored its splice on the whole
`all_rows` union block, naming every arm that existed when it was written. Both are collisions with
the rest of the wave: several lanes splice their own `row_kind` onto this one function, and
whichever carries a LOWER migration number applies first — measured, lane 01's `0297` recuts this
body from `f4a34c72…` to `a315367f…`, after which the pin could never be satisfied and the literal
anchor matched zero times. The pin is now BIMODAL: the recognised pre-image, OR a body admitted on
its STRUCTURE (this file's own row kind absent, both CTE seams unique, and §A's witness roster of
the ten kinds it must not disturb at their exact counts). The insertion is derived from the two
seams — the CTE immediately before the `all_rows` opener, the union arm immediately before the
`keyed` opener — which composes with any number of sibling arms in either order and produces the
BYTE-IDENTICAL body the literal anchor produced on a clean base. The shared column vector is
asserted as a measured `+1` delta, never an absolute. Both branches were driven on `clara_l03`
inside one rolled-back transaction: the pre-image reconstructed from the live body (hashing to
`f4a34c72…`) took the pinned branch and reproduced the shipped body byte for byte, and the same
pre-image carrying a payroll-shaped sibling arm took the structure branch, kept BOTH arms and moved
the vector 11 → 12.

**The reason sits outside the idempotency key.** `clara.skip_plan_occurrence`'s dedupe hash is
`{plan, after_due}`: a replay under the same op key with a DIFFERENT reason returns the first
receipt verbatim and keeps the first reason, while a changed plan or a changed `after_due` raises
`op_key reused with different args`. Both web callers mint a fresh key per click, so the shape is
reachable only by a retrying agent or a resent form.

## 0303 — an accrual may carry a person-stated amount per period (#937, riders wave 4, lane 03)

`0303_accrual_period_amounts.sql` gives an accrual a second selection rule, `stated_period_amount`:
July 3,000, August 3,500, each due date posting its own figure and its own reversal. Before it, the
only shapes available to an accountant whose monthly cost varies were one accrual per month (three
plans, three authorities, three schedules for one instruction) or an average nobody stated.

**It rides #653's seam rather than inventing a second one.** `clara._plan_admit_occurrence` already
resolves a PER-DUE-DATE line in its own VOLATILE body and hands it to `clara._plan_occurrence_basis`
as an ARGUMENT — which is exactly what lets that body stay IMMUTABLE — and already treats a NULL
line as a real answer refused BY NAME on the occurrence rather than a licence to fall back to the
revision's constant. This file adds the accrual lane's own resolver beside the amortisation one and
teaches the admission core to ask it. `clara._plan_occurrence_basis` is NOT touched: the prestate
and the tail both re-hash it, and the tail re-asserts it is still IMMUTABLE.

**The amounts live in `clara.accrual_period_amounts`, keyed on the accrual DETAIL and the due
date.** Not a jsonb column on `clara.accrual_adjustments` (append-only by trigger with exactly one
admitted update, 0284's correction stamp — a blob there could never be corrected), and not the
amortisation lane's `period_lines` jsonb either: that array is a frozen evaluator's DERIVED output
carried verbatim, and this one is figures a person typed. Opposite provenance, separate carriers.
The relation holds no `plan_id` and no `revision`: the detail names both, and a denormalised pair is
a second place for them to disagree. Append-only in full, RLS forced, `relacl` NULL — every reach is
a definer door.

**Which accrual detail is "live" is the highest revision on the plan, not `= the live plan
revision`.** A bookkeeper may lawfully revise the plan itself (`clara.revise_accounting_plan`) to
widen or withdraw authority, which advances the plan to a revision the accrual detail does not name;
keying the resolver on equality would make it answer NULL for an accrual that is plainly still
running, and the admission core would then post the frozen constant (the accrual's TOTAL) for every
remaining period. Highest revision is the rule `apps/web/lib/accruals/api.ts`'s own
`liveAccrualForPlan` already states for the same relation. A plain reversing journal nobody
configured from an accrual has no detail row at all, so the probe answers NULL, neither arm is
taken, and its constant basis keeps posting byte for byte.

**A reversal resolves its own PRIMARY's line, and only once that accrual has posted.** The reversal
leg falls on the first day of the month after the accrual it undoes, a date this relation
deliberately holds no row for, so the recut core resolves on `v_primary_due` — the accrual date it
has already measured under the plan lock for the orphan wall. The accrual arm is gated on
`v_primary_entry is not null` for a reversal leg, so a reversal with nothing behind it falls through
to 0193's orphan wall and is refused as `reversal_before_primary` — its honest name — instead of
being told its period has no stated amount.

**The door enforces five rules; the occurrence enforces the sixth.**
`clara._assert_accrual_period_amounts` (IMMUTABLE, ungranted, called from `clara._accrual_finish`
and from `clara.correct_accrual_adjustment`) asks: every element carries an ISO `due_date` and a
positive integer `amount_cents` with no two naming one date (`accrual_period_amount_invalid`,
`accrual_period_amount_duplicate`); every stated date is one this schedule actually produces inside
the authority window, walked with `clara._plan_due_nth` itself
(`accrual_period_amount_not_scheduled`); every date the schedule produces is stated
(`accrual_period_amount_missing`); the amounts sum EXACTLY to the accrual's own `amount_cents`,
which under this rule is the TOTAL for the window (`accrual_period_amounts_unbalanced`); and the
final-period remainder convention binds exactly the shape it names — when the set IS an equal split
with one odd period, that period must be the LAST (`accrual_period_remainder_misplaced`). A
genuinely uneven set never enters that arm: the convention governs where a DIVISION's leftover cent
goes, not what a person may state. Under any other rule a `period_amounts` key is refused outright
(`accrual_period_amounts_unexpected`).

The sixth is the one the door cannot see: a due date that appears AFTER configuration, because
`clara.revise_accounting_plan` widened the window. That records
`accrual_period_amount_missing` (CLR10) on the occurrence, admits no Work and posts nothing — and
the SAME row becomes admissible once a correction states the amount, exactly as 0223's own
missing-line refusal behaves.

**`clara._accrual_canonical` is recut to fold the set in**, sorted by due date. All three doors
reserve on `clara._hash(… clara._accrual_canonical(p_accrual) …)`; a canonical form blind to
`period_amounts` made two DIFFERENT per-period sets under one op key a REPLAY of the first rather
than the typed `op_key_conflict` the estate promises (`p937.op_key` drives exactly that, and its
vacuity control is a revert of this body to 0222's — which reproduces the hole).

**`clara._accrual_methods()` and `accrual_adjustments_method_check` widen together, and the tail
proves they agree by DRIVING the predicate.** Not a text comparison of the two spellings — that
would pass on a constraint admitting something the function never offers — and not a dynamic
`execute` of the constraint's rendered expression either: `apps/web/test/sqlFunctionCensus.ts`
refuses a migration whose `execute` it cannot resolve statically, and that rule is right, because a
migration that builds SQL at run time cannot be read by the tooling that audits what migrations do.
The tail instead creates a TEMPORARY table carrying the byte-identical literal CHECK, ties it to the
real one by comparing their rendered `pg_get_expr(conbin, conrelid)` output whitespace-normalised,
then INSERTS one row per member of `clara._accrual_methods()` (all must be accepted) and one each
for the two withdrawn rules, a blank, an unenumerated word, a method object carrying a second key
and a non-object (all must raise 23514).

**No new granted name, so no `rig-meta.mjs` cohort** — the 0285/0295 shape, not the 0284/0302 one.
Every function this file adds is an ungranted internal reached through doors that already exist, and
the tail asserts that no `clara\_%` role but `clara_fn_owner` can execute either of them.

**Redo-safe by construction** ("Redo (#957)" above): `create table if not exists`, `create or
replace function`, `drop trigger if exists`, `drop policy if exists`, `drop constraint if exists`
before the widened CHECK, and a prestate that reports FIRST APPLY or REDO instead of refusing on
this file's own objects — the five bodies it recuts are each pinned at their pre-image OR at this
file's own output and must be at exactly one of the two, so a half-applied state is refused by name.
Both branches were driven on `clara_l03`: the real first apply, then `CLARA_MIGRATION_REDO`.

## 0304 — the accrual lane gains a revenue side (#942, riders wave 4, lane 03)

At month end a service has been delivered and the invoice has not been issued. The accountant
states the amount and the service period; the books should carry **Dr accrued income (an asset) /
Cr the revenue account** on the due date and its exact reverse on the first day of the following
month, so that when the invoice is finally issued the estimate and the invoice net to ONE revenue
amount for the period. Before this file the lane could only accrue an expense. It is now the SAME
lane with a **side** — one lane with a side, not a second lane, which is the owner's own 2026-09-18
decision quoted in #942's body.

**The two column names stay, and that is a constraint rather than a preference.**
`clara.accrual_adjustments.expense_account_code` is now THE PROFIT-AND-LOSS LEG (an expense account
under `side='expense'`, an income account under `side='revenue'`) and `liability_account_code` is
THE BALANCE-SHEET LEG (a non-control liability, or the accrued-income asset). The names are
historical — 0222 minted them when the lane had one side — and they are not renamed here because the
wire keys of `p_accrual` are the same two words and the tool that sends them
(`packages/runtime/lib/accrual-basis.ts`, `start_accrual_work`) is FROZEN: renaming them would break
a hosted tool the moment this migration applied. Renaming the COLUMNS while keeping the KEYS would
leave the estate with two names for one thing, which is worse. #942's report carries the rename as a
successor-contract follow-up for the `chatTurn_v22` cut, where that tool is re-cut anyway.

**An absent side is `expense`, everywhere, decided by one body.** The column is
`not null default 'expense'`, so every row written before this file reads `expense` with no backfill
statement at all, and `clara._accrual_side(jsonb)` answers what an absent or blank key means for the
door, the canonical form, the basis builder and every wall — they cannot disagree about it.
`clara._accrual_sides()` mirrors `clara._accrual_methods()`: the closed set lives in a function, the
table's CHECK carries the same two literals, and the tail proves the two agree by DRIVING a
byte-identical predicate on a temporary table (both members accepted; `both`, `income`, a blank and
`Expense` each refused 23514) rather than by comparing two spellings.

**The pair is judged BY the side, through the SAME predicate and the same typed refusal reasons.**
`clara._assert_accrual_account` now judges four types instead of two, so its message grew an article
(`must name an income account`, not `a income account`) and its non-control token names WHICH leg
refused: `non_control_liability` renders byte-identically to what the expense side has always
raised, and the revenue side's asset leg gets `non_control_asset`. The non-control rule is the same
rule for the same reason on both sides — a control account reconciles to identified detail
(CONTEXT.md, "Control account") and an accrual has none: an unbilled fee is no more an open item of
the receivables ledger than an un-invoiced supply is one of the payables ledger.

**The side decides which leg is debited, and the expense side is byte-unchanged.**
`clara._accrual_journal_basis` builds `[Dr asset, Cr income]` under `revenue` and its old
`[Dr expense, Cr liability]` under `expense` — the `else` arm is the old body, comment for comment,
so no posted entry and no frozen revision basis in the estate reads differently after this file. The
REVERSAL leg needed nothing: `clara._plan_occurrence_basis` produces it by swapping every line's
debit and credit, which is already side-agnostic (pinned here, untouched, re-hashed in the tail).
`clara._plan_accrual_period_line` (#937's per-period override) applies the same mirror to the figure
a person stated for one due date, so a per-period accrual posts the right way round on either side.

**The side is part of the accrual's identity, in two places.** It joins
`clara._accrual_canonical`, so two configurations differing only in their side hash differently and
one op key can never answer for both (`p942.op_key` drives exactly that). And
`clara.correct_accrual_adjustment` REFUSES a correction that asks for the other side —
`accrual_side_immutable`, CLR10, on `accrual.side`. A correction restates the particulars of the
accrual a plan is running; flipping the side would leave a schedule whose posted periods are
Dr expense / Cr liability and whose next period is Dr asset / Cr income, under one authority and one
purpose. The honest act is to let that authority end and configure the other side's own accrual.

**The "a document arrived inside an accrued period" read (#938, 0302) gains its revenue arm by
saying what it is about.** The predicate was already side-agnostic — it joins the accrual's own
profit-and-loss leg, which on a revenue accrual IS the income account, so an issued invoice or a
receipt posting to it inside a posted, un-reversed period already surfaced the item (MEASURED before
this file was written). What it could not do was name the side: it called every collision "a
document-sourced entry". This file splices two additive edits onto the INSTALLED body — the sentence
names the side (and the expense side's own words render character for character as #938 shipped
them), and the row carries `accrual_side`, derived at json-build time from the shared `id` exactly
as `asset_id`/`advance_id`/`authority_id` are. A SPLICE rather than an embedded recut, for a reason
this wave makes concrete: other lanes are adding row kinds to that same body in the same wave, and a
file that embedded its own copy would silently drop whichever arm landed at a lower migration number.

**No account is minted.** `1180 Accrued Income` already exists by code and name (0295,
`my_sme_starter` v2) under the owner's 2026-09-20 ruling that #941 and #942 SHARE one row: this file
consumes it, and the battery's `p942.standard_chart` cell reaches it by applying the CURRENT
published platform template through the real doors rather than by planting a look-alike.

**No new granted name, so no `rig-meta.mjs` cohort** — the 0285/0303 shape, not the 0284/0302 one.
Both functions this file adds are ungranted internals, and the tail asserts that no `clara\_%` role
but `clara_fn_owner` can execute either.

**Redo-safe by construction** ("Redo (#957)" above): `add column if not exists`,
`drop constraint if exists` before the CHECK, `create or replace function` throughout, and a splice
that recognises its own marker and skips rather than doubling. The prestate pins each recut body at
its pre-image OR at this file's own output and stops dead if any is at NEITHER; a mixed read is
reported rather than refused, because a migration applies in one transaction and the only way to see
a mixture is a REDO of a file whose recut set grew between two redos on a development rig — which is
how this file was built, one slice at a time. Both branches were driven on `clara_l03`: the redo on
the live database, and the FIRST-APPLY branch of the CURRENT file inside a transaction that restored
all ten pre-images (each re-created from 0222's or 0303's own statement and verified by sha against
the pin), un-spliced the queue, dropped the column and the two functions, ran the whole file and
rolled back.

### Fix round 1 — what the reviews moved

**The splice is now FIVE guarded edits, each idempotent on its own marker.** The block used to test
ONE marker (`accrual_side`) for the whole splice, which made it un-redoable the moment a later round
added a second edit: under `CLARA_MIGRATION_REDO` the body already carried that marker and the new
edits would have been skipped with it. Every edit applies only when its own marker is absent, so a
redo converges on exactly the body an apply produces. The three the fix round added:

* **The amount is the FLAGGED PERIOD's own, not the window total** (ADV-04). #937 (0303) changed
  what `accrual_adjustments.amount_cents` MEANS under `stated_period_amount` — it is the window
  total, and each due date posts its own stated figure — AFTER #938 had already written that column
  onto the row, so a bookkeeper comparing a document with "Accrual amount" was shown a number the
  period never posted. The arm now resolves `clara._plan_accrual_period_line(o.plan_id, o.due_date)`
  — 0303's own "what does THIS due date accrue" body — and falls back to the column only where that
  answers null, which is the `stated_amount` rule it is still true for.
* **The row carries the plan's status** (ADV-03). Both remedies are plan-lane doors that refuse a
  plan which is not active (`plan_ended` / `plan_paused`) while the double count they were offered
  for is still on the books, so ending a plan used to leave a permanent item offering two buttons
  that could never succeed. Dropping such a row would hide a live double count: the row STAYS and
  says why, and the surfaces render the remedies unavailable with the reason. Derived from the
  shared `id`, so no arm's column vector moves.
* **An issued invoice is not a filed document** (AC3). A sales invoice admitted through the
  trade-invoice lane posts through `clara._record_journal_entry_core` (0225) with `origin='agent'`
  and a NULL `document_id`, so #938's filed-document predicate could never see one and an accrued
  FEE double-counted its period unwarned. The REVENUE side now also admits an entry that IS a
  `sales_invoice` trade invoice's own posting, joined the one way the estate links them
  (`trade_invoices.work_id` → the committed `operation_receipts` row whose `effects` names the
  entry). The EXPENSE side is deliberately unwidened: #938's AC1 says "document-sourced journal
  entries" and a supplier bill reaches this estate AS a filed document. The residual — a supplier
  bill admitted through the trade-invoice lane — is a follow-up, named rather than smuggled in.

**The shared column vector's postcheck is measured** rather than pinned at eleven, for 0302's own
reason above, and the tail now re-checks `clara.list_accrual_adjustments`'s grant beside
`correct_accrual_adjustment`'s and `get_accrual_adjustment`'s: it recuts three externally-granted
doors and the census covered two (STD-942-01).

## #933 — the depreciation-particulars proposal rides `source_ref`, and needs no migration

#883's second half puts Clara's proposed particulars (method, life or rate, residual, start date,
and the one line she derived them from) into the #639 dependent particulars question, so the three
answering surfaces can pre-fill from it. That looks like a new column and is not one:
`clara.agent_interruptions.source_ref` is constrained to `null or jsonb_typeof(source_ref) =
'object'` and nothing more (0180:183), and `clara.open_work_question` validates the FIELDS while
passing `p_source_ref` through untouched (0180:579-589). So the proposal travels as an extra key
inside #639's own `{kind:'fixed_asset', asset_id}` stanza, and **#933 adds no migration**.

That is a claim about a live database, so `tests/fa-particulars-proposal.test.mjs` measures it
rather than reading it off the file (frontier-gated on `fixed_asset_acquisition$` through the
shared `fixed-asset-acquisition-fixtures.mjs`, so it is dormant below 0216):

* `p933.wire.verbatim` — the extended `source_ref` is admitted, the Work parks exactly as #639
  leaves it, and the human's own `clara.get_work_pending_question` returns the block KEY FOR KEY
  (all nine keys, none added, none dropped by the jsonb round trip).
* `p933.wire.answerable` — the question still ANSWERS, and the stored answer is the person's
  EDITED values while the proposal stands unedited beside them on the same row, so "who decided 84
  months, and against what" is answerable a year later.
* `p933.read.by_asset` — the two register-side entrances hold an asset id and no question id (the
  `fixed_asset_incomplete` queue row carries `asset_id` alone), so they find the question by
  `source_ref->>'asset_id'` under `p_agent_interruptions_human`. The cell issues exactly the filter
  PostgREST compiles for `apps/web/lib/registers/fa-particulars-proposal.ts`, as the human, so the
  column grant and the policy are what is proven.
* `p933.read.firm_walled` — a person of another firm reads NO row for the same asset id: the policy
  is `firm_id = clara.jwt_firm()`, so the empty answer is indistinguishable from "no such asset".
* `p933.wire.object_only` — an ARRAY `source_ref` is refused while the object form carrying the
  extra key is admitted, which is what turns "no migration is needed" into a measurement.

Vacuity control: with the fixture changed to park the question WITHOUT a proposal, cells 1–3 go
red and 4–5 stay green; the fixture was then restored byte for byte.

## 0305 — a prepayment with no document is amortised from a person-stated service period (#939, riders wave 4, lane 04)

`ck_je_basis` (0003) admits a MEMO-ONLY journal entry: the client paid a year of insurance and said
so, the accountant recorded the payment against a prepaid asset, and no invoice ever arrived.
`clara.prepayment_schedule_v1` reads its term off `clara.document_service_periods`, which is keyed
to a DOCUMENT, so such an entry answered `prepayment_term_underivable` naming
`journal_entries.document_id` and the lane stopped there — a prepaid asset on the books with nothing
amortising it, and no remedy but inventing a document. The accrual lane already accepts a
person-stated period with no document; `0305_prepayment_stated_term.sql` brings the prepayment lane
level with it.

**The second term carrier.** `clara.prepayment_stated_terms` sits at RECOGNITION-ENTRY grain, not
document grain, because the recognition entry is the only durable thing a memo-only term is about.
It is NOT a nullable `document_id` on `clara.document_service_periods`: that relation's tenancy is a
composite FK onto `clara.documents(id, firm_id)`, its liveness index is `unique (document_id) where
superseded_at is null`, and its congruence trigger resolves region → extraction → document — making
the column nullable would void all three at once, on the table the accrual lane and the prepayment
lane share. Its discipline is that relation's own, column for column: supersede-never-mutate
(`t_pst_supersede_only`), one live row per source entry (`uq_prepayment_stated_term_live`), a
REQUIRED free-text `reason`, a recorded `stated_by`/`stated_at`, finite and domain-bounded dates,
and the SAME 120-month cap computed with the SAME arithmetic the evaluator uses
(`ck_pst_max_periods` is `ck_dsp_max_periods`' expression verbatim — the owner's decision 5 is "the
same cap", and a cap computed a second way would be a second cap). Forced RLS with an owner policy
and a SELECT-only, firm-predicated, bookkeeper-floored human policy.

**One human door, and no machine lane at all.**
`clara.record_prepayment_stated_term(client, source_entry, period_start, period_end, reason, op_key)`
is bookkeeper-floored (the owner's decision 2: the same floor as recording a document's service
period), `clara_authenticated` ONLY, with `clara._reserve_op` idempotency taken before any mutable
validation. There is no agent grant and NO WAKE WRAPPER — the owner's default 6: a period a model
supplied would be a model-generated value entering a durable artifact, so the model may only ever
ask the fixed two-date question. The tail asserts that by a `pg_proc` count (exactly one function
is named for the stated term), not by convention. The door refuses a document-bound recognition by
name (`prepayment_stated_term_source_has_document`, naming
`clara.record_document_service_period` as the remedy): two live terms for one prepayment would have
no rule for which wins.

**Prestate pins are PER BODY, not global.** 0285 (#919) pinned its two recut bodies under one mode
and refused a half-and-half reading. That coupling is right for two bodies recut for one reason in
one go and wrong here: 0305 recuts four bodies for four different reasons, and sibling tickets of
the same lane recut some of the same reads immediately after it. Each body therefore admits exactly
two pre-images of its OWN — its measured live `sha256(prosrc)`, or a body already carrying this
file's `#939` attribution — and anything else is real drift and refuses by name. The mode each body
was found in is reported in the notice, so a half-and-half reading is visible rather than silent.
`clara.prepayment_schedule_v1` is pinned UNCONDITIONALLY at both ends of the file: it is a
registered single-member `clara.evaluator_versions` closure and this file never touches it, so a
changed sha is always a finding.

**The second evaluator.** `clara.prepayment_schedule_v2(total_cents, account_code, release_side,
term_start, term_end)` is `clara.prepayment_schedule_v1`'s formula UNCHANGED — whole-calendar-month
straight line, a month charged iff the term covers its FIRST day, the remainder wholly in the final
period — with the amount, the released account, the released SIDE and the term supplied as
arguments. What changes is who decides: v1 reads the term off `clara.document_service_periods` and
the amount off "the one debited asset leg", so the EVALUATOR picks both the source leg and the term
source; v2 moves those two choices to the DOOR, because they are exactly what #939 makes
conditional. `release_side` is an argument rather than a default because a prepaid ASSET is released
by credit and a deferred-revenue LIABILITY by debit, and getting that wrong posts the books
backwards — which is also how the #941 deferred-revenue mirror rides the same evaluator.

It calls no other `clara` function and reads no table, which is what keeps its own
`clara.evaluator_versions` registration a genuine SINGLE-MEMBER closure (registering an N-member
closure freezes N bodies estate-wide). The 120-month cap lives inside v2 as well as on both
carriers: v1 can never meet a longer term because its carrier refuses to hold one, but v2's term is
an argument and without the wall it would emit a 121st line for a term no door admits.
`prepayment_schedule_v2` is NOT in `frozen-evaluators.json`: that lint discovers only the
`clara.evaluate_*` spelling (`check-frozen-evaluators.mjs:62`), which is why
`clara.prepayment_schedule_v1` has no entry there either — the DB-side freeze
(`clara.verify_evaluator_freeze()`, run by `migrate.mjs` between every migration body and its
commit) is what binds both.

**The registration is a ONE-SHOT act, including for this file's own author.**
`clara.evaluator_version_members` is append-only and `clara.evaluator_versions` refuses DELETE, so
the freeze block is guarded by a presence test rather than an upsert. A redo after an edit to the
v2 body therefore leaves a stale member hash and `verify_evaluator_freeze()` fails that apply —
loudly, which is correct: once registered, a changed formula is a `_v3`, never an edit.

**The door picks the lane, and only the lane is new.** `clara.create_prepayment_schedule` now reads
the recognition entry once and branches on the one fact that decides it — whether it binds a
document. The document lane is 0223's body unchanged: `clara.prepayment_schedule_v1`, its returned
refusals re-raised, the `clara.document_service_periods` row re-read so the schedule names the exact
term it rode. The memo-only lane asks v1's three fitness arms IN THE DOOR (posted; exactly one
debited asset leg; a fiscal year that admits the term) with 0140's own tokens, sentences and payload
keys, then calls `clara.prepayment_schedule_v2` with the leg it picked, the `'credit'` side a
prepaid asset is released by, and the live stated term. v2 cannot ask those arms — it reads no table
by design, which is what keeps its closure at one member — so the door asks them, which is the
ticket's own line: the door, not the evaluator, picks the source leg and the term source. The
prepaid-leg eligibility wall is asked AFTER the branch, so it guards both lanes.

The refusal a memo-only prepayment used to get named `journal_entries.document_id`, which told a
firm its prepayment could never be amortised at all. It now carries
`missing: "prepayment_stated_terms"` and `remedy: "clara.record_prepayment_stated_term"` — 0140's
"the refusal NAMES what to record and where", finally true for this lane too. `schedule_version`
reads `v1` on a document-backed schedule and `v2` on a human-stated one, and
`evaluator_version_id` resolves by the entrypoint signature the branch chose rather than by a
literal.

**Both reads are extended, not forked.** `term_live`, `term_superseded_by`, `term_moved`,
`term_current_start` and `term_current_end` keep their exact #919 meanings and are now computed
against WHICHEVER carrier the schedule rode, chosen by `term_source`. A surface written against
#919 keeps working; forking them into `document_term_live` / `stated_term_live` would have made
every reader ask which pair to trust. ADV-02 carries over unchanged, because
`clara.record_prepayment_stated_term` supersedes unconditionally too. Three fields are genuinely
new: `term_source`, and `term_stated_by` / `term_stated_at` / `term_reason`, which are NULL on the
document lane rather than filled from the document's own recorder — "a person stated this term" is
a different claim from "somebody typed a service period off an invoice".

`list_prepayment_schedules`' join onto `clara.document_service_periods` was INNER (0285) and is now
LEFT. That is a fix, not a refactor: the moment a schedule exists with no document row it would
have been ABSENT from its own firm's list — live in the books, invisible on the screen.
`clara.get_prepayment_schedule`'s envelope is now built as two `jsonb_build_object` calls
concatenated with `||`, because that function is variadic and PostgreSQL refuses more than 100
arguments (54023, measured here the moment the five new keys were added).

**Arm B of the attention read stops hiding memo-only prepayments.** Its
`je.document_id is not null` filter was not arbitrary — with no other carrier a memo-only
recognition could never be configured, so listing it would have offered an action that could only
refuse — but with #939 it hides exactly the prepayments this ticket exists to rescue. Each
candidate now carries `term_carrier` (which carrier its term would live in), `has_live_term`
computed against that carrier, and `next_step` as a closed token: `configure_schedule`,
`record_document_service_period`, or `state_service_period`. A token rather than a sentence,
because the copy is the surface's and the fact is the database's. `clara._adj_line_eligibility_breach`
is now the only thing keeping an ordinary memo-only receivable out of the band, so
`p939.attention.memo_only` drives that wall on this lane rather than assuming it carries over.

**The closed-wave floor moves in the same PR that moves it.** Registering `prepayment_schedule` v2
adds a ninth row to `clara.evaluator_versions`, and three closed-world censuses count that roster by
name and version: `delta-contract.test.mjs`, `delta-catalog-phase.mjs` and
`epsilon-contract.test.mjs`. Each of them also runs the test-time one-way deploy ceremony over every
registered closure EXCEPT a named exclusion list — so without an entry the ceremony flips v2 on
sight (measured on the lane rig the moment 0305 applied: the floor read one too many, and
`_tf_evaluator_deploy_once` makes that flip irreversible without disabling the trigger). v2 joins
`evaluate_fs_pack_agent` v1, `evaluate_metric` v2 and `prepayment_schedule` v1 on the exclusion list
for the reason all three are there: evaluator versions are BORN undeployed and the flip is a
separate ceremony act. The rosters are extended, never loosened — each addition is conditional on
the row existing, so the censuses stay exact on a pre-0305 chain too.

## 0306 — a per-client roster of prepayment accounts gates amortisation ahead of the shared wall (#940, riders wave 4, lane 04)

`clara.prepayment_schedule_v1` (0140) takes "the one debited asset leg" verbatim and never asks
WHICH asset. 0223 put `clara._adj_line_eligibility_breach` (0042) on that leg and 0305 carried the
same wall onto the memo-only lane, but that wall is NEGATIVE — not a control account, not a bank
account, not inactive, not reserved by the fixed-asset or staff-advance rosters — so an ordinary
asset account with no class, no bank stamp and no reserved role passes it on both lanes. A utility
deposit, an inventory purchase or a prepaid tax could therefore be amortised into expense for a
whole stated term with every entry balanced and every period receipted, and arm B ADVERTISED them
with a "configure the schedule" action beside each. 0223's own header named the missing half and
said why it had not been built: "a roster would need a chart-level classification this estate does
not carry".

**Why it is not a chart classification, measured rather than assumed.** `coa_accounts.account_class`
admits only `payable` and `receivable`, and the shared wall refuses ANY non-null class as a control
account — so a `prepaid` member of that enum would make every prepaid account INELIGIBLE (#911's own
triage measurement, 2026-09-17, and the reason the owner's ruling rejected option D). The positive
classification needs its own carrier, and the estate already has the shape: the per-client enrolment
register.

**The roster.** `clara.prepayment_account_enrolments` is `clara.staff_advance_accounts`' (0043)
shape, which is itself `clara.fa_account_profiles`' (0041) clone — an immutable
`[enrolled_at, retired_at]` interval, version-forward on any change, a REQUIRED non-blank reason,
a no-delete + no-truncate pair, forced RLS and a SELECT-only application grant. Per CLIENT, not a
mark on the firm's template (owner decision 1: the same template account is a prepayment for one
client and an ordinary deposit for the next). One live row per `(client, account, purpose)`
(`uq_prepayment_account_enrolments_live`).

Two things it does NOT copy from those two:

* **an update guard.** 0041 and 0043 both carry none, and say so. Here the REASON is the fact the
  roster exists to hold, and a reason that could be rewritten in place is a label rather than a
  basis, so `_tf_pae_retire_only` admits exactly one update — the retirement stamp — and refuses a
  retired row outright. The version-forward path never needs an in-place edit (it retires and
  inserts), so the guard costs the doors nothing.
* **the op-key columns.** 0043 carries `created_op_key`/`retired_op_key`; `clara.op_receipts`
  already records which decision wrote which row, and 0041's profile carries neither.

**The purpose is a closed set from birth.** `purpose in ('prepayment', 'deferred_revenue')`.
Deferred revenue (#941) is the mirror of this lane — a credited LIABILITY released over the same
term by the same evaluator — and it needs the same positive roster with a different account-type
rule. A second relation would give two answers to one question, so the owner's 2026-09-18 ruling is
"No second roster is ever opened". The COLUMN admits the second purpose today; the DOOR refuses it
by name (`prepayment_account_enrolment_invalid` / `purpose_rule_not_stated`) until #941 states that
rule, because admitting a purpose whose rule does not exist would enrol a liability under the asset
rule.

**The two doors.** `clara.enrol_prepayment_account(p_client, p_account, p_purpose, p_reason,
p_op_key)` and `clara.retire_prepayment_account(p_client, p_account, p_purpose, p_op_key)`, both at
the BOOKKEEPER floor and granted to `clara_authenticated` alone — no agent grant, no wake wrapper,
asserted by `pg_proc` count in §TAIL rather than by convention. Enrolment answers every reason an
account cannot hold prepayments (owner decision 6, "the refusal happens at enrolment with a stated
reason, not later at the schedule door"):

| axis | source |
|---|---|
| `account_unknown` / `account_inactive` / `control_account` / `bank_account` / `account_reserved` | `clara._adj_line_eligibility_breach`, the ESTATE's own rule, carried through with its own axis |
| `not_asset_class` | the one positive rule this purpose adds — a prepayment is a prepaid ASSET |
| `reason_missing` | owner decision 4 |
| `purpose_unknown` / `purpose_rule_not_stated` | the closed set, and the arm #941 opens |
| `not_enrolled` (retire) | a no-op that answered "done" would let a panel report a retirement that never happened |

Re-enrolling with the SAME reason is idempotent; a RESTATED reason retires the live row and inserts
a fresh one, so the basis a schedule was configured under stays readable for as long as the schedule
does.

**One spelling, four callers.** `clara._prepayment_account_enrolled(client, code, purpose)` is the
whole roster question, `stable security definer` and granted to NOBODY (it is reached only from a
definer body, exactly as the shared wall is). §D's recut of `clara.create_prepayment_schedule` calls
it; §E's recut of `clara.list_prepayment_attention` calls it in arm B's candidate predicate; #915's
OBO twin and #941's deferred-revenue mirror call it with their own purpose. A predicate copied into
four bodies is four chances for the band and the door to disagree, and the brief's own criterion is
"the door and arm B agree both ways".

**The order is roster-then-wall, and that is the brief's.** An account that fails both is told about
the roster, because the reason it can never be enrolled is stated at the enrolment door. The wall is
UNCHANGED and still guards the accounts the roster admits — an account enrolled while it was
eligible and bound as a bank account the next day answers `prepaid_account_ineligible` with the
shared helper's own breach, which `p940.schedule.roster_gate` drives rather than asserts. §0 pins
`clara._adj_line_eligibility_breach` and `clara._acct_role_reserved` UNCONDITIONALLY and §TAIL
re-measures the first after the file has run: "this file does not change the wall" is a claim, and
the sha is the evidence.

**Nothing on the admission path asks the roster** (owner decision 3/5). Retiring an account closes
it to NEW schedules and nothing else: `p940.retire.future_only` retires the account BEFORE a single
period has posted — the worst case — and then drives the monthly scan, the Work claim and a real
posting through the OBO door to a committed receipt, with the stored allocation byte-identical
afterwards and no roster row back-filled by any of it.

**Prestate pins, measured on `clara_l04` after 0305:**

| signature | `sha256(prosrc)` | mode |
|---|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `d1d3b5326009c6d1149075d5fcb1c6eff943c4c59034685b59c4fa3ec0c50f4a` | bimodal (recut by §D) |
| `clara.list_prepayment_attention(uuid)` | `745ca3032410529233eb2bcad143553cb6a6b89026350fb5cb4450fe740093e9` | bimodal (recut by §E) |
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` | **unconditional** — asked, never edited |
| `clara._acct_role_reserved(uuid,text)` | `e1b44ed0c2449c4e4947e40b0d9d2675da73d02c7365e90453382e158ebf69cd` | **unconditional** — the reserved-account axis rests on it |

Per body, not global, for 0305's own stated reason: three sibling tickets of this lane (#915, #941,
#1036) recut some of the same bodies immediately after this file, so a global mode would refuse a
legitimate estate in which a sibling had already moved one of them. Each body admits its measured
pre-image or a body already carrying this file's `#940` attribution, and anything else refuses BY
NAME.

**Gate module, cohort, chain.** `tests/prepayment-account-roster-preintegration-gate.mjs` (stem
`prepayment_account_roster$`, env `CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_ROSTER`);
`PREPAYMENT_ACCOUNT_ROSTER_0306_COHORT` in `tests/rig-meta.mjs` (the two human doors on the
`clara_authenticated` roster, `_tf_pae_retire_only` and `_prepayment_account_enrolled` ungranted),
bimodal like 0305's; the `--import` entry in `package.json` in MIGRATION ORDER, immediately after
`prepayment-stated-term-preintegration-gate.mjs`.

**The shared scene builder enrols.** Every prepayment battery in this package reaches its
recognition through `prepaidScene` (`tests/f-a4-pr2a-fixtures.mjs`), so that builder now enrols its
prepaid account through the REAL door, guarded on that door's exact signature — a database pinned
before 0306 is unaffected. `prepaymentRosterGateLive()` is the shared probe a cell asks when its
expected REFUSAL differs either side of this frontier; `p653.schedule.prepaid_leg_ineligible` is the
one such cell, and it now measures the wall's judgement where it speaks after 0306 — at the
enrolment door.

## 0307 — the prepayment-schedule door gets its `clara_runtime` twin, on the human door's own body (#915, riders wave 4, lane 04)

`clara.create_prepayment_schedule` is granted to `clara_authenticated` alone and is
`_human_ctx`-fronted at the bookkeeper rank; 0223 defined no `_for` twin, and the three reads are
`clara_authenticated`-only. The runtime pool runs as `clara_runtime` and carries no JWT, so both
contracts written at the foot of `packages/runtime/lib/prepayment-schedule-basis.ts` — the chat tool
`start_prepayment_schedule_work` and the Work term park's `read_prepayment_source` — could only ever
return a grant refusal, which is why that module is still outside every frozen closure and why the
PRD's chat-entrance line for prepayment amortisation is not yet true.

**What this file adds.** An actor-explicit OBO twin
`clara.create_prepayment_schedule_for(p_client, p_author, p_source_entry, p_expense_account,
p_expense_basis, p_purpose, p_authority_ref, p_op_key)` in `clara.create_accrual_adjustment_for`'s
shape (0222) — `clara_runtime` only, the initiator named in an ARGUMENT and re-checked LIVE against
this firm's memberships — and one narrow machine-lane read,
`clara.read_prepayment_source_for(p_firm, p_client, p_source_entry)`.

### Why a shared core rather than a second body

This is the one place the file departs from 0222's precedent, and the reason is measurable in 0222
itself: the accrual pair duplicates its validation across two doors and has already drifted —
`clara._accrual_plan_core` still resolves authority with 0222's own `exists` probes while
`clara.create_accounting_plan` was narrowed by #977/0250 to refuse an instruction that is not a
PERSON's, so the accrual OBO lane accepts an authority reference the human lane refuses. The
prepayment door's body is ~500 lines (the term-carrier branch, #940's roster gate, 0042's shared
negative wall, the expense half, the allocation, the basis rung, the plan, the insert race and the
audit), and #915's own acceptance criterion is "the twin's refusal vocabulary matches the human
door's for every shared rule". Two copies of that body make that criterion a promise; one body makes
it a fact.

So the file EXTRACTS rather than copies:

| function | who runs it | what it owns |
|---|---|---|
| `clara.create_prepayment_schedule` | `clara_authenticated` | the op key, `clara._human_ctx(bookkeeper)`, the client ladder |
| `clara.create_prepayment_schedule_for` | `clara_runtime` | the op key, a null-author wall, the client ladder, the LIVE authority recheck |
| `clara._prepayment_schedule_core` | nobody (definer-internal) | everything else, byte for byte what the human door ran after 0306 |
| `clara._prepayment_plan_core` | nobody (definer-internal) | the amortisation plan step for the OBO lane |

The core's ONE new branch is `p_lane`, a closed set of two that raises on anything else. It decides
which plan step runs and nothing else.

### Why the OBO lane needs its own plan step

`clara.create_accounting_plan` resolves its actor through `clara._human_ctx` → `clara.jwt_sub()`,
and a `clara_runtime` connection carries no `request.jwt.claims`: nesting it would raise CLR04
`no authenticated actor` on every OBO call. `clara._accrual_plan_core` exists for exactly that
reason and `clara._prepayment_plan_core` is its sibling for the amortisation kind. It copies 0193's
authority ladder verbatim AND asks `clara._authority_ref_refusal` (0250/#977) — the line the accrual
core does not have — so the two prepayment lanes answer `authority_ref_invalid` (object / kind / id),
`authority_ref_unresolved` and `authority_ref_not_human_instruction` identically. It takes no op key
of its own: the outer `create_prepayment_schedule` reservation already covers the whole
configuration, which is the ONE deliberate difference between the lanes (the human lane additionally
holds 0193's nested `op_key || ':plan'` receipt).

### One op-key namespace, and the author is not in the hash

The reservation is taken inside the shared core under the verb name `create_prepayment_schedule`,
over a payload hash of the CALLER'S OWN ARGUMENTS — client, source entry, expense account, expense
basis, purpose, authority — and NOT over the author. That is what makes the ticket's convergence
true in both directions: a chat configuration whose response was lost and the human replay of the
same decision under the same key return one answer, one `clara.op_receipts` row and one schedule.
A hash that included the author would turn that replay into an `op_key reused with different args`
refusal, which is the defect `_reserve_op` exists to prevent.

### The machine-lane read

`clara.read_prepayment_source_for` is `clara.read_knowledge_record_for`'s posture (0230): SCOPE
EXPLICIT (firm and client are arguments, never inferred from a JWT the caller does not have),
`clara_runtime` ONLY, one subject, `stable`, and NO BYTES — there is no bytes key and there never
will be; the byte door is 0190's and is not reachable from a term read. It answers the entry's
status, posting date and bound document ID (an identifier, not content), the one debited asset leg
and its cents (or the candidate count when it is not exactly one), the RECORDED term from either
carrier — `clara.document_service_periods` or #939's `clara.prepayment_stated_terms` — with its
period, its basis KIND and the basis TEXT a person wrote, and the schedule that already amortises
the recognition if there is one. With no term recorded it reports the ABSENCE and names the HUMAN
door that fills it, never an empty term a run could read as "no term is needed".

Its consumer is `claraWork`'s term park, which cannot be cut until `claraWork_v6` (the report for
#915 carries the successor contract in full). The read is built now because a migration is not a
workflow cut's to write.

**Scalars, not records.** §E declares scalar locals rather than plpgsql `record`s, and the reason is
a defect this file met on the rig: a `record` that no `select into` ever reaches raises
`record "v_sp" is not assigned yet` the moment a field is read — so a memo-only recognition (no
document, hence no document-carrier select) made the read RAISE instead of reporting the absence it
exists to report. The same held for the prepaid leg when an entry debits zero or many asset
accounts.

### What it deliberately does not do

* It does not widen `clara.create_prepayment_schedule`'s ACL. `clara_runtime` still cannot execute
  it — an OBO call must name its human, and a runtime grant on the human door would be a
  configuration that names nobody. 0306's tail asserted that ("human-only until #915"); this file
  keeps it true by adding a door rather than a grant, and its own tail re-asserts it.
* It grants the agent role and both wake roles NOTHING. The legacy
  `clara.wake_establish_prepayment_schedule` (the template lane, wake source asserted disabled) is
  untouched: #1036 is the ticket that reroutes it onto this door.
* It opens no agent path to recording a service period or to enrolling a prepayment account. Both
  stay human doors with no wake wrapper (hard constraint 2; owner decision 4 of 2026-09-18).

### Prestate pins

One recut body, bimodal (its measured pre-image, or a body already carrying this file's `#915`
attribution), and six neighbours pinned UNCONDITIONALLY because the extracted core calls all six
verbatim and this file edits none of them:

| signature | `sha256(prosrc)` | mode |
|---|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `446a8dcd060ca7e274012e7a15baa6f5c54e912ee7c53633748adc26b88340b0` | bimodal (recut by §C) |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424` | unconditional |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7` | unconditional |
| `clara._prepayment_account_enrolled(uuid,text,text)` | `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db` | unconditional |
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` | unconditional |
| `clara.prepayment_schedule_v1(uuid,uuid)` | `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2` | unconditional |
| `clara.prepayment_schedule_v2(bigint,text,text,date,date)` | `9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194` | unconditional |

§TAIL re-measures all six after the file has run: "this file only extracts and adds" is a claim, and
the shas are the evidence. The pin on `clara.create_accounting_plan` is load-bearing in an unusual
way — this file deliberately does NOT call it on the OBO lane, so a change to it is a change to one
lane only, and the pin is what makes that visible instead of silent.

**Post-0307 live shas**, for whoever recuts these next (#941, #1036):

| signature | `sha256(prosrc)` |
|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `62f909b7802faacf1d8b18e4040e9bf70f99ce344f7120bc35f37be7c0e54879` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `0b34d44d70fa92f78f1d13dcf7866ce38aa99f7a6d2430cf329a48e4a7cd17dc` |
| `clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)` | `230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `6475458ed34d9b9ef357f8fb6e4eb9766042e30e1252c30d607fabd1a120495b` |

#941's deferred-revenue mirror and #1036's wake reroute now have ONE body to reach rather than two:
a lane that adds a rule adds it to `clara._prepayment_schedule_core` and both entrances have it.

**Gate module, cohort, chain.** `tests/prepayment-schedule-obo-preintegration-gate.mjs` (stem
`prepayment_schedule_obo_twin$`, env `CLARA_ALLOW_MISSING_PREPAYMENT_SCHEDULE_OBO`);
`PREPAYMENT_SCHEDULE_OBO_0307_COHORT` in `tests/rig-meta.mjs` (the twin and the read on the
`clara_runtime` roster, the two cores ungranted), bimodal like 0306's; the `--import` entry in
`package.json` in MIGRATION ORDER, immediately after
`prepayment-account-roster-preintegration-gate.mjs`.

## 0308 — a receipt a customer paid ahead is recognised as revenue over its service period (#941, riders wave 4, lane 04)

The expense side of the release lane has been complete since 0223/0305/0306/0307: a prepaid ASSET,
released by credit into expense, month by month. The REVENUE side had nothing. A customer who pays a
year of membership up front leaves the firm with a contract LIABILITY (MFRS 15 / MPERS §23 — the
entity owes a service, not money) and no way to earn it: the money sat in a liability account until
somebody remembered to journal it out by hand.

**What this file adds.** A `revenue_recognition_schedule` accounting-plan kind, a
`clara.revenue_recognition_schedules` relation in `clara.prepayment_schedules`' exact shape, the
deferred-revenue arm of #940's enrolment door, a recognition door with the OBO twin and the
machine-lane read #915 gave the expense side, the monthly admission arm, and three human reads (a
list, a detail, an attention band) in 0223's own shape.

### The accounting, stated so a reviewer can check it against the standard

One entry a month, `Dr deferred revenue / Cr the revenue account the accountant chose`, whole
calendar months, straight line, the cent remainder wholly in the final period, until the liability
clears to zero. Two rules are structural rather than conventional:

* **SST output tax is never recognised as revenue.** Output tax on an advance is owed to the Royal
  Malaysian Customs Department under the Service Tax Act 2018; it is not revenue and never becomes
  revenue. §F excludes any credited leg stamped `special_acc_type = 'sst_output'` from the candidate
  set BY THE ESTATE'S OWN STAMP rather than by code or name, so a receipt of `Dr bank / Cr deferred
  revenue / Cr SST output` has exactly ONE candidate liability leg. That is an impossibility removed
  from the set, not a choice made between two legs — which is why it cannot be wrong for a client
  whose chart numbers its tax accounts differently.
* **Straight line is the only pattern.** Usage-based and milestone recognition need a measure of
  progress this estate does not carry, and inventing one would be the database choosing a number.
  Anything else is refused by name, `recognition_pattern_unsupported`.

The evaluator is #939's FROZEN `clara.prepayment_schedule_v2`, ridden with `release_side = 'debit'`
— the argument #939 put there for exactly this caller ("a prepaid ASSET is released by credit and a
deferred-revenue LIABILITY by debit"). No second arithmetic exists on this side of the books.

### Why a second relation rather than a `kind` column on `clara.prepayment_schedules`

That table's own CHECK pins `plan_kind = 'amortisation_schedule'` and its columns are named for the
expense side (`prepaid_account_code`, `expense_account_code`, `expense_account_basis`). Widening it
would either file a liability schedule under columns that name it wrongly, or rename columns that
four batteries, three reads and a web surface already spell. `clara.revenue_recognition_schedules`
is that table COLUMN FOR COLUMN with three renamed for this side, which is what the brief asks for.

`clara.prepayment_schedules` is byte-identical after this file, and §TAIL re-measures the five
prepayment bodies this file relies on to prove it.

### The refusal tokens are this lane's own

0140's five prepayment tokens say "prepayment", and a bookkeeper recognising a customer's advance on
a Deferred revenue page would be told the wrong half of the books. The SHAPE is carried over token
for token — `_source_unfit` with an `axis`, `_term_underivable` with a `missing` and a `remedy`,
`_target_ineligible` / `_target_underivable` — so every surface that renders one renders the other
with no second grammar.

| token | when |
|---|---|
| `deferred_revenue_source_unfit` | the entry is not approved, has no single credited liability leg, or that leg's account is not on the roster (`axis: deferred_account_not_enrolled`) |
| `deferred_revenue_term_underivable` | no live service period and no live stated term stands for it |
| `revenue_target_ineligible` / `revenue_target_underivable` | the credited revenue account is unknown, inactive or not an income account; or its written basis is missing |
| `deferred_revenue_amount_below_period_granularity` | the advance cannot divide over that many months without a period recognising nothing |
| `deferred_revenue_schedule_exists` | that receipt already has a schedule |
| `recognition_pattern_unsupported` | any pattern but straight line |

### §A — the second purpose stops being a column and becomes a rule

0306 carried `purpose in ('prepayment','deferred_revenue')` on the COLUMN from birth and refused the
second value at the door, because the account-type rule was this ticket's to state. It now branches:
`prepayment` wants a prepaid ASSET (`axis: not_asset_class`), `deferred_revenue` a contract
LIABILITY (`axis: not_liability_class`). The CONTROL axis is already discharged by the shared
negative wall above it, so the arm adds the TYPE and nothing else. The roster stays keyed on
(client, account, purpose), so the two arms version forward independently and neither can retire the
other's enrolment.

### The prestate pins, with their modes

Six RECUT bodies (each admits its measured pre-image OR a body already carrying `#941`, so a redo is
safe) and nine KEPT neighbours (pinned unconditionally). Measured on the lane rig after 0307.

| recut signature | pre-image `sha256(prosrc)` |
|---|---|
| `clara.enrol_prepayment_account(uuid,text,text,text,text)` | `d55dcbdebd05a7d07adc8f1e8988d8ba440fdfed99b2573c24ea7f8ff07b56a1` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `99f6078775c07440122cde4f180c2f2f11aea7fcd5f0504cb6ffe6c8776cb424` |
| `clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)` | `1aca2dc26d5a9d0ac5ead59144561eb3292feb9df520f45982952604a9666b40` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `0b34d44d70fa92f78f1d13dcf7866ce38aa99f7a6d2430cf329a48e4a7cd17dc` |
| `clara._plan_admit_occurrence(uuid,date,text,text,boolean)` | `a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46` |
| `clara.preview_accounting_plan(uuid,integer)` | `49416814c59f54bc43d07ee0d795b87edb40aa41c6b54e058ed12fc81a7b05c6` |

| kept neighbour | `sha256(prosrc)` |
|---|---|
| `clara._adj_line_eligibility_breach(uuid,jsonb)` | `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021` |
| `clara._prepayment_account_enrolled(uuid,text,text)` | `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db` |
| `clara.prepayment_schedule_v2(bigint,text,text,date,date)` | `9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `c4148f6d95cd03876d6b8efe97d658e07e493e1743a075e1fe81901fd8fa61b7` |
| `clara._assert_journal_basis(jsonb)` | `2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684` |
| `clara.prepayment_schedule_v1(uuid,uuid)` | `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2` |
| `clara._plan_amortisation_period_line(uuid,date)` | `88d712d7f9b8e4edc8ece28936a75bfd30611476842dd6f7113d36735192578c` |
| `clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)` | `cef3264e2a8956dc3d08259b6c1f6bf90bd5c155c7f473f88504f778f611829e` |

The prestate also asserts three preconditions that are not shas: `clara.prepayment_stated_terms` and
`clara.prepayment_account_enrolments` exist, the purpose CHECK already admits `deferred_revenue`,
and a PUBLISHED platform chart template carries `2030` as a LIABILITY — the wave-4 pre-step (0295,
`my_sme_starter` version 2, v1 retired) is the first half of this ticket and this file mints no
chart row at all.

**Gate module, cohort, chain.** `tests/deferred-revenue-preintegration-gate.mjs` (env
`CLARA_ALLOW_MISSING_DEFERRED_REVENUE`); `DEFERRED_REVENUE_0308_COHORT` in `tests/rig-meta.mjs`
(the three human reads and the write on `clara_authenticated`, the OBO twin and the machine-lane
read on `clara_runtime`, the cores and the trigger function ungranted), bimodal like 0307's; the
`--import` entry in `package.json` in MIGRATION ORDER, immediately after
`prepayment-schedule-obo-preintegration-gate.mjs`.

## 0309 — a signed-out invitee can see which firm and role an invite names (#871, riders wave 4 lane 05)

**The question, in plain words.** Someone clicks an invite link. Before they sign in, can the page
tell them which firm and which role it is for? Until this migration, no: the only preview door,
`clara.preview_invite` (0224), needs a signed-in caller whose verified address equals the invite's,
and no server credential in the estate could read an invite either. The ticket's original brief
proposed the service-role key; riders wave 2 stopped it with evidence (that key holds ZERO
privilege on schema `clara` — `grep -rn service_role packages/db/migrations` returns nothing — and
`docs/plan/active/refresh-wave-2026-09-14/brief-620.md` had already disqualified it as a
privileged-read mechanism). **The owner ruled on 2026-09-23**: build a server-only database door on
the auth-wall pattern instead.

**What landed.**

* `clara.preview_invite_by_token(p_token text, p_origin_digest bytea) returns jsonb` — SECURITY
  DEFINER, owned by `clara_fn_owner`, `search_path = clara, pg_temp`, and EXECUTE granted to
  exactly one role. Three outcomes, all RETURNED:
  `{"outcome":"preview","firm_name","role","status","masked_email"}` for an OPEN invite,
  `{"outcome":"not_previewable"}` for an unknown, expired, revoked or accepted token, and
  `{"outcome":"rate_limited","retry_after_seconds"}` from its own wall.
* `clara_invite_preview` (NOLOGIN group, holds the one EXECUTE and no relation privilege anywhere)
  and `clara_invite_preview_login` (NOLOGIN shell, member of it) — 0163's role pair, one lane over.
  **No LOGIN attribute and no password is in this file**; the credential is an out-of-band operator
  ceremony — [deploy/invite-preview-login-ceremony.sql](deploy/invite-preview-login-ceremony.sql),
  on `read-logins-ceremony.sql`'s own shape — and the migration's tail REFUSES `rolcanlogin` on
  either role so one cannot arrive by migration. That ceremony's verification block prints the
  login shell's WHOLE effective EXECUTE surface in schema `clara` (expected: exactly
  `preview_invite_by_token`) and ends with a smoke call that returns the door's single refusal for
  a token that names nothing — the whole chain proven with no real token and nothing disclosed.
* `clara.invite_preview_attempts` — the wall's evidence: the token's sha256, the peppered origin
  digest, a timestamp. Forced RLS with a single owner policy, append-only, no truncate, no
  application grant, mirroring `clara.confirmation_attempts` (0163 §3).

**Why every refusal is RETURNED rather than raised.** `raise exception` aborts the transaction and
rolls back the attempt row this door just inserted — a raising refusal would make the wall vacuous,
and enumerating tokens would cost nothing and leave no evidence.
`clara.claim_confirmation_attempt` answers `allowed:false` for the same reason. The only two
exceptions are caller-side input-shape facts that depend on no invite and no window: `a token is
required` and `a digest is required`, both CLR10.

**Why its own evidence table and not `clara.confirmation_attempts`.** That table IS the applicant's
five OTP guesses. Routing previews through it either settles them `'rejected'` — five invite-link
loads would then lock out every signup behind the same address for fifteen minutes — or settles
them `'accepted'`, which the counting predicate EXCLUDES, leaving the preview unwalled. The SHAPE
is what this file reuses: two limbs (token, origin), a 15-minute window, a ceiling of 5, advisory
locks in numeric order, each limb's own wait computed independently and the maximum advertised
(0163's own BLOCKER-1 correction, because the row just inserted counts toward both limbs' future
windows). A walled preview degrades the landing page to "sign-in without the preview block"; it
never refuses a journey.

**This wall COUNTS BEFORE IT WRITES, and 0163 does not.** A call the window already refuses leaves
no row at all. That is a deliberate departure from the shape being mirrored, and it buys two things
0163 does not need: the evidence table is BOUNDED at five rows per key per quarter-hour, and a
refusal can never extend the window that refused it. The first cut inserted first — measured on
`clara_l05` inside a rolled-back transaction, with five attempts planted at 14/13/12/11/10 minutes
ago, the shipped body answered `retry_after_seconds` 120, then 180, then 240 on three successive
refusals and left eight rows; the shipped fix answers ~60, ~60 and leaves five. Since the writer is
an UNAUTHENTICATED page GET (`/invite/:token`), the old ordering let anyone holding a forwarded
invite link keep a real invitee's preview shut for as long as they kept reloading (adversarial
ADV-L05-04, 2026-09-24). Because the arithmetic no longer has to carry a just-inserted row, the
offset is the plain one: with `v_count` rows in a limb's window a future call is admitted once
`v_count - 4` have expired, the last of which is the ascending row at `offset v_count - 5`.

**The table is still unprunable as shipped, and pruning it is a MIGRATION rather than a job.**
`clara._tf_append_only()` raises for every role including the table's owner, and TRUNCATE is
blocked, so a retention lane must disable and re-enable that trigger inside its own migration as the
table owner. The follow-up on #871 says so in those words. The bound above is what makes that
follow-up housekeeping rather than an availability question.

**The five-state derivation AND the mask are shared, not forked.** The status CASE expression and
the masking block are both copied character for character out of `clara.preview_invite`'s live body
(0224 §A as widened by #872 / 0269 §2), and §D.T7 / §D.T7b assert on the LIVE catalog —
whitespace-normalised, in both directions — that each sits in both bodies. The mask earns its own
pin because it is the one field the ruling says must never widen: a later recut of the signed-in
mask alone would otherwise let the PUBLIC page publish more of a stranger's address than the
signed-in one, silently (spec review SPEC-871-C, 2026-09-24). A shared SQL function was refused for 0269's own measured reason:
Postgres checks EXECUTE against the INVOKING role for every function named in a view's body, so a
helper `clara.firm_invites_visible` could call would need a grant to `clara_authenticated`, and
PostgREST would expose it as a bare cross-tenant rank oracle.

**The role census stays lawful, and 0309 pins no absolute count.** 0154's tail pins the
cluster-wide `clara%` role count at 14 at its own point in the chain; `scripts/migrate.mjs` applies
files in ascending numeric order, so a role minted at 0309 does not exist when 0154 runs. 0309's own
prestate names the eighteen chain-minted roles it relies on and RECORDS the cluster count without
pinning it; its tail then proves the file moved that count by exactly two (or, on a redo, by
nothing). An absolute pin there was the first cut's defect: a live project also carries
`clara_storage_docs`, so hosted reads 19 where a disposable from-scratch cluster reads 18, and the
integrator's from-scratch proof could never have caught it. `deploy/roles-bootstrap.sql`'s VERIFY
census is trued in the same commit (21 total = 20 schema lanes + `clara_storage_docs`). The #867
cluster-reuse recipe now drops six roles instead of four and needed no code change —
`role-census-reset.mjs` derives its roster from the migration files themselves.

**0309 is REDO-SAFE (#957).** Its prestate reports FIRST (all four of its own objects absent) or
REDO (all four present) and refuses every half-applied state; every statement is
`create table if not exists` / `create index if not exists` / `drop policy`‑or‑`trigger if exists`
before each create / `create or replace function`, so `CLARA_MIGRATION_REDO=0309_invite_preview_public_door`
re-applies an edited unmerged file without hand surgery. The FIRST branch, which a redo can never
enter, was driven by hand on `clara_l05` inside a rolled-back transaction: the four objects dropped,
a deploy-shaped extra role created so the census read 19, the whole file run verbatim (tail OK,
roles 19 → 21), then rolled back with the lane database unmoved.

**Battery** (`tests/invite-preview-public.test.mjs`, 16 cells, every door call made through
`set role clara_invite_preview` — never `rootQuery`, which is superuser and proves nothing about
reachability):

* `p871.door.open` ×2 — the four fields and the mask for a live pending token; and the read mints
  nothing (no user, no membership, no op receipt, the invite still `pending`).
* `p871.door.no_oracle` — an unknown, an expired, a revoked and an accepted token answer
  BYTE-IDENTICALLY.
* `p871.door.five_states` — all five effective statuses are reached (asserted against
  `clara.firm_invites_visible`, read as the owner, as the independent source of truth), the
  SIGNED-IN `clara.preview_invite` is driven for the same five invites as the invited address and
  agrees with the roster in every one, this door reports that same status, firm name, role and mask
  verbatim in the two open states and the single refusal in the other three, and re-promoting a
  demoted issuer returns BOTH surfaces to `pending`.
* `p871.grant.only_the_group` — the exact ACL text (grantor included), seventeen other roles
  refused EXECUTE, and the group plus its shell allowed.
* `p871.grant.credential_less` — both roles NOLOGIN with no escalation bit, the exact membership
  chain, and zero relation privilege.
* `p871.grant.from_scratch` — exactly one migration mints the pair, its number is above 0154, and
  the migrator sorts numerically.
* `p871.wall.origin_limb` / `p871.wall.token_limb` — five served, the sixth walled, on each limb;
  an unknown token spends the budget exactly as a real one does; five evidence rows (the refused
  call writes none).
* `p871.wall.bounded` — twelve reads of one link from twelve addresses: five served, seven walled,
  and exactly five rows left behind.
* `p871.wall.no_slide` — a worked example with five attempts PLANTED at 14/13/12/11/10 minutes ago,
  so the expected wait comes from the timestamps and not from re-running the door's arithmetic: the
  advertised wait is the oldest attempt's own expiry (~60s) and a second refusal never pushes it
  out. Under the pre-fix ordering the same example answered 120s then 180s.
* `p871.prestate.hosted_shaped` — the prestate's role roster equals the chain's own
  `CHAIN_MINTED_ROLES` minus this file's pair, no cluster-wide count is compared with a literal
  anywhere in it, and the roster still admits inside a rolled-back transaction carrying a
  deploy-shaped extra role (where the removed `<> 18` pin would have raised).
* `p871.prestate.first_or_redo` — the file carries every redo-safe statement shape and refuses a
  half-applied state, and its tail's census delta is relative and mode-aware.
* `p871.wall.digests` / `p871.wall.evidence` — the two raised input facts leave no attempt behind;
  the evidence table's columns, RLS posture and append-only guard, the last proven by driving a
  DELETE into it.
* `p871.derivation` — the shared status expression AND the shared masking block are present in both
  live bodies, each with a mutated-string vacuity control, and the migration's tail carries both
  pins.

## 0310 — Knowledge refuses a financial-year-end pair that cannot be a real calendar day (#1031, riders wave 4, lane 06)

`0310_knowledge_fye_pair_wall.sql` closes the gap #898's own fix round pinned rather than closed
(`wave2-lane02-fix.md`, cell `fd.06`): Knowledge's `financial_year_end_day` (0240) is typed against
`range:day_1_31` alone — a whole number 1-31, with no awareness of the sibling
`financial_year_end_month` row, because `clara._knowledge_assert_value(p_knowledge_key, p_value)`
sees one key and one value and has no client to read a sibling answer from. `clara.clients`' own
year-end door (`clara.set_client_fy_end`, 0041) DOES refuse the impossible pair (CLR37,
`fa_particulars_invalid`/`fy_end`), so a firm could state day 31 for February into Knowledge while
the client row it is meant to agree with refuses the identical pair outright.

**The one new rule, and both write doors consult it.** `clara._knowledge_assert_fye_pair(p_client,
p_knowledge_key, p_value)` is a no-op for every key but the two year-end keys and a no-op at firm
scope (D8's own wall, `clara._tf_knowledge_firm_eligibility`, already refuses a firm-scope capture
of either key before a live client-scoped sibling could exist to compare against). Given a client
scope, it reads the OTHER key's live value for that client — absent means nothing to compare,
0240's original posture for a lone month or day, unchanged — and judges the pair with
`clara.set_client_fy_end`'s own calendar rule (0041:3255-3258), copied verbatim rather than
re-derived, so the two doors can never disagree about what a real financial year end is. A refused
pair carries the SAME typed reason the client-row door already uses ("reuse its reason, mint
nothing new"), with the month and the day it judged named on the detail — the client-row door's own
generic message does not carry either value, and the ticket's own "Desired behavior" asked for both.

Grep-measured on the lane-06 rig (`select … from pg_proc where prosrc ilike
'%_knowledge_assert_value(%'`): exactly two clara bodies can ever write either year-end key,
`clara._knowledge_capture_core` (which `capture_knowledge` / `capture_knowledge_for` /
`promote_plan_answers_to_knowledge` all nest) and `clara.correct_knowledge` (which calls
`clara._knowledge_assert_value` directly, bypassing the core). Both are recut, each gaining ONE
line immediately after its existing `_knowledge_assert_value` call — "the pair rule lives once and
both keys consult it" is satisfied by both WRITE DOORS consulting the one rule, not by the two keys
each carrying a copy.

**The choice this file makes, named.** The catalogue has no existing mechanism for one key's
capture to reach in and clear or rewrite a sibling key's own live record — every capture door
either writes the one record it was asked to write or refuses. "Clear the day with a disclosed
reason" would be new machinery invented for this one pair; refusal, in both directions, needs none
— it reuses the exact posture `_knowledge_assert_value` already keeps for a syntactically-valid-
but-out-of-range value. So: capturing (or *correcting*) the day against an already-live,
incompatible month is refused and the month is untouched; capturing (or correcting) the month
against an already-live, incompatible day is refused the same way and the day is untouched. A
client with no live sibling yet keeps 0240's original, unconstrained-alone posture for whichever
half is stated first.

**What this file deliberately does not do.** It does not touch `clara.set_client_fy_end` or
`clara.clients`' own `ck_clients_fy_end` CHECK (0041) — the ticket's own out-of-scope, and the
prestate pins that body UNMOVED. It does not read `financial_year_end_day` out of Knowledge
anywhere new — the rule reads the sibling row directly, inside the SECURITY DEFINER write path,
never through a new read surface. It does not change `clara._knowledge_assert_value` itself —
0240's "one key, one value" segregation stays exactly as it was; the pair rule is a second, later
call in each caller, never a widened first one.

**The negative census.** `clara._knowledge_assert_fye_pair` is a genuine (STABLE, ungranted) reader
of `clara.knowledge_records`, so `knowledge-firm-defaults.test.mjs`'s closed-cohort census
(`p654.census.not_a_posting_grant`) needed a new, bimodal, positively-verified exception —
declared and measured the same way #658's five 0230 reads already are, present only once this
battery's own frontier carries 0310.

**Migration triad.** `tests/fye-pair-wall-preintegration-gate.mjs` (marker-probed, not
existence-probed — both `_knowledge_capture_core` and `correct_knowledge` have existed since 0192,
so a bare `to_regprocedure` would report this cohort applied estate-wide),
`FYE_PAIR_WALL_0310_COHORT` in `tests/rig-meta.mjs` (its own bimodal `cohortFailures()` call, the
0248/0249/0250 fold pattern) and `knowledgeFixtures.mjs`'s `fyePairWallCohortApplied` (the same
three-flag marker probe), and the gate's `--import` token in `package.json`'s test script, last in
migration order. Battery: cells `fd.06` (rewritten from #898's own pinned-gap cell to assert the
closed outcome) through `fd.10`, inside `tests/knowledge-fye-day.test.mjs`, gated on 0310 ON TOP OF
0240's own gate (`pairCell`/`pairGate`, layered beside the file's original `cell`/`gate`) — fd.01
through fd.05 are unmoved and stay 0240-only.

**Redo-safe by construction**: the one statement that changes the catalog is
`create or replace function`; the grant/revoke pairs are idempotent. The prestate detects its own
redo by the same signal 0248 uses — both recut bodies already calling the new rule — and refuses a
PARTIAL signal (one caller updated, the other not) rather than guessing.

## 0315 — the agent-lane prepayment wake door stops proposing a retired 0045 template (#1036, riders wave 4, lane 04)

`clara.wake_establish_prepayment_schedule` (0140, wrapper 12) still called
`clara._agent_prepayment_schedule_core`, which called `clara._propose_adjustment_template_core` and
could mint a `proposed` `clara.adjustment_templates` row — a row #927 (0282) left no door to sign, no
belt to run (#928, 0283) and no advisory to name (#929, 0283). The path could not fire in production
(the wake's only `clara.wake_fn_allowlist` row is `wake_kind = close_prep`, and that source's
`clara.wake_engine_sources` row is `enabled = false`), but it was a live, callable body, and
`plan-overlap-template-arm-retired.test.mjs`'s `p929.containment` cell existed to pin exactly that
residual until this ticket closed it (the wave-3 integration ruling, 2026-09-23).

**What this file does.** The wrapper's SAME NAME and SAME SEVEN ARGUMENTS now delegate to
`clara._prepayment_schedule_core` — #915/#939/#940's shared body, already proven identical for the
`'human'` and `'obo'` lanes — through a THIRD lane, `'wake'`, which **refuses by name**:
CLR03 `wake_authority_absent`, naming the wake kind it refused, the task that asked, and
`clara.create_prepayment_schedule` as the door that CAN configure this. Nothing durable is written.
`clara._agent_prepayment_schedule_core` and `clara._propose_adjustment_template_core` are never
reached from this wrapper again, which is the residual #1036 exists to close.

### Why the lane refuses rather than configuring (the fix round, 2026-09-24)

The FIRST cut of this file gave the wake lane its own plan step,
`clara._prepayment_plan_core_wake`, in `clara._obo_plan_core`'s shape MINUS the
authority-instruction wall, writing `authority_kind = 'explicit_instruction'` with
`authorised_by = clara.agent_user_id()`. Two measured facts killed it (review findings ADV-01 and
L04-SPEC-02):

1. **It could never post.** `clara.agent_user_id()` holds ZERO `clara.firm_memberships` rows, and
   `clara._plan_admit_occurrence` (0308) hands the plan's `authorised_by` straight to
   `clara.admit_journal_work`, whose core raises CLR11 `client_not_found` for an author with no
   membership. Driven side by side on `clara_l04`: the wake plan's first occurrence answered
   `{"admitted":false,"code":"CLR11","reason":"client_not_found"}`; an identical human-lane plan
   answered `{"admitted":true,…}`. Both the belt (`clara.wake_due_plan_occurrences`) and the human
   catch-up (`clara.request_plan_catch_up`) route through that ONE body, so no path could post. A
   schedule that looks configured and posts nothing, every month, with no audit row and no Work, is
   the failure 0308's own `clara._assert_plan_schedule` comment names as the worst this lane can
   have.
2. **It lied in the one column a reader filters on.** `clara.accounting_plans.authority_kind` is a
   closed one-member CHECK whose member means "a person instructed this"; only `authority_ref` was
   honest about the clocked lane.

The wall the first cut stepped around is `clara._authority_ref_refusal`, narrowed by #977/0250 and
described by 0307 as "the wall that stops a wake run or an autodraft from authorising its own
amortisation schedule". A `close_prep` wake is exactly that caller: its credential is minted with
`on_behalf_of` FORBIDDEN BY CONSTRUCTION (0138:827-830, "there is no directing human on the clocked
lane"). That wall is the estate's accounting-authority control and it is right; the ticket's "with
the same validation … a person's own creation gets" cannot be honoured for the plan step, because a
person's own creation supplies a person. So the lane answers the one thing that is true, and writes
nothing.

**What would re-open the lane** is an OWNER decision on plan authority for the clocked lane: either
a directing human the estate can name for an unattended run, or a widened
`clara.accounting_plans.authority_kind` TOGETHER WITH an admission body that accepts an
agent-authored plan. Both are changes to the plan-authority model that #1036's own "Out of scope:
any change to the prepayment door's own rules" forbids this file to make.

| function | who runs it | what it owns |
|---|---|---|
| `clara.wake_establish_prepayment_schedule` | `clara_wake_interactive` (unchanged) | `clara._close_wake_ctx`, the purpose/authority framing, the delegation |
| `clara._prepayment_schedule_core` | nobody (definer-internal, unchanged signature) | everything the human and OBO lanes already ran, plus the `'wake'` refusal ahead of all of it |
| `clara._prepayment_plan_core_wake` | — | **dropped** by the fix round; the estate is back to TWO plan-writing bodies for this family, both asking `clara._authority_ref_refusal` |
| `clara._agent_prepayment_schedule_core` | nobody (definer-internal, retired) | an unconditional refusal — kept present at its exact signature/ACL |

### No multiplicity key

The retired core derived one per (task, verb, CLIENT) (0140:3618-3621, design close-key-1 Annex E),
because two source entries amortised in ONE wake task would otherwise collide on a single
`clara._reserve_op(create_prepayment_schedule, …)` slot. This lane reserves nothing — it refuses
before the reservation — so the derived key would name an operation that never happens. It returns
with the lane if the owner re-opens it.

### The template core is retired 0282's own way

`clara._agent_prepayment_schedule_core` — now caller-less — is recut to an unconditional refusal at
its exact pre-#1036 signature and ACL (ungranted, `clara_fn_owner` only), kept present rather than
dropped so a future reader who resolves it by name finds a sentence, not an absence.
`clara._propose_adjustment_template_core` is untouched (a non-regression pin) and, once this file
lands, has NO caller anywhere in the `clara` schema's own text — the tail measures that by scanning
`pg_proc.prosrc`, not by trusting the two bodies above to say so.

### §E — the stated reason stops crossing the bookkeeper floor (ADV-02)

`clara.prepayment_stated_terms` carries policy `p_pst_human`
(`clara.actor_role_rank() >= clara.role_rank('bookkeeper')`), and 0305's own comment says why:
"this table holds a professional's STATED REASON, the same data class 0140 walled off there".
`clara.document_service_periods` carries the IDENTICAL policy, and the document-lane branch of the
same reads projects only the DATES — `sp.basis` is never returned. But all four schedule reads are
SECURITY DEFINER entering at `clara.role_rank('viewer')`, so the policy never ran for them, and each
projected `term_reason`, `term_stated_by` and `term_stated_at` to any viewer of the firm. Driven on
`clara_l04` before the fix: carol, a viewer of the owning firm, read `count(*) = 0` from the table
directly and the whole stated sentence back from `clara.get_prepayment_schedule`,
`clara.list_prepayment_schedules`, `clara.get_revenue_recognition_schedule` and
`clara.list_revenue_recognition_schedules`. The impact was live —
`apps/web/lib/navigation/tree.ts` gives both registers `minimumRole: 'viewer'`.

The four reads are re-emitted whole (0305's and 0308's own text, never a splice) with one gate
added. Below the floor the three fields come back null and a fifth, `term_reason_withheld`, is true
— **only when a statement actually exists**, so a surface can say "recorded; visible to bookkeepers
and above" instead of "none", and can never mistake an absent statement for a hidden one. It is a
FIELD wall, not a narrower read: everything else a viewer could see, they still see.

### §F — the stating door refuses the three carrier bounds by name (ADV-03)

0305's own comment beside `ck_pst_finite` / `ck_pst_domain` / `ck_pst_max_periods` says "The door
refuses these BY NAME so a caller gets a reason; these exist so no OTHER writer, now or later, can
get past them" — and the door did not. Driven as a bookkeeper before the fix: `1899-01-01` →
SQLSTATE 23514 `ck_pst_domain` with a null detail; `'infinity'` → the same; a 200-month term →
23514 `ck_pst_max_periods`. None carries a `detail.reason`, so no surface can classify them, and
all three are reachable from `apps/web/components/prepayments/prepayment-form.tsx`, which validates
presence, order and a non-blank reason and nothing else.
`prepayment-stated-term-fixtures.mjs` had declared `datesNotFinite`, `datesOutOfDomain` and
`termTooLong` since #939 with nothing raising them. The door now asks finite → domain → inverted →
cap, in that order (`'infinity'` is also out of domain, so finiteness first is what makes the
answer say the thing that is actually wrong), and each refusal carries the bound it broke. The
constraints stay: they are the backstop for any OTHER writer.

### §G — a reversed source entry is not schedulable, on either lane (ADV-05)

`clara.reverse_entry` leaves the original at status `approved` and sets `reversed_by`, so a
REFUNDED advance passed the status wall. Driven on the rig: a 90000-sen advance reversed through
the real door, then `clara.create_revenue_recognition_schedule` returned a schedule of 90000 over
3 periods — a plan that would post Dr deferred revenue / Cr revenue against money the client got
back, recognising revenue on a cancelled performance obligation (MFRS 15 / MPERS section 23) and
driving the liability into a debit balance. The prepayment twin did the same against a refunded
prepaid asset. The lane's two halves disagreed: `clara.list_revenue_recognition_attention`,
`clara.list_prepayment_attention` and #940's band all filter `je.reversed_by is null`, so the band
would never offer a receipt the door was accepting. That predicate is now asked by
`clara._revenue_recognition_core` (§G), `clara._prepayment_schedule_core` (§B, above the
document/memo branch so neither carrier can drift) and `clara.record_prepayment_stated_term` (§F,
which already read `reversed_by` and never looked at it) — one rule, three doors, three bands.

### §H — the enrolment race is answered by name (ADV-04)

`clara.enrol_prepayment_account`'s version-forward block locks the LIVE row, and with no live row
there is nothing to lock: two sessions both fall through and the loser meets
`uq_prepayment_account_enrolments_live` at its INSERT. Driven with two real connections, each a
distinct bookkeeper of the same firm: session A returned an enrolment, session B returned
`{"code":"23505","constraint":"uq_prepayment_account_enrolments_live"}` with no detail. The
invariant held — one live row — but the answer was unclassifiable, and every sibling door this lane
wrote already re-raises typed on exactly this shape. The insert is now wrapped in
`exception when unique_violation` and re-raised as CLR13 `prepayment_account_enrolment_raced`,
naming the enrolment that stands. `clara.retire_prepayment_account` is left byte-unchanged and
pinned: it is an UPDATE with no INSERT, so its loser blocks on the row lock, matches zero rows and
takes the door's own typed `not_enrolled` arm — driven in `p940.enrol.race`'s second half rather
than argued.

### Not in this file: the correction path (it is in 0317)

`uq_prepayment_schedules_source` (0223) and `uq_revenue_recognition_schedules_source` (0308) were
plain UNIQUE constraints on `source_entry_id`: no status predicate, no partial index, so one
recognition entry carried one schedule for ever and the correction path #939 AC4, #941 AC3 and
owner decision 3 all name existed in no door. Migration 0317 builds it; see
"0317 — the term-correction doors" below. Nothing in THIS file changes, and the two cells that
measured the old behaviour (`p939.supersede.running`, `p941.supersede.running`) still stand,
because what they actually prove is still true: a corrected term never moves a schedule that is
already running, and `clara.create_prepayment_schedule` still refuses a second schedule over a
recognition that carries a LIVE one, ended or not.

### What this file deliberately does not do

- It does not widen `clara.accounting_plans.authority_kind` or touch `clara._authority_ref_refusal`,
  `clara.create_accounting_plan`, `clara._obo_plan_core` or `clara._prepayment_plan_core` — the
  human and OBO plan lanes are pinned unconditionally and take neither branch this file adds.
- It does not change the roster gate, the expense-account wall, the term derivation or the
  dedupe/idempotency machinery `clara._prepayment_schedule_core` already carries for every lane —
  the `'wake'` branch adds ONE refusal ahead of all of them and changes nothing else.
- It does not enable `clara.wake_engine_sources.close_prep` (out of scope, the ticket's own words).
  The flag stays exactly as #927/#929 left it, and the refusal is unconditional on it — measured
  with the flag flipped true inside a rolled-back transaction in
  `prepayment-wake-reroute.test.mjs`'s `p1036.refused`.
- It does not write `clara.agent_act_receipts`. That table's F-A4 Tier-A/B/C rung discipline
  belonged to the retired core; the `'wake'` lane now RAISES, exactly as a human's or a chat
  configuration's refusals do, and a raised refusal writes nothing anywhere — there is no durable
  act left for a receipt to describe.

**Prestate pins, MEASURED on `clara_l04` after 0308 and before the first apply** — RECUT (bimodal:
their measured pre-image, or a body already carrying `#1036`):

| signature | `sha256(prosrc)` |
|---|---|
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `acf5d120aa7f3a6e751ce3a21d02e7bdced202067540ec1d81a85396de4b82aa` |
| `clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `143d4526bea145be8529b77c95a1438fb0753c17c11dc57e4f742edfd3130c9f` |
| `clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)` | `9be069dafd6884f9aed991e162bb64719d6e70d5841d11bb08011bbf8f7649c7` |
| `clara.get_prepayment_schedule(uuid)` (§E) | `a97e8a660b2c8092fc2d867452081e98806507b2a6a322ddd95769e404d9dcd2` |
| `clara.list_prepayment_schedules(uuid)` (§E) | `5e9312153959799fb74aced026513c71efcf1bd89665a71693546c38cafcb671` |
| `clara.get_revenue_recognition_schedule(uuid)` (§E) | `7cb0eb58be588bf0faab283c9ddcfe83f702f7a1f2c2c133b97714cf6a019cad` |
| `clara.list_revenue_recognition_schedules(uuid)` (§E) | `075a90ecfe7ee698610716534c5dfdc402ccf56c109f17fb93c03b5d6d031235` |
| `clara.record_prepayment_stated_term(uuid,uuid,date,date,text,text)` (§F) | `8a7a2fe5a4b274ea5fbe789b02ef97946c927789bd0398863beb8f54d3947f98` |
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` (§G) | `5f71dbc2fe984a06c9c60f62bbaaefc8d34e3f0db607bfdfdcb9d409a2152b6d` |
| `clara.enrol_prepayment_account(uuid,text,text,text,text)` (§H) | `dc122ca3a216b7eae3d1d4678b2921911a1045f1ea761db5f3467685c8a1f554` |

UNCONDITIONAL neighbours (must not have moved; the file relies on their live shape but never
touches them):

| signature | `sha256(prosrc)` |
|---|---|
| `clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)` | `b975d0af972d7f620834b6d223a0366782b4be276ffc52165c094a84389ee810` |
| `clara._close_wake_ctx(text,text,uuid,text)` | `5327c96be6ab4f930570c089e33cd8734bfae9a604f559ff02e9fa8959e9258e` |
| `clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | `266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a` |
| `clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)` | `c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188` |
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `62f909b7802faacf1d8b18e4040e9bf70f99ce344f7120bc35f37be7c0e54879` |
| `clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)` | `230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a` |
| `clara._assert_plan_schedule(text,text,text,integer,text,date,date,text)` | `ce0b24fd9d46531722ed80e83915444817731ad759a4a2c36f2147064bcd0c78` |
| `clara._assert_journal_basis(jsonb)` | `2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684` |
| `clara._plan_overlap_warning(uuid,jsonb,uuid)` | `c2566349405844d14c94ba57836ee9256878001f744ad627b0337ae5b8caf7dc` |
| `clara._plan_due_events(date,text,text,integer,boolean,date,date,integer)` | `66100718e518a0d587bab68dc63ffb5efb24f95b7d2b899cef3f55d3e3be3384` |
| `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | `000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1` |
| `clara.retire_prepayment_account(uuid,text,text,text)` (§H's deliberate non-change) | `5a0fc662384760a5303c1cdffb02793967761013137d859dafe2239f118e8f63` |

Note that `clara.create_accounting_plan`'s live sha had already moved since #915's own report (0308,
#941, widened it to admit `revenue_recognition_schedule`) — pinned here at its value measured on
this rig after 0308, per the wave-3 addendum's "pin what is LIVE" rule, not copied from an earlier
migration's header.

Applied via `pnpm db:migrate`; `clara.schema_migrations` reads 294 total, max
`0315_prepayment_wake_reroute`. Redo-safe by construction (#957): every object is a
`create or replace function` (three recut) or a `drop function if exists`, and the file writes no
row and no schema object at all. Its prestate's residual census is MODE-AWARE — exactly one clara
function mentions the template core on a FIRST apply, zero on a REDO, because by then this file has
already retired that one caller. (The first cut expected 1 unconditionally and therefore could not
be redone at all; found and fixed in the fix round.)

**Gate module, cohort, chain.** `tests/prepayment-wake-reroute-preintegration-gate.mjs` (env
`CLARA_ALLOW_MISSING_PREPAYMENT_WAKE_REROUTE`); no new `rig-meta.mjs` cohort — the one new function
is UNGRANTED, and `operation-census`/`rig-isolation`'s grant-matrix census (T17) is measured over
application grants, so an ungranted internal needs no cohort row to stay invisible to it (confirmed
by running T17 green with `rig-meta.mjs` untouched); the `--import` entry in `package.json` in
MIGRATION ORDER, at the end of the chain (0315 is the newest migration).

**Tests.** `tests/prepayment-wake-reroute.test.mjs` (new: the reroute driven end to end on a real
`clara_wake_interactive` session — the typed refusal with `close_prep` flipped true in a rolled-back
transaction and zero durable rows of any kind, the authority wall answering AHEAD of every input
wall, the refusal's stability across a fresh credential, the absence of any body that writes a plan
under `clara.agent_user_id()`, the template core's zero-caller census, and the wrapper's own
unchanged shape — each refusal cell paired with the HUMAN door on the same scene, whose plan is
driven through `clara._plan_admit_occurrence` and admits);
`tests/prepayment-stated-term.test.mjs` (`p939.reads.reason_floor`, new) and
`tests/revenue-recognition.test.mjs` (`p941.reads.reason_floor`, new) — a viewer of the owning firm
driven through all four reads beside a bookkeeper on the same schedule, with the table's own policy
measured alongside so the read and the table are asserted to agree; `tests/plan-overlap-template-arm-retired.test.mjs` (`p929.containment` replaced by
`p1036.containment-closed` — the residual it pinned is closed, not merely held shut by a flag, and
the three containment facts it named are re-measured as unchanged rather than as a tripwire);
`tests/f-a4-pr2a-wrapper.test.mjs` (the Tier-A/B/C agent-drafts/human-signs/belt-posts battery for
this door — W13\*/W45\*/W14\*/W15/W16/W39/W40/W38\*/W5 — retired with the pipeline it tested;
`fa4p2a.W13-retired` proves the old `agent_act_receipts` discipline is genuinely gone rather than
merely un-asserted); `tests/f-a4-pr2a-books.test.mjs` (W34 retired — its human half went at 0282 —
but **W35 / W35-mutant / W31 RETARGETED rather than deleted**: their subjects are an accounting
claim about the books and a lifecycle claim about the fiscal year, both still live rules, so they
are re-driven through the LIVE human door, the plan lane, the catch-up window and the real posting
belt — prepaid to exactly zero on a total that does not divide evenly, the stopping-one-short
mutant, and `fiscal_years.successor` refused by name then cleared by opening the year; W44 and W32,
which never drove this wrapper, are untouched);
`tests/prepayment-account-roster.test.mjs` (`p940.enrol.race`, new: a real two-connection race on
both roster doors).

## 0317 — the term-correction doors: a mis-stated term opens a replacement schedule (#939 AC4 / #941 AC3, riders wave 4, lane 04)

**What it closes.** #939 AC4, #941 AC3 and owner decision 3 (2026-09-18) all name the same act —
"a new schedule from the next period" — and until this file the estate performed none.
`uq_prepayment_schedules_source` (0223) and `uq_revenue_recognition_schedules_source` (0308) were
unconditional `unique (source_entry_id)` constraints, so a replacement was refused CLR13 while the
first schedule ran and refused identically after it had been ended through
`clara.end_accounting_plan`. A firm that mis-stated a term was left with a wrong amortisation
running and no remedy at all.

**The derivation is PROSPECTIVE, and the ticket chose it.** "already-posted periods are never
touched" plus "from the next period" is a change in accounting estimate applied prospectively
(MPERS section 10 / MFRS 108): the months the plan has already taken up stand, and the balance they
did not consume is re-spread over what is still open of the corrected term. The alternative —
treating the first amortisation as an error, reversing it and re-deriving — is a prior-period
correction, and the same sentence excludes it. No new professional judgement is asked of the
estate: the judgement is the TERM, and a named person stated it through
`clara.record_prepayment_stated_term` or `clara.record_document_service_period`.

**The two doors.** `clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)` and
`clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)` — `(p_client, p_schedule,
p_reason, p_authority_ref, p_op_key)`, bookkeeper floor in their own bodies, `clara_authenticated`
ONLY. There is no OBO twin and no wake wrapper, and the tail asserts the absence by pg_proc count:
re-deriving a client's books is a judgement with a named person behind it. Each ends the
predecessor's plan through 0193's own door with the correction's stated reason, creates a NEW plan
under a FRESH instruction (the correction is a new decision, and the instruction that authorised
the first schedule spoke about the first term), stamps the predecessor with its successor and
inserts the replacement naming what it replaced.

**Two shared predicates, both ungranted.** `clara._schedule_term_correction(text,uuid)` is
`clara.get_prepayment_schedule`'s own #919 liveness predicate lifted verbatim, so the READ and the
DOOR can never disagree about whether a term was corrected; `term_live` is the audit fact and
`moved` is the one an act may be taken on, because both term doors supersede unconditionally and a
re-statement of the same two dates is grounds for nothing (ADV-02).
`clara._schedule_open_remainder(uuid,jsonb,bigint)` answers two questions that must not be
conflated: WHERE the replacement may start is the day after the latest ADMITTED occurrence (not a
committed receipt — an admitted Work is a month the estate has taken responsibility for, and
re-opening it could post it twice), and WHAT it re-spreads is the total less the periods actually
admitted, matched to their own due date. The plan scanner admits the latest due event per run, so a
schedule whose earlier month was never picked up has a GAP before the boundary: that month's share
is still in the prepaid account (or the deferred-revenue liability) and is part of the remaining
balance. Charging it to a plan that is about to end would leave a balance nothing ever clears.

**The uniqueness rule is qualified, never dropped.** Both relations gain the
`clara.prepayment_stated_terms` supersession shape (`superseded_by` deferred, `superseded_at`, the
paired CHECK) plus `replaces_schedule_id` so the chain reads forwards as well as back, and the
unconditional constraint is replaced by a partial unique index over `superseded_at is null`. STAMP
FIRST, INSERT SECOND is load-bearing: the predecessor must leave that index before the successor
enters it, which is what the deferred FK is for. Both append-only triggers are recut to admit
exactly one update — the stamp — by comparing the WHOLE row with the stamp removed, so a column
added later is covered by construction rather than by a name list.

**Four bodies recut for one reason.** `clara._prepayment_schedule_core`,
`clara._revenue_recognition_core`, `clara.read_prepayment_source_for` and
`clara.read_revenue_recognition_source_for` each read `where source_entry_id = … and firm_id = …`
and take ONE row. That was one row by construction before this file; afterwards a corrected
recognition carries a chain, and an unqualified read would hand a surface an arbitrary member of it
— the schedule a refusal names, and the schedule claraWork is told about. Each site now asks
`and s.superseded_at is null`; nothing else in any of the four moved.

**Prestate pins, MEASURED on `clara_l04` after 0315 and before the first apply** — RECUT (bimodal:
their measured pre-image, or a body already carrying `0317`):

| signature | sha256(prosrc) |
|---|---|
| `clara._tf_prepayment_schedules_append_only()` | `21d1fe05f5c9cc837a6f80bd8ec36954c46a395054b2c8278b938140202aa18c` |
| `clara._tf_revenue_recognition_schedules_append_only()` | `aaaa4202ad8c5b7adb40accf897290753763d26257c0903dcf5d743804437d5e` |
| `clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)` | `78bbfce7ae46b3445a93689700958f727a1b795cdf483c7c522beef4f7b46ee2` |
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `03417b7903a6bf04ea49199bb6af27375537d49707874025b9ec62507705bf24` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `6475458ed34d9b9ef357f8fb6e4eb9766042e30e1252c30d607fabd1a120495b` |
| `clara.read_revenue_recognition_source_for(uuid,uuid,uuid)` | `00501a388ada95f1a7db9fccf9ad1d94f04c0067083fd3c457ee9a06ecbe06ab` |

…and KEPT (neighbours both doors nest, refused if any of them moved):
`clara.prepayment_schedule_v2` `9f5123adf67fcbf573b994efa60d27b1aa35beab8ced54ffbc4a3078896f0194`,
`clara._prepayment_account_enrolled` `0c10eafa94824a00a5d4c7b08ae1ba093d52f0e4f2c0b953a7951b46a27948db`,
`clara._adj_line_eligibility_breach` `727fceade766c85a8fc4753d03e6e071a9008334e149266488e5d5232dd98021`,
`clara._assert_journal_basis` `2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684`,
`clara.end_accounting_plan` `b3d6f214b2fa8e875ad3bce966bf51557f235b3b0d046a06cdb0e208b58f870c`,
`clara.create_accounting_plan` `c8e990986a06b132e3dad40e47225968562336b48ad6c01a4a09104784c09188`.
The tail re-measures `clara.prepayment_schedule_v1`
(`ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2`) and v2, so this file cannot
have moved a frozen evaluator.

**The FIRST-APPLY branch of the bimodal prestate was taken for real** (wave-3 rule): the first
apply on `clara_l04` recorded `0317 prestate OK — 7 FIRST, 0 REDO`, and every redo after it
recorded the REDO branch for all seven. The integrator's from-scratch chain is the check that
matters after that.

**Gate module, cohort, chain.** `tests/schedule-term-correction-preintegration-gate.mjs` (env
`CLARA_ALLOW_MISSING_SCHEDULE_TERM_CORRECTION`); `rig-meta.mjs` gains the
`SCHEDULE_TERM_CORRECTION_0317_COHORT` (two human doors, two ungranted predicates) with its bimodal
check and the two door names on the `clara_authenticated` roster; the `--import` entry in
`package.json` in MIGRATION ORDER, after 0315's.

**Tests.** `tests/prepayment-stated-term.test.mjs` (five new cells: `p939.replace.clean`,
`p939.replace.posted`, `p939.replace.refuses`, `p939.replace.boundary`, `p939.replace.posture`);
`tests/revenue-recognition.test.mjs` (`p941.replace.posted`, `p941.replace.refuses`);
`tests/prepayment-schedule-obo.test.mjs` and `tests/revenue-recognition.test.mjs`'s own grant
censuses each learn the one new human name, asked at the 0317 frontier rather than assumed. Each
new cell asks that frontier itself, because the batteries they live in are gated on 0305's and
0308's stems, which are true long before this file exists.

## 0318 — the year-end pair rule reads its sibling at the incoming applicability, and an impossible pair no longer aborts a promotion (#1031 fix round, riders wave 4, lane 06)

`0318_knowledge_fye_pair_applicability.sql` fixes 0310, which is applied and therefore immutable.
It takes a number from wave 4's OVERFLOW block (`0315` and up — `riders-2026-09-20/README.md`'s
own rule for a fix round that needs another migration), never the next free number, and 0310 and
0318 ship together as ONE cohort: `knowledge-fixtures.mjs`'s `fyePairWallCohortApplied` probes the
shape the pair wall finally takes, `tests/fye-pair-wall-preintegration-gate.mjs` gates both, and a
database carrying 0310 alone is reported PARTIAL rather than skipped, which is what it is.

**Defect 1 — the sibling was read without its applicability.** 0310's rule selected the sibling
year-end row on `state = 'live' and scope_kind = 'client' and client_id = $1 and knowledge_key =
<sibling>`, with no `applies_when` predicate and no `ORDER BY`. But `uq_knowledge_live` (0192) is
PARTIAL over (scope, subject, key, APPLICABILITY): one client may legitimately hold several live
rows of one key, one per `applies_when` — the state
`apps/web/components/registers/knowledge-panel.tsx` names out loud. "The sibling row" was therefore
not one row, and the read took an arbitrary one. DRIVEN through `clara.capture_knowledge` as a
bookkeeper, both directions: month 1 at `{}` plus month 2 at `{"from_fy":2025}` let day 31 at
`{"from_fy":2025}` be ACCEPTED — leaving month 2 and day 31 live at the SAME applicability, the
exact pair `clara.set_client_fy_end` refuses on the client row; and month 2 at `{}` plus month 1 at
`{"from_fy":2025}` made day 31 at `{"from_fy":2025}` — 31 January, a real date — be REFUSED,
naming a month belonging to a different applicability. The rule now takes the applicability it is
judging and reads the sibling through `clara._knowledge_applies_when_digest`, the SAME digest the
capture core computes for its own supersession lookup and the same one that partial index is over,
so at most one row can match and `select … into` cannot be ambiguous. That needs a fourth
argument, so the rule is re-cut at `(uuid, text, jsonb, jsonb)` and 0310's three-argument form is
DROPPED after both callers move — the catalogue never carries two overloads, and `rig-meta.mjs`'s
cohort is by NAME, so it is unmoved. `clara._knowledge_capture_core` passes its own
`p_applies_when`; `clara.correct_knowledge` passes `r.applies_when`, the live record's own
applicability, which a correction reuses verbatim and never moves.

**Defect 2 — an impossible pair aborted a whole promotion.** #1031's brief asked for the
onboarding promotion path to be unchanged. `clara.promote_plan_answers_to_knowledge` withholds a
per-item refusal and carries on: its loop catches CLR10 and CLR11 around the nested
`clara._knowledge_capture_core` and appends the item to `withheld`. The pair rule raises CLR37 —
the client-row door's own typed reason, which is right — and CLR37 was not in that catch, so a
committed plan holding an impossible pair raised straight out of the loop and NOTHING was
promoted, `entity_type` included. DRIVEN on the rig before the fix. The arm now catches CLR37 too,
so the offending key alone is withheld with its own sqlstate and detail, which IS this door's
documented behaviour. Cell: `knowledge-onboarding-promotion.test.mjs` `kp.14`, with a vacuity
control (the pre-image body put back on the rig, the cell seen failing with the raised CLR37, then
restored through `CLARA_MIGRATION_REDO`).

**Disclosed residual — 29 February outside a leap year is still accepted.** #1031's "current
behavior" enumerated three impossible cases: 31 for a 30-day month, 30 or 31 for February, and 29
for February when the pair is not tied to a leap year. The first two are closed; the third is NOT,
deliberately. The rule is `clara.set_client_fy_end`'s own calendar rule copied verbatim (0041),
that rule admits `month = 2 and day = 29`, the year-end pair carries no year to judge a leap year
against, and the client-row door is explicitly out of #1031's scope — so refusing 29 February in
Knowledge ALONE would re-create the very disagreement between two records of one fact that #1031
exists to remove. Named in `clara._knowledge_assert_fye_pair`'s own body, in 0318's header and in
the lane's fix report; a follow-up belongs on the CLIENT-ROW door, where both records can move
together.

**How the three pasted bodies are proved.** 0318 re-cuts three whole bodies statically (no
`pg_get_functiondef` splice, so no new entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` is
owed — the file contains no dynamic SQL at all). Each pasted body is the LIVE pre-image plus
exactly one named chunk, and the tail proves it by REVERSE SUBSTITUTION: it reads the installed
body, puts the pre-0318 chunk back, and requires the result to hash to the `sha256(prosrc)` the
prestate pinned. A change smuggled anywhere else in a pasted body reds the migration instead of
shipping.

**Redo-safe by construction (#957).** Every statement is `create or replace function` or
`drop function if exists`. The prestate detects its own redo by ONE signal — the four-argument
rule live, the three-argument one gone, and BOTH write doors already calling it — and refuses a
PARTIAL signal rather than guessing. Both branches were exercised on the lane database: the FIRST
APPLY through `pnpm db:migrate` (with all four recut pins checked), and the REDO branch through
`CLARA_MIGRATION_REDO=0318_knowledge_fye_pair_applicability` after the promotion door was put back
at its pre-image for `kp.14`'s vacuity control.

## 0320 — one body, two entrances: the model lane reaches the client home's money band (#1000, riders cut phase, lane C1)

`clara.get_client_financial_pack` (0232, #660) is the ONE read behind the client home's money
band — book cash over a governed, versioned cash account set and period profit over the approved
ledger, each with the same ten-field envelope, six points of history and its own comparison. It was
`STABLE SECURITY INVOKER`, floored inline on `clara.jwt_sub()`, granted to `clara_authenticated`
alone, and scoped by forced firm-scoped RLS. The chat lane runs on pooled credentials that carry no
`request.jwt.claims` at all, so #1000's tool could not reach it.

**Four routes were measured before one was written, and three are closed by something the estate
already decided.** (1) A grant to `clara_agent_ro` buys a door that answers CLR04 `no authenticated
actor` on every call — "a tool that could only return a grant refusal, and that is not a
capability". (2) A wake wrapper that sets `request.jwt.claims` from the credential's
`on_behalf_of` is refused by name: `0082_wave_e_zeta_render_jobs_part4.sql:14-17` rules that
"setting request.jwt.claims from a production function to borrow a human's identity is
impersonation; in this repo that idiom appears ONLY inside migration probes, never on a production
path". (3) A second, machine-side copy of the computation is refused by the same header
("DUPLICATION IS REFUSED — a second copy of a gate is a second place to forget it") and by #660's
own "one fact, one definition". (4) A SECURITY INVOKER wrapper, so the estate's own `p_*_agent` RLS
policies would scope it, needs five new table grants and two new policies for `clara_agent_ro` —
measured: `clara.cash_account_set_versions` and `clara.cash_account_set_members` carry no agent
policy at all, and `clara.opening_seed_registry`, `clara.onboarding_plans` and
`clara.onboarding_plan_items` carry one with no SELECT grant behind it. That is a widening of the
model lane's RELATION reach, which #1000's own last acceptance criterion forbids.

So 0082's remaining option is the one taken: **SPLIT**. `clara._client_financial_pack_core(p_firm,
p_client, p_as_of, p_month)` carries the computation and is granted to NOBODY;
`clara.get_client_financial_pack` keeps its signature, defaults, return type, envelope, refusal
codes and ACL and becomes that core's VIEWER-floored delegate through `clara._human_ctx`; and
`clara.wake_get_client_financial_pack` is the model lane's own audited door — EXECUTE to
`clara_agent_ro` alone, ONE `clara.wake_fn_allowlist` row for the `interactive` kind.

### The firm predicate is explicit now, and it is the whole tenancy wall

Measured on the lane rig rather than recalled: `clara.clients` is FORCE ROW LEVEL SECURITY, and its
`p_clients_owner` policy is `TO clara_fn_owner USING (true)` — so a SECURITY DEFINER body owned by
`clara_fn_owner` sees every firm's clients (506 of them on `clara_l01`). 0232's visibility test was
a plain existence probe that let RLS do the scoping, which was exact for an INVOKER read running AS
a human and is not exact for this core. It now reads
`where cl.id = p_client and cl.firm_id = p_firm`, and that ONE predicate is what keeps one firm's
money out of another firm's answer: every other statement in the body is keyed on `p_client` and
every one of them is inside the `if v_visible` arm. Both lanes' cells red when it is removed —
`p1000.wake.no_oracle` on the machine side and #660's own `p660.pack.cross_firm` on the human
side — which was driven once, on purpose, before the core was restored through
`CLARA_MIGRATION_REDO`.

### How the pasted body is proved

The core's body is written out statically (no `pg_get_functiondef` splice, so no new entry in
`apps/web/tests/firm-scope-db-pins.corpus.ts` is owed — this file contains no dynamic SQL at all),
and it is 0232's own body with exactly THREE anchored edits: the `c record` declaration and the
inline JWT floor removed, and the visibility test's firm predicate added. §TAIL proves it by
REVERSE SUBSTITUTION, 0318's own idiom: it reads the installed core, puts all three pre-images
back, and requires the result to hash to the `sha256(prosrc)` the prestate pinned. A digit changed
anywhere in ~720 lines of accounting arithmetic reds the migration instead of shipping. The
behavioural half is #660's own 36-cell battery, which runs unchanged against the human door.

### The floor each lane carries

The human lane is VIEWER, through `clara._human_ctx(clara.role_rank('viewer'))`, which raises the
same three CLR04s (`no authenticated actor`, `actor has no active membership`, `insufficient role`)
the inline block raised — it IS the body those three predicates were written from. The model lane is
BOOKKEEPER+, and not by this file's choice: `clara.mint_wake_credential` refuses a below-bookkeeper
`on_behalf_of` outright (CLR10 `authority_lost`) and `clara.wake_context` re-validates the same
standing on EVERY use, so a demoted person's outstanding credential goes inert mid-conversation.
The model lane is therefore STRICTLY NARROWER than the door it reaches, which is what "carrying the
human door's role floor rather than widening either" has to mean. Both halves are driven by
`p1000.wake.floor_is_the_credential`.

### Redo-safe by construction (#957)

Every object is `create or replace function` and the one row it writes is `on conflict do nothing`
against `clara.wake_fn_allowlist`'s primary key. The prestate admits TWO pre-images for the one body
it recuts — the measured live sha, or a body already carrying this file's `#1000` attribution — and
refuses a PARTIAL birth (one of the two new functions present without the other) by name rather
than completing it. Both branches were exercised on `clara_l01`: the FIRST APPLY through
`pnpm db:migrate`, and the REDO branch through
`CLARA_MIGRATION_REDO=0320_client_financial_pack_wake_read` after the firm predicate was removed
from the live core for `p1000.wake.no_oracle`'s vacuity control.
## 0330 — one authority-wall predicate for the two plan doors (#1051, riders sweep wave, lane 01)

`0330_plan_authority_wall_predicate.sql` mints `clara._assert_plan_authority(text, jsonb, uuid,
uuid)` and points `clara.create_accounting_plan` and `clara._obo_plan_core` at it. **Nothing
either door admits or refuses moves.** It is a fold, not a rule change, and the tail proves that
mechanically rather than by assertion.

**The ticket's stated current behaviour was stale, and this file does not build what it asked
for.** #1051 was filed saying the OBO twin admits TWO `authority_ref` kinds against the human
door's three, and recommended keeping the machine lane at two. Measured on the integrated chain,
both bodies already carry the SAME list — `0308_deferred_revenue_recognition.sql:893` against the
identical list at line 614 — because the riders wave-4 integrator carried #949's (0300)
`contract_confirmation` into the twin as well as into the human door. Taking the recommendation
would therefore REMOVE a kind the integrated wave deliberately added, on the machine lane, in the
direction of refusing something admitted today. The sweep wave's plan of record re-briefed the
ticket for exactly that reason (`docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md`, "The four
narrowed tickets, and the one re-briefed") and this file follows the re-brief: **keep the three
kinds on both doors, and fold the two copies into one.**

**THE CORRECTION 0308 CANNOT CARRY.** `0308_deferred_revenue_recognition.sql:870` says, inside
`clara._obo_plan_core`, "THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan", and
0308's header says the same of the pasted body. That claim is **not true of anything as of this
file, and was already untrue before it.** 0308 was written on a rig that did not carry 0300; on
the integrated chain 0300 applies first, the integrator re-based 0308's pasted human door onto
0300's three-kind post-image and then widened the twin's copy BY HAND to match. From that moment
the two blocks were two independently maintained texts that happened to agree, which is what
"verbatim" was trying and failing to guarantee. Applied migrations are immutable, so the
correction is recorded here and in `clara._assert_plan_authority`'s own catalogue comment, and the
two bodies now share one text instead of claiming to.

**What the fold leaves standing, deliberately.** `clara._accrual_plan_core` carries a THIRD
hand-written copy of this same wall (`0222_accrual_adjustments.sql:1014-1025`) and reaches the
chat lane through its own inline `exists` probes rather than through #977's one definition. That
is a live authority gap with its own ticket, **#1080**, which points that body at this predicate.
Folding it here would widen #1051, so this file names it in its header, in the predicate's
comment, in its own tail census and in `plan-authority-wall.test.mjs` — and states the census as a
RULE (a body either calls the predicate or keeps its own copy, never both) so #1080 composes with
it instead of having to edit it.

**How the two pasted bodies are proved.** Both are re-cut statically — no `pg_get_functiondef`
splice, so no new entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` is owed; the file
contains no dynamic SQL of any kind. Each pasted body is the LIVE pre-image with exactly one block
replaced by one `perform`, and the three declarations that block alone used (`v_ref_kind`,
`v_ref_id`, `v_reason`) dropped with it. The tail proves that by **reverse substitution**
(0318's idiom): it reads the installed body, puts 0308's own authority block and those three
declarations back, and requires the result to hash to the `sha256(prosrc)` the prestate pinned
(`a7c108d5…` for the human door, `2049c1c4…` for the twin). A change smuggled anywhere else in
either pasted body reds the migration instead of shipping. The tail additionally re-reads both
post-images (`544cd88e…`, `149b4a3d…`), both grant postures, `clara._authority_ref_refusal`'s
unmoved body (`55c20b20…`) and its zero grants, the two catalog censuses, and DRIVES the new
predicate over all eight of its refusal axes.

**Redo-safe by construction (#957).** Every statement is `create or replace function`, `revoke` or
`comment on`. The prestate is bimodal on the two doors' bodies and refuses a MIXED state (one door
folded, one not) rather than guessing, and it cross-checks the predicate's existence against the
branch it read. Because a bimodal pin can only ever show `CLARA_MIGRATION_REDO` its "already live"
branch, the FIRST APPLY branch was proved by hand first: the prestate block was run verbatim
inside a rolled-back transaction against the un-applied lane database, printed its FIRST APPLY
notice and passed. Both branches then ran for real — the first apply through `pnpm db:migrate`,
and the redo through `CLARA_MIGRATION_REDO=0330_plan_authority_wall_predicate` after the tail
gained its reverse-substitution check.

## 0331 — the accrual lane joins the one authority wall (#1080, riders sweep wave, lane 01)

`0331_accrual_plan_authority_wall.sql` recuts `clara._accrual_plan_core` so that it calls
`clara._assert_plan_authority` — the single predicate 0330 minted — instead of the hand-written
authority block and inline `exists` probes it has carried since 0222. It mints no name, changes no
grant and touches no other rule in that body.

**This one is a behaviour fix, not a fold.** 0330 was a refactor that moved nothing. This file
closes a live authority gap, and the gap is exactly the one #977 (0250) was written to close
everywhere:

```
    -- clara._accrual_plan_core, before 0331
    select exists (select 1 from clara.agent_tasks t
                    where t.id = v_ref_id and t.firm_id = p_firm and t.client_id = p_client) into v_ok;
```

A bare existence test. It never read the named task's own `kind` or `created_by`, so a `wake` task
(which carries no author at all) and an `autodraft` run (which carries the human it was started
FOR, without being that human's instruction) both satisfied it. 0250 replaced exactly this probe in
`clara.sign_depreciation_authority` and `clara.create_accounting_plan`, said in its own header
(0250:63) that it was leaving this third copy alone, and pinned the surviving probe to exactly this
one function in its tail (0250:604). 0330 named the same body as the third copy and gave the ticket
number. This is that ticket.

**Only one of the two accrual entrances was exposed, and it is the machine one.**
`clara.create_accrual_adjustment` (human, `clara_authenticated`) nests
`clara.create_accounting_plan`, so it has been behind the shared definition since 0250 and behind
the shared predicate since 0330. `clara.create_accrual_adjustment_for` (`clara_runtime` only,
actor taken from an argument because a runtime connection carries no JWT) nests
`clara._accrual_plan_core`. So the open door was the on-behalf one: a wake task or an autodraft run
could authorise an accrual adjustment plan on a connection with no human on it. Measured on the
lane rig before the file was written, the runtime door ADMITTED a `wake` reference and wrote the
plan, the revision, the occurrence, the accrual and the Work;
`packages/db/tests/accrual-plan-authority-wall.test.mjs` is the cell that saw it.

**Three things move, and all three are the accrual lane catching up with the estate.**

| what | before 0331 | after 0331 |
|---|---|---|
| a `chat_task` naming a wake task or an autodraft run | ADMITTED | CLR10 `authority_ref_not_human_instruction` |
| a `contract_confirmation` (#949, 0300) | CLR10 `authority_ref_invalid` / `kind` | admitted, resolved by `clara._authority_ref_refusal` under the same firm-and-client ladder |
| the two sentences | "names an accounting_work or a chat_task"; "the instruction this **accrual** cites does not exist for this client" | the three-kind sentence; "the instruction this **plan** cites does not exist for this client" |

The second row is a **parity fix, not a widening of the estate's authority vocabulary** (which the
ticket puts out of scope, and which is unchanged at three kinds). The HUMAN accrual entrance has
admitted a `contract_confirmation` since 0300, because it nests the human plan door; only the
on-behalf one refused it, because its list was frozen at 0222's two kinds. Nothing new becomes
authority: `clara.contract_plan_confirmations.confirmed_by` is NOT NULL, and its only two writers
(`clara.confirm_tenancy_rent_plan`, `clara.confirm_tenancy_rent_plan_revision`) are granted to
`clara_authenticated` alone, so a runtime connection cannot manufacture one.

The third row changes a sentence a bookkeeper can see. It changes it TOWARDS what the human
entrance already says: a person configuring an accrual through `clara.create_accrual_adjustment`
has been told "the instruction this plan cites…" ever since that door started nesting the plan
door. Every SQLSTATE and every `detail.reason` token is unchanged. What ends is one client getting
two different sentences for one refusal depending on which entrance ran.

**What is proved, and how.** The recut is static DDL — no `pg_get_functiondef` splice, no `execute`,
no dynamic SQL of any kind — so **no new entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` is
owed**; `apps/web/tests/firm-scope-db-pins.test.ts` was run to confirm it. The installed body is the
LIVE pre-image with exactly one block replaced by one `perform` and the three declarations that
block alone used (`v_ref_kind`, `v_ref_id`, `v_ok`) dropped with it, and the tail proves that by
**reverse substitution** (0318's idiom, 0330's own `T.8`): it reads the installed body, puts
0222/0283's own authority block and those three declarations back, and requires the result to hash
to the `sha256(prosrc)` the prestate pinned (`31adc6d4…`). That is the mechanical form of the
ticket's "no change to the accrual plan's other validation rules" — the client rung, both inserts,
the overlap warning, the preview and the audit row cannot have moved. The tail also re-reads the
post-image (`89d2ac3a…`), the whole grant posture, `clara._assert_plan_authority` (`60f2c5d1…`) and
`clara._authority_ref_refusal` (`55c20b20…`) unmoved and ungranted, and four censuses:

* the wall's own sentence now lives in **exactly one** `clara` body, `_assert_plan_authority`;
* the predicate is called by **exactly three**, `_accrual_plan_core`, `_obo_plan_core`,
  `create_accounting_plan`;
* #977's inline chat-lane existence test survives in **zero** — 0250's `T.4f` pinned it at one, and
  this is the file that took it to none;
* 0222's own "the instruction this accrual cites" sentence survives in **zero**.

Each census compares against a literal roster built with `order by p.proname`, which is the
catalog's own C ordering (`proname` is `name`, which never takes a database collation), so it is
collation-proof by construction.

**Redo-safe by construction (#957).** Every statement is `create or replace function`, `revoke` or
`comment on`. The prestate is bimodal on the one body this file recuts and unconditional on the two
definitions it joins, and it asserts STRUCTURALLY (never by sha) that both plan doors already call
the predicate, so a later file of the same lane is not coupled to 0330's output bytes. The FIRST
APPLY branch ran for real through `pnpm db:migrate` and printed its notice; the REDO branch was
then exercised with `CLARA_MIGRATION_REDO=0331_accrual_plan_authority_wall`.

**What it does NOT do.** It does not touch `clara._assert_plan_authority`,
`clara._authority_ref_refusal`, `clara.create_accounting_plan` or `clara._obo_plan_core`; it does
not widen or narrow the authority-reference vocabulary; and it does not touch any other accrual
rule. If a later lane ever needs one plan lane to admit a NARROWER set than the other two, the
parameter goes on `clara._assert_plan_authority` — there is now exactly one place for it, which is
the point of 0330 and 0331 together.

## 0332 — a reversal reverses what its own occurrence posted (#1074, riders sweep wave, lane 01)

`0332_plan_reversal_posted_basis.sql` mints `clara._plan_posted_entry_lines(uuid)` and recuts
`clara._plan_admit_occurrence` so that a REVERSAL leg with a POSTED entry behind it is built from
that entry's own journal lines instead of from the plan's live revision. It mints no table, no
CHECK, no chart row and no grant, and it changes no refusal reason, SQLSTATE or message anywhere
in the estate.

**The defect, measured on the lane rig before a line of the file was written.** An expense accrual
was configured at 300,000c through `clara.create_accrual_adjustment`; its current period's
occurrence was admitted and posted through the estate's own lane (Dr 6100 300,000 / Cr 2020
300,000). `clara.correct_accrual_adjustment` then restated it to 275,000c — which, by 0284's
design, advances the plan to a NEW live revision carrying a NEW basis. The reversal leg was then
admitted through `clara.request_plan_catch_up` and posted. It posted **Dr 2020 275,000 / Cr 6100
275,000**, and the ledger was left carrying **25,000c on the accrued-liability account that nothing
ever posted and nothing will ever reverse.**

**Why, in one line of the pre-image.** `clara._plan_admit_occurrence` resolves the plan's live
revision into `r` (`superseded_at is null`) and calls
`clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry, v_line)` for BOTH legs. For a
primary that is right, and is the whole point of a correction. For a reversal it is a category
error: a reversal exists to undo ONE entry that is already on the books, and what that entry
carries is a fact, not a restatement.

**The fix uses a seam #653 already built.** `clara._plan_occurrence_basis` takes an optional
`p_line_override` whose `lines` REPLACE the revision's before a reversal's sides are exchanged, and
it stays `language sql IMMUTABLE` precisely because the lines ARRIVE as an argument. So this file
needs no new mechanism — one more resolver and one more override:

```
    -- clara._plan_admit_occurrence, after 0332 (the whole of the change)
    if p_leg = 'reversal' and v_primary_entry is not null then
      v_posted_basis := clara._plan_posted_entry_lines(v_primary_entry);
      if v_posted_basis is not null then
        v_line := v_posted_basis;
        v_line_missing := false;
      end if;
    end if;
```

`clara._plan_posted_entry_lines` is STABLE, SECURITY DEFINER, `search_path`-pinned and granted to
NOBODY — the same posture `clara._plan_amortisation_period_line` (0223) and
`clara._plan_accrual_period_line` (0303) carry, and for the same reason: it reads a table, which is
why the IMMUTABLE basis body cannot do the lookup itself. It answers `clara.journal_lines` in
`line_no` order (an INTEGER ordering, so no database collation can move it) and NULL when the entry
carries fewer than two lines.

**The block supersedes whichever per-kind arm ran, and that is deliberate.** The three arms above
it resolve a line from the plan's live revision (`amortisation_schedule`,
`revenue_recognition_schedule`) or from the LIVE accrual detail (`reversing_journal` under
`stated_period_amount`). Every one of those sources is something a correction moves, and the
ledger outranks all of them on the one question a reversal asks. In particular a
`stated_period_amount` accrual reached the same defect by a second route —
`clara._plan_accrual_period_line` reads the HIGHEST revision of the accrual detail, which a
correction supersedes — and one mechanism closes both.

**How wide the blast radius actually is, measured rather than inherited.** The plan of record says
the defect reaches every plan kind because the body is shared, which is true of the CODE. It is
narrower in the live estate, and the narrowing is a CHECK rather than a convention:
`ck_plan_revisions_auto_reverse` (0193:561) is `auto_reverse = (plan_kind = 'reversing_journal')`,
so only a reversing journal can produce a reversal leg at all — on this rig every one of the 136
`amortisation_schedule` and 64 `revenue_recognition_schedule` revisions carries
`auto_reverse = false`, and every one of the 374 `reversing_journal` revisions carries true. So what
shipped broken was the accrual lane, on BOTH sides and under BOTH calculation rules; the other two
kinds are fixed in advance, for free, because the fix sits in the shared body and is gated on a
posted entry rather than on a kind.

**It clears a refusal a correction could previously create.** Before 0332, a correction that
dropped the stated amount for a period already on the books left that period's reversal refused
`CLR10 accrual_period_amount_missing` — a posted balance with no lawful way to come off the books.
The override sets `v_line_missing := false`, so the reversal proceeds against what posted. That is
a refusal ceasing to fire, never a new one appearing.

**For a reversal with no correction behind it, nothing changes, and that is measured rather than
argued.** `clara._record_journal_entry_core` writes `clara.journal_lines` from
`clara._validate_entry_lines`'s output `with ordinality` (0225:1849-1854), and that validator keeps
exactly `account_code` / `debit_cents` / `credit_cents` / `description` in the basis's own order
(0009:294-299). So for an uncorrected plan the override IS the revision's own lines and the basis
body produces the same bytes it produced before. The estate's existing reversal cells are the
evidence: `p640.occ.reversal` compares a reversal's admitted basis line by line against the
revision's, `p652.reversal.binds`, `p942.posts` and #937's per-period pair compare posted lines, and
all of them stay green (250 plan-family cells were run; see the lane report).

The one place the two can differ without a correction is a 1..5c residual, which
`clara._validate_entry_lines` settles onto the client's rounding account as an EXTRA line. Before
0332 a reversal dropped that line and the validator minted its own mirror at posting time; after
it, the reversal carries the mirror explicitly. The netted ledger is identical and the explicit form
is the better of the two, because the reversal now names every line it undoes. No accrual,
prepayment or recognition basis can produce a residual — both legs of each carry the same figure —
so this is a statement about the shared body, not about a lane that ships today.

**One consequence nobody asked for, and it is the right one.** If a correction moved an accrual onto
DIFFERENT accounts after a period posted, the reversal now posts to the ORIGINAL two accounts (the
ones carrying the balance) rather than the new ones. If one of those has since been deactivated, the
reversal REFUSES at posting time instead of posting to an account that carries nothing. A balance
cannot be cleared off an account the books will not accept a line on; the remedy is to reactivate
it. No new refusal is minted here: the floor already existed and this file only routes a reversal
into it.

WHICH floor, exactly — corrected by the adversarial round of 2026-09-25 (ADV-L01-03), because this
section and 0332's own immutable header both named the wrong body. The refusal is
`clara._record_journal_entry_core`'s own active-account check, not
`clara._validate_entry_lines`'s. The one a reversal reaches raises **CLR10** with the sentence
`line <n> codes to an account this client does not have active: <code>` and the typed detail
`{"reason":"unknown_account","field":"lines[<n>].account_code","account_code":"<code>"}`;
`clara._validate_entry_lines`'s own sentence is `line codes to a non-existent account`, it carries
**no** `reason` token at all, and it is never reached on this path because
`clara._record_journal_entry_core` runs its check first (measured on `clara_l04`: the check sits at
`prosrc` offset 26518 of that body, its call to `clara._validate_entry_lines` at 35680). A catalog
census of the live schema places the "does not have active" sentence in exactly three bodies —
`clara._record_journal_entry_core`, `clara._assert_accrual_account`, `clara._assert_adjustment_account`
— and the "non-existent account" sentence in exactly one, `clara._validate_entry_lines`. A surface
mapping refusal reasons must therefore expect `unknown_account`; the applied 0332 header keeps its
wrong citation because applied migrations are immutable, and this is where the estate states the
correction (the same idiom 0330 uses for 0308:870).

**The NULL guard is a belt, not a branch a caller can reach**, and the file says so in a checkable
way rather than in prose. `v_primary_entry` is the entry `clara._plan_primary_entry` just resolved
under this plan's row lock — approved, still live, carrying a committed receipt —
`clara._validate_entry_lines` refused it at posting time unless it carried at least two lines, and
`clara._tf_lines_immutable` (0003) has frozen those lines ever since. The prestate asserts that
belt is still on `clara.journal_lines` and pins the validator's own `sha256(prosrc)`; if the belt
ever fired it would leave today's basis rather than post a figure nobody measured.

**What is proved, and how.** The recut is static DDL — no `pg_get_functiondef` splice, no `execute`,
no dynamic SQL of any kind — so **no new entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` is
owed**; `apps/web/tests/firm-scope-db-pins.test.ts` was run to confirm it. The installed body is
0308's LIVE pre-image with exactly ONE block inserted and ONE declaration added, and the tail proves
that by **reverse substitution** (0330's `T.8`, 0331's `T.5`): it reads the installed body, REMOVES
this file's two additions, and requires what is left to hash to the `sha256(prosrc)` the prestate
pinned (`02ea6afe…`). That is the mechanical form of "nothing else in the admission core moved" —
the plan row lock, the client-status gate, the authority window, the due gate, convergence, the
one-period-one-leg wall, the per-kind arms, the missing-line refusal, the orphan wall, the Work
admission, the occurrence ledger and the audit row cannot have moved. The tail also re-reads the
post-image (`5cc0fa56…`), the resolver's own output (`e13df9d0…`), both bodies' whole grant posture
(owner-only, unreachable by `clara_authenticated`, `clara_runtime`, `clara_agent_ro` and PUBLIC),
and:

* the resolver is called by **exactly one** `clara` body, `_plan_admit_occurrence` — a second caller
  would be a second place deciding what a reversal reverses;
* the override is gated on the literal
  `if p_leg = 'reversal' and v_primary_entry is not null then`, which is how the ticket's
  out-of-scope line ("an occurrence that has NOT posted keeps reading the live revision") is
  structural rather than promised;
* the resolver's own text names none of `accounting_plan_revisions`, `accrual_adjustments`,
  `accrual_period_amounts`, `prepayment_schedules`, `revenue_recognition_schedules` or `now(` — it
  answers from `clara.journal_lines` alone, because a resolver that reached any of those would be
  re-deriving what the plan STATES, which is the very thing this file exists to stop a reversal
  doing;
* `clara._plan_occurrence_basis` is byte-identical (`cef3264e…`) and still IMMUTABLE, and
  `clara._plan_primary_entry` (`e3106ae1…`), `clara._plan_accrual_period_line` (`9951a63f…`) and
  `clara.correct_accrual_adjustment` (`6a59591a…`) are byte-identical to their pre-images — the last
  of those because the ticket's out-of-scope line is that the correction door does not change, and
  the honest way to keep a promise about a body is to pin it at both ends.

The census compares against a literal roster built with `order by p.proname`, the catalog's own C
ordering (`proname` is `name`, which never takes a database collation), so it is collation-proof by
construction.

**Redo-safe by construction (#957).** Every statement is `create or replace function`, `revoke` or
`comment on`. The prestate is bimodal on the one body this file recuts and absence-or-own-output on
the one name it mints, and it prints which branch it took. The FIRST APPLY branch ran for real
through `pnpm db:migrate` and printed `FIRST APPLY … clara._plan_posted_entry_lines is absent`; the
REDO branch was then exercised with `CLARA_MIGRATION_REDO=0332_plan_reversal_posted_basis`. There is
no data-dependent branch: every prestate and tail arm reads `pg_proc` and `pg_trigger` only.

**What it does NOT do.** It does not touch `clara._plan_occurrence_basis`,
`clara._plan_primary_entry`, `clara._plan_accrual_period_line` or any correction door. It does not
touch `clara.preview_accounting_plan`: a preview only ever projects events AFTER the plan's last
existing occurrence (`v_start := greatest(r.effective_from, v_after + 1)`), so no previewed reversal
can have a posted accrual behind it, and the preview already passes `null` for the reversed entry —
a projection of the past would be a different feature. And it changes nothing about an occurrence
that has not posted: that is what a correction is for.

## 0333 — a third accrual/bill-conflict remedy: one period's own correcting entry (#1073, riders sweep wave, lane 01)

**The gap, measured on the lane database before the file was written.** A document-sourced bill
posting inside a period an accrual has already posted for surfaces
`row_kind='accrual_bill_conflict'` (0302, #938) and offers a bookkeeper exactly two remedies:
`clara.request_plan_catch_up` over a window from the flagged due date through the accrual's
scheduled reversal date ("reverse now"), and `clara.skip_plan_occurrence`, which marks a FUTURE due
date handled and — by its own comment and its own tail — "never touches the CURRENT (already
posted) occurrence". Neither is "book the correcting entry for exactly this one conflicting
period".

**No such door existed.** Exactly FIVE bodies reached `clara._plan_admit_occurrence` before 0333:
`clara._accrual_finish` (the configuration door's tail, primary leg only), the two schedule cores
`clara._prepayment_schedule_core` and `clara._record_journal_entry_core`,
`clara.request_plan_catch_up` (the window) and `clara.wake_due_plan_occurrences` (the automatic
scan). Not one takes "one occurrence, named" from a person. 0333 is the sixth and the only one that
does, and the file's own tail asserts that count.

### The whole of it

```sql
clara.reverse_plan_occurrence(p_plan uuid, p_due date, p_op_key text) returns jsonb
```

`p_due` is the FLAGGED PERIOD's own primary due date — the value the conflict row carries in
`period`, byte for byte, which is also what both existing remedies take. The door resolves the
scheduled reversal date itself (`clara._plan_reversal_date`) and admits exactly one occurrence
(`clara._plan_admit_occurrence(plan, reversal_date, 'reversal', …, p_allow_reattempt => true)`).
It answers `{plan_id, due_date, reversal_due_date, leg:'reversal', reversed:true, occurrence:<the
admission core's own answer, verbatim>}`. bookkeeper+, `clara_authenticated` alone: no OBO twin, no
agent lane, no wake wrapper — the posture `clara.skip_plan_occurrence` and
`clara.correct_accrual_adjustment` already carry.

### Why it is not "reverse now" under another name — and one claim this section withdrew

The first draft of 0333's header argued that the window is WIDER than one period: on a monthly
schedule due on the 1st, `clara._plan_reversal_date` of period k would be period k+1's own due date,
so a catch-up would admit the next accrual beside the reversal. **That schedule does not exist in
this estate.** `clara._assert_plan_schedule` (0193:1611, restated by 0223:512) refuses
`monthly + day_of_month + 1` on a `reversing_journal` plan by name,
`reversal_collides_with_next_occurrence`, precisely so period k's reversal never lands on period
k+1's accrual day (`unique (plan_id, due_date)` would otherwise refuse the collision as a bare
23505). The refusal is driven by `p1073.scope.one_occurrence_only`'s first assertion, and the claim
it disproves is recorded here rather than quietly dropped.

So on every reversing schedule this estate admits, the window "reverse now" sends carries exactly
two due events — the flagged period's own primary, which CONVERGES because it has already posted,
and its reversal. **The two remedies admit the same occurrence on this lane**, which is exactly what
the ticket predicts when it asks for "the same net state", and the battery measures it on two
identical scenes rather than assuming it.

What the third remedy adds is therefore not a different set of occurrences. It is a different kind
of act:

* it takes a PERIOD and resolves that period's scheduled reversal date in the database. The web
  layer mirrors `clara._plan_reversal_date` by hand today (`accrualReversalDate` in
  `apps/web/lib/accruals/api.ts`) purely in order to build "reverse now"'s window; a remedy that
  names a period does not need it to, and a schedule rule with two homes eventually has two answers;
* it carries its own receipt (`clara.op_receipts`, fn `reverse_plan_occurrence`) and its own audit
  verb, so the firm's history records what the person actually did rather than "a catch-up over a
  two-day window";
* it refuses PER OCCURRENCE — a window that is not yet due refuses `catch_up_in_future` naming the
  window's end, while this door passes the admission core's own `not_yet_due` naming the occurrence;
* and "exactly one occurrence" is STRUCTURAL rather than a property of today's schedules: the tail
  refuses a body that so much as mentions `clara._plan_due_events(`,
  `clara.request_plan_catch_up(` or `clara.skip_plan_occurrence(`, so no future schedule shape and
  no future catch-up cap can widen this act.

The two existing remedies are untouched: both are `sha256(prosrc)`-pinned in 0333's prestate AND
re-pinned, with their ACLs, at its tail.

### Why the net ledger state agrees, and how that is known

Both remedies end in the SAME body. Since 0332 (#1074) `clara._plan_admit_occurrence` builds a
reversal from the lines the occurrence's own entry POSTED rather than from the plan's live revision,
so "this door nets what 'reverse now' nets for that one period" is true by construction. The battery
still measures it on two identically configured clients rather than asserting it
(`p1073.one_period.nets_like_reverse_now`): same reversal lines, and the profit-and-loss leg left
carrying the BILL's own amount — an independent figure, never a re-computation of what the door did.

### What the door owns, and what it refuses to re-decide

It owns four things, because it needs four things to name the right occurrence: the bookkeeper
floor (through `clara._plan_door_ctx` with the typed-reason wrapper, since the raw body raises a
bare CLR04 a surface cannot classify); the op-key reservation and receipt; that `p_due` really is a
due date of this schedule (the same `_plan_due_index_on_or_before` + `_plan_due_nth` pair and the
same `accrual_occurrence_not_found` token `clara.skip_plan_occurrence` uses for its own
`p_after_due`); and that this plan reverses at all.

That last one is NOT redundant, and it was measured rather than assumed. On a `recurring_journal`
plan whose schedule is monthly/`last_day_of_month`, `clara._plan_primary_for_reversal` resolves the
reversal date back to a real primary due date from the date arithmetic alone, so without this wall
the admission core would have admitted a swapped-sides entry for a plan whose revision says
`auto_reverse = false` (`ck_plan_revisions_auto_reverse`, 0193:561, ties that flag to
`plan_kind='reversing_journal'`). Refused here by name, `plan_does_not_reverse`, before anything is
reserved or written — and driven by `p1073.refusals`.

Everything else is the admission core's answer, passed outward rather than re-decided: the plan's
status, the client's status, the authority window, the due gate on the house legal date, convergence
and the ORPHAN WALL. Copying any of them here would be the third copy of a wall #1051 (0330) and
#1080 (0331) exist to have stopped making.

### A refusal is raised, not reported

`clara.request_plan_catch_up` answers a window with a list of per-event outcomes and commits its
receipt either way, which is right for a window. This door is ONE act a person asked for by name, so
it follows `clara.skip_plan_occurrence`: every way it cannot act is a typed RAISE, the transaction
rolls back — so the op key is left free for a real retry instead of pinned to a receipt that
recorded nothing — and the DoorRefusal surfaces verbatim on both surfaces that offer it.

The core's own `reason` and `code` travel outward unchanged. 0333 mints exactly two reason tokens of
its own that no body already names (`plan_does_not_reverse`, and `reversal_already_admitted` for the
core's CONVERGED answer, which carries no `reason` key at all); `invalid_op_key`,
`invalid_request` and `accrual_occurrence_not_found` are `clara.skip_plan_occurrence`'s own, reused
deliberately so one fact keeps one vocabulary. `plan_not_found` appears in the door's code map as a
BELT only: `clara._plan_door_ctx` has already resolved the plan under the caller's own firm and
raised CLR11 itself, and the `for update` lock holds that row for the rest of the transaction, so
the core cannot answer it from this entrance. The map is total over the core's vocabulary; that arm
is unreachable and the body now says so.

**What raising costs, and the two things a payload must not pretend** (adversarial round
2026-09-25, ADV-L01-01 and ADV-L01-02). `clara._plan_admit_occurrence` answers several refusals by
WRITING them: it inserts or reuses the occurrence row, stamps `outcome.state='refused'` on it and
returns that row's id — "recorded on the occurrence rather than raised … so it is legible in the
history" are its own words — and the arm a person actually reaches that way is the ORPHAN WALL,
`reversal_before_primary`. Two consequences follow from this door raising rather than reporting, and
both are contract rather than accident:

* **The refusal names no row it destroyed.** The raise rolls the core's write back, so the
  `occurrence_id` it returned names a row that never existed (or a row whose recorded refusal is
  gone). 0333 therefore forwards that key ONLY in the answers the core reaches BEFORE it writes
  anything — `reversal_already_admitted` (the converged answer) and `period_already_admitted`,
  where the row was committed by another transaction — and REMOVES it on every
  recorded-then-refused arm. Both carry `occurrence_recorded` (`true` / `false`), so a surface
  reads one rule instead of guessing which meaning of the key it holds. Driven by
  `p1073.refusals.payload_identity`.
* **The plan's own history diverges between the two remedies, and that is stated rather than
  discovered.** The SAME refusal reached through `clara.request_plan_catch_up`, which commits its
  receipt either way, leaves `reversal@<date>: refused/reversal_before_primary` in the plan's
  occurrence history beside its admitted primary — a colleague can read it later, and the same row
  becomes admissible once the accrual posts. Reached through this door it leaves nothing, because
  the raise takes the write with it. That is the price of leaving the op key free for a real retry,
  and it is the right trade for a door whose contract is "one act, and a refusal is not an act" —
  but a bookkeeper offered both remedies on one screen gets a different durable record depending on
  which they press. Driven on one scene through both doors by
  `p1073.history.refusal_record_diverges`, and named in CONTEXT.md's `accrual_bill_conflict`
  paragraph.

### What this file does not do

It does not touch `clara.request_plan_catch_up`, `clara.skip_plan_occurrence`,
`clara._plan_admit_occurrence`, `clara._plan_occurrence_basis` or any per-kind arm — the first two
because the ticket puts them out of scope, the rest because this file is a caller. It does not touch
`clara.list_review_queue`, the read that surfaces the conflict item, and it deliberately does NOT
`sha256`-pin it either: a sibling lane of this same wave splices a new `row_kind` onto that body, and
pinning a body another lane writes is the collision the wave's plan of record forbids. What the
prestate and the tail assert instead is structural — the `accrual_bill_conflict` arm is still there.
It mints no table, no CHECK, no chart row, no trigger, and no grant beyond the one EXECUTE the new
door needs.

**Redo (#957).** Applied first-apply on `clara_l04` (the prestate printed `FIRST APPLY` and the
census read 5 bodies), then re-applied once with
`CLARA_MIGRATION_REDO=0333_plan_occurrence_reversal_door` after the post-image sha was measured into
the prestate's own redo branch (the prestate then printed `REDO APPLY` and the census read 6). BOTH
branches of the bimodal pin were therefore exercised for real, so the wave-3 addendum's hand proof of
the first-apply branch was not needed. The file has no data-dependent branch: every prestate and tail
arm reads `pg_proc` and `pg_namespace` only.

**The fix round of 2026-09-25 edited this file after it was applied, and re-applied the WHOLE
CHAIN.** `CLARA_MIGRATION_REDO` refuses anything that is not the highest applied version, and 0334
sat above 0333, so the supported way to re-apply an edited 0333 was a true from-scratch chain: the
lane database `clara_l04` was dropped, `scripts/role-census-reset.mjs --apply` took the cluster back
to 0154's pinned 14 `clara%` roles, the database was recreated and `pnpm --filter @clara/db migrate`
ran `0001` → `0334` (314 files, 314 applied, no drift on a second run), then `seed`. Every one of
this lane's five files therefore printed its FIRST-APPLY branch against a real chain rather than by
the hand proof the wave-3 addendum asks for, `0330` and `0331` included — so the bimodal pins are
proved on both branches for real, and #1051's AC3 "from-scratch chain green" is satisfied on the
lane's own chain as well as by whatever the integrator runs on a disposable cluster.

## 0334 — the accrual register's side filter moves server-side (#1075, riders sweep wave, lane 01)

**The gap, in the ticket's own words.** `clara.list_accrual_adjustments` (0222, side projected by
#942/0304) takes a client and a date window and answers EVERY accrual of that client inside it. The
register's own side control (`apps/web/components/accruals/accruals-list.tsx`) narrows that
fully-read array in the browser — fine while the register reads one page, but a client-side filter
over a future paginated page would silently miss matching rows on other pages. The register does
not paginate today (`loadAccruals` calls the door with no limit; `useAsyncRead` renders the whole
answer), so this ticket prepares the read ahead of that future change and does not build it.

### The whole of it

`clara.list_accrual_adjustments` gains a fourth parameter, `p_side text default null`, applied
INSIDE the relation's own `where` (`and (p_side is null or a.side = p_side)`), ahead of the
`jsonb_agg`. A non-null value outside `clara._accrual_sides()` (`{expense, revenue}`) refuses
`CLR10 accrual_side_filter_unsupported` — the same closed-set judgement
`clara._assert_accrual_particulars` already applies to a CONFIGURED side (0304), so a caller learns
the same way a preparer does that the value is unsupported rather than reading back an empty page it
could mistake for "this client has none of either". An omitted `p_side` reproduces the
three-argument door exactly: same rows, same order, same envelope shape plus one more key,
`side`, echoing the filter that was applied (`null` for "every side" — the same way `from`/`to`
already echo the window).

### Why a drop and a create, not a `create or replace` — the 0202/#770 and 0267/#905 precedent

`create or replace function` cannot add a parameter: PostgreSQL identifies a function by (schema,
name, argument types), so a longer type list is a DIFFERENT overload left resolvable BESIDE the
three-argument body rather than replacing it — exactly the shape `list_activity`/`p_work` (0202)
and `list_accounting_work`/`p_receipt_since` (0267) record for the same reason. So the
three-argument signature is DROPPED and the four-argument one is (re-)created in the same
transaction, and the tail proves the old signature no longer resolves as a callable overload.

Nothing depended on the dropped signature (measured: zero non-internal `pg_depend` rows, and no
other `clara` body mentions `list_accrual_adjustments` by name in its own `prosrc`). A drop takes
four things a `create or replace` would have kept — owner, the SECURITY DEFINER + STABLE + pinned
`search_path` posture, and the literal ACL — all four re-issued by hand and re-read from the catalog
at the tail. No comment existed on this door before this file (`obj_description` was `null`,
measured); 0334 MINTS the first one rather than re-issuing a lost one.

**Redo-safe (#957) by construction**, the 0267 idiom: `drop function if exists <three-arg>` (a
no-op on a redo, where it is already gone) followed by `create or replace function <four-arg>`
(idempotent either way). The prestate recognises two starting shapes — the ordinary three-argument
door (first apply) or this file's own four-argument door already carrying its `p_side` /
`accrual_side_filter_unsupported` markers (a redo of this exact file) — and refuses anything else,
including a foreign four-argument body it does not recognise.

### No rig-meta cohort — the same "still the same name and ACL" shape 0267 records

`list_accrual_adjustments` is already in `ACCRUAL_ADJUSTMENTS_0222_HUMAN_FNS`
(`packages/db/tests/rig-meta.mjs`), and a drop-and-create of the SAME name at the SAME grant is not
a new name: the tail re-reads owner, posture and ACL unchanged, so that roster entry already covers
the widened door. A cohort of its own would be wrong here, not merely redundant —
`cohortFailures()` fails a half-present cohort, and `list_accrual_adjustments` is present on every
database from 0222 onward regardless of whether 0334 has applied.

### What this file deliberately does not do

It does not touch `apps/web/components/accruals/accruals-list.tsx` or
`apps/web/lib/accruals/api.ts`'s `loadAccruals`. The ticket's own second acceptance criterion is
that the register's control adopts the server-side parameter "once pagination exists", and
pagination does not exist on this branch; rewiring the control now would trade the register's
existing instant client-side filter (every row already in hand) for an unnecessary network round
trip, which neither acceptance criterion asks for. The capability lands now; the caller lands with
pagination, as a follow-up. It does not touch `clara.get_accrual_adjustment` (measured: nothing in
0334 reaches it, and it still resolves, untouched, at the tail). It does not touch the accrual's own
`side` column or `clara._accrual_sides()` (#942/0304's), both sha-pinned in the prestate and
consumed, never redefined.

**Redo (#957).** Applied first-apply on `clara_l04` (the prestate printed the three-argument,
pre-widen branch), then re-applied once with `CLARA_MIGRATION_REDO=0334_accrual_list_side_filter`
after the four-argument door already carried this file's own markers (the prestate then printed the
four-argument, prior-redo branch). Both starting shapes were therefore exercised for real, and the
door's `prosrc` sha (`2fbad3aa…`) was identical before and after the redo. The file has no
data-dependent branch: every prestate and tail arm reads `pg_proc`, `pg_depend` and `pg_namespace`
only.
## 0335 — one errcode meant two things, and one of them was never meant to be seen (#1114, riders sweep wave, lane 02)

`CLR10` is this estate's `bad-request`. [0002_foundation.sql](migrations/0002_foundation.sql) line
42 says so in one line — "CLR10 bad-request · CLR11 not-found-in-your-firm" — and 5293 raises across
the migration set have used it since, almost every one of them a refusal a surface is expected to
render. Two families of raise did not belong in that set, and #1114 is the ticket that noticed:

| raise | what it is | who sees it |
|---|---|---|
| `prepayment_source_unfit` / axis `prepaid_account_not_enrolled`, and its deferred-revenue twin `deferred_revenue_source_unfit` / `deferred_account_not_enrolled` | the roster said no. It carries `reason_text`, the account code, `remedy` = `clara.enrol_prepayment_account` and `panel` = `client_registers_prepayment_accounts` | a bookkeeper. `apps/web/lib/prepayments/schedule.ts:27` and `apps/web/lib/deferred-revenue/schedule.ts:16` already render it |
| `invalid_author` on the two on-behalf-of twins; `prepayment_read_scope_required` and `revenue_recognition_read_scope_required` on the two machine-lane reads | a `clara_runtime`-only door was handed a null its own caller's contract guarantees | **nobody.** The wave-4 successor contracts say it in as many words: "an internal wiring error, never shown: the successor always has the actor" (`reports/wave4-lane04-ticket915.md:359`, and `:389` for the read), carried into `CUT-PLAN.md:210` and `:215` |

Both raised `CLR10`, so a log line, a retry policy or a generic handler that branched on the code
alone could swallow the first as an internal fault or surface the second as a refusal. That is the
whole defect.

### The new code, and why the move goes this way

    CLR10  — a bad request a surface may render. Unchanged, everywhere.
    CLR44  — a CALLER-CONTRACT VIOLATION. A clara_runtime-only door was handed a null its own
             caller's contract guarantees. Never rendered; there is no sentence to show and no
             remedy to offer.

Moving the renderable half instead would have meant re-coding thousands of raises **and** would have
left the never-shown half on `CLR10` beside them, so the ticket's own test — "any code path that
branches on the error code first … cannot accidentally treat a real, actionable refusal as an
internal error to be swallowed, or vice versa" — would still have failed. Moving the never-shown
half is four raises and it PARTITIONS the two meanings. Nothing about a reason, an axis, a field or
a sentence changed; only the SQLSTATE. The web is untouched, because both surfaces key on `reason`
and `axis` and neither of the four moved refusals is reachable from a browser at all.

### The audit (#1114 AC2), and its population

There is **no errcode catalog file** in this estate. `CLR10`'s meaning lives in 0002's header
comment and in this README's prose; the code-side catalogs are `packages/db/tests/rig-helpers.mjs`
(`CLR01`–`CLR12`, now plus `callerContract`) and a smaller one in
`packages/db/tests/work-journal-fixtures.mjs`. Both now carry `CLR44` with the same meaning, which
is the "entry, or a correction, so each code carries one meaning" the ticket asks for.

The audit was a grep of **every** `CLR10` raise in `packages/db/migrations`, read by reason token,
cross-checked against the live catalog: 626 live `clara` bodies raise `CLR10`, under 468 distinct
reason tokens. Against that population the question was not "is this refusal user-facing?" (almost
all of them are) but "does the estate's own prose say this one is never shown?" Exactly two prose
sites do, naming three tokens, and all three are moved here. `invalid_op_key` deliberately **stays**
on `CLR10`: human doors all over the estate raise it for a person's own malformed call, so it is not
a caller-contract class.

**The rule for a future raise.** A refusal goes on `CLR44` only when the door is machine-lane only
**and** the argument is one the calling program's own contract guarantees. Everything a person can
cause stays on `CLR10`. `packages/db/tests/refusal-errcode-partition.test.mjs` holds the partition:
`CLR44` is raised by exactly four bodies and carries exactly three reason tokens, so a fifth site or
a fourth token fails by name rather than quietly re-creating the collision.

### What 0335 recuts, and what it refuses to touch

Four `create or replace function` statements — `clara.create_prepayment_schedule_for`,
`clara.create_revenue_recognition_schedule_for`, `clara.read_prepayment_source_for` and
`clara.read_revenue_recognition_source_for` — each VERBATIM from its live cut (0307 §D, 0308 §E2 and
0317's two reads) except the one SQLSTATE and the comment that explains it. The tail re-measures each
payload and sentence, so "byte-identical except the code" is asserted rather than promised.

It does **not** touch `clara._prepayment_schedule_core` or `clara._revenue_recognition_core`. The
renderable refusals live there and keep `CLR10`; both cores are pinned EXACTLY in the prestate and
the tail asserts neither has learned `CLR44`. That leaves the two bodies the next ticket in this lane
(#1077) recuts exactly as 0317 wrote them.

It mints no function, no relation, no grant and no role. `create or replace function` preserves an
ACL, and the tail re-measures all four: `clara_runtime` holds EXECUTE, and `clara_authenticated`,
`clara_agent_ro`, both wake roles and PUBLIC hold none.

**The prestate pins**, measured live on the lane database (`clara_l05`, 309 files, max
`0318_knowledge_fye_pair_applicability`) rather than copied from an older header:

| body | pre-image `sha256(prosrc)` |
|---|---|
| `clara.create_prepayment_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text)` | `230db25c762adb1283f5d96f9334f797cf5b30ef54b7a8395a39cf111770f98a` |
| `clara.create_revenue_recognition_schedule_for(uuid,uuid,uuid,text,text,text,jsonb,text,text)` | `2344bc09dddbe5f38a324ad3ac2ef22ceb28b5940b4521b4421ae8ac73cfbe5e` |
| `clara.read_prepayment_source_for(uuid,uuid,uuid)` | `6c7ed11e97a7001ee24eedf53d53d2b61cb0e2c9539ef040e22201b6a99e84c7` |
| `clara.read_revenue_recognition_source_for(uuid,uuid,uuid)` | `9701ddda2a73f4f635ca32e356403ad27dd2aed91a1c0fbfbd4992b84ebc1753` |
| `clara._prepayment_schedule_core(…)` — must NOT move | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |
| `clara._revenue_recognition_core(…)` — must NOT move | `28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd` |

Each recut body admits exactly two pre-images of its own — its pinned sha, or a body already
carrying this file's `0335` attribution — so a redo is admitted and real drift still refuses by name.
The prestate also asserts `CLR44` is raised by nothing outside these four before the file runs, and
that both roster refusals are in the cores rather than in a door.

**Redo-safe by construction (#957).** Every statement is `create or replace function`. Both branches
were exercised on the lane database: the FIRST APPLY through `pnpm db:migrate` (prestate reported
`4 FIRST, 0 REDO`), and the REDO branch through `CLARA_MIGRATION_REDO=0335_internal_refusal_errcode`
five times during the vertical-slice loop and the vacuity controls (`3 FIRST, 1 REDO` → `2 FIRST,
2 REDO` → `1 FIRST, 3 REDO` → `0 FIRST, 4 REDO`, and twice more with a door or the core put back at
its pre-image by hand). Every redo landed on the same checksum
`439962ebd877cc5376dbda790fdf75d0b4f2fbee63f431863331924ffd063f11`, from BOTH pre-images, which is
what "safe over its own effects" has to mean.

## 0336 — two lanes derived the same nested idempotency key, so one operation key spent on both collided (#1077, riders sweep wave, lane 02)

`clara._reserve_op` ([0004_governed_fns.sql](migrations/0004_governed_fns.sql) line 47) keys an
operation receipt on `(firm_id, fn, op_key)` and is the reserve-before-effect primitive every
governed door in this estate rides. A door that nests ANOTHER door inside itself therefore has to
hand that inner door an operation key of its own, and this estate's convention is to derive it —
`p_op_key || ':<suffix>'`. Both schedule lanes write their underlying accounting plan through
0193's own human door, and both derived it with the SAME suffix:

| body | derived key, before 0336 | the fn it reserves under |
|---|---|---|
| `clara._prepayment_schedule_core` (human arm) | `<key>:plan` | `create_accounting_plan` |
| `clara._revenue_recognition_core` (human arm) | `<key>:plan` | `create_accounting_plan` |
| `clara.replace_prepayment_schedule` | `<key>:end`, then `<key>:plan` | `end_accounting_plan`, `create_accounting_plan` |
| `clara.replace_revenue_recognition_schedule` | `<key>:end`, then `<key>:plan` | `end_accounting_plan`, `create_accounting_plan` |

The OUTER reservations never collided: each door reserves under its own `fn`. The DERIVED ones did.
A caller that spends one operation key on both lanes — a run deriving its keys from a shared seed is
#1077's own example — inserted `(firm, 'create_accounting_plan', '<key>:plan')` on the first lane,
and the second lane met that row with a different request hash and was answered
`op_key reused with different args` under **CLR10 with no detail at all**: indistinguishable from
any other bad request, and naming neither the lane, the key, nor the fact that a reservation was
reused. Measured on the lane rig before the fix, at both pairs of doors.

### The fix: the deferred-revenue lane's derived keys become its own

    prepayment lane      <key>:plan      <key>:end        unchanged
    deferred-revenue     <key>:rrplan    <key>:rrend      0336

#1077 offers two remedies and this file takes the first. The second — giving `clara._reserve_op`'s
reuse raise a typed reason — would only make the collision legible, and it would change what dozens
of unrelated doors answer for a genuine retry-with-different-arguments, because that raise is the
shared one. Qualifying the key REMOVES the collision, and the ticket names that arm first ("for
example `:rrplan` for the deferred-revenue lane, keeping `:plan` for prepayment"). The
deferred-revenue lane moves because the ticket names it as the one to move, so no schedule already
configured on the prepayment lane changes the key it reserved.

**The correction door is in scope, and that is not a widening.** AC1 asks that "the two lanes'
nested plan reservations no longer share a key namespace". The two correction doors meet at `:end`
one step BEFORE they reach the plan door, so leaving that one shared would make AC1 false at the
first reservation either of them takes. Both of the deferred-revenue door's derived keys move; both
of its prepayment sibling's stay.

**The on-behalf-of arm was never affected.** `clara._revenue_recognition_core`'s machine lane calls
`clara._obo_plan_core` with no operation key at all — 0317 states the reason at lines 2252-2259:
`clara.create_accounting_plan` resolves its actor from a JWT a runtime connection does not carry —
so it never took a nested reservation and had nothing to collide with. The same is true of the
prepayment core's OBO arm (0317:1752-1756 says so in its own prose).

**Normal idempotency is untouched (#1077 AC3).** A true retry — the same door, the same key, the
same arguments — is answered by the OUTER reservation, which this file does not touch: the door
replays its stored result and never reaches the nested call at all. A retry with DIFFERENT arguments
is still refused by that same outer reservation with the same message. Both are driven in
`p1077.same_lane.idempotent` (`tests/revenue-recognition-plan-op-key.test.mjs`).

**No receipt is backfilled.** Rows already written under `<key>:plan` by the deferred-revenue lane
stay as they are. They are historical records of acts that happened, the outer receipt is what a
retry of those acts replays from, and rewriting an idempotency ledger to match a later naming
decision would be the more dangerous act. The one residue is that a NEW prepayment schedule using an
operation key an OLD deferred-revenue schedule already spent still meets that old `<key>:plan` row;
that is the pre-0336 collision surviving in data rather than in code, and it shrinks to nothing as
keys are spent once.

### What 0336 recuts, and what it refuses to touch

Two `create or replace function` statements — `clara._revenue_recognition_core` and
`clara.replace_revenue_recognition_schedule` — each VERBATIM from its live 0317 cut (0335 moved
neither) except the derived key literals and the comments that explain them.

It does **not** touch `clara._reserve_op`, `clara.create_accounting_plan` or
`clara.end_accounting_plan` — not a line, and not a sha pin either. That the two nested reservations
really land under those two fns is proved by DRIVING the doors and reading `clara.op_receipts`
(`p1077.cross_lane.create`, `p1077.cross_lane.replace`), never by pinning a body another lane of
this wave writes.

It mints no function, no relation, no grant, no role and no reason token. The tail re-measures both
ACLs: the core stays ungranted to every application role, and the correction door stays
`clara_authenticated`'s alone with no machine lane and no wake wrapper, which is #941 AC3's decision
and not this file's to change.

### The prestate pins (measured on the riders sweep lane-02 database, 310 files, max 0335)

| signature | pre-image `sha256(prosrc)` |
|---|---|
| `clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)` | `28bc14e93fc61863b76ae40a47fd30c1d40a30940a9c7997c38c1862a62290dd` |
| `clara.replace_revenue_recognition_schedule(uuid,uuid,text,jsonb,text)` | `c69273a9b4dadb7274358adcf7c54de4f17c513efd50a394396fe89982c6453e` |
| `clara._prepayment_schedule_core(…)` — must NOT move | `87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a` |
| `clara.replace_prepayment_schedule(uuid,uuid,text,jsonb,text)` — must NOT move | `ed859dbe813067464a7635d6775c823a36c3f400b59f326952fb22c6ce34e699` |

Each recut body admits exactly two pre-images of its own — its pinned sha, or a body already
carrying this file's `0336` attribution — so a redo is admitted and real drift still refuses by name.
The prestate also asserts that the four schedule bodies share the `:plan` suffix before the file runs
(and that the two correction doors share `:end`), and that `:rrplan` and `:rrend` are derived by
nothing in the estate outside this file's two bodies.

**The rule for a future lane.** A door that nests a plan door inside itself derives a suffix that is
its OWN lane's, not `:plan`. The tail holds it for these four bodies: no `clara` body may derive both
namespaces, and `:rrplan`/`:rrend` may be derived by 0336's two bodies and by nothing else.
`tests/revenue-recognition-plan-op-key.test.mjs`'s census cell holds the same statement against the
live catalog after any later recut.

**The suffix namespace is wider than these two lanes, and 0336 does not claim otherwise.**
`clara.create_accrual_adjustment`, `clara.correct_accrual_adjustment` and
`clara.confirm_tenancy_rent_plan` also derive `:plan` from their callers' keys. #1077 names the
prepayment and deferred-revenue pair and only that pair, so those three are left alone and recorded
as a follow-up rather than swept in silently.

**Redo-safe by construction (#957).** Every statement is `create or replace function`. Both branches
were exercised on the lane database: the FIRST APPLY of the complete file with both bodies put back
at their 0317 pre-images by hand (prestate reported `2 FIRST, 0 REDO`), and the REDO branch through
`CLARA_MIGRATION_REDO=0336_revenue_recognition_plan_op_key`.

## 0337 — the prepayment-account roster reserves its enrolled codes (#1078, riders sweep wave, lane 02)

`clara.enrol_prepayment_account` ([0306_prepayment_account_roster.sql](migrations/0306_prepayment_account_roster.sql)
§B, recut by 0308 for the deferred-revenue purpose and by 0315 §H for its race handler) wrote a
roster row and reserved **nothing**. `clara._acct_role_reserved`
([0043_wave_d_b1_staff_advances.sql](migrations/0043_wave_d_b1_staff_advances.sql) line 756) — the
shared census of which register holds a client's chart code — unioned the fixed-asset family and the
staff-advance register and had never known the prepayment roster exists. So a code enrolled as a
prepayment account this morning could be bound as a registered bank account, enrolled into the
fixed-asset register (directly or through the opening-balance carry-down), or enrolled as a
staff-advance account this afternoon, and every one of those was **admitted**. The collision then
surfaced days later at the schedule door, as a `prepayment_source_unfit` refusal carrying the shared
wall's `bank_account` axis — which is #1078's own sentence: *"nothing prevents the double-enrolment
from happening in the first place"*.

**The owner ruling of 2026-09-24** on #1078 is two answers, and only the second is built here:
`account_inactive` stays a known, harmless dead axis for chart accounts (no deactivation door is
built), and the prepayment roster **does** reserve its enrolled accounts, the way its fixed-asset and
staff-advance siblings already do.

### What 0337 changes

| § | body | what moves |
|---|---|---|
| A | `clara._acct_role_reserved` | a third arm: LIVE prepayment-roster enrolments, `domain = 'prepayment'`, `role = ` the enrolment's purpose, `owner_ref = ` the code |
| B | `clara._adj_line_eligibility_breach` | its reservation read SKIPS the new domain, so every answer this wall gives is the answer it gave before 0337 |
| C | `clara._fa_assert_code_unreserved` | the bank belt's machine reason names the register that actually holds the code |
| D | `clara.upsert_fa_account_profile` | its shared-union refusal names `retire_prepayment_account` for a roster claim |
| E | `clara._adv_enrolment_admission` | a third remedy branch, `retire_prepayment_enrolment_then_re_enrol`, with its own advice |

§A is the whole of the reservation: the bank belt (`clara._fa_assert_code_unreserved`, reached from
the `t_bank_accounts_fa_reserved` trigger), the fixed-asset discriminator
(`clara._fa_role_claim_conflict`, read by the profile door, the opening-balance carry-down and the
disposal-reversal wall) and the staff-advance admission predicate
(`clara._adv_enrolment_admission`) all read the census, so one arm closes all three at once and
cannot drift from them. A fourth reader spliced into three doors is exactly the drift 0042's own
tails exist to prevent.

### The three claim doors, and the one thing each of them needed

None of the three needed a new gate: they read the census, and §A put the roster in it. What they
needed is that what they SAY stays true once a third register can hold a code.

**§C — the bank belt.** `clara.add_bank_account` and `clara.remap_bank_account_coa` both reach
`clara._fa_assert_code_unreserved` through the `t_bank_accounts_fa_reserved` trigger on
`clara.bank_accounts` (`AFTER INSERT OR UPDATE OF coa_account_code, active ... WHEN (new.active)`),
so #1078's headline example closes with no change to that body's logic at all. Its message was
already domain-driven ("reserved by the *%* register"); its machine `reason` was not — it said
`coa_account_advance_reserved` whatever domain held the code. A prepayment claim now answers
`coa_account_prepayment_reserved`, and the advance token is unchanged byte for byte, which
`p1078.claim.bank` drives on both domains on one client.

**§D — the fixed-asset profile door.** It asks `clara._fa_role_claim_conflict`, which returns any
reservation that is not the FA role being claimed, so §A alone makes it refuse a roster-held code.
Its refusal then told the person to "retire that enrolment first (retire_staff_advance_account,
which needs every advance on it settled)" — a door that cannot release a roster enrolment, which is
the dead end the WDB-R2 ruling of 2026-08-03 ordered eradicated from exactly this family of
sentences. The remedy clause is now per domain and the advance branch's words are unchanged.
`p1078.claim.fixed_asset` drives the refusal, then drives the named remedy and watches the profile
enrol, so the sentence is not a promise.

**§E — the staff-advance enrolment door.** `clara.enrol_staff_advance_account` ENFORCES
`clara._adv_enrolment_admission`, and `clara._adv_on_approve` shows that same body's `advice` to a
person trying to reverse an entry on a code the register no longer holds — which is why the branch
carries a full sentence and not only a remedy token. Its reservation arm had two branches, both
fixed-asset-aware, and an `else` that assumed staff-advance. A roster claim now takes its own
branch: remedy `retire_prepayment_enrolment_then_re_enrol`, advice naming
`retire_prepayment_account` and stating what retirement does and does not do (it closes the account
to new schedules and leaves a running one posting to term end, so it frees the code without
disturbing the books). `p1078.claim.staff_advance` drives the door, reads the advice off the
predicate, then drives the remedy and watches the advance enrolment land.

### §B is the load-bearing half, and it is not a softening

The fixed-asset and staff-advance reservations mean *"a register machine owns this code; an ad-hoc
line must not touch it"*. A prepayment-roster enrolment means the **opposite**: this account IS the
prepaid asset (or the contract liability) that the amortisation lane exists to post against — and
that lane asks the shared wall about that very code, in five places:
`clara._prepayment_schedule_core` and `clara._revenue_recognition_core` on the source leg, both
attention reads, and `clara.enrol_prepayment_account` on the code being enrolled.

Measured on the lane rig with §A in and §B out: the schedule door refuses its own enrolled prepaid
leg (`prepayment_source_unfit` / `prepaid_account_ineligible`), the attention bands drop every
candidate they exist to offer, and a bookkeeper restating an enrolment's reason is refused by their
own live enrolment. Because the wall could not see the roster **before** 0337 either, filtering the
domain out is precisely what keeps every answer identical; `p1078.wall.unmoved` measures that at the
wall and at the doors, and `p940.*` re-measures the five axes it always did.

### What 0337 deliberately does not do

- It builds **no chart-account deactivation door** and makes `account_inactive` no more reachable
  than it was. That is the first half of the owner's ruling.
- It does **not** touch `clara._acct_role_reserved_at`, the as-of twin. Its single reader is
  `clara._fa_gl_leg_foreign`, which asks "was a NON-FA register holding this code when that leg was
  booked" for the fixed-asset tie-out; a prepayment arm there would make every leg on a prepayment
  account foreign to the FA register as of that date, which is an accounting answer nobody asked to
  change. The twin is pinned in §0 so the asymmetry is a decision and a drift is visible.
- It does **not** reserve a code whose enrolment has been RETIRED while a schedule still runs
  against it. #940's owner decision 5 says retiring closes the account to NEW schedules and leaves a
  running one posting to term end, so that state is reachable and is not covered here; closing it
  needs either a precondition on `clara.retire_prepayment_account` or a second disjunct over live
  plans, and both are a decision #1078 did not give. Recorded as a follow-up rather than swept.

### A consequence worth writing down

After 0337 the schedule door's `prepaid_account_ineligible` arm is **no longer reachable for an
enrolled account through any governed door**. Each of the wall's five axes is closed ahead of it:
`account_unknown` and `account_inactive` have no door at all, `control_account` needs a re-type that
`clara._upsert_account_core` refuses on any account carrying lines, and `bank_account` and
`account_reserved` are what 0337 itself now refuses. The arm stays in the body as defence in depth,
`p1078.wall.unmoved` measures that it is still asked, and `p940.schedule.roster_gate` says so in its
own comment instead of quietly dropping the claim.

### The one reader 0337 does not recut, and why

`clara._draft_opening_item_core` is the FOURTH reader of `clara._fa_role_claim_conflict`, so §A
already makes the opening-balance fixed-asset carry-down **refuse** a code the roster holds — the
gate is closed. What its refusal does not do is name the third release door: it offers "Seed this
asset on a different account" first, which is always valid, and then enumerates the two release
doors it knew about. That list is incomplete rather than wrong; the fix is one `case` in a 445-line
body, and nothing in this battery can DRIVE that door without building the wave-b onboarding world.
Re-emitting 445 lines for a sentence no cell exercises is the widening the riders work order names,
so it is filed as a follow-up with the exact site instead. `clara._fa_reversal_blocked`, the other
reader 0337 leaves alone, needs nothing: its sentence is already domain-neutral ("release that claim
first (retire the enrolment or the profile that took it)"), and its text is pinned in §0.

**Redo-safe by construction (#957).** Every statement is `create or replace function`, between a
marker-tolerant prestate (each recut body admits its pinned pre-image OR a body already carrying
this file's `0337` attribution) and a tail that reads the live catalog. Both branches were exercised on the lane
database: the REDO branch five times as the file grew section by section, and the FIRST-APPLY
branch with all five bodies restored to their measured pre-images by hand (prestate reported
`5 FIRST, 0 REDO`, file checksum unchanged at `42b2281f6c1156ed0a22632260d00cca92a26729f1bdde025f74fc57dd4d69b6`).

## 0338 — the clocked prepayment lane gets a directing human (#1050, riders sweep wave, lane 02)

`clara.wake_establish_prepayment_schedule` refuses. #1036's fix round
([0315_prepayment_wake_reroute.sql](migrations/0315_prepayment_wake_reroute.sql)) made the
`close_prep` wake lane answer `CLR03 wake_authority_absent` and write nothing, because an unattended
wake names no directing human and a plan authorised by `clara.agent_user_id()` could never admit a
single occurrence — that user holds zero `clara.firm_memberships` rows, and
`clara._plan_admit_occurrence` hands the plan's `authorised_by` straight to
`clara.admit_journal_work`. The owner ruled a **directing human**, not a widened admission wall.

**The ticket as filed could not be built.** It named "the member who enabled `close_prep` for the
firm". There is no such person: `clara.wake_engine_sources` holds ONE GLOBAL ROW per `source_key`
([0133_g1_wake_engine.sql](migrations/0133_g1_wake_engine.sql):204-239), `clara.set_wake_source_enabled`
is operator-only, and the broadcast audit row sent to every other firm deliberately carries
`actor = NULL`. The **2026-09-25 ruling** on #1050 (which amends the earlier ruling on #1036)
re-briefs it: a NAMED MEMBER of the firm records a **firm-level standing instruction**, that member
is the wake plan's directing human, admission runs under that member's own authority and membership,
and `clara.accounting_plans.authority_kind` gains ONE value.

### What 0338 changes

| § | object | what it is |
|---|---|---|
| A | `clara.firm_standing_instructions` | a new append-only relation: one live instruction per (firm, key), recorded by a named member, withdrawn by a stamp |
| B | `clara.record_firm_standing_instruction` | the recording door — admin floor, `clara_authenticated` only |
| G | `clara.withdraw_firm_standing_instruction` | the door that takes it back — same floor, same lane |
| C | `clara.accounting_plans.authority_kind` | 0193's one-member CHECK gains `standing_instruction`, and nothing else |
| D | `clara._authority_ref_refusal` | a fourth reference kind, `firm_standing_instruction`, resolved at FIRM scope and only while live |
| E | `clara._obo_plan_core` | the two authority kinds admitted ONLY in their own strict pairing |
| F | `clara._prepayment_schedule_core` | the `wake` arm stops refusing for want of a person and starts finding one |

### Why the relation is append-only rather than a toggle

`clara.wake_engine_sources` carries its state as mutable `enabled` / `enabled_by` columns, and this
file deliberately does not copy that. An accounting plan **cites** the instruction row that
authorised it, so a row that could be re-recorded in place by a different member would let a plan's
citation silently come to name someone who never gave it. A row per recording act, withdrawn by a
stamp and never overwritten, keeps `authority_ref` → `recorded_by` equal to the plan's
`authorised_by` for as long as the plan exists. The shape is `clara.prepayment_account_enrolments`'
([0306](migrations/0306_prepayment_account_roster.sql) §A), which is itself 0043's and 0041's.

### Why the admin floor

The act the instruction authorises — configuring one client's amortisation schedule — is bookkeeper
work (`clara.create_prepayment_schedule`). **Standing** it, so that an unattended run performs it for
every client of the firm until somebody withdraws it, is a firm-level governance act, which in this
estate sits at admin (`clara.record_client_fact`, [0055](migrations/0055_client_facts_trio.sql))
rather than at the floor of the act it authorises. Owner rank clears it. §G carries the same floor
for the same reason: standing an act and stopping it are one decision seen from two sides.

### Two admins, one instruction: the rung and the one interleave it cannot close

The recording door reads the firm's live row and then inserts. `for update` on a row that does not
exist yet locks nothing, so two admins recording the same instruction in two tabs each saw the
other's row as absent and both inserted; one of them met `uq_firm_standing_instructions_live` and
was handed a **raw `23505`** — no CLR code, no `detail.reason`, nothing a surface can key on. Driven
with two real connections in `p1050.record.race`, which proves the block from `pg_blocking_pids`
rather than from a sleep.

`clara.record_firm_standing_instruction` therefore takes
`pg_advisory_xact_lock(203005009, hashtext(firm || ':' || instruction_key))` **after** its op-receipt
reservation and **before** the live-row read — [0037](migrations/0037_wave_c_c_tieout.sql) §K's
order, the same placement 0238's fix round used for the client rung and
[0287](migrations/0287_client_birth_wall.sql) used for `203005008`. A rung of its own, not the firm
rung `203005002` and not the client rung `203005004`: the key is (firm, instruction key), so two
different standing instructions of one firm never wait on each other, and no body that takes an
existing rung gains an ordered pair with this one. Once serialised, the second session reads the
first one's committed row and takes the lawful version-forward branch — an unchanged re-recording is
idempotent, so it is answered with the row that already stands.

`clara.withdraw_firm_standing_instruction` needs no rung: its `for update` locks a row that exists,
so a second withdrawal blocks on the row, re-evaluates `withdrawn_at is null` and is answered
`CLR11 firm_standing_instruction_absent` — already typed.

**The one interleave a rung cannot close** is an older SNAPSHOT. A caller in `repeatable read` waits
for the rung, gets it (the writer ahead of it has committed and let go) and still reads the world
without the row it waited for, because a snapshot is not a lock; the unique index is not
snapshot-bound, so the insert meets it. That insert is wrapped and `unique_violation` is answered
`CLR13 operation_in_flight` with the instruction key — the door's own retryable word, and a retry on
a fresh snapshot takes the idempotent branch. Driven by `p1050.record.race_snapshot`.

### Why the pairing, and why the human door is not widened

`standing_instruction` is admitted only together with an `authority_ref` of kind
`firm_standing_instruction`, and that kind only with `standing_instruction`. Without the pairing the
widening would be a loosening: a `standing_instruction` citing a chat turn would be a label pasted
on a person's typed decision, and an `explicit_instruction` citing a standing-instruction row would
be a person claiming their firm's blanket delegation as something they themselves decided.

`clara.create_accounting_plan` is **not** widened. Only the OBO twin is, because only an unattended
lane has nobody at the keyboard. That also keeps §E's explicit branch byte-for-byte the wall that
was there, which is what #915's and #941's parity cells (`p915.obo.refusals_match`,
`p941.obo.authority` — they compare the two entrances' whole refusal payloads) measure. #977's
closed world of exactly three readers of `clara._authority_ref_refusal` is unmoved: the wake lane
resolves the firm's live instruction itself and hands the citation to the twin.

### What the wake lane does now

0. The arm sits directly BELOW the reservation's replay short-circuit and above every wall that
   reads the entry, the roster or the accounts. The standing instruction is MUTABLE WORLD STATE, so
   reserve-before-mutable-validation ([0305](migrations/0305_prepayment_stated_term.sql) §B /
   [0306](migrations/0306_prepayment_account_roster.sql) §B) governs it: the first cut answered
   FIRST, and a clocked task that had ALREADY SUCCEEDED and lost its reply was told
   `wake_authority_absent` after the firm withdrew the instruction — while its schedule, its plan
   and its completed `clara.op_receipts` row all stood. "A lost response turned into a second
   refusal" is what `clara._reserve_op` exists to prevent. Driven by
   `p1050.wake.replay_after_withdrawal`. A FIRST call refused here still costs nothing: the raise
   takes its reservation row with it, which `p1050.wake.absent` and `p1050.wake.lapsed` re-measure.
1. Resolve the firm's LIVE `prepayment_schedule_at_close` instruction. None → `CLR03
   wake_authority_absent`, the same token, lane, quoted wake kind and task and the same `remedy`
   (`clara.create_prepayment_schedule`) #1036's refusal carried, plus `standing_remedy` and
   `instruction_key` so the refusal names the door that gives the instruction.
2. The member who recorded it must still carry **the authority the plan will spend every month** —
   both halves of it. `clara._admit_accounting_work_core`, which every occurrence goes through, asks
   for an ACTIVE membership (`actor_not_active`) *and* a rank of at least bookkeeper
   (`insufficient_role`), so this door asks for both too. Either missing → `CLR03
   wake_authority_lapsed` with an `axis` of `membership` or `role_rank`, refused at configuration
   time rather than configuring a plan that could never post (#1036's own lesson). The first cut
   asked only about membership, and a member who was DEMOTED rather than removed still configured a
   schedule whose every occurrence then answered CLR04 `insufficient_role` — measured on this rig
   before the rank joined the test (`p1050.wake.demoted`; `p1050.wake.lapsed` holds the other axis).
   The floor is read from the admission wall (`clara.role_rank('bookkeeper')`) rather than restated,
   so the two cannot drift into a state where this door admits what that one refuses.
3. Otherwise the plan is written through the OBO plan step with that member as `authorised_by`,
   `authority_kind = 'standing_instruction'`, and an `authority_ref` carrying BOTH the instruction
   row and the clocked task — so one row links the instruction, the wake and the plan. The schedule
   row still names `clara.agent_user_id()` as the run that wrote it, and its audit row carries
   `via_wake_kind = 'close_prep'`.

**The idempotency payload does not move.** The reservation still hashes the CALLER's own
`p_authority_ref` (the honest `agent_wake` descriptor the wrapper builds), never the citation this
body derives, because this door's own law is that the key identifies the decision a caller made.

### What withdrawal does not do

A withdrawn instruction closes the lane to NEW schedules. Plans already written keep posting under
the member who authorised them, exactly as #940's ruling leaves a running amortisation posting to
term end when its account's roster enrolment is retired. Whether withdrawal should also pause the
plans it produced is a decision #1050 was not given; it is filed as a follow-up.

**Redo-safe by construction** (#957): `create table if not exists`, `create or replace function`,
`drop trigger if exists` before each `create trigger`, `drop policy if exists` before each policy,
and `drop constraint if exists` before §C's re-add. The file writes no row and backfills nothing.
The prestate pins the three recut bodies by `sha256(prosrc)` measured on this lane's rig and admits
exactly two pre-images each — the pin, or a body already carrying this file's own `0338`
attribution — so a redo is admitted and real drift still refuses by name. BOTH branches were
measured on this rig for all three bodies as the file grew section by section: `2 FIRST, 0 REDO`
when §D and §E first applied, `1 FIRST, 2 REDO` when §F joined them, and `0 FIRST, 3 REDO` on the
final redo of the finished file — whose checksum
(`0ebcab8519dcdb73777f896093dbb2f3dad4e8f473990202b11494280348970d`) is unchanged across two
consecutive redos.

### The integration seam, carried rather than deferred

`clara._obo_plan_core` is written by lane **L1** as well (#1051,
[0330_plan_authority_wall_predicate.sql](migrations/0330_plan_authority_wall_predicate.sql) §C),
which extracts the authority wall this file widens into one shared predicate,
`clara._assert_plan_authority(text, jsonb, uuid, uuid)`, and recuts both plan doors to `perform`
it. L1 merges first, so on the integrated chain 0330 applies BEFORE 0338 and the pre-image is L1's,
not 0308's. The first cut of this file pinned only 0308's, which meant it could not apply behind
0330 at all; and an unconditional recut written against 0308 would have silently reverted #1051 on
the very chain it runs on.

**§E delegates to #1051's predicate unconditionally — recut at integration.** As written on the
lane it was ONE STATIC BODY that asked the catalog which route existed: where
`clara._assert_plan_authority` was present the twin `perform`ed it, and where it was absent the
twin carried 0308's own block, character for character. That branch existed only because the two
lanes were built in parallel and neither could assume the other's merge order. The merge settled
it: 0330 and 0338 ship together and 0330 is the lower number, so no chain this file can reach
lacks the predicate. The `else` arm is gone, §0 gained check 4c, which REFUSES to apply this file
without the predicate, and the twin now delegates every kind but its own.

**Why the dormant copy could not simply be left.** #1051's own cells measure it.
`p1051.wall.one_definition` refuses any clara body that both CALLS the predicate and keeps a copy
of the wall's sentence, and `p1080.wall.one_spelling` re-asks the same question across the whole
schema; on the integrated chain this body was both, and both cells went red at the merge. A second
copy of an authority wall, even an unreachable one, is exactly the drift #1051 exists to close.

§0 still pins BOTH pre-images (`2049c1c4…` for 0308 §D, `149b4a3d…` for 0330 §C, the latter
measured off lane L1's own migration file and equal to the sha L1's ticket report records), so a
THIRD shape refuses BY NAME and says what to re-derive. What the recut moved is the body this file
INSTALLS, never the bodies it accepts finding.

**Not two `create or replace` statements chosen by a `do` block**, which is what the first cut of
this fix did: that is dynamic function-creating DDL, and `scripts/check-wiki-dynamic-sql.mjs`
refuses it without a contract-level `DYNAMIC_SQL_ALLOWLIST` waiver — measured, the lint named this
exact statement — while its own first piece of advice is *write the statement as plain SQL*. After
the integration recut there is no branch left to choose at all: one static body, plain SQL.

**The eight authority axes were driven on both routes before the recut** and were identical, code
and `detail` byte for byte — `authority_rule_unsupported`, `invalid_authority_kind`,
`authority_ref_invalid` on each of `object` / `kind` / `id`, the explicit-with-standing-ref
pairing, and `authority_ref_unresolved` on both the chat-task and the standing-instruction
reference — which is why deleting the fallback changes no behaviour any chain could observe.
`p1050.authority.wall_route` still proves the ROUTE inside one rolled-back transaction, and it too
was recut at integration so that both arms stay reachable on a chain that carries 0330.

**The second kind stays OUTSIDE the shared predicate, and that is a decision.**
`clara._assert_plan_authority` admits exactly one authority kind and is called by the human plan
door and, after #1080, by the accrual core; folding `standing_instruction` into it would admit the
firm's blanket delegation at doors the ruling gives it to nobody — which this file's own tail item
6 refuses. So the twin answers its own kind in its own branch and delegates every other kind,
unchanged, to the one wall.

**Three pins that are no longer shas, and why.** A sha pin is the right instrument for a body no
other lane of this wave writes; for one another lane DOES write it turns that lane's lawful recut
into an abort of the whole chain (the sweep plan's own seam rule). `clara.create_accounting_plan`
(L1's #1051) and `clara._plan_admit_occurrence` (L1's #1074, 0332) are therefore asserted as the
invariants this file actually depends on — the human lane never names `standing_instruction`, and
the occurrence body still hands the plan's `authorised_by` to `clara.admit_journal_work` — and
`clara._prepayment_plan_core` as the delegation §E needs from it. Tail items 6 and 7 moved the same
way: item 6 asks the human door AND the shared wall whether either names the second kind, and item
7 asserts the ROSTER of readers of `clara._authority_ref_refusal` rather than a count of three.
The count is in fact three on both chains, with different members —
`sign_depreciation_authority`, `create_accounting_plan`, `_obo_plan_core` without L1;
`sign_depreciation_authority`, `_assert_plan_authority`, `_obo_plan_core` with it — which is
exactly why a count was the wrong assertion. `p1050.authority.human_lane_unwidened` holds both
facts from the test side, on either chain.

## 0339 — an `advance_allocations` array that is present carries at least one allocation, by name (#1067, riders sweep wave, lane 03)

`0339_staff_expense_claim_empty_allocation.sql` recuts exactly one body,
`clara._assert_claim_basis(uuid,jsonb,boolean)`, at 0301's post-image byte for byte plus one new
rule. It creates nothing, drops nothing, grants nothing and mints no new name, so it carries no
`rig-meta.mjs` cohort; its frontier is the stem `staff_expense_claim_empty_allocation$` and its
sweep escape hatch is `tests/staff-expense-claim-empty-allocation-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_SEC_EMPTY_ALLOCATION=1`), last in the gate chain, in migration order.

**What was live.** 0301's payload half opens the allocation block with `v_listed := jsonb_typeof(…)
= 'array' and jsonb_array_length(…) > 0`, and asks every list rule under `if v_listed`. A
present-but-EMPTY array is therefore not a list at all to that validator, so the settlement rule,
the distinctness rule, the exact sum and the head rule are all skipped. Driven on the lane database
(`clara_l06`, chain 0001..0318) before the fix, in three shapes:

- an advance application carrying `advance_allocations: []` **and** `advance_id` was **ADMITTED** —
  `clara._claim_allocations` falls through to its single-advance branch, so the door posted the
  claim against an advance the stated list does not name. Evidence: cell `p1067.empty` red with
  "the call SUCCEEDED (no error)" before the recut, green after.
- the same claim **without** `advance_id` was refused, but with the world half's
  `advance_allocation_mismatch` / `claim.advance_id` / `present` — the very refusal a claim that
  named no advance at all receives, so "I sent an empty list" and "I told you nothing" were one
  refusal. Cell `p1067.tellapart`.
- on any other settlement the key was **IGNORED**: a reimbursement carrying `advance_allocations:
  []` was admitted and posted, because the rule that refuses a list on a non-advance settlement is
  itself gated on `v_listed`. Cell `p1067.settlement`, red on the admission before the recut.

The ticket frames this as the two layers disagreeing about who catches an empty list, and they did:
`packages/runtime/src/workRoutes.ts` already refuses one (`advance_allocations` / `at_least_one`),
while the database — the boundary any caller can reach — relied on an exact-sum check that never
runs against an empty array.

**The rule, and where it sits.** The new check is asked immediately after "is it an array?" and
immediately before anything that reads what the array says, which is the same two-step
`claim.items` is already judged in (`array`, then `at_least_one`). It therefore holds regardless of
the claim's total (#1067 AC1's own words) and regardless of the settlement, and it makes `v_listed`
honest: after this file `v_listed` is false only when the key is absent or JSON `null`, so no
present list shape can skip the four rules any more. A claim carrying no `advance_allocations` key
is untouched (#1067 AC3) and so is one carrying JSON `null`, which 0221's type rule admits as
"absent" and this file does not move.

**The word.** `reason` stays `advance_allocation_mismatch` and the new `constraint` is
`at_least_one`, the word the runtime already uses, so both layers now say the same thing. #1067 AC2
is met by the constraint alone: `at_least_one` and `exact_sum` are two named specialisations of one
reason at one field, and the tail drives both in the same run. No web change was needed —
`fieldForClaimPath` (`apps/web/lib/work/staff-expense-claim.ts`) already maps
`claim.advance_allocations` onto the `advanceAllocations` control.

**Redo (#957) and the first-apply branch.** The single statement is a `create or replace function`
and the prestate detects its own redo by the marker `#1067 (0339` in the live validator, skipping
only the recut pin; the ten non-regression pins are checked on both branches. The FIRST APPLY
branch ran through `pnpm db:migrate` (`#1067 prestate: clean (FIRST apply)`), and was additionally
re-proved by hand inside a rolled-back transaction with 0301's own body restored, so the sha branch
the redo can never take was seen to pass on its own.

**The vacuity control.** With 0301's body put back on the lane database byte for byte (live sha
`e439346cbf68a267b143aa2fe03c5285acd7eed3f769b0c0c6a0c31c38aae04a`), the three behaviour cells fail
and the AC3 pin stays green: `p1067.empty` and `p1067.settlement` report "the call SUCCEEDED (no
error)", and `p1067.tellapart` reports the empty list answering `claim.advance_id` / `present` —
byte-identical to the claim that named no advance at all, which is the conflation AC2 names. The
recut was then restored through the supported redo mode
(`CLARA_MIGRATION_REDO=0339_staff_expense_claim_empty_allocation`), post-image sha
`5c55fc8d860bc74c4fd721a81442b4ea19ed66240ef3d20386efd53e2a2cd294`, and a second redo over that
post-image exercised the prestate's REDO branch (`clean (REDO apply)`).

**Tail T.6 is structurally unreachable, and is kept anyway — say so rather than read it as
evidence** (fix round, adversarial finding ADV-06; this section is corrected in place because
0339 is this lane's own unmerged file). T.6 counts stored claims whose canonical basis carries
`advance_allocations` as an array of length 0. It can never be anything but 0 on any database,
hosted included: `clara._claim_basis_canonical` appends that key only under `case when
jsonb_array_length(clara._claim_allocations(p_claim)) >= 2`, and `clara._claim_allocations` turns a
present-but-empty array into the one-element `advance_id` shape — both bodies re-read from
`pg_proc` on the lane database to confirm it. So the wave-3 rule "a data-dependent branch must be
entered once" cannot be met for T.6, and it proves nothing about real rows; it is a belt-and-braces
catalogue assertion that the shape this file refuses was never storable in the first place, and the
real guard for that is the `sha256(prosrc)` pin on `clara._claim_basis_canonical` in the same tail,
which fixes the `>= 2` rule itself. It is not dropped because the migration is applied on every
lane rig and an applied file is never edited: `CLARA_MIGRATION_REDO` takes the HIGHEST applied
version only (0341 here), and editing 0339's bytes would abort every later `migrate` on those
databases with checksum drift — a disproportionate price for deleting an assertion that costs one
sequential scan and can only ever pass.

**`set local statement_timeout` — the lane's decision, recorded** (fix round, adversarial finding
ADV-07). 0341 opens with `set local statement_timeout = '5min'` and calls it "the runner rule";
0339 and 0340 do not set it at all. Repo practice is genuinely mixed (17 of the last 30 migrations
set it; 0301, 0310, 0316 and 0318 do not), so neither spelling breaches a documented house rule —
but three files written by one lane in one week should not disagree with each other about a rule
one of them names. **The decision: setting it is the better default** (a long `create or replace`
on a loaded hosted database should not inherit an unbounded timeout), and it is a note for the NEXT
migration this family writes rather than a change to 0339/0340, for the same immutability and
checksum-drift reason above. Both files are single `create or replace function` statements, so the
practical exposure is nil either way.

## 0340 — the #931 label arm matches on `lower(btrim(person_label))`, the first of the owner's two conditions (#1052, riders sweep wave, lane 03)

`0340_staff_expense_claim_label_case.sql` recuts exactly one body,
`clara._assert_claim_basis(uuid,jsonb,boolean)`, at its LIVE post-image — which on this branch is
0339's, not 0301's, because #1067 landed earlier in the same lane — byte for byte apart from two
`lower(...)` calls and the comments that say why. It creates nothing, drops nothing, grants nothing
and mints no new name, so it carries no `rig-meta.mjs` cohort; its frontier is the stem
`staff_expense_claim_label_case$` and its sweep escape hatch is
`tests/staff-expense-claim-label-case-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_SEC_LABEL_CASE=1`), last in the gate chain, in migration order.

**The ruling this file answers.** The owner ruled on #931 on 2026-09-24 that arm (b) of the
claimant-ownership wall stands — an advance held under ANOTHER live enrolment of the same client
whose `person_label` is the claimant's — "under two conditions the wall must keep: the label match
is exact after normalisation (case and surrounding whitespace only, never a substring or a fuzzy
match), and the allocation editor shows, beside each such advance, the enrolment it came from". The
first condition is this migration's; the second is a web change and carries no database object.

**What was live, measured rather than read off the ticket.** Driven on `clara_l06` at chain
0001..0339 before this file was written:

- SURROUNDING WHITESPACE is already normalised AT ENROLMENT, not at the wall. Both doors that write
  a label store `nullif(btrim(coalesce(…,'')),'')` — `clara.enrol_staff_advance_account`
  (0043:1980) and 0221's auto-enrolment inside the claim door (0221:1149) — so an admin who types
  `"  farah BINTI idris  "` leaves `farah BINTI idris` on the row. Cell `p1052.label.case` reads
  the stored label back off `clara.staff_advance_accounts` and says so.
- CASE was normalised nowhere. 0301 compared `btrim(sa2.person_label) = btrim(sa.person_label)`
  (0301:753 and 0301:791, carried forward by 0339 at its lines 519 and 557), so a claim by the
  claimant enrolled as `Farah binti Idris` allocating against an advance under the client's second
  live enrolment labelled `farah BINTI idris` was REFUSED `CLR10` /
  `advance_allocation_mismatch` / `not_this_claimant` — the same refusal a genuinely different
  person's advance gets. Cell `p1052.label.case` was red exactly there before the recut.

**The change.** `lower(btrim(...))` on both sides, and nothing looser. The claimant's side is
lowered once where `v_claim_label` is read, so the loop compares two already-normalised strings and
there is exactly one place either side can drift. Not a substring, not `like`, not a similarity,
not `unaccent`; not a collation change and not a `citext` column. `btrim` stays at the wall for a
row that predates the trimming doors — the tail's probe plants exactly such a row (`"  ali  "`) so
that `btrim` is exercised rather than assumed.

**What it widens, plainly.** Two different people of one client labelled `Ali` and `ali` were two
claimants to this wall and are now one, exactly as two labelled `Ali` and `Ali` already were. That
is the ruling's own trade; the staff master (#1049, re-parented to the mainline on 2026-09-25) is
the real fix. Nothing else moves: the same client, an ACTIVE enrolment, the whole label, and the
per-advance cap and the claimant floor untouched. The change only ever admits an allocation the
ruling calls lawful, and never widens whose books a claim may reach.

**The tail is DRIVEN, on real rows.** The label arm lives in the world half, which needs a client,
a chart, live enrolments and advances to reach, so the tail builds them by hand and unwinds them in
a `CLR99` sub-transaction (the 0018 / 0019 / 0020 / 0146 / 0260 / 0302 probe idiom). It proves, at
apply time: `Ali` matches `"  ali  "` (admitted); `Ali` does not match `Ali B` (refused
`advance_allocation_mismatch` / `not_this_claimant` at `claim.advance_allocations[2].advance_id`);
#1067's empty-list rule still fires by name; an advance this client does not hold is still refused
`not_this_client`; and an advance under a RETIRED enrolment is still refused however its label
reads. `T.4` then counts, always and without branching, how many ordered pairs of live enrolments
on the database become one claimant under the normalised match — `2` on this lane database at first
apply, and the number a hosted apply should be read against. Nothing is backfilled: the wall is
asked per claim.

**Redo (#957) and the first-apply branch.** The single statement is a `create or replace function`
and the prestate detects its own redo by the marker `#1052 (0340` in the live validator, skipping
only the recut pin; the eleven non-regression pins and #1067's marker are checked on both branches.
The FIRST APPLY ran through `pnpm db:migrate` (`#1052 prestate: clean (FIRST apply)`), and the
first-apply branch was additionally re-proved by hand inside a rolled-back transaction with 0339's
own body restored, so the sha branch a redo can never take was seen to pass on its own. Both redo
branches were exercised: `CLARA_MIGRATION_REDO=0340_staff_expense_claim_label_case` over 0339's
restored body took the sha branch, and a second redo over this file's own post-image took the
marker branch (`clean (REDO apply)`).

**The vacuity control.** With 0339's body put back on the lane database byte for byte (live sha
`5c55fc8d860bc74c4fd721a81442b4ea19ed66240ef3d20386efd53e2a2cd294`), `p1052.label.case` fails with
`that advance was not issued to this claimant` and `p1052.label.distinct` stays green — correctly,
because it pins behaviour this file must not move. The recut was then restored through the
supported redo mode; post-image sha
`d1dff7654eda906324b534d723511ba9d4fd5b091f994a84200680c3fb164ffd`.

## 0341 — the Work card names how many advances a staff expense claim discharges (#1069, riders sweep wave, lane 03)

`0341_work_claim_allocation_count.sql` recuts three bodies — `clara.get_work_claim_origin(uuid)` at
its 0221 pre-image, `clara.list_accounting_work(...)` at its 0267 pre-image and
`clara.get_accounting_work_row(uuid)` at its 0266 pre-image — each byte for byte plus one new
projected key, `allocation_count` (the fix round below says why the two list-surface bodies joined
the file). It creates no relation, drops nothing, grants nothing and mints no new name, so it
carries no `rig-meta.mjs` cohort; its frontier is the stem `work_claim_allocation_count$` and its sweep escape hatch is
`tests/work-claim-allocation-count-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT=1`), last in the gate chain, in migration order.

**What was live.** `clara.get_work_claim_origin` (0221) labels a claim Work's identity block on the
Work detail page with the claimant and the settlement kind alone. Since #931 (0301) a single claim
can discharge SEVERAL open advances through its own confirmed allocation list
(`clara.staff_expense_claim_allocations`), but neither the door nor the web line it feeds
(`apps/web/components/work/work-detail.tsx`'s `PostedEntrySection`,
`data-testid="work-claim-origin"`) said so: a claim that discharges one advance and a claim that
discharges three rendered byte-identically. Verified by reading 0221's live
`jsonb_build_object(...)`, which carried no such key.

**The measurement.** `allocation_count` is a bare `select count(*) from
clara.staff_expense_claim_allocations where claim_id = sec.id` — no `coalesce(...,1)`, no
settlement branch. That is exact for EVERY claim the door has ever answered for, not only ones
admitted after 0301, because 0301 itself makes it so: SECTION G backfills one allocation row per
pre-0301 `advance_application` claim at 0301's own apply time (unconditional, run once), every
claim admitted after 0301 gets its row(s) from `admit_staff_expense_claim_work` SECTION 8a whose
`clara._claim_allocations` normaliser gives a legacy single-`advance_id` submission its own
one-element list, and #1067 (0339) closed the one gap (a present-but-empty `advance_allocations`
array) that could have left a live claim with zero rows. So the count is 1 for a single-advance
claim, the matching row count for a multi-advance one, and 0 for a claim that discharges no advance
at all (`reimbursement`, `already_settled`) — the honest count of an arm that is not there. Tail T.2
DRIVES all three shapes to prove it rather than trust the inventory: it admits a reimbursement, a
single-advance and a two-advance claim through the REAL door (`admit_staff_expense_claim_work` takes
its author as an explicit argument, not from a JWT, so it is callable directly inside a migration
DO block) and reads each back through the REAL recut door under a faked
`request.jwt.claims` GUC (`clara._human_ctx` reads exactly that), the same mechanism PostgREST sets.
This is a new pattern in this migration family — earlier tickets in this lane drove `_assert_claim_
basis` directly rather than the admission door — introduced here because `allocation_count`'s
correctness is a property of ADMITTED rows, not of the validator alone.

**Fix round (review finding L03-SPEC-01): the LIST surface, which is what the ticket asked for.**
The first cut projected `allocation_count` on `clara.get_work_claim_origin` alone and rendered it on
the Work DETAIL view. #1069's AC2 is "the Work LIST card renders that count when it is greater than
1", and its stated value is giving a reviewer that information *without opening the claim* — which a
detail-view line cannot deliver. The Work list renders from `clara.list_accounting_work`'s own
projection (0266 put `claim_id`/`claimant_label` there for exactly this reason, deliberately without
a second per-row call to the detail read), so the count belongs there, and on
`clara.get_accounting_work_row` beside it: 0266's own comment calls that door "ONE Work in the SAME
projection clara.list_accounting_work emits", `tests/work-list.test.mjs`'s wl.13 asserts it, and
`apps/web/lib/work/work-list.ts` types both doors' answers as one `WorkListRow`, so widening the
list alone would have made all three false at once and left a deep-linked claim silently without its
count.

Both list doors are SECURITY INVOKER (the detail read is DEFINER), so the new subquery is read by
the signed-in role rather than by a definer. That is safe and deliberate:
`clara.staff_expense_claim_allocations` is FORCE-RLS, `SELECT` is granted to `clara_authenticated`
alone, and its one read policy is `p_sec_allocations_read … for select to clara_authenticated using
(firm_id = clara.jwt_firm())` (0301, re-measured on the lane rig before the file was written) — so a
caller can only ever count allocations of their own firm's claims, and the row the count hangs off
is already firm-scoped by `clara.accounting_work`'s own RLS. Tail T.2f/T.2g DRIVE both list doors
**as `clara_authenticated`** under the probe's faked JWT (`set_config('role', …)` inside the same
rolled-back sub-transaction), so the count is proved through RLS rather than around it: 0 for the
reimbursement, 1 for the single-advance claim, 2 for the two-advance one on the list page, the same
2 on the addressed row, and the `allocation_count` key present on every row of the page. Tail
T.1g/T.1h additionally pin both doors' owner, INVOKER posture, `search_path`, `plan_cache_mode`,
PUBLIC-revoked/`clara_authenticated`-only ACL, this file's marker, the `{rows, next_cursor,
truncated}` envelope and that each body reads the register **exactly once**.

**What this file does not touch, and pins.** `clara._claim_allocations` (the normaliser whose
single-advance branch is why a legacy claim's row exists at all) and
`clara.admit_staff_expense_claim_work` (SECTION 8a, the writer of every row this count reads) —
neither is CALLED by the recut body, but both are pinned because a future change to either could
silently break the invariant this field leans on without touching a byte of `get_work_claim_origin`
itself, which is exactly the drift a pin is for.

**The web half** ships in the same ticket's commits and carries no database object:
`apps/web/lib/work/staff-expense-claim-reads.ts`'s `WorkClaimOrigin` type gains
`allocation_count: number`, and `work-detail.tsx`'s identity block renders
`StaffExpenseClaim.origin.allocationCount` (`"settles {count, plural, one {# advance} other {#
advances}}"`, `data-testid="work-claim-allocation-count"`) beside the existing claimant/settlement
line only when `allocation_count > 1` — a single-advance claim's card is byte-identical to today's.
`apps/web/e2e/staff-expense-claim-mock.mjs`'s `get_work_claim_origin` handler was widened the same
way, for the same reason 0266's own header gives for restating a mock: an inaccurate mock is a
silent hole a real regression could hide in. The fix round adds the LIST half:
`apps/web/lib/work/work-list.ts`'s `WorkListRow` gains `allocation_count: number | null` (null for a
Work that is not a claim, the same honest absence `claim_id` already carries), and
`apps/web/components/work/accounting-work-list.tsx`'s `workRowClaimLabel` names the count on the
claim label it already renders on every row — again only when it is greater than 1, so a
single-advance claim's row is byte-identical to today's.

**Redo (#957) and the first-apply branch.** The single statement is a `create or replace function`
and the prestate detects its own redo by the marker `#1069 (0341` in the live door. Both branches
were exercised FOR REAL on the lane database, in chronological order rather than simulated: the
TRUE first apply ran through `pnpm db:migrate` (`#1069 prestate: clean (FIRST apply)`, tail T.2's
three DRIVEN shapes all green), and `CLARA_MIGRATION_REDO=0341_work_claim_allocation_count`
re-applied it over its own post-image (`#1069 prestate: clean (REDO apply)`, same tail green
again), post-image sha `f7d1b9944349da60a0a8e9e8f7fd2418ace8fc2b08084cee0009578b280a99e2`.

The fix round then edited this same unmerged file and re-applied it the supported way,
`CLARA_MIGRATION_REDO=0341_work_claim_allocation_count` (ledger checksum
`6fac2a872e965baa00215e5fd304ea937c4eab89e3698a413e1183524bb6741f`, 312 files, max `0341`). Because
`CLARA_MIGRATION_REDO` only ever takes the redo branch, the two NEW prestate pins (the 0267 and 0266
pre-images, each with its own marker-tolerant redo branch) had their FIRST-APPLY branch proved by
hand: inside one transaction that was rolled back, 0267's and 0266's own `create or replace`
statements were re-run to restore the pre-images, the `$p1069_pre$` block was run verbatim and
passed against them, and a negative control that drifted `get_accounting_work_row`'s pre-image by
one comment was refused `CLR10 … has DRIFTED from its pinned pre-image`. Post-image shas after the
redo: `clara.get_work_claim_origin`
`4c0dad6effd1883eaad3bbdff489fdcbf03e26228c80ea5e11a12b718c9771e4`, `clara.list_accounting_work`
`fc679a2d4d96341d664d881b9e43da54ed1d8d2e5fe04f4ca45351ff7dbf8dbc`,
`clara.get_accounting_work_row`
`28aba20bdb39b0f6f5deb2ddf24937f1fa847c0b1128c3d6a4eeaae08781713e`.
## 0342 — the payroll registry's `business_operation` catches up to the posting lane #946 already shipped (#1061, riders sweep wave, lane 04)

`0342_payroll_registry_business_operation_supported.sql` closes a gap left across two riders wave
4 tickets on the SAME lane: `0296_payroll_summary_typed_facts.sql` (#945) opened reading on the
six `payroll_summary` pdf/image pairs and deliberately left `business_operation` at `stored_only`,
because its own header says the drafting-and-posting half belonged to "a later file". That later
file, `0297_payroll_summary_posting.sql` (#946), shipped and now posts a payroll run unattended
whenever `clara._payroll_posting_verdict`'s closed rung roster holds — but it never touched
`clara.document_capabilities`, so the registry kept publishing a claim the estate had already
outgrown. #1061 is the follow-up filed against exactly that gap.

**This file is a pure content republication, the same shape as #782's 0245 and #988's 0246
before it.** It creates no function, table, trigger, check, policy or grant, and recuts nothing.
Its whole content is two UPDATE statements on `clara.document_capabilities`: the six
`payroll_summary` rows whose mime is `application/pdf` or `image/*` move `business_operation`
from `stored_only` to `supported`, and the registry-wide version raise every prior republication
has used (0299's most recent, 6 → 7, the same SET-TO-LITERAL `<> 7` form 0299's own header argues
for over a bare `+ 1` — redo-safe on its own and composable with another lane raising to the same
literal in the same wave, though no other lane in this wave touches this table).

**Why `supported`, not a bare guess at "whatever value fits.".** The ticket names the value
itself as negotiable ("or whatever value correctly describes 'posts unattended once the gate
passes'") but also names the precedent to match: "matching what #948's own capability-registry
row for financing agreements does for the same reason." 0299 already answered this exact question
for the mirror-image `agreement_contract` lane — an unattended post is 0191's own published
definition of `business_operation = supported` ("Clara does this today, and a test proves it" /
"where Clara can carry typed facts into it"), not `proposal_only` (#988's later fifth level,
"Clara proposes, a person confirms") — `clara._payroll_posting_verdict` posts the entry itself,
nobody confirms a proposal first. `typed_facts` does not move: it has read `supported` since 0296.

**Only the basis sentence's closing clause moves, by `replace()` rather than a full rewrite.** The
old sentence — "Nothing is posted from these facts yet; the filing appears as work a person
completes." — is swapped for one naming `clara._payroll_posting_verdict`'s own closed roster
(0297 §D's brief quote, verbatim in shape): both reading channels agree, every arithmetic check
passes, every account resolves in the client's own chart, the month is established and no entry
for that client and month already exists, or the run appears under Needs you naming the condition
that failed. Everything ahead of that sentence — the byte-extraction engine, the facts engine, the
never-guess disclosure, the per-employee-strip disclosure — is provably untouched by construction,
because `replace()` on a basis that does not contain the old sentence is a no-op rather than a
literal that could silently retype the unchanged half wrong.

**`limits.payroll_employee_detail` does not move, and that is the point.** The per-employee
boundary 0296 named is not this ticket's subject: `clara.persist_payroll_facts` still strips every
per-employee figure before storage and `clara._payroll_entry_plan` (0297 §C) drafts the posted
entry from the run-level totals alone, so the boundary is exactly as true after 0342 as before it.
Restating it would not be a re-derivation.

**Scope is exactly the six rows #1061's AC1 names, and only them.** The two payroll-family tail
checks in the prestate/tail both re-derive from the live router branch (mime = pdf or image/*)
rather than an enumerated literal list, and a family-blind diff at the tail's step 5 re-asserts
that no `document_kind` outside the small, already-`supported` set (the invoice family, agreement
contract, bank statement, opening balance) gained the value — the tail's own guard against #1061's
AC2 ("no other document kind's registry row changes as a side effect").

**Prestate pins.** The five #779/#846/#782 wall trigger bodies this file's raise rides, measured
live on this rig (never transcribed from an older header): `_tf_document_capabilities_version_
monotone` `170df87b…e9c56`, `_tf_document_capabilities_version_high_water` `b4090687…618c9`,
`_tf_document_capabilities_high_water_record` `839c51fb…9de40d`,
`_tf_document_capabilities_version_uniform` `d21b6837…5ef776` — all four at their 0244/0245
pre-images, unchanged since — and `_tf_document_capability_high_water_monotone` at
`62e83a3b…974ec8c`, which is `0272_document_capability_wall_completion.sql`'s POST-image, not
0244's or 0245's: 0272 (a different, already-merged fix round, live on `main` before this branch
was cut) recut that one trigger a second time as a key-change BEFORE UPDATE trigger, and the
migration's own prestate names the rig it measured on rather than copying an older file's sha.

**`document-capability-registry.test.mjs` moves in the same commit** (`af3b5955`/#779's own
precedent for editing this battery alongside the migration that moves its subject):
`PUBLISHED_REGISTRY_VERSION` re-bases 6 → 7, the payroll cell now asserts `business_operation =
'supported'` and a basis that has stopped promising the pre-0297 dead end, and the file's own
running commentary gains a numbered paragraph (7) recording why. `EXPECTED_CELLS` is unchanged —
no cell was added or removed, only two assertions inside the one payroll cell.

**rig-meta cohort.** None — comment-only, the same posture 0245's and 0246's entries carry, for
the same reason: no function, table or trigger is minted, so there is no name to roster and no
cohort array would be anything but empty.

**Gate.** No new preintegration gate file. `document-capability-registry.test.mjs` is already
gated by `document-capability-preintegration-gate.mjs` (0191's cohort), which this file does not
change, and `packages/db/package.json`'s `$GATES` list needs no new entry.

**Web pins corpus.** `apps/web/tests/firm-scope-db-pins.corpus.ts` was checked (a migration file
changed, work order rule (d)): 0342 contains no `pg_get_functiondef` splice and no other dynamic
SQL construct the corpus's lexer would need a reviewed barrier for, so no entry was added.

**Out of scope, by the ticket's own words.** The payroll posting gate's own logic and conditions
(`clara._payroll_posting_verdict`, `clara._payroll_entry_plan`) are untouched, and no other
document kind's registry row is re-derived.

## 0343 — a payroll summary that prints no run total posts from its own row sum when the page witnesses its own completeness, and otherwise parks a question (#1048, riders sweep wave, lane 04)

**What it settles.** `0297_payroll_summary_posting.sql` left one arm deliberately unbuilt and said so
in its own header (0297:346-353): it would not draft from `computed_cents`, the row sum 0296's
evaluator offers when a page prints employee rows but no totals row, "because whether the owner wants
a row sum admitted as a posting basis is a product question this ticket does not answer for them."
The ruling recorded on #946 on 2026-09-24 answers it, and #1048 is that answer: the row sum IS a
posting basis when the document witnesses its own completeness, and when it does not, the lane PARKS
A QUESTION for a person instead of refusing.

**The accounting, and why the witness is the whole of it.** Posting from a row sum means posting a
figure the page never states. A reading that missed an employee line understates staff cost,
understates the net owed and understates the statutory payables (EPF, SOCSO, EIS, PCB) that are
remitted against a filed return — a misstatement and a compliance exposure, not a rounding question.
So the sum is admitted only against a witness that the lines read are ALL the lines:

| witness | what it is worth |
|---|---|
| a printed employee headcount equal to the lines read | the strongest: the document itself asserts how many employees are in the run, and the reading found exactly that many |
| a printed page count of one | weaker, and its exact worth is stated rather than assumed: it witnesses that the DOCUMENT is not truncated, not that the RUN is complete — which is precisely the gap the row sum opens |
| a named person's `yes` | the professional judgement the standing owner ruling asks Clara to ask for, recorded with their name, their note and the reading it was about |

A printed headcount the lines CONTRADICT is the one case where a witness is worse than silence: the
reading is known incomplete and nothing posts, not even against a page count of one. A `no`, or no
answer, keeps the document unposted.

**The residual this file does NOT introduce and does NOT widen.** Only the six columns a payslip row
prints have a sum, so a row-sum entry books the gross, the four employee deductions and the net, and
the employer's own EPF/SOCSO/EIS and the HRDF levy get no leg. That is 0297:355-359's standing rule
("an unprinted line produces no leg") applied unchanged: a printed totals row that omits those
columns has produced the same partial entry since #946. This file changes WHICH FIGURE a leg may come
from, never WHICH LEGS exist.

**The entry balances by the row identity, not by luck.** `gross - (epf_ee + socso_ee + eis_ee + pcb)
= net` is the identity 0296's evaluator already checks on every quoted row, and it holds at run level
over the summed columns. The worked example (#945's own two rows) posts
Dr 6000 500000 / Cr 2100 55000 / Cr 2110 2450 / Cr 2120 980 / Cr 2130 16000 / Cr 2040 425570, and
the exact-balance rule 0297 set (no rounding leg, ever) is untouched.

**Sections.**

| section | what |
|---|---|
| A | prestate — bimodal pins (pre-image sha OR this file's own marker) on the six bodies it recuts or splices, plus v1's registered closure body and the month parser |
| B | `clara.evaluate_payroll_run_state_v2(jsonb,jsonb)` + its freeze registration at version 2 |
| C | `clara._payroll_answers_ok` recut — two OPTIONAL witness questions |
| D | `clara.persist_payroll_facts` spliced — the lane banks a v2 state |
| E | `clara._payroll_entry_plan` recut — a witnessed row sum is a posting basis |
| F | `clara.payroll_completeness_answers` — what a named person said, and when |
| G | `clara._payroll_completeness_answer(uuid)` — the reading-bound answer read |
| H | `clara._payroll_posting_verdict` recut — the `completeness_witness` rung |
| I | `clara._post_payroll_run` recut — the entry and its receipt name the basis |
| J | `clara.list_review_queue` spliced twice — row_kind `payroll_completeness_question`, and #946's own arm stands down for it |
| K | `clara.answer_payroll_completeness(uuid,text,text,text)` + its event type and taxonomy row |
| Z | tail |

**Why a `_v2` evaluator and not a recut.** 0296 registered `clara.evaluate_payroll_run_state_v1`'s
single-member closure in `clara.evaluator_versions`, and `clara.verify_evaluator_freeze()` re-derives
it LIVE between every migration body and its commit — so an in-place edit fails at APPLY, not merely
at review. 0296:710-711 names the only lawful repair: "ship the change as
clara.evaluate_payroll_run_state_v2 with its own version row." v2 is v1 byte for byte for the eleven
run-level questions, the row census, the row identity, the column sums, the printed-total cross-check
and the text-vs-vision comparison; the battery pins that by comparing v2's `facts`, `rows`,
`established`, `disagreed` and `missing` against **v1's own output on the same two envelopes**. The
same posture `clara.evaluate_metric_v2` took beside `evaluate_metric_v1` (0135).

**Why the two witness facts live OUTSIDE `facts`.** `clara._payroll_posting_verdict` walks
`jsonb_each(facts)` and folds any state in `('totals_mismatch','rows_unbalanced','unreadable',
'unanswered')` into its `arithmetic_holds` rung. `payrollFacts_v1` is FROZEN and does not ask the two
witness questions yet, so a witness inside `facts` would have arrived `unanswered` and blocked EVERY
payroll run in the estate on the grounds that the page does not add up. Two new top-level keys
(`witness`, `completeness`) cost one line in each consumer; one new fact would have cost the lane.
For the same reason the two answers are KNOWN but OPTIONAL in `clara._payroll_answers_ok`: an
eleven-key envelope — exactly what the frozen worker sends — is still admitted byte-unchanged.
Optional never means malformed: a witness answer that IS present is held to the same two-state
vocabulary, non-blank rendering and 200-character bound as one of the eleven.

**A count is parsed as a count.** v1's normalization turns `"2"` into 200 cents, which is right for a
figure and wrong for a headcount. The witness arm parses a plain non-negative integer of at most six
digits (thousands separators and spaces dropped, nothing else admitted) and compares the two channels
on THAT integer. `not_asked` is a verdict distinct from `not_printed`, because a prompt that never
asked and a page that prints nothing are different facts about the world.

**`rows.agreed` is what a headcount is compared against**, not a raw row count: the evaluator only
sums a column over a row set it can honestly sum (0296:581-592), and comparing against anything
larger would let a page whose last line the two channels read differently satisfy a headcount that
covers a line no sum included.

**A v1 state already banked stays v1 and still reaches the question.** Every payroll pair read before
this file carries `state_version: v1` and no `completeness` object, and the rows the evaluator summed
were stripped at the persist boundary (0296:1876-1883), so the state cannot be re-derived. §E admits
both versions by name and treats a v1 state as "no witness" — which moves an already-read,
never-posted summary off 0297's dead end and onto the parked question. That is a deliberate
behaviour change for already-banked readings, including hosted ones, and it is the change the brief
asks for.

**One rung, three named reasons.** `completeness_witness` sits immediately after
`run_totals_printed`, because it is only reachable when that question had no printed answer, and the
two never both fail: §E emits `run_totals_not_printed` when there is no sum at all (no rows, a
contested reading, an unreadable rendering) and a `completeness_*` reason when there is one.

| reason | what a person does |
|---|---|
| `completeness_contradicted` | re-file a complete copy: the reading is known incomplete and nothing can be affirmed |
| `completeness_unwitnessed` | ANSWER the parked question — the only one of the three that is answerable, and the only case where `completeness.parked` is true |
| `completeness_declined` | re-file a complete copy: a named person already said this is not every employee |

**The answer is bound to the READING, not to the document.** `clara.payroll_completeness_answers`
carries a UNIQUE `extraction_id`, so if somebody affirms twelve lines and the page is then re-read
with fifteen, the old `yes` does not authorise the new sum — there is simply no answer for the new
reading and the question is parked again. `rows_read` freezes the line count the person was shown.
Append-only (a changed mind is a new reading, with its own question), `clara_fn_owner`-owned, RLS
enabled AND forced, `SELECT` to `clara_authenticated` and NOTHING to `clara_agent_ro` or
`clara_runtime`: this table records a human's professional judgement about a client's payroll, and it
reaches the agent lane through the entry it produced, not through the table (#949's own SPEC-08
posture).

**The queue splits, it does not double.** A parked question and a posting block are the same document
in the same state, so #946's `payroll_rows` gains ONE predicate — stand down when
`completeness.parked` — and the new `payroll_witness_rows` arm takes exactly the rows it stood down
from. Both arms read the same flag, computed once by the gate, so neither can claim a row the other
also claims and neither can miss one. Seventeenth row kind
(`payroll_completeness_question`, section `needs_you`, lane `needs_you`, no new `counts.*` key and no
new json key); the splice's own postcheck re-reads the COMMITTED catalog and asserts every one of the
sixteen pre-existing kinds at its exact count, the new one exactly once, the shared column vector at
exactly one more occurrence, and seventeen kinds in total.

**The one human write this payroll family has.** `clara.answer_payroll_completeness(uuid, text, text,
text)`, bookkeeper floor, op-keyed, audited, emitting `document.payroll_completeness_answered`
(client-scoped, routed `ignore` — the door does everything the answer implies inside its own
transaction). #945 and #946 both added no human door deliberately, because everything else in this
lane is machine-decided; a completeness assertion is not. It refuses
`no_parked_completeness_question` unless the gate says the question is actually parked, which is both
the honesty rule (no judgement is recorded about a page that did not ask for one) and what makes a
second answer to one question impossible; the UNIQUE on `extraction_id` is the belt behind that. A
`yes` posts in the SAME call, through `clara._post_payroll_run` — the same body the unattended lane
uses — so the entry, its legs, its receipt and its event are identical to a printed-total post except
for the basis they name. If that post is refused for another reason (a closed period, an account
since removed, a duplicate), the ANSWER still stands and the refusal comes back in the door's result.

**The entry says where its figures came from.** `flags->'payroll_run'->'posting_basis'` is written at
the draft insert (the only moment `clara._tf_entry_immutable` allows `flags` to be written) and names
the kind (`printed_totals` / `row_sum`), the witness, the lines read, the printed headcount and page
count, the summed questions and, for an answered question, the answer row. Each leg's `basis` carries
a `#row_sum` suffix where the figure was summed. The receipt's rationale says the same in words: 0297's
sentence ("two readings agreed, arithmetic held, accounts resolved") stays verbatim as its first half
because it is still true, but it is true AND MISLEADING on its own about a row-sum post, and an
auditor reading the LEDGER must be able to tell a figure the document states from one this estate
computed.

**Gate.** New: `packages/db/tests/payroll-completeness-witness-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_PAYROLL_COMPLETENESS_WITNESS`), appended at the tail of
`packages/db/package.json`'s `$GATES` list. New battery:
`packages/db/tests/payroll-completeness-witness.test.mjs` (11 cells).

**rig-meta.** One cohort, `PAYROLL_COMPLETENESS_0343_HUMAN_FNS` — one granted name
(`answer_payroll_completeness`, `clara_authenticated`). The two new internals
(`evaluate_payroll_run_state_v2`, `_payroll_completeness_answer`) stay ungranted to every application
role, which the sweep's `expected = false` asserts and §Z re-derives.

**Web pins corpus.** `apps/web/tests/firm-scope-db-pins.corpus.ts` gains one reviewed barrier entry
for 0343 (work order rule (d)): the file carries two `pg_get_functiondef` splices, over a CLOSED
literal roster of exactly two named functions.

**Two neighbour batteries move with this file, each with the reason at the line.**
`payroll-summary-posting.test.mjs`'s S1 now expects `completeness_unwitnessed` where it expected
`run_totals_not_printed` — that IS the ticket — and a new S1b keeps `run_totals_not_printed` honest
for a page with no rows to sum at all. `payroll-summary-facts.test.mjs`'s S5 now pins
`state_version: v2`.

**Out of scope, by the ticket's own words.** No employee-level calculation and no statutory rate is
read, computed or stored anywhere in this file: the persist door's strip is untouched, the witness is
a RUN-level count of lines, and no `document_regions` row is minted for a witness (a count is not a
monetary fact a person clicks on the page, and `clara._assert_field_path` would have to learn two
paths for no reader). The prompt stanza that starts asking the two witness questions is a SUCCESSOR
CONTRACT in the ticket report, because `payrollFacts_v1` is frozen.

### 0343 — the fix round (riders sweep wave, lane 04 review)

Seven findings from the lane's own review, all inside this unmerged file and all re-applied through
the #957 redo path. They are recorded here rather than in a successor because 0343 has not merged:
an applied migration is immutable, an unmerged one is not.

**A completeness witness never vetoes a page that prints its own totals (ADV-01, blocker).** The
first cut folded a witness the two channels read differently into the gate's `channels_agree` rung.
Driven on the rig, that refused a fully printed #946 page — all eleven run totals, both channels
agreeing, the arithmetic holding — because one channel quoted a "Total employees" label the other
read as `not_printed`. The witness is a FALLBACK FOR SILENCE, so its failure now belongs only to the
rung that is reached when the page IS silent, where it becomes the parked question. The evaluator
also names a value-against-a-`not_printed` `one_channel_printed` rather than `channels_disagree`:
one reading and one silence is not two readings of one number.

**A human-initiated post meets the maker-checker ladder (ADV-02, blocker).** `clara._post_payroll_run`
now knows who authorised a post — nobody for the unattended arm, exactly one named person when the
witness is `answered_question`. That person is written to `last_human_editor`, and a HIGH-STAKES
entry they authorised is left a DRAFT for `clara.approve_entry`, which is 0298:494's own posture and
`clara.reverse_entry`'s before it. The unattended arm is untouched. The gate's duplicate sentence now
distinguishes a draft awaiting a checker from a run already posted.

**The entry names the evaluator it was judged by (ADV-04).** The plan carries `state_version` beside
`plan_version`, and the entry's flag is written from it. The two were the same string by accident
while only one state version existed.

**The published capability claim catches up (ADV-05).** SectionL republishes the six payroll_summary
pdf/image rows at `registry_version` 8 with a basis that names the completeness witness, the parked
question and the row-sum entry's own six-leg shape. #1061's 0342 is not edited; a correction to an
applied migration is published by its successor.

**The parked question says what a yes does not book (ADV-06).** The plan reports `unbookable` — the
questions no figure exists for from either source, computed independently of whether the sum was
admitted — and the sentence names them. The affordance component is deliberately untouched: the
sentence is the database's own.

**A second answer is a refusal, not a 23505 (ADV-07).** The door takes
`pg_advisory_xact_lock(203431048, hashtext(document))` before it reads the verdict (0006:952's house
idiom), so the loser of a race waits, re-reads and is refused `no_parked_completeness_question` by
name. The UNIQUE on `extraction_id` stays as the belt and its violation is converted rather than left
to escape.

**Two sentences (ADV-11, ADV-12).** A printed page count of zero gets its own reason instead of
borrowing the truncation one; the declined sentence names the re-read that clears a mis-clicked `no`,
not only the re-file that clears an incomplete document.

**Battery.** 19 cells (W1–W16 plus W4b/W4c/W4d). **Registry version.** 8 —
`packages/db/tests/document-capability-registry.test.mjs`'s `PUBLISHED_REGISTRY_VERSION` re-bases
there with the reason beside the number.

**Rig repair, disclosed.** Redoing this file with a changed evaluator body needs its own
`clara.evaluator_versions` row gone first: SectionB.1 refuses a re-registration at a different
closure hash, which is exactly right for a merged file and is an artifact of an earlier apply for an
unmerged one. The lane database's version-2 row and its member were deleted by hand (append-only
triggers bypassed as superuser) before each redo that moved the evaluator. The COMMITTED file is
unchanged in shape and registers the final body on a first apply.

**What is LIVE today, and what is not (spec finding L04-SPEC-03).** The PARKED QUESTION half is
live end to end: a summary that prints no run totals reaches a named person under Needs you, their
yes becomes the posting basis and the run posts in that same call. The TWO PAGE-PRINTED WITNESSES
— a headcount equal to the lines read, and a page count of one — cannot fire in production, because
the only channel that could supply them is `packages/runtime/workflows/payrollFacts.v1.prompts.mjs`,
whose `PAYROLL_RUN_FIELDS` is a FROZEN eleven-element array carrying neither key. They are exercised
by this file's own battery and by nothing else until a `payrollFacts_v2` asks the two optional
questions (the prompt stanza and its wire shape are a successor contract in
`reports/waveS-lane04-ticket1048.md` §9.1). **No release note and no ticket close may say that Clara
posts from a printed headcount today.** The database half is deliberately built first: a frozen
workflow's successor is cheap to ship against a door that already exists, and expensive the other
way round.
## 0344 — a person corrects a misread payroll fact through the document Revise control (#1056, riders sweep wave, lane 05)

`0344_payroll_fact_revision.sql` gives `clara.revise_document_fact` a **second lane** rather than
a second door. #945 (0296) taught the estate to read a payroll summary and #946 (0297) to post one
unattended; neither gave a person a way to correct a figure the reader took wrong. The one human
fact door was invoice-shaped end to end — its field wall is `clara._revisable_invoice_field`, its
observation counts `invoice_facts` extractions, and the extraction it appends is an `invoice_facts`
row — so `payroll.run.gross_pay` passed the canonical grammar and was then refused
`field_path_not_revisable`.

**What a payroll correction does, and where it lands.** The correction appends a new
`payroll_text_facts` extraction under `clara-fact-human:v1`, carrying the other ten questions
forward as regions and the corrected one as the person typed it, at `engine_confidence = 1`. The
envelope carries the corrected `payroll_state` — which is the key `clara._payroll_posting_verdict`
reads (0297:597) — plus `payroll.channel = 'human'` and the same human provenance keys the invoice
lane writes. Nothing lands in the invoice chain, because an `invoice_facts` row here would be
invisible to the gate: that is the "silent desynchronization" the ticket forbids, arriving by the
quietest possible road.

**The accounting answer to the ticket's own question** — "whether a correction re-runs the posting
verdict or is blocked once posted" — is BOTH, because they are two different runs.

* **An unposted run.** The correction moves the reading. The gate is `stable` and derived from the
  newest payroll pair banked for the document, so asking it again answers about the corrected
  figures — the Needs-you row `payroll_posting_blocked` included, which is why that row clears
  itself when the block does. **Nothing posts.** The unattended post is reachable from
  `clara.persist_payroll_facts` alone (0297 §G's splice) and this lane "deliberately has no 'post
  it anyway' door, because nothing in this lane is posted on a guess"
  (`apps/web/components/firm/needs-you-affordances.tsx:128-130`). A correction corrects the
  READING; it is not an instruction to post.
* **An already-posted run.** Refused, by name: `CLR10` / `payroll_run_already_posted`, carrying the
  entry's id, status, posting date and memo, and saying in words to reverse that entry first. A
  posted entry is corrected by reversing it and booking the corrected one, never by editing the
  evidence underneath it while it stands — and the posted entry pins the very extraction it was
  drafted from (`flags->'payroll_run'->>'extraction_id'`, 0297:960), so admitting the revision
  would leave approved books citing a superseded reading with nothing anywhere saying so. It is the
  same family as the live-bank-statement pin this door has carried since 0217:602, and the estate
  already supports the act that clears it: `clara.reverse_entry` makes
  `clara._document_posting_entry` answer NULL, the correction is then admitted, and the month
  re-opens exactly as 0297:697 already says a reversal does.

The pin is **payroll-only**. The invoice lane has never carried a posted-entry wall and #1056 rules
on the payroll lane; widening the invoice lane here would be a behaviour change nobody asked for to
a door two other batteries pin.

**What a human declaration makes of the fact state.**
`clara._payroll_state_with_human_fact(jsonb, text, text, bigint)` replaces the VERDICT on the one
question and nothing else: `state` becomes `established`, `printed_cents` the declared figure (NULL
for `payroll.run.period`, the one non-monetary question), `printed_raw` the declared rendering,
`basis` the new vocabulary member `human_declared`, and `reason` null. `state_version` is **carried
through unchanged**, because a corrected run that made the whole gate unreadable would be worse than
the defect; the provenance is disclosed instead in a top-level, sorted `human_declared` array that a
machine-produced state never carries.

**Recut at integration (riders sweep wave, lane L4's 0343 against this file).** As written on the
lane this door admitted `state_version: v1` and nothing else, and the reason it gave was that
`clara._payroll_entry_plan` refuses any other value (0297:415). #1048 changed exactly that body: it
mints `clara.evaluate_payroll_run_state_v2`, which stamps `v2` on every state banked from 0343 on,
and it recuts the drafting body to take **both versions by name**. Left at `v1` this door would have
refused every reading banked after 0343, so #1056's whole feature would have been dark on the
integrated chain while both lanes stayed green. The test now follows its own stated reason rather
than its literal, in 0343's own spelling (`not in ('v1','v2')`). A v2 state survives the body whole:
the return is a shallow merge over five keys, so `state_version` and #1048's own `completeness`
object are both carried through untouched, and a person declaring a run figure can never erase the
completeness witness a colleague gave.

**And §G's paste was re-derived from the cut phase's post-image, not from 0268's.** This lane was cut
from main before the cut phase merged, so its copy of `clara.revise_document_fact` was 0268 §B's
body, and `0321_work_source_correction_rederivation.sql` (#1030, on main and released) had since
made exactly one substitution in it: the no-op guard passes `p_field_path`, so it asks the TYPED
notion and a re-cased `MYR` or a respelled date stops retiring every Work parked on the document.
Pasting the two-argument call back would have removed that rule with nothing to notice it — both
overloads are live, and this file's own tail checked the line by its two-argument substring. The
substitution is carried over verbatim, the tail's needle moved with it, and §A's pin on that body is
now bimodal, admitting 0268's shape or 0321's post-image with each named. The three payroll
neighbours lane L4's 0343 recuts (`persist_payroll_facts`, `clara._payroll_entry_plan`,
`clara._payroll_posting_verdict`) are bimodal for the same reason.

It **carries unchanged** `computed_cents`, both channel quotes, and the whole `rows` object. That
last carry is load-bearing: rungs 3 and 4 of the gate read `rows.contested`, `rows.unbalanced` and
`rows.unchecked` directly (0297:607-634), so a run whose quoted employee rows disagree or fail
their own gross-minus-deductions identity **stays blocked** however many run-level figures a person
declares. A person cannot clear a row problem from the run line, and this body does not let them
appear to. `clara.evaluate_payroll_run_state_v1` is neither called nor touched: it is a registered,
frozen closure (0296 §D.1) and it takes the two full channel envelopes, whose per-employee quotes
were stripped and discarded at read time by construction (0296 step 7).

**Two bounds on a declared payroll figure**, and together they keep every figure the door admits
inside the window the frozen evaluator could itself have read, so a declared figure and a
machine-read one are always comparable: `payroll_value_negative` (no run-level payroll question is
ever negative on a payslip, and a negative one would flip the side of the leg
`clara._payroll_entry_plan` draws from it) and `payroll_value_out_of_range` (0296's own
normalisation admits at most thirteen integer digits and two decimals — 999,999,999,999,999 cents —
while the shared `clara._normalize_invoice_cents` carries no such bound). One shape still reads
differently in the two rules and is admitted here: a rendering padded with leading zeros past
thirteen digits, which this door reads to the cents its digits state and 0296's regex would have
called unreadable. It is recorded rather than closed, because closing it would mean a fourth copy
of a normalisation rule the estate already keeps two of, deliberately (0296's own header says why).

**Versioning.** On the payroll lane the appended extraction's `version_n` counts across the KIND,
not across `clara-fact-human:v1`. `clara._payroll_posting_verdict` picks the reading it judges by
`version_n desc, extracted_at desc` (0297:599): a human row reusing the machine's own number would
have to win a tie-break on the clock instead of winning outright. The four-column unique on
`clara.document_extractions` is (document, engine, version_n, kind), so a higher number under a
different engine collides with nothing. `clara._payroll_source_observation` repeats the gate's
ordering verbatim for the same reason — the door must never revise one reading while the gate
judges another — and its `facts_version` is a COUNT of done `payroll_text_facts` rows, not a
`version_n`, for 0217:433's reason restated in this lane's terms.

**The lineage read.** `clara.list_source_revisions` gains `payroll_facts_version` and
`current_payroll_facts_extraction_id` BESIDE the three invoice keys, which keep their exact meanings
and values. The surface takes the version a revision must quote from this read, and a payroll row
quoted against the invoice chain's `facts_version` would refuse `CLR19` against 0 every time. The
lineage array itself is untouched: a payroll correction is a `fact` revision in
`clara.document_fact_revisions` like any other, which is what makes it auditable the same way an
invoice fact revision is.

**What this file does NOT do.** It does not re-post and it mints no Needs-you row kind — clearing a
block does not post the run, and a run whose block a person has cleared is not surfaced as
"waiting". That gap is not new: `payroll-summary-posting.test.mjs`'s own S2 cell already records
that "a run blocked by a missing account reads READY the moment the chart gains it" with nothing
posting it, and a re-post path is a separate decision about who may ask for an unattended post a
second time. It is filed as a follow-up rather than built here.

**No new granted name.** The five helpers (`_revisable_payroll_run_field`, `_revisable_fact_lane`,
`_payroll_source_observation`, `_payroll_state_with_human_fact`, `_document_live_posted_entry`) are
reached from a definer body alone and the tail proves it role by role; the two recut doors keep
their signatures, owners, volatility, DEFINER-ness, `search_path` and ACLs, which the tail also
re-reads from the committed catalog.

**Redo-safe by construction (#957).** Every statement is `create or replace function`. The prestate
detects its own redo by ONE signal — either recut body already carrying the `#1056` marker — and
refuses a body at neither its pinned pre-image nor this file's post-image. Both branches were
exercised on the lane database: the FIRST-APPLY branch through `pnpm db:migrate` against the pinned
pre-images, and the REDO branch through `CLARA_MIGRATION_REDO=0344_payroll_fact_revision` across
five successive fix rounds. The file recuts three bodies statically and contains no dynamic SQL at
all, so no entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` is owed.

### 0344, corrections from the fix round (2026-09-25)

An applied migration is immutable and `CLARA_MIGRATION_REDO` only ever takes the highest applied
version, which 0345 and 0346 now sit above. Every correction below therefore lands here, in this
file's own section, and never in `0344_payroll_fact_revision.sql`. Each was measured on `clara_l03`
on the date given.

**The Needs-you row does NOT clear itself when the block clears — it changes its sentence, and the
sentence then names an act that discards the correction.** The claim above ("the Needs-you row
`payroll_posting_blocked` included, which is why that row clears itself when the block does",
repeating 0297:1129) is true of the road 0297 built and false of the one 0344 opens. Measured in the
live body of `clara.list_review_queue`: the payroll arm's WHERE asks only that a done
`payroll_text_facts` row exists and that the filing carries no live draft or approved entry — it
never asks the verdict. On 0297's own road the two move together, because a block that clears
inside `clara.persist_payroll_facts` posts the entry in the same transaction and the entry is what
retires the row. On 0344's road nothing posts, so the row stands and merely swaps in the verdict's
`ready` sentence: *"Payroll run <month> is ready to post but no entry exists yet — re-file the
payslip to post it."* (0297:776-778). Re-filing creates a NEW document whose extraction chain does
not carry the correction, so the person is told to do the one thing that throws their correction
away. **What is true:** a correction re-derives the verdict, the reason text changes, and the row
stands until an entry exists. The re-post gap named under "What this file does NOT do" is therefore
not merely a missing convenience: it is the reason this sentence has no honest remedy to offer, and
it is carried as a follow-up with the sentence named beside it.

**The recut door's serialisation comment is wider than the estate.** It says the revision is
"serialised against every other writer of this document's reading" on the `clara.documents` row.
Measured: `clara.revise_document_fact` and `clara.persist_invoice_facts` both take that row `for
update`; **`clara.persist_payroll_facts` takes no lock at all**, and neither does
`clara._post_payroll_run`. What is true is narrower and worth stating in full, because it is a
reachability argument and not a lock: a payroll document is read exactly once
(`clara._enqueue_invoice_facts_core` short-circuits `already_completed` on a done
`payroll_text_facts` row), nothing posts outside that single transaction, and so there is no second
payroll writer to race today. The moment anyone adds a payroll re-read or a "post it now" door,
that argument lapses and the payroll writer needs the same `for update` this door takes.

**The already-posted refusal probes more than its own words claim.**
`clara._document_live_posted_entry(p_document)` is `clara._document_posting_entry(client, document)`
per live filing (0182:578-590), which answers with a live `entry_evidence_links` row OR any
approved, un-reversed `journal_entries` row bound to the document — with no payroll qualification.
The raise nonetheless says "this payroll run is already posted as entry %". A payroll summary cited
as evidence on an ordinary manual journal therefore refuses every payroll fact revision on that
document and names an entry that is not the payroll acquisition. The probe itself is the invoice
lane's own, and keeping one probe for both lanes is the right shape; it is the sentence that
overstates what was found.

**Two declared supersets, recorded so they are not read as criteria.** (a) The document facts table
offers the Revise control for every run-level payroll path whenever a payroll facts version exists,
not only for paths that are not `established` — the table's row shape carries no fact state, and a
figure both channels misread is `established` and still wrong. (b) `document-detail.tsx` now takes
the payroll facts version for the existing facts-version note on a payroll-only document, which no
acceptance criterion asked for; without it that note reads "source version 0" under a table of
payroll figures.

## 0345 — a depreciation-policy knowledge key, so the fixed-asset proposal's `client_knowledge` ground can fire (#1090, riders sweep wave, lane 05)

`0345_depreciation_policy_knowledge_key.sql` adds ONE row to `clara.knowledge_keys`:
`depreciation_policy`. #933 ("the depreciation-particulars proposal rides `source_ref`, and needs
no migration", above) built and tested `deriveFaParticularsProposal`'s `client_knowledge` ground in
full — ranked above the account's own retired policy and its completed siblings — but left it
"wired and unfed": the catalogue held fourteen keys and none was about depreciation, so no person
could ever record the note the ground reads. This file is the whole of what was owed: the catalogue
entry.
Nothing else needed a migration — `clara._knowledge_assert_value`'s `shape_only` label already
admits an arbitrary object, `clara.capture_knowledge` already exists, and
`clara.knowledge_records`'s own `applies_when` (a generic jsonb object of scalar equality
conditions since 0192) already carries the account scoping the note needs, with no new column.

**The catalog choice this file measured, not assumed, and got wrong on its first draft.** A
depreciation policy reads like "a decision about how the books are prepared" — 0192's own
definition of `kind = 'policy'` — but `clara._tf_knowledge_firm_eligibility` (0220, unmodified)
admits `kind in ('preference','policy')` at firm scope UNCONDITIONALLY, with no regard for
`clara.knowledge_key_firm_eligibility` at all. A `policy`-kind draft of this row, measured live on
the lane database, let a firm-scope capture of `depreciation_policy` succeed with no eligibility
row naming it — a feature this ticket's brief never asked for (it names a CLIENT's recorded note
only) and, worse, a DARK one: the successor's read is client-pinned and would never surface a
firm-scope row, so a captured firm default would sit accepted and permanently unread. The fix is
the `customer_identity_policy` precedent instead: `kind = 'assertion'` with `authority_bearing =
true`, which still forces "asserted trust only" (`user_statement` / `interview` /
`registry_lookup`, never `document_extraction` or `model_inference`) at the door's own explicit
check and at `_tf_knowledge_authority`'s trigger belt — TWO of the three belts 0192's own header
names for an authority-bearing key of any kind other than `policy` — while leaving the
firm-eligibility wall live, so an unseeded `depreciation_policy` is refused
`knowledge_scope_not_firm_defaultable` exactly as a plain client-identity fact is.
`packages/db/tests/knowledge-firm-defaults.test.mjs`'s `p654.eligibility.admits_by_kind` cell —
which drives EVERY non-admitted catalog key through the real firm-scope door — moves from ten
refused keys to eleven in this same commit, for the same reason its own comment already gives for
0240's `financial_year_end_day`.

**Because `clara.knowledge_keys` is append-only for every role, including `clara_fn_owner`** (no
escape hatch — `_tf_append_only` raises unconditionally), the wrong first draft could not be healed
by a redo of this file's SQL: a redo detects an incompatible previously-landed row and refuses,
rather than repairing it. The lane database was returned to a clean prestate by disabling the two
append-only triggers (`knowledge_keys` and, for the test rows that already referenced the wrong
row, `knowledge_records`) as an out-of-band rig operation on this disposable database, deleting the
wrongly-shaped rows, re-enabling both triggers, and then running `CLARA_MIGRATION_REDO=
0345_depreciation_policy_knowledge_key` to apply the corrected file. A from-scratch chain only ever
sees this file's one, correct, first apply.

**The read and the mapping this ticket's brief also asks for** ("the code path that loads inputs
for the proposal derivation should read a client's recorded depreciation note … and map its value
onto `FaProposalKnowledgeNote`") are NOT a migration and are not wired into any workflow step:
`loadFaProposalInputsStepV6` does not exist (`claraWork.v6.impl.ts` is absent; `registry.ts` still
resolves `claraWork_v5`), and that step lives inside a frozen-workflow closure this lane must never
create. `mapDepreciationKnowledgeRows` (`packages/runtime/lib/fa-proposal-grounds.ts`) is the
pure mapping, built and tested; the SQL a step would run under the SAME OBO `clara_agent_ro`
credential v4's own register read mints is stated in this ticket's report as a successor-contract
addition, and `packages/db/tests/depreciation-policy-knowledge.test.mjs` drives capture -> that
exact read -> the mapper -> `deriveFaParticularsProposal` end to end on a live database, proving a
recorded note outranks a disagreeing account-siblings ground for the same asset.

**No plan-item-map row.** `depreciation_policy` is recorded directly through `clara.capture_
knowledge`, never promoted from a committed onboarding answer — the same posture
`banking_arrangement`, `customer_identity_policy` and `trade_nature` already carry (measured live:
none of the three holds a `clara.knowledge_plan_item_map` row either).

### 0345, corrections from the fix round (2026-09-25)

**The read now carries the note's effective window, and it is code rather than prose.** The
successor-contract read stated above asked `state = 'live'` and nothing more. A knowledge record's
`state` does not move when its effective window simply closes — nothing supersedes it — so a note
captured for 2024 alone was still `live` in 2026 and grounded a 2026 proposal under the deriver's
present-tense sentence (driven on `clara_l03` inside a rolled-back transaction, 2026-09-25). The
statement now lives in ONE place, `FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL`
(`packages/runtime/lib/fa-proposal-grounds.ts`), takes the calendar day as `$2` (null = today
in MYT) and carries the SAME window terms `clara.retrieve_knowledge` computes `in_effect` from
(0230:361-362). It DROPS where that door MARKS, on purpose: that door hands a model a marked
record so the model can say "this expired", while this ground feeds a deterministic deriver with no
vocabulary for an expired note. Cells `dk.08` and `dk.09` drive the window both ways and measure
why the step does not call `clara.retrieve_knowledge` itself — `clara_agent_ro` holds EXECUTE
neither on it nor on `clara.record_work_knowledge_read`, so the step reads the relation directly
and leaves NO work-knowledge-read receipt for `clara.work_knowledge_drift` to find.

**The statements and mappers moved out of the deriver's own file, which is deploy-locked on
`main`.** `frozen-workflows.json` at `061a6992b` carries
`packages/runtime/lib/fa-particulars-proposal.ts` with `deployed: true` and the sha this lane was
cut at; the lane's own manifest has no such entry, because the cut phase minted it after the
branch. #1090 and #1092 had appended their statement and mapper to that very file, which at
integration is a changed deploy-locked body -- the one thing the freeze exists to stop. They now
live in `packages/runtime/lib/fa-proposal-grounds.ts`, a new module that imports the deriver's
types and nothing else, and the deriver's file is byte-identical to `main` again
(sha256 `49d583fc…07cd51c3`, re-measured).

**"`registry.ts` still resolves `claraWork_v5`" was true of this lane's base and is false of what
this merges into.** `main` at `061a6992b` (the cut phase, PR #1140) carries
`packages/runtime/workflows/claraWork.v6.impl.ts`, its `loadFaProposalInputsStepV6` and the
registry entry `claraWork: claraWork_v6`. The step is in `frozen-workflows.json` there and is
allocated to lane L8 by `SWEEP-PLAN.md`'s shared-files table, so this lane still writes no workflow
code — but the successor contract is now addressed to a step that EXISTS, and it names the three
comments in that file this lane makes false. It is stated in
`docs/plan/active/riders-2026-09-20/reports/waveS-lane05-fix.md`.

**The `knowledge_keys` census pins an equality on an append-only catalogue** (§0 raises unless
fourteen other rows exist, §Z unless fifteen exist in total). No other lane of this wave touches
that relation, so the hazard is not live; if a later round ever recuts this file, the weaker `>= 14`
plus the exactly-one-`depreciation_policy` assertion the tail already carries buys the same
protection without breaking on any migration numbered below 0345.

**An owner line is owed when #1090 closes.** `kind = 'assertion'` + `authority_bearing = true`
makes `clara._knowledge_floor('depreciation_policy','client')` answer `admin`, while the BINDING
door this note merely advises on — `clara.set_fa_depreciation_policy` (#932) — floors at
`bookkeeper`. The lower-stakes advisory act therefore costs more authority than the higher-stakes
binding one. The choice was forced (a `policy`-kind key would have been unconditionally
firm-eligible), but if bookkeepers are the people who record a client's depreciation note, this
ground will rarely be fed.

## 0346 — the runtime read credential reaches a retired default depreciation policy (#1092, riders sweep wave, lane 05)

`0346_fa_retired_policy_agent_read.sql` adds ONE row-level-security policy (`p_fadp_agent`) and ONE
table-level `grant select` on `clara.fa_account_depreciation_policies` for `clara_agent_ro`, and
nothing else: no function, no column, no index, no door, and no widening of any other role.

**The gap.** #933 built `deriveFaParticularsProposal`'s `retired_account_policy` ground — ranked
below `client_knowledge` (fed by 0345) and above `account_siblings` — but the rows it reads live in
`clara.fa_account_depreciation_policies` (#932, 0277 §A), whose only read policy was `p_fadp_human`
for `clara_authenticated`. Measured live before this file: `clara_agent_ro`, `clara_runtime` and
every wake role held zero privilege on the relation, so the ground could never fire and the
proposal fell through to the siblings every time.

**Why `clara_agent_ro` and not `clara_runtime`.** A workflow step reads under the run's own OBO READ
credential: `readScoped` checks out of the read pool, whose group role is `clara_agent_ro`
(`packages/runtime/lib/pools.mjs:101`). That is the same credential
`loadPendingFixedAssetStepV4` already reads `clara.fixed_assets` with, under `p_fixed_assets_agent`.
`clara_runtime` is the unscoped service identity and carries no firm; it is deliberately left with
nothing here.

**Why the predicate is plain tenancy and not "retired rows only", which was this file's first
draft.** The ticket's title says "retired depreciation policies", and `... and not active` would
have been the tighter wall. It was rejected for a measured reason. `clara.set_fa_depreciation_policy`
is version-forward, so an account can hold a RETIRED version 1 underneath a LIVE version 2; a
register row that was already pending when version 2 landed still opens a question, and proposing
from the retired version 1 while a live version 2 says something else would put a SUPERSEDED human
judgement on a form under Clara's own sentence. The read therefore carries a
`not exists (… where q.active)` guard (`FA_RETIRED_ACCOUNT_POLICY_SQL`,
`packages/runtime/lib/fa-proposal-grounds.ts`). Under a retired-only RLS wall that sub-select
would see nothing and ALWAYS pass — the guard would be vacuous under the very credential that runs
it, which is worse than a slightly wider read. `packages/db/tests/fa-retired-policy-agent-read.test.mjs`
(`fp.read`) drives both arms and carries the vacuity control that shows the guard, not luck, is what
suppresses the superseded row.

**What that widening costs, measured.** `clara_agent_ro` already holds table-level SELECT on
`clara.fixed_assets` under `p_fixed_assets_agent`, and that register carries the same five drivers
per ASSET (`depreciation_method`, `useful_life_months`, `depreciation_rate_bps`, `residual_cents`,
`cost_cents`). A per-account DEFAULT of those drivers is the account-level statement of what this
credential can already read row by row, not a new class of data. The shape is the estate's own: all
52 policies `clara_agent_ro` holds today are plain tenancy predicates, and the only column-level
grant anywhere in this estate is an UPDATE pair on `clara.wake_intents` — so a column-level SELECT
grant would have been a novel mechanism with no precedent and a silent-by-default failure mode for
every column added later.

**What stays shut, and is asserted rather than assumed** (§Z): SELECT and only SELECT for
`clara_agent_ro` (INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER each named and refused);
`clara_runtime`, the three wake roles, `clara_freeform_ro` and PUBLIC each named and holding
nothing; `p_fadp_human` unmoved; and both write doors
(`clara.set_fa_depreciation_policy`, `clara.retire_fa_depreciation_policy`) still
`clara_authenticated`-only. The firm wall itself cannot be proven from inside the migration
(`clara.wake_firm()` needs a minted credential), so `fp.wall` drives it under a real credential with
a second firm's credential as the control.

**Prestate pins** (measured live on `clara_l03`, chain 0001..0345, after this lane's #1056 and
#1090): `clara.wake_firm()` `76311c51…cbfabc`, `clara.set_fa_depreciation_policy(…)`
`11f0aa0a…20b67d`, `clara.retire_fa_depreciation_policy(…)` `f75d3f25…ac8c05e`,
`clara._tf_fa_acquisition_birth()` `a584e946…5395b69c`, `clara._fa_on_approve(uuid)`
`412fd7a0…5faf643b`. The last two are pinned because this file's "a LIVE policy is never a proposal
ground" reasoning IS those two 0292-recut bodies. No function is recut; the tail re-measures all
five.

### 0346, corrections from the fix round (2026-09-25)

**"All 52 policies `clara_agent_ro` holds today are plain tenancy predicates" is not what the
catalogue says.** Re-measured live on `clara_l03` after this file applied: 53 policies name
`clara_agent_ro`, and they group as 37 × `(firm_id = clara.wake_firm())` (this file's `p_fadp_agent`
is one of them, so 36 of the 52 before it), 7 × `((firm_id is null) or (firm_id =
clara.wake_firm()))` — firm-nullable defaults — 6 × `true`, 1 × `(id = clara.wake_firm())`
(`clara.firms`), 1 × `clara.shares_my_firm_wake(id)` (`clara.users`) and 1 EXISTS join through
`clara.onboarding_plans`. The six unconditional ones are catalogue reads: `clara.event_types`,
`clara.knowledge_keys`, `clara.knowledge_plan_item_map`, `clara.taxonomy_active`,
`clara.taxonomy_versions`, `clara.trigger_taxonomy`. The count was right and the characterisation
was not, and that sentence is the whole argument for a table-level grant rather than a narrower
wall — so the corrected form is: **36 of the 52 carry the same plain tenancy predicate this file
uses, and the rest are catalogue reads, firm-nullable defaults and three one-off firm identities.**
The conclusion is unchanged; the argument now matches the estate.

**What the firm knowingly accepts.** `clara_agent_ro` can now SELECT EVERY depreciation-policy row
of every client of the firm, LIVE rows included, not only retired ones, and at table level, so the
free-text columns (`reason`, `created_by`, `retired_by`, `retired_reason`) are reachable even
though `FA_RETIRED_ACCOUNT_POLICY_SQL` selects five driver columns and no commentary. The narrower
alternative was rejected for a measured reason (a retired-only wall makes the read's own
supersession guard vacuous under the very credential that runs it), and no column-level SELECT
grant exists anywhere in this estate to copy. This is a knowing acceptance and belongs in the
integration record as one, not as an implementation detail: it is a runtime credential reaching a
client's tax-depreciation judgements. `FA_RETIRED_ACCOUNT_POLICY_SQL` stays the statement's one
home so no later reader starts selecting the commentary columns by accident.
## 0347 — the TIN item reaches the firms that had already committed their setup (#1098, riders sweep wave, lane 07)

**The population 0311 left behind, closed as far as a data migration can close it.** Before 0311,
`clara._firm_setup_applicability(plan,'tin')` read `'inapplicable'` for a firm whose turnover band
was `<RM1M`, and 0257's seed guard skipped the row, so such a firm committed its checklist with no
`tin` plan item at all. 0311 fixed the rule for every plan seeded from then on but backfilled
nothing, and `clara.seed_firm_setup_plan` refuses a plan that is not open (`CLR10
firm_setup_not_open`, 0218 §E.1) — so on an already-committed plan the row could never arrive
through any door. That is the gap [#1098](https://github.com/BELCORT-SDN-BHD/clara/issues/1098)
names, and the section above ("The population 0311 does NOT reach") is the record of it being
found.

**The backfill is a named verb, not an inline statement.**
`clara._firm_setup_backfill_committed_tin()` plants one `pending`, unanswered, catalogue-shaped
`tin` item on every COMMITTED firm-scope plan that has none and returns how many rows that was;
0347 mints it and then calls it once. A one-shot statement inside an applied migration can only
ever be observed against the rows that server held at apply time — zero on a from-scratch chain —
which would make #1098's own third acceptance criterion ("a test drives an already-committed plan,
seeded and committed BEFORE the backfill, and asserts it gains a TIN item after the backfill runs")
vacuous everywhere but one lane database on one afternoon. A verb can be driven on any database
against a world the cell planted itself. It is `insert … where not exists`, so it is idempotent and
redo-safe by construction (the 0301 §G precedent), and it is EXECUTE-granted to NOBODY: it writes
into every firm's plan at once, so it belongs to a migration or to an operator holding
`clara_fn_owner`, never to `clara_authenticated`, `clara_runtime` or `clara_agent_ro`. The tail
re-reads that posture rather than trusting the absence of a `grant` line. No GRANTED name is
minted, so — like 0311 itself and `rig-meta.mjs`'s own #979 precedent — **no `rig-meta.mjs` cohort
is owed**.

**What it refuses to touch.** COMMITTED plans only: an OPEN plan is not a dead end (its admin
reconciles it through `clara.seed_firm_setup_plan`, which has seeded `tin` since 0311 and bumps the
plan revision while doing it, #895), and a CANCELLED plan is abandoned. No existing plan item is
touched at all — `not exists`, never `on conflict do update` — and no plan row moves: no
`revision_token`, no `revision_n`, no `updated_at`, and no new `clara.onboarding_plan_revisions`
row. A committed plan's attestation is a receipt, and planting a question the firm was never asked
is not a new revision of the document it signed. The tail proves each of those by digesting every
`clara.onboarding_plan_items` and `clara.onboarding_plans` row in the prestate, carrying both
digests in the temp table `_p1098_pre` (the 0295/0289/0291/0261 idiom), and re-reading them after
the run; rows this transaction created are separated from the rest by `created_at >= now()`, since
`now()` is the transaction timestamp and every earlier row is strictly before it. Both digests are
ordered by the surrogate `id`, a uuid, which orders by its own type rather than by the server's
`lc_collate` ("Collation and pinned order" above).

**THE RESIDUAL, STATED RATHER THAN HIDDEN: the row exists, and the firm still cannot answer it.**
`clara.answer_firm_setup_item` refuses every item on a plan that is not open (0218 §E.2, `CLR10
firm_setup_not_open`), and the web checklist guards every write control behind `!committed`. So
after 0347 a committed plan's TIN row reads `pending`, correctly marked `required` above the
MyInvois threshold and `optional` below it, and a value still cannot be recorded into it. That wall
is not specific to `tin`: a committed firm-setup plan has always been closed to every item, and the
catalogue carries no reopen door. Opening one — **may a committed checklist still be COMPLETED for
a question it was never asked, while never being AMENDED for a fact it attested to?** — changes
what a commit means, which is a product decision for the owner and not a data migration's to take.
`tests/firm-setup-committed-tin-backfill.test.mjs`'s cell
`p1098.residual.a_committed_plan_still_refuses_the_answer` DRIVES that refusal rather than
asserting it, so the residual is a measured fact and not a sentence. Against the standing beta
ruling ("nothing is dark") the gap is narrower after 0347 than before it — the question is on the
checklist, marked correctly, for every firm — but it is not closed, and it wants the owner's ruling
on that one question.

**Redo-safe by construction (#957).** `create or replace function` and a backfill that is
`insert … where not exists`; the prestate decides FIRST vs REDO from the ONE marker only this file
writes (the verb's own name in the catalog) and the tail's arithmetic holds on both branches,
because on a redo the prestate's committed-without-tin count and the run's row count are both zero.
Both branches were exercised on the lane database: the FIRST APPLY through `pnpm db:migrate`,
against a rig where five firm-setup plans had deliberately been driven into the pre-0311 shape
first (committed above the threshold, committed below it, committed with `tin` already answered,
open, and cancelled), and the REDO through
`CLARA_MIGRATION_REDO=0347_firm_setup_committed_tin_backfill`.

**Gate:** `tests/firm-setup-committed-tin-backfill.test.mjs`, frontier-gated on the stable stem
`firm_setup_committed_tin_backfill$` with
`tests/firm-setup-committed-tin-backfill-preintegration-gate.mjs`.

## 0348 — the two pre-session rate-wall evidence tables gain a retention sweep (#1046, riders sweep wave, lane 07)

**The question, in plain words.** `clara.invite_preview_attempts` (0309) and
`clara.confirmation_attempts` (0163) each hold one row per call to their own signed-out rate wall.
Both tables are append-only — the wall's own evidence must never be edited or deleted by an
ordinary caller — and neither has ever been swept. Each wall only ever reads the trailing
15-minute window it counts, so every row older than that is dead weight the wall will never read
again, and nothing has ever removed it. The brief's own question ("check how
`confirmation_attempts` is retained today, and if it is not swept either, sweep both in one
ticket") is answered here: it is not, and this file sweeps both.

**Why a background job could never do this.** `clara._tf_append_only()` raises `CLR08` for EVERY
role that tries to `DELETE`, including the table's own owner (measured, in a rolled-back
transaction, before this file was written: `set role clara_fn_owner; delete from
clara.invite_preview_attempts where attempted_at < now()` raises `invite_preview_attempts is
append-only`). `0309`'s own header (lines 170-177) states the consequence: "a retention lane must
disable and re-enable that trigger inside its OWN migration … it cannot be written as a background
job against the shipped surface." A retention sweep is not a one-time backfill, though — it has to
run again every time the reconciler's belt turns, against whatever has aged past the margin by
then, which is a population no migration can see at apply time. So this file mints two NAMED,
IDEMPOTENT, REDO-SAFE verbs — `clara.prune_invite_preview_attempts(timestamptz,int)` and
`clara.prune_confirmation_attempts(timestamptz,int)`, one per table, each `SECURITY DEFINER` owned
by `clara_fn_owner` — that a caller can invoke repeatedly, each call disabling its table's
append-only trigger, deleting its own bounded batch (oldest first, `LIMIT p_limit`), and
restoring the trigger, **all inside one statement**. That is the sense in which "this migration"
disables and re-enables the trigger: it mints the verb that does so, on every call, for as long as
the estate exists. `clara_runtime` — the only role either verb is granted to — holds no `ALTER
TABLE` on either relation and needs none: the DEFINER's privilege is what the disable/enable runs
under, verified live (a `security definer` function owned by `clara_fn_owner`, called under `set
role clara_runtime`, disabled the trigger, deleted zero rows and re-enabled it, with no privilege
error).

**What the sweep costs the wall, and why both verbs carry `lock_timeout`** (fix round,
ADV-L07-02). `alter table … disable trigger` takes `ShareRowExclusive` on the WHOLE table, which
conflicts with the `RowExclusive` every wall write holds — so while the sweep runs, the table is
shut to every key, not only to the rows being deleted. That much was disclosed from the start. What
was not is the real bound: it is **not** "as long as the batched delete takes", it is the slowest
OTHER transaction holding `RowExclusive`, and a QUEUED request amplifies it. Measured on the lane
rig with three connections: A held an ordinary open INSERT into `clara.confirmation_attempts`; B
called the prune verb and queued for `ShareRowExclusive`; C then attempted a completely unrelated
wall write — different digest, different origin, no row conflict with A — and was refused `55P03`
after 3003 ms, blocked by **B's queued request**, not by A. Without a `lock_timeout` of its own, C
would have waited as long as A lived.

Both verbs therefore carry `set lock_timeout = '3s'` as a function SET clause (not a caller
setting: the bound has to hold for every caller, including an operator holding `clara_fn_owner`).
An uncontended call measures 5 ms, so three seconds is slack rather than a budget, and a sweep that
cannot get the lock gives up. `packages/runtime/lib/reconciler.mjs` catches the resulting `55P03`
exactly the way it already catches a missing function: that cycle's limb is a no-op, the belt turns
again next cycle, and nothing is logged. The tables are swept a little later instead of the
pre-session auth wall being shut a lot longer.

**Neither verb ever changes the trigger's posture** (fix round, ADV-L07-06). The first cut ended
with a bare `enable trigger`, which is `ENABLE ORIGIN` whatever it found. Measured inside a
rolled-back transaction: `tgenabled` `'O'` → `enable always` → `'A'` → one call to the verb → back
to `'O'`. Impact today is nil (the estate ships `'O'` and nothing sets `session_replication_role`),
but an operator who hardened these tables to `ENABLE ALWAYS` would have had it silently undone by
the next belt turn, with no error and no receipt. Each verb now reads `tgenabled` first and puts
back exactly what it found — including `'D'`, because a guard an operator deliberately turned off
is not this verb's to turn back on — and returns that posture as `trigger_posture` on its own
result. If the trigger is absent altogether the verb refuses (`CLR10`) rather than deleting from a
table whose append-only guard has moved.

**The safe margin is a refusal, not a convention.** Both walls hardcode the same 15-minute window
(`attempted_at > now() - interval '15 minutes'`, in `clara.preview_invite_by_token` and
`clara.claim_confirmation_attempt`). Each new verb REFUSES (`CLR10`) a `p_before` inside that
window — not because of a race (both a count query and a prune call take their own `now()` once
per statement, and a threshold at or before the boundary can never outrun a count using the SAME
boundary), but because a future caller mistake (a wrong retention constant, an off-by-one in a
unit conversion) would otherwise corrupt an ACTIVE rate wall silently: the wall would simply admit
calls it should have refused, with no error anywhere. `tests/rate-wall-attempts-retention.test.mjs`
drives this floor directly for both verbs
(`p1046.invite_preview.floor_refuses_in_window_threshold`,
`p1046.confirmation.floor_refuses_in_window_threshold`), rather than reading it off the body text.

**One verb per table, not one shared verb** — the two tables' column shapes differ
(`token_hash`/`origin_digest` vs `email_digest`/`origin_digest`/`outcome`/`settled_at`), and a
shared verb would need a table name passed as text: either dynamic SQL (a new barrier for
`apps/web/tests/firm-scope-db-pins.corpus.ts` to review, for no real benefit) or a hardcoded
`if/else` no simpler than two functions. `clara.prune_trace_spans` (0006) and
`clara.prune_work_execution_traces` (0195) already established the "one prune verb per relation,
both riding the same runtime belt" shape this file follows — including a NEW index this file adds
for the same reason `ix_trace_spans_started` exists: neither evidence table had an index LED by
`attempted_at` (both existing indexes are composite and led by the key column), so a plain
`attempted_at < p_before` scan could not use either as a leading-column match. This file adds
`ix_invite_preview_attempts_attempted_at` and `ix_confirmation_attempts_attempted_at`.

**The existing cadence, and why this file adds no scheduler.**
`packages/runtime/lib/reconciler.mjs`'s `pruneTraces()` already runs on the belt
`runReconcilerSweep()` drives from `packages/runtime/lib/leader.mjs`, gated by
`iteration % PRUNE_EVERY === 0` (leader-guarded: exactly one process sweeps at a time) — the same
lane `prunedWorkTraces` (0195) rides beside `pruned` (trace spans) today. The accompanying runtime
commit adds two more counters to that SAME function, `prunedInvitePreviewAttempts` and
`prunedConfirmationAttempts`, calling the two verbs above the same batched-loop way
`prune_trace_spans` and `prune_work_execution_traces` are already called, each guarded against
`undefined_function` (42883) so the belt stays inert on any database that has not yet applied
0348. No new `setInterval`, no new cron entry, no new belt. The retention margin is a runtime
constant, in MINUTES rather than days (`CLARA_RATE_WALL_ATTEMPT_RETENTION_MINUTES`, default 60 —
four times the 15-minute window, a safe margin over the exact boundary), with its own batch-size
and max-batches overrides mirroring the trace-prune constants exactly.
`packages/runtime/tests/reconcile.test.mjs`'s
`"reconcile: rate-wall attempt prune rides the trace-prune lane, deletes past the margin, keeps
the window"` drives `pruneTraces()` itself and reads both new counters back.

**What this file does not change**, pinned in the prestate and re-hashed in the tail: neither
`clara.preview_invite_by_token` nor `clara.claim_confirmation_attempt` is recut (both are
"neighbour" pins this file relies on but never touches); neither table's columns, RLS policy or
EXISTING triggers move (the append-only and no-truncate triggers on both tables are pinned by
name and by `tgenabled` before and after); `clara._tf_append_only` / `clara._tf_no_truncate` are
pinned by `sha256(prosrc)` — this file calls them (indirectly, via the triggers it disables and
re-enables) but recuts neither. The wall's own window (15 minutes) and ceiling (5) are
out of scope, per the ticket's own brief.

**Redo-safe by construction (#957).** `create index if not exists` and `create or replace
function`; the prestate decides FIRST vs REDO from the presence of the two verb names alone. The
FIRST apply ran on the lane database with both tables at zero rows (measured and recorded in the
prestate's own notice); the tail's own apply-time smoke call (a threshold two hours in the past,
which can never trip the 15-minute floor) exercised the disable/delete/enable sequence for real,
over whatever population the server held, rather than only type-checking it.

**The vacuity control caught a real bug in the tail itself, not only in the verbs.** T.5 (the tail
step that DRIVES the floor rather than reading it off the body text) originally raised its own
"admitted a threshold inside the window" failure WITH `errcode='CLR10'` from *inside* the very
`begin … exception when others …` block whose `sqlstate <> 'CLR10'` guard was supposed to catch a
*wrong* refusal — so a floor that stopped firing entirely (the deliberate break: `and false`
appended to the guard) raised no exception at all, execution reached that same raise, and the
handler's own guard read FALSE and silently swallowed it: the tail reported "OK (REDO)" over a
verb that had just admitted an in-window call and started deleting rows. Caught by exercising
`CLARA_MIGRATION_REDO` over the deliberately broken file rather than trusting the tail's prose.
Fixed with a boolean flag set only inside the handler and read only after the block ends (a raise
inside the handler cannot short-circuit a read that happens after it), then the SAME break was
re-applied over the FIXED tail and the redo genuinely failed this time
(`migrate: FAIL — … #1046 tail T.5: prune_invite_preview_attempts admitted a threshold inside the
window`, transaction rolled back, the database left exactly where the prior successful redo left
it) — proof the fix closes the hole rather than moving it. The break was then reverted byte for
byte and the file re-applied clean. **Every checksum below was measured, not assumed:** FIRST
apply `1ef5a5d699b70ca83f0bea7db2e5f5f51ffd9f545be051123f25e42b339e36be`; the fixed-tail REDO (the
current, live file) `5c4ada4f5ae8fb7ab47edfb9e194d72abae0b991c6008cda9d2762e1d7772b4b`, re-measured
against `clara.schema_migrations` after the whole exercise, and `pnpm db:migrate` afterwards
reports `0 new migration(s) applied · 311 total` with no drift.

**Acceptance criteria, each with its own cell in `tests/rate-wall-attempts-retention.test.mjs`.**
Rows inside the window are never removed and rows past the margin are —
`p1046.invite_preview.prune_removes_past_margin_keeps_window_row`,
`p1046.confirmation.prune_removes_past_margin_keeps_window_row`. The wall's own count is
unchanged by a sweep that runs mid-window — five real calls through the real door reach the
ceiling, a sweep with a safe margin runs between the fifth and the sixth, and the sixth is STILL
correctly walled, which is only true if none of the five rows backing the count was removed:
`p1046.wall.invite_preview_count_unaffected_by_mid_window_sweep`,
`p1046.wall.confirmation_count_unaffected_by_mid_window_sweep`. The ACL — `clara_runtime` alone —
is driven as `clara_authenticated` and refused with the ordinary Postgres insufficient-privilege
SQLSTATE (`42501`), never `CLR10`:
`p1046.invite_preview.only_clara_runtime_may_execute`,
`p1046.confirmation.only_clara_runtime_may_execute`.

**Gate:** `tests/rate-wall-attempts-retention.test.mjs`, frontier-gated on the stable stem
`rate_wall_attempts_retention$` with
`tests/rate-wall-attempts-retention-preintegration-gate.mjs`.

## 0349 — a successful admission writes no sweep-run-item row, disclosed rather than fixed (#1132, riders sweep wave, lane 07)

**The trap, in plain words.** `clara.sweep_run_items.outcome`'s CHECK constraint has no `admitted`
member, and `clara.admit_autodraft_task`'s own successful path writes no `clara.sweep_run_items`
row at all — only `clara.op_receipts`, through `clara._finish_op`
(`packages/db/migrations/0036_wave_c0_deferred_belts.sql:1468-1470`). Every OTHER return arm the
same function carries DOES write a run-bound `sweep_run_items` row when `p_run_id` is not null —
ten inserts in all (0036:1182, 1190, 1232, 1240, 1251, 1337, 1367, 1400, 1411, and the
`unique_violation` handler's own noop at 1476). A reader who assumes every admission outcome is
visible on `sweep_run_items` therefore reads NOTHING for a genuinely successful one, and if they
instead read whatever a LATER settlement wrote for that filing, they read what the task's own
posting attempt decided, which can silently disagree with what admission itself decided (a task
`admitted` now can settle `failed` later for an unrelated reason during its own posting attempt).

**What those ten inserts actually write** — re-measured on the live `prosrc` with line comments
stripped, because the first cut of this section and of the catalog comment got it wrong in two
directions at once (fix round, ADV-L07-04):

| the row's `outcome` | how many inserts | which returned outcomes reach it |
|---|---|---|
| `noop_existing` | 4 | `noop_existing`, and **`already_done`** |
| `refused_attempts` | 2 | `refused_attempts` |
| `skipped_lane` | 3 | **`skipped_direction`** (twice: sales mis-route, sales backlog held) and **`lane_changed`** |
| `refused_concurrency` | 1 | `refused_concurrency` |

`refused_budget` is **not** one of them. It occurs three times in the body and every occurrence is
inside a comment recording that the 15-drafts/day cap which once wrote it was retired; the token
survives in the column's own CHECK, which this file deliberately does not touch, and nowhere else.

And the second half of the table is the sharp edge of the trap this file exists to disclose: the
sweep row's label is **coarser than the decision**. Three distinct returned outcomes —
`already_done`, `skipped_direction`, `lane_changed` — are recorded under two labels, so a reader of
`sweep_run_items` alone cannot tell a filing that was already done from one that was a no-op, nor a
sales mis-route from a lane change. The refusal token in the same row carries the finer reason
(`sales_direction`, `sales_backlog_held`, `lane_changed`), but the `outcome` column does not.

**Two candidate fixes, and why this file takes the documentation one.** #1132's own Agent Brief
names two paths: document the trap and name the correct read, or widen
`clara.sweep_run_items.outcome` with a new `admitted` member. The lane's owner ruling takes the
documentation path only — this file adds a catalog `comment on function` to
`clara.admit_autodraft_task(uuid,text,uuid,text,bigint)` and this README section; it never recuts
the function body and never touches `sweep_run_items_outcome_check`, both pinned in the prestate
and re-measured byte-for-byte in the tail.

**Where to actually read a successful admission's outcome.** `clara.op_receipts` where
`fn='admit_autodraft_task'` and `op_key='autodraft:'||filing_id||':'||origin` — the `result`
column carries `{outcome, task_id, reserved_tokens}`, and `outcome` is one of **three** tokens,
not two: the success return is a CASE over `re_admitted_after_withdrawal`, `re_admitted` and
`admitted` (0036:1468-1470). A reader who follows this disclosure and then only recognises two of
them is back in a trap of the same shape, which is why the third is named here and in the catalog
comment. This is the same read `tests/x34-autodraft-retry-door.test.mjs`'s own `receiptFor()`
fixture already uses.

**Grounded, not only read off the body text** (wave-3 addendum: "a door's behaviour is asserted
only after it was driven"). `tests/admit-autodraft-task-outcome-disclosure.test.mjs`'s
`p1132.trap` cell drives a real admission on this lane's own database: a genuine `admitted`
outcome leaves ZERO `sweep_run_items` rows for that filing on that run and DOES leave a real
`op_receipts` row; an immediate re-admission of the SAME filing on a SECOND run answers
`noop_existing` and DOES write one `sweep_run_items` row — the contrast that proves the
"zero rows" assertion discriminates a real difference rather than being vacuously true of an
always-empty query. The same cell re-confirms `sweep_run_items_outcome_check` still carries no
`admitted` member. The catalog comment and this section are driven by
`tests/admit-autodraft-task-outcome-disclosure.test.mjs`'s two other cells,
`p1132.comment.discloses_no_sweep_item_and_names_op_receipts` and
`p1132.readme.section_discloses_no_sweep_item_and_names_op_receipts`, which read
`obj_description()` and this file's own bytes respectively.

**What this file does not change**, pinned in the prestate and re-measured in the tail:
`clara.admit_autodraft_task`'s body (`prosrc`) is byte-identical before and after — a catalog
comment only, never a `create or replace function`; `sweep_run_items_outcome_check` is
byte-identical before and after — no `admitted` member is added. This file mints no new function,
table or other catalog name, so it owes no `packages/db/tests/rig-meta.mjs` cohort entry.

**Redo-safe by construction (#957).** `comment on function ... is '...'` always sets the comment
fresh, so the prestate's only two sane states are "no comment yet" (FIRST) or "already carries
exactly this file's own comment, verbatim" (REDO) — any OTHER non-null comment is a foreign
comment this file refuses to clobber, CLR10.

**Acceptance criteria, each with its own cell in
`tests/admit-autodraft-task-outcome-disclosure.test.mjs`.** AC1 (the chosen path) — the catalog
comment names both `sweep_run_items` and `op_receipts` and states plainly that a successful
admission writes no sweep-run-item row:
`p1132.comment.discloses_no_sweep_item_and_names_op_receipts`; the same fact restated in this
README section: `p1132.readme.section_discloses_no_sweep_item_and_names_op_receipts`. AC2 (the
NOT-chosen path, confirmed still not taken) is folded into the grounding cell itself:
`p1132.trap.admitted_writes_no_sweep_item_noop_does_and_the_enum_still_lacks_admitted`.

**Gate:** `tests/admit-autodraft-task-outcome-disclosure.test.mjs`, frontier-gated on the stable
stem `admit_autodraft_task_outcome_disclosure$` with
`tests/admit-autodraft-task-outcome-disclosure-preintegration-gate.mjs`.

## 0350 — `via_wake_kind` is NOT renamed; the posting-lane widening is disclosed instead (#1058, riders sweep wave, lane 07)

**The naming drift, in plain words.** `clara.entry_post_receipts.via_wake_kind` was minted by F-A2
(`packages/db/migrations/0106_f_a2_posting_core.sql:494-517`) admitting only two values,
`autodraft` and `interactive` — both genuine wake-credential kinds. `0121_f_a3_pr1b_agent_limb.sql`
later widened the same CHECK to admit a third, `bank_agent`, alongside `wake_credentials`' own two
CHECKs gaining the identical disjunct in the same file — still a wake-credential kind, not a
naming drift. The drift is in the two widenings after that:
`0297_payroll_summary_posting.sql:870-873` (#946) added `payroll_facts` and
`0299_agreement_contract_acquisition.sql:2626-2629` (#948) added `contract_facts` — and NEITHER
names a wake credential at all. Each names the POSTING LANE that authorised the receipt: a payroll
run and an agreement acquisition each wake no model and hold no wake credential, yet the column
that records "which wake authorised this post" now also carries their lane names. A reader who
trusts the column's own name reads it as an exhaustive list of wake kinds and misses that two of
its five live values are something else entirely.

**Two candidate fixes, and why this file takes the disclosure one.** #1058's own Agent Brief asks
for a rename: the column (and every reader/writer across the codebase) renamed to a name that does
not imply "wake kind only". The owner's ruling on the ticket (2026-09-24, "Ruling applied under
the owner's delegation of 2026-09-23 (riders sweep wave, SWEEP-PLAN.md)") refuses the rename and
this lane's own scan agrees (SWEEP-PLAN.md, the #1058 row of "Owner questions, with a recommended
ruling"): `via_wake_kind` appears across roughly 118 source files and in nine frozen workflow files
under `packages/runtime/workflows/` (`autoDraft.v9.usage.ts`, `bankAgent.v1.usage.ts`,
`chatTurn.v13.post.ts`, `chatTurn.v13.usage.ts`, `chatTurn.v14.usage.ts`,
`chatTurn.v15.freeform.ts`, `chatTurn.v15.infra.ts`, `chatTurn.v15.usage.ts`,
`closePrep.v1.usage.ts`). THREE of those nine carry PROSE about this exact column
(`chatTurn.v13.post.ts:22-23`, `chatTurn.v15.freeform.ts:203`, `chatTurn.v15.infra.ts:106`) that a
rename would strand as a description of a column that no longer exists under that name — a frozen
workflow body is never edited (`node scripts/check-frozen-workflows.mjs` must show no manifest
diff). TWO more (`bankAgent.v1.usage.ts:120`, `closePrep.v1.usage.ts:91`) build SQL naming a
DIFFERENT door's own parameter, `p_via_wake_kind` on `clara.record_agent_usage_event`
(`0110_f_a9_llm_usage_reshape.sql:365-370`), which must keep its own spelling for the same reason.
This file adds a catalog `comment on column` to `clara.entry_post_receipts.via_wake_kind` and this
README section; it never renames the column, its CHECK constraint or any reader or writer, both
pinned in the prestate and re-measured byte-for-byte in the tail.

**Where the live vocabulary actually comes from.** `entry_post_receipts_via_wake_kind_check`
admits `autodraft`, `interactive`, `bank_agent`, `payroll_facts`, `contract_facts` — the first
three are genuine wake-credential kinds, the last two (`payroll_facts`, `contract_facts`) are
posting-lane names, not wake credentials at all. The catalog comment this file adds names both.

**What this file does not change**, pinned in the prestate and re-measured in the tail:
`clara.entry_post_receipts.via_wake_kind` keeps its name, its type (`text`) and its ordinal
position; `entry_post_receipts_via_wake_kind_check` is byte-identical before and after — no new
admitted value, none removed; the table's Annex E.1 column count stays 14. This file mints no new
function, table or other catalog name, so it owes no `packages/db/tests/rig-meta.mjs` cohort
entry.

**Redo-safe by construction (#957).** `comment on column ... is '...'` always sets the comment
fresh, so the prestate's only two sane states are "no comment yet" (FIRST) or "already carries
exactly this file's own comment, verbatim" (REDO) — any OTHER non-null comment is a foreign
comment this file refuses to clobber, CLR10.

**Acceptance criteria, each with its own cell in
`tests/entry-post-receipts-via-wake-kind-disclosure.test.mjs`.** The chosen path (comment +
README, naming the widening and refusing the rename):
`p1058.comment.discloses_the_lane_widening_and_the_no_rename_ruling` and
`p1058.readme.section_discloses_the_lane_widening_and_the_no_rename_ruling`. The ticket's own
AC3 ("existing data and its meaning are unchanged; this is [documentation], not a schema or
behaviour change"), driven against the live catalog rather than read off this file's own prose:
`p1058.catalog.column_not_renamed_and_check_enumeration_unchanged`.

**Gate:** `tests/entry-post-receipts-via-wake-kind-disclosure.test.mjs`, frontier-gated on the
stable stem `via_wake_kind_lane_disclosure$` with
`tests/entry-post-receipts-via-wake-kind-disclosure-preintegration-gate.mjs`.

## Two sweep-wave pins with no migration of their own (#1096, #1099, riders sweep wave, lane 07)

Both tickets below add a TEST over behaviour that already shipped, so neither owns a `## NNNN`
section of its own. The sweep wave's shared-file rule is that a lane writes its own new section
and never edits an existing one — seven lanes edit this file at once and the merger relies on
it — so the two notes live here, beside each other, rather than appended inside the sections of
the applied migrations they pin (0316 and 0318). Each names the section it belongs to.

### #1099 — the op-key idempotence law's own coverage for `clara.create_client` (belongs with "0316 — clara.create_client's human grant withdrawn")

**Restored by #1099 — the op-key idempotence law's own test coverage for `create_client`, dropped
by 0316’s grant withdrawal and repointed rather than left gone.**
[`wb-g-opkeys.test.mjs`](tests/wave-b/wb-g-opkeys.test.mjs)'s G4/[R2-F8] census (the shared
op-key-idempotence battery every other 0017-family writer sits in) derives its writer inventory
from a live `EXECUTE` grant, by construction — a fn 0316 ungrants can never appear in
that inventory again, and when #1038 landed, `create_client`'s row in the census's per-writer
fixture table was simply deleted rather than repointed, so nothing any longer drove its
`_reserve_op` call at all. #1099 restores it, off the census: a new
`UNGRANTED_RESERVING_FNS` registry in `wb-g-opkeys.test.mjs` names `create_client` alongside the
migration that ungranted it and where its coverage now lives, a META cell re-measures that its
live `prosrc` still calls `_reserve_op` (the same "a writer must never silently drop the
discipline" law the grant-derived census enforces for every writer it CAN still see), and a
dedicated `G4/[R2-F8] supplement` cell drives the law itself through
`createClientRaw` — `rig-fixtures.mjs`'s root+jwt idiom, the one path this migration left
reachable (0316 left exactly one) — proving both halves: an identical-payload replay returns the cached receipt
byte-for-byte with no second `clara.clients` row, and a mutated-payload replay with the same
`op_key` refuses `CLR10`. The pattern generalises: any future writer that loses its grant while
keeping `_reserve_op` belongs in `UNGRANTED_RESERVING_FNS` with its own dedicated cell, not
nowhere.

The fix round added the half a registry cannot supply. A hand-maintained list detects only the
names somebody remembered to write down, while AC2 asks for the opposite: the NEXT writer to lose
its grant while keeping `_reserve_op` must not drop out silently either. The G4 cell now takes
the REVERSE census from the two sets it already computes — every WB-family fn whose live
`prosrc` calls `_reserve_op`, minus the grant-derived writer inventory, minus
`RESERVE_LAW_EXEMPT` — and requires that difference to be a subset of `UNGRANTED_RESERVING_FNS`,
naming anything else by name. Measured at 313 migrations the difference is exactly
`{create_client}`: a live, non-empty census rather than an empty-set tautology, and the cell
asserts that floor too.

### #1096 — the 29-February year-end pair is ACCEPTED, pinned (belongs with "0318 — the year-end pair rule…")

**Pinned by kp.15 (#1096, riders sweep wave, lane 07).** The 29-February disclosure landed with 0318 — its header at 57-64, its function comment and the “## 0318” section above;
no cell anywhere drove month 2 day 29 and asserted the accepted outcome until #1096. `kp.15` in
`knowledge-onboarding-promotion.test.mjs` commits a plan with `fye => 2, fye_day => 29` beside an
unrelated key and asserts ALL THREE keys promote — nothing withheld, day 29 live in Knowledge at
the value captured — the mirror image of `kp.14`'s day-31 refusal. Vacuity control run on the lane
database: the calendar check's `v_day > 29` bumped to `v_day >= 29` (deliberately refusing day 29
too), `kp.15` seen RED for the right reason (`financial_year_end_day` withheld with CLR37) while
every other cell in the file stayed green, then the body restored byte-for-byte from this file's
own §A text and the restore verified by `sha256(prosrc)` equality with the pre-break measurement.
No migration: the ticket adds a pinning test over already-disclosed, already-shipped behaviour.
## 0352 — one body, two entrances, twice: the model lane reaches the payroll and agreement reads (#1136, riders sweep wave, lane L8)

Three successor contracts written by riders wave 4 named doors the chat lane could not reach, and
the cut phase deferred all three rather than ship tools that can only refuse
(`docs/plan/active/riders-2026-09-20/CUT-PLAN.md` §1.4, class C):
`read_payroll_posting_state` (#946) and `read_agreement_terms` (#948) read
`clara.list_review_queue`, and `read_payroll_settlement_state` (#947) reads
`clara.get_payroll_settlement_candidates`. Both reads resolve their caller through
`clara._human_ctx`, which reads the JWT; the chat lane runs on pooled credentials that carry no
`request.jwt.claims` at all (`packages/runtime/lib/pools.mjs`), so granting either door to
`clara_agent_ro` would have bought a door answering CLR04 on every call.

This file applies #1000's [0320] shape to both reads at once. Each read's computation moves into
ONE ungranted core that takes the caller's FIRM as an argument
(`clara._payroll_settlement_candidates_core(p_firm, p_client)`,
`clara._list_review_queue_core(p_firm, p_scope, p_cursor, p_limit)`); each human door keeps its
signature, its envelope, its refusal codes and its ACL and becomes that core's own thin audited
wrapper; and two new audited wrappers — `clara.wake_get_payroll_settlement_candidates` and
`clara.wake_list_review_queue`, EXECUTE to `clara_agent_ro` alone with one
`clara.wake_fn_allowlist` row each for the `interactive` kind — are the model lane's doors.

**Two doors serve three tools, and that is the point.** `read_payroll_posting_state` and
`read_agreement_terms` both read the review queue, the first for its `payroll_posting_blocked` row
and the second for its `agreement_posting_blocked` row. Each row carries its GATE'S OWN SENTENCE:
0299's own header says it in words — "`clara._post_agreement_acquisition` acts on it and
`clara.list_review_queue` DERIVES its `agreement_posting_blocked` row from it, so the decision the
lane took and the sentence a person reads are the same body and cannot drift". A third, chat-only
projection of either verdict would have been a second place for those words to drift, and the words
are the whole of what #946 and #948 ask a tool to report. `clara._agreement_posting_verdict(uuid)`
stays granted to NOBODY, exactly as 0299 left it, and the tail re-reads that after applying.

**Neither core is hand-retyped, and neither is built at run time.** Each core's body is the live
body with a closed roster of anchored substitutions applied, WRITTEN OUT in §A and §D as ordinary
SQL, so a reader and the migration lexer both see exactly what is installed. The pin sits on both
sides of the apply: §0 applies the surgery to the LIVE pre-image and refuses unless the result
hashes to the body embedded below it, and §TAIL re-reads the COMMITTED core, pins the same value,
and REVERSES the surgery to assert it hashes back to the pre-image — so "the rows did not change"
is a checked fact about the live catalog. The settlement read takes two substitutions (the
`declare c record;` + bookkeeper-floor opener, and `cl.firm_id = c.firm`); the queue takes three
(the `declare` opener, the viewer-floor line, and every `c.firm`, at a MEASURED count of 23 on this
frontier rather than a remembered one, because eleven migrations have spliced that body and a
twelfth arm would bring its own firm predicate). The anchors, the forward derivation and the
reversal live in ten `clara.__t1136_*` helper functions created at the top of the file's own
transaction and dropped in §Z, so §0 and §TAIL cannot drift apart and nothing outside the migration
can ever call them.

**What it buys the machine side, in full:** two EXECUTEs and two allowlist rows. Not one relation
grant, not one policy, no act. `clara.settle_payroll_net_pay` is untouched and still
`clara_authenticated`-only — #947's own report refused to propose an accept-via-chat tool, because
a person accepts a candidate on the bank surface or in Needs you where every candidate is visible
side by side. `0011:4210-4213`'s assertion that `clara_agent_ro` must NOT hold
`clara.list_review_queue` is still literally true and the tail proves it role by role.

**The floors.** Human: VIEWER for the queue, BOOKKEEPER for the settlement read, both through
`clara._human_ctx`, the estate's one floor body, raising the same three CLR04s the inline calls
raised. Model: BOOKKEEPER+, and not by this file's choice — `clara.mint_wake_credential` refuses a
below-bookkeeper `on_behalf_of` (CLR10 `authority_lost`) and `clara.wake_context` re-validates the
standing on every use, so a demotion mid-conversation makes an outstanding credential inert.

**Redo (#957).** Redo-safe by construction: every object is a `create or replace`, the two
allowlist rows are `on conflict do nothing`, and each split RECOVERS its pre-image before it
splices — from the human door on a fresh apply, and by REVERSING the committed core on a redo — so
the pin is asserted on both paths rather than only on the one `CLARA_MIGRATION_REDO` takes. §0 also
refuses a HALF-applied file (one core present, one absent) by name rather than completing it.

## 0353 — the model lane reaches the tenancy lane: six read twins and two on-behalf-of confirmations (#1137, riders sweep wave, lane L8)

#949's successor contract (`reports/wave4-lane01-ticket949.md`) named four chat tools —
`read_tenancy_terms`, `read_rent_settlement_candidates`, `confirm_tenancy_rent_plan` and
`confirm_tenancy_rent_plan_revision` — whose doors are all `clara_authenticated` only. The cut phase
deferred all four (`docs/plan/active/riders-2026-09-20/CUT-PLAN.md` §1.4, class C, entries C4-C7)
and asked for an owner ruling on the two CONFIRMATIONS, because they are acts a person takes. The
owner-delegated ruling of 2026-09-25 on #1137 answers it: **yes, Clara may confirm a tenancy rent
plan on a bookkeeper's behalf from the conversation, as an OBO twin in #915's shape — the person
still confirms and the act is recorded as theirs.**

This file is that ruling's database half, and it applies two established shapes at once.

**The six READS take #1000's [0320] / #1136's [0352] shape.** Each read's computation moves into ONE
ungranted core that takes the caller's FIRM as an argument
(`clara._get_contract_terms_core`, `clara._get_tenancy_rent_plan_draft_core`,
`clara._propose_contract_terms_core`, `clara._get_tenancy_escalation_revision_core`,
`clara._get_rent_settlement_candidates_core`, `clara._get_tenancy_deposit_coding_core`); each human
door keeps its signature, its envelope, its refusal codes, its floor and its ACL and becomes that
core's own thin audited wrapper; and six new audited wrappers — `clara.wake_*`, EXECUTE to
`clara_agent_ro` alone with one `clara.wake_fn_allowlist` row each for the `interactive` kind — are
the model lane's doors.

**The two CONFIRMATIONS take #915's [0307] shape.** Each confirmation's body moves into ONE
ungranted core that takes the firm, the ACTOR and the LANE as arguments
(`clara._confirm_tenancy_rent_plan_core`, `clara._confirm_tenancy_rent_plan_revision_core`); the
human door keeps its JWT read and passes `lane => 'human'`; and
`clara.confirm_tenancy_rent_plan_for` / `clara.confirm_tenancy_rent_plan_revision_for` — EXECUTE to
`clara_runtime` alone — name the initiating human in an ARGUMENT and re-check that person's
membership LIVE (no membership answers exactly as an unknown client does; a deactivated member gets
`authority_lost`; below bookkeeper gets `insufficient_role`). Every rule that is not about WHO is
calling lives in the core, so "the twin's refusal vocabulary matches the human door's for every
shared rule" is a fact rather than a promise.

**Why `clara.revise_accounting_plan` is in this file at all.** The escalation's confirmation ENDS in
a plan revision, and that door resolves its caller through `clara._plan_door_ctx` → `clara._human_ctx`
→ `clara.jwt_sub()`. The alternative to splitting it was a machine-side copy of 8.7 kB of
concurrency-critical logic — two advisory rungs, a row lock, a re-read under it, the alignment wall,
the catch-up wall — and a second copy of that is a second place for a posting race to be forgotten.
So `clara._revise_accounting_plan_core(p_firm, p_actor, …)` is 0193's own body with the actor ladder
lifted out, and `clara.revise_accounting_plan` is a thin delegate over it whose op-key wall still
runs FIRST and whose floor and firm wall are still `clara._plan_door_ctx`'s.

**The one duplication this file knowingly adds, and the follow-up that removes it.**
`clara._tenancy_plan_core` is the plan-creation step the OBO confirmation takes, because
`clara.create_accounting_plan` needs a JWT. It is `clara._obo_plan_core`'s (0308) body with the kind
fixed to `recurring_journal`, and it BELONGS in `clara._obo_plan_core` as a two-line widening of
that body's closed kind set. It is separate only because lane L1 of the riders sweep wave recuts
`clara._obo_plan_core` in the same wave (#1051, then #1080), and the sweep's grouping rule is that
no database body is written in one lane and written or pinned in another — a second recut of one
body in one wave collides at integration, and a prestate pinned to a sha another lane is about to
change refuses the migration for a change that is not a defect. **Follow-up: once #1051 and #1080
have landed, widen `clara._obo_plan_core`'s kind set to admit `recurring_journal` with
`via = 'confirm_tenancy_rent_plan_for'`, and reduce `clara._tenancy_plan_core` to a caller of it.**
For the same reason this file's prestate deliberately does NOT pin
`clara.create_accounting_plan`, `clara._obo_plan_core`, `clara._accrual_plan_core` or
`clara._authority_ref_refusal`.

**What that duplication already cost, and the guard that now stands over it.** The first cut of this
file left `clara.create_accounting_plan`'s CLIENT-STATUS wall out of `clara._tenancy_plan_core`, on
a premise that was not true — the confirmation core above resolves the client's FIRM and the
caller's identity, but it never reads `clara.clients.status`. Driven on the rig, the OBO entrance
confirmed a rent plan for an `archived` or `onboarding` client that the Contract page refuses with
CLR10 `client is not active -- no new accounting plan` (`client_inactive`); `onboarding` is the live
case, because that is the state a tenancy is filed in during setup. Nothing posted either way —
`clara._plan_admit_occurrence` and `clara.wake_due_plan_occurrences` both re-read the status — but
the rows written would have held the `rent_plan_already_confirmed` and `payable_account_in_use`
walls against the person's own confirmation once the client was activated. §F now carries the wall,
verbatim and at that door's own position in the ladder: NOT at the `_for` entrance, where 0307 puts
its own copy, because 0307's core is SHARED by both entrances and has nowhere else to put it while
this body is the OBO lane's private stand-in for `clara.create_accounting_plan`. An entrance-level
copy would sit above `clara._reserve_op` and above every draft wall — answering `client_inactive`
where the human door answers `terms_incomplete`, and refusing the REPLAY of a confirmation the
person already made. Both orders are driven in `tests/tenancy-agent-twins.test.mjs`
(`p1137.obo.refusals_match` case 8, `p1137.obo.plan_step_parity` arms 3 and 4).

Until the follow-up above lands, the standing guard is a cell rather than a comment:
`p1137.obo.plan_step_parity` compares the two plan bodies' refusal vocabularies on every run, and a
refusal `clara.create_accounting_plan` raises that `clara._tenancy_plan_core` does not must be on a
named roster saying which wall above BOTH lanes makes it unreachable. `clara._tenancy_plan_core` is
also on `plan-overlap-template-arm-retired.test.mjs`'s (T.4) roster now, beside the estate's three
other plan writers, so the #929 client rung and the self-excluding overlap advisory are watched
there too.

**The REVISION pair is not affected and must not be "fixed" to match.** Both revision entrances go
through `clara._revise_accounting_plan_core`, ONE body with no lane branch at all, and
`clara.revise_accounting_plan` carries no client-status wall — so neither entrance refuses a
non-active client (driven: `p1137.revision.client_status_parity`, both plans at revision 2 for an
`archived` client). Adding the wall to `clara.confirm_tenancy_rent_plan_revision_for` alone would
CREATE a divergence rather than close one. Whether the plan lane should refuse a revision for an
archived client at all is 0193's question and a person's judgement, and it is carried as a
follow-up rather than answered by a twin.

**What the machine side bought, and nothing else.** Eight EXECUTEs on eight NEW names and six
allowlist rows for one wake kind. No human door's ACL moved; the ten names of
`TENANCY_RENT_0300_HUMAN_FNS` still hold zero machine-lane grants, and the tail asserts that role by
role. `clara.settle_rent_payable` (accepting a candidate bank line) and
`clara.record_contract_terms` (recording what the page says) gain NO twin: a settlement with two
candidate lines of the same amount is adjudicated where a person can see both, and recording a term
is the person's own reading of the page.

**The surgery, and how a reader checks it.** Nine bodies are recut and not one is hand-retyped.
Eight of the nine share ONE anchor — the `c := clara._human_ctx(clara.role_rank('<floor>'));` line
every 0300 door opens with — replaced by a comment and `select p_firm as firm into c;` (the reads)
or `select p_firm as firm, p_actor as actor into c;` (the confirmations). The replacement ASSIGNS
THE SAME RECORD VARIABLE the human door assigned, so no second substitution is needed and every
other line of every core is the human door's own text byte for byte. Three bodies carry one further
anchor each, and each is a LANE question and nothing else: the confirmation's plan step (human →
`clara.create_accounting_plan`, OBO → `clara._tenancy_plan_core`), the revision's plan step (both
lanes → `clara._revise_accounting_plan_core`, so there is no branch), and
`clara.revise_accounting_plan`'s own actor ladder. Both confirmations also stamp the lane on their
audit row (`via`), exactly as 0222, 0307 and 0308 stamp theirs — the only observable change to a
human entrance in this file, and it is additive.

Each core is installed as PLAIN SQL with its body written out, and the derivation is pinned on BOTH
sides of the apply: §0 applies the surgery to the LIVE pre-image and refuses unless the result
hashes to the body embedded below it, and §TAIL re-reads the COMMITTED core, pins the same value and
REVERSES the surgery back to the pre-image's own sha.

**The client-pin arm differs by shape, and both arms fail CLOSED.** The two client-scoped reads
compare the credential's pin against the argument, as the bank wrappers do. The four
document-scoped reads take no client, and resolving a document's client in order to compare it
would be an existence surface of its own — so they REFUSE a pinned credential outright. Both are
dormant today: the one allowlisted kind, `interactive`, is client-less by construction.

**Redo (#957).** Redo-safe by construction: every object is a `create or replace`, the six allowlist
rows are `on conflict do nothing`, and each split RECOVERS its pre-image before it splices — from
the human door on a fresh apply, and by REVERSING the committed core on a redo — so the pin is
asserted on both paths rather than only on the one `CLARA_MIGRATION_REDO` takes. §0 also refuses a
HALF-applied file by name rather than completing it.
## 0360 — the two sentences a payroll correction leaves behind (#1056 fix round, riders sweep wave, lane 05)

`0360_payroll_correction_sentences.sql` changes no wall, no verdict, no rung, no grant, no table
and no signature. It recuts two bodies through the 0146/0260/0297 splice idiom and changes exactly
one string in each, plus one disclosed key. Its number comes from the sweep wave's overflow block,
assigned by the orchestrator; it exists because 0344 is applied and immutable and
`CLARA_MIGRATION_REDO` only ever takes the highest applied version, which 0345 and 0346 sit above.

**The ready sentence (ADV-L05-01).** After a correction a blocked run reads `ready`, nothing posts
it, and the Needs-you row does not clear — `clara.list_review_queue`'s payroll arm never asks the
verdict, so it stands and swaps in the verdict's `ready` sentence, which said *"re-file the payslip
to post it"*. Re-filing creates a NEW document whose extraction chain does not carry the
correction: the estate was telling a person, in its own words, to do the one act that discards the
work they had just done. `clara._payroll_posting_verdict` now branches its `ready` arm on whether
the reading carries a human declaration (0344's top-level `human_declared`, which a machine-
produced state never has). A corrected reading is told that nothing will post it, that re-filing
reads the page afresh without the correction, and to book the month by hand — an act the same
person can perform, since `clara.draft_entry` and `clara.approve_entry` are both
`clara_authenticated` doors, which §Z re-measures. Every other reading keeps 0297's sentence to the
byte, and the battery drives BOTH roads: a corrected run, and a reversed clean run (machine-ready,
nobody declared anything), whose sentence is asserted as an exact string.

**Why the correction still does not post.** Posting it would need a SECOND posting arm:
`clara._post_payroll_run` writes `clara.entry_post_receipts` with `approval_arm =
'payroll_unattended'` and a rationale whose own words are "posted unattended from a payroll summary
whose two readings agreed" — false of a run a person declared a figure on. Who may cause an
approved journal entry with no second reading behind it is an accounting decision for the owner,
not a fix round's to invent. It stays the follow-up 0344's section names, now with this sentence
beside it.

**The already-standing-entry refusal (SPEC-1056-A).** The payroll lane's pin asks
`clara._document_live_posted_entry`, i.e. `clara._document_posting_entry` per live filing: a live
`entry_evidence_links` row (that arm tests no status of its own) or any approved, un-reversed
`journal_entries` row bound to the document — no payroll qualification anywhere in it. The refusal
nonetheless said "this payroll run is already posted as entry %". The probe is deliberately KEPT —
anything the estate derived from this reading must come down first, which is 0217's
`live_bank_statement_present` rule — and the sentence is corrected to the umbrella the probe
measures, with the reason code renamed to `live_entry_present` (0217's own naming) and a new
`is_payroll_run` key in the detail so a surface can say which of the two it found. ONE remedy is
named because one is what exists: measured, both writers of `clara.entry_evidence_links` only ever
create a link for an entry already posted (`clara.attach_entry_evidence` refuses a draft in those
words — driven by a cell; `clara._record_journal_entry_core` writes its link inside the posting
transaction), and `t_entry_evidence_release` releases every live link the moment `reversed_by` is
set, so reversing the entry clears both arms.

**Prestate pins** (measured live on `clara_l03`, chain 0001..0346, after this lane's #1056 / #1090
/ #1092): `clara._payroll_posting_verdict(uuid)`
`23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0` →
`895ff7689cc048e6c96889425621189441ea5dfbc8c9fd555a13ac8d515470fc`, and
`clara.revise_document_fact(uuid,text,jsonb,int,text,text)`
`a6858d3e88bfca79d9a0f527a0d511db3702d53ca5612d796a05255fa1927fb8` →
`75a6c30f4059e547573589bb25ebe275891e8e9a6efa556bb947b3df9a5ef549`. `clara.list_review_queue` is
pinned by STRUCTURE, not by sha: six other files splice it and its sha moves for reasons that have
nothing to do with this one, so the prestate asserts the payroll arm still renders the verdict's
own sentence and nothing else about it.

**Both branches exercised on the lane database.** FIRST-APPLY through `pnpm --filter @clara/db
migrate` against the pinned pre-images, and REDO through
`CLARA_MIGRATION_REDO=0360_payroll_correction_sentences`, which reports both splices as no-ops and
still re-reads every tail assertion from the committed catalog. A redo cannot heal an edit INSIDE
a spliced string (its marker is already live, so the splice no-ops): the two bodies were restored
to their pinned pre-images by re-running 0297's and 0344's own `create or replace function`
statements as `clara_fn_owner` — an out-of-band rig operation on a disposable database, the hand
procedure #957 replaced — and the redo then took its FIRST branch, which is also the branch a
from-scratch chain takes.

**It mints no name**, so `packages/db/tests/rig-meta.mjs` gains no cohort entry; it is a
dynamic-SQL file, so `apps/web/tests/firm-scope-db-pins.corpus.ts` gains one reviewed barrier
entry, in file-sorted order (wave 4, rule 7 / sweep rule (d)).
## 0361 — one map of "which door releases this claim", and the carry-down stops naming one that cannot (#1078 fix round, riders sweep wave, lane 02)

[0361_reservation_release_advice.sql](migrations/0361_reservation_release_advice.sql) closes the
spec review's finding L02-SPEC-01 (major, 2026-09-25), the standards review's STD-1 and the
adversarial review's ADV-L02-10, on the branch that carried 0335–0338.

**What 0337 left.** #1078 widened `clara._acct_role_reserved` to a THIRD domain — the
prepayment-account roster now reserves its enrolled codes — and taught three of that census's
consumers to answer per domain: the bank belt's machine token (0337 §C), the fixed-asset profile
door's release sentence (§D) and the staff-advance enrolment door's re-enrolment advice (§E). The
FOURTH consumer was not touched. `clara._draft_opening_item_core`, the opening-balance carry-down,
asks the same census through `clara._fa_role_claim_conflict` and reported **every** non-fixed-asset
claim as `coa_account_advance_reserved`, under a remedy naming only `retire_staff_advance_account`
and "retire the profile that holds it". Neither releases a prepayment-roster claim, which is the
class [0042](migrations/0042_wave_d_b0_shared_authorities.sql):2110 names (WDB-R2: *a refusal must
name a followable remedy, or say honestly that there is none*). The same default also mis-reported
a **fixed-asset cross-role** claim — reachable since 0042, long before the third domain existed.

**Why a map rather than a fourth copy of the `case`.** All three of 0337's dispatches were written
as *prepayment → its answer, ELSE the advance answer*, and the `else` is how a whole domain came to
be mis-reported without anybody noticing. `clara._reservation_release_advice(text)` answers two
facts per domain — the token a machine reads, the sentence a person acts on — and **raises**
`CLR10 reservation_domain_unmapped` on a domain it does not know. A fifth register meets that raise
at its first refusal instead of quietly inheriting the staff-advance answer.

| § | object | what it is |
|---|---|---|
| A | `clara._reservation_release_advice` | the one map: token, door, and what releasing the claim costs |
| B | `clara._fa_assert_code_unreserved` | 0337 §C's body verbatim except the `case` that chose the token |
| C | `clara.upsert_fa_account_profile` | 0337 §D's body verbatim except the `case` that chose the sentence |
| D | `clara._draft_opening_item_core` | the fourth consumer, corrected — a guarded splice |
| E | `clara._fa_role_claim_conflict` | a deterministic `order by (domain, role)` |

**§D is a splice, and that is this body's own idiom.** `clara._draft_opening_item_core` is a
445-line body written out whole only in [0017](migrations/0017_wave_b.sql); both later corrections
to it — 0041 §4.5's four-part carry-down recut and 0042 §5.15c's reservation arm — read
`pg_get_functiondef`, COUNTED an anchor, replaced it and refused on any other count. Re-typing 444
unrelated lines to change one sentence and one token would put them under this file's signature.
Both anchors here are counted before anything is written, each replacement is a single
dollar-quoted literal, and the block no-ops on a redo by detecting its own marker in the installed
body. The entry in `apps/web/tests/firm-scope-db-pins.corpus.ts` records the review.

**What did NOT change.** No wall, no admission, no refusal that did not already happen. Every edit
is what a refusal SAYS. `clara._adv_enrolment_admission` is deliberately NOT recut: its per-domain
text is not a release sentence but a RE-ENROLMENT NARRATIVE with an axis of its own (a live
fixed-asset REGISTER ROW is permanent where an ACTIVE profile is not, and the two get different
advice under the same `fa` domain), so folding four narrative shapes and a permanence flag into
the map would make the map the thing that is hard to read. The duplication that was real — one
token, one release sentence — is what §A owns.

**§E, and why an `order by` is not cosmetic.** `clara._fa_role_claim_conflict` read the census with
`limit 1` and no ordering, and every caller branches on the single domain it returns. While the
census could only answer `fa` or `staff_advance` for one code that was harmless; once a refusal
names a per-domain release DOOR, an arbitrary choice is an arbitrary REMEDY. Ordered
alphabetically on `(domain, role)` — there is no ranking between registers to encode, and
inventing one would be a policy nobody ruled.

**Driven, not asserted.** `reservation-release-advice.test.mjs` drives the real seed door
(`clara.seed_fixed_asset`) on a client whose own prepayment roster holds the code and reads the
refusal: `coa_account_prepayment_reserved`, a sentence naming `retire_prepayment_account` and what
retiring it leaves running, and no mention of `retire_staff_advance_account`. The same door on a
staff-advance code answers 0041's token and sentence unchanged, and on a fixed-asset cross-role
claim now answers `coa_account_fa_reserved`. The map's unmapped-domain raise is driven too. Every
cell went red first against a deliberately broken map, and green again once 0361 was redone.

**Redo-safe by construction** (#957): `create or replace function` throughout, and §D's splice
detects its own marker and returns without touching the body. The prestate admits exactly two
pre-images per recut body — the sha measured on this lane's rig, or a body already carrying this
file's own `0361` attribution — so a redo is admitted and real drift refuses by name.

## 0362 — the model lane reaches the firm's standing instruction, and a withdrawal names its consequence (#1147, riders closing wave, lane 01)

[0362_standing_instruction_agent_read.sql](migrations/0362_standing_instruction_agent_read.sql)
closes two of the three halves [0338](migrations/0338_prepayment_close_standing_instruction.sql)
was never given (#1050's own follow-ups 2, 3 and 4; candidates C10, C11 and C12 of the sweep
wave's follow-up list) and holds the third with a census instead of a comment.

**What 0338 left.** #1050 shipped the firm-level standing instruction whole on the HUMAN lane. Both
write doors are `clara_authenticated`-only by design — *an instruction a machine recorded would
name nobody* — and `clara.firm_standing_instructions` grants nothing to `clara_agent_ro` or
`clara_runtime` either, which 0338's own tail asserts. The member's own web read needs no door at
all (forced RLS plus `firm_id = clara.jwt_firm()`), which is why nothing noticed that a chat model
asked *"does this firm let Clara do this?"* had **no door and no relation it may read**. Separately,
withdrawing an instruction answered five keys and said nothing about the plans it had already
authorised, which keep posting under the member who authorised them.

| § | object | what it is |
|---|---|---|
| A | `clara.wake_get_firm_standing_instruction(text)` | the model lane's own read door — `clara_agent_ro`, one `interactive` allowlist row |
| B | `clara.withdraw_firm_standing_instruction(text,text,text)` | 0338 §G's body plus ONE answer key, `plans_still_posting` |
| D | ACL + allowlist | one EXECUTE, one row |

**§A takes no firm argument, and that IS the tenancy wall.** The firm is `clara.wake_context()`'s
own answer for the calling credential. A door that took a firm would be an existence oracle the
moment anybody asked it about somebody else's, so the ticket's own criterion — *another firm's row
and no row at all answer the same way* — is structurally true here rather than defended by a
predicate. `p1147.read.no_oracle` drives it anyway, from three firms at once.

**No shared core, and law 31 is why.** 0320, 0352 and 0353 each split a read into one ungranted
core with two entrances because a HUMAN door and a MODEL door compute the same rows. This read has
one entrance: the human lane reads the relation directly under RLS. A core here would be an
ungranted body with exactly one caller.

**No floor of its own, which is a measurement rather than an omission.** The read's own floor is
VIEWER — every member of a firm may see what their firm has instructed Clara to do, which is
exactly what 0338 §A.2's policy grants. `clara.wake_context` only returns a row when the
credential's `on_behalf_of` is an ACTIVE BOOKKEEPER+ of the credential's firm, so the effective
floor is STRICTLY ABOVE the read's and a viewer-rank re-check could never fire.
`p1147.read.floor_is_the_credential` drives both halves: a viewer reads the relation herself, and no
credential may be minted on her behalf.

**§B adds one key and changes nothing else.** `plans_still_posting` is the count of this firm's
LIVE (`status = 'active'`) plans authorised by the firm's standing instruction of this kind. The
reference is compared as TEXT, never cast to `uuid`, because `authority_ref` is an open jsonb
object (0193's only CHECK is that it IS an object) and a cast would turn a count into a `22P02` at
the moment a firm is trying to withdraw. The body was taken from the LIVE catalog rather than
retyped, and §0 refuses to apply over anything that is neither 0338 §G's pinned body nor one
already carrying this file's own attribution.

**It counts the INSTRUCTION, not the row being withdrawn, and the fix round is why.** The first cut
keyed on `authority_ref ->> 'id' = <the row being withdrawn>`. 0338's record door is
VERSION-FORWARD: a restated reason — or simply recording the instruction again after a withdrawal —
withdraws the live row as *superseded by a restated standing instruction* and inserts a fresh one
with a new id, precisely so that a plan written while the old row stood keeps reading the basis it
was written under. That plan goes on citing the SUPERSEDED id. So a firm that had ever restated its
instruction was answered `0` and the settings card said, in words, that nothing kept posting while
an amortisation schedule was still active — the exact false belief this key exists to remove
(review findings SPEC-02 and ADV-01, driven through the estate's own doors on `clara_c01`). The
predicate is now the whole `(firm_id, instruction_key)` family, live rows and superseded ones
alike, because withdrawing *the instruction* is what the person did.
`p1147.withdraw.counts_across_a_restatement` drives record → real `close_prep` plan → restate →
withdraw and asserts `1`, with the plan re-read as root and still active.

**And it is a SNAPSHOT, which the wording on screen now respects.** The count is taken AFTER the
withdrawal stamp, inside the same transaction — a count taken before would be a prediction — but
what it reports is that transaction's snapshot, not a promise about the world afterwards. The wake
arm of `clara._prepayment_schedule_core` resolves the live instruction with a plain
`select … limit 1` and takes NO share lock, and the withdraw door's own `for update` is on the
instruction row, so nothing serialises the two: a `close_prep` run in flight at the moment of
withdrawal commits an active plan the receipt has already counted as absent (review finding ADV-04,
driven with two real connections). Serialising them means recutting a schedule core, which is
outside this ticket and is recorded as a successor item. What this file owns is the sentence, and
the `=0` arm of `standingWithdrawnPlans` now states what was measured at the moment it was measured
— *"No schedule opened under it was running when you took it back."* — rather than promising that
nothing keeps posting.

**WHAT WITHDRAWAL DOES TO A PLAN DOES NOT CHANGE, AND THAT IS THE RULING THIS FILE RECORDS.** The
plans an instruction already authorised keep posting under the member who authorised them — #940's
own ruling for a retired roster enrolment, restated by 0338 §G. **Whether withdrawal should also
PAUSE them is an accounting and product question #1050 was never given and #1147 does not take.**
It is a real question: a firm that says *"stop letting Clara do this"* may well mean the schedules
too, and the argument the other way is that a plan is a separate, already-authorised commitment
whose occurrences a person can pause or end one at a time (Client → Plans). The file makes the
consequence VISIBLE — the count in the receipt, the count and the remedy on the settings card — and
leaves the behaviour alone. The tail asserts the door names no plan-state verb at all, so the
decision cannot drift in by accident.

**The deferred-revenue asymmetry, and what closing it would cost.**
`clara._prepayment_schedule_core` admits `('human','obo','wake')`;
`clara._revenue_recognition_core` admits `('human','obo')` and no wake wrapper for it exists
anywhere in the catalog, so the contract-liability side cannot be stood by a standing instruction
at all. 0338 said so in a header comment and nothing else held it. This ticket adds no lane there;
it adds `p1147.asymmetry.census`
([standing-instruction-agent-read.test.mjs](tests/standing-instruction-agent-read.test.mjs)), which
reads both cores' closed lane sets, every `clara.wake_%` body that reaches either, and the
`clara.wake_fn_allowlist` rows for those wrappers, off the LIVE catalog — and fails the day one
side is widened without the other, naming which half moved. **Closing the asymmetry would cost
four moving parts**: a wake wrapper over the revenue core, the lane set widened to include `wake`,
a `clara.wake_fn_allowlist` row for the wrapper, and a SECOND instruction key in 0338 §A's closed
set (and in both write doors) so a firm could stand the revenue side separately. **The question
underneath is an owner ruling, not an oversight**: should a firm that let Clara amortise its
prepayments thereby also let Clara recognise its deferred revenue, or are those two separate
delegations? Until that is answered, the census keeps the asymmetry a decision.

**Prestate pins, measured on this rig** (riders closing wave lane 01, `clara_c01`, 337 files, max
`0361_reservation_release_advice`; no ticket of this lane landed before this one). One recut body,
admitting its measured pre-image or a body already carrying this file's `#1147 [0362]` attribution,
so a redo (#957) is admitted and real drift refuses BY NAME:

| body | pinned pre-image |
|---|---|
| `clara.withdraw_firm_standing_instruction(text,text,text)` | `c63c1fd09bc92713127a038b3565f399b8ee17fcbf27097272b7a919cbb7b6e5` |

**Post-images** for the integrator's re-derivation, measured after the fix round:
`clara.withdraw_firm_standing_instruction(text,text,text)` =
`1d057b74827f665baef0aedf7266cebff7194238224e4a0d268fe75f94642df9`;
`clara.wake_get_firm_standing_instruction(text)` =
`f69794dae2da194d08561526aa09c33f57536095eb91768a624e0bb607e07e46`.

**Deliberately NOT sha-pinned:** `clara._prepayment_schedule_core` and
`clara._revenue_recognition_core`. A sha is the right instrument for a body no other lane of this
wave writes; the schedule family is read here STRUCTURALLY (a closed lane set, off the live
catalog) and this file recuts neither, so a pin would turn another lane's lawful recut into an
abort of the whole chain. The rest of §0 is structural: the relation's six columns, its grants
(the file refuses to apply over a database where a machine role already reads it directly), the
wake context/allowlist pair, the `standing_instruction` authority kind and the four
`clara.accounting_plans` columns §B's count keys on.

**Redo-safe by construction** (#957): `create or replace function` throughout, one
`insert … on conflict do nothing` for the allowlist row, no table, no backfill, no row of business
data written. Both prestate branches were exercised for real on this rig rather than merely
written: `read door FIRST` on the first apply, then `read door REDO, withdraw door FIRST` on the
redo that landed §B, then `REDO, REDO`.

**Tail (8 assertions, all read off the live catalog):** the read door resolves at exactly one
`pg_proc` row and is STABLE SECURITY DEFINER owned by `clara_fn_owner` with its `search_path`
pinned; `clara_agent_ro` holds it and **no other role does, asked as an ALLOWLIST** — every
`clara\_%` role this cluster carries is read off `pg_roles`, PUBLIC is added, each is asked through
`has_function_privilege`, and the reached set must be exactly `{clara_agent_ro}`. The first cut was
a four-name DENYLIST under a comment claiming it caught a role the file never names; it did not
(review finding ADV-05, measured: a grant to `clara_freeform_ro` passed both arms, and
`clara_agent_chat_ro`, which the denylist named, is not a role this cluster carries). The new check
was driven rather than argued: the grant was planted for real and the redo refused with
*"clara_freeform_ro also reach(es) the read door"* before being revoked. Then: exactly one
allowlist row and it is the `interactive` kind;
the relation's own grants are unmoved (0338's tail assertion, re-read); both WRITE doors are still
`clara_authenticated`'s alone across all five machine principals; the recut withdraw door still
carries 0338's whole refusal vocabulary and its reservation pair; it names no plan-state verb; and
no wake wrapper reaches the deferred-revenue core.

## 0363 — a granted, document-scoped read of the payroll posting verdict (#1148, riders closing wave, lane 01)

[0363_payroll_posting_state_read.sql](migrations/0363_payroll_posting_state_read.sql) mints ONE
door: `clara.get_payroll_posting_state(uuid)`. Source: candidate C15 of the sweep wave's follow-up
list, which is #1048's own report `waveS-lane04-ticket1048.md` section 10 follow-up 1.

**What #1048 left.** `clara._payroll_posting_verdict(uuid)` ([0297](migrations/0297_payroll_summary_posting.sql),
recut by [0343](migrations/0343_payroll_completeness_witness.sql) SectionH) holds the whole answer — the
sentence naming what stopped the post, the verdict, the rung, the reason and the completeness
state — and is **ungranted**: 0297 revokes it from public and nothing ever granted it. It is
reached from `clara._post_payroll_run`, `clara._list_review_queue_core` and
`clara.answer_payroll_completeness` alone, so the ONLY way to see the verdict was a Needs-you queue
row (firm-wide or client-scoped) or the entry's own receipt. A document page that wanted to say
*"this payslip did not post because …"* had no read to call, which is why #1048's own tool contract
(section 9.2 of that report) had to ask `clara.list_review_queue` with a client scope and a row-kind
filter rather than asking about the document it actually has.

| section | object | what it is |
|---|---|---|
| 0 | prestate | six checks (below) |
| A | `clara.get_payroll_posting_state(uuid)` | the document page's read — STABLE SECURITY DEFINER, `clara_authenticated`, VIEWER floor, firm-scoped |
| Z | tail | 5 assertions, all off the live catalog |

**The floor is VIEWER, and that is a decision rather than a default.** Every member of a firm may
already see the document, its filing, its entries and the Needs-you row this sentence is derived
for; a higher floor would make the document page say LESS about a payslip than the queue already
says about the same payslip. The floor is the estate's one body, `clara._human_ctx`, and this door
adds nothing to it. Note what that means for the ticket's *"a caller below the viewer floor is
refused"* criterion: `clara.role_rank` puts viewer at **0** and
`clara.firm_memberships_role_check` admits no fifth string, so there is no ROLE below this floor.
The reachable arms are *no authenticated actor* and *no active membership*, both CLR04 from
`clara._human_ctx`, and both are driven in `tests/payroll-posting-state-read.test.mjs`
(`p1148.read.floor`). The third arm that body raises — *insufficient role* — is unreachable here
and is named in the cell so the next reader does not go looking for a test that cannot exist.

**The wall is `clara.documents.firm_id`, asked before anything about the document is read.** The
internal takes no firm and cannot: every body that calls it has already resolved one. A
document-scoped read cannot borrow that, so it asks the question itself, exactly as
`clara.answer_payroll_completeness` (0343 SectionK) does and for the same stated reason — a document
id that is not this firm's must not be distinguishable from one that does not exist. Both raise the
SAME CLR11 at ONE place. `p1148.read.no_oracle` compares every discriminant a caller can see (code,
message, detail, hint, constraint, table, column) and requires them byte-identical.

**And then the door's own subject, which is the one refusal a surface answers with silence.** The
brief's desired behaviour is a wrapper that answers *"the posting state of ONE PAYROLL SUMMARY
document"*. Handed an invoice, the verdict underneath would answer `facts_read / payroll_not_read`
— *"This payroll summary has not been read yet."* said over a supplier bill. SectionA therefore
refuses `CLR10` + `{"reason":"not_a_payroll_summary"}` instead. That refusal is deliberately **not**
the CLR11 above: the document IS the caller's firm's and its `document_kind` is already theirs to
read, so "not found" would be the lie here, and the wall above has already decided the only question
a stranger may ask. The web panel gates on the kind it already holds, so the refusal is a wall
rather than a banner (`apps/web/components/documents/payroll-posting-section.tsx`).

**What it projects, and what it leaves behind.** `sentence`, `verdict`, `rung`, `reason`,
`completeness` — the brief's own list — plus `document_id`, which is the caller's own argument
echoed back and carries no information they did not supply, and `duplicate_scope` (below). It does
**not** project `rung_vector` (the evaluator's internal ladder), nor `detail` itself, `plan`,
`client_id`, `firm_id`, `filing_id`, `source_doc_sha256`, `extraction_id`, `existing_entry_id`,
`period_month`, `posting_date` or `period_label`, which are internals of the posting lane that a
page asking *why did this not post* has no act to spend on. `p1148.read.projection` reads BOTH
sides — the internal as root, to establish that a ladder was there to project, and the door as a
viewer — because a cell that looked only at the door would green just as happily against a verdict
that never carried one.

**`duplicate_scope`, and the false sentence that forced it.** The verdict's tenth rung,
`no_duplicate_entry`, stops a SECOND entry, and its FIRST scope is `same_document` — the payslip's
own entry, found through `clara._document_posting_entry(client, document)`. So a payroll summary
that posted **perfectly well** answers `blocked / no_duplicate_entry`, carrying 0343's sentence for
a re-file attempt: *"… is already posted (…). This payslip was not posted again — open that entry
to decide whether this is a correction or a re-upload."* The first cut of the document-page section
rendered that verbatim for every payroll summary, on the accounting tab, directly under the entries
list that already shows the very entry it names (review findings SPEC-01 and ADV-02, driven end to
end on `clara_c01`). The fix is **not** a second sentence — one body owns the words and nothing
above it may reword them. What the page could not work out for itself is WHOSE entry the verdict
meant, and the verdict had already decided that, so the door projects that ONE token of `detail`
(`detail.duplicate.scope`), null on every other rung and always present. It discloses strictly less
than the sentence the same caller already reads, which names that entry's memo and posting date;
the duplicate's `entry_id`, `status`, `memo` and `posting_date` stay behind.
`blocksOnThisDocumentsOwnEntry` (`apps/web/lib/documents/payroll-posting-state.ts`) holds the rule,
and the section renders nothing in that one state. Every other scope names somebody ELSE's entry —
which IS the re-upload the sentence was written for — and a `ready` verdict still speaks, because
*"ready to post but no entry exists yet"* is true and has nowhere else on the page to be shown.
`p1148.read.posted` drives the real unattended posting path and reads the scope back off the door.

**No core, and that is law 31 rather than an omission.** 0320, 0352 and 0353 each split a read into
one ungranted core with two entrances because a HUMAN door and a MODEL door compute the same rows.
This read has one entrance today; the model-lane twin is a successor contract for a cut after this
wave's (#1144's roster is closed), and a core minted now would be an ungranted body with exactly
one caller.

**It is STABLE, and that is worth saying precisely.** PostgreSQL refuses a data-modifying
STATEMENT written directly inside a non-volatile function, so a later edit that put an INSERT,
UPDATE or DELETE in this body would fail to create. It does **not** stop a non-volatile body
CALLING a volatile one that writes — measured on `clara_c01` inside a transaction that was rolled
back, which is the same correction review finding ADV-03 forced on 0362's family census. So the
declaration is a guard against a careless edit, not a proof of purity; the proof is the body
itself, four statements long, whose text the tail pins by name. The body it wraps is STABLE too
(0297 SectionD: *"THE GATE WRITES NOTHING"*), and the tail re-derives `provolatile = 's'` from the
catalog rather than trusting the declaration.

**Prestate pins**, measured on the lane rig (127.0.0.1:55742 / `clara_c01`, 338 files, max
`0362_standing_instruction_agent_read` — #1147 landed first in this lane and recut nothing named
here). All three are pinned **unconditionally**: this file recuts none of them in either mode, so a
changed sha is always a finding and never a redo artefact.

| body | pinned sha256(prosrc) | why it is pinned |
|---|---|---|
| `clara._payroll_posting_verdict(uuid)` | `4c350623e41527b717a1fc58e3ee8b772060b895b5353098f8cd21153585dac8` | the body this door wraps |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` | the floor it enters at and never mentions again |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` | what "viewer" means underneath that floor |

The name `clara.get_payroll_posting_state(uuid)` is pinned bimodally — free, or already carrying
this file's own `#1148 [0363]` marker (a redo, #957) — so anything else refuses BY NAME. The rest
of section 0 is structural: the four roles; 0297 and 0343 applied; **the internal's ACL is exactly
its owner's** (the file refuses to apply over a database where some role already holds EXECUTE on
it, because a wrapper on top of a body the caller can already call is decoration, not a wall);
`clara.documents` carries `id`, `firm_id` and `document_kind`; and `clara.document_capabilities`
knows the `payroll_summary` kind, so this door's subject is not a string the file invented.

**Post-image** for the integrator's re-derivation, re-measured after the fix round:
`clara.get_payroll_posting_state(uuid)` = `c846456ffd80e51e23d02fbd652f1aebaeab822ac8ae012c961b2c03a3b1c26d`.

**Redo-safe by construction** (#957): one `create or replace function`, one `revoke`, one `grant`,
no table, no row, no backfill. Both prestate branches were exercised for real on this rig rather
than merely written: FIRST APPLY on the first `db:migrate`, and again — after the SectionA.2b edit
— with the door dropped inside a transaction that was rolled back; REDO on two
`CLARA_MIGRATION_REDO` runs. All three refusal arms were driven in rolled-back transactions too (a
foreign body squatting on the name, the wrapped body drifted, the internal granted).

**Tail (5 assertions, all read off the live catalog):** the door resolves at exactly one `pg_proc`
row and is STABLE + SECURITY DEFINER + `clara_fn_owner` with its `search_path` pinned, carrying the
viewer floor, the firm wall, the payroll-summary subject and **no** `rung_vector`;
`clara_authenticated` holds EXECUTE and none of the five machine principals does; the internal's
ACL is still its owner's alone; the internal's body did not move while this file applied; and the
two surfaces that already reach the verdict — `clara.answer_payroll_completeness` and
`clara.list_review_queue` — keep the grants they had.
## 0364 — one nested reservation namespace per lane, and one on-behalf-of plan body (#1150, riders closing wave, lane L2)

[0364_plan_reservation_namespace_obo_fold.sql](migrations/0364_plan_reservation_namespace_obo_fold.sql)
takes the two halves #1077 and #1137 each left open: candidate D16 (`clara._reserve_op`'s shared
`:plan` namespace, #1077's own follow-up 1) and candidate D17 (the estate's THIRD on-behalf-of
plan-creation body, 0353's follow-up 1). They are one file because they rewrite the same family.

**What 0336 left.** `clara._reserve_op`
([0004_governed_fns.sql](migrations/0004_governed_fns.sql):47) keys an operation receipt on
`(firm_id, fn, op_key)` — on the **firm**, not the client — and a door that nests another door
hands it a derived key. 0336 (#1077) moved the deferred-revenue lane onto `:rrplan` / `:rrend` and
deliberately stopped there, which left three bodies outside that pair deriving `<key>:plan`:
`clara.create_accrual_adjustment` and `clara._confirm_tenancy_rent_plan_core` under
`create_accounting_plan`, and `clara.correct_accrual_adjustment` under `revise_accounting_plan`,
beside the prepayment lane's own two. One operation key spent on two of them reserved the same row
with different arguments and was answered `clara._reserve_op`'s own untyped `CLR10 op_key reused
with different args`, which names neither lane. Measured before this file: a prepayment schedule
and then an accrual adjustment under one key raised exactly that.

| lane | nested suffixes | set by |
|---|---|---|
| prepayment | `:plan`, `:end` | 0193/0223 — **unchanged**, so every key already spent keeps its meaning |
| deferred revenue | `:rrplan`, `:rrend` | [0336](migrations/0336_revenue_recognition_plan_op_key.sql) (#1077) |
| accrual | `:acplan`, `:acrev` | **this file** |
| tenancy | `:tnplan`, `:revise` | **this file** (`:revise` is 0353's, unmoved and unshared) |

**Nothing is backfilled, and nothing needs to be.** 0336's own reasoning: a receipt records an act
that happened. A genuine retry never reaches the nested call at all, because each lane's OUTER
reservation on its own door short-circuits the whole body — driven per lane in
`p1150.idempotent.per_lane`.

| § | object | what it is |
|---|---|---|
| A | `clara.create_accrual_adjustment` | 0222's body verbatim; the derived key becomes `:acplan` |
| B | `clara.correct_accrual_adjustment` | 0284's door **as 0303 and 0304 left it** (both recut it after 0284 created it, and the pin is 0304's body); `:acrev`, and #936's typed `plan_op_key_conflict` names the key it really derives |
| C | `clara._confirm_tenancy_rent_plan_core` | 0353's body verbatim; `:tnplan` on the HUMAN branch, plus the closed lane set |
| D | `clara._confirm_tenancy_rent_plan_revision_core` | 0353's body verbatim; the closed lane set |
| E | `clara._obo_plan_core` | 0338's body verbatim; the closed kind set admits `recurring_journal` and stamps its entrance |
| F | `clara._tenancy_plan_core` | **replaced**: its own client-status wall, then a call to §E |

**§F is the fold 0353's follow-up 1 asked for.** `clara._tenancy_plan_core` was a third snapshot of
the on-behalf-of plan-creation step, beside `clara._obo_plan_core`
([0338](migrations/0338_prepayment_close_standing_instruction.sql)) and `clara._accrual_plan_core`
([0331](migrations/0331_accrual_plan_authority_wall.sql)). The estate paid for that duplication
twice: ADV-L08-01 found a client-status wall its siblings carried and it did not, and the sweep
wave's integration merge had to fold its hand-copied authority wall onto
`clara._assert_plan_authority`. It is now a caller, the shape `clara._prepayment_plan_core` has had
since #941.

**The one wall that stays where it is.** ADV-L08-01's client-status check remains in
`clara._tenancy_plan_core`, ABOVE the delegation, because it is the **tenancy lane's** and not the
shared body's: the prepayment and deferred-revenue on-behalf-of lanes do not carry it (measured on
the live catalog), and moving it into `clara._obo_plan_core` would refuse acts they admit today.
Keeping it above the delegation keeps its position in the ladder unchanged, which is what its own
fix round measured — an archived client with no terms recorded is still answered `terms_incomplete`
by both entrances, and a confirmation the person already made still replays after the client is
archived. `p1150.obo.fold_parity` drives both, and `p1137.obo.refusals_match` (0353's own) is green
unchanged.

**One difference, disclosed rather than left to be found.** `clara._obo_plan_core` answers
`authority_kind = 'standing_instruction'` with its own arm (0338 §E) where `clara._tenancy_plan_core`
sent every kind to `clara._assert_plan_authority`, which refuses that kind `invalid_authority_kind`.
No caller can reach the difference: `clara._confirm_tenancy_rent_plan_core` passes the literal
`'explicit_instruction'`, the body is ungranted (`clara_fn_owner` only) and nothing else calls it.

**The closed lane set** (ADV-L08-05, declined in the sweep wave's lane L8 because the cores were not
then being rewritten). `p_lane` is a `text` argument of both tenancy confirmation cores. In the
confirmation core it chooses the plan step and the branch tests for `obo`, so an unknown lane took
the JWT path and failed closed on CLR04. In the **revision** core there is no lane branch at all —
`p_lane` decides only the `via` its audit row carries — so an unknown lane stamped the HUMAN `via`
on an act no person took. Both now refuse `CLR10 invalid_lane` in their first statement, above the
op-key wall, because an unknown lane is a programming error in the estate's own code rather than a
caller's mistake.

**What this file does NOT do.** It does not type `clara._reserve_op`'s reuse raise (every governed
door rides that primitive; #1077's follow-up 2 owns it). It reads, moves and deletes no
`clara.op_receipts` row. It mints no name, so it owes `tests/rig-meta.mjs` no cohort entry, and it
mints no database role. And it leaves the **within-lane** sharing 0336 also left standing:
`clara._prepayment_schedule_core` and `clara.replace_prepayment_schedule` both derive `:plan`, and
`clara._revenue_recognition_core` and `clara.replace_revenue_recognition_schedule` both derive
`:rrplan`, so one key spent on a lane's create door and again on its replace door still collides
inside that lane. That is one lane's own namespace rather than two lanes sharing one, which is the
partition 0336 chose and this file follows; it is recorded as a follow-up rather than swept in.
The collision is **driven**, not inferred: one key spent on `create_prepayment_schedule` and then on
`replace_prepayment_schedule` is answered `CLR10 op_key reused with different args` with
`detail = null` (`waveK-lane02-review-adversarial.json` ADV-01). The two pairs are therefore named
body by body in `ACKNOWLEDGED_SHARED_DERIVERS` rather than tolerated in silence — see the census
paragraph below.

**The census is the guard.** `p1150.namespace.census`
(`tests/plan-reservation-namespace.test.mjs`) discovers every `p_op_key || ':x'` derivation in the
`clara` schema, works out which call encloses it, keeps the ones handed to a plan door — dropping
`:approve`, `:match`, `:settle`, `:post`, `:draft`, `:resolve`, `:assess`,
`:add_client_identifier` and `:file_document_write`, which belong to the bank, payroll, fixed-asset
and document families — and asserts the partition. The only hand-written things are which lane each
suffix belongs to (`LANE_SUFFIXES`) and the two within-lane pairs above
(`ACKNOWLEDGED_SHARED_DERIVERS`).

**One suffix, one body** is the other half of the same census, and it is a second cell:
`p1150.namespace.one_suffix_one_body`. The lane partition alone reads clean on two bodies of ONE
lane sharing a suffix, which is exactly the residual above, so the pairs are listed signature by
signature and anything else fails by name — a third deriver of `:plan` or `:rrplan`, or a second
body on any other suffix. The roster is measured against the live catalog in the same cell, and a
listed body that stops deriving its suffix is itself a problem, so the day the follow-up
consolidates a pair the cell says which entry to drop. Both directions are shown red against a
deliberately broken subject inside the cell (a decoy body deriving `':plan'` under
`create_accounting_plan`, a second decoy on `':tnplan'`, and the live rows with one pair member
removed).

**Redo (#957), and what the prestate's marker is.** Every one of §A–§F is a `create or replace
function`, so the file is redo-safe by construction. Its prestate is bimodal: each of the six recut
bodies is admitted at its pinned pre-image (FIRST) or as a body already carrying this file's own
attribution (REDO). **That marker is a substring test**, so it is the full `#1150 [0364]` string
every one of §A–§F writes into the body it installs, not the bare number: with the bare number a
body that only *mentions* `0364` in a comment — "superseded by a later cut; see 0364 for the
previous shape" — was admitted as this file's own recut and would have been spliced over in
silence. Driven both ways in a rolled-back transaction, before and after the tightening
(`waveK-lane02-review-adversarial.json` ADV-03, and `waveK-lane02-fix.md`). A later file reusing the
idiom should pick a marker that cannot occur by accident for the same reason.

**What the census can and cannot see.** It reads a derivation written as `p_op_key || ':x'` and
attributes it to the nearest ENCLOSING plan-door call, walking outwards through wrapper calls
(`coalesce(p_op_key || ':plan', …)` inside `create_accounting_plan(…)` is attributed to the door, not
dropped). It still cannot see a key carried through a local variable first
(`v_key := p_op_key; … v_key || ':plan'`), because both the SQL-side filter and the reader key on the
parameter name: a clean census means "no deriver written in terms of `p_op_key`", not "no deriver".
Nothing on the catalog takes that shape today, and the tail assertions of this file pin the six
bodies it recuts directly rather than through the census.
