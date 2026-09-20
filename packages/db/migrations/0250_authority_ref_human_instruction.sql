-- 0250_authority_ref_human_instruction -- #977 (riders wave 2, lane 04): AN AUTHORITY
-- REFERENCE INTO THE CHAT LANE IS ACCEPTED ONLY WHEN IT NAMES A HUMAN-AUTHORED CHAT TURN, IN
-- BOTH DOORS THAT RESOLVE ONE.
-- =====================================================================================
-- Spec of record: issue #977 -- "Rule what counts as a person's instruction for authority_ref
-- across the fixed-asset and plan lanes", and the OWNER'S RULING of 2026-09-20 recorded on it.
-- Builds on 0193 (the plan door's resolution, recut by 0223), 0227/#651 (the depreciation
-- signing door's identical copy) and 0222 (the accrual lane's third copy, DELIBERATELY out of
-- scope -- see "WHAT THIS FILE DOES NOT DO").
--
-- =====================================================================================
-- THE DEFECT, IN ONE PARAGRAPH.
--
-- `clara.sign_depreciation_authority` and `clara.create_accounting_plan` both accept an
-- `authority_ref` object whose `kind` is `accounting_work` or `chat_task`, then resolve it by a
-- BARE EXISTENCE TEST: a row with that id, in the same firm and client. The named row's own
-- kind, status and author are never read, and both bodies said so in their own comments. The
-- `chat_task` arm looks the id up in `clara.agent_tasks`, whose kind vocabulary admits
-- `chat_turn`, `wake`, `autodraft`, `close_prep` and `accounting_work` (0178:510-512); of those
-- only a `chat_turn` is typed by a person, and a `wake` row carries no author BY CONSTRUCTION
-- (0120:1450's wake arm derives firm and client from the intent and stamps no `created_by`). A
-- task the system enqueued for itself therefore satisfied the same check as an instruction
-- somebody actually gave. MEASURED on this rig before this file: the whole fixed-asset suite
-- signed its authorities with an `autodraft` task minted by
-- `packages/db/tests/fa-authority-sign-compat.mjs`, and the door accepted every one.
--
-- THE `accounting_work` ARM IS NOT PART OF THE GAP, and the owner's ruling says so explicitly: a
-- Work row cannot exist without an initiator -- `clara.accounting_work.initiator uuid NOT NULL
-- references clara.users(id)` (0178:308) -- so its existence IS proof that a person asked. That
-- arm is carried through UNCHANGED.
--
-- =====================================================================================
-- THE FIX: ONE DEFINITION, READ BY BOTH DOORS.
--
-- `clara._authority_ref_refusal(p_ref_kind text, p_ref_id uuid, p_firm uuid, p_client uuid)
-- returns text` is the ONE place the estate answers "does this reference name a person's
-- instruction?". It takes the `{kind, id}` pair each door has ALREADY validated for shape (each
-- door keeps its own `authority_ref_invalid` wall, untouched), plus the firm and client ladder
-- both doors already applied, and answers:
--
--     null                                  -- it names a person's instruction: accept
--     'authority_ref_unresolved'            -- it names no row of this firm AND client at all
--     'authority_ref_not_human_instruction' -- it names a real row that is NOT a person's
--                                              instruction
--
-- WHY A REASON TOKEN RATHER THAN A BOOLEAN PREDICATE. The ticket requires "a reason token
-- distinct from the existing unresolved-reference token, so 'there is no such row' and 'that row
-- is not a person's instruction' can be told apart by a caller and by a test", AND that each
-- door keep its own typed error class (CLR38 for the fixed-asset family, CLR10 for the plan
-- family) and its own sentences. A boolean cannot carry that distinction, and two booleans would
-- be two definitions to keep in step -- which is the defect this ticket exists to close. One
-- function returning the token keeps ONE definition and lets each door map it to its own class.
--
-- THE CHAT-LANE RULE, in full: the named `clara.agent_tasks` row must be of kind `chat_turn` AND
-- carry a non-null `created_by`. Every other kind is refused, INCLUDING the kinds that do carry
-- an author (`autodraft`, `close_prep`, `accounting_work`), because an agent run is not an
-- instruction; and a `chat_turn` with no author is refused too, because authorship is the other
-- half of the claim. The firm-and-client ladder is exactly the one both doors already applied.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO.
--
--   * It does not touch `clara._accrual_plan_core` (0222:978), which carries a THIRD copy of the
--     same existence test for the accrual lane. The owner's ruling of 2026-09-20 is precise and
--     smaller than the ticket's own recommendation: "only the chat-lane arm of the existing
--     resolution changes, in both places that resolve an authority reference today, the
--     depreciation authority signing door and the accounting plan creation door". The accrual
--     lane is named OUT OF SCOPE by the brief ("Any other lane's use of an authority reference")
--     and its body is PINNED UNMOVED here (prestate and T.5) so the omission is deliberate and
--     visible rather than an oversight. The lane report files the follow-up.
--   * It does not touch `clara.create_prepayment_schedule` (0223:1025), which PASSES its caller's
--     `p_authority_ref` straight through to `clara.create_accounting_plan` and therefore inherits
--     the new rule without a line of its own. Pinned unmoved too.
--   * It does not widen or narrow which reference KINDS are admitted at all (`accounting_work`
--     and `chat_task`, in both doors, unchanged), does not change either door's signature,
--     grants, floor or any other refusal, and does not change how agent tasks are created or how
--     wake tasks are enqueued.
-- =====================================================================================

do $p977_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false; v_live_sign text; v_n int;
  -- The inline CHAT-LANE EXISTENCE TEST this file removes from the two doors, normalized EXACTLY
  -- the way the tail compares live source (comments stripped, lowercased, whitespace runs
  -- collapsed to one space) -- measured off pg_proc.prosrc on the lane-04 rig, never transcribed
  -- from a migration file's own text. It is the substring the three copies share (the token
  -- after `t.firm_id =` differs per body: `c.firm`, `v_firm`, `p_firm`).
  c_inline constant text := 'from clara.agent_tasks t where t.id = v_ref_id and t.firm_id =';
  -- PRE-IMAGES, MEASURED on this rig now off pg_proc.prosrc.
  c_sign_pre constant text :=
    '25eee9776eb30aefe1b7b1f7157df2b3032daa132b12f0526ad8d8bbb4e480c3';
begin
  if to_regprocedure('clara.sign_depreciation_authority(uuid,uuid,text,jsonb)') is null then
    raise exception '#977 prestate: clara.sign_depreciation_authority(uuid,uuid,text,jsonb) is absent -- 0227 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)') is null then
    raise exception '#977 prestate: clara.create_accounting_plan is absent -- 0193/0223 must apply first'
      using errcode='CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied, unmerged
  -- migration after an edit.) Every statement below is `create or replace`, which is safe over
  -- this file's own old effects, but a prestate pinned to the PRE-recut image would refuse the
  -- redo outright. Admitted LOUDLY, and only on the one signal that means it: the one function
  -- this file mints is already live.
  if to_regprocedure('clara._authority_ref_refusal(text,uuid,uuid,uuid)') is not null then
    v_redo := true;
    select p.prosrc into v_live_sign from pg_proc p
     where p.oid = 'clara.sign_depreciation_authority(uuid,uuid,text,jsonb)'::regprocedure;
    raise notice '#977 prestate: clara._authority_ref_refusal is ALREADY live -- treating this as a #957 REDO of 0250 itself (the signing door currently % it). Every statement here is create-or-replace and the tail re-proves the whole post-state from scratch.',
      case when position('clara._authority_ref_refusal(' in v_live_sign) > 0 then 'calls' else 'does NOT yet call' end;
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc. The
  -- RECUT entries are skipped on a redo (their pre-image is this file's OWN prior effect, not the
  -- pin below); the tail re-reads every one afterwards to confirm the final state either way.
  for v_pin in select * from (values
      ('clara.sign_depreciation_authority(uuid,uuid,text,jsonb)', c_sign_pre, 'recut'),
      ('clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)',
       '06effb07798e69f8f316c2b97ab4e766cad7895f8cca45508699be31f8e5b7d3', 'recut'),
      -- NON-REGRESSION: the two bodies the owner's ruling leaves alone are untouched by this
      -- file at all.
      ('clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)',
       'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8', 'unmoved'),
      ('clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
       'aa917dfd042be429eb62c96c7b2075003c097ac445e77d9a35501762740f506f', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#977 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.0 THE INLINE EXISTENCE TEST IS STILL LIVE IN EXACTLY THE THREE BODIES THIS ESTATE HAS --
  -- the pre-condition for calling this a FOLD of a duplication rather than an independent
  -- rewrite, and the proof that the accrual lane's copy is the one the ruling leaves alone.
  -- Meaningless on a redo (a recut body no longer carries it at all).
  if not v_redo then
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and position(c_inline in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
    if v_n <> 3 then
      raise exception '#977 prestate: the inline chat-lane existence test lives in % clara function(s), expected exactly 3 (sign_depreciation_authority, create_accounting_plan, _accrual_plan_core)', v_n
        using errcode='CLR10';
    end if;
  end if;

  raise notice '#977 prestate: clean -- both doors are at their measured pre-images (or, on a redo, this file''s own prior effect), the accrual core and the prepayment door are unmoved, and (pre-redo) the inline chat-lane existence test lives in exactly the three bodies this estate has.';
end
$p977_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE ONE DEFINITION. An UNGRANTED INTERNAL: owned by `clara_fn_owner` like its siblings
--     (`_fa_assert_particulars_completable`, `_fa_depreciation_leg_pairing`), `stable` (it reads
--     two relations and writes nothing -- the language itself refuses to let it write), EXECUTE
--     revoked from PUBLIC and granted to no role, so it is reachable only from another SECURITY
--     DEFINER body already running as the owner.
-- =====================================================================================
create or replace function clara._authority_ref_refusal(p_ref_kind text, p_ref_id uuid,
    p_firm uuid, p_client uuid) returns text
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_kind text;
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
    -- then the row's OWN kind: only a `chat_turn` is a turn a person typed. `wake`, `autodraft`,
    -- `close_prep` and `accounting_work` are runs the estate started for itself.
    select t.kind into v_kind from clara.agent_tasks t
     where t.id = p_ref_id and t.firm_id = p_firm and t.client_id = p_client;
    if not found then
      return 'authority_ref_unresolved';
    end if;
    if v_kind = 'chat_turn' then
      return null;
    end if;
    return 'authority_ref_not_human_instruction';
  end if;

  -- UNREACHABLE FROM EITHER DOOR: both refuse an unknown `kind` with their own
  -- `authority_ref_invalid` wall before they ever call this. A raise rather than a quiet
  -- refusal, so a future lane that widens the admitted kinds finds this line instead of a
  -- silent "unresolved".
  raise exception 'clara._authority_ref_refusal: unknown authority reference kind %', coalesce(p_ref_kind, '(null)')
    using errcode = 'CLR10';
end $$;
revoke all on function clara._authority_ref_refusal(text, uuid, uuid, uuid) from public;
comment on function clara._authority_ref_refusal(text, uuid, uuid, uuid) is
  '#977 (0250): THE ONE definition of what counts as a person''s instruction for an '
  'authority_ref. Takes the {kind, id} pair a door has already validated for SHAPE, plus the '
  'firm and client ladder that door already applied. Returns null when the reference names a '
  'person''s instruction; ''authority_ref_unresolved'' when it names no row of this firm and '
  'client at all; ''authority_ref_not_human_instruction'' when it names a real chat-lane row '
  'that is not a person''s instruction. An accounting_work reference resolves by EXISTENCE '
  'alone, unchanged, because clara.accounting_work.initiator is NOT NULL. A chat_task reference '
  'resolves only for a chat_turn task carrying an author. Read by '
  'clara.sign_depreciation_authority and clara.create_accounting_plan; each door keeps its own '
  'error class and its own sentences. An UNGRANTED internal: EXECUTE revoked from public, '
  'granted to no role.';

-- =====================================================================================
-- §B  THE FIXED-ASSET LANE'S DOOR. `clara.sign_depreciation_authority` (0041:3316, recut by
--     0227) -- signature, grants, ADMIN+ floor, replay identity, window floor and every OTHER
--     refusal UNCHANGED. Only the resolution in the middle now reads the shared definition.
-- =====================================================================================
create or replace function clara.sign_depreciation_authority(p_client uuid, p_authority uuid,
    p_op_key text, p_authority_ref jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $p977sign$

declare c record; v_dedupe jsonb; v_firm uuid; au record;
        v_ref_kind text; v_ref_id uuid; v_reason text; v_from date;
begin
  -- WD-R9: the SIGN floor is ADMIN+. Depreciation is the strongest autopost case in the
  -- product; the signature is what the autonomy derives from, so it sits with the firm's
  -- administration, not with whoever coded the asset.
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- THE REPLAY IDENTITY IS UNMOVED (client + authority). The instruction reference is validated
  -- before anything is written, so a replay of the same signature returns the first receipt
  -- whatever reference the retry carried -- which is what a lost response needs.
  v_dedupe := clara._reserve_op(c.firm, 'sign_depreciation_authority', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'authority', p_authority)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into au from clara.fa_depreciation_authorities
    where id = p_authority and client_id = p_client for update;
  if not found then
    raise exception 'depreciation authority is not in this client' using errcode = 'CLR11';
  end if;
  if au.status <> 'proposed' then
    raise exception 'only a proposed depreciation authority can be signed'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'authority_already_live', 'status', au.status)::text;
  end if;
  if exists (select 1 from clara.fa_depreciation_authorities
             where client_id = p_client and status = 'live') then
    raise exception 'this client already has a live depreciation authority; retire it first'
      using errcode = 'CLR38', detail = '{"reason":"authority_already_live"}';
  end if;

  -- 0227 (#651, AC5): THE EXPLICIT INSTRUCTION, SHAPED THEN RESOLVED.
  if p_authority_ref is null or jsonb_typeof(p_authority_ref) <> 'object' then
    raise exception 'a depreciation authority names the instruction that carries it'
      using errcode = 'CLR38',
        detail = '{"reason":"authority_ref_invalid","constraint":"object"}';
  end if;
  v_ref_kind := p_authority_ref ->> 'kind';
  if v_ref_kind is null or v_ref_kind not in ('accounting_work', 'chat_task') then
    raise exception 'a depreciation authority reference names an accounting_work or a chat_task'
      using errcode = 'CLR38',
        detail = '{"reason":"authority_ref_invalid","constraint":"kind"}';
  end if;
  begin
    v_ref_id := (p_authority_ref ->> 'id')::uuid;
  exception when others then
    v_ref_id := null;
  end;
  if v_ref_id is null then
    raise exception 'a depreciation authority reference names a row by id'
      using errcode = 'CLR38',
        detail = '{"reason":"authority_ref_invalid","constraint":"id"}';
  end if;
  -- #977 (0250): RESOLVED, not merely well-shaped, and in the SAME firm AND client -- and, on
  -- the CHAT-LANE arm, a PERSON'S INSTRUCTION rather than a task the estate enqueued for itself.
  -- THE ANSWER IS NOT WRITTEN HERE. clara._authority_ref_refusal is the ONE definition this door
  -- and clara.create_accounting_plan both read, so the firm can never hold two meanings for "an
  -- instruction a person gave" (#977's ruling; #651's own fix-round report filed the residual).
  -- It returns null when the reference names a person's instruction and otherwise the reason
  -- token; this door keeps its OWN error class (CLR38) and its own sentences.
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, c.firm, p_client);
  if v_reason = 'authority_ref_not_human_instruction' then
    raise exception 'the instruction this depreciation authority cites is not a person''s instruction'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', v_reason,
          'kind', v_ref_kind, 'id', v_ref_id)::text;
  elsif v_reason is not null then
    raise exception 'the instruction this depreciation authority cites does not exist for this client'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', v_reason,
          'kind', v_ref_kind, 'id', v_ref_id)::text;
  end if;

  -- 0227 (#651, D8): THE WINDOW'S FLOOR, WRITTEN ONCE AND FROZEN. The first day of the SIGNING
  -- month in the BOOK's calendar -- never `now()` read in whatever zone the session carries.
  v_from := clara._fa_month_start(clara._fa_today());

  update clara.fa_depreciation_authorities set status = 'live', signed_by = c.actor,
    signed_at = now(), signed_op_key = p_op_key,
    authority_ref = p_authority_ref, authority_from = v_from
    where id = p_authority;
  perform clara._audit(c.firm, c.actor, null, null, 'sign_depreciation_authority', null,
    jsonb_build_object('client', p_client, 'authority', p_authority, 'op_key', p_op_key,
      'authority_ref', p_authority_ref, 'authority_from', v_from));
  return clara._finish_op(c.firm, 'sign_depreciation_authority', p_op_key,
    jsonb_build_object('authority_id', p_authority, 'client_id', p_client, 'status', 'live',
      'cadence', au.cadence, 'authority_ref', p_authority_ref, 'authority_from', v_from));
end $p977sign$;
comment on function clara.sign_depreciation_authority(uuid,uuid,text,jsonb) is
  '#651: sign a proposed depreciation authority. ADMIN+ (WD-R9). p_authority_ref is REQUIRED and '
  'RESOLVED against clara.accounting_work / clara.agent_tasks in the same firm AND client; '
  '#977 (0250): a chat_task reference resolves only for a chat_turn task carrying an author, '
  'through the shared clara._authority_ref_refusal, and anything else is refused '
  'authority_ref_not_human_instruction -- distinct from authority_ref_unresolved. '
  'authority_from is stamped as the first day of the signing month in Asia/Kuala_Lumpur and '
  'never moves again. Replaces the three-argument door (0041:3316) -- one pg_proc row, no '
  'overload.';

-- =====================================================================================
-- §C  THE PLAN LANE'S DOOR. `clara.create_accounting_plan` (0193:1438, recut by 0223) --
--     signature, grants, BOOKKEEPER+ floor, the supported-kind list, the schedule assertion,
--     the basis predicate, the reservation payload, the overlap warning and the audit row all
--     UNCHANGED. Only the resolution in the middle now reads the SAME shared definition the
--     signing door reads, which is the whole point of the ticket: one meaning of "an
--     instruction a person gave", not two.
-- =====================================================================================
create or replace function clara.create_accounting_plan(
    p_client uuid, p_kind text, p_purpose text,
    p_authority_kind text, p_authority_ref jsonb,
    p_frequency text, p_day_rule text, p_day_of_month int, p_timezone text,
    p_effective_from date, p_effective_to date,
    p_basis jsonb, p_reversal_day_rule text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $p977plan$

declare
  v_actor uuid; v_firm uuid; v_client_firm uuid; v_client_status text;
  v_dedupe jsonb; v_plan uuid; v_rev uuid; v_digest text; v_auto boolean;
  v_ref_kind text; v_ref_id uuid; v_reason text; v_warning jsonb; v_next jsonb; v_result jsonb;
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
  -- #977 (0250): RESOLVED, not merely well-shaped -- and, on the CHAT-LANE arm, a PERSON'S
  -- INSTRUCTION rather than a task the estate enqueued for itself. A Knowledge preference, a
  -- calculation policy or a repeated debit has no row here, so none of them can supply authority
  -- (#640's own criterion); an agent run HAS one, and #977 is the ruling that stops it counting.
  -- clara._authority_ref_refusal is the ONE definition this door and
  -- clara.sign_depreciation_authority both read; this door keeps its OWN error class (CLR10).
  v_reason := clara._authority_ref_refusal(v_ref_kind, v_ref_id, v_firm, p_client);
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
end $p977plan$;

reset role;

-- =====================================================================================
-- §T  THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p977_tail$
declare
  v_src text; v_n int; v_pin record; v_sha text; v_names text[];
  c_inline constant text := 'from clara.agent_tasks t where t.id = v_ref_id and t.firm_id =';
begin
  -- T.1 THE SHARED DEFINITION EXISTS, is STABLE, SECURITY DEFINER, owned by clara_fn_owner, its
  -- search_path pinned, and grants EXECUTE to nobody -- an INTERNAL like its siblings.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._authority_ref_refusal(text,uuid,uuid,uuid)'::regprocedure
     and p.provolatile = 's' and p.prosecdef
     and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#977 tail T.1: clara._authority_ref_refusal is missing its stable/definer/owner/search_path shape'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = 'clara._authority_ref_refusal(text,uuid,uuid,uuid)'::regprocedure
     and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#977 tail T.1b: clara._authority_ref_refusal gained % grant(s) -- it is an INTERNAL, granted to nobody', v_n
      using errcode='CLR10';
  end if;

  -- T.2 THE SIGNING DOOR READS THE SHARED DEFINITION, BY ITS FULLY-QUALIFIED NAME...
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.sign_depreciation_authority(uuid,uuid,text,jsonb)'::regprocedure;
  if position('clara._authority_ref_refusal(' in v_src) = 0 then
    raise exception '#977 tail T.2: clara.sign_depreciation_authority does not read the shared definition'
      using errcode='CLR10';
  end if;
  -- ...AND NO LONGER CARRIES ITS OWN INLINE COPY -- the fold is real, not a "call it AND keep
  -- the old copy too" patch.
  if position(c_inline in lower(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0 then
    raise exception '#977 tail T.2b: clara.sign_depreciation_authority still carries its own inline chat-lane existence test -- the fold was vacuous'
      using errcode='CLR10';
  end if;
  -- ...and it BRANCHES on the new token, so the two refusals keep their own sentences and their
  -- own detail. (The UNRESOLVED token is no longer a literal in the door: the door raises with
  -- the token the shared definition RETURNED, which is how the two can never drift apart. T.4
  -- proves the shared definition still names both.)
  if position('authority_ref_not_human_instruction' in v_src) = 0 then
    raise exception '#977 tail T.2c: clara.sign_depreciation_authority does not branch on the new reason token'
      using errcode='CLR10';
  end if;

  -- T.4 THE SHARED DEFINITION NAMES BOTH TOKENS -- "there is no such row" and "that row is not a
  -- person's instruction" are two answers, in one place, and neither was quietly dropped.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._authority_ref_refusal(text,uuid,uuid,uuid)'::regprocedure;
  if position('authority_ref_unresolved' in v_src) = 0
     or position('authority_ref_not_human_instruction' in v_src) = 0 then
    raise exception '#977 tail T.4: clara._authority_ref_refusal does not name BOTH reason tokens'
      using errcode='CLR10';
  end if;
  -- ...and it reads the row's OWN kind rather than merely testing existence.
  if position('t.kind' in v_src) = 0 then
    raise exception '#977 tail T.4b: clara._authority_ref_refusal never reads the named task''s own kind -- the narrowing is vacuous'
      using errcode='CLR10';
  end if;

  -- T.3 THE SIGNING DOOR KEEPS ITS OWN SHAPE: one pg_proc row (no overload), SECURITY DEFINER,
  -- owner and search_path unmoved, PUBLIC still without EXECUTE, clara_authenticated still with
  -- it. `create or replace` preserves all of this, and this proves it did.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'sign_depreciation_authority';
  if v_n <> 1 then
    raise exception '#977 tail T.3: clara.sign_depreciation_authority has % pg_proc rows, expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.sign_depreciation_authority(uuid,uuid,text,jsonb)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#977 tail T.3b: clara.sign_depreciation_authority lost its owner, its SECURITY DEFINER flag or its pinned search_path'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.sign_depreciation_authority(uuid,uuid,text,jsonb)'::regprocedure, 'EXECUTE') then
    raise exception '#977 tail T.3c: PUBLIC gained EXECUTE on clara.sign_depreciation_authority'
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.sign_depreciation_authority(uuid,uuid,text,jsonb)'::regprocedure, 'EXECUTE') then
    raise exception '#977 tail T.3d: clara_authenticated LOST EXECUTE on clara.sign_depreciation_authority'
      using errcode='CLR10';
  end if;

  -- T.4c THE PLAN DOOR READS THE SAME DEFINITION, no longer carries its own inline copy, and
  -- branches on the new token -- the two doors now have ONE meaning of "an instruction a person
  -- gave" instead of two independently maintained ones.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure;
  if position('clara._authority_ref_refusal(' in v_src) = 0 then
    raise exception '#977 tail T.4c: clara.create_accounting_plan does not read the shared definition'
      using errcode='CLR10';
  end if;
  if position(c_inline in lower(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0 then
    raise exception '#977 tail T.4d: clara.create_accounting_plan still carries its own inline chat-lane existence test -- the fold was vacuous'
      using errcode='CLR10';
  end if;
  if position('authority_ref_not_human_instruction' in v_src) = 0 then
    raise exception '#977 tail T.4e: clara.create_accounting_plan does not branch on the new reason token'
      using errcode='CLR10';
  end if;

  -- T.4f THE INLINE EXISTENCE TEST NOW SURVIVES IN EXACTLY ONE clara FUNCTION, NAMED: the
  -- accrual lane's core, which the owner's ruling of 2026-09-20 deliberately leaves alone.
  -- Never zero (a body was rewritten out from under the ruling), never two (a door kept its
  -- copy), never a third name (somebody minted a fourth copy while this file was in flight).
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(c_inline in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_names is distinct from array['_accrual_plan_core'] then
    raise exception '#977 tail T.4f: the inline chat-lane existence test now lives in %, expected exactly {_accrual_plan_core}', v_names
      using errcode='CLR10';
  end if;

  -- T.4g ...AND EXACTLY THE TWO DOORS THE RULING NAMES READ THE ONE DEFINITION.
  select array_agg(p.proname order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname <> '_authority_ref_refusal'
     and position('clara._authority_ref_refusal(' in p.prosrc) <> 0;
  if v_names is distinct from array['create_accounting_plan', 'sign_depreciation_authority'] then
    raise exception '#977 tail T.4g: clara._authority_ref_refusal is read by %, expected exactly {create_accounting_plan, sign_depreciation_authority}', v_names
      using errcode='CLR10';
  end if;

  -- T.4h THE PLAN DOOR KEEPS ITS OWN SHAPE too: one pg_proc row, owner, definer flag,
  -- search_path, no PUBLIC grant, and clara_authenticated still holding EXECUTE.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'create_accounting_plan';
  if v_n <> 1 then
    raise exception '#977 tail T.4h: clara.create_accounting_plan has % pg_proc rows, expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure
     and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#977 tail T.4i: clara.create_accounting_plan lost its owner, its SECURITY DEFINER flag or its pinned search_path'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#977 tail T.4j: PUBLIC gained EXECUTE on clara.create_accounting_plan'
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.create_accounting_plan(uuid,text,text,text,jsonb,text,text,int,text,date,date,jsonb,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '#977 tail T.4k: clara_authenticated LOST EXECUTE on clara.create_accounting_plan'
      using errcode='CLR10';
  end if;

  -- T.5 NON-REGRESSION, re-read: the two bodies the owner's ruling leaves alone are byte-for-byte
  -- what the prestate measured. The accrual core KEEPS its own existence-only resolution; the
  -- prepayment door needs no line of its own because it passes its reference through to
  -- clara.create_accounting_plan.
  for v_pin in select * from (values
      ('clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,int,text,date,date,jsonb)',
       'b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8'),
      ('clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
       'aa917dfd042be429eb62c96c7b2075003c097ac445e77d9a35501762740f506f')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#977 tail T.5: % MOVED (measured %, expected %) -- this file recuts only the two doors the owner''s ruling names', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#977 tail OK: clara._authority_ref_refusal exists, is stable, definer-owned by clara_fn_owner and ungranted, and names BOTH reason tokens while reading the named task''s own kind; clara.sign_depreciation_authority and clara.create_accounting_plan BOTH read it, neither still carries its own inline chat-lane existence test, both branch on the new token, and each keeps its single pg_proc row, owner, definer flag, search_path and grants; the inline existence test now lives in exactly one clara function (_accrual_plan_core, which the owner''s ruling leaves alone) and exactly the two doors read the one definition; clara._accrual_plan_core and clara.create_prepayment_schedule are byte-for-byte unmoved.';
end
$p977_tail$;
