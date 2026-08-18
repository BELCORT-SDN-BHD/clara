-- 0090_f_a1_walls.sql -- Wave-F Track A, F-A1 (the LLM witness-pair extraction),
-- PR-1 piece 2 of 2 within the DB build: THE WALLS -- every list/CHECK/seam the new
-- `llm_witness` lane must join before piece 1 (the 0017 trigger fix, the successor
-- predicate, persist_witness_facts, evaluator_versions, llm_usage_events, the field_path
-- census) can mint anything against it. Design of record:
-- docs/plan/active/f-a1-witness-pair-design.md SS3.2/SS3.5/SS3.6/SS3.8/SS6.2 + Annex A
-- (walls 1-9, 12) + Annex C (the Walls battery cells). Migration number claimed at
-- MERGE time (standing law, AGENTS.md + .claude/rules/db-migrations.md).
--
-- THIS FILE MINTS NO WITNESS WORK. No router change, no re-extraction-door change, no
-- workflow. An old runtime image cannot land a task in the new lane: the lane CHECK and
-- enqueueForLane's explicit allowlist (a runtime-side file this migration does not touch)
-- both refuse it. It is NOT inert, though: two of the recuts below replace LIVE bodies on
-- the hot path every existing invoice document runs through
-- (claim_document_processing_task, _enqueue_invoice_facts_core) -- the D1 write-quiesce
-- window binds at deploy (packages/db/README.md, "Deploy contract").
--
-- PROVENANCE, all measured against a real applied chain (0001..0088), never assumed from
-- the migration source files: claim_document_processing_task's live body is 0038:6839
-- (E3); release_held_document_tasks' live body is 0050's recut of 0038:7143 (0050 F4 fix,
-- NOT 0038 verbatim); _enqueue_invoice_facts_core's live body is 0038:6199 (E2); the three
-- purpose CHECKs and the doc_sha CHECK are 0038 E1.1/E1.1b; the four purpose-bearing verbs
-- and prepare_egress_dispatch/consume_egress_dispatch are 0038 E1.2/E1.3;
-- get_document_extract's live body is 0054:203 (the F9 region-ordinal recut of 0011:3232);
-- _tf_processing_task_update's live body is 0040 S4.11a's recut of 0038 E2b's recut of
-- 0011:1286 (0042/0044 only NAME it in censuses; 0051 asserts it byte-UNCHANGED twice).
-- Every prestate below pins the EXACT live prosrc by sha256 (function bodies are
-- byte-verbatim prosrc, so a sha256 pin is exact) or by discovered-name + a
-- pg_get_constraintdef substring match for CHECK constraints (pg_get_constraintdef
-- canonicalizes the expression tree -- it does not echo authored SQL text
-- byte-for-byte, so a full-string sha pin there would be a false negative waiting to
-- happen; this is the same substring-discovery idiom 0038 E1.1 itself uses).
--
-- A NECESSARY CONSEQUENCE NOT NAMED IN THE WALL LIST, DISCOVERED WHILE READING THE LIVE
-- BODIES: grant_client_egress_purpose / activate_client_egress_purpose /
-- deactivate_client_egress_purpose / revoke_client_egress_purpose each carry a HARDCODED
-- in-body allowlist (`p_purpose not in ('wiki_synthesis','statement_extraction')` ->
-- 'unknown_purpose'), INDEPENDENT of the table CHECK. Widening only the CHECK would leave
-- witness_extraction structurally admissible at the table but refused by every verb that
-- could ever grant/activate/deactivate/revoke it -- the typed-purpose wall would be
-- unusable. All four are recut alongside the three purpose CHECKs. Same finding for
-- prepare_egress_dispatch, which pre-checks purpose/hash consistency itself (by design, so
-- a CHECK violation never leaks to the caller as a distinguishing signal -- 0038:5942-5949)
-- -- it gains its own witness_extraction/doc_sha arm, mirroring the statement one exactly.
--
-- ONE WALL WAS MISSING FROM THE ANNEX'S OWN LIST AND IS ADDED HERE AS WALL 13 (section 10,
-- adjudicated review B2): the row-level UPDATE trigger clara._tf_processing_task_update owns the
-- queued->failed TRANSITION TABLE, and section 7e's llm_witness gate flips a queued task in
-- place. Widening the two refusal-code CHECKs (section 8) admits the VALUES; only the trigger
-- admits the MOVE. Without it the gate raises CLR16 the first time PR-3's router mints a witness
-- task -- the same half-wall shape 0038:7200-7205 records for the second refusal-code CHECK.
--
-- WALL NUMBERS below resolve in Annex A. M7/M9/M10/M14 resolve in the design body.

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every function pinned by exact prosrc sha256 (computed the same
-- way the tail's postcheck will compute the NEW body's sha256: encode(sha256(convert_to(
-- prosrc,'UTF8')),'hex')). Every CHECK constraint pinned by discovered name + a
-- pg_get_constraintdef substring match. Aborts on any mismatch rather than proceeding on a
-- wrong premise (db-migrations.md, "measure before, measure after").
-- =====================================================================================
-- The pre-recut ACL of every function this file replaces, captured BEFORE any DDL so section
-- 7c/7d's postcheck can assert the matrix is UNMOVED rather than assume it. CREATE OR REPLACE
-- preserves proacl, so this is a measurement of a claim, not a repair -- and a measurement is
-- exactly what the claim was missing: "the four verbs and prepare_egress_dispatch keep their
-- ACLs" was asserted by nobody and read by nothing.
create temp table _fa1_walls_pre_acl(sig text primary key, acl text);
do $pre$
declare v_src text; v_sha text; v_n int; v_sig text;
begin
  if not exists (select 1 from clara.schema_migrations where version = '0088_masb_wording_seed_lexicon') then
    raise exception 'f_a1_walls prestate: 0088_masb_wording_seed_lexicon is not applied -- frontier mismatch' using errcode='CLR10';
  end if;

  -- claim_document_processing_task (0038:6839, the live E3 body -- release's own 0050
  -- header explains why this is NOT 0009's or 0024's body).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  if v_src is null then raise exception 'f_a1_walls prestate: clara.claim_document_processing_task is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '0cebc8143f8acab0f1b54d42797ca38a30e093aedd58af1cb2322c7b73a35970' then
    raise exception 'f_a1_walls prestate: clara.claim_document_processing_task prosrc sha256 mismatch (got %, expected 0cebc8143f8acab0f1b54d42797ca38a30e093aedd58af1cb2322c7b73a35970) -- this is not the 0038 E3 body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('llm_witness' in v_src) <> 0 then
    raise exception 'f_a1_walls prestate: claim_document_processing_task ALREADY carries llm_witness -- already applied' using errcode='CLR10';
  end if;

  -- release_held_document_tasks (LIVE body = 0050's recut, NOT 0038:7143 verbatim -- 0050's
  -- own header records the earlier incident of recutting the wrong predecessor).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  if v_src is null then raise exception 'f_a1_walls prestate: clara.release_held_document_tasks is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '1f561fead5084c724a3c4f1c3dc9f551cb3086a64b5c7bcabc926f32eff95b37' then
    raise exception 'f_a1_walls prestate: clara.release_held_document_tasks prosrc sha256 mismatch (got %, expected 1f561fead5084c724a3c4f1c3dc9f551cb3086a64b5c7bcabc926f32eff95b37) -- this is not 0050''s recut', v_sha
      using errcode='CLR10';
  end if;

  -- _enqueue_invoice_facts_core (0038:6199, the live E2 body; wb-0020 PINNED -- a second
  -- restore pair is owed in packages/db/tests/wave-b/wb-0020-legacy.test.mjs).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_src is null then raise exception 'f_a1_walls prestate: clara._enqueue_invoice_facts_core is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '883e5b32d7e624d53d53bc4c5d0f9e00a5cb0afb3563525e8a0ebe41c27ef45e' then
    raise exception 'f_a1_walls prestate: clara._enqueue_invoice_facts_core prosrc sha256 mismatch (got %, expected 883e5b32d7e624d53d53bc4c5d0f9e00a5cb0afb3563525e8a0ebe41c27ef45e) -- this is not the 0038 E2 body the wb-0020 restore pair was derived from', v_sha
      using errcode='CLR10';
  end if;

  -- _tf_processing_task_update (WALL 13, section 10 -- the LIVE body is 0040's S4.11a recut of
  -- 0038 E2b's recut of 0011:1286; 0042/0044 only NAME it in their censuses and 0051 asserts it
  -- is byte-UNCHANGED, so 0040 is the last hand on it). PARTIAL-BIRTH GUARD: neither witness
  -- refusal code may already appear -- a body carrying one and not the other is a half-applied
  -- splice, and splicing on top of it would double the arm.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_processing_task_update()'::regprocedure;
  if v_src is null then raise exception 'f_a1_walls prestate: clara._tf_processing_task_update is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'c0a6bb43c5f51503352f3390838ac8a35a84cdc6b2825e4bd191b28f2324c47b' then
    raise exception 'f_a1_walls prestate: clara._tf_processing_task_update prosrc sha256 mismatch (got %, expected c0a6bb43c5f51503352f3390838ac8a35a84cdc6b2825e4bd191b28f2324c47b) -- this is not the 0040 S4.11a body this file was authored against', v_sha
      using errcode='CLR10';
  end if;
  if position('witness_consent_inactive' in v_src) <> 0 or position('witness_multi_client' in v_src) <> 0 then
    raise exception 'f_a1_walls prestate: clara._tf_processing_task_update already names a witness refusal code -- already applied, or half-spliced' using errcode='CLR10';
  end if;

  -- get_document_extract (0054:203, the live F9 region-ordinal body).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure;
  if v_src is null then raise exception 'f_a1_walls prestate: clara.get_document_extract is GONE' using errcode='CLR10'; end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e0aeefb6b316f7f5b5959794c4bedb861ccd2a90cf344f218d6fd4e6a6c0ecb5' then
    raise exception 'f_a1_walls prestate: clara.get_document_extract prosrc sha256 mismatch (got %, expected e0aeefb6b316f7f5b5959794c4bedb861ccd2a90cf344f218d6fd4e6a6c0ecb5) -- this is not the 0054 F9 body', v_sha
      using errcode='CLR10';
  end if;

  -- the four typed-purpose verbs (0038 E1.2 bodies).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '72c5801b401379cae901bdbe47c0aa795a1e8fcd8d8b19274d82fcb1321af9c7' then
    raise exception 'f_a1_walls prestate: clara.grant_client_egress_purpose prosrc sha256 mismatch (got %, expected 72c5801b401379cae901bdbe47c0aa795a1e8fcd8d8b19274d82fcb1321af9c7)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '961a4de8c092d592549aaf74a5758f1ff0e9a3fce00318eae8ade566306a959d' then
    raise exception 'f_a1_walls prestate: clara.activate_client_egress_purpose prosrc sha256 mismatch (got %, expected 961a4de8c092d592549aaf74a5758f1ff0e9a3fce00318eae8ade566306a959d)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '41dbdc7871b62b99717c5a3c0abebea2acf119be8c1cb84780a2b059ef0a87da' then
    raise exception 'f_a1_walls prestate: clara.deactivate_client_egress_purpose prosrc sha256 mismatch (got %, expected 41dbdc7871b62b99717c5a3c0abebea2acf119be8c1cb84780a2b059ef0a87da)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'eeb42ed55463c4058c2231cf309919569a40fcb5edc8bcc83e050a702c2779eb' then
    raise exception 'f_a1_walls prestate: clara.revoke_client_egress_purpose prosrc sha256 mismatch (got %, expected eeb42ed55463c4058c2231cf309919569a40fcb5edc8bcc83e050a702c2779eb)', v_sha using errcode='CLR10';
  end if;

  -- prepare_egress_dispatch (0038 E1.3 6-arg overload).
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '1dd7c354385f7171bf23f497fee312c6e77654c3990446a451e8805dc54eda23' then
    raise exception 'f_a1_walls prestate: clara.prepare_egress_dispatch prosrc sha256 mismatch (got %, expected 1dd7c354385f7171bf23f497fee312c6e77654c3990446a451e8805dc54eda23)', v_sha using errcode='CLR10';
  end if;

  -- The five CHECK constraints (wall 1/2/3/7), by discovered name.
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_extractions' and con.conname='ck_document_extractions_engine_kind_0038'
        and pg_get_constraintdef(con.oid) like '%statement_facts%' and pg_get_constraintdef(con.oid) not like '%llm_%') then
    raise exception 'f_a1_walls prestate: ck_document_extractions_engine_kind_0038 not found in its expected 0038 shape' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_lane_0038'
        and pg_get_constraintdef(con.oid) like '%statement_parse%' and pg_get_constraintdef(con.oid) not like '%llm_witness%') then
    raise exception 'f_a1_walls prestate: ck_processing_task_lane_0038 not found in its expected 0038 shape' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_lane_engine_0038'
        and pg_get_constraintdef(con.oid) like '%clara-statement-%' and pg_get_constraintdef(con.oid) not like '%llm-%') then
    raise exception 'f_a1_walls prestate: ck_processing_task_lane_engine_0038 not found in its expected 0038 shape' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_error_code_0038'
        and pg_get_constraintdef(con.oid) like '%line_date_out_of_period%' and pg_get_constraintdef(con.oid) not like '%witness%') then
    raise exception 'f_a1_walls prestate: ck_processing_task_error_code_0038 not found in its expected 0038 shape' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_binding_0038'
        and pg_get_constraintdef(con.oid) like '%statement_multi_client%' and pg_get_constraintdef(con.oid) not like '%witness%') then
    raise exception 'f_a1_walls prestate: ck_processing_task_binding_0038 not found in its expected 0038 shape' using errcode='CLR10';
  end if;

  -- The typed-purpose surface (wall 6): three purpose CHECKs by discovered content, plus
  -- the doc_sha CHECK by its stable name (0038 E1.1b: "keeps its NAME").
  select count(*)::int into v_n from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname in ('client_egress_purpose_consents','client_egress_purpose_activations','egress_dispatch_authorizations')
      and con.contype='c' and pg_get_constraintdef(con.oid) like '%purpose%' and pg_get_constraintdef(con.oid) like '%statement_extraction%'
      and pg_get_constraintdef(con.oid) not like '%document_sha256%' and pg_get_constraintdef(con.oid) not like '%witness_extraction%';
  if v_n <> 3 then
    raise exception 'f_a1_walls prestate: expected exactly 3 purpose CHECKs at the 0038 shape (wiki_synthesis, statement_extraction only), found %', v_n using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.conname='ck_egress_dispatch_authorizations_doc_sha'
        and pg_get_constraintdef(con.oid) like '%statement_extraction%' and pg_get_constraintdef(con.oid) not like '%witness_extraction%') then
    raise exception 'f_a1_walls prestate: ck_egress_dispatch_authorizations_doc_sha not found in its expected 0038 shape' using errcode='CLR10';
  end if;

  -- THE PRE-RECUT ACL MATRIX (the five bodies section 7c/7d replaces), read from the live
  -- catalog. acldefault() stands in for a NULL proacl so "owner-only default" and an explicitly
  -- written owner-only grant compare as the same fact rather than as null-vs-text.
  foreach v_sig in array array[
      'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
      'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
      'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
      'clara.revoke_client_egress_purpose(uuid,text,text,text)',
      'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'] loop
    insert into _fa1_walls_pre_acl(sig, acl)
    select v_sig, coalesce(
      (select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_sig::regprocedure), '(none)');
  end loop;

  -- firm_document_limits: the witness-own concurrency column must not already exist.
  if exists(select 1 from information_schema.columns where table_schema='clara' and table_name='firm_document_limits' and column_name='llm_witness_concurrency') then
    raise exception 'f_a1_walls prestate: clara.firm_document_limits.llm_witness_concurrency already exists' using errcode='CLR10';
  end if;

  raise notice 'f_a1_walls prestate: clean -- frontier 0088; every pinned body/constraint matches its exact live shape (function bodies by sha256, CHECKs by discovered name); llm_witness/llm_text_facts/llm_vision_facts/witness_extraction absent everywhere';
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- WALL 1: engine_kind CHECK gains llm_text_facts, llm_vision_facts.
-- Deliberately OUTSIDE the AB-3 attribution matcher's allowlist (wall 8, untouched by
-- this file): engine_kind in ('ocr','structured_parse') there, unchanged -- neither
-- witness kind can become a client-attribution source, exactly like statement_facts today.
-- =====================================================================================
alter table clara.document_extractions drop constraint ck_document_extractions_engine_kind_0038;
alter table clara.document_extractions add constraint ck_document_extractions_engine_kind_f_a1 check (
  engine_kind in ('ocr','structured_parse','invoice_facts','doc_classify','statement_facts',
                  'llm_text_facts','llm_vision_facts'));

-- =====================================================================================
-- SECTION 2 -- WALL 2: lane CHECK gains llm_witness.
-- =====================================================================================
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_0038;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_f_a1 check (
  lane in ('ocr','structured_parse','none','invoice_facts','local_facts','classify',
           'statement_facts','statement_parse','llm_witness'));

-- =====================================================================================
-- SECTION 3 -- WALL 3: lane<->engine prefix CHECK gains the llm_witness arm
-- (lane='llm_witness' -> engine_id like 'llm-%'). The lane-blind 'clara-fixture:%' first
-- arm (the rig's door) stands untouched, per design SS3.2. Pre-assert existing rows first
-- (the 0016/0038 idiom) -- a no-op today since no llm_witness row can exist yet, but
-- asserted rather than assumed.
-- =====================================================================================
do $s3_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.document_processing_tasks t
  where not (
    t.engine_id like 'clara-fixture:%'
    or (t.lane in ('ocr','invoice_facts','statement_facts') and t.engine_id like 'azure-%')
    or (t.lane in ('structured_parse','local_facts','none') and t.engine_id like 'clara-%')
    or (t.lane='classify' and t.engine_id like 'clara-classify-%')
    or (t.lane='statement_parse' and t.engine_id like 'clara-statement-%'));
  if v_bad<>0 then
    raise exception 'f_a1_walls S3 pre-assert failed: % existing task row(s) already violate the pre-widen prefix CHECK', v_bad
      using errcode='CLR10';
  end if;
end
$s3_pre$;
alter table clara.document_processing_tasks drop constraint ck_processing_task_lane_engine_0038;
alter table clara.document_processing_tasks add constraint ck_processing_task_lane_engine_f_a1 check (
  engine_id like 'clara-fixture:%'
  or (lane in ('ocr','invoice_facts','statement_facts') and engine_id like 'azure-%')
  or (lane in ('structured_parse','local_facts','none') and engine_id like 'clara-%')
  or (lane='classify' and engine_id like 'clara-classify-%')
  or (lane='statement_parse' and engine_id like 'clara-statement-%')
  or (lane='llm_witness' and engine_id like 'llm-%'));

-- =====================================================================================
-- SECTION 4 -- M10: firm_document_limits gains the witness-own concurrency LIMIT column,
-- beside ocr_concurrency on the SAME relation, NULLABLE (unlike ocr_concurrency's NOT
-- NULL) with a table-level default of 2 -- claim_document_processing_task coalesces it the
-- same way ocr_concurrency is coalesced. Counted over lane='llm_witness' ALONE (section 5
-- below); it must never be folded into the shared ocr/invoice_facts/statement_facts window.
--
-- NOTED, NOT FIXED (out of this file's scope): clara._tf_firm_document_limits_upsert
-- (0007:545-556) is a BEFORE-INSERT pseudo-upsert with a HARDCODED column list
-- (docs_per_day, pages_per_day, ocr_concurrency) -- an INSERT naming only a subset of
-- limit columns against an EXISTING firm row already silently resets the columns it does
-- not name back to their table defaults, and this new column is invisible to that trigger
-- entirely (it can never be set through the INSERT-shaped upsert path, only through a
-- direct UPDATE). This is a PRE-EXISTING hazard this file's addition inherits rather than
-- causes; recutting that trigger is not one of this file's nine deliverables and is
-- reported, not silently absorbed here.
-- =====================================================================================
alter table clara.firm_document_limits
  add column llm_witness_concurrency int default 2
    check (llm_witness_concurrency is null or llm_witness_concurrency > 0);

-- =====================================================================================
-- SECTION 5 -- WALL 4: claim_document_processing_task recut (wb-0020 PINNED -- restore
-- pair machine-derived in packages/db/tests/wave-b/wb-0020-legacy.test.mjs). llm_witness
-- joins the kill-switch triple and the attempt cap; gains its OWN concurrency window
-- (M10, section 4's column); the attempt-cap terminal-event CASE gains a lane-true arm
-- (M9) defaulting to document.llm_witness_failed -- the subscriber census (below) found no
-- consumer of either existing event type that a witness-lane failure could misfire into.
--
-- SUBSCRIBER CENSUS (M9), run against this tree before naming the event: grepped every
-- migration and packages/runtime for 'invoice_facts_failed' / 'statement_facts_failed'.
-- The ONLY runtime subscriber of EITHER type is packages/runtime/lib/autodraft.mjs's
-- AUTODRAFT_EVENT_TYPES = ['document.invoice_facts_completed','document.invoice_facts_failed']
-- (AUTODRAFT_CONSUMER) -- it does not subscribe 'document.statement_facts_failed' at all
-- (grepped clean across packages/runtime and apps/dashboard). No consumer forbids a THIRD,
-- lane-true event name, so 'document.llm_witness_failed' is minted per the design's
-- default rule; it currently has zero subscribers, exactly like 'document.statement_facts_failed'
-- has zero today -- both are receipts a future consumer can subscribe to, not a wired
-- pipeline this file builds.
--
-- The LEGACY purpose-blind branch (elsif t.lane='invoice_facts') is left BYTE-UNTOUCHED:
-- llm_witness's only claim-time hold cause is the kill switch, same as statement_facts --
-- its typed (consent, activation) is checked at ENQUEUE (section 7e), never here (the
-- ratified 0020 section 6 byte-identity battery forbids a typed-consent call edge in this
-- body, reasserted in the postcheck below).
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.claim_document_processing_task(p_task uuid,
    p_workflow_run_id text, p_egress_approved boolean) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_cap int; v_running int; v_attempts int;
  v_clients int; v_consented int; v_hold_reason text; v_secret text;
begin
  if p_workflow_run_id is null or btrim(p_workflow_run_id)='' then
    raise exception 'workflow_run_id is required' using errcode='CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task not found' using errcode='CLR16'; end if;
  select storage_path,sha256,mime_type,byte_size into d
    from clara.documents where id=t.document_id;

  -- The lease check precedes EVERY dispatching branch. Only the EGRESSING lanes
  -- (ocr, invoice_facts and -- 0038 -- statement_facts) are kill-switch-gated; invoice_facts
  -- additionally requires every active filing client to hold a live LEGACY consent. Local
  -- lanes (structured_parse, local_facts, classify, statement_parse) never hold.
  --
  -- 0038 (design 4.3/4.4): statement_facts joins the KILL SWITCH and nothing else here. The
  -- typed (consent, activation) it needs is checked at ENQUEUE -- the 0020 section 6
  -- byte-identity battery asserts this body carries no call edge into the typed-consent
  -- surface, and the two questions are orthogonal anyway: the switch asks whether the vendor is
  -- safe right now, the typed gate asks whether this client authorized this purpose. Widening
  -- the LEGACY branch below to statement_facts would make a purpose-blind consent authorize a
  -- statement-specific read, which is what 0020 section 1 built a separate relation to prevent.
  if t.lane in ('ocr','invoice_facts','statement_facts','llm_witness')
     and not coalesce(p_egress_approved,false) then
    v_hold_reason:='kill_switch';
  elsif t.lane='invoice_facts' then
    select count(distinct f.client_id)::int,
      count(distinct f.client_id) filter(where exists(
        select 1 from clara.client_egress_consents c
        where c.client_id=f.client_id and c.revoked_at is null))::int
      into v_clients,v_consented from clara.document_filings f
      where f.document_id=t.document_id and f.retired_at is null;
    if coalesce(v_clients,0)=0 or coalesce(v_consented,0)=0 then
      v_hold_reason:='no_consent';
    elsif v_consented<v_clients then
      v_hold_reason:='partial_consent';
    end if;
  end if;
  if v_hold_reason is not null then
    if t.status in ('queued','running') then
      update clara.document_processing_tasks set status='held_egress',
        workflow_run_id=null,started_at=null,vendor_op_ref=null where id=p_task;
      if t.lane='ocr' then
        update clara.documents set extraction_status='held_egress' where id=t.document_id;
      end if;
    elsif t.status<>'held_egress' then
      raise exception 'processing task is not dispatchable' using errcode='CLR16';
    end if;
    return jsonb_build_object('task_id',p_task,'status','held_egress',
      'workflow_run_id',null,'payload',jsonb_build_object(
        'clr','CLR28','reason',v_hold_reason));
  end if;
  if t.status='running' and t.workflow_run_id=p_workflow_run_id then
    return jsonb_build_object('task_id',p_task,'status','running','replayed',true,
      'document_id',t.document_id,'firm_id',t.firm_id,'lane',t.lane,
      'storage_path',d.storage_path,'sha256',d.sha256,
      'mime_type',d.mime_type,'byte_size',d.byte_size);
  end if;
  if t.status<>'queued' then raise exception 'processing task is not queued' using errcode='CLR16'; end if;
  perform pg_advisory_xact_lock(203005001,hashtext(t.firm_id::text));
  -- 0038: the attempt cap is now PER EGRESSING LANE. The sum was keyed on the literal
  -- 'invoice_facts' while the branch it guards was too; widening the branch without re-keying
  -- the sum would let one lane's attempts cap the other's. F-A1 PR-1: llm_witness joins the
  -- same per-lane cap.
  if t.lane in ('invoice_facts','statement_facts','llm_witness') then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks where document_id=t.document_id
        and lane=t.lane;
    if v_attempts>=3 then
      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',
        finished_at=now() where id=p_task;
      perform clara._refund_processing_call(p_task,'attempt_cap');
      -- 0038 as-built fix: the terminal event follows the LANE -- a statement task's cap
      -- must fire the statement feed (its subscribed twin), never wake the autodraft
      -- consumer with a phantom invoice failure. F-A1 PR-1 (M9): llm_witness gets its OWN
      -- twin -- the subscriber census (packages/runtime/lib/autodraft.mjs's
      -- AUTODRAFT_EVENT_TYPES, and a repo-wide grep for both existing type strings) found
      -- no consumer of either existing type that a witness-lane failure could misfire into,
      -- so the lane-true default applies rather than folding into the invoice twin.
      perform clara._append_event(t.firm_id,
        case when t.lane='statement_facts' then 'document.statement_facts_failed'
             when t.lane='llm_witness' then 'document.llm_witness_failed'
             else 'document.invoice_facts_failed' end,
        null,null,null,null,
        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));
      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');
    end if;
  end if;
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts')
      and status='running';
  if t.lane in ('ocr','invoice_facts','statement_facts') and v_running>=v_cap then
    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
  end if;
  -- F-A1 PR-1 (M10): llm_witness gets its OWN concurrency window, counted over
  -- lane='llm_witness' alone -- it must NEVER be folded into the shared ocr/invoice_facts/
  -- statement_facts count above, or the slowest lane could starve the others' throughput.
  -- The limit column (llm_witness_concurrency) is nullable with a table-level default of 2,
  -- coalesced here exactly the way ocr_concurrency is above.
  if t.lane='llm_witness' then
    select coalesce(l.llm_witness_concurrency,2) into v_cap from clara.firms f
      left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
    select count(*)::int into v_running from clara.document_processing_tasks
      where firm_id=t.firm_id and lane='llm_witness' and status='running';
    if v_running>=v_cap then
      raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
    end if;
  end if;
  -- Q1: the CAPABILITY minted on this fresh claim — a random preimage whose digest ALONE
  -- is stored (never the preimage). Returned once, below, to this session only.
  v_secret:=gen_random_uuid()::text;
  update clara.document_processing_tasks set status='running',
    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1,
    claim_secret_digest=sha256(convert_to(v_secret,'UTF8'))
    where id=p_task;
  if t.lane='ocr' then update clara.documents set extraction_status='running' where id=t.document_id; end if;
  return jsonb_build_object('task_id',p_task,'status','running',
    'workflow_run_id',p_workflow_run_id,'document_id',t.document_id,
    'firm_id',t.firm_id,'lane',t.lane,'storage_path',d.storage_path,
    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size,
    'claim_secret',v_secret);
end $$;
alter function clara.claim_document_processing_task(uuid,text,boolean) owner to clara_fn_owner;
grant execute on function clara.claim_document_processing_task(uuid,text,boolean) to clara_runtime;

reset role;

do $s5_post$
declare v_src text; v_sha text; v_code text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0' then
    raise exception 'f_a1_walls S5 postcheck: claim_document_processing_task prosrc sha256 mismatch (got %, expected 01e517bf575806a01f93441bbc2459856e1f4f12624b312c3ba670ebf111b9a0)', v_sha using errcode='CLR10';
  end if;
  v_code := regexp_replace(v_src,'\s+','','g');
  if position('t.lanein(''ocr'',''invoice_facts'',''statement_facts'',''llm_witness'')andnotcoalesce(p_egress_approved,false)' in v_code)=0 then
    raise exception 'f_a1_walls S5 postcheck: the kill-switch lane list did not gain llm_witness' using errcode='CLR10';
  end if;
  if position('t.lanein(''invoice_facts'',''statement_facts'',''llm_witness'')' in v_code)=0 then
    raise exception 'f_a1_walls S5 postcheck: the attempt-cap branch did not gain llm_witness' using errcode='CLR10';
  end if;
  if position('document.llm_witness_failed' in v_src)=0 then
    raise exception 'f_a1_walls S5 postcheck: the attempt-cap terminal-event CASE does not name document.llm_witness_failed' using errcode='CLR10';
  end if;
  -- The shared ocr/invoice_facts/statement_facts concurrency window is UNCHANGED (must NOT
  -- gain llm_witness -- M10's whole point is a SEPARATE window).
  if position('lanein(''ocr'',''invoice_facts'',''statement_facts'')andstatus=''running''' in v_code)=0 then
    raise exception 'f_a1_walls S5 postcheck: the shared ocr concurrency window lost its (ocr,invoice_facts,statement_facts) triple' using errcode='CLR10';
  end if;
  if position('t.lanein(''ocr'',''invoice_facts'',''statement_facts'',''llm_witness'')andv_running' in v_code)<>0 then
    raise exception 'f_a1_walls S5 postcheck: llm_witness leaked into the SHARED concurrency window -- M10 requires its own, separate window' using errcode='CLR10';
  end if;
  if position('t.lane=''llm_witness''thenselectcoalesce(l.llm_witness_concurrency' in v_code)=0 then
    raise exception 'f_a1_walls S5 postcheck: the llm_witness-own concurrency window (M10) is missing' using errcode='CLR10';
  end if;
  if position('lane=''llm_witness''andstatus=''running''' in v_code)=0 then
    raise exception 'f_a1_walls S5 postcheck: the llm_witness-own concurrency window does not count lane=''llm_witness'' alone' using errcode='CLR10';
  end if;
  -- No typed-consent call edge gained (the 0020 section 6 battery's own demand, reasserted).
  if position('client_egress_purpose' in v_src)<>0
     or position('prepare_egress_dispatch' in v_src)<>0
     or position('consume_egress_dispatch' in v_src)<>0 then
    raise exception 'f_a1_walls S5 postcheck: claim_document_processing_task gained a call edge into the typed-consent surface' using errcode='CLR10';
  end if;
  -- The legacy branch, the claim_secret capability and both pre-existing event twins survive.
  if position('elsift.lane=''invoice_facts''then' in v_code)=0
     or position('claim_secret_digest' in v_src)=0
     or position('document.statement_facts_failed' in v_src)=0
     or position('document.invoice_facts_failed' in v_src)=0 then
    raise exception 'f_a1_walls S5 postcheck: the recut lost a pre-existing 0038/0024 property' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime', 'clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure, 'execute') then
    raise exception 'f_a1_walls S5 postcheck: clara_runtime lost EXECUTE on claim_document_processing_task' using errcode='CLR10';
  end if;
  raise notice 'f_a1_walls S5: claim_document_processing_task recut -- llm_witness joins the kill-switch triple + attempt cap, gets its OWN concurrency window (M10), the attempt-cap terminal event names document.llm_witness_failed (M9); no typed-consent edge gained; ACLs preserved';
end
$s5_post$;

-- =====================================================================================
-- SECTION 6 -- WALL 5: release_held_document_tasks recut. llm_witness joins BOTH the outer
-- held-egress lane list AND the inner kill-switch-only branch -- its consent is typed,
-- checked at enqueue (section 7e), so release needs only the switch, exactly like
-- statement_facts (0050's own F4 design, extended one lane further).
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.release_held_document_tasks(p_limit int default 1000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_ids uuid[];
begin
  -- The kill-switch RELEASE sweep. A lane that can be HELD and cannot be RELEASED is a
  -- permanent stall, so this lane list must track claim_document_processing_task's
  -- kill-switch list EXACTLY (0038 E4/E8; the migration tail re-asserts it).
  --
  -- F4 fix: 'held_egress' alone does NOT mean "kill-switch-blocked" -- the claim body
  -- writes three different hold reasons to that one status and records none of them. For
  -- the ONE lane that can be held for a reason the kill switch has no authority over
  -- (invoice_facts, the LEGACY purpose-blind consent gate) re-derive that gate FRESH, right
  -- here, off the same join the claim body runs (0038:6870-6878). A row this predicate
  -- declines stays held_egress, untouched.
  with picked as (
    select t.id from clara.document_processing_tasks t
    where t.status='held_egress' and t.lane in ('ocr','invoice_facts','statement_facts','llm_witness')
      and (
        -- KILL-SWITCH-ONLY lanes. claim_document_processing_task runs no per-client LEGACY
        -- consent check for either: 'ocr' is pre-attribution, and 'statement_facts' is
        -- authorized by the TYPED (consent, activation) pair at enqueue -- reading the
        -- legacy table for it here would let a purpose-blind consent authorize a
        -- statement-specific vendor read (0038 E3 header / 0020 section 1). Their only
        -- hold cause is the switch this sweep's caller has already turned back on.
        t.lane in ('ocr','statement_facts','llm_witness')
        or (t.lane='invoice_facts' and (
             exists (
               select 1 from clara.document_filings f
               where f.document_id=t.document_id and f.retired_at is null
             )
             and not exists (
               select 1 from clara.document_filings f
               where f.document_id=t.document_id and f.retired_at is null
                 and not exists (
                   select 1 from clara.client_egress_consents c
                   where c.client_id=f.client_id and c.revoked_at is null
                 )
             )
           ))
      )
    order by t.created_at,t.id for update skip locked
    limit greatest(1,least(p_limit,10000))
  ), moved as (
    update clara.document_processing_tasks t set status='queued'
    from picked p where t.id=p.id returning t.id
  )
  select count(*)::int,array_agg(id) into v_n,v_ids from moved;
  if v_ids is not null then
    update clara.documents d set extraction_status='pending'
      where d.id in (select t.document_id from clara.document_processing_tasks t
        where t.id=any(v_ids) and t.lane='ocr');
  end if;
  return jsonb_build_object('released',coalesce(v_n,0));
end $$;
alter function clara.release_held_document_tasks(int) owner to clara_fn_owner;

reset role;

do $s6_post$
declare v_src text; v_sha text; v_claim text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.release_held_document_tasks(int)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'b4bb3dc63901211543a162df08ff6e162779b48b0ff771f8ba4f559d1f95f8dd' then
    raise exception 'f_a1_walls S6 postcheck: release_held_document_tasks prosrc sha256 mismatch (got %, expected b4bb3dc63901211543a162df08ff6e162779b48b0ff771f8ba4f559d1f95f8dd)', v_sha using errcode='CLR10';
  end if;
  if position('t.status=''held_egress'' and t.lane in (''ocr'',''invoice_facts'',''statement_facts'',''llm_witness'')' in v_src)=0 then
    raise exception 'f_a1_walls S6 postcheck: the outer held-egress lane list did not gain llm_witness' using errcode='CLR10';
  end if;
  if position('t.lane in (''ocr'',''statement_facts'',''llm_witness'')' in v_src)=0 then
    raise exception 'f_a1_walls S6 postcheck: the inner kill-switch-only branch did not gain llm_witness' using errcode='CLR10';
  end if;
  if position('client_egress_purpose' in v_src)<>0 then
    raise exception 'f_a1_walls S6 postcheck: release_held_document_tasks gained a typed-consent read -- llm_witness''s consent is enqueue-time only' using errcode='CLR10';
  end if;
  -- The claim body and the release sweep must still agree on which lanes the kill switch
  -- alone can release (0050's own tail discipline, extended).
  select p.prosrc into v_claim from pg_proc p where p.oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure;
  if position('''ocr'',''invoice_facts'',''statement_facts'',''llm_witness''' in v_claim)=0
     or position('''ocr'',''invoice_facts'',''statement_facts'',''llm_witness''' in v_src)=0 then
    raise exception 'f_a1_walls S6 postcheck: the kill-switch HOLD lane list and the RELEASE lane list are not both (ocr,invoice_facts,statement_facts,llm_witness)' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime', 'clara.release_held_document_tasks(int)'::regprocedure, 'execute') then
    raise exception 'f_a1_walls S6 postcheck: clara_runtime lost EXECUTE on release_held_document_tasks' using errcode='CLR10';
  end if;
  raise notice 'f_a1_walls S6: release_held_document_tasks recut -- llm_witness joins the outer held-egress list and the inner kill-switch-only branch; claim/release lane lists still agree; ACLs preserved';
end
$s6_post$;

-- =====================================================================================
-- SECTION 6B -- EVENT TYPE REGISTRATION (M9): document.llm_witness_failed. clara._append_event
-- validates event_type against clara.event_types + clara.trigger_taxonomy at the ACTIVE
-- taxonomy version -- a name used in a CASE branch (section 5) that was never registered here
-- raises CLR10 'unknown event_type' the first time it actually fires. Mirrors 0038's own
-- registration of document.statement_facts_failed exactly (0038:8451-8455): kept OUT of the
-- bank.*/witness.* namespace family and in document.* (the ingest lane's own interface),
-- client_scoped=true (a witness failure is about one document tied to one client's filing,
-- same as the statement/invoice twins), decision='ignore' (a terminal failure receipt on the
-- task trail, not a human notification -- the SAME reasoning 0038 and 0037 both state: the
-- consumer reads the task/document state, not the event stream).
-- =====================================================================================
do $s6b_pre$
begin
  if exists(select 1 from clara.event_types where name='document.llm_witness_failed') then
    raise exception 'f_a1_walls S6b prestate: document.llm_witness_failed is already registered -- already applied' using errcode='CLR10';
  end if;
end
$s6b_pre$;

with added(name,client_scoped,description,decision,note) as (values
  ('document.llm_witness_failed',true,
    'An llm_witness task failed with a named reason','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note
from added x
join inserted_types i on i.name=x.name
cross join clara.taxonomy_active a;

do $s6b_post$
declare v_n int;
begin
  if not exists(select 1 from clara.event_types where name='document.llm_witness_failed' and client_scoped=true) then
    raise exception 'f_a1_walls S6b postcheck: document.llm_witness_failed did not register in clara.event_types as client_scoped' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version=tt.version
    where tt.event_type='document.llm_witness_failed' and tt.decision='ignore';
  if v_n<>1 then
    raise exception 'f_a1_walls S6b postcheck: document.llm_witness_failed is not registered exactly once against the ACTIVE taxonomy version with decision=ignore (found %)', v_n
      using errcode='CLR10';
  end if;
  raise notice 'f_a1_walls S6b: document.llm_witness_failed registered in clara.event_types + clara.trigger_taxonomy at the active taxonomy version (client_scoped, decision=ignore) -- _append_event can now emit it';
end
$s6b_post$;

-- =====================================================================================
-- SECTION 7 -- WALL 6: the typed purpose witness_extraction.
-- =====================================================================================

-- 7a. The three purpose CHECKs, recut BY DISCOVERED NAME (the 0038:5462 contract).
do $s7a$
declare
  r record; v_con text; v_n int; v_found text;
begin
  for r in
    select * from unnest(array[
      'client_egress_purpose_consents',
      'client_egress_purpose_activations',
      'egress_dispatch_authorizations']) as t(relname)
  loop
    select count(*)::int,
           string_agg(con.conname||' => '||pg_get_constraintdef(con.oid),' ;; ' order by con.conname)
      into v_n, v_found
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=r.relname and con.contype='c'
       and pg_get_constraintdef(con.oid) like '%purpose%'
       and pg_get_constraintdef(con.oid) like '%wiki_synthesis%'
       and pg_get_constraintdef(con.oid) not like '%document_sha256%';
    if v_n<>1 then
      raise exception 'f_a1_walls S7a prestate: clara.% must carry exactly ONE purpose CHECK naming wiki_synthesis (got %): %',
        r.relname, v_n, coalesce(v_found,'<none>') using errcode='CLR10';
    end if;
    if v_found like '%witness_extraction%' then
      raise exception 'f_a1_walls S7a prestate: clara.%''s purpose CHECK already admits witness_extraction -- already applied',
        r.relname using errcode='CLR10';
    end if;
    select con.conname into v_con
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname=r.relname and con.contype='c'
       and pg_get_constraintdef(con.oid) like '%purpose%'
       and pg_get_constraintdef(con.oid) like '%wiki_synthesis%'
       and pg_get_constraintdef(con.oid) not like '%document_sha256%';
    execute format('alter table clara.%I drop constraint %I', r.relname, v_con);
    execute format(
      'alter table clara.%I add constraint %I check (purpose in (''wiki_synthesis'',''statement_extraction'',''witness_extraction''))',
      r.relname, 'ck_'||r.relname||'_purpose_f_a1');
  end loop;
end
$s7a$;

-- 7b. ck_egress_dispatch_authorizations_doc_sha, RECUT -- witness_extraction is
-- document-tied exactly like statement_extraction (the vision channel sends original
-- client bytes; the text channel re-sends OCR-derived client content -- both document-
-- scoped egress), so it gains the SAME "REQUIRES a non-null hash" implication, written as
-- its OWN conjunct (not folded into statement's) so a future fourth purpose inherits
-- neither rule by accident. NAME PRESERVED (0038's own precedent).
do $s7b_pre$
declare v_bad int;
begin
  select count(*)::int into v_bad from clara.egress_dispatch_authorizations
   where not ((purpose <> 'wiki_synthesis' or document_sha256 is null)
          and (purpose <> 'statement_extraction' or document_sha256 is not null)
          and (purpose <> 'witness_extraction' or document_sha256 is not null));
  if v_bad<>0 then
    raise exception 'f_a1_walls S7b pre-assert failed: % dispatch-authorization row(s) violate the recut document-hash rule', v_bad
      using errcode='CLR10';
  end if;
end
$s7b_pre$;
alter table clara.egress_dispatch_authorizations
  drop constraint ck_egress_dispatch_authorizations_doc_sha;
alter table clara.egress_dispatch_authorizations
  add constraint ck_egress_dispatch_authorizations_doc_sha check (
    (purpose <> 'wiki_synthesis'      or document_sha256 is null)
    and (purpose <> 'statement_extraction' or document_sha256 is not null)
    and (purpose <> 'witness_extraction' or document_sha256 is not null));

-- 7c. The four purpose-bearing verbs: widen the HARDCODED in-body allowlist (the necessary
-- consequence named in this file's header -- the table CHECK alone does not make the
-- purpose grantable). The wiki-hold coupling stays purpose-discriminated and untouched:
-- it fires for p_purpose='wiki_synthesis' only, so witness_extraction falls through with
-- no hold transition, exactly like statement_extraction does today.
set role clara_fn_owner;

create or replace function clara.grant_client_egress_purpose(p_client uuid,p_purpose text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  -- 0038 (WCB-R1): the SECOND typed purpose. 'statement_extraction' authorizes the
  -- statement-specific vendor read of a filed bank statement, and nothing else.
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  -- A null document, or any document that is not an already-classified, bytes-verified
  -- consent-evidence artifact in this firm, is refused. The owner-declaration path of
  -- 0012(A) is deliberately NOT available for typed consent.
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,p_purpose,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_consents_one_live' then
      raise exception 'client already has a live typed egress consent for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress_purpose',null,
    jsonb_build_object('consent',v_id,'client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  -- The evidence document rides in the PAYLOAD, never the typed document_id column -- the
  -- 0014 rule (a consent artifact must not trip the filing-history provenance trigger)
  -- applies identically to typed consent.
  perform clara._append_event(c.firm,'egress.purpose_consent_granted',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'status','live'));
end $$;
alter function clara.grant_client_egress_purpose(uuid,text,uuid,text,text) owner to clara_fn_owner;

create or replace function clara.activate_client_egress_purpose(p_client uuid,p_purpose text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST. Section 7.1 mandates CLR11 for a client not in your firm, and
  -- the v1.0 body reached that verdict only AFTER a global (client, purpose) lookup that took
  -- FOR UPDATE on a foreign firm's live row -- cross-firm lock reach, and CLR28 instead of the
  -- mandated CLR11. Every state-row predicate below now carries firm_id=c.firm as well.
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
        consent_id,activated_by)
      values(c.firm,p_client,p_purpose,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_activations_one_live' then
      raise exception 'client already has a live activation for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  -- 0020 section 4.3: the hold transition lives INSIDE the owner-floored RPC and goes through
  -- the audited writer (never a hand-written row). Only activation clears it.
  -- 0038 (WCB-R1, the follow-on ruling 0020:870-872 demanded): the coupling is
  -- PURPOSE-DISCRIMINATED. The wiki hold row is keyed on the CLIENT ALONE
  -- (0017:2335-2337), so it cannot represent "held for wiki, released for statements" -- and a
  -- statement_extraction activation that cleared it would silently release a wiki control the
  -- client never lifted. The hold is wiki's, and only wiki's, transition.
  if p_purpose='wiki_synthesis' then
    perform clara.clear_wiki_synthesis_hold(p_client,'wikirelease:purpose:'||v_id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'activate_client_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'client',p_client,
      'purpose',p_purpose,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_activated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'status','active'));
end $$;
alter function clara.activate_client_egress_purpose(uuid,text,uuid,text) owner to clara_fn_owner;

create or replace function clara.deactivate_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_activations
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  -- 0020 section 3.5: every OUTSTANDING authorization for the consent behind this activation is
  -- invalidated in the SAME transaction as the withdrawal.
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  -- 0038 (WCB-R1): PURPOSE-DISCRIMINATED, and this direction matters as much as the clear.
  -- Setting the client-keyed wiki hold on a statement_extraction deactivation would WEDGE wiki
  -- publication for a client whose wiki consent was never withdrawn -- the exact regression the
  -- design's review lanes named. Only wiki's own withdrawal sets wiki's hold.
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose deactivated','wikihold:purpose:deact:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_client_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_deactivated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'reason',btrim(p_reason),
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'status','deactivated'));
end $$;
alter function clara.deactivate_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

create or replace function clara.revoke_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis','statement_extraction','witness_extraction') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  -- 0038 (WCB-R1): PURPOSE-DISCRIMINATED, same reason as deactivate.
  if p_purpose='wiki_synthesis' then
    perform clara.set_wiki_synthesis_hold(p_client,
      'wiki synthesis purpose consent revoked','wikihold:purpose:'||x.id::text);
  end if;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  -- One event for the withdrawal, carrying the activation id WHERE APPLICABLE (0020 section
  -- 4.1) and the evidence document in the payload (the 0014 rule).
  perform clara._append_event(c.firm,'egress.purpose_consent_revoked',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'status','revoked'));
end $$;
alter function clara.revoke_client_egress_purpose(uuid,text,text,text) owner to clara_fn_owner;

-- 7d. prepare_egress_dispatch: the witness doc_sha pre-check arm (mirrors statement's
-- exactly). consume_egress_dispatch needs NO change -- its re-binding check
-- (a.document_sha256 is distinct from v_sha) is already purpose-generic.
create or replace function clara.prepare_egress_dispatch(p_firm uuid,p_client uuid,p_purpose text,
    p_event_seq bigint,p_event_type text,p_document_sha256 text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  -- 0020 section 3.2 TTL, one named constant, identical to the 5-arg arity's.
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid; v_sha text;
begin
  if p_firm is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  v_sha := lower(nullif(btrim(coalesce(p_document_sha256,'')),''));
  -- Shape, then purpose/hash consistency. All three refusals are UNIFORM unknown, never a
  -- raise: a distinguishing error here is exactly the oracle 0020 section 3.3 forbids.
  if v_sha is not null and v_sha !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='wiki_synthesis' and v_sha is not null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  if p_purpose='statement_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- F-A1 PR-1 (wall 6): witness_extraction is document-tied exactly like statement_extraction
  -- (the vision channel sends original bytes, the text channel re-sends OCR-derived client
  -- content -- both document-scoped egress). Same uniform 'unknown' refusal, never a raise:
  -- letting ck_egress_dispatch_authorizations_doc_sha fire instead would be a distinguishing
  -- channel the design's own non-oracle rule forbids.
  if p_purpose='witness_extraction' and v_sha is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select a.id,a.consent_id into v_activation,v_consent
    from clara.client_egress_purpose_activations a
    join clara.client_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
        and c.purpose=a.purpose
   where a.firm_id=p_firm and a.client_id=p_client and a.purpose=p_purpose
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- RATCHET R1-F2: WALL CLOCK, not transaction time (0020:432-435), so the stated TTL is an
  -- honest wall-clock 120s for a caller inside a long-open transaction too.
  insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_client,p_purpose,v_consent,v_activation,p_event_seq,p_event_type,
      v_sha,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;
alter function clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text) owner to clara_fn_owner;

reset role;

do $s7cd_post$
declare v_src text; v_sha text; v_sig text; v_acl text; v_was text; v_n int;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'c302558bbf05bcfad58e07bd7758401a158d57335c98680d871b85467a38f4e6' then
    raise exception 'f_a1_walls S7c postcheck: grant_client_egress_purpose prosrc sha256 mismatch (got %, expected c302558bbf05bcfad58e07bd7758401a158d57335c98680d871b85467a38f4e6)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.activate_client_egress_purpose(uuid,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '4f75b02b0d356e15310ea12968839c0c1d4632c3af6c6c8aba564e7a2f38f65f' then
    raise exception 'f_a1_walls S7c postcheck: activate_client_egress_purpose prosrc sha256 mismatch (got %, expected 4f75b02b0d356e15310ea12968839c0c1d4632c3af6c6c8aba564e7a2f38f65f)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.deactivate_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '095652b4b05ee047c693b4d0fe11e9b8c8828cd037d63b2f2a313c9c63dbf091' then
    raise exception 'f_a1_walls S7c postcheck: deactivate_client_egress_purpose prosrc sha256 mismatch (got %, expected 095652b4b05ee047c693b4d0fe11e9b8c8828cd037d63b2f2a313c9c63dbf091)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.revoke_client_egress_purpose(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'd224b56f9a3d8a7e3c6795f2f36c4ae6a58899ebe297ff2ec83bf84524c26ada' then
    raise exception 'f_a1_walls S7c postcheck: revoke_client_egress_purpose prosrc sha256 mismatch (got %, expected d224b56f9a3d8a7e3c6795f2f36c4ae6a58899ebe297ff2ec83bf84524c26ada)', v_sha using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'e053ff6966566353bc2a2a7f99399652abab93926c8c84922a2c2f3a042880c5' then
    raise exception 'f_a1_walls S7d postcheck: prepare_egress_dispatch prosrc sha256 mismatch (got %, expected e053ff6966566353bc2a2a7f99399652abab93926c8c84922a2c2f3a042880c5)', v_sha using errcode='CLR10';
  end if;
  if position('witness_extraction' in v_src)=0 then
    raise exception 'f_a1_walls S7d postcheck: prepare_egress_dispatch does not name witness_extraction' using errcode='CLR10';
  end if;

  -- THE ACL MATRIX IS UNMOVED, measured against the prestate capture rather than asserted. A
  -- recut that silently widened who may GRANT a typed egress purpose would be a security change
  -- wearing a widening's clothes -- and CREATE OR REPLACE preserving proacl is a PROPERTY of the
  -- statement, not a guarantee about what a future editor writes beside it (a DROP+CREATE, or a
  -- stray GRANT in the same section, resets it silently).
  select count(*)::int into v_n from _fa1_walls_pre_acl;
  if v_n <> 5 then
    raise exception 'f_a1_walls S7c/7d postcheck: the pre-recut ACL capture holds % rows (expected 5) -- the instrument is not measuring what it claims', v_n using errcode='CLR10';
  end if;
  for v_sig, v_was in select sig, acl from _fa1_walls_pre_acl order by sig loop
    select coalesce(
      (select string_agg(a.grantee::regrole::text||':'||a.privilege_type, ',' order by a.grantee::regrole::text collate "C", a.privilege_type collate "C")
         from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = v_sig::regprocedure), '(none)') into v_acl;
    if v_acl is distinct from v_was then
      raise exception 'f_a1_walls S7c/7d postcheck: % changed ACL across the recut (was [%], now [%]) -- the typed-purpose surface must keep its EXACT pre-recut grant matrix', v_sig, v_was, v_acl using errcode='CLR10';
    end if;
  end loop;
  raise notice 'f_a1_walls S7c/7d: the four typed-purpose verbs and prepare_egress_dispatch recut -- witness_extraction is now grantable/activatable/deactivatable/revocable and sha-gated at prepare time; all 5 bodies keep their EXACT pre-recut ACLs (measured before and after, not assumed)';
end
$s7cd_post$;

-- 7e. _enqueue_invoice_facts_core: the INERT witness_extraction typed-consent gate (wb-0020
-- PINNED -- the second restore pair). Follows the statement lanes' enqueue-gate precedent
-- (0038 design 4.3/4.4 block) verbatim in shape, with its OWN refusal codes (section 8).
-- INERT: v_lane is never assigned 'llm_witness' anywhere in this frontier -- no mime/kind
-- arm mints it (that is PR-3's job) -- so this branch cannot fire under any live input
-- today; it is proven by successful compilation + the wb-0020 restore-pair hash match, not
-- by a runtime behavioural cell (none is possible while inert -- stated, not smuggled).
set role clara_fn_owner;

create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text; v_task_status text;
  v_engine_kind text; v_stmt_clients uuid[]; v_stmt_client uuid; v_gate text; v_flip int;
begin
  select * into d from clara.documents where id=p_document for update;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — never facts-extracted.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  if exists(select 1 from clara.document_filings df
      where df.document_id=p_document and df.retired_at is null)
     and not exists(select 1 from clara.document_filings df
       join clara.clients oc on oc.id=df.client_id and oc.status='active'
       where df.document_id=p_document and df.retired_at is null) then
    return jsonb_build_object('document_id',p_document,
      'status','skipped_client_onboarding');
  end if;
  -- 0015: mime chooses the engine family. 0016 (P3/WA21-R7): the DOCUMENT KIND
  -- gates the facts engines — only invoice-shaped kinds reach invoice_facts;
  -- a NULL kind classifies FIRST; xml stays rule-classified into the local lane.
  -- 0038 (design 4.3): 'bank_statement' now has TWO homes -- the vendor OCR lane for a
  -- pdf/image and the free local parse lane for a csv/ofx export.
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    if d.document_kind is null then
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';
    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';
    elsif d.document_kind='bank_statement' then
      -- 0038 arm 1: the statementFacts_v1 OCR lane. This is the arm that closes the
      -- bank_statement -> skipped_kind dead end 0026:392-410 left behind.
      -- as-built ladder fix 2026-07-31, Codex wave: the stamp names `prebuilt-bankStatement.us`,
      -- which is the model the runtime ACTUALLY invokes. Provenance must name the engine that
      -- received the egress -- a stamp naming a model nobody called is a false receipt, and the
      -- ".us" suffix is the whole model identity here, not a regional decoration.
      v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';
    else
      -- (adjudication #11): the skipped_kind receipt lives on the task trail —
      -- a terminal failed row (never claimed, attempt_count 0 so it never
      -- consumes attempts), reused idempotently on re-invocation.
      select id into v_task from clara.document_processing_tasks
        where document_id=p_document and lane='invoice_facts'
          and status='failed' and error_code='skipped_kind'
        order by id limit 1;
      if v_task is null then
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane='invoice_facts';
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
            v_version,'invoice_facts','failed','skipped_kind',now())
          returning id into v_task;
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','skipped_kind','document_kind',d.document_kind);
    end if;
  elsif lower(coalesce(d.mime_type,'')) in ('application/xml','text/xml') then
    -- Delta-review round 2 (2026-07-31): the XML arm was KIND-BLIND -- a bank_statement
    -- xml rode the myinvois local lane into the INVOICE parser (wrong worker, wrong
    -- events, a phantom autodraft wake if it happened to parse). No xml statement parser
    -- exists in C-b (the structured lane is csv/ofx by design 4.3), so the honest verdict
    -- is the same terminal skipped_type a csv non-statement gets: never a misroute.
    if d.document_kind='bank_statement' then
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
  elsif lower(coalesce(d.mime_type,'')) in ('text/csv','application/csv',
      'application/x-ofx','application/ofx') then
    -- 0038 arm 2 (design 4.3): the csv/ofx mimes JOIN the dispatch. They dead-ended at
    -- skipped_type before the kind test could ever run. ONLY a bank statement routes; every
    -- other kind keeps the byte-identical skipped_type verdict it has today, so nothing that
    -- is not a statement changes behaviour.
    if d.document_kind='bank_statement' then
      v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';
    else
      return jsonb_build_object('document_id',p_document,'status','skipped_type');
    end if;
  else
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  if v_lane='classify' then
    -- a DONE classify verdict with the kind still NULL = the low-confidence
    -- hold: a human resolves it (set_document_kind / the review question);
    -- never re-enqueue in a loop.
    if exists(select 1 from clara.document_extractions e
        where e.document_id=p_document and e.engine_kind='doc_classify'
          and e.status='done') then
      return jsonb_build_object('document_id',p_document,'status','classify_low_confidence');
    end if;
  else
    -- 0038 (design 4.3): PER-LANE engine-kind. This short-circuit was hard-coded to
    -- 'invoice_facts', which is correct for invoice_facts AND for local_facts (both settle an
    -- invoice_facts extraction) and WRONG for either statement lane -- a fully ingested
    -- statement would read as un-extracted on every re-fire and re-buy a vendor read. The map
    -- preserves the two existing lanes exactly and names the two new ones.
    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')
                       then 'statement_facts'  -- BOTH statement lanes settle a
                       -- statement_facts extraction (the lane records how the read was
                       -- bought; the engine_kind what it is -- the 0026:709 precedent)
                       else 'invoice_facts' end;
    select e.id into v_task from clara.document_extractions e
      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'
      order by e.version_n desc limit 1;
    if v_task is not null then
      return jsonb_build_object('document_id',p_document,'status','already_completed',
        'extraction_id',v_task);
    end if;
  end if;
  -- 0038 (design 4.3/4.4, WCB-R1): THE ENQUEUE-TIME TYPED-CONSENT GATE, statement lanes only.
  -- It is here rather than in the claim body because the ratified 0020 section 6 byte-identity
  -- battery asserts claim_document_processing_task carries no call edge into the typed-consent
  -- surface -- and because enqueue is the earlier, more honest place: an unauthorized client
  -- should never have a task queued in their name at all. Both verdicts write the terminal
  -- NEVER-CLAIMED failed receipt (the skipped_kind idiom), never a raise: this function runs
  -- inside file_document / finalize_document_intake / confirm_attribution_candidate /
  -- approve_wrong_client_correction, and a raise would abort an unrelated filing transaction.
  --
  -- ORDERING, decided here because the design does not fix it: the gate runs AFTER the
  -- already_completed short-circuit (an ingested statement raises no consent question and must
  -- not generate noise on a re-fire) and BEFORE the in-flight short-circuit. The other order
  -- has a real hole: a statement enqueued while one client held it, then filed to a SECOND
  -- client, would hit the in-flight branch and return the queued task, so the vendor read
  -- would proceed on a document with no answerable consent client. A re-fire whose gate now
  -- fails should say so even while a task is queued.
  if v_lane in ('statement_facts','statement_parse') then
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='statement_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='statement_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      -- AS-BUILT LADDER FIX (2026-07-31): the gate ACTS ON any in-flight queued task rather
      -- than writing a receipt beside it -- the ordering rationale above promises the vendor
      -- read stops, so it stops: the queued row flips to the gate verdict in this same
      -- transaction (never-claimed failed rows are legal for both gate codes -- the widened
      -- binding CHECK). A running task is past claiming and settles through its own persist.
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          -- Re-read of an EXISTING terminal receipt: this call acted on nothing, so it
          -- emits nothing (delta-review round 2, 2026-07-31: the unconditional emit here
          -- re-fired on every dark re-try and, picked by uuid order, could name an older
          -- task than the one the verdict actually acted on). The verdict reached the
          -- spine when its receipt was minted; re-reads only report it.
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        -- The flip acted: name the newest flipped row (version order, never uuid order).
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      -- 0038 as-built fix (2026-07-31): every statement-lane terminal receipt this core
      -- mints reaches the spine as the STATEMENT twin with its reason -- and EXACTLY ONCE
      -- per verdict instance: only the two acting branches (the flip, the fresh insert)
      -- reach this emit; the re-read branch returned above. The wrapper
      -- (enqueue_invoice_facts, recut in E2b) no longer emits its invoice twin for
      -- statement lanes, so this is the single emit site on every caller path --
      -- file_document's direct core calls included.
      perform clara._append_event(d.firm_id,'document.statement_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  elsif v_lane='llm_witness' then
    -- F-A1 PR-1 (design SS3.5/SS6, wall 6): the SAME enqueue-time typed-consent gate, keyed
    -- on purpose='witness_extraction' instead of 'statement_extraction', with its OWN named
    -- refusal codes (wall 7) rather than a reuse of the statement family's bare literals --
    -- witness and statement consent are granted independently, so the codes must stay
    -- distinguishable. INERT AT PR-1: nothing in this body (or anywhere else at this
    -- frontier) ever assigns v_lane:='llm_witness' -- no mime/kind arm mints it yet, and the
    -- lane CHECK plus enqueueForLane's runtime allowlist keep an old image from reaching this
    -- branch even by accident. Wired now so the gate exists the moment PR-3's router recut
    -- adds the classification arm, rather than landing a second CoR on this pinned body then.
    select array_agg(distinct f.client_id) into v_stmt_clients
      from clara.document_filings f
      where f.document_id=p_document and f.retired_at is null;
    if coalesce(array_length(v_stmt_clients,1),0)>1 then
      v_gate:='witness_multi_client';
    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then
      -- Zero active filings: no client exists who could have authorized this read. Fail closed.
      v_gate:='witness_consent_inactive';
    else
      v_stmt_client:=v_stmt_clients[1];
      if not exists(select 1 from clara.client_egress_purpose_activations a
          join clara.client_egress_purpose_consents c
            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
              and c.purpose=a.purpose
          where a.firm_id=d.firm_id and a.client_id=v_stmt_client
            and a.purpose='witness_extraction'
            and a.deactivated_at is null and c.revoked_at is null) then
        v_gate:='witness_consent_inactive';
      end if;
    end if;
    if v_gate is not null then
      update clara.document_processing_tasks
        set status='failed', error_code=v_gate, finished_at=now()
        where document_id=p_document and lane=v_lane and status='queued';
      get diagnostics v_flip = row_count;
      if v_flip = 0 then
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
        if v_task is not null then
          return jsonb_build_object('task_id',v_task,'document_id',p_document,
            'status','failed','reason',v_gate);
        end if;
        select coalesce(max(version_n),0)+1 into v_version
          from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane;
        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,
            engine_config,version_n,lane,status,error_code,finished_at)
          values(d.firm_id,p_document,v_engine,'{}'::jsonb,
            v_version,v_lane,'failed',v_gate,now())
          returning id into v_task;
      else
        select id into v_task from clara.document_processing_tasks
          where document_id=p_document and lane=v_lane
            and status='failed' and error_code=v_gate
          order by version_n desc limit 1;
      end if;
      perform clara._append_event(d.firm_id,'document.llm_witness_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason',v_gate);
    end if;
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane=v_lane;
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,v_engine,'{}'::jsonb,
        v_version,v_lane,'failed','attempt_cap',now()) returning id into v_task;
    -- 0038 as-built fix (2026-07-31, regression-cells lane finding): THIS branch, not the
    -- claim-time belt, is the one a capped statement actually reaches -- the running attempt
    -- sum already reads 3 when the next enqueue fires, so the pre-fail intercepts before any
    -- claim exists to emit. Without an emit here the statement feed never learns its document
    -- died. Statement lanes only: the invoice lane's enqueue-time cap has been event-silent
    -- since 0026, and lighting it now would wake the autodraft consumer on a path Wave A
    -- never exercised -- that silence stays, recorded here as a pre-existing residual.
    if v_lane in ('statement_facts','statement_parse') then
      perform clara._append_event(d.firm_id, 'document.statement_facts_failed',
        null,null,null,null,
        null,p_document,null,jsonb_build_object('task_id',v_task,'reason','attempt_cap'));
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,v_engine,'{}'::jsonb,
      v_version,v_lane,'queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    -- 0026 (amendment A11): the widened (document_id,engine_id,version_n,lane) key means a
    -- conflict HERE is now a genuine same-lane duplicate — a cross-lane collision is
    -- structurally impossible, lane joins the key. The exact colliding row must exist
    -- regardless of its current status (it may already be done/failed by the time we look
    -- again); silence hid this for the product's whole life, so an absent row here is
    -- impossible-state-loud, not a null task_id.
    select id,status into v_task,v_task_status from clara.document_processing_tasks
      where document_id=p_document and engine_id=v_engine and version_n=v_version and lane=v_lane;
    if v_task is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
        p_document,v_engine,v_version,v_lane using errcode='CLR35';
    end if;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',v_task_status);
  end if;
  -- Only the AZURE lanes consume the page budget; classify, the local parse and the local
  -- statement parse reserve nothing. 0038 adds statement_facts to the reserving set, which is
  -- what "the statement lane joins every existing spend control" means concretely.
  if v_lane in ('invoice_facts','statement_facts') then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      -- 0038 as-built fix (2026-07-31): the statement lane's budget verdict reaches the
      -- spine as the STATEMENT twin (single emit site -- the wrapper, recut in E2b,
      -- suppresses its invoice twin for statement lanes). The invoice lane keeps its
      -- pre-existing shape: silent here, emitted by the wrapper.
      if v_lane='statement_facts' then
        perform clara._append_event(d.firm_id,'document.statement_facts_failed',
          null,null,null,null,
          null,p_document,null,jsonb_build_object('task_id',v_task,'reason','budget'));
      end if;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;
alter function clara._enqueue_invoice_facts_core(uuid) owner to clara_fn_owner;

reset role;

do $s7e_post$
declare v_src text; v_sha text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '99f18f4e90022b191826db7e654696c753c8e210711f00026bc4b72c9975d723' then
    raise exception 'f_a1_walls S7e postcheck: _enqueue_invoice_facts_core prosrc sha256 mismatch (got %, expected 99f18f4e90022b191826db7e654696c753c8e210711f00026bc4b72c9975d723)', v_sha using errcode='CLR10';
  end if;
  if position('elsif v_lane=''llm_witness'' then' in v_src)=0 then
    raise exception 'f_a1_walls S7e postcheck: the inert llm_witness enqueue-gate branch is missing' using errcode='CLR10';
  end if;
  if position('a.purpose=''witness_extraction''' in v_src)=0 then
    raise exception 'f_a1_walls S7e postcheck: the llm_witness branch does not key its activation lookup on purpose=witness_extraction' using errcode='CLR10';
  end if;
  if position('witness_multi_client' in v_src)=0 or position('witness_consent_inactive' in v_src)=0 then
    raise exception 'f_a1_walls S7e postcheck: the llm_witness branch does not mint its own named refusal codes' using errcode='CLR10';
  end if;
  if position('document.llm_witness_failed' in v_src)=0 then
    raise exception 'f_a1_walls S7e postcheck: the llm_witness enqueue-refusal emit does not name document.llm_witness_failed' using errcode='CLR10';
  end if;
  -- The statement branch stays byte-untouched in shape: still the sole ORIGINAL if-arm,
  -- unwidened, still emitting its own statement twin.
  if position('if v_lane in (''statement_facts'',''statement_parse'') then' in v_src)=0 then
    raise exception 'f_a1_walls S7e postcheck: the statement lanes'' enqueue-gate arm moved or was widened -- it must stay byte-untouched' using errcode='CLR10';
  end if;
  if not exists(select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure
              and a.grantee='clara_fn_owner'::regrole and a.privilege_type='EXECUTE')
     or exists(select 1 from pg_proc p, aclexplode(p.proacl) a
            where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure
              and a.grantee<>'clara_fn_owner'::regrole) then
    raise exception 'f_a1_walls S7e postcheck: _enqueue_invoice_facts_core must stay UNGRANTED to every role but clara_fn_owner' using errcode='CLR10';
  end if;
  raise notice 'f_a1_walls S7e: _enqueue_invoice_facts_core recut -- the INERT llm_witness typed-consent gate is wired (purpose=witness_extraction, its own witness_multi_client/witness_consent_inactive codes, document.llm_witness_failed emit); the statement arm is byte-untouched; still ungranted to every app role';
end
$s7e_post$;

-- =====================================================================================
-- SECTION 8 -- WALL 7: BOTH refusal-code CHECKs gain the witness consent_inactive family.
-- Named explicitly rather than reusing the statement family's bare literals (they must
-- stay distinguishable -- a firm can hold one active consent family and not the other):
--   witness_multi_client     mirrors statement_multi_client
--   witness_consent_inactive mirrors consent_inactive, witness-scoped
-- Both codes are UNREACHABLE at this frontier (section 7e's gate is inert), but the CHECK
-- must already admit them before PR-3 can wire the reachable path without its own DB
-- migration -- the same shape 0038 itself shipped ahead of full router wiring.
-- =====================================================================================
alter table clara.document_processing_tasks drop constraint ck_processing_task_error_code_0038;
alter table clara.document_processing_tasks add constraint ck_processing_task_error_code_f_a1 check (
  error_code is null or error_code in
    ('engine_error','timeout','engine_lost','storage_error','corrupt','encrypted',
     'bad_type','limit','budget','attempt_cap','internal','skipped_kind',
     'header_unreadable','totals_unreadable','readers_disagree','chain_broken',
     'continuity_mismatch','duplicate_period','overlapping_period','non_myr_statement',
     'account_unregistered','account_inactive','statement_multi_client','period_invalid',
     'line_date_out_of_period','consent_inactive','witness_multi_client','witness_consent_inactive'));

alter table clara.document_processing_tasks drop constraint ck_processing_task_binding_0038;
alter table clara.document_processing_tasks add constraint ck_processing_task_binding_f_a1 check (
  (status in ('queued','held_egress') and workflow_run_id is null and started_at is null)
  or (status in ('running','done') and workflow_run_id is not null and started_at is not null)
  or (status = 'failed' and (
    (workflow_run_id is not null and started_at is not null)
    or (workflow_run_id is null and started_at is null
        and error_code in ('budget','attempt_cap','skipped_kind',
                           'consent_inactive','statement_multi_client',
                           'witness_multi_client','witness_consent_inactive'))
  )));

-- =====================================================================================
-- SECTION 9 -- get_document_extract recut (0054's live body).
--   M7  -- publish extracted_at per extraction entry AND per region entry (ADDITIVE
--         read-seam widening; 0054:284-289 lacked it).
--   M14 -- EXCLUDE witness-kind envelopes (llm_text_facts/llm_vision_facts) from the
--         budgeted envelope set. Exclusion chosen over bounding: a persist-whole vision (or
--         text) envelope competing for even a BOUNDED slice of the 20k-char default budget
--         could still starve the OCR regions the frozen toolfaces cite at the margin;
--         exclusion removes the contention outright. Regions are UNCHANGED -- a witness
--         extraction's own regions still compete for the region budget exactly as an OCR
--         extraction's do; only its whole-document envelope blob is starved to ''.
-- The documented idx contract (0054:32-42: dense 1..N over (engine_kind,version_n,r.id),
-- stable within a generation, renumbering across one) is preserved verbatim -- neither
-- change touches the idx computation or the CTE ordering it is derived from.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.get_document_extract(p_document uuid,
    p_client uuid default null,p_max_chars int default 20000) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_result jsonb; v_budget int:=least(greatest(coalesce(p_max_chars,20000),0),100000);
  -- hc, not c: the extract query aliases the `chosen` CTE as c — a local record
  -- named c would capture the qualified c.* references (42703).
  w record; hc record; v_firm uuid;
begin
  -- ADR-015: inside SECURITY DEFINER the caller's SET ROLE is invisible
  -- (current_role = the owner), so the wake-secret GUC's PRESENCE is the agent
  -- lane's structural marker. A human PostgREST caller CAN set clara.wake_secret,
  -- but that is not a bypass: a garbage/forged value makes wake_context() return
  -- no row → CLR03 refusal (never data); a valid secret is exactly an authorized
  -- agent credential. The security boundary is wake_context()'s hash+liveness
  -- check, NOT the GUC being unreachable. (Runtime pools SET LOCAL it per request.)
  if coalesce(current_setting('clara.wake_secret',true),'')<>'' then
    select * into w from clara.wake_context();
    if w.credential_id is null then
      raise exception 'no valid agent read context' using errcode='CLR03';
    end if;
    if w.wake_kind not in ('interactive','proactive') then
      perform clara.assert_wake_allowed(w.wake_kind,'get_document_extract');
    end if;
    if w.client_id is not null and p_client is distinct from w.client_id then return null; end if;
    v_firm:=w.firm_id;
  else
    hc:=clara._human_ctx(clara.role_rank('viewer')); v_firm:=hc.firm;
  end if;
  with target as (
    select d.*,
      not exists(select 1 from clara.document_filings f
                 where f.document_id=d.id and f.retired_at is null) as unassigned
    from clara.documents d where d.id=p_document and d.firm_id=v_firm
  ), admitted as (
    select * from target d where d.unassigned or exists(
      select 1 from clara.document_filings f where f.document_id=d.id
        and f.client_id=p_client and f.retired_at is null)
  ), chosen as (
    select distinct on (e.engine_kind) e.*
    from clara.document_extractions e join admitted d on d.id=e.document_id
    where e.status='done'
    order by e.engine_kind,e.version_n desc,e.id desc
  ), pieces as (
    -- F-A1 PR-1 (M14): witness-kind envelopes (llm_text_facts/llm_vision_facts) are
    -- EXCLUDED from the budgeted envelope set rather than bounded by a smaller per-kind
    -- cap -- exclusion chosen over bounding, because the OCR regions the frozen toolfaces
    -- cite must never lose budget to a persist-whole vision/text envelope, and a bound would
    -- still let a large-enough witness envelope crowd them at the margin. The witness
    -- extraction ROW still surfaces in extractions[] below (id, engine_kind, version_n,
    -- status, extracted_at) -- only its envelope_text is starved to '' by this exclusion,
    -- via the same correlated-subselect coalesce the shape already used for a missing
    -- budgeted row. Regions are UNCHANGED: a witness extraction's own regions (if any) still
    -- compete for the region budget exactly as an OCR extraction's do.
    select ('0:'||c.id::text) as ord,'envelope'::text as kind,c.id as extraction_id,
      null::uuid as region_id,c.envelope::text as content
    from chosen c
    where c.engine_kind not in ('llm_text_facts','llm_vision_facts')
    union all
    select ('1:'||r.extraction_id::text||':'||r.id::text),'region',r.extraction_id,
      r.id,coalesce(r.text_content,'')
    from clara.document_regions r join chosen c on c.id=r.extraction_id
  ), budgeted as (
    select p.*,
      greatest(0,least(length(content),v_budget-coalesce(sum(length(content)) over(
        order by ord rows between unbounded preceding and 1 preceding),0)))::int as take_n
    from pieces p
  ), extraction_json as (
    -- F-A1 PR-1 (M7): extracted_at PUBLISHED per extraction entry -- additive read-seam
    -- widening. This is the same clock the resolver dispatch (a DIFFERENT PR-1 piece) uses
    -- to decide cross-regime precedence between a witness pair and a legacy generation; the
    -- read seam had no way to surface it before this file.
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'engine_id',c.engine_id,'engine_kind',c.engine_kind,
      'version_n',c.version_n,'status',c.status,'page_count',c.page_count,
      'extracted_at',c.extracted_at,
      'envelope_text',coalesce((select left(b.content,b.take_n) from budgeted b
        where b.kind='envelope' and b.extraction_id=c.id),''),
      'raw_sha256',c.envelope->>'raw_sha256',
      'normalization_version',c.envelope->>'normalization_version')
      order by c.engine_kind,c.version_n),'[]'::jsonb) as value from chosen c
  ), region_rows as (
    -- 0054 (F9): the STABLE per-region ordinal the toolface cites. The key is the SAME
    -- triple this shape has aggregated by since 0009 — (engine_kind, version_n, r.id) —
    -- every column immutable for a settled extraction, so a region answers the same idx
    -- on every call. DENSE 1..N over exactly the rows aggregated below (the budgeted join
    -- lives INSIDE this CTE, so no region can be numbered here and dropped there). The
    -- model cites idx; the SERVER resolves it back to this row's id;
    -- clara._write_entry_evidence still receives a region_id and still checks it by plain
    -- id-equality. Nothing about the wall moves.
    select r.id,r.extraction_id,r.locator_kind,r.locator,r.field_path,
      r.engine_confidence,r.monetary_raw,r.monetary_cents,
      c.engine_kind,c.version_n,c.extracted_at,left(b.content,b.take_n) as text_content,
      (row_number() over(order by c.engine_kind,c.version_n,r.id))::int as idx
    from clara.document_regions r join chosen c on c.id=r.extraction_id
    join budgeted b on b.kind='region' and b.region_id=r.id
  ), region_json as (
    -- F-A1 PR-1 (M7): extracted_at PUBLISHED per region entry too, sourced off the SAME
    -- chosen.extracted_at the extraction entry above carries -- one clock, read twice.
    select coalesce(jsonb_agg(jsonb_build_object(
      'idx',rr.idx,
      'id',rr.id,'extraction_id',rr.extraction_id,'engine_kind',rr.engine_kind,
      'version_n',rr.version_n,'extracted_at',rr.extracted_at,
      'locator_kind',rr.locator_kind,'locator',rr.locator,
      'field_path',rr.field_path,'text_content',rr.text_content,
      'engine_confidence',rr.engine_confidence,'monetary_raw',rr.monetary_raw,
      'monetary_cents',rr.monetary_cents) order by rr.idx),
      '[]'::jsonb) as value
    from region_rows rr
  )
  select jsonb_build_object(
    'document',jsonb_build_object('id',d.id,'sha256',d.sha256,
      'original_filename',d.original_filename,'mime_type',d.mime_type,
      'byte_size',d.byte_size,'bytes_verified_at',d.bytes_verified_at,
      'page_count',d.page_count,'extraction_status',d.extraction_status,
      'document_kind',d.document_kind,'financial_date',d.financial_date),
    'unassigned',d.unassigned,
    'filing',case when d.unassigned then null else (select jsonb_build_object(
      'id',f.id,'client_id',f.client_id,'filed_at',f.filed_at,'basis',f.basis)
      from clara.document_filings f where f.document_id=d.id
        and f.client_id=p_client and f.retired_at is null) end,
    'extractions',ej.value,'regions',rj.value,'max_chars',v_budget)
    into v_result
  from admitted d cross join extraction_json ej cross join region_json rj;
  return v_result;
end $$;
alter function clara.get_document_extract(uuid,uuid,int) owner to clara_fn_owner;

reset role;

-- THE PARSE-ANALYSIS PROBE (0054's own discipline: a plpgsql body's statements are
-- planned lazily, so a successful CREATE OR REPLACE proves only syntax). Carries the
-- recut CTE chain so a mistyped column, an ambiguous reference or a type error in the
-- edited CTEs fails THIS migration rather than the first bookkeeper who opens a document.
create or replace function pg_temp._f_a1_extract_planprobe(p_document uuid, p_client uuid, v_budget int)
  returns jsonb language sql stable as $probe$
  with chosen as (
    select distinct on (e.engine_kind) e.*
    from clara.document_extractions e
    where e.document_id=p_document and e.status='done' and p_client is not null
    order by e.engine_kind,e.version_n desc,e.id desc
  ), pieces as (
    select ('0:'||c.id::text) as ord,'envelope'::text as kind,c.id as extraction_id,
      null::uuid as region_id,c.envelope::text as content
    from chosen c
    where c.engine_kind not in ('llm_text_facts','llm_vision_facts')
    union all
    select ('1:'||r.extraction_id::text||':'||r.id::text),'region',r.extraction_id,
      r.id,coalesce(r.text_content,'')
    from clara.document_regions r join chosen c on c.id=r.extraction_id
  ), budgeted as (
    select p.*,
      greatest(0,least(length(content),v_budget-coalesce(sum(length(content)) over(
        order by ord rows between unbounded preceding and 1 preceding),0)))::int as take_n
    from pieces p
  ), extraction_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'engine_id',c.engine_id,'engine_kind',c.engine_kind,
      'version_n',c.version_n,'status',c.status,'page_count',c.page_count,
      'extracted_at',c.extracted_at,
      'envelope_text',coalesce((select left(b.content,b.take_n) from budgeted b
        where b.kind='envelope' and b.extraction_id=c.id),''),
      'raw_sha256',c.envelope->>'raw_sha256',
      'normalization_version',c.envelope->>'normalization_version')
      order by c.engine_kind,c.version_n),'[]'::jsonb) as value from chosen c
  ), region_rows as (
    select r.id,r.extraction_id,r.locator_kind,r.locator,r.field_path,
      r.engine_confidence,r.monetary_raw,r.monetary_cents,
      c.engine_kind,c.version_n,c.extracted_at,left(b.content,b.take_n) as text_content,
      (row_number() over(order by c.engine_kind,c.version_n,r.id))::int as idx
    from clara.document_regions r join chosen c on c.id=r.extraction_id
    join budgeted b on b.kind='region' and b.region_id=r.id
  ), region_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'idx',rr.idx,
      'id',rr.id,'extraction_id',rr.extraction_id,'engine_kind',rr.engine_kind,
      'version_n',rr.version_n,'extracted_at',rr.extracted_at,
      'locator_kind',rr.locator_kind,'locator',rr.locator,
      'field_path',rr.field_path,'text_content',rr.text_content,
      'engine_confidence',rr.engine_confidence,'monetary_raw',rr.monetary_raw,
      'monetary_cents',rr.monetary_cents) order by rr.idx),
      '[]'::jsonb) as value
    from region_rows rr
  )
  select jsonb_build_object('extractions',ej.value,'regions',rj.value)
  from extraction_json ej cross join region_json rj;
$probe$;

do $s9_post$
declare v_src text; v_sha text; v_probe text;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_document_extract(uuid,uuid,int)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'a0946f8272945efc10120bbc7b48966b774d35bf912fdd49ace39775ee9ab69f' then
    raise exception 'f_a1_walls S9 postcheck: get_document_extract prosrc sha256 mismatch (got %, expected a0946f8272945efc10120bbc7b48966b774d35bf912fdd49ace39775ee9ab69f)', v_sha using errcode='CLR10';
  end if;
  -- M7: extracted_at published on BOTH entry shapes.
  if position('''extracted_at'',c.extracted_at' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: extraction_json does not publish extracted_at (M7)' using errcode='CLR10';
  end if;
  if position('''extracted_at'',rr.extracted_at' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: region_json does not publish extracted_at (M7)' using errcode='CLR10';
  end if;
  -- M14: the envelope branch of pieces excludes witness kinds; the region branch does not.
  if position('from chosen c
    where c.engine_kind not in (''llm_text_facts'',''llm_vision_facts'')
    union all' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: the envelope branch of pieces does not exclude witness-kind extractions (M14)' using errcode='CLR10';
  end if;
  if position('document_regions r join chosen c on c.id=r.extraction_id
  ), budgeted' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: the region branch of pieces was touched -- M14 excludes ENVELOPES only, regions must stay universal' using errcode='CLR10';
  end if;
  -- The documented idx contract survives verbatim.
  if position('(row_number() over(order by c.engine_kind,c.version_n,r.id))::int as idx' in v_src)=0
     or position('order by rr.idx)' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: the 0054 idx contract (dense ordinal over engine_kind,version_n,r.id, aggregated in idx order) did not survive verbatim' using errcode='CLR10';
  end if;
  -- Every pre-existing region + extraction key survived (additive discipline, 0054's own).
  if position('''envelope_text''' in v_src)=0 or position('''raw_sha256''' in v_src)=0
     or position('''normalization_version''' in v_src)=0 or position('''locator_kind'',rr.locator_kind' in v_src)=0
     or position('''monetary_cents'',rr.monetary_cents' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: a pre-existing extraction/region key was lost -- this recut must stay additive' using errcode='CLR10';
  end if;
  -- 0011's agent lane and the char-budget truncation survive.
  if position('clara.wake_context()' in v_src)=0
     or position('assert_wake_allowed(w.wake_kind,''get_document_extract'')' in v_src)=0
     or position('left(b.content,b.take_n) as text_content' in v_src)=0 then
    raise exception 'f_a1_walls S9 postcheck: 0011''s agent lane or the char-budget truncation did not survive' using errcode='CLR10';
  end if;
  -- The parse-analysis probe certifies the installed text, not a lookalike.
  select p.prosrc into v_probe from pg_proc p
    where p.pronamespace = pg_my_temp_schema() and p.proname = '_f_a1_extract_planprobe';
  if v_probe is null then
    raise exception 'f_a1_walls S9 postcheck: the pg_temp parse-analysis probe is absent' using errcode='CLR10';
  end if;
  if position('where c.engine_kind not in (''llm_text_facts'',''llm_vision_facts'')' in v_probe)=0 then
    raise exception 'f_a1_walls S9 postcheck: the probe does not certify the M14 exclusion' using errcode='CLR10';
  end if;
  -- ACLs unchanged (0054's own pinned matrix).
  if not has_function_privilege('clara_authenticated', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute')
     or not has_function_privilege('clara_agent_ro', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute') then
    raise exception 'f_a1_walls S9 postcheck: clara_authenticated/clara_agent_ro lost EXECUTE on get_document_extract' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_wake_interactive', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_runtime', 'clara.get_document_extract(uuid,uuid,int)'::regprocedure, 'execute') then
    raise exception 'f_a1_walls S9 postcheck: get_document_extract became reachable from a role 0011''s ACL matrix pins as NO' using errcode='CLR10';
  end if;
  raise notice 'f_a1_walls S9: get_document_extract recut -- extracted_at published per extraction AND per region entry (M7); witness-kind envelopes excluded from the budgeted envelope set while their regions stay universal (M14); the 0054 idx contract, the agent lane, ACLs and every pre-existing key survive verbatim; parse-analysis probe certifies the installed text';
end
$s9_post$;

-- =====================================================================================
-- SECTION 10 -- WALL 13: the queued->failed TRANSITION ARM in clara._tf_processing_task_update.
--
-- WHY THIS IS A WALL AND NOT A NICETY. Section 7e's llm_witness enqueue gate FLIPS an in-flight
-- queued task in place:
--     update clara.document_processing_tasks
--        set status='failed', error_code=v_gate, finished_at=now()
--      where document_id=p_document and lane=v_lane and status='queued';
-- and `v_gate` is 'witness_consent_inactive' or 'witness_multi_client'. The row-level UPDATE
-- trigger's transition table admits queued->failed ONLY for ('budget','attempt_cap'), the two
-- STATEMENT-scoped gate verdicts (0038 E2b) and lane-scoped 'skipped_kind' (0040 S4.11a). So the
-- flip would raise CLR16 'illegal document processing transition queued -> failed' the first time
-- PR-3's router mints a witness task -- section 8 widened the two CHECKs and section 7e wired the
-- gate, but the TRANSITION was never opened, which is the half-wall shape this estate has been
-- bitten by before (0038:7200-7205 records forgetting the SECOND refusal-code CHECK). The gate is
-- inert today, so the defect is unreachable today; a wall that is only correct while its lane is
-- dead is not a wall.
--
-- LANE-SCOPED, exactly as 0038 E2b and 0040 S4.11a scoped theirs: the two witness codes are
-- admissible on this transition ONLY for lane='llm_witness'. A queued invoice/classify/ocr/
-- statement task can never be flipped to a witness verdict by any future writer, and the three
-- pre-existing arms are carried through untouched.
--
-- THE SPLICE DISCIPLINE is 0040 S4.11a's, verbatim in shape: read pg_get_functiondef off the LIVE
-- catalog, assert the transition table occurs EXACTLY ONCE, replace() only there, execute the
-- result. Nothing is retyped, so every arm this section does not name survives BY CONSTRUCTION.
-- D1: this is a live TRIGGER body on the hot path -- the file's header already carries the
-- write-quiesce obligation for its two other live recuts and this joins them.
-- =====================================================================================
set role clara_fn_owner;

do $s10$
declare
  v_sig text := 'clara._tf_processing_task_update()';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception 'f_a1_walls S10 prestate: clara._tf_processing_task_update is GONE' using errcode='CLR10';
  end if;
  v_frm := $f$    v_ok:=(old.status='queued' and new.status in ('running','held_egress'))
      or (old.status='queued' and new.status='failed'
          and (new.error_code in ('budget','attempt_cap')
               or (new.error_code in ('consent_inactive','statement_multi_client')
                   and new.lane in ('statement_facts','statement_parse'))
               or (new.error_code='skipped_kind'
                   and new.lane in ('invoice_facts','statement_facts','statement_parse'))))
      or (old.status='held_egress' and new.status='queued')
      or (old.status='running' and new.status in ('done','failed','queued','held_egress'));$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception 'f_a1_walls S10 prestate: the 0040 S4.11a transition table appears % times (expected exactly 1) -- the live body drifted and a splice here would silently revert it', v_cnt
      using errcode='CLR10';
  end if;

  v_to := $t$    -- F-A1 PR-1 (wall 13): the WITNESS gate verdicts join the queued->failed arm,
    -- LANE-SCOPED exactly as 0038 E2b and 0040 S4.11a scoped theirs. _enqueue_invoice_facts_core's
    -- llm_witness branch flips an in-flight queued task in place when the typed witness_extraction
    -- consent is absent/inactive or the document is filed to more than one client; both codes are
    -- never-claimed (ck_processing_task_binding_f_a1) and the flip is their only writer. Scoping is
    -- the point: no future writer can flip a queued invoice/classify/ocr/statement task to a
    -- WITNESS verdict, and no lane can flip a running or terminal task at all.
    v_ok:=(old.status='queued' and new.status in ('running','held_egress'))
      or (old.status='queued' and new.status='failed'
          and (new.error_code in ('budget','attempt_cap')
               or (new.error_code in ('consent_inactive','statement_multi_client')
                   and new.lane in ('statement_facts','statement_parse'))
               or (new.error_code in ('witness_consent_inactive','witness_multi_client')
                   and new.lane='llm_witness')
               or (new.error_code='skipped_kind'
                   and new.lane in ('invoice_facts','statement_facts','statement_parse'))))
      or (old.status='held_egress' and new.status='queued')
      or (old.status='running' and new.status in ('done','failed','queued','held_egress'));$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;
end
$s10$;

reset role;

do $s10_post$
declare v_src text; v_stripped text; v_cnt int;
begin
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_processing_task_update()'::regprocedure;
  -- THE PROBE IS WHITESPACE-STRIPPED, and that is the finding rather than the convenience: the
  -- arm is written across two source lines with an indentation this file chose, so a probe for
  -- the literal text would be asserting THIS FILE'S formatting, not the landed predicate. Comments
  -- are stripped first for the 0093:318-321 reason -- the arm's own commentary NAMES both codes,
  -- so a naive prosrc match would report the documentation as the behaviour.
  v_stripped := regexp_replace(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'),
                               '[[:space:]]', '', 'g');
  if position('new.error_codein(''witness_consent_inactive'',''witness_multi_client'')andnew.lane=''llm_witness''' in v_stripped) = 0 then
    raise exception 'f_a1_walls S10 postcheck: the lane-scoped witness arm did not land in the EXECUTABLE text of the transition table' using errcode='CLR10';
  end if;
  -- PARTIAL BIRTH: exactly one witness arm, and it names BOTH codes. A body carrying one code
  -- alone is a half-splice that would leave one refusal path raising CLR16 forever.
  v_cnt := (length(v_stripped) - length(replace(v_stripped, 'witness_consent_inactive', '')))
           / length('witness_consent_inactive');
  if v_cnt <> 1 then
    raise exception 'f_a1_walls S10 postcheck: witness_consent_inactive appears % times in the executable text (expected 1)', v_cnt using errcode='CLR10';
  end if;
  v_cnt := (length(v_stripped) - length(replace(v_stripped, 'witness_multi_client', '')))
           / length('witness_multi_client');
  if v_cnt <> 1 then
    raise exception 'f_a1_walls S10 postcheck: witness_multi_client appears % times in the executable text (expected 1)', v_cnt using errcode='CLR10';
  end if;
  -- THE THREE PRE-EXISTING ARMS SURVIVED. 0038 E2b's lane scoping marker is counted the way 0040
  -- itself counts it, and 0011's two immutability raises are named.
  v_cnt := (length(v_src) - length(replace(v_src,
             $m$new.lane in ('statement_facts','statement_parse')$m$, '')))
           / length($m$new.lane in ('statement_facts','statement_parse')$m$);
  if v_cnt <> 1 then
    raise exception 'f_a1_walls S10 postcheck: the 0038 E2b lane-scoping marker count is now % (expected 1) -- E2b was disturbed', v_cnt using errcode='CLR10';
  end if;
  if position('skipped_kind' in v_src) = 0 then
    raise exception 'f_a1_walls S10 postcheck: 0040''s re-kind retirement arm was lost' using errcode='CLR10';
  end if;
  if position('document processing task identity/config is immutable' in v_src) = 0
     or position('terminal document processing task is immutable' in v_src) = 0 then
    raise exception 'f_a1_walls S10 postcheck: a 0011 immutability arm was lost' using errcode='CLR10';
  end if;
  -- Binding, owner, security posture and the trigger wiring are unmoved.
  if not exists (select 1 from pg_proc p where p.oid='clara._tf_processing_task_update()'::regprocedure
                   and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                   and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'f_a1_walls S10 postcheck: _tf_processing_task_update is no longer a search_path-pinned SECURITY DEFINER owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid='clara.document_processing_tasks'::regclass
                    and t.tgfoid='clara._tf_processing_task_update()'::regprocedure
                    and not t.tgisinternal) then
    raise exception 'f_a1_walls S10 postcheck: the trigger binding on clara.document_processing_tasks is gone' using errcode='CLR10';
  end if;
  raise notice 'f_a1_walls S10: wall 13 -- clara._tf_processing_task_update''s queued->failed arm now admits (witness_consent_inactive, witness_multi_client) for lane=llm_witness ONLY; both codes appear exactly once in the executable text, 0038 E2b''s statement scoping and 0040''s skipped_kind arm and 0011''s two immutability raises all survive, and the trigger binding/owner/definer posture is unmoved.';
end
$s10_post$;

-- =====================================================================================
-- TAIL CENSUS -- re-reads the live catalog end to end. This is the evidence a reviewer
-- reads; a tail that only says OK has proven nothing (db-migrations.md).
-- =====================================================================================
do $tail$
declare v_n int; v_def text;
begin
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_extractions' and con.conname='ck_document_extractions_engine_kind_f_a1';
  if v_def is null or v_def not like '%llm_text_facts%' or v_def not like '%llm_vision_facts%' then
    raise exception 'f_a1_walls tail: engine_kind CHECK missing or does not admit both witness kinds' using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_lane_f_a1';
  if v_def is null or v_def not like '%llm_witness%' then
    raise exception 'f_a1_walls tail: lane CHECK missing or does not admit llm_witness' using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_lane_engine_f_a1';
  if v_def is null or v_def not like '%llm_witness%' or v_def not like '%llm-%' then
    raise exception 'f_a1_walls tail: lane<->engine prefix CHECK missing the llm_witness/llm-%% arm' using errcode='CLR10';
  end if;
  if v_def not like '%clara-fixture:%' then
    raise exception 'f_a1_walls tail: the lane-blind clara-fixture:%% arm was lost from the prefix CHECK' using errcode='CLR10';
  end if;

  select count(*)::int into v_n from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname in ('client_egress_purpose_consents','client_egress_purpose_activations','egress_dispatch_authorizations')
      and con.contype='c' and pg_get_constraintdef(con.oid) like '%witness_extraction%' and pg_get_constraintdef(con.oid) not like '%document_sha256%';
  if v_n <> 3 then
    raise exception 'f_a1_walls tail: expected all 3 purpose CHECKs to admit witness_extraction, found %', v_n using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.conname='ck_egress_dispatch_authorizations_doc_sha';
  if v_def is null or v_def not like '%witness_extraction%' then
    raise exception 'f_a1_walls tail: doc_sha CHECK missing the witness_extraction arm' using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_error_code_f_a1';
  if v_def is null or v_def not like '%witness_multi_client%' or v_def not like '%witness_consent_inactive%' then
    raise exception 'f_a1_walls tail: error_code CHECK missing the witness refusal-code family' using errcode='CLR10';
  end if;

  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_processing_tasks' and con.conname='ck_processing_task_binding_f_a1';
  if v_def is null or v_def not like '%witness_multi_client%' or v_def not like '%witness_consent_inactive%' then
    raise exception 'f_a1_walls tail: binding CHECK missing the witness refusal-code family in its never-claimed allowlist' using errcode='CLR10';
  end if;

  if not exists(select 1 from information_schema.columns where table_schema='clara' and table_name='firm_document_limits' and column_name='llm_witness_concurrency' and is_nullable='YES') then
    raise exception 'f_a1_walls tail: firm_document_limits.llm_witness_concurrency is missing or NOT NULL (must be nullable)' using errcode='CLR10';
  end if;

  -- WALL 13 (section 10), re-read here end-to-end rather than trusted from its own postcheck:
  -- the two witness refusal codes are admissible on queued->failed, and ONLY for llm_witness.
  -- Read on the comment-stripped, whitespace-stripped EXECUTABLE text -- the arm's commentary
  -- names both codes, so a raw prosrc probe would pass on the documentation alone (0093:318-321's
  -- lesson, and review law 3: a guard that reads a NAME reads a projection of the thing).
  select regexp_replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'),
                        '[[:space:]]', '', 'g') into v_def
    from pg_proc p where p.oid='clara._tf_processing_task_update()'::regprocedure;
  if v_def is null
     or position('new.error_codein(''witness_consent_inactive'',''witness_multi_client'')andnew.lane=''llm_witness''' in v_def) = 0 then
    raise exception 'f_a1_walls tail: the queued->failed transition arm does not admit the witness refusal family for lane=llm_witness -- section 7e''s in-place gate flip would raise CLR16' using errcode='CLR10';
  end if;

  raise notice 'f_a1_walls tail: engine_kind/lane/prefix CHECKs widened; the typed-purpose surface (3 purpose CHECKs + doc_sha CHECK + 4 verbs + prepare_egress_dispatch, ACL matrix unmoved) admits witness_extraction; claim_document_processing_task + release_held_document_tasks join llm_witness with its OWN concurrency column; both refusal-code CHECKs carry the witness family AND the queued->failed TRANSITION arm now admits it lane-scoped (wall 13); _enqueue_invoice_facts_core carries the inert witness gate; get_document_extract publishes extracted_at and excludes witness envelopes from the char budget. Every recut body verified by exact prosrc sha256.';
end
$tail$;