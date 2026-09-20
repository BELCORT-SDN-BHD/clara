-- 0240_financial_year_end_day — #898 (rider; wave 2 lane 02): THE FINANCIAL-YEAR-END DAY BESIDE
-- ITS MONTH IN KNOWLEDGE.
-- =====================================================================================
-- Spec of record: issue #898's Agent Brief (triage comment, 2026-09-17). Domain words:
-- CONTEXT.md does not yet name this key; it is minted vocabulary alongside an existing one, not a
-- redefinition of one.
--
-- THE GAP, AS TRIAGE MEASURED IT. `clara.clients` has carried `fy_end_day` beside `fy_end_month`
-- since 0041 (`clara.set_client_fy_end`, D7); 0192 minted `financial_year_end_month` into
-- Knowledge and nothing for the day. The client-onboarding v4/v5 interview already asks the day
-- (`interview.v4.questions.ts` FYE_DAY_SEGMENT_V4, item_key `fye_day`) and validates it against
-- the prior `fye` answer (`validateFyeDay`) -- so the day has been a real, answered plan item with
-- nowhere in Knowledge to land, and #654's own firm-eligibility wall (0220) has had nothing to say
-- about it because it did not exist.
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE `financial_year_end_day` row in
-- `clara.knowledge_keys`, typed/scoped/floored BY VALUE off the LIVE `financial_year_end_month`
-- row (never re-typed, so the two cannot silently drift the way 0192 §A.1 warns a re-typed carry
-- would), and ONE `clara.knowledge_plan_item_map` row routing `fye_day` to it.
--
-- THE ONE RECUT THIS MAKES NECESSARY, AND WHY IT IS UNAVOIDABLE. `financial_year_end_day`'s own
-- validation label (`range:day_1_31`) needs a branch `clara._knowledge_assert_value` does not
-- have: every capture (`capture_knowledge`, `capture_knowledge_for`,
-- `promote_plan_answers_to_knowledge`, `correct_knowledge`) already calls it (0192:936,1243), and
-- it fails CLOSED on a label it does not implement (0192:718-722) -- "typed and validated the same
-- way" the month key is (the brief's own words) is not decorative, it is what makes the key
-- capturable at all. §B below pins the LIVE body's prosrc, splices in ONE more `elsif` arm the
-- same shape as `range:month_1_12`'s, and proves every existing label still behaves.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO (the ticket's own "out of scope"). It does not touch
-- `clara.set_client_fy_end` (0041) or the client row's own `ck_clients_fy_end` check -- the day's
-- TRUE calendar bound (28, 29, 30 or 31, depending on the month) is THEIR job, not the catalog's.
-- `clara._knowledge_assert_value` sees one key and one value; it has no sibling answer to read a
-- month from, so its own bound is the same coarse 1-31 a calendar cannot refuse on its own, exactly
-- the posture `range:month_1_12` already keeps for the month (a month key does not know the day
-- either). A knowledge value that is a syntactically valid day but wrong for the SAME client's
-- stated month is a cross-record disagreement the two live rows can show a reader, not a write
-- this migration refuses. It does not make the day required for commit, and it backfills no
-- existing client's Knowledge. It does not touch `clara.knowledge_key_firm_eligibility` (0220) --
-- the new key is an `assertion`, never `preference`/`policy`, and is deliberately not seeded
-- there, so `clara._tf_knowledge_firm_eligibility` (0220:418-437, untouched) already refuses a
-- firm-scope capture of it with the SAME `knowledge_scope_not_firm_defaultable` reason it gives
-- `financial_year_end_month` today, with NO new code -- proved in tests/knowledge-fye-day.test.mjs
-- (fd.04), not here: that wall needs an authenticated capture through clara.capture_knowledge,
-- which a migration transaction, with no JWT and no session firm, cannot mint.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: the catalog this file appends to must exist, the month key must
-- still carry the exact shape this file types the day key from, the day key must not already be
-- firm-eligible, and the function this file is about to recut must still carry the exact body
-- this file was authored against -- MEASURED on this rig now, per the work order's own rule for a
-- lane whose earlier ticket may already have recut a shared body (none has, in this lane, as of
-- #898; the pin still guards the NEXT ticket that touches it).
--
-- WHY NO "the day key must be absent" GUARD (unlike 0192/0220's own append-only prestates): #957
-- REDO reruns this WHOLE file, ledger row deleted, exactly to let one unmerged migration take one
-- more edit -- and this file's own stage-1 (§A's two inserts) had already landed on this lane
-- database before §B (the splice) was authored. A hard "must be absent" guard here would refuse
-- its OWN redo. §A's inserts are therefore idempotent (INSERT .. WHERE NOT EXISTS, never a bare
-- INSERT), and §Z's tail proves the END STATE regardless of whether this run was the first apply
-- or a redo. The prosrc pin below stays a HARD guard, deliberately: a redo that finds the body
-- ALREADY spliced is not safe to run this file's UNCHANGED splice against (§B's anchor still
-- occurs once in an already-spliced body, so re-splicing would duplicate the arm) -- that redo
-- needs a re-authored §B, which is exactly what a changed pin forces.
-- =====================================================================================
do $prestate$
declare
  v_month_kind text; v_month_shape text; v_month_scope text; v_month_authority boolean;
  v_month_floor text; v_prosrc_sha text;
begin
  if to_regclass('clara.knowledge_keys') is null or to_regclass('clara.knowledge_plan_item_map') is null then
    raise exception '#898 prestate: the 0192 knowledge catalog is absent' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.knowledge_key_firm_eligibility') is null then
    raise exception '#898 prestate: the 0220 firm-eligibility relation is absent' using errcode = 'CLR10';
  end if;

  select kind, value_shape, scope_default, authority_bearing, min_role
    into v_month_kind, v_month_shape, v_month_scope, v_month_authority, v_month_floor
    from clara.knowledge_keys where knowledge_key = 'financial_year_end_month';
  if not found then
    raise exception '#898 prestate: financial_year_end_month is absent -- this file types the day key off its live row'
      using errcode = 'CLR10';
  end if;
  if (v_month_kind, v_month_shape, v_month_scope, v_month_authority, v_month_floor)
     is distinct from ('assertion', 'number', 'client', false, 'bookkeeper') then
    raise exception '#898 prestate: financial_year_end_month no longer carries the shape this file was authored against (kind=%, value_shape=%, scope_default=%, authority_bearing=%, min_role=%) -- re-author against the live row',
      v_month_kind, v_month_shape, v_month_scope, v_month_authority, v_month_floor using errcode = 'CLR10';
  end if;

  if exists (select 1 from clara.knowledge_key_firm_eligibility where knowledge_key = 'financial_year_end_day') then
    raise exception '#898 prestate: financial_year_end_day is already firm-eligible -- this file must never seed it there'
      using errcode = 'CLR10';
  end if;

  select encode(sha256(prosrc::bytea), 'hex') into v_prosrc_sha
    from pg_proc where oid = 'clara._knowledge_assert_value(text,jsonb)'::regprocedure;
  if v_prosrc_sha is distinct from '0b0ac71c31ad26ec86d5bb6b2ed4e7bdbabcdf1267692bc21a9d898575b92949' then
    raise exception '#898 prestate: clara._knowledge_assert_value carries prosrc sha256 %, not the pin this splice was authored against -- re-measure and re-author §B', v_prosrc_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#898 prestate: clean -- financial_year_end_day and fye_day are both absent, financial_year_end_month carries the (assertion, number, client, false, bookkeeper) shape this file types the day key from, the day key is not firm-eligible, and clara._knowledge_assert_value carries the exact prosrc this file is about to splice.';
end
$prestate$;

-- =====================================================================================
-- §A — THE CATALOG AND THE MAP. Owner-populated, exactly like 0192/0220's own inserts into these
-- two append-only tables.
-- =====================================================================================
set role clara_fn_owner;

-- A.1 — THE DAY KEY, TYPED/SCOPED/FLOORED BY VALUE off the live month-key row (0192 §A.1's own
-- "carried by value, never re-typed" discipline, applied to a sibling key instead of a legacy
-- one): `kind`, `value_shape`, `scope_default`, `authority_bearing` and `min_role` are read off
-- `financial_year_end_month`, so a later edit to the month key's floor or scope reaches this file's
-- assumptions rather than silently diverging from them. Only `validated_against` (this key's own
-- range) and `description` are this key's own. `WHERE NOT EXISTS` (never a bare INSERT): idempotent
-- under #957 REDO, per §0's note -- a second application with an unedited §A is a no-op, not a
-- primary-key error.
insert into clara.knowledge_keys
    (knowledge_key, kind, value_shape, validated_against, allowed_values, description,
     scope_default, authority_bearing, min_role)
select 'financial_year_end_day', m.kind, m.value_shape, 'range:day_1_31', null,
       'The financial year-end DAY as a whole number 1-31 (D7; clara.clients.fy_end_day since '
       || '0041''s clara.set_client_fy_end; the interview''s validateFyeDay, '
       || 'packages/runtime/workflows/interview.v4.questions.ts). Beside financial_year_end_month, '
       || 'typed/scoped/floored the SAME WAY (carried by value off its live row): a whole number '
       || '1-31, client-scoped, never firm-defaultable. THIS LABEL HAS NO CROSS-FIELD AWARENESS -- '
       || 'it cannot see which month a sibling answer named, so it does not refuse a day too high '
       || 'for a SPECIFIC month (e.g. 30 in February); that calendar bound is enforced where the '
       || 'month IS in scope, by the interview''s own validateFyeDay and by the client row''s '
       || 'ck_clients_fy_end (0041), never here.',
       m.scope_default, m.authority_bearing, m.min_role
  from clara.knowledge_keys m
 where m.knowledge_key = 'financial_year_end_month'
   and not exists (select 1 from clara.knowledge_keys d where d.knowledge_key = 'financial_year_end_day');

-- A.2 — THE MAP ROW. `fye_day` is the v4/v5 CLIENT interview's own item_key (D7;
-- interview.v4.questions.ts fyeDayItems) -- new vocabulary, nothing this migration invents.
-- Idempotent for the same #957 REDO reason as A.1.
insert into clara.knowledge_plan_item_map (item_key, knowledge_key, note)
select 'fye_day', 'financial_year_end_day',
       'client interview (v4/v5, interview.v4.questions.ts fyeDayItems); JSON number 1-31, '
       || 'cross-checked against the fye answer by validateFyeDay -- NOT by this catalog label '
       || '(range:day_1_31 admits any whole number 1-31; the month-specific bound is the '
       || 'interview''s and the client row''s job)'
 where not exists (select 1 from clara.knowledge_plan_item_map p where p.item_key = 'fye_day');

reset role;

-- =====================================================================================
-- §B — THE RECUT. `clara._knowledge_assert_value` (0192:668-725) fails closed on a
-- `validated_against` label it does not implement, and every capture calls it before a row is
-- ever built (0192:936,1243) -- so `financial_year_end_day` is UNCAPTURABLE until this function
-- knows `range:day_1_31`. Harvested from the LIVE catalog (never re-typed from 0192's own file
-- text -- the 0046 S7.1 / 0048 S1 / 0052 S1 law), patched with ONE new `elsif` arm the same shape
-- as `range:month_1_12`'s, and executed as the single CREATE OR REPLACE `pg_get_functiondef`
-- returns. §0 already pinned the exact prosrc this splice assumes; §Z re-measures it after.
-- =====================================================================================
set role clara_fn_owner;

do $splice$
declare v_def text; v_anchor text; v_repl text; v_count int; v_next text;
begin
  select pg_get_functiondef('clara._knowledge_assert_value(text,jsonb)'::regprocedure) into v_def;

  -- THE INSERTION POINT: immediately before the `shape_only` arm, so the new arm reads exactly
  -- like `range:month_1_12`'s neighbour rather than like an afterthought bolted onto the `else`.
  v_anchor := $anchor$  elsif k.validated_against = 'shape_only' then$anchor$;
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '#898 splice: the shape_only anchor occurs % times in the live body (expected 1) -- this is not the body §0 pinned', v_count
      using errcode = 'CLR10';
  end if;

  v_repl := $repl$  elsif k.validated_against = 'range:day_1_31' then
    -- #898: THE FINANCIAL YEAR-END DAY, typed and validated the SAME WAY financial_year_end_month
    -- is just above -- a whole number inside a fixed bound, checked with NO cross-field awareness.
    -- This function sees one key and one value; it cannot see which month a sibling answer named,
    -- so the DAY-DEPENDS-ON-MONTH bound (28/29/30/31) is enforced where the month IS in scope --
    -- the interview's validateFyeDay (interview.v4.questions.ts) and the client row's own
    -- ck_clients_fy_end (0041) -- and is never re-derived here.
    v_num := (p_value #>> '{}')::numeric;
    if v_num is null or v_num <> trunc(v_num) or v_num < 1 or v_num > 31 then
      raise exception 'knowledge key % is a whole day 1-31, and % is not', p_knowledge_key, p_value::text
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'knowledge_value_invalid',
          'knowledge_key', p_knowledge_key)::text;
    end if;
  elsif k.validated_against = 'shape_only' then$repl$;

  v_next := replace(v_def, v_anchor, v_repl);
  execute v_next;
  raise notice '#898 splice: clara._knowledge_assert_value recut -- range:day_1_31 admits a whole number 1-31, every prior label''s arm untouched';
end
$splice$;

reset role;
-- The grant is UNTOUCHED and deliberately not re-issued: CREATE OR REPLACE preserves a function's
-- existing ACL by Postgres's own rule (0052's note, verbatim) -- §Z proves it rather than trusting it.

-- =====================================================================================
-- §Z — TAIL. Proves the catalog row and the map row landed with the exact shape §A promised, that
-- D8's wall stays shut for this key (never seeded firm-eligible), and that the firm-scope census
-- moved by exactly the one key this file adds.
-- =====================================================================================
do $tail$
declare
  v_row record; v_map record; v_n int; v_prosrc_sha text; v_prosrc text; v_secdef boolean;
  v_config text[]; v_anchor_count int;
begin
  select kind, value_shape, validated_against, allowed_values, scope_default, authority_bearing, min_role
    into v_row from clara.knowledge_keys where knowledge_key = 'financial_year_end_day';
  if not found then
    raise exception '#898 tail: financial_year_end_day did not land' using errcode = 'CLR10';
  end if;
  if (v_row.kind, v_row.value_shape, v_row.validated_against, v_row.allowed_values, v_row.scope_default,
      v_row.authority_bearing, v_row.min_role)
     is distinct from ('assertion', 'number', 'range:day_1_31', null, 'client', false, 'bookkeeper') then
    raise exception '#898 tail: financial_year_end_day landed with the wrong shape (kind=%, value_shape=%, validated_against=%, allowed_values=%, scope_default=%, authority_bearing=%, min_role=%)',
      v_row.kind, v_row.value_shape, v_row.validated_against, v_row.allowed_values, v_row.scope_default,
      v_row.authority_bearing, v_row.min_role using errcode = 'CLR10';
  end if;

  select item_key, knowledge_key into v_map from clara.knowledge_plan_item_map where item_key = 'fye_day';
  if not found or v_map.knowledge_key <> 'financial_year_end_day' then
    raise exception '#898 tail: the fye_day map row did not land naming financial_year_end_day' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_plan_item_map where item_key = 'fye_day';
  if v_n <> 1 then
    raise exception '#898 tail: % fye_day map row(s), not exactly one', v_n using errcode = 'CLR10';
  end if;

  -- D8'S WALL STAYS SHUT for this key -- never seeded, never made eligible.
  if exists (select 1 from clara.knowledge_key_firm_eligibility where knowledge_key = 'financial_year_end_day') then
    raise exception '#898 tail: financial_year_end_day was made firm-eligible -- D8 keeps a client-identity fact off the firm register'
      using errcode = 'CLR10';
  end if;

  -- THE FIRM-SCOPE CENSUS MOVED BY EXACTLY ONE REFUSED KEY. 0220's own from-scratch tail measured
  -- 9 refused keys AT ITS OWN POINT in the chain (13-key catalog); this file's insert lands AFTER
  -- 0220 runs, so that frozen assertion is untouched by a from-scratch replay. Measured on the
  -- LIVE catalog here, today, it is 10 -- and tests/knowledge-firm-defaults.test.mjs's "9 refused"
  -- cell moves to 10 in the same commit as this file for the same reason.
  select count(*)::int into v_n
    from clara.knowledge_keys k
   where not exists (select 1 from clara.knowledge_key_firm_eligibility e where e.knowledge_key = k.knowledge_key)
     and k.kind not in ('preference', 'policy');
  if v_n <> 10 then
    raise exception '#898 tail: % key(s) are refused at firm scope, not the 10 a 14-key catalog (0220''s 9 plus this file''s one) implies', v_n
      using errcode = 'CLR10';
  end if;

  -- THE SPLICE LANDED, and it landed exactly once. `_next` was built from a fresh
  -- `pg_get_functiondef` read, so a second application of this migration text (were it ever
  -- attempted) would find the anchor duplicated -- fail-closed, checked directly.
  select encode(sha256(prosrc::bytea), 'hex'), prosrc, prosecdef, proconfig
    into v_prosrc_sha, v_prosrc, v_secdef, v_config
    from pg_proc where oid = 'clara._knowledge_assert_value(text,jsonb)'::regprocedure;
  if v_prosrc_sha = '0b0ac71c31ad26ec86d5bb6b2ed4e7bdbabcdf1267692bc21a9d898575b92949' then
    raise exception '#898 tail: clara._knowledge_assert_value still carries the PRESTATE prosrc -- the splice did not land'
      using errcode = 'CLR10';
  end if;
  v_anchor_count := (length(v_prosrc) - length(replace(v_prosrc, 'range:day_1_31', ''))) / length('range:day_1_31');
  if v_anchor_count <> 1 then
    raise exception '#898 tail: range:day_1_31 occurs % time(s) in the recut body, not exactly once', v_anchor_count
      using errcode = 'CLR10';
  end if;
  -- EVERY PRIOR LABEL'S ARM SURVIVED, at its OWN original occurrence count (`format_only` is
  -- named twice in the live body by original design -- the `elsif` condition and its own error
  -- message, 0192:691-699 -- so 2 there is the unchanged baseline, not a splice defect).
  if (length(v_prosrc) - length(replace(v_prosrc, 'range:month_1_12', ''))) / length('range:month_1_12') <> 1
     or (length(v_prosrc) - length(replace(v_prosrc, 'format_only', ''))) / length('format_only') <> 2
     or (length(v_prosrc) - length(replace(v_prosrc, 'shape_only', ''))) / length('shape_only') <> 1
     or (length(v_prosrc) - length(replace(v_prosrc, 'enum:%', ''))) / length('enum:%') <> 1 then
    raise exception '#898 tail: a PRIOR validated_against arm did not survive the splice at its original occurrence count' using errcode = 'CLR10';
  end if;
  -- SECURITY DEFINER and the pinned search_path are byte-identical to prestate (CREATE OR REPLACE
  -- changes only the body unless told otherwise, and this file told it nothing else).
  if v_secdef is distinct from true or v_config is distinct from array['search_path=clara, pg_temp'] then
    raise exception '#898 tail: clara._knowledge_assert_value''s SECURITY DEFINER / search_path moved (secdef=%, config=%)',
      v_secdef, v_config using errcode = 'CLR10';
  end if;
  -- THE ACL IS UNTOUCHED: still revoked from PUBLIC and granted to no application role, exactly
  -- as 0192:725 left it.
  if has_function_privilege('public', 'clara._knowledge_assert_value(text,jsonb)', 'EXECUTE') then
    raise exception '#898 tail: PUBLIC can now execute clara._knowledge_assert_value' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from unnest(array['clara_authenticated','clara_agent_ro','clara_runtime']) r(role)
     where has_function_privilege(r.role, 'clara._knowledge_assert_value(text,jsonb)', 'EXECUTE')
  ) then
    raise exception '#898 tail: an application role can now execute clara._knowledge_assert_value directly' using errcode = 'CLR10';
  end if;

  raise notice '#898 tail: OK -- financial_year_end_day landed typed/scoped/floored off the live financial_year_end_month row, fye_day maps to it exactly once, it was not made firm-eligible, the firm-scope-refused census is now 10, clara._knowledge_assert_value carries range:day_1_31 exactly once with every prior label''s arm still exactly once, and its SECURITY DEFINER/search_path/ACL are byte-identical to prestate.';
end
$tail$;
