-- =====================================================================
-- Migration 0019 (the wiki authority boundary, WB-R21 · WB-R24(ii)) —
-- POST-DEPLOY VERIFY PROBES.  READ-ONLY.  Run as the OWNER/ceremony role.
--
-- WHY THIS FILE EXISTS AT ALL, given 0019 carries its own in-transaction tail:
-- the 0016 lesson — an in-txn tail proves THE APPLY, not the LIVE CATALOG. It runs
-- inside the migration's own transaction, against the state that transaction is
-- building. This file re-asserts the load-bearing subset from OUTSIDE, against the
-- committed live catalog, after PostgREST has reloaded. Both are needed; neither
-- replaces the other.
--
-- CONTRACT: docs/plan/wave-b-migration-0019-design.md §11 step 5 (post-DB verify).
-- RUNBOOK:  docs/ops/wave-b-0019-ceremony-runbook.md
--
-- USAGE (live env, DSN from the environment — NEVER in argv):
--     psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0019-postverify.sql
--
-- It raises on the FIRST failed invariant and prints a green line per section
-- otherwise. It writes NOTHING: every statement is a read, and the one forced
-- rollback probe is explicitly rolled back.
-- =====================================================================

\echo '=== 0019 post-verify — READ-ONLY ==='

-- ---------------------------------------------------------------------
-- 1. The migration is applied, and it is the highest.
-- ---------------------------------------------------------------------
do $$
declare v_n int; v_max text;
begin
  select count(*), max(version) into v_n, v_max from clara.schema_migrations;
  if not exists (select 1 from clara.schema_migrations where version = '0019_wiki_boundary') then
    raise exception 'POST-VERIFY 1: 0019_wiki_boundary is NOT applied (max=%, count=%)', v_max, v_n;
  end if;
  raise notice 'OK 1  0019 applied · % migrations total · max=%', v_n, v_max;
end $$;

-- ---------------------------------------------------------------------
-- 2. The veto helper is GONE, and BOTH authority bodies are wiki-clean
--    while STILL holding the client-row serializer (§1 — the lock the veto
--    took was the publication/retirement serializer; removing the wiki READ
--    must not have removed the ORDERING).
--    to_regprocedure, never to_regproc (0011:4132 idiom) — an overloaded
--    bare name resolves ambiguously and would hide a survivor.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_fn text;
begin
  if to_regprocedure('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') is not null then
    raise exception 'POST-VERIFY 2: the veto helper _assert_filing_wiki_unreferenced STILL EXISTS';
  end if;
  foreach v_fn in array array[
    'clara.retire_document_filing(uuid,text,uuid,text)',
    'clara.approve_wrong_client_correction(uuid,text,text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid = v_fn::regprocedure;
    if v_src ~* '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M' then
      raise exception 'POST-VERIFY 2: % still NAMES a wiki relation', v_fn;
    end if;
    if position('_assert_filing_wiki_unreferenced' in v_src) > 0 then
      raise exception 'POST-VERIFY 2: % still CALLS the dropped helper', v_fn;
    end if;
    if v_src !~* 'from\s+clara\.clients\s+\w*\s*where[^;]*for\s+update' then
      raise exception 'POST-VERIFY 2: % LOST its client-row FOR UPDATE serializer', v_fn;
    end if;
  end loop;
  raise notice 'OK 2  veto helper dropped · both authority fns wiki-clean · both still serialize on the client row';
end $$;

-- ---------------------------------------------------------------------
-- 3. The stale marker: columns, the paired-presence CHECKs, and the six
--    indexes the writer / lint / read predicates need (§2).
-- ---------------------------------------------------------------------
do $$
declare r text; c text; v_missing text := '';
begin
  foreach r in array array['wiki_page_citations','wiki_page_refs'] loop
    foreach c in array array['stale_at','stale_reason'] loop
      if not exists (select 1 from information_schema.columns
                     where table_schema='clara' and table_name=r and column_name=c) then
        v_missing := v_missing || format(' %s.%s', r, c);
      end if;
    end loop;
    if not exists (select 1 from pg_constraint
                   where conrelid = ('clara.'||r)::regclass and contype='c'
                     and pg_get_constraintdef(oid) ilike '%stale_at%is null%stale_reason%is null%') then
      raise exception 'POST-VERIFY 3: %.stale paired-presence CHECK missing', r;
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'POST-VERIFY 3: missing stale columns:%', v_missing;
  end if;
  foreach c in array array[
    'ix_wiki_citations_doc_live','ix_wiki_citations_stale','ix_wiki_citations_version',
    'ix_wiki_refs_doc_live','ix_wiki_refs_stale','ix_wiki_refs_page'
  ] loop
    if to_regclass('clara.'||c) is null then
      raise exception 'POST-VERIFY 3: index % missing', c;
    end if;
  end loop;
  raise notice 'OK 3  stale columns + paired CHECKs on both relations · all six indexes present';
end $$;

-- ---------------------------------------------------------------------
-- 4. The writer exists with the pinned identity, is a governed verb, and its
--    ACL is runtime-ONLY (§3). A grant to clara_authenticated / clara_agent_ro /
--    a wake role here would hand the marking capability to the wrong actor.
-- ---------------------------------------------------------------------
do $$
declare v_oid oid; v_owner text; v_cfg text[]; v_secdef bool; v_grantee text;
begin
  v_oid := to_regprocedure('clara.mark_wiki_citations_stale(uuid,uuid,text,text)');
  if v_oid is null then
    raise exception 'POST-VERIFY 4: mark_wiki_citations_stale is MISSING at its pinned signature';
  end if;
  select prosecdef, proconfig, pg_get_userbyid(proowner)
    into v_secdef, v_cfg, v_owner from pg_proc where oid = v_oid;
  if not v_secdef then raise exception 'POST-VERIFY 4: the writer is not SECURITY DEFINER'; end if;
  if v_owner <> 'clara_fn_owner' then
    raise exception 'POST-VERIFY 4: the writer is owned by %, not clara_fn_owner', v_owner;
  end if;
  if not exists (select 1 from unnest(coalesce(v_cfg,'{}')) x
                 where replace(x,' ','') = 'search_path=clara,pg_temp') then
    raise exception 'POST-VERIFY 4: the writer has no pinned search_path (got %)', v_cfg;
  end if;
  if has_function_privilege('public', v_oid, 'execute') then
    raise exception 'POST-VERIFY 4: PUBLIC holds EXECUTE on the writer';
  end if;
  foreach v_grantee in array array['clara_authenticated','clara_agent_ro'] loop
    if has_function_privilege(v_grantee, v_oid, 'execute') then
      raise exception 'POST-VERIFY 4: % holds EXECUTE on the writer — the ACL is runtime-ONLY', v_grantee;
    end if;
  end loop;
  if not has_function_privilege('clara_runtime', v_oid, 'execute') then
    raise exception 'POST-VERIFY 4: clara_runtime CANNOT execute the writer (the lane would dead-letter)';
  end if;
  raise notice 'OK 4  writer present · SECURITY DEFINER · fn_owner · search_path pinned · runtime-ONLY ACL';
end $$;

-- ---------------------------------------------------------------------
-- 5. NO new event type (§3, amendment 4). A client-scoped wiki event would
--    reach assert_books_current and the correction books-version check, handing
--    a projection-derived event an indirect veto over authority — the exact
--    inversion WB-R21 abolishes.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from clara.event_types where name = 'wiki.citations_staled') then
    raise exception 'POST-VERIFY 5: the DROPPED wiki.citations_staled event type EXISTS';
  end if;
  raise notice 'OK 5  no wiki.citations_staled event type';
end $$;

-- ---------------------------------------------------------------------
-- 6. The lint class 'stale_citation' is admitted by the CHECK (§6).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'clara.lint_findings'::regclass and contype='c'
                   and pg_get_constraintdef(oid) ilike '%stale_citation%') then
    raise exception 'POST-VERIFY 6: lint_findings.finding_kind does not admit stale_citation';
  end if;
  raise notice 'OK 6  lint class stale_citation admitted';
end $$;

-- ---------------------------------------------------------------------
-- 7. The runtime read surface was NOT widened (§0 · §11). clara_runtime must
--    still have NO SELECT on document_filings — that gap is precisely why the
--    catch-up splits into a ceremony-role scan + a runtime-role marking verb.
--    If this ever becomes true, the split was silently undone.
-- ---------------------------------------------------------------------
do $$
begin
  if has_table_privilege('clara_runtime', 'clara.document_filings', 'select') then
    raise exception 'POST-VERIFY 7: clara_runtime GAINED SELECT on document_filings — the boundary widened';
  end if;
  raise notice 'OK 7  clara_runtime still has NO SELECT on document_filings (no grant widened)';
end $$;

-- ---------------------------------------------------------------------
-- 8. The isolation floor is LIVE on the publication core (§1b) — a typed
--    CLR32/isolation_unsupported under REPEATABLE READ, and NOTHING under the
--    two safe levels. Proven FUNCTIONALLY, in a transaction that is rolled back.
--    (READ COMMITTED takes a fresh snapshot per statement; SERIALIZABLE is
--    STRICTER and must keep working — refusing it would be a regression.)
-- ---------------------------------------------------------------------
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = to_regprocedure('clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)');
  if v_src is null then
    raise exception 'POST-VERIFY 8: the publication core is missing at its pinned signature';
  end if;
  if position('isolation_unsupported' in v_src) = 0 then
    raise exception 'POST-VERIFY 8: the §1b REPEATABLE READ floor is ABSENT from the publication core';
  end if;
  if v_src !~* 'current_setting\(''transaction_isolation''\)\s*=\s*''repeatable read''' then
    raise exception 'POST-VERIFY 8: the isolation floor does not test transaction_isolation as specified';
  end if;
  raise notice 'OK 8  §1b isolation floor present on the publication core (RR refused; RC + SERIALIZABLE unaffected)';
end $$;

-- ---------------------------------------------------------------------
-- 9. The §9 closed set holds on the LIVE catalog: no clara function OUTSIDE
--    the whitelist names a wiki relation or carries a call edge into the wiki
--    set. NOT restricted to SECURITY DEFINER — an invoker helper called from a
--    patched definer runs with that definer's authority (ratchet R1 finding 4).
-- ---------------------------------------------------------------------
do $$
declare v_bad text;
begin
  select string_agg(sig, E'\n  ') into v_bad from (
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.oid not in (
         to_regprocedure('clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)'),
         to_regprocedure('clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'),
         to_regprocedure('clara.record_wiki_source_ingest(uuid,uuid,text,text)'),
         to_regprocedure('clara.retire_wiki_page(uuid,text,text)'),
         to_regprocedure('clara.set_wiki_synthesis_hold(uuid,text,text)'),
         to_regprocedure('clara.clear_wiki_synthesis_hold(uuid,text)'),
         to_regprocedure('clara.get_wiki_page(uuid,text)'),
         to_regprocedure('clara.list_wiki_pages(uuid)'),
         to_regprocedure('clara.get_context_pack(uuid,text)'),
         to_regprocedure('clara.run_client_lint(uuid,text)'),
         to_regprocedure('clara.run_lint_all(text)'),
         to_regprocedure('clara.mark_wiki_citations_stale(uuid,uuid,text,text)')
       )
       and (p.prosrc ~* '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M'
            or p.prosrc ~* '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale|_assert_filing_wiki_unreferenced)\M')
     order by 1
  ) t;
  if v_bad is not null then
    raise exception E'POST-VERIFY 9: clara functions OUTSIDE the wiki whitelist touch the wiki set:\n  %', v_bad;
  end if;
  raise notice 'OK 9  closed set holds on the live catalog (all clara fns scanned, not just definers)';
end $$;

-- ---------------------------------------------------------------------
-- 10. Every wiki-page LOCKER takes the CLIENT row before the PAGE row
--     (ratchet R2 finding B1). Exactly three sites in the schema lock a
--     wiki_pages row; a fourth appearing without the shared prefix would be a
--     deadlock waiting to happen — retire_wiki_page is NOT a wait-for-graph
--     leaf (it requests firm_event_seq via _append_event after taking its page).
--
--     TWO THINGS THIS PROBE MUST GET RIGHT, both learned by getting them wrong:
--       (a) compare the position of the ROW LOCKS, never of the table NAMES.
--           §3a deliberately reads clara.wiki_pages UNLOCKED first, to discover
--           which client row to lock — so the first textual `wiki_pages` in
--           retire_wiki_page is by design, and a name-position test false-fails.
--       (b) strip comments before locating anything (ratchet R3 finding F7): a
--           commented-out lock is not a lock. Literals are stripped too.
--     The authoritative stripped-source assertion lives in the rig battery; this
--     is its live-catalog smoke check.
-- ---------------------------------------------------------------------
do $$
declare v_fn text; v_src text; v_clean text; v_cl int; v_pg int;
begin
  foreach v_fn in array array[
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)',
    'clara.retire_wiki_page(uuid,text,text)',
    'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid = v_fn::regprocedure;
    if v_src is null then raise exception 'POST-VERIFY 10: % is missing', v_fn; end if;
    -- block comments, then line comments, then single-quoted literals
    v_clean := regexp_replace(v_src,   '/\*.*?\*/', ' ', 'gs');
    v_clean := regexp_replace(v_clean, '--[^\n]*',  ' ', 'g');
    v_clean := regexp_replace(v_clean, '''[^'']*''', ' ', 'g');
    -- a LOCK = the relation named, then `for update` before the statement ends
    v_cl := regexp_instr(v_clean, 'clara\.clients[^;]*?for\s+update', 1, 1, 0, 'i');
    v_pg := regexp_instr(v_clean, 'clara\.wiki_pages[^;]*?for\s+update', 1, 1, 0, 'i');
    if v_cl = 0 then
      raise exception 'POST-VERIFY 10: % takes NO clara.clients row lock', v_fn;
    end if;
    if v_pg = 0 then
      raise exception 'POST-VERIFY 10: % takes NO clara.wiki_pages row lock', v_fn;
    end if;
    if v_cl > v_pg then
      raise exception 'POST-VERIFY 10: % LOCKS wiki_pages before clients — the shared client->page prefix is broken (deadlock risk)', v_fn;
    end if;
  end loop;
  raise notice 'OK 10 all three wiki_pages lockers take the client ROW LOCK first (shared prefix intact)';
end $$;

\echo '=== 0019 post-verify: ALL PROBES PASSED ==='
