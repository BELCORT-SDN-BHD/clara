-- 0317_knowledge_fye_pair_applicability — #1031 FIX ROUND (riders wave 4, lane 06): THE
-- FINANCIAL-YEAR-END PAIR RULE READS ITS SIBLING AT THE INCOMING APPLICABILITY, AND AN
-- IMPOSSIBLE PAIR NO LONGER ABORTS A WHOLE ONBOARDING PROMOTION.
-- =====================================================================================
-- Spec of record: issue #1031's Agent Brief, as read by this lane's code review (findings
-- L06-SPEC-02 major, L06-SPEC-08 minor, L06-SPEC-07 minor). This file FIXES
-- 0310_knowledge_fye_pair_wall.sql, which is applied and therefore immutable; it takes a number
-- from wave 4's overflow block (`0315` and up — riders-2026-09-20/README.md), never the next
-- free number, and 0310 + 0317 ship together as ONE cohort.
--
-- =====================================================================================
-- DEFECT 1 (L06-SPEC-02, major) — THE SIBLING WAS READ WITHOUT ITS APPLICABILITY.
--
-- `clara._knowledge_assert_fye_pair(uuid, text, jsonb)` selected the sibling year-end row with
-- `state = 'live' and scope_kind = 'client' and client_id = $1 and knowledge_key = <sibling>` —
-- no `applies_when` predicate and no ORDER BY. But `uq_knowledge_live` (0192) is PARTIAL over
-- (scope, subject, key, APPLICABILITY): one client may legitimately hold SEVERAL live rows of one
-- key, one per `applies_when`, and the web register names that state out loud
-- (`apps/web/components/registers/knowledge-panel.tsx`). So "the sibling row" was not one row,
-- and the read took an arbitrary one. DRIVEN on the rig, through `clara.capture_knowledge` as a
-- bookkeeper, both directions:
--   * FALSE ACCEPT — month 1 at `{}`, month 2 at `{"from_fy":2025}`, then day 31 at
--     `{"from_fy":2025}` was ACCEPTED, leaving `financial_year_end_month` = 2 and
--     `financial_year_end_day` = 31 LIVE AT THE SAME APPLICABILITY: the exact pair
--     `clara.set_client_fy_end` refuses on the client row, which is the disagreement #1031 exists
--     to close.
--   * FALSE REFUSAL — month 2 at `{}`, month 1 at `{"from_fy":2025}`, then day 31 at
--     `{"from_fy":2025}` (31 January, a real date) was REFUSED CLR37 naming month 2, a month that
--     belongs to a DIFFERENT applicability.
-- Both are cells now: `knowledge-fye-day.test.mjs` fd.11 and fd.12, which failed against 0310's
-- rule for exactly those two reasons before this file existed.
--
-- THE FIX: the rule takes the applicability it is judging and reads the sibling THROUGH THE SAME
-- DIGEST the capture core already computes for its own supersession lookup
-- (`clara._knowledge_applies_when_digest`, the same digest `uq_knowledge_live` is partial over).
-- That needs a fourth argument, so `clara._knowledge_assert_fye_pair` is re-cut at
-- `(uuid, text, jsonb, jsonb)` and the three-argument form 0310 minted is DROPPED — there is
-- never a moment with two overloads, and `rig-meta.mjs`'s cohort is by NAME, so it is unmoved.
-- Both write doors are re-cut to pass it: the capture core passes its own `p_applies_when`, and
-- `clara.correct_knowledge` passes `r.applies_when` — the live record's own applicability, which
-- a correction reuses verbatim and never moves.
--
-- =====================================================================================
-- DEFECT 2 (L06-SPEC-08, minor) — AN IMPOSSIBLE PAIR ABORTED A WHOLE PROMOTION.
--
-- #1031's brief asked for the onboarding promotion path to be "unchanged in behaviour".
-- `clara.promote_plan_answers_to_knowledge` withholds a per-item refusal and carries on: its loop
-- catches CLR10 and CLR11 around the nested `clara._knowledge_capture_core` and appends the item
-- to `withheld`. The pair rule raises CLR37 (the client-row door's own typed reason — "mint
-- nothing new", which is right), and CLR37 was not in that catch, so a committed plan holding an
-- impossible pair raised straight out of the loop: NOTHING was promoted, `entity_type` included.
-- DRIVEN on the rig before this file. The arm now catches CLR37 as well, so the offending key
-- alone is withheld with its own sqlstate and detail, which IS the door's documented behaviour.
-- Its body is otherwise byte-identical (the tail proves that by reverse substitution).
--
-- =====================================================================================
-- DISCLOSED RESIDUAL (L06-SPEC-07, minor) — 29 FEBRUARY OUTSIDE A LEAP YEAR IS STILL ACCEPTED.
--
-- #1031's "current behavior" enumerated three impossible cases: 31 for a 30-day month, 30 or 31
-- for February, and 29 for February when the pair is not tied to a leap year. The first two are
-- closed. The third is NOT, deliberately: the rule is `clara.set_client_fy_end`'s own calendar
-- rule copied verbatim (0041), that rule admits `v_month = 2 and v_day = 29`, the year-end pair
-- carries no year to judge a leap year against, and the client-row door is explicitly out of
-- #1031's scope. Refusing 29 February in Knowledge ALONE would re-create the very disagreement
-- between the two records of one fact that #1031 exists to remove. Named here, in
-- `clara._knowledge_assert_fye_pair`'s own body, in `packages/db/README.md` and in the lane's fix
-- report; a follow-up belongs on the CLIENT-ROW door, where both records can move together.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not touch `clara.set_client_fy_end`,
-- `clara.clients`' own `ck_clients_fy_end` CHECK, or `clara._knowledge_assert_value` — all three
-- are pinned UNMOVED by the prestate and re-read by the tail. It changes no grant: every re-cut
-- body keeps the owner, SECURITY DEFINER flag, pinned `search_path` and ACL `create or replace`
-- preserves, and the tail re-reads each one. It adds no new name to `rig-meta.mjs`'s cohorts —
-- the ONE name this cohort owns (`_knowledge_assert_fye_pair`) is already there and only its
-- argument list moves — and it needs no new pre-integration gate module: 0310's own
-- (`tests/fye-pair-wall-preintegration-gate.mjs`, `CLARA_ALLOW_MISSING_FYE_PAIR_WALL_0310`) gates
-- the whole two-file cohort, and `knowledge-fixtures.mjs`'s `fyePairWallCohortApplied` is
-- tightened onto the shape the cohort finally ships.
-- =====================================================================================
do $p1031fix_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false; v_four boolean; v_three boolean;
  v_live_core text; v_live_correct text;
  -- The live pre-images of the THREE bodies this file re-cuts and of the ONE rule it replaces,
  -- MEASURED on the lane-06 rig (clara_l06, PG 17, chain 0001..0316 — that is, AFTER this lane's
  -- own 0310, 0311 and 0316) off pg_proc.prosrc directly, never transcribed from a file.
  c_capture_core_pre constant text :=
    '98bcbe3589c1813da4bbdb7f5486db0d4996e831050a86cd810e25d28554ce06';
  c_correct_pre constant text :=
    '520d10e5fbecedbdec0b5d5625087a783ae3378a243a5f0669cb86d3723a189c';
  c_promote_pre constant text :=
    '2c1c1022dad9b9d6639fef55c8a90263684fe882c1f0aaddddacd2f6bc7e6b80';
  c_rule_0310_pre constant text :=
    '1435d7ce166f22f2f4a5a73e7b1f4ae314b6acd9e33e29c5397fbe70939af38d';
begin
  v_four := to_regprocedure('clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)') is not null;
  v_three := to_regprocedure('clara._knowledge_assert_fye_pair(uuid,text,jsonb)') is not null;
  if not v_four and not v_three then
    raise exception '#1031 fix-round prestate: clara._knowledge_assert_fye_pair is absent at BOTH arities -- 0310_knowledge_fye_pair_wall.sql must apply first'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._knowledge_applies_when_digest(jsonb)') is null then
    raise exception '#1031 fix-round prestate: clara._knowledge_applies_when_digest is absent -- 0192 must apply first'
      using errcode = 'CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957.) The ONE signal that means it: the four-argument
  -- rule exists, the three-argument one is gone, and BOTH write doors already call the four-
  -- argument form. Any partial state is refused rather than guessed at.
  if v_four then
    select p.prosrc into v_live_core from pg_proc p
     where p.oid = 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'::regprocedure;
    select p.prosrc into v_live_correct from pg_proc p
     where p.oid = 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)'::regprocedure;
    if not v_three
       and position('_knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value,' in v_live_core) > 0
       and position('r.knowledge_key, p_value,' in v_live_correct) > 0 then
      v_redo := true;
      raise notice '#1031 fix-round prestate: the four-argument rule is live, the three-argument one is gone and both write doors already call it -- treating this as a #957 REDO of 0317 itself. Every statement below is create-or-replace / drop-if-exists, and the tail re-proves the whole post-state from scratch.';
    else
      raise exception '#1031 fix-round prestate: clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb) already exists but the post-state is PARTIAL (three-arg still present=%, capture core calls it=%, correct_knowledge calls it=%) -- re-derive this file against the live catalog before applying',
        v_three,
        position('_knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value,' in v_live_core) > 0,
        position('r.knowledge_key, p_value,' in v_live_correct) > 0
        using errcode = 'CLR10';
    end if;
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-06 RIG off pg_proc.prosrc. The
  -- four RECUT/REPLACED entries are skipped on a redo (their pre-image is then this file's OWN
  -- prior effect); the tail re-reads everything afterwards either way.
  for v_pin in select * from (values
      ('clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)',
       c_capture_core_pre, 'recut'),
      ('clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)', c_correct_pre, 'recut'),
      -- #1031's brief called the promotion path unchanged; it is re-cut here for exactly one
      -- reason (DEFECT 2 above) and its pre-image is pinned so nothing else can ride along.
      ('clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)', c_promote_pre, 'recut'),
      -- 0310's own three-argument rule, the body this file REPLACES and then DROPS.
      ('clara._knowledge_assert_fye_pair(uuid,text,jsonb)', c_rule_0310_pre, 'recut'),
      -- NEIGHBOURS, UNMOVED. The per-value rule this pair rule sits beside and never widens; the
      -- client row's own door, whose calendar rule and refusal vocabulary this file reuses
      -- verbatim and whose CHECK it must never touch; and the applicability digest this file now
      -- reads the sibling through -- a drifted digest would silently change which row is read.
      ('clara._knowledge_assert_value(text,jsonb)',
       '84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5', 'unmoved'),
      ('clara.set_client_fy_end(uuid,integer,integer,text)',
       'd8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a', 'unmoved'),
      ('clara._knowledge_applies_when_digest(jsonb)',
       '5d72c9a5372431e0f771077454af891e527af670e62634a7a6f6c89e93664646', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1031 fix-round prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1031 fix-round prestate: clean -- 0310 is applied, clara._knowledge_capture_core / clara.correct_knowledge / clara.promote_plan_answers_to_knowledge are all at their measured pre-images (or, on a redo, this file''s own prior effect), and clara._knowledge_assert_value, clara.set_client_fy_end and clara._knowledge_applies_when_digest are unmoved.';
end
$p1031fix_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE PAIR RULE, RE-CUT AT FOUR ARGUMENTS. Ungranted, exactly as 0310 left it: owned by
--     clara_fn_owner, EXECUTE revoked from PUBLIC, granted to no application role -- reachable
--     only from another SECURITY DEFINER body already running as the owner.
-- =====================================================================================
create or replace function clara._knowledge_assert_fye_pair(
    p_client uuid, p_knowledge_key text, p_value jsonb, p_applies_when jsonb)
  returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_sibling_key text; v_sibling numeric; v_new numeric; v_month int; v_day int; v_digest text;
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
  -- #1031 FIX ROUND (0317): THE SIBLING IS READ AT THE INCOMING APPLICABILITY, through the SAME
  -- digest clara._knowledge_capture_core computes for its own supersession lookup and the SAME
  -- one uq_knowledge_live (0192) is partial over. That index is what makes this necessary: a
  -- client may hold SEVERAL live rows of one key, one per applies_when, so "the sibling row for
  -- this client" is not a single row and an unscoped, unordered read judged an arbitrary one --
  -- accepting an impossible pair and refusing a possible one (0310's own gap, measured in
  -- knowledge-fye-day.test.mjs fd.11/fd.12). Scoped by digest the read matches at most ONE row,
  -- by that same partial unique index, so `select ... into` cannot be ambiguous here.
  v_digest := clara._knowledge_applies_when_digest(coalesce(p_applies_when, '{}'::jsonb));
  select r.value #>> '{}' into v_sibling
    from clara.knowledge_records r
   where r.state = 'live' and r.scope_kind = 'client' and r.client_id = p_client
     and r.knowledge_key = v_sibling_key
     and r.applies_when_digest = v_digest;
  if v_sibling is null then
    -- NO SIBLING STATED YET AT THIS APPLICABILITY: nothing to compare against -- 0240's original
    -- posture for a day or a month recorded alone, unchanged. A sibling at ANOTHER applicability
    -- is a statement about another set of facts and says nothing about this one.
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
  -- what a real financial year end is. THE ONE CASE IT ADMITS AND A CALENDAR DOES NOT: 29
  -- February in a non-leap year. The pair carries no year, the client-row door admits it, and
  -- refusing it HERE alone would re-open the very disagreement #1031 exists to close -- so it is
  -- a DISCLOSED RESIDUAL of #1031, not an oversight (0310's header enumerated three impossible
  -- cases and closed two of them; see this file's header and packages/db/README.md).
  if v_month < 1 or v_month > 12 or v_day < 1 or v_day > 31
     or (v_month = 2 and v_day > 29)
     or (v_month in (4, 6, 9, 11) and v_day > 30) then
    raise exception 'a financial-year end must be a real calendar day, and month % day % is not one', v_month, v_day
      using errcode = 'CLR37', detail = jsonb_build_object('reason', 'fa_particulars_invalid',
        'axis', 'fy_end', 'knowledge_key', p_knowledge_key, 'month', v_month, 'day', v_day)::text;
  end if;
end $$;
revoke all on function clara._knowledge_assert_fye_pair(uuid, text, jsonb, jsonb) from public;
comment on function clara._knowledge_assert_fye_pair(uuid, text, jsonb, jsonb) is
  '#1031 (0310, re-cut at four arguments by 0317): the ONE rule that judges the financial-year-end
  PAIR (financial_year_end_month, financial_year_end_day) against clara.set_client_fy_end''s own
  calendar rule (0041), reused verbatim. The sibling is read AT THE INCOMING APPLICABILITY,
  through clara._knowledge_applies_when_digest -- the same digest uq_knowledge_live is partial
  over, so at most one row can match. A no-op for every other knowledge key and at firm scope.
  Both write doors that can ever touch either key -- clara._knowledge_capture_core and
  clara.correct_knowledge -- consult it immediately after their existing
  clara._knowledge_assert_value call. An UNGRANTED internal core: owned by clara_fn_owner,
  EXECUTE revoked from public, granted to no role. Disclosed residual: 29 February outside a leap
  year is accepted, because the client-row door accepts it and the pair carries no year.';

-- =====================================================================================
-- §B  THE CAPTURE CORE. `clara._knowledge_capture_core` (0192, re-cut by 0310) -- signature,
--     every existing check and the supersession/insert shape UNCHANGED. Exactly ONE chunk moves:
--     the pair-rule call gains this capture's own applicability. §Z proves it by REVERSE
--     SUBSTITUTION against the pinned pre-image, so a change anywhere else in this pasted body
--     reds the migration rather than shipping.
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
  -- #1031 FIX ROUND (0317): the sibling is read AT THIS CAPTURE'S OWN APPLICABILITY, which is
  -- why the rule now takes it. uq_knowledge_live is partial over the applicability, so one
  -- client can hold several live rows of one key and an unscoped read judged an arbitrary one.
  perform clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value,
                                          coalesce(p_applies_when, '{}'::jsonb));
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
-- §C  THE CORRECTION DOOR. `clara.correct_knowledge` (0192, re-cut by 0310) -- signature, floor,
--     dedupe and insert-revision shape UNCHANGED. Exactly ONE chunk moves, in the same place §B's
--     does, and §Z proves it the same way.
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
  -- #1031 FIX ROUND (0317): at the RECORD'S OWN applicability -- a correction re-states one
  -- live record in place and never moves it to another applies_when (the insert below reuses
  -- r.applies_when verbatim), so that is the applicability its sibling must be read at.
  perform clara._knowledge_assert_fye_pair(
    case when r.scope_kind = 'client' then r.client_id else null end, r.knowledge_key, p_value,
    r.applies_when);
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

-- =====================================================================================
-- §D  THE PROMOTION DOOR. `clara.promote_plan_answers_to_knowledge` (0192) -- lane discrimination,
--     floors, tenant binding, op-key reservation, audit and receipt ALL UNCHANGED. Exactly ONE
--     chunk moves: the per-item `exception` arm that already withholds CLR10/CLR11 now withholds
--     CLR37 too. §Z proves it by the same reverse substitution.
-- =====================================================================================
create or replace function clara.promote_plan_answers_to_knowledge(
    p_plan uuid, p_op_key text, p_promote_firm_scope boolean default false,
    p_firm uuid default null::uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  p record; c record; it record; v_dedupe jsonb; v_actor uuid; v_via text; v_auditor uuid;
  v_firm uuid;
  v_promoted jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_withheld jsonb := '[]'::jsonb;
  v_one jsonb; v_scope text; v_client uuid; v_version bigint; v_reason text; v_detail text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- THE LANE, ITS FLOOR AND ITS TENANT ARE DECIDED BEFORE ANY PLAN IS LOOKED UP, and the ORDER
  -- is the fix. The first cut fetched the plan (`select … for update`) first and discriminated
  -- afterwards, so a caller who could never promote anything still learned something from the
  -- refusal it got: firm B's BOOKKEEPER naming firm A's REAL plan id got CLR04 (the admin floor),
  -- while the same caller naming a random uuid got CLR11 (not found). That is an existence oracle
  -- for a guessed id -- and on the way to refusing it also took a ROW LOCK on another firm's plan.
  -- 0021's rule (absent and foreign answer alike) applies one level up: a refusal must not depend
  -- on whether the object exists when the caller was never admitted to ask about it.
  --
  -- THE TWO LANES, AND THE MACHINE LANE NEEDS A ROLE WITNESS — not merely an absent claim.
  --
  -- THE HOLE THIS CLOSES, verbatim: this door is granted to clara_authenticated, the plan is
  -- fetched by id inside a clara_fn_owner definer, and the first cut read
  -- `clara.jwt_sub() is null` as "therefore the runtime". clara.jwt_sub() returns NULL for absent
  -- claims, unparseable claims and a non-uuid `sub` (0002:339-352), so ANY session on
  -- clara_authenticated whose claims were missing or malformed fell into the machine arm — which
  -- had no firm check at all — and could promote ANY firm's committed plan. 0042 closed exactly
  -- this class (0042:396-418) and its fix is the shape used here: discriminate the caller by the
  -- ROLE, the way clara._assert_due_read_ctx does (0042:437-455).
  --
  -- WHY NOT pg_has_role: 0042's own note records the measurement. The rig connects as postgres, a
  -- member of every role, so pg_has_role would classify every human cell as the machine lane and
  -- make this fix vacuously green. `current_setting('role')` is the SET ROLE the pooled session
  -- actually took; `session_user = 'clara_runtime_login'` is the third arm because
  -- packages/runtime/lib/pools.mjs issues its SET ROLE at checkout and that login exists for no
  -- other purpose.
  --
  -- NEITHER LANE IS OPEN BY DEFAULT: a caller that is neither an identified human nor the runtime
  -- is refused CLR03, the authority class, rather than falling through to the cheaper arm.
  v_actor := clara.jwt_sub();
  if v_actor is not null then
    -- The session's own firm decides, and a SUPPLIED p_firm is a belt that must agree with it.
    c := clara._human_ctx(clara.role_rank('admin'));
    if p_firm is not null and p_firm <> c.firm then
      raise exception 'onboarding plan not found' using errcode = 'CLR11';
    end if;
    v_firm := c.firm; v_via := 'human_ui'; v_auditor := c.actor;
  elsif coalesce(current_setting('role', true), 'none') = 'clara_runtime'
        or session_user in ('clara_runtime', 'clara_runtime_login') then
    -- AND THE MACHINE LANE NAMES THE TENANT IT MEANS -- the SECOND half of B1, and a different
    -- hole from the first. Once inside this arm, the only thing deciding which firm a promotion
    -- wrote into was the plan id, fetched by id alone inside a clara_fn_owner definer that sees
    -- every firm's plans. A mis-addressed (or chosen) id therefore promoted into whichever firm
    -- owned it, with nothing in the call stating which firm the caller meant and nothing to
    -- refuse when the two differed. "Derive it from the plan" is not a tenancy check; it is the
    -- absence of one.
    --
    -- clara.capture_knowledge_for is the shape this follows: the runtime lane NAMES its subject
    -- and the door verifies it. So p_firm is REQUIRED here, and a p_firm that is not the plan's
    -- own firm answers the no-existence-oracle refusal (absent and foreign alike, 0021's rule) --
    -- which now falls out of the lookup itself rather than out of a comparison after it.
    --
    -- IT IS DELIBERATELY NOT IN THE OP HASH below: p_firm ASSERTS something about the plan rather
    -- than choosing what the op does, and no effect happens outside that firm, so a replay that
    -- spells it differently still means the same act.
    if p_firm is null then
      raise exception 'the runtime promotion lane names the firm it is promoting into'
        using errcode = 'CLR10', detail = '{"reason":"promotion_firm_required"}';
    end if;
    v_firm := p_firm; v_via := 'clara_runtime';
  else
    raise exception 'promoting onboarding answers needs an identified admin or the runtime'
      using errcode = 'CLR03', detail = '{"reason":"no_promotion_context"}';
  end if;
  -- AND ONLY NOW THE PLAN, fetched INSIDE the tenant the caller has already proved. A plan id
  -- from anywhere else is simply absent here, so "foreign" and "does not exist" are one answer
  -- by construction rather than by a comparison someone could later drop.
  select * into p from clara.onboarding_plans op
   where op.id = p_plan and op.firm_id = v_firm
   for update;
  if not found then
    raise exception 'onboarding plan not found' using errcode = 'CLR11';
  end if;
  if v_via = 'clara_runtime' then v_auditor := p.committed_by; end if;
  v_dedupe := clara._reserve_op(p.firm_id, 'promote_plan_answers_to_knowledge', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'firm_scope', coalesce(p_promote_firm_scope, false))));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'committed' then
    raise exception 'only a committed onboarding plan promotes its answers'
      using errcode = 'CLR10', detail = '{"reason":"plan_not_committed"}';
  end if;
  -- AN UNATTRIBUTABLE PROMOTION IS NOT A PROMOTION. Only the machine lane can reach this with a
  -- null auditor (the human lane audits as its own caller), and an audit row with no actor is
  -- exactly the record ADR-062 exists to prevent.
  if v_auditor is null then
    raise exception 'this committed onboarding plan names no committer; there is nobody to audit the promotion to'
      using errcode = 'CLR10', detail = '{"reason":"plan_committer_unknown"}';
  end if;
  v_scope := p.scope_kind; v_client := p.client_id;
  if v_scope = 'firm' then
    -- EXPLICIT PARAMETER + admin+ (#603 Q22). The runtime lane has no admin actor and is refused.
    if not coalesce(p_promote_firm_scope, false) then
      raise exception 'promoting a firm plan writes FIRM-WIDE defaults; say so explicitly'
        using errcode = 'CLR10', detail = '{"reason":"firm_scope_not_requested"}';
    end if;
    if v_actor is null then
      raise exception 'a firm-wide default is an explicit admin act; the runtime lane cannot make one'
        using errcode = 'CLR04', detail = '{"reason":"firm_scope_requires_admin"}';
    end if;
  elsif coalesce(p_promote_firm_scope, false) then
    raise exception 'a client plan does not promote firm-wide' using errcode = 'CLR10',
      detail = '{"reason":"firm_scope_not_applicable"}';
  end if;

  for it in
    select i.item_key, i.answer, i.answered_by, i.answered_at,
           m.knowledge_key, k.kind, k.authority_bearing
      from clara.onboarding_plan_items i
      join clara.knowledge_plan_item_map m on m.item_key = i.item_key
      join clara.knowledge_keys k on k.knowledge_key = m.knowledge_key
     where i.plan_id = p_plan and i.state in ('answered','resolved')
       and i.answer is not null and i.answered_by is not null
     order by i.item_key
  loop
    if not exists (select 1 from clara.firm_memberships m
        where m.firm_id = p.firm_id and m.user_id = it.answered_by and m.status = 'active') then
      v_withheld := v_withheld || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'reason', 'answerer_not_active'));
      continue;
    end if;
    if (it.kind = 'policy' or it.authority_bearing)
       and not exists (select 1 from clara.firm_memberships m
             where m.firm_id = p.firm_id and m.user_id = it.answered_by and m.status = 'active'
               and clara.role_rank(m.role) >= clara.role_rank('admin')) then
      v_withheld := v_withheld || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'reason', 'answerer_rank_insufficient'));
      continue;
    end if;
    begin
      v_one := clara._knowledge_capture_core(
        p.firm_id, v_scope, v_client, it.knowledge_key, it.answer, '{}'::jsonb, null, null,
        'interview',
        format('Committed onboarding plan %s, interview item %s, answered %s',
               p_plan, it.item_key, it.answered_at),
        '{}'::jsonb, it.answered_by, v_via, 'skip', null, 'promote_plan_answers_to_knowledge');
    -- #1031 FIX ROUND (0317): CLR37 TOO. The year-end pair rule refuses an impossible pair
    -- with the CLIENT-ROW door's own typed reason (CLR37 fa_particulars_invalid), which was
    -- not one of the two sqlstates this arm listed -- so one impossible pair raised straight
    -- out of the loop and the WHOLE promotion aborted, losing every other key with it
    -- (entity_type included). It is withheld PER ITEM now, exactly like every other per-item
    -- refusal this door already records, which is what #1031's brief meant by leaving the
    -- promotion path's behaviour unchanged.
    exception when sqlstate 'CLR10' or sqlstate 'CLR11' or sqlstate 'CLR37' then
      get stacked diagnostics v_reason = returned_sqlstate, v_detail = pg_exception_detail;
      v_withheld := v_withheld || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'reason', 'refused',
        'sqlstate', v_reason, 'detail', v_detail));
      continue;
    end;
    if v_one ->> 'status' = 'skipped' then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'record_id', v_one -> 'record_id'));
    else
      v_promoted := v_promoted || jsonb_build_array(jsonb_build_object('item_key', it.item_key,
        'knowledge_key', it.knowledge_key, 'record_id', v_one -> 'record_id',
        'revision_id', v_one -> 'revision_id', 'asserted_by', to_jsonb(it.answered_by)));
    end if;
  end loop;

  select version_n into v_version from clara.knowledge_versions where firm_id = p.firm_id;
  perform clara._audit(p.firm_id, v_auditor, null, null, 'promote_plan_answers_to_knowledge', null,
    jsonb_build_object('plan', p_plan, 'scope_kind', v_scope, 'client', v_client,
      'promoted', jsonb_array_length(v_promoted), 'skipped', jsonb_array_length(v_skipped),
      'withheld', jsonb_array_length(v_withheld), 'op_key', p_op_key));
  return clara._finish_op(p.firm_id, 'promote_plan_answers_to_knowledge', p_op_key,
    jsonb_build_object('plan_id', p_plan, 'scope_kind', v_scope, 'client_id', v_client,
      'promoted', v_promoted, 'skipped', v_skipped, 'withheld', v_withheld,
      'knowledge_version', coalesce(v_version, 0)::text));
end $$;
revoke all on function clara.promote_plan_answers_to_knowledge(uuid, text, boolean, uuid) from public;

-- =====================================================================================
-- §E  THE THREE-ARGUMENT RULE 0310 MINTED IS WITHDRAWN. Dropped only AFTER both write doors above
--     call the four-argument form, so the catalogue never carries two overloads of this name and
--     no body is ever left pointing at a rule that is not there.
-- =====================================================================================
drop function if exists clara._knowledge_assert_fye_pair(uuid, text, jsonb);

reset role;

-- =====================================================================================
-- §Z  THE TAIL. Every assertion re-read from the CATALOG after the re-cut.
-- =====================================================================================
do $p1031fix_tail$
declare
  v_n int; v_sha text; v_pin record; v_a text; v_b text; v_c text; v_rule text;
  v_pos_assert_value int; v_pos_pair_rule int; v_pos_trust_wall int;
  c_core_new constant text := '  -- that cannot be a real calendar day -- see clara._knowledge_assert_fye_pair''s own comment.
  -- #1031 FIX ROUND (0317): the sibling is read AT THIS CAPTURE''S OWN APPLICABILITY, which is
  -- why the rule now takes it. uq_knowledge_live is partial over the applicability, so one
  -- client can hold several live rows of one key and an unscoped read judged an arbitrary one.
  perform clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value,
                                          coalesce(p_applies_when, ''{}''::jsonb));
';
  c_core_old constant text := '  -- that cannot be a real calendar day -- see clara._knowledge_assert_fye_pair''s own comment.
  perform clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value);
';
  c_corr_new constant text := '  -- #1031 FIX ROUND (0317): at the RECORD''S OWN applicability -- a correction re-states one
  -- live record in place and never moves it to another applies_when (the insert below reuses
  -- r.applies_when verbatim), so that is the applicability its sibling must be read at.
  perform clara._knowledge_assert_fye_pair(
    case when r.scope_kind = ''client'' then r.client_id else null end, r.knowledge_key, p_value,
    r.applies_when);
';
  c_corr_old constant text := '  perform clara._knowledge_assert_fye_pair(
    case when r.scope_kind = ''client'' then r.client_id else null end, r.knowledge_key, p_value);
';
  c_prom_new constant text := '    -- #1031 FIX ROUND (0317): CLR37 TOO. The year-end pair rule refuses an impossible pair
    -- with the CLIENT-ROW door''s own typed reason (CLR37 fa_particulars_invalid), which was
    -- not one of the two sqlstates this arm listed -- so one impossible pair raised straight
    -- out of the loop and the WHOLE promotion aborted, losing every other key with it
    -- (entity_type included). It is withheld PER ITEM now, exactly like every other per-item
    -- refusal this door already records, which is what #1031''s brief meant by leaving the
    -- promotion path''s behaviour unchanged.
    exception when sqlstate ''CLR10'' or sqlstate ''CLR11'' or sqlstate ''CLR37'' then
';
  c_prom_old constant text := '    exception when sqlstate ''CLR10'' or sqlstate ''CLR11'' then
';
begin
  -- T.1 EXACTLY ONE `_knowledge_assert_fye_pair` EXISTS, and it is the four-argument one: 0310's
  -- three-argument rule is gone, so no caller can resolve to the unscoped read again.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_knowledge_assert_fye_pair';
  if v_n <> 1 then
    raise exception '#1031 fix-round tail T.1: clara._knowledge_assert_fye_pair has % pg_proc row(s), expected exactly 1 (the four-argument form)', v_n
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._knowledge_assert_fye_pair(uuid,text,jsonb)') is not null then
    raise exception '#1031 fix-round tail T.1b: the three-argument rule 0310 minted is still live' using errcode = 'CLR10';
  end if;

  -- T.2 ITS SHAPE: stable, SECURITY DEFINER, owned by clara_fn_owner, search_path pinned, and
  -- EXECUTE granted to nobody -- an INTERNAL, exactly as 0310 left the three-argument form.
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)'::regprocedure
     and p.provolatile = 's' and p.prosecdef
     and p.proowner::regrole::text = 'clara_fn_owner'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#1031 fix-round tail T.2: the four-argument rule is missing its stable/definer/owner/search_path shape'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
   where p.oid = 'clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)'::regprocedure
     and a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1031 fix-round tail T.2b: the four-argument rule gained % grant(s) -- it is an INTERNAL, granted to nobody', v_n
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', 'clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)', 'EXECUTE') then
    raise exception '#1031 fix-round tail T.2c: PUBLIC has EXECUTE on the four-argument rule' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from unnest(array['clara_authenticated','clara_agent_ro','clara_runtime']) r(role)
     where has_function_privilege(r.role, 'clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)', 'EXECUTE')
  ) then
    raise exception '#1031 fix-round tail T.2d: an application role can now execute the four-argument rule directly' using errcode = 'CLR10';
  end if;

  -- T.3 THE RULE READS ITS SIBLING AT THE APPLICABILITY IT WAS GIVEN. Measured on the installed
  -- body, not argued: the digest is computed from p_applies_when and the sibling read is
  -- predicated on applies_when_digest.
  select p.prosrc into v_rule from pg_proc p
   where p.oid = 'clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)'::regprocedure;
  if position('clara._knowledge_applies_when_digest(coalesce(p_applies_when' in v_rule) = 0
     or position('r.applies_when_digest = v_digest' in v_rule) = 0 then
    raise exception '#1031 fix-round tail T.3: the installed rule does not read its sibling through the applicability digest' using errcode = 'CLR10';
  end if;

  -- T.4 BOTH WRITE DOORS CALL THE FOUR-ARGUMENT RULE, EXACTLY ONCE EACH, AND STRICTLY AFTER THEIR
  -- OWN EXISTING `_knowledge_assert_value` CALL AND BEFORE THE TRUST WALL -- 0310's own ordering,
  -- re-proved here because both bodies were re-cut.
  select p.prosrc into v_a from pg_proc p
   where p.oid = 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'::regprocedure;
  select p.prosrc into v_b from pg_proc p
   where p.oid = 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)'::regprocedure;
  select p.prosrc into v_c from pg_proc p
   where p.oid = 'clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)'::regprocedure;

  v_n := (length(v_a) - length(replace(v_a, 'clara._knowledge_assert_fye_pair(', ''))) / length('clara._knowledge_assert_fye_pair(');
  if v_n <> 1 then
    raise exception '#1031 fix-round tail T.4a: clara._knowledge_capture_core calls the pair rule % time(s), expected exactly 1', v_n using errcode = 'CLR10';
  end if;
  v_n := (length(v_b) - length(replace(v_b, 'clara._knowledge_assert_fye_pair(', ''))) / length('clara._knowledge_assert_fye_pair(');
  if v_n <> 1 then
    raise exception '#1031 fix-round tail T.4b: clara.correct_knowledge calls the pair rule % time(s), expected exactly 1', v_n using errcode = 'CLR10';
  end if;

  v_pos_assert_value := position('clara._knowledge_assert_value(p_knowledge_key, p_value)' in v_a);
  v_pos_pair_rule := position('clara._knowledge_assert_fye_pair(p_client, p_knowledge_key, p_value,' in v_a);
  v_pos_trust_wall := position('knowledge_trust_insufficient' in v_a);
  if not (v_pos_assert_value > 0 and v_pos_pair_rule > v_pos_assert_value and v_pos_trust_wall > v_pos_pair_rule) then
    raise exception '#1031 fix-round tail T.4c: clara._knowledge_capture_core does not call assert_value, THEN the four-argument pair rule, THEN reach the trust wall, in that order' using errcode = 'CLR10';
  end if;
  v_pos_assert_value := position('clara._knowledge_assert_value(r.knowledge_key, p_value)' in v_b);
  v_pos_pair_rule := position('clara._knowledge_assert_fye_pair(' in v_b);
  v_pos_trust_wall := position('knowledge_trust_insufficient' in v_b);
  if not (v_pos_assert_value > 0 and v_pos_pair_rule > v_pos_assert_value and v_pos_trust_wall > v_pos_pair_rule) then
    raise exception '#1031 fix-round tail T.4d: clara.correct_knowledge does not call assert_value, THEN the four-argument pair rule, THEN reach the trust wall, in that order' using errcode = 'CLR10';
  end if;
  if position('r.applies_when);' in v_b) = 0 then
    raise exception '#1031 fix-round tail T.4e: clara.correct_knowledge does not pass the record''s own applies_when to the pair rule' using errcode = 'CLR10';
  end if;

  -- T.5 THE PROMOTION DOOR WITHHOLDS CLR37 PER ITEM. Measured on the installed body.
  if position('sqlstate ''CLR10'' or sqlstate ''CLR11'' or sqlstate ''CLR37''' in v_c) = 0 then
    raise exception '#1031 fix-round tail T.5: clara.promote_plan_answers_to_knowledge still aborts on CLR37 instead of withholding the item' using errcode = 'CLR10';
  end if;

  -- T.6 THE THREE RE-CUT BODIES ARE THEIR PINNED PRE-IMAGES PLUS EXACTLY THIS FILE'S OWN CHUNKS,
  -- and nothing else. REVERSE SUBSTITUTION: put each pre-0317 chunk back and the whole body must
  -- hash to the sha the prestate pinned. A smuggled change anywhere else in the pasted bodies
  -- reds this migration rather than shipping.
  for v_pin in select * from (values
      ('clara._knowledge_capture_core', replace(v_a, c_core_new, c_core_old),
       '98bcbe3589c1813da4bbdb7f5486db0d4996e831050a86cd810e25d28554ce06'),
      ('clara.correct_knowledge', replace(v_b, c_corr_new, c_corr_old),
       '520d10e5fbecedbdec0b5d5625087a783ae3378a243a5f0669cb86d3723a189c'),
      ('clara.promote_plan_answers_to_knowledge', replace(v_c, c_prom_new, c_prom_old),
       '2c1c1022dad9b9d6639fef55c8a90263684fe882c1f0aaddddacd2f6bc7e6b80')
    ) as t(name, restored, sha) loop
    select encode(sha256(convert_to(v_pin.restored, 'UTF8')), 'hex') into v_sha;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1031 fix-round tail T.6: % is NOT its pinned pre-image plus this file''s own chunk (reverse substitution hashed %, expected %)', v_pin.name, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.7 ALL THREE RE-CUT BODIES KEEP THEIR OWN SHAPE: SECURITY DEFINER, owner and search_path
  -- unmoved, PUBLIC still with no EXECUTE, and every grant that was there before still there --
  -- `create or replace` preserves all of this, and this proves it did.
  for v_pin in select * from (values
      ('clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)'),
      ('clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)'),
      ('clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#1031 fix-round tail T.7: % lost its owner, its SECURITY DEFINER flag or its pinned search_path', v_pin.sig
        using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#1031 fix-round tail T.7b: PUBLIC gained EXECUTE on %', v_pin.sig using errcode = 'CLR10';
    end if;
  end loop;
  if not has_function_privilege('clara_authenticated', 'clara.correct_knowledge(uuid,jsonb,text,text,text,text,jsonb)', 'EXECUTE') then
    raise exception '#1031 fix-round tail T.7c: clara_authenticated lost EXECUTE on clara.correct_knowledge' using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)', 'EXECUTE') then
    raise exception '#1031 fix-round tail T.7d: clara_authenticated gained EXECUTE on the internal capture core' using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)', 'EXECUTE')
     or not has_function_privilege('clara_runtime', 'clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)', 'EXECUTE') then
    raise exception '#1031 fix-round tail T.7e: clara.promote_plan_answers_to_knowledge lost one of its two lanes'' EXECUTE grants' using errcode = 'CLR10';
  end if;
  if position('force_custom_plan' in array_to_string(
       (select proconfig from pg_proc where oid = 'clara.promote_plan_answers_to_knowledge(uuid,text,boolean,uuid)'::regprocedure), ',')) = 0 then
    raise exception '#1031 fix-round tail T.7f: clara.promote_plan_answers_to_knowledge lost its pinned plan_cache_mode' using errcode = 'CLR10';
  end if;

  -- T.8 NON-REGRESSION, re-read: the per-value rule, the client row's own door and the
  -- applicability digest are byte-for-byte what the prestate measured.
  for v_pin in select * from (values
      ('clara._knowledge_assert_value(text,jsonb)',
       '84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5'),
      ('clara.set_client_fy_end(uuid,integer,integer,text)',
       'd8aaadbb0fe715c1f90bee8e52273a231c49c25cbee1fd56e8d6d1b80fe5f72a'),
      ('clara._knowledge_applies_when_digest(jsonb)',
       '5d72c9a5372431e0f771077454af891e527af670e62634a7a6f6c89e93664646')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#1031 fix-round tail T.8: % MOVED (measured %, expected %) -- this file re-cuts exactly three bodies, replaces one rule and drops its old arity', v_pin.sig, v_sha, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1031 fix-round tail OK: exactly one clara._knowledge_assert_fye_pair exists, at four arguments, stable/definer/owned by clara_fn_owner/ungranted, reading its sibling through the applicability digest; both write doors call it exactly once, in order, the correction door at the record''s own applies_when; the promotion door withholds CLR37 per item; all three re-cut bodies are their pinned pre-images plus exactly this file''s own chunks (reverse substitution) and keep their owner/security/search_path/ACL; clara._knowledge_assert_value, clara.set_client_fy_end and clara._knowledge_applies_when_digest are byte-for-byte unmoved.';
end
$p1031fix_tail$;
