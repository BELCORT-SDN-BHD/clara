-- 0251_fa_authority_retired_read — #979 (riders wave 2, lane 04): THE DEPRECIATION AUTHORITY
-- READ TELLS "NEVER HAD ONE" APART FROM "HAD ONE, AND IT WAS RETIRED", AND SURFACES THE
-- RETIREMENT'S OWN FACTS.
-- =====================================================================================
-- Spec of record: issue #979 — "Decide whether get_depreciation_authority should surface a
-- retired authority's reason, author and window", and the OWNER'S RULING of 2026-09-20 recorded
-- on it: "Surface a retired depreciation authority's reason, author and window in the read, and
-- render them in the UI... a bookkeeper deciding whether to propose a new authority needs to see
-- that a prior one existed and was deliberately withdrawn, rather than a state indistinguishable
-- from 'never had one'." Builds on 0041 (the register and `clara.fa_depreciation_authorities`,
-- whose body this file recuts) and 0227 (`authority_from`, the window floor this file reads).
--
-- =====================================================================================
-- THE DEFECT, IN ONE PARAGRAPH.
--
-- `clara.get_depreciation_authority` selects only an authority whose status is `live` or
-- `proposed` (0041:4225-4227), preferring `live`. A client whose only authority was RETIRED
-- therefore reads back exactly the null authority a client that never proposed one reads back —
-- the two states are indistinguishable to any caller. The returned object already carries a
-- `retired_by` field (0041:4239), but it is always empty in practice, because no retired row is
-- ever selected into it. The retirement reason (`retired_reason`) and its timestamp
-- (`retired_at`) live on the same row and are never read at all, and neither is the authority's
-- frozen window floor (`authority_from`, 0227) — three facts a bookkeeper today can find only by
-- going to the audit trail, for a decision (propose a new authority, or not) that is made on this
-- read's own surface.
--
-- =====================================================================================
-- THE FIX: ONE FALLBACK SELECT, AND THREE FIELDS ADDED ONLY ON A RETIRED ROW.
--
-- When the live-or-proposed select finds nothing, the read falls back to the client's MOST
-- RECENT retired authority (`order by retired_at desc, created_at desc` — `retired_at` is the
-- moment the retirement itself happened; `created_at` is only a deterministic tie-break for the
-- vanishingly unlikely case two retirements share an instant). A client that never had an
-- authority still finds nothing either way, so `authority` stays `null` (AC1, unchanged
-- behaviour). A client with a `live` or a `proposed` authority never reaches the fallback at all
-- (AC3, unchanged preference and unchanged selection).
--
-- The returned authority object gains `retired_reason`, `retired_at` and `authority_from` —
-- ONLY when the row this read returns is retired: a live or a proposed row's returned object
-- carries exactly the keys it carried before this file, byte for byte, because those three keys
-- are appended by a `||` on the `retired` arm alone, never built into the base object. This is
-- also why the addition is SAFE without a further null-check: `retired_reason`/`retired_by`/
-- `retired_at` are guaranteed non-null on a retired row by `ck_fa_authorities_retired`
-- (0041:636-639), and `authority_from` is guaranteed non-null on a live-or-retired row by
-- `ck_fa_authorities_window` (0227:352-355) — both re-asserted in the prestate below, not
-- assumed. `retired_by` itself is an EXISTING field (0041:4239) that this file does not add; it
-- simply gets populated now that a retired row can be the one selected.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT DO.
--
--   * It does not touch how an authority is retired, `clara.retire_depreciation_authority`, or
--     any retirement column — the owner's ruling and the ticket's own "out of scope" are the
--     same sentence. That door is pinned unmoved below (prestate and tail).
--   * It does not surface `authority_from` (or `authority_ref`) for a LIVE authority. That
--     column is ALSO non-null on a live row (`ck_fa_authorities_window`), and
--     `components/registers/fa-authority-ceremony.tsx` already carries dead code that expects it
--     one day — but wiring that is a different ticket's widening, not this one's. #979 surfaces
--     exactly the three retired-row facts its own Key Interfaces name.
--   * It does not add a depreciation-authority history timeline. The ticket names that out of
--     scope explicitly ("tracked separately once the lane's history surfaces get a reader").
--   * It does not change `clara.get_depreciation_authority`'s signature, floor (viewer+), grants,
--     or its `ramp_earned` / `fy_end` / `high_stakes_threshold_cents` fields.
-- =====================================================================================

do $p979_pre$
declare
  v_sha text; v_src text; v_pin record; v_redo boolean := false;
  -- The live pre-image of the ONE body this file recuts, MEASURED on the lane-04 rig
  -- (clara_l04) moments before this file was written, off pg_proc.prosrc — never transcribed
  -- from a migration file's own text. It is, verifiably, 0041's own text: this body has never
  -- been spliced (this lane's earlier tickets, #972/#973/#976/#977, each recut a DIFFERENT
  -- fixed-asset body and never this one).
  c_read_pre constant text :=
    '3d73739f9cf043fa2c9fc5d2db6e082bf68190e2270b096ae1515075a9a6486f';
  -- The marker that makes a RE-APPLY of this very file (the #957 redo mode) visible rather than
  -- merged into: the live body already carries this file's new merge expression.
  c_marker constant text := $m$'retired_reason', au.retired_reason$m$;
begin
  if to_regprocedure('clara.get_depreciation_authority(uuid)') is null then
    raise exception '#979 prestate: clara.get_depreciation_authority is absent -- 0041 must apply first'
      using errcode='CLR10';
  end if;

  -- (1) THE RETIREMENT COLUMNS THIS FILE READS ARE STILL THERE, and still guaranteed non-null
  -- on a retired row by the table's OWN constraint — the whole safety argument for reading them
  -- with no further null-check.
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='fa_depreciation_authorities'
                    and column_name in ('retired_reason','retired_at','retired_by')) then
    raise exception '#979 prestate: the retirement columns on clara.fa_depreciation_authorities are missing'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.fa_depreciation_authorities'::regclass
                    and c.conname = 'ck_fa_authorities_retired'
                    and position('RETIRED_REASON IS NOT NULL' in upper(pg_get_constraintdef(c.oid))) > 0) then
    raise exception '#979 prestate: ck_fa_authorities_retired is gone or no longer guarantees retired_by/retired_at/retired_reason on a retired row -- re-derive this file''s safety argument'
      using errcode='CLR10';
  end if;
  -- …and the window floor (authority_from, 0227) is guaranteed non-null on a LIVE OR a RETIRED
  -- row by ck_fa_authorities_window — the second half of the same argument, for authority_from.
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'clara.fa_depreciation_authorities'::regclass
                    and c.conname = 'ck_fa_authorities_window'
                    and position('AUTHORITY_FROM IS NOT NULL' in upper(pg_get_constraintdef(c.oid))) > 0) then
    raise exception '#979 prestate: ck_fa_authorities_window is gone (0227 must apply first) -- re-derive this file''s safety argument for authority_from'
      using errcode='CLR10';
  end if;

  -- (2) IS THIS A REDO OF THIS VERY FILE? (#957.) The recut below is `create or replace`, so it
  -- is safe over its own old effects — but a prestate pinned to the PRE-image would refuse the
  -- redo outright. Admitted LOUDLY, and only on the one signal that means it.
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_depreciation_authority(uuid)'::regprocedure;
  if position(c_marker in v_src) > 0 then
    v_redo := true;
    raise notice '#979 prestate: the live clara.get_depreciation_authority ALREADY carries this file''s merge expression -- treating this as a #957 REDO of 0251 itself. The recut is create-or-replace and the tail below re-proves the whole post-state from scratch.';
  end if;

  -- (3) PRE-IMAGE sha256(prosrc) PINS, EVERY ONE MEASURED ON THE LANE-04 RIG off pg_proc.prosrc.
  for v_pin in select * from (values
      -- RECUT by this file.
      ('clara.get_depreciation_authority(uuid)', c_read_pre, 'recut'),
      -- NON-REGRESSION: the sibling depreciation doors this file must not move. The retire door
      -- in particular is the one the owner's ruling and the ticket both name as untouched.
      ('clara.retire_depreciation_authority(uuid,uuid,text,text)',
       'ed671b28033db350e3b24869691d5f67d97dd6f6f430b492f7a3f25ae671d931', 'unmoved'),
      ('clara.sign_depreciation_authority(uuid,uuid,text,jsonb)',
       'd1294a8559eb8f5813b017bf71a1e747f92d94f4f1f0f375d6e3a4633a0bcf7f', 'unmoved'),
      ('clara.list_depreciation_runs(uuid)',
       'b03f79bc661653b7d4b5d333fd3b23a84091a14c4e38732a843969529b8d46ac', 'unmoved'),
      ('clara.get_depreciation_run(uuid)',
       '4508b8d0db684a4b530f837fc8fe1df6d9cc4f32943ec43047fe1db4e11d23ed', 'unmoved')
    ) as t(sig, sha, kind) loop
    if v_redo and v_pin.kind = 'recut' then continue; end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#979 prestate: % (%) has DRIFTED from its pinned pre-image (measured %, expected %) -- re-derive this file against the LIVE body before applying', v_pin.sig, v_pin.kind, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#979 prestate: clean -- clara.get_depreciation_authority matches its 0041 pre-image byte for byte (or this is an admitted #957 redo), the retirement columns and their two guaranteeing constraints (ck_fa_authorities_retired, ck_fa_authorities_window) are live, and every pinned sibling matches.';
end
$p979_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE RECUT. 0041's body, byte for byte, plus ONE fallback select and ONE conditional
--     merge onto the returned authority object. `create or replace` keeps the owner, the ACL,
--     the SECURITY DEFINER flag and the search_path, and is safe to run over its own old
--     effects (#957 redo).
-- =====================================================================================
create or replace function clara.get_depreciation_authority(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; au record; cl record; v_ramp boolean; v_threshold bigint;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select * into cl from clara.clients where id = p_client and firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select * into au from clara.fa_depreciation_authorities
    where client_id = p_client and status in ('live', 'proposed')
    order by case when status = 'live' then 0 else 1 end limit 1;
  -- #979: NO live-or-proposed authority to prefer -- fall back to the client's MOST RECENT
  -- retired one, so "never had an authority" (AC1) and "had one, and it was retired" (AC2) stay
  -- distinguishable. `retired_at` is the moment the retirement itself happened; `created_at` is
  -- only a deterministic tie-break. A client with a live or a proposed authority never reaches
  -- this branch (AC3).
  if not found then
    select * into au from clara.fa_depreciation_authorities
      where client_id = p_client and status = 'retired'
      order by retired_at desc, created_at desc limit 1;
  end if;
  v_ramp := au.id is not null and au.status = 'live'
    and exists (select 1 from clara.journal_entries j
                where j.client_id = p_client and j.origin = 'scheduled_run'
                  and j.status = 'approved' and j.reversed_by is null
                  and (j.flags -> 'depreciation_charges' ->> 'authority_id')::uuid = au.id);
  select f.high_stakes_amount_cents into v_threshold from clara.firms f where f.id = c.firm;
  return jsonb_build_object(
    'client_id', p_client,
    'authority', case when au.id is null then null else jsonb_build_object(
      'id', au.id, 'status', au.status, 'cadence', au.cadence,
      'proposed_by', au.proposed_by, 'signed_by', au.signed_by,
      'retired_by', au.retired_by, 'created_at', au.created_at)
      -- #979: the retirement's OWN facts, appended ONLY on the retired arm -- a live or a
      -- proposed authority's object keeps EXACTLY the keys above, byte for byte (AC3, AC5).
      -- Safe unguarded: retired_reason/retired_at are NOT NULL on a retired row
      -- (ck_fa_authorities_retired) and authority_from is NOT NULL on a live-or-retired row
      -- (ck_fa_authorities_window) -- both re-asserted in this file's prestate.
      || case when au.status = 'retired' then jsonb_build_object(
           'retired_reason', au.retired_reason, 'retired_at', au.retired_at,
           'authority_from', au.authority_from) else '{}'::jsonb end end,
    'ramp_earned', v_ramp,
    -- THE FALLBACK IS SURFACED, NEVER SILENT (design SS1.6): a Malaysian SME year end is very
    -- often not December, and an annual cadence computed against the wrong FY would post a
    -- whole year of depreciation into the wrong period with nothing visible to say so.
    'fy_end', jsonb_build_object('month', coalesce(cl.fy_end_month, 12),
      'day', coalesce(cl.fy_end_day, 31), 'fallback', cl.fy_end_month is null),
    'high_stakes_threshold_cents', v_threshold);
end $$;
revoke all on function clara.get_depreciation_authority(uuid) from public;
comment on function clara.get_depreciation_authority(uuid) is
  '0041 §1.4: the client''s current depreciation authority (viewer+), preferring live over '
  'proposed. #979 (0251): when NEITHER exists, falls back to the client''s most recently '
  'retired authority instead of a bare null, and adds retired_reason/retired_at/authority_from '
  'to the returned object -- ONLY on that retired arm -- so "never had an authority" and "had '
  'one, and it was retired" are told apart by a caller.';

reset role;

-- =====================================================================================
-- §T  THE TAIL. Every assertion re-read from the CATALOG after the recut.
-- =====================================================================================
do $p979_tail$
declare
  v_src text; v_n int; v_pin record; v_sha text;
  c_fallback constant text :=
    $f$  if not found then
    select * into au from clara.fa_depreciation_authorities
      where client_id = p_client and status = 'retired'
      order by retired_at desc, created_at desc limit 1;
  end if;$f$;
  c_merge constant text := $m$'retired_reason', au.retired_reason, 'retired_at', au.retired_at,
           'authority_from', au.authority_from) else '{}'::jsonb end end,$m$;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_depreciation_authority(uuid)'::regprocedure;

  -- T.1 the fallback select is IN, exactly once, and still gated on `if not found` (the
  -- live-or-proposed preference this file must not touch).
  v_n := (length(v_src) - length(replace(v_src, c_fallback, ''))) / length(c_fallback);
  if v_n <> 1 then
    raise exception '#979 tail T.1: the recut body carries the retired-fallback select % time(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;

  -- T.2 …and the conditional merge is IN, exactly once, gated on `au.status = 'retired'`.
  v_n := (length(v_src) - length(replace(v_src, c_merge, ''))) / length(c_merge);
  if v_n <> 1 then
    raise exception '#979 tail T.2: the recut body carries the retired-only field merge % time(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  if position($g$case when au.status = 'retired'$g$ in v_src) = 0 then
    raise exception '#979 tail T.2b: the field merge is not gated on au.status = ''retired'''
      using errcode='CLR10';
  end if;

  -- T.3 the ORIGINAL live-or-proposed select and its preference are UNTOUCHED (byte for byte),
  -- and the base authority object still carries every field it carried before this file.
  for v_pin in select * from (values
      ($$where client_id = p_client and status in ('live', 'proposed')
    order by case when status = 'live' then 0 else 1 end limit 1;$$, 1),
      ($$'id', au.id, 'status', au.status, 'cadence', au.cadence,
      'proposed_by', au.proposed_by, 'signed_by', au.signed_by,
      'retired_by', au.retired_by, 'created_at', au.created_at)$$, 1),
      ('case when au.id is null then null else jsonb_build_object(', 1)
    ) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#979 tail T.3: the recut body carries "%" % time(s), expected % -- the recut damaged 0041''s original selection or object', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;

  -- T.4 the OTHER three fields (ramp_earned, fy_end, high_stakes_threshold_cents) are untouched.
  for v_pin in select * from (values
      ('v_ramp := au.id is not null and au.status = ''live''', 1),
      ('high_stakes_threshold_cents'', v_threshold);', 1)
    ) as t(marker, want) loop
    v_n := (length(v_src) - length(replace(v_src, v_pin.marker, ''))) / length(v_pin.marker);
    if v_n <> v_pin.want then
      raise exception '#979 tail T.4: the recut body carries "%" % time(s), expected %', v_pin.marker, v_n, v_pin.want
        using errcode='CLR10';
    end if;
  end loop;

  -- T.5 the FUNCTION's own shape is unmoved: owner, SECURITY DEFINER, search_path, STABLE, and
  -- the same signature and floor (no PUBLIC grant, clara_authenticated still holding EXECUTE).
  -- `create or replace` preserves all of this; this proves it did.
  select count(*)::int into v_n from pg_proc p
   where p.oid='clara.get_depreciation_authority(uuid)'::regprocedure
     and p.proowner::regrole::text='clara_fn_owner' and p.prosecdef and p.provolatile = 's'
     and 'search_path=clara, pg_temp' = any(p.proconfig);
  if v_n <> 1 then
    raise exception '#979 tail T.5: clara.get_depreciation_authority lost its owner, its SECURITY DEFINER flag, its STABLE volatility or its pinned search_path'
      using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.get_depreciation_authority(uuid)'::regprocedure, 'EXECUTE') then
    raise exception '#979 tail T.5b: PUBLIC gained EXECUTE on clara.get_depreciation_authority'
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.get_depreciation_authority(uuid)'::regprocedure, 'EXECUTE') then
    raise exception '#979 tail T.5c: clara_authenticated LOST EXECUTE on clara.get_depreciation_authority'
      using errcode='CLR10';
  end if;

  -- T.6 NON-REGRESSION, re-read: the retire door (the one both the ticket and the owner's ruling
  -- name as untouched) and the other depreciation siblings are byte-for-byte what the prestate
  -- measured.
  for v_pin in select * from (values
      ('clara.retire_depreciation_authority(uuid,uuid,text,text)',
       'ed671b28033db350e3b24869691d5f67d97dd6f6f430b492f7a3f25ae671d931'),
      ('clara.sign_depreciation_authority(uuid,uuid,text,jsonb)',
       'd1294a8559eb8f5813b017bf71a1e747f92d94f4f1f0f375d6e3a4633a0bcf7f'),
      ('clara.list_depreciation_runs(uuid)',
       'b03f79bc661653b7d4b5d333fd3b23a84091a14c4e38732a843969529b8d46ac'),
      ('clara.get_depreciation_run(uuid)',
       '4508b8d0db684a4b530f837fc8fe1df6d9cc4f32943ec43047fe1db4e11d23ed')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pin.sig::regprocedure;
    if v_sha is distinct from v_pin.sha then
      raise exception '#979 tail T.6: % MOVED (measured %, expected %) -- this file recuts exactly one body', v_pin.sig, v_sha, v_pin.sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#979 tail OK: clara.get_depreciation_authority falls back to the client''s most recent retired authority exactly when no live-or-proposed one exists, gates its retired_reason/retired_at/authority_from merge on au.status = ''retired'' alone, leaves 0041''s original selection, preference and base object byte-for-byte intact, keeps its owner/definer/volatility/search_path and grants, and clara.retire_depreciation_authority, clara.sign_depreciation_authority, clara.list_depreciation_runs and clara.get_depreciation_run are byte-for-byte unmoved.';
end
$p979_tail$;
