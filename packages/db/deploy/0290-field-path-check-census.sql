-- =====================================================================
-- Migration 0290 (#857 AC2, the document_regions field_path CHECK) — THE PRE-DEPLOY FIELD-PATH
-- CENSUS.
--
-- READ-ONLY. Run as a superuser/owner session against the DEPLOYED database BEFORE applying
-- 0290, during the release session:
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f 0290-field-path-check-census.sql
--
-- WHY IT EXISTS. 0290 adds a table CHECK to clara.document_regions enforcing the SAME grammar
-- 0191's clara._assert_field_path already enforces at the persist boundary — but a CHECK, unlike
-- that boundary, is validated by Postgres against EVERY EXISTING ROW at ALTER TABLE time, and it
-- covers a wider set of writers (any raw insert, not only clara.persist_document_extraction).
-- 0191's own deploy census (0191-field-path-census.sql) already proved the estate clean against
-- this same grammar at 0191's own cutover; this probe re-proves it now, because a row could have
-- been written since — by an older producer, a hand repair, or a lane retired since 0191 shipped
-- — that this repository's own producer census cannot see. It is otherwise IDENTICAL to 0191's
-- own probe 1/2 shape, re-run rather than assumed still true.
--
-- THE GRAMMAR, restated exactly as clara._assert_field_path (and now this CHECK) enforces it:
--   * NULL passes (clara.document_regions.field_path is nullable by design);
--   * 1..128 characters;
--   * dot-separated segments, at most 12, each either an unsigned integer or an identifier
--     `[A-Za-z_][A-Za-z0-9_]*` (MIXED CASE IS ADMITTED — `sheets.0.A1` is a live XLSX path);
--   * the FIRST segment is one of the ten registered namespaces.
--
-- THE TWO PLURAL LITERALS (`opening_tb.line`, `prior_gl.line`) ARE NOT SPECIAL to this grammar —
-- they are ordinary registered-namespace paths, exactly as many-rows-at-one-path as a forty-line
-- trial balance requires. This CHECK is evaluated per row and has no uniqueness concept, so it
-- neither knows nor cares how many rows already carry the same path (0201's own partial unique
-- index is the ONLY thing that does, and this file does not touch it).
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- Probe 1 — THE FULL DISTRIBUTION. Every distinct stored field_path with its row count and
-- whether it conforms. Read this list; it is the whole answer.
-- ---------------------------------------------------------------------
\echo ''
\echo '== 0290 probe 1: stored field_path distribution =='
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
  max(r.created_at)                                    as most_recent
from clara.document_regions r
group by 1, 4, 5
order by verdict desc, rows desc, field_path;

-- ---------------------------------------------------------------------
-- Probe 2 — THE ONLY LINE THAT MATTERS. Raises if any stored value would be refused, so a
-- release session running this with ON_ERROR_STOP cannot proceed past a non-conforming estate.
-- Exactly the query 0290's own migration prestate runs (and re-refuses the cutover with, as a
-- second, independent proof) if this probe is skipped.
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
    raise exception '0290 census: % distinct field_path value(s) across % region row(s) would be REFUSED by the new CHECK. DO NOT APPLY 0290. Census them (probe 1 above), identify the producer, and widen clara._assert_field_path''s roster in a new append-only migration first (0290 wraps that same function — never edit it). First ten: %',
      array_length(v_bad, 1), v_rows, v_bad[1:10] using errcode = 'CLR10';
  end if;

  raise notice '0290 census OK: % region row(s) total, % with a null field_path, 0 non-conforming. The 0290 cutover is safe to apply on this database.',
    v_total, v_null;
end $probe2$;

-- ---------------------------------------------------------------------
-- Probe 3 — THE NEIGHBOUR BODY THIS MIGRATION WRAPS, pinned. 0290's own prestate refuses on a
-- drifted pre-image sha; reading it HERE means the release session finds that out before the
-- window rather than inside it.
-- ---------------------------------------------------------------------
do $probe3$
declare
  v_sha text;
  v_owner text;
begin
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.proowner::regrole::text
    into v_sha, v_owner
    from pg_proc p
   where p.oid = 'clara._assert_field_path(text)'::regprocedure;

  if v_sha is null then
    raise exception '0290 census: clara._assert_field_path is absent -- 0290 must not be applied below the 0191 frontier' using errcode = 'CLR10';
  end if;
  raise notice '0290 census: clara._assert_field_path is present (sha %), owned by %. 0290''s own prestate re-measures this against its own pin rather than trusting this notice.',
    left(v_sha, 12), v_owner;
end $probe3$;
