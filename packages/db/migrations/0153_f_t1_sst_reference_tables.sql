-- 0153_f_t1_sst_reference_tables.sql -- F-T1 (the SST engine) PR-1: the two SST reference
-- tables. (Authored as UNNUMBERED_f_t1_sst_reference_tables.sql; number 0153 claimed at merge
-- prep 2026-08-30, hard constraint 10 -- every self-reference below uses the stable stem.) Design of record: docs/plan/active/sst-engine-design.md (S1-S4, S1 point 4),
-- -design-part2.md (S8's PR-1 row), -annexes.md (Annex A.1, A.1a, A.9's owner), -annexes-2.md
-- (Annex C-4/C-5), -gate-record.md + -gate-record-part2.md (OQ-14). Statutory row ids (S-*/V-*)
-- resolve in sst-engine-survey.md S3, fetched/verified 2026-08-23.
--
-- FIX ROUND (conductor review, 2026-08-24) -- MERGEABLE-WITH-FIXES verdict, one blocker (F1) +
-- six findings (F2-F7), all executed in this revision:
--   F1 (BLOCKER) the credit/charge-card row cited the wrong instrument and date -- corrected.
--   F2 predecessor rows seeded exactly as far as the review's verified instruments reach.
--      RE-FIXED at the delta-confirm (2026-08-24): the first draft wrongly stamped the four
--      predecessors superseded_by/superseded_at, which made the live-row filter blind to them
--      (a rate change is a NEW row, never a correction -- effective_to alone closes the old
--      one). Both stamps are now NULL on all ten rows; see S2 below and the tail's own
--      two-direction re-probe.
--   F3 the threshold table gets the SAME immutability+supersede trigger pair as its sibling.
--   F4 a self-supersession CHECK on both tables (superseded_by IS DISTINCT FROM id).
--   F5 basis_kind closed to the 0055:395 four-value vocabulary + the document-source tie,
--      both tables.
--   F7 the two orphaned obligations Annex A.1 already scoped INTO this PR: the a21-watch.test.mjs
--      P1 re-cut and a measured cell for the 0016:882-886 schedule-note residual.
-- F6's conceptual note (the five group-grain readers; the no-default-service-tax evaluator law)
-- is DOC-ONLY in this PR -- recorded in Annex A.1 and Annex F respectively as named F-T1
-- obligations; the successor reader body and the evaluator-side enforcement are later-PR work.
-- Every citation this lane did NOT independently re-fetch against a primary source says so.
--
-- REBASE (2026-08-29): built and reviewed against the 0127 frontier, rebased onto 0147 and
-- re-verified there. Every catalog premise this file pins re-derived UNCHANGED at the live
-- bodies (the prestate's five, the tail's whole census). ONE pin had drifted and is fixed
-- EXTEND-ONLY in S4: the reachable-closure ROOTS ROSTER was an eight-name literal, complete at
-- 0127 and short by five roles at 0147 -- it is now DERIVED from pg_roles, floor-proven against
-- the eight structural names so the derivation cannot pass vacuously, and paired with a
-- PUBLIC-executable census so the named-role roster is provably complete. Nothing was relaxed;
-- the scan got strictly WIDER (405 roots/783 functions -> 418/800, measured on the rebase rig).
--
-- DELTA REVIEW OF THAT REBASE (2026-08-29) -- four more premises trued before they become
-- immutable at apply. All four were things this FILE ASSERTED that the 0147 catalog contradicts,
-- or pointers that resolve to nothing:
--   F-R1 a SECOND drifted premise: S1 claimed sst_threshold_schedule carries "one owner policy,
--        nothing else". It carries TWO policies and a table-level grant since 0131. Trued at S1
--        with the freeform-reach consequence named and an obligation attached; both policies,
--        the grant and the column count are now CENSUSED by the battery, not described.
--   F-R2 the closure assertion floored its ROSTER but not its ROOTS/REACHED -- a scan aimed at a
--        nonexistent schema printed "assertion OK" over a planted offender. Both are floored now
--        and both counts are printed.
--   F-R3 Annex G.1's obligation was reachable only through two dead pointers; repointed, and a
--        standing tripwire added so the obligation is enforced rather than merely written down.
--   F-R4 the roots delta (13) and the closure delta (17) were conflated; both stated as measured.
--
-- THE BATTERY IS SINGLE-SHOT PER DATABASE, BY DESIGN, AND SAYS SO HERE (O-3). Its immutability
-- cell inserts two throwaway rows into clara.sst_rate_schedule, which is append-only with a
-- DELETE trigger, so they cannot be cleaned up; its seed cell asserts exactly TEN rows. Running
-- the battery twice against the SAME database therefore fails the second time on the row count
-- and on uq_sst_rate_schedule_live -- correctly, and not a defect. CI gets a fresh database per
-- run, which is the shape this is written for.
--
-- SCOPE, EXACTLY (design-part2.md S8 PR-1 row, as widened by the fix round above): (1)
-- clara.sst_rate_schedule, greenfield, + a narrow cited seed with its verified predecessors --
-- (2) the reachable-closure write assertion, armed for BOTH SST reference tables -- (3) the
-- clara.sst_threshold_schedule ALTER, Annex A.1's ordered specification, now including the same
-- immutability trigger pair as its sibling -- (4) PRD.md:215's prose-rates correction (a doc
-- edit, this migration's sibling change, not SQL).
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
-- sst_rate_schedule's SEED -- TEN ROWS, ALL CITED. Six CURRENTLY-LIVE rows (the four headline
-- ad-valorem rates, the one credit/charge-card per-unit fee, and the V-3 retroactive-correction
-- flagship) plus four VERIFIED PREDECESSOR rows the fix round's F2 ruling adds -- each closing by
-- effective_to alone, chronologically adjacent to its successor above, superseded_by left NULL
-- on ALL TEN rows (F2 RE-FIXED 2026-08-24: a rate change is a new row, never a correction --
-- stamping a predecessor superseded made the live-row filter blind to it). Seeded exactly as far
-- back as a verified instrument reaches and no further (TA-P2's "a missing row REFUSES" idiom
-- governs everything earlier). NOT SEEDED, ON
-- PURPOSE, NAMED SO A LATER READER DOES NOT ASSUME AN OMISSION IS A GAP IN THIS FILE RATHER THAN
-- A NAMED OPEN QUESTION:
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
-- live), one seed DO block (ten rows into that new table), one ALTER TABLE (widened per Annex
-- A.1 plus the F3-F5 fix-round hardening, all backward-compatible with the two live seed rows
-- and every existing reader -- Annex A.1's "every new column nullable, so 0016:247-248's two
-- seed rows need no backfill"), one DO-block assertion (reads the catalog, writes nothing). No
-- live function body is replaced. No D1 write-quiesce obligation.

set local statement_timeout = '5min';   -- PRECAUTIONARY: small DDL + a 10-row seed + a catalog scan.

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
--    no firm_id (Tier-1 facts are firm-independent, Annex A.1's Table DDL posture). basis_kind
--    and the document-source tie mirror client_facts' 0055:395/413 CHECKs verbatim in
--    VOCABULARY (F5) but NOT in nullability -- a migration-seeded row here has no governed
--    recorder at all, unlike client_facts, so basis_kind stays nullable and the vocabulary CHECK
--    is written to pass a NULL, never to require one.
-- =====================================================================================
set role clara_fn_owner;

create table clara.sst_rate_schedule (
  id                 uuid primary key default gen_random_uuid(),
  tax_type           text not null check (tax_type in ('sales','service')),
  scope_key          text not null check (btrim(scope_key) <> ''),
  -- Three rate FORMS (design S3.1, S-1/V-2/F-6): a percentage (ad_valorem, in basis points --
  -- the estate's existing SST unit, opening_items.sst_rate_bp, survey S1.4: 800 = 8%), a flat
  -- per-unit money amount (per_unit -- RM25/card), or a specific per-measure money amount
  -- (per_measure -- RM/litre, RM/kg, Second Schedule). Exactly one of rate_bp / rate_amount_sen
  -- is populated, and it is the one rate_kind names -- not merely "at least one", which would
  -- admit a per_unit row silently carrying a percentage. unit_code names the measure/unit for
  -- the two money-amount forms and is meaningless (and refused) for a percentage.
  rate_kind          text not null check (rate_kind in ('ad_valorem','per_unit','per_measure')),
  rate_bp            int,
  rate_amount_sen    bigint,
  unit_code          text,
  effective_from     date not null,
  effective_to       date,                    -- HALF-OPEN (S3.1): the day this rate stops applying.
  superseded_by      uuid references clara.sst_rate_schedule(id) deferrable initially deferred,
  superseded_at      timestamptz,
  recorded_by        uuid references clara.users(id),
  basis              text,
  -- F5 (conductor fix-round 2026-08-24): closed to the 0055:395 four-value vocabulary,
  -- NULLABLE (a migration-seeded row carries no recorder at all).
  basis_kind         text check (basis_kind is null or basis_kind in
                        ('owner_instruction','document','registry_lookup','interview_carryover')),
  -- F5: the document-source tie, mirroring 0055:413's ck_client_facts_document_basis verbatim.
  source_document_id uuid references clara.documents(id),
  recorded_at        timestamptz not null default now(),
  source_note        text not null check (btrim(source_note) <> ''),
  constraint ck_sst_rate_schedule_rate_bp_positive     check (rate_bp is null or rate_bp > 0),
  constraint ck_sst_rate_schedule_rate_amount_positive check (rate_amount_sen is null or rate_amount_sen > 0),
  constraint ck_sst_rate_schedule_rate_kind_bp         check ((rate_kind = 'ad_valorem') = (rate_bp is not null)),
  constraint ck_sst_rate_schedule_rate_kind_amount     check ((rate_kind in ('per_unit','per_measure')) = (rate_amount_sen is not null)),
  constraint ck_sst_rate_schedule_unit_code            check ((rate_kind in ('per_unit','per_measure')) = (unit_code is not null)),
  constraint ck_sst_rate_schedule_effective_order      check (effective_to is null or effective_to > effective_from),
  constraint ck_sst_rate_schedule_supersession_paired  check ((superseded_by is null) = (superseded_at is null)),
  -- F4 (conductor fix-round 2026-08-24): self-supersession is forgery, not history -- a row that
  -- points superseded_by at ITSELF can defeat the live-row reasoning a reader builds on top of
  -- this column pair. Blocked structurally; there is no legitimate reading of self-reference.
  constraint ck_sst_rate_schedule_no_self_supersede    check (superseded_by is distinct from id),
  -- The governed-origin conjunct (Annex A.1's sst_threshold_schedule ALTER carries the identical
  -- shape): a row that names a human recorder must also name why. A migration-seeded row (every
  -- row in this file's seed) leaves recorded_by NULL and is exempt by construction, exactly as
  -- the two live sst_threshold_schedule seed rows are today.
  constraint ck_sst_rate_schedule_governed_origin check (
    recorded_by is null or (btrim(coalesce(basis,'')) <> '' and basis_kind is not null)
  ),
  -- F5: a document rides a document basis, and ONLY a document basis (0055:413's two-way
  -- reading verbatim) -- a stray document id on a non-document basis would be provenance
  -- theatre; a 'document' basis with no document id names nothing.
  constraint ck_sst_rate_schedule_document_basis check (
    (basis_kind = 'document') = (source_document_id is not null)
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
-- Zero direct app-role grants for THIS table (Annex A.1): the rate schedule is read only through
-- a DEFINER evaluator, never queried directly by a human or agent role. No GRANT statement
-- follows for any clara_* lane role, and the battery pins that closed world.
--
-- THE SIBLING'S POSTURE IS NO LONGER THE SAME, AND THIS FILE USED TO SAY IT WAS (rebase fix,
-- 2026-08-29 -- F-R1). At the 0127 frontier this lane was built on, clara.sst_threshold_schedule
-- carried ONE owner policy and nothing else, and the sentence here said so. MEASURED at 0147 it
-- carries TWO policies and a table-level grant:
--   * p_sst_threshold_schedule_owner    -- 0016, for all to clara_fn_owner
--   * p_sst_threshold_schedule_freeform -- 0131:1430, FOR SELECT TO clara_freeform_ro,
--                                          using (clara._freeform_admitted())
--   * grant select on ... clara.sst_threshold_schedule to clara_freeform_ro -- 0131:1316-1329
-- So the two tables' postures DIVERGE: sst_rate_schedule is closed, sst_threshold_schedule is
-- readable by the F-A6 freeform lane behind its arm. Both are now censused by name in the
-- battery rather than described in prose, because prose is what went stale here.
--
-- CONSEQUENCE THIS FILE MUST OWN, NOT DISCOVER LATER: section 3's ALTER is additive, and
-- clara_freeform_ro's grant is TABLE-level, not column-level -- so widening the table from FIVE
-- columns to THIRTEEN widens what the freeform read lane can see on it by the same eight
-- columns, recorded_by (-> clara.users) and source_document_id (-> clara.documents) among them.
-- ACCEPTED FOR NOW, on measured grounds and not on convenience: every one of the eight is NULL
-- on both live rows and on every row this file writes (nothing here populates a governed
-- recorder), the lane is arm-gated by clara._freeform_admitted() so an unarmed session reads
-- nothing at all, and every freeform read is logged to clara.freeform_read_log. There is no new
-- FK-traversal reach either: the freeform lane already holds select on clara.users and
-- clara.documents (0131:1328), so a populated id would name a row that lane can already read.
-- OBLIGATION, NAMED HERE SO IT CANNOT BE LOST: the PR that first POPULATES recorded_by or
-- source_document_id on this table re-reviews that freeform reach before doing so -- at that
-- moment the columns stop being uniformly NULL and the acceptance above expires with them.

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
     or new.id                 is distinct from old.id
     or new.tax_type           is distinct from old.tax_type
     or new.scope_key          is distinct from old.scope_key
     or new.rate_kind          is distinct from old.rate_kind
     or new.rate_bp            is distinct from old.rate_bp
     or new.rate_amount_sen    is distinct from old.rate_amount_sen
     or new.unit_code          is distinct from old.unit_code
     or new.effective_from     is distinct from old.effective_from
     or new.effective_to       is distinct from old.effective_to
     or new.recorded_by        is distinct from old.recorded_by
     or new.basis              is distinct from old.basis
     or new.basis_kind         is distinct from old.basis_kind
     or new.source_document_id is distinct from old.source_document_id
     or new.recorded_at        is distinct from old.recorded_at
     or new.source_note        is distinct from old.source_note then
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
-- 2. Seed -- TEN rows: six currently-live + four verified predecessors (F2, conductor
--    fix-round 2026-08-24, RE-FIXED 2026-08-24 per the delta-confirm). NONE of the ten is
--    superseded_by another -- a rate CHANGE closes the old row by effective_to alone (this
--    file's own S1 comment above); superseded_by is reserved for a row that was WRONG, which
--    none of the four predecessors are. A DO block, not plain INSERTs, only because the live
--    rows' generated ids are captured via RETURNING for readability/future use -- the
--    predecessor rows below reference NOTHING captured here. All ten rows are migration-seeded:
--    recorded_by/basis/basis_kind/source_document_id left NULL throughout (the governed-origin
--    conjunct exempts a NULL recorder), matching the live sst_threshold_schedule seed rows' own
--    posture. Every citation not independently re-fetched by this lane against a primary source
--    says so.
-- =====================================================================================
do $seed$
declare
  v_sales_general_id uuid;
  v_sales_first_schedule_id uuid;
  v_service_general_id uuid;
  v_service_first_schedule_6pct_id uuid;
  v_service_rental_leasing_id uuid;
  v_service_credit_card_id uuid;
begin
  -- --- Currently-live rows first. ---
  insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
    values ('sales', 'general', 'ad_valorem', 1000, date '2025-07-01',
      'S-1: Sales Tax (Rate of Sales Tax) Order 2025, P.U.(A) 170/2025, gazetted 9 Jun 2025, in force 1 Jul 2025 -- 10% on all taxable goods except First-Schedule (5%) and Second-Schedule specific-rate goods. mysst.customs.gov.my/assets/document/SST%20Orders/order/1-PUA%20170_2025.pdf, accessed 2026-08-23 (sst-engine-survey.md S3.1 S-1). Supersedes the predecessor row at 2022-06-01 (P.U.(A) 176/2022) -- the SAME 10% rate re-enacted under a new order, per the conductor fix-round review 2026-08-24 (F2); this lane did not independently re-fetch 176/2022 or 170/2025 against RMCD for this fix round.')
    returning id into v_sales_general_id;

  insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
    values ('sales', 'first_schedule', 'ad_valorem', 500, date '2025-07-01',
      'S-1 (same instrument, P.U.(A) 170/2025): First-Schedule goods at 5%. accessed 2026-08-23 (sst-engine-survey.md S3.1 S-1). Supersedes the predecessor row at 2022-06-01 (P.U.(A) 176/2022) -- the SAME 5% rate re-enacted, per the conductor fix-round review 2026-08-24 (F2); not independently re-fetched by this lane this fix round.')
    returning id into v_sales_first_schedule_id;

  insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
    values ('service', 'general', 'ad_valorem', 800, date '2024-03-01',
      'V-1: P.U.(A) 64/2024, gazetted 26 Feb 2024, in force 1 Mar 2024 -- 8% general service tax rate (6% retained for the named specified sectors, seeded as scope_key=''first_schedule_6pct'' below). accessed 2026-08-23 (sst-engine-survey.md S3.2 V-1). Supersedes the predecessor row at 2018-09-01 (P.U.(A) 213/2018, 6% flat), per the conductor fix-round review 2026-08-24 (F2); not independently re-fetched by this lane this fix round.')
    returning id into v_service_general_id;

  insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
    values ('service', 'first_schedule_6pct', 'ad_valorem', 600, date '2025-07-01',
      'V-2: P.U.(A) 173/2025, gazetted 9 Jun 2025, in force 1 Jul 2025 -- First Schedule items 1-13 at 6% (food/beverage x4, telecommunications x2, parking, logistics, healthcare, traditional & complementary medicine, allied health, construction works, education). This row is the BUCKET rate only -- the per-item/group breakdown is a named non-goal of this seed (this file''s header, U-5/D-11). accessed 2026-08-23 (sst-engine-survey.md S3.2 V-2). Supersedes the predecessor row at 2024-03-01 (P.U.(A) 64/2024''s ORIGINAL four-item 6% list), which 173/2025 expanded to thirteen items -- per the conductor fix-round review 2026-08-24 (F2); not independently re-fetched by this lane this fix round.')
    returning id into v_service_first_schedule_6pct_id;

  insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
    values ('service', 'rental_leasing', 'ad_valorem', 600, date '2026-01-01',
      'V-3: P.U.(A) 125/2026, gazetted 13 Mar 2026, "deemed to have come into operation on 1 January 2026" -- inserts First Schedule item 14 ("provision of rental or leasing services") into the 6% bucket. Before this date rental/leasing carried no distinct scope row -- the live proof V-3 names by name that this table must be effective-dated and support a row whose gazette post-dates the period it governs. accessed 2026-08-23 (sst-engine-survey.md S3.2 V-3). CAUTION (F6, conductor fix-round 2026-08-24): the estate has NO catch-all/default service tax on an unprescribed service -- a period before this row exists for rental/leasing must NOT be priced by falling back to scope_key=''general''; a future evaluator confirms independently that a service is prescribed in SOME First-Schedule group before pricing it at the general rate. This is a named evaluator-side obligation (Annex F), not discharged by this seed.')
    returning id into v_service_rental_leasing_id;

  -- F1 BLOCKER FIX (conductor review 2026-08-24). v1 wrongly cited P.U.(A) 64/2024 @ 2024-03-01
  -- and a nonexistent "Second Schedule" attribution for this era.
  insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_amount_sen, unit_code, effective_from, source_note)
    values ('service', 'credit_charge_card', 'per_unit', 2500, 'card', date '2018-09-01',
      'F1 FIX (conductor review 2026-08-24): RM25 per credit/charge card on activation and every twelve months originates in P.U.(A) 213/2018, in force 2018-09-01, under a NUMBERED PARAGRAPH -- NOT a Schedule; schedules as a drafting structure arrive only with P.U.(A) 173/2025 (this same fix round''s row above). P.U.(A) 64/2024''s saving clause expressly EXCLUDES card services from its rate change, so this fee was never touched by 64/2024 and stays sourced to the original 2018 instrument. Corrects this migration''s v1, which wrongly cited 64/2024 @ 2024-03-01 and a nonexistent "Second Schedule" reference for this era -- form item 11(e), counted in cards not ringgit (design S3.1/Annex A.2). Citation per the conductor''s independently-verified review finding, not a primary-source fetch by this lane.')
    returning id into v_service_credit_card_id;

  -- --- Predecessor rows (F2, RE-FIXED per the conductor's delta-confirm 2026-08-24: the FIRST
  -- fix-round draft wrongly stamped these as superseded_by/superseded_at -- a rate CHANGE is a
  -- NEW row with the OLD row closed by effective_to alone; BOTH rows stay live (superseded_by
  -- IS NULL), exactly this file's own S1 comment above ("two DIFFERENT time windows for the
  -- same (tax_type, scope_key) are both legitimately live at once (a rate change is a NEW row,
  -- not a correction)"). superseded_by means the row was WRONG, which none of these four are --
  -- they are the statutory predecessor RATE, correctly enacted for its own window. Stamping
  -- them superseded made uq_sst_rate_schedule_live's own WHERE superseded_by IS NULL clause
  -- blind to them, so a date inside a predecessor's window (e.g. sales/general @2023-01-01)
  -- resolved to NO ROW under the live-row filter -- the exact defect this re-fix removes. ---
  -- Seeded exactly as far back as the review's verified instruments reach -- NOTHING earlier is
  -- asserted; a period before the earliest row for a given scope REFUSES with the named gap
  -- (TA-P2's fail-closed idiom, S3.1) rather than defaulting or extrapolating.
  insert into clara.sst_rate_schedule
      (tax_type, scope_key, rate_kind, rate_bp, effective_from, effective_to, source_note)
    values
      ('sales', 'general', 'ad_valorem', 1000, date '2022-06-01', date '2025-07-01',
       'F2 (conductor fix-round 2026-08-24): predecessor to the live sales/general row (chronologically adjacent, NOT a correction -- superseded_by stays NULL). P.U.(A) 176/2022, in force 2022-06-01 -- 10% general sales tax rate, the instrument P.U.(A) 170/2025 re-enacted at the same rate. Seeded exactly as far back as the review''s verified instruments reach; a period before 2022-06-01 REFUSES with the named gap, never a silent extrapolation.'),
      ('sales', 'first_schedule', 'ad_valorem', 500, date '2022-06-01', date '2025-07-01',
       'F2 (conductor fix-round 2026-08-24): predecessor to the live sales/first_schedule row (chronologically adjacent, NOT a correction -- superseded_by stays NULL). P.U.(A) 176/2022, in force 2022-06-01 -- 5% First-Schedule sales tax rate, the instrument P.U.(A) 170/2025 re-enacted at the same rate. Seeded exactly as far back as the review''s verified instruments reach; a period before 2022-06-01 REFUSES with the named gap.'),
      ('service', 'general', 'ad_valorem', 600, date '2018-09-01', date '2024-03-01',
       'F2 (conductor fix-round 2026-08-24): predecessor to the live service/general row (chronologically adjacent, NOT a correction -- superseded_by stays NULL). P.U.(A) 213/2018, in force 2018-09-01 -- 6% flat general service tax rate, replaced by P.U.(A) 64/2024''s 8% general rate effective 2024-03-01. Seeded exactly as far back as the review''s verified instruments reach; a period before 2018-09-01 REFUSES with the named gap.'),
      ('service', 'first_schedule_6pct', 'ad_valorem', 600, date '2024-03-01', date '2025-07-01',
       'F2 (conductor fix-round 2026-08-24): predecessor to the live service/first_schedule_6pct row (chronologically adjacent, NOT a correction -- superseded_by stays NULL). P.U.(A) 64/2024, in force 2024-03-01 -- the ORIGINAL four-item 6% list (food/beverage, telecommunications, parking, logistics), replaced by P.U.(A) 173/2025''s expansion to thirteen items effective 2025-07-01. Seeded exactly as far back as the review''s verified instruments reach; a period before 2024-03-01 for this reduced-rate bucket REFUSES with the named gap.');
end $seed$;

reset role;

-- =====================================================================================
-- 3. clara.sst_threshold_schedule -- the ordered ALTER, Annex A.1's specification, plus the
--    F3-F5 fix-round hardening (conductor review, 2026-08-24). Order is load-bearing: id + its
--    own UNIQUE constraint must exist before the self-referencing superseded_by FK can be
--    declared against it.
-- =====================================================================================
set role clara_fn_owner;

-- (1) surrogate id, and the unique target the self-FK below needs.
alter table clara.sst_threshold_schedule add column id uuid not null default gen_random_uuid();
alter table clara.sst_threshold_schedule add constraint uq_sst_threshold_schedule_id unique (id);

-- (2) supersession, paired, plus F4's self-supersession block (a row that points superseded_by
-- at itself is forgery, not history -- see the identical rate_schedule note above).
alter table clara.sst_threshold_schedule add column superseded_by uuid
  references clara.sst_threshold_schedule(id) deferrable initially deferred;
alter table clara.sst_threshold_schedule add column superseded_at timestamptz;
alter table clara.sst_threshold_schedule add constraint ck_sst_threshold_schedule_supersession_paired
  check ((superseded_by is null) = (superseded_at is null));
alter table clara.sst_threshold_schedule add constraint ck_sst_threshold_schedule_no_self_supersede
  check (superseded_by is distinct from id);

-- (3) the opaque WHO/BASIS trio, the governed-origin conjunct (a recorder must name why), and
-- F5's basis_kind closure + document-source tie (0055:395/413's vocabulary, nullable here).
alter table clara.sst_threshold_schedule add column recorded_by uuid references clara.users(id);
alter table clara.sst_threshold_schedule add column basis text;
alter table clara.sst_threshold_schedule add column basis_kind text;
alter table clara.sst_threshold_schedule add constraint ck_sst_threshold_schedule_basis_kind
  check (basis_kind is null or basis_kind in
    ('owner_instruction','document','registry_lookup','interview_carryover'));
alter table clara.sst_threshold_schedule add column source_document_id uuid references clara.documents(id);
alter table clara.sst_threshold_schedule add constraint ck_sst_threshold_schedule_document_basis
  check ((basis_kind = 'document') = (source_document_id is not null));
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
-- a later per-item row overrides by specificity -- BUT NOT YET SAFE.
--
-- POINTER TRUED (rebase fix, 2026-08-29 -- F-R3). This comment used to send a reader to "this
-- migration's tail note and Annex A.1's addendum", and NEITHER EXISTS: there is no such tail note
-- in this file and no such addendum in `sst-engine-annexes.md`. The obligation has exactly one
-- home, and it is `docs/plan/active/sst-engine-annexes-2.md` Annex G.1 ("The five frozen 0016
-- group-grain readers have no successor-body owner yet", at :407 as written). A dead pointer on
-- an obligation that outlives this PR is how the obligation gets lost, so it is now a live one --
-- and the battery carries a STANDING TRIPWIRE (`count(*) where item_no <> '*'` must be 0) that
-- reds the moment anyone seeds the per-item row this ALTER makes structurally possible, naming
-- G.1 in its failure message rather than relying on a reader having followed a comment.
alter table clara.sst_threshold_schedule add column item_no text not null default '*';
alter table clara.sst_threshold_schedule drop constraint sst_threshold_schedule_pkey;
alter table clara.sst_threshold_schedule add constraint sst_threshold_schedule_pkey
  primary key (service_group, item_no, effective_from);

-- F3 (conductor fix-round 2026-08-24, MEASURED): before this fix, DELETE and an out-of-shape
-- UPDATE of the live G/I rows were BOTH allowed -- the table had no trigger layer at all beyond
-- the pre-existing no-truncate guard (0016), only ACL/RLS protection. Mirrors sst_rate_schedule's
-- trigger pair exactly (S1 above), adapted to this table's own column list.
create function clara._tf_sst_threshold_schedule_supersede_only() returns trigger
  language plpgsql security definer set search_path to 'clara', 'pg_temp' as $fn$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded sst_threshold_schedule row is immutable'
      using errcode = 'CLR10', detail = '{"reason":"sst_threshold_schedule_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.service_group      is distinct from old.service_group
     or new.item_no            is distinct from old.item_no
     or new.threshold_cents    is distinct from old.threshold_cents
     or new.effective_from     is distinct from old.effective_from
     or new.effective_to       is distinct from old.effective_to
     or new.source_note        is distinct from old.source_note
     or new.id                 is distinct from old.id
     or new.recorded_by        is distinct from old.recorded_by
     or new.basis              is distinct from old.basis
     or new.basis_kind         is distinct from old.basis_kind
     or new.source_document_id is distinct from old.source_document_id then
    raise exception 'sst_threshold_schedule admits exactly one update: the supersession stamp (superseded_by and superseded_at together, set once)'
      using errcode = 'CLR10', detail = '{"reason":"sst_threshold_schedule_immutable"}';
  end if;
  return new;
end $fn$;
revoke all on function clara._tf_sst_threshold_schedule_supersede_only() from public;

create trigger t_sst_threshold_schedule_no_delete before delete on clara.sst_threshold_schedule
  for each row execute function clara._tf_append_only();
create trigger t_sst_threshold_schedule_supersede_only before update on clara.sst_threshold_schedule
  for each row execute function clara._tf_sst_threshold_schedule_supersede_only();
-- t_sst_threshold_schedule_no_truncate already exists, born 0016 -- not re-created.

reset role;

-- =====================================================================================
-- 4. The reachable-closure write assertion, armed for BOTH SST reference tables. This file's
--    OWN trued assertion (never an edit to applied 0016): the reachable closure of every
--    lane-role-granted clara.* function -- lane roles MEASURED from pg_roles at apply time, see
--    the roster note below -- plus the ungranted clara.* functions its prosrc names
--    (transitively, following clara.-qualified calls -- the estate's proven internal-call
--    convention, confirmed live at 0044:1652/1927 calling clara._allocate_receipt_core), is
--    scanned for INSERT/UPDATE/DELETE text against either table. At PR-1 time neither table has
--    ANY writer, granted or ungranted -- the assertion below proves that, by measurement, not by
--    assumption; it is re-armed (not edited) by whichever lane later builds a governed door. The
--    two new trigger functions above are neither granted to any lane role nor written by any
--    other function's prosrc, so they cannot appear here as either a root or a false positive.
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
  v_roster text[];
  v_floor text[] := array['clara_authenticated', 'clara_agent_ro', 'clara_agent_read_login',
    'clara_runtime', 'clara_runtime_login', 'clara_wake_interactive', 'clara_wake_proactive',
    'clara_wake_write_login'];
  v_missing text[];
  v_public_reachable int;
  v_roots_n int;
  v_reached_n int;
begin
  -- ROOTS ROSTER -- MEASURED AT APPLY TIME, NOT A LITERAL (REBASE FIX, 2026-08-29). Every
  -- clara_* role except the table/function owner clara_fn_owner. The first draft (2026-08-24)
  -- spelled the roster as an eight-name literal that was the full live set at ITS frontier
  -- (0127); by the 0147 frontier this file actually lands on, the estate had minted FIVE more
  -- (clara_freeform_ro + clara_freeform_login, 0131; clara_wake_bank + clara_wake_bank_login,
  -- 0130; clara_wake_filing, 0123/0142), and MEASURED on the rebase rig the literal reached
  -- 405 roots / 783 functions where the catalog reaches 418 / 800.
  --
  -- THE TWO DELTAS ARE DIFFERENT NUMBERS AND THIS COMMENT USED TO CONFLATE THEM (rebase fix
  -- 2026-08-29 -- F-R4; it read "seventeen functions, including all seven filing doors and all
  -- fourteen bank doors, were outside the scan", which is arithmetically wrong). Measured:
  --   ROOTS delta = 13 (418 - 405) -- the doors the literal roster could not see AT ALL.
  --     Broken down: all 7 clara_freeform_ro doors, 5 of the 7 clara_wake_filing doors, and
  --     1 of the 14 clara_wake_bank doors. The other 2 filing and 13 bank doors were ALREADY
  --     roots via a second grant to a role the literal did name -- 7 + 5 + 1 = 13.
  --   CLOSURE delta = 17 (800 - 783) -- those 13 roots plus the 4 further clara.* functions
  --     reachable only through them.
  -- The outcome is unchanged either way (zero writers under either roster, because no clara.*
  -- function writes either table at all today), but a literal roster is an instrument that goes
  -- stale silently, which is the whole failure this assertion exists to prevent. It is now
  -- DERIVED, so it cannot be stale at whatever frontier the file applies onto.
  --
  -- A derivation can also be vacuous -- a mis-spelled LIKE pattern returns {} and the scan then
  -- passes having read nothing. So the derived roster is proven against a NAMED FLOOR (the eight
  -- structural lane roles) before it is used, and the roster it actually scanned is printed in
  -- the tail notice: the ceremony log records what was measured, never merely that it passed.
  select coalesce(array_agg(rolname order by rolname), '{}'::text[]) into v_roster
    from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner';
  select coalesce(array_agg(f), '{}'::text[]) into v_missing
    from unnest(v_floor) f where f <> all(v_roster);
  if array_length(v_missing, 1) > 0 then
    raise exception 'f_t1_sst_reference_tables: the derived roots roster is missing structural lane role(s) % -- the derivation read nothing or the estate retired a role; refusing to scan on a roster that cannot be trusted (roster read: %)',
      v_missing, v_roster using errcode = 'CLR10';
  end if;

  -- PUBLIC is not a pg_roles row, so the grantee join above cannot see it -- and a clara.*
  -- function left at the CREATE-time default ACL carries EXECUTE for PUBLIC, reachable by every
  -- lane role while holding no named grant at all. MEASURED here rather than assumed away: the
  -- estate revokes PUBLIC on every clara function, so the count is zero and the named-roster
  -- scan below is complete. If it ever stops being zero, this refuses instead of passing blind.
  --
  -- PLACEMENT IS DELIBERATE AND LOAD-BEARING: this census runs BEFORE the roots query, not after.
  -- The roots query calls aclexplode(coalesce(p.proacl, '{}'::aclitem[])), and a NULL proacl
  -- there coerces to an empty aclitem[] that Postgres rejects with the opaque
  -- "ACL arrays must be one-dimensional" -- a reader would then be debugging a cast error
  -- instead of reading the real finding, which is that a clara function is PUBLIC-executable.
  -- Measured during the rebase review (mutant M5). Running the census first turns that into a
  -- named refusal that says what is actually wrong.
  select count(*) into v_public_reachable
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a
                      where a.privilege_type = 'EXECUTE' and a.grantee = 0));
  if v_public_reachable > 0 then
    raise exception 'f_t1_sst_reference_tables: % clara.* function(s) are PUBLIC-executable (default or explicit ACL) -- a named-role roots roster cannot see them, so the reachable-closure claim would be incomplete',
      v_public_reachable using errcode = 'CLR10';
  end if;

  foreach v_target in array array['sst_threshold_schedule', 'sst_rate_schedule'] loop
    v_pattern := '(insert\s+into|update|delete\s+from)\s+(clara\.)?' || v_target || '\M';
    v_reached := '{}'::text[];

    -- Roots: functions with EXECUTE granted to any role in the measured roster. Login roles are
    -- scanned DIRECTLY rather than assumed covered by the group they are MEMBER OF -- absence is
    -- not evidence, and a login role can in principle carry a direct grant of its own.
    select coalesce(array_agg(distinct p.proname), '{}'::text[]) into v_frontier
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'clara' and a.privilege_type = 'EXECUTE'
       and r.rolname = any(v_roster);
    v_roots_n := coalesce(array_length(v_frontier, 1), 0);

    -- NON-VACUITY FLOOR ON THE SCAN ITSELF (rebase fix, 2026-08-29 -- F-R2). The roster above is
    -- floor-proven, but a proven roster does not prove the SCAN read anything: mutant M7 re-aimed
    -- this roots query at a schema that does not exist and the block still printed "assertion OK"
    -- with a real offender planted in the catalog. An empty offender list is evidence ONLY if the
    -- scan had a populated corpus, so the corpus is asserted before the emptiness is believed.
    if v_roots_n = 0 then
      raise exception 'f_t1_sst_reference_tables: the reachable-closure roots query for % returned ZERO functions on a roster of % role(s) -- the scan read nothing, so its "no writers" verdict would be vacuous',
        v_target, coalesce(array_length(v_roster, 1), 0) using errcode = 'CLR10';
    end if;

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

    -- The second half of F-R2's floor: the closure must CONTAIN its roots (the loop's first
    -- iteration appends v_frontier into v_reached, so anything less means the walk never ran) and
    -- must have gone STRICTLY past them, which is what makes this a transitive scan rather than a
    -- roots-only one. This is the SQL-side twin of the battery's own roots-inside-closure cell.
    v_reached_n := coalesce(array_length(v_reached, 1), 0);
    if v_reached_n <= v_roots_n then
      raise exception 'f_t1_sst_reference_tables: the reachable closure for % holds % function(s) against % root(s) -- the transitive walk added nothing, so the scan is roots-only and its verdict does not cover the ungranted-core class this assertion exists for',
        v_target, v_reached_n, v_roots_n using errcode = 'CLR10';
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

  -- Every count below is coalesce()d: array_length() on an empty array returns NULL, not 0, and a
  -- notice that reads "<NULL> role(s)" tells a ceremony reader nothing (mutant M4).
  raise notice 'F-T1 PR-1 reachable-closure write assertion OK: for BOTH clara.sst_threshold_schedule and clara.sst_rate_schedule, no lane-role-granted function -- and no ungranted clara.* function reachable from one, transitively through clara.-qualified calls -- writes INSERT/UPDATE/DELETE against the table. Both stay migration-only. SCAN CORPUS, MEASURED AT THIS APPLY (never a literal): % role(s) in the roots roster -> % root function(s) -> % function(s) in the transitive closure; roster: %. The closure was asserted non-empty and a strict superset of its roots BEFORE the empty offender list was believed, and zero clara.* functions are PUBLIC-executable, so a named-role roster misses nothing.',
    coalesce(array_length(v_roster, 1), 0), coalesce(v_roots_n, 0), coalesce(v_reached_n, 0), v_roster;
end $reachable_closure$;

reset role;

-- =====================================================================================
-- TAIL CENSUS. Every claim re-read from the live catalog, nothing inferred from this file's own
-- statements.
-- =====================================================================================
do $tail$
declare
  v_rate_rows int; v_rate_sales int; v_rate_service int;
  v_rate_ad_valorem int; v_rate_per_unit int; v_rate_superseded int; v_rate_recorded int;
  v_rate_rls record;
  v_thr_id_count int; v_thr_item_no_star int;
  v_thr_g_eff_to date; v_thr_i_eff_to date; v_thr_g_cents bigint; v_thr_i_cents bigint;
  v_thr_pk text;
  v_thr_check_def text;
  v_rate_no_self_check text; v_thr_no_self_check text;
  v_rate_basis_kind_check text; v_thr_basis_kind_check text;
  v_thr_trig_count int;
begin
  select count(*) into v_rate_rows from clara.sst_rate_schedule;
  select count(*) into v_rate_sales from clara.sst_rate_schedule where tax_type = 'sales';
  select count(*) into v_rate_service from clara.sst_rate_schedule where tax_type = 'service';
  select count(*) into v_rate_ad_valorem from clara.sst_rate_schedule where rate_kind = 'ad_valorem';
  select count(*) into v_rate_per_unit from clara.sst_rate_schedule where rate_kind = 'per_unit';
  -- F2 RE-FIX (conductor delta-confirm 2026-08-24): NONE of the ten rows is superseded --
  -- every predecessor closes by effective_to alone, exactly this file's own S1 comment
  -- ("a rate change is a NEW row, not a correction"). superseded_by populated on a predecessor
  -- would make uq_sst_rate_schedule_live's live-row filter blind to it -- the defect this
  -- re-fix removes, now asserted here rather than merely fixed in the seed.
  select count(*) into v_rate_superseded from clara.sst_rate_schedule where superseded_by is not null;
  select count(*) into v_rate_recorded from clara.sst_rate_schedule where recorded_by is not null;
  if v_rate_rows <> 10 or v_rate_sales <> 4 or v_rate_service <> 6
     or v_rate_ad_valorem <> 9 or v_rate_per_unit <> 1
     or v_rate_superseded <> 0 or v_rate_recorded <> 0 then
    raise exception 'f_t1_sst_reference_tables tail: sst_rate_schedule census total %, sales %, service %, ad_valorem %, per_unit %, superseded %, recorded % -- expected 10 / 4 / 6 / 9 / 1 / 0 / 0',
      v_rate_rows, v_rate_sales, v_rate_service, v_rate_ad_valorem, v_rate_per_unit, v_rate_superseded, v_rate_recorded
      using errcode = 'CLR10';
  end if;
  -- The credit_charge_card row's F1 fix, re-read positively (never assumed from this file's own
  -- earlier INSERT statement).
  if not exists (
    select 1 from clara.sst_rate_schedule
     where tax_type = 'service' and scope_key = 'credit_charge_card'
       and effective_from = date '2018-09-01' and rate_amount_sen = 2500
  ) then
    raise exception 'f_t1_sst_reference_tables tail: the F1 credit/charge-card fix did not land -- expected service/credit_charge_card at 2018-09-01, RM25 (2500 sen)'
      using errcode = 'CLR10';
  end if;
  -- F2 RE-FIX, the conductor's own two-direction re-probe, run positively against the live
  -- table with the SAME predicate a real evaluator's live-row lookup would use (effective-dated,
  -- superseded_by IS NULL, no ORDER BY/LIMIT needed since exactly one row can ever match a given
  -- date once rows never overlap): sales/general @2023-01-01 resolves to the PREDECESSOR rate
  -- (1000bp); sales/general @2022-01-01 -- before the earliest verified instrument -- resolves
  -- to nothing at all, the named gap standing rather than a silent extrapolation.
  if (select rate_bp from clara.sst_rate_schedule
        where tax_type = 'sales' and scope_key = 'general' and superseded_by is null
          and effective_from <= date '2023-01-01'
          and (effective_to is null or effective_to > date '2023-01-01')) <> 1000 then
    raise exception 'f_t1_sst_reference_tables tail: sales/general @2023-01-01 does not resolve to the 1000bp predecessor under the live-row filter -- F2''s re-fix did not land'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.sst_rate_schedule
               where tax_type = 'sales' and scope_key = 'general' and superseded_by is null
                 and effective_from <= date '2022-01-01'
                 and (effective_to is null or effective_to > date '2022-01-01')) then
    raise exception 'f_t1_sst_reference_tables tail: sales/general @2022-01-01 resolves to a row -- expected the named gap (no verified instrument reaches this far back)'
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

  -- F4: the self-supersession block, on both tables.
  select pg_get_constraintdef(oid) into v_rate_no_self_check from pg_constraint
   where conrelid = 'clara.sst_rate_schedule'::regclass and conname = 'ck_sst_rate_schedule_no_self_supersede';
  select pg_get_constraintdef(oid) into v_thr_no_self_check from pg_constraint
   where conrelid = 'clara.sst_threshold_schedule'::regclass and conname = 'ck_sst_threshold_schedule_no_self_supersede';
  if v_rate_no_self_check is distinct from 'CHECK ((superseded_by IS DISTINCT FROM id))'
     or v_thr_no_self_check is distinct from 'CHECK ((superseded_by IS DISTINCT FROM id))' then
    raise exception 'f_t1_sst_reference_tables tail: the F4 self-supersession CHECK is missing or reads wrong on one or both tables (rate: %, threshold: %)',
      v_rate_no_self_check, v_thr_no_self_check using errcode = 'CLR10';
  end if;

  -- F5: basis_kind closed on both tables.
  select pg_get_constraintdef(oid) into v_rate_basis_kind_check from pg_constraint
   where conrelid = 'clara.sst_rate_schedule'::regclass and conname = 'sst_rate_schedule_basis_kind_check';
  select pg_get_constraintdef(oid) into v_thr_basis_kind_check from pg_constraint
   where conrelid = 'clara.sst_threshold_schedule'::regclass and conname = 'ck_sst_threshold_schedule_basis_kind';
  if v_rate_basis_kind_check is null or v_thr_basis_kind_check is null
     or position('owner_instruction' in v_rate_basis_kind_check) = 0
     or position('interview_carryover' in v_rate_basis_kind_check) = 0
     or position('owner_instruction' in v_thr_basis_kind_check) = 0
     or position('interview_carryover' in v_thr_basis_kind_check) = 0 then
    raise exception 'f_t1_sst_reference_tables tail: the F5 basis_kind vocabulary CHECK is missing or short on one or both tables (rate: %, threshold: %)',
      v_rate_basis_kind_check, v_thr_basis_kind_check using errcode = 'CLR10';
  end if;

  -- F3: the threshold table's new immutability triggers exist (no_delete + supersede_only;
  -- no_truncate already existed and is untouched by this file).
  select count(*) into v_thr_trig_count from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'sst_threshold_schedule' and not t.tgisinternal;
  if v_thr_trig_count <> 3 then
    raise exception 'f_t1_sst_reference_tables tail: sst_threshold_schedule carries % non-internal trigger(s), expected exactly 3 (no_truncate from 0016 + the two F3 triggers this file adds)',
      v_thr_trig_count using errcode = 'CLR10';
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

  raise notice 'F-T1 PR-1 tail OK (fix round 2026-08-24, F2 re-fixed): clara.sst_rate_schedule carries 10 rows -- 4 sales/6 service, 9 ad_valorem/1 per_unit, ZERO superseded (F2''s four predecessors close by effective_to alone, never a correction stamp)/0 recorded, the F1 credit-card fix landed at 2018-09-01/RM25, F2''s two-direction re-probe holds (sales/general @2023-01-01 resolves to the 1000bp predecessor; @2022-01-01 resolves to nothing, the named gap) -- RLS enabled+forced, zero app-role write grants, immutable+supersede triggers installed, F4 self-supersession + F5 basis_kind/document-tie CHECKs present. clara.sst_threshold_schedule widened -- id populated + item_no=''*'' on both live rows, PK now (service_group, item_no, effective_from), threshold_cents CHECK relaxed to >=0, F4/F5 CHECKs present, THREE non-internal triggers (no_truncate + the new no_delete + supersede_only) -- both G/I seed rows byte-unchanged otherwise (50,000,000 cents, open-ended). The reachable-closure write assertion ran and found zero writers on either table. Deploy principal restored.';
end $tail$;
