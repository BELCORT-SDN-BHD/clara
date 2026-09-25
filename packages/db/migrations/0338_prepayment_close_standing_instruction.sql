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
     '2049c1c4404e47102b375d506271938f5f3e03405fd7a25b8d303118c13a6b4a']
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
  v_keep text[][] := array[
    ['clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,integer,text,date,date,jsonb,text,text)',
     'a7c108d5dd4febbae9f98a87b42b69468aec31f1731336b2185c8e91b1b0951c'],
    ['clara._prepayment_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)',
     '266499b22d5e71c2095fccb570c301349810a0742129f33765e03f3060f72e7a'],
    ['clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
     '02ea6afe635dc9a8453d69918f5f48cb05f404f6e404973096db2ec92d0a655e'],
    ['clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
     '84348ed4365bdbc07ad0020eca307e6f12fa5fc3141903092a0764fae462693e']
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
-- §E — clara._obo_plan_core (0308 §D, recut by 0941's fold into one body). VERBATIM except the
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

  raise notice '0338 tail OK -- a named member of the firm can record a standing instruction, and a plan may cite it';
end $c0338_tail$;
