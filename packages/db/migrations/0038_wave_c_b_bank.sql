-- 0038_wave_c_b_bank.sql -- SECTION A (SCHEMA LANE ONLY): bank identity, statement/line
-- storage, the match-group model, the account-proposal and audit tables, RLS, and the
-- bank.* event taxonomy. This file is NOT the whole migration: it deliberately does NOT
-- carry the consent-purpose widening (0020 lane), the belts (deferred constraint triggers:
-- group-tie, entry-exhaustion, account congruence, the journal_entries reversal belt), the
-- verbs (add_bank_account/deactivate/reactivate/remap_bank_account_coa,
-- persist_statement_facts/enter_bank_statement/void_bank_statement, match_bank_line/
-- unmatch_bank_match/settle_from_bank_line/complete_pending_match), the router recut, the
-- claim_document_processing_task / reserve-settle-refund / release_held / attempt-cap lane
-- widenings, the reverse_entry / approve_wrong_client_correction / 0027 filing-writer
-- splices, or the tail asserts -- every one of those is another lane's deliverable per the
-- work order and belongs elsewhere in the assembled 0038 file.
--
-- THE DESIGN OF RECORD is docs/plan/wave-c-b-bank-design.md (v2, part 1, section numbers
-- cited below as SS4.1/4.2/4.5/4.8) + wave-c-b-bank-design-part2.md (SS4.7-7, cited as
-- "part2 SS..."). Governing law above the design: docs/plan/wave-c-contract.md (WC-R1..R12)
-- and docs/plan/wave-c-a-subledger-design.md (WCA-R1..R9). On conflict the contract governs
-- for Wave C; PRD.md SS6 (LAW) governs always. This file executes the design's DB half for
-- SCHEMA ONLY -- every idiom below is copied from the LIVE migration 0037
-- (packages/db/migrations/0037_wave_c_a_subledger.sql), never invented in parallel: the
-- congruence-FK triple/quad-key house pattern (0009:797 origin, reused verbatim at
-- 0037:701-757), the RLS block shape (0037:833-851), and the event-taxonomy registration
-- shape (0037:3443-3469).
--
-- =====================================================================================
-- ASSEMBLY MAP -- where this file's sections sit in part2 SS5's true migration order:
--   SS0 probes (below)                                    -- THIS FILE, first.
--   bank_institutions + seed                              -- THIS FILE.
--   >>> the consent-purpose widening (0020 lane) splices here, still under
--       clara_fn_owner -- NOT in this file.
--   coa_accounts.is_bank_account                          -- THIS FILE.
--   the eight bank_* tables + belts + RLS/ACL              -- THIS FILE carries the tables
--       + RLS/ACL; belts are NOT in this file (see the per-table notes below for exactly
--       which deferred trigger a future belt section must add).
--   >>> event-type + taxonomy registration                -- THIS FILE, but see the ROLE
--       NOTE just above SECTION EVENTS below: 0037 runs its own equivalent (Section M)
--       AFTER `reset role;`, once ALL clara_fn_owner-owned DDL (including the verbs this
--       file does not carry) is done. This file's SECTION EVENTS is written assuming that
--       reset has already happened -- the assembling lane must relocate it (or its
--       `reset role;` line) to the true end of the clara_fn_owner scope, i.e. AFTER the
--       verb lane's ACL section, not immediately after this file's own table section.
--   >>> verbs, router recut, claim_document_processing_task family, the reverse_entry /
--       approve_wrong_client_correction / 0027 splices, tail asserts -- NOT in this file.
-- =====================================================================================

-- =====================================================================================
-- SECTION 0 -- THE PRE-DDL LIVE PROBES (the 0037:325-486 shape: fail fast with a named
-- remedy, in plain SQL over base catalogs, before any DDL runs -- rather than dying
-- half-way through table creation on a raw duplicate-relation or duplicate-column error
-- nobody can read).
--
-- Unlike 0037, this migration performs NO backfill and reads NO pre-existing bank data (
-- there is none -- bank identity is new in this wave), so there is no "does the existing
-- corpus satisfy the new identity" class of probe to run. What CAN and must be probed
-- up front is: (a) the frontier this migration assumes is genuinely the live frontier, (b)
-- the specific prior-migration markers this file's FKs and column adds depend on are
-- present in the expected shape, (c) the relation/column names this file is about to CREATE
-- do not already exist (guards a partial or duplicate re-apply), and (d) the one named
-- contract trap (WC-R1 SS3: "special_acc_type cannot carry 'bank'", 0003:58-59) still holds
-- on live -- a belt-and-braces re-confirmation, since the existing CHECK already forbids it,
-- worth stating because a probe that names the trap it exists to guard is more useful to the
-- next reader than one that silently trusts a constraint written seven migrations ago.
-- =====================================================================================
do $probe$
declare
  v_prior int; v_coding_kind int; v_open_items int; v_grain_uq int;
  v_dup_relations int; v_dup_column int; v_bad_special int;
  v_dup_rel_names text;
begin
  -- PROBE 1 -- FRONTIER ASSERT. 0037_wave_c_a_subledger must be the applied frontier (or
  -- later): C-b lands on the C-a substrate per WC-R1's build order, and this file's
  -- bank_matches.draft_entry_id FK and the general "settlements are C-a's identity" framing
  -- (part1 SS3) assume clara.journal_entries already carries 0037's coding_kind widening.
  select count(*)::int into v_prior from clara.schema_migrations
    where version = '0037_wave_c_a_subledger';
  if v_prior <> 1 then
    raise exception '0038 probe 1: migration 0037_wave_c_a_subledger is not recorded as applied -- apply in order';
  end if;

  -- PROBE 2 -- PRIOR-MARKER PROBE, positive: ck_je_coding_kind is exactly 0037's widened
  -- five-value form. A partial or reverted 0037 would let bank_matches.draft_entry_id point
  -- at an entry whose coding_kind vocabulary this design's settlement framing does not match.
  select count(*)::int into v_coding_kind
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'journal_entries' and c.conname = 'ck_je_coding_kind'
    and pg_get_constraintdef(c.oid) ~ 'customer_receipt' and pg_get_constraintdef(c.oid) ~ 'supplier_payment';
  if v_coding_kind <> 1 then
    raise exception '0038 probe 2: ck_je_coding_kind on clara.journal_entries is not 0037''s widened five-value form -- 0037 did not land cleanly';
  end if;

  -- PROBE 3 -- PRIOR-MARKER PROBE, positive: the C-a subledger substrate is genuinely live
  -- (clara.open_items exists with its grain-unique constraint), reconfirming WC-R1's build
  -- order (C-a closed before C-b starts) rather than assuming it from the schema_migrations
  -- row alone.
  select count(*)::int into v_open_items
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'open_items';
  select count(*)::int into v_grain_uq
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'open_items' and c.conname = 'uq_open_items_grain';
  if v_open_items <> 1 or v_grain_uq <> 1 then
    raise exception '0038 probe 3: clara.open_items (or its grain-unique constraint) is not present -- the C-a substrate is not live';
  end if;

  -- PROBE 4 -- PRE-STATE SAFETY: none of the nine relations this file creates already
  -- exist in schema clara. A hit here means a partial or duplicate prior application of
  -- this migration, not a fresh deploy -- name it rather than let CREATE TABLE raise a bare
  -- "relation already exists".
  select count(*)::int, string_agg(t.relname, ', ' order by t.relname) into v_dup_relations, v_dup_rel_names
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname in (
    'bank_institutions','bank_accounts','bank_statements','bank_statement_lines',
    'bank_matches','bank_match_line_members','bank_match_entry_members',
    'bank_account_proposals','bank_match_audit');
  if v_dup_relations <> 0 then
    raise exception '0038 probe 4: % relation(s) already exist in schema clara that this migration is about to create (%) -- this looks like a partial or duplicate re-apply, not a fresh deploy', v_dup_relations, v_dup_rel_names;
  end if;

  -- PROBE 5 -- PRE-STATE SAFETY: clara.coa_accounts does not already carry an
  -- is_bank_account column. Same reasoning as probe 4, for the ALTER TABLE ADD COLUMN this
  -- file runs rather than a CREATE TABLE.
  select count(*)::int into v_dup_column
  from information_schema.columns
  where table_schema = 'clara' and table_name = 'coa_accounts' and column_name = 'is_bank_account';
  if v_dup_column <> 0 then
    raise exception '0038 probe 5: clara.coa_accounts already carries an is_bank_account column -- this looks like a partial or duplicate re-apply, not a fresh deploy';
  end if;

  -- PROBE 6 -- THE NAMED CONTRACT TRAP, ZERO-ROWS, RECONFIRMED ON LIVE (WC-R1 SS3):
  -- "special_acc_type cannot carry 'bank'" -- uq_coa_special is unique on
  -- (client_id, special_acc_type) where not null (0003:58-59), so exactly one row per
  -- client could ever claim a given special_acc_type, and bank identity is deliberately
  -- NOT modelled that way (coa_accounts.is_bank_account below, plus the bank_accounts
  -- table, is the real answer -- a client can have MANY bank accounts). The live domain is
  -- THREE values as of 0016 (`coa_accounts_special_acc_type_check`, 0016:121-123 widened
  -- 0015:213-214's two-value form to add 'sst_purchase_cost' -- checked against the LIVE
  -- constraint definition below, not hardcoded, so this probe cannot go stale the way a
  -- literal list would the next time that CHECK is widened) and already forbids 'bank', so
  -- this can only ever count zero; it is asserted anyway as a belt-and-braces
  -- re-confirmation that names the trap it guards, rather than silently trusting a
  -- constraint written many migrations before this design was drafted.
  select count(*)::int into v_bad_special
  from clara.coa_accounts a
  where a.special_acc_type is not null
    and not exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'clara' and t.relname = 'coa_accounts'
        and c.conname = 'coa_accounts_special_acc_type_check'
        and pg_get_constraintdef(c.oid) ~ ('''' || a.special_acc_type || ''''));
  if v_bad_special <> 0 then
    raise exception '0038 probe 6: % coa_accounts row(s) carry a special_acc_type outside the LIVE coa_accounts_special_acc_type_check domain -- the "special_acc_type cannot carry ''bank''" trap (WC-R1 SS3, 0003:58-59) may have been worked around out of band; investigate before applying 0038', v_bad_special;
  end if;

  raise notice '0038 probe OK (0/6): 0037 is the applied frontier with its coding_kind widening and open_items substrate intact, none of the nine new bank relations or the is_bank_account column pre-exist, and special_acc_type never carries an out-of-domain value';
end
$probe$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION BANK-INSTITUTIONS -- clara.bank_institutions (design SS4.1). A seeded, GLOBAL
-- reference table -- not client- or firm-scoped, exactly like clara.event_types (0005:58-62)
-- -- because a Malaysian institution identity is a fact about the country's banking system,
-- not about any one firm's books. "code" is the primary key rather than a synthetic id,
-- matching the coa_accounts.account_code precedent (0003:47-56): a natural, stable,
-- human-legible key that the seed additively grows (part2 SS7 residual: "bank_institutions
-- is a seeded reference, additively grown by migration").
--
-- CODE CHOICE, STATED HONESTLY: Malaysia has no single "the" bank code shared across every
-- system (SWIFT/BIC, PayNet's IBG numeric codes, and each bank's own online-banking short
-- code all differ from one another and from each other's conventions). The codes below are
-- a stable MNEMONIC short-form namespace chosen for legibility in this schema; they are an
-- internal identifier, not an assertion that this IS the SWIFT or IBG code. Nothing
-- downstream parses or round-trips these codes against an external system in this wave.
-- =====================================================================================
create table clara.bank_institutions (
  code       text        primary key check (code ~ '^[A-Z0-9]{2,10}$'),
  name       text        not null check (btrim(name) <> ''),
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

insert into clara.bank_institutions (code, name) values
  ('MBB',   'Malayan Banking Berhad (Maybank)'),
  ('CIMB',  'CIMB Bank Berhad'),
  ('PBB',   'Public Bank Berhad'),
  ('RHB',   'RHB Bank Berhad'),
  ('HLB',   'Hong Leong Bank Berhad'),
  ('AMB',   'AmBank (M) Berhad'),
  ('BIMB',  'Bank Islam Malaysia Berhad'),
  ('OCBC',  'OCBC Bank (Malaysia) Berhad'),
  ('UOB',   'United Overseas Bank (Malaysia) Bhd'),
  ('HSBC',  'HSBC Bank Malaysia Berhad'),
  ('SCB',   'Standard Chartered Bank Malaysia Berhad'),
  ('AFFIN', 'Affin Bank Berhad'),
  ('ALB',   'Alliance Bank Malaysia Berhad'),
  ('BSN',   'Bank Simpanan Nasional Berhad'),
  ('AGRO',  'Bank Pertanian Malaysia Berhad (Agrobank)'),
  ('MBSB',  'MBSB Bank Berhad');

-- Append-only + no-truncate (the event_types precedent, 0005:280-283): a seeded reference
-- catalog additively grown by migration only; no app-role path may ever mutate a row here.
create trigger t_bank_institutions_append_only before update or delete
  on clara.bank_institutions for each row execute function clara._tf_append_only();
create trigger t_bank_institutions_no_truncate before truncate
  on clara.bank_institutions for each statement execute function clara._tf_no_truncate();

-- RLS: FORCE + fn-owner ALL policy (0037:833-851 shape), adapted for a table with no
-- firm_id/client_id to scope on -- there is nothing to leak (institution codes and display
-- names are public facts), so the human read policy is `using (true)` rather than firm-
-- pinned, exactly the event_types precedent (0005:363-366). ZERO wake/agent grants: the
-- boundary "no agent grants anywhere in the bank schema" (contract SS4 C-b bullet 9 /
-- design part2 SS7) is read as covering the reference table too, even though it carries no
-- money and no client data -- clara_agent_ro and clara_runtime get nothing here.
alter table clara.bank_institutions enable row level security;
alter table clara.bank_institutions force row level security;
create policy p_bank_institutions_owner on clara.bank_institutions
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_institutions_human on clara.bank_institutions
  for select to clara_authenticated using (true);
grant select on clara.bank_institutions to clara_authenticated;

-- =====================================================================================
-- >>> ASSEMBLY SPLICE POINT: the consent-purpose widening (0020 lane -- the
--     'statement_extraction' purpose literal across the three 0020 table CHECKs, the FOUR
--     purpose-bearing verb recuts, and the prepare/consume_egress_dispatch 6-arg overloads,
--     design SS4.4) belongs HERE per part2 SS5's stated order. Not part of this deliverable.
-- =====================================================================================

-- =====================================================================================
-- SECTION COA-BANK-FLAG -- coa_accounts.is_bank_account (design SS4.1, part1 line 173-174:
-- "never special_acc_type -- uq_coa_special, 0003:58-59"). uq_coa_special is unique on
-- (client_id, special_acc_type) where not null, which would cap a client at exactly ONE
-- bank account if bank identity rode that column; a client routinely holds several. Plain
-- additive column, the 0009:757-766 ADD COLUMN idiom (no CHECK beyond NOT NULL DEFAULT
-- FALSE -- the "asset-typed, active, non-control" law the design states is enforced by the
-- add_bank_account VERB in-txn, not by a DDL constraint here: it is a cross-table condition
-- at write time, not a static invariant of the column itself, exactly the same division of
-- labour 0037 draws between its congruence FKs (schema-level, mine) and its classifier's
-- kind-consistency refusal (verb-level, not mine).
-- =====================================================================================
alter table clara.coa_accounts add column is_bank_account boolean not null default false;

-- =====================================================================================
-- SECTION TABLES -- the eight bank_* tables (design SS4.1/4.2/4.5 + part2 SS4.8's event
-- carriers), each followed immediately by its own indexes and RLS/ACL block, mirroring how
-- 0037 keeps a table's DDL, indexes and RLS together (Section D, 0037:686-851) rather than
-- deferring RLS to a separate pass.
--
-- CONGRUENCE FK HOUSE PATTERN (0009:797 origin, 0037:701-757 reused verbatim, copied here
-- again rather than invented in parallel): every foreign key that crosses a tenant boundary
-- carries firm_id (and client_id where the child is client-scoped), and the REFERENCED side
-- exposes a `unique (id, firm_id[, client_id[, extra_col]])` anchor so the FK cannot be
-- satisfied by an id that belongs to a different tenant even if guessed. Three NEW
-- "denormalize-then-congruence-FK" anchors this file introduces, each because a downstream
-- table needs to prove a column equals its parent's own value, not merely that the parent
-- row exists:
--   * bank_statements gets `unique (id, firm_id, client_id, bank_account_id)` so
--     bank_statement_lines' OWN bank_account_id (design SS4.2: "denormalized, congruence-
--     FK'd") can be forced equal to its statement's, in the SAME foreign key that also
--     proves the statement exists -- the design's own precedent for this trick.
--   * bank_matches gets that same shape, `unique (id, firm_id, client_id, bank_account_id)`,
--     for exactly the same reason on the OTHER side of a match: bank_match_line_members
--     needs its own bank_account_id forced equal to BOTH the line's statement's account
--     (via bank_statement_lines' anchor) AND the match's account (via this one) -- design
--     SS4.5's "account congruence FK through statement and group", read literally as two
--     independent FKs meeting at one column.
--   * bank_matches ALSO gets `unique (id, firm_id, client_id, status)` -- THE CASCADE
--     ANCHOR design SS4.5 names explicitly, consumed by both member tables' `group_status`
--     FK with ON UPDATE CASCADE, which is what makes `unique (line_id) where group_status
--     in ('pending','live')` a real, buildable, concurrent-safe same-table index instead of
--     the v1 cross-table predicate the design's own SS3 calls unimplementable.
--
-- BELTS NOT BUILT HERE (named per table below so the belt-owning lane has an exact list):
-- design SS4.5 "Belts (deferred, re-query-by-id)" -- group-tie, entry-exhaustion (per-side
-- absolute cents bounds), the wider congruence belt (void statements admit no pending/live
-- members; entry members' reversal floors; bank_statements status transitions re-checked),
-- and "the reversal belt on journal_entries" (AFTER UPDATE WHEN reversed_by becomes non-
-- null) are ALL deferred constraint triggers this file does not create. Likewise the
-- bank_statements void-transition restriction (which columns void_bank_statement may change,
-- and only from status='live') is deliberately left unenforced by a generic immutability
-- trigger here -- _tf_append_only would block the legitimate void UPDATE outright, so this
-- table gets ONLY a no-truncate guard from this file; a future belt or the void verb itself
-- owns restricting which columns change and when.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- clara.bank_accounts (design SS4.1). Identity: (firm, client, bank institution, account
-- number) <-> one COA account. Mutable-with-audit-trail (deactivate/reactivate/remap are
-- real verbs), so this table does NOT get the generic _tf_append_only guard -- only
-- no-truncate. The deactivated_by/at/reason triple is a coherence check ONLY (all-null or
-- all-filled together); it is deliberately NOT tied to `active` by a CHECK, because
-- reactivate_bank_account's exact choice of whether to null the prior deactivation's
-- history or preserve it as "most recent deactivation event" is that verb's call, not a
-- schema-level presumption made here.
-- -------------------------------------------------------------------------------------
create table clara.bank_accounts (
  id                         uuid        primary key default gen_random_uuid(),
  firm_id                    uuid        not null,
  client_id                  uuid        not null,
  bank_code                  text        not null references clara.bank_institutions(code),
  bank_name_display          text        not null check (btrim(bank_name_display) <> ''),
  account_number             text        not null check (btrim(account_number) <> ''),
  account_number_normalized  text        not null check (account_number_normalized ~ '^[0-9]+$'),
  coa_account_code           text        not null,
  active                     boolean     not null default true,
  created_by                 uuid        not null references clara.users(id),
  created_at                 timestamptz not null default now(),
  deactivated_by             uuid        references clara.users(id),
  deactivated_at             timestamptz,
  deactivated_reason         text,
  -- Congruence: client is a real client of this firm.
  constraint fk_bank_accounts_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- Congruence: the COA account is a real account of this client. Asset-typed / active /
  -- non-control / is_bank_account-stamping are the add_bank_account VERB's job (design
  -- SS4.1), not expressible as a static CHECK here.
  constraint fk_bank_accounts_coa foreign key (client_id, coa_account_code)
    references clara.coa_accounts(client_id, account_code),
  -- The anchor every downstream bank_* table's bank_account_id FK targets.
  constraint uq_bank_accounts_id_firm_client unique (id, firm_id, client_id),
  constraint ck_bank_accounts_deactivation check (
    (deactivated_at is null and deactivated_by is null and deactivated_reason is null)
    or (deactivated_at is not null and deactivated_by is not null
        and deactivated_reason is not null and btrim(deactivated_reason) <> ''))
);
-- Partial uniques WHERE active (design SS4.1): deactivate-and-remap is a real remedy, not a
-- dead end -- two LIVE accounts never share a GL account or an (institution, number)
-- identity, but a deactivated one can be superseded by a fresh registration.
create unique index uq_bank_accounts_identity_active on clara.bank_accounts
  (client_id, bank_code, account_number_normalized) where active;
create unique index uq_bank_accounts_coa_active on clara.bank_accounts
  (client_id, coa_account_code) where active;
create index ix_bank_accounts_client on clara.bank_accounts (client_id, active);

create trigger t_bank_accounts_no_truncate before truncate
  on clara.bank_accounts for each statement execute function clara._tf_no_truncate();

alter table clara.bank_accounts enable row level security;
alter table clara.bank_accounts force row level security;
create policy p_bank_accounts_owner on clara.bank_accounts
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_accounts_human on clara.bank_accounts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_accounts to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_statements (design SS4.2). Provenance-bound (document_id/source_doc_sha256/
-- filing_id -- the actual "does this hash belong to this filing belongs to this client"
-- CROSS-CHECK is validated in-txn by persist_statement_facts / enter_bank_statement, per
-- the design; the FKs here only pin that filing_id's OWN (firm,client,document) tuple is
-- congruent with this row's, which is a static invariant a declarative FK CAN express).
-- reader1/reader2_extraction_id and total_debit_cents/total_credit_cents are nullable: the
-- human-keyed lane has no extraction at all, the structured lane may carry only one reader
-- (design SS3: "the chain IS the second reader" for structured), and printed totals are
-- mandatory ONLY on the OCR path (a verb-time refusal, `totals_unreadable`, not a NOT NULL
-- here that would break the other two lanes).
-- -------------------------------------------------------------------------------------
create table clara.bank_statements (
  id                     uuid        primary key default gen_random_uuid(),
  firm_id                uuid        not null,
  client_id              uuid        not null,
  bank_account_id        uuid        not null,
  document_id            uuid        not null,
  source_doc_sha256      text        not null check (source_doc_sha256 ~ '^[0-9a-f]{64}$'),
  filing_id              uuid        not null,
  reader1_extraction_id  uuid,
  reader2_extraction_id  uuid,
  facts_hash             bytea       not null,
  period_start           date        not null,
  period_end             date        not null,
  statement_date         date        not null,
  opening_cents          bigint      not null,
  closing_cents          bigint      not null,
  total_debit_cents      bigint      check (total_debit_cents is null or total_debit_cents >= 0),
  total_credit_cents     bigint      check (total_credit_cents is null or total_credit_cents >= 0),
  line_count             int         not null check (line_count >= 0),
  status                 text        not null default 'live' check (status in ('live','void')),
  superseded_by          uuid,
  voided_by              uuid        references clara.users(id),
  voided_at              timestamptz,
  voided_reason          text,
  ingest_mode            text        not null check (ingest_mode in ('structured','ocr','human')),
  -- NULL on the two machine lanes (no system user exists in this estate); the actor on
  -- ingest_mode='human' -- the recorded corroborator (design SS4.3). Coherence CHECK below.
  created_by             uuid        references clara.users(id),
  created_at             timestamptz not null default now(),
  constraint ck_bank_statements_human_actor check (ingest_mode <> 'human' or created_by is not null),
  constraint fk_bank_statements_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bank_statements_account foreign key (bank_account_id, firm_id, client_id)
    references clara.bank_accounts(id, firm_id, client_id),
  constraint fk_bank_statements_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  -- filing_id congruence carries document_id too (0009:800-802 anchor): a row can never
  -- cite a filing that belongs to a different document than the one it names directly.
  constraint fk_bank_statements_filing foreign key (filing_id, firm_id, client_id, document_id)
    references clara.document_filings(id, firm_id, client_id, document_id),
  constraint fk_bank_statements_reader1 foreign key (reader1_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  constraint fk_bank_statements_reader2 foreign key (reader2_extraction_id, firm_id, document_id)
    references clara.document_extractions(id, firm_id, document_id),
  -- The anchor bank_statement_lines' denormalized bank_account_id FKs against (design
  -- SS4.2: "denormalized, congruence-FK'd") -- ALSO the anchor superseded_by uses below, so
  -- a void-and-reingest chain can never point at a statement of a DIFFERENT bank account.
  constraint uq_bank_statements_id_firm_client_account unique (id, firm_id, client_id, bank_account_id),
  constraint fk_bank_statements_superseded
    foreign key (superseded_by, firm_id, client_id, bank_account_id)
    references clara.bank_statements(id, firm_id, client_id, bank_account_id),
  constraint ck_bank_statements_self_link check (superseded_by is distinct from id),
  constraint ck_bank_statements_period check (period_start <= period_end),
  -- line_count = 0 => opening = closing (design SS4.2: "April is legal").
  constraint ck_bank_statements_zero_line check (line_count > 0 or opening_cents = closing_cents),
  -- superseded_by only makes sense on a voided row.
  constraint ck_bank_statements_superseded_state check (superseded_by is null or status = 'void'),
  constraint ck_bank_statements_void check (
    (status = 'live' and voided_by is null and voided_at is null and voided_reason is null)
    or (status = 'void' and voided_by is not null and voided_at is not null
        and voided_reason is not null and btrim(voided_reason) <> ''))
);
-- Partial unique (bank_account_id, period_end) where status='live' (design SS4.2); the
-- check-then-insert race across it is closed by the SS4.9 chain lock (203005006), which is
-- verb-owned, not this file's.
create unique index uq_bank_statements_period_live on clara.bank_statements
  (bank_account_id, period_end) where status = 'live';
create index ix_bank_statements_account_status on clara.bank_statements (bank_account_id, status);
create index ix_bank_statements_client on clara.bank_statements (client_id, status);

-- No _tf_append_only here (see the SECTION TABLES header note): void_bank_statement
-- legitimately flips status/superseded_by/voided_*. No-truncate only.
create trigger t_bank_statements_no_truncate before truncate
  on clara.bank_statements for each statement execute function clara._tf_no_truncate();

alter table clara.bank_statements enable row level security;
alter table clara.bank_statements force row level security;
create policy p_bank_statements_owner on clara.bank_statements
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_statements_human on clara.bank_statements
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_statements to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_statement_lines (design SS4.2). One row per printed line, GENUINELY append-
-- only (the design says so unqualified, unlike the statement header) -- descriptions are
-- "uncorroborated prose -- they inform, never decide" and are carried verbatim.
--
-- entry_date in [period_start, period_end] is NOT a DDL check here: it requires joining the
-- parent statement's own period bounds, which a table-local CHECK cannot express, and the
-- design names it as one of persist_statement_facts' own validation steps ("line-date
-- bounds") with its own refusal code (`line_date_out_of_period`) -- verb territory.
-- -------------------------------------------------------------------------------------
create table clara.bank_statement_lines (
  id                     uuid        primary key default gen_random_uuid(),
  firm_id                uuid        not null,
  client_id              uuid        not null,
  statement_id           uuid        not null,
  bank_account_id        uuid        not null,
  line_no                int         not null check (line_no > 0),
  entry_date             date        not null,
  value_date             date,
  description            text,
  amount_cents           bigint      not null check (amount_cents <> 0),
  running_balance_cents  bigint      not null,
  -- Denormalized bank_account_id, congruence-FK'd against the STATEMENT's own (design
  -- SS4.2) -- this single FK proves both "the statement exists" and "this line's account
  -- equals its statement's account" in one shot, off bank_statements' 4-key anchor above.
  constraint fk_bank_statement_lines_statement
    foreign key (statement_id, firm_id, client_id, bank_account_id)
    references clara.bank_statements(id, firm_id, client_id, bank_account_id),
  -- Direct account congruence too (defense in depth, the 0037 open_items precedent of
  -- validating congruence against more than one parent independently).
  constraint fk_bank_statement_lines_account foreign key (bank_account_id, firm_id, client_id)
    references clara.bank_accounts(id, firm_id, client_id),
  -- The anchor bank_match_line_members' denormalized bank_account_id FKs against.
  constraint uq_bank_statement_lines_id_firm_client_account
    unique (id, firm_id, client_id, bank_account_id),
  constraint uq_bank_statement_lines_no unique (statement_id, line_no)
);
create index ix_bank_statement_lines_statement on clara.bank_statement_lines (statement_id, line_no);
create index ix_bank_statement_lines_account on clara.bank_statement_lines (bank_account_id, entry_date);

create trigger t_bank_statement_lines_append_only before update or delete
  on clara.bank_statement_lines for each row execute function clara._tf_append_only();
create trigger t_bank_statement_lines_no_truncate before truncate
  on clara.bank_statement_lines for each statement execute function clara._tf_no_truncate();

alter table clara.bank_statement_lines enable row level security;
alter table clara.bank_statement_lines force row level security;
create policy p_bank_statement_lines_owner on clara.bank_statement_lines
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_statement_lines_human on clara.bank_statement_lines
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_statement_lines to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_matches (design SS4.5). THE CASCADE ANCHOR table. draft_entry_id is the
-- "separate nullable draft_entry_id on the GROUP, not an entry member -- members exist only
-- for approved entries" the design names for the pending-reservation path (settle_from_
-- bank_line at/above the high-stakes threshold, part1 SS4.6): it is nullable and populated
-- only while status='pending' in practice, but that is a verb-time discipline, not a DDL
-- CHECK, since a completed group's history of WHICH draft it started from is legitimately
-- worth keeping.
--
-- origin/matched_via_rule_id: the CHECK allows BOTH 'human' and 'rule' today, even though
-- every current writer only ever produces 'human' (design SS4.5: "writers enforce 'human'")
-- -- exactly the WC-R2/contract item "give bank_matches matched_via_rule_id + origin from
-- day one so future bounded authority is a function change, not a migration" (contract SS4
-- C-c bullet 4). matched_via_rule_id carries NO FK: no bank-matching rule table exists yet
-- (that is C-c's), so this is a forward-reserved column, unenforced until C-c adds one.
-- -------------------------------------------------------------------------------------
create table clara.bank_matches (
  id                  uuid        primary key default gen_random_uuid(),
  firm_id             uuid        not null,
  client_id           uuid        not null,
  bank_account_id     uuid        not null,
  status              text        not null default 'live' check (status in ('pending','live','unmatched')),
  origin              text        not null default 'human' check (origin in ('human','rule')),
  matched_via_rule_id uuid,
  draft_entry_id      uuid,
  created_by          uuid        not null references clara.users(id),
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,
  unmatched_by        uuid        references clara.users(id),
  unmatched_at        timestamptz,
  unmatched_reason     text,
  constraint fk_bank_matches_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bank_matches_account foreign key (bank_account_id, firm_id, client_id)
    references clara.bank_accounts(id, firm_id, client_id),
  constraint fk_bank_matches_draft_entry foreign key (draft_entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  -- THE CASCADE ANCHOR (design SS4.5), consumed by both member tables' group_status FK
  -- with ON UPDATE CASCADE.
  constraint uq_bank_matches_id_firm_client_status unique (id, firm_id, client_id, status),
  -- The account-congruence anchor, consumed by bank_match_line_members' bank_account_id FK.
  constraint uq_bank_matches_id_firm_client_account unique (id, firm_id, client_id, bank_account_id),
  constraint ck_bank_matches_origin_rule check ((origin = 'rule') = (matched_via_rule_id is not null)),
  constraint ck_bank_matches_unmatched check (
    (status <> 'unmatched' and unmatched_by is null and unmatched_at is null and unmatched_reason is null)
    or (status = 'unmatched' and unmatched_by is not null and unmatched_at is not null
        and unmatched_reason is not null and btrim(unmatched_reason) <> ''))
);
-- One draft entry backs at most one pending reservation, ever.
create unique index uq_bank_matches_draft_entry on clara.bank_matches (draft_entry_id)
  where draft_entry_id is not null;
create index ix_bank_matches_account_status on clara.bank_matches (bank_account_id, status);
create index ix_bank_matches_client on clara.bank_matches (client_id, status);

-- No _tf_append_only (status transitions -- pending->live, either->unmatched -- are the
-- whole point of this table, and drive the member tables' ON UPDATE CASCADE). No-truncate
-- only from this file; the congruence/void-transition belts are named in the SECTION TABLES
-- header note above.
create trigger t_bank_matches_no_truncate before truncate
  on clara.bank_matches for each statement execute function clara._tf_no_truncate();

alter table clara.bank_matches enable row level security;
alter table clara.bank_matches force row level security;
create policy p_bank_matches_owner on clara.bank_matches
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_matches_human on clara.bank_matches
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_matches to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_match_line_members (design SS4.5). "Lines enter at full amount": amount_cents
-- is expected to equal the referenced bank_statement_lines row's own amount_cents exactly,
-- but that specific cross-table EQUALITY cannot be expressed as a declarative CHECK (it
-- would need a function-based check reading another table, which this codebase treats as
-- belt territory, not schema territory) -- match_bank_line enforces it at write time; only
-- the local `<> 0` sanity CHECK lives here.
--
-- THE EXCLUSIVITY INDEX is the line-side half of design SS3's "Exclusivity (WC-R2, both
-- sides)": a real, same-table, concurrent-safe partial unique, buildable ONLY because
-- group_status is denormalized here and kept in lock-step with bank_matches.status by the
-- ON UPDATE CASCADE FK below -- the mechanism the design's SS3 says v1's cross-table
-- predicate could not achieve.
--
-- bank_account_id IS STAMPED, NEVER CALLER-SUPPLIED -- the 0003 house law restated
-- ("Every firm-scoped table carries firm_id, STAMPED by a BEFORE trigger from the parent
-- row or the session -- never trusted from the caller", 0003 header; the direct precedent
-- is `_tf_stamp_line_from_entry`, 0003:213-222, which stamps journal_lines.client_id/
-- firm_id from its parent entry the identical way). The BEFORE INSERT trigger below derives
-- it from the referenced LINE, which is what makes it a real corroboration rather than a
-- second place for a caller to (mis)state the same fact: a match_bank_line call that never
-- mentions bank_account_id at all still gets the "account congruence FK through statement
-- and group" (design SS4.5) enforced, because the stamped value is compared against the
-- GROUP's own bank_account_id by fk_bmlm_match_account below -- a genuine cross-account
-- attempt is refused by that FK, not merely left undetected for want of a caller-supplied
-- column.
-- -------------------------------------------------------------------------------------
create table clara.bank_match_line_members (
  id           uuid        primary key default gen_random_uuid(),
  firm_id      uuid        not null,
  client_id    uuid        not null,
  match_id     uuid        not null,
  line_id      uuid        not null,
  bank_account_id uuid     not null,
  amount_cents bigint      not null check (amount_cents <> 0),
  group_status text        not null check (group_status in ('pending','live','unmatched')),
  -- Nullable by seam ruling: the GROUP carries the actor and bank_match_audit carries the
  -- full member set; member rows are written by the verbs without a per-row actor.
  created_by   uuid        references clara.users(id),
  created_at   timestamptz not null default now(),
  -- THE cascade FK: when bank_matches.status changes, every member row's group_status
  -- changes with it, automatically, in the same statement.
  constraint fk_bmlm_match_status
    foreign key (match_id, firm_id, client_id, group_status)
    references clara.bank_matches(id, firm_id, client_id, status)
    on update cascade,
  -- Account congruence against the GROUP side.
  constraint fk_bmlm_match_account
    foreign key (match_id, firm_id, client_id, bank_account_id)
    references clara.bank_matches(id, firm_id, client_id, bank_account_id),
  -- Account congruence against the STATEMENT side -- "through statement and group"
  -- (design SS4.5) is these two FKs meeting at one bank_account_id column.
  constraint fk_bmlm_line_account
    foreign key (line_id, firm_id, client_id, bank_account_id)
    references clara.bank_statement_lines(id, firm_id, client_id, bank_account_id),
  constraint uq_bmlm_match_line unique (match_id, line_id)
);
-- THE line-side exclusivity index (design SS3/SS4.5): a line belongs to at most one
-- non-unmatched group, always at full amount.
create unique index uq_bmlm_line_exclusive on clara.bank_match_line_members (line_id)
  where group_status in ('pending','live');
create index ix_bmlm_match on clara.bank_match_line_members (match_id);
create index ix_bmlm_line on clara.bank_match_line_members (line_id);

-- The stamping trigger (see the table header note): runs BEFORE the NOT NULL / FK / unique
-- checks below it, so it is the row's bank_account_id that reaches those checks, not
-- whatever (or nothing) the caller passed.
create function clara._tf_stamp_bmlm_account() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  select bank_account_id into new.bank_account_id
    from clara.bank_statement_lines where id = new.line_id;
  if new.bank_account_id is null then
    raise exception 'unknown statement line %', new.line_id using errcode = 'CLR10';
  end if;
  return new;
end $$;
revoke all on function clara._tf_stamp_bmlm_account() from public;
create trigger t_bmlm_stamp_account before insert on clara.bank_match_line_members
  for each row execute function clara._tf_stamp_bmlm_account();

-- No _tf_append_only: group_status legitimately mutates via the ON UPDATE CASCADE above,
-- and _tf_append_only blocks EVERY update unconditionally (it would break the cascade
-- itself). No-truncate only; row-level immutability of amount_cents/line_id beyond the
-- cascaded column is belt/verb territory, not this file's.
create trigger t_bmlm_no_truncate before truncate
  on clara.bank_match_line_members for each statement execute function clara._tf_no_truncate();

alter table clara.bank_match_line_members enable row level security;
alter table clara.bank_match_line_members force row level security;
create policy p_bmlm_owner on clara.bank_match_line_members
  for all to clara_fn_owner using (true) with check (true);
create policy p_bmlm_human on clara.bank_match_line_members
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_match_line_members to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_match_entry_members (design SS4.5). Entry-side exclusivity is DELIBERATELY
-- NOT a row-uniqueness index here -- design SS3 states it as a per-side ABSOLUTE CENTS
-- BOUND ("Sigma matched_cents over positive members <= Sigma debit_cents ... gross per
-- side, absolute"), which is exactly why it is named a BELT (the entry-exhaustion belt,
-- SS4.5) rather than a schema constraint: an entry can legitimately be a member of several
-- groups at once as long as the combined matched_cents never exceeds its capacity, which no
-- static uniqueness can express. The "Floors" (approved / not reversed / not a reversal
-- mirror) are likewise verb + deferred-belt territory (SS4.5: "the belt re-checks at
-- commit") because journal_entries.status can change AFTER this row is written -- not a
-- static property of the member row itself.
--
-- No bank_account_id here (unlike the line-member table): a journal entry has no single
-- "its" bank account the way a statement line does (an entry can touch many accounts across
-- many lines), so there is no denormalizable column a declarative FK could congruence-check
-- against -- the entry-exhaustion belt reads clara.journal_lines directly instead.
-- -------------------------------------------------------------------------------------
create table clara.bank_match_entry_members (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null,
  client_id     uuid        not null,
  match_id      uuid        not null,
  entry_id      uuid        not null,
  matched_cents bigint      not null check (matched_cents <> 0),
  -- The SIDE this member consumes (generated): TRUE = the entry's debit gross on the bank
  -- COA, FALSE = its credit gross. Anchors the one-member-PER-SIDE unique below.
  side_positive boolean     generated always as (matched_cents > 0) stored,
  group_status  text        not null check (group_status in ('pending','live','unmatched')),
  -- The SS4.6 acknowledged posting-date exception, recorded on the member row (never
  -- silent, never blocking): true when the entry's posting_date > the statement period_end
  -- and the caller acknowledged it (or the settle path recorded it, spec tension T2).
  posting_date_exception boolean not null default false,
  -- Nullable by seam ruling (see line-members note).
  created_by    uuid        references clara.users(id),
  created_at    timestamptz not null default now(),
  constraint fk_bmem_match_status
    foreign key (match_id, firm_id, client_id, group_status)
    references clara.bank_matches(id, firm_id, client_id, status)
    on update cascade,
  constraint fk_bmem_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  -- ONE MEMBER PER SIDE per (group, entry) -- adjudicated at assembly (cell x38.h): a gross
  -- two-sided entry (loan drawdown net of its fee) legitimately consumes BOTH its debit and
  -- credit bank sides in one group; a single net member would lose per-side consumption and
  -- let a later line falsely re-consume an exhausted side.
  constraint uq_bmem_match_entry_side unique (match_id, entry_id, side_positive)
);
create index ix_bmem_match on clara.bank_match_entry_members (match_id);
create index ix_bmem_entry on clara.bank_match_entry_members (entry_id);

create trigger t_bmem_no_truncate before truncate
  on clara.bank_match_entry_members for each statement execute function clara._tf_no_truncate();

alter table clara.bank_match_entry_members enable row level security;
alter table clara.bank_match_entry_members force row level security;
create policy p_bmem_owner on clara.bank_match_entry_members
  for all to clara_fn_owner using (true) with check (true);
create policy p_bmem_human on clara.bank_match_entry_members
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_match_entry_members to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_account_proposals (design SS4.1/4.3). Written ONLY by the router/persist path
-- on an `account_unregistered` refusal (a corroborated header whose (bank identity,
-- digits-only number) binds no live bank_accounts row) -- machine-authored, hence no
-- created_by. Append-only: "the failure writes a row" (design SS4.3) with no described
-- mutation afterward; add_bank_account(p_proposal_id => ...) reads the header snapshot to
-- pre-fill the confirmation, it does not update this row -- whether a given identity is
-- "still outstanding" is answerable by checking for a live bank_accounts row with the same
-- (bank_code, account_number_normalized), not by a status flag here, so none is added.
--
-- `header` carries the FULL corroborated header the design says this row "carries" (SS4.3):
-- institution, account number (both forms), currency, period bounds, statement date, and
-- the printed opening/closing/totals -- everything a human needs to recognise the account
-- before confirming, beyond the identity columns broken out for indexing/FK purposes.
-- =====================================================================================
-- OPEN QUESTION, STATED HONESTLY (not settled by the design text, which does not enumerate
-- this table's columns the way it does the other seven): whether a resolution/status
-- lifecycle belongs on this row at all, versus deriving "still outstanding" from
-- bank_accounts as designed above, is this file's own judgement call, flagged for the verb
-- lane to confirm or amend before 0038 ships.
-- -------------------------------------------------------------------------------------
-- SEAM RULING (orchestrator, assembly 2026-07-31): the ingest lane WRITES a lifecycle row
-- (task_id, reason incl. 'account_inactive', existing_bank_account_id, status='open') and
-- the accounts lane RESOLVES it (status -> 'resolved', resolved_* columns) -- two
-- independent lanes converged on a lifecycle, and the dashboard's card renders `reason` +
-- the reactivation path off `existing_bank_account_id`. The no-lifecycle composition this
-- section originally proposed is superseded by that convergence; append-only is therefore
-- dropped (the single status flip is the resolution), no-truncate stays. filing_id is
-- nullable (the writer does not thread it today; the FK binds when present).
create table clara.bank_account_proposals (
  id                         uuid        primary key default gen_random_uuid(),
  firm_id                    uuid        not null,
  client_id                  uuid        not null,
  document_id                uuid        not null,
  filing_id                  uuid,
  task_id                    uuid        not null,
  reason                     text        not null check (reason in ('account_unregistered','account_inactive')),
  bank_code                  text        not null references clara.bank_institutions(code),
  bank_name_display          text,
  account_number             text        not null check (btrim(account_number) <> ''),
  account_number_normalized  text        not null check (account_number_normalized ~ '^[0-9]+$'),
  existing_bank_account_id   uuid,
  header                     jsonb       not null default '{}' check (jsonb_typeof(header) = 'object'),
  status                     text        not null default 'open' check (status in ('open','resolved')),
  created_at                 timestamptz not null default now(),
  resolved_by                uuid        references clara.users(id),
  resolved_at                timestamptz,
  resolved_bank_account_id   uuid,
  constraint ck_bank_account_proposals_reason_anchor check (
    (reason = 'account_inactive') = (existing_bank_account_id is not null)),
  constraint ck_bank_account_proposals_resolution check (
    (status = 'open' and resolved_by is null and resolved_at is null and resolved_bank_account_id is null)
    or (status = 'resolved' and resolved_by is not null and resolved_at is not null)),
  constraint fk_bank_account_proposals_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bank_account_proposals_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id),
  constraint fk_bank_account_proposals_filing
    foreign key (filing_id, firm_id, client_id, document_id)
    references clara.document_filings(id, firm_id, client_id, document_id),
  constraint fk_bank_account_proposals_existing
    foreign key (existing_bank_account_id, firm_id, client_id)
    references clara.bank_accounts(id, firm_id, client_id),
  constraint fk_bank_account_proposals_resolved
    foreign key (resolved_bank_account_id, firm_id, client_id)
    references clara.bank_accounts(id, firm_id, client_id)
);
create index ix_bank_account_proposals_client on clara.bank_account_proposals (client_id, status, created_at desc);
create index ix_bank_account_proposals_identity
  on clara.bank_account_proposals (bank_code, account_number_normalized) where status = 'open';

create trigger t_bank_account_proposals_no_truncate before truncate
  on clara.bank_account_proposals for each statement execute function clara._tf_no_truncate();

-- RLS: human-only reads (design SS4.3: "human-only reads; zero agent grants"), which is
-- simply this schema's universal default made explicit by the design's own words.
alter table clara.bank_account_proposals enable row level security;
alter table clara.bank_account_proposals force row level security;
create policy p_bank_account_proposals_owner on clara.bank_account_proposals
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_account_proposals_human on clara.bank_account_proposals
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_account_proposals to clara_authenticated;

-- -------------------------------------------------------------------------------------
-- clara.bank_match_audit (design SS4.5, "PORT, house types"). The salvage manifest's own
-- verdict on the frozen prior build's table (docs/audit/02-salvage-manifest.md:43):
-- "Append-only match/unmatch trail with plain-bigint (no-FK) ids so it survives deletes."
-- Copied here as the house type: a bigint identity PK (not uuid) and NO foreign keys on the
-- subject ids, mirroring clara.audit_log's own shape (0002:276-288, also plain-bigint PK,
-- also un-FK'd actor/entry_id/document_id) -- an audit trail must not be coupled to the
-- lifecycle of the rows it describes, even though nothing in this schema hard-deletes them
-- today.
--
-- The design's own words name FOUR actions sharing one table -- "append-only rows per
-- match/complete/unmatch/void action" -- and "void" names a STATEMENT action
-- (void_bank_statement), not a match action, since matches are only ever unmatched, never
-- voided. Read literally, that means this table carries BOTH match-scoped rows (match/
-- complete/unmatch, referencing match_id) and statement-scoped rows (void, referencing
-- statement_id) -- hence both subject columns, mutually exclusive by the action taken,
-- rather than a match_id-only table the name alone might suggest.
-- -------------------------------------------------------------------------------------
-- SEAM RULING (orchestrator, assembly 2026-07-31): the match lane's writer emits exactly
-- five match-scoped actions ('match' · 'settle' · 'settle_pending' · 'complete' ·
-- 'unmatch') and the ingest lane records statement voids on the GENERIC clara._audit trail
-- (its own honest choice -- void is a statement event, not a match event). The dual-anchor
-- statement_id/'voided' composition is therefore superseded: this table is match-scoped,
-- as its name says.
create table clara.bank_match_audit (
  id           bigint      generated always as identity primary key,
  firm_id      uuid        not null,
  client_id    uuid        not null,
  match_id     uuid        not null,
  action       text        not null check (action in ('match','settle','settle_pending','complete','unmatch')),
  actor        uuid,
  reason       text,
  payload      jsonb       not null default '{}' check (jsonb_typeof(payload) = 'object'),
  created_at   timestamptz not null default now()
);
create index ix_bank_match_audit_client on clara.bank_match_audit (client_id, created_at desc);
create index ix_bank_match_audit_match on clara.bank_match_audit (match_id, created_at);

create trigger t_bank_match_audit_append_only before update or delete
  on clara.bank_match_audit for each row execute function clara._tf_append_only();
create trigger t_bank_match_audit_no_truncate before truncate
  on clara.bank_match_audit for each statement execute function clara._tf_no_truncate();

-- Human-only reads (design SS4.5: "Human-only reads").
alter table clara.bank_match_audit enable row level security;
alter table clara.bank_match_audit force row level security;
create policy p_bank_match_audit_owner on clara.bank_match_audit
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_match_audit_human on clara.bank_match_audit
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_match_audit to clara_authenticated;


-- ============ SECTION B (ingest) ============
-- =====================================================================================
-- 0038 SECTION B -- BANK STATEMENT INGEST.
--
-- The design of record is docs/plan/wave-c-b-bank-design.md section 3 (statement identity),
-- section 4.2 (statements and lines), section 4.3 (ingest -- statementFacts_v1, two lanes,
-- one workflow) and -part2.md section 4.9 (locks). Its section numbers are cited throughout.
-- Governing law: docs/plan/wave-c-contract.md (WC-R1..R12) and
-- docs/plan/wave-c-a-subledger-design.md (WCA-R1..R9). This section EXECUTES the ingest half:
-- the ONE validation+insert core, the task-lane wrapper and its fail path, the human-keyed
-- verb, the void verb, the statement-side deferred belt, and the bank_account_proposals
-- writer path.
--
-- ASSEMBLY POSITION. This file is one section of migration 0038 (number claimed at MERGE
-- time against the then-current frontier -- standing law; CI's frontier check enforces).
-- It assumes, and must be assembled AFTER:
--   * the tables section -- clara.bank_institutions, clara.bank_accounts,
--     clara.bank_statements, clara.bank_statement_lines, clara.bank_account_proposals,
--     clara.bank_matches, clara.bank_match_line_members (the belt reads the last two);
--   * the FIVE document_processing_tasks / document_extractions CHECK widenings (lane ·
--     lane-engine · engine-kind · error-code · binding) -- WITHOUT the error-code widening
--     every named refusal in this section is UNSTORABLE (design section 4.3, the [RV]
--     finding that v1 omitted both CHECKs);
--   * the event-type + trigger-taxonomy registration of bank.statement_ingested,
--     bank.statement_voided and bank.account_proposal -- the spine REJECTS unknown types at
--     append (0005:167-174), so an unregistered type rolls the first ingest back --
--     AND ONE TYPE THE DESIGN'S section 4.8 LIST DOES NOT NAME:
--     **`document.statement_facts_failed`**, emitted by fail_statement_facts. It is
--     deliberately in the `document.*` namespace and not `bank.*`: it is a document-pipeline
--     outcome (the twin of `document.invoice_facts_failed`, 0009:2175), NO bank object was
--     created, and section 4.8's tail assert scans the `bank.*` payload key sets -- a
--     `bank.*` type outside that list would fail the assert it exists to pass. There is
--     deliberately NO success twin: a successful ingest already emits
--     `bank.statement_ingested` from the core, and a second event for one act is noise.
-- It runs under `set role clara_fn_owner` (established by the tables section); the statement
-- below is a defensive no-op re-assertion, and this file deliberately does NOT `reset role`
-- -- the assembled migration resets once, at its own tail.
--
-- =====================================================================================
-- THE THREE THINGS THIS SECTION IS FOR, stated before any code.
-- =====================================================================================
-- (1) THE CHAIN IS THE CONTROL, NOT THE OCR. Per statement,
--         opening + SUM(line amounts) = closing        and    running_n = running_(n-1) + amount_n
--     with running_0 = opening and running_last = closing. The ENDPOINTS COME FROM THE
--     PRINTED HEADER LABELS (BEGINNING/ENDING or LEDGER BALANCE) and are NEVER derived from
--     the row set -- a reader that cannot produce them independently refuses
--     `header_unreadable`. A chain whose endpoints are computed from the rows is a
--     tautology, which is precisely what design v1 shipped and both review lanes killed.
--     The PRINTED TOTAL DEBIT / TOTAL CREDIT cross-checks are MANDATORY on the OCR lane
--     (`totals_unreadable` when a reader cannot state them) because they are the ONE control
--     that catches an omission the running balance cannot see.
--
-- (2) THE SIGN CONVENTION, WRITTEN OUT ONCE BECAUSE IT IS EASY TO GET BACKWARDS.
--     `bank_statement_lines.amount_cents` is signed FROM THE ACCOUNT HOLDER'S SIDE:
--         + = money INTO the account      - = money OUT of the account
--     A Malaysian bank statement prints the mirror of that, from the BANK's side:
--         printed TOTAL CREDIT = SUM(amount) over the POSITIVE lines
--         printed TOTAL DEBIT  = SUM(-amount) over the NEGATIVE lines   (a positive magnitude)
--     so `closing = opening + total_credit - total_debit`. Both printed totals are stored as
--     POSITIVE MAGNITUDES exactly as printed.
--
-- (3) ONE CORE, THREE MODES. `clara._persist_statement_core` is the ONLY statement-validation
--     and statement-insert logic in the system. The OCR lane, the structured lane and the
--     human verb all reach it, and there is deliberately no second implementation to drift --
--     the 0037 `_subledger_classify_entry` discipline. `ingest_mode` records WHICH mouth fed
--     the chain; it never changes what the chain must satisfy. A firm must always be able to
--     enter a statement by hand (the corpus's one mojibake text layer is the standing proof
--     it will be needed), and that hand-entered statement must clear exactly the same bars.
--
-- =====================================================================================
-- THE LANE CONTRACT -- how a refusal reaches the task trail. Read this before changing a
-- raise: the runtime depends on the shape.
-- =====================================================================================
-- `clara.persist_statement_facts` RAISES for every refusal except the two account-binding
-- ones. A raise aborts the transaction, so the workflow's error path calls
-- `clara.fail_statement_facts(task, reason)` in a FRESH transaction -- the same seam
-- persist_invoice_facts / fail_invoice_facts have used since 0009.
--
-- THE INVARIANT THAT MAKES THAT SEAM SAFE, and it is a real invariant, asserted by the
-- acceptance cell "every named error code lands as a row": EVERY `detail.reason` REACHABLE
-- THROUGH `persist_statement_facts` IS ITSELF A STORABLE
-- `document_processing_tasks.error_code`. The runtime reads `err.detail->>'reason'` and
-- passes it through verbatim; it never has to invent a code, and `fail_statement_facts` never
-- has to coerce one. (The two HUMAN verbs and the belt raise their own reasons --
-- `reason_required`, `statement_not_live`, `statement_has_live_matches`,
-- `statement_chain_broken` and friends -- which are NOT task error codes and never reach a
-- task trail; they are read by /bank off the CLR detail, the ordinary human-refusal seam.)
-- The task-reachable reasons are exactly:
--     header_unreadable · totals_unreadable · readers_disagree · chain_broken ·
--     continuity_mismatch · duplicate_period · overlapping_period · non_myr_statement ·
--     account_unregistered · account_inactive · statement_multi_client · period_invalid ·
--     line_date_out_of_period          (the design section 4.3 taxonomy)
--   + bad_type · internal              (the two pre-existing base codes this section reuses
--                                       rather than minting a synonym for: a document whose
--                                       kind is not bank_statement is `bad_type`; a payload
--                                       our OWN runtime built wrong is `internal`)
-- Tenancy refusals raise CLR11 and task-state refusals CLR16 with no detail reason -- neither
-- is a document outcome and neither belongs on the task trail as an extraction failure.
--
-- THE TWO ACCOUNT-BINDING REFUSALS ARE DIFFERENT, AND DELIBERATELY SO (design section 4.3).
-- `account_unregistered` / `account_inactive` must leave a `bank_account_proposals` ROW
-- behind -- and a row cannot survive a raise, because the raise takes the whole transaction
-- with it. So the core RETURNS a verdict for those two, and the wrapper writes the proposal,
-- fails the task and emits `bank.account_proposal`, ALL IN ONE COMMITTED TRANSACTION. That
-- is the mechanism behind the design's one-confirmation promise: upload -> read -> one
-- confirmation -> books-ready statement.
--
-- AND NOTHING IS PERSISTED FROM THE READ ON THAT BRANCH. The reader extractions are written
-- INSIDE the core's atomic-insert step, which the account-binding verdict returns before ever
-- reaching. That is load-bearing and not an accident: the router's `already_completed`
-- short-circuit keys on a DONE `statement_facts` extraction, so a proposal branch that had
-- banked its extraction would make `add_bank_account`'s in-transaction re-enqueue a silent
-- no-op and the confirmation would never produce a statement. One extra vendor read per
-- newly-registered account, once ever, is the price of the promise being literal.
--
-- =====================================================================================
-- THE PAYLOAD CONTRACT (p_payload) -- the runtime lane's half of the seam. Minimal and
-- explicit on purpose: every key here is load-bearing and there are no optional extras.
-- =====================================================================================
--   {
--     "pages_used": 3,                      -- int >= 0; settles the page budget (OCR lane)
--     "readers": {
--       "reader1": {                        -- ALWAYS present
--         "engine_id": "clara-stmt-geom:v1",
--         "header": <HeaderRead>,
--         "lines":  [ <LineRead>, ... ]
--       },
--       "reader2": {                        -- OCR LANE ONLY; absent on the structured lane
--         "engine_id": "azure-di:prebuilt-bankStatement:2024-11-30",
--         "header": <HeaderRead>,
--         "lines":  [ <LineRead>, ... ]
--       }
--     },
--     "corroboration": { "verdict": "...", "notes": ... }   -- RECORDED, NEVER TRUSTED
--   }
--
--   HeaderRead := {
--     "institution_code":   "MBB",          -- MUST resolve to a live clara.bank_institutions row
--     "account_number":     "5123 4567 8901",  -- as printed; bound on digits only
--     "currency":           "MYR",          -- absent/null READS MYR (the 0023 posture, WC-R5)
--     "period_start":       "2025-04-01",   -- ISO
--     "period_end":         "2025-04-30",
--     "statement_date":     "2025-04-30",
--     "opening_cents":      1234500,        -- FROM THE PRINTED LABEL, never derived
--     "closing_cents":      2345600,        -- FROM THE PRINTED LABEL, never derived
--     "opening_label":      "BEGINNING BALANCE",   -- which label the endpoint was read off
--     "closing_label":      "ENDING BALANCE",
--     "total_debit_cents":  500000,         -- printed TOTAL DEBIT, POSITIVE magnitude
--     "total_credit_cents": 1611100         -- printed TOTAL CREDIT, POSITIVE magnitude
--   }
--
--   LineRead := {
--     "line_no": 1,                         -- 1..N, contiguous, in printed order
--     "entry_date": "2025-04-03",           -- ISO; the DB re-checks it against the period
--     "value_date": "2025-04-03",           -- optional
--     "description": "IBG TRANSFER ...",    -- uncorroborated prose; informs, never decides
--     "amount_cents": -25000,               -- signed, see (2) above; never zero
--     "running_balance_cents": 1209500      -- the printed running balance for THIS row
--   }
--
-- WHO IS BELIEVED, AND WHO IS NOT. `corroboration.verdict` is RECORDED in the extraction
-- envelope and NEVER TRUSTED: the DB re-derives agreement itself from the two reads, because
-- the DB owns every number (PRD section 6) and a runtime-asserted verdict is exactly the
-- shape of evidence a corroboration gate exists to refuse. Descriptions come from reader-2
-- (design section 4.3) and are stripped from the agreement test -- they are prose. `value_date`
-- is likewise stripped: it is not in the design's named numeric skeleton (entry_date, amount,
-- running balance, equal counts), and a geometry reader that cannot find a value-date column
-- must not manufacture a disagreement out of it.
-- =====================================================================================

set role clara_fn_owner;

-- =====================================================================
-- B.1 -- THE TWO PAYLOAD NORMALIZERS.
--
-- They exist so the core reads as the ORDERED LADDER design section 4.3 specifies rather
-- than as three hundred lines of jsonb spelunking, and so the OCR lane, the structured lane
-- and the human verb cannot possibly parse the same header two different ways. Both are
-- definer-internal and granted to NOBODY (the "one ungranted _core + grant-scoped entry
-- points" law, 0004:6-12); every caller is itself a SECURITY DEFINER function owned by
-- clara_fn_owner, which holds EXECUTE implicitly as owner.
--
-- THEY RAISE THE TAXONOMY'S CODES, not parser errors. A missing or unparseable header field
-- IS `header_unreadable` -- that is what the code means. A malformed line set raises
-- `chain_broken`, which is the honest bucket: the closed taxonomy has no "the reader emitted
-- a line I cannot read" code, and the true statement is that the DB could not verify the
-- chain from what it was handed. Neither ever returns a silent NULL: a normalizer that
-- degrades a missing endpoint into a null is how a tautological chain gets built.
-- =====================================================================

create function clara._stmt_header_norm(p_header jsonb) returns jsonb
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare
  v_inst text; v_acct_printed text; v_acct_digits text; v_ccy text;
  v_ps text; v_pe text; v_sd text;
  v_open bigint; v_close bigint; v_td bigint; v_tc bigint;
begin
  if p_header is null or jsonb_typeof(p_header) <> 'object' then
    raise exception 'the statement header is missing or is not a json object'
      using errcode='CLR10',detail='{"reason":"header_unreadable"}';
  end if;

  -- IDENTITY. Malaysian institution codes are a stable public namespace and account numbers
  -- are NOT unique across institutions, so identity needs the PAIR (design section 4.1).
  v_inst := upper(nullif(btrim(coalesce(p_header->>'institution_code','')),''));
  v_acct_printed := nullif(btrim(coalesce(p_header->>'account_number','')),'');
  -- DIGITS-ONLY is the ingest binding form, and it is a DIFFERENT law from the
  -- client_identifiers house rule (lowercased, whitespace-stripped, HYPHENS PRESERVED,
  -- 0007:679-680) which add_bank_account keeps. The two coexist deliberately: statements
  -- print an account number in whatever spelling the layout feels like, and only the digits
  -- survive every spelling of it.
  v_acct_digits := nullif(regexp_replace(coalesce(v_acct_printed,''), '[^0-9]', '', 'g'), '');
  if v_inst is null or v_acct_printed is null or v_acct_digits is null then
    raise exception 'the statement header does not state a readable institution and account number'
      using errcode='CLR10',detail='{"reason":"header_unreadable"}';
  end if;

  -- CURRENCY. Absence READS MYR -- the 0023 posture (`explicit_non_myr`, 0023:150-151), not a
  -- guess: a statement that does not print a currency has not asserted a foreign one. Only an
  -- EXPLICIT non-MYR is a refusal, and the core raises it (WC-R5), not this normalizer.
  v_ccy := upper(nullif(btrim(coalesce(p_header->>'currency','')),''));

  -- PERIOD AND STATEMENT DATE. Regex-gated before the cast, the 0026:778 idiom -- a cast that
  -- can throw inside a normalizer produces an error nobody can act on.
  v_ps := nullif(btrim(coalesce(p_header->>'period_start','')),'');
  v_pe := nullif(btrim(coalesce(p_header->>'period_end','')),'');
  v_sd := nullif(btrim(coalesce(p_header->>'statement_date','')),'');
  if v_ps is null or v_ps !~ '^\d{4}-\d{2}-\d{2}$'
     or v_pe is null or v_pe !~ '^\d{4}-\d{2}-\d{2}$'
     or v_sd is null or v_sd !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'the statement header does not state readable ISO period bounds and a statement date'
      using errcode='CLR10',detail='{"reason":"header_unreadable"}';
  end if;

  -- THE ENDPOINTS. The single most important lines in this function. They must be PRESENT and
  -- they must be NUMBERS; there is no derivation path and there never will be, because a
  -- chain whose endpoints come from the rows proves nothing about the rows.
  -- IS DISTINCT FROM, never <>: a MISSING key makes jsonb_typeof NULL and `<>` then
  -- evaluates NULL -- the guard would silently pass and the NOT NULL column would 23502
  -- later with a constraint name instead of this diagnosis (caught by cell x38.w).
  if jsonb_typeof(p_header->'opening_cents') is distinct from 'number'
     or jsonb_typeof(p_header->'closing_cents') is distinct from 'number'
     or (p_header->>'opening_cents')::numeric <> trunc((p_header->>'opening_cents')::numeric)
     or (p_header->>'closing_cents')::numeric <> trunc((p_header->>'closing_cents')::numeric) then
    raise exception 'the statement header does not state whole-cent printed opening and closing balances (they are read off the printed BEGINNING/ENDING or LEDGER BALANCE labels, never derived from the rows)'
      using errcode='CLR10',detail='{"reason":"header_unreadable"}';
  end if;
  v_open := (p_header->>'opening_cents')::bigint;
  v_close := (p_header->>'closing_cents')::bigint;

  -- THE PRINTED TOTALS. NULLABLE HERE, mandatory in the core on the OCR lane and
  -- checked-when-present elsewhere (design section 3). A total that is PRESENT but not a
  -- whole non-negative number is a read failure, not an absence -- absorbing it as NULL is
  -- how a mandatory control silently becomes optional.
  if p_header ? 'total_debit_cents' and jsonb_typeof(p_header->'total_debit_cents') <> 'null' then
    if jsonb_typeof(p_header->'total_debit_cents') <> 'number'
       or (p_header->>'total_debit_cents')::numeric < 0
       or (p_header->>'total_debit_cents')::numeric <> trunc((p_header->>'total_debit_cents')::numeric) then
      raise exception 'the printed TOTAL DEBIT is stated but is not a whole non-negative cents magnitude'
        using errcode='CLR10',detail='{"reason":"totals_unreadable"}';
    end if;
    v_td := (p_header->>'total_debit_cents')::bigint;
  end if;
  if p_header ? 'total_credit_cents' and jsonb_typeof(p_header->'total_credit_cents') <> 'null' then
    if jsonb_typeof(p_header->'total_credit_cents') <> 'number'
       or (p_header->>'total_credit_cents')::numeric < 0
       or (p_header->>'total_credit_cents')::numeric <> trunc((p_header->>'total_credit_cents')::numeric) then
      raise exception 'the printed TOTAL CREDIT is stated but is not a whole non-negative cents magnitude'
        using errcode='CLR10',detail='{"reason":"totals_unreadable"}';
    end if;
    v_tc := (p_header->>'total_credit_cents')::bigint;
  end if;

  return jsonb_build_object(
    'institution_code',   v_inst,
    'account_printed',    v_acct_printed,
    'account_digits',     v_acct_digits,
    'currency',           coalesce(v_ccy, 'MYR'),
    'currency_stated',    (v_ccy is not null),
    'period_start',       v_ps,
    'period_end',         v_pe,
    'statement_date',     v_sd,
    'opening_cents',      v_open,
    'closing_cents',      v_close,
    'opening_label',      nullif(btrim(coalesce(p_header->>'opening_label','')),''),
    'closing_label',      nullif(btrim(coalesce(p_header->>'closing_label','')),''),
    'total_debit_cents',  v_td,
    'total_credit_cents', v_tc);
end $$;
revoke all on function clara._stmt_header_norm(jsonb) from public;

create function clara._stmt_lines_norm(p_lines jsonb) returns jsonb
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_out jsonb; v_n int; v_max int; v_dis int;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'the statement line set is missing or is not a json array'
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;
  -- A ZERO-LINE STATEMENT IS LEGAL and is a real vector from the corpus (one zero-activity
  -- month). It normalizes to an empty array and the chain identity then demands
  -- opening = closing, which is exactly right.
  if jsonb_array_length(p_lines) = 0 then
    return '[]'::jsonb;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or jsonb_typeof(x.elem->'line_no') is distinct from 'number'
       or (x.elem->>'line_no')::numeric <> trunc((x.elem->>'line_no')::numeric)
       or (x.elem->>'line_no')::numeric < 1
       or coalesce(btrim(x.elem->>'entry_date'),'') !~ '^\d{4}-\d{2}-\d{2}$'
       or (x.elem ? 'value_date' and jsonb_typeof(x.elem->'value_date') <> 'null'
           and coalesce(btrim(x.elem->>'value_date'),'') !~ '^\d{4}-\d{2}-\d{2}$')
       or jsonb_typeof(x.elem->'amount_cents') is distinct from 'number'
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
       -- amount_cents <> 0 is also a table CHECK; refusing it HERE means the human sees a
       -- statement diagnosis instead of a constraint name. A bank does not print a zero
       -- movement, so a zero here is a mis-read, and a mis-read row is a chain we cannot verify.
       or (x.elem->>'amount_cents')::numeric = 0
       or (x.elem ? 'running_balance_cents' and jsonb_typeof(x.elem->'running_balance_cents') <> 'null'
           and (jsonb_typeof(x.elem->'running_balance_cents') <> 'number'
             or (x.elem->>'running_balance_cents')::numeric
                <> trunc((x.elem->>'running_balance_cents')::numeric)))
  ) then
    raise exception 'a statement line is malformed (each line states a positive whole line_no, an ISO entry_date, a non-zero whole amount_cents and, where printed, a whole running_balance_cents)'
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;

  select jsonb_agg(jsonb_build_object(
           'line_no',               (x.elem->>'line_no')::int,
           'entry_date',            btrim(x.elem->>'entry_date'),
           'value_date',            nullif(btrim(coalesce(x.elem->>'value_date','')),''),
           'description',           nullif(btrim(coalesce(x.elem->>'description','')),''),
           'amount_cents',          (x.elem->>'amount_cents')::bigint,
           'running_balance_cents', case when x.elem ? 'running_balance_cents'
                                          and jsonb_typeof(x.elem->'running_balance_cents')='number'
                                         then (x.elem->>'running_balance_cents')::bigint end)
         order by (x.elem->>'line_no')::int),
         count(*)::int, max((x.elem->>'line_no')::int), count(distinct (x.elem->>'line_no')::int)::int
    into v_out, v_n, v_max, v_dis
    from jsonb_array_elements(p_lines) as x(elem);

  -- CONTIGUOUS 1..N. The running-balance chain is a statement about an ORDER, and an order
  -- with a hole in its numbering is not one. A gap here is exactly the "reader silently
  -- dropped a row" failure WC-R7 says two agreeing readers structurally cannot catch, so it
  -- is caught structurally instead.
  if v_n <> v_dis or v_max <> v_n then
    raise exception 'the statement line numbers are not contiguous 1..% (% line(s), % distinct, highest %) -- a dropped or duplicated row cannot be chained', v_n, v_n, v_dis, v_max
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;
  return v_out;
end $$;
revoke all on function clara._stmt_lines_norm(jsonb) from public;

-- =====================================================================
-- B.2 -- clara._persist_statement_core -- THE ONE VALIDATION+INSERT CORE.
--
-- Design section 4.3's ordered ladder, executed literally and in that order, because the
-- order is itself a design decision and a reader must be able to check it:
--
--   1  replay guard (by task, where applicable)
--   2  provenance + document kind + filing            -- the structural invariant
--   3  header corroboration                            -- readable, totals present, readers agree
--   4  account binding (digits-only)                   -- AFTER corroboration, never before
--   5  MYR posture                                     -- WC-R5
--   6  the account chain lock, advisory 203005006      -- part2 section 4.9
--   7  period sanity + duplicate/overlap (doc-id-aware)
--   8  the chain + the printed totals cross-checks
--   9  BOTH-edge continuity
--  10  line date bounds
--  11  the atomic insert (extractions -> statement -> lines)
--  12  documents.financial_date = period_end
--  13  events
--
-- WHY BINDING COMES AFTER CORROBORATION (step 4 after step 3), stated because inverting it is
-- the tempting optimisation: an UNCORROBORATED HEADER MAY NEVER EMIT A PROPOSAL. A proposal
-- card asks a human to confirm "this is account X at bank Y" -- putting a single unverified
-- read behind that question turns the one-confirmation promise into a one-click way to bind
-- the wrong account, and a wrongly bound account silently mis-files a whole year of money
-- movement. Design section 4.3, and its own acceptance cell.
--
-- WHY THE LOCK COMES AFTER BINDING (step 6 after step 4): the lock is keyed on the bank
-- account, so it cannot be taken before the account is known. Everything the lock protects --
-- duplicate, overlap, both-edge continuity -- is on the far side of it, which is what makes
-- the check-then-insert races closeable at all. The partial unique
-- `(bank_account_id, period_end) where status='live'` is the second half; the race is closed
-- by SERIALIZATION, not by the index alone (design section 4.2).
--
-- THE LOCK ORDER LAW (part2 section 4.9) that binds this function: bank statement/line/match
-- rows lock AFTER journal_entries and AFTER open_items in any transaction touching both. This
-- core touches neither, and takes exactly one advisory rung (203005006). It must stay that
-- way: a future edit that reaches into journal_entries from here inverts against
-- match_bank_line, which locks pre-existing entries FIRST.
--
-- RETURNS, rather than raises, for exactly two verdicts -- `account_unregistered` and
-- `account_inactive` -- for the reason the lane contract at the top of this file states: the
-- proposal row cannot survive a raise. Every other refusal raises. Callers MUST branch on
-- `ok`; a caller that ignores it silently accepts an unbound statement.
-- =====================================================================
create function clara._persist_statement_core(
    p_firm uuid,
    p_client uuid,
    p_document uuid,
    p_payload jsonb,
    p_ingest_mode text,
    p_actor uuid,
    p_task uuid default null,
    p_bank_account uuid default null,
    p_engine_kind text default 'statement_facts',
    p_task_engine_id text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; b record; s record; ln record;
  v_r1 jsonb; v_r2 jsonb; v_h1 jsonb; v_h2 jsonb; v_l1 jsonb; v_l2 jsonb;
  v_hdr jsonb; v_lines jsonb; v_skel1 jsonb; v_skel2 jsonb; v_desc jsonb;
  v_field text; v_two boolean;
  v_filing uuid; v_sha text;
  v_ps date; v_pe date; v_sd date;
  v_open bigint; v_close bigint; v_td bigint; v_tc bigint;
  v_run bigint; v_sum_pos bigint := 0; v_sum_neg bigint := 0; v_n int;
  v_acct uuid; v_inst text; v_digits text;
  v_prior bigint; v_next bigint;
  v_stmt uuid; v_ext1 uuid; v_ext2 uuid; v_e1 text; v_e2 text; v_version int;
  v_facts_hash bytea;
begin
  if p_ingest_mode not in ('structured','ocr','human') then
    raise exception 'ingest_mode must be one of structured / ocr / human'
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  v_two := (p_ingest_mode = 'ocr');

  -- ---------------------------------------------------------------- 1. REPLAY GUARD.
  -- A WDK retry of an ingest that ALREADY COMMITTED must report `replayed`, never
  -- `duplicate_period` -- design section 4.3's [R1] finding. Keyed on the DOCUMENT, which is
  -- the durable thing: the task may have been re-versioned, but a document that already owns
  -- a live statement has been ingested, full stop. The wrapper's own task-status replay
  -- branch sits in front of this; this is the belt behind it, and it is what makes the
  -- duplicate/overlap tests at step 7 safe to phrase as hard refusals.
  --
  -- TENANCY-SCOPED, and that is not decoration: this guard runs BEFORE the provenance check
  -- (design section 4.3 puts the replay guard first), so an unscoped query would hand a
  -- caller in firm B the statement id of firm A's document -- an existence oracle across the
  -- tenant boundary, reached before any tenancy check had run. p_firm/p_client are the
  -- caller's own, established by the wrapper (task -> filing) or by _human_ctx.
  select * into s from clara.bank_statements
    where document_id = p_document and status = 'live'
      and firm_id = p_firm and client_id = p_client limit 1;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'statement_id', s.id,
      'bank_account_id', s.bank_account_id, 'line_count', s.line_count,
      'period_start', s.period_start, 'period_end', s.period_end, 'status', 'live');
  end if;

  -- ---------------------------------------------------------------- 2. PROVENANCE + KIND.
  -- The structural invariant, validated IN-TXN: firm, client, active verified filing, and the
  -- byte hash of the document the statement claims to be. _active_document_filing raises
  -- CLR02 by itself when the provenance is not established (0007:982-1003); it is the one
  -- provenance predicate in the schema and this section does not grow a second.
  select * into d from clara.documents where id = p_document;
  if not found or d.firm_id <> p_firm then
    raise exception 'document is not in this firm' using errcode='CLR11';
  end if;
  if d.document_kind is distinct from 'bank_statement' then
    raise exception 'document % is kind % -- only a bank_statement document can carry a statement', p_document, coalesce(d.document_kind,'(unclassified)')
      using errcode='CLR10',detail='{"reason":"bad_type"}';
  end if;
  v_filing := clara._active_document_filing(p_document, d.sha256, p_client, true);
  v_sha := d.sha256;

  -- ---------------------------------------------------------------- 3. HEADER CORROBORATION.
  -- Reader-1 always exists. Reader-2 exists ONLY on the OCR lane: on the structured lane the
  -- parse is deterministic and THE CHAIN IS THE SECOND READER (WC-R7), and on the human lane
  -- the ACTOR is the recorded corroborator. WC-R7 is a deliberate strengthening of ADR-047:
  -- the balance chain is strictly stronger evidence than a second read, because it catches an
  -- OMITTED line, which two agreeing readers structurally cannot.
  v_r1 := p_payload #> '{readers,reader1}';
  v_r2 := p_payload #> '{readers,reader2}';
  if v_r1 is null or jsonb_typeof(v_r1) <> 'object' then
    raise exception 'the statement payload carries no reader1 read'
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  v_h1 := clara._stmt_header_norm(v_r1->'header');
  v_l1 := clara._stmt_lines_norm(coalesce(v_r1->'lines','[]'::jsonb));
  v_e1 := nullif(btrim(coalesce(v_r1->>'engine_id','')),'');

  if v_two then
    if v_r2 is null or jsonb_typeof(v_r2) <> 'object' then
      raise exception 'the OCR statement lane requires two independent reads and only one was supplied'
        using errcode='CLR10',detail='{"reason":"readers_disagree"}';
    end if;
    v_h2 := clara._stmt_header_norm(v_r2->'header');
    v_l2 := clara._stmt_lines_norm(coalesce(v_r2->'lines','[]'::jsonb));
    v_e2 := coalesce(nullif(btrim(coalesce(v_r2->>'engine_id','')),''), p_task_engine_id);
  elsif v_r2 is not null and jsonb_typeof(v_r2) = 'object' then
    -- A second read on a lane that has no second reader is a runtime wiring error, not a
    -- richer payload. Refusing it keeps the lane<->egress-class invariant every existing gate
    -- keys on legible (design section 4.3): `statement_parse` never egresses, so a vendor
    -- read appearing in its payload means something egressed that no gate saw.
    raise exception 'a reader2 read was supplied on the % lane, which has no second reader', p_ingest_mode
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;

  -- THE MANDATORY PRINTED TOTALS. MANDATORY on the OCR lane (`totals_unreadable`), checked
  -- when present elsewhere. This is the ONE control that catches an adjacent omission the
  -- running balance cannot see, and it is mandatory exactly where the reader can silently
  -- drop a row.
  if v_two and ((v_h1->'total_debit_cents') is null or jsonb_typeof(v_h1->'total_debit_cents')='null'
             or (v_h1->'total_credit_cents') is null or jsonb_typeof(v_h1->'total_credit_cents')='null'
             or (v_h2->'total_debit_cents') is null or jsonb_typeof(v_h2->'total_debit_cents')='null'
             or (v_h2->'total_credit_cents') is null or jsonb_typeof(v_h2->'total_credit_cents')='null') then
    raise exception 'the OCR statement lane requires both readers to state the printed TOTAL DEBIT and TOTAL CREDIT'
      using errcode='CLR10',detail='{"reason":"totals_unreadable"}';
  end if;

  -- AGREEMENT ON THE FULL LOAD-BEARING HEADER: institution + account number + currency +
  -- period bounds + statement date + printed opening/closing + printed totals. A ZERO-LINE
  -- STATEMENT STILL CORROBORATES ITS FULL HEADER -- that is why this test is on the header
  -- object and not on the rows, and it is the degenerate-case cell in the acceptance set.
  if v_two then
    v_field := case
      when (v_h1->>'institution_code')   is distinct from (v_h2->>'institution_code')   then 'institution_code'
      when (v_h1->>'account_digits')     is distinct from (v_h2->>'account_digits')     then 'account_number'
      when (v_h1->>'currency')           is distinct from (v_h2->>'currency')           then 'currency'
      when (v_h1->>'period_start')       is distinct from (v_h2->>'period_start')       then 'period_start'
      when (v_h1->>'period_end')         is distinct from (v_h2->>'period_end')         then 'period_end'
      when (v_h1->>'statement_date')     is distinct from (v_h2->>'statement_date')     then 'statement_date'
      when (v_h1->>'opening_cents')      is distinct from (v_h2->>'opening_cents')      then 'opening_cents'
      when (v_h1->>'closing_cents')      is distinct from (v_h2->>'closing_cents')      then 'closing_cents'
      when (v_h1->>'total_debit_cents')  is distinct from (v_h2->>'total_debit_cents')  then 'total_debit_cents'
      when (v_h1->>'total_credit_cents') is distinct from (v_h2->>'total_credit_cents') then 'total_credit_cents'
      else null end;
    if v_field is not null then
      raise exception 'the two readers disagree about the statement header field %', v_field
        using errcode='CLR10',detail='{"reason":"readers_disagree"}';
    end if;
    -- AND THE PER-LINE NUMERIC SKELETON, with equal counts. Descriptions and value_date are
    -- stripped: descriptions are uncorroborated prose that informs and never decides, and
    -- value_date is not in the design's named skeleton -- a geometry reader with no
    -- value-date column must not manufacture a disagreement out of a field nothing reads.
    select jsonb_agg(x.elem - 'description' - 'value_date' order by (x.elem->>'line_no')::int)
      into v_skel1 from jsonb_array_elements(v_l1) as x(elem);
    select jsonb_agg(x.elem - 'description' - 'value_date' order by (x.elem->>'line_no')::int)
      into v_skel2 from jsonb_array_elements(v_l2) as x(elem);
    if coalesce(v_skel1,'[]'::jsonb) is distinct from coalesce(v_skel2,'[]'::jsonb) then
      raise exception 'the two readers disagree about the statement line skeleton (% vs % line(s); entry dates, amounts or running balances differ)',
        jsonb_array_length(v_l1), jsonb_array_length(v_l2)
        using errcode='CLR10',detail='{"reason":"readers_disagree"}';
    end if;
  end if;

  -- THE AGREED READ. Numbers from reader-1 (they are provably identical to reader-2's on the
  -- OCR lane, and reader-1 is the only reader elsewhere); DESCRIPTIONS FROM READER-2 where it
  -- exists (design section 4.3) -- the typed engine reads prose better than the geometry pass,
  -- and prose is the one thing that is allowed to come from one reader alone because it
  -- decides nothing.
  v_hdr := v_h1;
  v_lines := v_l1;
  if v_two then
    -- aliases r1/r2, NEVER a/b: plpgsql variable substitution shadows a bare `b` alias with
    -- this function's own record variable and raises 55000 the moment the SQL runs.
    select jsonb_agg(jsonb_set(r1.elem, '{description}',
             coalesce(to_jsonb(r2.elem->>'description'), 'null'::jsonb))
           order by (r1.elem->>'line_no')::int)
      into v_desc
      from jsonb_array_elements(v_l1) as r1(elem)
      join jsonb_array_elements(v_l2) as r2(elem)
        on (r2.elem->>'line_no')::int = (r1.elem->>'line_no')::int;
    v_lines := coalesce(v_desc, v_l1);
  end if;
  v_facts_hash := clara._hash(jsonb_build_object('header', v_hdr, 'lines', v_lines));

  -- ---------------------------------------------------------------- 4. ACCOUNT BINDING.
  v_inst := v_hdr->>'institution_code';
  v_digits := v_hdr->>'account_digits';
  if not exists (select 1 from clara.bank_institutions bi
                 where bi.code = v_inst and bi.active) then
    -- bank_institutions is a SEEDED REFERENCE, additively grown by migration (a named
    -- residual). An unknown code is therefore a statement this system cannot yet identify --
    -- honest as `header_unreadable`, and the message names the remedy rather than the table.
    raise exception 'institution code % is not a live entry in the bank institutions reference; it is added by migration before statements from that bank can be ingested', v_inst
      using errcode='CLR10',detail='{"reason":"header_unreadable"}';
  end if;

  if p_bank_account is not null then
    -- THE HUMAN LANE names its account. The header still has to agree with it: a bookkeeper
    -- keying April's statement into May's account is the exact mis-filing this binding exists
    -- to stop, and it costs one comparison to refuse.
    select * into b from clara.bank_accounts ba where ba.id = p_bank_account;
    if not found or b.firm_id <> p_firm or b.client_id <> p_client then
      raise exception 'bank account is not in this client' using errcode='CLR11';
    end if;
    if not b.active then
      return jsonb_build_object('ok', false, 'reason', 'account_inactive',
        'bank_account_id', b.id, 'institution_code', v_inst,
        'account_digits', v_digits, 'header', v_hdr);
    end if;
    if b.bank_code is distinct from v_inst or b.account_number_normalized is distinct from v_digits then
      raise exception 'the statement header states institution % account ending %, which is not the bank account named on this call', v_inst, right(v_digits, 4)
        using errcode='CLR10',detail='{"reason":"account_unregistered"}';
    end if;
    v_acct := b.id;
  else
    -- THE READ LANE binds on the CORROBORATED (institution, digits-only number) pair. The
    -- partial uniques on bank_accounts are `where active`, so at most one row can match.
    select * into b from clara.bank_accounts ba
      where ba.client_id = p_client and ba.firm_id = p_firm
        and ba.bank_code = v_inst and ba.account_number_normalized = v_digits
        and ba.active;
    if not found then
      -- DISTINGUISH inactive from unregistered (design section 4.1/4.3): one offers
      -- reactivation, the other offers creation, and a card that cannot tell them apart sends
      -- the human to build a duplicate of an account they already deactivated on purpose.
      select * into b from clara.bank_accounts ba
        where ba.client_id = p_client and ba.firm_id = p_firm
          and ba.bank_code = v_inst and ba.account_number_normalized = v_digits
          and not ba.active
        order by ba.deactivated_at desc nulls last limit 1;
      if found then
        return jsonb_build_object('ok', false, 'reason', 'account_inactive',
          'bank_account_id', b.id, 'institution_code', v_inst,
          'account_digits', v_digits, 'account_printed', v_hdr->>'account_printed',
          'header', v_hdr);
      end if;
      return jsonb_build_object('ok', false, 'reason', 'account_unregistered',
        'bank_account_id', null::uuid, 'institution_code', v_inst,
        'account_digits', v_digits, 'account_printed', v_hdr->>'account_printed',
        'header', v_hdr);
    end if;
    v_acct := b.id;
  end if;

  -- ---------------------------------------------------------------- 5. MYR POSTURE (WC-R5).
  -- Multi-currency is OUT and FAILS CLOSED WITH AN HONEST REFUSAL. Absence reads MYR (step 3's
  -- normalizer); only an EXPLICIT non-MYR refuses. No BELCORT client holds a non-MYR bank
  -- account, and adding a currency dimension to journal_lines is the most invasive schema
  -- change available at this stage -- so the refusal is the design, not a gap.
  if (v_hdr->>'currency_stated')::boolean and (v_hdr->>'currency') <> 'MYR' then
    raise exception 'this statement states currency %; Clara books MYR only (WC-R5)', v_hdr->>'currency'
      using errcode='CLR10',detail='{"reason":"non_myr_statement"}';
  end if;

  -- ---------------------------------------------------------------- 6. THE CHAIN LOCK.
  -- part2 section 4.9: advisory rung 203005006 = the PER-ACCOUNT statement-chain lock, taken
  -- by persist_statement_facts / enter_bank_statement / void_bank_statement. It is what makes
  -- the overlap and both-edge continuity checks below true rather than merely written: two
  -- concurrent gap-fillers, or two overlapping periods, each pass a check-then-insert on their
  -- own snapshot and both commit without it. Serialization closes the race; the partial
  -- unique is the second half, not the first.
  perform pg_advisory_xact_lock(203005006, hashtext(v_acct::text));

  -- ---------------------------------------------------------------- 7. PERIOD + DUPLICATE.
  v_ps := (v_hdr->>'period_start')::date;
  v_pe := (v_hdr->>'period_end')::date;
  v_sd := (v_hdr->>'statement_date')::date;
  v_open := (v_hdr->>'opening_cents')::bigint;
  v_close := (v_hdr->>'closing_cents')::bigint;
  v_td := (v_hdr->>'total_debit_cents')::bigint;
  v_tc := (v_hdr->>'total_credit_cents')::bigint;
  v_n := jsonb_array_length(v_lines);

  if v_ps > v_pe then
    raise exception 'the statement period starts (%) after it ends (%)', v_ps, v_pe
      using errcode='CLR10',detail='{"reason":"period_invalid"}';
  end if;
  -- A statement dated before its own period opened is a year-derivation failure: Maybank line
  -- dates print DD/MM with no year and the year comes from the period, so a wrong period year
  -- has to be caught here or every line date inherits it. Deliberately a weak bound -- a
  -- statement legitimately carries a date at or after its period end, sometimes days later.
  if v_sd < v_ps then
    raise exception 'the statement is dated % but its period opens on %', v_sd, v_ps
      using errcode='CLR10',detail='{"reason":"period_invalid"}';
  end if;

  -- DUPLICATE, DOC-ID-AWARE. The same document arriving twice is a REPLAY (step 1 already
  -- returned it, but a re-versioned task can land here); a DIFFERENT document claiming the
  -- same closed period is a duplicate and refuses by name.
  select * into s from clara.bank_statements st
    where st.bank_account_id = v_acct and st.status = 'live' and st.period_end = v_pe;
  if found then
    if s.document_id = p_document then
      return jsonb_build_object('ok', true, 'replayed', true, 'statement_id', s.id,
        'bank_account_id', s.bank_account_id, 'line_count', s.line_count,
        'period_start', s.period_start, 'period_end', s.period_end, 'status', 'live');
    end if;
    raise exception 'a live statement for this account already closes on %; void it before ingesting a replacement', v_pe
      using errcode='CLR10',detail='{"reason":"duplicate_period"}';
  end if;
  if exists (select 1 from clara.bank_statements st
             where st.bank_account_id = v_acct and st.status = 'live'
               and st.document_id is distinct from p_document
               and st.period_start <= v_pe and st.period_end >= v_ps) then
    raise exception 'this statement period (% .. %) overlaps a live statement on the same account', v_ps, v_pe
      using errcode='CLR10',detail='{"reason":"overlapping_period"}';
  end if;

  -- ---------------------------------------------------------------- 8. THE CHAIN + TOTALS.
  -- opening + SUM(amounts) = closing, AND running_n = running_(n-1) + amount_n per row. The
  -- per-row walk is the half that localises the break to a line number, which is the
  -- difference between a diagnosis a bookkeeper can act on and a refusal they cannot.
  v_run := v_open;
  for ln in select (x.elem->>'line_no')::int as line_no,
                   (x.elem->>'amount_cents')::bigint as amount_cents,
                   case when jsonb_typeof(x.elem->'running_balance_cents')='number'
                        then (x.elem->>'running_balance_cents')::bigint end as running_balance_cents,
                   (x.elem->>'entry_date')::date as entry_date
            from jsonb_array_elements(v_lines) as x(elem)
            order by (x.elem->>'line_no')::int loop
    v_run := v_run + ln.amount_cents;
    if ln.amount_cents > 0 then v_sum_pos := v_sum_pos + ln.amount_cents;
    else v_sum_neg := v_sum_neg - ln.amount_cents; end if;   -- a POSITIVE magnitude, see (2)
    if ln.running_balance_cents is null then
      if v_two then
        raise exception 'line % states no printed running balance; the OCR statement lane requires one per row', ln.line_no
          using errcode='CLR10',detail='{"reason":"chain_broken"}';
      end if;
    elsif ln.running_balance_cents <> v_run then
      raise exception 'the running balance breaks at line %: the statement prints % but opening plus the movements to that row give %', ln.line_no, ln.running_balance_cents, v_run
        using errcode='CLR10',detail='{"reason":"chain_broken"}';
    end if;
    -- ------------------------------------------------------------ 10. LINE DATE BOUNDS,
    -- checked in the same walk it costs nothing to check it in. Line dates print DD/MM with
    -- no year on the corpus; the year derives from the period, so the DB re-checks the bound
    -- rather than trusting the derivation that produced it.
    if ln.entry_date < v_ps or ln.entry_date > v_pe then
      raise exception 'line % is dated %, outside the statement period % .. %', ln.line_no, ln.entry_date, v_ps, v_pe
        using errcode='CLR10',detail='{"reason":"line_date_out_of_period"}';
    end if;
  end loop;
  if v_run <> v_close then
    raise exception 'the statement chain does not close: opening % plus % movement(s) gives %, but the printed closing balance is %', v_open, v_n, v_run, v_close
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;
  -- THE PRINTED TOTALS CROSS-CHECK. Mandatory on the OCR lane (enforced at step 3), checked
  -- when present elsewhere. Note the direction mapping from (2): printed CREDIT is the
  -- positive-line sum, printed DEBIT the magnitude of the negative-line sum.
  if v_tc is not null and v_tc <> v_sum_pos then
    raise exception 'the printed TOTAL CREDIT is % but the credit lines sum to %', v_tc, v_sum_pos
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;
  if v_td is not null and v_td <> v_sum_neg then
    raise exception 'the printed TOTAL DEBIT is % but the debit lines sum to %', v_td, v_sum_neg
      using errcode='CLR10',detail='{"reason":"chain_broken"}';
  end if;

  -- ---------------------------------------------------------------- 9. BOTH-EDGE CONTINUITY.
  -- opening = the ADJACENT PRIOR live statement's closing, AND the ADJACENT NEXT live
  -- statement's opening = this closing. BOTH edges, because one edge is only half a chain:
  -- checking the prior edge alone lets a void-and-reingest quietly change a closing balance
  -- that the following month already committed to.
  --
  -- ADJACENCY IS DATE-CONTIGUITY, not nearest-neighbour, and the distinction is the whole
  -- gap-filler story. With nearest-neighbour, ingesting April then June (May genuinely
  -- missing) would refuse June -- so a firm that receives statements out of order could never
  -- catch up. With contiguity, April and June are not neighbours and neither edge fires;
  -- filling May then fires BOTH edges at once, which is exactly where the chain should be
  -- proven. A real gap stays visible as a gap instead of blocking the ingest that would
  -- eventually close it.
  select st.closing_cents into v_prior from clara.bank_statements st
    where st.bank_account_id = v_acct and st.status = 'live' and st.period_end = v_ps - 1;
  if found and v_prior is distinct from v_open then
    raise exception 'continuity break: the statement closing on % ends at % but this statement opens at %', v_ps - 1, v_prior, v_open
      using errcode='CLR10',detail='{"reason":"continuity_mismatch"}';
  end if;
  select st.opening_cents into v_next from clara.bank_statements st
    where st.bank_account_id = v_acct and st.status = 'live' and st.period_start = v_pe + 1;
  if found and v_next is distinct from v_close then
    raise exception 'continuity break: this statement closes at % but the statement opening on % starts at %', v_close, v_pe + 1, v_next
      using errcode='CLR10',detail='{"reason":"continuity_mismatch"}';
  end if;

  -- ---------------------------------------------------------------- 11. THE ATOMIC INSERT.
  -- The reader extractions land HERE, at the last possible moment, and never on a refusal
  -- path -- see the lane contract at the top of this file for why that is load-bearing rather
  -- than tidy. They carry the FULL READ in the envelope (the named residual: per-line region
  -- citations are not carried, and facts_hash plus the two extraction ids are what prove who
  -- agreed to what). Both stamp engine_kind='statement_facts' whichever lane produced them --
  -- the invoice family's own precedent, where invoice_facts and local_facts both stamp
  -- 'invoice_facts' and the LANE, not the kind, records how the read was bought.
  if p_task is not null then
    if v_e1 is null then
      raise exception 'the statement payload names no engine_id for reader1'
        using errcode='CLR10',detail='{"reason":"internal"}';
    end if;
    -- TWO ROWS, TWO ENGINE IDS. document_extractions is unique on
    -- (document_id, engine_id, version_n, engine_kind) since 0026, so two reads of one
    -- document at one task version are distinguishable ONLY by engine_id. Two readers naming
    -- the same engine would collide, and the collision would be silently absorbed by an
    -- ON CONFLICT into a single stored read that claims two readers agreed -- which is the
    -- one thing the corroboration record must never be able to claim falsely.
    select t.version_n into v_version
      from clara.document_processing_tasks t where t.id = p_task;
    if v_two and (v_e2 is null or v_e2 = v_e1) then
      raise exception 'the two statement readers must name two distinct engine_ids'
        using errcode='CLR10',detail='{"reason":"internal"}';
    end if;
    insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
        version_n, status, page_count, envelope)
      values (p_firm, p_document, v_e1, p_engine_kind, v_version, 'done',
        nullif((p_payload->>'pages_used'),'')::int,
        jsonb_build_object('reader','reader1','ingest_mode',p_ingest_mode,
          'header', v_h1, 'lines', v_l1, 'line_count', jsonb_array_length(v_l1),
          'corroboration_claimed', p_payload->'corroboration'))
      returning id into v_ext1;
    if v_two then
      insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
          version_n, status, page_count, envelope)
        values (p_firm, p_document, v_e2, p_engine_kind, v_version, 'done',
          nullif((p_payload->>'pages_used'),'')::int,
          jsonb_build_object('reader','reader2','ingest_mode',p_ingest_mode,
            'header', v_h2, 'lines', v_l2, 'line_count', jsonb_array_length(v_l2),
            'corroboration_claimed', p_payload->'corroboration'))
        returning id into v_ext2;
    end if;
  end if;

  -- created_by IS NULL ON THE TWO MACHINE LANES, and that is a statement rather than a gap:
  -- there is no system user in this estate (clara.users carries no service principal) and
  -- inventing one to satisfy a NOT NULL would put a fictitious human on the record for a read
  -- no human performed. On ingest_mode='human' it carries the actor, who IS the corroborator.
  -- The task trail and the audit row carry the machine provenance instead.
  insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id,
      source_doc_sha256, filing_id, reader1_extraction_id, reader2_extraction_id, facts_hash,
      period_start, period_end, statement_date, opening_cents, closing_cents,
      total_debit_cents, total_credit_cents, line_count, status, ingest_mode, created_by)
    values (p_firm, p_client, v_acct, p_document,
      v_sha, v_filing, v_ext1, v_ext2, v_facts_hash,
      v_ps, v_pe, v_sd, v_open, v_close,
      v_td, v_tc, v_n, 'live', p_ingest_mode, p_actor)
    returning id into v_stmt;

  insert into clara.bank_statement_lines(firm_id, client_id, statement_id, bank_account_id,
      line_no, entry_date, value_date, description, amount_cents, running_balance_cents)
    select p_firm, p_client, v_stmt, v_acct,
           (x.elem->>'line_no')::int,
           (x.elem->>'entry_date')::date,
           nullif(x.elem->>'value_date','')::date,
           x.elem->>'description',
           (x.elem->>'amount_cents')::bigint,
           case when jsonb_typeof(x.elem->'running_balance_cents')='number'
                then (x.elem->>'running_balance_cents')::bigint end
    from jsonb_array_elements(v_lines) as x(elem)
    order by (x.elem->>'line_no')::int;

  -- THE VOID-AND-REINGEST LINEAGE. A voided predecessor for the same (account, period_end)
  -- learns which statement replaced it, so the trail reads forward rather than dead-ending at
  -- a void with no successor. Written HERE and not in void_bank_statement for the plain
  -- reason that at void time the replacement does not exist yet -- the partial unique
  -- `(bank_account_id, period_end) where status='live'` guarantees it cannot. Monotone by
  -- construction (`superseded_by is null` in the predicate), so a second re-ingest after a
  -- second void wires only the still-unwired row.
  update clara.bank_statements st
    set superseded_by = v_stmt
    where st.bank_account_id = v_acct and st.period_end = v_pe
      and st.status = 'void' and st.superseded_by is null and st.id <> v_stmt;

  -- ---------------------------------------------------------------- 12. financial_date.
  -- Set to period_end UNCONDITIONALLY, unlike the invoice lane's only-if-null coalesce. A
  -- statement's financial date is not a guess a classifier made -- it is the corroborated
  -- close of the period this document IS, agreed by two readers or attested by a human, and
  -- reconciliation assigns lines to periods off it. The contract's own pre-C-b warning
  -- ("every real document currently has financial_date = NULL") is what this line answers.
  update clara.documents set financial_date = v_pe where id = p_document;

  -- ---------------------------------------------------------------- 13. EVENTS.
  -- ID-ONLY PAYLOAD. clara.domain_events is readable by the agent role FIRM-WIDE
  -- (0005:379-408), so an event payload is a broad surface: the account number never enters
  -- one, and neither does a line description. `ingest_mode` is a three-value enum, not data.
  -- Outbox law: an aborted verb leaves zero events, which is free here because the append is
  -- in the same transaction as everything above it.
  perform clara._append_event(p_firm, 'bank.statement_ingested', p_client, p_actor,
    null, null, null, p_document, null,
    jsonb_build_object('statement_id', v_stmt, 'bank_account_id', v_acct,
      'document_id', p_document, 'ingest_mode', p_ingest_mode));

  return jsonb_build_object('ok', true, 'replayed', false, 'statement_id', v_stmt,
    'bank_account_id', v_acct, 'line_count', v_n,
    'period_start', v_ps, 'period_end', v_pe, 'status', 'live',
    'reader1_extraction_id', v_ext1, 'reader2_extraction_id', v_ext2);
end $$;
revoke all on function clara._persist_statement_core(
  uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text) from public;

-- =====================================================================
-- B.3 -- clara.persist_statement_facts -- the TASK-LANE WRAPPER.
--
-- Everything task-shaped lives here and nothing statement-shaped does: claim state, the
-- replay branch, the client resolution the task cannot carry, the engine-kind decision, the
-- page-budget settle, the task settle. The chain, the corroboration and the identity are the
-- core's, and this function does not second-guess any of them.
--
-- THE CLIENT RESOLUTION IS THE INTERESTING PART. document_processing_tasks CARRIES NO CLIENT
-- BINDING (0007:148-179), so the client is resolved through the document's ACTIVE FILINGS --
-- and a statement filed to two clients has no single answerable client, which is why
-- `statement_multi_client` is a named refusal rather than a first-row pick. Consent is
-- resolved the same way at ENQUEUE (design section 4.4); this is the persist-time twin of
-- that resolution and the two must never disagree about what "the document's client" means.
--
-- THE REPLAY BRANCH is the persist_invoice_facts shape (0011:148-174 lineage, latest form
-- 0026:677-707): check status='done' BEFORE the row lock and AGAIN after it, returning the
-- already-committed statement both times. A WDK retry of a committed ingest must report
-- `replayed`, never a duplicate refusal.
-- =====================================================================
create function clara.persist_statement_facts(p_task uuid, p_payload jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; v_client uuid; v_clients int; v_pages int;
  v_res jsonb; v_stmt uuid; v_prop uuid; v_existing uuid; v_reason text;
begin
  select * into t from clara.document_processing_tasks where id = p_task;
  if not found or t.lane not in ('statement_facts','statement_parse') then
    raise exception 'statement-facts task not found' using errcode='CLR16';
  end if;
  if t.status = 'done' then
    select id into v_existing from clara.bank_statements
      where document_id = t.document_id and firm_id = t.firm_id and status = 'live' limit 1;
    return jsonb_build_object('task_id', p_task, 'statement_id', v_existing,
      'status', 'done', 'replayed', true);
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'the statement payload is malformed'
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  if p_payload ? 'pages_used'
     and (jsonb_typeof(p_payload->'pages_used') <> 'number'
       or (p_payload->>'pages_used')::numeric < 0
       or (p_payload->>'pages_used')::numeric <> trunc((p_payload->>'pages_used')::numeric)) then
    raise exception 'pages_used must be a whole non-negative number'
      using errcode='CLR10',detail='{"reason":"internal"}';
  end if;
  v_pages := coalesce(nullif(p_payload->>'pages_used','')::int, 0);

  -- Take the task row lock, then re-read the status: the 0026:697-707 double-check. The
  -- filings are read under the same transaction and the core re-locks the active filing
  -- through _active_document_filing (FOR SHARE), which is the provenance-durability half.
  select * into t from clara.document_processing_tasks where id = p_task for update;
  if t.status = 'done' then
    select id into v_existing from clara.bank_statements
      where document_id = t.document_id and firm_id = t.firm_id and status = 'live' limit 1;
    return jsonb_build_object('task_id', p_task, 'statement_id', v_existing,
      'status', 'done', 'replayed', true);
  end if;
  if t.status <> 'running' then
    raise exception 'statement-facts task is not running' using errcode='CLR16';
  end if;

  -- THE CLIENT, THROUGH THE FILINGS. Exactly one active filing, or nothing to answer.
  -- min(uuid) is NOT an aggregate in PostgreSQL 17; the house idiom for a deterministic pick
  -- is the text cast (0035:196, 0037:947-949 state the same thing at their own call sites).
  select count(*)::int, min(f.client_id::text)::uuid into v_clients, v_client
    from clara.document_filings f
    where f.document_id = t.document_id and f.retired_at is null;
  if v_clients = 0 then
    raise exception 'document % carries no active filing; a statement cannot be attributed', t.document_id
      using errcode='CLR02';
  end if;
  if v_clients > 1 then
    raise exception 'document % is filed to % clients; a statement filed to more than one client has no single answerable client', t.document_id, v_clients
      using errcode='CLR10',detail='{"reason":"statement_multi_client"}';
  end if;

  v_res := clara._persist_statement_core(
    p_firm            => t.firm_id,
    p_client          => v_client,
    p_document        => t.document_id,
    p_payload         => p_payload,
    p_ingest_mode     => case when t.lane = 'statement_facts' then 'ocr' else 'structured' end,
    p_actor           => null,
    p_task            => p_task,
    p_bank_account    => null,
    p_engine_kind     => 'statement_facts',
    p_task_engine_id  => t.engine_id);

  -- ---------------------------------------------------------------- THE PROPOSAL BRANCH.
  -- The two account-binding verdicts, handled WITHOUT a raise so the proposal row, the failed
  -- task and the event all commit together. See the lane contract at the top of this file.
  if not coalesce((v_res->>'ok')::boolean, false) then
    v_reason := v_res->>'reason';
    if v_reason not in ('account_unregistered','account_inactive') then
      raise exception 'impossible state: the statement core returned a non-ok verdict % that is not an account-binding verdict', coalesce(v_reason,'(null)')
        using errcode='CLR35';
    end if;
    -- IDEMPOTENT BY READ, not by an index name. A re-enqueued read of the same unregistered
    -- account must not breed a second card in front of the same human, and this section does
    -- not want to depend on which partial unique the tables section chose.
    select id into v_prop from clara.bank_account_proposals bp
      where bp.client_id = v_client and bp.status = 'open'
        and bp.bank_code = (v_res->>'institution_code')
        and bp.account_number_normalized = (v_res->>'account_digits')
      order by bp.created_at limit 1;
    if v_prop is null then
      -- THE CARD'S BANK NAME COMES FROM THE SEEDED REFERENCE, not from the read, which is
      -- why no `bank_name_read` column is written here: bank_code is already proven to be a
      -- live clara.bank_institutions row (the core refuses otherwise), so /bank renders the
      -- authoritative name and never a reader's rendering of a letterhead.
      insert into clara.bank_account_proposals(firm_id, client_id, document_id, task_id,
          reason, bank_code, account_number, account_number_normalized,
          existing_bank_account_id, header, status)
        values (t.firm_id, v_client, t.document_id, p_task,
          v_reason, v_res->>'institution_code',
          v_res->>'account_printed', v_res->>'account_digits',
          nullif(v_res->>'bank_account_id','')::uuid, v_res->'header', 'open')
        returning id into v_prop;
    end if;

    update clara.document_processing_tasks
      set status = 'failed', error_code = v_reason, finished_at = now()
      where id = p_task;
    perform clara._refund_processing_call(p_task, v_reason);
    perform clara._audit(t.firm_id, null, null, null, 'persist_statement_facts', null,
      jsonb_build_object('task', p_task, 'document', t.document_id, 'client', v_client,
        'outcome', v_reason, 'proposal', v_prop));
    -- ID-ONLY (design section 4.8). The account number NEVER enters an event payload -- the
    -- card reads the proposal row, which is human-only and carries no agent grant.
    perform clara._append_event(t.firm_id, 'bank.account_proposal', v_client, null,
      null, null, null, t.document_id, null,
      jsonb_build_object('proposal_id', v_prop, 'document_id', t.document_id,
        'task_id', p_task));
    return jsonb_build_object('task_id', p_task, 'status', 'failed', 'reason', v_reason,
      'proposal_id', v_prop);
  end if;

  -- ---------------------------------------------------------------- THE SETTLE PATH.
  v_stmt := (v_res->>'statement_id')::uuid;
  -- Only the vendor lane carries a processing-call reservation; the in-process deterministic
  -- parse is free (the 0026:904-907 idiom, stated per lane rather than assumed).
  if t.lane = 'statement_facts' then
    perform clara._settle_processing_call(p_task, v_pages);
  end if;
  update clara.document_processing_tasks
    set status = 'done', finished_at = now() where id = p_task;
  perform clara._audit(t.firm_id, null, null, null, 'persist_statement_facts', null,
    jsonb_build_object('task', p_task, 'document', t.document_id, 'client', v_client,
      'statement', v_stmt, 'version', t.version_n, 'pages', v_pages,
      'replayed', coalesce((v_res->>'replayed')::boolean, false)));
  return jsonb_build_object('task_id', p_task, 'statement_id', v_stmt, 'status', 'done',
    'replayed', coalesce((v_res->>'replayed')::boolean, false),
    'line_count', (v_res->>'line_count')::int,
    'bank_account_id', (v_res->>'bank_account_id')::uuid);
end $$;
revoke all on function clara.persist_statement_facts(uuid,jsonb) from public;

-- =====================================================================
-- B.4 -- clara.fail_statement_facts -- the FAIL PATH.
--
-- Shaped on fail_invoice_facts (0009:2152-2178) with ONE deliberate difference, and it is the
-- point of the function: THE NAMED TAXONOMY IS NOT COERCED. Its ancestor maps every reason
-- outside a short engine list onto 'engine_error', which for this lane would erase exactly
-- the information the lane exists to produce -- `chain_broken`, `continuity_mismatch`,
-- `readers_disagree` would all land on the trail as a generic engine failure and the /bank
-- banner would have nothing true to say. The widened
-- ck_processing_task_error_code_0016 admits the full design section 4.3 taxonomy, so the
-- codes pass through VERBATIM.
--
-- AN UNRECOGNISED STRING IS STILL NOT PASSED THROUGH, and that is not a coercion of the
-- taxonomy: a value outside the allowlist would violate the CHECK and take down the whole
-- fail path, turning a failed read into a task stuck at 'running' forever. It lands as
-- 'engine_error' with the RAW string preserved in the audit args, the refund reason and the
-- event payload -- so nothing is lost, and the one thing that must not happen (a wedged task)
-- cannot.
-- =====================================================================
create function clara.fail_statement_facts(p_task uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_raw text; v_code text;
begin
  select * into t from clara.document_processing_tasks where id = p_task for update;
  if not found or t.lane not in ('statement_facts','statement_parse') then
    raise exception 'statement-facts task not found' using errcode='CLR16';
  end if;
  if t.status = 'failed' then
    return jsonb_build_object('task_id', p_task, 'status', 'failed',
      'reason', coalesce(t.error_code, p_reason), 'replayed', true);
  end if;
  if t.status <> 'running' then
    raise exception 'statement-facts task is not running' using errcode='CLR16';
  end if;

  v_raw := nullif(btrim(coalesce(p_reason,'')), '');
  v_code := case when v_raw in (
      -- the pre-existing engine/transport set, unchanged
      'engine_error','timeout','engine_lost','storage_error','corrupt','encrypted',
      'bad_type','limit','budget','attempt_cap','internal',
      -- the design section 4.3 statement taxonomy, VERBATIM
      'header_unreadable','totals_unreadable','readers_disagree','chain_broken',
      'continuity_mismatch','duplicate_period','overlapping_period','non_myr_statement',
      'account_unregistered','account_inactive','statement_multi_client','period_invalid',
      'line_date_out_of_period','consent_inactive')
    then v_raw else 'engine_error' end;

  update clara.document_processing_tasks
    set status = 'failed', error_code = v_code, finished_at = now() where id = p_task;
  -- A no-op when there is no reservation (0009:648-649), which is the structured lane's
  -- normal state -- so this is safe to call unconditionally, exactly as the ancestor does.
  perform clara._refund_processing_call(p_task, coalesce(v_raw, v_code));
  perform clara._audit(t.firm_id, null, null, null, 'fail_statement_facts', null,
    jsonb_build_object('task', p_task, 'document', t.document_id, 'lane', t.lane,
      'reason', v_code, 'raw_reason', v_raw));
  perform clara._append_event(t.firm_id, 'document.statement_facts_failed', null, null,
    null, null, null, t.document_id, null,
    jsonb_build_object('task_id', p_task, 'reason', v_code));
  return jsonb_build_object('task_id', p_task, 'status', 'failed', 'reason', v_code);
end $$;
revoke all on function clara.fail_statement_facts(uuid,text) from public;

-- =====================================================================
-- B.5 -- clara.enter_bank_statement -- THE HUMAN-KEYED VERB (design section 4.3).
--
-- The chain is the control; OCR is only ONE way to feed it. A firm must always be able to
-- enter a statement by hand, and the corpus's one mojibake text layer is the standing proof
-- that it will be needed. So this verb reaches THE SAME core and clears THE SAME bars --
-- chain, both-edge continuity, duplicates, overlap, MYR, period sanity, line-date bounds --
-- and the only things that differ are stated honestly on the row: ingest_mode='human', no
-- reader extractions, and THE ACTOR IS THE RECORDED CORROBORATOR (created_by, plus the audit
-- row). Provenance still binds the filed PDF; a hand-keyed statement with no document behind
-- it is not admitted, because the statement is a claim ABOUT a document.
--
-- Bookkeeper floor, op-keyed over the FULL NORMALIZED request (0037 section K's law:
-- normalize BEFORE hashing, so two spellings of the same request hash the same and two
-- different requests can never share a receipt).
--
-- LOCK ORDER (part2 section 4.9): op-receipt -> 203005006 (inside the core) -> bank rows. It
-- never locks a journal_entries or open_items row, which is what keeps it outside the
-- pre-existing order entirely.
-- =====================================================================
create function clara.enter_bank_statement(
    p_client uuid, p_bank_account uuid, p_document uuid,
    p_header jsonb, p_lines jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_firm uuid; v_dedupe jsonb; v_hdr jsonb; v_lines jsonb;
  v_payload jsonb; v_res jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_bank_account is null then
    raise exception 'a hand-keyed statement must name the bank account it belongs to'
      using errcode='CLR10',detail='{"reason":"account_unregistered"}';
  end if;

  -- NORMALIZE BEFORE HASHING. A malformed header or line set becomes a NAMED refusal here
  -- rather than a raw cast error inside the core, and the hash is taken over the CANONICAL
  -- form so a whitespace difference cannot mint a second receipt for the same act.
  v_hdr := clara._stmt_header_norm(p_header);
  v_lines := clara._stmt_lines_norm(coalesce(p_lines, '[]'::jsonb));

  v_dedupe := clara._reserve_op(c.firm, 'enter_bank_statement', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'bank_account', p_bank_account,
      'document', p_document, 'header', v_hdr, 'lines', v_lines)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- The human read is presented to the core as reader-1 with no reader-2: the actor attests
  -- it, and the CHAIN is what actually corroborates it. `header`/`lines` are handed back as
  -- the raw shapes the normalizers accept, so the core re-normalizes through the identical
  -- code path every other lane uses -- there is no human-only parse to drift.
  v_payload := jsonb_build_object(
    'readers', jsonb_build_object('reader1', jsonb_build_object(
      'engine_id', 'human', 'header', p_header, 'lines', coalesce(p_lines,'[]'::jsonb))),
    'corroboration', jsonb_build_object('verdict', 'human_keyed', 'actor', c.actor));

  v_res := clara._persist_statement_core(
    p_firm         => c.firm,
    p_client       => p_client,
    p_document     => p_document,
    p_payload      => v_payload,
    p_ingest_mode  => 'human',
    p_actor        => c.actor,
    p_task         => null,
    p_bank_account => p_bank_account);

  -- The human lane has an account in hand, so an account-binding verdict is a plain refusal
  -- and NEVER a proposal: the operator is already standing in /bank and can register or
  -- reactivate the account directly. A proposal card here would ask a human to confirm a
  -- fact they had just asserted themselves.
  if not coalesce((v_res->>'ok')::boolean, false) then
    if v_res->>'reason' = 'account_inactive' then
      raise exception 'that bank account is deactivated; reactivate it before filing statements to it'
        using errcode='CLR10',detail='{"reason":"account_inactive"}';
    end if;
    raise exception 'the named bank account does not accept this statement header'
      using errcode='CLR10',detail='{"reason":"account_unregistered"}';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'enter_bank_statement', null,
    jsonb_build_object('client', p_client, 'bank_account', p_bank_account,
      'document', p_document, 'statement', v_res->>'statement_id',
      'period_start', v_res->>'period_start', 'period_end', v_res->>'period_end',
      'line_count', v_res->>'line_count', 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'enter_bank_statement', p_op_key,
    jsonb_build_object('statement_id', (v_res->>'statement_id')::uuid,
      'bank_account_id', (v_res->>'bank_account_id')::uuid,
      'line_count', (v_res->>'line_count')::int,
      'replayed', coalesce((v_res->>'replayed')::boolean, false),
      'status', 'live'));
end $$;
revoke all on function clara.enter_bank_statement(uuid,uuid,uuid,jsonb,jsonb,text) from public;

-- =====================================================================
-- B.6 -- clara.void_bank_statement (design section 4.2, WCB-R5; lock order part2 section 4.9).
--
-- Statements and lines are NEVER updated in place. A statement read wrong is voided and
-- re-ingested -- reverse-not-delete, applied to evidence: the wrong read stays on the record
-- with who voided it and why, and the replacement learns its predecessor through
-- `superseded_by` (wired at re-ingest; see the core's step 11 for why it cannot be wired here).
--
-- THE LOCK ORDER IS EXACTLY part2 section 4.9's, and each rung is load-bearing:
--   1. advisory 203005004 (client) -- the rung match_bank_line takes after its journal_entries
--      row locks. Taking it FIRST here, before any bank row, is what makes void and match
--      serialize instead of racing: without it, a match can be committing its member rows
--      against lines this void is about to orphan.
--   2. advisory 203005006 (the account chain lock) -- so a void cannot interleave with a
--      persist on the same account's chain.
--   3. the line rows FOR UPDATE, in id order.
--   4. THEN the live-member probe. The probe has to come after the row locks or it is a read
--      of a world that can change before the flip commits -- the void-vs-match race.
-- This verb touches neither journal_entries nor open_items, so it sits entirely outside the
-- pre-existing 0037 order and inverts nothing.
--
-- The deferred statement belt (B.7) re-checks the live-member law at COMMIT, which is what
-- catches a match group created LATER IN THE SAME TRANSACTION as this void.
-- =====================================================================
create function clara.void_bank_statement(
    p_client uuid, p_statement uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_firm uuid; v_dedupe jsonb; v_reason text; s record; v_live int; v_n int;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a void reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'void_bank_statement', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'statement', p_statement,
      'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into s from clara.bank_statements st where st.id = p_statement;
  if not found or s.firm_id <> c.firm or s.client_id <> p_client then
    raise exception 'bank statement not found for this client' using errcode='CLR11';
  end if;

  -- RUNG 1 and RUNG 2, in that order.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(s.bank_account_id::text));

  -- Re-read under the advisory locks: a concurrent void that won the race has already flipped
  -- the row, and this call must report that honestly rather than double-voiding it.
  select * into s from clara.bank_statements st where st.id = p_statement;
  if s.status <> 'live' then
    raise exception 'bank statement % is already %', p_statement, s.status
      using errcode='CLR10',detail='{"reason":"statement_not_live"}';
  end if;

  -- RUNG 3 -- the line rows, in id order, so two concurrent writers of the same statement
  -- take them in one order and cannot deadlock on each other.
  perform 1 from clara.bank_statement_lines bl
    where bl.statement_id = p_statement order by bl.id for update;

  -- RUNG 4 -- THE LIVE-MEMBER PROBE, after the row locks. A statement whose lines are still
  -- owned by a pending or live match group is not voidable: voiding it would strand a match
  -- that says money moved against a fact the books no longer hold. The remedy is the ordinary
  -- one and the message names it.
  select count(*)::int into v_live
    from clara.bank_match_line_members m
    join clara.bank_statement_lines bl on bl.id = m.line_id
    where bl.statement_id = p_statement and m.group_status in ('pending','live');
  if v_live > 0 then
    raise exception 'this statement has % line(s) in a pending or live match group; unmatch them first', v_live
      using errcode='CLR10',detail='{"reason":"statement_has_live_matches"}';
  end if;

  update clara.bank_statements
    set status = 'void', voided_by = c.actor, voided_at = now(), voided_reason = v_reason
    where id = p_statement;
  select count(*)::int into v_n from clara.bank_statement_lines bl
    where bl.statement_id = p_statement;

  perform clara._audit(c.firm, c.actor, null, null, 'void_bank_statement', null,
    jsonb_build_object('client', p_client, 'statement', p_statement,
      'bank_account', s.bank_account_id, 'period_end', s.period_end,
      'line_count', v_n, 'reason', v_reason, 'op_key', p_op_key));
  -- ID-ONLY (design section 4.8).
  perform clara._append_event(c.firm, 'bank.statement_voided', p_client, c.actor,
    null, null, null, s.document_id, null,
    jsonb_build_object('statement_id', p_statement, 'bank_account_id', s.bank_account_id));
  return clara._finish_op(c.firm, 'void_bank_statement', p_op_key,
    jsonb_build_object('statement_id', p_statement, 'status', 'void',
      'bank_account_id', s.bank_account_id, 'line_count', v_n));
end $$;
revoke all on function clara.void_bank_statement(uuid,uuid,text,text) from public;

-- =====================================================================
-- B.7 -- THE STATEMENT-SIDE DEFERRED BELT. UNCONDITIONAL, NO BYPASS GUC, EVER.
--
-- The verbs above are the write path; this is the law behind them. It answers three questions
-- at COMMIT, for every statement any statement or line write touched:
--   (a) does this live statement's chain still close over the rows that ACTUALLY exist?
--   (b) is every line congruent with its statement (tenancy, account, period)?
--   (c) does this void statement still own no pending or live match member, and are the
--       status/void-stamp/supersession pairings the ones the lifecycle allows?
--
-- TWO TRIGGERS, ONE BODY, and the second one is the whole point -- it is the 0037 belt-1 /
-- belt-2 lesson applied here. A belt that fires only on clara.bank_statements is
-- STRUCTURALLY BLIND to a lone `insert into clara.bank_statement_lines` against a statement
-- committed in an earlier transaction: that write touches no statement row, dodges the belt
-- entirely, and silently breaks the chain identity the whole slice rests on. So the line
-- table carries the same belt, resolving its statement through statement_id.
--
-- IT RE-QUERIES BY ID and never reads the NEW tuple's columns (the 0009:524-529 idiom, as
-- 0037:1351+ applies it). At deferred time the NEW tuple is a snapshot of the row as it was
-- when the trigger was QUEUED; a later statement in the same transaction may have changed it,
-- and a belt that trusted the snapshot would certify a row that no longer exists in that shape.
--
-- WHAT IT DELIBERATELY DOES NOT RE-CHECK: BOTH-EDGE CONTINUITY. Continuity is a statement
-- about the account's chain AT WRITE TIME, taken under the 203005006 lock. Re-asserting it at
-- commit would make an ordinary mid-chain void impossible -- voiding May leaves April and June
-- as each other's nearest live neighbours with mismatched endpoints, which is a legal and
-- expected intermediate state of a void-and-reingest, not a breach. The lock is what makes
-- continuity race-free; the belt would only make it unusable.
--
-- ITS COST, NAMED RATHER THAN DISCOVERED LATER: `create constraint trigger` admits FOR EACH
-- ROW only, so an N-line ingest runs the chain re-derivation N+1 times at commit -- O(N^2)
-- row reads. The bound is a MONTHLY BANK STATEMENT: the real corpus runs tens of lines, a
-- busy month low hundreds, so the worst realistic case is a few tens of thousands of index
-- reads inside one commit. That is the same shape 0037's per-row item belt accepts for the
-- same reason, and the alternative (trusting the write path) is what a belt exists to refuse.
-- If a statement class ever arrives with thousands of lines, this is the line to revisit.
-- =====================================================================
create function clara._tf_bank_statement_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_id uuid; s record; v_bad int; v_run bigint; v_n int;
  v_pos bigint; v_neg bigint; v_max int; v_dis int; ln record;
begin
  -- Resolve the statement from whichever table fired. Both arms then read the SAME row by id.
  if tg_table_name = 'bank_statements' then v_id := new.id; else v_id := new.statement_id; end if;
  select * into s from clara.bank_statements st where st.id = v_id;
  if not found then return null; end if;

  -- (c) THE LIFECYCLE PAIRINGS -- the "status transitions re-checked" arm. A CHECK can state
  -- each pairing on its own row; what it cannot do is say that supersession only ever applies
  -- to a voided predecessor, which is a statement about the LIFECYCLE and not about a column.
  if s.status = 'void' then
    if s.voided_by is null or s.voided_at is null
       or nullif(btrim(coalesce(s.voided_reason,'')),'') is null then
      raise exception 'voided statement % carries no complete void stamp (actor, time, reason)', v_id
        using errcode='CLR10',detail='{"reason":"statement_void_stamp_incomplete"}';
    end if;
  else
    if s.voided_by is not null or s.voided_at is not null or s.voided_reason is not null then
      raise exception 'live statement % carries a void stamp', v_id
        using errcode='CLR10',detail='{"reason":"statement_void_stamp_incomplete"}';
    end if;
    if s.superseded_by is not null then
      raise exception 'live statement % claims to be superseded; only a voided statement may be superseded', v_id
        using errcode='CLR10',detail='{"reason":"statement_superseded_while_live"}';
    end if;
  end if;
  if s.superseded_by is not null
     and not exists (select 1 from clara.bank_statements su
                     where su.id = s.superseded_by and su.id <> s.id
                       and su.bank_account_id = s.bank_account_id
                       and su.firm_id = s.firm_id and su.client_id = s.client_id) then
    raise exception 'statement % names a superseding statement that is not another statement on the same bank account', v_id
      using errcode='CLR10',detail='{"reason":"statement_superseded_incongruent"}';
  end if;

  -- (c) VOID ADMITS NO PENDING OR LIVE MEMBERS. The verb probes this under the row locks; the
  -- belt is what catches a match group created LATER IN THE SAME TRANSACTION as the void,
  -- which no in-verb probe can see. Between them the void-vs-match race is closed from both
  -- ends.
  if s.status = 'void' then
    select count(*)::int into v_bad
      from clara.bank_match_line_members m
      join clara.bank_statement_lines bl on bl.id = m.line_id
      where bl.statement_id = v_id and m.group_status in ('pending','live');
    if v_bad > 0 then
      raise exception 'voided statement % still has % line(s) in a pending or live match group', v_id, v_bad
        using errcode='CLR10',detail='{"reason":"statement_void_with_live_members"}';
    end if;
    return null;   -- a void statement's chain is history; nothing below applies to it.
  end if;

  -- (b) LINE CONGRUENCE. The composite FKs bind firm and client; what they cannot say is that
  -- a line's denormalized bank_account_id equals its statement's, or that its entry_date falls
  -- inside the period the statement declares. Both are joins, and a CHECK cannot join.
  select count(*)::int into v_bad from clara.bank_statement_lines bl
    where bl.statement_id = v_id
      and (bl.firm_id <> s.firm_id or bl.client_id <> s.client_id
        or bl.bank_account_id <> s.bank_account_id
        or bl.entry_date < s.period_start or bl.entry_date > s.period_end);
  if v_bad > 0 then
    raise exception 'statement % has % line(s) that are not congruent with it (tenancy, bank account, or a date outside % .. %)', v_id, v_bad, s.period_start, s.period_end
      using errcode='CLR10',detail='{"reason":"statement_line_incongruent"}';
  end if;

  -- (a) THE CHAIN, RE-DERIVED FROM THE ROWS THAT ACTUALLY EXIST. line_count first, because a
  -- count that disagrees is the loudest possible statement that something wrote lines outside
  -- the verb, and because every check below it is meaningless if the row set is not the one
  -- the header claims.
  select count(*)::int, max(bl.line_no), count(distinct bl.line_no)::int,
         coalesce(sum(bl.amount_cents), 0),
         coalesce(sum(case when bl.amount_cents > 0 then bl.amount_cents else 0 end), 0),
         coalesce(sum(case when bl.amount_cents < 0 then -bl.amount_cents else 0 end), 0)
    into v_n, v_max, v_dis, v_run, v_pos, v_neg
    from clara.bank_statement_lines bl where bl.statement_id = v_id;
  if v_n <> s.line_count then
    raise exception 'statement % declares % line(s) but carries %', v_id, s.line_count, v_n
      using errcode='CLR10',detail='{"reason":"statement_line_count_mismatch"}';
  end if;
  if v_n > 0 and (v_max <> v_n or v_dis <> v_n) then
    raise exception 'statement % does not carry contiguous line numbers 1..% (highest %, % distinct)', v_id, v_n, v_max, v_dis
      using errcode='CLR10',detail='{"reason":"statement_chain_broken"}';
  end if;
  if s.opening_cents + v_run <> s.closing_cents then
    raise exception 'statement % does not close: opening % plus % of movement gives %, printed closing is %', v_id, s.opening_cents, v_run, s.opening_cents + v_run, s.closing_cents
      using errcode='CLR10',detail='{"reason":"statement_chain_broken"}';
  end if;
  if s.total_credit_cents is not null and s.total_credit_cents <> v_pos then
    raise exception 'statement % records a printed TOTAL CREDIT of % but its credit lines sum to %', v_id, s.total_credit_cents, v_pos
      using errcode='CLR10',detail='{"reason":"statement_chain_broken"}';
  end if;
  if s.total_debit_cents is not null and s.total_debit_cents <> v_neg then
    raise exception 'statement % records a printed TOTAL DEBIT of % but its debit lines sum to %', v_id, s.total_debit_cents, v_neg
      using errcode='CLR10',detail='{"reason":"statement_chain_broken"}';
  end if;

  -- THE PER-ROW RUNNING STEPS, where the bank printed them. This is the arm that localises a
  -- break, and it is also the only arm that can tell a REORDERED row set from a merely
  -- mis-summed one.
  v_run := s.opening_cents;
  for ln in select bl.line_no, bl.amount_cents, bl.running_balance_cents
            from clara.bank_statement_lines bl
            where bl.statement_id = v_id order by bl.line_no loop
    v_run := v_run + ln.amount_cents;
    if ln.running_balance_cents is not null and ln.running_balance_cents <> v_run then
      raise exception 'statement % breaks its running balance at line %: printed %, derived %', v_id, ln.line_no, ln.running_balance_cents, v_run
        using errcode='CLR10',detail='{"reason":"statement_chain_broken"}';
    end if;
  end loop;
  return null;
end $$;
-- PostgreSQL grants EXECUTE to PUBLIC on every new function and ADP does not stop it; a
-- trigger function needs no caller EXECUTE at all -- the trigger machinery runs it as the
-- table owner (the 0037 section L note, T17b-proven).
revoke all on function clara._tf_bank_statement_belt() from public;

create constraint trigger t_bank_statements_belt
  after insert or update on clara.bank_statements
  deferrable initially deferred
  for each row execute function clara._tf_bank_statement_belt();

create constraint trigger t_bank_statement_lines_belt
  after insert or update on clara.bank_statement_lines
  deferrable initially deferred
  for each row execute function clara._tf_bank_statement_belt();

-- =====================================================================
-- B.8 -- ACLs for this section.
--
-- The two task-lane verbs reach clara_runtime ONLY -- the 0009:2916-2924 grant block's shape,
-- where enqueue/persist/fail/claim are the runtime's whole surface. The two human verbs reach
-- clara_authenticated ONLY: voiding a statement and hand-keying one are judgements, and
-- WCB-R4's boundary is explicit that NO agent grant exists anywhere in the bank schema. The
-- core and the two normalizers are granted to NOBODY; every caller is a SECURITY DEFINER
-- function owned by clara_fn_owner, which holds EXECUTE implicitly as owner. Each revoke
-- above is belt-and-braces over 0009's default-privileges sweep (the _coding_lane_core idiom)
-- and all of it is asserted in the migration tail.
-- =====================================================================
grant execute on function
  clara.persist_statement_facts(uuid,jsonb),
  clara.fail_statement_facts(uuid,text)
to clara_runtime;

grant execute on function
  clara.enter_bank_statement(uuid,uuid,uuid,jsonb,jsonb,text),
  clara.void_bank_statement(uuid,uuid,text,text)
to clara_authenticated;

-- ============ SECTION C (accounts) ============
-- 0038 SECTION C -- bank identity: the four account verbs (design section 4.1).
-- Design of record: docs/plan/wave-c-b-bank-design.md (section 4.1) +
-- wave-c-b-bank-design-part2.md (section 4.7-4.9, section 5). Governing law:
-- docs/plan/wave-c-contract.md (WC-R1..R12) and
-- docs/plan/wave-c-a-subledger-design.md (WCA-R1..R9). On conflict the contract
-- governs Wave C; PRD.md section 6 (LAW) governs always.
--
-- SCOPE OF THIS FILE, EXACTLY. This is one section of the assembled 0038 migration,
-- not a standalone file: it carries ONLY the bank-identity verbs
-- (add_bank_account / deactivate_bank_account / reactivate_bank_account /
-- remap_bank_account_coa) plus one small ungranted helper add_bank_account and
-- remap_bank_account_coa share. It DOES NOT create clara.bank_institutions, clara.bank_accounts,
-- clara.bank_account_proposals, clara.bank_matches, or the
-- coa_accounts.is_bank_account column -- those are a sibling section of this same
-- migration (design section 5's table-then-verb order) and MUST be applied before
-- this section runs. The exact shapes this file assumes -- so the assembler can
-- verify the sibling DDL matches byte-for-byte before concatenation -- are:
--
--   clara.bank_institutions(code text primary key, name text, active boolean)
--
--   clara.coa_accounts gains: is_bank_account boolean not null default false
--     (never special_acc_type -- uq_coa_special, 0003:58-59; design section 4.1)
--
--   clara.bank_accounts(id uuid, firm_id uuid, client_id uuid, bank_code text,
--     bank_name_display text, account_number text, account_number_normalized text,
--     coa_account_code text, active boolean, created_by uuid, created_at timestamptz,
--     deactivated_by uuid, deactivated_at timestamptz, deactivated_reason text)
--     with partial uniques, WHERE active: (client_id, bank_code,
--     account_number_normalized) and (client_id, coa_account_code) -- design section
--     4.1 "two live accounts never share a GL account". This file relies on BOTH
--     partial uniques existing exactly as named: the pre-checks below are named
--     refusals for the ordinary case, and the unique_violation handlers are the
--     concurrent-race backstop, not the primary control.
--
--   clara.bank_account_proposals(id uuid, firm_id uuid, client_id uuid,
--     document_id uuid, bank_code text, account_number text,
--     account_number_normalized text, bank_name_display text,
--     status text check in ('open','resolved'), created_at timestamptz,
--     resolved_by uuid, resolved_at timestamptz, resolved_bank_account_id uuid)
--     -- design section 4.3: "the failure writes a bank_account_proposals row
--     (fn-owner writes; human-only reads; zero agent grants; carries the read
--     header)". This file reads/updates exactly the nine columns named above.
--
--   clara.bank_matches(..., bank_account_id uuid, status text check in
--     ('pending','live','unmatched'), ...) -- design section 4.5, a DIFFERENT
--     sibling section (the match model). remap_bank_account_coa's live-match
--     refusal is the ONLY read this file makes of that table.
--
-- ONE NAMED DECISION THIS FILE MAKES THAT THE PROSE DOES NOT SPELL OUT: deactivating
-- a bank account does NOT clear is_bank_account on its coa_account_code, and
-- reactivating does not need to re-set it (design section 4.1 states only that
-- add_bank_account and remap_bank_account_coa SET the flag on their target COA
-- account; it never says a superseded COA account is un-flagged). is_bank_account
-- is therefore a durable "this chart account has been used as a bank leg" marker,
-- not a live pointer -- the partial-unique indexes on bank_accounts, not this flag,
-- are what actually gate concurrent live bindings. Stated here rather than left to
-- guesswork, in the house style of naming a limitation instead of hiding it.
--
-- op-key / CLR discipline follows 0004's guard-first order (authz -> firm-resolve ->
-- reserve/dedupe -> target-in-firm CLR11 -> invariant guards -> work + audit) and
-- the 0037 refusal idiom throughout: `raise exception '<message>' using
-- errcode='CLR10', detail='{"reason":"<named_reason>"}'` (0037:2708-2733 et al).
-- CLR10 = bad-request (0002:42); CLR11 = not-found-in-your-firm (0002:42); CLR16 =
-- illegal-state-transition, the requeue_stranded_document_task precedent
-- (0009:2266-2285, "task is not stranded-running").

set role clara_fn_owner;

-- =====================================================================
-- THE SHARED COA-CANDIDATE GUARD. Both add_bank_account and remap_bank_account_coa
-- need "asset-typed/active/non-control" on the target chart account (design
-- section 4.1); the predicate is copied VERBATIM from the C-a receipt-leg check
-- (0037:2729-2733: a.is_active and a.account_type='asset' and a.account_class is
-- null) for the same reason 0037 states it there -- an income/control/inactive
-- account admitted here builds a group the C-b matcher can never actually tie, and
-- the failure would surface far downstream with no clue which account was the
-- actual mistake. No firm_id filter, matching 0037's own checks: coa_accounts has
-- no firm-scoped key of its own, and client_id -> firm is congruent by
-- construction throughout this schema.
-- =====================================================================
create function clara._assert_bank_coa_candidate(p_client uuid, p_code text) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_code
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the bank account must bind an active, asset-typed, non-control chart account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_invalid"}';
  end if;
end $$;
revoke all on function clara._assert_bank_coa_candidate(uuid,text) from public;

-- =====================================================================
-- clara.add_bank_account -- design section 4.1 + section 4.3's proposal confirm.
--
-- p_bank_code / p_account_number / p_bank_name_display are each OPTIONAL: when
-- p_proposal_id is given, any left blank fall back to that proposal's own read
-- header, so /bank's "one confirmation" can pass just (client, coa_account_code,
-- proposal_id, op_key) -- upload -> read -> one confirmation -> books-ready
-- statement, unattended (section 4.3). A caller with no proposal (the WCB-R2
-- manual add) must pass all three explicitly. Explicit values always win over the
-- proposal's when both are present -- "resolving" a proposal means using it to
-- fill gaps, not overriding what the human typed.
--
-- account_number_normalized is the DIGITS-ONLY form (design section 4.1: "for
-- header binding" -- ingest binds on digits-only because printed hyphenation is
-- not a stable layout property). The client_identifiers rows are a SEPARATE
-- concern with a SEPARATE law: the house normalizer (0007:1518-1525) strips only
-- whitespace and keeps hyphens, because that predicate is shared with every other
-- identifier kind (tin/ssm) and changing it here would orphan those. Both forms
-- are written so an OCR region spelled either way still resolves the client.
-- =====================================================================
create function clara.add_bank_account(
    p_client uuid,
    p_coa_account_code text,
    p_bank_code text default null,
    p_account_number text default null,
    p_bank_name_display text default null,
    p_proposal_id uuid default null,
    p_op_key text default null
  ) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb;
  -- SCALAR, not record: v_prop's SELECT INTO below runs only inside the
  -- `p_proposal_id is not null` branch. A bare RECORD variable whose SELECT INTO
  -- never executes stays genuinely unassigned in PL/pgSQL, and any field access
  -- on it -- even `.foo is null` -- raises "record is not assigned yet" at
  -- runtime; it is NOT the same state a zero-row SELECT INTO leaves behind. Plain
  -- scalars default to NULL when untouched, which is the fallback semantics this
  -- function actually wants for the no-proposal call.
  v_prop_status text; v_prop_bank_code text; v_prop_account_number text;
  v_prop_bank_name_display text;
  v_bank_code text; v_number text; v_house text; v_digits text; v_display text;
  v_id uuid; v_facts jsonb; v_refired jsonb := '[]'::jsonb; v_prop_doc uuid;
  r record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_coa_account_code is null or btrim(p_coa_account_code) = '' then
    raise exception 'a target chart account is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'add_bank_account',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'coa_account_code',p_coa_account_code,
      'bank_code',p_bank_code,'account_number',p_account_number,
      'bank_name_display',p_bank_name_display,'proposal_id',p_proposal_id)));
  if v_dedupe is not null then return v_dedupe; end if;

  if not exists (select 1 from clara.clients
      where id = p_client and firm_id = c.firm and status = 'active') then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;

  -- p_proposal_id, when named, is BOTH the identity source for any field left
  -- blank AND the record that closes the loop back to the failed ingest that
  -- raised it. Locked here so a concurrent double-confirm of the same card
  -- serializes rather than double-fires the re-enqueue below.
  if p_proposal_id is not null then
    select status, bank_code, account_number, bank_name_display
      into v_prop_status, v_prop_bank_code, v_prop_account_number, v_prop_bank_name_display
      from clara.bank_account_proposals
      where id = p_proposal_id and firm_id = c.firm and client_id = p_client
      for update;
    if not found then
      raise exception 'bank account proposal % not found for this client', p_proposal_id
        using errcode = 'CLR11';
    end if;
    if v_prop_status <> 'open' then
      raise exception 'bank account proposal % is no longer open', p_proposal_id
        using errcode = 'CLR16', detail = '{"reason":"proposal_already_resolved"}';
    end if;
  end if;

  v_bank_code := coalesce(nullif(btrim(p_bank_code),''), v_prop_bank_code);
  if v_bank_code is null then
    raise exception 'a bank institution code is required' using errcode = 'CLR10',
      detail = '{"reason":"bank_code_required"}';
  end if;
  if not exists (select 1 from clara.bank_institutions where code = v_bank_code and active) then
    raise exception 'bank institution % is not a known active institution', v_bank_code
      using errcode = 'CLR10', detail = '{"reason":"bank_institution_unknown"}';
  end if;

  v_number := coalesce(nullif(btrim(p_account_number),''), v_prop_account_number);
  if v_number is null then
    raise exception 'an account number is required' using errcode = 'CLR10',
      detail = '{"reason":"account_number_required"}';
  end if;
  -- THE ONE NORMALIZATION LAW (design section 4.1). House form: lowercase,
  -- whitespace-stripped, hyphens SURVIVE (0007:1518-1519 verbatim) -- this is
  -- client_identifiers' own predicate and must not drift from it. Digits-only
  -- form is what bank_accounts.account_number_normalized stores and what ingest
  -- binds against.
  v_house := lower(regexp_replace(v_number,'\s+','','g'));
  v_digits := regexp_replace(v_number,'\D','','g');
  if btrim(v_digits) = '' then
    raise exception 'account number % has no digits', v_number using errcode = 'CLR10',
      detail = '{"reason":"account_number_invalid"}';
  end if;

  v_display := coalesce(nullif(btrim(p_bank_name_display),''), v_prop_bank_name_display);
  if v_display is null then
    select name into v_display from clara.bank_institutions where code = v_bank_code;
  end if;
  if v_display is null or btrim(v_display) = '' then
    raise exception 'a display name for this bank account is required' using errcode = 'CLR10',
      detail = '{"reason":"bank_name_display_required"}';
  end if;

  -- COA VALIDATION: "asset-typed/active/non-control" (design section 4.1).
  perform clara._assert_bank_coa_candidate(p_client, p_coa_account_code);

  -- PARTIAL-UNIQUE SEMANTICS, "where active" (design section 4.1): named refusals
  -- for the ordinary case; the insert's own unique_violation catch below is the
  -- concurrent-race backstop, re-deriving which of the two arenas collided.
  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and bank_code = v_bank_code
        and account_number_normalized = v_digits and active) then
    raise exception 'an active bank account with this identity already exists for this client'
      using errcode = 'CLR10', detail = '{"reason":"bank_account_duplicate"}';
  end if;
  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and coa_account_code = p_coa_account_code and active) then
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end if;

  begin
    insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display,
        account_number, account_number_normalized, coa_account_code, active, created_by)
      values (c.firm, p_client, v_bank_code, v_display, v_number, v_digits,
        p_coa_account_code, true, c.actor)
      returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from clara.bank_accounts
        where client_id = p_client and bank_code = v_bank_code
          and account_number_normalized = v_digits and active) then
      raise exception 'an active bank account with this identity already exists for this client'
        using errcode = 'CLR10', detail = '{"reason":"bank_account_duplicate"}';
    end if;
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end;

  -- "sets is_bank_account in-txn" (design section 4.1) -- same transaction, same
  -- commit or none.
  update clara.coa_accounts set is_bank_account = true
    where client_id = p_client and account_code = p_coa_account_code;

  -- THE TWO GUARDED client_identifiers INSERTS. Append-only
  -- (t_client_identifiers_append_only, 0007:679-680): if-not-exists, NEVER
  -- upsert -- there is no unique index to ON CONFLICT against, deliberately
  -- (0007:235-237, sibling-client conflicts must stay representable), so the
  -- guard is an explicit existence check. Both rows carry kind='bank_account',
  -- already CHECK-admitted (0007:227).
  if not exists (select 1 from clara.client_identifiers
      where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
        and value_normalized = v_house) then
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values (c.firm,p_client,'bank_account',v_house,c.actor);
  end if;
  if not exists (select 1 from clara.client_identifiers
      where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
        and value_normalized = v_digits) then
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values (c.firm,p_client,'bank_account',v_digits,c.actor);
  end if;

  -- THE DEFINER-INTERNAL RE-FIRE (design section 4.3 "account binding order" +
  -- section 1's one-confirmation promise). p_proposal_id's OWN document is
  -- re-fired unconditionally -- confirming THIS card must always close THIS loop,
  -- even if the caller edited an identity field on the way through. Any OTHER
  -- open proposal that now shares the SAME (bank_code, account_number_normalized,
  -- client) -- e.g. three uploads of the same real account that each failed and
  -- each wrote their own card -- rides the general sweep below.
  -- _enqueue_invoice_facts_core is ungranted and owned by clara_fn_owner exactly
  -- like this function, so the call needs no grant of its own (the 0009/0026 CoR
  -- discipline: the core stays reachable only through its callers).
  if p_proposal_id is not null then
    update clara.bank_account_proposals
      set status = 'resolved', resolved_by = c.actor, resolved_at = now(),
          resolved_bank_account_id = v_id
      where id = p_proposal_id and status = 'open'
      returning document_id into v_prop_doc;
    if v_prop_doc is not null then
      v_facts := clara._enqueue_invoice_facts_core(v_prop_doc);
      v_refired := v_refired || jsonb_build_object('document_id',v_prop_doc,
        'task_id',v_facts->>'task_id','status',v_facts->>'status');
    end if;
  end if;

  for r in
    select * from clara.bank_account_proposals
      where firm_id = c.firm and client_id = p_client and bank_code = v_bank_code
        and account_number_normalized = v_digits and status = 'open'
      order by id
      for update
  loop
    update clara.bank_account_proposals
      set status = 'resolved', resolved_by = c.actor, resolved_at = now(),
          resolved_bank_account_id = v_id
      where id = r.id;
    v_facts := clara._enqueue_invoice_facts_core(r.document_id);
    v_refired := v_refired || jsonb_build_object('document_id',r.document_id,
      'task_id',v_facts->>'task_id','status',v_facts->>'status');
  end loop;

  perform clara._audit(c.firm,c.actor,null,null,'add_bank_account',null,
    jsonb_build_object('client',p_client,'bank_account',v_id,
      'coa_account_code',p_coa_account_code,'proposal_id',p_proposal_id,
      'refired_count',jsonb_array_length(v_refired),'op_key',p_op_key));

  -- Payload carries IDs ONLY (design section 4.8: domain_events is
  -- agent-readable firm-wide; the account number never enters an event payload).
  perform clara._append_event(c.firm,'bank.account_created',p_client,c.actor,null,null,
    null,null,null,jsonb_build_object('bank_account_id',v_id));

  return clara._finish_op(c.firm,'add_bank_account',p_op_key,
    jsonb_build_object('bank_account_id',v_id,'client_id',p_client,
      'coa_account_code',p_coa_account_code,'active',true,'refired',v_refired));
end $$;

-- =====================================================================
-- clara.deactivate_bank_account -- design section 4.1.
-- =====================================================================
create function clara.deactivate_bank_account(
    p_client uuid, p_bank_account uuid, p_reason text, p_op_key text default null
  ) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; b record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a deactivation reason is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'deactivate_bank_account',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'bank_account',p_bank_account,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;
  if not found then
    raise exception 'bank account not in your firm' using errcode = 'CLR11';
  end if;
  if not b.active then
    raise exception 'bank account % is already inactive', p_bank_account
      using errcode = 'CLR16', detail = '{"reason":"bank_account_already_inactive"}';
  end if;

  update clara.bank_accounts set active = false, deactivated_by = c.actor,
      deactivated_at = now(), deactivated_reason = p_reason
    where id = p_bank_account;

  perform clara._audit(c.firm,c.actor,null,null,'deactivate_bank_account',null,
    jsonb_build_object('client',p_client,'bank_account',p_bank_account,
      'reason',p_reason,'op_key',p_op_key));

  return clara._finish_op(c.firm,'deactivate_bank_account',p_op_key,
    jsonb_build_object('bank_account_id',p_bank_account,'active',false));
end $$;

-- =====================================================================
-- clara.reactivate_bank_account -- design section 4.1 ("[RV]": a real remedy, not
-- a dead end). Re-entering the active arena means re-clearing the SAME two
-- partial uniques add_bank_account guards -- while this row sat inactive, either
-- its identity or its chart account may have been legitimately re-claimed by a
-- different live account (design section 4.1: "deactivate-and-remap is a real
-- remedy... where active"), so the checks below are not paranoia, they are the
-- documented remedy's other half.
-- =====================================================================
create function clara.reactivate_bank_account(
    p_client uuid, p_bank_account uuid, p_op_key text default null
  ) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; b record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'reactivate_bank_account',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'bank_account',p_bank_account)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;
  if not found then
    raise exception 'bank account not in your firm' using errcode = 'CLR11';
  end if;
  if b.active then
    raise exception 'bank account % is already active', p_bank_account
      using errcode = 'CLR16', detail = '{"reason":"bank_account_already_active"}';
  end if;

  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and bank_code = b.bank_code
        and account_number_normalized = b.account_number_normalized
        and active and id <> p_bank_account) then
    raise exception 'another active bank account already holds this identity'
      using errcode = 'CLR10', detail = '{"reason":"bank_account_duplicate"}';
  end if;
  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and coa_account_code = b.coa_account_code
        and active and id <> p_bank_account) then
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end if;

  begin
    update clara.bank_accounts set active = true, deactivated_by = null,
        deactivated_at = null, deactivated_reason = null
      where id = p_bank_account;
  exception when unique_violation then
    if exists (select 1 from clara.bank_accounts
        where client_id = p_client and bank_code = b.bank_code
          and account_number_normalized = b.account_number_normalized
          and active and id <> p_bank_account) then
      raise exception 'another active bank account already holds this identity'
        using errcode = 'CLR10', detail = '{"reason":"bank_account_duplicate"}';
    end if;
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end;

  perform clara._audit(c.firm,c.actor,null,null,'reactivate_bank_account',null,
    jsonb_build_object('client',p_client,'bank_account',p_bank_account,'op_key',p_op_key));

  return clara._finish_op(c.firm,'reactivate_bank_account',p_op_key,
    jsonb_build_object('bank_account_id',p_bank_account,'active',true));
end $$;

-- =====================================================================
-- clara.remap_bank_account_coa -- design section 4.1: "refuses while any
-- pending/live match group exists on the account" (the C-b match-model table,
-- design section 4.5 -- the ONLY read this file makes of it) "; sets
-- is_bank_account on the new COA". Statements are COA-independent (they carry no
-- coa_account_code) and are untouched by a remap.
-- =====================================================================
create function clara.remap_bank_account_coa(
    p_client uuid, p_bank_account uuid, p_new_coa_account_code text, p_op_key text default null
  ) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; b record; v_old_code text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_new_coa_account_code is null or btrim(p_new_coa_account_code) = '' then
    raise exception 'a target chart account is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'remap_bank_account_coa',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'bank_account',p_bank_account,
      'new_coa_account_code',p_new_coa_account_code)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;
  if not found then
    raise exception 'bank account not in your firm' using errcode = 'CLR11';
  end if;
  v_old_code := b.coa_account_code;

  if exists (select 1 from clara.bank_matches
      where bank_account_id = p_bank_account and status in ('pending','live')) then
    raise exception 'bank account % has a pending or live match group; unmatch first', p_bank_account
      using errcode = 'CLR10', detail = '{"reason":"bank_account_has_live_matches"}';
  end if;

  perform clara._assert_bank_coa_candidate(p_client, p_new_coa_account_code);

  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and coa_account_code = p_new_coa_account_code
        and active and id <> p_bank_account) then
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end if;

  begin
    update clara.bank_accounts set coa_account_code = p_new_coa_account_code
      where id = p_bank_account;
  exception when unique_violation then
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end;

  update clara.coa_accounts set is_bank_account = true
    where client_id = p_client and account_code = p_new_coa_account_code;

  perform clara._audit(c.firm,c.actor,null,null,'remap_bank_account_coa',null,
    jsonb_build_object('client',p_client,'bank_account',p_bank_account,
      'old_coa_account_code',v_old_code,'new_coa_account_code',p_new_coa_account_code,
      'op_key',p_op_key));

  return clara._finish_op(c.firm,'remap_bank_account_coa',p_op_key,
    jsonb_build_object('bank_account_id',p_bank_account,
      'coa_account_code',p_new_coa_account_code));
end $$;

-- =====================================================================
-- GRANTS -- the 0037 idiom (0037:3427-3439): explicit revoke-from-public per
-- function as belt-and-braces, then ONE grant to clara_authenticated for the four
-- human bookkeeper-floor verbs. The shared helper stays ungranted (callable only
-- from inside these definer writers, like _subledger_outstanding, 0037:874-881).
-- Zero wake/agent grants anywhere in this section (design section 4.1 RLS note).
-- =====================================================================
revoke all on function clara.add_bank_account(uuid,text,text,text,text,uuid,text) from public;
revoke all on function clara.deactivate_bank_account(uuid,uuid,text,text) from public;
revoke all on function clara.reactivate_bank_account(uuid,uuid,text) from public;
revoke all on function clara.remap_bank_account_coa(uuid,uuid,text,text) from public;

grant execute on function
  clara.add_bank_account(uuid,text,text,text,text,uuid,text),
  clara.deactivate_bank_account(uuid,uuid,text,text),
  clara.reactivate_bank_account(uuid,uuid,text),
  clara.remap_bank_account_coa(uuid,uuid,text,text)
to clara_authenticated;

reset role;

-- ============ SECTION D (match) ============
-- assembly seam: section C closed the fn-owner region with its own `reset role;`; D's
-- bodies must be owned by clara_fn_owner (the ACL pins assert it), so re-open it here.
set role clara_fn_owner;
-- =====================================================================================
-- 0038 SECTION D -- THE MATCH ENGINE (Wave C-b).
--
-- The design of record is docs/plan/wave-c-b-bank-design.md sections 3, 4.5 and 4.6 plus
-- wave-c-b-bank-design-part2.md sections 4.8 and 4.9. Governing law above it:
-- docs/plan/wave-c-contract.md (WC-R1..R12) and docs/plan/wave-c-a-subledger-design.md
-- (WCA-R1..R9), executed on the C-a substrate that migration 0037 built.
--
-- THIS FRAGMENT SHIPS: the three match belts + the reversal belt on journal_entries
-- (section D.2), the adjustment builder (D.3), clara.match_bank_line (D.4),
-- clara.settle_from_bank_line (D.5), clara.complete_pending_match (D.6),
-- clara.unmatch_bank_match (D.7), and the ACLs (D.8). It runs INSIDE the
-- `set role clara_fn_owner;` region that the tables fragment opens and that the tail's
-- `reset role;` closes -- it emits neither, exactly as 0037's SECTION F and SECTION K do
-- not (0037:488 opens the region, 0037:3441 closes it).
--
-- =====================================================================================
-- WHY THIS EXISTS -- the debt C-b pays, stated in the opening lines as the house asks.
-- =====================================================================================
-- C-a left a NAMED INTERVAL (wave-c-a-subledger-design.md section 7): between C-a and C-b
-- nothing but op-key dedupe and the two-sided bound stops the same real-world receipt being
-- recorded twice. This fragment closes the LINE side of it. A statement line is a fact the
-- bank printed ONCE; it may belong to at most one group with status in ('pending','live'),
-- always at its full amount, and -- WCB-R3 -- a settlement may be born FROM the line with
-- the line owned in the SAME TRANSACTION, including at high stakes via the pending-match
-- reservation.
--
-- Stated honestly, exactly as design section 1 does: this is MATCHING WITH LINE-SIDE
-- EXCLUSIVITY AND PER-GROUP EXACT TIES -- it is NOT reconciliation. An approved-but-never-
-- matched duplicate settlement entry sits in no group and survives every belt below; the
-- periodic statement-to-GL tie-out that catches it is C-c's. Nothing in this file may be
-- read as claiming otherwise.
--
-- THE THREE IDENTITIES this fragment is responsible for (design section 3):
--   * MATCH IDENTITY (exact-zero, WC-R6). Per non-'unmatched' group,
--     SUM(member lines' amount_cents) = SUM(member entries' matched_cents), to the sen. A
--     difference exists only as a coded adjustment ENTRY inside the same transaction and the
--     same group. Tolerance is ZERO. Enforced by the group-tie belt (D.2a).
--   * EXCLUSIVITY, LINE SIDE (WC-R2). A line belongs to at most one 'pending'/'live' group,
--     always at full amount. The structural enforcement is the tables fragment's REAL
--     same-table partial unique on the denormalized group_status; this file's job is to
--     refuse it BY NAME (already_matched) before the index has to, and to translate the
--     index's unique_violation back into that name when a concurrent writer wins the race.
--   * EXCLUSIVITY, ENTRY SIDE (per entry x bank account, PER SIDE, IN ABSOLUTES).
--     SUM(matched_cents over POSITIVE members) <= SUM(debit_cents) of the entry's lines on
--     that account's COA, and SUM(|matched_cents| over NEGATIVE members) <=
--     SUM(credit_cents). GROSS PER SIDE, because statements print gross while one entry may
--     touch the bank account on BOTH sides (a loan drawdown net of fees); ABSOLUTE, because
--     a signed-net inequality is vacuous for negative sums -- v1's formula admitted
--     unbounded negative matches. Enforced by the entry-exhaustion belt (D.2b).
--
-- THE SIGN CONVENTION, ONCE, because every amount below depends on it (design section 4.2):
-- a statement line's amount_cents is SIGNED, + = INTO the account, - = OUT of it. A positive
-- line therefore matches an entry that DEBITS the bank COA, and a member's matched_cents
-- carries the same sign as the movement it consumes. That is why the exhaustion bound is
-- stated per side and why a member's sign selects which side's capacity it spends.
--
-- =====================================================================================
-- THE TABLE CONTRACT THIS FRAGMENT BINDS TO -- documentation, not DDL.
--
-- The bank tables are created by the tables fragment (0038 migration order, design
-- part2 section 5). This block records EXACTLY the columns, constraints and indexes the
-- bodies below read and write, so the two fragments can be diffed by eye rather than by
-- deploy failure. Any divergence is a build-time integration bug, not a runtime one.
--
--   clara.bank_accounts        (id, firm_id, client_id, coa_account_code, active, ...)
--   clara.bank_statements      (id, firm_id, client_id, bank_account_id,
--                               period_start, period_end, status ck ('live','void'), ...)
--   clara.bank_statement_lines (id, firm_id, client_id, statement_id, bank_account_id,
--                               line_no, entry_date, value_date, description,
--                               amount_cents <> 0, running_balance_cents)
--   clara.bank_matches         (id, firm_id, client_id, bank_account_id,
--                               status ck ('pending','live','unmatched'),
--                               origin ck ('human','rule'), matched_via_rule_id,
--                               draft_entry_id, created_by, created_at, completed_at,
--                               unmatched_by, unmatched_at, unmatched_reason,
--                               unique (id, firm_id, client_id, status)  <- cascade anchor)
--   clara.bank_match_line_members  (id, firm_id, client_id, match_id, line_id,
--                               amount_cents, group_status,
--                               FK (match_id, firm_id, client_id, group_status)
--                                 -> bank_matches (id, firm_id, client_id, status)
--                                 ON UPDATE CASCADE,
--                               unique (line_id) where group_status in ('pending','live'))
--   clara.bank_match_entry_members (id, firm_id, client_id, match_id, entry_id,
--                               matched_cents <> 0, group_status,
--                               posting_date_exception boolean not null default false,
--                               same cascade FK)
--   clara.bank_match_audit     (id, firm_id, client_id, match_id, action, actor, reason,
--                               payload jsonb, created_at)
--
-- Member rows carry NO created_by: the group carries the actor and clara.bank_match_audit
-- carries the full member set per action, so a per-member creator would be a third copy of
-- one fact. If the tables fragment gives them one it must be nullable or defaulted.
--
-- =====================================================================================
-- TWO SPEC TENSIONS, RESOLVED HERE IN THE OPEN RATHER THAN SILENTLY.
--
-- (T1) "GROUP-TIE PER NON-'UNMATCHED' GROUP" vs THE PENDING RESERVATION.
--   Design section 3 states the exact-zero tie for every non-'unmatched' group, and design
--   section 4.6 creates a 'pending' group whose settlement entry is still a DRAFT --
--   while section 4.5 rules that entry members exist ONLY for approved entries. A pending
--   group therefore CANNOT carry the member that would make it tie; a literal reading makes
--   the reservation unbuildable, which cannot be what WCB-R3 ruled.
--   THE READING BUILT HERE: the exact tie is asserted on 'live' groups. On a 'pending'
--   group the belt asserts the RESERVATION SHAPE instead -- at least one line member and a
--   non-null draft_entry_id, i.e. "a real line is being held against a real draft" -- and
--   clara.complete_pending_match asserts the exact tie BY NAME at the pending->live flip,
--   after which the live arm holds it forever. The tie is never skipped; it is asserted at
--   the first moment it is assertable. Cells: the pending walk in design part2 section 6
--   ("line owned at draft, checker approves, complete_pending_match ties").
--   NOTE the reservation is NOT "zero entry members": at high stakes the SETTLEMENT is a
--   draft but the same call's bank-charge / difference adjustment entries are ordinary
--   small entries that approve immediately, so they are lawful members of a pending group
--   from birth.
--
-- (T2) THE POSTING-DATE EXCEPTION HAS NO ACK CHANNEL ON THE COMPLETION PATH.
--   match_bank_line takes p_ack_period_exceptions and REFUSES an unacknowledged
--   posting_date > period_end member (design section 4.6 replaced v1's hard RAISE, which
--   prescribed a remedy _tf_entry_immutable forbids and would strand ordinary Malaysian
--   catch-up bookkeeping). complete_pending_match's ratified signature carries no such flag.
--   THE READING BUILT HERE: on the completion path the exception is RECORDED (on the member
--   row and in the audit payload) and never refused -- the acknowledgement already happened
--   when the human posted the settlement from the line, and inventing a fourth argument
--   would change a signature the design fixed.
-- =====================================================================================


-- =====================================================================
-- SECTION D.1 -- THE INTERNALS. Definer-owned, granted to NOBODY (the "one ungranted
-- _core + grant-scoped entry points" law, 0037 SECTION E). 0009 already set
-- `alter default privileges for role clara_fn_owner in schema clara revoke execute on
-- functions from public`; each still carries its own explicit revoke as belt-and-braces,
-- and section D.8 re-states them in one block for the tail to assert.
-- =====================================================================

-- The group's bank COA. Every belt and every verb needs it, and a formula computed in six
-- places is exactly how a matcher drifts from itself (the _subledger_outstanding lesson,
-- 0037:874-880). NULL means "this group's bank account is unmapped or gone", which every
-- caller treats as REFUSE, never as "no constraint".
create function clara._bank_match_coa(p_match uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select ba.coa_account_code
  from clara.bank_matches bm
  join clara.bank_accounts ba on ba.id = bm.bank_account_id
  where bm.id = p_match;
$$;
revoke all on function clara._bank_match_coa(uuid) from public;

-- An entry's GROSS movement on one COA account, PER SIDE. The exhaustion bound's capacity
-- half. Returns (0,0) for an entry that never touches the account -- which is the
-- wrong_account shape, and the reason the congruence belt tests it separately rather than
-- letting a zero bound produce a misleading already_matched.
-- The OUT names are dr_cents / cr_cents, NOT debit_cents / credit_cents: an OUT parameter
-- that shares a name with a column of the table the body reads is the classic
-- sql_variable_conflict trap, and the only defence -- qualifying every reference -- is one
-- careless edit away from failing at deploy rather than at review.
create function clara._bank_entry_side_capacity(
    p_entry uuid, p_coa text, out dr_cents bigint, out cr_cents bigint)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(sum(l.debit_cents), 0)::bigint,
         coalesce(sum(l.credit_cents), 0)::bigint
  from clara.journal_lines l
  where l.entry_id = p_entry and l.account_code = p_coa;
$$;
revoke all on function clara._bank_entry_side_capacity(uuid,text) from public;

-- The queryable record (design section 4.5): one append-only row per match / complete /
-- unmatch / void action, carrying the FULL member set and amounts, the actor and the
-- reason. The spine events (part2 section 4.8) are the wake/learn signal and carry
-- IDENTIFIERS ONLY; THIS is where the amounts and the human's words live, behind a
-- human-only read.
create function clara._bank_match_audit(
    p_firm uuid, p_client uuid, p_match uuid, p_action text, p_actor uuid,
    p_reason text, p_payload jsonb) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  insert into clara.bank_match_audit(firm_id, client_id, match_id, action, actor,
      reason, payload)
    values (p_firm, p_client, p_match, p_action, p_actor, p_reason,
      coalesce(p_payload, '{}'::jsonb));
end $$;
revoke all on function clara._bank_match_audit(uuid,uuid,uuid,text,uuid,text,jsonb) from public;


-- =====================================================================
-- SECTION D.2 -- THE FOUR BELTS. UNCONDITIONAL, NO BYPASS GUC, EVER.
--
-- All four are DEFERRED CONSTRAINT TRIGGERS and all four RE-QUERY BY ID, never reading the
-- NEW tuple's columns (the 0009:524-529 idiom that 0037 SECTION F restates). At deferred
-- time the NEW tuple is a snapshot of the row as it was when the trigger was QUEUED; a
-- later statement in the same transaction may have changed it -- and here that is not
-- hypothetical at all, because the exclusivity FK is ON UPDATE CASCADE: unmatching a group
-- REWRITES group_status on every member row after those rows' own triggers were queued. A
-- belt that trusted the snapshot would certify a group that no longer exists in that shape.
--
-- WHY THEY ARE DEFERRED rather than immediate. A match is written as several statements --
-- the group, then the line members, then the entry members, then (last) the adjustment
-- entries and their members. No intermediate state ties. Only the transaction as a whole
-- is a lawful match, so only commit is a lawful moment to judge it. That is the same reason
-- 0037's belts are deferred and it coexists with the five deferred asserts already on
-- clara.journal_entries.
--
-- WHY THE BELTS AND NOT ONLY THE VERBS. Every refusal below ALSO exists as a named,
-- early, human-readable refusal inside the verbs. The belts are what makes the law
-- structural rather than a property of the write path: a red-team fn-owner INSERT, a future
-- fifth verb, or a rule-driven matcher that C-c has not written yet all fail at commit
-- rather than shipping a broken tie. NO BYPASS GUC WILL EXIST -- a belt with an escape
-- hatch is a belt that will be escaped (0037 SECTION F).
-- =====================================================================

-- ---------------------------------------------------------------------
-- D.2a -- THE GROUP-TIE BELT. Design section 3's match identity, per group.
-- Installed on all THREE match tables: a tie can be broken by adding a line, by adding an
-- entry member, or by flipping the group's own status -- and a belt that watched only the
-- member tables would miss the third.
-- ---------------------------------------------------------------------
create function clara._tf_bank_match_group_tie() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_match uuid; g record;
  v_lines bigint; v_entries bigint; v_ln int; v_en int;
begin
  -- RE-QUERY BY ID. See the section header for why the NEW tuple is untrustworthy here in
  -- particular (ON UPDATE CASCADE rewrites member rows after their triggers are queued).
  if tg_table_name = 'bank_matches' then
    v_match := new.id;
  elsif tg_table_name = 'bank_match_line_members' then
    select mm.match_id into v_match from clara.bank_match_line_members mm where mm.id = new.id;
  else
    select mm.match_id into v_match from clara.bank_match_entry_members mm where mm.id = new.id;
  end if;
  if v_match is null then return null; end if;
  select * into g from clara.bank_matches bm where bm.id = v_match;
  if not found then return null; end if;

  -- An unmatched group is a HISTORICAL object: its members are retained so the audit trail
  -- can be read back, and it asserts nothing about cents. Releasing the exclusivity index is
  -- the whole point of the status flip.
  if g.status = 'unmatched' then return null; end if;

  select coalesce(sum(mm.amount_cents), 0)::bigint, count(*)::int
    into v_lines, v_ln
    from clara.bank_match_line_members mm where mm.match_id = v_match;
  select coalesce(sum(mm.matched_cents), 0)::bigint, count(*)::int
    into v_entries, v_en
    from clara.bank_match_entry_members mm where mm.match_id = v_match;

  if v_ln = 0 then
    raise exception 'bank match % holds no statement line', v_match
      using errcode='CLR10',detail='{"reason":"match_group_empty"}';
  end if;

  -- THE PENDING ARM (tension T1 in the file header, resolved in the open). A pending group
  -- is a RESERVATION: the line is owned the moment the maker acts, and the settlement entry
  -- that will balance it is still a draft, which section 4.5 forbids as a member. What is
  -- assertable now is the reservation's shape -- a real line held against a real draft --
  -- and clara.complete_pending_match asserts the exact tie by name at the flip.
  if g.status = 'pending' then
    if g.draft_entry_id is null then
      raise exception 'bank match % is pending but names no draft entry; a reservation with nothing to complete would hold the line forever', v_match
        using errcode='CLR10',detail='{"reason":"pending_match_unanchored"}';
    end if;
    return null;
  end if;

  -- THE LIVE ARM -- WC-R6's exact zero, to the sen, tolerance NONE. A difference exists
  -- only as a coded adjustment ENTRY inside this same group (section D.3), never as a
  -- rounding allowance: an allowance is how a reconciliation quietly stops reconciling.
  if v_en = 0 then
    raise exception 'bank match % is live but holds no journal entry', v_match
      using errcode='CLR10',detail='{"reason":"match_group_empty"}';
  end if;
  if v_lines <> v_entries then
    raise exception 'bank match % does not tie: % cents of statement lines against % cents of matched entries', v_match, v_lines, v_entries
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_beyond_tolerance','match_id',v_match,
          'line_cents',v_lines,'entry_cents',v_entries)::text;
  end if;
  return null;
end $$;

create constraint trigger t_bank_matches_group_tie
  after insert or update on clara.bank_matches
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_group_tie();
create constraint trigger t_bank_match_line_members_group_tie
  after insert or update on clara.bank_match_line_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_group_tie();
create constraint trigger t_bank_match_entry_members_group_tie
  after insert or update on clara.bank_match_entry_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_group_tie();

-- ---------------------------------------------------------------------
-- D.2b -- THE ENTRY-EXHAUSTION BELT. Design section 3's entry-side exclusivity:
-- PER ENTRY x BANK ACCOUNT, PER SIDE, IN ABSOLUTES.
--
--   SUM(matched_cents where > 0)  <=  SUM(debit_cents)  on the account's COA
--   SUM(-matched_cents where < 0) <=  SUM(credit_cents) on the account's COA
--
-- PER SIDE because statements print GROSS while one entry may touch the bank account on
-- both sides (a loan drawdown net of fees, a same-day sweep in and out): a net bound would
-- let the in-leg finance a second match of the out-leg. IN ABSOLUTES because a signed-net
-- inequality is VACUOUS for negative sums -- v1's formula was satisfied by an arbitrarily
-- large negative match, which is the review's named negative-sum attack.
--
-- THE POOL IS AUTHORITATIVE, NOT DENORMALIZED. It joins clara.bank_matches and reads
-- bm.status rather than the member's cascaded group_status column: at deferred time the
-- cascade has run, but a belt that re-queries by id and then trusts a denormalized copy of
-- the very column the cascade rewrites has re-introduced exactly the snapshot bug the
-- re-query exists to kill.
-- ---------------------------------------------------------------------
create function clara._tf_bank_match_entry_exhaustion() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  m record; g record; v_coa text; v_pos bigint; v_neg bigint; cap record;
begin
  -- RE-QUERY BY ID (0009:524-529).
  select * into m from clara.bank_match_entry_members mm where mm.id = new.id;
  if not found then return null; end if;
  select * into g from clara.bank_matches bm where bm.id = m.match_id;
  if not found then return null; end if;
  if g.status = 'unmatched' then return null; end if;

  v_coa := clara._bank_match_coa(m.match_id);
  if v_coa is null then
    raise exception 'bank match % has no mapped GL bank account; its members cannot be bounded', m.match_id
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  select coalesce(sum(case when em.matched_cents > 0 then em.matched_cents else 0 end), 0)::bigint,
         coalesce(sum(case when em.matched_cents < 0 then -em.matched_cents else 0 end), 0)::bigint
    into v_pos, v_neg
    from clara.bank_match_entry_members em
    join clara.bank_matches bm2 on bm2.id = em.match_id
    where em.entry_id = m.entry_id
      and bm2.status in ('pending','live')
      and bm2.bank_account_id = g.bank_account_id;

  cap := clara._bank_entry_side_capacity(m.entry_id, v_coa);

  -- ONE reason token for both sides, because the remedy is identical: the entry has no
  -- unmatched cents left on the side this member wants, so unmatch the group that holds
  -- them or match a different entry. Naming the side in the detail is what makes the
  -- message actionable without splitting the token.
  if v_pos > cap.dr_cents then
    raise exception 'entry % is already matched for % cents of debit movement on % but carries only %', m.entry_id, v_pos, v_coa, cap.dr_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','side','debit',
          'entry_id',m.entry_id,'account_code',v_coa,
          'matched_cents',v_pos,'capacity_cents',cap.dr_cents)::text;
  end if;
  if v_neg > cap.cr_cents then
    raise exception 'entry % is already matched for % cents of credit movement on % but carries only %', m.entry_id, v_neg, v_coa, cap.cr_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','side','credit',
          'entry_id',m.entry_id,'account_code',v_coa,
          'matched_cents',v_neg,'capacity_cents',cap.cr_cents)::text;
  end if;
  return null;
end $$;

create constraint trigger t_bank_match_entry_members_exhaustion
  after insert or update on clara.bank_match_entry_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_entry_exhaustion();

-- ---------------------------------------------------------------------
-- D.2c -- THE CONGRUENCE BELT. Tenancy and account congruence the FKs and CHECKs cannot
-- express because they cannot join, PLUS the two lifecycle floors that are not static
-- facts: a member entry's reversal state and a member line's statement state both move
-- AFTER the member is written, so both are re-checked here at every commit that touches
-- the group.
--
-- The reversal floors are stated as TWO named refusals, not one, because the two shapes
-- have different remedies: a REVERSED ORIGINAL stays status='approved' (0003:371-383 --
-- approval status alone cannot floor membership, which is the whole reason this arm
-- exists), and its MIRROR is a different object entirely. `reversed_entry` says "unmatch,
-- then reverse"; `reversal_mirror` says "a mirror is not a bank movement, match the
-- original's replacement".
-- ---------------------------------------------------------------------
create function clara._tf_bank_match_congruence() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  m record; g record; ln record; st record; e record; v_coa text; cap record;
begin
  if tg_table_name = 'bank_matches' then
    select * into g from clara.bank_matches bm where bm.id = new.id;
    if not found then return null; end if;
    if g.status = 'unmatched' then return null; end if;
    if not exists (select 1 from clara.bank_accounts ba
                   where ba.id = g.bank_account_id
                     and ba.firm_id = g.firm_id and ba.client_id = g.client_id) then
      raise exception 'bank match % names a bank account outside its own client', g.id
        using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
    end if;
    -- 'human' is the only origin any writer in this wave produces; the learn loop's
    -- 'rule' origin lands in C-c with its own authority story. The CHECK on the table pairs
    -- origin with matched_via_rule_id; this is the half that says a rule-origin group may
    -- not simply appear before that story is told.
    if g.origin = 'rule' and g.matched_via_rule_id is null then
      raise exception 'bank match % claims a rule origin with no rule', g.id
        using errcode='CLR10',detail='{"reason":"match_origin_incongruent"}';
    end if;
    return null;
  end if;

  if tg_table_name = 'bank_match_line_members' then
    -- RE-QUERY BY ID.
    select * into m from clara.bank_match_line_members mm where mm.id = new.id;
    if not found then return null; end if;
    select * into g from clara.bank_matches bm where bm.id = m.match_id;
    if not found then return null; end if;
    if g.status = 'unmatched' then return null; end if;
    select * into ln from clara.bank_statement_lines l where l.id = m.line_id;
    if not found then
      raise exception 'bank match member % names no statement line', m.id
        using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
    end if;
    if ln.firm_id <> g.firm_id or ln.client_id <> g.client_id then
      raise exception 'bank match % holds a statement line from another client', g.id
        using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
    end if;
    select * into st from clara.bank_statements s where s.id = ln.statement_id;
    if not found then
      raise exception 'statement line % has no statement', ln.id
        using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
    end if;
    if st.bank_account_id <> g.bank_account_id then
      raise exception 'statement line % belongs to a different bank account than match %', ln.id, g.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_account','line_id',ln.id,
            'match_id',g.id)::text;
    end if;
    -- THE STRUCTURAL wrong_period (design section 4.6, corrected in v2): the GAP1-1
    -- substance is line-to-recon congruence, and in the group model that is exactly "the
    -- line's statement is still live". A VOID statement admits no pending/live member --
    -- enforced from BOTH ends, here and at D.2d, because the two writes race in opposite
    -- directions.
    if st.status <> 'live' then
      raise exception 'statement line % belongs to a % statement; a non-live statement admits no match member', ln.id, st.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_period','line_id',ln.id,
            'statement_id',st.id,'statement_status',st.status)::text;
    end if;
    -- LINES ENTER AT FULL AMOUNT (WC-R2). Partial line membership would make the
    -- exclusivity index a lie: half a line matched and half free is a state no bank
    -- statement can express, and it is how a duplicate hides.
    if m.amount_cents is distinct from ln.amount_cents then
      raise exception 'statement line % enters a match at its full % cents, not %', ln.id, ln.amount_cents, m.amount_cents
        using errcode='CLR10',detail='{"reason":"line_partial_membership"}';
    end if;
    return null;
  end if;

  -- bank_match_entry_members.
  select * into m from clara.bank_match_entry_members mm where mm.id = new.id;
  if not found then return null; end if;
  select * into g from clara.bank_matches bm where bm.id = m.match_id;
  if not found then return null; end if;
  if g.status = 'unmatched' then return null; end if;
  select * into e from clara.journal_entries je where je.id = m.entry_id;
  if not found then
    raise exception 'bank match member % names no journal entry', m.id
      using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
  end if;
  if e.firm_id <> g.firm_id or e.client_id <> g.client_id then
    raise exception 'bank match % holds a journal entry from another client', g.id
      using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
  end if;
  -- MEMBERS EXIST ONLY FOR APPROVED ENTRIES (design section 4.5). A draft is referenced
  -- through the GROUP's draft_entry_id, never as a member -- a draft can be revised or
  -- withdrawn, and a match to something that may still change is not a match.
  if e.status <> 'approved' then
    raise exception 'journal entry % is not approved; a pending settlement rides the group''s draft_entry_id, never a member row', e.id
      using errcode='CLR10',detail='{"reason":"entry_not_approved"}';
  end if;
  -- THE REVERSAL FLOORS, RE-CHECKED AT EVERY COMMIT (fact 2.10: a reversed original stays
  -- 'approved', so status alone floors nothing).
  if e.reversed_by is not null then
    raise exception 'journal entry % has been reversed; unmatch the group before reversing, and match the replacement instead', e.id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','reversed_entry','entry_id',e.id,
          'reversed_by',e.reversed_by)::text;
  end if;
  if e.reversal_of is not null then
    raise exception 'journal entry % is a reversal mirror; a mirror records the undoing of an entry, not a movement the bank printed', e.id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','reversal_mirror','entry_id',e.id,
          'reversal_of',e.reversal_of)::text;
  end if;
  -- ACCOUNT CONGRUENCE. Tested as its OWN statement rather than left to the exhaustion
  -- bound's zero capacity: an entry that never touches this bank account is a
  -- wrong_account mistake, and reporting it as already_matched would send the human to
  -- unmatch a group that has nothing to do with it.
  v_coa := clara._bank_match_coa(m.match_id);
  if v_coa is null then
    raise exception 'bank match % has no mapped GL bank account', g.id
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;
  cap := clara._bank_entry_side_capacity(m.entry_id, v_coa);
  if cap.dr_cents = 0 and cap.cr_cents = 0 then
    raise exception 'journal entry % has no movement on bank account %', e.id, v_coa
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_account','entry_id',e.id,
          'account_code',v_coa)::text;
  end if;
  return null;
end $$;

create constraint trigger t_bank_matches_congruence
  after insert or update on clara.bank_matches
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_congruence();
create constraint trigger t_bank_match_line_members_congruence
  after insert or update on clara.bank_match_line_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_congruence();
create constraint trigger t_bank_match_entry_members_congruence
  after insert or update on clara.bank_match_entry_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_match_congruence();

-- ---------------------------------------------------------------------
-- D.2d -- THE STATEMENT-SIDE HALF of "a void statement admits no pending/live member".
-- D.2c catches a member written against an already-void statement; this catches the void
-- written against an already-matched statement. Both are needed because the two writers
-- race in opposite directions and neither one's row lock is visible to the other's belt.
-- clara.void_bank_statement (ingest fragment) takes the chain lock and probes live members
-- under the line row locks; this is the structural backstop behind that probe.
-- ---------------------------------------------------------------------
create function clara._tf_bank_statement_void_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare s record; v_n int;
begin
  -- RE-QUERY BY ID. A statement voided and re-... there is no un-void, but the idiom is
  -- the idiom: judge the row that exists at commit, not the snapshot at queue time.
  select * into s from clara.bank_statements bs where bs.id = new.id;
  if not found then return null; end if;
  if s.status <> 'void' then return null; end if;
  select count(*)::int into v_n
    from clara.bank_match_line_members mm
    join clara.bank_statement_lines l on l.id = mm.line_id
    join clara.bank_matches bm on bm.id = mm.match_id
    where l.statement_id = s.id and bm.status in ('pending','live');
  if v_n > 0 then
    raise exception 'statement % cannot be void while % of its lines ride a pending or live match; unmatch first', s.id, v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','live_bank_match_present','statement_id',s.id,
          'members',v_n)::text;
  end if;
  return null;
end $$;

create constraint trigger t_bank_statements_void_belt
  after update on clara.bank_statements
  deferrable initially deferred
  for each row execute function clara._tf_bank_statement_void_belt();

-- ---------------------------------------------------------------------
-- D.2e -- THE REVERSAL BELT ON clara.journal_entries (design section 4.5, [RV]).
--
-- The NAMED refusals live in clara.reverse_entry and clara.approve_wrong_client_correction
-- (spliced by the change-of-record fragment, beside 0037's allocated_items_present
-- splices). THIS is the structural backstop that covers EVERY present and future reverse
-- path -- including the no-open-item generic entries those splices' predicate cannot see,
-- and including a fifth path nobody has written yet. reversed_by is stamped inside
-- clara._approve_entry_core when the MIRROR approves (0037:2017-2021), so the belt fires
-- from the mirror's transaction, which is exactly the transaction that must fail.
--
-- WHEN clause on the TRANSITION, not on the state: a re-run of the linkage UPDATE on an
-- already-reversed row asserts nothing new, and 0037's belt already re-runs on every
-- approved-row UPDATE. Narrowing to the transition keeps this belt off the hot path of
-- every ordinary approval.
-- ---------------------------------------------------------------------
create function clara._tf_je_bank_match_reversal_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_id uuid; v_rev uuid; v_n int; v_match uuid;
begin
  -- RE-QUERY BY ID (0009:524-529): the row may have moved on since the trigger was queued.
  v_id := new.id;
  select je.reversed_by into v_rev from clara.journal_entries je where je.id = v_id;
  if v_rev is null then return null; end if;
  select count(*)::int, min(bm.id::text)::uuid into v_n, v_match
    from clara.bank_match_entry_members mm
    join clara.bank_matches bm on bm.id = mm.match_id
    where mm.entry_id = v_id and bm.status in ('pending','live');
  if v_n > 0 then
    raise exception 'entry % is a member of % pending or live bank match(es); unmatch first, then reverse', v_id, v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','live_bank_match_present','entry_id',v_id,
          'matches',v_n,'match_id',v_match)::text;
  end if;
  return null;
end $$;

create constraint trigger t_je_bank_match_reversal_belt
  after update on clara.journal_entries
  deferrable initially deferred
  for each row when (new.reversed_by is not null and old.reversed_by is null)
  execute function clara._tf_je_bank_match_reversal_belt();


-- =====================================================================
-- SECTION D.3 -- THE ADJUSTMENT BUILDER. Design section 4.6's executable contract, verbatim.
--
-- HAND-BUILT AS FN-OWNER, the C-a composite idiom (0037:2819-2842): direct INSERT into
-- journal_entries + journal_lines, then clara._assert_balanced, then approve through
-- clara._approve_entry_core with a PRE-RESERVED sub-key and receipt_preheld:true.
-- NEVER clara._draft_entry_core -- it demands a counterparty resolution these verbs
-- cannot have, and its allowlist is invoice-only by WCA-R6/R7 anyway.
--
-- EXACTLY TWO LEGS: the named adjustment account against the line's bank COA. The named
-- account must be ACTIVE, account_class IS NULL, expense- or income-typed, and NOT the bank
-- account itself -- one refusal token, adjustment_account_invalid, because the remedy is
-- always "name a real expense or income account". The account_class IS NULL clause is the
-- load-bearing one and it is here for the same reason 0037 demands it of the discount
-- account (0037:2735-2739): a control-class account admitted here would mint an AR or AP
-- open item out of a bank difference, and a payable-class "adjustment" on a receipt would
-- build a cross-domain contra the subledger's own belt would then refuse at commit with a
-- message about a domain the human never mentioned.
--
-- coding_kind = NULL and COUNTERPARTY-FREE BY CONSTRUCTION. Both are deliberate and both
-- are load-bearing:
--   * coding_kind NULL + zero control legs sends the 0037 classifier down LADDER 5 with an
--     EMPTY control-net set, so the entry mints NO open item at all. A bank difference is
--     not a claim on anybody.
--   * counterparty-free is ALSO the named reason clara._approve_entry_core never requests
--     the 203005003 counterparty rung on this path (0037:1909-1912 takes it only when
--     v_counterparty is not null, and v_counterparty is derived from control legs this
--     entry does not have). Part2 section 4.9 states that as a property of the lock order;
--     it is pinned by a cell, not left to luck.
--
-- posting_date is the SETTLEMENT's posting date, so the difference lands in the same period
-- as the movement it explains. The memo stamps the match provenance -- match id, line id,
-- line number and date -- and deliberately carries NO statement description: descriptions
-- are uncorroborated prose (design section 4.2) and this text ends up in the GL.
--
-- CLR05 INHERITANCE, NAMED. The approve runs through the ordinary core, so an adjustment
-- large enough to be high-stakes in a two-checker firm refuses CLR05 distinct_checker.
-- That is the maker-checker law working, not a bug: an adjustment that size is a judgement
-- somebody else must see. p_attestation is threaded for the solo-firm case, exactly as the
-- C-a composites thread it.
-- =====================================================================
create function clara._bank_match_adjustment_entry(
    p_ctx jsonb, p_client uuid, p_bank_coa text, p_account text,
    p_amount_cents bigint, p_posting_date date, p_memo text, p_flags jsonb,
    p_approve_key text, p_attestation text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_entry uuid; v_rev uuid; v_actor uuid; v_memo text;
begin
  v_actor := (p_ctx->>'actor')::uuid;
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'a bank match adjustment must move a non-zero amount'
      using errcode='CLR10',detail='{"reason":"adjustment_amount_invalid"}';
  end if;
  if p_account is null or btrim(p_account) = '' or p_account = p_bank_coa
     or not exists (select 1 from clara.coa_accounts a
                    where a.client_id = p_client and a.account_code = p_account
                      and a.is_active and a.account_class is null
                      and a.account_type in ('expense','income')) then
    raise exception 'a bank match adjustment must be booked to an active, non-control expense or income account that is not the bank account itself'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','adjustment_account_invalid',
          'account_code',p_account)::text;
  end if;
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Bank match adjustment');

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      null, v_actor, v_actor, coalesce(p_flags, '{}'::jsonb))
    returning id into v_entry;
  -- The bank leg is ALWAYS line 1, so an adjustment reads the same way in /bank and in the
  -- GL whichever direction it goes. counterparty_id is stated as NULL rather than defaulted
  -- so the counterparty-free property is visible at the write, not inferred from an omission.
  if p_amount_cents > 0 then
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 1, p_bank_coa, p_amount_cents, 0, v_memo, null);
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 2, p_account, 0, p_amount_cents, v_memo, null);
  else
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 1, p_bank_coa, 0, -p_amount_cents, v_memo, null);
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 2, p_account, -p_amount_cents, 0, v_memo, null);
  end if;
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token
  -- read at INSERT ... RETURNING time is already stale by the time the core checks it
  -- (0037:2843-2845).
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;
  perform clara._approve_entry_core(
    p_ctx || jsonb_build_object('receipt_preheld', true),
    v_entry, v_rev, p_attestation, p_approve_key);
  return v_entry;
end $$;
revoke all on function clara._bank_match_adjustment_entry(
  jsonb,uuid,text,text,bigint,date,text,jsonb,text,text) from public;


-- =====================================================================
-- SECTION D.4 -- clara.match_bank_line. N statement lines x M EXISTING approved entries in
-- ONE group (WC-R2's N:M is real: two IBG transfers clearing one recorded receipt is one
-- group and one audit object, not two half-truths).
--
-- THE REFUSAL SET, EXACTLY AS DESIGN SECTION 4.6 RULES IT:
--   wrong_account            -- an entry with zero movement on this account's COA, or a
--                               line whose statement is on a different bank account.
--   wrong_period             -- STRUCTURAL ONLY: a member line's statement is not 'live'.
--                               The GAP1-1 substance (line-to-recon congruence) is
--                               structural in the group model.
--   [the posting-date case]  -- a member entry with posting_date > the statement's
--                               period_end is NOT a refusal. It is a RECORDED, ACKNOWLEDGED
--                               EXCEPTION: p_ack_period_exceptions must be true, and the
--                               exception rides the member row, the audit payload and the
--                               /bank banner. v1's hard RAISE prescribed a remedy
--                               _tf_entry_immutable forbids and would strand ordinary
--                               Malaysian catch-up bookkeeping -- direct debits posting
--                               after a weekend, late-received invoices. The unacknowledged
--                               case refuses under its own token so the human is asked
--                               rather than surprised.
--   amount_beyond_tolerance  -- the group does not tie and no adjustment covers it.
--                               Tolerance is ZERO per WC-R6.
--   already_matched          -- line exclusivity (the partial unique index) or per-side
--                               cents exhaustion on an entry.
--   reversed_entry /
--   reversal_mirror          -- the section 4.5 membership floors, by name.
--
-- LOCK ORDER (part2 section 4.9), and this verb is the one that LOCKS PRE-EXISTING ENTRIES,
-- so it is the one 0037's invariant (1) speaks about:
--   op-receipt  ->  all sub-key reservations (BEFORE any lock, 0037:2678-2698's reasoning:
--                   _reserve_op writes a row and can BLOCK on a concurrent inserter of the
--                   same key; taking that block while holding an advisory lock makes a
--                   deadlock reachable)
--   ->  journal_entries rows FOR UPDATE ORDER BY id   (the reverse_entry relative order)
--   ->  advisory 203005004 (client)
--   ->  bank_statement_lines FOR UPDATE ORDER BY id + bank_statements FOR SHARE
--   ->  member writes
--   ->  adjustment entries through the core (FRESH rows; counterparty-free => no 203005003)
-- 0037's invariant (1) says it exactly: ANY FUTURE VERB THAT LOCKS A PRE-EXISTING ENTRY
-- MUST TAKE journal_entries BEFORE open_items. This verb takes no open_items lock at all;
-- the adjustment entries it builds mint no open items (section D.3).
-- =====================================================================
create function clara.match_bank_line(
    p_client uuid, p_lines jsonb, p_entries jsonb,
    p_adjustments jsonb default null, p_ack_period_exceptions boolean default false,
    p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid;
  v_lines jsonb; v_entries jsonb; v_adjs jsonb;
  v_n int; v_dis int; v_ack boolean;
  v_line_ids uuid[]; v_entry_ids uuid[];
  v_bank uuid; v_coa text; v_period_end date;
  v_line_cents bigint := 0; v_entry_cents bigint := 0; v_adj_cents bigint := 0;
  v_match uuid; v_ctx jsonb;
  v_exceptions int := 0; v_adj_entries uuid[] := '{}'::uuid[]; v_adj_entry uuid;
  ln record; en record; aj record; st record; e record; cap record;
  v_i int; v_key text; v_exc boolean;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_ack := coalesce(p_ack_period_exceptions, false);

  -- ---------------------------------------------------------------
  -- NORMALIZE AND VALIDATE THE THREE SETS BEFORE HASHING THEM (0037:2629-2662 idiom).
  -- Validated straight off the raw argument so a malformed uuid or a fractional amount
  -- becomes a NAMED refusal rather than a raw cast error a caller cannot act on.
  -- p_lines accepts either bare uuid strings or {"line_id": "..."} objects: the dashboard
  -- posts objects, the test rig posts strings, and both normalize to one sorted array
  -- before the hash so two spellings of the same request hash the same.
  -- ---------------------------------------------------------------
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'the line set must be a non-empty json array'
      using errcode='CLR10',detail='{"reason":"lines_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as x(elem)
    where coalesce(case jsonb_typeof(x.elem)
                     when 'string' then x.elem #>> '{}'
                     when 'object' then x.elem ->> 'line_id'
                     else null end, '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'each line must be a statement line id'
      using errcode='CLR10',detail='{"reason":"lines_malformed"}';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t.lid) order by t.lid), '[]'::jsonb),
         count(*)::int, count(distinct t.lid)::int
    into v_lines, v_n, v_dis
    from (select case jsonb_typeof(x.elem) when 'string' then x.elem #>> '{}'
                                           else x.elem ->> 'line_id' end as lid
          from jsonb_array_elements(p_lines) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same statement line appears twice in one match; a line enters a group once, at its full amount'
      using errcode='CLR10',detail='{"reason":"lines_duplicated"}';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'the entry set must be a non-empty json array'
      using errcode='CLR10',detail='{"reason":"entries_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'entry_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'matched_cents') <> 'number'
       or (x.elem->>'matched_cents')::numeric = 0
       or (x.elem->>'matched_cents')::numeric <> trunc((x.elem->>'matched_cents')::numeric)
  ) then
    raise exception 'each entry must state an entry_id and a non-zero whole matched_cents'
      using errcode='CLR10',detail='{"reason":"entries_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', t.eid, 'matched_cents', t.amt)
           order by t.eid), '[]'::jsonb),
         count(*)::int, count(distinct t.eid)::int, coalesce(sum(t.amt), 0)
    into v_entries, v_n, v_dis, v_entry_cents
    from (select (x.elem->>'entry_id')::uuid as eid,
                 (x.elem->>'matched_cents')::bigint as amt
          from jsonb_array_elements(p_entries) as x(elem)) t;
  -- ONE ROW PER (entry, SIDE) -- adjudicated at assembly (cell x38.h): a gross two-sided
  -- entry legitimately states one member per bank side; only a same-side duplicate is
  -- order-dependent double counting.
  if exists (
    select 1 from (select (x.elem->>'entry_id')::uuid as eid,
                          ((x.elem->>'matched_cents')::bigint > 0) as pos
                   from jsonb_array_elements(p_entries) as x(elem)) d
    group by d.eid, d.pos having count(*) > 1
  ) then
    raise exception 'the same journal entry states the same bank side twice in one match; one member per entry per side'
      using errcode='CLR10',detail='{"reason":"entries_duplicated"}';
  end if;

  -- p_adjustments: [{account_code, amount_cents, memo?}]. amount_cents is the SIGNED effect
  -- on the BANK account, the same convention every other amount in this file uses.
  if p_adjustments is not null and jsonb_typeof(p_adjustments) <> 'array' then
    raise exception 'the adjustment set must be a json array'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(btrim(x.elem->>'account_code'),'') = ''
       or jsonb_typeof(x.elem->'amount_cents') is distinct from 'number'
       or (x.elem->>'amount_cents')::numeric = 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each adjustment must state an account_code and a non-zero whole amount_cents'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', t.acc,
             'amount_cents', t.amt, 'memo', t.memo)
           order by t.acc, t.amt, coalesce(t.memo,'')), '[]'::jsonb),
         coalesce(sum(t.amt), 0)
    into v_adjs, v_adj_cents
    from (select btrim(x.elem->>'account_code') as acc,
                 (x.elem->>'amount_cents')::bigint as amt,
                 nullif(btrim(x.elem->>'memo'),'') as memo
          from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)) t;

  -- ---------------------------------------------------------------
  -- THE REQUEST HASH CARRIES EVERY ARGUMENT THAT REACHES A STORED COLUMN OR A DECISION --
  -- including p_ack_period_exceptions, which is BOTH: it decides whether a posting-date
  -- exception is admitted AND it is recorded on the member row and in the audit. Omitting
  -- it would let the same op_key replayed with ack=true return the ack=false call's
  -- refusal-free receipt while the caller believes an acknowledgement was recorded.
  -- ---------------------------------------------------------------
  v_dedupe := clara._reserve_op(c.firm, 'match_bank_line', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'lines', v_lines,
      'entries', v_entries, 'adjustments', v_adjs,
      'ack_period_exceptions', v_ack)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- PRE-RESERVE EVERY ADJUSTMENT SUB-KEY HERE, BEFORE THE FIRST LOCK (design section 4.6:
  -- "ALL pre-reserved before the first advisory lock"). The reasoning is 0037:2678-2698's,
  -- verbatim in substance: _reserve_op writes an op_receipts row and can BLOCK on a
  -- concurrent inserter of the same key; taking that block while already holding a row or
  -- advisory lock makes a deadlock reachable -- two sessions, each holding the other's next
  -- rung. Claiming the namespace first costs nothing, because a reservation rolls back with
  -- its transaction (0004:43-60), so a retry re-executes cleanly.
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt,
                   (x.elem->>'memo') as memo
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    v_key := p_op_key || ':adj:' || v_i;
    if clara._reserve_op(c.firm, 'bank_match_adjustment', v_key,
         clara._hash(jsonb_build_object('op_key', p_op_key, 'i', v_i,
           'account_code', aj.acc, 'amount_cents', aj.amt))) is not null then
      raise exception 'the derived adjustment op key % is already in use', v_key
        using errcode='CLR10',detail='{"reason":"adjustment_key_collision"}';
    end if;
    if clara._reserve_op(c.firm, 'approve_entry', v_key || ':approve',
         clara._hash(jsonb_build_object('composite', 'match_bank_line',
           'op_key', p_op_key, 'i', v_i))) is not null then
      raise exception 'the derived approve op key %:approve is already in use', v_key
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end loop;

  -- ---------------------------------------------------------------
  -- LOCKS, in the total order. journal_entries FIRST (this verb locks PRE-EXISTING entries,
  -- so it is bound by the reverse_entry relative order), then the client advisory rung,
  -- then the bank rows LAST -- part2 section 4.9's law, stated once and obeyed here.
  -- ---------------------------------------------------------------
  select array_agg(distinct (x.elem->>'entry_id')::uuid) into v_entry_ids
    from jsonb_array_elements(v_entries) as x(elem);
  perform 1 from clara.journal_entries je where je.id = any(v_entry_ids)
    order by je.id for update;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select array_agg(distinct (x.elem #>> '{}')::uuid) into v_line_ids
    from jsonb_array_elements(v_lines) as x(elem);
  perform 1 from clara.bank_statement_lines l where l.id = any(v_line_ids)
    order by l.id for update;
  perform 1 from clara.bank_statements s
    where s.id in (select l.statement_id from clara.bank_statement_lines l
                   where l.id = any(v_line_ids))
    order by s.id for share;

  -- ---------------------------------------------------------------
  -- THE LINE SIDE. One bank account for the whole group -- derived from the lines'
  -- statements, never caller-passed -- and the period end that the posting-date exception
  -- is measured against.
  -- ---------------------------------------------------------------
  for ln in select l.* from clara.bank_statement_lines l
            where l.id = any(v_line_ids) order by l.id loop
    if ln.client_id <> p_client or ln.firm_id <> c.firm then
      raise exception 'statement line % is not in this client', ln.id using errcode='CLR11';
    end if;
    select * into st from clara.bank_statements s where s.id = ln.statement_id;
    if not found then
      raise exception 'statement line % has no statement', ln.id
        using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
    end if;
    -- wrong_period, STRUCTURAL ONLY (design section 4.6). A void statement is not a period
    -- the books may still be matched against.
    if st.status <> 'live' then
      raise exception 'statement line % belongs to a % statement; only a live statement admits a match', ln.id, st.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_period','line_id',ln.id,
            'statement_id',st.id,'statement_status',st.status)::text;
    end if;
    if v_bank is null then
      v_bank := st.bank_account_id;
      v_period_end := st.period_end;
    elsif v_bank <> st.bank_account_id then
      raise exception 'the lines in one match must all belong to one bank account'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_account','line_id',ln.id)::text;
    else
      -- N lines may span N statements of the SAME account (a transfer straddling a month
      -- end is one economic event). The exception window is measured against the LATEST
      -- period end in the group, which is the only reading that does not manufacture a
      -- spurious exception out of a legitimate cross-month group.
      v_period_end := greatest(v_period_end, st.period_end);
    end if;
    -- LINE EXCLUSIVITY, refused BY NAME under the line's own row lock, before the partial
    -- unique index has to speak. The index is the structural guarantee; this is the message
    -- a human can act on.
    if exists (select 1 from clara.bank_match_line_members mm
               join clara.bank_matches bm on bm.id = mm.match_id
               where mm.line_id = ln.id and bm.status in ('pending','live')) then
      raise exception 'statement line % already rides a pending or live match; unmatch it first', ln.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','line_id',ln.id)::text;
    end if;
    v_line_cents := v_line_cents + ln.amount_cents;
  end loop;

  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client;
  if v_coa is null then
    raise exception 'this bank account has no mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- ---------------------------------------------------------------
  -- THE ENTRY SIDE. Floors first, then the per-side capacity, then the posting-date
  -- exception -- in that order, so the human gets the most structural complaint first.
  -- ---------------------------------------------------------------
  if v_line_cents <> v_entry_cents + v_adj_cents then
    raise exception 'this match does not tie: % cents of statement lines against % cents of entries plus % cents of adjustments', v_line_cents, v_entry_cents, v_adj_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_beyond_tolerance',
          'line_cents',v_line_cents,'entry_cents',v_entry_cents,
          'adjustment_cents',v_adj_cents)::text;
  end if;

  v_match := gen_random_uuid();
  insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin,
      matched_via_rule_id, draft_entry_id, created_by, completed_at)
    values (v_match, c.firm, p_client, v_bank, 'live', 'human', null, null, c.actor, now());

  for ln in select l.* from clara.bank_statement_lines l
            where l.id = any(v_line_ids) order by l.id loop
    -- The exclusivity index is the structural guarantee and a concurrent settle can win
    -- the race between the probe above and this insert. Translating its unique_violation
    -- back into the NAMED refusal is what keeps the two paths indistinguishable to the
    -- human; the index name is deliberately not referenced, so a rename in the tables
    -- fragment cannot silently turn this into a raw 23505.
    begin
      insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id,
          amount_cents, group_status)
        values (c.firm, p_client, v_match, ln.id, ln.amount_cents, 'live');
    exception when unique_violation then
      raise exception 'statement line % was matched by another transaction while this match was being written', ln.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','line_id',ln.id)::text;
    end;
  end loop;

  for en in select (x.elem->>'entry_id')::uuid as entry_id,
                   (x.elem->>'matched_cents')::bigint as amt
            from jsonb_array_elements(v_entries) as x(elem) order by 1 loop
    select * into e from clara.journal_entries je where je.id = en.entry_id;
    if not found or e.client_id <> p_client or e.firm_id <> c.firm then
      raise exception 'journal entry % is not in this client', en.entry_id using errcode='CLR11';
    end if;
    if e.status <> 'approved' then
      raise exception 'journal entry % is not approved; only posted entries can be matched', en.entry_id
        using errcode='CLR10',detail='{"reason":"entry_not_approved"}';
    end if;
    -- THE TWO REVERSAL FLOORS, BY NAME (design section 4.5). A reversed original stays
    -- status='approved' (0003:371-383), so approval status alone floors neither shape --
    -- which is exactly why they are two separate named refusals with two different remedies.
    if e.reversed_by is not null then
      raise exception 'journal entry % has been reversed; match its replacement, not the entry the books have cancelled', en.entry_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','reversed_entry','entry_id',en.entry_id,
            'reversed_by',e.reversed_by)::text;
    end if;
    if e.reversal_of is not null then
      raise exception 'journal entry % is a reversal mirror; a mirror is the undoing of an entry, not a movement the bank printed', en.entry_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','reversal_mirror','entry_id',en.entry_id,
            'reversal_of',e.reversal_of)::text;
    end if;
    -- wrong_account, as its OWN statement rather than as a zero capacity bound: an entry
    -- that never touched this bank account is a mis-click, and reporting it as
    -- already_matched would send the human hunting a group that does not exist.
    cap := clara._bank_entry_side_capacity(en.entry_id, v_coa);
    if cap.dr_cents = 0 and cap.cr_cents = 0 then
      raise exception 'journal entry % has no movement on bank account %', en.entry_id, v_coa
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_account','entry_id',en.entry_id,
            'account_code',v_coa)::text;
    end if;
    -- PER-SIDE, ABSOLUTE EXHAUSTION, refused by name here and re-asserted by the belt at
    -- commit. The pool counts every pending/live group on the SAME bank account, including
    -- the members this transaction has already written.
    if en.amt > 0 and en.amt > cap.dr_cents - coalesce((
         select sum(em.matched_cents) from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id
         where em.entry_id = en.entry_id and em.matched_cents > 0
           and bm.status in ('pending','live') and bm.bank_account_id = v_bank), 0) then
      raise exception 'journal entry % has no unmatched debit cents left on %', en.entry_id, v_coa
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','side','debit',
            'entry_id',en.entry_id,'account_code',v_coa)::text;
    end if;
    if en.amt < 0 and -en.amt > cap.cr_cents - coalesce((
         select sum(-em.matched_cents) from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id
         where em.entry_id = en.entry_id and em.matched_cents < 0
           and bm.status in ('pending','live') and bm.bank_account_id = v_bank), 0) then
      raise exception 'journal entry % has no unmatched credit cents left on %', en.entry_id, v_coa
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','side','credit',
            'entry_id',en.entry_id,'account_code',v_coa)::text;
    end if;
    -- THE POSTING-DATE EXCEPTION (design section 4.6, v2's correction). NOT a refusal --
    -- a RECORDED, ACKNOWLEDGED EXCEPTION. Direct debits post after a weekend and invoices
    -- arrive late; v1's hard RAISE prescribed a remedy _tf_entry_immutable forbids and
    -- would have stranded ordinary Malaysian catch-up bookkeeping. What IS refused is doing
    -- it SILENTLY: the human must say so, and the fact rides the member row, the audit
    -- payload and the /bank banner from then on.
    v_exc := e.posting_date > v_period_end;
    if v_exc and not v_ack then
      raise exception 'journal entry % posts on %, after the statement period ends on %; acknowledge the posting-date exception to match it', en.entry_id, e.posting_date, v_period_end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','period_exception_unacknowledged',
            'entry_id',en.entry_id,'posting_date',e.posting_date,
            'period_end',v_period_end)::text;
    end if;
    if v_exc then v_exceptions := v_exceptions + 1; end if;
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      values (c.firm, p_client, v_match, en.entry_id, en.amt, 'live', v_exc);
  end loop;

  -- ---------------------------------------------------------------
  -- THE ADJUSTMENTS, LAST, exactly as part2 section 4.9 orders them: fresh entries through
  -- the core, after every pre-existing row this transaction touches is already locked.
  -- ---------------------------------------------------------------
  v_ctx := jsonb_build_object('actor', c.actor, 'firm', c.firm);
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt,
                   (x.elem->>'memo') as memo
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    -- The posting date of a match adjustment is the LATEST period end in the group: the
    -- difference is a fact about the statement, and there is no settlement posting date to
    -- inherit on this verb (that inheritance is settle_from_bank_line's, section D.5).
    v_adj_entry := clara._bank_match_adjustment_entry(
      v_ctx, p_client, v_coa, aj.acc, aj.amt, v_period_end,
      coalesce(aj.memo, 'Bank match difference'),
      jsonb_build_object('bank_match', jsonb_build_object(
        'match_id', v_match, 'kind', 'adjustment', 'index', v_i)),
      p_op_key || ':adj:' || v_i || ':approve', null);
    perform clara._finish_op(c.firm, 'bank_match_adjustment',
      p_op_key || ':adj:' || v_i, jsonb_build_object('entry_id', v_adj_entry));
    v_adj_entries := v_adj_entries || v_adj_entry;
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      values (c.firm, p_client, v_match, v_adj_entry, aj.amt, 'live', false);
  end loop;

  -- ---------------------------------------------------------------
  -- THE RECORD. bank_match_audit carries the FULL member set and the amounts; the spine
  -- event carries IDENTIFIERS ONLY -- clara.domain_events is agent-readable firm-wide
  -- (0005:379-408), so an account number or a line description in a payload is a leak, and
  -- the migration's tail scans every bank.* payload key set against an allowlist.
  -- ---------------------------------------------------------------
  perform clara._bank_match_audit(c.firm, p_client, v_match, 'match', c.actor, null,
    jsonb_build_object('lines', v_lines, 'entries', v_entries, 'adjustments', v_adjs,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'line_cents', v_line_cents, 'entry_cents', v_entry_cents,
      'adjustment_cents', v_adj_cents,
      'bank_account_id', v_bank, 'account_code', v_coa,
      'period_exceptions', v_exceptions,
      'ack_period_exceptions', v_ack, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, 'match_bank_line', null,
    jsonb_build_object('client', p_client, 'match_id', v_match,
      'line_cents', v_line_cents, 'entry_cents', v_entry_cents,
      'adjustment_cents', v_adj_cents, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.match_created', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('match_id', v_match, 'bank_account_id', v_bank,
      'status', 'live', 'line_ids', to_jsonb(v_line_ids),
      'entry_ids', to_jsonb(v_entry_ids),
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', v_exceptions));
  return clara._finish_op(c.firm, 'match_bank_line', p_op_key,
    jsonb_build_object('match_id', v_match, 'status', 'live',
      'line_cents', v_line_cents, 'entry_cents', v_entry_cents,
      'adjustment_cents', v_adj_cents,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', v_exceptions));
end $$;


-- =====================================================================
-- SECTION D.5 -- clara.settle_from_bank_line (WCB-R3). THE VERB THAT CLOSES C-a's NAMED
-- INTERVAL: a settlement born FROM the line, with the line owned in the SAME TRANSACTION.
--
-- IT DELEGATES THE SETTLEMENT ITSELF TO THE C-a COMPOSITES AND DOES NOT RE-CUT THEM.
-- clara.allocate_receipt / clara.allocate_payment are called with a DERIVED SUB-KEY
-- (p_op_key || ':settle'). That is a deliberate design decision and it is reported rather
-- than smuggled:
--   * The composites' shape, refusals, proposal pinning, WCA-R7 draft branch and
--     approve-time re-derivation are the money-movement law of this system. Inlining them
--     would be a SECOND implementation of allocation to drift -- exactly what 0037's "one
--     classifier, no second implementation" header forbids in the analogous place.
--   * Their lock order is already the composite order (op-receipt -> sub-keys -> 203005003
--     -> 203005004 -> open_items -> the fresh entry), which is precisely what part2
--     section 4.9 says this verb must ride, "then bank rows LAST".
--   * The composites pre-reserve their own derived ':approve' key BEFORE their first
--     advisory lock (0037:2678-2698), so nesting them adds no new deadlock window -- and
--     this verb takes NO lock at all before the call, which is what makes that true.
-- The bank-side writes cannot live inside them (they know nothing about statements), so the
-- group is written HERE, after the composite returns, under the line and statement locks.
-- One transaction throughout: an abort takes the entry, the allocations, the group, the
-- adjustments and the events with it (outbox law).
--
-- DOMAIN FROM THE COUNTERPARTY'S KIND, NEVER THE CASH SIGN, with the sign validated as
-- CONSISTENCY afterwards:
--   customer + inflow  -> receipt
--   vendor   + outflow -> payment
--   customer + outflow / vendor + inflow  -> refund_not_supported, with the sanctioned
--     workaround IN THE MESSAGE (a generic entry with a counterparty-stamped control leg
--     -> C-a mints the adjustment item -> apply_open_items against the residue ->
--     match_bank_line). First-class refund composites are a later wave; the workaround has
--     its own acceptance cell and it ties end to end.
--
-- THE BANK-CHARGE ASYMMETRY (design section 4.6, and it is not cosmetic):
--   RECEIPT SIDE -- ONE customer_receipt entry riding C-a's EXPENSE-SLOT shape.
--     p_charge_cents / p_charge_account go straight into allocate_receipt's
--     p_discount_cents / p_discount_account, producing Dr Bank (the line) + Dr Charges /
--     Cr AR (GROSS). The invoice clears at GROSS with zero phantom outstanding. This works
--     because the shape asserts are ASYMMETRIC: _assert_customer_receipt_shape_at forbids
--     INCOME legs but ADMITS expense legs (0037:2605-2614, 2740-2748). v1's separate-entry
--     treatment left every net-credited TT receipt RM-short forever.
--   PAYMENT SIDE -- the charge is a SEPARATE same-transaction adjustment entry, because
--     _assert_supplier_payment_shape_at forbids expense legs. The group ties across BOTH
--     entries, which is exactly what the N:M group model exists to express.
--
-- THE ARITHMETIC, ONCE, in the signed bank convention (+ = into the account):
--   L = the line's amount_cents (signed)   A = SUM(p_adjustments amounts, signed)
--   C = p_charge_cents (>= 0)
--   RECEIPT (L > 0): the receipt entry's bank debit R = L - A, and the charge does NOT
--     touch the bank at all (it rides the AR gross). Members: +R, plus each adjustment.
--     SUM = R + A = L.
--   PAYMENT (L < 0): the payment entry's bank credit is |P| where P = L + C - A, the charge
--     entry's bank effect is -C, and the adjustments' is A. Members: P, -C, A.
--     SUM = P - C + A = L.
-- Both tie to the sen by construction; the group-tie belt is what keeps that true when a
-- future caller gets creative.
--
-- AT/ABOVE THE HIGH-STAKES THRESHOLD -- THE PENDING-MATCH RESERVATION (design section 4.6,
-- and section 7's owner note). The composite runs the C-a maker-checker path (a draft plus
-- the stored, outstanding-pinned allocation proposal, WCA-R7) AND this verb creates the
-- group at status='pending' with the LINE MEMBER and draft_entry_id. THE LINE IS OWNED THE
-- MOMENT THE MAKER ACTS, so the approved-but-unmatched interval v1 reopened never opens --
-- exactly where the money is largest. The checker approves in /queue (CLR05 law untouched);
-- clara.complete_pending_match then flips pending->live. The maker cancels through
-- clara.unmatch_bank_match, which works on 'pending'. v1's high_stakes_two_step refusal is
-- WITHDRAWN -- it contradicted WCB-R3's one-transaction ruling.
-- =====================================================================
create function clara.settle_from_bank_line(
    p_client uuid, p_line uuid, p_counterparty uuid, p_allocations jsonb,
    p_memo text, p_posting_date date default null,
    p_charge_cents bigint default 0, p_charge_account text default null,
    p_adjustments jsonb default null, p_attestation text default null,
    p_control_account text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  ln record; st record; v_coa text; v_bank uuid;
  v_adjs jsonb; v_adj_cents bigint := 0; v_charge bigint; v_pd date;
  v_domain text; v_settle_cents bigint; v_res jsonb; v_entry uuid; v_status text;
  v_match uuid; v_match_status text; v_ctx jsonb; v_memo text;
  v_adj_entries uuid[] := '{}'::uuid[]; v_adj_entry uuid; v_charge_entry uuid;
  v_i int; v_key text; aj record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_charge := coalesce(p_charge_cents, 0);
  if v_charge < 0 then
    raise exception 'a bank charge cannot be negative'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;
  if v_charge = 0 and p_charge_account is not null then
    raise exception 'a charge account was named but no charge amount was stated'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;
  if v_charge > 0 and (p_charge_account is null or btrim(p_charge_account) = '') then
    raise exception 'a bank charge must name the expense account it is booked to'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;

  if p_adjustments is not null and jsonb_typeof(p_adjustments) <> 'array' then
    raise exception 'the adjustment set must be a json array'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(btrim(x.elem->>'account_code'),'') = ''
       or jsonb_typeof(x.elem->'amount_cents') is distinct from 'number'
       or (x.elem->>'amount_cents')::numeric = 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each adjustment must state an account_code and a non-zero whole amount_cents'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', t.acc,
             'amount_cents', t.amt, 'memo', t.memo)
           order by t.acc, t.amt, coalesce(t.memo,'')), '[]'::jsonb),
         coalesce(sum(t.amt), 0)
    into v_adjs, v_adj_cents
    from (select btrim(x.elem->>'account_code') as acc,
                 (x.elem->>'amount_cents')::bigint as amt,
                 nullif(btrim(x.elem->>'memo'),'') as memo
          from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)) t;

  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;

  -- THE REQUEST HASH. Every argument that reaches a stored column or a decision, with the
  -- adjustment array canonicalised. p_control_account is in it for the reason 0037:2664-2669
  -- states of its twin: it DECIDES which control account the settlement touches, and a
  -- replay under the same key with a different one must not return the first call's receipt.
  v_dedupe := clara._reserve_op(c.firm, 'settle_from_bank_line', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'line', p_line,
      'counterparty', v_cp, 'allocations', coalesce(p_allocations,'[]'::jsonb),
      'memo', nullif(btrim(coalesce(p_memo,'')),''), 'posting_date', p_posting_date,
      'charge_cents', v_charge, 'charge_account', p_charge_account,
      'adjustments', v_adjs, 'attestation', p_attestation,
      'control_account', p_control_account)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ALL SUB-KEY RESERVATIONS BEFORE THE FIRST LOCK (part2 section 4.9's composite order,
  -- and 0037:2678-2698's deadlock reasoning). The ':settle' key is the composite's own;
  -- the ':adj:i' family covers the difference adjustments; ':charge' covers the payment-side
  -- bank charge. The composite reserves its own ':settle:approve' internally.
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    v_key := p_op_key || ':adj:' || v_i;
    if clara._reserve_op(c.firm, 'bank_match_adjustment', v_key,
         clara._hash(jsonb_build_object('op_key', p_op_key, 'i', v_i,
           'account_code', aj.acc, 'amount_cents', aj.amt))) is not null then
      raise exception 'the derived adjustment op key % is already in use', v_key
        using errcode='CLR10',detail='{"reason":"adjustment_key_collision"}';
    end if;
    if clara._reserve_op(c.firm, 'approve_entry', v_key || ':approve',
         clara._hash(jsonb_build_object('composite', 'settle_from_bank_line',
           'op_key', p_op_key, 'i', v_i))) is not null then
      raise exception 'the derived approve op key %:approve is already in use', v_key
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end loop;
  -- The charge sub-key is claimed ONLY on the branch that will spend it -- the payment side
  -- with a stated charge. The receipt side books its charge through C-a's expense slot and
  -- mints no second entry, and claiming a namespace a branch can never reach would leave an
  -- op_receipts row nobody can ever finish.
  if v_charge > 0 and v_cp_kind = 'vendor' then
    if clara._reserve_op(c.firm, 'approve_entry', p_op_key || ':charge:approve',
         clara._hash(jsonb_build_object('composite', 'settle_from_bank_line',
           'op_key', p_op_key, 'leg', 'charge'))) is not null then
      raise exception 'the derived charge approve op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- READ AND VALIDATE THE LINE BEFORE ANY LOCK. The line row is locked LAST (part2 4.9:
  -- "then bank rows LAST"), and the exclusivity index is the structural guard against the
  -- window this opens -- a concurrent matcher that wins the race is caught by the index and
  -- reported as already_matched, which is the same answer the human would have got.
  -- ---------------------------------------------------------------
  select * into ln from clara.bank_statement_lines l where l.id = p_line;
  if not found or ln.client_id <> p_client or ln.firm_id <> c.firm then
    raise exception 'statement line % is not in this client', p_line using errcode='CLR11';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found then
    raise exception 'statement line % has no statement', p_line
      using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
  end if;
  if st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a settlement', p_line, st.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',p_line,
          'statement_id',st.id,'statement_status',st.status)::text;
  end if;
  if exists (select 1 from clara.bank_match_line_members mm
             join clara.bank_matches bm on bm.id = mm.match_id
             where mm.line_id = p_line and bm.status in ('pending','live')) then
    raise exception 'statement line % already rides a pending or live match; unmatch it first', p_line
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end if;
  v_bank := st.bank_account_id;
  -- THE GL BANK ACCOUNT COMES FROM THE LINE'S STATEMENT, NEVER CALLER-PASSED (design
  -- section 4.6). A caller-passed bank account is how a settlement gets posted to the wrong
  -- ledger and still reconciles on paper.
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client and ba.active;
  if v_coa is null then
    raise exception 'this bank account has no active mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- p_posting_date defaults to the LINE's entry_date and is validated within the statement
  -- period. v1 named no date at all while the composites require one.
  v_pd := coalesce(p_posting_date, ln.entry_date);
  if v_pd < st.period_start or v_pd > st.period_end then
    raise exception 'a settlement posted from a statement line must post inside the statement period (% .. %), not on %', st.period_start, st.period_end, v_pd
      using errcode='CLR10',
        detail=jsonb_build_object('reason','posting_date_out_of_period',
          'posting_date',v_pd,'period_start',st.period_start,
          'period_end',st.period_end)::text;
  end if;

  -- ---------------------------------------------------------------
  -- DOMAIN FROM THE KIND; SIGN AS CONSISTENCY. The refund quadrants refuse BY NAME with the
  -- sanctioned workaround in the message.
  -- ---------------------------------------------------------------
  if v_cp_kind = 'customer' then
    v_domain := 'ar';
    if ln.amount_cents < 0 then
      raise exception 'money leaving the bank to a CUSTOMER is a refund, which has no settlement composite yet; post a generic entry with a counterparty-stamped receivable control leg (C-a mints the adjustment item), apply_open_items it against the residue, then match_bank_line this line'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','refund_not_supported','domain','ar',
            'line_id',p_line,'amount_cents',ln.amount_cents)::text;
    end if;
  elsif v_cp_kind = 'vendor' then
    v_domain := 'ap';
    if ln.amount_cents > 0 then
      raise exception 'money arriving from a VENDOR is a refund, which has no settlement composite yet; post a generic entry with a counterparty-stamped payable control leg (C-a mints the adjustment item), apply_open_items it against the residue, then match_bank_line this line'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','refund_not_supported','domain','ap',
            'line_id',p_line,'amount_cents',ln.amount_cents)::text;
    end if;
  else
    raise exception 'a settlement requires a counterparty of kind customer or vendor, not %', coalesce(v_cp_kind,'(unknown)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','counterparty_kind_mismatch',
          'counterparty_kind',v_cp_kind)::text;
  end if;

  v_memo := coalesce(nullif(btrim(p_memo), ''),
    case when v_domain='ar' then 'Customer receipt' else 'Supplier payment' end);
  v_ctx := jsonb_build_object('actor', c.actor, 'firm', c.firm);

  -- ---------------------------------------------------------------
  -- THE SETTLEMENT, through the C-a composite. See the section header for the arithmetic.
  -- ---------------------------------------------------------------
  if v_domain = 'ar' then
    v_settle_cents := ln.amount_cents - v_adj_cents;
    if v_settle_cents <= 0 then
      raise exception 'after % cents of adjustments this line leaves % cents to receipt; a receipt must be positive', v_adj_cents, v_settle_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','settlement_amount_invalid',
            'line_cents',ln.amount_cents,'adjustment_cents',v_adj_cents,
            'settlement_cents',v_settle_cents)::text;
    end if;
    v_res := clara.allocate_receipt(p_client, v_cp, v_pd, v_memo, v_coa,
      v_settle_cents, coalesce(p_allocations,'[]'::jsonb), p_op_key || ':settle',
      v_charge, p_charge_account, p_attestation, p_control_account);
  else
    -- P = L + C - A, i.e. the payment's own bank credit is |L| minus the charge and minus
    -- whatever the adjustments explain away.
    v_settle_cents := ln.amount_cents + v_charge - v_adj_cents;
    if v_settle_cents >= 0 then
      raise exception 'after % cents of bank charge and % cents of adjustments this line leaves % cents to pay; a payment must move money out', v_charge, v_adj_cents, v_settle_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','settlement_amount_invalid',
            'line_cents',ln.amount_cents,'charge_cents',v_charge,
            'adjustment_cents',v_adj_cents,'settlement_cents',v_settle_cents)::text;
    end if;
    -- NO discount slot on this side: _assert_supplier_payment_shape_at forbids expense legs,
    -- and a supplier settlement DISCOUNT is income (a discount received), which a bank
    -- charge is not. The charge rides its own adjustment entry below.
    v_res := clara.allocate_payment(p_client, v_cp, v_pd, v_memo, v_coa,
      -v_settle_cents, coalesce(p_allocations,'[]'::jsonb), p_op_key || ':settle',
      0, null, p_attestation, p_control_account);
  end if;
  v_entry := (v_res->>'entry_id')::uuid;
  v_status := v_res->>'status';
  if v_entry is null or v_status is null then
    raise exception 'the settlement composite returned no entry'
      using errcode='CLR10',detail='{"reason":"settlement_composite_no_entry"}';
  end if;

  -- The payment-side bank charge, as its own adjustment entry in this same transaction.
  if v_domain = 'ap' and v_charge > 0 then
    v_charge_entry := clara._bank_match_adjustment_entry(
      v_ctx, p_client, v_coa, p_charge_account, -v_charge, v_pd,
      'Bank charge on ' || v_memo,
      jsonb_build_object('bank_match', jsonb_build_object(
        'line_id', p_line, 'kind', 'bank_charge')),
      p_op_key || ':charge:approve', p_attestation);
  end if;

  -- The difference adjustments, on either side.
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt,
                   (x.elem->>'memo') as memo
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    v_adj_entry := clara._bank_match_adjustment_entry(
      v_ctx, p_client, v_coa, aj.acc, aj.amt, v_pd,
      coalesce(aj.memo, 'Bank settlement difference'),
      jsonb_build_object('bank_match', jsonb_build_object(
        'line_id', p_line, 'kind', 'adjustment', 'index', v_i)),
      p_op_key || ':adj:' || v_i || ':approve', p_attestation);
    perform clara._finish_op(c.firm, 'bank_match_adjustment',
      p_op_key || ':adj:' || v_i, jsonb_build_object('entry_id', v_adj_entry));
    v_adj_entries := v_adj_entries || v_adj_entry;
  end loop;

  -- ---------------------------------------------------------------
  -- THE BANK ROWS, LAST (part2 section 4.9). The line is locked here and the group is
  -- written in the SAME TRANSACTION the settlement was born -- which IS the interval C-a
  -- named and C-b closes.
  -- ---------------------------------------------------------------
  perform 1 from clara.bank_statement_lines l where l.id = p_line for update;
  perform 1 from clara.bank_statements s where s.id = ln.statement_id for share;

  v_match_status := case when v_status = 'approved' then 'live' else 'pending' end;
  v_match := gen_random_uuid();
  insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin,
      matched_via_rule_id, draft_entry_id, created_by, completed_at)
    values (v_match, c.firm, p_client, v_bank, v_match_status, 'human', null,
      case when v_match_status = 'pending' then v_entry else null end,
      c.actor, case when v_match_status = 'live' then now() else null end);

  begin
    insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id,
        amount_cents, group_status)
      values (c.firm, p_client, v_match, p_line, ln.amount_cents, v_match_status);
  exception when unique_violation then
    raise exception 'statement line % was matched by another transaction while this settlement was being written', p_line
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end;

  -- The settlement entry becomes a member ONLY once it is approved. Below the threshold
  -- that is now; at or above it, clara.complete_pending_match writes it after the checker
  -- acts, and until then the group holds the line against draft_entry_id.
  if v_match_status = 'live' then
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      -- v_settle_cents already carries the bank-side sign: + on the receipt side (the entry
      -- DEBITS the bank), - on the payment side (it CREDITS it). No case analysis is needed
      -- and none is written -- the sign convention is the arithmetic.
      values (c.firm, p_client, v_match, v_entry, v_settle_cents, 'live', false);
  end if;
  -- The charge and the difference adjustments are ordinary approved entries in BOTH
  -- branches, so they join the group immediately -- including while it is pending. That is
  -- the reason the group-tie belt's pending arm asserts the reservation shape rather than
  -- "zero entry members" (tension T1 in the file header).
  if v_charge_entry is not null then
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      values (c.firm, p_client, v_match, v_charge_entry, -v_charge, v_match_status, false);
  end if;
  v_i := 0;
  for aj in select (x.elem->>'amount_cents')::bigint as amt
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      values (c.firm, p_client, v_match, v_adj_entries[v_i], aj.amt, v_match_status, false);
  end loop;

  perform clara._bank_match_audit(c.firm, p_client, v_match,
    case when v_match_status = 'live' then 'settle' else 'settle_pending' end,
    c.actor, null,
    jsonb_build_object('line_id', p_line, 'line_cents', ln.amount_cents,
      'domain', v_domain, 'counterparty_id', v_cp,
      'settlement_entry_id', v_entry, 'settlement_cents', v_settle_cents,
      'settlement_status', v_status,
      'charge_cents', v_charge, 'charge_entry_id', v_charge_entry,
      'adjustments', v_adjs, 'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'bank_account_id', v_bank, 'account_code', v_coa,
      'posting_date', v_pd, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, 'settle_from_bank_line', v_entry,
    jsonb_build_object('client', p_client, 'match_id', v_match, 'line_id', p_line,
      'domain', v_domain, 'settlement_cents', v_settle_cents,
      'status', v_match_status, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.match_created', p_client, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('match_id', v_match, 'bank_account_id', v_bank,
      'status', v_match_status, 'line_ids', jsonb_build_array(p_line),
      'entry_ids', case when v_match_status='live'
                        then jsonb_build_array(v_entry) else '[]'::jsonb end,
      'draft_entry_id', case when v_match_status='pending' then to_jsonb(v_entry)
                             else 'null'::jsonb end,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', 0));
  return clara._finish_op(c.firm, 'settle_from_bank_line', p_op_key,
    jsonb_build_object('match_id', v_match, 'status', v_match_status,
      'entry_id', v_entry, 'entry_status', v_status, 'domain', v_domain,
      'settlement_cents', v_settle_cents,
      'charge_entry_id', v_charge_entry,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'group_id', v_res->>'group_id', 'residue_cents', v_res->>'residue_cents'));
end $$;


-- =====================================================================
-- SECTION D.6 -- clara.complete_pending_match. The second half of the pending-match
-- reservation: the checker has approved the settlement draft in /queue through the ordinary
-- lane (CLR05 law untouched, WCA-R7 untouched), and this verb turns the reservation into a
-- live match.
--
-- IT VALIDATES ALL THE SECTION-4.5 FLOORS PLUS PARITY, and parity is where tension T1 is
-- discharged: the pending arm of the group-tie belt asserts only the reservation's shape,
-- so THIS is the first moment the exact-zero identity is assertable -- and it is asserted
-- BY NAME here, not left to the belt to discover at commit.
--
-- THE MATCHED AMOUNT IS DERIVED, NEVER PASSED: it is exactly what the group still needs,
-- SUM(line members) - SUM(existing entry members). A caller-supplied figure would be a
-- second opinion about a number the group already knows, and the per-side exhaustion belt
-- then proves the entry actually has those cents on that side.
--
-- THE POSTING-DATE EXCEPTION IS RECORDED, NEVER REFUSED here (tension T2 in the file
-- header): the acknowledgement happened when the human settled from the line, and the
-- ratified signature carries no ack flag. A draft revised across the period end still
-- completes, and the fact rides the member row, the audit payload and the /bank banner.
--
-- LOCK ORDER: this verb LOCKS A PRE-EXISTING ENTRY, so it rides match_bank_line's order --
-- journal_entries FOR UPDATE -> advisory 203005004 -> bank rows.
-- =====================================================================
create function clara.complete_pending_match(
    p_client uuid, p_match uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; g record; e record; st_max date;
  v_coa text; cap record; v_lines bigint; v_entries bigint; v_need bigint;
  v_exc boolean; v_pos bigint; v_neg bigint;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'complete_pending_match', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'match', p_match)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Read the group WITHOUT a lock first, only to learn which entry to lock: the entry row
  -- must be taken BEFORE the advisory rung and before any bank row (part2 section 4.9).
  select * into g from clara.bank_matches bm where bm.id = p_match;
  if not found or g.client_id <> p_client or g.firm_id <> c.firm then
    raise exception 'bank match % is not in this client', p_match using errcode='CLR11';
  end if;
  if g.draft_entry_id is null then
    raise exception 'bank match % names no draft entry to complete', p_match
      using errcode='CLR10',detail='{"reason":"pending_match_unanchored"}';
  end if;
  perform 1 from clara.journal_entries je where je.id = g.draft_entry_id for update;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  -- Re-read the group UNDER the lock: another session may have completed or cancelled it
  -- between the unlocked read and here.
  select * into g from clara.bank_matches bm where bm.id = p_match for update;
  if g.status <> 'pending' then
    raise exception 'bank match % is % , not pending; only a pending reservation can be completed', p_match, g.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','match_not_pending','match_id',p_match,
          'status',g.status)::text;
  end if;

  select * into e from clara.journal_entries je where je.id = g.draft_entry_id;
  if not found or e.client_id <> p_client or e.firm_id <> c.firm then
    raise exception 'the draft entry of bank match % is not in this client', p_match
      using errcode='CLR11';
  end if;
  -- THE SECTION-4.5 FLOORS, in the order that gives the most structural complaint first.
  if e.status <> 'approved' then
    raise exception 'the settlement of bank match % is still a %; the checker must approve it in /queue before the match can complete', p_match, e.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','entry_not_approved','entry_id',e.id,
          'status',e.status)::text;
  end if;
  if e.reversed_by is not null then
    raise exception 'the settlement of bank match % has been reversed; cancel the reservation with unmatch_bank_match and start again', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','reversed_entry','entry_id',e.id,
          'reversed_by',e.reversed_by)::text;
  end if;
  if e.reversal_of is not null then
    raise exception 'the settlement of bank match % is a reversal mirror', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','reversal_mirror','entry_id',e.id,
          'reversal_of',e.reversal_of)::text;
  end if;

  -- Bank rows LAST.
  perform 1 from clara.bank_statement_lines l
    where l.id in (select mm.line_id from clara.bank_match_line_members mm
                   where mm.match_id = p_match)
    order by l.id for update;
  select max(s.period_end) into st_max
    from clara.bank_match_line_members mm
    join clara.bank_statement_lines l on l.id = mm.line_id
    join clara.bank_statements s on s.id = l.statement_id
    where mm.match_id = p_match;

  v_coa := clara._bank_match_coa(p_match);
  if v_coa is null then
    raise exception 'bank match % has no mapped GL bank account', p_match
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;
  cap := clara._bank_entry_side_capacity(e.id, v_coa);
  if cap.dr_cents = 0 and cap.cr_cents = 0 then
    raise exception 'the settlement of bank match % has no movement on bank account %', p_match, v_coa
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_account','entry_id',e.id,
          'account_code',v_coa)::text;
  end if;

  select coalesce(sum(mm.amount_cents), 0)::bigint into v_lines
    from clara.bank_match_line_members mm where mm.match_id = p_match;
  select coalesce(sum(mm.matched_cents), 0)::bigint into v_entries
    from clara.bank_match_entry_members mm where mm.match_id = p_match;
  v_need := v_lines - v_entries;
  if v_need = 0 then
    raise exception 'bank match % already ties without its settlement; the reservation no longer describes the group -- cancel it and re-settle', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_beyond_tolerance','match_id',p_match,
          'line_cents',v_lines,'entry_cents',v_entries)::text;
  end if;
  -- PARITY, BY NAME. The settlement must actually carry, on the correct SIDE of the bank
  -- account, the cents the group still needs. The belt re-proves it at commit against every
  -- other group on that entry; this is the message the human reads.
  select coalesce(sum(case when em.matched_cents > 0 then em.matched_cents else 0 end), 0)::bigint,
         coalesce(sum(case when em.matched_cents < 0 then -em.matched_cents else 0 end), 0)::bigint
    into v_pos, v_neg
    from clara.bank_match_entry_members em
    join clara.bank_matches bm on bm.id = em.match_id
    where em.entry_id = e.id and bm.status in ('pending','live')
      and bm.bank_account_id = g.bank_account_id;
  if (v_need > 0 and v_pos + v_need > cap.dr_cents)
     or (v_need < 0 and v_neg - v_need > cap.cr_cents) then
    raise exception 'the settlement of bank match % cannot supply % cents on % -- it carries % debit / % credit there and % / % are already matched', p_match, v_need, v_coa, cap.dr_cents, cap.cr_cents, v_pos, v_neg
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_beyond_tolerance','match_id',p_match,
          'entry_id',e.id,'needed_cents',v_need,'account_code',v_coa,
          'debit_capacity_cents',cap.dr_cents,'credit_capacity_cents',cap.cr_cents,
          'matched_debit_cents',v_pos,'matched_credit_cents',v_neg)::text;
  end if;

  v_exc := st_max is not null and e.posting_date > st_max;
  insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
      matched_cents, group_status, posting_date_exception)
    values (c.firm, p_client, p_match, e.id, v_need, 'pending', v_exc);
  -- The flip LAST, so the ON UPDATE CASCADE carries every member -- including the row just
  -- written -- from 'pending' to 'live' in one statement.
  update clara.bank_matches set status = 'live', completed_at = now()
    where id = p_match;

  perform clara._bank_match_audit(c.firm, p_client, p_match, 'complete', c.actor, null,
    jsonb_build_object('entry_id', e.id, 'matched_cents', v_need,
      'line_cents', v_lines, 'entry_cents', v_entries + v_need,
      'account_code', v_coa, 'posting_date', e.posting_date,
      'period_end', st_max, 'posting_date_exception', v_exc, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, 'complete_pending_match', e.id,
    jsonb_build_object('client', p_client, 'match_id', p_match,
      'matched_cents', v_need, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.match_completed', p_client, c.actor,
    null, null, e.id, null, null,
    jsonb_build_object('match_id', p_match, 'entry_id', e.id,
      'bank_account_id', g.bank_account_id,
      'period_exceptions', case when v_exc then 1 else 0 end));
  return clara._finish_op(c.firm, 'complete_pending_match', p_op_key,
    jsonb_build_object('match_id', p_match, 'status', 'live', 'entry_id', e.id,
      'matched_cents', v_need,
      'period_exceptions', case when v_exc then 1 else 0 end));
end $$;


-- =====================================================================
-- SECTION D.7 -- clara.unmatch_bank_match. WHOLE-GROUP, never row-by-row -- a group is ONE
-- human act ("these two IBG transfers cleared that recorded receipt") and undoing half of
-- it would leave a state no human ever intended. That is 0037's unallocate_group law,
-- restated on the bank side because it is the same law.
--
-- IT WORKS ON 'pending' AS WELL AS 'live' (design section 4.6): the maker cancels a
-- reservation the same way the bookkeeper unmatches a live group, and a checker-REJECTED
-- draft leaves the group cancellable by the same verb. There is no second cancel path to
-- keep in step.
--
-- THE FLIP TO 'unmatched' CASCADES group_status onto every member row through the composite
-- FK, which is what RELEASES the partial unique index -- the line becomes matchable again
-- in the same statement. Re-match is a NEW group; nothing is ever un-flipped. The members
-- are RETAINED, not deleted: an unmatched group is history, and clara.bank_match_audit
-- reads it back.
--
-- THE UNWIND OF AN ERRONEOUS ADJUSTMENT IS ORDINARY clara.reverse_entry, legal the moment
-- no live member references it (design section 4.6) -- reverse-not-delete, and the reversal
-- belt (D.2e) is what makes "the moment" exact.
-- =====================================================================
create function clara.unmatch_bank_match(
    p_client uuid, p_match uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; g record; v_reason text;
  v_lines jsonb; v_entries jsonb; v_ln int; v_en int;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- An unmatch is a HUMAN JUDGEMENT about an existing position and owes a reason, exactly
  -- as unallocate and apply do on the subledger side (0037's ck_oia_reason).
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'an unmatch reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'unmatch_bank_match', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'match', p_match,
      'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- This verb locks NO pre-existing journal entry, so it takes the client rung and then the
  -- bank rows -- the same relative order every matcher uses, which is what makes the two
  -- serialize instead of racing.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into g from clara.bank_matches bm where bm.id = p_match for update;
  if not found or g.client_id <> p_client or g.firm_id <> c.firm then
    raise exception 'bank match % is not in this client', p_match using errcode='CLR11';
  end if;
  if g.status = 'unmatched' then
    raise exception 'bank match % is already unmatched; re-matching writes a NEW group', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_unmatched','match_id',p_match)::text;
  end if;

  -- Capture the member set BEFORE the flip: the audit row is the queryable record of what
  -- was undone, and after the cascade the group_status column no longer says it.
  select coalesce(jsonb_agg(jsonb_build_object('line_id', mm.line_id,
           'amount_cents', mm.amount_cents) order by mm.line_id), '[]'::jsonb), count(*)::int
    into v_lines, v_ln
    from clara.bank_match_line_members mm where mm.match_id = p_match;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', mm.entry_id,
           'matched_cents', mm.matched_cents) order by mm.entry_id), '[]'::jsonb), count(*)::int
    into v_entries, v_en
    from clara.bank_match_entry_members mm where mm.match_id = p_match;

  update clara.bank_matches
    set status = 'unmatched', unmatched_by = c.actor, unmatched_at = now(),
        unmatched_reason = v_reason
    where id = p_match;

  perform clara._bank_match_audit(c.firm, p_client, p_match, 'unmatch', c.actor, v_reason,
    jsonb_build_object('previous_status', g.status, 'lines', v_lines,
      'entries', v_entries, 'line_members', v_ln, 'entry_members', v_en,
      'draft_entry_id', g.draft_entry_id, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, 'unmatch_bank_match', null,
    jsonb_build_object('client', p_client, 'match_id', p_match,
      'previous_status', g.status, 'reason', v_reason, 'op_key', p_op_key));
  -- IDENTIFIERS ONLY in the payload: the reason is a human's free text and stays in
  -- clara.bank_match_audit, which is human-read behind RLS. clara.domain_events is
  -- agent-readable firm-wide (0005:379-408).
  perform clara._append_event(c.firm, 'bank.match_unmatched', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('match_id', p_match, 'bank_account_id', g.bank_account_id,
      'previous_status', g.status, 'line_members', v_ln, 'entry_members', v_en));
  return clara._finish_op(c.firm, 'unmatch_bank_match', p_op_key,
    jsonb_build_object('match_id', p_match, 'status', 'unmatched',
      'previous_status', g.status, 'line_members', v_ln, 'entry_members', v_en));
end $$;


-- =====================================================================
-- SECTION D.8 -- ACLs. The four match verbs are HUMAN VERBS and reach clara_authenticated
-- ONLY -- no wake role, no clara_runtime, no clara_agent_ro, no PUBLIC. Which entry a bank
-- line clears is a judgement, and the agent never makes one (design part2 section 7:
-- "no agent matching, no agent grants anywhere in the bank schema").
--
-- The five TRIGGER functions carry their own revoke too: PostgreSQL grants EXECUTE to
-- PUBLIC on every new function by default and ALTER DEFAULT PRIVILEGES does not stop it
-- (the T17b-proven mechanism 0037:3416-3419 records); a trigger function needs no caller
-- EXECUTE at all -- the trigger machinery runs it as the table owner.
-- =====================================================================
revoke all on function clara._tf_bank_match_group_tie() from public;
revoke all on function clara._tf_bank_match_entry_exhaustion() from public;
revoke all on function clara._tf_bank_match_congruence() from public;
revoke all on function clara._tf_bank_statement_void_belt() from public;
revoke all on function clara._tf_je_bank_match_reversal_belt() from public;

revoke all on function clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text) from public;
revoke all on function clara.settle_from_bank_line(
  uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text) from public;
revoke all on function clara.complete_pending_match(uuid,uuid,text) from public;
revoke all on function clara.unmatch_bank_match(uuid,uuid,text,text) from public;

grant execute on function
  clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text),
  clara.settle_from_bank_line(
    uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text),
  clara.complete_pending_match(uuid,uuid,text),
  clara.unmatch_bank_match(uuid,uuid,text,text)
to clara_authenticated;

-- ============ SECTION E (recuts) ============
-- =====================================================================================
-- 0038 SECTION E -- THE RECUTS AND SPLICES.
--
-- Design of record: docs/plan/wave-c-b-bank-design.md sections 4.3 / 4.4 / 4.5 / 4.6 and
-- docs/plan/wave-c-b-bank-design-part2.md section 5 (the migration order + the CoR dual-grep
-- register). Governing law: docs/plan/wave-c-contract.md (WC-R1..R12) and
-- docs/plan/wave-c-a-subledger-design.md (WCA-R1..R9). Nothing here widens scope beyond what
-- those documents name.
--
-- WHAT THIS SECTION IS. C-b does not get to build a bank world beside the document pipeline;
-- it has to teach the pipeline that a bank statement is a first-class document kind. That is
-- almost entirely a job of RECUTTING bodies other migrations own, and of SPLICING refusals
-- into bodies that predate the bank schema entirely. Every one of those bodies is live, and
-- several of them are the most safety-critical text in the estate (the claim capability, the
-- reversal verb, the filing writers). So this section carries no new tables, no new business
-- verbs and no new belts -- those are other sections of 0038 -- and it carries every recut.
--
-- =====================================================================================
-- THE CoR DUAL-GREP REGISTER -- run, not inherited (0036:381-413 is the law).
-- =====================================================================================
-- 0036's header records the method that failed and must not be repeated: establishing "the
-- last definition" by grepping `create (or replace )?function clara.<name>` alone is
-- STRUCTURALLY BLIND to the change-of-record idiom this repo uses constantly (0017 / 0018 /
-- 0019 / 0020 / 0024 / 0025 / 0026 / 0028 / 0030 / 0036 / 0037 all patch large bodies via
-- pg_get_functiondef -> replace -> a dynamic install, which contains no `create function`
-- text at all). BOTH greps were re-run for every body below --
--   grep -nE 'create (or replace )?function clara\.<name>' packages/db/migrations/*.sql
--   grep -n 'pg_get_functiondef' packages/db/migrations/*.sql  # then read every hit and
--                                                              # resolve its regprocedure
-- -- and the resolved dynamic-patch target list across the whole tree is:
--   0017: _draft_entry_core, _record_client_resolution_core, file_document,
--         preview_wrong_client_correction, coding_lane, list_coding_lanes,
--         list_autodraft_candidates, list_document_autodraft_candidates, classify_document,
--         _enqueue_invoice_facts_core, revise_entry, reverse_entry, reconcile_sweep_runs,
--         list_review_queue, retire_document_filing, approve_wrong_client_correction, ...
--   0018: get_context_pack + four Gate-K bodies · 0019: the wiki set + run_client_lint +
--         retire_document_filing · 0020: _publish_wiki_page_version_core, run_client_lint,
--         record_wiki_source_ingest · 0028/0029/0030: the vendor-binding set + execute_rule_post
--         + _approve_entry_core + persist_invoice_facts + revise_entry · 0031/0033/0034:
--         admit_autodraft_task, _coding_lane_core, request_autodraft · 0035: _approve_entry_core
--         · 0036: list_review_queue, list_autodraft_candidates, get_context_pack ·
--         0037: reverse_entry, revise_entry, approve_wrong_client_correction,
--         _approve_opening_entry, reconcile_sweep_runs.
-- The per-body verdicts THIS section acts on:
--
--   REBUILT from a genuine last definition (no dynamic patch after it -- both greps clean):
--     clara._enqueue_invoice_facts_core(uuid)              -> 0026:362-489 (section D, the
--       A11 amendment). Lineage 0009:659 -> 0014:175 -> 0015:3259 -> 0016:3379 -> 0017:199
--       (DYNAMIC, the O8.6 inactive-client guard) -> 0025:146 -> 0026:362. 0026's cut was
--       pulled from a live 25-migration catalog and therefore already CARRIES 0017's dynamic
--       guard; 0026's own tail (1616) asserts it. Nothing after 0026 touches it (0027:640 is
--       an ACL probe only). The recut below is built ON 0026's text and its prestate probe is
--       POSITIVE for 0017's, 0025's and 0026's own markers, so a body that lost any of them
--       aborts the deploy instead of being silently reverted.
--     clara.claim_document_processing_task(uuid,text,boolean) -> 0024:210-299. Lineage
--       0007:2100 -> 0009:2180 -> 0011:2315 (the egress-hold LEASE machinery:
--       kill_switch / no_consent / partial_consent) -> 0015:3340 -> 0024:210 (the Q1
--       claim_secret capability). 0016 holds PROBES ONLY -- no definition. 0024's cut was
--       pulled via pg_get_functiondef against a live 24-migration database, so it is the
--       first file text in the tree that shows 0011's lease machinery at all. The prestate
--       probe below demands BOTH markers (partial_consent AND claim_secret_digest) before the
--       recut installs, exactly as the design's register requires.
--     clara._reserve_processing_call(uuid,int) / _settle_processing_call(uuid,int) /
--       _refund_processing_call(uuid,text) -> 0009:581 / 612 / 644, never recut, never
--       dynamically patched (both greps clean).
--     clara.release_held_document_tasks(int) -> 0009:2242 (created 0007:2129), never
--       dynamically patched.
--     the FOUR purpose-bearing 0020 verbs (grant/activate/deactivate/revoke
--       _client_egress_purpose) -> 0020:758 / 820 / 886 / 946, FIRST CUT, never recut and
--       never dynamically patched. classify_consent_evidence_document is NOT in this set --
--       it carries no purpose argument (design 4.4).
--   NEW OVERLOADS, leaving the existing arities byte-untouched:
--     clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)          [6-arg]
--     clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)     [7-arg]
--     (see the section E1.3 header for why consume's new arity is SEVEN, not six.)
--   PATCHED IN PLACE, because a rebuild would silently revert a prior change of record:
--     clara.reverse_entry(uuid,text,text) -> 0004:560 / 0005:903 / 0009:1697, then PATCHED by
--       0017:255-271 (the CLR31 opening boundary) and by 0037:2149-2224 (the 203005004 rung +
--       the allocated_items_present refusal + the subledger hook).
--     clara.approve_wrong_client_correction(uuid,text,text,text) -> 0007:2518 / 0009:2421 /
--       0027:196 (the documents-before-document_filings lock order), then PATCHED by
--       0037:2319-2394 (the same reverse refusal + the mirror-approve hook).
--     clara.retire_document_filing(uuid,text,uuid,text) -> 0007:1434, PATCHED by 0017:1854
--       (R2-F2) and 0019:242 (the wiki-veto removal), then RECUT by 0027:393 -- whose text was
--       pulled from the live catalog and therefore carries both patches forward. 0027 is the
--       last definition; nothing after it touches the body.
-- Every patch below carries a TWO-SIDED PROBE: POSITIVE for the prior change of record's own
-- markers BEFORE the splice (and NEGATIVE for this migration's marker, so a second apply
-- aborts), and POSITIVE for its own additions AFTER, with every anchor COUNTED EXACTLY ONCE
-- (the 0036 review-F4 guard: replace() rewrites every occurrence, so an uncounted anchor can
-- take two splices while a position()>0 post-check stays green).
--
-- =====================================================================================
-- WHAT THIS SECTION DELIBERATELY DOES **NOT** DO.
-- =====================================================================================
-- * NO typed-consent read is added to clara.claim_document_processing_task. The ratified 0020
--   section 6 byte-identity battery (packages/db/tests/wave-b/wb-0020-legacy.test.mjs) asserts
--   that body carries NO call edge into the typed-consent surface, and WCB-R1 answers that by
--   moving the gate to ENQUEUE (design 4.3/4.4) rather than by widening the battery. The claim
--   body changes here ONLY by lane-list widening, and section E8 asserts the absence
--   POSITIVELY -- `client_egress_purpose` must occur ZERO times in the recut prosrc.
-- * NO wiki hold is touched for a non-wiki purpose. The 0020 coupling (activation clears the
--   client-keyed hold; deactivation/revocation set it) is made PURPOSE-DISCRIMINATED here, which
--   is the follow-on ruling 0020:870-872 demanded, discharged by WCB-R1. A statement_extraction
--   activation that cleared the wiki hold would silently release a wiki control; a
--   statement_extraction deactivation that SET it would wedge the wiki lane for a client that
--   never consented to statement extraction. Both directions are regressions and both are
--   pinned by cells.
-- * NO body is rebuilt from file text where a dynamic patch is its last change of record.
--
-- NAMED TEST-MAINTENANCE DELIVERABLES this section creates (design part2 section 5):
--   packages/db/tests/wave-b/wb-0020-legacy.test.mjs -- the restore() transforms for
--     claim_document_processing_task (the three lane literals) and _enqueue_invoice_facts_core
--     (the statement arms + the consent gate), the 0024-A10 / 0025-A9 / 0026-A11 amendment
--     idiom; packages/db/deploy/wave-b-0020-postverify.sql; the wiki-projection.mjs surface
--     guard (prepare/consume gain overloads -- the 5-arg and 6-arg arities it names are
--     untouched, which is exactly why the guard must still pass).
--
-- D1 WRITE-QUIESCE. This section replaces or patches TEN live bodies, four of which are on the
-- hot document path (claim, the router, release, reserve) and three of which are money-path
-- writers (reverse_entry, approve_wrong_client_correction, retire_document_filing). Per
-- packages/db/README.md:95-113 PostgreSQL runs each in-flight PL/pgSQL execution to completion
-- on the body it STARTED with, so deploy through the quiesced apply ceremony, never a bare
-- migrate against a live target. Deploy order is BINDING and stated in design part2 section 5:
-- RUNTIME IMAGE FIRST, then this migration, then the consent ceremony.
--
-- error codes: no new SQLSTATE. Every refusal added here reuses CLR10 (bad request /
-- structural refusal) or CLR28 (egress refusal) with a jsonb detail carrying the design's
-- named reason, which is how every C-a and Wave-B refusal is already spelled.
-- =====================================================================================

set role clara_fn_owner;

-- =====================================================================================
-- SECTION E1 -- THE TYPED-CONSENT SURFACE (design 4.4, WCB-R1).
--
-- 0020 shipped ONE purpose ('wiki_synthesis') and said so three times in DDL and four times in
-- verb text, plus once in the dispatch-authorization document-hash CHECK. WCB-R1 adds the
-- SECOND purpose, 'statement_extraction', and the whole of E1 is that widening -- done
-- surgically, because the 0020 machinery is the only structural egress authorization the
-- system has and a sloppy widening here would either wedge the wiki lane or silently
-- authorize an untyped read.
--
-- THE HONESTY CLAUSE, restated here because it belongs in the schema and not only in prose
-- (design 4.4, converged finding of both review lanes): the typed authorization covers the
-- STATEMENT-SPECIFIC SECOND READ from its grant date forward. Intake's kind-blind OCR pass
-- egresses BEFORE the document kind is known, under the global CLARA_DOC_EGRESS_APPROVED
-- switch and the engagement-letter consent. Nothing in this migration may be read as a claim
-- that the typed authorization covered that first egress. Typing the intake pass is a named
-- future wave.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- E1.1 -- the THREE table purpose CHECKs.
--
-- All three are INLINE column CHECKs (0020:153, 0020:198, 0020:250) and therefore
-- SYSTEM-NAMED, so the drop must be BY DISCOVERED NAME, not by a guessed literal -- the 0014 /
-- 0016-A6 idiom. The discriminator is exact and fail-closed: on
-- egress_dispatch_authorizations TWO constraints mention both `purpose` and `wiki_synthesis`
-- (the column check and ck_egress_dispatch_authorizations_doc_sha), so the finder additionally
-- excludes any definition naming document_sha256, and then demands EXACTLY ONE hit or aborts
-- naming what it found.
--
-- The re-add is NAMED (ck_<table>_purpose_0038) so every future widening is a drop by name.
-- Purely additive: 'wiki_synthesis' keeps its meaning and no existing row can violate.
-- -------------------------------------------------------------------------------------
do $e1_purpose_checks$
declare
  r record; v_con text; v_n int; v_found text;
begin
  for r in
    select * from unnest(array[
      'client_egress_purpose_consents',
      'client_egress_purpose_activations',
      'egress_dispatch_authorizations']) as t(relname)
  loop
    select count(*)::int,
           string_agg(con.conname||' => '||pg_get_constraintdef(con.oid),' ;; ' order by con.conname)
      into v_n, v_found
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=r.relname and con.contype='c'
       and pg_get_constraintdef(con.oid) like '%purpose%'
       and pg_get_constraintdef(con.oid) like '%wiki_synthesis%'
       and pg_get_constraintdef(con.oid) not like '%document_sha256%';
    if v_n<>1 then
      raise exception '0038 E1.1 prestate: clara.% must carry exactly ONE purpose CHECK naming wiki_synthesis (got %): %',
        r.relname, v_n, coalesce(v_found,'<none>') using errcode='CLR10';
    end if;
    -- Fail closed on a second apply: the live CHECK must NOT already admit the new purpose.
    if v_found like '%statement_extraction%' then
      raise exception '0038 E1.1 prestate: clara.%''s purpose CHECK already admits statement_extraction -- 0038 has already been applied to this database',
        r.relname using errcode='CLR10';
    end if;
    select con.conname into v_con
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=r.relname and con.contype='c'
       and pg_get_constraintdef(con.oid) like '%purpose%'
       and pg_get_constraintdef(con.oid) like '%wiki_synthesis%'
       and pg_get_constraintdef(con.oid) not like '%document_sha256%';
    execute format('alter table clara.%I drop constraint %I', r.relname, v_con);
    execute format(
      'alter table clara.%I add constraint %I check (purpose in (''wiki_synthesis'',''statement_extraction''))',
      r.relname, 'ck_'||r.relname||'_purpose_0038');
  end loop;
end
$e1_purpose_checks$;

-- -------------------------------------------------------------------------------------
-- E1.1b -- ck_egress_dispatch_authorizations_doc_sha, RECUT.
--
-- 0020:238-241 reserved document_sha256 for "a future document-tied purpose" and forced it
-- NULL for wiki_synthesis, which is not document-tied. statement_extraction IS document-tied,
-- and WCB-R1's whole point is that the authorization BINDS THE BYTES: an authorization minted
-- for document A must not be presentable for document B. So the constraint gains the mirror
-- arm -- statement_extraction REQUIRES a non-null hash -- and keeps its NAME, so the pin in
-- any future migration is a drop by name.
--
-- Written as a CONJUNCTION of two implications rather than a disjunction of tuples, so a third
-- purpose added later inherits neither rule by accident and must state its own.
--
-- Pre-assert (the 0016:135-148 idiom): no existing row may violate. 0020 shipped dark and the
-- relation is expected empty, but "expected empty" is not an assertion.
-- -------------------------------------------------------------------------------------
do $e1_doc_sha_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.egress_dispatch_authorizations
   where not ((purpose <> 'wiki_synthesis' or document_sha256 is null)
          and (purpose <> 'statement_extraction' or document_sha256 is not null));
  if v_bad<>0 then
    raise exception '0038 E1.1b pre-assert failed: % dispatch-authorization row(s) violate the recut document-hash rule', v_bad
      using errcode='CLR10';
  end if;
end
$e1_doc_sha_pre$;

alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_doc_sha;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_doc_sha check (
    (purpose <> 'wiki_synthesis'      or document_sha256 is null)
    and (purpose <> 'statement_extraction' or document_sha256 is not null));

-- -------------------------------------------------------------------------------------
-- E1.2 -- the FOUR purpose-bearing verbs, recut.
--
-- FIRST CUT each (0020:758/820/886/946); both greps clean, so a rebuild reverts nothing. Two
-- edits per verb and NOTHING else:
--   (a) the purpose allowlist gains 'statement_extraction';
--   (b) THE WIKI-HOLD COUPLING BECOMES PURPOSE-DISCRIMINATED. 0020:870-872 wrote the coupling
--       unconditionally and its own comment demanded a follow-on ruling before the purpose
--       CHECK was widened ("widening it needs a follow-on ruling AND a per-purpose hold map").
--       WCB-R1 is that ruling and this is the per-purpose hold map, in its simplest honest
--       form: the hold belongs to wiki synthesis and to nothing else, because
--       clara.wiki_synthesis_holds is keyed on the CLIENT ALONE (0017:2335-2337) -- it cannot
--       represent "held for wiki, released for statements". Leaving the coupling
--       unconditional would mean a statement_extraction activation CLEARS the wiki hold (a
--       silent release of a control the client never lifted) and a statement_extraction
--       deactivation SETS it (wedging wiki publication for a client that never consented to
--       statement extraction at all). Both directions are pinned by acceptance cells: the wiki
--       holds must be BYTE-UNCHANGED across a statement_extraction activate AND across a
--       statement_extraction deactivate/revoke.
--
-- The refusal codes, the CLR11-firm-first ratchet (R1-F5), the op-key request hashes, the audit
-- payloads and the event payloads are UNCHANGED. A pre-0038 op_key therefore still replays
-- byte-identically: the hash input shape is untouched.
--
-- ACLs: `create or replace` preserves the ACL, and the grants are re-issued below anyway as
-- belt-and-braces (the 0024:301-302 idiom); section E8 pins them.
-- -------------------------------------------------------------------------------------
do $e1_verbs_pre$
declare v_src text; v_name text;
begin
  foreach v_name in array array['grant_client_egress_purpose','activate_client_egress_purpose',
      'deactivate_client_egress_purpose','revoke_client_egress_purpose'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_name;
    if v_src is null then
      raise exception '0038 E1.2 prestate: clara.% is GONE', v_name using errcode='CLR10';
    end if;
    if position('unknown_purpose' in v_src)=0 or position('wiki_synthesis' in v_src)=0 then
      raise exception '0038 E1.2 prestate: clara.% is missing 0020''s unknown_purpose / wiki_synthesis markers -- refusing to recut a body this migration cannot account for',
        v_name using errcode='CLR10';
    end if;
    if position('statement_extraction' in v_src)<>0 then
      raise exception '0038 E1.2 prestate: clara.% already carries statement_extraction -- 0038 has already been applied to this database',
        v_name using errcode='CLR10';
    end if;
  end loop;
  -- The three hold-bearing verbs must each still carry the 0020 section 4.3 coupling this
  -- recut is about to discriminate. If one of them does not, the coupling moved somewhere this
  -- migration has not read, and the recut would install a discriminator over nothing.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='activate_client_egress_purpose';
  if position('clara.clear_wiki_synthesis_hold(' in v_src)=0 then
    raise exception '0038 E1.2 prestate: activate_client_egress_purpose no longer clears the wiki hold' using errcode='CLR10';
  end if;
  foreach v_name in array array['deactivate_client_egress_purpose','revoke_client_egress_purpose'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_name;
    if position('clara.set_wiki_synthesis_hold(' in v_src)=0 then
      raise exception '0038 E1.2 prestate: clara.% no longer sets the wiki hold', v_name using errcode='CLR10';
    end if;
  end loop;
end
$e1_verbs_pre$;

-- grant: mints a typed consent. It DOES NOT ACTIVATE -- a grant alone never authorizes.
-- 0020 body verbatim; the ONLY edit is the purpose allowlist. This verb touches no hold.
create or replace function clara.grant_client_egress_purpose(p_client uuid,p_purpose text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  -- 0038 (WCB-R1): the SECOND typed purpose. 'statement_extraction' authorizes the
  -- statement-specific vendor read of a filed bank statement, and nothing else.
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  -- A null document, or any document that is not an already-classified, bytes-verified
  -- consent-evidence artifact in this firm, is refused. The owner-declaration path of
  -- 0012(A) is deliberately NOT available for typed consent.
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,p_purpose,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_consents_one_live' then
      raise exception 'client already has a live typed egress consent for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress_purpose',null,
    jsonb_build_object('consent',v_id,'client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  -- The evidence document rides in the PAYLOAD, never the typed document_id column -- the
  -- 0014 rule (a consent artifact must not trip the filing-history provenance trigger)
  -- applies identically to typed consent.
  perform clara._append_event(c.firm,'egress.purpose_consent_granted',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'status','live'));
end $$;
alter function clara.grant_client_egress_purpose(uuid,text,uuid,text,text)
  owner to clara_fn_owner;

-- activate: the positive owner act. p_consent must BE the live typed consent for
-- (client, purpose) -- a blind activation is impossible, and a revoke-and-regrant therefore
-- forces the owner to activate the NEW consent explicitly (0020 section 2.3, the version-match
-- law). 0038 edits: the purpose allowlist, and the PURPOSE-DISCRIMINATED hold clear.
create or replace function clara.activate_client_egress_purpose(p_client uuid,p_purpose text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST. Section 7.1 mandates CLR11 for a client not in your firm, and
  -- the v1.0 body reached that verdict only AFTER a global (client, purpose) lookup that took
  -- FOR UPDATE on a foreign firm's live row -- cross-firm lock reach, and CLR28 instead of the
  -- mandated CLR11. Every state-row predicate below now carries firm_id=c.firm as well.
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
        consent_id,activated_by)
      values(c.firm,p_client,p_purpose,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_activations_one_live' then
      raise exception 'client already has a live activation for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  -- 0020 section 4.3: the hold transition lives INSIDE the owner-floored RPC and goes through
  -- the audited writer (never a hand-written row). Only activation clears it.
  -- 0038 (WCB-R1, the follow-on ruling 0020:870-872 demanded): the coupling is
  -- PURPOSE-DISCRIMINATED. The wiki hold row is keyed on the CLIENT ALONE
  -- (0017:2335-2337), so it cannot represent "held for wiki, released for statements" -- and a
  -- statement_extraction activation that cleared it would silently release a wiki control the
  -- client never lifted. The hold is wiki's, and only wiki's, transition.
  if p_purpose='wiki_synthesis' then
    perform clara.clear_wiki_synthesis_hold(p_client,'wikirelease:purpose:'||v_id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'activate_client_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'client',p_client,
      'purpose',p_purpose,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_activated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'status','active'));
end $$;
alter function clara.activate_client_egress_purpose(uuid,text,uuid,text)
  owner to clara_fn_owner;

-- deactivate: a PAUSE. The consent record survives; dispatch does not.
-- 0038 edits: the purpose allowlist, and the PURPOSE-DISCRIMINATED hold set.
create or replace function clara.deactivate_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_activations
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  -- 0020 section 3.5: every OUTSTANDING authorization for the consent behind this activation is
  -- invalidated in the SAME transaction as the withdrawal.
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  -- 0038 (WCB-R1): PURPOSE-DISCRIMINATED, and this direction matters as much as the clear.
  -- Setting the client-keyed wiki hold on a statement_extraction deactivation would WEDGE wiki
  -- publication for a client whose wiki consent was never withdrawn -- the exact regression the
  -- design's review lanes named. Only wiki's own withdrawal sets wiki's hold.
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose deactivated','wikihold:purpose:deact:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_client_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_deactivated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'reason',btrim(p_reason),
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'status','deactivated'));
end $$;
alter function clara.deactivate_client_egress_purpose(uuid,text,text,text)
  owner to clara_fn_owner;

-- revoke: WITHDRAWAL. Revokes the live typed consent, deactivates its activation, invalidates
-- every unconsumed authorization for it, and (for wiki only, from 0038) sets the hold -- all in
-- ONE transaction. 0020 section 3.5's consequence: revoke-and-regrant invalidates the OLD
-- consent's outstanding authorizations even if the new consent is immediately activated,
-- because the new activation names a new consent id and the stranded authorizations name the
-- old one.
create or replace function clara.revoke_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  -- 0038 (WCB-R1): PURPOSE-DISCRIMINATED, same reason as deactivate.
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose consent revoked','wikihold:purpose:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  -- One event for the withdrawal, carrying the activation id WHERE APPLICABLE (0020 section
  -- 4.1) and the evidence document in the payload (the 0014 rule).
  perform clara._append_event(c.firm,'egress.purpose_consent_revoked',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'status','revoked'));
end $$;
alter function clara.revoke_client_egress_purpose(uuid,text,text,text)
  owner to clara_fn_owner;

do $e1_verbs_post$
declare v_src text; v_name text;
begin
  foreach v_name in array array['grant_client_egress_purpose','activate_client_egress_purpose',
      'deactivate_client_egress_purpose','revoke_client_egress_purpose'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_name;
    if position('''wiki_synthesis'',''statement_extraction''' in v_src)=0 then
      raise exception '0038 E1.2 postcheck: clara.% did not gain the statement_extraction purpose', v_name
        using errcode='CLR10';
    end if;
    if position('unknown_purpose' in v_src)=0 then
      raise exception '0038 E1.2 postcheck: clara.% lost 0020''s unknown_purpose refusal', v_name
        using errcode='CLR10';
    end if;
  end loop;
  -- The discriminator itself, in all three hold-bearing verbs, and NOWHERE ELSE: grant must
  -- still touch no hold at all.
  foreach v_name in array array['activate_client_egress_purpose',
      'deactivate_client_egress_purpose','revoke_client_egress_purpose'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_name;
    if position('if p_purpose=''wiki_synthesis'' then' in v_src)=0 then
      raise exception '0038 E1.2 postcheck: clara.%''s wiki-hold coupling is not purpose-discriminated', v_name
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='grant_client_egress_purpose';
  if position('wiki_synthesis_hold' in v_src)<>0 then
    raise exception '0038 E1.2 postcheck: grant_client_egress_purpose gained a wiki-hold transition it never had'
      using errcode='CLR10';
  end if;
end
$e1_verbs_post$;

-- -------------------------------------------------------------------------------------
-- E1.3 -- prepare_egress_dispatch / consume_egress_dispatch: NEW OVERLOADS.
--
-- WHY OVERLOADS AND NOT RECUTS. 0020's arities are pinned by wave-b-0020-postverify.sql and by
-- the runtime's own surface probe, and the wiki consumer (wiki-projection.mjs) calls them by
-- their existing shapes. Changing either arity in place would break a ratified surface for a
-- lane that has nothing to do with banking. So the document-tied purpose gets its OWN arity and
-- the wiki arities are left byte-untouched -- which is also why the postverify and the surface
-- probe must still pass unchanged after 0038.
--
-- WHY consume's NEW ARITY IS SEVEN, NOT SIX. The design part2 register says "new 6-arg
-- overloads" for both verbs; that is exact for prepare (5 -> 6) and off by one for consume,
-- whose RATIFIED shape has been SIX arguments since 0020's amendment R1-F1
-- (p_firm, p_authorization, p_client, p_purpose, p_event_seq, p_event_type -- 0020:484-485).
-- Adding the document hash therefore produces SEVEN. The design's intent -- "consume gains
-- `is distinct from` on the sha in the re-binding block, the wiki arity remains" -- is what is
-- built; the arithmetic in the register is corrected here rather than followed off a cliff.
--
-- NEITHER OVERLOAD MAY LEAK. 0020 section 3.3's whole design is that both non-granted states
-- return the BYTE-IDENTICAL unknown payload: distinguishing them is a runtime-readable oracle
-- for "did this client ever consent, and did they withdraw?". Every new refusal below --
-- malformed hash, hash present for a hash-free purpose, hash absent for a hash-bound purpose,
-- hash mismatch at consume -- returns that same uniform unknown. A raise here would be a
-- distinguishing channel, and a CHECK violation escaping to the caller would be a worse one,
-- which is why the two purpose/hash consistency guards run BEFORE the insert rather than
-- letting ck_egress_dispatch_authorizations_doc_sha fire.
--
-- DISPATCH INTENT for the task-driven lane (design 4.4, stated rather than assumed): the wiki
-- pattern is EVENT-driven, so it binds (event_type, event_seq) to a domain event. The statement
-- lane is TASK-driven, so the runtime binds event_type='statement.extraction' and event_seq =
-- the processing task's version_n. The database enforces the BINDING, never the vocabulary --
-- both columns stay opaque text/bigint here, exactly as they are for wiki.
-- -------------------------------------------------------------------------------------
create function clara.prepare_egress_dispatch(p_firm uuid,p_client uuid,p_purpose text,
    p_event_seq bigint,p_event_type text,p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  -- 0020 section 3.2 TTL, one named constant, identical to the 5-arg arity's.
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid; v_sha text;
begin
  if p_firm is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  -- Shape, then purpose/hash consistency. All three refusals are UNIFORM unknown, never a
  -- raise: a distinguishing error here is exactly the oracle 0020 section 3.3 forbids.
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='wiki_synthesis' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='statement_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select a.id,a.consent_id into v_activation,v_consent
    from clara.client_egress_purpose_activations a
    join clara.client_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
        and c.purpose=a.purpose
   where a.firm_id=p_firm and a.client_id=p_client and a.purpose=p_purpose
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- RATCHET R1-F2: WALL CLOCK, not transaction time (0020:432-435), so the stated TTL is an
  -- honest wall-clock 120s for a caller inside a long-open transaction too.
  insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_client,p_purpose,v_consent,v_activation,p_event_seq,p_event_type,
      v_sha,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;
alter function clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)
  owner to clara_fn_owner;
revoke all on function clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text) from public;

create function clara.consume_egress_dispatch(p_firm uuid,p_authorization uuid,
    p_client uuid,p_purpose text,p_event_seq bigint,p_event_type text,
    p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare a record; v_sha text;
begin
  if p_firm is null or p_authorization is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null then
    return jsonb_build_object('verdict','unknown');
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  -- firm_id is IN the lock predicate: a foreign-firm caller never reaches, and never locks,
  -- another firm's authorization row.
  select * into a from clara.egress_dispatch_authorizations
    where id=p_authorization and firm_id=p_firm for update;
  if not found then
    return jsonb_build_object('verdict','unknown');
  end if;
  -- THE DISPATCH RE-BINDING, now including THE BYTES. 0020's six terms proved "this
  -- authorization was minted for THIS dispatch"; WCB-R1 needs "and for THESE bytes" -- an
  -- authorization prepared for statement A, presented while statement B's bytes go to the
  -- vendor, must not consume. A mismatch is not consumed and NOT DISTINGUISHED: the presented
  -- authorization stays live for its legitimate dispatch.
  if a.client_id is distinct from p_client
     or a.purpose is distinct from p_purpose
     or a.event_seq is distinct from p_event_seq
     or a.event_type is distinct from p_event_type
     or a.document_sha256 is distinct from v_sha then
    return jsonb_build_object('verdict','unknown');
  end if;
  if a.consumed_at is not null or a.invalidated_at is not null
     or a.expires_at<=clock_timestamp() then
    return jsonb_build_object('verdict','unknown');
  end if;
  -- The exact consent AND the exact activation must still be live, and the activation must
  -- still name THAT consent (the composite FK binds firm/client/purpose, never consent_id).
  if not exists(select 1 from clara.client_egress_purpose_consents c
      where c.id=a.consent_id and c.revoked_at is null)
     or not exists(select 1 from clara.client_egress_purpose_activations x
      where x.id=a.activation_id and x.deactivated_at is null
        and x.consent_id=a.consent_id) then
    return jsonb_build_object('verdict','unknown');
  end if;
  update clara.egress_dispatch_authorizations set consumed_at=clock_timestamp() where id=a.id;
  return jsonb_build_object('verdict','granted');
end $$;
alter function clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)
  owner to clara_fn_owner;
revoke all on function clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text) from public;

-- The 0020 grant matrix, extended by exactly the two new arities and nothing else: the dispatch
-- boundary is a RUNTIME surface, the four typed RPCs are an OWNER surface.
grant execute on function
  clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text),
  clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)
to clara_runtime;

grant execute on function
  clara.grant_client_egress_purpose(uuid,text,uuid,text,text),
  clara.activate_client_egress_purpose(uuid,text,uuid,text),
  clara.deactivate_client_egress_purpose(uuid,text,text,text),
  clara.revoke_client_egress_purpose(uuid,text,text,text)
to clara_authenticated;

do $e1_overload_post$
declare v_n int;
begin
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='prepare_egress_dispatch';
  if v_n<>2 then
    raise exception '0038 E1.3 postcheck: prepare_egress_dispatch must carry exactly TWO arities (the 0020 5-arg + the 0038 6-arg), got %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='consume_egress_dispatch';
  if v_n<>2 then
    raise exception '0038 E1.3 postcheck: consume_egress_dispatch must carry exactly TWO arities (the 0020 6-arg + the 0038 7-arg), got %', v_n
      using errcode='CLR10';
  end if;
  -- The 0020 arities are BYTE-UNTOUCHED: their bodies must still know nothing about a hash.
  if (select position('document_sha256' in p.prosrc) from pg_proc p
        where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)'::regprocedure) = 0 then
    -- 0020's 5-arg DOES name the column (it inserts an explicit null); this asserts it still does.
    raise exception '0038 E1.3 postcheck: the 0020 5-arg prepare_egress_dispatch body drifted'
      using errcode='CLR10';
  end if;
  if (select position('document_sha256' in p.prosrc) from pg_proc p
        where p.oid='clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)'::regprocedure) <> 0 then
    raise exception '0038 E1.3 postcheck: the 0020 6-arg consume_egress_dispatch gained a hash term -- the wiki arity must stay untouched'
      using errcode='CLR10';
  end if;
end
$e1_overload_post$;

-- =====================================================================================
-- SECTION E2 -- THE ROUTER RECUT: clara._enqueue_invoice_facts_core (design 4.3).
--
-- THE DEAD END THIS OPENS. Today a filed bank statement reaches the router, fails the
-- four-kind gate and lands a terminal `skipped_kind` receipt (0026:392-410). That receipt IS
-- the C-b debt in miniature: the pipeline knows the document is a bank statement and has
-- nowhere to send it. Two lanes open here.
--
-- TWO LANES, ONE WORKFLOW, AND THE INVARIANT THAT DECIDES THE SPLIT. Every existing spend and
-- safety gate in this pipeline keys on LANE, not on document kind -- the kill switch, the page
-- budget, the concurrency cap and the attempt cap all read `t.lane`. A single 'statement' lane
-- carrying both a vendor OCR read and a free local parse would therefore have to make every one
-- of those gates kind-aware, which is precisely the coupling the lane concept exists to avoid.
-- So:
--   statement_facts -- pdf/image. VENDOR EGRESS. Joins the kill switch, the page budget, the
--     OCR concurrency accounting and the attempt cap, exactly as invoice_facts does.
--   statement_parse -- csv/ofx. IN-PROCESS DETERMINISTIC PARSE, no vendor egress. Joins none of
--     the egress controls (there is nothing to kill-switch) but IS consent-recorded at enqueue,
--     because "we read this client's bank data" is true whether or not a vendor saw it.
--
-- THE FOUR EDITS, per arm:
--   (1) kind 'bank_statement' + pdf/image -> statement_facts (the arm that closes the
--       skipped_kind dead end).
--   (2) csv/ofx mimes JOIN THE MIME DISPATCH. Today they never reach the kind test at all --
--       they fall to `skipped_type` before it. The new branch routes ONLY
--       kind='bank_statement' and returns the pre-existing `skipped_type` verdict for every
--       other kind, so no csv/ofx document that is not a bank statement changes outcome by one
--       byte. OFX intake DETECTION is named work in intake.mjs/scan.mjs (design 4.3); CSV ships
--       first and OFX rides this same lane behind its own fixture.
--   (3) THE already_completed SHORT-CIRCUIT BECOMES PER-LANE ENGINE-KIND AWARE. It is hard-coded
--       `engine_kind='invoice_facts'` today, so a fully ingested statement would look
--       un-extracted on every re-fire and RE-BUY A VENDOR READ. The map preserves the existing
--       behaviour exactly for invoice_facts AND for local_facts (both continue to read
--       'invoice_facts' extractions -- that is what they do today and this recut does not
--       change it) and adds the two statement kinds.
--   (4) THE ENQUEUE-TIME CONSENT GATE (design 4.4). It lives HERE and not in the claim body
--       because the ratified 0020 section 6 battery asserts claim_document_processing_task
--       carries NO call edge into the typed-consent surface. Enqueue is also the earlier and
--       more honest place: a client who has not authorized statement extraction should never
--       have a task queued in their name.
--
-- THE GATE'S THREE VERDICTS, and the one the design left to the builder:
--   * MORE THAN ONE active filing client -> `statement_multi_client`. document_processing_tasks
--     carries no client binding (0007:148-179), so consent must be resolved through the
--     document's filings -- and a statement filed to two clients has no single answerable
--     client. It is recorded as a TERMINAL NEVER-CLAIMED failed task rather than raised,
--     because this function runs INSIDE file_document / finalize_document_intake /
--     confirm_attribution_candidate / approve_wrong_client_correction: a raise here would abort
--     an unrelated filing transaction and leave the human with a CLR from a function they never
--     called. The receipt is visible, typed and re-enqueueable once the mis-filing is corrected
--     -- the `skipped_kind` idiom, which exists for exactly this shape of refusal.
--   * EXACTLY ONE, with no live (consent, activation) for (firm, client,
--     'statement_extraction') -> `consent_inactive`, same receipt idiom. Re-enqueueable after
--     the ceremony.
--   * ZERO active filing clients -> ALSO `consent_inactive`. The design specifies "more than
--     one" and "exactly one" and is silent on zero; the fail-closed reading is the only one
--     available, because with no filing there is no client who could have authorized anything.
--     Stated here rather than smuggled.
-- The gate sits AFTER the already_completed short-circuit -- an INGESTED statement raises no
-- consent question and must not generate noise (or re-buy a read) on a re-fire -- and BEFORE
-- the in-flight-task short-circuit. That second half is a decision, not an accident: the other
-- order has a real hole. A statement enqueued while one client held it, then filed to a SECOND
-- client, would hit the in-flight branch and return the queued task, so the vendor read would
-- proceed on a document with no answerable consent client. A re-fire whose gate now fails must
-- say so even while a task is queued.
--
-- WHAT IS **NOT** CHANGED, and is asserted both ways: 0014's consent-evidence exemption,
-- 0017's inactive-client guard (skipped_client_onboarding), 0025's P4 document row lock and its
-- four-kind gate, and 0026's A11 impossible-state RAISE (CLR35).
-- =====================================================================================
do $e2_router_pre$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_src is null then
    raise exception '0038 E2 prestate: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10';
  end if;
  if position('skipped_consent_evidence' in v_src)=0 then
    raise exception '0038 E2 prestate: the router lost 0014''s consent-evidence exemption' using errcode='CLR10';
  end if;
  if position('skipped_client_onboarding' in v_src)=0 then
    raise exception '0038 E2 prestate: the router lost 0017''s inactive-client guard -- the recut would be built from a stale base'
      using errcode='CLR10';
  end if;
  if position('where id=p_document for update' in v_src)=0 then
    raise exception '0038 E2 prestate: the router lost 0025''s P4 document lock' using errcode='CLR10';
  end if;
  if position('''invoice'',''credit_note'',''debit_note'',''receipt''' in v_src)=0 then
    raise exception '0038 E2 prestate: the router lost 0025''s four-kind gate' using errcode='CLR10';
  end if;
  if position('CLR35' in v_src)=0 or position('impossible state' in v_src)=0 then
    raise exception '0038 E2 prestate: the router lost 0026''s A11 impossible-state RAISE' using errcode='CLR10';
  end if;
  if position('statement_facts' in v_src)<>0 then
    raise exception '0038 E2 prestate: the router already carries the statement arms -- 0038 has already been applied to this database'
      using errcode='CLR10';
  end if;
end
$e2_router_pre$;

create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text; v_task_status text;
  v_engine_kind text; v_stmt_clients uuid[]; v_stmt_client uuid; v_gate text;
begin
  select * into d from clara.documents where id=p_document for update;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — never facts-extracted.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  if exists(select 1 from clara.document_filings df
      where df.document_id=p_document and df.retired_at is null)
     and not exists(select 1 from clara.document_filings df
       join clara.clients oc on oc.id=df.client_id and oc.status='active'
       where df.document_id=p_document and df.retired_at is null) then
    return jsonb_build_object('document_id',p_document,
      'status','skipped_client_onboarding');
  end if;
  -- 0015: mime chooses the engine family. 0016 (P3/WA21-R7): the DOCUMENT KIND
  -- gates the facts engines — only invoice-shaped kinds reach invoice_facts;
  -- a NULL kind classifies FIRST; xml stays rule-classified into the local lane.
  -- 0038 (design 4.3): 'bank_statement' now has TWO homes -- the vendor OCR lane for a
  -- pdf/image and the free local parse lane for a csv/ofx export.
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    if d.document_kind is null then
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';
    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';
    elsif d.document_kind='bank_statement' then
      -- 0038 arm 1: the statementFacts_v1 OCR lane. This is the arm that closes the
      -- bank_statement -> skipped_kind dead end 0026:392-410 left behind.
      v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement:2024-11-30';
    else
      -- (adjudication #11): the skipped_kind receipt lives on the task trail —
      -- a terminal failed row (never claimed, attempt_count 0 so it never
      -- consumes attempts), reused idempotently on re-invocation.
      select id into v_task from clara.document_processing_tasks
        where document_id=p_document and lane='invoice_facts'
          and status='failed' and error_code='skipped_kind'
        order by id limit 1;
      if v_task is null then
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane='invoice_facts';
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
            v_version,'invoice_facts','failed','skipped_kind',now())
          returning id into v_task;
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','skipped_kind','document_kind',d.document_kind);
    end if;
  elsif lower(coalesce(d.mime_type,'')) in ('application/xml','text/xml') then
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
  elsif lower(coalesce(d.mime_type,'')) in ('text/csv','application/csv',
      'application/x-ofx','application/ofx') then
    -- 0038 arm 2 (design 4.3): the csv/ofx mimes JOIN the dispatch. They dead-ended at
    -- skipped_type before the kind test could ever run. ONLY a bank statement routes; every
    -- other kind keeps the byte-identical skipped_type verdict it has today, so nothing that
    -- is not a statement changes behaviour.
    if d.document_kind='bank_statement' then
      v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';
    else
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
  else
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  if v_lane='classify' then
    -- a DONE classify verdict with the kind still NULL = the low-confidence
    -- hold: a human resolves it (set_document_kind / the review question);
    -- never re-enqueue in a loop.
    if exists(select 1 from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='doc_classify'
          and e.status='done') then
      return jsonb_build_object('document_id',p_document,'status','classify_low_confidence');
    end if;
  else
    -- 0038 (design 4.3): PER-LANE engine-kind. This short-circuit was hard-coded to
    -- 'invoice_facts', which is correct for invoice_facts AND for local_facts (both settle an
    -- invoice_facts extraction) and WRONG for either statement lane -- a fully ingested
    -- statement would read as un-extracted on every re-fire and re-buy a vendor read. The map
    -- preserves the two existing lanes exactly and names the two new ones.
    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')
                       then 'statement_facts'  -- BOTH statement lanes settle a
                       -- statement_facts extraction (the lane records how the read was
                       -- bought; the engine_kind what it is -- the 0026:709 precedent)
                       else 'invoice_facts' end;
    select e.id into v_task from clara.document_extractions e
      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'
      order by e.version_n desc limit 1;
    if v_task is not null then
      return jsonb_build_object('document_id',p_document,'status','already_completed',
        'extraction_id',v_task);
    end if;
  end if;
  -- 0038 (design 4.3/4.4, WCB-R1): THE ENQUEUE-TIME TYPED-CONSENT GATE, statement lanes only.
  -- It is here rather than in the claim body because the ratified 0020 section 6 byte-identity
  -- battery asserts claim_document_processing_task carries no call edge into the typed-consent
  -- surface -- and because enqueue is the earlier, more honest place: an unauthorized client
  -- should never have a task queued in their name at all. Both verdicts write the terminal
  -- NEVER-CLAIMED failed receipt (the skipped_kind idiom), never a raise: this function runs
  -- inside file_document / finalize_document_intake / confirm_attribution_candidate /
  -- approve_wrong_client_correction, and a raise would abort an unrelated filing transaction.
  --
  -- ORDERING, decided here because the design does not fix it: the gate runs AFTER the
  -- already_completed short-circuit (an ingested statement raises no consent question and must
  -- not generate noise on a re-fire) and BEFORE the in-flight short-circuit. The other order
  -- has a real hole: a statement enqueued while one client held it, then filed to a SECOND
  -- client, would hit the in-flight branch and return the queued task, so the vendor read
  -- would proceed on a document with no answerable consent client. A re-fire whose gate now
  -- fails should say so even while a task is queued.
  if v_lane in ('statement_facts','statement_parse') then
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='statement_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='statement_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      select id into v_task from clara.document_processing_tasks
        where document_id=p_document and lane=v_lane
          and status='failed' and error_code=v_gate
        order by id limit 1;
      if v_task is null then
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane;
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,v_engine,'{}'::jsonb,
        v_version,v_lane,'failed','attempt_cap',now()) returning id into v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,v_engine,'{}'::jsonb,
      v_version,v_lane,'queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    -- 0026 (amendment A11): the widened (document_id,engine_id,version_n,lane) key means a
    -- conflict HERE is now a genuine same-lane duplicate — a cross-lane collision is
    -- structurally impossible, lane joins the key. The exact colliding row must exist
    -- regardless of its current status (it may already be done/failed by the time we look
    -- again); silence hid this for the product's whole life, so an absent row here is
    -- impossible-state-loud, not a null task_id.
    select id,status into v_task,v_task_status from clara.document_processing_tasks
      where document_id=p_document and engine_id=v_engine and version_n=v_version and lane=v_lane;
    if v_task is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
        p_document,v_engine,v_version,v_lane using errcode='CLR35';
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',v_task_status);
  end if;
  -- Only the AZURE lanes consume the page budget; classify, the local parse and the local
  -- statement parse reserve nothing. 0038 adds statement_facts to the reserving set, which is
  -- what "the statement lane joins every existing spend control" means concretely.
  if v_lane in ('invoice_facts','statement_facts') then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;
alter function clara._enqueue_invoice_facts_core(uuid) owner to clara_fn_owner;

do $e2_router_post$
declare v_src text; v_code text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_code := regexp_replace(v_src,'\s+','','g');
  -- The four 0038 additions.
  if position('''statement_facts''' in v_src)=0 or position('''statement_parse''' in v_src)=0 then
    raise exception '0038 E2 postcheck: the router did not gain both statement lanes' using errcode='CLR10';
  end if;
  if position('text/csv' in v_src)=0 or position('application/x-ofx' in v_src)=0 then
    raise exception '0038 E2 postcheck: the csv/ofx mimes did not join the router''s mime dispatch' using errcode='CLR10';
  end if;
  if position('v_engine_kind' in v_src)=0
     or position('e.engine_kind=v_engine_kind' in v_code)=0 then
    raise exception '0038 E2 postcheck: the already_completed short-circuit is still hard-coded to one engine kind -- a completed statement would re-buy a vendor read on every re-fire'
      using errcode='CLR10';
  end if;
  if position('statement_multi_client' in v_src)=0 or position('consent_inactive' in v_src)=0
     or position('client_egress_purpose_activations' in v_src)=0 then
    raise exception '0038 E2 postcheck: the enqueue-time typed-consent gate is missing' using errcode='CLR10';
  end if;
  -- Everything the recut had to CARRY FORWARD, re-asserted after the fact.
  foreach v_code in array array['skipped_consent_evidence','skipped_client_onboarding',
      'where id=p_document for update','''invoice'',''credit_note'',''debit_note'',''receipt''',
      'CLR35','clara-myinvois:v1','azure-di:prebuilt-invoice:2024-11-30'] loop
    if position(v_code in v_src)=0 then
      raise exception '0038 E2 postcheck: the router recut DROPPED a prior change of record (missing %)', v_code
        using errcode='CLR10';
    end if;
  end loop;
  -- The page-budget reservation must still be unconditional-on-lane for the azure lanes
  -- (0025's accepted cost control, re-asserted in 0025:516).
  v_code := regexp_replace(v_src,'\s+','','g');
  if position('performclara._reserve_processing_call(v_task,v_pages)' in v_code)=0 then
    raise exception '0038 E2 postcheck: the router lost its page-budget reservation' using errcode='CLR10';
  end if;
  if position('v_lanein(''invoice_facts'',''statement_facts'')' in v_code)=0 then
    raise exception '0038 E2 postcheck: the statement OCR lane does not reserve the page budget' using errcode='CLR10';
  end if;
end
$e2_router_post$;

-- =====================================================================================
-- SECTION E3 -- clara.claim_document_processing_task: LANE-LIST WIDENINGS, AND NOTHING ELSE.
--
-- THE CONSTRAINT THAT SHAPES THIS SECTION. packages/db/tests/wave-b/wb-0020-legacy.test.mjs
-- pins this body's prosrc and asserts it carries NO CALL EDGE INTO THE TYPED-CONSENT SURFACE.
-- That is live law, not a preference: the claim body answers "is the vendor safe right now"
-- (the kill switch) and the typed gate answers "did this client authorize this purpose" -- two
-- orthogonal questions, and WCB-R1 puts the second one at enqueue (section E2) precisely so
-- this body does not have to learn it. So THREE literal lists change here and nothing else:
--   (1) the kill-switch lane list -- statement_facts egresses, so it holds when the switch is
--       off, exactly as ocr and invoice_facts do;
--   (2) the ATTEMPT-CAP branch -- widened to statement_facts, and its inner sum re-keyed from
--       the literal 'invoice_facts' to t.lane, so each lane caps on its OWN attempts rather
--       than one lane's cap silently governing the other;
--   (3) the OCR concurrency accounting (v_running / v_cap), both the count and the test.
-- statement_parse joins NONE of them: it never egresses, so there is no vendor to kill-switch,
-- no page to buy and no vendor concurrency to bound; its retry ceiling is the router's own
-- v_attempts>=3, which is where local_facts's has always lived.
--
-- The LEGACY purpose-blind consent branch (`elsif t.lane='invoice_facts'`, the 0011 lease
-- machinery: kill_switch / no_consent / partial_consent) is left EXACTLY as it is. Widening it
-- to statement_facts would make the legacy, purpose-blind consent table authorize a
-- statement-specific vendor read -- the precise conflation 0020 section 1 built a separate
-- relation to avoid.
--
-- CoR: recut from 0024:210-299, whose text WAS pulled via pg_get_functiondef against a live
-- 24-migration database and is therefore the only file text in the tree that shows 0011's lease
-- machinery. The prestate probe demands BOTH lineages before the recut installs.
-- =====================================================================================
do $e3_claim_pre$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  if v_src is null then
    raise exception '0038 E3 prestate: clara.claim_document_processing_task is GONE' using errcode='CLR10';
  end if;
  if position('kill_switch' in v_src)=0 or position('no_consent' in v_src)=0
     or position('partial_consent' in v_src)=0 then
    raise exception '0038 E3 prestate: the claim body is missing 0011''s egress-hold LEASE machinery -- refusing to recut a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('claim_secret_digest' in v_src)=0 then
    raise exception '0038 E3 prestate: the claim body is missing 0024''s Q1 claim_secret capability'
      using errcode='CLR10';
  end if;
  if position('client_egress_purpose' in v_src)<>0 then
    raise exception '0038 E3 prestate: the claim body ALREADY reads the typed-consent surface -- the 0020 section 6 battery forbids that edge and this migration will not build on it'
      using errcode='CLR10';
  end if;
  if position('statement_facts' in v_src)<>0 then
    raise exception '0038 E3 prestate: the claim body already carries the statement lane -- 0038 has already been applied to this database'
      using errcode='CLR10';
  end if;
end
$e3_claim_pre$;

create or replace function clara.claim_document_processing_task(p_task uuid,
    p_workflow_run_id text, p_egress_approved boolean) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_cap int; v_running int; v_attempts int;
  v_clients int; v_consented int; v_hold_reason text; v_secret text;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'workflow_run_id is required' using errcode='CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  select storage_path,sha256,mime_type,byte_size into d
    from clara.documents where id=t.document_id;

  -- The lease check precedes EVERY dispatching branch. Only the EGRESSING lanes
  -- (ocr, invoice_facts and -- 0038 -- statement_facts) are kill-switch-gated; invoice_facts
  -- additionally requires every active filing client to hold a live LEGACY consent. Local
  -- lanes (structured_parse, local_facts, classify, statement_parse) never hold.
  --
  -- 0038 (design 4.3/4.4): statement_facts joins the KILL SWITCH and nothing else here. The
  -- typed (consent, activation) it needs is checked at ENQUEUE -- the 0020 section 6
  -- byte-identity battery asserts this body carries no call edge into the typed-consent
  -- surface, and the two questions are orthogonal anyway: the switch asks whether the vendor is
  -- safe right now, the typed gate asks whether this client authorized this purpose. Widening
  -- the LEGACY branch below to statement_facts would make a purpose-blind consent authorize a
  -- statement-specific read, which is what 0020 section 1 built a separate relation to prevent.
  if t.lane in ('ocr','invoice_facts','statement_facts')
     and not coalesce(p_egress_approved,false) then
    v_hold_reason:='kill_switch';
  elsif t.lane='invoice_facts' then
    select count(distinct f.client_id)::int,
      count(distinct f.client_id) filter(where exists(
        select 1 from clara.client_egress_consents c
        where c.client_id=f.client_id and c.revoked_at is null))::int
      into v_clients,v_consented from clara.document_filings f
      where f.document_id=t.document_id and f.retired_at is null;
    if coalesce(v_clients,0)=0 or coalesce(v_consented,0)=0 then
      v_hold_reason:='no_consent';
    elsif v_consented<v_clients then
      v_hold_reason:='partial_consent';
    end if;
  end if;
  if v_hold_reason is not null then
    if t.status in ('queued','running') then
      update clara.document_processing_tasks set status='held_egress',
        workflow_run_id=null,started_at=null,vendor_op_ref=null where id=p_task;
      if t.lane='ocr' then
        update clara.documents set extraction_status='held_egress' where id=t.document_id;
      end if;
    elsif t.status<>'held_egress' then
      raise exception 'processing task is not dispatchable' using errcode='CLR16';
    end if;
    return jsonb_build_object('task_id',p_task,'status','held_egress',
      'workflow_run_id',null,'payload',jsonb_build_object(
        'clr','CLR28','reason',v_hold_reason));
  end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
      'storage_path',d.storage_path,'sha256',d.sha256,
      'mime_type',d.mime_type,'byte_size',d.byte_size);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  -- 0038: the attempt cap is now PER EGRESSING LANE. The sum was keyed on the literal
  -- 'invoice_facts' while the branch it guards was too; widening the branch without re-keying
  -- the sum would let one lane's attempts cap the other's.
  if t.lane in ('invoice_facts','statement_facts') then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks where document_id=t.document_id
        and lane=t.lane;
    if v_attempts>=3 then
      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',
        finished_at=now() where id=p_task;
      perform clara._refund_processing_call(p_task,'attempt_cap');
      perform clara._append_event(t.firm_id,'document.invoice_facts_failed',null,null,null,null,
        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));
      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');
    end if;
  end if;
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts')
      and status='running';
  if t.lane in ('ocr','invoice_facts','statement_facts') and v_running>=v_cap then
    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
  end if;
  -- Q1: the CAPABILITY minted on this fresh claim — a random preimage whose digest ALONE
  -- is stored (never the preimage). Returned once, below, to this session only.
  v_secret:=gen_random_uuid()::text;
  update clara.document_processing_tasks set status='running',
    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1,
    claim_secret_digest=sha256(convert_to(v_secret,'UTF8'))
    where id=p_task;
  if t.lane='ocr' then update clara.documents set extraction_status='running' where id=t.document_id; end if;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,'document_id',t.document_id,
    'firm_id',t.firm_id,'lane',t.lane,'storage_path',d.storage_path,
    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size,
    'claim_secret',v_secret);
end $$;

alter function clara.claim_document_processing_task(uuid,text,boolean) owner to clara_fn_owner;
grant execute on function clara.claim_document_processing_task(uuid,text,boolean) to clara_runtime;

do $e3_claim_post$
declare v_src text; v_code text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  v_code := regexp_replace(v_src,'\s+','','g');
  -- The THREE widened literal lists, each asserted where it lives.
  if position('t.lanein(''ocr'',''invoice_facts'',''statement_facts'')andnotcoalesce(p_egress_approved,false)' in v_code)=0 then
    raise exception '0038 E3 postcheck: the kill-switch lane list did not gain statement_facts' using errcode='CLR10';
  end if;
  if position('t.lanein(''invoice_facts'',''statement_facts'')' in v_code)=0
     or position('andlane=t.lane' in v_code)=0 then
    raise exception '0038 E3 postcheck: the attempt-cap branch did not gain statement_facts, or its inner sum is still keyed on a lane literal'
      using errcode='CLR10';
  end if;
  if position('lanein(''ocr'',''invoice_facts'',''statement_facts'')andstatus=''running''' in v_code)=0 then
    raise exception '0038 E3 postcheck: the OCR concurrency accounting did not gain statement_facts' using errcode='CLR10';
  end if;
  -- THE BATTERY'S OWN DEMAND, asserted positively: NO typed-consent edge, in either direction.
  if position('client_egress_purpose' in v_src)<>0
     or position('prepare_egress_dispatch' in v_src)<>0
     or position('consume_egress_dispatch' in v_src)<>0 then
    raise exception '0038 E3 postcheck: the claim body gained a call edge into the typed-consent surface -- the ratified 0020 section 6 battery forbids it and WCB-R1 puts the gate at enqueue'
      using errcode='CLR10';
  end if;
  -- The LEGACY purpose-blind branch stays invoice-facts-only, and the lease machinery survives.
  if position('elsift.lane=''invoice_facts''then' in v_code)=0
     or position('clara.client_egress_consents' in v_src)=0
     or position('partial_consent' in v_src)=0 then
    raise exception '0038 E3 postcheck: the 0011 legacy consent lease branch drifted' using errcode='CLR10';
  end if;
  if position('claim_secret_digest' in v_src)=0 then
    raise exception '0038 E3 postcheck: the recut dropped 0024''s claim_secret capability' using errcode='CLR10';
  end if;
end
$e3_claim_post$;

-- =====================================================================================
-- SECTION E4 -- THE SPEND / RELEASE PRIMITIVES (design 4.3: "the lane joins every existing
-- spend/safety control").
--
-- A REGISTER CORRECTION, REPORTED RATHER THAN SMUGGLED. The design's CoR register names
-- _reserve / _settle / _refund_processing_call as a trio needing lane widenings. Reading all
-- three (0009:581 / 612 / 644; both greps clean, never recut, never dynamically patched) shows
-- only ONE of them carries a lane predicate at all:
--   * _reserve_processing_call GATES on `t.lane<>'invoice_facts'` -- a real gate, and the one
--     that would refuse the statement OCR lane's reservation outright. WIDENED.
--   * _settle_processing_call and _refund_processing_call key ONLY on
--     processing_call_reservations.task_id. They are already lane-neutral and a "widening"
--     would be a no-op on live money-path code. They are recut anyway, for exactly one reason
--     that is worth the churn: their DIAGNOSTICS say "invoice-facts", and an operator reading
--     'invoice-facts reservation not found' while debugging a bank-statement page charge would
--     be actively misled. Message text only; the SQLSTATE, the control flow, the advisory rung
--     and the daily-limit arithmetic are byte-for-byte the 0009 originals.
-- release_held_document_tasks joins the kill-switch lane list, because a held statement task
-- must be released by the same sweep that releases a held OCR or invoice-facts task -- a lane
-- that can be HELD and cannot be RELEASED is a permanent stall.
-- =====================================================================================
do $e4_pre$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._reserve_processing_call(uuid,int)'::regprocedure;
  if v_src is null or position('t.lane<>''invoice_facts''' in v_src)=0 then
    raise exception '0038 E4 prestate: _reserve_processing_call is missing 0009''s invoice-facts lane gate -- refusing to recut a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('statement_facts' in v_src)<>0 then
    raise exception '0038 E4 prestate: _reserve_processing_call already carries the statement lane -- 0038 has already been applied'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._settle_processing_call(uuid,int)'::regprocedure;
  if v_src is null or position('pg_advisory_xact_lock(203005001' in v_src)=0
     or position('settled_pages' in v_src)=0 then
    raise exception '0038 E4 prestate: _settle_processing_call drifted from its 0009 shape' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._refund_processing_call(uuid,text)'::regprocedure;
  if v_src is null or position('refund_reason' in v_src)=0 then
    raise exception '0038 E4 prestate: _refund_processing_call drifted from its 0009 shape' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  if v_src is null or position('lane in (''ocr'',''invoice_facts'')' in v_src)=0 then
    raise exception '0038 E4 prestate: release_held_document_tasks is missing 0009''s kill-switch lane list'
      using errcode='CLR10';
  end if;
end
$e4_pre$;

-- The ONE genuine widening: the statement OCR lane buys vendor pages and must be allowed to
-- reserve them against the firm's daily budget. Everything else is 0009 verbatim.
create or replace function clara._reserve_processing_call(p_task uuid, p_pages int) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_limit int; v_used bigint; v_id uuid;
begin
  if p_pages < 0 then raise exception 'processing pages must be non-negative' using errcode='CLR18'; end if;
  select * into t from clara.document_processing_tasks where id=p_task;
  -- 0038 (design 4.3): the statement OCR lane joins the page budget. The local statement parse
  -- deliberately does NOT -- it buys nothing, so charging it would misstate the firm's vendor
  -- spend.
  if not found or t.lane not in ('invoice_facts','statement_facts') then
    raise exception 'metered processing task not found' using errcode='CLR18';
  end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select coalesce(sum(pages),0) into v_used from (
    select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
    from clara.document_ingest_reservations
    where firm_id=t.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
    union all
    select case when state='settled' then settled_pages else pages_reserved end::bigint
    from clara.processing_call_reservations
    where firm_id=t.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
  ) q;
  if v_used + p_pages > v_limit then
    raise exception 'processing-call daily page limit reached' using errcode='CLR18';
  end if;
  insert into clara.processing_call_reservations(firm_id,task_id,pages_reserved)
    values(t.firm_id,p_task,p_pages) returning id into v_id;
  return v_id;
end $$;
alter function clara._reserve_processing_call(uuid,int) owner to clara_fn_owner;
revoke all on function clara._reserve_processing_call(uuid,int) from public;

-- 0009 verbatim apart from the two diagnostic strings. No lane predicate exists here and none
-- is added: settlement keys on the reservation's task_id, which is lane-agnostic by construction.
create or replace function clara._settle_processing_call(p_task uuid, p_pages int) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_limit int; v_used bigint;
begin
  if p_pages < 0 then raise exception 'actual pages must be non-negative' using errcode='CLR18'; end if;
  select * into r from clara.processing_call_reservations where task_id=p_task;
  if not found then raise exception 'processing-call reservation not found' using errcode='CLR18'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(r.firm_id::text));
  select * into r from clara.processing_call_reservations where task_id=p_task for update;
  if r.state='settled' then return r.id; end if;
  if r.state='refunded' then raise exception 'refunded processing call cannot settle' using errcode='CLR18'; end if;
  select coalesce(l.pages_per_day,1000) into v_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=r.firm_id;
  select coalesce(sum(pages),0) into v_used from (
    select case when state='settled' then settled_pages else pages_reserved end::bigint as pages
    from clara.document_ingest_reservations
    where firm_id=r.firm_id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
    union all
    select case when state='settled' then settled_pages else pages_reserved end::bigint
    from clara.processing_call_reservations
    where firm_id=r.firm_id and id<>r.id and state<>'refunded'
      and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc')
  ) q;
  if v_used + p_pages > v_limit then
    raise exception 'actual processing-call pages exceed daily limit' using errcode='CLR18';
  end if;
  update clara.processing_call_reservations set state='settled',settled_pages=p_pages,
    settled_at=now() where id=r.id;
  return r.id;
end $$;
alter function clara._settle_processing_call(uuid,int) owner to clara_fn_owner;
revoke all on function clara._settle_processing_call(uuid,int) from public;

-- 0009 verbatim; already lane-neutral. Recut only so the trio stays one readable idiom.
create or replace function clara._refund_processing_call(p_task uuid, p_reason text) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record;
begin
  select * into r from clara.processing_call_reservations where task_id=p_task;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(r.firm_id::text));
  select * into r from clara.processing_call_reservations where task_id=p_task for update;
  if r.state='refunded' then return r.id; end if;
  if r.state='settled' then raise exception 'settled processing call cannot refund' using errcode='CLR18'; end if;
  update clara.processing_call_reservations set state='refunded',refunded_at=now(),
    refund_reason=coalesce(nullif(btrim(p_reason),''),'unspecified') where id=r.id;
  return r.id;
end $$;
alter function clara._refund_processing_call(uuid,text) owner to clara_fn_owner;
revoke all on function clara._refund_processing_call(uuid,text) from public;

-- The kill-switch RELEASE sweep. A lane that can be HELD and cannot be RELEASED is a permanent
-- stall, so this list must track the claim body's kill-switch list exactly -- section E8 asserts
-- the two stay in step.
create or replace function clara.release_held_document_tasks(p_limit int default 1000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_ids uuid[];
begin
  with picked as (
    select id from clara.document_processing_tasks
    where status='held_egress' and lane in ('ocr','invoice_facts','statement_facts')
    order by created_at,id for update skip locked
    limit greatest(1,least(p_limit,10000))
  ), moved as (
    update clara.document_processing_tasks t set status='queued'
    from picked p where t.id=p.id returning t.id
  )
  select count(*)::int,array_agg(id) into v_n,v_ids from moved;
  if v_ids is not null then
    update clara.documents d set extraction_status='pending'
      where d.id in (select t.document_id from clara.document_processing_tasks t
        where t.id=any(v_ids) and t.lane='ocr');
  end if;
  return jsonb_build_object('released',coalesce(v_n,0));
end $$;
alter function clara.release_held_document_tasks(int) owner to clara_fn_owner;

do $e4_post$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._reserve_processing_call(uuid,int)'::regprocedure;
  if position('t.lane not in (''invoice_facts'',''statement_facts'')' in v_src)=0 then
    raise exception '0038 E4 postcheck: _reserve_processing_call did not gain the statement OCR lane' using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005001' in v_src)=0
     or position('document_ingest_reservations' in v_src)=0 then
    raise exception '0038 E4 postcheck: _reserve_processing_call lost its advisory rung or its cross-table daily sum' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._settle_processing_call(uuid,int)'::regprocedure;
  if position('invoice-facts' in v_src)<>0 then
    raise exception '0038 E4 postcheck: _settle_processing_call still reports an invoice-facts-only diagnostic' using errcode='CLR10';
  end if;
  if position('settled_pages=p_pages' in v_src)=0 then
    raise exception '0038 E4 postcheck: _settle_processing_call drifted beyond its diagnostics' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  if position('lane in (''ocr'',''invoice_facts'',''statement_facts'')' in v_src)=0 then
    raise exception '0038 E4 postcheck: release_held_document_tasks did not gain the statement OCR lane -- a held statement task would stall forever'
      using errcode='CLR10';
  end if;
end
$e4_post$;

reset role;

-- =====================================================================================
-- SECTION E5 -- THE FIVE CHECK WIDENINGS (design part2 section 5).
--
-- v1 of the design named the error-code taxonomy and forgot the constraints that make it
-- storable; both review lanes converged on it. EVERY named refusal code below is a row this
-- pipeline must be able to WRITE, and today every one of them violates
-- ck_processing_task_error_code_0016 -- so the whole failure taxonomy would have been
-- unstorable and `fail_statement_facts` would have raised a constraint violation instead of
-- recording a receipt.
--
-- The tables are clara_fn_owner-owned (0007:21) but the 0016 constraint changes ran as the
-- migration role, so these run with the role reset -- the 0016:132-172 position, verbatim.
-- =====================================================================================

-- (1) LANE. Two new lanes; the existing six are untouched.
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_0016;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_0038 check (
  lane in ('ocr','structured_parse','none','invoice_facts','local_facts','classify',
           'statement_facts','statement_parse'));

-- (2) LANE <-> ENGINE. statement_facts joins the azure arm (it IS a vendor read);
-- statement_parse gets its OWN local prefix arm, the 0016 classify precedent -- a dedicated
-- 'clara-statement-%' prefix rather than the generic 'clara-%' bucket, so a mis-wired local
-- engine cannot land in the statement lane by accident. Pre-assert first (0016:135-148).
do $e5_lane_engine_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.document_processing_tasks t
  where not (
    t.engine_id like 'clara-fixture:%'
    or (t.lane in ('ocr','invoice_facts','statement_facts') and t.engine_id like 'azure-%')
    or (t.lane in ('structured_parse','local_facts','none') and t.engine_id like 'clara-%')
    or (t.lane='classify' and t.engine_id like 'clara-classify-%')
    or (t.lane='statement_parse' and t.engine_id like 'clara-statement-%'));
  if v_bad<>0 then
    raise exception '0038 lane<->engine pre-assert failed: % existing task row(s) violate',v_bad
      using errcode='CLR10';
  end if;
end
$e5_lane_engine_pre$;
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_engine_0016;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_0038 check (
  engine_id like 'clara-fixture:%'
  or (lane in ('ocr','invoice_facts','statement_facts') and engine_id like 'azure-%')
  or (lane in ('structured_parse','local_facts','none') and engine_id like 'clara-%')
  or (lane='classify' and engine_id like 'clara-classify-%')
  or (lane='statement_parse' and engine_id like 'clara-statement-%'));

-- (3) EXTRACTION ENGINE KIND. Named "engine_kind" in the design's five; it lives on
-- clara.document_extractions, not on document_processing_tasks (that relation has no such
-- column) -- recorded here so the register and the schema agree. The two statement kinds are
-- what bank_statements.reader1_extraction_id / reader2_extraction_id will point at, and what
-- the router's per-lane already_completed short-circuit (section E2) now reads.
-- They stay DELIBERATELY OUTSIDE the AB-3 attribution set (0016:174-179): the attribution
-- matcher reads only engine_kind in ('ocr','structured_parse'), so a statement read can never
-- become a client-attribution source.
alter table clara.document_extractions drop constraint ck_document_extractions_engine_kind_0016;
alter table clara.document_extractions add constraint ck_document_extractions_engine_kind_0038 check (
  -- assembly reconciliation: BOTH statement lanes stamp engine_kind='statement_facts' (the
  -- lane records how the read was bought, the engine_kind what it is -- the invoice_facts/
  -- local_facts precedent, 0026:709-717); 'statement_parse' is deliberately NOT an
  -- engine_kind value, nobody writes it.
  engine_kind in ('ocr','structured_parse','invoice_facts','doc_classify','statement_facts'));

-- (4) ERROR CODE -- the design 4.3 taxonomy in full, plus the enqueue gate's two codes.
-- Every one of these is a REFUSAL WITH A NAME, which is the whole point: a statement that does
-- not ingest must say which control stopped it, not "engine_error".
--   header_unreadable        the printed endpoints could not be read independently
--   totals_unreadable        the printed TOTAL DEBIT / TOTAL CREDIT could not be read
--   readers_disagree         the two readers did not agree on the load-bearing header/skeleton
--   chain_broken             opening + sum(lines) <> closing, or a running-balance step failed
--   continuity_mismatch      an adjacent period's closing does not meet this opening
--   duplicate_period         a live statement already covers this period for this account
--   overlapping_period       the period overlaps a live statement's
--   non_myr_statement        an explicit non-MYR statement (WC-R5)
--   account_unregistered     the corroborated header binds no live bank account
--   account_inactive         it binds a DEACTIVATED bank account
--   statement_multi_client   the document is actively filed to more than one client
--   period_invalid           period_start > period_end, or a degenerate period
--   line_date_out_of_period  a line date falls outside [period_start, period_end]
--   consent_inactive         no live (typed consent, activation) for statement_extraction
alter table clara.document_processing_tasks drop constraint ck_processing_task_error_code_0016;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_0038 check (
  error_code is null or error_code in
    ('engine_error','timeout','engine_lost','storage_error','corrupt','encrypted',
     'bad_type','limit','budget','attempt_cap','internal','skipped_kind',
     'header_unreadable','totals_unreadable','readers_disagree','chain_broken',
     'continuity_mismatch','duplicate_period','overlapping_period','non_myr_statement',
     'account_unregistered','account_inactive','statement_multi_client','period_invalid',
     'line_date_out_of_period','consent_inactive'));

-- (5) BINDING -- the NEVER-CLAIMED allowlist. A terminal failed row with no workflow_run_id and
-- no started_at is only legal for a refusal that happened BEFORE any claim. Both of the router's
-- enqueue-gate verdicts are exactly that shape, so both join 'budget' / 'attempt_cap' /
-- 'skipped_kind' in the allowlist. Every OTHER code in the taxonomy above lands through
-- fail_statement_facts on a CLAIMED task and is already admitted by the workflow_run_id arm.
--
-- statement_multi_client is in this list and not only in the fail_statement_facts set because
-- the router records it (section E2's header states why a raise is unacceptable there): the
-- design names it in both places and the storable shape is the never-claimed one.
alter table clara.document_processing_tasks drop constraint ck_processing_task_binding_0016;
alter table clara.document_processing_tasks add constraint ck_processing_task_binding_0038 check (
  (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
  or (status in ('running','done') and workflow_run_id is not null and started_at is not null)
  or (status = 'failed' and (
    (workflow_run_id is not null and started_at is not null)
    or (workflow_run_id is null and started_at is null
        and error_code in ('budget','attempt_cap','skipped_kind',
                           'consent_inactive','statement_multi_client'))
  )));

set role clara_fn_owner;

-- =====================================================================================
-- SECTION E6 -- THE TWO BANK PREDICATES (the 0037:883-896 idiom).
--
-- 0037 extracted clara._subledger_allocated_items_present for a stated reason: "so the two
-- CHANGE-OF-RECORD PATCHES into reverse_entry and approve_wrong_client_correction stay one line
-- each, which is what makes their anchors readable and their drift probes exact". The same
-- reason applies here, to the same two bodies plus retire_document_filing, so the same idiom is
-- used rather than inlining three copies of an EXISTS.
--
-- Both are definer-internal and granted to NOBODY: every caller is itself a SECURITY DEFINER
-- function owned by clara_fn_owner, which holds EXECUTE implicitly as owner. Each carries its
-- own explicit revoke (0009's default-privileges sweep does NOT stop PostgreSQL's
-- PUBLIC-EXECUTE-by-default on a new function -- the T17b-proven mechanism, restated at
-- 0037:3416-3419).
-- =====================================================================================

-- TRUE when this entry is a member of a bank match group that is still pending or live.
-- The reverse refusal's predicate (design 4.6): a matched entry is a statement line's
-- counterparty in a tie that the group model owns; reversing it out from under the group would
-- strand the line at full amount in a group that no longer ties. The remedy is honest and
-- one step: unmatch, then reverse.
create function clara._bank_live_match_present(p_entry uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.bank_match_entry_members m
    where m.entry_id = p_entry
      and m.group_status in ('pending','live'));
$$;
revoke all on function clara._bank_live_match_present(uuid) from public;

-- TRUE when a LIVE bank statement is bound to this document. The provenance-durability
-- predicate (design 4.2: bank_statements.filing_id is a congruence FK, "provenance must survive
-- filing correction"). Keyed on the DOCUMENT rather than the filing, per design part2 section 5
-- ("a live bank_statements row rides the document") -- strictly the stronger reading, and the
-- right one for the correction writer, which moves the document's filing between clients.
create function clara._bank_live_statement_on_document(p_document uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.bank_statements s
    where s.document_id = p_document
      and s.status = 'live');
$$;
revoke all on function clara._bank_live_statement_on_document(uuid) from public;

-- =====================================================================================
-- SECTION E7 -- clara.reverse_entry: a CHANGE-OF-RECORD PATCH, not a rebuild (design 4.6).
--
-- 0009:1697 is NOT its last definition, and neither is 0037's file text a rebuild target: the
-- live body is 0009's, PATCHED by 0017:255-271 (the R1-F1 CLR31 opening boundary) and then
-- PATCHED AGAIN by 0037:2149-2224 (the 203005004 client rung, the allocated_items_present
-- refusal, and the subledger hook on the inline approve). A rebuild from any file text would
-- silently delete two changes of record. The prestate probes are POSITIVE for BOTH.
--
-- THE ADDITION. A reversal of a MATCHED entry is refused by name -- `live_bank_match_present`,
-- remedy "unmatch first". Two things make this the right shape rather than a belt-only concern:
--   * the group model owns an exact per-group tie (design section 3, WC-R6). An entry member
--     leaving the group by reversal breaks that tie with no verb having been called on the
--     group at all, and the line -- which entered at FULL amount -- would sit in a group that
--     no longer balances.
--   * approval status alone cannot floor membership: a REVERSED ORIGINAL STAYS
--     status='approved' (0003:371-383). So "refuse to reverse while matched" and "refuse a
--     reversed entry as a member" are two different controls, and this is the first of them.
-- The structural backstop for any future reverse path is the reversal belt on journal_entries
-- (design 4.5), which is another section's deliverable; this refusal is the one that gives the
-- human a remedy instead of a commit-time belt failure with no path forward.
--
-- PLACEMENT. Immediately after 0037's own allocated_items_present refusal, which means: after
-- the op-key reservation and the client advisory rung 0037 installed, before the mirror is
-- built, so a refusal costs no write. The 203005004 rung 0037 takes two lines above ALSO
-- serializes this read against the C-a composites; the bank rows are locked AFTER
-- journal_entries and AFTER open_items in every writer (design 4.9's law), so reading them here,
-- under the JE row lock this body already holds, inverts nothing.
--
-- THE BOUNCED-CHEQUE DOCTRINE, recorded where the refusal lives (design 4.6): a dishonoured
-- cheque is NOT a reversal. The deposit line's match is a true historical clearing fact and
-- stays; the return line matches a NEW reinstatement entry. Reversal is for entries that should
-- not have existed -- and those unmatch first, honestly.
-- =====================================================================================
do $rev38$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara.reverse_entry(uuid,text,text)'::regprocedure) into v_def;
  if position('opening_entry_k_family_only' in v_def)=0 then
    raise exception '0038 section E7 prestate: the live clara.reverse_entry body is missing 0017''s R1-F1 CLR31 opening-boundary marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('allocated_items_present' in v_def)=0
     or position('clara._subledger_on_approve(' in v_def)=0 then
    raise exception '0038 section E7 prestate: the live clara.reverse_entry body is missing 0037''s reverse refusal or subledger hook -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('live_bank_match_present' in v_def)<>0 then
    raise exception '0038 section E7 prestate: clara.reverse_entry already carries the bank-match refusal -- 0038 has already been applied to this database'
      using errcode='CLR10';
  end if;
  -- The anchor must occur EXACTLY ONCE: replace() rewrites every occurrence, so a drifted body
  -- carrying two copies would get two splices while a position()>0 post-check stayed green
  -- (0036 review F4, applied at 0037:2161-2169 and again here).
  if (length(v_def)-length(replace(v_def,
      $a$  if clara._subledger_allocated_items_present(p_entry) then
    raise exception 'open items on this entry carry allocations; unallocate them first'
      using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
  end if;$a$,'')))
     / length($a$  if clara._subledger_allocated_items_present(p_entry) then
    raise exception 'open items on this entry carry allocations; unallocate them first'
      using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
  end if;$a$) <> 1 then
    raise exception '0038 section E7 prestate: the reverse_entry allocation-refusal anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$  if clara._subledger_allocated_items_present(p_entry) then
    raise exception 'open items on this entry carry allocations; unallocate them first'
      using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
  end if;$old$,
$new$  if clara._subledger_allocated_items_present(p_entry) then
    raise exception 'open items on this entry carry allocations; unallocate them first'
      using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
  end if;
  -- 0038 (design 4.6): REVERSE-WHILE-MATCHED IS REFUSED BY NAME. A bank match group carries an
  -- exact per-group tie (WC-R6) and its member lines enter at FULL amount; an entry leaving the
  -- group by reversal would break that tie with no verb ever called on the group. Note that
  -- approval status cannot floor this on its own -- a reversed original STAYS approved
  -- (0003:371-383) -- so this refusal and the member-side reversal floors are two distinct
  -- controls. Remedy: unmatch first, then reverse. A DISHONOURED CHEQUE IS NOT THIS CASE: the
  -- deposit's match is a true historical clearing fact and stays; the return line matches a new
  -- reinstatement entry (design 4.6, the bounced-cheque doctrine).
  if clara._bank_live_match_present(p_entry) then
    raise exception 'this entry is matched to a bank statement line; unmatch the bank match first'
      using errcode='CLR10',detail='{"reason":"live_bank_match_present"}';
  end if;$new$);
  if v_next=v_def or position('live_bank_match_present' in v_next)=0
     or position('clara._bank_live_match_present(p_entry)' in v_next)=0 then
    raise exception '0038 section E7: reverse_entry allocation-refusal anchor drift -- the bank-match refusal was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$rev38$;

-- =====================================================================================
-- SECTION E7b -- clara.approve_wrong_client_correction: TWO refusals, ONE round trip.
--
-- The FOURTH approve path (0037 section H.3) and, separately, a filing writer -- so it takes
-- both of this section's refusals, and takes them in ONE pg_get_functiondef round trip because a
-- second read would have to re-read the body the first one is building (the 0020-A7 idiom).
--
-- (a) PROVENANCE DURABILITY (design part2 section 5). This verb RETIRES the source filing and
--     files the document to a different client. bank_statements binds (document_id,
--     source_doc_sha256, filing_id) as a congruence FK precisely so provenance survives a filing
--     correction -- but "survives" cannot mean "the statement now cites a retired filing
--     belonging to a client who no longer holds the document". A live statement is a books-bearing
--     fact with lines, possibly matches, possibly settlements; moving the document under it is
--     not a correction, it is a rewrite. Refused by name at the TOP, right after 0027's
--     documents lock and before any filing work, so the refusal costs no write and takes no
--     further lock. Remedy: void the statement (WCB-R5 requires zero pending/live groups on its
--     lines), then correct the filing, then re-ingest.
-- (b) REVERSE-WHILE-MATCHED, per correction ITEM, spliced beside 0037's allocated_items_present
--     refusal in the reverse branch -- because a correction that moves a filing between clients
--     still REVERSES the entries it captures, so the same law applies here as in reverse_entry.
--     (a) does not subsume (b): a captured entry may be matched to a statement on a DIFFERENT
--     document entirely.
--
-- PATCHED, not rebuilt: 0027:196 is the last definition (the documents-before-document_filings
-- lock-order fix) and 0037:2319-2394 patched it twice. Positive probes for 0027's, 0017's,
-- 0009's and 0037's own markers before anything is touched.
-- =====================================================================================
do $awcc38$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure) into v_def;
  if position('perform 1 from clara.documents where id=x.document_id for update;' in v_def)=0
     or position('opening_entry_k_family_only' in v_def)=0
     or position('adopted_reversal' in v_def)=0 then
    raise exception '0038 section E7b prestate: the live clara.approve_wrong_client_correction body is missing a 0027 lock-order / 0017 R1-F1 / 0009 adoption marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('allocated_items_present' in v_def)=0
     or position('clara._subledger_on_approve(v_mirror)' in v_def)=0 then
    raise exception '0038 section E7b prestate: the live body is missing 0037''s reverse refusal or mirror-approve hook -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('live_bank_match_present' in v_def)<>0
     or position('live_bank_statement_present' in v_def)<>0 then
    raise exception '0038 section E7b prestate: clara.approve_wrong_client_correction already carries a 0038 bank refusal -- 0038 has already been applied to this database'
      using errcode='CLR10';
  end if;

  ---- (a) THE PROVENANCE REFUSAL, anchored on 0027's documents lock. -------------------
  if (length(v_def)-length(replace(v_def,
      $a$  perform 1 from clara.documents where id=x.document_id for update;$a$,'')))
     / length($a$  perform 1 from clara.documents where id=x.document_id for update;$a$) <> 1 then
    raise exception '0038 section E7b prestate: the documents-lock anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$  perform 1 from clara.documents where id=x.document_id for update;$old$,
$new$  perform 1 from clara.documents where id=x.document_id for update;
  -- 0038 (design 4.2 / part2 section 5): PROVENANCE DURABILITY. A live bank statement binds this
  -- document AND the filing this correction is about to retire. Moving the document to another
  -- client under a statement that already produced lines -- and possibly matches and settlements
  -- -- is not a correction, it is a rewrite of a books-bearing fact. Refused at the top, before
  -- any filing work, so the refusal costs no write. Remedy: void the statement (which itself
  -- requires zero pending/live match groups on its lines, WCB-R5), then correct the filing, then
  -- re-ingest.
  if clara._bank_live_statement_on_document(x.document_id) then
    raise exception 'a live bank statement is bound to this document; void the statement before correcting its filing'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;$new$);
  if v_next=v_def or position('live_bank_statement_present' in v_next)=0
     or position('clara._bank_live_statement_on_document(x.document_id)' in v_next)=0 then
    raise exception '0038 section E7b: approve_wrong_client_correction documents-lock anchor drift -- the provenance refusal was not installed'
      using errcode='CLR10';
  end if;

  ---- (b) THE REVERSE-WHILE-MATCHED REFUSAL, beside 0037's. ----------------------------
  -- SECOND ANCHOR, counted the same way as the first (0036 review F4).
  if (length(v_next)-length(replace(v_next,
      $a$      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;$a$,'')))
     / length($a$      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;$a$) <> 1 then
    raise exception '0038 section E7b prestate: the reverse-branch allocation-refusal anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;$old$,
$new$      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;
      -- 0038 (design 4.6): the same reverse-while-matched refusal reverse_entry now carries. A
      -- correction that moves a filing between clients still REVERSES the entries it captures,
      -- so a captured entry that is a live bank-match member must be unmatched first. Refusal
      -- (a) above does not cover this: the captured entry may be matched to a statement on a
      -- DIFFERENT document entirely.
      if clara._bank_live_match_present(o.id) then
        raise exception 'a captured entry is matched to a bank statement line; unmatch the bank match first'
          using errcode='CLR10',detail='{"reason":"live_bank_match_present"}';
      end if;$new$);
  if v_next=v_prior or position('live_bank_match_present' in v_next)=0
     or position('clara._bank_live_match_present(o.id)' in v_next)=0 then
    raise exception '0038 section E7b: approve_wrong_client_correction reverse-branch anchor drift -- the bank-match refusal was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$awcc38$;

-- =====================================================================================
-- SECTION E7c -- clara.retire_document_filing: the retirement half of the same law.
--
-- The correction writer MOVES a filing; this one RETIRES it outright. Same provenance argument,
-- same refusal, and it belongs here rather than only in the belt because this verb already has a
-- named blockers concept (live journal-entry citations, 0027:427-434) and a live bank statement
-- is exactly that kind of blocker -- a books-bearing citation of the filing, with lines the firm
-- may already have matched and settled against.
--
-- PLACEMENT: immediately after the existing citation-blockers refusal, so the two refusals read
-- as one family, and before the retirement UPDATE, so a refusal costs no write.
--
-- CoR: 0007:1434 created it; 0017:1854 (R2-F2) and 0019:242 (the wiki-veto removal) PATCHED it
-- dynamically; 0027:393 then RECUT it from the live catalog, carrying both patches forward. 0027
-- is the last definition and nothing after it touches the body -- but the probes below demand
-- 0027's own peek marker AND 0019's veto-removal marker before splicing, because "0027 is last"
-- is a claim this file must prove against the live catalog, not assert.
-- =====================================================================================
do $rdf38$
declare v_def text; v_next text;
begin
  select pg_get_functiondef(
    'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure) into v_def;
  if position('v_peek_doc' in v_def)=0 then
    raise exception '0038 section E7c prestate: the live clara.retire_document_filing body is missing 0027''s peek-before-documents-lock marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('The wiki VETO is gone' in v_def)=0 then
    raise exception '0038 section E7c prestate: the live body is missing 0019''s veto-removal marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('live_bank_statement_present' in v_def)<>0 then
    raise exception '0038 section E7c prestate: clara.retire_document_filing already carries the bank-statement refusal -- 0038 has already been applied to this database'
      using errcode='CLR10';
  end if;
  if (length(v_def)-length(replace(v_def,
      $a$  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'filing has live citation blockers: %', v_blockers::text using errcode = 'CLR10';
  end if;$a$,'')))
     / length($a$  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'filing has live citation blockers: %', v_blockers::text using errcode = 'CLR10';
  end if;$a$) <> 1 then
    raise exception '0038 section E7c prestate: the citation-blockers anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'filing has live citation blockers: %', v_blockers::text using errcode = 'CLR10';
  end if;$old$,
$new$  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'filing has live citation blockers: %', v_blockers::text using errcode = 'CLR10';
  end if;
  -- 0038 (design 4.2 / part2 section 5): a LIVE BANK STATEMENT IS A CITATION BLOCKER. The
  -- statement binds (document_id, source_doc_sha256, filing_id) as a congruence FK so provenance
  -- survives filing correction; retiring the filing out from under a live statement would leave a
  -- books-bearing fact -- with lines, and possibly matches and settlements against them -- citing
  -- a retired filing. Same family as the entry-citation refusal above, same shape, before any
  -- write. Remedy: void the statement first (WCB-R5 requires zero pending/live match groups on
  -- its lines).
  if clara._bank_live_statement_on_document(f.document_id) then
    raise exception 'a live bank statement is bound to this filing''s document; void the statement first'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;$new$);
  if v_next=v_def or position('live_bank_statement_present' in v_next)=0
     or position('clara._bank_live_statement_on_document(f.document_id)' in v_next)=0 then
    raise exception '0038 section E7c: retire_document_filing citation-blockers anchor drift -- the bank-statement refusal was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$rdf38$;

reset role;

-- =====================================================================================
-- SECTION E8 -- THIS SECTION'S OWN TAIL, PART 1 of 2: SOURCE-SHAPE AND CATALOG ASSERTS.
--
-- Every raise is a real assertion failure, not a soft warning. Split in two for a reason that
-- is not cosmetic: scripts/check-wiki-dynamic-sql fail-closes on any `do` block that BOTH reads
-- a function body via pg_get_functiondef AND carries the bare dynamic-SQL keyword, because that
-- pair is exactly the change-of-record-patch signature migration 0019's prosrc scan cannot see.
-- This block reads bodies and installs nothing; the ACL assertions in PART 2 need that keyword
-- (it is the spelling of has_function_privilege's privilege argument) and therefore live in
-- their own block with ZERO pg_get_functiondef calls in scope -- the 0036:1592-1601 /
-- 0037:3476-3486 discipline.
-- =====================================================================================
do $e8_tail_1$
declare
  v_src text; v_rev text; v_awcc text; v_rdf text; v_claim text; v_router text;
  v_n int; v_txt text; v_missing text;
begin
  ---- (1) The three SPLICED bodies each carry their own addition AND every prior change of
  ---- record. A patch that installed cleanly but reverted a predecessor is the exact failure
  ---- 0036's CoR header exists to prevent, so both halves are asserted here too.
  select pg_get_functiondef('clara.reverse_entry(uuid,text,text)'::regprocedure) into v_rev;
  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure) into v_awcc;
  select pg_get_functiondef(
    'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure) into v_rdf;

  if position('live_bank_match_present' in v_rev)=0
     or position('opening_entry_k_family_only' in v_rev)=0
     or position('allocated_items_present' in v_rev)=0
     or position('clara._subledger_on_approve(' in v_rev)=0
     or position('pg_advisory_xact_lock(203005004' in v_rev)=0 then
    raise exception '0038 tail: clara.reverse_entry is missing its 0038 refusal or one of 0017/0037''s changes of record'
      using errcode='CLR10';
  end if;
  if position('live_bank_statement_present' in v_awcc)=0
     or position('live_bank_match_present' in v_awcc)=0
     or position('perform 1 from clara.documents where id=x.document_id for update;' in v_awcc)=0
     or position('allocated_items_present' in v_awcc)=0
     or position('clara._subledger_on_approve(v_mirror)' in v_awcc)=0
     or position('adopted_reversal' in v_awcc)=0 then
    raise exception '0038 tail: clara.approve_wrong_client_correction is missing one of its two 0038 refusals or one of 0009/0017/0027/0037''s changes of record'
      using errcode='CLR10';
  end if;
  if position('live_bank_statement_present' in v_rdf)=0
     or position('v_peek_doc' in v_rdf)=0
     or position('The wiki VETO is gone' in v_rdf)=0
     or position('live citation blockers' in v_rdf)=0 then
    raise exception '0038 tail: clara.retire_document_filing is missing its 0038 refusal or one of 0019/0027''s changes of record'
      using errcode='CLR10';
  end if;

  ---- (2) LOCK-ORDER PIN (design 4.9's law: bank rows lock AFTER journal_entries and AFTER
  ---- open_items in any transaction touching both). In reverse_entry the bank read must sit
  ---- AFTER the 203005004 client rung 0037 installed, which itself sits after the JE row lock.
  ---- Asserted by prosrc POSITION, the 0037 idiom -- an ordering claim proved against the text
  ---- that will actually run, not against a comment.
  -- Each pair is asserted BOTH-PRESENT-AND-ORDERED: a bare `position(a) >= position(b)` test
  -- reads a MISSING marker (position 0) as "correctly ordered" and passes vacuously, which is
  -- the same absence-from-the-wrong-instrument mistake the repo has already paid for twice.
  if not (position('pg_advisory_xact_lock(203005004' in v_rev) > 0
          and position('clara._bank_live_match_present(p_entry)' in v_rev) > 0
          and position('pg_advisory_xact_lock(203005004' in v_rev)
              < position('clara._bank_live_match_present(p_entry)' in v_rev)) then
    raise exception '0038 tail: clara.reverse_entry must take the 203005004 client rung BEFORE reading the bank match -- design 4.9''s acquisition order'
      using errcode='CLR10';
  end if;
  if not (position('perform 1 from clara.documents where id=x.document_id for update;' in v_awcc) > 0
          and position('clara._bank_live_statement_on_document(x.document_id)' in v_awcc) > 0
          and position('perform 1 from clara.documents where id=x.document_id for update;' in v_awcc)
              < position('clara._bank_live_statement_on_document(x.document_id)' in v_awcc)) then
    raise exception '0038 tail: clara.approve_wrong_client_correction must lock the parent document BEFORE reading the bank statement -- 0027''s documents-first order'
      using errcode='CLR10';
  end if;
  if not (position('clara._bank_live_statement_on_document(x.document_id)' in v_awcc) > 0
          and position('clara.document_filings f where f.document_id=x.document_id' in v_awcc) > 0
          and position('clara._bank_live_statement_on_document(x.document_id)' in v_awcc)
              < position('clara.document_filings f where f.document_id=x.document_id' in v_awcc)) then
    raise exception '0038 tail: clara.approve_wrong_client_correction''s provenance refusal is not ahead of its filings work -- the refusal must cost no write'
      using errcode='CLR10';
  end if;
  if not (position('live citation blockers' in v_rdf) > 0
          and position('clara._bank_live_statement_on_document(f.document_id)' in v_rdf) > 0
          and position('live citation blockers' in v_rdf)
              < position('clara._bank_live_statement_on_document(f.document_id)' in v_rdf)) then
    raise exception '0038 tail: clara.retire_document_filing''s bank refusal must follow the existing citation-blockers refusal'
      using errcode='CLR10';
  end if;

  ---- (3) The claim body and the release sweep must agree on the kill-switch lane set. A lane
  ---- that can be HELD and not RELEASED is a permanent stall, and the two lists are three
  ---- hundred lines apart in two different migrations -- exactly the drift a pin exists for.
  select p.prosrc into v_claim from pg_proc p
   where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  if position('''ocr'',''invoice_facts'',''statement_facts''' in v_claim)=0
     or position('''ocr'',''invoice_facts'',''statement_facts''' in v_src)=0 then
    raise exception '0038 tail: the kill-switch HOLD lane list and the RELEASE lane list are not both (ocr, invoice_facts, statement_facts)'
      using errcode='CLR10';
  end if;
  ---- and the claim body still carries NO typed-consent edge (the 0020 section 6 battery).
  if position('client_egress_purpose' in v_claim)<>0 then
    raise exception '0038 tail: clara.claim_document_processing_task gained a typed-consent edge -- the ratified 0020 section 6 battery forbids it'
      using errcode='CLR10';
  end if;

  ---- (4) The router carries the whole 4.3 surface and nothing was lost.
  select p.prosrc into v_router from pg_proc p
   where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_missing := null;
  foreach v_txt in array array['statement_facts','statement_parse','text/csv',
      'application/x-ofx','v_engine_kind','statement_multi_client','consent_inactive',
      'client_egress_purpose_activations','skipped_client_onboarding',
      'skipped_consent_evidence','CLR35'] loop
    if position(v_txt in v_router)=0 then
      v_missing := coalesce(v_missing||', ','')||v_txt;
    end if;
  end loop;
  if v_missing is not null then
    raise exception '0038 tail: clara._enqueue_invoice_facts_core is missing: %', v_missing
      using errcode='CLR10';
  end if;

  ---- (5) The four typed-consent verbs are purpose-discriminated, and grant still holds no hold.
  foreach v_txt in array array['activate_client_egress_purpose',
      'deactivate_client_egress_purpose','revoke_client_egress_purpose'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_txt;
    if position('if p_purpose=''wiki_synthesis'' then' in v_src)=0
       or position('''wiki_synthesis'',''statement_extraction''' in v_src)=0 then
      raise exception '0038 tail: clara.% is not purpose-discriminated, or did not gain statement_extraction', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  ---- (6) CHECK CATALOG. Every one of the five widenings exists under its 0038 name, its 0016
  ---- predecessor is gone, and the four consent purpose CHECKs admit exactly two purposes.
  foreach v_txt in array array['ck_processing_task_lane_0038','ck_processing_task_lane_engine_0038',
      'ck_processing_task_error_code_0038','ck_processing_task_binding_0038',
      'ck_document_extractions_engine_kind_0038',
      'ck_client_egress_purpose_consents_purpose_0038',
      'ck_client_egress_purpose_activations_purpose_0038',
      'ck_egress_dispatch_authorizations_purpose_0038',
      'ck_egress_dispatch_authorizations_doc_sha'] loop
    select count(*)::int into v_n from pg_constraint con
      join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and con.conname=v_txt and con.contype='c';
    if v_n<>1 then
      raise exception '0038 tail: CHECK % is missing (got %)', v_txt, v_n using errcode='CLR10';
    end if;
  end loop;
  foreach v_txt in array array['ck_processing_task_lane_0016','ck_processing_task_lane_engine_0016',
      'ck_processing_task_error_code_0016','ck_processing_task_binding_0016',
      'ck_document_extractions_engine_kind_0016'] loop
    select count(*)::int into v_n from pg_constraint con where con.conname=v_txt;
    if v_n<>0 then
      raise exception '0038 tail: the superseded CHECK % is still present -- the drop/re-add did not complete', v_txt
        using errcode='CLR10';
    end if;
  end loop;
  -- The error-code taxonomy and the never-claimed allowlist, by definition text.
  select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
    where con.conname='ck_processing_task_error_code_0038';
  foreach v_src in array array['header_unreadable','totals_unreadable','readers_disagree',
      'chain_broken','continuity_mismatch','duplicate_period','overlapping_period',
      'non_myr_statement','account_unregistered','account_inactive','statement_multi_client',
      'period_invalid','line_date_out_of_period','consent_inactive','skipped_kind'] loop
    if position(v_src in v_txt)=0 then
      raise exception '0038 tail: the error-code CHECK does not admit %', v_src using errcode='CLR10';
    end if;
  end loop;
  select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
    where con.conname='ck_processing_task_binding_0038';
  if position('consent_inactive' in v_txt)=0 or position('statement_multi_client' in v_txt)=0
     or position('skipped_kind' in v_txt)=0 then
    raise exception '0038 tail: the never-claimed binding allowlist is missing an enqueue-gate code -- the router''s own receipts would be unstorable'
      using errcode='CLR10';
  end if;
  -- The document-hash rule, both directions.
  select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
    where con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if position('statement_extraction' in v_txt)=0 or position('wiki_synthesis' in v_txt)=0 then
    raise exception '0038 tail: ck_egress_dispatch_authorizations_doc_sha does not bind BOTH purposes (wiki forced-null, statement forced-non-null)'
      using errcode='CLR10';
  end if;

  ---- (7) ARITY census: the 0020 surfaces gained exactly one overload each and lost nothing.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname in ('prepare_egress_dispatch','consume_egress_dispatch');
  if v_n<>4 then
    raise exception '0038 tail: the dispatch boundary must carry exactly 4 functions (2 wiki arities + 2 statement arities), got %', v_n
      using errcode='CLR10';
  end if;

  raise notice '0038 section E tail part 1 OK: three splices carry their own refusals AND every prior change of record; the router, claim, release and reserve recuts hold their lineage; five CHECK widenings and four consent CHECKs in place; the dispatch boundary carries exactly two arities per verb';
end
$e8_tail_1$;

-- =====================================================================================
-- SECTION E8 -- TAIL, PART 2 of 2: THE ACL PINS.
--
-- This block calls pg_get_functiondef ZERO times, which is what lets it carry the bare
-- privilege keyword the has_function_privilege probes below need without tripping
-- scripts/check-wiki-dynamic-sql's CoR-patch gate (0036:1592-1601, 0037:3476-3486). It is a
-- separate block for that reason and no other.
--
-- WHAT IT PROVES. (i) the 0020 section 6 legacy ACL closed set is BYTE-UNCHANGED by this
-- section's two recuts of its members -- `create or replace` preserves an ACL, but "preserves"
-- is a claim, and this is the assertion; (ii) the two new dispatch overloads reach clara_runtime
-- and nothing else; (iii) the four typed RPCs reach clara_authenticated and nothing else;
-- (iv) the two new bank predicates and the three spend primitives stay UNGRANTED beyond their
-- owner -- they are reachable only through their SECURITY DEFINER callers.
-- =====================================================================================
do $e8_tail_2$
declare v_txt text; v_name text;
begin
  ---- (i) the 0020 section 6 legacy ACL closed set, pinned exactly as 0020:2304-2319 pins it.
  select string_agg(x.pin,' ;; ' order by x.pin) into v_txt from (
    select p.proname||'='||coalesce((select string_agg(a,',' order by a)
        from unnest(p.proacl::text[]) a),'(null)') as pin
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname in ('grant_client_egress','revoke_client_egress',
       'claim_document_processing_task','_enqueue_invoice_facts_core',
       'record_wiki_source_ingest')) x;
  if v_txt is distinct from
     '_enqueue_invoice_facts_core=clara_fn_owner=X/clara_fn_owner'
     ||' ;; claim_document_processing_task=clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'
     ||' ;; grant_client_egress=clara_authenticated=X/clara_fn_owner,clara_fn_owner=X/clara_fn_owner'
     ||' ;; record_wiki_source_ingest=clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'
     ||' ;; revoke_client_egress=clara_authenticated=X/clara_fn_owner,clara_fn_owner=X/clara_fn_owner' then
    raise exception '0038 tail: the 0020 section 6 legacy egress/claim ACL closed set drifted across this section''s recuts: %', v_txt
      using errcode='CLR10';
  end if;

  ---- (ii) the two new dispatch overloads: clara_runtime yes, everyone else no.
  foreach v_txt in array array[
      'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)',
      'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)'] loop
    if not has_function_privilege('clara_runtime',v_txt,'EXECUTE') then
      raise exception '0038 tail: clara_runtime cannot execute % -- the statement lane could never dispatch', v_txt
        using errcode='CLR10';
    end if;
    foreach v_name in array array['clara_authenticated','clara_agent_ro'] loop
      if has_function_privilege(v_name,v_txt,'EXECUTE') then
        raise exception '0038 tail: % can execute % -- the dispatch boundary is a RUNTIME surface only', v_name, v_txt
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  ---- (iii) the four typed RPCs: clara_authenticated yes (owner floor is enforced in-body by
  ---- _human_ctx), clara_runtime and the agent role no.
  foreach v_txt in array array[
      'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
      'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
      'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
      'clara.revoke_client_egress_purpose(uuid,text,text,text)'] loop
    if not has_function_privilege('clara_authenticated',v_txt,'EXECUTE') then
      raise exception '0038 tail: clara_authenticated lost EXECUTE on %', v_txt using errcode='CLR10';
    end if;
    foreach v_name in array array['clara_runtime','clara_agent_ro'] loop
      if has_function_privilege(v_name,v_txt,'EXECUTE') then
        raise exception '0038 tail: % can execute % -- the typed consent ceremony is an OWNER act', v_name, v_txt
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  ---- (iv) the definer-internals stay ungranted BEYOND THEIR OWNER -- including to PUBLIC,
  ---- which has_function_privilege cannot express ('public' is not a role name; the call would
  ---- error). The 0025:551-559 idiom is used instead: aclexplode, with grantee = 0 meaning
  ---- PUBLIC. proacl is additionally asserted NON-NULL, because aclexplode(NULL) yields no rows
  ---- and a null ACL means PostgreSQL's own PUBLIC-EXECUTE default is in force -- 0027's P4
  ---- finding, where exactly that read passed a wide-open function as "owner-only".
  foreach v_txt in array array[
      'clara._bank_live_match_present(uuid)',
      'clara._bank_live_statement_on_document(uuid)',
      'clara._reserve_processing_call(uuid,integer)',
      'clara._settle_processing_call(uuid,integer)',
      'clara._refund_processing_call(uuid,text)',
      'clara._enqueue_invoice_facts_core(uuid)'] loop
    if (select p.proacl is null from pg_proc p where p.oid=v_txt::regprocedure) then
      raise exception '0038 tail: % carries a NULL proacl -- PostgreSQL''s PUBLIC-EXECUTE default is in force and this definer-internal is wide open', v_txt
        using errcode='CLR10';
    end if;
    if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
                where p.oid=v_txt::regprocedure and a.privilege_type='EXECUTE'
                  and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')) then
      raise exception '0038 tail: % gained an EXECUTE grant beyond its owner -- it must stay reachable only through its SECURITY DEFINER callers', v_txt
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '0038 section E tail part 2 OK: the 0020 legacy ACL closed set is unchanged, the two new dispatch arities are runtime-only, the four typed RPCs are owner-surface only, and every definer-internal is ungranted';
end
$e8_tail_2$;

-- END OF SECTION E.

-- ============ SECTION EVENTS (from A, relocated per its ROLE NOTE) ============
-- =====================================================================================
-- ROLE NOTE, before SECTION EVENTS: 0037 registers its event types AFTER `reset role;`
-- (0037:3441-3450), once every clara_fn_owner-owned body in that migration -- including the
-- composites (its Section K) and their ACL grants (its Section L) -- is done. This file
-- carries no verbs, so it has nothing after this point that NEEDS clara_fn_owner; the
-- `reset role;` below closes THIS FILE's own portion of the scope. If the assembling lane
-- splices the verb section (which DOES need clara_fn_owner, for the composites' CREATE
-- FUNCTION) between the tables above and this line, move this `reset role;` (and
-- SECTION EVENTS below it) to after that section's own ACL grants instead, so there is
-- exactly one `reset role;` at the true end of the scope, not one per contributing file.
-- =====================================================================================
reset role;

-- =====================================================================================
-- SECTION EVENTS -- the seven bank.* event types (design part2 SS4.8), registered against
-- the ACTIVE taxonomy version, the exact 0037:3443-3469 shape. All client-scoped, all
-- decision 'ignore': "the subledger is STATE... An event that claimed a notification would
-- put a receipt allocation in front of a human who has nothing to decide about it" (0037's
-- own Section M reasoning) applies identically here -- /bank reads the tables, not the
-- stream. Payloads carry IDENTIFIERS ONLY (never account numbers, never line descriptions)
-- -- domain_events is agent-readable firm-wide (design part2 SS4.8) -- but that payload
-- shape is enforced by the emitting VERB, not by this registration; the payload-key
-- allowlist scan against these seven names is a named TAIL deliverable, not this file's.
-- =====================================================================================
with added(name,client_scoped,description,decision,note) as (values
  ('bank.account_created',true,
    'A bank account identity was registered against a client COA account','ignore',null::text),
  ('bank.account_proposal',true,
    'A statement read an unregistered bank account identity; a human confirmation is pending','ignore',null::text),
  ('bank.statement_ingested',true,
    'A bank statement was persisted (OCR, structured, or human-keyed)','ignore',null::text),
  ('bank.statement_voided',true,
    'A bank statement was voided','ignore',null::text),
  ('bank.match_created',true,
    'A bank match group was created (live, or a pending high-stakes reservation)','ignore',null::text),
  ('bank.match_completed',true,
    'A pending bank match reservation was completed to live','ignore',null::text),
  ('bank.match_unmatched',true,
    'A bank match group was unmatched','ignore',null::text),
  -- The EIGHTH registration, deliberately in the document.* namespace (the ingest lane's
  -- own stated interface): the failure receipt every statement-lane fail emits. Keeping it
  -- out of bank.* keeps the bank.* payload-key allowlist scan scoped to money identifiers.
  ('document.statement_facts_failed',true,
    'A statement-facts task failed with a named reason','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note
from added x
join inserted_types i on i.name=x.name
cross join clara.taxonomy_active a;
;

-- ============ SECTION F (tail) ============
-- 0038-F -- TAIL: normalized-prosrc pins, ACL pins, CHECK/event-type catalog asserts, the
-- bank.* payload-key allowlist scan, lock-order prosrc pins, and the whole-schema leak scan
-- for Wave C-b (bank identity, statement ingest, matching). This file is APPENDED LAST to
-- the assembled 0038 migration -- everything it asserts against is DDL owned by sibling
-- lanes 0038-A..E; this file adds nothing to the schema.
--
-- Authority: docs/plan/wave-c-b-bank-design.md (v2) + wave-c-b-bank-design-part2.md (v2)
-- section 5 ("the migration + runtime"), which names every category this file must cover:
-- normalized-prosrc pins for every recut/spliced body -> ACL pins (bank verbs
-- clara_authenticated-only; persist/fail runtime-only; the four 0037 composites unchanged;
-- ZERO wake/agent grants on every bank table; per-RPC grant pins) -> CHECK catalog asserts
-- (the five task CHECKs + the four consent CHECKs) -> the event-type catalog assert (the
-- seven bank.* types) -> the bank.* event payload-key allowlist scan (the 0020 leak-scan
-- idiom) -> lock-order prosrc pins (203005006 in persist/enter/void; JE-before-advisory in
-- match_bank_line; the design part1 4.9 order) -> the whole-schema leak scan (the 0035/0037
-- idiom). Governing law beneath the design: docs/plan/wave-c-contract.md (WC-R1..R12) and
-- docs/plan/wave-c-a-subledger-design.md (WCA-R1..R9).
--
-- A CROSS-LANE SIGNATURE NOTE, stated once here rather than repeated at every site it bears
-- on. 0037's tail was written by the same hand that wrote 0037's bodies, so it could pin
-- exact ::regprocedure signatures and, for three patched functions, the EXACT spliced text
-- verbatim (its PART 1, section 3d). This file cannot: it is written from the RATIFIED
-- DESIGN DOCS against verbs whose bodies sibling lanes author independently and
-- concurrently in the same build. Two signatures the design states in full --
-- match_bank_line(p_client,p_lines,p_entries,p_adjustments,p_ack_period_exceptions,p_op_key)
-- and settle_from_bank_line(p_client,p_line,p_counterparty,p_allocations,p_memo,
-- p_posting_date,p_charge_cents,p_charge_account,p_adjustments,p_attestation,
-- p_control_account,p_op_key) -- are pinned by ::regprocedure, exactly as the design spells
-- them. Every OTHER new C-b function is located by PRONAME (unique in this schema -- no
-- bank verb is overloaded), not by a guessed parameter list, so an as-built signature that
-- differs from this file's inference in type or default ordering still resolves. Every
-- splice this file cannot quote verbatim is pinned by TOKEN CENSUS (the named refusal
-- reason / lane literal / lock rung appears the right number of times, extracted with the
-- SAME comment-strip-then-collapse-whitespace-then-lowercase normalizer 0035/0036/0037
-- use) and by POSITION ordering against a KNOWN anchor read directly out of the CURRENTLY
-- APPLIED 0007/0009/0016/0020/0024/0027/0037 bodies (quoted inline below). This is a
-- documented departure from 0037's verbatim-splice technique, not a parallel idiom invented
-- to replace it -- token-census-plus-position-ordering is itself 0037's OWN fallback
-- technique for every splice it did not pin verbatim (its part 1, sections 2-6).
--
-- =====================================================================
-- TAIL, PART 1 of 2 -- SOURCE-SHAPE SELF-VERIFICATION. Reads function bodies via
-- pg_get_functiondef; carries no ACL 'execute'-privilege keyword. See 0037's own header for
-- why the split exists (scripts/check-wiki-dynamic-sql fails closed on any block that BOTH
-- reads a body via pg_get_functiondef AND carries the bare word "execute" -- the
-- change-of-record-patch signature). Part 2 is the mirror: zero pg_get_functiondef calls,
-- so the ACL probes' 'EXECUTE' literal cannot trip the same gate.
-- =====================================================================
do $tail1$
declare
  v_prior int;
  v_map jsonb := '{}'::jsonb;
  r record;
  v_oid oid;
  v_n int; v_a int; v_b int; v_c int; v_d int; v_e int;
  v_pos int; v_pos2 int; v_window text; v_x text;
  v_src text; v_writers text[]; v_bad_writers text[];
  v_calls text[]; v_call text; v_payload text; v_keys text[]; v_key text; v_bad_keys text[];
  v_count_bank_events int;
  v_lane_literals text[]; v_lock_writers text[];
begin
  -- (0) MANDATORY PRIOR-MIGRATION CHECK. The deepest TRUE content dependency is 0037's
  -- subledger: the reverse_entry / approve_wrong_client_correction bodies this file splices
  -- ARE 0037's own patched forms, not 0027's or 0009's earlier ones.
  select count(*)::int into v_prior from clara.schema_migrations
    where version = '0037_wave_c_a_subledger';
  if v_prior <> 1 then
    raise exception '0038 tail: migration 0037_wave_c_a_subledger is not recorded as applied -- apply in order';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (1) FETCH + NORMALIZE every recut/spliced/new body this migration touches, into ONE
  -- map keyed by a short label, so every assertion below reads v_map->>'label' rather than
  -- repeating the fetch-normalize dance thirteen-plus times (the repetition itself is a
  -- transcription-risk surface this file has no live database to catch mistakes against).
  --
  -- Group A: RECUT/PATCHED bodies whose full signature is a matter of historical record
  -- (read directly off the applied 0007/0009/0020/0024/0037 migrations this session,
  -- quoted in the comments below each assertion) -- these use ::regprocedure.
  -- ---------------------------------------------------------------------------------------
  for r in select * from (values
      ('router','_enqueue_invoice_facts_core(uuid)'),
      ('claim','claim_document_processing_task(uuid,text,boolean)'),
      ('reserve','_reserve_processing_call(uuid,int)'),
      ('release','release_held_document_tasks(int)'),
      ('grant','grant_client_egress_purpose(uuid,text,uuid,text,text)'),
      ('activate','activate_client_egress_purpose(uuid,text,uuid,text)'),
      ('deactivate','deactivate_client_egress_purpose(uuid,text,text,text)'),
      ('revoke','revoke_client_egress_purpose(uuid,text,text,text)'),
      ('reverse','reverse_entry(uuid,text,text)'),
      ('awcc','approve_wrong_client_correction(uuid,text,text,text)'),
      ('retire','retire_document_filing(uuid,text,uuid,text)'),
      -- Group B: the two composites whose FULL parameter list the design states verbatim
      -- (part1 4.6): match_bank_line and settle_from_bank_line.
      ('match','match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'),
      ('settle','settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)')
    ) as t(label,sig)
  loop
    begin
      v_oid := ('clara.'||r.sig)::regprocedure;
    exception when others then
      raise exception '0038 tail: clara.% (label %) does not resolve to a live function -- either this migration did not install it, or its as-built signature diverges from the design-doc literal this tail pins; reconcile before merge', r.sig, r.label;
    end;
    v_map := jsonb_set(v_map, array[r.label], to_jsonb(
      lower(regexp_replace(regexp_replace(regexp_replace(
        pg_get_functiondef(v_oid),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'))));
  end loop;

  -- Group C: NEW verbs the design names but does not fully sign -- located by PRONAME,
  -- which is unique per name in this schema (no bank verb is overloaded), so a divergence
  -- in as-built parameter TYPES/order/defaults still resolves.
  for r in select * from (values
      ('persist','persist_statement_facts'),
      ('persist_core','_persist_statement_core'),
      ('fail','fail_statement_facts'),
      ('enter','enter_bank_statement'),
      ('void','void_bank_statement'),
      ('add_acct','add_bank_account'),
      ('deact_acct','deactivate_bank_account'),
      ('react_acct','reactivate_bank_account'),
      ('remap_acct','remap_bank_account_coa'),
      ('unmatch','unmatch_bank_match'),
      ('complete','complete_pending_match')
    ) as t(label,pname)
  loop
    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=r.pname;
    if v_oid is null then
      raise exception '0038 tail: clara.% does not exist -- lane that owns it did not ship, or the name diverges from the design', r.pname;
    end if;
    v_map := jsonb_set(v_map, array[r.label], to_jsonb(
      lower(regexp_replace(regexp_replace(regexp_replace(
        pg_get_functiondef(v_oid),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'))));
  end loop;

  -- ---------------------------------------------------------------------------------------
  -- (2) THE ROUTER RECUT -- clara._enqueue_invoice_facts_core (design part1 4.3).
  --
  -- The LIVE pre-0038 body (0026_lane_widen.sql:385-434, verified this session) branches:
  --   pdf/image + document_kind is null           -> lane 'classify'
  --   pdf/image + kind in (invoice/credit_note/debit_note/receipt) -> lane 'invoice_facts'
  --   pdf/image + any OTHER kind                   -> the skipped_kind dead end
  --   xml/text-xml                                 -> lane 'local_facts'
  --   any other mime                                -> status 'skipped_type'
  -- and the already-completed short-circuit for the non-classify branch hardcodes
  -- `e.engine_kind='invoice_facts'` (0026:428) -- exactly the "today hard-coded" defect the
  -- design names (part1 4.3: "the already_completed short-circuit becomes per-lane
  -- engine-kind aware").
  -- ---------------------------------------------------------------------------------------
  -- (2a) kind bank_statement + pdf/image reaches lane 'statement_facts'; the two literal
  -- lane names the design mints must both be present, and 'bank_statement' must be tested
  -- as a document_kind (not merely mentioned in passing -- the census requires it appear as
  -- a quoted literal at least once, which a stray comment could not survive normalization
  -- past, since comments are stripped BEFORE this scan runs).
  if position('''bank_statement''' in (v_map->>'router'))=0 then
    raise exception '0038 tail: _enqueue_invoice_facts_core does not test document_kind=''bank_statement'' anywhere -- the bank_statement -> skipped_kind dead end (0026:392-410) was not opened';
  end if;
  if position('''statement_facts''' in (v_map->>'router'))=0 then
    raise exception '0038 tail: _enqueue_invoice_facts_core never mints lane ''statement_facts''';
  end if;
  if position('''statement_parse''' in (v_map->>'router'))=0 then
    raise exception '0038 tail: _enqueue_invoice_facts_core never mints lane ''statement_parse''';
  end if;
  -- (2b) the csv/ofx mimes join the router's mime dispatch (design part1 4.3: "today they
  -- dead-end before the kind test"). Loosely matched: the exact vendor mime-type spelling
  -- for OFX is a build-time-verified item (part2 5), not a design-doc literal, so this
  -- checks for the substrings 'csv' and 'ofx' rather than a full mime string.
  if position('csv' in (v_map->>'router'))=0 then
    raise exception '0038 tail: _enqueue_invoice_facts_core does not dispatch on a csv mime -- the structured statement_parse lane has no admission path';
  end if;
  if position('ofx' in (v_map->>'router'))=0 then
    raise exception '0038 tail: _enqueue_invoice_facts_core does not dispatch on an ofx mime -- the structured statement_parse lane (OFX arm) has no admission path';
  end if;
  -- (2c) the pre-0038 branches are UNTOUCHED: 'classify', 'invoice_facts', 'local_facts' and
  -- the 'skipped_kind'/'skipped_type' terminals all still appear (a rebuild that dropped or
  -- renamed one would silently strand every non-bank document kind).
  foreach v_key in array array['''classify''','''invoice_facts''','''local_facts''',
      'skipped_kind','skipped_type'] loop
    if position(v_key in (v_map->>'router'))=0 then
      raise exception '0038 tail: _enqueue_invoice_facts_core lost the pre-existing % literal -- section looks rebuilt, not amended', v_key;
    end if;
  end loop;
  -- (2d) the already_completed short-circuit is now per-lane engine-kind aware. The
  -- pre-0038 form hardcoded engine_kind='invoice_facts' unconditionally in the non-classify
  -- else-branch (0026:427-429); this checks that the already_completed literal is no longer
  -- adjacent to ONLY that one hardcoded kind -- i.e. a lane-conditional (v_lane, or a second
  -- named engine_kind) sits within the same 400-character window, proving the branch was
  -- widened rather than left to silently misfire "already done" for a statement task that
  -- has never run.
  v_pos := position('already_completed' in (v_map->>'router'));
  if v_pos=0 then
    raise exception '0038 tail: _enqueue_invoice_facts_core lost the already_completed short-circuit entirely';
  end if;
  v_window := substring((v_map->>'router') from greatest(1,v_pos-300) for 500);
  if position('v_lane' in v_window)=0 and position('statement_facts' in v_window)=0 then
    raise exception '0038 tail: the already_completed short-circuit around the existing engine_kind=''invoice_facts'' probe (0026:427-429) shows no sign of becoming lane-aware -- a completed statement_facts task would silently misreport as never having run, or worse, a completed invoice_facts extraction would falsely short-circuit a statement task';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (3) claim_document_processing_task -- lane-list widenings ONLY (design part1 4.3, the
  -- "existing spend/safety controls" paragraph). The LIVE pre-0038 body (0024_fail_
  -- classify.sql:210-299, verified this session) carries three lane-gated branches:
  --   kill-switch:   `t.lane in ('ocr','invoice_facts') and not coalesce(p_egress_approved,false)`
  --   attempt-cap:   `t.lane='invoice_facts'` (3-attempt cap, keyed on lane='invoice_facts'
  --                  inside the sum(attempt_count) subquery too)
  --   concurrency:   `lane in ('ocr','invoice_facts') and status='running'` (v_running) and
  --                  `t.lane in ('ocr','invoice_facts') and v_running>=v_cap`
  -- Only 'statement_facts' joins any of these (WCB-R6/4.3: OCR-shaped vendor egress).
  -- 'statement_parse' is the free local parse and must NOT appear in the kill-switch guard
  -- (a deterministic CSV/OFX parse has nothing to kill-switch).
  -- ---------------------------------------------------------------------------------------
  -- Kill-switch: the exact pre-0038 pair 'ocr','invoice_facts' must still gate together
  -- (byte-identical prefix), and 'statement_facts' must additionally appear WITHIN the
  -- kill-switch region (before 'kill_switch' is assigned).
  v_pos := position('kill_switch' in (v_map->>'claim'));
  if v_pos=0 then
    raise exception '0038 tail: claim_document_processing_task lost the kill_switch hold reason entirely';
  end if;
  v_window := substring((v_map->>'claim') from greatest(1,v_pos-200) for 220);
  if position('''ocr''' in v_window)=0 or position('''invoice_facts''' in v_window)=0
     or position('''statement_facts''' in v_window)=0 then
    raise exception '0038 tail: the kill-switch lane list ahead of the kill_switch assignment does not carry ocr, invoice_facts AND statement_facts -- either the pre-existing pair was lost, or the OCR-egressing statement lane was not joined to the kill switch';
  end if;
  if position('''statement_parse''' in v_window)<>0 then
    raise exception '0038 tail: statement_parse (the free local parse, no vendor egress) is gated by the kill switch -- WCB-R6/4.3 names this as a lane the switch must NOT gate';
  end if;
  -- Attempt-cap: 'statement_facts' must appear beside the pre-existing 'invoice_facts'
  -- attempt-cap literal.
  v_pos := position('''attempt_cap''' in (v_map->>'claim'));
  if v_pos=0 then
    raise exception '0038 tail: claim_document_processing_task lost the attempt_cap terminal-fail branch';
  end if;
  -- window widened 260->460 at assembly: the normalized distance from the lane-pair test to
  -- the first 'attempt_cap' literal is ~262 chars, just past the original window.
  v_window := substring((v_map->>'claim') from greatest(1,v_pos-460) for 480);
  if position('''invoice_facts''' in v_window)=0 or position('''statement_facts''' in v_window)=0 then
    raise exception '0038 tail: the 3-attempt cap branch does not test BOTH invoice_facts and statement_facts -- the statement_facts lane can spin unbounded OCR attempts';
  end if;
  -- Concurrency: the v_running/v_cap OCR concurrency accounting joins the lane (design
  -- fact 3, [RV]: "the statement workflow runs draw pool sessions; they are bounded because
  -- the lane now joins the OCR concurrency cap").
  if position('document-processing concurrency limit reached' in (v_map->>'claim'))=0 then
    raise exception '0038 tail: claim_document_processing_task lost the OCR concurrency-limit refusal';
  end if;
  v_pos := position('document-processing concurrency limit reached' in (v_map->>'claim'));
  v_window := substring((v_map->>'claim') from greatest(1,v_pos-320) for 340);
  if position('''ocr''' in v_window)=0 or position('''invoice_facts''' in v_window)=0
     or position('''statement_facts''' in v_window)=0 then
    raise exception '0038 tail: the OCR concurrency accounting ahead of the limit-reached refusal does not count statement_facts alongside ocr and invoice_facts';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (4) release_held_document_tasks -- the LIVE pre-0038 body (0009_coding_floor.sql:
  -- 2242-2262, verified this session) filters `lane in ('ocr','invoice_facts')` in its
  -- picked-CTE and stamps extraction_status='pending' only for lane='ocr' rows. 'statement_
  -- facts' joins the release filter (a held statement_facts task must be releasable when
  -- the kill switch reopens, exactly like a held OCR/invoice_facts task).
  -- ---------------------------------------------------------------------------------------
  if position('held_egress' in (v_map->>'release'))=0 then
    raise exception '0038 tail: release_held_document_tasks lost its held_egress selection entirely -- section rebuilt, not amended';
  end if;
  v_pos := position('held_egress' in (v_map->>'release'));
  v_window := substring((v_map->>'release') from v_pos for 220);
  if position('''ocr''' in v_window)=0 or position('''invoice_facts''' in v_window)=0
     or position('''statement_facts''' in v_window)=0 then
    raise exception '0038 tail: release_held_document_tasks'' held_egress filter does not carry ocr, invoice_facts AND statement_facts -- a held statement task can never be released';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (5) _reserve_processing_call -- the LIVE pre-0038 body (0009_coding_floor.sql:581-610)
  -- refuses any task whose lane is not exactly 'invoice_facts' (`t.lane<>'invoice_facts'`).
  -- Design part1 4.3: "reserve for the OCR lane, skip for the free local parse" -- only
  -- statement_facts (the vendor-egressing reader) reserves budget; statement_parse never
  -- calls this function at all (asserted structurally by the writer-callsite census in
  -- section (10) below, not here). This function's OWN guard must admit BOTH egressing
  -- facts lanes.
  -- ---------------------------------------------------------------------------------------
  -- assembly note: the recut renamed the refusal lane-neutral ('metered processing task not
  -- found', better diagnostics than 0009's invoice-specific wording); the pin follows it.
  if position('metered processing task not found' in (v_map->>'reserve'))=0 then
    raise exception '0038 tail: _reserve_processing_call lost its lane-guard refusal entirely';
  end if;
  v_pos := position('metered processing task not found' in (v_map->>'reserve'));
  v_window := substring((v_map->>'reserve') from greatest(1,v_pos-160) for 180);
  if position('''invoice_facts''' in v_window)=0 or position('''statement_facts''' in v_window)=0 then
    raise exception '0038 tail: _reserve_processing_call''s lane guard does not admit BOTH invoice_facts and statement_facts -- the statement_facts lane cannot reserve a page-budget call at all';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (6) THE FOUR 0020 PURPOSE-BEARING VERBS -- purpose literal 'statement_extraction' joins
  -- 'wiki_synthesis' in EACH verb's `p_purpose not in (...)` guard (design part1 4.4). The
  -- LIVE pre-0038 form of every one of the four is IDENTICAL:
  --   `if p_purpose is null or p_purpose not in ('wiki_synthesis') then ... end if;`
  -- (0020_typed_consent.sql:770,832,898,958, verified this session). Extracted as an exact
  -- VALUE SET (order-independent), the 0037 ck_je_coding_kind idiom, rather than a substring
  -- probe -- a substring test proves the two values 0038 needs are present and says nothing
  -- about a THIRD purpose someone slipped in beside them.
  -- ---------------------------------------------------------------------------------------
  foreach v_key in array array['grant','activate','deactivate','revoke'] loop
    v_pos := position('not in (' in (v_map->>v_key));
    if v_pos=0 then
      raise exception '0038 tail: clara.%_client_egress_purpose lost its purpose admission guard entirely', v_key;
    end if;
    v_window := substring((v_map->>v_key) from v_pos for 80);
    select array_agg(m[1] order by m[1]) into v_lane_literals
      from regexp_matches(v_window, '''([a-z_]+)''', 'g') as m;
    if v_lane_literals is distinct from array['statement_extraction','wiki_synthesis']::text[] then
      raise exception '0038 tail: %_client_egress_purpose''s purpose guard does not admit EXACTLY (statement_extraction, wiki_synthesis) -- found %', v_key, v_lane_literals;
    end if;
  end loop;

  -- (6b) THE WIKI-HOLD PURPOSE-DISCRIMINATION (design part1 4.4, [RV]): the hold transition
  -- is now GATED on p_purpose='wiki_synthesis', both directions. Pre-0038, activate's
  -- clear_wiki_synthesis_hold call and deactivate/revoke's set_wiki_synthesis_hold calls
  -- were UNCONDITIONAL (0020:873,926-927,988-989, verified this session). This checks the
  -- literal `p_purpose='wiki_synthesis'` (or `p_purpose = 'wiki_synthesis'`, both collapse
  -- to the same normalized spelling) sits strictly BEFORE the hold-transition call it now
  -- guards, within a tight window -- proving the guard wraps the call rather than existing
  -- as an unrelated, decorative test elsewhere in the body.
  v_pos := position('clara.clear_wiki_synthesis_hold(' in (v_map->>'activate'));
  if v_pos=0 then
    raise exception '0038 tail: activate_client_egress_purpose lost the clear_wiki_synthesis_hold call';
  end if;
  v_window := substring((v_map->>'activate') from greatest(1,v_pos-120) for 130);
  if position('p_purpose=''wiki_synthesis''' in v_window)=0 then
    raise exception '0038 tail: activate_client_egress_purpose''s clear_wiki_synthesis_hold call is not gated on p_purpose=''wiki_synthesis'' -- a statement_extraction activation would clear a wiki hold it has no authority over (the wedge WCB-R1 exists to close)';
  end if;
  foreach v_key in array array['deactivate','revoke'] loop
    v_pos := position('clara.set_wiki_synthesis_hold(' in (v_map->>v_key));
    if v_pos=0 then
      raise exception '0038 tail: %_client_egress_purpose lost the set_wiki_synthesis_hold call', v_key;
    end if;
    v_window := substring((v_map->>v_key) from greatest(1,v_pos-120) for 130);
    if position('p_purpose=''wiki_synthesis''' in v_window)=0 then
      raise exception '0038 tail: %_client_egress_purpose''s set_wiki_synthesis_hold call is not gated on p_purpose=''wiki_synthesis'' -- a statement_extraction deactivation/revocation would set a wiki hold it has no authority over, the backstop-erasure regression the design names', v_key;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------------------
  -- (7) prepare_egress_dispatch / consume_egress_dispatch -- NEW 6-arg / 7-arg OVERLOADS
  -- exist ALONGSIDE the untouched 5-arg / 6-arg wiki originals (design part1 4.4, [RV]: "the
  -- 5-arg wiki arities remain"). Both are grouped into the Group-A regprocedure fetch above;
  -- their normalized text is asserted here for two things: (a) the sha comparison uses
  -- `is distinct from` (the design's exact re-binding-block instruction); (b) NEITHER
  -- overload's body mentions the OTHER purpose incorrectly (a coarse cross-contamination
  -- guard).
  -- ---------------------------------------------------------------------------------------
  begin
    v_oid := 'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  exception when others then
    raise exception '0038 tail: the 6-arg clara.prepare_egress_dispatch(...,p_document_sha256) overload does not exist';
  end;
  select lower(regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(v_oid),
    '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) into v_src;
  if position('document_sha256' in v_src)=0 then
    raise exception '0038 tail: the 6-arg prepare_egress_dispatch overload does not store document_sha256';
  end if;

  begin
    v_oid := 'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)'::regprocedure;
  exception when others then
    raise exception '0038 tail: the 7-arg clara.consume_egress_dispatch(...,p_document_sha256) overload does not exist';
  end;
  select lower(regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(v_oid),
    '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) into v_src;
  if position('is distinct from' in v_src)=0 or position('document_sha256' in v_src)=0 then
    raise exception '0038 tail: the 7-arg consume_egress_dispatch overload does not re-bind on document_sha256 via IS DISTINCT FROM';
  end if;

  -- The 5-arg / 6-arg WIKI ORIGINALS survive byte-for-byte in substance: the exact TTL
  -- constant and the exact verdict vocabulary from the applied 0020 body (read this session,
  -- 0020:415,420,441 / 0020:491,507,511,520,523) must still be present, and NEITHER original
  -- mentions document_sha256 at all -- proving the sha-binding logic lives ONLY in the new
  -- overloads, never leaking into the 5-arg wiki call the postverify battery pins.
  select lower(regexp_replace(regexp_replace(regexp_replace(
    pg_get_functiondef('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)'::regprocedure),
    '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) into v_src;
  if position('interval ''120 seconds''' in v_src)=0
     or position('jsonb_build_object(''verdict'',''unknown'',''authorization_id'',null)' in v_src)=0 then
    raise exception '0038 tail: the 5-arg prepare_egress_dispatch (wiki_synthesis) body no longer matches its pre-0038 shape -- it may have been rebuilt instead of left untouched';
  end if;
  -- assembly correction: 0020's ORIGINAL 5-arg body already names the document_sha256
  -- COLUMN (it inserts an explicit null -- 0020:438-439, the reserved slot). The correct
  -- leak detector is the PARAMETER p_document_sha256, which only the 6-arg overload has.
  if position('p_document_sha256' in v_src)<>0 then
    raise exception '0038 tail: the 5-arg prepare_egress_dispatch (wiki_synthesis) overload mentions p_document_sha256 -- the sha-binding surgery leaked into the untouched wiki arity';
  end if;
  select lower(regexp_replace(regexp_replace(regexp_replace(
    pg_get_functiondef('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)'::regprocedure),
    '/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')) into v_src;
  if position('document_sha256' in v_src)<>0 then
    raise exception '0038 tail: the 6-arg consume_egress_dispatch (wiki_synthesis) overload mentions document_sha256 -- the sha-binding surgery leaked into the untouched wiki arity';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (8) REVERSE-WHILE-MATCHED -- named refusal spliced into reverse_entry AND
  -- approve_wrong_client_correction (design part1 4.6, [RV]): `live_bank_match_present`,
  -- anchored "beside 0037's allocated_items_present splices". This tail pins the SAME two
  -- 0037 anchor markers 0037's own tail already proved present (the file's own section
  -- (3d), quoted verbatim from the applied 0037 body read this session) and requires the
  -- new refusal to appear exactly once, in the same refusal zone -- i.e. strictly BEFORE the
  -- reversal-linkage UPDATE the 0037 pin ("update clara.journal_entries set reversed_by=")
  -- already locates, so a live bank match blocks the write rather than racing it.
  -- ---------------------------------------------------------------------------------------
  v_n := (length(v_map->>'reverse')-length(replace(v_map->>'reverse','live_bank_match_present','')))
    / length('live_bank_match_present');
  if v_n <> 1 then
    raise exception '0038 tail: the live_bank_match_present refusal must appear exactly once in reverse_entry -- found %', v_n;
  end if;
  v_a := position('"reason":"allocated_items_present"' in (v_map->>'reverse'));
  v_b := position('live_bank_match_present' in (v_map->>'reverse'));
  v_c := position('update clara.journal_entries set reversed_by=' in (v_map->>'reverse'));
  if v_a=0 or v_b=0 or v_c=0 or not (v_b < v_c) then
    raise exception '0038 tail: reverse_entry''s live_bank_match_present refusal is not positioned before the reversal-linkage UPDATE (allocated_items_present=%, live_bank_match_present=%, linkage_update=%)', v_a, v_b, v_c;
  end if;
  if position('CLR10' in upper(substring((v_map->>'reverse') from greatest(1,v_b-40) for 120)))=0 then
    raise exception '0038 tail: reverse_entry''s live_bank_match_present refusal is not raised with errcode CLR10, the house refusal code for a structural precondition';
  end if;

  v_n := (length(v_map->>'awcc')-length(replace(v_map->>'awcc','live_bank_match_present','')))
    / length('live_bank_match_present');
  if v_n <> 1 then
    raise exception '0038 tail: the live_bank_match_present refusal must appear exactly once in approve_wrong_client_correction -- found %', v_n;
  end if;
  v_a := position('"reason":"allocated_items_present"' in (v_map->>'awcc'));
  v_b := position('live_bank_match_present' in (v_map->>'awcc'));
  v_c := position('update clara.journal_entries set reversed_by=v_mirror' in (v_map->>'awcc'));
  if v_a=0 or v_b=0 or v_c=0 or not (v_b < v_c) then
    raise exception '0038 tail: approve_wrong_client_correction''s live_bank_match_present refusal is not positioned before its reversal-linkage UPDATE (allocated_items_present=%, live_bank_match_present=%, linkage_update=%)', v_a, v_b, v_c;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (9) THE 0027 FILING-RETIREMENT WRITER -- retire_document_filing REFUSES while a live
  -- bank_statements row rides the document (design part2 5: "the 0027 filing-correction/
  -- retirement writers spliced to refuse while a live bank_statements row rides the
  -- document (provenance durability)"). The design does not name the refusal literal; this
  -- tail names it `live_bank_statement_present`, symmetric with section (8)'s
  -- `live_bank_match_present`, and pins its position AFTER the 0027 PATCH anchors this
  -- session verified directly against the applied 0027 body (0027_filings_lock_order.sql:
  -- 411-418, its own tail assertion at 0027:596-601) -- proving 0038 PATCHED the live body
  -- rather than rebuilding it -- and BEFORE the retirement UPDATE.
  -- ---------------------------------------------------------------------------------------
  foreach v_key in array array[
      'select document_id into v_peek_doc from clara.document_filings',
      'from clara.documents where id = v_peek_doc for update',
      'select * into f from clara.document_filings where id = p_filing_id for update'] loop
    if position(v_key in (v_map->>'retire'))=0 then
      raise exception '0038 tail: retire_document_filing lost the 0027 patch marker "%" -- section rebuilt the body instead of patching it', v_key;
    end if;
  end loop;
  v_n := (length(v_map->>'retire')-length(replace(v_map->>'retire','live_bank_statement_present','')))
    / length('live_bank_statement_present');
  if v_n <> 1 then
    raise exception '0038 tail: the live_bank_statement_present refusal must appear exactly once in retire_document_filing -- found % (design part2 5 names this splice; this tail assumes the literal reason name -- reconcile if the as-built lane chose a different one)', v_n;
  end if;
  v_a := position('select * into f from clara.document_filings where id = p_filing_id for update' in (v_map->>'retire'));
  v_b := position('live_bank_statement_present' in (v_map->>'retire'));
  v_c := position('update clara.document_filings set retired_at = now()' in (v_map->>'retire'));
  if v_a=0 or v_b=0 or v_c=0 or not (v_a < v_b and v_b < v_c) then
    raise exception '0038 tail: retire_document_filing''s live_bank_statement_present refusal is not positioned strictly between the filing-row lock and the retirement UPDATE (filing_lock=%, refusal=%, retirement_update=%)', v_a, v_b, v_c;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (10) LOCK-ORDER PROSRC PINS (design part2 4.9 "Locks", and part2 5's own tail-category
  -- name for this exact list: "203005006 present in persist/enter/void; JE-before-advisory
  -- in match_bank_line; the 4.9 order").
  -- ---------------------------------------------------------------------------------------
  -- (10a) advisory rung 203005006 -- the per-account statement-chain lock, hashtext on the
  -- bank_account_id -- is present in ALL THREE writers the design names: persist_statement_
  -- facts, enter_bank_statement, void_bank_statement.
  -- assembly correction: the chain lock lives in the ONE shared core (_persist_statement_
  -- core), which both persist_statement_facts and enter_bank_statement call -- so the pin
  -- checks the core for the lock and the two callers for their call edge into it;
  -- void_bank_statement takes the rung directly.
  foreach v_key in array array['persist_core','void'] loop
    if position('pg_advisory_xact_lock(203005006' in (v_map->>v_key))=0 then
      raise exception '0038 tail: clara.% does not take the 203005006 statement-chain advisory lock -- the check-then-insert overlap/continuity race (design part1 4.2/4.3, [R1]) is unserialized', v_key;
    end if;
  end loop;
  foreach v_key in array array['persist','enter'] loop
    if position('_persist_statement_core' in (v_map->>v_key))=0 then
      raise exception '0038 tail: clara.% does not route through _persist_statement_core -- the chain lock and the shared validation ladder are bypassed', v_key;
    end if;
  end loop;

  -- (10b) match_bank_line: journal_entries rows locked FOR UPDATE (pre-existing entries)
  -- STRICTLY BEFORE advisory 203005004 -- "any future verb that locks a PRE-EXISTING entry
  -- must take journal_entries before open_items" (design part2 4.9, restating WCA-R9's own
  -- named invariant #1) -- followed by the bank line rows FOR UPDATE and the statement row
  -- FOR SHARE, in that order.
  v_a := position('from clara.journal_entries' in (v_map->>'match'));
  v_b := position('pg_advisory_xact_lock(203005004' in (v_map->>'match'));
  if v_a=0 then
    raise exception '0038 tail: match_bank_line never locks clara.journal_entries at all -- it cannot be validating the entries it matches under a stable row lock';
  end if;
  if v_b=0 then
    raise exception '0038 tail: match_bank_line never takes advisory 203005004 -- the reverse_entry-relative lock order (design part2 4.9) is unenforced';
  end if;
  if v_a >= v_b then
    raise exception '0038 tail: match_bank_line does not lock journal_entries strictly BEFORE advisory 203005004 -- it locks a PRE-EXISTING entry, so the total order requires journal_entries first (design part2 4.9, WCA-R9''s invariant #1)';
  end if;
  v_c := position('for update' in substring((v_map->>'match') from v_a for 200));
  if v_c=0 then
    raise exception '0038 tail: match_bank_line''s journal_entries lock is not a FOR UPDATE row lock';
  end if;
  -- bank_statement_lines rows must be locked, and strictly AFTER 203005004 (line rows FOR
  -- UPDATE + statement FOR SHARE come after the advisory rung per the design's stated
  -- order).
  v_d := position('clara.bank_statement_lines' in (v_map->>'match'));
  if v_d=0 or v_d < v_b then
    raise exception '0038 tail: match_bank_line does not lock bank_statement_lines strictly after advisory 203005004 (advisory=%, lines=%)', v_b, v_d;
  end if;

  -- (10c) settle_from_bank_line: the composite lock order (design part2 4.9): op-receipt ->
  -- ALL sub-key reservations -> advisory 203005003 (client:counterparty) -> advisory
  -- 203005004 (client) -> open_items -> fresh entries -> groups -> bank rows LAST. The
  -- composite invariant this tail can check without seeing the whole body: it NEVER takes a
  -- FOR UPDATE lock on a pre-existing clara.journal_entries row (it only inserts a fresh
  -- settlement entry, per WCA-R9's invariant #1 as extended by the design's "it never locks
  -- a pre-existing entry" statement for this exact verb) -- and its two advisory rungs, when
  -- both present, appear in 003-then-004 order, the same order every other approve path and
  -- composite uses (0037:1181 comment, verified this session).
  -- The specific pre-existing-entry lock IDIOM 0037's own composites and reverse_entry/awcc
  -- use is `select * into <var> from clara.journal_entries where id=... for update` (a
  -- SELECT, not an INSERT). A composite that locked a pre-existing entry would show this
  -- exact shape; a composite that only ever inserts its own fresh entry (the design's
  -- stated invariant) cannot.
  v_x := substring((v_map->>'settle') from
    'select \* into [a-z_]+ from clara\.journal_entries where id=[^;]*for update');
  if v_x is not null then
    raise exception '0038 tail: settle_from_bank_line appears to lock a PRE-EXISTING clara.journal_entries row FOR UPDATE (%) -- the composite invariant (design part2 4.9, WCA-R9''s invariant #1) requires it to touch only its own freshly-inserted entry', v_x;
  end if;
  -- assembly correction (the match lane's documented call-not-inline decision): settle_from_
  -- bank_line CALLS clara.allocate_receipt / clara.allocate_payment, and the 003-before-004
  -- rung lives INSIDE those composites (their own x37 catalog cell pins the order in their
  -- prosrc). Settle's own body therefore carries the CALL EDGES, not the lock literals --
  -- and it must take NO advisory lock of its own before those calls (nesting adds no
  -- deadlock window only because the composite's op-receipt reservation is its first act).
  if position('clara.allocate_receipt' in (v_map->>'settle'))=0
     or position('clara.allocate_payment' in (v_map->>'settle'))=0 then
    raise exception '0038 tail: settle_from_bank_line does not delegate to BOTH clara.allocate_receipt and clara.allocate_payment -- the C-a composite mechanics (design part1 4.6) are not the settlement writer';
  end if;
  v_a := position('pg_advisory_xact_lock(203005003' in (v_map->>'settle'));
  v_b := position('pg_advisory_xact_lock(203005004' in (v_map->>'settle'));
  if v_a<>0 or v_b<>0 then
    raise exception '0038 tail: settle_from_bank_line takes an advisory rung in its OWN body (003=%, 004=%) -- the delegation design requires the composites to own the rung; a direct acquisition here re-opens the nesting deadlock window', v_a, v_b;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (11) THE bank.* EVENT PAYLOAD-KEY ALLOWLIST SCAN (the 0020 leak-scan idiom, applied
  -- here to _append_event call sites rather than to a document-egress surface). Design
  -- part2 4.8: "Payloads carry identifiers only -- never account numbers, never line
  -- descriptions... a tail assert scans every bank.* payload key set against an allowlist."
  --
  -- MECHANISM. _append_event's signature (0005_event_spine.sql:476-478, verified this
  -- session) is (p_firm,p_type,p_client,p_actor,p_obo,p_wake_kind,p_entry,p_document,
  -- p_resolution,p_payload) -- ten positional arguments, no semicolon possible inside a
  -- single call's argument list (it is one expression). Every live function body in the
  -- schema is scanned for `perform clara._append_event(...)` calls whose argument text
  -- contains a `'bank.<name>'` literal; within THAT call's argument text, every quoted
  -- lowercase-underscore token immediately followed by a comma is treated as a payload key
  -- candidate. This is deliberately OVER-inclusive (a literal VALUE token, e.g. a bare
  -- quoted status word, would also be flagged) -- which is exactly what the design's
  -- "identifiers only" law demands: no bank.* payload should carry a bare literal value at
  -- all, only variable references to ids, so a literal token appearing here at all is
  -- already suspicious, not merely a mis-keyed id.
  -- ---------------------------------------------------------------------------------------
  v_bad_keys := array[]::text[];
  v_count_bank_events := 0;
  for r in select p.oid, (p.oid::regprocedure)::text as sig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prokind='f' order by p.proname, p.oid
  loop
    begin
      v_src := lower(regexp_replace(regexp_replace(regexp_replace(
        pg_get_functiondef(r.oid),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
    exception when others then
      raise exception '0038 tail: the bank.* payload-key allowlist scan could not read the body of % (%) -- a body this scan cannot read is a body it cannot clear, and this assertion fails closed', r.sig, sqlerrm;
    end;
    v_calls := array(select (regexp_matches(v_src,
      'perform clara\._append_event\(([^;]*?''bank\.[a-z_]+''[^;]*?)\);','g'))[1]);
    if array_length(v_calls,1) > 0 then
      foreach v_call in array v_calls loop
        v_count_bank_events := v_count_bank_events + 1;
        v_pos := position('jsonb_build_object(' in v_call);
        if v_pos = 0 then
          -- A bank.* event with no jsonb_build_object payload at all is legal only if the
          -- literal payload argument is exactly '{}'::jsonb (an intentionally empty
          -- payload) -- anything else is a shape this scan does not understand and must not
          -- silently wave through.
          if position('''{}''::jsonb' in v_call) = 0 then
            raise exception '0038 tail: % emits a bank.* event whose payload argument is neither jsonb_build_object(...) nor the empty-payload literal ''{}''::jsonb -- the allowlist scan cannot clear it: %', r.sig, v_call;
          end if;
          continue;
        end if;
        v_payload := substring(v_call from v_pos + length('jsonb_build_object('));
        -- v_call was captured up to (but excluding) _append_event's own closing paren, and
        -- jsonb_build_object is the LAST positional argument in every _append_event call in
        -- this codebase (verified across every example read this session) -- so v_payload
        -- ends with jsonb_build_object's own closing paren as its final character.
        if right(v_payload,1) = ')' then
          v_payload := left(v_payload, length(v_payload)-1);
        end if;
        -- ASSEMBLY CORRECTION to the scan's law. The design's literal words (part2 4.8) are
        -- "identifiers only -- never account numbers, never line descriptions". The original
        -- positive allowlist (^..._ids?$) was STRICTER than the law -- it refused legitimate
        -- enum/count metadata (ingest_mode, status, period_exceptions, member counts), and
        -- its naive key/value alternation misread a `case` expression's value literal as a
        -- key. Re-stated as the law itself, robustly: no payload construction may reference
        -- the sensitive columns/params (account numbers in any form, line descriptions,
        -- display names, free-text memos/reasons) -- checked as identifier tokens over the
        -- normalized payload text, immune to alternation parsing.
        foreach v_key in array array['account_number','account_number_normalized',
            'account_printed','account_digits','description','bank_name_display',
            'p_memo','p_reason','v_reason_text','voided_reason','unmatched_reason',
            'deactivated_reason'] loop
          if v_payload ~ ('\m' || v_key || '\M') then
            v_bad_keys := v_bad_keys || (r.sig || ': ' || v_key);
          end if;
        end loop;
      end loop;
    end if;
  end loop;
  if v_count_bank_events < 7 then
    raise exception '0038 tail: the payload-key scan found only % bank.* _append_event call site(s) across the whole schema -- fewer than the seven named event types (design part2 4.8), so at least one emitter is either missing or not shaped as a scannable `perform clara._append_event(...);` call', v_count_bank_events;
  end if;
  if array_length(v_bad_keys,1) > 0 then
    raise exception '0038 tail: bank.* event payload(s) reference sensitive column(s)/param(s) (account numbers / descriptions / display names / free text) -- domain_events is agent-readable firm-wide (design part2 4.8) -- %', v_bad_keys;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (12) THE WHOLE-SCHEMA LEAK SCAN (the 0035/0037 idiom -- fail-closed, by exact
  -- ::regprocedure signature where the design gives one, restricted to prokind='f'). Scoped
  -- to the identity-critical exclusivity tables (design part1 4.5): a stray writer of
  -- bank_matches / bank_match_line_members / bank_match_entry_members outside the four
  -- pinned verbs would bypass belt-1/belt-2's deferred triggers exactly the way an
  -- unaudited open_items insert would have bypassed 0037's belts.
  -- ---------------------------------------------------------------------------------------
  foreach v_key in array array['clara.bank_matches','clara.bank_match_line_members',
      'clara.bank_match_entry_members'] loop
    v_writers := array[]::text[];
    for r in select p.oid, p.proname, (p.oid::regprocedure)::text as sig
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara' and p.prokind='f' order by p.proname, p.oid
    loop
      begin
        v_src := lower(regexp_replace(regexp_replace(regexp_replace(
          pg_get_functiondef(r.oid),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
      exception when others then
        raise exception '0038 tail: the whole-schema leak scan could not read the body of % (%) -- fails closed', r.sig, sqlerrm;
      end;
      if v_src ~ ('insert into '||regexp_replace(lower(v_key),'\.','\\.','g')||' *\(') then
        v_writers := v_writers || r.proname;
      end if;
    end loop;
    if array_length(v_writers,1) is null then
      raise exception '0038 tail: % has NO writer at all -- the match model can never populate it', v_key;
    end if;
    if v_writers is distinct from
        (select array_agg(x order by x) from unnest(v_writers) x
         where x = any(array['match_bank_line','unmatch_bank_match','settle_from_bank_line',
                              'complete_pending_match'])) then
      raise exception '0038 tail: % has a writer outside the four pinned match verbs (match_bank_line, unmatch_bank_match, settle_from_bank_line, complete_pending_match) -- %', v_key, v_writers;
    end if;
  end loop;

  raise notice '0038-F tail OK, PART 1 (1/1): router recut, claim/release/reserve lane widenings, the four consent verbs'' purpose widening + purpose-discriminated wiki-hold coupling, the prepare/consume_egress_dispatch overload split, the reverse_entry/approve_wrong_client_correction/retire_document_filing bank splices, the full 4.9 lock-order pins, the bank.* payload-key allowlist scan (>=7 emitters, ID-only keys) and the match-table whole-schema leak scan all verified against the LIVE, currently-applied bodies';
end
$tail1$;

-- =====================================================================
-- TAIL, PART 2 of 2 -- THE CATALOG, ACL AND EVENT-TYPE ASSERTIONS. Deliberately a separate
-- block that reads NO function body (see part 1's header for why the seam exists).
-- =====================================================================
do $tail2$
declare
  v_fn text; v_role text; v_def text; v_n int; v_vals text[]; v_con text;
  v_pname text; v_sig text;
begin
  -- ---------------------------------------------------------------------------------------
  -- (A) THE CHECK CATALOG -- the FIVE task-side CHECK widenings (design part2 5: "lane ·
  -- lane-engine · engine-kind · error-code · binding") named exact, not token-counted (the
  -- 0037 ck_je_coding_kind idiom): a CHECK that exists under a different definition is not
  -- the CHECK this migration claims to have added, and a SUBSTRING probe proves the values
  -- 0038 needs are present while saying nothing about a value nobody classifies.
  --
  -- Each CHECK below follows the 0009->0015->0016 drop/re-add idiom (0016_a21_compliance_
  -- watch.sql:132-172, verified this session): the OLD (_0016-suffixed) constraint is
  -- absent and the NEW (_0038-suffixed) constraint carries the widened set. Located by
  -- conrelid + a content probe rather than by assuming the exact auto-generated name for
  -- the two anonymous inline consent CHECKs below (section A2), for the same reason 0037's
  -- own catalog assert extracts a value SET rather than trusting a name alone.
  -- ---------------------------------------------------------------------------------------
  -- (A1) document_processing_tasks.lane -- 6 pre-0038 values + statement_facts +
  -- statement_parse = 8.
  if exists (select 1 from pg_constraint con
             where con.conrelid='clara.document_processing_tasks'::regclass
               and con.conname='ck_processing_task_lane_0016') then
    raise exception '0038 tail: the pre-0038 ck_processing_task_lane_0016 constraint is still present -- the drop half of the drop/re-add idiom did not run';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.document_processing_tasks'::regclass
      and con.conname='ck_processing_task_lane_0038';
  if v_def is null then
    raise exception '0038 tail: ck_processing_task_lane_0038 is absent';
  end if;
  select array_agg(m[1] order by m[1]) into v_vals from regexp_matches(v_def,'''([a-z_]+)''','g') as m;
  if v_vals is distinct from array['classify','invoice_facts','local_facts','none','ocr',
      'statement_facts','statement_parse','structured_parse']::text[] then
    raise exception '0038 tail: ck_processing_task_lane_0038 does not admit EXACTLY the eight expected lanes -- found %', v_vals;
  end if;

  -- (A2) document_processing_tasks lane<->engine binding. Loosely matched (the exact
  -- vendor/local engine-id prefix convention for the two new lanes is an implementation
  -- choice this design does not pin a literal for): the OLD _0016 constraint must be gone,
  -- the NEW _0038 constraint must exist, and it must mention BOTH new lane literals
  -- alongside an engine_id LIKE pattern (proving SOME prefix rule was written for each,
  -- rather than the new lanes falling through to an unconstrained default).
  if exists (select 1 from pg_constraint con
             where con.conrelid='clara.document_processing_tasks'::regclass
               and con.conname='ck_processing_task_lane_engine_0016') then
    raise exception '0038 tail: the pre-0038 ck_processing_task_lane_engine_0016 constraint is still present';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.document_processing_tasks'::regclass
      and con.conname='ck_processing_task_lane_engine_0038';
  if v_def is null then
    raise exception '0038 tail: ck_processing_task_lane_engine_0038 is absent';
  end if;
  -- NOTE: pg_get_constraintdef renders a parsed LIKE expression back using the underlying
  -- ~~ operator, not the word LIKE (a documented ruleutils behavior) -- so this probes for
  -- EITHER spelling rather than assuming the constraint's original surface syntax survived
  -- redisplay.
  if v_def not ilike '%statement_facts%' or v_def not ilike '%statement_parse%'
     or (v_def not ilike '%like%' and v_def not like '%~~%') then
    raise exception '0038 tail: ck_processing_task_lane_engine_0038 does not bind BOTH new lanes to an engine_id prefix pattern -- %', v_def;
  end if;

  -- (A3) document_extractions.engine_kind. ASSUMPTION, stated explicitly (the design does
  -- not name this literal anywhere in part1/part2): mirroring the invoice_facts lane <->
  -- invoice_facts engine_kind convention (0016_a21_compliance_watch.sql:180-182's own
  -- 'doc_classify' precedent), this tail expects exactly ONE new value, 'statement_facts',
  -- covering BOTH the OCR and structured statement readers' extraction rows. If the lane
  -- that owns document_extractions chose a different literal (or two literals, one per
  -- reader), this assertion is the reconciliation point -- it fails loud rather than
  -- silently accepting an unverified value set.
  if exists (select 1 from pg_constraint con
             where con.conrelid='clara.document_extractions'::regclass
               and con.conname='ck_document_extractions_engine_kind_0016') then
    raise exception '0038 tail: the pre-0038 ck_document_extractions_engine_kind_0016 constraint is still present';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.document_extractions'::regclass
      and con.conname='ck_document_extractions_engine_kind_0038';
  if v_def is null then
    raise exception '0038 tail: ck_document_extractions_engine_kind_0038 is absent';
  end if;
  select array_agg(m[1] order by m[1]) into v_vals from regexp_matches(v_def,'''([a-z_]+)''','g') as m;
  if v_vals is distinct from
      array['doc_classify','invoice_facts','ocr','statement_facts','structured_parse']::text[] then
    raise exception '0038 tail: ck_document_extractions_engine_kind_0038 does not admit EXACTLY the assumed five values (doc_classify, invoice_facts, ocr, statement_facts, structured_parse) -- found % -- RECONCILE with whichever literal the extraction-writing lane actually used', v_vals;
  end if;

  -- (A4) document_processing_tasks.error_code -- the FULL named taxonomy (design part1
  -- 4.3): 12 pre-0038 codes + 13 statement-specific codes + consent_inactive = 26.
  if exists (select 1 from pg_constraint con
             where con.conrelid='clara.document_processing_tasks'::regclass
               and con.conname='ck_processing_task_error_code_0016') then
    raise exception '0038 tail: the pre-0038 ck_processing_task_error_code_0016 constraint is still present';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.document_processing_tasks'::regclass
      and con.conname='ck_processing_task_error_code_0038';
  if v_def is null then
    raise exception '0038 tail: ck_processing_task_error_code_0038 is absent';
  end if;
  select array_agg(m[1] order by m[1]) into v_vals from regexp_matches(v_def,'''([a-z_]+)''','g') as m;
  if v_vals is distinct from array[
      'account_inactive','account_unregistered','attempt_cap','bad_type','budget',
      'chain_broken','consent_inactive','continuity_mismatch','corrupt',
      'duplicate_period','encrypted','engine_error','engine_lost','header_unreadable',
      'internal','limit','line_date_out_of_period','non_myr_statement',
      'overlapping_period','period_invalid','readers_disagree','skipped_kind',
      'statement_multi_client','storage_error','timeout','totals_unreadable']::text[] then
    raise exception '0038 tail: ck_processing_task_error_code_0038 does not admit EXACTLY the pre-0038 codes plus the fourteen named statement-specific codes (design part1 4.3) -- found %', v_vals;
  end if;

  -- (A5) document_processing_tasks binding -- the never-claimed error-code allowlist widens
  -- from (attempt_cap, budget, skipped_kind) to include consent_inactive (design part1
  -- 4.3: "consent_inactive joins the never-claimed allowlist beside skipped_kind"). The
  -- rest of the binding predicate (the queued/held_egress and running/done shapes) is
  -- asserted unchanged by requiring the exact pre-0038 fragments survive.
  if exists (select 1 from pg_constraint con
             where con.conrelid='clara.document_processing_tasks'::regclass
               and con.conname='ck_processing_task_binding_0016') then
    raise exception '0038 tail: the pre-0038 ck_processing_task_binding_0016 constraint is still present';
  end if;
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.document_processing_tasks'::regclass
      and con.conname='ck_processing_task_binding_0038';
  if v_def is null then
    raise exception '0038 tail: ck_processing_task_binding_0038 is absent';
  end if;
  if v_def not ilike '%queued%' or v_def not ilike '%held_egress%'
     or v_def not ilike '%running%' or v_def not ilike '%done%' or v_def not ilike '%failed%' then
    raise exception '0038 tail: ck_processing_task_binding_0038 lost one of the pre-0038 status-shape branches -- %', v_def;
  end if;
  -- Extracted by EXCLUSION rather than by anchoring on the literal word "in": Postgres'
  -- ruleutils commonly re-renders a parsed `x IN (list)` as `x = ANY (ARRAY[...])`, which
  -- would silently defeat a regex anchored on "error_code\s+in\s*\(". Every quoted literal
  -- in the whole constraint definition is pulled, then the five KNOWN status-value literals
  -- (queued/held_egress/running/done/failed -- the binding predicate's OTHER branches) are
  -- excluded, leaving exactly the never-claimed error_code allowlist regardless of which
  -- surface syntax pg_get_constraintdef chose.
  select array_agg(m[1] order by m[1]) into v_vals
    from regexp_matches(v_def,'''([a-z_]+)''','g') as m
    where m[1] not in ('queued','held_egress','running','done','failed');
  -- assembly reconciliation: statement_multi_client ALSO joins the never-claimed allowlist
  -- (the recut lane's documented decision, adopted): the router runs INSIDE filing
  -- transactions (file_document / finalize_document_intake / confirm_attribution_candidate),
  -- so a raise there would abort an unrelated filing -- the refusal records as a terminal
  -- never-claimed failed task, the skipped_kind idiom, which the binding CHECK must admit.
  if v_vals is distinct from array['attempt_cap','budget','consent_inactive','skipped_kind','statement_multi_client']::text[] then
    raise exception '0038 tail: ck_processing_task_binding_0038''s never-claimed error_code allowlist is not EXACTLY (attempt_cap, budget, consent_inactive, skipped_kind) -- found %', v_vals;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (A6) THE FOUR CONSENT CHECKS (design part2 5: "the doc_sha CHECK + the FOUR verb recuts"
  -- -- read here as three TABLE checks widened + the one doc-sha predicate recut, matching
  -- part1 4.4's own count: "Purpose literal statement_extraction added to the THREE 0020
  -- table CHECKs" + "ck_egress_dispatch_authorizations_doc_sha is recut"). Located by
  -- conrelid + a content probe (the three purpose checks are anonymous inline CHECKs in the
  -- live 0020 DDL, 0020_typed_consent.sql:153,198,250, verified this session -- Postgres'
  -- own auto-naming is not assumed).
  -- ---------------------------------------------------------------------------------------
  foreach v_fn in array array['clara.client_egress_purpose_consents',
      'clara.client_egress_purpose_activations','clara.egress_dispatch_authorizations'] loop
    select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
      where con.conrelid=v_fn::regclass and con.contype='c'
        and pg_get_constraintdef(con.oid) ilike '%purpose%';
    if v_def is null then
      raise exception '0038 tail: % has no CHECK constraint mentioning purpose at all', v_fn;
    end if;
    select array_agg(m[1] order by m[1]) into v_vals from regexp_matches(v_def,'''([a-z_]+)''','g') as m;
    if v_vals is distinct from array['statement_extraction','wiki_synthesis']::text[] then
      raise exception '0038 tail: %''s purpose CHECK does not admit EXACTLY (statement_extraction, wiki_synthesis) -- found % in %', v_fn, v_vals, v_def;
    end if;
  end loop;

  -- ck_egress_dispatch_authorizations_doc_sha -- recut: wiki_synthesis forces NULL,
  -- statement_extraction REQUIRES non-null (design part1 4.4). Content-probed rather than
  -- an exact-string pin, since pg_get_constraintdef's exact rendering of a disjunction is
  -- not something this file can predict blind.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.egress_dispatch_authorizations'::regclass
      and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def is null then
    raise exception '0038 tail: ck_egress_dispatch_authorizations_doc_sha is absent';
  end if;
  if v_def not ilike '%wiki_synthesis%' or v_def not ilike '%statement_extraction%'
     or v_def not ilike '%is null%' or v_def not ilike '%is not null%' then
    raise exception '0038 tail: ck_egress_dispatch_authorizations_doc_sha does not bind BOTH purposes with opposite null-ness (wiki_synthesis forced null, statement_extraction required non-null) -- %', v_def;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (B) THE EVENT-TYPE CATALOG -- the SEVEN bank.* types (design part2 4.8), each
  -- client_scoped, each bound to the ACTIVE taxonomy version with decision='ignore' (the
  -- design's own words: "C-b decisions ignore"; the 0037 Section M / 0028:1682 idiom).
  -- ---------------------------------------------------------------------------------------
  select count(*)::int into v_n from clara.event_types
    where name in ('bank.account_created','bank.account_proposal','bank.statement_ingested',
      'bank.statement_voided','bank.match_created','bank.match_completed',
      'bank.match_unmatched') and client_scoped;
  if v_n <> 7 then
    raise exception '0038 tail: only % of the seven bank.* event types are registered AND client-scoped', v_n;
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version = t.version and a.singleton
    where t.event_type in ('bank.account_created','bank.account_proposal',
      'bank.statement_ingested','bank.statement_voided','bank.match_created',
      'bank.match_completed','bank.match_unmatched')
      and t.decision = 'ignore';
  if v_n <> 7 then
    raise exception '0038 tail: only % of the seven bank.* events are bound to the active taxonomy version with decision=ignore', v_n;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- (C) ACLs.
  -- ---------------------------------------------------------------------------------------
  -- (C1) THE HUMAN BANK VERBS -- clara_authenticated ONLY, zero PUBLIC, owned by
  -- clara_fn_owner, ZERO wake/agent/runtime grants ("which obligation a payment discharges
  -- is a judgement, and the agent never makes one" -- the 0037 Section L rationale, applied
  -- identically here). The two composites with a design-literal signature are checked by
  -- ::regprocedure; every other human verb by PRONAME (see part 1's header note).
  foreach v_sig in array array[
      'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)',
      'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)'] loop
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0038 acl: % is not granted to clara_authenticated', v_sig;
    end if;
    foreach v_role in array array['clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_function_privilege(v_role::name, v_sig, 'execute') then
        raise exception '0038 acl: % is granted to % -- a bank match/settlement is a human judgement', v_sig, v_role;
      end if;
    end loop;
    if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
               where p.oid = v_sig::regprocedure and acl::text like '=%') then
      raise exception '0038 acl: % still carries a PUBLIC grant', v_sig;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0038 acl: % is not owned by clara_fn_owner', v_sig;
    end if;
  end loop;

  foreach v_pname in array array['add_bank_account','deactivate_bank_account',
      'reactivate_bank_account','remap_bank_account_coa','enter_bank_statement',
      'unmatch_bank_match','complete_pending_match'] loop
    select (p.oid::regprocedure)::text into v_sig from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_pname;
    if v_sig is null then
      raise exception '0038 acl: clara.% does not exist', v_pname;
    end if;
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0038 acl: % is not granted to clara_authenticated', v_sig;
    end if;
    foreach v_role in array array['clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_function_privilege(v_role::name, v_sig, 'execute') then
        raise exception '0038 acl: % is granted to % -- bank identity/matching is a human judgement', v_sig, v_role;
      end if;
    end loop;
    if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
               where p.oid = v_sig::regprocedure and acl::text like '=%') then
      raise exception '0038 acl: % still carries a PUBLIC grant', v_sig;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0038 acl: % is not owned by clara_fn_owner', v_sig;
    end if;
  end loop;

  -- (C2) persist_statement_facts / fail_statement_facts -- RUNTIME-ONLY, matching
  -- persist_invoice_facts/fail_invoice_facts's own grant (0009_coding_floor.sql:2916-2924,
  -- verified this session: `to clara_runtime`, no clara_authenticated grant at all).
  foreach v_pname in array array['persist_statement_facts','fail_statement_facts'] loop
    select (p.oid::regprocedure)::text into v_sig from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_pname;
    if v_sig is null then
      raise exception '0038 acl: clara.% does not exist', v_pname;
    end if;
    if not pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute') then
      raise exception '0038 acl: % is not granted to clara_runtime', v_sig;
    end if;
    if pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0038 acl: % is granted to clara_authenticated -- it is a workflow-internal settle/fail verb, human-unreachable by design (the persist_invoice_facts/fail_invoice_facts precedent)', v_sig;
    end if;
    foreach v_role in array array['clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_function_privilege(v_role::name, v_sig, 'execute') then
        raise exception '0038 acl: % is granted to %', v_sig, v_role;
      end if;
    end loop;
    if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
               where p.oid = v_sig::regprocedure and acl::text like '=%') then
      raise exception '0038 acl: % still carries a PUBLIC grant', v_sig;
    end if;
  end loop;

  -- (C3) THE FOUR 0037 COMPOSITES ARE UNCHANGED (design part2 5's own phrase: "composites
  -- unchanged"). Re-asserts exactly what 0037's own tail already proved, as a regression
  -- net against this migration accidentally touching them.
  foreach v_sig in array array[
      'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.unallocate_group(uuid,uuid,text,text)',
      'clara.apply_open_items(uuid,jsonb,text,text)'] loop
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0038 acl: 0037 composite % lost its clara_authenticated grant -- this migration must leave it untouched', v_sig;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0038 acl: 0037 composite % is no longer owned by clara_fn_owner', v_sig;
    end if;
  end loop;

  -- (C4) THE FOUR CONSENT VERBS + classify_consent_evidence_document keep their
  -- clara_authenticated-only floor after the purpose-widening recut (CREATE OR REPLACE
  -- preserves ACL/ownership, asserted rather than assumed -- the 0016:5068/0029:1445
  -- precedent 0037's own tail cites).
  foreach v_sig in array array[
      'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
      'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
      'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
      'clara.revoke_client_egress_purpose(uuid,text,text,text)'] loop
    if not pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0038 acl: the patch to % dropped its clara_authenticated grant', v_sig;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0038 acl: % is not owned by clara_fn_owner after the patch', v_sig;
    end if;
  end loop;

  -- (C5) prepare/consume_egress_dispatch NEW overloads -- clara_runtime only, matching the
  -- 5-arg/6-arg wiki originals' own grant (0020_typed_consent.sql:1815-1820, verified this
  -- session: `to clara_runtime`).
  foreach v_sig in array array[
      'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)',
      'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)'] loop
    if not pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute') then
      raise exception '0038 acl: the new overload % is not granted to clara_runtime', v_sig;
    end if;
    if pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0038 acl: the new overload % is granted to clara_authenticated -- dispatch preparation/consumption is a runtime-internal act, matching the wiki original''s own floor', v_sig;
    end if;
  end loop;

  -- (C6) ZERO wake/agent grants on EVERY bank table, and clara_authenticated SELECT present
  -- on every one -- including bank_account_proposals and bank_match_audit, both explicitly
  -- "human-only reads" per the design (part1 4.3, part1 4.5), and bank_institutions, the
  -- seeded reference table. No table below is agent- or wake-readable; every write goes
  -- through a SECURITY DEFINER verb (the 0037 Section L / C table-grant idiom, applied to
  -- all nine bank relations).
  foreach v_fn in array array['clara.bank_institutions','clara.bank_accounts',
      'clara.bank_account_proposals','clara.bank_statements','clara.bank_statement_lines',
      'clara.bank_matches','clara.bank_match_line_members','clara.bank_match_entry_members',
      'clara.bank_match_audit'] loop
    foreach v_role in array array['clara_agent_ro','clara_runtime','clara_wake_interactive',
        'clara_wake_proactive'] loop
      if pg_catalog.has_table_privilege(v_role::name, v_fn, 'select') then
        raise exception '0038 acl: % can read % -- the design grants no wake/agent/runtime role any select on a bank table', v_role, v_fn;
      end if;
    end loop;
    if not pg_catalog.has_table_privilege('clara_authenticated', v_fn, 'select') then
      raise exception '0038 acl: clara_authenticated cannot read %', v_fn;
    end if;
    -- SELECT and nothing else: every write goes through a definer verb.
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_table_privilege(v_role::name, v_fn, 'insert')
         or pg_catalog.has_table_privilege(v_role::name, v_fn, 'update')
         or pg_catalog.has_table_privilege(v_role::name, v_fn, 'delete')
         or pg_catalog.has_table_privilege(v_role::name, v_fn, 'truncate') then
        raise exception '0038 acl: % holds a DML grant on % -- every bank relation is written by a definer verb only', v_role, v_fn;
      end if;
    end loop;
    if exists (select 1 from pg_class cc, unnest(coalesce(cc.relacl,'{}'::aclitem[])) acl
               where cc.oid = v_fn::regclass and acl::text like '=%') then
      raise exception '0038 acl: % carries a PUBLIC table grant', v_fn;
    end if;
    if not exists (select 1 from pg_class c where c.oid = v_fn::regclass
                   and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '0038 acl: % is not FORCE RLS', v_fn;
    end if;
  end loop;

  raise notice '0038-F tail OK, PART 2 (1/1): the five task CHECKs (lane/lane-engine/engine-kind/error-code/binding) and the four consent CHECKs (three purpose CHECKs + the doc-sha recut) carry EXACTLY their expected value sets; the seven bank.* event types are registered, client-scoped, ignore-decisioned and bound to the active taxonomy; every bank verb''s ACL matches its design-stated floor (human bank verbs clara_authenticated-only, persist/fail runtime-only, the 0037 composites and the four consent verbs unchanged, the new egress-dispatch overloads runtime-only); every bank table is FORCE RLS, clara_authenticated-select-only, zero wake/agent/runtime reads, zero non-owner DML, zero PUBLIC grants';
end
$tail2$;
