-- UNNUMBERED_f_t1_sst_reference_tables.sql -- F-T1 (the SST engine) PR-1: the two SST reference
-- tables. Design of record: docs/plan/active/sst-engine-design.md (S1-S4, S1 point 4),
-- -design-part2.md (S8's PR-1 row), -annexes.md (Annex A.1, A.1a, A.9's owner), -annexes-2.md
-- (Annex C-4/C-5), -gate-record.md + -gate-record-part2.md (OQ-14). Statutory row ids (S-*/V-*)
-- resolve in sst-engine-survey.md S3, fetched/verified 2026-08-23.
--
-- SCOPE, EXACTLY (design-part2.md S8 PR-1 row): (1) clara.sst_rate_schedule, greenfield, + a
-- narrow cited seed -- (2) the reachable-closure write assertion, armed for BOTH SST reference
-- tables -- (3) the clara.sst_threshold_schedule ALTER, Annex A.1's ordered specification --
-- (4) PRD.md:215's prose-rates correction (a doc edit, this migration's sibling change, not SQL).
-- NOT in scope: any evaluator, any writer verb, any governed door -- those are F-T1 PR-3+ and
-- F-A8's own PR (the fetch attaches to the schema this file lands, per survey S1.7/S4 row 6).
--
-- OQ-14 -- RULED 2026-08-23, F-T1 authors the sst_threshold_schedule ALTER.
-- sst-engine-gate-record-part2.md:39-44: "F-T1 authors the sst_threshold_schedule ALTER...
-- PR-1's threshold limb re-enters (Annex A.1's specification stands); F-A8/PR-3 drops the ALTER
-- and consumes the table F-T1 authors." Cross-recorded the same date in
-- wave-f-contract.md:347 ([TB-2026-08-23]) and internet-lane-design.md:431 (F-A8's PR-3 row
-- re-cut to consume-not-author) -- both read at commit time by this lane; the collision Annex
-- B/D-14 warned about (a ruling recorded only in F-T1's own files) is discharged.
--
-- REACHABLE-CLOSURE WRITE ASSERTION -- WHY A NEW ONE, NOT AN EDIT TO 0016. Applied migrations
-- are immutable (constraint 9's discipline; checksums enforce it). 0016:5216-5228's own tail
-- assertion ("no GRANTED fn writes sst_threshold_schedule") is a ONE-TIME apply-time DO block,
-- not a standing function, and its scan is GRANTED-FN-PROSRC-ONLY -- blind to an ungranted core
-- called by a granted wrapper (the class F-A8's gate found, internet-lane-annexes.md C.5e/IL-D2).
-- At PR-1 time NEITHER reference table has any writer at all, granted or ungranted -- no governed
-- door exists yet (that is F-A8's future PR, survey S1.7). So this file's own trued assertion,
-- below, proves the REACHABLE CLOSURE (granted wrappers plus the ungranted clara.* functions
-- their prosrc calls, transitively) is EMPTY of DML on either table -- the correctly-scoped
-- version of 0016's claim, armed for two tables, never a patch to 0016's applied bytes.
--
-- sst_rate_schedule's SEED IS DELIBERATELY NARROW -- SIX ROWS, ALL BYTE-GRADE CITED. It carries
-- the four headline ad-valorem rates (sales general 10% + First-Schedule goods 5%, service
-- general 8% + First-Schedule 6% bucket), the one credit/charge-card per-unit fee (RM25), and
-- the flagship retroactive-correction case the design names by name (V-3: rental/leasing moves
-- from the 8% general bucket into its OWN 6% scope on 2026-01-01, ruled by a gazette dated ten
-- weeks later -- the live proof an effective-dated, supersedable table is required at all).
-- NOT SEEDED, ON PURPOSE, NAMED SO A LATER READER DOES NOT ASSUME AN OMISSION IS A GAP IN THIS
-- FILE RATHER THAN A NAMED OPEN QUESTION:
--   - the Second-Schedule PER-MEASURE specific rates (RM/litre, RM/kg) -- survey U-5: "layout-
--     extracted from a PDF and is column-shift-prone... line-by-line re-verification before any
--     Part-C seed." Seeding an unverified specific figure would be exactly the fabricated-tax-
--     figure hard constraint 2 forbids. rate_kind='per_measure' is a real, checked value in the
--     table's vocabulary; zero rows currently carry it.
--   - the per-GROUP breakdown of the 6% First-Schedule bucket into its 14 individual items/
--     groups (A-M, V-2/V-6) -- the survey verified the BUCKET RATE (6%) and the bucket's
--     membership in prose, not a clean per-group code table; minting 14 scope_key values here
--     would be this migration inventing a taxonomy the survey did not verify at that grain.
--     scope_key is TEXT, not a closed CHECK enum, precisely so a later PR can add rows without
--     an ALTER -- the closed-vocabulary discipline (D-11, V-19's string-key trap) binds the KEY
--     SPELLING once chosen, not the row count at birth.
-- A period/scope with no live row REFUSES by name once an evaluator reads this table (TA-P2's
-- "a missing row REFUSES" idiom, S3.1) -- never a silent default. No evaluator is built in this
-- PR to do that reading; this file only seeds the rows an evaluator will later read.
--
-- CEREMONY POSTURE -- ADDITIVE AND INERT ON ARRIVAL. One CREATE TABLE (new, unread by anything
-- live), one seed INSERT (six rows into that new table), one ALTER TABLE (five nullable-column
-- additions + one CHECK relaxation + one PK column addition, all backward-compatible with the
-- two live seed rows and every existing reader -- Annex A.1's "every new column nullable, so
-- 0016:247-248's two seed rows need no backfill"), one DO-block assertion (reads the catalog,
-- writes nothing). No live function body is replaced. No D1 write-quiesce obligation.

set local statement_timeout = '5min';   -- PRECAUTIONARY: small DDL + 6-row seed + a catalog scan.

create temp table _ft1_pr1_pre(k text primary key, v text not null) on commit drop;
insert into _ft1_pr1_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. Measure every claim this file makes, abort on a false premise.
-- =====================================================================================
do $pre$
declare
  v_threshold_rows int;
  v_g_eff_to date; v_i_eff_to date;
begin
  if to_regclass('clara.sst_threshold_schedule') is null then
    raise exception 'f_t1_sst_reference_tables requires clara.sst_threshold_schedule (0016 not applied)'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.sst_rate_schedule') is not null then
    raise exception 'f_t1_sst_reference_tables: clara.sst_rate_schedule ALREADY EXISTS -- this file has run before, or a sibling lane landed it first'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'clara.sst_threshold_schedule'::regclass
               and attname = 'id' and not attisdropped) then
    raise exception 'f_t1_sst_reference_tables: clara.sst_threshold_schedule already carries an id column -- the ALTER below has run before, or OQ-14''s other claimant (F-A8/PR-3) landed it first'
      using errcode = 'CLR10';
  end if;

  -- C-4's prediction, re-confirmed at the bytes immediately before this file mutates the table:
  -- composite PK, no id, threshold_cents > 0, exactly the two seed rows, both open-ended.
  select count(*) into v_threshold_rows from clara.sst_threshold_schedule;
  if v_threshold_rows <> 2 then
    raise exception 'f_t1_sst_reference_tables: clara.sst_threshold_schedule carries % row(s), expected exactly 2 (C-4''s premise) -- a sibling lane changed this table first',
      v_threshold_rows using errcode = 'CLR10';
  end if;
  select effective_to into v_g_eff_to from clara.sst_threshold_schedule where service_group = 'G' and effective_from = date '2018-09-01';
  select effective_to into v_i_eff_to from clara.sst_threshold_schedule where service_group = 'I' and effective_from = date '2018-09-01';
  if v_g_eff_to is not null or v_i_eff_to is not null then
    raise exception 'f_t1_sst_reference_tables: a seed row is already superseded (G effective_to=%, I effective_to=%) -- the a21-watch P1 premise this file preserves no longer holds',
      v_g_eff_to, v_i_eff_to using errcode = 'CLR10';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'clara_fn_owner') then
    raise exception 'f_t1_sst_reference_tables: role clara_fn_owner is missing' using errcode = 'CLR10';
  end if;
end $pre$;

-- =====================================================================================
-- 1. clara.sst_rate_schedule -- greenfield, on the client_facts (0055:386-420) immutable +
--    supersede idiom, replayed live at this file's authoring (S2.1's own cited precedent), with
--    no firm_id (Tier-1 facts are firm-independent, Annex A.1's Table DDL posture).
-- =====================================================================================
set role clara_fn_owner;

create table clara.sst_rate_schedule (
  id               uuid primary key default gen_random_uuid(),
  tax_type         text not null check (tax_type in ('sales','service')),
  scope_key        text not null check (btrim(scope_key) <> ''),
  -- Three rate FORMS (design S3.1, S-1/V-2/F-6): a percentage (ad_valorem, in basis points --
  -- the estate's existing SST unit, opening_items.sst_rate_bp, survey S1.4: 800 = 8%), a flat
  -- per-unit money amount (per_unit -- RM25/card), or a specific per-measure money amount
  -- (per_measure -- RM/litre, RM/kg, Second Schedule). Exactly one of rate_bp / rate_amount_sen
  -- is populated, and it is the one rate_kind names -- not merely "at least one", which would
  -- admit a per_unit row silently carrying a percentage. unit_code names the measure/unit for
  -- the two money-amount forms and is meaningless (and refused) for a percentage.
  rate_kind        text not null check (rate_kind in ('ad_valorem','per_unit','per_measure')),
  rate_bp          int,
  rate_amount_sen  bigint,
  unit_code        text,
  effective_from   date not null,
  effective_to     date,                    -- HALF-OPEN (S3.1): the day this rate stops applying.
  superseded_by    uuid references clara.sst_rate_schedule(id) deferrable initially deferred,
  superseded_at    timestamptz,
  recorded_by      uuid references clara.users(id),
  basis            text,
  basis_kind       text,
  recorded_at      timestamptz not null default now(),
  source_note      text not null check (btrim(source_note) <> ''),
  constraint ck_sst_rate_schedule_rate_bp_positive     check (rate_bp is null or rate_bp > 0),
  constraint ck_sst_rate_schedule_rate_amount_positive check (rate_amount_sen is null or rate_amount_sen > 0),
  constraint ck_sst_rate_schedule_rate_kind_bp         check ((rate_kind = 'ad_valorem') = (rate_bp is not null)),
  constraint ck_sst_rate_schedule_rate_kind_amount     check ((rate_kind in ('per_unit','per_measure')) = (rate_amount_sen is not null)),
  constraint ck_sst_rate_schedule_unit_code            check ((rate_kind in ('per_unit','per_measure')) = (unit_code is not null)),
  constraint ck_sst_rate_schedule_effective_order      check (effective_to is null or effective_to > effective_from),
  constraint ck_sst_rate_schedule_supersession_paired  check ((superseded_by is null) = (superseded_at is null)),
  -- The governed-origin conjunct (Annex A.1's sst_threshold_schedule ALTER carries the identical
  -- shape): a row that names a human recorder must also name why. A migration-seeded row (this
  -- file's own six) leaves recorded_by NULL and is exempt by construction, exactly as the two
  -- live sst_threshold_schedule seed rows are today.
  constraint ck_sst_rate_schedule_governed_origin check (
    recorded_by is null or (btrim(coalesce(basis,'')) <> '' and basis_kind is not null)
  )
);

-- Uniqueness on the natural key, scoped to un-superseded rows -- two DIFFERENT time windows for
-- the same (tax_type, scope_key) are both legitimately live at once (a rate change is a NEW row,
-- not a correction); what must never collide is two un-corrected rows claiming the SAME start
-- date for the same tax_type+scope_key.
create unique index uq_sst_rate_schedule_live on clara.sst_rate_schedule (tax_type, scope_key, effective_from)
  where superseded_by is null;

alter table clara.sst_rate_schedule enable row level security;
alter table clara.sst_rate_schedule force row level security;
create policy p_sst_rate_schedule_owner on clara.sst_rate_schedule for all to clara_fn_owner using (true) with check (true);
-- Zero direct app-role grants (Annex A.1): reference tables are read only through a DEFINER
-- evaluator, never queried directly by a human or agent role -- the SAME posture the live
-- sst_threshold_schedule already carries (confirmed at the bytes: one owner policy, nothing
-- else). No GRANT statement follows for any clara_* lane role.

-- Immutable + supersede, enforced at the trigger layer (the client_facts idiom, S2.1): a row is
-- never DELETEd, never TRUNCATEd, and its only lawful UPDATE is the one-time supersession stamp.
create function clara._tf_sst_rate_schedule_supersede_only() returns trigger
  language plpgsql security definer set search_path to 'clara', 'pg_temp' as $fn$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded sst_rate_schedule row is immutable'
      using errcode = 'CLR10', detail = '{"reason":"sst_rate_schedule_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id                is distinct from old.id
     or new.tax_type          is distinct from old.tax_type
     or new.scope_key         is distinct from old.scope_key
     or new.rate_kind         is distinct from old.rate_kind
     or new.rate_bp           is distinct from old.rate_bp
     or new.rate_amount_sen   is distinct from old.rate_amount_sen
     or new.unit_code         is distinct from old.unit_code
     or new.effective_from    is distinct from old.effective_from
     or new.effective_to      is distinct from old.effective_to
     or new.recorded_by       is distinct from old.recorded_by
     or new.basis             is distinct from old.basis
     or new.basis_kind        is distinct from old.basis_kind
     or new.recorded_at       is distinct from old.recorded_at
     or new.source_note       is distinct from old.source_note then
    raise exception 'sst_rate_schedule admits exactly one update: the supersession stamp (superseded_by and superseded_at together, set once)'
      using errcode = 'CLR10', detail = '{"reason":"sst_rate_schedule_immutable"}';
  end if;
  return new;
end $fn$;
revoke all on function clara._tf_sst_rate_schedule_supersede_only() from public;

create trigger t_sst_rate_schedule_no_delete before delete on clara.sst_rate_schedule
  for each row execute function clara._tf_append_only();
create trigger t_sst_rate_schedule_no_truncate before truncate on clara.sst_rate_schedule
  for each statement execute function clara._tf_no_truncate();
create trigger t_sst_rate_schedule_supersede_only before update on clara.sst_rate_schedule
  for each row execute function clara._tf_sst_rate_schedule_supersede_only();

-- =====================================================================================
-- 2. Seed -- six rows, every one cited to a survey S3 row and a gazette instrument + fetch date.
--    All migration-seeded: recorded_by/basis/basis_kind left NULL (the governed-origin conjunct
--    exempts a NULL recorder), matching the live sst_threshold_schedule seed rows' own posture.
-- =====================================================================================
insert into clara.sst_rate_schedule
    (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
values
  ('sales', 'general', 'ad_valorem', 1000, date '2025-07-01',
   'S-1: Sales Tax (Rate of Sales Tax) Order 2025, P.U.(A) 170/2025, gazetted 9 Jun 2025, in force 1 Jul 2025 -- 10% on all taxable goods except First-Schedule (5%) and Second-Schedule specific-rate goods. mysst.customs.gov.my/assets/document/SST%20Orders/order/1-PUA%20170_2025.pdf, accessed 2026-08-23 (sst-engine-survey.md S3.1 S-1).'),
  ('sales', 'first_schedule', 'ad_valorem', 500, date '2025-07-01',
   'S-1 (same instrument, P.U.(A) 170/2025): First-Schedule goods at 5%. accessed 2026-08-23 (sst-engine-survey.md S3.1 S-1).');

insert into clara.sst_rate_schedule
    (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
values
  ('service', 'general', 'ad_valorem', 800, date '2024-03-01',
   'V-1: P.U.(A) 64/2024, gazetted 26 Feb 2024, in force 1 Mar 2024 -- 8% general service tax rate (6% retained for the named specified sectors, seeded as scope_key=''first_schedule_6pct'' below). accessed 2026-08-23 (sst-engine-survey.md S3.2 V-1).'),
  ('service', 'first_schedule_6pct', 'ad_valorem', 600, date '2025-07-01',
   'V-2: P.U.(A) 173/2025, gazetted 9 Jun 2025, in force 1 Jul 2025 -- First Schedule items 1-13 at 6% (food/beverage x4, telecommunications x2, parking, logistics, healthcare, traditional & complementary medicine, allied health, construction works, education). This row is the BUCKET rate only -- the per-item/group breakdown is a named non-goal of this seed (this file''s header, U-5/D-11). accessed 2026-08-23 (sst-engine-survey.md S3.2 V-2).'),
  ('service', 'rental_leasing', 'ad_valorem', 600, date '2026-01-01',
   'V-3: P.U.(A) 125/2026, gazetted 13 Mar 2026, "deemed to have come into operation on 1 January 2026" -- inserts First Schedule item 14 ("provision of rental or leasing services") into the 6% bucket. Before this date rental/leasing carried no distinct scope row and fell under scope_key=''general'' (8%, V-1/V-2, in force 1 Jul 2025 through 31 Dec 2025) -- the live proof V-3 names by name that this table must be effective-dated and support a row whose gazette post-dates the period it governs. accessed 2026-08-23 (sst-engine-survey.md S3.2 V-3).');

insert into clara.sst_rate_schedule
    (tax_type, scope_key, rate_kind, rate_amount_sen, unit_code, effective_from, source_note)
values
  ('service', 'credit_charge_card', 'per_unit', 2500, 'card', date '2024-03-01',
   'V-1: P.U.(A) 64/2024, gazetted 26 Feb 2024, in force 1 Mar 2024 -- RM25 per credit/charge card on activation and every twelve months (Second Schedule; form item 11(e), counted in cards not ringgit -- design S3.1/Annex A.2). accessed 2026-08-23 (sst-engine-survey.md S3.2 V-1).');

reset role;

-- =====================================================================================
-- 3. clara.sst_threshold_schedule -- the ordered ALTER, Annex A.1's specification verbatim.
--    Order is load-bearing: id + its own UNIQUE constraint must exist before the self-
--    referencing superseded_by FK can be declared against it.
-- =====================================================================================
set role clara_fn_owner;

-- (1) surrogate id, and the unique target the self-FK below needs.
alter table clara.sst_threshold_schedule add column id uuid not null default gen_random_uuid();
alter table clara.sst_threshold_schedule add constraint uq_sst_threshold_schedule_id unique (id);

-- (2) supersession, paired.
alter table clara.sst_threshold_schedule add column superseded_by uuid
  references clara.sst_threshold_schedule(id) deferrable initially deferred;
alter table clara.sst_threshold_schedule add column superseded_at timestamptz;
alter table clara.sst_threshold_schedule add constraint ck_sst_threshold_schedule_supersession_paired
  check ((superseded_by is null) = (superseded_at is null));

-- (3) the opaque WHO/BASIS trio, and the governed-origin conjunct (a recorder must name why).
alter table clara.sst_threshold_schedule add column recorded_by uuid references clara.users(id);
alter table clara.sst_threshold_schedule add column basis text;
alter table clara.sst_threshold_schedule add column basis_kind text;
alter table clara.sst_threshold_schedule add constraint ck_sst_threshold_schedule_governed_origin
  check (recorded_by is null or (btrim(coalesce(basis,'')) <> '' and basis_kind is not null));

-- V-6 defect 1: threshold_cents > 0 cannot express Group H item 1's or Group M's NIL threshold
-- ("registrable from the first ringgit"). Relax to >= 0; a genuinely ABSENT row still refuses by
-- name (S3.1's "a missing row REFUSES" idiom) -- the two states (zero threshold vs. no row) stay
-- distinguishable because one is a row and the other is the absence of one.
alter table clara.sst_threshold_schedule drop constraint sst_threshold_schedule_threshold_cents_check;
alter table clara.sst_threshold_schedule add constraint sst_threshold_schedule_threshold_cents_check
  check (threshold_cents >= 0);

-- V-6 defect 2: the PK grain (service_group, effective_from) cannot hold PER-ITEM thresholds
-- (Group H item 1 NIL vs items 2-4 RM1m; Group I items 14-16 RM1.5m vs the group's RM500k).
-- item_no default '*' means "group-wide" so the two live seed rows (G, I) stay valid untouched;
-- a later per-item row overrides by specificity (an evaluator concern, not this migration's).
alter table clara.sst_threshold_schedule add column item_no text not null default '*';
alter table clara.sst_threshold_schedule drop constraint sst_threshold_schedule_pkey;
alter table clara.sst_threshold_schedule add constraint sst_threshold_schedule_pkey
  primary key (service_group, item_no, effective_from);

reset role;

-- =====================================================================================
-- 4. The reachable-closure write assertion, armed for BOTH SST reference tables. This file's
--    OWN trued assertion (never an edit to applied 0016): the reachable closure of every
--    lane-role-granted clara.* function, plus the ungranted clara.* functions its prosrc names
--    (transitively, following clara.-qualified calls -- the estate's proven internal-call
--    convention, confirmed live at 0044:1652/1927 calling clara._allocate_receipt_core), is
--    scanned for INSERT/UPDATE/DELETE text against either table. At PR-1 time neither table has
--    ANY writer, granted or ungranted -- the assertion below proves that, by measurement, not by
--    assumption; it is re-armed (not edited) by whichever lane later builds a governed door.
-- =====================================================================================
do $reachable_closure$
declare
  v_target text;
  v_pattern text;
  v_frontier text[];
  v_reached text[];
  v_new text[];
  v_iterations int;
  v_offenders text;
begin
  foreach v_target in array array['sst_threshold_schedule', 'sst_rate_schedule'] loop
    v_pattern := '(insert\s+into|update|delete\s+from)\s+(clara\.)?' || v_target || '\M';
    v_reached := '{}'::text[];

    -- Roots: functions with EXECUTE granted to any lane-facing role (every clara_* role except
    -- the table/function owner, clara_fn_owner) -- the FULL live roster, not merely the six the
    -- 0016 precedent named (this scan additionally covers clara_agent_read_login and
    -- clara_wake_write_login, both real login roles that MEMBER OF a role already in the six but
    -- could in principle carry a direct grant of their own -- absence is not evidence, so both
    -- are checked directly rather than assumed covered by their parent).
    select coalesce(array_agg(distinct p.proname), '{}'::text[]) into v_frontier
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'clara' and a.privilege_type = 'EXECUTE'
       and r.rolname in ('clara_authenticated', 'clara_agent_ro', 'clara_agent_read_login',
         'clara_runtime', 'clara_runtime_login', 'clara_wake_interactive', 'clara_wake_proactive',
         'clara_wake_write_login');

    v_iterations := 0;
    while array_length(v_frontier, 1) > 0 and v_iterations < 25 loop
      v_iterations := v_iterations + 1;
      v_reached := v_reached || v_frontier;
      select coalesce(array_agg(distinct callee), '{}'::text[]) into v_new
        from (
          select (regexp_matches(p.prosrc, 'clara\.([a-z_][a-z0-9_]*)\s*\(', 'g'))[1] as callee
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'clara' and p.proname = any(v_frontier)
        ) x
       where callee <> all(v_reached)
         and exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
                      where n2.nspname = 'clara' and p2.proname = x.callee);
      v_frontier := v_new;
    end loop;
    if array_length(v_frontier, 1) > 0 then
      raise exception 'f_t1_sst_reference_tables: reachable-closure scan for % did not converge in 25 iterations (frontier still: %) -- call-graph depth exceeds this file''s bound',
        v_target, v_frontier using errcode = 'CLR10';
    end if;

    select string_agg(p.proname, ', ') into v_offenders
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname = any(v_reached)
       and p.prosrc ~* v_pattern;
    if v_offenders is not null then
      raise exception 'f_t1_sst_reference_tables: the reachable closure of granted-role functions writes clara.% (must be migration-only until a governed door exists) -- offending function(s): %',
        v_target, v_offenders using errcode = 'CLR10';
    end if;
  end loop;

  raise notice 'F-T1 PR-1 reachable-closure write assertion OK: for BOTH clara.sst_threshold_schedule and clara.sst_rate_schedule, no lane-role-granted function -- and no ungranted clara.* function reachable from one, transitively through clara.-qualified calls -- writes INSERT/UPDATE/DELETE against the table. Both stay migration-only.';
end $reachable_closure$;

reset role;

-- =====================================================================================
-- TAIL CENSUS. Every claim re-read from the live catalog, nothing inferred from this file's own
-- statements.
-- =====================================================================================
do $tail$
declare
  v_rate_rows int; v_rate_sales int; v_rate_service int;
  v_rate_ad_valorem int; v_rate_per_unit int;
  v_rate_rls record;
  v_thr_id_count int; v_thr_item_no_star int;
  v_thr_g_eff_to date; v_thr_i_eff_to date; v_thr_g_cents bigint; v_thr_i_cents bigint;
  v_thr_pk text;
  v_thr_check_def text;
begin
  select count(*) into v_rate_rows from clara.sst_rate_schedule;
  select count(*) into v_rate_sales from clara.sst_rate_schedule where tax_type = 'sales';
  select count(*) into v_rate_service from clara.sst_rate_schedule where tax_type = 'service';
  select count(*) into v_rate_ad_valorem from clara.sst_rate_schedule where rate_kind = 'ad_valorem';
  select count(*) into v_rate_per_unit from clara.sst_rate_schedule where rate_kind = 'per_unit';
  if v_rate_rows <> 6 or v_rate_sales <> 2 or v_rate_service <> 4
     or v_rate_ad_valorem <> 5 or v_rate_per_unit <> 1 then
    raise exception 'f_t1_sst_reference_tables tail: sst_rate_schedule census total %, sales %, service %, ad_valorem %, per_unit % -- expected 6 / 2 / 4 / 5 / 1',
      v_rate_rows, v_rate_sales, v_rate_service, v_rate_ad_valorem, v_rate_per_unit using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.sst_rate_schedule where superseded_by is not null or recorded_by is not null) then
    raise exception 'f_t1_sst_reference_tables tail: a seeded sst_rate_schedule row carries superseded_by or recorded_by -- the migration-seed premise (both NULL) is violated'
      using errcode = 'CLR10';
  end if;

  select relrowsecurity, relforcerowsecurity into v_rate_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'sst_rate_schedule';
  if not v_rate_rls.relrowsecurity or not v_rate_rls.relforcerowsecurity then
    raise exception 'f_t1_sst_reference_tables tail: sst_rate_schedule RLS not enabled+forced (rls=%, force=%)',
      v_rate_rls.relrowsecurity, v_rate_rls.relforcerowsecurity using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'clara' and table_name = 'sst_rate_schedule'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       and grantee like 'clara\_%' and grantee <> 'clara_fn_owner'
  ) then
    raise exception 'f_t1_sst_reference_tables tail: a lane role holds a write grant on sst_rate_schedule -- zero direct app-role grants was the premise'
      using errcode = 'CLR10';
  end if;

  -- The ALTER: shape + the two live seed rows' byte-for-byte survival (a21-watch.test.mjs P1's
  -- premise, re-proven here rather than merely assumed backward-compatible).
  select count(*) into v_thr_id_count from clara.sst_threshold_schedule where id is not null;
  select count(*) into v_thr_item_no_star from clara.sst_threshold_schedule where item_no = '*';
  if v_thr_id_count <> 2 or v_thr_item_no_star <> 2 then
    raise exception 'f_t1_sst_reference_tables tail: sst_threshold_schedule id-populated %, item_no=''*'' % -- expected 2 / 2 (the additive ALTER must backfill both live rows via DEFAULT)',
      v_thr_id_count, v_thr_item_no_star using errcode = 'CLR10';
  end if;
  select effective_to, threshold_cents into v_thr_g_eff_to, v_thr_g_cents
    from clara.sst_threshold_schedule where service_group = 'G' and effective_from = date '2018-09-01';
  select effective_to, threshold_cents into v_thr_i_eff_to, v_thr_i_cents
    from clara.sst_threshold_schedule where service_group = 'I' and effective_from = date '2018-09-01';
  if v_thr_g_eff_to is not null or v_thr_i_eff_to is not null
     or v_thr_g_cents <> 50000000 or v_thr_i_cents <> 50000000 then
    raise exception 'f_t1_sst_reference_tables tail: a live seed row changed shape (G: eff_to=%, cents=%; I: eff_to=%, cents=%) -- expected both open-ended at 50,000,000',
      v_thr_g_eff_to, v_thr_g_cents, v_thr_i_eff_to, v_thr_i_cents using errcode = 'CLR10';
  end if;

  select pg_get_constraintdef(oid) into v_thr_pk from pg_constraint
   where conrelid = 'clara.sst_threshold_schedule'::regclass and contype = 'p';
  if v_thr_pk is distinct from 'PRIMARY KEY (service_group, item_no, effective_from)' then
    raise exception 'f_t1_sst_reference_tables tail: sst_threshold_schedule PK reads "%", expected the three-column widened form',
      v_thr_pk using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_thr_check_def from pg_constraint
   where conrelid = 'clara.sst_threshold_schedule'::regclass and conname = 'sst_threshold_schedule_threshold_cents_check';
  if v_thr_check_def is distinct from 'CHECK ((threshold_cents >= 0))' then
    raise exception 'f_t1_sst_reference_tables tail: threshold_cents CHECK reads "%", expected the relaxed >= 0 form',
      v_thr_check_def using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _ft1_pr1_pre where k = 'deploy_principal')
     or current_role <> (select v from _ft1_pr1_pre where k = 'deploy_principal') then
    raise exception 'f_t1_sst_reference_tables tail: role was not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  raise notice 'F-T1 PR-1 tail OK: clara.sst_rate_schedule created (6 seed rows -- 2 sales/4 service, 5 ad_valorem/1 per_unit, all migration-seeded with superseded_by/recorded_by NULL), RLS enabled+forced, zero app-role write grants, immutable+supersede triggers installed. clara.sst_threshold_schedule widened -- id populated + item_no=''*'' on both live rows, PK now (service_group, item_no, effective_from), threshold_cents CHECK relaxed to >=0 -- both G/I seed rows byte-unchanged otherwise (50,000,000 cents, open-ended). The reachable-closure write assertion ran and found zero writers on either table. Deploy principal restored.';
end $tail$;
