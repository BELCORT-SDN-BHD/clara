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
    where p.oid = 'clara.approve_opening_seed(uuid,uuid,text,text)'::regprocedure;
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
    where p.oid = 'clara.approve_opening_seed(uuid,uuid,text,text)'::regprocedure;
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
