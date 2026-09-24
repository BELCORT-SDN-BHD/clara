-- 0310_knowledge_fye_pair_wall — #1031 (riders wave 4, lane 06): KNOWLEDGE REFUSES A
-- FINANCIAL-YEAR-END DAY THAT CANNOT EXIST IN THE RECORDED MONTH.
-- =====================================================================================
-- Spec of record: issue #1031's Agent Brief. Builds on 0192 (`clara._knowledge_capture_core`,
-- `clara.correct_knowledge`) and 0240 (`financial_year_end_day`, the `range:day_1_31` label on
-- `clara._knowledge_assert_value`) — this file recuts the TWO existing bodies that can ever write
-- either year-end key and coins no new domain vocabulary of its own.
--
-- =====================================================================================
-- THE GAP, AS #898's OWN FIX ROUND LEFT IT (wave2-lane02-fix.md, cell fd.06). Knowledge's
-- `financial_year_end_day` is typed against `range:day_1_31` alone (0240): a whole number 1-31,
-- with NO awareness of the sibling `financial_year_end_month` row, because
-- `clara._knowledge_assert_value(p_knowledge_key, p_value)` sees one key and one value and has no
-- client to read a sibling answer from. `clara.clients`' own year-end door
-- (`clara.set_client_fy_end`, 0041) DOES refuse the impossible pair (CLR37,
-- `{"reason":"fa_particulars_invalid","axis":"fy_end"}`), so a firm could state day 31 for
-- February into Knowledge while the client row it is asked to agree with refuses the same pair
-- outright — two records of one fact, silently disagreeing, exactly what #898's own acceptance
-- clause ("never disagree silently") promised and did not deliver.
--
-- =====================================================================================
-- THE FIX: ONE NEW UNGRANTED RULE, AND BOTH WRITE PATHS CONSULT IT.
--
-- `clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value)` is the ONE place the pair
-- rule lives. It is a no-op for every key except the two year-end keys, and a no-op at FIRM scope
-- (`p_client is null`) -- a firm-scope capture of either key is already refused by D8's own wall
-- (`clara._tf_knowledge_firm_eligibility`, 0220) before a live client-scoped sibling could ever
-- exist to compare against, and the rule has no client to read one from regardless. Given a client
-- scope, it reads the OTHER key's live value for that same client (absent -> nothing to compare,
-- exactly 0240's existing posture for a day or a month recorded alone) and, if one is live, judges
-- the PAIR with the identical calendar rule `clara.set_client_fy_end` (0041:3255-3258) already
-- enforces on the client row -- copied verbatim, never re-derived, so the two doors can never come
-- to a different answer about what a real financial year end is. A refused pair raises the SAME
-- typed reason the client-row door already uses (CLR37, `fa_particulars_invalid`/`fy_end`) --
-- "mint nothing new" -- with the month and the day the refusal is about named on the detail, which
-- the client-row door's own generic message does not carry (the ticket's own "names both values").
--
-- EVERY WRITE PATH THAT CAN TOUCH EITHER KEY GOES THROUGH EXACTLY TWO clara BODIES (grep-measured
-- on this rig: `select … from pg_proc where prosrc ilike '%_knowledge_assert_value(%'` returns only
-- these two) -- `clara._knowledge_capture_core` (capture_knowledge / capture_knowledge_for /
-- promote_plan_answers_to_knowledge all nest it) and `clara.correct_knowledge` (which calls
-- `clara._knowledge_assert_value` directly, bypassing the core). Both are recut here, each gaining
-- ONE line immediately after its existing `perform clara._knowledge_assert_value(...)` call: "the
-- pair rule lives once and both keys consult it" is satisfied by both WRITE DOORS consulting the
-- one rule, not by the two KEYS each carrying their own copy.
--
-- THE CHOICE THIS FILE MAKES, NAMED (the brief's own "say which"). The catalogue has no existing
-- mechanism anywhere for one key's capture to reach in and silently clear or rewrite a SIBLING
-- key's own live record -- every capture door either writes the ONE record it was asked to write
-- or refuses; "clear the day with a disclosed reason" would be new machinery invented for this one
-- pair. REFUSAL, in both directions, needs none: it reuses the exact posture `_knowledge_assert_value`
-- already keeps for a syntactically-valid-but-out-of-range value, on the exact same axis a value
-- becomes wrong. So: capturing (or correcting) the day against an already-live, incompatible month
-- is refused: the month is untouched, the attempted day never lands. Capturing (or correcting) the
-- month against an already-live, incompatible day is refused the SAME way: the day is untouched,
-- the attempted month never lands. A client with NO live sibling yet keeps 0240's original,
-- unconstrained-alone posture for whichever half is stated first -- there is nothing yet to check
-- the pair against, exactly as a lone month has always been checked only against `range:month_1_12`.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not touch `clara.set_client_fy_end` or
-- `clara.clients`' own `ck_clients_fy_end` CHECK (0041) -- the ticket's own out-of-scope, and this
-- file's prestate pins that body UNMOVED. It does not read `financial_year_end_day` out of
-- Knowledge anywhere new -- the rule reads the sibling ROW directly, inside the SECURITY DEFINER
-- write path, never through a new read surface. It does not change `clara._knowledge_assert_value`
-- itself: 0240's own segregation ("one key and one value") is left exactly as it was, and the pair
-- rule is a second, later call in each caller -- not a widened first one.
-- =====================================================================================

do $p1031_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false; v_live_core text; v_live_correct text;
  v_month_va text;
  -- The live pre-images of the TWO bodies this file recuts, MEASURED on the lane-06 rig
  -- (clara_l06, PG 17, chain 0001..0295, no lane-06 commit before this ticket) off pg_proc.prosrc
  -- directly -- never transcribed from any migration's file text (the 0046 S7.1 / 0048 S1 / 0052
  -- S1 law).
  c_capture_core_pre constant text :=
    '2c8526b82d54ac0aa49c77c3be277be5ecd9cad73df0fec63908d67a0681b01b';
  c_correct_pre constant text :=
    '968a205f2f7ccc5ac286ea0edd73dc693dcede97c2475c7cb35b9241ea1ee33d';
begin
  if to_regclass('clara.knowledge_keys') is null
     or to_regprocedure('clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)') is null
     or to_regprocedure('clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)') is null then
    raise exception '#1031 prestate: the 0192 knowledge write plane is absent' using errcode = 'CLR10';
  end if;

  select validated_against into v_month_va from clara.knowledge_keys
    where knowledge_key = 'financial_year_end_month';
  if not found or v_month_va is distinct from 'range:month_1_12' then
    raise exception '#1031 prestate: financial_year_end_month is absent or no longer carries range:month_1_12 -- 0192 must apply first'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.knowledge_keys
                  where knowledge_key = 'financial_year_end_day' and validated_against = 'range:day_1_31') then
    raise exception '#1031 prestate: financial_year_end_day is absent or no longer carries range:day_1_31 -- 0240 must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied, unmerged
  -- migration after an edit.) `create or replace` is safe over its own old effects, but a prestate
  -- pinned to the PRE-splice image would refuse the redo outright. Admitted LOUDLY, and only on
  -- the one signal that means it: BOTH live bodies already call this file's own new rule (partial
  -- -- one calls it and the other does not -- is refused rather than guessed at).
  if to_regprocedure('clara._knowledge_assert_fye_pair(uuid,text,jsonb)') is not null then
    select p.prosrc into v_live_core from pg_proc p
     where p.oid = 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'::regprocedure;
    select p.prosrc into v_live_correct from pg_proc p
     where p.oid = 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)'::regprocedure;
    if position('clara._knowledge_assert_fye_pair(' in v_live_core) > 0
       and position('clara._knowledge_assert_fye_pair(' in v_live_correct) > 0 then
      v_redo := true;
      raise notice '#1031 prestate: both live bodies already call clara._knowledge_assert_fye_pair -- treating this as a #957 REDO of 0310 itself. The recut is create-or-replace and the tail re-proves the whole post-state from scratch.';
    else
      raise exception '#1031 prestate: clara._knowledge_assert_fye_pair already exists but the two write doors do not BOTH call it (capture_core=%, correct_knowledge=%) -- re-derive this file against the live catalog before applying',
        position('clara._knowledge_assert_fye_pair(' in v_live_core) > 0,
        position('clara._knowledge_assert_fye_pair(' in v_live_correct) > 0
        using errcode = 'CLR10';
    end if;
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-06 RIG off pg_proc.prosrc. The
  -- two RECUT entries are skipped on a redo (their pre-image is this file's OWN prior effect, not
  -- the pin below); the tail re-reads all three afterwards to confirm the final state either way.
  for v_pin in select * from (values
      ('clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)',
       c_capture_core_pre, 'recut'),
      ('clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)', c_correct_pre, 'recut'),
      -- NEIGHBOUR, UNMOVED: the per-value rule this file's new pair rule sits BESIDE, never
      -- widens. Both write doors call it BEFORE the pair rule (tail proves the order); this file
      -- relies on it already having validated the value's own shape and range by the time the
      -- pair rule reads it, so a drifted body here would invalidate that assumption silently.
      ('clara._knowledge_assert_value(text,jsonb)',
       '84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5', 'unmoved'),
      -- NON-REGRESSION: the client row's own door, whose refusal vocabulary this file reuses
      -- verbatim and whose CHECK this file must never touch (the ticket's own out-of-scope).
      ('clara.set_client_fy_end(uuid,integer,integer,text)',
       'd8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1031 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1031 prestate: clean -- financial_year_end_month/day carry the shapes 0192/0240 left, clara._knowledge_capture_core and clara.correct_knowledge are both at their measured pre-images (or, on a redo, this file''s own prior effect), clara._knowledge_assert_value and clara.set_client_fy_end are unmoved.';
end
$p1031_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE PAIR RULE. Ungranted, like its `_knowledge_assert_value` neighbour: owned by
--     clara_fn_owner, EXECUTE revoked from PUBLIC, granted to no application role -- reachable
--     only from another SECURITY DEFINER body already running as the owner.
-- =====================================================================================
create or replace function clara._knowledge_assert_fye_pair(p_client uuid, p_knowledge_key text, p_value jsonb)
  returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_sibling_key text; v_sibling numeric; v_new numeric; v_month int; v_day int;
begin
  -- A NO-OP for every key but the two year-end keys -- this rule is theirs alone.
  if p_knowledge_key not in ('financial_year_end_month', 'financial_year_end_day') then
    return;
  end if;
  -- A NO-OP AT FIRM SCOPE. D8's own wall (clara._tf_knowledge_firm_eligibility, 0220) already
  -- refuses a firm-scope capture of either key before a live CLIENT-scoped sibling could ever
  -- exist to compare against, and this rule has no client to read one from regardless.
  if p_client is null then
    return;
  end if;
  v_sibling_key := case when p_knowledge_key = 'financial_year_end_month'
                        then 'financial_year_end_day' else 'financial_year_end_month' end;
  select r.value #>> '{}' into v_sibling
    from clara.knowledge_records r
   where r.state = 'live' and r.scope_kind = 'client' and r.client_id = p_client
     and r.knowledge_key = v_sibling_key;
  if v_sibling is null then
    -- NO SIBLING STATED YET: nothing to compare against -- 0240's original posture for a day or a
    -- month recorded alone, unchanged.
    return;
  end if;
  v_new := (p_value #>> '{}')::numeric;
  if p_knowledge_key = 'financial_year_end_month' then
    v_month := v_new::int; v_day := v_sibling::int;
  else
    v_month := v_sibling::int; v_day := v_new::int;
  end if;
  -- THE SAME CALENDAR RULE clara.set_client_fy_end (0041:3255-3258) ALREADY ENFORCES ON THE
  -- CLIENT ROW -- copied verbatim, never re-derived, so the two doors can never disagree about
  -- what a real financial year end is.
  if v_month < 1 or v_month > 12 or v_day < 1 or v_day > 31
     or (v_month = 2 and v_day > 29)
     or (v_month in (4, 6, 9, 11) and v_day > 30) then
    raise exception 'a financial-year end must be a real calendar day, and month % day % is not one', v_month, v_day
      using errcode = 'CLR37', detail = jsonb_build_object('reason', 'fa_particulars_invalid',
        'axis', 'fy_end', 'knowledge_key', p_knowledge_key, 'month', v_month, 'day', v_day)::text;
  end if;
end $$;
revoke all on function clara._knowledge_assert_fye_pair(uuid, text, jsonb) from public;
comment on function clara._knowledge_assert_fye_pair(uuid, text, jsonb) is
  '#1031 (0310): the ONE rule that judges the financial-year-end PAIR (financial_year_end_month,
  financial_year_end_day) against clara.set_client_fy_end''s own calendar rule (0041), reused
  verbatim. A no-op for every other knowledge key and at firm scope. Both write doors that can
  ever touch either key -- clara._knowledge_capture_core and clara.correct_knowledge -- consult it
  immediately after their existing clara._knowledge_assert_value call. An UNGRANTED internal core:
  owned by clara_fn_owner, EXECUTE revoked from public, granted to no role.';

-- =====================================================================================
-- §B  THE CAPTURE CORE. `clara._knowledge_capture_core` (0192) -- signature, every existing check
--     and the supersession/insert shape UNCHANGED. One new line, immediately after the existing
--     per-value check, before the trust wall and the supersession lookup: the incoming value is
--     judged against its sibling BEFORE anything decides whether this call would skip, correct or
--     capture, exactly the same ordering `_knowledge_assert_value` itself already keeps.
-- =====================================================================================
create or replace function clara._knowledge_capture_core(
    p_firm uuid, p_scope_kind text, p_client uuid, p_knowledge_key text, p_value jsonb,
    p_applies_when jsonb, p_effective_from date, p_effective_to date, p_source_kind text,
    p_basis text, p_source jsonb, p_asserted_by uuid, p_recorded_via text, p_on_conflict text,
    p_revision_reason text, p_fn text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  k record; prior record; v_digest text; s record;
begin
  if p_scope_kind not in ('client','firm') then
    raise exception 'scope_kind is client or firm' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_scope_invalid"}';
  end if;
  if (p_scope_kind = 'client') <> (p_client is not null) then
    raise exception 'a client-scoped record names its client, and a firm-scoped one names none'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_scope_invalid"}';
  end if;
  if p_client is not null and not exists (
      select 1 from clara.clients c where c.id = p_client and c.firm_id = p_firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_basis is null or btrim(p_basis) = '' then
    raise exception 'a knowledge record requires its basis -- who said so, on what evidence'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_basis_missing"}';
  end if;
  if clara._knowledge_trust_of(p_source_kind) is null then
    raise exception 'source_kind must be one of user_statement / interview / document_extraction / registry_lookup / imported_bundle / model_inference'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_source_kind_invalid"}';
  end if;
  if p_effective_from is not null and p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'the effective window ends before it starts' using errcode = 'CLR10',
      detail = '{"reason":"knowledge_effective_window_invalid"}';
  end if;
  perform clara._knowledge_assert_applies_when(coalesce(p_applies_when, '{}'::jsonb));
  perform clara._knowledge_assert_value(p_knowledge_key, p_value);
  -- #1031 (0310): THE PAIR RULE. A no-op for every key but the two year-end keys, and at firm
  -- scope; given a live client-scoped sibling for financial_year_end_month/day, refuses a pair
  -- that cannot be a real calendar day -- see clara._knowledge_assert_fye_pair's own comment.
  perform clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value);
  select * into k from clara.knowledge_keys where knowledge_key = p_knowledge_key;
  -- THE TRUST WALL, stated in the door's own voice so the refusal names the product rule rather
  -- than a constraint. The trigger and the CHECKs repeat it; this is where the caller hears it.
  if (k.kind = 'policy' or k.authority_bearing) and clara._knowledge_trust_of(p_source_kind) <> 'asserted' then
    raise exception 'knowledge key % is %; a % source is % and cannot become one',
      p_knowledge_key, case when k.kind = 'policy' then 'a policy' else 'authority-bearing' end,
      p_source_kind, clara._knowledge_trust_of(p_source_kind)
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_trust_insufficient',
        'knowledge_key', p_knowledge_key)::text;
  end if;
  s := clara._knowledge_source_pins(p_firm, p_source_kind, coalesce(p_source, '{}'::jsonb));

  v_digest := clara._knowledge_applies_when_digest(coalesce(p_applies_when, '{}'::jsonb));
  -- SUPERSESSION, NEVER UPDATE (0055's matrix F4 applied to a revision chain). Lock the live
  -- predecessor; two writers racing the same subject serialize here, and the second meets
  -- uq_knowledge_live -- a loud unique violation, never a silent double-live state.
  select * into prior from clara.knowledge_records r
   where r.state = 'live' and r.knowledge_key = p_knowledge_key
     and r.applies_when_digest = v_digest
     and ((p_scope_kind = 'client' and r.scope_kind = 'client' and r.client_id = p_client)
       or (p_scope_kind = 'firm'   and r.scope_kind = 'firm'   and r.firm_id = p_firm))
   for update;

  if found then
    if p_on_conflict = 'skip' then
      return jsonb_build_object('status', 'skipped', 'record_id', prior.record_id,
        'revision_id', prior.id, 'revision_n', prior.revision_n,
        'knowledge_key', p_knowledge_key, 'knowledge_version', prior.knowledge_version::text);
    elsif p_on_conflict = 'correct' then
      if nullif(btrim(coalesce(p_revision_reason, '')), '') is null then
        raise exception 'correcting a live knowledge record requires a reason'
          using errcode = 'CLR10', detail = '{"reason":"knowledge_reason_required"}';
      end if;
      return jsonb_build_object('status', 'corrected') || clara._knowledge_insert_revision(
        p_firm, prior.id, prior.record_id, prior.revision_n + 1, p_scope_kind, p_client,
        p_knowledge_key, k.kind, p_value, coalesce(p_applies_when, '{}'::jsonb),
        p_effective_from, p_effective_to, p_source_kind,
        s.o_document, s.o_extraction, s.o_region, s.o_field, s.o_work,
        p_basis, p_asserted_by, p_recorded_via, 'correction', p_revision_reason, 'live', p_fn);
    else
      raise exception 'this client already holds a live % record for that applicability -- correct it instead of capturing a second one',
        p_knowledge_key
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_already_live',
          'record_id', prior.record_id)::text;
    end if;
  end if;

  return jsonb_build_object('status', 'captured') || clara._knowledge_insert_revision(
    p_firm, null, null, 1, p_scope_kind, p_client, p_knowledge_key, k.kind, p_value,
    coalesce(p_applies_when, '{}'::jsonb), p_effective_from, p_effective_to, p_source_kind,
    s.o_document, s.o_extraction, s.o_region, s.o_field, s.o_work,
    p_basis, p_asserted_by, p_recorded_via, 'capture', null, 'live', p_fn);
end $$;
revoke all on function clara._knowledge_capture_core(
  uuid, text, uuid, text, jsonb, jsonb, date, date, text, text, jsonb, uuid, text, text, text, text) from public;

-- =====================================================================================
-- §C  THE CORRECTION DOOR. `clara.correct_knowledge` (0192) -- signature, floor, dedupe and
--     insert-revision shape UNCHANGED. One new line, in the same relative position as §B's: right
--     after the existing per-value check and before the trust wall.
-- =====================================================================================
create or replace function clara.correct_knowledge(
    p_record uuid, p_value jsonb, p_reason text, p_op_key text,
    p_basis text default null::text, p_source_kind text default null::text,
    p_source jsonb default null::jsonb)
  returns jsonb
  language plpgsql security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare c record; r clara.knowledge_records; v_dedupe jsonb; v_floor text;
        v_source_kind text; v_basis text; k record;
        v_doc uuid; v_ext uuid; v_reg uuid; v_field text; v_work uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a correction records why -- an attributable revision without its reason is an edit'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'correct_knowledge', p_op_key,
    clara._hash(jsonb_build_object('record', p_record, 'value', p_value, 'reason', p_reason,
      'basis', p_basis, 'source_kind', p_source_kind, 'source', p_source)));
  if v_dedupe is not null then return v_dedupe; end if;
  r := clara._knowledge_live_revision(c.firm, p_record);
  v_floor := clara._knowledge_floor(r.knowledge_key, r.scope_kind);
  perform clara._human_ctx(clara.role_rank(v_floor));
  v_source_kind := coalesce(nullif(btrim(coalesce(p_source_kind, '')), ''), r.source_kind);
  v_basis := coalesce(nullif(btrim(coalesce(p_basis, '')), ''), r.basis);
  if clara._knowledge_trust_of(v_source_kind) is null then
    raise exception 'source_kind must be one of user_statement / interview / document_extraction / registry_lookup / imported_bundle / model_inference'
      using errcode = 'CLR10', detail = '{"reason":"knowledge_source_kind_invalid"}';
  end if;
  perform clara._knowledge_assert_value(r.knowledge_key, p_value);
  -- #1031 (0310): THE PAIR RULE, the SAME one §B's capture core consults. A correction is a
  -- second write path onto the same two keys, and had to gain this too -- see 0310's own header.
  perform clara._knowledge_assert_fye_pair(
    case when r.scope_kind = 'client' then r.client_id else null end, r.knowledge_key, p_value);
  select * into k from clara.knowledge_keys where knowledge_key = r.knowledge_key;
  if (k.kind = 'policy' or k.authority_bearing) and clara._knowledge_trust_of(v_source_kind) <> 'asserted' then
    raise exception 'knowledge key % is %; a % source is % and cannot become one',
      r.knowledge_key, case when k.kind = 'policy' then 'a policy' else 'authority-bearing' end,
      v_source_kind, clara._knowledge_trust_of(v_source_kind)
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_trust_insufficient',
        'knowledge_key', r.knowledge_key)::text;
  end if;
  -- A correction that names no new source inherits the prior revision's pins verbatim.
  if p_source is null and nullif(btrim(coalesce(p_source_kind, '')), '') is null then
    v_doc := r.source_document_id; v_ext := r.source_extraction_id; v_reg := r.source_region_id;
    v_field := r.source_field_path; v_work := r.source_work_id;
  else
    select o_document, o_extraction, o_region, o_field, o_work
      into v_doc, v_ext, v_reg, v_field, v_work
      from clara._knowledge_source_pins(c.firm, v_source_kind, coalesce(p_source, '{}'::jsonb));
  end if;
  return clara._finish_op(c.firm, 'correct_knowledge', p_op_key,
    jsonb_build_object('status', 'corrected') || clara._knowledge_insert_revision(
      c.firm, r.id, r.record_id, r.revision_n + 1, r.scope_kind, r.client_id, r.knowledge_key,
      r.kind, p_value, r.applies_when, r.effective_from, r.effective_to, v_source_kind,
      v_doc, v_ext, v_reg, v_field, v_work, v_basis, c.actor, 'human_ui', 'correction', p_reason,
      'live', 'correct_knowledge'));
end $$;
revoke all on function clara.correct_knowledge(uuid, jsonb, text, text, text, text, jsonb) from public;

reset role;

-- =====================================================================================
-- §Z  THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p1031_tail$
declare
  v_n int; v_sha text; v_pin record; v_a text; v_b text;
  v_pos_assert_value int; v_pos_pair_rule int; v_pos_trust_wall int;
begin
  -- T.1 THE NEW RULE EXISTS, is STABLE, SECURITY DEFINER, owned by clara_fn_owner, its
  -- search_path pinned, and grants EXECUTE to nobody -- an INTERNAL like its
  -- `_knowledge_assert_value` neighbour.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._knowledge_assert_fye_pair(uuid,text,jsonb)'::regprocedure
     and p.provolatile = 's' and p.prosecdef
     and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#1031 tail T.1: clara._knowledge_assert_fye_pair is missing its stable/definer/owner/search_path shape'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = 'clara._knowledge_assert_fye_pair(uuid,text,jsonb)'::regprocedure
     and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1031 tail T.1b: clara._knowledge_assert_fye_pair gained % grant(s) -- it is an INTERNAL, granted to nobody', v_n
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', 'clara._knowledge_assert_fye_pair(uuid,text,jsonb)', 'EXECUTE') then
    raise exception '#1031 tail T.1c: PUBLIC has EXECUTE on clara._knowledge_assert_fye_pair' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from unnest(array['clara_authenticated','clara_agent_ro','clara_runtime']) r(role)
     where has_function_privilege(r.role, 'clara._knowledge_assert_fye_pair(uuid,text,jsonb)', 'EXECUTE')
  ) then
    raise exception '#1031 tail T.1d: an application role can now execute clara._knowledge_assert_fye_pair directly' using errcode = 'CLR10';
  end if;

  -- T.2 BOTH RECUT BODIES NOW CALL THE PAIR RULE, EXACTLY ONCE EACH, AND STRICTLY AFTER THEIR OWN
  -- EXISTING `_knowledge_assert_value` CALL AND BEFORE THE TRUST WALL -- the ordering both §B and
  -- §C's own comments promise.
  select p.prosrc into v_a from pg_proc p
   where p.oid = 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'::regprocedure;
  select p.prosrc into v_b from pg_proc p
   where p.oid = 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)'::regprocedure;

  v_n := (length(v_a) - length(replace(v_a, 'clara._knowledge_assert_fye_pair(', ''))) / length('clara._knowledge_assert_fye_pair(');
  if v_n <> 1 then
    raise exception '#1031 tail T.2a: clara._knowledge_capture_core calls the pair rule % time(s), expected exactly 1', v_n using errcode = 'CLR10';
  end if;
  v_n := (length(v_b) - length(replace(v_b, 'clara._knowledge_assert_fye_pair(', ''))) / length('clara._knowledge_assert_fye_pair(');
  if v_n <> 1 then
    raise exception '#1031 tail T.2b: clara.correct_knowledge calls the pair rule % time(s), expected exactly 1', v_n using errcode = 'CLR10';
  end if;

  v_pos_assert_value := position('clara._knowledge_assert_value(p_knowledge_key, p_value)' in v_a);
  v_pos_pair_rule := position('clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value)' in v_a);
  v_pos_trust_wall := position('knowledge_trust_insufficient' in v_a);
  if not (v_pos_assert_value > 0 and v_pos_pair_rule > v_pos_assert_value and v_pos_trust_wall > v_pos_pair_rule) then
    raise exception '#1031 tail T.2c: clara._knowledge_capture_core does not call assert_value, THEN the pair rule, THEN reach the trust wall, in that order' using errcode = 'CLR10';
  end if;

  v_pos_assert_value := position('clara._knowledge_assert_value(r.knowledge_key, p_value)' in v_b);
  v_pos_pair_rule := position('clara._knowledge_assert_fye_pair(' in v_b);
  v_pos_trust_wall := position('knowledge_trust_insufficient' in v_b);
  if not (v_pos_assert_value > 0 and v_pos_pair_rule > v_pos_assert_value and v_pos_trust_wall > v_pos_pair_rule) then
    raise exception '#1031 tail T.2d: clara.correct_knowledge does not call assert_value, THEN the pair rule, THEN reach the trust wall, in that order' using errcode = 'CLR10';
  end if;

  -- T.3 BOTH RECUT BODIES KEEP THEIR OWN SHAPE: SECURITY DEFINER, owner and search_path unmoved,
  -- and PUBLIC still has no EXECUTE on either -- `create or replace` preserves all of this, and
  -- this proves it did (0240's own note, verbatim).
  for v_pin in select * from (values
      ('clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'),
      ('clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#1031 tail T.3: % lost its owner, its SECURITY DEFINER flag or its pinned search_path', v_pin.sig
        using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#1031 tail T.3b: PUBLIC gained EXECUTE on %', v_pin.sig using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated', 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)', 'EXECUTE') then
    raise exception '#1031 tail T.3c: clara_authenticated lost EXECUTE on clara.correct_knowledge' using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)', 'EXECUTE') then
    raise exception '#1031 tail T.3d: clara_authenticated gained EXECUTE on the internal capture core' using errcode = 'CLR10';
  end if;

  -- T.4 NON-REGRESSION, re-read: the per-value rule and the client row's own door are byte-for-
  -- byte what the prestate measured -- this file recut exactly two bodies and minted one.
  for v_pin in select * from (values
      ('clara._knowledge_assert_value(text,jsonb)',
       '84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5'),
      ('clara.set_client_fy_end(uuid,integer,integer,text)',
       'd8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1031 tail T.4: % MOVED (measured %, expected %) -- this file recuts exactly two bodies and mints one', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1031 tail OK: clara._knowledge_assert_fye_pair exists, stable, definer-owned by clara_fn_owner, ungranted; clara._knowledge_capture_core and clara.correct_knowledge both call it exactly once, strictly after their own assert_value call and before the trust wall; both keep their prior owner/security/search_path/ACL shape; clara._knowledge_assert_value and clara.set_client_fy_end are byte-for-byte unmoved.';
end
$p1031_tail$;
