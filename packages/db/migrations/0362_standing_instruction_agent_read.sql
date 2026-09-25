-- 0362_standing_instruction_agent_read — #1147 (riders closing wave, lane 01): the firm standing
-- instruction gets the model lane's own READ door, and withdrawing one names its consequence.
-- =====================================================================================
-- Spec of record: issue #1147's body (Agent Brief, riders closing wave, 2026-09-26). Sources:
-- candidates C10, C11 and C12 of `reports/waveS-followup-candidates.md`, which are follow-ups 2, 3
-- and 4 of #1050's own report — the three halves 0338 was never given.
--
-- WHAT 0338 LEFT OPEN, AND WHICH TWO OF THE THREE THIS FILE CLOSES.
--
--   1. NO READ FOR THE CHAT MODEL. `clara.record_firm_standing_instruction` (0338:377) and
--      `clara.withdraw_firm_standing_instruction` (0338:510) are `clara_authenticated` only BY
--      DESIGN — an instruction a machine recorded would name nobody — and the relation
--      `clara.firm_standing_instructions` (0338:276) grants nothing to `clara_agent_ro` or
--      `clara_runtime` either, which 0338's own tail asserts. The member's own web read needs no
--      door (RLS scopes it, law 31), which is why nothing noticed that a chat model asked "does
--      this firm let Clara do this?" had NO door and NO relation it may read. §A mints one.
--
--   2. WITHDRAWAL DOES NOT NAME ITS CONSEQUENCE. §B (this file's second half, landed with its own
--      cells) adds ONE key to the withdraw door's answer: how many live plans the withdrawn
--      instruction authorised, which keep posting under the member who authorised them.
--      **WHAT WITHDRAWAL DOES TO A PLAN DOES NOT CHANGE HERE.** Whether it should also pause them
--      is an accounting and product ruling #1050 was not given and #1147 does not take: this file
--      makes the consequence VISIBLE and records the question (see `packages/db/README.md`).
--
--   3. THE DEFERRED-REVENUE TWIN STILL HAS NO WAKE LANE, deliberately. `clara._revenue_recognition
--      _core`'s closed lane set is ('human','obo') against `clara._prepayment_schedule_core`'s
--      ('human','obo','wake'), and no wake wrapper for the revenue side exists anywhere in the
--      catalog. 0338 held that asymmetry in a HEADER COMMENT; #1147 holds it with a CENSUS CELL
--      (`standing-instruction-agent-read.test.mjs`, `p1147.asymmetry.census`) that reads both
--      cores' lane sets and the wake allowlist off the LIVE catalog and fails the day one side is
--      widened without the other. What closing the asymmetry would cost is written out in this
--      file's README section; it is an owner ruling, not an oversight.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not move ONE grant on `clara.firm_standing_instructions`. The relation stays
--     forced-RLS, SELECT to `clara_authenticated` alone, and reachable by no machine role —
--     0338's tail assertion stays true, and this file's own tail re-reads it. §A is a SECURITY
--     DEFINER door, which is how a machine lane reads a relation it holds nothing on.
--   · It does not widen the two WRITE doors to any machine lane. They are human-only on purpose
--     and that is #1050's whole point; this file's tail re-asserts their closed ACL.
--   · It mints no database role (riders closing wave, risk 1: four lanes share one cluster and
--     0154 pins the cluster-wide role count).
--   · It builds no wake lane for the deferred-revenue twin, no wrapper, no allowlist row and no
--     second instruction key. That is item 3 above, and it is a ruling this ticket records.
--   · It touches no chat or Work tool. The frozen family is not edited here; the tool that calls
--     §A's door is a SUCCESSOR CONTRACT in this ticket's report, for a cut AFTER this wave's.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates one
                                        -- small function, writes one allowlist row and backfills
                                        -- nothing.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $c0362_pre$
declare
  v_n int; v_src text;
begin
  -- 1 · THE RELATION THIS FILE READS IS 0338's, and it is the shape §A projects from. Structural
  --     rather than a sha: a relation has no prosrc, and the five columns §A reads are the claim.
  if to_regclass('clara.firm_standing_instructions') is null then
    raise exception '0362 prestate: clara.firm_standing_instructions is absent -- 0338 is this file''s premise'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.firm_standing_instructions'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname in ('firm_id', 'instruction_key', 'reason', 'recorded_by', 'recorded_at',
                       'withdrawn_at');
  if v_n <> 6 then
    raise exception '0362 prestate: clara.firm_standing_instructions carries % of the 6 columns this file reads', v_n
      using errcode='CLR10';
  end if;

  -- 2 · …AND THE RELATION'S GRANTS ARE EXACTLY WHAT 0338's TAIL LEFT. This file must not move
  --     them, so it REFUSES TO APPLY over a database where they have already moved: a definer
  --     door added on top of a machine-readable relation would be a second, weaker story about
  --     the same wall.
  if not has_table_privilege('clara_authenticated', 'clara.firm_standing_instructions', 'SELECT') then
    raise exception '0362 prestate: the human lane cannot read the firm''s own standing instructions'
      using errcode='CLR10';
  end if;
  if has_table_privilege('clara_agent_ro', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_runtime', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_wake_interactive', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_wake_proactive', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('public', 'clara.firm_standing_instructions', 'SELECT') then
    raise exception '0362 prestate: a machine lane already holds a direct grant on the standing-instruction relation -- 0338''s tail says it holds none, and this file''s door exists precisely because it holds none'
      using errcode='CLR10';
  end if;

  -- 3 · THE WAKE PLUMBING §A RIDES, by EXACT signature (law 3: a bare name is a projection of the
  --     thing, a signature IS the thing). `clara.wake_context()` resolves the credential and
  --     re-validates its on-behalf-of human; `clara.assert_wake_allowed` is the kind gate every
  --     wake wrapper in this estate asks.
  if to_regprocedure('clara.wake_context()') is null
     or to_regprocedure('clara.assert_wake_allowed(text,text)') is null then
    raise exception '0362 prestate: the wake context/allowlist pair this file''s door rides is absent'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.wake_fn_allowlist') is null then
    raise exception '0362 prestate: clara.wake_fn_allowlist is absent' using errcode='CLR10';
  end if;

  -- 4 · THE NAME §A MINTS IS FREE, or is already this file's own (a redo, #957). Anything else
  --     refuses BY NAME rather than being silently replaced.
  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('clara.wake_get_firm_standing_instruction(text)');
  if v_src is not null and position('#1147 [0362]' in v_src) = 0 then
    raise exception '0362 prestate: clara.wake_get_firm_standing_instruction(text) already exists and is not this file''s body'
      using errcode='CLR10';
  end if;
  raise notice '0362 prestate OK -- read door %', case when v_src is null then 'FIRST' else 'REDO' end;
end $c0362_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara.wake_get_firm_standing_instruction — THE MODEL LANE'S OWN READ DOOR.
--
-- THE SHAPE IS `clara.wake_get_client_financial_pack` (0320 §C), which is
-- `clara.wake_get_payroll_settlement_candidates`' (0352 §C) and `clara.wake_get_contract_terms`'
-- (0353): resolve the wake context, refuse without a credential, ask the allowlist, require a
-- NAMED PERSON, then read. Four differences, each stated rather than left to be found:
--
--   · THERE IS NO FIRM ARGUMENT, and that is the whole tenancy wall. The firm is
--     `clara.wake_context()`'s own answer for THIS credential. A door that took a firm would be an
--     existence oracle the moment anybody asked it about somebody else's — and the ticket's own
--     acceptance criterion is that another firm's row and no row at all answer IDENTICALLY, which
--     is structurally true here rather than defended by a predicate.
--
--   · THERE IS NO SHARED CORE, and law 31 is why: this read has ONE entrance. The member's own
--     web read needs no door at all — `clara.firm_standing_instructions` carries forced RLS with a
--     `firm_id = clara.jwt_firm()` policy and a SELECT grant to `clara_authenticated` (0338 §A.2),
--     so the human lane reads the row directly. A core here would be one ungranted body called by
--     exactly one caller, which is ceremony, not a seam.
--
--   · IT ADDS NO FLOOR OF ITS OWN, and that is a MEASUREMENT rather than an omission (0320 §C's
--     own words). The read's own floor is VIEWER — every member of a firm may see what their firm
--     has instructed Clara to do, which is exactly what §A.2's policy grants. The credential's
--     floor is STRICTLY ABOVE it: `clara.wake_context` only returns a row when the credential's
--     `on_behalf_of` is an ACTIVE BOOKKEEPER+ of the credential's firm, and
--     `clara.mint_wake_credential` refuses to mint one below that rank at all. So a viewer-rank
--     re-check here could never fire, and the cell `p1147.read.floor_is_the_credential` DRIVES the
--     bookkeeper floor instead of restating it.
--
--   · IT CARRIES NO CLIENT-PIN ARM, because there is no client to compare a pin against. 0320 and
--     0352 carry a dormant one for the day `interactive_client` is allowlisted; this read is
--     FIRM-level, takes no client, and answers a firm-wide governance fact every member of the
--     firm may already read. A pinned credential learns nothing here it could not learn anyway.
--
-- IT READS AND NEVER ACTS. `clara.record_firm_standing_instruction` and
-- `clara.withdraw_firm_standing_instruction` are untouched and unreachable from here: giving a
-- standing instruction and taking it back are firm governance and must NAME the member who did
-- it, which is #1050's whole point and this file's tail re-asserts.
--
-- ABSENCE IS A STATE, NOT AN ERROR (law 2). A firm that has instructed nothing is answered
-- `active: false` with the four projections null — a model that met a raise would have to guess
-- what it meant, and "no instruction" is the commonest true answer.
-- =====================================================================================
create or replace function clara.wake_get_firm_standing_instruction(p_instruction_key text)
  returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $c0362_read$
declare
  w record; v_key text; v_row record;
begin
  -- #1147 [0362] — the model lane's entrance to the firm's own standing instruction.
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_firm_standing_instruction');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03',
        detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;

  -- THE KEY IS 0338's CLOSED SET, refused in 0338's own vocabulary so a surface and a model read
  -- ONE refusal for this family rather than two spellings of it.
  v_key := nullif(btrim(coalesce(p_instruction_key, '')), '');
  if v_key is null or v_key not in ('prepayment_schedule_at_close') then
    raise exception 'unknown standing instruction %', coalesce(v_key, '<null>')
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'firm_standing_instruction_invalid',
          'axis', 'instruction_key_unknown', 'instruction_key', v_key)::text;
  end if;

  -- THE LIVE ROW OF THE CALLER'S OWN FIRM. `uq_firm_standing_instructions_live` (0338 §A)
  -- guarantees at most one; the withdrawn rows are the firm's history and are NOT what standing
  -- means, so they are not read here.
  select fsi.instruction_key, fsi.reason, fsi.recorded_by, fsi.recorded_at
    into v_row
    from clara.firm_standing_instructions fsi
   where fsi.firm_id = w.firm_id
     and fsi.instruction_key = v_key
     and fsi.withdrawn_at is null
   limit 1;

  if not found then
    return jsonb_build_object('instruction_key', v_key, 'active', false,
      'reason', null::text, 'recorded_by', null::uuid, 'recorded_at', null::timestamptz);
  end if;

  -- THE FOUR PROJECTIONS THE TICKET NAMES, and not one field more. The row's own id is NOT
  -- projected: it is a handle into a governance record a model has no act to spend it on, and the
  -- least projection that answers the question is the one that ships (0299:2600's rule, restated).
  return jsonb_build_object('instruction_key', v_row.instruction_key, 'active', true,
    'reason', v_row.reason, 'recorded_by', v_row.recorded_by, 'recorded_at', v_row.recorded_at);
end $c0362_read$;

comment on function clara.wake_get_firm_standing_instruction(text) is
  '#1147 [0362]. The MODEL LANE''s entrance to the firm''s own STANDING INSTRUCTION to Clara: what '
  'this firm has told Clara it may do unattended, the one-line reason it was given under, the '
  'member who recorded it and when. EXECUTE to clara_agent_ro alone -- the role the chat lane''s '
  'read pool SET ROLEs to -- and ONE clara.wake_fn_allowlist row, for the `interactive` kind. '
  'FIRM-SCOPED THROUGH THE CREDENTIAL, never a firm argument, so another firm''s row and no row at '
  'all are the same answer by construction. It READS and never acts: '
  'clara.record_firm_standing_instruction and clara.withdraw_firm_standing_instruction stay '
  'clara_authenticated-only, because an instruction a machine recorded would name nobody. The '
  'read''s own floor is VIEWER (every member may see what their firm instructed); the credential''s '
  'own floor is strictly above it -- clara.wake_context re-validates the on_behalf_of human as an '
  'ACTIVE BOOKKEEPER+ of the credential''s firm on every use.';

reset role;

-- =====================================================================================
-- §D — ACL + THE ALLOWLIST. The complete delta on the machine side: ONE execute, ONE row.
-- =====================================================================================
-- `create or replace` PRESERVES an ACL, so the revoke is what makes a redo over a hand-granted
-- body close it again (0320 §D's own reasoning).
revoke all on function clara.wake_get_firm_standing_instruction(text) from public;
-- The READ role, and no other. NOT clara_runtime (the act lane has no business reading a firm's
-- governance posture), NOT clara_wake_interactive (the write pool COMMITs; this is a read and it
-- runs inside the read pool's read-only transaction), NOT clara_authenticated (a member reads the
-- relation directly under RLS and needs no door at all).
grant execute on function clara.wake_get_firm_standing_instruction(text) to clara_agent_ro;

-- ONE KIND. `interactive` is what the chat lane's `readScoped` mints (plain, on behalf of the
-- initiating human, no client pin). No unattended kind is allowlisted: `close_prep` resolves the
-- firm's instruction INSIDE `clara._prepayment_schedule_core` (0338 §F) and needs no door, and a
-- clocked lane that could ASK about a firm's governance posture without a person behind it is a
-- widening nobody asked for.
insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('interactive', 'wake_get_firm_standing_instruction')
  on conflict (wake_kind, function_name) do nothing;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- A tail that only says OK has proven nothing (.claude/rules/db-migrations.md).
-- =====================================================================================
do $c0362_tail$
declare
  v_n int; v_acl text;
begin
  -- 1 · THE READ DOOR RESOLVES AT EXACTLY ONE pg_proc ROW, is STABLE SECURITY DEFINER owned by
  --     clara_fn_owner, and carries the search_path pin every definer body in this estate does.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'wake_get_firm_standing_instruction';
  if v_n <> 1 then
    raise exception '0362 tail: clara.wake_get_firm_standing_instruction resolves at % pg_proc rows', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara.wake_get_firm_standing_instruction(text)'::regprocedure
     and p.prosecdef and p.provolatile = 's'
     and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '0362 tail: the read door is not a STABLE SECURITY DEFINER owned by clara_fn_owner with its search_path pinned'
      using errcode='CLR10';
  end if;

  -- 2 · ONE ROLE HOLDS IT, AND IT IS THE READ ROLE. Read off the ACL rather than asked role by
  --     role, so a grant to a role this file never names is caught too.
  select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') into v_acl
    from pg_proc p where p.oid = 'clara.wake_get_firm_standing_instruction(text)'::regprocedure;
  if v_acl !~ 'clara_agent_ro=X/clara_fn_owner' then
    raise exception '0362 tail: clara_agent_ro does not hold EXECUTE on the read door (acl %)', v_acl
      using errcode='CLR10';
  end if;
  if v_acl ~ 'clara_runtime=|clara_authenticated=|clara_wake_|clara_agent_chat_ro=' or v_acl ~ '(^|\|)=X' then
    raise exception '0362 tail: a role other than clara_agent_ro reaches the read door (acl %)', v_acl
      using errcode='CLR10';
  end if;

  -- 3 · ONE ALLOWLIST ROW, FOR ONE KIND. A second kind is a widening and this file grants none.
  select count(*) into v_n from clara.wake_fn_allowlist
   where function_name = 'wake_get_firm_standing_instruction';
  if v_n <> 1 then
    raise exception '0362 tail: the read door carries % allowlist rows, not exactly one', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.wake_fn_allowlist
   where function_name = 'wake_get_firm_standing_instruction' and wake_kind = 'interactive';
  if v_n <> 1 then
    raise exception '0362 tail: the read door''s one allowlist row is not the `interactive` kind'
      using errcode='CLR10';
  end if;

  -- 4 · THE RELATION'S OWN GRANTS DID NOT MOVE — 0338's tail assertion, re-read after this file.
  --     This is the acceptance criterion in catalog form: the door is how a machine lane reads a
  --     relation it holds NOTHING on, and if that stopped being true the door would be redundant
  --     AND the wall would be gone.
  if not has_table_privilege('clara_authenticated', 'clara.firm_standing_instructions', 'SELECT') then
    raise exception '0362 tail: the human lane lost SELECT on the standing-instruction relation'
      using errcode='CLR10';
  end if;
  if has_table_privilege('clara_agent_ro', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_runtime', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_wake_interactive', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('clara_wake_proactive', 'clara.firm_standing_instructions', 'SELECT')
     or has_table_privilege('public', 'clara.firm_standing_instructions', 'SELECT') then
    raise exception '0362 tail: a machine lane holds a direct grant on the standing-instruction relation -- every machine reader goes through this file''s definer door'
      using errcode='CLR10';
  end if;

  -- 5 · AND THE TWO WRITE DOORS ARE STILL THE HUMAN LANE'S ALONE. The ONE thing a read door beside
  --     them must never become is a way in.
  if not has_function_privilege('clara_authenticated',
       'clara.record_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE')
     or not has_function_privilege('clara_authenticated',
       'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0362 tail: clara_authenticated lost EXECUTE on a standing-instruction write door'
      using errcode='CLR10';
  end if;
  select count(*) into v_n
    from unnest(array['clara_runtime', 'clara_agent_ro', 'clara_wake_interactive',
                      'clara_wake_proactive', 'public']) r,
         unnest(array['clara.record_firm_standing_instruction(text,text,text)',
                      'clara.withdraw_firm_standing_instruction(text,text,text)']) f
   where has_function_privilege(r, f::regprocedure, 'EXECUTE');
  if v_n <> 0 then
    raise exception '0362 tail: % machine-lane EXECUTE(s) on the standing-instruction write doors -- an instruction a machine recorded would name nobody', v_n
      using errcode='CLR10';
  end if;

  raise notice '0362 tail OK -- the model lane can ask what a firm has instructed, and can still neither give the instruction nor take it back';
end $c0362_tail$;
