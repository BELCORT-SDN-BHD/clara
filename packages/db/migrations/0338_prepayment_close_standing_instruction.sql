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
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates one
                                        -- small relation, writes no row, and backfills nothing.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0338_pre$
declare
  v_n int; v_def text;
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

  raise notice '0338 prestate OK';
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

  raise notice '0338 tail OK -- a named member of the firm can record a standing instruction';
end $c0338_tail$;
