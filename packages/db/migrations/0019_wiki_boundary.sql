-- 0019_wiki_boundary — the wiki AUTHORITY BOUNDARY (WB-R21 · WB-R24(ii)).
--
-- Authority: docs/plan/wave-b-migration-0019-design.md (v1.0, RATIFIED). Scope is
-- fixed by rulings WB-R21 + WB-R24(ii) and is neither widened nor narrowed here.
--
-- What this migration delivers, section by section against the contract:
--   §1 the R2-F2 EXISTS-veto is REMOVED from both filing-transition bodies, with the
--      NON-WIKI client-row SERIALIZER preserved at exactly the position the veto call
--      held (so the publication/retirement lock order is byte-for-byte 0017's), and
--      clara._assert_filing_wiki_unreferenced DROPPED;
--   §2 wiki_page_citations + wiki_page_refs gain the additive stale marker pair
--      (stale_at / stale_reason + the paired-presence CHECK), plus the index coverage
--      the writer / lint / read predicates need (both tables shipped PK-only);
--   §3 clara.mark_wiki_citations_stale — the runtime-only stale WRITER. NO domain
--      event is appended and NO event type is registered (amendment 4: a client-scoped
--      wiki event would reach assert_books_current (0007:2665-2681) and the correction
--      books-version check (0009:2449-2450), handing a projection-derived event an
--      indirect veto over authority — exactly the inversion WB-R21 abolishes);
--   §5 an additive, NULL-safe MONOTONIC projected_from_seq guard on the supersede
--      branch of _publish_wiki_page_version_core, as a TYPED TERMINAL refusal
--      CLR32/{"reason":"stale_projected_from_seq"} (a silent converge is rejected: the
--      wrapper would still _audit and append wiki.page_published for a publication that
--      never happened, and both mutators discard the receipt);
--   §6 the lint finding class 'stale_citation' on run_client_lint — ONE finding per
--      (page_id, document_id), the UNION of the MARKED scan and the INVERTED scan
--      (unmarked live sources whose document has no active filing to that client). The
--      inverted half is the ONLY surface that sees a writer failure that dead-lettered
--      AND advanced the checkpoint (wiki-projection.mjs:422-426);
--   §7 read-surface MARKING (inform-never-decide): has_stale_sources on get_wiki_page /
--      list_wiki_pages / the pack's wiki page object, and stale_at/stale_reason added BY
--      NAME to the pack's enumerated citation object. Nothing is filtered, reordered or
--      gated — candidates / priority / row_number / the byte-cap admission are untouched;
--   §9 the in-transaction fail-closed tail, including the CLEAN-END-STATE closed-set
--      scan that SUPERSEDES 0017's exclusion loop (0017:5945-5967).
--
-- Deliberately NOT here: the retirement EVENT (document.filing_retired already exists,
-- 0007:2685, emitted by both authority fns), any new event type, consent/privacy (0020,
-- WB-R23), the commit-lane review attestation (WB-R22), and ANY widening of the
-- clara_runtime table read surface — notably clara.document_filings, which clara_runtime
-- still cannot read (0007:2740-2741). The tail asserts that negatively.
--
-- The 0017 apply-time veto-existence pins (0017:5595-5605, 5606-5618) ran once at
-- 0017-apply and are NOT re-run here; 0019's tail is their exact inverse.
--
-- HONEST CHARACTERISATION OF THE §9 CLOSED-SET SCAN (amendment 7). It is a closed
-- STATIC defence, not a proof. Known limits:
--   * FALSE-PASS. Dynamic SQL can construct a relation name without a word-bounded
--     literal. The original defect was itself a wrapper shape — the authority bodies
--     named only _assert_filing_wiki_unreferenced while the helper held the reads
--     (0017:1824, 1860) — which is why the scan also follows CALL EDGES; but the call-
--     edge half is still a source-token scan, because plpgsql bodies create NO pg_depend
--     edges for their callees, so there is no catalog graph to walk. The paired repo lint
--     (scripts/check-wiki-dynamic-sql.mjs) is the half the DB tail structurally cannot
--     provide.
--   * FALSE-FAIL. A raw prosrc regex also sees comments and string literals
--     (0017:5961-5963), so a non-wiki function that merely MENTIONS wiki_pages in an
--     error message or comment trips it. The raise names the offending signature.
--
-- Structure mirrors 0018: every DDL + function body runs under `set role clara_fn_owner`
-- (the 0014:46 idiom — the definer must own the functions so SECURITY DEFINER keeps its
-- authority); grants + the tail run after `reset role`. Large existing bodies are patched
-- via pg_get_functiondef + string surgery (the 0017 CoR-prestate idiom) so an anchor
-- drift ABORTS the apply rather than silently reproducing hundreds of lines. Every
-- functional tail probe runs inside a forced-rollback subtransaction — a probe must never
-- commit fixture rows into production. One transaction; any failure aborts.
--
-- No workflow-body change; ZERO freeze-manifest implication (the consumer loop is a
-- startWorld runtime plugin, packages/runtime/plugins/startWorld.ts:218, not a frozen WDK
-- workflow). Validate on a throwaway Postgres only.

set role clara_fn_owner;

-- =====================================================================
-- §2a. THE STALE MARKER — an additive nullable pair on BOTH reference
-- relations (the 0018 bound_scope pattern, 0018:36-44). Every existing row is
-- unmarked (stale_at is null) and every existing read is byte-identical until a
-- writer marks a row. The single-valued stale_reason enum is the extension seam.
--
-- The two relations have DIFFERENT lifecycles and this migration does not conflate
-- them: CITATIONS are versioned and immutable (they hang off version_id,
-- 0017:2128-2131 — superseded versions keep theirs forever), while REFS are
-- PAGE-LEVEL MUTABLE rows that _publish_wiki_page_version_core DELETEs and
-- re-inserts on every republish (0017:2134). A ref's stale mark therefore does not
-- survive a republish — which is correct: a republish re-validates every document
-- ref against the CLR02 active-filing floor (0017:2157-2163), so a re-created ref
-- is provably live.
-- =====================================================================
alter table clara.wiki_page_citations
  add column stale_at timestamptz,
  add column stale_reason text check (stale_reason in ('source_filing_retired')),
  add constraint ck_wiki_citations_stale_pair
    check ((stale_at is null) = (stale_reason is null));

alter table clara.wiki_page_refs
  add column stale_at timestamptz,
  add column stale_reason text check (stale_reason in ('source_filing_retired')),
  add constraint ck_wiki_refs_stale_pair
    check ((stale_at is null) = (stale_reason is null));

-- =====================================================================
-- §2b. INDEX COVERAGE. 0017 created NO index on either relation beyond the PK, and
-- the composite FKs do not index the referencing side, so all three new predicate
-- shapes are new work rather than tuning. The §9 tail carries EXPLAIN-backed proof.
--   (1) writer + catch-up scan  -> *_doc_live
--   (2) lint stale-marked lookup -> *_stale ; page-join key -> *_version / *_page
--   (3) the has_stale_sources EXISTS in get_wiki_page / list_wiki_pages / the pack
--       reuses (2).
-- The INVERTED lint side needs nothing new: uq_document_filing_active
-- (clara.document_filings(document_id, client_id) where retired_at is null,
-- 0007:93-94) already serves the NOT EXISTS probe.
-- =====================================================================
create index ix_wiki_citations_doc_live
  on clara.wiki_page_citations (document_id, version_id) where stale_at is null;
create index ix_wiki_citations_stale
  on clara.wiki_page_citations (version_id, document_id) where stale_at is not null;
create index ix_wiki_citations_version
  on clara.wiki_page_citations (version_id);
create index ix_wiki_refs_doc_live
  on clara.wiki_page_refs (document_id, page_id) where ref_kind = 'document';
create index ix_wiki_refs_stale
  on clara.wiki_page_refs (page_id, document_id) where stale_at is not null;
create index ix_wiki_refs_page
  on clara.wiki_page_refs (page_id);

-- =====================================================================
-- §2c/§6a. The two closed CHECK sets this migration widens, by exactly one value
-- each: wiki_log.action gains 'mark_stale' (0017:972-973) and
-- lint_findings.finding_kind gains 'stale_citation' (0017:1323-1325). The existing
-- constraints are discovered by DEFINITION, never by a guessed auto-generated name;
-- a miss ABORTS.
-- =====================================================================
do $ck$
declare v_name text;
begin
  select conname into v_name from pg_constraint
    where conrelid = 'clara.wiki_log'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
      and pg_get_constraintdef(oid) ilike '%''lint_pass''%';
  if v_name is null then
    raise exception '0019: the wiki_log.action CHECK was not found' using errcode = 'CLR10';
  end if;
  execute format('alter table clara.wiki_log drop constraint %I', v_name);
  execute 'alter table clara.wiki_log add constraint ck_wiki_log_action check ('
    || 'action in (''ingest'',''publish'',''supersede'',''retire'',''lint_pass'','
    || '''hold'',''release'',''mark_stale''))';

  select conname into v_name from pg_constraint
    where conrelid = 'clara.lint_findings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%finding_kind%'
      and pg_get_constraintdef(oid) ilike '%''orphan_page''%';
  if v_name is null then
    raise exception '0019: the lint_findings.finding_kind CHECK was not found'
      using errcode = 'CLR10';
  end if;
  execute format('alter table clara.lint_findings drop constraint %I', v_name);
  execute 'alter table clara.lint_findings add constraint ck_lint_findings_kind check ('
    || 'finding_kind in (''contradiction'',''stale_claim'',''orphan_page'',''cap_pages'','
    || '''cap_page_size'',''wiki_synthesis_held'',''opening_tb_tie_broken'','
    || '''opening_doc_unfiled'',''stale_citation''))';
end
$ck$;

-- =====================================================================
-- §1. THE VETO REMOVAL — the symmetric inverse of the 0017 insertion
-- (0017:1850-1897), MINUS the veto, PLUS the lock.
--
-- Each patched body retains, at EXACTLY the position the `perform` call occupied, a
-- plain non-wiki client-row lock with the same shape and the same not-found refusal
-- the helper had (CLR11). Keeping the lock THERE preserves the as-built acquisition
-- order exactly:
--   publication: clients FOR UPDATE (0017:2049-2050) -> wiki_pages FOR UPDATE (2054-2056);
--   retirement:  document_filings FOR UPDATE (0007:1445) -> CLR17 checks (0007:1447-1448)
--                -> clients FOR UPDATE -> the retirement UPDATE (0007:1457-1458);
--   correction:  filing_corrections FOR UPDATE (0009:2440) -> document_filings FOR UPDATE
--                (0009:2452-2453) -> CLR19 source-filing check (0009:2456) -> clients FOR
--                UPDATE -> the entry locks (0009:2457-2458).
-- Publication NEVER locks document_filings — its active-filing floor is an unlocked
-- read (0017:2115-2121, 2157-2163) — so the two orders share no cycle. This is the
-- identical lock graph 0017 shipped; 0019 changes nothing about it.
--
-- The alias is `cl`, NOT `c`: both bodies declare a plpgsql record variable named
-- `c`, and a `c` range-table alias would be an ambiguous column reference under the
-- default plpgsql.variable_conflict = error.
--
-- What changes semantically: publication and retirement still SERIALIZE on the
-- client row; what disappears is the VETO. Once serialized, retirement proceeds
-- unconditionally in the authority domain and the wiki converges by stale-marking.
--
-- Drift-guard per body (apply ABORTS otherwise): the anchor matched EXACTLY ONCE;
-- the replace changed the body; the normalized result no longer contains
-- _assert_filing_wiki_unreferenced; it DOES contain the client-row FOR UPDATE token
-- and its CLR11 raise; and that lock still PRECEDES the retirement UPDATE.
-- =====================================================================
do $cor1$
declare v_def text; v_next text; v_norm text; v_anchor text;
begin
  ---- retire_document_filing -------------------------------------------------
  select pg_get_functiondef(
    'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure) into v_def;
  v_anchor :=
$old$  -- [R2-F2] Active wiki provenance blocks retirement under the client lock.
  perform clara._assert_filing_wiki_unreferenced(
    f.firm_id,f.client_id,f.document_id);$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: retire_document_filing veto anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$  -- [WB-R21/0019 §1] The wiki VETO is gone. The non-wiki client-row SERIALIZER
  -- stays, at exactly the position the veto call held, so filing retirement and wiki
  -- publication still serialize on the same client row (0017:2049-2053).
  perform 1 from clara.clients cl
    where cl.id=f.client_id and cl.firm_id=f.firm_id for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('_assert_filing_wiki_unreferenced' in v_norm) > 0
     or position('perform1fromclara.clientsclwherecl.id=f.client_idandcl.firm_id=f.firm_idforupdate'
       in v_norm) = 0
     or position('raiseexception''filingclientnotinthesuppliedfirm''usingerrcode=''clr11'''
       in v_norm) = 0
     or position('perform1fromclara.clientsclwherecl.id=f.client_idandcl.firm_id=f.firm_idforupdate'
          in v_norm)
        > position('updateclara.document_filingssetretired_at' in v_norm) then
    raise exception '0019: retire_document_filing veto-removal drift' using errcode = 'CLR10';
  end if;
  execute v_next;

  ---- approve_wrong_client_correction ----------------------------------------
  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure)
    into v_def;
  v_anchor :=
$old$  -- [R2-F2] A correction move retires the source filing, so the same active
  -- wiki provenance blocker and client-row lock apply.
  perform clara._assert_filing_wiki_unreferenced(
    c.firm,x.from_client,x.document_id);$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: approve_wrong_client_correction veto anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$  -- [WB-R21/0019 §1] The wiki VETO is gone. A correction move still retires the
  -- SOURCE filing, so the SOURCE client's row lock — the serializer against wiki
  -- publication — stays, at exactly the position the veto call held.
  perform 1 from clara.clients cl
    where cl.id=x.from_client and cl.firm_id=c.firm for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('_assert_filing_wiki_unreferenced' in v_norm) > 0
     or position('perform1fromclara.clientsclwherecl.id=x.from_clientandcl.firm_id=c.firmforupdate'
       in v_norm) = 0
     or position('raiseexception''filingclientnotinthesuppliedfirm''usingerrcode=''clr11'''
       in v_norm) = 0
     or position('perform1fromclara.clientsclwherecl.id=x.from_clientandcl.firm_id=c.firmforupdate'
          in v_norm)
        > position('updateclara.document_filingssetretired_at' in v_norm) then
    raise exception '0019: approve_wrong_client_correction veto-removal drift'
      using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor1$;

-- The helper was the ONLY reader of wiki tables among authority fns and the ONLY
-- producer of the 'active_wiki_document_reference' reason anywhere. It goes.
drop function clara._assert_filing_wiki_unreferenced(uuid, uuid, uuid);

-- =====================================================================
-- §5. THE MONOTONIC projected_from_seq GUARD — a TYPED TERMINAL refusal.
--
-- The residual (v25-runtime-lanes-memo.md:118-120): the app-side recency re-check
-- (wiki-projection.mjs:158-165, 241-248, 303-310) cannot stop two writers inside the
-- same txn window from both observing the old value and both publishing. The guard
-- makes the in-txn recency check STRUCTURAL, on the SUPERSEDE branch only, evaluated
-- BEFORE the supersede UPDATE and the version insert.
--
-- It is a refusal, not a silent converge: both publishing mutators DISCARD the DB
-- receipt, and the wrapper would still run _audit (0017:2216-2219), _append_event
-- ('wiki.page_published', 0017:2222-2224) and _finish_op (0017:2225) — a "no-op"
-- would emit a publication event and complete an op receipt for a publication that
-- never happened. A typed refusal rolls ALL of that back inside the caller's effect
-- txn, and is distinguishable from a dedupe hit (which returns before the core is
-- called, 0017:2205-2211).
--
-- NULL-safe by construction: deterministic ingest passes p_projected_from_seq = null
-- (record_wiki_source_ingest, 0017:2264-2269) and the new-page branch (0017:2057-2069)
-- has no prior — both bypass the guard and publish.
-- =====================================================================
do $cor2$
declare v_def text; v_next text; v_norm text; v_anchor text;
begin
  select pg_get_functiondef(
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'::regprocedure)
    into v_def;
  v_anchor := 'if v_prior is not null then';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: supersede-branch anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$if v_prior is not null then
      -- [WB-R21/0019 §5] Structural monotonic recency guard on the supersede branch.
      if p_projected_from_seq is not null and exists(
          select 1 from clara.wiki_page_versions pv
           where pv.id=v_prior and pv.projected_from_seq is not null
             and p_projected_from_seq<=pv.projected_from_seq) then
        raise exception 'wiki publication is not newer than the published version'
          using errcode='CLR32',detail='{"reason":"stale_projected_from_seq"}';
      end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('stale_projected_from_seq' in v_norm) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_norm) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_norm)
        > position('updateclara.wiki_page_versionssetstate=''superseded''' in v_norm)
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_norm)
        > position('insertintoclara.wiki_page_versions(' in v_norm) then
    raise exception '0019: monotonic-guard drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor2$;

-- =====================================================================
-- §3. THE STALE WRITER — clara.mark_wiki_citations_stale.
--
-- Scope of the mark is EXACTLY the blocker scope the veto scanned (0017:1821-1836),
-- flipped from a raise into a mark: (i) citations on the CURRENT version of an ACTIVE
-- page of (p_client, firm) with document_id = p_document and stale_at is null; (ii)
-- ref_kind='document' refs on an ACTIVE page of (p_client, firm) with the same
-- document and stale_at is null. Superseded-version citations and retired-page rows
-- are NEVER touched. A later publication that re-cites the now-retired document
-- cannot happen — the CLR02 active-filing floor already refuses it for both citations
-- (0017:2115-2121) and refs (0017:2157-2163); 0019 adds no new prevention there.
--
-- Idempotency is THREE distinct mechanisms with three distinct observable results:
--   (a) same op key, same args  -> _reserve_op replays the STORED receipt byte-
--       identically (0004:43-60), original non-zero counts and all. No re-scan, no
--       new audit/wiki_log row.
--   (b) DIFFERENT op key over already-marked rows -> a fresh reservation whose
--       `stale_at is null` filter matches nothing -> {0,0,'noop'}; the FIRST call's
--       stale_at is preserved.
--   (c) same op key, CHANGED args -> _reserve_op hash mismatch -> CLR10.
-- (a) vs (b) is why the ceremony catch-up op key must carry a run key (§11): a fixed
-- per-pair key would replay case (a) forever and never examine fresh rows.
--
-- Audit is POSITIVE-CHANGE-ONLY (the run_client_lint precedent, 0017:4882-4892): a
-- 'noop' writes NO wiki_log row and NO audit_log row. The op receipt is always
-- written. NO event is appended and NO event type is registered — see the header.
--
-- Firm is resolved FROM the client, as every wiki writer does (0017:2199-2200).
-- Argument validation precedes _reserve_op so an invalid call never consumes an
-- op_key (the 0018 R1-0018-2 discipline).
-- =====================================================================
create function clara.mark_wiki_citations_stale(
    p_client uuid, p_document uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_firm uuid; v_dedupe jsonb; v_result jsonb; v_status text;
  v_cit int := 0; v_ref int := 0; v_page uuid;
  v_cit_ids uuid[] := '{}'; v_ref_ids uuid[] := '{}';
  v_pages_c uuid[] := '{}'; v_pages_r uuid[] := '{}'; v_pages uuid[] := '{}';
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required'
      using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  if p_document is null then
    raise exception 'a source document is required'
      using errcode = 'CLR10', detail = '{"reason":"document_required"}';
  end if;
  -- The SAME allowed set as the column CHECK; an unrecognised reason is a typed refusal.
  if p_reason is null or p_reason not in ('source_filing_retired') then
    raise exception 'unrecognised wiki stale reason'
      using errcode = 'CLR10', detail = '{"reason":"stale_reason_unknown"}';
  end if;
  select firm_id into v_firm from clara.clients where id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(v_firm, 'mark_wiki_citations_stale', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- (i) CURRENT-version citations of ACTIVE pages.
  select coalesce(array_agg(wc.id), '{}'), coalesce(array_agg(distinct wp.id), '{}')
    into v_cit_ids, v_pages_c
  from clara.wiki_page_citations wc
  join clara.wiki_pages wp on wp.current_version_id = wc.version_id
    and wp.client_id = wc.client_id and wp.firm_id = wc.firm_id
  where wp.firm_id = v_firm and wp.client_id = p_client and wp.state = 'active'
    and wc.document_id = p_document and wc.stale_at is null;
  update clara.wiki_page_citations
    set stale_at = now(), stale_reason = p_reason
    where id = any(v_cit_ids) and stale_at is null;
  get diagnostics v_cit = row_count;

  -- (ii) page-level ref_kind='document' refs on ACTIVE pages.
  select coalesce(array_agg(wr.id), '{}'), coalesce(array_agg(distinct wp.id), '{}')
    into v_ref_ids, v_pages_r
  from clara.wiki_page_refs wr
  join clara.wiki_pages wp on wp.id = wr.page_id
    and wp.client_id = wr.client_id and wp.firm_id = wr.firm_id
  where wp.firm_id = v_firm and wp.client_id = p_client and wp.state = 'active'
    and wr.ref_kind = 'document' and wr.document_id = p_document
    and wr.stale_at is null;
  update clara.wiki_page_refs
    set stale_at = now(), stale_reason = p_reason
    where id = any(v_ref_ids) and stale_at is null;
  get diagnostics v_ref = row_count;

  -- page_id is set only when the mark is unambiguously page-attributable.
  select coalesce(array_agg(distinct z), '{}') into v_pages
    from unnest(v_pages_c || v_pages_r) z;
  if coalesce(array_length(v_pages, 1), 0) = 1 then v_page := v_pages[1]; end if;

  v_status := case when v_cit + v_ref = 0 then 'noop' else 'marked' end;
  v_result := jsonb_build_object(
    'document_id', p_document, 'reason', p_reason,
    'citations_marked', v_cit, 'refs_marked', v_ref, 'status', v_status);
  if v_status = 'marked' then
    insert into clara.wiki_log(firm_id, client_id, page_id, action, actor_kind, detail)
      values (v_firm, p_client, v_page, 'mark_stale', 'runtime',
        jsonb_build_object('document_id', p_document, 'reason', p_reason,
          'citations_marked', v_cit, 'refs_marked', v_ref));
    perform clara._audit(v_firm, null, null, null, 'mark_wiki_citations_stale', null,
      jsonb_build_object('client', p_client, 'document', p_document,
        'reason', p_reason, 'citations_marked', v_cit, 'refs_marked', v_ref,
        'op_key', p_op_key));
  end if;
  return clara._finish_op(v_firm, 'mark_wiki_citations_stale', p_op_key, v_result);
end $fn$;

-- =====================================================================
-- §6b. THE LINT FINDING CLASS — 'stale_citation' on run_client_lint.
--
-- Grain: ONE finding per (page_id, document_id), NOT per citation row. A page citing
-- the same document from several citation rows, or from both a citation and a ref,
-- produces exactly one finding. dedupe_key rides uq_lint_findings_one_open
-- (0017:1358-1359) unchanged.
--
-- The condition is the UNION of TWO scans:
--   (1) MARKED    — a current-version citation or a page-level document ref of an
--                   ACTIVE page carrying stale_at is not null;
--   (2) INVERTED  — an unmarked (stale_at is null) live source whose document has NO
--                   active filing to that client (the same probe run_client_lint
--                   already performs for opening_doc_unfiled, 0017:4804-4807, indexed
--                   by uq_document_filing_active, 0007:93-94).
-- Scan (2) is NOT redundant with the writer: processFirm advances the checkpoint past
-- a dead-lettered event once attempts are exhausted (wiki-projection.mjs:422-426), so
-- a writer failure can exhaust into dead-letter-plus-checkpoint and the stale citation
-- would otherwise be permanently invisible. Scan (2) is the only surface that sees it;
-- marker_missing:true is that visible signal.
--
-- page_id is set at the TOP LEVEL of the condition object: the episode insert reads
-- nullif(j->>'page_id','')::uuid from the CONDITION, not from detail (0017:4836-4842),
-- so a detail-only page_id would leave the finding's FK column null.
--
-- `y` is the record variable 0017 declared and never used; aliases avoid p/c/x/s/f/h/cl
-- because those are plpgsql variables in this body (variable_conflict = error).
-- =====================================================================
do $cor3$
declare v_def text; v_next text; v_norm text; v_anchor text;
begin
  select pg_get_functiondef('clara.run_client_lint(uuid,text)'::regprocedure) into v_def;
  v_anchor := '    -- Converge current conditions into one-open episodes.';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: run_client_lint convergence anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$    -- [WB-R21/0019 §6] stale_citation: MARKED sources UNION the INVERTED scan.
    for y in
      select zz.page_id, zz.document_id,
        min(zz.stale_at) as since,
        min(zz.stale_reason) as stale_reason,
        (count(*) filter (where zz.stale_at is not null) = 0) as marker_missing
      from (
        select wp.id as page_id, wc.document_id, wc.stale_at, wc.stale_reason
          from clara.wiki_pages wp
          join clara.wiki_page_citations wc on wc.version_id=wp.current_version_id
            and wc.client_id=wp.client_id and wc.firm_id=wp.firm_id
         where wp.client_id=p_client and wp.state='active'
           and wc.document_id is not null
           and (wc.stale_at is not null
             or not exists(select 1 from clara.document_filings df
                  where df.document_id=wc.document_id and df.client_id=wp.client_id
                    and df.retired_at is null))
        union all
        select wp.id, wr.document_id, wr.stale_at, wr.stale_reason
          from clara.wiki_pages wp
          join clara.wiki_page_refs wr on wr.page_id=wp.id
            and wr.client_id=wp.client_id and wr.firm_id=wp.firm_id
         where wp.client_id=p_client and wp.state='active'
           and wr.ref_kind='document' and wr.document_id is not null
           and (wr.stale_at is not null
             or not exists(select 1 from clara.document_filings df
                  where df.document_id=wr.document_id and df.client_id=wp.client_id
                    and df.retired_at is null))
      ) zz
      group by zz.page_id, zz.document_id
      order by zz.page_id, zz.document_id
    loop
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','stale_citation',
        'dedupe_key','stalecite:'||y.page_id||':'||y.document_id,
        'severity','warn','page_id',y.page_id,
        'detail',jsonb_build_object('page_id',y.page_id,
          'document_id',y.document_id,'stale_reason',y.stale_reason,
          'since',y.since,'marker_missing',y.marker_missing));
    end loop;

    -- Converge current conditions into one-open episodes.$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('''stale_citation''' in v_norm) = 0
     or position('''stalecite:''||y.page_id||'':''||y.document_id' in v_norm) = 0
     or position('''marker_missing'',y.marker_missing' in v_norm) = 0
     -- BOTH halves of the inverted scan are present. The pattern is the wp-joined
     -- predicate, NOT a bare document_filings probe: run_client_lint already carries
     -- one for opening_doc_unfiled (0017:4804-4807), which a looser count would
     -- silently absorb.
     or regexp_count(v_norm, 'df[.]client_id=wp[.]client_id') <> 2 then
    raise exception '0019: run_client_lint stale_citation drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor3$;

-- =====================================================================
-- §7. READ-SURFACE MARKING — inform-never-decide (ADR-004; LAW).
--
-- The fields do NOT all arrive "for free": get_wiki_page returns to_jsonb(c) /
-- to_jsonb(r) (0017:2392-2398) so the per-row columns are additive there, but
-- list_wiki_pages ENUMERATES page fields (0017:2420-2425) and the pack's wiki block
-- ENUMERATES citation fields (0017:5053-5063) and carries NO refs array at all. So
-- three explicit changes, all MARK-never-drop:
--   1. get_wiki_page gains a derived page-level has_stale_sources;
--   2. list_wiki_pages gains has_stale_sources in its enumerated per-page object;
--   3. the pack's wiki block adds stale_at + stale_reason BY NAME to the enumerated
--      citation object and has_stale_sources to the enumerated page object.
--
-- Name: has_stale_sources, not has_stale_citations — the flag aggregates citations
-- AND page-level document refs, and the pack shows no refs array, so there the flag
-- is the ONLY signal that a page's document ref went stale.
--
-- Definition, identical in all three: EXISTS a citation of the page's CURRENT version,
-- OR a ref_kind='document' ref on the page, with stale_at is not null.
--
-- NOTHING is filtered, reordered or gated: the pack's candidates set (0017:5043-5045),
-- its priority/row_number ordering (0017:5039-5052) and its
-- `ord <= page_cap and running_bytes <= byte_cap` admission (0017:5065) are untouched,
-- and content_bytes derives from wv.content alone (0017:5038) so adding fields to the
-- enumerated citation object cannot shift the byte cap.
-- =====================================================================
do $cor4$
declare v_def text; v_next text; v_cur text; v_anchor text;
begin
  ---- 1. get_wiki_page --------------------------------------------------------
  select pg_get_functiondef('clara.get_wiki_page(uuid,text)'::regprocedure) into v_def;
  v_anchor :=
$old$      'refs',coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
        from clara.wiki_page_refs r where r.page_id=p.id),'[]'::jsonb))$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: get_wiki_page anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$      'refs',coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
        from clara.wiki_page_refs r where r.page_id=p.id),'[]'::jsonb),
      'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
          where sc.version_id=p.current_version_id and sc.stale_at is not null)
        or exists(select 1 from clara.wiki_page_refs sr
          where sr.page_id=p.id and sr.ref_kind='document'
            and sr.stale_at is not null)))$new$);
  if v_next = v_def
     or position('has_stale_sources' in v_next) = 0 then
    raise exception '0019: get_wiki_page has_stale_sources drift' using errcode = 'CLR10';
  end if;
  execute v_next;

  ---- 2. list_wiki_pages ------------------------------------------------------
  select pg_get_functiondef('clara.list_wiki_pages(uuid)'::regprocedure) into v_def;
  v_anchor := $old$      'size_bytes',v.size_bytes,'updated_at',p.updated_at)$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: list_wiki_pages anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$      'size_bytes',v.size_bytes,'updated_at',p.updated_at,
      'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
          where sc.version_id=p.current_version_id and sc.stale_at is not null)
        or exists(select 1 from clara.wiki_page_refs sr
          where sr.page_id=p.id and sr.ref_kind='document'
            and sr.stale_at is not null)))$new$);
  if v_next = v_def
     or position('has_stale_sources' in v_next) = 0 then
    raise exception '0019: list_wiki_pages has_stale_sources drift' using errcode = 'CLR10';
  end if;
  execute v_next;

  ---- 3. the pack's wiki block ------------------------------------------------
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) into v_def;
  v_cur := v_def;

  v_anchor :=
$old$              'detail',wc.detail)
              order by wc.created_at,wc.id)$old$;
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: pack citation-enumeration anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$              'detail',wc.detail,'stale_at',wc.stale_at,
              'stale_reason',wc.stale_reason)
              order by wc.created_at,wc.id)$new$);
  if v_next = v_cur then
    raise exception '0019: pack citation-enumeration drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  v_anchor :=
$old$            where wc.version_id=r.version_id),'[]'::jsonb),
          'content',r.content) order by r.ord),'[]'::jsonb)$old$;
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: pack page-object anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$            where wc.version_id=r.version_id),'[]'::jsonb),
          'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
              where sc.version_id=r.version_id and sc.stale_at is not null)
            or exists(select 1 from clara.wiki_page_refs sr
              where sr.ref_kind='document' and sr.stale_at is not null
                and sr.page_id=(select sv.page_id from clara.wiki_page_versions sv
                  where sv.id=r.version_id))),
          'content',r.content) order by r.ord),'[]'::jsonb)$new$);
  if v_next = v_cur
     or position('has_stale_sources' in v_next) = 0
     or position('''stale_at'',wc.stale_at' in v_next) = 0
     -- the admission / ordering / candidate shape must be byte-identical.
     or position('where r.ord<=cfg.page_cap and r.running_bytes<=cfg.byte_cap' in v_next) = 0
     or position('row_number() over(order by priority,updated_at desc,slug) ord' in v_next) = 0 then
    raise exception '0019: pack page-object drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor4$;

reset role;

-- =====================================================================
-- GRANTS (as the migration role). The stale writer is a RUNTIME-ONLY verb — the
-- set_wiki_synthesis_hold matrix (0017:5125-5135). It never reaches
-- clara_authenticated, clara_agent_ro, clara_wake_interactive or clara_wake_proactive,
-- and NO new table grant is issued to any role: clara_runtime still has no SELECT on
-- clara.document_filings (0007:2740-2741), which is why the §11 ceremony catch-up
-- splits into a ceremony-role scan plus a runtime-role marking verb.
-- =====================================================================
revoke execute on all functions in schema clara from public;
grant execute on function
  clara.mark_wiki_citations_stale(uuid, uuid, text, text)
  to clara_runtime;

-- =====================================================================
-- §9. THE IN-TRANSACTION FAIL-CLOSED TAIL BATTERY.
-- Static catalog / prosrc / ACL asserts + the clean-end-state closed-set scan +
-- EXPLAIN-backed plan coverage + three functional probes, each inside a forced-
-- rollback subtransaction. One transaction; any failure aborts the apply.
-- =====================================================================
do $tail$
declare
  v_def text; v_src text; v_sig text; v_owner oid; v_txt text; v_plan jsonb;
  v_wl text[]; v_wl_oids oid[]; v_bad text; v_probe_ok boolean; v_n int;
  v_f uuid; v_u uuid; v_c uuid; v_d uuid; v_fil uuid;
  v_pg uuid; v_ver uuid; v_cit uuid; v_r jsonb;
  v_rev uuid; v_stale timestamptz; v_content text; v_sha text; v_key text;
  v_seq0 bigint; v_relrx text; v_callrx text;
begin
  v_owner := (select oid from pg_roles where rolname = 'clara_fn_owner');
  v_relrx := '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M';
  v_callrx := '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\M';

  -- ---- §1 the helper is GONE. to_regprocedure, NOT to_regproc (0011:4132-4136):
  -- to_regproc takes a BARE name and errors/misresolves on an argument list. ----
  if to_regprocedure('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') is not null then
    raise exception '0019 the R2-F2 veto helper still exists' using errcode = 'CLR10';
  end if;

  -- ---- §1 both authority bodies are wiki-clean AND still hold the client row ----
  foreach v_sig in array array[
    'clara.retire_document_filing(uuid,text,uuid,text)',
    'clara.approve_wrong_client_correction(uuid,text,text,text)'
  ] loop
    select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
      from pg_proc where oid = v_sig::regprocedure;
    if position('_assert_filing_wiki_unreferenced' in v_src) > 0 then
      raise exception '0019 the veto call survives in %', v_sig using errcode = 'CLR10';
    end if;
    if position('fromclara.clientscl' in v_src) = 0
       or position('forupdate' in v_src) = 0
       or position('raiseexception''filingclientnotinthesuppliedfirm''usingerrcode=''clr11'''
         in v_src) = 0 then
      raise exception '0019 the client-row serializer is missing from %', v_sig
        using errcode = 'CLR10';
    end if;
    if position('fromclara.clientscl' in v_src)
       > position('updateclara.document_filingssetretired_at' in v_src) then
      raise exception '0019 the client-row lock no longer precedes the retirement UPDATE in %',
        v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §1 NON-WIKI blockers survive, PER FUNCTION (never both-in-both) ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
    from pg_proc where oid = 'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure;
  if position('raiseexception''filingisalreadyretired''usingerrcode=''clr17''' in v_src) = 0
     or position('raiseexception''stalefilingrevision''usingerrcode=''clr17''' in v_src) = 0
     or position('fromclara.journal_entriesjewhereje.filing_id=f.id' in v_src) = 0
     or position('raiseexception''filinghaslivecitationblockers:%'',v_blockers::textusingerrcode=''clr10'''
       in v_src) = 0 then
    raise exception '0019 retire_document_filing lost a non-wiki blocker' using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
    from pg_proc where oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  if position('raiseexception''sourcefilingisnolongeractive''usingerrcode=''clr19''' in v_src) = 0 then
    raise exception '0019 approve_wrong_client_correction lost its CLR19 source-filing guard'
      using errcode = 'CLR10';
  end if;

  -- ---- §2 the stale marker exists on BOTH relations, with both CHECKs ----
  foreach v_sig in array array['wiki_page_citations', 'wiki_page_refs'] loop
    if not exists(select 1 from pg_attribute
          where attrelid = ('clara.' || v_sig)::regclass and attname = 'stale_at'
            and atttypid = 'timestamptz'::regtype and not attisdropped)
       or not exists(select 1 from pg_attribute
          where attrelid = ('clara.' || v_sig)::regclass and attname = 'stale_reason'
            and atttypid = 'text'::regtype and not attisdropped) then
      raise exception '0019 stale marker columns missing on %', v_sig using errcode = 'CLR10';
    end if;
    -- EXACTLY ONE stale_reason value CHECK (distinguished from the paired CHECK by not
    -- referencing stale_at) and its normalized definition EQUALS the allowed-value
    -- predicate — a substring match could false-pass a widened predicate.
    if (select count(*) from pg_constraint
        where conrelid = ('clara.' || v_sig)::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%stale_reason%'
          and pg_get_constraintdef(oid) not ilike '%stale_at%') <> 1 then
      raise exception '0019 stale_reason CHECK: expected exactly one on %', v_sig
        using errcode = 'CLR10';
    end if;
    select pg_get_constraintdef(oid) into v_def from pg_constraint
      where conrelid = ('clara.' || v_sig)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%stale_reason%'
        and pg_get_constraintdef(oid) not ilike '%stale_at%';
    if regexp_replace(lower(v_def), '\s+', '', 'g')
         <> 'check((stale_reason=''source_filing_retired''::text))' then
      raise exception '0019 stale_reason allowed-value predicate assertion failed on % (got: %)',
        v_sig, v_def using errcode = 'CLR10';
    end if;
    select pg_get_constraintdef(oid) into v_def from pg_constraint
      where conrelid = ('clara.' || v_sig)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%stale_at%'
        and pg_get_constraintdef(oid) ilike '%stale_reason%';
    if regexp_replace(lower(coalesce(v_def, '')), '\s+', '', 'g')
         not like '%(stale_atisnull)=(stale_reasonisnull)%' then
      raise exception '0019 paired-presence CHECK shape assertion failed on %', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §2 every new index exists ----
  foreach v_sig in array array[
    'ix_wiki_citations_doc_live', 'ix_wiki_citations_stale', 'ix_wiki_citations_version',
    'ix_wiki_refs_doc_live', 'ix_wiki_refs_stale', 'ix_wiki_refs_page'
  ] loop
    if not exists(select 1 from pg_class i join pg_namespace n on n.oid = i.relnamespace
        where n.nspname = 'clara' and i.relname = v_sig and i.relkind = 'i') then
      raise exception '0019 index % is missing', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §3 the writer's catalog shape ----
  if not exists(select 1 from pg_proc p
      where p.oid = 'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure
        and p.prosecdef and p.proowner = v_owner
        and exists(select 1 from unnest(p.proconfig) x where x like 'search_path=%')) then
    raise exception '0019 mark_wiki_citations_stale owner/secdef/search_path assertion failed'
      using errcode = 'CLR10';
  end if;
  if (select proargnames from pg_proc
        where oid = 'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure)
       is distinct from array['p_client','p_document','p_reason','p_op_key']::text[] then
    raise exception '0019 mark_wiki_citations_stale arg-name assertion failed'
      using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure;
  if position('clara._reserve_op(v_firm,''mark_wiki_citations_stale''' in v_src) = 0
     or position('clara._finish_op(v_firm,''mark_wiki_citations_stale''' in v_src) = 0
     or position('_append_event' in v_src) > 0 then
    raise exception '0019 writer op-key discipline / no-event assertion failed'
      using errcode = 'CLR10';
  end if;

  -- ---- §2c/§6a the two widened CHECK sets ----
  if not exists(select 1 from pg_constraint
      where conrelid = 'clara.wiki_log'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%mark_stale%') then
    raise exception '0019 wiki_log.action CHECK lacks mark_stale' using errcode = 'CLR10';
  end if;
  if not exists(select 1 from pg_constraint
      where conrelid = 'clara.lint_findings'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%stale_citation%') then
    raise exception '0019 lint_findings.finding_kind CHECK lacks stale_citation'
      using errcode = 'CLR10';
  end if;

  -- ---- amendment 4: NO new event type. The negative assertion. ----
  if exists(select 1 from clara.event_types where name = 'wiki.citations_staled') then
    raise exception '0019 the dropped wiki.citations_staled event type exists'
      using errcode = 'CLR10';
  end if;

  -- ---- §7 / §6 body markers ----
  foreach v_sig in array array[
    'clara.get_wiki_page(uuid,text)', 'clara.list_wiki_pages(uuid)',
    'clara.get_context_pack(uuid,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid = v_sig::regprocedure;
    if position('has_stale_sources' in v_src) = 0 then
      raise exception '0019 % does not expose has_stale_sources', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.get_context_pack(uuid,text)'::regprocedure;
  if position('''stale_at'',wc.stale_at' in v_src) = 0
     or position('''stale_reason'',wc.stale_reason' in v_src) = 0 then
    raise exception '0019 the pack citation enumeration lacks the stale fields'
      using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.run_client_lint(uuid,text)'::regprocedure;
  if position('''stale_citation''' in v_src) = 0
     or position('''stalecite:''||y.page_id||'':''||y.document_id' in v_src) = 0
     or position('''marker_missing'',y.marker_missing' in v_src) = 0
     or regexp_count(v_src, 'df[.]client_id=wp[.]client_id') <> 2 then
    raise exception '0019 run_client_lint lacks the stale_citation class or its inverted scan'
      using errcode = 'CLR10';
  end if;

  -- ---- §5 the monotonic guard is present on the supersede branch ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'::regprocedure;
  if position('stale_projected_from_seq' in v_src) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_src) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_src)
        > position('updateclara.wiki_page_versionssetstate=''superseded''' in v_src) then
    raise exception '0019 monotonic guard missing or misplaced' using errcode = 'CLR10';
  end if;

  -- ---- §9 GRANTS / capability closed set ----
  if not has_function_privilege('clara_runtime',
      'clara.mark_wiki_citations_stale(uuid,uuid,text,text)', 'execute') then
    raise exception '0019 the runtime grant on the stale writer is missing' using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['clara_authenticated', 'clara_agent_ro',
      'clara_wake_interactive', 'clara_wake_proactive'] loop
    if has_function_privilege(v_sig,
        'clara.mark_wiki_citations_stale(uuid,uuid,text,text)', 'execute') then
      raise exception '0019 role % gained EXECUTE on the stale writer', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  if exists(select 1 from clara.wake_fn_allowlist
      where function_name = 'mark_wiki_citations_stale') then
    raise exception '0019 the stale writer leaked into wake_fn_allowlist' using errcode = 'CLR10';
  end if;
  -- whole-schema PUBLIC-execute sweep (covers the new fn).
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'clara' and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception '0019 PUBLIC execute sweep failed' using errcode = 'CLR10';
  end if;
  -- the patched read/lint surfaces keep their 0017 ACLs (CoR preserves them).
  if not has_function_privilege('clara_runtime', 'clara.run_client_lint(uuid,text)', 'execute')
     or not has_function_privilege('clara_runtime', 'clara.get_wiki_page(uuid,text)', 'execute')
     or not has_function_privilege('clara_authenticated', 'clara.get_wiki_page(uuid,text)', 'execute')
     or not has_function_privilege('clara_runtime', 'clara.list_wiki_pages(uuid)', 'execute')
     or not has_function_privilege('clara_authenticated', 'clara.list_wiki_pages(uuid)', 'execute') then
    raise exception '0019 a patched surface lost its 0017 ACL' using errcode = 'CLR10';
  end if;
  -- NO new table grant. In particular the runtime document→client gap STAYS shut:
  -- widening it is 0020's decision, not 0019's.
  if has_table_privilege('clara_runtime', 'clara.document_filings', 'select') then
    raise exception '0019 clara_runtime gained SELECT on document_filings — out of scope'
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['wiki_page_citations', 'wiki_page_refs'] loop
    if has_table_privilege('clara_agent_ro', 'clara.' || v_sig, 'select')
       or has_table_privilege('clara_runtime', 'clara.' || v_sig, 'update')
       or has_table_privilege('clara_runtime', 'clara.' || v_sig, 'insert')
       or has_table_privilege('clara_authenticated', 'clara.' || v_sig, 'update') then
      raise exception '0019 direct table authority leaked for %', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §9 THE CLEAN-END-STATE CLOSED-SET SCAN (D4b). This SUPERSEDES 0017's
  -- exclusion loop (0017:5945-5967), which scanned a FIXED NAMED LIST and OMITTED
  -- retire_document_filing + approve_wrong_client_correction — exactly why the veto
  -- could hide there. The inverse scan covers ALL clara SECURITY DEFINER fns and
  -- fails if any fn outside the whitelist either (a) names one of the seven wiki
  -- relations or (b) carries a CALL EDGE into the wiki-touch set. The whitelist is
  -- by EXACT regprocedure IDENTITY, not by proname (0017:6000-6004 used proname, so
  -- a future overload of a whitelisted name was silently covered). Resolving each
  -- signature is itself an existence assertion. ----
  v_wl := array[
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
  select coalesce(array_agg(s::regprocedure::oid), '{}') into v_wl_oids from unnest(v_wl) s;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.prosecdef
     and not (p.oid = any(v_wl_oids))
     and (p.prosrc ~* v_relrx or p.prosrc ~* v_callrx);
  if v_bad is not null then
    raise exception '0019 wiki authority/call-edge leaked into non-whitelisted definer(s): %',
      v_bad using errcode = 'CLR10';
  end if;

  -- ---- §9 PLAN COVERAGE (EXPLAIN-backed). enable_seqscan is discouraged LOCALLY
  -- for the probe (set_config(..., true) = transaction-local, restored below), so a
  -- Seq Scan on wiki_page_citations / wiki_page_refs proves the intended index is
  -- NOT USABLE rather than merely not preferred. Plans over other relations are
  -- irrelevant here and are not asserted. ----
  perform set_config('enable_seqscan', 'off', true);
  foreach v_txt in array array[
    -- (1) writer + catch-up scan, citations
    $q$select 1 from clara.wiki_page_citations wc
         join clara.wiki_pages wp on wp.current_version_id=wc.version_id
           and wp.client_id=wc.client_id and wp.firm_id=wc.firm_id
        where wp.state='active' and wp.client_id='00000000-0000-0000-0000-000000000001'::uuid
          and wc.document_id='00000000-0000-0000-0000-000000000002'::uuid
          and wc.stale_at is null$q$,
    -- (1) writer + catch-up scan, refs
    $q$select 1 from clara.wiki_page_refs wr
         join clara.wiki_pages wp on wp.id=wr.page_id
           and wp.client_id=wr.client_id and wp.firm_id=wr.firm_id
        where wp.state='active' and wp.client_id='00000000-0000-0000-0000-000000000001'::uuid
          and wr.ref_kind='document'
          and wr.document_id='00000000-0000-0000-0000-000000000002'::uuid
          and wr.stale_at is null$q$,
    -- (2)+(3) the stale-marked lookup behind has_stale_sources / the lint scan
    $q$select 1 from clara.wiki_page_citations sc
        where sc.version_id='00000000-0000-0000-0000-000000000003'::uuid
          and sc.stale_at is not null$q$,
    $q$select 1 from clara.wiki_page_refs sr
        where sr.page_id='00000000-0000-0000-0000-000000000004'::uuid
          and sr.ref_kind='document' and sr.stale_at is not null$q$,
    -- (2) the page-join keys the INVERTED lint scan drives on
    $q$select 1 from clara.wiki_page_citations wc
        where wc.version_id='00000000-0000-0000-0000-000000000003'::uuid$q$,
    $q$select 1 from clara.wiki_page_refs wr
        where wr.page_id='00000000-0000-0000-0000-000000000004'::uuid$q$
  ] loop
    execute 'explain (format json) ' || v_txt into v_def;
    v_plan := (v_def::jsonb) -> 0 -> 'Plan';
    -- The ROOT node is checked directly (a single-relation probe's top node IS the
    -- scan); `.**` then covers every descendant.
    if (v_plan ->> 'Node Type' = 'Seq Scan'
          and v_plan ->> 'Relation Name' in ('wiki_page_citations', 'wiki_page_refs'))
       or exists(select 1
           from jsonb_path_query(v_plan, '$.**?(@."Node Type" == "Seq Scan")') sn
           where sn ->> 'Relation Name' in ('wiki_page_citations', 'wiki_page_refs')) then
      raise exception '0019 plan coverage: a sequential scan of a wiki reference relation remains reachable for: %',
        v_txt using errcode = 'CLR10';
    end if;
  end loop;
  perform set_config('enable_seqscan', 'on', true);

  -- ===================================================================
  -- FUNCTIONAL PROBE A (§5) — the monotonic guard, with the SIX negative
  -- assertions. Fixtures are minted inside the block and discarded on unwind.
  -- ===================================================================
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_d := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0019 probe A firm');
    insert into clara.users(id, display_name) values (v_u, '0019 probe A user');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0019 probe A client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename)
      values (v_d, v_f, repeat('a', 64), 'probe-a.pdf');
    insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
      values (v_f, v_d, v_c, v_u, 'legacy-0007');

    v_content := '# 0019 probe A v1';
    v_sha := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');
    v_key := 'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md';
    perform clara.publish_wiki_page_version(v_c, 'profile', 'profile', 'Probe A', null,
      v_content, v_sha, v_key,
      jsonb_build_array(jsonb_build_object('source_kind', 'document', 'document_id', v_d)),
      '[]'::jsonb, 'deterministic', null, 500, 'probe-a-1');

    v_content := '# 0019 probe A v2 (stale seq)';
    v_sha := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');
    v_key := 'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md';
    v_probe_ok := false;
    begin
      perform clara.publish_wiki_page_version(v_c, 'profile', 'profile', 'Probe A', null,
        v_content, v_sha, v_key,
        jsonb_build_array(jsonb_build_object('source_kind', 'document', 'document_id', v_d)),
        '[]'::jsonb, 'deterministic', null, 500, 'probe-a-2');
    exception when sqlstate 'CLR32' then
      get stacked diagnostics v_txt = pg_exception_detail;
      v_probe_ok := position('stale_projected_from_seq' in coalesce(v_txt, '')) > 0;
    end;
    if not v_probe_ok then
      raise exception '0019 functional A: a stale-seq supersede was NOT refused CLR32/stale_projected_from_seq'
        using errcode = 'CLR10';
    end if;
    -- (1) no new version row, and (2) the prior version is still 'published'.
    if (select count(*) from clara.wiki_page_versions where client_id = v_c) <> 1
       or not exists(select 1 from clara.wiki_page_versions
            where client_id = v_c and state = 'published') then
      raise exception '0019 functional A: the refused supersede left a version behind'
        using errcode = 'CLR10';
    end if;
    -- (3) no audit_log row for the refused attempt.
    if exists(select 1 from clara.audit_log
        where firm_id = v_f and fn = 'publish_wiki_page_version'
          and args ->> 'op_key' = 'probe-a-2') then
      raise exception '0019 functional A: the refused supersede wrote an audit row'
        using errcode = 'CLR10';
    end if;
    -- (4) no wiki_log publish/supersede row beyond the first publication.
    if (select count(*) from clara.wiki_log
        where client_id = v_c and action in ('publish', 'supersede')) <> 1 then
      raise exception '0019 functional A: the refused supersede wrote a wiki_log row'
        using errcode = 'CLR10';
    end if;
    -- (5) no second wiki.page_published event.
    if (select count(*) from clara.domain_events
        where firm_id = v_f and event_type = 'wiki.page_published') <> 1 then
      raise exception '0019 functional A: the refused supersede emitted a publication event'
        using errcode = 'CLR10';
    end if;
    -- (6) NO op_receipts row AT ALL — stronger than "no completed receipt":
    -- _reserve_op inserts the reservation BEFORE the core runs (0004:48-52), so the
    -- raise rolls the reservation back too.
    if exists(select 1 from clara.op_receipts
        where firm_id = v_f and fn = 'publish_wiki_page_version' and op_key = 'probe-a-2') then
      raise exception '0019 functional A: the refused supersede left an op_receipts reservation'
        using errcode = 'CLR10';
    end if;
    -- NULL-safe: a null p_projected_from_seq still publishes over the same prior.
    v_content := '# 0019 probe A v3 (null seq)';
    v_sha := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');
    v_key := 'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md';
    perform clara.publish_wiki_page_version(v_c, 'profile', 'profile', 'Probe A', null,
      v_content, v_sha, v_key,
      jsonb_build_array(jsonb_build_object('source_kind', 'document', 'document_id', v_d)),
      '[]'::jsonb, 'deterministic', null, null, 'probe-a-3');
    if (select count(*) from clara.wiki_page_versions where client_id = v_c) <> 2 then
      raise exception '0019 functional A: the guard is not NULL-safe' using errcode = 'CLR10';
    end if;

    raise exception 'clara_0019_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;  -- expected: fixtures discarded
  end;

  -- ===================================================================
  -- FUNCTIONAL PROBE B (§3) — mark, then re-mark with a FRESH op key:
  -- idempotency case (b) returns {0,0,'noop'} and writes no second
  -- wiki_log/audit_log row; the first call's stale_at is preserved.
  -- ===================================================================
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_d := gen_random_uuid(); v_pg := gen_random_uuid(); v_ver := gen_random_uuid();
    v_cit := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0019 probe B firm');
    insert into clara.users(id, display_name) values (v_u, '0019 probe B user');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0019 probe B client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename)
      values (v_d, v_f, repeat('b', 64), 'probe-b.pdf');
    v_sha := repeat('c', 64);
    insert into clara.wiki_pages(id, firm_id, client_id, slug, page_kind, title)
      values (v_pg, v_f, v_c, 'profile', 'profile', 'Probe B');
    insert into clara.wiki_page_versions(id, page_id, firm_id, client_id, version_n,
        content, content_sha256, storage_key, size_bytes, state, synthesis)
      values (v_ver, v_pg, v_f, v_c, 1, 'probe b', v_sha,
        'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md',
        7, 'published', 'deterministic');
    update clara.wiki_pages set current_version_id = v_ver where id = v_pg;
    insert into clara.wiki_page_citations(id, version_id, firm_id, client_id,
        source_kind, document_id)
      values (v_cit, v_ver, v_f, v_c, 'document', v_d);
    insert into clara.wiki_page_refs(page_id, firm_id, client_id, ref_kind, document_id)
      values (v_pg, v_f, v_c, 'document', v_d);

    v_r := clara.mark_wiki_citations_stale(v_c, v_d, 'source_filing_retired', 'probe-b-1');
    if v_r ->> 'status' <> 'marked'
       or (v_r ->> 'citations_marked')::int <> 1
       or (v_r ->> 'refs_marked')::int <> 1 then
      raise exception '0019 functional B: the first mark did not mark both relations (got %)',
        v_r::text using errcode = 'CLR10';
    end if;
    select stale_at into v_stale from clara.wiki_page_citations where id = v_cit;
    if v_stale is null then
      raise exception '0019 functional B: the citation was not marked' using errcode = 'CLR10';
    end if;

    v_r := clara.mark_wiki_citations_stale(v_c, v_d, 'source_filing_retired', 'probe-b-2');
    if v_r ->> 'status' <> 'noop'
       or (v_r ->> 'citations_marked')::int <> 0
       or (v_r ->> 'refs_marked')::int <> 0 then
      raise exception '0019 functional B: a fresh-key re-mark was not a clean noop (got %)',
        v_r::text using errcode = 'CLR10';
    end if;
    if (select stale_at from clara.wiki_page_citations where id = v_cit)
         is distinct from v_stale then
      raise exception '0019 functional B: the re-mark moved the original stale_at'
        using errcode = 'CLR10';
    end if;
    if (select count(*) from clara.wiki_log
          where client_id = v_c and action = 'mark_stale') <> 1
       or (select count(*) from clara.audit_log
          where firm_id = v_f and fn = 'mark_wiki_citations_stale') <> 1 then
      raise exception '0019 functional B: a noop wrote an audit / wiki_log row'
        using errcode = 'CLR10';
    end if;
    -- amendment 4: a mark appends NOTHING to the spine.
    if exists(select 1 from clara.domain_events where firm_id = v_f) then
      raise exception '0019 functional B: a stale mark appended a domain event'
        using errcode = 'CLR10';
    end if;
    -- an unrecognised reason is a typed refusal.
    v_probe_ok := false;
    begin
      perform clara.mark_wiki_citations_stale(v_c, v_d, 'not_a_reason', 'probe-b-3');
    exception when sqlstate 'CLR10' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception '0019 functional B: an unrecognised reason was accepted'
        using errcode = 'CLR10';
    end if;

    raise exception 'clara_0019_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;
  end;

  -- ===================================================================
  -- FUNCTIONAL PROBE C (§1) — the inversion itself: retiring a filing that HAS a
  -- live wiki citation now SUCCEEDS and emits document.filing_retired. The human
  -- lane needs claims, so request.jwt.claims is set TRANSACTION-LOCALLY and is
  -- restored when the subtransaction unwinds.
  -- ===================================================================
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_d := gen_random_uuid(); v_pg := gen_random_uuid(); v_ver := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0019 probe C firm');
    insert into clara.users(id, display_name) values (v_u, '0019 probe C user');
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_f, v_u, 'bookkeeper', 'active');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0019 probe C client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename)
      values (v_d, v_f, repeat('d', 64), 'probe-c.pdf');
    insert into clara.document_filings(id, firm_id, document_id, client_id, filed_by, basis)
      values (gen_random_uuid(), v_f, v_d, v_c, v_u, 'legacy-0007');
    select id, revision_token into v_fil, v_rev from clara.document_filings
      where document_id = v_d and client_id = v_c;
    v_sha := repeat('e', 64);
    insert into clara.wiki_pages(id, firm_id, client_id, slug, page_kind, title)
      values (v_pg, v_f, v_c, 'profile', 'profile', 'Probe C');
    insert into clara.wiki_page_versions(id, page_id, firm_id, client_id, version_n,
        content, content_sha256, storage_key, size_bytes, state, synthesis)
      values (v_ver, v_pg, v_f, v_c, 1, 'probe c', v_sha,
        'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md',
        7, 'published', 'deterministic');
    update clara.wiki_pages set current_version_id = v_ver where id = v_pg;
    insert into clara.wiki_page_citations(version_id, firm_id, client_id, source_kind, document_id)
      values (v_ver, v_f, v_c, 'document', v_d);

    select coalesce(max(seq), 0) into v_seq0 from clara.domain_events where firm_id = v_f;
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_u)::text, true);
    v_r := clara.retire_document_filing(v_fil, '0019 probe C', v_rev, 'probe-c-1');
    perform set_config('request.jwt.claims', '', true);
    if v_r ->> 'status' <> 'retired' then
      raise exception '0019 functional C: retirement under a live wiki citation did not succeed (got %)',
        v_r::text using errcode = 'CLR10';
    end if;
    if not exists(select 1 from clara.document_filings
        where id = v_fil and retired_at is not null) then
      raise exception '0019 functional C: the filing was not retired' using errcode = 'CLR10';
    end if;
    select count(*) into v_n from clara.domain_events
      where firm_id = v_f and seq > v_seq0 and event_type = 'document.filing_retired';
    if v_n <> 1 then
      raise exception '0019 functional C: expected exactly one document.filing_retired, got %',
        v_n using errcode = 'CLR10';
    end if;
    -- the citation is untouched by the authority domain — the wiki converges by
    -- MARKING, driven by the retirement EVENT (§4), never inside the authority txn.
    if exists(select 1 from clara.wiki_page_citations
        where version_id = v_ver and stale_at is not null) then
      raise exception '0019 functional C: authority mutated wiki state in-band'
        using errcode = 'CLR10';
    end if;

    raise exception 'clara_0019_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$tail$;
