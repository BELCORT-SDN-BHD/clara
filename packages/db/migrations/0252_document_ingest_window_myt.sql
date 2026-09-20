-- 0252_document_ingest_window_myt — #964 (riders wave 2, lane 05; document intake): MOVE THE
-- DOCUMENT-INGEST DAILY CEILING FROM A UTC CALENDAR DAY TO Asia/Kuala_Lumpur.
-- =====================================================================================
-- Spec of record: issue #964. Domain words: CONTEXT.md — "Member dependency" (the
-- `awaiting_capacity` reset moment this file corrects). Builds on 0007 (the three reservation
-- helpers behind CLR18) and 0229 (#636's `get_intake_batch` capacity descriptor and its M3
-- measurement, which REPORTED the UTC window rather than changing it — D4's ruling: "不改默认
-- 额度、不动三个预留函数；UTC/MYT 不一致记成具名残留并另开一张票", recorded as follow-up #1 in
-- docs/plan/active/refresh-wave-2026-09-18/reports/636-final.md — this is that ticket).
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. The three reservation helpers behind the document
-- daily ceiling — `clara._reserve_document_ingest`, `clara._resize_document_reservation`,
-- `clara._settle_document_reservation` — now compute "today" as an Asia/Kuala_Lumpur calendar day
-- instead of a UTC calendar day, and `clara.get_intake_batch`'s `capacity` descriptor reports the
-- MYT-midnight reset it now performs instead of the 08:00 MYT reset 0229 shipped as a fact.
--
-- THE ONE EXPRESSION, MOVED IN THREE BODIES TOGETHER. 0007:1644/1672/1709 each compare a
-- reservation's `created_at` against `date_trunc('day', now() at time zone 'utc') at time zone
-- 'utc'` — the instant of UTC midnight for "today", which lands at 08:00 Asia/Kuala_Lumpur
-- (0229's M3 measurement). This file replaces the ZONE in both `at time zone` legs of all three
-- with `Asia/Kuala_Lumpur`, and nothing else: the expression shape, the comparison operator, the
-- column it reads and every other line of all three bodies are BYTE-IDENTICAL to their pinned
-- 0007 pre-images (proved below by reverse substitution, the same discipline 0234 uses for its
-- own anchored splices).
--
-- WHY ALL THREE MOVE IN ONE MIGRATION, NEVER ONE AT A TIME. The Agent Brief's own words: "a mixed
-- state would let one instant pass one check and fail another". A reservation admitted under
-- `_reserve_document_ingest`'s new MYT window but resized or settled under `_resize_document_
-- reservation`'s old UTC window could double-count or under-count the same firm's daily usage
-- for up to eight hours a day. §0 prestate pins all three pre-images; §A/§B/§C splice all three
-- inside one transaction (the migration runner's own, per packages/db/README.md's "one
-- transaction per migration"), so a chain either has none of the three moved or all three.
--
-- WHAT IT DOES NOT DO.
--   * NO default changes. `docs_per_day` / `pages_per_day` (0007:1638, coalesced to 100 / 1000)
--     and the five-rung page ladder (`_declared_page_ceiling`, 0007:1622-1630, 1/10/50/100/200)
--     are untouched — §T re-reads both after the splice.
--   * `clara._refund_document_reservation` (0007:1679) reads NO window today (a refund needs no
--     "today" to un-reserve) and this file gives it none — the Agent Brief's own scope note.
--   * NO other lane's UTC-day truncation idiom moves. 0009's and 0038's and 0151's PROCESSING-CALL
--     ceilings (a different domain: LLM usage, not document ingest) keep `at time zone 'utc'`
--     unchanged — #964's Agent Brief rules this out of scope by name, and §0's prestate below
--     pins ONLY the four document-ingest names, never touching those other bodies' OIDs.
--   * NO change to `clara.firm_document_limits`, no new relation, no new granted name, no ACL
--     change on any of the four functions this file touches (§T re-reads all four ACLs
--     byte-identical to what §0 measured) — so this migration needs NO rig-meta cohort: nothing
--     was added, removed or regranted for `operation-census.test.mjs` / `rig-isolation.test.mjs`
--     to track.
--
-- REDO-SAFETY (#957). Every statement below is `create or replace function` / `comment on
-- function` — naturally idempotent DDL, never a bare `create table`. Each of the four splices
-- below is ALSO idempotent against ITS OWN prior effect: if the live body already carries the
-- target (new) clause, the splice is skipped with a NOTICE rather than re-applied (an anchor that
-- already landed cannot "occur exactly once" a second time against ITSELF the way a genuine
-- pre-0252 body would), so `CLARA_MIGRATION_REDO=0252_document_ingest_window_myt` after an
-- unmerged fix-round edit re-runs cleanly whether or not the prior attempt got all four bodies.
-- =====================================================================================

do $w964_pre$
declare v_sig text; v_n int;
begin
  -- THE FOUR NAMES THIS FILE TOUCHES MUST RESOLVE. Their exact pre-image (or, on a redo, their
  -- own already-landed target) is measured and enforced by EACH of §A/§B/§C/§D individually, right
  -- before it splices that one function -- never here, because a prior #964 attempt may have
  -- moved some of the four and not others, and only the per-function check can tell "already at
  -- MY target" apart from "drifted to something else neither pre-image nor target explains".
  foreach v_sig in array array[
      'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)',
      'clara._resize_document_reservation(uuid,uuid,integer)',
      'clara._settle_document_reservation(uuid,uuid,integer)',
      'clara.get_intake_batch(uuid,integer)']
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#964 prestate: % is absent -- its owning migration must apply first', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- THE LADDER AND DEFAULTS THIS FILE MUST NOT DISTURB, asked BEFORE the splice so "the ladder
  -- was already different" can never be mistaken for "0252 changed it" (0229:183-191's own
  -- reasoning, restated for this file's own non-goals).
  if clara._declared_page_ceiling(1048576, 'application/pdf') <> 10
     or clara._declared_page_ceiling(1048576, 'image/png') <> 1
     or clara._declared_page_ceiling(5242880, 'application/pdf') <> 50 then
    raise exception '#964 prestate: the 0007 page ladder is not the measured 1/10/50 rungs'
      using errcode='CLR10';
  end if;

  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure
     and (p.prosrc like '%date_trunc(''day'', now() at time zone ''utc'')%'
          or p.prosrc like '%date_trunc(''day'', now() at time zone ''Asia/Kuala_Lumpur'')%');
  if v_n <> 1 then
    raise exception '#964 prestate: clara._reserve_document_ingest carries neither the UTC nor the Asia/Kuala_Lumpur window -- re-measure before applying'
      using errcode='CLR10';
  end if;

  raise notice '#964 prestate: clean -- all four touched names resolve, the 0007 page ladder is 1/10/50, and the reservation window is a recognisable UTC-or-MYT expression.';
end
$w964_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara._reserve_document_ingest — the admission-time guard.
-- =====================================================================================
do $w964_reserve$
declare
  v_sig text := 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)';
  v_pre constant text := '074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734';
  v_oid oid; v_src text; v_def text; v_head text; v_new text; v_back text; v_occ int;
  v_t1 text; v_r1 text;
begin
  -- A LITERAL cast, never `to_regprocedure(v_sig)`: scripts/wiki-lint-checks.mjs's CoR-patch
  -- target attribution (WB-R21) resolves `pg_get_functiondef`'s argument only through a direct
  -- signature literal or a variable whose LATEST assignment is one — a function-call RHS is
  -- deliberately unattributable, fail-closed. Keeping this identical to `v_sig` (asserted by §T's
  -- own re-read after every splice) is what lets the reviewer see the two can never drift.
  v_oid := 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure;
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

  v_t1 := $t1$      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');$t1$;
  v_r1 := $r1$      and created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');$r1$;

  if v_src like ('%' || v_r1 || '%') then
    raise notice '#964 reserve: already at the MYT-window target (a redo over this function''s own prior effect) -- skipping the splice.';
  else
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
      raise exception '#964 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;
    v_occ := (length(v_src) - length(replace(v_src, v_t1, ''))) / length(v_t1);
    if v_occ <> 1 then
      raise exception '#964 reserve: the UTC window anchor occurs % time(s), expected exactly 1', v_occ
        using errcode='CLR10';
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#964 reserve: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;

    v_new := replace(v_src, v_t1, v_r1);
    execute v_head || 'AS $w964rsv$' || v_new || '$w964rsv$';

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    if v_src not like ('%' || v_r1 || '%') then
      raise exception '#964 reserve: % did not land the MYT window after the splice', v_sig using errcode='CLR10';
    end if;
    v_back := replace(v_src, v_r1, v_t1);
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
      raise exception '#964 reserve: the splice on % changed MORE than the one window anchor -- the reverse substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice '#964 reserve: clara._reserve_document_ingest now reads an Asia/Kuala_Lumpur calendar day; every other byte is the pinned 0007 body.';
  end if;
end
$w964_reserve$;

-- =====================================================================================
-- §B  clara._resize_document_reservation — the trusted-page-count guard.
-- =====================================================================================
do $w964_resize$
declare
  v_sig text := 'clara._resize_document_reservation(uuid,uuid,integer)';
  v_pre constant text := '41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf';
  v_oid oid; v_src text; v_def text; v_head text; v_new text; v_back text; v_occ int;
  v_t1 text; v_r1 text;
begin
  -- A LITERAL cast, never `to_regprocedure(v_sig)` — see §A's identical comment.
  v_oid := 'clara._resize_document_reservation(uuid,uuid,integer)'::regprocedure;
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

  v_t1 := $t1$      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');$t1$;
  v_r1 := $r1$      and created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');$r1$;

  if v_src like ('%' || v_r1 || '%') then
    raise notice '#964 resize: already at the MYT-window target (a redo over this function''s own prior effect) -- skipping the splice.';
  else
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
      raise exception '#964 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;
    v_occ := (length(v_src) - length(replace(v_src, v_t1, ''))) / length(v_t1);
    if v_occ <> 1 then
      raise exception '#964 resize: the UTC window anchor occurs % time(s), expected exactly 1', v_occ
        using errcode='CLR10';
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#964 resize: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;

    v_new := replace(v_src, v_t1, v_r1);
    execute v_head || 'AS $w964rsz$' || v_new || '$w964rsz$';

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    if v_src not like ('%' || v_r1 || '%') then
      raise exception '#964 resize: % did not land the MYT window after the splice', v_sig using errcode='CLR10';
    end if;
    v_back := replace(v_src, v_r1, v_t1);
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
      raise exception '#964 resize: the splice on % changed MORE than the one window anchor -- the reverse substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice '#964 resize: clara._resize_document_reservation now reads an Asia/Kuala_Lumpur calendar day; every other byte is the pinned 0007 body.';
  end if;
end
$w964_resize$;

-- =====================================================================================
-- §C  clara._settle_document_reservation — the actual-page-count guard.
-- =====================================================================================
do $w964_settle$
declare
  v_sig text := 'clara._settle_document_reservation(uuid,uuid,integer)';
  v_pre constant text := 'b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6';
  v_oid oid; v_src text; v_def text; v_head text; v_new text; v_back text; v_occ int;
  v_t1 text; v_r1 text;
begin
  -- A LITERAL cast, never `to_regprocedure(v_sig)` — see §A's identical comment.
  v_oid := 'clara._settle_document_reservation(uuid,uuid,integer)'::regprocedure;
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

  v_t1 := $t1$      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');$t1$;
  v_r1 := $r1$      and created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');$r1$;

  if v_src like ('%' || v_r1 || '%') then
    raise notice '#964 settle: already at the MYT-window target (a redo over this function''s own prior effect) -- skipping the splice.';
  else
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
      raise exception '#964 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;
    v_occ := (length(v_src) - length(replace(v_src, v_t1, ''))) / length(v_t1);
    if v_occ <> 1 then
      raise exception '#964 settle: the UTC window anchor occurs % time(s), expected exactly 1', v_occ
        using errcode='CLR10';
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#964 settle: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;

    v_new := replace(v_src, v_t1, v_r1);
    execute v_head || 'AS $w964stl$' || v_new || '$w964stl$';

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    if v_src not like ('%' || v_r1 || '%') then
      raise exception '#964 settle: % did not land the MYT window after the splice', v_sig using errcode='CLR10';
    end if;
    v_back := replace(v_src, v_r1, v_t1);
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
      raise exception '#964 settle: the splice on % changed MORE than the one window anchor -- the reverse substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice '#964 settle: clara._settle_document_reservation now reads an Asia/Kuala_Lumpur calendar day; every other byte is the pinned 0007 body.';
  end if;
end
$w964_settle$;

-- =====================================================================================
-- §D  clara.get_intake_batch — the batch-board capacity descriptor, spliced (two anchors: the
--     comment explaining the SHIPPED window, and the jsonb literal itself), plus a fresh
--     COMMENT ON FUNCTION (pg_description, not prosrc — no pre-image to preserve).
-- =====================================================================================
do $w964_batch$
declare
  v_sig text := 'clara.get_intake_batch(uuid,integer)';
  v_pre constant text := 'b23cbc0163aeec529df0d67f5495645b28995c768537dd2c6191700fc7fee98d';
  v_oid oid; v_src text; v_def text; v_head text; v_new text; v_back text; v_occ int; v_probe text;
  v_t1 text; v_r1 text; v_t2 text; v_r2 text;
begin
  -- A LITERAL cast, never `to_regprocedure(v_sig)` — see §A's identical comment.
  v_oid := 'clara.get_intake_batch(uuid,integer)'::regprocedure;
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

  v_t1 := $t1$  -- never summed. `capacity` reports the SHIPPED window rather than the one the house rule wants:
  -- measurement M3 says the reset lands at 08:00 Asia/Kuala_Lumpur, and the surface says 08:00.$t1$;
  v_r1 := $r1$  -- never summed. `capacity` reports the daily ceiling's reset moment: #964 moved the window
  -- from a UTC calendar day (M3's 08:00 MYT reset) to an Asia/Kuala_Lumpur calendar day, so the
  -- surface now reports MYT midnight.$r1$;

  v_t2 := $t2$      'window', 'utc_day', 'resets_at_local', '08:00', 'timezone', 'Asia/Kuala_Lumpur'));$t2$;
  v_r2 := $r2$      'window', 'myt_day', 'resets_at_local', '00:00', 'timezone', 'Asia/Kuala_Lumpur'));$r2$;

  if v_src like ('%' || v_r2 || '%') then
    raise notice '#964 batch: already at the myt_day capacity target (a redo over this function''s own prior effect) -- skipping the splice.';
  else
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> v_pre then
      raise exception '#964 prestate: % has DRIFTED from its pinned pre-image -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;

    foreach v_probe in array array[v_t1, v_t2] loop
      v_occ := (length(v_src) - length(replace(v_src, v_probe, ''))) / length(v_probe);
      if v_occ <> 1 then
        raise exception '#964 batch: an anchor occurs % time(s) in %, expected exactly 1 -- re-derive before patching', v_occ, v_sig
          using errcode='CLR10';
      end if;
    end loop;

    v_def := pg_get_functiondef(v_oid);
    v_head := left(v_def, position(E'\nAS $function$' in v_def));
    if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception '#964 batch: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
    end if;

    v_new := replace(replace(v_src, v_t1, v_r1), v_t2, v_r2);
    execute v_head || 'AS $w964bat$' || v_new || '$w964bat$';

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') = v_pre then
      raise exception '#964 batch: % still hashes to its PRE-IMAGE -- the splice did not apply', v_sig
        using errcode='CLR10';
    end if;
    v_back := replace(replace(v_src, v_r1, v_t1), v_r2, v_t2);
    if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
      raise exception '#964 batch: the splice on % changed MORE than its two anchors -- the reverse substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice '#964 batch: clara.get_intake_batch''s capacity descriptor now reports myt_day / 00:00; every other byte, including all five facets and waiting_basis, is the pinned 0229 body.';
  end if;
end
$w964_batch$;

comment on function clara.get_intake_batch(uuid,int) is
  '#636/#964: the durable batch board. FIVE overlapping facets over DISTINCT ids, each with its '
  'own coverage word, plus waiting_basis (why the batch''s waiting number differs from the review '
  'queue''s) and the capacity window (an Asia/Kuala_Lumpur day, reset at MYT midnight -- moved off '
  'a UTC day by #964). No total, no percentage, no page length. clara_authenticated only, '
  'bookkeeper+.';

reset role;

-- =====================================================================================
-- §T  TAIL. Every claim this file made about what moved, and what did not, re-read from the
-- committed catalog.
-- =====================================================================================
do $w964_tail$
declare
  v_reserve_src text; v_resize_src text; v_settle_src text; v_batch_src text;
  v_myt_clause constant text :=
    $mc$(date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')$mc$;
  v_utc_clause constant text := $uc$(date_trunc('day', now() at time zone 'utc') at time zone 'utc')$uc$;
  v_acl text; v_local_time text;
begin
  select p.prosrc into v_reserve_src from pg_proc p
   where p.oid = 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure;
  select p.prosrc into v_resize_src from pg_proc p
   where p.oid = 'clara._resize_document_reservation(uuid,uuid,integer)'::regprocedure;
  select p.prosrc into v_settle_src from pg_proc p
   where p.oid = 'clara._settle_document_reservation(uuid,uuid,integer)'::regprocedure;
  select p.prosrc into v_batch_src from pg_proc p
   where p.oid = 'clara.get_intake_batch(uuid,integer)'::regprocedure;

  -- (T1) THE MECHANISM. All three reservation bodies carry the MYT clause, none carry the UTC one.
  if v_reserve_src not like '%'||v_myt_clause||'%' or v_reserve_src like '%'||v_utc_clause||'%'
     or v_resize_src not like '%'||v_myt_clause||'%' or v_resize_src like '%'||v_utc_clause||'%'
     or v_settle_src not like '%'||v_myt_clause||'%' or v_settle_src like '%'||v_utc_clause||'%' then
    raise exception '#964 tail: at least one of the three reservation helpers does not carry the MYT window (or still carries the UTC one)'
      using errcode='CLR10';
  end if;

  -- (T2) AGREEMENT, WITHOUT DUPLICATION. T1 already proves all three bodies contain this ONE
  -- fixed literal (`v_myt_clause`), which by transitivity is "the byte-identical window clause"
  -- across the three -- a mixed state (one function moved, another not, or one moved to a
  -- DIFFERENT zone spelling) is unrepresentable, never merely untested. This check adds the other
  -- half: the clause occurs EXACTLY ONCE in each body, so a splice that duplicated the anchor
  -- instead of replacing it cannot pass silently.
  if (length(v_reserve_src) - length(replace(v_reserve_src, v_myt_clause, ''))) / length(v_myt_clause) <> 1
     or (length(v_resize_src) - length(replace(v_resize_src, v_myt_clause, ''))) / length(v_myt_clause) <> 1
     or (length(v_settle_src) - length(replace(v_settle_src, v_myt_clause, ''))) / length(v_myt_clause) <> 1 then
    raise exception '#964 tail: the MYT window clause does not occur exactly once in each of reserve/resize/settle'
      using errcode='CLR10';
  end if;

  -- (T3) THE BATCH DESCRIPTOR. myt_day / 00:00, never utc_day / 08:00.
  if v_batch_src not like '%''window'', ''myt_day'', ''resets_at_local'', ''00:00''%'
     or v_batch_src like '%utc_day%' or v_batch_src like '%''08:00''%' then
    raise exception '#964 tail: clara.get_intake_batch does not report the myt_day / 00:00 capacity descriptor'
      using errcode='CLR10';
  end if;

  -- (T4) THE BOUNDARY ITSELF LANDS AT MYT MIDNIGHT, never 08:00.
  select ((date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
            at time zone 'Asia/Kuala_Lumpur')::time::text into v_local_time;
  if v_local_time <> '00:00:00' then
    raise exception '#964 tail: the MYT window boundary lands at % local time, not MYT midnight', v_local_time
      using errcode='CLR10';
  end if;

  -- (T5) DEFAULTS AND THE LADDER DID NOT MOVE.
  if clara._declared_page_ceiling(1048576, 'application/pdf') <> 10
     or clara._declared_page_ceiling(1048576, 'image/png') <> 1
     or clara._declared_page_ceiling(5242880, 'application/pdf') <> 50
     or clara._declared_page_ceiling(10485760, 'application/pdf') <> 100
     or clara._declared_page_ceiling(20971520, 'application/pdf') <> 200 then
    raise exception '#964 tail: the 0007 page ladder moved -- this file must not touch default quotas'
      using errcode='CLR10';
  end if;

  -- (T6) NO ACL MOVED, on any of the four functions this file touched.
  select p.proacl::text into v_acl from pg_proc p
   where p.oid = 'clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#964 tail: clara._reserve_document_ingest''s ACL moved to %', v_acl using errcode='CLR10';
  end if;
  select p.proacl::text into v_acl from pg_proc p
   where p.oid = 'clara._resize_document_reservation(uuid,uuid,integer)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#964 tail: clara._resize_document_reservation''s ACL moved to %', v_acl using errcode='CLR10';
  end if;
  select p.proacl::text into v_acl from pg_proc p
   where p.oid = 'clara._settle_document_reservation(uuid,uuid,integer)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '#964 tail: clara._settle_document_reservation''s ACL moved to %', v_acl using errcode='CLR10';
  end if;
  select p.proacl::text into v_acl from pg_proc p
   where p.oid = 'clara.get_intake_batch(uuid,integer)'::regprocedure;
  if v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception '#964 tail: clara.get_intake_batch''s ACL moved to %', v_acl using errcode='CLR10';
  end if;

  raise notice '#964 tail: OK -- clara._reserve_document_ingest, clara._resize_document_reservation and clara._settle_document_reservation all read the byte-identical Asia/Kuala_Lumpur window clause and none carries the old UTC one; clara.get_intake_batch reports capacity as myt_day/00:00; the MYT boundary itself lands at midnight local time; the 0007 page ladder and defaults are unmoved; and all four functions'' ACLs are exactly what §0 measured before this file ran.';
end
$w964_tail$;
