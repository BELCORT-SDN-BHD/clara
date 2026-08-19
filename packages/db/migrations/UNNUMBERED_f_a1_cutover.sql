-- UNNUMBERED_f_a1_cutover.sql -- Wave-F Track A, F-A1 (the LLM witness-pair extraction),
-- PR-3: THE CUTOVER. Number claimed at MERGE time (standing law, AGENTS.md +
-- .claude/rules/db-migrations.md). Design of record:
-- docs/plan/active/f-a1-witness-pair-design.md SS3.5/SS3.8/SS6.4, D7, D9 +
-- f-a1-annexes.md Annex A walls 4/10/12.
--
-- DEPLOY ORDER (BINDING, design SS6.4): this file applies (a) AFTER
-- UNNUMBERED_f_a1_writer_rotation.sql -- checked in this file's own prestate (the
-- facts_rotated marker) -- and (b) only after the PR-2 runtime image (witnessFacts.v1 +
-- enqueueForLane's llm_witness arm + startWorld's enqueueWitnessFacts dep) is verified LIVE.
-- There is no DB-side prestate check that can
-- enforce (b) -- the runtime image version is not a fact this database holds
-- anywhere, so this file cannot refuse itself against an absent runtime the way it can
-- refuse itself against an absent migration. Stated honestly rather than smuggled: the
-- ceremony recipe carries this obligation (packages/db/README.md, "Deploy contract" --
-- runtime-image-first for a lane whose enqueue is runtime-mediated). Fail-closed the OTHER
-- direction is structural and IS checked here transitively: an old runtime image that
-- somehow ran against this post-cutover database could not mint anything on the new lane
-- regardless -- `enqueueForLane`'s explicit allowlist (a runtime-side file) and the lane/
-- prefix CHECKs (0090, already live) both refuse an unrecognised or malformed llm_witness
-- task independently of this file, so a wrong-order deploy fails LOUD on the runtime side,
-- never silently on the DB side.
--
-- WHAT THIS FILE DOES. Three pieces, in the order the design's SS6.4 names them:
--   1. THE ROUTER RECUT (wall-carrying, wb-0020 PINNED): `_enqueue_invoice_facts_core`'s
--      invoice-kind arm (the SAME four document_kind values it serves today -- invoice,
--      credit_note, debit_note, receipt -- mirrored, never widened) mints `llm_witness`
--      INSTEAD of `invoice_facts`. NO DUAL-RUN. The already_completed short-circuit's
--      per-lane engine_kind map gains `llm_witness -> llm_text_facts` (the CANONICAL
--      witness row, SS3.1/SS3.3 -- the writer inserts both rows atomically in the SAME
--      transaction, 0095 section 8, so a done text row is a done pair). The v_lane='llm_witness'
--      enqueue-time typed-consent gate PR-1 shipped INERT (0090 section 7e) is now LIVE for
--      the first time -- this file does not touch that branch's text at all, only the
--      upstream assignment that feeds it. Statement documents are BYTE-UNTOUCHED (the
--      bank_statement arm, the csv/ofx arm, the xml arm, the page-budget reservation list
--      restricted to invoice_facts/statement_facts) -- meter-never-cap (D6): llm_witness
--      joins NEITHER page-budget reserving arm, so the firm daily page budget structurally
--      stops applying to the invoice path at this cutover (registered exposure, design SS3.6/
--      SS8 -- the attempt cap + the witness-own concurrency window, both already live since
--      PR-1, are the engine-protective brakes that remain).
--   2. clara.fail_witness_facts(p_task uuid, p_code text) -- THE SETTLE VERB PR-2's own
--      review found missing. Mirrors clara.fail_invoice_facts' shape (running->failed,
--      EXECUTE to clara_runtime only). Per PR-2's delta review (D6), the runtime's terminal
--      settle DOES call this verb, with an EXACT eight-code vocabulary (bad_type, limit,
--      internal, corrupt, encrypted, witness_consent_inactive, witness_multi_client,
--      wait_exhausted -- the last new, PR-2's bounded-WAIT settle); section 2a widens
--      ck_processing_task_error_code_f_a1 for the one genuinely new literal. No PR-2 runtime
--      file is edited here -- this is the DB-side half of that contract.
--   3. `request_reextraction` DOOR WIDENING (D7, NOT wb-0020 pinned -- only the two claim-
--      body / enqueue-core functions carry that pin, wall 12). The admission door's PRIMARY
--      branch ('reextraction') widens to recognise a done llm_text_facts row alongside a done
--      invoice_facts row -- BRANCH ORDER MATTERS: because this is the FIRST `if` arm, a
--      witness-done receipt admits HERE and never falls through to the second arm
--      ('receipt_backfill'), which exists only for the pre-0025 population that structurally
--      could never have a prior extraction at all. The hardcoded retiring Azure engine
--      constant (0026:1059 lineage) is replaced by the SAME llm_witness/engine-literal pair
--      the router mints -- a re-extraction and a first extraction now buy the identical
--      product. The page-budget reservation clause (`if not v_reused and v_lane =
--      'invoice_facts'`) is left BYTE-UNTOUCHED -- it is dead code for the invoice arm now
--      (v_lane can no longer equal 'invoice_facts' once the kind gate passes), which IS the
--      "reservation stays invoice_facts-only" contract: no reservation ever fires for a
--      witness re-extraction, achieved by NOT editing this line rather than by adding a
--      witness exclusion to it.
--
-- THE ENGINE LITERAL CONTRACT (LOCKED, both builders' terms): 'llm-openai:gpt-5.6-terra:v1'
-- MUST string-equal packages/runtime/workflows/witnessFacts.v1.services.mjs's
-- WITNESS_ENGINE_SNAPSHOT.engineId (built from WITNESS_MODEL_ID default 'gpt-5.6-terra' +
-- WITNESS_ENGINE_VERSION 'v1', prefixed 'llm-openai:'). Verified by direct source read in
-- packages/db/tests/f-a1-cutover.test.mjs (battery cell f-a1.cutover-engine-literal) -- not
-- assumed, not re-derived, both sides read and compared.
--
-- D1 WRITE-QUIESCE: both `_enqueue_invoice_facts_core` and `request_reextraction` are LIVE
-- hot-path bodies (every filing, every human re-extraction request) -- this ceremony takes
-- the D1 write-quiesce window exactly as 0090 did for the same first function
-- (packages/db/README.md, "Deploy contract"). `clara.fail_witness_facts` is a brand-new
-- verb; no quiesce obligation attaches to it alone.
--
-- SPLICE DISCIPLINE (0040 S4.11a / 0090 section 10's, verbatim in shape): read the LIVE body
-- via pg_get_functiondef, assert the target substring occurs EXACTLY ONCE, replace() only
-- there, execute the result. Nothing else in either body is retyped, so every arm this file
-- does not name survives BY CONSTRUCTION -- the read-the-live-body-not-the-file discipline
-- this repo's history keeps re-learning the cost of skipping.
set local statement_timeout = '10min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE.
-- =====================================================================================
do $pre$
declare v_src text; v_sha text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0095_f_a1_writer') then
    raise exception 'f_a1_cutover prestate: 0095_f_a1_writer is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  -- _enqueue_invoice_facts_core: the EXACT body 0090 section 7e's own postcheck pinned
  -- (99f18f4e...) -- no migration between 0090 and this file's prestate touches it (verified:
  -- a repo-wide grep of 0091-0095 for the function name finds no other CREATE OR REPLACE).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_src is null then raise exception 'f_a1_cutover prestate: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '99f18f4e90022b191826db7e654696c753c8e210711f00026bc4b72c9975d723' then
    raise exception 'f_a1_cutover prestate: clara._enqueue_invoice_facts_core prosrc sha256 mismatch (got %, expected 99f18f4e90022b191826db7e654696c753c8e210711f00026bc4b72c9975d723) -- this is not the 0090 S7e body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('v_lane:=''llm_witness''; v_engine:=' in v_src) <> 0 then
    raise exception 'f_a1_cutover prestate: _enqueue_invoice_facts_core ALREADY mints llm_witness for the invoice arm -- already applied' using errcode='CLR10';
  end if;

  if to_regprocedure('clara.fail_witness_facts(uuid,text)') is not null then
    raise exception 'f_a1_cutover prestate: clara.fail_witness_facts already exists -- already applied' using errcode='CLR10';
  end if;
  perform 'clara.fail_invoice_facts(uuid,text)'::regprocedure; -- the shape precedent must exist
  perform 'clara._refund_processing_call(uuid,text)'::regprocedure;
  perform 'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'::regprocedure;
  if exists (select 1 from pg_constraint
      where conname = 'ck_processing_task_error_code_f_a1'
        and pg_get_constraintdef(oid) like '%wait\_exhausted%') then
    raise exception 'f_a1_cutover prestate: ck_processing_task_error_code_f_a1 ALREADY admits wait_exhausted -- already applied' using errcode='CLR10';
  end if;
  -- UNNUMBERED_f_a1_writer_rotation.sql must apply BEFORE this file (both files' headers name
  -- the ordering) -- checked here by its own load-bearing marker, not assumed.
  if position('facts_rotated' in
      (select p.prosrc from pg_proc p where p.oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure)) = 0 then
    raise exception 'f_a1_cutover prestate: persist_witness_facts does not carry facts_rotated -- UNNUMBERED_f_a1_writer_rotation.sql must apply BEFORE this file' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure;
  if v_src is null then raise exception 'f_a1_cutover prestate: clara.request_reextraction is GONE' using errcode='CLR10'; end if;
  if position('v_lane := ''llm_witness''' in v_src) <> 0 then
    raise exception 'f_a1_cutover prestate: request_reextraction ALREADY mints llm_witness -- already applied' using errcode='CLR10';
  end if;
  if position('e.engine_kind in (''invoice_facts'', ''llm_text_facts'')' in v_src) <> 0 then
    raise exception 'f_a1_cutover prestate: request_reextraction''s admission door is ALREADY widened -- already applied' using errcode='CLR10';
  end if;

  -- The witness engine-kind vocabulary this file depends on (0090 wall 1) must already be
  -- live, or the router recut below would mint a task whose already_completed lookup names a
  -- non-existent engine_kind.
  if not exists (select 1 from pg_constraint
      where conname = 'ck_document_extractions_engine_kind_f_a1'
        and pg_get_constraintdef(oid) like '%llm\_text\_facts%') then
    raise exception 'f_a1_cutover prestate: the witness engine_kind CHECK (llm_text_facts/llm_vision_facts) is not live -- apply 0090 first' using errcode='CLR10';
  end if;

  raise notice 'f_a1_cutover prestate: clean -- _enqueue_invoice_facts_core is the exact 0090 S7e body, request_reextraction is the exact 0026 body (neither already cut over), fail_witness_facts absent, the witness engine_kind vocabulary is live';
end
$pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- THE ROUTER RECUT. _enqueue_invoice_facts_core's invoice-kind arm mints
-- llm_witness; the already_completed map gains llm_witness -> llm_text_facts. wb-0020
-- PINNED -- the restore pair in packages/db/tests/wave-b/wb-0020-legacy.test.mjs is
-- extended in the SAME PR (below the DB change, listed for the record; the file itself is
-- edited separately from this migration since it is a test, not schema).
-- =====================================================================================
do $router$
declare
  v_sig text := 'clara._enqueue_invoice_facts_core(uuid)';
  v_def text; v_frm1 text; v_to1 text; v_frm2 text; v_to2 text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'f_a1_cutover S1 prestate: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10';
  end if;

  -- Edit 1: the invoice-kind arm mints llm_witness instead of invoice_facts. EXACTLY the
  -- same document_kind set (invoice, credit_note, debit_note, receipt) -- this text is not
  -- part of either splice target, so the condition itself is untouched.
  v_frm1 := $f1$    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm1, ''))) / length(v_frm1);
  if v_cnt <> 1 then
    raise exception 'f_a1_cutover S1 prestate: the invoice-kind mint arm appears % times (expected exactly 1) -- the live body drifted from the 0090 S7e shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to1 := $t1$    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness
      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm
      -- served (mirrored above, never widened here). v_engine MUST string-equal
      -- WITNESS_ENGINE_SNAPSHOT.engineId in witnessFacts.v1.services.mjs -- battery cell
      -- f-a1.cutover-engine-literal reads both sides and asserts equality.
      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v1';$t1$;
  v_def := replace(v_def, v_frm1, v_to1);

  -- Edit 2: the already_completed short-circuit's per-lane engine_kind map gains
  -- llm_witness -> llm_text_facts (the canonical, region-bearing row -- SS3.1/SS3.3; the
  -- writer inserts BOTH rows atomically in one transaction, 0095 section 8, so a done text
  -- row is a done pair and the vision row carries no independent completion signal a
  -- re-fire needs to consult).
  v_frm2 := $f2$    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')
                       then 'statement_facts'  -- BOTH statement lanes settle a
                       -- statement_facts extraction (the lane records how the read was
                       -- bought; the engine_kind what it is -- the 0026:709 precedent)
                       else 'invoice_facts' end;$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm2, ''))) / length(v_frm2);
  if v_cnt <> 1 then
    raise exception 'f_a1_cutover S1 prestate: the already_completed engine_kind map appears % times (expected exactly 1) -- the live body drifted from the 0090 S7e shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to2 := $t2$    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')
                       then 'statement_facts'  -- BOTH statement lanes settle a
                       -- statement_facts extraction (the lane records how the read was
                       -- bought; the engine_kind what it is -- the 0026:709 precedent)
                       when v_lane='llm_witness'
                       then 'llm_text_facts'  -- F-A1 PR-3: the CANONICAL witness row --
                       -- a done text row proves a done PAIR (one atomic writer transaction,
                       -- 0095 section 8), so a re-fire is suppressed the moment the pair lands.
                       else 'invoice_facts' end;$t2$;
  v_def := replace(v_def, v_frm2, v_to2);

  execute v_def;
end
$router$;

reset role;

do $router_post$
declare v_src text; v_n int;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if position($m$v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v1';$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the invoice-kind arm does not mint llm_witness with the locked engine literal' using errcode='CLR10';
  end if;
  if position($m$v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';$m$ in v_src) <> 0 then
    raise exception 'f_a1_cutover S1 postcheck: the OLD invoice_facts mint text is still present -- the splice did not remove it' using errcode='CLR10';
  end if;
  if position($m$when v_lane='llm_witness'
                       then 'llm_text_facts'$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the already_completed map does not resolve llm_witness -> llm_text_facts' using errcode='CLR10';
  end if;
  -- Every branch this file does NOT name must survive verbatim.
  if position($m$elsif v_lane='llm_witness' then$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the 0090 S7e enqueue-time typed-consent gate branch (now LIVE for the first time) was lost' using errcode='CLR10';
  end if;
  if position($m$v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the bank_statement arm moved -- it must stay byte-untouched' using errcode='CLR10';
  end if;
  if position($m$v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the csv/ofx statement_parse arm moved -- it must stay byte-untouched' using errcode='CLR10';
  end if;
  if position($m$if v_lane in ('invoice_facts','statement_facts') then$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the page-budget reserving lane list moved -- llm_witness must NOT join it (meter-never-cap, D6)' using errcode='CLR10';
  end if;
  if position('llm_witness' in
      substring(v_src from position($m$if v_lane in ('invoice_facts','statement_facts') then$m$ in v_src)
                for 200)) <> 0 then
    raise exception 'f_a1_cutover S1 postcheck: llm_witness leaked into the page-budget reserving list -- meter-never-cap (D6) violated' using errcode='CLR10';
  end if;
  if position($m$d.document_kind in ('invoice','credit_note','debit_note','receipt')$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S1 postcheck: the invoice-kind condition set moved or narrowed/widened -- it must mirror the retired arm exactly' using errcode='CLR10';
  end if;
  -- ACL: still ungranted to every role but clara_fn_owner (0090 S7e's own posture,
  -- CREATE OR REPLACE preserves it, re-measured rather than assumed).
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
    where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure and a.grantee<>'clara_fn_owner'::regrole;
  if v_n <> 0 then
    raise exception 'f_a1_cutover S1 postcheck: _enqueue_invoice_facts_core gained a grant to a role other than clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_cutover S1 postcheck: _enqueue_invoice_facts_core is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  raise notice 'f_a1_cutover S1: _enqueue_invoice_facts_core recut -- the invoice-kind arm (invoice/credit_note/debit_note/receipt, unwidened) now mints llm_witness with engine llm-openai:gpt-5.6-terra:v1; already_completed resolves llm_witness via the canonical llm_text_facts row; the 0090 S7e consent gate is unchanged text but now LIVE; every other arm (bank_statement, statement_parse, classify, xml, the page-budget reserving list) verified byte-unmoved; ACL/ownership unmoved.';
end
$router_post$;

-- =====================================================================================
-- SECTION 2 -- clara.fail_witness_facts(p_task uuid, p_code text). Mirrors
-- clara.fail_invoice_facts' shape (0009:2152): running->failed, EXECUTE to clara_runtime
-- only, no PUBLIC.
--
-- THE ADMITTED VOCABULARY (binding addendum from PR-2's delta review, D6 -- the runtime's
-- terminal settle calls this verb with this EXACT set, not a superset): bad_type, limit,
-- internal, corrupt, encrypted, witness_consent_inactive, witness_multi_client,
-- wait_exhausted (PR-2's bounded-WAIT settle, new). Any code OUTSIDE this eight-member set
-- -- including the generic engine_error/timeout/engine_lost/storage_error/budget/attempt_cap
-- family fail_invoice_facts/fail_statement_facts admit -- falls through to 'engine_error',
-- the same coercion those two verbs already apply to an unrecognised p_reason, never a raise.
--
-- THREE STRUCTURAL SITES CHECKED, NOT ASSUMED (per the addendum's own instruction to read
-- each rather than widen blind):
--   (a) ck_processing_task_error_code_f_a1 (0090 wall 7) admits SEVEN of the eight already
--       (bad_type, limit, internal, corrupt, encrypted, witness_multi_client,
--       witness_consent_inactive) -- 'wait_exhausted' is the ONE genuinely new literal, so
--       section 2a below widens this CHECK by name, the same CoR discipline every prior wall
--       recut in this estate uses.
--   (b) ck_processing_task_binding_f_a1: read in full (0090 section 8) -- its failed-status
--       arm is `(workflow_run_id is not null and started_at is not null) OR (never-claimed
--       shape, an 8-item allowlist)`. fail_witness_facts only ever transitions an already-
--       CLAIMED task (running, so workflow_run_id/started_at are both already set) -- the
--       CLAIMED-shape arm carries NO error_code restriction at all. 'wait_exhausted' needs no
--       binding-CHECK change; the enqueue-time gate's never-claimed allowlist is untouched by
--       this section (it stays exactly the two witness consent codes -- wall 13's own scope).
--   (c) clara._tf_processing_task_update's TRANSITION TABLE (0090 section 10, wall 13): the
--       running->failed arm reads, verbatim, `(old.status='running' and new.status in
--       ('done','failed','queued','held_egress'))` -- NO error_code test and NO lane test at
--       all. It already admits ANY code on a running->failed move, 'wait_exhausted' included;
--       nothing to widen. Wall 13 itself is scoped to the QUEUED->failed arm alone (the
--       enqueue gate's in-place flip), which this section does not touch and does not need to
--       -- confirmed by re-reading the live trigger body, not assumed from its name.
-- =====================================================================================
set role clara_fn_owner;

-- 2a. ck_processing_task_error_code_f_a1 gains 'wait_exhausted' -- the one literal in the
-- runtime's terminal vocabulary the 0090 CHECK does not yet admit.
alter table clara.document_processing_tasks drop constraint ck_processing_task_error_code_f_a1;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_f_a1 check (
  error_code is null or error_code in
    ('engine_error','timeout','engine_lost','storage_error','corrupt','encrypted',
     'bad_type','limit','budget','attempt_cap','internal','skipped_kind',
     'header_unreadable','totals_unreadable','readers_disagree','chain_broken',
     'continuity_mismatch','duplicate_period','overlapping_period','non_myr_statement',
     'account_unregistered','account_inactive','statement_multi_client','period_invalid',
     'line_date_out_of_period','consent_inactive','witness_multi_client','witness_consent_inactive',
     'wait_exhausted'));

do $s2a_post$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conname='ck_processing_task_error_code_f_a1'
      and conrelid='clara.document_processing_tasks'::regclass;
  if v_def is null or v_def not like '%wait_exhausted%' then
    raise exception 'f_a1_cutover S2a postcheck: ck_processing_task_error_code_f_a1 does not admit wait_exhausted' using errcode='CLR10';
  end if;
  if v_def not like '%witness_multi_client%' or v_def not like '%witness_consent_inactive%'
     or v_def not like '%header_unreadable%' or v_def not like '%engine_error%' then
    raise exception 'f_a1_cutover S2a postcheck: the recut CHECK dropped a pre-existing admitted code' using errcode='CLR10';
  end if;
  raise notice 'f_a1_cutover S2a: ck_processing_task_error_code_f_a1 widened -- wait_exhausted joins the admitted vocabulary; every pre-existing code (base engine/transport, statement family, both witness consent codes, skipped_kind) survives verbatim.';
end
$s2a_post$;

-- 2b. clara.fail_witness_facts itself.
create function clara.fail_witness_facts(p_task uuid, p_code text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_code text;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found or t.lane<>'llm_witness' then
    raise exception 'witness-facts task not found' using errcode='CLR16';
  end if;
  if t.status='failed' then
    return jsonb_build_object('task_id',p_task,'status','failed',
      'reason',coalesce(t.error_code,p_code),'replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'witness-facts task is not running' using errcode='CLR16';
  end if;
  -- THE ADMITTED VOCABULARY, per PR-2's delta review D6 -- the EXACT eight codes the runtime's
  -- terminal settle sends, and nothing broader. Anything else coerces to 'engine_error',
  -- exactly as fail_invoice_facts/fail_statement_facts already coerce an unrecognised reason.
  v_code:=case when p_code in ('bad_type','limit','internal','corrupt','encrypted',
      'witness_consent_inactive','witness_multi_client','wait_exhausted')
    then p_code else 'engine_error' end;
  update clara.document_processing_tasks set status='failed',error_code=v_code,
    finished_at=now() where id=p_task;
  -- Harmless unconditionally: llm_witness never reserves a page budget (meter-never-cap,
  -- D6/section 1 above), so this call always finds no reservation and returns null
  -- (0038:7128's own precedent, N3) -- called anyway for the SAME reason
  -- fail_invoice_facts/fail_statement_facts call it unconditionally: uniform shape over a
  -- lane-conditional one.
  perform clara._refund_processing_call(p_task,coalesce(nullif(btrim(p_code),''),v_code));
  perform clara._audit(t.firm_id,null,null,null,'fail_witness_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'reason',v_code));
  perform clara._append_event(t.firm_id,'document.llm_witness_failed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason',v_code));
  return jsonb_build_object('task_id',p_task,'status','failed','reason',v_code);
end $$;
alter function clara.fail_witness_facts(uuid,text) owner to clara_fn_owner;
revoke all on function clara.fail_witness_facts(uuid,text) from public;
grant execute on function clara.fail_witness_facts(uuid,text) to clara_runtime;

reset role;

do $fail_post$
begin
  if to_regprocedure('clara.fail_witness_facts(uuid,text)') is null then
    raise exception 'f_a1_cutover S2 postcheck: clara.fail_witness_facts did not install' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara.fail_witness_facts(uuid,text)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_cutover S2 postcheck: fail_witness_facts is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
      where p.oid='clara.fail_witness_facts(uuid,text)'::regprocedure
        and a.grantee='clara_runtime'::regrole and a.privilege_type='EXECUTE') then
    raise exception 'f_a1_cutover S2 postcheck: fail_witness_facts is not EXECUTE-granted to clara_runtime' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid='clara.fail_witness_facts(uuid,text)'::regprocedure
        and (a.grantee = 0 or pg_get_userbyid(a.grantee) not in ('clara_fn_owner','clara_runtime'))) then
    raise exception 'f_a1_cutover S2 postcheck: fail_witness_facts is granted to a role other than clara_fn_owner/clara_runtime (PUBLIC or otherwise)' using errcode='CLR10';
  end if;
  raise notice 'f_a1_cutover S2: clara.fail_witness_facts installed -- running->failed, error_code from the EXACT 8-code runtime vocabulary (bad_type/limit/internal/corrupt/encrypted/witness_consent_inactive/witness_multi_client/wait_exhausted, else engine_error), emits document.llm_witness_failed, refunds unconditionally (harmless -- no reservation ever exists), EXECUTE to clara_runtime only.';
end
$fail_post$;

-- =====================================================================================
-- SECTION 3 -- request_reextraction DOOR WIDENING (D7). NOT wb-0020 pinned. Two edits,
-- splice discipline, same shape as section 1.
-- =====================================================================================
set role clara_fn_owner;

do $reext$
declare
  v_sig text := 'clara.request_reextraction(uuid,text,text)';
  v_def text; v_frm1 text; v_to1 text; v_frm2 text; v_to2 text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'f_a1_cutover S3 prestate: clara.request_reextraction is GONE' using errcode='CLR10';
  end if;

  -- Edit 1: the invoice-shaped-document engine mint. The kind gate above this text
  -- (coalesce(d.document_kind,'') not in (...)) is UNCHANGED -- still exactly the four kinds.
  v_frm1 := $f1$    v_lane := 'invoice_facts'; v_engine := 'azure-di:prebuilt-invoice:2024-11-30';
  elsif lower(coalesce(d.mime_type, '')) in ('application/xml', 'text/xml') then$f1$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm1, ''))) / length(v_frm1);
  if v_cnt <> 1 then
    raise exception 'f_a1_cutover S3 prestate: the invoice-shaped engine mint appears % times (expected exactly 1) -- the live body drifted from the 0026 shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to1 := $t1$    -- F-A1 PR-3 (design D7/D9): the invoice re-extraction path now mints
    -- llm_witness -- the SAME engine literal the cutover router mints (section 1 above;
    -- WITNESS_ENGINE_SNAPSHOT.engineId in witnessFacts.v1.services.mjs; battery cell
    -- f-a1.cutover-engine-literal asserts equality). The retiring Azure engine constant this
    -- line named (0026:1059 lineage) retires with it.
    v_lane := 'llm_witness'; v_engine := 'llm-openai:gpt-5.6-terra:v1';
  elsif lower(coalesce(d.mime_type, '')) in ('application/xml', 'text/xml') then$t1$;
  v_def := replace(v_def, v_frm1, v_to1);

  -- Edit 2: the primary ('reextraction') admission door widens to the witness kinds.
  -- ORDER IS THE POINT: this is the FIRST if-arm, so a witness-done receipt admits HERE and
  -- never reaches the receipt_backfill arm below it (D7: "never mislabelled
  -- receipt_backfill").
  v_frm2 := $f2$  if exists (select 1 from clara.document_extractions e
      where e.document_id = p_document
        and e.engine_kind = 'invoice_facts' and e.status = 'done') then
    v_admission := 'reextraction';$f2$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm2, ''))) / length(v_frm2);
  if v_cnt <> 1 then
    raise exception 'f_a1_cutover S3 prestate: the primary admission door appears % times (expected exactly 1) -- the live body drifted from the 0026 shape', v_cnt
      using errcode='CLR10';
  end if;
  v_to2 := $t2$  -- F-A1 PR-3 (D7): widened to the witness kinds. A witness-done RECEIPT
  -- admits HERE, never through the receipt_backfill door below -- branch order is the whole
  -- point (a done llm_text_facts row proves the pair already ran, the same signal a done
  -- invoice_facts row gave before cutover; SS3.1/SS3.3's canonical-text-row rule).
  if exists (select 1 from clara.document_extractions e
      where e.document_id = p_document
        and e.status = 'done'
        and e.engine_kind in ('invoice_facts', 'llm_text_facts')) then
    v_admission := 'reextraction';$t2$;
  v_def := replace(v_def, v_frm2, v_to2);

  execute v_def;
end
$reext$;

reset role;

do $reext_post$
declare v_src text; v_n int;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure;
  if position($m$v_lane := 'llm_witness'; v_engine := 'llm-openai:gpt-5.6-terra:v1';$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the invoice-shaped re-extraction arm does not mint llm_witness with the locked engine literal' using errcode='CLR10';
  end if;
  if position($m$v_lane := 'invoice_facts'; v_engine := 'azure-di:prebuilt-invoice:2024-11-30';$m$ in v_src) <> 0 then
    raise exception 'f_a1_cutover S3 postcheck: the OLD invoice_facts mint text is still present -- the splice did not remove it' using errcode='CLR10';
  end if;
  if position($m$e.engine_kind in ('invoice_facts', 'llm_text_facts')$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the primary admission door does not admit a done llm_text_facts row' using errcode='CLR10';
  end if;
  -- Branch order: the widened primary door's text must appear BEFORE the receipt_backfill
  -- arm's text in the source.
  if position($m$e.engine_kind in ('invoice_facts', 'llm_text_facts')$m$ in v_src)
     >= position($m$elsif d.document_kind = 'receipt' then$m$ in v_src) then
    raise exception 'f_a1_cutover S3 postcheck: the widened admission door is not BEFORE the receipt_backfill arm -- branch order regressed' using errcode='CLR10';
  end if;
  -- Every branch/clause this file does NOT name must survive verbatim.
  if position($m$v_lane := 'local_facts'; v_engine := 'clara-myinvois:v1';$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the xml/local_facts arm moved -- it must stay byte-untouched' using errcode='CLR10';
  end if;
  if position($m$if not v_reused and v_lane = 'invoice_facts' then$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the page-budget reservation clause moved or was widened to llm_witness -- it must stay invoice_facts-only, byte-untouched (now dead code for the invoice arm, which IS the contract)' using errcode='CLR10';
  end if;
  if position('only an invoice-shaped document can be re-extracted' in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the kind-gate refusal message was lost' using errcode='CLR10';
  end if;
  if position($m$coalesce(d.document_kind, '') not in ('invoice', 'credit_note', 'debit_note', 'receipt')$m$ in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the kind gate''s admitted set moved -- it must mirror the router''s set exactly' using errcode='CLR10';
  end if;
  if position('elsif d.document_kind = ''receipt'' then' in v_src) = 0
     or position('v_admission := ''receipt_backfill'';' in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the receipt_backfill door was lost -- it must stay reachable for the pre-0025 population it exists for' using errcode='CLR10';
  end if;
  if position('filed_bootstrap' in v_src) = 0 then
    raise exception 'f_a1_cutover S3 postcheck: the filed_bootstrap door was lost' using errcode='CLR10';
  end if;
  -- ACLs unmoved (CREATE OR REPLACE preserves them; re-measured, not assumed). Compared by
  -- OID via a regrole cast -- never pg_get_userbyid(0), which is the PUBLIC-grantee trap the
  -- 0026 tail census itself guards with an explicit `grantee = 0 or` arm.
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
    where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure
      and a.grantee <> 'clara_fn_owner'::regrole and a.grantee <> 'clara_authenticated'::regrole;
  if v_n <> 0 then
    raise exception 'f_a1_cutover S3 postcheck: request_reextraction gained a grant to a role other than clara_fn_owner/clara_authenticated' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid='clara.request_reextraction(uuid,text,text)'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_cutover S3 postcheck: request_reextraction is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  raise notice 'f_a1_cutover S3: request_reextraction recut -- the invoice-shaped arm mints llm_witness with engine llm-openai:gpt-5.6-terra:v1; the primary admission door admits a done llm_text_facts row BEFORE the receipt_backfill arm (branch order verified); the page-budget reservation clause is byte-untouched and invoice_facts-only (now dead for the invoice arm, which is the D7 contract); receipt_backfill and filed_bootstrap survive; ACL/ownership unmoved.';
end
$reext_post$;

-- =====================================================================================
-- TAIL CENSUS.
-- =====================================================================================
do $tail$
declare v_n int;
begin
  if to_regprocedure('clara.fail_witness_facts(uuid,text)') is null then
    raise exception 'f_a1_cutover tail: fail_witness_facts is not live' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
    where p.oid in ('clara._enqueue_invoice_facts_core(uuid)'::regprocedure,
                     'clara.request_reextraction(uuid,text,text)'::regprocedure,
                     'clara.fail_witness_facts(uuid,text)'::regprocedure);
  if v_n <> 3 then
    raise exception 'f_a1_cutover tail: expected all three recut/new bodies to resolve, found %', v_n using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
      where conname='ck_processing_task_error_code_f_a1'
        and pg_get_constraintdef(oid) like '%wait\_exhausted%') then
    raise exception 'f_a1_cutover tail: wait_exhausted is not admitted by ck_processing_task_error_code_f_a1' using errcode='CLR10';
  end if;
  raise notice 'f_a1_cutover tail: OK -- _enqueue_invoice_facts_core mints llm_witness for the invoice-kind arm (no dual-run), already_completed resolves via llm_text_facts; clara.fail_witness_facts installed (clara_runtime-only) admitting the EXACT 8-code runtime vocabulary (bad_type, limit, internal, corrupt, encrypted, witness_consent_inactive, witness_multi_client, wait_exhausted -- else engine_error); request_reextraction''s door widens with branch order preserved and the SAME engine literal. The queued->failed transition stays exactly wall 13''s two witness consent codes (unchanged by this file); the running->failed transition arm is confirmed error_code-and-lane-unconstrained (0090 S10, re-read not re-widened) so it already admits all eight. No table in workflow/graphile_worker/spike touched. Deploy-order note: this file applies ONLY after UNNUMBERED_f_a1_writer_rotation.sql (checked in the prestate) and after the PR-2 runtime image is verified live -- no DB-side prestate can enforce the LATTER ordering (stated in the file header), but an old runtime image cannot mint anything on this lane regardless (enqueueForLane''s allowlist + the 0090 lane/prefix CHECKs, verified independently of this file). D1 write-quiesce taken for sections 1 and 3 (both replace live hot-path bodies); section 2 is a brand-new verb + a CHECK widening, no quiesce owed.';
end
$tail$;
