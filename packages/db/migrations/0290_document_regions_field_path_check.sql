-- 0290_document_regions_field_path_check — #857 AC2: A TABLE CHECK PROVES THE field_path
-- GRAMMAR AT EVERY WRITER, INCLUDING A RAW FIXTURE INSERT.
-- =====================================================================================
-- Spec of record: issue #857's Agent Brief (the newest comment) plus the "Released: riders
-- wave 1" follow-up, which shipped AC1 (the repository lint,
-- scripts/check-document-region-field-paths.mjs, PR #1025 / ddb5a125) and explicitly left AC2 —
-- the CHECK-constraint arm — for a lane that may cut a migration. Re-verified live 2026-09-20
-- (`gh issue view 857 --comments`): AC2 is still named as the sole open half, "rides riders
-- wave 3."
--
-- WHAT AC1 CLOSED AND WHY IT IS NOT ENOUGH. The lint scans packages/{db,runtime}/tests for a
-- literal field_path string and refuses a malformed one at COMMIT time — but it is a repository
-- SCAN, not a database WALL: it can only see a literal or a simply-templated string, never a
-- value assembled at runtime, and it runs only when someone remembers to run lint.
-- clara._assert_field_path (0191) is the runtime grammar, but it is called from exactly ONE
-- place — clara.persist_document_extraction's region loop — so a RAW insert straight into
-- clara.document_regions (which is exactly what most of the 71 raw inserts the ticket's own
-- triage counted already do) never reaches it at all.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. clara.document_regions gains a CHECK constraint that
-- calls clara._field_path_conforms(field_path) — a new, IMMUTABLE, UNGRANTED boolean SIBLING of
-- clara._assert_field_path that does nothing but `perform` it and return true — so EVERY insert
-- into the table, through any door, now runs the SAME grammar 0191 already pinned, refused with
-- the SAME errcode (CLR10) and the SAME detail.reason the grammar has always raised, rather than
-- Postgres's own generic 23514 check_violation a plain regex CHECK would have produced.
--
-- WHY A SIBLING FUNCTION RATHER THAN AN INLINE REGEX CHECK (the Agent Brief's own instruction).
-- clara._assert_field_path already RAISES with a typed (errcode, detail.reason) triple per
-- failure mode (field_path_length / field_path_syntax / field_path_namespace). Copying its regex
-- and namespace roster into a second, inline CHECK would duplicate a grammar that must never
-- drift from the one 0191 enforces at the persist boundary, AND would surface only Postgres's
-- generic 23514 on a violation, losing the typed detail. Calling the EXISTING function from
-- inside the CHECK is not a trick: a CHECK's boolean expression may call any function, and when
-- that function RAISES instead of returning false, the raised exception — errcode and all —
-- propagates out of the INSERT exactly as it would from a direct call, never rewrapped into
-- check_violation. The sibling exists only because a CHECK's expression must itself evaluate to
-- a boolean, and _assert_field_path returns void by design.
--
-- WHY UNGRANTED. clara.document_regions carries exactly ONE role with INSERT: clara_fn_owner
-- (measured below, live-queried rather than assumed) — every application writer reaches the
-- table through a SECURITY DEFINER function it owns, and Postgres always lets an object's OWNER
-- execute it regardless of ACL. So clara._field_path_conforms needs no GRANT at all: the only
-- role that can ever trigger its evaluation (clara_fn_owner, as itself or as the effective user
-- inside a DEFINER writer, or a superuser bypassing ACL entirely on a raw rig fixture insert)
-- already may execute it. This is the SAME disposition #984's 0239 (`_admit_opening_work`) and
-- #960's 0270 (`_firm_document_limit_ceiling`) already carry, so no packages/db/tests/rig-meta.mjs
-- cohort is owed (see the comment this file's PR adds there, "#857 [0290] — NO cohort is owed").
--
-- THE TWO PLURAL LITERALS ARE UNTOUCHED, BY CONSTRUCTION. `opening_tb.line` and `prior_gl.line`
-- (0201's own two partial-unique-index exclusions) are ordinary, REGISTERED-namespace paths as
-- far as the grammar is concerned — clara._assert_field_path has never treated them specially,
-- and neither does this file. A CHECK constraint is evaluated once PER ROW; it carries no
-- uniqueness concept at all, so a forty-row trial balance at ONE (extraction_id, field_path) is
-- forty rows each independently passing the SAME per-row grammar test a single-row invoice fact
-- passes — the CHECK cannot see, and does not care, how many other rows share its path. Proved
-- live in packages/db/tests/document-regions-field-path-check.test.mjs.
--
-- REDO-SAFE BY CONSTRUCTION (#957): S1 is `create or replace function` (safe whether this is a
-- first apply or a re-run of an edited file); S2 unconditionally `drop constraint if exists`
-- before `add constraint`, so a redo always installs whatever CHECK clause the CURRENT file text
-- says, never a stale one a guard-by-name would have skipped re-adding. The prestate below
-- therefore accepts TWO starting states — wholly absent (first apply) or wholly present (redo) —
-- and refuses only a HALF state, which is a defect rather than either lawful starting point.
--
-- MEASURED ON THIS RIG NOW (wave-3 lane08; #857 is this lane's first ticket, nothing applied
-- ahead of it). clara.document_regions started EMPTY on this freshly migrated+seeded database —
-- seeding does not populate it — so a preparatory script
-- (docs/plan/active/riders-2026-09-20/reports/wave3-lane08-ticket857.md names it) called
-- clara.persist_document_extraction three times, THROUGH THE REAL WRITER DOOR, never a raw
-- fixture insert, leaving 14 rows across 10 distinct field_path values — including five
-- opening_tb.line rows from one trial balance — so the ADD CONSTRAINT below validates against
-- REAL, estate-shaped populated rows rather than an empty table, which would prove nothing. The
-- PRESTATE re-derives the same census as a second, read-only proof, independent of the ALTER's
-- own implicit row scan, and is ALSO the query a release preflight can run on hosted (see the
-- ticket report for a standalone copy).
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE — every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $drfp_pre$
declare
  v_src text;
  v_bad text[];
  v_regions int;
  v_insert_roles text[];
  v_fn_present boolean;
  v_ck_present boolean;
begin
  -- (a) IDEMPOTENCY / REDO. Two acceptable starting states: WHOLLY ABSENT (first apply) or
  -- WHOLLY PRESENT (a #957 redo of this file after a fix-round edit — S1's `create or replace`
  -- and S2's unconditional drop-then-add are both safe to re-run). A HALF state — the function
  -- without the constraint, or the reverse — is a half-applied migration, a defect this file
  -- refuses to build on rather than silently complete.
  v_fn_present := to_regprocedure('clara._field_path_conforms(text)') is not null;
  v_ck_present := exists (select 1 from pg_constraint
     where conrelid = 'clara.document_regions'::regclass
       and conname = 'ck_document_regions_field_path_grammar');
  if v_fn_present <> v_ck_present then
    raise exception 'drfp prestate: HALF-APPLIED -- clara._field_path_conforms present=%, ck_document_regions_field_path_grammar present=% -- this file must be wholly absent (first apply) or wholly present (redo), never half of either',
      v_fn_present, v_ck_present using errcode = 'CLR10';
  end if;

  -- (b) THE NEIGHBOUR BODY THIS FILE RELIES ON but does not recut: clara._assert_field_path
  -- (0191), pinned so a drifted grammar is refused here rather than silently wrapped by a
  -- sibling that no longer means what this file's header says it means. Pinned LIVE on this lane
  -- database (wave-3 rule: "pin what is live", never a sha copied from 0191's own header) —
  -- #857 is this lane's first ticket, so no earlier ticket on this branch could have recut it.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_field_path(text)'::regprocedure;
  if v_src is null then
    raise exception 'drfp prestate: clara._assert_field_path is absent -- this file must not be applied below the 0191 frontier'
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <>
      '0641f62145e74c353adcb0be248d98fcd804051919b9462989308d2f291b1ace' then
    raise exception 'drfp prestate: clara._assert_field_path body is at sha % -- this file expects the live 0191 body, MEASURED on this lane database, and will not wrap a grammar nobody re-verified',
      encode(sha256(convert_to(v_src, 'UTF8')), 'hex') using errcode = 'CLR10';
  end if;
  if (select p.proowner from pg_proc p where p.oid = 'clara._assert_field_path(text)'::regprocedure)
     <> 'clara_fn_owner'::regrole then
    raise exception 'drfp prestate: clara._assert_field_path has an unexpected owner' using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p where p.oid = 'clara._assert_field_path(text)'::regprocedure) <> 'i' then
    raise exception 'drfp prestate: clara._assert_field_path is no longer IMMUTABLE' using errcode = 'CLR10';
  end if;

  -- (c) ONLY clara_fn_owner MAY INSERT into clara.document_regions today -- the whole reason the
  -- sibling below needs no GRANT of its own. A second role gaining INSERT would mean this file's
  -- ungranted design silently denies that role a legitimate write with a bare permission error
  -- instead of the grammar's own typed refusal, which is a materially different failure this
  -- file must not paper over.
  select coalesce(array_agg(distinct grantee::regrole::text order by grantee::regrole::text), array[]::text[])
    into v_insert_roles
    from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'document_regions' and privilege_type = 'INSERT';
  if v_insert_roles <> array['clara_fn_owner'] then
    raise exception 'drfp prestate: clara.document_regions carries INSERT grant(s) %, not exactly {clara_fn_owner} -- re-derive whether the ungranted sibling design still holds', v_insert_roles
      using errcode = 'CLR10';
  end if;

  -- (d) THE CUTOVER SAFETY CHECK, and it is the load-bearing one -- the SAME predicate
  -- clara._assert_field_path enforces, inlined here (never through the function itself, which
  -- would abort the whole census at the FIRST bad row rather than naming every one). A
  -- field_path stored today that this CHECK would refuse means the estate carries a row 0191's
  -- own cutover already should have caught -- refuse LOUDLY here rather than let the ALTER below
  -- fail with a bare "check constraint violated" naming no row. THIS is the query a release
  -- preflight runs on hosted before applying this file (copy the SELECT below, read-only, no
  -- side effects):
  --
  --   select r.field_path, count(*) as n
  --     from clara.document_regions r
  --    where r.field_path is not null
  --      and (length(r.field_path) = 0 or length(r.field_path) > 128
  --           or r.field_path !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$'
  --           or split_part(r.field_path, '.', 1) not in
  --              ('invoice','statement','myinvois','opening_tb','prior_gl',
  --               'pages','tables','rows','sheets','paragraphs'))
  --    group by 1 order by 1;
  --
  -- Zero rows back means the CHECK will validate cleanly; any row named is a producer this
  -- migration's cutover will refuse, and must be censused and repaired (or the roster widened in
  -- a NEW migration) before applying.
  select count(*) into v_regions from clara.document_regions;
  select coalesce(array_agg(distinct fp order by fp), array[]::text[]) into v_bad
    from (select r.field_path as fp from clara.document_regions r where r.field_path is not null) s
   where length(fp) = 0 or length(fp) > 128
      or fp !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$'
      or split_part(fp, '.', 1) not in ('invoice','statement','myinvois','opening_tb','prior_gl',
                                        'pages','tables','rows','sheets','paragraphs');
  if coalesce(array_length(v_bad, 1), 0) > 0 then
    raise exception 'drfp prestate: % stored field_path value(s) would be refused by the new CHECK (first ten: %) -- across % total region row(s). Census them with this file''s own preflight query and either repair the producer or widen clara._assert_field_path''s roster in a NEW migration; this file will not narrow the estate silently.',
      coalesce(array_length(v_bad, 1), 0), v_bad[1:10], v_regions using errcode = 'CLR10';
  end if;
  if v_regions = 0 and not v_fn_present then
    raise exception 'drfp prestate: clara.document_regions holds ZERO rows -- the ADD CONSTRAINT below would validate against an empty table, which proves nothing about populated rows. Seed real regions through clara.persist_document_extraction first (this ticket''s report names the script), never a raw fixture insert.'
      using errcode = 'CLR10';
  end if;

  raise notice 'drfp prestate: clean (redo=%) -- clara._assert_field_path is at its live 0191 body (immutable, clara_fn_owner-owned), clara_fn_owner is the ONLY role with INSERT on clara.document_regions, and all % stored field_path value(s) already conform.', v_fn_present, v_regions;
end $drfp_pre$;

-- =====================================================================================
-- S1 — clara._field_path_conforms : THE BOOLEAN SIBLING. `create or replace` for redo safety
-- (#957): a fix-round edit re-runs cleanly, never "function already exists".
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._field_path_conforms(p_path text) returns boolean
  language plpgsql immutable set search_path = clara, pg_temp as $fn$
begin
  perform clara._assert_field_path(p_path);
  return true;
end $fn$;
revoke all on function clara._field_path_conforms(text) from public;
alter function clara._field_path_conforms(text) owner to clara_fn_owner;
comment on function clara._field_path_conforms(text) is
  'Boolean sibling of clara._assert_field_path (#624/C33.4), minted for #857''s table CHECK on clara.document_regions.field_path (ck_document_regions_field_path_grammar). Calling _assert_field_path lets an invalid path raise with the grammar''s OWN errcode/detail (CLR10) instead of a CHECK constraint''s generic 23514 check_violation. Deliberately UNGRANTED to every application role: clara_fn_owner is the ONLY role with INSERT on clara.document_regions (measured in this migration''s prestate), and an object''s owner may always execute a function it owns regardless of ACL, so no GRANT is needed for the constraint to fire on every real writer.';

-- =====================================================================================
-- S2 — THE CHECK. Evaluated per row, so it neither knows nor cares how many OTHER rows share
-- one field_path -- the plural-literal exclusion belongs to 0201's own PARTIAL unique index, not
-- to a per-row grammar test, and this file touches neither that index nor its predicate.
-- Unconditional drop-then-add (never a guard-by-name): redo-safe for an EDITED clause too, since
-- a guard that only checks the constraint's NAME would skip re-adding a body the edit changed.
-- =====================================================================================
alter table clara.document_regions drop constraint if exists ck_document_regions_field_path_grammar;
alter table clara.document_regions
  add constraint ck_document_regions_field_path_grammar
  check (clara._field_path_conforms(field_path));

reset role;

-- =====================================================================================
-- §Z — TAIL. Proves the sibling and the CHECK are live with the exact shape this file promises,
-- that clara._assert_field_path (the neighbour body) is untouched, that every OTHER constraint,
-- trigger and index on clara.document_regions survives by name, and — LIVE, in rolled-back
-- probes rather than argued from the constraint's text alone — that an unregistered-namespace
-- raw insert is refused with the grammar's own CLR10 (never a bare 23514), while a NULL path and
-- a well-formed path both still insert. No probe leaves a row behind: clara.document_regions is
-- APPEND-ONLY (t_document_regions_append_only refuses UPDATE/DELETE unconditionally), so every
-- probe here is a nested BEGIN/EXCEPTION block whose own implicit savepoint discards it --
-- either because the insert itself failed (the refusal probe) or because the block deliberately
-- raises its own private sentinel AFTER a successful insert to force the discard (the two
-- success probes), which the same block catches by SQLSTATE and nothing else.
-- =====================================================================================
do $drfp_tail$
declare
  v_ok boolean;
  v_def text;
  v_name text;
  v_regions_before int;
  v_regions_after int;
  v_firm uuid;
  v_extraction uuid;
  v_refused boolean;
  v_prosrc_sha text;
begin
  -- THE FUNCTION, structurally: IMMUTABLE, INVOKER (not DEFINER), clara_fn_owner-owned,
  -- search_path pinned, and ungranted to PUBLIC.
  select exists (
      select 1 from pg_proc p
       where p.oid = 'clara._field_path_conforms(text)'::regprocedure
         and p.provolatile = 'i' and p.prosecdef = false
         and p.proowner = 'clara_fn_owner'::regrole
         and array_to_string(p.proconfig, ',') like '%search_path=clara%'
    ) into v_ok;
  if not v_ok then
    raise exception 'drfp tail: clara._field_path_conforms is missing, or is not IMMUTABLE / invoker / clara_fn_owner-owned / search_path-pinned as this file requires' using errcode = 'CLR10';
  end if;
  if has_function_privilege('public', 'clara._field_path_conforms(text)'::regprocedure, 'execute') then
    raise exception 'drfp tail: PUBLIC has EXECUTE on clara._field_path_conforms -- it must stay ungranted' using errcode = 'CLR10';
  end if;

  -- THE CONSTRAINT, exact text.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.document_regions'::regclass and conname = 'ck_document_regions_field_path_grammar';
  if v_def is distinct from 'CHECK (clara._field_path_conforms(field_path))' then
    raise exception 'drfp tail: ck_document_regions_field_path_grammar carries an unexpected definition (%)', v_def
      using errcode = 'CLR10';
  end if;

  -- clara._assert_field_path IS UNTOUCHED -- this file recuts nothing on the persist boundary.
  select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') into v_prosrc_sha
    from pg_proc where oid = 'clara._assert_field_path(text)'::regprocedure;
  if v_prosrc_sha <> '0641f62145e74c353adcb0be248d98fcd804051919b9462989308d2f291b1ace' then
    raise exception 'drfp tail: clara._assert_field_path body moved during this migration (sha %) -- this file must never recut it', v_prosrc_sha
      using errcode = 'CLR10';
  end if;

  -- EVERY OTHER CONSTRAINT, TRIGGER AND INDEX ON clara.document_regions SURVIVES, BY NAME.
  foreach v_name in array array['ck_document_regions_opening_fact_0017', 'document_regions_engine_confidence_check',
      'document_regions_id_firm_id_key', 'document_regions_locator_check',
      'document_regions_locator_kind_check', 'document_regions_pkey',
      'fk_document_regions_extraction', 'uq_document_regions_id_firm_extraction']
  loop
    if not exists (select 1 from pg_constraint
                     where conrelid = 'clara.document_regions'::regclass and conname = v_name) then
      raise exception 'drfp tail: clara.document_regions constraint % (unrelated to this file) is gone', v_name
        using errcode = 'CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'clara.document_regions'::regclass and tgname = 't_document_regions_append_only') then
    raise exception 'drfp tail: t_document_regions_append_only is gone' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'clara.document_regions'::regclass and tgname = 't_document_regions_fact_validate') then
    raise exception 'drfp tail: t_document_regions_fact_validate is gone' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.ix_document_regions_extraction') is null then
    raise exception 'drfp tail: 0007''s ix_document_regions_extraction is gone' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.uq_document_regions_extraction_field_path') is null then
    raise exception 'drfp tail: 0201''s uq_document_regions_extraction_field_path is gone' using errcode = 'CLR10';
  end if;

  -- LIVE PROBES. Reuse an extraction this file's own prestate already required to exist and
  -- conform (never a scratch firm/document minted here) -- any row proves the FK is satisfiable.
  select count(*) into v_regions_before from clara.document_regions;
  select r.firm_id, r.extraction_id into v_firm, v_extraction from clara.document_regions r limit 1;
  if v_firm is null then
    raise exception 'drfp tail: clara.document_regions is unexpectedly empty for the live probes' using errcode = 'CLR10';
  end if;

  -- Probe 1 — an UNREGISTERED-namespace raw insert is refused with the grammar's OWN CLR10,
  -- never Postgres's generic 23514. Nothing is written: a failed INSERT commits nothing.
  v_refused := false;
  begin
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content)
      values (v_firm, v_extraction, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb,
              'evil.total', 'drfp tail refusal probe -- unregistered namespace');
  exception
    when sqlstate 'CLR10' then v_refused := true;
  end;
  if not v_refused then
    raise exception 'drfp tail: an unregistered-namespace field_path (evil.total) was accepted by a RAW insert -- ck_document_regions_field_path_grammar did not fire' using errcode = 'CLR10';
  end if;

  -- Probe 2 — a NULL field_path and a well-formed field_path BOTH still insert on a raw write,
  -- exactly as the grammar always admitted them. Forced rollback via a private sentinel SQLSTATE
  -- this migration invents and catches nowhere else, so an unrelated failure inside the block
  -- (a real bug) propagates loudly instead of being swallowed.
  begin
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content)
      values (v_firm, v_extraction, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb,
              null, 'drfp tail null-path probe');
    -- 'invoice.deposit' rather than 'invoice.total': the chosen extraction (any row this file's
    -- own prestate already required to exist) may already carry 'invoice.total' from the
    -- estate's real seeding, and 0201's OWN partial unique key (untouched by this file) would
    -- then refuse a same-key duplicate — a different, unrelated wall this probe must not trip.
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content)
      values (v_firm, v_extraction, 'page_polygon', '{"page":1,"polygon":[0,0.1,1,0.2]}'::jsonb,
              'invoice.deposit', 'drfp tail well-formed-path probe');
    raise exception 'drfp tail rollback-only probe -- both inserts above succeeded, discard them' using errcode = 'DRFP1';
  exception
    when sqlstate 'DRFP1' then null; -- expected: both inserts succeeded; this block's own savepoint discards them
  end;

  select count(*) into v_regions_after from clara.document_regions;
  if v_regions_after <> v_regions_before then
    raise exception 'drfp tail: clara.document_regions holds % row(s) after the probes, not the % present before them -- a probe left a residue', v_regions_after, v_regions_before
      using errcode = 'CLR10';
  end if;

  -- THE TWO PLURAL LITERALS pass the CHECK trivially -- ordinary registered-namespace paths,
  -- never special-cased by this file (a cheap boolean call, no insert needed for this half).
  if not clara._field_path_conforms('opening_tb.line') or not clara._field_path_conforms('prior_gl.line') then
    raise exception 'drfp tail: the two 0201 plural literals no longer conform to the grammar this CHECK enforces' using errcode = 'CLR10';
  end if;

  raise notice 'drfp tail: OK -- clara._field_path_conforms is live (immutable, invoker, clara_fn_owner-owned, ungranted to PUBLIC and every application role), ck_document_regions_field_path_grammar reads exactly "CHECK (clara._field_path_conforms(field_path))", clara._assert_field_path is untouched (sha %), every other constraint/trigger/index on clara.document_regions survives by name, and three live rolled-back probes confirm a RAW insert of an unregistered-namespace path is refused with CLR10 while a NULL path and a well-formed path both still insert -- with clara.document_regions holding the same % row(s) before and after.',
    v_prosrc_sha, v_regions_before;
end $drfp_tail$;
