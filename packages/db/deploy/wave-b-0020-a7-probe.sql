-- wave-b-0020-a7-probe.sql — READ-ONLY. Run this BEFORE anything else in the 0020
-- ceremony (design contract §10.3 step 1b-i). It answers exactly one question:
--
--   "will migration 0020 abort on this database, and on how many pages?"
--
-- It writes NOTHING — no row, no event, no catalog entry. It is safe to run on
-- production at any time, including while the runtime is live.
--
-- The two numbers it returns are the two halves of the same invariant (amendment A8):
--
--   bytes_non_canonical  — pages whose STORED title/body differ from the canonical
--                          form. Migration 0020's bridge DIRECTION 4 aborts on these.
--   spine_non_canonical  — pages whose APPEND-ONLY RECONSTRUCTION EVENTS still carry a
--                          pre-canonical title / content hash / storage key / size with
--                          no later correction envelope. `domain_events` is append-only,
--                          so canonicalizing the rows alone leaves these stale and a
--                          projection rebuilt from the log would restore the old bytes.
--                          Migration 0020's bridge DIRECTION 5 aborts on these.
--
-- `needs_canonicalization` is the union — the number of pages
-- packages/db/deploy/wave-b-0020-a7-preflight.sql will correct. Expect a non-zero
-- number on the FIRST run against the live database (the 0019 ceremony backfilled ~30
-- source pages with the pre-A7 verb, whose title and body carried the document's
-- original_filename) and EXACTLY ZERO after the preflight, and on every re-run.
--
-- The canonical form, restated here so this file is readable alone (it is byte-identical
-- to migration 0020's bridge and to the preflight):
--     doc     = substring(slug from 9)                 -- 'sources/' is 8 characters
--     title   = 'Source: '          || doc
--     content = 'Source document: ' || doc
--     sha     = sha256(content) as lowercase hex
--     key     = 'firms/<firm>/wiki/<client>/' || sha || '.md'
--     size    = octet_length(content)
--
-- Usage:  psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-probe.sql

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
  select c.slug,
         -- DIRECTION 4: the stored bytes.
         (c.title is distinct from c.c_title
          or exists(select 1 from clara.wiki_page_versions v
                     where v.page_id=c.id
                       and v.content is distinct from c.c_content)) as bytes_bad,
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
                   and k.seq > e.seq)) as spine_bad
    from canon2 c
)
select
  count(*)::int                                                   as source_pages_total,
  count(*) filter (where bytes_bad)::int                          as bytes_non_canonical,
  count(*) filter (where spine_bad)::int                          as spine_non_canonical,
  count(*) filter (where bytes_bad or spine_bad)::int             as needs_canonicalization,
  coalesce((select string_agg(slug, ', ' order by slug)
              from (select slug from judged
                     where bytes_bad or spine_bad order by slug limit 25) x),
           '<none>')                                              as first_25_offenders
from judged;
