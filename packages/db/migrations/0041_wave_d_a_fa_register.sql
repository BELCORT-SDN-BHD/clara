-- 0041_wave_d_a_fa_register.sql -- WAVE D-a: the FIXED-ASSET REGISTER slice. Acquisition
-- soft-births a register row inside the approving transaction (WD-R1); an admin+-signed
-- per-client depreciation authority lets a leader-loop sweep post cadence-aware charges as
-- FLAGS-BORNE PROPOSALS whose ledger rows, run receipt and events are materialised by the
-- approve-time hook -- ONE materialisation moment, so a draft that dies leaves nothing.
-- Disposal (full and the cost-portion supersede split) is proposal-shaped for the same
-- reason. The register ties to the GL by an EFFECTIVE-DATED as-of assertion; incompleteness
-- is visible, never blocking.
--
-- DESIGN OF RECORD: docs/plan/wave-d-a-fa-design.md v2.1 (cited below as SS1.1/SS2.2/SS3.1/
-- SS4.3/SS5/SS6/SS9) + its part-2 ladder record (cited as [L2/<row>]). Governing law above
-- the design: docs/plan/wave-d-contract.md (WD-R1..WD-R15, ADR-055) and its SS3 verified-trap
-- table. On conflict the contract governs for Wave D; docs/prd/PRD.md SS6 (LAW) governs always.
--
-- SHAPE OF THIS FILE (one transaction, applied by packages/db/scripts/migrate.mjs):
--   SECTION 0    -- SS0 live probes (plain migration role): frontier, negative pre-state on
--                   every relation/column/constraint/event-name this file creates, and
--                   positive anchor probes on every prior object the file depends on.
--   SECTION S1   -- (set role clara_fn_owner) SCHEMA: the clara.fixed_assets alters + the
--                   derived-completeness helper + the immutability transition-table recut,
--                   the four new relations (fa_account_profiles, fa_depreciation,
--                   fa_depreciation_authorities, fa_depreciation_runs) with FORCE RLS/ACL and
--                   their lifecycle belts, the journal_entries.origin widening, and the
--                   clara.clients FY-end columns.
--   (reset role) -- the fn-owner region closes so event registration runs as the MIGRATION
--                   role (the 0038:8413-8423 / 0040:2769-2776 ROLE NOTE precedent).
--   SECTION EVENTS -- asset.acquired / asset.depreciated / asset.disposed + trigger_taxonomy
--                   rows at the ACTIVE version, decision 'ignore' (the /assets read RPCs
--                   surface these directly -- the 0040 bank-kind reasoning). Placed BEFORE
--                   SECTION S2 because S2's emitters name them.
--   SECTION S2   -- (set role clara_fn_owner) the register core: internal helpers, the
--                   acquisition/depreciation/disposal APPROVE-TIME HOOK (clara._fa_on_approve)
--                   and the deferred SS2.4 belt on clara.journal_entries.
--   SECTION S3   -- the human + machine verbs (enrolment, particulars, FY end, the authority
--                   family, the depreciation arithmetic and its two run verbs, disposal).
--   SECTION READS -- the /assets read RPCs incl. fa_register_tie, then the bulk grant loop.
--   SECTION S4   -- the ELEVEN change-of-record splices on live bodies (the hook splice, the
--                   AF-1 guard x2, the reverse_entry MYT date, _draft_opening_item_core's
--                   four-part recut, _assert_fa_baseline, revise_entry, upsert_account,
--                   list_review_queue, and reverse_entry's VERB-SIDE FA wall [round-3 F6],
--                   which is why reverse_entry appears twice -- plus [round-3.5 fold G3] the
--                   K6 writer clara.approve_opening_correction, which stamps superseded_at).
--   TAIL         -- thirteen independent census blocks (objects, transition table, marker
--                   lineage, four-caller re-pin, single-writer censuses, event payload
--                   allowlist, grants/ACL leak scan, the zero-NULL-superseded_at census and
--                   the reservation-predicate + leaf-lock-order census) + the final notice.
--
-- ASSEMBLY ADJUDICATIONS APPLIED (binding; each resolves a point the design left to the build):
--   1. NEW CLR ERRCODES. The family runs CLR01..CLR36 today (CLR99 is the reserved
--      probe-rollback sentinel), so this file claims the next CONTIGUOUS block CLR37..CLR40:
--        CLR37 -- register identity: enrolment validation, particulars completion/revision,
--                 lifecycle-advanced hand-off, enrolled-account deactivation.
--        CLR38 -- the depreciation authority + run sequencing family.
--        CLR39 -- disposal + the dependency-ordered reversal refusals.
--        CLR40 -- the SS2.4 belt family (unregistered movement, K gl_balance, cost adjustment).
--      Two D-a refusals deliberately do NOT take a new code: the AF-1 guard rides CLR10
--      (it lives inside the allocation loops beside eleven sibling CLR10 refusals -- a new
--      code there would split one lane's error contract in half), and the K6 same-item
--      hand-off refusal rides CLR31 (the opening-seed family owns that whole surface).
--      Tests assert REASON TOKENS + message text, never bare SQLSTATE (pin sheet SS4).
--   2. REGISTER-ROW MUTABILITY OF A SUCCESSOR. SS4.3/SS2.3 successors carry
--      acquisition_line_id AND acquisition_entry_id NULL, which would make the 0017
--      immutability trigger's `approved` test vacuous for exactly the rows the split creates.
--      The recut therefore treats "acquisition_entry_id is null and supersedes_asset_id is
--      not null" as approved-by-construction (a successor is only ever born by an approved
--      governing entry). Stated because the design's transition table assumes it silently.
--   3. THE PER-MONTH SL TERMINATION. SS3.1 states floor monthly + "the final month charges
--      cost - residual - Accumulated exactly", and SS2.3 states the MONEY clock is
--      authoritative on carry-down divergence. Implemented as one rule: the remaining months
--      are least(money clock, date clock) while the date clock has months left, and the money
--      clock ALONE once the date clock is exhausted; the month whose remaining-count reaches
--      one charges the exact remainder. This is stable under re-evaluation each run (a naive
--      "cap by life" recomputes a moving schedule end -- checked and rejected).
--   4. ONE CHARGE ROW PER CONTIGUOUS UNCHARGED RUN. SS1.3's ledger rows "record the exact
--      sub-range charged" and the proposal is an ARRAY, so a catch-up whose uncharged months
--      are non-contiguous (an unwound middle month) emits one row per contiguous block rather
--      than one row spanning a live charge -- which is what makes the SS1.3 overlap refusal
--      unreachable by the run verb's own output.
--   5. `upsert_account`'s SS5.6 refusal. There is NO deactivation door on coa_accounts today
--      (upsert_account's ON CONFLICT sets is_active=true unconditionally and no other writer
--      sets it false), so the guard is written over the RESULTING row -- it refuses a re-type
--      or re-class that would unfit an actively-enrolled account (reachable today) and a
--      deactivation (a forward guard, structurally unreachable until a door exists). Both ride
--      the pinned token fa_enrolled_account_deactivation. Recorded as a named deviation.
--   6. THE QUEUE ROW'S asset_id. list_review_queue's six existing CTEs share one column
--      vector; rather than widen all six (six independent drift surfaces), the new
--      fixed_asset_incomplete row carries the asset id in the shared `id` column and the row
--      json projects 'asset_id' from it under a row_kind test. Same wire shape the pin sheet
--      names, one splice instead of seven.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law); the SECTION 0 frontier probe below
-- pins 0040_wave_c_c_tieout as the applied predecessor.

-- #####################################################################################
-- ####################### SECTION 0 -- THE PRE-DDL LIVE PROBES ########################
-- #####################################################################################
-- One probe = one named failure mode with a remedy in its text. Negative probes guard a
-- partial/duplicate re-apply; positive anchor probes reconfirm -- against pg_class /
-- pg_constraint / information_schema, never against the design's prose -- every prior object
-- this file's FKs, splices and censuses depend on. Runs BEFORE `set role clara_fn_owner`.

do $probe$
declare
  v_n int; v_names text; v_def text; v_ver int;
begin
  -- PROBE 1 -- FRONTIER ASSERT.
  select count(*)::int into v_n from clara.schema_migrations
    where version = '0040_wave_c_c_tieout';
  if v_n <> 1 then
    raise exception '0041 probe 1: migration 0040_wave_c_c_tieout is not recorded as applied -- apply in order';
  end if;

  -- PROBE 2 -- PRE-STATE SAFETY: none of the four relations this file creates already exist.
  select count(*)::int, string_agg(t.relname, ', ' order by t.relname) into v_n, v_names
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'clara' and t.relname in
    ('fa_account_profiles', 'fa_depreciation', 'fa_depreciation_authorities', 'fa_depreciation_runs');
  if v_n <> 0 then
    raise exception '0041 probe 2: % relation(s) already exist in schema clara that this migration is about to create (%) -- this looks like a partial or duplicate re-apply, not a fresh deploy', v_n, v_names;
  end if;

  -- PROBE 3 -- PRE-STATE SAFETY: none of the new columns exist yet (fixed_assets x8,
  -- clients x2).
  select count(*)::int, string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
    into v_n, v_names
  from information_schema.columns
  where table_schema = 'clara'
    and ((table_name = 'fixed_assets' and column_name in
           ('depreciation_rate_bps', 'acquisition_line_id', 'disposal_entry_id',
            'superseded_at', 'effective_from', 'ca_class', 'is_commercial_vehicle', 'is_new'))
      or (table_name = 'clients' and column_name in ('fy_end_month', 'fy_end_day')));
  if v_n <> 0 then
    raise exception '0041 probe 3: % column(s) this migration adds already exist (%) -- partial or duplicate re-apply', v_n, v_names;
  end if;

  -- PROBE 4 -- ANCHOR: clara.fixed_assets carries the exact Phase-3/0017 shape this file
  -- alters (the eight columns the hook, the arithmetic and the tie read by name).
  select count(*)::int into v_n from information_schema.columns
  where table_schema = 'clara' and table_name = 'fixed_assets'
    and column_name in ('cost_cents','residual_cents','useful_life_months','depreciation_method',
      'asset_account_code','accum_depr_account_code','depr_expense_account_code',
      'accumulated_depreciation_cents','depreciation_start_date','baseline_as_of',
      'acquisition_entry_id','superseded_by_asset_id','supersedes_asset_id','status');
  if v_n <> 14 then
    raise exception '0041 probe 4: clara.fixed_assets is missing one of the 14 columns this migration builds on (found %) -- the 0003/0017 baseline drifted', v_n;
  end if;

  -- PROBE 5 -- ANCHOR: the CHECK constraints this file REPLACES exist under their live names.
  -- fixed_assets_depreciation_method_check is the single-value CHECK (WD-R3 widens it);
  -- fixed_assets_status_check_0017 is the four-value status CHECK ('unwound' joins it);
  -- journal_entries_origin_check is the four-value origin CHECK ('scheduled_run' joins it).
  select count(*)::int into v_n from pg_constraint
  where conname in ('fixed_assets_depreciation_method_check', 'fixed_assets_status_check_0017',
                    'journal_entries_origin_check')
    and conrelid in ('clara.fixed_assets'::regclass, 'clara.journal_entries'::regclass);
  if v_n <> 3 then
    raise exception '0041 probe 5: expected the 3 CHECK constraints this migration replaces (method/status/origin), found % -- re-derive the alters against the live catalog', v_n;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.journal_entries'::regclass and conname = 'journal_entries_origin_check';
  if position('scheduled_run' in v_def) <> 0 then
    raise exception '0041 probe 5b: journal_entries_origin_check already admits scheduled_run -- duplicate re-apply';
  end if;
  if position('reversal' in v_def) = 0 or position('manual' in v_def) = 0 then
    raise exception '0041 probe 5b: journal_entries_origin_check is not the expected manual|document|agent|reversal shape (%)', v_def;
  end if;

  -- PROBE 6 -- ANCHOR: the immutability trigger and its function are live under their 0017
  -- names (SECTION S1 recuts the function through the catalog, not from file text).
  if to_regprocedure('clara._tf_fixed_assets_immutable_0017()') is null then
    raise exception '0041 probe 6: clara._tf_fixed_assets_immutable_0017 is GONE -- the SS1.1 transition-table recut has no subject';
  end if;
  select count(*)::int into v_n from pg_trigger
    where tgrelid = 'clara.fixed_assets'::regclass and tgname = 't_fixed_assets_immutable_0017';
  if v_n <> 1 then
    raise exception '0041 probe 6b: t_fixed_assets_immutable_0017 is not installed on clara.fixed_assets (found %)', v_n;
  end if;

  -- PROBE 7 -- ANCHOR: every live body SECTION S4 splices is present at its exact signature.
  -- A missing one here is a far better error than a regprocedure cast failing mid-splice.
  foreach v_names in array array[
      'clara._subledger_on_approve(uuid)',
      'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.reverse_entry(uuid,text,text)',
      'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
      'clara._assert_fa_baseline(uuid)',
      'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
      'clara.upsert_account(uuid,text,text,text,text,text,text)',
      'clara.list_review_queue(jsonb,jsonb,integer)',
      'clara.approve_opening_correction(uuid,jsonb,text,text)',
      'clara._assert_bank_coa_candidate(uuid,text)',
      'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'] loop
    if to_regprocedure(v_names) is null then
      raise exception '0041 probe 7: % is not present at that exact signature -- SECTION S4 cannot splice it', v_names;
    end if;
  end loop;

  -- PROBE 8 -- PRE-STATE SAFETY: none of the three asset.* event names are registered yet.
  select count(*)::int, string_agg(name, ', ' order by name) into v_n, v_names
    from clara.event_types where name in ('asset.acquired', 'asset.depreciated', 'asset.disposed');
  if v_n <> 0 then
    raise exception '0041 probe 8: % event type(s) already registered that this migration adds (%) -- partial or duplicate re-apply', v_n, v_names;
  end if;

  -- PROBE 9 -- ANCHOR: exactly one ACTIVE taxonomy version exists and the three new rows will
  -- attach to it (the 0040:2788-2811 idiom cross-joins clara.taxonomy_active).
  select count(*)::int into v_n from clara.taxonomy_active;
  if v_n <> 1 then
    raise exception '0041 probe 9: clara.taxonomy_active must hold exactly one row (found %)', v_n;
  end if;
  select version into v_ver from clara.taxonomy_active;
  if v_ver is null then
    raise exception '0041 probe 9b: clara.taxonomy_active carries no version';
  end if;

  -- PROBE 10 -- ANCHOR: the tenancy anchors this file's composite FKs target.
  select count(*)::int into v_n from pg_constraint
    where conname in ('uq_clients_id_firm', 'uq_coa_accounts_client_code')
      and contype in ('u','p');
  if not exists (select 1 from pg_constraint
                 where conrelid = 'clara.clients'::regclass and conname = 'uq_clients_id_firm') then
    raise exception '0041 probe 10: clara.clients is missing uq_clients_id_firm -- the (client_id, firm_id) FK anchor';
  end if;
  if not exists (select 1 from pg_constraint c
                 where c.conrelid = 'clara.coa_accounts'::regclass and c.contype in ('p','u')
                   and pg_get_constraintdef(c.oid) like '%(client_id, account_code)%') then
    raise exception '0041 probe 10b: clara.coa_accounts has no (client_id, account_code) unique/pk -- the profile FK anchor';
  end if;

  -- PROBE 11 -- NAMED LIVE-DATA ASSUMPTION, RECONFIRMED. SS1.1 widens depreciation_method to
  -- NULLABLE and DROPs its default; the belt and the register reads assume every EXISTING
  -- fixed_assets row is a K-family carry-down row (straight_line, an acquisition entry, no
  -- D-a lineage). A row that is not would silently change meaning under the widened CHECK.
  select count(*)::int into v_n from clara.fixed_assets
    where depreciation_method is distinct from 'straight_line' or acquisition_entry_id is null;
  if v_n <> 0 then
    raise exception '0041 probe 11: % existing fixed_assets row(s) are not straight_line-with-acquisition-entry -- re-derive SS1.1 against this data before widening the method CHECK', v_n;
  end if;

  -- PROBE 12 -- ANCHOR: the four approve paths still funnel through _subledger_on_approve at
  -- the count the 0037 tail pinned. The 0041 tail RE-PINS this at the same number after the
  -- SS2.1 splice; measuring it here first makes the tail's claim a delta, not a guess.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%clara._subledger_on_approve(%';
  if v_n <> 4 then
    raise exception '0041 probe 12: expected exactly 4 callers of clara._subledger_on_approve, found % -- the 0037:3779-3846 four-caller census drifted', v_n;
  end if;

  -- PROBE 13 -- PRE-STATE SAFETY: no verb this file creates already exists (a duplicate
  -- re-apply would otherwise CREATE OR REPLACE over a live body silently).
  select count(*)::int, string_agg(p.proname, ', ' order by p.proname) into v_n, v_names
  from pg_proc p where p.pronamespace = 'clara'::regnamespace
    and p.proname in ('_fa_particulars_complete','_fa_accumulated','_fa_on_approve',
      'upsert_fa_account_profile','retire_fa_account_profile','complete_fixed_asset_particulars',
      'revise_fixed_asset_particulars','propose_depreciation_authority','sign_depreciation_authority',
      'retire_depreciation_authority','run_depreciation_period','run_depreciation_manual',
      'dispose_fixed_asset','set_client_fy_end','depreciation_run_due','list_fixed_assets',
      'get_fixed_asset','list_depreciation_runs','get_depreciation_run','get_depreciation_authority',
      'fa_register_tie');
  if v_n <> 0 then
    raise exception '0041 probe 13: % D-a function name(s) already exist (%) -- partial or duplicate re-apply', v_n, v_names;
  end if;

  raise notice '0041 SECTION 0 probe OK (0/13): 0040 is the applied frontier; none of the 4 relations, 10 columns, 3 event names or 21 functions pre-exist; the fixed_assets baseline, the 3 replaced CHECKs, the immutability trigger, the 12 splice subjects, the taxonomy singleton, both FK anchors and the four-caller census are all present in their expected shape; every existing fixed_assets row is a straight_line K-family carry-down.';
end
$probe$;

-- #####################################################################################
-- ############################ SECTION S1 -- SCHEMA ###################################
-- #####################################################################################

set role clara_fn_owner;

-- =====================================================================================
-- S1.1 -- clara.fixed_assets alters (design SS1.1). The table has existed since Phase-3
-- Slice 2 as SCHEMA ONLY; Wave D-a is what wires it. Every alter below is either a widening
-- the K-family carry-down already satisfies, or a NULLABLE addition, so no backfill exists
-- and no live row changes meaning (SECTION 0 probe 11 reconfirmed that on live data).
-- =====================================================================================

-- WD-R3: three methods. The column becomes NULLABLE (NULL = "not yet chosen", the
-- soft-birth state) and LOSES ITS DEFAULT -- a default of 'straight_line' would make every
-- soft-born row claim a method nobody chose, which is precisely the invented-number class
-- the DB-owns-every-number law forbids. The postverify probes atthasdef=false.
alter table clara.fixed_assets drop constraint fixed_assets_depreciation_method_check;
alter table clara.fixed_assets alter column depreciation_method drop not null;
alter table clara.fixed_assets alter column depreciation_method drop default;
alter table clara.fixed_assets add constraint fixed_assets_depreciation_method_check
  check (depreciation_method is null
         or depreciation_method in ('straight_line', 'reducing_balance', 'none'));

-- The reducing-balance ANNUAL rate, in basis points. Bounded 1..10000 [L2/round-2 minors]:
-- zero is not a rate (it is method='none') and >100% is not a reducing balance.
alter table clara.fixed_assets add column depreciation_rate_bps int;
alter table clara.fixed_assets add constraint ck_fa_rate_bps_range
  check (depreciation_rate_bps is null or depreciation_rate_bps between 1 and 10000);

-- METHOD-DRIVER CONGRUENCE, BOTH WAYS (design SS1.1, SS9.2). reducing_balance needs the rate
-- (to charge) AND the life (to terminate); straight_line needs the life and forbids the rate;
-- none carries neither. Written as one CHECK so the predicate and the arithmetic can never
-- disagree -- the failure mode where a rate silently rides a straight_line asset, or an RB
-- asset never terminates, is unrepresentable rather than merely untested.
alter table clara.fixed_assets add constraint ck_fa_method_drivers check (
  depreciation_method is null
  or (depreciation_method = 'reducing_balance'
      and depreciation_rate_bps is not null and useful_life_months is not null)
  or (depreciation_method = 'straight_line'
      and depreciation_rate_bps is null and useful_life_months is not null)
  or (depreciation_method = 'none'
      and depreciation_rate_bps is null and useful_life_months is null));

-- THE BIRTH IDENTITY (design SS1.1/SS2.2). One register row per journal LINE, keyed to that
-- line -- which is what makes the soft-birth idempotent under all four approve paths and
-- under a re-drive (`on conflict (acquisition_line_id) do nothing`). SUCCESSORS CARRY IT
-- NULL: a split/revision successor has no acquisition leg of its own and reaches the
-- original's upward through supersedes_asset_id. NULLs are distinct in a btree unique index,
-- so one plain unique index serves both facts.
alter table clara.fixed_assets add column acquisition_line_id uuid;
alter table clara.fixed_assets add constraint fk_fa_acquisition_line
  foreign key (acquisition_line_id) references clara.journal_lines(id);
create unique index uq_fixed_assets_acquisition_line
  on clara.fixed_assets (acquisition_line_id);

-- The governing entry of a disposal, and the two ACCOUNTING dates the as-of inclusion rule
-- reads. Both are DATES, never transaction time: the register's as-of read must answer "what
-- did this book hold on 30 June" the same way the GL does [L2/round-2 fold 3].
alter table clara.fixed_assets add column disposal_entry_id uuid;
alter table clara.fixed_assets add constraint fk_fa_disposal_entry
  foreign key (disposal_entry_id) references clara.journal_entries(id);
alter table clara.fixed_assets add column superseded_at date;
alter table clara.fixed_assets add column effective_from date;

-- TENANT CONGRUENCE, DECLARATIVELY (design SS1.1). The hook derives every birth column from
-- the approved entry's own leg rows, so congruence is true by construction -- these composite
-- FKs make it true by CONSTRAINT as well, so a future writer cannot attach a register row to
-- another firm's entry even by mistake. (journal_lines carries no (id, firm_id, client_id)
-- anchor, so the line FK above stays single-column; the line is reached only through the
-- entry the hook already validated.)
alter table clara.fixed_assets add constraint fk_fa_acquisition_entry_congruent
  foreign key (acquisition_entry_id, firm_id, client_id)
  references clara.journal_entries(id, firm_id, client_id);
alter table clara.fixed_assets add constraint fk_fa_disposal_entry_congruent
  foreign key (disposal_entry_id, firm_id, client_id)
  references clara.journal_entries(id, firm_id, client_id);

-- WD-R12: the capital-allowance metadata trio. NULLABLE, CAPTURED, AND COMPUTED AGAINST BY
-- NOTHING until Wave F verifies CA facts from primary sources. Acquisition time is when the
-- human knows these; retrofitting at F would mean revisiting every asset.
alter table clara.fixed_assets add column ca_class text;
alter table clara.fixed_assets add column is_commercial_vehicle boolean;
alter table clara.fixed_assets add column is_new boolean;

-- 'unwound' joins the status vocabulary (design SS1.1): a register row whose acquisition was
-- cleanly reversed. It keeps superseded_by_asset_id NULL, so the 0017 supersede-state CHECK
-- is untouched and stays true [L2/round-2 minors].
alter table clara.fixed_assets drop constraint fixed_assets_status_check_0017;
alter table clara.fixed_assets add constraint fixed_assets_status_check_0017
  check (status = any (array['pending', 'active', 'disposed', 'superseded', 'unwound']));

-- LOOKUP INDEXES. The table carried ONLY its primary key until now (measured, not assumed --
-- see the harvested catalog dump), which is fine for a zero-row table and not fine for the
-- register reads, the belt's door (a), the lineage walk and the tie.
create index ix_fixed_assets_client_status on clara.fixed_assets (client_id, status);
create index ix_fixed_assets_client_asset_account
  on clara.fixed_assets (client_id, asset_account_code);
create index ix_fixed_assets_acquisition_entry on clara.fixed_assets (acquisition_entry_id);
create index ix_fixed_assets_disposal_entry on clara.fixed_assets (disposal_entry_id)
  where disposal_entry_id is not null;
create index ix_fixed_assets_supersedes on clara.fixed_assets (supersedes_asset_id)
  where supersedes_asset_id is not null;

-- -------------------------------------------------------------------------------------
-- PARTICULARS COMPLETENESS IS DERIVED, NEVER STORED (design SS1.1). A stored boolean is a
-- second source of truth that can drift from the columns it summarises; a function over the
-- row cannot. IMMUTABLE so it is usable in the STABLE read RPCs, the queue projection and
-- the immutability trigger alike.
--
-- The start date is required for EVERY method, including 'none' -- an in-service date is a
-- register fact (it is what the disposal precondition and the as-of reads key off), not a
-- depreciation input.
-- -------------------------------------------------------------------------------------
create function clara._fa_particulars_complete(p_row clara.fixed_assets)
  returns boolean language sql immutable as $$
  select p_row.depreciation_start_date is not null
     and p_row.depreciation_method is not null
     and (p_row.depreciation_method = 'none'
          or (p_row.depreciation_method = 'straight_line'
              and p_row.useful_life_months is not null and p_row.residual_cents is not null)
          or (p_row.depreciation_method = 'reducing_balance'
              and p_row.useful_life_months is not null and p_row.residual_cents is not null
              and p_row.depreciation_rate_bps is not null));
$$;
revoke all on function clara._fa_particulars_complete(clara.fixed_assets) from public;

-- =====================================================================================
-- S1.2 -- clara.fa_account_profiles (design SS1.2). ENROLMENT IS WHAT MAKES DETECTION
-- LAWFUL: without it the hook would have to guess which asset-class debits are capital
-- purchases, and WD-R2 forbids the DB from making that judgement at all. The HOOK and the
-- SOFT-BIRTH arm read the ACTIVE profile (they act at approve time, on the enrolment as it
-- then stands); the SS2.4 belt reads the ENROLMENT INTERVAL, because it is DEFERRED.
--
-- [enrolled_at, retired_at] IS AN IMMUTABLE ENROLMENT INTERVAL [L2/round-2 fold 5; round-3
-- fold F5]. enrolled_at is the belt WATERMARK -- entries approved BEFORE enrolment are exempt,
-- so enrolling an account that already has history neither blocks that history's reversals nor
-- births anything retroactively -- and retired_at closes it. An enrolled code set is NEVER
-- re-pointed in place: upsert_fa_account_profile VERSION-FORWARDS (retire the old row, insert
-- a fresh one), so a historical interval can never be overwritten and the belt can always
-- answer "was this account enrolled when this entry was approved" from stored facts alone.
--
-- accum + expense BOTH NULL <=> a NON-DEPRECIABLE profile (land, MPERS 17.16): assets born
-- on it take method='none'. The pair CHECK is what stops a half-stated profile.
-- =====================================================================================
create table clara.fa_account_profiles (
  id                        uuid        primary key default gen_random_uuid(),
  firm_id                   uuid        not null,
  client_id                 uuid        not null,
  asset_account_code        text        not null,
  accum_depr_account_code   text,
  depr_expense_account_code text,
  active                    boolean     not null default true,
  enrolled_at               timestamptz not null default now(),
  created_by                uuid        not null references clara.users(id),
  created_at                timestamptz not null default now(),
  retired_by                uuid        references clara.users(id),
  retired_at                timestamptz,
  constraint fk_fap_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_fap_asset_acc foreign key (client_id, asset_account_code)
    references clara.coa_accounts(client_id, account_code),
  constraint fk_fap_accum_acc foreign key (client_id, accum_depr_account_code)
    references clara.coa_accounts(client_id, account_code),
  constraint fk_fap_expense_acc foreign key (client_id, depr_expense_account_code)
    references clara.coa_accounts(client_id, account_code),
  -- Non-depreciable is a PAIR fact, never a half-stated one.
  constraint ck_fap_depreciable_pair
    check ((accum_depr_account_code is null) = (depr_expense_account_code is null)),
  -- PAIRWISE DISTINCT (Codex round-1 fold): a profile whose cost and accumulated codes are
  -- the same account would make every depreciation charge a self-contra, and the belt could
  -- never tell a cost movement from an accumulated one.
  constraint ck_fap_pairwise_distinct check (
    asset_account_code is distinct from accum_depr_account_code
    and asset_account_code is distinct from depr_expense_account_code
    and (accum_depr_account_code is null
         or accum_depr_account_code is distinct from depr_expense_account_code)),
  constraint ck_fap_retired check (
    (active and retired_by is null and retired_at is null)
    or (not active and retired_by is not null and retired_at is not null)),
  constraint uq_fa_account_profiles_id_firm_client unique (id, firm_id, client_id)
);
-- Re-enrolment mints a NEW row (version-forward, round-3 fold F5b) and retired rows are kept
-- forever as the belt's historical intervals, so the uniqueness is scoped to the LIVE
-- enrolment only.
create unique index uq_fa_account_profiles_active
  on clara.fa_account_profiles (client_id, asset_account_code) where active;
-- THE ACCUMULATED ROLE IS UNIQUE PER CLIENT, DECLARATIVELY [round-3.5 fold G4]. The verb
-- already refuses a shared accumulated account (the tie is per (cost, accumulated) pair and
-- two profiles sharing one accumulated GL account make BOTH pairs arithmetically impossible),
-- but a probe inside one verb is a guard a second writer can bypass; a partial unique index is
-- a guard the DATABASE holds. The EXPENSE role deliberately gets NO such index: one
-- depreciation-expense account serving every asset class is ordinary Malaysian SME practice,
-- and the expense side is not part of the tie's grain.
create unique index uq_fa_account_profiles_accum_active
  on clara.fa_account_profiles (client_id, accum_depr_account_code)
  where active and accum_depr_account_code is not null;
-- The belt evaluates the interval, so it reads retired rows too: keep the interval scan cheap.
create index ix_fa_account_profiles_interval
  on clara.fa_account_profiles (client_id, enrolled_at, retired_at);
create index ix_fa_account_profiles_client on clara.fa_account_profiles (client_id, active);
-- The belt joins legs to profiles by (client, code) on ALL THREE roles.
create index ix_fa_account_profiles_accum
  on clara.fa_account_profiles (client_id, accum_depr_account_code) where active;
create index ix_fa_account_profiles_expense
  on clara.fa_account_profiles (client_id, depr_expense_account_code) where active;

create function clara._tf_fa_profile_no_delete() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'an FA account profile is retired, never deleted (retire_fa_account_profile)'
    using errcode = 'CLR37',
      detail = jsonb_build_object('reason', 'fa_profile_never_deleted', 'profile_id', old.id)::text;
end $$;
revoke all on function clara._tf_fa_profile_no_delete() from public;
create trigger t_fa_account_profiles_no_delete before delete on clara.fa_account_profiles
  for each row execute function clara._tf_fa_profile_no_delete();
create trigger t_fa_account_profiles_no_truncate before truncate
  on clara.fa_account_profiles for each statement execute function clara._tf_no_truncate();

alter table clara.fa_account_profiles enable row level security;
alter table clara.fa_account_profiles force row level security;
create policy p_fa_account_profiles_owner on clara.fa_account_profiles
  for all to clara_fn_owner using (true) with check (true);
create policy p_fa_account_profiles_human on clara.fa_account_profiles
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fa_account_profiles to clara_authenticated;

-- =====================================================================================
-- S1.3 -- clara.fa_depreciation (design SS1.3). THE APPEND-ONLY CHARGE LEDGER, BORN AT
-- APPROVE. The Wave-D contract's trap 1 is discharged here: fixed_assets.
-- accumulated_depreciation_cents is NOT mutable on an approved row, so accumulation lives in
-- this ledger and the register column stays BASELINE-ONLY (the carry-down's figure).
--
-- SIGNS AND READS: Accumulated(asset, as_of) = baseline + SUM over ALL rows with
-- effective_date <= as_of of (+amount for a charge, -amount for an unwind). is_live NEVER
-- appears in a read [L2/round-2 fold 2] -- it exists solely so the uniqueness index below can
-- exclude superseded charges. Putting it in the read made the as-of answer wrong in BOTH time
-- directions (a June read lost a March charge unwound in August; a September read
-- double-voided it).
--
-- is_live LAW: charge rows are born true; UNWIND ROWS ARE BORN false, ALWAYS; the hook flips
-- the original false in the same statement block that appends its unwind (flip, then insert --
-- neither can collide, because an unwind row never enters the index).
-- =====================================================================================
create table clara.fa_depreciation (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null,
  client_id      uuid        not null,
  asset_id       uuid        not null,
  period_start   date        not null,
  period_end     date        not null,
  amount_cents   bigint      not null check (amount_cents > 0),
  effective_date date        not null,
  entry_id       uuid        not null,
  run_id         uuid,
  unwind_of      uuid,
  is_live        boolean     not null,
  created_at     timestamptz not null default now(),
  constraint fk_fa_depreciation_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_fa_depreciation_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint uq_fa_depreciation_id_firm_client unique (id, firm_id, client_id),
  constraint fk_fa_depreciation_unwind foreign key (unwind_of, firm_id, client_id)
    references clara.fa_depreciation(id, firm_id, client_id),
  constraint ck_fa_depreciation_period check (period_start <= period_end),
  constraint ck_fa_depreciation_self_unwind check (unwind_of is distinct from id),
  -- An unwind row is NEVER live. Stated as a CHECK so the law survives any future writer.
  constraint ck_fa_depreciation_unwind_dead check (unwind_of is null or is_live = false)
);
-- ASSET CONGRUENCE: the ledger row and the register row must share firm + client. Written as
-- a composite FK against a matching anchor on fixed_assets rather than as a CHECK, because
-- only an FK can express a cross-row fact.
alter table clara.fixed_assets add constraint uq_fixed_assets_id_firm_client
  unique (id, firm_id, client_id);
alter table clara.fa_depreciation add constraint fk_fa_depreciation_asset
  foreign key (asset_id, firm_id, client_id)
  references clara.fixed_assets(id, firm_id, client_id);

-- A CORRECTED RE-RUN IS LAWFUL AFTER AN UNWIND -- which is exactly why the uniqueness is
-- partial on is_live rather than absolute.
create unique index uq_fa_depreciation_live_range
  on clara.fa_depreciation (asset_id, period_start, period_end) where is_live;
-- One unwind per charge, ever.
create unique index uq_fa_depreciation_unwind_of
  on clara.fa_depreciation (unwind_of) where unwind_of is not null;
create index ix_fa_depreciation_asset_eff on clara.fa_depreciation (asset_id, effective_date);
create index ix_fa_depreciation_entry on clara.fa_depreciation (entry_id);
create index ix_fa_depreciation_run on clara.fa_depreciation (run_id) where run_id is not null;
create index ix_fa_depreciation_client on clara.fa_depreciation (client_id, effective_date);

-- APPEND-ONLY, WITH EXACTLY ONE LAWFUL UPDATE: is_live true -> false. Anything else -- an
-- amount, a range, a re-live -- refuses. The row minus is_live is compared WHOLE, so a column
-- a later migration adds is protected by default rather than by somebody remembering a list.
create function clara._tf_fa_depreciation_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a depreciation ledger row is unwound, never deleted'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'fa_depreciation_never_deleted', 'row_id', old.id)::text;
  end if;
  if (to_jsonb(new) - 'is_live') is distinct from (to_jsonb(old) - 'is_live') then
    raise exception 'a depreciation ledger row is immutable outside the is_live retirement flip'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'fa_depreciation_immutable', 'row_id', old.id)::text;
  end if;
  if old.is_live and not new.is_live then
    return new;
  end if;
  raise exception 'a depreciation ledger row can only move is_live true -> false'
    using errcode = 'CLR38',
      detail = jsonb_build_object('reason', 'fa_depreciation_relive', 'row_id', old.id)::text;
end $$;
revoke all on function clara._tf_fa_depreciation_append_only() from public;
create trigger t_fa_depreciation_append_only before delete or update on clara.fa_depreciation
  for each row execute function clara._tf_fa_depreciation_append_only();
create trigger t_fa_depreciation_no_truncate before truncate
  on clara.fa_depreciation for each statement execute function clara._tf_no_truncate();

alter table clara.fa_depreciation enable row level security;
alter table clara.fa_depreciation force row level security;
create policy p_fa_depreciation_owner on clara.fa_depreciation
  for all to clara_fn_owner using (true) with check (true);
create policy p_fa_depreciation_human on clara.fa_depreciation
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fa_depreciation to clara_authenticated;

-- =====================================================================================
-- S1.4 -- clara.fa_depreciation_authorities (design SS1.4; WD-R5/R9). The house rule-family
-- shape (propose -> sign -> retire) with the sign floor at admin+. Cadence lives ON the
-- authority (WD-R4), so changing it is retire + re-sign -- which re-ramps, exactly as an
-- edited rule does.
--
-- THE RAMP PREDICATE IS DERIVED, WITH NO COLUMN AND NO RECEIPT JOIN (design SS1.4): autonomy
-- is earned iff an approved, un-reversed origin='scheduled_run' entry exists for this client
-- under this authority. Entries are the truth -- a zero-charge period mints no entry and
-- earns nothing, and a reversal un-earns until a fresh reviewed run passes.
-- =====================================================================================
create table clara.fa_depreciation_authorities (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null,
  client_id      uuid        not null,
  status         text        not null check (status in ('proposed', 'live', 'retired')),
  cadence        text        not null check (cadence in ('monthly', 'annual')),
  proposed_by    uuid        not null references clara.users(id),
  proposed_op_key text       not null,
  signed_by      uuid        references clara.users(id),
  signed_at      timestamptz,
  signed_op_key  text,
  retired_by     uuid        references clara.users(id),
  retired_at     timestamptz,
  retired_reason text,
  retired_op_key text,
  created_at     timestamptz not null default now(),
  constraint fk_fa_authorities_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint uq_fa_authorities_id_firm_client unique (id, firm_id, client_id),
  constraint ck_fa_authorities_signed check (
    (status = 'proposed' and signed_by is null and signed_at is null)
    or (status in ('live', 'retired') and signed_by is not null and signed_at is not null)),
  constraint ck_fa_authorities_retired check (
    (status <> 'retired' and retired_by is null and retired_at is null and retired_reason is null)
    or (status = 'retired' and retired_by is not null and retired_at is not null
        and retired_reason is not null and btrim(retired_reason) <> ''))
);
-- ONE LIVE AUTHORITY PER CLIENT, ever.
create unique index uq_fa_authorities_live
  on clara.fa_depreciation_authorities (client_id) where status = 'live';
-- ONE OPEN PROPOSAL PER CLIENT: a second concurrent propose is a collision, not a queue.
create unique index uq_fa_authorities_proposed
  on clara.fa_depreciation_authorities (client_id) where status = 'proposed';
create index ix_fa_authorities_client on clara.fa_depreciation_authorities (client_id, status);

create function clara._tf_fa_authority_transition() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_frozen text[] := array['status','signed_by','signed_at','signed_op_key',
  'retired_by','retired_at','retired_reason','retired_op_key'];
begin
  if tg_op = 'DELETE' then
    raise exception 'a depreciation authority is retired, never deleted'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_never_deleted', 'authority_id', old.id)::text;
  end if;
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'a depreciation authority is immutable outside its sign/retire transitions'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_immutable', 'authority_id', old.id)::text;
  end if;
  if (old.status = 'proposed' and new.status in ('live', 'retired'))
     or (old.status = 'live' and new.status = 'retired') then
    return new;
  end if;
  raise exception 'depreciation authority transition % -> % is not lawful', old.status, new.status
    using errcode = 'CLR38',
      detail = jsonb_build_object('reason', 'authority_transition_illegal',
        'authority_id', old.id, 'from_status', old.status, 'to_status', new.status)::text;
end $$;
revoke all on function clara._tf_fa_authority_transition() from public;
create trigger t_fa_authorities_transition before delete or update
  on clara.fa_depreciation_authorities
  for each row execute function clara._tf_fa_authority_transition();
create trigger t_fa_authorities_no_truncate before truncate
  on clara.fa_depreciation_authorities for each statement execute function clara._tf_no_truncate();

alter table clara.fa_depreciation_authorities enable row level security;
alter table clara.fa_depreciation_authorities force row level security;
create policy p_fa_authorities_owner on clara.fa_depreciation_authorities
  for all to clara_fn_owner using (true) with check (true);
create policy p_fa_authorities_human on clara.fa_depreciation_authorities
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fa_depreciation_authorities to clara_authenticated;

-- =====================================================================================
-- S1.5 -- clara.fa_depreciation_runs (design SS1.5). RECEIPTS, MINTED AT APPROVE, 1:1 WITH
-- THE ENTRY [L2/round-2 fold 1]. A receipt exists IFF its entry was approved and
-- materialised. There is deliberately NO (client, period) uniqueness: a corrected re-run
-- after a reversal lawfully mints a SECOND receipt for the same period, and the v2 shape that
-- forbade it deadlocked the sweep against its own correction door.
--
-- RECEIPTS ARE NEVER READ FOR ELIGIBILITY OR COVERAGE. Due-ness and the WD-R6 advisory both
-- derive from per-asset uncharged due periods (SS3.1). A run finding nothing due persists
-- nothing at all.
-- =====================================================================================
create table clara.fa_depreciation_runs (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null,
  client_id     uuid        not null,
  authority_id  uuid        not null,
  period_start  date        not null,
  period_end    date        not null,
  mode          text        not null check (mode in ('post', 'draft')),
  entries       int         not null check (entries >= 0),
  charged_cents bigint      not null check (charged_cents >= 0),
  skipped       jsonb       not null default '[]'::jsonb
                            check (jsonb_typeof(skipped) = 'array'),
  entry_id      uuid        not null,
  op_key        text        not null,
  created_at    timestamptz not null default now(),
  constraint fk_fa_runs_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_fa_runs_authority foreign key (authority_id, firm_id, client_id)
    references clara.fa_depreciation_authorities(id, firm_id, client_id),
  constraint fk_fa_runs_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint uq_fa_runs_id_firm_client unique (id, firm_id, client_id),
  constraint ck_fa_runs_period check (period_start <= period_end)
);
-- ONE RECEIPT PER ENTRY (the 1:1 the design states, made structural).
create unique index uq_fa_runs_entry on clara.fa_depreciation_runs (entry_id);
-- The issuer's op key is the receipt's second identity; a replay cannot mint a twin.
create unique index uq_fa_runs_op_key on clara.fa_depreciation_runs (firm_id, op_key);
create index ix_fa_runs_client on clara.fa_depreciation_runs (client_id, period_end desc);

alter table clara.fa_depreciation add constraint fk_fa_depreciation_run
  foreign key (run_id, firm_id, client_id)
  references clara.fa_depreciation_runs(id, firm_id, client_id);

create function clara._tf_fa_run_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a depreciation run receipt is never deleted (reverse its entry)'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'fa_run_never_deleted', 'run_id', old.id)::text;
  end if;
  raise exception 'a depreciation run receipt is immutable (reverse its entry and re-run)'
    using errcode = 'CLR38',
      detail = jsonb_build_object('reason', 'fa_run_immutable', 'run_id', old.id)::text;
end $$;
revoke all on function clara._tf_fa_run_immutable() from public;
create trigger t_fa_runs_immutable before delete or update on clara.fa_depreciation_runs
  for each row execute function clara._tf_fa_run_immutable();
create trigger t_fa_runs_no_truncate before truncate
  on clara.fa_depreciation_runs for each statement execute function clara._tf_no_truncate();

alter table clara.fa_depreciation_runs enable row level security;
alter table clara.fa_depreciation_runs force row level security;
create policy p_fa_runs_owner on clara.fa_depreciation_runs
  for all to clara_fn_owner using (true) with check (true);
create policy p_fa_runs_human on clara.fa_depreciation_runs
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fa_depreciation_runs to clara_authenticated;

-- =====================================================================================
-- S1.6 -- BOOKS-CORE WIDENINGS (design SS1.6).
-- =====================================================================================

-- 'scheduled_run' joins the origin vocabulary. v1's 'depreciation_run' violated the live
-- CHECK outright [L2/round-1]. The ISSUER-AUTHENTICITY half of SS9.5 is the tail census:
-- EXACTLY ONE function body inserts this literal.
alter table clara.journal_entries drop constraint journal_entries_origin_check;
alter table clara.journal_entries add constraint journal_entries_origin_check
  check (origin = any (array['manual', 'document', 'agent', 'reversal', 'scheduled_run']));

-- THE CLIENT FINANCIAL-YEAR END (design SS1.6). Nullable, with an EXPLICIT Dec-31 fallback
-- that the authority card SURFACES rather than silently assumes -- a Malaysian SME year end
-- is very often not December, and an annual cadence computed against a wrong FY would post a
-- year's depreciation into the wrong period with nothing visible to say so.
alter table clara.clients add column fy_end_month int;
alter table clara.clients add column fy_end_day int;
alter table clara.clients add constraint ck_clients_fy_end check (
  (fy_end_month is null and fy_end_day is null)
  or (fy_end_month between 1 and 12 and fy_end_day between 1 and 31
      and not (fy_end_month = 2 and fy_end_day > 29)
      and not (fy_end_month in (4, 6, 9, 11) and fy_end_day > 30)));

-- THE OUTSTANDING-DISPOSAL-DRAFT INDEX [round-3 fold F10]. clara._fa_disposal_draft_outstanding
-- is asked once per candidate asset inside the sweep's per-client hot loop; without this the
-- predicate is a sequential scan of the whole entry table every time. Partial and client-keyed,
-- so it stays tiny (an outstanding disposal draft is a rare, short-lived state).
create index ix_journal_entries_fa_disposal_draft
  on clara.journal_entries (client_id)
  where status = 'draft' and flags ? 'fa_disposal';

-- =====================================================================================
-- S1.7 -- THE IMMUTABILITY TRIGGER RECUT (design SS1.1, "the full transition table").
-- Wave-D contract trap 1, discharged. The 0017 allowlist is {disposed_at, status,
-- superseded_by_asset_id, updated_at}; D-a's lifecycle additionally writes
-- disposal_entry_id and superseded_at, and its COMPLETION door writes the particulars
-- columns exactly once. Done through the CATALOG (fetch pg_get_functiondef, census, replace,
-- re-fetch, re-assert), never from file text -- the house CoR law, applied even though this
-- body has exactly one prior author (0017), because a body is a live object and file text is
-- a memory of one.
-- =====================================================================================
do $s1_7$
declare
  v_sig text := 'clara._tf_fixed_assets_immutable_0017()';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S1.7 prestate: clara._tf_fixed_assets_immutable_0017 is GONE'
      using errcode = 'CLR10';
  end if;
  -- IDEMPOTENCY: a re-apply is LOUD, never a double splice.
  if position('fa_baseline_immutable' in v_def) <> 0 then
    raise exception '0041 S1.7 prestate: the immutability trigger already carries the D-a transition table -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- PRE-EXISTING MARKER CENSUS (anti-revert). The 0017 body is short and has exactly one
  -- author; these three markers are its whole load-bearing surface.
  if (length(v_def) - length(replace(v_def, 'fixed assets are corrected by opening supersede, never deleted', ''))) = 0
     or (length(v_def) - length(replace(v_def, 'an approved fixed-asset baseline is immutable', ''))) = 0
     or (length(v_def) - length(replace(v_def, 'CLR13', ''))) = 0 then
    raise exception '0041 S1.7 prestate: the live immutability trigger body is missing one of its 0017 markers -- re-derive this splice against the live catalog'
      using errcode = 'CLR10';
  end if;

  -- (a) the declaration gains the mutable-set variable.
  v_frm := $f$declare v_approved boolean;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S1.7 prestate: the declare line appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$declare v_approved boolean; v_mutable text[];$t$;
  v_def := replace(v_def, v_frm, v_to);

  -- (b) the approved test + the whole allowlist comparison.
  v_frm := $f$  select exists(select 1 from clara.journal_entries e
    where e.id=old.acquisition_entry_id and e.status='approved') into v_approved;
  if v_approved and
     (to_jsonb(new)-array[
       'disposed_at','status','superseded_by_asset_id','updated_at'])
       is distinct from
     (to_jsonb(old)-array[
       'disposed_at','status','superseded_by_asset_id','updated_at']) then
    raise exception 'an approved fixed-asset baseline is immutable'
      using errcode='CLR13';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S1.7 prestate: the 0017 allowlist comparison appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$  select exists(select 1 from clara.journal_entries e
    where e.id=old.acquisition_entry_id and e.status='approved')
    -- 0041 (D-a SS1.1, assembly adjudication 2): a SUPERSEDE-SPLIT / REVISION SUCCESSOR
    -- carries acquisition_entry_id NULL by design, which would leave this test vacuous for
    -- exactly the rows the split creates. A successor is only ever born by an APPROVED
    -- governing entry, so it is approved-by-construction. (A K6 replacement row is NOT this
    -- case: it carries a draft acquisition_entry_id and stages 'pending'.)
    or (old.acquisition_entry_id is null and old.supersedes_asset_id is not null)
    into v_approved;
  -- 0041 (D-a SS1.1) THE FULL TRANSITION TABLE. Post-approval mutable =
  --   {status, disposed_at, disposal_entry_id, superseded_by_asset_id, superseded_at,
  --    updated_at}              UNCONDITIONALLY -- lifecycle facts, written only by the FA
  --                             approve-time hook and the K-family hand-off; UNION
  --   the particulars columns   WHILE clara._fa_particulars_complete(OLD) is false.
  -- Evaluated on OLD on purpose: the completing UPDATE must not refuse itself. The pre-0041
  -- allowlist omitted disposal_entry_id and superseded_at, so the FIRST disposal would have
  -- raised CLR13 [L2/round-2 fold 4].
  if v_approved then
    v_mutable:=array['status','disposed_at','disposal_entry_id','superseded_by_asset_id',
      'superseded_at','updated_at'];
    if not clara._fa_particulars_complete(old) then
      v_mutable:=v_mutable||array['depreciation_method','useful_life_months',
        'depreciation_rate_bps','residual_cents','depreciation_start_date','description',
        'ca_class','is_commercial_vehicle','is_new'];
    end if;
    if (to_jsonb(new)-v_mutable) is distinct from (to_jsonb(old)-v_mutable) then
      raise exception 'an approved fixed-asset baseline is immutable'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','fa_baseline_immutable','asset_id',old.id)::text;
    end if;
  end if;$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- POSTCHECK: re-fetch from the CATALOG (never trust the local string), assert the new
  -- markers landed exactly once, assert the OLD form is gone (proves replace() fired rather
  -- than passing vacuously), and assert the owner is unchanged.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('fa_baseline_immutable' in v_def) = 0
     or position('clara._fa_particulars_complete(old)' in v_def) = 0
     or position('disposal_entry_id' in v_def) = 0
     or position('superseded_at' in v_def) = 0 then
    raise exception '0041 S1.7 postcheck: the D-a transition table did not land' using errcode = 'CLR10';
  end if;
  if position($p$'disposed_at','status','superseded_by_asset_id','updated_at'$p$ in v_def) <> 0 then
    raise exception '0041 S1.7 postcheck: the 0017 four-column allowlist is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  if position('fixed assets are corrected by opening supersede, never deleted' in v_def) = 0 then
    raise exception '0041 S1.7 postcheck: the 0017 no-delete refusal was lost by the splice'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S1.7 postcheck: the immutability trigger changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S1.7 OK: clara._tf_fixed_assets_immutable_0017 now carries the D-a transition table (6 unconditional lifecycle columns + 9 particulars columns gated on OLD incompleteness); the 0017 no-delete refusal survived; owner unchanged.';
end $s1_7$;

-- =====================================================================================
-- S1.8 -- THE superseded_at BACKFILL [round-3.5 fold G3]. clara.approve_opening_correction
-- (0017's K6 door) has always set status='superseded' + superseded_by_asset_id and NEVER a
-- supersede DATE -- there was no such column until the alter above. Every D-a as-of read
-- treats `superseded_at is null` as "this row is still in the register at every date"
-- (clara._fa_included_at), so a corrected carry-down row and its replacement would BOTH be
-- included forever: measured on assembly client 92ebe012, the register read cost 1,000,000 /
-- accumulated 200,000 against a GL that only ever carried 500,000 / 100,000, with every
-- explained column of fa_register_tie at zero. The acceptance instrument would have read
-- DOUBLE on exactly the WD-R14 shape (a real carried register, corrected once).
--
-- THE DATE IS DERIVED, NEVER GUESSED. A supersede happened when the SUPERSEDING entry posted,
-- so the answer is the successor's own governing entry date, looked for in the two places a
-- successor can carry one:
--   (1) the K path -- the replacement's opening_item -> its (approved) journal entry;
--   (2) the general path -- the successor's own acquisition_entry_id.
-- If a superseded row can be dated by NEITHER, this migration REFUSES rather than inventing a
-- date: a wrong supersede date silently moves a register as-of read, which is precisely the
-- class of invented number the DB-owns-every-number law forbids. (The D-a writers -- revise
-- and the disposal split -- stamp the column at birth, so this backfill only ever sees
-- pre-0041 K-family rows.)
-- =====================================================================================
do $s1_8$
declare v_n int; v_left int; v_names text;
begin
  with derived as (
    select f.id,
           coalesce(
             (select min(je.posting_date) from clara.opening_items oi
                join clara.journal_entries je on je.id = oi.entry_id
               where oi.fixed_asset_id = f.superseded_by_asset_id and je.status = 'approved'),
             (select min(je2.posting_date) from clara.fixed_assets s
                join clara.journal_entries je2 on je2.id = s.acquisition_entry_id
               where s.id = f.superseded_by_asset_id and je2.status = 'approved')) as pd
      from clara.fixed_assets f
     where f.status = 'superseded' and f.superseded_at is null
  )
  update clara.fixed_assets fa set superseded_at = d.pd
    from derived d where fa.id = d.id and d.pd is not null;
  get diagnostics v_n = row_count;
  select count(*)::int, string_agg(f.id::text, ', ' order by f.id) into v_left, v_names
    from clara.fixed_assets f
    where f.status = 'superseded' and f.superseded_at is null;
  if v_left <> 0 then
    raise exception '0041 S1.8: % superseded register row(s) (%) carry no derivable supersede date -- neither the successor''s opening item nor its acquisition entry names an approved posting date. Date them through the K correction door (or reverse the correction) before applying this migration; 0041 will not invent a register as-of boundary', v_left, v_names
      using errcode = 'CLR10';
  end if;
  raise notice '0041 S1.8 OK: % pre-0041 superseded register row(s) backfilled with a DERIVED supersede date; zero superseded rows remain undated.', v_n;
end $s1_8$;

reset role;

-- #####################################################################################
-- ######################### SECTION EVENTS -- the asset.* kinds #######################
-- #####################################################################################
-- ROLE NOTE: this section runs as the PLAIN MIGRATION ROLE. clara.event_types and
-- clara.trigger_taxonomy are migration-owned; nesting this inside an open clara_fn_owner
-- scope would silently run the rest of that scope as the wrong role (0038:8413-8423 /
-- 0040:2769-2776). SECTION S1 closed its region with `reset role;` immediately above, and
-- SECTION S2 opens a fresh one immediately below.
--
-- EVENT ROWS, NOT AN ENUM WIDENING (design SS1.6). ARCHITECTURE names acquired/depreciated;
-- WD-R13's build order adds the third. All three are CLIENT-SCOPED and all three decide
-- 'ignore': the /assets read RPCs surface register state directly (the same reasoning the
-- 0040 bank.* kinds carry) -- there is no router work to do on a fact a workbench reads from
-- the tables. PAYLOADS CARRY IDENTIFIERS ONLY: no account codes, no asset descriptions, no
-- amounts beyond the charge total the receipt already holds (TAIL 8 scans for this).

with added(name, client_scoped, description, decision, note) as (values
  ('asset.acquired', true,
    'An approved entry debited an enrolled fixed-asset cost account and birthed a register row',
    'ignore', null::text),
  ('asset.depreciated', true,
    'A depreciation charge was materialised against a fixed asset at entry approval',
    'ignore', null::text),
  ('asset.disposed', true,
    'A fixed asset was disposed (in full, or as the disposed portion of a cost-portion split)',
    'ignore', null::text)
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
-- ################## SECTION S2 -- THE REGISTER CORE (helpers, hook, belt) ############
-- #####################################################################################

set role clara_fn_owner;

-- =====================================================================================
-- S2.0 -- SMALL DATE + MONEY PRIMITIVES. Every one of them is IMMUTABLE/STABLE and private:
-- the arithmetic below reads better as named month algebra than as inline date_trunc noise,
-- and a named primitive is a thing the tail census and a reviewer can both point at.
-- =====================================================================================

-- THE MYT LEGAL DATE (the 0016:477 house idiom, restated for D-a). A UTC runtime between
-- 00:00 and 08:00 MYT is a calendar day BEHIND the books it is posting into; every "is this
-- period over" question in this file therefore asks Kuala Lumpur, never the session zone.
create function clara._fa_today() returns date
  language sql stable as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;
revoke all on function clara._fa_today() from public;

create function clara._fa_month_start(p_d date) returns date
  language sql immutable as $$ select date_trunc('month', p_d)::date $$;
revoke all on function clara._fa_month_start(date) from public;

create function clara._fa_month_end(p_d date) returns date
  language sql immutable as $$
  select (date_trunc('month', p_d) + interval '1 month' - interval '1 day')::date $$;
revoke all on function clara._fa_month_end(date) from public;

-- Whole months from a to b (both taken at month grain); negative when b precedes a.
create function clara._fa_month_diff(p_a date, p_b date) returns int
  language sql immutable as $$
  select ((extract(year from p_b)::int * 12 + extract(month from p_b)::int)
        - (extract(year from p_a)::int * 12 + extract(month from p_a)::int)) $$;
revoke all on function clara._fa_month_diff(date, date) from public;

-- A (year, month, day) that never raises on 29 February or a 31st in a 30-day month: the
-- FY-end day is client data, and a client whose year end is stated as the 29th of February
-- must still get an answer every year.
create function clara._fa_ym_date(p_year int, p_month int, p_day int) returns date
  language sql immutable as $$
  select least(make_date(p_year, p_month, 1) + (p_day - 1),
               clara._fa_month_end(make_date(p_year, p_month, 1))) $$;
revoke all on function clara._fa_ym_date(int, int, int) from public;

-- THE FY END GOVERNING A MONTH (design SS1.6/SS3.1). The FY-END MONTH is the grain: the year
-- runs through the first occurrence of that month at or after the given month, and the exact
-- END DATE is the client's stated day inside it. Dec-31 is the FALLBACK, and it is surfaced
-- (get_depreciation_authority returns fallback:true) rather than silently assumed.
create function clara._fa_fy_end_for(p_client uuid, p_month date) returns date
  language sql stable as $$
  select clara._fa_ym_date(
           extract(year from p_month)::int
             + case when extract(month from p_month)::int
                         <= coalesce(c.fy_end_month, 12) then 0 else 1 end,
           coalesce(c.fy_end_month, 12), coalesce(c.fy_end_day, 31))
  from clara.clients c where c.id = p_client $$;
revoke all on function clara._fa_fy_end_for(uuid, date) from public;

-- The month the FY governing p_month opens on (always a month start; the window is exactly
-- twelve months long and ends on the FY-end DATE).
create function clara._fa_fy_open_for(p_client uuid, p_month date) returns date
  language sql stable as $$
  select (date_trunc('month', clara._fa_fy_end_for(p_client, p_month))
          - interval '11 months')::date $$;
revoke all on function clara._fa_fy_open_for(uuid, date) from public;

-- =====================================================================================
-- S2.1 -- ACCUMULATED DEPRECIATION (design SS1.3). THE SIGNED SUM, AS OF A DATE, READ ALONG
-- THE LINEAGE [round-3 fold F1].
--   Accumulated(asset, as_of) = this row's CARRIED BASELINE SHARE
--                             + this row's own ledger rows effective <= as_of
--                             + every ANCESTOR's ledger rows effective <= as_of, pushed DOWN
--                               the lineage by the cost share at each hop.
--
-- WHY A LINEAGE READ AND NOT A BAKE. A supersede-forward revision leaves the PREDECESSOR
-- chargeable for its pre-revision months (SS3.1's Sigma segments), so charges can land on a
-- superseded row AFTER its successor was born. The earlier design BAKED
-- clara._fa_accumulated(predecessor, effective_from - 1) onto the successor at revise time;
-- round 3 measured the consequence on eight assembly-database clients -- the GL held RM14,000
-- and the register read RM2,000, permanently, with no correction path, because the later
-- charge landed on a row every as-of read excludes. THE LAW IS NOW:
--   **a baked accumulated_depreciation_cents NEVER carries ledger content, anywhere.**
-- It holds only the CARRIED (K carry-down) baseline share, which by construction can never
-- move; every reader of "accumulated" goes through this one function, so the shape that broke
-- those eight clients is unrepresentable rather than merely absent.
--
-- THE PUSH-DOWN IS REMAINDER-ABSORBING, exactly like the split's own sen law (WD-R7): at each
-- hop, every successor that is NOT the one named by superseded_by_asset_id takes
-- round(amount x its cost / the parent's cost), and the NAMED (continuing) successor takes the
-- exact complement. A revision hop has a single, named successor, so its share is the WHOLE
-- amount (share = 1). Sibling shares therefore sum to the parent's amount TO THE SEN at every
-- level, which is what makes fa_register_tie provable rather than lucky.
--
-- is_live DOES NOT APPEAR HERE, deliberately [L2/round-2 fold 2]. Putting it in made the
-- answer wrong in both time directions. It exists only so the uniqueness index can exclude
-- superseded charges -- a COVERAGE question, which is a different question from this one.
--
-- REFUSES as_of < baseline_as_of: the register cannot answer for a date before the carried
-- baseline it was seeded with, and inventing a number there is exactly what the DB-owns-every-
-- number law forbids. (The refusal lives on clara._fa_accumulated ONLY; the arithmetic reads
-- through clara._fa_accumulated_at / clara._fa_accumulated_periods_through, which FLOOR instead
-- of refusing -- the reducing-balance basis legitimately asks for the FY open of a row born
-- mid-year, and clara.dispose_fixed_asset restates the refusal by name for its own read.)
-- =====================================================================================

-- The row's OWN ledger content as of a date: +charge / -unwind. No baseline, no lineage.
create function clara._fa_own_ledger(p_asset uuid, p_as_of date) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(sum(case when d.unwind_of is null then d.amount_cents
                           else -d.amount_cents end), 0)::bigint
    from clara.fa_depreciation d
    where d.asset_id = p_asset and d.effective_date <= p_as_of $$;
revoke all on function clara._fa_own_ledger(uuid, date) from public;

-- THE PERIOD-NET COMPANION [round-3.5 fold G1]. Same signed sum, bounded by the PERIOD the
-- charge belongs to instead of the date it took effect -- and every unwind is charged back to
-- ITS ORIGINAL'S period through the unwind_of join, never to the mirror's own dates.
--
-- WHY BOTH READS EXIST. The effective-dated read is the BOOKS' legal view and stays exactly
-- as it is: on 31 December 2025 the books really did hold the charge that was later reversed
-- in August 2026, and every historical/as-of read must go on saying so. But the reducing-
-- balance BASIS is not a historical question -- it asks "how much of this asset has been
-- consumed by the end of the last financial year", and a reverse-then-re-run leaves the
-- effective-dated answer counting the original AND its replacement inside the whole
-- [charge, mirror) window: measured 2,800,000 where the money clock said 1,400,000, a next-FY
-- entitlement of 520,000 instead of 660,000, a monthly cadence posting 104,444 instead of
-- 106,666 the very next month, and a projected schedule that INCREASES year over year -- with
-- register and GL carrying the same wrong figure, so the tie stayed green on it.
--
-- is_live IS STILL ABSENT, DELIBERATELY (SS1.3's law stands VERBATIM): the netting is done by
-- the unwind_of JOIN, which is a fact about lineage, not a coverage flag.
create function clara._fa_own_ledger_periods(p_asset uuid, p_through date) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(sum(case when d.unwind_of is null then d.amount_cents
                           else -d.amount_cents end), 0)::bigint
    from clara.fa_depreciation d
    left join clara.fa_depreciation o on o.id = d.unwind_of
    where d.asset_id = p_asset
      and coalesce(o.period_end, d.period_end) <= p_through $$;
revoke all on function clara._fa_own_ledger_periods(uuid, date) from public;

-- THE LINEAGE READ ITSELF, refusal-free about DATES. Walk UP to the root collecting the path,
-- then push the ledger content back DOWN it, applying the remainder-absorbing cost share at
-- every hop and adding each generation's own ledger as it goes. The queried row's own carried
-- baseline is added LAST and never propagated, because a baseline is already ITS OWN share
-- (revise and split bake the share at birth, and a bake never carries ledger content).
--
-- ONE WALK, TWO READERS [round-3.5 fold G1]. p_by_period switches which own-ledger reader the
-- walk uses and nothing else: the share arithmetic, the remainder absorption and the root bake
-- are shared BY CONSTRUCTION, so the effective-dated view and the period-net view can never
-- drift into two different notions of "this lineage's accumulated depreciation".
create function clara._fa_lineage_walk(p_asset uuid, p_bound date, p_by_period boolean)
  returns bigint
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_path uuid[] := '{}'::uuid[]; v_cur uuid := p_asset; v_hops int := 0; v_n int;
  f record; p record; c record; v_i int; v_amt bigint := 0; v_sib bigint;
begin
  loop
    select fa.id as id, fa.supersedes_asset_id as parent into f
      from clara.fixed_assets fa where fa.id = v_cur;
    if not found then exit; end if;
    v_path := v_path || f.id;
    exit when f.parent is null;
    -- THE CAP REFUSES, IT DOES NOT TRUNCATE [round-3.5 fold G8]. Silently stopping at 64 hops
    -- would return a SMALLER accumulated figure for a deeper lineage -- a wrong number
    -- presented as an answer, which is the one thing this file may never do. 64 supersede hops
    -- on one asset is a corrupted lineage (or a cycle), and it is named as such.
    if v_hops >= 64 then
      raise exception 'fixed-asset lineage for % exceeds 64 supersede hops -- the register cannot answer for a lineage this deep', p_asset
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_lineage_too_deep', 'asset_id', p_asset)::text;
    end if;
    v_cur := f.parent; v_hops := v_hops + 1;
  end loop;
  v_n := coalesce(array_length(v_path, 1), 0);
  if v_n = 0 then return 0; end if;
  -- v_path runs asset -> ... -> root; the ROOT's own ledger seeds the push-down.
  v_amt := case when p_by_period then clara._fa_own_ledger_periods(v_path[v_n], p_bound)
                else clara._fa_own_ledger(v_path[v_n], p_bound) end;
  for v_i in reverse (v_n - 1) .. 1 loop
    select fa.id as id, fa.cost_cents as cost, fa.superseded_by_asset_id as named into p
      from clara.fixed_assets fa where fa.id = v_path[v_i + 1];
    select fa.id as id, fa.cost_cents as cost into c
      from clara.fixed_assets fa where fa.id = v_path[v_i];
    if p.cost is null or p.cost <= 0 then
      -- NOT A SILENT ZERO [round-3.5 fold G8]. Every register row is born from a positive
      -- debit (the soft-birth), a positive carried baseline (K), or a split portion the verb
      -- bounds strictly inside (0, cost), so a non-positive parent cost is unreachable today.
      -- If one ever appears, returning 0 would hand back a fabricated accumulated figure for
      -- the whole lineage below it; the honest answer is a named refusal.
      raise exception 'fixed asset % carries a non-positive cost and cannot pro-rate its lineage''s accumulated depreciation', p.id
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_lineage_cost_invalid',
            'asset_id', p.id, 'cost_cents', p.cost)::text;
    elsif c.id = p.named then
      -- THE CONTINUING (named) SUCCESSOR ABSORBS THE REMAINDER.
      -- INVARIANT behind the `status <> 'unwound'` filter: an UNWOUND sibling was never really
      -- born (its governing entry was reversed), so it holds no share -- and excluding it here
      -- is what keeps the siblings' shares summing to the parent's amount TO THE SEN. Were an
      -- unwound row counted, the continuing successor's remainder would be short by that
      -- phantom share and fa_register_tie would break by exactly it.
      select coalesce(sum(round(v_amt::numeric * s.cost_cents / p.cost)), 0)::bigint
        into v_sib from clara.fixed_assets s
        where s.supersedes_asset_id = p.id and s.id <> c.id and s.status <> 'unwound';
      v_amt := v_amt - v_sib;
    else
      v_amt := round(v_amt::numeric * c.cost / p.cost)::bigint;
    end if;
    v_amt := v_amt + case when p_by_period then clara._fa_own_ledger_periods(c.id, p_bound)
                          else clara._fa_own_ledger(c.id, p_bound) end;
  end loop;
  return v_amt + coalesce((select fa.accumulated_depreciation_cents
                           from clara.fixed_assets fa where fa.id = p_asset), 0);
end $$;
revoke all on function clara._fa_lineage_walk(uuid, date, boolean) from public;

-- THE EFFECTIVE-DATED READER -- the books' legal view, and what every historical/as-of read
-- (the tie, the lists, the asset projection) goes through.
create function clara._fa_accumulated_at(p_asset uuid, p_as_of date) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._fa_lineage_walk(p_asset, p_as_of, false) $$;
revoke all on function clara._fa_accumulated_at(uuid, date) from public;

-- THE PERIOD-NET READER [round-3.5 fold G1] -- "what has this lineage actually consumed
-- through the end of this period", with a reversal netted against the period it corrected
-- rather than against the date the correction posted. EXACTLY TWO consumers, both of which
-- ask a MONEY question rather than a historical one: the reducing-balance FY-open basis, and
-- the disposal's accumulated-depreciation relief leg. Nothing else may use it -- an as-of read
-- that netted by period would tell a professional their December books held a figure the
-- December books did not hold.
create function clara._fa_accumulated_periods_through(p_asset uuid, p_through date) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._fa_lineage_walk(p_asset, p_through, true) $$;
revoke all on function clara._fa_accumulated_periods_through(uuid, date) from public;

create function clara._fa_accumulated(p_asset uuid, p_as_of date) returns bigint
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_baseline_as_of date; v_id uuid;
begin
  select fa.id, fa.baseline_as_of into v_id, v_baseline_as_of
    from clara.fixed_assets fa where fa.id = p_asset;
  if not found then
    raise exception 'fixed asset % does not exist', p_asset
      using errcode = 'CLR37', detail = '{"reason":"fa_asset_missing"}';
  end if;
  if v_baseline_as_of is not null and p_as_of < v_baseline_as_of then
    raise exception 'the register cannot answer for % -- this asset carries a baseline as of %', p_as_of, v_baseline_as_of
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_before_baseline', 'asset_id', p_asset,
          'baseline_as_of', v_baseline_as_of, 'requested_as_of', p_as_of)::text;
  end if;
  return clara._fa_accumulated_at(p_asset, p_as_of);
end $$;
revoke all on function clara._fa_accumulated(uuid, date) from public;

-- The DATELESS total -- what the MONEY CLOCK reads. Due-ness has already excluded charged
-- months, so this is "everything the lineage holds for this asset", which is the correct
-- denominator for "how much is left to charge". LINEAGE-AWARE for the same F1 reason: a
-- charge that lands on a superseded predecessor must shrink its successor's money clock.
create function clara._fa_accumulated_total(p_asset uuid) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._fa_accumulated_at(p_asset, 'infinity'::date) $$;
revoke all on function clara._fa_accumulated_total(uuid) from public;

-- clara._fa_lineage_accumulated WAS HERE and is GONE [round-3.5 fold G1, recorded as a named
-- deviation from the round-3 record]. It existed for exactly ONE caller -- the reducing-balance
-- FY-open basis -- as "clara._fa_accumulated without the pre-baseline refusal", and that caller
-- has moved to clara._fa_accumulated_periods_through. Leaving a second, subtly-different money
-- reader in the file with no consumer is the same two-answers-to-one-question shape the F3 fold
-- spent a whole section deleting: the next writer would pick by name, not by meaning. The floor
-- affordance is NOT lost -- clara._fa_accumulated_at is exactly that read, under a name that
-- says what it does.

-- A live charge covering any part of [p_from, p_to] for this asset. is_live IS the coverage
-- predicate (see the note above): an unwound charge frees its months for a corrected re-run.
create function clara._fa_range_covered(p_asset uuid, p_from date, p_to date) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (select 1 from clara.fa_depreciation d
                 where d.asset_id = p_asset and d.is_live
                   and d.period_start <= p_to and d.period_end >= p_from) $$;
revoke all on function clara._fa_range_covered(uuid, date, date) from public;

-- The asset's first CHARGEABLE month: the in-service month, floored by the month AFTER the
-- carried baseline (the Codex round-1 fold -- without the lower bound a catch-up would
-- re-depreciate history the carry-down already booked into the baseline).
create function clara._fa_first_chargeable_month(p_asset uuid) returns date
  language sql stable security definer set search_path = clara, pg_temp as $$
  select greatest(clara._fa_month_start(fa.depreciation_start_date),
                  case when fa.baseline_as_of is not null
                       then (clara._fa_month_start(fa.baseline_as_of) + interval '1 month')::date
                  end)
  from clara.fixed_assets fa where fa.id = p_asset $$;
revoke all on function clara._fa_first_chargeable_month(uuid) from public;

-- Is there an un-dead draft carrying an fa_disposal proposal for this asset, dated at or
-- before p_through? A pending disposal FREEZES charging -- the maker/checker race at a month
-- boundary is closed by refusal, not by luck [L2/round-2 majors].
--
-- TAKES THE CLIENT [round-3 fold F10]. Both callers already know it, and without it this is a
-- SEQUENTIAL SCAN of clara.journal_entries once per candidate asset inside the sweep's hot
-- loop -- O(#clients x #assets x |journal_entries|) per leader cycle against a table that only
-- grows (measured: 0.884 ms and 291 buffers per call on a 5,847-entry assembly database). The
-- partial index below is what the predicate rides.
create function clara._fa_disposal_draft_outstanding(p_client uuid, p_asset uuid,
    p_through date)
  returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.journal_entries je
    where je.client_id = p_client and je.status = 'draft' and je.flags ? 'fa_disposal'
      and (je.flags -> 'fa_disposal' ->> 'asset_id')::uuid = p_asset
      and (je.flags -> 'fa_disposal' ->> 'disposal_date')::date <= p_through) $$;
revoke all on function clara._fa_disposal_draft_outstanding(uuid, uuid, date) from public;

-- =====================================================================================
-- S2.2 -- THE ARITHMETIC (design SS3.1). DB-OWNED, MONTH-GRAIN, PER-ASSET, CADENCE-AWARE.
-- One asset in, the charge rows it is due through p_through out. The run verb and the
-- disposal stub call the SAME function, which is what makes "the disposal month is charged"
-- free rather than a second implementation of the same schedule.
--
-- CONVENTIONS OF RECORD (design SS9.1): the in-service month is charged; the disposal month
-- is charged; there is no daily pro-rata.
--
-- p_terminal = "this is the asset's LAST charge" (the disposal stub). It matters only to
-- reducing balance, where it moves the FY segment's end -- and therefore the true-up -- onto
-- p_through's month (design SS3.1: "the true-up rides whichever charge terminates the asset's
-- FY charging -- a December run, a life-end clamp, or the disposal stub").
--
-- ONE CHARGE ROW PER CONTIGUOUS UNCHARGED BLOCK (assembly adjudication 4): an unwound middle
-- month leaves a hole, and a single row spanning it would collide with the live charge on the
-- far side. Emitting per block makes the SS1.3 overlap refusal unreachable from this
-- function's own output, which is the honest way to hold an invariant.
-- =====================================================================================
create function clara._fa_asset_charges(p_asset uuid, p_through date,
                                        p_terminal boolean default false)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  -- %ROWTYPE, not record: clara._fa_particulars_complete takes the composite type and a
  -- plpgsql `record` cannot be cast to it.
  fa clara.fixed_assets%rowtype;
  v_res bigint; v_life int; v_start_month date; v_first date; v_last date;
  v_accum bigint; v_remaining bigint; v_monthly bigint; v_amt bigint;
  v_elapsed int; v_date_left int; v_money_left int; v_left int;
  v_charges jsonb := '[]'::jsonb; v_total bigint := 0; v_months jsonb := '[]'::jsonb;
  v_run_start date; v_run_prev date; v_run_amt bigint := 0;
  v_cur_fy date; v_fy_open date; v_basis_as_of date; v_basis bigint;
  v_annual bigint; v_seg_start date; v_seg_end date; v_seg_months int;
  v_seg_total bigint; v_seg_monthly bigint; v_seg_charged bigint;
  v_life_end_month date; v_k int; v_skip text := null; g record;
  v_supersede_last date;
begin
  select * into fa from clara.fixed_assets where id = p_asset;
  if not found then
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'not_in_service');
  end if;
  -- A SUPERSEDED row is still chargeable for the months BEFORE its supersede date. That is
  -- what makes SS3.1's "FY total = Sigma segments" true: a supersede-forward revision leaves
  -- the OLD rate on the predecessor row, so the FY's pre-revision months can only be charged
  -- from it (the annual worked figure -- 20% Jan..Sep + 10% Oct..Dec -- is unreachable
  -- otherwise). Its window is closed at superseded_at, so predecessor and successor months
  -- can never overlap. Every other status is out of service.
  if fa.status not in ('active', 'superseded') then
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'not_in_service');
  end if;
  if fa.status = 'superseded' then
    if fa.superseded_at is null then
      return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'not_in_service');
    end if;
    v_supersede_last := clara._fa_month_start(fa.superseded_at - 1);
  end if;
  if not clara._fa_particulars_complete(fa) then
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'incomplete');
  end if;
  if fa.depreciation_method = 'none' then
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'none_method');
  end if;
  if fa.depreciation_start_date > p_through then
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'not_in_service');
  end if;

  v_res := coalesce(fa.residual_cents, 0);
  v_life := fa.useful_life_months;
  v_start_month := clara._fa_month_start(fa.depreciation_start_date);
  v_life_end_month := (v_start_month + make_interval(months => v_life - 1))::date;
  v_first := clara._fa_first_chargeable_month(p_asset);
  v_last := clara._fa_month_start(least(p_through, coalesce(fa.disposed_at, p_through)));
  if v_supersede_last is not null then v_last := least(v_last, v_supersede_last); end if;
  v_accum := clara._fa_accumulated_total(p_asset);
  if fa.cost_cents - v_res - v_accum <= 0 then
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', 'fully_depreciated');
  end if;
  if v_first is null or v_first > v_last then
    -- Nothing due. NOT a skip: an asset with no uncharged month is simply up to date, and
    -- reporting it as "skipped" would make the receipt's skip list meaningless.
    return jsonb_build_object('charges', '[]'::jsonb, 'amount_cents', 0, 'months', '[]'::jsonb, 'skip_reason', null);
  end if;

  -- floor((cost - residual) / life), floored at one sen so a sub-life-priced asset still
  -- depreciates instead of dividing by zero.
  v_monthly := case when fa.depreciation_method = 'straight_line'
                    then greatest((fa.cost_cents - v_res) / v_life, 1) end;

  for g in select s::date as m from generate_series(v_first, v_last, interval '1 month') s loop
    -- A month a live charge already covers closes the contiguous block and is stepped over.
    if clara._fa_range_covered(p_asset, g.m, clara._fa_month_end(g.m)) then
      if v_run_start is not null then
        v_charges := v_charges || jsonb_build_object('asset_id', p_asset,
          'period_start', v_run_start, 'period_end', clara._fa_month_end(v_run_prev),
          'amount_cents', v_run_amt);
        v_run_start := null; v_run_amt := 0;
      end if;
      continue;
    end if;

    v_remaining := fa.cost_cents - v_res - v_accum;
    if v_remaining <= 0 then
      v_skip := 'fully_depreciated';
      exit;
    end if;

    if fa.depreciation_method = 'straight_line' then
      -- THE MONEY CLOCK IS AUTHORITATIVE ON DIVERGENCE (design SS2.3; assembly adjudication
      -- 3). Remaining months = least(money clock, date clock) while the date clock still has
      -- months, and the money clock ALONE once it is exhausted -- which is the carried-asset
      -- case, where the baseline says more or less is left than the elapsed calendar does.
      -- The month whose remaining-count reaches one charges the exact remainder, which is
      -- SS3.1's "the final month charges cost - residual - Accumulated exactly".
      v_elapsed := clara._fa_month_diff(v_start_month, g.m);
      v_date_left := v_life - v_elapsed;
      v_money_left := ceil(v_remaining::numeric / v_monthly)::int;
      v_left := case when v_date_left <= 0 then v_money_left
                     else least(v_money_left, v_date_left) end;
      if v_left <= 1 then v_amt := v_remaining;
      else v_amt := least(v_monthly, v_remaining); end if;
    else
      -- REDUCING BALANCE: FY-GRAIN, MONTH-SEGMENTED, PROSPECTIVE (design SS3.1).
      if v_cur_fy is distinct from clara._fa_fy_end_for(fa.client_id, g.m) then
        -- A CHARGE BLOCK NEVER STRADDLES AN FY BOUNDARY [round-3 fold F2b]. The stored ledger
        -- row is (period_start, period_end, amount); the segment true-up below re-derives
        -- "what this segment already charged" from those rows, and a block spanning two FYs
        -- could not be decomposed back into per-FY amounts (the monthly figures differ across
        -- the boundary, so any apportionment would corrupt the sen law). Closing the block at
        -- the boundary makes every stored row belong to exactly one FY -- and therefore to
        -- exactly one segment -- so the re-derivation is exact rather than approximate.
        if v_run_start is not null then
          v_charges := v_charges || jsonb_build_object('asset_id', p_asset,
            'period_start', v_run_start, 'period_end', clara._fa_month_end(v_run_prev),
            'amount_cents', v_run_amt);
          v_run_start := null; v_run_amt := 0;
        end if;
        v_cur_fy := clara._fa_fy_end_for(fa.client_id, g.m);
        v_fy_open := clara._fa_fy_open_for(fa.client_id, g.m);
        -- THE CARRIED-ASSET COLLISION, CLOSED BY THE greatest [L2/round-2 fold 7]: a basis
        -- read at FY-open-minus-one would refuse outright on a CARRIED asset whose baseline
        -- is LATER than that, so the basis date is the later of the two. A SPLIT SUCCESSOR is
        -- the opposite case -- its baseline IS the split -- and clamping the basis to it would
        -- re-base the continuing asset onto its post-split NBV mid-year, contradicting SS3.1's
        -- split law ("each successor's remaining-FY entitlement is its cost-share of the
        -- parent's"). The lineage read answers the FY open by walking up and pro-rating.
        v_basis_as_of := case when fa.supersedes_asset_id is not null then v_fy_open - 1
                              else greatest(v_fy_open - 1, fa.baseline_as_of) end;
        -- NO FROZEN SNAPSHOT STANDS IN FOR A COMPUTED READ [round-3 fold F2a]. The basis is
        -- ALWAYS the lineage figure through FY-open-minus-one PLUS whatever THIS call has
        -- already projected (v_total) -- which is by construction only months earlier than this
        -- FY, since this branch runs on the first month of the FY the loop meets. That second
        -- term is the whole reason a snapshot was here at all: a multi-year schedule projection
        -- must see its OWN year-1 charges, which the ledger cannot hold. The earlier form read
        -- the DATELESS accumulated total whenever the loop entered an FY at its opening month,
        -- which silently subtracted LATER months of the SAME FY: the design's own correction law
        -- (reverse a month, re-run it) then under-depreciated the closed year by hundreds of
        -- ringgit, with register and GL carrying the same wrong number so fa_register_tie stayed
        -- green (measured: 136,111 instead of 166,666; 108,888 instead of 133,333).
        --
        -- AND THE READ IS PERIOD-NET, NOT EFFECTIVE-DATED [round-3.5 fold G1]. "How much has
        -- this asset been depreciated by the end of last year" is a MONEY question, not a
        -- historical one. The effective-dated read answers it wrongly after the design's OWN
        -- correction law is exercised: reverse a closed year and re-run it, and the original
        -- charge (effective inside the year) and its replacement (also effective inside the
        -- year) are BOTH counted at FY close while the unwind -- effective at the mirror's
        -- posting date, months later -- is not. Measured on the assembly corpus: 2,800,000
        -- instead of 1,400,000; next-FY entitlement 520,000 instead of 660,000; the next month
        -- of a monthly cadence 104,444 instead of 106,666; and a projected series that INCREASES
        -- year over year. Netting by PERIOD assigns the unwind to the period it corrected, so
        -- the basis tracks the money clock exactly. Every historical/as-of read in this file
        -- keeps effective-date semantics -- that IS the books' legal view.
        v_basis := fa.cost_cents
                 - (clara._fa_accumulated_periods_through(p_asset, v_basis_as_of) + v_total);
        if v_basis < 0 then v_basis := 0; end if;
        v_annual := round(v_basis::numeric * fa.depreciation_rate_bps / 10000)::bigint;
        -- The SEGMENT is this asset row's chargeable span inside the FY. Segments arise from
        -- supersede-forward revisions (each rate lives on its own row), from a mid-year
        -- in-service date, from the life end, and -- when this call IS the terminating one --
        -- from the disposal month.
        v_seg_start := greatest(v_fy_open, v_first);
        v_seg_end := clara._fa_month_start(v_cur_fy);
        if p_terminal then
          v_seg_end := least(v_seg_end, clara._fa_month_start(p_through));
        end if;
        if v_life_end_month >= v_seg_start then
          v_seg_end := least(v_seg_end, v_life_end_month);
        end if;
        -- A supersede-forward revision ENDS this row's segment (SS3.1: "segments arise from
        -- supersede-forward revisions"), so months_s is the pre-revision span and the
        -- entitlement pro-rates on it -- 1,600,000 x 9/12, never x 12/12.
        if v_supersede_last is not null then
          v_seg_end := least(v_seg_end, v_supersede_last);
        end if;
        v_seg_months := greatest(clara._fa_month_diff(v_seg_start, v_seg_end) + 1, 1);
        -- entitlement_s = round(basis x rate) x months_s / 12, floored; the sen law is
        -- floor-monthly with the segment's LAST charged month absorbing the difference.
        v_seg_total := (v_annual * v_seg_months) / 12;
        v_seg_monthly := v_seg_total / v_seg_months;
        -- CHARGES ALREADY MADE INSIDE THIS SEGMENT, re-derived from the LEDGER's own periods
        -- [round-3 fold F2b]. The earlier form seeded this from an effective-date delta at
        -- g.m - 1 and thereafter accumulated only THIS call's projections, so a month the loop
        -- later STEPPED OVER (already covered by a live charge) never entered it and the
        -- terminating true-up over-charged by exactly those months' total -- measured
        -- 1,833,334 where 1,166,670 was owed, reachable by any span crossing a hole (an
        -- annual run after a single-month reversal, or the disposal stub). Seeding from the
        -- live rows whose PERIOD falls in this segment counts every already-charged month
        -- once, whether the loop meets it before or after this recompute; per-month
        -- projections are then added as they are emitted, below. Blocks never straddle an FY
        -- (see the flush above), so period_start decides segment membership exactly.
        v_seg_charged := coalesce((select sum(d.amount_cents) from clara.fa_depreciation d
                                   where d.asset_id = p_asset and d.is_live
                                     and d.period_start >= v_seg_start
                                     and d.period_start <= v_seg_end), 0);
      end if;
      v_k := clara._fa_month_diff(v_seg_start, g.m) + 1;
      if v_k >= v_seg_months then
        v_amt := v_seg_total - v_seg_charged;   -- the terminating charge carries the true-up
      else
        v_amt := v_seg_monthly;
      end if;
      if v_amt < 0 then v_amt := 0; end if;     -- a negative true-up clamps to zero
      v_amt := least(v_amt, v_remaining);       -- never below residual
      if clara._fa_month_diff(v_start_month, g.m) + 1 >= v_life then
        v_amt := v_remaining;                   -- RB terminates at life end: NBV - residual
      end if;
      v_seg_charged := v_seg_charged + v_amt;
    end if;

    if v_amt <= 0 then
      if v_run_start is not null then
        v_charges := v_charges || jsonb_build_object('asset_id', p_asset,
          'period_start', v_run_start, 'period_end', clara._fa_month_end(v_run_prev),
          'amount_cents', v_run_amt);
        v_run_start := null; v_run_amt := 0;
      end if;
      continue;
    end if;

    if v_run_start is null then v_run_start := g.m; v_run_amt := 0; end if;
    v_run_prev := g.m;
    v_run_amt := v_run_amt + v_amt;
    v_accum := v_accum + v_amt;
    v_total := v_total + v_amt;
    -- The PER-MONTH detail rides alongside the blocks so the /assets schedule surface can be
    -- DB-PROJECTED (design SS6, "never computed client-side") from this one arithmetic rather
    -- than from a second implementation of it. The hook's freshness comparison reads only
    -- 'charges', so this key costs the proposal contract nothing.
    v_months := v_months || jsonb_build_object('month', g.m, 'amount_cents', v_amt);
  end loop;

  if v_run_start is not null then
    v_charges := v_charges || jsonb_build_object('asset_id', p_asset,
      'period_start', v_run_start, 'period_end', clara._fa_month_end(v_run_prev),
      'amount_cents', v_run_amt);
  end if;
  -- A fully-depreciated exit only counts as a SKIP when it produced nothing at all; an asset
  -- whose final month landed inside this run charged honestly and is not skipped.
  if v_total > 0 then v_skip := null; end if;
  return jsonb_build_object('charges', v_charges, 'amount_cents', v_total,
                            'months', v_months, 'skip_reason', v_skip);
end $$;
revoke all on function clara._fa_asset_charges(uuid, date, boolean) from public;

-- =====================================================================================
-- S2.2b -- THE ONE DUE ORACLE [round-3 fold F3]. Round 3 found THREE separate answers to
-- "what does this asset owe this month" -- the arithmetic (clara._fa_asset_charges), the
-- sweep's due probe, and the WD-R6 workbench advisory -- kept in agreement only informally,
-- and measured them diverging in both directions:
--   * a month whose analytic charge is ZERO (an RB asset under ~RM1: annual entitlement below
--     twelve sen, so integer monthly division floors to nothing) was "uncharged" forever to
--     the bare month-coverage probe. The verb persisted nothing, the period stayed unmet, the
--     sequencing law then refused EVERY later period, and the client's whole register froze
--     while the sweep burned its 24-call cap every day.
--   * a SUPERSEDED predecessor's uncharged months are charged by the computation but were
--     invisible to both the due probe and the advisory (both filtered status='active'), so a
--     lawful prospective revision silently stranded real depreciation with every instrument
--     reporting green.
-- ONE ORACLE, STATED AS AN EQUIVALENCE: an asset is due for a month iff the arithmetic
-- actually emits a charge for it. An analytically-zero month is simply NOT DUE (and a later
-- backdated completion or cost change lawfully revives it, because the oracle re-asks the
-- arithmetic); a superseded row's owed months ARE due, bounded at month_start(superseded_at-1)
-- because that is where clara._fa_asset_charges itself stops.
-- =====================================================================================
create function clara._fa_first_due_month(p_asset uuid, p_through date) returns date
  language sql stable security definer set search_path = clara, pg_temp as $$
  select min((x ->> 'month')::date)
    from jsonb_array_elements(
           clara._fa_asset_charges(p_asset, p_through, false) -> 'months') x $$;
revoke all on function clara._fa_first_due_month(uuid, date) from public;

-- The same question asked of the whole LINEAGE (this row and every ancestor). A disposal must
-- not proceed while an ANCESTOR still owes months earlier than the disposal period -- the
-- per-asset precondition read only the disposed row, which is half the mechanism by which a
-- revision could strand its predecessor's months permanently [round-3 fold F3 / STR minor 6].
create function clara._fa_lineage_first_due_month(p_asset uuid, p_through date) returns date
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_cur uuid := p_asset; v_hops int := 0; v_min date; v_one date;
begin
  while v_cur is not null loop
    -- THE CAP REFUSES, IT DOES NOT TRUNCATE [round-3.5 fold G8]. This answer gates a DISPOSAL;
    -- silently stopping the walk would return "nothing owed" for a lineage too deep to read,
    -- which is the failure mode the whole precondition exists to prevent.
    if v_hops >= 64 then
      raise exception 'fixed-asset lineage for % exceeds 64 supersede hops -- the register cannot answer what it still owes', p_asset
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_lineage_too_deep', 'asset_id', p_asset)::text;
    end if;
    v_one := clara._fa_first_due_month(v_cur, p_through);
    if v_one is not null and (v_min is null or v_one < v_min) then v_min := v_one; end if;
    select fa.supersedes_asset_id into v_cur from clara.fixed_assets fa where fa.id = v_cur;
    v_hops := v_hops + 1;
  end loop;
  return v_min;
end $$;
revoke all on function clara._fa_lineage_first_due_month(uuid, date) from public;

-- THE SAME QUESTION ASKED OF THE ANCESTORS ONLY [round-3.5 fold G2]. The disposal precondition
-- needs two different bounds at once: this row's own months inside the disposal period are STUB
-- territory (the disposal charges them itself), while an ANCESTOR's months in that same period
-- are RUN territory and nothing will ever charge them once the successor is disposed. Asking
-- the whole lineage through the disposal date would refuse every disposal (the disposed row is
-- always "due" for its own disposal month); asking only the ancestors through it is exactly the
-- gap the arithmetic lens measured.
create function clara._fa_ancestors_first_due_month(p_asset uuid, p_through date) returns date
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._fa_lineage_first_due_month(f.supersedes_asset_id, p_through)
    from clara.fixed_assets f
   where f.id = p_asset and f.supersedes_asset_id is not null $$;
revoke all on function clara._fa_ancestors_first_due_month(uuid, date) from public;

-- =====================================================================================
-- S2.3 -- THE CLIENT-WIDE PERIOD COMPUTATION. Per-asset due-ness (design SS3.1) means the
-- period bound is an UPPER bound, never a window: an asset completed late catches up its
-- whole uncharged history into the current run, which is the only reading under which a
-- register that was incomplete for three months can ever become correct without a human
-- inventing back-dated entries.
-- =====================================================================================
create function clara._fa_compute_charges(p_client uuid, p_period_start date, p_period_end date)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  fa record; v_one jsonb; v_charges jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb;
  v_total bigint := 0; v_n int := 0;
begin
  for fa in select * from clara.fixed_assets f
            where f.client_id = p_client and f.status in ('active', 'superseded')
            order by f.acquired_date, f.id loop
    -- THE DISPOSAL-DRAFT FREEZE IS APPLIED TO BOTH STATUSES, FIRST [round-3.5 fold G6]. The
    -- earlier form let the SUPERSEDED branch `continue` before ever reaching this check, while
    -- clara._fa_oldest_unmet_period applied it to every status -- a ONE-DIRECTIONAL divergence
    -- between the oracle and the computation, which is exactly what the F3 fold made
    -- structurally impossible for every other filter. A frozen asset is neither due nor
    -- charged; the freeze wins in both bodies, at the same moment, for the same rows.
    if clara._fa_disposal_draft_outstanding(p_client, fa.id, p_period_end) then
      -- ...but a SUPERSEDED row still contributes no SKIP row (see below): a receipt whose
      -- skip list named superseded predecessors would be unreadable.
      if fa.status <> 'superseded' then
        v_skipped := v_skipped || jsonb_build_object('asset_id', fa.id,
          'reason', 'disposal_draft_outstanding');
      end if;
      continue;
    end if;
    -- A SUPERSEDED predecessor contributes its pre-revision segment (SS3.1's Sigma segments)
    -- and NOTHING else: it is never a chase target, so it never contributes a SKIP row.
    if fa.status = 'superseded' then
      v_one := clara._fa_asset_charges(fa.id, p_period_end, false);
      if jsonb_array_length(v_one -> 'charges') > 0 then
        v_charges := v_charges || (v_one -> 'charges');
        v_total := v_total + (v_one ->> 'amount_cents')::bigint;
        v_n := v_n + jsonb_array_length(v_one -> 'charges');
      end if;
      continue;
    end if;
    v_one := clara._fa_asset_charges(fa.id, p_period_end, false);
    if (v_one ->> 'skip_reason') is not null then
      v_skipped := v_skipped || jsonb_build_object('asset_id', fa.id,
        'reason', v_one ->> 'skip_reason');
      continue;
    end if;
    v_charges := v_charges || (v_one -> 'charges');
    v_total := v_total + (v_one ->> 'amount_cents')::bigint;
    v_n := v_n + jsonb_array_length(v_one -> 'charges');
  end loop;
  return jsonb_build_object('charges', v_charges, 'skipped', v_skipped,
    'charged_cents', v_total, 'entries', v_n,
    'period_start', p_period_start, 'period_end', p_period_end);
end $$;
revoke all on function clara._fa_compute_charges(uuid, date, date) from public;

-- =====================================================================================
-- S2.4 -- THE OLDEST UNMET PERIOD (pin sheet SS2; design SS3.4 "call the oldest unmet
-- period"). DB-OWNED DUE ARITHMETIC: the sweep must not compute a period, because computing
-- one is computing a figure. Also the run verb's own sequencing oracle -- one function, so
-- "the period the sweep calls" and "the period the verb accepts" can never diverge.
-- =====================================================================================
create function clara._fa_oldest_unmet_period(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare au record; v_today date; v_horizon date; v_first date; v_ps date; v_pe date;
        fa record; v_one date;
begin
  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status = 'live';
  if not found then
    return jsonb_build_object('due', false, 'reason', 'authority_not_live');
  end if;
  v_today := clara._fa_today();
  v_horizon := clara._fa_month_end(v_today);
  -- DRAFT-N BLOCKS N+1 [L2/round-2 fold 1]. The sweep never calls into a refusal it can
  -- predict, so the probe answers false rather than letting the verb raise.
  if exists (select 1 from clara.journal_entries je
             where je.client_id = p_client and je.status = 'draft'
               and je.flags ? 'depreciation_charges') then
    return jsonb_build_object('due', false, 'reason', 'period_draft_outstanding');
  end if;
  -- THE ONE ORACLE (S2.2b): due-ness is what the ARITHMETIC emits, over exactly the status
  -- scope the computation charges [round-3 fold F3]. Every filter the earlier form spelled out
  -- here -- method, completeness, the money clock, the supersede bound, the disposal month --
  -- now lives inside clara._fa_asset_charges, which is the only place it can never drift from
  -- what actually posts. The outstanding-disposal-draft freeze stays here because it is a
  -- CLIENT-scope sequencing fact, not part of an asset's schedule.
  -- THE SHRINKING HORIZON [round-3.5 fold G6, cheap win]. Only the EARLIEST due month matters,
  -- so once a candidate is in hand every later asset is asked a strictly smaller question: bound
  -- it at the day before the current minimum and the arithmetic stops at that month instead of
  -- projecting the whole horizon. Semantically identical (the answer is still min over assets);
  -- measurably cheaper on a client with many assets, which is the sweep's hot loop.
  for fa in select f.id as id from clara.fixed_assets f
            where f.client_id = p_client and f.status in ('active', 'superseded')
            order by f.acquired_date, f.id loop
    if clara._fa_disposal_draft_outstanding(p_client, fa.id, v_horizon) then
      continue;
    end if;
    v_one := clara._fa_first_due_month(fa.id,
               case when v_first is null then v_horizon else v_first - 1 end);
    if v_one is not null then v_first := v_one; end if;
  end loop;
  if v_first is null then
    return jsonb_build_object('due', false, 'reason', 'nothing_due');
  end if;
  if au.cadence = 'monthly' then
    v_ps := v_first; v_pe := clara._fa_month_end(v_first);
  else
    v_ps := clara._fa_fy_open_for(p_client, v_first);
    v_pe := clara._fa_fy_end_for(p_client, v_first);
  end if;
  -- A period is DUE only once it has ENDED (design SS3.1). MYT, never the session zone.
  if v_pe >= v_today then
    return jsonb_build_object('due', false, 'reason', 'period_not_ended');
  end if;
  return jsonb_build_object('due', true, 'period_start', v_ps, 'period_end', v_pe,
    'cadence', au.cadence);
end $$;
revoke all on function clara._fa_oldest_unmet_period(uuid) from public;

-- =====================================================================================
-- S2.4b -- REVERSAL DEPENDENCY LAW (design SS2.4) [round-3 folds F4 + F6]. Two facts, stated
-- once, so the approve-time twin and the VERB-side guard can never answer differently.
--
-- (1) REVISION LINEAGE IS PART OF THE ACQUISITION. A revision is not an entry -- there is no
--     verb that reverses one -- so the earlier "any successor exists" descendants probe made
--     an acquisition PERMANENTLY un-reversible the moment anyone revised the asset's
--     particulars: a mis-coded supplier invoice became uncorrectable, and the refusal's own
--     remedy ("reverse those first") named an entry that does not exist. The law is now
--     explicit: reversing an acquisition unwinds the WHOLE revision chain it grew, and only a
--     DISPOSAL or SPLIT descendant -- which has a real entry, hence a followable remedy --
--     refuses. UNWOUND rows never count as descendants; the earlier status-blind probe left
--     design SS2.4's "refuses UNTIL those are reversed" with no reachable "until".
-- (2) THE LINEAGE WALK STOPS AT A SPLIT. A revision hop is "exactly one non-unwound successor,
--     carrying no disposal of its own"; anything else is a split (its disposed portion is born
--     carrying the split entry's disposal_entry_id) and is left OUT of the set, which is what
--     the descendants refusal then detects -- a non-unwound successor of a lineage row that
--     the walk refused to absorb.
-- =====================================================================================
-- THE CLOSURE, SEEDED [round-3.5 fold G5]. The recursive step below is the certified round-3
-- algebra, byte for byte; all that changed is that the SEED is now a parameter, so the SPLIT
-- arm can ask the same question of a split's children that the ACQUISITION arm asks of an
-- entry's births. It is one closure with two entry points, never two closures -- a forked copy
-- is how the two arms would come to disagree about what "a clean revision chain" means.
create function clara._fa_revision_closure(p_seed uuid[]) returns uuid[]
  language sql stable security definer set search_path = clara, pg_temp as $$
  with recursive walk(id, status) as (
    select f.id, f.status from clara.fixed_assets f where f.id = any(p_seed)
    union
    select s.id, s.status
      from walk w
      join clara.fixed_assets s on s.supersedes_asset_id = w.id
     where w.status <> 'unwound' and s.status <> 'unwound'
       and s.disposal_entry_id is null
       and (select count(*) from clara.fixed_assets s2
             where s2.supersedes_asset_id = w.id and s2.status <> 'unwound') = 1
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from walk $$;
revoke all on function clara._fa_revision_closure(uuid[]) from public;

create function clara._fa_reversal_lineage(p_original uuid) returns uuid[]
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._fa_revision_closure(
           (select coalesce(array_agg(f.id), '{}'::uuid[]) from clara.fixed_assets f
             where f.acquisition_entry_id = p_original)) $$;
revoke all on function clara._fa_reversal_lineage(uuid) from public;

-- THE THREE PROBES, FACTORED [round-3 fold F6]. clara.reverse_entry calls this BEFORE it mints
-- the mirror and the hook calls it again at approve. The contract asks for the refusal in "verb
-- AND hook twin" (SS4); only the hook half had shipped, so a professional reversing a
-- high-stakes FA acquisition got a success receipt for an act that could never complete -- the
-- drafted mirror sat in the queue permanently un-approvable. Raising from ONE body is what
-- keeps the two sites' tokens identical.
create function clara._fa_reversal_blocked(p_original uuid) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare o record; v_lin uuid[]; v_kids uuid[]; a record; su record; v_portion text;
begin
  select * into o from clara.journal_entries where id = p_original;
  if not found or o.is_opening_balance then return; end if;

  -- (a) ACQUISITION REVERSAL. Dependency order first (design SS2.4): a disposal mints its own
  -- stub charges, so probing live charges first would answer "reverse the depreciation runs
  -- first" for an asset whose only live charges ARE a descendant disposal's stub.
  v_lin := clara._fa_reversal_lineage(p_original);
  if array_length(v_lin, 1) is not null then
    if exists (select 1 from clara.fixed_assets f
               where f.id = any(v_lin) and f.status <> 'unwound'
                 and f.disposal_entry_id is not null)
       or exists (select 1 from clara.fixed_assets s
                  where s.supersedes_asset_id = any(v_lin) and s.status <> 'unwound'
                    and not (s.id = any(v_lin))) then
      raise exception 'this acquisition has disposal or split descendants; reverse those first, then reverse the acquisition'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'fa_reverse_descendants_exist',
            'entry_id', p_original)::text;
    end if;
    if exists (select 1 from clara.fa_depreciation dd
               where dd.asset_id = any(v_lin) and dd.is_live) then
      raise exception 'this acquisition has live depreciation charges; reverse the depreciation runs first, then reverse the acquisition'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'fa_reverse_while_depreciated',
            'entry_id', p_original)::text;
    end if;
  end if;

  -- (b) PARTIAL-SPLIT REVERSAL. DISCRIMINATED ON THE ENTRY, NEVER ON ROW SHAPE [F4]: the
  -- original entry's own fa_disposal proposal says whether it was a partial. The earlier
  -- row-shape test ("any row disposed by this entry that has a predecessor") was true for a
  -- FULL disposal of ANY successor -- including a revision successor -- and silently
  -- resurrected the pre-revision row, destroying an MPERS-17.19 estimate change with no audit
  -- trail; it also refused a plainly lawful full-disposal reversal because a SIBLING carried
  -- the split entry's id.
  v_portion := o.flags -> 'fa_disposal' ->> 'cost_portion_cents';
  if v_portion is not null then
    select * into a from clara.fixed_assets
      where disposal_entry_id = p_original and supersedes_asset_id is not null
        and status <> 'unwound' limit 1;
    if found then
      select * into su from clara.fixed_assets where id = a.supersedes_asset_id;
      if not found then
        raise exception 'the split this reversal targets has no surviving predecessor'
          using errcode = 'CLR39',
            detail = jsonb_build_object('reason', 'fa_partial_reversal_successor_advanced',
              'entry_id', p_original)::text;
      end if;
      -- THE SPLIT ARM ABSORBS CLEAN REVISION CHAINS, EXACTLY AS THE ACQUISITION ARM DOES
      -- [round-3.5 fold G5]. The earlier form refused on ANY non-unwound successor of a split
      -- child -- including a plain MPERS-17.19 particulars revision, which is not an entry and
      -- has no reversal verb, so the refusal's own remedy ("reverse those first") named an act
      -- that does not exist and the split (and the acquisition above it) became permanently
      -- un-reversible. The closure below the two children is the SAME certified closure the
      -- acquisition arm walks: a clean single-successor revision chain is absorbed (and is
      -- unwound with the split by arm 3c), and only a LIVE CHARGE, a DISPOSAL or a FURTHER
      -- SPLIT below a child -- each of which has a real entry and therefore a followable
      -- remedy -- refuses.
      v_kids := clara._fa_revision_closure(
                  (select coalesce(array_agg(k.id), '{}'::uuid[]) from clara.fixed_assets k
                    where k.supersedes_asset_id = su.id and k.status <> 'unwound'));
      if exists (select 1 from clara.fixed_assets f
                 where f.id = any(v_kids) and f.status <> 'unwound'
                   and f.disposal_entry_id is not null
                   and f.disposal_entry_id <> p_original)
         or exists (select 1 from clara.fixed_assets s3
                    where s3.supersedes_asset_id = any(v_kids) and s3.status <> 'unwound'
                      and not (s3.id = any(v_kids)))
         or exists (select 1 from clara.fa_depreciation dd
                    where dd.asset_id = any(v_kids) and dd.is_live
                      and dd.entry_id <> p_original) then
        raise exception 'a successor of this split carries later charges, splits or disposals; reverse those first'
          using errcode = 'CLR39',
            detail = jsonb_build_object('reason', 'fa_partial_reversal_successor_advanced',
              'entry_id', p_original, 'predecessor_asset_id', su.id)::text;
      end if;
    end if;
  end if;
end $$;
revoke all on function clara._fa_reversal_blocked(uuid) from public;

-- =====================================================================================
-- S2.4c -- THE ONE RESERVATION PREDICATE [round-3.5 fold G4]. THREE separate guards used to
-- ask "is this account spoken for by the fixed-asset register?" and all three asked it of the
-- CURRENT enrolment table -- while the facts live in three places at once:
--   * a register row BAKES its three codes at birth and goes on posting to them forever, so
--     the F5b version-forward (and retire_fa_account_profile) FREE a code that live rows still
--     move. Probed: version-forward the accumulated code, re-enrol the freed code as another
--     profile's COST account, then dispose the old asset lawfully -- its accumulated-debit leg
--     matched the new cost profile and SOFT-BIRTHED a phantom register row
--     ("Fixed asset (particulars pending) - 210-D41 RM4416.65") with a fabricated cost.
--   * the F7 disposal hardening scoped itself to fp.active, so a RETIRED profile's codes
--     re-opened the proceeds-into-accumulated hole the fold was written to close.
--   * the bank side had no guard at all: F5c refuses enrolling a bank-mapped code in an FA
--     role, but nothing stopped add_bank_account pointing a bank account AT an enrolled FA
--     code -- the whole INT-M3 footgun, entered through the other door.
-- ONE PREDICATE, THREE CONSUMERS. A code is FA-RESERVED for a client iff it sits on an ACTIVE
-- profile in any role OR is baked on any NON-UNWOUND register row. The role and the owning
-- cost account ride along so the enrolment topology check can say WHICH law was broken.
-- =====================================================================================
create function clara._fa_reserved_roles(p_client uuid)
  returns table(account_code text, fa_role text, owner_asset_code text)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select fp.asset_account_code, 'cost', fp.asset_account_code
    from clara.fa_account_profiles fp
    where fp.client_id = p_client and fp.active
  union
  select fp.accum_depr_account_code, 'accum', fp.asset_account_code
    from clara.fa_account_profiles fp
    where fp.client_id = p_client and fp.active and fp.accum_depr_account_code is not null
  union
  select fp.depr_expense_account_code, 'expense', fp.asset_account_code
    from clara.fa_account_profiles fp
    where fp.client_id = p_client and fp.active and fp.depr_expense_account_code is not null
  union
  select f.asset_account_code, 'cost', f.asset_account_code
    from clara.fixed_assets f
    where f.client_id = p_client and f.status <> 'unwound' and f.asset_account_code is not null
  union
  select f.accum_depr_account_code, 'accum', f.asset_account_code
    from clara.fixed_assets f
    where f.client_id = p_client and f.status <> 'unwound'
      and f.accum_depr_account_code is not null
  union
  select f.depr_expense_account_code, 'expense', f.asset_account_code
    from clara.fixed_assets f
    where f.client_id = p_client and f.status <> 'unwound'
      and f.depr_expense_account_code is not null $$;
revoke all on function clara._fa_reserved_roles(uuid) from public;

-- THE LEAF RUNG [round-3.5 fold G4]. The reservation fact spans two tables that two different
-- doors write, so a plain read-then-write leaves a real interleaving open: enrol code X as an
-- FA role and bind a bank account to X concurrently, and both transactions see a clean world.
-- The serialization key is a LEAF and is proven so: the house ladder is
--   firm (203005002) -> client (203005004) -> client:counterparty (203005003)
-- and NOT ONE of the four bodies that take this key (upsert_fa_account_profile,
-- retire_fa_account_profile, the bank-side belt, and through it every bank COA door) ever
-- acquires ANY of those three rungs -- asserted in TAIL 13, so the "never take 203005004 while
-- holding a later rung" law cannot be broken by a later edit without the migration failing.
-- The one-argument advisory space is disjoint from the two-argument space the ladder uses, so
-- this key cannot collide with a rung even by hash accident.
create function clara._fa_lock_roles(p_client uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_client::text || ':fa-roles'));
end $$;
revoke all on function clara._fa_lock_roles(uuid) from public;

-- THE BANK-SIDE REFUSAL, IN ONE PLACE. Volatile (it takes the leaf rung), and deliberately
-- NOT a verb-level guard: three bank COA doors exist today (add / remap / reactivate) and the
-- lesson of this fold is that a guard bolted to the doors you happen to know about is a guard
-- with a hole in it. The refusal rides CLR10 with the bank family's own reason vocabulary --
-- a bank caller must not have to learn the FA error contract to read its own refusal.
create function clara._fa_assert_code_unreserved(p_client uuid, p_code text) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_role text; v_owner text;
begin
  if p_client is null or p_code is null then return; end if;
  perform clara._fa_lock_roles(p_client);
  select rr.fa_role, rr.owner_asset_code into v_role, v_owner
    from clara._fa_reserved_roles(p_client) rr where rr.account_code = p_code limit 1;
  if v_role is not null then
    raise exception 'chart account % is reserved by the fixed-asset register (% role, profile %) and cannot back a bank account; retire the fixed-asset enrolment first, or pick a different account', p_code, v_role, v_owner
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'coa_account_fa_reserved', 'account_code', p_code,
          'fa_role', v_role, 'fa_profile_asset_account', v_owner)::text;
  end if;
end $$;
revoke all on function clara._fa_assert_code_unreserved(uuid, text) from public;

-- THE BELT ON clara.bank_accounts. NOT deferred, unlike the SS2.4 movement belt: this one
-- re-derives nothing the same transaction is still writing, and a refusal that only arrives at
-- COMMIT would be invisible to any caller that rolls back -- including every probe and cell
-- that tests it. Gated WHEN (new.active), so deactivation is never in scope and a remap or a
-- reactivation is.
create function clara._tf_fa_bank_reserved() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._fa_assert_code_unreserved(new.client_id, new.coa_account_code);
  return null;
end $$;
revoke all on function clara._tf_fa_bank_reserved() from public;
create trigger t_bank_accounts_fa_reserved
  after insert or update of coa_account_code, active on clara.bank_accounts
  for each row when (new.active)
  execute function clara._tf_fa_bank_reserved();

-- =====================================================================================
-- S2.5 -- clara._fa_on_approve (design SS2.1/SS2.2/SS2.4, SS3.2, SS4.2). THE ONE
-- MATERIALISATION MOMENT. Every register write that follows from a journal entry happens
-- HERE, inside the approving transaction, at all four approve paths -- which is what makes
-- acquisition intrinsic (ARCHITECTURE SS3.5) rather than a second step that can be skipped.
-- A draft that dies leaves nothing behind, because nothing was ever written for it.
--
-- Four arms, dependency-ordered:
--   (1) a depreciation proposal    -> ledger rows + THE RECEIPT + asset.depreciated
--   (2) a disposal proposal        -> stub charges + the disposal/split + asset.disposed
--   (3) a reversal mirror          -> the approve-time twins (refusals + unwinds)
--   (4) otherwise                  -> SOFT-BIRTH from the entry's own enrolled cost debits
-- =====================================================================================
create function clara._fa_on_approve(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; o record; l record; d record; au record; su record;
  -- %ROWTYPE (not record): _fa_particulars_complete takes the composite type.
  a clara.fixed_assets%rowtype;
  v_actor uuid; v_asset uuid; v_prop jsonb; v_recomp jsonb; v_run uuid;
  v_mode text; v_ps date; v_pe date; v_want jsonb; v_have jsonb;
  v_cost bigint; v_accum bigint; v_res bigint; v_portion bigint;
  v_accum_share bigint; v_res_share bigint; v_disposed uuid; v_cont uuid;
  v_dispose_date date; v_unwound int := 0;
  v_bake bigint; v_stub_total bigint; v_ledger_at bigint; v_accum_at bigint; v_disp_accum bigint;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  v_actor := coalesce(e.checker_actor, e.maker_actor);

  -- -----------------------------------------------------------------------------------
  -- (1) THE DEPRECIATION PROPOSAL (design SS3.2 "the hook at approve").
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'depreciation_charges' then
    v_prop := e.flags -> 'depreciation_charges';
    -- ORIGIN. The proposal and the origin are one fact; a depreciation proposal on a manual
    -- entry would be a forged machine post wearing a human's clothes.
    if e.origin <> 'scheduled_run' then
      raise exception 'a depreciation proposal may only ride an origin=scheduled_run entry'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'origin',
            'entry_id', p_entry)::text;
    end if;
    select * into au from clara.fa_depreciation_authorities
      where id = (v_prop ->> 'authority_id')::uuid;
    if not found or au.client_id <> e.client_id or au.status <> 'live' then
      raise exception 'the depreciation authority this proposal names is not live for this client; re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'authority_not_live',
            'authority_id', v_prop ->> 'authority_id')::text;
    end if;
    -- THE PERIOD IS DERIVED, NOT CARRIED: the run verb posts the entry ON the period end, so
    -- the cadence period containing posting_date IS the run's period. One less thing a
    -- proposal can lie about. (Derived BEFORE the issuer binding, which now pins it.)
    if au.cadence = 'monthly' then
      v_ps := clara._fa_month_start(e.posting_date); v_pe := clara._fa_month_end(e.posting_date);
    else
      v_ps := clara._fa_fy_open_for(e.client_id, e.posting_date);
      v_pe := clara._fa_fy_end_for(e.client_id, e.posting_date);
    end if;
    -- THE ISSUER BINDING THAT SURVIVES THE MAKER-CHECKER GAP: the run verb's op key must be
    -- present in the durable op-receipt ledger under one of the two run verbs. A flags blob
    -- alone proves nothing about who wrote it; a receipt does.
    -- BOUND TO THIS CLIENT AND THIS PERIOD, not merely to the firm [round-3 small / STR minor
    -- 1]. clara.op_receipts carries no client column, but _reserve_op stores the REQUEST HASH,
    -- and the run core hashes exactly (client, period_start, period_end) -- so re-deriving that
    -- hash from e.client_id and the period this hook itself derived turns a firm-wide receipt
    -- lookup into an exact match on the act that minted it. An op-receipt belonging to a
    -- SIBLING CLIENT of the same firm no longer authenticates this proposal.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id
                     and r.fn in ('run_depreciation_period', 'run_depreciation_manual')
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id, 'period_start', v_ps, 'period_end', v_pe))) then
      raise exception 'this depreciation proposal carries no issuer op-key receipt for this client and period; re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'issuer')::text;
    end if;
    -- REGISTER FRESHNESS, RE-DERIVED UNDER THE LOCKS (the WCA-R7 approve-time-twin pattern).
    -- The draft window between proposal and approve is a window in which assets complete,
    -- disposals approve and charges unwind. The stored proposal is a statement about a world;
    -- if the world moved, the honest answer is one named refusal whose remedy is stated.
    v_recomp := clara._fa_compute_charges(e.client_id, v_ps, v_pe);
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_want from jsonb_array_elements(v_recomp -> 'charges') x;
    select coalesce(jsonb_agg(x order by x ->> 'asset_id', x ->> 'period_start'), '[]'::jsonb)
      into v_have from jsonb_array_elements(v_prop -> 'charges') x;
    if v_want is distinct from v_have then
      raise exception 'the register moved since this depreciation run was proposed; withdraw this draft and re-run the period'
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'depreciation_stale', 'axis', 'charges',
            'period_start', v_ps, 'period_end', v_pe)::text;
    end if;
    -- MODE IS RE-DERIVED, NOT CARRIED (design SS3.3). The run verb's own decision -- ramp
    -- earned AND the entry not high-stakes -- is re-evaluated here from the same facts. It
    -- cannot have moved in between: the sequencing law refuses a second run while a draft is
    -- outstanding, so the ramp predicate is frozen for this entry's whole draft life. (A
    -- created_at/approved_at timestamp comparison was tried and REJECTED: it reads 'post' for
    -- any caller that drafts and approves inside ONE transaction, which is what a harness does.)
    v_mode := case when exists (select 1 from clara.journal_entries j
                       where j.client_id = e.client_id and j.origin = 'scheduled_run'
                         and j.status = 'approved' and j.reversed_by is null and j.id <> p_entry
                         and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id)
                     and not clara.is_high_stakes(p_entry)
                   then 'post' else 'draft' end;
    insert into clara.fa_depreciation_runs(firm_id, client_id, authority_id, period_start,
        period_end, mode, entries, charged_cents, skipped, entry_id, op_key)
      values (e.firm_id, e.client_id, au.id, v_ps, v_pe, v_mode,
        (v_recomp ->> 'entries')::int, (v_recomp ->> 'charged_cents')::bigint,
        v_recomp -> 'skipped', p_entry, v_prop ->> 'op_key')
      returning id into v_run;
    for d in select (x ->> 'asset_id')::uuid as asset_id, (x ->> 'period_start')::date as ps,
                    (x ->> 'period_end')::date as pe, (x ->> 'amount_cents')::bigint as amt
             from jsonb_array_elements(v_prop -> 'charges') x order by 1, 2 loop
      -- THE OVERLAP REFUSAL (design SS1.3). The partial unique index catches only an EXACT
      -- duplicate range; ranges legitimately span months (the annual arm, stubs), so the
      -- overlapping case needs its own probe. Client-rung-serialised, so a plain probe is
      -- sound.
      if clara._fa_range_covered(d.asset_id, d.ps, d.pe) then
        raise exception 'a live depreciation charge already covers % .. % for asset %', d.ps, d.pe, d.asset_id
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'fa_charge_overlap', 'asset_id', d.asset_id,
              'period_start', d.ps, 'period_end', d.pe)::text;
      end if;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (e.firm_id, e.client_id, d.asset_id, d.ps, d.pe, d.amt,
          e.posting_date, p_entry, v_run, null, true);
      perform clara._append_event(e.firm_id, 'asset.depreciated', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', d.asset_id, 'run_id', v_run, 'period_start', d.ps,
          'period_end', d.pe, 'amount_cents', d.amt));
    end loop;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (2) THE DISPOSAL PROPOSAL (design SS4.2/SS4.3).
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'fa_disposal' then
    v_prop := e.flags -> 'fa_disposal';
    v_dispose_date := (v_prop ->> 'disposal_date')::date;
    select * into a from clara.fixed_assets where id = (v_prop ->> 'asset_id')::uuid;
    if not found or a.client_id <> e.client_id then
      raise exception 'the disposal proposal names an asset that is not this client''s'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'asset')::text;
    end if;
    -- BOUND TO THIS CLIENT AND THIS REQUEST, not merely to the firm [round-3 small / STR minor
    -- 1] -- the same request-hash re-derivation the depreciation arm uses. The disposal verb
    -- hashes exactly these fields, and the proposal carries every one of them, so the receipt
    -- lookup is an exact match on the act that minted it rather than a firm-wide oracle.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id and r.fn = 'dispose_fixed_asset'
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id, 'asset', a.id,
                           'disposal_date', v_dispose_date,
                           'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint,
                           'proceeds_account', v_prop ->> 'proceeds_account',
                           'gain_account', v_prop ->> 'gain_account',
                           'loss_account', v_prop ->> 'loss_account',
                           'cost_portion_cents',
                             nullif(v_prop ->> 'cost_portion_cents', '')::bigint))) then
      raise exception 'this disposal proposal carries no issuer op-key receipt for this client and request; re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'issuer')::text;
    end if;
    if a.status <> 'active' or not clara._fa_particulars_complete(a) then
      raise exception 'this asset is no longer an active, complete register row; re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'lifecycle',
            'asset_id', a.id, 'status', a.status)::text;
    end if;
    -- FRESHNESS on the stub, same doctrine as the run arm.
    v_recomp := clara._fa_asset_charges(a.id, v_dispose_date, true);
    select coalesce(jsonb_agg(x order by x ->> 'period_start'), '[]'::jsonb)
      into v_want from jsonb_array_elements(v_recomp -> 'charges') x;
    select coalesce(jsonb_agg(x order by x ->> 'period_start'), '[]'::jsonb)
      into v_have from jsonb_array_elements(coalesce(v_prop -> 'stub_charges', '[]'::jsonb)) x;
    if v_want is distinct from v_have then
      raise exception 'the register moved since this disposal was proposed; withdraw this draft and re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'stub',
            'asset_id', a.id)::text;
    end if;
    -- AND THE ACCUMULATED RELIEF IS RE-DERIVED TOO [round-3.5 fold G1]. The stub fingerprint
    -- above pins only THIS row's own uncharged months; the GL's accumulated-depreciation debit
    -- leg -- and therefore NBV and the gain or loss on this disposal -- is a LINEAGE figure. An
    -- ANCESTOR charged (or reversed) between draft and approve moves it silently, and the entry
    -- the checker approves would then relieve an amount the register no longer holds, breaking
    -- the tie at the disposal date with nothing to say why. Re-derived from the SAME period-net
    -- decomposition the verb used, under the same locks, and refused by name if it moved.
    v_bake := coalesce(a.accumulated_depreciation_cents, 0);
    v_stub_total := (v_recomp ->> 'amount_cents')::bigint;
    v_ledger_at := clara._fa_accumulated_periods_through(a.id,
                     clara._fa_month_end(v_dispose_date)) - v_bake + v_stub_total;
    v_accum_at := v_bake + v_ledger_at;
    v_portion := nullif(v_prop ->> 'cost_portion_cents', '')::bigint;
    v_disp_accum := case when v_portion is null then v_accum_at
                         else round(v_bake::numeric * v_portion / a.cost_cents)::bigint
                            + round(v_ledger_at::numeric * v_portion / a.cost_cents)::bigint end;
    if v_disp_accum is distinct from nullif(v_prop ->> 'accum_relieved_cents', '')::bigint then
      raise exception 'the accumulated depreciation this disposal relieves moved since it was proposed; withdraw this draft and re-issue the disposal'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'accum',
            'asset_id', a.id, 'proposed_cents',
            nullif(v_prop ->> 'accum_relieved_cents', '')::bigint,
            'recomputed_cents', v_disp_accum)::text;
    end if;
    -- THE STUB MATERIALISES HERE, beside the disposal, from the same one hook.
    for d in select (x ->> 'asset_id')::uuid as asset_id, (x ->> 'period_start')::date as ps,
                    (x ->> 'period_end')::date as pe, (x ->> 'amount_cents')::bigint as amt
             from jsonb_array_elements(coalesce(v_prop -> 'stub_charges', '[]'::jsonb)) x
             order by 2 loop
      if clara._fa_range_covered(d.asset_id, d.ps, d.pe) then
        raise exception 'a live depreciation charge already covers % .. % for asset %', d.ps, d.pe, d.asset_id
          using errcode = 'CLR38',
            detail = jsonb_build_object('reason', 'fa_charge_overlap', 'asset_id', d.asset_id,
              'period_start', d.ps, 'period_end', d.pe)::text;
      end if;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (e.firm_id, e.client_id, d.asset_id, d.ps, d.pe, d.amt,
          v_dispose_date, p_entry, null, null, true);
      perform clara._append_event(e.firm_id, 'asset.depreciated', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', d.asset_id, 'run_id', null, 'period_start', d.ps,
          'period_end', d.pe, 'amount_cents', d.amt));
    end loop;

    v_portion := nullif(v_prop ->> 'cost_portion_cents', '')::bigint;
    if v_portion is null then
      update clara.fixed_assets set status = 'disposed', disposed_at = v_dispose_date,
        disposal_entry_id = p_entry, updated_at = now() where id = a.id;
      perform clara._append_event(e.firm_id, 'asset.disposed', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', a.id, 'partial', false, 'disposal_date', v_dispose_date,
          'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint));
    else
      -- THE SUPERSEDE SPLIT (design SS4.3; WD-R7). The original -> superseded; two successors
      -- born with effective_from = THE ENTRY'S POSTING DATE, so a pre-split as-of read sees
      -- ONLY the original and a post-split read sees ONLY the successors. That effective
      -- dating is what makes the round-2 worked RM100,000 double-count unrepresentable
      -- [L2/round-2 fold 3]. THE REMAINDER ABSORBS ALL ROUNDING (WD-R7's sen law), so
      -- register totals tie at every as-of by construction rather than by luck.
      v_cost := a.cost_cents;
      v_res := coalesce(a.residual_cents, 0);
      -- THE BAKE CARRIES THE BASELINE SHARE AND NOTHING ELSE [round-3 fold F1]. The parent's
      -- LEDGER content is not divided here at all -- clara._fa_accumulated_at pro-rates it at
      -- READ time, by the same remainder-absorbing rule, so a charge that lands on the
      -- superseded parent after the split still reaches the continuing successor instead of
      -- disappearing into a frozen number. Only the CARRIED baseline (which can never move) is
      -- split now, with the remainder absorbed by the continuing row exactly as before.
      v_accum := coalesce(a.accumulated_depreciation_cents, 0);
      v_accum_share := round(v_accum::numeric * v_portion / v_cost)::bigint;
      v_res_share := round(v_res::numeric * v_portion / v_cost)::bigint;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
          asset_account_code, accum_depr_account_code, depr_expense_account_code,
          accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
          supersedes_asset_id, effective_from, disposed_at, disposal_entry_id,
          ca_class, is_commercial_vehicle, is_new)
        values (e.firm_id, e.client_id, a.description || ' (disposed portion)', a.acquired_date,
          v_portion, v_res_share, a.useful_life_months, a.depreciation_method,
          a.depreciation_rate_bps, a.asset_account_code, a.accum_depr_account_code,
          a.depr_expense_account_code, v_accum_share, a.depreciation_start_date, e.posting_date,
          'disposed', a.id, e.posting_date, v_dispose_date, p_entry,
          a.ca_class, a.is_commercial_vehicle, a.is_new)
        returning id into v_disposed;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
          asset_account_code, accum_depr_account_code, depr_expense_account_code,
          accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
          supersedes_asset_id, effective_from, ca_class, is_commercial_vehicle, is_new)
        values (e.firm_id, e.client_id, a.description, a.acquired_date,
          v_cost - v_portion, v_res - v_res_share, a.useful_life_months, a.depreciation_method,
          a.depreciation_rate_bps, a.asset_account_code, a.accum_depr_account_code,
          a.depr_expense_account_code, v_accum - v_accum_share, a.depreciation_start_date,
          e.posting_date, 'active', a.id, e.posting_date,
          a.ca_class, a.is_commercial_vehicle, a.is_new)
        returning id into v_cont;
      -- SPLIT LINEAGE LAW (design SS1.1): superseded_by_asset_id always names the CONTINUING
      -- successor; the disposed portion is reachable upward only, and every read traverses up.
      update clara.fixed_assets set status = 'superseded', superseded_by_asset_id = v_cont,
        superseded_at = e.posting_date, updated_at = now() where id = a.id;
      perform clara._append_event(e.firm_id, 'asset.disposed', e.client_id, v_actor,
        null, null, p_entry, null, null,
        jsonb_build_object('asset_id', a.id, 'partial', true, 'disposal_date', v_dispose_date,
          'proceeds_cents', (v_prop ->> 'proceeds_cents')::bigint,
          'disposed_asset_id', v_disposed, 'continuing_asset_id', v_cont));
    end if;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (3) THE REVERSAL MIRROR: THE APPROVE-TIME TWINS (design SS2.4). Dependency-ordered --
  -- acquisition first (it refuses while descendants live), then the disposal restore, then
  -- the charge unwinds -- so every refusal reads UNTOUCHED state.
  -- K-family mirrors are skipped: the K-family owns its own rows (WD-R1's exclusion).
  -- -----------------------------------------------------------------------------------
  if e.reversal_of is not null and not e.is_opening_balance then
    select * into o from clara.journal_entries where id = e.reversal_of;

    -- EVERY REFUSAL READS UNTOUCHED STATE. All three probes run FIRST, from the one body the
    -- verb-side guard also calls (S2.4b), so no arm can mutate the world a later refusal is
    -- about to read, and the verb and the hook can never name different tokens.
    perform clara._fa_reversal_blocked(o.id);

    -- (3a) ACQUISITION REVERSAL -- the WHOLE revision chain unwinds (S2.4b law 1).
    if exists (select 1 from clara.fixed_assets f where f.acquisition_entry_id = o.id) then
      -- A superseded predecessor being unwound must ALSO release superseded_by_asset_id: the
      -- 0017 CHECK reads (status='superseded') = (superseded_by is not null), so leaving the
      -- link behind on an unwound row would violate it. Clearing it is honest anyway -- the
      -- revision it named is being unwound in the same statement.
      update clara.fixed_assets set status = 'unwound', superseded_by_asset_id = null,
        superseded_at = null, updated_at = now()
        where id = any(clara._fa_reversal_lineage(o.id)) and status <> 'unwound';
    end if;

    -- (3c) DISPOSAL REVERSAL -- full restore, or the PARTIAL-SPLIT reversal [L2/round-2 fold
    -- 9], DISCRIMINATED ON THE ENTRY [round-3 fold F4]: a partial disposal is one whose own
    -- fa_disposal proposal named a cost portion. Row lineage cannot decide this -- a revision
    -- successor and a split successor both carry supersedes_asset_id.
    if exists (select 1 from clara.fixed_assets f where f.disposal_entry_id = o.id) then
      if (o.flags -> 'fa_disposal' ->> 'cost_portion_cents') is not null then
        select * into a from clara.fixed_assets
          where disposal_entry_id = o.id and supersedes_asset_id is not null
            and status <> 'unwound' limit 1;
        if found then
          select * into su from clara.fixed_assets where id = a.supersedes_asset_id;
          -- THE WHOLE CLEAN CHAIN BELOW BOTH CHILDREN UNWINDS [round-3.5 fold G5], through the
          -- same closure the guard above admitted: a particulars revision made on a split
          -- successor is part of the split, not an independent act, and leaving it behind
          -- 'active' while its parent is unwound would strand a register row whose cost the GL
          -- no longer carries. Superseded links are released for the same 0017-CHECK reason arm
          -- 3a states: (status='superseded') = (superseded_by is not null).
          update clara.fixed_assets set status = 'unwound', disposed_at = null,
            disposal_entry_id = null, superseded_by_asset_id = null, superseded_at = null,
            updated_at = now()
            where id = any(clara._fa_revision_closure(
                            (select coalesce(array_agg(k.id), '{}'::uuid[])
                               from clara.fixed_assets k
                              where k.supersedes_asset_id = su.id and k.status <> 'unwound')))
              and status <> 'unwound';
          update clara.fixed_assets set status = 'active', superseded_by_asset_id = null,
            superseded_at = null, updated_at = now() where id = su.id;
        end if;
      else
        update clara.fixed_assets set status = 'active', disposed_at = null,
          disposal_entry_id = null, updated_at = now() where disposal_entry_id = o.id;
      end if;
    end if;

    -- (3b) CHARGE UNWINDS. is_live LAW (design SS1.3): FLIP the original false, THEN append
    -- the unwind row born DEAD. Neither can collide, because an unwind row never enters the
    -- partial unique index. Effective-dated at the MIRROR'S posting date (which the SS5.2 MYT
    -- splice makes the Malaysian legal date), so an as-of read before the reversal still sees
    -- the charge -- which is the truth.
    for d in select * from clara.fa_depreciation where entry_id = o.id and is_live
             order by asset_id, period_start loop
      update clara.fa_depreciation set is_live = false where id = d.id;
      insert into clara.fa_depreciation(firm_id, client_id, asset_id, period_start, period_end,
          amount_cents, effective_date, entry_id, run_id, unwind_of, is_live)
        values (d.firm_id, d.client_id, d.asset_id, d.period_start, d.period_end,
          d.amount_cents, e.posting_date, p_entry, null, d.id, false);
      v_unwound := v_unwound + 1;
    end loop;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (4) SOFT-BIRTH (design SS2.2; WD-R1). One row per LINE -- a multi-unit leg births one
  -- row (SS4.3's split divides later) and freight on a second line births a second row BY
  -- DESIGN: no merge door exists, and the practice is one asset per line (SS9.4).
  -- EXCLUSIONS: K-family entries (the carry-down owns its own rows, and including them
  -- double-birthed at K5 and wedged K6) and reversal mirrors (arm 3 owns those).
  -- -----------------------------------------------------------------------------------
  -- A DISPOSAL NEVER BIRTHS [round-3.5 fold G4]. A disposal's accumulated-depreciation relief
  -- is a DEBIT, and the day a freed accumulated code is re-enrolled as some other profile's
  -- COST account that debit matches this join and soft-births a phantom register row with a
  -- fabricated cost -- probed end to end. The reservation predicate (S2.4c) now makes that
  -- re-enrolment unreachable, and this exclusion closes the mechanical site itself, so the
  -- phantom needs BOTH guards to fail rather than either.
  if not e.is_opening_balance and e.reversal_of is null and not (e.flags ? 'fa_disposal') then
    for l in select jl.id as line_id, jl.account_code, jl.debit_cents,
                    fp.accum_depr_account_code as accum_code,
                    fp.depr_expense_account_code as expense_code
             from clara.journal_lines jl
             join clara.fa_account_profiles fp on fp.client_id = jl.client_id
               and fp.asset_account_code = jl.account_code and fp.active
             where jl.entry_id = p_entry and jl.debit_cents > 0
             order by jl.id loop
      v_asset := null;
      insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
          residual_cents, depreciation_method, asset_account_code, accum_depr_account_code,
          depr_expense_account_code, acquisition_entry_id, acquisition_line_id,
          accumulated_depreciation_cents, status)
        values (e.firm_id, e.client_id,
          -- THE PLACEHOLDER (Codex round-1 fold): description is NOT NULL and a lawful
          -- document-backed entry can carry a NULL memo, so a birth that copied the memo
          -- would abort the whole approval. A stable, self-explaining placeholder is the
          -- honest answer; completion replaces it.
          'Fixed asset (particulars pending) - ' || l.account_code || ' RM'
            || to_char(l.debit_cents / 100.0, 'FM999999999990.00'),
          e.posting_date, l.debit_cents, 0,
          -- A non-depreciable profile (land: accum + expense both null) births its assets
          -- already stating method='none'; every other birth leaves the method UNCHOSEN.
          case when l.accum_code is null then 'none' end,
          l.account_code, l.accum_code, l.expense_code, p_entry, l.line_id, 0, 'active')
        on conflict (acquisition_line_id) do nothing
        returning id into v_asset;
      if v_asset is not null then
        perform clara._append_event(e.firm_id, 'asset.acquired', e.client_id, v_actor,
          null, null, p_entry, e.document_id, null,
          jsonb_build_object('asset_id', v_asset, 'line_id', l.line_id,
            'cost_cents', l.debit_cents));
      end if;
    end loop;
  end if;
end $$;
revoke all on function clara._fa_on_approve(uuid) from public;

-- =====================================================================================
-- S2.6 -- THE BELT (design SS2.4). A DEFERRED CONSTRAINT TRIGGER on clara.journal_entries,
-- gated WHEN (new.status='approved'), with the legs RE-DERIVED BY JOIN. v1's belt sat on
-- journal_lines and therefore fired at DRAFT-commit or never [L2/round-1]; this one fires
-- exactly when an approval is about to become durable.
--
-- ALL THREE ENROLLED ROLES are covered (accounting lens over structure lens, round 1): a
-- hand journal that credits accumulated depreciation, or debits the depreciation expense
-- account, moves the register's numbers just as surely as one that touches cost.
--
-- THE WATERMARK [L2/round-2 fold 5]: only entries approved at or after the profile's
-- enrolled_at are in scope. Enrolling an account that already has history must not make that
-- history un-reversible (a reversed_by UPDATE re-fires this trigger on the original) and must
-- not birth anything retroactively.
--
-- FIVE DOORS, exactly as designed: (a) a register row keyed to this line IN ANY STATUS
-- (status-blind on purpose, so an unwound row still opens the door for its own reversal) -
-- (b) an fa_disposal proposal on THIS entry - (c) a depreciation_charges proposal on THIS
-- entry with origin='scheduled_run' - (d) a reversal mirror - (e) a K-family entry tying to
-- its own opening_items.fixed_asset row -- and a K gl_balance leg on an enrolled account
-- REFUSES BY NAME, because enrolment is the commitment to an itemised register.
-- =====================================================================================
create function clara._tf_fa_movement_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record;
begin
  for r in
    select distinct jl.id as line_id, jl.account_code, jl.debit_cents, jl.credit_cents,
      case when fp.asset_account_code = jl.account_code then 'cost'
           when fp.accum_depr_account_code = jl.account_code then 'accum'
           else 'expense' end as role
    from clara.journal_lines jl
    join clara.fa_account_profiles fp on fp.client_id = jl.client_id
      and (fp.asset_account_code = jl.account_code
        or fp.accum_depr_account_code = jl.account_code
        or fp.depr_expense_account_code = jl.account_code)
    where jl.entry_id = new.id
      -- AN ENROLMENT INTERVAL IS AN IMMUTABLE FACT, EVALUATED AT approved_at [round-3 fold
      -- F5a]. The earlier form joined only CURRENTLY-active profiles, and this trigger is
      -- INITIALLY DEFERRED -- so one transaction could approve a hand journal against an
      -- enrolled accumulated-depreciation account and then retire (or remap) the profile
      -- before commit: at firing time no active profile matched, the GL movement committed
      -- with no register act, and fa_register_tie broke with nothing to point at. The interval
      -- is CLOSED at both ends on purpose: now() is transaction-constant, so a same-transaction
      -- retire stamps retired_at EQUAL to approved_at, and a half-open bound would hand the
      -- race to the retirer. An entry approved in a LATER transaction is strictly after
      -- retired_at and correctly out of scope.
      and coalesce(new.approved_at, now()) >= fp.enrolled_at
      and (fp.retired_at is null or coalesce(new.approved_at, now()) <= fp.retired_at)
    order by 1
  loop
    -- (a)
    if exists (select 1 from clara.fixed_assets f where f.acquisition_line_id = r.line_id) then
      continue;
    end if;
    -- (b)
    if new.flags ? 'fa_disposal' then continue; end if;
    -- (c)
    if (new.flags ? 'depreciation_charges') and new.origin = 'scheduled_run' then continue; end if;
    -- (d)
    if new.reversal_of is not null then continue; end if;
    -- (e) A LATENT WIDENING, DOCUMENTED AT THE DOOR [round-3 small / INT-m4]: this test is
    -- ENTRY-level, not LINE-level. A K entry carrying one itemised fixed_asset item AND a
    -- gl_balance leg on the SAME enrolled account would escape fa_k_gl_balance_on_enrolled.
    -- It is vacuous today -- every clara.opening_items row is 1:1 with its entry (probed: 796
    -- entries, all n=1) -- and the carry-down composer emits one item per entry, so this is a
    -- door a FUTURE multi-item opening entry could open, not a live hole. Whoever adds
    -- multi-item opening entries must tie this to oi.fixed_asset_id's own LINE.
    if new.is_opening_balance then
      if exists (select 1 from clara.opening_items oi
                 where oi.entry_id = new.id and oi.item_kind = 'fixed_asset'
                   and oi.fixed_asset_id is not null) then
        continue;
      end if;
      raise exception 'account % is enrolled for the fixed-asset register; carry it down as an itemised fixed_asset opening item, not as a gl_balance leg', r.account_code
        using errcode = 'CLR40',
          detail = jsonb_build_object('reason', 'fa_k_gl_balance_on_enrolled',
            'entry_id', new.id, 'account_code', r.account_code, 'role', r.role)::text;
    end if;
    -- A CREDIT on an enrolled COST account with no disposal proposal is the supplier
    -- credit/rebate class: a NAMED DEFERRAL riding the future supplier_credit_note kind. The
    -- v1 remedy is reverse-and-rebook, and the refusal says so rather than leaving the
    -- professional to guess.
    if r.role = 'cost' and r.credit_cents > 0 then
      raise exception 'reducing the cost of an enrolled fixed-asset account is not yet a supported adjustment; reverse the acquisition entry and re-book it at the corrected cost'
        using errcode = 'CLR40',
          detail = jsonb_build_object('reason', 'fa_cost_adjustment_deferred',
            'entry_id', new.id, 'account_code', r.account_code, 'role', r.role)::text;
    end if;
    raise exception 'this entry moves an account enrolled for the fixed-asset register (% as %) without a register act; use the fixed-asset verbs (acquisition coding, run_depreciation_period, dispose_fixed_asset)', r.account_code, r.role
      using errcode = 'CLR40',
        detail = jsonb_build_object('reason', 'fa_belt_unregistered_movement',
          'entry_id', new.id, 'account_code', r.account_code, 'role', r.role,
          'line_id', r.line_id)::text;
  end loop;
  return null;
end $$;
revoke all on function clara._tf_fa_movement_belt() from public;
create constraint trigger t_je_fa_movement_belt after insert or update on clara.journal_entries
  deferrable initially deferred for each row when (new.status = 'approved')
  execute function clara._tf_fa_movement_belt();

-- #####################################################################################
-- ############# SECTION S3 -- THE VERBS (enrolment, particulars, authority) ###########
-- #####################################################################################
-- Every human verb takes p_op_key LAST and rides the house shape: validate the key ->
-- _reserve_op (dedupe + mutex) -> (locks in the documented order) -> mutate -> event(s)
-- carrying op_key -> _finish_op.

-- =====================================================================================
-- S3.1 -- clara.upsert_fa_account_profile (design SS1.2). ENROLMENT. bookkeeper+.
-- accum + expense BOTH NULL <=> non-depreciable (land). Any change to the enrolled code set
-- VERSION-FORWARDS -- retire the live row, insert a fresh one with a fresh enrolled_at
-- [round-3 fold F5b] -- so a widened scope never reaches backwards to refuse history that was
-- lawful when it was approved, AND a historical enrolment interval is never overwritten.
-- The role topology is CLIENT-WIDE, not row-wide, and no registered bank account may be
-- enrolled in any role [round-3 fold F5c].
-- =====================================================================================
create function clara.upsert_fa_account_profile(p_client uuid, p_asset_account text,
    p_accum_account text, p_depr_expense_account text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; v_existing record; v_id uuid; v_changed boolean;
        v_clash text; v_had_live boolean; d record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'upsert_fa_account_profile', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset_account,
      'accum', p_accum_account, 'expense', p_depr_expense_account)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if nullif(btrim(p_asset_account), '') is null then
    raise exception 'an FA account profile needs a cost account'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"asset_account"}';
  end if;
  -- THE PAIR IS A PAIR. Half a profile is a register that can never depreciate and never say
  -- why -- so it refuses here, by name, rather than surfacing as silence three months later.
  if (p_accum_account is null) <> (p_depr_expense_account is null) then
    raise exception 'state BOTH the accumulated-depreciation and the depreciation-expense account, or NEITHER (neither = a non-depreciable profile, e.g. land)'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"pair"}';
  end if;
  -- TYPING. The cost and accumulated codes are asset-typed, the expense code expense-typed,
  -- and none of the three may be a control account: a control-class leg in this family would
  -- put a second receivable/payable movement on an entry the subledger classifier also reads.
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_asset_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the fixed-asset cost account must be an active, asset-typed, non-control account on this chart'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"asset_account"}';
  end if;
  if p_accum_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_accum_account
                     and a.is_active and a.account_type = 'asset' and a.account_class is null) then
      raise exception 'the accumulated-depreciation account must be an active, asset-typed, non-control account on this chart'
        using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"accum_account"}';
    end if;
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_depr_expense_account
                     and a.is_active and a.account_type = 'expense' and a.account_class is null) then
      raise exception 'the depreciation-expense account must be an active, expense-typed, non-control account on this chart'
        using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"expense_account"}';
    end if;
  end if;
  if p_asset_account = coalesce(p_accum_account, '')
     or p_asset_account = coalesce(p_depr_expense_account, '')
     or (p_accum_account is not null and p_accum_account = p_depr_expense_account) then
    raise exception 'the three enrolled accounts must be pairwise distinct'
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"distinct"}';
  end if;

  -- ---------------------------------------------------------------------------------
  -- CLIENT-WIDE ROLE TOPOLOGY [round-3 fold F5c]. Pairwise distinctness WITHIN one profile is
  -- not enough: profiles (cost=A, accum=B) and (cost=B, accum=C) were both lawful, and then a
  -- debit to B (an ordinary disposal clearing accumulated depreciation) soft-birthed a PHANTOM
  -- register row on the second profile -- probed, with a fabricated cost -- while the tie
  -- compared the first profile's register accumulation against B's whole GL balance. Sharing
  -- ONE accumulated account across two profiles makes both per-pair ties arithmetically
  -- impossible. The three roles are therefore disjoint across a client's ACTIVE profiles.
  -- ---------------------------------------------------------------------------------
  --
  -- ...AND THE FACTS ARE READ WHEREVER THEY LIVE [round-3.5 fold G4]. The checks below used to
  -- read fa_account_profiles WHERE active, which is only half the world: a register row bakes
  -- its three codes at birth and keeps posting to them after the profile that named them is
  -- version-forwarded or retired. Probed consequence: version-forward the accumulated code,
  -- re-enrol the FREED code as another profile's COST account (admitted!), then dispose the old
  -- asset -- its accumulated-debit leg soft-birthed a phantom register row with a fabricated
  -- cost. clara._fa_reserved_roles is the ONE predicate over both worlds; the leaf rung above
  -- it makes the read-then-write honest against a concurrent bank binding of the same code.
  perform clara._fa_lock_roles(p_client);
  if p_accum_account is not null then
    select rr.owner_asset_code into v_clash from clara._fa_reserved_roles(p_client) rr
      where rr.account_code = p_accum_account and rr.fa_role = 'accum'
        and rr.owner_asset_code <> p_asset_account
      limit 1;
    if v_clash is not null then
      raise exception 'another enrolled profile or live register row for this client already uses % as its accumulated-depreciation account (cost account %); the register ties per (cost, accumulated) pair and cannot share one accumulated account', p_accum_account, v_clash
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'accum_shared',
            'account_code', p_accum_account, 'other_profile_asset_account', v_clash)::text;
    end if;
  end if;
  for d in select * from (values ('cost', p_asset_account), ('accum', p_accum_account),
                                 ('expense', p_depr_expense_account)) as t(want_role, code) loop
    if d.code is null then continue; end if;
    select rr.owner_asset_code || ' (' || rr.fa_role || ')' into v_clash
      from clara._fa_reserved_roles(p_client) rr
      where rr.account_code = d.code and rr.fa_role <> d.want_role
      limit 1;
    if v_clash is not null then
      raise exception 'account % is already spoken for in a DIFFERENT fixed-asset role for this client (%); cost, accumulated-depreciation and depreciation-expense roles must not overlap -- and a role a live register row still carries counts, whatever the profile now says', d.code, v_clash
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'role_overlap',
            'account_code', d.code, 'other_profile_asset_account', v_clash)::text;
    end if;
  end loop;
  -- RESERVED ACCOUNTS [round-3 fold F5c / INT-M3]. A bank account passes every typing test
  -- above (asset-typed, no account_class), and one mis-typed code in the enrolment form would
  -- (i) birth a bogus register row on every receipt into that bank and (ii) refuse EVERY
  -- payment out of it at approval, with a remedy ("reverse the acquisition and re-book it")
  -- that is meaningless for a bank movement. The FA profile is the one enrolment act in this
  -- wave with unbounded blast radius; it gets the same shape of guard as the control-class one.
  select ba.coa_account_code into v_clash from clara.bank_accounts ba
    where ba.client_id = p_client
      and ba.coa_account_code in (p_asset_account, coalesce(p_accum_account, ''),
                                  coalesce(p_depr_expense_account, ''))
    limit 1;
  if v_clash is not null then
    raise exception 'account % is a registered bank account for this client and cannot be enrolled in the fixed-asset register', v_clash
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_profile_invalid', 'axis', 'reserved_account',
          'account_code', v_clash)::text;
  end if;

  -- ---------------------------------------------------------------------------------
  -- VERSION-FORWARD, NEVER MUTATE [round-3 fold F5b]. An enrolment interval is a historical
  -- fact the belt reads at approved_at; re-pointing an enrolled pair in place would rewrite
  -- history (and, probed, immediately created old/new pairs measuring against the same full
  -- cost-account GL). A real change therefore RETIRES the live row and inserts a fresh one; an
  -- unchanged re-upsert is idempotent and must not move the belt's horizon under live history.
  -- ---------------------------------------------------------------------------------
  select * into v_existing from clara.fa_account_profiles
    where client_id = p_client and asset_account_code = p_asset_account and active
    limit 1 for update;
  v_had_live := found;
  v_changed := (not v_had_live)
            or v_existing.accum_depr_account_code is distinct from p_accum_account
            or v_existing.depr_expense_account_code is distinct from p_depr_expense_account;
  if not v_changed then
    v_id := v_existing.id;
  else
    if v_had_live then
      update clara.fa_account_profiles
        set active = false, retired_by = c.actor, retired_at = now()
        where id = v_existing.id;
    end if;
    insert into clara.fa_account_profiles(firm_id, client_id, asset_account_code,
        accum_depr_account_code, depr_expense_account_code, active, enrolled_at, created_by)
      values (c.firm, p_client, p_asset_account, p_accum_account, p_depr_expense_account,
        true, now(), c.actor)
      returning id into v_id;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'upsert_fa_account_profile', null,
    jsonb_build_object('client', p_client, 'asset_account', p_asset_account,
      'accum_account', p_accum_account, 'expense_account', p_depr_expense_account,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'upsert_fa_account_profile', p_op_key,
    jsonb_build_object('profile_id', v_id, 'client_id', p_client,
      'asset_account_code', p_asset_account,
      'depreciable', p_accum_account is not null, 'active', true));
end $$;
revoke all on function clara.upsert_fa_account_profile(uuid, text, text, text, text) from public;

-- =====================================================================================
-- S3.2 -- clara.retire_fa_account_profile. The SS1.2 "retired row" door, made explicit.
-- Retiring does NOT touch the register rows the profile already birthed -- it only ends the
-- scope in which NEW movement is belted and NEW births happen.
-- =====================================================================================
create function clara.retire_fa_account_profile(p_client uuid, p_asset_account text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'retire_fa_account_profile', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset_account)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- THE SAME LEAF RUNG THE ENROLMENT DOOR TAKES [round-3.5 fold G4]: retiring a profile CHANGES
  -- the reservation set, so it must serialize against a concurrent bank binding exactly as the
  -- upsert does. (Retirement never frees a code that a live register row still carries -- the
  -- predicate reads the rows too -- so there is nothing here to refuse, only to order.)
  perform clara._fa_lock_roles(p_client);
  update clara.fa_account_profiles set active = false, retired_by = c.actor, retired_at = now()
    where client_id = p_client and asset_account_code = p_asset_account and active
    returning id into v_id;
  if v_id is null then
    raise exception 'no active fixed-asset profile is enrolled on % for this client', p_asset_account
      using errcode = 'CLR37', detail = '{"reason":"fa_profile_invalid","axis":"not_enrolled"}';
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'retire_fa_account_profile', null,
    jsonb_build_object('client', p_client, 'asset_account', p_asset_account, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'retire_fa_account_profile', p_op_key,
    jsonb_build_object('profile_id', v_id, 'client_id', p_client,
      'asset_account_code', p_asset_account, 'active', false));
end $$;
revoke all on function clara.retire_fa_account_profile(uuid, text, text) from public;

-- =====================================================================================
-- S3.3 -- PARTICULARS. The completion door (once, while incomplete) and the MPERS-17.19
-- prospective revision door (supersede-forward, never retroactive).
-- =====================================================================================

-- The shared particulars validator: unknown keys refuse, the driver trio is checked BOTH
-- ways, and the answer is the column set to write. Private, so the two doors cannot drift.
create function clara._fa_validate_particulars(p_particulars jsonb) returns jsonb
  language plpgsql immutable as $$
declare v_method text; v_life int; v_rate int; v_res bigint; v_start date; k text;
begin
  if p_particulars is null or jsonb_typeof(p_particulars) <> 'object' then
    raise exception 'particulars must be a json object'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"shape"}';
  end if;
  for k in select jsonb_object_keys(p_particulars) loop
    if k not in ('method', 'useful_life_months', 'rate_bps', 'residual_cents', 'start_date',
                 'description', 'ca_class', 'is_commercial_vehicle', 'is_new') then
      raise exception 'particulars carries an unknown key "%"', k
        using errcode = 'CLR37',
          detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', 'unknown_key',
            'key', k)::text;
    end if;
  end loop;
  begin
    v_method := nullif(btrim(p_particulars ->> 'method'), '');
    v_life := nullif(p_particulars ->> 'useful_life_months', '')::int;
    v_rate := nullif(p_particulars ->> 'rate_bps', '')::int;
    v_res := coalesce(nullif(p_particulars ->> 'residual_cents', '')::bigint, 0);
    v_start := nullif(p_particulars ->> 'start_date', '')::date;
  exception when others then
    raise exception 'particulars carries a malformed value'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"malformed"}';
  end;
  if v_method is null or v_method not in ('straight_line', 'reducing_balance', 'none') then
    raise exception 'method must be straight_line, reducing_balance or none'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"method"}';
  end if;
  if v_start is null then
    raise exception 'an in-service (depreciation start) date is required for every method, including none'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"start_date"}';
  end if;
  if v_method = 'none' then
    if v_life is not null or v_rate is not null then
      raise exception 'method none carries neither a useful life nor a rate'
        using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"drivers"}';
    end if;
    v_res := null;
  elsif v_method = 'straight_line' then
    if v_life is null or v_life <= 0 or v_rate is not null then
      raise exception 'straight_line needs a positive useful life in months and no rate'
        using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"drivers"}';
    end if;
  else
    if v_life is null or v_life <= 0 or v_rate is null or v_rate < 1 or v_rate > 10000 then
      raise exception 'reducing_balance needs a positive useful life (to terminate) AND an annual rate of 1..10000 basis points (to charge)'
        using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"drivers"}';
    end if;
  end if;
  if v_res is not null and v_res < 0 then
    raise exception 'a residual value cannot be negative'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"residual"}';
  end if;
  return jsonb_build_object('method', v_method, 'useful_life_months', v_life,
    'rate_bps', v_rate, 'residual_cents', v_res, 'start_date', v_start,
    'description', nullif(btrim(p_particulars ->> 'description'), ''),
    'ca_class', nullif(btrim(p_particulars ->> 'ca_class'), ''),
    'is_commercial_vehicle', nullif(p_particulars ->> 'is_commercial_vehicle', '')::boolean,
    'is_new', nullif(p_particulars ->> 'is_new', '')::boolean);
end $$;
revoke all on function clara._fa_validate_particulars(jsonb) from public;

create function clara.complete_fixed_asset_particulars(p_client uuid, p_asset uuid,
    p_particulars jsonb, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype;
        v_p jsonb; v_res bigint;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'complete_fixed_asset_particulars', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset,
      'particulars', p_particulars)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into fa from clara.fixed_assets where id = p_asset and client_id = p_client for update;
  if not found then
    raise exception 'fixed asset is not in this client' using errcode = 'CLR11';
  end if;
  -- COMPLETE-ONCE. After completion the row is immutable except for lifecycle facts; a
  -- correction goes through revise_fixed_asset_particulars, which is prospective and leaves
  -- the history it already charged intact.
  if clara._fa_particulars_complete(fa) then
    raise exception 'this asset''s particulars are already complete; use revise_fixed_asset_particulars for a prospective change'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_already_complete',
          'asset_id', p_asset)::text;
  end if;
  if fa.status not in ('pending', 'active') then
    raise exception 'only a pending or active register row can be completed'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', 'lifecycle',
          'asset_id', p_asset, 'status', fa.status)::text;
  end if;
  v_p := clara._fa_validate_particulars(p_particulars);
  -- A NON-DEPRECIABLE PROFILE ADMITS ONLY method='none': the register row has no accumulated
  -- account to charge against, so any other method would build an entry with nowhere to post.
  if fa.accum_depr_account_code is null and (v_p ->> 'method') <> 'none' then
    raise exception 'this asset sits on a non-depreciable enrolment (no accumulated-depreciation account); its method must be none'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"non_depreciable"}';
  end if;
  v_res := coalesce((v_p ->> 'residual_cents')::bigint, 0);
  if (v_p ->> 'method') <> 'none' and v_res > fa.cost_cents then
    raise exception 'a residual value cannot exceed cost'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"residual"}';
  end if;
  update clara.fixed_assets set
    depreciation_method = v_p ->> 'method',
    useful_life_months = nullif(v_p ->> 'useful_life_months', '')::int,
    depreciation_rate_bps = nullif(v_p ->> 'rate_bps', '')::int,
    residual_cents = case when (v_p ->> 'method') = 'none' then coalesce(fa.residual_cents, 0)
                          else v_res end,
    depreciation_start_date = (v_p ->> 'start_date')::date,
    description = coalesce(nullif(v_p ->> 'description', ''), fa.description),
    ca_class = coalesce(nullif(v_p ->> 'ca_class', ''), fa.ca_class),
    is_commercial_vehicle = coalesce(nullif(v_p ->> 'is_commercial_vehicle', '')::boolean,
                                     fa.is_commercial_vehicle),
    is_new = coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new),
    updated_at = now()
    where id = p_asset;
  perform clara._audit(c.firm, c.actor, null, null, 'complete_fixed_asset_particulars', null,
    jsonb_build_object('client', p_client, 'asset', p_asset, 'particulars', v_p,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'complete_fixed_asset_particulars', p_op_key,
    jsonb_build_object('asset_id', p_asset, 'client_id', p_client, 'particulars_complete', true));
end $$;
revoke all on function clara.complete_fixed_asset_particulars(uuid, uuid, jsonb, text) from public;

-- MPERS 17.19: a change in useful life, residual or method is a change in ACCOUNTING ESTIMATE
-- and is applied PROSPECTIVELY. The mechanism is supersede-forward, not an in-place edit: the
-- predecessor closes at p_effective_from with its charged history intact, and the successor
-- carries the new particulars over the remaining life.
create function clara.revise_fixed_asset_particulars(p_client uuid, p_asset uuid,
    p_particulars jsonb, p_effective_from date, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype;
        v_p jsonb; v_new uuid; v_accum bigint; v_res bigint;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'revise_fixed_asset_particulars', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset,
      'particulars', p_particulars, 'effective_from', p_effective_from)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_effective_from is null then
    raise exception 'a prospective revision needs an effective-from date'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"effective_from"}';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into fa from clara.fixed_assets where id = p_asset and client_id = p_client for update;
  if not found then
    raise exception 'fixed asset is not in this client' using errcode = 'CLR11';
  end if;
  if fa.status <> 'active' then
    raise exception 'only an active register row can be revised'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', 'lifecycle',
          'status', fa.status)::text;
  end if;
  -- A PENDING DISPOSAL FREEZES THE ROW HERE TOO [round-3.5 fold G6, cheap win]. The disposal
  -- proposal carries a stub computed from THESE particulars; revising them mid-flight leaves an
  -- approvable draft whose stub, NBV and gain were all worked out against a schedule that no
  -- longer exists -- and the approve-time freshness check would then refuse it confusingly
  -- rather than this door refusing it honestly. The freeze already applies to charging (the
  -- run verb and the due oracle both skip a frozen asset); this closes the same window on the
  -- particulars side. Remedy named, exactly as elsewhere: approve or withdraw the disposal.
  if clara._fa_disposal_draft_outstanding(p_client, p_asset, 'infinity'::date) then
    raise exception 'an un-dead disposal draft is outstanding for this asset; approve or withdraw it before revising the particulars'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'disposal_draft_outstanding',
          'asset_id', p_asset)::text;
  end if;
  if not clara._fa_particulars_complete(fa) then
    raise exception 'complete this asset''s particulars before revising them'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_incomplete', 'asset_id', p_asset)::text;
  end if;
  -- PROSPECTIVE MEANS PROSPECTIVE. A revision effective on or before a charged period would
  -- silently restate a period the books already reported.
  if exists (select 1 from clara.fa_depreciation d
             where d.asset_id = p_asset and d.is_live and d.period_end >= p_effective_from) then
    raise exception 'this revision would take effect on or before a period already charged; choose a later effective-from date, or reverse the charge first'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_revise_effective_conflict',
          'asset_id', p_asset, 'effective_from', p_effective_from)::text;
  end if;
  if fa.baseline_as_of is not null and p_effective_from <= fa.baseline_as_of then
    raise exception 'this revision would take effect on or before the carried baseline (%)', fa.baseline_as_of
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_revise_effective_conflict',
          'asset_id', p_asset, 'baseline_as_of', fa.baseline_as_of)::text;
  end if;
  -- NO ACT MAY PREDATE THE ROW IT ACTS ON [round-3 fold F8]. Inclusion is governed by
  -- coalesce(effective_from, acquired_date) (the SS1.1 as-of rule), so a revision effective
  -- BEFORE that date would put the successor in the register in a month where the acquisition
  -- GL does not yet exist -- a register/GL break born of a date nobody validated.
  if p_effective_from < coalesce(fa.effective_from, fa.acquired_date) then
    raise exception 'a revision cannot take effect before the row it revises came into effect (%)', coalesce(fa.effective_from, fa.acquired_date)
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_revise_effective_conflict',
          'axis', 'pre_birth', 'asset_id', p_asset,
          'effective_from', coalesce(fa.effective_from, fa.acquired_date))::text;
  end if;
  v_p := clara._fa_validate_particulars(p_particulars);
  if fa.accum_depr_account_code is null and (v_p ->> 'method') <> 'none' then
    raise exception 'this asset sits on a non-depreciable enrolment (no accumulated-depreciation account); its method must be none'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"non_depreciable"}';
  end if;
  v_res := case when (v_p ->> 'method') = 'none' then coalesce(fa.residual_cents, 0)
                else coalesce((v_p ->> 'residual_cents')::bigint, 0) end;
  if v_res > fa.cost_cents then
    raise exception 'a residual value cannot exceed cost'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"residual"}';
  end if;
  -- THE SUCCESSOR'S BAKE IS A PASS-THROUGH OF THE PREDECESSOR'S, NOTHING MORE [round-3 fold
  -- F1]. A revision hop has cost share 1, so the carried-baseline share is simply carried
  -- forward; the predecessor's LEDGER content is NOT baked here and is instead read along the
  -- lineage by clara._fa_accumulated_at. That is what makes a charge posted onto the superseded
  -- predecessor AFTER this revision (SS3.1's pre-revision segment, which is the whole point of
  -- letting a superseded row be charged) still reach the successor's register figure -- the
  -- earlier bake froze it out of every as-of read, permanently, on eight measured clients.
  v_accum := coalesce(fa.accumulated_depreciation_cents, 0);
  insert into clara.fixed_assets(firm_id, client_id, description, acquired_date, cost_cents,
      residual_cents, useful_life_months, depreciation_method, depreciation_rate_bps,
      asset_account_code, accum_depr_account_code, depr_expense_account_code,
      accumulated_depreciation_cents, depreciation_start_date, baseline_as_of, status,
      supersedes_asset_id, effective_from, ca_class, is_commercial_vehicle, is_new)
    values (fa.firm_id, fa.client_id,
      coalesce(nullif(v_p ->> 'description', ''), fa.description), fa.acquired_date,
      fa.cost_cents, v_res, nullif(v_p ->> 'useful_life_months', '')::int,
      v_p ->> 'method', nullif(v_p ->> 'rate_bps', '')::int,
      fa.asset_account_code, fa.accum_depr_account_code, fa.depr_expense_account_code,
      v_accum, (v_p ->> 'start_date')::date, p_effective_from - 1, 'active',
      fa.id, p_effective_from,
      coalesce(nullif(v_p ->> 'ca_class', ''), fa.ca_class),
      coalesce(nullif(v_p ->> 'is_commercial_vehicle', '')::boolean, fa.is_commercial_vehicle),
      coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new))
    returning id into v_new;
  update clara.fixed_assets set status = 'superseded', superseded_by_asset_id = v_new,
    superseded_at = p_effective_from, updated_at = now() where id = p_asset;
  perform clara._audit(c.firm, c.actor, null, null, 'revise_fixed_asset_particulars', null,
    jsonb_build_object('client', p_client, 'asset', p_asset, 'successor', v_new,
      'effective_from', p_effective_from, 'particulars', v_p, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'revise_fixed_asset_particulars', p_op_key,
    jsonb_build_object('asset_id', p_asset, 'successor_asset_id', v_new,
      'effective_from', p_effective_from, 'client_id', p_client));
end $$;
revoke all on function clara.revise_fixed_asset_particulars(uuid, uuid, jsonb, date, text) from public;

-- =====================================================================================
-- S3.4 -- clara.set_client_fy_end (design SS1.6). The interview seeds it where the year-end
-- answer exists; a real-client backfill is an owner act THROUGH THIS VERB, never an UPDATE.
-- There is deliberately no create_client recut: a client whose FY end nobody has stated yet
-- gets the Dec-31 fallback, SURFACED on the authority card.
-- =====================================================================================
create function clara.set_client_fy_end(p_client uuid, p_month int, p_day int, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_client_fy_end', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'month', p_month, 'day', p_day)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_month is null or p_day is null or p_month < 1 or p_month > 12 or p_day < 1 or p_day > 31
     or (p_month = 2 and p_day > 29)
     or (p_month in (4, 6, 9, 11) and p_day > 30) then
    raise exception 'a financial-year end must be a real calendar day (month 1..12, day valid for that month)'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"fy_end"}';
  end if;
  update clara.clients set fy_end_month = p_month, fy_end_day = p_day where id = p_client;
  perform clara._audit(c.firm, c.actor, null, null, 'set_client_fy_end', null,
    jsonb_build_object('client', p_client, 'month', p_month, 'day', p_day, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'set_client_fy_end', p_op_key,
    jsonb_build_object('client_id', p_client, 'fy_end_month', p_month, 'fy_end_day', p_day));
end $$;
revoke all on function clara.set_client_fy_end(uuid, int, int, text) from public;

-- =====================================================================================
-- S3.5 -- THE DEPRECIATION AUTHORITY FAMILY (design SS1.4; WD-R5/R9). propose (bookkeeper+)
-- -> sign (ADMIN+) -> retire (admin+). Cadence lives on the authority, so a cadence change
-- is retire + re-sign, which re-ramps -- the same law an edited rule already carries.
-- =====================================================================================
create function clara.propose_depreciation_authority(p_client uuid, p_cadence text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'propose_depreciation_authority', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'cadence', p_cadence)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_cadence is null or p_cadence not in ('monthly', 'annual') then
    raise exception 'cadence must be monthly or annual (WD-R4)'
      using errcode = 'CLR38', detail = '{"reason":"authority_cadence_invalid"}';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  if exists (select 1 from clara.fa_depreciation_authorities
             where client_id = p_client and status in ('live', 'proposed')) then
    raise exception 'this client already has a live or proposed depreciation authority; retire it before proposing another'
      using errcode = 'CLR38', detail = '{"reason":"authority_already_live"}';
  end if;
  insert into clara.fa_depreciation_authorities(firm_id, client_id, status, cadence,
      proposed_by, proposed_op_key)
    values (c.firm, p_client, 'proposed', p_cadence, c.actor, p_op_key)
    returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'propose_depreciation_authority', null,
    jsonb_build_object('client', p_client, 'authority', v_id, 'cadence', p_cadence,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'propose_depreciation_authority', p_op_key,
    jsonb_build_object('authority_id', v_id, 'client_id', p_client, 'cadence', p_cadence,
      'status', 'proposed'));
end $$;
revoke all on function clara.propose_depreciation_authority(uuid, text, text) from public;

create function clara.sign_depreciation_authority(p_client uuid, p_authority uuid, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; au record;
begin
  -- WD-R9: the SIGN floor is ADMIN+. Depreciation is the strongest autopost case in the
  -- product; the signature is what the autonomy derives from, so it sits with the firm's
  -- administration, not with whoever coded the asset.
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'sign_depreciation_authority', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'authority', p_authority)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into au from clara.fa_depreciation_authorities
    where id = p_authority and client_id = p_client for update;
  if not found then
    raise exception 'depreciation authority is not in this client' using errcode = 'CLR11';
  end if;
  if au.status <> 'proposed' then
    raise exception 'only a proposed depreciation authority can be signed'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_already_live', 'status', au.status)::text;
  end if;
  if exists (select 1 from clara.fa_depreciation_authorities
             where client_id = p_client and status = 'live') then
    raise exception 'this client already has a live depreciation authority; retire it first'
      using errcode = 'CLR38', detail = '{"reason":"authority_already_live"}';
  end if;
  update clara.fa_depreciation_authorities set status = 'live', signed_by = c.actor,
    signed_at = now(), signed_op_key = p_op_key where id = p_authority;
  perform clara._audit(c.firm, c.actor, null, null, 'sign_depreciation_authority', null,
    jsonb_build_object('client', p_client, 'authority', p_authority, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'sign_depreciation_authority', p_op_key,
    jsonb_build_object('authority_id', p_authority, 'client_id', p_client, 'status', 'live',
      'cadence', au.cadence));
end $$;
revoke all on function clara.sign_depreciation_authority(uuid, uuid, text) from public;

create function clara.retire_depreciation_authority(p_client uuid, p_authority uuid,
    p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; au record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a retirement reason is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'retire_depreciation_authority', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'authority', p_authority,
      'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into au from clara.fa_depreciation_authorities
    where id = p_authority and client_id = p_client for update;
  if not found then
    raise exception 'depreciation authority is not in this client' using errcode = 'CLR11';
  end if;
  if au.status = 'retired' then
    raise exception 'this depreciation authority is already retired'
      using errcode = 'CLR38', detail = '{"reason":"authority_not_live"}';
  end if;
  update clara.fa_depreciation_authorities set status = 'retired', retired_by = c.actor,
    retired_at = now(), retired_reason = p_reason, retired_op_key = p_op_key,
    signed_by = coalesce(au.signed_by, c.actor), signed_at = coalesce(au.signed_at, now())
    where id = p_authority;
  perform clara._audit(c.firm, c.actor, null, null, 'retire_depreciation_authority', null,
    jsonb_build_object('client', p_client, 'authority', p_authority, 'reason', p_reason,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'retire_depreciation_authority', p_op_key,
    jsonb_build_object('authority_id', p_authority, 'client_id', p_client, 'status', 'retired'));
end $$;
revoke all on function clara.retire_depreciation_authority(uuid, uuid, text, text) from public;

-- =====================================================================================
-- S3.6 -- THE RUN (design SS3.2/SS3.3). ONE PERIOD PER CALL, ONE TRANSACTION. The verb
-- INSERTS clara.journal_entries DIRECTLY -- the allocate_receipt precedent (0037) -- because
-- _draft_entry_core carries no flags column and is NEVER widened (SS9.5): proposal
-- authenticity in this product is structural, not conventional.
--
-- LOCK ORDER: op receipt -> the derived approve sub-key -> advisory 203005004 (client) ->
-- every FA read. The sub-key is claimed BEFORE the rung for the reason 0037 records at
-- allocate_receipt: _reserve_op writes a row and can BLOCK on a concurrent same-key inserter,
-- and taking that block while holding a client rung makes a deadlock reachable. On the DRAFT
-- branch the sub-key stays claimed-but-unfinished for the life of the draft -- the honest,
-- safe direction, exactly as the composites already do.
--
-- ADDITIVE REFUSAL TOKEN (recorded as a named deviation): period_request_invalid, with an
-- axis of 'not_cadence_aligned' or 'not_ended'. The pin sheet's token list covers register
-- STATE; the manual verb accepts caller-supplied dates, and a caller who names a half-month
-- or a period that has not ended yet deserves a named answer rather than a silent no-op.
-- =====================================================================================
create function clara._fa_run_period_core(p_client uuid, p_period_start date, p_period_end date,
    p_op_key text, p_actor uuid, p_firm uuid, p_verb text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_approve_key text; au record; v_due jsonb; v_res jsonb;
  v_ps date; v_pe date; v_entry uuid; v_rev uuid; v_line int := 0; r record;
  v_actor uuid; v_ramp boolean; v_status text; v_dr bigint; v_cr bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(p_firm, p_verb, p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'period_start', p_period_start,
      'period_end', p_period_end)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(p_firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', p_verb, 'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode = 'CLR10', detail = '{"reason":"approve_key_collision"}';
  end if;
  -- THE CLIENT RUNG, BEFORE ANY FA READ (design SS3.2). It is what makes the mode decision,
  -- the post and any concurrent reversal ONE lock-holding transaction -- which is why ramp
  -- flap is impossible rather than merely unlikely.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status = 'live';
  if not found then
    raise exception 'this client has no live, signed depreciation authority'
      using errcode = 'CLR38', detail = '{"reason":"authority_not_live"}';
  end if;
  v_actor := coalesce(p_actor, au.signed_by);

  -- THE PERIOD IS THE CADENCE'S, NOT THE CALLER'S (WD-R4 consumed).
  if au.cadence = 'monthly' then
    v_ps := clara._fa_month_start(p_period_start); v_pe := clara._fa_month_end(p_period_start);
  else
    v_ps := clara._fa_fy_open_for(p_client, p_period_start);
    v_pe := clara._fa_fy_end_for(p_client, p_period_start);
  end if;
  if v_ps is distinct from p_period_start or v_pe is distinct from p_period_end then
    raise exception 'this client''s % depreciation cadence runs % .. %, not % .. %', au.cadence, v_ps, v_pe, p_period_start, p_period_end
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid',
          'axis', 'not_cadence_aligned', 'cadence', au.cadence,
          'period_start', v_ps, 'period_end', v_pe)::text;
  end if;
  if v_pe >= clara._fa_today() then
    raise exception 'the period % .. % has not ended yet (MYT %)', v_ps, v_pe, clara._fa_today()
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid', 'axis', 'not_ended',
          'period_end', v_pe)::text;
  end if;

  -- SEQUENCING (design SS3.2). draft-N blocks N+1, and an earlier unmet period blocks a later
  -- one -- which is also what pins the RB arithmetic, since it can then never read around an
  -- unapproved period.
  v_due := clara._fa_oldest_unmet_period(p_client);
  if (v_due ->> 'reason') = 'period_draft_outstanding' then
    raise exception 'an un-dead depreciation draft is outstanding for this client; approve or withdraw it before running another period'
      using errcode = 'CLR38', detail = '{"reason":"period_draft_outstanding"}';
  end if;
  if coalesce((v_due ->> 'due')::boolean, false)
     and (v_due ->> 'period_start')::date < v_ps then
    raise exception 'an earlier period (% .. %) is still unmet; run the oldest unmet period first',
      (v_due ->> 'period_start')::date, (v_due ->> 'period_end')::date
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_earlier_unmet',
          'period_start', v_due ->> 'period_start', 'period_end', v_due ->> 'period_end')::text;
  end if;

  v_res := clara._fa_compute_charges(p_client, v_ps, v_pe);
  if jsonb_array_length(v_res -> 'charges') = 0 then
    -- NOTHING DUE PERSISTS NOTHING (design SS1.5). No entry, no receipt, no ledger row --
    -- so a zero-charge period earns no ramp and leaves no receipt in the way of a later,
    -- lawful run over the same period.
    return clara._finish_op(p_firm, p_verb, p_op_key,
      jsonb_build_object('status', 'noop', 'client_id', p_client,
        'period_start', v_ps, 'period_end', v_pe, 'skipped', v_res -> 'skipped'));
  end if;

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', v_pe,
      'Depreciation ' || to_char(v_ps, 'YYYY-MM-DD') || ' to ' || to_char(v_pe, 'YYYY-MM-DD'),
      'scheduled_run', v_actor,
      -- THE SIGNER STAMP [L2/round-2 fold 8]. With last_human_editor NULL, _approve_entry_core
      -- accepts ANY approver plus an attestation, and WD-R5's distinct-checker intent would not
      -- bind at all on a machine-born high-stakes charge. Stamping the AUTHORITY SIGNER puts
      -- that signer on the distinct-checker arm: if they approve their own client's high-stakes
      -- depreciation draft, the core refuses.
      au.signed_by,
      jsonb_build_object('depreciation_charges', jsonb_build_object(
        'authority_id', au.id, 'op_key', p_op_key, 'charges', v_res -> 'charges')))
    returning id into v_entry;
  -- LEGS AGGREGATED PER (expense, accumulated) PAIR: one entry per period (SS9.3), not one
  -- per asset. The register carries the per-asset detail; the GL carries the movement.
  for r in select f.depr_expense_account_code as exp_code, f.accum_depr_account_code as acc_code,
                  sum((x ->> 'amount_cents')::bigint) as amt
           from jsonb_array_elements(v_res -> 'charges') x
           join clara.fixed_assets f on f.id = (x ->> 'asset_id')::uuid
           group by 1, 2 order by 1, 2 loop
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, r.exp_code, r.amt, 0, 'Depreciation charge');
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, r.acc_code, 0, r.amt, 'Accumulated depreciation');
  end loop;
  -- EXACT EQUALITY BEFORE THE VALIDATOR (design SS3.1). _validate_entry_lines tolerates a
  -- five-sen rounding residue and would silently route it to a rounding account; a computed
  -- schedule that does not balance to the sen is a defect, not a rounding event.
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0) into v_dr, v_cr
    from clara.journal_lines where entry_id = v_entry;
  if v_dr <> v_cr then
    raise exception 'the computed depreciation entry does not balance exactly (% vs %)', v_dr, v_cr
      using errcode = 'CLR07';
  end if;
  perform clara._assert_balanced(v_entry);
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  -- THE RAMP PREDICATE, DERIVED (design SS1.4). No column, no receipt join: an approved,
  -- un-reversed origin='scheduled_run' entry for this client under THIS authority is the
  -- whole test. A zero-charge period minted no entry and therefore earns nothing; a reversal
  -- un-earns until a fresh reviewed run passes.
  v_ramp := exists (select 1 from clara.journal_entries j
                    where j.client_id = p_client and j.origin = 'scheduled_run'
                      and j.status = 'approved' and j.reversed_by is null and j.id <> v_entry
                      and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id);
  if v_ramp and not clara.is_high_stakes(v_entry) then
    -- The CLR26 open-question block or any other core refusal leaves the entry a DRAFT and
    -- the period due, honestly -- the transaction rolls back and nothing half-lands.
    perform clara._approve_entry_core(
      jsonb_build_object('actor', au.signed_by, 'firm', p_firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
  else
    v_status := 'drafted';
  end if;

  perform clara._audit(p_firm, v_actor, null, null, p_verb, v_entry,
    jsonb_build_object('client', p_client, 'authority', au.id, 'period_start', v_ps,
      'period_end', v_pe, 'charged_cents', (v_res ->> 'charged_cents')::bigint,
      'entries', (v_res ->> 'entries')::int, 'status', v_status, 'op_key', p_op_key));
  return clara._finish_op(p_firm, p_verb, p_op_key,
    jsonb_build_object('status', v_status, 'entry_id', v_entry,
      'charged_cents', (v_res ->> 'charged_cents')::bigint,
      'entries', (v_res ->> 'entries')::int, 'skipped', v_res -> 'skipped'));
end $$;
revoke all on function clara._fa_run_period_core(uuid, date, date, text, uuid, uuid, text) from public;

-- THE MACHINE PATH (design SS3.4). No _human_ctx: the leader runs under `set role
-- clara_runtime`, which has no JWT at all. Firm comes from the client row and the actor from
-- the authority signer -- the execute_rule_post model.
create function clara.run_depreciation_period(p_client uuid, p_period_start date,
    p_period_end date, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  return clara._fa_run_period_core(p_client, p_period_start, p_period_end, p_op_key,
    null, v_firm, 'run_depreciation_period');
end $$;
revoke all on function clara.run_depreciation_period(uuid, date, date, text) from public;

-- THE HUMAN PATH. _human_ctx(bookkeeper) + the firm check, then IDENTICAL mechanics -- same
-- mode derivation, same signer stamp -- so a manually-run period and a swept one are the same
-- act with the same evidence.
create function clara.run_depreciation_manual(p_client uuid, p_period_start date,
    p_period_end date, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  return clara._fa_run_period_core(p_client, p_period_start, p_period_end, p_op_key,
    c.actor, c.firm, 'run_depreciation_manual');
end $$;
revoke all on function clara.run_depreciation_manual(uuid, date, date, text) from public;

-- THE SWEEP'S DUE PROBE (pin sheet SS2). DB-OWNED DUE ARITHMETIC -- the runtime must not
-- compute a period, because a period is a figure. Reachable by the leader (no JWT) and by the
-- dashboard (JWT, firm-checked).
create function clara.depreciation_run_due(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_jwt uuid;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    return jsonb_build_object('due', false, 'reason', 'client_not_found');
  end if;
  v_jwt := clara.jwt_firm();
  if v_jwt is not null and v_jwt <> v_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  return clara._fa_oldest_unmet_period(p_client);
end $$;
revoke all on function clara.depreciation_run_due(uuid) from public;

-- =====================================================================================
-- S3.7 -- clara.dispose_fixed_asset (design SS4.1; WD-R7). PROPOSAL-SHAPED, so the
-- maker-checker window can never strand register state: the verb builds ONE entry (the stub
-- depreciation THROUGH the disposal month + the disposal legs) carrying an fa_disposal
-- proposal, and the approve-time hook executes the register effect.
--
-- ADDITIVE REFUSAL TOKEN (named deviation): disposal_request_invalid, with an axis, for
-- caller-input validation (a future date, a portion outside (0, cost), an unusable account).
-- The pin sheet's disposal tokens describe register STATE; these describe the request.
-- =====================================================================================
create function clara.dispose_fixed_asset(p_client uuid, p_asset uuid, p_disposal_date date,
    p_proceeds_cents bigint, p_proceeds_account text, p_gain_account text, p_loss_account text,
    p_memo text, p_op_key text, p_cost_portion_cents bigint default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_approve_key text; v_firm uuid; d record;
  -- %ROWTYPE (not record): _fa_particulars_complete takes the composite type.
  fa clara.fixed_assets%rowtype;
  v_stub jsonb; v_stub_total bigint; v_disp_cost bigint; v_accum_at bigint;
  v_disp_accum bigint; v_nbv bigint; v_gain bigint; v_entry uuid; v_rev uuid;
  v_line int := 0; v_status text; v_memo text; v_dr bigint; v_cr bigint;
  au record; v_pd_open date; v_unmet date; v_bake bigint; v_ledger_at bigint;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'dispose_fixed_asset', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset,
      'disposal_date', p_disposal_date, 'proceeds_cents', p_proceeds_cents,
      'proceeds_account', p_proceeds_account, 'gain_account', p_gain_account,
      'loss_account', p_loss_account,
      -- p_memo is DELIBERATELY OUT of the fingerprint [round-3 small / STR minor 1]. This hash
      -- is now both the dedupe key AND the approve-time issuer binding, and the hook can only
      -- re-derive it from facts the proposal carries. The memo is a free-text label, not part
      -- of the act's money identity: two calls sharing an op_key and differing only in their
      -- note are the SAME disposal relabelled, and replaying is the honest answer.
      'cost_portion_cents', p_cost_portion_cents)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'dispose_fixed_asset',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode = 'CLR10', detail = '{"reason":"approve_key_collision"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  -- THE RUNG BEFORE ANY FA READ (design SS4.1). The run-vs-dispose serialization cell is real,
  -- not luck: both verbs take the same client rung, so one of them is the named loser.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  if p_disposal_date is null or p_disposal_date > clara._fa_today() then
    raise exception 'a disposal date must be stated and cannot be in the future (MYT %)', clara._fa_today()
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"disposal_date"}';
  end if;
  if p_proceeds_cents is null or p_proceeds_cents < 0 then
    raise exception 'disposal proceeds must be stated and cannot be negative (state 0 for a scrapping)'
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"proceeds"}';
  end if;
  select * into fa from clara.fixed_assets where id = p_asset and client_id = p_client for update;
  if not found then
    raise exception 'fixed asset is not in this client' using errcode = 'CLR11';
  end if;
  if fa.status <> 'active' then
    raise exception 'only an active register row can be disposed (this one is %)', fa.status
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'disposal_stale', 'axis', 'lifecycle',
          'asset_id', p_asset, 'status', fa.status)::text;
  end if;
  if not clara._fa_particulars_complete(fa) then
    raise exception 'complete this asset''s particulars before disposing it -- the disposal needs its in-service date and method to compute the stub charge'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_incomplete', 'asset_id', p_asset)::text;
  end if;
  if p_cost_portion_cents is not null
     and (p_cost_portion_cents <= 0 or p_cost_portion_cents >= fa.cost_cents) then
    raise exception 'a partial disposal states a COST PORTION strictly between 0 and the asset''s cost (%)', fa.cost_cents
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"cost_portion"}';
  end if;
  -- NO ACT MAY PREDATE THE ROW IT ACTS ON [round-3 fold F8]. A disposal dated before the row
  -- came into effect would credit cost before the acquisition debit exists, producing a
  -- negative interim GL against a register that shows nothing at all.
  if p_disposal_date < coalesce(fa.effective_from, fa.acquired_date) then
    raise exception 'a disposal cannot be dated before the asset came into effect (%)', coalesce(fa.effective_from, fa.acquired_date)
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'disposal_request_invalid', 'axis', 'pre_birth',
          'asset_id', p_asset,
          'effective_from', coalesce(fa.effective_from, fa.acquired_date))::text;
  end if;
  -- NOR BEFORE THE CARRIED BASELINE IT WAS SEEDED WITH [round-3.5 fold G1, restated here]. The
  -- accumulated read below moved to the period-net reader, which FLOORS rather than refusing;
  -- this keeps the exact refusal clara._fa_accumulated used to raise, under its own token, so a
  -- disposal dated inside a carried asset's un-answerable window is still named rather than
  -- answered with a partial figure. (A K carry-down's acquired_date legitimately precedes its
  -- baseline as-of, so this window is reachable and is not covered by the check above.)
  if fa.baseline_as_of is not null and p_disposal_date < fa.baseline_as_of then
    raise exception 'the register cannot answer for % -- this asset carries a baseline as of %', p_disposal_date, fa.baseline_as_of
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_before_baseline', 'asset_id', p_asset,
          'baseline_as_of', fa.baseline_as_of, 'requested_as_of', p_disposal_date)::text;
  end if;

  -- ACCOUNT VALIDATIONS, IN THE VERB, WITH NO LITERALS ANYWHERE (design SS4.1). The UI
  -- defaults from the COA template; the DB validates the SHAPE. A credit sale's proceeds go
  -- to a NAMED non-control debtor account -- a counterparty parameter is a named deferral.
  if p_proceeds_cents > 0 then
    if p_proceeds_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_proceeds_account
                        and a.is_active and a.account_type = 'asset'
                        and a.account_class is null) then
      raise exception 'disposal proceeds must land in an active, asset-typed, non-control account (a bank account, or a named non-control debtor account for a credit sale)'
        using errcode = 'CLR39',
          detail = '{"reason":"disposal_request_invalid","axis":"proceeds_account"}';
    end if;
    if p_proceeds_account = fa.asset_account_code then
      raise exception 'disposal proceeds cannot land back in the asset''s own cost account'
        using errcode = 'CLR39',
          detail = '{"reason":"disposal_request_invalid","axis":"proceeds_account"}';
    end if;
  elsif p_proceeds_account is not null then
    raise exception 'a proceeds account was named but the proceeds are zero'
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"proceeds_account"}';
  end if;
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_gain_account
                   and a.is_active and a.account_type = 'income' and a.account_class is null) then
    raise exception 'the disposal gain account must be an active, income-typed, non-control account on this chart'
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"gain_account"}';
  end if;
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_loss_account
                   and a.is_active and a.account_type = 'expense' and a.account_class is null) then
    raise exception 'the disposal loss account must be an active, expense-typed, non-control account on this chart'
      using errcode = 'CLR39',
        detail = '{"reason":"disposal_request_invalid","axis":"loss_account"}';
  end if;
  -- NO DISPOSAL LEG MAY LAND ON AN ENROLLED FA ACCOUNT [round-3 fold F7]. Typing alone admits
  -- the asset's OWN accumulated-depreciation account as a proceeds account: cost RM1,000,
  -- accumulated RM400, proceeds RM100 then produces a perfectly balanced entry that leaves the
  -- register at zero and the GL accumulated account RM100 in DEBIT. The gain and loss accounts
  -- get the same guard for the same reason -- an enrolled account moves the register's numbers
  -- whatever role it is playing in this entry.
  -- READ THROUGH THE ONE RESERVATION PREDICATE, NOT THE ACTIVE PROFILE TABLE [round-3.5 fold
  -- G4]. The fp.active scope re-opened this very hole for a RETIRED profile: the register rows
  -- keep the codes they were born with, so a code the profile no longer names still moves the
  -- register's numbers -- and a proceeds leg landing on it would leave the register at zero and
  -- the GL accumulated account in debit, exactly as F7 measured. The predicate covers active
  -- profiles AND every code baked on a non-unwound register row.
  for d in select * from (values
      ('proceeds_account', p_proceeds_account), ('gain_account', p_gain_account),
      ('loss_account', p_loss_account)) as t(axis, code) loop
    if d.code is not null
       and exists (select 1 from clara._fa_reserved_roles(p_client) rr
                   where rr.account_code = d.code) then
      raise exception 'account % is reserved for the fixed-asset register and cannot carry a disposal proceeds, gain or loss leg', d.code
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'disposal_request_invalid', 'axis', d.axis,
            'account_code', d.code)::text;
    end if;
  end loop;

  -- THE PER-ASSET PRECONDITION (design SS4.1, listed among the verb's Validations, and
  -- named in SS7's disposal battery as its own cell): NO DUE PERIOD EARLIER THAN THE
  -- DISPOSAL MONTH may still be uncharged for this asset. Satisfying it "by construction"
  -- (letting the stub absorb every stale month) is NOT equivalent: it would date months of
  -- another period's expense at the disposal date and route them around the run verb's
  -- maker-checker ladder. Vacuous for 'none' (never charged) and for a client with no live
  -- authority -- with no cadence there are no due periods at all (SS4.1's "no authority
  -- required"). The remedy is named: run the oldest unmet period first.
  -- THE LINEAGE, NOT JUST THIS ROW [round-3 fold F3 / STR minor 6]: reading only the disposed
  -- row let a revision's superseded predecessor keep owed months while the disposal made the
  -- successor un-chargeable, so nothing was ever due again and the months were lost with every
  -- instrument green. The oracle (S2.2b) is the same one the sweep asks, so "due" here and
  -- "due" there can never diverge; the method / completeness / money-clock filters live inside
  -- it, which is why this reads as one call rather than a re-stated filter list.
  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status = 'live';
  if found then
    v_pd_open := case when au.cadence = 'monthly'
                      then clara._fa_month_start(p_disposal_date)
                      else clara._fa_fy_open_for(p_client, p_disposal_date) end;
    -- TWO BOUNDS, BECAUSE THE DISPOSAL PERIOD MEANS TWO DIFFERENT THINGS [round-3.5 fold G2].
    -- For THIS row, months inside the disposal period are STUB territory -- the stub below
    -- charges them, which is why its bound stops at the period open. For an ANCESTOR they are
    -- RUN territory, and nothing will ever charge them once this successor is disposed: revise
    -- mid-month, dispose the successor in that same month, and the superseded predecessor still
    -- owed the disposal month -- passing every check here, then posting GL depreciation for a
    -- register row the as-of read no longer holds, with no correction path. The stub is
    -- unchanged (it charges the disposed row and nothing else); the ANCESTORS are asked through
    -- the disposal DATE, and their owed months are RUN territory with a named remedy.
    v_unmet := least(clara._fa_lineage_first_due_month(p_asset, v_pd_open - 1),
                     clara._fa_ancestors_first_due_month(p_asset, p_disposal_date));
    if v_unmet is not null then
      raise exception 'this asset''s lineage has an uncharged depreciation period (% .. %) at or before the disposal month; run that period first, then dispose',
        v_unmet, clara._fa_month_end(v_unmet)
        using errcode = 'CLR38',
          detail = jsonb_build_object('reason', 'period_earlier_unmet',
            'asset_id', p_asset, 'period_start', v_unmet,
            'period_end', clara._fa_month_end(v_unmet))::text;
    end if;
  end if;

  -- THE STUB, THROUGH THE DISPOSAL MONTH (SS9.1: the disposal month IS charged), computed by
  -- the SAME arithmetic the run verb uses, with p_terminal so an RB asset's FY true-up rides
  -- this last charge. The precondition above has already guaranteed that every month the
  -- stub covers belongs to the DISPOSAL's own period (a mid-FY disposal on the annual cadence
  -- charges that FY's in-service months -- SS3.1's "the stub is that asset's only in-year
  -- charge"). The one non-vacuous case -- incomplete particulars -- was refused above.
  v_stub := clara._fa_asset_charges(p_asset, p_disposal_date, true);
  v_stub_total := (v_stub ->> 'amount_cents')::bigint;

  v_disp_cost := coalesce(p_cost_portion_cents, fa.cost_cents);
  -- THE PORTION IS SPLIT THE WAY THE REGISTER READS IT [round-3 fold F1]. Accumulated is now
  -- two independently-rounded components -- the CARRIED baseline (which the split bakes) and
  -- the LEDGER content (which clara._fa_accumulated_at pro-rates at read time) -- so the GL leg
  -- must decompose identically or the continuing successor's register figure and the GL would
  -- part company by a sen at the disposal date. round(a x k) + round(b x k) is NOT
  -- round((a+b) x k); matching the decomposition is what makes the tie exact rather than close.
  v_bake := coalesce(fa.accumulated_depreciation_cents, 0);
  -- ...AND THE LEDGER HALF IS READ PERIOD-NET, THROUGH THE DISPOSAL MONTH [round-3.5 fold G1].
  -- Two defects, one read. (i) A reverse-and-re-run of a period this asset already closed left
  -- the effective-dated read counting the original AND its replacement inside the window before
  -- the mirror -- measured relieving 30,000 where 20,000 was live, so the GL debit and the
  -- register's own figure parted company at the disposal date. (ii) A run charge covering the
  -- DISPOSAL MONTH is effective-dated at the month END, so a mid-month disposal reading at
  -- p_disposal_date missed it entirely while the stub (which sees that month as already
  -- covered) charged nothing for it -- the relief silently dropped a whole month. Both are
  -- PERIOD questions, and the period read answers both. The pre-baseline refusal that
  -- clara._fa_accumulated used to carry is restated above by name, so nothing is lost.
  v_ledger_at := clara._fa_accumulated_periods_through(p_asset,
                   clara._fa_month_end(p_disposal_date)) - v_bake + v_stub_total;
  v_accum_at := v_bake + v_ledger_at;
  v_disp_accum := case when p_cost_portion_cents is null then v_accum_at
                       else round(v_bake::numeric * p_cost_portion_cents
                                  / fa.cost_cents)::bigint
                          + round(v_ledger_at::numeric * p_cost_portion_cents
                                  / fa.cost_cents)::bigint end;
  -- A CARRIED FIGURE WITH NOWHERE TO POST IT IS NAMED, NEVER A BARE CLR07 [round-3 small /
  -- ACC-m4]. The accumulated leg is omitted when the profile is non-depreciable, so a row that
  -- carries accumulated depreciation but no accumulated account would fail the exact-balance
  -- assertion below with an unnamed error. Every refusal names a remedy.
  if v_disp_accum > 0 and fa.accum_depr_account_code is null then
    raise exception 'this asset carries % sen of accumulated depreciation but sits on a non-depreciable enrolment (no accumulated-depreciation account); re-enrol the profile with an accumulated-depreciation account before disposing it', v_disp_accum
      using errcode = 'CLR39',
        detail = jsonb_build_object('reason', 'disposal_request_invalid',
          'axis', 'accum_account_missing', 'asset_id', p_asset,
          'accumulated_cents', v_disp_accum)::text;
  end if;
  v_nbv := v_disp_cost - v_disp_accum;
  v_gain := p_proceeds_cents - v_nbv;
  v_memo := coalesce(nullif(btrim(p_memo), ''),
    'Disposal of ' || coalesce(fa.description, 'fixed asset'));

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_disposal_date, v_memo, 'manual', c.actor,
      -- THE MAKER STAMP [L2/round-2 fold 8]: the disposal's maker goes on the distinct-checker
      -- arm, so a high-stakes disposal cannot be approved by the person who raised it.
      c.actor,
      -- THE PROPOSAL CARRIES EXACTLY THE FIELDS THE REQUEST FINGERPRINT WAS TAKEN OVER, so the
      -- approve-time hook can re-derive that fingerprint and bind the receipt to THIS client's
      -- act (round-3 small / STR minor 1).
      jsonb_build_object('fa_disposal', jsonb_build_object(
        'asset_id', p_asset, 'cost_portion_cents', p_cost_portion_cents,
        'proceeds_cents', p_proceeds_cents, 'proceeds_account', p_proceeds_account,
        'gain_account', p_gain_account, 'loss_account', p_loss_account,
        'disposal_date', p_disposal_date, 'stub_charges', v_stub -> 'charges',
        -- CARRIED SO THE HOOK CAN RE-DERIVE IT [round-3.5 fold G1]: the GL legs below are built
        -- from this figure, and the hook refuses `disposal_stale` when the lineage moved it in
        -- the maker-checker window. It is deliberately NOT part of the request fingerprint -- it
        -- is a DERIVED fact about the world, not part of what the caller asked for.
        'accum_relieved_cents', v_disp_accum,
        'op_key', p_op_key)))
    returning id into v_entry;

  -- ZERO-AMOUNT LEGS ARE OMITTED (design SS4.1), so a scrapping at nil proceeds and a
  -- fully-depreciated asset both produce an entry with only the legs that actually move.
  if v_stub_total > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, fa.depr_expense_account_code, v_stub_total, 0,
        'Depreciation to disposal');
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, fa.accum_depr_account_code, 0, v_stub_total,
        'Accumulated depreciation to disposal');
  end if;
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description)
    values (v_entry, v_line, fa.asset_account_code, 0, v_disp_cost, 'Disposal of cost');
  if v_disp_accum > 0 and fa.accum_depr_account_code is not null then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, fa.accum_depr_account_code, v_disp_accum, 0,
        'Disposal of accumulated depreciation');
  end if;
  if p_proceeds_cents > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, p_proceeds_account, p_proceeds_cents, 0, 'Disposal proceeds');
  end if;
  if v_gain > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, p_gain_account, 0, v_gain, 'Gain on disposal');
  elsif v_gain < 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, p_loss_account, -v_gain, 0, 'Loss on disposal');
  end if;
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0) into v_dr, v_cr
    from clara.journal_lines where entry_id = v_entry;
  if v_dr <> v_cr then
    raise exception 'the computed disposal entry does not balance exactly (% vs %)', v_dr, v_cr
      using errcode = 'CLR07';
  end if;
  perform clara._assert_balanced(v_entry);
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if clara.is_high_stakes(v_entry) then
    v_status := 'drafted';
  else
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'dispose_fixed_asset', v_entry,
    jsonb_build_object('client', p_client, 'asset', p_asset, 'disposal_date', p_disposal_date,
      'cost_portion_cents', p_cost_portion_cents, 'proceeds_cents', p_proceeds_cents,
      'stub_cents', v_stub_total, 'nbv_cents', v_nbv, 'gain_cents', v_gain,
      'status', v_status, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'dispose_fixed_asset', p_op_key,
    jsonb_build_object('status', v_status, 'entry_id', v_entry, 'asset_id', p_asset,
      'cost_portion_cents', p_cost_portion_cents, 'stub_cents', v_stub_total,
      'nbv_cents', v_nbv, 'gain_cents', v_gain));
end $$;
revoke all on function clara.dispose_fixed_asset(uuid, uuid, date, bigint, text, text, text,
  text, text, bigint) from public;

-- #####################################################################################
-- ######################## SECTION READS -- the /assets surface #######################
-- #####################################################################################

-- =====================================================================================
-- THE AS-OF INCLUSION RULE (design SS1.1), stated ONCE and used by every read and by the
-- tie. A row is in the register at as_of iff it had come into effect by then and had not
-- left by then -- all four dates ACCOUNTING dates, never transaction time.
--
-- The unwind leg: an acquisition that was cleanly reversed leaves its row visible UP TO the
-- unwinding mirror's posting date, because the acquisition really did stand in the books
-- until then. A SPLIT SUCCESSOR unwound by a partial-disposal reversal cannot reach that
-- mirror from its own row (its acquisition_entry_id is NULL by design and its disposal link
-- was cleared by the restore), so it falls back to its own effective_from and leaves the
-- as-of read entirely -- which pairs with the design's stated partial-reversal mechanism
-- (the ORIGINAL is restored whole). The consequence is recorded rather than hidden: inside a
-- window that a partial-disposal reversal later covers, the register reads as though the
-- split never happened, exactly as the restored predecessor row now says.
-- =====================================================================================
create function clara._fa_included_at(p_asset uuid, p_as_of date) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(f.effective_from, f.acquired_date) <= p_as_of
     and (f.disposed_at is null or f.disposed_at > p_as_of)
     and (f.superseded_at is null or f.superseded_at > p_as_of)
     and (f.status <> 'unwound'
          or coalesce((select min(m.posting_date) from clara.journal_entries m
                       where m.reversal_of = f.acquisition_entry_id and m.status = 'approved'),
                      coalesce(f.effective_from, f.acquired_date)) > p_as_of)
  from clara.fixed_assets f where f.id = p_asset $$;
revoke all on function clara._fa_included_at(uuid, date) from public;

-- The uncharged chargeable months through p_through, as YYYY-MM labels. This IS the WD-R6
-- advisory's source (design SS3.1: "the advisory derives from these gaps, never receipts").
-- THE SAME ORACLE THE SWEEP USES (S2.2b) [round-3 fold F3]: the earlier form re-stated the
-- filters (status='active', method, completeness) beside a bare coverage scan, so it showed
-- an empty advisory for a SUPERSEDED predecessor that genuinely owed months, and showed months
-- for an analytically-zero schedule that nothing would ever charge. Asking the arithmetic what
-- it would emit makes the advisory true by construction.
create function clara._fa_uncharged_months(p_asset uuid, p_through date) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(jsonb_agg(to_char((x ->> 'month')::date, 'YYYY-MM')
                            order by (x ->> 'month')::date), '[]'::jsonb)
    from jsonb_array_elements(
           clara._fa_asset_charges(p_asset, p_through, false) -> 'months') x $$;
revoke all on function clara._fa_uncharged_months(uuid, date) from public;

-- A 'pending' K-carry-down row whose opening entry is still a DRAFT: real in the register, not
-- yet in the GL. The tie EXCLUDES it from the difference and reports it as an advisory count
-- [round-3 fold F9], because a firm with any parked carry-down draft otherwise reads a
-- permanently red tie that masks the breaks the instrument exists to find.
create function clara._fa_pending_unposted(p_asset uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.fixed_assets f
    where f.id = p_asset and f.status = 'pending'
      and not exists (select 1 from clara.opening_items oi
                      join clara.journal_entries je on je.id = oi.entry_id
                      where oi.fixed_asset_id = f.id and je.status = 'approved')) $$;
revoke all on function clara._fa_pending_unposted(uuid) from public;

-- The ONE asset projection every read returns, so /assets can never be shown two different
-- shapes of the same row.
create function clara._fa_asset_json(p_asset uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare f clara.fixed_assets%rowtype; v_acc bigint; v_unch jsonb;
begin
  select * into f from clara.fixed_assets where id = p_asset;
  if not found then return null; end if;
  v_acc := case when f.baseline_as_of is null or p_as_of >= f.baseline_as_of
                then clara._fa_accumulated(p_asset, p_as_of) end;
  -- ONE call, BOTH projections [round-3 fold F3]: the WD-R6 advisory's MONTHS ride the row
  -- itself, not only its count, so the professional reading /assets sees WHICH months a row
  -- owes -- including a SUPERSEDED predecessor's, which is the exact shape that used to go
  -- silently unpaid. Computing it once keeps list_fixed_assets at one arithmetic pass per row.
  v_unch := clara._fa_uncharged_months(p_asset, clara._fa_month_end(clara._fa_today()));
  return jsonb_build_object(
    'id', f.id, 'description', f.description, 'status', f.status,
    'particulars_complete', clara._fa_particulars_complete(f),
    'acquired_date', f.acquired_date, 'effective_from', f.effective_from,
    'superseded_at', f.superseded_at, 'cost_cents', f.cost_cents,
    'residual_cents', f.residual_cents, 'accumulated_cents', v_acc,
    'nbv_cents', case when v_acc is null then null else f.cost_cents - v_acc end,
    'method', f.depreciation_method, 'rate_bps', f.depreciation_rate_bps,
    'useful_life_months', f.useful_life_months, 'start_date', f.depreciation_start_date,
    'asset_account', f.asset_account_code, 'accum_account', f.accum_depr_account_code,
    'expense_account', f.depr_expense_account_code, 'ca_class', f.ca_class,
    'is_commercial_vehicle', f.is_commercial_vehicle, 'is_new', f.is_new,
    'superseded_by_asset_id', f.superseded_by_asset_id, 'disposed_at', f.disposed_at,
    'disposal_entry_id', f.disposal_entry_id,
    'uncharged_due', v_unch,
    'uncharged_due_count', jsonb_array_length(v_unch));
end $$;
revoke all on function clara._fa_asset_json(uuid, date) from public;

-- =====================================================================================
-- THE READ RPCs. Each returns ONE jsonb object (never a bare array), each is viewer-floored
-- and firm-scoped, and none of them computes a figure the DB has not already owned.
-- =====================================================================================
create function clara.list_fixed_assets(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_as_of date; v_rows jsonb; v_incomplete int;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  v_as_of := clara._fa_today();
  select coalesce(jsonb_agg(clara._fa_asset_json(f.id, v_as_of)
           order by f.acquired_date desc, f.id), '[]'::jsonb)
    into v_rows from clara.fixed_assets f
    where f.client_id = p_client and f.firm_id = c.firm;
  select count(*)::int into v_incomplete from clara.fixed_assets f
    where f.client_id = p_client and f.firm_id = c.firm
      and f.status in ('pending', 'active') and not clara._fa_particulars_complete(f);
  return jsonb_build_object('client_id', p_client, 'as_of', v_as_of,
    'assets', v_rows, 'incomplete_count', v_incomplete);
end $$;
revoke all on function clara.list_fixed_assets(uuid) from public;

create function clara.get_fixed_asset(p_asset uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; f clara.fixed_assets%rowtype; v_as_of date; v_lineage jsonb := '[]'::jsonb; v_cur uuid;
  v_charges jsonb; v_sched jsonb; v_horizon date; v_calc jsonb; v_hops int := 0;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into f from clara.fixed_assets where id = p_asset and firm_id = c.firm;
  if not found then
    raise exception 'fixed asset is not in your firm' using errcode = 'CLR11';
  end if;
  v_as_of := clara._fa_today();
  -- LINEAGE IS WALKED UPWARD (design SS1.1's split-lineage law): the disposed portion of a
  -- split is reachable only from itself upward, so every read traverses supersedes_asset_id.
  v_cur := f.supersedes_asset_id;
  while v_cur is not null and v_hops < 64 loop
    v_lineage := v_lineage || jsonb_build_array(clara._fa_asset_json(v_cur, v_as_of));
    select supersedes_asset_id into v_cur from clara.fixed_assets where id = v_cur;
    v_hops := v_hops + 1;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'period_start', d.period_start,
      'period_end', d.period_end, 'amount_cents', d.amount_cents,
      'effective_date', d.effective_date, 'entry_id', d.entry_id, 'run_id', d.run_id,
      'unwind_of', d.unwind_of) order by d.effective_date, d.period_start, d.id), '[]'::jsonb)
    into v_charges from clara.fa_depreciation d where d.asset_id = p_asset;
  -- THE SCHEDULE IS DB-PROJECTED (design SS6), from the SAME arithmetic that posts. The
  -- horizon is the later of the asset's life end and ten years out, so a carried asset whose
  -- date clock is already exhausted still projects its remaining money-clock months.
  v_sched := '[]'::jsonb;
  if f.status = 'active' and clara._fa_particulars_complete(f)
     and f.depreciation_method in ('straight_line', 'reducing_balance') then
    v_horizon := clara._fa_month_end(greatest(
      (clara._fa_month_start(f.depreciation_start_date)
        + make_interval(months => coalesce(f.useful_life_months, 0)))::date,
      (clara._fa_month_start(v_as_of) + interval '120 months')::date));
    v_calc := clara._fa_asset_charges(p_asset, v_horizon, false);
    select coalesce(jsonb_agg(jsonb_build_object(
        'period_start', (x ->> 'month')::date,
        'period_end', clara._fa_month_end((x ->> 'month')::date),
        'projected_cents', (x ->> 'amount_cents')::bigint)
        order by (x ->> 'month')::date), '[]'::jsonb)
      into v_sched from jsonb_array_elements(v_calc -> 'months') x;
  end if;
  return jsonb_build_object('asset', clara._fa_asset_json(p_asset, v_as_of),
    'lineage', v_lineage, 'charges', v_charges, 'schedule', v_sched,
    'uncharged_due', clara._fa_uncharged_months(p_asset, clara._fa_month_end(v_as_of)));
end $$;
revoke all on function clara.get_fixed_asset(uuid) from public;

create function clara.list_depreciation_runs(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_rows jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'authority_id', r.authority_id,
      'period_start', r.period_start, 'period_end', r.period_end, 'mode', r.mode,
      'entries', r.entries, 'charged_cents', r.charged_cents, 'skipped', r.skipped,
      'entry_id', r.entry_id, 'created_at', r.created_at)
      order by r.period_end desc, r.created_at desc), '[]'::jsonb)
    into v_rows from clara.fa_depreciation_runs r
    where r.client_id = p_client and r.firm_id = c.firm;
  return jsonb_build_object('client_id', p_client, 'runs', v_rows);
end $$;
revoke all on function clara.list_depreciation_runs(uuid) from public;

create function clara.get_depreciation_run(p_run uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; r record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into r from clara.fa_depreciation_runs where id = p_run and firm_id = c.firm;
  if not found then
    raise exception 'depreciation run receipt is not in your firm' using errcode = 'CLR11';
  end if;
  return jsonb_build_object('run', jsonb_build_object('id', r.id,
    'client_id', r.client_id, 'authority_id', r.authority_id, 'period_start', r.period_start,
    'period_end', r.period_end, 'mode', r.mode, 'entries', r.entries,
    'charged_cents', r.charged_cents, 'skipped', r.skipped, 'entry_id', r.entry_id,
    'created_at', r.created_at));
end $$;
revoke all on function clara.get_depreciation_run(uuid) from public;

create function clara.get_depreciation_authority(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; au record; cl record; v_ramp boolean; v_threshold bigint;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into cl from clara.clients where id = p_client and firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status in ('live', 'proposed')
    order by case when status = 'live' then 0 else 1 end limit 1;
  v_ramp := au.id is not null and au.status = 'live'
    and exists (select 1 from clara.journal_entries j
                where j.client_id = p_client and j.origin = 'scheduled_run'
                  and j.status = 'approved' and j.reversed_by is null
                  and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id);
  select f.high_stakes_amount_cents into v_threshold from clara.firms f where f.id = c.firm;
  return jsonb_build_object(
    'client_id', p_client,
    'authority', case when au.id is null then null else jsonb_build_object(
      'id', au.id, 'status', au.status, 'cadence', au.cadence,
      'proposed_by', au.proposed_by, 'signed_by', au.signed_by,
      'retired_by', au.retired_by, 'created_at', au.created_at) end,
    'ramp_earned', v_ramp,
    -- THE FALLBACK IS SURFACED, NEVER SILENT (design SS1.6): a Malaysian SME year end is very
    -- often not December, and an annual cadence computed against the wrong FY would post a
    -- whole year of depreciation into the wrong period with nothing visible to say so.
    'fy_end', jsonb_build_object('month', coalesce(cl.fy_end_month, 12),
      'day', coalesce(cl.fy_end_day, 31), 'fallback', cl.fy_end_month is null),
    'high_stakes_threshold_cents', v_threshold);
end $$;
revoke all on function clara.get_depreciation_authority(uuid) from public;

-- =====================================================================================
-- clara.fa_register_tie (design SS6) -- THE WAVE'S TIE INSTRUMENT. Effective-dated per
-- SS1.1, per enrolled (cost, accumulated) pair, VISIBILITY-ONLY and never blocking (WD-R1's
-- posture, applied to the tie as well as to completeness). The segment-aware rebuild of
-- fa_control_tie_out stays REBUILD-rated and waits on Wave E's close-segment primitive
-- (wave-d-contract SS5 debt 1); this is the honest as-of assertion for a never-closed book.
-- =====================================================================================
create function clara.fa_register_tie(p_client uuid, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; r record; v_rows jsonb := '[]'::jsonb; v_tie boolean := true;
        v_incomplete int; v_reg_cost bigint; v_reg_accum bigint;
        v_gl_cost bigint; v_gl_accum bigint; v_pre_cost bigint; v_pre_accum bigint;
        v_pending int; v_pending_tot int := 0; v_before_baseline boolean;
        v_enrolled timestamptz; v_prev_asset text; v_cost_row boolean;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_as_of is null then
    raise exception 'an as-of date is required' using errcode = 'CLR10';
  end if;
  for r in
    select p.asset_account_code as asset_code, p.accum_depr_account_code as accum_code
      from clara.fa_account_profiles p where p.client_id = p_client and p.active
    union
    select f.asset_account_code, f.accum_depr_account_code
      from clara.fixed_assets f where f.client_id = p_client
    order by 1, 2
  loop
    -- COST IS AN ASSET-ACCOUNT QUESTION, NOT A PAIR QUESTION [round-3 fold F9]. The GL side has
    -- only the account code to go on, so partitioning the REGISTER side by (cost, accumulated)
    -- while comparing against the whole account made every row nonsense the moment one asset
    -- code carried two accumulated codes (reachable by re-enrolment: register rows keep the
    -- code they were born with). Both sides are now summed per ASSET ACCOUNT, and reported
    -- EXACTLY ONCE -- on the account's FIRST row in this ordered walk -- so summing the tie's
    -- own columns across rows reproduces the account's real cost rather than a multiple of it.
    -- Only the accumulated figures stay per pair, which is the grain the accumulated GL
    -- account actually has.
    v_cost_row := r.asset_code is distinct from v_prev_asset;
    v_prev_asset := r.asset_code;
    select coalesce(sum(f.cost_cents), 0) into v_reg_cost
      from clara.fixed_assets f
      where f.client_id = p_client and f.asset_account_code = r.asset_code
        and v_cost_row
        and clara._fa_included_at(f.id, p_as_of)
        and not clara._fa_pending_unposted(f.id);
    select coalesce(sum(case when f.baseline_as_of is null or p_as_of >= f.baseline_as_of
                             then clara._fa_accumulated(f.id, p_as_of) else 0 end), 0)
      into v_reg_accum
      from clara.fixed_assets f
      where f.client_id = p_client and f.asset_account_code = r.asset_code
        and f.accum_depr_account_code is not distinct from r.accum_code
        and clara._fa_included_at(f.id, p_as_of)
        and not clara._fa_pending_unposted(f.id);
    -- The K-carry-down rows this account is holding whose opening entry is still a DRAFT:
    -- excluded from BOTH sides above and reported here, so a parked draft reads as an
    -- explanation rather than as a permanent red that hides real breaks.
    select count(*)::int into v_pending from clara.fixed_assets f
      where f.client_id = p_client and f.asset_account_code = r.asset_code
        and v_cost_row
        and clara._fa_pending_unposted(f.id);
    v_pending_tot := v_pending_tot + v_pending;
    -- An as-of EARLIER than a carried row's baseline cannot be answered honestly (that row
    -- contributes full cost and zero accumulated), so the answer is FLAGGED rather than
    -- silently returned as though it meant something.
    select exists (select 1 from clara.fixed_assets f
                   where f.client_id = p_client and f.asset_account_code = r.asset_code
                     and f.baseline_as_of is not null and p_as_of < f.baseline_as_of
                     and clara._fa_included_at(f.id, p_as_of))
      into v_before_baseline;
    select coalesce(sum(l.debit_cents - l.credit_cents), 0) into v_gl_cost
      from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id
      where l.client_id = p_client and l.account_code = r.asset_code and v_cost_row
        and j.status = 'approved' and j.posting_date <= p_as_of;
    if r.accum_code is null then
      v_gl_accum := 0;
    else
      select coalesce(sum(l.credit_cents - l.debit_cents), 0) into v_gl_accum
        from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id
        where l.client_id = p_client and l.account_code = r.accum_code
          and j.status = 'approved' and j.posting_date <= p_as_of;
    end if;
    -- PRE-ENROLMENT GL MOVEMENT [round-3 fold F9]. The SS1.2 watermark deliberately births
    -- nothing retroactively, so any GL history an account carried BEFORE it was enrolled is a
    -- difference the register can never hold. Reporting it as its own column turns a red tie on
    -- a real book into an EXPLAINED number instead of an unactionable one -- and gives the
    -- ceremony a pre-flight it can read (a non-zero figure here means: pick a fresh account
    -- code, or accept and document a non-tying account).
    -- EVERY ENROLMENT INTERVAL, NOT THE LIVE ROW'S WATERMARK [round-3.5 fold G8]. The F5b
    -- version-forward retires one interval and opens another, so scoping this to p.active reads
    -- the LATEST enrolment as though the account had never been enrolled before it -- and every
    -- entry approved under the earlier interval, which the register really does hold, is then
    -- reported as unexplained "pre-enrolment" GL. The account's history starts at the FIRST time
    -- it was ever enrolled; that is the only watermark that makes this column mean what it says.
    select min(p.enrolled_at) into v_enrolled from clara.fa_account_profiles p
      where p.client_id = p_client and p.asset_account_code = r.asset_code;
    if v_enrolled is null then
      v_pre_cost := 0; v_pre_accum := 0;
    else
      select coalesce(sum(l.debit_cents - l.credit_cents), 0) into v_pre_cost
        from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id
        where l.client_id = p_client and l.account_code = r.asset_code and v_cost_row
          and j.status = 'approved' and j.posting_date <= p_as_of
          and coalesce(j.approved_at, j.created_at) < v_enrolled;
      if r.accum_code is null then
        v_pre_accum := 0;
      else
        select coalesce(sum(l.credit_cents - l.debit_cents), 0) into v_pre_accum
          from clara.journal_lines l join clara.journal_entries j on j.id = l.entry_id
          where l.client_id = p_client and l.account_code = r.accum_code
            and j.status = 'approved' and j.posting_date <= p_as_of
            and coalesce(j.approved_at, j.created_at) < v_enrolled;
      end if;
    end if;
    if v_reg_cost <> v_gl_cost or v_reg_accum <> v_gl_accum then v_tie := false; end if;
    v_rows := v_rows || jsonb_build_object('asset_account', r.asset_code,
      'accum_account', r.accum_code, 'register_cost_cents', v_reg_cost,
      'gl_cost_cents', v_gl_cost, 'cost_diff_cents', v_reg_cost - v_gl_cost,
      'register_accum_cents', v_reg_accum, 'gl_accum_cents', v_gl_accum,
      'accum_diff_cents', v_reg_accum - v_gl_accum,
      'gl_pre_enrolment_cost_cents', v_pre_cost,
      'gl_pre_enrolment_accum_cents', v_pre_accum,
      'pending_draft_rows', v_pending,
      -- FALSE on a second (or later) accumulated pairing of the SAME asset account: cost is an
      -- account-level fact and is reported on the account's first row only.
      'cost_reported_here', v_cost_row,
      'before_baseline', v_before_baseline);
  end loop;
  select count(*)::int into v_incomplete from clara.fixed_assets f
    where f.client_id = p_client and f.status in ('pending', 'active')
      and not clara._fa_particulars_complete(f);
  return jsonb_build_object('client_id', p_client, 'as_of', p_as_of, 'tie', v_tie,
    'accounts', v_rows, 'incomplete_count', v_incomplete,
    'pending_draft_count', v_pending_tot);
end $$;
revoke all on function clara.fa_register_tie(uuid, date) from public;

-- =====================================================================================
-- SECTION READS -- bulk grant loop (the 0038:8056-8064 idiom, copied 0040:4790-4801):
-- revoke from public, grant to clara_authenticated only, re-assert clara_fn_owner ownership.
-- =====================================================================================
do $racl$ declare f text; begin
  foreach f in array array[
      'clara.list_fixed_assets(uuid)', 'clara.get_fixed_asset(uuid)',
      'clara.list_depreciation_runs(uuid)', 'clara.get_depreciation_run(uuid)',
      'clara.get_depreciation_authority(uuid)', 'clara.fa_register_tie(uuid,date)',
      'clara.upsert_fa_account_profile(uuid,text,text,text,text)',
      'clara.retire_fa_account_profile(uuid,text,text)',
      'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
      'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
      'clara.set_client_fy_end(uuid,integer,integer,text)',
      'clara.propose_depreciation_authority(uuid,text,text)',
      'clara.sign_depreciation_authority(uuid,uuid,text)',
      'clara.retire_depreciation_authority(uuid,uuid,text,text)',
      'clara.run_depreciation_manual(uuid,date,date,text)',
      'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to clara_authenticated', f);
    execute format('alter function %s owner to clara_fn_owner', f);
  end loop;
end $racl$;

-- THE MACHINE LANE (design SS3.4). The leader runs under `set role clara_runtime` -- a GROUP
-- role; clara_runtime_login inherits nothing, so the grant goes on the group and the login
-- role reaches it only by explicitly assuming it. The due probe is granted to BOTH lanes (the
-- dashboard shows the same advisory the sweep acts on); the RUN verb is granted to the
-- runtime ONLY -- a human runs depreciation through run_depreciation_manual, which is
-- _human_ctx-floored and firm-checked.
do $macl$ begin
  execute 'revoke all on function clara.run_depreciation_period(uuid,date,date,text) from public';
  execute 'grant execute on function clara.run_depreciation_period(uuid,date,date,text) to clara_runtime';
  execute 'alter function clara.run_depreciation_period(uuid,date,date,text) owner to clara_fn_owner';
  execute 'revoke all on function clara.depreciation_run_due(uuid) from public';
  execute 'grant execute on function clara.depreciation_run_due(uuid) to clara_runtime';
  execute 'grant execute on function clara.depreciation_run_due(uuid) to clara_authenticated';
  execute 'alter function clara.depreciation_run_due(uuid) owner to clara_fn_owner';
end $macl$;

reset role;

-- #####################################################################################
-- ###### SECTION S4 -- THE SPLICE REGISTER (change-of-record surgery on live bodies) ###
-- #####################################################################################
-- Eleven entries; reverse_entry takes two of them (S4.4, then S4.10 at the end of the register,
-- because S4.10 must splice the body S4.4 already produced), and S4.11 [round-3.5 fold G3]
-- recuts the K6 writer so the register's supersede date is a stamped fact, not an inference.
-- Every one of them: fetch pg_get_functiondef from the CATALOG (never file
-- text) -> idempotency probe (the new marker must NOT already be present) -> pre-existing
-- marker census at EXACT counts, every count MEASURED on a database migrated 0001..0040 from
-- zero (anti-revert: a body rebuilt from file text upstream would have lost a prior splice)
-- -> prestate anchor at EXACT count -> replace + execute -> postcheck (new marker present,
-- OLD form gone via position()=0 so a vacuous replace cannot pass, census re-run at the same
-- counts, owner unchanged).
--
-- Counted, not merely probed: replace() rewrites EVERY occurrence, so a drifted body holding
-- two copies of an anchor would take two splices while a bare position()>0 postcheck stayed
-- green (0038:7785-7790 / 0039 / 0040:7004-7006).

-- =====================================================================================
-- S4.1 -- clara._subledger_on_approve: THE FA HOOK SPLICE (design SS2.1).
-- =====================================================================================
set role clara_fn_owner;

do $s4_1$
declare
  v_sig text := 'clara._subledger_on_approve(uuid)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.1 prestate: clara._subledger_on_approve is GONE' using errcode = 'CLR10';
  end if;
  if position('clara._fa_on_approve(' in v_def) <> 0 then
    raise exception '0041 S4.1 prestate: _subledger_on_approve already calls the FA hook -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE FIVE-MARKER PRESTATE CENSUS (design SS2.1), at their measured counts.
  for r in select * from (values
      ('payment_terms_days', 1),
      ('effective_date', 3),
      ($$item_kind in ('invoice','bill')$$, 1),
      ('cross_domain_control_entry', 1),
      ('allocation_stale', 6)
    ) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.1 prestate: the live _subledger_on_approve body carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice; re-derive this section against the live catalog', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE ANCHOR IS THE MULTI-LINE FRAGMENT from the item-INSERT tail through its `end loop;`
  -- [L2/round-2 majors]: `end loop;` ALONE occurs twice in this body (0037:1118 and
  -- 0037:1260), so the single-line form would splice into the wrong loop half the time.
  v_frm := $f$    if v_item is not null then
      perform clara._append_event(e.firm_id,
        case when r.item_kind = 'reversal_unwind' then 'open_item.unwound'
             else 'open_item.created' end,
        e.client_id, v_actor, null, null, p_entry, e.document_id, null,
        jsonb_build_object('item_id', v_item, 'domain', r.domain,
          'counterparty_id', r.counterparty_id, 'item_kind', r.item_kind,
          'amount_cents', r.amount_cents));
    end if;
  end loop;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.1 prestate: the item-INSERT tail anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$    if v_item is not null then
      perform clara._append_event(e.firm_id,
        case when r.item_kind = 'reversal_unwind' then 'open_item.unwound'
             else 'open_item.created' end,
        e.client_id, v_actor, null, null, p_entry, e.document_id, null,
        jsonb_build_object('item_id', v_item, 'domain', r.domain,
          'counterparty_id', r.counterparty_id, 'item_kind', r.item_kind,
          'amount_cents', r.amount_cents));
    end if;
  end loop;

  -- 0041 (Wave D-a, design SS2.1): THE FIXED-ASSET REGISTER HOOK. Placed AFTER the
  -- classify/materialise loop and BEFORE the settlement early-return below. v1 put it at the
  -- tail of this body, where the `if v_prop is null then return; end if;` above it made it
  -- DEAD CODE for every non-settlement entry -- which is every acquisition [L2/round-1].
  -- All four approve paths funnel through this function, so this one line is what makes FA
  -- materialisation intrinsic at every one of them (ARCHITECTURE SS3.5, PRD F3).
  perform clara._fa_on_approve(p_entry);
$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, 'clara._fa_on_approve(p_entry)', '')))
           / length('clara._fa_on_approve(p_entry)');
  if v_cnt <> 1 then
    raise exception '0041 S4.1 postcheck: the FA hook call landed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('payment_terms_days', 1), ('effective_date', 3),
      ($$item_kind in ('invoice','bill')$$, 1),
      ('cross_domain_control_entry', 1), ('allocation_stale', 6)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.1 postcheck: marker "%" is now % (expected %) -- the splice damaged the body', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.1 postcheck: _subledger_on_approve changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.1 OK: clara._fa_on_approve is spliced into _subledger_on_approve before the settlement early-return; all five pre-existing markers survived at their measured counts.';
end $s4_1$;

reset role;

-- =====================================================================================
-- S4.2 / S4.3 -- THE AF-1 HARD-REFUSE GUARD (WD-R13; design SS5.1). Wave C residual AF-1,
-- paid here. Placement is the contract's: INSIDE both allocation loops, AFTER the
-- reversed-entry wall and BEFORE the outstanding read.
--
-- WHAT IT CLOSES: a settlement dated BEFORE the item it settles. The aging buckets are
-- item_date-driven and allocations are effective-dated at the settlement's posting date, so
-- allocating a 31-Aug receipt against a 30-Sep invoice makes SUM(buckets) <> control at every
-- as-of in between -- the exact silent break the RPR Aug-31/Sep-30 scars are made of.
--
-- HARD REFUSE, NO OVERRIDE (WD-R13 ruling): correct books already have the route, and the
-- message names it -- book the money as a deposit/advance on account and apply it with
-- apply_open_items once the invoice exists. apply_open_items is structurally immune to this
-- defect because it is ACT-dated and takes no caller date at all.
--
-- TWO SEPARATE BLOCKS, each naming its target as a LITERAL signature variable, because
-- scripts/check-binding-post-control.mjs must be able to attribute every post-0029 CoR patch
-- statically -- a loop over a VALUES list of signatures is unparseable to it and FAILS CLOSED
-- (measured: it rejected the loop form of this very splice).
-- =====================================================================================
set role clara_fn_owner;

do $s4_2$
declare
  v_sig text := 'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.2 prestate: % is GONE', v_sig using errcode = 'CLR10';
  end if;
  if position('allocation_to_unborn_item' in v_def) <> 0 then
    raise exception '0041 S4.2 prestate: % already carries the AF-1 guard -- this splice has already been applied to this database', v_sig
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('allocation_target_reversed', 1), ('allocation_target_not_open', 1),
      ('expected_outstanding_cents', 1), ('approve_key_collision', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.2 prestate: % carries the marker "%" % time(s), expected % -- the body drifted; re-derive this splice', v_sig, r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  v_frm := $f$    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to receipt against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.2 prestate: the outstanding-read anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$    -- 0041 (WD-R13, AF-1): THE UNBORN-ITEM WALL. A settlement dated BEFORE the item
    -- it settles breaks SUM(aging buckets) = control at every as-of in between, silently: the
    -- buckets are item_date-driven while this allocation is effective-dated at the
    -- settlement's posting date. HARD REFUSE, no override (WD-R13) -- an override flag would
    -- simply re-open the break it closes. The remedy is the sanctioned one and the message
    -- names it; apply_open_items is act-dated and structurally immune to this defect.
    if i.item_date is not null and p_posting_date < i.item_date then
      raise exception 'open item % is dated % -- later than this settlement (%); book the money as a deposit or advance on account and apply it with apply_open_items once the item exists', al.item_id, i.item_date, p_posting_date
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_to_unborn_item',
            'item_id',al.item_id,'item_date',i.item_date,
            'posting_date',p_posting_date)::text;
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to receipt against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, 'allocation_to_unborn_item', '')))
           / length('allocation_to_unborn_item');
  if v_cnt <> 1 then
    raise exception '0041 S4.2 postcheck: the AF-1 guard landed % time(s) in % (expected 1)', v_cnt, v_sig
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('allocation_target_reversed', 1), ('allocation_target_not_open', 1),
      ('expected_outstanding_cents', 1), ('approve_key_collision', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.2 postcheck: marker "%" in % is now % (expected %)', r.marker, v_sig, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.2 postcheck: % changed owner', v_sig using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.2 OK: the AF-1 unborn-item wall is installed in %, after the reversed-entry wall and before the outstanding read; four pre-existing markers survived.', v_sig;
end $s4_2$;

reset role;

set role clara_fn_owner;

do $s4_3$
declare
  v_sig text := 'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.3 prestate: % is GONE', v_sig using errcode = 'CLR10';
  end if;
  if position('allocation_to_unborn_item' in v_def) <> 0 then
    raise exception '0041 S4.3 prestate: % already carries the AF-1 guard -- this splice has already been applied to this database', v_sig
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('allocation_target_reversed', 1), ('allocation_target_not_open', 1),
      ('expected_outstanding_cents', 1), ('approve_key_collision', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.3 prestate: % carries the marker "%" % time(s), expected % -- the body drifted; re-derive this splice', v_sig, r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  v_frm := $f$    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to pay against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.3 prestate: the outstanding-read anchor appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$    -- 0041 (WD-R13, AF-1): THE UNBORN-ITEM WALL. A settlement dated BEFORE the item
    -- it settles breaks SUM(aging buckets) = control at every as-of in between, silently: the
    -- buckets are item_date-driven while this allocation is effective-dated at the
    -- settlement's posting date. HARD REFUSE, no override (WD-R13) -- an override flag would
    -- simply re-open the break it closes. The remedy is the sanctioned one and the message
    -- names it; apply_open_items is act-dated and structurally immune to this defect.
    if i.item_date is not null and p_posting_date < i.item_date then
      raise exception 'open item % is dated % -- later than this settlement (%); book the money as a deposit or advance on account and apply it with apply_open_items once the item exists', al.item_id, i.item_date, p_posting_date
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_to_unborn_item',
            'item_id',al.item_id,'item_date',i.item_date,
            'posting_date',p_posting_date)::text;
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to pay against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_cnt := (length(v_def) - length(replace(v_def, 'allocation_to_unborn_item', '')))
           / length('allocation_to_unborn_item');
  if v_cnt <> 1 then
    raise exception '0041 S4.3 postcheck: the AF-1 guard landed % time(s) in % (expected 1)', v_cnt, v_sig
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('allocation_target_reversed', 1), ('allocation_target_not_open', 1),
      ('expected_outstanding_cents', 1), ('approve_key_collision', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.3 postcheck: marker "%" in % is now % (expected %)', r.marker, v_sig, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.3 postcheck: % changed owner', v_sig using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.3 OK: the AF-1 unborn-item wall is installed in %, after the reversed-entry wall and before the outstanding read; four pre-existing markers survived.', v_sig;
end $s4_3$;

reset role;

-- =====================================================================================
-- S4.4 -- clara.reverse_entry: THE MYT DATE SPLICE (WD-R13; design SS5.2). The FIFTH patch
-- on this body. A UTC runtime between 00:00 and 08:00 MYT dates a reversal a DAY EARLY,
-- which in Wave D matters more than it did in Wave C: the depreciation unwind is
-- effective-dated at the mirror's posting date, so a day-early mirror moves an as-of read.
-- The house MYT idiom (0016:477) is `(now() at time zone 'Asia/Kuala_Lumpur')::date`.
-- =====================================================================================
set role clara_fn_owner;

do $s4_4$
declare
  v_sig text := 'clara.reverse_entry(uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.4 prestate: clara.reverse_entry is GONE' using errcode = 'CLR10';
  end if;
  if position('Asia/Kuala_Lumpur' in v_def) <> 0 then
    raise exception '0041 S4.4 prestate: reverse_entry already dates its mirror in MYT -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE THREE PRIOR SPLICE MARKERS, POSITIVELY PROBED (wave-d-contract SS3): this body carries
  -- 0017's K-family boundary, 0037-H.2's allocation serialization and 0038-E7's bank-match
  -- wall, and NONE of them touches the mirror-INSERT values fragment this splice anchors on.
  for r in select * from (values
      ('opening_entry_k_family_only', 1),
      ('allocated_items_present', 2),
      ('live_bank_match_present', 1),
      ('pg_advisory_xact_lock(203005004', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.4 prestate: reverse_entry carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- current_date occurs EXACTLY ONCE in the live body (measured), and it is the mirror's
  -- posting_date. The anchor is the whole values fragment anyway, so the replace cannot wander.
  v_frm := $f$    values(o.client_id,'draft',current_date,'Reversal: '||p_reason,'reversal',o.resolution_id,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.4 prestate: the mirror-INSERT values fragment appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$    values(o.client_id,'draft',(now() at time zone 'Asia/Kuala_Lumpur')::date,'Reversal: '||p_reason,'reversal',o.resolution_id,$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('Asia/Kuala_Lumpur' in v_def) = 0 then
    raise exception '0041 S4.4 postcheck: the MYT date did not land' using errcode = 'CLR10';
  end if;
  if position('current_date' in v_def) <> 0 then
    raise exception '0041 S4.4 postcheck: current_date is still present in reverse_entry -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('opening_entry_k_family_only', 1), ('allocated_items_present', 2),
      ('live_bank_match_present', 1), ('pg_advisory_xact_lock(203005004', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.4 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.4 postcheck: reverse_entry changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.4 OK: reverse_entry dates its mirror on the Malaysian legal date; all three prior splice markers survived.';
end $s4_4$;

reset role;

-- =====================================================================================
-- S4.5 -- clara._draft_opening_item_core: THE FOUR-PART CARRY-DOWN RECUT (design SS5.3;
-- WD-R3; wave-d-contract SS3 trap "the carry-down's CLR31 refusal sites").
--   part 1+2 -- BOTH CLR31 method sites widen to the three ruled methods (they appear twice
--               because the body validates the envelope once for the LINES and once for the
--               REGISTER row; an unknown method still refuses CLR31 BY NAME).
--   part 3   -- the hardcoded 'straight_line' INSERT literal becomes v_method, with the RB
--               rate carried and the drivers validated both ways.
--   part 4   -- the FA line builder OMITS the accumulated leg when nothing is carried or the
--               profile is non-depreciable [L2/round-2 majors]: a zero-accumulated real asset
--               and a plot of land both refuse TODAY at _validate_entry_lines, which demands
--               exactly one positive side per line. The OBE contra absorbs either way.
-- The 0017:5663 byte pin (`v_entry,v_accum,(a->>'depreciation_start_date')::date,s.as_of,
-- 'pending',v_supersedes_asset`) sits AFTER every edit below and is preserved verbatim.
-- =====================================================================================
set role clara_fn_owner;

do $s4_5$
declare
  v_sig text := 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.5 prestate: clara._draft_opening_item_core is GONE' using errcode = 'CLR10';
  end if;
  if position('v_rate int;' in v_def) <> 0 then
    raise exception '0041 S4.5 prestate: the carry-down already carries the D-a method widening -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('depreciation_method_unsupported', 2),
      ('fixed asset books-grade baseline is incomplete', 2),
      ('carried accumulated depreciation', 1),
      ('registry_not_open', 1),
      ('duplicate_seed', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.5 prestate: the carry-down carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0) THE DECLARATION gains the rate variable.
  v_frm := $f$  v_cost bigint; v_accum bigint; v_residual bigint; v_life int;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.5 prestate (0): the numeric declaration line appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$  v_cost bigint; v_accum bigint; v_residual bigint; v_life int; v_rate int;$t$);

  -- (1+2) BOTH CLR31 METHOD SITES.
  v_frm := $f$    v_method:=coalesce(nullif(a->>'depreciation_method',''),'straight_line');
    if v_method<>'straight_line' then
      raise exception 'non-straight-line depreciation is deferred to Wave D'
        using errcode='CLR31',
          detail='{"reason":"depreciation_method_unsupported"}';
    end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 2 then
    raise exception '0041 S4.5 prestate (1+2): the CLR31 method refusal appears % time(s) (expected exactly 2 -- the lines pass and the register pass)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    v_method:=coalesce(nullif(a->>'depreciation_method',''),'straight_line');
    -- 0041 (D-a SS5.3; WD-R3): the three ruled methods. An UNKNOWN method still refuses
    -- CLR31 by name -- widening the schema without widening this site would make the
    -- carry-down refuse methods the register now supports, and widening it to "anything"
    -- would let a typo become a silent straight_line.
    if v_method not in ('straight_line','reducing_balance','none') then
      raise exception 'unsupported depreciation method for an opening fixed asset'
        using errcode='CLR31',
          detail='{"reason":"depreciation_method_unsupported"}';
    end if;$t$);

  -- (3a) THE NUMERIC ENVELOPE gains the rate and nulls the drivers method by method.
  v_frm := $f$    begin
      v_cost:=(a->>'cost_cents')::bigint;
      v_accum:=coalesce((a->>'accumulated_depreciation_cents')::bigint,0);
      v_residual:=coalesce((a->>'residual_cents')::bigint,0);
      v_life:=(a->>'useful_life_months')::int;
    exception when others then
      raise exception 'fixed asset numeric baseline is malformed' using errcode='CLR10';
    end;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 2 then
    raise exception '0041 S4.5 prestate (3a): the numeric envelope block appears % time(s) (expected exactly 2)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    begin
      v_cost:=(a->>'cost_cents')::bigint;
      v_accum:=coalesce((a->>'accumulated_depreciation_cents')::bigint,0);
      v_residual:=coalesce((a->>'residual_cents')::bigint,0);
      v_life:=nullif(a->>'useful_life_months','')::int;
      -- 0041 (D-a SS5.3): the RB rate rides the same envelope. method 'none' (land) carries
      -- NEITHER driver and straight_line carries no rate -- which is exactly what the
      -- widened ck_fa_method_drivers CHECK demands, stated here so the two cannot disagree.
      v_rate:=nullif(a->>'depreciation_rate_bps','')::int;
      if v_method='none' then v_life:=null; v_rate:=null;
      elsif v_method='straight_line' then v_rate:=null;
      end if;
    exception when others then
      raise exception 'fixed asset numeric baseline is malformed' using errcode='CLR10';
    end;$t$);

  -- (3b) THE BOOKS-GRADE VALIDATION, method-aware on both driver and account axes.
  v_frm := $f$    if nullif(btrim(a->>'description'),'') is null
       or nullif(a->>'acquired_date','') is null
       or v_cost<=0 or v_life<=0 or v_accum<0 or v_residual<0
       or v_accum>v_cost-v_residual
       or nullif(a->>'depreciation_start_date','') is null
       or exists(select 1 from (values(v_asset_code),(v_accum_code),(v_expense_code)) q(code)
          where code is null or not exists(select 1 from clara.coa_accounts ca
            where ca.client_id=p_client and ca.account_code=q.code and ca.is_active
              and coalesce(ca.account_class,'') not in ('payable','receivable'))) then$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 2 then
    raise exception '0041 S4.5 prestate (3b): the books-grade validation appears % time(s) (expected exactly 2)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    if nullif(btrim(a->>'description'),'') is null
       or nullif(a->>'acquired_date','') is null
       or v_cost<=0 or v_accum<0 or v_residual<0
       or v_accum>v_cost-v_residual
       or nullif(a->>'depreciation_start_date','') is null
       -- 0041 (D-a SS5.3): METHOD-DRIVER CONGRUENCE, both ways.
       or (v_method='none' and (v_life is not null or v_rate is not null))
       or (v_method='straight_line' and (v_life is null or v_life<=0))
       or (v_method='reducing_balance' and (v_life is null or v_life<=0
             or v_rate is null or v_rate<1 or v_rate>10000))
       -- 0041: the cost account is always required; the accumulated and expense codes are
       -- required only for a DEPRECIABLE asset (a land carry-down has no accumulated pair --
       -- MPERS 17.16, WD-R3), and any code that IS stated must be a real, active,
       -- non-control account of this client.
       or v_asset_code is null
       or (v_method<>'none' and (v_accum_code is null or v_expense_code is null))
       or (v_accum>0 and v_accum_code is null)
       or exists(select 1 from (values(v_asset_code),(v_accum_code),(v_expense_code)) q(code)
          where code is not null and not exists(select 1 from clara.coa_accounts ca
            where ca.client_id=p_client and ca.account_code=q.code and ca.is_active
              and coalesce(ca.account_class,'') not in ('payable','receivable'))) then$t$);

  -- (3c) THE INSERT COLUMN LIST gains depreciation_rate_bps.
  v_frm := $f$        residual_cents,useful_life_months,depreciation_method,asset_account_code,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.5 prestate (3c): the fixed_assets INSERT column list appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$        residual_cents,useful_life_months,depreciation_method,depreciation_rate_bps,asset_account_code,$t$);

  -- (3d) THE INSERT LITERAL becomes v_method (+ the rate). The 0017:5663 byte pin sits on the
  -- NEXT line and is untouched.
  v_frm := $f$        v_residual,v_life,'straight_line',v_asset_code,v_accum_code,v_expense_code,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.5 prestate (3d): the hardcoded straight_line INSERT literal appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$        v_residual,v_life,v_method,v_rate,v_asset_code,v_accum_code,v_expense_code,$t$);

  -- (4) THE LINE BUILDER omits the accumulated leg when there is nothing to carry.
  v_frm := $f$    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',v_asset_code,'debit_cents',v_cost,
        'credit_cents',0,'description',a->>'description'),
      jsonb_build_object('account_code',v_accum_code,'debit_cents',0,
        'credit_cents',v_accum,'description','carried accumulated depreciation'),
      jsonb_build_object('account_code',v_obe,'debit_cents',0,
        'credit_cents',v_cost-v_accum,
        'description','opening balance equity contra'));$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.5 prestate (4): the FA line builder appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$    -- 0041 (D-a SS5.3 part 4): NO ACCUMULATED LEG WHEN THERE IS NOTHING CARRIED. A
    -- zero-accumulated real asset and a plot of land both produced a zero/zero line here,
    -- which _validate_entry_lines refuses outright ("each line must carry exactly one
    -- positive debit or credit") -- so neither could be seeded at all. The OBE contra
    -- already carries cost-minus-accumulated, so omitting the leg keeps the entry balanced.
    v_lines:=jsonb_build_array(
      jsonb_build_object('account_code',v_asset_code,'debit_cents',v_cost,
        'credit_cents',0,'description',a->>'description'))
      || case when v_accum>0 and v_accum_code is not null
              then jsonb_build_array(jsonb_build_object('account_code',v_accum_code,
                'debit_cents',0,'credit_cents',v_accum,
                'description','carried accumulated depreciation'))
              else '[]'::jsonb end
      || jsonb_build_array(jsonb_build_object('account_code',v_obe,'debit_cents',0,
        'credit_cents',v_cost-v_accum,
        'description','opening balance equity contra'));$t$);

  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('v_rate int;' in v_def) = 0
     or position('reducing_balance' in v_def) = 0
     or position('v_residual,v_life,v_method,v_rate,' in v_def) = 0 then
    raise exception '0041 S4.5 postcheck: the carry-down recut did not land' using errcode = 'CLR10';
  end if;
  if position($p$'straight_line',v_asset_code$p$ in v_def) <> 0
     or position('non-straight-line depreciation is deferred to Wave D' in v_def) <> 0 then
    raise exception '0041 S4.5 postcheck: an old straight_line-only form is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  -- THE 0017:5663 BYTE PIN, RE-ASSERTED (whitespace-insensitive, exactly as 0017 measured it).
  if position('v_entry,v_accum,(a->>''depreciation_start_date'')::date,s.as_of,''pending'',v_supersedes_asset'
       in regexp_replace(lower(v_def), '\s+', '', 'g')) = 0 then
    raise exception '0041 S4.5 postcheck: the 0017 R3-F4 all-drafts-pending byte pin was damaged by this recut'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('depreciation_method_unsupported', 2),
      ('fixed asset books-grade baseline is incomplete', 2),
      ('carried accumulated depreciation', 1),
      ('registry_not_open', 1), ('duplicate_seed', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.5 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.5 postcheck: the carry-down core changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.5 OK: the carry-down accepts all three methods, carries the RB rate, validates the drivers both ways, and omits the accumulated leg when nothing is carried; the 0017:5663 byte pin survived.';
end $s4_5$;

reset role;

-- =====================================================================================
-- S4.6 -- clara._assert_fa_baseline (design SS5.4). Two edits:
--   (a) the CORRESPONDENCE admits D-a lifecycle states on a still-active opening item. The
--       assertion is SEED-WIDE and runs before AND after every K mutation, so without this
--       the first disposal of ANY carried asset would wedge the whole seed for every other
--       item's correction (the seed-wide wedge).
--   (b) the K6 SAME-ITEM hand-off gets a NAMED refusal. Correcting the opening baseline of
--       an asset that has already been disposed, split or unwound is refused honestly --
--       the K6 hand-off would otherwise fail with an unnamed two-row transition count.
--       Scoped to items still state='active' with a replacement pending, so the POST-hand-off
--       re-assertion (which sees state='superseded') stays green.
-- The three 0017:5677 correspondence byte pins are preserved verbatim below.
-- =====================================================================================
set role clara_fn_owner;

do $s4_6$
declare
  v_sig text := 'clara._assert_fa_baseline(uuid)';
  v_def text; v_frm text; v_to text; v_cnt int; v_src text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.6 prestate: clara._assert_fa_baseline is GONE' using errcode = 'CLR10';
  end if;
  if position('fixed_asset_lifecycle_advanced' in v_def) <> 0 then
    raise exception '0041 S4.6 prestate: _assert_fa_baseline already carries the D-a lifecycle recut -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  if (length(v_def) - length(replace(v_def, 'tie_mismatch', ''))) / length('tie_mismatch') <> 1 then
    raise exception '0041 S4.6 prestate: the tie_mismatch refusal is not present exactly once -- the body drifted'
      using errcode = 'CLR10';
  end if;

  -- (a) THE CORRESPONDENCE WIDENING.
  v_frm := $f$      or not (
        (oi.state='active' and (
          (je.status='draft' and fa.status='pending')
          or (je.status='approved' and fa.status='active')))
        or (oi.state='superseded' and je.status='approved'
          and fa.status='superseded'))$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.6 prestate (a): the correspondence disjunction appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$      or not (
        (oi.state='active' and (
          (je.status='draft' and fa.status='pending')
          or (je.status='approved' and fa.status='active')
          -- 0041 (D-a SS5.4): a still-active opening item whose REGISTER row has moved on
          -- through the D-a lifecycle. The baseline it asserts (cost, carried accumulated,
          -- the acquisition entry) is untouched by disposal, splitting or unwinding, so the
          -- tie still holds; only the status vocabulary widened.
          or (je.status='approved'
            and fa.status in ('disposed','superseded','unwound'))))
        or (oi.state='superseded' and je.status='approved'
          and fa.status='superseded'))$t$);

  -- (b) THE K6 SAME-ITEM REFUSAL, appended after the tie assertion.
  v_frm := $f$    raise exception 'fixed-asset opening baseline does not tie'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.6 prestate (b): the tie refusal block appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$    raise exception 'fixed-asset opening baseline does not tie'
      using errcode='CLR31',detail='{"reason":"tie_mismatch"}';
  end if;
  -- 0041 (D-a SS5.4): THE K6 SAME-ITEM HAND-OFF, REFUSED BY NAME. K6 switches a superseded
  -- register row to the replacement in ONE statement that demands exactly two transitions;
  -- an asset that has since been disposed, split or unwound is no longer in the state that
  -- statement can move, and the honest answer is to say so and name the remedy rather than
  -- to fail on a row count. Correcting a DIFFERENT item of the same seed stays green.
  if exists(
    select 1 from clara.opening_seed_registry s
    join clara.opening_items oi on oi.seed_id=s.id
      and oi.firm_id=s.firm_id and oi.client_id=s.client_id
    join clara.fixed_assets fa on fa.id=oi.fixed_asset_id
      and fa.firm_id=oi.firm_id and fa.client_id=oi.client_id
    join clara.opening_items repl on repl.seed_id=s.id and repl.supersedes_item_id=oi.id
    where s.id=p_seed and oi.item_kind='fixed_asset' and oi.state='active'
      and fa.status not in ('pending','active')) then
    raise exception 'this opening fixed asset has already moved on in the register (disposed, split or unwound); reverse that act before correcting its opening baseline'
      using errcode='CLR31',detail='{"reason":"fixed_asset_lifecycle_advanced"}';
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('fixed_asset_lifecycle_advanced' in v_def) = 0
     or position($p$fa.status in ('disposed','superseded','unwound')$p$ in v_def) = 0 then
    raise exception '0041 S4.6 postcheck: the D-a lifecycle recut did not land' using errcode = 'CLR10';
  end if;
  -- THE THREE 0017:5677 CORRESPONDENCE BYTE PINS, RE-ASSERTED whitespace-insensitively.
  v_src := regexp_replace(lower(v_def), '\s+', '', 'g');
  if position('je.status=''draft''andfa.status=''pending''' in v_src) = 0
     or position('je.status=''approved''andfa.status=''active''' in v_src) = 0
     or position('oi.state=''superseded''andje.status=''approved''andfa.status=''superseded'''
         in v_src) = 0 then
    raise exception '0041 S4.6 postcheck: a 0017 R3-F4 FA correspondence byte pin was damaged by this recut'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.6 postcheck: _assert_fa_baseline changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.6 OK: the FA baseline correspondence admits the D-a lifecycle and the K6 same-item hand-off refuses by name; all three 0017 correspondence byte pins survived.';
end $s4_6$;

reset role;

-- =====================================================================================
-- S4.7 -- clara.revise_entry: THE SIXTH RECUT (design SS5.5). A proposal-bearing draft is
-- not editable. revise_entry rewrites an entry's LINES wholesale and knows nothing about
-- flags, so a revised depreciation or disposal draft would reach the approve-time hook with
-- legs that no longer match the proposal the hook is about to materialise -- and the hook's
-- freshness check would refuse it confusingly rather than the editor refusing it honestly.
-- Remedy named: withdraw and re-issue.
--
-- ADDITIVE REFUSAL TOKEN (named deviation): fa_proposal_not_revisable -- the pin sheet's list
-- has no token for this recut and the design names none.
-- =====================================================================================
set role clara_fn_owner;

do $s4_7$
declare
  v_sig text := 'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.7 prestate: clara.revise_entry is GONE' using errcode = 'CLR10';
  end if;
  if position('fa_proposal_not_revisable' in v_def) <> 0 then
    raise exception '0041 S4.7 prestate: revise_entry already refuses proposal-bearing entries -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE MARKER CENSUS, RE-DERIVED against the live body (0017 R1-F1 + the 0028 binding
  -- regions + 0037 H.2b + 0038's closing-transfer wrapper), every count MEASURED.
  for r in select * from (values
      ('opening_entry_k_family_only', 1), ('reversal_mirror_not_revisable', 1),
      ('closing_transfer', 7), ('vendor_binding_resolutions', 1),
      ('amount_exception', 2), ('duplicate_override', 8),
      ('journal_entry_revisions', 2), ('_validate_entry_lines', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.7 prestate: revise_entry carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  v_frm := $f$  if e.reversal_of is not null then
    raise exception 'a reversal mirror cannot be revised; withdraw the mirror and re-reverse the original'
      using errcode='CLR10',detail='{"reason":"reversal_mirror_not_revisable"}';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.7 prestate: the reversal-mirror refusal appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$  if e.reversal_of is not null then
    raise exception 'a reversal mirror cannot be revised; withdraw the mirror and re-reverse the original'
      using errcode='CLR10',detail='{"reason":"reversal_mirror_not_revisable"}';
  end if;
  -- 0041 (D-a SS5.5): A PROPOSAL-BEARING DRAFT IS NOT EDITABLE. This function rewrites the
  -- lines wholesale and carries no concept of flags, so an edited depreciation or disposal
  -- draft would reach the approve-time hook with legs that contradict the proposal the hook
  -- is about to materialise. Withdraw and re-issue through the verb that owns the arithmetic.
  if (coalesce(e.flags,'{}'::jsonb) ? 'depreciation_charges')
     or (coalesce(e.flags,'{}'::jsonb) ? 'fa_disposal') then
    raise exception 'this draft carries a fixed-asset proposal and cannot be revised; withdraw it and re-issue the run or the disposal'
      using errcode='CLR10',detail='{"reason":"fa_proposal_not_revisable"}';
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if (length(v_def) - length(replace(v_def, 'fa_proposal_not_revisable', '')))
     / length('fa_proposal_not_revisable') <> 1 then
    raise exception '0041 S4.7 postcheck: the proposal refusal did not land exactly once' using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('opening_entry_k_family_only', 1), ('reversal_mirror_not_revisable', 1),
      ('closing_transfer', 7), ('vendor_binding_resolutions', 1),
      ('amount_exception', 2), ('duplicate_override', 8),
      ('journal_entry_revisions', 2), ('_validate_entry_lines', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.7 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.7 postcheck: revise_entry changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.7 OK: revise_entry refuses proposal-bearing drafts by name; all eight pre-existing markers survived at their measured counts.';
end $s4_7$;

reset role;

-- =====================================================================================
-- S4.8 -- clara.upsert_account: THE ENROLLED-ACCOUNT GUARD (design SS5.6, SS1.2).
--
-- NAMED DEVIATION, recorded: the design says this verb "gains a refusal against DEACTIVATING
-- a COA account backing an active profile". There is NO deactivation door on coa_accounts
-- anywhere in the chain today -- this verb's ON CONFLICT sets is_active=true unconditionally
-- and no other writer sets it false (measured, not assumed). The guard is therefore written
-- over the RESULTING row: it refuses an upsert that would leave an actively-enrolled account
-- unfit for the role it is enrolled in -- a re-type or re-class (REACHABLE today, e.g. an
-- enrolled cost account with no lines yet being re-typed to expense) or a deactivation (a
-- forward guard that becomes reachable the day a deactivation door is built). Both ride the
-- pinned token fa_enrolled_account_deactivation, with the remedy named: retire the profile
-- with retire_fa_account_profile first.
-- =====================================================================================
set role clara_fn_owner;

do $s4_8$
declare
  v_sig text := 'clara.upsert_account(uuid,text,text,text,text,text,text)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.8 prestate: clara.upsert_account is GONE' using errcode = 'CLR10';
  end if;
  if position('fa_enrolled_account_deactivation' in v_def) <> 0 then
    raise exception '0041 S4.8 prestate: upsert_account already carries the enrolled-account guard -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('cannot change type/class of an account that has lines', 1),
      ('account.upserted', 1),
      ('a rounding account already exists for this client', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.8 prestate: upsert_account carries the marker "%" % time(s), expected %', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  v_frm := $f$  if found and (v_existing.account_type<>p_type
      or v_existing.account_class is distinct from p_account_class)
     and exists(select 1 from clara.journal_lines
                where client_id=p_client and account_code=p_code) then
    raise exception 'cannot change type/class of an account that has lines' using errcode='CLR10';
  end if;$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.8 prestate: the type/class-change refusal appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$  if found and (v_existing.account_type<>p_type
      or v_existing.account_class is distinct from p_account_class)
     and exists(select 1 from clara.journal_lines
                where client_id=p_client and account_code=p_code) then
    raise exception 'cannot change type/class of an account that has lines' using errcode='CLR10';
  end if;
  -- 0041 (D-a SS5.6): AN ENROLLED ACCOUNT KEEPS THE SHAPE ITS ENROLMENT ASSUMES. A profile
  -- validated an account's type and class when it was enrolled; re-typing or re-classing it
  -- underneath would leave the register enrolled on an account the register's own validation
  -- would now reject, and the belt would start refusing movement nobody could explain.
  -- Remedy is named: retire the profile first (retire_fa_account_profile).
  if found and exists(select 1 from clara.fa_account_profiles fp
       where fp.client_id=p_client and fp.active
         and (fp.asset_account_code=p_code or fp.accum_depr_account_code=p_code
              or fp.depr_expense_account_code=p_code))
     and (v_existing.account_type is distinct from p_type
          or v_existing.account_class is distinct from p_account_class
          or p_account_class is not null) then
    raise exception 'account % backs an active fixed-asset enrolment; retire that enrolment before changing or deactivating the account', p_code
      using errcode='CLR37',
        detail=jsonb_build_object('reason','fa_enrolled_account_deactivation',
          'client_id',p_client,'account_code',p_code)::text;
  end if;$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if (length(v_def) - length(replace(v_def, 'fa_enrolled_account_deactivation', '')))
     / length('fa_enrolled_account_deactivation') <> 1 then
    raise exception '0041 S4.8 postcheck: the enrolled-account guard did not land exactly once' using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('cannot change type/class of an account that has lines', 1),
      ('account.upserted', 1),
      ('a rounding account already exists for this client', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.8 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.8 postcheck: upsert_account changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.8 OK: upsert_account refuses to re-shape an account backing an active FA enrolment.';
end $s4_8$;

reset role;

-- =====================================================================================
-- S4.9 -- clara.list_review_queue: THE fixed_asset_incomplete ROW KIND (pin sheet SS6;
-- WD-R1's "the queue chases it until a human completes it"). One row per register row whose
-- particulars are incomplete and whose status is pending or active; disposed, superseded and
-- unwound rows never chase.
--
-- ASSEMBLY ADJUDICATION 6: the six existing CTEs share one column vector, so rather than
-- widen all six (six independent drift surfaces for one field) the new kind carries the asset
-- id in the shared `id` column and the row json projects 'asset_id' from it under a row_kind
-- test. Same wire shape the pin sheet names; one splice instead of seven.
-- =====================================================================================
set role clara_fn_owner;

do $s4_9$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_frm text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.9 prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;
  if position('fixed_asset_incomplete' in v_def) <> 0 then
    raise exception '0041 S4.9 prestate: the queue already projects fixed_asset_incomplete -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.9 prestate: list_review_queue carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) THE NEW CTE + the union.
  v_frm := $f$  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
  ), keyed as ($f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.9 prestate (a): the all_rows union appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$  ), fa_rows as (
    -- 0041 (Wave D-a, WD-R1): INCOMPLETE REGISTER ROWS CHASE. Acquisition never blocks on
    -- particulars nobody has yet; the register row is born honestly incomplete and the queue
    -- carries it until a human completes it. The lint_rows shape is copied exactly (lane
    -- NULL, so the ready/needs_review/needs_you counters are untouched).
    select 2 section_rank,'fixed_asset_incomplete'::text row_kind,'needs_review'::text section,
      fa.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,fa.created_at aged_since,
      fa.cost_cents amount_cents,null::text period,fa.description question_text,
      fa.created_at,fa.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id
    from clara.fixed_assets fa
    join clara.clients active_fa_client on active_fa_client.id=fa.client_id
      and active_fa_client.status='active'
    where fa.firm_id=c.firm and fa.status in ('pending','active')
      and not clara._fa_particulars_complete(fa)
      and (v_client is null or fa.client_id=v_client)
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows
  ), keyed as ($t$);

  -- (b) THE ROW JSON gains asset_id.
  v_frm := $f$'coding_kind',p.coding_kind,'watch_id',p.watch_id,'tier',p.tier,'finding_id',p.finding_id,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.9 prestate (b): the row-json tail appears % time(s) (expected 1)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm,
    $t$'coding_kind',p.coding_kind,'watch_id',p.watch_id,'tier',p.tier,'finding_id',p.finding_id,'asset_id',case when p.row_kind='fixed_asset_incomplete' then p.id end,$t$);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if (length(v_def) - length(replace(v_def, 'fixed_asset_incomplete', '')))
     / length('fixed_asset_incomplete') <> 2 then
    raise exception '0041 S4.9 postcheck: fixed_asset_incomplete did not land exactly twice (the CTE row_kind literal and the row-json projection test)'
      using errcode = 'CLR10';
  end if;
  if position('union all select * from fa_rows' in v_def) = 0
     or position($p$'asset_id',case when p.row_kind='fixed_asset_incomplete'$p$ in v_def) = 0 then
    raise exception '0041 S4.9 postcheck: the queue recut did not land' using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ($$'uncoded_filing'::text row_kind$$, 1), ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1), ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1), ('_autodraft_attempt_budget', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.9 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.9 postcheck: list_review_queue changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.9 OK: the review queue projects fixed_asset_incomplete rows carrying asset_id; all six pre-existing row kinds survived.';
end $s4_9$;

reset role;

-- =====================================================================================
-- S4.10 -- clara.reverse_entry: THE VERB-SIDE FA GUARD [round-3 fold F6]. The SIXTH patch on
-- this body, and the SECOND from this migration (it must run AFTER S4.4, which is why it sits
-- at the end of the register rather than beside it).
--
-- WHY THE HOOK ALONE WAS NOT ENOUGH. The contract (SS4) asks for the FA reversal refusals in
-- "verb AND hook twin"; only the hook half shipped. reverse_entry mints the mirror and, when
-- the mirror is HIGH-STAKES, leaves it a DRAFT without ever calling _subledger_on_approve --
-- so a professional reversing a high-stakes FA acquisition that carries live charges got
-- {status:'draft'} and a success receipt for an act that can never complete: the checker's
-- approval raises fa_reverse_while_depreciated, the original stays un-reversed, and the poison
-- draft sits in the queue forever. The guard is the SAME body the hook calls (S2.4b), so the
-- two sites cannot name different tokens.
--
-- ANCHOR: immediately after the 0038-E7 bank-match wall and before the mirror INSERT -- the
-- last refusal position in the body, so it fires after every cheaper wall and before anything
-- is written.
-- =====================================================================================
set role clara_fn_owner;

do $s4_10$
declare
  v_sig text := 'clara.reverse_entry(uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.10 prestate: clara.reverse_entry is GONE' using errcode = 'CLR10';
  end if;
  if position('_fa_reversal_blocked' in v_def) <> 0 then
    raise exception '0041 S4.10 prestate: reverse_entry already carries the FA guard -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE FIVE PRIOR SPLICE MARKERS, POSITIVELY PROBED, INCLUDING S4.4's OWN (this migration
  -- must not be able to land S4.10 on a body that lost the MYT date).
  for r in select * from (values
      ('opening_entry_k_family_only', 1),
      ('allocated_items_present', 2),
      ('live_bank_match_present', 1),
      ('pg_advisory_xact_lock(203005004', 1),
      ('Asia/Kuala_Lumpur', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.10 prestate: reverse_entry carries the marker "%" % time(s), expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  v_frm := $f$detail='{"reason":"live_bank_match_present"}';
  end if;
  insert into clara.journal_entries(client_id,status,posting_date,memo,origin,resolution_id,$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.10 prestate: the bank-wall/mirror-INSERT seam appears % time(s) (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$detail='{"reason":"live_bank_match_present"}';
  end if;
  -- 0041 (D-a SS2.4 / SS4): THE FIXED-ASSET REVERSAL WALL, VERB SIDE. The approve-time hook
  -- carries the identical probes (clara._fa_on_approve arm 3), but a HIGH-STAKES mirror is
  -- left a DRAFT here and never reaches that hook -- so without this the maker would receive a
  -- success receipt for a reversal whose mirror can never be approved. Same body, same tokens.
  perform clara._fa_reversal_blocked(p_entry);
  insert into clara.journal_entries(client_id,status,posting_date,memo,origin,resolution_id,$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if (length(v_def) - length(replace(v_def, 'clara._fa_reversal_blocked(p_entry)', '')))
     / length('clara._fa_reversal_blocked(p_entry)') <> 1 then
    raise exception '0041 S4.10 postcheck: the FA reversal wall did not land exactly once'
      using errcode = 'CLR10';
  end if;
  -- ORDERED, BOTH-PRESENT: the wall must sit AFTER the bank wall and BEFORE the mirror INSERT.
  -- A bare position(a) < position(b) reads a MISSING marker (position 0) as ordered.
  if not (position('live_bank_match_present' in v_def) > 0
          and position('clara._fa_reversal_blocked(p_entry)' in v_def) > 0
          and position('insert into clara.journal_entries(client_id,status,posting_date' in v_def) > 0
          and position('live_bank_match_present' in v_def)
              < position('clara._fa_reversal_blocked(p_entry)' in v_def)
          and position('clara._fa_reversal_blocked(p_entry)' in v_def)
              < position('insert into clara.journal_entries(client_id,status,posting_date' in v_def)) then
    raise exception '0041 S4.10 postcheck: the FA reversal wall is not between the bank wall and the mirror INSERT'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('opening_entry_k_family_only', 1), ('allocated_items_present', 2),
      ('live_bank_match_present', 1), ('pg_advisory_xact_lock(203005004', 1),
      ('Asia/Kuala_Lumpur', 1)) as t(marker, want) loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '0041 S4.10 postcheck: marker "%" is now % (expected %)', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if position('current_date' in v_def) <> 0 then
    raise exception '0041 S4.10 postcheck: current_date reappeared in reverse_entry -- S4.4 was undone'
      using errcode = 'CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.10 postcheck: reverse_entry changed owner' using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.10 OK: reverse_entry refuses an FA-blocked reversal at the VERB, after the bank wall and before the mirror INSERT; all five prior splice markers survived.';
end $s4_10$;

reset role;

-- =====================================================================================
-- S4.11 -- clara.approve_opening_correction: THE K6 SUPERSEDE DATE [round-3.5 fold G3].
--
-- WHAT IT CLOSES. The K6 hand-off has always written status='superseded' and
-- superseded_by_asset_id and never a supersede DATE -- there was no such column before this
-- migration. Every D-a as-of read (clara._fa_included_at) treats `superseded_at is null` as
-- "this row was in the register at every date", so the corrected carry-down row and its
-- replacement are BOTH included, forever. Measured on assembly client 92ebe012: register cost
-- 1,000,000 / accumulated 200,000 against a GL that only ever carried 500,000 / 100,000, with
-- every explained column of fa_register_tie at zero -- i.e. the acceptance instrument reading
-- exactly 2x on exactly the WD-R14 shape (a real carried register, corrected once).
--
-- THE DATE IS THE CORRECTION ENTRY'S POSTING DATE, joined from the replacement item's own
-- entry. Same statement, same two-row transition count, same abort-on-partial law -- the join
-- is inner, so a replacement item with no entry row would drop the count to zero and raise the
-- existing tie_mismatch rather than silently half-writing. S1.8 backfilled the rows this door
-- created BEFORE today; this is the same fact stamped at the source from now on.
-- =====================================================================================
set role clara_fn_owner;

do $s4_11$
declare
  v_sig text := 'clara.approve_opening_correction(uuid,jsonb,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0041 S4.11 prestate: clara.approve_opening_correction is GONE'
      using errcode = 'CLR10';
  end if;
  if position('superseded_at=case when fa.id=oi.fixed_asset_id' in v_def) <> 0 then
    raise exception '0041 S4.11 prestate: the K6 writer already stamps superseded_at -- this splice has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  -- PRE-EXISTING MARKER CENSUS at their MEASURED counts, including BOTH 0018 splices
  -- (non_correction_draft_present, entry_count): a body rebuilt from 0017 file text upstream
  -- would have silently lost the Gate-K guard, and this splice must not be the thing that
  -- hides it.
  for r in select * from (values
      ('not_serializable', 1), ('revision_mismatch', 2), ('distinct_checker', 1),
      ('self_attestation', 1), ('clara._assert_fa_baseline', 2), ('tie_mismatch', 1),
      ('registry_not_open', 1), ('opening_item.superseded', 1),
      ('clara._record_onboarding_contributor', 1),
      ('get diagnostics v_asset_transition_count=row_count;', 1),
      ('non_correction_draft_present', 1), ('entry_count', 1),
      ('superseded_by_asset_id', 1)) as t(marker, want) loop
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '0041 S4.11 prestate: approve_opening_correction marker "%" is % (expected %) -- the body drifted; re-derive this splice against the live catalog', r.marker, v_cnt, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  v_frm := $f$        superseded_by_asset_id=case when fa.id=oi.fixed_asset_id
          then repl.fixed_asset_id else null end,
        updated_at=now()
      from clara.opening_items repl
      where repl.id=v_replacement and repl.fixed_asset_id is not null$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0041 S4.11 prestate: the K6 hand-off UPDATE appears % time(s) (expected exactly once)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := $t$        superseded_by_asset_id=case when fa.id=oi.fixed_asset_id
          then repl.fixed_asset_id else null end,
        -- 0041 [round-3.5 fold G3] THE SUPERSEDE DATE. Without it clara._fa_included_at holds
        -- BOTH the corrected row and its replacement in the register at every as-of, and the
        -- D-a tie reads double on a corrected carry-down. The date is the correction entry's
        -- own posting date -- an accounting date, like every other boundary the as-of rule
        -- reads.
        superseded_at=case when fa.id=oi.fixed_asset_id
          then rje.posting_date else null end,
        updated_at=now()
      from clara.opening_items repl
        join clara.journal_entries rje on rje.id=repl.entry_id
      where repl.id=v_replacement and repl.fixed_asset_id is not null$t$;
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  -- POSTCHECK from the CATALOG.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('superseded_at=case when fa.id=oi.fixed_asset_id' in v_def) = 0
     or position('join clara.journal_entries rje on rje.id=repl.entry_id' in v_def) = 0 then
    raise exception '0041 S4.11 postcheck: the K6 supersede-date stamp did not land'
      using errcode = 'CLR10';
  end if;
  if position($p$        updated_at=now()
      from clara.opening_items repl
      where repl.id=v_replacement$p$ in v_def) <> 0 then
    raise exception '0041 S4.11 postcheck: the undated K6 hand-off UPDATE is still present -- replace() passed vacuously'
      using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('not_serializable', 1), ('revision_mismatch', 2), ('distinct_checker', 1),
      ('self_attestation', 1), ('clara._assert_fa_baseline', 2), ('tie_mismatch', 1),
      ('registry_not_open', 1), ('opening_item.superseded', 1),
      ('clara._record_onboarding_contributor', 1),
      ('get diagnostics v_asset_transition_count=row_count;', 1),
      ('non_correction_draft_present', 1), ('entry_count', 1)) as t(marker, want) loop
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '0041 S4.11 postcheck: approve_opening_correction lost marker "%" (now %, expected %)', r.marker, v_cnt, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0041 S4.11 postcheck: approve_opening_correction changed owner'
      using errcode = 'CLR10';
  end if;
  raise notice '0041 S4.11 OK: the K6 hand-off stamps superseded_at from the correction entry''s posting date; all twelve pre-existing markers (0017 + both 0018 splices) survived at their measured counts.';
end $s4_11$;

reset role;

-- #####################################################################################
-- ################################ THE UNIFIED TAIL ###################################
-- #####################################################################################
-- Thirteen independent census blocks, each proving ONE class of property against the world this
-- migration actually leaves behind. Exact-at-tail, never widened to >=: an exact count is what
-- catches a silently-dropped belt.

-- =====================================================================================
-- TAIL 1 -- THE OBJECT CENSUS.
-- =====================================================================================
do $tail1$
declare v_n int; v_forced int;
begin
  select count(*)::int into v_n from pg_class t join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname in ('fa_account_profiles', 'fa_depreciation',
      'fa_depreciation_authorities', 'fa_depreciation_runs');
  if v_n <> 4 then
    raise exception '0041 tail 1: expected 4 new relations, found %', v_n;
  end if;
  select count(*)::int into v_forced from pg_class t join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'clara' and t.relname in ('fa_account_profiles', 'fa_depreciation',
      'fa_depreciation_authorities', 'fa_depreciation_runs')
      and t.relrowsecurity and t.relforcerowsecurity;
  if v_forced <> 4 then
    raise exception '0041 tail 1: not all 4 new tables carry FORCE ROW LEVEL SECURITY (found %)', v_forced;
  end if;
  -- The TEN new columns: fixed_assets x8 (depreciation_rate_bps, acquisition_line_id,
  -- disposal_entry_id, superseded_at, effective_from, ca_class, is_commercial_vehicle, is_new)
  -- + clients x2 (fy_end_month, fy_end_day). [round-3 small: the comment said nine.]
  select count(*)::int into v_n from information_schema.columns
    where table_schema = 'clara'
      and ((table_name = 'fixed_assets' and column_name in ('depreciation_rate_bps',
             'acquisition_line_id', 'disposal_entry_id', 'superseded_at', 'effective_from',
             'ca_class', 'is_commercial_vehicle', 'is_new'))
        or (table_name = 'clients' and column_name in ('fy_end_month', 'fy_end_day')));
  if v_n <> 10 then
    raise exception '0041 tail 1: expected 10 new columns (8 on fixed_assets, 2 on clients), found %', v_n;
  end if;
  -- THE WATERMARK COLUMN (design SS2.4) exists and is NOT NULL -- a nullable watermark would
  -- silently exempt every entry from the belt.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'clara' and table_name = 'fa_account_profiles'
                   and column_name = 'enrolled_at' and is_nullable = 'NO') then
    raise exception '0041 tail 1: fa_account_profiles.enrolled_at is missing or nullable -- the SS2.4 belt watermark';
  end if;
  -- THE METHOD COLUMN: NULLABLE and WITHOUT A DEFAULT (design SS1.1's own postverify).
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'clara.fixed_assets'::regclass
               and a.attname = 'depreciation_method' and (a.atthasdef or a.attnotnull)) then
    raise exception '0041 tail 1: fixed_assets.depreciation_method still carries a default or NOT NULL -- a default would make every soft-born row claim a method nobody chose';
  end if;
  -- The unique birth identity + the two partial ledger indexes.
  if not exists (select 1 from pg_indexes where schemaname = 'clara'
                 and indexname = 'uq_fixed_assets_acquisition_line') then
    raise exception '0041 tail 1: uq_fixed_assets_acquisition_line is missing -- the birth identity';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'clara'
                 and indexname = 'uq_fa_depreciation_live_range')
     or not exists (select 1 from pg_indexes where schemaname = 'clara'
                    and indexname = 'uq_fa_depreciation_unwind_of')
     or not exists (select 1 from pg_indexes where schemaname = 'clara'
                    and indexname = 'uq_fa_authorities_live')
     or not exists (select 1 from pg_indexes where schemaname = 'clara'
                    and indexname = 'uq_fa_runs_entry')
     -- [round-3.5 fold G4] the accumulated role is unique per client DECLARATIVELY, beside the
     -- cost unique it has always had; the expense role deliberately has no such index.
     or not exists (select 1 from pg_indexes where schemaname = 'clara'
                    and indexname = 'uq_fa_account_profiles_accum_active') then
    raise exception '0041 tail 1: one of the five load-bearing partial/unique indexes is missing';
  end if;
  raise notice '0041 tail 1 OK: 4 tables (FORCE RLS), 10 columns, the NOT NULL watermark, a method column with no default and no NOT NULL, and all five load-bearing unique indexes.';
end $tail1$;

-- =====================================================================================
-- TAIL 2 -- THE IMMUTABILITY TRANSITION TABLE (design SS1.1). The exact set, asserted as
-- text on the live body, because this is the constraint whose ABSENCE the round-2 ladder
-- found would have raised CLR13 on the first disposal.
-- =====================================================================================
do $tail2$
declare v_def text; k text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid = 'clara._tf_fixed_assets_immutable_0017()'::regprocedure;
  foreach k in array array['status', 'disposed_at', 'disposal_entry_id',
      'superseded_by_asset_id', 'superseded_at', 'updated_at'] loop
    if position('''' || k || '''' in v_def) = 0 then
      raise exception '0041 tail 2: the immutability transition table is missing the unconditional lifecycle column %', k;
    end if;
  end loop;
  foreach k in array array['depreciation_method', 'useful_life_months', 'depreciation_rate_bps',
      'residual_cents', 'depreciation_start_date', 'description', 'ca_class',
      'is_commercial_vehicle', 'is_new'] loop
    if position('''' || k || '''' in v_def) = 0 then
      raise exception '0041 tail 2: the immutability transition table is missing the particulars column %', k;
    end if;
  end loop;
  if position('clara._fa_particulars_complete(old)' in v_def) = 0 then
    raise exception '0041 tail 2: the particulars half of the transition table is not gated on OLD completeness -- the completing UPDATE would refuse itself';
  end if;
  if position('old.acquisition_entry_id is null and old.supersedes_asset_id is not null' in v_def) = 0 then
    raise exception '0041 tail 2: the successor-is-approved-by-construction clause is missing -- a split successor would be freely mutable';
  end if;
  raise notice '0041 tail 2 OK: the immutability transition table carries 6 unconditional lifecycle columns + 9 OLD-gated particulars columns, and treats a split successor as approved.';
end $tail2$;

-- =====================================================================================
-- TAIL 3 -- THE FOUR-CALLER RE-PIN + THE MARKER CENSUS ON _subledger_on_approve.
-- The four approve paths are what make FA materialisation intrinsic; this re-pins the census
-- AFTER the splice, and adds the sixth (FA) marker.
-- =====================================================================================
do $tail3$
declare v_n int; v_def text; r record; v_cnt int;
begin
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%clara._subledger_on_approve(%';
  if v_n <> 4 then
    raise exception '0041 tail 3: expected exactly 4 callers of clara._subledger_on_approve after the splice, found % -- the 0037:3779-3846 census moved', v_n;
  end if;
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid = 'clara._subledger_on_approve(uuid)'::regprocedure;
  for r in select * from (values
      ('payment_terms_days', 1), ('effective_date', 3),
      ($$item_kind in ('invoice','bill')$$, 1),
      ('cross_domain_control_entry', 1), ('allocation_stale', 6),
      ('clara._fa_on_approve(p_entry)', 1)) as t(marker, want) loop
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '0041 tail 3: _subledger_on_approve marker "%" is % (expected %)', r.marker, v_cnt, r.want;
    end if;
  end loop;
  -- THE HOOK IS BEFORE THE SETTLEMENT EARLY RETURN. Asserted BOTH-PRESENT-AND-ORDERED: a bare
  -- position(a) < position(b) reads a MISSING marker (position 0) as correctly ordered and
  -- passes vacuously -- the absence-from-the-wrong-instrument mistake this repo has paid for.
  if not (position('clara._fa_on_approve(p_entry)' in v_def) > 0
          and position($$v_prop := e.flags -> 'settlement_allocation'$$ in v_def) > 0
          and position('clara._fa_on_approve(p_entry)' in v_def)
              < position($$v_prop := e.flags -> 'settlement_allocation'$$ in v_def)) then
    raise exception '0041 tail 3: the FA hook must be called BEFORE the settlement early-return, or it is dead code for every non-settlement entry';
  end if;
  raise notice '0041 tail 3 OK: four callers re-pinned, five original markers intact, the FA hook present exactly once and ordered before the settlement early-return.';
end $tail3$;

-- =====================================================================================
-- TAIL 4 -- EVERY RECUT LINEAGE, RE-ASSERTED ON THE LIVE CATALOG (design part-2 "standing
-- observations"). One row per spliced body; the marker is what THIS migration added.
-- =====================================================================================
do $tail4$
declare r record; v_def text; v_cnt int;
begin
  for r in select * from (values
      ('clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'allocation_to_unborn_item', 1),
      ('clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
        'allocation_to_unborn_item', 1),
      ('clara.reverse_entry(uuid,text,text)', 'Asia/Kuala_Lumpur', 1),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'v_rate int;', 1),
      ('clara._assert_fa_baseline(uuid)', 'fixed_asset_lifecycle_advanced', 1),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
        'fa_proposal_not_revisable', 1),
      ('clara.upsert_account(uuid,text,text,text,text,text,text)',
        'fa_enrolled_account_deactivation', 1),
      ('clara.list_review_queue(jsonb,jsonb,integer)', 'union all select * from fa_rows', 1),
      ('clara._subledger_on_approve(uuid)', 'clara._fa_on_approve(p_entry)', 1),
      ('clara._tf_fixed_assets_immutable_0017()', 'fa_baseline_immutable', 1),
      -- [round-3.5 fold G3] the ELEVENTH splice: the K6 writer stamps the supersede date.
      ('clara.approve_opening_correction(uuid,jsonb,text,text)',
        'superseded_at=case when fa.id=oi.fixed_asset_id', 1)
    ) as t(sig, marker, want) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = r.sig::regprocedure;
    if v_def is null then
      raise exception '0041 tail 4: % is GONE after this migration', r.sig;
    end if;
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '0041 tail 4: % carries the 0041 marker "%" % time(s), expected %', r.sig, r.marker, v_cnt, r.want;
    end if;
    if (select p.proowner::regrole::text from pg_proc p where p.oid = r.sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0041 tail 4: % is no longer owned by clara_fn_owner', r.sig;
    end if;
  end loop;
  -- reverse_entry's SIX-splice lineage, restated: 0017's K boundary, 0037-H.2's rung and
  -- allocation wall, 0038-E7's bank wall, 0041's MYT date (S4.4) and 0041's verb-side FA wall
  -- (S4.10). current_date is GONE.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid = 'clara.reverse_entry(uuid,text,text)'::regprocedure;
  if position('opening_entry_k_family_only' in v_def) = 0
     or position('allocated_items_present' in v_def) = 0
     or position('live_bank_match_present' in v_def) = 0
     or position('pg_advisory_xact_lock(203005004' in v_def) = 0
     or position('Asia/Kuala_Lumpur' in v_def) = 0
     or position('clara._fa_reversal_blocked(p_entry)' in v_def) = 0
     or position('current_date' in v_def) <> 0 then
    raise exception '0041 tail 4: reverse_entry lost one of its six splice markers, or still dates its mirror on current_date';
  end if;
  -- THE TWO WIDE CENSUSES, RE-PINNED IN THE TAIL (design part-2 "standing observations").
  -- They exist inside S4.5 / S4.7's own prestate+postcheck, but the TAIL is what a future
  -- reader greps -- and a tail that re-pins ONE marker per body under-states the lineage it
  -- claims to protect [round-3 small / STR minor 2].
  for r in select * from (values
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
        'opening_entry_k_family_only', 1),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
        'reversal_mirror_not_revisable', 1),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)', 'closing_transfer', 7),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
        'vendor_binding_resolutions', 1),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)', 'amount_exception', 2),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)', 'duplicate_override', 8),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
        'journal_entry_revisions', 2),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
        '_validate_entry_lines', 1),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'depreciation_method_unsupported', 2),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'fixed asset books-grade baseline is incomplete', 2),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'carried accumulated depreciation', 1),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'registry_not_open', 1),
      ('clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)',
        'duplicate_seed', 1),
      -- The K6 writer's OWN prior lineage, re-pinned here as well as inside S4.11: 0017's
      -- transition count and BOTH 0018 splices must survive this migration.
      ('clara.approve_opening_correction(uuid,jsonb,text,text)',
        'non_correction_draft_present', 1),
      ('clara.approve_opening_correction(uuid,jsonb,text,text)', 'entry_count', 1),
      ('clara.approve_opening_correction(uuid,jsonb,text,text)',
        'get diagnostics v_asset_transition_count=row_count;', 1)
    ) as t(sig, marker, want) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = r.sig::regprocedure;
    v_cnt := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_cnt <> r.want then
      raise exception '0041 tail 4: % carries the pre-existing marker "%" % time(s), expected % -- a prior splice was lost', r.sig, r.marker, v_cnt, r.want;
    end if;
  end loop;
  raise notice '0041 tail 4 OK: all eleven recut bodies carry their 0041 marker exactly once and remain owned by clara_fn_owner; reverse_entry holds all six splices; revise_entry (8 markers), _draft_opening_item_core (5 markers) and approve_opening_correction (3 markers, incl. both 0018 splices) are re-pinned here, not only inside their own splice blocks.';
end $tail4$;

-- =====================================================================================
-- TAIL 5 -- THE SINGLE-WRITER CENSUSES (design SS9.5). Proposal authenticity in this product
-- is STRUCTURAL, and these three counts are what keep it that way when a later migration
-- reaches for a shortcut.
-- =====================================================================================
do $tail5$
declare v_n int; v_names text; v_def text;
begin
  -- (a) origin='scheduled_run' -- exactly ONE function body inserts it.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%''scheduled_run'', v_actor%';
  if v_n <> 1 then
    raise exception '0041 tail 5(a): % function(s) insert origin=scheduled_run (expected exactly 1 -- clara._fa_run_period_core)', v_n;
  end if;
  -- ... and the complete set of bodies that so much as MENTION the literal is the four this
  -- migration wrote (one writer, two readers, one surface), so a new mention is visible.
  select count(*)::int, string_agg(p.proname, ', ' order by p.proname) into v_n, v_names
    from pg_proc p where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%scheduled_run%';
  if v_n <> 4 then
    raise exception '0041 tail 5(a): % function(s) mention scheduled_run (expected exactly 4: _fa_on_approve, _fa_run_period_core, _tf_fa_movement_belt, get_depreciation_authority) -- found %', v_n, v_names;
  end if;
  -- (b) the two PROPOSAL KEYS -- exactly one audited verb writes each.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%jsonb_build_object(''depreciation_charges'', jsonb_build_object(%';
  if v_n <> 1 then
    raise exception '0041 tail 5(b): % function(s) write the depreciation_charges proposal (expected exactly 1)', v_n;
  end if;
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc like '%jsonb_build_object(''fa_disposal'', jsonb_build_object(%';
  if v_n <> 1 then
    raise exception '0041 tail 5(b): % function(s) write the fa_disposal proposal (expected exactly 1)', v_n;
  end if;
  -- (c) _draft_entry_core IS NOT WIDENED. The generic drafting core carries no flags column
  -- and must never learn either proposal key; that is what makes forgery structural rather
  -- than conventional [L2/round-2 clean surfaces].
  select p.prosrc into v_def from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_draft_entry_core' limit 1;
  if v_def is null then
    raise exception '0041 tail 5(c): clara._draft_entry_core is GONE';
  end if;
  if position('depreciation_charges' in v_def) <> 0 or position('fa_disposal' in v_def) <> 0 then
    raise exception '0041 tail 5(c): _draft_entry_core now mentions a fixed-asset proposal key -- the generic drafting core must never be able to persist one';
  end if;
  -- (d) NO TABLE GRANTS on clara.journal_entries for any human or machine role: a proposal
  -- can only be born inside an audited SECURITY DEFINER verb.
  select count(*)::int into v_n from information_schema.role_table_grants
    where table_schema = 'clara' and table_name = 'journal_entries'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and grantee in ('clara_authenticated', 'clara_agent_ro', 'clara_runtime',
                      'clara_wake_interactive', 'clara_wake_proactive');
  if v_n <> 0 then
    raise exception '0041 tail 5(d): % write grant(s) exist on clara.journal_entries for a human or machine role -- proposal authenticity is no longer structural', v_n;
  end if;
  raise notice '0041 tail 5 OK: one scheduled_run writer (four mentions total), one writer per proposal key, _draft_entry_core still innocent of both, zero write grants on journal_entries.';
end $tail5$;

-- =====================================================================================
-- TAIL 6 -- THE BELT IS LIVE, DEFERRED, AND GATED. A belt that fires at the wrong moment is
-- worse than none: v1's fired at draft-commit or never.
-- =====================================================================================
do $tail6$
declare t record;
begin
  select tgname, tgconstraint, tgdeferrable, tginitdeferred, tgtype,
         pg_get_triggerdef(oid) as def into t
    from pg_trigger where tgrelid = 'clara.journal_entries'::regclass
      and tgname = 't_je_fa_movement_belt';
  if not found then
    raise exception '0041 tail 6: the SS2.4 belt trigger t_je_fa_movement_belt is not installed on clara.journal_entries';
  end if;
  if not t.tgdeferrable or not t.tginitdeferred then
    raise exception '0041 tail 6: the FA movement belt must be DEFERRABLE INITIALLY DEFERRED (it re-derives legs that the same transaction is still writing)';
  end if;
  if position($$WHEN ((new.status = 'approved'::text))$$ in t.def) = 0 then
    raise exception '0041 tail 6: the FA movement belt is not gated WHEN (new.status = approved) -- def is %', t.def;
  end if;
  -- The five doors and the watermark, asserted on the body.
  if position('enrolled_at' in (select p.prosrc from pg_proc p
        where p.oid = 'clara._tf_fa_movement_belt()'::regprocedure)) = 0 then
    raise exception '0041 tail 6: the belt does not consult the enrolment watermark -- pre-enrolment history would become un-reversible';
  end if;
  if position('fa_belt_unregistered_movement' in (select p.prosrc from pg_proc p
        where p.oid = 'clara._tf_fa_movement_belt()'::regprocedure)) = 0
     or position('fa_k_gl_balance_on_enrolled' in (select p.prosrc from pg_proc p
        where p.oid = 'clara._tf_fa_movement_belt()'::regprocedure)) = 0
     or position('fa_cost_adjustment_deferred' in (select p.prosrc from pg_proc p
        where p.oid = 'clara._tf_fa_movement_belt()'::regprocedure)) = 0 then
    raise exception '0041 tail 6: the belt is missing one of its three named refusals';
  end if;
  raise notice '0041 tail 6 OK: the FA movement belt is live on journal_entries, DEFERRABLE INITIALLY DEFERRED, gated on approved, watermark-scoped, with all three named refusals.';
end $tail6$;

-- =====================================================================================
-- TAIL 7 -- LOCK-ORDER PINS (the 0040 TAIL 2 idiom). Every claim is asserted
-- BOTH-PRESENT-AND-ORDERED.
-- =====================================================================================
do $tail7$
declare v_src text;
begin
  -- THE RUN VERB: op receipt -> derived approve sub-key -> 203005004 -> the first FA read.
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure;
  if not (position('clara._reserve_op(p_firm, p_verb' in v_src) > 0
          and position('pg_advisory_xact_lock(203005004' in v_src) > 0
          and position('clara._reserve_op(p_firm, p_verb' in v_src)
              < position('pg_advisory_xact_lock(203005004' in v_src)) then
    raise exception '0041 tail 7: the run core must reserve its op key BEFORE taking the client rung';
  end if;
  if not (position('p_op_key || '':approve''' in v_src) > 0
          and position('pg_advisory_xact_lock(203005004' in v_src) > 0
          and position('p_op_key || '':approve''' in v_src)
              < position('pg_advisory_xact_lock(203005004' in v_src)) then
    raise exception '0041 tail 7: the run core must pre-reserve its derived approve sub-key BEFORE the client rung (the 0037 allocate_receipt deadlock lesson)';
  end if;
  if not (position('pg_advisory_xact_lock(203005004' in v_src) > 0
          and position('clara.fa_depreciation_authorities' in v_src) > 0
          and position('pg_advisory_xact_lock(203005004' in v_src)
              < position('clara.fa_depreciation_authorities' in v_src)) then
    raise exception '0041 tail 7: the run core must take the 203005004 client rung BEFORE any FA read (design SS3.2)';
  end if;
  -- THE DISPOSAL VERB: the same order, so run-vs-dispose serialization is real, not luck.
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)'::regprocedure;
  if not (position('clara._reserve_op(c.firm, ''dispose_fixed_asset''' in v_src) > 0
          and position('pg_advisory_xact_lock(203005004' in v_src) > 0
          and position('clara._reserve_op(c.firm, ''dispose_fixed_asset''' in v_src)
              < position('pg_advisory_xact_lock(203005004' in v_src)) then
    raise exception '0041 tail 7: dispose_fixed_asset must reserve its op key BEFORE taking the client rung';
  end if;
  if not (position('pg_advisory_xact_lock(203005004' in v_src) > 0
          and position('from clara.fixed_assets where id = p_asset' in v_src) > 0
          and position('pg_advisory_xact_lock(203005004' in v_src)
              < position('from clara.fixed_assets where id = p_asset' in v_src)) then
    raise exception '0041 tail 7: dispose_fixed_asset must take the 203005004 client rung BEFORE any FA read (design SS4.1)';
  end if;
  raise notice '0041 tail 7 OK: both money-moving FA verbs reserve their op keys and their derived sub-keys before the 203005004 client rung, and read no register row before holding it.';
end $tail7$;

-- =====================================================================================
-- TAIL 8 -- THE EVENT REGISTRATION CENSUS (design SS1.6). Three types, three taxonomy rows
-- at the ACTIVE version, all client-scoped, all decision 'ignore' -- and exactly five
-- emitters inside the hook (acquired x1, depreciated x2, disposed x2).
-- =====================================================================================
do $tail8$
declare v_n int; v_src text; v_ver int;
begin
  select count(*)::int into v_n from clara.event_types
    where name in ('asset.acquired', 'asset.depreciated', 'asset.disposed') and client_scoped;
  if v_n <> 3 then
    raise exception '0041 tail 8: expected 3 client-scoped asset.* event types, found %', v_n;
  end if;
  select version into v_ver from clara.taxonomy_active;
  select count(*)::int into v_n from clara.trigger_taxonomy
    where version = v_ver and event_type in ('asset.acquired', 'asset.depreciated', 'asset.disposed')
      and decision = 'ignore';
  if v_n <> 3 then
    raise exception '0041 tail 8: expected 3 trigger_taxonomy rows at the ACTIVE version (%) with decision ignore, found %', v_ver, v_n;
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._fa_on_approve(uuid)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'clara._append_event(', '')))
         / length('clara._append_event(');
  if v_n <> 5 then
    raise exception '0041 tail 8: clara._fa_on_approve emits % events (expected exactly 5: acquired x1, depreciated x2, disposed x2)', v_n;
  end if;
  -- PAYLOADS CARRY IDENTIFIERS AND AMOUNTS ONLY: no account code, no description, no memo
  -- ever reaches the stream from this hook.
  if position($$'account_code',$$ in v_src) <> 0 or position($$'description',$$ in v_src) <> 0
     or position($$'memo',$$ in v_src) <> 0 then
    raise exception '0041 tail 8: an asset.* event payload names an account code, a description or a memo -- payloads carry identifiers and amounts only';
  end if;
  raise notice '0041 tail 8 OK: three asset.* event types + three taxonomy rows at the active version (decision ignore); five emitters in the hook; payloads carry identifiers and amounts only.';
end $tail8$;

-- =====================================================================================
-- TAIL 9 -- THE GRANT MATRIX + ACL LEAK SCAN (the 0040 TAIL 7 pattern). Per new table:
-- clara_authenticated SELECT-only, ZERO grants for every machine role. Per human verb:
-- EXECUTE to clara_authenticated, not to public, not to a machine role. Per internal helper:
-- EXECUTE to nobody. And the machine lane holds exactly what the design granted it.
-- =====================================================================================
do $tail9$
declare v_n int; v_names text; f text; v_acl aclitem[];
        v_acl_row record; v_helpers int := 0;
begin
  select count(*)::int into v_n from information_schema.role_table_grants
    where table_schema = 'clara'
      and table_name in ('fa_account_profiles', 'fa_depreciation',
        'fa_depreciation_authorities', 'fa_depreciation_runs')
      and grantee = 'clara_authenticated' and privilege_type <> 'SELECT';
  if v_n <> 0 then
    raise exception '0041 tail 9: clara_authenticated holds % non-SELECT grant(s) on a new FA table', v_n;
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants
    where table_schema = 'clara'
      and table_name in ('fa_account_profiles', 'fa_depreciation',
        'fa_depreciation_authorities', 'fa_depreciation_runs')
      and grantee in ('clara_agent_ro', 'clara_runtime', 'clara_wake_interactive',
                      'clara_wake_proactive', 'PUBLIC');
  if v_n <> 0 then
    raise exception '0041 tail 9: % machine-role or PUBLIC grant(s) exist on a new FA table -- the agent never reads or writes the register directly', v_n;
  end if;
  -- HUMAN VERBS + READS.
  foreach f in array array[
      'clara.list_fixed_assets(uuid)', 'clara.get_fixed_asset(uuid)',
      'clara.list_depreciation_runs(uuid)', 'clara.get_depreciation_run(uuid)',
      'clara.get_depreciation_authority(uuid)', 'clara.fa_register_tie(uuid,date)',
      'clara.upsert_fa_account_profile(uuid,text,text,text,text)',
      'clara.retire_fa_account_profile(uuid,text,text)',
      'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
      'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
      'clara.set_client_fy_end(uuid,integer,integer,text)',
      'clara.propose_depreciation_authority(uuid,text,text)',
      'clara.sign_depreciation_authority(uuid,uuid,text)',
      'clara.retire_depreciation_authority(uuid,uuid,text,text)',
      'clara.run_depreciation_manual(uuid,date,date,text)',
      'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)'] loop
    if not has_function_privilege('clara_authenticated', f, 'EXECUTE') then
      raise exception '0041 tail 9: clara_authenticated cannot EXECUTE %', f;
    end if;
    if has_function_privilege('public', f, 'EXECUTE') then
      raise exception '0041 tail 9: % is executable by PUBLIC', f;
    end if;
    if has_function_privilege('clara_runtime', f, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', f, 'EXECUTE')
       or has_function_privilege('clara_wake_interactive', f, 'EXECUTE')
       or has_function_privilege('clara_wake_proactive', f, 'EXECUTE') then
      raise exception '0041 tail 9: a machine role can EXECUTE the human verb %', f;
    end if;
  end loop;
  -- THE MACHINE LANE (design SS3.4).
  if not has_function_privilege('clara_runtime',
       'clara.run_depreciation_period(uuid,date,date,text)', 'EXECUTE') then
    raise exception '0041 tail 9: clara_runtime cannot EXECUTE run_depreciation_period -- the sweep would boot dead';
  end if;
  if has_function_privilege('clara_authenticated',
       'clara.run_depreciation_period(uuid,date,date,text)', 'EXECUTE') then
    raise exception '0041 tail 9: the MACHINE run verb is executable by clara_authenticated -- humans run depreciation through run_depreciation_manual, which is _human_ctx-floored';
  end if;
  if not has_function_privilege('clara_runtime', 'clara.depreciation_run_due(uuid)', 'EXECUTE')
     or not has_function_privilege('clara_authenticated', 'clara.depreciation_run_due(uuid)', 'EXECUTE') then
    raise exception '0041 tail 9: depreciation_run_due must be executable by BOTH the runtime and the dashboard';
  end if;
  -- INTERNAL HELPERS: nobody but the owner. EVERY ONE OF THEM, derived from the catalog rather
  -- than from a hand-kept list [round-3 small / STR minor 3]: the earlier loop named nine of
  -- the thirty-odd ungranted FA helpers, so a later blanket `grant execute on all functions in
  -- schema clara` would have passed this census. The set is "every clara._fa_* / clara._tf_fa_*
  -- function that is NOT one of the granted surfaces", so a helper added tomorrow is covered
  -- the day it is written.
  for v_acl_row in
    select p.oid::regprocedure::text as sig from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and (p.proname like '\_fa\_%' or p.proname like '\_tf\_fa\_%'
           or p.proname = '_tf_fixed_assets_immutable_0017')
      and p.oid::regprocedure::text not in (
        'clara.depreciation_run_due(uuid)', 'clara.run_depreciation_period(uuid,date,date,text)')
    order by 1
  loop
    if has_function_privilege('public', v_acl_row.sig, 'EXECUTE')
       or has_function_privilege('clara_authenticated', v_acl_row.sig, 'EXECUTE')
       or has_function_privilege('clara_runtime', v_acl_row.sig, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_acl_row.sig, 'EXECUTE')
       or has_function_privilege('clara_wake_interactive', v_acl_row.sig, 'EXECUTE')
       or has_function_privilege('clara_wake_proactive', v_acl_row.sig, 'EXECUTE') then
      raise exception '0041 tail 9: internal helper % is reachable by a non-owner role', v_acl_row.sig;
    end if;
    v_helpers := v_helpers + 1;
  end loop;
  if v_helpers < 30 then
    raise exception '0041 tail 9: only % internal FA helper(s) were censused (expected at least 30) -- the pattern stopped matching', v_helpers;
  end if;
  -- THE AGENT NEVER SIGNS DEPRECIATION, DISPOSAL OR THE REGISTER (the wake-authority
  -- structural invariant, restated for this wave).
  select count(*)::int, string_agg(coalesce(fn_name, function_name), ', ') into v_n, v_names
    from clara.wake_fn_allowlist
    where coalesce(fn_name, function_name) like '%fixed_asset%'
       or coalesce(fn_name, function_name) like '%depreciation%'
       or coalesce(fn_name, function_name) like '%fa_account_profile%'
       or coalesce(fn_name, function_name) like '%fy_end%';
  if v_n <> 0 then
    raise exception '0041 tail 9: % wake-allowlist row(s) name a Wave D-a verb (%) -- the agent never signs the register', v_n, v_names;
  end if;
  raise notice '0041 tail 9 OK: SELECT-only for humans and zero machine grants on all four tables; 16 human verbs reachable only by clara_authenticated; the machine run verb reachable only by clara_runtime; % internal FA helpers reachable by NO non-owner role (catalog-derived, not a hand list); no wake-allowlist row names a D-a verb.', v_helpers;
end $tail9$;

-- =====================================================================================
-- TAIL 10 -- THE ORIGIN + STATUS + METHOD VOCABULARY, asserted on the live constraints.
-- =====================================================================================
do $tail10$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.journal_entries'::regclass and conname = 'journal_entries_origin_check';
  if position('scheduled_run' in v_def) = 0 or position('reversal' in v_def) = 0
     or position('manual' in v_def) = 0 or position('document' in v_def) = 0
     or position('agent' in v_def) = 0 then
    raise exception '0041 tail 10: journal_entries_origin_check is not the five-value manual|document|agent|reversal|scheduled_run shape (%)', v_def;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.fixed_assets'::regclass and conname = 'fixed_assets_status_check_0017';
  if position('unwound' in v_def) = 0 or position('superseded' in v_def) = 0
     or position('disposed' in v_def) = 0 or position('pending' in v_def) = 0 then
    raise exception '0041 tail 10: the fixed_assets status CHECK does not admit the five-state D-a vocabulary (%)', v_def;
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.fixed_assets'::regclass
      and conname = 'fixed_assets_depreciation_method_check';
  if position('reducing_balance' in v_def) = 0 or position('none' in v_def) = 0
     or position('straight_line' in v_def) = 0 then
    raise exception '0041 tail 10: the depreciation_method CHECK does not admit all three WD-R3 methods (%)', v_def;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.fixed_assets'::regclass
                 and conname = 'ck_fa_method_drivers')
     or not exists (select 1 from pg_constraint where conrelid = 'clara.fixed_assets'::regclass
                    and conname = 'ck_fa_rate_bps_range') then
    raise exception '0041 tail 10: a method-driver or rate-range CHECK is missing';
  end if;
  -- The 0017 supersede-state CHECK is UNTOUCHED and still true (an unwound row keeps
  -- superseded_by NULL, so nothing about 'unwound' disturbs it).
  if not exists (select 1 from pg_constraint where conrelid = 'clara.fixed_assets'::regclass
                 and conname = 'ck_fixed_assets_superseded_state_0017') then
    raise exception '0041 tail 10: ck_fixed_assets_superseded_state_0017 was dropped by this migration';
  end if;
  raise notice '0041 tail 10 OK: origin admits scheduled_run, status admits unwound, method admits all three, the driver and rate CHECKs are live, and the 0017 supersede-state CHECK is untouched.';
end $tail10$;

-- =====================================================================================
-- TAIL 11 -- THE VERB INVENTORY. Everything the pin sheet and the design name, present at
-- its exact signature, so a build that silently dropped a verb cannot pass.
-- =====================================================================================
do $tail11$
declare f text; v_n int := 0;
begin
  foreach f in array array[
      'clara._fa_particulars_complete(clara.fixed_assets)', 'clara._fa_accumulated(uuid,date)',
      'clara._fa_accumulated_total(uuid)', 'clara._fa_own_ledger(uuid,date)',
      'clara._fa_own_ledger_periods(uuid,date)', 'clara._fa_lineage_walk(uuid,date,boolean)',
      'clara._fa_accumulated_at(uuid,date)',
      'clara._fa_accumulated_periods_through(uuid,date)',
      'clara._fa_range_covered(uuid,date,date)',
      'clara._fa_first_chargeable_month(uuid)',
      'clara._fa_first_due_month(uuid,date)', 'clara._fa_lineage_first_due_month(uuid,date)',
      'clara._fa_ancestors_first_due_month(uuid,date)',
      'clara._fa_revision_closure(uuid[])',
      'clara._fa_reversal_lineage(uuid)', 'clara._fa_reversal_blocked(uuid)',
      'clara._fa_reserved_roles(uuid)', 'clara._fa_lock_roles(uuid)',
      'clara._fa_assert_code_unreserved(uuid,text)', 'clara._tf_fa_bank_reserved()',
      'clara._fa_pending_unposted(uuid)',
      'clara._fa_disposal_draft_outstanding(uuid,uuid,date)', 'clara._fa_asset_charges(uuid,date,boolean)',
      'clara._fa_compute_charges(uuid,date,date)', 'clara._fa_oldest_unmet_period(uuid)',
      'clara._fa_on_approve(uuid)', 'clara._tf_fa_movement_belt()',
      'clara._fa_validate_particulars(jsonb)', 'clara._fa_included_at(uuid,date)',
      'clara._fa_uncharged_months(uuid,date)', 'clara._fa_asset_json(uuid,date)',
      'clara._fa_today()', 'clara._fa_month_start(date)', 'clara._fa_month_end(date)',
      'clara._fa_month_diff(date,date)', 'clara._fa_ym_date(integer,integer,integer)',
      'clara._fa_fy_end_for(uuid,date)', 'clara._fa_fy_open_for(uuid,date)',
      'clara.upsert_fa_account_profile(uuid,text,text,text,text)',
      'clara.retire_fa_account_profile(uuid,text,text)',
      'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)',
      'clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
      'clara.set_client_fy_end(uuid,integer,integer,text)',
      'clara.propose_depreciation_authority(uuid,text,text)',
      'clara.sign_depreciation_authority(uuid,uuid,text)',
      'clara.retire_depreciation_authority(uuid,uuid,text,text)',
      'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)',
      'clara.run_depreciation_period(uuid,date,date,text)',
      'clara.run_depreciation_manual(uuid,date,date,text)',
      'clara.depreciation_run_due(uuid)',
      'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)',
      'clara.list_fixed_assets(uuid)', 'clara.get_fixed_asset(uuid)',
      'clara.list_depreciation_runs(uuid)', 'clara.get_depreciation_run(uuid)',
      'clara.get_depreciation_authority(uuid)', 'clara.fa_register_tie(uuid,date)'] loop
    if to_regprocedure(f) is null then
      raise exception '0041 tail 11: % was not created at that exact signature', f;
    end if;
    v_n := v_n + 1;
  end loop;
  raise notice '0041 tail 11 OK: all % Wave D-a functions are present at their exact signatures.', v_n;
end $tail11$;

-- =====================================================================================
-- TAIL 12 -- EVERY SUPERSEDED REGISTER ROW IS DATED [round-3.5 fold G3]. The as-of inclusion
-- rule reads `superseded_at is null` as "still in the register at every date", so an undated
-- supersede is not a missing label -- it is a register that double-counts a corrected asset
-- against a GL that only ever carried one of them, silently, with every explained column of
-- the tie at zero. S1.8 backfilled the rows the K6 door created before today and S4.11 recut
-- that door; this is the census that proves BOTH landed on the world this migration leaves.
-- =====================================================================================
do $tail12$
declare v_n int; v_names text;
begin
  select count(*)::int, string_agg(f.id::text, ', ' order by f.id) into v_n, v_names
    from clara.fixed_assets f where f.status = 'superseded' and f.superseded_at is null;
  if v_n <> 0 then
    raise exception '0041 tail 12: % superseded register row(s) carry no supersede date (%) -- every as-of read would hold them forever', v_n, v_names;
  end if;
  -- ...and the ONE writer that could still create one is recut (S4.11 asserts the splice; this
  -- asserts the property the splice exists for).
  if position('superseded_at' in (select p.prosrc from pg_proc p
        where p.oid = 'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)) = 0 then
    raise exception '0041 tail 12: the K6 hand-off no longer stamps superseded_at -- undated supersedes are reachable again';
  end if;
  raise notice '0041 tail 12 OK: zero superseded register rows carry a NULL supersede date, and the K6 hand-off stamps one.';
end $tail12$;

-- =====================================================================================
-- TAIL 13 -- THE ONE RESERVATION PREDICATE + ITS LOCK-ORDER PROOF [round-3.5 fold G4].
-- Three properties, each of which a later edit could break silently:
--   (a) every consumer reads the PREDICATE, not fa_account_profiles directly -- the enrolment
--       topology, the disposal proceeds/gain/loss hardening, and the bank-side belt;
--   (b) the bank side is belted at the TABLE, not at the doors, so a fourth bank COA door
--       built tomorrow is covered the day it is written;
--   (c) the leaf rung is a LEAF: not one body that takes it ever acquires a ladder rung
--       (203005002 firm -> 203005004 client -> 203005003 client:counterparty), so
--       "never acquire 203005004 while holding a later rung" cannot be violated from here.
-- =====================================================================================
do $tail13$
declare r record; v_src text; v_n int;
begin
  -- (a) THE CONSUMERS.
  for r in select * from (values
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)', 'clara._fa_reserved_roles('),
      ('clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)',
        'clara._fa_reserved_roles('),
      ('clara._fa_assert_code_unreserved(uuid,text)', 'clara._fa_reserved_roles(')
    ) as t(sig, marker) loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position(r.marker in v_src) = 0 then
      raise exception '0041 tail 13(a): % no longer reads the one reservation predicate -- a guard that reads only the enrolment table cannot see a code a live register row still carries', r.sig;
    end if;
  end loop;
  -- The disposal hardening in particular must NOT have an fp.active-scoped probe left in it.
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.dispose_fixed_asset(uuid,uuid,date,bigint,text,text,text,text,text,bigint)'::regprocedure;
  if position('from clara.fa_account_profiles fp' in v_src) <> 0 then
    raise exception '0041 tail 13(a): dispose_fixed_asset still reads clara.fa_account_profiles directly -- the retired-profile hole is re-openable';
  end if;
  -- (b) THE BANK-SIDE BELT is installed on the TABLE, gated on active, and NOT deferred.
  select count(*)::int into v_n from pg_trigger
    where tgrelid = 'clara.bank_accounts'::regclass and tgname = 't_bank_accounts_fa_reserved';
  if v_n <> 1 then
    raise exception '0041 tail 13(b): the FA reservation belt is not installed on clara.bank_accounts (found %)', v_n;
  end if;
  select pg_get_triggerdef(oid) into v_src from pg_trigger
    where tgrelid = 'clara.bank_accounts'::regclass and tgname = 't_bank_accounts_fa_reserved';
  if position('new.active' in v_src) = 0 then
    raise exception '0041 tail 13(b): the FA reservation belt is not gated on new.active -- def is %', v_src;
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'clara.bank_accounts'::regclass
             and tgname = 't_bank_accounts_fa_reserved' and (tgdeferrable or tginitdeferred)) then
    raise exception '0041 tail 13(b): the FA reservation belt is DEFERRED -- a refusal that only arrives at COMMIT is invisible to every caller that rolls back';
  end if;
  -- (c) THE LEAF-RUNG PROOF. One taker of the key, and no rung anywhere in any body that takes
  -- it (directly or through the belt).
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.prosrc like '%:fa-roles%';
  if v_n <> 1 then
    raise exception '0041 tail 13(c): % function(s) take the fa-roles leaf key (expected exactly 1 -- clara._fa_lock_roles)', v_n;
  end if;
  -- THE LAW IS "LEAF LAST", NOT "NO RUNGS ON THE PATH". clara.remap_bank_account_coa really
  -- does take the client rung (and its own bank rung) -- BEFORE it writes the row, which is
  -- exactly the order that makes the leaf safe. What must never exist is a rung acquired while
  -- the leaf is already held, so the assertion is positional: nothing after the statement that
  -- FIRES the belt (and nothing after the two enrolment doors take the key directly) may
  -- acquire an advisory lock of any kind.
  for r in select * from (values
      ('clara.add_bank_account(uuid,text,text,text,text,uuid,text)',
        'insert into clara.bank_accounts('),
      ('clara.remap_bank_account_coa(uuid,uuid,text,text)',
        'update clara.bank_accounts set coa_account_code'),
      ('clara.reactivate_bank_account(uuid,uuid,text)',
        'update clara.bank_accounts set active = true'),
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)',
        'clara._fa_lock_roles('),
      ('clara.retire_fa_account_profile(uuid,text,text)',
        'clara._fa_lock_roles(')
    ) as t(sig, anchor) loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position(r.anchor in v_src) = 0 then
      raise exception '0041 tail 13(c): % no longer contains the anchor "%" this lock-order proof is measured against -- re-derive it', r.sig, r.anchor;
    end if;
    if position('pg_advisory_xact_lock' in substr(v_src, position(r.anchor in v_src))) <> 0 then
      raise exception '0041 tail 13(c): % acquires an advisory lock AFTER it takes (or fires) the fa-roles LEAF -- that is a rung taken under a leaf, which is how this ladder deadlocks. Move the acquisition above "%"', r.sig, r.anchor;
    end if;
  end loop;
  -- ...and the one body the bank doors reach AFTER the belt has fired takes no lock at all.
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if position('pg_advisory_xact_lock' in v_src) <> 0 then
    raise exception '0041 tail 13(c): clara._enqueue_invoice_facts_core now takes an advisory lock, and add_bank_account calls it while holding the fa-roles leaf';
  end if;
  -- The three FA-side bodies on the leaf path take no ladder rung of their own.
  for r in select * from (values
      ('clara._fa_lock_roles(uuid)'), ('clara._fa_assert_code_unreserved(uuid,text)'),
      ('clara._tf_fa_bank_reserved()')
    ) as t(sig) loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position('203005002' in v_src) <> 0 or position('203005003' in v_src) <> 0
       or position('203005004' in v_src) <> 0 then
      raise exception '0041 tail 13(c): % takes a house ladder rung inside the leaf itself', r.sig;
    end if;
  end loop;
  -- Both enrolment doors take it: the read-then-write is otherwise racy against the bank side.
  for r in select * from (values
      ('clara.upsert_fa_account_profile(uuid,text,text,text,text)'),
      ('clara.retire_fa_account_profile(uuid,text,text)')
    ) as t(sig) loop
    select p.prosrc into v_src from pg_proc p where p.oid = r.sig::regprocedure;
    if position('clara._fa_lock_roles(' in v_src) = 0 then
      raise exception '0041 tail 13(c): % does not take the fa-roles leaf rung -- concurrent enrolment and bank binding of one code would both pass', r.sig;
    end if;
  end loop;
  -- And soft-birth arm 4 excludes disposal-bearing entries (the phantom's mechanical site).
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._fa_on_approve(uuid)'::regprocedure;
  if position($x$not (e.flags ? 'fa_disposal')$x$ in v_src) = 0 then
    raise exception '0041 tail 13: the soft-birth arm no longer excludes fa_disposal entries -- a disposal''s accumulated-debit leg can birth a phantom register row again';
  end if;
  raise notice '0041 tail 13 OK: three consumers read the one reservation predicate (and the disposal verb reads the profile table no more); the bank side is belted at the table, gated on active, undeferred; the fa-roles key has exactly one taker and no body on its path acquires ANY advisory lock after taking or firing it (leaf-last, proven positionally); soft-birth excludes disposals.';
end $tail13$;

do $tail_final$
begin
  raise notice '0041 wave D-a FA register: APPLIED. SECTION 0 (13 probes) + S1 (schema, the immutability transition table, the superseded_at backfill) + EVENTS (3 asset.* kinds) + S2 (arithmetic, the approve-time hook, the movement belt, the reservation predicate + its bank-side belt) + S3 (enrolment, particulars, authority, the two run verbs, disposal) + READS (6 RPCs + the grant loops) + S4 (11 splices) + 13 tail blocks, all green.';
end
$tail_final$;
