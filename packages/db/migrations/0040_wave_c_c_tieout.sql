-- 0040_wave_c_c_tieout.sql -- WAVE C-c: tie-out receipts, the narrow exception door,
-- bank rules + suggestions-as-reads, the aging as-of grain, and the twelve-entry splice
-- register. ASSEMBLED from five lane sections (S1 schema / S2 identity core / S3 doors+rules+
-- reads / S4 splices / S5 the sighting carve-out) plus one unified TAIL.
--
-- DESIGN OF RECORD: wave-c-c design v2.1 (cited below as SS3/SS4.1/SS4.2/SS4.3/SS4.4/SS4.5/
-- SS5/SS6/SS9/SS10) + its part-2 ladder record (cited as [L1/<row>]). Governing law above the
-- design: docs/plan/wave-c-contract.md SS4 C-c (WC-R1..R12) and the owner rulings WCC-R1..R8
-- (2026-07-31). On conflict the contract governs for Wave C; PRD.md SS6 (LAW) governs always.
--
-- SHAPE OF THIS FILE (one transaction, applied by packages/db/scripts/migrate.mjs):
--   SECTION S1  -- SS0 live probes (session role) -> set role clara_fn_owner -> the three new
--                  tables (bank_reconciliations / bank_line_exceptions / bank_rules) + RLS/ACL,
--                  the bank_matches.matched_via_rule_id FK, counterparties.payment_terms_days,
--                  open_item_allocations.effective_date + its backfill.
--   SECTION S2  -- the identity core: _bank_recon_terms, complete/void_bank_reconciliation,
--                  the two belts (snapshot coherence + settled authority), their ACLs.
--   (reset role) -- the fn-owner region closes here so the event registration runs as the
--                  migration role, exactly the 0038:8413-8423 ROLE NOTE precedent.
--   SECTION EVENTS -- the seven bank.* event types + active-taxonomy rows. Placed BEFORE
--                  section S3 because S3's own SS0 probe 6 asserts five of them already exist.
--   SECTION S3  -- the exception door, the rule lifecycle verbs, counterparty terms,
--                  _subledger_outstanding_asof, and the nine read RPCs.
--   SECTION S4  -- the twelve-entry splice register (change-of-record surgery on live bodies).
--   SECTION S5  -- splice register entry 10: the sighting carve-out on _approve_entry_core.
--   TAIL        -- the unified acceptance asserts: the relocated S1 object census (with the
--                  FINAL trigger counts, which include S2's belts), the lock-order prosrc pins,
--                  the allocation-writer census, the event payload-key allowlist scan, the
--                  grant matrix, the overload census, and the ACL leak scan.
--
-- ASSEMBLY ADJUDICATIONS APPLIED (the orchestrator's ASSEMBLY-ORDER, binding):
--   1. the two new match/settle overloads ship with NO defaults (S4-D1) -- ambiguity on the
--      money path is worse than an extra explicit argument.
--   2. no new refusal for the entry-side settled-period gap (S4-Q1): the identity TOTAL is
--      invariant, and byte-exact verification binds the STORED TERM COLUMNS -- the snapshot is
--      stored truth-at-completion and is NEVER re-derived.
--   3. apply_open_items.effective_date := current_date (an entry-less writer has no
--      posting_date to anchor on).
--   4. bank_line_exceptions.evidence_document_id carries the 2-key (id, firm_id) FK --
--      clara.documents has carried no client_id since 0007:1106; except_bank_line validates
--      client congruence through the document's ACTIVE filing instead.
--   5. the S1 object census moved to the TAIL and widened to the FINAL trigger counts
--      (bank_reconciliations = 4, bank_line_exceptions = 5, bank_rules = 3).
--   6. list_bank_rules(client) added as a tenth read RPC (the /bank rule card needs to re-list
--      rules it did not mint this session).
--   7. get_bank_reconciliation's SQL shape is authoritative; the dashboard model was adjusted
--      to it, never the reverse.
--  10. bank_rules gains a proposed->retired WITHDRAWAL arm (retired_reason mandatory), so a
--      never-signed proposal is not immortal -- it also frees its content-hash slot.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law); the SS0 frontier probe below pins
-- 0039_statement_balance_null_defers as the applied predecessor.


-- #####################################################################################
-- ############################ SECTION S1 -- SCHEMA ###################################
-- #####################################################################################

-- =====================================================================================
-- SECTION 0 -- THE PRE-DDL LIVE PROBES (the 0037:325-486 / 0038:64-162 shape: fail fast with
-- a named remedy, in plain SQL over base catalogs, before any DDL runs).
--
-- Scope: (a) the frontier this migration assumes is genuinely the live frontier; (b) the
-- specific prior-migration anchors this file's composite FKs and disable/re-enable backfill
-- window depend on are present in the expected shape (re-verified against the LIVE migration
-- files, not trusted from the design doc's prose); (c) the relation/column names this file is
-- about to CREATE or ADD do not already exist (guards a partial or duplicate re-apply); (d)
-- the one live-data assumption the design states outright (bank_matches.matched_via_rule_id
-- is all-null today, so the FK add needs no NOT VALID) is reconfirmed on live rather than
-- trusted from the design's prose.
-- =====================================================================================
do $probe$
declare
  v_prior int; v_dup_relations int; v_dup_rel_names text; v_dup_col int;
  v_anchor int; v_bad_rule_ref int; v_dup_events int; v_dup_event_names text;
  v_no_delete_fn int; v_append_only_trg int;
begin
  -- PROBE 1 -- FRONTIER ASSERT. 0039_statement_balance_null_defers must be the applied
  -- frontier: this file's composite FKs assume 0038's nine bank_* relations and their
  -- anchors are live in their AS-BUILT (0038 + 0039) shape, and the open_item_allocations
  -- backfill assumes 0037's subledger substrate (open_items, journal_entries) is live.
  select count(*)::int into v_prior from clara.schema_migrations
    where version = '0039_statement_balance_null_defers';
  if v_prior <> 1 then
    raise exception '0040 probe 1: migration 0039_statement_balance_null_defers is not recorded as applied -- apply in order';
  end if;

  -- PROBE 2 -- PRE-STATE SAFETY: none of the three relations this file creates already
  -- exist in schema clara. A hit here means a partial or duplicate prior application of
  -- this migration, not a fresh deploy.
  select count(*)::int, string_agg(t.relname, ', ' order by t.relname) into v_dup_relations, v_dup_rel_names
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname in
    ('bank_reconciliations', 'bank_line_exceptions', 'bank_rules');
  if v_dup_relations <> 0 then
    raise exception '0040 probe 2: % relation(s) already exist in schema clara that this migration is about to create (%) -- this looks like a partial or duplicate re-apply, not a fresh deploy', v_dup_relations, v_dup_rel_names;
  end if;

  -- PROBE 3 -- PRE-STATE SAFETY: clara.counterparties does not already carry
  -- payment_terms_days.
  select count(*)::int into v_dup_col from information_schema.columns
  where table_schema = 'clara' and table_name = 'counterparties' and column_name = 'payment_terms_days';
  if v_dup_col <> 0 then
    raise exception '0040 probe 3: clara.counterparties already carries a payment_terms_days column -- this looks like a partial or duplicate re-apply, not a fresh deploy';
  end if;

  -- PROBE 4 -- PRE-STATE SAFETY: clara.open_item_allocations does not already carry
  -- effective_date.
  select count(*)::int into v_dup_col from information_schema.columns
  where table_schema = 'clara' and table_name = 'open_item_allocations' and column_name = 'effective_date';
  if v_dup_col <> 0 then
    raise exception '0040 probe 4: clara.open_item_allocations already carries an effective_date column -- this looks like a partial or duplicate re-apply, not a fresh deploy';
  end if;

  -- PROBE 5 -- PRE-STATE SAFETY: clara.bank_matches carries no constraint touching
  -- matched_via_rule_id yet (guards a partial re-apply of the FK this file adds below).
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'bank_matches' and c.conname = 'fk_bank_matches_rule';
  if v_anchor <> 0 then
    raise exception '0040 probe 5: clara.bank_matches already carries fk_bank_matches_rule -- this looks like a partial or duplicate re-apply, not a fresh deploy';
  end if;

  -- PROBE 6 -- ANCHOR PROBE, positive: clara.bank_statements carries
  -- uq_bank_statements_id_firm_client_account (0038:416), the 4-key congruence anchor this
  -- file's bank_reconciliations.statement_id/prior_statement_id and
  -- bank_line_exceptions.statement_id composite FKs target.
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'bank_statements'
    and c.conname = 'uq_bank_statements_id_firm_client_account' and c.contype = 'u';
  if v_anchor <> 1 then
    raise exception '0040 probe 6: clara.bank_statements is missing uq_bank_statements_id_firm_client_account -- 0038 did not land in the shape this migration assumes';
  end if;

  -- PROBE 7 -- ANCHOR PROBE, positive: clara.bank_accounts carries
  -- uq_bank_accounts_id_firm_client (0038:331), targeted by this file's
  -- bank_reconciliations.bank_account_id and bank_line_exceptions.bank_account_id FKs.
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'bank_accounts'
    and c.conname = 'uq_bank_accounts_id_firm_client' and c.contype = 'u';
  if v_anchor <> 1 then
    raise exception '0040 probe 7: clara.bank_accounts is missing uq_bank_accounts_id_firm_client -- 0038 did not land in the shape this migration assumes';
  end if;

  -- PROBE 8 -- ANCHOR PROBE, positive: clara.bank_statement_lines carries
  -- uq_bank_statement_lines_id_firm_client_account (0038:569-570), targeted by this file's
  -- bank_line_exceptions.line_id composite FK.
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'bank_statement_lines'
    and c.conname = 'uq_bank_statement_lines_id_firm_client_account' and c.contype = 'u';
  if v_anchor <> 1 then
    raise exception '0040 probe 8: clara.bank_statement_lines is missing uq_bank_statement_lines_id_firm_client_account -- 0038 did not land in the shape this migration assumes';
  end if;

  -- PROBE 9 -- ANCHOR PROBE, positive: clara.documents carries uq_documents_id_firm
  -- (0007:58) -- documents carries NO client_id column (dropped 0007:1106), so this file's
  -- bank_line_exceptions.evidence_document_id FK is necessarily a 2-key (id, firm_id)
  -- congruence, not a 3-key -- re-verified here rather than assumed from the design's
  -- looser "firm/client-validated" prose (see s10-notes.md).
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'documents'
    and c.conname = 'uq_documents_id_firm' and c.contype = 'u';
  if v_anchor <> 1 then
    raise exception '0040 probe 9: clara.documents is missing uq_documents_id_firm -- 0007 did not land in the shape this migration assumes';
  end if;
  select count(*)::int into v_anchor
  from information_schema.columns
  where table_schema = 'clara' and table_name = 'documents' and column_name = 'client_id';
  if v_anchor <> 0 then
    raise exception '0040 probe 9b: clara.documents unexpectedly carries a client_id column again -- the evidence_document_id FK shape this file builds (2-key, firm-only) needs re-deriving as a 3-key';
  end if;

  -- PROBE 10 -- ANCHOR PROBE, positive: clara.coa_accounts' primary key is exactly
  -- (client_id, account_code) (0003:56, a natural composite PK -- there is no coa_accounts.id
  -- column), targeted by this file's bank_reconciliations.coa_account_code FK, matching the
  -- 0038:328-329 fk_bank_accounts_coa precedent exactly.
  select count(*)::int into v_anchor
  from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'coa_accounts' and c.contype = 'p'
    and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (client_id, account_code)';
  if v_anchor <> 1 then
    raise exception '0040 probe 10: clara.coa_accounts'' primary key is not exactly (client_id, account_code) -- the coa_account_code FK this file builds needs re-deriving';
  end if;

  -- PROBE 11 -- ANCHOR PROBE, positive: clara.open_item_allocations carries the EXACT
  -- trigger name this file disables/re-enables around its effective_date backfill
  -- (0037:828-829).
  select count(*)::int into v_append_only_trg
  from pg_trigger tg join pg_class t on t.oid = tg.tgrelid join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname = 'open_item_allocations'
    and tg.tgname = 't_open_item_allocations_append_only' and not tg.tgisinternal;
  if v_append_only_trg <> 1 then
    raise exception '0040 probe 11: clara.open_item_allocations is missing (or has renamed) t_open_item_allocations_append_only -- the disable/re-enable backfill window this file opens targets the wrong trigger name';
  end if;

  -- PROBE 12 -- THE NAMED LIVE-DATA ASSUMPTION, RECONFIRMED ON LIVE (design SS4/SS5 item 5:
  -- "existing rows all null, so NOT VALID not needed"). A hit here means the FK add below
  -- would need NOT VALID + a separate VALIDATE step, which this file does not carry.
  select count(*)::int into v_bad_rule_ref
  from clara.bank_matches where matched_via_rule_id is not null;
  if v_bad_rule_ref <> 0 then
    raise exception '0040 probe 12: % clara.bank_matches row(s) already carry a non-null matched_via_rule_id -- the design''s "existing rows all null" assumption does not hold on live; the fk_bank_matches_rule add below needs NOT VALID + VALIDATE, not a plain ADD CONSTRAINT', v_bad_rule_ref;
  end if;

  -- PROBE 13 -- PRE-STATE SAFETY: none of the seven bank.* event-type names this file's
  -- SECTION EVENTS registers already exist in clara.event_types (guards a partial re-apply
  -- and a naked unique-violation at INSERT time).
  select count(*)::int, string_agg(name, ', ' order by name) into v_dup_events, v_dup_event_names
  from clara.event_types where name in (
    'bank.reconciliation_completed', 'bank.reconciliation_voided', 'bank.line_excepted',
    'bank.line_exception_resolved', 'bank.rule_proposed', 'bank.rule_signed', 'bank.rule_retired');
  if v_dup_events <> 0 then
    raise exception '0040 probe 13: % event type(s) already registered that this migration is about to add (%) -- this looks like a partial or duplicate re-apply, not a fresh deploy', v_dup_events, v_dup_event_names;
  end if;

  -- PROBE 14 -- ANCHOR PROBE, positive: the generic no-delete/no-truncate/append-only
  -- trigger functions this file's tables reuse are present (clara._tf_no_truncate,
  -- clara._tf_append_only) -- both predate 0037/0038 and are used pervasively; reconfirmed
  -- by name rather than assumed.
  select count(*)::int into v_no_delete_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'clara' and p.proname in ('_tf_no_truncate', '_tf_append_only');
  if v_no_delete_fn <> 2 then
    raise exception '0040 probe 14: clara._tf_no_truncate / clara._tf_append_only are not both present -- the generic guard functions this file''s triggers reuse are missing';
  end if;

  raise notice '0040-S1 probe OK (0/14): 0039 is the applied frontier, none of the new relations/columns/constraints pre-exist, every composite-FK anchor this file targets is present in its expected shape, bank_matches.matched_via_rule_id is all-null on live, and the generic guard functions this file reuses are present';
end
$probe$;

set role clara_fn_owner;

-- =====================================================================================
-- 4.1 -- clara.bank_reconciliations (design SS4.1). THE RECEIPT IS THE ROW: born only
-- COMPLETE (there is no draft/open state to model -- an "open" reconciliation is a DERIVED
-- preview the read RPC computes live off the tables, never a row here). Lifecycle is
-- VOID-ONLY [L1]: supersession is unreachable by construction, because void_bank_statement's
-- new `recon_present` refusal (SS5 register entry 1, another lane's splice) forces the recon
-- void FIRST on any re-ingest -- so a re-ingested statement starts with no recon at all until
-- a human completes a fresh one. There is deliberately NO superseded_by column here (the
-- 0038 bank_statements.superseded_by dead-column defect [L1/R8/Au14/C11] the ladder found and
-- fixed is not repeated).
--
-- coa_account_code IS THE CERTIFIED BASIS [L1]: the account this receipt's identity was
-- computed against, asserted vs the live coa_accounts.is_bank_account mapping AT INSERT ONLY
-- by the belt (_tf_bank_recon_belt, NOT this file) -- a receipt is bitemporal truth and never
-- re-derives from a later remap. The FK here only proves the code is a REAL account of this
-- client (the static half a declarative FK can express); the "matches the live mapping right
-- now" half is the belt's job.
--
-- prior_statement_id / prior_reconciliation_id [L1]: null prior_statement_id claims the
-- FIRST-PERIOD EXEMPTION exactly once, pinned on the receipt. The chain law itself
-- (`recon_period_gap` refusing a non-contiguous prior) is a VERB-time computation over
-- bank_statements.period_end, not expressible as a static FK -- these two columns exist for
-- LEGIBILITY and belt cross-checks (opening = prior receipt's closing), not as the chain's
-- own enforcement mechanism, which the design states explicitly.
-- =====================================================================================
create table clara.bank_reconciliations (
  id                       uuid        primary key default gen_random_uuid(),
  firm_id                  uuid        not null,
  client_id                uuid        not null,
  bank_account_id          uuid        not null,
  statement_id             uuid        not null,
  coa_account_code         text        not null,
  prior_statement_id       uuid,
  prior_reconciliation_id  uuid,
  period_start             date        not null,
  period_end               date        not null,
  status                   text        not null default 'complete' check (status in ('complete', 'void')),
  opening_cents            bigint      not null,
  gl_balance_cents         bigint      not null,
  closing_cents            bigint      not null,
  -- BINDING (design SS4.1): outstanding_cents := Sum-over-g uncleared(g,P) +
  -- unmatched_capacity'(P) -- the two identity terms combined into ONE stored figure,
  -- signed from the account holder's side per SS3. Cross-checked against the other stored
  -- terms by _tf_bank_recon_belt (arithmetic, NOT this file); no DDL CHECK expresses it
  -- because it is a function of the snapshot jsonb, not of sibling columns alone.
  outstanding_cents        bigint      not null,
  excepted_cents           bigint      not null,
  completed_by             uuid        not null references clara.users(id),
  completed_at             timestamptz not null default now(),
  -- The SS3 snapshot spec: every outstanding entry-side (posting_date + AGE), every
  -- outstanding line-side member, every open-or-resolved-unmatched exception, and every
  -- consumed bank_uncleared opening item's lineage. Enumeration-completeness is the belt's
  -- job; this file only demands SOME object payload.
  snapshot                 jsonb       not null check (jsonb_typeof(snapshot) = 'object'),
  voided_by                uuid        references clara.users(id),
  voided_at                timestamptz,
  voided_reason            text,
  constraint fk_bank_reconciliations_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bank_reconciliations_account foreign key (bank_account_id, firm_id, client_id)
    references clara.bank_accounts(id, firm_id, client_id),
  constraint fk_bank_reconciliations_coa foreign key (client_id, coa_account_code)
    references clara.coa_accounts(client_id, account_code),
  -- The CURRENT statement this receipt certifies -- account-congruent through the 4-key
  -- anchor (0038:416), so a receipt can never certify a statement of a DIFFERENT account
  -- than the one it names directly.
  constraint fk_bank_reconciliations_statement
    foreign key (statement_id, firm_id, client_id, bank_account_id)
    references clara.bank_statements(id, firm_id, client_id, bank_account_id),
  -- The PRIOR statement, same account-congruence shape. Null = the first-period exemption.
  constraint fk_bank_reconciliations_prior_statement
    foreign key (prior_statement_id, firm_id, client_id, bank_account_id)
    references clara.bank_statements(id, firm_id, client_id, bank_account_id),
  -- The tenancy anchor every self-reference (below) and this table's own future referencing
  -- FKs target. Declared BEFORE the self-FK that consumes it (the 0037:749/754-756
  -- open_items.reversal_unwind_of ordering precedent).
  constraint uq_bank_reconciliations_id_firm_client unique (id, firm_id, client_id),
  -- The PRIOR reconciliation, legibility only per SS4.1 (the frontier splice is the true
  -- enforcement of chain order) -- (firm_id, client_id) congruence, not account-scoped.
  constraint fk_bank_reconciliations_prior_recon
    foreign key (prior_reconciliation_id, firm_id, client_id)
    references clara.bank_reconciliations(id, firm_id, client_id),
  constraint ck_bank_reconciliations_self_link check (prior_reconciliation_id is distinct from id),
  constraint ck_bank_reconciliations_prior_statement_distinct
    check (prior_statement_id is distinct from statement_id),
  constraint ck_bank_reconciliations_period check (period_start <= period_end),
  constraint ck_bank_reconciliations_void check (
    (status = 'complete' and voided_by is null and voided_at is null and voided_reason is null)
    or (status = 'void' and voided_by is not null and voided_at is not null
        and voided_reason is not null and btrim(voided_reason) <> ''))
);
-- One LIVE reconciliation per live statement (design SS4.1). A voided receipt frees the
-- statement for a fresh completion, per the void-only lifecycle note above.
create unique index uq_bank_reconciliations_statement_complete on clara.bank_reconciliations
  (statement_id) where status = 'complete';
create index ix_bank_reconciliations_account on clara.bank_reconciliations (bank_account_id, status);
create index ix_bank_reconciliations_client on clara.bank_reconciliations (client_id, status);
-- Supports the verb-level recon_coa_shared query (">1 account any-state on the COA with a
-- live statement", design SS5) -- named here so the belt/verb lane finds it ready.
create index ix_bank_reconciliations_coa on clara.bank_reconciliations (client_id, coa_account_code, status);

-- THE TRANSITION GUARD (the 0038:468-501 _tf_bank_statement_transition idiom, simplified: NO
-- supersession wire exists on this table at all, per the header note above -- complete->void
-- is the ONLY lawful transition). The immutable set is compared WHOLE, as a jsonb of the row
-- minus the four lifecycle columns, so a column added to this table by a later migration is
-- protected by default rather than by somebody remembering to extend a list.
create function clara._tf_bank_reconciliation_transition() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_old jsonb; v_new jsonb;
begin
  v_old := to_jsonb(old) - 'status' - 'voided_by' - 'voided_at' - 'voided_reason';
  v_new := to_jsonb(new) - 'status' - 'voided_by' - 'voided_at' - 'voided_reason';
  if v_old is distinct from v_new then
    raise exception 'bank reconciliations are immutable outside the void transition'
      using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'reconciliation_immutable', 'reconciliation_id', old.id)::text;
  end if;
  if old.status = 'complete' and new.status = 'void'
     and new.voided_by is not null and new.voided_at is not null
     and nullif(btrim(coalesce(new.voided_reason, '')), '') is not null then
    return new;
  end if;
  raise exception 'bank reconciliations are immutable outside the void transition'
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'reconciliation_transition_illegal',
        'reconciliation_id', old.id, 'from_status', old.status, 'to_status', new.status)::text;
end $$;
revoke all on function clara._tf_bank_reconciliation_transition() from public;
create trigger t_bank_reconciliations_transition before update on clara.bank_reconciliations
  for each row execute function clara._tf_bank_reconciliation_transition();

-- A RECEIPT IS NEVER DELETED (the journal_entries "reverse, not delete" law, restated for the
-- reconciliation header for the same reason bank_statements gets it: a deleted receipt takes
-- its snapshot's provenance with it).
create function clara._tf_bank_reconciliation_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'bank reconciliation % is never deleted (void it)', old.id
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'reconciliation_never_deleted', 'reconciliation_id', old.id)::text;
end $$;
revoke all on function clara._tf_bank_reconciliation_no_delete() from public;
create trigger t_bank_reconciliations_no_delete before delete on clara.bank_reconciliations
  for each row execute function clara._tf_bank_reconciliation_no_delete();
create trigger t_bank_reconciliations_no_truncate before truncate
  on clara.bank_reconciliations for each statement execute function clara._tf_no_truncate();

-- RLS: FORCE + fn-owner ALL + firm-scoped human SELECT, ZERO agent/wake grants (the universal
-- posture every bank_* and subledger table in this schema carries -- stated for every table
-- in this file rather than left to convention).
alter table clara.bank_reconciliations enable row level security;
alter table clara.bank_reconciliations force row level security;
create policy p_bank_reconciliations_owner on clara.bank_reconciliations
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_reconciliations_human on clara.bank_reconciliations
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_reconciliations to clara_authenticated;

-- =====================================================================================
-- 4.2 -- clara.bank_line_exceptions (design SS4.2, "the narrow door, made structural"
-- [L1/C5]). The door sits at the OWNER floor (verb-level, not this file's), because a
-- bookkeeper cannot acknowledge away an unbooked payroll run -- only the firm's principal
-- certifies a bank error or a genuine dispute.
--
-- bank_account_id AND statement_id ARE STAMPED, NEVER CALLER-SUPPLIED [own extension of the
-- 0038:691-703 house law, stated there for bank_account_id alone]. except_bank_line's
-- signature carries no p_statement argument at all (design SS5: `except_bank_line(line, kind,
-- reason, evidence_doc?, op_key)`), so statement_id has nowhere else to come from honestly --
-- deriving BOTH denormalized columns from the referenced LINE in the SAME BEFORE INSERT
-- trigger (the exact _tf_stamp_bmlm_account idiom, 0038:744-756) makes them a real
-- corroboration rather than a second place for a caller to (mis)state the same fact.
--
-- unique(line_id) where status='open' -- an open-excepted line is not matchable
-- (`line_already_matched` on the door's own attempt when the line is already a live member;
-- `line_already_excepted` on a second concurrent except) and a matched line is not exceptable
-- -- enforced at the LOCK by the spliced writers (design SS4.2: "closed against write-skew at
-- the lock, not just the belt"), not by this index alone; the index is the belt-and-braces
-- static half.
-- =====================================================================================
create table clara.bank_line_exceptions (
  id                       uuid        primary key default gen_random_uuid(),
  firm_id                  uuid        not null,
  client_id                uuid        not null,
  bank_account_id          uuid        not null,
  statement_id             uuid        not null,
  line_id                  uuid        not null,
  kind                     text        not null check (kind in ('bank_error', 'disputed')),
  reason                   text        not null check (btrim(reason) <> ''),
  evidence_document_id     uuid,
  status                   text        not null default 'open' check (status in ('open', 'resolved')),
  created_by               uuid        not null references clara.users(id),
  created_at               timestamptz not null default now(),
  resolved_by              uuid        references clara.users(id),
  resolved_at              timestamptz,
  resolution_disposition   text        check (resolution_disposition in
                              ('matched_booking', 'bank_corrective_line', 'written_off_adjustment')),
  resolution_note          text,
  constraint fk_ble_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- Account congruence through the LINE (0038:569-570's 4-key anchor) and, independently,
  -- through the STATEMENT (0038:416's 4-key anchor) -- two independent parents meeting at one
  -- bank_account_id column, the exact "account congruence FK through statement and X" trick
  -- 0038 uses for bank_match_line_members (design part1 SS4.5). Belt-and-braces beyond the
  -- BEFORE INSERT stamp: the DECLARED FK is what makes the invariant DB-enforced rather than
  -- trigger-only.
  constraint fk_ble_line foreign key (line_id, firm_id, client_id, bank_account_id)
    references clara.bank_statement_lines(id, firm_id, client_id, bank_account_id),
  constraint fk_ble_statement foreign key (statement_id, firm_id, client_id, bank_account_id)
    references clara.bank_statements(id, firm_id, client_id, bank_account_id),
  -- 2-key: clara.documents carries no client_id column (dropped 0007:1106; re-verified S0
  -- probe 9) -- "firm/client-validated" in the design's prose is therefore a firm-only
  -- congruence at the DDL layer, same shape as 0038's own fk_bank_statements_document.
  constraint fk_ble_evidence_document foreign key (evidence_document_id, firm_id)
    references clara.documents(id, firm_id),
  -- Resolution is disposition-linked [L1 + delta -- design SS3]: no disposition may leave a
  -- line in a term-less hole. The BOOKING-side truth of each disposition (matched_booking
  -- requires the line to be a live member; written_off_adjustment requires the in-txn
  -- booking match; bank_corrective_line requires its named counterpart pair) is verb
  -- territory -- this CHECK only enforces the shape-level coherence a declarative constraint
  -- CAN express: resolved rows always carry a disposition and a note; open rows carry
  -- neither.
  constraint ck_ble_resolution check (
    (status = 'open' and resolved_by is null and resolved_at is null
      and resolution_disposition is null and resolution_note is null)
    or (status = 'resolved' and resolved_by is not null and resolved_at is not null
        and resolution_disposition is not null
        and resolution_note is not null and btrim(resolution_note) <> ''))
);
create unique index uq_ble_line_open on clara.bank_line_exceptions (line_id) where status = 'open';
create index ix_ble_statement on clara.bank_line_exceptions (statement_id, status);
create index ix_ble_client on clara.bank_line_exceptions (client_id, status);

-- The stamping trigger. Runs BEFORE the NOT NULL / FK / unique checks below it, so the row's
-- OWN derived values reach those checks, not whatever (or nothing) the caller passed.
create function clara._tf_stamp_ble_account() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  select bsl.statement_id, bsl.bank_account_id
    into new.statement_id, new.bank_account_id
    from clara.bank_statement_lines bsl where bsl.id = new.line_id;
  if new.bank_account_id is null then
    raise exception 'unknown statement line %', new.line_id using errcode = 'CLR10';
  end if;
  return new;
end $$;
revoke all on function clara._tf_stamp_ble_account() from public;
create trigger t_ble_stamp_account before insert on clara.bank_line_exceptions
  for each row execute function clara._tf_stamp_ble_account();

-- THE STATUS-FLIP LIFECYCLE (the transition-trigger idiom, adapted: open->resolved only;
-- created_by/created_at/line_id/statement_id/bank_account_id/kind/reason/evidence_document_id
-- are frozen forever -- an exception's OWN facts never change, only its resolution). The
-- immutable set is compared whole, minus the five resolution-lifecycle columns.
create function clara._tf_bank_line_exception_transition() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_old jsonb; v_new jsonb;
begin
  v_old := to_jsonb(old) - 'status' - 'resolved_by' - 'resolved_at'
                         - 'resolution_disposition' - 'resolution_note';
  v_new := to_jsonb(new) - 'status' - 'resolved_by' - 'resolved_at'
                         - 'resolution_disposition' - 'resolution_note';
  if v_old is distinct from v_new then
    raise exception 'bank line exceptions are immutable outside the open->resolved transition'
      using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'line_exception_immutable', 'exception_id', old.id)::text;
  end if;
  if old.status = 'open' and new.status = 'resolved'
     and new.resolved_by is not null and new.resolved_at is not null
     and new.resolution_disposition is not null
     and nullif(btrim(coalesce(new.resolution_note, '')), '') is not null then
    return new;
  end if;
  raise exception 'bank line exceptions are immutable outside the open->resolved transition'
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'line_exception_transition_illegal',
        'exception_id', old.id, 'from_status', old.status, 'to_status', new.status)::text;
end $$;
revoke all on function clara._tf_bank_line_exception_transition() from public;
create trigger t_ble_transition before update on clara.bank_line_exceptions
  for each row execute function clara._tf_bank_line_exception_transition();

create function clara._tf_bank_line_exception_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'bank line exception % is never deleted (resolve it)', old.id
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'line_exception_never_deleted', 'exception_id', old.id)::text;
end $$;
revoke all on function clara._tf_bank_line_exception_no_delete() from public;
create trigger t_ble_no_delete before delete on clara.bank_line_exceptions
  for each row execute function clara._tf_bank_line_exception_no_delete();
create trigger t_ble_no_truncate before truncate
  on clara.bank_line_exceptions for each statement execute function clara._tf_no_truncate();

alter table clara.bank_line_exceptions enable row level security;
alter table clara.bank_line_exceptions force row level security;
create policy p_ble_owner on clara.bank_line_exceptions
  for all to clara_fn_owner using (true) with check (true);
create policy p_ble_human on clara.bank_line_exceptions
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_line_exceptions to clara_authenticated;

-- =====================================================================================
-- 4.3 -- clara.bank_rules + suggestions-as-reads (design SS4.3). Suggestions are READS --
-- NO rule ever executes anything; list_bank_line_suggestions (another lane's RPC) evaluates
-- SIGNED rules at call time. This file carries only the rule row's own lifecycle.
--
-- CONTENT_HASH CANONICALISATION (design SS4.3 note: "define it as sha256 over kind ||
-- canonical-json(pattern) -- document the exact canonicalisation in a comment"). This
-- migration does NOT compute content_hash (that is propose_bank_rule's job, another lane) --
-- it only carries the column + its shape CHECK. THE CONTRACT the verb lane must satisfy,
-- verified against the existing house helper (clara._hash(jsonb) returns bytea, 0004:32-33 --
-- `select sha256(convert_to(p::text, 'UTF8'))`, already the canonical-json hash primitive
-- every op-key uses):
--     content_hash := encode(clara._hash(jsonb_build_object('kind', p_kind, 'pattern', p_pattern)), 'hex')
-- jsonb's own ::text cast is ALREADY key-order-canonical (Postgres stores jsonb object keys in
-- a fixed internal order -- by key length then lexicographic -- never insertion order), which
-- is what makes clara._hash(jsonb) a legitimate canonical-json hash without this migration
-- inventing a second canonicalisation scheme.
--
-- SIGNED CONTENT IS IMMUTABLE [L1/C14]: pattern/proposal/evidence are FROZEN at creation -- a
-- change is a NEW proposed rule, never an edit.
--
-- LIFECYCLE, AS ADJUDICATED AT ASSEMBLY (order item 10): proposed -> signed -> retired, PLUS
-- the WITHDRAWAL arm proposed -> retired. S1's first draft and S3's retire_bank_rule both read
-- the design's `rule_not_signed` refusal as forbidding a direct proposed->retired move, which
-- left a never-signed proposal IMMORTAL: it can never be signed away, never retired, and its
-- (client_id, kind, content_hash) slot stays occupied by uq_bank_rules_content forever, so the
-- identical pattern can never be re-proposed. That is a live product trap, not a safety
-- property -- the adjudication opens the arm. A WITHDRAWN rule is a retired rule that was
-- never signed: signed_by/signed_at stay NULL, retired_by/retired_at/retired_reason are all
-- mandatory (the reason is what makes a withdrawal auditable), and the freed hash slot is the
-- point. `rule_not_signed` survives as the refusal token, now meaning "not in a retirable
-- state" (i.e. already retired).
-- =====================================================================================
create table clara.bank_rules (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null,
  client_id       uuid        not null,
  kind            text        not null check (kind in ('match_settle', 'coding')),
  status          text        not null default 'proposed' check (status in ('proposed', 'signed', 'retired')),
  -- Word-bounded tokens over MULTI-LINE description + direction (+ optional amount shape),
  -- the C-b containsSynonym idiom (design SS4.3). Shape only asserted here; the pattern
  -- GRAMMAR itself is verb/runtime territory.
  pattern         jsonb       not null check (jsonb_typeof(pattern) = 'object'),
  -- match_settle: {domain, counterparty_id}. coding: {account_code, narration_template,
  -- counterparty_id?}. Which shape is not a DDL-expressible invariant (it depends on `kind`,
  -- a sibling column, cross-referenced against jsonb keys) -- verb territory.
  proposal        jsonb       not null check (jsonb_typeof(proposal) = 'object'),
  -- DERIVED IN-VERB [L1/Au10]: propose_bank_rule recomputes the sighting set with the
  -- candidates-RPC predicate and refuses `rule_evidence_insufficient` below the >=3 floor;
  -- callers never supply evidence directly. Shape only asserted here.
  evidence        jsonb       not null check (jsonb_typeof(evidence) = 'object'),
  content_hash    text        not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by      uuid        not null references clara.users(id),
  created_at      timestamptz not null default now(),
  signed_by       uuid        references clara.users(id),
  signed_at       timestamptz,
  retired_by      uuid        references clara.users(id),
  retired_at      timestamptz,
  retired_reason  text,
  constraint fk_bank_rules_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- The tenancy anchor bank_matches.matched_via_rule_id targets (below).
  constraint uq_bank_rules_id_firm_client unique (id, firm_id, client_id),
  constraint ck_bank_rules_lifecycle check (
    (status = 'proposed' and signed_by is null and signed_at is null
      and retired_by is null and retired_at is null and retired_reason is null)
    or (status = 'signed' and signed_by is not null and signed_at is not null
        and retired_by is null and retired_at is null and retired_reason is null)
    -- RETIRED covers BOTH exits (assembly order item 10): a retired SIGNED rule carries the
    -- signed pair; a WITHDRAWN (never-signed) rule carries neither. The signed pair is
    -- all-or-nothing either way, and the retired triple is always mandatory.
    or (status = 'retired'
        and ((signed_by is not null and signed_at is not null)
             or (signed_by is null and signed_at is null))
        and retired_by is not null and retired_at is not null
        and retired_reason is not null and btrim(retired_reason) <> ''))
);
-- unique(client_id, kind, content_hash) WHERE status in ('proposed','signed') [L1/Au12]: a
-- retired rule's hash is free to be re-proposed (the remedy for a noisy rule is retire + a
-- fresh proposal, per the design's residuals note), but two LIVE (proposed or signed) rules
-- can never share one pattern identity.
create unique index uq_bank_rules_content on clara.bank_rules (client_id, kind, content_hash)
  where status in ('proposed', 'signed');
create index ix_bank_rules_client on clara.bank_rules (client_id, kind, status);

-- THE TRANSITION GUARD. Six lifecycle columns excluded from the immutable-set comparison:
-- status + the two signed_*/retired_* pairs.
create function clara._tf_bank_rule_transition() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_old jsonb; v_new jsonb;
begin
  v_old := to_jsonb(old) - 'status' - 'signed_by' - 'signed_at'
                         - 'retired_by' - 'retired_at' - 'retired_reason';
  v_new := to_jsonb(new) - 'status' - 'signed_by' - 'signed_at'
                         - 'retired_by' - 'retired_at' - 'retired_reason';
  if v_old is distinct from v_new then
    raise exception 'bank rules are immutable outside the proposed->signed->retired transitions'
      using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'rule_immutable', 'rule_id', old.id)::text;
  end if;
  -- proposed -> signed.
  if old.status = 'proposed' and new.status = 'signed'
     and new.signed_by is not null and new.signed_at is not null
     and new.retired_by is null and new.retired_at is null and new.retired_reason is null then
    return new;
  end if;
  -- signed -> retired. The signed_by/signed_at pair, once set, never moves again.
  if old.status = 'signed' and new.status = 'retired'
     and new.signed_by is not distinct from old.signed_by
     and new.signed_at is not distinct from old.signed_at
     and new.retired_by is not null and new.retired_at is not null
     and nullif(btrim(coalesce(new.retired_reason, '')), '') is not null then
    return new;
  end if;
  -- proposed -> retired: THE WITHDRAWAL ARM (assembly order item 10). A never-signed proposal
  -- is retracted, not signed-then-retired: the signed pair must stay NULL (a withdrawal must
  -- never be able to forge an approval), and the retired triple is mandatory, so the act is
  -- always attributable and reasoned. Retiring frees the uq_bank_rules_content slot, which is
  -- what makes a corrected pattern re-proposable.
  if old.status = 'proposed' and new.status = 'retired'
     and new.signed_by is null and new.signed_at is null
     and new.retired_by is not null and new.retired_at is not null
     and nullif(btrim(coalesce(new.retired_reason, '')), '') is not null then
    return new;
  end if;
  raise exception 'bank rules are immutable outside the proposed->signed->retired transitions'
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'rule_transition_illegal',
        'rule_id', old.id, 'from_status', old.status, 'to_status', new.status)::text;
end $$;
revoke all on function clara._tf_bank_rule_transition() from public;
create trigger t_bank_rules_transition before update on clara.bank_rules
  for each row execute function clara._tf_bank_rule_transition();

create function clara._tf_bank_rule_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'bank rule % is never deleted (retire it)', old.id
    using errcode = 'CLR08',
      detail = jsonb_build_object('reason', 'rule_never_deleted', 'rule_id', old.id)::text;
end $$;
revoke all on function clara._tf_bank_rule_no_delete() from public;
create trigger t_bank_rules_no_delete before delete on clara.bank_rules
  for each row execute function clara._tf_bank_rule_no_delete();
create trigger t_bank_rules_no_truncate before truncate
  on clara.bank_rules for each statement execute function clara._tf_no_truncate();

alter table clara.bank_rules enable row level security;
alter table clara.bank_rules force row level security;
create policy p_bank_rules_owner on clara.bank_rules
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_rules_human on clara.bank_rules
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_rules to clara_authenticated;

-- =====================================================================================
-- 4.3b -- clara.bank_matches.matched_via_rule_id composite FK (design SS4.3 / SS5 item 5).
-- The column already exists, forward-reserved, unenforced since 0038 (0038:612:
-- "matched_via_rule_id carries NO FK: no bank-matching rule table exists yet (that is
-- C-c's), so this is a forward-reserved column, unenforced until C-c adds one"). Existing
-- rows are all-null (S0 probe 12, reconfirmed live), so a plain ADD CONSTRAINT needs no NOT
-- VALID / VALIDATE step.
-- =====================================================================================
alter table clara.bank_matches
  add constraint fk_bank_matches_rule foreign key (matched_via_rule_id, firm_id, client_id)
  references clara.bank_rules(id, firm_id, client_id);

-- =====================================================================================
-- 4.4a -- clara.counterparties.payment_terms_days (design SS4.4). ADD COLUMN only: the
-- _tf_counterparty_update_0011 recut that makes this column WRITABLE (its non-merge branch's
-- positive column whitelist, `array['name','name_normalized','updated_at']` at 0011:951,
-- would otherwise refuse an UPDATE naming this column outright -- verified live at that exact
-- line) is SS5 register entry 8, the SPLICE lane's deliverable, NOT this file's. The range
-- bound (>0 and <=365) is restated here as a DDL CHECK, belt-and-braces alongside
-- set_counterparty_terms' own `terms_out_of_range` refusal (SS5) -- the same reasoning 0038
-- applies to e.g. bank_statement_lines.line_no > 0: a static bound a caller can never
-- legitimately violate belongs in the schema as well as the verb.
-- =====================================================================================
alter table clara.counterparties add column payment_terms_days int
  check (payment_terms_days is null or (payment_terms_days > 0 and payment_terms_days <= 365));
comment on column clara.counterparties.payment_terms_days is
  'Per-counterparty default terms (design SS4.4). Consumed ONLY by the due_date birth-stamp '
  'in _subledger_on_approve''s splice (SS5 register entry 7), itself scoped to '
  'item_kind in (''invoice'',''bill'') -- a settlement item never reads overdue. Written ONLY '
  'by set_counterparty_terms (bookkeeper floor); the _tf_counterparty_update_0011 whitelist '
  'widening that makes this column writable is a separate splice (SS5 register entry 8).';

-- =====================================================================================
-- 4.4b -- clara.open_item_allocations.effective_date (design SS4.4 [L1 -- "the as-of grain
-- the substrate lacks"]). ADD COLUMN nullable -> backfill the live rows inside an EXPLICIT
-- disable/re-enable window of t_open_item_allocations_append_only (0037:828-829, reconfirmed
-- present by name at S0 probe 11) -> SET NOT NULL. The sibling read fn
-- _subledger_outstanding_asof(item, as_of) this column exists to feed is another lane's
-- deliverable (SS4.4: "the existing fn is untouched (5 callers)").
--
-- PRODUCER LAW (design SS4.4): 'unallocate' -> the row's own created_at::date (the house
-- reverse-not-delete precedent -- corrected history is NOT retroactive, matching
-- reverse_entry's current-date mirror). 'allocate'/'apply' -> "the posting_date of the
-- journal entry behind the settlement/adjustment item that anchors the same
-- application_group".
--
-- THE 'allocate' HALF IS UNAMBIGUOUS AND VERIFIED against the live body of
-- clara._subledger_on_approve (0037:1120-1260, esp. 1131-1138 + 1250-1257): every 'allocate'
-- application_group carries EXACTLY ONE item of item_kind='settlement' (v_settle, asserted
-- v_settle_n=1 at 1151-1156), whose entry_id IS the settlement entry allocate_receipt/
-- allocate_payment just created -- so "the anchor settlement item's entry" is a real,
-- singular, well-defined object for every allocate group, with no ambiguity. Step 2a below
-- anchors on THAT item specifically (a targeted join, never MAX()) -- a settlement is
-- routinely posted AFTER the invoice/bill it settles, but nothing in the schema GUARANTEES
-- that ordering, so a MAX()-over-group shortcut would silently pick the wrong entry on any
-- estate where a claim happens to carry a later posting_date than its own settlement, and
-- this migration does not risk that on the unambiguous half.
--
-- THE 'apply' HALF IS NOT A LITERAL MATCH TO THE SUBSTRATE -- STATED LOUDLY, PER THE VERIFY-
-- DON''T-GUESS MANDATE, RATHER THAN SILENTLY IMPROVISED. clara.apply_open_items
-- (0037:3225-3400) creates NO open_items row at all -- it only inserts INTO
-- open_item_allocations, pairing two EXISTING items. Its own header comment (0037:721-724)
-- names "the canonical case" as applying a credit_note to an invoice, and NEITHER side of
-- that canonical pair is ever item_kind='adjustment' (credit_note and invoice are their own
-- distinct kinds, per ck_open_items_kind_matrix, 0037:764-769) -- so a literal
-- item_kind IN ('settlement','adjustment') join, which correctly resolves 'allocate', finds
-- NO anchor at all for the canonical 'apply' shape. Step 2b below instead takes the LATEST
-- posting_date among the journal entries behind EVERY item in the row''s own
-- application_group (MAX(), across possibly several source/target pairs sharing one group)
-- -- mathematically the earliest date at which BOTH sides of every offset in the group could
-- have existed (an as-of read before that date cannot honestly show the offset applied).
-- This is a REASONED SUBSTITUTION for the design's item-kind-based wording, not a verbatim
-- implementation of it -- flagged as an OPEN QUESTION in s10-notes.md for the
-- assembler/owner to confirm or correct BEFORE apply_open_items (if ever spliced) is made to
-- write this column going forward, and backed by a hard safety net below: the migration
-- REFUSES to proceed (raises, names the row count) rather than SET NOT NULL over any row
-- either derivation could not resolve.
-- =====================================================================================
alter table clara.open_item_allocations add column effective_date date;

alter table clara.open_item_allocations disable trigger t_open_item_allocations_append_only;

-- Step 1 -- 'unallocate' rows.
update clara.open_item_allocations
   set effective_date = created_at::date
 where operation_kind = 'unallocate';

-- Step 2a -- 'allocate' rows: the SINGLE item_kind='settlement' member's own entry, targeted
-- (never MAX() -- see the section header for why that distinction is load-bearing here).
update clara.open_item_allocations oa
   set effective_date = anchor.posting_date
  from (
    select oa2.application_group, je.posting_date
      from clara.open_item_allocations oa2
      join clara.open_items oi on oi.id = oa2.item_id
      join clara.journal_entries je on je.id = oi.entry_id
     where oa2.operation_kind = 'allocate' and oi.item_kind = 'settlement'
  ) anchor
 where oa.application_group = anchor.application_group
   and oa.operation_kind = 'allocate';

-- Step 2b -- 'apply' rows: MAX(posting_date) over the journal entries behind every item in
-- the row's own application_group (the reasoned fallback; see the section header).
update clara.open_item_allocations oa
   set effective_date = grp.anchor_date
  from (
    select oa2.application_group, max(je.posting_date) as anchor_date
      from clara.open_item_allocations oa2
      join clara.open_items oi on oi.id = oa2.item_id
      join clara.journal_entries je on je.id = oi.entry_id
     where oa2.operation_kind = 'apply'
     group by oa2.application_group
  ) grp
 where oa.application_group = grp.application_group
   and oa.operation_kind = 'apply';

-- THE HARD SAFETY NET. STOP LOUDLY rather than guess: any row still null here is either an
-- operation_kind outside the three handled above, or a group whose items could not be joined
-- back to a live journal entry -- either is a data-integrity gap this migration must not
-- paper over with a silent default.
do $backfill_check$
declare v_unresolved int; v_total int;
begin
  select count(*) into v_total from clara.open_item_allocations;
  select count(*) into v_unresolved
    from clara.open_item_allocations where effective_date is null;
  if v_unresolved <> 0 then
    raise exception '0040 effective_date backfill: % of % row(s) in clara.open_item_allocations could not be resolved to an anchor entry -- refusing to proceed on a guess (see s10-notes.md, the apply-side OPEN QUESTION)', v_unresolved, v_total;
  end if;
  raise notice '0040 effective_date backfill OK: all % row(s) resolved', v_total;
end $backfill_check$;

alter table clara.open_item_allocations enable trigger t_open_item_allocations_append_only;

alter table clara.open_item_allocations alter column effective_date set not null;

comment on column clara.open_item_allocations.effective_date is
  'The as-of grain _subledger_outstanding_asof(item, as_of) sums against (design SS4.4). '
  'Producer law: operation_kind=''unallocate'' writes the row''s own created_at::date (not '
  'retroactive, matching reverse_entry''s current-date mirror). '
  'operation_kind in (''allocate'',''apply'') writes the posting_date of the journal entry '
  'behind the row''s application_group -- for ''allocate'' this is the singular settlement '
  'item''s entry (unambiguous); for ''apply'' this migration''s backfill used MAX(posting_date) '
  'over the group''s items (an OPEN QUESTION for the apply_open_items producer -- see '
  's10-notes.md and this column''s migration comment in 0040 for the full reasoning) since the '
  'design''s literal "settlement/adjustment item" wording does not resolve for apply''s '
  'canonical credit_note-to-invoice case. NEVER caller-supplied; always derived at write time '
  'by the producing verb.';


-- #####################################################################################
-- ####################### SECTION S2 -- THE IDENTITY CORE #############################
-- #####################################################################################

-- 0040 SECTION S2 -- THE IDENTITY CORE (Wave C-c tie-out).
--
-- DESIGN OF RECORD: the C-c design v2.1 -- section 3 (the identities, the opening anchor, the
-- bitemporal receipt law, the settled-period law, the chain law, the snapshot spec), section 5
-- (verbs, floors, locks, the two belts, the refusal table), section 4.1/4.2 (the receipt and
-- the exception door as columns), section 9 (acceptance). The ladder record (part 2) is the
-- register of defect classes this file must be immune to; every finding row that lands inside
-- this lane is cited BY NUMBER at the line that answers it.
--
-- WHAT THIS FRAGMENT SHIPS, and nothing else:
--   S2.1  clara._bank_recon_terms(statement, cutoff)      -- THE ONE derivation. Every term in
--         section 3, plus the section-3 snapshot, computed once so the verb, the belt and the
--         read RPC can never drift from one another (the _subledger_outstanding lesson,
--         0037:874-880, restated: a formula computed in six places is how a matcher drifts
--         from itself).
--   S2.2  clara.complete_bank_reconciliation(statement, ack_outstanding, op_key)
--   S2.3  clara.void_bank_reconciliation(recon, reason, op_key)
--   S2.4  clara._tf_bank_recon_belt              -- SNAPSHOT COHERENCE (arithmetic), deferred,
--         on clara.bank_reconciliations only.
--   S2.5  clara._tf_bank_settled_authority_belt  -- AUTHORITY ONLY (never arithmetic),
--         deferred, on bank_match_line_members + bank_match_entry_members +
--         bank_line_exceptions.
--   S2.6  the ACL block for everything above.
--
-- WHAT THIS FRAGMENT DELIBERATELY DOES **NOT** SHIP (owed by sibling lanes; the notes file
-- carries the full owed-list): the clara.bank_reconciliations / clara.bank_line_exceptions
-- TABLE DDL, RLS and their BEFORE-UPDATE transition guard (schema lane, design 4.1/4.2); the
-- exception verbs except_bank_line / resolve_bank_line_exception (design 4.2/5); the rules
-- family (4.3); the aging/terms family (4.4); the read RPCs (6); the twelve splices (5) --
-- including recon_present on void_bank_statement, recon_period_settled on unmatch_bank_match
-- and complete_pending_match, recon_frontier_backfill on _persist_statement_core; the event
-- registrations (4.5) and the tail asserts. This file assumes the tables exist above it and
-- that the assembler's single `reset role;` sits at the true end of the fn-owner scope.
--
-- ASSEMBLY SEAM: like 0038 SECTION D, this fragment RE-OPENS the fn-owner region and does not
-- close it. If the assembling lane splices it inside an already-open region the `set role`
-- below is a harmless no-op.
--
-- HOUSE IDIOMS COPIED, NEVER INVENTED: _human_ctx(role_rank(...)) + op-key reserve/finish
-- (0004:46-68, 0004:299-309); advisory rungs 203005004 (client) and 203005006 (per-account
-- statement chain) in that order (0038:2241-2242 -- void_bank_statement's own order);
-- row locks in id order (0038:2252-2255); deferred constraint triggers that RE-QUERY BY ID and
-- never read the NEW tuple (0009:524-529 via 0038:3220-3226); named refusals carrying
-- errcode CLR10 + detail {"reason":"<token>"} (CLR11 for tenancy) -- the exact 0038 code
-- assignment; ID-ONLY event payloads (0038:4226-4232).

set role clara_fn_owner;

-- =====================================================================================
-- S2.1 -- clara._bank_recon_terms. THE ONE DERIVATION.
--
-- SIGN CONVENTION, restated once because every number below depends on it (0038 SECTION D's
-- header, verbatim in substance): a statement line's amount_cents is SIGNED, + = INTO the
-- account. A positive line matches an entry that DEBITS the bank COA. Every term below is
-- signed from the account holder's side, which is design 4.1's stated polarity for
-- outstanding_cents.
--
-- THE IDENTITY (design section 3, exact-zero, WCC-R2):
--
--   S.closing = opening_anchor + gl'(P) - SUM_g uncleared(g,P) - unmatched_capacity'(P)
--                              + excepted(P)
--
-- ALL TERMS ARE ACCOUNT-SCOPED AND ALL-TIME (<= P.end). Only the completion PRECONDITION is
-- period-scoped, and that lives in the verb, not here. [ladder rows 1, 3, 4 -- the three
-- blockers all four review lanes converged on: an all-time excepted term, line-grain
-- uncleared, and the acknowledged posting-date exception folded in rather than refused.]
--
-- THE TERMS, each stated exactly as section 3 states it:
--
--   gl(P)   = SUM(debit-credit) over APPROVED journal_lines on c with posting_date <= P.end,
--             under the bitemporal cutoff (below).
--   gl'(P)  = gl(P) - anchor_amount, where anchor_amount is the net movement on c of the
--             OPENING-ANCHOR ENTRY SET (below). For a zero-first-opening account the anchor
--             set is empty and gl' = gl, exactly as section 3 says.
--
--   uncleared(g,P) = SUM matched_cents of g's ENTRY members whose entry posts <= P.end
--                  - SUM amount_cents of g's LINE members whose statement period_end <= P.end
--             per LIVE group g. A group wholly inside one period contributes 0; a cross-month
--             straddle self-splits; a line matched only to later-posted entries (C-b's
--             acknowledged posting_date_exception, 0038:812-816) contributes its full bank
--             side with the opposite sign -- an honest timing item, NEVER a refusal.
--
--   unmatched_capacity'(P), THE EXACT PER-SIDE abs() FORM [ladder row 13, delta-corrected]:
--             (dr_capacity - SUM positive live consumption)
--           - (cr_capacity - SUM |negative live consumption|)
--             summed over approved entries on c posting <= P.end, ANCHOR SET EXCLUDED.
--             THE SUBTRACTED CONSUMPTION IS EACH ENTRY'S **TOTAL** LIVE-GROUP CONSUMPTION,
--             REGARDLESS OF LINE DATES -- an entry fully consumed by a live group contributes
--             0 here even when its lines clear later. The entry-vs-line timing lives ONLY
--             inside uncleared(g,P). [The delta round proved the line-dated reading
--             double-counts every matched-but-uncleared entry: 4 of 6 canonical shapes failed.
--             This comment is the pin.]
--
--   excepted(P) = SUM signed amount_cents of ALL lines of A on LIVE statements with
--             period_end <= P.end whose exception is OPEN, or RESOLVED WITH THE LINE STILL
--             UNMATCHED. All-time, like every other term [ladder row 1]. Summed PER LINE, not
--             per exception row -- unique(line_id) where status='open' still admits several
--             historical resolved rows on one line, and summing those would double count.
--
-- THE OPENING ANCHOR (delta round, the takeover case). opening_anchor = the account's FIRST
-- LIVE statement's opening_cents. For an account whose first statement opens at 0 that is 0
-- and the anchor set is empty. For a takeover account the anchor set is the K carry-down
-- gl_balance entries on c, reached through the 0017 opening-item lineage
-- (clara.opening_items.entry_id is UNIQUE and NOT NULL, 0017:1131 -- one entry per item; the
-- gl_balance branch writes its typed legs plus the OBE contra, 0017:3246-3275), and the
-- takeover tie is
--       anchor_amount - SUM(bank_uncleared entry movement on c) = S_first.opening_cents
-- which the verb refuses by the name recon_opening_mismatch. bank_uncleared entries stay IN
-- gl' and IN capacity' -- they are pre-cutover instruments that WILL match future lines.
--
-- SUPERSEDED OPENING ITEMS NEED NO SPECIAL CASE, and that is a substrate fact, not an
-- assumption: 0017's correction ceremony approves a REVERSAL MIRROR of the superseded item's
-- entry (0017:4239-4242 selects drafts whose reversal_of is a seed item's entry), so the
-- superseded original and its mirror net to zero inside gl and inside capacity' on their own.
-- The anchor set is therefore state='active' only.
--
-- THE BITEMPORAL CUTOFF [ladder row 37 / Codex C6 BLOCKER]. Every journal read below is gated
-- on approval visibility at p_cutoff. The column is clara.journal_entries.approved_at
-- (0003:120) -- VERIFIED AT BUILD, and it is the right one: _tf_entry_immutable admits the
-- draft->approved UPDATE only when new.approved_at is not null (0003:367-370, recut identically
-- at 0009:550-553 / 0015:1061-1064 / 0016:4957-4960), and EVERY approval writer in the estate
-- stamps approved_at = now() (0004:549, 0005:886, 0007:1319/2597, 0009:1673/2505, 0011:3148,
-- 0015:1461, 0016:1446/5408.., 0017:3810, 0027:304, 0037's core). So "approved and visible at
-- T" is exactly `status='approved' and approved_at is not null and approved_at <= T`. The
-- receipt's completed_at IS the cutoff; a later back-dated approval changes the LIVE preview
-- and never the receipt.
--
-- MATCH VISIBILITY IS GATED TOO (an S2 addition, stated openly rather than smuggled). The
-- design's bitemporal clause names journal reads. But "verification recomputes under the
-- cutoff and must reproduce the receipt byte-exactly FOREVER" is only true if the group set is
-- also as-of. bank_matches carries created_at / completed_at / unmatched_at, which is enough
-- to express it exactly, and at completion time (cutoff = now()) the gate is a no-op because
-- every in-txn row carries now(). See v_live_matches below.
--
-- RETURNS a single jsonb carrying every term, the difference, and the section-3 snapshot.
-- NULL when the statement does not exist. It RAISES NOTHING: naming a refusal is the verb's
-- job, and a read RPC must be able to render the same numbers as a labelled preview without
-- being refused (design 6, get_bank_reconciliation).
-- =====================================================================================
create function clara._bank_recon_terms(p_statement uuid, p_cutoff timestamptz)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  s record; v_coa text; v_client uuid; v_firm uuid; v_acct uuid;
  v_accounts uuid[];                 -- every bank account of this client on COA c, any state
  v_first_id uuid; v_first_opening bigint;
  v_anchor_entries uuid[] := '{}'::uuid[];
  v_anchor_amount bigint := 0;
  v_uncleared_opening bigint := 0;
  v_opening_anchor bigint := 0;
  v_live_matches uuid[] := '{}'::uuid[];
  v_rev_excluded uuid[] := '{}'::uuid[];
  v_gl bigint := 0; v_gl_prime bigint := 0;
  v_cap_prime bigint := 0; v_uncleared bigint := 0; v_excepted bigint := 0;
  v_outstanding bigint := 0; v_difference bigint := 0;
  v_matched_lines bigint := 0; v_anchor_consumed bigint := 0;
  v_entry_sides jsonb := '[]'::jsonb;
  v_group_items jsonb := '[]'::jsonb;
  v_line_sides  jsonb := '[]'::jsonb;
  v_exceptions  jsonb := '[]'::jsonb;
  v_bank_uncl   jsonb := '[]'::jsonb;
  v_rev_pairs   jsonb := '[]'::jsonb;
begin
  select * into s from clara.bank_statements bs where bs.id = p_statement;
  if not found then return null; end if;
  v_client := s.client_id; v_firm := s.firm_id; v_acct := s.bank_account_id;

  select ba.coa_account_code into v_coa from clara.bank_accounts ba where ba.id = v_acct;
  if v_coa is null then return null; end if;

  -- Every account of this client mapped to the SAME COA, in any state. Capacity, consumption
  -- and the line universe are all keyed on the COA, not the account id -- the same correction
  -- 0038's entry-exhaustion belt already carries (0038:3388-3394): the where-active partial
  -- uniques let a DEACTIVATED account still holding live groups share a COA with a fresh live
  -- one, and an account-id pool would count each group set separately. The verb's
  -- recon_coa_shared refusal is what guarantees at most ONE of these accounts has live
  -- statements, so COA scope and account scope coincide for a completable account -- but the
  -- pool is keyed the way capacity is keyed, always. [ladder row 6]
  select coalesce(array_agg(ba.id), '{}'::uuid[]) into v_accounts
    from clara.bank_accounts ba
    where ba.client_id = v_client and ba.firm_id = v_firm and ba.coa_account_code = v_coa;

  -- ---------------------------------------------------------------
  -- THE OPENING ANCHOR. The account's FIRST live statement is the takeover boundary.
  -- ---------------------------------------------------------------
  select bs.id, bs.opening_cents into v_first_id, v_first_opening
    from clara.bank_statements bs
    where bs.bank_account_id = v_acct and bs.status = 'live'
    order by bs.period_end asc, bs.period_start asc, bs.id asc
    limit 1;
  v_opening_anchor := coalesce(v_first_opening, s.opening_cents);

  -- THE ANCHOR ENTRY SET: the active gl_balance carry-down entries that carry a leg on c.
  -- 0017 lineage: opening_items.entry_id -> journal_entries; item_kind='gl_balance' is the GL
  -- carry-down branch (0017:3246), state='active' excludes superseded items (whose entries are
  -- reversed and self-netting, see the header).
  select coalesce(array_agg(distinct oi.entry_id), '{}'::uuid[]) into v_anchor_entries
    from clara.opening_items oi
    join clara.journal_entries je on je.id = oi.entry_id
    where oi.client_id = v_client and oi.firm_id = v_firm
      and oi.item_kind = 'gl_balance' and oi.state = 'active'
      and je.status = 'approved' and je.approved_at is not null and je.approved_at <= p_cutoff
      and exists (select 1 from clara.journal_lines jl
                  where jl.entry_id = oi.entry_id and jl.account_code = v_coa);

  select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint into v_anchor_amount
    from clara.journal_lines jl
    where jl.entry_id = any(v_anchor_entries) and jl.account_code = v_coa;

  -- THE PRE-CUTOVER UNCLEARED INSTRUMENTS, on c, with their item-granularity lineage
  -- (opening_item_id + item_ref + item_date via entry_id) -- design section 3's snapshot spec
  -- names exactly these three [ladder row 14]. bank_uncleared items are CHECK-forced to carry
  -- item_ref and item_date (0017:1168-1170), so the lineage is never null.
  select coalesce(sum(t.amt), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
             'opening_item_id', t.item_id, 'item_ref', t.item_ref, 'item_date', t.item_date,
             'entry_id', t.entry_id, 'amount_cents', t.amt,
             'consumed', t.consumed) order by t.item_date, t.item_id), '[]'::jsonb)
    into v_uncleared_opening, v_bank_uncl
    from (
      select oi.id as item_id, oi.item_ref, oi.item_date, oi.entry_id,
             coalesce((select sum(jl.debit_cents - jl.credit_cents)
                       from clara.journal_lines jl
                       where jl.entry_id = oi.entry_id and jl.account_code = v_coa), 0)::bigint as amt,
             exists (select 1 from clara.bank_match_entry_members em
                     where em.entry_id = oi.entry_id
                       and em.group_status in ('pending','live')) as consumed
      from clara.opening_items oi
      join clara.journal_entries je on je.id = oi.entry_id
      where oi.client_id = v_client and oi.firm_id = v_firm
        and oi.item_kind = 'bank_uncleared' and oi.state = 'active'
        and je.status = 'approved' and je.approved_at is not null and je.approved_at <= p_cutoff
        and exists (select 1 from clara.journal_lines jl
                    where jl.entry_id = oi.entry_id and jl.account_code = v_coa)
    ) t;

  -- ---------------------------------------------------------------
  -- THE LIVE GROUP SET, AS OF THE CUTOFF. Defined ONCE and reused by every term below, so
  -- "live" cannot mean two different things in two different queries.
  --   * created at or before the cutoff, and
  --   * already flipped to live at or before the cutoff (completed_at, falling back to
  --     created_at for the groups match_bank_line stamps at birth), and
  --   * still live now, OR unmatched only AFTER the cutoff -- a group that was live when the
  --     receipt was written stays in that receipt's derivation forever.
  -- A group PENDING at the cutoff is excluded outright: it holds no entry member by
  -- construction (0038's group-tie belt, pending arm), and its line lies in a period the
  -- completion refuses under recon_line_reserved.
  -- ---------------------------------------------------------------
  select coalesce(array_agg(bm.id), '{}'::uuid[]) into v_live_matches
    from clara.bank_matches bm
    where bm.bank_account_id = any(v_accounts)
      and bm.created_at <= p_cutoff
      and coalesce(bm.completed_at, bm.created_at) <= p_cutoff
      and (bm.status = 'live'
           or (bm.status = 'unmatched' and bm.completed_at is not null
               and bm.unmatched_at > p_cutoff));

  -- ---------------------------------------------------------------
  -- gl(P) and gl'(P).
  -- ---------------------------------------------------------------
  select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint into v_gl
    from clara.journal_lines jl
    join clara.journal_entries je on je.id = jl.entry_id
    where je.client_id = v_client and je.firm_id = v_firm
      and je.status = 'approved' and je.approved_at is not null and je.approved_at <= p_cutoff
      and je.posting_date <= s.period_end
      and jl.account_code = v_coa;
  v_gl_prime := v_gl - v_anchor_amount;

  -- ---------------------------------------------------------------
  -- THE REVERSAL PAIRS EXCLUDED FROM ENUMERATION ONLY [ladder row 8]. Both legs must post
  -- <= P.end: only then is the pair arithmetically neutral in BOTH gl' and capacity', which is
  -- what makes dropping it from the list safe. They stay in every SUM. Dropping only one leg
  -- would silently break the enumeration-sums-to-the-term assert the belt runs.
  -- A reversed entry is never a group member (0038's congruence belt refuses reversed_entry
  -- and reversal_mirror), so both legs are always fully unconsumed and cancel exactly.
  -- ---------------------------------------------------------------
  select coalesce(array_agg(distinct e2.id), '{}'::uuid[]),
         coalesce(jsonb_agg(distinct jsonb_build_object(
             'entry_id', orig.id, 'reversal_entry_id', mir.id)), '[]'::jsonb)
    into v_rev_excluded, v_rev_pairs
    from clara.journal_entries orig
    join clara.journal_entries mir on mir.id = orig.reversed_by
    cross join lateral (values (orig.id), (mir.id)) as e2(id)
    where orig.client_id = v_client and orig.firm_id = v_firm
      and orig.status = 'approved' and orig.approved_at is not null and orig.approved_at <= p_cutoff
      and mir.status  = 'approved' and mir.approved_at  is not null and mir.approved_at  <= p_cutoff
      and orig.posting_date <= s.period_end and mir.posting_date <= s.period_end
      -- AN ANCHOR ORIGINAL IS NOT A PAIR HERE, and that is load-bearing rather than fussy: the
      -- anchor set is already OUT of the capacity universe, so only the MIRROR would be in the
      -- enumeration -- and dropping a leg whose partner was never in the list is exactly how the
      -- enumeration stops summing to the term. Leaving the pair in means the mirror appears in
      -- the list and in the sum, which is consistent, visible, and refuses nothing.
      and not (orig.id = any(v_anchor_entries))
      and exists (select 1 from clara.journal_lines jl
                  where jl.entry_id = orig.id and jl.account_code = v_coa);

  -- ---------------------------------------------------------------
  -- unmatched_capacity'(P) AND the outstanding entry-side enumeration, IN ONE PASS so the
  -- scalar and the list cannot drift. The SUM covers every entry (reversal pairs included --
  -- they net to zero); the jsonb_agg FILTERs them out of the list.
  -- ---------------------------------------------------------------
  with ent as (
    select je.id as entry_id, je.posting_date,
           coalesce(sum(jl.debit_cents), 0)::bigint  as dr,
           coalesce(sum(jl.credit_cents), 0)::bigint as cr
      from clara.journal_entries je
      join clara.journal_lines jl on jl.entry_id = je.id and jl.account_code = v_coa
      where je.client_id = v_client and je.firm_id = v_firm
        and je.status = 'approved' and je.approved_at is not null and je.approved_at <= p_cutoff
        and je.posting_date <= s.period_end
        and not (je.id = any(v_anchor_entries))
      group by je.id, je.posting_date
  ), cons as (
    -- EACH ENTRY'S **TOTAL** LIVE CONSUMPTION, REGARDLESS OF LINE DATES. The delta round's
    -- named double-count trap lives exactly here: adding a line-date predicate to this CTE
    -- makes every matched-but-uncleared entry count twice.
    select em.entry_id,
           coalesce(sum(case when em.matched_cents > 0 then em.matched_cents else 0 end), 0)::bigint  as cons_pos,
           coalesce(sum(case when em.matched_cents < 0 then -em.matched_cents else 0 end), 0)::bigint as cons_neg
      from clara.bank_match_entry_members em
      where em.match_id = any(v_live_matches)
      group by em.entry_id
  ), joined as (
    select e.entry_id, e.posting_date, e.dr, e.cr,
           coalesce(c.cons_pos, 0)::bigint as cons_pos,
           coalesce(c.cons_neg, 0)::bigint as cons_neg
      from ent e left join cons c on c.entry_id = e.entry_id
  ), sides as (
    select j.entry_id, j.posting_date, 'debit'::text as side,
           (j.dr - j.cons_pos)::bigint as cents from joined j
    union all
    select j.entry_id, j.posting_date, 'credit'::text,
           (-(j.cr - j.cons_neg))::bigint from joined j
  )
  select coalesce(sum(x.cents), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
             'entry_id', x.entry_id, 'posting_date', x.posting_date,
             'age_days', (s.period_end - x.posting_date),
             'side', x.side, 'cents', x.cents)
           order by x.posting_date, x.entry_id, x.side)
           filter (where x.cents <> 0 and not (x.entry_id = any(v_rev_excluded))), '[]'::jsonb)
    into v_cap_prime, v_entry_sides
    from sides x;

  -- ---------------------------------------------------------------
  -- SUM_g uncleared(g,P) AND its per-group enumeration, in one pass. Stated in section 3's
  -- LITERAL form (entry members posting <= P.end minus line members whose statement ends
  -- <= P.end) rather than the algebraically equal "future lines minus future entries" form,
  -- so the number does not depend on the group tie holding -- if a group ever failed to tie,
  -- 0038's group-tie belt would have refused it, and this term should not quietly paper over
  -- the case where it somehow did not.
  -- The line side reads LIVE statements only: a voided statement's lines are not facts any
  -- more, and 0038's congruence belt already forbids a live member on a void statement, so
  -- the filter is a no-op on a healthy book and an honest one on a sick book.
  -- ---------------------------------------------------------------
  with g as (
    select bm.id as match_id,
           coalesce((select sum(em.matched_cents)
                       from clara.bank_match_entry_members em
                       join clara.journal_entries je on je.id = em.entry_id
                      where em.match_id = bm.id
                        and je.status = 'approved' and je.approved_at is not null
                        and je.approved_at <= p_cutoff
                        and je.posting_date <= s.period_end), 0)::bigint as ent_in
         , coalesce((select sum(lm.amount_cents)
                       from clara.bank_match_line_members lm
                       join clara.bank_statement_lines l on l.id = lm.line_id
                       join clara.bank_statements st on st.id = l.statement_id
                      where lm.match_id = bm.id and st.status = 'live'
                        and st.period_end <= s.period_end), 0)::bigint as line_in
         -- The AGE anchor of a group item: the earliest in-period date on either side. A group
         -- with nothing on either side inside the period contributes 0 anyway and is filtered
         -- out of the enumeration below, so the period_end fallback is never load-bearing.
         , least(
             coalesce((select min(je2.posting_date) from clara.bank_match_entry_members em2
                         join clara.journal_entries je2 on je2.id = em2.entry_id
                        where em2.match_id = bm.id and je2.posting_date <= s.period_end),
                      s.period_end),
             coalesce((select min(l2.entry_date) from clara.bank_match_line_members lm2
                         join clara.bank_statement_lines l2 on l2.id = lm2.line_id
                         join clara.bank_statements st2 on st2.id = l2.statement_id
                        where lm2.match_id = bm.id and st2.status = 'live'
                          and st2.period_end <= s.period_end),
                      s.period_end)) as anchor_date
      from clara.bank_matches bm
      where bm.id = any(v_live_matches)
  )
  select coalesce(sum(g.ent_in - g.line_in), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
             'match_id', g.match_id,
             'uncleared_cents', (g.ent_in - g.line_in),
             'anchor_date', g.anchor_date,
             'age_days', (s.period_end - g.anchor_date))
           order by g.anchor_date, g.match_id)
           filter (where (g.ent_in - g.line_in) <> 0), '[]'::jsonb)
    into v_uncleared, v_group_items
    from g;

  -- THE OUTSTANDING LINE-SIDE MEMBERS (design section 3's snapshot spec, named separately):
  -- a line already printed by P.end that is matched only to entries posting after it. This is
  -- C-b's acknowledged posting_date_exception seen from the receipt (0038:812-816) -- an
  -- honest timing item enumerated by name, never a refusal [ladder row 4].
  select coalesce(jsonb_agg(jsonb_build_object(
             'line_id', l.id, 'statement_id', l.statement_id, 'match_id', lm.match_id,
             'entry_date', l.entry_date, 'age_days', (s.period_end - l.entry_date),
             'amount_cents', l.amount_cents)
           order by l.entry_date, l.id), '[]'::jsonb)
    into v_line_sides
    from clara.bank_match_line_members lm
    join clara.bank_statement_lines l on l.id = lm.line_id
    join clara.bank_statements st on st.id = l.statement_id
    where lm.match_id = any(v_live_matches)
      and st.status = 'live' and st.period_end <= s.period_end
      and exists (select 1 from clara.bank_match_entry_members em
                  join clara.journal_entries je on je.id = em.entry_id
                  where em.match_id = lm.match_id and je.posting_date > s.period_end);

  -- ---------------------------------------------------------------
  -- excepted(P). ALL-TIME, PER LINE. "open, OR resolved with the line still unmatched" is the
  -- disposition-hole fix [ladder row 2 + the delta round]: no disposition may leave a line in
  -- NO term. matched_booking and written_off_adjustment both end with the line MATCHED, so it
  -- leaves this term and enters the matched-line total in the same instant, arithmetically
  -- neutral for every completed period; bank_corrective_line leaves both legs resolved and
  -- unmatched, and the pair nets to zero inside this term by construction.
  -- ---------------------------------------------------------------
  -- ONE LATERAL picks the GOVERNING exception row per line (an open one wins; otherwise the
  -- most recent resolved one), so the line is counted once and described once. unique(line_id)
  -- where status='open' guarantees at most one open row; several historical resolved rows on
  -- one line are legal, and summing per exception row rather than per line would double count.
  select coalesce(sum(l.amount_cents), 0)::bigint,
         coalesce(jsonb_agg(jsonb_build_object(
             'exception_id', gx.id, 'line_id', l.id, 'statement_id', l.statement_id,
             'kind', gx.kind, 'status', gx.status,
             'resolution_disposition', gx.resolution_disposition,
             'entry_date', l.entry_date,
             'age_days', (s.period_end - l.entry_date),
             'amount_cents', l.amount_cents)
           order by l.entry_date, l.id), '[]'::jsonb)
    into v_excepted, v_exceptions
    from clara.bank_statement_lines l
    join clara.bank_statements st on st.id = l.statement_id
    join lateral (
      select x.id, x.kind, x.status, x.resolution_disposition
        from clara.bank_line_exceptions x
       where x.line_id = l.id
       order by (x.status = 'open') desc, x.created_at desc, x.id desc
       limit 1
    ) gx on true
    where st.bank_account_id = any(v_accounts)
      and st.status = 'live' and st.period_end <= s.period_end
      and (gx.status = 'open'
           or not exists (select 1 from clara.bank_match_line_members lm
                          where lm.line_id = l.id and lm.match_id = any(v_live_matches)));

  -- THE MATCHED-LINE TOTAL. Not a term of the identity -- an INDEPENDENT witness of it. The
  -- identity is algebraically equal to
  --     closing = opening_anchor + SUM(matched lines <= P.end) + excepted(P)
  -- (proof: gl' - capacity' = every entry's total live consumption = the entry half of
  -- SUM_g uncleared, so gl' - SUM_g uncleared - capacity' collapses to the matched-line
  -- total). Carrying it in the snapshot means a future reader can re-check the identity from a
  -- completely different direction without re-deriving anything.
  select coalesce(sum(l.amount_cents), 0)::bigint into v_matched_lines
    from clara.bank_match_line_members lm
    join clara.bank_statement_lines l on l.id = lm.line_id
    join clara.bank_statements st on st.id = l.statement_id
    where lm.match_id = any(v_live_matches)
      and st.status = 'live' and st.period_end <= s.period_end;

  -- A DIAGNOSTIC, NOT A TERM. The anchor set is excluded from gl' AND from capacity' (design
  -- section 3), which is what makes the takeover case close -- but SUM_g uncleared counts every
  -- entry member posting <= P.end, anchor entries included. So an opening carry-down entry that
  -- somebody matched to a statement line would leave the identity short by exactly its
  -- consumption. That is a real bookkeeping error (a takeover opening balance is not a bank
  -- movement) and the honest outcome is the ordinary recon_difference_nonzero refusal -- but a
  -- difference with no visible cause is a mystery, so the cause is measured and carried into
  -- the refusal's errdetail rather than left for somebody to rediscover.
  select coalesce(sum(em.matched_cents), 0)::bigint into v_anchor_consumed
    from clara.bank_match_entry_members em
    where em.match_id = any(v_live_matches) and em.entry_id = any(v_anchor_entries);

  v_outstanding := v_uncleared + v_cap_prime;                 -- design 4.1's BINDING
  v_difference  := s.closing_cents
                   - (v_opening_anchor + v_gl_prime - v_uncleared - v_cap_prime + v_excepted);

  return jsonb_build_object(
    'statement_id',              s.id,
    'firm_id',                   v_firm,
    'client_id',                 v_client,
    'bank_account_id',           v_acct,
    'coa_account_code',          v_coa,
    'period_start',              s.period_start,
    'period_end',                s.period_end,
    'statement_status',          s.status,
    'statement_opening_cents',   s.opening_cents,
    'statement_closing_cents',   s.closing_cents,
    'cutoff',                    p_cutoff,
    'first_statement_id',        v_first_id,
    'first_period',              (v_first_id is not distinct from s.id),
    'opening_anchor_cents',      v_opening_anchor,
    'anchor_amount_cents',       v_anchor_amount,
    'bank_uncleared_opening_cents', v_uncleared_opening,
    'opening_tie_delta_cents',   (v_anchor_amount - v_uncleared_opening - v_opening_anchor),
    'gl_cents',                  v_gl,
    'gl_prime_cents',            v_gl_prime,
    'uncleared_cents',           v_uncleared,
    'capacity_prime_cents',      v_cap_prime,
    'outstanding_cents',         v_outstanding,
    'excepted_cents',            v_excepted,
    'matched_line_cents',        v_matched_lines,
    'anchor_consumed_cents',     v_anchor_consumed,
    'difference_cents',          v_difference,
    'snapshot', jsonb_build_object(
      'cutoff',                     p_cutoff,
      'coa_account_code',           v_coa,
      'period_start',               s.period_start,
      'period_end',                 s.period_end,
      'statement_opening_cents',    s.opening_cents,
      'statement_closing_cents',    s.closing_cents,
      'opening_anchor_cents',       v_opening_anchor,
      'anchor_amount_cents',        v_anchor_amount,
      'bank_uncleared_opening_cents', v_uncleared_opening,
      'terms', jsonb_build_object(
        'gl_prime_cents',        v_gl_prime,
        'uncleared_cents',       v_uncleared,
        'capacity_prime_cents',  v_cap_prime,
        'outstanding_cents',     v_outstanding,
        'excepted_cents',        v_excepted,
        'matched_line_cents',    v_matched_lines),
      'outstanding_entry_sides',  v_entry_sides,
      'outstanding_group_items',  v_group_items,
      'outstanding_line_sides',   v_line_sides,
      'exceptions',               v_exceptions,
      'bank_uncleared_opening',   v_bank_uncl,
      'reversal_pairs_excluded',  v_rev_pairs,
      'acknowledged_outstanding', '[]'::jsonb));
end $$;
revoke all on function clara._bank_recon_terms(uuid,timestamptz) from public;


-- =====================================================================================
-- S2.2 -- clara.complete_bank_reconciliation. BOOKKEEPER FLOOR (design section 5).
--
-- THE REFUSAL LADDER, in the order it runs, with the design's EXACT token names. The order is
-- most-structural-first, so the human gets the complaint that explains the others:
--   statement_not_live          -- a void statement is not a period the books may be tied to.
--   recon_already_complete      -- a DIFFERENT op_key on an already-complete statement RAISES;
--                                  the SAME op_key returns through _reserve_op's dedupe, and a
--                                  replay AFTER a void returns the voided receipt, which names
--                                  its own status [ladder row 22 / R12].
--   recon_coa_shared            -- more than one bank account, in ANY state, mapped to this COA
--                                  and carrying a live statement. gl is COA-scoped and closing
--                                  is account-scoped; mixing them ties spuriously [ladder row 6].
--   recon_period_gap            -- the nearest prior LIVE statement does not end the day before
--                                  this period starts. A missing month refuses BY NAME, never
--                                  as a number-hunt [ladder row 10]. No prior statement at all
--                                  is the FIRST-PERIOD EXEMPTION, claimed once and pinned on the
--                                  receipt as prior_statement_id = null [ladder row 18].
--   recon_prior_missing         -- the contiguous prior statement exists but carries no complete
--                                  reconciliation.
--   recon_line_reserved         -- a line of THIS statement sits in a PENDING reservation.
--                                  Remedy: complete_pending_match [ladder row 11].
--   recon_line_unsettled        -- a line of THIS statement is in no live group and under no
--                                  exception. This is WCC-R2's strict completion.
--   recon_uncleared_off_account -- a bank_uncleared opening item whose entry carries no leg on
--                                  ANY registered bank-account COA of this client. The errdetail
--                                  REPORTS the unrecoverable item ids [ladder row 14].
--   recon_opening_mismatch      -- the section-3 takeover tie
--                                  (anchor_amount - bank_uncleared movement = first opening),
--                                  and, down the chain, the statement's printed opening against
--                                  the prior receipt's certified closing.
--   recon_outstanding_stale     -- any enumerated outstanding side older than the 60-day floor
--                                  and not acknowledged by id. The duplicate-payment plug is
--                                  CHALLENGED, not totalled [ladder rows 8/20].
--   recon_difference_nonzero    -- WCC-R2's exact zero, with the computed terms in the errdetail.
--
-- LOCK ORDER (design section 5, the house order every 0038 writer uses):
--   op-receipt reservation (BEFORE any lock -- _reserve_op can BLOCK on a concurrent inserter
--   of the same key, and taking that block while holding an advisory rung makes a deadlock
--   reachable; 0037:2678-2698, restated at 0038:3954-3960)
--     -> advisory 203005004 (client)
--     -> advisory 203005006 (per-account statement chain)
--     -> bank_statement_lines FOR SHARE in id order
--     -> the bank_statements row FOR SHARE
--     -> the bank_accounts row FOR SHARE
-- 004 is the true serializer; the row locks are belt and braces, and they are what closes the
-- certify-while-mutating window on remap_bank_account_coa / deactivate_bank_account, which take
-- no advisory rung today and gain 004->006 in the splice register [ladder row 16].
-- NO pre-existing clara.journal_entries row is locked anywhere in this verb, so 0037's
-- invariant (1) -- any verb that locks a pre-existing entry must take journal_entries BEFORE
-- open_items -- is untouched, and the C-a partial order is undisturbed.
-- =====================================================================================
create function clara.complete_bank_reconciliation(
    p_statement uuid,
    p_ack_outstanding uuid[] default '{}'::uuid[],
    p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  -- THE STALE-OUTSTANDING FLOOR. Sixty days is an ENGINEERING DEFAULT, owner-adjustable later
  -- (design section 10's recorded residual). It is named here, once, rather than spelled as a
  -- bare literal at the site that uses it.
  c_stale_days constant int := 60;

  c record; v_dedupe jsonb; v_ack uuid[]; v_recon uuid;
  s record; ba record; v_client uuid; v_coa text;
  v_cutoff timestamptz;
  v_prior_stmt uuid; v_prior_end date; v_prior_recon uuid;
  v_n int; v_ids uuid[]; v_ids_txt text;
  t jsonb; v_snapshot jsonb;
  v_stale jsonb; v_replay_id uuid; r record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;

  -- The statement is the whole subject: the reconciliation is born 1:1 ON a live statement and
  -- inherits its period and its uniqueness (WCC-R1). Read it BEFORE the reservation so the
  -- client (and therefore the advisory key) is known, and so a cross-firm probe refuses on
  -- tenancy without ever writing an op receipt.
  select * into s from clara.bank_statements bs where bs.id = p_statement;
  if not found or s.firm_id <> c.firm then
    raise exception 'bank statement not found for this firm' using errcode='CLR11';
  end if;
  v_client := s.client_id;

  -- p_ack_outstanding is normalized (deduped, sorted, nulls dropped) BEFORE hashing: two
  -- spellings of the same acknowledgement must hash the same, and the flag is BOTH a decision
  -- input and a recorded fact, so omitting it from the hash would let a replay under a
  -- different acknowledgement return the first call's receipt (0038:3941-3947's reasoning).
  select coalesce(array_agg(distinct x.id order by x.id), '{}'::uuid[]) into v_ack
    from unnest(coalesce(p_ack_outstanding, '{}'::uuid[])) as x(id) where x.id is not null;

  v_dedupe := clara._reserve_op(c.firm, 'complete_bank_reconciliation', p_op_key,
    clara._hash(jsonb_build_object('statement', p_statement,
      'ack_outstanding', to_jsonb(v_ack))));
  if v_dedupe is not null then
    -- THE REPLAY, TOLD HONESTLY [ladder row 22]. The stored result is the receipt as written;
    -- if that receipt has since been VOIDED, a replay that echoed 'complete' would be a lie the
    -- caller cannot detect. Re-read the row and let the reply name its CURRENT status.
    v_replay_id := nullif(v_dedupe->>'reconciliation_id','')::uuid;
    if v_replay_id is not null then
      select * into r from clara.bank_reconciliations br where br.id = v_replay_id;
      if found then
        return v_dedupe || jsonb_build_object('status', r.status,
          'voided_at', r.voided_at, 'voided_reason', r.voided_reason);
      end if;
    end if;
    return v_dedupe;
  end if;

  -- RUNG 1 and RUNG 2, in the house order (0038:2241-2242).
  perform pg_advisory_xact_lock(203005004, hashtext(v_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(s.bank_account_id::text));

  -- RUNG 3 -- the line rows, in id order, so two writers of the same statement take them in
  -- one order and cannot deadlock on each other. FOR SHARE: this verb reads the lines, it
  -- never writes them, and a SHARE lock is exactly enough to stop the append-only writer and
  -- the void path from moving under the certification.
  perform 1 from clara.bank_statement_lines l
    where l.statement_id = p_statement order by l.id for share;

  -- RUNG 4 -- the statement header itself. This is what makes "certify while somebody voids"
  -- unreachable rather than merely unlikely.
  select * into s from clara.bank_statements bs where bs.id = p_statement for share;
  if s.status <> 'live' then
    raise exception 'bank statement % is %; only a live statement can be reconciled', p_statement, s.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','statement_not_live','statement_id',p_statement,
          'status',s.status)::text;
  end if;

  -- RUNG 5 -- the bank_accounts row. The COA mapping this receipt CERTIFIES must not move
  -- under it while the terms are being derived [ladder rows 6/16].
  select * into ba from clara.bank_accounts b where b.id = s.bank_account_id for share;
  if not found or ba.firm_id <> c.firm or ba.client_id <> v_client then
    raise exception 'bank account is not in this client' using errcode='CLR11';
  end if;
  v_coa := ba.coa_account_code;

  -- ---------------------------------------------------------------
  -- recon_already_complete. A different op_key reaching here is a genuine duplicate act; the
  -- same op_key never reaches here (the dedupe above returned).
  -- ---------------------------------------------------------------
  if exists (select 1 from clara.bank_reconciliations br
              where br.statement_id = p_statement and br.status = 'complete') then
    raise exception 'bank statement % already carries a complete reconciliation; void it before completing a new one', p_statement
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_already_complete','statement_id',p_statement)::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_coa_shared [ladder row 6]. gl(P) is COA-scoped; S.closing is ACCOUNT-scoped. If two
  -- accounts on this COA both carry live statements the two scopes name different books, and a
  -- tie between them is either a mix or a coincidence. Refuse rather than certify either.
  -- ---------------------------------------------------------------
  select count(*)::int, coalesce(array_agg(x.id), '{}'::uuid[]) into v_n, v_ids
    from (select ba2.id from clara.bank_accounts ba2
           where ba2.client_id = v_client and ba2.firm_id = c.firm
             and ba2.coa_account_code = v_coa
             and exists (select 1 from clara.bank_statements bs2
                          where bs2.bank_account_id = ba2.id and bs2.status = 'live')) x;
  if v_n > 1 then
    raise exception 'GL account % carries live statements on % different bank accounts; one COA account backs one reconcilable bank account', v_coa, v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_coa_shared','account_code',v_coa,
          'bank_account_ids',to_jsonb(v_ids))::text;
  end if;

  -- ---------------------------------------------------------------
  -- THE CHAIN LAW, DATE-CONTIGUOUS [ladder row 10]. The nearest prior LIVE statement of this
  -- account must end exactly the day before this period starts. WCC-R1's rationale as
  -- corrected by the ladder: the statement table enforces continuity between CONTIGUOUS
  -- periods only, so a real gap is legal at ingest and stays visible -- and it is HERE that it
  -- must be named, because completing over an unexamined hole is how the prior build's
  -- brought-forward outstanding was dropped.
  -- ---------------------------------------------------------------
  select bs.id, bs.period_end into v_prior_stmt, v_prior_end
    from clara.bank_statements bs
    where bs.bank_account_id = s.bank_account_id and bs.status = 'live'
      and bs.period_end < s.period_start
    order by bs.period_end desc, bs.id desc
    limit 1;

  if v_prior_stmt is not null then
    if v_prior_end <> (s.period_start - 1) then
      raise exception 'the previous live statement on this account ends on %, not the day before this period starts (%); a missing month is not reconcilable over', v_prior_end, (s.period_start - 1)
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_period_gap','statement_id',p_statement,
            'prior_statement_id',v_prior_stmt,'prior_period_end',v_prior_end,
            'expected_period_end',(s.period_start - 1))::text;
    end if;
    select br.id into v_prior_recon from clara.bank_reconciliations br
      where br.statement_id = v_prior_stmt and br.status = 'complete';
    if v_prior_recon is null then
      raise exception 'the previous statement (period ending %) is not reconciled; reconcile it first', v_prior_end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_prior_missing','statement_id',p_statement,
            'prior_statement_id',v_prior_stmt)::text;
    end if;
  end if;
  -- v_prior_stmt null here IS the first-period exemption. It is claimed exactly once and
  -- PINNED on the receipt (prior_statement_id null), so a later backfilled statement cannot
  -- silently demote this receipt -- the ingest-side recon_frontier_backfill refusal is the
  -- other half of that law and lives in the _persist_statement_core splice [ladder row 18].

  -- ---------------------------------------------------------------
  -- THE PRECONDITION, THE ONE PERIOD-SCOPED TEST (WCC-R2, strict completion). Every line of S
  -- is a member of a LIVE group, or carries an exception row. A line under a RESOLVED
  -- exception counts: bank_corrective_line deliberately leaves both legs resolved-and-unmatched
  -- and they ride excepted(P) netting to zero, so demanding an OPEN exception here would make
  -- the ratified resolution unreachable [ladder row 2, the disposition hole].
  -- A PENDING reservation refuses UNDER ITS OWN NAME with its own remedy [ladder row 11].
  -- ---------------------------------------------------------------
  select count(*)::int, coalesce(array_agg(l.id order by l.line_no), '{}'::uuid[])
    into v_n, v_ids
    from clara.bank_statement_lines l
    where l.statement_id = p_statement
      and exists (select 1 from clara.bank_match_line_members lm
                   join clara.bank_matches bm on bm.id = lm.match_id
                  where lm.line_id = l.id and bm.status = 'pending');
  if v_n > 0 then
    raise exception '% line(s) of this statement are held by a pending match reservation; complete or cancel them first', v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_line_reserved','statement_id',p_statement,
          'line_count',v_n,'line_ids',to_jsonb(v_ids))::text;
  end if;

  select count(*)::int, coalesce(array_agg(l.id order by l.line_no), '{}'::uuid[])
    into v_n, v_ids
    from clara.bank_statement_lines l
    where l.statement_id = p_statement
      and not exists (select 1 from clara.bank_match_line_members lm
                       join clara.bank_matches bm on bm.id = lm.match_id
                      where lm.line_id = l.id and bm.status = 'live')
      and not exists (select 1 from clara.bank_line_exceptions x where x.line_id = l.id);
  if v_n > 0 then
    raise exception '% line(s) of this statement are neither matched into the books nor under an exception', v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_line_unsettled','statement_id',p_statement,
          'line_count',v_n,'line_ids',to_jsonb(v_ids))::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_uncleared_off_account [ladder row 14 / Codex C16]. A K-seeded bank_uncleared item is
  -- a pre-cutover instrument that WILL clear against some registered bank account. One whose
  -- entry touches NO registered bank-account COA of this client is unrecoverable by any
  -- matching act, and the identity cannot see it -- so it is reported BY ITEM ID rather than
  -- left to surface as an unexplained difference.
  -- ---------------------------------------------------------------
  -- The subquery alias is `q`, NOT `t`: `t` is a declared jsonb variable in this body, and
  -- plpgsql resolves a qualified identifier against its variables FIRST -- the classic
  -- sql_variable_conflict trap 0038:3185-3188 names, which fails at deploy rather than at
  -- review.
  select count(*)::int, string_agg(q.id::text, ', ' order by q.id) into v_n, v_ids_txt
    from (
      select oi.id
        from clara.opening_items oi
        join clara.journal_entries je on je.id = oi.entry_id
       where oi.client_id = v_client and oi.firm_id = c.firm
         and oi.item_kind = 'bank_uncleared' and oi.state = 'active'
         and je.status = 'approved'
         and not exists (
           select 1 from clara.journal_lines jl
            join clara.bank_accounts ba3 on ba3.client_id = oi.client_id
                                        and ba3.coa_account_code = jl.account_code
           where jl.entry_id = oi.entry_id)
    ) q;
  if v_n > 0 then
    raise exception '% uncleared opening item(s) carry no leg on any registered bank-account GL code; they can never clear against a statement line', v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_uncleared_off_account','client_id',v_client,
          'item_count',v_n,'opening_item_ids',v_ids_txt)::text;
  end if;

  -- ---------------------------------------------------------------
  -- THE TERMS. completed_at IS the cutoff -- one value, taken once, used for the derivation and
  -- stored on the receipt, so verification can reproduce it byte-exactly forever [ladder row
  -- 37]. now() is transaction_timestamp, so every row this transaction approves carries the
  -- same instant and is INCLUDED by the <= gate, which is what a same-transaction
  -- book-then-reconcile act requires.
  -- ---------------------------------------------------------------
  v_cutoff := now();
  t := clara._bank_recon_terms(p_statement, v_cutoff);
  if t is null then
    raise exception 'the reconciliation terms could not be derived for statement %', p_statement
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_terms_underivable','statement_id',p_statement)::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_opening_mismatch, BOTH ARMS.
  --   (a) THE TAKEOVER TIE (design section 3): anchor_amount - SUM(bank_uncleared movement on c)
  --       must equal the FIRST live statement's opening. Asserted unconditionally, because for
  --       a zero-opening account it reads 0 - 0 = 0 and costs nothing -- and because a client
  --       that seeded uncleared instruments on a bank COA with no matching carry-down is
  --       exactly the silent shape this refusal exists to catch.
  --   (b) THE CHAIN ARM: down the chain the anchor rides the receipts, so this statement's
  --       printed opening must equal the prior receipt's CERTIFIED closing. A statement whose
  --       opening disagrees with the certified history is not continuous with it, whatever the
  --       ingest-time continuity check said at the time.
  -- ---------------------------------------------------------------
  if (t->>'opening_tie_delta_cents')::bigint <> 0 then
    raise exception 'the opening anchor does not tie: carry-down % less uncleared instruments % is not the first statement opening %',
        (t->>'anchor_amount_cents')::bigint,
        (t->>'bank_uncleared_opening_cents')::bigint,
        (t->>'opening_anchor_cents')::bigint
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_opening_mismatch','arm','takeover_tie',
          'statement_id',p_statement,
          'anchor_amount_cents',(t->>'anchor_amount_cents')::bigint,
          'bank_uncleared_opening_cents',(t->>'bank_uncleared_opening_cents')::bigint,
          'opening_anchor_cents',(t->>'opening_anchor_cents')::bigint,
          'delta_cents',(t->>'opening_tie_delta_cents')::bigint)::text;
  end if;
  if v_prior_recon is not null then
    select * into r from clara.bank_reconciliations br where br.id = v_prior_recon;
    if s.opening_cents <> r.closing_cents then
      raise exception 'this statement opens at % but the previous reconciliation certified a closing of %', s.opening_cents, r.closing_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_opening_mismatch','arm','chain',
            'statement_id',p_statement,'prior_reconciliation_id',v_prior_recon,
            'statement_opening_cents',s.opening_cents,
            'prior_closing_cents',r.closing_cents)::text;
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- recon_outstanding_stale [ladder rows 8/20]. Every ENUMERATED outstanding side older than
  -- the 60-day floor must be acknowledged BY ID -- entry sides by entry_id, line sides by
  -- line_id, group items by match_id. This is the plug challenge: a duplicate payment that
  -- sits in outstanding forever ties GREEN forever unless somebody is made to say so out loud.
  -- Reversal pairs are already out of the enumeration, so a book full of corrections does not
  -- accumulate a challenge list that never converges.
  -- ---------------------------------------------------------------
  select coalesce(jsonb_agg(x.item order by x.age_days desc), '[]'::jsonb) into v_stale
    from (
      select e.elem as item, (e.elem->>'age_days')::int as age_days
        from jsonb_array_elements(t->'snapshot'->'outstanding_entry_sides') as e(elem)
       where (e.elem->>'age_days')::int > c_stale_days
         and not ((e.elem->>'entry_id')::uuid = any(v_ack))
      union all
      select e.elem, (e.elem->>'age_days')::int
        from jsonb_array_elements(t->'snapshot'->'outstanding_line_sides') as e(elem)
       where (e.elem->>'age_days')::int > c_stale_days
         and not ((e.elem->>'line_id')::uuid = any(v_ack))
      union all
      select e.elem, (e.elem->>'age_days')::int
        from jsonb_array_elements(t->'snapshot'->'outstanding_group_items') as e(elem)
       where (e.elem->>'age_days')::int > c_stale_days
         and not ((e.elem->>'match_id')::uuid = any(v_ack))
    ) x;
  if jsonb_array_length(v_stale) > 0 then
    raise exception '% outstanding item(s) are more than % days old at this period end and have not been acknowledged', jsonb_array_length(v_stale), c_stale_days
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_outstanding_stale','statement_id',p_statement,
          'stale_days',c_stale_days,'items',v_stale)::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_difference_nonzero. WCC-R2's EXACT ZERO, tolerance NONE, with every computed term in
  -- the errdetail so the human is told which side of the identity moved. A tolerance is how a
  -- reconciliation quietly stops reconciling (0038's own group-tie note, restated at the
  -- period grain).
  -- ---------------------------------------------------------------
  if (t->>'difference_cents')::bigint <> 0 then
    raise exception 'this reconciliation does not tie: a difference of % cents remains', (t->>'difference_cents')::bigint
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_difference_nonzero','statement_id',p_statement,
          'difference_cents',(t->>'difference_cents')::bigint,
          'opening_anchor_cents',(t->>'opening_anchor_cents')::bigint,
          'gl_prime_cents',(t->>'gl_prime_cents')::bigint,
          'uncleared_cents',(t->>'uncleared_cents')::bigint,
          'capacity_prime_cents',(t->>'capacity_prime_cents')::bigint,
          'outstanding_cents',(t->>'outstanding_cents')::bigint,
          'excepted_cents',(t->>'excepted_cents')::bigint,
          'matched_line_cents',(t->>'matched_line_cents')::bigint,
          -- Non-zero here is the one difference with a NAMED cause: an opening carry-down entry
          -- has been matched to a statement line. Unmatch it -- a takeover opening balance is
          -- not a bank movement.
          'anchor_consumed_cents',(t->>'anchor_consumed_cents')::bigint,
          'statement_closing_cents',s.closing_cents)::text;
  end if;

  -- ---------------------------------------------------------------
  -- THE RECEIPT IS THE ROW. Born only COMPLETE: an open reconciliation is a DERIVED view, never
  -- a stored draft, so there is no dead state to reconcile and no superseded_by to leave
  -- writerless [ladder row 19].
  --
  -- opening_cents carries the STATEMENT's printed opening (design 4.1's literal wording), and
  -- gl_balance_cents carries gl'(P) -- the ALL-TIME, anchor-excluded GL balance at P.end. The
  -- belt below asserts the stored-terms identity in the FIRST-PERIOD form when there is no
  -- prior, and in the DIFFERENCED form down the chain; because the chain arm also asserts
  -- opening = prior closing, the differenced form telescopes back to
  -- opening_anchor + gl' - outstanding + excepted at the head, which is section 3's identity
  -- exactly. Both readings of design 4.1/5 are therefore satisfied at once, and no sixth money
  -- column is needed.
  -- ---------------------------------------------------------------
  v_snapshot := (t->'snapshot') || jsonb_build_object('acknowledged_outstanding', to_jsonb(v_ack));
  v_recon := gen_random_uuid();
  begin
    insert into clara.bank_reconciliations(
        id, firm_id, client_id, bank_account_id, statement_id, coa_account_code,
        prior_statement_id, prior_reconciliation_id, period_start, period_end, status,
        opening_cents, gl_balance_cents, closing_cents, outstanding_cents, excepted_cents,
        completed_by, completed_at, snapshot)
      values (v_recon, c.firm, v_client, s.bank_account_id, p_statement, v_coa,
        v_prior_stmt, v_prior_recon, s.period_start, s.period_end, 'complete',
        s.opening_cents,
        (t->>'gl_prime_cents')::bigint,
        s.closing_cents,
        (t->>'outstanding_cents')::bigint,
        (t->>'excepted_cents')::bigint,
        c.actor, v_cutoff, v_snapshot);
  exception when unique_violation then
    -- The partial unique on (statement_id) where status='complete' is the structural guarantee;
    -- translating it back into the NAMED refusal keeps the racing path and the ordinary path
    -- indistinguishable to the human. The index name is deliberately not referenced, so a
    -- rename in the schema lane cannot silently turn this into a raw 23505 (0038:4080-4084).
    raise exception 'bank statement % was reconciled by another transaction while this reconciliation was being written', p_statement
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_already_complete','statement_id',p_statement)::text;
  end;

  -- THE RECORD. clara.bank_match_audit's action vocabulary is UNCHANGED by C-c (design section
  -- 10): a reconciliation is not a match act, so it rides the generic _audit plus its own event
  -- type. The event payload is IDENTIFIERS AND COUNTS ONLY -- clara.domain_events is
  -- agent-readable firm-wide (0005:379-408), so a balance, a period bound or an account number
  -- in a payload is a leak (0038:4210-4213).
  perform clara._audit(c.firm, c.actor, null, null, 'complete_bank_reconciliation', null,
    jsonb_build_object('client', v_client, 'statement', p_statement,
      'reconciliation_id', v_recon, 'bank_account', s.bank_account_id,
      'account_code', v_coa, 'period_start', s.period_start, 'period_end', s.period_end,
      'opening_cents', s.opening_cents, 'closing_cents', s.closing_cents,
      'gl_balance_cents', (t->>'gl_prime_cents')::bigint,
      'outstanding_cents', (t->>'outstanding_cents')::bigint,
      'excepted_cents', (t->>'excepted_cents')::bigint,
      'acknowledged_outstanding', to_jsonb(v_ack), 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.reconciliation_completed', v_client, c.actor,
    null, null, null, s.document_id, null,
    jsonb_build_object('reconciliation_id', v_recon, 'statement_id', p_statement,
      'bank_account_id', s.bank_account_id,
      'prior_reconciliation_id', v_prior_recon,
      'first_period', (v_prior_stmt is null),
      'outstanding_items', (jsonb_array_length(t->'snapshot'->'outstanding_entry_sides')
                            + jsonb_array_length(t->'snapshot'->'outstanding_group_items')),
      'exception_items', jsonb_array_length(t->'snapshot'->'exceptions')));

  return clara._finish_op(c.firm, 'complete_bank_reconciliation', p_op_key,
    jsonb_build_object('reconciliation_id', v_recon, 'statement_id', p_statement,
      'status', 'complete', 'first_period', (v_prior_stmt is null),
      'prior_reconciliation_id', v_prior_recon,
      'opening_cents', s.opening_cents, 'closing_cents', s.closing_cents,
      'gl_balance_cents', (t->>'gl_prime_cents')::bigint,
      'outstanding_cents', (t->>'outstanding_cents')::bigint,
      'excepted_cents', (t->>'excepted_cents')::bigint,
      'difference_cents', 0, 'completed_at', v_cutoff));
end $$;


-- =====================================================================================
-- S2.3 -- clara.void_bank_reconciliation. BOOKKEEPER FLOOR.
--
-- THE LIFECYCLE IS VOID-ONLY [ladder row 19]. There is no supersession column and no writer for
-- one: void_bank_statement's recon_present refusal (splice register entry 1) forces the recon
-- void FIRST, so a re-ingested statement starts with no reconciliation until a human completes
-- a fresh one. A voided receipt is never deleted and never edited -- it is the record of what
-- was certified and then withdrawn.
--
-- THE CHAIN-TAIL LAW (recon_chain_order). Receipts are only meaningful as a chain: each one's
-- opening is the previous one's certified closing. Voiding a receipt with a LATER complete
-- receipt behind it would leave that later one anchored to nothing. So the tail voids first,
-- newest to oldest -- which is exactly the ordered-unwind cost design section 10 records as a
-- knowing residual, and which /bank surfaces as "this will void N receipts" BEFORE the act.
--
-- LOCK ORDER: the same rungs as completion, in the same order, plus the reconciliation row
-- itself FOR UPDATE last. Nothing takes bank_reconciliations before 203005004, so the extra
-- rung cannot close a cycle; 004 is the serializer either way.
-- =====================================================================================
create function clara.void_bank_reconciliation(
    p_recon uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_reason text; r record; s record;
  v_later int; v_later_ids uuid[];
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- A void is a HUMAN JUDGEMENT about an existing certification and owes a reason, exactly as
  -- unmatch and unallocate do (0038:5141-5147, 0037's ck_oia_reason).
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a void reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;

  select * into r from clara.bank_reconciliations br where br.id = p_recon;
  if not found or r.firm_id <> c.firm then
    raise exception 'reconciliation not found for this firm' using errcode='CLR11';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'void_bank_reconciliation', p_op_key,
    clara._hash(jsonb_build_object('reconciliation', p_recon, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(r.client_id::text));
  perform pg_advisory_xact_lock(203005006, hashtext(r.bank_account_id::text));
  perform 1 from clara.bank_statement_lines l
    where l.statement_id = r.statement_id order by l.id for share;
  select * into s from clara.bank_statements bs where bs.id = r.statement_id for share;
  if not found then
    raise exception 'reconciliation % names no statement', p_recon
      using errcode='CLR10',detail='{"reason":"recon_statement_orphan"}';
  end if;
  perform 1 from clara.bank_accounts b where b.id = r.bank_account_id for share;

  -- Re-read under the locks: a concurrent void that won the race has already flipped the row,
  -- and this call must report that honestly rather than double-voiding it (0038:2244-2250).
  select * into r from clara.bank_reconciliations br where br.id = p_recon for update;
  if r.status = 'void' then
    raise exception 'reconciliation % is already void', p_recon
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_already_void','reconciliation_id',p_recon)::text;
  end if;

  -- THE CHAIN-TAIL LAW. Any COMPLETE reconciliation on this bank account covering a LATER
  -- period must be voided first.
  select count(*)::int, coalesce(array_agg(br.id order by br.period_end desc), '{}'::uuid[])
    into v_later, v_later_ids
    from clara.bank_reconciliations br
    where br.bank_account_id = r.bank_account_id and br.status = 'complete'
      and br.period_end > r.period_end;
  if v_later > 0 then
    raise exception '% later reconciliation(s) on this account are still complete; void the chain from the newest backwards', v_later
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_chain_order','reconciliation_id',p_recon,
          'later_count',v_later,'later_reconciliation_ids',to_jsonb(v_later_ids))::text;
  end if;

  update clara.bank_reconciliations
     set status = 'void', voided_by = c.actor, voided_at = now(), voided_reason = v_reason
   where id = p_recon;

  perform clara._audit(c.firm, c.actor, null, null, 'void_bank_reconciliation', null,
    jsonb_build_object('client', r.client_id, 'reconciliation_id', p_recon,
      'statement', r.statement_id, 'bank_account', r.bank_account_id,
      'period_end', r.period_end, 'reason', v_reason, 'op_key', p_op_key));
  -- IDENTIFIERS ONLY: the reason is a human's free text and stays in clara.audit_log, which is
  -- human-read behind RLS.
  perform clara._append_event(c.firm, 'bank.reconciliation_voided', r.client_id, c.actor,
    null, null, null, s.document_id, null,
    jsonb_build_object('reconciliation_id', p_recon, 'statement_id', r.statement_id,
      'bank_account_id', r.bank_account_id));

  return clara._finish_op(c.firm, 'void_bank_reconciliation', p_op_key,
    jsonb_build_object('reconciliation_id', p_recon, 'status', 'void',
      'statement_id', r.statement_id));
end $$;


-- =====================================================================================
-- S2.4 -- clara._tf_bank_recon_belt. SNAPSHOT COHERENCE. DEFERRED. NO BYPASS GUC, EVER.
--
-- ON clara.bank_reconciliations ONLY. This belt judges the RECEIPT as a self-consistent
-- object: the stored terms close, the snapshot enumerates exactly those terms, the period is
-- the statement's, the chain and the stamps cohere, and -- AT INSERT ONLY -- the certified COA
-- is the live mapping.
--
-- WHY IT NEVER RE-DERIVES FROM LIVE ROWS BEYOND INSERT [ladder rows 2/15/37]. The v1 belt
-- re-computed the identity from the current book on every write, which meant the very next
-- lawful act -- resolving an exception, booking a carried dispute, back-dating an approval --
-- refused the receipt it had just certified. The receipt is BITEMPORAL TRUTH: it is judged
-- against itself and against the immutable receipt before it, never against a book that has
-- moved on.
--
-- THE IDENTITY, IN TWO ARMS, and they are the same law:
--   first period (no prior receipt):
--     opening_cents + gl_balance_cents - outstanding_cents + excepted_cents = closing_cents
--     -- with opening_cents = the statement's printed opening = the section-3 opening anchor,
--        because a first statement's opening IS the anchor.
--   down the chain:
--     opening_cents + (gl' - prior.gl') - (outstanding - prior.outstanding)
--                   + (excepted - prior.excepted) = closing_cents
--     -- section 3's all-time identity, DIFFERENCED against the prior receipt. Combined with
--        the chain assert opening_cents = prior.closing_cents, it telescopes back to the head,
--        so the whole chain is anchored to opening_anchor + gl' - outstanding + excepted.
--        Mixed cutoffs are safe: a back-dated approval that lands between two completions
--        moves gl' and outstanding by the SAME amount when the entry is unmatched, and the
--        settled-period law makes matching it into an already-reconciled period unreachable.
--
-- RE-QUERY BY ID (0009:524-529, as 0038:3220-3226 restates it): at deferred time the NEW tuple
-- is a snapshot of the row as it was when the trigger was QUEUED.
-- =====================================================================================
create function clara._tf_bank_recon_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  r record; p record; st record; ba record; sn jsonb;
  v_lhs bigint; v_sum bigint; v_n int;
begin
  select * into r from clara.bank_reconciliations br where br.id = new.id;
  if not found then return null; end if;
  sn := r.snapshot;
  if sn is null or jsonb_typeof(sn) <> 'object' then
    raise exception 'reconciliation % carries no snapshot object', r.id
      using errcode='CLR10',detail='{"reason":"recon_snapshot_incoherent"}';
  end if;

  -- (1) THE PERIOD COPY AND THE TENANCY. The receipt inherits the statement's period at birth
  -- (WCC-R1); a receipt whose period drifted from its statement would certify a window nobody
  -- ever read.
  select * into st from clara.bank_statements bs where bs.id = r.statement_id;
  if not found then
    raise exception 'reconciliation % names no statement', r.id
      using errcode='CLR10',detail='{"reason":"recon_statement_orphan"}';
  end if;
  if st.firm_id <> r.firm_id or st.client_id <> r.client_id
     or st.bank_account_id <> r.bank_account_id then
    raise exception 'reconciliation % names a statement outside its own tenancy', r.id
      using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
  end if;
  if st.period_start <> r.period_start or st.period_end <> r.period_end
     or st.opening_cents <> r.opening_cents or st.closing_cents <> r.closing_cents then
    raise exception 'reconciliation % does not copy its statement''s period or balances', r.id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_period_copy_mismatch','reconciliation_id',r.id,
          'statement_id',r.statement_id)::text;
  end if;

  -- (2) THE CERTIFIED COA, AT INSERT ONLY [ladder row 6, delta-scoped]. The receipt certifies
  -- the mapping it was computed against. Asserting it against the LIVE mapping forever would
  -- make an ordinary later remap invalidate every historical receipt -- which is the opposite
  -- of what a receipt is for. Asserting it at birth is what stops a receipt being written
  -- against a COA the account does not actually carry.
  if tg_op = 'INSERT' then
    select * into ba from clara.bank_accounts b where b.id = r.bank_account_id;
    if not found or ba.coa_account_code is distinct from r.coa_account_code then
      raise exception 'reconciliation % certifies GL account % but the bank account maps to %', r.id, r.coa_account_code, coalesce(ba.coa_account_code,'(none)')
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_coa_uncertified','reconciliation_id',r.id,
            'certified',r.coa_account_code,'live',ba.coa_account_code)::text;
    end if;
  end if;

  -- (3) STAMP COHERENCE. Complete carries its completer and its cutoff and no void stamps;
  -- void carries all three void stamps. completed_at IS the bitemporal cutoff, so the snapshot
  -- must name the same instant -- a snapshot cut at a different moment than the one the receipt
  -- claims is not verifiable.
  if r.completed_by is null or r.completed_at is null then
    raise exception 'reconciliation % carries no completer or no cutoff', r.id
      using errcode='CLR10',detail='{"reason":"recon_stamp_incoherent"}';
  end if;
  if (sn->>'cutoff')::timestamptz is distinct from r.completed_at then
    raise exception 'reconciliation %''s snapshot was cut at a different instant than its completed_at', r.id
      using errcode='CLR10',detail='{"reason":"recon_stamp_incoherent"}';
  end if;
  if r.status = 'complete' then
    if r.voided_by is not null or r.voided_at is not null or r.voided_reason is not null then
      raise exception 'complete reconciliation % carries a void stamp', r.id
        using errcode='CLR10',detail='{"reason":"recon_stamp_incoherent"}';
    end if;
  elsif r.status = 'void' then
    if r.voided_by is null or r.voided_at is null
       or nullif(btrim(coalesce(r.voided_reason,'')),'') is null then
      raise exception 'void reconciliation % carries an incomplete void stamp', r.id
        using errcode='CLR10',detail='{"reason":"recon_stamp_incoherent"}';
    end if;
  end if;

  -- (4) THE CHAIN. Both prior references move together, the prior receipt is a complete
  -- reconciliation of the named prior statement on the SAME account, the periods are
  -- date-contiguous, and this statement's opening is that receipt's certified closing.
  if (r.prior_statement_id is null) <> (r.prior_reconciliation_id is null) then
    raise exception 'reconciliation % names one half of its chain link', r.id
      using errcode='CLR10',detail='{"reason":"recon_chain_incoherent"}';
  end if;
  if r.prior_statement_id is not null then
    select * into p from clara.bank_reconciliations br where br.id = r.prior_reconciliation_id;
    if not found or p.statement_id <> r.prior_statement_id
       or p.bank_account_id <> r.bank_account_id or p.status <> 'complete' then
      raise exception 'reconciliation %''s prior link is not a complete reconciliation of its named prior statement on this account', r.id
        using errcode='CLR10',detail='{"reason":"recon_chain_incoherent"}';
    end if;
    if p.period_end <> (r.period_start - 1) then
      raise exception 'reconciliation %''s prior period ends on %, not the day before this one starts', r.id, p.period_end
        using errcode='CLR10',detail='{"reason":"recon_chain_incoherent"}';
    end if;
    if r.opening_cents <> p.closing_cents then
      raise exception 'reconciliation % opens at % but its prior receipt certified a closing of %', r.id, r.opening_cents, p.closing_cents
        using errcode='CLR10',detail='{"reason":"recon_chain_incoherent"}';
    end if;
  end if;

  -- (5) THE STORED-TERMS IDENTITY. Two arms, one law (see the header).
  if r.prior_reconciliation_id is null then
    v_lhs := r.opening_cents + r.gl_balance_cents - r.outstanding_cents + r.excepted_cents;
  else
    v_lhs := r.opening_cents
             + (r.gl_balance_cents  - p.gl_balance_cents)
             - (r.outstanding_cents - p.outstanding_cents)
             + (r.excepted_cents    - p.excepted_cents);
  end if;
  if v_lhs <> r.closing_cents then
    raise exception 'reconciliation % does not close: % against a certified closing of %', r.id, v_lhs, r.closing_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_identity_broken','reconciliation_id',r.id,
          'computed_cents',v_lhs,'closing_cents',r.closing_cents,
          'opening_cents',r.opening_cents,'gl_balance_cents',r.gl_balance_cents,
          'outstanding_cents',r.outstanding_cents,'excepted_cents',r.excepted_cents)::text;
  end if;

  -- (6) THE SNAPSHOT ENUMERATES EXACTLY THE STORED TERMS. Not "mentions" -- ADDS UP TO. A
  -- snapshot that lists a different world than the terms it sits beside is worse than no
  -- snapshot, because it reads as evidence.
  if (sn#>>'{terms,gl_prime_cents}')::bigint    is distinct from r.gl_balance_cents
     or (sn#>>'{terms,outstanding_cents}')::bigint is distinct from r.outstanding_cents
     or (sn#>>'{terms,excepted_cents}')::bigint   is distinct from r.excepted_cents
     or (sn->>'statement_closing_cents')::bigint  is distinct from r.closing_cents
     or (sn->>'statement_opening_cents')::bigint  is distinct from r.opening_cents then
    raise exception 'reconciliation %''s snapshot terms do not equal its stored terms', r.id
      using errcode='CLR10',detail='{"reason":"recon_snapshot_incoherent"}';
  end if;
  -- outstanding = SUM(entry sides) + SUM(group items). This is design 4.1's BINDING made
  -- checkable: uncleared + capacity' is exactly the two enumerations added together.
  select coalesce(sum((e.elem->>'cents')::bigint), 0)::bigint into v_sum
    from jsonb_array_elements(coalesce(sn->'outstanding_entry_sides','[]'::jsonb)) as e(elem);
  select v_sum + coalesce(sum((e.elem->>'uncleared_cents')::bigint), 0)::bigint into v_sum
    from jsonb_array_elements(coalesce(sn->'outstanding_group_items','[]'::jsonb)) as e(elem);
  if v_sum <> r.outstanding_cents then
    raise exception 'reconciliation %''s outstanding enumeration sums to % against a stored % cents', r.id, v_sum, r.outstanding_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_snapshot_incoherent','reconciliation_id',r.id,
          'enumerated_cents',v_sum,'outstanding_cents',r.outstanding_cents)::text;
  end if;
  -- excepted = SUM(the enumerated exception lines), per line, signed.
  select coalesce(sum((e.elem->>'amount_cents')::bigint), 0)::bigint into v_sum
    from jsonb_array_elements(coalesce(sn->'exceptions','[]'::jsonb)) as e(elem);
  if v_sum <> r.excepted_cents then
    raise exception 'reconciliation %''s exception enumeration sums to % against a stored % cents', r.id, v_sum, r.excepted_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_snapshot_incoherent','reconciliation_id',r.id,
          'enumerated_cents',v_sum,'excepted_cents',r.excepted_cents)::text;
  end if;
  -- THE INDEPENDENT WITNESS. closing = opening_anchor + matched lines + excepted is the same
  -- identity read from the other end (see _bank_recon_terms' matched_line_cents note). It costs
  -- one subtraction and it catches a term that was mis-stored in a way the first arm cannot see
  -- -- for instance gl' and outstanding both wrong by the same amount.
  if (sn->>'opening_anchor_cents') is not null
     and (sn#>>'{terms,matched_line_cents}') is not null then
    v_lhs := (sn->>'opening_anchor_cents')::bigint
             + (sn#>>'{terms,matched_line_cents}')::bigint
             + r.excepted_cents;
    if v_lhs <> r.closing_cents then
      raise exception 'reconciliation %''s matched-line witness gives % against a certified closing of %', r.id, v_lhs, r.closing_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_identity_broken','arm','matched_line_witness',
            'reconciliation_id',r.id,'computed_cents',v_lhs,'closing_cents',r.closing_cents)::text;
    end if;
  end if;
  return null;
end $$;
revoke all on function clara._tf_bank_recon_belt() from public;

create constraint trigger t_bank_reconciliations_belt
  after insert or update on clara.bank_reconciliations
  deferrable initially deferred
  for each row execute function clara._tf_bank_recon_belt();


-- =====================================================================================
-- S2.5 -- clara._tf_bank_settled_authority_belt. AUTHORITY ONLY. DEFERRED. NEVER ARITHMETIC.
--
-- THE BELT SPLIT IS THE POINT [ladder rows 2/15, all four review lanes]. A single belt that
-- both certified the arithmetic and policed the authority had to re-derive live money on every
-- membership and exception write, and therefore refused the lawful later acts the design
-- ratifies. This half computes NO money. It answers three authority questions:
--
--   (a) THE SETTLED-PERIOD LAW (recon_period_settled). Once a period is complete, its lines'
--       live membership is frozen. RELEASING a membership (the unmatch cascade) or COMPLETING a
--       pending one changes what the certified receipt certified, so it refuses -- undo is
--       voiding the chain back, newest first, and /bank says "this will void N receipts" before
--       the act (design sections 3/7/10).
--       ADDING a membership on a settled line is ALLOWED IFF that line carries an exception
--       row, and that is not a loophole -- it is the ratified resolved-then-booked door
--       (design 4.2). It is arithmetically neutral for every completed receipt: excepted(P)
--       counts "open OR resolved-with-the-line-unmatched", so the line's full amount simply
--       moves from excepted into the matched-line total, and every all-time term downstream is
--       unchanged. Any OTHER add is unreachable on a healthy book (completion required every
--       line to be matched or excepted) and is refused here so it stays unreachable.
--
--   (b) EXCEPTION WRITES CARRY THEIR VERB'S MARKS. The exception door sits at the OWNER floor
--       (WCC-R2 as the ladder made it structural, row 36): a bookkeeper may not acknowledge
--       away an unbooked payroll run. A free-text reason and a verb-side rank check are a
--       property of the write path; this is the structural half -- the actor recorded on the
--       row must actually hold owner rank in the row's own firm, and must not be the agent.
--       A resolved row must carry a resolver, a disposition and a note.
--
--   (c) AN OPEN EXCEPTION'S STATEMENT IS LIVE [ladder row 21]. An open dispute against a
--       statement nobody holds any more is a term with no fact behind it. The other half of
--       this law -- open_exception_present on void_bank_statement -- is the splice lane's.
--
-- RE-QUERY BY ID, and here that is not hypothetical: the exclusivity FK is ON UPDATE CASCADE,
-- so unmatching a group REWRITES group_status on every member row AFTER those rows' own
-- triggers were queued (0038:3220-3226).
-- =====================================================================================
create function clara._tf_bank_settled_authority_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  m record; x record; ln record; st record;
  v_n int; v_ids uuid[]; v_rank int;
begin
  -- ---------------------------------------------------------------
  -- ARM (a) -- THE MEMBER TABLES.
  -- ---------------------------------------------------------------
  if tg_table_name = 'bank_match_line_members' then
    select * into m from clara.bank_match_line_members mm where mm.id = new.id;
    if not found then return null; end if;
    select count(*)::int into v_n
      from clara.bank_statement_lines l
      join clara.bank_reconciliations br on br.statement_id = l.statement_id
                                        and br.status = 'complete'
      where l.id = m.line_id;
    if v_n = 0 then return null; end if;
    if tg_op = 'INSERT' then
      -- The resolved-then-booked door, and only that door.
      if not exists (select 1 from clara.bank_line_exceptions ex where ex.line_id = m.line_id) then
        raise exception 'statement line % lies in a reconciled period; a new match on it would change what that receipt certified', m.line_id
          using errcode='CLR10',
            detail=jsonb_build_object('reason','recon_period_settled','line_id',m.line_id,
              'match_id',m.match_id)::text;
      end if;
      return null;
    end if;
    raise exception 'statement line % lies in a reconciled period; its match cannot be released or completed until that reconciliation is voided', m.line_id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_period_settled','line_id',m.line_id,
          'match_id',m.match_id,'group_status',m.group_status)::text;
  end if;

  if tg_table_name = 'bank_match_entry_members' then
    select * into m from clara.bank_match_entry_members mm where mm.id = new.id;
    if not found then return null; end if;
    -- The law is about the group's LINES: an entry member changes the tie of a group whose
    -- lines may sit in a settled period, which is the same breach seen from the other side.
    select count(*)::int, coalesce(array_agg(distinct l.id), '{}'::uuid[]) into v_n, v_ids
      from clara.bank_match_line_members lm
      join clara.bank_statement_lines l on l.id = lm.line_id
      join clara.bank_reconciliations br on br.statement_id = l.statement_id
                                        and br.status = 'complete'
      where lm.match_id = m.match_id;
    if v_n = 0 then return null; end if;
    if tg_op = 'INSERT' then
      select count(*)::int into v_n
        from unnest(v_ids) as u(line_id)
        where not exists (select 1 from clara.bank_line_exceptions ex where ex.line_id = u.line_id);
      if v_n > 0 then
        raise exception 'bank match % holds % statement line(s) in a reconciled period; a new entry member would change what that receipt certified', m.match_id, v_n
          using errcode='CLR10',
            detail=jsonb_build_object('reason','recon_period_settled','match_id',m.match_id,
              'entry_id',m.entry_id,'settled_line_ids',to_jsonb(v_ids))::text;
      end if;
      return null;
    end if;
    raise exception 'bank match % holds statement line(s) in a reconciled period; it cannot be released or completed until that reconciliation is voided', m.match_id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_period_settled','match_id',m.match_id,
          'entry_id',m.entry_id,'settled_line_ids',to_jsonb(v_ids))::text;
  end if;

  -- ---------------------------------------------------------------
  -- ARMS (b) and (c) -- THE EXCEPTION TABLE.
  -- ---------------------------------------------------------------
  select * into x from clara.bank_line_exceptions ex where ex.id = new.id;
  if not found then return null; end if;

  -- Congruence the FKs cannot express because they cannot join: the line's own statement is the
  -- statement this row names, and the account follows from the line.
  select * into ln from clara.bank_statement_lines l where l.id = x.line_id;
  if not found then
    raise exception 'bank line exception % names no statement line', x.id
      using errcode='CLR10',detail='{"reason":"exception_line_orphan"}';
  end if;
  if ln.firm_id <> x.firm_id or ln.client_id <> x.client_id then
    raise exception 'bank line exception % names a line outside its own client', x.id
      using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
  end if;
  if ln.statement_id <> x.statement_id or ln.bank_account_id is distinct from x.bank_account_id then
    raise exception 'bank line exception % does not name its line''s own statement or account', x.id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','exception_congruence_broken','exception_id',x.id,
          'line_id',x.line_id)::text;
  end if;

  -- (c) an OPEN exception's statement is live.
  select * into st from clara.bank_statements bs where bs.id = x.statement_id;
  if x.status = 'open' and (not found or st.status <> 'live') then
    raise exception 'bank line exception % is open against a % statement; an open dispute needs a statement that still stands', x.id, coalesce(st.status,'missing')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','exception_statement_not_live','exception_id',x.id,
          'statement_id',x.statement_id)::text;
  end if;

  -- (b) THE OWNER FLOOR, STRUCTURALLY. clara.actor_role_rank() answers for the SESSION; this
  -- must answer for the ACTOR ON THE ROW, so the membership is read directly (0002:447-451's
  -- shape, re-keyed from jwt_sub() to the stored actor).
  select clara.role_rank(fm.role) into v_rank
    from clara.firm_memberships fm
    join clara.users u on u.id = fm.user_id
   where fm.user_id = x.created_by and fm.firm_id = x.firm_id and fm.status = 'active'
     and u.is_agent = false
   limit 1;
  if x.created_by is null or coalesce(v_rank, -1) < clara.role_rank('owner') then
    raise exception 'bank line exception % was not written by a firm principal; the exception door is an owner act', x.id
      using errcode='CLR04',
        detail=jsonb_build_object('reason','exception_floor_breached','exception_id',x.id,
          'created_by',x.created_by)::text;
  end if;
  if nullif(btrim(coalesce(x.reason,'')),'') is null then
    raise exception 'bank line exception % carries no reason', x.id
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;

  if x.status = 'resolved' then
    select clara.role_rank(fm.role) into v_rank
      from clara.firm_memberships fm
      join clara.users u on u.id = fm.user_id
     where fm.user_id = x.resolved_by and fm.firm_id = x.firm_id and fm.status = 'active'
       and u.is_agent = false
     limit 1;
    if x.resolved_by is null or x.resolved_at is null
       or coalesce(v_rank, -1) < clara.role_rank('owner') then
      raise exception 'bank line exception % was not resolved by a firm principal; resolution is an owner act', x.id
        using errcode='CLR04',
          detail=jsonb_build_object('reason','exception_floor_breached','exception_id',x.id,
            'resolved_by',x.resolved_by)::text;
    end if;
    if x.resolution_disposition is null
       or nullif(btrim(coalesce(x.resolution_note,'')),'') is null then
      raise exception 'bank line exception % is resolved without a disposition or a note', x.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','exception_resolution_incomplete','exception_id',x.id)::text;
    end if;
    -- DISPOSITION-LINKED RESOLUTION, the authority half only [ladder row 2 + the delta round's
    -- disposition hole]. matched_booking and written_off_adjustment both END WITH THE LINE
    -- MATCHED -- that is what stops a resolved line falling out of every term. The corrective-
    -- pair arithmetic (both legs excepted, netting to zero) is deliberately NOT asserted here:
    -- this belt never computes money, and that assert belongs to the resolve verb.
    if x.resolution_disposition in ('matched_booking','written_off_adjustment')
       and not exists (select 1 from clara.bank_match_line_members lm
                        join clara.bank_matches bm on bm.id = lm.match_id
                       where lm.line_id = x.line_id and bm.status = 'live') then
      raise exception 'bank line exception % is resolved as % but its line is in no live match; the booking must land in the same transaction', x.id, x.resolution_disposition
        using errcode='CLR10',
          detail=jsonb_build_object('reason','disposition_unbooked','exception_id',x.id,
            'line_id',x.line_id,'disposition',x.resolution_disposition)::text;
    end if;
  else
    if x.resolved_by is not null or x.resolved_at is not null
       or x.resolution_disposition is not null or x.resolution_note is not null then
      raise exception 'bank line exception % is open but carries resolution stamps', x.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','exception_resolution_incomplete','exception_id',x.id)::text;
    end if;
    -- AN OPEN EXCEPTION AND A LIVE MATCH ARE MUTUALLY EXCLUSIVE, closed here as the structural
    -- backstop behind the shared line FOR UPDATE the two verbs take [ladder row 38, the
    -- cross-table write-skew: two transactions, both deferred checks passing]. The verb-side
    -- refusals are line_excepted and line_already_matched; this is the law behind them.
    if exists (select 1 from clara.bank_match_line_members lm
                join clara.bank_matches bm on bm.id = lm.match_id
               where lm.line_id = x.line_id and bm.status in ('pending','live')) then
      raise exception 'statement line % carries an open exception and a live match at once', x.line_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','line_already_matched','exception_id',x.id,
            'line_id',x.line_id)::text;
    end if;
  end if;
  return null;
end $$;
revoke all on function clara._tf_bank_settled_authority_belt() from public;

create constraint trigger t_bmlm_settled_authority
  after insert or update on clara.bank_match_line_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_settled_authority_belt();
create constraint trigger t_bmem_settled_authority
  after insert or update on clara.bank_match_entry_members
  deferrable initially deferred
  for each row execute function clara._tf_bank_settled_authority_belt();
create constraint trigger t_bank_line_exceptions_settled_authority
  after insert or update on clara.bank_line_exceptions
  deferrable initially deferred
  for each row execute function clara._tf_bank_settled_authority_belt();


-- =====================================================================================
-- S2.6 -- ACLs. The two reconciliation verbs are HUMAN VERBS and reach clara_authenticated
-- ONLY -- no wake role, no clara_runtime, no clara_agent_ro, no PUBLIC. Whether a month ties is
-- a professional judgement, and the agent never makes one (design section 10: zero agent grants
-- on every new table, restated for the verbs that write them).
--
-- The derivation and the two trigger functions are granted to NOBODY: every caller is itself a
-- SECURITY DEFINER function owned by clara_fn_owner, which holds EXECUTE implicitly as owner,
-- and the trigger machinery runs a trigger function as the table owner. Each still carries its
-- own explicit revoke, because PostgreSQL grants EXECUTE to PUBLIC on every new function by
-- default and ALTER DEFAULT PRIVILEGES does not stop it (the T17b-proven mechanism 0037:3416-
-- 3419 records, restated at 0038:5273-5276).
-- =====================================================================================
revoke all on function clara._bank_recon_terms(uuid,timestamptz) from public;
revoke all on function clara._tf_bank_recon_belt() from public;
revoke all on function clara._tf_bank_settled_authority_belt() from public;

revoke all on function clara.complete_bank_reconciliation(uuid,uuid[],text) from public;
revoke all on function clara.void_bank_reconciliation(uuid,text,text) from public;

grant execute on function
  clara.complete_bank_reconciliation(uuid,uuid[],text),
  clara.void_bank_reconciliation(uuid,text,text)
to clara_authenticated;


-- =====================================================================================
-- END OF THE clara_fn_owner REGION FOR SECTIONS S1+S2. Sections S3, S4 and S5 each re-open
-- their own region (and close it), so this is the ONE reset that closes S1+S2's shared scope.
-- The event registration below must run as the MIGRATION role, not as clara_fn_owner
-- (clara.event_types / clara.trigger_taxonomy are migration-owned) -- the 0038:8413-8423
-- ROLE NOTE precedent.
-- =====================================================================================
reset role;


-- =====================================================================================
-- SECTION EVENTS -- PLACEMENT NOTE (assembler). This block is S1's, RELOCATED here per its
-- own ROLE NOTE: it must run after S1+S2's clara_fn_owner DDL and BEFORE section S3, whose
-- SS0 probe 6 asserts that five of these seven names are already registered (S3's verbs call
-- clara._append_event against clara.event_types' hard FK, 0005:83).
-- =====================================================================================
-- =====================================================================================
-- ROLE NOTE, before SECTION EVENTS: exactly the 0038 precedent. This file carries no verbs,
-- so if it is assembled STANDALONE it has nothing after this point that needs
-- clara_fn_owner, and `reset role;` below closes THIS FILE's own portion of the scope. If the
-- assembling lane splices the verb/RPC section (which DOES need clara_fn_owner) between the
-- ALTER TABLE statements above and this line, MOVE this `reset role;` (and SECTION EVENTS
-- below it) to after that section's own ACL grants instead, so there is exactly ONE
-- `reset role;` at the true end of the scope, not one per contributing file.
--
-- SECTION EVENTS -- the seven bank.* event types (design SS4.5), registered against the
-- ACTIVE taxonomy version, the exact 0037:3443-3469 / 0038:8436-8465 shape. All client-scoped,
-- all decision 'ignore': match state, exception state and rule lifecycle are STATE C-c's read
-- RPCs surface directly -- /bank and /aging read the tables, not the stream, exactly the
-- 0037/0038 reasoning restated. Payloads carry IDENTIFIERS ONLY (never account numbers, never
-- line descriptions, never rule patterns) -- the payload-key allowlist scan against these
-- seven names is a named TAIL deliverable, not this file's; the keys each verb's emitted
-- payload is expected to carry are listed in s10-notes.md for the tail lane.
-- =====================================================================================

with added(name, client_scoped, description, decision, note) as (values
  ('bank.reconciliation_completed', true,
    'A bank reconciliation receipt was completed for a statement period', 'ignore', null::text),
  ('bank.reconciliation_voided', true,
    'A bank reconciliation receipt was voided', 'ignore', null::text),
  ('bank.line_excepted', true,
    'A statement line was excepted from matching (bank error or dispute)', 'ignore', null::text),
  ('bank.line_exception_resolved', true,
    'An open bank line exception was resolved', 'ignore', null::text),
  ('bank.rule_proposed', true,
    'A bank rule (match/settle or coding) was proposed from a sighted pattern', 'ignore', null::text),
  ('bank.rule_signed', true,
    'A proposed bank rule was signed by the firm owner', 'ignore', null::text),
  ('bank.rule_retired', true,
    'A signed bank rule was retired', 'ignore', null::text)
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- #####################################################################################
-- ############# SECTION S3 -- DOORS, RULES, TERMS, READ RPCs ##########################
-- #####################################################################################

-- s30-doors-rules.sql -- Wave C-c LANE S3: the narrow exception door, signed bank rules,
-- counterparty payment terms, and the six read RPCs (design v2.1 SS4.2/4.3/4.4/6, part2
-- rulings WCC-R1..R8, ladder-round-1/2 fixes). This file is ONE lane's contribution to the
-- assembled migration 0040 -- it does NOT create clara.bank_reconciliations,
-- clara.bank_line_exceptions, clara.bank_rules, or the counterparties.payment_terms_days /
-- open_item_allocations.effective_date columns (S1's schema lane owns those, built from the
-- SAME design text this file reads). It also does not build clara._bank_recon_terms or
-- complete_bank_reconciliation / void_bank_reconciliation (S2's lane). This file assumes,
-- and SECTION 0 below probes, that by the time it runs inside the assembled 0040 those
-- pieces already exist in EXACTLY the shape design v2.1 SS4 states.
--
-- SCOPE (design v2.1 SS5/SS6, this lane's work order items 1-7):
--   1. clara.except_bank_line            -- owner floor, the narrow door.
--   2. clara.resolve_bank_line_exception -- owner floor, disposition-linked resolution.
--   3. clara.propose_bank_rule           -- bookkeeper floor, in-verb derived evidence.
--   4. clara.sign_bank_rule / clara.retire_bank_rule -- owner floor.
--   5. clara.set_counterparty_terms      -- bookkeeper floor.
--   6. clara._subledger_outstanding_asof -- the 0037 _subledger_outstanding sibling.
--   7. The six read RPCs: ar_aging, ap_aging, customer_statement, supplier_statement,
--      list_unmatched_lines, get_bank_reconciliation, list_bank_line_suggestions,
--      list_bank_rule_candidates (design SS6 names six ROW LABELS; ar/ap_aging and
--      customer/supplier_statement are two functions each, giving eight actual RPCs -- all
--      eight are built here).
--
-- HOUSE IDIOMS this file follows, each verified against the LIVE substrate this session
-- (packages/db/migrations, 0002/0004/0037/0038 -- file:line cited inline at first use):
--   * clara._human_ctx(clara.role_rank(<floor>)) -- 0004:299-309. role_rank ordering
--     viewer(0) < bookkeeper(1) < admin(2) < owner(3) -- 0002:326-331 -- 'owner' IS the true
--     top floor; there is no higher rank to verify against.
--   * op-key idempotency via clara._reserve_op / clara._finish_op -- 0004:46-68 -- reserved
--     BEFORE any lock (0037:2678-2698's reasoning, applied identically at 0038:3954-3960):
--     _reserve_op writes a row and can block on a concurrent inserter of the same key: taking
--     that block while already holding a lock opens a deadlock window a pre-lock reservation
--     closes for free (rollback-safe, 0004:43-60).
--   * clara._append_event, ID-ONLY payloads (design SS4.5/SS4.8) -- 0005:476-491 -- every
--     bank.* payload below carries identifiers and enum/status tokens only; no free-text
--     reason/note/description ever reaches a payload, matching the 0038 tail's payload-key
--     allowlist law (0038:9017-9096) which this file's events are written to satisfy even
--     though 0040's own tail is out of this lane's scope.
--   * the pre-read / reserve / advisory-lock / RE-READ-under-lock shape of
--     clara.void_bank_statement (0038:2211-2287): find the row unlocked to resolve tenancy
--     and the lock keys, reserve the op, take the advisory rungs, THEN re-establish truth
--     under the locks rather than trusting the first read.
--   * revoke-all-from-public + explicit grant-to-clara_authenticated per writer (0038:5284-
--     5296); a bulk revoke/grant/owner loop for the read RPCs (0038:8056-8064).
--   * NO clara_agent_ro / clara_runtime / wake-role grant anywhere in this file -- WCA-R1's
--     "zero wake-role grants" restated for C-c (design SS4.1 note, "stated for every table in
--     this design"; the same law applies to every verb here).
--
-- VERIFY-DON'T-GUESS notes (substrate facts re-checked this session, not assumed from the
-- design prose alone):
--   * clara.documents.sha256 is `not null` at the schema level (0003:68) -- "provenance-bound
--     (sha256 present) when supplied" therefore reduces to the evidence row EXISTING in the
--     right firm/client scope; this file additionally requires bytes_verified_at is not null
--     (0007:28, the pervasive integrity floor every other evidence-citing verb in this
--     codebase applies -- 0020:5641-5646 et al) as a deliberate strengthening beyond the
--     design's literal words, named here rather than silently added.
--   * clara._tf_counterparty_update_0011's non-merge whitelist is EXACTLY
--     array['name','name_normalized','updated_at'] (0011:940-958, verified this session) --
--     clara.set_counterparty_terms below therefore depends on the splice register's entry 8
--     (design SS5) widening that whitelist to admit payment_terms_days. This file does NOT
--     perform that splice (out of this lane's scope) and says so at the call site.
--   * clara._canonical_counterparty(p_client, p_counterparty) is a 2-arg (client, id) ->
--     canonical-id resolver, returns NULL on a foreign/unknown id (0011:1316-1333) --
--     used throughout below for cross-firm-safe zero-rows behaviour, never an existence
--     oracle.
--   * counterparties.kind admits 'vendor' AND 'customer' (widened 0015:160); merged_into /
--     retired_at added 0011:607-608.
--   * Postgres Advanced Regular Expressions are NOT newline-sensitive by default: a bracket
--     expression like [^a-z0-9] matches an embedded '\n' exactly like any other non-alnum
--     character unless the 'n' flag is given (which this file never passes) -- so the
--     word-boundary idiom below (mirroring packages/runtime/lib/statement-layout-reader.mjs's
--     containsSynonym, verified this session) is multi-line-safe with NO special-casing.
--
-- OPEN QUESTIONS this file could not resolve from the design text alone are logged, each
-- with its concrete engineering decision, in s30-notes.md (same directory) -- the corrective-
-- pair link (no stored column exists in design SS4.2's exact schema), the kind-invariance of
-- _bank_rule_sightings, and the single-token candidate-breeding simplification are the three
-- load-bearing ones.
--
-- =====================================================================================
-- SECTION 0 -- PRE-DDL LIVE PROBES (the 0037:64-162 / 0038:64-162 shape: fail fast, name the
-- remedy, before creating a single function).
-- =====================================================================================
do $probe$
declare
  v_frontier int;
  v_recon int; v_exc int; v_rules int;
  v_terms_col int; v_eff_col int;
  v_recon_terms_fn int;
  v_dup_fns int; v_dup_names text;
  v_events int;
begin
  -- PROBE 1 -- FRONTIER. This lane's verbs read clara.open_items/open_item_allocations
  -- (0037) and clara.bank_statements/bank_statement_lines/bank_match_line_members (0038)
  -- directly; both must be the applied frontier or later.
  select count(*)::int into v_frontier from clara.schema_migrations
    where version in ('0037_wave_c_a_subledger','0038_wave_c_b_bank');
  if v_frontier <> 2 then
    raise exception '0040/S3 probe 1: migrations 0037_wave_c_a_subledger and 0038_wave_c_b_bank are not both recorded as applied -- apply in order before this lane''s functions can be created';
  end if;

  -- PROBE 2 -- S1's THREE NEW RELATIONS EXIST (this lane's functions read/write them; a
  -- missing relation here means the schema lane has not landed yet in this assembly, and
  -- every CREATE FUNCTION below would fail with a much less legible error).
  select count(*)::int into v_recon from pg_class t join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='clara' and t.relname='bank_reconciliations';
  select count(*)::int into v_exc from pg_class t join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='clara' and t.relname='bank_line_exceptions';
  select count(*)::int into v_rules from pg_class t join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='clara' and t.relname='bank_rules';
  if v_recon <> 1 or v_exc <> 1 or v_rules <> 1 then
    raise exception '0040/S3 probe 2: one or more of clara.bank_reconciliations (%), clara.bank_line_exceptions (%), clara.bank_rules (%) does not exist -- the S1 schema lane must run before this file', v_recon, v_exc, v_rules;
  end if;

  -- PROBE 3 -- S1's TWO COLUMN ADDITIONS EXIST (design SS4.4: counterparties.
  -- payment_terms_days, open_item_allocations.effective_date).
  select count(*)::int into v_terms_col from information_schema.columns
    where table_schema='clara' and table_name='counterparties' and column_name='payment_terms_days';
  select count(*)::int into v_eff_col from information_schema.columns
    where table_schema='clara' and table_name='open_item_allocations' and column_name='effective_date';
  if v_terms_col <> 1 or v_eff_col <> 1 then
    raise exception '0040/S3 probe 3: clara.counterparties.payment_terms_days (%) or clara.open_item_allocations.effective_date (%) is missing -- S1''s column additions have not landed', v_terms_col, v_eff_col;
  end if;

  -- PROBE 4 -- S2's clara._bank_recon_terms EXISTS (get_bank_reconciliation's live-preview
  -- path calls it directly; any 2-argument overload is accepted here since the exact
  -- parameter TYPE of the cutoff argument is S2's call, not probed further than arity).
  select count(*)::int into v_recon_terms_fn
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_bank_recon_terms' and p.pronargs=2;
  if v_recon_terms_fn <> 1 then
    raise exception '0040/S3 probe 4: clara._bank_recon_terms(2 args) does not exist -- the S2 lane (complete/void_bank_reconciliation) must land before this file''s get_bank_reconciliation can be created';
  end if;

  -- PROBE 5 -- PRE-STATE SAFETY: none of the function NAMES this file is about to CREATE
  -- already exist (a hit means a partial or duplicate re-apply of this lane, not a fresh
  -- assembly).
  select count(*)::int, string_agg(p.proname, ', ' order by p.proname) into v_dup_fns, v_dup_names
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname in (
      'except_bank_line','resolve_bank_line_exception','propose_bank_rule',
      'sign_bank_rule','retire_bank_rule','set_counterparty_terms',
      '_subledger_outstanding_asof','_bank_rule_pattern_norm','_bank_rule_sightings',
      '_bank_desc_word_match','_bank_rule_regex_escape','_bank_line_class_hint',
      '_aging_core','_statement_core',
      'ar_aging','ap_aging','customer_statement','supplier_statement',
      'list_unmatched_lines','get_bank_reconciliation','list_bank_line_suggestions',
      'list_bank_rule_candidates','list_bank_rules');
  if v_dup_fns <> 0 then
    raise exception '0040/S3 probe 5: % function(s) this lane is about to create already exist (%) -- partial or duplicate re-apply', v_dup_fns, v_dup_names;
  end if;

  -- PROBE 6 -- THE FIVE bank.* EVENT TYPES THIS LANE'S VERBS EMIT ALREADY EXIST. S1 owns
  -- ALL SEVEN bank.* event-type registrations in one place (s10-tables.sql:205-214,
  -- 851-859 -- confirmed this session; this lane does NOT register events itself, to avoid
  -- a duplicate-insert collision with S1's own registration). Each of this lane's verbs
  -- calls clara._append_event('bank.<name>', ...), which fails with a foreign-key violation
  -- against clara.event_types(name) at RUN time if the type is missing (0005:83) -- probed
  -- here instead so a missing registration is caught at MIGRATION time with a legible
  -- remedy, not the first time a human excepts a line in production.
  select count(*)::int into v_events from clara.event_types
    where name in ('bank.line_excepted','bank.line_exception_resolved',
                    'bank.rule_proposed','bank.rule_signed','bank.rule_retired');
  if v_events <> 5 then
    raise exception '0040/S3 probe 6: only % of the 5 bank.* event types this lane''s verbs emit are registered in clara.event_types -- S1''s event-type registration must land before this file', v_events;
  end if;

  raise notice '0040/S3 probe OK (0/6): 0037+0038 are the applied frontier, S1''s three tables and two columns exist, S2''s _bank_recon_terms(2 args) exists, none of this lane''s 23 function names pre-exist, and S1 has already registered the 5 bank.* event types this lane''s verbs emit';
end
$probe$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION HELPERS -- internal, ungranted. Every one of these is called ONLY from inside
-- another clara_fn_owner-owned SECURITY DEFINER function; none is ever reachable directly by
-- an app role (each carries its own `revoke all ... from public`, belt-and-braces against the
-- schema default already set by 0009).
-- =====================================================================================

-- Literal-string escape for building a safe regex OUT OF caller-controlled text. Chained
-- replace() calls (plain string substitution, NOT regex) so there is zero regex-in-regex
-- escaping ambiguity -- backslash is escaped FIRST, so the backslashes this function itself
-- inserts for the other 13 characters are never re-escaped by a later step in the chain.
create function clara._bank_rule_regex_escape(p_token text) returns text
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
           replace(replace(replace(replace(coalesce(p_token, ''),
           '\', '\\'),
           '.', '\.'),
           '^', '\^'),
           '$', '\$'),
           '*', '\*'),
           '+', '\+'),
           '?', '\?'),
           '(', '\('),
           ')', '\)'),
           '[', '\['),
           ']', '\]'),
           '{', '\{'),
           '}', '\}'),
           '|', '\|');
$$;
revoke all on function clara._bank_rule_regex_escape(text) from public;

-- Word-bounded ALL-tokens containment over (possibly multi-line) description text -- the ONE
-- matching idiom for every bank-rule / class-hint predicate below, mirroring
-- packages/runtime/lib/statement-layout-reader.mjs's containsSynonym (verified this session,
-- statement-layout-reader.mjs:175-180): `(?:^|[^a-z0-9])TOKEN(?:[^a-z0-9]|$)`, case-folded.
-- ALL tokens in p_tokens must match (AND semantics) -- a single-token pattern is simply an
-- array of length 1, so this same function serves both the one-keyword class hints and a
-- multi-token signed rule.
create function clara._bank_desc_word_match(p_description text, p_tokens text[])
  returns boolean
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select p_description is not null
    and p_tokens is not null
    and array_length(p_tokens, 1) > 0
    and not exists (
      select 1 from unnest(p_tokens) as t(tok)
      where lower(p_description) !~ (
        '(?:^|[^a-z0-9])' || clara._bank_rule_regex_escape(lower(tok)) || '(?:[^a-z0-9]|$)'
      )
    );
$$;
revoke all on function clara._bank_desc_word_match(text, text[]) from public;

-- Validate + CANONICALISE a bank-rule pattern (design SS4.3: "word-bounded tokens over
-- MULTI-LINE description + direction (+ optional amount shape)"). Canonical form: tokens
-- lower-cased, trimmed, de-duplicated, SORTED (so two callers naming the same token set in a
-- different order hash identically -- the 0037 "normalize BEFORE hashing" law, 0037:2101-2102
-- restated); direction one of debit/credit/either; amount_shape present only when at least one
-- bound is given, with min_cents >= 0, max_cents > 0, min <= max when both given.
-- IMMUTABLE: pure function of its input, raises on malformed input rather than returning null
-- (every caller wants the SAME named refusal, so the raise happens once, here).
create function clara._bank_rule_pattern_norm(p_pattern jsonb) returns jsonb
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare
  v_tokens text[]; v_dir text; v_shape jsonb;
  v_min_txt text; v_max_txt text; v_min bigint; v_max bigint;
begin
  if p_pattern is null or jsonb_typeof(p_pattern) <> 'object' then
    raise exception 'a bank rule pattern must be a json object'
      using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
  end if;
  if jsonb_typeof(p_pattern->'tokens') is distinct from 'array'
      or jsonb_array_length(p_pattern->'tokens') = 0 then
    raise exception 'a bank rule pattern must carry a non-empty tokens array'
      using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
  end if;
  select array_agg(distinct lower(btrim(t))) into v_tokens
    from jsonb_array_elements_text(p_pattern->'tokens') t
    where nullif(btrim(t), '') is not null;
  if v_tokens is null or array_length(v_tokens, 1) = 0 then
    raise exception 'a bank rule pattern token set must contain at least one non-blank token'
      using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
  end if;
  select array_agg(x order by x) into v_tokens from unnest(v_tokens) x;

  v_dir := p_pattern->>'direction';
  if v_dir is null or v_dir not in ('debit', 'credit', 'either') then
    raise exception 'a bank rule pattern direction must be debit, credit, or either'
      using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
  end if;

  v_shape := null;
  if p_pattern ? 'amount_shape'
      and jsonb_typeof(p_pattern->'amount_shape') is distinct from 'null' then
    if jsonb_typeof(p_pattern->'amount_shape') <> 'object' then
      raise exception 'a bank rule amount_shape must be a json object'
        using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
    end if;
    if (p_pattern->'amount_shape' ? 'min_cents'
        and jsonb_typeof(p_pattern->'amount_shape'->'min_cents') not in ('number','null'))
       or (p_pattern->'amount_shape' ? 'max_cents'
           and jsonb_typeof(p_pattern->'amount_shape'->'max_cents') not in ('number','null')) then
      raise exception 'a bank rule amount_shape''s min_cents/max_cents must be numbers'
        using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
    end if;
    -- Whole cents only -- REJECT a fractional bound rather than silently truncate it (the
    -- match_bank_line house convention for every money-shaped input, 0038:3887-3889:
    -- "(x.elem->>'amount_cents')::numeric <> trunc(...)" raises, it never rounds).
    v_min_txt := p_pattern->'amount_shape'->>'min_cents';
    v_max_txt := p_pattern->'amount_shape'->>'max_cents';
    if v_min_txt is not null and v_min_txt::numeric <> trunc(v_min_txt::numeric) then
      raise exception 'a bank rule amount_shape min_cents must be a whole number of cents'
        using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
    end if;
    if v_max_txt is not null and v_max_txt::numeric <> trunc(v_max_txt::numeric) then
      raise exception 'a bank rule amount_shape max_cents must be a whole number of cents'
        using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
    end if;
    v_min := case when v_min_txt is null then null else v_min_txt::numeric::bigint end;
    v_max := case when v_max_txt is null then null else v_max_txt::numeric::bigint end;
    if v_min is null and v_max is null then
      raise exception 'a bank rule amount_shape must carry min_cents and/or max_cents'
        using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
    end if;
    if (v_min is not null and v_min < 0) or (v_max is not null and v_max <= 0)
        or (v_min is not null and v_max is not null and v_min > v_max) then
      raise exception 'a bank rule amount_shape range is invalid (min_cents >= 0, max_cents > 0, min_cents <= max_cents)'
        using errcode='CLR10',detail='{"reason":"rule_pattern_malformed"}';
    end if;
    v_shape := jsonb_strip_nulls(jsonb_build_object('min_cents', v_min, 'max_cents', v_max));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'tokens', to_jsonb(v_tokens), 'direction', v_dir, 'amount_shape', v_shape));
end $$;
revoke all on function clara._bank_rule_pattern_norm(jsonb) from public;

-- THE SHARED SIGHTING PREDICATE (design SS4.3/SS5: "implement ONE shared internal fn
-- _bank_rule_sightings(client, kind, pattern) both [propose_bank_rule and
-- list_bank_rule_candidates] use"). Evidence = distinct bank_statement_lines, on this
-- client's LIVE statements (any bank account), whose description word-bound-matches every
-- token, whose sign matches the stated direction, and whose |amount| falls inside the stated
-- amount_shape when one is given.
--
-- DOCUMENTED DECISION (S3 lane, this session -- logged in s30-notes.md): p_kind is accepted
-- for call-signature parity with the design's named interface, but this build's predicate
-- does NOT vary by kind. A recurring bank-line pattern is equally strong evidence of
-- recurrence whichever pre-fill kind a human eventually attaches to it (match_settle vs
-- coding); nothing about "this description recurs N times" depends on that later choice.
-- Sightings are counted across ALL match states (matched or not) -- an already-matched line
-- is, if anything, STRONGER evidence (a human already confirmed the classification), the
-- same reasoning the vendor_account sighting floor applies to approved entries (0029:304-316).
create function clara._bank_rule_sightings(p_client uuid, p_kind text, p_pattern jsonb)
  returns table(line_id uuid, statement_id uuid, bank_account_id uuid,
                entry_date date, amount_cents bigint, description text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_pat jsonb; v_tokens text[]; v_dir text; v_min bigint; v_max bigint;
begin
  -- p_kind is deliberately UNUSED below; accepted for interface parity only (see the header
  -- note above). PL/pgSQL does not warn or error on an unused IN parameter.
  v_pat := clara._bank_rule_pattern_norm(p_pattern);
  select array(select jsonb_array_elements_text(v_pat->'tokens')) into v_tokens;
  v_dir := v_pat->>'direction';
  v_min := (v_pat->'amount_shape'->>'min_cents')::bigint;
  v_max := (v_pat->'amount_shape'->>'max_cents')::bigint;
  return query
    select l.id, l.statement_id, l.bank_account_id, l.entry_date, l.amount_cents, l.description
    from clara.bank_statement_lines l
    join clara.bank_statements s on s.id = l.statement_id
    where l.client_id = p_client and s.status = 'live'
      and (v_dir = 'either'
           or (v_dir = 'credit' and l.amount_cents > 0)
           or (v_dir = 'debit' and l.amount_cents < 0))
      and clara._bank_desc_word_match(l.description, v_tokens)
      and (v_min is null or abs(l.amount_cents) >= v_min)
      and (v_max is null or abs(l.amount_cents) <= v_max);
end $$;
revoke all on function clara._bank_rule_sightings(uuid, text, jsonb) from public;

-- ADVISORY, INFORMATIONAL-ONLY class hints for list_unmatched_lines (design SS6: "with class
-- hints"). NEVER authoritative -- the rule-breeding path (_bank_rule_sightings, signed by a
-- human) is the real signal; this is a small, generic, defensible statutory-keyword vocabulary
-- (deliberately NOT bespoke to any one estate's vendor codes -- "MAS PAYMENT"/"IWIFI" are RPR-
-- specific and are not hardcoded here, see s30-notes.md).
create function clara._bank_line_class_hint(p_description text) returns text
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when p_description is null then null
    when clara._bank_desc_word_match(p_description, array['epf']) then 'epf'
    when clara._bank_desc_word_match(p_description, array['lhdn']) then 'lhdn'
    when clara._bank_desc_word_match(p_description, array['perkeso'])
      or clara._bank_desc_word_match(p_description, array['socso']) then 'perkeso'
    when clara._bank_desc_word_match(p_description, array['sip'])
      or clara._bank_desc_word_match(p_description, array['eis']) then 'sip_eis'
    when clara._bank_desc_word_match(p_description, array['payroll'])
      or clara._bank_desc_word_match(p_description, array['salary'])
      or clara._bank_desc_word_match(p_description, array['gaji']) then 'payroll'
    when clara._bank_desc_word_match(p_description, array['sst']) then 'tax'
    when clara._bank_desc_word_match(p_description, array['charge'])
      or clara._bank_desc_word_match(p_description, array['fee'])
      or clara._bank_desc_word_match(p_description, array['commission']) then 'bank_charges'
    else 'other'
  end;
$$;
revoke all on function clara._bank_line_class_hint(text) from public;

-- clara._subledger_outstanding's AS-OF sibling (design item 6): amount + Sigma allocations
-- with effective_date <= p_as_of. The existing clara._subledger_outstanding (0037:874-881,
-- 5 live callers) is UNTOUCHED -- this is a new, separate function, not a recut. NULL for an
-- unknown item, exactly like its sibling (every caller must treat null as refuse, never zero).
create function clara._subledger_outstanding_asof(p_item uuid, p_as_of date) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select i.amount_cents
       + coalesce((select sum(a.amount_cents) from clara.open_item_allocations a
                   where a.item_id = i.id and a.effective_date <= p_as_of), 0)
  from clara.open_items i where i.id = p_item;
$$;
revoke all on function clara._subledger_outstanding_asof(uuid, date) from public;

-- =====================================================================================
-- SECTION DOORS -- clara.except_bank_line, clara.resolve_bank_line_exception (design SS4.2,
-- WCC-R2, ladder [L1/C5/C8]). OWNER floor. Locks: 203005004 (client) -> 203005006 (the
-- account chain lock) -> the line row(s) FOR UPDATE -- the SAME rungs and the same order
-- clara.void_bank_statement takes (0038:2196-2202, 2241-2255), so a concurrent void/match/
-- except/resolve on the same statement's lines always serializes through 203005006 first.
-- =====================================================================================

-- except_bank_line: mint the narrow exception door for one statement line. Refuses
-- line_already_matched / line_already_excepted / statement_not_live, by name.
create function clara.except_bank_line(
    p_line uuid, p_kind text, p_reason text,
    p_evidence_document uuid default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_reason text; ln record; v_id uuid;
  v_matched int; v_excepted int;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_kind is null or p_kind not in ('bank_error', 'disputed') then
    raise exception 'exception kind must be bank_error or disputed'
      using errcode='CLR10',detail='{"reason":"kind_malformed"}';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'an exception reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;

  -- Unlocked pre-read (the void_bank_statement shape, 0038:2235-2238): resolve tenancy and
  -- the lock keys BEFORE reserving the op or taking any lock. This verb has no p_client
  -- argument -- the line IS the tenancy anchor.
  select l.id, l.client_id, l.firm_id, l.bank_account_id, l.statement_id
    into ln
    from clara.bank_statement_lines l
    where l.id = p_line and l.firm_id = c.firm;
  if not found then
    raise exception 'bank statement line not found for this firm' using errcode='CLR11';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'except_bank_line', p_op_key,
    clara._hash(jsonb_build_object('line', p_line, 'kind', p_kind, 'reason', v_reason,
      'evidence_document', p_evidence_document)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- LOCK ORDER (design SS5): 203005004 -> 203005006 -> the line row FOR UPDATE.
  perform pg_advisory_xact_lock(203005004, hashtext(ln.client_id::text));
  perform pg_advisory_xact_lock(203005006, hashtext(ln.bank_account_id::text));
  perform 1 from clara.bank_statement_lines l where l.id = p_line for update;

  -- RE-ESTABLISH TRUTH UNDER THE LOCKS (the void_bank_statement discipline, 0038:2244-2246):
  -- a concurrent match/except that won the race is honoured, not overwritten.
  select count(*)::int into v_matched from clara.bank_match_line_members m
    where m.line_id = p_line and m.group_status in ('pending', 'live');
  if v_matched > 0 then
    raise exception 'statement line % is already matched; unmatch it before excepting', p_line
      using errcode='CLR10',detail='{"reason":"line_already_matched"}';
  end if;

  -- OPEN ONLY -- CORRECTED THIS SESSION against S1's actual schema (s10-tables.sql:405-410,
  -- 461: "unique(line_id) where status='open' ... line_already_excepted on a SECOND
  -- CONCURRENT except"). The unique index scopes to status='open' deliberately: a line whose
  -- prior exception RESOLVED (e.g. a closed corrective pair) is not permanently barred from
  -- ever being excepted again, only from carrying two OPEN exceptions at once. A resolved
  -- exception's line is separately kept out of list_unmatched_lines' report regardless (that
  -- report's own, stricter "any exception ever" exclusion -- s30-notes.md).
  select count(*)::int into v_excepted from clara.bank_line_exceptions e
    where e.line_id = p_line and e.status = 'open';
  if v_excepted > 0 then
    raise exception 'statement line % already carries an open exception', p_line
      using errcode='CLR10',detail='{"reason":"line_already_excepted"}';
  end if;

  if not exists (select 1 from clara.bank_statements s
      where s.id = ln.statement_id and s.status = 'live') then
    raise exception 'statement line % belongs to a statement that is not live', p_line
      using errcode='CLR10',detail='{"reason":"statement_not_live"}';
  end if;

  -- Evidence, when supplied: firm+client scoped, bytes-verified. CORRECTED THIS SESSION
  -- against S1's actual schema (s10-tables.sql:442-444, cross-verified live at
  -- 0007_document_pipeline.sql:1103-1106): clara.documents carries NO client_id column (it
  -- was DROPPED there -- "Documents are reached through ACTIVE filings"), so client
  -- attribution is validated through clara.document_filings (client_id, retired_at is null),
  -- the SAME table clara._active_document_filing (0007:982-1003, assert_provenance's own
  -- modern body) joins through -- NOT the sha256-matching variant (this verb has no expected
  -- hash to check against; the caller is naming an already-filed document as evidence, not
  -- asserting a specific content hash). documents.sha256 is NOT NULL at the schema level
  -- (0003:68) regardless, so "provenance-bound (sha256 present)" holds for any row reached
  -- this way.
  if p_evidence_document is not null then
    if not exists (select 1 from clara.documents d
        join clara.document_filings f on f.document_id = d.id
        where d.id = p_evidence_document and d.firm_id = c.firm
          and f.client_id = ln.client_id and f.retired_at is null
          and d.bytes_verified_at is not null) then
      raise exception 'evidence document is not an actively filed, verified document of this client'
        using errcode='CLR10',detail='{"reason":"evidence_mismatch"}';
    end if;
  end if;

  -- bank_account_id AND statement_id are BOTH TRIGGER-STAMPED from line_id (S1's
  -- _tf_stamp_ble_account, s10-tables.sql:465-480 -- confirmed this session to derive BOTH
  -- columns, extending the 0038:744-756 _tf_stamp_bmlm_account idiom to a second column) --
  -- both deliberately omitted from this column list.
  insert into clara.bank_line_exceptions(
      firm_id, client_id, line_id, kind, reason,
      evidence_document_id, created_by)
    values (c.firm, ln.client_id, p_line, p_kind, v_reason,
      p_evidence_document, c.actor)
    returning id into v_id;

  perform clara._audit(c.firm, c.actor, null, null, 'except_bank_line', null,
    jsonb_build_object('exception', v_id, 'line', p_line, 'statement', ln.statement_id,
      'kind', p_kind, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.line_excepted', ln.client_id, c.actor,
    null, null, null, p_evidence_document, null,
    jsonb_build_object('exception_id', v_id, 'line_id', p_line,
      'statement_id', ln.statement_id, 'bank_account_id', ln.bank_account_id, 'kind', p_kind));
  return clara._finish_op(c.firm, 'except_bank_line', p_op_key,
    jsonb_build_object('exception_id', v_id, 'line_id', p_line, 'status', 'open'));
end $$;
revoke all on function clara.except_bank_line(uuid, text, text, uuid, text) from public;

-- resolve_bank_line_exception: disposition-linked resolution (design SS4.2, ladder round-2
-- "no disposition may leave a term-less hole"). matched_booking / written_off_adjustment
-- both require the line to be a LIVE matched member NOW (else disposition_unbooked);
-- bank_corrective_line requires a named, already-excepted counterpart line (else
-- counterpart_required / counterpart_not_excepted -- the EXACT operative rule this lane was
-- given: "unless that line carries an open-or-resolved exception in the SAME txn scope",
-- i.e. re-read fresh under this transaction's locks, not "created inside this call").
create function clara.resolve_bank_line_exception(
    p_exception uuid, p_disposition text, p_note text,
    p_counterpart_line uuid default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_note text; ex record; ln record;
  v_live int; v_cp_exists int; v_cp_exc int;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_disposition is null or p_disposition not in
      ('matched_booking', 'bank_corrective_line', 'written_off_adjustment') then
    raise exception 'disposition must be matched_booking, bank_corrective_line, or written_off_adjustment'
      using errcode='CLR10',detail='{"reason":"disposition_malformed"}';
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'a resolution note is required'
      using errcode='CLR10',detail='{"reason":"resolution_note_required"}';
  end if;

  -- Unlocked pre-read of the exception + its line's tenancy/account.
  select e.id, e.firm_id, e.client_id, e.line_id, e.status, e.statement_id
    into ex
    from clara.bank_line_exceptions e
    where e.id = p_exception and e.firm_id = c.firm;
  if not found then
    raise exception 'bank line exception not found for this firm' using errcode='CLR11';
  end if;
  select l.id, l.client_id, l.bank_account_id into ln
    from clara.bank_statement_lines l where l.id = ex.line_id;

  if p_disposition = 'bank_corrective_line' then
    if p_counterpart_line is null then
      raise exception 'a corrective-line resolution must name its offsetting counterpart line'
        using errcode='CLR10',detail='{"reason":"counterpart_required"}';
    end if;
    if p_counterpart_line = ex.line_id then
      raise exception 'a line cannot be its own corrective counterpart'
        using errcode='CLR10',detail='{"reason":"counterpart_required"}';
    end if;
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'resolve_bank_line_exception', p_op_key,
    clara._hash(jsonb_build_object('exception', p_exception, 'disposition', p_disposition,
      'note', v_note, 'counterpart_line', p_counterpart_line)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- LOCK ORDER: 203005004 -> 203005006 -> the line row(s) FOR UPDATE, IN ID ORDER (both
  -- lines of a corrective pair, so two concurrent calls each naming the other as counterpart
  -- cannot deadlock).
  perform pg_advisory_xact_lock(203005004, hashtext(ln.client_id::text));
  perform pg_advisory_xact_lock(203005006, hashtext(ln.bank_account_id::text));
  if p_counterpart_line is not null then
    perform 1 from clara.bank_statement_lines l
      where l.id in (ex.line_id, p_counterpart_line) order by l.id for update;
  else
    perform 1 from clara.bank_statement_lines l where l.id = ex.line_id for update;
  end if;

  -- Re-read the mutated row itself FOR UPDATE.
  select * into ex from clara.bank_line_exceptions e where e.id = p_exception for update;
  if ex.status = 'resolved' then
    raise exception 'bank line exception % is already resolved', p_exception
      using errcode='CLR10',detail='{"reason":"already_resolved"}';
  end if;

  -- DISPOSITION-LINKED RESOLUTION: `matched_booking` / `written_off_adjustment` must end with
  -- the line in a LIVE match, else `disposition_unbooked`.
  --
  -- ASSEMBLY FIX (found by the x40 rig): the enforcement is the DEFERRED authority belt
  -- (clara._tf_bank_settled_authority_belt, which raises the same
  -- detail={"reason":"disposition_unbooked"} at COMMIT), NOT an eager check here. The eager
  -- version made the design's own reachable path IMPOSSIBLE: design SS4.2 says the disposition
  -- is lawful "when the line is (now) a live member OR IN THE SAME TXN AS THE BOOKING MATCH",
  -- and an OPEN-excepted line is not matchable at all (`line_excepted`, splice register 4). So
  -- the only order that can ever work is resolve-then-match INSIDE ONE TRANSACTION -- and an
  -- eager live-member test at resolve time refuses exactly that, leaving `matched_booking`
  -- unreachable in every ordering. The belt sees the world at commit, where both of the
  -- design's arms look identical, which is why the design put the law there.
  --
  -- What stays eager here is everything the belt structurally cannot do (a belt never computes
  -- money and never sees the caller's arguments): the counterpart-line validation below.
  if p_disposition in ('matched_booking', 'written_off_adjustment') then
    select count(*)::int into v_live from clara.bank_match_line_members m
      where m.line_id = ex.line_id and m.group_status = 'live';
    if v_live = 0 then
      -- Not a refusal -- a NOTICE, so a human resolving in the wrong order still learns why
      -- the transaction will refuse at commit instead of reading a bare constraint error.
      raise notice 'bank line exception % names disposition % and its line is not yet a live matched member; the booking match must land in this same transaction or the settled-authority belt will refuse disposition_unbooked at commit', p_exception, p_disposition;
    end if;
  end if;

  if p_disposition = 'bank_corrective_line' then
    select count(*)::int into v_cp_exists from clara.bank_statement_lines l
      where l.id = p_counterpart_line and l.firm_id = c.firm and l.client_id = ex.client_id;
    if v_cp_exists = 0 then
      raise exception 'counterpart line not found for this client'
        using errcode='CLR10',detail='{"reason":"counterpart_not_excepted"}';
    end if;
    select count(*)::int into v_cp_exc from clara.bank_line_exceptions e
      where e.line_id = p_counterpart_line and e.status in ('open', 'resolved');
    if v_cp_exc = 0 then
      raise exception 'counterpart line % carries no exception (open or resolved)', p_counterpart_line
        using errcode='CLR10',detail='{"reason":"counterpart_not_excepted"}';
    end if;
  end if;

  update clara.bank_line_exceptions
    set status = 'resolved', resolved_by = c.actor, resolved_at = now(),
        resolution_disposition = p_disposition, resolution_note = v_note
    where id = p_exception;

  perform clara._audit(c.firm, c.actor, null, null, 'resolve_bank_line_exception', null,
    jsonb_build_object('exception', p_exception, 'disposition', p_disposition,
      'counterpart_line', p_counterpart_line, 'op_key', p_op_key));
  -- Key name 'resolution_disposition' (not the shorthand 'disposition') matches BOTH the
  -- underlying column name and S1's payload-key inference (s10-notes.md:233).
  perform clara._append_event(c.firm, 'bank.line_exception_resolved', ex.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('exception_id', p_exception, 'line_id', ex.line_id,
      'resolution_disposition', p_disposition, 'counterpart_line_id', p_counterpart_line));
  return clara._finish_op(c.firm, 'resolve_bank_line_exception', p_op_key,
    jsonb_build_object('exception_id', p_exception, 'status', 'resolved',
      'disposition', p_disposition));
end $$;
revoke all on function clara.resolve_bank_line_exception(uuid, text, text, uuid, text) from public;

grant execute on function
  clara.except_bank_line(uuid, text, text, uuid, text),
  clara.resolve_bank_line_exception(uuid, text, text, uuid, text)
to clara_authenticated;

-- =====================================================================================
-- SECTION RULES -- clara.propose_bank_rule (bookkeeper), clara.sign_bank_rule /
-- clara.retire_bank_rule (owner) (design SS4.3, WCC-R5, ladder [L1/Au10/Au12/C14]).
-- =====================================================================================

-- propose_bank_rule: derives its own evidence (never caller-supplied), pre-checks the
-- content-hash uniqueness for a friendly error, and lets the partial unique index
-- (S1's `unique(client_id, kind, content_hash) where status in ('proposed','signed')`) be
-- the belt for the concurrent-race case (caught via unique_violation, the
-- grant_client_egress_purpose idiom, 0038:5647-5658).
create function clara.propose_bank_rule(
    p_client uuid, p_kind text, p_pattern jsonb, p_proposal jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_pat jsonb; v_hash text; v_id uuid;
  v_count int; v_cp uuid; v_domain text; v_account text; v_narr text; v_proposal jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_kind is null or p_kind not in ('match_settle', 'coding') then
    raise exception 'rule kind must be match_settle or coding'
      using errcode='CLR10',detail='{"reason":"rule_kind_malformed"}';
  end if;

  v_pat := clara._bank_rule_pattern_norm(p_pattern);

  -- THE PROPOSAL SHAPE, PER KIND (design SS4.3: match_settle -> {domain, counterparty_id};
  -- coding -> {account_code, narration_template, counterparty_id?}). Counterparty is stored
  -- CANONICAL-AT-WRITE (the 0037 house law, 0037:707-711).
  if p_kind = 'match_settle' then
    if p_proposal is null or jsonb_typeof(p_proposal) <> 'object'
        or coalesce(p_proposal->>'domain', '') not in ('ar', 'ap')
        or coalesce(p_proposal->>'counterparty_id', '') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'a match_settle proposal must carry a domain (ar/ap) and a counterparty_id'
        using errcode='CLR10',detail='{"reason":"rule_proposal_malformed"}';
    end if;
    v_domain := p_proposal->>'domain';
    v_cp := clara._canonical_counterparty(p_client, (p_proposal->>'counterparty_id')::uuid);
    if v_cp is null then
      raise exception 'counterparty is not known to this client' using errcode='CLR11';
    end if;
    if not exists (select 1 from clara.counterparties cp where cp.id = v_cp
        and cp.retired_at is null
        and cp.kind = (case when v_domain = 'ar' then 'customer' else 'vendor' end)) then
      raise exception 'counterparty kind does not match the proposal domain (ar needs a customer, ap needs a vendor)'
        using errcode='CLR10',detail='{"reason":"rule_proposal_malformed"}';
    end if;
    v_proposal := jsonb_build_object('domain', v_domain, 'counterparty_id', v_cp);
  else -- 'coding'
    if p_proposal is null or jsonb_typeof(p_proposal) <> 'object'
        or coalesce(btrim(p_proposal->>'account_code'), '') = ''
        or coalesce(btrim(p_proposal->>'narration_template'), '') = '' then
      raise exception 'a coding proposal must carry an account_code and a narration_template'
        using errcode='CLR10',detail='{"reason":"rule_proposal_malformed"}';
    end if;
    v_account := btrim(p_proposal->>'account_code');
    v_narr := btrim(p_proposal->>'narration_template');
    if not exists (select 1 from clara.coa_accounts a
        where a.client_id = p_client and a.account_code = v_account and a.is_active) then
      raise exception 'account_code is not an active account of this client' using errcode='CLR11';
    end if;
    if p_proposal ? 'counterparty_id' and nullif(p_proposal->>'counterparty_id', '') is not null then
      v_cp := clara._canonical_counterparty(p_client, (p_proposal->>'counterparty_id')::uuid);
      if v_cp is null then
        raise exception 'counterparty is not known to this client' using errcode='CLR11';
      end if;
      v_proposal := jsonb_build_object('account_code', v_account,
        'narration_template', v_narr, 'counterparty_id', v_cp);
    else
      v_proposal := jsonb_build_object('account_code', v_account, 'narration_template', v_narr);
    end if;
  end if;

  -- content_hash is over (kind, CANONICAL pattern) ONLY (design SS4.3) -- proposal is not
  -- part of the identity two patterns of the same kind either collide or they don't.
  v_hash := encode(clara._hash(jsonb_build_object('kind', p_kind, 'pattern', v_pat)), 'hex');

  v_dedupe := clara._reserve_op(c.firm, 'propose_bank_rule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'kind', p_kind,
      'pattern', v_pat, 'proposal', v_proposal)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- CONTENT-HASH PRE-CHECK (the friendly-error half; the partial unique index is the belt).
  if exists (select 1 from clara.bank_rules r
      where r.firm_id = c.firm and r.client_id = p_client and r.kind = p_kind
        and r.content_hash = v_hash and r.status in ('proposed', 'signed')) then
    raise exception 'an identical pattern is already proposed or signed for this client'
      using errcode='CLR10',detail='{"reason":"rule_pattern_already_signed"}';
  end if;

  -- DERIVED EVIDENCE, IN-VERB (never caller-supplied, design SS4.3/[L1/Au10]): the SAME
  -- predicate list_bank_rule_candidates uses, via the one shared internal fn.
  select count(*)::int into v_count
    from clara._bank_rule_sightings(p_client, p_kind, v_pat);
  if v_count < 3 then
    raise exception 'this pattern has fewer than three distinct sightings on this client''s bank lines (found %)', v_count
      using errcode='CLR10',
        detail=jsonb_build_object('reason', 'rule_evidence_insufficient', 'sighting_count', v_count)::text;
  end if;

  begin
    insert into clara.bank_rules(firm_id, client_id, kind, pattern, proposal,
        evidence, content_hash, created_by)
      values (c.firm, p_client, p_kind, v_pat, v_proposal,
        jsonb_build_object('sighting_count', v_count,
          'line_ids', (select coalesce(jsonb_agg(s.line_id), '[]'::jsonb)
                        from clara._bank_rule_sightings(p_client, p_kind, v_pat) s),
          'derived_at', now()),
        v_hash, c.actor)
      returning id into v_id;
  exception when unique_violation then
    raise exception 'an identical pattern is already proposed or signed for this client'
      using errcode='CLR10',detail='{"reason":"rule_pattern_already_signed"}';
  end;

  perform clara._audit(c.firm, c.actor, null, null, 'propose_bank_rule', null,
    jsonb_build_object('rule', v_id, 'client', p_client, 'kind', p_kind,
      'sighting_count', v_count, 'op_key', p_op_key));
  -- 'client_id' repeated inside the payload alongside the event row's own client_id column,
  -- matching S1's payload-key inference (s10-notes.md:234) -- harmless redundancy, not a
  -- leak (client_id is an identifier, not free text).
  perform clara._append_event(c.firm, 'bank.rule_proposed', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('rule_id', v_id, 'client_id', p_client, 'kind', p_kind));
  return clara._finish_op(c.firm, 'propose_bank_rule', p_op_key,
    jsonb_build_object('rule_id', v_id, 'status', 'proposed', 'sighting_count', v_count));
end $$;
revoke all on function clara.propose_bank_rule(uuid, text, jsonb, jsonb, text) from public;

-- sign_bank_rule: owner-only. proposed -> signed. Refuses rule_not_proposed.
create function clara.sign_bank_rule(p_rule uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; r record;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into r from clara.bank_rules br where br.id = p_rule and br.firm_id = c.firm;
  if not found then
    raise exception 'bank rule not found for this firm' using errcode='CLR11';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'sign_bank_rule', p_op_key,
    clara._hash(jsonb_build_object('rule', p_rule)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into r from clara.bank_rules br where br.id = p_rule for update;
  if r.status <> 'proposed' then
    raise exception 'bank rule % is not proposed (currently %)', p_rule, r.status
      using errcode='CLR10',detail='{"reason":"rule_not_proposed"}';
  end if;

  update clara.bank_rules set status = 'signed', signed_by = c.actor, signed_at = now()
    where id = p_rule;

  perform clara._audit(c.firm, c.actor, null, null, 'sign_bank_rule', null,
    jsonb_build_object('rule', p_rule, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.rule_signed', r.client_id, c.actor,
    null, null, null, null, null, jsonb_build_object('rule_id', p_rule));
  return clara._finish_op(c.firm, 'sign_bank_rule', p_op_key,
    jsonb_build_object('rule_id', p_rule, 'status', 'signed'));
end $$;
revoke all on function clara.sign_bank_rule(uuid, text) from public;

-- retire_bank_rule: owner-only. signed -> retired, AND (assembly order item 10) the WITHDRAWAL
-- arm proposed -> retired. S3's first draft read the design's `rule_not_signed` refusal as
-- forbidding the second arm; the assembly adjudication opened it, because closing it made a
-- never-signed proposal immortal AND permanently squatted on its (client, kind, content_hash)
-- slot in uq_bank_rules_content, so the same pattern could never be re-proposed after a typo.
-- `rule_not_signed` remains the named refusal token; it now fires on an ALREADY-RETIRED rule
-- (the only non-retirable state left). A withdrawn rule leaves signed_by/signed_at NULL -- the
-- transition trigger and ck_bank_rules_lifecycle both enforce that a withdrawal cannot forge
-- an approval -- and the receipt names which exit was taken via the `withdrawn` flag.
create function clara.retire_bank_rule(p_rule uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_reason text; r record;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a retirement reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  select * into r from clara.bank_rules br where br.id = p_rule and br.firm_id = c.firm;
  if not found then
    raise exception 'bank rule not found for this firm' using errcode='CLR11';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'retire_bank_rule', p_op_key,
    clara._hash(jsonb_build_object('rule', p_rule, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into r from clara.bank_rules br where br.id = p_rule for update;
  if r.status not in ('signed', 'proposed') then
    raise exception 'bank rule % is not in a retirable state (currently %)', p_rule, r.status
      using errcode='CLR10',detail='{"reason":"rule_not_signed"}';
  end if;

  update clara.bank_rules set status = 'retired', retired_by = c.actor, retired_at = now(),
      retired_reason = v_reason
    where id = p_rule;

  perform clara._audit(c.firm, c.actor, null, null, 'retire_bank_rule', null,
    jsonb_build_object('rule', p_rule, 'op_key', p_op_key));
  -- ID-ONLY (design SS4.8): the retirement reason is NOT carried in the payload -- see the
  -- payload-key blocklist this file's header cites (0038:9080-9083 names p_reason-shaped
  -- variables explicitly).
  perform clara._append_event(c.firm, 'bank.rule_retired', r.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('rule_id', p_rule, 'withdrawn', (r.status = 'proposed')));
  return clara._finish_op(c.firm, 'retire_bank_rule', p_op_key,
    jsonb_build_object('rule_id', p_rule, 'status', 'retired',
      'withdrawn', (r.status = 'proposed')));
end $$;
revoke all on function clara.retire_bank_rule(uuid, text, text) from public;

grant execute on function
  clara.propose_bank_rule(uuid, text, jsonb, jsonb, text),
  clara.sign_bank_rule(uuid, text),
  clara.retire_bank_rule(uuid, text, text)
to clara_authenticated;

-- =====================================================================================
-- SECTION TERMS -- clara.set_counterparty_terms (design SS4.4). Bookkeeper floor.
-- =====================================================================================

-- DEPENDENCY, STATED HONESTLY: the UPDATE below is lawful only once the splice register's
-- entry 8 (design SS5: clara._tf_counterparty_update_0011's non-merge whitelist,
-- 0011:940-958) widens to admit payment_terms_days. Verified THIS SESSION that the LIVE
-- non-merge whitelist is EXACTLY array['name','name_normalized','updated_at'] -- an
-- unwidened trigger refuses this UPDATE outright with CLR08. This lane does not perform that
-- splice (it belongs to whichever lane owns the SS5 splice register); s30-notes.md flags it
-- as a hard prerequisite for this verb to work at all.
--
-- ASSEMBLY FIX (found by the x40 rig, not by review): the record variable was named `cp` AND
-- the table was aliased `cp`, so `select cp.* into cp from clara.counterparties cp` raised
-- `column reference "cp.*" is ambiguous` at RUN time -- plpgsql resolves nothing at CREATE
-- time, so this compiled clean and would have failed on the first real call. The record is
-- now `v_cp`; the alias keeps its name.
create function clara.set_counterparty_terms(p_counterparty uuid, p_days int, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_cp record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_days is null or p_days <= 0 or p_days > 365 then
    raise exception 'payment terms must be between 1 and 365 days'
      using errcode='CLR10',detail='{"reason":"terms_out_of_range"}';
  end if;
  select cp.* into v_cp from clara.counterparties cp
    where cp.id = p_counterparty and cp.firm_id = c.firm;
  if not found then
    raise exception 'counterparty not found for this firm' using errcode='CLR11';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'set_counterparty_terms', p_op_key,
    clara._hash(jsonb_build_object('counterparty', p_counterparty, 'days', p_days)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- LOCK: 203005004 (client) -> the counterparty row FOR UPDATE (design SS4.4).
  perform pg_advisory_xact_lock(203005004, hashtext(v_cp.client_id::text));
  select cp.* into v_cp from clara.counterparties cp where cp.id = p_counterparty for update;
  if v_cp.merged_into is not null or v_cp.retired_at is not null then
    raise exception 'a merged or retired counterparty cannot take payment terms' using errcode='CLR08';
  end if;

  update clara.counterparties set payment_terms_days = p_days, updated_at = now()
    where id = p_counterparty;

  perform clara._audit(c.firm, c.actor, null, null, 'set_counterparty_terms', null,
    jsonb_build_object('counterparty', p_counterparty, 'days', p_days, 'op_key', p_op_key));
  -- NO event: design SS4.5 names exactly seven bank.* event types (the two
  -- reconciliation-lifecycle events + the five this file emits elsewhere); terms-setting is
  -- not one of them. audit_log alone carries this act. (Deliberate omission, not an
  -- oversight -- logged in s30-notes.md.)
  return clara._finish_op(c.firm, 'set_counterparty_terms', p_op_key,
    jsonb_build_object('counterparty_id', p_counterparty, 'payment_terms_days', p_days));
end $$;
revoke all on function clara.set_counterparty_terms(uuid, int, text) from public;

grant execute on function clara.set_counterparty_terms(uuid, int, text) to clara_authenticated;

-- =====================================================================================
-- SECTION EVENTS -- DELIBERATELY EMPTY. CORRECTED THIS SESSION: this section originally
-- registered the five bank.* event types this lane's verbs emit
-- (bank.line_excepted/line_exception_resolved/rule_proposed/rule_signed/rule_retired), on
-- the assumption that event-type registration was split by verb-owning lane. Cross-checking
-- against S1's actual landed file (s10-tables.sql:205-214, 851-859) showed S1 registers ALL
-- SEVEN bank.* event types itself in one place (its own probe 13 explicitly names all
-- seven), which would have made this section a raw duplicate INSERT -- a hard failure at
-- assembly (clara.event_types.name is a primary key). REMOVED. This lane's verbs below still
-- call clara._append_event('bank.line_excepted', ...) etc; those calls are satisfied by S1's
-- registration, not this file's -- SECTION 0 probe 6 (added) confirms the five names this
-- lane depends on exist before any function here is created, and this file's own tail (check
-- 6) re-confirms them at the end.
-- =====================================================================================

-- =====================================================================================
-- SECTION READS -- the six named RPC labels / eight functions (design SS6). Every one:
-- SECURITY DEFINER, clara._human_ctx(clara.role_rank('bookkeeper')), the list_review_queue
-- zero-rows idiom for cross-firm/cross-client probes (0038:7869-7871 -- never a
-- discriminating error), clara_authenticated-only grant via the bulk RACL loop at the end of
-- this section (mirroring 0038:8056-8064).
-- =====================================================================================

-- clara._aging_core -- shared by ar_aging/ap_aging. WCC-R3: buckets measure days since
-- item_date; due_date is an OVERDUE MARKER, never the bucket driver. Buckets are disjoint by
-- construction over integer days (current 0-30, 31-60, 61-90, 91+ -- ladder finding #9).
-- p_segment is NOT a parameter here -- it is the public wrapper's job to accept-and-ignore it
-- (WC-R3 / the SS10 rebuttal: no close/segment model exists yet).
create function clara._aging_core(p_firm uuid, p_client uuid, p_domain text, p_as_of date)
  returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  with rows as (
    select oi.id as item_id, oi.counterparty_id, oi.item_kind, oi.item_date, oi.due_date,
           clara._subledger_outstanding_asof(oi.id, p_as_of) as outstanding_cents,
           (p_as_of - oi.item_date) as days
    from clara.open_items oi
    where oi.firm_id = p_firm and oi.client_id = p_client and oi.domain = p_domain
      and oi.item_date <= p_as_of
  ), filtered as (
    select r.*,
      case when r.days <= 30 then 'current'
           when r.days <= 60 then 'd31_60'
           when r.days <= 90 then 'd61_90'
           else 'd91_plus' end as bucket,
      (r.due_date is not null and r.due_date < p_as_of) as overdue
    from rows r
    where r.outstanding_cents <> 0
  ), per_cp as (
    select f.counterparty_id,
      sum(case when f.bucket = 'current' then f.outstanding_cents else 0 end) as current_cents,
      sum(case when f.bucket = 'd31_60' then f.outstanding_cents else 0 end) as d31_60_cents,
      sum(case when f.bucket = 'd61_90' then f.outstanding_cents else 0 end) as d61_90_cents,
      sum(case when f.bucket = 'd91_plus' then f.outstanding_cents else 0 end) as d91_plus_cents,
      sum(f.outstanding_cents) as total_cents,
      jsonb_agg(jsonb_build_object(
          'item_id', f.item_id, 'item_kind', f.item_kind, 'item_date', f.item_date,
          'due_date', f.due_date, 'overdue', f.overdue,
          'outstanding_cents', f.outstanding_cents, 'bucket', f.bucket)
        order by f.item_date, f.item_id) as items
    from filtered f
    group by f.counterparty_id
  )
  select jsonb_build_object(
    'as_of', p_as_of, 'domain', p_domain,
    'counterparties', coalesce((select jsonb_agg(jsonb_build_object(
          'counterparty_id', pc.counterparty_id, 'counterparty_name', cp.name,
          'current_cents', pc.current_cents, 'd31_60_cents', pc.d31_60_cents,
          'd61_90_cents', pc.d61_90_cents, 'd91_plus_cents', pc.d91_plus_cents,
          'total_cents', pc.total_cents, 'items', pc.items)
          order by cp.name)
        from per_cp pc join clara.counterparties cp on cp.id = pc.counterparty_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'current_cents', coalesce((select sum(current_cents) from per_cp), 0),
      'd31_60_cents', coalesce((select sum(d31_60_cents) from per_cp), 0),
      'd61_90_cents', coalesce((select sum(d61_90_cents) from per_cp), 0),
      'd91_plus_cents', coalesce((select sum(d91_plus_cents) from per_cp), 0),
      'total_cents', coalesce((select sum(total_cents) from per_cp), 0)));
$$;
revoke all on function clara._aging_core(uuid, uuid, text, date) from public;

create function clara.ar_aging(p_client uuid, p_as_of date, p_segment uuid default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  -- p_segment is RESERVED-IGNORED (design SS6/SS10 rebuttal: WC-R3 forbids a half-close
  -- segment model; this parameter exists so a future close wave's segment dimension is a
  -- FUNCTION CHANGE, not a migration, when it lands). Never referenced below.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._aging_core(c.firm, p_client, 'ar', p_as_of);
end $$;
revoke all on function clara.ar_aging(uuid, date, uuid) from public;

create function clara.ap_aging(p_client uuid, p_as_of date, p_segment uuid default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._aging_core(c.firm, p_client, 'ap', p_as_of);
end $$;
revoke all on function clara.ap_aging(uuid, date, uuid) from public;

-- clara._statement_core -- shared by customer_statement/supplier_statement. Running-balance
-- ledger over items (keyed on item_date) UNION allocations (keyed on effective_date -- the
-- S1-added as-of grain) -- the _statement_core PORT shape on the 0037 grain (design SS6).
create function clara._statement_core(p_firm uuid, p_client uuid, p_domain text,
    p_counterparty uuid, p_from date, p_to date) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  with cp as (
    select clara._canonical_counterparty(p_client, p_counterparty) as id
  ), opening_items as (
    select coalesce(sum(oi.amount_cents), 0) as v
    from clara.open_items oi, cp
    where oi.firm_id = p_firm and oi.client_id = p_client and oi.domain = p_domain
      and oi.counterparty_id = cp.id and oi.item_date < p_from
  ), opening_allocs as (
    select coalesce(sum(oa.amount_cents), 0) as v
    from clara.open_item_allocations oa
    join clara.open_items oi on oi.id = oa.item_id
    , cp
    where oa.firm_id = p_firm and oa.client_id = p_client and oa.domain = p_domain
      and oi.counterparty_id = cp.id and oa.effective_date < p_from
  ), txns as (
    select oi.item_date as event_date, oi.created_at as event_created_at, oi.id as row_id,
           'item' as row_type, oi.item_kind as label, oi.amount_cents as delta,
           oi.id as item_id, null::uuid as allocation_id
    from clara.open_items oi, cp
    where oi.firm_id = p_firm and oi.client_id = p_client and oi.domain = p_domain
      and oi.counterparty_id = cp.id and oi.item_date between p_from and p_to
    union all
    select oa.effective_date as event_date, oa.created_at as event_created_at, oa.id as row_id,
           'allocation' as row_type, oa.operation_kind as label, oa.amount_cents as delta,
           oa.item_id, oa.id as allocation_id
    from clara.open_item_allocations oa
    join clara.open_items oi on oi.id = oa.item_id
    , cp
    where oa.firm_id = p_firm and oa.client_id = p_client and oa.domain = p_domain
      and oi.counterparty_id = cp.id and oa.effective_date between p_from and p_to
  ), ordered as (
    select t.*,
      (select v from opening_items) + (select v from opening_allocs)
        + sum(t.delta) over (order by t.event_date, t.event_created_at, t.row_id
              rows between unbounded preceding and current row) as running_balance_cents
    from txns t
  )
  select jsonb_build_object(
    'counterparty_id', (select id from cp), 'domain', p_domain, 'from', p_from, 'to', p_to,
    'opening_balance_cents', (select v from opening_items) + (select v from opening_allocs),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'event_date', o.event_date, 'row_type', o.row_type, 'label', o.label,
          'delta_cents', o.delta, 'running_balance_cents', o.running_balance_cents,
          'item_id', o.item_id, 'allocation_id', o.allocation_id)
          order by o.event_date, o.event_created_at, o.row_id)
        from ordered o), '[]'::jsonb),
    'closing_balance_cents', coalesce(
      (select o.running_balance_cents from ordered o
        order by o.event_date desc, o.event_created_at desc, o.row_id desc limit 1),
      (select v from opening_items) + (select v from opening_allocs)));
$$;
revoke all on function clara._statement_core(uuid, uuid, text, uuid, date, date) from public;

create function clara.customer_statement(p_client uuid, p_counterparty uuid, p_from date, p_to date)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._statement_core(c.firm, p_client, 'ar', p_counterparty, p_from, p_to);
end $$;
revoke all on function clara.customer_statement(uuid, uuid, date, date) from public;

create function clara.supplier_statement(p_client uuid, p_counterparty uuid, p_from date, p_to date)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._statement_core(c.firm, p_client, 'ap', p_counterparty, p_from, p_to);
end $$;
revoke all on function clara.supplier_statement(uuid, uuid, date, date) from public;

-- list_unmatched_lines: the cross-statement unmatched report (design SS6, "[V: does not
-- exist today]"). Every UNMATCHED, UNEXCEPTED line (literally both, per this lane's work
-- order -- a line that ever carried ANY exception, open or resolved, never reappears here;
-- see s30-notes.md for the rare unmatch-after-matched_booking-resolution edge case this
-- leaves open).
create function clara.list_unmatched_lines(p_client uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return coalesce((select jsonb_agg(jsonb_build_object(
      'line_id', l.id, 'statement_id', l.statement_id, 'bank_account_id', l.bank_account_id,
      'bank_account_display', ba.bank_name_display || ' ' || ba.account_number,
      'line_no', l.line_no, 'entry_date', l.entry_date, 'value_date', l.value_date,
      'description', l.description, 'amount_cents', l.amount_cents,
      'class_hint', clara._bank_line_class_hint(l.description))
      order by l.entry_date, l.id)
    from clara.bank_statement_lines l
    join clara.bank_statements s on s.id = l.statement_id
    join clara.bank_accounts ba on ba.id = l.bank_account_id
    where l.firm_id = c.firm and l.client_id = p_client and s.status = 'live'
      and not exists (select 1 from clara.bank_match_line_members m
        where m.line_id = l.id and m.group_status in ('pending', 'live'))
      and not exists (select 1 from clara.bank_line_exceptions e where e.line_id = l.id)
    ), '[]'::jsonb);
end $$;
revoke all on function clara.list_unmatched_lines(uuid) from public;

-- get_bank_reconciliation: the receipt + snapshot when one exists (status='complete'), else
-- the DERIVED LIVE PREVIEW via S2's clara._bank_recon_terms, labelled "preview":true (design
-- SS6). now() is the only honest cutoff for a preview -- there is no completed_at yet.
create function clara.get_bank_reconciliation(p_statement uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_stmt record; v_receipt record; v_terms jsonb;
  v_precondition boolean; v_chain_ok boolean; v_prior uuid; v_stale jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select * into v_stmt from clara.bank_statements s where s.id = p_statement and s.firm_id = c.firm;
  if not found then return null; end if;

  select * into v_receipt from clara.bank_reconciliations r
    where r.statement_id = p_statement and r.firm_id = c.firm and r.status = 'complete';
  if found then
    return jsonb_build_object(
      'preview', false, 'reconciliation_id', v_receipt.id, 'statement_id', p_statement,
      'bank_account_id', v_receipt.bank_account_id, 'coa_account_code', v_receipt.coa_account_code,
      'prior_statement_id', v_receipt.prior_statement_id,
      'prior_reconciliation_id', v_receipt.prior_reconciliation_id,
      'period_start', v_receipt.period_start, 'period_end', v_receipt.period_end,
      'status', v_receipt.status,
      'opening_cents', v_receipt.opening_cents, 'gl_balance_cents', v_receipt.gl_balance_cents,
      'closing_cents', v_receipt.closing_cents, 'outstanding_cents', v_receipt.outstanding_cents,
      'excepted_cents', v_receipt.excepted_cents,
      'completed_by', v_receipt.completed_by, 'completed_at', v_receipt.completed_at,
      -- A COMPLETED receipt is bitemporal truth: its preconditions were true at
      -- completion, by construction (the verb refused otherwise). Reported as facts so a
      -- caller never has to branch on the preview flag to read the same gate.
      'first_period', (v_receipt.prior_statement_id is null),
      'precondition_met', true, 'chain_ok', true,
      'stale_outstanding_ids', '[]'::jsonb,
      'snapshot', v_receipt.snapshot);
  end if;

  -- DERIVED LIVE PREVIEW. v_terms' shape is S2's clara._bank_recon_terms, CONFIRMED this
  -- session against its live body (s20-identity.sql:486-536): it does NOT share the receipt
  -- table's column names 1:1 (e.g. 'gl_prime_cents' not 'gl_balance_cents', no top-level
  -- computed 'closing_cents' -- only 'difference_cents' = statement.closing minus the
  -- identity's computed value). Re-shaped into the SAME envelope the complete-receipt branch
  -- above returns, so a caller never has to branch on field names by 'preview' -- plus the
  -- preview-only 'difference_cents' (meaningless on a completed receipt, since completion
  -- requires it to be exactly zero; genuinely useful here to show "not yet zero").
  v_terms := clara._bank_recon_terms(p_statement, now());
  if v_terms is null then return null; end if;

  -- THE TWO COMPLETION GATES, ANSWERED BY THE DB (assembly fix). Without these the /bank
  -- pane cannot honestly enable its Complete button: the design's own precondition and
  -- chain law are DB facts, and a UI that guessed at them would either fail closed forever
  -- or invent an authority it does not have. Both are cheap existence reads over the same
  -- world _bank_recon_terms just measured; the VERB re-establishes both under lock and its
  -- refusal remains the only authority.
  --
  -- precondition (design SS3): every line of THIS statement is a member of a live group or
  -- carries an exception row (open or resolved -- the ratified bank_corrective_line
  -- disposition leaves both legs resolved and unmatched, riding excepted(P)).
  select not exists (
    select 1 from clara.bank_statement_lines l
     where l.statement_id = p_statement
       and not exists (select 1 from clara.bank_match_line_members lm
                        where lm.line_id = l.id and lm.group_status in ('pending','live'))
       and not exists (select 1 from clara.bank_line_exceptions e where e.line_id = l.id))
    into v_precondition;

  -- chain (design SS3): the first live statement on the account claims the exemption;
  -- otherwise the ADJACENT predecessor must carry a complete reconciliation.
  if coalesce((v_terms->>'first_period')::boolean, false) then
    v_chain_ok := true;
  else
    select bs.id into v_prior from clara.bank_statements bs
     where bs.bank_account_id = (v_terms->>'bank_account_id')::uuid
       and bs.status = 'live' and bs.period_end = v_stmt.period_start - 1;
    v_chain_ok := v_prior is not null and exists (
      select 1 from clara.bank_reconciliations br
       where br.statement_id = v_prior and br.status = 'complete');
  end if;

  -- The stale challenge list, by the SAME ids p_ack_outstanding accepts (entry / line /
  -- match) and the SAME 60-day floor the verb applies. Ids only -- no money.
  select coalesce(jsonb_agg(x.id), '[]'::jsonb) into v_stale from (
    select e.elem->>'entry_id' as id
      from jsonb_array_elements(v_terms->'snapshot'->'outstanding_entry_sides') as e(elem)
     where (e.elem->>'age_days')::int > 60
    union all
    select e.elem->>'line_id'
      from jsonb_array_elements(v_terms->'snapshot'->'outstanding_line_sides') as e(elem)
     where (e.elem->>'age_days')::int > 60
    union all
    select e.elem->>'match_id'
      from jsonb_array_elements(v_terms->'snapshot'->'outstanding_group_items') as e(elem)
     where (e.elem->>'age_days')::int > 60) x;

  return jsonb_build_object(
    'preview', true, 'statement_id', p_statement,
    'first_period', v_terms->'first_period',
    'precondition_met', v_precondition, 'chain_ok', v_chain_ok,
    'stale_outstanding_ids', v_stale,
    'bank_account_id', v_terms->'bank_account_id',
    'coa_account_code', v_terms->'coa_account_code',
    'period_start', v_terms->'period_start', 'period_end', v_terms->'period_end',
    'opening_cents', v_terms->'opening_anchor_cents',
    'gl_balance_cents', v_terms->'gl_prime_cents',
    'outstanding_cents', v_terms->'outstanding_cents',
    'excepted_cents', v_terms->'excepted_cents',
    'closing_cents', to_jsonb(
        coalesce((v_terms->>'statement_closing_cents')::bigint, 0)
        - coalesce((v_terms->>'difference_cents')::bigint, 0)),
    'difference_cents', v_terms->'difference_cents',
    'snapshot', v_terms->'snapshot');
end $$;
revoke all on function clara.get_bank_reconciliation(uuid) from public;

-- list_bank_line_suggestions: signed-rule evaluations over a statement's unmatched,
-- unexcepted lines. <=1 suggestion per (line, kind) -- "most specific wins" (longer token
-- list), tie-broken by earliest signed_at, then id (design SS4.3/SS6).
create function clara.list_bank_line_suggestions(p_statement uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_client uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select bs.client_id into v_client from clara.bank_statements bs
    where bs.id = p_statement and bs.firm_id = c.firm;
  if not found then return '[]'::jsonb; end if;

  return coalesce((
    with unmatched as (
      select l.id as line_id, l.description, l.amount_cents
      from clara.bank_statement_lines l
      where l.statement_id = p_statement and l.firm_id = c.firm
        and not exists (select 1 from clara.bank_match_line_members m
          where m.line_id = l.id and m.group_status in ('pending', 'live'))
        and not exists (select 1 from clara.bank_line_exceptions e where e.line_id = l.id)
    ), hits as (
      select u.line_id, r.id as rule_id, r.kind, r.proposal,
        row_number() over (partition by u.line_id, r.kind
          order by jsonb_array_length(r.pattern->'tokens') desc, r.signed_at asc, r.id asc) as rn
      from unmatched u
      join clara.bank_rules r
        on r.firm_id = c.firm and r.client_id = v_client and r.status = 'signed'
      where clara._bank_desc_word_match(u.description,
              (select array_agg(x) from jsonb_array_elements_text(r.pattern->'tokens') x))
        and (r.pattern->>'direction' = 'either'
             or (r.pattern->>'direction' = 'credit' and u.amount_cents > 0)
             or (r.pattern->>'direction' = 'debit' and u.amount_cents < 0))
        and (r.pattern->'amount_shape' is null
             or (abs(u.amount_cents) >= coalesce((r.pattern->'amount_shape'->>'min_cents')::bigint, 0)
                 and abs(u.amount_cents) <= coalesce((r.pattern->'amount_shape'->>'max_cents')::bigint,
                       9223372036854775807)))
    )
    select jsonb_agg(jsonb_build_object(
        'line_id', h.line_id, 'kind', h.kind, 'rule_id', h.rule_id, 'proposal', h.proposal)
        order by h.line_id, h.kind)
    from hits h where h.rn = 1
  ), '[]'::jsonb);
end $$;
revoke all on function clara.list_bank_line_suggestions(uuid) from public;

-- list_bank_rule_candidates: the >=3-sighting breeding census (design SS6). Single-token
-- candidate generation over UNMATCHED, UNEXCEPTED lines (seed), re-verified through the SAME
-- _bank_rule_sightings predicate propose_bank_rule uses (never trusting the seed count
-- itself as the reported evidence). DOCUMENTED SIMPLIFICATION (s30-notes.md): candidates are
-- single-token; a bookkeeper may WIDEN a candidate into a tighter multi-token pattern before
-- proposing, and propose_bank_rule independently re-derives evidence for whatever pattern is
-- actually submitted.
create function clara.list_bank_rule_candidates(p_client uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return coalesce((
    with seed as (
      select l.id as line_id, l.description, (l.amount_cents > 0) as is_credit
      from clara.bank_statement_lines l
      join clara.bank_statements s on s.id = l.statement_id
      where l.firm_id = c.firm and l.client_id = p_client and s.status = 'live'
        and not exists (select 1 from clara.bank_match_line_members m
          where m.line_id = l.id and m.group_status in ('pending', 'live'))
        and not exists (select 1 from clara.bank_line_exceptions e where e.line_id = l.id)
    ), seed_tokens as (
      select s.line_id, s.is_credit, lower(tk) as token
      from seed s, regexp_split_to_table(coalesce(s.description, ''), '[^[:alnum:]]+') as tk
      where nullif(btrim(tk), '') is not null and length(tk) >= 3 and tk !~ '^[0-9]+$'
    ), grouped as (
      select st.token, st.is_credit, count(distinct st.line_id) as seed_n
      from seed_tokens st
      group by st.token, st.is_credit
      having count(distinct st.line_id) >= 3
    ), candidates as (
      select g.token, g.is_credit, g.seed_n,
        jsonb_build_object('tokens', jsonb_build_array(g.token),
          'direction', case when g.is_credit then 'credit' else 'debit' end) as pattern
      from grouped g
    -- p_kind is 'match_settle' by convention below (see _bank_rule_sightings' header note:
    -- the predicate does not vary by kind in this build, so any fixed kind gives the same
    -- count).
    ), scored as (
      select cd.token, cd.pattern, sc.n, sc.sample_ids
      from candidates cd
      join lateral (
        select count(*)::int as n,
               (array_agg(s.line_id order by s.line_id))[1:5] as sample_ids
        from clara._bank_rule_sightings(p_client, 'match_settle', cd.pattern) s
      ) sc on true
      order by sc.n desc, cd.token
      limit 50
    )
    select jsonb_agg(jsonb_build_object(
        'pattern', sc.pattern, 'sighting_count', sc.n, 'sample_line_ids', sc.sample_ids)
        order by sc.n desc, sc.token)
    from scored sc
  ), '[]'::jsonb);
end $$;
revoke all on function clara.list_bank_rule_candidates(uuid) from public;

-- list_bank_rules: the client's rule REGISTER (assembly order item 6 -- an ADDITIVE tenth read
-- RPC, not in the design's SS6 table). Reason it exists: SS6 gives the /bank surface only the
-- BREEDING census (list_bank_rule_candidates), so a rule proposed in an earlier session, from
-- chat, or by another user is invisible -- the U1 dashboard lane had to track proposals in
-- session-local state and said so. An owner cannot sign what she cannot see. Same idiom as
-- every read above: bookkeeper floor, firm-scoped, identifiers + lifecycle state only. The
-- rule's PATTERN and PROPOSAL are returned (they are the thing being judged, and the human
-- lane already holds a firm-scoped direct SELECT on clara.bank_rules under FORCE RLS), but the
-- evidence blob is reduced to its sighting COUNT -- a signing decision needs the strength of
-- the evidence, not the line ids.
create function clara.list_bank_rules(p_client uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return coalesce((select jsonb_agg(jsonb_build_object(
      'rule_id', r.id, 'client_id', r.client_id, 'kind', r.kind, 'status', r.status,
      'pattern', r.pattern, 'proposal', r.proposal,
      'sighting_count', coalesce((r.evidence->>'sighting_count')::int, 0),
      'created_by', r.created_by, 'created_at', r.created_at,
      'signed_by', r.signed_by, 'signed_at', r.signed_at,
      'retired_by', r.retired_by, 'retired_at', r.retired_at,
      -- The WITHDRAWAL arm (order item 10) is visible as a derived flag rather than a fourth
      -- status: a withdrawn rule is retired without ever having been signed.
      'withdrawn', (r.status = 'retired' and r.signed_at is null))
      order by r.created_at desc, r.id)
    from clara.bank_rules r
    where r.firm_id = c.firm and r.client_id = p_client
    ), '[]'::jsonb);
end $$;
revoke all on function clara.list_bank_rules(uuid) from public;

-- =====================================================================================
-- SECTION READS -- bulk grant loop (the 0038:8056-8064 idiom): revoke from public, grant to
-- clara_authenticated only, and belt-and-braces re-assert clara_fn_owner ownership.
-- =====================================================================================
do $racl$ declare f text; begin
  foreach f in array array[
      'clara.ar_aging(uuid,date,uuid)','clara.ap_aging(uuid,date,uuid)',
      'clara.customer_statement(uuid,uuid,date,date)','clara.supplier_statement(uuid,uuid,date,date)',
      'clara.list_unmatched_lines(uuid)','clara.get_bank_reconciliation(uuid)',
      'clara.list_bank_line_suggestions(uuid)','clara.list_bank_rule_candidates(uuid)',
      'clara.list_bank_rules(uuid)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $racl$;

reset role;

-- =====================================================================================
-- TAIL -- this lane's OWN self-verifying assertions, scoped to the 15 functions this file
-- creates (6 write verbs + 9 read RPCs, list_bank_rules added at assembly per order item 6). This is NOT a substitute for the assembled 0040's
-- own unified tail (payload-key allowlist across ALL seven bank.* event types, the full
-- lock-order prosrc pin set across every new verb in the migration, etc, per design SS9) --
-- it verifies what THIS file alone can prove, and s30-notes.md hands the assembler the exact
-- extra lines the unified tail owes on top of this.
-- =====================================================================================
do $tail$
declare
  v_src text; f text;
  v_a int; v_b int;
  v_write_fns text[] := array[
    'clara.except_bank_line(uuid,text,text,uuid,text)',
    'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)',
    'clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)',
    'clara.sign_bank_rule(uuid,text)',
    'clara.retire_bank_rule(uuid,text,text)',
    'clara.set_counterparty_terms(uuid,int,text)'];
  v_read_fns text[] := array[
    'clara.ar_aging(uuid,date,uuid)','clara.ap_aging(uuid,date,uuid)',
    'clara.customer_statement(uuid,uuid,date,date)','clara.supplier_statement(uuid,uuid,date,date)',
    'clara.list_unmatched_lines(uuid)','clara.get_bank_reconciliation(uuid)',
    'clara.list_bank_line_suggestions(uuid)','clara.list_bank_rule_candidates(uuid)',
    'clara.list_bank_rules(uuid)'];
  v_owner_fns text[] := array['clara.except_bank_line(uuid,text,text,uuid,text)',
    'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)',
    'clara.sign_bank_rule(uuid,text)','clara.retire_bank_rule(uuid,text,text)'];
  v_bookkeeper_fns text[] := array['clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)',
    'clara.set_counterparty_terms(uuid,int,text)'];
  v_refusals jsonb := jsonb_build_object(
    'clara.except_bank_line(uuid,text,text,uuid,text)',
      jsonb_build_array('line_already_matched','line_already_excepted','statement_not_live'),
    'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)',
      jsonb_build_array('already_resolved','resolution_note_required','disposition_unbooked',
        'counterpart_required','counterpart_not_excepted'),
    'clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)',
      jsonb_build_array('rule_evidence_insufficient','rule_pattern_already_signed'),
    'clara.sign_bank_rule(uuid,text)', jsonb_build_array('rule_not_proposed'),
    'clara.retire_bank_rule(uuid,text,text)', jsonb_build_array('rule_not_signed'),
    'clara.set_counterparty_terms(uuid,int,text)', jsonb_build_array('terms_out_of_range'));
  v_key text; v_tok text; v_toks jsonb;
begin
  -- (1) ROLE FLOORS. Every owner-floor verb's body must contain
  -- "role_rank('owner')"; every bookkeeper-floor verb (including all 8 reads) must contain
  -- "role_rank('bookkeeper')".
  foreach f in array v_owner_fns loop
    select pg_get_functiondef(f::regprocedure) into v_src;
    if position('role_rank(''owner'')' in v_src) = 0 then
      raise exception '0040/S3 tail: % does not take the owner floor', f;
    end if;
  end loop;
  foreach f in array (v_bookkeeper_fns || v_read_fns) loop
    select pg_get_functiondef(f::regprocedure) into v_src;
    if position('role_rank(''bookkeeper'')' in v_src) = 0 then
      raise exception '0040/S3 tail: % does not take the bookkeeper floor', f;
    end if;
  end loop;

  -- (2) OP-KEY REQUIRED on every write verb.
  foreach f in array v_write_fns loop
    select pg_get_functiondef(f::regprocedure) into v_src;
    if position('op_key is required' in v_src) = 0 then
      raise exception '0040/S3 tail: % does not enforce op_key is required', f;
    end if;
  end loop;

  -- (3) LOCK ORDER TOKENS for except_bank_line / resolve_bank_line_exception:
  -- 203005004 strictly before 203005006, both present.
  foreach f in array array['clara.except_bank_line(uuid,text,text,uuid,text)',
      'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)'] loop
    select pg_get_functiondef(f::regprocedure) into v_src;
    v_a := position('pg_advisory_xact_lock(203005004' in v_src);
    v_b := position('pg_advisory_xact_lock(203005006' in v_src);
    if v_a = 0 or v_b = 0 or v_a > v_b then
      raise exception '0040/S3 tail: % does not take 203005004 strictly before 203005006 (004=%, 006=%)', f, v_a, v_b;
    end if;
  end loop;
  select pg_get_functiondef('clara.set_counterparty_terms(uuid,int,text)'::regprocedure) into v_src;
  if position('pg_advisory_xact_lock(203005004' in v_src) = 0 then
    raise exception '0040/S3 tail: set_counterparty_terms does not take the 203005004 client rung';
  end if;

  -- (4) NAMED REFUSAL TOKENS -- every literal this file promised is present verbatim in the
  -- promising function's body.
  for v_key, v_toks in select key, value from jsonb_each(v_refusals) loop
    select pg_get_functiondef(v_key::regprocedure) into v_src;
    for v_tok in select jsonb_array_elements_text(v_toks) loop
      if position(v_tok in v_src) = 0 then
        raise exception '0040/S3 tail: % does not carry the named refusal token %', v_key, v_tok;
      end if;
    end loop;
  end loop;

  -- (5) THE GRANT MATRIX moved to its own block below -- see the WIKI-LINT SEAM note there.

  -- (6) THE FIVE bank.* EVENT TYPES THIS FILE REGISTERS actually exist, client_scoped.
  if (select count(*)::int from clara.event_types
      where name in ('bank.line_excepted','bank.line_exception_resolved',
                      'bank.rule_proposed','bank.rule_signed','bank.rule_retired')
        and client_scoped) <> 5 then
    raise exception '0040/S3 tail: not all five bank.* event types this file registers are present and client_scoped';
  end if;

  raise notice '0040/S3 tail OK: role floors, op_key law, 004-before-006 lock order, named refusal tokens, and the five bank.* event types all verified against the live bodies';
end
$tail$;

-- WIKI-LINT SEAM (assembly, measured -- scripts/check-wiki-dynamic-sql.mjs). That gate treats
-- any `do` block that calls pg_get_functiondef AND contains an `execute` token as a
-- change-of-record patch, and then scans EVERY quoted literal inside it as if it were an
-- installed statement. A bare privilege literal ('execute', as has_function_privilege demands)
-- therefore reads to the scanner as an EXECUTE with an empty target -- unprovable, fail-closed.
-- The ACL half is split into its OWN block, which calls no pg_get_functiondef and so is not a
-- CoR patch at all. This is a shape change only: every assertion below is unchanged.
do $tail_acl$
declare
  f text;
  v_fns text[] := array[
    'clara.except_bank_line(uuid,text,text,uuid,text)',
    'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)',
    'clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)',
    'clara.sign_bank_rule(uuid,text)',
    'clara.retire_bank_rule(uuid,text,text)',
    'clara.set_counterparty_terms(uuid,int,text)',
    'clara.ar_aging(uuid,date,uuid)','clara.ap_aging(uuid,date,uuid)',
    'clara.customer_statement(uuid,uuid,date,date)','clara.supplier_statement(uuid,uuid,date,date)',
    'clara.list_unmatched_lines(uuid)','clara.get_bank_reconciliation(uuid)',
    'clara.list_bank_line_suggestions(uuid)','clara.list_bank_rule_candidates(uuid)',
    'clara.list_bank_rules(uuid)'];
begin
  -- GRANT MATRIX: every one of the 15 public functions this section creates reaches
  -- clara_authenticated and NO other app-facing role, and PUBLIC holds nothing.
  foreach f in array v_fns loop
    if not has_function_privilege('clara_authenticated', f, 'EXECUTE') then
      raise exception '0040/S3 tail: % is not EXECUTE-granted to clara_authenticated', f;
    end if;
    if has_function_privilege('public', f, 'EXECUTE') then
      raise exception '0040/S3 tail: % is EXECUTE-granted to PUBLIC -- the wall is broken', f;
    end if;
    if exists (select 1 from pg_roles where rolname = 'clara_agent_ro')
        and has_function_privilege('clara_agent_ro', f, 'EXECUTE') then
      raise exception '0040/S3 tail: % is EXECUTE-granted to clara_agent_ro -- WCA-R1''s zero-wake-grant law is broken', f;
    end if;
    if exists (select 1 from pg_roles where rolname = 'clara_runtime')
        and has_function_privilege('clara_runtime', f, 'EXECUTE') then
      raise exception '0040/S3 tail: % is EXECUTE-granted to clara_runtime -- no runtime path into this data bypasses the human verbs', f;
    end if;
  end loop;
  raise notice '0040/S3 tail OK: the clara_authenticated-only grant matrix holds across all 15 functions';
end
$tail_acl$;

-- #####################################################################################
-- ################## SECTION S4 -- THE SPLICE REGISTER ################################
-- #####################################################################################

-- ============================================================================================
-- 0040 -- SECTION S4: THE SPLICE SECTION (Wave C-c, design v2.1 section 5 splice register).
--
-- CHANGE-OF-RECORD SURGERY ON LIVE FUNCTION BODIES. Every splice below follows the house CoR
-- idiom, whose canonical shortest form is 0039_statement_balance_null_defers.sql (91 lines,
-- read whole before this file was written):
--   (1) fetch the LIVE body -- pg_get_functiondef(regprocedure) for an in-place recut, or
--       pg_proc.prosrc when a body is being DERIVED into a new arity. NEVER file text: the
--       live bodies here carry 0017/0024/0025/0026/0037/0038/0039 patches that a file-text
--       recut would silently revert (0026:1436 states this law for set_document_kind; 0038
--       E7e/E2b and 0039 restate it).
--   (2) an IDEMPOTENCY probe (the new marker must be ABSENT) -- a re-apply is loud, never a
--       double splice (0038:7777-7780 idiom).
--   (3) a PRESTATE anchor probe with an EXACT count, because replace() rewrites every
--       occurrence and a drifted body carrying two copies would take two splices while a
--       position()>0 postcheck stayed green (0036 review F4, restated at 0038:7785-7790).
--   (4) replace + execute, inside the migration transaction.
--   (5) POSTCHECK: the new markers landed, the OLD markers survived, proowner is still
--       clara_fn_owner.
--
-- THE NAMED TRAPS THIS FILE STEPS AROUND, each verified against the tree this session:
--   * _tf_processing_task_update: the 0011 anchor substring "new.error_code in
--     ('budget','attempt_cap')" SURVIVES VERBATIM inside the 0038 E2b body (0038:6580), so it
--     is NOT a prestate anchor -- the 0038-only marker "new.lane in
--     ('statement_facts','statement_parse')" (0038:6582) is (design register 9, Au7).
--   * request_reextraction's live body is 0026 section G (0026:994-1252), not 0022's -- three
--     admission doors and a TOCTOU `for update` a 0022/0025 recut would revert (Au9).
--   * classify_document / set_document_kind carry 0038's E7e splices; their CLR28
--     consent-evidence anchors and the live_bank_statement_present blocks are LEFT UNTOUCHED
--     (Au8) -- the consent door moved to classify_consent_evidence_document instead.
--   * _persist_statement_core carries 0039's null-defers-to-chain splice; both of 0039's
--     postcheck markers are re-asserted here with their exact counts.
--   * _subledger_on_approve is 0037-born and never recut; 0038's four hits on it are
--     CALLER-side position() probes on reverse_entry / approve_wrong_client_correction, so
--     replacing the CALLEE is safe -- but the callers' call-site strings are re-asserted
--     below (Au19).
--
-- ORDER DEPENDENCY: this section runs AFTER the section that ships clara.bank_reconciliations,
-- clara.bank_line_exceptions, clara.bank_rules, open_item_allocations.effective_date and
-- counterparties.payment_terms_days. plpgsql does NOT resolve table or column names at CREATE
-- time, so a mis-ordered apply would install every splice silently and fail at first call --
-- which is why section S4.0 below is a HARD preflight, not a comment.
-- ============================================================================================

-- --------------------------------------------------------------------------------------------
-- S4.0 -- PREFLIGHT. The substrate this section's spliced SQL reads must already exist.
-- --------------------------------------------------------------------------------------------
do $s4_00$
declare r record; v_rel text; v_missing text[] := '{}'::text[];
begin
  foreach v_rel in array array['bank_reconciliations','bank_line_exceptions','bank_rules'] loop
    if to_regclass('clara.'||v_rel) is null then
      v_missing := v_missing || ('table clara.'||v_rel);
    end if;
  end loop;
  if array_length(v_missing,1) is not null then
    raise exception '0040 S4.0 preflight: % -- the splice section runs AFTER the schema section; plpgsql resolves nothing at CREATE time, so a mis-ordered apply would install every splice green and break at first call', array_to_string(v_missing,', ')
      using errcode='CLR10';
  end if;
  for r in select * from (values
      ('open_item_allocations','effective_date'),
      ('open_items','due_date'),
      ('counterparties','payment_terms_days'),
      ('bank_reconciliations','id'), ('bank_reconciliations','firm_id'),
      ('bank_reconciliations','client_id'),
      ('bank_reconciliations','statement_id'), ('bank_reconciliations','bank_account_id'),
      ('bank_reconciliations','period_start'), ('bank_reconciliations','period_end'),
      ('bank_reconciliations','status'),
      ('bank_line_exceptions','line_id'), ('bank_line_exceptions','status'),
      ('bank_rules','id'), ('bank_rules','firm_id'), ('bank_rules','client_id'),
      ('bank_rules','kind'), ('bank_rules','status')
    ) as t(tbl,col)
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='clara' and table_name=r.tbl and column_name=r.col) then
      raise exception '0040 S4.0 preflight: clara.%.% does not exist -- this splice section reads it', r.tbl, r.col
        using errcode='CLR10';
    end if;
  end loop;
end $s4_00$;

set role clara_fn_owner;

-- --------------------------------------------------------------------------------------------
-- S4.1 -- clara.void_bank_statement: + recon_present + open_exception_present.
-- Register entry 1. Spliced AFTER the rung-4 live-member probe and BEFORE the status flip
-- (0038:2257-2270), so both new refusals are taken under 203005004 -> 203005006 -> the line
-- rows FOR UPDATE, exactly like the probe they join.
-- --------------------------------------------------------------------------------------------
do $s4_01$
declare
  v_sig text := 'clara.void_bank_statement(uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.1 prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('recon_present' in v_def) <> 0 then
    raise exception '0040 S4.1 prestate: % already carries the recon guard -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;
  if position('statement_has_live_matches' in v_def) = 0 then
    raise exception '0040 S4.1 prestate: % lost 0038''s rung-4 live-member probe -- refusing to patch a body this migration cannot account for', v_sig using errcode='CLR10';
  end if;

  v_frm := $f$  update clara.bank_statements
    set status = 'void', voided_by = c.actor, voided_at = now(), voided_reason = v_reason
    where id = p_statement;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.1 prestate: the void flip appears % times in % (expected exactly once) -- the body drifted; re-derive this splice', v_cnt, v_sig
      using errcode='CLR10';
  end if;

  v_to := $t$  -- 0040 (C-c, design section 5 register 1). TWO NEW REFUSALS, both taken here --
  -- under the advisory rungs and the line row locks the probe above already holds, and BEFORE
  -- the flip, so neither is a read of a world that can change before the void commits.
  --
  -- recon_present. A complete reconciliation IS the receipt that certified this statement's
  -- terms. Voiding the statement underneath it would leave a certified professional document
  -- citing lines the schema no longer holds live. The lifecycle is void-only and ORDERED: the
  -- recon is voided first (newest-first down the chain, recon_chain_order), then the statement.
  -- This refusal is also what makes SUPERSESSION unreachable by construction (design section
  -- 4.1): a re-ingested statement always starts with no recon until a human completes a fresh
  -- one, so there is no state in which a second live recon could claim to supersede a first.
  if exists (select 1 from clara.bank_reconciliations br
             where br.statement_id = p_statement and br.firm_id = c.firm
               and br.client_id = p_client and br.status = 'complete') then
    raise exception 'reconciliation % certifies this statement; void the reconciliation first (newest first down the chain)',
      (select min(br.id::text) from clara.bank_reconciliations br
        where br.statement_id = p_statement and br.firm_id = c.firm
          and br.client_id = p_client and br.status = 'complete')
      using errcode='CLR10',detail='{"reason":"recon_present"}';
  end if;
  -- open_exception_present (ladder finding 21). An OPEN exception is an owner's live assertion
  -- that a specific line is a bank error or a dispute; it rides the excepted(P) term of every
  -- later period's identity. Letting its statement be voided out from under it strands the
  -- assertion on a line nobody can reach. The exception belt asserts the same law from the
  -- other side (an open exception's statement is live); this is the door that keeps the belt
  -- from ever having to fire.
  if exists (select 1 from clara.bank_line_exceptions x
             join clara.bank_statement_lines bl on bl.id = x.line_id
             where bl.statement_id = p_statement and x.status = 'open') then
    raise exception 'this statement has % line(s) under an open bank-line exception; resolve them before voiding',
      (select count(*)::int from clara.bank_line_exceptions x
         join clara.bank_statement_lines bl on bl.id = x.line_id
        where bl.statement_id = p_statement and x.status = 'open')
      using errcode='CLR10',detail='{"reason":"open_exception_present"}';
  end if;

  update clara.bank_statements
    set status = 'void', voided_by = c.actor, voided_at = now(), voided_reason = v_reason
    where id = p_statement;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('recon_present' in v_def) = 0
     or position('open_exception_present' in v_def) = 0
     or position('statement_has_live_matches' in v_def) = 0 then
    raise exception '0040 S4.1 postcheck: the void_bank_statement splice did not land, or the 0038 probe was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.1 postcheck: void_bank_statement changed owner' using errcode='CLR10';
  end if;
end $s4_01$;

-- --------------------------------------------------------------------------------------------
-- S4.2 -- clara.unmatch_bank_match: + recon_period_settled. Register entry 2 / the settled-period
-- law (design section 3). Spliced immediately after the already_unmatched guard (0038:5177-5181)
-- and therefore under the group's own FOR UPDATE.
-- --------------------------------------------------------------------------------------------
do $s4_02$
declare
  v_sig text := 'clara.unmatch_bank_match(uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.2 prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('recon_period_settled' in v_def) <> 0 then
    raise exception '0040 S4.2 prestate: % already carries the settled-period guard -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;
  if position('draft_withdrawn' in v_def) = 0 then
    raise exception '0040 S4.2 prestate: % is not the 0038 as-built body (the pending-draft withdrawal is missing) -- re-derive this splice', v_sig using errcode='CLR10';
  end if;

  v_frm := $f$  if g.status = 'unmatched' then
    raise exception 'bank match % is already unmatched; re-matching writes a NEW group', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_unmatched','match_id',p_match)::text;
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.2 prestate: the already_unmatched guard appears % times (expected exactly once) -- the body drifted', v_cnt
      using errcode='CLR10';
  end if;

  v_to := v_frm || $t$
  -- 0040 (C-c, design section 3 "the settled-period law"; register entry 2). ONCE A PERIOD IS
  -- RECONCILED, ITS TERMS ARE CERTIFIED. Every live group is a term of the identity that a
  -- complete reconciliation certified -- an unpresented cheque, a deposit in transit, a
  -- cleared pair -- and unmatching one MOVES a number a professional has signed. The undo is
  -- not forbidden, it is ORDERED: void the reconciliation chain back, newest first
  -- (recon_chain_order), then unmatch, then re-complete. /bank states the cost ("this will
  -- void N receipts") before the act; the residual is recorded in design section 10.
  --
  -- THE SCOPE IS THE LINE'S STATEMENT PERIOD, MEASURED ALL-TIME. Every identity term is
  -- account-scoped and all-time (<= P.end), so a group whose line sits in April is a term of
  -- April's receipt AND of every later complete receipt on that account. The predicate is
  -- therefore "a complete reconciliation on this line's bank account whose period_end reaches
  -- or passes the line's statement period_end", which is exactly the set of receipts this
  -- group is priced into. A December line under an April-only reconciled account is NOT
  -- refused -- April's terms never named it.
  if exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then unmatch', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_period_settled','match_id',p_match)::text;
  end if;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('recon_period_settled' in v_def) = 0
     or position('already_unmatched' in v_def) = 0
     or position('draft_withdrawn' in v_def) = 0 then
    raise exception '0040 S4.2 postcheck: the unmatch splice did not land, or a 0038 marker was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.2 postcheck: unmatch_bank_match changed owner' using errcode='CLR10';
  end if;
end $s4_02$;

-- --------------------------------------------------------------------------------------------
-- S4.3 -- clara.complete_pending_match: + recon_period_settled. Register entry 3 [L1/A11].
-- The same law: completing a pending reservation inside a reconciled period turns a
-- recon_line_reserved precondition into a live group, which MOVES a certified term.
-- Spliced after the match_not_pending guard (0038:4896-4900), under the group's FOR UPDATE.
-- --------------------------------------------------------------------------------------------
do $s4_03$
declare
  v_sig text := 'clara.complete_pending_match(uuid,uuid,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.3 prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('recon_period_settled' in v_def) <> 0 then
    raise exception '0040 S4.3 prestate: % already carries the settled-period guard -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;
  if position('pending_ancillaries' in v_def) = 0 then
    raise exception '0040 S4.3 prestate: % is not the 0038 as-built body (the deferred ancillaries are missing) -- re-derive this splice', v_sig using errcode='CLR10';
  end if;

  v_frm := $f$  if g.status <> 'pending' then
    raise exception 'bank match % is % , not pending; only a pending reservation can be completed', p_match, g.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','match_not_pending','match_id',p_match,
          'status',g.status)::text;
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.3 prestate: the match_not_pending guard appears % times (expected exactly once) -- the body drifted', v_cnt
      using errcode='CLR10';
  end if;

  v_to := v_frm || $t$
  -- 0040 (C-c, design section 3 "the settled-period law"; register entry 3). THE OTHER HALF OF
  -- THE SAME LAW. A pending reservation is a precondition refusal (recon_line_reserved), never
  -- a term; completing it makes it a LIVE group, which changes the arithmetic of every receipt
  -- whose period reaches that line. The remedy is identical and it is named in the message:
  -- void the chain back, complete, re-reconcile. (Cancelling the reservation instead is
  -- unmatch_bank_match, which carries this same refusal -- deliberately: both directions move
  -- the same certified number.)
  if exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then complete', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_period_settled','match_id',p_match)::text;
  end if;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('recon_period_settled' in v_def) = 0
     or position('match_not_pending' in v_def) = 0
     or position('pending_ancillaries' in v_def) = 0 then
    raise exception '0040 S4.3 postcheck: the complete_pending_match splice did not land, or a 0038 marker was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.3 postcheck: complete_pending_match changed owner' using errcode='CLR10';
  end if;
end $s4_03$;

-- ============================================================================================
-- S4.4 -- clara.match_bank_line + clara.settle_from_bank_line: THE p_via_rule OVERLOADS.
-- Register entry 4 (findings 12 [A12/R9/Au1/C13 BLOCKER] and 38 [C8]).
--
-- THE PROBLEM, AS THE LADDER STATED IT. bank_matches.origin CHECKs (origin='rule') =
-- (matched_via_rule_id is not null) -- an iff (0038:650) -- and BOTH writers hardcode
-- 'human', null at their group INSERT (0038:4076, 0038:4668). So origin='rule' has no writer
-- and the C-c engineering pin ("a human-confirmed suggestion records origin='rule' +
-- matched_via_rule_id with the human as created_by") was unbuildable.
--
-- WHY AN OVERLOAD, AND WHY NOT A WRAPPER EITHER WAY. Three constraints bind simultaneously:
--   (a) the 6-arg / 12-arg signatures must survive: 0038's tail pins them by EXACT-ARITY
--       ::regprocedure (0038:8562-8563) and the dashboard + rig call them by that shape;
--   (b) the 0038 tail also pins the CONTENT of those two bodies -- match_bank_line must lock
--       clara.journal_entries FOR UPDATE strictly BEFORE advisory 203005004 and lock
--       clara.bank_statement_lines strictly after it (0038:8958-8979); settle_from_bank_line
--       must call BOTH clara.allocate_receipt and clara.allocate_payment, must NOT lock a
--       pre-existing journal_entries row, and must take NO advisory rung of its own
--       (0038:8995-9014). A thin delegating wrapper in the OLD arity destroys every one of
--       those literals;
--   (c) a thin NEW overload delegating to the old one cannot work in the other direction --
--       the old body hardcodes 'human', null, so there is nothing to pass through.
-- The choice that satisfies all three: the ORIGINAL arity is recut IN PLACE for the exception
-- re-check ONLY (text is inserted, never removed -- every pinned literal survives), and the
-- NEW arity is DERIVED FROM THAT PATCHED BODY at migration time by three exact-count string
-- edits. One source of truth at build time, two functions at rest; the derived body therefore
-- carries every 0038-pinned literal too, and the section postcheck re-asserts 0038's own
-- content pins against BOTH arities. This is the 0038 E1.3 pattern (prepare/consume_egress_
-- dispatch, 0038:5925-6095: a new trailing-arg arity beside a byte-untouched original, with a
-- count(*)=2 pg_proc postcheck) applied to a body too large to re-transcribe by hand.
--
-- THE NEW ARITIES CARRY NO DEFAULTS AT ALL, AND THAT IS DELIBERATE -- a correction to the
-- design register's "p_via_rule uuid default null" wording, made for a mechanical reason the
-- register did not weigh. The ORIGINALS already have defaults (match: args 4-6; settle: args
-- 6-12), so a 6-argument call already reaches match_bank_line through three of them. If the
-- new arity ALSO carried defaults, a 3..6-argument call would match BOTH candidates after
-- default expansion, and PostgreSQL's function resolution has no basis to prefer one -- an
-- ambiguity that would break the dashboard's LIVE money path, not a new one. Removing every
-- default from the new arities makes the overlap empty by construction: the 6-arg is reachable
-- with 3..6 arguments, the 7-arg with exactly 7, and no call can name both. This is also
-- exactly what 0038 E1.3 did -- its new 6-arg prepare / 7-arg consume overloads carry NO
-- default on the trailing p_document_sha256 either (0038:5957-5958, 0038:6004-6006), for the
-- same reason. The section postcheck asserts pronargdefaults = 0 on both new arities so a
-- later hand cannot re-introduce the hazard.
--
-- THE EXCEPTION RE-CHECK GOES IN THE ORIGINAL, so it holds for EVERY caller of either arity
-- (finding 38, the exception<->match cross-table write-skew): except/resolve take the line row
-- FOR UPDATE, and these two writers re-ask the exception question AFTER taking that same lock.
-- Two transactions can no longer both pass a deferred check.
-- ============================================================================================

-- S4.4a -- match_bank_line, IN PLACE: the post-lock exception re-check.
do $s4_04a$
declare
  v_sig text := 'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.4a prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('line_excepted' in v_def) <> 0 then
    raise exception '0040 S4.4a prestate: % already carries the exception re-check -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;

  v_frm := $f$  perform 1 from clara.bank_statement_lines l where l.id = any(v_line_ids)
    order by l.id for update;
  perform 1 from clara.bank_statements s
    where s.id in (select l.statement_id from clara.bank_statement_lines l
                   where l.id = any(v_line_ids))
    order by s.id for share;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4a prestate: match_bank_line''s bank row-lock block appears % times (expected exactly once) -- the body drifted', v_cnt
      using errcode='CLR10';
  end if;

  v_to := v_frm || $t$

  -- 0040 (C-c, design section 4.2 / finding 38 [C8]): THE EXCEPTION RE-CHECK, AFTER THE LINE
  -- LOCK. An open bank-line exception says a line is a bank error or a dispute -- it rides the
  -- excepted(P) term, not the matched set, and a line cannot be both. The belt alone cannot
  -- close this: two transactions, one excepting and one matching, each pass their own deferred
  -- check and both commit. So the shared serialization point is the LINE ROW: except/resolve
  -- take it FOR UPDATE, and this writer -- which already holds exactly that lock, one statement
  -- above -- re-asks the question here rather than trusting the world it read before the lock.
  if exists (select 1 from clara.bank_line_exceptions x
             where x.line_id = any(v_line_ids) and x.status = 'open') then
    raise exception 'statement line % is under an open bank-line exception; resolve the exception before matching it',
      (select min(x.line_id::text) from clara.bank_line_exceptions x
        where x.line_id = any(v_line_ids) and x.status = 'open')
      using errcode='CLR10',detail='{"reason":"line_excepted"}';
  end if;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('line_excepted' in v_def) = 0 then
    raise exception '0040 S4.4a postcheck: the match_bank_line exception re-check did not land' using errcode='CLR10';
  end if;
end $s4_04a$;

-- S4.4b -- match_bank_line, THE NEW 7-ARG ARITY, derived from the patched 6-arg body.
-- WIKI-LINT SEAM (assembly, measured -- scripts/check-wiki-dynamic-sql.mjs). The derived
-- arity USED to be installed by `execute 'create function ...' || v_src`, which the gate
-- refuses fail-closed and correctly so: a dynamically CREATED function whose body is a
-- variable is a persistent surface the scanner cannot read, and no whitelist entry can
-- honestly excuse one. The shape below installs the SAME body with nothing lost, in two
-- steps the gate CAN read:
--   (1) a PLAIN-SQL stub carrying the exact new signature (scanned as an ordinary function
--       definition, body = one raise);
--   (2) an ordinary change-of-record patch that swaps the stub's body for the derived one --
--       the same idiom every other splice in this section uses, whose target resolves
--       statically through a literal signature variable.
-- The stub can never be reachable: step (2) runs in the SAME transaction, and the migration
-- aborts whole if it does not.
create function clara.match_bank_line(
    p_client uuid, p_lines jsonb, p_entries jsonb,
    p_adjustments jsonb, p_ack_period_exceptions boolean,
    p_op_key text, p_via_rule uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $mbl40stub$
begin
  raise exception '0040 S4.4b: the 7-arg match_bank_line stub was never re-bodied' using errcode='CLR10';
end
$mbl40stub$;

do $s4_04b$
declare
  v_new text := 'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)';
  v_src text; v_frm text; v_to text; v_cnt int; v_def text; v_stub text;
begin
  -- IDEMPOTENCY: the STUB is what step (1) just installed; a re-apply is caught earlier by
  -- S4.4a's own prestate probe (the 6-arg body already carries the exception re-check), and
  -- here by the stub marker still being the live body -- never a second splice.
  select p.prosrc into v_stub from pg_proc p where p.oid = v_new::regprocedure;
  if v_stub is null or position('the 7-arg match_bank_line stub was never re-bodied' in v_stub) = 0 then
    raise exception '0040 S4.4b prestate: the 7-arg clara.match_bank_line is not the freshly-installed stub -- 0040 has already been applied to this database, or the stub drifted' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure;
  if v_src is null or position('line_excepted' in v_src) = 0 then
    raise exception '0040 S4.4b prestate: the 6-arg match_bank_line body is absent or did not receive S4.4a''s exception re-check -- the derived arity must be built from the PATCHED body' using errcode='CLR10';
  end if;

  -- EDIT 1 -- the rule validation, before the op receipt so a bad rule id burns no key.
  v_frm := $f1$  v_ack := coalesce(p_ack_period_exceptions, false);$f1$;
  v_cnt := (length(v_src) - length(replace(v_src, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4b prestate: the v_ack normalisation appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := v_frm || $t1$

  -- 0040 (C-c, design section 4.3 engineering pin; register entry 4): THE RULE ARITY. A
  -- human-confirmed suggestion records origin='rule' + matched_via_rule_id WITH THE HUMAN AS
  -- created_by -- the rule proposed, the human acted, and the group row says both. No rule ever
  -- executes anything: this arity is reached only from a human clicking a suggestion chip, and
  -- it carries the identical floor, locks, tie arithmetic and refusals as the 6-arg arity it
  -- was derived from. The rule must be THIS client's, SIGNED, and of the match/settle kind --
  -- validated BEFORE _reserve_op so an invalid id costs no op key.
  if p_via_rule is not null then
    if not exists (select 1 from clara.bank_rules r
                   where r.id = p_via_rule and r.firm_id = c.firm and r.client_id = p_client
                     and r.kind = 'match_settle' and r.status = 'signed') then
      raise exception 'bank rule % is not a signed match/settle rule for this client', p_via_rule
        using errcode='CLR10',detail='{"reason":"rule_not_signed"}';
    end if;
  end if;$t1$;
  v_src := replace(v_src, v_frm, v_to);

  -- EDIT 2 -- the request hash. p_via_rule reaches a stored column, so it must be in the hash
  -- (0038:3942-3946's own law) -- but ONLY when present, so a rule-less 7-arg call still
  -- replays a 6-arg receipt byte-identically instead of refusing on a phantom hash mismatch.
  v_frm := $f2$      'ack_period_exceptions', v_ack)));$f2$;
  v_cnt := (length(v_src) - length(replace(v_src, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4b prestate: the match request-hash tail appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t2$      'ack_period_exceptions', v_ack)
      || case when p_via_rule is null then '{}'::jsonb
              else jsonb_build_object('via_rule', p_via_rule) end));$t2$;
  v_src := replace(v_src, v_frm, v_to);

  -- EDIT 3 -- the group INSERT. This is the line the CHECK made an iff and no writer could
  -- reach; the case expression keeps origin and matched_via_rule_id congruent by construction,
  -- which is also what the group-tie belt (0038:3457) asserts from its own side.
  v_frm := $f3$    values (v_match, c.firm, p_client, v_bank, 'live', 'human', null, null, c.actor, now());$f3$;
  v_cnt := (length(v_src) - length(replace(v_src, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4b prestate: the match group INSERT values row appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t3$    values (v_match, c.firm, p_client, v_bank, 'live',
      case when p_via_rule is null then 'human' else 'rule' end, p_via_rule,
      null, c.actor, now());$t3$;
  v_src := replace(v_src, v_frm, v_to);

  -- NO DEFAULTS ON THIS ARITY (see the S4.4 header): every argument is required, so the
  -- 6-arg (reachable with 3..6 arguments through its own defaults) and this 7-arg have an
  -- EMPTY overlap and no call can ever be ambiguous between them. The stub above declared
  -- exactly that signature; this swap changes only the body.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_new::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, v_stub, ''))) / length(v_stub);
  if v_cnt <> 1 then
    raise exception '0040 S4.4b: the stub body appears % times in its own definition (expected once)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_stub, v_src);
  execute v_def;

  select p.prosrc into v_def from pg_proc p where p.oid = v_new::regprocedure;
  if position('the 7-arg match_bank_line stub was never re-bodied' in v_def) <> 0
     or position('p_via_rule' in v_def) = 0 then
    raise exception '0040 S4.4b postcheck: the derived 7-arg body did not replace the stub' using errcode='CLR10';
  end if;
end $s4_04b$;

alter function clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)
  owner to clara_fn_owner;
revoke all on function clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid) from public;
grant execute on function clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)
  to clara_authenticated;

-- S4.4c -- settle_from_bank_line, IN PLACE: the post-lock exception re-check.
do $s4_04c$
declare
  v_sig text := 'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.4c prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('line_excepted' in v_def) <> 0 then
    raise exception '0040 S4.4c prestate: % already carries the exception re-check -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;

  v_frm := $f$  perform 1 from clara.bank_statement_lines l where l.id = p_line for update;
  perform 1 from clara.bank_statements s where s.id = ln.statement_id for share;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4c prestate: settle_from_bank_line''s bank row-lock block appears % times (expected exactly once) -- the body drifted', v_cnt
      using errcode='CLR10';
  end if;

  v_to := v_frm || $t$

  -- 0040 (C-c, design section 4.2 / finding 38 [C8]): THE EXCEPTION RE-CHECK, AFTER THE LINE
  -- LOCK -- the same write-skew law match_bank_line carries, on the same shared serialization
  -- point. It sits HERE, at the bank rows, and not beside the unlocked already_matched probe
  -- near the top, because a check taken before the lock is a read of a world that can change:
  -- the authority statement has to be made where the lock is held. The cost is that an
  -- excepted line is discovered after the settlement composite has run -- the whole call rolls
  -- back, so nothing is stranded, and the refusal names the remedy.
  if exists (select 1 from clara.bank_line_exceptions x
             where x.line_id = p_line and x.status = 'open') then
    raise exception 'statement line % is under an open bank-line exception; resolve the exception before settling from it', p_line
      using errcode='CLR10',detail='{"reason":"line_excepted"}';
  end if;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('line_excepted' in v_def) = 0 then
    raise exception '0040 S4.4c postcheck: the settle_from_bank_line exception re-check did not land' using errcode='CLR10';
  end if;
end $s4_04c$;

-- S4.4d -- settle_from_bank_line, THE NEW 13-ARG ARITY, derived from the patched 12-arg body.
-- WIKI-LINT SEAM (assembly, measured -- scripts/check-wiki-dynamic-sql.mjs). The derived
-- arity USED to be installed by `execute 'create function ...' || v_src`, which the gate
-- refuses fail-closed and correctly so: a dynamically CREATED function whose body is a
-- variable is a persistent surface the scanner cannot read, and no whitelist entry can
-- honestly excuse one. The shape below installs the SAME body with nothing lost, in two
-- steps the gate CAN read:
--   (1) a PLAIN-SQL stub carrying the exact new signature (scanned as an ordinary function
--       definition, body = one raise);
--   (2) an ordinary change-of-record patch that swaps the stub's body for the derived one --
--       the same idiom every other splice in this section uses, whose target resolves
--       statically through a literal signature variable.
-- The stub can never be reachable: step (2) runs in the SAME transaction, and the migration
-- aborts whole if it does not.
create function clara.settle_from_bank_line(
    p_client uuid, p_line uuid, p_counterparty uuid, p_allocations jsonb,
    p_memo text, p_posting_date date,
    p_charge_cents bigint, p_charge_account text, p_adjustments jsonb,
    p_attestation text, p_control_account text, p_op_key text,
    p_via_rule uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $sbl40stub$
begin
  raise exception '0040 S4.4d: the 13-arg settle_from_bank_line stub was never re-bodied' using errcode='CLR10';
end
$sbl40stub$;

do $s4_04d$
declare
  v_new text := 'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)';
  v_src text; v_frm text; v_to text; v_cnt int; v_def text; v_stub text;
begin
  select p.prosrc into v_stub from pg_proc p where p.oid = v_new::regprocedure;
  if v_stub is null or position('the 13-arg settle_from_bank_line stub was never re-bodied' in v_stub) = 0 then
    raise exception '0040 S4.4d prestate: the 13-arg clara.settle_from_bank_line is not the freshly-installed stub -- 0040 has already been applied to this database, or the stub drifted' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)'::regprocedure;
  if v_src is null or position('line_excepted' in v_src) = 0 then
    raise exception '0040 S4.4d prestate: the 12-arg settle_from_bank_line body is absent or did not receive S4.4c''s exception re-check -- the derived arity must be built from the PATCHED body' using errcode='CLR10';
  end if;

  -- EDIT 1 -- the rule validation, before the op receipt.
  v_frm := $f1$  v_charge := coalesce(p_charge_cents, 0);$f1$;
  v_cnt := (length(v_src) - length(replace(v_src, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4d prestate: the v_charge normalisation appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t1$  -- 0040 (C-c, design section 4.3 engineering pin; register entry 4): THE RULE ARITY --
  -- identical law to match_bank_line's. Settlement KINDS stay composite-born and no rule ever
  -- executes anything; this arity records WHICH signed rule a human accepted a pre-fill from.
  if p_via_rule is not null then
    if not exists (select 1 from clara.bank_rules r
                   where r.id = p_via_rule and r.firm_id = c.firm and r.client_id = p_client
                     and r.kind = 'match_settle' and r.status = 'signed') then
      raise exception 'bank rule % is not a signed match/settle rule for this client', p_via_rule
        using errcode='CLR10',detail='{"reason":"rule_not_signed"}';
    end if;
  end if;
  v_charge := coalesce(p_charge_cents, 0);$t1$;
  v_src := replace(v_src, v_frm, v_to);

  -- EDIT 2 -- the request hash (0038:4385-4388's law), present-only so a rule-less call still
  -- replays a 12-arg receipt byte-identically.
  v_frm := $f2$      'control_account', p_control_account)));$f2$;
  v_cnt := (length(v_src) - length(replace(v_src, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4d prestate: the settle request-hash tail appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t2$      'control_account', p_control_account)
      || case when p_via_rule is null then '{}'::jsonb
              else jsonb_build_object('via_rule', p_via_rule) end));$t2$;
  v_src := replace(v_src, v_frm, v_to);

  -- EDIT 3 -- the group INSERT.
  v_frm := $f3$    values (v_match, c.firm, p_client, v_bank, v_match_status, 'human', null,$f3$;
  v_cnt := (length(v_src) - length(replace(v_src, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.4d prestate: the settle group INSERT values row appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t3$    values (v_match, c.firm, p_client, v_bank, v_match_status,
      case when p_via_rule is null then 'human' else 'rule' end, p_via_rule,$t3$;
  v_src := replace(v_src, v_frm, v_to);

  -- NO DEFAULTS ON THIS ARITY (see the S4.4 header): the 12-arg is reachable with 5..12
  -- arguments through its own defaults; this one takes exactly 13. Empty overlap.
  -- The stub above declared exactly this signature (13 required arguments, no defaults --
  -- the 12-arg is reachable with 5..12, so the overlap is empty); this swap changes only the
  -- body. Same two-step shape as S4.4b, and for the same wiki-lint reason.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_new::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, v_stub, ''))) / length(v_stub);
  if v_cnt <> 1 then
    raise exception '0040 S4.4d: the stub body appears % times in its own definition (expected once)', v_cnt using errcode='CLR10';
  end if;
  v_def := replace(v_def, v_stub, v_src);
  execute v_def;

  select p.prosrc into v_def from pg_proc p where p.oid = v_new::regprocedure;
  if position('the 13-arg settle_from_bank_line stub was never re-bodied' in v_def) <> 0
     or position('p_via_rule' in v_def) = 0 then
    raise exception '0040 S4.4d postcheck: the derived 13-arg body did not replace the stub' using errcode='CLR10';
  end if;
end $s4_04d$;

alter function clara.settle_from_bank_line(
    uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)
  owner to clara_fn_owner;
revoke all on function clara.settle_from_bank_line(
  uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid) from public;
grant execute on function clara.settle_from_bank_line(
  uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid) to clara_authenticated;

-- ============================================================================================
-- S4.5 -- clara.remap_bank_account_coa + clara.deactivate_bank_account: the advisory rungs and
-- recon_present. Register entry 5 (finding 16 [R5/C7 BLOCKER]).
--
-- MEASURED, NOT ASSUMED: neither verb takes ANY advisory rung today (0038:2810-2858 and
-- 0038:2938-2998 read in full this session) -- only a bank_accounts row FOR UPDATE and a
-- live-match probe. That is a certify-while-mutating window: a reconciliation completing on a
-- zero-line month holds no line rows, so nothing serializes it against a remap that moves the
-- account's certified COA basis out from under the receipt being written. The rungs are the
-- house pair void_bank_statement takes (0038:2241-2242): 203005004 (client) then 203005006
-- (the account chain), in that order, taken AFTER the op receipt (0037:2678-2698's law: a
-- _reserve_op can BLOCK, and blocking while holding a lock makes a deadlock reachable) and
-- BEFORE the first row lock.
-- ============================================================================================

-- S4.5a -- remap_bank_account_coa.
do $s4_05a$
declare
  v_sig text := 'clara.remap_bank_account_coa(uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.5a prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('203005006' in v_def) <> 0 or position('recon_present' in v_def) <> 0 then
    raise exception '0040 S4.5a prestate: % already carries a rung or the recon guard -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;
  if position('203005004' in v_def) <> 0 then
    raise exception '0040 S4.5a prestate: % unexpectedly already takes advisory 203005004 -- the measured pre-state (0038:2938-2998, NO advisory rung) has drifted; re-derive this splice', v_sig using errcode='CLR10';
  end if;

  -- EDIT 1: the two rungs, between the op receipt and the first row lock.
  v_frm := $f1$  if v_dedupe is not null then return v_dedupe; end if;

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.5a prestate: the receipt/row-lock seam appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t1$  if v_dedupe is not null then return v_dedupe; end if;

  -- 0040 (C-c, register entry 5; finding 16 [R5/C7]): THE TWO RUNGS THIS VERB NEVER TOOK.
  -- Remapping the COA changes the CERTIFIED BASIS of every reconciliation on this account
  -- (the receipt stores coa_account_code and the gl() term is read on it). Until now this verb
  -- serialized against nothing but a row lock on bank_accounts, so a recon completing on a
  -- zero-line month -- which holds no line rows at all -- could be certifying an account whose
  -- chart binding was moving underneath it. The rungs are the pair void_bank_statement takes
  -- (0038:2241-2242), in the same order: client first, then the account chain. Taken AFTER the
  -- op receipt (a _reserve_op can block; blocking while holding a lock makes a deadlock
  -- reachable -- 0037:2678-2698) and BEFORE any row lock.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(p_bank_account::text));

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;$t1$;
  v_def := replace(v_def, v_frm, v_to);

  -- EDIT 2: recon_present, beside the live-match refusal it is a sibling of.
  v_frm := $f2$  if exists (select 1 from clara.bank_matches
      where bank_account_id = p_bank_account and status in ('pending','live')) then
    raise exception 'bank account % has a pending or live match group; unmatch first', p_bank_account
      using errcode = 'CLR10', detail = '{"reason":"bank_account_has_live_matches"}';
  end if;$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.5a prestate: the live-match refusal appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := v_frm || $t2$
  -- 0040 (C-c, register entry 5): recon_present. A complete reconciliation certified its terms
  -- against a NAMED chart account (bank_reconciliations.coa_account_code, asserted against the
  -- live mapping at insert). Re-pointing the account afterwards would silently invalidate every
  -- receipt on it -- the post-hoc invalidation the races lens named. Ordered remedy, same as
  -- everywhere else in this wave: void the reconciliation chain first, then remap, then
  -- re-complete. Any-state statements do not block a remap; certified receipts do.
  if exists (select 1 from clara.bank_reconciliations br
             where br.bank_account_id = p_bank_account and br.firm_id = c.firm
               and br.client_id = p_client and br.status = 'complete') then
    raise exception 'bank account % carries % complete reconciliation(s) certified against chart account %; void the reconciliation chain before remapping', p_bank_account,
      (select count(*)::int from clara.bank_reconciliations br
        where br.bank_account_id = p_bank_account and br.firm_id = c.firm
          and br.client_id = p_client and br.status = 'complete'), v_old_code
      using errcode='CLR10', detail='{"reason":"recon_present"}';
  end if;$t2$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('203005004' in v_def) = 0 or position('203005006' in v_def) = 0
     or position('recon_present' in v_def) = 0
     or position('bank_account_has_live_matches' in v_def) = 0 then
    raise exception '0040 S4.5a postcheck: remap_bank_account_coa is missing a rung, the recon guard, or lost the 0038 live-match refusal' using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005004' in v_def)
     > position('pg_advisory_xact_lock(203005006' in v_def) then
    raise exception '0040 S4.5a postcheck: remap_bank_account_coa takes 203005006 BEFORE 203005004 -- the house acquisition order is inverted' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.5a postcheck: remap_bank_account_coa changed owner' using errcode='CLR10';
  end if;
end $s4_05a$;

-- S4.5b -- deactivate_bank_account.
do $s4_05b$
declare
  v_sig text := 'clara.deactivate_bank_account(uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.5b prestate: % is GONE', v_sig using errcode='CLR10';
  end if;
  if position('203005006' in v_def) <> 0 or position('recon_present' in v_def) <> 0 then
    raise exception '0040 S4.5b prestate: % already carries a rung or the recon guard -- 0040 has already been applied to this database', v_sig using errcode='CLR10';
  end if;
  if position('203005004' in v_def) <> 0 then
    raise exception '0040 S4.5b prestate: % unexpectedly already takes advisory 203005004 -- the measured pre-state (0038:2810-2858, NO advisory rung) has drifted; re-derive this splice', v_sig using errcode='CLR10';
  end if;

  v_frm := $f1$  if v_dedupe is not null then return v_dedupe; end if;

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.5b prestate: the receipt/row-lock seam appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := $t1$  if v_dedupe is not null then return v_dedupe; end if;

  -- 0040 (C-c, register entry 5; finding 16 [R5/C7]): THE TWO RUNGS THIS VERB NEVER TOOK --
  -- the same pair, the same order, the same reason as remap's (see that body). Deactivation
  -- frees the COA for re-registration, so it moves the same certified basis a remap does.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(p_bank_account::text));

  select * into b from clara.bank_accounts
    where id = p_bank_account and client_id = p_client and firm_id = c.firm
    for update;$t1$;
  v_def := replace(v_def, v_frm, v_to);

  v_frm := $f2$  if exists (select 1 from clara.bank_matches bm
      where bm.bank_account_id = p_bank_account and bm.status in ('pending','live')) then
    raise exception 'bank account % still holds pending/live match groups; unmatch them before deactivating', p_bank_account
      using errcode='CLR10', detail='{"reason":"bank_account_has_live_matches"}';
  end if;$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.5b prestate: the live-match refusal appears % times (expected exactly once)', v_cnt using errcode='CLR10';
  end if;
  v_to := v_frm || $t2$
  -- 0040 (C-c, register entry 5): recon_present. Professionally, an account with certified
  -- receipts is not simply "done" -- deactivating it frees its chart account for another live
  -- account, and the pool-vs-capacity divergence that opens is exactly the shape the receipt
  -- exists to foreclose. Ordered remedy: void the reconciliation chain, then deactivate.
  if exists (select 1 from clara.bank_reconciliations br
             where br.bank_account_id = p_bank_account and br.firm_id = c.firm
               and br.client_id = p_client and br.status = 'complete') then
    raise exception 'bank account % carries % complete reconciliation(s); void the reconciliation chain before deactivating', p_bank_account,
      (select count(*)::int from clara.bank_reconciliations br
        where br.bank_account_id = p_bank_account and br.firm_id = c.firm
          and br.client_id = p_client and br.status = 'complete')
      using errcode='CLR10', detail='{"reason":"recon_present"}';
  end if;$t2$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('203005004' in v_def) = 0 or position('203005006' in v_def) = 0
     or position('recon_present' in v_def) = 0
     or position('bank_account_has_live_matches' in v_def) = 0 then
    raise exception '0040 S4.5b postcheck: deactivate_bank_account is missing a rung, the recon guard, or lost the 0038 live-match refusal' using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005004' in v_def)
     > position('pg_advisory_xact_lock(203005006' in v_def) then
    raise exception '0040 S4.5b postcheck: deactivate_bank_account takes 203005006 BEFORE 203005004 -- the house acquisition order is inverted' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.5b postcheck: deactivate_bank_account changed owner' using errcode='CLR10';
  end if;
end $s4_05b$;

-- --------------------------------------------------------------------------------------------
-- S4.6 -- clara._persist_statement_core: + recon_frontier_backfill. Register entry 6
-- (finding 18 [R7/C11]). The live body is 0038-born and 0039-SPLICED; both of 0039's postcheck
-- markers are re-asserted with their EXACT live counts (null-defers-to-chain x1,
-- "with ordinality" x2) so this splice cannot silently revert the null-defers law.
--
-- Spliced into step 9 (BOTH-EDGE CONTINUITY, 0038:1730-1754), immediately before the prior-edge
-- probe and therefore under the 203005006 chain lock and before the atomic insert at step 11.
-- --------------------------------------------------------------------------------------------
do $s4_06$
declare
  v_sig text := 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.6 prestate: clara._persist_statement_core is GONE' using errcode='CLR10';
  end if;
  if position('recon_frontier_backfill' in v_def) <> 0 then
    raise exception '0040 S4.6 prestate: the core already carries the frontier guard -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;
  -- 0039 MUST be present and INTACT before this splice touches the body.
  v_cnt := (length(v_def) - length(replace(v_def, 'null-defers-to-chain', '')))
           / length('null-defers-to-chain');
  if v_cnt <> 1 then
    raise exception '0040 S4.6 prestate: the 0039 null-defers-to-chain marker appears % times (expected exactly once) -- 0039 is missing or the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'with ordinality', '')))
           / length('with ordinality');
  if v_cnt <> 2 then
    raise exception '0040 S4.6 prestate: "with ordinality" appears % times (expected exactly twice -- 0039''s paired skeleton walk) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_frm := $f$  select st.closing_cents into v_prior from clara.bank_statements st
    where st.bank_account_id = v_acct and st.status = 'live' and st.period_end = v_ps - 1;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.6 prestate: the step-9 prior-edge probe appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := $t$  -- 0040 (C-c, design section 3 "the chain law"; register entry 6; finding 18 [R7/C11]):
  -- THE FRONTIER. A reconciliation claims a first-period exemption exactly once and pins it on
  -- the receipt (prior_statement_id null). Backfilling a statement EARLIER than the account's
  -- earliest complete reconciliation would demote that exemption after the fact: the receipt
  -- would still say "no prior statement existed" while one now does, and the June-first,
  -- April-later ingest would silently make a certified document false. Nothing watched
  -- statement inserts before this line. The refusal is at INGEST, where it is cheap and where
  -- the human still holds the document; the remedy is to void the reconciliation chain back to
  -- the frontier first, then ingest, then re-complete forwards.
  --
  -- Stated as "a complete reconciliation exists whose period_start is later than this
  -- statement's period_end", which is exactly "period_end < the earliest complete recon's
  -- period_start" with no min() to go null on an unreconciled account.
  if exists (select 1 from clara.bank_reconciliations br
             where br.bank_account_id = v_acct and br.firm_id = p_firm
               and br.client_id = p_client and br.status = 'complete'
               and br.period_start > v_pe) then
    raise exception 'this statement ends on % but the account is already reconciled from % onward; void the reconciliation chain back before backfilling an earlier period', v_pe,
      (select min(br.period_start) from clara.bank_reconciliations br
        where br.bank_account_id = v_acct and br.firm_id = p_firm
          and br.client_id = p_client and br.status = 'complete')
      using errcode='CLR10',detail='{"reason":"recon_frontier_backfill"}';
  end if;

  select st.closing_cents into v_prior from clara.bank_statements st
    where st.bank_account_id = v_acct and st.status = 'live' and st.period_end = v_ps - 1;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('recon_frontier_backfill' in v_def) = 0 then
    raise exception '0040 S4.6 postcheck: the frontier splice did not land' using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'null-defers-to-chain', '')))
           / length('null-defers-to-chain');
  if v_cnt <> 1 then
    raise exception '0040 S4.6 postcheck: 0039''s null-defers-to-chain marker count is now % (expected 1) -- this splice disturbed 0039', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, 'with ordinality', '')))
           / length('with ordinality');
  if v_cnt <> 2 then
    raise exception '0040 S4.6 postcheck: "with ordinality" count is now % (expected 2) -- this splice disturbed 0039', v_cnt using errcode='CLR10';
  end if;
  if position('pg_advisory_xact_lock(203005006' in v_def) = 0 then
    raise exception '0040 S4.6 postcheck: the core lost the 203005006 chain lock (0038 tail pin)' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.6 postcheck: _persist_statement_core changed owner' using errcode='CLR10';
  end if;
end $s4_06$;

-- --------------------------------------------------------------------------------------------
-- S4.7 -- clara._subledger_on_approve: TWO EDITS IN ONE RECUT PASS. Register entry 7.
--   (7a) THE DUE-DATE BIRTH STAMP (WCC-R4, design section 4.4; finding 33 [Au17/C12]).
--   (7b) effective_date ON THE BALANCED PAIRS -- the as-of grain the substrate lacked
--        (finding 5 [A5/R4/C9 BLOCKER]). This is NOT optional here: the schema section makes
--        the column NOT NULL after its backfill, so every insert site must supply it in the
--        SAME migration.
-- 0037-born, never recut. 0038's four hits on this name are CALLER-side position() probes on
-- reverse_entry / approve_wrong_client_correction bodies (Au19), so replacing the CALLEE is
-- safe -- and the postcheck re-asserts that both callers still carry their call-site strings.
-- --------------------------------------------------------------------------------------------
do $s4_07$
declare
  v_sig text := 'clara._subledger_on_approve(uuid)';
  v_def text; v_frm text; v_to text; v_cnt int; v_caller text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.7 prestate: clara._subledger_on_approve is GONE' using errcode='CLR10';
  end if;
  -- IDEMPOTENCY. ASSEMBLY FIX (measured on a virgin 0001..0039 chain, not reasoned): the
  -- original probe here tested `due_date`, which is present in the PRE-splice body at
  -- offset 3007 -- inside 0037's own comment "due_date stays null until C-c ships its
  -- producer", which is part of THIS section's own anchor text. The probe therefore fired on
  -- every fresh apply and the migration could never land. The marker must be text only the
  -- POST-splice body can carry: `payment_terms_days` (the 7a producer, which reads the column
  -- 0040 itself adds) and `effective_date` (the 7b stamp). Both measured absent pre-splice.
  if position('payment_terms_days' in v_def) <> 0 or position('effective_date' in v_def) <> 0 then
    raise exception '0040 S4.7 prestate: the hook already reads payment_terms_days or stamps an effective_date -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;
  if position('cross_domain_control_entry' in v_def) = 0
     or position('allocation_stale' in v_def) = 0 then
    raise exception '0040 S4.7 prestate: the hook is missing 0037''s WCA-R9b refusals -- refusing to patch a body this migration cannot account for' using errcode='CLR10';
  end if;

  -- (7a) THE ITEM INSERT.
  v_frm := $f1$    -- (2) THE ITEM. item_date falls back to the entry's posting_date; due_date stays null
    -- until C-c ships its producer.
    v_item := null;
    insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
        item_kind, opening_item_id, reversal_unwind_of, item_date, amount_cents,
        created_in_migration, created_by)
      values (e.firm_id, e.client_id, r.domain, r.counterparty_id, p_entry,
        r.item_kind, r.opening_item_id, r.reversal_unwind_of, e.posting_date, r.amount_cents,
        false, v_actor)$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.7 prestate: the open_items INSERT appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := $t1$    -- (2) THE ITEM. item_date falls back to the entry's posting_date.
    --
    -- 0040 (C-c, WCC-R4 / design section 4.4; register entry 7a): THE DUE-DATE PRODUCER,
    -- STAMPED AT BIRTH. open_items is append-only, so a due date can only ever be a birth
    -- fact: existing items keep an honest null and nothing back-fills them. The producer is
    -- the counterparty's default terms -- `date + integer` gives a date, and a NULL terms
    -- column therefore gives a NULL due_date with no strictness question and no invented
    -- default. A counterparty with no agreed terms has no due date, which is the truth.
    --
    -- SCOPED TO invoice/bill (finding 33 [Au17/C12]). A settlement, a credit note, an
    -- adjustment, an opening item and a reversal unwind are not things that fall due; stamping
    -- them would make every settled receipt read OVERDUE in the aging surface. And per WCC-R3
    -- the due date is an overdue MARKER only -- the aging BUCKETS are driven by item_date, so
    -- nothing about this stamp can move a bucket.
    v_item := null;
    insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
        item_kind, opening_item_id, reversal_unwind_of, item_date, due_date, amount_cents,
        created_in_migration, created_by)
      values (e.firm_id, e.client_id, r.domain, r.counterparty_id, p_entry,
        r.item_kind, r.opening_item_id, r.reversal_unwind_of, e.posting_date,
        case when r.item_kind in ('invoice','bill')
             then e.posting_date + (select cp.payment_terms_days
                                      from clara.counterparties cp
                                     where cp.id = r.counterparty_id)
             end,
        r.amount_cents,
        false, v_actor)$t1$;
  v_def := replace(v_def, v_frm, v_to);

  -- (7b) THE BALANCED PAIR.
  v_frm := $f2$    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (e.firm_id, e.client_id, v_settle_dom, al.item_id, v_group, 'allocate',
        -al.amt, null, v_actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (e.firm_id, e.client_id, v_settle_dom, v_settle, v_group, 'allocate',
        al.amt, null, v_actor);$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.7 prestate: the balanced-pair INSERT block appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := $t2$    -- 0040 (C-c, design section 4.4; register entry 7b; finding 5 [A5/R4/C9 BLOCKER]):
    -- effective_date -- THE AS-OF GRAIN THE SUBSTRATE LACKED. _subledger_outstanding sums every
    -- allocation ever written, so an aging surface asked "what was outstanding on 30 June"
    -- could not answer: allocations carried no business date at all. The anchor for an
    -- ALLOCATION is the settlement entry's own posting_date -- the day the money moved -- so an
    -- as-of read before that date correctly still shows the invoice open.
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (e.firm_id, e.client_id, v_settle_dom, al.item_id, v_group, 'allocate',
        -al.amt, e.posting_date, null, v_actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (e.firm_id, e.client_id, v_settle_dom, v_settle, v_group, 'allocate',
        al.amt, e.posting_date, null, v_actor);$t2$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('payment_terms_days' in v_def) = 0 or position('effective_date' in v_def) = 0
     or position($p$item_kind in ('invoice','bill')$p$ in v_def) = 0
     or position('cross_domain_control_entry' in v_def) = 0
     or position('allocation_stale' in v_def) = 0 then
    raise exception '0040 S4.7 postcheck: the hook splice did not land, or a 0037 refusal was lost' using errcode='CLR10';
  end if;
  -- Au19: the CALLERS' call-site strings must survive this callee replacement untouched.
  -- 0038's four hits on this name are position() probes in these two bodies, not recuts; if a
  -- call edge went missing, an approved reversal would silently stop materialising a subledger
  -- unwind -- the loudest possible failure, checked here rather than discovered on a book.
  select p.prosrc into v_caller from pg_proc p
    where p.oid = 'clara.reverse_entry(uuid,text,text)'::regprocedure;
  if v_caller is null or position('clara._subledger_on_approve' in v_caller) = 0 then
    raise exception '0040 S4.7 postcheck: reverse_entry no longer names clara._subledger_on_approve' using errcode='CLR10';
  end if;
  select p.prosrc into v_caller from pg_proc p
    where p.oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  if v_caller is null or position('clara._subledger_on_approve' in v_caller) = 0 then
    raise exception '0040 S4.7 postcheck: approve_wrong_client_correction no longer names clara._subledger_on_approve' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.7 postcheck: _subledger_on_approve changed owner' using errcode='CLR10';
  end if;
end $s4_07$;

-- --------------------------------------------------------------------------------------------
-- S4.8 -- clara.unallocate_group: effective_date on the negation rows (0037:3191-3197).
-- The house reverse-not-delete precedent, stated in design section 4.4: an unallocation is a
-- CURRENT-PERIOD correction, not a retroactive rewrite -- exactly reverse_entry's current-date
-- mirror. An as-of read of last June must still show what the books said in June.
-- --------------------------------------------------------------------------------------------
do $s4_08$
declare
  v_sig text := 'clara.unallocate_group(uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.8 prestate: clara.unallocate_group is GONE' using errcode='CLR10';
  end if;
  if position('effective_date' in v_def) <> 0 then
    raise exception '0040 S4.8 prestate: unallocate_group already stamps an effective_date -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;
  if position('already_unallocated' in v_def) = 0 then
    raise exception '0040 S4.8 prestate: unallocate_group is missing 0037''s no-double-undo refusal -- refusing to patch a body this migration cannot account for' using errcode='CLR10';
  end if;

  v_frm := $f$  insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
      application_group, operation_kind, reverses_allocation_id, amount_cents, reason,
      created_by)
    select oa.firm_id, oa.client_id, oa.domain, oa.item_id, v_new, 'unallocate', oa.id,
           -oa.amount_cents, v_reason, c.actor
    from clara.open_item_allocations oa
    where oa.application_group = p_group order by oa.id;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.8 prestate: the negation INSERT appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := $t$  -- 0040 (C-c, design section 4.4): effective_date = current_date, NOT the source row's.
  -- An unallocation is the house reverse-not-delete shape: corrected history is NOT
  -- retroactive. Copying the original allocation's effective_date would rewrite what an as-of
  -- read of a CLOSED month reports, which is precisely what reverse_entry's current-date
  -- mirror refuses to do for the GL. The negation is a current-period act and dates itself.
  insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
      application_group, operation_kind, reverses_allocation_id, amount_cents, effective_date,
      reason, created_by)
    select oa.firm_id, oa.client_id, oa.domain, oa.item_id, v_new, 'unallocate', oa.id,
           -oa.amount_cents, current_date, v_reason, c.actor
    from clara.open_item_allocations oa
    where oa.application_group = p_group order by oa.id;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('effective_date' in v_def) = 0 or position('current_date' in v_def) = 0
     or position('already_unallocated' in v_def) = 0 then
    raise exception '0040 S4.8 postcheck: the unallocate_group splice did not land, or a 0037 refusal was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.8 postcheck: unallocate_group changed owner' using errcode='CLR10';
  end if;
end $s4_08$;

-- --------------------------------------------------------------------------------------------
-- S4.9 -- clara.apply_open_items: effective_date on the zero-movement pairs (0037:3384-3389).
--
-- THE CHOICE, MADE EXPLICITLY BECAUSE THE DESIGN DID NOT COVER IT. Design section 4.4's anchor
-- rule reads "allocate/apply = the anchor settlement/adjustment entry's posting_date" -- but
-- apply_open_items HAS NO ENTRY. It is WCA-R3 pair mechanics between two items that already
-- exist, with zero GL movement by construction; there is no posting_date anywhere in its
-- transaction to anchor on. The two candidates were the verb's own act date (current_date) and
-- a derived date from the items (e.g. the later of the two item_dates). current_date is taken,
-- for the same reason unallocate takes it: an application is a HUMAN JUDGEMENT made today
-- about two existing positions, and dating it into a closed month would retroactively change
-- what an as-of read of that month reported. Recorded as an owner-visible decision in the
-- notes, not smuggled.
-- --------------------------------------------------------------------------------------------
do $s4_09$
declare
  v_sig text := 'clara.apply_open_items(uuid,jsonb,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.9 prestate: clara.apply_open_items is GONE' using errcode='CLR10';
  end if;
  if position('effective_date' in v_def) <> 0 then
    raise exception '0040 S4.9 prestate: apply_open_items already stamps an effective_date -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;
  if position('unwind_lineage_mismatch' in v_def) = 0
     or position('cross_counterparty_application' in v_def) = 0 then
    raise exception '0040 S4.9 prestate: apply_open_items is missing 0037''s lineage/teeming-and-lading walls -- refusing to patch a body this migration cannot account for' using errcode='CLR10';
  end if;

  v_frm := $f$    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (si.firm_id, si.client_id, si.domain, al.s, v_group, 'apply', al.amt, v_reason, c.actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (ti.firm_id, ti.client_id, ti.domain, al.t, v_group, 'apply', -al.amt, v_reason, c.actor);$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.9 prestate: the apply pair INSERT block appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := $t$    -- 0040 (C-c, design section 4.4, EXTENDED for the entry-less verb -- see the S4.9 header
    -- for the decision and its reasoning): effective_date = current_date. apply_open_items is
    -- the ONE allocation writer with no GL entry to anchor on (zero-movement pair mechanics,
    -- WCA-R3), so it dates itself by the act, exactly as unallocate does. The consequence,
    -- stated: applying a credit note today against a June invoice moves the outstanding TODAY,
    -- so a June as-of read still shows both positions open -- which is what the books said in
    -- June, and what a customer statement for June must therefore print.
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (si.firm_id, si.client_id, si.domain, al.s, v_group, 'apply', al.amt,
        current_date, v_reason, c.actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, effective_date, reason, created_by)
      values (ti.firm_id, ti.client_id, ti.domain, al.t, v_group, 'apply', -al.amt,
        current_date, v_reason, c.actor);$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('effective_date' in v_def) = 0 or position('current_date' in v_def) = 0
     or position('unwind_lineage_mismatch' in v_def) = 0 then
    raise exception '0040 S4.9 postcheck: the apply_open_items splice did not land, or a 0037 wall was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.9 postcheck: apply_open_items changed owner' using errcode='CLR10';
  end if;
end $s4_09$;

-- --------------------------------------------------------------------------------------------
-- S4.10 -- clara._tf_counterparty_update_0011: the non-merge whitelist widens by
-- payment_terms_days. Register entry 8 (finding 24 [Au2 BLOCKER]).
--
-- The trigger is a POSITIVE column whitelist: any UPDATE touching a column outside v_allowed
-- raises CLR08 'illegal counterparty mutation' (0011:953-955). set_counterparty_terms would
-- therefore be refused outright by the substrate, not by any rule anybody wrote. The MERGE
-- branch (array['merged_into','retired_at','updated_at']) STAYS FROZEN -- a merged counterparty
-- is immutable and terms are not part of a merge.
-- The literal below was verified to occur EXACTLY ONCE tree-wide (0011:951); the exact-count
-- probe is what keeps that true at apply time.
-- --------------------------------------------------------------------------------------------
do $s4_10$
declare
  v_sig text := 'clara._tf_counterparty_update_0011()';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.10 prestate: clara._tf_counterparty_update_0011 is GONE' using errcode='CLR10';
  end if;
  if position('payment_terms_days' in v_def) <> 0 then
    raise exception '0040 S4.10 prestate: the whitelist already admits payment_terms_days -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;

  v_frm := $f$    v_allowed:=array['name','name_normalized','updated_at'];$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.10 prestate: the non-merge whitelist literal appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  -- The merge branch must be present and is NOT touched.
  if position($m$v_allowed:=array['merged_into','retired_at','updated_at'];$m$ in v_def) = 0 then
    raise exception '0040 S4.10 prestate: the merge-branch whitelist is missing -- this is not the 0011 body' using errcode='CLR10';
  end if;

  v_to := $t$    -- 0040 (C-c, design section 4.4; register entry 8; finding 24 [Au2]): payment_terms_days
    -- joins the NON-MERGE whitelist. This trigger is a positive column whitelist, so
    -- set_counterparty_terms was structurally refused by the substrate before this line
    -- existed. The MERGE branch above stays frozen: a merged counterparty is immutable and
    -- terms are not part of a merge.
    v_allowed:=array['name','name_normalized','payment_terms_days','updated_at'];$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('payment_terms_days' in v_def) = 0 then
    raise exception '0040 S4.10 postcheck: the whitelist widening did not land' using errcode='CLR10';
  end if;
  if position($m$v_allowed:=array['merged_into','retired_at','updated_at'];$m$ in v_def) = 0 then
    raise exception '0040 S4.10 postcheck: the merge-branch whitelist was disturbed -- it must stay frozen' using errcode='CLR10';
  end if;
  if position('illegal counterparty mutation' in v_def) = 0 then
    raise exception '0040 S4.10 postcheck: the whitelist refusal itself is gone' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.10 postcheck: _tf_counterparty_update_0011 changed owner' using errcode='CLR10';
  end if;
end $s4_10$;

-- ============================================================================================
-- S4.11 -- RE-KIND TASK RETIREMENT (WCC-R8 ride-along; register entry 9, finding 25 [Au7]).
-- Three parts: the transition arm that makes the write legal, and the two writers that make it.
--
-- THE SILENT-REVERT TRAP, NAMED AND STEPPED AROUND. _tf_processing_task_update is 0011-born and
-- 0038-E2b-RECUT. The obvious 0011 anchor -- new.error_code in ('budget','attempt_cap') --
-- SURVIVES VERBATIM inside the 0038 body (0038:6580), so probing on it would pass against a
-- REVERTED body and this splice would silently undo E2b's lane-scoped gate widening. The
-- prestate anchor is therefore the 0038-ONLY marker: new.lane in
-- ('statement_facts','statement_parse') (0038:6582).
-- ============================================================================================

-- S4.11a -- the transition arm.
do $s4_11a$
declare
  v_sig text := 'clara._tf_processing_task_update()';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.11a prestate: clara._tf_processing_task_update is GONE' using errcode='CLR10';
  end if;
  -- THE 0038-ONLY MARKER, exactly once. Never the 0011 anchor (see the section header).
  v_cnt := (length(v_def) - length(replace(v_def,
             $m$new.lane in ('statement_facts','statement_parse')$m$, '')))
           / length($m$new.lane in ('statement_facts','statement_parse')$m$);
  if v_cnt <> 1 then
    raise exception '0040 S4.11a prestate: the 0038 E2b lane-scoping marker appears % times (expected exactly once) -- the live body is NOT the E2b recut and a splice here would silently revert it', v_cnt
      using errcode='CLR10';
  end if;
  if position('skipped_kind' in v_def) <> 0 then
    raise exception '0040 S4.11a prestate: the transition table already admits skipped_kind -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;

  v_frm := $f$    v_ok:=(old.status='queued' and new.status in ('running','held_egress'))
      or (old.status='queued' and new.status='failed'
          and (new.error_code in ('budget','attempt_cap')
               or (new.error_code in ('consent_inactive','statement_multi_client')
                   and new.lane in ('statement_facts','statement_parse'))))
      or (old.status='held_egress' and new.status='queued')
      or (old.status='running' and new.status in ('done','failed','queued','held_egress'));$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.11a prestate: the transition table appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := $t$    -- 0040 (C-c, WCC-R8 ride-along; register entry 9): RE-KIND RETIREMENT joins the
    -- queued->failed arm, LANE-SCOPED exactly as 0038 E2b scoped its two gate verdicts. A
    -- document's lane is a function of the kind it carried at enqueue; when a human or the
    -- classifier changes the kind, a queued task in a KIND-BOUND lane is work nobody wants --
    -- and it blocks the correct lane's enqueue, because the router's in-flight short-circuit
    -- hands back the stale task. So it is retired to the never-claimed `skipped_kind` receipt
    -- (already in the binding CHECK's allowlist, 0038:7304, and already the router's own idiom
    -- for "this document has nowhere to go"). The scoping is the point: the kind-INDEPENDENT
    -- 'classify' lane can never be retired this way, and no writer can flip a running or
    -- terminal task at all.
    v_ok:=(old.status='queued' and new.status in ('running','held_egress'))
      or (old.status='queued' and new.status='failed'
          and (new.error_code in ('budget','attempt_cap')
               or (new.error_code in ('consent_inactive','statement_multi_client')
                   and new.lane in ('statement_facts','statement_parse'))
               or (new.error_code='skipped_kind'
                   and new.lane in ('invoice_facts','statement_facts','statement_parse'))))
      or (old.status='held_egress' and new.status='queued')
      or (old.status='running' and new.status in ('done','failed','queued','held_egress'));$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('skipped_kind' in v_def) = 0 then
    raise exception '0040 S4.11a postcheck: the re-kind retirement arm did not land' using errcode='CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def,
             $m$new.lane in ('statement_facts','statement_parse')$m$, '')))
           / length($m$new.lane in ('statement_facts','statement_parse')$m$);
  if v_cnt <> 1 then
    raise exception '0040 S4.11a postcheck: the 0038 E2b lane-scoping marker count is now % (expected 1) -- E2b was disturbed', v_cnt using errcode='CLR10';
  end if;
  if position('document processing task identity/config is immutable' in v_def) = 0
     or position('terminal document processing task is immutable' in v_def) = 0 then
    raise exception '0040 S4.11a postcheck: a 0011 immutability arm was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.11a postcheck: _tf_processing_task_update changed owner' using errcode='CLR10';
  end if;
end $s4_11a$;

-- S4.11b -- set_document_kind: the retirement writer (the human half).
do $s4_11b$
declare
  v_sig text := 'clara.set_document_kind(uuid,text,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.11b prestate: clara.set_document_kind is GONE' using errcode='CLR10';
  end if;
  -- The 0038 E7e splice and the 0026 mint scoping must both be present: a body missing either
  -- is not the live body and a recut from it would revert a shipped fix.
  if position('live_bank_statement_present' in v_def) = 0 then
    raise exception '0040 S4.11b prestate: set_document_kind is missing 0038 E7e''s bank-statement refusal -- refusing to patch a body this migration cannot account for' using errcode='CLR10';
  end if;
  if position($q$engine_kind='doc_classify'$q$ in v_def) = 0
     or position('clara-classify-human:v1' in v_def) = 0 then
    raise exception '0040 S4.11b prestate: set_document_kind is missing 0026''s doc_classify-scoped mint or its human engine id' using errcode='CLR10';
  end if;
  if position('skipped_kind' in v_def) <> 0 then
    raise exception '0040 S4.11b prestate: set_document_kind already retires tasks -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;

  v_frm := $f$  v_prior:=d.document_kind;
  update clara.documents set document_kind=p_kind where id=p_document;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.11b prestate: the kind flip appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := v_frm || $t$
  -- 0040 (C-c, WCC-R8 ride-along; register entry 9's other half): RE-KIND TASK RETIREMENT.
  -- The lane a document sits in was chosen from the kind it carried at enqueue. Now that the
  -- kind has changed, a QUEUED task in a kind-bound lane is not merely wasted work -- it is a
  -- BLOCKER: the router's in-flight short-circuit returns that stale task instead of enqueuing
  -- the correct lane, so a mis-classified document that a human corrects never reaches the
  -- lane it belongs in. Retired here, in the same transaction as the flip, with the receipt on
  -- the task trail (the `skipped_kind` idiom the router already uses for "nowhere to go").
  --
  -- THE SCOPE IS AS NARROW AS THE INTENT: only QUEUED tasks (the transition trigger admits
  -- nothing else), only lanes whose kind set NO LONGER admits the new kind, and never the
  -- kind-independent 'classify' lane. A receipt re-kinded to invoice keeps its invoice_facts
  -- task untouched. NO RE-ENQUEUE happens here: minting work is the router's authority, not a
  -- classification verb's -- retiring the blocker is what lets the ordinary enqueue path do
  -- its job on the next fire.
  update clara.document_processing_tasks
    set status='failed', error_code='skipped_kind', finished_at=now()
    where document_id=p_document and status='queued'
      and ((lane='invoice_facts'
            and p_kind not in ('invoice','credit_note','debit_note','receipt'))
        or (lane in ('statement_facts','statement_parse') and p_kind<>'bank_statement'));$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('skipped_kind' in v_def) = 0 then
    raise exception '0040 S4.11b postcheck: the set_document_kind retirement did not land' using errcode='CLR10';
  end if;
  if position('live_bank_statement_present' in v_def) = 0
     or position('CLR28' in v_def) = 0
     or position($q$engine_kind='doc_classify'$q$ in v_def) = 0 then
    raise exception '0040 S4.11b postcheck: a 0038 E7e / 0026 marker was lost from set_document_kind' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.11b postcheck: set_document_kind changed owner' using errcode='CLR10';
  end if;
end $s4_11b$;

-- S4.11c -- classify_document: the retirement writer (the machine half). Placed inside the
-- SAME branch that actually writes the kind -- a low-confidence verdict that sets nothing, and
-- a verdict overridden by human precedence, must retire nothing.
do $s4_11c$
declare
  v_sig text := 'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.11c prestate: clara.classify_document is GONE' using errcode='CLR10';
  end if;
  if position('live_bank_statement_present' in v_def) = 0 then
    raise exception '0040 S4.11c prestate: classify_document is missing 0038 E7e''s bank-statement refusal -- refusing to patch a body this migration cannot account for' using errcode='CLR10';
  end if;
  if position('claim_secret_digest' in v_def) = 0 or position('reserved_engine' in v_def) = 0 then
    raise exception '0040 S4.11c prestate: classify_document is missing 0024''s claim-secret capability check or the reserved-engine refusal' using errcode='CLR10';
  end if;
  if position('skipped_kind' in v_def) <> 0 then
    raise exception '0040 S4.11c prestate: classify_document already retires tasks -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;

  v_frm := $f$    update clara.documents set document_kind=p_kind where id=p_document;
    v_set:=true;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.11c prestate: the confident-verdict kind flip appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := v_frm || $t$
    -- 0040 (C-c, WCC-R8 ride-along; register entry 9's other half): RE-KIND TASK RETIREMENT --
    -- the machine twin of set_document_kind's. It lives INSIDE this branch on purpose: a
    -- low-confidence verdict writes no kind (it opens a question instead) and a verdict beaten
    -- by human precedence writes no kind either, and neither may retire anybody's queued work.
    -- Same narrow scope: queued only, kind-bound lanes only, never 'classify', no re-enqueue.
    update clara.document_processing_tasks
      set status='failed', error_code='skipped_kind', finished_at=now()
      where document_id=p_document and status='queued'
        and ((lane='invoice_facts'
              and p_kind not in ('invoice','credit_note','debit_note','receipt'))
          or (lane in ('statement_facts','statement_parse') and p_kind<>'bank_statement'));$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('skipped_kind' in v_def) = 0 then
    raise exception '0040 S4.11c postcheck: the classify_document retirement did not land' using errcode='CLR10';
  end if;
  if position('live_bank_statement_present' in v_def) = 0
     or position('CLR28' in v_def) = 0
     or position('claim_secret_digest' in v_def) = 0 then
    raise exception '0040 S4.11c postcheck: a 0038 E7e / 0024 marker was lost from classify_document' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.11c postcheck: classify_document changed owner' using errcode='CLR10';
  end if;
end $s4_11c$;

-- --------------------------------------------------------------------------------------------
-- S4.12 -- clara.classify_consent_evidence_document: the kind predicate admits 'other'.
-- Register entry 11 (finding 26 [Au8]).
--
-- WHY THE DOOR IS HERE AND NOT IN classify_document. The consent-evidence correction door was
-- first aimed at classify_document -- which is GRANTED TO clara_runtime (0024:563). Opening it
-- there would have handed the MACHINE the consent-evidence stamp: an authority motion nobody
-- ruled. This verb is already OWNER-floor (0020:708) and already ungranted to every machine
-- role, so relaxing its predicate moves no authority at all. classify_document's and
-- set_document_kind's CLR28 anchors stay UNTOUCHED, which also protects 0038 E7e's splices,
-- which hang off exactly those anchors.
--
-- WHAT RELAXES AND WHAT DOES NOT. The real-world case: a consent letter arrives, the classifier
-- cannot place it and files it as 'other', and the owner is then locked out of stamping it --
-- the ONLY door to a typed egress consent. 'other' is the classifier's own "I could not place
-- this" verdict, so admitting it admits exactly the population this door exists for. Every
-- CODED kind (invoice, bank_statement, receipt, ...) still refuses under the same CLR28 /
-- evidence_kind_conflict shape: you cannot re-label a coded bill as a consent letter.
-- prior_kind is already recorded in this verb's audit row AND in its receipt (0020:741, 745),
-- so the correction is legible without a further edit -- asserted in the postcheck.
-- --------------------------------------------------------------------------------------------
do $s4_12$
declare
  v_sig text := 'clara.classify_consent_evidence_document(uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.12 prestate: clara.classify_consent_evidence_document is GONE' using errcode='CLR10';
  end if;
  if position($q$'other'$q$ in v_def) <> 0 then
    raise exception '0040 S4.12 prestate: the kind predicate already admits ''other'' -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;
  if position($q$clara.role_rank('owner')$q$ in v_def) = 0 then
    raise exception '0040 S4.12 prestate: this verb no longer runs at the OWNER floor -- the door must not be relaxed on a lower floor' using errcode='CLR10';
  end if;

  v_frm := $f$  if d.document_kind is not null and d.document_kind<>'consent_evidence' then
    raise exception 'consent evidence must be an unclassified or consent-evidence document'
      using errcode='CLR28',detail='{"reason":"evidence_kind_conflict"}';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.12 prestate: the kind predicate appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;

  v_to := $t$  -- 0040 (C-c, WCC-R8 ride-along; register entry 11; finding 26 [Au8]): THE CORRECTION
  -- DOOR. 'other' joins the admitted set. It is the classifier's own "I could not place this"
  -- verdict, and a consent letter that landed there was previously locked out of the ONLY path
  -- to a typed egress consent, with no remedy at any floor. Every CODED kind still refuses,
  -- under the identical CLR28 / evidence_kind_conflict shape: a coded bill can never be
  -- re-labelled a consent letter. The floor is unchanged (owner), the grant surface is
  -- unchanged (no machine role holds this verb), and prior_kind is already carried into both
  -- the audit row and the receipt below, so the correction stays legible.
  if d.document_kind is not null
     and d.document_kind not in ('other','consent_evidence') then
    raise exception 'consent evidence must be an unclassified, unplaced (other) or consent-evidence document, not a %', d.document_kind
      using errcode='CLR28',detail='{"reason":"evidence_kind_conflict"}';
  end if;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position($q$'other'$q$ in v_def) = 0
     or position('evidence_kind_conflict' in v_def) = 0
     or position('CLR28' in v_def) = 0 then
    raise exception '0040 S4.12 postcheck: the consent-door relaxation did not land, or the CLR28 refusal shape was lost' using errcode='CLR10';
  end if;
  if position($q$clara.role_rank('owner')$q$ in v_def) = 0 then
    raise exception '0040 S4.12 postcheck: the OWNER floor was disturbed' using errcode='CLR10';
  end if;
  if position('prior_kind' in v_def) = 0 then
    raise exception '0040 S4.12 postcheck: prior_kind is no longer recorded -- the correction would be illegible' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.12 postcheck: classify_consent_evidence_document changed owner' using errcode='CLR10';
  end if;
end $s4_12$;

-- --------------------------------------------------------------------------------------------
-- S4.13 -- clara.request_reextraction: THE STATEMENT SCOPE. Register entry 12 (finding 27
-- [Au9/C15]).
--
-- LINEAGE, CHECKED: the live body is 0026 section G (0026:994-1252) -- 0025's and 0026's recuts,
-- the TOCTOU `for update` on clara.documents, and THREE admission doors
-- ('reextraction' / 'receipt_backfill' / 'filed_bootstrap'). A recut from 0022 or 0025 file text
-- would revert real fixes; the prestate probes below assert every one of those markers before a
-- byte is changed, and the postcheck asserts they survived.
--
-- THE CUT: DELEGATE, NEVER RE-IMPLEMENT. A statement re-fire routes through
-- clara._enqueue_invoice_facts_core -- the E2 router's own enqueue path -- so the typed-consent
-- gate (WCB-R1), the page budget, the OCR attempt cap, the already-completed short-circuit and
-- the in-flight short-circuit are ALL INHERITED. A second hand-rolled enqueue here would
-- inherit none of them: it would buy a vendor read for a client who never authorized one. The
-- three invoice-lane admission doors are left BYTE-UNTOUCHED and are not consulted on this
-- path -- they answer "is there an invoice_facts extraction to supersede", which is not the
-- question a bank statement asks.
-- --------------------------------------------------------------------------------------------
do $s4_13$
declare
  v_sig text := 'clara.request_reextraction(uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_key text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S4.13 prestate: clara.request_reextraction is GONE' using errcode='CLR10';
  end if;
  if position('statement_refire' in v_def) <> 0 then
    raise exception '0040 S4.13 prestate: the statement scope is already installed -- 0040 has already been applied to this database' using errcode='CLR10';
  end if;
  -- THE 0026 LINEAGE, door by door.
  foreach v_key in array array['''reextraction''','''receipt_backfill''','''filed_bootstrap''',
      'where id = p_document for update', 'v_admission'] loop
    if position(v_key in v_def) = 0 then
      raise exception '0040 S4.13 prestate: request_reextraction is missing the 0026 section-G marker % -- the live body is not the 0026 recut and this splice would build on a reverted base', v_key
        using errcode='CLR10';
    end if;
  end loop;

  -- EDIT 1 -- one new local for the router's answer.
  v_frm := $f1$  v_admission text;
begin$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.13 prestate: the declare-block tail appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := $t1$  v_admission text;
  v_router  jsonb;
begin$t1$;
  v_def := replace(v_def, v_frm, v_to);

  -- EDIT 2 -- the statement branch, immediately after the locked document read.
  v_frm := $f2$  select * into d from clara.documents where id = p_document for update;
  if not found or d.firm_id is distinct from c.firm then
    raise exception 'document is not in your firm' using errcode = 'CLR11';
  end if;$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S4.13 prestate: the locked document read appears % times (expected exactly once) -- the body drifted', v_cnt using errcode='CLR10';
  end if;
  v_to := v_frm || $t2$

  -- 0040 (C-c, WCC-R8 ride-along; register entry 12; finding 27 [Au9/C15]): THE STATEMENT
  -- SCOPE. A bank statement is admissible here, and its re-fire is DELEGATED to the E2 router's
  -- own enqueue path rather than re-implemented against the invoice-lane machinery below. That
  -- delegation IS the safety property: the typed-consent gate (WCB-R1), the page budget, the
  -- attempt cap, the already-completed short-circuit and the in-flight short-circuit all live
  -- inside clara._enqueue_invoice_facts_core, and a second enqueue written here would inherit
  -- none of them -- it would buy a vendor read for a client who never authorized one, which is
  -- the single thing the C-b consent design exists to make impossible.
  --
  -- WHAT THE ROUTER WILL SAY, and why each answer is the honest one:
  --   * a statement whose read FAILED (readers_disagree, chain_broken, budget, a gate verdict)
  --     holds no done statement_facts extraction -> it enqueues. This is the case the door
  --     exists for, and today there is no other way back in.
  --   * a statement already INGESTED returns 'already_completed' and buys nothing. The C-b
  --     remedy for a statement read wrong is void_bank_statement + re-ingest (WCB-R5), not a
  --     re-extraction; the receipt names the extraction it found so the human can see why.
  --   * an unauthorized or multi-filed client gets the gate's own terminal receipt, unchanged.
  --
  -- LOCKS: the document row is ALREADY held FOR UPDATE by the read above and the core re-takes
  -- the same lock on the same row -- no new lock, no new order, no new deadlock edge (0026's
  -- own note: documents, then document_processing_tasks).
  if d.document_kind = 'bank_statement' then
    if lower(coalesce(d.mime_type, '')) = 'application/pdf'
       or lower(coalesce(d.mime_type, '')) like 'image/%' then
      v_lane := 'statement_facts';
    elsif lower(coalesce(d.mime_type, '')) in ('text/csv', 'application/csv',
        'application/x-ofx', 'application/ofx') then
      v_lane := 'statement_parse';
    else
      -- An xml or any other mime carrying kind='bank_statement' has no statement parser at
      -- all (the router returns skipped_type for exactly this shape); refusing by the
      -- pre-existing token keeps one answer for one condition.
      raise exception 'this document type has no facts-extraction lane' using errcode = 'CLR16';
    end if;
    v_admission := 'statement_refire';
    -- MEASURED, not guessed: the router returns 'queued' for a fresh insert AND for an
    -- in-flight recovery, so `reused` is answered by looking BEFORE delegating -- it means
    -- "a task in this lane was already in flight when this call arrived".
    v_reused := exists (select 1 from clara.document_processing_tasks pt
      where pt.document_id = p_document and pt.lane = v_lane
        and pt.status in ('queued', 'held_egress', 'running'));
    v_dedupe := clara._reserve_op(c.firm, 'request_reextraction', p_op_key,
      clara._hash(jsonb_build_object('d', p_document, 'r', v_reason)));
    if v_dedupe is not null then return v_dedupe; end if;
    v_router := clara._enqueue_invoice_facts_core(p_document);
    v_task := nullif(v_router->>'task_id', '')::uuid;
    v_status := v_router->>'status';
    select pt.version_n into v_version from clara.document_processing_tasks pt
      where pt.id = v_task;
    perform clara._audit(c.firm, c.actor, null, null, 'request_reextraction', null,
      jsonb_build_object('document_id', p_document, 'lane', v_lane, 'version_n', v_version,
        'task_id', v_task, 'reason', v_reason, 'reused', v_reused, 'status', v_status,
        'admission', v_admission, 'router_reason', v_router->>'reason', 'op_key', p_op_key));
    return clara._finish_op(c.firm, 'request_reextraction', p_op_key,
      jsonb_strip_nulls(jsonb_build_object(
        'task_id', v_task, 'document_id', p_document, 'version_n', v_version,
        'status', v_status, 'reused', v_reused, 'admission', v_admission, 'lane', v_lane,
        'extraction_id', v_router->>'extraction_id', 'reason', v_router->>'reason')));
  end if;$t2$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('statement_refire' in v_def) = 0
     or position('clara._enqueue_invoice_facts_core' in v_def) = 0 then
    raise exception '0040 S4.13 postcheck: the statement scope did not land, or it does not delegate to the router' using errcode='CLR10';
  end if;
  foreach v_key in array array['''reextraction''','''receipt_backfill''','''filed_bootstrap''',
      'where id = p_document for update'] loop
    if position(v_key in v_def) = 0 then
      raise exception '0040 S4.13 postcheck: the 0026 section-G marker % was lost', v_key using errcode='CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S4.13 postcheck: request_reextraction changed owner' using errcode='CLR10';
  end if;
end $s4_13$;

-- ============================================================================================
-- S4.Z -- THE SECTION POSTCHECK. Everything this section touched, re-asserted once, in one
-- place, against the LIVE catalog -- including 0038's OWN content pins on the two overloaded
-- verbs, re-run here under 0038's exact normalisation, so a splice that quietly broke a pin
-- 0038 could no longer catch (it ran before this migration existed) refuses the apply.
-- ============================================================================================
do $s4_z$
declare
  r record; v_oid oid; v_n int; v_a int; v_b int; v_c int; v_d int; v_x text;
  v_map jsonb := '{}'::jsonb; v_key text;
begin
  -- (Z1) EVERY TOUCHED FUNCTION STILL RESOLVES AND IS STILL OWNED BY clara_fn_owner.
  for r in select * from (values
      ('clara.void_bank_statement(uuid,uuid,text,text)'),
      ('clara.unmatch_bank_match(uuid,uuid,text,text)'),
      ('clara.complete_pending_match(uuid,uuid,text)'),
      ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'),
      ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)'),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)'),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)'),
      ('clara.remap_bank_account_coa(uuid,uuid,text,text)'),
      ('clara.deactivate_bank_account(uuid,uuid,text,text)'),
      ('clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'),
      ('clara._subledger_on_approve(uuid)'),
      ('clara.unallocate_group(uuid,uuid,text,text)'),
      ('clara.apply_open_items(uuid,jsonb,text,text)'),
      ('clara._tf_counterparty_update_0011()'),
      ('clara._tf_processing_task_update()'),
      ('clara.set_document_kind(uuid,text,text,text)'),
      ('clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'),
      ('clara.classify_consent_evidence_document(uuid,text,text)'),
      ('clara.request_reextraction(uuid,text,text)')
    ) as t(sig)
  loop
    begin
      v_oid := r.sig::regprocedure;
    exception when others then
      raise exception '0040 S4.Z: % does not resolve to a live function after the splice section', r.sig;
    end;
    if (select p.proowner::regrole::text from pg_proc p where p.oid = v_oid) <> 'clara_fn_owner' then
      raise exception '0040 S4.Z: % is not owned by clara_fn_owner', r.sig;
    end if;
  end loop;

  -- (Z2) THE E1.3 COUNT ASSERTS. Exactly TWO arities each: the 0038 original plus 0040's.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'match_bank_line';
  if v_n <> 2 then
    raise exception '0040 S4.Z: clara.match_bank_line must carry exactly TWO arities (the 0038 6-arg + 0040''s 7-arg), got %', v_n;
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'settle_from_bank_line';
  if v_n <> 2 then
    raise exception '0040 S4.Z: clara.settle_from_bank_line must carry exactly TWO arities (the 0038 12-arg + 0040''s 13-arg), got %', v_n;
  end if;

  -- (Z2b) THE NO-AMBIGUITY PROPERTY, ASSERTED RATHER THAN TRUSTED (see the S4.4 header). The
  -- originals reach 3..6 / 5..12 argument calls through their OWN defaults; the new arities
  -- must take exactly 7 / 13 and nothing else, or a 6-argument dashboard call would match two
  -- candidates after default expansion and resolve to neither.
  for r in select * from (values
      ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)', 0),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)', 0),
      ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)', 3),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)', 7)
    ) as t(sig, want)
  loop
    select p.pronargdefaults into v_n from pg_proc p where p.oid = r.sig::regprocedure;
    if v_n <> r.want then
      raise exception '0040 S4.Z: % declares % defaulted parameter(s), expected % -- the overload pair is no longer unambiguous (see the S4.4 header)', r.sig, v_n, r.want;
    end if;
  end loop;

  -- (Z3) NORMALISE the four match/settle bodies with 0038's own recipe (strip block comments,
  -- strip line comments, collapse whitespace, lowercase) so 0038's pins can be re-run verbatim.
  for r in select * from (values
      ('match',  'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)'),
      ('match7', 'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)'),
      ('settle', 'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text)'),
      ('settle13','clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)')
    ) as t(label,sig)
  loop
    v_map := jsonb_set(v_map, array[r.label], to_jsonb(
      lower(regexp_replace(regexp_replace(regexp_replace(
        pg_get_functiondef(r.sig::regprocedure),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),
        '\s+',' ','g'))));
  end loop;

  -- (Z3a) 0038 pin 10b, re-run against BOTH match arities: journal_entries FOR UPDATE strictly
  -- BEFORE advisory 203005004, then bank_statement_lines strictly after it.
  foreach v_key in array array['match','match7'] loop
    v_a := position('from clara.journal_entries' in (v_map->>v_key));
    v_b := position('pg_advisory_xact_lock(203005004' in (v_map->>v_key));
    v_d := position('clara.bank_statement_lines' in (v_map->>v_key));
    if v_a = 0 or v_b = 0 then
      raise exception '0040 S4.Z: match_bank_line arity % lost its journal_entries lock or its 203005004 rung (je=%, adv=%)', v_key, v_a, v_b;
    end if;
    if v_a >= v_b then
      raise exception '0040 S4.Z: match_bank_line arity % no longer locks journal_entries strictly BEFORE advisory 203005004 -- the 0038 tail pin (design part2 4.9, WCA-R9 invariant 1) is broken', v_key;
    end if;
    v_c := position('for update' in substring((v_map->>v_key) from v_a for 200));
    if v_c = 0 then
      raise exception '0040 S4.Z: match_bank_line arity %''s journal_entries lock is no longer a FOR UPDATE row lock', v_key;
    end if;
    if v_d = 0 or v_d < v_b then
      raise exception '0040 S4.Z: match_bank_line arity % does not lock bank_statement_lines strictly after advisory 203005004 (adv=%, lines=%)', v_key, v_b, v_d;
    end if;
    if position('clara.bank_line_exceptions' in (v_map->>v_key)) = 0
       or position('clara.bank_line_exceptions' in (v_map->>v_key)) < v_d then
      raise exception '0040 S4.Z: match_bank_line arity % does not re-check bank_line_exceptions AFTER its line lock -- the write-skew law (finding 38) is unenforced', v_key;
    end if;
  end loop;

  -- (Z3b) 0038 pin 10c, re-run against BOTH settle arities: no pre-existing entry lock, both
  -- C-a composites called, no advisory rung of its own.
  foreach v_key in array array['settle','settle13'] loop
    v_x := substring((v_map->>v_key) from
      'select \* into [a-z_]+ from clara\.journal_entries where id=[^;]*for update');
    if v_x is not null then
      raise exception '0040 S4.Z: settle_from_bank_line arity % now locks a PRE-EXISTING journal_entries row FOR UPDATE (%) -- the composite invariant is broken', v_key, v_x;
    end if;
    if position('clara.allocate_receipt' in (v_map->>v_key)) = 0
       or position('clara.allocate_payment' in (v_map->>v_key)) = 0 then
      raise exception '0040 S4.Z: settle_from_bank_line arity % no longer delegates to BOTH C-a composites', v_key;
    end if;
    if position('pg_advisory_xact_lock(203005003' in (v_map->>v_key)) <> 0
       or position('pg_advisory_xact_lock(203005004' in (v_map->>v_key)) <> 0 then
      raise exception '0040 S4.Z: settle_from_bank_line arity % takes an advisory rung in its own body -- the nesting deadlock window is re-opened', v_key;
    end if;
    if position('clara.bank_line_exceptions' in (v_map->>v_key)) = 0 then
      raise exception '0040 S4.Z: settle_from_bank_line arity % does not re-check bank_line_exceptions -- the write-skew law (finding 38) is unenforced', v_key;
    end if;
  end loop;

  -- (Z3c) THE RULE SEAM IS REACHABLE, AND ONLY FROM THE NEW ARITIES. The 0038 bodies must keep
  -- hardcoding 'human', null; the 0040 bodies must carry the case expression and the signed-rule
  -- validation. This is what makes "origin='rule' has a writer" a checked fact, not a claim.
  foreach v_key in array array['match','settle'] loop
    if position('p_via_rule' in (v_map->>v_key)) <> 0 then
      raise exception '0040 S4.Z: the 0038 arity % gained p_via_rule -- the original arities must stay rule-free', v_key;
    end if;
  end loop;
  foreach v_key in array array['match7','settle13'] loop
    if position('p_via_rule' in (v_map->>v_key)) = 0
       or position('clara.bank_rules' in (v_map->>v_key)) = 0
       or position('rule_not_signed' in (v_map->>v_key)) = 0
       or position($q$else 'rule' end$q$ in (v_map->>v_key)) = 0 then
      raise exception '0040 S4.Z: the 0040 arity % does not validate a signed rule and set origin=''rule'' -- the engineering pin is still unbuildable', v_key;
    end if;
  end loop;

  -- (Z4) THE ACL POSTURE moved to its own block below -- see the WIKI-LINT SEAM note there.

  -- (Z5) THE MARKER CENSUS. One assert per splice, so a body silently rebuilt by a later
  -- section of this same migration cannot pass.
  for r in select * from (values
      ('clara.void_bank_statement(uuid,uuid,text,text)','recon_present'),
      ('clara.void_bank_statement(uuid,uuid,text,text)','open_exception_present'),
      ('clara.unmatch_bank_match(uuid,uuid,text,text)','recon_period_settled'),
      ('clara.complete_pending_match(uuid,uuid,text)','recon_period_settled'),
      ('clara.remap_bank_account_coa(uuid,uuid,text,text)','recon_present'),
      ('clara.deactivate_bank_account(uuid,uuid,text,text)','recon_present'),
      ('clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)','recon_frontier_backfill'),
      ('clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)','null-defers-to-chain'),
      ('clara._subledger_on_approve(uuid)','due_date'),
      ('clara._subledger_on_approve(uuid)','effective_date'),
      ('clara.unallocate_group(uuid,uuid,text,text)','effective_date'),
      ('clara.apply_open_items(uuid,jsonb,text,text)','effective_date'),
      ('clara._tf_counterparty_update_0011()','payment_terms_days'),
      ('clara._tf_processing_task_update()','skipped_kind'),
      ('clara.set_document_kind(uuid,text,text,text)','skipped_kind'),
      ('clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)','skipped_kind'),
      ('clara.classify_consent_evidence_document(uuid,text,text)','evidence_kind_conflict'),
      ('clara.request_reextraction(uuid,text,text)','statement_refire')
    ) as t(sig,marker)
  loop
    if position(r.marker in pg_get_functiondef(r.sig::regprocedure)) = 0 then
      raise exception '0040 S4.Z marker census: % no longer carries %', r.sig, r.marker;
    end if;
  end loop;
end $s4_z$;

-- WIKI-LINT SEAM (assembly, measured -- scripts/check-wiki-dynamic-sql.mjs). That gate treats
-- any `do` block that calls pg_get_functiondef AND contains an `execute` token as a
-- change-of-record patch, and then scans EVERY quoted literal inside it as if it were an
-- installed statement. A bare privilege literal ('execute', as has_function_privilege demands)
-- therefore reads to the scanner as an EXECUTE with an empty target -- unprovable, fail-closed.
-- The ACL half is split into its OWN block, which calls no pg_get_functiondef and so is not a
-- CoR patch at all. This is a shape change only: every assertion below is unchanged.
do $s4_z_acl$
declare r record; v_key text;
begin
  -- (Z4) THE ACL POSTURE ON THE TWO NEW ARITIES: clara_authenticated only, never PUBLIC, and
  -- never any machine role. These are HUMAN verbs; a rule origin does not make one a machine.
  for r in select * from (values
      ('clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)'),
      ('clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)')
    ) as t(sig)
  loop
    if has_function_privilege('public', r.sig, 'execute') then
      raise exception '0040 S4.Z: % is executable by PUBLIC', r.sig;
    end if;
    if not has_function_privilege('clara_authenticated', r.sig, 'execute') then
      raise exception '0040 S4.Z: % is not granted to clara_authenticated', r.sig;
    end if;
    foreach v_key in array array['clara_runtime','clara_agent_ro'] loop
      if exists (select 1 from pg_roles where rolname = v_key)
         and has_function_privilege(v_key, r.sig, 'execute') then
        raise exception '0040 S4.Z: % is granted to % -- the rule arities are human verbs and take no machine grant', r.sig, v_key;
      end if;
    end loop;
  end loop;
end $s4_z_acl$;

reset role;

-- #####################################################################################
-- ######## SECTION S5 -- REGISTER ENTRY 10: THE SIGHTING CARVE-OUT ####################
-- #####################################################################################

-- ============================================================================================
-- 0040 -- SECTION S5: THE SIGHTING CARVE-OUT on clara._approve_entry_core.
-- Wave C-c design v2.1 section 4.3 (end) + section 5 splice register entry 10;
-- ladder rationale: design-v21-part2.md row 29 (Au11 MAJOR, ACCEPTED).
--
-- THE LAW. A journal draft born from a BANK CODING SUGGESTION is stamped in
-- journal_entries.flags under the key `bank_rule_suggested` (value = the signed bank rule's
-- id). The vendor-rule SIGHTING ACCRUAL inside _approve_entry_core must EXCLUDE such drafts.
-- Without this, three assisted approvals of a bank suggestion mint a `vendor_account` autopost
-- proposal -- a rule breeding a rule out of its OWN output, which is precisely what WA2-R9
-- forbids and what the body's own H2 carve-out already forbids for rule-POSTED approvals. The
-- H2 test (`checked_via_rule_id is null`) cannot see this case: a human really is the checker.
-- This arm applies the SAME law to the rule-SUGGESTED, human-approved case.
--
-- SCOPE, EXACTLY. Only the evidence accrual is withheld. The approval itself, its authority,
-- its receipt, its events, its subledger hook and its audit row are untouched.
--
-- INERT ON ARRIVAL, DELIBERATELY. No writer stamps `bank_rule_suggested` today -- the
-- dashboard lane's census found NO manual generic-draft entry point in the app at all, so the
-- suggestion-to-draft path that will carry the stamp does not exist yet. The carve-out ships
-- NOW so that producer can never land ahead of its own guard. It is future-proof and a no-op
-- until then; the statement is repeated in the installed comment so nobody later reads the
-- absence of writers as evidence the guard is dead code to be removed.
--
-- A PATCH, NEVER A REBUILD. clara._approve_entry_core is the most-spliced function in the
-- system: 0015 created it, 0016 recut it, 0017 SPLICED it dynamically (R1-F1), 0029 and 0035
-- recut it, and 0037 section H.1 recut it again -- the live body. A file-text rebuild from any
-- one of those would silently revert the others. This section therefore follows the house CoR
-- idiom whose canonical shortest form is 0039_statement_balance_null_defers.sql (read whole
-- before this file was written): fetch the LIVE body -> idempotency probe -> pre-existing
-- marker census with EXACT counts -> prestate anchor with an EXACT count -> replace + execute
-- -> postcheck (new marker landed once, every old marker still present at its old count,
-- proowner unchanged).
--
-- WHY THE EXACT-COUNT PRESTATE. replace() rewrites EVERY occurrence, so a drifted body holding
-- two copies of the anchor would take two splices while a position()>0 postcheck stayed green
-- (0036 review F4; restated at 0038:7785-7790 and in 0039). Counted, not merely probed.
--
-- SILENT-REVERT TRAP CLASS, checked by name. The chosen anchor is the sighting-accrual
-- qualification introduced by 0037 section G. It was counted across EVERY migration that ever
-- defined or spliced this function (0009/0011/0015/0016/0017/0027/0028/0036/0037) and occurs
-- in exactly ONE of them (0037), exactly once -- and it occurs exactly ONCE in the live body
-- fetched from a database migrated 0001..0039 from zero. (0027 and 0028 state in their own
-- headers that they do NOT touch this function; verified.)
--
-- ASSEMBLER NOTE ON ROLE. The `set role clara_fn_owner;` / `reset role;` pair below matches
-- 0039's self-contained shape. `reset role` returns to the SESSION role, not to a previous
-- SET ROLE -- so if this fragment is nested INSIDE another section's clara_fn_owner region,
-- DELETE both lines (or place this fragment after that region's own `reset role`). Leaving
-- them nested would silently run the rest of that region as the session role.
-- ============================================================================================

set role clara_fn_owner;

do $s5_10$
declare
  v_sig text := 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  -- (1) THE LIVE BODY. Never file text.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0040 S5 prestate: clara._approve_entry_core is GONE' using errcode='CLR10';
  end if;

  -- (2) IDEMPOTENCY. A re-apply is LOUD, never a double splice.
  if position('bank_rule_suggested' in v_def) <> 0 then
    raise exception '0040 S5 prestate: _approve_entry_core already carries the bank_rule_suggested carve-out -- this splice has already been applied to this database'
      using errcode='CLR10';
  end if;

  -- (2b) PRE-EXISTING MARKER CENSUS, BEFORE the replace. Every marker below was measured on a
  -- database migrated 0001..0039 from zero and is asserted here at its measured count, so a
  -- body that drifted (or that was rebuilt from file text somewhere upstream and lost a prior
  -- splice) refuses BEFORE this section adds anything to it. Lineage is stated honestly:
  --   * opening_entry_k_family_only + the [R1-F1] comment line  -> 0017:233-248, the DYNAMIC
  --     splice (the one a file-text rebuild silently reverts).
  --   * receipt_preheld, bound_extraction, unpinned_rule_post   -> 0029 (the vendor-binding
  --     executor recut: 0029:5 "receipt_preheld only", 0029:43-52 ADV-R3#1/ADV-R4#1). The work
  --     order named these as 0027/0028 markers; 0027 and 0028 in fact state in their own
  --     headers that they never touch this function, and the grep confirms it. The MARKERS are
  --     real and are asserted; only the attributed migration number is corrected.
  --   * settlement_not_autopostable + clara._subledger_on_approve( -> 0037 section H.1.
  --   * no_counterparty_sighting                                   -> 0035 section A.
  --   * the sighting block's own two inserts + the H2 header       -> 0015/0016, carried
  --     through every recut; these are the block THIS section edits.
  for r in select * from (values
      ('opening_entry_k_family_only',                                  1),
      ('[R1-F1] K-family-only lifecycle boundary',                     1),
      ('receipt_preheld',                                              1),
      ('bound_extraction',                                             1),
      ('unpinned_rule_post',                                           1),
      ('settlement_not_autopostable',                                  1),
      ('clara._subledger_on_approve(',                                 1),
      ('no_counterparty_sighting',                                     1),
      ('H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only',       1),
      ('insert into clara.rule_sightings',                             2),
      ('uq_rule_sightings_mapping',                                    2)
    ) as t(marker, want)
  loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0040 S5 prestate: the live _approve_entry_core body carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this section against the live catalog before deploying', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE PRESTATE ANCHOR, EXACT COUNT. This is 0037 section G's sighting-accrual
  -- qualification verbatim. Anchoring on the WHOLE condition (not a fragment of it) makes the
  -- probe double as proof that every pre-existing qualification arm -- counterparty bound,
  -- not a reversal mirror, not rule-posted, not a settlement kind -- is still intact.
  v_frm := $f$  if v_counterparty is not null and e.reversal_of is null and v_checked_via_rule is null
     and (e.coding_kind is null
          or e.coding_kind not in ('customer_receipt','supplier_payment')) then$f$;

  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0040 S5 prestate: the sighting-accrual qualification appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode='CLR10';
  end if;

  -- (4) THE PATCH. One new conjunct on the SAME `if`, so the carve-out gates BOTH the two
  -- rule_sightings inserts AND the >=3 vendor_account auto-proposal loop they feed -- a stamped
  -- draft accrues NOTHING, so it can never enter the v_seen pool either. That is why no second
  -- filter is added to the pool count: an entry with no sighting row is already unreachable
  -- there, and adding a redundant arm would change a live counting predicate for no gain.
  -- Placement is the last conjunct so the cheap, already-proven tests short-circuit first.
  v_to := $t$  if v_counterparty is not null and e.reversal_of is null and v_checked_via_rule is null
     and (e.coding_kind is null
          or e.coding_kind not in ('customer_receipt','supplier_payment'))
     -- 0040 SECTION S5 (design 2.1 section 4.3 / register entry 10): THE SIGHTING CARVE-OUT.
     -- A draft born from a BANK CODING SUGGESTION is stamped in flags under the key
     -- bank_rule_suggested (value = the signed bank rule's id). Such a draft is a rule's own
     -- OUTPUT: letting it accrue sightings would let a bank rule breed a vendor_account
     -- autopost proposal out of three assisted approvals -- rules breeding from rules' output,
     -- exactly what the H2 carve-out above forbids for rule-POSTED approvals (WA2-R9). The H2
     -- test cannot see this case, because the checker really IS a human and the approval really
     -- IS human-authorised -- and it stays so. ONLY the evidence accrual is withheld; nothing
     -- about the approval, its authority, its receipt or its subledger hook changes.
     -- INERT ON ARRIVAL, ON PURPOSE: no writer stamps this key yet (the dashboard census found
     -- no manual generic-draft entry point in the app today). It ships AHEAD of its producer so
     -- the suggestion-to-draft path can never land without its guard already in place. Do not
     -- read the absence of writers as evidence this is dead code.
     -- flags is jsonb NOT NULL default the empty object (0009:851) and ck_je_flags_shape holds
     -- it to an object, so the coalesce is belt-and-braces against a future nullable widening.
     and not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested') then$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- (5) POSTCHECK. Re-fetch from the catalog -- never trust the local string.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

  v_n := (length(v_def) - length(replace(v_def, 'bank_rule_suggested', '')))
         / length('bank_rule_suggested');
  if v_n <> 2 then
    raise exception '0040 S5 postcheck: the bank_rule_suggested stamp name appears % time(s), expected 2 (one in the installed comment, one in the live test)', v_n
      using errcode='CLR10';
  end if;

  v_n := (length(v_def) - length(replace(v_def,
            $g$     and not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested') then$g$, '')))
         / length($g$     and not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested') then$g$);
  if v_n <> 1 then
    raise exception '0040 S5 postcheck: the carve-out conjunct landed % time(s), expected exactly once', v_n
      using errcode='CLR10';
  end if;

  -- The ORIGINAL qualification (ending `)) then`) must now be GONE -- proof the replace took
  -- effect rather than the postcheck passing on an untouched body.
  if position(v_frm in v_def) <> 0 then
    raise exception '0040 S5 postcheck: the pre-patch sighting-accrual qualification is still present -- the splice did not land'
      using errcode='CLR10';
  end if;

  -- Every pre-existing marker still present at its ORIGINAL count. This is the anti-revert
  -- half: it proves the recut carried 0017's dynamic splice, 0029's vendor-binding pins,
  -- 0035's advisory and 0037's hook + settlement refusal through unchanged.
  for r in select * from (values
      ('opening_entry_k_family_only',                                  1),
      ('[R1-F1] K-family-only lifecycle boundary',                     1),
      ('receipt_preheld',                                              1),
      ('bound_extraction',                                             1),
      ('unpinned_rule_post',                                           1),
      ('settlement_not_autopostable',                                  1),
      ('clara._subledger_on_approve(',                                 1),
      ('no_counterparty_sighting',                                     1),
      ('H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only',       1),
      ('insert into clara.rule_sightings',                             2),
      ('uq_rule_sightings_mapping',                                    2)
    ) as t(marker, want)
  loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0040 S5 postcheck: the recut _approve_entry_core lost or duplicated the marker "%" (% time(s), expected %) -- a prior splice was reverted', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;

  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 S5 postcheck: _approve_entry_core changed owner' using errcode='CLR10';
  end if;

  raise notice '0040 S5 OK: the sighting carve-out is installed on clara._approve_entry_core; all 11 pre-existing markers survived at their original counts; owner unchanged';
end $s5_10$;

reset role;


-- =====================================================================================
-- ============================== 0040 UNIFIED TAIL ====================================
-- Everything below runs as the MIGRATION role, after every section has landed. It is the
-- migration's own acceptance evidence: what a correctly-assembled 0040 must be true of.
-- =====================================================================================

-- =====================================================================================
-- TAIL 1 -- THE OBJECT CENSUS (S1's own postcheck block, RELOCATED here per assembly order
-- item 5 and re-cut to the FINAL trigger counts). It was written expecting the world S1 alone
-- leaves behind (recon = 3 triggers, exceptions = 4); S2's two deferred constraint triggers
-- push those to 4 and 5, because CREATE CONSTRAINT TRIGGER produces an ordinary non-internal
-- pg_trigger row. Exact-at-tail, not widened to >= : a census that runs at the END measures
-- the world the migration actually leaves behind, and an exact count is what catches a
-- silently-dropped belt.
-- =====================================================================================
do $postcheck$
declare v_n int; v_forced int; v_trg int;
begin
  -- The three new tables exist, each with RLS FORCED.
  select count(*)::int into v_n from pg_class t join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname in
      ('bank_reconciliations', 'bank_line_exceptions', 'bank_rules');
  if v_n <> 3 then
    raise exception '0040 tail census: expected 3 new relations, found %', v_n;
  end if;
  select count(*)::int into v_forced from pg_class t join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname in
      ('bank_reconciliations', 'bank_line_exceptions', 'bank_rules')
      and t.relrowsecurity and t.relforcerowsecurity;
  if v_forced <> 3 then
    raise exception '0040 tail census: not all 3 new tables carry FORCE ROW LEVEL SECURITY (found %)', v_forced;
  end if;

  -- The two new columns exist with the correct nullability.
  if not exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'counterparties'
        and column_name = 'payment_terms_days' and is_nullable = 'YES') then
    raise exception '0040 tail census: clara.counterparties.payment_terms_days is missing or wrongly not-null';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'open_item_allocations'
        and column_name = 'effective_date' and is_nullable = 'NO') then
    raise exception '0040 tail census: clara.open_item_allocations.effective_date is missing or still nullable';
  end if;

  -- The bank_matches.matched_via_rule_id FK exists and targets bank_rules.
  if not exists (select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'clara' and t.relname = 'bank_matches' and c.conname = 'fk_bank_matches_rule'
        and c.contype = 'f' and c.confrelid = 'clara.bank_rules'::regclass) then
    raise exception '0040 tail census: fk_bank_matches_rule is missing or does not target clara.bank_rules';
  end if;

  -- Lifecycle triggers present on each new table (transition/stamp + no-delete + no-truncate).
  select count(*)::int into v_trg from pg_trigger tg
    join pg_class t on t.oid = tg.tgrelid join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname = 'bank_reconciliations' and not tg.tgisinternal;
  if v_trg <> 4 then
    raise exception '0040 tail census: clara.bank_reconciliations expected 4 triggers (transition/no_delete/no_truncate + S2 t_bank_reconciliations_belt), found %', v_trg;
  end if;
  select count(*)::int into v_trg from pg_trigger tg
    join pg_class t on t.oid = tg.tgrelid join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname = 'bank_line_exceptions' and not tg.tgisinternal;
  if v_trg <> 5 then
    raise exception '0040 tail census: clara.bank_line_exceptions expected 5 triggers (stamp/transition/no_delete/no_truncate + S2 t_bank_line_exceptions_settled_authority), found %', v_trg;
  end if;
  select count(*)::int into v_trg from pg_trigger tg
    join pg_class t on t.oid = tg.tgrelid join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname = 'bank_rules' and not tg.tgisinternal;
  if v_trg <> 3 then
    raise exception '0040 tail census: clara.bank_rules expected 3 triggers (transition/no_delete/no_truncate), found %', v_trg;
  end if;

  -- The seven bank.* event types + their active-taxonomy rows exist.
  select count(*)::int into v_n from clara.event_types where name in (
    'bank.reconciliation_completed', 'bank.reconciliation_voided', 'bank.line_excepted',
    'bank.line_exception_resolved', 'bank.rule_proposed', 'bank.rule_signed', 'bank.rule_retired');
  if v_n <> 7 then
    raise exception '0040 tail census: expected 7 new bank.* event types, found %', v_n;
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
    where tt.event_type in (
      'bank.reconciliation_completed', 'bank.reconciliation_voided', 'bank.line_excepted',
      'bank.line_exception_resolved', 'bank.rule_proposed', 'bank.rule_signed', 'bank.rule_retired')
      and tt.decision = 'ignore';
  if v_n <> 7 then
    raise exception '0040 tail census: expected 7 active-taxonomy rows at decision=ignore for the new bank.* types, found %', v_n;
  end if;

  raise notice '0040 tail census OK: 3 tables (FORCE RLS), 2 columns, 1 FK, 12 triggers (10 lifecycle + 2 C-c belts on these tables), 7 event types + taxonomy rows all present';
end
$postcheck$;

-- =====================================================================================
-- TAIL 2 -- THE IDENTITY CORE'S PROSRC PINS (owed by lane S2, s20-notes SS3.1). These are
-- the properties whose loss would be SILENT: the arithmetic would still run, the receipt
-- would still be written, and the number would be wrong.
-- =====================================================================================
do $tail2$
declare v_src text; v_fn text; v_txt text; v_n int; v_a int; v_b int;
begin
  -- (1) LOCK ORDER in BOTH reconciliation verbs: the client rung 203005004 strictly BEFORE
  -- the per-account chain rung 203005006, and the bank ROW locks strictly after both. 004 is
  -- the true serializer; an inversion is a deadlock edge against every 0038 writer.
  foreach v_fn in array array['clara.complete_bank_reconciliation(uuid,uuid[],text)',
                              'clara.void_bank_reconciliation(uuid,text,text)'] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_src;
    v_a := position('pg_advisory_xact_lock(203005004' in v_src);
    v_b := position('pg_advisory_xact_lock(203005006' in v_src);
    if v_a = 0 or v_b = 0 or v_a >= v_b then
      raise exception '0040 tail: % must take the client rung 203005004 BEFORE the account chain rung 203005006 (004=%, 006=%)', v_fn, v_a, v_b
        using errcode='CLR10';
    end if;
    if position('for share' in v_src) = 0
       or v_b >= position('for share' in v_src) then
      raise exception '0040 tail: % must take its bank row locks (FOR SHARE) AFTER the advisory rungs', v_fn
        using errcode='CLR10';
    end if;
    -- NEITHER verb may lock a pre-existing journal_entries row: 0037 invariant (1) (any verb
    -- that locks an entry must take journal_entries BEFORE advisory 203005004) stays
    -- untouched only while the C-c verbs never lock one at all. The test is coarse on
    -- purpose -- co-presence of the relation name and a FOR UPDATE anywhere in the body is
    -- enough to demand a human re-derivation of the partial order.
    if position('clara.journal_entries' in v_src) > 0 and position('for update' in v_src) > 0 then
      raise exception '0040 tail: % names clara.journal_entries AND takes a FOR UPDATE -- the C-a partial order (0037 invariant 1) must be re-derived before this is allowed', v_fn
        using errcode='CLR10';
    end if;
  end loop;

  -- (2) THE DOUBLE-COUNT PIN. The consumption CTE inside clara._bank_recon_terms must carry
  -- NO line-date predicate: an entry's live-group consumption is its TOTAL, regardless of the
  -- dates of the lines that consumed it. Adding a period predicate there makes every
  -- matched-but-uncleared entry count twice (the delta round's identity-breaking reading,
  -- red-proved as cell D on S2's throwaway). Pinned by the comment marker, by the bitemporal
  -- gate, and by the takeover tie -- three independent tokens, so a partial rewrite trips it.
  select pg_get_functiondef('clara._bank_recon_terms(uuid,timestamptz)'::regprocedure) into v_src;
  if position('REGARDLESS OF LINE DATES' in v_src) = 0
     or position('approved_at <= p_cutoff' in v_src) = 0
     or position('opening_tie_delta_cents' in v_src) = 0 then
    raise exception '0040 tail: clara._bank_recon_terms lost its total-consumption pin, its bitemporal gate, or the takeover tie'
      using errcode='CLR10';
  end if;

  -- (3) EVERY REFUSAL THE DESIGN SS5 TABLE NAMES, present by name in the verb that promises it.
  select pg_get_functiondef('clara.complete_bank_reconciliation(uuid,uuid[],text)'::regprocedure) into v_src;
  foreach v_txt in array array['recon_prior_missing','recon_period_gap','recon_line_unsettled',
      'recon_line_reserved','recon_difference_nonzero','recon_opening_mismatch',
      'recon_outstanding_stale','recon_coa_shared','recon_uncleared_off_account',
      'statement_not_live','recon_already_complete'] loop
    if position(v_txt in v_src) = 0 then
      raise exception '0040 tail: clara.complete_bank_reconciliation is missing refusal %', v_txt using errcode='CLR10';
    end if;
  end loop;
  select pg_get_functiondef('clara.void_bank_reconciliation(uuid,text,text)'::regprocedure) into v_src;
  foreach v_txt in array array['recon_chain_order','recon_already_void','reason_required'] loop
    if position(v_txt in v_src) = 0 then
      raise exception '0040 tail: clara.void_bank_reconciliation is missing refusal %', v_txt using errcode='CLR10';
    end if;
  end loop;

  -- (4) THE BELT SPLIT IS REAL (design SS5: "authority only -- never arithmetic"). The
  -- authority belt must compute NO money and must never reach the derivation.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_tf_bank_settled_authority_belt';
  if v_src is null then
    raise exception '0040 tail: clara._tf_bank_settled_authority_belt does not exist' using errcode='CLR10';
  end if;
  if position('sum(' in lower(v_src)) <> 0 or position('_bank_recon_terms' in v_src) <> 0 then
    raise exception '0040 tail: the settled-authority belt computes money -- it is authority only'
      using errcode='CLR10';
  end if;
  -- ...and it IS where disposition_unbooked is enforced. resolve_bank_line_exception delegates
  -- that law here deliberately (see its own comment): the design's "or in the same txn as the
  -- booking match" arm is only expressible at COMMIT, so if this token ever leaves this belt
  -- the law leaves with it.
  if position('disposition_unbooked' in v_src) = 0 then
    raise exception '0040 tail: the settled-authority belt no longer enforces disposition_unbooked -- resolve_bank_line_exception delegates that law to it and nothing else asserts it'
      using errcode='CLR10';
  end if;

  -- (5) THE BELT CATALOG: four constraint triggers, all DEFERRABLE INITIALLY DEFERRED.
  select count(*)::int into v_n from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and t.tgname in ('t_bank_reconciliations_belt','t_bmlm_settled_authority',
     't_bmem_settled_authority','t_bank_line_exceptions_settled_authority')
     and t.tgdeferrable and t.tginitdeferred;
  if v_n <> 4 then
    raise exception '0040 tail: the four C-c belts are not all present as deferred constraint triggers (got %)', v_n using errcode='CLR10';
  end if;

  -- (6) NO BYPASS HATCH. A belt that reads a GUC is a belt with an off switch.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_tf_bank_recon_belt';
  if position('current_setting' in v_src) <> 0 then
    raise exception '0040 tail: the recon belt reads a GUC -- no bypass hatch may exist' using errcode='CLR10';
  end if;

  -- (7) THE THREE NEW TRANSITION GUARDS still say what they guard (S1's token census anchor).
  foreach v_fn in array array['_tf_bank_reconciliation_transition','_tf_bank_line_exception_transition',
                              '_tf_bank_rule_transition'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=v_fn;
    if v_src is null or position('immutable outside the' in v_src) = 0 then
      raise exception '0040 tail: clara.% is missing or no longer raises its immutable-set refusal', v_fn
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '0040 tail 2 OK: lock order (004 before 006 before the row locks) in both recon verbs, the total-consumption + bitemporal + takeover pins on _bank_recon_terms, every SS5 refusal token, the arithmetic-free authority belt, four deferred belts, no GUC hatch, three transition guards';
end
$tail2$;

-- =====================================================================================
-- TAIL 3 -- ACQUISITION-ORDER PINS ACROSS EVERY LOCK-TAKING VERB 0040 TOUCHES (design SS5:
-- "one x40 cell pins acquisition order in prosrc for ALL five new verbs"; plus S4's T7 for
-- the two 0038 verbs that GAIN the rungs in this migration). One law, one place.
-- =====================================================================================
do $tail3$
declare r record; v_src text; v_a int; v_b int;
begin
  for r in select * from (values
      -- signature                                                   , takes the 006 chain rung?
      ('clara.complete_bank_reconciliation(uuid,uuid[],text)'         , true),
      ('clara.void_bank_reconciliation(uuid,text,text)'               , true),
      ('clara.except_bank_line(uuid,text,text,uuid,text)'             , true),
      ('clara.resolve_bank_line_exception(uuid,text,text,uuid,text)'  , true),
      ('clara.set_counterparty_terms(uuid,int,text)'                  , false),
      -- S4's T7: these two took NO advisory rung before 0040 (0038:2938-2998 / 2810-2858).
      ('clara.remap_bank_account_coa(uuid,uuid,text,text)'            , true),
      ('clara.deactivate_bank_account(uuid,uuid,text,text)'           , true)
    ) as t(sig, needs_chain)
  loop
    select pg_get_functiondef(r.sig::regprocedure) into v_src;
    v_a := position('pg_advisory_xact_lock(203005004' in v_src);
    if v_a = 0 then
      raise exception '0040 tail: % does not take the client rung 203005004', r.sig using errcode='CLR10';
    end if;
    if r.needs_chain then
      v_b := position('pg_advisory_xact_lock(203005006' in v_src);
      if v_b = 0 then
        raise exception '0040 tail: % does not take the per-account chain rung 203005006', r.sig using errcode='CLR10';
      end if;
      if v_a >= v_b then
        raise exception '0040 tail: % takes 203005006 before 203005004 -- the house acquisition order is inverted (004=%, 006=%)', r.sig, v_a, v_b
          using errcode='CLR10';
      end if;
    end if;
  end loop;
  raise notice '0040 tail 3 OK: the 004-before-006 acquisition order pinned in prosrc across all seven lock-taking verbs 0040 creates or re-cuts';
end
$tail3$;

-- =====================================================================================
-- TAIL 4 -- THE WRITER CENSUSES (assembly order item 12; S4's T1/T2/T6; S3's whitelist probe).
-- Each one answers "did the splice reach EVERY writer, and only the right ones?" -- the class
-- of defect a per-splice postcheck structurally cannot see, because it only ever looks at the
-- function it just rewrote.
-- =====================================================================================
do $tail4$
declare
  r record; v_src text; v_writers text[]; v_expected text[]; v_missing text[]; v_extra text[];
  v_n int;
begin
  -- (T1) THE ALLOCATION-WRITER CENSUS -- LOAD-BEARING, because effective_date is NOT NULL.
  -- Every function that inserts into clara.open_item_allocations must name effective_date, and
  -- the set of such functions must be EXACTLY the three the design names. A fourth writer
  -- appearing later without the column is a guaranteed NOT NULL violation on a money path,
  -- discovered by a bookkeeper mid-settlement rather than by this migration.
  select coalesce(array_agg(p.proname order by p.proname), '{}'::text[]) into v_writers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prokind = 'f'
     and position('insert into clara.open_item_allocations' in p.prosrc) > 0;
  v_expected := array['_subledger_on_approve','apply_open_items','unallocate_group'];
  select coalesce(array_agg(x order by x), '{}'::text[]) into v_missing
    from unnest(v_expected) x where x <> all (v_writers);
  select coalesce(array_agg(x order by x), '{}'::text[]) into v_extra
    from unnest(v_writers) x where x <> all (v_expected);
  if array_length(v_missing, 1) is not null then
    raise exception '0040 tail: expected allocation writer(s) % do not insert into clara.open_item_allocations at all -- a splice did not land', array_to_string(v_missing, ', ')
      using errcode='CLR10';
  end if;
  if array_length(v_extra, 1) is not null then
    raise exception '0040 tail: UNEXPECTED allocation writer(s) % -- every writer of clara.open_item_allocations must be named in this census and must stamp effective_date', array_to_string(v_extra, ', ')
      using errcode='CLR10';
  end if;
  for r in select unnest(v_writers) as fn loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname = r.fn and p.prokind = 'f';
    if position('effective_date' in v_src) = 0 then
      raise exception '0040 tail: clara.% inserts into clara.open_item_allocations WITHOUT naming effective_date -- the column is NOT NULL, so this is a guaranteed runtime failure on a money path', r.fn
        using errcode='CLR10';
    end if;
  end loop;

  -- (T2) DUE-DATE SCOPING. The birth stamp must read terms for claims only: a settlement or
  -- adjustment item has nothing to be overdue about, and stamping one would make the aging
  -- report chase the payment that settled the invoice.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_subledger_on_approve';
  if position('item_kind in (''invoice'',''bill'')' in v_src) = 0 then
    raise exception '0040 tail: clara._subledger_on_approve''s due-date birth stamp is not scoped to item_kind in (invoice, bill)'
      using errcode='CLR10';
  end if;

  -- (T6) request_reextraction's statement path routes through the E2 router and did NOT grow
  -- a second enqueue (the typed-consent gate, page budget and attempt cap are INHERITED, never
  -- re-implemented -- WCB-R1).
  select pg_get_functiondef('clara.request_reextraction(uuid,text,text)'::regprocedure) into v_src;
  if position('clara._enqueue_invoice_facts_core' in v_src) = 0 then
    raise exception '0040 tail: request_reextraction''s statement path does not delegate to clara._enqueue_invoice_facts_core -- the consent gate would be re-implemented rather than inherited'
      using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'insert into clara.document_processing_tasks', '')))
         / length('insert into clara.document_processing_tasks');
  if v_n <> 1 then
    raise exception '0040 tail: request_reextraction carries % direct task INSERT(s), expected exactly 1 (0026''s bounded-retry loop) -- the statement path grew its own enqueue', v_n
      using errcode='CLR10';
  end if;

  -- (S3's owed probe) THE COUNTERPARTY WHITELIST WIDENED BY EXACTLY ONE COLUMN. The literal is
  -- asserted whole: a widening that admitted anything else would silently open the merge-safe
  -- column set that 0011 deliberately closed.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_tf_counterparty_update_0011';
  if position('array[''name'',''name_normalized'',''payment_terms_days'',''updated_at'']' in v_src) = 0 then
    raise exception '0040 tail: _tf_counterparty_update_0011''s non-merge whitelist is not exactly (name, name_normalized, payment_terms_days, updated_at) -- set_counterparty_terms would refuse CLR08 on every call'
      using errcode='CLR10';
  end if;
  if position('array[''name'',''name_normalized'',''updated_at'']' in v_src) <> 0 then
    raise exception '0040 tail: _tf_counterparty_update_0011 still carries the PRE-0040 three-column whitelist literal -- the splice did not replace it'
      using errcode='CLR10';
  end if;

  raise notice '0040 tail 4 OK: exactly three allocation writers and all stamp effective_date, the due-date stamp is claim-scoped, request_reextraction delegates to the router with one enqueue, and the counterparty whitelist widened by exactly one column';
end
$tail4$;

-- =====================================================================================
-- TAIL 5 -- THE SIGHTING CARVE-OUT (S5 / splice register entry 10), owed by s50-notes SS5a.
-- The anti-revert half matters most: _approve_entry_core is the most-spliced function in the
-- system, and a change-of-record that dropped a prior splice would be invisible at apply time.
-- =====================================================================================
do $tail5$
declare v_src text; v_n int;
begin
  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
    into v_src;
  v_n := (length(v_src) - length(replace(v_src,'bank_rule_suggested','')))
         / length('bank_rule_suggested');
  if v_n <> 2 then
    raise exception '0040 tail: _approve_entry_core must carry bank_rule_suggested exactly twice (one comment + one live test) -- found %', v_n
      using errcode='CLR10';
  end if;
  if position($x$and not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested') then$x$ in v_src) = 0 then
    raise exception '0040 tail: the S5 carve-out conjunct is missing from _approve_entry_core'
      using errcode='CLR10';
  end if;
  -- ANTI-REVERT: the recut must have carried every prior splice through.
  -- Lineage of this body: 0015 (birth) -> 0016 (CoR) -> 0017 (DYNAMIC splice) -> 0029 (CoR)
  -- -> 0035 (CoR) -> 0037 (CoR, the pre-0040 live body). 0027/0028 never touch it.
  if position('opening_entry_k_family_only' in v_src) = 0        -- 0017 dynamic splice
     or position('receipt_preheld' in v_src) = 0                 -- 0029
     or position('bound_extraction' in v_src) = 0                -- 0029 ADV-R3#1
     or position('unpinned_rule_post' in v_src) = 0              -- 0029 ADV-R4#1
     or position('settlement_not_autopostable' in v_src) = 0     -- 0037 section B
     or position('clara._subledger_on_approve(' in v_src) = 0    -- 0037 section C
     or position('no_counterparty_sighting' in v_src) = 0 then   -- 0035 section A
    raise exception '0040 tail: the S5 recut of _approve_entry_core reverted a prior splice'
      using errcode='CLR10';
  end if;
  -- The sighting block itself is intact (both pools) -- the carve-out WITHHOLDS evidence from
  -- one population, it does not turn accrual off.
  v_n := (length(v_src) - length(replace(v_src,'insert into clara.rule_sightings','')))
         / length('insert into clara.rule_sightings');
  if v_n <> 2 then
    raise exception '0040 tail: _approve_entry_core must still carry BOTH sighting pools (debit + income-credit) -- found %', v_n
      using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p
        where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0040 tail: _approve_entry_core changed owner' using errcode='CLR10';
  end if;
  -- ACL non-leak, the 0016:5064-5072 idiom (a CoR preserves ACL; this proves it did).
  select count(*)::int into v_n
    from pg_proc p cross join lateral aclexplode(p.proacl) a
    join pg_roles r on r.oid = a.grantee
   where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure
     and r.rolname <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '0040 tail: _approve_entry_core leaked % non-owner grant(s)', v_n using errcode='CLR10';
  end if;
  raise notice '0040 tail 5 OK: the sighting carve-out is installed once, every prior splice survived the recut, both sighting pools are intact, owner and ACL unchanged';
end
$tail5$;

-- =====================================================================================
-- TAIL 6 -- THE bank.* PAYLOAD-KEY ALLOWLIST SCAN, extended to C-c's seven event types
-- (design SS4.5: "payloads carry identifiers only"). 0038's own scan ran before these
-- emitters existed, so it can no longer clear them -- this one can.
--
-- MECHANISM (the 0038:9017-9096 idiom, tightened to a POSITIVE key allowlist because the C-c
-- key set is small and fully enumerable): scan every clara function body for a
-- `perform clara._append_event(...)` call whose argument text names a C-c bank type; inside
-- that call's jsonb_build_object payload, every quoted token in a KEY position must appear in
-- the allowlist. domain_events is agent-readable firm-wide -- a description or an account
-- number reaching a payload is a real leak, not a style question.
-- =====================================================================================
do $tail6$
declare
  r record; v_src text; v_calls text[]; v_call text; v_payload text; v_pos int;
  v_keys text[]; v_key text; v_bad text[] := '{}'::text[]; v_sites int := 0;
  v_allowed text[] := array[
    -- reconciliation lifecycle
    'reconciliation_id','statement_id','bank_account_id','prior_reconciliation_id',
    'first_period','outstanding_items','exception_items',
    -- the exception door
    'exception_id','line_id','kind','resolution_disposition','counterpart_line_id',
    -- the rule lifecycle
    'rule_id','client_id','withdrawn'];
begin
  for r in select p.oid, (p.oid::regprocedure)::text as sig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prokind='f' order by p.proname, p.oid
  loop
    begin
      v_src := lower(regexp_replace(regexp_replace(regexp_replace(
        pg_get_functiondef(r.oid),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
    exception when others then
      raise exception '0040 tail: the bank.* payload-key scan could not read the body of % (%) -- a body this scan cannot read is a body it cannot clear, and this assertion fails closed', r.sig, sqlerrm
        using errcode='CLR10';
    end;
    v_calls := array(select (regexp_matches(v_src,
      'perform clara\._append_event\(([^;]*?''bank\.(?:reconciliation_|line_|rule_)[a-z_]+''[^;]*?)\);','g'))[1]);
    if array_length(v_calls,1) is null then continue; end if;
    foreach v_call in array v_calls loop
      v_sites := v_sites + 1;
      v_pos := position('jsonb_build_object(' in v_call);
      if v_pos = 0 then
        raise exception '0040 tail: % emits a C-c bank.* event whose payload is not a jsonb_build_object(...) -- the allowlist scan cannot clear it: %', r.sig, v_call
          using errcode='CLR10';
      end if;
      v_payload := substring(v_call from v_pos + length('jsonb_build_object('));
      -- Every KEY in a jsonb_build_object payload in this codebase is a quoted literal
      -- immediately followed by a comma. Values are variable references (or parenthesised
      -- expressions), never bare quoted literals -- so a quoted-token-then-comma match is the
      -- key set, and any bare literal VALUE that slipped in would be flagged too, which is
      -- exactly what "identifiers only" wants.
      v_keys := array(select (regexp_matches(v_payload, '''([a-z][a-z0-9_]*)'' ?,','g'))[1]);
      if array_length(v_keys,1) is null then
        raise exception '0040 tail: % emits a C-c bank.* event with an unparsable payload key set: %', r.sig, v_payload
          using errcode='CLR10';
      end if;
      foreach v_key in array v_keys loop
        if v_key <> all (v_allowed) then
          v_bad := v_bad || (r.sig || ': ' || v_key);
        end if;
      end loop;
      -- The blocklist half, kept from 0038's own scan: these are the columns/params whose
      -- presence anywhere in a payload construction is a leak regardless of key naming.
      foreach v_key in array array['account_number','account_number_normalized','account_printed',
          'account_digits','description','bank_name_display','p_memo','p_reason','p_note',
          'v_reason','v_note','retired_reason','resolution_note','voided_reason'] loop
        if v_payload ~ ('\m' || v_key || '\M') then
          v_bad := v_bad || (r.sig || ': sensitive token ' || v_key);
        end if;
      end loop;
    end loop;
  end loop;
  if v_sites <> 7 then
    raise exception '0040 tail: the payload-key scan found % C-c bank.* _append_event call site(s), expected exactly 7 (one per event type in design SS4.5)', v_sites
      using errcode='CLR10';
  end if;
  if array_length(v_bad,1) is not null then
    raise exception '0040 tail: C-c bank.* event payload(s) carry key(s)/token(s) outside the identifiers-only allowlist -- domain_events is agent-readable firm-wide -- %', array_to_string(v_bad, ' | ')
      using errcode='CLR10';
  end if;
  raise notice '0040 tail 6 OK: all 7 C-c bank.* event payloads carry identifiers, counts and enum tokens only';
end
$tail6$;

-- =====================================================================================
-- TAIL 7 -- THE GRANT MATRIX + THE ACL LEAK SCAN over everything 0040 creates or re-cuts.
-- The four structural invariants live or die here: a single stray grant to a machine role
-- turns a human verb into an agent capability.
-- =====================================================================================
do $tail7$
declare
  v_role text; v_n int;
  v_tables text[] := array['bank_reconciliations','bank_line_exceptions','bank_rules'];
  v_tbl text;
  -- Every function 0040 exposes to the human lane, by exact signature.
  v_human_fns text[] := array[
    'clara.complete_bank_reconciliation(uuid,uuid[],text)',
    'clara.void_bank_reconciliation(uuid,text,text)',
    'clara.except_bank_line(uuid,text,text,uuid,text)',
    'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)',
    'clara.propose_bank_rule(uuid,text,jsonb,jsonb,text)',
    'clara.sign_bank_rule(uuid,text)',
    'clara.retire_bank_rule(uuid,text,text)',
    'clara.set_counterparty_terms(uuid,int,text)',
    'clara.ar_aging(uuid,date,uuid)','clara.ap_aging(uuid,date,uuid)',
    'clara.customer_statement(uuid,uuid,date,date)',
    'clara.supplier_statement(uuid,uuid,date,date)',
    'clara.list_unmatched_lines(uuid)','clara.get_bank_reconciliation(uuid)',
    'clara.list_bank_line_suggestions(uuid)','clara.list_bank_rule_candidates(uuid)',
    'clara.list_bank_rules(uuid)',
    -- S4's T4: the two NEW overloads join the sweep by exact signature.
    'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,uuid)',
    'clara.settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)'];
  -- Internal helpers: owner-only, granted to NOBODY.
  v_internal_fns text[] := array[
    'clara._bank_recon_terms(uuid,timestamptz)',
    'clara._tf_bank_recon_belt()','clara._tf_bank_settled_authority_belt()',
    'clara._subledger_outstanding_asof(uuid,date)',
    'clara._bank_rule_pattern_norm(jsonb)','clara._bank_rule_sightings(uuid,text,jsonb)',
    'clara._bank_desc_word_match(text,text[])','clara._bank_rule_regex_escape(text)',
    'clara._bank_line_class_hint(text)','clara._aging_core(uuid,uuid,text,date)',
    'clara._statement_core(uuid,uuid,text,uuid,date,date)'];
  v_fn text;
  v_machine_roles text[] := array['clara_agent_ro','clara_runtime','clara_wake_interactive',
                                  'clara_wake_proactive'];
begin
  -- (1) THE THREE NEW TABLES: clara_authenticated holds SELECT and nothing else; every machine
  -- role holds NOTHING (design SS10: zero agent grants on every new table).
  foreach v_tbl in array v_tables loop
    select count(*)::int into v_n from information_schema.role_table_grants g
     where g.table_schema='clara' and g.table_name=v_tbl and g.grantee='clara_authenticated'
       and g.privilege_type <> 'SELECT';
    if v_n <> 0 then
      raise exception '0040 tail: clara_authenticated holds % non-SELECT privilege(s) on clara.% -- the human lane reads these tables and writes them ONLY through the audited verbs', v_n, v_tbl
        using errcode='CLR10';
    end if;
    if not has_table_privilege('clara_authenticated', 'clara.'||v_tbl, 'SELECT') then
      raise exception '0040 tail: clara_authenticated cannot SELECT clara.% -- the /bank pane cannot render', v_tbl
        using errcode='CLR10';
    end if;
    foreach v_role in array v_machine_roles loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        select count(*)::int into v_n from information_schema.role_table_grants g
         where g.table_schema='clara' and g.table_name=v_tbl and g.grantee=v_role;
        if v_n <> 0 then
          raise exception '0040 tail: % holds % grant(s) on clara.% -- WCA-R1''s zero-agent-grant law is broken', v_role, v_n, v_tbl
            using errcode='CLR10';
        end if;
      end if;
    end loop;
    -- FORCE RLS, re-asserted here because a grant is only a wall when RLS is forced.
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='clara' and c.relname=v_tbl
                     and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception '0040 tail: clara.% does not carry FORCE ROW LEVEL SECURITY', v_tbl
        using errcode='CLR10';
    end if;
  end loop;

  -- (2) THE HUMAN FUNCTIONS: EXECUTE to clara_authenticated, to nobody else, never to PUBLIC.
  foreach v_fn in array v_human_fns loop
    if not has_function_privilege('clara_authenticated', v_fn, 'EXECUTE') then
      raise exception '0040 tail: % is not EXECUTE-granted to clara_authenticated', v_fn using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_fn, 'EXECUTE') then
      raise exception '0040 tail: % is EXECUTE-granted to PUBLIC -- the wall is broken', v_fn using errcode='CLR10';
    end if;
    foreach v_role in array v_machine_roles loop
      if exists (select 1 from pg_roles where rolname = v_role)
         and has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception '0040 tail: % is EXECUTE-granted to % -- no machine path may reach a C-c human verb', v_fn, v_role
          using errcode='CLR10';
      end if;
    end loop;
    if (select p.proowner::regrole::text from pg_proc p where p.oid = v_fn::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0040 tail: % is not owned by clara_fn_owner', v_fn using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE INTERNAL HELPERS: owner only. Every caller is itself a SECURITY DEFINER function
  -- owned by clara_fn_owner, so nothing else ever needs EXECUTE.
  foreach v_fn in array v_internal_fns loop
    select count(*)::int into v_n
      from pg_proc p cross join lateral aclexplode(p.proacl) a
      join pg_roles rr on rr.oid = a.grantee
     where p.oid = v_fn::regprocedure and rr.rolname <> 'clara_fn_owner';
    if v_n <> 0 then
      raise exception '0040 tail: internal helper % leaked % non-owner grant(s)', v_fn, v_n using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_fn, 'EXECUTE') then
      raise exception '0040 tail: internal helper % is EXECUTE-granted to PUBLIC', v_fn using errcode='CLR10';
    end if;
  end loop;

  -- (4) NO WAKE ALLOWLIST ROW for anything C-c ships. The agent never reconciles a month.
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='clara' and c.relname='wake_fn_allowlist') then
    execute $q$select count(*)::int from clara.wake_fn_allowlist w
              where w.fn_name like '%bank_reconciliation%' or w.fn_name like '%bank_line%'
                 or w.fn_name like '%bank_rule%' or w.fn_name like '%counterparty_terms%'
                 or w.fn_name like '%aging%'$q$ into v_n;
    if v_n <> 0 then
      raise exception '0040 tail: % wake-allowlist row(s) name a C-c function -- the agent never reconciles, excepts, signs a rule or sets terms', v_n
        using errcode='CLR10';
    end if;
  end if;

  raise notice '0040 tail 7 OK: three tables SELECT-only to the human lane under FORCE RLS with zero machine grants; 19 human functions clara_authenticated-only and owner-correct; 11 internal helpers owner-only; no wake-allowlist row';
end
$tail7$;

do $tail_final$
begin
  raise notice '0040 wave C-c tie-out: APPLIED. Sections S1 (schema) + S2 (identity core) + EVENTS + S3 (doors/rules/reads) + S4 (12 splices) + S5 (sighting carve-out) + 7 tail blocks, all green.';
end
$tail_final$;
