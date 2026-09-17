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

[0199_client_work_pack.sql](migrations/0199_client_work_pack.sql) owes **no** consumer-first
obligation either, for a narrower reason: it adds exactly one SECURITY INVOKER read door,
`clara.get_client_work_pack(p_client, p_preview)`, grants EXECUTE to `clara_authenticated` alone,
and creates no relation, column, policy, index or trigger and recuts nothing. Its only consumer is
a new browser module ([../../apps/web/lib/work/client-work-pack.ts](../../apps/web/lib/work/client-work-pack.ts)),
which cannot call a function that is not there yet. It keeps ONE prestate pin — a pre-image
`sha256(prosrc)` of `clara._work_run_attempts` — not because it recuts that body but because it
CALLS it and its own safety argument depends on that helper's 101-id ceiling and its in-body
bookkeeper floor; the pin is what forces a later recut of the helper to re-derive this door's
argument rather than discover it at 102 running Works.

Two sentences in 0199's own header are corrected here rather than in the file, which is
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

### Firm setup (0203, journey A5)

The firm's own `scope_kind='firm'` onboarding plan gained its first human doors at 0203. All five
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
promotion loop joins one global `item_key` namespace with no scope discriminator). 0203 also adds
`uq_onboarding_plans_one_open_firm` — a partial unique index on `(firm_id) where state='open' and
scope_kind='firm'`, which is what makes `clara.claim_paid_firm`'s bare `select … into` replay arm
single-row rather than silently first-row.

The census audits the public operation boundary, so a trigger below it is invisible to every
label above. Read [#692](https://github.com/BELCORT-SDN-BHD/clara/issues/692) before adding the
first writer for `clara.firm_document_limits`. Its BEFORE-INSERT pseudo-upsert is column-preserving:
a limit the caller leaves out — or sends as NULL — keeps the value the firm already had, and so does
`updated_by`. That holds because the four limit columns carry no table default; the trigger is the
only thing that supplies 100 / 1000 / 2 / 2, and it does so on a firm's first insert alone.

### The fixed-asset acquisition boundary (#639, migration 0201)

An acquisition and its fixed-asset register row commit TOGETHER, on every lane, and the instrument
is a DEFERRED CONSTRAINT TRIGGER rather than a hook:

| object | grant | what it is |
|---|---|---|
| `clara._tf_fa_acquisition_birth()` + `t_je_fa_acquisition_birth` | none (trigger) | The lane-agnostic birth. `after insert or update on clara.journal_entries … deferrable initially deferred … when (new.status='approved')`, named to fire BEFORE `t_je_fa_movement_belt` — deferred triggers fire in alphabetical trigger-name order, measured on PG 17.11, not creation order. It carries `_fa_on_approve` arm 4's predicate verbatim plus an `origin='scheduled_run'` exclusion arm 4 does not have, and is idempotent against the hook through the same `on conflict (acquisition_line_id) do nothing`. |
| `clara.fixed_assets.acquisition_document_id` | — | The source document, copied AT BIRTH. Write-once: `clara._tf_fixed_assets_immutable_0017` forbids any later write to a column outside its post-approval allowlist, so a row birthed by the hook carries NULL and the READ resolves the acquisition entry's own `document_id`. The two can never disagree (0201 tail T.7). |
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
model added `finalize_close` and `reopen_fiscal_year`. 0201's tail re-derives and re-pins the
measured six, so a seventh is caught.

### Document source revision (#646, migration 0202)

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

0202 also recuts `clara.set_document_kind` — signature unchanged — so a kind change records the
same observation and its own `'kind'` revision row. **D1 write-quiesce is owed** for that recut
(see the Deploy contract above). #646 mints no `clara.accounting_work` row and widens no purpose
CHECK; the posted-effect integration is #676.

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
