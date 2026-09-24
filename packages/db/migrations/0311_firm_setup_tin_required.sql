-- 0311_firm_setup_tin_required — #1032 (riders wave 4, lane 06): THE FIRM-SETUP TIN ITEM IS
-- ALWAYS OFFERED; ITS TURNOVER-DEPENDENT APPLICABILITY BECOMES A REQUIRED-OR-OPTIONAL MARKING
-- INSTEAD OF A SEEDED-OR-NOT DECISION.
-- =====================================================================================
-- Spec of record: issue #1032, its owner ruling (comment dated 2026-09-23, "Option A") and its
-- Agent Brief in the SAME comment. Parent/context: #891 (0257_firm_setup_applicability.sql) and
-- its own stated remainder — #891's fix round (folded into 0259) explicitly forbade "both
-- repairs at once" (AC2 wanted the item to follow the turnover answer both ways; the key-
-- interfaces line wanted no answer form on an inapplicable item), so a sub-threshold firm that
-- has voluntarily registered for MyInvois had NO path anywhere to record its TIN — a beta
-- "nothing is dark" violation (2026-09-20 ruling). Domain words: CONTEXT.md — "Firm setup",
-- "Onboarding plan".
--
-- =====================================================================================
-- THE OWNER'S RULING, RESTATED. The TIN item is seeded for EVERY firm now, whatever its turnover
-- answer. It is REQUIRED only when the turnover answer makes MyInvois mandatory (>= RM1M); it is
-- OPTIONAL otherwise — including the moment right after seeding, before turnover is even answered
-- — and an answer form is shown in BOTH cases. The required counter, `required_outstanding` and
-- the commit door count it only when it is required, so #891's own guarantee ("these are one
-- notion of required") holds, now over a set that can include a dynamically-required row rather
-- than the catalogue's static column alone. `mpers_eligibility` — the OTHER conditional row #891
-- introduced — is untouched: the ticket's own words are "the eligibility item keeps its present
-- behaviour", and every line below leaves its branch of `clara._firm_setup_applicability` and
-- every query that reads it for `mpers_eligibility` byte-identical.
--
-- =====================================================================================
-- WHY `clara._firm_setup_applicability` GAINS TWO NEW VERDICTS FOR ONE ITEM KEY, RATHER THAN A
-- THIRD BOOLEAN COLUMN OR A SECOND DOOR. The catalogue (`clara.firm_setup_keys`) is append-only
-- (0218 §A, `t_firm_setup_keys_append_only`) with `item_key` as its primary key, so a static
-- `required_for_commit` can never encode "required when this OTHER answer says so" — exactly the
-- gap #891's own header named for the two conditional rows. `_firm_setup_applicability` is
-- already the ONE derivation door both `seed_firm_setup_plan` and `get_firm_setup` consult for
-- `tin`; widening what IT returns for that one item_key, rather than inventing a second helper or
-- a second stored column, keeps "the seed and get_firm_setup read the same value" (the ticket's
-- own Key Interfaces line) true by construction instead of by convention. `tin`'s branch now
-- returns exactly two verdicts — `'required'` and `'optional'` — and NEVER `'inapplicable'` or
-- `'undetermined'`: TIN is asked of every firm, so neither "never asked" verdict is reachable for
-- it any more. `mpers_eligibility`'s branch is untouched and keeps its own three verdicts
-- (`'applicable'` / `'inapplicable'` / `'undetermined'`); the other ten rows keep returning
-- `'applicable'` unconditionally, exactly as 0257 shipped it.
--
-- AN UNANSWERED TURNOVER READS 'optional' FOR TIN, NEVER 'undetermined'. This is the one place
-- this file's reading of the ruling is NOT parallel to `mpers_eligibility`'s own "dependency
-- unanswered → undetermined, neither asked nor counted" shape. The owner's own words are
-- "REQUIRED only when the turnover answer makes MyInvois mandatory, and OPTIONAL otherwise" — an
-- unanswered turnover is not a case the ruling carves out as a third state; it is the "otherwise".
-- Practically this can never persist past the very first reconciliation anyway: `turnover` is
-- `required_for_commit = true` (must_ask), so `answer_firm_setup_item` refuses to answer ANY item
-- — turnover included — until it is SEEDED, and `seed_firm_setup_plan`'s one `insert … select …`
-- always seeds `turnover` and `tin` in the very same statement (see below) — there is no
-- reconciled plan on which turnover is answerable but tin is not yet seeded.
--
-- =====================================================================================
-- `clara.seed_firm_setup_plan`: TIN IS SEEDED WHENEVER IT IS NOT INAPPLICABLE OR UNDETERMINED —
-- WHICH FOR TIN IS NOW ALWAYS.
--
-- The reconciliation's one extra `and` clause (0257 §B) reads
-- `clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'`. Narrowing that to a single
-- literal would stop seeding TIN outright (it never returns `'applicable'` any more) and reading
-- it as `in ('applicable','required','optional')` would need updating again the next time this
-- door's verdict vocabulary grows. The recut instead asks the NEGATIVE question every verdict
-- this file knows about already answers correctly: `not in ('inapplicable','undetermined')` —
-- true for `'applicable'` (the ten unconditional rows), true for `'required'`/`'optional'` (tin,
-- always now), false for `'inapplicable'`/`'undetermined'` (mpers_eligibility, exactly when 0257
-- already excluded it). `mpers_eligibility`'s own seeded-or-not behaviour is therefore identical
-- to 0257/0259's: seeded once `applicable`, held back while `undetermined` or `inapplicable`.
--
-- =====================================================================================
-- `clara.get_firm_setup`, `clara.commit_firm_setup`, `clara.defer_firm_setup_item`: ONE PREDICATE
-- FOR "IS THIS ITEM REQUIRED RIGHT NOW", USED EVERYWHERE REQUIRED-NESS IS DECIDED.
--
-- `k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'` —
-- the catalogue's own static flag (nine rows, unmoved), OR the door's own dynamic verdict (`tin`
-- alone can ever read `'required'`; every other item_key's branch never returns that literal, so
-- this predicate is a strict superset of the old one that changes nothing for the other fourteen
-- rows). This is the SAME OR-of-two-sources shape 0257 itself used for its own now-withdrawn
-- "effectively required" widening — the difference this time is that EVERY caller of "is this
-- required" is recut TOGETHER, in the SAME migration, onto the SAME predicate: `items[].required`,
-- `counter.required_total`/`required_answered`, `required_outstanding` (all three in
-- `get_firm_setup`), the outstanding-items gate in `commit_firm_setup`, and the skip refusal in
-- `defer_firm_setup_item`. 0259's own fix round exists BECAUSE 0257 widened only ONE of these
-- (`get_firm_setup`'s counter) and left `required_outstanding` on the old predicate — "the SAME
-- screen prints a fraction its own list contradicts" (0259's header, verbatim reasoning this file
-- does not repeat by leaving any of the five sites behind).
--
-- NO `i.id is not null` GUARD IS NEEDED FOR TIN, UNLIKE 0257's WITHDRAWN WIDENING FOR
-- `mpers_eligibility`. 0257's own regression (its header, "REGRESSION THIS FILE MEASURED AND
-- DELIBERATELY AVOIDED") was gating a conditional item's counter contribution on live
-- applicability ALONE, which would count `mpers_eligibility` from the moment `entity_type` is
-- merely ANSWERED, even before any caller has reconciled the checklist again — inflating
-- `required_total` out from under a plan whose `mpers_eligibility` row does not exist yet. TIN
-- cannot suffer that: `answer_firm_setup_item` refuses to answer `turnover` at all until the plan
-- is SEEDED (`firm_setup_item_not_seeded`, 0218 §E.2), and `seed_firm_setup_plan`'s ONE `insert …
-- select …` seeds every not-yet-inapplicable-or-undetermined row — `turnover` and `tin` among
-- them — in the SAME statement (see above). So by the time `turnover` can ever be answered on a
-- real plan, `tin` is already a seeded row on that SAME plan; there is no reachable state where
-- `_firm_setup_applicability(p.id, 'tin') = 'required'` is true and `tin`'s own plan item does not
-- yet exist. `p1032.tin.always_seeded_required_or_optional` and
-- `p1032.tin.flip_keeps_answer_both_ways` (firm-setup-applicability.test.mjs) both exercise this
-- directly rather than merely asserting it.
--
-- `clara.defer_firm_setup_item` GAINS THE SAME PREDICATE, NOT NAMED IN THE TICKET'S OWN "Key
-- interfaces" LIST BUT NEEDED FOR THE SAME REASON 0259's FIX ROUND EXISTED. Without this, a
-- turnover answer that makes TIN required would raise the Required badge and hide the skip
-- control in the WEB surface (`firm-setup-checklist.tsx`'s `!item.required` guard, driven by
-- `get_firm_setup`'s now-recut `required` field) while the DATABASE DOOR ITSELF still admitted a
-- defer, because its own guard read the catalogue's permanently-`false` `required_for_commit`
-- alone — the exact "the surface hides a control the door still accepts" shape 0257/0259's own
-- history already names as a defect class. `p1032.commit.refuses_until_tin_answered_when_required`
-- proves the defer refusal alongside the commit refusal.
--
-- =====================================================================================
-- THE BACKFILL: `tin`'s `user_note` no longer promises "skip with a reason" — an optional TIN is
-- now answerable, never skipped-as-inapplicable. One row, the SAME `disable trigger … update …
-- enable trigger` shape 0258 §B established for exactly this situation (`clara.firm_setup_keys`
-- is append-only by `t_firm_setup_keys_append_only`, 0218 §A, `clara._tf_append_only`); `note`
-- (engineer provenance) is untouched, matching 0258's own division. The twelve-row hash both 0257
-- and 0259 pin (§0.5/T.2 below) EXCLUDES `user_note`, so this backfill does not move it.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO, each with its authority.
--   * it does NOT touch `clara.firm_setup_keys.required_for_commit` for `tin` — still `false`,
--     append-only, exactly as 0218 shipped it. "Required" is a LIVE verdict from the applicability
--     door, never a second write path onto the static column (the same reasoning 0257 itself gave
--     for not minting a second relation).
--   * it does NOT touch `clara.answer_firm_setup_item` — TIN was always answerable once seeded,
--     and the ticket's own "Out of scope" excludes any change to the interview's own TIN question.
--   * it does NOT touch `mpers_eligibility`'s branch of `_firm_setup_applicability`, nor any query
--     site's treatment of it — every `k.required_for_commit or … = 'required'` predicate below is
--     a no-op for `mpers_eligibility` because its branch never returns the literal `'required'`.
--     The ticket's own words, "the eligibility item keeps its present behaviour", are a STRUCTURAL
--     property of this file's design, not merely an untested claim: `p891.mpers.entity_type` and
--     `p891.answer.survives` (firm-setup-applicability.test.mjs) are left byte-for-byte and both
--     still pass, unedited, against this file's recut bodies.
--   * it does NOT rewrite `clara.firm_setup_keys.required_for_commit`, `item_kind`, `group_key` or
--     any other column of the `tin` row — `user_note` alone, via the same disable/enable-trigger
--     shape 0258 used, never an `alter table` and never a second insert.
--   * it does NOT widen `onboarding_plan_items.item_kind`'s CHECK, `clara.firm_setup_keys`'
--     `answer_shape` CHECK, or grant a new EXECUTE — five names are `create or replace`d, all five
--     keeping their exact prior signature, owner, SECURITY DEFINER/STABLE volatility, search_path
--     and ACL (the tail re-reads every one rather than trusting `create or replace`'s own
--     preservation, the 0257/0259 idiom).
--   * it mints no new function name and no new grant, so — like 0257 itself and like #979's 0251
--     (rig-meta.mjs, "NO COHORT, NO NEW NAME, NO GRANT CHANGE, each measured rather than assumed")
--     — this file adds NO `rig-meta.mjs` cohort: a cohort exists only to police a GRANTED name's
--     presence across a frontier boundary, and every name this file touches is either already
--     granted at an unchanged signature (`seed_firm_setup_plan`, `get_firm_setup`,
--     `commit_firm_setup`, `defer_firm_setup_item`) or already fully ungranted
--     (`_firm_setup_applicability`, EXECUTE-reachable by nobody both before and after).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- SS0 PRESTATE. Every claim this file makes about what it is recutting, MEASURED on this rig
-- (clara_l06, PostgreSQL 17.11, chain 0001..0295 plus 0310, no lane-06 commit before #1031/#1032)
-- off `pg_proc.prosrc` directly — never transcribed from 0218's, 0257's, 0258's or 0259's own text.
-- =====================================================================================
do $p1032_pre$
declare v_sha text; v_txt text; v_n int; v_note text; v_tg text; v_pin record; v_measured text;
begin
  -- 0.1 · EVERY NAME THIS FILE RECUTS OR CALLS EXISTS.
  if to_regprocedure('clara._firm_setup_applicability(uuid,text)') is null
     or to_regprocedure('clara.seed_firm_setup_plan(text)') is null
     or to_regprocedure('clara.get_firm_setup()') is null
     or to_regprocedure('clara.commit_firm_setup(uuid,uuid,text)') is null
     or to_regprocedure('clara.defer_firm_setup_item(uuid,uuid,text,text,text)') is null
     or to_regprocedure('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)') is null then
    raise exception '#1032 prestate: a firm-setup name this file recuts or calls is absent -- 0218/0257/0258/0259 must apply first'
      using errcode = 'CLR10';
  end if;

  -- 0.2 · PRE-IMAGE PINS, EVERY ONE MEASURED LIVE. Five RECUT (the five names 0259 last touched or
  -- 0218/0257 shipped untouched since); `answer_firm_setup_item` is a NEIGHBOUR this file does not
  -- edit, pinned so a drift there cannot silently invalidate this file's "the education guard and
  -- floor logic are unmoved" assumption.
  for v_pin in select * from (values
      ('clara._firm_setup_applicability(uuid,text)',
       '122cab3fc541de587ea2b57e24fef79b9d2b867727cfc889ad652981ea71dcb1'),
      ('clara.seed_firm_setup_plan(text)',
       '6d9a83b5d456b5a175db09537a16c32f22dc3bb56195c52fd9ae5ad6f080c056'),
      ('clara.get_firm_setup()',
       'be993e7de580e6c272d083a7681184af083e7dde067750817309c92c992acd08'),
      ('clara.commit_firm_setup(uuid,uuid,text)',
       'c527f0bf01a9a583d18180270a21bac4c7110b4daf64927ef7967bc428e9dc23'),
      ('clara.defer_firm_setup_item(uuid,uuid,text,text,text)',
       'aae9f7a024a894ea23205f7c7aeb9adc1a28a51532bb822d4743db13dc53edff'),
      ('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)',
       '2674cde3ba5feeed4fe9eba2f0a8bfb378d8b150d8929d7df5a51c1632de9d3c')
    ) as t(sig, sha)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_measured
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_measured is distinct from v_pin.sha then
      raise exception '#1032 prestate: % has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_measured, v_pin.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 0.3 · THE TWO PREDICATE LITERALS THIS FILE RELIES ON ARE STILL CATALOGUE MEMBERS (0257 §0.4,
  -- re-measured rather than assumed unmoved).
  if not exists (select 1 from clara.knowledge_keys where knowledge_key = 'entity_type'
                   and allowed_values ? 'sdn_bhd') then
    raise exception '#1032 prestate: entity_type no longer admits ''sdn_bhd'' -- the mpers_eligibility predicate must be re-derived'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.knowledge_keys where knowledge_key = 'turnover_band'
                   and allowed_values ? '<RM1M') then
    raise exception '#1032 prestate: turnover_band no longer admits ''<RM1M'' -- the tin required/optional predicate must be re-derived'
      using errcode = 'CLR10';
  end if;

  -- 0.4 · THE CATALOGUE'S OWN SHAPE FOR `tin` IS STILL WHAT THIS FILE'S REASONING RELIES ON: still
  -- `capture`, still `required_for_commit = false` (append-only; this file never touches it), still
  -- no `knowledge_key` (D8/D10), still not retired, and its `user_note` is still 0258's own text --
  -- the exact row this file's ONE backfill statement below is about to replace.
  if not exists (select 1 from clara.firm_setup_keys
                  where item_key = 'tin' and item_kind = 'capture'
                    and required_for_commit = false and knowledge_key is null and retired_at is null) then
    raise exception '#1032 prestate: the tin row no longer reads capture/not-required/no-knowledge-key/not-retired -- this file''s reasoning must be re-derived'
      using errcode = 'CLR10';
  end if;
  select user_note into v_note from clara.firm_setup_keys where item_key = 'tin';
  if v_note is distinct from 'The firm''s MyInvois TIN. Required when annual turnover is RM1 million or more; otherwise skip with a reason.' then
    raise exception '#1032 prestate: tin.user_note has DRIFTED from 0258''s own text (got %) -- re-derive the backfill before applying', v_note
      using errcode = 'CLR10';
  end if;

  -- 0.5 · THE CATALOGUE HOLDS EXACTLY ITS PINNED FIFTEEN ROWS -- the twelve accounting rows hash
  -- unmoved to 0257/0259's own pin (this file inserts and updates no ROW, only one CELL), plus the
  -- three education tips.
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 15 then
    raise exception '#1032 prestate: the firm setup catalogue holds % rows (expected 15)', v_n using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(string_agg(
      item_key || '|' || coalesce(knowledge_key,'') || '|' || item_kind || '|' ||
      required_for_commit::text || '|' || min_role || '|' || group_key || '|' ||
      answer_shape || '|' || answer_options::text || '|' || coalesce(answer_field,'') || '|' ||
      question || '|' || note || '|' || sort_order::text, '~' order by sort_order),'UTF8')),'hex')
    into v_sha from clara.firm_setup_keys
   where item_key not in ('tip_invite_colleagues','tip_knowledge_page','tip_start_from_conversation');
  if v_sha <> '156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd' then
    raise exception '#1032 prestate: the twelve accounting rows'' pre-existing columns have DRIFTED from the pinned baseline (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- 0.6 · THE APPEND-ONLY TRIGGER IS ENABLED (the state this file's own backfill leaves it in too).
  select t.tgenabled into v_tg from pg_trigger t
   where t.tgrelid = 'clara.firm_setup_keys'::regclass and t.tgname = 't_firm_setup_keys_append_only';
  if v_tg is distinct from 'O' then
    raise exception '#1032 prestate: t_firm_setup_keys_append_only reads tgenabled=%, expected O (enabled)', v_tg
      using errcode = 'CLR10';
  end if;

  -- 0.7 · onboarding_plan_items.state STILL ADMITS EXACTLY pending/answered/resolved/deferred --
  -- every recut body's own state literals depend on this set being unchanged (0257 §0.6, restated).
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'clara.onboarding_plan_items'::regclass and c.conname = 'onboarding_plan_items_state_check';
  if v_txt is distinct from
     'CHECK ((state = ANY (ARRAY[''pending''::text, ''answered''::text, ''resolved''::text, ''deferred''::text])))' then
    raise exception '#1032 prestate: onboarding_plan_items_state_check reads {%}, not the pinned four-value set this file''s predicates depend on', v_txt
      using errcode = 'CLR10';
  end if;

  -- 0.8 · NEITHER RECUT HAS ALREADY LANDED: no live body yet distinguishes tin's required/optional
  -- verdicts from mpers_eligibility's applicable/inapplicable ones.
  select p.prosrc into v_txt from pg_proc p where p.oid = 'clara._firm_setup_applicability(uuid,text)'::regprocedure;
  if position($tag$elsif p_item_key = 'tin' then$tag$ in v_txt) > 0
     and position($tag$return 'required';$tag$ in v_txt) > 0 then
    raise exception '#1032 prestate: clara._firm_setup_applicability already returns required/optional for tin -- already recut?'
      using errcode = 'CLR10';
  end if;

  raise notice '#1032 prestate: clean -- all six firm-setup names are live at their pinned pre-images, entity_type/turnover_band still admit the two literals this file relies on, the tin row still reads capture/not-required/no-knowledge-key/not-retired with 0258''s own user_note, the catalogue holds its pinned fifteen rows (twelve unmoved, hashing to the prior pin), the append-only trigger is enabled, onboarding_plan_items.state admits exactly its four values, and neither recut has already landed.';
end
$p1032_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SS A — THE BACKFILL. `tin`'s `user_note` alone; the SAME disable/enable-trigger shape 0258 §B
-- established. `note` (engineer provenance) is untouched.
-- =====================================================================================
alter table clara.firm_setup_keys disable trigger t_firm_setup_keys_append_only;

update clara.firm_setup_keys
   set user_note = 'The firm''s MyInvois TIN. Required once the firm''s turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.'
 where item_key = 'tin';

alter table clara.firm_setup_keys enable trigger t_firm_setup_keys_append_only;

do $p1032_bf$
declare v_n int;
begin
  select count(*)::int into v_n from clara.firm_setup_keys
   where item_key = 'tin'
     and user_note = 'The firm''s MyInvois TIN. Required once the firm''s turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.';
  if v_n <> 1 then
    raise exception '#1032 backfill: the tin row does not carry the new user_note after the backfill' using errcode = 'CLR10';
  end if;
end
$p1032_bf$;

-- =====================================================================================
-- SS B — `clara._firm_setup_applicability`, RECUT. Only the `tin` branch changes: it now returns
-- `'required'`/`'optional'`, never `'inapplicable'`/`'undetermined'`. The `mpers_eligibility`
-- branch and the unconditional `else` are BYTE-IDENTICAL to 0257 §A.
-- =====================================================================================
create or replace function clara._firm_setup_applicability(p_plan uuid, p_item_key text) returns text
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_dep_state text; v_dep_answer jsonb;
begin
  if p_item_key = 'mpers_eligibility' then
    -- eligibilitySegment.appliesTo: prior.entity_type === 'sdn_bhd' (interview.v2.segments.ts:375).
    -- #1032: UNCHANGED -- "the eligibility item keeps its present behaviour" (the ticket's own words).
    select i.state, i.answer into v_dep_state, v_dep_answer
      from clara.onboarding_plan_items i
     where i.plan_id = p_plan and i.item_key = 'entity_type';
    if not found or v_dep_state not in ('answered','resolved') then
      return 'undetermined';
    end if;
    if (v_dep_answer #>> '{}') = 'sdn_bhd' then
      return 'applicable';
    end if;
    return 'inapplicable';
  elsif p_item_key = 'tin' then
    -- #1032 (owner's ruling 2026-09-23, Option A): TIN is asked of EVERY firm -- never
    -- 'inapplicable' and never 'undetermined' any more. tinExempt(turnover) = turnover = '<RM1M'
    -- (interview.v1.core.ts:226-228; restated verbatim by interview.v2.segments.ts:64-69's
    -- tinValidatorGatedByTurnover) now decides REQUIRED vs OPTIONAL, not asked vs not asked. An
    -- unanswered turnover reads 'optional' -- the ruling's own "otherwise ... optional", not a
    -- third undetermined state (see this migration's header for why that is unreachable in
    -- practice regardless: turnover and tin are always seeded together).
    select i.state, i.answer into v_dep_state, v_dep_answer
      from clara.onboarding_plan_items i
     where i.plan_id = p_plan and i.item_key = 'turnover';
    if not found or v_dep_state not in ('answered','resolved') then
      return 'optional';
    end if;
    if (v_dep_answer #>> '{}') = '<RM1M' then
      return 'optional';
    end if;
    return 'required';
  else
    -- The other ten catalogue rows carry no predicate at all (Agent Brief: "the two predicates" —
    -- singular pair, no third). UNCHANGED by #1032.
    return 'applicable';
  end if;
end $$;
revoke all on function clara._firm_setup_applicability(uuid, text) from public;

-- =====================================================================================
-- SS C — `clara.seed_firm_setup_plan`, RECUT. ONE clause: the applicability guard admits every
-- verdict except `'inapplicable'`/`'undetermined'`, so `tin` (never either of those any more) is
-- seeded unconditionally and `mpers_eligibility`'s own seeded-or-not behaviour is unchanged. Every
-- other line -- the reservation, the state gate, #895's conditional bump, the catalogue's own
-- item_kind carried through (#935), the audit row and the event -- is 0259 SS C's body verbatim.
-- =====================================================================================
create or replace function clara.seed_firm_setup_plan(p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; p clara.onboarding_plans; v_dedupe jsonb; v_added int; v_total int; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  p := clara._firm_setup_plan(c.firm);
  if p.id is null then
    raise exception 'this firm has no firm-scope onboarding plan' using errcode = 'CLR11';
  end if;
  select * into p from clara.onboarding_plans where id = p.id for update;
  -- RESERVE-BEFORE-MUTABLE-VALIDATION: after identity/authz and the target lookup, before the
  -- state gate. An exact retry replays this receipt rather than reconciling twice.
  v_dedupe := clara._reserve_op(c.firm, 'seed_firm_setup_plan', p_op_key,
    clara._hash(jsonb_build_object('plan', p.id)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;

  -- THE RECONCILIATION ITSELF. `not exists` rather than `on conflict do update`: an existing item
  -- must not be touched AT ALL, and an upsert would rewrite its question text even when it left the
  -- answer alone. #935: the catalogue's OWN item_kind is carried through -- onboarding_plan_items
  -- .item_kind now admits `education` too, so no fold onto `todo` is needed any more.
  --
  -- #1032: …AND ANY ROW THAT IS NOT INAPPLICABLE OR UNDETERMINED RIGHT NOW. `tin`'s branch of
  -- `_firm_setup_applicability` no longer returns either of those two verdicts, so this clause now
  -- seeds it unconditionally; `mpers_eligibility`'s own held-back-while-undetermined-or-
  -- inapplicable behaviour is unchanged (its branch is untouched, SS B above).
  insert into clara.onboarding_plan_items(
      plan_id, firm_id, item_kind, item_key, question, answer, state, required_for_commit)
  select p.id, p.firm_id,
         k.item_kind,
         k.item_key, k.question, null, 'pending', k.required_for_commit
    from clara.firm_setup_keys k
   where not exists (select 1 from clara.onboarding_plan_items i
                      where i.plan_id = p.id and i.item_key = k.item_key)
     and clara._firm_setup_applicability(p.id, k.item_key) not in ('inapplicable', 'undetermined')
   order by k.sort_order;
  get diagnostics v_added = row_count;
  select count(*)::int into v_total from clara.firm_setup_keys;

  -- #895 DEFECT 1: a reconciliation that inserts NOTHING must leave the plan's own CAS token,
  -- revision number and revision history untouched. The audit row and the domain event below
  -- still fire UNCONDITIONALLY, carrying seeded=0 on a no-op run, so "an admin reconciled and
  -- nothing was missing" stays a receipted, readable fact even though nothing about the plan
  -- itself moved. A replay under the SAME op_key was already, and remains, unaffected by this --
  -- `clara._reserve_op` returned above before this point is ever reached on a second call.
  if v_added > 0 then
    p := clara._firm_setup_bump(p.id, c.actor);
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'seed_firm_setup_plan', null,
    jsonb_build_object('plan', p.id, 'seeded', v_added, 'catalogue_total', v_total,
      'revision_n', p.revision_n, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.seeded', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'seeded', v_added, 'catalogue_total', v_total,
      'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'state', p.state, 'seeded', v_added, 'catalogue_total', v_total);
  return clara._finish_op(c.firm, 'seed_firm_setup_plan', p_op_key, v_result);
end $door$;
revoke all on function clara.seed_firm_setup_plan(text) from public;

-- =====================================================================================
-- SS D — `clara.get_firm_setup`, RECUT. Four sites gain the SAME widened predicate
-- (`k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'`):
-- `items[].required`, `required_outstanding`, `counter.required_total`, `counter.required_answered`.
-- Every other line -- the items projection's join shape, `applicability` itself, `catalogue_total`,
-- `v_unseeded`, the retirement filters (#934) and the whole `confirmed_facts` block -- is 0259 SS G's
-- body verbatim.
-- =====================================================================================
create or replace function clara.get_firm_setup() returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare
  c record; p clara.onboarding_plans; v_items jsonb; v_out jsonb; v_facts jsonb;
  v_req_total int; v_req_done int; v_total int; v_unseeded int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  p := clara._firm_setup_plan(c.firm);

  select coalesce(jsonb_agg(x.j order by x.sort_order), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
        'item_key', k.item_key, 'kind', k.item_kind, 'group_key', k.group_key,
        -- #934: PREFER the accountant-facing user_note over the engineer's own `note` -- a row
        -- with no user_note yet (never one of the twelve; see header) falls back rather than
        -- rendering nothing.
        'question', k.question, 'note', coalesce(k.user_note, k.note),
        -- #1032: the catalogue's OWN required_for_commit flag, OR the applicability door's LIVE
        -- 'required' verdict -- the one thing this recut widens for tin, and a no-op for every
        -- other row (mpers_eligibility's own branch never returns the literal 'required').
        'required', (k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'),
        'min_role', k.min_role,
        'answer_shape', k.answer_shape, 'answer_options', k.answer_options,
        'answer_field', k.answer_field, 'sort_order', k.sort_order,
        -- 'unseeded' is a REAL state of this surface, not a null: the catalogue row exists and the
        -- plan has no item for it yet, which is exactly what the reconciling seed fixes.
        'state', coalesce(i.state, 'unseeded'),
        'answer', i.answer, 'answered_by', i.answered_by,
        'answered_by_name', u.display_name, 'answered_at', i.answered_at,
        'knowledge_key', k.knowledge_key, 'knowledge_record_id', r.record_id,
        -- #891: for mpers_eligibility, 'applicable' | 'inapplicable' | 'undetermined'; #1032: for
        -- tin, 'required' | 'optional', never the other two -- LIVE off clara._firm_setup_
        -- applicability, never stored, so an item answered before its dependency changed keeps its
        -- answer (untouched above) and is re-derived on every read.
        'applicability', clara._firm_setup_applicability(p.id, k.item_key)) as j,
      k.sort_order as sort_order
      from clara.firm_setup_keys k
      left join clara.onboarding_plan_items i
        on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
      left join clara.users u on u.id = i.answered_by
      -- The record this ITEM produced, matched on the key and the UNCONDITIONAL applicability this
      -- door captures under. A #654 promotion that carries conditions of its own is a different
      -- row and is not claimed here.
      left join clara.knowledge_records r
        on k.knowledge_key is not null and r.firm_id = c.firm and r.scope_kind = 'firm'
           and r.knowledge_key = k.knowledge_key and r.superseded_at is null
           and r.state = 'live' and r.applies_when = '{}'::jsonb
     -- #934: a RETIRED catalogue row is settled -- never asked, never shown, never counted -- and
     -- is excluded from this projection entirely rather than rendered with a tombstone flag.
     where k.retired_at is null
  ) x;

  -- #1032: required_outstanding now names a row that is required either statically (the catalogue
  -- column) OR dynamically (the applicability door) -- the SAME predicate `items[].required` and
  -- both counter sides below use, so this list can never disagree with either.
  select coalesce(jsonb_agg(k.item_key order by k.sort_order), '[]'::jsonb) into v_out
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.retired_at is null
     and (k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required')
     and (i.id is null or i.state = 'pending');

  -- #934: catalogue_total counts the LIVE catalogue -- a retired row is settled, not "still there
  -- but not required", so it is excluded here exactly as it is from items[] above.
  select count(*)::int into v_total from clara.firm_setup_keys where retired_at is null;
  -- #891: an INAPPLICABLE row is SETTLED -- this file's seed change means it is never inserted, so
  -- counting it as "still needs seeding" forever would keep `seeded` false for a firm this catalogue
  -- genuinely has nothing left to ask. An UNDETERMINED row still counts: its fate is not yet known,
  -- and the reconcile control must stay available until the dependency it needs is answered.
  -- #934: a RETIRED row is settled the same way an inapplicable one is -- excluded here too, so
  -- `seeded` can still reach true for a firm whose catalogue has nothing left to ask.
  -- #1032: unaffected -- tin never reads inapplicable any more, so this arm's only live effect for
  -- tin is that it always counts as seeded-or-seedable, which is exactly correct now that tin is
  -- always seeded.
  select count(*)::int into v_unseeded
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.retired_at is null and i.id is null
     and clara._firm_setup_applicability(p.id, k.item_key) <> 'inapplicable';
  -- #1032: the required denominator/numerator are the catalogue's own required_for_commit set, OR
  -- a row the applicability door reads 'required' right now -- the SAME predicate as items[] and
  -- required_outstanding above, so `required_total - required_answered` stays the length of
  -- required_outstanding by construction (0259's own invariant, re-pinned by
  -- p891.counter.excludes / p1032.tin.always_seeded_required_or_optional). No `i.id is not null`
  -- guard is needed here (unlike 0257's withdrawn widening for mpers_eligibility): tin and its
  -- dependency turnover are always seeded together (this migration's header explains why), so
  -- there is no reachable plan where tin reads 'required' and is not yet a seeded row.
  -- #895 (0256): `p.id is not null` on the denominator -- a firm holding NO firm-scope plan reads
  -- a 0-of-0 counter rather than a denominator it was never asked to fill.
  select count(*)::int into v_req_total
    from clara.firm_setup_keys k
   where p.id is not null and k.retired_at is null
     and (k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required');
  select count(*)::int into v_req_done
    from clara.firm_setup_keys k
    join clara.onboarding_plan_items i
      on p.id is not null and i.plan_id = p.id and i.item_key = k.item_key
   where k.retired_at is null
     and (k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required')
     and i.state in ('answered','resolved','deferred');

  select coalesce(jsonb_agg(y.j order by y.knowledge_key), '[]'::jsonb) into v_facts from (
    select clara._knowledge_row_json(r)
        || jsonb_build_object(
             'item_key', k.item_key,
             'question', k.question,
             'asserted_by_name', u.display_name,
             'key_description', kk.description,
             'value_shape', kk.value_shape,
             'validated_against', kk.validated_against,
             'authority_bearing', kk.authority_bearing,
             'asserted_by_active', (m.user_id is not null),
             'asserted_by_role', m.role,
             'authority_current', (m.user_id is not null and clara.role_rank(m.role)
               >= clara.role_rank(clara._knowledge_floor(r.knowledge_key, 'firm'))),
             -- 0192 SS D.8: a firm default NEVER shadows a client's own live `clara.client_facts`
             -- row, because the legacy table is still what the estate reads for the five carried
             -- keys. The surface says so rather than letting the register look self-contradictory.
             'legacy_client_fact_key',
               exists (select 1 from clara.client_fact_keys f where f.fact_key = r.knowledge_key)
           ) as j,
        r.knowledge_key as knowledge_key
      from clara.knowledge_records r
      -- #934 FIX ROUND: a retired catalogue row supplies no item_key/question to this
      -- projection either -- the sixth surface the retirement filter had missed.
      join clara.firm_setup_keys k
        on k.knowledge_key = r.knowledge_key and k.retired_at is null
      left join clara.users u on u.id = r.asserted_by
      left join clara.knowledge_keys kk on kk.knowledge_key = r.knowledge_key
      left join clara.firm_memberships m
        on m.firm_id = r.firm_id and m.user_id = r.asserted_by and m.status = 'active'
     where r.firm_id = c.firm and r.scope_kind = 'firm' and r.superseded_at is null
       and r.state = 'live'
  ) y;

  return jsonb_build_object(
    'plan_id', p.id, 'revision_token', p.revision_token, 'revision_n', p.revision_n,
    'state', p.state, 'committed_at', p.committed_at,
    'seeded', (p.id is not null and v_unseeded = 0),
    'catalogue_total', v_total,
    'counter', jsonb_build_object('required_answered', v_req_done, 'required_total', v_req_total),
    'items', v_items,
    'required_outstanding', v_out,
    'confirmed_facts', v_facts);
end $read$;
revoke all on function clara.get_firm_setup() from public;

-- =====================================================================================
-- SS E — `clara.commit_firm_setup`, RECUT (its first recut ever -- 0257/0259 both left it as a
-- measured, untouched baseline; the ticket's own Key Interfaces name it directly this time). ONE
-- widened predicate on the outstanding-items gate; every other line is 0218 §E.4's body verbatim.
-- =====================================================================================
create or replace function clara.commit_firm_setup(p_plan uuid, p_expected_revision uuid, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; p clara.onboarding_plans; v_dedupe jsonb; v_out jsonb; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into p from clara.onboarding_plans
   where id = p_plan and firm_id = c.firm and scope_kind = 'firm' for update;
  if not found then
    raise exception 'firm setup plan not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'commit_firm_setup', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'revision', p_expected_revision)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;
  if p.revision_token is distinct from p_expected_revision then
    raise exception 'stale onboarding plan revision'
      using errcode = 'CLR06', detail = '{"reason":"stale_plan"}';
  end if;

  -- #1032: the SAME predicate get_firm_setup's required_outstanding now reads -- a row required
  -- either statically (the catalogue column) or dynamically (a live 'required' verdict off the
  -- applicability door). `p.id` is always a real row here (the plan lookup above already refused
  -- CLR11 otherwise), so this is never evaluated against a null plan.
  select coalesce(jsonb_agg(k.item_key order by k.sort_order), '[]'::jsonb) into v_out
    from clara.firm_setup_keys k
    left join clara.onboarding_plan_items i
      on i.plan_id = p.id and i.item_key = k.item_key
   where (k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required')
     and (i.id is null or i.state = 'pending');
  if jsonb_array_length(v_out) > 0 then
    raise exception 'the firm setup checklist still has required items outstanding'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','required_items_outstanding','item_keys',v_out)::text;
  end if;

  update clara.onboarding_plans set
      state = 'committed', committed_at = now(), committed_by = c.actor
    where id = p.id;
  p := clara._firm_setup_bump(p.id, c.actor);

  perform clara._audit(c.firm, c.actor, null, null, 'commit_firm_setup', null,
    jsonb_build_object('plan', p.id, 'revision_n', p.revision_n, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.committed', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'state', 'committed', 'committed_at', p.committed_at,
    'committed_by', c.actor);
  return clara._finish_op(c.firm, 'commit_firm_setup', p_op_key, v_result);
end $door$;
revoke all on function clara.commit_firm_setup(uuid, uuid, text) from public;

-- =====================================================================================
-- SS F — `clara.defer_firm_setup_item`, RECUT. ONE widened predicate on the required-refusal
-- guard, in the SAME position; every other line, including #935's education guard, is 0259 SS E's
-- body verbatim.
-- =====================================================================================
create or replace function clara.defer_firm_setup_item(
    p_plan uuid, p_expected_revision uuid, p_item_key text, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $door$
declare c record; k record; p clara.onboarding_plans; i record; v_dedupe jsonb;
        v_key text; v_reason text; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  v_key := nullif(btrim(p_item_key), '');
  v_reason := nullif(btrim(p_reason), '');
  if p_op_key is null or btrim(p_op_key) = '' or v_key is null then
    raise exception 'plan, item_key and op_key are required' using errcode = 'CLR10';
  end if;
  select * into k from clara.firm_setup_keys where item_key = v_key;
  if not found then
    raise exception 'unknown firm setup item %', v_key using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_item_unknown"}';
  end if;
  -- #935: same reasoning as clara.answer_firm_setup_item's new guard (SS D) -- a tip is never
  -- deferred through the door that audits and emits an event on every acceptance.
  if k.item_kind = 'education' then
    raise exception 'firm setup item % is an education tip -- use clara.dismiss_firm_setup_tip instead', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_is_a_tip','item_key',v_key)::text;
  end if;
  perform clara._human_ctx(clara.role_rank(k.min_role));
  select * into p from clara.onboarding_plans
   where id = p_plan and firm_id = c.firm and scope_kind = 'firm' for update;
  if not found then
    raise exception 'firm setup plan not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'defer_firm_setup_item', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'revision', p_expected_revision,
      'item_key', v_key, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  if p.state <> 'open' then
    raise exception 'the firm setup plan is not open' using errcode = 'CLR10',
      detail = '{"reason":"firm_setup_not_open"}';
  end if;
  if p.revision_token is distinct from p_expected_revision then
    raise exception 'stale onboarding plan revision'
      using errcode = 'CLR06', detail = '{"reason":"stale_plan"}';
  end if;
  -- #1032: the SAME widened predicate commit_firm_setup and get_firm_setup now read -- a skip is
  -- refused when the row is required either statically OR by a live 'required' verdict (tin, once
  -- turnover makes MyInvois mandatory). Without this, the door would admit a skip the WEB surface's
  -- Required badge already hides the control for -- the exact defect class 0259's fix round exists
  -- because of, applied here before it can happen rather than after (see this migration's header).
  if k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required' then
    raise exception 'firm setup item % is required and cannot be skipped', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_required','item_key',v_key)::text;
  end if;
  if v_reason is null then
    raise exception 'skipping firm setup item % needs a stated reason', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_reason_required','item_key',v_key)::text;
  end if;

  select * into i from clara.onboarding_plan_items
   where plan_id = p.id and item_key = v_key for update;
  if not found then
    raise exception 'firm setup item % is not on this plan yet -- reconcile the checklist first', v_key
      using errcode = 'CLR10', detail = '{"reason":"firm_setup_item_not_seeded"}';
  end if;
  if i.state in ('answered','resolved') then
    raise exception 'firm setup item % has already been answered -- correct it rather than skipping it', v_key
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason','firm_setup_item_answered','item_key',v_key)::text;
  end if;

  update clara.onboarding_plan_items set
      state = 'deferred',
      answer = jsonb_build_object('deferred_reason', v_reason),
      answered_by = c.actor, answered_at = now(), updated_at = now()
    where id = i.id;

  p := clara._firm_setup_bump(p.id, c.actor);
  perform clara._audit(c.firm, c.actor, null, null, 'defer_firm_setup_item', null,
    jsonb_build_object('plan', p.id, 'item_key', v_key, 'revision_n', p.revision_n,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'firm_setup.item_deferred', null, c.actor, null, null, null, null, null,
    jsonb_build_object('plan_id', p.id, 'item_key', v_key, 'revision_n', p.revision_n));
  v_result := jsonb_build_object('plan_id', p.id, 'revision_token', p.revision_token,
    'revision_n', p.revision_n, 'item_key', v_key, 'state', 'deferred',
    'deferred_reason', v_reason, 'answered_by', c.actor);
  return clara._finish_op(c.firm, 'defer_firm_setup_item', p_op_key, v_result);
end $door$;
revoke all on function clara.defer_firm_setup_item(uuid, uuid, text, text, text) from public;

reset role;

-- =====================================================================================
-- SS T TAIL. Every assertion re-read from the CATALOG after the recut, never trusted from this
-- file's own text.
-- =====================================================================================
do $p1032_tail$
declare v_src text; v_posture text; v_n int; v_sha text; v_txt text; v_pin record;
begin
  -- 1 · THE BACKFILL LANDED, THE TRIGGER IS RE-ENABLED, AND THE OTHER FOURTEEN ROWS' user_note
  -- (WHERE NOT NULL) ARE UNTOUCHED -- this file writes exactly one cell.
  if not exists (select 1 from clara.firm_setup_keys
                  where item_key = 'tin'
                    and user_note = 'The firm''s MyInvois TIN. Required once the firm''s turnover makes MyInvois mandatory (RM1 million or more); optional below that, and you may still record it if the firm has registered for MyInvois voluntarily.') then
    raise exception '#1032 tail: the tin row does not carry the new user_note' using errcode = 'CLR10';
  end if;
  select t.tgenabled into v_txt from pg_trigger t
   where t.tgrelid = 'clara.firm_setup_keys'::regclass and t.tgname = 't_firm_setup_keys_append_only';
  if v_txt is distinct from 'O' then
    raise exception '#1032 tail: t_firm_setup_keys_append_only reads tgenabled=% after the backfill, expected O (enabled)', v_txt
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.firm_setup_keys;
  if v_n <> 15 then
    raise exception '#1032 tail: clara.firm_setup_keys holds % rows, expected 15 -- this file inserts none', v_n
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(string_agg(
      item_key || '|' || coalesce(knowledge_key,'') || '|' || item_kind || '|' ||
      required_for_commit::text || '|' || min_role || '|' || group_key || '|' ||
      answer_shape || '|' || answer_options::text || '|' || coalesce(answer_field,'') || '|' ||
      question || '|' || note || '|' || sort_order::text, '~' order by sort_order),'UTF8')),'hex')
    into v_sha from clara.firm_setup_keys
   where item_key not in ('tip_invite_colleagues','tip_knowledge_page','tip_start_from_conversation');
  if v_sha <> '156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd' then
    raise exception '#1032 tail: the twelve accounting rows'' pre-existing columns moved from the prestate''s pin (sha %) -- this file touches user_note alone', v_sha
      using errcode = 'CLR10';
  end if;

  -- 2 · clara._firm_setup_applicability: the tin branch reads required/optional, never
  -- applicable/inapplicable/undetermined; the mpers_eligibility branch and the unconditional else
  -- are UNMOVED (a substring match against the exact 0257 text, never re-derived).
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._firm_setup_applicability(uuid,text)'::regprocedure;
  if position($tag$elsif p_item_key = 'tin' then$tag$ in v_src) = 0
     or position($tag$return 'optional';$tag$ in v_src) = 0
     or position($tag$return 'required';$tag$ in v_src) = 0 then
    raise exception '#1032 tail: clara._firm_setup_applicability''s tin branch does not read required/optional' using errcode = 'CLR10';
  end if;
  -- Every occurrence of `return 'inapplicable';` / `return 'undetermined';` in the WHOLE function
  -- belongs to the (unmoved, byte-checked below) mpers_eligibility branch alone: exactly one each.
  -- If the tin branch below still returned either literal, the count would be two.
  v_n := (length(v_src) - length(replace(v_src, $tag$return 'inapplicable';$tag$, '')))
    / length($tag$return 'inapplicable';$tag$);
  if v_n <> 1 then
    raise exception '#1032 tail: clara._firm_setup_applicability carries % occurrences of return ''inapplicable'', expected exactly 1 (mpers_eligibility alone)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $tag$return 'undetermined';$tag$, '')))
    / length($tag$return 'undetermined';$tag$);
  if v_n <> 1 then
    raise exception '#1032 tail: clara._firm_setup_applicability carries % occurrences of return ''undetermined'', expected exactly 1 (mpers_eligibility alone)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, $tag$return 'required';$tag$, '')))
    / length($tag$return 'required';$tag$);
  if v_n <> 1 then
    raise exception '#1032 tail: clara._firm_setup_applicability carries % occurrences of return ''required'', expected exactly 1 (tin alone)', v_n
      using errcode = 'CLR10';
  end if;
  -- TWO occurrences, not one: the tin branch returns 'optional' from BOTH its own arms (turnover
  -- unanswered, and turnover answered '<RM1M') -- the ruling's own "otherwise ... optional" covers
  -- both, and this migration's header explains why the first arm is unreachable in practice but is
  -- still written, not collapsed away.
  v_n := (length(v_src) - length(replace(v_src, $tag$return 'optional';$tag$, '')))
    / length($tag$return 'optional';$tag$);
  if v_n <> 2 then
    raise exception '#1032 tail: clara._firm_setup_applicability carries % occurrences of return ''optional'', expected exactly 2 (tin''s two arms)', v_n
      using errcode = 'CLR10';
  end if;
  if position($tag$if p_item_key = 'mpers_eligibility' then
    -- eligibilitySegment.appliesTo: prior.entity_type === 'sdn_bhd' (interview.v2.segments.ts:375).
    -- #1032: UNCHANGED -- "the eligibility item keeps its present behaviour" (the ticket's own words).
    select i.state, i.answer into v_dep_state, v_dep_answer
      from clara.onboarding_plan_items i
     where i.plan_id = p_plan and i.item_key = 'entity_type';
    if not found or v_dep_state not in ('answered','resolved') then
      return 'undetermined';
    end if;
    if (v_dep_answer #>> '{}') = 'sdn_bhd' then
      return 'applicable';
    end if;
    return 'inapplicable';$tag$ in v_src) = 0 then
    raise exception '#1032 tail: clara._firm_setup_applicability''s mpers_eligibility branch moved -- it must stay byte-identical to 0257 §A' using errcode = 'CLR10';
  end if;
  if position($tag$else
    -- The other ten catalogue rows carry no predicate at all (Agent Brief: "the two predicates" —
    -- singular pair, no third). UNCHANGED by #1032.
    return 'applicable';
  end if;
end $tag$ in v_src) = 0 then
    raise exception '#1032 tail: clara._firm_setup_applicability''s unconditional else-branch moved' using errcode = 'CLR10';
  end if;

  -- 3 · clara.seed_firm_setup_plan: the applicability guard is the widened NOT IN form, and the
  -- OLD single-literal form is gone.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.seed_firm_setup_plan(text)'::regprocedure;
  if position($tag$and clara._firm_setup_applicability(p.id, k.item_key) not in ('inapplicable', 'undetermined')$tag$ in v_src) = 0 then
    raise exception '#1032 tail: clara.seed_firm_setup_plan does not carry the widened applicability guard' using errcode = 'CLR10';
  end if;
  if position($tag$clara._firm_setup_applicability(p.id, k.item_key) = 'applicable'$tag$ in v_src) <> 0 then
    raise exception '#1032 tail: clara.seed_firm_setup_plan still carries the old single-literal applicability guard' using errcode = 'CLR10';
  end if;

  -- 4 · clara.get_firm_setup: all four sites carry the widened predicate, exactly four times.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_firm_setup()'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src,
    $tag$k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'$tag$, '')))
    / length($tag$k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'$tag$);
  if v_n <> 4 then
    raise exception '#1032 tail: clara.get_firm_setup carries % occurrences of the widened required predicate, expected exactly 4 (items[], required_outstanding, required_total, required_answered)', v_n
      using errcode = 'CLR10';
  end if;
  if position($tag$'required', k.required_for_commit,$tag$ in v_src) <> 0 then
    raise exception '#1032 tail: clara.get_firm_setup still carries the OLD unwidened required field' using errcode = 'CLR10';
  end if;
  -- …and every arm 0259's fix round added is still here, verbatim (the retirement filters, the
  -- user_note preference, the unmoved v_unseeded/applicability/confirmed_facts blocks).
  foreach v_txt in array array[
      $tag$'note', coalesce(k.user_note, k.note)$tag$,
      $tag$'applicability', clara._firm_setup_applicability(p.id, k.item_key)$tag$,
      $tag$and clara._firm_setup_applicability(p.id, k.item_key) <> 'inapplicable';$tag$,
      $tag$join clara.firm_setup_keys k
        on k.knowledge_key = r.knowledge_key and k.retired_at is null$tag$
    ] loop
    if position(v_txt in v_src) = 0 then
      raise exception '#1032 tail: clara.get_firm_setup is missing an expected unmoved fragment: %', v_txt
        using errcode = 'CLR10';
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, 'retired_at is null', ''))) / length('retired_at is null');
  if v_n <> 7 then
    raise exception '#1032 tail: clara.get_firm_setup carries % occurrences of "retired_at is null", expected exactly 7 (0259''s own pinned count, unmoved)', v_n
      using errcode = 'CLR10';
  end if;

  -- 5 · clara.commit_firm_setup: the widened predicate landed on the outstanding-items gate,
  -- exactly once, and the door's posture is otherwise unmoved.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.commit_firm_setup(uuid,uuid,text)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src,
    $tag$k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'$tag$, '')))
    / length($tag$k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required'$tag$);
  if v_n <> 1 then
    raise exception '#1032 tail: clara.commit_firm_setup carries % occurrences of the widened required predicate, expected exactly 1', v_n
      using errcode = 'CLR10';
  end if;
  if position($tag$where k.required_for_commit
     and (i.id is null or i.state = 'pending');$tag$ in v_src) <> 0 then
    raise exception '#1032 tail: clara.commit_firm_setup still carries the OLD unwidened outstanding-items gate' using errcode = 'CLR10';
  end if;

  -- 6 · clara.defer_firm_setup_item: the widened predicate landed on the required-refusal guard,
  -- exactly once, still immediately before the reason-required check, and the education guard
  -- (#935) is still present, unmoved.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.defer_firm_setup_item(uuid,uuid,text,text,text)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src,
    $tag$if k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required' then$tag$, '')))
    / length($tag$if k.required_for_commit or clara._firm_setup_applicability(p.id, k.item_key) = 'required' then$tag$);
  if v_n <> 1 then
    raise exception '#1032 tail: clara.defer_firm_setup_item carries % occurrences of the widened required-refusal guard, expected exactly 1', v_n
      using errcode = 'CLR10';
  end if;
  if position($tag$if k.required_for_commit then
    raise exception 'firm setup item % is required and cannot be skipped', v_key$tag$ in v_src) <> 0 then
    raise exception '#1032 tail: clara.defer_firm_setup_item still carries the OLD unwidened required-refusal guard' using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'firm_setup_item_is_a_tip', ''))) / length('firm_setup_item_is_a_tip');
  if v_n <> 1 then
    raise exception '#1032 tail: clara.defer_firm_setup_item carries % occurrences of the #935 education guard, expected exactly 1 (unmoved)', v_n
      using errcode = 'CLR10';
  end if;

  -- 7 · POSTURE, all five recut names: owner, SECURITY DEFINER, STABLE/VOLATILE, search_path and
  -- ACL all unmoved by `create or replace function`.
  for v_pin in select * from (values
      ('clara._firm_setup_applicability(uuid,text)', 'clara_fn_owner | true | s | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner'),
      ('clara.seed_firm_setup_plan(text)', 'clara_fn_owner | true | v | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.get_firm_setup()', 'clara_fn_owner | true | s | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.commit_firm_setup(uuid,uuid,text)', 'clara_fn_owner | true | v | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.defer_firm_setup_item(uuid,uuid,text,text,text)', 'clara_fn_owner | true | v | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner')
    ) as t(sig, want)
  loop
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_posture is distinct from v_pin.want then
      raise exception '#1032 tail: % has the wrong posture after the recut; got {%}, want {%}', v_pin.sig, v_posture, v_pin.want
        using errcode = 'CLR10';
    end if;
  end loop;
  if has_function_privilege('clara_runtime', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara._firm_setup_applicability(uuid,text)'::regprocedure, 'execute') then
    raise exception '#1032 tail: clara._firm_setup_applicability is EXECUTE-reachable by a role it must not be' using errcode = 'CLR10';
  end if;

  -- 8 · NON-REGRESSION: the neighbour this file does not touch is byte-for-byte unmoved.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)'::regprocedure;
  if v_sha <> '2674cde3ba5feeed4fe9eba2f0a8bfb378d8b150d8929d7df5a51c1632de9d3c' then
    raise exception '#1032 tail: clara.answer_firm_setup_item MOVED (sha %) -- this file does not touch it', v_sha
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname in ('_firm_setup_plan','_assert_firm_setup_answer','_firm_setup_bump','dismiss_firm_setup_tip');
  if v_n <> 4 then
    raise exception '#1032 tail: the untouched firm-setup helper/door cohort has % of its 4 names', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#1032 tail: OK -- tin''s user_note carries the new sentence and the append-only trigger is re-enabled; the catalogue holds its pinned fifteen rows with the twelve accounting rows'' other columns unmoved; clara._firm_setup_applicability''s tin branch reads required/optional (never inapplicable/undetermined) while its mpers_eligibility branch and unconditional else are byte-identical to 0257; clara.seed_firm_setup_plan seeds any row that is not inapplicable/undetermined; clara.get_firm_setup carries the widened required predicate at exactly its four sites with every 0259 arm unmoved (seven retirement filters); clara.commit_firm_setup and clara.defer_firm_setup_item each carry the widened predicate exactly once, the latter''s #935 education guard unmoved; all five recut names keep their exact owner/SECURITY DEFINER/volatility/search_path/ACL posture, clara._firm_setup_applicability EXECUTE-unreachable by every application role; clara.answer_firm_setup_item and the untouched firm-setup cohort are unmoved.';
end
$p1032_tail$;
