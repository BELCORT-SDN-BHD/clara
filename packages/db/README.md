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

Rebuilding a target from the migration chain and restoring a dump are different operations.
A full replay creates login shells as NOLOGIN; restore the intended LOGIN state and credentials
afterward and probe every configured runtime lane. Existing platform roles can also collide
with historical migration census assertions. A green local chain does not prove that a live
cluster can be replayed without a target-specific preflight.

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

## Client identity candidates and the onboarding-facts settle door (0204)

[0204_client_onboarding_facts.sql](migrations/0204_client_onboarding_facts.sql) adds two human-lane
doors and one ungranted helper. It recuts nothing: `begin_client_onboarding(text,text)`,
`create_client(text,text)`, `commit_client_onboarding` and `set_client_fy_end` keep their live
bodies, pinned by pre-image `sha256(prosrc)` in 0204's own prestate and re-asserted in its tail.

`clara.client_identity_candidates(p_name text, p_identifier jsonb default null)` — SECURITY
DEFINER, admin floor (the same floor `begin_client_onboarding` enforces), firm taken from the
session and never from a parameter. It answers which clients or live counterparties of the
caller's own firm already share the name's leading token, plus an exact-name hit and, when an
identifier is supplied, a `client_identifiers (kind, value_normalized)` match normalised exactly
as `add_client_identifier` normalises it. Three arities, ruled by the owner: 0 proceeds, 1 is
returned for the human face to show and acknowledge, and **2 or more RAISES** CLR10
`name_family_collision` with the candidate ids in `detail`.

**This is the ungranted-core / granted-wrapper idiom, and the reason is executable law rather than
style.** `clara.name_family_token`, `clara.name_family_candidates` and
`clara.name_family_is_ambiguous` may not be granted to any application role:
[0103_f_a7_pi_additive.sql](migrations/0103_f_a7_pi_additive.sql) ends with a live
`has_function_privilege` census over five application roles × those three signatures that raises
CLR10 on any EXECUTE, repeated in [0126](migrations/0126_f_a7_pr_2_agent_receipt_surface.sql) and
[0154](migrations/0154_role_membership_census.sql). So the browser is granted the WRAPPER and never
the predicate; 0204's tail re-measures that census against the committed catalog, and
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
  `fy_end_locked_by_annual_cadence`, and 0204 lets them propagate with the inner door's own
  message, code and detail. The raise aborts the transaction, so the settle receipt goes with it.
- **There is no machine twin, and the ground is structural**: `set_client_fy_end` opens with
  `clara._human_ctx`, which raises CLR04 with no `jwt_sub`, and is EXECUTE-granted to
  `clara_authenticated` alone. A runtime-role twin could not call it.
- **The day is not in Knowledge this wave** — a named residual. `clara.knowledge_keys` and
  `clara.knowledge_plan_item_map` belong to #654, and 0204's tail asserts it minted no row in
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

The census audits the public operation boundary, so a trigger below it is invisible to every
label above. Read [#692](https://github.com/BELCORT-SDN-BHD/clara/issues/692) before adding the
first writer for `clara.firm_document_limits`. Its BEFORE-INSERT pseudo-upsert is column-preserving:
a limit the caller leaves out — or sends as NULL — keeps the value the firm already had, and so does
`updated_by`. That holds because the four limit columns carry no table default; the trigger is the
only thing that supplies 100 / 1000 / 2 / 2, and it does so on a firm's first insert alone.

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
