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
  v_n int; v_src text; v_read_src text; v_wd_mode text;
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
  select p.prosrc into v_read_src from pg_proc p
   where p.oid = to_regprocedure('clara.wake_get_firm_standing_instruction(text)');
  if v_read_src is not null and position('#1147 [0362]' in v_read_src) = 0 then
    raise exception '0362 prestate: clara.wake_get_firm_standing_instruction(text) already exists and is not this file''s body'
      using errcode='CLR10';
  end if;
  -- 5 . THE ONE BODY THIS FILE RECUTS, pinned by its `sha256(prosrc)` MEASURED ON THIS RIG (riders
  --     closing wave lane 01, database `clara_c01`, 337 files, max `0361_reservation_release_advice`
  --     -- no ticket of this lane landed before this one), never copied from an older migration's
  --     header. It admits exactly TWO pre-images of its own -- 0338 SG's live body, or a body that
  --     already carries this file's own `#1147 [0362]` attribution -- so a redo (#957) is admitted
  --     and real drift still refuses BY NAME. 0338's and 0337's idiom, line for line.
  --
  --     NOT SHA-PINNED, DELIBERATELY: `clara._prepayment_schedule_core` and
  --     `clara._revenue_recognition_core`, the two bodies the asymmetry census watches. A sha is
  --     the right instrument for a body no other lane of this wave writes; the schedule family is
  --     read here STRUCTURALLY (a closed lane set, off the live catalog) and this file recuts
  --     neither, so a pin would turn another lane's lawful recut into an abort of the whole chain
  --     (the closing plan's own seam rule (c), and its risk 4).
  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('clara.withdraw_firm_standing_instruction(text,text,text)');
  if v_src is null then
    raise exception '0362 prestate: clara.withdraw_firm_standing_instruction(text,text,text) is absent -- 0338 SG is this file''s premise'
      using errcode='CLR10';
  end if;
  if position('#1147 [0362]' in v_src) > 0 then
    v_wd_mode := 'REDO';
  elsif encode(sha256(convert_to(v_src, 'UTF8')), 'hex')
        = 'c63c1fd09bc92713127a038b3565f399b8ee17fcbf27097272b7a919cbb7b6e5' then
    v_wd_mode := 'FIRST';
  else
    raise exception '0362 prestate: clara.withdraw_firm_standing_instruction(text,text,text) is neither 0338 SG''s pinned body (sha c63c1fd0...) nor one carrying this file''s own attribution -- sha256(prosrc) is %', encode(sha256(convert_to(v_src, 'UTF8')), 'hex')
      using errcode='CLR10';
  end if;

  -- 6 . THE RELATION SB COUNTS OVER, and the facts it reads on it. Structural: `authority_ref` is
  --     an open jsonb object by 0193's own CHECK, so what must be true is the CHECK that admits
  --     this file's kind and the column set the count keys on.
  select count(*) into v_n from pg_constraint
   where conrelid = 'clara.accounting_plans'::regclass
     and conname = 'accounting_plans_authority_kind_check'
     and pg_get_constraintdef(oid) like '%standing_instruction%';
  if v_n <> 1 then
    raise exception '0362 prestate: clara.accounting_plans does not admit the standing_instruction authority kind -- 0338 SC is this file''s premise'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.accounting_plans'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('firm_id', 'status', 'authority_kind', 'authority_ref');
  if v_n <> 4 then
    raise exception '0362 prestate: clara.accounting_plans carries % of the 4 columns SB''s count keys on', v_n
      using errcode='CLR10';
  end if;

  raise notice '0362 prestate OK -- read door %, withdraw door %',
    case when v_read_src is null then 'FIRST' else 'REDO' end, v_wd_mode;
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

-- =====================================================================================
-- §B — clara.withdraw_firm_standing_instruction — 0338 §G's BODY VERBATIM, plus ONE answer key.
--
-- WHAT MOVED, AND ONLY THIS: the receipt gains `plans_still_posting`, the number of LIVE plans
-- this firm's withdrawn instruction authorised and which keep posting under the member who
-- authorised them. Everything else is 0338 §G byte for byte -- the same admin floor, the same
-- op-receipt reservation and its placement, the same refusal vocabulary (CLR10
-- `firm_standing_instruction_invalid` with axis `withdraw_reason_missing` and
-- `instruction_key_unknown`, CLR11 `firm_standing_instruction_absent`, CLR13
-- `operation_in_flight`), the same single lawful UPDATE, the same audit row. The body below was
-- taken from the LIVE catalog rather than retyped, and §0 refuses to apply over anything else.
--
-- WHY THE DOOR AND NOT THE SURFACE. A count a surface derived would be a SECOND definition of
-- "which plans this instruction authorised", computed off a relation the web session reads under
-- RLS and the chat lane cannot read at all. The door already holds the instruction row inside the
-- transaction that withdraws it; one body, one answer.
--
-- WHAT WITHDRAWAL STILL DOES NOT DO. It does not pause, cancel or otherwise touch a plan. That is
-- the ruling this file records rather than takes (issue #1147, "Out of scope"), and
-- `p1147.withdraw.counts` asserts the plan rows are byte-identical after the withdrawal.
-- =====================================================================================
create or replace function clara.withdraw_firm_standing_instruction(
    p_instruction_key text, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $c0362_wd$
declare
  v_actor uuid; v_firm uuid; v_dedupe jsonb;
  v_key text; v_reason text; v_row record;
  v_plans int;                        -- #1147 [0362]: how many plans keep posting
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

  -- #1147 [0362] — WHAT THE FIRM IS NOT STOPPING, COUNTED RATHER THAN LEFT TO BE FOUND.
  --
  -- WHAT THIS IS NOT. It is NOT a change to what withdrawal DOES. The plans this instruction
  -- already authorised keep posting under the member who authorised them -- #940's own ruling for
  -- a retired roster enrolment, restated in §G's header above and unmoved by this file. Whether
  -- withdrawal should also PAUSE them is an accounting and product ruling #1050 was never given;
  -- #1147 makes the consequence visible and records the question rather than taking it
  -- (packages/db/README.md, the 0362 section).
  --
  -- WHY THE COUNT IS TAKEN HERE. After the stamp, inside the same transaction, so what it reports
  -- is the world the withdrawal leaves behind rather than the one it found. A count taken before
  -- the update would be a prediction.
  --
  -- WHAT `LIVE` MEANS, and it is measured rather than spelled: `status = 'active'`. 0193's CHECK
  -- admits exactly {active, paused, ended}; a paused plan posts nothing and an ended one is over,
  -- so neither is something a withdrawal leaves running. A person who has already paused a plan
  -- is not told they still have to.
  --
  -- THE REFERENCE IS COMPARED AS TEXT, never cast to uuid: `authority_ref` is an open jsonb object
  -- (its only CHECK is that it IS an object, 0193), so a row whose `id` is not uuid-shaped would
  -- turn a count into a 22P02 at the exact moment a firm is trying to withdraw.
  select count(*)::int into v_plans
    from clara.accounting_plans ap
   where ap.firm_id = v_firm
     and ap.status = 'active'
     and ap.authority_kind = 'standing_instruction'
     and ap.authority_ref ->> 'kind' = 'firm_standing_instruction'
     and ap.authority_ref ->> 'id' = v_row.id::text;

  perform clara._audit(v_firm, v_actor, null, null, 'withdraw_firm_standing_instruction', null,
    jsonb_build_object('instruction_key', v_key, 'instruction_id', v_row.id, 'op_key', p_op_key));

  -- THE FOUR KEYS 0338 ANSWERED WITH DO NOT MOVE. `plans_still_posting` is an ADDITION, so a
  -- surface built against 0338's receipt reads everything it read before; and it is always
  -- present, including as 0, because a surface that had to tell "none" from "the door did not
  -- say" would guess.
  return clara._finish_op(v_firm, 'withdraw_firm_standing_instruction', p_op_key,
    jsonb_build_object('instruction_id', v_row.id, 'instruction_key', v_key,
      'recorded_by', v_row.recorded_by, 'withdrawn_by', v_actor, 'active', false,
      'plans_still_posting', v_plans));
end $c0362_wd$;
revoke all on function clara.withdraw_firm_standing_instruction(text, text, text) from public;
grant execute on function clara.withdraw_firm_standing_instruction(text, text, text)
  to clara_authenticated;

comment on function clara.withdraw_firm_standing_instruction(text, text, text) is
  '#1050, recut by #1147 [0362]. A named member of the firm withdraws a firm-level standing '
  'instruction, with the one-line reason it is withdrawn under. Admin floor, clara_authenticated '
  'only. The row is kept forever with its withdrawal stamp, so a plan written while the '
  'instruction stood still reads the basis it was written under; what stops is NEW work -- the '
  'clocked lane refuses wake_authority_absent again. #1147 [0362]: the receipt also carries '
  'plans_still_posting, the count of LIVE (status = ''active'') plans of this firm that the '
  'withdrawn instruction authorised and that keep posting under the member who authorised them. '
  'Withdrawal does NOT pause them -- whether it should is an owner ruling #1050 was not given, and '
  'this file makes the consequence visible rather than deciding it.';

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

  -- 6 . THE RECUT WITHDRAW DOOR IS 0338 SG PLUS ONE KEY, AND LOST NOTHING. A recut that quietly
  --     dropped a wall is the risk a `create or replace` of a 3.3 KB body carries, so the tokens
  --     0338 refuses by are read back off the INSTALLED body rather than trusted.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'withdraw_firm_standing_instruction';
  if v_n <> 1 then
    raise exception '0362 tail: clara.withdraw_firm_standing_instruction resolves at % pg_proc rows', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure
     and p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
     and p.proconfig @> array['search_path=clara, pg_temp']
     and p.prosrc like '%plans_still_posting%'
     and p.prosrc like '%#1147 [0362]%'
     -- 0338's own refusal vocabulary, unmoved: the admin floor, the withdrawal's own sentence,
     -- the unknown key, nothing-to-withdraw, and the in-flight sibling.
     and p.prosrc like '%clara._human_ctx(clara.role_rank(''admin''))%'
     and p.prosrc like '%withdraw_reason_missing%'
     and p.prosrc like '%instruction_key_unknown%'
     and p.prosrc like '%firm_standing_instruction_absent%'
     and p.prosrc like '%operation_in_flight%'
     and p.prosrc like '%clara._reserve_op(%'
     and p.prosrc like '%clara._finish_op(%';
  if v_n <> 1 then
    raise exception '0362 tail: the recut withdraw door is not 0338 SG plus the plans_still_posting key -- a wall or the key itself is missing'
      using errcode='CLR10';
  end if;

  -- 7 . AND IT STILL DOES NOT TOUCH A PLAN. The ruling this file records rather than takes, read
  --     off the installed body: the withdraw door writes to ONE relation, its own, and names no
  --     plan-state verb at all.
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara.withdraw_firm_standing_instruction(text,text,text)'::regprocedure
     and (p.prosrc ilike '%update clara.accounting_plans%'
          or p.prosrc ilike '%delete from clara.accounting_plans%'
          or p.prosrc ilike '%clara.pause_accounting_plan%'
          or p.prosrc ilike '%clara.end_accounting_plan%');
  if v_n <> 0 then
    raise exception '0362 tail: the withdraw door acts on an accounting plan -- whether withdrawal should pause the plans it authorised is an owner ruling #1050 was never given, and #1147 records it rather than taking it'
      using errcode='CLR10';
  end if;

  -- 8 . THE DEFERRED-REVENUE TWIN STILL HAS NO WAKE LANE. 0338's tail item 10, re-read after this
  --     file: #1147 gives that side nothing, and the census cell in
  --     standing-instruction-agent-read.test.mjs holds the two sides against each other.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname like 'wake_%'
     and p.prosrc like '%_revenue_recognition_core%';
  if v_n <> 0 then
    raise exception '0362 tail: a wake wrapper reaches the deferred-revenue core -- this file gives that side no standing instruction either'
      using errcode='CLR10';
  end if;

  raise notice '0362 tail OK -- the model lane can ask what a firm has instructed, a withdrawal says how many plans keep posting, and neither gave anybody a way to act';
end $c0362_tail$;
