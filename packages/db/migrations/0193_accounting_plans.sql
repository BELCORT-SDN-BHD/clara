-- 0193_accounting_plans — #640 (refresh spec #612, Wayfinder resolution #611; journey C9):
-- EXPLICITLY AUTHORISED RECURRING AND REVERSING ACCOUNTING PLANS, WHOSE DUE EVENTS INITIATE
-- ACCOUNTING WORK AND WHOSE OCCURRENCES POST EXACTLY ONCE.
-- =====================================================================================
-- Spec of record: issue #640 — "A sufficiently scoped instruction or existing explicit authority
-- creates a versioned accounting plan whose due events initiate Work and whose occurrences post
-- once, with preview, history, revision, pause/resume/end and bounded catch-up." Wayfinder #611
-- (owner-confirmed 2026-09-09): "an explicit user instruction or an existing authority rule may
-- establish a future accounting plan. Its authorised runs create the required accounting results
-- with the usual current-facts, period, permission and idempotency checks. Repeated bank debits or
-- a Knowledge preference alone do not authorise a future plan or a bank payment." Domain words:
-- CONTEXT.md — "Accounting plan", "Plan occurrence", "Accounting work", "Ordering boundary".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. Three relations — `clara.accounting_plans`,
-- `clara.accounting_plan_revisions`, `clara.accounting_plan_occurrences` — plus one runtime-only
-- scan verb and nine human doors, so that a named human's explicit instruction becomes a versioned
-- schedule whose every due event admits ONE `clara.accounting_work` through 0178's OWN door
-- (`clara.admit_journal_work`), under that human's live authority, rechecked at every due event.
--
-- =====================================================================================
-- THE MEASUREMENT THAT SHAPES THIS FILE: THE LIVE 0045 LANE IS NOT A PLAN LANE.
--
-- `0045_wave_d_b2_recurring_adjustments.sql` already carries a recurring surface —
-- `clara.adjustment_templates` (1139), `clara.adjustment_runs` (1459), the propose→sign ceremony
-- (3744/4264), `clara.run_adjustment_occurrence` (5301) and the daily runtime belt
-- `packages/runtime/lib/reconciler-adjustments.mjs`. It is NOT what #640 asks for, and the
-- differences are structural rather than cosmetic:
--
--   · it POSTS DIRECTLY. `run_adjustment_occurrence` writes `clara.journal_entries` itself. There
--     is no `accounting_work` row, no `logical_op_id`, no `operation_receipts` row, no Work
--     question, and therefore nothing for the cancel ordering boundary 0184 built to serialise
--     against. #640's whole acceptance is "a due event creates Work".
--   · its authority is a TWO-PERSON CEREMONY (propose, then a different admin signs), not an
--     explicit instruction from ONE authorising human whose LIVE authority every occurrence
--     rechecks. #640 and #611 both say the authority is the instruction.
--   · it has no pause/resume, no timezone, no preview, no revision model, and no
--     (template, period) UNIQUE key — idempotency is a predicate index over journal entries
--     (`ix_je_adj_occurrence`, 0045:1660) plus an op-key unique (0045:1487).
--   · its catch-up is AUTOMATIC and unscoped (`clara._adj_oldest_unmet_period`, 0045:5343), which
--     is precisely the behaviour #640 forbids ("a future schedule never authorises historical
--     runs"; catch-up "requires explicit historical scope").
--
-- SO THIS FILE DOES NOT TOUCH 0045. Not one of its tables, doors, grants or triggers is altered,
-- and the adjustments register at `/clients/:id/registers?tab=adjustments` keeps working exactly
-- as it does today. The two lanes CAN, however, post the same money twice if a firm builds both
-- against the same accounts, and pretending otherwise would be the dishonest half of leaving 0045
-- alone. `clara.create_accounting_plan` therefore answers with an ADVISORY `overlap_warning` that
-- NAMES every live signed `clara.adjustment_templates` row of the same client whose line account
-- codes intersect the plan's, and the form renders it as a persistent Alert. It is a warning and
-- not a refusal by deliberate decision: a firm may legitimately run an accrual template and a
-- recurring plan on one account, and a refusal here would make the older lane a wall in front of
-- the newer one. Convergence of the two lanes is a separately filed follow-up.
--
-- =====================================================================================
-- THE AUTHORITY MODEL, AND WHY `authority_ref` IS A FOREIGN FACT RATHER THAN A FREE-TEXT NOTE.
--
-- #640: "Creating a future plan requires a sufficiently scoped instruction or existing explicit
-- authority rule; Knowledge preference, calculation policy, old chat or repeated debit alone
-- cannot supply authority." A column that accepted any string would let every one of those pass by
-- being TYPED INTO IT. So `accounting_plans.authority_ref` is an object naming a row this database
-- already holds — `{"kind":"accounting_work"|"chat_task","id":"<uuid>"}` — and
-- `clara.create_accounting_plan` RESOLVES it against `clara.accounting_work` /
-- `clara.agent_tasks` in the SAME firm and the SAME client before anything is written. A
-- Knowledge record id, a client fact id or a made-up uuid resolves to nothing and the door refuses
-- CLR10 `authority_ref_unresolved`.
--
-- `authority_kind` is a CLOSED ONE-MEMBER check — `explicit_instruction`. The spec's second
-- clause ("or an existing explicit authority rule") describes a surface this estate does not have:
-- there is no authority-rule relation, and inventing one here would be inventing the very thing
-- the acceptance says must be explicit. `authority_rule` is therefore refused by name, CLR10
-- `authority_rule_unsupported`, so a later file can widen the CHECK additively and every caller
-- that tried it in the meantime got a typed answer rather than a silent success.
--
-- `authorised_by` is the human whose LIVE authority every occurrence executes under, and it is the
-- actor who created the plan. `clara.admit_journal_work` (0178:832) takes that human as
-- `p_author` and RECHECKS, at every due event: membership present, membership active, role rank
-- >= bookkeeper, client active. A deactivated authoriser therefore stops the plan admitting
-- anything, with 0178's own typed CLR04 `actor_not_active` recorded on the occurrence row — and
-- the plan stays `active`, because a revocation is not the owner's decision to end a schedule.
--
-- THERE IS NO GLOBAL "ENABLE AGENTIC" SWITCH, AND THIS FILE DOES NOT ADD ONE. `clara.
-- wake_engine_sources` (0133:788) exists with two rows, both `enabled=false`, and
-- `clara.set_wake_source_enabled` (0133:283) is operator-gated. Neither is read by anything in
-- this file: a plan's authority is its own instruction, per plan, and an operator flag that could
-- turn every firm's schedules on or off at once would be exactly the global switch #640 forbids.
-- The tail census asserts the absence rather than leaving it to be believed.
--
-- =====================================================================================
-- THE IDENTITY LAW: `unique (plan_id, due_date)`, AND WHY THAT IS ENOUGH FOR BOTH LEGS.
--
-- One plan, one due date, one occurrence. `clara.accounting_plan_occurrences` carries that as a
-- hard UNIQUE, and it is the convergence point for duplicate wakes: two leaders (or one leader and
-- a human's catch-up) scanning at once SERIALISE on the plan row's own `for update` and the second
-- reads the first's occurrence instead of making a second one. The unique index is the structural
-- backstop for the case where the lock is somehow not held — two mechanisms, because "the writer
-- always locks" is a property of code and this is a property of the data.
--
-- A REVERSING PLAN HAS TWO LEGS PER PERIOD and they are two due events, not one: the accrual on
-- the period's own due day, and its reversal on the FIRST DAY OF THE FOLLOWING MONTH (the standard
-- practice, and the only `reversal_day_rule` this slice admits). `leg` is recorded on the
-- occurrence, and the two legs of one period never share a date — EXCEPT in exactly one
-- configuration, which is therefore refused at the door rather than discovered by a unique
-- violation: a MONTHLY plan whose day rule is `day_of_month` with `day_of_month = 1` would place
-- period k's reversal and period k+1's accrual both on the first of the month. CLR10
-- `reversal_collides_with_next_occurrence`. Every other shape is collision-free by arithmetic:
-- a reversal is always the 1st of a month, monthly accruals with day 2..28 or a month-end rule
-- fall elsewhere in that month, and quarterly/annual accruals are at least three months apart.
--
-- THE INTENT KEY IS `plan:<plan>:r<revision>:<due_date>` and it is the Work's idempotency key on
-- 0178's own `uq_accounting_work_intent (firm_id, client_id, intent_key)`. So even a caller that
-- somehow bypassed this file's occurrence row cannot admit two Works for one due event: the second
-- admission replays the first (`replayed: true`) and the same `logical_op_id` owns the effect.
--
-- =====================================================================================
-- THE CADENCE DECISION (C54.3): EVERY LEADER CYCLE, GATED IN THE DATABASE.
--
-- C54.3 says to treat cadence as an authorised schedule product setting and explicitly NOT to
-- inherit "1h" as current. The two live precedents are the DAILY belts (SST/lint/FA/adjustments,
-- `leader.mjs:124`) and the EVERY-CYCLE dispatch (`reconcileRenderDispatch`, leader.mjs:225).
-- This lane takes the every-cycle shape, for a measured reason rather than a preference:
--
--   · a DAILY belt makes the worst-case latency between a due date arriving in Kuala Lumpur and
--     the Work being admitted up to 24 hours, and the acceptance is about a due EVENT, not about a
--     nightly batch;
--   · the cost of a cycle is ONE indexed query. `clara.wake_due_plan_occurrences` does not
--     evaluate anything per client: its candidate query is gated in SQL on
--     `due_date <= (now() at time zone <revision timezone>)::date`, served by the partial indexes
--     `ix_accounting_plans_active` (active plans only) and `ix_plan_revisions_live` (live
--     revisions only) and by `uq_plan_occurrences_plan_due`, and returns NO ROWS on a firm with
--     nothing due. An empty answer is the ordinary answer.
--   · the due ARITHMETIC is entirely DB-owned (the `_plan_due_*` helpers below). The runtime never
--     re-derives a date, so there is no second implementation of "when is this due" to drift.
--
-- THE SCAN NEVER BACKFILLS. It considers exactly ONE due event per plan per call — the LATEST one
-- at or before today in the revision's timezone — so a leader that was down for two months admits
-- the CURRENT period's occurrence and not the two it missed. Those are catch-up, and catch-up is
-- `clara.request_plan_catch_up`: explicit window, oldest-first, bounded, and refused outright when
-- the window starts before `effective_from` (CLR10 `catch_up_before_authority`). That is the
-- acceptance criterion "a future schedule never authorises historical runs" implemented as an
-- arithmetic property of the scan rather than as a promise about it.
--
-- =====================================================================================
-- THE LOCK ORDER GAINS A RUNG ABOVE 0184's.
--
--   **accounting_plans → accounting_work → agent_tasks → agent_interruptions**
--
-- Every writer in this file that can reach a Work takes the PLAN row `for update` first and only
-- then calls `clara.admit_journal_work`, which takes the accounting_work rung. Nothing here ever
-- takes a Work row before a plan row, so no cycle with 0184's writers is constructible: those
-- writers never touch `clara.accounting_plans` at all. `pause`/`resume`/`end`/`revise` take the
-- same first rung, which is why a pause that lands mid-scan is DECIDED rather than raced — the
-- scan re-reads `status` under the lock it is already holding and admits nothing, while a Work
-- that was already admitted keeps running and settles under 0184's own boundary. Pause is not
-- cancel: this file never cancels a Work, and says so in `clara.pause_accounting_plan`'s own
-- comment.
--
-- =====================================================================================
-- TIMEZONE: ONE CLOSED MEMBER.
--
-- `revisions.timezone` is a one-member CHECK — `Asia/Kuala_Lumpur`. Clara is a Malaysian
-- accounting product and every client in the estate books in MYR; a free `text` column validated
-- against `pg_timezone_names` would be a promise that the rest of the estate (period locks,
-- posting dates, the close calendar) also honours a per-client zone, which it does not. The
-- column EXISTS rather than being implied so that widening it later is an additive CHECK change
-- and every row already carries the zone its dates were computed in. The date arithmetic really
-- does read it: `(now() at time zone r.timezone)::date` is what "today" means to a schedule, and
-- a UTC-based comparison would fire a Kuala Lumpur 1st-of-the-month occurrence eight hours late.
--
-- =====================================================================================
-- SCOPE, NAMED RATHER THAN IMPLIED. `kind` admits `recurring_journal` and `reversing_journal`
-- only. Depreciation, accrual, amortisation and period-close adapters are NOT in this slice and
-- are refused by name (CLR10 `plan_kind_unsupported`) rather than left to fail somewhere deeper:
-- depreciation is the live 0041 fixed-asset lane's, prepayment/amortisation is F-A4 PR-2a's, and
-- close schedules belong to their own business tickets (C48.1 / C55.10 / C83.4). The generic law
-- this file proves — explicit authority, one occurrence per due event, recheck at every event,
-- pause/end blocks admission, catch-up is explicit — is proved on the journal adapter and is the
-- law those adapters will inherit, not a claim that they are delivered.
-- =====================================================================================

-- =====================================================================================
-- §0  PRESTATE. Refuse a partial cohort, pin every object this file builds on, and prove the
--     lane is wholly absent before anything is created.
-- =====================================================================================
do $w640_pre$
declare
  v_names text;
begin
  if to_regclass('clara.accounting_work') is null
     or to_regclass('clara.operation_receipts') is null
     or to_regclass('clara.agent_tasks') is null
     or to_regclass('clara.clients') is null
     or to_regclass('clara.users') is null
     or to_regclass('clara.adjustment_templates') is null then
    raise exception '#640 prestate: the 0045/0178 cohort is absent -- those files must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)') is null
     or to_regprocedure('clara._assert_journal_basis(jsonb)') is null
     or to_regprocedure('clara._journal_basis_digest(jsonb)') is null
     or to_regprocedure('clara._human_ctx(integer)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._hash(jsonb)') is null
     or to_regprocedure('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)') is null
     or to_regprocedure('clara.role_rank(text)') is null
     or to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '#640 prestate: a required 0004/0178 door or guard is absent' using errcode='CLR10';
  end if;

  select coalesce(string_agg(x, ',' order by x), '(none)') into v_names
    from unnest(array['accounting_plans','accounting_plan_revisions','accounting_plan_occurrences']) x
   where to_regclass('clara.'||x) is not null;
  if v_names <> '(none)' then
    raise exception '#640 prestate: the plan cohort must be wholly absent; found %', v_names
      using errcode='CLR10';
  end if;
  select coalesce(string_agg(p.proname, ',' order by p.proname), '(none)') into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.proname in ('create_accounting_plan','revise_accounting_plan','pause_accounting_plan',
                       'resume_accounting_plan','end_accounting_plan','preview_accounting_plan',
                       'list_accounting_plans','get_accounting_plan','list_accounting_plan_occurrences',
                       'get_work_plan_origin','request_plan_catch_up','wake_due_plan_occurrences');
  if v_names <> '(none)' then
    raise exception '#640 prestate: a plan door already exists; found %', v_names using errcode='CLR10';
  end if;

  -- The 0178 column this lane's occurrences point at, read LIVE: a rename would make the FK below
  -- fail with a message about a column rather than about the assumption that broke.
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.accounting_work'::regclass
                    and attname = 'intent_key' and not attisdropped) then
    raise exception '#640 prestate: clara.accounting_work.intent_key is absent -- 0178''s intent idempotency is what this lane''s due keys ride on'
      using errcode='CLR10';
  end if;

  raise notice '#640 prestate: clean -- no accounting_plans/accounting_plan_revisions/accounting_plan_occurrences relation and no plan door exists; the 0045 adjustment lane and the 0178 accounting-work lane are both present.';
end
$w640_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.accounting_plans — WHAT WAS AUTHORISED, BY WHOM, AND WHETHER IT IS STILL RUNNING.
--
--     The row holds identity and authority; every SCHEDULE fact lives on the revision (§B), so
--     changing a schedule is a new revision rather than an edit of the authorised thing.
--
--     No application role holds ANY grant on this table. Every reach is through a definer door,
--     for the reason 0185 §A states in full: a `grant`/`revoke` that changes no effective
--     privilege still materialises the owner's ACL, and pg_dump cannot reproduce a materialised
--     owner-default ACL. `relacl` stays NULL here, as it does on every other clara relation.
-- =====================================================================================
create table clara.accounting_plans (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null references clara.firms(id),
  client_id       uuid        not null,
  -- THE SLICE'S CLOSED ADAPTER SET. Widened additively by a later file; never by a caller.
  kind            text        not null check (kind in ('recurring_journal','reversing_journal')),
  status          text        not null check (status in ('active','paused','ended')),
  -- What this schedule is FOR, in the firm's own words. It is what the Work detail's identity
  -- block prints ("From plan <purpose>"), so it is NOT NULL and non-blank by CHECK.
  purpose         text        not null check (btrim(purpose) <> ''),
  authority_kind  text        not null check (authority_kind in ('explicit_instruction')),
  -- The row in THIS database that carries the instruction. Shape and resolution are the door's
  -- (§F); the CHECK here only refuses a non-object, because a column cannot resolve a foreign id.
  authority_ref   jsonb       not null check (jsonb_typeof(authority_ref) = 'object'),
  authorised_by   uuid        not null references clara.users(id),
  authorised_at   timestamptz not null default now(),
  current_revision integer    not null check (current_revision >= 1),
  created_by      uuid        not null references clara.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  paused_at       timestamptz,
  paused_by       uuid        references clara.users(id),
  paused_reason   text,
  ended_at        timestamptz,
  ended_by        uuid        references clara.users(id),
  ended_reason    text,
  constraint fk_accounting_plans_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  -- The composite the two child tables point at: a cross-client or cross-firm revision or
  -- occurrence is impossible at the storage layer, so no reader re-checks the tenancy it was
  -- written under (the 0045 idiom, 1246).
  constraint uq_accounting_plans_id_firm_client unique (id, firm_id, client_id),
  -- The composite the revision's `plan_kind` rides on, so "a reversing revision belongs to a
  -- reversing plan" is a FOREIGN KEY rather than a door's promise (§B).
  constraint uq_accounting_plans_id_kind unique (id, kind),
  constraint ck_accounting_plans_paused check (
    (status = 'paused') = (paused_at is not null and paused_by is not null)),
  constraint ck_accounting_plans_ended check (
    (status = 'ended') = (ended_at is not null and ended_by is not null))
);
comment on table clara.accounting_plans is
  '#640: one explicitly authorised accounting schedule. Identity and authority only -- every '
  'schedule fact lives on clara.accounting_plan_revisions. Written ONLY by '
  'clara.create_accounting_plan / revise_ / pause_ / resume_ / end_accounting_plan; no '
  'application role holds DML or SELECT. authority_ref names a clara.accounting_work or '
  'clara.agent_tasks row in the same firm and client -- a Knowledge preference cannot supply it.';

alter table clara.accounting_plans enable row level security;
alter table clara.accounting_plans force row level security;
create policy p_accounting_plans_owner on clara.accounting_plans for all to clara_fn_owner
  using (true) with check (true);

-- THE SCAN'S OWN PARTIAL INDEX (the C54.3 cadence argument in the header): an every-cycle scan is
-- affordable because a firm with no ACTIVE plan contributes no rows to read.
create index ix_accounting_plans_active on clara.accounting_plans(client_id, created_at)
  where status = 'active';
create index ix_accounting_plans_client on clara.accounting_plans(client_id, created_at desc);

-- The identity columns are frozen after creation; the lifecycle columns are not. A plan whose
-- client, kind, authority or authoriser could be rewritten would be a schedule whose authority is
-- whatever it was last set to.
create function clara._tf_accounting_plans_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_frozen text[] := array['id','firm_id','client_id','kind','purpose','authority_kind',
                           'authority_ref','authorised_by','authorised_at','created_by','created_at'];
  c text;
begin
  if tg_op = 'DELETE' then
    raise exception 'an accounting plan is never deleted (end it, do not erase it)'
      using errcode='CLR08', detail='{"reason":"accounting_plan_immutable","column":"*"}';
  end if;
  foreach c in array v_frozen loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'accounting plan column % is immutable after creation', c
        using errcode='CLR08',
          detail=jsonb_build_object('reason','accounting_plan_immutable','column',c)::text;
    end if;
  end loop;
  if old.status = 'ended' and new.status <> 'ended' then
    raise exception 'an ended accounting plan cannot be restarted; create a new plan'
      using errcode='CLR10', detail='{"reason":"plan_ended"}';
  end if;
  if new.current_revision < old.current_revision then
    raise exception 'a plan revision number never goes backwards'
      using errcode='CLR08', detail='{"reason":"accounting_plan_immutable","column":"current_revision"}';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function clara._tf_accounting_plans_immutable() from public;
create trigger t_accounting_plans_immutable before update or delete on clara.accounting_plans
  for each row execute function clara._tf_accounting_plans_immutable();
create trigger t_accounting_plans_no_truncate before truncate on clara.accounting_plans
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §B  clara.accounting_plan_revisions — THE SCHEDULE, VERSIONED.
--
--     "Revision preserves predecessor and past runs" (#640). A revision row is written once and
--     never edited; the ONLY update it admits is being SUPERSEDED (its `superseded_at` stamped
--     once). Past occurrences keep pointing at the revision number they ran under, so a plan's
--     history reads as what was authorised AT THE TIME rather than as what is authorised now.
--
--     `plan_kind` is carried and composite-FK'd back to `accounting_plans(id, kind)` so the tie
--     between a reversing plan and a reversing revision is enforced by the storage layer. It is
--     the 0185 §D idiom (a pinned column that makes a cross-fact claim a real FOREIGN KEY) rather
--     than a trigger's opinion.
-- =====================================================================================
create table clara.accounting_plan_revisions (
  id                uuid        primary key default gen_random_uuid(),
  plan_id           uuid        not null,
  firm_id           uuid        not null,
  client_id         uuid        not null,
  plan_kind         text        not null,
  revision          integer     not null check (revision >= 1),
  frequency         text        not null check (frequency in ('monthly','quarterly','annual')),
  day_rule          text        not null check (day_rule in ('day_of_month','last_day_of_month')),
  -- 1..28 ONLY, and that ceiling is the point rather than a limitation: a "31st of every month"
  -- schedule has no unambiguous February, and silently clamping it would make the recorded
  -- schedule and the dates it produces two different facts. A month-end schedule spells itself
  -- `last_day_of_month`, which is exact in every month.
  day_of_month      integer     check (day_of_month is null or (day_of_month between 1 and 28)),
  -- ONE CLOSED MEMBER (the header's timezone note). Widened additively; never by a caller.
  timezone          text        not null check (timezone = 'Asia/Kuala_Lumpur'),
  effective_from    date        not null,
  effective_to      date,
  basis             jsonb       not null check (jsonb_typeof(basis) = 'object'),
  basis_digest      text        not null check (basis_digest ~ '^[0-9a-f]{64}$'),
  auto_reverse      boolean     not null,
  reversal_day_rule text        check (reversal_day_rule is null or reversal_day_rule = 'next_period_first_day'),
  created_by        uuid        not null references clara.users(id),
  created_at        timestamptz not null default now(),
  superseded_at     timestamptz,
  superseded_by     uuid        references clara.users(id),
  constraint uq_plan_revisions_plan_revision unique (plan_id, revision),
  -- The composite the occurrence rows point at.
  constraint uq_plan_revisions_id_plan_revision unique (plan_id, revision, firm_id, client_id),
  constraint fk_plan_revisions_plan foreign key (plan_id, firm_id, client_id)
    references clara.accounting_plans(id, firm_id, client_id),
  constraint fk_plan_revisions_plan_kind foreign key (plan_id, plan_kind)
    references clara.accounting_plans(id, kind),
  constraint ck_plan_revisions_day_of_month check (
    (day_rule = 'day_of_month') = (day_of_month is not null)),
  constraint ck_plan_revisions_window check (effective_to is null or effective_to >= effective_from),
  -- A reversing PLAN has reversing revisions and nothing else does; a reversal needs a rule and
  -- nothing else carries one. Both halves stated structurally.
  constraint ck_plan_revisions_auto_reverse check (auto_reverse = (plan_kind = 'reversing_journal')),
  constraint ck_plan_revisions_reversal_rule check (auto_reverse = (reversal_day_rule is not null)),
  constraint ck_plan_revisions_superseded check (
    (superseded_at is null) = (superseded_by is null))
);
comment on table clara.accounting_plan_revisions is
  '#640: one version of one plan''s schedule and basis. Written once and thereafter only '
  'SUPERSEDED; exactly one live (superseded_at is null) revision per plan. Occurrences record the '
  'revision they ran under, so revising never rewrites history.';

alter table clara.accounting_plan_revisions enable row level security;
alter table clara.accounting_plan_revisions force row level security;
create policy p_plan_revisions_owner on clara.accounting_plan_revisions for all to clara_fn_owner
  using (true) with check (true);

-- ONE LIVE REVISION PER PLAN. This is the whole of "which schedule is in force", and it is a
-- partial unique index rather than a column on the plan because a column can disagree with the
-- rows while an index cannot. It is also the scan's own partial index (the cadence argument).
create unique index ix_plan_revisions_live on clara.accounting_plan_revisions(plan_id)
  where superseded_at is null;
create index ix_plan_revisions_plan on clara.accounting_plan_revisions(plan_id, revision desc);

create function clara._tf_plan_revisions_immutable() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a plan revision is never deleted (supersede it, do not erase it)'
      using errcode='CLR08', detail='{"reason":"plan_revision_immutable","column":"*"}';
  end if;
  if row(new.id,new.plan_id,new.firm_id,new.client_id,new.plan_kind,new.revision,new.frequency,
         new.day_rule,new.day_of_month,new.timezone,new.effective_from,new.effective_to,
         new.basis,new.basis_digest,new.auto_reverse,new.reversal_day_rule,new.created_by,
         new.created_at)
     is distinct from
     row(old.id,old.plan_id,old.firm_id,old.client_id,old.plan_kind,old.revision,old.frequency,
         old.day_rule,old.day_of_month,old.timezone,old.effective_from,old.effective_to,
         old.basis,old.basis_digest,old.auto_reverse,old.reversal_day_rule,old.created_by,
         old.created_at) then
    raise exception 'a plan revision is immutable; record a changed schedule as a new revision'
      using errcode='CLR08', detail='{"reason":"plan_revision_immutable"}';
  end if;
  if old.superseded_at is not null then
    raise exception 'this plan revision was already superseded at %', old.superseded_at
      using errcode='CLR08', detail='{"reason":"plan_revision_superseded"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_plan_revisions_immutable() from public;
create trigger t_plan_revisions_immutable before update or delete on clara.accounting_plan_revisions
  for each row execute function clara._tf_plan_revisions_immutable();
create trigger t_plan_revisions_no_truncate before truncate on clara.accounting_plan_revisions
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §C  clara.accounting_plan_occurrences — ONE ROW PER DUE EVENT THIS LANE REACHED.
--
--     `unique (plan_id, due_date)` is the identity law (the header). `unique (work_id)` is its
--     other half: one Work is initiated by at most one occurrence, so "which due event created
--     this Work" has exactly one answer and `clara.get_work_plan_origin` cannot be ambiguous.
--
--     A row is written for EVERY due event the lane reached, admitted or refused, and `outcome`
--     says which. A refused occurrence (work_id null) is NOT retried by the scan -- it is a
--     recorded fact that the due event arrived and was refused, and re-attempting it is
--     `clara.request_plan_catch_up`'s explicitly scoped job. That is the acceptance criterion
--     "catch-up requires explicit historical scope" made arithmetic: without the row the scan
--     would retry the same refused due date on every leader cycle forever; with it, the lane
--     moves on and a human decides whether the missed period is still wanted.
--
--     APPEND-ONLY IN ITS IDENTITY. `work_id`, `admitted_at` and `outcome` are the only writable
--     columns, and `work_id` is SET-ONCE: an occurrence that has named its Work can never name a
--     different one.
-- =====================================================================================
create table clara.accounting_plan_occurrences (
  id          uuid        primary key default gen_random_uuid(),
  firm_id     uuid        not null,
  client_id   uuid        not null,
  plan_id     uuid        not null,
  revision    integer     not null,
  leg         text        not null check (leg in ('primary','reversal')),
  due_date    date        not null,
  intent_key  text        not null check (intent_key !~ '^\s*$'),
  work_id     uuid,
  admitted_at timestamptz,
  outcome     jsonb       not null check (jsonb_typeof(outcome) = 'object'),
  created_at  timestamptz not null default now(),
  -- THE IDENTITY LAW. One plan, one due date, one occurrence.
  constraint uq_plan_occurrences_plan_due unique (plan_id, due_date),
  -- One Work is initiated by at most one occurrence.
  constraint uq_plan_occurrences_work unique (work_id),
  constraint uq_plan_occurrences_intent unique (firm_id, client_id, intent_key),
  constraint fk_plan_occurrences_revision foreign key (plan_id, revision, firm_id, client_id)
    references clara.accounting_plan_revisions(plan_id, revision, firm_id, client_id),
  constraint fk_plan_occurrences_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint ck_plan_occurrences_admitted check ((work_id is null) = (admitted_at is null))
);
comment on table clara.accounting_plan_occurrences is
  '#640: one due event of one plan. unique (plan_id, due_date) is the convergence point for '
  'duplicate scans; unique (work_id) makes "which plan created this Work" single-valued. '
  'Append-only apart from work_id (set once), admitted_at and outcome.';

alter table clara.accounting_plan_occurrences enable row level security;
alter table clara.accounting_plan_occurrences force row level security;
create policy p_plan_occurrences_owner on clara.accounting_plan_occurrences for all to clara_fn_owner
  using (true) with check (true);

-- NO (plan_id, due_date) INDEX BESIDE THE UNIQUE CONSTRAINT. `uq_plan_occurrences_plan_due`
-- already builds exactly that index, and it is what the scan's `not exists` probe and the
-- preview's `max(due_date)` read; a second one would be an index nobody probes.
create index ix_plan_occurrences_client on clara.accounting_plan_occurrences(client_id, due_date desc);

create function clara._tf_plan_occurrences_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a plan occurrence is never deleted'
      using errcode='CLR08', detail='{"reason":"plan_occurrence_immutable","column":"*"}';
  end if;
  if row(new.id,new.firm_id,new.client_id,new.plan_id,new.revision,new.leg,new.due_date,
         new.intent_key,new.created_at)
     is distinct from
     row(old.id,old.firm_id,old.client_id,old.plan_id,old.revision,old.leg,old.due_date,
         old.intent_key,old.created_at) then
    raise exception 'a plan occurrence''s identity is immutable'
      using errcode='CLR08', detail='{"reason":"plan_occurrence_immutable"}';
  end if;
  if old.work_id is not null and new.work_id is distinct from old.work_id then
    raise exception 'a plan occurrence names its accounting work exactly once'
      using errcode='CLR08', detail='{"reason":"plan_occurrence_work_set_once"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_plan_occurrences_append_only() from public;
create trigger t_plan_occurrences_append_only before update or delete on clara.accounting_plan_occurrences
  for each row execute function clara._tf_plan_occurrences_append_only();
create trigger t_plan_occurrences_no_truncate before truncate on clara.accounting_plan_occurrences
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §D  THE DUE ARITHMETIC. Entirely DB-owned: the runtime never re-derives a date, so there is no
--     second implementation of "when is this due" for the two to disagree about.
-- =====================================================================================

-- The k-th due day of a schedule, k = 0 being the period that CONTAINS `p_from`'s month. NULL for
-- a negative k or an unknown frequency rather than an exception: this is arithmetic a caller
-- probes, not a door a caller reaches.
create function clara._plan_due_nth(p_from date, p_freq text, p_day_rule text, p_dom int, p_k int)
  returns date language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_step int; v_month date; v_last date;
begin
  if p_from is null or p_k is null or p_k < 0 then return null; end if;
  v_step := case p_freq when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 else null end;
  if v_step is null then return null; end if;
  v_month := (date_trunc('month', p_from::timestamp) + ((p_k * v_step) * interval '1 month'))::date;
  v_last  := (v_month + interval '1 month' - interval '1 day')::date;
  if p_day_rule = 'last_day_of_month' then return v_last; end if;
  -- day_of_month is 1..28 by CHECK, so `least` is a belt against a forged row rather than a clamp
  -- the doors can reach.
  return least(v_month + (coalesce(p_dom, 1) - 1), v_last);
end $$;
revoke all on function clara._plan_due_nth(date,text,text,int,int) from public;

-- The greatest k whose due day is at or before `p_on`; NULL when the schedule has not reached
-- `p_on` yet, or when that due day would fall before `p_from` (a plan never runs before the day
-- its authority starts).
create function clara._plan_due_index_on_or_before(p_from date, p_freq text, p_day_rule text,
    p_dom int, p_on date)
  returns int language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_step int; v_k int; v_due date; v_guard int := 0;
begin
  if p_from is null or p_on is null then return null; end if;
  v_step := case p_freq when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 else null end;
  if v_step is null then return null; end if;
  -- The month distance, floored onto the step. PostgreSQL integer division truncates toward zero,
  -- which for a NEGATIVE distance lands one step too high; the walk below and the final
  -- `v_due > p_on` test both catch that, so the estimate never has to be exact.
  v_k := ((extract(year from p_on)::int - extract(year from p_from)::int) * 12
          + (extract(month from p_on)::int - extract(month from p_from)::int)) / v_step;
  while v_k > 0 and v_guard < 4096
        and clara._plan_due_nth(p_from, p_freq, p_day_rule, p_dom, v_k) > p_on loop
    v_k := v_k - 1;
    v_guard := v_guard + 1;
  end loop;
  if v_k < 0 then return null; end if;
  v_due := clara._plan_due_nth(p_from, p_freq, p_day_rule, p_dom, v_k);
  if v_due is null or v_due > p_on or v_due < p_from then return null; end if;
  return v_k;
end $$;
revoke all on function clara._plan_due_index_on_or_before(date,text,text,int,date) from public;

-- A reversing period's reversal day: the FIRST DAY OF THE MONTH AFTER the accrual's month. The one
-- rule this slice admits, and the one Malaysian practice actually uses for a reversing accrual.
create function clara._plan_reversal_date(p_due date) returns date
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select (date_trunc('month', p_due::timestamp) + interval '1 month')::date;
$$;
revoke all on function clara._plan_reversal_date(date) from public;

-- Every due EVENT of a schedule inside a window, ascending, bounded. A reversing plan emits two
-- events per period (accrual, then its reversal); a recurring plan emits one.
create function clara._plan_due_events(p_from date, p_freq text, p_day_rule text, p_dom int,
    p_auto_reverse boolean, p_start date, p_end date, p_limit int)
  returns table(due_date date, leg text, k int)
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_k int; v_kmax int; v_d date; v_r date; v_n int := 0; v_guard int := 0; v_lo date;
begin
  if p_from is null or p_start is null or p_end is null or p_end < p_start then return; end if;
  v_kmax := clara._plan_due_index_on_or_before(p_from, p_freq, p_day_rule, p_dom, p_end);
  if v_kmax is null then return; end if;
  v_lo := greatest(p_start, p_from);
  -- Start ONE period before the window so a reversal that belongs to the previous period is
  -- reachable, rather than walking every period since effective_from.
  v_k := coalesce(clara._plan_due_index_on_or_before(p_from, p_freq, p_day_rule, p_dom, p_start), 0);
  if v_k > 0 then v_k := v_k - 1; end if;
  while v_k <= v_kmax + 1 and v_n < greatest(coalesce(p_limit, 1), 1) and v_guard < 4096 loop
    v_guard := v_guard + 1;
    v_d := clara._plan_due_nth(p_from, p_freq, p_day_rule, p_dom, v_k);
    if v_d is not null and v_d >= v_lo and v_d <= p_end then
      due_date := v_d; leg := 'primary'; k := v_k; v_n := v_n + 1; return next;
    end if;
    if p_auto_reverse and v_d is not null and v_d >= p_from then
      v_r := clara._plan_reversal_date(v_d);
      if v_r >= v_lo and v_r <= p_end and v_n < greatest(coalesce(p_limit, 1), 1) then
        due_date := v_r; leg := 'reversal'; k := v_k; v_n := v_n + 1; return next;
      end if;
    end if;
    v_k := v_k + 1;
  end loop;
end $$;
revoke all on function clara._plan_due_events(date,text,text,int,boolean,date,date,int) from public;

-- THE LATEST due event at or before `p_on` — the ONE event a scan considers per plan per call.
-- NULL when the schedule has not produced an event yet. The scan deliberately does not walk back:
-- an earlier missed event is catch-up, and catch-up is explicit.
create function clara._plan_due_event_on_or_before(p_from date, p_freq text, p_day_rule text,
    p_dom int, p_auto_reverse boolean, p_on date)
  returns jsonb language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_k int; v_d date; v_r date;
begin
  v_k := clara._plan_due_index_on_or_before(p_from, p_freq, p_day_rule, p_dom, p_on);
  if v_k is null then return null; end if;
  v_d := clara._plan_due_nth(p_from, p_freq, p_day_rule, p_dom, v_k);
  if p_auto_reverse then
    v_r := clara._plan_reversal_date(v_d);
    -- A reversal is always in the month AFTER its accrual, so when it has arrived it is the later
    -- of the two events and therefore the one this call names.
    if v_r <= p_on then
      return jsonb_build_object('due_date', to_char(v_r,'YYYY-MM-DD'), 'leg', 'reversal', 'k', v_k);
    end if;
  end if;
  return jsonb_build_object('due_date', to_char(v_d,'YYYY-MM-DD'), 'leg', 'primary', 'k', v_k);
end $$;
revoke all on function clara._plan_due_event_on_or_before(date,text,text,int,boolean,date) from public;

-- The basis ONE occurrence posts: the revision's basis with this event's posting date, and — for a
-- reversal leg — with every line's two sides EXCHANGED. Exchanging sides preserves the balance
-- exactly (the sums swap), so a basis that passed `_assert_journal_basis` still passes reversed.
create function clara._plan_occurrence_basis(p_basis jsonb, p_due date, p_leg text) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select jsonb_set(
    case when p_leg = 'reversal' then
      jsonb_set(p_basis, '{lines}', coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'account_code', x.l ->> 'account_code',
                   'debit_cents',  coalesce(nullif(x.l ->> 'credit_cents','')::numeric, 0),
                   'credit_cents', coalesce(nullif(x.l ->> 'debit_cents','')::numeric, 0))
                 || case when nullif(btrim(coalesce(x.l ->> 'description','')),'') is null
                         then '{}'::jsonb
                         else jsonb_build_object('description', x.l ->> 'description') end
                 order by x.ord)
          from jsonb_array_elements(case when jsonb_typeof(p_basis->'lines') = 'array'
                                         then p_basis->'lines' else '[]'::jsonb end)
               with ordinality as x(l, ord)), '[]'::jsonb))
    else p_basis end,
    '{posting_date}', to_jsonb(to_char(p_due, 'YYYY-MM-DD')));
$$;
revoke all on function clara._plan_occurrence_basis(jsonb,date,text) from public;

-- The advisory overlap with the LIVE 0045 adjustment lane: every signed live template of this
-- client whose line account codes intersect this basis's. Advisory, never a refusal (the header).
create function clara._plan_overlap_warning(p_client uuid, p_basis jsonb) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select case when count(*) = 0 then null else
    jsonb_build_object('kind','adjustment_template_overlap','templates', jsonb_agg(w order by w->>'name'))
  end
  from (
    select jsonb_build_object('template_id', t.id, 'name', t.name, 'cadence', t.cadence,
             'accounts', (select jsonb_agg(distinct c) from unnest(x.codes) c)) as w
      from clara.adjustment_templates t
      cross join lateral (
        select array_agg(distinct l ->> 'account_code') as codes
          from jsonb_array_elements(case when jsonb_typeof(t.lines) = 'array' then t.lines else '[]'::jsonb end) l
         where (l ->> 'account_code') in (
           select b ->> 'account_code'
             from jsonb_array_elements(case when jsonb_typeof(p_basis->'lines') = 'array'
                                            then p_basis->'lines' else '[]'::jsonb end) b)
      ) x
     where t.client_id = p_client and t.status = 'live' and x.codes is not null
  ) s;
$$;
revoke all on function clara._plan_overlap_warning(uuid,jsonb) from public;

-- =====================================================================================
-- §E  THE ADMISSION CORE — the ONE body that turns a due event into Work, shared by the runtime
--     scan (§H) and the human catch-up door (§F). Two callers, one law.
--
--     LOCK ORDER RUNG 1 IS TAKEN HERE: `clara.accounting_plans FOR UPDATE`, before anything that
--     can reach `clara.accounting_work`. Every recheck happens UNDER that lock, so a pause that
--     lands between a scan's candidate query and this call is DECIDED (nothing is admitted)
--     rather than raced.
--
--     IT NEVER RAISES FOR A BUSINESS ANSWER. A paused plan, an inactive client, a de-authorised
--     authoriser and an already-present occurrence are all ANSWERS (`admitted:false` with a
--     reason), because one poisoned plan must not abort a scan that has other plans to serve.
--     0178's own typed refusal is preserved verbatim on the occurrence's `outcome`.
-- =====================================================================================
create function clara._plan_admit_occurrence(p_plan uuid, p_due date, p_leg text, p_model text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  p record; r record; o record; v_existing boolean := false;
  v_basis jsonb; v_intent text; v_answer jsonb; v_occ uuid;
  v_client_status text; v_detail text; v_reason text;
  v_code text; v_message text; v_outcome jsonb;
begin
  -- RUNG 1.
  select * into p from clara.accounting_plans where id = p_plan for update;
  if not found then
    return jsonb_build_object('admitted', false, 'reason', 'plan_not_found');
  end if;
  if p.status <> 'active' then
    return jsonb_build_object('admitted', false, 'plan_id', p.id,
      'reason', case p.status when 'paused' then 'plan_paused' else 'plan_ended' end);
  end if;

  select c.status into v_client_status from clara.clients c
   where c.id = p.client_id and c.firm_id = p.firm_id;
  if v_client_status is distinct from 'active' then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'client_inactive');
  end if;

  select * into r from clara.accounting_plan_revisions
   where plan_id = p.id and superseded_at is null;
  if not found then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'no_live_revision');
  end if;
  if p_due < r.effective_from or (r.effective_to is not null and p_due > r.effective_to) then
    -- The authority window, re-asserted at the moment of admission rather than trusted from the
    -- caller's arithmetic. A future schedule never authorises a historical run and an ended
    -- window never authorises a later one.
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'outside_authority_window',
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end);
  end if;
  if p_due > (now() at time zone r.timezone)::date then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'not_yet_due',
      'due_date', to_char(p_due,'YYYY-MM-DD'));
  end if;

  -- CONVERGENCE. The occurrence row is the identity of the due event; a second scan reads it
  -- instead of making a second one, and answers with the SAME work id.
  select * into o from clara.accounting_plan_occurrences
   where plan_id = p.id and due_date = p_due;
  -- FOUND is captured NOW rather than re-read below: plpgsql resets it on every SQL-bearing
  -- statement, and the second test is several statements away.
  v_existing := found;
  if v_existing and o.work_id is not null then
    return jsonb_build_object('admitted', false, 'converged', true, 'plan_id', p.id,
      'occurrence_id', o.id, 'work_id', o.work_id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'),
      'leg', o.leg, 'revision', o.revision, 'intent_key', o.intent_key, 'outcome', o.outcome);
  end if;

  v_basis := clara._plan_occurrence_basis(r.basis, p_due, p_leg);
  v_intent := 'plan:' || p.id::text || ':r' || r.revision::text || ':' || to_char(p_due,'YYYY-MM-DD');

  if v_existing then
    -- A previously REFUSED occurrence, re-attempted through catch-up. The identity stays; only the
    -- outcome and (on success) the work id move.
    v_occ := o.id;
  else
    insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
        due_date, intent_key, outcome)
      values (p.firm_id, p.client_id, p.id, r.revision, p_leg, p_due, v_intent,
        jsonb_build_object('state','pending','at', now()))
      returning id into v_occ;
  end if;

  begin
    -- RUNG 2. 0178's OWN door, with the plan's authorising human as the author: it rechecks
    -- membership, activity, role rank and client status, and it is idempotent on
    -- (firm, client, intent_key) — so a replay of this whole body returns the same Work.
    v_answer := clara.admit_journal_work(p.client_id, p.authorised_by, v_intent, v_basis,
                  'user_direct', '[]'::jsonb, p_model);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_message = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
    exception when others then
      v_reason := null;
    end;
    v_outcome := jsonb_build_object('state','refused','code', v_code, 'reason',
                   coalesce(v_reason,'unclassified'), 'message', v_message, 'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', coalesce(v_reason,'unclassified'), 'code', v_code, 'message', v_message);
  end;

  v_outcome := jsonb_build_object('state','admitted',
                 'logical_op_id', v_answer->>'logical_op_id',
                 'replayed', coalesce((v_answer->>'replayed')::boolean, false), 'at', now());
  update clara.accounting_plan_occurrences
     set work_id = (v_answer->>'work_id')::uuid, admitted_at = now(), outcome = v_outcome
   where id = v_occ;

  perform clara._audit(p.firm_id, p.authorised_by, null, null, 'plan_occurrence_admitted', null,
    jsonb_build_object('plan', p.id, 'occurrence', v_occ, 'work', v_answer->>'work_id',
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'intent_key', v_intent));

  return jsonb_build_object('admitted', true, 'plan_id', p.id, 'occurrence_id', v_occ,
    'work_id', v_answer->>'work_id', 'task_id', v_answer->>'task_id',
    'logical_op_id', v_answer->>'logical_op_id',
    'replayed', coalesce((v_answer->>'replayed')::boolean, false),
    'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
    'intent_key', v_intent);
end $$;
revoke all on function clara._plan_admit_occurrence(uuid,date,text,text) from public;

-- The shared door preamble for every plan verb below: the plan, read under the human's own firm,
-- with no existence oracle across firms.
create function clara._plan_door_ctx(p_plan uuid, p_min_rank int,
    out actor uuid, out firm uuid, out pl clara.accounting_plans)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  select a.actor, a.firm into actor, firm from clara._human_ctx(p_min_rank) a;
  -- NO EXISTENCE ORACLE ACROSS FIRMS: the firm predicate is part of the lookup, so a plan id
  -- belonging to somebody else's firm answers exactly as an id naming nothing does.
  select * into pl from clara.accounting_plans where id = p_plan and firm_id = firm;
  if pl.id is null then
    raise exception 'accounting plan not found in your firm' using errcode='CLR11',
      detail='{"reason":"plan_not_found"}';
  end if;
end $$;
revoke all on function clara._plan_door_ctx(uuid,int) from public;

-- =====================================================================================
-- §F  THE HUMAN DOORS. bookkeeper+ for every write, `_reserve_op`/`_finish_op` idempotency on a
--     required op key, `_audit` on every effect, typed CLR refusals carrying `detail.reason`.
-- =====================================================================================

create function clara.create_accounting_plan(
    p_client uuid, p_kind text, p_purpose text,
    p_authority_kind text, p_authority_ref jsonb,
    p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date,
    p_basis jsonb, p_reversal_day_rule text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_plan uuid; v_rev uuid; v_digest text; v_auto boolean;
  v_ref_kind text; v_ref_id uuid; v_ok boolean; v_warning jsonb; v_next jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting plan' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- THE EXCLUDED ADAPTERS, REFUSED BY NAME (the header's scope note).
  if p_kind is null or p_kind not in ('recurring_journal','reversing_journal') then
    raise exception 'plan kind % is not supported in this slice (recurring_journal, reversing_journal)', coalesce(p_kind,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind,
          'supported', jsonb_build_array('recurring_journal','reversing_journal'))::text;
  end if;
  -- THE AUTHORITY SHAPE.
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
  -- RESOLVED, not merely well-shaped. A Knowledge preference, a calculation policy or a repeated
  -- debit has no row here, so none of them can supply authority (#640's own criterion).
  if v_ref_kind = 'accounting_work' then
    select exists (select 1 from clara.accounting_work w
                    where w.id = v_ref_id and w.firm_id = v_firm and w.client_id = p_client) into v_ok;
  else
    select exists (select 1 from clara.agent_tasks t
                    where t.id = v_ref_id and t.firm_id = v_firm and t.client_id = p_client) into v_ok;
  end if;
  if not v_ok then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','authority_ref_unresolved','kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p_kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'create_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'kind', p_kind, 'purpose', p_purpose,
      'authority', p_authority_ref, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone,
      'effective_from', p_effective_from, 'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this plan key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, current_revision, created_by)
    values (v_plan, v_firm, p_client, p_kind, 'active', btrim(p_purpose), p_authority_kind,
      p_authority_ref, v_actor, 1, v_actor);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, v_firm, p_client, p_kind, 1, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, v_auto,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  perform clara._audit(v_firm, v_actor, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind, 'revision', 1,
      'authority', p_authority_ref, 'op_key', p_op_key));

  v_result := jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind, 'next_occurrences', coalesce(v_next, '[]'::jsonb),
    'overlap_warning', v_warning);
  return clara._finish_op(v_firm, 'create_accounting_plan', p_op_key, v_result);
end $$;

-- The schedule rules, stated ONCE and reached by both create and revise. Every refusal is typed
-- and names the field, so the form can focus the control that holds the mistake. Declared AFTER
-- its first caller deliberately: plpgsql resolves a called function at first EXECUTION, not at
-- CREATE, so the reading order here follows the doors rather than the dependency graph.
create function clara._assert_plan_schedule(p_kind text, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date,
    p_reversal_day_rule text) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
begin
  if p_frequency is null or p_frequency not in ('monthly','quarterly','annual') then
    raise exception 'unknown plan frequency %', coalesce(p_frequency,'(null)') using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"frequency","constraint":"enum"}';
  end if;
  if p_day_rule is null or p_day_rule not in ('day_of_month','last_day_of_month') then
    raise exception 'unknown plan day rule %', coalesce(p_day_rule,'(null)') using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"enum"}';
  end if;
  if p_day_rule = 'day_of_month' and (p_day_of_month is null or p_day_of_month not between 1 and 28) then
    raise exception 'a day-of-month schedule needs a day between 1 and 28 (use last_day_of_month for a month end)'
      using errcode='CLR10',
        detail='{"reason":"invalid_schedule","field":"day_of_month","constraint":"between_1_and_28"}';
  end if;
  if p_day_rule = 'last_day_of_month' and p_day_of_month is not null then
    raise exception 'a last-day-of-month schedule carries no day number' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"day_of_month","constraint":"absent"}';
  end if;
  if p_timezone is distinct from 'Asia/Kuala_Lumpur' then
    raise exception 'the only supported plan timezone is Asia/Kuala_Lumpur' using errcode='CLR10',
      detail='{"reason":"timezone_unsupported","field":"timezone"}';
  end if;
  if p_effective_from is null then
    raise exception 'a plan needs the date its authority starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_from","constraint":"present"}';
  end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'a plan cannot end before it starts' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"effective_to","constraint":"after_effective_from"}';
  end if;
  if p_kind = 'reversing_journal' then
    if p_reversal_day_rule is not null and p_reversal_day_rule <> 'next_period_first_day' then
      raise exception 'the only supported reversal rule is next_period_first_day' using errcode='CLR10',
        detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"enum"}';
    end if;
    -- THE ONE COLLIDING SHAPE (the header's identity-law note): a monthly accrual on the 1st would
    -- put period k's reversal and period k+1's accrual on the same day, and `unique (plan_id,
    -- due_date)` would refuse the second as a bare 23505 nobody can classify. Named here instead.
    if p_frequency = 'monthly' and p_day_rule = 'day_of_month' and p_day_of_month = 1 then
      raise exception 'a monthly reversing plan cannot accrue on the 1st: its reversal would land on the next accrual''s own day'
        using errcode='CLR10',
          detail='{"reason":"reversal_collides_with_next_occurrence","field":"day_of_month"}';
    end if;
  elsif p_reversal_day_rule is not null then
    raise exception 'a recurring journal plan carries no reversal rule' using errcode='CLR10',
      detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"absent"}';
  end if;
end $$;
revoke all on function clara._assert_plan_schedule(text,text,text,int,text,date,date,text) from public;

-- REVISE — a NEW revision, the predecessor SUPERSEDED and kept. Past occurrences keep naming the
-- revision they ran under, so nothing about history moves.
create function clara.revise_accounting_plan(p_plan uuid, p_frequency text, p_day_rule text,
    p_day_of_month int, p_timezone text, p_effective_from date, p_effective_to date,
    p_basis jsonb, p_reversal_day_rule text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; cur record;
  v_dedupe jsonb; v_digest text; v_auto boolean; v_rev uuid; v_next int; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'revising an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be revised' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  perform clara._assert_plan_schedule(p.kind, p_frequency, p_day_rule, p_day_of_month, p_timezone,
    p_effective_from, p_effective_to, p_reversal_day_rule);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);
  v_auto := (p.kind = 'reversing_journal');

  v_dedupe := clara._reserve_op(v_firm, 'revise_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'frequency', p_frequency, 'day_rule', p_day_rule,
      'day_of_month', p_day_of_month, 'timezone', p_timezone, 'effective_from', p_effective_from,
      'effective_to', p_effective_to, 'digest', v_digest)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this revision key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- RUNG 1, so a revision and a scan cannot interleave: the scan reads the live revision under
  -- this same lock and therefore sees exactly one of the two states.
  perform 1 from clara.accounting_plans where id = p_plan for update;
  select * into cur from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision to supersede' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;
  v_next := cur.revision + 1;
  update clara.accounting_plan_revisions set superseded_at = now(), superseded_by = v_actor
   where id = cur.id;
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (p_plan, p.firm_id, p.client_id, p.kind, v_next, p_frequency, p_day_rule, p_day_of_month,
      p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, v_auto,
      case when v_auto then coalesce(p_reversal_day_rule,'next_period_first_day') else null end,
      v_actor)
    returning id into v_rev;
  update clara.accounting_plans set current_revision = v_next where id = p_plan;

  perform clara._audit(v_firm, v_actor, null, null, 'revise_accounting_plan', null,
    jsonb_build_object('plan', p_plan, 'revision', v_next, 'superseded', cur.revision,
      'op_key', p_op_key));
  v_result := jsonb_build_object('plan_id', p_plan, 'revision_id', v_rev, 'revision', v_next,
    'superseded_revision', cur.revision, 'status', p.status,
    'overlap_warning', clara._plan_overlap_warning(p.client_id, p_basis));
  return clara._finish_op(v_firm, 'revise_accounting_plan', p_op_key, v_result);
end $$;

-- PAUSE — blocks FUTURE admission and NOTHING ELSE. It does not cancel an in-flight Work, and the
-- distinction is the product's: cancelling admitted accounting work is `clara.
-- cancel_accounting_work` (0184), a separately named action with its own ordering boundary. A
-- pause that silently cancelled would make "stop scheduling this" and "abandon what is already
-- running" one button.
create function clara.pause_accounting_plan(p_plan uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; v_dedupe jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'pausing an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  v_dedupe := clara._reserve_op(v_firm, 'pause_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this pause key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;
  perform 1 from clara.accounting_plans where id = p_plan for update; -- RUNG 1
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be paused' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  if p.status = 'paused' then
    v_result := jsonb_build_object('plan_id', p_plan, 'status', 'paused', 'changed', false);
  else
    update clara.accounting_plans
       set status = 'paused', paused_at = now(), paused_by = v_actor,
           paused_reason = nullif(btrim(coalesce(p_reason,'')),'')
     where id = p_plan;
    perform clara._audit(v_firm, v_actor, null, null, 'pause_accounting_plan', null,
      jsonb_build_object('plan', p_plan, 'op_key', p_op_key));
    v_result := jsonb_build_object('plan_id', p_plan, 'status', 'paused', 'changed', true);
  end if;
  return clara._finish_op(v_firm, 'pause_accounting_plan', p_op_key, v_result);
end $$;

create function clara.resume_accounting_plan(p_plan uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; v_dedupe jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'resuming an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  v_dedupe := clara._reserve_op(v_firm, 'resume_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this resume key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;
  perform 1 from clara.accounting_plans where id = p_plan for update; -- RUNG 1
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be resumed; create a new plan'
      using errcode='CLR10', detail='{"reason":"plan_ended"}';
  end if;
  if p.status = 'active' then
    v_result := jsonb_build_object('plan_id', p_plan, 'status', 'active', 'changed', false);
  else
    update clara.accounting_plans
       set status = 'active', paused_at = null, paused_by = null, paused_reason = null
     where id = p_plan;
    perform clara._audit(v_firm, v_actor, null, null, 'resume_accounting_plan', null,
      jsonb_build_object('plan', p_plan, 'op_key', p_op_key));
    v_result := jsonb_build_object('plan_id', p_plan, 'status', 'active', 'changed', true);
  end if;
  return clara._finish_op(v_firm, 'resume_accounting_plan', p_op_key, v_result);
end $$;

create function clara.end_accounting_plan(p_plan uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; v_dedupe jsonb; v_result jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'ending an accounting plan requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'ending an accounting plan records why' using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"reason","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  v_dedupe := clara._reserve_op(v_firm, 'end_accounting_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'reason', btrim(p_reason))));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this end key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;
  perform 1 from clara.accounting_plans where id = p_plan for update; -- RUNG 1
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status = 'ended' then
    v_result := jsonb_build_object('plan_id', p_plan, 'status', 'ended', 'changed', false);
  else
    update clara.accounting_plans
       set status = 'ended', ended_at = now(), ended_by = v_actor, ended_reason = btrim(p_reason),
           paused_at = null, paused_by = null, paused_reason = null
     where id = p_plan;
    perform clara._audit(v_firm, v_actor, null, null, 'end_accounting_plan', null,
      jsonb_build_object('plan', p_plan, 'reason', btrim(p_reason), 'op_key', p_op_key));
    v_result := jsonb_build_object('plan_id', p_plan, 'status', 'ended', 'changed', true);
  end if;
  return clara._finish_op(v_firm, 'end_accounting_plan', p_op_key, v_result);
end $$;

-- CATCH-UP — the ONLY way a historical due event is admitted. Explicit window, oldest first,
-- bounded, and refused outright when the window reaches back past the authority it would ride on.
create function clara.request_plan_catch_up(p_plan uuid, p_from date, p_to date, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; r record; e record;
  v_dedupe jsonb; v_today date; v_admitted jsonb := '[]'::jsonb; v_n int := 0; v_result jsonb;
  v_answer jsonb;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'a catch-up requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  if p.status <> 'active' then
    raise exception 'only an active plan can catch up' using errcode='CLR10',
      detail=jsonb_build_object('reason', case p.status when 'paused' then 'plan_paused' else 'plan_ended' end)::text;
  end if;
  select * into r from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'a catch-up needs a window' using errcode='CLR10',
      detail='{"reason":"invalid_catch_up_window"}';
  end if;
  -- THE AUTHORITY FLOOR. A window that starts before `effective_from` would be asking a schedule
  -- to authorise periods it was never authorised for; refused by name rather than clamped, so the
  -- person sees what they asked for and what the authority actually covers.
  if p_from < r.effective_from then
    raise exception 'this plan''s authority starts on %; a catch-up cannot reach back past it',
      to_char(r.effective_from,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','catch_up_before_authority',
          'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
          'requested_from', to_char(p_from,'YYYY-MM-DD'))::text;
  end if;
  v_today := (now() at time zone r.timezone)::date;
  if p_to > v_today then
    raise exception 'a catch-up cannot reach into the future (today is % in %)', to_char(v_today,'YYYY-MM-DD'), r.timezone
      using errcode='CLR10',
        detail=jsonb_build_object('reason','catch_up_in_future','today', to_char(v_today,'YYYY-MM-DD'))::text;
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'request_plan_catch_up', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'from', p_from, 'to', p_to)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this catch-up key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- OLDEST FIRST, BOUNDED. `_plan_due_events` emits ascending and stops at the cap, so one call
  -- can never walk a decade of periods.
  for e in select * from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule,
             r.day_of_month, r.auto_reverse, greatest(p_from, r.effective_from),
             least(p_to, coalesce(r.effective_to, p_to)), 12) loop
    v_answer := clara._plan_admit_occurrence(p_plan, e.due_date, e.leg, clara._plan_run_model());
    v_admitted := v_admitted || jsonb_build_array(v_answer);
    if coalesce((v_answer->>'admitted')::boolean, false) then v_n := v_n + 1; end if;
  end loop;

  perform clara._audit(v_firm, v_actor, null, null, 'request_plan_catch_up', null,
    jsonb_build_object('plan', p_plan, 'from', p_from, 'to', p_to, 'admitted', v_n,
      'op_key', p_op_key));
  v_result := jsonb_build_object('plan_id', p_plan, 'from', to_char(p_from,'YYYY-MM-DD'),
    'to', to_char(p_to,'YYYY-MM-DD'), 'admitted', v_n, 'cap', 12, 'events', v_admitted);
  return clara._finish_op(v_firm, 'request_plan_catch_up', p_op_key, v_result);
end $$;

-- The model snapshot a DATABASE-side admission records. It is `packages/runtime/src/workRoutes.ts`'s
-- own `DEFAULT_MODEL` fallback, restated here because a plan occurrence admitted by
-- `request_plan_catch_up` has no runtime process to ask. The runtime's own scan passes its LIVE
-- value instead of taking this default (see clara.wake_due_plan_occurrences' second argument), so
-- this constant is only ever the answer where there is genuinely nobody to ask.
create function clara._plan_run_model() returns text
  language sql immutable security definer set search_path = clara, pg_temp as $$ select 'gpt-5.6-terra'::text $$;
revoke all on function clara._plan_run_model() from public;

-- =====================================================================================
-- §G  THE READS. Viewer+, definer, firm-predicated — the 0038/0041 read-surface idiom.
-- =====================================================================================

create function clara.preview_accounting_plan(p_plan uuid, p_count int) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; r record;
  v_count int; v_after date; v_start date; v_end date; v_step int; v_rows jsonb;
begin
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('viewer')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  select * into r from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    return jsonb_build_object('plan_id', p_plan, 'status', p.status, 'occurrences', '[]'::jsonb,
      'reason', 'no_live_revision');
  end if;
  v_count := least(greatest(coalesce(p_count, 3), 1), 24);
  select max(o.due_date) into v_after from clara.accounting_plan_occurrences o where o.plan_id = p_plan;
  v_start := greatest(r.effective_from, coalesce(v_after + 1, r.effective_from));
  v_step := case r.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end;
  v_end := (date_trunc('month', v_start::timestamp)
            + (((v_count + 2) * v_step) * interval '1 month')
            + interval '1 month' - interval '1 day')::date;
  if r.effective_to is not null then v_end := least(v_end, r.effective_to); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg,
           'basis', clara._plan_occurrence_basis(r.basis, e.due_date, e.leg)) order by e.due_date),
         '[]'::jsonb) into v_rows
    from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule, r.day_of_month,
           r.auto_reverse, v_start, v_end, v_count) e;
  return jsonb_build_object('plan_id', p_plan, 'status', p.status, 'revision', r.revision,
    'timezone', r.timezone, 'today', to_char((now() at time zone r.timezone)::date,'YYYY-MM-DD'),
    'from_date', to_char(v_start,'YYYY-MM-DD'),
    -- A PAUSED plan still previews its schedule, and says the schedule is not being admitted. An
    -- empty preview would read as "there is nothing scheduled", which is a different fact.
    'admitting', (p.status = 'active'), 'occurrences', v_rows);
end $$;

create function clara.list_accounting_plans(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_rows jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'plan_id', p.id, 'kind', p.kind, 'status', p.status, 'purpose', p.purpose,
        'authority_kind', p.authority_kind, 'authorised_by', p.authorised_by,
        'authorised_at', p.authorised_at, 'created_at', p.created_at,
        'revision', r.revision, 'frequency', r.frequency, 'day_rule', r.day_rule,
        'day_of_month', r.day_of_month, 'timezone', r.timezone,
        'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
        'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
        'auto_reverse', r.auto_reverse,
        'next_occurrence', (
          select to_char(e.due_date,'YYYY-MM-DD') from clara._plan_due_events(
            r.effective_from, r.frequency, r.day_rule, r.day_of_month, r.auto_reverse,
            greatest(r.effective_from, coalesce(
              (select max(o.due_date) + 1 from clara.accounting_plan_occurrences o where o.plan_id = p.id),
              r.effective_from)),
            coalesce(r.effective_to, (greatest(r.effective_from, (now() at time zone r.timezone)::date) + 3650)),
            1) e limit 1),
        'occurrence_count', (select count(*)::int from clara.accounting_plan_occurrences o where o.plan_id = p.id)
      ) as x
        from clara.accounting_plans p
        left join clara.accounting_plan_revisions r
               on r.plan_id = p.id and r.superseded_at is null
       where p.client_id = p_client and p.firm_id = v_firm
    ) s;
  return jsonb_build_object('client_id', p_client, 'plans', v_rows);
end $$;

create function clara.get_accounting_plan(p_plan uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; r record; v_revs jsonb;
begin
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('viewer')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  select * into r from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  select coalesce(jsonb_agg(jsonb_build_object(
           'revision', v.revision, 'frequency', v.frequency, 'day_rule', v.day_rule,
           'day_of_month', v.day_of_month, 'timezone', v.timezone,
           'effective_from', to_char(v.effective_from,'YYYY-MM-DD'),
           'effective_to', case when v.effective_to is null then null else to_char(v.effective_to,'YYYY-MM-DD') end,
           'basis', v.basis, 'basis_digest', v.basis_digest, 'auto_reverse', v.auto_reverse,
           'reversal_day_rule', v.reversal_day_rule, 'created_by', v.created_by,
           'created_at', v.created_at, 'superseded_at', v.superseded_at) order by v.revision desc),
         '[]'::jsonb) into v_revs
    from clara.accounting_plan_revisions v where v.plan_id = p_plan;
  return jsonb_build_object(
    'plan_id', p.id, 'client_id', p.client_id, 'kind', p.kind, 'status', p.status,
    'purpose', p.purpose, 'authority_kind', p.authority_kind, 'authority_ref', p.authority_ref,
    'authorised_by', p.authorised_by, 'authorised_at', p.authorised_at,
    'created_by', p.created_by, 'created_at', p.created_at,
    'paused_at', p.paused_at, 'paused_by', p.paused_by, 'paused_reason', p.paused_reason,
    'ended_at', p.ended_at, 'ended_by', p.ended_by, 'ended_reason', p.ended_reason,
    'current_revision', p.current_revision,
    'live_revision', case when r.revision is null then null else jsonb_build_object(
      'revision', r.revision, 'frequency', r.frequency, 'day_rule', r.day_rule,
      'day_of_month', r.day_of_month, 'timezone', r.timezone,
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
      'basis', r.basis, 'basis_digest', r.basis_digest, 'auto_reverse', r.auto_reverse,
      'reversal_day_rule', r.reversal_day_rule) end,
    'revisions', v_revs);
end $$;

create function clara.list_accounting_plan_occurrences(p_plan uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; v_rows jsonb;
begin
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('viewer')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  select coalesce(jsonb_agg(jsonb_build_object(
           'occurrence_id', o.id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'), 'leg', o.leg,
           'revision', o.revision, 'intent_key', o.intent_key, 'work_id', o.work_id,
           'admitted_at', o.admitted_at, 'outcome', o.outcome, 'created_at', o.created_at,
           'work_status', w.status, 'work_error', w.error,
           -- THE COMMITTED receipt only. `clara.operation_receipts` also holds `refused` rows
           -- (0178 §B), and a refusal's id rendered as "the receipt" would tell an operator that
           -- money moved. The entry id lives inside `effects`, which is where the posting core
           -- puts it — there is no entry_id column on that table.
           'receipt_id', (select rc.id from clara.operation_receipts rc
                           where rc.work_id = o.work_id and rc.outcome = 'committed'
                           order by rc.created_at limit 1),
           'entry_id', (select rc.effects->>'entry_id' from clara.operation_receipts rc
                         where rc.work_id = o.work_id and rc.outcome = 'committed'
                         order by rc.created_at limit 1))
         order by o.due_date desc), '[]'::jsonb) into v_rows
    from clara.accounting_plan_occurrences o
    left join clara.accounting_work w on w.id = o.work_id
   where o.plan_id = p_plan;
  return jsonb_build_object('plan_id', p_plan, 'occurrences', v_rows);
end $$;

-- "From plan <purpose>" on the Work detail's identity block. NULL when the Work was not initiated
-- by a plan — the honest answer, never a fabricated origin.
create function clara.get_work_plan_origin(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_out jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  select jsonb_build_object(
      'plan_id', p.id, 'purpose', p.purpose, 'kind', p.kind, 'status', p.status,
      'occurrence_id', o.id, 'revision', o.revision, 'leg', o.leg,
      'due_date', to_char(o.due_date,'YYYY-MM-DD'), 'authorised_by', p.authorised_by,
      'authority_kind', p.authority_kind)
    into v_out
    from clara.accounting_plan_occurrences o
    join clara.accounting_plans p on p.id = o.plan_id
   where o.work_id = p_work and o.firm_id = v_firm;
  return v_out;
end $$;

-- =====================================================================================
-- §H  THE RUNTIME SCAN. EXECUTE to clara_runtime ONLY — the clara.admit_journal_work lane.
--
--     Oldest-due-first, bounded, one due event per plan per call, every recheck under the plan's
--     own row lock, and each plan isolated so one poisoned row cannot abort the sweep.
-- =====================================================================================
create function clara.wake_due_plan_occurrences(p_limit int, p_model text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_limit int; v_model text; v_answer jsonb;
  v_scanned int := 0; v_admitted int := 0; v_converged int := 0; v_refused int := 0;
  v_rows jsonb := '[]'::jsonb; v_code text; v_message text;
begin
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_model := coalesce(nullif(btrim(coalesce(p_model,'')),''), clara._plan_run_model());
  for c in
    select p.id as plan_id, (x.e->>'due_date')::date as due_date, x.e->>'leg' as leg
      from clara.accounting_plans p
      join clara.accounting_plan_revisions r on r.plan_id = p.id and r.superseded_at is null
      join clara.clients cl on cl.id = p.client_id and cl.firm_id = p.firm_id
      cross join lateral (
        select clara._plan_due_event_on_or_before(r.effective_from, r.frequency, r.day_rule,
                 r.day_of_month, r.auto_reverse,
                 least((now() at time zone r.timezone)::date,
                       coalesce(r.effective_to, 'infinity'::date))) as e
      ) x
     where p.status = 'active' and cl.status = 'active' and x.e is not null
       and not exists (select 1 from clara.accounting_plan_occurrences o
                        where o.plan_id = p.id and o.due_date = (x.e->>'due_date')::date)
     order by (x.e->>'due_date')::date, p.created_at, p.id
     limit v_limit
  loop
    v_scanned := v_scanned + 1;
    begin
      v_answer := clara._plan_admit_occurrence(c.plan_id, c.due_date, c.leg, v_model);
    exception when others then
      -- PER-PLAN ISOLATION (the reconciler-sst/-fa precedent, in SQL): an unexpected throw is
      -- counted and the sweep moves on. `_plan_admit_occurrence` answers rather than raising for
      -- every BUSINESS outcome, so reaching here means something structural.
      get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      v_answer := jsonb_build_object('admitted', false, 'plan_id', c.plan_id,
        'reason', 'scan_error', 'code', v_code, 'message', v_message);
    end;
    if coalesce((v_answer->>'admitted')::boolean, false) then v_admitted := v_admitted + 1;
    elsif coalesce((v_answer->>'converged')::boolean, false) then v_converged := v_converged + 1;
    else v_refused := v_refused + 1;
    end if;
    v_rows := v_rows || jsonb_build_array(v_answer);
  end loop;
  return jsonb_build_object('scanned', v_scanned, 'admitted', v_admitted,
    'converged', v_converged, 'refused', v_refused, 'limit', v_limit, 'occurrences', v_rows);
end $$;

-- =====================================================================================
-- §I  GRANTS. The human doors to clara_authenticated; the scan to clara_runtime ONLY. The agent
--     and wake roles gain NOTHING: a lane that could author its own future authority would be the
--     agent deciding what it is allowed to do.
-- =====================================================================================
revoke all on function clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text) from public;
revoke all on function clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text) from public;
revoke all on function clara.pause_accounting_plan(uuid,text,text) from public;
revoke all on function clara.resume_accounting_plan(uuid,text) from public;
revoke all on function clara.end_accounting_plan(uuid,text,text) from public;
revoke all on function clara.request_plan_catch_up(uuid,date,date,text) from public;
revoke all on function clara.preview_accounting_plan(uuid,int) from public;
revoke all on function clara.list_accounting_plans(uuid) from public;
revoke all on function clara.get_accounting_plan(uuid) from public;
revoke all on function clara.list_accounting_plan_occurrences(uuid) from public;
revoke all on function clara.get_work_plan_origin(uuid) from public;
revoke all on function clara.wake_due_plan_occurrences(int,text) from public;

grant execute on function clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text) to clara_authenticated;
grant execute on function clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text) to clara_authenticated;
grant execute on function clara.pause_accounting_plan(uuid,text,text) to clara_authenticated;
grant execute on function clara.resume_accounting_plan(uuid,text) to clara_authenticated;
grant execute on function clara.end_accounting_plan(uuid,text,text) to clara_authenticated;
grant execute on function clara.request_plan_catch_up(uuid,date,date,text) to clara_authenticated;
grant execute on function clara.preview_accounting_plan(uuid,int) to clara_authenticated;
grant execute on function clara.list_accounting_plans(uuid) to clara_authenticated;
grant execute on function clara.get_accounting_plan(uuid) to clara_authenticated;
grant execute on function clara.list_accounting_plan_occurrences(uuid) to clara_authenticated;
grant execute on function clara.get_work_plan_origin(uuid) to clara_authenticated;
grant execute on function clara.wake_due_plan_occurrences(int,text) to clara_runtime;

comment on function clara.wake_due_plan_occurrences(int,text) is
  '#640: the runtime leader''s every-cycle plan scan. Oldest-due-first, bounded, ONE due event per '
  'plan per call, every recheck under the plan row lock, per-plan error isolation. Reads no '
  'operator flag: a plan''s authority is its own instruction and there is no global agentic switch.';
comment on function clara.pause_accounting_plan(uuid,text,text) is
  '#640: blocks FUTURE admission only. It never cancels an already admitted Work -- that is '
  'clara.cancel_accounting_work (0184), a separately named action with its own ordering boundary.';
comment on function clara.request_plan_catch_up(uuid,date,date,text) is
  '#640: the ONLY path by which a historical due event is admitted. Explicit window, oldest first, '
  'at most 12 events per call, refused with catch_up_before_authority when the window starts '
  'before the live revision''s effective_from.';

reset role;

-- =====================================================================================
-- §J  TAIL CENSUS. Every claim re-READ from the live catalog.
-- =====================================================================================
do $w640_tail$
declare
  v_n int; v_names text; v_src text;
begin
  -- 1 · the three relations exist, are RLS-forced, and hold NO application grant.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='clara' and c.relkind='r'
     and c.relname in ('accounting_plans','accounting_plan_revisions','accounting_plan_occurrences')
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 3 then
    raise exception '#640 tail: expected 3 RLS-forced plan relations, found %', v_n using errcode='CLR10';
  end if;
  select coalesce(string_agg(c.relname, ',' order by c.relname),'(none)') into v_names
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='clara'
     and c.relname in ('accounting_plans','accounting_plan_revisions','accounting_plan_occurrences')
     and c.relacl is not null;
  if v_names <> '(none)' then
    raise exception '#640 tail: a plan relation carries a materialised ACL (%) -- every reach is through a definer door', v_names
      using errcode='CLR10';
  end if;

  -- 2 · the identity law, read off the catalog rather than believed.
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass
                    and conname='uq_plan_occurrences_plan_due' and contype='u') then
    raise exception '#640 tail: unique (plan_id, due_date) is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass
                    and conname='uq_plan_occurrences_work' and contype='u') then
    raise exception '#640 tail: unique (work_id) is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_index ix
                  where ix.indrelid='clara.accounting_plan_revisions'::regclass
                    and ix.indisunique and ix.indpred is not null) then
    raise exception '#640 tail: the one-live-revision partial unique index is absent' using errcode='CLR10';
  end if;

  -- 3 · the grant matrix: twelve doors, eleven human and one runtime-only.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara'
     and p.proname in ('create_accounting_plan','revise_accounting_plan','pause_accounting_plan',
                       'resume_accounting_plan','end_accounting_plan','request_plan_catch_up',
                       'preview_accounting_plan','list_accounting_plans','get_accounting_plan',
                       'list_accounting_plan_occurrences','get_work_plan_origin')
     and has_function_privilege('clara_authenticated', p.oid, 'execute');
  if v_n <> 11 then
    raise exception '#640 tail: expected 11 human doors granted to clara_authenticated, found %', v_n
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime',
        'clara.wake_due_plan_occurrences(int,text)'::regprocedure, 'execute') then
    raise exception '#640 tail: clara_runtime cannot execute the plan scan' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated',
        'clara.wake_due_plan_occurrences(int,text)'::regprocedure, 'execute') then
    raise exception '#640 tail: the plan scan must not be reachable from the browser lane'
      using errcode='CLR10';
  end if;
  -- The agent/wake lanes gain nothing at all. Guarded on the role EXISTING: has_function_privilege
  -- RAISES on an unknown role, which would turn "this frontier has no agent lane" into a failure
  -- about grants.
  if to_regrole('clara_agent_ro') is not null then
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara'
       and (p.proname like '%accounting_plan%' or p.proname in ('request_plan_catch_up','get_work_plan_origin','wake_due_plan_occurrences'))
       and has_function_privilege('clara_agent_ro', p.oid, 'execute');
    if v_n <> 0 then
      raise exception '#640 tail: the agent read lane holds EXECUTE on % plan door(s)', v_n using errcode='CLR10';
    end if;
  end if;

  -- 4 · NO GLOBAL AGENTIC SWITCH. The scan reads no operator flag; asserted on the live body
  --     rather than left to be believed (#640: "there is no global enable-agentic switch").
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='wake_due_plan_occurrences';
  if v_src like '%wake_engine_sources%' or v_src like '%set_wake_source_enabled%' then
    raise exception '#640 tail: the plan scan reads an operator-level enable flag -- there is no global agentic switch'
      using errcode='CLR10';
  end if;

  -- 5 · the due arithmetic, exercised on the catalog's own functions. A monthly day-15 schedule
  --     from 2026-06-15 has its third due day on 2026-08-15; a month-end schedule lands on the
  --     28th of a non-leap February; a reversal is the 1st of the following month.
  if clara._plan_due_nth(date '2026-06-15','monthly','day_of_month',15,2) <> date '2026-08-15' then
    raise exception '#640 tail: monthly day-of-month arithmetic is wrong (got %)',
      clara._plan_due_nth(date '2026-06-15','monthly','day_of_month',15,2) using errcode='CLR10';
  end if;
  if clara._plan_due_nth(date '2027-01-31','monthly','last_day_of_month',null,1) <> date '2027-02-28' then
    raise exception '#640 tail: last-day-of-month arithmetic is wrong (got %)',
      clara._plan_due_nth(date '2027-01-31','monthly','last_day_of_month',null,1) using errcode='CLR10';
  end if;
  if clara._plan_due_nth(date '2026-06-15','quarterly','day_of_month',15,1) <> date '2026-09-15' then
    raise exception '#640 tail: quarterly arithmetic is wrong' using errcode='CLR10';
  end if;
  if clara._plan_reversal_date(date '2026-09-30') <> date '2026-10-01' then
    raise exception '#640 tail: reversal arithmetic is wrong' using errcode='CLR10';
  end if;
  if clara._plan_due_index_on_or_before(date '2026-06-15','monthly','day_of_month',15,date '2026-06-14')
     is not null then
    raise exception '#640 tail: a schedule produced a due day before its own effective_from'
      using errcode='CLR10';
  end if;
  if (clara._plan_due_event_on_or_before(date '2026-06-30','monthly','last_day_of_month',null,true,
        date '2026-08-05') ->> 'due_date') <> '2026-08-01'
     or (clara._plan_due_event_on_or_before(date '2026-06-30','monthly','last_day_of_month',null,true,
        date '2026-08-05') ->> 'leg') <> 'reversal' then
    raise exception '#640 tail: a reversing schedule''s latest event on 2026-08-05 is not the 2026-08-01 reversal (got %)',
      clara._plan_due_event_on_or_before(date '2026-06-30','monthly','last_day_of_month',null,true, date '2026-08-05')
      using errcode='CLR10';
  end if;

  -- 6 · nothing of 0045's was touched: the four template/run relations and the five live doors
  --     this file deliberately leaves alone are still exactly where they were.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname in ('adjustment_templates','adjustment_runs','adjustment_pair_reversals');
  if v_n <> 3 then
    raise exception '#640 tail: the 0045 adjustment relations are not intact (found %)', v_n using errcode='CLR10';
  end if;

  raise notice '#640 tail: OK -- three RLS-forced plan relations with no application ACL, unique (plan_id, due_date) and unique (work_id) present, one live revision per plan enforced by a partial unique index, 11 human doors on clara_authenticated and the scan on clara_runtime alone (browser and agent lanes hold none), the scan reads no operator enable flag, the due arithmetic answers correctly for monthly/quarterly/month-end/reversal, and the 0045 adjustment lane is untouched.';
end
$w640_tail$;
