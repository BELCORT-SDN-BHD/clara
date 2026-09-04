-- =====================================================================================
-- DB-A / 4 of 7 -- THE CODING LANE STOPS ASKING FOR WORK THAT CANNOT BE DONE (H-53).
--
-- APPLY ORDER: AFTER dba1 (clara._is_codeable_kind is born there).
--
-- TWO READERS, ONE GAP, BOTH DB-SIDE.
--
-- (a) clara.list_uncoded_filings -- the coding lane's population. LIVE BODY: 0011:3967's
--     text PLUS 0017:363-374's R1-F5 splice (the active-client join). The handover cites
--     0011:3967 alone; a file authored against that text would silently DELETE 0017's
--     operational exclusion, which is why this file SPLICES the live body rather than
--     re-cutting it from source. Its WHERE is retired_at, the client scope, and NOT EXISTS a
--     draft or live-approved entry ON THE FILING. It SELECTS d.document_kind and never
--     filters on it.
--
-- (b) clara.list_review_queue's filing_rows CTE -- the same predicate, and what puts
--     "Uncoded filing" on the client home. LIVE BODY: 0016:4558's CoR, spliced since by
--     0036 (the autodraft budget key), 0041 (the fixed_asset_incomplete row kind), 0043 and
--     0146 (the ninth row kind + three trailing columns). It is a SPLICE-ONLY body by
--     convention: 0036's own tail refuses a rebuild from 0016 in as many words.
--
-- THE CONSEQUENCE, in the professional's words. A consent_evidence document is an ordinary
-- ingested, client-attributed, FILED document that is stamped consent_evidence afterwards
-- (0014:102-114). 0014:185-186 makes it structurally exempt from facts extraction and
-- clara.set_document_kind refuses the kind outright (0123:1990, CLR28), so no journal entry
-- will EVER exist for it. It therefore appears in the coding queue as work to code and can
-- never leave. Same for every filed bank_statement, ssm_company_doc and identity_document.
--
-- WHY THE FRONT END CANNOT FIX THIS. apps/web/lib/coding/loaders.ts:22-31 filters the lane
-- list BY the filing ids list_uncoded_filings itself named -- a deliberate "never re-derive
-- either read's predicate" rule stated in its own header -- the agent reads the same RPC, and
-- the client-home count comes from the OTHER reader entirely. A web-side filter would be the
-- UI inventing a predicate the DB does not hold.
--
-- NULL IS ADMITTED, and that is the point. An unclassified document IS work: somebody must
-- say what it is. clara._is_codeable_kind returns true for NULL and for any kind the
-- codeability table does not name, so this conjunct removes only what has been positively
-- ruled to owe no entry.
--
-- NOT TOUCHED, deliberately: clara._coding_lane_core (live at 0031:302). The lane CLASSIFIER
-- stays honest for any filing it is ASKED about; it is the POPULATION readers that must
-- exclude. Changing the classifier would make a filing that reaches the lane by another route
-- lie about why it is there.
--
-- D1: both bodies are STABLE readers -- list_uncoded_filings SECURITY INVOKER,
-- list_review_queue SECURITY DEFINER -- and neither is an audited writer, so no
-- write-quiesce window is owed.
-- =====================================================================================

-- Precautionary, not load-bearing: two reader recuts, no data movement. The lock bound exists
-- so a genuinely stuck concurrent DDL session fails loudly instead of hanging the deploy.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara.list_uncoded_filings : SPLICE, never a rebuild.
--
-- The block reads the LIVE definition, verifies its anchors IN CODE and in RAW text (0146's
-- HIGH-1 discipline: a marker that survives only inside a comment would otherwise read as
-- present), rewrites the RAW text so every real comment in the installed body survives
-- byte-for-byte, and proves the rewrite landed exactly once.
-- =====================================================================================
do $dba4_uncoded$
declare
  v_sig text := 'clara.list_uncoded_filings(uuid)';
  v_def text; v_code text; v_next text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; v_cnt int;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
begin
  if to_regprocedure('clara._is_codeable_kind(text)') is null then
    raise exception 'dba4 prestate: clara._is_codeable_kind is absent -- dba1 must apply first'
      using errcode = 'CLR10';
  end if;
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text
    into v_def, v_pre_owner, v_pre_acl
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'dba4 prestate: clara.list_uncoded_filings is GONE' using errcode = 'CLR10';
  end if;
  -- Block comments FIRST, then line comments (0146's HIGH-1 order: a block comment must not
  -- be allowed to hide a live line-comment marker from the second pass).
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- IDEMPOTENCY.
  if position('_is_codeable_kind' in v_code) <> 0 then
    raise exception 'dba4 prestate: list_uncoded_filings already carries the codeability conjunct -- already applied to this database'
      using errcode = 'CLR10';
  end if;
  -- 0017's R1-F5 splice MUST be present in the body this file is about to rewrite. If it is
  -- absent, the live body is not the one described above and the rewrite would be built on a
  -- premise nobody checked.
  if position('active_uncoded_client.status=''active''' in v_code) = 0 then
    raise exception 'dba4 prestate: the live list_uncoded_filings does not carry 0017''s active-client join -- this is not the body this file was authored against'
      using errcode = 'CLR10';
  end if;
  -- SECURITY INVOKER is load-bearing here: the reader inherits the caller's RLS, which is why
  -- the predicate it calls had to be granted to clara_authenticated and clara_agent_ro.
  if exists (select 1 from pg_proc p where p.oid = v_sig::regprocedure and p.prosecdef) then
    raise exception 'dba4 prestate: list_uncoded_filings is SECURITY DEFINER -- the grant reasoning behind clara._is_codeable_kind does not hold'
      using errcode = 'CLR10';
  end if;

  v_anchor := 'where f.retired_at is null and (p_client is null or f.client_id=p_client)';
  v_n     := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_def)  - length(replace(v_def,  v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception 'dba4 splice: the list_uncoded_filings WHERE anchor appears % time(s) IN CODE / % in RAW text (expected 1/1)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  -- H-53: the ONE conjunct. NULL and unknown kinds are admitted by the predicate itself.
  v_repl := v_anchor || E'\n      and clara._is_codeable_kind(d.document_kind)';
  v_next := replace(v_def, v_anchor, v_repl);
  v_cnt  := (length(v_next) - length(v_def)) / (length(v_repl) - length(v_anchor));
  if v_cnt <> 1 then
    raise exception 'dba4 splice: the conjunct was installed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  execute v_next;

  -- POSTCHECK: the recut moved the body and NOTHING else. A CoR that silently changed owner
  -- or ACL is a different function wearing the same name.
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text
    into v_def, v_post_owner, v_post_acl
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
    raise exception 'dba4 postcheck: list_uncoded_filings changed owner (% -> %) or ACL', v_pre_owner, v_post_owner
      using errcode = 'CLR10';
  end if;
  if position('clara._is_codeable_kind(d.document_kind)' in v_def) = 0
     or position('active_uncoded_client.status=''active''' in v_def) = 0 then
    raise exception 'dba4 postcheck: the installed body lost the conjunct or 0017''s active-client join'
      using errcode = 'CLR10';
  end if;
  raise notice 'dba4 S1: clara.list_uncoded_filings spliced -- one conjunct, one occurrence, owner and ACL byte-identical, 0017''s active-client join intact.';
end $dba4_uncoded$;

-- =====================================================================================
-- S2 -- clara.list_review_queue's filing_rows : THE SAME EXCLUSION, THE SAME DEFINITION.
--
-- filing_rows joins document_filings to clara._coding_lane_core only -- it never reaches
-- clara.documents -- so the conjunct is written as an EXISTS over the document rather than as
-- a new join. A join would change the CTE's row cardinality if the FK ever admitted more than
-- one document per filing; an EXISTS cannot.
--
-- 0146's marker census is RE-DERIVED after this splice rather than copied, because a count
-- that is copied is a count that stops measuring.
-- =====================================================================================
do $dba4_queue$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_code text; v_next text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; v_cnt int; r record;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text
    into v_def, v_pre_owner, v_pre_acl
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'dba4 prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  if position('_is_codeable_kind' in v_code) <> 0 then
    raise exception 'dba4 prestate: list_review_queue already carries the codeability conjunct -- already applied to this database'
      using errcode = 'CLR10';
  end if;

  -- PRESTATE WITNESS: the live body is the post-0146 one this splice was derived against.
  -- Each marker is counted IN CODE and in RAW text; a divergence means an occurrence is
  -- hiding inside a comment, which is 0146's HIGH-1 finding and is refused here, not
  -- silently accepted.
  for r in select * from (values
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ('seeding_proposal', 2),
      ('_autodraft_attempt_budget', 1),
      ('cross join lateral clara._coding_lane_core(f.client_id,f.id) ln', 1)) as t(marker, want) loop
    v_n     := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    v_raw_n := (length(v_def)  - length(replace(v_def,  r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'dba4 prestate: list_review_queue carries the marker "%" % time(s) IN CODE, expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
    if v_raw_n <> v_n then
      raise exception 'dba4 prestate (HIGH-1): marker "%" appears % time(s) in RAW text but % IN CODE -- an occurrence is hiding inside a comment', r.marker, v_raw_n, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  v_anchor := 'where f.firm_id=c.firm and f.retired_at is null';
  v_n     := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_def)  - length(replace(v_def,  v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception 'dba4 splice: the filing_rows WHERE anchor appears % time(s) IN CODE / % in RAW text (expected 1/1) -- it must identify filing_rows and nothing else', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  v_repl := v_anchor || E'\n      and exists(select 1 from clara.documents kd where kd.id=f.document_id'
                     || E'\n                  and clara._is_codeable_kind(kd.document_kind))';
  v_next := replace(v_def, v_anchor, v_repl);
  v_cnt  := (length(v_next) - length(v_def)) / (length(v_repl) - length(v_anchor));
  if v_cnt <> 1 then
    raise exception 'dba4 splice: the filing_rows conjunct was installed % time(s), expected 1', v_cnt
      using errcode = 'CLR10';
  end if;
  execute v_next;

  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text
    into v_def, v_post_owner, v_post_acl
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
    raise exception 'dba4 postcheck: list_review_queue changed owner (% -> %) or ACL', v_pre_owner, v_post_owner
      using errcode = 'CLR10';
  end if;
  -- RE-DERIVED, not copied: every marker the prestate counted must still hold, so the splice
  -- is proven additive rather than asserted to be.
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  for r in select * from (values
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ('seeding_proposal', 2),
      ('_autodraft_attempt_budget', 1),
      ('cross join lateral clara._coding_lane_core(f.client_id,f.id) ln', 1)) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'dba4 postcheck: list_review_queue lost the marker "%" (% of %) -- the splice was not additive', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  raise notice 'dba4 S2: clara.list_review_queue''s filing_rows spliced -- one conjunct, one occurrence, owner and ACL byte-identical, and every pre-existing row-kind marker re-derived at its prestate count.';
end $dba4_queue$;

reset role;

-- =====================================================================================
-- TAIL CENSUS -- behavioural, in both directions, on a planted fixture.
-- =====================================================================================
do $dba4_tail$
declare
  v_firm uuid; v_user uuid; v_client uuid; v_doc uuid;
  v_consent uuid; v_unclassified uuid; v_invoice uuid;
  v_ids uuid[]; v_kinds int;
begin
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.list_uncoded_filings(uuid)', 'execute')
     or not pg_catalog.has_function_privilege('clara_agent_ro', 'clara.list_uncoded_filings(uuid)', 'execute') then
    raise exception 'dba4 tail: list_uncoded_filings lost a grant the ACL census pins' using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara._is_codeable_kind(text)', 'execute')
     or not pg_catalog.has_function_privilege('clara_agent_ro', 'clara._is_codeable_kind(text)', 'execute') then
    raise exception 'dba4 tail: clara._is_codeable_kind is not executable by both roles that call the SECURITY INVOKER reader -- the recut reader would 42501 in production'
      using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.list_review_queue(jsonb,jsonb,integer)', 'execute') then
    raise exception 'dba4 tail: list_review_queue lost its clara_authenticated grant' using errcode = 'CLR10';
  end if;

  v_user := gen_random_uuid();
  insert into clara.users(id, display_name) values (v_user, 'dba4 tail probe');
  insert into clara.firms(id, name) values (gen_random_uuid(), 'dba4 tail firm ' || gen_random_uuid())
    returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role, status)
    values (v_firm, v_user, 'viewer', 'active');
  insert into clara.clients(firm_id, name, status)
    values (v_firm, 'dba4 tail client', 'active') returning id into v_client;

  -- Three filings, no entries on any of them: one CONSENT_EVIDENCE (must vanish), one
  -- UNCLASSIFIED (must remain -- it is work, it just needs classifying first) and one
  -- INVOICE (the must-not-go-green control).
  insert into clara.documents(firm_id, sha256, document_kind)
    values (v_firm, repeat('e', 64), 'consent_evidence') returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007') returning id into v_consent;
  insert into clara.documents(firm_id, sha256) values (v_firm, repeat('f', 64)) returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007') returning id into v_unclassified;
  insert into clara.documents(firm_id, sha256, document_kind)
    values (v_firm, repeat('1', 64), 'invoice') returning id into v_doc;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
    values (v_firm, v_doc, v_client, v_user, 'legacy-0007') returning id into v_invoice;

  select coalesce(array_agg((r ->> 'filing_id')::uuid order by r ->> 'filing_id'), '{}'::uuid[])
    into v_ids from clara.list_uncoded_filings(v_client) r;
  if v_consent = any (v_ids) then
    raise exception 'dba4 tail: a consent_evidence filing is STILL in the coding lane -- H-53 is not fixed'
      using errcode = 'CLR10';
  end if;
  if not (v_unclassified = any (v_ids)) then
    raise exception 'dba4 tail CONTROL: an UNCLASSIFIED filing vanished from the coding lane -- a NULL kind must stay visible as still-work'
      using errcode = 'CLR10';
  end if;
  if not (v_invoice = any (v_ids)) then
    raise exception 'dba4 tail CONTROL: an INVOICE filing vanished from the coding lane -- the exclusion is over-broad and the lane has stopped working'
      using errcode = 'CLR10';
  end if;
  if array_length(v_ids, 1) <> 2 then
    raise exception 'dba4 tail: the lane returned % filing(s) for the probe client, expected exactly 2', coalesce(array_length(v_ids, 1), 0)
      using errcode = 'CLR10';
  end if;

  select count(*)::int into v_kinds from clara.document_kind_codeability where not codeable;
  raise notice 'dba4 tail: OK -- both population readers now exclude the % non-codeable kinds through the ONE definition in clara.document_kind_codeability, and neither re-derives it. clara.list_uncoded_filings was SPLICED (not rebuilt), keeping 0017''s R1-F5 active-client join, its SECURITY INVOKER posture, its owner and its byte-identical ACL; clara.list_review_queue''s filing_rows was spliced the same way with every pre-existing row-kind marker RE-DERIVED at its prestate count, so the change is proven additive. clara._is_codeable_kind is executable by both roles that reach the invoker-posture reader (clara_authenticated, clara_agent_ro), so the recut cannot 42501 in production. BEHAVIOURALLY EXERCISED: of three entry-less filings on a planted client, the coding lane returns exactly 2 -- the consent_evidence filing is gone, the UNCLASSIFIED one and the INVOICE both remain (the two must-not-go-green controls). clara._coding_lane_core is deliberately UNTOUCHED: the lane classifier stays honest about any filing it is asked about. No table in workflow/graphile_worker/spike touched. D1: two STABLE readers, no audited writer replaced, no write-quiesce window owed.', v_kinds;

  raise exception using errcode = 'CLR00', message = 'dba4 tail probe rollback';
exception when sqlstate 'CLR00' then
  raise notice 'dba4 tail: the behavioural fixture was rolled back -- nothing this block planted survives.';
end $dba4_tail$;
