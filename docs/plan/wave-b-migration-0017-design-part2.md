# Migration 0017 — interface pins, part 2 of 3 (Blocks K, S)

**Status: DRAFT for orchestrator review.** Part of the single 0017 design set — see
`wave-b-migration-0017-design.md` (header, house law, OPEN FORKS, Blocks W/O) and
`wave-b-migration-0017-design-part3.md` (Blocks L/G, prestate fixtures, battery,
post-verify, v25 consumers). `[FORK-n]` markers refer to the OPEN FORKS section in
part 1.

---

## Block K — carry-down (B4: registry, opening items, OB writers, batch approval, FA, tie-out, supersede)

**K1 — the seeded-once registry.** `opening_seed_registry(id uuid pk, firm_id uuid not
null, client_id uuid not null, plan_id uuid not null fk onboarding_plans, as_of date
not null (the governed opening date), state text not null default 'open' CHECK IN
('open','finalized','cancelled'), tie_document_id uuid null, tie_document_sha256 text
null CHECK pair, created_by uuid not null, created_at, finalized-side columns stamped
by K5, cancelled_at/by/reason all-or-nothing)` — **`unique (client_id) where state <>
'cancelled'`** = the structural "second SEMANTIC seed RAISES" (WB-R4/Gate K; op_receipts
alone cannot provide this — receipts replay, the registry raises). Composite
firm/client FKs; full RLS posture. `create_opening_seed(p_client, p_plan, p_as_of,
p_tie_document, p_tie_sha256, p_op_key)` — human bookkeeper+ (maker lane), GRANT
clara_authenticated; admits client `status in ('active','onboarding')` (active = the
B-12/RPR incremental lane); the tie document, when present, must be an ACTIVE filing
to this client with `document_kind='opening_balance_doc'` (or `'management_account'`
for the WB-R16 incremental variant) and `bytes_verified_at` set (the
`_active_document_filing` path, CLR02 class).

**K2 — `opening_items` (the per-item typed home) `[FORK-1 lean]`.** One row per
carried item, 1:1 with its OB journal entry:

- `opening_items(id uuid pk, firm_id, client_id, seed_id uuid not null fk registry,
  item_kind text not null CHECK IN ('gl_balance','ar_open_item','ap_open_item',
  'bank_uncleared','fixed_asset','equity_net','obe_plug'), item_key text not null (the
  deterministic per-item idempotency key, e.g. 'ap:<reg-or-name-normalized>:<doc-ref>'
  — P7's per-item keys live HERE, beyond op_receipts), entry_id uuid not null fk
  journal_entries UNIQUE (1:1 with the OB entry), counterparty_id uuid null CHECK
  (required for ar/ap kinds, forbidden for gl/equity/obe), fixed_asset_id uuid null
  CHECK (required iff item_kind='fixed_asset'), item_ref text null (invoice no /
  cheque no / instrument ref), item_date date null, amount_cents bigint not null,
  state text not null default 'active' CHECK IN ('active','superseded'),
  superseded_by_item uuid null CHECK pair with state, created_by, created_at)` —
  `unique (seed_id, item_key)` (a re-run's duplicate item is a conflict, not a double
  post — Gate K "re-run does ZERO writes" = discover-then-create over this unique +
  op_receipts).
- **WB-R11 SST facts (typed columns, written at insert — journal_lines are immutable):**
  `sst_portion_cents bigint null CHECK (>= 0)`, `sst_rate_bp int null CHECK (> 0)`,
  `sst_basis text null CHECK (btrim <> '')` — CHECK: SST fields only on
  `ar_open_item`/`ap_open_item`, all-three-or-none. **NO SST legs posted, no return
  logic** — Wave F reads these columns.
- **WB-R12 bank granularity:** `item_kind='bank_uncleared'` rows carry `item_ref` +
  `item_date` (instrument date) — Wave C's matcher consumes per-item granularity.

**K3 — the OB writer family (the ONLY lawful setter of `is_opening_balance=true`).**
NEW human-lane audited core + wrapper — a SIBLING of `_draft_entry_core`, never a
widening (the generic core keeps its hardcoded `false` forever; 0004:186-189):
`draft_opening_item(p_client uuid, p_seed uuid, p_item jsonb, p_lines jsonb,
p_resolution uuid, p_document uuid, p_sha256 text, p_op_key text) returns jsonb` —
`_human_ctx(role_rank('bookkeeper'))` (maker floor; approval is admin-side via K5),
GRANT clara_authenticated ONLY. Behavior, in order:

- Client gate: `status in ('active','onboarding')`, archived refuses (O8 row 12).
- `assert_client_resolved(p_client, p_resolution, p_document)` — the ≥0.95 invariant
  binds carry-down like every client-scoped writer.
- Provenance: document-bound items ride `assert_provenance` against the
  `opening_balance_doc` filing (`ck_je_doc_pair` both-set); **keyed-in items are the
  WB-R15 FALLBACK lane** — document/sha both NULL, memo mandatory
  (`'opening carry-down: <item_key>'` — `ck_je_basis` satisfied), and the typed
  non-document provenance is the `opening_items` row itself (+ the K4 target row's
  `entered_by` staff attribution). CLR02 is never loosened.
- Posts the entry at `posting_date = seed.as_of` (the governed opening date),
  `is_opening_balance = true`, `status='draft'`, origin `'manual'`, coding_kind NULL
  (`ck_je_coding_kind` untouched — OB typing lives on `opening_items.item_kind`).
- Line discipline (the B-6 structural fix): `gl_balance` items REFUSE lines on
  control-class accounts (`account_class in ('payable','receivable')`) and on
  OBE/RE-marked accounts (controls carry via ar/ap items, equity via `equity_net` —
  double-count is structurally impossible, not skill prose); ar/ap items post exactly
  their control leg (counterparty stamped) + OBE contra; `equity_net` carries the
  CLOSING NET balance-sheet position as ONE line resolved by the RE MARKER (never
  literal `150-000`; Dr/Cr from the balance-sheet sign — the BEE fixture: TB
  105,000.00 / RE Dr 65,747.97); `obe_plug` is the single plug item that nets the OBE
  marker account to exactly zero (fail-loud `opening_balance_equity_not_nil` class if
  impossible).
- Inserts the `opening_items` row (K2) in the same txn; receipt + NO event until
  approval (drafts are dry-run state; `entry.drafted`-class emission follows the
  as-built draft path convention).

**No wake sibling ever** (zero `wake_fn_allowlist` rows, zero agent grants — WB-R1/B4
human-lane by construction); the agent may PREPARE nothing here — carry-down numbers
are DB-validated human input.

**K4 — tie targets + the document-primary tie-out (WB-R15).**
`opening_tb_targets(id, firm_id, client_id, seed_id fk, line_key text not null,
account_code text null (FK (client_id, account_code) → coa_accounts when mapped),
source_label text not null, debit_cents bigint not null default 0, credit_cents
bigint not null default 0, provenance_kind text not null CHECK IN
('document','keyed'), document_id uuid null + sha CHECK pair (required iff
'document'), extraction_ref jsonb (region/extraction citation), entered_by uuid null
CHECK (required iff 'keyed' — the attributed staff member), created_at)` —
`unique (seed_id, line_key)`. Writers: `record_opening_target(p_seed, p_line jsonb,
p_op_key)` human bookkeeper+ (keyed lane) and a runtime-granted sibling
`record_opening_targets_parsed(p_seed, p_lines jsonb, p_document, p_op_key)` for the
parsed-document lane (rides the existing extraction tables; excludes
consent_evidence). Read/assert surface:

- `get_opening_dryrun(p_seed uuid) returns jsonb` — GRANT clara_authenticated;
  computed-vs-document **per-line deltas** (`trial_balance_as_of(client, as_of)` over
  the DRAFT+approved OB set vs targets), OBE net, unmapped labels, missing must-asks —
  the dry-run card's hydration source.
- `clara._assert_opening_tie(p_seed uuid)` — ungranted internal: RAISES (CLR30 class)
  unless every mapped line delta = 0 to the sen AND the OBE marker account nets to
  exactly ZERO over the seed's approved+in-batch entries. Called by K5 approval and
  the K6 supersede; the L4 watch re-checks it daily post-finalize.

**K5 — the WB-R4 batch-approval object (ONE serializable transaction).**
`approve_opening_seed(p_seed uuid, p_expected_plan_revision uuid,
p_tie_document_sha256 text, p_entry_revisions jsonb, p_attestation text, p_op_key
text) returns jsonb` — `_human_ctx(role_rank('admin'))`, GRANT clara_authenticated
ONLY. Protocol, in order, inside `isolation level serializable` (the fn asserts
`current_setting('transaction_isolation')='serializable'` and refuses otherwise —
callers run it via a dashboard rpc lane pinned serializable):

1. Lock the registry row `FOR UPDATE`; state must be `'open'`.
2. Take the client advisory lock `pg_advisory_xact_lock(203005004,
   hashtext(client))` BEFORE any entry work (serializes against live
   `approve_entry` on the B-12/active lane — the as-built lock order is respected:
   filing FOR SHARE → row FOR UPDATE → advisory → gate).
3. Verify: plan revision matches (stale-plan refusal); the tie document's sha matches
   the registry (`'document'` primary) or every target is `'keyed'` (fallback,
   attributed); EVERY draft OB entry's revision token matches `p_entry_revisions`;
   `maker ≠ checker` for EVERY entry (OB ⇒ `is_high_stakes` ⇒ CLR05 per entry — the
   one-checker ceremony WRAPS the per-entry law, never bypasses; the solo-firm
   `self_approval_attestation` variant rides `p_attestation` exactly as 0004:541-547).
4. `_assert_opening_tie(p_seed)` + `_assert_fa_baseline(p_seed)` (K9) — the tie must
   hold over the about-to-approve set.
5. Approve the COMPLETE set via a dedicated internal
   `clara._approve_opening_entry(...)` per entry — **NOT `_approve_entry_core`**: no
   sighting mint (the as-built mint has NO account_class filter — a counterparty-
   stamped control leg WOULD seed the pool, violating WB-R2's zero-sightings law and
   the empty S/P pool), no rule-proposal loop, no CLR26 re-query per entry (one
   `_open_question_blocks(client, null, null)` client-scope check for the batch);
   status flip + revision + approved_by/at per entry.
6. Record per-entry approval rows: `opening_seed_approvals(id, seed_id, batch_n int,
   entry_id, item_id, checker uuid, attestation_kind CHECK IN
   ('distinct_checker','self_approval_attestation'), approved_at)` — unique
   `(seed_id, entry_id)`.
7. Finalize: registry `state='finalized'`, `finalized_at/by`, `tie_asserted_at`,
   stamped `through_event_seq`; plan items updated (`capture` items → resolved).
8. `_append_event('opening_seed.batch_approved')` LAST (+ one `entry.approved`-class
   emission per entry per the as-built approval convention — emitted at the tail,
   consecutive seqs under the held counter lock).

Same-op retry replays the receipt byte-identically (`_reserve_op` hash over the full
request); a second semantic seed RAISES on the K1 partial unique. A serialization
failure (40001) surfaces to the caller for retry with the SAME op_key — the receipt
row rolled back with the txn, so the retry re-executes cleanly (the op_receipts
`{'pending':true}` in-flight semantics are documented for the resume gate).

**K6 — the opening-dated supersede verb (WB-R5 ships it regardless of the lock gap).**
Two-step, reversal-pair-shaped (approved entries are immutable — `t_je_immutable`;
`uq_je_one_approved_reversal` caps one approved reversal per entry; an UPDATE
correction is structurally impossible):

- `supersede_opening_item(p_item uuid, p_replacement jsonb, p_op_key text)` — maker
  bookkeeper+: drafts (a) the reversal of the item's entry — `reversal_of` set,
  `posting_date = seed.as_of`, `is_opening_balance = true` (the SST-watch exclusion
  must cover corrections too), and (b) an optional replacement OB item via the K3
  path; links both to the registry as an open correction batch (`batch_n + 1`).
- `approve_opening_correction(p_seed uuid, p_entry_revisions jsonb, p_attestation
  text, p_op_key text)` — the K5 protocol verbatim scoped to the correction batch
  (registry lock, advisory lock, maker≠checker per entry, **`_assert_opening_tie`
  re-asserted atomically**), flips the old item `state='superseded'` +
  `superseded_by_item`, emits `opening_item.superseded` LAST.

Gate K's probe ("supersede corrects one item cleanly at the opening date") is cut
from this pin alone.

**K7 — OBE + retained-earnings markers (P8).** Swap
`coa_accounts_special_acc_type_check` (NAMED — drop by name, re-add SAME name, the
0016:121-125 precedent): `special_acc_type is null or special_acc_type in
('rounding','sst_output','sst_purchase_cost','opening_balance_equity',
'retained_earnings')`. Companion type-binding CHECKs (the
`ck_coa_sst_purchase_cost_expense` pattern): `ck_coa_obe_equity` —
`special_acc_type is distinct from 'opening_balance_equity' or
account_type='equity'`; `ck_coa_retained_earnings_equity` — same for
`'retained_earnings'`. `uq_coa_special` (client_id, special_acc_type) already gives
one-OBE-and-one-RE-per-client for FREE (0003:58-59 — no index change). Pre-assert: no
existing row violates (trivially true — widening). Tail-assert constraintdef contains
both new values. K resolves OBE/RE by marker lookup, NEVER literal codes (the salvage
law); the O9 seed stamps the markers via `upsert_account`.

**K8 — `fixed_assets` books-grade discipline (greenfield — zero writers/immutability
as-built) `[FORK-7 lean]`.**

- Writer: `seed_fixed_asset(p_client uuid, p_seed uuid, p_asset jsonb, p_op_key text)
  returns jsonb` — human bookkeeper+, GRANT clara_authenticated; validates
  books-grade NOT NULLs on the writer path (description, acquired_date, cost_cents>0,
  useful_life_months>0, the three (client_id, account_code) CoA FK targets present
  and non-control); `depreciation_method` MUST be `'straight_line'` — any other
  policy REFUSES per asset with a typed refusal AND the runtime records a FORK-7 plan
  `todo` item (`'still to capture'`; the CHECK is NOT widened this wave).
- Baseline fields stamped by the writer: `baseline_as_of = seed.as_of`,
  `accumulated_depreciation_cents` (the carried figure — DB-validated human input,
  never agent-computed), `depreciation_start_date`; `acquisition_entry_id` = the
  asset's own OB entry id, **NOT NULL on this path** (P8 linkage pin).
- Immutability: new trigger `t_fixed_assets_immutable_0017` — after a row is linked
  to an approved OB entry, UPDATEs are refused except an allowlist
  (`disposed_at`, `status`, `updated_at` — Wave D's disposal surface); corrections
  ride K6 supersede (reversal pair + a replacement asset row), never edits. Add
  `updated_at timestamptz` (absent as-built).

**K9 — the per-asset tie assertion (P8).** `clara._assert_fa_baseline(p_seed uuid)` —
ungranted internal, called inside K5 step 4 alongside the TB tie: for every
`item_kind='fixed_asset'` item, the OB entry's lines must satisfy, per asset: debit on
the asset account = `cost_cents`; credit on the accum account =
`accumulated_depreciation_cents`; NBV (cost − accum − residual floor respected via
`ck_fa_residual`) consistent with the OBE contra — so Wave D's `run_depreciation`
continues from NBV and never re-charges the past. Wave B seeds NO depreciation
postings and computes NO depreciation (FA workflows are Wave D).

**K10 — the dated TB read fn.** `trial_balance_as_of(p_client uuid, p_as_of date)
returns table(account_code text, name text, debit_cents bigint, credit_cents bigint)`
— NEW sibling; SECURITY **INVOKER** (RLS-scoped), `set search_path = clara, pg_temp`,
copies the 1-arg body shape (0004:730-741) adding `and je.posting_date <= p_as_of`;
the `status='approved'` filter verbatim; a dry-run variant flag is NOT added — K4's
dry-run assembles draft-inclusive figures itself. **Never CoR the 1-arg
`trial_balance`** (the pack body + its 0016 prosrc assert reference it). GRANT
`clara_authenticated` + `clara_runtime` (the L4 watch); NO agent grant.

**K11 — SST-watch interplay (none-but-constrains; tested).** Every K3/K6 entry
carries `is_opening_balance=true` ⇒ excluded from the SST turnover base
(0016:550-552,600) and `coverage_complete` flips false for the client — EXPECTED in
Gate K (the RPR watch's proven figures — RM 1,310,276.40 — must be bit-unchanged by a
carry-down on another client, and unchanged on RPR itself by the incremental lane's
OB-flagged entries). Blind test: approve a carried set → `evaluate_sst_watch` figures
unchanged; coverage flag flipped; the missing-history surfacing is correct behavior.

**K12 — the B-12 incremental lane (WB-R16's RPR vehicle).**
`reopen_opening_seed(p_seed uuid, p_reason text, p_op_key text)` — admin+, GRANT
clara_authenticated: flips `'finalized'→'open'` (audited, evented
`opening_seed.reopened`; the K1 unique is untouched — same registry row, so the
double-seed RAISE holds forever); additive per-item K3 drafts under the SAME `as_of`;
the next K5 batch (`batch_n+1`) re-asserts the tie over the WHOLE opening set. The
plan's `'still to capture'` checklist (O5 items) drives what remains; a client
onboarded without carry-down (first-year or deferred) enters here later — the RPR
incremental variant runs THIS lane against its real management accounts
(`tie_document` kind `'management_account'`).

**K13 — sighting quarantine (WB-R2 negative, structural).** The K5/K6 approval path
contains NO `rule_sightings` insert and NO proposal loop — asserted two ways: the G5
prosrc scan (`approve_opening_seed` / `_approve_opening_entry` /
`approve_opening_correction` bodies contain no `'insert into clara.rule_sightings'`
and no `'kb_rule'` literal), and the blind rig test: approve a carried AR item whose
control leg is counterparty-stamped ⇒ `rule_sightings` row count unchanged (zero from
prior GL, ever; the S/P pool stays empty by design).

**K14 — carry-down errcode + refusal vocabulary (provisional — build lane verifies
the next free CLR numbers against as-built before cutting).** CLR30 = the
opening-seed family: `{reason}` payloads `duplicate_seed` (K1 unique mapped),
`tie_mismatch` (K4), `obe_not_nil`, `stale_plan`, `revision_mismatch`,
`checker_required` (CLR05 semantics carried where the ladder demands the distinct
checker), `not_serializable`, `registry_not_open`, `depreciation_method_unsupported`
(FORK-7). Existing codes reused where the class exists: CLR02 provenance, CLR05
checker, CLR10 validation, CLR11 firm, CLR26 question block, CLR13-style state
immutability.

---

## Block S — bulk seeding from prior GL (B5: proposal batches, the tick-list ceremony, mass birthing)

**S1 — the typed proposal-batch objects (WB-R2: the proposal object IS the landing
state; the C-11 candidate tier stays dead).** Full RLS posture, composite firm/client
FKs:

- `seeding_batches(id uuid pk, firm_id, client_id, source_document_id uuid not null
  fk documents, source_sha256 text not null CHECK '^[0-9a-f]{64}$', state text not
  null default 'open' CHECK IN ('open','completed','cancelled'), stats jsonb not null
  default '{}', created_by uuid null (runtime lane — the parsing consumer; null =
  system), created_at, completed_at/cancelled_at per-state CHECKs)` — partial unique
  `(client_id, source_sha256) where state='open'` (one open batch per source).
- `seeding_proposals(id uuid pk, batch_id fk, firm_id, client_id, proposal_kind text
  not null CHECK IN ('vendor_account_rule','counterparty_birth','wiki_fact'),
  payload jsonb not null (proposed counterparty name/registration, account_code,
  narrative), evidence jsonb not null (**provenance + frequency metrics live ON THE
  PROPOSAL** — P10: occurrence count, date span, prior-GL line cites; NEVER a
  confidence on the rule — a live rule's authority is the human signature alone),
  state text not null default 'proposed' CHECK IN
  ('proposed','ticked','declined','refused'), decided_by uuid, decided_at, decide
  fields all-or-nothing per state, refuse_reason text (required iff 'refused'),
  resulting_rule_id uuid null, resulting_counterparty_id uuid null, created_at)` —
  unique `(batch_id, proposal_kind, dedupe key)` via `proposal_key text not null` +
  `unique (batch_id, proposal_key)`.
- **Refused-at-parse floor (the t_coding_rules trigger pre-check, moved to proposal
  time):** a mapping targeting a control-class account (`account_class in
  ('payable','receivable')`) lands `state='refused'`, `refuse_reason='control_account'`
  at batch creation — never surfaces as tickable (the 0016:3139-3159 floor would
  reject it at sign anyway; refusing early is the WB-R2 "refused/re-mapped at proposal
  time" pin).

**S2 — the prior-GL parse lane `[FORK-4 lean: add the kind]`.** Swap
`documents_document_kind_check` (NAMED, 0014:64-69 precedent — drop by name, re-add
SAME name) adding `'prior_gl'` (18 → 19 kinds). Because the vocabulary is DUPLICATED
in fn bodies: re-create `classify_document` AND `set_document_kind` with the widened
whitelist (verbatim 19-value list; `'clara-classify-human:v1'` stays reserved;
consent_evidence stays CLR28-protected both directions) + prosrc tail asserts
(`position('prior_gl')`). The facts gate is NOT widened — a `'prior_gl'` document
terminal-skips `invoice_facts` as `skipped_kind` (correct; the seeding reader is a NEW
consumer over `document_extractions`/`document_regions`, runtime-lane, firm
hard-scoped, consent_evidence excluded). Spreadsheet prior-GL never reaches classify
(pdf/image-only enqueue) — the onboarding staff stamps it via `set_document_kind`
(required by O8 row 6 anyway). Batch mint: `create_seeding_batch(p_client uuid,
p_document uuid, p_proposals jsonb, p_op_key text) returns jsonb` — **GRANT
clara_runtime ONLY** (the parse consumer / interview step; zero wake rows — the
allowlist law); document must be `'prior_gl'` (or `'management_account'` by explicit
arg), FILED to the client (active or onboarding — O8 row 10); idempotent on the batch
partial unique + op_receipts.

**S3 — mass counterparty birthing (order-of-operations law).** Birthing PRECEDES rule
minting (the 0016 BEFORE INSERT trigger refuses a `vendor_account` rule whose
counterparty is not a live canonical VENDOR — merged_into null, retired_at null).
Births ride the EXISTING audited counterparty writers (no new writer class) honoring
the two partial uniques (`uq_counterparties_client_registration`,
`uq_counterparties_client_unregistered_name`) + the normalization CHECKs; kind
`'vendor'` for rule targets. Seeding-derived aliases ride `origin='human'` (the tick
IS the human act — no CHECK swap on `counterparty_aliases.origin`); one live alias per
(client, normalized name) is the dedupe floor (`uq_counterparty_aliases_live_name`).
A `counterparty_birth` proposal's tick births the counterparty (+aliases) and stamps
`resulting_counterparty_id`; a `vendor_account_rule` tick for an unbirthed
counterparty births it FIRST in the same call (deterministic order inside one txn).

**S4 — the tick-list ceremony fns (each tick mints ONE real per-rule signature;
WB-R2's "an admin ticks").** `tick_seeding_proposal(p_proposal uuid, p_op_key text)
returns jsonb` — `_human_ctx(role_rank('admin'))` (the WB-R2 floor — deliberately
ABOVE the as-built bookkeeper+ `sign_coding_rule` floor; the ceremony fn enforces
admin, the underlying lane is unchanged), GRANT clara_authenticated ONLY. One tick,
one txn: birth-if-needed (S3) → propose + sign ONE `vendor_account` rule through the
EXISTING lane semantics (`ck_coding_rules_terminal` satisfied: `signed_by = the
ticking admin`, `signed_at = now()`, status `'live'`; `uq_coding_rules_one_live_vendor`
duplicate maps to CLR27 `duplicate_live` exactly as `sign_coding_rule` does at
0016:3118-3127; the 0016 insert trigger floor applies verbatim) → proposal
`state='ticked'`, `resulting_rule_id` stamped → receipt. **N independent calls with
fresh op_keys** (the BatchApprove doctrine — one refusal never poisons the batch;
there is NO bulk-tick fn, by design). `decline_seeding_proposal(p_proposal, p_reason,
p_op_key)` — admin+; `complete_seeding_batch(p_batch, p_op_key)` / cancel — admin+;
unticked proposals simply STAY `'proposed'` (open proposals, the WB-R2 landing
state). NO autopost rules from seeding EVER — `proposal_kind` has no autopost value
and the tick fn's prosrc contains no `'autopost'` literal (G5-asserted).

**S5 — structural negatives (WB-R2/P10, tail-asserted + blind-tested).** (1) NO
sightings from prior GL: no S-block fn's prosrc contains `'insert into
clara.rule_sightings'`; blind test — a full parse→batch→tick cycle leaves
`rule_sightings` count unchanged. (2) NO `'@1.000'` idiom: `coding_rules` gains ZERO
new columns; all metrics live on `seeding_proposals.evidence`; the rule's authority
is `signed_by`/`signed_at` alone. (3) NO candidate tier: `coding_rules_status_check_
0016` is NOT swapped; no `'candidate'` value anywhere. (4) A seeded rule participates
in live coding under its signature exactly like a hand-signed rule (Gate R2 — no
marker distinguishes it on the rule row; lineage lives on the proposal's
`resulting_rule_id`).

**S6 — wiki seeding hookup (B1 precedes B5).** The seeder's knowledge output rides
the W3 writers: deterministic ingest (`record_wiki_source_ingest`) for the prior-GL
document itself; `wiki_fact` proposals that an admin ticks dispatch
`publish_wiki_page_version` (runtime) with `prior_gl_line` citations; model synthesis
over prior-GL content is consent-gated per W9 (deterministic lane works without).
Prior-GL free text is INERT DATA everywhere (the C-1 injection law) — parse output is
typed rows + cited pages, never instructions.

**S7 — seeding events + receipts.** Event types (additive-pair, all client-scoped,
decision `'ignore'`): `seeding.batch_created`, `seeding.proposal_decided` (one per
tick/decline — human-paced, bounded), `seeding.batch_completed`. Every S writer rides
`_reserve_op`/`_finish_op`; `_append_event` LAST. CLR33 (provisional, K14 caveat) =
the seeding family: `duplicate_batch`, `not_prior_gl`, `batch_not_open`,
`proposal_not_open`, `control_account` (parse-time refusal reason), with CLR27
`duplicate_live` passed through verbatim from the sign lane.

---
*(Continued in `wave-b-migration-0017-design-part3.md` — Blocks L, G, prestate
fixtures, rig battery map, post-verify checklist, v25 consumers.)*
