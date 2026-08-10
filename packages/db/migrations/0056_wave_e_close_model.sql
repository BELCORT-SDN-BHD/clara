-- 0056_wave_e_close_model.sql -- Wave E lane β: the period spine + the close model (E-a).
--
-- MIGRATION NUMBER claimed at MERGE (standing law). Authored as 0056 on the lane-α stack
-- (0055 on the branch, repo frontier 0054 at authoring); renumber mechanically if the merge
-- order moves.
--
-- DESIGN HOME (ratified, PR #223, four-round ladder CLEAN): wave-e-design-skeleton.md §1-§2.4 ·
-- -part2.md §2.5-§2.8 · -part3.md §2.9-§2.10. Acceptance oracles: wave-e-acceptance-matrix.md
-- §1 Section A (the β rows: A1-A28) + §8's order. The contract (wave-e-contract.md, ADR-065)
-- wins on any conflict. E-R7: one campaign; this lane is its root.
--
-- WHAT THIS FILE SHIPS, in section order:
--   S1  clara.fiscal_years -- the period spine: DATE RANGES (E-R3), contiguity BY CONSTRUCTION
--       (prior_fy_id UNIQUE + a before-insert trigger; no btree_gist), the 18-month statutory
--       structural bound (a DOCUMENTED DDL exception to "law lives in policy tables"), the
--       fy_end_source honesty label, and -- LOAD-BEARING -- the explicit clara_fn_owner
--       using(true) RLS policy without which §2.9's definer read sees ZERO rows and E-R6
--       fail-opens across the estate (matrix A6e).
--   S2  the gate catalog + run/result/attestation trio: close_gate_checks (code-populated),
--       close_runs (ONE in_progress per FY), close_gate_results (append-only, measured_digest),
--       close_attestations (append-only, digest-bound -- PRD invariant 8 applied to a gate).
--   S3  clara.close_write_permits -- the wall's permit: a ROW this transaction created
--       (declared xid8, NEVER xmin -- the subxact trap; NO GUC, NO pg_locks), insert-once with
--       exactly ONE mutable column (entries_used, upward only).
--   S4  the closed-period wall -- a TRIGGER FAMILY, not N writer recuts: _tf_period_wall on
--       journal_entries (serialize AND refuse, SECURITY DEFINER), a journal_lines sibling, and
--       serialize-ONLY siblings on the FIVE gate-evidence tables (open_item_allocations,
--       bank_statements, bank_reconciliations, bank_line_exceptions, fixed_assets). Every
--       trigger's FIRST act: pg_advisory_xact_lock_shared(203005007, hashtext(client)) --
--       007 is the BOTTOM rung on every path (skeleton §2.1's two killed cycles).
--   S5  the drawer-1 probes: ar_control_tie / ap_control_tie (subledger side via _aging_core --
--       the instrument production uses; GL side via the allocation writers' own resolver;
--       unknown/error fail CLOSED), fa_control_tie_out (segment + opening watermark; the
--       visibility-only fa_register_tie is NOT touched and its prosrc is tail-asserted
--       unchanged), bank_recon_close_state (verify_bank_reconciliation's STRICT half only).
--   S6  the close verbs: propose_fiscal_year (read) · open_fiscal_year (admin) · begin_close /
--       attest_close_exception / finalize_close / abandon_close (key ②) · reopen_fiscal_year
--       (key ③; acquisition row → 004 → 007-EXCLUSIVE -- the order IS the containment for
--       cycle 2, never a timer). finalize_close: permit → closing entry as DRAFT → the
--       census-VISIBLE `update ... set status='approved'` flip → receipt → lineage UPDATE;
--       continuity math from DB-owned inputs only (E-R4); the closing_position PIN (matrix
--       A19f); segregation on last_human_editor over the FY (E-R11, matrix A12).
--   S7  E-R6 activation: _correction_period_state rewritten IN PLACE (the ONLY create-or-
--       replace body -- a stub with no callers to preserve): 'no_period_model' stays the
--       PERMIT token, 'entry_missing' fails closed, closed-wins ORDER BY; the honest twin
--       correction_period_state; the two READERS repointed by splice; the guard
--       (approve_wrong_client_correction) proven UNTOUCHED by an md5(prosrc) prestate/tail
--       pair + before/after caller-set census (matrix A6a-A6e).
--   S8  E-R11: firm_capability_grants + grant/revoke_firm_capability (owner-LITERAL floor,
--       never role_rank) + _has_capability (factory default owner-only -- CONFIRMED by the
--       owner 2026-08-09; partners join by explicit audited grant).
--   S9  the approve_opening_seed splice (matrix A19g's seed arm): harvest via
--       pg_get_functiondef (the live body is 0017's text as spliced by 0018 §3b -- a from-file
--       rebuild deletes two live guards), count the `perform clara._assert_opening_tie(p_seed);`
--       anchor exactly once, splice the opening(n+1)=closing(n) assertion against the PRIOR
--       receipt's PINNED closing_position, post-assert the 0018 guards survived.
--   S10 the grant matrix: clara_authenticated gets the verbs + reads; clara_agent_ro gets
--       READS ONLY; wake roles and clara_runtime get NOTHING (matrix A9).
--   S11 tails: the approve-writer census grows four → FIVE with finalize_close and the
--       per-hook disposition; the wall-coverage census asserts every §2.11-named mover's
--       effect table carries its trigger; privilege sweeps by has_function_privilege (state,
--       never grant-statement text); the md5 pairs; fa_register_tie unchanged.
--
-- REFUSAL CODES: CLR41 is a PROPOSAL claimed at merge -- the prestate re-probes the live
-- roster (CLR01..CLR40 + CLR99 at design time) and takes the next free code if the ground
-- moved. CLR19 owns write_into_closed_period; CLR10/CLR11/CLR04 per their standing owners.
--
-- LOCKS: the close family takes 203005004 then 203005007-EXCLUSIVE (bottom rung, always
-- last); reopen_fiscal_year leads with the closing entry's ROW lock (row → 004 → 007excl --
-- every JE writer's own order, so cycle 2 cannot form); every writer-side trigger takes
-- 007-SHARED as its first act. 203005007 is grep-verified free at authoring time and
-- re-probed here with BOTH instruments (matrix A13's namespace discipline).
--
-- D1 WRITE-QUIESCE binds this file's live deploy (it creates triggers on the hottest table
-- and splices an audited writer body); the ceremony additionally sets lock_timeout for the
-- trigger DDL (skeleton §1.1). INERT ON ARRIVAL: zero fiscal_years rows exist at deploy, so
-- every guard passes until the first human open_fiscal_year -- activation is a positive
-- post-deploy read, not a race.
--
-- CELLS: packages/db/tests/x56-*.test.mjs (matrix Section A β rows). Contract-blind on this
-- file: the cells probe the LIVE catalog, never this .sql.
set local statement_timeout = '5min';

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file relies on is measured here, before anything
-- changes; the security posture of every body it will splice is stashed for the tail.
-- =====================================================================================
create temp table _x56_pre(
  k text primary key,
  v text not null
) on commit drop;

do $s0$
declare
  v_n int; v_def text; v_t text;
begin
  -- (0.1) The change-of-record owners this file reads/splices must be applied, in order.
  foreach v_t in array array['0017_wave_b','0018_gate_k_domain','0027_filings_lock_order',
      '0040_wave_c_c_tieout','0041_wave_d_a_fa_register','0042_wave_d_b0_shared_authorities',
      '0044_wave_d_b3_af2_composite','0045_wave_d_b2_recurring_adjustments'] loop
    select count(*) into v_n from clara.schema_migrations where version = v_t;
    if v_n <> 1 then
      raise exception '0056 S0.1: % is not recorded as applied -- apply in order', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.2) No period model may pre-exist: the birth set must be absent.
  foreach v_t in array array['fiscal_years','close_gate_checks','close_runs',
      'close_gate_results','close_attestations','close_write_permits','close_receipts',
      'firm_capability_grants'] loop
    if to_regclass('clara.' || v_t) is not null then
      raise exception '0056 S0.2: clara.% already exists -- refusing to re-birth', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.3) THE ADVISORY NAMESPACE 203005007 IS FREE -- re-probed with BOTH instruments
  -- (matrix A13: the prefix scan cannot see a key inside a spliced body literal, and neither
  -- instrument sees the runtime's single-arg SESSION space; both are named in the record).
  -- Instrument (i): no live function body carries the literal.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.prosrc like '%203005007%';
  if v_n <> 0 then
    raise exception '0056 S0.3: 203005007 already appears in % live clara body/bodies -- the close lock must claim a FREE key; re-grep and renumber', v_n
      using errcode = 'CLR10';
  end if;
  -- Instrument (ii) is the repo-side grep (pg_advisory[a-z_]*\(\s*[0-9]+ over packages/),
  -- run at authoring and re-run by the reviewer; a live database cannot see repo text, so
  -- the second instrument is discharged by the record, not by this probe -- stated honestly.

  -- (0.4) THE STUB THIS FILE ACTIVATES is still the 0007 constant stub (one body, no
  -- fiscal_years reference), and the GUARD this file must NOT touch still carries the frozen
  -- predicate. The guard's md5 is stashed; the tail proves it unmoved.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_correction_period_state';
  if v_n <> 1 then
    raise exception '0056 S0.4: expected exactly ONE _correction_period_state, found %', v_n
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_def from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_correction_period_state';
  if position('fiscal_years' in v_def) <> 0 then
    raise exception '0056 S0.4: _correction_period_state already reads fiscal_years -- 0056 has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  insert into _x56_pre(k, v) values ('awcc_md5', v_t);
  select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) into v_def from pg_proc p
    where p.oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  if position('clara._correction_period_state(i.entry_id)<>''no_period_model''' in v_def) = 0 then
    raise exception '0056 S0.4: the live guard no longer carries the frozen permit-sentinel predicate -- not the body this migration was authored against'
      using errcode = 'CLR10';
  end if;

  -- (0.5) THE CALLER SET of _correction_period_state, BEFORE (matrix A6d): exactly the three
  -- §0.3-measured functions. A fourth caller is a finding, not a surprise.
  select coalesce(string_agg(p.proname, ',' order by p.proname), '') into v_t
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname <> '_correction_period_state'
      and p.prosrc like '%\_correction\_period\_state%' escape '\';
  if v_t <> 'approve_wrong_client_correction,preview_wrong_client_correction,retire_document_filing' then
    raise exception '0056 S0.5: the _correction_period_state caller set is {%} -- expected exactly {approve_wrong_client_correction, preview_wrong_client_correction, retire_document_filing}; account for the change before this file may pass', v_t
      using errcode = 'CLR10';
  end if;

  -- (0.6) approve_opening_seed: the live body is 0017's text AS SPLICED BY 0018 §3b. Stash
  -- its posture; positively probe the anchor this file will count and the two 0018 guards
  -- that a from-file rebuild would delete.
  select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) into v_def from pg_proc p
    where p.oid = 'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if v_def is null then
    raise exception '0056 S0.6: clara.approve_opening_seed is GONE' using errcode = 'CLR10';
  end if;
  v_t := 'perform clara._assert_opening_tie(p_seed);';
  v_n := (length(v_def) - length(replace(v_def, v_t, ''))) / length(v_t);
  if v_n <> 1 then
    raise exception '0056 S0.6: the opening-tie anchor appears % time(s) in the live approve_opening_seed (expected exactly once) -- the body drifted; re-derive the S9 splice', v_n
      using errcode = 'CLR10';
  end if;
  if position('correction_draft_present' in v_def) = 0 then
    raise exception '0056 S0.6: the 0018 §3b K5 guard (correction_draft_present) is missing from the live approve_opening_seed -- a reverted body must abort, never be re-blessed'
      using errcode = 'CLR10';
  end if;
  if position('closing_position' in v_def) <> 0 then
    raise exception '0056 S0.6: approve_opening_seed already references closing_position -- 0056 has already been applied to this database'
      using errcode = 'CLR10';
  end if;
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  insert into _x56_pre(k, v) values ('aos_md5_pre', v_t);

  -- (0.7) The approve-writer census: 0045 is the LAST carrier and the roster must still be
  -- the pinned four (S11 re-states it at five). Measured with 0045's own normalisation.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and lower(regexp_replace(regexp_replace(regexp_replace(
            coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)),
            '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
          ~ 'update\s+clara\.journal_entries\s+set\s+status\s*=\s*''approved''';
  if v_n <> 4 then
    raise exception '0056 S0.7: the approve-writer census counts % bodies (expected the pinned FOUR: _approve_entry_core, _approve_opening_entry, approve_wrong_client_correction, reverse_entry) -- the roster moved; re-derive S11 before this file may pass', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.8) The helpers this file leans on, at their pinned signatures.
  if to_regprocedure('clara._book_today()') is null
     or to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara._aging_core(uuid,uuid,text,date)') is null
     or to_regprocedure('clara.trial_balance_as_of(uuid,date)') is null
     or to_regprocedure('clara.verify_bank_reconciliation(uuid)') is null
     or to_regprocedure('clara._subledger_on_approve(uuid)') is null
     or to_regprocedure('clara.reverse_entry(uuid,text,text)') is null then
    raise exception '0056 S0.8: a required helper is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;

  -- (0.9) fa_register_tie stays visibility-only and UNTOUCHED: stash its md5 for the tail.
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.fa_register_tie(uuid,date)'::regprocedure;
  insert into _x56_pre(k, v) values ('fart_md5', v_t);
end $s0$;

-- =====================================================================================
-- S1 -- clara.fiscal_years: the period spine (skeleton §2.1; E-R3).
-- =====================================================================================
set role clara_fn_owner;

create table clara.fiscal_years (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null references clara.firms(id),
  client_id     uuid        not null,
  label         text        not null check (btrim(label) <> ''),  -- display only, never identity
  starts_on     date        not null,
  ends_on       date        not null,
  ordinal       int         not null check (ordinal >= 1),        -- 1-based, dense per client
  prior_fy_id   uuid        references clara.fiscal_years(id),
  status        text        not null default 'open'
                  check (status in ('open','closing','closed','reopened')),
  -- A defaulted 12/31 year-end is NEVER silently readable as asserted (matrix A23; the value
  -- domain is DDL, not a refusal token -- §0.4's latitude does not reach it).
  fy_end_source text        not null check (fy_end_source in ('asserted','default_1231')),
  -- Required when the span is outside 11-13 months: a data-level attestation, not a refusal.
  length_reason text,
  opened_by     uuid        not null references clara.users(id),
  opened_at     timestamptz not null default now(),
  -- The 0007:59 composite-FK idiom: tenant congruence is structural on BOTH edges.
  constraint uq_fy_id_firm unique (id, firm_id),
  constraint fk_fy_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  constraint uq_fy_client_ordinal unique (client_id, ordinal),
  constraint uq_fy_prior unique (prior_fy_id),                    -- one successor per FY
  constraint ck_fy_range check (ends_on >= starts_on),
  -- A DOCUMENTED DDL exception to "law lives in policy tables": CA 2016's first-FY bound is a
  -- permanent STRUCTURAL shape of the domain, not a rate that changes by year. If it moves,
  -- it moves by migration + ADR (skeleton §2.1's own labelling).
  constraint ck_fy_span check (ends_on < starts_on + interval '18 months')
);

-- The wall's per-write FY lookup (every JE touch resolves its FY through this).
create index ix_fy_client_span on clara.fiscal_years (client_id, starts_on, ends_on);

-- CONTIGUITY BY CONSTRUCTION (E-R3; matrix A21a/A21b): prior_fy_id is UNIQUE (above) and this
-- trigger makes a gap or overlap impossible in one readable predicate. btree_gist is installed
-- nowhere (measured at design time) and an EXCLUDE constraint would add an extension to a
-- ceremony; judgement logic, so it carries its own cells.
create function clara._tf_fiscal_years_contiguity() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  prior record;
begin
  if new.ordinal = 1 then
    if new.prior_fy_id is not null then
      raise exception 'the first fiscal year of a client has no predecessor'
        using errcode = 'CLR10', detail = '{"reason":"fy_not_contiguous"}';
    end if;
    return new;
  end if;
  if new.prior_fy_id is null then
    raise exception 'fiscal year ordinal % requires its predecessor named', new.ordinal
      using errcode = 'CLR10', detail = '{"reason":"fy_not_contiguous"}';
  end if;
  select * into prior from clara.fiscal_years fy where fy.id = new.prior_fy_id;
  if not found or prior.client_id <> new.client_id then
    raise exception 'the named prior fiscal year does not belong to this client'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  if prior.ordinal <> new.ordinal - 1 then
    raise exception 'fiscal year ordinal % does not follow its predecessor''s ordinal %', new.ordinal, prior.ordinal
      using errcode = 'CLR10', detail = '{"reason":"fy_not_contiguous"}';
  end if;
  if new.starts_on <> prior.ends_on + 1 then
    raise exception 'fiscal year starting % is not contiguous with its predecessor ending % -- periods admit no gap and no overlap', new.starts_on, prior.ends_on
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','fy_not_contiguous',
          'prior_ends_on', prior.ends_on, 'starts_on', new.starts_on)::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_fiscal_years_contiguity() from public;

create trigger t_fiscal_years_contiguity before insert on clara.fiscal_years
  for each row execute function clara._tf_fiscal_years_contiguity();

-- Lifecycle: status is the ONE mutable column (open|reopened -> closing -> closed -> reopened
-- via the audited verbs only); everything else is immutable from INSERT.
create function clara._tf_fiscal_years_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.id                is distinct from old.id
     or new.firm_id        is distinct from old.firm_id
     or new.client_id      is distinct from old.client_id
     or new.label          is distinct from old.label
     or new.starts_on      is distinct from old.starts_on
     or new.ends_on        is distinct from old.ends_on
     or new.ordinal        is distinct from old.ordinal
     or new.prior_fy_id    is distinct from old.prior_fy_id
     or new.fy_end_source  is distinct from old.fy_end_source
     or new.length_reason  is distinct from old.length_reason
     or new.opened_by      is distinct from old.opened_by
     or new.opened_at      is distinct from old.opened_at then
    raise exception 'a fiscal year admits exactly one update: its lifecycle status'
      using errcode = 'CLR10', detail = '{"reason":"fy_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_fiscal_years_lifecycle() from public;

create trigger t_fiscal_years_lifecycle before update on clara.fiscal_years
  for each row execute function clara._tf_fiscal_years_lifecycle();
create trigger t_fiscal_years_no_delete before delete on clara.fiscal_years
  for each row execute function clara._tf_append_only();
create trigger t_fiscal_years_no_truncate before truncate on clara.fiscal_years
  for each statement execute function clara._tf_no_truncate();

-- RLS: forced, firm-scoped -- AND THE OWNER POLICY IS THE LOAD-BEARING HALF (matrix A6e):
-- clara_fn_owner is NOT BYPASSRLS and FORCE RLS applies to it (0002:10-12), so without
-- p_fy_owner the SECURITY DEFINER read inside _correction_period_state sees ZERO FY rows and
-- returns the PERMIT token for every entry in the estate -- a silent, total fail-open of E-R6.
alter table clara.fiscal_years enable row level security;
alter table clara.fiscal_years force row level security;
create policy p_fy_owner on clara.fiscal_years
  for all to clara_fn_owner using (true) with check (true);
create policy p_fy_human on clara.fiscal_years
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.fiscal_years to clara_authenticated;
grant select on clara.fiscal_years to clara_agent_ro;

-- =====================================================================================
-- S2 -- the gate catalog + the run/result/attestation trio (skeleton §2.2).
-- =====================================================================================

-- CODE-POPULATED, NOT FIRM-CONFIGURABLE (the wake_fn_allowlist posture): drawer assignment
-- is RULED (E-R2), and this table is where the ruling becomes data a reviewer can diff.
create table clara.close_gate_checks (
  check_key    text primary key check (btrim(check_key) <> ''),
  drawer       int  not null check (drawer in (1, 2, 3)),
  title        text not null,
  evaluator_fn text not null,
  applies_when text not null default 'always'
    check (applies_when in ('always', 'goods_trading')),
  created_at   timestamptz not null default now()
);
create trigger t_close_gate_checks_append_only before update or delete on clara.close_gate_checks
  for each row execute function clara._tf_append_only();
create trigger t_close_gate_checks_no_truncate before truncate on clara.close_gate_checks
  for each statement execute function clara._tf_no_truncate();
alter table clara.close_gate_checks enable row level security;
alter table clara.close_gate_checks force row level security;
create policy p_cgc_owner on clara.close_gate_checks
  for all to clara_fn_owner using (true) with check (true);
create policy p_cgc_human on clara.close_gate_checks
  for select to clara_authenticated using (true);   -- a GLOBAL catalog, like client_fact_keys
grant select on clara.close_gate_checks to clara_authenticated;
grant select on clara.close_gate_checks to clara_agent_ro;

insert into clara.close_gate_checks (check_key, drawer, title, evaluator_fn, applies_when) values
  -- DRAWER 1 -- absolute; no attestation path exists for any of these (E-R2).
  ('ar_control_tie',            1, 'AR control account = Σ open receivable items', 'clara.ar_control_tie',        'always'),
  ('ap_control_tie',            1, 'AP control account = Σ open payable items',    'clara.ap_control_tie',        'always'),
  ('fa_control_tie',            1, 'FA register ties to the GL over the close segment', 'clara.fa_control_tie_out', 'always'),
  ('bank_recon_identity',       1, 'Bank reconciliation identity (strict half)',   'clara.bank_recon_close_state','always'),
  ('pl_retained_earnings_roll', 1, 'P&L nets to the retained-earnings roll',       'finalize_close (in-body)',    'always'),
  ('opening_continuity_tie',    1, 'FY opening = prior close''s pinned position',  'finalize_close (in-body)',    'always'),
  -- DRAWER 2 -- default-refuse, per-item attested override (E-R2's five named checks).
  ('depreciation_through_fy_end', 2, 'Depreciation authorities have run through FY end', 'clara._close_gate_depreciation', 'always'),
  ('closing_stock_present',       2, 'A goods-trader has a closing-stock entry in the FY', 'clara._close_gate_closing_stock', 'goods_trading'),
  ('unapproved_drafts_in_period', 2, 'No unapproved drafts dated inside the FY',   'clara._close_gate_drafts',    'always'),
  ('open_bank_recon_items',       2, 'No unmatched statement lines / missing statements', 'clara._close_gate_bank_items', 'always'),
  ('uncoded_documents',           2, 'No FY-dated filings without an entry',       'clara._close_gate_uncoded',   'always'),
  -- DRAWER 3 -- advisory only; renders, never blocks.
  ('bank_recon_informational',  3, 'Bank reconciliation informational half',       'clara.bank_recon_close_state','always'),
  ('fa_register_tie_view',      3, 'FA register visibility tie (WD-R1, non-blocking)', 'clara.fa_register_tie',   'always');

-- The mutable attempt workspace. ONE in_progress run per FY -- the partial unique index IS
-- matrix A13's structural oracle (read from pg_index, not inferred).
create table clara.close_runs (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null references clara.firms(id),
  client_id      uuid        not null,
  fiscal_year_id uuid        not null,
  state          text        not null default 'in_progress'
                   check (state in ('in_progress', 'finalized', 'abandoned')),
  started_by     uuid        not null references clara.users(id),
  started_at     timestamptz not null default now(),
  ended_by       uuid,
  ended_at       timestamptz,
  end_reason     text,
  constraint uq_close_runs_id_firm unique (id, firm_id),
  constraint fk_close_runs_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  constraint fk_close_runs_fy foreign key (fiscal_year_id, firm_id)
    references clara.fiscal_years (id, firm_id),
  constraint ck_close_runs_ended check ((state = 'in_progress') = (ended_at is null))
);
create unique index uq_close_runs_one_live on clara.close_runs (fiscal_year_id)
  where state = 'in_progress';

-- Lifecycle: in_progress -> finalized|abandoned, stamped never deleted (matrix A22).
create function clara._tf_close_runs_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.state <> 'in_progress' then
    raise exception 'a settled close run is immutable'
      using errcode = 'CLR10', detail = '{"reason":"close_not_in_progress"}';
  end if;
  if new.id                is distinct from old.id
     or new.firm_id        is distinct from old.firm_id
     or new.client_id      is distinct from old.client_id
     or new.fiscal_year_id is distinct from old.fiscal_year_id
     or new.started_by     is distinct from old.started_by
     or new.started_at     is distinct from old.started_at
     or new.state = 'in_progress' then
    raise exception 'a close run admits exactly one update: its settlement (state + ended_by/at + reason)'
      using errcode = 'CLR10', detail = '{"reason":"close_not_in_progress"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_runs_lifecycle() from public;
create trigger t_close_runs_lifecycle before update on clara.close_runs
  for each row execute function clara._tf_close_runs_lifecycle();
create trigger t_close_runs_no_delete before delete on clara.close_runs
  for each row execute function clara._tf_append_only();
create trigger t_close_runs_no_truncate before truncate on clara.close_runs
  for each statement execute function clara._tf_no_truncate();
alter table clara.close_runs enable row level security;
alter table clara.close_runs force row level security;
create policy p_close_runs_owner on clara.close_runs
  for all to clara_fn_owner using (true) with check (true);
create policy p_close_runs_human on clara.close_runs
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_runs to clara_authenticated;
grant select on clara.close_runs to clara_agent_ro;

-- APPEND-ONLY measurement rows. measured_digest is what an attestation BINDS to (PRD
-- invariant 8 applied to a gate): finalize refuses close_attestation_stale on any drift.
create table clara.close_gate_results (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null,
  close_run_id    uuid        not null,
  check_key       text        not null references clara.close_gate_checks(check_key),
  drawer          int         not null check (drawer in (1, 2, 3)),
  state           text        not null check (state in ('pass','fail','unknown','error','advisory')),
  measured        jsonb       not null check (jsonb_typeof(measured) = 'object'),
  measured_digest text        not null,
  evaluated_at    timestamptz not null default now(),
  constraint uq_cgr_id_firm unique (id, firm_id),
  constraint fk_cgr_run foreign key (close_run_id, firm_id)
    references clara.close_runs (id, firm_id)
);
create index ix_cgr_run_key on clara.close_gate_results (close_run_id, check_key, evaluated_at desc);
create trigger t_cgr_append_only before update or delete on clara.close_gate_results
  for each row execute function clara._tf_append_only();
create trigger t_cgr_no_truncate before truncate on clara.close_gate_results
  for each statement execute function clara._tf_no_truncate();
alter table clara.close_gate_results enable row level security;
alter table clara.close_gate_results force row level security;
create policy p_cgr_owner on clara.close_gate_results
  for all to clara_fn_owner using (true) with check (true);
create policy p_cgr_human on clara.close_gate_results
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_gate_results to clara_authenticated;
grant select on clara.close_gate_results to clara_agent_ro;

-- Attestations: SUPERSESSION, NEVER MUTATION (the client_facts discipline; matrix A20 demands
-- BOTH the stale and the fresh attestation survive in history). The live attestation for a
-- (run, check) is the superseded_at IS NULL row; a fresh one stamps its predecessor.
create table clara.close_attestations (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null,
  close_run_id   uuid        not null,
  check_key      text        not null references clara.close_gate_checks(check_key),
  gate_result_id uuid        not null,
  attested_by    uuid        not null references clara.users(id),
  reason         text        not null check (btrim(reason) <> ''),
  attested_at    timestamptz not null default now(),
  superseded_by  uuid        references clara.close_attestations(id) deferrable initially deferred,
  superseded_at  timestamptz,
  constraint ck_ca_supersession_paired check ((superseded_by is null) = (superseded_at is null)),
  constraint fk_ca_run foreign key (close_run_id, firm_id)
    references clara.close_runs (id, firm_id),
  constraint fk_ca_result foreign key (gate_result_id, firm_id)
    references clara.close_gate_results (id, firm_id)
);
create unique index uq_ca_live on clara.close_attestations (close_run_id, check_key)
  where superseded_at is null;
create function clara._tf_close_attestations_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded attestation is immutable'
      using errcode = 'CLR10', detail = '{"reason":"close_attestation_stale"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id             is distinct from old.id
     or new.firm_id        is distinct from old.firm_id
     or new.close_run_id   is distinct from old.close_run_id
     or new.check_key      is distinct from old.check_key
     or new.gate_result_id is distinct from old.gate_result_id
     or new.attested_by    is distinct from old.attested_by
     or new.reason         is distinct from old.reason
     or new.attested_at    is distinct from old.attested_at then
    raise exception 'an attestation admits exactly one update: the supersession stamp'
      using errcode = 'CLR10', detail = '{"reason":"close_attestation_stale"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_attestations_supersede_only() from public;
create trigger t_ca_supersede_only before update on clara.close_attestations
  for each row execute function clara._tf_close_attestations_supersede_only();
create trigger t_ca_no_delete before delete on clara.close_attestations
  for each row execute function clara._tf_append_only();
create trigger t_ca_no_truncate before truncate on clara.close_attestations
  for each statement execute function clara._tf_no_truncate();
alter table clara.close_attestations enable row level security;
alter table clara.close_attestations force row level security;
create policy p_ca_owner on clara.close_attestations
  for all to clara_fn_owner using (true) with check (true);
create policy p_ca_human on clara.close_attestations
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_attestations to clara_authenticated;
grant select on clara.close_attestations to clara_agent_ro;

-- =====================================================================================
-- S3 -- clara.close_write_permits: the wall's permit (skeleton §2.5). A ROW this
-- transaction created -- NEVER session state (the GUC and pg_locks instruments are
-- deliberately absent: both are caller-settable, measured at design time), NEVER xmin
-- (the §2.3 subtransaction trap: a row written inside begin…exception carries the
-- SUBxact's xid while pg_current_xact_id() returns the top-level one).
-- =====================================================================================
create table clara.close_write_permits (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  client_id        uuid        not null,
  fiscal_year_id   uuid        not null,
  close_run_id     uuid        not null,
  purpose          text        not null check (purpose in ('close_entry', 'reopen_reversal')),
  target_entry_id  uuid,
  entries_expected int         not null check (entries_expected >= 1),
  entries_used     int         not null default 0
                     check (entries_used >= 0 and entries_used <= entries_expected),
  created_xact     xid8        not null default pg_current_xact_id(),
  created_at       timestamptz not null default now(),
  constraint ck_cwp_target check ((purpose = 'reopen_reversal') = (target_entry_id is not null)),
  constraint fk_cwp_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  constraint fk_cwp_fy foreign key (fiscal_year_id, firm_id)
    references clara.fiscal_years (id, firm_id),
  constraint fk_cwp_run foreign key (close_run_id, firm_id)
    references clara.close_runs (id, firm_id)
);
create index ix_cwp_xact on clara.close_write_permits (created_xact, client_id);

-- INSERT-ONCE WITH EXACTLY ONE MUTABLE COLUMN: entries_used moves UPWARD only; every other
-- column and DELETE refuse. The increment cannot contend -- the row is invisible to every
-- other session until this transaction commits (and by then the permit is spent history).
create function clara._tf_cwp_consume_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.entries_used < old.entries_used
     or new.id               is distinct from old.id
     or new.firm_id          is distinct from old.firm_id
     or new.client_id        is distinct from old.client_id
     or new.fiscal_year_id   is distinct from old.fiscal_year_id
     or new.close_run_id     is distinct from old.close_run_id
     or new.purpose          is distinct from old.purpose
     or new.target_entry_id  is distinct from old.target_entry_id
     or new.entries_expected is distinct from old.entries_expected
     or new.created_xact     is distinct from old.created_xact
     or new.created_at       is distinct from old.created_at then
    raise exception 'a close-write permit admits exactly one update: consuming entries_used, upward'
      using errcode = 'CLR19', detail = '{"reason":"write_into_closed_period"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_cwp_consume_only() from public;
create trigger t_cwp_consume_only before update on clara.close_write_permits
  for each row execute function clara._tf_cwp_consume_only();
create trigger t_cwp_no_delete before delete on clara.close_write_permits
  for each row execute function clara._tf_append_only();
create trigger t_cwp_no_truncate before truncate on clara.close_write_permits
  for each statement execute function clara._tf_no_truncate();

-- UNGRANTED TO EVERY APP ROLE -- forged permits die here (matrix A19c asserts INSERT is
-- FALSE by has_table_privilege under every role). Owner policy only; forced RLS.
alter table clara.close_write_permits enable row level security;
alter table clara.close_write_permits force row level security;
create policy p_cwp_owner on clara.close_write_permits
  for all to clara_fn_owner using (true) with check (true);

-- =====================================================================================
-- S4 -- THE CLOSED-PERIOD WALL: a TRIGGER FAMILY, not N writer recuts (skeleton §2.5;
-- the most consequential builder choice in the design). Two jobs, separated:
-- SERIALIZATION (nothing that feeds a gate moves while a close measures) and REFUSAL
-- (no approved posting lands in a closing/closed FY). Every trigger's FIRST act is the
-- SHARED form of the close rung -- 007 is the BOTTOM of every path's lock order.
-- =====================================================================================

-- (A) THE JE WALL -- serialize AND refuse. SECURITY DEFINER because it must be: it reads
-- fiscal_years and close_write_permits, both FORCE-RLS with owner-only policies -- an
-- invoker-context trigger would see zero rows and PERMIT EVERYTHING (the same silent
-- fail-open A6e guards against on the definer-read side).
create function clara._tf_period_wall() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_permit record; v_approved_touch boolean;
begin
  -- (1) SERIALIZE, unconditionally and FIRST: a conditional acquisition re-opens the race
  -- it exists to close. Advisory xact locks are REENTRANT, so a multi-row statement holds
  -- ONE lock object per (transaction, client) -- the cost is one lock-manager lookup per
  -- row, priced in the design.
  perform pg_advisory_xact_lock_shared(203005007, hashtext(new.client_id::text));

  -- (2) The FY containing this row's posting_date (ix_fy_client_span). Zero rows at deploy
  -- ⇒ inert on arrival; the closed state wins if contiguity ever admitted two matches
  -- (a derived state a guard never rests on -- the §2.9 ordering, applied here too).
  select * into v_fy from clara.fiscal_years fy
    where fy.client_id = new.client_id
      and new.posting_date between fy.starts_on and fy.ends_on
    order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
    limit 1;
  if v_fy.id is null or v_fy.status in ('open', 'reopened') then
    return new;
  end if;

  -- (3) REFUSE only the approved-class touch: an INSERT arriving approved, an UPDATE that
  -- approves, or ANY touch of an already-approved row (deliberately no WHEN clause and no
  -- UPDATE OF list -- this is what refuses reverse_entry's reversed_by stamp on an original
  -- inside a closed FY, which is why §2.8's reopen ordering is REQUIRED, not incidental).
  v_approved_touch := (tg_op = 'INSERT' and new.status = 'approved')
                   or (tg_op = 'UPDATE' and (new.status = 'approved' or old.status = 'approved'));
  if not v_approved_touch then
    return new;
  end if;

  -- (4) THE PERMIT: a row THIS transaction created (created_xact = pg_current_xact_id() --
  -- a declared xid8, never xmin, never a GUC, never pg_locks; all three rejected with
  -- measurements in the design). The reopen_reversal arm matches on LINEAGE (the mirror's
  -- reversal_of, or the original's own id), never on an id the caller could plant on NEW:
  -- the permit row is unreachable to callers (no grant, forced RLS), so the fact is
  -- unforgeable.
  select * into v_permit from clara.close_write_permits p
    where p.created_xact = pg_current_xact_id()
      and p.client_id = new.client_id
      and p.fiscal_year_id = v_fy.id
      and p.entries_used < p.entries_expected
      and (p.purpose = 'close_entry'
           or (p.purpose = 'reopen_reversal'
               and (new.reversal_of = p.target_entry_id or new.id = p.target_entry_id)))
    order by p.created_at
    limit 1
    for update;
  if v_permit.id is null then
    raise exception 'fiscal year % (% to %) is %; an approved posting dated % may not enter it -- the formal reopen path (reopen_fiscal_year, key 3) is the one way back in', v_fy.label, v_fy.starts_on, v_fy.ends_on, v_fy.status, new.posting_date
      using errcode = 'CLR19',
        detail = jsonb_build_object('reason', 'write_into_closed_period',
          'fiscal_year_id', v_fy.id, 'fy_status', v_fy.status,
          'posting_date', new.posting_date, 'entry_id', new.id)::text;
  end if;

  -- (5) CONSUME in the same transaction -- the counter IS the consumption identity. A write
  -- beyond entries_expected refuses above like any other; a rolled-back subtransaction
  -- rolls its increment back with the write it admitted (fail-closed, no orphaned
  -- consumption -- the §2.3 interaction, stated in the design).
  update clara.close_write_permits set entries_used = entries_used + 1
    where id = v_permit.id;
  return new;
end $$;
revoke all on function clara._tf_period_wall() from public;

create trigger t_period_wall before insert or update on clara.journal_entries
  for each row execute function clara._tf_period_wall();

-- (A2) THE LINES SIBLING: a line whose PARENT entry sits in a closing/closed FY refuses
-- mutation -- unless the parent's admission stands in this same transaction. The permit is
-- CONSULTED, never consumed here: entries_expected counts ENTRY touches, and a line rides
-- its entry's admission (the existence test on created_xact is the same unforgeable fact).
create function clara._tf_period_wall_lines() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_row record; v_entry record; v_fy record; v_n int;
begin
  v_row := coalesce(new, old);
  select je.id, je.client_id, je.posting_date, je.status, je.reversal_of into v_entry
    from clara.journal_entries je where je.id = v_row.entry_id;
  if v_entry.id is null then
    return coalesce(new, old);   -- the FK owns absent-parent refusal; nothing to wall
  end if;
  perform pg_advisory_xact_lock_shared(203005007, hashtext(v_entry.client_id::text));
  select * into v_fy from clara.fiscal_years fy
    where fy.client_id = v_entry.client_id
      and v_entry.posting_date between fy.starts_on and fy.ends_on
    order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
    limit 1;
  if v_fy.id is null or v_fy.status in ('open', 'reopened') then
    return coalesce(new, old);
  end if;
  select count(*) into v_n from clara.close_write_permits p
    where p.created_xact = pg_current_xact_id()
      and p.client_id = v_entry.client_id
      and p.fiscal_year_id = v_fy.id
      and (p.purpose = 'close_entry'
           or (p.purpose = 'reopen_reversal'
               and (v_entry.reversal_of = p.target_entry_id or v_entry.id = p.target_entry_id)));
  if v_n = 0 then
    raise exception 'entry % sits in % fiscal year %; its lines may not change -- the formal reopen path is the one way back in', v_entry.id, v_fy.status, v_fy.label
      using errcode = 'CLR19',
        detail = jsonb_build_object('reason', 'write_into_closed_period',
          'fiscal_year_id', v_fy.id, 'fy_status', v_fy.status, 'entry_id', v_entry.id)::text;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function clara._tf_period_wall_lines() from public;

create trigger t_period_wall_lines before insert or update or delete on clara.journal_lines
  for each row execute function clara._tf_period_wall_lines();

-- (B) THE GATE-EVIDENCE WALLS -- serialize ONLY, on the FIVE tables a drawer-1 gate reads
-- (the same list §2.11's staleness triggers cover -- one list, two duties; a table on one
-- list and not the other is the shape of both defects). These do NOT test FY status: E-R2's
-- phrase is a close-WINDOW property ("no writer escapes into the FY MID-CLOSE"), which the
-- shared lock delivers whole. The honest residual the design prices: a gate-evidence write
-- dated into an ALREADY-closed FY is caught by verify_close's recompute and by staleness,
-- never refused here -- extending refusal needs a per-table act-date rule, out of scope
-- for E.
create function clara._tf_close_serialize() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform pg_advisory_xact_lock_shared(203005007,
    hashtext(coalesce(new.client_id, old.client_id)::text));
  return coalesce(new, old);
end $$;
revoke all on function clara._tf_close_serialize() from public;

create trigger t_close_serialize before insert or update or delete on clara.open_item_allocations
  for each row execute function clara._tf_close_serialize();
create trigger t_close_serialize before insert or update or delete on clara.bank_statements
  for each row execute function clara._tf_close_serialize();
create trigger t_close_serialize before insert or update or delete on clara.bank_reconciliations
  for each row execute function clara._tf_close_serialize();
create trigger t_close_serialize before insert or update or delete on clara.bank_line_exceptions
  for each row execute function clara._tf_close_serialize();
create trigger t_close_serialize before insert or update or delete on clara.fixed_assets
  for each row execute function clara._tf_close_serialize();

-- =====================================================================================
-- S5 -- THE DRAWER-1 PROBES (skeleton §2.3). Every probe: measure with the instrument
-- production uses, resolve through the resolver the writers use, and fail CLOSED on
-- unknown/error -- a probe that could not be evaluated has not passed (E-R2).
-- =====================================================================================

-- clara._control_tie_core -- the shared AR/AP tie. The SUBLEDGER side calls _aging_core
-- (0040's instrument -- the one production aging reads; re-summing open_items by hand is how
-- two "correct" numbers disagree). The GL side resolves the control account with the SAME
-- semantics as _allocate_*_core's resolver (0044:1169-1188: account_class match + is_active;
-- exactly ONE or the resolution is not a resolution): zero or plural class accounts ⇒ state
-- 'unknown', never 'tie' -- the composite refuses to PICK for the same reason this probe
-- refuses to GUESS. GL balance = Σ(debit−credit) over approved entries dated <= as_of on the
-- resolved account (fa_register_tie's own predicate shape).
create function clara._control_tie_core(p_client uuid, p_domain text, p_as_of date)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_class text; v_n int; v_ctrl text;
  v_gl bigint; v_sub bigint;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'client_unknown',
      'domain', p_domain, 'as_of', p_as_of);
  end if;
  v_class := case p_domain when 'ar' then 'receivable' when 'ap' then 'payable' end;
  select count(*)::int, min(a.account_code) into v_n, v_ctrl
    from clara.coa_accounts a
    where a.client_id = p_client and a.account_class = v_class and a.is_active;
  if v_n <> 1 then
    return jsonb_build_object('state', 'unknown', 'reason', 'control_not_resolvable',
      'domain', p_domain, 'as_of', p_as_of, 'control_account_count', v_n,
      'control_accounts', coalesce((select jsonb_agg(a.account_code order by a.account_code)
         from clara.coa_accounts a
         where a.client_id = p_client and a.account_class = v_class and a.is_active), '[]'::jsonb));
  end if;
  select coalesce(sum(jl.debit_cents - jl.credit_cents), 0) into v_gl
    from clara.journal_lines jl
    join clara.journal_entries je on je.id = jl.entry_id
    where je.client_id = p_client and je.status = 'approved'
      and je.posting_date <= p_as_of and jl.account_code = v_ctrl;
  v_sub := coalesce(((clara._aging_core(v_firm, p_client, p_domain, p_as_of)
             -> 'totals') ->> 'total_cents')::bigint, 0);
  -- AP sign convention: the aging totals are OUTSTANDING (positive = owed), while the GL
  -- payable control carries a CREDIT balance (negative under debit−credit). Compare like
  -- with like by negating the GL side for 'ap'.
  if p_domain = 'ap' then v_gl := -v_gl; end if;
  return jsonb_build_object(
    'state', case when v_gl = v_sub then 'tie' else 'mismatch' end,
    'domain', p_domain, 'as_of', p_as_of,
    'control_accounts', jsonb_build_array(v_ctrl),
    'gl_cents', v_gl, 'subledger_cents', v_sub, 'diff_cents', v_gl - v_sub);
end $$;
revoke all on function clara._control_tie_core(uuid, text, date) from public;

create function clara.ar_control_tie(p_client uuid, p_as_of date) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as
  $$ select clara._control_tie_core(p_client, 'ar', p_as_of) $$;
revoke all on function clara.ar_control_tie(uuid, date) from public;

create function clara.ap_control_tie(p_client uuid, p_as_of date) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as
  $$ select clara._control_tie_core(p_client, 'ap', p_as_of) $$;
revoke all on function clara.ap_control_tie(uuid, date) from public;

-- clara.fa_control_tie_out -- the SEGMENT-AWARE FA tie 0041:4250-4256 deferred by name to
-- this campaign. The close segment is (fy.starts_on, fy.ends_on] and the identity is the
-- SEGMENT MOVEMENT measured on both sides: the register's movement (live depreciation rows
-- effective in the segment + acquisitions dated in it) against the GL's movement on exactly
-- the account codes the register itself names. The OPENING side is reported with its source
-- -- the PRIOR receipt's pinned fa roll where one exists, else the register baseline --
-- never re-derived when a pin exists (ARCHITECTURE §3.6 F12-1: an opening restatement
-- counted in FY(n) must not double-count in FY(n+1)). fa_register_tie is NOT touched: it
-- stays visibility-only per WD-R1 (its prosrc is tail-asserted unchanged), and its
-- non-blocking view feeds drawer 3.
create function clara.fa_control_tie_out(p_client uuid, p_fiscal_year_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_codes text[]; v_reg_move bigint; v_gl_move bigint;
  v_opening jsonb; v_opening_src text;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fiscal_year_id;
  if v_fy.id is null or v_fy.client_id <> p_client then
    return jsonb_build_object('state', 'unknown', 'reason', 'fiscal_year_unknown');
  end if;
  -- The account universe is the REGISTER's own: every asset/accum code a non-superseded
  -- asset of this client names. No assets ⇒ the identity is vacuously a tie at zero, and
  -- says so rather than being silently green.
  select coalesce(array_agg(distinct c), '{}') into v_codes from (
    select fa.asset_account_code as c from clara.fixed_assets fa
      where fa.client_id = p_client and fa.superseded_at is null
    union
    select fa.accum_depr_account_code from clara.fixed_assets fa
      where fa.client_id = p_client and fa.superseded_at is null) u;
  if array_length(v_codes, 1) is null then
    return jsonb_build_object('state', 'tie', 'vacuous', true, 'reason', 'no_enrolled_assets',
      'fiscal_year_id', p_fiscal_year_id, 'register_movement_cents', 0, 'gl_movement_cents', 0,
      'diff_cents', 0);
  end if;
  -- Register movement inside the segment: live depreciation effective in it (sign: accum
  -- credit reduces NBV) net of acquisitions dated in it (cost enters NBV).
  select coalesce((select sum(fa.cost_cents) from clara.fixed_assets fa
            where fa.client_id = p_client and fa.superseded_at is null
              and fa.acquired_date > v_fy.starts_on - 1 and fa.acquired_date <= v_fy.ends_on), 0)
       - coalesce((select sum(d.amount_cents) from clara.fa_depreciation d
            where d.client_id = p_client and d.is_live
              and d.effective_date > v_fy.starts_on - 1 and d.effective_date <= v_fy.ends_on), 0)
    into v_reg_move;
  select coalesce(sum(jl.debit_cents - jl.credit_cents), 0) into v_gl_move
    from clara.journal_lines jl
    join clara.journal_entries je on je.id = jl.entry_id
    where je.client_id = p_client and je.status = 'approved'
      and je.posting_date > v_fy.starts_on - 1 and je.posting_date <= v_fy.ends_on
      and jl.account_code = any (v_codes);
  -- The opening side, with its SOURCE named: the prior receipt's pin when one exists.
  select cr.snapshot -> 'fa_roll' into v_opening
    from clara.close_receipts cr
    where cr.fiscal_year_id = v_fy.prior_fy_id and cr.status = 'active' and cr.kind = 'close'
    limit 1;
  v_opening_src := case when v_opening is not null then 'prior_receipt_pin'
                        else 'register_baseline' end;
  return jsonb_build_object(
    'state', case when v_reg_move = v_gl_move then 'tie' else 'mismatch' end,
    'fiscal_year_id', p_fiscal_year_id,
    'segment_start', v_fy.starts_on, 'segment_end', v_fy.ends_on,
    'account_codes', to_jsonb(v_codes),
    'register_movement_cents', v_reg_move, 'gl_movement_cents', v_gl_move,
    'diff_cents', v_reg_move - v_gl_move,
    'opening_source', v_opening_src, 'opening', coalesce(v_opening, 'null'::jsonb));
end $$;
revoke all on function clara.fa_control_tie_out(uuid, uuid) from public;

-- clara.bank_recon_close_state -- per BANK ACCOUNT: the latest COMPLETED reconciliation
-- whose period_end covers fy.ends_on, judged by verify_bank_reconciliation's STRICT half
-- ONLY ('verified' + 'diffs' -- recompute, never the stored row); the informational half
-- routes to drawer 3 untouched. A bank account with statements but NO covering completed
-- reconciliation is the UNKNOWN state -- drawer 1, fail-closed, no attestation path
-- (E-R2 `wave-e-contract.md:46-48`; the drawer-2 carve-out is unmatched LINES and a missing
-- STATEMENT, never a missing reconciliation).
create function clara.bank_recon_close_state(p_client uuid, p_fiscal_year_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_accounts jsonb := '[]'::jsonb; v_state text := 'tie';
  r record; v_verify jsonb; v_acct_state text;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fiscal_year_id;
  if v_fy.id is null or v_fy.client_id <> p_client then
    return jsonb_build_object('state', 'unknown', 'reason', 'fiscal_year_unknown');
  end if;
  for r in
    select s.bank_account_id,
           (select br.id from clara.bank_reconciliations br
             join clara.bank_statements st on st.id = br.statement_id
            where br.client_id = p_client and st.bank_account_id = s.bank_account_id
              and br.status = 'complete' and br.period_end >= v_fy.ends_on
            order by br.period_end asc, br.completed_at desc limit 1) as covering_recon
      from clara.bank_statements s
      where s.client_id = p_client and s.status <> 'void'
      group by s.bank_account_id
  loop
    if r.covering_recon is null then
      v_acct_state := 'unknown';
      v_verify := jsonb_build_object('reason', 'no_completed_reconciliation_covering_fy_end');
    else
      begin
        v_verify := clara.verify_bank_reconciliation(r.covering_recon);
        v_acct_state := case when (v_verify ->> 'verified')::boolean then 'tie'
                             else 'mismatch' end;
      exception when others then
        v_acct_state := 'error';
        v_verify := jsonb_build_object('reason', 'verify_raised', 'sqlstate', sqlstate,
          'message', sqlerrm);
      end;
    end if;
    v_accounts := v_accounts || jsonb_build_object(
      'bank_account_id', r.bank_account_id, 'reconciliation_id', r.covering_recon,
      'state', v_acct_state,
      'strict', case when v_verify ? 'verified'
                     then jsonb_build_object('verified', v_verify -> 'verified',
                                             'diffs', v_verify -> 'diffs')
                     else v_verify end,
      'informational', coalesce(v_verify -> 'informational', 'null'::jsonb));
    -- The FY-level state is the WORST account state: error/unknown dominate mismatch,
    -- mismatch dominates tie (fail-closed aggregation).
    if v_acct_state in ('unknown', 'error') then v_state := 'unknown';
    elsif v_acct_state = 'mismatch' and v_state <> 'unknown' then v_state := 'mismatch';
    end if;
  end loop;
  return jsonb_build_object('state', v_state, 'fiscal_year_id', p_fiscal_year_id,
    'as_of', v_fy.ends_on, 'accounts', v_accounts);
end $$;
revoke all on function clara.bank_recon_close_state(uuid, uuid) from public;

-- =====================================================================================
-- S6.0 -- EVENT TAXONOMY, six additive pairs (the 0024 §B idiom; the lane-α battery's
-- first catch made this structural: an unregistered type kills every emitting verb at the
-- spine). All 'ignore': no consumer is designed in E (surfaces read tables; wake classes
-- are owner-ruled acts, never ride-alongs).
-- =====================================================================================
with added(name, client_scoped, description, decision, note) as (values
  ('fiscal_year.opened',   true, 'A fiscal year was opened',                    'ignore', 'human period act; no designed consumer in E'),
  ('close.begun',          true, 'A close run began (gates evaluated)',         'ignore', 'human close act; readiness is read from tables'),
  ('close.attested',       true, 'A drawer-2 gate exception was attested',      'ignore', 'human attestation; bound to its digest in-table'),
  ('close.finalized',      true, 'A fiscal year was closed (receipt minted)',   'ignore', 'the receipt row is the record; no router wake'),
  ('close.abandoned',      true, 'A close run was abandoned (FY back to open)', 'ignore', 'stamped on the run row; no router wake'),
  ('fiscal_year.reopened', true, 'A closed fiscal year was formally reopened',  'ignore', 'key-3 act; the reopen receipt is the record')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- =====================================================================================
-- S6.1 -- E-R11: THE THREE KEYS AS DB OBJECTS (skeleton §2.10; placed before the verbs
-- that consult them). Key ① (prepare) is the existing bookkeeper floor and needs no new
-- object. Factory default: OWNER ONLY -- CONFIRMED by the owner 2026-08-09; a partner who
-- is not the firm owner joins by explicit audited grant.
-- =====================================================================================
create table clara.firm_capability_grants (
  id         uuid        primary key default gen_random_uuid(),
  firm_id    uuid        not null references clara.firms(id),
  user_id    uuid        not null references clara.users(id),
  capability text        not null check (capability in ('close_and_attest', 'reopen')),
  granted_by uuid        not null references clara.users(id),
  granted_at timestamptz not null default now(),
  reason     text        not null check (btrim(reason) <> ''),
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,
  constraint ck_fcg_revoke_paired check ((revoked_by is null) = (revoked_at is null))
);
create unique index uq_capability_active on clara.firm_capability_grants
  (firm_id, user_id, capability) where revoked_at is null;

-- Append-only in spirit: the ONE update is the revoke stamp; history is permanent.
create function clara._tf_fcg_revoke_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.revoked_at is not null then
    raise exception 'a revoked capability grant is immutable'
      using errcode = 'CLR10', detail = '{"reason":"capability_grant_immutable"}';
  end if;
  if new.revoked_by is null or new.revoked_at is null
     or new.id         is distinct from old.id
     or new.firm_id    is distinct from old.firm_id
     or new.user_id    is distinct from old.user_id
     or new.capability is distinct from old.capability
     or new.granted_by is distinct from old.granted_by
     or new.granted_at is distinct from old.granted_at
     or new.reason     is distinct from old.reason then
    raise exception 'a capability grant admits exactly one update: the revoke stamp'
      using errcode = 'CLR10', detail = '{"reason":"capability_grant_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_fcg_revoke_only() from public;
create trigger t_fcg_revoke_only before update on clara.firm_capability_grants
  for each row execute function clara._tf_fcg_revoke_only();
create trigger t_fcg_no_delete before delete on clara.firm_capability_grants
  for each row execute function clara._tf_append_only();
create trigger t_fcg_no_truncate before truncate on clara.firm_capability_grants
  for each statement execute function clara._tf_no_truncate();
alter table clara.firm_capability_grants enable row level security;
alter table clara.firm_capability_grants force row level security;
create policy p_fcg_owner on clara.firm_capability_grants
  for all to clara_fn_owner using (true) with check (true);
create policy p_fcg_human on clara.firm_capability_grants
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.firm_capability_grants to clara_authenticated;

-- The resolver: an active grant, OR the caller's active membership role is the LITERAL
-- 'owner' (the factory default -- adjustable in this one predicate).
create function clara._has_capability(p_firm uuid, p_user uuid, p_capability text)
  returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.firm_capability_grants g
      where g.firm_id = p_firm and g.user_id = p_user
        and g.capability = p_capability and g.revoked_at is null)
  or exists (
    select 1 from clara.firm_memberships m
      where m.firm_id = p_firm and m.user_id = p_user
        and m.status = 'active' and m.role = 'owner');
$$;
revoke all on function clara._has_capability(uuid, uuid, text) from public;

-- Grant/revoke: the floor is the caller's active membership role being the LITERAL 'owner'
-- -- never role_rank (E-R11: firm-owner-only grant/revoke; every grant an audited act).
create function clara.grant_firm_capability(
    p_user uuid, p_capability text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));  -- identity only; the REAL floor is below
  if not exists (select 1 from clara.firm_memberships m
                  where m.firm_id = c.firm and m.user_id = c.actor
                    and m.status = 'active' and m.role = 'owner') then
    raise exception 'only the firm owner may grant a signing capability'
      using errcode = 'CLR04', detail = '{"reason":"capability_missing","capability":"owner"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_capability is null or p_capability not in ('close_and_attest', 'reopen') then
    raise exception 'capability must be close_and_attest or reopen'
      using errcode = 'CLR10', detail = '{"reason":"fact_key_unknown"}';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a capability grant requires its reason'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  if not exists (select 1 from clara.firm_memberships m
                  where m.firm_id = c.firm and m.user_id = p_user and m.status = 'active') then
    raise exception 'the grantee holds no active membership of this firm'
      using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'grant_firm_capability', p_op_key,
    clara._hash(jsonb_build_object('user', p_user, 'capability', p_capability,
      'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.firm_capability_grants(firm_id, user_id, capability, granted_by, reason)
    values (c.firm, p_user, p_capability, c.actor, p_reason)
    returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'grant_firm_capability', null,
    jsonb_build_object('grant_id', v_id, 'user', p_user, 'capability', p_capability,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'grant_firm_capability', p_op_key,
    jsonb_build_object('grant_id', v_id, 'user_id', p_user, 'capability', p_capability,
      'granted_by', c.actor, 'granted_at', now()));
end $$;
alter function clara.grant_firm_capability(uuid, text, text, text) owner to clara_fn_owner;
revoke all on function clara.grant_firm_capability(uuid, text, text, text) from public;
grant execute on function clara.grant_firm_capability(uuid, text, text, text)
  to clara_authenticated;

create function clara.revoke_firm_capability(
    p_user uuid, p_capability text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if not exists (select 1 from clara.firm_memberships m
                  where m.firm_id = c.firm and m.user_id = c.actor
                    and m.status = 'active' and m.role = 'owner') then
    raise exception 'only the firm owner may revoke a signing capability'
      using errcode = 'CLR04', detail = '{"reason":"capability_missing","capability":"owner"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a capability revoke requires its reason'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'revoke_firm_capability', p_op_key,
    clara._hash(jsonb_build_object('user', p_user, 'capability', p_capability,
      'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  update clara.firm_capability_grants g
     set revoked_by = c.actor, revoked_at = now(), revoke_reason = p_reason
   where g.firm_id = c.firm and g.user_id = p_user
     and g.capability = p_capability and g.revoked_at is null
   returning g.id into v_id;
  if v_id is null then
    raise exception 'no active % grant exists for this user', p_capability
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'revoke_firm_capability', null,
    jsonb_build_object('grant_id', v_id, 'user', p_user, 'capability', p_capability,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'revoke_firm_capability', p_op_key,
    jsonb_build_object('grant_id', v_id, 'user_id', p_user, 'capability', p_capability,
      'revoked_by', c.actor, 'revoked_at', now()));
end $$;
alter function clara.revoke_firm_capability(uuid, text, text, text) owner to clara_fn_owner;
revoke all on function clara.revoke_firm_capability(uuid, text, text, text) from public;
grant execute on function clara.revoke_firm_capability(uuid, text, text, text)
  to clara_authenticated;

-- =====================================================================================
-- S6.2 -- THE DRAWER-2 GATE EVALUATORS (skeleton §2.4's five named checks) + the trade-
-- nature fact key their applicability reads. Each returns jsonb {state, measured...};
-- state ∈ pass|fail|unknown -- and per E-R2, an UNKNOWN drawer-2 state is refuse-
-- attestable, never "not applicable" (an unknown trade nature is not evidence of a
-- service business).
-- =====================================================================================

-- The applicability fact (§2.4: "the applicability test is itself a fact question --
-- applies_when reads client_facts"). Enters through the SAME audited door 0055 built.
insert into clara.client_fact_keys (fact_key, validated_against, allowed_values, description) values
  ('trade_nature', 'enum:TRADE_NATURE_V1',
   '["goods_trading","services","mixed"]'::jsonb,
   'Whether the client trades goods (drives the closing-stock close gate, WD-R11/E-R2). '
   || 'Captured through record_client_fact with who/basis/when like every client fact; '
   || 'ABSENT means the closing-stock gate reads UNKNOWN and refuses attestably -- an '
   || 'unknown trade nature is not evidence of a service business (skeleton §2.4).');

create function clara._close_gate_depreciation(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_lagging jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- An enrolled, undisposed asset whose live depreciation has not reached FY end is lagging.
  select coalesce(jsonb_agg(jsonb_build_object(
           'asset_id', fa.id, 'description', fa.description,
           'depreciated_through', l.through, 'fy_ends_on', v_fy.ends_on)
         order by fa.id), '[]'::jsonb)
    into v_lagging
    from clara.fixed_assets fa
    left join lateral (
      select max(d.period_end) as through from clara.fa_depreciation d
        where d.asset_id = fa.id and d.is_live) l on true
    where fa.client_id = p_client and fa.superseded_at is null and fa.disposed_at is null
      and fa.depreciation_start_date is not null
      and fa.depreciation_start_date <= v_fy.ends_on
      and coalesce(l.through, fa.depreciation_start_date - 1) < v_fy.ends_on;
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_lagging) = 0 then 'pass' else 'fail' end,
    'lagging_assets', v_lagging);
end $$;
revoke all on function clara._close_gate_depreciation(uuid, uuid) from public;

create function clara._close_gate_closing_stock(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_nature text; v_present boolean;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  select cf.fact_value #>> '{}' into v_nature from clara.client_facts cf
    where cf.client_id = p_client and cf.fact_key = 'trade_nature'
      and cf.superseded_at is null;
  if v_nature is null then
    return jsonb_build_object('state', 'unknown', 'reason', 'trade_nature_fact_absent');
  end if;
  if v_nature = 'services' then
    return jsonb_build_object('state', 'pass', 'reason', 'not_goods_trading',
      'trade_nature', v_nature);
  end if;
  -- THE v1 MARKER CONTRACT, stated: the WD-R11 closing-stock entry carries
  -- flags ? 'closing_stock' (the Section-B fixture and the future closing-stock verb both
  -- write it). A goods-trader with no such approved entry dated in the FY fails this gate.
  select exists (select 1 from clara.journal_entries je
                  where je.client_id = p_client and je.status = 'approved'
                    and je.posting_date between v_fy.starts_on and v_fy.ends_on
                    and je.flags ? 'closing_stock') into v_present;
  return jsonb_build_object(
    'state', case when v_present then 'pass' else 'fail' end,
    'trade_nature', v_nature, 'closing_stock_entry_present', v_present,
    'fy_starts_on', v_fy.starts_on, 'fy_ends_on', v_fy.ends_on);
end $$;
revoke all on function clara._close_gate_closing_stock(uuid, uuid) from public;

create function clara._close_gate_drafts(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_drafts jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', je.id,
           'posting_date', je.posting_date, 'memo', left(coalesce(je.memo, ''), 80))
         order by je.posting_date, je.id), '[]'::jsonb)
    into v_drafts
    from clara.journal_entries je
    where je.client_id = p_client and je.status = 'draft'
      and je.posting_date between v_fy.starts_on and v_fy.ends_on;
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_drafts) = 0 then 'pass' else 'fail' end,
    'draft_count', jsonb_array_length(v_drafts), 'drafts', v_drafts);
end $$;
revoke all on function clara._close_gate_drafts(uuid, uuid) from public;

create function clara._close_gate_bank_items(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_exceptions jsonb; v_gaps jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- OPEN exceptions (the doors: except_bank_line / resolve_bank_line_exception).
  select coalesce(jsonb_agg(jsonb_build_object('exception_id', e.id,
           'statement_id', e.statement_id, 'line_id', e.line_id, 'kind', e.kind)
         order by e.created_at), '[]'::jsonb)
    into v_exceptions
    from clara.bank_line_exceptions e
    where e.client_id = p_client and e.resolved_at is null;
  -- Statement GAPS: a month inside the FY with no non-void statement covering any part of
  -- it, for an account that has statements at all.
  select coalesce(jsonb_agg(jsonb_build_object('bank_account_id', g.bank_account_id,
           'month', to_char(g.m, 'YYYY-MM')) order by g.bank_account_id, g.m), '[]'::jsonb)
    into v_gaps
    from (
      select a.bank_account_id, m.m
        from (select distinct s.bank_account_id from clara.bank_statements s
               where s.client_id = p_client and s.status <> 'void') a
        cross join (select generate_series(date_trunc('month', v_fy.starts_on),
                             date_trunc('month', v_fy.ends_on), interval '1 month')::date as m) m
        where not exists (select 1 from clara.bank_statements s2
                where s2.client_id = p_client and s2.bank_account_id = a.bank_account_id
                  and s2.status <> 'void'
                  and s2.period_start <= (m.m + interval '1 month - 1 day')::date
                  and s2.period_end >= m.m)) g;
  -- v1 BOUNDARY, stated: unmatched-but-unexcepted LINES are not enumerated here (the match
  -- linkage is not line-keyed in the live schema); the exception doors are the lines'
  -- escalation surface and the covering-reconciliation identity (drawer 1) bounds the
  -- residual. Recorded for the as-run record, not discovered later.
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_exceptions) = 0
                    and jsonb_array_length(v_gaps) = 0 then 'pass' else 'fail' end,
    'open_exceptions', v_exceptions, 'statement_gaps', v_gaps,
    'unmatched_lines_basis', 'exceptions_and_gaps_v1');
end $$;
revoke all on function clara._close_gate_bank_items(uuid, uuid) from public;

create function clara._close_gate_uncoded(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_fy record; v_uncoded jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- DATE-SCOPED BY THE BUILD (matrix A27: the live reader list_uncoded_filings has NO date
  -- predicate, so the gate scopes by the document's financial_date -- a NEXT-FY document
  -- must never block THIS year's close). The definer body performs its own client filter;
  -- it inherits nothing from the invoker-posture reader.
  select coalesce(jsonb_agg(jsonb_build_object('filing_id', f.id, 'document_id', f.document_id,
           'financial_date', d.financial_date) order by d.financial_date, f.id), '[]'::jsonb)
    into v_uncoded
    from clara.document_filings f
    join clara.documents d on d.id = f.document_id
    where f.client_id = p_client and f.retired_at is null
      and d.financial_date between v_fy.starts_on and v_fy.ends_on
      and not exists (select 1 from clara.journal_entries je
             where je.document_id = f.document_id and je.client_id = p_client
               and je.status in ('draft', 'approved'))
  ;
  return jsonb_build_object(
    'state', case when jsonb_array_length(v_uncoded) = 0 then 'pass' else 'fail' end,
    'uncoded_count', jsonb_array_length(v_uncoded), 'uncoded', v_uncoded);
end $$;
revoke all on function clara._close_gate_uncoded(uuid, uuid) from public;

-- =====================================================================================
-- S6.3 -- THE GATE EVALUATION ENGINE: one pass over the catalog, every probe inside its
-- own begin…exception block (a raising probe records 'error', never aborts the close --
-- and error/unknown refuse exactly like fail/mismatch, E-R2). Results are APPEND-ONLY
-- rows; measured_digest is the attestation's binding target.
-- =====================================================================================
create function clara._evaluate_close_gates(p_run uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_run record; v_fy record; chk record; v_measured jsonb; v_state text;
  v_summary jsonb := '[]'::jsonb; v_nature text;
begin
  select * into v_run from clara.close_runs r where r.id = p_run;
  select * into v_fy from clara.fiscal_years fy where fy.id = v_run.fiscal_year_id;
  for chk in select * from clara.close_gate_checks order by drawer, check_key loop
    -- Applicability: 'goods_trading' checks apply unless the trade_nature fact POSITIVELY
    -- says services -- an ABSENT fact keeps the check applicable (its evaluator then reads
    -- 'unknown', which refuses attestably; skipping on absence would be absence-as-evidence).
    if chk.applies_when = 'goods_trading' then
      select cf.fact_value #>> '{}' into v_nature from clara.client_facts cf
        where cf.client_id = v_run.client_id and cf.fact_key = 'trade_nature'
          and cf.superseded_at is null;
      if v_nature = 'services' then continue; end if;
    end if;
    begin
      v_measured := case chk.check_key
        when 'ar_control_tie'            then clara.ar_control_tie(v_run.client_id, v_fy.ends_on)
        when 'ap_control_tie'            then clara.ap_control_tie(v_run.client_id, v_fy.ends_on)
        when 'fa_control_tie'            then clara.fa_control_tie_out(v_run.client_id, v_fy.id)
        when 'bank_recon_identity'       then clara.bank_recon_close_state(v_run.client_id, v_fy.id)
        when 'bank_recon_informational'  then clara.bank_recon_close_state(v_run.client_id, v_fy.id) -> 'accounts' -> 0
        when 'fa_register_tie_view'      then clara.fa_register_tie(v_run.client_id, v_fy.ends_on)
        when 'pl_retained_earnings_roll' then jsonb_build_object('state', 'pass', 'note', 'computed in finalize_close under the lock')
        when 'opening_continuity_tie'    then jsonb_build_object('state', 'pass', 'note', 'asserted in finalize_close against the prior pin')
        when 'depreciation_through_fy_end' then clara._close_gate_depreciation(v_run.client_id, v_fy.id)
        when 'closing_stock_present'     then clara._close_gate_closing_stock(v_run.client_id, v_fy.id)
        when 'unapproved_drafts_in_period' then clara._close_gate_drafts(v_run.client_id, v_fy.id)
        when 'open_bank_recon_items'     then clara._close_gate_bank_items(v_run.client_id, v_fy.id)
        when 'uncoded_documents'         then clara._close_gate_uncoded(v_run.client_id, v_fy.id)
        else jsonb_build_object('state', 'error', 'reason', 'no_evaluator_wired')
      end;
      v_state := case
        when chk.drawer = 3 then 'advisory'
        when coalesce(v_measured ->> 'state', 'error') in ('tie', 'pass') then 'pass'
        when coalesce(v_measured ->> 'state', 'error') = 'mismatch' then 'fail'
        when coalesce(v_measured ->> 'state', 'error') = 'fail' then 'fail'
        when coalesce(v_measured ->> 'state', 'error') = 'unknown' then 'unknown'
        else 'error'
      end;
    exception when others then
      v_state := 'error';
      v_measured := jsonb_build_object('state', 'error', 'sqlstate', sqlstate,
        'message', sqlerrm);
    end;
    insert into clara.close_gate_results(firm_id, close_run_id, check_key, drawer,
        state, measured, measured_digest)
      values (v_run.firm_id, p_run, chk.check_key, chk.drawer, v_state,
        coalesce(v_measured, '{}'::jsonb), md5(coalesce(v_measured, '{}'::jsonb)::text));
    v_summary := v_summary || jsonb_build_object('check_key', chk.check_key,
      'drawer', chk.drawer, 'state', v_state);
  end loop;
  return v_summary;
end $$;
revoke all on function clara._evaluate_close_gates(uuid) from public;

-- =====================================================================================
-- S6.4a -- clara.close_receipts: the immutable output row, mirroring the 0040 bank-recon
-- triad (skeleton §2.7). The snapshot carries the enumerable evidence INCLUDING
-- closing_position -- the per-balance-sheet-account pin FY(n+1) asserts against; a receipt
-- without a readable pin is not a receipt this design can chain from, and the belt trigger
-- refuses it at write (enumeration completeness is the belt's job, 0040:296-298).
-- =====================================================================================
create table clara.close_receipts (
  id                      uuid        primary key default gen_random_uuid(),
  firm_id                 uuid        not null,
  client_id               uuid        not null,
  fiscal_year_id          uuid        not null,
  close_run_id            uuid        not null,
  prior_close_receipt_id  uuid        references clara.close_receipts(id),
  kind                    text        not null check (kind in ('close', 'reopen')),
  status                  text        not null default 'active'
                            check (status in ('active', 'superseded')),
  closed_by               uuid        not null references clara.users(id),
  closed_at               timestamptz not null default now(),
  segregation_mode        text        check (segregation_mode in ('two_person', 'solo_self_attested')),
  last_preparer_actor     uuid,
  self_attestation        text,
  pl_net_cents            bigint      not null,
  retained_earnings_account text      not null,
  closing_tb_digest       text        not null,
  gate_digest             text        not null,
  books_watermark         text        not null,
  evaluator_version_ids   uuid[]      not null default '{}',
  dataset_sha256          text        not null,
  close_entry_id          uuid        references clara.journal_entries(id),
  snapshot                jsonb       not null check (jsonb_typeof(snapshot) = 'object'),
  constraint uq_cr_id_firm unique (id, firm_id),
  constraint fk_cr_client foreign key (client_id, firm_id)
    references clara.clients (id, firm_id),
  constraint fk_cr_fy foreign key (fiscal_year_id, firm_id)
    references clara.fiscal_years (id, firm_id),
  constraint fk_cr_run foreign key (close_run_id, firm_id)
    references clara.close_runs (id, firm_id)
);
create index ix_cr_fy on clara.close_receipts (fiscal_year_id, status, closed_at desc);

-- The belt: a chainable receipt CARRIES ITS PIN -- refuse at write, not at the successor.
create function clara._tf_close_receipts_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if new.kind = 'close'
     and (new.snapshot -> 'closing_position' is null
          or jsonb_typeof(new.snapshot -> 'closing_position') <> 'object') then
    raise exception 'a close receipt must pin its closing_position (per balance-sheet account, in cents) -- a receipt without the pin cannot be chained from'
      using errcode = 'CLR41', detail = '{"reason":"drawer1_state_unknown"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_receipts_belt() from public;
create trigger t_cr_belt before insert on clara.close_receipts
  for each row execute function clara._tf_close_receipts_belt();

-- Immutability: the ONLY transition is active -> superseded (the reopen's act).
create function clara._tf_close_receipts_transition() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if not (old.status = 'active' and new.status = 'superseded') then
    raise exception 'a close receipt admits exactly one transition: active -> superseded (the formal reopen)'
      using errcode = 'CLR10', detail = '{"reason":"close_not_in_progress"}';
  end if;
  if new.id is distinct from old.id or new.firm_id is distinct from old.firm_id
     or new.client_id is distinct from old.client_id
     or new.fiscal_year_id is distinct from old.fiscal_year_id
     or new.close_run_id is distinct from old.close_run_id
     or new.prior_close_receipt_id is distinct from old.prior_close_receipt_id
     or new.kind is distinct from old.kind
     or new.closed_by is distinct from old.closed_by
     or new.closed_at is distinct from old.closed_at
     or new.segregation_mode is distinct from old.segregation_mode
     or new.last_preparer_actor is distinct from old.last_preparer_actor
     or new.self_attestation is distinct from old.self_attestation
     or new.pl_net_cents is distinct from old.pl_net_cents
     or new.retained_earnings_account is distinct from old.retained_earnings_account
     or new.closing_tb_digest is distinct from old.closing_tb_digest
     or new.gate_digest is distinct from old.gate_digest
     or new.books_watermark is distinct from old.books_watermark
     or new.evaluator_version_ids is distinct from old.evaluator_version_ids
     or new.dataset_sha256 is distinct from old.dataset_sha256
     or new.close_entry_id is distinct from old.close_entry_id
     or new.snapshot is distinct from old.snapshot then
    raise exception 'a close receipt''s content is immutable; only its status may move'
      using errcode = 'CLR10', detail = '{"reason":"close_not_in_progress"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_receipts_transition() from public;
create trigger t_cr_transition before update on clara.close_receipts
  for each row execute function clara._tf_close_receipts_transition();
create trigger t_cr_no_delete before delete on clara.close_receipts
  for each row execute function clara._tf_append_only();
create trigger t_cr_no_truncate before truncate on clara.close_receipts
  for each statement execute function clara._tf_no_truncate();
alter table clara.close_receipts enable row level security;
alter table clara.close_receipts force row level security;
create policy p_cr_owner on clara.close_receipts
  for all to clara_fn_owner using (true) with check (true);
create policy p_cr_human on clara.close_receipts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_receipts to clara_authenticated;

-- The lineage column on journal_entries (§2.6): LINEAGE ONLY, never authorization (§2.5).
-- DEFERRABLE, because the mutual FK resolves by BIRTH ORDER, not by a late UPDATE: the
-- closing entry is INSERTED already carrying its receipt's pre-generated id, and the
-- receipt row lands later in the same transaction (checked at commit). The x56 battery's
-- catch made this structural: the PRE-EXISTING _tf_entry_immutable trigger admits only the
-- reversal-linkage stamp on an approved entry, so the design's original
-- update-lineage-last order could never complete a real close -- and widening that
-- trigger's allow-list for a lineage column would open it to every definer body. The
-- trigger stays at full force; the claim is simply made at birth, where it is true.
alter table clara.journal_entries add column close_receipt_id uuid
  references clara.close_receipts(id) deferrable initially deferred;

-- =====================================================================================
-- S6.4b -- THE VERBS, part 1: propose / open / begin / attest / abandon.
-- =====================================================================================

-- A READ: {starts_on, ends_on, fy_end:{month,day,fallback}} -- the 0041:4244-4245 idiom
-- verbatim; propose NEVER authorizes (E-R3).
create function clara.propose_fiscal_year(p_client uuid, p_starts_on date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_m int; v_d int; v_fallback boolean; v_end date; v_y int;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  perform 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select coalesce(cl.fy_end_month, 12), coalesce(cl.fy_end_day, 31), cl.fy_end_month is null
    into v_m, v_d, v_fallback
    from clara.clients cl where cl.id = p_client;
  v_y := extract(year from p_starts_on)::int;
  -- The fy-end date on/after starts_on, day clamped to the month's length (Feb 29 safety).
  v_end := make_date(v_y, v_m, 1) + (least(v_d,
    extract(day from (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::int) - 1);
  if v_end < p_starts_on then
    v_end := make_date(v_y + 1, v_m, 1) + (least(v_d,
      extract(day from (make_date(v_y + 1, v_m, 1) + interval '1 month - 1 day'))::int) - 1);
  end if;
  return jsonb_build_object('starts_on', p_starts_on, 'ends_on', v_end,
    'fy_end', jsonb_build_object('month', v_m, 'day', v_d, 'fallback', v_fallback));
end $$;
alter function clara.propose_fiscal_year(uuid, date) owner to clara_fn_owner;
revoke all on function clara.propose_fiscal_year(uuid, date) from public;
grant execute on function clara.propose_fiscal_year(uuid, date) to clara_authenticated;

create function clara.open_fiscal_year(
    p_client uuid, p_label text, p_starts_on date, p_ends_on date,
    p_length_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_firm uuid; v_dedupe jsonb; v_months numeric; v_prior record;
  v_proposal jsonb; v_source text; v_id uuid; v_ordinal int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_label is null or btrim(p_label) = '' or p_starts_on is null or p_ends_on is null
     or p_ends_on < p_starts_on then
    raise exception 'a fiscal year needs a label and a valid date range'
      using errcode = 'CLR10', detail = '{"reason":"fy_range_invalid"}';
  end if;
  -- Outside 11-13 months ⇒ a stated reason (a data-level attestation, not a refusal);
  -- the 18-month structural bound is DDL (ck_fy_span) and refuses on its own.
  v_months := (extract(year from age(p_ends_on + 1, p_starts_on)) * 12
             + extract(month from age(p_ends_on + 1, p_starts_on)))::numeric;
  if (v_months < 11 or v_months > 13)
     and (p_length_reason is null or btrim(p_length_reason) = '') then
    raise exception 'a fiscal year spanning ~% months needs its length_reason stated', v_months
      using errcode = 'CLR10', detail = '{"reason":"fy_length_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'open_fiscal_year', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'label', p_label,
      'starts_on', p_starts_on, 'ends_on', p_ends_on, 'length_reason', p_length_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into v_prior from clara.fiscal_years fy
    where fy.client_id = p_client order by fy.ordinal desc limit 1;
  v_ordinal := coalesce(v_prior.ordinal, 0) + 1;
  -- The honesty label (matrix A23): 'default_1231' ONLY when the client's fy_end is unset
  -- AND the human accepted the proposal's fallback end unchanged; every other path is an
  -- assertion by the human.
  v_proposal := clara.propose_fiscal_year(p_client, p_starts_on);
  v_source := case when (v_proposal #>> '{fy_end,fallback}')::boolean
                    and p_ends_on = (v_proposal ->> 'ends_on')::date
                   then 'default_1231' else 'asserted' end;
  insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
      prior_fy_id, fy_end_source, length_reason, opened_by)
    values (c.firm, p_client, p_label, p_starts_on, p_ends_on, v_ordinal,
      v_prior.id, v_source, nullif(btrim(coalesce(p_length_reason, '')), ''), c.actor)
    returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'open_fiscal_year', null,
    jsonb_build_object('client', p_client, 'fiscal_year_id', v_id, 'ordinal', v_ordinal,
      'starts_on', p_starts_on, 'ends_on', p_ends_on, 'fy_end_source', v_source,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'fiscal_year.opened', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('fiscal_year_id', v_id, 'ordinal', v_ordinal));
  return clara._finish_op(c.firm, 'open_fiscal_year', p_op_key,
    jsonb_build_object('fiscal_year_id', v_id, 'ordinal', v_ordinal,
      'fy_end_source', v_source, 'starts_on', p_starts_on, 'ends_on', p_ends_on));
end $$;
alter function clara.open_fiscal_year(uuid, text, date, date, text, text)
  owner to clara_fn_owner;
revoke all on function clara.open_fiscal_year(uuid, text, date, date, text, text) from public;
grant execute on function clara.open_fiscal_year(uuid, text, date, date, text, text)
  to clara_authenticated;

create function clara.begin_close(p_fy uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_fy record; v_dedupe jsonb; v_run uuid; v_summary jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'closing a fiscal year takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'begin_close', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- LOCKS: 004 then 007-EXCLUSIVE -- the bottom rung, taken last (skeleton §2.1; no
  -- pre-existing row lock on this path, so this is a prefix of the house order). The
  -- exclusive take WAITS for every in-flight shared holder: close latency is a function of
  -- the slowest open writer, by design.
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  -- Re-read UNDER the lock: the status a concurrent close committed is now visible.
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status not in ('open', 'reopened') then
    raise exception 'fiscal year % is %; a close can begin only on an open or reopened year', v_fy.label, v_fy.status
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'close_already_in_progress',
          'fy_status', v_fy.status)::text;
  end if;
  update clara.fiscal_years set status = 'closing' where id = p_fy;
  insert into clara.close_runs(firm_id, client_id, fiscal_year_id, started_by)
    values (c.firm, v_fy.client_id, p_fy, c.actor)
    returning id into v_run;
  v_summary := clara._evaluate_close_gates(v_run);
  perform clara._audit(c.firm, c.actor, null, null, 'begin_close', null,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.begun', v_fy.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run));
  return clara._finish_op(c.firm, 'begin_close', p_op_key,
    jsonb_build_object('close_run_id', v_run, 'fiscal_year_id', p_fy, 'gates', v_summary));
end $$;
alter function clara.begin_close(uuid, text) owner to clara_fn_owner;
revoke all on function clara.begin_close(uuid, text) from public;
grant execute on function clara.begin_close(uuid, text) to clara_authenticated;

create function clara.attest_close_exception(
    p_close_run uuid, p_check_key text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_run record; v_chk record; v_result record; v_dedupe jsonb;
  v_prior uuid; v_new uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'attesting a close exception takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'an attestation requires its reason -- who accepts this and why'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.id is null or v_run.firm_id <> c.firm then
    raise exception 'close run not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  if v_run.state <> 'in_progress' then
    raise exception 'this close run is %; only an in-progress run takes attestations', v_run.state
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  -- THE ITEM DOMAIN IS DRAWER 2, STRUCTURALLY (matrix A25b asserts this refusal): a
  -- drawer-1 identity has NO attestation path, nobody, and drawer 3 needs none.
  select * into v_chk from clara.close_gate_checks k where k.check_key = p_check_key;
  if v_chk.check_key is null then
    raise exception 'unknown close gate %', p_check_key
      using errcode = 'CLR10', detail = '{"reason":"fact_key_unknown"}';
  end if;
  if v_chk.drawer <> 2 then
    raise exception 'gate % lives in drawer %; only drawer-2 items are attestable -- a drawer-1 identity has no override, for anybody', p_check_key, v_chk.drawer
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'drawer1_identity_failed',
          'check_key', p_check_key, 'drawer', v_chk.drawer)::text;
  end if;
  -- Bind to the LATEST measured state of this gate on this run (PRD invariant 8: the
  -- signature binds the exact revision signed).
  select * into v_result from clara.close_gate_results g
    where g.close_run_id = p_close_run and g.check_key = p_check_key
    order by g.evaluated_at desc, g.id desc limit 1;
  if v_result.id is null then
    raise exception 'gate % has no measured result on this run yet', p_check_key
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'attest_close_exception', p_op_key,
    clara._hash(jsonb_build_object('run', p_close_run, 'check', p_check_key,
      'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select a.id into v_prior from clara.close_attestations a
    where a.close_run_id = p_close_run and a.check_key = p_check_key
      and a.superseded_at is null
    for update;
  v_new := gen_random_uuid();
  if v_prior is not null then
    update clara.close_attestations
      set superseded_by = v_new, superseded_at = now() where id = v_prior;
  end if;
  insert into clara.close_attestations(id, firm_id, close_run_id, check_key,
      gate_result_id, attested_by, reason)
    values (v_new, c.firm, p_close_run, p_check_key, v_result.id, c.actor, p_reason);
  perform clara._audit(c.firm, c.actor, null, null, 'attest_close_exception', null,
    jsonb_build_object('close_run_id', p_close_run, 'check_key', p_check_key,
      'attestation_id', v_new, 'gate_result_id', v_result.id,
      'measured_digest', v_result.measured_digest, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.attested', v_run.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('close_run_id', p_close_run, 'check_key', p_check_key,
      'attestation_id', v_new));
  return clara._finish_op(c.firm, 'attest_close_exception', p_op_key,
    jsonb_build_object('attestation_id', v_new, 'check_key', p_check_key,
      'gate_result_id', v_result.id, 'measured_digest', v_result.measured_digest,
      'superseded_id', v_prior, 'attested_by', c.actor, 'attested_at', now(),
      'reason', p_reason));
end $$;
alter function clara.attest_close_exception(uuid, text, text, text) owner to clara_fn_owner;
revoke all on function clara.attest_close_exception(uuid, text, text, text) from public;
grant execute on function clara.attest_close_exception(uuid, text, text, text)
  to clara_authenticated;

create function clara.abandon_close(p_close_run uuid, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_run record; v_dedupe jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'abandoning a close takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'abandoning a close requires its reason'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.id is null or v_run.firm_id <> c.firm then
    raise exception 'close run not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'abandon_close', p_op_key,
    clara._hash(jsonb_build_object('run', p_close_run, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_run.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_run.client_id::text));
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.state <> 'in_progress' then
    raise exception 'this close run is already %', v_run.state
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  -- The ruled transition: closing -> open. STAMPED, never deleted (matrix A22); the wall
  -- disarms with the status flip, and a later begin_close mints a NEW run.
  update clara.close_runs
    set state = 'abandoned', ended_by = c.actor, ended_at = now(), end_reason = p_reason
    where id = p_close_run;
  update clara.fiscal_years set status = 'open' where id = v_run.fiscal_year_id;
  perform clara._audit(c.firm, c.actor, null, null, 'abandon_close', null,
    jsonb_build_object('close_run_id', p_close_run, 'fiscal_year_id', v_run.fiscal_year_id,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.abandoned', v_run.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('close_run_id', p_close_run, 'fiscal_year_id', v_run.fiscal_year_id));
  return clara._finish_op(c.firm, 'abandon_close', p_op_key,
    jsonb_build_object('close_run_id', p_close_run, 'state', 'abandoned',
      'fiscal_year_id', v_run.fiscal_year_id));
end $$;
alter function clara.abandon_close(uuid, text, text) owner to clara_fn_owner;
revoke all on function clara.abandon_close(uuid, text, text) from public;
grant execute on function clara.abandon_close(uuid, text, text) to clara_authenticated;

-- =====================================================================================
-- S6.4c -- clara.finalize_close: the heart of the close (skeleton §2.6). Everything under
-- the EXCLUSIVE lock, every numeral from DB-owned inputs (E-R4), the closing entry
-- authored IN BODY as a DRAFT and flipped by the census-VISIBLE UPDATE, the
-- closing_position PINNED into the receipt (matrix A19d/A19e/A19f, A12, A20, A1).
-- =====================================================================================
create function clara.finalize_close(p_fy uuid, p_self_attestation text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_fy record; v_run record; v_dedupe jsonb; g record;
  v_att record; v_prep record; v_preparer uuid; v_mode text;
  v_re text; v_re_n int; v_pl bigint; v_line int; v_entry uuid; v_permit uuid;
  v_pl_rows jsonb; v_open_diffs jsonb; v_prior_receipt record; v_pin jsonb;
  v_closing_pos jsonb; v_receipt uuid; v_gate_summary jsonb; v_watermark text;
  v_fa jsonb; v_n int; r record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'finalizing a close takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  -- The EXPLICIT client-in-firm check (skeleton §2.6: trial_balance_as_of is SECURITY
  -- INVOKER; called from this definer body it evaluates under the OWNER's policies, so
  -- nothing is inherited from RLS on this path).
  perform 1 from clara.clients cl where cl.id = v_fy.client_id and cl.firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'finalize_close', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy, 'self_attestation', p_self_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status <> 'closing' then
    raise exception 'fiscal year % is %; finalize takes a year mid-close', v_fy.label, v_fy.status
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  select * into v_run from clara.close_runs r2
    where r2.fiscal_year_id = p_fy and r2.state = 'in_progress';
  if v_run.id is null then
    raise exception 'no in-progress close run exists for this fiscal year'
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;

  -- RE-EVALUATE EVERY GATE IN-TRANSACTION (the attestation-staleness law measures against
  -- THESE digests, not the begin-time ones).
  v_gate_summary := clara._evaluate_close_gates(v_run.id);

  -- THE DRAWER SWEEP over the FRESH results (latest row per check on this run).
  for g in
    select distinct on (r2.check_key) r2.*
      from clara.close_gate_results r2
      where r2.close_run_id = v_run.id
      order by r2.check_key, r2.evaluated_at desc, r2.id desc
  loop
    if g.drawer = 1 and g.state = 'fail' then
      raise exception 'drawer-1 identity % FAILED -- no attestation path exists, for anybody', g.check_key
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_identity_failed',
            'check_key', g.check_key, 'measured', g.measured)::text;
    elsif g.drawer = 1 and g.state in ('unknown', 'error') then
      raise exception 'drawer-1 identity % could not be evaluated (%) -- an unevaluated identity has not passed', g.check_key, g.state
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_state_unknown',
            'check_key', g.check_key, 'state', g.state, 'measured', g.measured)::text;
    elsif g.drawer = 2 and g.state in ('fail', 'unknown', 'error') then
      select a.*, gr.measured_digest as bound_digest into v_att
        from clara.close_attestations a
        join clara.close_gate_results gr on gr.id = a.gate_result_id
        where a.close_run_id = v_run.id and a.check_key = g.check_key
          and a.superseded_at is null;
      if v_att.id is null then
        raise exception 'drawer-2 gate % is % and carries no attestation', g.check_key, g.state
          using errcode = 'CLR41',
            detail = jsonb_build_object('reason', 'drawer2_unattested',
              'check_key', g.check_key, 'measured', g.measured)::text;
      end if;
      if v_att.bound_digest <> g.measured_digest then
        raise exception 'the attestation on % signed a state that has since MOVED -- re-attest against the fresh measurement', g.check_key
          using errcode = 'CLR41',
            detail = jsonb_build_object('reason', 'close_attestation_stale',
              'check_key', g.check_key, 'attested_digest', v_att.bound_digest,
              'fresh_digest', g.measured_digest)::text;
      end if;
    end if;
  end loop;

  -- SEGREGATION (E-R11 / §2.10; matrix A12): the FY's last human PREPARER -- measured on
  -- last_human_editor (the column _approve_entry_core itself tests), any status, close-prep
  -- edits included; ordering coalesce(approved_at, updated_at) desc.
  select je.* into v_prep from clara.journal_entries je
    where je.client_id = v_fy.client_id
      and je.posting_date between v_fy.starts_on and v_fy.ends_on
    order by coalesce(je.approved_at, je.updated_at) desc, je.id desc limit 1;
  v_preparer := coalesce(v_prep.last_human_editor, v_prep.maker_actor);
  if clara.eligible_checker_count(c.firm) >= 2 then
    if v_preparer is not null and v_preparer = c.actor then
      raise exception 'the closer must differ from the year''s last human preparer -- a different eligible human must finalize'
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'close_segregation_violation',
            'last_preparer', v_preparer)::text;
    end if;
    v_mode := 'two_person';
  else
    if p_self_attestation is null or btrim(p_self_attestation) = '' then
      raise exception 'a solo firm closes with an explicit self-approval attestation'
        using errcode = 'CLR41',
          detail = '{"reason":"close_self_attestation_required"}';
    end if;
    v_mode := 'solo_self_attested';
  end if;

  -- THE P&L → RETAINED-EARNINGS ROLL, from DB-owned inputs only: trial_balance_as_of at
  -- ends_on minus at starts_on-1, restricted to P&L types by an EXPLICIT coa join (the
  -- read carries no type). Per-account movement = what the closing entry zeroes.
  select coalesce(jsonb_agg(jsonb_build_object('account_code', m.account_code,
           'account_type', m.account_type, 'movement_cents', m.mv)
         order by m.account_code), '[]'::jsonb),
         coalesce(sum(case when m.account_type = 'income' then -m.mv else 0 end)
                - sum(case when m.account_type = 'expense' then m.mv else 0 end), 0)
    into v_pl_rows, v_pl
    from (
      select a.account_code, a.account_type,
             coalesce(te.debit_cents - te.credit_cents, 0)
           - coalesce(ts.debit_cents - ts.credit_cents, 0) as mv
        from clara.coa_accounts a
        left join clara.trial_balance_as_of(v_fy.client_id, v_fy.ends_on) te
          on te.account_code = a.account_code
        left join clara.trial_balance_as_of(v_fy.client_id, v_fy.starts_on - 1) ts
          on ts.account_code = a.account_code
        where a.client_id = v_fy.client_id and a.account_type in ('income', 'expense')
    ) m
    where m.mv <> 0;

  -- THE RETAINED-EARNINGS RESOLUTION: the chart's own structural marker
  -- (special_acc_type = 'retained_earnings'), exactly one active -- else the close cannot
  -- know where the year rolls, and says so.
  select count(*)::int, min(a.account_code) into v_re_n, v_re
    from clara.coa_accounts a
    where a.client_id = v_fy.client_id and a.is_active
      and a.special_acc_type = 'retained_earnings';
  if v_re_n <> 1 then
    raise exception 'the chart carries % active retained-earnings account(s) (special_acc_type=''retained_earnings''); the close needs exactly one', v_re_n
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'drawer1_state_unknown',
          'resolution', 'special_acc_type=retained_earnings', 'count', v_re_n)::text;
  end if;

  -- THE OPENING-SIDE TIE against the PRIOR receipt's PIN (never a re-derivation where a
  -- pin exists; matrix A19g's close arm). First FY / pre-model prior: the Wave-B opening
  -- machinery asserted the seed (recorded in the snapshot, not re-argued).
  select cr.* into v_prior_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = v_fy.prior_fy_id and cr.kind = 'close' and cr.status = 'active';
  if v_prior_receipt.id is not null then
    v_pin := v_prior_receipt.snapshot -> 'closing_position';
    select coalesce(jsonb_agg(jsonb_build_object('account_code', d.code,
             'pinned_cents', d.pin, 'current_cents', d.cur) order by d.code), '[]'::jsonb)
      into v_open_diffs
      from (
        select coalesce(p.key, t.account_code) as code,
               coalesce((p.value ->> 0)::bigint, (p.value)::text::bigint, 0) as pin,
               coalesce(t.debit_cents - t.credit_cents, 0) as cur
          from jsonb_each(coalesce(v_pin, '{}'::jsonb)) p(key, value)
          full outer join (
            select tb.account_code, tb.debit_cents, tb.credit_cents
              from clara.trial_balance_as_of(v_fy.client_id, v_fy.starts_on - 1) tb
              join clara.coa_accounts a on a.client_id = v_fy.client_id
               and a.account_code = tb.account_code
              where a.account_type in ('asset', 'liability', 'equity')
          ) t on t.account_code = p.key
      ) d
      where d.pin <> d.cur;
    if jsonb_array_length(v_open_diffs) > 0 then
      raise exception 'this year''s opening no longer ties to the prior close''s pinned position -- the identity is absolute, with no override, for anybody'
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_identity_failed',
            'check_key', 'opening_continuity_tie', 'diffs', v_open_diffs)::text;
    end if;
  end if;

  -- THE CLOSING ENTRY: permit → DRAFT insert → lines → the census-VISIBLE flip. A year
  -- with zero P&L movement mints no entry (an empty entry is not a journal), and the
  -- receipt records that honestly.
  v_receipt := gen_random_uuid();   -- the receipt's id, pre-generated: the entry is BORN
                                    -- carrying its lineage (deferred FK; no approved-row
                                    -- UPDATE ever happens -- the battery's catch)
  if jsonb_array_length(v_pl_rows) > 0 then
    insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
        purpose, entries_expected)
      values (c.firm, v_fy.client_id, v_fy.id, v_run.id, 'close_entry', 2)
      returning id into v_permit;
    insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
        is_year_end, maker_actor, last_human_editor, close_receipt_id)
      values (v_fy.client_id, 'draft', v_fy.ends_on,
        'Year-end close ' || v_fy.label || ' — P&L to retained earnings', 'manual',
        true, c.actor, c.actor, v_receipt)
      returning id into v_entry;
    v_line := 0;
    for r in select * from jsonb_array_elements(v_pl_rows) x(el) loop
      v_line := v_line + 1;
      -- Zero the account: movement>0 is a net debit balance ⇒ CREDIT it away, and mirror.
      insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
          credit_cents, description)
        values (v_entry, v_line, r.el ->> 'account_code',
          case when (r.el ->> 'movement_cents')::bigint < 0
               then -(r.el ->> 'movement_cents')::bigint else 0 end,
          case when (r.el ->> 'movement_cents')::bigint > 0
               then (r.el ->> 'movement_cents')::bigint else 0 end,
          'Close ' || (r.el ->> 'account_type'));
    end loop;
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, v_re,
        case when v_pl < 0 then -v_pl else 0 end,
        case when v_pl > 0 then v_pl else 0 end,
        'Net result to retained earnings');
    perform clara._assert_balanced(v_entry);
    -- THE CENSUS-VISIBLE FLIP (matrix A19e: this statement must MATCH 0045:7831's
    -- update-shaped detector; an insert-approved would be invisible to it).
    update clara.journal_entries set status='approved', approved_at = now(),
        checker_actor = c.actor
      where id = v_entry;
    -- THE PER-HOOK DISPOSITION (§2.6's table): the subledger hook is CALLED, not argued a
    -- no-op -- and the no-op is then ASSERTED (a P&L→RE entry touches no control account,
    -- but that is a property of the CHART, so it is proven per close, not assumed).
    perform clara._subledger_on_approve(v_entry);
    select count(*) into v_n from clara.open_items oi where oi.entry_id = v_entry;
    if v_n <> 0 then
      raise exception 'the closing entry minted % open item(s) -- a P&L→RE close must move no subledger', v_n
        using errcode = 'CLR41',
          detail = '{"reason":"drawer1_identity_failed","check_key":"pl_retained_earnings_roll"}';
    end if;
  end if;

  -- THE PIN: the per-balance-sheet-account closing position IN CENTS, read AFTER the
  -- closing entry posted (drawer 1's stored operand for FY(n+1); matrix A19f).
  select coalesce(jsonb_object_agg(t.account_code, (t.debit_cents - t.credit_cents)), '{}'::jsonb)
    into v_closing_pos
    from clara.trial_balance_as_of(v_fy.client_id, v_fy.ends_on) t
    join clara.coa_accounts a on a.client_id = v_fy.client_id
     and a.account_code = t.account_code
    where a.account_type in ('asset', 'liability', 'equity')
      and (t.debit_cents - t.credit_cents) <> 0;

  v_fa := clara.fa_control_tie_out(v_fy.client_id, v_fy.id);
  select md5(count(*)::text || coalesce(max(je.approved_at)::text, ''))
    into v_watermark
    from clara.journal_entries je
    where je.client_id = v_fy.client_id and je.status = 'approved';

  insert into clara.close_receipts(id, firm_id, client_id, fiscal_year_id, close_run_id,
      prior_close_receipt_id, kind, closed_by, segregation_mode, last_preparer_actor,
      self_attestation, pl_net_cents, retained_earnings_account, closing_tb_digest,
      gate_digest, books_watermark, dataset_sha256, close_entry_id, snapshot)
    values (v_receipt, c.firm, v_fy.client_id, v_fy.id, v_run.id,
      v_prior_receipt.id, 'close', c.actor, v_mode, v_preparer,
      nullif(btrim(coalesce(p_self_attestation, '')), ''), v_pl, v_re,
      md5(v_closing_pos::text), md5(v_gate_summary::text), v_watermark,
      md5(v_closing_pos::text), v_entry,
      jsonb_build_object(
        'closing_position', v_closing_pos,
        'gates', v_gate_summary,
        'attestations', coalesce((select jsonb_agg(jsonb_build_object('check_key', a.check_key,
            'attested_by', a.attested_by, 'reason', a.reason, 'attested_at', a.attested_at,
            'gate_result_id', a.gate_result_id, 'superseded', a.superseded_at is not null)
            order by a.attested_at)
          from clara.close_attestations a where a.close_run_id = v_run.id), '[]'::jsonb),
        'pl_rows', v_pl_rows,
        'fa_roll', v_fa,
        'opening_tie', case when v_prior_receipt.id is not null
          then jsonb_build_object('basis', 'prior_receipt_pin',
                 'prior_receipt_id', v_prior_receipt.id, 'diffs', '[]'::jsonb)
          else jsonb_build_object('basis', 'wave_b_opening_machinery',
                 'note', 'no prior close receipt; the seed tie was asserted at approval') end,
        'watermark_basis', 'v1_count_maxapproved',
        'dataset_basis', 'v1_closing_position_digest'));

  -- (No lineage UPDATE: the entry was BORN carrying close_receipt_id -- see the column's
  -- own comment. An approved entry is never touched outside the reversal-linkage stamp.)
  update clara.close_runs set state = 'finalized', ended_by = c.actor, ended_at = now()
    where id = v_run.id;
  update clara.fiscal_years set status = 'closed' where id = p_fy;

  perform clara._audit(c.firm, c.actor, null, null, 'finalize_close', v_entry,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run.id,
      'receipt_id', v_receipt, 'pl_net_cents', v_pl, 'segregation_mode', v_mode,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.finalized', v_fy.client_id, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'receipt_id', v_receipt));
  return clara._finish_op(c.firm, 'finalize_close', p_op_key,
    jsonb_build_object('receipt_id', v_receipt, 'fiscal_year_id', p_fy,
      'close_entry_id', v_entry, 'pl_net_cents', v_pl,
      'retained_earnings_account', v_re, 'segregation_mode', v_mode));
end $$;
alter function clara.finalize_close(uuid, text, text) owner to clara_fn_owner;
revoke all on function clara.finalize_close(uuid, text, text) from public;
grant execute on function clara.finalize_close(uuid, text, text) to clara_authenticated;

-- =====================================================================================
-- S6.4d -- clara.reopen_fiscal_year (key 3; skeleton §2.8). Acquisition row → 004 →
-- 007-EXCLUSIVE (the one close verb touching a pre-existing entry leads with the row --
-- cycle 2 dies by ORDER, never a timer). Effects in the REQUIRED order: status first,
-- receipt chain second, reversal third (under the reopen_reversal permit as BELT).
-- =====================================================================================
create function clara.reopen_fiscal_year(
    p_fy uuid, p_reason text, p_correction_target jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_fy record; v_dedupe jsonb; v_receipt record; v_entry uuid;
  v_new_receipt uuid; v_target_ok boolean := false; e uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'reopen') then
    raise exception 'reopening a closed year takes the reopen capability (key 3)'
      using errcode = 'CLR04', detail = '{"reason":"capability_missing","capability":"reopen"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reopen requires a stated reason (at least 10 characters)'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  -- A NAMED correction target resolving to REAL rows of THIS client (prose is not a
  -- target; matrix A5).
  if p_correction_target is null or jsonb_typeof(p_correction_target) <> 'object' then
    raise exception 'a reopen names its correction target (entry_ids / document_id / check_key)'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  if p_correction_target ? 'entry_ids' then
    for e in select (x.v)::uuid from jsonb_array_elements_text(
        p_correction_target -> 'entry_ids') x(v) loop
      perform 1 from clara.journal_entries je
        where je.id = e and je.client_id = v_fy.client_id;
      if not found then
        raise exception 'correction target entry % is not in this client', e
          using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
      end if;
      v_target_ok := true;
    end loop;
  end if;
  if p_correction_target ? 'document_id' then
    perform 1 from clara.document_filings f
      where f.document_id = (p_correction_target ->> 'document_id')::uuid
        and f.client_id = v_fy.client_id and f.retired_at is null;
    if not found then
      raise exception 'correction target document is not filed to this client'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    v_target_ok := true;
  end if;
  if p_correction_target ? 'check_key' then
    perform 1 from clara.close_gate_checks k
      where k.check_key = p_correction_target ->> 'check_key';
    if not found then
      raise exception 'correction target gate is unknown'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    v_target_ok := true;
  end if;
  if not v_target_ok then
    raise exception 'the correction target resolved to nothing auditable'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  -- THE ORDERING GUARD (GAP5-3 as a predicate; matrix A5): no later FY may be mid-close
  -- or closed.
  perform 1 from clara.fiscal_years later
    where later.client_id = v_fy.client_id and later.ordinal > v_fy.ordinal
      and later.status in ('closing', 'closed');
  if found then
    raise exception 'a later fiscal year is closing or closed; reopen years newest-first'
      using errcode = 'CLR41', detail = '{"reason":"reopen_ordering_violation"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'reopen_fiscal_year', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy, 'reason', p_reason,
      'target', p_correction_target)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ACQUISITION: the closing entry's ROW FIRST, then 004, then 007-EXCLUSIVE (the order
  -- every JE writer already walks; an FY with no closing entry locks no row and falls
  -- through to 004 → 007, still a prefix).
  select cr.* into v_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = p_fy and cr.kind = 'close' and cr.status = 'active';
  if v_receipt.id is null then
    raise exception 'no active close receipt exists for this fiscal year'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  v_entry := v_receipt.close_entry_id;
  if v_entry is not null then
    perform 1 from clara.journal_entries je where je.id = v_entry for update;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status <> 'closed' then
    raise exception 'fiscal year % is %; only a closed year reopens', v_fy.label, v_fy.status
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;

  -- EFFECTS, IN THE REQUIRED ORDER (the wall refuses the reversed_by UPDATE on an entry
  -- inside a closing/closed FY; flipping first is what makes the reversal reachable, and
  -- the permit is the BELT for any future implementation that reverses first).
  update clara.fiscal_years set status = 'reopened' where id = p_fy;
  update clara.close_receipts set status = 'superseded' where id = v_receipt.id;
  insert into clara.close_receipts(firm_id, client_id, fiscal_year_id, close_run_id,
      prior_close_receipt_id, kind, closed_by, segregation_mode, last_preparer_actor,
      self_attestation, pl_net_cents, retained_earnings_account, closing_tb_digest,
      gate_digest, books_watermark, dataset_sha256, close_entry_id, snapshot)
    values (c.firm, v_fy.client_id, p_fy, v_receipt.close_run_id, v_receipt.id, 'reopen',
      c.actor, v_receipt.segregation_mode, v_receipt.last_preparer_actor, null,
      v_receipt.pl_net_cents, v_receipt.retained_earnings_account,
      v_receipt.closing_tb_digest, v_receipt.gate_digest, v_receipt.books_watermark,
      v_receipt.dataset_sha256, v_entry,
      jsonb_build_object('reason', p_reason, 'correction_target', p_correction_target,
        'superseded_receipt_id', v_receipt.id, 'reopened_by', c.actor))
    returning id into v_new_receipt;
  if v_entry is not null then
    insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id,
        close_run_id, purpose, target_entry_id, entries_expected)
      values (c.firm, v_fy.client_id, p_fy, v_receipt.close_run_id,
        'reopen_reversal', v_entry, 2);
    -- The audited verb, never a hand-written unwind (PRD invariant 8). Its own row lock
    -- and 004 are re-acquisitions this transaction already holds.
    perform clara.reverse_entry(v_entry, 'Reopen ' || v_fy.label || ': ' || p_reason,
      p_op_key || ':rev');
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'reopen_fiscal_year', v_entry,
    jsonb_build_object('fiscal_year_id', p_fy, 'reopen_receipt_id', v_new_receipt,
      'superseded_receipt_id', v_receipt.id, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'fiscal_year.reopened', v_fy.client_id, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'reopen_receipt_id', v_new_receipt));
  return clara._finish_op(c.firm, 'reopen_fiscal_year', p_op_key,
    jsonb_build_object('reopen_receipt_id', v_new_receipt, 'fiscal_year_id', p_fy,
      'reversed_entry_id', v_entry));
end $$;
alter function clara.reopen_fiscal_year(uuid, text, jsonb, text) owner to clara_fn_owner;
revoke all on function clara.reopen_fiscal_year(uuid, text, jsonb, text) from public;
grant execute on function clara.reopen_fiscal_year(uuid, text, jsonb, text)
  to clara_authenticated;

-- =====================================================================================
-- S6.4e -- THE READS: verify_close (recompute, never trust storage) + get_close_readiness
-- + list_fiscal_years. Granted to clara_authenticated AND clara_agent_ro (reads are the
-- agent's whole reach into the close model).
-- =====================================================================================
create function clara.verify_close(p_receipt uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_r record; v_fy record; v_strict jsonb := '[]'::jsonb;
  v_pos jsonb; v_diffs jsonb; v_probe jsonb; v_successor text;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into v_r from clara.close_receipts cr where cr.id = p_receipt;
  if v_r.id is null or v_r.firm_id <> c.firm then
    raise exception 'close receipt not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = v_r.fiscal_year_id;
  -- STRICT: the four drawer-1 identities, RECOMPUTED FROM SCRATCH now.
  for v_probe in
    select p2 from unnest(array[
      clara.ar_control_tie(v_r.client_id, v_fy.ends_on),
      clara.ap_control_tie(v_r.client_id, v_fy.ends_on),
      clara.fa_control_tie_out(v_r.client_id, v_fy.id),
      clara.bank_recon_close_state(v_r.client_id, v_fy.id)]) u(p2)
  loop
    v_strict := v_strict || jsonb_build_object('state', v_probe ->> 'state',
      'probe', v_probe);
  end loop;
  -- The stored pin vs a fresh recompute of the SAME instant (drift = a wall bypass or a
  -- corrupted receipt; the recompute never replaces the pin, it interrogates it).
  select coalesce(jsonb_object_agg(t.account_code, (t.debit_cents - t.credit_cents)), '{}'::jsonb)
    into v_pos
    from clara.trial_balance_as_of(v_r.client_id, v_fy.ends_on) t
    join clara.coa_accounts a on a.client_id = v_r.client_id
     and a.account_code = t.account_code
    where a.account_type in ('asset', 'liability', 'equity')
      and (t.debit_cents - t.credit_cents) <> 0;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', d.code,
           'pinned_cents', d.pin, 'recomputed_cents', d.cur) order by d.code), '[]'::jsonb)
    into v_diffs
    from (
      select coalesce(p.key, q.key) as code,
             coalesce((p.value)::text::bigint, 0) as pin,
             coalesce((q.value)::text::bigint, 0) as cur
        from jsonb_each(coalesce(v_r.snapshot -> 'closing_position', '{}'::jsonb)) p(key, value)
        full outer join jsonb_each(v_pos) q(key, value) on q.key = p.key
    ) d
    where d.pin <> d.cur;
  -- The successor tie: REPORTED, never graded (§2.7): consumed only when a successor
  -- close receipt exists; the seed-approval consumption is asserted by that event itself.
  select case when exists (select 1 from clara.close_receipts nxt
                 join clara.fiscal_years nfy on nfy.id = nxt.fiscal_year_id
                 where nfy.prior_fy_id = v_r.fiscal_year_id
                   and nxt.kind = 'close' and nxt.status = 'active')
              then 'consumed_by_successor_close' else 'pinned_not_yet_consumed' end
    into v_successor;
  return jsonb_build_object(
    'receipt_id', p_receipt, 'fiscal_year_id', v_r.fiscal_year_id,
    'verified', (jsonb_array_length(v_diffs) = 0
      and not exists (select 1 from jsonb_array_elements(v_strict) s(el)
            where s.el ->> 'state' in ('mismatch', 'unknown', 'error'))),
    'strict', jsonb_build_object('probes', v_strict, 'closing_position_diffs', v_diffs),
    'successor_tie', v_successor,
    'informational', jsonb_build_object(
      'gate_summary_stored', v_r.snapshot -> 'gates'));
end $$;
alter function clara.verify_close(uuid) owner to clara_fn_owner;
revoke all on function clara.verify_close(uuid) from public;
grant execute on function clara.verify_close(uuid) to clara_authenticated;
grant execute on function clara.verify_close(uuid) to clara_agent_ro;

create function clara.get_close_readiness(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_run record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  perform 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select * into v_run from clara.close_runs r
    where r.fiscal_year_id = p_fy and r.client_id = p_client
    order by r.started_at desc limit 1;
  return jsonb_build_object(
    'fiscal_year_id', p_fy, 'close_run_id', v_run.id, 'run_state', v_run.state,
    'gates', coalesce((
      select jsonb_agg(jsonb_build_object('check_key', g.check_key, 'drawer', g.drawer,
          'state', g.state, 'measured', g.measured, 'measured_digest', g.measured_digest,
          'attested', exists (select 1 from clara.close_attestations a
              where a.close_run_id = v_run.id and a.check_key = g.check_key
                and a.superseded_at is null and a.gate_result_id = g.id))
        order by g.drawer, g.check_key)
        from (select distinct on (r2.check_key) r2.* from clara.close_gate_results r2
               where r2.close_run_id = v_run.id
               order by r2.check_key, r2.evaluated_at desc, r2.id desc) g), '[]'::jsonb));
end $$;
alter function clara.get_close_readiness(uuid, uuid) owner to clara_fn_owner;
revoke all on function clara.get_close_readiness(uuid, uuid) from public;
grant execute on function clara.get_close_readiness(uuid, uuid) to clara_authenticated;
grant execute on function clara.get_close_readiness(uuid, uuid) to clara_agent_ro;

create function clara.list_fiscal_years(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  perform 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('fiscal_year_id', fy.id,
      'label', fy.label, 'ordinal', fy.ordinal, 'starts_on', fy.starts_on,
      'ends_on', fy.ends_on, 'status', fy.status, 'fy_end_source', fy.fy_end_source)
    order by fy.ordinal)
    from clara.fiscal_years fy where fy.client_id = p_client), '[]'::jsonb);
end $$;
alter function clara.list_fiscal_years(uuid) owner to clara_fn_owner;
revoke all on function clara.list_fiscal_years(uuid) from public;
grant execute on function clara.list_fiscal_years(uuid) to clara_authenticated;
grant execute on function clara.list_fiscal_years(uuid) to clara_agent_ro;

-- =====================================================================================
-- S7 -- E-R6 ACTIVATION (skeleton §2.9): ONE body rewritten in place -- the stub with no
-- callers to preserve. 'no_period_model' stays the PERMIT token (frozen by the untouched
-- guard); 'entry_missing' fails closed; closed-wins ordering; the honest twin serves the
-- two human-facing readers, repointed by MINIMAL splice in the same transaction.
-- =====================================================================================
create or replace function clara._correction_period_state(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  -- The returned string is a PROTOCOL token, not a description. Its spelling is FROZEN by
  -- the live guard in clara.approve_wrong_client_correction, which refuses on
  -- <> 'no_period_model'. Honest state for every other consumer:
  -- clara.correction_period_state(p_entry).
  select coalesce((
    select case
             when fy.id is null                     then 'no_period_model'  -- outside any FY: permit
             when fy.status in ('open','reopened')  then 'no_period_model'  -- permit
             else fy.status                                                 -- closing|closed: REFUSE
           end
      from clara.journal_entries je
      left join clara.fiscal_years fy
        on fy.client_id = je.client_id
       and je.posting_date between fy.starts_on and fy.ends_on
     where je.id = p_entry
     order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
     limit 1
  ), 'entry_missing');
$$;

-- THE HONEST TWIN: real vocabulary for panels and new writers (never the protocol token).
create function clara.correction_period_state(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce((
    select case when fy.id is null then 'none' else fy.status end
      from clara.journal_entries je
      left join clara.fiscal_years fy
        on fy.client_id = je.client_id
       and je.posting_date between fy.starts_on and fy.ends_on
     where je.id = p_entry
     order by (fy.status in ('closing','closed')) desc, fy.starts_on desc
     limit 1
  ), 'entry_missing');
$$;
revoke all on function clara.correction_period_state(uuid) from public;

-- REPOINT THE TWO READERS (reads, not audited writers -- no D1 exposure): each live body
-- carries the internal call once; count-guarded splice, never a rebuild.
do $s7$
declare
  v_sig text; v_def text; v_frm text; v_cnt int;
begin
  v_frm := 'clara._correction_period_state(';
  foreach v_sig in array array[
      'clara.retire_document_filing(uuid,text,uuid,text)',
      'clara.preview_wrong_client_correction(uuid,uuid,uuid)'] loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
      where p.oid = v_sig::regprocedure;
    if v_def is null then
      raise exception '0056 S7: % is GONE', v_sig using errcode = 'CLR10';
    end if;
    v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
    if v_cnt <> 1 then
      raise exception '0056 S7: % carries the period-state call % time(s), expected exactly 1 -- re-derive the repoint', v_sig, v_cnt
        using errcode = 'CLR10';
    end if;
    v_def := replace(v_def, v_frm, 'clara.correction_period_state(');
    execute v_def;
  end loop;
end $s7$;

-- =====================================================================================
-- S9 -- THE approve_opening_seed SPLICE (skeleton §2.6 item 2; matrix A19g's seed arm).
-- The assertion logic lives in a NEW helper so the splice into the LIVE audited body is
-- ONE LINE -- the smallest possible diff to a body whose file text died at 0018 §3b.
-- =====================================================================================
create function clara._assert_seed_matches_prior_pin(p_seed uuid) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  s record; v_receipt record; v_pin jsonb; v_diffs jsonb;
begin
  select * into s from clara.opening_seed_registry where id = p_seed;
  if not found then return; end if;
  -- The pin exists only once a close model year has CLOSED for this client; with no
  -- active close receipt the Wave-B machinery's own tie (targets + OBE-nil) governs alone
  -- -- the first-FY case, by design, not a hole.
  select cr.* into v_receipt from clara.close_receipts cr
    join clara.fiscal_years fy on fy.id = cr.fiscal_year_id
    where cr.client_id = s.client_id and cr.kind = 'close' and cr.status = 'active'
    order by fy.ordinal desc limit 1;
  if v_receipt.id is null then return; end if;
  v_pin := coalesce(v_receipt.snapshot -> 'closing_position', '{}'::jsonb);
  -- DRAWER 1, ABSOLUTE: opening(n+1) = closing(n), per account, in cents, against the
  -- PINNED position -- never a re-derivation (the pin is the stored operand).
  select coalesce(jsonb_agg(jsonb_build_object('account_code', d.code,
           'pinned_cents', d.pin, 'seed_cents', d.seed) order by d.code), '[]'::jsonb)
    into v_diffs
    from (
      select coalesce(p.key, t.account_code) as code,
             coalesce((p.value)::text::bigint, 0) as pin,
             coalesce(t.net, 0) as seed
        from jsonb_each(v_pin) p(key, value)
        full outer join (
          select tt.account_code, sum(tt.debit_cents - tt.credit_cents) as net
            from clara.opening_tb_targets tt
            where tt.seed_id = p_seed
            group by tt.account_code
        ) t on t.account_code = p.key
    ) d
    where d.pin <> d.seed;
  if jsonb_array_length(v_diffs) > 0 then
    raise exception 'the opening seed does not tie to the prior close''s pinned position -- drawer 1, absolute, no override, for anybody'
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'drawer1_identity_failed',
          'check_key', 'opening_continuity_tie', 'prior_receipt_id', v_receipt.id,
          'diffs', v_diffs)::text;
  end if;
end $$;
revoke all on function clara._assert_seed_matches_prior_pin(uuid) from public;

do $s9$
declare
  v_sig text := 'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_frm := 'perform clara._assert_opening_tie(p_seed);';
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0056 S9: the opening-tie anchor appears % time(s) (expected exactly once) -- the body drifted since S0.6; re-derive', v_cnt
      using errcode = 'CLR10';
  end if;
  v_to := v_frm || chr(10) ||
    '  -- 0056 (Wave E lane beta, skeleton 2.6 item 2 / matrix A19g): the seed-approval arm' || chr(10) ||
    '  -- of opening(n+1) = closing(n), asserted against the PRIOR receipt''s PINNED position.' || chr(10) ||
    '  perform clara._assert_seed_matches_prior_pin(p_seed);';
  v_def := replace(v_def, v_frm, v_to);
  execute v_def;
  -- POSTCHECK: the new call landed once; the anchor and 0018 SS3b's guards all survive.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if (length(v_def) - length(replace(v_def, '_assert_seed_matches_prior_pin', '')))
       / length('_assert_seed_matches_prior_pin') <> 1 then
    raise exception '0056 S9 postcheck: the pin assertion did not land exactly once'
      using errcode = 'CLR10';
  end if;
  if position('correction_draft_present' in v_def) = 0
     or position(v_frm in v_def) = 0 then
    raise exception '0056 S9 postcheck: a pre-existing guard (0018 SS3b / the opening tie) vanished in the splice'
      using errcode = 'CLR10';
  end if;
end $s9$;

reset role;

-- =====================================================================================
-- S11 -- TAILS: every structural claim re-measured from the live catalog in this same
-- transaction.
-- =====================================================================================
do $s11$
declare
  v_n int; v_t text; r record;
begin
  -- (11.1) THE GUARD IS UNTOUCHED: md5 equal to the S0 stash, and the frozen predicate
  -- still present (a prestate/tail pair measured in-migration -- "we did not edit it"
  -- proves nothing).
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  if v_t <> (select v from _x56_pre where k = 'awcc_md5') then
    raise exception '0056 S11.1: approve_wrong_client_correction MOVED during this migration -- it must not'
      using errcode = 'CLR10';
  end if;

  -- (11.2) THE CALLER SET, AFTER (matrix A6d): the protocol fn's callers are exactly the
  -- guard; the twin's callers are exactly the two repointed readers.
  select coalesce(string_agg(p.proname, ',' order by p.proname), '') into v_t
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname not in ('_correction_period_state')
      and p.prosrc like '%\_correction\_period\_state(%' escape '\';
  if v_t <> 'approve_wrong_client_correction' then
    raise exception '0056 S11.2: after the repoint, _correction_period_state''s callers are {%} -- expected exactly {approve_wrong_client_correction}', v_t
      using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(p.proname, ',' order by p.proname), '') into v_t
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname not in ('correction_period_state', '_correction_period_state')
      and p.prosrc like '%clara.correction\_period\_state(%' escape '\';
  if v_t <> 'preview_wrong_client_correction,retire_document_filing' then
    raise exception '0056 S11.2: the honest twin''s callers are {%} -- expected exactly {preview_wrong_client_correction, retire_document_filing}', v_t
      using errcode = 'CLR10';
  end if;

  -- (11.3) THE APPROVE-WRITER CENSUS: four -> FIVE, and the fifth is finalize_close whose
  -- flip MATCHES the 0045:7831 detector shape (an insert-approved would be invisible to
  -- it -- matrix A19e).
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and lower(regexp_replace(regexp_replace(regexp_replace(
            coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)),
            '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
          ~ 'update\s+clara\.journal_entries\s+set\s+status\s*=\s*''approved''';
  if v_n <> 5 then
    raise exception '0056 S11.3: the approve-writer census counts % (expected FIVE: the pinned four + finalize_close)', v_n
      using errcode = 'CLR10';
  end if;
  select lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)),
           '/\*[\s\S]*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g')) into v_t
    from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if v_t !~ 'update\s+clara\.journal_entries\s+set\s+status\s*=\s*''approved''' then
    raise exception '0056 S11.3: finalize_close''s flip does not match the census detector shape'
      using errcode = 'CLR10';
  end if;

  -- (11.4) THE WALL-COVERAGE CENSUS (skeleton §2.11's disposition table, asserted): every
  -- gate-evidence table carries the serialize trigger; the JE pair carries the wall.
  for r in select * from (values
      ('journal_entries',       't_period_wall'),
      ('journal_lines',         't_period_wall_lines'),
      ('open_item_allocations', 't_close_serialize'),
      ('bank_statements',       't_close_serialize'),
      ('bank_reconciliations',  't_close_serialize'),
      ('bank_line_exceptions',  't_close_serialize'),
      ('fixed_assets',          't_close_serialize')) t(tbl, trg) loop
    select count(*) into v_n from pg_trigger g
      where g.tgrelid = ('clara.' || r.tbl)::regclass and g.tgname = r.trg
        and not g.tgisinternal;
    if v_n <> 1 then
      raise exception '0056 S11.4: clara.% does not carry trigger % -- the wall family is incomplete', r.tbl, r.trg
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (11.5) THE PRIVILEGE SWEEP, by STATE never by grant text: the agent role can execute
  -- NO close/approve-class verb; the wake roles and runtime can execute NOTHING new.
  for r in select * from (values
      ('clara.open_fiscal_year(uuid,text,date,date,text,text)'),
      ('clara.begin_close(uuid,text)'),
      ('clara.attest_close_exception(uuid,text,text,text)'),
      ('clara.finalize_close(uuid,text,text)'),
      ('clara.abandon_close(uuid,text,text)'),
      ('clara.reopen_fiscal_year(uuid,text,jsonb,text)'),
      ('clara.grant_firm_capability(uuid,text,text,text)'),
      ('clara.revoke_firm_capability(uuid,text,text,text)')) t(sig) loop
    if has_function_privilege('clara_agent_ro', r.sig, 'execute')
       or has_function_privilege('clara_runtime', r.sig, 'execute')
       or has_function_privilege('clara_wake_interactive', r.sig, 'execute')
       or has_function_privilege('clara_wake_proactive', r.sig, 'execute') then
      raise exception '0056 S11.5: a non-human role holds EXECUTE on % -- the write-authorization invariant is breached', r.sig
        using errcode = 'CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', r.sig, 'execute') then
      raise exception '0056 S11.5: clara_authenticated cannot execute % -- the verb is dark', r.sig
        using errcode = 'CLR10';
    end if;
  end loop;
  -- The permit table stays caller-unreachable (matrix A19c).
  for v_t in select unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_wake_interactive','clara_wake_proactive']) loop
    if has_table_privilege(v_t, 'clara.close_write_permits', 'insert')
       or has_table_privilege(v_t, 'clara.close_write_permits', 'update')
       or has_table_privilege(v_t, 'clara.close_write_permits', 'select') then
      raise exception '0056 S11.5: % can reach close_write_permits -- forged permits become possible', v_t
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (11.6) fa_register_tie is UNTOUCHED (WD-R1: visibility-only stays visibility-only).
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.fa_register_tie(uuid,date)'::regprocedure;
  if v_t <> (select v from _x56_pre where k = 'fart_md5') then
    raise exception '0056 S11.6: fa_register_tie MOVED during this migration -- it must not'
      using errcode = 'CLR10';
  end if;

  -- (11.7) approve_opening_seed carries the splice AND its 0018 guards (the md5 MUST have
  -- moved -- from the S0 stash -- by exactly the spliced content; both anchors positive).
  select md5(p.prosrc) into v_t from pg_proc p
    where p.oid = 'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if v_t = (select v from _x56_pre where k = 'aos_md5_pre') then
    raise exception '0056 S11.7: approve_opening_seed did NOT change -- the S9 splice never landed'
      using errcode = 'CLR10';
  end if;

  -- (11.8) The gate catalog carries its thirteen authored checks; the six event pairs are
  -- on BOTH registers.
  select count(*) into v_n from clara.close_gate_checks;
  if v_n <> 13 then
    raise exception '0056 S11.8: close_gate_checks carries % row(s), expected 13', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.event_types
    where name in ('fiscal_year.opened','close.begun','close.attested','close.finalized',
      'close.abandoned','fiscal_year.reopened');
  if v_n <> 6 then
    raise exception '0056 S11.8: % of 6 close event types registered', v_n using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
    where tt.event_type in ('fiscal_year.opened','close.begun','close.attested',
      'close.finalized','close.abandoned','fiscal_year.reopened') and tt.decision = 'ignore';
  if v_n <> 6 then
    raise exception '0056 S11.8: % of 6 close event types carry taxonomy decisions', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '0056 OK: period spine + gate trio + permit + wall family + drawer-1 probes + six verbs + E-R6 activated (guard untouched, twin repointed) + E-R11 keys + the opening-seed pin splice -- INERT ON ARRIVAL (zero fiscal_years rows; activation is the first human open_fiscal_year).';
end $s11$;
