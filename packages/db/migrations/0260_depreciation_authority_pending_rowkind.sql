-- =====================================================================================
-- #974 (riders wave 2, lane 07) — "A blocked depreciation queue has no Needs-you row."
--
-- OWNER'S RULING (2026-09-20, gh#974): mint the ELEVENTH clara.list_review_queue row_kind,
-- `depreciation_authority_pending`, NOW — ahead of the slot the module's own header note
-- reserved for 裁-18b's agent vendor-binding proposal door. That reservation is VOID: refresh
-- spec decision O37 retires mandatory vendor/customer binding in favour of stable Client KB
-- identities learned from sources, so the door the slot was held for is not being built, and
-- there is nothing left to queue behind. Widening the existing `draft` kind (the ticket's
-- own Option A) stays rejected for the reason the ticket gave: it would change what an
-- existing kind means to every firm already reading it.
--
-- THE GAP THIS CLOSES (#651's own follow-up #3, restated by #974's Agent Brief): when a
-- client's depreciation authority is PROPOSED but not yet SIGNED
-- (clara.fa_depreciation_authorities.status='proposed', clara.propose_depreciation_authority,
-- bookkeeper+, 0041:3277), that client's WHOLE depreciation lane is blocked
-- (`_fa_run_period_core` refuses CLR38 `authority_not_live` for every period), and nothing at
-- firm altitude names it. `list_review_queue` never consulted
-- `clara.fa_depreciation_authorities` at all, so no row could appear from it today whatever
-- label were used.
--
-- THE LIVE DEFINITION OF THIS FUNCTION IS NOT THIS FILE'S TEXT. `clara.list_review_queue` was
-- born at 0011, REPLACED WHOLE by 0016 (compliance_watch), then DYNAMICALLY SPLICED
-- (pg_get_functiondef -> replace() -> execute, never re-typed) by 0017 (lint_finding + the
-- active-client guard on every prior CTE), 0036 (autodraft), 0041 S4.9 (fixed_asset_incomplete,
-- asset_id derived from the shared `id` column at json-build time), 0043 S3.8
-- (staff_advance_incomplete, advance_id, same idiom), 0146 (裁-17, seeding_proposal,
-- BATCH-level: client_name/batch_ids/open_proposal_count, its own dedicated columns because
-- that row's `id` is the CLIENT's id, not one proposal's), 0168 (the codeability conjunct on
-- filing_rows) and 0180 (#629, work_question, reusing the existing 30-key shape unchanged).
--
-- THE LIVE row_kind SET IS THEREFORE ELEVEN VALUES AFTER THIS FILE, not the nine the header
-- above this splice's own predecessor (0146) once counted before #629 landed the tenth: draft,
-- uncoded_filing, open_question, coding_task, compliance_watch, lint_finding,
-- fixed_asset_incomplete, staff_advance_incomplete, seeding_proposal, work_question and now
-- depreciation_authority_pending — see REVIEW_QUEUE_ROW_KINDS in
-- apps/web/lib/firm/needs-you.ts, the single source every label lookup is built from.
--
-- EXTENSION POINT, CORRECTED. The note this splice's predecessors carried ("a TENTH row_kind —
-- 裁-18b … deliberately deferred until this PR merges") was already overtaken by events before
-- this file: #629 shipped the tenth kind (work_question, 0180) without touching 裁-18b's door at
-- all, and this file's own owner ruling above now VOIDS 裁-18b's reservation outright rather
-- than merely deferring past it. A future twelfth kind starts from a clean slate, not from a
-- reservation this file inherits or extends.
--
-- WHY THIS ROW NEEDS NO AGGREGATION (unlike 0146's seeding_rows). A client carries AT MOST ONE
-- 'proposed' depreciation authority at a time — `uq_fa_authorities_proposed` is a partial
-- unique index on (client_id) WHERE status='proposed' (0041, widened by 0227's window columns
-- without touching this index) — so ONE authority row already IS one row per client, and
-- `authority_id` can mirror the shared `id` column at json-build time exactly the way
-- asset_id/advance_id do (0041 S4.9 / 0043 S3.8), rather than riding a dedicated CTE column the
-- way seeding_proposal's three keys must.
--
-- SECTION `needs_you`, LANE `needs_you` — not `needs_review`/NULL the way the two "incomplete
-- register row" kinds and seeding_proposal are. A proposed authority is not a housekeeping
-- backlog item: it is the SAME kind of block open_question and work_question are — a person
-- must act (an admin signs or withdraws) before the client's own accounting can proceed — so it
-- reads into `counts.needs_you` automatically through the existing `lane='needs_you'` filter,
-- with NO new counts.* key minted (the ticket's own brief: optional, and seeding_proposal set
-- the precedent of minting none).
--
-- WHICH CLIENTS CHASE: the active-client guard eight of the other ten kinds already carry
-- (0017 R1-F5). `propose_depreciation_authority` itself checks only firm membership, not client
-- status, but an archived client's authorities stop chasing exactly like every other kind's rows
-- do once the client is archived.
--
-- COMMENT-STRIPPED VERIFICATION (the 0141/M9 idiom, carried forward from 0146/0180's own HIGH-1
-- guard): every presence/count assertion below runs against a COMMENT-STRIPPED copy of the live
-- body, with a raw-vs-code cross-check at every marker, so a marker hiding inside a comment
-- cannot stand in for a real one.
--
-- PRE-IMAGE PIN, MEASURED ON clara_l07 (THIS RIG) NOW, off `pg_proc.prosrc` (never file text —
-- this body is a splice, not any one migration's CREATE): sha256(prosrc) =
-- 29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40. No ticket earlier in this
-- lane touches `clara.list_review_queue`, so this is the base wave-1 integration head's own
-- body, unmoved.
--
-- NO NEW GRANTED OBJECT, NO rig-meta COHORT. This file adds no new function signature, no new
-- table, no new grant — it recuts the BODY of an already-granted function in place, exactly as
-- 0146 and 0180 (the two direct precedents for this same operation) did. Both shipped with
-- neither a preintegration-gate module keyed to their own stem nor a rig-meta cohort, because
-- rig-meta's cohorts audit GRANT correctness on NEWLY introduced callable objects and there is
-- none here. This file still adds its OWN preintegration gate
-- (depreciation-authority-pending-rowkind-preintegration-gate.mjs) and frontier-gates its own
-- test on this file's stable stem, because unlike 0146/0180 this ticket also ships a NEW test
-- file that needs to be quiet-skip rather than hard-fail on a chain that predates 0260.
--
-- D1 WRITE-QUIESCE: not owed. This is a READER (STABLE SECURITY DEFINER) recut with no table
-- write outside the tail's own forced-rollback probe.
-- =====================================================================================

do $p974_pre$
declare v_sha text; v_def text; v_code text; v_n int; v_raw_n int; r record;
begin
  if to_regclass('clara.fa_depreciation_authorities') is null then
    raise exception '#974 prestate: clara.fa_depreciation_authorities is absent -- 0041 must apply first'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.list_review_queue(jsonb,jsonb,integer)') is null then
    raise exception '#974 prestate: clara.list_review_queue is GONE' using errcode = 'CLR10';
  end if;

  -- THE HARD PRE-IMAGE PIN (§2.2's measured-not-transcribed law): the prosrc this file was
  -- derived against, off pg_proc.prosrc, never pg_get_functiondef's wrapper text.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  if v_sha is distinct from '29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40' then
    raise exception '#974 prestate: clara.list_review_queue has DRIFTED from its pinned pre-image (measured %, expected 29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40) -- re-derive this splice against the LIVE body before applying', v_sha
      using errcode = 'CLR10';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- (a) IDEMPOTENCY, measured IN CODE so a comment cannot short-circuit a real apply.
  if position('depreciation_authority_pending' in v_code) <> 0 then
    raise exception '#974 prestate: the queue already projects depreciation_authority_pending -- this splice has already been applied'
      using errcode = 'CLR10';
  end if;

  -- (b) THE WITNESS ROSTER: the live body is the post-0180 body this splice was derived
  -- against — every one of the ten pre-existing kinds, at its exact pre-splice count, both IN
  -- CODE and cross-checked against the RAW count (HIGH-1: a marker hiding inside a comment
  -- must not stand in for a real one).
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1),
      ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'seeding_proposal'::text row_kind$$, 1),
      ($$'work_question'::text row_kind$$, 1),
      ('null::int open_proposal_count', 9),
      ('_is_codeable_kind', 1),
      ('_autodraft_attempt_budget', 1),
      ($$'advance_id',case when p.row_kind='staff_advance_incomplete' then p.id end,'autodraft'$$, 1)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#974 prestate: list_review_queue carries the marker "%" % time(s) IN CODE, expected % -- the body drifted or lost a prior splice', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
    v_raw_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_raw_n <> v_n then
      raise exception '#974 prestate (HIGH-1): marker "%" appears % time(s) in RAW text but % IN CODE -- % occurrence(s) hide inside a comment', r.marker, v_raw_n, v_n, (v_raw_n - v_n)
        using errcode = 'CLR10';
    end if;
  end loop;
  raise notice '#974 prestate OK: clara.list_review_queue pinned at prosrc sha256 %, carrying its ten pre-existing row kinds at their exact witness counts.', v_sha;
end
$p974_pre$;

set role clara_fn_owner;
set local lock_timeout = '5s';

-- =====================================================================================
-- THE SPLICE — an ADDITIVE recut, never a re-type. Reads the INSTALLED definition, splices
-- twice (the new CTE + union arm, then the row-json builder's authority_id gate), and
-- re-verifies every one of the ten pre-existing markers plus the two new ones.
-- =====================================================================================
do $p974_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_anchor text; v_repl text;
  v_n int; v_raw_n int; r record;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- =====================================================================
  -- SPLICE (1): the new authority_rows CTE + the all_rows union arm. Anchored on the WHOLE
  -- all_rows block (the 0146/0180 idiom) so both land in ONE replace().
  -- =====================================================================
  v_anchor :=
    '  ), all_rows as (' || chr(10) ||
    '    select * from draft_rows union all select * from filing_rows' || chr(10) ||
    '    union all select * from question_rows union all select * from task_rows' || chr(10) ||
    '    union all select * from compliance_rows union all select * from lint_rows' || chr(10) ||
    '    union all select * from fa_rows union all select * from adv_rows' || chr(10) ||
    '    union all select * from seeding_rows' || chr(10) ||
    '    union all select * from work_question_rows' || chr(10) ||
    '  ), keyed as (';
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception '#974 splice (1) prestate: the all_rows union block appears % time(s) IN CODE / % in RAW text (expected 1/1)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  v_repl := $auth$  ), authority_rows as (
    -- #974 (0260): A PROPOSED, UNSIGNED DEPRECIATION AUTHORITY BLOCKS THE WHOLE CLIENT'S
    -- DEPRECIATION LANE. Section `needs_you`, lane `needs_you` -- exactly like
    -- open_question/work_question: a person (an admin) must act -- sign
    -- (clara.sign_depreciation_authority) or withdraw (clara.retire_depreciation_authority) --
    -- before depreciation for this client can run at all. AT MOST ONE ROW PER CLIENT,
    -- unconditionally: uq_fa_authorities_proposed is a partial unique index on (client_id)
    -- WHERE status='proposed', so this CTE needs no aggregation, unlike seeding_rows. `id` IS
    -- the authority's own id; `authority_id` mirrors it at json-build time (the
    -- asset_id/advance_id idiom, 0041 S4.9 / 0043 S3.8), never a dedicated column, because it
    -- is fully derivable from the shared `id`. The active-client guard mirrors eight of the
    -- other ten kinds (0017 R1-F5).
    select 1 section_rank,'depreciation_authority_pending'::text row_kind,'needs_you'::text section,
      fda.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,fda.created_at aged_since,
      null::bigint amount_cents,null::text period,
      format('Depreciation authority awaiting signature (%s cadence)',fda.cadence) question_text,
      fda.created_at created_at,fda.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.fa_depreciation_authorities fda
    join clara.clients active_fda_client on active_fda_client.id=fda.client_id and active_fda_client.status='active'
    where fda.firm_id=c.firm and fda.status='proposed'
      and (v_client is null or fda.client_id=v_client)
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows union all select * from adv_rows
    union all select * from seeding_rows
    union all select * from work_question_rows
    union all select * from authority_rows
  ), keyed as ($auth$;
  v_next := replace(v_def, v_anchor, v_repl);
  if position('union all select * from authority_rows' in v_next) = 0 then
    raise exception '#974 splice (1): the all_rows anchor did not rewrite' using errcode = 'CLR10';
  end if;
  v_code := regexp_replace(regexp_replace(v_next, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- =====================================================================
  -- SPLICE (2): the row-json builder gains authority_id, gated exactly like asset_id/advance_id
  -- (0041 S4.9 / 0043 S3.8) -- derived from the shared `id` column at json-build time, never a
  -- new CTE column.
  -- =====================================================================
  v_anchor := $$'advance_id',case when p.row_kind='staff_advance_incomplete' then p.id end,'autodraft'$$;
  v_n := (length(v_code) - length(replace(v_code, v_anchor, ''))) / length(v_anchor);
  v_raw_n := (length(v_next) - length(replace(v_next, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 or v_raw_n <> v_n then
    raise exception '#974 splice (2) prestate: the row-json advance_id/autodraft anchor appears % time(s) IN CODE / % in RAW text (expected 1/1)', v_n, v_raw_n
      using errcode = 'CLR10';
  end if;
  v_repl := $$'advance_id',case when p.row_kind='staff_advance_incomplete' then p.id end,'authority_id',case when p.row_kind='depreciation_authority_pending' then p.id end,'autodraft'$$;
  v_next := replace(v_next, v_anchor, v_repl);
  if position('''authority_id'',case when p.row_kind=''depreciation_authority_pending''' in v_next) = 0 then
    raise exception '#974 splice (2): the row-json builder extension did not land' using errcode = 'CLR10';
  end if;

  if v_next = v_def then
    raise exception '#974 splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
  end if;

  execute v_next;

  -- =====================================================================
  -- POSTCHECK, both directions: the new kind landed, AND every one of the ten pre-existing
  -- kinds survived at its EXACT pre-splice marker count. Owner/ACL byte-unchanged; prosrc moved.
  -- =====================================================================
  select p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_post_owner, v_post_acl, v_post_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
    raise exception '#974 postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
      v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
  end if;
  if v_post_sha = v_pre_sha then
    raise exception '#974 postcheck: prosrc sha256 did not change -- the splice was a no-op' using errcode = 'CLR10';
  end if;

  v_code := regexp_replace(regexp_replace(
    (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1),
      ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1),
      ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1),
      ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1),
      ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'seeding_proposal'::text row_kind$$, 1),
      ($$'work_question'::text row_kind$$, 1),
      ($$'depreciation_authority_pending'::text row_kind$$, 1),
      ('_is_codeable_kind', 1),
      ('_autodraft_attempt_budget', 1),
      ($$'authority_id',case when p.row_kind='depreciation_authority_pending' then p.id end$$, 1)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#974 postcheck: marker "%" appears % time(s), expected % -- the splice was not additive', r.marker, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;
  -- `null::int open_proposal_count` gains ONE more occurrence (authority_rows' own trailing
  -- column) -- 9 pre-existing + this file's own = 10.
  v_n := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
         / length('null::int open_proposal_count');
  if v_n <> 10 then
    raise exception '#974 postcheck: the shared column vector appears % time(s), expected 10', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '#974: clara.list_review_queue spliced -- one authority_rows CTE (needs_you/needs_you, active-client-guarded, at most one row per client via uq_fa_authorities_proposed), one union arm, one authority_id json-builder gate (asset_id/advance_id idiom); the ten pre-existing row kinds survive at their EXACT pre-splice marker counts; owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
end
$p974_lrq$;

reset role;

-- =====================================================================================
-- TAIL: a BEHAVIOURAL probe (0146's forced-rollback-subtransaction idiom) proving the
-- INSTALLED function actually returns the new row for a real proposed authority, and that
-- withdrawing (retiring) it removes the row on the next read -- built and discarded so nothing
-- synthetic survives past this migration's own commit.
-- =====================================================================================
do $p974_probe$
declare
  v_probe_user uuid; v_probe_firm uuid; v_probe_client uuid;
  v_probe_propose jsonb; v_probe_authority uuid; v_probe_result jsonb; v_probe_row jsonb;
begin
  begin
    v_probe_user := gen_random_uuid();
    insert into clara.users(id, display_name) values (v_probe_user, '974-depreciation-authority-queue-row probe');
    insert into clara.firms(id, name) values (gen_random_uuid(), '974-depreciation-authority-queue-row probe firm')
      returning id into v_probe_firm;
    -- 'admin' satisfies BOTH propose_depreciation_authority's bookkeeper+ floor and
    -- retire_depreciation_authority's admin+ floor -- one membership exercises both real doors.
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_probe_firm, v_probe_user, 'admin', 'active');
    insert into clara.clients(firm_id, name, status)
      values (v_probe_firm, '974-depreciation-authority-queue-row probe client', 'active')
      returning id into v_probe_client;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_probe_user)::text, true);

    -- POSITIVE CASE: a real proposed authority, through the real door.
    v_probe_propose := clara.propose_depreciation_authority(v_probe_client, 'monthly', 'p974-probe-propose');
    v_probe_authority := (v_probe_propose ->> 'authority_id')::uuid;
    if v_probe_authority is null then
      raise exception '#974 BEHAVIOURAL probe: propose_depreciation_authority returned no authority_id'
        using errcode = 'CLR10';
    end if;

    v_probe_result := clara.list_review_queue(jsonb_build_object('client_id', v_probe_client), null, 50);
    select rw into v_probe_row from jsonb_array_elements(v_probe_result -> 'rows') rw
      where rw ->> 'row_kind' = 'depreciation_authority_pending' limit 1;
    if v_probe_row is null then
      raise exception '#974 BEHAVIOURAL probe: no depreciation_authority_pending row for a client with a real proposed authority -- the splice did not change runtime behaviour'
        using errcode = 'CLR10';
    end if;
    if (v_probe_row ->> 'client_id')::uuid <> v_probe_client then
      raise exception '#974 BEHAVIOURAL probe: the returned row names the wrong client_id (got %)', v_probe_row ->> 'client_id'
        using errcode = 'CLR10';
    end if;
    if (v_probe_row ->> 'id')::uuid <> v_probe_authority or (v_probe_row ->> 'authority_id')::uuid <> v_probe_authority then
      raise exception '#974 BEHAVIOURAL probe: id/authority_id do not both name the proposed authority (id=%, authority_id=%, expected %)',
        v_probe_row ->> 'id', v_probe_row ->> 'authority_id', v_probe_authority
        using errcode = 'CLR10';
    end if;
    if v_probe_row ->> 'section' <> 'needs_you' or v_probe_row ->> 'lane' <> 'needs_you' then
      raise exception '#974 BEHAVIOURAL probe: section/lane are not both needs_you (got section=%, lane=%)',
        v_probe_row ->> 'section', v_probe_row ->> 'lane'
        using errcode = 'CLR10';
    end if;
    if position('awaiting signature' in coalesce(v_probe_row ->> 'question_text', '')) = 0 then
      raise exception '#974 BEHAVIOURAL probe: question_text does not name an authority awaiting signature (got %)', v_probe_row ->> 'question_text'
        using errcode = 'CLR10';
    end if;

    -- WITHDRAW: retire_depreciation_authority removes the row on the next read.
    perform clara.retire_depreciation_authority(v_probe_client, v_probe_authority, 'p974 probe withdraw', 'p974-probe-retire');
    v_probe_result := clara.list_review_queue(jsonb_build_object('client_id', v_probe_client), null, 50);
    if exists (select 1 from jsonb_array_elements(v_probe_result -> 'rows') rw
               where rw ->> 'row_kind' = 'depreciation_authority_pending') then
      raise exception '#974 BEHAVIOURAL probe: the row survived retire_depreciation_authority (withdrawal) -- the read does not exclude a non-proposed status'
        using errcode = 'CLR10';
    end if;

    perform set_config('request.jwt.claims', '', true);

    -- Force the subtransaction to unwind so no fixture row (and no local GUC change) survives
    -- past this migration's own commit -- the 0018/0019/0020/0146 CLR99-probe idiom.
    raise exception 'clara_974_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null; -- expected: fixtures discarded
  end;
  raise notice '#974 BEHAVIOURAL probe OK: a proposed authority produced exactly one depreciation_authority_pending row (needs_you/needs_you, id=authority_id), and retire_depreciation_authority (withdraw) removed it on the next read. Fixtures discarded.';
end
$p974_probe$;
