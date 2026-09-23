-- =====================================================================================
-- #998 (riders wave 2, lane 07) — retire the unconsumed firm-timeline wrapper.
--
-- OWNER'S RULING (2026-09-19, restated in #998's Agent Brief): `apps/web/lib/firm/timeline.ts`
-- and `clara.list_firm_timeline` retire; #843 moves onto `clara.list_activity`. #659 (the wave
-- 2026-09-18 Firm Home swap) already moved "Recent activity" onto `clara.list_activity`, and
-- deleted the old timeline section — `list_firm_timeline` has had ZERO production callers since
-- (verified on this branch: no import of `apps/web/lib/firm/timeline` outside its own unit
-- test, and no `list_firm_timeline` call site in `apps/web` or `packages/runtime` outside that
-- module and the test/rig estate this file also retires below).
--
-- SCOPE, LOAD-BEARING: `clara.firm_timeline_visible` (0174, CB-AE2E-018) is NOT retired —
-- `clara.list_activity` reads it as one of its unioned sources
-- (`apps/web/lib/firm/activity.ts:18,31-32`). Only the standalone keyset FUNCTION and its
-- TypeScript wrapper go. `clara.list_activity` itself is untouched by this file.
--
-- QUIESCE INVENTORY — the one live body this file DROPs, pinned by prosrc sha256 MEASURED ON
-- clara_l07 (THIS RIG) NOW, off `pg_proc.prosrc` (never migration/file text — Annex A's standing
-- caveat, restated by 0118's own header). No ticket earlier in this lane touches this function,
-- so this is the base wave-2 integration head's own body (born at 0174), unmoved:
--
--   DROP  clara.list_firm_timeline(bigint,integer)
--         68ecc60993eebd42af8ec45ed87b337d80179139d9dff5ae35f96680f9378b6b
--
-- DEPENDENCY CENSUS (measured on THIS rig, not assumed — mirrors 0118's own census idiom).
-- `pg_depend` carries exactly the two dependency rows every function has (on its schema, on its
-- PL language) and NOTHING references it in the other direction: zero views/rules resolve it
-- through `pg_rewrite`, zero `pg_trigger` rows name it as `tgfoid`, zero OTHER `clara.*`
-- function body mentions it (measured by an ILIKE scan of `pg_proc.prosrc`), and zero
-- `clara.wake_fn_allowlist` rows name it — it was never wake-wrapped (0174's own header: "NO
-- WAKE OR AGENT SIBLING FOR ANY OF THEM"). Its two EXECUTE grants (`clara_fn_owner`,
-- `clara_authenticated`) are removed WITH the object by `drop function`, matching the estate's
-- own drop idiom (0005:954-955, 0009:1198-1202, 0011:1130-1131, 0046:615, 0118 S1) — no explicit
-- revoke is written.
--
-- TEST ESTATE RETIRING WITH IT (the Agent Brief's own list; all landing in this same PR):
--   apps/web/lib/firm/timeline.ts + lib/firm/timeline.test.ts  — deleted outright.
--   apps/web/test/manifest.txt                                — the deleted test's entry removed.
--   packages/db/tests/web-reads-and-doors.test.mjs             — `d3` (the existence witness
--     inside `cohortApplied()`) and cells wr.10/wr.11 (the function's OWN behaviour) removed.
--     The other eight cohort members and wr.9/wr.12 (`firm_timeline_visible`, the f_a4 shim) are
--     untouched and stay live — `cohortApplied()`'s "wholly present or wholly absent" throw
--     would otherwise fire forever once this file applies (8 of 9 present is PARTIAL).
--   packages/db/tests/rig-meta.mjs                             — `"list_firm_timeline"` removed
--     from `WEB_READS_DOORS_HUMAN_FNS`, which also true's up `WEB_READS_DOORS_COHORT` and
--     `ALLOWED.clara_authenticated` (both spread from that same array) — `cohortFailures()`
--     (rig-meta's own T17 grant-matrix sweep) has the identical "wholly present or wholly
--     absent" rule and would otherwise report this cohort PARTIAL forever, failing
--     `operation-census.test.mjs` on every chain past this migration.
--   packages/db/tests/f-a7-pi.test.mjs                         — `webReadsLanded()`'s witness
--     re-pointed from this function onto `clara.archive_chat_session(uuid,text)` (born in the
--     SAME migration 0174/CB-AE2E-018, unaffected by this drop). It was never a witness FOR
--     `list_firm_timeline`'s own behaviour — only a stand-in for "has 0174 landed", used to
--     decide whether pi-A1 expects the f_a4 receipt shim WIRED to `clara.agent_act_receipts`.
--     Left unpointed, this drop would silently turn that witness into a permanent false
--     negative and red pi-A1 (the shim stays really wired; the test would start expecting it
--     unwired).
--
-- WHY NO NEW rig-meta COHORT AND NO NEW preintegration-gate MODULE, named per 0260's own
-- precedent (`packages/db/migrations/0260_depreciation_authority_pending_rowkind.sql`) rather
-- than left for a reviewer to wonder about: a rig-meta cohort audits GRANT correctness on a
-- NEWLY introduced callable object, and a preintegration-gate module exists to quiet-skip a NEW
-- test cell that asserts a positive the migration has not landed yet on an older chain. This
-- file introduces neither kind of thing — it only retires an existing grant and deletes the
-- cells that tested it, which need no frontier tolerance because they no longer exist to fail
-- on any chain, old or new. Direct precedent for a pure retirement needing neither: 0118 (F-A2
-- cutover, seventeen drops) and 0129 (F-A3 PR-3 retirement) both ship with no rig-meta cohort
-- addition and no preintegration-gate module.
--
-- D1 WRITE-QUIESCE: not owed. This drops a STABLE SECURITY INVOKER reader (0174 tail's own
-- wr.10 assertion) with no write path of its own and zero verified production callers; unlike
-- 0118's seventeen writers (heartbeat-guarded because a live runtime caller mid-flight would
-- lose a WRITE), a dropped read with no caller loses nothing anyone was relying on.
-- =====================================================================================
set local statement_timeout = '5min';
set local search_path = clara, pg_temp;

create temp table _r998_pre(k text primary key, v text) on commit drop;

do $r998_pre$
declare
  v_sig text := 'clara.list_firm_timeline(bigint,integer)';
  v_src text; v_sha text; v_n int;
begin
  if to_regprocedure(v_sig) is null then
    raise exception '#998 prestate: % is already ABSENT — already dropped, or this file is being re-applied out of order', v_sig
      using errcode = 'CLR10';
  end if;

  -- THE HARD PRE-IMAGE PIN (measured-not-transcribed law): the prosrc this file was derived
  -- against, off pg_proc.prosrc, never pg_get_functiondef's wrapper text.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha is distinct from '68ecc60993eebd42af8ec45ed87b337d80179139d9dff5ae35f96680f9378b6b' then
    raise exception '#998 prestate: % has DRIFTED from its pinned pre-image (measured %, expected 68ecc60993eebd42af8ec45ed87b337d80179139d9dff5ae35f96680f9378b6b) — re-derive this drop against the LIVE body before applying', v_sig, v_sha
      using errcode = 'CLR10';
  end if;
  insert into _r998_pre(k,v) values ('sha', v_sha);

  -- Zero application dependents (measured on THIS rig, not assumed).
  select count(*)::int into v_n from pg_trigger where tgfoid = v_sig::regprocedure;
  if v_n <> 0 then
    raise exception '#998 prestate: % is still a trigger function (% row(s)) — cannot be a zero-dependent drop', v_sig, v_n
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n
    from pg_depend dep join pg_rewrite rw on rw.oid = dep.objid
   where dep.refclassid = 'pg_proc'::regclass and dep.refobjid = v_sig::regprocedure;
  if v_n <> 0 then
    raise exception '#998 prestate: % views/rules reference % — not a zero-dependent drop', v_n, v_sig
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.oid <> v_sig::regprocedure
     and p.prosrc ilike '%list_firm_timeline%';
  if v_n <> 0 then
    raise exception '#998 prestate: % other clara.* function body mention(s) of list_firm_timeline — not a zero-dependent drop', v_n
      using errcode = 'CLR10';
  end if;

  if to_regclass('clara.wake_fn_allowlist') is not null then
    select count(*)::int into v_n from clara.wake_fn_allowlist where fn_name = 'list_firm_timeline';
    if v_n <> 0 then
      raise exception '#998 prestate: list_firm_timeline holds a wake_fn_allowlist row — it should hold none, it was never wake-wrapped'
        using errcode = 'CLR10';
    end if;
  end if;

  -- The view it pages stays untouched by this file — sanity-checked here so the tail's "still
  -- present, still granted" assertion is proving something this prestate also saw BEFORE.
  if to_regclass('clara.firm_timeline_visible') is null then
    raise exception '#998 prestate: clara.firm_timeline_visible is absent — 0174 must apply first'
      using errcode = 'CLR10';
  end if;

  raise notice '#998 prestate: OK -- list_firm_timeline pinned at %, zero triggers, zero view/rule dependents, zero other function-body mentions, zero wake_fn_allowlist rows, firm_timeline_visible present', v_sha;
end
$r998_pre$;

-- =====================================================================================
-- THE DROP. One statement: the function and both its EXECUTE grants leave together.
-- =====================================================================================
drop function clara.list_firm_timeline(bigint,integer);

-- =====================================================================================
-- TAIL — a read that can say NO, not an assertion of intent.
-- =====================================================================================
do $r998_tail$
declare v_n int;
begin
  -- (1) The function is GONE.
  if to_regprocedure('clara.list_firm_timeline(bigint,integer)') is not null then
    raise exception '#998 tail: clara.list_firm_timeline still exists after its DROP' using errcode = 'CLR10';
  end if;

  -- (2) Its EXECUTE grants left WITH it (belt-and-braces over the DROP's own catalog cleanup).
  select count(*)::int into v_n from information_schema.routine_privileges
   where routine_schema = 'clara' and routine_name = 'list_firm_timeline';
  if v_n <> 0 then
    raise exception '#998 tail: % routine_privileges row(s) still name list_firm_timeline', v_n using errcode = 'CLR10';
  end if;

  -- (3) firm_timeline_visible is UNTOUCHED: still present, still security_barrier, still
  -- granted to clara_authenticated -- the same properties 0174's own tail asserted (裁-15).
  if to_regclass('clara.firm_timeline_visible') is null then
    raise exception '#998 tail: clara.firm_timeline_visible was lost — it must survive this file' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'firm_timeline_visible'
     and c.reloptions @> array['security_barrier=true'];
  if v_n <> 1 then
    raise exception '#998 tail: firm_timeline_visible no longer carries security_barrier=true (裁-15)' using errcode = 'CLR10';
  end if;
  if not has_table_privilege('clara_authenticated','clara.firm_timeline_visible','select') then
    raise exception '#998 tail: firm_timeline_visible is no longer readable by clara_authenticated' using errcode = 'CLR10';
  end if;

  -- (4) clara.list_activity (the surface #843/Firm Home actually read even before this file,
  -- and the reader this ticket names as unaffected) still resolves at its live 7-arg signature.
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)') is null then
    raise exception '#998 tail: clara.list_activity is unexpectedly absent -- out of this file''s scope, but its disappearance would be a defect this tail should not let through' using errcode = 'CLR10';
  end if;

  raise notice '#998 tail: OK -- clara.list_firm_timeline is ABSENT with zero routine_privileges rows; clara.firm_timeline_visible survives untouched (present, row-security forced, clara_authenticated-selectable); clara.list_activity still resolves.';
end
$r998_tail$;
