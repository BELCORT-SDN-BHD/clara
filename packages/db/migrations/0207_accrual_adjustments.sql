-- 0207_accrual_adjustments — #652 (refresh spec #612; journeys C3, C8): EVIDENCED ACCRUAL AND
-- REVERSAL ADJUSTMENTS.
-- =====================================================================================
-- Spec of record: issue #652 — "用户可用会计界面、对话或资料表达应计事项，按明确有效期产生正确分录，
-- 并把获准的转回连接到原调整。" Domain words: CONTEXT.md — "Accrual adjustment", "Accrual reversal",
-- "Service period", "Calculation method", "Accounting plan", "Plan occurrence", "Operation receipt".
-- Builds on 0004 (the reserve/finish idempotency and the human-lane identity guard), 0140 (the
-- document-grain service-period carrier and its anti-fabrication law), 0178 (the accounting-work
-- lane and `_assert_journal_basis`), 0182 (the evidence source-ref predicates), 0193 (the
-- accounting-plan lane) and 0194 (the typed-particulars relation idiom).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. One append-only relation of TYPED ACCRUAL PARTICULARS and
-- four doors, so an accrual a human states — amount, both account legs, the business purpose, the
-- effective window, the SERVICE PERIOD, the selection method, the authority and the instruction —
-- becomes a `reversing_journal` accounting plan, its current period's occurrence and its admitted
-- Work IN ONE COMMIT, with the durable accrual record the plan lane alone could not carry.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES EVERYTHING BELOW: `reversing_journal` IS ALREADY THE ACCRUAL LANE.
--
-- #640 delivered the whole accrual→reversal SCHEDULE and the original gap map read it backwards.
-- `v_auto := (p_kind = 'reversing_journal')` (0193:1529) is the auto-reversal flag; the reversal's
-- basis is the accrual's with every side exchanged and the reversed entry named in the memo
-- (0193:1037-1064); `accounting_plan_occurrences.reverses_entry_id` (0193:652) with
-- `ck_plan_occurrences_reversal_entry` + a real FK into `clara.journal_entries` (0193:679-685) make
-- "an admitted reversal naming no entry" a row that table cannot hold; `clara._plan_primary_entry`
-- (0193:914) is the picker; and the orphan wall (0193:1326-1360) refuses a reversal whose accrual
-- has POSTED nothing, with a typed `primary_state` naming WHICH of the three ways it fails to
-- stand behind it. The product's own copy says so: `apps/web/messages/en.json:4832` reads "A
-- reversing journal posts its accrual on the due date and reverses it on the first of the
-- following month."
--
-- SO THIS FILE MINTS NO PLAN KIND, NO ACCOUNTING-WORK PURPOSE AND NO POSTING-CORE COPY.
-- `clara.accounting_plans.kind` is untouched (#653 is the wave's sole widener);
-- `clara._record_journal_entry_core`, `clara._admit_accounting_work_core`,
-- `ck_accounting_work_adjustment_basis`, the `clara._adjustment_*` validator family and both
-- purpose CHECKs are untouched (#638 owns that spine). An accrual occurrence is admitted exactly
-- as `clara._plan_admit_occurrence` admits every occurrence today — through
-- `clara.admit_journal_work`, `purpose='journal_entry'`, `adjustment_basis` NULL (0193:1367-1369).
-- The typed particulars ride THIS file's own relation, keyed by (plan_id, revision), so the
-- entrance that created a due event never changes the durable record behind it.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: THE PARTICULARS MAY NOT RIDE `clara.accounting_work.adjustment_basis`.
--
-- That column is the #643 lane's, and `clara._record_journal_entry_core`'s `#643 INSERTION 5` arm
-- (0195:2165) is an UNCONDITIONAL `if w.adjustment_basis is not null` writing
-- `clara.periodic_adjustments` with `w.purpose` — whose CHECK is closed to two values
-- (0194:339-340). An accrual Work carrying `adjustment_basis` would therefore die on that CHECK at
-- COMMIT, after the run had already spent itself. It carries NULL, exactly as every other
-- plan-admitted occurrence does, and the particulars are reached by the (plan_id, revision) join
-- this file's unique constraint makes single-valued.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: THE TERM IS STATED BY A HUMAN OR THERE IS NO ACCRUAL.
--
-- 0140's `clara.document_service_periods` table comment is CONFIRMED AS LAW: "a model-derived
-- period is NOT an anchored fact and hard constraint 2 forbids it entering a durable artifact".
-- `term_source` here is a ONE-MEMBER CHECK (`human_stated`) for that reason — not a column waiting
-- to be widened, and `extracted` is not even a declared shape on this lane. A silent term is
-- refused BEFORE admission (CLR10 `silent_term`), never admitted hoping a Work question completes
-- the basis: an admitted Work's basis is immutable (`chatTurn.v19.tools.ts:37-41`). Where the
-- accrual's term was anchored to a FILED DOCUMENT by 0140's own human door, this relation BINDS
-- that row (`document_service_period_id`) rather than restating the dates as a second fact, and a
-- disagreement between the two is refused rather than silently resolved.
--
-- =====================================================================================
-- THE FOURTH MEASUREMENT: `method` IS A SELECTION RULE, NOT A FORMULA — SO IT IS AN ENUM AND NOT
-- A REGISTERED EVALUATOR CLOSURE.
--
-- The estate's house home for a FORMULA is a frozen single-member `clara.evaluator_versions`
-- closure — `clara.prepayment_schedule_v1` (0140:962-1201), pinned by `clara.verify_evaluator_freeze`
-- (0059:248), whose whole rule is "a changed formula is a _v2, never an edit". That freeze exists
-- because a prepayment schedule COMPUTES: it turns one term and one amount into n period amounts
-- with an exact-cent residual, and a changed computation silently restates posted books.
--
-- AN ACCRUAL'S METHOD COMPUTES NOTHING. It names WHICH amount a human already stated the schedule
-- uses. There is no arithmetic to version, so a registered closure would be a frozen wrapper around
-- an identity function and the `_v2` discipline would have nothing to protect. The rule is
-- therefore a CLOSED jsonb enum with NO other admitted key, which is what stops it becoming a
-- place to smuggle a formula in later: `{"rule": "..."}` and nothing else.
--
-- AND THE ENUM HOLDS EXACTLY THE ONE RULE THIS SLICE PERFORMS: `stated_amount` — "the amount
-- stated here, every period of the window". That is what the schedule posts, measurably: the
-- configuration freezes the stated amount into the plan revision's basis and
-- `clara._plan_occurrence_basis` (0193:1037, #653-owned and pinned in §0) only moves the posting
-- date and exchanges the sides for a reversal. THREE FURTHER RULES WERE DRAFTED HERE and are NOT
-- admitted: `stated_period_amount`, `source_document_amount` and `prior_period_amount` would each
-- have posted the SAME cents, because no lane reads `clara.accrual_adjustments` at run time and
-- nothing in this estate selects a per-period figure — `prior_period_amount` does not even have a
-- prior period to select from in the FIRST period. A recorded selection nobody performs is a
-- promise the ledger does not keep (review round 1, A2), so they are a SUCCESSOR RESIDUAL, named
-- in #652's report, and they return with the code that honours them.
--
-- =====================================================================================
-- THE FIFTH MEASUREMENT: THE RUNTIME DOOR RESOLVES ITS ACTOR FROM AN ARGUMENT.
--
-- `clara.create_accounting_plan` takes its actor from `clara._human_ctx` (0193:1454) →
-- `clara.jwt_sub()` (0004:299-308), which reads `request.jwt.claims`. A `clara_runtime` connection
-- carries none, so the OBO door may not nest that verb — it would raise CLR04 `no authenticated
-- actor` on every call, and a grant assertion could never see it. `clara._accrual_plan_core` is
-- therefore the actor-EXPLICIT extraction (the 0119/0194:1062 idiom) both `_for` and any future
-- actor-explicit caller use, and the HUMAN door keeps nesting the estate's own audited plan verb so
-- a human-configured accrual's plan is byte-for-byte the plan that verb has always written. The
-- two paths are proven equal by `p652.plan.equivalence`.
--
-- =====================================================================================
-- THE SIXTH MEASUREMENT: THE SCHEDULE RUNS INSIDE THE TERM IT NAMES, AND NO LINE CLAIMS OTHERWISE.
--
-- One accrual carries ONE stated service period, and a `reversing_journal` plan reaches MANY due
-- dates. Left unchecked, those two facts produce a false ledger, and it was measured on a rig
-- before this wall existed (review round 1, A1): a July term under an authority running from June
-- with no end posted the SAME line — "accrued 2026-07-01 to 2026-07-31" — on 30 June, 31 July and
-- 31 August, so the sentence was false on two entries of three; and a term wholly outside the
-- window (a 2031 term on a one-month 2026 authority) was ACCEPTED without a word.
--
-- TWO RULES CLOSE IT, and neither recuts the plan lane:
--
--   1. `clara._assert_accrual_term_window` refuses a configuration whose AUTHORITY WINDOW is not
--      bracketed by the stated term: `effective_to` is REQUIRED, `effective_from` is on or after
--      `service_period_start`, and `effective_to` is on or before `service_period_end` (CLR10
--      `accrual_term_window_mismatch`, at the control that holds the mistake). Every occurrence
--      therefore posts a date INSIDE the term its line names, and a schedule can never outrun the
--      term a person stated. THE REVERSAL LEG IS UNAFFECTED: 0193's `_plan_window_ceiling`
--      (0193:1008) already lifts an auto-reversing plan's ceiling to the reversal of `effective_to`
--      — exactly so an authority ending on its last accrual can still undo it.
--
--   2. THE DERIVED EXPENSE LINE READS "one period of the accrual term <start> to <end>" rather
--      than "accrued <start> to <end>". An occurrence of a recurring accrual accrues ONE PERIOD of
--      the term, not the whole of it, and `clara._plan_occurrence_basis` is PINNED here and may not
--      vary a description per occurrence — so what this file freezes into the basis is the sentence
--      that is true of EVERY occurrence, including the single-period case. The term itself stays
--      where it can be audited: on `clara.accrual_adjustments`, and on every surface that reads it.
--
-- WHAT IS DELIBERATELY NOT CLOSED, and is named rather than hidden: the per-occurrence AMOUNT is
-- the stated figure in every period (THE FOURTH MEASUREMENT), so a term spanning several periods
-- with one stated amount accrues that amount in each of them — which is exactly what "the amount
-- stated here, every period" says on the form and in the method's own label.
--
-- =====================================================================================
-- THE SEVENTH MEASUREMENT: A SCHEDULE THAT REACHES NOTHING IS A REFUSAL, NOT A SILENT NO-OP.
--
-- The SIXTH MEASUREMENT makes the authority window sit INSIDE the stated term. That closed a false
-- ledger line and opened one more shape worth naming: a term SHORTER than one period of its own
-- schedule. Measured on the rig at review round 2 (NB1), before this wall: term and window both
-- 2026-07-01..2026-07-15, monthly, `last_day_of_month` -> ACCEPTED. A plan went live, an accrual
-- row was written, a configuration receipt came back, and `clara.request_plan_catch_up` over the
-- whole window then answered `{"events":[],"admitted":0}` with ZERO rows in
-- `clara.accounting_plan_occurrences` -- for ever, because the only date that schedule reaches (the
-- 31st) is outside the window the SIXTH MEASUREMENT requires. A one-day term behaves the same.
--
-- `clara._assert_accrual_schedule_yields` refuses it at the door (CLR10
-- `accrual_schedule_yields_no_occurrence`), asking the plan lane's OWN date arithmetic
-- (`clara._plan_due_events`, 0193:845 -- called, never recut) whether one primary due date falls in
-- `[effective_from, effective_to]`. The refusal names the DAY RULE, or the day number under it,
-- because that is the control that makes this a wall rather than a ban: the same half-month term
-- with `day_of_month = 15` reaches 2026-07-15 and configures (measured). The term is the fact a
-- human stated; the schedule is the thing to change.
--
-- WHAT IS NOT CLOSED HERE, AND WHY. The plan lane itself still accepts a plan whose schedule
-- reaches nothing -- `clara.create_accounting_plan` has always done so, and #640/#653 own those six
-- bodies, which this file PINS and may not recut. This wall closes the ACCRUAL entrance only. A
-- plan configured through the plan lane's own door can still be a live plan with no due date, and
-- that is #653's to rule on, named in #652's report rather than fixed behind their back.
--
-- =====================================================================================
-- THE REFUSAL VOCABULARY THIS FILE OWNS. Every one carries a typed `detail.reason`; the
-- field-scoped ones carry `field` and, where it helps, `constraint` — on the SAME footing
-- `invalid_basis` does, so `apps/web/lib/work/accrual-draft.ts`'s `fieldForAccrualPath` maps them
-- onto a control. The `field` paths are prefixed `accrual.` so they can never collide with the
-- journal basis's own (`posting_date`, `memo`, `lines[N]…`).
--
--   CLR10 invalid_accrual                + field + constraint   shape of the particulars
--   CLR10 silent_term                    + field                the term is absent or not a human's
--   CLR10 accrual_zero_amount            + field                an accrual that accrues nothing
--   CLR10 accrual_method_unsupported     + field + supported[]  outside the closed selection set
--   CLR10 accrual_account_relationship   + field + constraint + account_code
--   CLR10 accrual_term_document_mismatch + field                the bound term is not this
--                                                               document's live human-stated one
--   CLR10 accrual_term_window_mismatch   + field + constraint   the schedule is not bracketed by
--                                                               the term it names (SIXTH
--                                                               MEASUREMENT)
--   CLR10 accrual_schedule_yields_no_occurrence + field + constraint
--                                                               the schedule reaches no accrual
--                                                               date inside its own window, so
--                                                               the accrual could never post
--                                                               (SEVENTH MEASUREMENT)
--   CLR10 op_key_conflict                + field                this key already configured a
--                                                               DIFFERENT accrual (0004's own
--                                                               reservation conflict, given the
--                                                               typed reason it never carried)
--   CLR10 invalid_purpose                + constraint
--   CLR10 invalid_op_key                 + constraint
--   CLR04 insufficient_role / no_authenticated_actor / actor_not_active   the human door's floor
--   CLR04 authority_lost                 + field                the OBO door's live recheck
--   CLR11 accrual_not_found                                     no cross-firm existence oracle
--
-- INHERITED UNCHANGED and deliberately NOT restated: CLR10 `invalid_basis` (0178's basis
-- validator), `invalid_source_ref` (0182), `invalid_schedule` / `plan_kind_unsupported` /
-- `authority_ref_invalid` / `authority_ref_unresolved` / `client_not_found` / `client_inactive`
-- (0193's plan door), CLR13 `operation_in_flight` (0004), CLR13 `reversal_before_primary` and
-- CLR10 `catch_up_before_authority` (0193's occurrence lane).
--
-- LOCK ORDER IS UNCHANGED: `accounting_plans → accounting_work → agent_tasks →
-- agent_interruptions`. This file takes no lock of its own; it writes its row between the plan
-- insert and `clara._plan_admit_occurrence`, whose RUNG 1 is the plan row lock.
-- =====================================================================================

-- =====================================================================================
-- §0  PRESTATE. Refuse a partial cohort, pin every plan-lane body this file DEPENDS ON and must
--     not change, and prove the accrual lane is wholly absent before anything is created.
--
--     THE PINS ARE NON-REGRESSION PINS (the 0195:402-409 idiom), not recut pre-images: this file
--     recuts NOTHING. §C re-hashes the same six and requires byte equality, so a stray
--     `create or replace` anywhere below reds the migration instead of being invisible.
--
--     WHAT IS DELIBERATELY NOT PINNED: `clara._record_journal_entry_core`,
--     `clara._admit_accounting_work_core`, `clara._assert_adjustment_basis`,
--     `clara._adjustment_basis_canonical`, `clara._adjustment_amount_cents`,
--     `clara._assert_adjustment_relationships` and the two purpose CHECKs. #638's own migration
--     replaces them in this same wave and lands BEFORE this file; a pin on any of them would make
--     this file refuse to apply for a change that is none of its business. This file calls none of
--     them.
-- =====================================================================================
do $w652_pre$
declare
  v_names text;
begin
  if to_regclass('clara.accounting_plans') is null
     or to_regclass('clara.accounting_plan_revisions') is null
     or to_regclass('clara.accounting_plan_occurrences') is null
     or to_regclass('clara.accounting_work') is null
     or to_regclass('clara.operation_receipts') is null
     or to_regclass('clara.journal_entries') is null
     or to_regclass('clara.coa_accounts') is null
     or to_regclass('clara.documents') is null
     or to_regclass('clara.document_service_periods') is null
     or to_regclass('clara.clients') is null
     or to_regclass('clara.users') is null then
    raise exception '#652 prestate: the 0140/0178/0193 cohort is absent -- those files must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)') is null
     or to_regprocedure('clara._plan_admit_occurrence(uuid,date,text,text,boolean)') is null
     or to_regprocedure('clara._plan_admissible_event(uuid)') is null
     or to_regprocedure('clara._plan_run_model()') is null
     or to_regprocedure('clara._assert_plan_schedule(text,text,text,int,text,date,date,text)') is null
     or to_regprocedure('clara._plan_overlap_warning(uuid,jsonb)') is null
     or to_regprocedure('clara._plan_due_events(date,text,text,int,boolean,date,date,int)') is null
     or to_regprocedure('clara._assert_journal_basis(jsonb)') is null
     or to_regprocedure('clara._journal_basis_digest(jsonb)') is null
     or to_regprocedure('clara._journal_document_filed(uuid,uuid,uuid)') is null
     or to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._hash(jsonb)') is null
     or to_regprocedure('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)') is null
     or to_regprocedure('clara.role_rank(text)') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '#652 prestate: a required 0004/0178/0182/0193 door or guard is absent'
      using errcode='CLR10';
  end if;

  if to_regclass('clara.accrual_adjustments') is not null then
    raise exception '#652 prestate: clara.accrual_adjustments already exists' using errcode='CLR10';
  end if;
  select coalesce(string_agg(p.proname, ',' order by p.proname), '(none)') into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.proname in ('create_accrual_adjustment','create_accrual_adjustment_for',
                       'list_accrual_adjustments','get_accrual_adjustment','_accrual_plan_core');
  if v_names <> '(none)' then
    raise exception '#652 prestate: an accrual door already exists; found %', v_names using errcode='CLR10';
  end if;

  -- THE COMPOSITE THIS RELATION'S PRIMARY JOIN KEY LANDS ON, read LIVE rather than assumed: a
  -- renamed or narrowed unique would make the FK below fail with a message about an index rather
  -- than about the assumption that broke.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.accounting_plan_revisions'::regclass
                    and conname = 'uq_plan_revisions_id_plan_revision' and contype = 'u') then
    raise exception '#652 prestate: uq_plan_revisions_id_plan_revision (0193:551) is absent -- the tenant-carrying plan-revision FK has nothing to point at'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.documents'::regclass
                    and conname = 'uq_documents_id_firm' and contype = 'u') then
    raise exception '#652 prestate: uq_documents_id_firm (0007:58) is absent' using errcode='CLR10';
  end if;
  -- `clara.document_service_periods` has NO (id, firm_id) unique and this file adds none: a
  -- foreign `alter table` is outside its remit (§C asserts zero of them). The tenant on that
  -- reference is therefore carried by a TRIGGER rather than by a composite FK — the same division
  -- 0140 itself makes for `t_dsp_region_congruent`, whose FK proves the firm and whose trigger
  -- proves the document. Stated here so a later reader does not mistake the bare FK for an
  -- oversight.
  if to_regprocedure('clara.record_document_service_period(uuid,date,date,text,text)') is null then
    raise exception '#652 prestate: 0140''s service-period human door is absent' using errcode='CLR10';
  end if;

  raise notice '#652 prestate: clean -- no clara.accrual_adjustments relation and no accrual door exists; the 0140 term carrier, the 0178 work lane, the 0182 evidence predicates and the 0193 plan lane are all present.';
end
$w652_pre$;

-- THE SIX PLAN-LANE BODIES THIS FILE DEPENDS ON AND MUST NOT CHANGE, pinned by pre-image sha256
-- MEASURED on a migrated database rather than transcribed from a creating file (several live
-- bodies in this estate are splices, and a transcribed digest pins the wrong text). §C re-reads the
-- catalog and requires byte equality.
do $w652_pin$
declare v_sha text;
begin
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._plan_admit_occurrence(uuid,date,text,text,boolean)'::regprocedure;
  if v_sha <> '5dc6614a8ac9b014e81a170d2a607b4c43eb9d253936bb6db67a529340566975' then
    raise exception '#652 prestate: clara._plan_admit_occurrence has DRIFTED from the pinned 0193 body (sha %) -- re-read the orphan wall and the admission rung before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if v_sha <> 'e7b3dfb97408f40049ad69799c2da229e1bd7c9e3f5d66ae7c20f110c20adc1c' then
    raise exception '#652 prestate: clara.create_accounting_plan has DRIFTED from the pinned 0193 body (sha %) -- clara._accrual_plan_core mirrors its exact sequence and must be re-derived', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._assert_plan_schedule(text,text,text,int,text,date,date,text)'::regprocedure;
  if v_sha <> 'afbe98d0003ed07ae73840706763fc99daac87592200977bc1fc7cfc8bee65f1' then
    raise exception '#652 prestate: clara._assert_plan_schedule has DRIFTED from the pinned 0193 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._plan_occurrence_basis(jsonb,date,text,uuid)'::regprocedure;
  if v_sha <> 'a66f88f1e0ec2d9b284f0f0ee087957a3f6358fc8987314ad82a268d1ae2bd9d' then
    raise exception '#652 prestate: clara._plan_occurrence_basis has DRIFTED from the pinned 0193 body (sha %) -- the mirrored reversal basis is what binds a reversal to its accrual', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._plan_admissible_event(uuid)'::regprocedure;
  if v_sha <> '3b569e338f1c1ff563c61a2185db7198c565c804bf66c92fa941c06a4470f4b3' then
    raise exception '#652 prestate: clara._plan_admissible_event has DRIFTED from the pinned 0193 body (sha %)', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._plan_primary_entry(uuid,date)'::regprocedure;
  if v_sha <> 'e3106ae16a3f712c230bed6a1b2dcd8415ff17878436788a4a9b0edc48b4af46' then
    raise exception '#652 prestate: clara._plan_primary_entry has DRIFTED from the pinned 0193 body (sha %) -- the orphan wall reads it', v_sha
      using errcode='CLR10';
  end if;
end $w652_pin$;

-- THE FOREIGN RELATION THIS FILE MUST NOT ALTER, pinned the SAME WAY the six bodies are —
-- MEASURED here, into a temp table, and re-compared in §E. A transcribed literal would assert a
-- property of the whole chain BELOW this file rather than of this file: any earlier migration that
-- ever added a constraint to `clara.document_service_periods` would then red THIS migration with a
-- message about #652 (review round 1, A4).
create temp table w652_foreign_pin on commit drop as
select 'clara.document_service_periods'::text as relname,
       (select count(*)::int from pg_constraint
         where conrelid = 'clara.document_service_periods'::regclass) as constraints;

create temp table w652_plan_pin on commit drop as
select p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as digest
  from pg_proc p
 where p.oid in (
   'clara._plan_admit_occurrence(uuid,date,text,text,boolean)'::regprocedure,
   'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure,
   'clara._assert_plan_schedule(text,text,text,int,text,date,date,text)'::regprocedure,
   'clara._plan_occurrence_basis(jsonb,date,text,uuid)'::regprocedure,
   'clara._plan_admissible_event(uuid)'::regprocedure,
   'clara._plan_primary_entry(uuid,date)'::regprocedure);

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.accrual_adjustments — THE TYPED PARTICULARS, KEYED BY PLAN AND REVISION.
--
--     The relation idiom is `clara.periodic_adjustments`' (0194:333-398): append-only apart from
--     one one-way correction stamp, tenant-carrying COMPOSITE foreign keys, and ZERO grants to any
--     application role — the web reads through the doors, exactly as `apps/web/lib/plans/api.ts`
--     does for the three plan relations (0193:408).
--
--     WHY (plan_id, revision) IS THE KEY. A plan revision is what an occurrence names
--     (`fk_plan_occurrences_revision`, 0193:671), so keying the particulars the same way makes
--     "which accrual is this occurrence executing" a JOIN rather than a guess — and makes it the
--     SAME answer whether the occurrence was admitted by the configuration door or by the runtime
--     scan. That is the entrance-independence the gap map flagged, expressed as a unique index.
-- =====================================================================================
create table clara.accrual_adjustments (
  id                        uuid        primary key default gen_random_uuid(),
  firm_id                   uuid        not null references clara.firms(id),
  client_id                 uuid        not null,
  plan_id                   uuid        not null,
  revision                  integer     not null check (revision >= 1),
  -- What this accrual is FOR, in the firm's own words. Mirrors the plan row's own purpose so a
  -- reader of this relation alone never has to join to learn what the schedule is about.
  purpose                   text        not null check (btrim(purpose) <> ''),
  expense_account_code      text        not null check (btrim(expense_account_code) <> ''),
  liability_account_code    text        not null check (btrim(liability_account_code) <> ''),
  -- STRICTLY POSITIVE. An accrual that accrues nothing is not a proposal with a small number in
  -- it; it is a missing term, and the door says so at the control the preparer typed in.
  amount_cents              bigint      not null check (amount_cents > 0),
  currency                  text        not null check (currency = 'MYR'),
  effective_from            date        not null,
  -- NOT NULL, because the law is STRUCTURAL rather than a door's promise (THE SIXTH MEASUREMENT):
  -- an accrual states a service period that ENDS, so the authority that accrues for it ends too,
  -- on or before the last day of that period. An open-ended accrual would go on posting a line
  -- naming a term it had already run past.
  effective_to              date        not null,
  -- THE SERVICE PERIOD: the span of time the accrued cost belongs to. NOT NULL on both sides,
  -- because "a silent term is rejected" is this ticket's own acceptance line and a nullable column
  -- would make it a door's promise instead of a fact about the row.
  service_period_start      date        not null,
  service_period_end        date        not null,
  -- ONE CLOSED MEMBER, and the ceiling is the point (see THE THIRD MEASUREMENT in the header).
  term_source               text        not null check (term_source = 'human_stated'),
  -- The 0140 carrier row this term was anchored to, when it came from a filed document. BARE FK
  -- by necessity: clara.document_service_periods carries no (id, firm_id) unique and this file
  -- adds none. The tenant and the document are proven by t_accrual_adjustments_term_congruent.
  document_service_period_id uuid       references clara.document_service_periods(id),
  -- A CLOSED SELECTION-RULE OBJECT AND NOTHING ELSE: `{"rule": "..."}`. The `= 1` key count is
  -- what stops this becoming a place to smuggle a formula (see THE FOURTH MEASUREMENT).
  -- `method - 'rule' = '{}'` is the "and nothing else" half, spelled as an EXPRESSION because a
  -- CHECK may not carry a subquery (`select count(*) from jsonb_object_keys(...)` is a subquery and
  -- PostgreSQL refuses it outright). Removing the one admitted key must leave an empty object.
  --
  -- ONE ADMITTED RULE, because one rule is what the schedule PERFORMS: a column that could hold a
  -- selection nobody applies would make the durable record say something the ledger does not do.
  -- The three drafted rules are a successor residual (THE FOURTH MEASUREMENT), and a widening of
  -- this CHECK is the migration that must arrive WITH the lane that honours them.
  method                    jsonb       not null
                              check (jsonb_typeof(method) = 'object'
                                     and (method - 'rule') = '{}'::jsonb
                                     and (method ->> 'rule') = 'stated_amount'),
  authority_kind            text        not null check (authority_kind in ('explicit_instruction')),
  authority_ref             jsonb       not null check (jsonb_typeof(authority_ref) = 'object'),
  -- FIRM-WIDE, because `clara.documents` carries no client column: the FILING binds a document to
  -- a client, and `clara._journal_document_filed` is what checks THIS client's live filing
  -- (0194:394-397's measurement, verbatim).
  source_document_id        uuid,
  -- WHERE THE INSTRUCTION THAT AUTHORISES THIS ACCRUAL IS RECORDED, in the preparer's own words.
  -- The authority_ref is the ROW; this is the sentence a later reader needs to understand it.
  instruction               text        not null check (btrim(instruction) <> ''),
  corrects_accrual_id       uuid        references clara.accrual_adjustments(id),
  corrected_by_accrual_id   uuid        references clara.accrual_adjustments(id),
  recorded_by               uuid        not null references clara.users(id),
  created_at                timestamptz not null default now(),
  constraint ck_accrual_adjustments_service_period check (service_period_end >= service_period_start),
  constraint ck_accrual_adjustments_window check (effective_to >= effective_from),
  -- THE SCHEDULE RUNS INSIDE THE TERM IT NAMES, at the storage layer as well as at the door: a
  -- definer INSERT cannot write a row whose window reaches outside the period it accrues for.
  constraint ck_accrual_adjustments_window_in_term check (
    effective_from >= service_period_start and effective_to <= service_period_end),
  constraint ck_accrual_adjustments_self check (
    id is distinct from corrects_accrual_id and id is distinct from corrected_by_accrual_id),
  -- A TERM BOUND TO A DOCUMENT NEEDS THAT DOCUMENT NAMED. The pair travels together or not at all.
  constraint ck_accrual_adjustments_term_document check (
    document_service_period_id is null or source_document_id is not null),
  constraint fk_accrual_adjustments_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- THE PRIMARY JOIN KEY, TENANT-CARRYING. FORCE RLS does not stop a DEFINER insert writing
  -- another client's plan id under this firm; this composite does, at the storage layer
  -- (`uq_plan_revisions_id_plan_revision`, 0193:551 — the same composite
  -- `fk_plan_occurrences_revision` already points at).
  constraint fk_accrual_adjustments_plan_revision foreign key (plan_id, revision, firm_id, client_id)
    references clara.accounting_plan_revisions(plan_id, revision, firm_id, client_id),
  constraint fk_accrual_adjustments_document foreign key (source_document_id, firm_id)
    references clara.documents(id, firm_id),
  -- ONE ACCRUAL PER PLAN REVISION: the structural half of "which accrual is this occurrence
  -- executing", and what makes the (plan_id, revision) join single-valued for every entrance.
  constraint uq_accrual_adjustments_plan_revision unique (plan_id, revision),
  constraint uq_accrual_adjustments_id_firm_client unique (id, firm_id, client_id)
);
comment on table clara.accrual_adjustments is
  '#652: one authorised accrual''s typed particulars -- amount, both account legs, the business '
  'purpose, the effective window, the human-stated SERVICE PERIOD, the selection method, the '
  'authority and the instruction. Written ONLY by clara.create_accrual_adjustment / '
  'create_accrual_adjustment_for, inside the configuration transaction that also writes the plan, '
  'its revision, the current period''s occurrence and the admitted Work. Append-only apart from '
  'the one-way corrected_by_accrual_id stamp; no application role holds DML or SELECT. '
  'term_source is a ONE-MEMBER CHECK: a model-derived period is not an anchored fact '
  '(0140''s table comment, CONFIRMED AS LAW).';

-- ONE CORRECTION PER TARGET, structurally: two accruals correcting one would leave the chain
-- ambiguous and the back-stamp racing itself (0194's own index, same reasoning).
create unique index uq_accrual_adjustments_corrects
  on clara.accrual_adjustments(corrects_accrual_id) where (corrects_accrual_id is not null);
create index ix_accrual_adjustments_client
  on clara.accrual_adjustments(client_id, effective_from desc, created_at desc);
create index ix_accrual_adjustments_document
  on clara.accrual_adjustments(source_document_id) where (source_document_id is not null);

alter table clara.accrual_adjustments enable row level security;
alter table clara.accrual_adjustments force row level security;
create policy p_accrual_adjustments_owner on clara.accrual_adjustments for all to clara_fn_owner
  using (true) with check (true);
-- NO GRANT TO ANY APPLICATION ROLE, in either direction. clara_authenticated reads through
-- clara.list_accrual_adjustments / get_accrual_adjustment; clara_runtime is told its effect by the
-- door's own answer, exactly as it is on clara.operation_receipts.

create function clara._tf_accrual_adjustment_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'an accrual adjustment is never deleted (correct it, do not erase it)'
      using errcode='CLR08',
        detail='{"reason":"accrual_adjustment_immutable","column":"*"}';
  end if;
  -- THE ONE ADMITTED UPDATE: the correction back-pointer, NULL -> an id, once. Everything else is
  -- compared column by column so a future writer cannot quietly widen this by adding a SET.
  if old.corrected_by_accrual_id is not null or new.corrected_by_accrual_id is null then
    raise exception 'an accrual adjustment admits exactly one update: stamping its correction, once'
      using errcode='CLR08', detail='{"reason":"accrual_adjustment_immutable"}';
  end if;
  if row(new.id,new.firm_id,new.client_id,new.plan_id,new.revision,new.purpose,
         new.expense_account_code,new.liability_account_code,new.amount_cents,new.currency,
         new.effective_from,new.effective_to,new.service_period_start,new.service_period_end,
         new.term_source,new.document_service_period_id,new.method,new.authority_kind,
         new.authority_ref,new.source_document_id,new.instruction,new.corrects_accrual_id,
         new.recorded_by,new.created_at)
     is distinct from
     row(old.id,old.firm_id,old.client_id,old.plan_id,old.revision,old.purpose,
         old.expense_account_code,old.liability_account_code,old.amount_cents,old.currency,
         old.effective_from,old.effective_to,old.service_period_start,old.service_period_end,
         old.term_source,old.document_service_period_id,old.method,old.authority_kind,
         old.authority_ref,old.source_document_id,old.instruction,old.corrects_accrual_id,
         old.recorded_by,old.created_at) then
    raise exception 'an accrual adjustment is immutable; record a changed accrual as a correction'
      using errcode='CLR08', detail='{"reason":"accrual_adjustment_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_accrual_adjustment_append_only() from public;
create trigger t_accrual_adjustments_append_only before update or delete on clara.accrual_adjustments
  for each row execute function clara._tf_accrual_adjustment_append_only();
create trigger t_accrual_adjustments_no_truncate before truncate on clara.accrual_adjustments
  for each statement execute function clara._tf_no_truncate();

-- THE TENANT AND THE DOCUMENT ON THE BOUND TERM, closed by a TRIGGER rather than by the bare FK
-- above — 0140's own `t_dsp_region_congruent` division, for the identical reason: the reference
-- can only be declared against the primary key, so every other property of the row it names is a
-- wall a trigger has to hold. Without it a term row of ANOTHER firm, or of another document of
-- this firm, or a SUPERSEDED one, would satisfy every declared constraint here.
create function clara._tf_accrual_adjustment_term_congruent() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare d record;
begin
  if new.document_service_period_id is null then return new; end if;
  select * into d from clara.document_service_periods where id = new.document_service_period_id;
  if not found
     or d.firm_id <> new.firm_id
     or d.document_id is distinct from new.source_document_id
     or d.superseded_at is not null
     or d.basis_kind <> 'human_stated'
     or d.period_start <> new.service_period_start
     or d.period_end <> new.service_period_end then
    raise exception 'the bound service period is not this document''s live human-stated term'
      using errcode='CLR10',
        detail='{"reason":"accrual_term_document_mismatch","field":"accrual.document_service_period_id"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_accrual_adjustment_term_congruent() from public;
create trigger t_accrual_adjustments_term_congruent before insert on clara.accrual_adjustments
  for each row execute function clara._tf_accrual_adjustment_term_congruent();

-- =====================================================================================
-- §B  THE PARTICULARS' PREDICATES. Ungranted; shared by both doors so the two can never disagree
--     about what a well-formed accrual is.
-- =====================================================================================

-- THE CLOSED SELECTION-RULE SET, stated once so the refusal can LIST it and a form can offer
-- exactly what the schedule honours. ONE MEMBER (THE FOURTH MEASUREMENT): `stated_amount` is the
-- rule this slice performs, and a refusal that listed three more would be telling a caller to
-- re-send under a rule that changes nothing.
create function clara._accrual_methods() returns text[]
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select array['stated_amount']::text[]
$$;
revoke all on function clara._accrual_methods() from public;

-- A DATE OUT OF THE PARTICULARS, or a typed refusal naming the control. Never a bare cast: a
-- malformed date would otherwise arrive as an unclassifiable 22008 out of the one path this file
-- promises is fully typed.
create function clara._accrual_date(p_accrual jsonb, p_key text, p_reason text) returns date
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_raw text; v_out date;
begin
  v_raw := nullif(btrim(coalesce(p_accrual ->> p_key, '')), '');
  if v_raw is null then
    raise exception 'an accrual needs its %', p_key using errcode='CLR10',
      detail=jsonb_build_object('reason', p_reason, 'field', 'accrual.' || p_key,
        'constraint','present')::text;
  end if;
  begin
    v_out := v_raw::date;
  exception when others then
    raise exception 'the % % is not a calendar date', p_key, v_raw using errcode='CLR10',
      detail=jsonb_build_object('reason', p_reason, 'field', 'accrual.' || p_key,
        'constraint','iso_date')::text;
  end;
  return v_out;
end $$;
revoke all on function clara._accrual_date(jsonb,text,text) from public;

-- THE PAYLOAD HALF. Everything here is a property of what the caller SENT — asked before any
-- reservation and before any durable write, so a refusal costs nothing and a lost-response retry
-- of the SAME figures still replays (0182's payload/world split, applied again).
create function clara._assert_accrual_particulars(p_accrual jsonb) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_amount numeric; v_rule text; v_start date; v_end date; v_uuid uuid;
begin
  if p_accrual is null or jsonb_typeof(p_accrual) <> 'object' then
    raise exception 'the accrual particulars are a JSON object' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual","constraint":"object"}';
  end if;

  -- THE AMOUNT. Exact minor units; never a float, never a string that would cast cleanly.
  if p_accrual -> 'amount_cents' is null or jsonb_typeof(p_accrual -> 'amount_cents') = 'null' then
    raise exception 'an accrual needs its stated amount' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"present"}';
  end if;
  if jsonb_typeof(p_accrual -> 'amount_cents') <> 'number' then
    raise exception 'the accrued amount is an integer JSON number of minor units' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"integer_cents"}';
  end if;
  v_amount := (p_accrual ->> 'amount_cents')::numeric;
  if v_amount <> trunc(v_amount) or v_amount > 9223372036854775807::numeric then
    raise exception 'the accrued amount is an integer number of minor units' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"integer_cents"}';
  end if;
  -- ZERO IS ITS OWN REFUSAL, AND IT IS A TERM PROBLEM (C08.2). The lines this lane posts are
  -- DERIVED from the particulars, so a degenerate particular yields degenerate lines and
  -- `clara._assert_journal_basis` would answer `lines[1] exactly_one_side` -- true of the derived
  -- lines, useless to the preparer, and not the honest name. Asked here it names the control the
  -- human typed in.
  if v_amount = 0 then
    raise exception 'an accrual of zero accrues nothing: state the amount or do not accrue'
      using errcode='CLR10',
        detail='{"reason":"accrual_zero_amount","field":"accrual.amount_cents"}';
  end if;
  if v_amount < 0 then
    raise exception 'an accrual amount is positive; a reversal is the schedule''s own second leg'
      using errcode='CLR10',
        detail='{"reason":"invalid_accrual","field":"accrual.amount_cents","constraint":"positive"}';
  end if;

  if upper(btrim(coalesce(p_accrual ->> 'currency',''))) <> 'MYR' then
    raise exception 'only MYR is supported' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.currency","constraint":"myr"}';
  end if;

  -- BOTH LEGS. Neither side of an accrual is derivable from the other.
  if nullif(btrim(coalesce(p_accrual ->> 'expense_account_code','')),'') is null then
    raise exception 'an accrual names the expense account it charges' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.expense_account_code","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_accrual ->> 'liability_account_code','')),'') is null then
    raise exception 'an accrual names the liability account it accrues into' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.liability_account_code","constraint":"nonempty"}';
  end if;

  -- THE TERM. Absent on either side is `silent_term` and not a generic shape refusal, because
  -- "a silent term is rejected" is this ticket's own acceptance line and the preparer's next move
  -- differs: they have to go and find out, not fix a typo.
  if nullif(btrim(coalesce(p_accrual ->> 'service_period_start','')),'') is null then
    raise exception 'an accrual states the service period it belongs to' using errcode='CLR10',
      detail='{"reason":"silent_term","field":"accrual.service_period_start"}';
  end if;
  if nullif(btrim(coalesce(p_accrual ->> 'service_period_end','')),'') is null then
    raise exception 'an accrual states the service period it belongs to' using errcode='CLR10',
      detail='{"reason":"silent_term","field":"accrual.service_period_end"}';
  end if;
  v_start := clara._accrual_date(p_accrual, 'service_period_start', 'silent_term');
  v_end := clara._accrual_date(p_accrual, 'service_period_end', 'silent_term');
  if v_end < v_start then
    raise exception 'a service period cannot end before it starts' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.service_period_end","constraint":"after_start"}';
  end if;
  -- WHOSE TERM IT IS. One closed member: a period a MODEL read off a document may not enter a
  -- durable artifact (0140's table comment, CONFIRMED AS LAW).
  if coalesce(p_accrual ->> 'term_source','') <> 'human_stated' then
    raise exception 'an accrual term is one a person stated; a derived or extracted period is not an anchored fact'
      using errcode='CLR10',
        detail='{"reason":"silent_term","field":"accrual.term_source","constraint":"human_stated"}';
  end if;

  -- THE METHOD. A closed selection-rule object with exactly one key.
  if p_accrual -> 'method' is null or jsonb_typeof(p_accrual -> 'method') <> 'object' then
    raise exception 'an accrual names the rule that selects its amount' using errcode='CLR10',
      detail=jsonb_build_object('reason','accrual_method_unsupported','field','accrual.method',
        'supported', to_jsonb(clara._accrual_methods()))::text;
  end if;
  if (select count(*) from jsonb_object_keys(p_accrual -> 'method')) <> 1 then
    raise exception 'an accrual method carries its rule and nothing else' using errcode='CLR10',
      detail=jsonb_build_object('reason','accrual_method_unsupported','field','accrual.method',
        'constraint','rule_only', 'supported', to_jsonb(clara._accrual_methods()))::text;
  end if;
  v_rule := p_accrual -> 'method' ->> 'rule';
  if v_rule is null or not (v_rule = any (clara._accrual_methods())) then
    raise exception 'accrual method % is not a supported selection rule', coalesce(v_rule,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_method_unsupported','field','accrual.method.rule',
          'rule', v_rule, 'supported', to_jsonb(clara._accrual_methods()))::text;
  end if;
  if nullif(btrim(coalesce(p_accrual ->> 'instruction','')),'') is null then
    raise exception 'an accrual records the instruction that authorised it' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.instruction","constraint":"nonempty"}';
  end if;
  if char_length(btrim(coalesce(p_accrual ->> 'memo',''))) > 4000 then
    raise exception 'the memo is % characters; the postable maximum is 4000',
      char_length(btrim(p_accrual ->> 'memo'))
      using errcode='CLR10',
        detail='{"reason":"invalid_accrual","field":"accrual.memo","constraint":"max_length"}';
  end if;

  -- THE TWO OPTIONAL IDS, shape only. Their WORLD half is `_assert_accrual_world`.
  for v_rule in select unnest(array['source_document_id','document_service_period_id']) loop
    if nullif(btrim(coalesce(p_accrual ->> v_rule,'')),'') is not null then
      begin
        v_uuid := (p_accrual ->> v_rule)::uuid;
      exception when others then
        raise exception '% does not name a row by id', v_rule using errcode='CLR10',
          detail=jsonb_build_object('reason','invalid_accrual','field','accrual.' || v_rule,
            'constraint','uuid')::text;
      end;
    end if;
  end loop;
  if nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'') is not null
     and nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'') is null then
    raise exception 'a term anchored to a document names that document too' using errcode='CLR10',
      detail='{"reason":"invalid_accrual","field":"accrual.source_document_id","constraint":"required_by_term"}';
  end if;
end $$;
revoke all on function clara._assert_accrual_particulars(jsonb) from public;

-- THE SCHEDULE RUNS INSIDE THE TERM IT NAMES (THE SIXTH MEASUREMENT). PAYLOAD-HALF, exactly like
-- the particulars: it reads nothing but its arguments, so it is asked BEFORE the reservation and a
-- refusal costs nothing — not even an `op_receipts` row.
--
-- THE THREE RULES, AND WHAT EACH ONE STOPS:
--   · `effective_to` present  — an authority with no end under a term that ends would go on posting
--     a line naming a term it had already run past.
--   · `effective_from >= service_period_start` — the first occurrence would otherwise post BEFORE
--     the period it claims to accrue for.
--   · `effective_to <= service_period_end` — the last occurrence would otherwise post after it.
-- Together they make "every posting date lies inside the stated term" a property of the ROW rather
-- than of the preparer's care. The reversal leg is out of scope by construction: 0193's
-- `_plan_window_ceiling` (0193:1008) lifts an auto-reversing plan's ceiling to the reversal of
-- `effective_to`, so an authority ending on its last accrual can still undo it.
create function clara._assert_accrual_term_window(p_accrual jsonb, p_effective_from date,
    p_effective_to date) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_start date; v_end date;
begin
  v_start := clara._accrual_date(p_accrual, 'service_period_start', 'silent_term');
  v_end := clara._accrual_date(p_accrual, 'service_period_end', 'silent_term');
  if p_effective_to is null then
    raise exception 'an accrual for a term that ends needs an authority that ends with it'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_term_window_mismatch','field','effective_to',
          'constraint','bounded_window','service_period_end', to_char(v_end,'YYYY-MM-DD'))::text;
  end if;
  if p_effective_from is null or p_effective_from < v_start then
    raise exception 'the authority would start % , before the service period it accrues for (%)',
      coalesce(to_char(p_effective_from,'YYYY-MM-DD'),'(null)'), to_char(v_start,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_term_window_mismatch','field','effective_from',
          'constraint','within_term','service_period_start', to_char(v_start,'YYYY-MM-DD'))::text;
  end if;
  if p_effective_to > v_end then
    raise exception 'the authority would still be accruing on % , after the term it names ends (%)',
      to_char(p_effective_to,'YYYY-MM-DD'), to_char(v_end,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_term_window_mismatch','field','effective_to',
          'constraint','within_term','service_period_end', to_char(v_end,'YYYY-MM-DD'))::text;
  end if;
end $$;
revoke all on function clara._assert_accrual_term_window(jsonb,date,date) from public;

-- THE SCHEDULE REACHES A DATE INSIDE THE WINDOW, OR THERE IS NO ACCRUAL (THE SEVENTH MEASUREMENT).
-- PAYLOAD-HALF like the two walls above -- it reads nothing but its arguments and the plan lane's
-- own IMMUTABLE date arithmetic (`clara._plan_due_events`, 0193:845, PINNED-adjacent and not recut
-- here), so a refusal costs not even an `op_receipts` row.
--
-- WHAT IT STOPS, MEASURED (review round 2, NB1): a term of 2026-07-01..2026-07-15 under a monthly
-- `last_day_of_month` schedule was ACCEPTED -- plan live, accrual row written, a configuration
-- receipt handed back -- and `clara.request_plan_catch_up` over the WHOLE window then answered
-- `{"events":[],"admitted":0}`, because the only due date the schedule reaches (the 31st) lies
-- outside the term the SIXTH MEASUREMENT now requires the window to sit inside. The surface said
-- "No due dates reached yet", which was true and would have stayed true for ever. That is the same
-- defect as a recorded selection nobody performs (THE FOURTH MEASUREMENT): an accrual that can
-- never accrue.
--
-- IT IS A WALL, NOT A BAN, and the refusal names the control that makes it one: the SAME half-month
-- term with `day_of_month = 15` reaches 2026-07-15 and is configured. So the field is the DAY RULE
-- (or the day number under it), never the term -- the term is the fact a human stated, and the
-- schedule is the thing to change.
create function clara._accrual_schedule_yields(p_frequency text, p_day_rule text, p_day_of_month int,
    p_effective_from date, p_effective_to date) returns boolean
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select exists (select 1
                   from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule,
                          p_day_of_month, false, p_effective_from, p_effective_to, 1) e
                  where e.leg = 'primary');
$$;
revoke all on function clara._accrual_schedule_yields(text,text,int,date,date) from public;

create function clara._assert_accrual_schedule_yields(p_frequency text, p_day_rule text,
    p_day_of_month int, p_effective_from date, p_effective_to date) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
begin
  -- A SCHEDULE 0193's OWN VALIDATOR WILL REFUSE IS NOT THIS WALL'S BUSINESS. `_assert_plan_schedule`
  -- (pinned in §0, reached later through the plan core) names an unknown frequency, an unknown day
  -- rule, a day outside 1..28 and a window that ends before it starts, each at its own control --
  -- and `clara._plan_due_events` answers "no events" for every one of them. Answering it HERE would
  -- re-spell another lane's refusal in this lane's vocabulary and send the preparer to the wrong
  -- control, so each of those shapes falls through to the validator that owns it.
  if p_frequency is null or p_frequency not in ('monthly','quarterly','annual') then return; end if;
  if p_day_rule is null or p_day_rule not in ('day_of_month','last_day_of_month') then return; end if;
  if p_day_rule = 'day_of_month'
     and (p_day_of_month is null or p_day_of_month not between 1 and 28) then return; end if;
  if p_effective_from is null or p_effective_to is null or p_effective_to < p_effective_from then
    return;
  end if;
  if clara._accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month, p_effective_from,
       p_effective_to) then
    return;
  end if;
  raise exception 'this schedule reaches no accrual date between % and %, so the accrual would be recorded and never post',
    to_char(p_effective_from,'YYYY-MM-DD'), to_char(p_effective_to,'YYYY-MM-DD')
    using errcode='CLR10',
      detail=jsonb_build_object('reason','accrual_schedule_yields_no_occurrence',
        'field', case when p_day_rule = 'day_of_month' then 'day_of_month' else 'day_rule' end,
        'constraint','yields_occurrence', 'frequency', p_frequency, 'day_rule', p_day_rule,
        'effective_from', to_char(p_effective_from,'YYYY-MM-DD'),
        'effective_to', to_char(p_effective_to,'YYYY-MM-DD'))::text;
end $$;
revoke all on function clara._assert_accrual_schedule_yields(text,text,int,date,date) from public;

-- ONE ACCOUNT, ONE ROLE. Absent and INACTIVE answer identically, for the reason 0194's own account
-- wall states: neither is a postable account, and telling them apart would say whether a code the
-- caller guessed once existed. The CLASS is separate and is named, because "this code exists but
-- it is a control account" is something a preparer can act on.
create function clara._assert_accrual_account(p_client uuid, p_code text, p_type text, p_field text,
    p_non_control boolean) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare a record;
begin
  select account_type, account_class into a from clara.coa_accounts
   where client_id = p_client and account_code = p_code and is_active;
  if a.account_type is null then
    raise exception '% codes to an account this client does not have active: %', p_field, p_code
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_account_relationship','field', p_field,
          'constraint','unknown_account','account_code', p_code)::text;
  end if;
  if a.account_type <> p_type then
    raise exception '% must name a % account; % is a %', p_field, p_type, p_code, a.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_account_relationship','field', p_field,
          'constraint', p_type || '_account', 'account_code', p_code,
          'account_type', a.account_type, 'expected_account_type', p_type)::text;
  end if;
  -- A CONTROL ACCOUNT RECONCILES TO IDENTIFIED DETAIL (CONTEXT.md, "Control account"). An accrual
  -- carries none: it is an estimate of an obligation nobody has invoiced yet, so putting it in the
  -- payables control would make that control disagree with its own open items by construction.
  if p_non_control and a.account_class is not null then
    raise exception '% names the % control account; an accrual carries no identified open item', p_field, a.account_class
      using errcode='CLR10',
        detail=jsonb_build_object('reason','accrual_account_relationship','field', p_field,
          'constraint','non_control_liability','account_code', p_code,
          'account_class', a.account_class)::text;
  end if;
end $$;
revoke all on function clara._assert_accrual_account(uuid,text,text,text,boolean) from public;

-- THE WORLD HALF. Properties of rows that may move between two attempts under one key: an account
-- retired, a filing withdrawn, a term superseded. Asked AFTER the reservation branch, beside
-- 0182's own deferred filing check and for the identical reason.
create function clara._assert_accrual_world(p_firm uuid, p_client uuid, p_accrual jsonb)
  returns void language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_doc uuid; v_term uuid; d record;
begin
  perform clara._assert_accrual_account(p_client, btrim(p_accrual ->> 'expense_account_code'),
    'expense', 'accrual.expense_account_code', false);
  perform clara._assert_accrual_account(p_client, btrim(p_accrual ->> 'liability_account_code'),
    'liability', 'accrual.liability_account_code', true);

  v_doc := nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'')::uuid;
  if v_doc is not null then
    -- NO EXISTENCE ORACLE: a document of another firm, one filed to another client and a uuid
    -- naming nothing all answer identically (0182's own rule, reached through its own predicate).
    if not clara._journal_document_filed(p_firm, p_client, v_doc) then
      raise exception 'the cited document is not an active verified document of this client'
        using errcode='CLR10',
          detail='{"reason":"invalid_source_ref","field":"accrual.source_document_id","constraint":"not_filed"}';
    end if;
  end if;

  v_term := nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'')::uuid;
  if v_term is not null then
    select * into d from clara.document_service_periods where id = v_term;
    if not found or d.firm_id <> p_firm or d.document_id is distinct from v_doc
       or d.superseded_at is not null or d.basis_kind <> 'human_stated'
       or d.period_start <> clara._accrual_date(p_accrual,'service_period_start','silent_term')
       or d.period_end <> clara._accrual_date(p_accrual,'service_period_end','silent_term') then
      raise exception 'the bound service period is not this document''s live human-stated term'
        using errcode='CLR10',
          detail='{"reason":"accrual_term_document_mismatch","field":"accrual.document_service_period_id"}';
    end if;
  end if;
end $$;
revoke all on function clara._assert_accrual_world(uuid,uuid,jsonb) from public;

-- THE JOURNAL BASIS, DERIVED FROM THE PARTICULARS — one debit on the expense leg, one credit on
-- the liability leg, exact minor units. It is the SAME shape `clara._assert_journal_basis` (0178)
-- validates and the SAME shape every occurrence posts, because `clara._plan_occurrence_basis`
-- (0193:1037) only moves the posting date and exchanges the sides for a reversal.
--
-- THE POSTING DATE HERE IS A PLACEHOLDER and the form offers no control for it: every occurrence
-- replaces it with its own due date. The accrual's `effective_from` is what it holds, exactly as
-- `clara.create_accounting_plan`'s callers do today.
create function clara._accrual_journal_basis(p_accrual jsonb, p_purpose text, p_posting_date date)
  returns jsonb language sql immutable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'posting_date', to_char(p_posting_date, 'YYYY-MM-DD'),
    'memo', coalesce(nullif(btrim(coalesce(p_accrual ->> 'memo','')),''), btrim(p_purpose)),
    'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'account_code', btrim(p_accrual ->> 'expense_account_code'),
        'debit_cents', (p_accrual ->> 'amount_cents')::numeric,
        'credit_cents', 0,
        -- WHAT IS TRUE OF EVERY OCCURRENCE (THE SIXTH MEASUREMENT). This basis is FROZEN on the
        -- revision and `clara._plan_occurrence_basis` only moves the posting date, so a line
        -- reading "accrued <start> to <end>" would be a claim each of a recurring accrual's
        -- entries makes about a term only the whole schedule covers. The term is named; the
        -- entry's share of it is stated honestly.
        'description', 'one period of the accrual term ' || (p_accrual ->> 'service_period_start')
                       || ' to ' || (p_accrual ->> 'service_period_end')),
      jsonb_build_object(
        'account_code', btrim(p_accrual ->> 'liability_account_code'),
        'debit_cents', 0,
        'credit_cents', (p_accrual ->> 'amount_cents')::numeric,
        'description', 'accrual')));
$$;
revoke all on function clara._accrual_journal_basis(jsonb,text,date) from public;

-- THE CANONICAL PARTICULARS, for the reservation payload. Keys in a fixed order with the optional
-- ones normalised, so re-sending the SAME decision hashes the same whatever order a client
-- serialised its object in — and re-sending a DIFFERENT period, method or account under one key is
-- a typed conflict rather than a replay that silently drops the change.
create function clara._accrual_canonical(p_accrual jsonb) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'expense_account_code', btrim(p_accrual ->> 'expense_account_code'),
    'liability_account_code', btrim(p_accrual ->> 'liability_account_code'),
    'amount_cents', (p_accrual ->> 'amount_cents')::numeric,
    'currency', 'MYR',
    'service_period_start', p_accrual ->> 'service_period_start',
    'service_period_end', p_accrual ->> 'service_period_end',
    'term_source', p_accrual ->> 'term_source',
    'method', p_accrual -> 'method',
    'instruction', btrim(p_accrual ->> 'instruction'),
    'memo', nullif(btrim(coalesce(p_accrual ->> 'memo','')),''),
    'source_document_id', nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),''),
    'document_service_period_id', nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),''));
$$;
revoke all on function clara._accrual_canonical(jsonb) from public;

-- =====================================================================================
-- §C  THE PLAN CORE — ACTOR-EXPLICIT, so the OBO door can use it (THE FIFTH MEASUREMENT).
--
--     It is `clara.create_accounting_plan`'s own sequence with the identity resolution replaced by
--     an argument and the reservation left to the CALLER: `_assert_plan_schedule` →
--     `_assert_journal_basis` → `_journal_basis_digest` → `v_auto` → plan insert → revision insert
--     → overlap warning → preview. Nothing about that verb moves; its body is pinned in §0 and
--     re-hashed in §E.
-- =====================================================================================
create function clara._accrual_plan_core(p_firm uuid, p_client uuid, p_author uuid, p_purpose text,
    p_authority_kind text, p_authority_ref jsonb, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_ok boolean;
  v_warning jsonb; v_next jsonb;
begin
  -- THE AUTHORITY SHAPE AND ITS RESOLUTION, verbatim from 0193:1466-1512. A Knowledge preference,
  -- a calculation policy or a repeated debit has no row here, so none of them can supply authority.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  if p_authority_kind is distinct from 'explicit_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task') then
    raise exception 'a plan authority reference names an accounting_work or a chat_task'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a plan authority reference names a row by id'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  if v_ref_kind = 'accounting_work' then
    select exists (select 1 from clara.accounting_work w
                    where w.id = v_ref_id and w.firm_id = p_firm and w.client_id = p_client) into v_ok;
  else
    select exists (select 1 from clara.agent_tasks t
                    where t.id = v_ref_id and t.firm_id = p_firm and t.client_id = p_client) into v_ok;
  end if;
  if not v_ok then
    raise exception 'the instruction this accrual cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','authority_ref_unresolved','kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  perform clara._assert_plan_schedule('reversing_journal', p_frequency, p_day_rule, p_day_of_month,
    p_timezone, p_effective_from, p_effective_to, 'next_period_first_day');
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, 'reversing_journal', 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, 'reversing_journal', 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, true,
      'next_period_first_day', p_author)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, true,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', 'reversing_journal',
      'revision', 1, 'authority', p_authority_ref, 'via', 'create_accrual_adjustment_for'));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', 'reversing_journal', 'next_occurrences', coalesce(v_next,'[]'::jsonb),
    'overlap_warning', v_warning);
end $$;
revoke all on function clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb) from public;

-- THE SHARED TAIL OF BOTH DOORS: the accrual row, then the current period's occurrence, then the
-- answer. Called with a plan that ALREADY exists in this transaction, so a failure anywhere here
-- rolls the plan back with it — which is what "one commit" means.
create function clara._accrual_finish(p_firm uuid, p_client uuid, p_author uuid, p_purpose text,
    p_accrual jsonb, p_plan jsonb, p_authority_kind text, p_authority_ref jsonb,
    p_effective_from date, p_effective_to date, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_accrual uuid; v_event jsonb; v_occ jsonb := null; v_plan uuid;
begin
  v_plan := (p_plan ->> 'plan_id')::uuid;
  insert into clara.accrual_adjustments(firm_id, client_id, plan_id, revision, purpose,
      expense_account_code, liability_account_code, amount_cents, currency, effective_from,
      effective_to, service_period_start, service_period_end, term_source,
      document_service_period_id, method, authority_kind, authority_ref, source_document_id,
      instruction, recorded_by)
    values (p_firm, p_client, v_plan, (p_plan ->> 'revision')::int, btrim(p_purpose),
      btrim(p_accrual ->> 'expense_account_code'), btrim(p_accrual ->> 'liability_account_code'),
      (p_accrual ->> 'amount_cents')::bigint, 'MYR', p_effective_from, p_effective_to,
      (p_accrual ->> 'service_period_start')::date, (p_accrual ->> 'service_period_end')::date,
      p_accrual ->> 'term_source',
      nullif(btrim(coalesce(p_accrual ->> 'document_service_period_id','')),'')::uuid,
      p_accrual -> 'method', p_authority_kind, p_authority_ref,
      nullif(btrim(coalesce(p_accrual ->> 'source_document_id','')),'')::uuid,
      btrim(p_accrual ->> 'instruction'), p_author)
    returning id into v_accrual;

  -- THE CURRENT PERIOD'S OCCURRENCE, admitted through the plan lane's OWN core — the same body the
  -- runtime scan and the human catch-up call, so an accrual configured here and one admitted by a
  -- later scan are the same act. Only a PRIMARY leg is admitted at configuration: a brand-new
  -- plan has posted nothing, so its reversal has nothing to reverse and 0193's orphan wall would
  -- refuse it (and does, on its own terms, if a human ever asks for it by name).
  v_event := clara._plan_admissible_event(v_plan);
  if v_event is not null and (v_event ->> 'leg') = 'primary' then
    v_occ := clara._plan_admit_occurrence(v_plan, (v_event ->> 'due_date')::date, 'primary',
               clara._plan_run_model());
  end if;

  perform clara._audit(p_firm, p_author, null, null, 'create_accrual_adjustment', null,
    jsonb_build_object('client', p_client, 'accrual', v_accrual, 'plan', v_plan,
      'amount_cents', (p_accrual ->> 'amount_cents')::bigint,
      'service_period_start', p_accrual ->> 'service_period_start',
      'service_period_end', p_accrual ->> 'service_period_end',
      'method', p_accrual -> 'method', 'op_key', p_op_key));

  return jsonb_build_object(
    'accrual_id', v_accrual,
    'plan_id', v_plan,
    'revision_id', p_plan ->> 'revision_id',
    'revision', (p_plan ->> 'revision')::int,
    'kind', 'reversing_journal',
    'status', 'active',
    -- THE BOUNDARY, IN THE ANSWER ITSELF. Accepting a configuration posts nothing: the entry and
    -- its committed clara.operation_receipts row belong to the run's own later commit.
    'posted', false,
    'configuration_receipt', jsonb_build_object('fn','create_accrual_adjustment','op_key',p_op_key),
    'occurrence', v_occ,
    'next_occurrences', p_plan -> 'next_occurrences',
    'overlap_warning', p_plan -> 'overlap_warning');
end $$;
revoke all on function clara._accrual_finish(uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb,date,date,text) from public;

-- =====================================================================================
-- §D  THE DOORS.
-- =====================================================================================

-- THE HUMAN DOOR. bookkeeper+ through `clara._human_ctx`, `_reserve_op`/`_finish_op` idempotency on
-- a required op key, `_audit` on the effect, typed CLR refusals carrying `detail.reason`.
--
-- IT NESTS `clara.create_accounting_plan` ON A DERIVED KEY, deliberately: a human-configured
-- accrual's plan is then byte-for-byte the plan that verb has always written, with its own audit
-- row and its own reservation. `clara._reserve_op` keys on (firm, fn, op_key) (0004:46-52), so the
-- two reservations are distinct rows and a replay of the OUTER key returns the stored result
-- without reaching the plan verb at all.
create function clara.create_accrual_adjustment(
    p_client uuid, p_purpose text, p_authority_ref jsonb, p_accrual jsonb,
    p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_basis jsonb; v_dedupe jsonb; v_plan jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'configuring an accrual requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  -- THE FLOOR, WITH A TYPED REASON. `clara._human_ctx` raises CLR04 with no detail at all, and a
  -- refusal a surface cannot classify is a refusal it cannot explain; this maps the three cases
  -- onto the estate's own vocabulary without recutting that guard.
  begin
    select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;
  exception when sqlstate 'CLR04' then
    raise exception 'configuring an accrual requires an active bookkeeper or above'
      using errcode='CLR04',
        detail=jsonb_build_object('reason',
          case when clara.jwt_sub() is null then 'no_authenticated_actor'
               when clara.jwt_firm() is null then 'actor_not_active'
               else 'insufficient_role' end)::text;
  end;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accrual' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accrual needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  if p_effective_from is null then
    raise exception 'an accrual needs the date its authority starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_from","constraint":"present"}';
  end if;

  -- THE PAYLOAD HALF, BEFORE THE RESERVATION.
  perform clara._assert_accrual_particulars(p_accrual);
  perform clara._assert_accrual_term_window(p_accrual, p_effective_from, p_effective_to);
  perform clara._assert_accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month,
    p_effective_from, p_effective_to);
  v_basis := clara._accrual_journal_basis(p_accrual, p_purpose, p_effective_from);

  -- THE RESERVATION, WITH THE ONE REFUSAL 0004 RAISES OUT OF IT GIVEN A TYPED REASON. The estate's
  -- `_reserve_op` (0004:46) raises exactly one CLR10 — `op_key reused with different args` — and it
  -- carries NO detail, so a surface could neither classify it nor say which control to look at
  -- (review round 1, A3). Re-raised here as this file's own token; the CLASS is unchanged.
  begin
    v_dedupe := clara._reserve_op(v_firm, 'create_accrual_adjustment', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'author', v_actor, 'purpose', btrim(p_purpose),
        'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
        'day_of_month', p_day_of_month, 'timezone', p_timezone,
        'effective_from', p_effective_from, 'effective_to', p_effective_to,
        'accrual', clara._accrual_canonical(p_accrual))));
  exception when sqlstate 'CLR10' then
    raise exception 'this accrual key already configured a DIFFERENT accrual' using errcode='CLR10',
      detail='{"reason":"op_key_conflict","field":"op_key"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this accrual key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- THE WORLD HALF, AFTER IT — an account retired, a filing withdrawn or a term superseded between
  -- two attempts under one key is a fact about the world, and refusing it ahead of the replay
  -- branch would turn a lost-response retry into a second configuration.
  perform clara._assert_accrual_world(v_firm, p_client, p_accrual);

  v_plan := clara.create_accounting_plan(p_client, 'reversing_journal', p_purpose,
    'explicit_instruction', p_authority_ref, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, v_basis, 'next_period_first_day', p_op_key || ':plan');

  v_result := clara._accrual_finish(v_firm, p_client, v_actor, p_purpose, p_accrual, v_plan,
    'explicit_instruction', p_authority_ref, p_effective_from, p_effective_to, p_op_key);
  return clara._finish_op(v_firm, 'create_accrual_adjustment', p_op_key, v_result);
end $$;

-- THE OBO DOOR. `clara_runtime` ONLY — the `clara.admit_periodic_adjustment_work` shape
-- (0194:1298-1314), so a later `chatTurn` successor needs no migration of its own.
--
-- ITS PLAN STEP IS THE INLINE CORE, UNCONDITIONALLY. Nesting `clara.create_accounting_plan` here
-- would raise CLR04 `no authenticated actor` on every call (0193:1454 → 0004:299-308) and a grant
-- assertion would never see it; `p652.obo.for_door` invokes this on a real runtime connection for
-- exactly that reason.
create function clara.create_accrual_adjustment_for(
    p_client uuid, p_author uuid, p_purpose text, p_authority_ref jsonb, p_accrual jsonb,
    p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_client_status text; v_role text; v_member_status text;
  v_basis jsonb; v_dedupe jsonb; v_plan jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'configuring an accrual requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  -- AUTHORITY MUST BE LIVE AT THE MOMENT THE BOOKS ARE CONFIGURED. NO EXISTENCE ORACLE: an author
  -- with no membership in this firm at all answers exactly as a uuid naming nothing does, so the
  -- pair can never be used to enumerate another firm's clients. A DEACTIVATED member of THIS firm
  -- gets the precise answer instead: they already knew the client exists.
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the human this configuration acts for is no longer an active member of this firm'
      using errcode='CLR04',
        detail='{"reason":"authority_lost","field":"author"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'configuring an accrual requires a bookkeeper or above' using errcode='CLR04',
      detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accrual' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accrual needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  if p_effective_from is null then
    raise exception 'an accrual needs the date its authority starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_from","constraint":"present"}';
  end if;

  perform clara._assert_accrual_particulars(p_accrual);
  perform clara._assert_accrual_term_window(p_accrual, p_effective_from, p_effective_to);
  perform clara._assert_accrual_schedule_yields(p_frequency, p_day_rule, p_day_of_month,
    p_effective_from, p_effective_to);
  v_basis := clara._accrual_journal_basis(p_accrual, p_purpose, p_effective_from);

  -- The same typed re-raise as the human door's (review round 1, A3): one key, one payload, and a
  -- second payload under it is a CONFLICT a caller can classify rather than a bare CLR10.
  begin
    v_dedupe := clara._reserve_op(v_firm, 'create_accrual_adjustment', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'author', p_author, 'purpose', btrim(p_purpose),
        'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
        'day_of_month', p_day_of_month, 'timezone', p_timezone,
        'effective_from', p_effective_from, 'effective_to', p_effective_to,
        'accrual', clara._accrual_canonical(p_accrual))));
  exception when sqlstate 'CLR10' then
    raise exception 'this accrual key already configured a DIFFERENT accrual' using errcode='CLR10',
      detail='{"reason":"op_key_conflict","field":"op_key"}';
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this accrual key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  perform clara._assert_accrual_world(v_firm, p_client, p_accrual);

  v_plan := clara._accrual_plan_core(v_firm, p_client, p_author, p_purpose, 'explicit_instruction',
    p_authority_ref, p_frequency, p_day_rule, p_day_of_month, p_timezone, p_effective_from,
    p_effective_to, v_basis);

  v_result := clara._accrual_finish(v_firm, p_client, p_author, p_purpose, p_accrual, v_plan,
    'explicit_instruction', p_authority_ref, p_effective_from, p_effective_to, p_op_key);
  return clara._finish_op(v_firm, 'create_accrual_adjustment', p_op_key, v_result);
end $$;

-- =====================================================================================
--     THE READS. Viewer+, definer, firm-predicated — the 0038/0041/0193 read-surface idiom. The
--     LINEAGE is derived by JOIN rather than stored: plan + revision → occurrence → Work →
--     COMMITTED receipt → entry, and the reversal through `reverses_entry_id`. Nothing here caches
--     a posting state on the accrual row, because a cached one can disagree with the ledger.
-- =====================================================================================

-- ONE ACCRUAL'S OCCURRENCES, with everything a surface needs to render the two legs. The COMMITTED
-- receipt only: `clara.operation_receipts` also holds `refused` rows (0178 §B), and a refusal's id
-- rendered as "the receipt" would tell an operator that money moved.
create function clara._accrual_occurrences(p_plan uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'occurrence_id', o.id, 'leg', o.leg, 'due_date', to_char(o.due_date,'YYYY-MM-DD'),
      'period_key', to_char(o.period_key,'YYYY-MM-DD'), 'attempt', o.attempt,
      'revision', o.revision, 'work_id', o.work_id, 'work_status', w.status, 'work_error', w.error,
      'admitted_at', o.admitted_at, 'outcome', o.outcome,
      'reverses_entry_id', o.reverses_entry_id,
      'receipt_id', (select rc.id from clara.operation_receipts rc
                      where rc.work_id = o.work_id and rc.outcome = 'committed'
                      order by rc.created_at limit 1),
      'entry_id', (select rc.effects ->> 'entry_id' from clara.operation_receipts rc
                    where rc.work_id = o.work_id and rc.outcome = 'committed'
                    order by rc.created_at limit 1))
    order by o.due_date), '[]'::jsonb)
  from clara.accounting_plan_occurrences o
  left join clara.accounting_work w on w.id = o.work_id
 where o.plan_id = p_plan;
$$;
revoke all on function clara._accrual_occurrences(uuid) from public;

create function clara.list_accrual_adjustments(p_client uuid, p_from date, p_to date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_rows jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'effective_from' desc, x ->> 'created_at' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'accrual_id', a.id, 'plan_id', a.plan_id, 'revision', a.revision, 'purpose', a.purpose,
        'expense_account_code', a.expense_account_code,
        'liability_account_code', a.liability_account_code,
        'amount_cents', a.amount_cents, 'currency', a.currency,
        'effective_from', to_char(a.effective_from,'YYYY-MM-DD'),
        'effective_to', case when a.effective_to is null then null else to_char(a.effective_to,'YYYY-MM-DD') end,
        'service_period_start', to_char(a.service_period_start,'YYYY-MM-DD'),
        'service_period_end', to_char(a.service_period_end,'YYYY-MM-DD'),
        'term_source', a.term_source, 'method', a.method,
        'document_service_period_id', a.document_service_period_id,
        'source_document_id', a.source_document_id,
        'plan_status', p.status, 'plan_kind', p.kind,
        'recorded_by', a.recorded_by, 'created_at', a.created_at,
        'occurrence_count', (select count(*)::int from clara.accounting_plan_occurrences o
                              where o.plan_id = a.plan_id),
        -- POSTED means a COMMITTED receipt exists for one of this plan's occurrences. Derived,
        -- never cached: a cached flag can disagree with the ledger it claims to describe.
        'posted', exists (select 1 from clara.accounting_plan_occurrences o
                           join clara.operation_receipts rc on rc.work_id = o.work_id
                                                           and rc.outcome = 'committed'
                          where o.plan_id = a.plan_id and o.leg = 'primary')
      ) as x
        from clara.accrual_adjustments a
        join clara.accounting_plans p on p.id = a.plan_id
       where a.client_id = p_client and a.firm_id = v_firm
         and (p_from is null or a.effective_from >= p_from)
         and (p_to is null or a.effective_from <= p_to)
    ) s;
  return jsonb_build_object('client_id', p_client,
    'from', case when p_from is null then null else to_char(p_from,'YYYY-MM-DD') end,
    'to', case when p_to is null then null else to_char(p_to,'YYYY-MM-DD') end,
    'accruals', v_rows);
end $$;

create function clara.get_accrual_adjustment(p_accrual uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; a clara.accrual_adjustments; p clara.accounting_plans;
        r record; v_occ jsonb; v_reversal jsonb;
begin
  select x.actor, x.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) x;
  -- NO EXISTENCE ORACLE ACROSS FIRMS: the firm predicate is part of the lookup, so an accrual id
  -- belonging to somebody else's firm answers exactly as an id naming nothing does.
  select * into a from clara.accrual_adjustments where id = p_accrual and firm_id = v_firm;
  if a.id is null then
    raise exception 'accrual adjustment not found in your firm' using errcode='CLR11',
      detail='{"reason":"accrual_not_found"}';
  end if;
  select * into p from clara.accounting_plans where id = a.plan_id;
  select * into r from clara.accounting_plan_revisions
   where plan_id = a.plan_id and revision = a.revision;
  v_occ := clara._accrual_occurrences(a.plan_id);
  select e into v_reversal from jsonb_array_elements(v_occ) x(e)
   where x.e ->> 'leg' = 'reversal' order by x.e ->> 'due_date' desc limit 1;

  return jsonb_build_object(
    'accrual_id', a.id, 'client_id', a.client_id, 'purpose', a.purpose,
    'expense_account_code', a.expense_account_code,
    'liability_account_code', a.liability_account_code,
    'amount_cents', a.amount_cents, 'currency', a.currency,
    'effective_from', to_char(a.effective_from,'YYYY-MM-DD'),
    'effective_to', case when a.effective_to is null then null else to_char(a.effective_to,'YYYY-MM-DD') end,
    'service_period_start', to_char(a.service_period_start,'YYYY-MM-DD'),
    'service_period_end', to_char(a.service_period_end,'YYYY-MM-DD'),
    'term_source', a.term_source, 'method', a.method,
    'document_service_period_id', a.document_service_period_id,
    'source_document_id', a.source_document_id,
    'authority_kind', a.authority_kind, 'authority_ref', a.authority_ref,
    'instruction', a.instruction, 'recorded_by', a.recorded_by, 'created_at', a.created_at,
    'corrects_accrual_id', a.corrects_accrual_id,
    'corrected_by_accrual_id', a.corrected_by_accrual_id,
    'revision', a.revision,
    'plan', jsonb_build_object('plan_id', p.id, 'kind', p.kind, 'status', p.status,
      'purpose', p.purpose, 'authorised_by', p.authorised_by, 'authorised_at', p.authorised_at,
      'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
      'current_revision', p.current_revision,
      'frequency', r.frequency, 'day_rule', r.day_rule, 'day_of_month', r.day_of_month,
      'timezone', r.timezone, 'basis', r.basis, 'basis_digest', r.basis_digest,
      'auto_reverse', r.auto_reverse, 'reversal_day_rule', r.reversal_day_rule),
    'occurrences', v_occ,
    'reversal', v_reversal,
    'posted', exists (select 1 from jsonb_array_elements(v_occ) y(e)
                       where y.e ->> 'leg' = 'primary' and y.e ->> 'entry_id' is not null));
end $$;

-- =====================================================================================
--     GRANTS. The three human doors to clara_authenticated; the OBO door to clara_runtime ONLY.
--     The agent and wake lanes gain NOTHING: a lane that could author its own future authority
--     would be the agent deciding what it is allowed to do (0193 §I's sentence, unchanged).
-- =====================================================================================
revoke all on function clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,int,text,date,date,text) from public;
revoke all on function clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text) from public;
revoke all on function clara.list_accrual_adjustments(uuid,date,date) from public;
revoke all on function clara.get_accrual_adjustment(uuid) from public;

grant execute on function clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,int,text,date,date,text) to clara_authenticated;
grant execute on function clara.list_accrual_adjustments(uuid,date,date) to clara_authenticated;
grant execute on function clara.get_accrual_adjustment(uuid) to clara_authenticated;
grant execute on function clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text) to clara_runtime;

comment on function clara.create_accrual_adjustment(uuid,text,jsonb,jsonb,text,text,int,text,date,date,text) is
  '#652: configure ONE accrual. Writes the typed particulars, a reversing_journal plan, its first '
  'revision, the current period''s occurrence and the admitted Work in ONE commit, and POSTS '
  'NOTHING -- the entry and its committed operation receipt are the run''s own later commit. '
  'bookkeeper+; idempotent on (firm, create_accrual_adjustment, op_key); the plan verb it nests '
  'holds the derived key op_key||'':plan''.';
comment on function clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text) is
  '#652: the same configuration ON BEHALF OF an explicitly named human, for clara_runtime ONLY '
  '(the clara.admit_periodic_adjustment_work shape). It resolves its actor from the ARGUMENT and '
  'never from a JWT, because a runtime connection carries none; its plan step is '
  'clara._accrual_plan_core, never clara.create_accounting_plan.';
comment on function clara.get_accrual_adjustment(uuid) is
  '#652: one accrual with its whole lineage derived by JOIN -- plan + revision -> occurrence -> '
  'Work -> COMMITTED operation receipt -> journal entry, and the reversal leg through '
  'accounting_plan_occurrences.reverses_entry_id. `posted` is derived, never cached.';

reset role;

-- =====================================================================================
-- §E  TAIL CENSUS. Every claim re-READ from the live catalog.
-- =====================================================================================
do $w652_tail$
declare v_n int; v_names text; v_detail text;
begin
  -- 1 · the relation exists, is RLS-FORCED, and holds NO application grant.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='clara' and c.relkind='r' and c.relname='accrual_adjustments'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#652 tail: clara.accrual_adjustments is absent or not RLS-forced' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname='clara' and c.relname='accrual_adjustments' and c.relacl is not null) then
    raise exception '#652 tail: clara.accrual_adjustments carries a materialised ACL -- every reach is through a definer door'
      using errcode='CLR10';
  end if;

  -- 2 · the tenant-carrying composite FK and the one-accrual-per-revision unique, off pg_constraint
  --     rather than trusted from the DDL above.
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accrual_adjustments'::regclass
                    and conname='fk_accrual_adjustments_plan_revision' and contype='f'
                    and pg_get_constraintdef(oid) like '%(plan_id, revision, firm_id, client_id)%') then
    raise exception '#652 tail: the tenant-carrying plan-revision FK is absent or narrowed'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accrual_adjustments'::regclass
                    and conname='uq_accrual_adjustments_plan_revision' and contype='u') then
    raise exception '#652 tail: unique (plan_id, revision) is absent -- the occurrence join would not be single-valued'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accrual_adjustments'::regclass and contype='c'
                    and pg_get_constraintdef(oid) like '%human_stated%') then
    raise exception '#652 tail: the one-member term_source CHECK is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accrual_adjustments'::regclass and contype='c'
                    and pg_get_constraintdef(oid) like '%amount_cents > 0%') then
    raise exception '#652 tail: the positive-amount CHECK is absent' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.accrual_adjustments'::regclass and not tgisinternal;
  if v_n <> 3 then
    raise exception '#652 tail: expected the append-only, no-truncate and term-congruence triggers, found %', v_n
      using errcode='CLR10';
  end if;

  -- 3 · the grant matrix: three human doors, one runtime door, and no crossing in either direction.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('create_accrual_adjustment','list_accrual_adjustments','get_accrual_adjustment')
     and has_function_privilege('clara_authenticated', p.oid, 'execute');
  if v_n <> 3 then
    raise exception '#652 tail: expected 3 human doors granted to clara_authenticated, found %', v_n
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime',
        'clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text)'::regprocedure,
        'execute') then
    raise exception '#652 tail: clara_runtime cannot execute the OBO accrual door' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated',
        'clara.create_accrual_adjustment_for(uuid,uuid,text,jsonb,jsonb,text,text,int,text,date,date,text)'::regprocedure,
        'execute') then
    raise exception '#652 tail: the OBO door must not be reachable from the browser lane'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('create_accrual_adjustment','list_accrual_adjustments','get_accrual_adjustment')
     and has_function_privilege('clara_runtime', p.oid, 'execute');
  if v_n <> 0 then
    raise exception '#652 tail: the run holds EXECUTE on % human accrual door(s)', v_n using errcode='CLR10';
  end if;
  -- The agent and wake lanes gain NOTHING at all. Guarded on the role EXISTING, because
  -- has_function_privilege RAISES on an unknown role.
  if to_regrole('clara_agent_ro') is not null then
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname like '%accrual%'
       and has_function_privilege('clara_agent_ro', p.oid, 'execute');
    if v_n <> 0 then
      raise exception '#652 tail: the agent read lane holds EXECUTE on % accrual door(s)', v_n using errcode='CLR10';
    end if;
  end if;
  -- Nothing PUBLIC, on any of this file's own functions.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname like '%accrual%'
     and has_function_privilege('public', p.oid, 'execute');
  if v_n <> 0 then
    raise exception '#652 tail: PUBLIC holds EXECUTE on % accrual function(s)', v_n using errcode='CLR10';
  end if;

  -- 4 · THIS FILE RECUT NOTHING. The six plan-lane bodies §0 pinned must hash byte-identically —
  --     a stray `create or replace` of any of them reds the migration here instead of shipping.
  select coalesce(string_agg(x.sig, ',' order by x.sig), '(none)') into v_names
    from w652_plan_pin x
    left join (select p.oid::regprocedure::text as sig,
                      encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as digest
                 from pg_proc p) live on live.sig = x.sig
   where live.digest is distinct from x.digest;
  if v_names <> '(none)' then
    raise exception '#652 tail: this file changed plan-lane body(ies): %', v_names using errcode='CLR10';
  end if;
  -- …AND IT ALTERED NO FOREIGN TABLE. The count is compared against the one §0 MEASURED on this
  -- chain moments ago (`w652_foreign_pin`), never against a literal: a transcribed number asserts a
  -- property of every migration below this one, so an earlier file adding a constraint to that
  -- relation would red THIS migration with a message about #652 (review round 1, A4). This form
  -- asserts what it claims — that this file added nothing to it.
  if (select count(*)::int from pg_constraint where conrelid='clara.document_service_periods'::regclass)
     is distinct from (select constraints from w652_foreign_pin) then
    raise exception '#652 tail: clara.document_service_periods'' constraint set moved WHILE THIS FILE RAN (% -> %) -- this file adds none to it',
      (select constraints from w652_foreign_pin),
      (select count(*)::int from pg_constraint where conrelid='clara.document_service_periods'::regclass)
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara'
     and c.relname in ('accounting_plans','accounting_plan_revisions','accounting_plan_occurrences',
                       'periodic_adjustments','document_service_periods');
  if v_n <> 5 then
    raise exception '#652 tail: a relation this lane rides on is missing (found %)', v_n using errcode='CLR10';
  end if;

  -- 5 · THE DERIVED BASIS IS A BASIS `clara._assert_journal_basis` ACCEPTS, exercised on the
  --     catalog's own functions rather than believed. Two lines, exactly one positive side each,
  --     balanced, and the accrual amount on the expense leg.
  perform clara._assert_journal_basis(clara._accrual_journal_basis(
    '{"expense_account_code":"6100","liability_account_code":"2020","amount_cents":120000,
      "currency":"MYR","service_period_start":"2026-07-01","service_period_end":"2026-07-31",
      "term_source":"human_stated","method":{"rule":"stated_amount"},"instruction":"tail check"}'::jsonb,
    'tail check', date '2026-07-31'));
  if (clara._accrual_journal_basis(
        '{"expense_account_code":"6100","liability_account_code":"2020","amount_cents":120000,
          "currency":"MYR","service_period_start":"2026-07-01","service_period_end":"2026-07-31",
          "term_source":"human_stated","method":{"rule":"stated_amount"},"instruction":"x"}'::jsonb,
        'x', date '2026-07-31') -> 'lines' -> 0 ->> 'debit_cents') <> '120000' then
    raise exception '#652 tail: the derived basis does not debit the expense leg with the accrued amount'
      using errcode='CLR10';
  end if;
  -- …and the expense line says what is true of EVERY occurrence (THE SIXTH MEASUREMENT), not what
  -- is true only when the schedule reaches exactly one due date.
  if (clara._accrual_journal_basis(
        '{"expense_account_code":"6100","liability_account_code":"2020","amount_cents":120000,
          "currency":"MYR","service_period_start":"2026-07-01","service_period_end":"2026-09-30",
          "term_source":"human_stated","method":{"rule":"stated_amount"},"instruction":"x"}'::jsonb,
        'x', date '2026-07-31') -> 'lines' -> 0 ->> 'description')
     <> 'one period of the accrual term 2026-07-01 to 2026-09-30' then
    raise exception '#652 tail: the derived expense line claims this entry covers the whole stated term'
      using errcode='CLR10';
  end if;
  -- …and there is exactly ONE admitted selection rule, in the function AND in the CHECK.
  if array_length(clara._accrual_methods(), 1) <> 1
     or not ('stated_amount' = any (clara._accrual_methods())) then
    raise exception '#652 tail: the selection-rule set is not the single rule this slice performs'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accrual_adjustments'::regclass and contype='c'
                    and pg_get_constraintdef(oid) like '%stated_amount%'
                    and pg_get_constraintdef(oid) not like '%prior_period_amount%') then
    raise exception '#652 tail: the method CHECK does not admit exactly the rule the schedule performs'
      using errcode='CLR10';
  end if;
  -- …and the term/window wall is LIVE, exercised here rather than left to the battery.
  begin
    perform clara._assert_accrual_term_window(
      '{"service_period_start":"2026-07-01","service_period_end":"2026-07-31"}'::jsonb,
      date '2026-06-01', null);
    raise exception '#652 tail: an OPEN-ENDED authority under a closed term was ADMITTED'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if coalesce(v_detail,'') not like '%accrual_term_window_mismatch%' then
      raise exception '#652 tail: the window wall refused, but not as accrual_term_window_mismatch (detail %)', v_detail
        using errcode='CLR10';
    end if;
  end;
  begin
    perform clara._assert_accrual_term_window(
      '{"service_period_start":"2026-07-01","service_period_end":"2026-07-31"}'::jsonb,
      date '2026-06-01', date '2026-08-31');
    raise exception '#652 tail: a schedule reaching outside its own stated term was ADMITTED'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if coalesce(v_detail,'') not like '%accrual_term_window_mismatch%' then
      raise exception '#652 tail: the window wall refused, but not as accrual_term_window_mismatch (detail %)', v_detail
        using errcode='CLR10';
    end if;
  end;
  perform clara._assert_accrual_term_window(
    '{"service_period_start":"2026-07-01","service_period_end":"2026-09-30"}'::jsonb,
    date '2026-07-01', date '2026-09-30');
  -- …and so is the YIELD wall (THE SEVENTH MEASUREMENT): a half-month term whose month-end rule
  -- falls outside it is refused here, and the SAME term with a day rule that reaches inside it
  -- passes -- which is what makes this a wall rather than a ban.
  begin
    perform clara._assert_accrual_schedule_yields('monthly', 'last_day_of_month', null,
      date '2026-07-01', date '2026-07-15');
    raise exception '#652 tail: a schedule that reaches NO accrual date inside its own window was ADMITTED'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if coalesce(v_detail,'') not like '%accrual_schedule_yields_no_occurrence%' then
      raise exception '#652 tail: the yield wall refused, but not as accrual_schedule_yields_no_occurrence (detail %)', v_detail
        using errcode='CLR10';
    end if;
  end;
  perform clara._assert_accrual_schedule_yields('monthly', 'day_of_month', 15,
    date '2026-07-01', date '2026-07-15');
  perform clara._assert_accrual_schedule_yields('monthly', 'last_day_of_month', null,
    date '2026-07-01', date '2026-09-30');
  -- A schedule shape 0193's OWN validator owns falls through untouched rather than being re-spelled
  -- in this lane's vocabulary at the wrong control.
  perform clara._assert_accrual_schedule_yields('weekly', 'last_day_of_month', null,
    date '2026-07-01', date '2026-07-15');
  -- …and the term law is LIVE, exercised here rather than left to the battery: a period that is
  -- not a human's, and an accrual of zero, are each refused with the token this lane owns.
  begin
    perform clara._assert_accrual_particulars(
      '{"expense_account_code":"6100","liability_account_code":"2020","amount_cents":1,
        "currency":"MYR","service_period_start":"2026-07-01","service_period_end":"2026-07-31",
        "term_source":"extracted","method":{"rule":"stated_amount"},"instruction":"x"}'::jsonb);
    raise exception '#652 tail: an extracted term was ADMITTED -- 0140''s law is not enforced here'
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if coalesce(v_detail,'') not like '%silent_term%' then
      raise exception '#652 tail: a non-human term is refused, but not as silent_term (detail %)', v_detail
        using errcode='CLR10';
    end if;
  end;
  begin
    perform clara._assert_accrual_particulars(
      '{"expense_account_code":"6100","liability_account_code":"2020","amount_cents":0,
        "currency":"MYR","service_period_start":"2026-07-01","service_period_end":"2026-07-31",
        "term_source":"human_stated","method":{"rule":"stated_amount"},"instruction":"x"}'::jsonb);
    raise exception '#652 tail: an accrual of zero was ADMITTED' using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if coalesce(v_detail,'') not like '%accrual_zero_amount%' then
      raise exception '#652 tail: a zero accrual is refused, but not as accrual_zero_amount (detail %)', v_detail
        using errcode='CLR10';
    end if;
  end;

  raise notice '#652 tail: OK -- clara.accrual_adjustments is RLS-forced with no application ACL; the plan-revision FK carries (plan_id, revision, firm_id, client_id) and unique (plan_id, revision) makes the occurrence join single-valued; term_source is a one-member CHECK, method admits exactly the one rule this slice performs, the authority window is bracketed by the stated term, the schedule must reach an accrual date inside that window, and the derived line names one period of the term, and amount_cents is strictly positive; three triggers (append-only, no-truncate, term congruence); three human doors on clara_authenticated and the OBO door on clara_runtime alone, with no crossing and nothing PUBLIC; the six pinned 0193 bodies hash byte-identically to the digests taken before this file created anything, so NOTHING was recut; no foreign table was altered; and the derived accrual basis passes 0178''s own validator.';
end
$w652_tail$;
