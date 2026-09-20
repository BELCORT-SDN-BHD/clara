-- 0249_fa_particulars_completion_fold — #976 (riders wave 2, lane 04): FOLD THE DUPLICATED
-- FIXED-ASSET PARTICULARS COMPLETION WALL SHARED BY `clara.complete_fixed_asset_particulars`
-- AND `clara._fa_complete_particulars_core` INTO ONE ROUTINE, BOTH THROUGH ONE CALL.
-- =====================================================================================
-- Spec of record: issue #976 — "Fold the duplicated completion wall shared by
-- complete_fixed_asset_particulars and _fa_complete_particulars_core". Builds on 0041 (the
-- human door), 0216 (the shared core `_fa_complete_particulars_core` and the runtime door
-- `complete_fixed_asset_particulars_for`) and 0227/#651 (the "first completion is not a change"
-- wall, spliced into BOTH bodies independently) — this file recuts the two completion bodies and
-- coins no new domain vocabulary of its own.
--
-- =====================================================================================
-- THE RESIDUAL, IN ONE PARAGRAPH.
--
-- `clara.complete_fixed_asset_particulars` (the human door) and `clara._fa_complete_particulars_core`
-- (the shared core behind the runtime door `complete_fixed_asset_particulars_for`) never routed
-- through each other, and each called `clara._fa_validate_particulars` independently. They
-- already carried duplicate copies of the "already complete" refusal
-- (`fa_particulars_already_complete`) before #651; #651 (0227) then had to add its new refusal
-- (`fa_change_class_on_completion`) to each body separately, as two unrolled splices with
-- different anchors (0227 §C, `$p651_completion_human$` / `$p651_completion_core$` — the human
-- door's anchor carries `_human_ctx` first, the core's does not, which is why 0227 could not
-- write one splice for both). #651's own final report calls the duplication out and defers the
-- fold (`docs/plan/active/refresh-wave-2026-09-18/reports/651-final.md`, follow-up #5); #973
-- (0248, this lane's own previous ticket) names it again as still open, out of ITS scope by name.
--
-- MEASURED on this rig before this file: the two bodies' "wall" — the change-class check, the
-- already-complete check, the lifecycle check, the validator call, and the non-depreciable /
-- residual bounds that follow it — is byte-identical CODE in both bodies (comments aside: the
-- human door carries two explanatory comments the core's own copy lacks). The reserve-op /
-- firm-resolution / advisory-lock / row-lock / UPDATE / audit / finish-op machinery AROUND that
-- wall is NOT identical (the human door resolves `c := clara._human_ctx(...)` and reserves under
-- `c.firm`/a literal verb name; the core takes `p_firm`/`p_actor`/`p_door` as arguments and
-- carries a DETAIL on its op-key and firm/asset refusals that the human door's own copies do
-- not) — that surrounding machinery is each door's own province and this file does not touch it.
--
-- =====================================================================================
-- THE FIX: ONE ROUTINE OWNS EACH HALF OF THE WALL, LIFTED VERBATIM — AND EACH HALF STAYS WHERE
-- 0227 PUT IT.
--
-- The wall has TWO halves, and they are not interchangeable, because they need different things
-- and therefore belong at different points in a door:
--
--   * `clara._fa_assert_completion_not_a_change(p_asset uuid, p_particulars jsonb)` — "a first
--     completion is not a change" (CLR37 `fa_change_class_on_completion`). It needs ONLY the
--     payload: not the resolved client, not the locked register row. 0227 spliced it immediately
--     after each door's op-key check and BEFORE `clara._reserve_op`, and said why, twice, in its
--     own splice text: "Refused BEFORE the op key is reserved, so a retry is clean." This file
--     keeps it exactly there, in both doors.
--   * `clara._fa_assert_particulars_completable(p_asset uuid, fa clara.fixed_assets, p_particulars
--     jsonb)` — everything that needs the LOCKED row: "already complete", the lifecycle check, the
--     `clara._fa_validate_particulars` call and the non-depreciable/residual bounds. It runs where
--     it always ran, after the select-for-update.
--
-- TWO routines, not one, is still exactly ONE place per check, which is the ticket (#976 AC1/AC2:
-- "only one place contains the check"). An earlier cut of this file folded both halves into the
-- single post-lock routine; that moved the change-class refusal BEHIND `_reserve_op`, the
-- firm-membership check, the advisory lock and the row lock, and deleted the sentence that
-- recorded the invariant. Two observable consequences, both MEASURED on this rig and now driven by
-- `p976.wall.before_reserve`: a replay carrying a spent op_key plus `change_class` answered CLR10
-- "op_key reused with different args", and a `change_class` payload naming an asset outside the
-- client answered CLR11 `asset_not_found` — in both cases telling the caller about a collision
-- instead of about the mistake that is theirs to fix (SPEC-L04-3, ADV-L04-4).
--
-- `clara._fa_assert_particulars_completable` is the post-lock wall fragment T's own prestate pins,
-- lifted UNCHANGED into one function
-- (`p_asset` is redundant with `fa.id` by construction — the callers both select `fa` `where id
-- = p_asset` — and is kept anyway so the extraction is a byte-for-byte lift with ZERO identifier
-- substitution, the same discipline 0248's own header states for its aggregation fold). It
-- returns the validated particulars object `v_p`, exactly what both callers used to compute
-- inline, for the caller's own UPDATE. It is an UNGRANTED INTERNAL CORE: owned by
-- `clara_fn_owner` like its siblings (`_fa_assert_period_open`, `_fa_depreciation_leg_pairing`),
-- `stable` (it writes nothing — only PostgreSQL RAISEs or returns a value), EXECUTE revoked from
-- PUBLIC, granted to no role.
--
-- Both callers now check the payload through the one guard where they already checked it, then
-- reserve / resolve / lock exactly as before, then call the one post-lock routine in place of
-- their own five-check copy, then proceed to their OWN UPDATE / audit / finish-op exactly as
-- before. Signatures, grants, refusal CODES and refusal PRECEDENCE are unchanged for every caller.
--
-- WHAT THIS FILE DOES NOT DO. It does not change what `clara._fa_validate_particulars` accepts
-- or refuses (pinned in the prestate AND re-read byte-for-byte in the tail — T.6). It does not
-- change which role may call either door, any grant, or any refusal CODE. It does not touch
-- `clara.revise_fixed_asset_particulars` or `clara.complete_fixed_asset_particulars_for`
-- (pinned unmoved — T.6). It does not touch the op-key-required check, the firm-membership
-- check, the row-not-found check, the advisory lock, the UPDATE, the audit call or the
-- finish-op call in EITHER body — each stays the exact text it already was, including the
-- differing DETAIL shapes those other refusals already carried before this file (the human
-- door's op-key/firm/asset refusals carry no DETAIL; the core's carry one) — only the wall in
-- the middle moved.
-- =====================================================================================

do $p976_pre$
declare
  v_sha text; v_pin record; v_redo boolean := false; v_live_human text;
  -- The two WALL fragments this file folds, normalized EXACTLY the way the tail compares live
  -- source (comments stripped, lowercased, whitespace runs collapsed to one space) — measured
  -- off pg_proc.prosrc on the lane-04 rig (clara_l04, PG 17, chain 0001..0234 + 0247 + 0248 +
  -- wave-2 lane-04 commits through #973), never transcribed from either file's own text. FRAG_A
  -- is the "first completion is not a change" refusal (CLR37 fa_change_class_on_completion);
  -- FRAG_B is "already complete" (CLR37 fa_particulars_already_complete) THROUGH the lifecycle
  -- check, the validator call and the non-depreciable/residual bounds that followed it in both
  -- original bodies — one contiguous chunk, confirmed identical in both (this file's own T.0).
  c_frag_a constant text :=
    'if p_particulars ? ''change_class'' or p_particulars ? ''change_reason'' then raise '
    || 'exception ''depreciation particulars are being completed for the first time; a change '
    || 'class describes a revision (clara.revise_fixed_asset_particulars), not a completion'' '
    || 'using errcode = ''clr37'', detail = jsonb_build_object(''reason'', '
    || '''fa_change_class_on_completion'', ''asset_id'', p_asset, ''remedy'', '
    || '''revise_fixed_asset_particulars'')::text; end if;';
  c_frag_b constant text :=
    'if clara._fa_particulars_complete(fa) then raise exception ''this asset''''s particulars '
    || 'are already complete; use revise_fixed_asset_particulars for a prospective change'' '
    || 'using errcode = ''clr37'', detail = jsonb_build_object(''reason'', '
    || '''fa_particulars_already_complete'', ''asset_id'', p_asset)::text; end if; if fa.status '
    || 'not in (''pending'', ''active'') then raise exception ''only a pending or active '
    || 'register row can be completed'' using errcode = ''clr37'', detail = '
    || 'jsonb_build_object(''reason'', ''fa_particulars_invalid'', ''axis'', ''lifecycle'', '
    || '''asset_id'', p_asset, ''status'', fa.status)::text; end if; v_p := '
    || 'clara._fa_validate_particulars(p_particulars); if fa.accum_depr_account_code is null '
    || 'and (v_p ->> ''method'') <> ''none'' then raise exception ''this asset sits on a '
    || 'non-depreciable enrolment (no accumulated-depreciation account); its method must be '
    || 'none'' using errcode = ''clr37'', detail = '
    || '''{"reason":"fa_particulars_invalid","axis":"non_depreciable"}''; end if; v_res := '
    || 'coalesce((v_p ->> ''residual_cents'')::bigint, 0); if (v_p ->> ''method'') <> ''none'' '
    || 'and v_res > fa.cost_cents then raise exception ''a residual value cannot exceed cost'' '
    || 'using errcode = ''clr37'', detail = '
    || '''{"reason":"fa_particulars_invalid","axis":"residual"}''; end if;';
  -- PRE-IMAGES, MEASURED on this rig now off pg_proc.prosrc.
  c_human_pre constant text :=
    'ae9defd63822ffe6dfd7880a173cca7d92cc5b30d4baf83043f6af77b0b7bf06';
  c_core_pre constant text :=
    '0ef75c4e8b223a1fc11f1fa3a860d02a6ce52f65ff5d551f8ffefcfebf7ead6a';
begin
  if to_regprocedure('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)') is null then
    raise exception '#976 prestate: clara.complete_fixed_asset_particulars is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)') is null then
    raise exception '#976 prestate: clara._fa_complete_particulars_core is absent -- 0216 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_validate_particulars(jsonb)') is null then
    raise exception '#976 prestate: clara._fa_validate_particulars is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._fa_particulars_complete(clara.fixed_assets)') is null then
    raise exception '#976 prestate: clara._fa_particulars_complete is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;

  -- IS THIS A REDO OF THIS VERY FILE? (#957: a rig may re-apply the highest applied, unmerged
  -- migration after an edit.) `create or replace` is safe over its own old effects, but a
  -- prestate pinned to the PRE-fold image would refuse the redo outright. Admitted LOUDLY, and
  -- only on the one signal that means it: the live human door already calls this file's own new
  -- core.
  if to_regprocedure('clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)') is not null then
    select p.prosrc into v_live_human from pg_proc p
     where p.oid = 'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)'::regprocedure;
    if position('clara._fa_assert_particulars_completable(' in v_live_human) > 0 then
      v_redo := true;
      raise notice '#976 prestate: the live human door ALREADY calls clara._fa_assert_particulars_completable -- treating this as a #957 REDO of 0249 itself. The recut is create-or-replace and the tail below re-proves the whole post-state from scratch.';
    else
      raise exception '#976 prestate: clara._fa_assert_particulars_completable already exists but the human door does not call it -- re-derive this file against the live catalog before applying'
        using errcode='CLR10';
    end if;
  end if;

  -- PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc. The
  -- two RECUT entries are skipped on a redo (their pre-image is this file's OWN prior effect, not
  -- the pin below); §T re-reads all six afterwards to confirm the final state either way.
  for v_pin in select * from (values
      ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)', c_human_pre, 'recut'),
      ('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)', c_core_pre, 'recut'),
      -- NON-REGRESSION: the validator, its predicate, the runtime OBO door and the revision door
      -- are untouched by this file.
      ('clara._fa_validate_particulars(jsonb)',
       '971242090b8171fa7f5ca50acdba9f536b07b498018a12d9778cb24d2d40858b', 'unmoved'),
      ('clara._fa_particulars_complete(clara.fixed_assets)',
       '4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9', 'unmoved'),
      ('clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)',
       '33c4b0b5a36a7d023a7f43a816a4ec7d5ffb01cf0a6ae1fec9c6937128c1d842', 'unmoved'),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
       'c814f6fd766565653e9649fa02b23b69f2b7c968f2988efff298a2a6ca48b437', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#976 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.0 BOTH WALL FRAGMENTS ARE STILL LIVE, IN BOTH BODIES, EXACTLY ONCE EACH -- the
  -- pre-condition for calling this a FOLD rather than an independent rewrite. Meaningless on a
  -- redo (the live bodies are already this file's OWN post-fold effect, which carries no such
  -- inline fragment at all -- see T.4/T.5 below, which re-prove that unconditionally).
  if not v_redo then
    declare
      v_h text; v_c text; v_n int;
    begin
      select lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
        into v_h from pg_proc p where p.oid = 'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)'::regprocedure;
      select lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
        into v_c from pg_proc p where p.oid = 'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)'::regprocedure;
      v_n := (length(v_h) - length(replace(v_h, c_frag_a, ''))) / length(c_frag_a);
      if v_n <> 1 then
        raise exception '#976 prestate: the human door carries the change-class fragment % time(s), expected exactly 1 -- this file is a FOLD of an existing duplication, not an independent rewrite', v_n
          using errcode='CLR10';
      end if;
      v_n := (length(v_c) - length(replace(v_c, c_frag_a, ''))) / length(c_frag_a);
      if v_n <> 1 then
        raise exception '#976 prestate: the core carries the change-class fragment % time(s), expected exactly 1', v_n
          using errcode='CLR10';
      end if;
      v_n := (length(v_h) - length(replace(v_h, c_frag_b, ''))) / length(c_frag_b);
      if v_n <> 1 then
        raise exception '#976 prestate: the human door carries the already-complete fragment % time(s), expected exactly 1', v_n
          using errcode='CLR10';
      end if;
      v_n := (length(v_c) - length(replace(v_c, c_frag_b, ''))) / length(c_frag_b);
      if v_n <> 1 then
        raise exception '#976 prestate: the core carries the already-complete fragment % time(s), expected exactly 1', v_n
          using errcode='CLR10';
      end if;
    end;
  end if;

  raise notice '#976 prestate: clean -- clara.complete_fixed_asset_particulars and clara._fa_complete_particulars_core are both at their measured pre-images (or, on a redo, this file''s own prior effect), the validator and its predicate and the two sibling doors are unmoved, and (pre-redo) both duplicated wall fragments are live in both bodies exactly once each.';
end
$p976_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A0 THE PRE-RESERVATION GUARD. The half of the wall that needs only the PAYLOAD, lifted
--     verbatim from the human door's own copy — INCLUDING 0227's last sentence, which records
--     WHERE it has to run and is the invariant an earlier cut of this file broke by folding it
--     in with the post-lock half.
-- =====================================================================================
-- `create OR REPLACE` throughout §A0/§A, and not decoration: the prestate above detects a #957
-- redo of this very file and continues on that branch, which a bare `create function` then
-- contradicts with 42723 "function already exists with same argument types" (ADV-L04-3 proved it
-- by running it; the fix round then hit the same refusal through scripts/migrate.mjs itself).
-- 0247, 0248, 0250 and 0251 all use `create or replace` for the same reason.
create or replace function clara._fa_assert_completion_not_a_change(p_asset uuid,
    p_particulars jsonb) returns void
  language plpgsql immutable security definer set search_path = clara, pg_temp as $$
begin
  -- 0227 (#651): A FIRST COMPLETION IS NOT A CHANGE. The change classification describes what
  -- kind of REVISION superseded a generation; a row whose particulars were never filled in has
  -- nothing to reclassify, and admitting the keys here would let a caller stamp a class on a root
  -- row that `ck_fixed_assets_change_class` would then refuse with a constraint name instead of a
  -- sentence. Refused BEFORE the op key is reserved, so a retry is clean — and, since the check
  -- needs nothing but the payload, before the client and asset walls too, so a caller who sends
  -- two mistakes is told about the one that is theirs to fix rather than about a collision.
  if p_particulars ? 'change_class' or p_particulars ? 'change_reason' then
    raise exception 'depreciation particulars are being completed for the first time; a change class describes a REVISION (clara.revise_fixed_asset_particulars), not a completion'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_change_class_on_completion',
          'asset_id', p_asset, 'remedy', 'revise_fixed_asset_particulars')::text;
  end if;
end $$;
revoke all on function clara._fa_assert_completion_not_a_change(uuid, jsonb) from public;
comment on function clara._fa_assert_completion_not_a_change(uuid, jsonb) is
  '#976 (0249): THE ONE routine that owns the fixed-asset "a first completion is not a change" '
  'refusal (CLR37 fa_change_class_on_completion), called by both '
  'clara.complete_fixed_asset_particulars and clara._fa_complete_particulars_core in place of '
  'each carrying its own copy of 0227''s splice. It reads ONLY the payload, which is why 0227 put '
  'it BEFORE clara._reserve_op and before the client/asset walls, and why this file keeps it '
  'there: refused before the op key is reserved, so a retry is clean, and a caller who also '
  'named the wrong asset is still told what is wrong with the CALL they made. The rest of the '
  'completion wall -- everything that needs the LOCKED register row -- lives in '
  'clara._fa_assert_particulars_completable. An UNGRANTED internal: owned by clara_fn_owner, '
  'EXECUTE revoked from public, granted to no role.';

-- =====================================================================================
-- §A  THE POST-LOCK CORE. Lifted verbatim from the human door's own copy (the richer of the two —
--     it alone carried the "COMPLETE-ONCE" and "NON-DEPRECIABLE" explanatory comments; the
--     core's copy lacked them, and both callers now read the same, better-documented text).
-- =====================================================================================
create or replace function clara._fa_assert_particulars_completable(p_asset uuid, fa clara.fixed_assets,
    p_particulars jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_p jsonb; v_res bigint;
begin
  -- COMPLETE-ONCE. After completion the row is immutable except for lifecycle facts; a
  -- correction goes through revise_fixed_asset_particulars, which is prospective and leaves
  -- the history it already charged intact.
  if clara._fa_particulars_complete(fa) then
    raise exception 'this asset''s particulars are already complete; use revise_fixed_asset_particulars for a prospective change'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_already_complete',
          'asset_id', p_asset)::text;
  end if;
  if fa.status not in ('pending', 'active') then
    raise exception 'only a pending or active register row can be completed'
      using errcode = 'CLR37',
        detail = jsonb_build_object('reason', 'fa_particulars_invalid', 'axis', 'lifecycle',
          'asset_id', p_asset, 'status', fa.status)::text;
  end if;
  v_p := clara._fa_validate_particulars(p_particulars);
  -- A NON-DEPRECIABLE PROFILE ADMITS ONLY method='none': the register row has no accumulated
  -- account to charge against, so any other method would build an entry with nowhere to post.
  if fa.accum_depr_account_code is null and (v_p ->> 'method') <> 'none' then
    raise exception 'this asset sits on a non-depreciable enrolment (no accumulated-depreciation account); its method must be none'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"non_depreciable"}';
  end if;
  v_res := coalesce((v_p ->> 'residual_cents')::bigint, 0);
  if (v_p ->> 'method') <> 'none' and v_res > fa.cost_cents then
    raise exception 'a residual value cannot exceed cost'
      using errcode = 'CLR37', detail = '{"reason":"fa_particulars_invalid","axis":"residual"}';
  end if;
  return v_p;
end $$;
revoke all on function clara._fa_assert_particulars_completable(uuid, clara.fixed_assets, jsonb) from public;
comment on function clara._fa_assert_particulars_completable(uuid, clara.fixed_assets, jsonb) is
  '#976 (0249): THE ONE routine that owns the POST-LOCK half of the fixed-asset particulars '
  'COMPLETION WALL -- "already complete" (fa_particulars_already_complete), the lifecycle check, '
  'the clara._fa_validate_particulars call, and the non-depreciable/residual bounds -- called by '
  'both clara.complete_fixed_asset_particulars and clara._fa_complete_particulars_core, in place '
  'of each carrying its own copy. Everything here needs the LOCKED clara.fixed_assets row, which '
  'is why it runs after the select-for-update; the payload-only half ("a first completion is not '
  'a change") is clara._fa_assert_completion_not_a_change, which both doors call BEFORE '
  'clara._reserve_op, where 0227 put it. Returns the validated particulars object for the '
  'caller''s own UPDATE. An UNGRANTED internal core: owned by clara_fn_owner, EXECUTE revoked '
  'from public, granted to no role -- reachable only from another SECURITY DEFINER body already '
  'running as the owner. Replaces the duplication #651 (0227) had to splice into both bodies '
  'separately and #973 (0248) named again as out of its own scope.';

-- =====================================================================================
-- §B  THE HUMAN DOOR. `clara.complete_fixed_asset_particulars` (0041:3035, recut by 0227) --
--     signature, grants and every OTHER refusal (op-key, firm membership, asset-not-found)
--     UNCHANGED. Only the wall in the middle now calls the shared routine.
-- =====================================================================================
create or replace function clara.complete_fixed_asset_particulars(p_client uuid, p_asset uuid,
    p_particulars jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype;
        v_p jsonb; v_res bigint;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- #976 (0249): the payload-only half of the completion wall, at 0227's own anchor -- BEFORE the
  -- op key is reserved, so a retry is clean. See clara._fa_assert_completion_not_a_change.
  perform clara._fa_assert_completion_not_a_change(p_asset, p_particulars);
  v_dedupe := clara._reserve_op(c.firm, 'complete_fixed_asset_particulars', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset,
      'particulars', p_particulars)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into fa from clara.fixed_assets where id = p_asset and client_id = p_client for update;
  if not found then
    raise exception 'fixed asset is not in this client' using errcode = 'CLR11';
  end if;
  -- #976 (0249): the completion WALL now lives in clara._fa_assert_particulars_completable, the
  -- ONE routine this door and clara._fa_complete_particulars_core both call. See that
  -- function's own comment for what it checks.
  v_p := clara._fa_assert_particulars_completable(p_asset, fa, p_particulars);
  v_res := coalesce((v_p ->> 'residual_cents')::bigint, 0);
  update clara.fixed_assets set
    depreciation_method = v_p ->> 'method',
    useful_life_months = nullif(v_p ->> 'useful_life_months', '')::int,
    depreciation_rate_bps = nullif(v_p ->> 'rate_bps', '')::int,
    residual_cents = case when (v_p ->> 'method') = 'none' then coalesce(fa.residual_cents, 0)
                          else v_res end,
    depreciation_start_date = (v_p ->> 'start_date')::date,
    description = coalesce(nullif(v_p ->> 'description', ''), fa.description),
    ca_class = coalesce(nullif(v_p ->> 'ca_class', ''), fa.ca_class),
    is_commercial_vehicle = coalesce(nullif(v_p ->> 'is_commercial_vehicle', '')::boolean,
                                     fa.is_commercial_vehicle),
    is_new = coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new),
    updated_at = now()
    where id = p_asset;
  perform clara._audit(c.firm, c.actor, null, null, 'complete_fixed_asset_particulars', null,
    jsonb_build_object('client', p_client, 'asset', p_asset, 'particulars', v_p,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'complete_fixed_asset_particulars', p_op_key,
    jsonb_build_object('asset_id', p_asset, 'client_id', p_client, 'particulars_complete', true));
end $$;
revoke all on function clara.complete_fixed_asset_particulars(uuid, uuid, jsonb, text) from public;

-- =====================================================================================
-- §C  THE SHARED CORE. `clara._fa_complete_particulars_core` (0216:685) -- signature, grants,
--     the DETAIL shapes its OTHER refusals already carried (op-key, firm, asset) UNCHANGED.
--     Only the wall in the middle now calls the shared routine.
-- =====================================================================================
create or replace function clara._fa_complete_particulars_core(p_firm uuid, p_actor uuid, p_client uuid,
    p_asset uuid, p_particulars jsonb, p_op_key text, p_door text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_firm uuid; fa clara.fixed_assets%rowtype; v_p jsonb; v_res bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_op_key"}';
  end if;
  -- #976 (0249): the payload-only half of the completion wall, at 0227's own anchor -- BEFORE the
  -- op key is reserved, so a retry is clean. See clara._fa_assert_completion_not_a_change.
  perform clara._fa_assert_completion_not_a_change(p_asset, p_particulars);
  v_dedupe := clara._reserve_op(p_firm, p_door, p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'asset', p_asset,
      'particulars', p_particulars)));
  if v_dedupe is not null then return v_dedupe; end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> p_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_found"}';
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into fa from clara.fixed_assets where id = p_asset and client_id = p_client for update;
  if not found then
    raise exception 'fixed asset is not in this client' using errcode = 'CLR11',
      detail = '{"reason":"asset_not_found"}';
  end if;
  -- #976 (0249): the completion WALL now lives in clara._fa_assert_particulars_completable, the
  -- ONE routine this core and clara.complete_fixed_asset_particulars both call. See that
  -- function's own comment for what it checks.
  v_p := clara._fa_assert_particulars_completable(p_asset, fa, p_particulars);
  v_res := coalesce((v_p ->> 'residual_cents')::bigint, 0);
  -- NO JOURNAL IS WRITTEN HERE, AND THAT IS THE WHOLE TICKET (#639). The acquisition posted
  -- when it posted; the depreciation particulars are a register fact that arrives later.
  update clara.fixed_assets set
    depreciation_method = v_p ->> 'method',
    useful_life_months = nullif(v_p ->> 'useful_life_months', '')::int,
    depreciation_rate_bps = nullif(v_p ->> 'rate_bps', '')::int,
    residual_cents = case when (v_p ->> 'method') = 'none' then coalesce(fa.residual_cents, 0)
                          else v_res end,
    depreciation_start_date = (v_p ->> 'start_date')::date,
    description = coalesce(nullif(v_p ->> 'description', ''), fa.description),
    ca_class = coalesce(nullif(v_p ->> 'ca_class', ''), fa.ca_class),
    is_commercial_vehicle = coalesce(nullif(v_p ->> 'is_commercial_vehicle', '')::boolean,
                                     fa.is_commercial_vehicle),
    is_new = coalesce(nullif(v_p ->> 'is_new', '')::boolean, fa.is_new),
    updated_at = now()
    where id = p_asset;
  perform clara._audit(p_firm, p_actor, null, null, p_door, null,
    jsonb_build_object('client', p_client, 'asset', p_asset, 'particulars', v_p,
      'op_key', p_op_key));
  return clara._finish_op(p_firm, p_door, p_op_key,
    jsonb_build_object('asset_id', p_asset, 'client_id', p_client, 'particulars_complete', true));
end $$;
revoke all on function clara._fa_complete_particulars_core(uuid, uuid, uuid, uuid, jsonb, text, text) from public;

reset role;

-- =====================================================================================
-- §T  THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p976_tail$
declare
  v_h text; v_c text; v_n int; v_pin record; v_sha text; v_names text[];
  c_frag_a constant text :=
    'if p_particulars ? ''change_class'' or p_particulars ? ''change_reason'' then raise '
    || 'exception ''depreciation particulars are being completed for the first time; a change '
    || 'class describes a revision (clara.revise_fixed_asset_particulars), not a completion'' '
    || 'using errcode = ''clr37'', detail = jsonb_build_object(''reason'', '
    || '''fa_change_class_on_completion'', ''asset_id'', p_asset, ''remedy'', '
    || '''revise_fixed_asset_particulars'')::text; end if;';
  c_frag_b constant text :=
    'if clara._fa_particulars_complete(fa) then raise exception ''this asset''''s particulars '
    || 'are already complete; use revise_fixed_asset_particulars for a prospective change'' '
    || 'using errcode = ''clr37'', detail = jsonb_build_object(''reason'', '
    || '''fa_particulars_already_complete'', ''asset_id'', p_asset)::text; end if; if fa.status '
    || 'not in (''pending'', ''active'') then raise exception ''only a pending or active '
    || 'register row can be completed'' using errcode = ''clr37'', detail = '
    || 'jsonb_build_object(''reason'', ''fa_particulars_invalid'', ''axis'', ''lifecycle'', '
    || '''asset_id'', p_asset, ''status'', fa.status)::text; end if; v_p := '
    || 'clara._fa_validate_particulars(p_particulars); if fa.accum_depr_account_code is null '
    || 'and (v_p ->> ''method'') <> ''none'' then raise exception ''this asset sits on a '
    || 'non-depreciable enrolment (no accumulated-depreciation account); its method must be '
    || 'none'' using errcode = ''clr37'', detail = '
    || '''{"reason":"fa_particulars_invalid","axis":"non_depreciable"}''; end if; v_res := '
    || 'coalesce((v_p ->> ''residual_cents'')::bigint, 0); if (v_p ->> ''method'') <> ''none'' '
    || 'and v_res > fa.cost_cents then raise exception ''a residual value cannot exceed cost'' '
    || 'using errcode = ''clr37'', detail = '
    || '''{"reason":"fa_particulars_invalid","axis":"residual"}''; end if;';
begin
  -- T.1 BOTH NEW ROUTINES EXIST with the right shape: SECURITY DEFINER, owned by clara_fn_owner,
  -- search_path pinned, EXECUTE granted to nobody -- INTERNALS like their siblings. The guard is
  -- IMMUTABLE (it reads only its own arguments); the post-lock core is STABLE (it calls
  -- clara._fa_particulars_complete and clara._fa_validate_particulars).
  for v_pin in select * from (values
      ('clara._fa_assert_completion_not_a_change(uuid,jsonb)', 'i'),
      ('clara._fa_assert_particulars_completable(uuid,clara.fixed_assets,jsonb)', 's')
    ) as t(sig, vol) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.provolatile = v_pin.vol and p.prosecdef
       and p.proowner::regrole::text = 'clara_fn_owner'
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#976 tail T.1: % is missing its %/definer/owner/search_path shape', v_pin.sig, v_pin.vol
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
     where p.oid = v_pin.sig::regprocedure
       and a::text not like 'clara_fn_owner=%';
    if v_n <> 0 then
      raise exception '#976 tail T.1b: % gained % grant(s) -- it is an INTERNAL, granted to nobody', v_pin.sig, v_n
        using errcode='CLR10';
    end if;
  end loop;

  -- T.2 BOTH RECUT BODIES NOW CALL BOTH SHARED ROUTINES, BY FULLY-QUALIFIED NAME.
  select p.prosrc into v_h from pg_proc p
   where p.oid = 'clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)'::regprocedure;
  select p.prosrc into v_c from pg_proc p
   where p.oid = 'clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)'::regprocedure;
  if position('clara._fa_assert_particulars_completable(' in v_h) = 0 then
    raise exception '#976 tail T.2: clara.complete_fixed_asset_particulars does not call the shared wall core'
      using errcode='CLR10';
  end if;
  if position('clara._fa_assert_particulars_completable(' in v_c) = 0 then
    raise exception '#976 tail T.2: clara._fa_complete_particulars_core does not call the shared wall core'
      using errcode='CLR10';
  end if;
  if position('clara._fa_assert_completion_not_a_change(' in v_h) = 0 then
    raise exception '#976 tail T.2c: clara.complete_fixed_asset_particulars does not call the shared change-class guard'
      using errcode='CLR10';
  end if;
  if position('clara._fa_assert_completion_not_a_change(' in v_c) = 0 then
    raise exception '#976 tail T.2c: clara._fa_complete_particulars_core does not call the shared change-class guard'
      using errcode='CLR10';
  end if;

  -- T.2d …AND THE GUARD RUNS BEFORE THE RESERVATION IN BOTH, which is 0227's own written
  -- invariant ("Refused BEFORE the op key is reserved, so a retry is clean", stated twice in its
  -- splice text) and the property an earlier cut of THIS file silently reversed. Proved off the
  -- catalog, by offset, not argued from a header.
  if position('clara._fa_assert_completion_not_a_change(' in v_h)
       >= position('clara._reserve_op(' in v_h) then
    raise exception '#976 tail T.2d: clara.complete_fixed_asset_particulars calls the change-class guard AFTER clara._reserve_op -- 0227 requires it before'
      using errcode='CLR10';
  end if;
  if position('clara._fa_assert_completion_not_a_change(' in v_c)
       >= position('clara._reserve_op(' in v_c) then
    raise exception '#976 tail T.2d: clara._fa_complete_particulars_core calls the change-class guard AFTER clara._reserve_op -- 0227 requires it before'
      using errcode='CLR10';
  end if;
  -- …and the post-lock core still runs AFTER the row lock, where every check it carries needs it.
  if position('clara._fa_assert_particulars_completable(' in v_h) <= position('for update' in v_h)
     or position('clara._fa_assert_particulars_completable(' in v_c) <= position('for update' in v_c) then
    raise exception '#976 tail T.2e: the post-lock wall core no longer runs after the select-for-update in both doors'
      using errcode='CLR10';
  end if;

  -- T.3 …AND NEITHER RECUT BODY STILL CARRIES EITHER RAW FRAGMENT -- the extraction is real, not
  -- a vacuous "call it AND keep the old copy too" patch.
  declare v_hn text := lower(regexp_replace(regexp_replace(v_h, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
          v_cn text := lower(regexp_replace(regexp_replace(v_c, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'));
  begin
    if position(c_frag_a in v_hn) <> 0 then
      raise exception '#976 tail T.3: clara.complete_fixed_asset_particulars still carries the raw change-class fragment -- the fold was vacuous'
        using errcode='CLR10';
    end if;
    if position(c_frag_a in v_cn) <> 0 then
      raise exception '#976 tail T.3: clara._fa_complete_particulars_core still carries the raw change-class fragment -- the fold was vacuous'
        using errcode='CLR10';
    end if;
    if position(c_frag_b in v_hn) <> 0 then
      raise exception '#976 tail T.3b: clara.complete_fixed_asset_particulars still carries the raw already-complete fragment -- the fold was vacuous'
        using errcode='CLR10';
    end if;
    if position(c_frag_b in v_cn) <> 0 then
      raise exception '#976 tail T.3b: clara._fa_complete_particulars_core still carries the raw already-complete fragment -- the fold was vacuous'
        using errcode='CLR10';
    end if;
  end;

  -- T.4 THE change-class FRAGMENT NOW SURVIVES IN EXACTLY ONE clara FUNCTION -- the pre-reservation
  -- guard. Never zero (the check vanished), never two-or-more (a THIRD copy crept in somewhere).
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(c_frag_a in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_n <> 1 then
    raise exception '#976 tail T.4: the change-class fragment now occurs in % clara function(s), expected exactly 1 (clara._fa_assert_completion_not_a_change)', v_n
      using errcode='CLR10';
  end if;
  select array_agg(p.proname) into v_names from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(c_frag_a in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_names is distinct from array['_fa_assert_completion_not_a_change'] then
    raise exception '#976 tail T.4b: the ONE function carrying the change-class fragment is %, expected _fa_assert_completion_not_a_change', v_names
      using errcode='CLR10';
  end if;

  -- T.5 …AND SO DOES THE already-complete FRAGMENT, INDEPENDENTLY.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(c_frag_b in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_n <> 1 then
    raise exception '#976 tail T.5: the already-complete fragment now occurs in % clara function(s), expected exactly 1 (clara._fa_assert_particulars_completable)', v_n
      using errcode='CLR10';
  end if;
  select array_agg(p.proname) into v_names from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and position(c_frag_b in lower(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> 0;
  if v_names is distinct from array['_fa_assert_particulars_completable'] then
    raise exception '#976 tail T.5b: the ONE function carrying the already-complete fragment is %, expected _fa_assert_particulars_completable', v_names
      using errcode='CLR10';
  end if;

  -- T.6 NON-REGRESSION, re-read: the validator, its predicate, the runtime OBO door and the
  -- revision door are byte-for-byte what the prestate measured -- this file recuts exactly two
  -- bodies (plus minting the new core).
  for v_pin in select * from (values
      ('clara._fa_validate_particulars(jsonb)',
       '971242090b8171fa7f5ca50acdba9f536b07b498018a12d9778cb24d2d40858b'),
      ('clara._fa_particulars_complete(clara.fixed_assets)',
       '4f96d11ef385a1b5ca26eedb088a4de8e7c6b0d457576053039468fcad6b32a9'),
      ('clara.complete_fixed_asset_particulars_for(uuid,uuid,jsonb,text,uuid)',
       '33c4b0b5a36a7d023a7f43a816a4ec7d5ffb01cf0a6ae1fec9c6937128c1d842'),
      ('clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)',
       'c814f6fd766565653e9649fa02b23b69f2b7c968f2988efff298a2a6ca48b437')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#976 tail T.6: % MOVED (measured %, expected %) -- this file recuts exactly two bodies plus the new core', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  -- T.7 THE TWO RECUT DOORS KEEP THEIR OWN SHAPE: SECURITY DEFINER, owner and search_path
  -- unmoved, and PUBLIC still has no EXECUTE on either -- `create or replace` preserves all of
  -- this, and this proves it did.
  for v_pin in select * from (values
      ('clara.complete_fixed_asset_particulars(uuid,uuid,jsonb,text)'),
      ('clara._fa_complete_particulars_core(uuid,uuid,uuid,uuid,jsonb,text,text)')) as t(sig) loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_pin.sig::regprocedure
       and p.proowner::regrole::text = 'clara_fn_owner' and p.prosecdef
       and 'search_path=clara, pg_temp' = any(p.proconfig);
    if v_n <> 1 then
      raise exception '#976 tail T.7: % lost its owner, its SECURITY DEFINER flag or its pinned search_path', v_pin.sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_pin.sig::regprocedure, 'EXECUTE') then
      raise exception '#976 tail T.7b: PUBLIC gained EXECUTE on %', v_pin.sig
        using errcode='CLR10';
    end if;
  end loop;

  -- T.8 THE HUMAN DOOR'S CALLER SET AND THE CORE'S CALLER SET ARE UNCHANGED (0216's own roster:
  -- nothing calls the human door from inside clara; only complete_fixed_asset_particulars_for
  -- calls the core) -- this file changed the two bodies' OWN text, never who calls them.
  select array_agg(p.proname order by p.proname) into v_names from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> 'complete_fixed_asset_particulars'
     and p.prosrc like '%clara.complete_fixed_asset_particulars(%';
  if v_names is distinct from '{}'::text[] and v_names is not null then
    raise exception '#976 tail T.8: clara.complete_fixed_asset_particulars gained an internal caller (%), expected none', v_names
      using errcode='CLR10';
  end if;
  select array_agg(p.proname order by p.proname) into v_names from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname <> '_fa_complete_particulars_core'
     and p.prosrc like '%clara._fa_complete_particulars_core(%';
  if v_names is distinct from array['complete_fixed_asset_particulars_for'] then
    raise exception '#976 tail T.8b: clara._fa_complete_particulars_core''s caller set is %, expected exactly {complete_fixed_asset_particulars_for}', v_names
      using errcode='CLR10';
  end if;

  raise notice '#976 tail OK: clara._fa_assert_completion_not_a_change (immutable) and clara._fa_assert_particulars_completable (stable) both exist, definer-owned by clara_fn_owner and ungranted; clara.complete_fixed_asset_particulars and clara._fa_complete_particulars_core call BOTH -- the guard BEFORE clara._reserve_op, 0227''s own anchor, and the wall core after the select-for-update -- and neither still carries either raw wall fragment, each of which now lives in exactly one function (change-class in the guard, already-complete in the core); both recut doors keep their owner/definer/search_path/no-PUBLIC-grant and their own caller sets; and clara._fa_validate_particulars, clara._fa_particulars_complete, clara.complete_fixed_asset_particulars_for and clara.revise_fixed_asset_particulars are byte-for-byte unmoved.';
end
$p976_tail$;
