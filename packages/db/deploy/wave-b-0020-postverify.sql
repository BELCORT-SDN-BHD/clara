-- =====================================================================
-- Migration 0020 (typed egress consent + dispatch authorization, WB-R23) —
-- POST-DEPLOY VERIFY PROBES.  READ-ONLY.  Run as the OWNER/ceremony role.
--
-- WHY THIS FILE EXISTS. 0020 carries a §8 in-transaction tail, and the ceremony
-- runbook lists a post-verify checklist in PROSE. Neither is enough on its own:
-- the tail proves THE APPLY (it runs inside the migration's own transaction,
-- against the state that transaction is building — the 0016 lesson), and a prose
-- checklist is a list of things an operator may or may not translate correctly at
-- 2am. 0019 shipped an executable file for exactly this reason and it caught
-- nothing on the night — which is the point: it made "10/10 green" mean something
-- a human did not have to hand-assemble. This is 0020's.
--
-- CONTRACT: docs/plan/wave-b-migration-0020-design.md §10.3 step 3.
-- RUNBOOK:  docs/ops/wave-b-0020-ceremony-runbook.md §7.
--
-- USAGE (live env, DSN from the environment — NEVER in argv):
--     psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-postverify.sql
--
-- It raises on the FIRST failed invariant and prints a green line per section
-- otherwise. It writes NOTHING — every statement is a read. Safe inside
-- `begin read only`, which is the cheap total proof of that (a write raises 25006).
--
-- NOT COVERED HERE, deliberately: the probes that need a live wake credential or
-- the clara.pack_consumer='v25' marker (a `clara_runtime`-role publish refusal, a
-- context-pack read). Those are runtime-lane checks, not catalog checks; §8 of the
-- runbook covers them through the runtime's own /ready and the DARK observation.
-- A probe that cannot be executed as written is a probe that gets skipped.
-- =====================================================================

-- NO psql meta-commands anywhere in this file: the 19->20 upgrade fixture runs it
-- VERBATIM through node-postgres, which cannot parse them. Section banners are RAISE
-- NOTICE so the file is client-agnostic and CI exercises the thing the owner runs.
do $$ begin raise notice '=== 0020 post-verify - READ-ONLY ==='; end $$;

-- ---------------------------------------------------------------------
-- 1. The migration is actually at 20, and 0019 is still there.
-- ---------------------------------------------------------------------
do $$
declare v text;
begin
  select max(version) into v from clara.schema_migrations;
  if v <> '0020_typed_consent' then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — 0020 is not the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations where version='0019_wiki_boundary') then
    raise exception 'POST-VERIFY 1: 0019 is missing from the history';
  end if;
  raise notice 'OK 1  at 0020_typed_consent, 0019 intact';
end $$;

-- ---------------------------------------------------------------------
-- 2. The three new relations EXIST and are EMPTY — and "empty" is only
--    meaningful because we just proved they exist. A half-applied migration
--    that created nothing would otherwise pass an emptiness check vacuously.
-- ---------------------------------------------------------------------
do $$
declare r text; n bigint; v_missing text := '';
begin
  foreach r in array array['client_egress_purpose_consents',
                           'client_egress_purpose_activations',
                           'egress_dispatch_authorizations'] loop
    if to_regclass('clara.'||r) is null then
      v_missing := v_missing || case when v_missing='' then '' else ', ' end || r;
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'POST-VERIFY 2: new relation(s) % were not created', v_missing;
  end if;
  foreach r in array array['client_egress_purpose_consents',
                           'client_egress_purpose_activations',
                           'egress_dispatch_authorizations'] loop
    execute format('select count(*) from clara.%I', r) into n;
    if n <> 0 then
      raise exception 'POST-VERIFY 2: clara.% is NOT empty (% row(s)) — the deploy is not DARK', r, n;
    end if;
  end loop;
  raise notice 'OK 2  all three typed-consent relations exist and are EMPTY';
end $$;

-- ---------------------------------------------------------------------
-- 3. NO application-role TABLE grant on any consent relation. The runtime
--    reaches consent state ONLY through the DEFINER verbs; a table grant would
--    make the whole two-phase authorization decorative.
-- ---------------------------------------------------------------------
--    READ IT FROM pg_class.relacl, NOT information_schema. `role_table_grants` only shows
--    rows where the querying role is the grantor, the grantee, or a member of the grantee —
--    so on a cluster where the ceremony role does NOT inherit the table owner it returns
--    nothing and this probe would FAIL OPEN. It happens not to bite here (live's `postgres`
--    inherits clara_fn_owner, which owns these tables, and sees all seven rows), but a probe
--    whose soundness rests on an incidental membership edge is one refactor from silent.
--    relacl IS NULL means "default privileges only" — owner-only, nothing granted away.
do $$
declare v_bad text;
begin
  select string_agg(format('%s -> %s (%s)', t.relname, t.grantee, t.priv), E'\n  ')
    into v_bad
    from (select c.relname, pg_get_userbyid(a.grantee) as grantee, a.privilege_type as priv
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace,
                 lateral aclexplode(c.relacl) a
           where n.nspname = 'clara'
             and c.relname in ('client_egress_purpose_consents',
                               'client_egress_purpose_activations',
                               'egress_dispatch_authorizations','client_egress_consents')
             and (a.grantee = 0            -- 0 = PUBLIC
                  or pg_get_userbyid(a.grantee) in
                       ('clara_runtime','clara_authenticated','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive'))) t;
  if v_bad is not null then
    raise exception E'POST-VERIFY 3: application roles hold TABLE grants on consent relations:\n  %', v_bad;
  end if;
  raise notice 'OK 3  no application-role table grant on any consent relation (read from relacl, not information_schema)';
end $$;

-- ---------------------------------------------------------------------
-- 4. The nine 0020 verbs exist AT THEIR EXACT SIGNATURES. The arity matters:
--    amendment A1 made consume_egress_dispatch SIX arguments so the
--    authorization is bound to the dispatch being performed. An image carrying
--    the two-argument consume would otherwise appear to have the surface it
--    needs — which is why the runtime guards use to_regprocedure, not to_regproc.
-- ---------------------------------------------------------------------
do $$
declare s text; v_missing text := ''; n int := 0;
begin
  foreach s in array array[
    'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)',
    'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)',
    'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)',
    'clara.classify_consent_evidence_document(uuid,text,text)',
    'clara.resolve_document_client(uuid,uuid)',
    'clara.resolve_and_ingest_wiki_source(uuid,uuid)'
  ] loop
    if to_regprocedure(s) is null then
      v_missing := v_missing || case when v_missing='' then '' else E'\n  ' end || s;
    else n := n + 1;
    end if;
  end loop;
  if v_missing <> '' then
    raise exception E'POST-VERIFY 4: 0020 verb(s) absent at their exact signature:\n  %', v_missing;
  end if;
  raise notice 'OK 4  all % 0020 verbs present at their EXACT signatures (A1 six-arg consume included)', n;
end $$;

-- ---------------------------------------------------------------------
-- 4b. …and they are GOVERNED VERBS, not merely present. Existence is the weak
--     half: the entire authorization story is "the runtime reaches consent state
--     ONLY through these DEFINER functions", which is worth nothing if one landed
--     as SECURITY INVOKER, owned by the wrong role, without a pinned search_path,
--     or executable by PUBLIC. 0019's post-verify checked all four properties for
--     its single new writer; nine verbs deserve the same. (A `revoke from public`
--     that silently no-oped is a real Clara precedent — see the C-1 law.)
-- ---------------------------------------------------------------------
do $$
declare s text; v_bad text := ''; r record; n int := 0;
begin
  foreach s in array array[
    'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)',
    'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)',
    'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)',
    'clara.classify_consent_evidence_document(uuid,text,text)',
    'clara.resolve_document_client(uuid,uuid)',
    'clara.resolve_and_ingest_wiki_source(uuid,uuid)'
  ] loop
    select p.prosecdef,
           pg_get_userbyid(p.proowner) as owner,
           coalesce(array_to_string(p.proconfig,','),'') as cfg,
           coalesce((select string_agg(pg_get_userbyid(a.grantee),',')
                       from aclexplode(p.proacl) a where a.grantee = 0),'') as public_exec
      into r
      from pg_proc p where p.oid = to_regprocedure(s);
    if not r.prosecdef then
      v_bad := v_bad || format(E'\n  %s is SECURITY INVOKER', s);
    end if;
    if r.owner <> 'clara_fn_owner' then
      v_bad := v_bad || format(E'\n  %s is owned by %s, not clara_fn_owner', s, r.owner);
    end if;
    -- NOTE the whitespace strip: PostgreSQL stores the GUC as `search_path=clara, pg_temp`,
    -- with a space after the comma. Matching the un-normalized string fails on all nine
    -- correctly-pinned verbs. Fail-closed, so the bug announced itself — the opposite spelling
    -- (`like '%search_path%'`) would have passed vacuously and proved nothing.
    if replace(r.cfg,' ','') not like '%search_path=clara,pg_temp%' then
      v_bad := v_bad || format(E'\n  %s has no pinned search_path (proconfig=%s)', s, coalesce(nullif(r.cfg,''),'<none>'));
    end if;
    if r.public_exec <> '' then
      v_bad := v_bad || format(E'\n  %s is EXECUTABLE BY PUBLIC', s);
    end if;
    n := n + 1;
  end loop;
  if v_bad <> '' then
    raise exception 'POST-VERIFY 4b: 0020 verb(s) are not governed as designed:%', v_bad;
  end if;
  raise notice 'OK 4b all % verbs are SECURITY DEFINER, owned by clara_fn_owner, search_path-pinned, and not PUBLIC-executable', n;
end $$;

-- ---------------------------------------------------------------------
-- 5. (A5) clara.wiki_budgets is a FIVE-row set: the four WB-R8 values
--    UNCHANGED plus max_source_pages_per_client. Values pinned, not just keys —
--    a retuned cap is a config decision, not a deploy side effect.
-- ---------------------------------------------------------------------
do $$
declare v_got text; v_want constant text :=
  'max_page_bytes=8192|max_pages_per_client=40|max_source_pages_per_client=50000|pack_max_bytes=12288|pack_max_pages=6';
begin
  select string_agg(budget_key||'='||value_int::text,'|' order by budget_key)
    into v_got from clara.wiki_budgets;
  if v_got is distinct from v_want then
    raise exception E'POST-VERIFY 5: wiki_budgets is\n  %\nexpected\n  %', coalesce(v_got,'<empty>'), v_want;
  end if;
  raise notice 'OK 5  wiki_budgets is the five-row set with the four WB-R8 values unchanged';
end $$;

-- ---------------------------------------------------------------------
-- 6. (A8) EXACTLY four wiki.* event types, and wiki.page_canonicalized is
--    client-scoped with decision 'ignore' in the ACTIVE taxonomy. This holds
--    whether or not the preflight ran: it registers the identical row at 19 and
--    the migration registers it `on conflict do nothing` at 20, so a database
--    that needed remediation and one that did not CONVERGE on the same catalog.
-- ---------------------------------------------------------------------
do $$
declare v_got text; v_scoped boolean; v_decision text;
begin
  select string_agg(name,',' order by name) into v_got
    from clara.event_types where name like 'wiki.%';
  if v_got is distinct from 'wiki.page_canonicalized,wiki.page_published,wiki.page_retired,wiki.source_ingested' then
    raise exception 'POST-VERIFY 6: wiki.* event types are [%] — expected exactly the four', coalesce(v_got,'<none>');
  end if;
  select client_scoped into v_scoped from clara.event_types where name='wiki.page_canonicalized';
  if not v_scoped then
    raise exception 'POST-VERIFY 6: wiki.page_canonicalized is not client_scoped';
  end if;
  select t.decision into v_decision
    from clara.trigger_taxonomy t join clara.taxonomy_active a on a.version=t.version
   where t.event_type='wiki.page_canonicalized';
  if v_decision is distinct from 'ignore' then
    raise exception 'POST-VERIFY 6: wiki.page_canonicalized taxonomy decision is % — expected ignore', coalesce(v_decision,'<absent>');
  end if;
  raise notice 'OK 6  exactly four wiki.* event types; the correction type is client-scoped/ignore in the ACTIVE taxonomy';
end $$;

-- ---------------------------------------------------------------------
-- 7. THE BRIDGE, RE-READ AS A RECEIPT. All five directions must read zero on
--    the committed catalog. The apply aborts on any of them, so a green apply
--    has already proven this — re-reading it from OUTSIDE the transaction is
--    what makes it evidence about PRODUCTION rather than about the apply.
-- ---------------------------------------------------------------------
do $$
declare d1 bigint; d2 bigint; d3 bigint; d4 bigint; d5 bigint; n bigint;
begin
  select count(*) into d1 from clara.wiki_pages p where p.slug like 'sources/%'
    and not exists(select 1 from clara.wiki_log l where l.page_id=p.id and l.action='ingest');
  select count(*) into d2 from clara.wiki_pages p where p.slug not like 'sources/%'
    and exists(select 1 from clara.wiki_log l where l.page_id=p.id and l.action='ingest');
  select count(*) into d3 from clara.wiki_pages p where p.slug like 'sources/%'
    and exists(select 1 from clara.wiki_log l where l.page_id=p.id and l.action='publish');
  select count(*) into d4 from clara.wiki_pages p where p.slug like 'sources/%'
    and (p.title is distinct from 'Source: '||substring(p.slug from 9)
         or exists(select 1 from clara.wiki_page_versions v where v.page_id=p.id
                    and v.content is distinct from 'Source document: '||substring(p.slug from 9)));
  select count(*) into d5
    from (select w.id, w.firm_id, w.client_id, w.slug,
                 'Source: '||substring(w.slug from 9) as c_title,
                 encode(sha256(convert_to('Source document: '||substring(w.slug from 9),'UTF8')),'hex') as c_sha,
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
     and not exists(select 1 from clara.domain_events k
        where k.firm_id=e.firm_id and k.event_type='wiki.page_canonicalized'
          and k.payload->>'page_id'=e.payload->>'page_id'
          and k.payload->>'version_id'=e.payload->>'version_id' and k.seq > e.seq);
  if (d1+d2+d3+d4+d5) > 0 then
    raise exception 'POST-VERIFY 7: bridge directions are NOT clear post-apply — d1=% d2=% d3=% d4=% d5=%', d1,d2,d3,d4,d5;
  end if;
  select count(*) into n from clara.wiki_pages where slug like 'sources/%';
  raise notice 'OK 7  all five bridge directions read ZERO on the live catalog (% source page(s))', n;
end $$;

-- ---------------------------------------------------------------------
-- 8. THE DARK RECEIPT, from the DB side. With the typed relations empty,
--    prepare_egress_dispatch must return the SAME payload for every client and
--    every purpose — including a client holding a LIVE LEGACY purpose-blind
--    consent, which is the case that would expose a bleed. It is a plain read;
--    it mints nothing (probe 2 re-runs below to prove that).
-- ---------------------------------------------------------------------
--    NON-VACUITY, made structural. An earlier draft looped `status='active'` clients only.
--    The bleed case IS the legacy-consent client, so if that client were archived the loop
--    would skip the only row that can prove anything and still print ALL PROBES PASSED. So:
--    the loop covers every client HOLDING A LIVE LEGACY CONSENT regardless of status, and the
--    probe raises if the corpus contains no such client at all — because on this database
--    there is one, and its silent disappearance means the probe stopped testing the thing it
--    is named for.
do $$
declare r record; v_first jsonb; v_n int := 0; v_legacy int := 0;
begin
  for r in
    select c.id, c.firm_id, c.name, c.status,
           exists(select 1 from clara.client_egress_consents e
                   where e.client_id=c.id and e.revoked_at is null) as legacy
      from clara.clients c
     where c.status='active'
        or exists(select 1 from clara.client_egress_consents e
                   where e.client_id=c.id and e.revoked_at is null)
     order by c.name
  loop
    declare v jsonb;
    begin
      v := clara.prepare_egress_dispatch(r.firm_id, r.id, 'wiki_synthesis', 1, 'entry.approved');
      if v_first is null then v_first := v; end if;
      if v is distinct from v_first then
        raise exception 'POST-VERIFY 8: prepare_egress_dispatch is NOT byte-identical across clients — % returned % vs %', r.name, v, v_first;
      end if;
      if v->>'verdict' is distinct from 'unknown' or (v->'authorization_id') is distinct from 'null'::jsonb then
        raise exception 'POST-VERIFY 8: DARK is BROKEN — % returned %', r.name, v;
      end if;
      v_n := v_n + 1;
      if r.legacy then v_legacy := v_legacy + 1; end if;
    end;
  end loop;
  if v_n = 0 then
    raise exception 'POST-VERIFY 8: no client was probed at all — this receipt is vacuous';
  end if;
  if v_legacy = 0 and exists(select 1 from clara.client_egress_consents where revoked_at is null) then
    raise exception 'POST-VERIFY 8: a LIVE legacy consent exists but no probed client carried it — the bleed case was skipped and this receipt does not mean what it says';
  end if;
  raise notice 'OK 8  DARK holds: % client(s) all return {"verdict":"unknown","authorization_id":null}, byte-identical (% of them hold a LIVE legacy purpose-blind consent — the case a bleed would expose)', v_n, v_legacy;
end $$;

-- ---------------------------------------------------------------------
-- 9. The probes above MINTED NOTHING. prepare_egress_dispatch on an
--    unauthorized client must be a pure read — if it had reserved an
--    authorization row per call, probe 8 would have written once per client.
-- ---------------------------------------------------------------------
do $$
declare n bigint;
begin
  select count(*) into n from clara.egress_dispatch_authorizations;
  if n <> 0 then
    raise exception 'POST-VERIFY 9: probe 8 MINTED % authorization row(s) — prepare must not write on an unauthorized verdict', n;
  end if;
  raise notice 'OK 9  the DARK probe minted nothing — egress_dispatch_authorizations still empty';
end $$;

-- ---------------------------------------------------------------------
-- 10. The LEGACY relation is structurally untouched, and its gate still
--     answers. 0020's §8 tail pins the legacy structure by definition hash
--     inside the apply; this re-reads the load-bearing consequence from
--     outside: the invoice-facts lane's predicate is a plain live-row test on
--     clara.client_egress_consents, and it must still discriminate.
-- ---------------------------------------------------------------------
do $$
declare v_live int; v_total int; v_grants text;
begin
  if to_regclass('clara.client_egress_consents') is null then
    raise exception 'POST-VERIFY 10: the legacy relation is GONE';
  end if;
  select count(*) filter (where revoked_at is null), count(*)
    into v_live, v_total from clara.client_egress_consents;
  -- relacl again, for the same reason as probe 3: information_schema would hide this from a
  -- ceremony role that does not inherit the owner.
  select string_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type, ',') into v_grants
    from pg_class c join pg_namespace n on n.oid = c.relnamespace,
         lateral aclexplode(c.relacl) a
   where n.nspname='clara' and c.relname='client_egress_consents'
     and a.grantee <> c.relowner;
  if v_grants is not null then
    raise exception 'POST-VERIFY 10: the legacy relation gained a non-owner table grant: %', v_grants;
  end if;
  raise notice 'OK 10 legacy relation intact — % live row(s) of % total, no new table grant; the invoice-facts predicate still answers', v_live, v_total;
end $$;

do $$ begin raise notice '=== 0020 post-verify: ALL PROBES PASSED ==='; end $$;
