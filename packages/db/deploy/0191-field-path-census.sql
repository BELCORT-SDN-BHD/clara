-- =====================================================================
-- Migration 0191 (#624, the document capability registry) — THE PRE-DEPLOY FIELD-PATH CENSUS.
--
-- READ-ONLY. Run as a superuser/owner session against the DEPLOYED database BEFORE applying
-- 0191, during the release session:
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f 0191-field-path-census.sql
--
-- WHY IT EXISTS. 0191 splices `clara._assert_field_path` into `clara.persist_document_extraction`
-- — the one region writer that has always taken `field_path` verbatim. The grammar it enforces
-- was CENSUSED from the in-repo producers (packages/runtime/lib/egress.mjs's Azure normalizer,
-- structured-worker.mjs's csv/xlsx/docx readers, myinvois.mjs's UBL identity pass,
-- opening-tb-cells.mjs, seeding-parse.mjs) plus the two closed allowlists. That census covers
-- every producer THIS REPOSITORY knows about. It cannot cover a path that only exists in the
-- LIVE database — a row written by an older producer, by a hand-run repair, or by a lane that
-- has since been retired.
--
-- A validator that refuses a live producer's path is an ingest outage, not a wall. So there are
-- TWO instruments and they are deliberately different:
--
--   * this probe, run BEFORE the migration, tells the release session what is actually stored
--     and — crucially — what a NON-CONFORMING value looks like, with enough context to decide;
--   * 0191's own PRESTATE, which runs the SAME predicate inside the migration and REFUSES the
--     cutover outright if any stored value would fail. The migration cannot be applied over a
--     database this probe would have flagged.
--
-- This file is therefore the OPERATOR's copy of the wall: it produces the census to read, and
-- the migration produces the refusal. Neither is a substitute for the other — the probe alone
-- could be skipped, and the refusal alone gives an operator no way to prepare.
--
-- THE GRAMMAR, restated exactly as clara._assert_field_path enforces it:
--   * NULL passes (clara.document_regions.field_path is nullable by design);
--   * 1..128 characters;
--   * dot-separated segments, at most 12, each either an unsigned integer or an identifier
--     `[A-Za-z_][A-Za-z0-9_]*` (MIXED CASE IS ADMITTED — `sheets.0.A1` is a live XLSX path);
--   * the FIRST segment is one of the ten registered namespaces.
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- Probe 1 — THE FULL DISTRIBUTION. Every distinct stored field_path with its row count, its
-- first segment, and whether it conforms. Read this list; it is the whole answer.
-- ---------------------------------------------------------------------
\echo ''
\echo '== 0191 probe 1: stored field_path distribution =='
select
  coalesce(r.field_path, '(null)')                     as field_path,
  count(*)                                             as rows,
  count(distinct r.firm_id)                            as firms,
  split_part(coalesce(r.field_path, ''), '.', 1)       as namespace,
  case
    when r.field_path is null then 'PASS (null is admitted)'
    when length(r.field_path) = 0 or length(r.field_path) > 128 then 'FAIL length'
    when r.field_path !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$'
      then 'FAIL syntax'
    when split_part(r.field_path, '.', 1) not in
         ('invoice','statement','myinvois','opening_tb','prior_gl',
          'pages','tables','rows','sheets','paragraphs')
      then 'FAIL namespace'
    else 'PASS'
  end                                                  as verdict,
  min(e.engine_id)                                     as an_engine_that_wrote_it,
  min(e.engine_kind)                                   as an_engine_kind,
  max(r.created_at)                                    as most_recent
from clara.document_regions r
left join clara.document_extractions e on e.id = r.extraction_id
group by 1, 4, 5
order by verdict desc, rows desc, field_path;

-- ---------------------------------------------------------------------
-- Probe 2 — THE ONLY LINE THAT MATTERS. Raises if any stored value would be refused, so a
-- release session running this with ON_ERROR_STOP cannot proceed past a non-conforming estate.
-- ---------------------------------------------------------------------
do $probe2$
declare
  v_bad text[];
  v_rows bigint;
  v_total bigint;
  v_null bigint;
begin
  select count(*), count(*) filter (where field_path is null)
    into v_total, v_null from clara.document_regions;

  select coalesce(array_agg(distinct fp order by fp), array[]::text[]), coalesce(sum(n), 0)
    into v_bad, v_rows
    from (
      select r.field_path as fp, count(*) as n
        from clara.document_regions r
       where r.field_path is not null
         and (length(r.field_path) = 0 or length(r.field_path) > 128
              or r.field_path !~ '^([A-Za-z_][A-Za-z0-9_]*|[0-9]+)(\.([A-Za-z_][A-Za-z0-9_]*|[0-9]+)){0,11}$'
              or split_part(r.field_path, '.', 1) not in
                 ('invoice','statement','myinvois','opening_tb','prior_gl',
                  'pages','tables','rows','sheets','paragraphs'))
       group by 1
    ) s;

  if coalesce(array_length(v_bad, 1), 0) > 0 then
    raise exception '0191 census: % distinct field_path value(s) across % region row(s) would be REFUSED by the new grammar. DO NOT APPLY 0191. Census them (probe 1 above), identify the producer, and widen clara._assert_field_path''s roster in a new append-only migration first. First ten: %',
      array_length(v_bad, 1), v_rows, v_bad[1:10] using errcode = 'CLR10';
  end if;

  raise notice '0191 census OK: % region row(s) total, % with a null field_path, 0 non-conforming. The 0191 cutover is safe to apply on this database.',
    v_total, v_null;
end $probe2$;

-- ---------------------------------------------------------------------
-- Probe 3 — THE BODY THIS MIGRATION RECUTS, pinned. 0191's own prestate refuses on a drifted
-- pre-image sha; reading it HERE means the release session finds that out before the window
-- rather than inside it.
-- ---------------------------------------------------------------------
do $probe3$
declare
  v_sha text;
  v_owner text;
begin
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.proowner::regrole::text
    into v_sha, v_owner
    from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;

  if v_sha is null then
    raise exception '0191 census: clara.persist_document_extraction is absent' using errcode = 'CLR10';
  end if;
  if v_sha <> '8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354' then
    raise exception '0191 census: persist_document_extraction pre-image sha is % — 0191 expects the 0123 body and WILL refuse. Re-derive the pin before the release window.', v_sha
      using errcode = 'CLR10';
  end if;
  raise notice '0191 census: persist_document_extraction is at its expected 0123 body (sha %), owned by %. The splice will apply.',
    left(v_sha, 12), v_owner;
end $probe3$;

-- ---------------------------------------------------------------------
-- Probe 4 — THE WRITER-QUIESCENCE REMINDER, measured rather than assumed. 0191 replaces a live
-- function body on the hot ingest path; a persist running THROUGH the swap runs on whichever
-- body it started with. This prints what is in flight so the release session can choose its
-- moment instead of guessing.
-- ---------------------------------------------------------------------
\echo ''
\echo '== 0191 probe 4: what is in flight on the ingest path right now =='
select t.lane, t.status, count(*) as tasks
from clara.document_processing_tasks t
where t.status in ('queued', 'held_egress', 'running')
group by 1, 2
order by 1, 2;
