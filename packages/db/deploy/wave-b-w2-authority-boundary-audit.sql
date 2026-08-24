-- =====================================================================
-- wave-b-w2-authority-boundary-audit.sql
-- GATE W2 — THE WIKI AUTHORITY BOUNDARY, AUDITED ON THE LIVE CATALOG.
-- READ-ONLY.  Run as the OWNER/ceremony role.  Writes nothing.
--
--   psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-w2-authority-boundary-audit.sql
--
-- WB-R6 makes four structural claims. This file closes the two that are
-- decidable from the catalog, and says plainly which two are not:
--
--   (1) no gate/bound/floor/autopost fn reads wiki tables   -> PROBES 1-4 (closed here)
--   (2) pre-v7 consumers never see the wiki block           -> PROBE 5, STRUCTURAL half
--   (3) a draft's authority path is bit-identical with and
--       without wiki content                               -> implied by (1); the
--                                                             EMPIRICAL half needs a
--                                                             live draft journey
--   (4) a wiki-informed draft carries the wiki citation in
--       its visible reasoning                              -> needs a live draft journey
--
-- (3) and (4) require a real wake credential and a real draft. They are NOT
-- assertable from a read-only catalog session and this file does not pretend
-- to: `get_context_pack` refuses a simulated wake context with "no valid agent
-- read context", which is the correct behaviour and the reason the behavioural
-- half is a journey, not a probe. Recording them as closed on the strength of
-- what is below would be the exact defect class ratchet R5 found — a document
-- claiming a property the code was never shown to have.
--
-- WHY THIS RUNS NOW. Ruling WB-R21 let Gate W2's dependency audit run INTERIM
-- with exactly two known deviations: the `_assert_filing_wiki_unreferenced`
-- EXISTS-veto reached from `approve_wrong_client_correction` and
-- `retire_document_filing`. Migration 0019 removed the veto and replaced it
-- with event-driven projection-side stale marking, so the closed set of known
-- deviations is now EMPTY and the audit runs clean rather than interim.
-- Probe 1 asserts the veto is gone rather than assuming it.
-- =====================================================================

\echo '=== Gate W2 — wiki authority boundary audit (read-only) ==='

-- ---------------------------------------------------------------------
-- The two families, defined once. Both are word-bounded so `wiki_pages_total`
-- in a comment cannot masquerade as a relation reference, and `get_wiki_page`
-- is not matched by a substring of `get_wiki_page_history`.
-- ---------------------------------------------------------------------
-- v_relrx  — the seven wiki RELATIONS (0017:5961-5963).
-- v_callrx — the twelve audited wiki VERBS. A function that calls one of these
--            reaches wiki state without naming a relation, which is exactly the
--            unaudited-wrapper shape WB-R21 abolishes; it counts as a touch.

-- ---------------------------------------------------------------------
-- 1. The 0019 deviation is GONE. WB-R21's interim allowance expires here.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regproc('clara._assert_filing_wiki_unreferenced') is not null then
    raise exception 'W2/1: the R2-F2 EXISTS-veto _assert_filing_wiki_unreferenced STILL EXISTS — the audit is still INTERIM under WB-R21, not clean. This database predates migration 0019.';
  end if;
  raise notice 'OK 1  the R2-F2 veto is removed — WB-R21''s known-deviation set is EMPTY';
end $$;

-- ---------------------------------------------------------------------
-- 2. THE DEPENDENCY AUDIT. Every clara function that reaches wiki state — by
--    naming a relation OR by calling an audited verb — is one of the twelve.
--    Scanned over ALL clara functions, not just SECURITY DEFINER ones: an
--    invoker helper called from a definer runs with that definer's authority
--    (0019 ratchet R1 finding 4), so restricting the scan would leave the
--    cheapest bypass unexamined.
-- ---------------------------------------------------------------------
do $$
declare
  v_relrx  constant text := '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M';
  v_callrx constant text := '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\M';
  v_family constant text[] := array[
    'clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)',
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)',
    'clara.record_wiki_source_ingest(uuid,uuid,text,text)',
    'clara.retire_wiki_page(uuid,text,text)',
    'clara.set_wiki_synthesis_hold(uuid,text,text)',
    'clara.clear_wiki_synthesis_hold(uuid,text)',
    'clara.get_wiki_page(uuid,text)',
    'clara.list_wiki_pages(uuid)',
    'clara.get_context_pack(uuid,text)',
    'clara.run_client_lint(uuid,text)',
    'clara.run_lint_all(text)',
    'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'
  ];
  -- Later-migration AUTHORIZED CALLERS: they CALL an audited verb and name no
  -- relation. Kept identical in spirit to the 0019 post-verify probe 9 set — a
  -- migration that adds one MUST add it here, in that same commit.
  v_callers constant text[] := array[
    'clara.resolve_and_ingest_wiki_source(uuid,uuid)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)'
  ];
  v_allowed oid[] := '{}';
  v_sig text; v_oid oid; v_src text; v_bad text; v_n int := 0; v_c int := 0;
begin
  foreach v_sig in array (v_family || v_callers) loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is not null then v_allowed := v_allowed || v_oid; end if;
  end loop;

  select string_agg(sig, E'\n  '), count(*) into v_bad, v_n from (
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and not (p.oid = any(v_allowed))
       and (p.prosrc ~* v_relrx or p.prosrc ~* v_callrx)
     order by 1) t;
  if v_bad is not null then
    raise exception E'W2/2: % clara function(s) OUTSIDE the wiki family reach wiki state:\n  %', v_n, v_bad;
  end if;

  -- The teeth for the callers: call edges only, never relation access.
  foreach v_sig in array v_callers loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then continue; end if;
    v_c := v_c + 1;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if v_src ~* v_relrx then
      raise exception 'W2/2: authorized caller % NAMES a wiki relation directly', v_sig;
    end if;
    if v_src !~* v_callrx then
      raise exception 'W2/2: % is enumerated as an authorized caller but calls NO audited wiki verb — stale entry', v_sig;
    end if;
  end loop;

  raise notice 'OK 2  dependency audit CLEAN — every wiki touch in the schema is one of the twelve audited verbs (% authorized caller(s), call-edge-only)', v_c;
end $$;

-- ---------------------------------------------------------------------
-- 3. THE GATE'S LITERAL CLAIM, stated directly rather than inferred. Probe 2
--    proves the inverse (nothing outside the family touches wiki), which does
--    subsume this — but WB-R6(1) names the AUTHORITY family, so name it. A
--    function in the list that has been renamed away is a drift failure, not a
--    silent pass: an audit that scans an empty set proves nothing.
-- ---------------------------------------------------------------------
do $$
declare
  v_relrx  constant text := '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M';
  v_callrx constant text := '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\M';
  -- F-A2 PR-3 retires execute_rule_post, propose_coding_rule, sign_coding_rule,
  -- propose_autopost_rule, sign_autopost_rule and reconcile_autopost_rules whole
  -- (docs/plan/active/f-a2-agentic-posting-design.md Annex B.1) -- removed here
  -- (Annex B.5) so the next W2 audit does not scan for six functions that no
  -- longer exist. tick_seeding_proposal STAYS: it survives, recut (OQ-3/D36), and
  -- must still reach NO wiki state directly (WB-R6(1)) -- this census re-proves that.
  v_auth constant text[] := array[
    'retire_document_filing','approve_wrong_client_correction',
    '_approve_entry_core','_draft_entry_core','draft_entry','wake_draft_entry',
    'approve_entry',
    '_assert_supplier_bill_shape','is_high_stakes','assert_client_resolved',
    'assert_books_current','assert_provenance','_open_question_blocks',
    'evaluate_sst_watch','coding_lane',
    'create_opening_seed','draft_opening_item','record_opening_target',
    'record_opening_targets_parsed','approve_opening_seed','_approve_opening_entry',
    'supersede_opening_item','approve_opening_correction','reopen_opening_seed',
    'seed_fixed_asset','_assert_opening_tie','_assert_fa_baseline',
    'create_seeding_batch','tick_seeding_proposal','decline_seeding_proposal',
    'complete_seeding_batch'
  ];
  v_name text; v_missing text := ''; v_bad text := ''; v_n int := 0;
begin
  foreach v_name in array v_auth loop
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='clara' and p.proname=v_name) then
      v_missing := v_missing || case when v_missing='' then '' else ', ' end || v_name;
      continue;
    end if;
    for v_name in
      select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname=v_name
         and (p.prosrc ~* v_relrx or p.prosrc ~* v_callrx)
    loop
      v_bad := v_bad || case when v_bad='' then '' else ', ' end || v_name;
    end loop;
    v_n := v_n + 1;
  end loop;
  if v_missing <> '' then
    raise exception 'W2/3: authority function(s) % do not exist — the audit would scan a short set and pass vacuously. Reconcile the list against the schema.', v_missing;
  end if;
  if v_bad <> '' then
    raise exception 'W2/3: authority function(s) % reach wiki state — WB-R6(1) is VIOLATED', v_bad;
  end if;
  raise notice 'OK 3  all % named authority functions exist and NONE reaches wiki state (WB-R6(1))', v_n;
end $$;

-- ---------------------------------------------------------------------
-- 4. NON-VACUITY. A scan that cannot detect a violation is not evidence. Both
--    regexes are asserted against known positives drawn from the LIVE catalog
--    (not a synthetic string): the family must be detected by the very patterns
--    probe 3 used to clear the authority set. If a future refactor renames the
--    relations, this fails loudly instead of clearing everything.
-- ---------------------------------------------------------------------
do $$
declare
  v_relrx  constant text := '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M';
  v_callrx constant text := '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\M';
  v_rel int; v_call int; v_tables int;
begin
  select count(*) into v_rel from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.prosrc ~* v_relrx;
  select count(*) into v_call from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and p.prosrc ~* v_callrx;
  select count(*) into v_tables from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relkind='r'
     and c.relname in ('wiki_pages','wiki_page_versions','wiki_page_citations',
                       'wiki_page_refs','wiki_log','wiki_budgets','wiki_synthesis_holds');
  if v_tables <> 7 then
    raise exception 'W2/4: expected 7 wiki relations in the schema, found % — the relation regex is scanning for names that no longer exist, so probe 3 would clear everything vacuously', v_tables;
  end if;
  if v_rel = 0 or v_call = 0 then
    raise exception 'W2/4: the scan detects NOTHING (relation hits=%, call hits=%) — probe 3 passed vacuously', v_rel, v_call;
  end if;
  raise notice 'OK 4  the scan is non-vacuous: 7 wiki relations exist; % fn(s) name one, % fn(s) carry a call edge', v_rel, v_call;
end $$;

-- ---------------------------------------------------------------------
-- 5. WB-R6(2) — pre-v7 consumers never see the wiki block. STRUCTURAL HALF.
--
--    The gate lives in three places and all three must be present:
--      * get_wiki_page and list_wiki_pages refuse a claim-less caller unless
--        clara.pack_consumer='v25' AND the effective role is clara_runtime;
--      * get_context_pack emits its 'wiki' key only for p_purpose='wiki_coding'
--        AND (no wake secret, i.e. a human session, OR pack_consumer='v25').
--    A pre-v7 wake consumer carries a wake secret and no v25 marker, so it
--    satisfies neither disjunct and the key is never built.
--
--    This is the STRUCTURAL half only. The behavioural half — call the pack as
--    a real pre-v7 wake consumer and observe no 'wiki' key — needs a valid wake
--    credential; a simulated one is refused with "no valid agent read context",
--    correctly. That half belongs to the live journey, with (3) and (4).
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_n int := 0;
begin
  foreach v_src in array array['clara.get_wiki_page(uuid,text)','clara.list_wiki_pages(uuid)'] loop
    if to_regprocedure(v_src) is null then
      raise exception 'W2/5: % does not exist', v_src;
    end if;
    declare v_body text;
    begin
      select prosrc into v_body from pg_proc where oid = to_regprocedure(v_src);
      if v_body !~ 'clara\.pack_consumer' or v_body !~ 'v25' then
        raise exception 'W2/5: % does not gate on the v25 pack_consumer marker', v_src;
      end if;
      if v_body !~ 'clara_runtime' then
        raise exception 'W2/5: % gates on the marker but not on the runtime role — a marker alone must not authorize', v_src;
      end if;
      v_n := v_n + 1;
    end;
  end loop;

  select prosrc into v_src from pg_proc where oid = 'clara.get_context_pack(uuid,text)'::regprocedure;
  if v_src !~ '''wiki''' then
    raise exception 'W2/5: get_context_pack builds no wiki block at all — the pack is not at v4';
  end if;
  if v_src !~ 'wiki_coding' then
    raise exception 'W2/5: get_context_pack''s wiki block is not gated on the wiki_coding purpose';
  end if;
  if v_src !~ 'clara\.pack_consumer' or v_src !~ 'clara\.wake_secret' then
    raise exception 'W2/5: get_context_pack''s wiki block does not discriminate a pre-v7 wake consumer (it must test BOTH clara.wake_secret and clara.pack_consumer)';
  end if;
  raise notice 'OK 5  (STRUCTURAL) the v25 marker + runtime role gate is present on % read verb(s); the pack''s wiki block is gated on purpose AND consumer. The BEHAVIOURAL half needs a live wake credential — it is journey work, not a probe.', v_n;
end $$;

-- ---------------------------------------------------------------------
-- 6. The A/B population for WB-R6(3), reported rather than asserted. The
--    empirical claim needs a draft raised against a client WITH wiki content
--    and one WITHOUT, then the two authority paths compared. This names the
--    two live cohorts so the journey has its fixtures.
-- ---------------------------------------------------------------------
select 'A/B cohort for WB-R6(3)' as note,
       c.name,
       (select count(*) from clara.wiki_pages w where w.client_id=c.id)::int  as wiki_pages,
       (select count(*) from clara.journal_entries e where e.client_id=c.id)::int as entries
  from clara.clients c
 order by wiki_pages desc, c.name;

\echo '=== Gate W2: probes 1-5 PASSED (claims 1 and 2-structural CLOSED). Claims 2-behavioural, 3 and 4 remain JOURNEY work — see the header. ==='
