-- wave-b-0020-a7-probe.sql — READ-ONLY. Run this BEFORE anything else in the 0020
-- ceremony (design contract §10.3 step 1b-i). It answers exactly one question:
--
--   "will migration 0020's bridge abort on this database — on WHICH of its five
--    directions, and on how many pages?"
--
-- It writes NOTHING — no row, no event, no catalog entry, not even a temp object (a temp
-- view would be a write, and would fail in a read-only transaction; the two statements are
-- a `do` block that only SELECTs and RAISEs, and one SELECT). It is safe to run on
-- production at any time, including while the runtime is live. Proven empirically for THIS
-- file, not inherited from an earlier draft: it completes inside `begin read only`, where
-- any write would raise 25006. Every statement is a plain SELECT, so it takes only
-- AccessShareLock, which conflicts with nothing an ordinary writer holds.
--
-- ---------------------------------------------------------------------------------
-- WHY IT STARTS WITH A ROLE ASSERTION (ratchet R5 finding C — a SILENT FALSE-CLEAN).
-- ---------------------------------------------------------------------------------
-- Every relation this file reads is under row-level security. Run it as a role RLS
-- filters — `clara_authenticated` with no JWT claim, say — and every count comes back
-- ZERO, which is *byte-identical to a clean database*. The one artifact whose output
-- decides whether a human runs the remediation would then say "nothing to do" precisely
-- when it could see nothing at all. So the file REFUSES to report a number it cannot
-- trust: the first statement proves, from the catalog, that RLS cannot filter any of the
-- four relations for the current role, and raises if it can. Run it as the migration/
-- owner role — the same role `pnpm db:migrate` uses.
--
-- ---------------------------------------------------------------------------------
-- THE FIVE BRIDGE DIRECTIONS (0020 `do $a5bridge$`), and which ones are remediable.
-- ---------------------------------------------------------------------------------
-- The row-level predicate 0020 makes load-bearing is `slug like 'sources/%'`, and the
-- bridge proves — never assumes — that it means "every version of this page was written
-- by record_wiki_source_ingest". A stray page in ANY direction aborts the apply.
--
--   D1  a `sources/` page with NO deterministic-ingest log row      CLR10, NOT remediable
--   D2  a deterministic-ingest page living OUTSIDE `sources/`        CLR10, NOT remediable
--   D3  a `sources/` page carrying a MODEL-PATH publication row      CLR10, NOT remediable
--   D4  stored title/body differ from the canonical reconstruction   CLR10, preflight fixes
--   D5  the append-only reconstruction EVENTS still carry pre-       CLR10, preflight fixes
--       canonical bytes with no later correction envelope
--
-- D1/D2/D3 are set-membership and mechanism facts about how a page was CREATED. No script
-- can repair them after the fact — a page that took the model path took the model path.
-- They must be INVESTIGATED (whose page, which caller, when), and the finding ruled on,
-- before 0020 can apply. `wave-b-0020-a7-preflight.sql` does not touch them and will not
-- clear them; it corrects D4 and D5 only. An earlier draft of this probe computed D4/D5
-- alone while its header promised the whole question, so a D1 violation would have let
-- the apply fail with the probe reading clean (reproduced on the rig).
--
-- D4/D5 are two halves of one invariant (amendment A8): D4 is the property in the TABLES,
-- D5 is that same property WHERE A REBUILD READS IT. `domain_events` is append-only, so a
-- remediation that rewrites only the rows passes D4 while a projection rebuilt from the
-- log restores the old filename-bearing bytes. `needs_canonicalization` is their union —
-- what the preflight will correct. Expect it non-zero on the FIRST run against the live
-- database (the 0019 ceremony backfilled ~30 source pages with the pre-A7 verb, whose
-- title and body carried the document's original_filename) and EXACTLY ZERO after the
-- preflight, and on every re-run.
--
-- ---------------------------------------------------------------------------------
-- THE POPULATION THE BRIDGE DOES NOT REACH (residual A8-R1, contract §11).
-- ---------------------------------------------------------------------------------
-- D5 checks that the events which EXIST are canonical. It does not prove event
-- COMPLETENESS: a version carrying no `wiki.page_published` envelope at all is not
-- reconstructible from the log, and D5's scope — "whatever the log says about a `sources/`
-- page must be canonical" — never looks at it. Completeness is a pre-existing property of
-- the 0017 writers that 0020 neither creates nor changes, and fabricating a synthetic
-- publication envelope for a version that never had one would invent history. So §11's
-- ruling is that the gap is made VISIBLE rather than silent — and this file is where that
-- promise is kept. `a8r1_versions_without_publication_event` is ADVISORY: a non-zero count
-- does not block the apply, and it is a writer-side regression to investigate, not
-- something to remediate here.
--
-- ---------------------------------------------------------------------------------
-- THE CANONICAL FORM, restated so this file is readable alone (byte-identical to
-- migration 0020's bridge and to the preflight):
--     doc     = substring(slug from 9)                 -- 'sources/' is 8 characters
--     title   = 'Source: '          || doc
--     content = 'Source document: ' || doc
--     sha     = sha256(content) as lowercase hex
--     key     = 'firms/<firm>/wiki/<client>/' || sha || '.md'
--     size    = octet_length(content)
--
-- Usage:  psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-probe.sql

-- ===================================================================================
-- STATEMENT 1 — the read environment. Reads the catalog; asserts; writes nothing.
-- ===================================================================================
do $probe_env$
declare
  v_rels constant text[] := array['clara.wiki_pages','clara.wiki_page_versions',
                                  'clara.wiki_log','clara.domain_events'];
  v_name     text;
  v_oid      oid;
  v_filtered boolean;
  v_super    boolean;
  v_bypass   boolean;
  v_missing  text := '';
  v_blind    text := '';
begin
  select r.rolsuper, r.rolbypassrls into v_super, v_bypass
    from pg_roles r where r.rolname = current_user;

  foreach v_name in array v_rels loop
    v_oid := to_regclass(v_name);
    if v_oid is null then
      v_missing := v_missing || case when v_missing='' then '' else ', ' end || v_name;
      continue;
    end if;
    -- RLS filters this role's reads unless (a) it is superuser, (b) it carries BYPASSRLS
    -- — this is how Supabase's `postgres` role reads, and how the live ceremony runs —
    -- (c) it owns the table by direct or inherited membership AND the table is not FORCE
    -- ROW LEVEL SECURITY, or (d) an UNCONDITIONAL permissive read policy covers it with no
    -- restrictive policy in play. (d) is not a formality: every wiki relation here is FORCE
    -- RLS, so (c) does not save even clara_fn_owner — it reads through `USING (true)`, and
    -- a catalog-only ownership test would refuse the very role that can see every row.
    -- A policy that actually restricts (`firm_id = clara.jwt_firm()`) is not `true` and so
    -- still trips the refusal, which is the whole point.
    select c.relrowsecurity
       and not coalesce(v_super,false)
       and not coalesce(v_bypass,false)
       and not (not c.relforcerowsecurity
                and pg_has_role(current_user, c.relowner, 'USAGE'))
       and not (
         exists(select 1 from pg_policy pol
                 where pol.polrelid = c.oid and pol.polpermissive
                   and pol.polcmd in ('r','*')
                   and pg_get_expr(pol.polqual, pol.polrelid) = 'true'
                   and (0 = any(pol.polroles)
                        or exists(select 1 from unnest(pol.polroles) ro
                                   where ro <> 0
                                     and pg_has_role(current_user, ro, 'USAGE'))))
         and not exists(select 1 from pg_policy pol
                 where pol.polrelid = c.oid and not pol.polpermissive
                   and pol.polcmd in ('r','*')
                   and (0 = any(pol.polroles)
                        or exists(select 1 from unnest(pol.polroles) ro
                                   where ro <> 0
                                     and pg_has_role(current_user, ro, 'USAGE')))))
      into v_filtered
      from pg_class c where c.oid = v_oid;
    if v_filtered then
      v_blind := v_blind || case when v_blind='' then '' else ', ' end || v_name;
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'A7 probe: relation(s) % do not exist — this is not a Clara database at migration 0017+. Refusing to report counts that would all read zero.', v_missing;
  end if;
  if v_blind <> '' then
    raise exception 'A7 probe: row-level security FILTERS % for role % — every count would read zero, which is indistinguishable from a clean database. Re-run as the migration/owner role (the same role `pnpm db:migrate` uses). Refusing to report.',
      v_blind, current_user;
  end if;
  raise notice 'A7 probe: reading as % — RLS cannot filter any of the four source relations for this role.', current_user;
end
$probe_env$;

-- ===================================================================================
-- STATEMENT 2 — the report. One CTE chain; every number and every offender slug comes
-- from the SAME predicates, so the summary and the detail cannot drift apart.
-- ===================================================================================
with canon as (
  select p.id, p.firm_id, p.client_id, p.slug, p.title,
         'Source: '||substring(p.slug from 9)                        as c_title,
         'Source document: '||substring(p.slug from 9)               as c_content,
         encode(sha256(convert_to('Source document: '||substring(p.slug from 9),
           'UTF8')),'hex')                                           as c_sha,
         octet_length('Source document: '||substring(p.slug from 9)) as c_size
    from clara.wiki_pages p
   where p.slug like 'sources/%'
), canon2 as (
  select c.*, 'firms/'||c.firm_id::text||'/wiki/'||c.client_id::text||'/'
                ||c.c_sha||'.md' as c_key
    from canon c
), judged as (
  select c.id, c.slug,
         -- DIRECTION 1: created outside the deterministic-ingest verb.
         not exists(select 1 from clara.wiki_log l
                     where l.page_id=c.id and l.action='ingest')    as d1_bad,
         -- DIRECTION 3: a model-path publication in the reserved namespace.
         exists(select 1 from clara.wiki_log l
                 where l.page_id=c.id and l.action='publish')       as d3_bad,
         -- DIRECTION 4: the stored bytes.
         (c.title is distinct from c.c_title
          or exists(select 1 from clara.wiki_page_versions v
                     where v.page_id=c.id
                       and v.content is distinct from c.c_content)) as d4_bad,
         -- DIRECTION 5: the append-only reconstruction spine. An event is stale iff it
         -- carries a non-canonical field AND no LATER wiki.page_canonicalized envelope
         -- exists for the same (page, version). page_id is compared as TEXT so no
         -- untrusted payload string is ever cast to uuid.
         exists(
           select 1 from clara.domain_events e
            where e.event_type in ('wiki.page_published','wiki.source_ingested')
              and e.payload->>'page_id' = c.id::text
              and ((e.payload ? 'title'
                    and e.payload->>'title' is distinct from c.c_title)
                or (e.payload ? 'content_sha256'
                    and e.payload->>'content_sha256' is distinct from c.c_sha)
                or (e.payload ? 'storage_key'
                    and e.payload->>'storage_key' is distinct from c.c_key)
                or (e.payload ? 'size_bytes'
                    and e.payload->>'size_bytes' is distinct from c.c_size::text))
              and not exists(
                select 1 from clara.domain_events k
                 where k.firm_id=e.firm_id
                   and k.event_type='wiki.page_canonicalized'
                   and k.payload->>'page_id'    = e.payload->>'page_id'
                   and k.payload->>'version_id' = e.payload->>'version_id'
                   and k.seq > e.seq))                              as d5_bad
    from canon2 c
), outside_ns as (
  -- DIRECTION 2: a deterministic-ingest page living outside the reserved namespace.
  select p.slug
    from clara.wiki_pages p
   where p.slug not like 'sources/%'
     and exists(select 1 from clara.wiki_log l
                 where l.page_id=p.id and l.action='ingest')
), incomplete as (
  -- ADVISORY (residual A8-R1): a `sources/` version with no publication envelope at all.
  -- Not a bridge direction; does not block the apply. Named here so the gap is visible.
  select c.slug||'  version_n='||v.version_n::text as slug
    from clara.wiki_page_versions v
    join canon2 c on c.id = v.page_id
   where not exists(
           select 1 from clara.domain_events e
            where e.event_type='wiki.page_published'
              and e.payload->>'page_id'    = v.page_id::text
              and e.payload->>'version_id' = v.id::text)
), summary as (
  select  1 as ord, 'source_pages_total'                    as metric,
          (select count(*) from canon2)::int                as n, 'context'  as kind,
          '—' as remedy
  union all select  2, 'wiki_pages_total',
          (select count(*) from clara.wiki_pages)::int, 'context', '—'
  union all select  3, 'source_page_versions_total',
          (select count(*) from clara.wiki_page_versions v
             join canon2 c on c.id=v.page_id)::int, 'context', '—'
  union all select 10, 'd1_sources_page_without_ingest_log',
          (select count(*) from judged where d1_bad)::int, 'blocker',
          'INVESTIGATE — not repairable by any script; the preflight does NOT clear this'
  union all select 11, 'd2_ingest_page_outside_namespace',
          (select count(*) from outside_ns)::int, 'blocker',
          'INVESTIGATE — not repairable by any script; the preflight does NOT clear this'
  union all select 12, 'd3_sources_page_with_model_publication',
          (select count(*) from judged where d3_bad)::int, 'blocker',
          'INVESTIGATE — a model-path page cannot take the deterministic exemption'
  union all select 13, 'd4_bytes_non_canonical',
          (select count(*) from judged where d4_bad)::int, 'blocker',
          'run wave-b-0020-a7-preflight.sql'
  union all select 14, 'd5_spine_non_canonical',
          (select count(*) from judged where d5_bad)::int, 'blocker',
          'run wave-b-0020-a7-preflight.sql'
  union all select 15, 'needs_canonicalization (d4 ∪ d5)',
          (select count(*) from judged where d4_bad or d5_bad)::int, 'rollup',
          'run wave-b-0020-a7-preflight.sql'
  union all select 20, 'a8r1_versions_without_publication_event',
          (select count(*) from incomplete)::int, 'advisory',
          'does NOT block the apply — a writer-side gap to investigate (contract §11)'
), offenders as (
  select 'd1_sources_page_without_ingest_log'      as direction, slug from judged where d1_bad
  union all select 'd2_ingest_page_outside_namespace',       slug from outside_ns
  union all select 'd3_sources_page_with_model_publication', slug from judged where d3_bad
  union all select 'd4_bytes_non_canonical',                 slug from judged where d4_bad
  union all select 'd5_spine_non_canonical',                 slug from judged where d5_bad
  union all select 'a8r1_versions_without_publication_event',slug from incomplete
), offenders_capped as (
  select direction, slug from (
    select o.direction, o.slug,
           row_number() over (partition by o.direction order by o.slug) as rn
      from offenders o) z
   where rn <= 25
)
select ord, metric, n, status, remedy from (
  select s.ord, s.metric, s.n::text as n,
         case when s.kind in ('context','advisory') and s.n = 0 then 'none'
              when s.kind = 'context'                           then 'context'
              when s.kind = 'advisory'                          then 'VISIBLE (advisory)'
              when s.n = 0                                      then 'OK'
              else 'BLOCKS THE APPLY' end                       as status,
         case when s.n = 0 then '—' else s.remedy end           as remedy
    from summary s
  union all
  select 90, '  ↳ '||o.direction, o.slug, 'offender', '—'
    from offenders_capped o
) q
order by ord, metric, n;
