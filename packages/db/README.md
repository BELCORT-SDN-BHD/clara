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
change it. Two migrations after 0154 mint four more roles:
[0160_checkout_gate_c2_stripe_events.sql](migrations/0160_checkout_gate_c2_stripe_events.sql)
(`clara_stripe_webhook`, `clara_stripe_webhook_login`) and
[0163_checkout_gate_c3_folded_door.sql](migrations/0163_checkout_gate_c3_folded_door.sql)
(`clara_auth_wall`, `clara_auth_wall_login`), each guarded by `if not exists` so a normal single
from-scratch chain only creates them once.

Re-applying the WHOLE chain from scratch into a **fresh database on a cluster that already ran the
chain once** hits those four leftover roles before it reaches 0154 again: the count already reads
`18`, not `14`, and 0154 raises `CLR10` — a cluster-reuse hazard, not a migration defect.

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
clara_auth_wall; drop role clara_auth_wall_login;` — after which a from-scratch chain is
**expected** to pass 0154's census (14) and let migrations 0160/0163 recreate the four roles
fresh partway through the same chain (back to 18). **Verified end to end (2026-09-20)**: a
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
migration minting another role is picked up automatically. Verified on this package's own rig
(`packages/db/tests/role-census-reset.test.mjs`): the live cluster's count (18) minus its four
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

**Named residual — the preview reproduces two of `accept_invite`'s three walls.** The acceptance
door also re-checks the ISSUER's *current* rank (`clara.role_rank(inv.role) > coalesce(v_issuer_rank,
-1)` → `CLR04 'invite exceeds the issuer''s rank -- re-issue by an owner'`), a fact that lives in
`clara.firm_memberships` and that `clara.firm_invites_visible` does not carry either. So an
invitation whose issuer has since been demoted — or who has left the firm at all, which the
`coalesce(…, -1)` refuses for every role — still reads `pending` in BOTH the preview and the admin
roster, and the acceptance door is what refuses it, at the last step, in its own words. Closing it
means a fifth effective status in the view *and* in the door (the invite-outcome face set is fixed at
four for this delivery), so it is a ticket of its own. The divergence is pinned meanwhile by
`packages/db/tests/preview-invite.test.mjs` → `p625.preview.issuer_rank`, which fails if either side
of it moves.

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

**What the wall is not.** The read blocks nothing by itself: a caller that never asks can still
call `begin_client_onboarding` at any arity and a client is born. That residual is deliberate
(this wave recuts no birth verb, and a defaulted third parameter would create the overload
`0103:1055-1070` refuses) and is kept honest by `p649.identity.direct_birth_residual`.

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

The firm's own `scope_kind='firm'` onboarding plan gained its first human doors at 0218. All five
names are `clara_authenticated`-only, owned by `clara_fn_owner`, `SECURITY DEFINER` with
`search_path` and `plan_cache_mode` pinned, and floored at **admin** inside their own bodies; no
runtime, agent or wake role holds EXECUTE on any of them, and `clara.firm_setup_keys` grants SELECT
to `clara_authenticated` alone.

| Operation | Floor | What it does |
|---|---|---|
| `clara.seed_firm_setup_plan(p_op_key)` | admin | RECONCILES the firm plan against `clara.firm_setup_keys`: inserts only the catalogue rows the plan is missing and never touches an existing item, so an answer `firmInterview_v3` already wrote is neither rewritten nor re-asked. Rotates the CAS token and appends a revision snapshot. |
| `clara.answer_firm_setup_item(p_plan, p_expected_revision, p_item_key, p_answer, p_op_key)` | admin, then the catalogue row's `min_role` | Validates the answer against the catalogue's declared shape, records it with its author, and — for the three firm-defaultable keys only — captures a firm-scope `clara.knowledge_records` row through the live `clara.capture_knowledge`. CAS mismatch is `CLR06` + `detail.reason='stale_plan'`. It is also the journey's CORRECTION PATH: it sets `state='answered'` from any non-committed state and replaces `answer` wholesale, so a recorded fact is corrected and a deferral is un-skipped by the same act (no deferral reason survives beside the new value). The one exception is a key that already carries a LIVE firm-scope knowledge record — the second capture is refused `knowledge_already_live`, and correction belongs to `clara.correct_knowledge`. |
| `clara.defer_firm_setup_item(p_plan, p_expected_revision, p_item_key, p_reason, p_op_key)` | admin, then `min_role` | Skips an item that is NOT `required_for_commit`, parking the stated reason in the item's `answer` as `{"deferred_reason": …}` (`clara.onboarding_plan_items` has no `reason` column and its deferred CHECK arm constrains none). Refuses a required item and an already-answered one. |
| `clara.commit_firm_setup(p_plan, p_expected_revision, p_op_key)` | admin | Commits the plan once every **catalogue** row that is `required_for_commit` is answered, resolved or deferred; otherwise `CLR10 required_items_outstanding`, naming them. It reads the catalogue, not the plan row's own flag, so a foreign plan item (`bookkeeper_email` → #625, `first_client_onboarding` → #649) cannot block this journey. |
| `clara.get_firm_setup()` | admin | The journey's ONE production-facing read: plan identity and CAS token, every catalogue row with its plan state, the required-answered/required-total counter, the outstanding required keys, and the confirmed firm-scope facts with scope, source, actor and an authority verdict taken from the author's CURRENT membership rank. |

`clara.update_onboarding_plan` stays byte-identical and `clara_runtime`-only; `clara.commit_client_onboarding`
still forces a client; `clara.promote_plan_answers_to_knowledge` is deliberately not used (its
promotion loop joins one global `item_key` namespace with no scope discriminator). 0218 also adds
`uq_onboarding_plans_one_open_firm` — a partial unique index on `(firm_id) where state='open' and
scope_kind='firm'`, which is what makes `clara.claim_paid_firm`'s bare `select … into` replay arm
single-row rather than silently first-row.

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
| `clara.fa_depreciation_authorities.authority_kind` / `.authority_ref` / `.authority_from` | — | `clara.accounting_plans`' own shape (0193:415-430), relaxed to NULL-able for the backfill alone. The reference is REQUIRED at signature and RESOLVED against `clara.accounting_work` / `clara.agent_tasks` in the same firm AND client; `authority_from` is the first day of the SIGNING month in the book's `Asia/Kuala_Lumpur` calendar, written once and frozen. `clara._tf_fa_authority_transition`'s write allowlist gained exactly these two sign-time columns, or the door could not write them at all — and, because an ALLOWLIST IS NOT A FREEZE, the same trigger carries the write-once wall for both: once either value is set, no transition may move it (CLR38 `authority_immutable`, naming the column). 0193:476-478 freezes the plan lane's twin pair the same way. |
| `clara._fa_assert_period_open(uuid,date)` | NONE — ungranted | **The fixed-asset lane's whole locked-period law, in one body.** It selects the fiscal year containing `p_date` exactly the way `0056:656-662` does, returns silently when there is none or it is `open`/`reopened`, and otherwise raises CLR38 `period_request_invalid` / axis `period_closed` naming the year, its status and the reopen path. **#678 adopts it unchanged rather than minting a second predicate.** |
| `clara.preview_depreciation_run(uuid)` | `clara_authenticated` | What the NEXT run would do: the period the DATABASE chose, per-asset amounts, the two GL legs, the skipped assets with reasons, and `mode_would_be`. It is `stable`, so the LANGUAGE refuses to let it write. The ungranted-core/granted-wrapper idiom: `clara._fa_compute_charges` stays ungranted and `rig-meta.mjs`' main sweep fails the moment a grant appears on it. |
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

**Two residuals this lane names rather than hides.** (1) The `period_earlier_unmet` sequencing
guarantee — the thing that pins the reducing-balance arithmetic so a run can never read around an
unapproved period — STOPS BINDING BELOW THE FLOOR for a caller-named period, because the only
instruments that could re-derive it unfloored are the one 1-arg oracle (whose consumer set is
`deepEqual`-pinned by two live CI batteries) or a bypass parameter on it (a DROP + CREATE against
§2.2 rule 4). `p651.authority.floor_sequencing` pins the exposure. (2) `preview_depreciation_run`
DUPLICATES the poster's leg aggregation rather than extracting it; the duplication is bound two ways
— a normalized-fragment assertion in 0227's tail and the behavioural cell `p651.preview.matches_run`.

**And one thing this file is not.** It does NOT unpark `close_prep`: the wake source stays
registered-and-disabled, asserted in the prestate AND the tail in `0223:247-250`'s own idiom.

### Document source revision (#646, migration 0217)

A document's own *reading* now has two governed human doors and two reads, all four
`clara_authenticated` only and bookkeeper-floored inside their own bodies:

| Door | What it does |
|---|---|
| `clara.revise_document_fact(uuid,text,jsonb,int,text,text)` | Appends ONE `clara-fact-human:v1` / `invoice_facts` extraction carrying the whole fact set with one field revised. It never UPDATEs `clara.document_regions`: the kind-scoped supersede chain (0089) is what keeps the previous reading readable, and the DEFERRABLE arithmetic belt (0191) re-derives the six-term identity over the new numbers. Refusals: `stale_source_version` (CLR19, echoing the attempted value), `field_path_syntax` / `field_path_namespace` (CLR10, from `clara._assert_field_path`), `field_path_not_revisable`, `typed_facts_not_supported`, `no_facts_to_revise`, `monetary_value_malformed`, `component_must_not_be_negative`, `live_bank_statement_present`, CLR11 for a foreign document, CLR03 for an agent identity. |
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
CHECK; the posted-effect integration is #676.

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
  never a firm default. `knowledge_keys.scope_default` is deliberately NOT the mechanism — that
  table is append-only on UPDATE, so its already-seeded rows can never be re-defaulted.
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
grammar (`^[a-z][a-z0-9_]{0,62}$` — stricter than the catalog's own `btrim(...) <> ''`, which the
file's header records for the next key-minting migration) and a 400-key cap; `tiers` is a closed
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
  instrument for a named gap (`:235-236`, "A limit is not a lower level").

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

**A stop that can never finish is NAMED.** The fan-out must re-issue with the stored
`cancel_requested_by`; if that person's membership goes away, every child refuses CLR04 on every
sweep for ever. `get_intake_batch` derives `cancel_blocked='canceller_not_active'` from the live
membership rather than storing a fourth state, the card renders the remedy, and the reconciler belt
counts that parent as `batchCancelBlocked` rather than as one more transient failure.

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
images refuse on docs; 20 ≤5MB PDFs refuse on PAGES. The daily window is
`date_trunc('day', now() at time zone 'utc')` (0007:1644), i.e. **08:00 Asia/Kuala_Lumpur** — the
read reports that in its `capacity` block so the surface can say 08:00 rather than "midnight".
Moving the window to MYT is #635's ticket.
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
