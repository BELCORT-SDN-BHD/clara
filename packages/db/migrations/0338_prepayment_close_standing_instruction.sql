-- 0338_prepayment_close_standing_instruction — #1050 (riders sweep wave, lane 02): the clocked
-- prepayment lane gets a DIRECTING HUMAN, and it is a named member of the firm who recorded a
-- firm-level standing instruction.
-- =====================================================================================
-- Spec of record: issue #1050's body, as RE-BRIEFED by the ruling comment of 2026-09-25 (recorded
-- on the ticket and on #1036, which it amends), plus the riders sweep wave's SWEEP-PLAN.md.
--
-- WHAT THE TICKET SAID, AND WHY IT COULD NOT BE BUILT AS FILED. #1036's own owner ruling named
-- "the person who ENABLED the close_prep source for the firm" as the plan's directing human. There
-- is no such person. `clara.wake_engine_sources` holds ONE GLOBAL ROW per `source_key`
-- (0133:204-239); `clara.set_wake_source_enabled` is operator-only and its own comment calls the
-- flip an estate-wide act that changes every firm's automation posture at once; and the broadcast
-- audit row sent to every OTHER firm deliberately carries `actor = NULL`, because a receiving firm
-- has no business knowing which operator flipped an estate-wide switch. Taking the ticket literally
-- would therefore either find nobody, or point `authorised_by` at a BELCORT operator — making one
-- operator the named directing human for automated postings in every firm's books.
--
-- WHAT THE RULING SAYS INSTEAD, and what this file builds. A NAMED MEMBER OF THE FIRM records a
-- FIRM-LEVEL STANDING INSTRUCTION — "let Clara establish prepayment schedules at close" — and THAT
-- member is the wake plan's directing human. Admission then runs under that member's own authority
-- and membership, exactly as it does for a plan they typed themselves, and
-- `clara.accounting_plans.authority_kind` gains ONE value (`standing_instruction`) so a reader can
-- tell a plan a person typed from a plan a person's standing instruction produced. Nothing is
-- admitted on the agent's own authority: the wall #977/0250 built is not loosened anywhere.
--
-- THE SECTIONS, IN THE ORDER THIS FILE WRITES THEM (dependency order, not alphabetical):
--
--   §A  clara.firm_standing_instructions             the instruction itself, append-only
--   §B  clara.record_firm_standing_instruction       a named member records it (admin floor)
--   §G  clara.withdraw_firm_standing_instruction     …and takes it back (same floor, same lane)
--   §C  clara.accounting_plans.authority_kind        0193's one-member CHECK gains ONE value
--   §D  clara._authority_ref_refusal                 a FOURTH reference kind, at FIRM scope
--   §E  clara._obo_plan_core                         the two kinds, admitted only in their pairing
--   §F  clara._prepayment_schedule_core              the 'wake' arm finds the directing human
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not widen `clara.create_accounting_plan`. Only a lane with nobody at the keyboard
--     needs the second authority kind, and leaving the human door at one keeps §E's explicit
--     branch byte-for-byte the wall that was there — which is what #915's and #941's parity cells
--     measure. The door is PINNED in §0 so the asymmetry is deliberate and a drift is visible.
--   · It gives the deferred-revenue twin no wake lane. `clara._revenue_recognition_core`'s lane
--     set is ('human','obo') and no wake wrapper for it exists anywhere in the catalog, so there
--     is nothing there for a standing instruction to authorise. Pinned in §0 for the same reason.
--   · It does not touch `clara.wake_establish_prepayment_schedule`: same name, same seven
--     arguments, same ACL, same allowlist row (the ticket's own words). The lane re-opens inside
--     the shared core, which is where #1036's own header said to re-open it.
--   · It does not pause a plan whose standing instruction is later withdrawn. See §G.
--   · It mints no role, no grant to any machine lane, and no second value anywhere else.
--
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates one
                                        -- small relation, writes no row, and backfills nothing.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0338_pre$
declare
  v_n int; v_sha text; v_src text; v_i int;
  v_first int := 0; v_redo int := 0; v_modes text := '';
  -- THE BODIES THIS FILE RECUTS, pinned by their sha256(prosrc) MEASURED ON THIS RIG (riders sweep
  -- lane 02 database `clara_l05`, 313 files, max `0337_prepayment_account_reservation` -- #1114,
  -- #1077, #1079 and #1078 landed in this lane before this ticket), never copied from an older
  -- migration's header. Each admits exactly TWO pre-images of its own -- its measured live sha, or
  -- a body that already carries this file's own `0338` attribution -- so a redo (#957) is admitted
  -- and real drift still refuses BY NAME. 0337's and 0336's idiom, line for line.
  v_recut text[][] := array[
    ['clara._authority_ref_refusal(text,uuid,uuid,uuid)',
     '55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208'],
    ['clara._obo_plan_core(text,uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
     '2049c1c4404e47102b375d506271938f5f3e03405fd7a25b8d303118c13a6b4a'],
    ['clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
     '87fc7e25d9e872e593d7c1c1e6fd6afb2a6373a25b868d711c62f99d73fef79a']
  ];
  -- …AND THE NEIGHBOURS THIS FILE DEPENDS ON AND MUST NOT MOVE.
  --
  --   · `create_accounting_plan` is the door this file deliberately does NOT widen. §E's whole
  --     claim -- that the explicit-instruction branch is byte-for-byte the wall that was there --
  --     is a claim about THIS body's text, because #915's and #941's parity cells compare the two
  --     entrances' refusal payloads byte for byte. If it moved, §E must be re-derived against it.
  --   · `_prepayment_plan_core` is the one-line wrapper the schedule core reaches §E through. It
  --     is `_obo_plan_core` with the kind bound; if it stopped delegating, §E would be dead code.
  --   · `_plan_admit_occurrence` is what makes the directing human MEAN something: it hands the
  --     plan's `authorised_by` to `clara.admit_journal_work`, which rechecks that person's
  --     membership, activity, rank and client status every month. This file writes plans FOR that
  --     body to admit and does not touch it.
  --   · `wake_establish_prepayment_schedule` keeps its exact seven arguments and its delegation
  --     (the ticket's own words). The lane re-opens inside the shared core, which is where #1036's
  --     own header said to re-open it -- "one arm in one body rather than a second door".
  --   · `_revenue_recognition_core` is the deferred-revenue twin, and it gets NO wake lane here.
  --     Its `p_lane` closed set is ('human','obo') and no wake wrapper exists for it anywhere in
  --     the catalog, so there is nothing for a standing instruction to authorise on that side.
  --     Pinned so the asymmetry is a decision and a drift is visible.
  v_keep text[][] := array[
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     'a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c'],
    ['clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
     '266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a'],
    ['clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
     '02ea6afe635dc9a8453d69918f5f48cb05f404f6e404973096db2ec92d0a655e'],
    ['clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     '84348ed4365bdbc07ad0020eca307e6f12fa5fc3141903092a0764fae462693e'],
    ['clara._revenue_recognition_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text,text)',
     '28de4d5958a7cbc6b9220e82962d1e08f62f5dd39c702b3fce941c8c876358fd']
  ];
begin
  -- 1 · THE RELATION THIS FILE MINTS IS NOT ALREADY SOMEBODY ELSE'S. A `create table if not
  --     exists` is redo-safe, but it is only SAFE if the table it finds is this file's own.
  if to_regclass('clara.firm_standing_instructions') is not null then
    select count(*) into v_n from pg_attribute a
     where a.attrelid = 'clara.firm_standing_instructions'::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname in ('firm_id', 'instruction_key', 'reason', 'recorded_by', 'withdrawn_at');
    if v_n <> 5 then
      raise exception '0338 prestate: clara.firm_standing_instructions exists but is not this file''s relation (found % of the 5 columns it mints)', v_n
        using errcode='CLR10';
    end if;
    raise notice '0338 prestate: the standing-instruction relation is already present -- REDO';
  end if;

  -- 2 · THE FIRM AND USER RELATIONS THE NEW TABLE REFERENCES.
  if to_regclass('clara.firms') is null or to_regclass('clara.users') is null then
    raise exception '0338 prestate: clara.firms or clara.users is absent' using errcode='CLR10';
  end if;

  -- 3 · THE SHARED APPEND-ONLY / NO-TRUNCATE TRIGGER BODIES THIS FILE REUSES rather than re-spells
  --     (0306 §A.1's own idiom). A relation that silently lost them would be deletable.
  if to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '0338 prestate: the shared append-only/no-truncate trigger bodies are absent'
      using errcode='CLR10';
  end if;

  -- 4 · THE BODIES THIS FILE RECUTS, each in ONE of its own two admissible pre-images.
  for v_i in 1 .. array_length(v_recut, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
      from pg_proc p where p.oid = v_recut[v_i][1]::regprocedure;
    if v_sha is null then
      raise exception '0338 prestate: % is absent', v_recut[v_i][1] using errcode='CLR10';
    elsif v_sha = v_recut[v_i][2] then
      v_first := v_first + 1; v_modes := v_modes || v_recut[v_i][1] || '=FIRST ';
    elsif position('0338' in v_src) > 0 then
      v_redo := v_redo + 1; v_modes := v_modes || v_recut[v_i][1] || '=REDO ';
    else
      raise exception '0338 prestate: % is neither its pinned pre-image (%) nor this file''s own recut; live sha %',
        v_recut[v_i][1], v_recut[v_i][2], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 5 · THE NEIGHBOURS ARE EXACTLY WHAT THIS FILE WAS WRITTEN AGAINST.
  for v_i in 1 .. array_length(v_keep, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_keep[v_i][1]::regprocedure;
    if v_sha is distinct from v_keep[v_i][2] then
      raise exception '0338 prestate: % moved (expected %, live %) -- this file reads it as the estate''s own rule and does not edit it; re-measure before applying',
        v_keep[v_i][1], v_keep[v_i][2], coalesce(v_sha, '(absent)') using errcode='CLR10';
    end if;
  end loop;

  -- 6 · THE AUTHORITY-KIND WALL IS STILL A NAMED CHECK. §C widens it by name; a wall that had
  --     been dropped or renamed would leave §C adding a constraint nobody removed.
  select count(*) into v_n from pg_constraint
   where conrelid = 'clara.accounting_plans'::regclass
     and conname = 'accounting_plans_authority_kind_check' and contype = 'c';
  if v_n <> 1 then
    raise exception '0338 prestate: clara.accounting_plans has no accounting_plans_authority_kind_check -- #977''s wall is what this file widens'
      using errcode='CLR10';
  end if;

  raise notice '0338 prestate OK -- % FIRST, % REDO -- %', v_first, v_redo, v_modes;
end $c0338_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.firm_standing_instructions — THE FIRM-LEVEL STANDING INSTRUCTION, APPEND-ONLY.
--
-- THE SHAPE IS `clara.prepayment_account_enrolments`' (0306), which is itself 0043's and 0041's:
-- an immutable [recorded_at, withdrawn_at] interval, version-forward on any change, a REQUIRED
-- non-blank reason, a no-delete + no-truncate pair, forced RLS and a SELECT-only application grant.
--
-- WHY APPEND-ONLY RATHER THAN A TOGGLE COLUMN. `clara.wake_engine_sources` carries its state as
-- mutable `enabled` / `enabled_by` columns, and this file deliberately does NOT copy that: an
-- accounting plan CITES the instruction row that authorised it, so if the row could be re-recorded
-- in place by a different member, a plan's citation would silently come to name someone who never
-- gave it. A row per recording act, withdrawn by a stamp and never overwritten, makes
-- `authority_ref` -> `recorded_by` equal to `authorised_by` for as long as the plan exists.
-- =====================================================================================
create table if not exists clara.firm_standing_instructions (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null references clara.firms(id),
  -- THE CLOSED SET, widened ADDITIVELY by a later file. One member today: the clocked prepayment
  -- lane is the only unattended act any firm has ruled a standing instruction for.
  instruction_key  text        not null
                               check (instruction_key in ('prepayment_schedule_at_close')),
  -- THE STATED REASON, 0306's `enrolment_attestation` law verbatim: not optional, not defaulted.
  -- A standing instruction without its basis is a switch, not an instruction.
  reason           text        not null check (btrim(reason) <> ''),
  recorded_by      uuid        not null references clara.users(id),
  recorded_at      timestamptz not null default now(),
  withdrawn_by     uuid        references clara.users(id),
  withdrawn_at     timestamptz,
  withdraw_reason  text,
  -- live XOR the withdrawn TRIO (0306's ck_pae_retired, one column wider because a withdrawal is
  -- itself a decision and owes its own sentence).
  constraint ck_fsi_withdrawn check (
    (withdrawn_by is null and withdrawn_at is null and withdraw_reason is null)
    or (withdrawn_by is not null and withdrawn_at is not null
        and withdraw_reason is not null and btrim(withdraw_reason) <> '')),
  constraint uq_firm_standing_instructions_id_firm unique (id, firm_id)
);

-- ONE LIVE INSTRUCTION PER (FIRM, KEY). Re-recording mints a NEW row (version-forward, 0306's
-- precedent) and withdrawn rows are kept forever as the firm's historical intervals, so the
-- uniqueness is scoped to the LIVE population only.
create unique index if not exists uq_firm_standing_instructions_live
  on clara.firm_standing_instructions (firm_id, instruction_key) where withdrawn_at is null;
-- A later reader that asks "was this instruction in force when that plan was written" reads the
-- INTERVAL, withdrawn rows included — 0306's ix_prepayment_account_enrolments_interval exactly.
create index if not exists ix_firm_standing_instructions_interval
  on clara.firm_standing_instructions (firm_id, recorded_at, withdrawn_at);

-- -------------------------------------------------------------------------------------------------
-- §A.1 — WITHDRAW-ONLY + APPEND-ONLY. The ONE lawful update is the withdrawal stamp; everything
-- else on the row is immutable from INSERT, and a row already withdrawn is immutable outright.
-- 0306 §A.1's guard, column for column, and for its reason: the REASON is the fact this relation
-- exists to carry, and a reason that could be rewritten in place is a label, not a basis.
-- -------------------------------------------------------------------------------------------------
create or replace function clara._tf_fsi_withdraw_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.withdrawn_at is not null then
    raise exception 'a withdrawn standing instruction is immutable'
      using errcode = 'CLR08', detail = '{"reason":"firm_standing_instruction_immutable"}';
  end if;
  if new.withdrawn_at is null or new.withdrawn_by is null
     or new.withdraw_reason is null or btrim(new.withdraw_reason) = ''
     or new.id              is distinct from old.id
     or new.firm_id         is distinct from old.firm_id
     or new.instruction_key is distinct from old.instruction_key
     or new.reason          is distinct from old.reason
     or new.recorded_by     is distinct from old.recorded_by
     or new.recorded_at     is distinct from old.recorded_at then
    raise exception 'firm_standing_instructions admits exactly one update: the withdrawal stamp (withdrawn_by, withdrawn_at and withdraw_reason together, set once)'
      using errcode = 'CLR08', detail = '{"reason":"firm_standing_instruction_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_fsi_withdraw_only() from public;

drop trigger if exists t_fsi_withdraw_only on clara.firm_standing_instructions;
create trigger t_fsi_withdraw_only before update on clara.firm_standing_instructions
  for each row execute function clara._tf_fsi_withdraw_only();
drop trigger if exists t_fsi_no_delete on clara.firm_standing_instructions;
create trigger t_fsi_no_delete before delete on clara.firm_standing_instructions
  for each row execute function clara._tf_append_only();
drop trigger if exists t_fsi_no_truncate on clara.firm_standing_instructions;
create trigger t_fsi_no_truncate before truncate on clara.firm_standing_instructions
  for each statement execute function clara._tf_no_truncate();

-- -------------------------------------------------------------------------------------------------
-- §A.2 — FORCED RLS + THE POLICY PAIR, spelled exactly as 0306's is: the firm predicate and a
-- SELECT-ONLY application grant. The FLOOR lives on the two doors, not on the read — every member
-- of a firm may SEE what their firm has instructed Clara to do; recording and withdrawing it is an
-- admin act. There is NO read door: a firm-scoped, RLS-guarded `select` is exactly what 0306 gave
-- its own roster, and law 31 says do not mint a door no consumer needs.
-- -------------------------------------------------------------------------------------------------
alter table clara.firm_standing_instructions enable row level security;
alter table clara.firm_standing_instructions force row level security;
drop policy if exists p_fsi_owner on clara.firm_standing_instructions;
create policy p_fsi_owner on clara.firm_standing_instructions
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_fsi_human on clara.firm_standing_instructions;
create policy p_fsi_human on clara.firm_standing_instructions
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.firm_standing_instructions to clara_authenticated;

comment on table clara.firm_standing_instructions is
  '#1050: a firm-level STANDING INSTRUCTION, recorded by a NAMED MEMBER of the firm, that names a human authority for an act Clara performs unattended. One member today: ''prepayment_schedule_at_close'' -- "let Clara establish prepayment schedules at close". The member who recorded the LIVE row is the directing human of every plan the close_prep wake writes while it stands, and admission runs under that member''s own authority and membership. Append-only: [recorded_at, withdrawn_at] is an immutable interval, so the instruction a plan cites can never come to name someone who never gave it.';

-- =====================================================================================
-- §B — clara.record_firm_standing_instruction — THE RECORDING DOOR.
--
-- ADMIN FLOOR, and the reason is stated rather than copied. The act this instruction authorises
-- (configuring one client's amortisation schedule) is bookkeeper work; STANDING it — delegating it
-- to an unattended run, for every client of the firm, until somebody withdraws it — is a
-- firm-level governance act, which in this estate sits at admin (`clara.record_client_fact`, 0055)
-- rather than at the floor of the act it authorises. Owner rank clears it.
-- =====================================================================================
create or replace function clara.record_firm_standing_instruction(
    p_instruction_key text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_dedupe jsonb;
  v_key text; v_reason text; v_existing record; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'recording a standing instruction requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('admin')) a;

  v_key    := nullif(btrim(coalesce(p_instruction_key, '')), '');
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- RESERVE-BEFORE-MUTABLE-VALIDATION (0305 §B / 0306 §B's placement and their reasoning): the
  -- replay short-circuit sits after identity/authz and before anything reading mutable world
  -- state. A FIRST call that fails a later validation raises, and the raise rolls the reservation
  -- back with it, so the caller may fix the input and retry under the SAME key.
  v_dedupe := clara._reserve_op(v_firm, 'record_firm_standing_instruction', p_op_key,
    clara._hash(jsonb_build_object('key', v_key, 'reason', v_reason)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this standing-instruction key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  if v_reason is null then
    raise exception 'a standing instruction requires the one-line reason it is given under'
      using errcode='CLR10',
        detail='{"reason":"firm_standing_instruction_invalid","axis":"reason_missing"}';
  end if;
  if v_key is null or v_key not in ('prepayment_schedule_at_close') then
    raise exception 'unknown standing instruction %', coalesce(v_key, '<null>')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','firm_standing_instruction_invalid',
          'axis','instruction_key_unknown', 'instruction_key', v_key)::text;
  end if;

  -- VERSION-FORWARD, NEVER MUTATE (0306 §B's fold). An unchanged re-recording is idempotent and
  -- must not move the interval under a live plan's citation; a RESTATED reason withdraws the live
  -- row and inserts a fresh one, so the basis a plan was written under stays readable for as long
  -- as the plan does.
  select * into v_existing from clara.firm_standing_instructions
   where firm_id = v_firm and instruction_key = v_key and withdrawn_at is null
   limit 1 for update;
  if found and v_existing.reason = v_reason and v_existing.recorded_by = v_actor then
    v_id := v_existing.id;
  else
    if found then
      update clara.firm_standing_instructions
         set withdrawn_by = v_actor, withdrawn_at = now(),
             withdraw_reason = 'superseded by a restated standing instruction'
       where id = v_existing.id;
    end if;
    insert into clara.firm_standing_instructions(firm_id, instruction_key, reason, recorded_by)
      values (v_firm, v_key, v_reason, v_actor)
      returning id into v_id;
  end if;

  -- args stay REDACTED (ids and the key, never the reason text -- the reason lives on the row,
  -- which is the record of record; 0002's audit_log doctrine).
  perform clara._audit(v_firm, v_actor, null, null, 'record_firm_standing_instruction', null,
    jsonb_build_object('instruction_key', v_key, 'instruction_id', v_id, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'record_firm_standing_instruction', p_op_key,
    jsonb_build_object('instruction_id', v_id, 'instruction_key', v_key, 'reason', v_reason,
      'recorded_by', v_actor, 'active', true));
end $$;
revoke all on function clara.record_firm_standing_instruction(text, text, text) from public;
grant execute on function clara.record_firm_standing_instruction(text, text, text)
  to clara_authenticated;

comment on function clara.record_firm_standing_instruction(text, text, text) is
  '#1050: a named member of the firm records a firm-level standing instruction, with the one-line reason it is given under. Admin floor, clara_authenticated only -- no machine lane may reach it, because an instruction a machine recorded would name nobody. Version-forward: an unchanged re-recording by the same member is idempotent, a restated reason withdraws the live row and inserts a fresh one.';



-- =====================================================================================
-- §G — clara.withdraw_firm_standing_instruction — THE DOOR THAT TAKES IT BACK.
--
-- A STANDING INSTRUCTION THAT CANNOT BE WITHDRAWN IS A SWITCH, NOT AN INSTRUCTION, and the
-- ruling's own words are "until somebody withdraws it". §A already carries the withdrawal
-- interval; without this door the only way to reach it would be §B's version-forward fold, which
-- always leaves a live row standing. A firm's first recording would then be permanent.
--
-- SAME FLOOR AS §B, and for the same reason: standing an act for every client of the firm, and
-- STOPPING Clara from performing it, are the same firm-level governance decision seen from two
-- sides. Owner rank clears it.
--
-- WHAT WITHDRAWAL DOES NOT DO, stated rather than left to be found: it does not touch a plan that
-- was already written. Those plans cite the row that WAS in force when they were written and they
-- keep posting under the member who authorised them, exactly as #940's own ruling leaves a running
-- amortisation posting to term end when its account's roster enrolment is retired. Withdrawal
-- closes the lane to NEW schedules. Whether it should also pause the plans it produced is a
-- decision this ticket was not given, and it is filed as a follow-up rather than swept.
-- =====================================================================================
create or replace function clara.withdraw_firm_standing_instruction(
    p_instruction_key text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $c0338_wd$
declare
  v_actor uuid; v_firm uuid; v_dedupe jsonb;
  v_key text; v_reason text; v_row record;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'withdrawing a standing instruction requires its idempotency key'
      using errcode='CLR10', detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  select a.actor, a.firm into v_actor, v_firm
    from clara._human_ctx(clara.role_rank('admin')) a;

  v_key    := nullif(btrim(coalesce(p_instruction_key, '')), '');
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- RESERVE-BEFORE-MUTABLE-VALIDATION, §B's placement and its reasoning: identity and authz
  -- first, then the replay short-circuit, then everything that reads the world.
  v_dedupe := clara._reserve_op(v_firm, 'withdraw_firm_standing_instruction', p_op_key,
    clara._hash(jsonb_build_object('key', v_key, 'reason', v_reason)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this standing-instruction key is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  -- A WITHDRAWAL OWES ITS OWN SENTENCE. §A's ck_fsi_withdrawn makes it structural; this is the
  -- typed answer, so a caller is told which half is missing rather than handed a 23514.
  if v_reason is null then
    raise exception 'withdrawing a standing instruction requires the one-line reason it is withdrawn under'
      using errcode='CLR10',
        detail='{"reason":"firm_standing_instruction_invalid","axis":"withdraw_reason_missing"}';
  end if;
  if v_key is null or v_key not in ('prepayment_schedule_at_close') then
    raise exception 'unknown standing instruction %', coalesce(v_key, '<null>')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','firm_standing_instruction_invalid',
          'axis','instruction_key_unknown', 'instruction_key', v_key)::text;
  end if;

  select * into v_row from clara.firm_standing_instructions
   where firm_id = v_firm and instruction_key = v_key and withdrawn_at is null
   limit 1 for update;
  if not found then
    raise exception 'this firm has no standing instruction of that kind to withdraw'
      using errcode='CLR11',
        detail=jsonb_build_object('reason','firm_standing_instruction_absent',
          'instruction_key', v_key)::text;
  end if;

  -- THE ONE LAWFUL UPDATE §A.1 admits: the three withdrawal columns together, set once, on a row
  -- that is not already withdrawn. Everything else on the row stays exactly as the member who
  -- recorded it left it, so a plan that cites it still reads the basis it was written under.
  update clara.firm_standing_instructions
     set withdrawn_by = v_actor, withdrawn_at = now(), withdraw_reason = v_reason
   where id = v_row.id;

  perform clara._audit(v_firm, v_actor, null, null, 'withdraw_firm_standing_instruction', null,
    jsonb_build_object('instruction_key', v_key, 'instruction_id', v_row.id, 'op_key', p_op_key));

  return clara._finish_op(v_firm, 'withdraw_firm_standing_instruction', p_op_key,
    jsonb_build_object('instruction_id', v_row.id, 'instruction_key', v_key,
      'recorded_by', v_row.recorded_by, 'withdrawn_by', v_actor, 'active', false));
end $c0338_wd$;
revoke all on function clara.withdraw_firm_standing_instruction(text, text, text) from public;
grant execute on function clara.withdraw_firm_standing_instruction(text, text, text)
  to clara_authenticated;

comment on function clara.withdraw_firm_standing_instruction(text, text, text) is
  '#1050: a named member of the firm withdraws a firm-level standing instruction, with the one-line reason it is withdrawn under. Admin floor, clara_authenticated only. The row is kept forever with its withdrawal stamp, so a plan written while the instruction stood still reads the basis it was written under; what stops is NEW work -- the clocked lane refuses wake_authority_absent again.';

-- =====================================================================================
-- §C — clara.accounting_plans.authority_kind GAINS ONE VALUE, and exactly one.
--
-- 0193:418 minted it as a CLOSED ONE-MEMBER check and its own header says why: "the spec's second
-- kind is not built in this slice, and a one-member check is how that is enforced rather than
-- hoped for". #977/0250 then made the wall the estate's accounting-authority control. The ruling
-- of 2026-09-25 widens it by ONE member -- `standing_instruction` -- so a reader can tell a plan a
-- person TYPED from a plan a person's STANDING INSTRUCTION produced, without either of them being
-- a plan nobody authorised.
--
-- IT IS STILL CLOSED. `authority_rule` -- the kind 0193 named and refused -- is still absent, and
-- both doors still refuse it by its own name before this constraint is ever consulted.
-- =====================================================================================
alter table clara.accounting_plans
  drop constraint if exists accounting_plans_authority_kind_check;
alter table clara.accounting_plans
  add constraint accounting_plans_authority_kind_check
  check (authority_kind in ('explicit_instruction', 'standing_instruction'));

-- =====================================================================================
-- §D — clara._authority_ref_refusal (0250 §A, widened by 0300 to a third kind). VERBATIM except
--      the FOURTH arm, inserted immediately before the unknown-kind raise.
--
-- This is #977's ONE definition of "is the instruction this plan cites a person's instruction",
-- and the estate's own census cell (`p977.definition.one`,
-- tests/authority-ref-human-instruction.test.mjs) asserts a CLOSED world of exactly three readers.
-- 0338 adds no reader: the wake lane resolves its firm's live instruction itself and hands the
-- citation to `clara._prepayment_plan_core`, which is `clara._obo_plan_core`, which is one of the
-- three.
-- =====================================================================================
create or replace function clara._authority_ref_refusal(p_ref_kind text, p_ref_id uuid, p_firm uuid, p_client uuid)
  returns text language plpgsql stable security definer set search_path = clara, pg_temp as $c0338_arr$
declare v_kind text; v_author uuid;
begin
  if p_ref_kind = 'accounting_work' then
    -- UNCHANGED BY #977, and the owner's ruling says why: `clara.accounting_work.initiator` is
    -- NOT NULL (0178:308), so a Work row cannot exist without naming the person who asked for
    -- it. Its EXISTENCE in this firm and client is already the proof this door needs.
    if exists (select 1 from clara.accounting_work w
                where w.id = p_ref_id and w.firm_id = p_firm and w.client_id = p_client) then
      return null;
    end if;
    return 'authority_ref_unresolved';
  end if;

  if p_ref_kind = 'chat_task' then
    -- THE CHAT LANE, NARROWED. The same firm-AND-client ladder both doors already applied, and
    -- then TWO facts about the row itself, as a CONJUNCTION:
    --
    --   its KIND is `chat_turn` -- only a turn is typed by a person. `wake`, `autodraft`,
    --   `close_prep` and `accounting_work` are runs the estate started for itself, and the last
    --   three carry an author (the human the run was started for) without being instructions.
    --
    --   its `created_by` is NOT NULL -- the column is nullable for every kind (0006:138) and the
    --   chat ingress is what stamps it, so a turn row nobody signed is not an instruction either.
    select t.kind, t.created_by into v_kind, v_author from clara.agent_tasks t
     where t.id = p_ref_id and t.firm_id = p_firm and t.client_id = p_client;
    if not found then
      return 'authority_ref_unresolved';
    end if;
    if v_kind = 'chat_turn' and v_author is not null then
      return null;
    end if;
    return 'authority_ref_not_human_instruction';
  end if;

  -- UNREACHABLE FROM EITHER DOOR: both refuse an unknown `kind` with their own
  -- `authority_ref_invalid` wall before they ever call this. A raise rather than a quiet
  -- refusal, so a future lane that widens the admitted kinds finds this line instead of a
  -- silent "unresolved".
  if p_ref_kind = 'contract_confirmation' then
    -- #949 (0300): THE TENANCY LANE'S OWN INSTRUCTION, and it is admitted for the SAME reason
    -- the accounting_work arm is, not a weaker one: clara.contract_plan_confirmations.
    -- confirmed_by is NOT NULL, so the row cannot exist without naming the person who confirmed
    -- the plan. Its EXISTENCE in this firm and client is the proof this door needs. The row also
    -- carries the agreement it was confirmed against, which is how a rent plan records its
    -- source document without a document ever being mistaken for an instruction.
    if exists (select 1 from clara.contract_plan_confirmations cf
                where cf.id = p_ref_id and cf.firm_id = p_firm and cf.client_id = p_client) then
      return null;
    end if;
    return 'authority_ref_unresolved';
  end if;

  -- #1050 (0338 §D): THE FIRM'S OWN STANDING INSTRUCTION -- a FOURTH kind, admitted for the
  -- SAME reason the accounting_work and contract_confirmation arms are and not a weaker one:
  -- `clara.firm_standing_instructions.recorded_by` is NOT NULL, so the row cannot exist without
  -- naming the MEMBER of this firm who gave it.
  --
  -- RESOLVED AT FIRM SCOPE, where the other three use the firm-AND-client ladder, and the
  -- asymmetry is the point. Those three cite a CLIENT-scoped row. This one is the FIRM's standing
  -- decision about how Clara may act for every client it keeps books for, and it names no client
  -- at all -- narrowing it by client would make it resolve for none of them.
  --
  -- AND IT MUST STILL BE IN FORCE. A withdrawn row is kept forever (0338 §A is append-only) so a
  -- plan written under it stays readable for as long as the plan does; it authorises nothing NEW.
  -- `withdrawn_at is null` is what makes "the firm instructed this" a present-tense claim.
  if p_ref_kind = 'firm_standing_instruction' then
    if exists (select 1 from clara.firm_standing_instructions fsi
                where fsi.id = p_ref_id and fsi.firm_id = p_firm and fsi.withdrawn_at is null) then
      return null;
    end if;
    return 'authority_ref_unresolved';
  end if;

  raise exception 'clara._authority_ref_refusal: unknown authority reference kind %', coalesce(p_ref_kind, '(null)')
    using errcode = 'CLR10';
end $c0338_arr$;

-- =====================================================================================
-- §E — clara._obo_plan_core (0308 §D, #941's fold of the two OBO plan steps into one body).
--      VERBATIM except the
--      authority-kind wall and the reference-kind wall, each widened by exactly one member, and
--      the two admitted ONLY in their own pairing.
--
-- WHY THIS BODY AND NOT `clara.create_accounting_plan`. The human door resolves its actor through
-- `clara._human_ctx` -> `clara.jwt_sub()`, which no unattended connection carries; the wake lane
-- therefore reaches the plan row through this twin, exactly as the OBO lane does. The human door
-- is left at ONE authority kind on purpose: nothing in the ruling asks a person to plead their
-- firm's standing instruction for a plan they typed themselves.
-- =====================================================================================
create or replace function clara._obo_plan_core(p_kind text, p_firm uuid, p_client uuid, p_author uuid, p_purpose text, p_authority_kind text, p_authority_ref jsonb, p_frequency text, p_day_rule text, p_day_of_month integer, p_timezone text, p_effective_from date, p_effective_to date, p_basis jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $c0338_obo$
declare
  v_plan uuid; v_rev uuid; v_digest text; v_ref_kind text; v_ref_id uuid; v_reason text;
  v_warning jsonb; v_next jsonb; v_via text;
begin
  -- THE KIND IS A CLOSED SET, and an unknown one RAISES rather than writing a plan row the CHECK
  -- would refuse with a bare 23514. Unreachable from either caller (both pass a literal); a later
  -- lane that widens the set finds this line instead of a silent constraint violation.
  if p_kind is null or p_kind not in ('amortisation_schedule', 'revenue_recognition_schedule') then
    raise exception 'clara._obo_plan_core: unknown plan kind %', coalesce(p_kind, '(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','plan_kind_unsupported','kind',p_kind)::text;
  end if;
  v_via := case p_kind when 'amortisation_schedule' then 'create_prepayment_schedule_for'
                       else 'create_revenue_recognition_schedule_for' end;

  -- THE AUTHORITY SHAPE, verbatim from clara.create_accounting_plan.
  if p_authority_kind = 'authority_rule' then
    raise exception 'an authority rule cannot yet authorise a plan; record the explicit instruction instead'
      using errcode='CLR10', detail='{"reason":"authority_rule_unsupported"}';
  end if;
  -- #1050 (0338 §E) -- A SECOND AUTHORITY KIND, and exactly one, which is the ruling's own
  -- arithmetic. `standing_instruction` is what the clocked prepayment lane writes: a NAMED MEMBER
  -- of the firm recorded a firm-level standing instruction (0338 §A/§B), and every plan the
  -- close_prep wake writes while it stands is authorised by THAT member, admitted under THEIR
  -- membership and rank. It is not a wider wall -- the strict pairing below is what keeps it from
  -- being one -- and it is deliberately NOT given to `clara.create_accounting_plan`: a person at a
  -- keyboard types their own instruction, and has no use for their firm's blanket delegation.
  if p_authority_kind is distinct from 'explicit_instruction'
     and p_authority_kind is distinct from 'standing_instruction' then
    raise exception 'unknown plan authority kind %', coalesce(p_authority_kind,'(null)')
      using errcode='CLR10', detail='{"reason":"invalid_authority_kind"}';
  end if;
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a plan authority names the instruction that carries it'
      using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  -- RIDERS WAVE 4 INTEGRATION: the THIRD kind, because "verbatim from
  -- clara.create_accounting_plan" above is a claim this file's own cells MEASURE --
  -- p915.obo.refusals_match and p941.obo.authority drive both entrances on the same state
  -- and require the same sentence byte for byte. Lane 01's 0300 added
  -- contract_confirmation to the human door, so the twin carries it too or the parity
  -- breaks. It admits nothing new in substance: clara._authority_ref_refusal, which 0300
  -- also widened, still resolves the reference under the same firm-and-client ladder, and
  -- a contract_confirmation row IS a named person's own confirmation -- exactly the
  -- "person's instruction" #977 requires and an agent run cannot manufacture.
  -- #1050 (0338 §E) -- THE TWO KINDS ARE ADMITTED ONLY IN THEIR OWN PAIRING, and the widening is
  -- additive only because of it. A `standing_instruction` citing a chat turn would be a label
  -- pasted on a person's typed decision; an `explicit_instruction` citing a standing-instruction
  -- row would be a person claiming their firm's blanket delegation as something they themselves
  -- decided. Each kind therefore names exactly the references that can carry it.
  --
  -- THE EXPLICIT BRANCH IS BYTE-FOR-BYTE THE WALL THAT WAS HERE BEFORE, and that is load-bearing
  -- rather than tidy: #915's and #941's parity cells (`p915.obo.refusals_match`,
  -- `p941.obo.authority`) drive this body and `clara.create_accounting_plan` on the same state and
  -- compare the WHOLE refusal payload byte for byte, so a reworded sentence here would be a
  -- divergence from a door this file has no standing to widen.
  if p_authority_kind = 'standing_instruction' then
    if v_ref_kind is distinct from 'firm_standing_instruction' then
      raise exception 'a standing instruction authorises a plan only by citing the firm standing-instruction row that carries it'
        using errcode='CLR10', detail='{"reason":"authority_ref_invalid","constraint":"kind"}';
    end if;
  elsif v_ref_kind is null or v_ref_kind not in ('accounting_work','chat_task','contract_confirmation') then
    raise exception 'a plan authority reference names an accounting_work, a chat_task or a contract_confirmation'
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
  -- RESOLVED, and on the CHAT-LANE arm a PERSON'S instruction rather than a task the estate
  -- enqueued for itself (#977, 0250). The chat entrance these doors open is exactly the caller
  -- that will supply `{kind:'chat_task', id: <this turn>}`, so this is the wall that stops a wake
  -- run or an autodraft from authorising its own schedule.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, p_firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this plan cites is not a person''s instruction'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this plan cites does not exist for this client'
      using errcode='CLR10',
        detail=jsonb_build_object('reason',v_reason,'kind',v_ref_kind,'id',v_ref_id)::text;
  end if;

  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'an accounting plan needs a purpose' using errcode='CLR10',
      detail='{"reason":"invalid_purpose","constraint":"nonempty"}';
  end if;
  perform clara._assert_plan_schedule(p_kind, p_frequency, p_day_rule,
    p_day_of_month, p_timezone, p_effective_from, p_effective_to, null);
  perform clara._assert_journal_basis(p_basis);
  v_digest := clara._journal_basis_digest(p_basis);

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  v_plan := gen_random_uuid();
  insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose, authority_kind,
      authority_ref, authorised_by, authority_from, current_revision, created_by)
    values (v_plan, p_firm, p_client, p_kind, 'active', btrim(p_purpose),
      p_authority_kind, p_authority_ref, p_author, p_effective_from, 1, p_author);
  insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
      frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
      basis_digest, auto_reverse, reversal_day_rule, created_by)
    values (v_plan, p_firm, p_client, p_kind, 1, p_frequency, p_day_rule,
      p_day_of_month, p_timezone, p_effective_from, p_effective_to, p_basis, v_digest, false,
      null, p_author)
    returning id into v_rev;

  v_warning := clara._plan_overlap_warning(p_client, p_basis, v_plan);
  select jsonb_agg(jsonb_build_object('due_date', to_char(e.due_date,'YYYY-MM-DD'), 'leg', e.leg)
           order by e.due_date) into v_next
    from clara._plan_due_events(p_effective_from, p_frequency, p_day_rule, p_day_of_month, false,
           p_effective_from, coalesce(p_effective_to, (p_effective_from + 3650)), 3) e;

  -- THE AUDIT ROW IS 0193'S OWN VERB with the entrance's `via`, exactly as 0222's core stamps its
  -- own: the audit trail says a plan was created and by WHICH entrance, and a reader can tell an
  -- OBO configuration from a human one without joining anything.
  perform clara._audit(p_firm, p_author, null, null, 'create_accounting_plan', null,
    jsonb_build_object('client', p_client, 'plan', v_plan, 'kind', p_kind,
      'revision', 1, 'authority', p_authority_ref, 'via', v_via));

  return jsonb_build_object('plan_id', v_plan, 'revision_id', v_rev, 'revision', 1,
    'status', 'active', 'kind', p_kind,
    'next_occurrences', coalesce(v_next,'[]'::jsonb), 'overlap_warning', v_warning);
end $c0338_obo$;


-- =====================================================================================
-- §F — clara._prepayment_schedule_core (#915's shared body; current cut 0317 §A, unmoved by 0335,
--      0336 and 0337). VERBATIM except the 'wake' arm, which stops refusing for want of a person
--      and starts FINDING one.
--
-- THE THREE EDITS, and there are only three:
--   · five locals, declared;
--   · the authority the plan step is given, defaulted once and rebound only on the wake arm;
--   · the wake arm itself -- resolve the firm's LIVE standing instruction, refuse by name when
--     there is none or its author has left the firm, otherwise bind the directing human.
--
-- THE RESERVATION, THE DUPLICATE CHECK, THE TERM PROVENANCE, THE ROSTER, THE ACCOUNT WALLS, THE
-- EVALUATOR, THE ALLOCATION, THE SCHEDULE ROW, THE AUDIT AND THE ANSWER ARE UNTOUCHED, including
-- the payload the idempotency key hashes. This file changes WHO authorises a wake-written plan and
-- nothing else about how one is built.
-- =====================================================================================
create or replace function clara._prepayment_schedule_core(p_firm uuid, p_client uuid, p_actor uuid, p_lane text, p_source_entry uuid, p_expense_account text, p_expense_basis text, p_purpose text, p_authority_ref jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $c0338_psc$

declare
  v_dedupe jsonb; v_sched jsonb; v_refusal text; v_lines jsonb; v_line jsonb;
  v_n int; v_total bigint; v_base bigint; v_from date; v_to date;
  v_prepaid text; v_target text; v_basis_text text;
  v_acct record; v_breach jsonb; v_period record; v_doc uuid; v_entry record;
  v_basis jsonb; v_plan jsonb; v_plan_id uuid; v_rev_id uuid; v_sid uuid;
  v_eval uuid; v_existing uuid; v_paired jsonb := '[]'::jsonb; v_x jsonb;
  v_code text; v_msg text; v_detail text; v_reason text; v_constraint text;
  v_result jsonb; v_memo text;
  -- #939 — the term provenance this door now CHOOSES rather than assumes.
  v_term_source text; v_sp_id uuid; v_st_id uuid; v_term_start date; v_term_end date;
  v_basis_kind text; v_legs int; v_leg record; v_fy record; v_st record;
  -- #1050 (0338 §F) — the clocked lane's DIRECTING HUMAN, the instruction that names them,
  -- and the authority the plan step is given.
  v_si_id uuid; v_directing uuid; v_auth_ref jsonb; v_auth_kind text; v_plan_author uuid;
begin
  -- #915 — THE LANE IS A CLOSED SET, and an unknown one RAISES rather than falling through to the
  -- OBO branch. Unreachable from either door (both pass a literal); a later lane that widens the
  -- set finds this line instead of a silent misroute.
  if p_lane is null or p_lane not in ('human', 'obo', 'wake') then
    raise exception 'clara._prepayment_schedule_core: unknown lane %', coalesce(p_lane, '(null)')
      using errcode='CLR10', detail='{"reason":"prepayment_lane_unknown"}';
  end if;

  -- #1050 (0338 §F) — THE AUTHORITY THE PLAN STEP WILL BE GIVEN, defaulted here to exactly what
  -- every caller that has ever reached this body passes, and REBOUND only on the wake arm below.
  -- Three named locals rather than a branch at the plan step, so "who authorises this plan, under
  -- which kind, citing what" is ONE answer decided in ONE place — and so the human and OBO lanes
  -- are provably unmoved: on both, these three are `p_actor`, `'explicit_instruction'` and
  -- `p_authority_ref`, which is what the plan step read before.
  v_plan_author := p_actor;
  v_auth_kind   := 'explicit_instruction';
  v_auth_ref    := p_authority_ref;

  -- #1050 (0338 §F) -- THE WAKE LANE RE-OPENS, AND IT RE-OPENS WITH A NAMED HUMAN.
  --
  -- WHAT #1036's FIX ROUND GOT RIGHT, and this file keeps. An amortisation schedule is a PLAN, and
  -- every plan in this estate names the person whose instruction authorises it: 0250/#977 is that
  -- wall, and `clara._plan_admit_occurrence` then posts each month's Work AS that person (0308:
  -- `clara.admit_journal_work(p.client_id, p.authorised_by, ...)`, which rechecks their membership,
  -- activity, role rank and client status). An unattended wake names no such person by itself --
  -- `clara.mint_wake_credential_for_task` forbids `on_behalf_of` BY CONSTRUCTION (0138:827-830) --
  -- and a plan authorised by `clara.agent_user_id()` could never admit a single occurrence, because
  -- that user holds zero `clara.firm_memberships` rows. MEASURED, not reasoned: the first cut of
  -- 0315 wrote one, and its first occurrence answered CLR11 `client_not_found`. So the lane
  -- refused, and the refusal was right for as long as nobody had named a person.
  --
  -- WHAT THE OWNER'S RULING OF 2026-09-25 ADDS (#1050, amending the ruling on #1036). A NAMED
  -- MEMBER of the firm records a FIRM-LEVEL STANDING INSTRUCTION -- "let Clara establish
  -- prepayment schedules at close" (0338 §A/§B) -- and THAT member is this plan's directing human.
  -- Admission then runs under their own authority and membership, exactly as it does for a plan
  -- they typed themselves, and `authority_kind` says `standing_instruction` so a reader can tell
  -- the two apart. Nothing is admitted on the agent's own authority: the wall is not loosened, it
  -- is SATISFIED, by a person who said so in advance and can withdraw it.
  --
  -- THE TICKET AS FILED NAMED A DIFFERENT PERSON, and there is none: it said "the member who
  -- ENABLED close_prep for the firm", but `clara.wake_engine_sources` holds ONE GLOBAL ROW per
  -- `source_key` (0133:204-239), `clara.set_wake_source_enabled` is operator-only, and the
  -- broadcast audit row sent to every OTHER firm deliberately carries `actor = NULL`. Taking it
  -- literally would have made one BELCORT operator the named directing human for automated
  -- postings in every firm's books.
  --
  -- WHY IT IS ANSWERED HERE rather than in the wrapper: #1036's own header said so -- this is the
  -- ONE body every entrance shares (#915's whole argument), so re-opening the lane is "one arm in
  -- one body rather than a second door", and every reason this door can refuse stays readable in
  -- one place.
  --
  -- AND IT IS STILL ANSWERED FIRST, before the purpose wall and before the reservation: a clocked
  -- run whose firm has instructed nothing must never be told to fix its expense account.
  if p_lane = 'wake' then
    select fsi.id, fsi.recorded_by into v_si_id, v_directing
      from clara.firm_standing_instructions fsi
     where fsi.firm_id = p_firm
       and fsi.instruction_key = 'prepayment_schedule_at_close'
       and fsi.withdrawn_at is null
     limit 1;

    -- NO INSTRUCTION: #1036's REFUSAL, UNCHANGED -- same CLR03, same reason token, same lane, same
    -- quoted wake kind and task, and it still NAMES the door a person uses to configure this one
    -- schedule (0140's own "the refusal names what to record and where"). It gains the door that
    -- gives the STANDING instruction, and the key of the instruction that is missing, because a
    -- refusal that named only the one-off remedy would hide the feature this ticket built.
    if v_directing is null then
      raise exception 'an unattended % wake names no directing human, so it cannot authorise an amortisation plan',
        coalesce(p_authority_ref ->> 'wake_kind', 'agent')
        using errcode='CLR03',
          detail=jsonb_build_object(
            'reason','wake_authority_absent',
            'reason_text','an unattended wake names no directing human, so it cannot authorise an amortisation plan',
            'lane','wake',
            'wake_kind', p_authority_ref ->> 'wake_kind',
            'task_id', p_authority_ref ->> 'task_id',
            'source_entry', p_source_entry,
            'instruction_key','prepayment_schedule_at_close',
            'remedy','clara.create_prepayment_schedule',
            'standing_remedy','clara.record_firm_standing_instruction')::text;
    end if;

    -- THE INSTRUCTION STANDS, BUT ITS AUTHOR MUST STILL BE A LIVE MEMBER OF THE FIRM. A plan is
    -- admitted every month AS this person; if they have left, `clara.admit_journal_work` refuses
    -- and the plan posts nothing, forever. #1036's own lesson -- "configuring something that can
    -- never run is worse than refusing" -- so the lane refuses HERE, at configuration time, by a
    -- name of its own, and the remedy is the door another member uses to re-record the
    -- instruction in their own name.
    if not exists (select 1 from clara.firm_memberships m
                    where m.firm_id = p_firm and m.user_id = v_directing
                      and m.status = 'active') then
      raise exception 'the member whose standing instruction authorises this schedule is no longer an active member of the firm'
        using errcode='CLR03',
          detail=jsonb_build_object(
            'reason','wake_authority_lapsed',
            'reason_text','the member whose standing instruction authorises this schedule is no longer an active member of the firm',
            'lane','wake',
            'wake_kind', p_authority_ref ->> 'wake_kind',
            'task_id', p_authority_ref ->> 'task_id',
            'source_entry', p_source_entry,
            'instruction_id', v_si_id,
            'instruction_key','prepayment_schedule_at_close',
            'remedy','clara.record_firm_standing_instruction',
            'standing_remedy','clara.record_firm_standing_instruction')::text;
    end if;

    -- THE REBINDING. The citation carries the instruction row AND the clocked task that acted on
    -- it, so ONE row -- the plan's `authority_ref` -- links the member's instruction, the wake that
    -- ran, and the plan that resulted. `clara._authority_ref_refusal` reads `kind` and `id`; the
    -- other two keys are for the reader.
    --
    -- THE CALLER'S OWN ARGUMENT IS NOT REWRITTEN. `p_authority_ref` (the honest `agent_wake`
    -- descriptor the wrapper built) is what the reservation below hashes, because this body's own
    -- law is that the idempotency key identifies the DECISION a caller made and never a value this
    -- body derived. Restating the firm's instruction therefore does not change what a replay of
    -- the same clocked task means.
    v_plan_author := v_directing;
    v_auth_kind   := 'standing_instruction';
    v_auth_ref    := jsonb_build_object('kind', 'firm_standing_instruction', 'id', v_si_id,
      'instruction_key', 'prepayment_schedule_at_close',
      'wake_kind', p_authority_ref ->> 'wake_kind', 'task_id', p_authority_ref ->> 'task_id');
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
  v_dedupe := clara._reserve_op(p_firm, 'create_prepayment_schedule', p_op_key,
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
   where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
  if v_existing is not null then
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry)::text;
  end if;

  -- ---- #939 — WHICH LANE IS THIS RECOGNITION ON? The door reads the entry ONCE and branches on
  -- the one fact that decides it: whether it binds a document. The absent/foreign case answers
  -- with v1's OWN token and sentence, so a caller cannot tell this recut from the body it
  -- replaced on that arm.
  select je.id, je.status, je.document_id, je.posting_date, je.reversed_by into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client and je.firm_id = p_firm;
  if v_entry.id is null then
    raise exception 'the source entry is not this client''s' using errcode='CLR10',
      detail=jsonb_build_object('reason','prepayment_source_unfit',
        'reason_text','the source entry is not this client''s',
        'source_entry', p_source_entry)::text;
  end if;

  -- ================= #1036 FIX ROUND / ADV-05 — A REVERSED RECOGNITION IS NOT SCHEDULABLE ========
  --
  -- WHAT WAS MEASURED. `clara.reverse_entry` leaves the original at status 'approved' and sets
  -- `reversed_by`, so a REFUNDED advance passed the status wall above. Driven on the rig before
  -- this arm: a 90000-sen advance was reversed through the real door and
  -- `clara.create_revenue_recognition_schedule` then returned a schedule of 90000 over 3 periods --
  -- a plan that would post Dr deferred revenue / Cr revenue against money the client got back,
  -- driving the liability into a debit balance and recognising revenue on a cancelled performance
  -- obligation (MFRS 15 / MPERS section 23, the standard this lane's own header names). The
  -- prepayment twin did the same against a refunded prepaid asset.
  --
  -- THE LANE'S TWO HALVES DISAGREED, which is the sharpest evidence this was an oversight rather
  -- than a decision: `clara.list_revenue_recognition_attention` (0308), `clara.list_prepayment_
  -- attention` (0305) and #940's own band all filter `je.reversed_by is null`, so the band would
  -- NEVER offer a receipt this door was accepting. The predicate below is theirs, verbatim.
  --
  -- ASKED ABOVE THE DOCUMENT/MEMO BRANCH, so neither carrier can drift from the other: a refunded
  -- payment is not amortisable whether its term came off an invoice or off a person's statement.
  if v_entry.reversed_by is not null then
    raise exception 'this prepayment has been reversed, so there is nothing left to amortise'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','this prepayment has been reversed, so there is nothing left to amortise',
          'axis','source_reversed', 'source_entry', p_source_entry,
          'reversed_by', v_entry.reversed_by)::text;
  end if;

  if v_entry.document_id is not null then
    -- ================= THE DOCUMENT LANE — UNCHANGED FROM 0223 =================
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

    -- THE TERM CARRIER THE EVALUATOR ACTUALLY RODE, re-read here so the schedule row names the exact
    -- `clara.document_service_periods` row rather than "whatever is live at read time". A later
    -- correction supersedes that row; this schedule keeps naming the one it was derived from.
    v_doc := v_entry.document_id;
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
    v_term_source := 'document_service_period';
    v_sp_id       := v_period.id;
    v_st_id       := null;
    v_term_start  := v_period.period_start;
    v_term_end    := v_period.period_end;
    v_basis_kind  := v_period.basis_kind;
  else
    -- ================= #939 — THE MEMO-ONLY LANE =================
    -- (a) THE SOURCE MUST HAVE POSTED. v1's first arm, its token and its sentence verbatim.
    if v_entry.status <> 'approved' then
      raise exception 'a prepayment schedule amortises a POSTED entry; this one is %', v_entry.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text','a prepayment schedule amortises a POSTED entry; this one is ' || v_entry.status,
            'source_entry', p_source_entry, 'status', v_entry.status)::text;
    end if;
    -- (b) THE PREPAID-ASSET LEG must be UNAMBIGUOUS: exactly one debited asset line. Zero or many
    -- is a refusal, never a guess -- picking one of two candidate legs would be the surface
    -- choosing a number. v1's second arm, asked HERE because v2 reads no table.
    select count(*)::int into v_legs
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
    if v_legs <> 1 then
      raise exception '%', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_source_unfit',
            'reason_text', case when v_legs = 0 then 'the source entry debits no asset account'
                                else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end,
            'source_entry', p_source_entry, 'candidate_legs', v_legs)::text;
    end if;
    select jl.account_code, jl.debit_cents into v_leg
      from clara.journal_lines jl
      join clara.coa_accounts ca
        on ca.client_id = jl.client_id and ca.account_code = jl.account_code
     where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';

    -- (c) THE TERM. This is the arm the whole ticket is about: before #939 the answer here was
    -- `prepayment_term_underivable` naming `journal_entries.document_id`, which told a firm its
    -- prepayment could never be amortised at all. It now names the CARRIER and the DOOR that
    -- fills it, so the person's next act is one call -- 0140's own "the refusal NAMES what to
    -- record and where", finally true for this lane too.
    select t.id, t.period_start, t.period_end into v_st
      from clara.prepayment_stated_terms t
     where t.source_entry_id = p_source_entry and t.superseded_at is null;
    if v_st.id is null then
      raise exception 'this recognition binds no document and nobody has stated its service period'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','this recognition binds no document and nobody has stated its service period',
            'missing','prepayment_stated_terms',
            'remedy','clara.record_prepayment_stated_term',
            'source_entry', p_source_entry)::text;
    end if;

    -- (d) THE FY ARM. v1's third arm, and it is a SELF-HEALABLE state rather than a dead end: the
    -- successor year can be opened and the call retried.
    select fy.id, fy.starts_on, fy.ends_on into v_fy
      from clara.fiscal_years fy
     where fy.client_id = p_client
       and v_entry.posting_date between fy.starts_on and fy.ends_on;
    if v_fy.id is null then
      raise exception 'the source entry does not sit inside any opened fiscal year for this client'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the source entry does not sit inside any opened fiscal year for this client',
            'missing','fiscal_years','source_entry', p_source_entry)::text;
    end if;
    if v_st.period_end > v_fy.ends_on
       and not exists (select 1 from clara.fiscal_years nx
                        where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                          and nx.status in ('open', 'reopened')) then
      raise exception 'the term runs past this fiscal year and no successor year is open yet'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','prepayment_term_underivable',
            'reason_text','the term runs past this fiscal year and no successor year is open yet',
            'missing','fiscal_years.successor','fy_ends_on', v_fy.ends_on,
            'period_end', v_st.period_end, 'source_entry', p_source_entry)::text;
    end if;

    -- (e) THE SECOND EVALUATOR, with the leg and the term this door just picked. A prepaid ASSET
    -- is released by CREDIT, which is why the side is stated here rather than defaulted there.
    v_sched := clara.prepayment_schedule_v2(v_leg.debit_cents, v_leg.account_code, 'credit',
      v_st.period_start, v_st.period_end);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      raise exception '%', coalesce(v_sched ->> 'reason', 'this prepayment cannot be scheduled')
        using errcode='CLR10',
          detail=(jsonb_build_object('reason', v_refusal,
                    'reason_text', v_sched ->> 'reason')
                  || (v_sched - 'refusal' - 'reason' - 'schedule_version'))::text;
    end if;
    v_term_source := 'human_stated';
    v_sp_id       := null;
    v_doc         := null;
    v_st_id       := v_st.id;
    v_term_start  := v_st.period_start;
    v_term_end    := v_st.period_end;
    -- The carrier column keeps its meaning: a HUMAN said this, rather than an extraction having
    -- read it off a page. The stated-term lane has no 'extracted' arm at all.
    v_basis_kind  := 'human_stated';
  end if;

  v_lines   := v_sched -> 'period_lines';
  v_n       := (v_sched ->> 'period_count')::int;
  v_total   := (v_sched ->> 'total_cents')::bigint;
  -- v1 names the released leg `prepaid_account_code`; v2 names it `release_account_code`, because
  -- the leg it releases may be a liability. ONE local either way.
  v_prepaid := coalesce(v_sched ->> 'prepaid_account_code', v_sched ->> 'release_account_code');

  -- ---- #940 — THE ROSTER IS ASKED FIRST, AND THE WALL AFTERWARDS. ----
  --
  -- WHAT THIS CLOSES, and it is 0223's own carried-forward note rather than a new worry. The wall
  -- below is NEGATIVE — is this leg ineligible? — so an ordinary asset account with no class, no
  -- bank stamp and no reserved role passes it, on BOTH lanes. A utility deposit, an inventory
  -- purchase and a prepaid tax all satisfy every predicate this door had, and each one could be
  -- amortised into expense for a whole stated term with every entry balanced and every period
  -- receipted. The missing half was a POSITIVE statement that this account holds prepayments, and
  -- 0306 carries it: a per-client roster, enrolled by a bookkeeper with a stated reason.
  --
  -- WHY THE ORDER IS ROSTER-THEN-WALL (the brief's own words, and owner decision 6 behind them).
  -- Every reason an account can NEVER be enrolled — unknown, inactive, control-class, bank-bound,
  -- reserved by the fixed-asset or staff-advance roster — is answered at the ENROLMENT door, with
  -- a stated reason, where the person is deciding about the account. Here the person is amortising
  -- a prepayment, and the one useful answer is "this account is not on the roster; here is where
  -- to put it". So an account that fails both is told about the roster, and the wall still guards
  -- the accounts the roster admits (an account enrolled while eligible can be bound as a bank
  -- account the next day).
  --
  -- THE TOKEN IS 0140'S OWN `prepayment_source_unfit` WITH A NEW AXIS. The brief's line is "its
  -- ineligibility refusal gains a not-enrolled axis that names the roster panel" — one axis, not a
  -- second vocabulary, so every surface already rendering this refusal renders this one.
  --
  -- ONE SPELLING, THREE CALLERS. `clara._prepayment_account_enrolled` is the same predicate §G's
  -- arm B asks, so the band can never advertise a recognition this door would refuse; #915's OBO
  -- twin and #941's deferred-revenue mirror ask it too, with their own purpose.
  --
  -- #915 — AND THE TWIN NOW ASKS IT BY BEING HERE. The OBO door does not copy these five lines: it
  -- calls this core, so the roster question, its order relative to the shared wall, its token, its
  -- axis, its remedy and its panel are ONE body for both entrances. The brief's "whichever of #915
  -- and #940 lands second carries the check into the other's door" is discharged by having no
  -- second door to carry it into.
  --
  -- A SCHEDULE ALREADY RUNNING IS NEVER RE-CHECKED (owner decision 3). This call is the only place
  -- a NEW schedule is born; nothing on the plan lane's monthly admission path asks the roster, so
  -- retiring an account closes the future and leaves the past posting to term end.
  if not clara._prepayment_account_enrolled(p_client, v_prepaid, 'prepayment') then
    raise exception 'account % is not enrolled as a prepayment account for this client', v_prepaid
      using errcode='CLR10',
        detail=jsonb_build_object('reason','prepayment_source_unfit',
          'reason_text','account ' || v_prepaid || ' is not enrolled as a prepayment account for this client',
          'axis','prepaid_account_not_enrolled', 'prepaid_account_code', v_prepaid,
          'source_entry', p_source_entry,
          'remedy','clara.enrol_prepayment_account',
          'panel','client_registers_prepayment_accounts')::text;
  end if;

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
  --
  -- #939: it guards BOTH lanes, because it is asked AFTER the branch on the leg either lane picked.
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
  --
  -- #915 — AND THROUGH `clara._prepayment_plan_core` ON THE OBO LANE, FOR A MEASURED REASON.
  -- `clara.create_accounting_plan` resolves its actor through `clara._human_ctx` ->
  -- `clara.jwt_sub()` (0193, 0004:299-308), and a `clara_runtime` connection carries no
  -- `request.jwt.claims` at all, so nesting it here would raise CLR04 `no authenticated actor` on
  -- EVERY OBO call — the exact reason `clara.create_accrual_adjustment_for` (0222) nests
  -- `clara._accrual_plan_core` instead of 0193's door. The two steps write the SAME plan row, the
  -- SAME first revision, the same overlap warning and the same audit line, and §A asks
  -- `clara._authority_ref_refusal` — 0250's ONE definition — so the two lanes cannot drift on the
  -- one judgement that matters here: whether the instruction cited is a PERSON'S.
  --
  -- THE ONE DELIBERATE DIFFERENCE, stated rather than left to be found: the human lane additionally
  -- holds the nested `op_key || ':plan'` reservation 0193's own door takes, and the OBO lane does
  -- not. It costs the OBO lane nothing — the outer `create_prepayment_schedule` key already covers
  -- the whole configuration, and a second reservation under a DERIVED key would only be reachable
  -- by a caller that could name it, which no runtime caller can.
  --
  -- #1050 (0338 §F) -- AND THERE IS STILL NO THIRD ARM. The 'wake' lane joins the OBO arm rather
  -- than growing one of its own, for the same reason #1036's fix round deleted
  -- `clara._prepayment_plan_core_wake`: a third plan-writing body is a third place for the
  -- authority wall to drift. What the wake lane carries that the OBO lane does not is its
  -- AUTHORITY, and §F bound that above -- `v_plan_author`, `v_auth_kind`, `v_auth_ref` -- so this
  -- step reads one set of locals whichever lane filled them. Two arms, two plan-writing bodies,
  -- both asking clara._authority_ref_refusal -- the invariant this door carries end to end.
  --
  -- ON THE HUMAN ARM NOTHING MOVED AT ALL: `clara.create_accounting_plan` is not widened by this
  -- file (it still admits one authority kind), and the literal it is passed is the literal it was
  -- always passed.
  if p_lane = 'human' then
    v_plan := clara.create_accounting_plan(
      p_client => p_client, p_kind => 'amortisation_schedule', p_purpose => btrim(p_purpose),
      p_authority_kind => 'explicit_instruction', p_authority_ref => p_authority_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis, p_reversal_day_rule => null, p_op_key => p_op_key || ':plan');
  else
    v_plan := clara._prepayment_plan_core(
      p_firm => p_firm, p_client => p_client, p_author => v_plan_author,
      p_purpose => btrim(p_purpose),
      p_authority_kind => v_auth_kind, p_authority_ref => v_auth_ref,
      p_frequency => 'monthly', p_day_rule => 'last_day_of_month', p_day_of_month => null,
      p_timezone => 'Asia/Kuala_Lumpur', p_effective_from => v_from, p_effective_to => v_to,
      p_basis => v_basis);
  end if;
  v_plan_id := (v_plan ->> 'plan_id')::uuid;
  v_rev_id  := (v_plan ->> 'revision_id')::uuid;

  -- LOCK ORDER RUNG 1, taken here too although this door reaches no `clara.accounting_work`: the
  -- plan row is the lane's first rung (0193:253-262) and a writer that took the schedule row first
  -- would be the one that later constructs the cycle 0193 exists to prevent.
  perform 1 from clara.accounting_plans where id = v_plan_id for update;

  -- #939 — THE EVALUATOR VERSION ROW THIS SCHEDULE ACTUALLY RODE, resolved by the entrypoint
  -- signature of the evaluator the branch above chose rather than by a literal.
  select e.id into v_eval from clara.evaluator_versions e
   where e.evaluator_name = 'prepayment_schedule'
     and e.entrypoint_signature = case when v_term_source = 'human_stated'
       then 'clara.prepayment_schedule_v2(bigint,text,text,date,date)'
       else 'clara.prepayment_schedule_v1(uuid,uuid)' end
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
        created_by, term_source, stated_term_id)
      values (p_firm, p_client, v_plan_id, 'amortisation_schedule',
        (v_plan ->> 'revision')::int, p_source_entry, v_prepaid, v_acct.account_code, v_basis_text,
        v_sp_id, v_doc, v_term_start, v_term_end, v_basis_kind,
        v_paired, v_total, v_n, coalesce(v_sched ->> 'remainder_placement', 'final_period'),
        coalesce(v_sched ->> 'schedule_version', 'v1'), v_eval, p_actor,
        v_term_source, v_st_id)
      returning id into v_sid;
  exception when unique_violation then
    -- The read runs in the OUTER transaction, after the failed subtransaction rolled back, so the
    -- winner is visible by now. `v_existing` may still be null if some OTHER unique index fired --
    -- in which case the payload says so by carrying a null schedule_id rather than pretending.
    select s.id into v_existing from clara.prepayment_schedules s
     where s.source_entry_id = p_source_entry and s.firm_id = p_firm and s.superseded_at is null;  -- 0317 (#939 AC4 / #941 AC3): the LIVE one
    raise exception 'this prepayment is already amortised by an existing schedule'
      using errcode='CLR13',
        detail=jsonb_build_object('reason','prepayment_schedule_exists',
          'schedule_id', v_existing, 'source_entry', p_source_entry,
          'raced', true)::text;
  end;

  -- #1050 (0338 §F) -- THE FOURTH ARGUMENT IS THE WAKE KIND ON THE WAKE LANE, null on the two
  -- human ones, which is exactly what `clara.audit_log.via_wake_kind` exists to carry. Without it
  -- this row would read as something a person did -- `clara.agent_user_id()` is a person-shaped
  -- row -- and the only thing telling a clocked configuration from a typed one would be an actor
  -- id a reader has to recognise. #1036's AC4 asks for the instruction, the wake and the plan to
  -- be readable as ONE chain; the plan row carries the instruction end, and this is the wake end.
  perform clara._audit(p_firm, p_actor, null,
    case when p_lane = 'wake' then p_authority_ref ->> 'wake_kind' else null end,
    'create_prepayment_schedule', null,
    jsonb_build_object('client', p_client, 'schedule', v_sid, 'plan', v_plan_id,
      'source_entry', p_source_entry, 'service_period', v_sp_id,
      'term_source', v_term_source, 'stated_term', v_st_id,
      'expense_account', v_acct.account_code, 'periods', v_n, 'total_cents', v_total,
      'op_key', p_op_key));

  v_result := jsonb_build_object(
    'schedule_id', v_sid, 'plan_id', v_plan_id, 'revision_id', v_rev_id,
    'revision', (v_plan ->> 'revision')::int, 'status', v_plan ->> 'status',
    'kind', 'amortisation_schedule',
    'client_id', p_client, 'source_entry_id', p_source_entry, 'document_id', v_doc,
    'service_period_id', v_sp_id, 'basis_kind', v_basis_kind,
    -- #939 — WHERE THE TERM CAME FROM, in the door's own answer, so a surface never has to infer
    -- it from the absence of a document id.
    'term_source', v_term_source, 'stated_term_id', v_st_id,
    'term_start', to_char(v_term_start, 'YYYY-MM-DD'),
    'term_end', to_char(v_term_end, 'YYYY-MM-DD'),
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
  return clara._finish_op(p_firm, 'create_prepayment_schedule', p_op_key, v_result);
end 
$c0338_psc$;

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, read off the LIVE catalog rather than off this
--         file's own text.
-- =====================================================================================
do $c0338_tail$
declare
  v_n int;
begin
  -- 1 · THE RELATION IS FORCED-RLS, SELECT-ONLY FOR THE HUMAN LANE, AND REACHED BY NO MACHINE ROLE.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'firm_standing_instructions'
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 1 then
    raise exception '0338 tail: clara.firm_standing_instructions is not forced-RLS'
      using errcode='CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.firm_standing_instructions', 'SELECT') then
    raise exception '0338 tail: the human lane cannot read the firm''s own standing instructions'
      using errcode='CLR10';
  end if;
  if has_table_privilege('clara_authenticated', 'clara.firm_standing_instructions', 'INSERT')
     or has_table_privilege('clara_authenticated', 'clara.firm_standing_instructions', 'UPDATE')
     or has_table_privilege('clara_authenticated', 'clara.firm_standing_instructions', 'DELETE') then
    raise exception '0338 tail: the human lane holds a WRITE privilege on the standing-instruction relation -- the doors are the only writer'
      using errcode='CLR10';
  end if;
  if has_table_privilege('clara_runtime', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_agent_ro', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_wake_interactive', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_wake_proactive', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('public', 'clara.firm_standing_instructions', 'SELECT') then
    raise exception '0338 tail: a machine lane holds a direct grant on the standing-instruction relation -- every machine reader goes through a definer body'
      using errcode='CLR10';
  end if;

  -- 2 · ONE LIVE INSTRUCTION PER (FIRM, KEY), structurally.
  select count(*) into v_n from pg_indexes
   where schemaname = 'clara' and tablename = 'firm_standing_instructions'
     and indexname = 'uq_firm_standing_instructions_live';
  if v_n <> 1 then
    raise exception '0338 tail: the one-live-instruction-per-(firm,key) index is absent'
      using errcode='CLR10';
  end if;

  -- 3 · THE RECORDING DOOR IS THE HUMAN LANE'S ALONE.
  if not has_function_privilege('clara_authenticated',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0338 tail: clara_authenticated lost EXECUTE on the recording door'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_wake_interactive',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_wake_proactive',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('public',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0338 tail: a machine lane reached the recording door -- an instruction a machine recorded would name nobody'
      using errcode='CLR10';
  end if;

  -- 3b · THE WITHDRAW DOOR IS THE HUMAN LANE'S ALONE, on the same terms as the recording door.
  if not has_function_privilege('clara_authenticated',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0338 tail: clara_authenticated lost EXECUTE on the withdraw door'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_wake_interactive',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('clara_wake_proactive',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or has_function_privilege('public',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0338 tail: a machine lane reached the withdraw door -- a firm''s delegation is taken back by a person'
      using errcode='CLR10';
  end if;

  -- 4 · THE AUTHORITY-KIND WALL IS WIDENED BY ONE AND STILL CLOSED, read off the constraint
  --     definition rather than off this file's own text.
  select count(*) into v_n from pg_constraint
   where conrelid = 'clara.accounting_plans'::regclass
     and conname = 'accounting_plans_authority_kind_check'
     and pg_get_constraintdef(oid) like '%explicit_instruction%'
     and pg_get_constraintdef(oid) like '%standing_instruction%'
     and pg_get_constraintdef(oid) not like '%authority_rule%';
  if v_n <> 1 then
    raise exception '0338 tail: the authority-kind CHECK is not {explicit_instruction, standing_instruction}'
      using errcode='CLR10';
  end if;

  -- 5 · THE FOURTH ARM RESOLVES, DRIVEN rather than read: an id this database does not hold is
  --     unresolved, which is only reachable if the arm exists at all (an unknown kind RAISES).
  if clara._authority_ref_refusal('firm_standing_instruction',
       '00000000-0000-4000-8000-00000000dead'::uuid, gen_random_uuid(), gen_random_uuid())
     is distinct from 'authority_ref_unresolved' then
    raise exception '0338 tail: clara._authority_ref_refusal does not carry the firm_standing_instruction arm'
      using errcode='CLR10';
  end if;

  -- 6 · THE HUMAN PLAN DOOR IS NOT WIDENED. §E gives the second kind to the OBO twin alone, and
  --     that asymmetry is a decision rather than an oversight, so it is asserted.
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)'::regprocedure
     and p.prosrc like '%p_authority_kind is distinct from ''explicit_instruction'' then%'
     and p.prosrc not like '%standing_instruction%';
  if v_n <> 1 then
    raise exception '0338 tail: clara.create_accounting_plan was widened -- the ruling gives the second kind to the unattended lane only'
      using errcode='CLR10';
  end if;

  -- 7 · #977's CLOSED WORLD OF READERS IS UNMOVED. `p977.definition.one` asserts exactly three
  --     bodies read the shared definition; this file adds none, and says so here too.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname <> '_authority_ref_refusal'
     and p.prosrc like '%clara._authority_ref_refusal(%';
  if v_n <> 3 then
    raise exception '0338 tail: % bodies read clara._authority_ref_refusal -- #977''s closed world is three', v_n
      using errcode='CLR10';
  end if;

  -- 8 · THE CLOCKED LANE NOW READS THE INSTRUCTION. Structural rather than a sha pin: this body
  --     is recut by this lane's own earlier tickets, so what matters is that the arm is there.
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)'::regprocedure
     and p.prosrc like '%clara.firm_standing_instructions%'
     and p.prosrc like '%wake_authority_absent%'
     and p.prosrc like '%wake_authority_lapsed%';
  if v_n <> 1 then
    raise exception '0338 tail: the prepayment schedule core does not resolve a firm standing instruction on its wake arm'
      using errcode='CLR10';
  end if;

  -- 9 · AND STILL NOTHING IS ADMITTED ON THE AGENT'S OWN AUTHORITY -- the invariant #1036's fix
  --     round left behind, asserted over the WHOLE schema rather than over a name.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and p.prosrc ilike '%insert into clara.accounting_plans%'
     and p.prosrc ilike '%agent_user_id%';
  if v_n <> 0 then
    raise exception '0338 tail: % clara body(ies) write an accounting plan under the agent identity -- such a plan could never admit an occurrence', v_n
      using errcode='CLR10';
  end if;

  -- 10 · THE DEFERRED-REVENUE TWIN GAINED NO WAKE LANE, and no wake wrapper exists for it.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname like 'wake_%'
     and p.prosrc like '%_revenue_recognition_core%';
  if v_n <> 0 then
    raise exception '0338 tail: a wake wrapper reaches the deferred-revenue core -- this file gives that side no standing instruction'
      using errcode='CLR10';
  end if;

  raise notice '0338 tail OK -- a named member of the firm can record a standing instruction, the clocked prepayment lane finds it, and nothing is admitted on the agent''s own authority';
end $c0338_tail$;
