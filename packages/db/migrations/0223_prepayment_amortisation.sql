-- 0223_prepayment_amortisation — #653 (refresh spec #612; journeys C8, C9): A RECOGNISED
-- PREPAYMENT IS AMORTISED OVER THE SERVICE PERIOD ITS DOCUMENT STATES, EXACT TO THE CENT, ONE
-- PERIOD AT A TIME, THROUGH THE SHARED PLAN SCHEDULER.
-- =====================================================================================
-- Spec of record: issue #653 — "资料或指令中的预付款保留金额与服务期间依据，以精确最小货币单位分配摊销，
-- 并可查看和更正已执行记录。" Domain words: CONTEXT.md — "Prepayment schedule", "Service period",
-- "Accounting plan", "Plan occurrence", "Accounting work", "Operation receipt". Builds on 0140
-- (the service-period carrier and the FROZEN evaluator), 0193 (#640's plan lane), 0178 (the
-- accounting-work lane and the shared basis predicate) and 0042 (the line-eligibility helper).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. One new plan kind (`amortisation_schedule`), one new
-- relation (`clara.prepayment_schedules`) holding what a derived amortisation IS, one per-period
-- basis seam so the shared scheduler can post a DIFFERENT amount every period, and four human
-- doors — so a posted prepayment and the term written on its document become a versioned schedule
-- whose every month admits ONE `clara.accounting_work` through 0178's own door.
--
-- =====================================================================================
-- THE THREE MEASUREMENTS THAT SHAPE THIS FILE.
--
-- (1) THE EVALUATOR IS ONE-SIDED, AND IT IS FROZEN. `clara.prepayment_schedule_v1` (0140:1009)
--     emits the PREPAID-ASSET half only — `{period_start, period_end, credit_cents,
--     account_code}` per whole calendar month, the remainder wholly in the final period. The
--     judged EXPENSE account, its eligibility wall, its stated-basis wall and the "one cent over
--     two months truncates to nothing" refusal live in `clara._agent_prepayment_schedule_core`
--     (0140:3455-3523), which states at 0140:3529 that the judged account is applied "HERE, at
--     lines-assembly, and NOWHERE ELSE" — and which is wired to the 0045 template lane alone,
--     behind a registered-and-DISABLED wake source (0138:2939-2941). So §D's door RE-DERIVES that
--     half. It re-derives it with 0140's OWN tokens (`prepayment_target_ineligible`,
--     `prepayment_target_underivable`, `prepayment_amount_below_period_granularity`) and 0042's
--     OWN helper (`clara._adj_line_eligibility_breach`, 0042:643), because a second vocabulary
--     for one rule is how two lanes start disagreeing about what is eligible.
--
--     THE EVALUATOR IS REACHED AS A DEFINER, AND NO GRANT IS MINTED. It is a single-member
--     `clara.evaluator_versions` closure hashed over the full `pg_get_functiondef` ignoring the
--     `deployed` flag (0140:1180-1198), and it sits in the rig's CLOSED ungranted census
--     (`packages/db/tests/rig-meta.mjs:1203-1206`). An edit would red the apply; a grant would red
--     the rig. §D's door is owned by `clara_fn_owner`, which is the evaluator's own owner, so it
--     calls it exactly as `clara._agent_prepayment_schedule_core` already does.
--
-- (2) THE SHARED SCHEDULER'S BASIS IS CONSTANT BY CONSTRUCTION. `clara._plan_occurrence_basis`
--     (0193:1037) is `language sql IMMUTABLE`: it rewrites the revision's basis' posting date and,
--     for a reversal, swaps every line's sides — and it can reach no table, so a revision's basis
--     is ONE amount for every occurrence. Amortisation is the opposite by nature: eleven periods
--     of 8333 and one of 8337. §C therefore recuts that body to take the resolved line AS AN
--     ARGUMENT (`p_line_override`), keeping it immutable, and adds a STABLE resolver
--     `clara._plan_amortisation_period_line(plan, due)` that both callers ask. The two callers —
--     `clara._plan_admit_occurrence` (0193:1299) and `clara.preview_accounting_plan` (0193:1996) —
--     move in this file with it.
--
--     THE FALLBACK IN THE BRIEF WAS NOT NEEDED, and the measurement is recorded rather than
--     asserted: `clara.preview_accounting_plan`'s live `provolatile` is `s` (STABLE), measured off
--     `pg_proc` on the migrated rig before this file was written, so calling a STABLE resolver
--     from inside it changes nothing about its own volatility class. Only
--     `_plan_occurrence_basis` itself is IMMUTABLE, and it stays immutable precisely because the
--     line arrives as an argument instead of being looked up.
--
-- (3) THE JOIN KEY IS EXACT, OR IT IS NOTHING. The evaluator emits whole calendar months, so every
--     `period_end` it produces IS a month end (0140:1133-1136). 0193's generic machinery would
--     happily take `day_of_month = 1..28` (0193:1583-1590), which would put every due date off
--     every line boundary and make the `period_end = due_date` join miss SILENTLY — a schedule
--     that looked configured and posted nothing, every month, with no audit row and no Work
--     (0193:1369-1382). So `clara.create_prepayment_schedule` DERIVES all six schedule fields from
--     the evaluator's own output and accepts none of them from the caller, and §C pins that
--     cadence for this kind INSIDE `clara._assert_plan_schedule` — whose two callers are
--     `create_accounting_plan` (0193:1519) and `revise_accounting_plan` (0193:1647), so ONE arm
--     closes both paths and `revise_accounting_plan` itself needs no edit at all.
--
--     AND WHEN THE JOIN STILL MISSES, IT IS TYPED. `_plan_amortisation_period_line` answering NULL
--     is a CLR10 `amortisation_period_line_missing` recorded on the occurrence — NEVER a fall-back
--     to the revision's constant basis, which would post the first period's amount forever.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--
-- · IT DOES NOT MAKE RECOGNITION AND CONFIGURATION ONE COMMIT, because that is unbuildable on v1:
--   the evaluator refuses a source entry that is not `approved` (0140:1040-1044 — "a prepayment
--   schedule amortises a POSTED entry"). The atomicity this lane gives is the one it can:
--   EACH OCCURRENCE's journal entry, its operation receipt and its occurrence row commit together,
--   through 0178's own lane. The residue — a recognition that posted and whose schedule then
--   refused — has two owners and they are different: the door's own inline refusal answers the
--   caller synchronously, and `clara.list_prepayment_attention`'s ARM B ("recognised, not yet
--   amortised") is its durable surface, because a create-time refusal writes NO plan and NO
--   schedule row and therefore no schedule-scoped read can ever reach it. ARM A is the other
--   residue: a LIVE schedule whose occurrences have begun refusing.
--
-- · IT DOES NOT ADD A SECOND SCAN. `clara.wake_due_plan_occurrences` (0193:2161) stays the only
--   one; `packages/runtime/lib/plan-occurrences.mjs:28-31` states it computes no date and reads no
--   plan row, so a new kind rides it unchanged.
--
-- · IT DOES NOT ADD AN `accounting_work.purpose`. An amortisation occurrence posts an ordinary
--   balanced two-line journal; `clara.get_work_plan_origin` (0193:2129) already resolves a Work
--   back to its plan, revision, due date and attempt. A new purpose would pull
--   `_record_journal_entry_core` (pinned twice), `admit_journal_work` and
--   `_tf_accounting_work_immutable` into this slice for a flag nothing reads.
--
-- · IT DOES NOT ADD A PERIOD CHECK AT ADMISSION. A locked period is the POSTING core's refusal,
--   not the plan's — `packages/db/tests/accounting-plans.test.mjs`'s `p640.auth.period` measures
--   exactly that ("admission does not know about period locks"), and adding one here would be a
--   new rule on a body #652 shares this wave. The occurrence is admitted, the posting refuses
--   CLR19 `write_into_closed_period`, the Work settles refused carrying the typed reason, and ARM
--   A of the attention read is where that becomes visible. Recovery is the EXISTING window-only
--   `clara.request_plan_catch_up` (0193:1878), which is not widened.
--
-- · IT DOES NOT RE-DERIVE A SCHEDULE FROM A CORRECTED TERM. `clara.document_service_periods` is
--   supersede-never-mutate (0140:452), so a corrected term is a NEW live row — and the stored
--   allocation does not move with it, by design: a revision of an amortisation plan can only
--   narrow the authority window, and a genuinely re-derived schedule is a NEW schedule on a NEW
--   plan. That is named as a follow-up rather than smuggled in as "revise".
--
-- · IT DOES NOT UNPARK `close_prep`. `clara.wake_establish_prepayment_schedule` is granted and
--   allowlisted but its wake source is registered-and-disabled (0138:2939-2941); the tail asserts
--   the row is STILL disabled rather than leaving it to be believed.
--
-- =====================================================================================
-- §0  PRESTATE. Every claim re-READ from the live catalog; every body this file recuts pinned by
--     the pre-image `sha256(prosrc)` MEASURED off `pg_proc` on the migrated rig (the 0194:174-196
--     idiom). A pin transcribed from a creating file's text would be a pin on a splice.
-- =====================================================================================
do $w653_pre$
declare v_n int; v_sha text; v_def text;
begin
  -- THE TWO LANES THIS FILE JOINS MUST BOTH BE WHOLLY PRESENT. Half of either is a partial
  -- cohort, and a partial cohort is a half-applied migration rather than a narrower boundary.
  if to_regclass('clara.accounting_plans') is null
     or to_regclass('clara.accounting_plan_revisions') is null
     or to_regclass('clara.accounting_plan_occurrences') is null then
    raise exception '#653 prestate: the 0193 accounting-plan lane is absent -- it must apply first'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.document_service_periods') is null
     or to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is null
     or to_regprocedure('clara.record_document_service_period(uuid,date,date,text,text)') is null then
    raise exception '#653 prestate: the 0140 prepayment limb is absent -- it must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._adj_line_eligibility_breach(uuid,jsonb)') is null then
    raise exception '#653 prestate: clara._adj_line_eligibility_breach is absent -- 0042 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._assert_journal_basis(jsonb)') is null then
    raise exception '#653 prestate: clara._assert_journal_basis is absent -- 0178 must apply first'
      using errcode='CLR10';
  end if;

  -- THE NEW LANE IS WHOLLY ABSENT.
  if to_regclass('clara.prepayment_schedules') is not null then
    raise exception '#653 prestate: clara.prepayment_schedules already exists' using errcode='CLR10';
  end if;
  for v_def in select unnest(array[
      'clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
      'clara.get_prepayment_schedule(uuid)',
      'clara.list_prepayment_schedules(uuid)',
      'clara.list_prepayment_attention(uuid)',
      'clara._plan_amortisation_period_line(uuid,date)']) loop
    if to_regprocedure(v_def) is not null then
      raise exception '#653 prestate: % already exists', v_def using errcode='CLR10';
    end if;
  end loop;

  -- THE `kind` CHECK THIS FILE WIDENS, measured as TEXT rather than assumed. A CHECK another lane
  -- had already widened would make §A's drop/add silently NARROW the vocabulary back to two. The
  -- text below was read off `pg_get_constraintdef` on the migrated rig; #652 rides
  -- `reversing_journal` by the wave's own ruling and widens nothing here, so this file is the sole
  -- widener and this assertion is the proof of that claim rather than a restatement of it.
  if pg_get_constraintdef((select oid from pg_constraint
        where conrelid='clara.accounting_plans'::regclass and conname='accounting_plans_kind_check'))
     <> 'CHECK ((kind = ANY (ARRAY[''recurring_journal''::text, ''reversing_journal''::text])))' then
    raise exception '#653 prestate: accounting_plans_kind_check is not the two-valued 0193 CHECK -- another lane widened it first, so this file''s drop/add would narrow it'
      using errcode='CLR10';
  end if;

  -- THE FIVE BODIES THIS FILE RECUTS, PINNED BY PRE-IMAGE sha256(prosrc), measured live.
  for v_def, v_sha in
    select * from (values
      ('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)',
       'e7b3dfb97408f40049ad69799c2da229e1bd7c9e3f5d66ae7c20f110c20adc1c'),
      ('clara._assert_plan_schedule(text,text,text,int,text,date,date,text)',
       'afbe98d0003ed07ae73840706763fc99daac87592200977bc1fc7cfc8bee65f1'),
      ('clara._plan_occurrence_basis(jsonb,date,text,uuid)',
       'a66f88f1e0ec2d9b284f0f0ee087957a3f6358fc8987314ad82a268d1ae2bd9d'),
      ('clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
       '5dc6614a8ac9b014e81a170d2a607b4c43eb9d253936bb6db67a529340566975'),
      ('clara.preview_accounting_plan(uuid,int)',
       '3becaab354663544760d07719588c54054897a4adc9a245d5cc2a8312028421a')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#653 prestate: % does not resolve -- the recut is derived from its exact text', v_def
        using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = to_regprocedure(v_def)) <> v_sha then
      raise exception '#653 prestate: % has DRIFTED from its pinned 0193 body -- re-derive the recut against the live text before applying', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- NON-REGRESSION PINS. None of these is recut; each is pinned so a later reader can see that
  -- this file's claim "the 0045 lane and the frozen evaluator are untouched" is measured.
  for v_def, v_sha in
    select * from (values
      -- `revise_accounting_plan` is NOT on the recut list: the cadence arm rides
      -- `_assert_plan_schedule`, which it already calls, so its own body must not move.
      ('clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
       '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f'),
      -- The expense half's only other home. This file RE-DERIVES it; it does not reach into it.
      ('clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)',
       '9be069dafd6884f9aed991e162bb64719d6e70d5841d11bb08011bbf8f7649c7'),
      ('clara.prepayment_schedule_v1(uuid,uuid)',
       'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = to_regprocedure(v_def)) is distinct from v_sha then
      raise exception '#653 prestate: % is not at its pinned pre-image -- this file asserts it is UNTOUCHED', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- THE FROZEN EVALUATOR IS PRESENT AT ITS REGISTERED CLOSURE, recomputed live rather than read
  -- back from the row that claims it.
  select count(*)::int into v_n
    from clara.evaluator_version_members m
    join clara.evaluator_versions e on e.id = m.evaluator_version_id
   where e.evaluator_name = 'prepayment_schedule'
     and m.body_sha256 = sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature))::text,'UTF8'));
  if v_n <> 1 then
    raise exception '#653 prestate: the prepayment_schedule evaluator closure does not reproduce (matched % member(s), expected 1)', v_n
      using errcode='CLR10';
  end if;

  -- THE FIVE 0045 TEMPLATE-LANE DOORS, still present and still the only home of the other half.
  for v_def in select unnest(array[
      'clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)',
      'clara.sign_adjustment_template(uuid,uuid,text)',
      'clara.run_adjustment_occurrence(uuid,uuid,date,date,text)',
      'clara.list_adjustment_templates(uuid)',
      'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)']) loop
    if to_regprocedure(v_def) is null then
      raise exception '#653 prestate: the 0045 template door % is absent', v_def using errcode='CLR10';
    end if;
  end loop;

  -- …AND THE `close_prep` WAKE SOURCE IS STILL DISABLED. Unparking it as a side effect of this
  -- file would expose `clara._agent_prepayment_schedule_core` through a lane whose tool surface
  -- belongs to a `closePrep_v2` with its own review (closePrep.v1.tools.ts:8-10).
  if (select enabled from clara.wake_engine_sources where source_key = 'close_prep') is not false then
    raise exception '#653 prestate: the close_prep wake source is not disabled' using errcode='CLR10';
  end if;

  raise notice '#653 prestate: clean -- no prepayment-schedule surface exists, accounting_plans_kind_check is the two-valued 0193 CHECK, the five recut bodies are at their measured pre-images, revise_accounting_plan / _agent_prepayment_schedule_core / prepayment_schedule_v1 are untouched, the evaluator closure reproduces, the five 0045 doors are present and close_prep is still disabled.';
end
$w653_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE THIRD ADAPTER. The CHECK widens; it loses nothing.
--
--     `kind` is in `_tf_accounting_plans_immutable`'s frozen array (0193:471), so a plan's kind is
--     decided at creation and never moves. Widening the CHECK widens what may be CREATED, and
--     nothing about an existing row.
-- =====================================================================================
alter table clara.accounting_plans drop constraint accounting_plans_kind_check;
alter table clara.accounting_plans add constraint accounting_plans_kind_check
  check (kind in ('recurring_journal','reversing_journal','amortisation_schedule'));

-- =====================================================================================
-- §B  clara.prepayment_schedules — WHAT A DERIVED AMORTISATION IS.
--
--     ONE ROW PER PLAN and ONE ROW PER RECOGNITION ENTRY, both as hard UNIQUEs: a second schedule
--     over one posted prepayment would amortise the same asset twice, and a plan with two
--     schedules would make `_plan_amortisation_period_line`'s answer ambiguous.
--
--     IT IS APPEND-ONLY IN FULL, not merely in its identity. Every column here is DERIVED — from
--     the frozen evaluator, from the entry's own prepaid leg, from the document's live service
--     period, and from the human's judged expense account with its stated grounds. A derived
--     record that could be edited would be a record of nothing: a corrected term supersedes the
--     `document_service_periods` row and a genuinely re-derived allocation is a NEW schedule, not
--     an UPDATE of this one.
--
--     NO APPLICATION ROLE HOLDS ANY GRANT. Every reach is a definer door, for the reason 0185 §A
--     states in full: a `grant`/`revoke` that changes no effective privilege still materialises
--     the owner's ACL, and pg_dump cannot reproduce a materialised owner-default ACL. `relacl`
--     stays NULL here as it does on every other clara relation.
-- =====================================================================================
create table clara.prepayment_schedules (
  id                    uuid        primary key default gen_random_uuid(),
  firm_id               uuid        not null references clara.firms(id),
  client_id             uuid        not null,
  -- THE PLAN THIS SCHEDULE CONFIGURES, and the revision it was derived against. The composite FK
  -- makes "this schedule's plan is this client's plan" a storage fact rather than a door's promise.
  plan_id               uuid        not null,
  revision              integer     not null check (revision >= 1),
  -- THE RECOGNITION. `source_entry_id` is the APPROVED entry that put the prepayment on the books;
  -- `prepaid_account_code` is read off that entry's own single debited asset leg by the evaluator
  -- and is never judged.
  source_entry_id       uuid        not null references clara.journal_entries(id),
  prepaid_account_code  text        not null check (btrim(prepaid_account_code) <> ''),
  -- THE JUDGEMENT, AND ITS GROUNDS. The expense account a human chose for the amortisation charge
  -- and the basis they stated for choosing it. A classification with no recorded basis is what
  -- 0140's `prepayment_target_underivable` exists to refuse, so the basis is NOT NULL and
  -- non-blank by CHECK — the `document_service_periods.basis` discipline, applied again.
  expense_account_code  text        not null check (btrim(expense_account_code) <> ''),
  expense_account_basis text        not null check (btrim(expense_account_basis) <> ''),
  -- THE TERM CARRIER. The `clara.document_service_periods` row that was LIVE when this schedule
  -- was derived, and the document it hangs off. A later correction supersedes that row; this
  -- schedule keeps naming the one it actually rode, which is what makes "what was this derived
  -- from" answerable after the fact.
  service_period_id     uuid        not null references clara.document_service_periods(id),
  document_id           uuid        not null,
  term_start            date        not null,
  term_end              date        not null,
  basis_kind            text        not null check (basis_kind in ('human_stated','extracted')),
  -- THE ALLOCATION, VERBATIM FROM THE FROZEN EVALUATOR, plus this lane's own pairing on each line.
  period_lines          jsonb       not null check (jsonb_typeof(period_lines) = 'array'
                                                    and jsonb_array_length(period_lines) >= 1),
  total_cents           bigint      not null check (total_cents > 0),
  period_count          integer     not null check (period_count >= 1),
  remainder_placement   text        not null check (remainder_placement = 'final_period'),
  schedule_version      text        not null check (btrim(schedule_version) <> ''),
  -- The `clara.evaluator_versions` row whose frozen closure produced the allocation.
  evaluator_version_id  uuid        references clara.evaluator_versions(id),
  created_by            uuid        not null references clara.users(id),
  created_at            timestamptz not null default now(),
  constraint ck_prepayment_schedules_term check (term_end >= term_start),
  constraint ck_prepayment_schedules_lines check (jsonb_array_length(period_lines) = period_count),
  -- ONE SCHEDULE PER PLAN, and ONE PER RECOGNITION ENTRY.
  constraint uq_prepayment_schedules_plan unique (plan_id),
  constraint uq_prepayment_schedules_source unique (source_entry_id),
  constraint fk_prepayment_schedules_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_prepayment_schedules_revision foreign key (plan_id, revision, firm_id, client_id)
    references clara.accounting_plan_revisions(plan_id, revision, firm_id, client_id),
  -- The kind this schedule's plan MUST be, as a FOREIGN KEY rather than a door's promise — the
  -- 0193 §B idiom (`fk_plan_revisions_plan_kind`).
  plan_kind             text        not null check (plan_kind = 'amortisation_schedule'),
  constraint fk_prepayment_schedules_plan_kind foreign key (plan_id, plan_kind)
    references clara.accounting_plans(id, kind),
  constraint fk_prepayment_schedules_document foreign key (document_id, firm_id)
    references clara.documents(id, firm_id)
);
comment on table clara.prepayment_schedules is
  '#653: one derived amortisation of one posted prepayment. Written ONLY by '
  'clara.create_prepayment_schedule; no application role holds DML or SELECT. Every column is '
  'DERIVED -- the allocation from the frozen clara.prepayment_schedule_v1, the prepaid account '
  'from the source entry''s own debited asset leg, the term from the document''s live '
  'clara.document_service_periods row -- except the judged expense account and the human''s '
  'stated grounds for it. APPEND-ONLY IN FULL: a corrected term supersedes the service-period row '
  'and a re-derived allocation is a NEW schedule, never an UPDATE of this one.';

alter table clara.prepayment_schedules enable row level security;
alter table clara.prepayment_schedules force row level security;
create policy p_prepayment_schedules_owner on clara.prepayment_schedules for all to clara_fn_owner
  using (true) with check (true);

create index ix_prepayment_schedules_client on clara.prepayment_schedules(client_id, created_at desc);
-- The resolver's own probe (`plan_id` → its lines) is served by `uq_prepayment_schedules_plan`;
-- ARM B's "no schedule names this entry" probe is served by `uq_prepayment_schedules_source`. No
-- third index, because nothing else probes this table.

create function clara._tf_prepayment_schedules_append_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a prepayment schedule is never deleted (end its plan, do not erase it)'
      using errcode='CLR08', detail='{"reason":"prepayment_schedule_immutable","column":"*"}';
  end if;
  raise exception 'a prepayment schedule is a derived record and is never edited; a corrected term is a new schedule'
    using errcode='CLR08', detail='{"reason":"prepayment_schedule_immutable"}';
end $$;
revoke all on function clara._tf_prepayment_schedules_append_only() from public;
create trigger t_prepayment_schedules_append_only before update or delete on clara.prepayment_schedules
  for each row execute function clara._tf_prepayment_schedules_append_only();
create trigger t_prepayment_schedules_no_truncate before truncate on clara.prepayment_schedules
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §C  THE PER-PERIOD BASIS — the one structural change the shared scheduler needed.
-- =====================================================================================

-- THE RESOLVER. `period_end = p_due` is the WHOLE join, and it is exact because
-- `clara.create_prepayment_schedule` fixes `day_rule = 'last_day_of_month'` and the evaluator
-- emits whole calendar months. NULL is a real answer and its caller treats it as one: a due date
-- with no line is a typed refusal, never a silent fall-back to the revision's constant.
--
-- IT IS STABLE, NOT IMMUTABLE, because it reads a table -- which is exactly why
-- `_plan_occurrence_basis` cannot do this lookup itself and takes the answer as an argument.
create function clara._plan_amortisation_period_line(p_plan uuid, p_due date) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
           'schedule_id', s.id,
           'period_start', l ->> 'period_start',
           'period_end', l ->> 'period_end',
           'amount_cents', (l ->> 'credit_cents')::bigint,
           'expense_account_code', s.expense_account_code,
           'prepaid_account_code', s.prepaid_account_code,
           -- THE LINES THE OCCURRENCE POSTS. Built HERE rather than in the shared basis body, so
           -- that body stays a generic "use these lines instead" seam with no amortisation
           -- vocabulary in it.
           'lines', jsonb_build_array(
             jsonb_build_object('account_code', s.expense_account_code,
               'debit_cents', (l ->> 'credit_cents')::bigint, 'credit_cents', 0,
               'description', 'amortisation ' || (l ->> 'period_start') || ' to ' || (l ->> 'period_end')),
             jsonb_build_object('account_code', s.prepaid_account_code,
               'debit_cents', 0, 'credit_cents', (l ->> 'credit_cents')::bigint,
               'description', 'prepaid release ' || (l ->> 'period_start') || ' to ' || (l ->> 'period_end'))))
    from clara.prepayment_schedules s
    cross join lateral jsonb_array_elements(s.period_lines) l
   where s.plan_id = p_plan and (l ->> 'period_end')::date = p_due
   limit 1;
$$;
revoke all on function clara._plan_amortisation_period_line(uuid,date) from public;
comment on function clara._plan_amortisation_period_line(uuid,date) is
  '#653: the amortisation line a due date posts, joined on period_end = due_date -- the exact key '
  'the derived last_day_of_month cadence guarantees. NULL when no line ends on that date, which '
  'clara._plan_admit_occurrence records as CLR10 amortisation_period_line_missing rather than '
  'falling back to the revision''s constant basis.';

-- clara._plan_occurrence_basis — RECUT. 0193's full body, with ONE addition: an optional
-- `p_line_override` whose `lines` REPLACE the revision's before the posting date is stamped and
-- before a reversal's sides are swapped. The body stays `language sql IMMUTABLE` because the line
-- ARRIVES rather than being looked up; the 4-argument form is DROPPED rather than left beside this
-- one, because a default on the fifth parameter would make every 4-argument call ambiguous.
-- Both callers (0193:1299, 0193:1996) move in this file.
drop function clara._plan_occurrence_basis(jsonb,date,text,uuid);
create function clara._plan_occurrence_basis(p_basis jsonb, p_due date, p_leg text,
    p_reverses_entry uuid default null, p_line_override jsonb default null) returns jsonb
  language sql immutable security definer set search_path = clara, pg_temp as $$
  select case
    when p_leg = 'reversal' and p_reverses_entry is not null
         and char_length(btrim(coalesce(b.j ->> 'memo',''))) + 58 <= 4000
      then jsonb_set(b.j, '{memo}',
             to_jsonb(btrim(coalesce(b.j ->> 'memo','')) || ' (reversal of entry '
                      || p_reverses_entry::text || ')'))
    else b.j end
  from (
    select jsonb_set(
      case when p_leg = 'reversal' then
        jsonb_set(v.base, '{lines}', coalesce((
          select jsonb_agg(
                   jsonb_build_object(
                     'account_code', x.l ->> 'account_code',
                     'debit_cents',  coalesce(nullif(x.l ->> 'credit_cents','')::numeric, 0),
                     'credit_cents', coalesce(nullif(x.l ->> 'debit_cents','')::numeric, 0))
                   || case when nullif(btrim(coalesce(x.l ->> 'description','')),'') is null
                           then '{}'::jsonb
                           else jsonb_build_object('description', x.l ->> 'description') end
                   order by x.ord)
            from jsonb_array_elements(case when jsonb_typeof(v.base->'lines') = 'array'
                                           then v.base->'lines' else '[]'::jsonb end)
                 with ordinality as x(l, ord)), '[]'::jsonb))
      else v.base end,
      '{posting_date}', to_jsonb(to_char(p_due, 'YYYY-MM-DD'))) as j
    from (select case
                   when p_line_override is not null
                        and jsonb_typeof(p_line_override -> 'lines') = 'array'
                     then jsonb_set(p_basis, '{lines}', p_line_override -> 'lines')
                   else p_basis end as base) v
  ) b;
$$;
revoke all on function clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb) from public;
comment on function clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb) is
  '#640/#653: the basis ONE occurrence posts -- the revision''s basis with this event''s posting '
  'date, a reversal''s sides exchanged, and (#653) the resolved period''s own lines substituted '
  'when a per-period override is supplied. IMMUTABLE: the override ARRIVES as an argument, so a '
  'varying amortisation amount needs no table read inside this body.';
-- clara._assert_plan_schedule - RECUT. 0193's full body; the addition is ONE arm, marked `#653`,
-- plus a restructuring of the final `elsif` into an `else` so the reversal-rule refusal and the new
-- cadence pin can both live on the non-reversing branch. Nothing else moves, and
-- `clara.revise_accounting_plan` - which calls this and is NOT recut by this file - gains the pin
-- for free.
create or replace function clara._assert_plan_schedule(p_kind text, p_frequency text, p_day_rule text,
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
  else
    if p_reversal_day_rule is not null then
      raise exception 'a % plan carries no reversal rule', coalesce(p_kind,'(null)')
        using errcode='CLR10',
          detail='{"reason":"invalid_schedule","field":"reversal_day_rule","constraint":"absent"}';
    end if;
    -- #653 - THE AMORTISATION CADENCE IS DERIVED FROM THE FROZEN EVALUATOR, NEVER TYPED, and this
    -- arm is what makes that true on BOTH paths: `clara.create_accounting_plan` (0193:1519) and
    -- `clara.revise_accounting_plan` (0193:1647) are this function's ONLY callers, so
    -- `revise_accounting_plan` needs no edit of its own and a revision cannot move the cadence.
    --
    -- WHY IT MATTERS MORE THAN AN ORDINARY ENUM. `clara.prepayment_schedule_v1` emits whole
    -- calendar months, so every `period_end` it produces IS a month end (0140:1133-1136). The
    -- generic machinery above would happily take `day_of_month = 1..28`, which would put every due
    -- date OFF every line boundary -- and `clara._plan_amortisation_period_line`'s
    -- `period_end = due_date` join would then miss SILENTLY. A schedule that looked configured and
    -- posted nothing, every month, with no audit row, no Work and no notification
    -- (0193:1369-1382), is the worst failure this lane can have; it is refused here instead.
    if p_kind = 'amortisation_schedule' then
      if p_frequency <> 'monthly' then
        raise exception 'an amortisation schedule charges whole calendar months: its frequency is derived from the term, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"frequency","constraint":"monthly"}';
      end if;
      if p_day_rule <> 'last_day_of_month' then
        raise exception 'an amortisation schedule falls on each period''s own month end: its day rule is derived from the term, not chosen'
          using errcode='CLR10',
            detail='{"reason":"invalid_schedule","field":"day_rule","constraint":"last_day_of_month"}';
      end if;
    end if;
  end if;
end $$;
revoke all on function clara._assert_plan_schedule(text,text,text,int,text,date,date,text) from public;

-- clara.create_accounting_plan - RECUT. 0193's full body; the addition is ONE member in the
-- by-name refusal list and in the `supported` array the refusal answers with. Every other arm -
-- the authority resolution, the schedule assertion, the shared basis predicate, the reservation
-- payload, the overlap warning and the audit row - is carried through verbatim.
create or replace function clara.create_accounting_plan(
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
  -- #653 widens this list by ONE member. Depreciation and close schedules STILL answer
  -- `plan_kind_unsupported` BY NAME, so a later file can widen it again additively and every
  -- caller that tried one in the meantime got a typed answer rather than a silent success.
  if p_kind is null or p_kind not in ('recurring_journal','reversing_journal','amortisation_schedule') then
    raise exception 'plan kind % is not supported in this slice (recurring_journal, reversing_journal, amortisation_schedule)', coalesce(p_kind,'(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind,
          'supported', jsonb_build_array('recurring_journal','reversing_journal','amortisation_schedule'))::text;
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

-- clara._plan_admit_occurrence - RECUT. 0193's full body; the additions are marked `#653` and are
-- two: the per-period line resolution that feeds the recut basis seam, and the typed refusal for a
-- due date the derived allocation does not cover. The lock order is untouched - rung 1 is still
-- `clara.accounting_plans FOR UPDATE`, taken before anything that can reach `clara.accounting_work`.
create or replace function clara._plan_admit_occurrence(p_plan uuid, p_due date, p_leg text, p_model text,
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
  v_line jsonb; v_line_missing boolean := false;  -- #653
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
  -- #653 - THE PER-PERIOD BASIS. An amortisation revision's stored basis carries ONE period's
  -- lines; every OTHER period posts its own amount, and the FINAL period posts the base plus
  -- the whole remainder. The resolved line is looked up HERE, in a VOLATILE body that may read
  -- a table, and handed to `clara._plan_occurrence_basis` as an ARGUMENT - which is exactly
  -- what lets that body stay IMMUTABLE. NULL is a real answer and is refused below BY NAME,
  -- never allowed to fall back to the revision's constant (which would post the first period's
  -- amount for every period of the term).
  if p.kind = 'amortisation_schedule' then
    v_line := clara._plan_amortisation_period_line(p.id, p_due);
    v_line_missing := (v_line is null);
  end if;
  v_basis := clara._plan_occurrence_basis(r.basis, p_due, p_leg, v_primary_entry, v_line);
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

  -- #653 - THE MISSING PERIOD LINE. Recorded on the occurrence rather than raised, exactly as
  -- the orphan wall below is: the refusal is legible in the plan's own history, nothing is
  -- admitted, and the SAME row becomes admissible if a schedule later covers the date. A
  -- corrected term does NOT re-derive an existing schedule (0223 SB's own comment says why),
  -- so this is the typed way a due date outside the derived allocation answers.
  if v_line_missing then
    v_outcome := jsonb_build_object('state','refused','code','CLR10',
      'reason','amortisation_period_line_missing',
      'message','this amortisation schedule has no period line ending on this due date',
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'at', now());
    update clara.accounting_plan_occurrences set outcome = v_outcome where id = v_occ;
    return jsonb_build_object('admitted', false, 'plan_id', p.id, 'occurrence_id', v_occ,
      'due_date', to_char(p_due,'YYYY-MM-DD'), 'leg', p_leg, 'revision', r.revision,
      'reason', 'amortisation_period_line_missing', 'code', 'CLR10');
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

-- clara.preview_accounting_plan - RECUT. 0193's full body; the addition is the per-period line,
-- resolved for an amortisation plan and projected beside the basis it produces.
create or replace function clara.preview_accounting_plan(p_plan uuid, p_count int) returns jsonb
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
  -- #653 - AN AMORTISATION PREVIEW SHOWS EACH PERIOD'S OWN AMOUNT rather than the revision's
  -- constant, and projects the resolved line beside the basis so a surface can render the
  -- allocation without re-deriving it. `clara._plan_amortisation_period_line` is STABLE and this
  -- body already is (its live `provolatile` was measured as `s` before this recut was written), so
  -- the lookup changes nothing about this function's own volatility class.
  select coalesce(jsonb_agg(jsonb_build_object(
           'due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg,
           'period_line', x.line,
           'basis', clara._plan_occurrence_basis(r.basis, e.due_date, e.leg, null, x.line))
         order by e.due_date), '[]'::jsonb) into v_rows
    from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule, r.day_of_month,
           r.auto_reverse, v_start, v_end, v_count) e
    cross join lateral (select case when p.kind = 'amortisation_schedule'
                                    then clara._plan_amortisation_period_line(p_plan, e.due_date)
                                    else null end as line) x;
  return jsonb_build_object('plan_id', p_plan, 'status', p.status, 'revision', r.revision,
    'timezone', r.timezone, 'today', to_char(clara._book_today(),'YYYY-MM-DD'),
    'from_date', to_char(v_start,'YYYY-MM-DD'),
    -- A PAUSED plan still previews its schedule, and says the schedule is not being admitted. An
    -- empty preview would read as "there is nothing scheduled", which is a different fact.
    'admitting', (p.status = 'active'), 'occurrences', v_rows);
end $$;

-- =====================================================================================
-- §D  THE HUMAN DOORS. bookkeeper+ for the write, viewer+ for the three reads, `_human_ctx`
--     + `_reserve_op`/`_finish_op` on the write, typed CLR refusals carrying `detail.reason`,
--     granted to `clara_authenticated` and to nothing else.
-- =====================================================================================

-- THE DOOR THAT CONFIGURES. It does five things in order, and the order is the point:
--
--   1. IT VALIDATES BEFORE IT RESERVES (0193's own discipline). Every refusal below happens
--      OUTSIDE the `_reserve_op` window, so a refused attempt burns no idempotency key and the
--      caller can fix the input and retry with the same one.
--   2. IT ASKS THE FROZEN EVALUATOR, as a definer, and surfaces its refusal tokens VERBATIM.
--      `prepayment_source_unfit` and `prepayment_term_underivable` are 0140's words; this door
--      re-spells neither, and it carries the evaluator's own payload (which document, which
--      fact, how many candidate legs) into `detail` so the caller's next act is named.
--   3. IT RE-DERIVES THE EXPENSE HALF, with 0140's three tokens and 0042's eligibility helper.
--      The evaluator emits the prepaid-asset side only; the judged account, its eligibility, its
--      stated grounds and the "this term charges nothing per period" refusal have no other home
--      outside `clara._agent_prepayment_schedule_core`, which is bound to the 0045 lane.
--   4. IT ROUTES THE PROPOSAL THROUGH `clara._assert_journal_basis` — the SAME predicate
--      `clara.create_accounting_plan` and `clara.admit_journal_work` use — rather than minting a
--      second zero check. C08.2's owner is that function and this door does not compete with it.
--   5. IT CREATES THE PLAN THROUGH `clara.create_accounting_plan`, deriving ALL SIX schedule
--      fields from the evaluator's output and accepting NONE of them from the caller, then writes
--      the schedule row under the plan's own row lock.
--
-- IT CONFIGURES; THE BELT ADMITS. No occurrence is admitted here. `clara.wake_due_plan_occurrences`
-- stays the only scan, and "accepted configuration" and "posted occurrence" stay two facts.
create function clara.create_prepayment_schedule(
    p_client uuid, p_source_entry uuid, p_expense_account text, p_expense_basis text,
    p_purpose text, p_authority_ref jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb; v_line jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_prepaid text; v_target text; v_basis_text text;
  v_acct record; v_breach jsonb; v_period record; v_doc uuid; v_entry record;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_existing uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'creating a prepayment schedule requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('bookkeeper')) a;

  select c.firm_id, c.status into v_client_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_client_firm is null or v_client_firm <> v_firm then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new prepayment schedule' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a prepayment schedule needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;

  -- ---- THE RESERVATION, TAKEN BEFORE THE DUPLICATE CHECK, AND THE ORDER IS MEASURED. ----
  --
  -- A REPLAY OF THE SAME DECISION MUST WIN OVER "THAT PREPAYMENT ALREADY HAS A SCHEDULE". The
  -- first cut asked the duplicate question first and the two answers collided: a caller whose
  -- response was lost retried with the SAME op key and got CLR13 `prepayment_schedule_exists`
  -- instead of the schedule it had already created -- a lost response turned into a second
  -- question, which is the exact defect `_reserve_op` exists to prevent. Measured by
  -- `p653.schedule.one_per_entry` before this order was written.
  --
  -- THE PAYLOAD HASH IS OVER THE CALLER'S OWN ARGUMENTS ONLY, never over the derived allocation:
  -- the key identifies the DECISION a human made, and the term, the period count and the
  -- allocation are OUTPUTS of that decision. Hashing an output would make the same decision
  -- collide with itself whenever the document's term was corrected in between.
  --
  -- A REFUSAL BELOW COSTS NOTHING. Every raise from here on aborts the statement's transaction and
  -- takes this reservation row with it, so the caller may fix the input and retry under the SAME
  -- key. That is why validating after reserving is safe here even though 0193's own doors validate
  -- first -- and it is stated rather than left to be inferred.
  v_dedupe := clara._reserve_op(v_firm, 'create_prepayment_schedule', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'source_entry', p_source_entry,
      'expense_account', nullif(btrim(coalesce(p_expense_account,'')),''),
      'expense_basis', nullif(btrim(coalesce(p_expense_basis,'')),''),
      'purpose', btrim(p_purpose), 'authority', p_authority_ref)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this prepayment-schedule key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- ONE SCHEDULE PER RECOGNITION ENTRY. `uq_prepayment_schedules_source` is the structural
  -- backstop; this is the typed answer, and it names the schedule that already exists so the
  -- surface can send the caller there instead of offering a second configuration.
  select s.id into v_existing from clara.prepayment_schedules s
   where s.source_entry_id = p_source_entry and s.firm_id = v_firm;
  if v_existing is not null then
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- THE FROZEN EVALUATOR. Reached as a DEFINER owned by its own owner role: it is a registered
  -- single-member `clara.evaluator_versions` closure AND a member of the rig's closed ungranted
  -- census, so minting a grant to reach it would red the rig and editing it would red the apply.
  -- Its refusals are RETURNED rather than raised, which is exactly why they can be re-raised here
  -- with their own payloads intact.
  v_sched := clara.prepayment_schedule_v1(p_client, p_source_entry);
  v_refusal := v_sched ->> 'refusal';
  if v_refusal is not null then
    raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
      using errcode='CLR10',
        detail=(jsonb_build_object('reason', v_refusal,
                  'reason_text', v_sched ->> 'reason')
                || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
  end if;

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;
  v_prepaid := v_sched ->> 'prepaid_account_code';

  -- ---- THE PREPAID LEG IS JUDGED TOO, BY THE ESTATE'S OWN RULE. ----
  --
  -- WHY THIS WALL EXISTS AT ALL, and it is the finding a review measured rather than a precaution.
  -- `clara.prepayment_schedule_v1` takes "the one debited asset leg" VERBATIM (0140:1046-1064) and
  -- never asks WHICH asset. Its whole predicate -- approved, binds a document, debits exactly one
  -- asset line -- is satisfied by every ordinary sales invoice (Dr trade receivables), every
  -- documented bank receipt and every fixed-asset purchase. Without this the door would accept a
  -- RECEIVABLE as a prepayment and post Dr expense / Cr receivable every month for the whole
  -- stated term, and §E's arm B would ADVERTISE those entries as "posted, not yet amortised" with
  -- a "configure the schedule" action beside them. Measured on the rig: a document-bound
  -- Dr-374-C56 invoice was accepted and its schedule credited the control account.
  --
  -- IT IS THE SAME HELPER THE EXPENSE HALF ALREADY USES (0042:643) -- `account_class is not null`
  -- (a control account), `is_bank_account` / `clara.bank_accounts`, `is_active`, and the FA
  -- role-reservation census -- so this is the estate's OWN existing eligibility rule applied to a
  -- second leg, never a second rule written here. The line is shaped as a CREDIT because that is
  -- the side every period will actually post against this account.
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit`, because that is exactly what this says: the
  -- SOURCE entry is not fit to be amortised. No new vocabulary; the web mirror and the chat-lane
  -- mirror already carry it, and `axis` says which leg so a surface can name it.
  --
  -- WHAT THIS DOES NOT CLOSE, stated rather than implied: an ordinary asset account with no class,
  -- no bank stamp and no reserved role still passes -- the wall is NEGATIVE (is this leg
  -- ineligible?) and not a POSITIVE prepayment-class roster. A roster would need a chart-level
  -- classification this estate does not carry; it is named as a follow-up rather than invented.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_prepaid,
      'debit_cents', 0, 'credit_cents', 1)));
  if v_breach is not null then
    raise exception 'account % holds this entry''s debited asset, and it cannot carry a prepayment', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'axis','prepaid_account_ineligible', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry, 'breach', v_breach)::text;
  end if;

  -- THE SIX DERIVED SCHEDULE FIELDS, every one read off the evaluator's own output: the cadence is
  -- monthly / last-day-of-month because the evaluator emits whole calendar months, the window opens
  -- on the FIRST line's `period_end` and closes on the LAST line's, `day_of_month` and
  -- `reversal_day_rule` are absent. None of them is a parameter of this door.
  v_from    := (v_lines -> 0 ->> 'period_end')::date;
  v_to      := (v_lines -> (v_n - 1) ->> 'period_end')::date;
  v_base    := (v_lines -> 0 ->> 'credit_cents')::bigint;

  -- THE TERM CARRIER THE EVALUATOR ACTUALLY RODE, re-read here so the schedule row names the exact
  -- `clara.document_service_periods` row rather than "whatever is live at read time". A later
  -- correction supersedes that row; this schedule keeps naming the one it was derived from.
  select je.document_id into v_doc from clara.journal_entries je where je.id = p_source_entry;
  select sp.id, sp.period_start, sp.period_end, sp.basis_kind, sp.basis into v_period
    from clara.document_service_periods sp
   where sp.document_id = v_doc and sp.superseded_at is null;
  if v_period.id is null then
    -- Unreachable behind the evaluator's own `prepayment_term_underivable` arm; asserted rather
    -- than assumed, because a schedule row whose `service_period_id` were NULL would be a derived
    -- record that cannot say what it was derived from.
    raise exception 'no live service period is recorded for the document this entry binds'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_term_underivable',
          'missing','document_service_periods','document_id', v_doc)::text;
  end if;

  -- ---- THE EXPENSE HALF, RE-DERIVED. 0140's three tokens, 0042's helper, no new vocabulary. ----
  v_target := nullif(btrim(coalesce(p_expense_account, '')), '');
  if v_target is null then
    -- The no-plausible-account arm, NOT a default path (0140:3455-3462): a lane that refused
    -- whenever it was unsure of a classification would never charge anything.
    raise exception 'no expense account was proposed for the amortisation charge'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"account_missing"}';
  end if;
  select ca.account_code, ca.account_type, ca.is_active into v_acct
    from clara.coa_accounts ca
   where ca.client_id = p_client and ca.account_code = v_target;
  if v_acct.account_code is null then
    raise exception 'this client''s chart holds no account %', v_target using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','account_unknown',
        'account_code', v_target)::text;
  end if;
  if v_acct.account_type <> 'expense' then
    -- An amortisation charge is an expense. A balance-sheet target would move the prepayment
    -- sideways and never charge it (0140:3474-3480).
    raise exception 'account % is a % account; an amortisation charge is an expense', v_target, v_acct.account_type
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_target_ineligible','axis','not_expense_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type)::text;
  end if;
  -- THE SAME HELPER THE PROPOSE DOOR AND THE POSTER ALREADY USE, so a bank-class, control,
  -- inactive or role-reserved account refuses by the estate's OWN existing rule rather than a
  -- second one written here.
  v_breach := clara._adj_line_eligibility_breach(p_client,
    jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
      'debit_cents', 1, 'credit_cents', 0)));
  if v_breach is not null then
    raise exception 'account % cannot carry an amortisation charge', v_target using errcode='CLR10',
      detail=(jsonb_build_object('reason','prepayment_target_ineligible') || v_breach)::text;
  end if;
  v_basis_text := nullif(btrim(coalesce(p_expense_basis, '')), '');
  if v_basis_text is null then
    -- A judgement with NO RECORDED BASIS is what this wall exists to prevent (0140:3489-3495):
    -- refuse rather than record an unexplained classification.
    raise exception 'the expense account was proposed without its stated grounds'
      using errcode='CLR10',
        detail='{"reason":"prepayment_target_underivable","axis":"basis_missing"}';
  end if;

  -- ---- THE PAIRED ALLOCATION. The evaluator's line VERBATIM plus this lane's own pairing. ----
  for v_x in select value from jsonb_array_elements(v_lines) loop
    v_paired := v_paired || jsonb_build_array(v_x
      || jsonb_build_object('amount_cents', (v_x ->> 'credit_cents')::bigint,
           'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code));
  end loop;

  -- ---- THE PROPOSAL, THROUGH THE SHARED PREDICATE. ----
  v_memo := 'Prepayment amortisation: ' || btrim(p_purpose);
  v_basis := jsonb_build_object(
    'posting_date', to_char(v_from, 'YYYY-MM-DD'), 'memo', v_memo, 'currency', 'MYR',
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', v_base,
        'credit_cents', 0, 'description', 'amortisation charge'),
      jsonb_build_object('account_code', v_prepaid, 'debit_cents', 0,
        'credit_cents', v_base, 'description', 'prepaid release')));
  begin
    perform clara._assert_journal_basis(v_basis);
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text,
                            v_detail = pg_exception_detail;
    begin
      v_reason := (v_detail::jsonb) ->> 'reason';
      v_constraint := (v_detail::jsonb) ->> 'constraint';
    exception when others then
      v_reason := null; v_constraint := null;
    end;
    -- C3 (0140:3505-3523), RESTATED AS THE SHARED PREDICATE'S OWN ANSWER. One cent over two months
    -- truncates to a base of 0, so the first period's derived basis moves no money and
    -- `clara._assert_journal_basis` refuses it. That raw refusal is correct but not actionable, so
    -- it becomes F-A4's typed rung -- carrying the predicate's OWN constraint and naming it as the
    -- owner, so a reader can see this door routed through it rather than inventing a second check.
    --
    -- MEASURED, not assumed: an all-zero balanced basis is refused by 0178's PER-LINE
    -- `exactly_one_side` arm (`0178:771-775`), which fires BEFORE its `nonzero_total` arm
    -- (`0178:785-787`) can ever be reached -- every line that survives the per-line arm carries
    -- exactly one POSITIVE side, so the debit total can never be zero. C08.2's owner is confirmed
    -- to be this predicate; the arm that actually answers is `exactly_one_side`, and that is a
    -- finding about 0178 rather than about this door. The constraint is therefore CARRIED THROUGH
    -- from whatever 0178 raised rather than asserted here to be any particular word.
    if v_reason = 'invalid_basis' and v_base <= 0 then
      raise exception 'this term charges nothing in at least one period: % cents over % periods truncates to a base of 0', v_total, v_n
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_amount_below_period_granularity',
            'constraint', v_constraint, 'owner', 'clara._assert_journal_basis',
            'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base)::text;
    end if;
    raise;
  end;

  -- ---- THE PLAN. Through 0193's OWN door, so the authority resolution, the schedule assertion,
  -- the basis predicate, the overlap warning and the audit row are all its, not a second copy. ----
  v_plan := clara.create_accounting_plan(
    p_client => p_client, p_kind => 'amortisation_schedule', p_purpose => btrim(p_purpose),
    p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
    p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
    p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
    p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1, taken here too although this door reaches no `clara.accounting_work`: the
  -- plan row is the lane's first rung (0193:253-262) and a writer that took the schedule row first
  -- would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = 'clara.prepayment_schedule_v1(uuid,uuid)'
   order by e.version desc limit 1;

  -- THE STRUCTURAL BACKSTOP ANSWERS IN THE LANE'S OWN WORDS. The typed duplicate check above
  -- cannot see a WINNER THAT HAS NOT COMMITTED: two people configuring the same recognition at
  -- once both pass it, and the loser queues on `uq_prepayment_schedules_source` until the winner
  -- commits. Before this block that loser was answered a bare 23505 -- `duplicate key value
  -- violates unique constraint "uq_prepayment_schedules_source"` -- a sentence with no next act,
  -- which no surface has a case for. MEASURED by `p653.schedule.duplicate_race` behind a real lock
  -- barrier. The index is still the authority; this only re-reads the winning row and re-raises the
  -- SAME CLR13 payload the pre-check raises, so both paths are one answer.
  begin
    insert into clara.prepayment_schedules(firm_id, client_id, plan_id, plan_kind, revision,
        source_entry_id, prepaid_account_code, expense_account_code, expense_account_basis,
        service_period_id, document_id, term_start, term_end, basis_kind, period_lines,
        total_cents, period_count, remainder_placement, schedule_version, evaluator_version_id,
        created_by)
      values (v_firm, p_client, v_plan_id, 'amortisation_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_prepaid, v_acct.account_code, v_basis_text,
        v_period.id, v_doc, v_period.period_start, v_period.period_end, v_period.basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        coalesce(v_sched ->> 'schedule_version', 'v1'), v_eval, v_actor)
      returning id into v_sid;
  exception when unique_violation then
    -- The read runs in the OUTER transaction, after the failed subtransaction rolled back, so the
    -- winner is visible by now. `v_existing` may still be null if some OTHER unique index fired --
    -- in which case the payload says so by carrying a null schedule_id rather than pretending.
    select s.id into v_existing from clara.prepayment_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = v_firm;
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  perform clara._audit(v_firm, v_actor, null, null, 'create_prepayment_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_period.id,
      'expense_account', v_acct.account_code, 'periods', v_n, 'total_cents', v_total,
      'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'amortisation_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_period.id, 'basis_kind', v_period.basis_kind,
    'term_start', to_char(v_period.period_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_period.period_end, 'YYYY-MM-DD'),
    'prepaid_account_code', v_prepaid, 'expense_account_code', v_acct.account_code,
    'expense_account_basis', v_basis_text,
    'total_cents', v_total, 'period_count', v_n,
    'remainder_placement', coalesce(v_sched ->> 'remainder_placement', 'final_period'),
    'schedule_version', coalesce(v_sched ->> 'schedule_version', 'v1'),
    'period_lines', v_paired,
    -- THE DERIVED CADENCE, echoed so the caller can SEE that none of it was theirs to choose.
    'frequency', 'monthly', 'day_rule', 'last_day_of_month', 'day_of_month', null,
    'timezone', 'Asia/Kuala_Lumpur',
    'effective_from', to_char(v_from, 'YYYY-MM-DD'), 'effective_to', to_char(v_to, 'YYYY-MM-DD'),
    'next_occurrences', v_plan -> 'next_occurrences',
    'overlap_warning', v_plan -> 'overlap_warning',
    -- THE BOUNDARY, IN THE DOOR'S OWN ANSWER (AC4). Accepted configuration is not a posted
    -- occurrence, and recognition + configuration in ONE commit is unbuildable on v1 because the
    -- evaluator refuses a source entry that has not posted.
    'configuration_only', true);
  return clara._finish_op(v_firm, 'create_prepayment_schedule', p_op_key, v_result);
end $$;

-- The shared read preamble: the schedule, read under the caller's own firm, with no existence
-- oracle across firms — `clara._plan_door_ctx`'s idiom (0193:1416) applied to this relation.
create function clara._prepayment_ctx(p_schedule uuid, p_min_rank int,
    out actor uuid, out firm uuid, out sc clara.prepayment_schedules)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  select a.actor, a.firm into actor, firm from clara._human_ctx(p_min_rank) a;
  select * into sc from clara.prepayment_schedules where id = p_schedule and firm_id = firm;
  if sc.id is null then
    raise exception 'prepayment schedule not found in your firm' using errcode='CLR11',
      detail='{"reason":"prepayment_schedule_not_found"}';
  end if;
end $$;
revoke all on function clara._prepayment_ctx(uuid,int) from public;

-- ONE SCHEDULE, WITH ITS PLAN, ITS ALLOCATION AND EVERY OCCURRENCE THAT ALLOCATION PRODUCED.
--
-- `periods` is the PER-OCCURRENCE LINK made explicit: each derived period line carries the
-- occurrence whose due date equals its own `period_end` — the exact key the derived cadence
-- guarantees — or NULL where no due event has been reached yet. A surface renders the allocation
-- and its execution as ONE table without re-deriving either.
create function clara.get_prepayment_schedule(p_schedule uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_ctx record; s clara.prepayment_schedules; p clara.accounting_plans; r record;
  v_occ jsonb; v_periods jsonb; v_entry record; v_covered date;
begin
  select * into v_ctx from clara._prepayment_ctx(p_schedule, clara.role_rank('viewer')) c;
  s := v_ctx.sc;
  select * into p from clara.accounting_plans where id = s.plan_id;
  select * into r from clara.accounting_plan_revisions
   where plan_id = s.plan_id and superseded_at is null;
  v_covered := clara._plan_covered_through(s.plan_id);
  select je.posting_date, je.memo, je.status into v_entry
    from clara.journal_entries je where je.id = s.source_entry_id;

  -- EVERY OCCURRENCE, with the same projection 0193's own occurrence read gives — the committed
  -- receipt only, the entry id out of its effects, the typed refusal reason, and the Work's own
  -- settled error where the refusal happened at POSTING rather than at admission.
  select coalesce(jsonb_agg(x order by x ->> 'due_date'), '[]'::jsonb) into v_occ
    from (
      select jsonb_build_object(
        'occurrence_id', o.id, 'due_date', to_char(o.due_date,'YYYY-MM-DD'), 'leg', o.leg,
        'period_key', to_char(o.period_key,'YYYY-MM-DD'), 'attempt', o.attempt,
        'revision', o.revision, 'intent_key', o.intent_key, 'work_id', o.work_id,
        'admitted_at', o.admitted_at, 'outcome', o.outcome, 'created_at', o.created_at,
        'attempts', o.attempts,
        'work_status', w.status, 'work_error', w.error,
        'receipt_id', (select rc.id from clara.operation_receipts rc
                        where rc.work_id = o.work_id and rc.outcome = 'committed'
                        order by rc.created_at limit 1),
        'entry_id', (select rc.effects ->> 'entry_id' from clara.operation_receipts rc
                      where rc.work_id = o.work_id and rc.outcome = 'committed'
                      order by rc.created_at limit 1)) as x
        from clara.accounting_plan_occurrences o
        left join clara.accounting_work w on w.id = o.work_id
       where o.plan_id = s.plan_id
    ) t;

  select coalesce(jsonb_agg(y order by y ->> 'period_end'), '[]'::jsonb) into v_periods
    from (
      select (l || jsonb_build_object('occurrence',
               (select e from jsonb_array_elements(v_occ) e
                 where e ->> 'due_date' = l ->> 'period_end' limit 1))) as y
        from jsonb_array_elements(s.period_lines) l
    ) u;

  return jsonb_build_object(
    'schedule_id', s.id, 'client_id', s.client_id, 'plan_id', s.plan_id,
    'revision', s.revision, 'kind', p.kind, 'status', p.status, 'purpose', p.purpose,
    'source_entry_id', s.source_entry_id,
    'source_posting_date', case when v_entry.posting_date is null then null
                                else to_char(v_entry.posting_date,'YYYY-MM-DD') end,
    'source_memo', v_entry.memo, 'source_status', v_entry.status,
    'document_id', s.document_id, 'service_period_id', s.service_period_id,
    'term_start', to_char(s.term_start,'YYYY-MM-DD'), 'term_end', to_char(s.term_end,'YYYY-MM-DD'),
    'basis_kind', s.basis_kind,
    'prepaid_account_code', s.prepaid_account_code,
    'expense_account_code', s.expense_account_code,
    'expense_account_basis', s.expense_account_basis,
    'total_cents', s.total_cents, 'period_count', s.period_count,
    'remainder_placement', s.remainder_placement, 'schedule_version', s.schedule_version,
    'created_by', s.created_by, 'created_at', s.created_at,
    'authority_kind', p.authority_kind, 'authority_ref', p.authority_ref,
    'authorised_by', p.authorised_by, 'authorised_at', p.authorised_at,
    'authority_from', to_char(p.authority_from,'YYYY-MM-DD'),
    'covered_through', case when v_covered is null then null else to_char(v_covered,'YYYY-MM-DD') end,
    'paused_at', p.paused_at, 'paused_by', p.paused_by, 'paused_reason', p.paused_reason,
    'ended_at', p.ended_at, 'ended_by', p.ended_by, 'ended_reason', p.ended_reason,
    'live_revision', case when r.revision is null then null else jsonb_build_object(
      'revision', r.revision, 'frequency', r.frequency, 'day_rule', r.day_rule,
      'day_of_month', r.day_of_month, 'timezone', r.timezone,
      'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
      'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end,
      'basis', r.basis, 'basis_digest', r.basis_digest) end,
    'periods', v_periods, 'occurrences', v_occ,
    -- THE TWO BOUNDARY SENTENCES THE SURFACE MUST SAY, answered by the database rather than
    -- written into a component: a schedule creates journal Work and never initiates a payment, and
    -- accepted configuration is not a posted occurrence.
    'configuration_only', true);
end $$;

create function clara.list_prepayment_schedules(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_rows jsonb;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'schedule_id', s.id, 'plan_id', s.plan_id, 'purpose', p.purpose, 'status', p.status,
        'source_entry_id', s.source_entry_id, 'document_id', s.document_id,
        'term_start', to_char(s.term_start,'YYYY-MM-DD'),
        'term_end', to_char(s.term_end,'YYYY-MM-DD'),
        'prepaid_account_code', s.prepaid_account_code,
        'expense_account_code', s.expense_account_code,
        'total_cents', s.total_cents, 'period_count', s.period_count,
        'basis_kind', s.basis_kind, 'created_at', s.created_at,
        'effective_from', case when r.effective_from is null then null
                               else to_char(r.effective_from,'YYYY-MM-DD') end,
        'effective_to', case when r.effective_to is null then null
                             else to_char(r.effective_to,'YYYY-MM-DD') end,
        -- HOW MANY PERIODS ACTUALLY PUT MONEY ON THE BOOKS. A committed receipt, never an
        -- admitted Work: "admitted" and "posted" are two facts and the list says the second one.
        'posted_periods', (select count(*)::int from clara.accounting_plan_occurrences o
                            join clara.operation_receipts rc on rc.work_id = o.work_id
                                                            and rc.outcome = 'committed'
                            where o.plan_id = s.plan_id),
        'occurrence_count', (select count(*)::int from clara.accounting_plan_occurrences o
                              where o.plan_id = s.plan_id),
        'next_due', (select to_char(e.due_date,'YYYY-MM-DD')
                       from clara._plan_due_events(r.effective_from, r.frequency, r.day_rule,
                              r.day_of_month, r.auto_reverse,
                              greatest(r.effective_from, coalesce(
                                (select max(o.due_date) + 1 from clara.accounting_plan_occurrences o
                                  where o.plan_id = s.plan_id), r.effective_from)),
                              coalesce(r.effective_to, r.effective_from + 3650), 1) e limit 1)
      ) as x
        from clara.prepayment_schedules s
        join clara.accounting_plans p on p.id = s.plan_id
        left join clara.accounting_plan_revisions r
               on r.plan_id = s.plan_id and r.superseded_at is null
       where s.client_id = p_client and s.firm_id = v_firm
    ) t;
  return jsonb_build_object('client_id', p_client, 'schedules', v_rows);
end $$;

-- §E  REFUSAL VISIBILITY — THE READ THIS LANE'S LARGEST HOLE NEEDS.
--
-- A refused occurrence writes ONLY `outcome` and returns: no `clara.accounting_work` row, no
-- `clara._audit` row (the only one is on the admitted path, 0193:1400), no interruption, no
-- notification (0193:1369-1382). A twelve-month amortisation that begins refusing therefore fails
-- every month with the evidence visible on ONE projection nobody opens. This read is the
-- mitigation, not an extra.
--
-- IT HAS TWO ARMS BECAUSE ONE CANNOT REACH BOTH RESIDUES, and each arm owns exactly one:
--
--   ARM A — "the last period did not put money on the books". A LIVE amortisation plan whose most
--   recent occurrence either refused AT ADMISSION (the typed `outcome.reason`: a deactivated
--   authoriser's CLR04, an inactive client, a missing period line) or was ADMITTED and whose Work
--   then reached a terminal state with no committed receipt (the typed `work.error.reason`: a
--   locked period's CLR19 at the posting core, a lapsed model-egress authorisation's CLR13, a
--   human's cancel). BOTH stages are here deliberately: admission does not know about period
--   locks (`packages/db/tests/accounting-plans.test.mjs`'s `p640.auth.period` measures exactly
--   that), so an arm that only looked at `outcome` would miss the single most likely long-run
--   failure this lane has.
--
--   ARM B — "recognised, not yet amortised". An APPROVED entry that binds a document and debits
--   EXACTLY ONE asset line, that no `clara.prepayment_schedules` row names as its source, AND
--   whose debited asset passes the estate's own line-eligibility wall (`clara.
--   _adj_line_eligibility_breach`, 0042:643). The first three clauses are the EVALUATOR'S OWN
--   predicate (0140:1046-1086); the fourth is the DOOR'S (§D), and it is here because the
--   evaluator's predicate makes no judgement of WHICH asset: without it every ordinary sales
--   invoice (Dr trade receivables), every documented bank receipt and every fixed-asset purchase
--   is advertised as a prepayment waiting for a schedule. A review MEASURED exactly that. Neither
--   clause is a judgement invented here: both are predicates the estate already owns, and the band
--   and the door therefore cannot drift apart. An ordinary expense coding — which debits no asset —
--   never appears, by the same evaluator clause. It is the ONLY durable trace of a create-time
--   refusal, because such a refusal writes no plan and no schedule row and therefore no
--   schedule-scoped read can ever reach it. Each row says whether a live
--   `clara.document_service_periods` row exists, so the surface names the NEXT ACT: record the
--   term, or configure the schedule.
--
-- EACH ARM IS CAPPED AT FIFTY ROWS, NEWEST FIRST, AND THE ENVELOPE SAYS WHEN THE CAP BIT
-- (`refusing_truncated` / `unscheduled_truncated`, with `cap`). The ordering is INSIDE the cut,
-- never after it: a `limit` over an unordered select is an arbitrary fifty, and the row this read
-- exists to surface is precisely the newest one.
--
-- WHAT NEITHER ARM REACHES, stated rather than implied: a MEMO-ONLY recognition binds no document,
-- so the evaluator refuses it outright (0140:1070-1075) and arm B's own predicate excludes it. A
-- memo-based prepayment has no amortisation path in this slice at all.
create function clara.list_prepayment_attention(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid; v_a jsonb; v_b jsonb;
        v_a_trunc boolean := false; v_b_trunc boolean := false;
begin
  select a.actor, a.firm into v_actor, v_firm from clara._human_ctx(clara.role_rank('viewer')) a;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = v_firm) then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;

  -- THE PAGE IS ORDERED BEFORE IT IS CUT, and the envelope says when the cut bit. A `limit 50`
  -- inside a select with NO ORDER BY hands back an ARBITRARY fifty and the ordering applied
  -- afterwards only sorts the survivors -- so on a client with more candidates than the cap the
  -- NEWEST refusal, which is the one this read exists to surface, could simply be absent with
  -- nothing saying so. Measured by `p653.attention.window`.
  with cand_a as (
      select jsonb_build_object(
        'arm', 'refusing', 'schedule_id', s.id, 'plan_id', s.plan_id, 'purpose', p.purpose,
        'status', p.status, 'occurrence_id', o.id,
        'due_date', to_char(o.due_date,'YYYY-MM-DD'),
        'period_key', to_char(o.period_key,'YYYY-MM-DD'),
        'attempt', o.attempt, 'work_id', o.work_id,
        -- WHERE it stopped, because the operator's next move differs: an admission refusal is a
        -- plan-lane fact (authority, window, period line), a posting refusal is a books fact
        -- (closed period, withdrawn egress authority) recorded on the Work.
        'stage', case when coalesce(o.outcome ->> 'state','') = 'refused' then 'admission'
                      else 'posting' end,
        'code', case when coalesce(o.outcome ->> 'state','') = 'refused' then o.outcome ->> 'code'
                     else w.error ->> 'code' end,
        'reason', case when coalesce(o.outcome ->> 'state','') = 'refused' then o.outcome ->> 'reason'
                       else w.error ->> 'reason' end,
        'message', case when coalesce(o.outcome ->> 'state','') = 'refused' then o.outcome ->> 'message'
                        else w.error ->> 'message' end,
        'work_status', w.status,
        -- The catch-up window this period would need, so the surface can offer the EXISTING
        -- window-only door rather than inventing a recovery of its own.
        'catch_up_from', to_char(o.due_date,'YYYY-MM-DD'),
        'catch_up_to', to_char(o.due_date,'YYYY-MM-DD')) as x,
        o.due_date as sk
        from clara.prepayment_schedules s
        join clara.accounting_plans p on p.id = s.plan_id
        cross join lateral (
          select o2.* from clara.accounting_plan_occurrences o2
           where o2.plan_id = s.plan_id
           order by o2.due_date desc, o2.created_at desc limit 1) o
        left join clara.accounting_work w on w.id = o.work_id
       where s.client_id = p_client and s.firm_id = v_firm and p.status <> 'ended'
         and (
           coalesce(o.outcome ->> 'state','') = 'refused'
           or (o.work_id is not null
               and w.status in ('failed','refused','cancelled','expired')
               and not exists (select 1 from clara.operation_receipts rc
                                where rc.work_id = o.work_id and rc.outcome = 'committed')))
    )
  select coalesce(jsonb_agg(p.x order by p.sk desc, p.x ->> 'occurrence_id'), '[]'::jsonb),
         (select count(*) from cand_a) > 50
    into v_a, v_a_trunc
    from (select c.x, c.sk from cand_a c order by c.sk desc, c.x ->> 'occurrence_id' limit 50) p;

  with cand_b as (
      select jsonb_build_object(
        'arm', 'unscheduled', 'entry_id', je.id,
        'posting_date', to_char(je.posting_date,'YYYY-MM-DD'), 'memo', je.memo,
        'document_id', je.document_id,
        'prepaid_account_code', x.account_code, 'amount_cents', x.debit_cents,
        'has_live_term', exists (select 1 from clara.document_service_periods sp
                                  where sp.document_id = je.document_id
                                    and sp.superseded_at is null)) as y,
        je.posting_date as sk
        from clara.journal_entries je
        cross join lateral (
          select jl.account_code, jl.debit_cents, count(*) over () as legs
            from clara.journal_lines jl
            join clara.coa_accounts ca on ca.client_id = jl.client_id
                                      and ca.account_code = jl.account_code
           where jl.entry_id = je.id and jl.debit_cents > 0 and ca.account_type = 'asset') x
       where je.client_id = p_client and je.status = 'approved'
         and je.document_id is not null and je.reversed_by is null
         and x.legs = 1
         and not exists (select 1 from clara.prepayment_schedules s
                          where s.source_entry_id = je.id)
         -- THE SAME ELIGIBILITY WALL THE DOOR APPLIES to the prepaid leg (§D), so the band cannot
         -- advertise a recognition the door would refuse. Without it arm B lists every ordinary
         -- sales invoice, documented bank receipt and fixed-asset purchase as "posted, not yet
         -- amortised" with a "configure the schedule" action -- measured on the rig.
         and clara._adj_line_eligibility_breach(p_client,
               jsonb_build_array(jsonb_build_object('account_code', x.account_code,
                 'debit_cents', 0, 'credit_cents', 1))) is null
    )
  select coalesce(jsonb_agg(q.y order by q.sk desc, q.y ->> 'entry_id'), '[]'::jsonb),
         (select count(*) from cand_b) > 50
    into v_b, v_b_trunc
    from (select c.y, c.sk from cand_b c order by c.sk desc, c.y ->> 'entry_id' limit 50) q;

  return jsonb_build_object('client_id', p_client, 'refusing', v_a, 'unscheduled', v_b,
    -- THE CAP, SAID OUT LOUD. A band showing fifty of nine hundred without this reads as "nothing
    -- else is failing", which is the exact misreading the whole read exists to prevent.
    'refusing_truncated', v_a_trunc, 'unscheduled_truncated', v_b_trunc,
    'cap', 50,
    'attention', v_a || v_b);
end $$;

-- =====================================================================================
-- §D.1  GRANTS. The four doors to `clara_authenticated`; the resolver and the read preamble to
--       nobody. The agent and both wake roles gain NOTHING, for the reason 0193 §I gives: a lane
--       that could author its own future authority would be the agent deciding what it may do.
-- =====================================================================================
revoke all on function clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text) from public;
revoke all on function clara.get_prepayment_schedule(uuid) from public;
revoke all on function clara.list_prepayment_schedules(uuid) from public;
revoke all on function clara.list_prepayment_attention(uuid) from public;

grant execute on function clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text) to clara_authenticated;
grant execute on function clara.get_prepayment_schedule(uuid) to clara_authenticated;
grant execute on function clara.list_prepayment_schedules(uuid) to clara_authenticated;
grant execute on function clara.list_prepayment_attention(uuid) to clara_authenticated;

comment on function clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text) is
  '#653: derive an amortisation schedule from a POSTED prepayment and the term its document '
  'states. Bookkeeper floor. Calls the FROZEN clara.prepayment_schedule_v1 as a definer (no grant '
  'is minted -- it is a registered evaluator closure and a member of the rig''s closed ungranted '
  'census), re-derives the expense half with 0140''s own three tokens, routes the proposal through '
  'clara._assert_journal_basis, and DERIVES all six schedule fields from the evaluator''s output. '
  'It CONFIGURES; clara.wake_due_plan_occurrences admits. Recognition and configuration in ONE '
  'commit is unbuildable: the evaluator refuses a source entry that has not posted.';
comment on function clara.list_prepayment_attention(uuid) is
  '#653: the refusal-visibility read. ARM A = live amortisation plans whose most recent occurrence '
  'put no money on the books, at ADMISSION (typed outcome.reason) or at POSTING (typed '
  'work.error.reason -- a locked period is the posting core''s refusal, not the plan''s). ARM B = '
  'approved entries that bind a document and debit exactly one ELIGIBLE asset line '
  '(clara._adj_line_eligibility_breach, the same wall the door applies to the prepaid leg) with no '
  'schedule naming them, each saying whether a live document_service_periods row exists. Arm B is '
  'the ONLY durable trace of a create-time refusal, which writes no plan and no schedule row. Each '
  'arm is ordered NEWEST FIRST and then cut at 50; refusing_truncated / unscheduled_truncated say '
  'when the cut bit. A MEMO-ONLY recognition binds no document and is reachable by neither arm.';

reset role;

-- =====================================================================================
-- §TAIL  CENSUS. Every claim re-READ from the live catalog rather than believed.
-- =====================================================================================
do $w653_tail$
declare
  v_n int; v_def text; v_expect text; v_src text; v_sha text;
begin
  -- (T.1) THE NEW RELATION: present, RLS-forced, and carrying NO application ACL at all.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relkind = 'r' and c.relname = 'prepayment_schedules'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#653 tail: clara.prepayment_schedules is absent or not RLS-forced' using errcode='CLR10';
  end if;
  if (select c.relacl from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'clara' and c.relname = 'prepayment_schedules') is not null then
    raise exception '#653 tail: clara.prepayment_schedules carries a materialised ACL -- it must stay NULL'
      using errcode='CLR10';
  end if;
  -- …and it ships EMPTY. A relation with rows on the migration that created it would be seed data
  -- wearing a schema change's clothes.
  select count(*)::int into v_n from clara.prepayment_schedules;
  if v_n <> 0 then
    raise exception '#653 tail: clara.prepayment_schedules is not empty (% rows)', v_n using errcode='CLR10';
  end if;
  -- The append-only belt and the no-truncate belt are both attached.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.prepayment_schedules'::regclass and not tgisinternal
     and tgname in ('t_prepayment_schedules_append_only','t_prepayment_schedules_no_truncate');
  if v_n <> 2 then
    raise exception '#653 tail: the prepayment-schedule append-only/no-truncate belts are not both attached (found %)', v_n
      using errcode='CLR10';
  end if;

  -- (T.2) THE WIDENED CHECK carries all three members and LOST nothing.
  v_def := pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'clara.accounting_plans'::regclass and conname = 'accounting_plans_kind_check'));
  foreach v_expect in array array['recurring_journal','reversing_journal','amortisation_schedule'] loop
    if position(v_expect in v_def) = 0 then
      raise exception '#653 tail: accounting_plans_kind_check no longer admits %', v_expect using errcode='CLR10';
    end if;
  end loop;
  -- A fourth member would mean this file widened more than it claims.
  select count(*)::int into v_n
    from regexp_matches(v_def, '''([a-z_]+)''::text', 'g') m;
  if v_n <> 3 then
    raise exception '#653 tail: accounting_plans_kind_check admits % members, expected exactly 3', v_n
      using errcode='CLR10';
  end if;

  -- (T.3) THE FROZEN EVALUATOR is still ungranted, still at its pinned body, and its registered
  -- closure still reproduces from the LIVE catalog.
  if (select p.proacl from pg_proc p
       where p.oid = 'clara.prepayment_schedule_v1(uuid,uuid)'::regprocedure)
     is distinct from '{clara_fn_owner=X/clara_fn_owner}'::aclitem[] then
    raise exception '#653 tail: clara.prepayment_schedule_v1 gained or lost an ACL entry -- it must stay owner-only'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.prepayment_schedule_v1(uuid,uuid)'::regprocedure;
  if v_sha <> 'ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2' then
    raise exception '#653 tail: clara.prepayment_schedule_v1 MOVED -- this file re-derives its expense half and never edits it'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from clara.evaluator_version_members m
    join clara.evaluator_versions e on e.id = m.evaluator_version_id
   where e.evaluator_name = 'prepayment_schedule'
     and m.body_sha256 = sha256(convert_to(pg_get_functiondef(to_regprocedure(m.member_signature))::text,'UTF8'));
  if v_n <> 1 then
    raise exception '#653 tail: the prepayment_schedule closure no longer reproduces' using errcode='CLR10';
  end if;

  -- (T.4) THE 0045 TEMPLATE LANE AND ITS AGENT CORE are untouched, by pinned pre-image.
  for v_def, v_sha in
    select * from (values
      ('clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)',
       '9be069dafd6884f9aed991e162bb64719d6e70d5841d11bb08011bbf8f7649c7'),
      ('clara.revise_accounting_plan(uuid,text,text,int,text,date,date,jsonb,text,text)',
       '87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = to_regprocedure(v_def)) is distinct from v_sha then
      raise exception '#653 tail: % MOVED -- this file asserts it is untouched', v_def using errcode='CLR10';
    end if;
  end loop;
  for v_def in select unnest(array[
      'clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)',
      'clara.sign_adjustment_template(uuid,uuid,text)',
      'clara.run_adjustment_occurrence(uuid,uuid,date,date,text)',
      'clara.list_adjustment_templates(uuid)',
      'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)']) loop
    if to_regprocedure(v_def) is null then
      raise exception '#653 tail: the 0045 template door % disappeared', v_def using errcode='CLR10';
    end if;
  end loop;

  -- (T.5) THE `close_prep` WAKE SOURCE IS STILL DISABLED. This file re-derives the expense half
  -- precisely so it never has to reach the lane that one would open.
  if (select enabled from clara.wake_engine_sources where source_key = 'close_prep') is not false then
    raise exception '#653 tail: the close_prep wake source is no longer disabled' using errcode='CLR10';
  end if;

  -- (T.6) THE RECUT BODIES CARRY THEIR NEW ARMS — behavioural claims are the batteries'; this is
  -- only the "did the recut actually land" check the estate's own tails make.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_plan_schedule(text,text,text,int,text,date,date,text)'::regprocedure;
  foreach v_def in array array['amortisation_schedule','last_day_of_month','monthly'] loop
    if position(v_def in v_src) = 0 then
      raise exception '#653 tail: the recut clara._assert_plan_schedule is missing %', v_def using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._plan_admit_occurrence(uuid,date,text,text,boolean)'::regprocedure;
  if position('amortisation_period_line_missing' in v_src) = 0
     or position('_plan_amortisation_period_line' in v_src) = 0 then
    raise exception '#653 tail: the recut clara._plan_admit_occurrence lost the per-period basis or its typed refusal'
      using errcode='CLR10';
  end if;
  -- …AND IT STILL TAKES RUNG 1 FIRST. The lock order is the invariant every other writer depends on.
  if position('from clara.accounting_plans where id = p_plan for update' in v_src) = 0 then
    raise exception '#653 tail: the recut clara._plan_admit_occurrence no longer takes the plan row FOR UPDATE first'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.preview_accounting_plan(uuid,int)'::regprocedure;
  if position('_plan_amortisation_period_line' in v_src) = 0 then
    raise exception '#653 tail: the recut clara.preview_accounting_plan does not resolve a period line'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if position('amortisation_schedule' in v_src) = 0
     or position('plan_kind_unsupported' in v_src) = 0 then
    raise exception '#653 tail: the recut clara.create_accounting_plan lost the widened kind list or its by-name refusal'
      using errcode='CLR10';
  end if;
  -- THE FOUR-ARGUMENT BASIS BODY IS GONE, not left beside the five-argument one: two overloads
  -- differing only by a defaulted final parameter would make every four-argument call ambiguous.
  if to_regprocedure('clara._plan_occurrence_basis(jsonb,date,text,uuid)') is not null then
    raise exception '#653 tail: the four-argument clara._plan_occurrence_basis still exists'
      using errcode='CLR10';
  end if;
  if (select p.provolatile from pg_proc p
       where p.oid = 'clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)'::regprocedure) <> 'i' then
    raise exception '#653 tail: clara._plan_occurrence_basis is no longer IMMUTABLE -- the whole point of taking the line as an argument'
      using errcode='CLR10';
  end if;

  -- (T.7) THE POSTURE CEREMONY (0194 T.8's idiom): owner, SECURITY DEFINER, pinned search_path and
  -- the EXACT ACL text — grantor included — for every function this file creates or recuts. A
  -- definer body with a mutable search_path is the textbook escalation shape, and a definer owned
  -- by the wrong role runs with the wrong authority; neither is visible to a grant probe.
  for v_def, v_expect in
    select * from (values
      ('clara._tf_prepayment_schedules_append_only()', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._plan_amortisation_period_line(uuid,date)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._prepayment_ctx(uuid,int)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._plan_occurrence_basis(jsonb,date,text,uuid,jsonb)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._assert_plan_schedule(text,text,text,int,text,date,date,text)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara._plan_admit_occurrence(uuid,date,text,text,boolean)', 'clara_fn_owner=X/clara_fn_owner'),
      ('clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.get_prepayment_schedule(uuid)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.list_prepayment_schedules(uuid)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.list_prepayment_attention(uuid)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.preview_accounting_plan(uuid,int)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner')
    ) as t(sig, acl)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#653 tail: % does not resolve for the posture census', v_def using errcode='CLR10';
    end if;
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_src from pg_proc p where p.oid = to_regprocedure(v_def);
    if v_src is distinct from ('clara_fn_owner | true | search_path=clara, pg_temp | ' || v_expect) then
      raise exception '#653 tail: % has the wrong posture -- expected owner clara_fn_owner, SECURITY DEFINER, search_path=clara, pg_temp and ACL {%}; got {%}',
        v_def, v_expect, v_src using errcode='CLR10';
    end if;
  end loop;

  -- (T.8) NO SECOND SCAN WAS MINTED. `clara.wake_due_plan_occurrences` stays the only runtime verb
  -- of this lane, and it stays granted to clara_runtime alone.
  if (select p.proacl from pg_proc p
       where p.oid = 'clara.wake_due_plan_occurrences(int,text)'::regprocedure)
     is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner}'::aclitem[] then
    raise exception '#653 tail: clara.wake_due_plan_occurrences'' grants moved' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname like 'wake_due_%';
  if v_n <> 1 then
    raise exception '#653 tail: % wake_due_* scan verbs exist, expected exactly 1', v_n using errcode='CLR10';
  end if;

  raise notice '#653 tail: OK -- clara.accounting_plans.kind admits exactly recurring_journal, reversing_journal and amortisation_schedule and lost nothing; clara.prepayment_schedules ships EMPTY with forced RLS, a NULL relacl, the append-only and no-truncate belts, one row per plan and one per recognition entry, and composite FKs that make its client, its revision, its plan kind and its document structural rather than trusted; clara._plan_occurrence_basis is the FIVE-argument form only and is still IMMUTABLE, because the per-period line arrives as an argument and clara._plan_amortisation_period_line (STABLE, ungranted) does the table read; clara._plan_admit_occurrence still takes clara.accounting_plans FOR UPDATE as rung 1 and now refuses a due date the derived allocation does not cover with a typed amortisation_period_line_missing on the occurrence row rather than falling back to the revision''s constant; clara.preview_accounting_plan resolves and projects each period''s own line; clara._assert_plan_schedule pins monthly / last_day_of_month for this kind on BOTH its callers, so clara.revise_accounting_plan needed no edit and is pinned UNMOVED; the four new doors reach clara_authenticated and nobody else while the resolver, the read preamble and the trigger reach no application role at all; and the frozen clara.prepayment_schedule_v1 is UNTOUCHED, still owner-only, still reproducing its registered evaluator_versions closure, with clara._agent_prepayment_schedule_core and all five 0045 template doors intact and the close_prep wake source still disabled.';
end
$w653_tail$;
