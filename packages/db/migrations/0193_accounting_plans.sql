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
-- A RE-ATTEMPT TAKES A DISTINGUISHING SUFFIX, and it exists for one measured reason (review finding
-- S7): a plan Work a human CANCELS is terminal with no committed receipt, so the period is still
-- owed — and with `work_id` set once and the door converging on it, that due date was unpostable
-- forever. `attempt` counts re-admissions, the key becomes `plan:<plan>:r<rev>:<due>:a<attempt>`
-- from the second attempt on (the first keeps the spelling above), and only
-- `clara.request_plan_catch_up` may ask for one — never the scan, and never over a Work that
-- COMPLETED or that carries a committed receipt.
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
--   · the cost of a cycle is ONE query whose row source is ACTIVE PLANS ONLY, and it is stated
--     here as what it actually is rather than as "one indexed lookup" (the shape changed when the
--     picker below stopped being pure arithmetic). `ix_accounting_plans_active` (active plans
--     only) and `ix_plan_revisions_live` (live revisions only) bound that row source; for each
--     such row `clara._plan_admissible_event` runs a handful of equality probes, every one of
--     them served by `uq_plan_occurrences_plan_due` (plan + date) or `uq_plan_occurrences_period`
--     (plan + leg + period) — no sequential scan of the occurrence table anywhere, and NO ROWS at
--     all on an estate with no active plan. An empty answer is the ordinary answer. It is the
--     `due_date <= clara._book_today()` gate that keeps it small, and that gate is inside the
--     picker rather than in the outer WHERE.
--   · the due ARITHMETIC is entirely DB-owned (the `_plan_due_*` helpers below). The runtime never
--     re-derives a date, so there is no second implementation of "when is this due" to drift.
--
-- THE SCAN NEVER BACKFILLS. It considers exactly ONE due event per plan per call, and
-- `clara._plan_admissible_event` is the whole of that choice:
--
--   · the PRIMARY candidate is the LATEST accrual at or before today in the revision's timezone,
--     and only when nothing has been recorded for it. Still latest-only: a leader that was down for
--     two months admits the CURRENT period and not the two it missed.
--   · the REVERSAL candidate is the OLDEST reversal at or before today whose OWN period's accrual
--     HAS POSTED — a committed receipt naming a journal entry that is still live
--     (`clara._plan_primary_entry`; see THE REVERSAL LAW below). That eligibility rule is the
--     orphan wall, and it is a correctness fix rather than a refinement (review finding B2 and
--     round 2's BLOCKER-1): a reversal is always in the month AFTER its accrual, so a picker that
--     simply took the latest event surfaced period k's reversal the moment its date arrived — even
--     on a plan whose accrual for k had never been admitted at all. The TWO MOST RECENT periods are
--     probed (k and k-1) — not because older ones cannot be outstanding, but because the scan never
--     backfills: an older missed reversal is catch-up, exactly like an older missed accrual.
--   · when both candidates exist the EARLIER date wins, which is the only order the books can take:
--     last period's reversal before this period's accrual.
--
-- The missed periods are catch-up, and catch-up is `clara.request_plan_catch_up`: explicit window,
-- oldest-first, bounded, and refused outright when the window starts before the LIVE REVISION's
-- `effective_from` (CLR10 `catch_up_before_authority`) — which the authority floor below pins at or
-- after `accounting_plans.authority_from`, so that wall can only ever be at or tighter than the
-- plan's own authority, never looser. That is the acceptance criterion "a future
-- schedule never authorises historical runs" implemented as an arithmetic property of the scan
-- rather than as a promise about it.
--
-- A PERIOD IS THE IDENTITY, NOT ONLY A DATE (review finding B1). `unique (plan_id, due_date)` alone
-- let a REVISION double-post: move a monthly plan's due day from the 15th to the 10th after the
-- 15th has already run and the next scan finds an unoccupied due_date naming the SAME accounting
-- period and the same basis, so one period took two entries. Every occurrence therefore also
-- carries `period_key` — the first day of the step-aligned period it belongs to, anchored on the
-- PLAN's own `authority_from` so it cannot move with a revision — under
-- `unique (plan_id, leg, period_key)`. A reversal's period key is its ACCRUAL's, not the month the
-- reversal falls in, so the two legs of one period share a key and differ only by `leg`.
--
-- =====================================================================================
-- THE REVERSAL LAW: A REVERSAL NAMES THE ENTRY IT REVERSES (review round 2, BLOCKER-1).
--
--   A reversal occurrence is admissible only when its own period's accrual occurrence has POSTED —
--   its Work carries a COMMITTED operation receipt whose journal entry is still live (approved and
--   not itself reversed) — and the reversal's basis and occurrence row both NAME that entry id.
--
-- The rule this replaces was "the accrual STANDS": admitted, and its Work not a terminal dead end.
-- It was evaluated ONCE, at the reversal's ADMISSION, and a `queued` accrual with zero receipts
-- satisfied it. MEASURED: scan 1 admits the accrual (queued, no receipts); scan 2 admits the
-- reversal behind it; `clara.cancel_accounting_work` then kills the accrual — and NOTHING revokes
-- the reversal Work, which goes on to claim, post and settle. The ledger took
-- `2026-09-01 Dr 1150 99000 / Cr 6100 99000`, one entry reversing nothing. The same shape arrives
-- without any human at all when the accrual settles `failed` on a locked period while the
-- reversal's own month is open.
--
-- "Posted" closes it at the only moment a plan controls: a Work that holds a committed receipt can
-- no longer be cancelled into nothing (0184's `settle_work_run` forces `completed` over one), so
-- the accrual behind an admitted reversal cannot become a non-event afterwards. The entry id is
-- carried rather than merely checked — onto `accounting_plan_occurrences.reverses_entry_id` (a
-- real FK into `clara.journal_entries`, with `ck_plan_occurrences_reversal_entry` making "an
-- admitted reversal naming no entry" a row this table cannot hold) and into the reversal's own
-- MEMO, which is the one part of the basis that reaches `clara.journal_entries` — so the reversal
-- that lands in the ledger names the entry it reverses IN the ledger, not only in a row beside it.
-- (It is the memo and not a new basis key because `journalBasisSchema` in the FROZEN
-- `claraWork.v1.tools.ts` is `.strict()`: an unknown key makes the run's faithful echo fail
-- validation and the Work settle `failed`/`no_effect`. Measured, then changed — see
-- `clara._plan_occurrence_basis` below.)
--
-- WHAT THIS SLICE STILL DOES NOT CLOSE, stated rather than implied: a human who reverses the
-- accrual's OWN entry (`clara.journal_entries.reversed_by`, which the correction lanes of
-- 0004/0007/0009/0027 set) in the window between this reversal's admission and its posting. The
-- admission wall re-reads liveness, so the window is exactly that gap and no wider; closing it
-- needs a wall inside `clara._record_journal_entry_core`, a body 0193 may not recut (0194 and 0195
-- pin it by sha256). It is filed as a follow-up rather than pretended away.
--
-- =====================================================================================
-- A FREQUENCY CHANGE CANNOT RE-COVER A PERIOD ALREADY RUN (review finding SHOULD-1).
--
-- `unique (plan_id, leg, period_key)` is exact PER ALIGNMENT and blind ACROSS alignments, because
-- the key is computed from the LIVE revision's frequency: monthly `2026-09-01` and quarterly
-- `2026-08-01` are two different keys naming one September. Measured both directions through the
-- plain scan. `clara.revise_accounting_plan` therefore refuses CLR10 `period_already_covered` when
-- the frequency CHANGES and the new alignment's first period would start on or before the end of
-- the last period this plan has already run (`clara._plan_covered_through`), naming that period and
-- the earliest `effective_from` that would be lawful. With the frequency unchanged the alignment is
-- unchanged and review finding B1's `period_already_admitted` still binds a moved due day.
--
-- EVERY ATTEMPT OF A DUE EVENT STAYS REACHABLE (review finding SHOULD-2). An S7 re-attempt moves
-- `work_id`, and the superseded Work used to drop out of the plan's view entirely —
-- `list_accounting_plan_occurrences` never named it and `get_work_plan_origin` answered NULL for
-- it, leaving `clara.audit_log` as the only record. `accounting_plan_occurrences.attempts` is an
-- append-only jsonb ledger of every admission, projected by the list door and resolved by
-- `get_work_plan_origin` (which now answers `superseded` plus the attempt number) through a GIN
-- index rather than a sequential scan.
--
-- =====================================================================================
-- THE AUTHORITY FLOOR IS THE PLAN'S, NOT THE LIVE REVISION'S (review finding B3).
-- `accounting_plans.authority_from` is written once at creation and frozen; `revise` refuses an
-- `effective_from` below it (CLR10 `effective_from_before_authority`). Without that floor a plan
-- created with today's authority could be revised to 2020 and then "catch up" twelve back-dated
-- Works — the catch-up wall reads the live revision, and the live revision was whatever the last
-- caller said.
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
-- and every row already carries the zone its dates were computed in.
--
-- THE ARITHMETIC DOES NOT SPELL THE ZONE: every "today" in this file is clara._book_today()
-- (0042 S5.20), the one body in the estate that owns the house legal date -- literally
-- `(statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date`. The one-member CHECK and the
-- authority therefore hold the SAME zone by construction, and a UTC-based comparison (which would
-- fire a Kuala Lumpur 1st-of-the-month occurrence eight hours late) is unreachable from here.
-- The first cut spelled `(now() at time zone r.timezone)::date` at five sites; that was a second
-- body owning one house fact, and it also pinned "today" to the TRANSACTION's start rather than
-- the statement's -- round-7 finding C, which the authority exists to have settled once.
-- clara._assert_plan_schedule still names the zone, because the value a caller SENDS has to be
-- checked against the lane's closed vocabulary and refused by name; the authority answers what
-- day it is, not which zone a caller may write down.
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
     or to_regclass('clara.journal_entries') is null
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

  -- THE REVERSAL LAW'S OWN GROUND (review round 2, BLOCKER-1), read LIVE rather than assumed: a
  -- committed receipt must NAME its entry inside `effects`, and a journal entry must record having
  -- been reversed. Without either column "a reversal reverses a posted, still-live entry" would be
  -- a claim this file could not make.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.operation_receipts'::regclass and contype = 'c'
                    and pg_get_constraintdef(oid) like '%entry_id%') then
    raise exception '#640 prestate: clara.operation_receipts does not bind a committed receipt to name its entry'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.journal_entries'::regclass
                    and attname = 'reversed_by' and not attisdropped) then
    raise exception '#640 prestate: clara.journal_entries.reversed_by is absent -- a reversal could not tell a live accrual from an undone one'
      using errcode='CLR10';
  end if;

  raise notice '#640 prestate: clean -- no accounting_plans/accounting_plan_revisions/accounting_plan_occurrences relation and no plan door exists; the 0045 adjustment lane and the 0178 accounting-work lane are both present.';
end
$w640_pre$;

-- THE 0045 LANE, PINNED BY ITS LIVE BODIES RATHER THAN BY THIS FILE'S PROMISE NOT TO TOUCH IT
-- (review finding S8: the tail used to CLAIM five untouched doors while counting three relations
-- and zero doors). The digests are taken NOW, before this file creates anything, into a temp table
-- that lives only for this transaction; §J re-reads the catalog and requires byte equality. A
-- `create or replace` of any of the five anywhere below therefore reds the migration instead of
-- being invisible.
create temp table w640_adj_pin on commit drop as
select p.proname, md5(p.prosrc) as digest
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'clara'
   and p.proname in ('propose_adjustment_template','sign_adjustment_template',
                     'retire_adjustment_template','run_adjustment_occurrence','adjustment_run_due');
do $w640_pin$
declare v_n int;
begin
  select count(*)::int into v_n from w640_adj_pin;
  if v_n <> 5 then
    raise exception '#640 prestate: expected the five 0045 adjustment doors to pin, found %', v_n
      using errcode='CLR10';
  end if;
end $w640_pin$;

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
  -- THE AUTHORITY FLOOR, written once and frozen (review finding B3). Every revision's
  -- `effective_from` must be at or after it, so the earliest period this plan can ever be asked to
  -- run is fixed at the moment a human authorised it — and it is also the STABLE anchor
  -- `period_key` is aligned on, which a revision must not be able to move either.
  authority_from  date        not null,
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
                           'authority_ref','authorised_by','authorised_at','authority_from',
                           'created_by','created_at'];
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
  -- THE PERIOD this due event belongs to — the first day of its step-aligned period, anchored on
  -- the plan's own `authority_from`. For a REVERSAL it is its ACCRUAL's period, not the month the
  -- reversal falls in, so the two legs of one period share a key.
  period_key  date        not null,
  -- HOW MANY TIMES this due event has been admitted. 1 for every ordinary occurrence; bumped only
  -- by `clara.request_plan_catch_up` over a Work that was CANCELLED or FAILED (review finding S7).
  attempt     integer     not null default 1 check (attempt >= 1),
  intent_key  text        not null check (intent_key !~ '^\s*$'),
  work_id     uuid,
  -- THE ENTRY THIS LEG UNDOES (review round 2, BLOCKER-1). A reversal is admitted only against a
  -- POSTED accrual, and it NAMES the journal entry that accrual produced — so the reversal that
  -- reaches the ledger is auditable against the entry it reverses instead of being a swapped-sides
  -- entry standing on its own. NULL for an accrual leg, and NULL for a reversal that was refused.
  reverses_entry_id uuid,
  -- EVERY ADMISSION THIS DUE EVENT TOOK, append-only (review finding SHOULD-2). `work_id` names
  -- the CURRENT attempt; a re-attempt (S7) used to drop its predecessor out of the plan's view
  -- entirely, leaving clara.audit_log as the only record that the cancelled Work was ever this
  -- plan's. One element per admission: {attempt, work_id, intent_key, revision, admitted_at}.
  attempts    jsonb       not null default '[]'::jsonb check (jsonb_typeof(attempts) = 'array'),
  admitted_at timestamptz,
  outcome     jsonb       not null check (jsonb_typeof(outcome) = 'object'),
  created_at  timestamptz not null default now(),
  -- THE IDENTITY LAW. One plan, one due date, one occurrence.
  constraint uq_plan_occurrences_plan_due unique (plan_id, due_date),
  -- …AND ONE PERIOD PER LEG, which is the law a revision cannot walk around: a moved due day names
  -- a new date but the same period, and one period takes one accrual and one reversal.
  constraint uq_plan_occurrences_period unique (plan_id, leg, period_key),
  -- One Work is initiated by at most one occurrence.
  constraint uq_plan_occurrences_work unique (work_id),
  constraint uq_plan_occurrences_intent unique (firm_id, client_id, intent_key),
  constraint fk_plan_occurrences_revision foreign key (plan_id, revision, firm_id, client_id)
    references clara.accounting_plan_revisions(plan_id, revision, firm_id, client_id),
  constraint fk_plan_occurrences_work foreign key (work_id, firm_id, client_id)
    references clara.accounting_work(id, firm_id, client_id),
  constraint ck_plan_occurrences_admitted check ((work_id is null) = (admitted_at is null)),
  -- THE REVERSAL LAW, AS DATA (review round 2, BLOCKER-1). An accrual reverses nothing and names
  -- no entry; an ADMITTED reversal must name the entry it reverses. So "a reversal Work exists
  -- whose accrual posted nothing" is not merely refused by a function that could be bypassed —
  -- it is a row this table cannot hold.
  constraint ck_plan_occurrences_reversal_entry check (
    (reverses_entry_id is null or leg = 'reversal')
    and (leg <> 'reversal' or work_id is null or reverses_entry_id is not null)),
  constraint fk_plan_occurrences_entry foreign key (reverses_entry_id)
    references clara.journal_entries(id)
);
comment on table clara.accounting_plan_occurrences is
  '#640: one due event of one plan. unique (plan_id, due_date) is the convergence point for '
  'duplicate scans, unique (plan_id, leg, period_key) is the law a revision cannot walk around, '
  'and unique (work_id) makes "which plan created this Work" single-valued. Append-only apart from '
  'outcome, admitted_at, and — while the row names no Work or names a cancelled/failed one — '
  'revision, intent_key, attempt and work_id.';

alter table clara.accounting_plan_occurrences enable row level security;
alter table clara.accounting_plan_occurrences force row level security;
create policy p_plan_occurrences_owner on clara.accounting_plan_occurrences for all to clara_fn_owner
  using (true) with check (true);

-- NO (plan_id, due_date) INDEX BESIDE THE UNIQUE CONSTRAINT. `uq_plan_occurrences_plan_due`
-- already builds exactly that index, and it is what the scan's `not exists` probe and the
-- preview's `max(due_date)` read; a second one would be an index nobody probes.
create index ix_plan_occurrences_client on clara.accounting_plan_occurrences(client_id, due_date desc);
-- `clara.get_work_plan_origin` resolves a SUPERSEDED attempt's Work too (review finding SHOULD-2),
-- and that lookup is not served by `uq_plan_occurrences_work`: the id it is given is inside the
-- `attempts` array rather than in the `work_id` column. One GIN index makes the containment probe
-- an index scan instead of a sequential read of every occurrence in the estate.
create index ix_plan_occurrences_attempts on clara.accounting_plan_occurrences
  using gin (attempts jsonb_path_ops);

create function clara._tf_plan_occurrences_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_reattempt boolean := false; v_prefix jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'a plan occurrence is never deleted'
      using errcode='CLR08', detail='{"reason":"plan_occurrence_immutable","column":"*"}';
  end if;
  -- THE IDENTITY IS THE PLAN, THE LEG, THE DATE AND THE PERIOD. `revision`, `intent_key` and
  -- `attempt` are deliberately NOT in it (review finding S5): a due event that was refused and is
  -- later re-attempted runs under whatever revision is live THEN, and a row that printed `r1`
  -- while its Work was admitted under `r2` was a record of something that did not happen. They
  -- move only while the row names no Work, so nothing about an admitted occurrence can be edited.
  if row(new.id,new.firm_id,new.client_id,new.plan_id,new.leg,new.due_date,new.period_key,
         new.created_at)
     is distinct from
     row(old.id,old.firm_id,old.client_id,old.plan_id,old.leg,old.due_date,old.period_key,
         old.created_at) then
    raise exception 'a plan occurrence''s identity is immutable'
      using errcode='CLR08', detail='{"reason":"plan_occurrence_immutable"}';
  end if;
  -- WORK IS SET ONCE, WITH ONE NAMED EXIT (review finding S7). A Work a human CANCELLED, or one
  -- that FAILED, posted nothing and leaves the period owed; a catch-up may re-admit it under a new
  -- attempt, which is the ONLY move that also carries the revision, the key and the attempt with it
  -- (they describe the admission, and a re-attempt is a new admission). A COMPLETED Work — or any
  -- Work carrying a committed receipt — never moves: money is on the books and a second admission
  -- would be a second entry for one period.
  v_reattempt := old.work_id is not null and new.work_id is distinct from old.work_id;
  if v_reattempt then
    if not exists (select 1 from clara.accounting_work w
                    where w.id = old.work_id and w.status in ('cancelled','failed'))
       or exists (select 1 from clara.operation_receipts rc
                   where rc.work_id = old.work_id and rc.outcome = 'committed') then
      raise exception 'a plan occurrence names its accounting work exactly once'
        using errcode='CLR08', detail='{"reason":"plan_occurrence_work_set_once"}';
    end if;
    if new.attempt <= old.attempt then
      raise exception 'a re-admitted plan occurrence must count its attempt'
        using errcode='CLR08', detail='{"reason":"plan_occurrence_attempt"}';
    end if;
  elsif old.work_id is not null
        and row(new.revision,new.intent_key,new.attempt,new.reverses_entry_id)
            is distinct from row(old.revision,old.intent_key,old.attempt,old.reverses_entry_id) then
    raise exception 'an admitted plan occurrence''s revision, intent key, attempt and reversed entry are immutable'
      using errcode='CLR08', detail='{"reason":"plan_occurrence_immutable"}';
  end if;
  -- THE ATTEMPT LEDGER IS APPEND-ONLY (review finding SHOULD-2). It may GROW — every admission
  -- adds the attempt it ran — and what is already in it is frozen: a history that could be rewritten
  -- would be no more use than the one that dropped the superseded Work altogether.
  if new.attempts is distinct from old.attempts then
    if jsonb_array_length(new.attempts) < jsonb_array_length(old.attempts) then
      raise exception 'a plan occurrence''s attempt history is append-only'
        using errcode='CLR08', detail='{"reason":"plan_occurrence_attempts_append_only"}';
    end if;
    v_prefix := coalesce((select jsonb_agg(t.e order by t.ord)
                            from jsonb_array_elements(new.attempts) with ordinality t(e, ord)
                           where t.ord <= jsonb_array_length(old.attempts)), '[]'::jsonb);
    if v_prefix is distinct from old.attempts then
      raise exception 'a plan occurrence''s recorded attempts are immutable'
        using errcode='CLR08', detail='{"reason":"plan_occurrence_attempts_append_only"}';
    end if;
    if new.work_id is not distinct from old.work_id then
      raise exception 'a plan occurrence records an attempt only when it admits one'
        using errcode='CLR08', detail='{"reason":"plan_occurrence_attempts_append_only"}';
    end if;
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

-- The ACCRUAL whose reversal falls on `p_reversal`, or NULL when no accrual of this schedule
-- reverses on that day. A reversal is the first day of the month after its accrual, so the accrual
-- is the latest one at or before the day before it — and the answer is CHECKED by recomputing the
-- reversal rather than assumed from the arithmetic.
create function clara._plan_primary_for_reversal(p_from date, p_freq text, p_day_rule text,
    p_dom int, p_reversal date)
  returns date language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_k int; v_d date;
begin
  if p_reversal is null then return null; end if;
  v_k := clara._plan_due_index_on_or_before(p_from, p_freq, p_day_rule, p_dom, p_reversal - 1);
  if v_k is null then return null; end if;
  v_d := clara._plan_due_nth(p_from, p_freq, p_day_rule, p_dom, v_k);
  if v_d is null or clara._plan_reversal_date(v_d) <> p_reversal then return null; end if;
  return v_d;
end $$;
revoke all on function clara._plan_primary_for_reversal(date,text,text,int,date) from public;

-- WHICH JOURNAL ENTRY DOES THIS PLAN'S ACCRUAL FOR `p_due` LEAVE TO BE REVERSED? NULL when there
-- is none, and NULL is the whole wall (review round 2, BLOCKER-1).
--
-- The first cut of this rule asked whether the accrual "stands" — admitted, and its Work not a
-- terminal dead end. That was measured to be too weak by a wide margin: "stands" was evaluated
-- ONCE, at the reversal's ADMISSION, and a `queued` accrual with zero receipts satisfied it. So a
-- reversal Work was admitted while the accrual had posted nothing; when the accrual then died
-- (0184's `cancel_accounting_work`, or a settle `failed` on a locked period) NOTHING revoked the
-- reversal, and it went on to post `Dr 1150 / Cr 6100` reversing an entry that never existed.
--
-- The fact a reversal actually needs is therefore MONEY ON THE BOOKS: the accrual's Work carries a
-- COMMITTED operation receipt (0178's `ck_operation_receipts_outcome_shape` guarantees such a
-- receipt NAMES its entry), and that entry is still LIVE — approved, and not itself already
-- reversed, which is what `clara.journal_entries.reversed_by` records for every correction lane in
-- the estate. Returning the ENTRY rather than a boolean is the other half: the caller writes it
-- onto the occurrence and into the reversal's basis, so the posted reversal names what it reverses.
--
-- THE ENTRY ID IS COMPARED AS TEXT, never cast. `effects->>'entry_id'` is free text as far as the
-- type system is concerned, and a `::uuid` cast in a predicate is a 22P02 waiting for the first
-- receipt some other lane writes with a non-uuid effect — an unclassifiable error out of the scan.
create function clara._plan_primary_entry(p_plan uuid, p_due date) returns uuid
  language sql stable security definer set search_path = clara, pg_temp as $$
  select je.id
    from clara.accounting_plan_occurrences o
    join clara.operation_receipts rc on rc.work_id = o.work_id and rc.outcome = 'committed'
    join clara.journal_entries je on je.id::text = rc.effects ->> 'entry_id'
   where o.plan_id = p_plan and o.due_date = p_due and o.leg = 'primary'
     and je.status = 'approved' and je.reversed_by is null
   order by rc.created_at
   limit 1;
$$;
revoke all on function clara._plan_primary_entry(uuid,date) from public;

-- MAY THIS WORK STILL POST? The one place a plan still reads a Work's STATUS, and it names 0184's
-- transient `stopping` explicitly (review NOTE-2): a Work whose run has been asked to stop is on
-- its way to `cancelled` and `clara._record_journal_entry_core` already refuses `work_cancelled`
-- for it, so counting it as live would let a frequency change walk over a period whose only Work is
-- dying. A Work that already holds a committed receipt is live whatever its status says — money is
-- on the books.
create function clara._plan_work_stands(p_work uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.accounting_work w
     where w.id = p_work
       and (w.status not in ('cancelled','failed','stopping')
            or exists (select 1 from clara.operation_receipts rc
                        where rc.work_id = w.id and rc.outcome = 'committed')));
$$;
revoke all on function clara._plan_work_stands(uuid) from public;

-- THE PERIOD a date belongs to, as the first day of that period's first month, aligned on the
-- ANCHOR month rather than on the calendar: a quarterly plan anchored in February has periods
-- Feb-Apr, May-Jul, … and `date_trunc('quarter', …)` would answer Jan, Apr, … instead. The anchor
-- is the PLAN's `authority_from`, which a revision cannot move (review finding B1/B3).
create function clara._plan_period_start(p_anchor date, p_freq text, p_on date) returns date
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_step int; v_anchor date; v_months int; v_k int;
begin
  if p_anchor is null or p_on is null then return null; end if;
  v_step := case p_freq when 'monthly' then 1 when 'quarterly' then 3 when 'annual' then 12 else null end;
  if v_step is null then return null; end if;
  v_anchor := date_trunc('month', p_anchor::timestamp)::date;
  v_months := (extract(year from p_on)::int - extract(year from v_anchor)::int) * 12
            + (extract(month from p_on)::int - extract(month from v_anchor)::int);
  -- FLOOR, not truncate-toward-zero: a date before the anchor belongs to an earlier period, and
  -- PostgreSQL's integer division would pull it forward into the anchor's own.
  v_k := case when v_months >= 0 then v_months / v_step
              else -(((-v_months) + v_step - 1) / v_step) end;
  return (v_anchor + ((v_k * v_step) * interval '1 month'))::date;
end $$;
revoke all on function clara._plan_period_start(date,text,date) from public;

-- The period key ONE due event carries. For a reversal it is its ACCRUAL's period, so the two legs
-- of one period share a key and `unique (plan_id, leg, period_key)` binds each of them once.
create function clara._plan_occurrence_period_key(p_anchor date, p_from date, p_freq text,
    p_day_rule text, p_dom int, p_due date, p_leg text)
  returns date language plpgsql immutable security definer set search_path = clara, pg_temp as $$
declare v_primary date;
begin
  if p_leg = 'reversal' then
    v_primary := clara._plan_primary_for_reversal(p_from, p_freq, p_day_rule, p_dom, p_due);
    -- A reversal whose accrual this schedule does not produce keys on its own date rather than on
    -- nothing: the column is NOT NULL and a refusal must still be recordable.
    return clara._plan_period_start(p_anchor, p_freq, coalesce(v_primary, p_due));
  end if;
  return clara._plan_period_start(p_anchor, p_freq, p_due);
end $$;
revoke all on function clara._plan_occurrence_period_key(date,date,text,text,int,date,text) from public;

-- HOW FAR HAS THIS PLAN ALREADY RUN, in calendar days rather than in keys (review finding
-- SHOULD-1)? `unique (plan_id, leg, period_key)` is exact PER ALIGNMENT and blind ACROSS
-- alignments: the key is computed from the LIVE revision's frequency, so a monthly September and a
-- quarterly August-to-October are two different keys naming one September, and a frequency change
-- therefore re-covered periods that had already posted (measured in both directions, through the
-- plain scan, with no catch-up anywhere). Each occurrence is measured under the frequency of the
-- revision that ADMITTED it, which is the only alignment its key was ever computed in, and only
-- while its Work still stands — a period whose Work died posted nothing and is genuinely still
-- owed.
create function clara._plan_covered_through(p_plan uuid) returns date
  language sql stable security definer set search_path = clara, pg_temp as $$
  select max((o.period_key
              + (case rv.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end)
                * interval '1 month' - interval '1 day')::date)
    from clara.accounting_plan_occurrences o
    join clara.accounting_plan_revisions rv on rv.plan_id = o.plan_id and rv.revision = o.revision
   where o.plan_id = p_plan and o.work_id is not null and clara._plan_work_stands(o.work_id);
$$;
revoke all on function clara._plan_covered_through(uuid) from public;

-- THE WINDOW CEILING ONE LEG MAY REACH (review finding S6). A reversing plan whose `effective_to`
-- is its LAST ACCRUAL's own day had that accrual admitted and its reversal refused
-- `outside_authority_window` forever: the reversal is always in the following month, so a ceiling
-- of `effective_to` excludes it by construction. An authority that ends on the last accrual must
-- still let that accrual be undone.
create function clara._plan_window_ceiling(p_effective_to date, p_auto_reverse boolean) returns date
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case when p_effective_to is null then 'infinity'::date
              when p_auto_reverse then clara._plan_reversal_date(p_effective_to)
              else p_effective_to end;
$$;
revoke all on function clara._plan_window_ceiling(date,boolean) from public;

-- The basis ONE occurrence posts: the revision's basis with this event's posting date, and — for a
-- reversal leg — with every line's two sides EXCHANGED. Exchanging sides preserves the balance
-- exactly (the sums swap), so a basis that passed `_assert_journal_basis` still passes reversed.
--
-- A REVERSAL'S BASIS NAMES THE ENTRY IT REVERSES, IN THE MEMO (review round 2, BLOCKER-1) — and
-- the memo rather than a new key is a MEASURED constraint, not a stylistic choice. The first cut
-- put `reverses_entry_id` beside `posting_date` as a top-level key, reasoning that
-- `clara._journal_basis_canonical` hashes only posting_date/memo/currency/lines so the digest would
-- be unaffected. It is unaffected — and the reversal still could not post: the FROZEN tool schema
-- `claraWork.v1.tools.ts` declares `journalBasisSchema` `.strict()`, so the run's faithful echo of
-- a basis carrying an unknown key fails validation before it reaches the database, and the Work
-- settles `failed`/`no_effect` with nothing to point at. `packages/runtime/tests/
-- plan-occurrence-e2e.mjs` leg 5 measured exactly that, which is why that leg posts the reversal
-- instead of stopping at its admission.
--
-- The memo is inside the canonical form, so it rides the digest the run is bound to, and it is the
-- ONE field of the basis that reaches the books: `clara.journal_entries.memo` carries it, so the
-- posted reversal names the entry it reverses in the ledger itself rather than only in a row beside
-- it. Appended only when it FITS under `_assert_journal_basis`'s 4000-character memo cap; over that
-- the memo is left alone and the structural link is still on the occurrence row, because a plan
-- whose memo is 3990 characters long must not become unable to reverse anything.
create function clara._plan_occurrence_basis(p_basis jsonb, p_due date, p_leg text,
    p_reverses_entry uuid default null) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when p_leg = 'reversal' and p_reverses_entry is not null
         and char_length(btrim(coalesce(b.j ->> 'memo',''))) + 58 <= 4000
      then jsonb_set(b.j, '{memo}',
             to_jsonb(btrim(coalesce(b.j ->> 'memo','')) || ' (reversal of entry '
                      || p_reverses_entry::text || ')'))
    else b.j end
  from (select jsonb_set(
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
    '{posting_date}', to_jsonb(to_char(p_due, 'YYYY-MM-DD'))) as j) b;
$$;
revoke all on function clara._plan_occurrence_basis(jsonb,date,text,uuid) from public;

-- THE ONE EVENT A SCAN CONSIDERS, chosen against the plan's OWN occurrence rows. Pure arithmetic
-- cannot make this choice: whether period k's reversal is admissible depends on whether period k's
-- accrual has POSTED, and whether a due day is a new event at all depends on whether its PERIOD
-- already ran under an earlier schedule. The first is a fact in `clara.operation_receipts` and
-- `clara.journal_entries`, the second in `clara.accounting_plan_occurrences`, so this function is
-- STABLE and reads them. The pure `_plan_due_*` helpers above supply only the dates. (There is no
-- second arithmetic-only picker beside this one; review round 1 deleted the one there was.)
--
-- THE ORDER IS THE BOOKS' ORDER: when both an accrual and a reversal are outstanding the EARLIER
-- date wins, so last period's reversal lands before this period's accrual.
create function clara._plan_admissible_event(p_plan uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  r record; p record; v_today date; v_ceiling date; v_k int; v_kr int;
  v_dp date; v_dr date; v_primary date; v_reversal date; v_reversal_k int;
begin
  select * into p from clara.accounting_plans where id = p_plan;
  if not found then return null; end if;
  select * into r from clara.accounting_plan_revisions
   where plan_id = p_plan and superseded_at is null;
  if not found then return null; end if;
  -- THE HOUSE LEGAL DATE, FROM THE ONE BODY THAT OWNS IT (0042 S5.20). clara._book_today() IS
  -- `(statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date`, and `revisions.timezone`
  -- is a one-member CHECK holding that same zone, so this answers exactly what the spelled
  -- `(now() at time zone r.timezone)::date` answered -- with two differences, both wanted:
  -- the authority samples per STATEMENT rather than per transaction (round-7 finding C: a scan
  -- that opened before MYT midnight must not go on calling yesterday "today"), and there is now
  -- one body owning the conversion instead of a second copy in this lane.
  v_today := clara._book_today();
  v_ceiling := least(v_today, clara._plan_window_ceiling(r.effective_to, r.auto_reverse));
  v_k := clara._plan_due_index_on_or_before(r.effective_from, r.frequency, r.day_rule,
           r.day_of_month, least(v_today, coalesce(r.effective_to, 'infinity'::date)));

  -- THE PRIMARY CANDIDATE — the LATEST accrual at or before today, and only when neither its date
  -- nor its PERIOD has an occurrence of that leg.
  if v_k is not null then
    v_dp := clara._plan_due_nth(r.effective_from, r.frequency, r.day_rule, r.day_of_month, v_k);
    if v_dp is not null
       and not exists (select 1 from clara.accounting_plan_occurrences o
                        where o.plan_id = p_plan and o.due_date = v_dp)
       and not exists (select 1 from clara.accounting_plan_occurrences o
                        where o.plan_id = p_plan and o.leg = 'primary'
                          and o.period_key = clara._plan_occurrence_period_key(
                                p.authority_from, r.effective_from, r.frequency, r.day_rule,
                                r.day_of_month, v_dp, 'primary')) then
      v_primary := v_dp;
    end if;
  end if;

  -- THE REVERSAL CANDIDATE — the OLDEST eligible one, probing k-1 before k. Only those two
  -- periods can have a reversal at or before today, because a reversal falls in the month after its
  -- accrual. ELIGIBLE means: its own accrual has POSTED a journal entry that is still live, its
  -- date is free, and its period's reversal leg is free.
  if r.auto_reverse and v_k is not null then
    foreach v_kr in array (case when v_k > 0 then array[v_k - 1, v_k] else array[v_k] end) loop
      v_dp := clara._plan_due_nth(r.effective_from, r.frequency, r.day_rule, r.day_of_month, v_kr);
      continue when v_dp is null or v_dp < r.effective_from;
      v_dr := clara._plan_reversal_date(v_dp);
      continue when v_dr is null or v_dr > v_ceiling;
      -- ELIGIBILITY IS "THE ACCRUAL POSTED AN ENTRY THAT IS STILL THERE", not "an occurrence names
      -- a Work" and not "that Work has not died yet": both of those were true of a `queued` accrual
      -- that went on to be cancelled, and the reversal admitted behind it posted a naked leg.
      continue when clara._plan_primary_entry(p_plan, v_dp) is null;
      continue when exists (select 1 from clara.accounting_plan_occurrences o
                             where o.plan_id = p_plan and o.due_date = v_dr);
      continue when exists (select 1 from clara.accounting_plan_occurrences o
                             where o.plan_id = p_plan and o.leg = 'reversal'
                               and o.period_key = clara._plan_occurrence_period_key(
                                     p.authority_from, r.effective_from, r.frequency, r.day_rule,
                                     r.day_of_month, v_dr, 'reversal'));
      v_reversal := v_dr; v_reversal_k := v_kr;
      exit;
    end loop;
  end if;

  if v_primary is not null and (v_reversal is null or v_primary <= v_reversal) then
    return jsonb_build_object('due_date', to_char(v_primary,'YYYY-MM-DD'), 'leg', 'primary', 'k', v_k);
  end if;
  if v_reversal is not null then
    return jsonb_build_object('due_date', to_char(v_reversal,'YYYY-MM-DD'), 'leg', 'reversal',
      'k', v_reversal_k);
  end if;
  return null;
end $$;
revoke all on function clara._plan_admissible_event(uuid) from public;

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
create function clara._plan_admit_occurrence(p_plan uuid, p_due date, p_leg text, p_model text,
    p_allow_reattempt boolean default false)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  p record; r record; o record; v_existing boolean := false;
  v_basis jsonb; v_intent text; v_answer jsonb; v_occ uuid;
  v_client_status text; v_detail text; v_reason text;
  v_code text; v_message text; v_outcome jsonb;
  v_period date; v_primary_due date; v_ceiling date; v_attempt int := 1;
  v_old_work uuid; v_old_status text; v_reattempt boolean := false;
  v_primary_entry uuid; v_primary_state text;
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
  -- The authority window, re-asserted at the moment of admission rather than trusted from the
  -- caller's arithmetic. A future schedule never authorises a historical run and an ended window
  -- never authorises a later one — EXCEPT that a reversing plan's ceiling reaches the reversal of
  -- its last accrual (review finding S6), because an authority that ends on the last accrual must
  -- still let that accrual be undone.
  v_ceiling := case when p_leg = 'reversal'
                    then clara._plan_window_ceiling(r.effective_to, r.auto_reverse)
                    else coalesce(r.effective_to, 'infinity'::date) end;
  if p_due < r.effective_from or p_due > v_ceiling then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'outside_authority_window',
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
      'leg_ceiling', case when v_ceiling = 'infinity'::date then null else to_char(v_ceiling,'YYYY-MM-DD') end);
  end if;
  -- THE DUE GATE, on the house legal date (see clara._plan_admissible_event above). A plan due
  -- TOMORROW in Kuala Lumpur is not admitted today, whatever zone the session opened in.
  if p_due > clara._book_today() then
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
  v_period := clara._plan_occurrence_period_key(p.authority_from, r.effective_from, r.frequency,
                r.day_rule, r.day_of_month, p_due, p_leg);

  if v_existing and o.work_id is not null then
    -- A RE-ATTEMPT IS THE ONE EXIT FROM CONVERGENCE (review finding S7), and only a human's
    -- catch-up may ask for it: a Work the human CANCELLED, or one that FAILED, posted nothing and
    -- leaves the period owed. A COMPLETED Work, or any Work carrying a committed receipt, converges
    -- as before — money is on the books.
    v_old_work := o.work_id;
    select w.status into v_old_status from clara.accounting_work w where w.id = v_old_work;
    v_reattempt := p_allow_reattempt
      and v_old_status in ('cancelled','failed')
      and not exists (select 1 from clara.operation_receipts rc
                       where rc.work_id = v_old_work and rc.outcome = 'committed');
    if not v_reattempt then
      return jsonb_build_object('admitted', false, 'converged', true, 'plan_id', p.id,
        'occurrence_id', o.id, 'work_id', o.work_id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'),
        'leg', o.leg, 'revision', o.revision, 'intent_key', o.intent_key, 'outcome', o.outcome);
    end if;
    v_attempt := o.attempt + 1;
  end if;

  -- ONE PERIOD, ONE LEG, ONE OCCURRENCE (review finding B1). A revision that moves the due day
  -- names a NEW date for a period that already ran, and admitting it would post a second entry for
  -- one period. Refused BEFORE any row is written, because a second row for the same period is not
  -- a due event to record — it is the same event under a different spelling.
  if not v_existing and exists (
        select 1 from clara.accounting_plan_occurrences o2
         where o2.plan_id = p.id and o2.leg = p_leg and o2.period_key = v_period) then
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'reason', 'period_already_admitted',
      'code', 'CLR13', 'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg,
      'period_key', to_char(v_period,'YYYY-MM-DD'),
      'occurrence_id', (select o2.id from clara.accounting_plan_occurrences o2
                         where o2.plan_id = p.id and o2.leg = p_leg and o2.period_key = v_period
                         limit 1));
  end if;

  -- THE ENTRY A REVERSAL WOULD UNDO, measured HERE — under the plan row lock, in the same
  -- statement sequence that writes the occurrence — rather than inherited from the picker's
  -- unlocked choice (review round 2, BLOCKER-1).
  if p_leg = 'reversal' then
    v_primary_due := clara._plan_primary_for_reversal(r.effective_from, r.frequency, r.day_rule,
                       r.day_of_month, p_due);
    if v_primary_due is not null then
      v_primary_entry := clara._plan_primary_entry(p.id, v_primary_due);
    end if;
  end if;
  v_basis := clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry);
  v_intent := 'plan:' || p.id::text || ':r' || r.revision::text || ':' || to_char(p_due,'YYYY-MM-DD')
              || case when v_attempt > 1 then ':a' || v_attempt::text else '' end;

  if v_existing then
    -- A previously REFUSED occurrence, or a cancelled/failed one being re-attempted. The identity
    -- stays; the revision, the key and the attempt move to what this admission actually runs under,
    -- which is the whole of review finding S5 — a row printing `r1` beside a Work admitted under
    -- `r2` was a record of something that did not happen.
    --
    -- A RE-ATTEMPT WRITES THEM WITH THE NEW WORK, IN ONE STATEMENT (below), because the row still
    -- names the cancelled Work at this point and the identity trigger admits those three columns
    -- moving only alongside a lawful `work_id` move.
    v_occ := o.id;
    if not v_reattempt then
      update clara.accounting_plan_occurrences
         set revision = r.revision, intent_key = v_intent, attempt = v_attempt
       where id = v_occ;
    end if;
  else
    insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
        due_date, period_key, attempt, intent_key, outcome)
      values (p.firm_id, p.client_id, p.id, r.revision, p_leg, p_due, v_period, v_attempt, v_intent,
        jsonb_build_object('state','pending','at', now()))
      returning id into v_occ;
  end if;

  -- THE ORPHAN WALL (review finding B2, recut on BLOCKER-1's law). A reversal exists to undo its
  -- OWN period's accrual, so admitting one with no POSTED accrual behind it would put a
  -- swapped-sides entry in the ledger reversing nothing. `clara._plan_admissible_event` never
  -- surfaces such an event, and this is the same wall for the path a HUMAN can reach: a catch-up
  -- window naming only the reversal day. Recorded on the occurrence rather than raised, so it is
  -- legible in the history — and the SAME row becomes admissible once the accrual posts.
  --
  -- `primary_state` NAMES WHICH OF THE THREE WAYS the accrual fails to stand behind it, because
  -- "no occurrence at all", "admitted but nothing posted yet" and "posted and since reversed" are
  -- three different facts about the books and the operator's next move differs for each.
  if p_leg = 'reversal' and v_primary_entry is null then
    v_primary_state := case
      when v_primary_due is null then 'no_schedule'
      when not exists (select 1 from clara.accounting_plan_occurrences o2
                        where o2.plan_id = p.id and o2.due_date = v_primary_due
                          and o2.leg = 'primary' and o2.work_id is not null) then 'no_occurrence'
      when not exists (select 1 from clara.accounting_plan_occurrences o2
                        join clara.operation_receipts rc on rc.work_id = o2.work_id
                                                        and rc.outcome = 'committed'
                        where o2.plan_id = p.id and o2.due_date = v_primary_due
                          and o2.leg = 'primary') then 'not_posted'
      else 'entry_not_live' end;
    v_outcome := jsonb_build_object('state','refused','code','CLR13',
      'reason','reversal_before_primary',
      'message','this reversal has no posted accrual behind it to reverse',
      'primary_state', v_primary_state,
      'primary_due_date', case when v_primary_due is null then null
                               else to_char(v_primary_due,'YYYY-MM-DD') end,
      'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', 'reversal_before_primary', 'code', 'CLR13', 'primary_state', v_primary_state,
      'primary_due_date', case when v_primary_due is null then null
                               else to_char(v_primary_due,'YYYY-MM-DD') end);
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
  -- ONE STATEMENT: the Work, the entry it reverses, and the attempt appended to the occurrence's
  -- own append-only ledger (review finding SHOULD-2) — so the superseded attempt of an S7
  -- re-admission stays reachable from the plan instead of surviving only in clara.audit_log.
  update clara.accounting_plan_occurrences
     set work_id = (v_answer->>'work_id')::uuid, admitted_at = now(), outcome = v_outcome,
         revision = r.revision, intent_key = v_intent, attempt = v_attempt,
         reverses_entry_id = v_primary_entry,
         attempts = attempts || jsonb_build_array(jsonb_build_object(
           'attempt', v_attempt, 'work_id', v_answer->>'work_id', 'intent_key', v_intent,
           'revision', r.revision, 'admitted_at', now()))
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
    'attempt', v_attempt, 'period_key', to_char(v_period,'YYYY-MM-DD'),
    'reverses_entry_id', v_primary_entry,
    'intent_key', v_intent);
end $$;
revoke all on function clara._plan_admit_occurrence(uuid,date,text,text,boolean) from public;

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
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, v_firm, p_client, p_kind, 'active', btrim(p_purpose), p_authority_kind,
      p_authority_ref, v_actor, p_effective_from, 1, v_actor);
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
  v_covered date; v_first date; v_earliest date;
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
  -- THE AUTHORITY FLOOR (review finding B3). A revision changes the SCHEDULE; it cannot move the
  -- day a human authorised this plan from. Without this, a plan created with today's authority
  -- could be revised to 2020 and then "catch up" a decade of back-dated Work — the catch-up wall
  -- reads the live revision, and the live revision was whatever the last caller said.
  if p_effective_from < p.authority_from then
    raise exception 'this plan was authorised from %; a revision cannot start earlier',
      to_char(p.authority_from,'YYYY-MM-DD')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','effective_from_before_authority',
          'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
          'requested_from', to_char(p_effective_from,'YYYY-MM-DD'))::text;
  end if;
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
  -- …AND THE STATUS IS RE-READ UNDER IT (review finding S4). The test above was made on an
  -- UNLOCKED read, so an `end_accounting_plan` committing in the window between the two could hand
  -- an ended plan a fresh live revision. pause/resume/end all re-read under this lock; so does this.
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status = 'ended' then
    raise exception 'an ended accounting plan cannot be revised' using errcode='CLR10',
      detail='{"reason":"plan_ended"}';
  end if;
  select * into cur from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision to supersede' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;
  -- THE ALIGNMENT WALL (review finding SHOULD-1). A frequency change RE-ALIGNS every period key,
  -- and `unique (plan_id, leg, period_key)` is exact per alignment and blind across alignments: a
  -- monthly September (`2026-09-01`) and a quarterly August-to-October (`2026-08-01`) are two
  -- different keys naming one September, so a plan that had already posted September posted it
  -- again on the very next scan. Measured in BOTH directions. Refused rather than clamped, and
  -- named: a revision whose new alignment's FIRST period would start on or before the end of the
  -- last period this plan has already run is asking for a second entry in a period that has one.
  --
  -- IT IS THE FREQUENCY CHANGE THAT IS WALLED, not every revision: with the frequency unchanged
  -- the alignment is unchanged, and review finding B1's `period_already_admitted` already binds a
  -- moved due DAY inside a period that has run.
  if p_frequency is distinct from cur.frequency then
    v_covered := clara._plan_covered_through(p_plan);
    if v_covered is not null then
      v_first := clara._plan_period_start(p.authority_from, p_frequency, p_effective_from);
      if v_first <= v_covered then
        -- THE DATE THE REFUSAL OFFERS IS ONE THIS SAME WALL WOULD ACCEPT, computed rather than
        -- guessed: `covered_through + 1` can still fall INSIDE a new-alignment period that began
        -- earlier (a quarterly period starting in July covers a September that a monthly schedule
        -- covered through August), and advertising a date that would be refused again is worse
        -- than advertising none.
        v_earliest := clara._plan_period_start(p.authority_from, p_frequency, v_covered + 1);
        if v_earliest <= v_covered then
          v_earliest := (v_earliest + (case p_frequency when 'monthly' then 1
                                                        when 'quarterly' then 3 else 12 end)
                         * interval '1 month')::date;
        end if;
        raise exception 'this plan has already run through %; a % schedule starting % would cover the period beginning % a second time',
          to_char(v_covered,'YYYY-MM-DD'), p_frequency, to_char(p_effective_from,'YYYY-MM-DD'),
          to_char(v_first,'YYYY-MM-DD')
          using errcode='CLR10',
            detail=jsonb_build_object('reason','period_already_covered',
              'covered_through', to_char(v_covered,'YYYY-MM-DD'),
              'period_start', to_char(v_first,'YYYY-MM-DD'),
              'frequency', p_frequency,
              'earliest_effective_from', to_char(v_earliest,'YYYY-MM-DD'))::text;
      end if;
    end if;
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
  v_today := clara._book_today();  -- the house legal date (0042 S5.20), not the session's
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
  -- THE CEILING IS LEG-AWARE (review finding S6): a reversing plan's last accrual may sit ON
  -- `effective_to`, and its reversal is in the following month. `least(p_to, …)` still holds the
  -- human's own window, and `p_to` itself was already refused above if it reached past today.
  for e in select * from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule,
             r.day_of_month, r.auto_reverse, greatest(p_from, r.effective_from),
             least(p_to, clara._plan_window_ceiling(r.effective_to, r.auto_reverse)), 12) loop
    -- A CATCH-UP IS THE ONE CALLER ALLOWED TO RE-ATTEMPT a cancelled or failed period's Work
    -- (review finding S7). The scan never is: an automatic re-admission of something a human
    -- cancelled would be the lane overruling them.
    v_answer := clara._plan_admit_occurrence(p_plan, e.due_date, e.leg, clara._plan_run_model(),
                  p_allow_reattempt => true);
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
  -- The leg-aware ceiling, so a reversing plan's final reversal appears in the preview too.
  if r.effective_to is not null then
    v_end := least(v_end, clara._plan_window_ceiling(r.effective_to, r.auto_reverse));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg,
           'basis', clara._plan_occurrence_basis(r.basis, e.due_date, e.leg)) order by e.due_date),
         '[]'::jsonb) into v_rows
    from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule, r.day_of_month,
           r.auto_reverse, v_start, v_end, v_count) e;
  return jsonb_build_object('plan_id', p_plan, 'status', p.status, 'revision', r.revision,
    'timezone', r.timezone, 'today', to_char(clara._book_today(),'YYYY-MM-DD'),
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
            coalesce(r.effective_to, (greatest(r.effective_from, clara._book_today()) + 3650)),
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
        v_covered date;
begin
  select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('viewer')) c;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;
  v_covered := clara._plan_covered_through(p_plan);
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
    'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
    -- HOW FAR THIS PLAN HAS ALREADY RUN (review finding SHOULD-1). The revise form mirrors the
    -- alignment wall against it, so a frequency change that would cover a posted period again is
    -- named at the control rather than arriving as a refusal.
    'covered_through', case when v_covered is null then null else to_char(v_covered,'YYYY-MM-DD') end,
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
           'period_key', to_char(o.period_key,'YYYY-MM-DD'), 'attempt', o.attempt,
           'revision', o.revision, 'intent_key', o.intent_key, 'work_id', o.work_id,
           'admitted_at', o.admitted_at, 'outcome', o.outcome, 'created_at', o.created_at,
           'work_status', w.status, 'work_error', w.error,
           -- THE ENTRY THIS LEG UNDOES, and EVERY attempt this due event took — the two facts
           -- review round 2 added (BLOCKER-1, SHOULD-2). `attempts` is why a cancelled attempt is
           -- still reachable from the plan rather than only from clara.audit_log.
           'reverses_entry_id', o.reverses_entry_id, 'attempts', o.attempts,
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
--
-- A SUPERSEDED ATTEMPT STILL RESOLVES (review finding SHOULD-2). An S7 re-attempt moves `work_id`
-- to the new Work, and until this round the cancelled one answered NULL here — so the Work detail
-- of a plan Work a human had cancelled said it came from nowhere. The occurrence's append-only
-- `attempts` ledger is consulted too, and the answer SAYS which case it is: `superseded` plus the
-- attempt number, with `work_id` naming the attempt that replaced it.
create function clara.get_work_plan_origin(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_out jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  select jsonb_build_object(
      'plan_id', p.id, 'purpose', p.purpose, 'kind', p.kind, 'status', p.status,
      'occurrence_id', o.id, 'revision', o.revision, 'leg', o.leg,
      'due_date', to_char(o.due_date,'YYYY-MM-DD'), 'authorised_by', p.authorised_by,
      'authority_kind', p.authority_kind,
      'work_id', o.work_id,
      'superseded', (o.work_id is distinct from p_work),
      'attempt', coalesce((select (a.e ->> 'attempt')::int
                             from jsonb_array_elements(o.attempts) a(e)
                            where a.e ->> 'work_id' = p_work::text
                            limit 1),
                          case when o.work_id = p_work then o.attempt else null end))
    into v_out
    from clara.accounting_plan_occurrences o
    join clara.accounting_plans p on p.id = o.plan_id
   where o.firm_id = v_firm
     and (o.work_id = p_work
          or o.attempts @> jsonb_build_array(jsonb_build_object('work_id', p_work::text)));
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
    -- THE CANDIDATE IS `clara._plan_admissible_event`'s, not pure arithmetic's: it is the function
    -- that knows a reversal needs an ADMITTED accrual behind it and that a moved due day does not
    -- make an already-run period due again. The revision join stays so a plan with no live revision
    -- is not a candidate at all (and `ix_plan_revisions_live` still serves the gate); every other
    -- filter now lives inside the picker, which is the one place that choice is made.
    select p.id as plan_id, (x.e->>'due_date')::date as due_date, x.e->>'leg' as leg
      from clara.accounting_plans p
      join clara.accounting_plan_revisions r on r.plan_id = p.id and r.superseded_at is null
      join clara.clients cl on cl.id = p.client_id and cl.firm_id = p.firm_id
      cross join lateral (select clara._plan_admissible_event(p.id) as e) x
     where p.status = 'active' and cl.status = 'active' and x.e is not null
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
  -- The accrual a reversal undoes, and the honest NULL for a day this schedule reverses nothing on.
  if clara._plan_primary_for_reversal(date '2026-06-30','monthly','last_day_of_month',null,
        date '2026-10-01') <> date '2026-09-30' then
    raise exception '#640 tail: the accrual behind a reversal is computed wrong (got %)',
      clara._plan_primary_for_reversal(date '2026-06-30','monthly','last_day_of_month',null, date '2026-10-01')
      using errcode='CLR10';
  end if;
  if clara._plan_primary_for_reversal(date '2026-06-30','monthly','last_day_of_month',null,
        date '2026-10-02') is not null then
    raise exception '#640 tail: a day this schedule reverses nothing on must answer NULL'
      using errcode='CLR10';
  end if;
  -- The period a date belongs to, ANCHORED rather than calendar-quartered: a quarterly plan
  -- anchored in February has periods Feb-Apr, May-Jul, …
  if clara._plan_period_start(date '2026-02-10','quarterly',date '2026-04-30') <> date '2026-02-01' then
    raise exception '#640 tail: quarterly period alignment is wrong (got %)',
      clara._plan_period_start(date '2026-02-10','quarterly',date '2026-04-30') using errcode='CLR10';
  end if;
  if clara._plan_period_start(date '2026-02-10','quarterly',date '2026-05-01') <> date '2026-05-01' then
    raise exception '#640 tail: the next quarterly period does not start where it should' using errcode='CLR10';
  end if;
  if clara._plan_period_start(date '2026-02-10','monthly',date '2026-01-31') <> date '2026-01-01' then
    raise exception '#640 tail: a date BEFORE the anchor must floor into its own earlier period'
      using errcode='CLR10';
  end if;
  -- The reversing plan's leg ceiling reaches the reversal of its last accrual.
  if clara._plan_window_ceiling(date '2026-09-30', true) <> date '2026-10-01'
     or clara._plan_window_ceiling(date '2026-09-30', false) <> date '2026-09-30' then
    raise exception '#640 tail: the leg-aware window ceiling is wrong' using errcode='CLR10';
  end if;
  if clara._plan_due_index_on_or_before(date '2026-06-15','monthly','day_of_month',15,date '2026-06-14')
     is not null then
    raise exception '#640 tail: a schedule produced a due day before its own effective_from'
      using errcode='CLR10';
  end if;
  -- The reversing schedule really does put 2026-07-31's accrual's reversal on 2026-08-01, read
  -- through the two functions the lane actually uses rather than through a retired helper.
  if clara._plan_reversal_date(clara._plan_due_nth(date '2026-06-30','monthly','last_day_of_month',
        null, 1)) <> date '2026-08-01' then
    raise exception '#640 tail: a reversing schedule''s 2026-07-31 accrual does not reverse on 2026-08-01'
      using errcode='CLR10';
  end if;

  -- 6 · NOTHING OF 0045's WAS TOUCHED, and this is now PROVEN rather than claimed (review
  --     finding S8: the comment used to say four relations and five doors while the code counted
  --     three relations and zero doors). The three relations must still be present, and the five
  --     doors must hash BYTE-IDENTICALLY to the digests §0 took before this file created anything.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname in ('adjustment_templates','adjustment_runs','adjustment_pair_reversals');
  if v_n <> 3 then
    raise exception '#640 tail: the 0045 adjustment relations are not intact (found %)', v_n using errcode='CLR10';
  end if;
  select coalesce(string_agg(x.proname, ',' order by x.proname), '(none)') into v_names
    from w640_adj_pin x
    left join (select p.proname, md5(p.prosrc) as digest
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara') live on live.proname = x.proname
   where live.digest is distinct from x.digest;
  if v_names <> '(none)' then
    raise exception '#640 tail: this file changed 0045 door body(ies): %', v_names using errcode='CLR10';
  end if;

  -- 7 · THE TWO CLOSED ONE-MEMBER CHECKS AND THE DAY CEILING, read off pg_constraint rather than
  --     trusted from the DDL above (review finding S8).
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_revisions'::regclass and contype='c'
                    and pg_get_constraintdef(oid) like '%Asia/Kuala_Lumpur%') then
    raise exception '#640 tail: the timezone CHECK is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_revisions'::regclass and contype='c'
                    and pg_get_constraintdef(oid) like '%day_of_month%'
                    and pg_get_constraintdef(oid) like '%28%') then
    raise exception '#640 tail: the 1..28 day_of_month ceiling is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass
                    and conname='uq_plan_occurrences_period' and contype='u'
                    and pg_get_constraintdef(oid) like '%plan_id%leg%period_key%') then
    raise exception '#640 tail: unique (plan_id, leg, period_key) is absent or reshaped'
      using errcode='CLR10';
  end if;
  if (select attnotnull from pg_attribute
       where attrelid='clara.accounting_plans'::regclass and attname='authority_from') is not true then
    raise exception '#640 tail: accounting_plans.authority_from is absent or nullable' using errcode='CLR10';
  end if;

  -- 8 · THE LOCK ORDER, asserted on the body rather than on the header that describes it: the plan
  --     row is taken FOR UPDATE before anything reaches clara.admit_journal_work.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_plan_admit_occurrence';
  if position('for update' in v_src) = 0
     or position('for update' in v_src) > position('admit_journal_work' in v_src) then
    raise exception '#640 tail: the admission core does not take the plan row lock before the accounting_work rung'
      using errcode='CLR10';
  end if;
  -- …and the picker really does consult the occurrence rows, which is what makes the orphan wall
  -- and the period wall properties of the scan rather than of a comment.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_plan_admissible_event';
  if position('accounting_plan_occurrences' in v_src) = 0 or position('period_key' in v_src) = 0
     or position('_plan_primary_entry' in v_src) = 0 then
    raise exception '#640 tail: the picker does not read the occurrence rows, or does not test that a reversal''s accrual POSTED'
      using errcode='CLR10';
  end if;
  -- …and the DOOR holds the same wall for the path a human reaches by catch-up, so the two are
  -- one law rather than two that can drift.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_plan_admit_occurrence';
  if position('_plan_primary_entry' in v_src) = 0 then
    raise exception '#640 tail: the admission door does not test that a reversal''s accrual posted'
      using errcode='CLR10';
  end if;

  -- 9 · THE REVERSAL LAW (review round 2, BLOCKER-1), read off the catalog rather than believed.
  --     The weaker predicate it replaced must be GONE, not merely unused: a helper that still
  --     answers "this cancelled-or-not accrual stands" is a wall the next caller can pick up by
  --     mistake.
  if to_regprocedure('clara._plan_primary_stands(uuid,date)') is not null then
    raise exception '#640 tail: the superseded admitted-not-dead reversal predicate still exists'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._plan_primary_entry(uuid,date)') is null then
    raise exception '#640 tail: the posted-accrual entry lookup is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass and contype='c'
                    and conname='ck_plan_occurrences_reversal_entry'
                    and pg_get_constraintdef(oid) like '%reverses_entry_id%') then
    raise exception '#640 tail: an ADMITTED reversal is not structurally bound to name the entry it reverses'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='clara.accounting_plan_occurrences'::regclass and contype='f'
                    and confrelid = 'clara.journal_entries'::regclass) then
    raise exception '#640 tail: the reversed-entry reference is not a foreign key' using errcode='CLR10';
  end if;
  -- The one place a plan still reads a Work STATUS names 0184's transient `stopping` (NOTE-2).
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='_plan_work_stands';
  if v_src is null or position('stopping' in v_src) = 0 then
    raise exception '#640 tail: the standing-Work predicate does not treat 0184''s stopping as not standing'
      using errcode='CLR10';
  end if;

  -- 10 · THE ALIGNMENT WALL (review finding SHOULD-1) and THE ATTEMPT LEDGER (SHOULD-2).
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='revise_accounting_plan';
  if position('period_already_covered' in v_src) = 0
     or position('_plan_covered_through' in v_src) = 0 then
    raise exception '#640 tail: a revision may still re-align onto a period this plan has already run'
      using errcode='CLR10';
  end if;
  if (select attnotnull from pg_attribute
       where attrelid='clara.accounting_plan_occurrences'::regclass and attname='attempts') is not true then
    raise exception '#640 tail: the occurrence attempt ledger is absent or nullable' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_index ix join pg_class ic on ic.oid = ix.indexrelid
                  where ix.indrelid='clara.accounting_plan_occurrences'::regclass
                    and ic.relname='ix_plan_occurrences_attempts') then
    raise exception '#640 tail: the attempt ledger has no index for get_work_plan_origin to probe'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.proname='get_work_plan_origin';
  if position('attempts' in v_src) = 0 then
    raise exception '#640 tail: a superseded attempt''s Work does not resolve to its plan'
      using errcode='CLR10';
  end if;
  -- The period arithmetic the alignment wall stands on, exercised on the catalog's own function:
  -- a plan anchored 2026-07-01 and re-aligned to quarters covers July-September as ONE period, so a
  -- September that already posted monthly is inside it.
  if clara._plan_period_start(date '2026-07-01','quarterly',date '2026-09-15') <> date '2026-07-01'
     or clara._plan_period_start(date '2026-07-01','quarterly',date '2026-10-01') <> date '2026-10-01' then
    raise exception '#640 tail: the alignment wall''s period arithmetic is wrong' using errcode='CLR10';
  end if;

  raise notice '#640 tail: OK -- three RLS-forced plan relations with no application ACL; unique (plan_id, due_date), unique (plan_id, leg, period_key) and unique (work_id) present; authority_from NOT NULL; one live revision per plan enforced by a partial unique index; 11 human doors on clara_authenticated and the scan on clara_runtime alone (browser and agent lanes hold none); the scan reads no operator enable flag; the admission core takes the plan row lock before the accounting_work rung and the picker reads the occurrence rows; the timezone CHECK, the 1..28 day ceiling and the period unique are read off pg_constraint; the due arithmetic answers correctly for monthly/quarterly/month-end/reversal, the accrual behind a reversal, anchored period alignment and the leg-aware window ceiling; A REVERSAL IS BOUND TO A POSTED ENTRY -- clara._plan_primary_stands is GONE, clara._plan_primary_entry is what both the picker and the door ask, ck_plan_occurrences_reversal_entry makes "an admitted reversal naming no entry" a row this table cannot hold, the reversed entry is a real foreign key into clara.journal_entries, and the one surviving status test names 0184''s transient stopping; a frequency change is walled by period_already_covered off clara._plan_covered_through; every attempt of a due event is kept in an append-only ledger that get_work_plan_origin resolves through an indexed containment probe; and all FIVE 0045 adjustment doors hash byte-identically to the digests taken before this file created anything.';
end
$w640_tail$;
