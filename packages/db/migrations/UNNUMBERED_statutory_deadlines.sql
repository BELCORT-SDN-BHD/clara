-- UNNUMBERED_statutory_deadlines.sql -- clara.statutory_deadlines: the ONE developer-seeded,
-- versioned, effective-dated table for statutory due dates, across every domain that needs
-- one (R-L22; docs/adr/README.md digest laws 80/81 -- "one architecture, one clock").
--
-- Design of record for the shape below: docs/plan/active/payroll-calendar-annexes.md Annex
-- A.1 ("F-T2's ask, sent to the conductor with this design -- not a claim of ownership") and
-- Annex A.2 (the due arithmetic), plus the gate record's OC-4 ruling (the two-date shape) and
-- decisions D-08/D-08b/D-08c (docs/plan/active/payroll-calendar-gate-record.md,
-- payroll-calendar-annexes.md Annex B).
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, AGENTS.md constraint 10). Authored
-- UNNUMBERED against the 0138 frontier -- renumber mechanically at merge (this file + its rig
-- cells; nothing else keys on the number except the schema_migrations ledger).
--
-- LANE NOTE (2026-08-27, TRUED against PROGRESS.md #371). This DDL was never F-A4/PR-1c's
-- content: the migration that actually landed as F-A4/PR-1c (0138 F_a4_pr_1c_close_agent_limb,
-- #368) shipped the close-domain agent limb (carrier, receipts, holds, settle). PROGRESS.md's
-- own #371 truing (`docs: 0137+0138 apply ceremony as-run + PROGRESS frontier truing`) already
-- re-labels the F-A4 row and the F-T2 row to match: this DDL is its own, currently-UNOWNED
-- lane under the payroll-calendar spec (F-T2's own words, live in PROGRESS.md today) -- an
-- earlier draft of this header called PROGRESS "stale" on this point; that is no longer true
-- as of the branch's own parent commit, and this file must not carry a claim that outlives its
-- own truth. This file IS that lane, built standalone. F-T2's own PR-1 (the nine seed rows +
-- three clara.client_fact_keys rows) is BLOCKED on this file merging; F-T1 (SST) is a second,
-- LATER contributor via domain='sst' (Annex A.1). THIS FILE SEEDS NO ROWS, MINTS NO WAKE
-- WRAPPER AND NO CHASE LOGIC -- the table and its walls, nothing else, per scope.
--
-- CARRIED GAP (conductor-resolved 2026-08-27, this lane's own build-time question). The gate
-- record's OC-2 ruling (finding M3) says the four monthly obligations' per-regulator period
-- definitions (PCB: deduction month; EPF: wage month; SOCSO/EIS: payment month) "live as DATA
-- in the statutory_deadlines rows F-T2 contributes" -- but Annex A.1's own column list (the
-- canonical DDL ask this file builds from) never names a period-basis column for it, and the
-- OC-2 card itself left the column conditional ("the period-basis column, if ruled, is
-- additive to A.1"). This file ships EXACTLY Annex A.1's column list, no invented column. The
-- period-basis question is CARRIED BY NAME to F-T2's own PR-1 (the rows train) -- that is
-- where the four obligations' semantics get authored against the owner's statutory research,
-- and an additive column is cheap before any rows exist. If PR-1 rules a column is needed, it
-- lands as a widening migration onto this table, extend-only, the same pattern every other
-- closed set here follows -- never a retrofit of this file.
--
-- NOTE FOR F-T2 PR-1's AUTHOR (seed values, not a DDL change). The gate record's OC-4 owner
-- ruling SUPERSEDES design §3.6's "never moved" framing and Annex A.2's roll-BACK direction
-- for holiday_rule='unverified': the legal due date actually rolls FORWARD per the
-- Interpretation Acts 1948/1967, and `effective_due` is a SEPARATE, distinctly-labelled
-- internal working-target field, not a replacement for the statutory date. This DDL stores
-- `holiday_rule` as a bare value per row and computes nothing -- the roll direction lives
-- entirely in F-A4's future oracle, so no column here changes -- but whoever seeds
-- 'unverified' rows at PR-1, and whoever builds that oracle, must read OC-4's ruling, not
-- A.2's now-superseded roll-back arithmetic, when deciding what `effective_due` means.
--
-- =====================================================================================
-- DEPARTURES REGISTER -- every place this file's built shape diverges from Annex A.1's own
-- text, in one place, so an A.1 auditor finds every delta here rather than diffing prose.
-- =====================================================================================
-- (1) RLS POSTURE. A.1 does not specify a grant/policy shape at all (that is db-migrations.md
--     + A.5 territory, not A.1's column list). This file ships ZERO clara_authenticated grant
--     and exactly one clara_fn_owner-only policy -- narrower than db-migrations.md's generic
--     firm-scoped default (inapplicable here: no firm_id column) and narrower than BOTH global
--     sibling tables it could have copied: clara.client_fact_keys grants clara_authenticated=r
--     unconditionally (a genuine counter-example on the grant question, not a precedent for
--     this table's choice) and clara.sst_threshold_schedule, at the live 0138 frontier, now
--     ALSO carries a grant (clara_freeform_ro=r, a 0131 freeform-read policy) -- so neither
--     sibling is actually zero-grant today. This table's owner-only posture is a DOCUMENTED
--     CHOICE grounded in Annex A.5's "never a raw SELECT grant on a base table" for the
--     specific reader this table is built for (list_statutory_calendar, PR-3, unbuilt), not a
--     forced default inherited from either precedent. See the RLS comment block below for the
--     corrected precedent wording.
-- (2) conflict/source_note "both citations" pairing. A.1 calls this a "paired CHECK"; this
--     file does NOT build a content-shape CHECK for it (see the `conflict` column's own
--     comment for why -- there is no second source_note column to pair against mechanically,
--     and a citation-count regex would be inventing a format convention A.1 never specifies).
--     The discipline stays a PR-1 authoring/review obligation, named honestly rather than
--     claimed as a wall this file does not have.
-- (3) recorded_by is TEXT, not a clara.users uuid FK (client_facts' own WHO column type). See
--     the WHO/BASIS/WHEN trio's own comment for the precedent cites
--     (client_turnover_accounts.set_by / sst_future_attestations.reviewer, both 0016) -- this
--     table has no live session actor, ever, so a clara.users FK would have no honest value to
--     hold.
-- (4) OC-2's period-basis column: NOT built here, carried by name to F-T2 PR-1 -- see the
--     CARRIED GAP paragraph above for the full reasoning.
-- (5) A new CHECK beyond A.1's own list: ck_statutory_deadlines_due_day_calendar_valid, bounding
--     due_day to the real day-count of due_month wherever both are set (only
--     `date_in_following_year` carries both) -- A.1 never asked for this, but an impossible
--     combination (e.g. due_month=2, due_day=31) would otherwise pass every A.1-named CHECK and
--     only fail later, inside F-A4's oracle, as a raw make_date() 22008. Added here because a
--     malformed row is cheaper to refuse at INSERT than to debug from an oracle crash.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: EMPTY
-- =====================================================================================
-- Every relation and function this file installs is NEW. No live body is replaced -- there
-- is no ceremony, no quiesce window, and no prosrc-SHA prestate pin to take. The tail below
-- re-proves the built shape as a positive census rather than this comment asserting it.
set local statement_timeout = '2min'; -- precautionary, not load-bearing: this file creates
  -- one empty table plus its indexes/triggers/policy and one trigger function -- zero
  -- backfill, zero rows, nothing to time out on.

-- =====================================================================================
-- S0 -- PRESTATE. What this file assumes about the frontier it lands on.
-- =====================================================================================
do $s0$
begin
  if to_regclass('clara.statutory_deadlines') is not null then
    raise exception 'S0: clara.statutory_deadlines already exists -- refusing to re-birth'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception 'S0: a required generic trigger helper (_tf_append_only / _tf_no_truncate) is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;
end $s0$;

-- =====================================================================================
-- S1 -- clara.statutory_deadlines (Annex A.1). GLOBAL vocabulary, no firm dimension -- the
-- same posture as clara.client_fact_keys (0055) and clara.sst_threshold_schedule (0016), not
-- the generic firm-scoped "every new table" shape db-migrations.md describes (that shape has
-- no firm_id column to scope on here). OWNED by clara_fn_owner (the 0043 discipline: the
-- house's tables, trigger functions and doors are owned by clara_fn_owner; forced RLS binds
-- the owner, so ownership is part of the RLS story, not cosmetics).
-- =====================================================================================
set role clara_fn_owner;

create table clara.statutory_deadlines (
  id                  uuid        primary key default gen_random_uuid(),

  -- IDENTITY. obligation_code/authority stay OPEN text (no enum): F-T2's nine codes and four
  -- regulators are THIS domain's rows, not the table's whole vocabulary -- F-T1 (SST)
  -- contributes its own codes/authority under domain='sst', a regulator this design never
  -- names. domain itself IS a closed set: "one table, two row sets, no second path" (law 81)
  -- names exactly two members today; a third domain widens it via a reviewed migration, the
  -- same extend-only pattern every other closed set below follows.
  domain              text        not null,
  obligation_code     text        not null check (btrim(obligation_code) <> ''),
  authority           text        not null check (btrim(authority) <> ''),
  cadence             text        not null,

  -- THE DUE ARITHMETIC (Annex A.2). due_rule_kind is the CLOSED set of three; due_day/
  -- due_month are paired to it below so a reader can never pick up a NULL parameter the rule
  -- kind actually needs. statutory_due_date/effective_due are DELIBERATELY NOT stored
  -- columns: Annex A.2's arithmetic computes both from due_rule_kind + a period, at read
  -- time, in F-A4's own oracle (not built by this file) -- a stored derivation here would be
  -- exactly the kind of number this table cannot own without a live period to compute it
  -- against.
  due_rule_kind       text        not null,
  due_day             int,
  due_month           int,

  -- THE CITED CLAIM. wording is the regulator's VERBATIM sentence; instrument names the
  -- section. Both are the citation's substance, never decoration (digest law 16).
  wording             text        not null check (btrim(wording) <> ''),
  instrument          text        not null check (btrim(instrument) <> ''),

  -- THE TWO-DATE SHAPE (R-L24; gate record OC-4 ruling). holiday_rule is per-regulator and
  -- CLOSED at two members today (next_working_day / unverified). working_day_basis stays
  -- OPEN text (no CHECK enum) on purpose: it is the visible-limitation flag OQ-7 may widen
  -- later (a federal-holidays table, federal+state) without this DDL pre-committing to that
  -- closed set now -- v1 ships exactly one value, 'weekends_only', by seed-time convention,
  -- not by a constraint this file has grounds to write (unlike holiday_rule/evidence_grade/
  -- cite_role, Annex A.1 never states working_day_basis as "the closed set of ...").
  holiday_rule        text        not null,
  working_day_basis   text        not null check (btrim(working_day_basis) <> ''),

  -- conflict: true when two official sources of the SAME regulator disagree (R-L24/D-08b) --
  -- the earlier date is adopted and BOTH citations belong in source_note. There is no second
  -- source_note column to pair conflict against mechanically (Annex A.1 lists one), so the
  -- "both citations present" discipline is a PR-1 (F-T2's own seed migration) authoring/
  -- review obligation, not a DB CHECK this file can honestly claim -- see the tail note below
  -- rather than a fabricated content-shape regex.
  conflict            boolean     not null default false,

  -- THE CITATION, AS A COLUMN NOT A COMMENT (R-L22; sst_threshold_schedule's source_note
  -- idiom, 0016:242). evidence_grade/cite_role are closed sets. P-11's "a row may not be
  -- SEEDED at grade=index" is an authoring-time discipline for F-T2's PR-1, not a value this
  -- CHECK forbids -- the column's domain honestly includes both, per Annex A.1's own words
  -- ("the column exists so a future relaxation is a visible decision").
  source_url          text        not null check (btrim(source_url) <> ''),
  source_note         text        not null check (btrim(source_note) <> ''),
  source_accessed_on  date        not null,
  evidence_grade      text        not null,
  cite_role           text        not null,

  -- notice_lead_days is EXPLICITLY NON-STATUTORY (decision D-10) -- when Clara speaks is a
  -- product decision, never a law, and this column exists so the two are never fused into
  -- one cited field.
  notice_lead_days    int         not null check (notice_lead_days >= 0),

  -- EFFECTIVE-DATING + IMMUTABLE/SUPERSEDE, client_facts' idiom (0055:394-408). CONDUCTOR
  -- RULING (this lane's fix round): the window is CLOSED/INCLUSIVE on its upper bound --
  -- `effective_to is null or effective_to >= effective_from` below, so a single-day window is
  -- effective_to == effective_from -- matching the estate's OWN live idiom
  -- (client_turnover_accounts, client_facts' sibling effective-dated tables, 0016/0055), not
  -- the half-open [from, to) phrase Annex A.1's prose uses. A.1's phrasing is the outlier here,
  -- not this file's constraint.
  effective_from      date        not null,
  effective_to        date,
  superseded_by       uuid        references clara.statutory_deadlines(id) deferrable initially deferred,
  superseded_at       timestamptz,

  -- THE WHO/BASIS/WHEN TRIO (client_facts' idiom, 0055:394-399, ADR-062 via E-R12(3)).
  -- recorded_by is TEXT, not a clara.users FK: this table has NO runtime writer, EVER (the
  -- design's own PR-1 line -- "docs/DB only, no writer, no grant") -- every row a migration
  -- authors, so "who" is a developer/reviewer handle, never a live authenticated session
  -- (client_turnover_accounts.set_by / sst_future_attestations.reviewer, 0016, are the same
  -- free-text-provenance idiom for a non-session actor). basis_kind is closed to its one
  -- stated member (Annex A.1: "basis_kind='migration_seed' for a developer-seeded row") --
  -- a table with no other writer needs no wider set.
  recorded_by         text        not null check (btrim(recorded_by) <> ''),
  basis               text        not null check (btrim(basis) <> ''),
  basis_kind          text        not null,
  recorded_at         timestamptz not null default now(),

  constraint ck_statutory_deadlines_domain check (domain in ('payroll', 'sst')),
  constraint ck_statutory_deadlines_cadence check (cadence in ('monthly', 'annual')),
  constraint ck_statutory_deadlines_due_rule_kind check (due_rule_kind in
    ('day_of_month_following', 'date_in_following_year', 'last_day_of_month_in_following_year')),
  constraint ck_statutory_deadlines_holiday_rule check (holiday_rule in
    ('next_working_day', 'unverified')),
  constraint ck_statutory_deadlines_evidence_grade check (evidence_grade in ('direct', 'index')),
  constraint ck_statutory_deadlines_cite_role check (cite_role in
    ('date_authority', 'structural_only')),
  constraint ck_statutory_deadlines_basis_kind check (basis_kind in ('migration_seed')),

  -- Annex A.2: due_day/due_month are paired to due_rule_kind, never independently NULLable --
  -- a reader picking up the wrong parameter for a rule kind is a silently wrong date, not a
  -- wall. Range checks are a second, independent guard so a bad rule-kind pairing and an
  -- out-of-range day/month fail with distinct, diagnosable constraint names.
  constraint ck_statutory_deadlines_due_params check (
    (due_rule_kind = 'day_of_month_following'
       and due_day is not null and due_month is null)
    or (due_rule_kind = 'date_in_following_year'
       and due_day is not null and due_month is not null)
    or (due_rule_kind = 'last_day_of_month_in_following_year'
       and due_day is null and due_month is not null)
  ),
  constraint ck_statutory_deadlines_due_day_range check (due_day is null or due_day between 1 and 31),
  constraint ck_statutory_deadlines_due_month_range check (due_month is null or due_month between 1 and 12),

  -- Fix round (independent review): an impossible (due_month, due_day) pair -- e.g. (2, 31) --
  -- passes every CHECK above (both are individually in-range) and would only fail LATER, as a
  -- raw make_date() 22008 inside F-A4's oracle (Annex A.2's date_in_following_year arithmetic,
  -- the only rule kind that feeds both into make_date together; day_of_month_following uses
  -- interval addition instead and never raises, so it needs no bound here -- vacuously
  -- satisfied below since its own due_month is always NULL). February is bounded to 28, NEVER
  -- 29: a fixed-year statutory date landing on "29 February of the following year" does not
  -- exist in law (three years in four there is no such day), and the row that actually needs a
  -- leap-aware Feb deadline (form_ea_ec) uses last_day_of_month_in_following_year instead,
  -- which self-adjusts via make_date(y,m,1)+interval, never storing a fixed day number.
  constraint ck_statutory_deadlines_due_day_calendar_valid check (
    due_month is null or due_day is null or due_day <= case due_month
      when 2 then 28
      when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30
      else 31
    end
  ),

  constraint ck_statutory_deadlines_effective_range check (
    effective_to is null or effective_to >= effective_from),
  constraint ck_statutory_deadlines_supersession_paired check (
    (superseded_by is null) = (superseded_at is null))
);

-- Partial unique index for the live row per key (Annex A.1, verbatim shape).
create unique index uq_statutory_deadlines_live on clara.statutory_deadlines
  (domain, obligation_code, effective_from) where superseded_at is null;

-- The ONE lawful update is the one-time supersession stamp; everything else on a row is
-- immutable from INSERT, and a row already superseded is immutable outright -- the
-- client_facts trigger shape (0055:428-451), retargeted at this table's own column set.
create function clara._tf_statutory_deadlines_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded statutory_deadlines row is immutable'
      using errcode = 'CLR10', detail = '{"reason":"statutory_deadline_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id                 is distinct from old.id
     or new.domain             is distinct from old.domain
     or new.obligation_code    is distinct from old.obligation_code
     or new.authority          is distinct from old.authority
     or new.cadence            is distinct from old.cadence
     or new.due_rule_kind      is distinct from old.due_rule_kind
     or new.due_day            is distinct from old.due_day
     or new.due_month          is distinct from old.due_month
     or new.wording            is distinct from old.wording
     or new.instrument         is distinct from old.instrument
     or new.holiday_rule       is distinct from old.holiday_rule
     or new.working_day_basis  is distinct from old.working_day_basis
     or new.conflict           is distinct from old.conflict
     or new.source_url         is distinct from old.source_url
     or new.source_note        is distinct from old.source_note
     or new.source_accessed_on is distinct from old.source_accessed_on
     or new.evidence_grade     is distinct from old.evidence_grade
     or new.cite_role          is distinct from old.cite_role
     or new.notice_lead_days   is distinct from old.notice_lead_days
     or new.effective_from     is distinct from old.effective_from
     or new.effective_to       is distinct from old.effective_to
     or new.recorded_by        is distinct from old.recorded_by
     or new.basis              is distinct from old.basis
     or new.basis_kind         is distinct from old.basis_kind
     or new.recorded_at        is distinct from old.recorded_at then
    raise exception 'statutory_deadlines admits exactly one update: the supersession stamp (superseded_by and superseded_at together, set once)'
      using errcode = 'CLR10', detail = '{"reason":"statutory_deadline_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_statutory_deadlines_supersede_only() from public;

create trigger t_statutory_deadlines_supersede_only before update on clara.statutory_deadlines
  for each row execute function clara._tf_statutory_deadlines_supersede_only();
create trigger t_statutory_deadlines_no_delete before delete on clara.statutory_deadlines
  for each row execute function clara._tf_append_only();
create trigger t_statutory_deadlines_no_truncate before truncate on clara.statutory_deadlines
  for each statement execute function clara._tf_no_truncate();

-- RLS: forced, owner-only. NO clara_authenticated grant/policy on this base table --
-- deliberate, and a departure from db-migrations.md's generic "scoped human read" default,
-- which assumes a firm_id column this GLOBAL table does not have. This table's intended
-- human reader is F-T2 PR-3's clara.list_statutory_calendar (unbuilt, out of this lane's
-- scope) -- a SECURITY DEFINER wrapper with a bookkeeper+ floor IN THE BODY, the
-- get_close_plan idiom (0064:154,280-285,312), "never a raw SELECT grant on a base table"
-- (Annex A.5, stated twice in the design set). A future definer function owned by
-- clara_fn_owner reaches this table through the owner policy below without any separate
-- grant. PRECEDENTS, CORRECTED against the LIVE 0138 frontier (fix round -- an earlier draft
-- over-claimed both): clara.sst_threshold_schedule holds ZERO clara_authenticated grant
-- (verbatim true, still the shared ground), but is no longer definer-only reach full stop --
-- it now ALSO carries `clara_freeform_ro=r` behind a 0131 freeform-read policy, so
-- statutory_deadlines is STRICTER than its own precedent's live shape (this table's `relacl`
-- is NULL -- no grantee at all, proven in the tail below). clara.client_fact_keys is a
-- COUNTER-EXAMPLE on the grant question, not a supporting precedent: it holds
-- `clara_authenticated=r` behind an unconditional human read policy, because its vocabulary
-- (entity-type labels, key descriptions) has no floor to protect. This table's owner-only
-- posture is therefore a genuine documented CHOICE -- grounded in Annex A.5's floor
-- requirement for THIS table's future reader -- not a default either sibling forces.
alter table clara.statutory_deadlines enable row level security;
alter table clara.statutory_deadlines force row level security;
create policy p_statutory_deadlines_owner on clara.statutory_deadlines
  for all to clara_fn_owner using (true) with check (true);

reset role;

-- =====================================================================================
-- S2 -- TAIL SELF-PROOF. Raises on failure; every claim is re-READ from the catalog, never
-- taken from this file's own say-so.
-- =====================================================================================
do $s2$
declare
  v_bad     text;
  v_n       int;
  v_cols    text[];
  v_expect_cols constant text[] := array[
    'id','domain','obligation_code','authority','cadence','due_rule_kind','due_day',
    'due_month','wording','instrument','holiday_rule','working_day_basis','conflict',
    'source_url','source_note','source_accessed_on','evidence_grade','cite_role',
    'notice_lead_days','effective_from','effective_to','superseded_by','superseded_at',
    'recorded_by','basis','basis_kind','recorded_at'
  ];
  v_cons    text[];
  v_expect_cons constant text[] := array[
    'ck_statutory_deadlines_basis_kind','ck_statutory_deadlines_cadence',
    'ck_statutory_deadlines_cite_role','ck_statutory_deadlines_domain',
    'ck_statutory_deadlines_due_day_calendar_valid',
    'ck_statutory_deadlines_due_day_range','ck_statutory_deadlines_due_month_range',
    'ck_statutory_deadlines_due_params','ck_statutory_deadlines_due_rule_kind',
    'ck_statutory_deadlines_effective_range','ck_statutory_deadlines_evidence_grade',
    'ck_statutory_deadlines_holiday_rule','ck_statutory_deadlines_supersession_paired',
    'statutory_deadlines_authority_check','statutory_deadlines_notice_lead_days_check',
    'statutory_deadlines_obligation_code_check','statutory_deadlines_pkey',
    'statutory_deadlines_recorded_by_check','statutory_deadlines_source_note_check',
    'statutory_deadlines_source_url_check','statutory_deadlines_superseded_by_fkey',
    'statutory_deadlines_wording_check','statutory_deadlines_instrument_check',
    'statutory_deadlines_working_day_basis_check','statutory_deadlines_basis_check'
  ];
  v_trig    text[];
begin
  -- (1) The table exists, is owned by clara_fn_owner, and carries EXACTLY the expected
  --     column set in ordinal order (closed-world census -- never trust the CREATE's own
  --     text).
  if to_regclass('clara.statutory_deadlines') is null then
    raise exception 'S2: clara.statutory_deadlines does not exist after S1' using errcode = 'CLR10';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c
       where c.oid = 'clara.statutory_deadlines'::regclass) <> 'clara_fn_owner' then
    raise exception 'S2: clara.statutory_deadlines is not owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select array_agg(a.attname order by a.attnum) into v_cols
    from pg_attribute a
    where a.attrelid = 'clara.statutory_deadlines'::regclass
      and a.attnum > 0 and not a.attisdropped;
  if v_cols <> v_expect_cols then
    raise exception 'S2: column census mismatch -- got %, expected %', v_cols, v_expect_cols
      using errcode = 'CLR10';
  end if;

  -- (2) The constraint-name census -- every CHECK/PK/FK pinned by conname, never counted.
  select coalesce(array_agg(con.conname order by con.conname), '{}') into v_cons
    from pg_constraint con
    where con.conrelid = 'clara.statutory_deadlines'::regclass;
  if v_cons <> (select array_agg(x order by x) from unnest(v_expect_cons) x) then
    raise exception 'S2: constraint-name census mismatch -- got %, expected %',
      v_cons, (select array_agg(x order by x) from unnest(v_expect_cons) x)
      using errcode = 'CLR10';
  end if;

  -- (3) The partial unique index exists with the exact predicate and key.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'clara' and tablename = 'statutory_deadlines'
       and indexname = 'uq_statutory_deadlines_live'
       and indexdef like '%UNIQUE INDEX uq_statutory_deadlines_live ON clara.statutory_deadlines USING btree (domain, obligation_code, effective_from) WHERE (superseded_at IS NULL)%'
  ) then
    raise exception 'S2: uq_statutory_deadlines_live is missing or does not carry the exact partial-unique shape'
      using errcode = 'CLR10';
  end if;

  -- (4) Trigger census -- exactly three, by name, on the expected events.
  select coalesce(array_agg(t.tgname order by t.tgname), '{}') into v_trig
    from pg_trigger t
    where t.tgrelid = 'clara.statutory_deadlines'::regclass and not t.tgisinternal;
  if v_trig <> array['t_statutory_deadlines_no_delete','t_statutory_deadlines_no_truncate',
                      't_statutory_deadlines_supersede_only'] then
    raise exception 'S2: trigger census mismatch -- got %', v_trig using errcode = 'CLR10';
  end if;

  -- (5) The trigger function: SECURITY DEFINER, owned by clara_fn_owner, ungranted to PUBLIC.
  if not exists (
    select 1 from pg_proc p
     where p.oid = 'clara._tf_statutory_deadlines_supersede_only()'::regprocedure
       and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
  ) then
    raise exception 'S2: clara._tf_statutory_deadlines_supersede_only is missing, not SECURITY DEFINER, or not owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', 'clara._tf_statutory_deadlines_supersede_only()', 'execute') then
    raise exception 'S2: PUBLIC can EXECUTE the supersede-only trigger function -- the revoke did not take'
      using errcode = 'CLR10';
  end if;

  -- (6) RLS: enabled + forced, exactly one policy, unconditional, clara_fn_owner only.
  if not exists (
    select 1 from pg_class c
     where c.oid = 'clara.statutory_deadlines'::regclass
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'S2: clara.statutory_deadlines does not carry ENABLE + FORCE row level security'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_policies
    where schemaname = 'clara' and tablename = 'statutory_deadlines';
  if v_n <> 1 then
    raise exception 'S2: expected exactly 1 policy on clara.statutory_deadlines, found %', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'clara' and tablename = 'statutory_deadlines'
       and policyname = 'p_statutory_deadlines_owner'
       and roles = array['clara_fn_owner']::name[]
       and qual = 'true' and with_check = 'true'
  ) then
    raise exception 'S2: p_statutory_deadlines_owner does not carry the expected role/qual/with_check shape'
      using errcode = 'CLR10';
  end if;

  -- (7) THE TRUE CLOSED WORLD (fix round -- a five-role roster probe is a diagnosis, not a
  --     proof: a sixth role this file never thought to name would sail past it silently).
  --     relacl IS NULL means no ACL entry exists AT ALL -- not even an explicit grant back to
  --     clara_fn_owner itself -- which is the one predicate no future role, named or not, can
  --     slip past.
  if (select relacl from pg_class where oid = 'clara.statutory_deadlines'::regclass) is not null then
    raise exception 'S2: clara.statutory_deadlines carries a non-null relacl -- some role holds an explicit grant'
      using errcode = 'CLR10';
  end if;
  -- Roster probe, kept as a NAMED diagnosis beneath the true closed-world check above: if (7)
  -- ever fires, this pinpoints WHICH of the known app roles reaches the table (informational
  -- only -- (7)'s relacl check is what actually holds the wall now).
  select string_agg(x.role || ':' || x.priv, ', ') into v_bad
    from (values
      ('clara_authenticated','select'),('clara_authenticated','insert'),
      ('clara_authenticated','update'),('clara_authenticated','delete'),
      ('clara_agent_ro','select'),
      ('clara_wake_interactive','select'),('clara_wake_interactive','insert'),
      ('clara_wake_proactive','select'),('clara_wake_proactive','insert'),
      ('clara_runtime','select'),('clara_runtime','insert')
    ) x(role, priv)
    where has_table_privilege(x.role, 'clara.statutory_deadlines', x.priv);
  if v_bad is not null then
    raise exception 'S2: unexpected reach on clara.statutory_deadlines (roster diagnosis) -- %', v_bad using errcode = 'CLR10';
  end if;

  -- (8) Zero rows -- this file seeds nothing.
  select count(*) into v_n from clara.statutory_deadlines;
  if v_n <> 0 then
    raise exception 'S2: clara.statutory_deadlines carries % row(s), expected 0 -- this file seeds none', v_n
      using errcode = 'CLR10';
  end if;

  raise notice 'statutory_deadlines tail: OK -- 27 columns, 25 named constraints, the partial unique live-row index, 3 triggers (supersede-only / no-delete / no-truncate), forced RLS with exactly 1 owner-only policy, relacl NULL (true closed world) plus a clean 5-role roster diagnosis, zero rows, table + trigger function both owned by clara_fn_owner with PUBLIC execute revoked.';
end $s2$;
