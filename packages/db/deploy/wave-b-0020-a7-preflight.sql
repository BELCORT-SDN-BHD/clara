-- wave-b-0020-a7-preflight.sql — the 0020 A7/A8 CANONICALIZATION PREFLIGHT.
-- NOT a migration. Run it as the MIGRATION/OWNER role (the same role that runs
-- `pnpm db:migrate`), in the ceremony window, BEFORE applying migration 0020 — design
-- contract §5.7 / §10.3 step 1b. Read wave-b-0020-a7-probe.sql first; it tells you,
-- read-only, whether this is needed and on how many pages.
--
--   psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-preflight.sql
--
-- ---------------------------------------------------------------------------------
-- WHY THIS IS NOT TWO `update` STATEMENTS (amendment A8, ratchet R4 finding F1).
-- ---------------------------------------------------------------------------------
-- A7 shipped the remediation as two bare `update`s over wiki_pages / wiki_page_versions.
-- They are correct about the ROWS and wrong about the ARCHITECTURE. The pre-0020 ingest
-- verb wrote the filename-bearing title, content hash, storage key and size into the
-- APPEND-ONLY EVENT SPINE as well (`0017_wave_b.sql:2280`, wiki.page_published, and
-- :2277, wiki.source_ingested). Correcting only the rows leaves the spine stale, so:
--
--   * 0020's table bridge (direction 4) passes, while
--   * a projection REBUILT FROM EVENTS — the W4/P17 invariant the whole design rests on,
--     and what a DR restore of the index actually does — restores the OLD filename-bearing
--     title and the OLD reconstruction envelope, or fails against the OLD storage key.
--
-- That silently reopens, in a rebuilt projection, exactly the caller-prose channel A7
-- closed. `domain_events` is append-only and trigger-enforced (0005:288-291): you do not
-- rewrite history. You APPEND a correction the rebuild understands — the same
-- reverse-not-delete discipline the books use for a posted entry.
--
-- ---------------------------------------------------------------------------------
-- WHAT THIS DOES, in ONE transaction (a single `do` block = a single statement).
-- ---------------------------------------------------------------------------------
--  1. Registers the correction event type `wiki.page_canonicalized` (client-scoped,
--     taxonomy decision `ignore`) if it is not already registered. Migration 0020
--     registers the IDENTICAL row with the same on-conflict guard, so a database that
--     never needed the preflight and one that ran it converge to the same catalog.
--  2. For every page in the reserved `sources/` namespace whose STORED bytes are
--     non-canonical OR whose RECONSTRUCTION EVENTS are stale:
--       a. re-derives the page title and EVERY version's content / content_sha256 /
--          storage_key / size_bytes from the document uuid in the slug and NOTHING ELSE;
--       b. appends ONE `wiki.page_canonicalized` correction envelope PER VERSION,
--          carrying the canonical values under the SAME payload keys `wiki.page_published`
--          uses — so a rebuild needs one extra rule and no new field mapping;
--       c. writes an audit_log row per page.
--  3. Re-asserts migration 0020's bridge directions 4 AND 5 and RAISES if either would
--     still abort. Running this to completion is therefore a proof that the apply will
--     clear both, not a hope.
--
-- THE REBUILD RULE (contract §5.7, and what the upgrade fixture drives):
--   apply `wiki.page_published` in seq order; then, for each (page_id, version_id),
--   apply the LATEST `wiki.page_canonicalized` that is LATER in seq. The correction
--   overrides title, content, content_sha256, storage_key and size_bytes — and NOTHING
--   else. `payload.preimage` is audit-only and never enters a rebuilt projection.
--
-- WHERE THE PREIMAGE GOES, and why (F1's explicit requirement):
--   into `payload.preimage` of the correction envelope. Not destroyed, and not put back
--   into page bytes. The property A7 bought is that caller prose is not in EXEMPT PAGE
--   BYTES — the thing `get_wiki_page` / `list_wiki_pages` / `get_context_pack` serve and
--   the only wiki text a model ever sees. `domain_events` is in NO wiki read path, is not
--   an input to synthesis (the projection prompt carries page kind, counterparty id and
--   event TYPE only — `packages/runtime/lib/wiki-projection.mjs`), and already holds the
--   non-canonical TITLE forever in the original wiki.page_published payload, where it
--   cannot be removed. The one thing that would otherwise be LOST is a `p_note` body: the
--   event envelope never carried `content`. So the correction records it, deliberately —
--   erasing a provenance record was never the goal. A filename preimage is additionally
--   still on `clara.documents`, which is where every human surface already reads it.
--
-- IDEMPOTENT AND ROW-SCOPED: the driving predicate is "this page is not canonical, in the
-- rows or in the spine". A second run selects nothing, updates nothing, appends nothing,
-- and prints zeros. A page that is already canonical is never touched and never gets an
-- envelope. Nothing outside `slug like 'sources/%'` is read or written.
--
-- SIDE EFFECT, named rather than discovered: each correction advances the firm's
-- `firm_event_seq`, as any append does. Run it inside the quiesced ceremony window (§10.3
-- step 1), where no wake or freshness token straddles it. The object-storage blob at each
-- page's OLD content hash is orphaned and no blob is written at the new key — unchanged
-- from A7, and named there: every read surface serves `wiki_page_versions.content` from
-- the database.

do $a7pre$
declare
  p            record;
  v            record;
  v_type_new   int  := 0;
  v_pages      int  := 0;
  v_versions   int  := 0;
  v_events     int  := 0;
  v_title_upd  int  := 0;
  v_rows       int  := 0;
  c_title      text;
  c_content    text;
  c_sha        text;
  c_key        text;
  c_size       int;
  v_doc        uuid;
  v_old_title  text;
  v_n          bigint;
  v_bad        text;
begin
  -- ---- 1. the correction event type (idempotent; 0020 registers the same row) -------
  insert into clara.event_types(name, client_scoped, description)
    values ('wiki.page_canonicalized', true,
      'A reserved-namespace source page''s bytes were re-derived to their canonical form; '
      || 'a rebuild applies it over the page''s publication envelope (0020 A8)')
    on conflict (name) do nothing;
  get diagnostics v_type_new = row_count;

  insert into clara.trigger_taxonomy(version, event_type, decision, note)
    select a.version, 'wiki.page_canonicalized', 'ignore',
      'a correction envelope for the wiki index; the projection consumer does not '
      || 'subscribe wiki.* (P17), so there is nothing to route'
      from clara.taxonomy_active a
   on conflict (version, event_type) do nothing;

  -- ---- 2. every page that is non-canonical in the ROWS or in the SPINE --------------
  for p in
    with canon as (
      select w.id, w.firm_id, w.client_id, w.slug, w.title,
             'Source: '||substring(w.slug from 9)                        as c_title,
             'Source document: '||substring(w.slug from 9)               as c_content,
             encode(sha256(convert_to('Source document: '||substring(w.slug from 9),
               'UTF8')),'hex')                                           as c_sha,
             octet_length('Source document: '||substring(w.slug from 9)) as c_size
        from clara.wiki_pages w
       where w.slug like 'sources/%'
    ), canon2 as (
      select c.*, 'firms/'||c.firm_id::text||'/wiki/'||c.client_id::text||'/'
                    ||c.c_sha||'.md' as c_key
        from canon c
    )
    select c.* from canon2 c
     where c.title is distinct from c.c_title
        or exists(select 1 from clara.wiki_page_versions x
                   where x.page_id=c.id and x.content is distinct from c.c_content)
        or exists(
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
                     and k.seq > e.seq))
     order by c.slug
  loop
    c_title := p.c_title; c_content := p.c_content;
    c_sha   := p.c_sha;   c_key     := p.c_key;  c_size := p.c_size;
    -- the slug's document id, when it is one. A non-uuid tail is still canonicalized
    -- (the form is pure text derivation); the event simply carries no document_id.
    v_doc := null;
    if substring(p.slug from 9) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then v_doc := substring(p.slug from 9)::uuid;
    end if;

    -- lock the page, then its versions, in the publication core's own order.
    select w.title into v_old_title from clara.wiki_pages w where w.id=p.id for update;

    update clara.wiki_pages w set title=c_title, updated_at=now()
      where w.id=p.id and w.title is distinct from c_title;
    get diagnostics v_rows = row_count;
    v_title_upd := v_title_upd + v_rows;

    for v in
      select x.id, x.version_n, x.content, x.content_sha256, x.storage_key, x.size_bytes
        from clara.wiki_page_versions x
       where x.page_id=p.id order by x.version_n for update
    loop
      update clara.wiki_page_versions x
         set content=c_content, content_sha256=c_sha, storage_key=c_key, size_bytes=c_size
       where x.id=v.id
         and (x.content is distinct from c_content
           or x.content_sha256 is distinct from c_sha
           or x.storage_key is distinct from c_key
           or x.size_bytes is distinct from c_size);
      get diagnostics v_rows = row_count;
      v_versions := v_versions + v_rows;

      -- THE CORRECTION ENVELOPE. Top-level keys mirror wiki.page_published exactly, so a
      -- rebuild reuses one field mapping; `preimage` is audit-only and never replayed.
      perform clara._append_event(p.firm_id, 'wiki.page_canonicalized', p.client_id,
        null, null, null, null, v_doc, null,
        jsonb_build_object(
          'correction','a7_canonicalization',
          'reconstruction_schema',1,
          'page_id',p.id,'slug',p.slug,
          'version_id',v.id,'version_n',v.version_n,
          'title',c_title,'content',c_content,
          'content_sha256',c_sha,'storage_key',c_key,'size_bytes',c_size,
          'preimage',jsonb_build_object(
            'title',v_old_title,'content',v.content,
            'content_sha256',v.content_sha256,'storage_key',v.storage_key,
            'size_bytes',v.size_bytes)));
      v_events := v_events + 1;
    end loop;

    perform clara._audit(p.firm_id, null, null, null,
      'wave_b_0020_a7_canonicalization', null,
      jsonb_build_object('page_id',p.id,'slug',p.slug,'client',p.client_id,
        'preimage_title',v_old_title));
    v_pages := v_pages + 1;
  end loop;

  -- ---- 3. re-assert BOTH bridge directions the apply will run -----------------------
  select count(*) into v_n from clara.wiki_pages w
   where w.slug like 'sources/%'
     and (w.title is distinct from 'Source: '||substring(w.slug from 9)
          or exists(select 1 from clara.wiki_page_versions x
                     where x.page_id=w.id
                       and x.content is distinct from
                           'Source document: '||substring(w.slug from 9)));
  if v_n > 0 then
    raise exception 'A7 preflight: % page(s) STILL carry non-canonical bytes after canonicalization — 0020 direction 4 would abort', v_n;
  end if;

  select count(*), coalesce(string_agg(distinct c.slug, ', '),'<none>')
    into v_n, v_bad
    from (select w.id, w.firm_id, w.client_id, w.slug,
                 'Source: '||substring(w.slug from 9)                        as c_title,
                 encode(sha256(convert_to('Source document: '||substring(w.slug from 9),
                   'UTF8')),'hex')                                           as c_sha,
                 octet_length('Source document: '||substring(w.slug from 9)) as c_size
            from clara.wiki_pages w where w.slug like 'sources/%') c
    join clara.domain_events e
      on e.event_type in ('wiki.page_published','wiki.source_ingested')
     and e.payload->>'page_id' = c.id::text
   where ((e.payload ? 'title'          and e.payload->>'title'          is distinct from c.c_title)
       or (e.payload ? 'content_sha256' and e.payload->>'content_sha256' is distinct from c.c_sha)
       or (e.payload ? 'storage_key'    and e.payload->>'storage_key'    is distinct from
             'firms/'||c.firm_id::text||'/wiki/'||c.client_id::text||'/'||c.c_sha||'.md')
       or (e.payload ? 'size_bytes'     and e.payload->>'size_bytes'     is distinct from c.c_size::text))
     and not exists(
       select 1 from clara.domain_events k
        where k.firm_id=e.firm_id and k.event_type='wiki.page_canonicalized'
          and k.payload->>'page_id'=e.payload->>'page_id'
          and k.payload->>'version_id'=e.payload->>'version_id'
          and k.seq > e.seq);
  if v_n > 0 then
    raise exception 'A7 preflight: % stale reconstruction event(s) remain uncorrected — 0020 direction 5 would abort. Pages: %', v_n, v_bad;
  end if;

  raise notice 'A7 preflight: event type % (0=already present); % page(s) canonicalized; % title(s) rewritten; % version row(s) rewritten; % correction envelope(s) appended. Bridge directions 4 and 5 both clear.',
    v_type_new, v_pages, v_title_upd, v_versions, v_events;
end
$a7pre$;
