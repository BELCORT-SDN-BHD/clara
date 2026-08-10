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
