-- =====================================================================
-- Migration 0026 (lane joins document_processing_tasks' unique key; engine_kind joins
-- document_extractions'; request_reextraction's filed-bootstrap door, ledger #32
-- amendment) — POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database immediately
-- after applying 0026:
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f lane-widen-0026-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean run ends with
-- one notice per probe and nothing else.
--
-- WHAT 0026 CLAIMS, restated as probes:
--   1. 0026 is applied and 0025 is still in the history — a plain mandatory prior-migration
--      check (0026 is the LAST migration in its own ceremony; no combined-ceremony sibling
--      to accept as an earlier head, unlike 0024's file's treatment of 0025).
--   2. Both unique keys carry EXACTLY the widened 4-column shape and the OLD 3-column
--      constraint names are GONE — document_processing_tasks gains lane, document_extractions
--      gains engine_kind (the verified lane-equivalent).
--   3. finalize_document_intake's explicit ON CONFLICT target widens to include lane; its
--      fallback re-select filters on lane and RAISES impossible-state (CLR35) if the
--      colliding row cannot be found.
--   4. _enqueue_invoice_facts_core (0020 §6 pinned closed-set member, amendment A11): the
--      implicit `on conflict do nothing` needs no target edit, but its fallback is redesigned
--      — unconditional-on-status re-select, RAISE CLR35 on a genuinely missing row — and
--      0017's inactive-client guard plus 0025's four-kind gate/P4 lock survive the CoR intact.
--   5. persist_document_extraction's explicit ON CONFLICT target widens to include
--      engine_kind; fallback + CLR35 present; 0016 P3's classify-lane refusal survives.
--   6. persist_invoice_facts' extraction insert CARRIES an ON CONFLICT clause for the first
--      time (it had none before — a genuine collision used to crash the caller with a raw
--      23505), widened straight to the four-column key, same fallback + CLR35 discipline;
--      0023's net/tax non-negative guard survives.
--   7. request_reextraction: the exhausted-retry message no longer claims an unverifiable
--      "concurrent request" cause; the admission gate carries all THREE doors (reextraction /
--      receipt_backfill / filed_bootstrap), the filed-bootstrap door's predicate is the
--      MEASURED one — a live filing, zero tasks in THIS document's own facts lane, and zero
--      NON-TERMINAL tasks of any lane (not the naive "zero tasks of any lane", which would
--      refuse recovery vehicle 9e4ab36c itself) — and v_admission is threaded into both the
--      audit row and the returned receipt.
--   8. Neither function's EXECUTE surface moved.
--   9. The apply added DOORS, not data (the xmin idiom) — no existing document was touched,
--      enqueued, extracted, posted, or run.
--   10. THE P-ROUND (O-round findings, all coexisting-rows class): classify_document's
--      and set_document_kind's version mints are engine_kind-scoped (P1);
--      finalize_document_intake's duplicate-path re-select is engine+lane-pinned (P2);
--      persist_document_extraction refuses a misrouted facts-lane task instead of
--      silently conflict-reusing a structured_parse extraction (P3).
--
-- WHY THE PROBES MATCH COMMENT-STRIPPED TEXT. 0022 demonstrated the attack rather than
-- arguing it: delete a guard, paste its text back as a `--` comment, and every raw-prosrc
-- probe still passes. Everything syntactic below therefore runs against prosrc with BOTH
-- comment forms removed and whitespace normalised, the same discipline 0026's own
-- in-transaction tail already carries — this file re-proves it from OUTSIDE that
-- transaction, against the COMMITTED catalog. Every fused-text fragment below is reused
-- verbatim from 0026's own tail (already validated live) — a re-derivation from scratch
-- risks a transcription drift the migration's own tail would never catch.
--
-- AND THE HONEST FRAMING, carried from 0022/0023/0024/0025: these are BELT. The primary
-- instrument is BEHAVIOURAL — x-lane-widen-0026.test.mjs drives real cross-lane documents
-- through the intake + facts pipeline and the widened admission gate, proving the real
-- routing, the real second task/extraction, the real impossible-state raise, and all four
-- admission shapes (9e4ab36c's real terminal-structured_parse form, the bare zero-task
-- subset, an already-in-flight facts task, a live classify task in a different lane). These
-- probes exist so a DEPLOY onto a drifted catalog is caught, not to replace the cells.

-- ---------------------------------------------------------------------
-- 1. The migration is at 0026, and 0025 is still there. Strict-head by default; a caller
--    who KNOWS it is looking at a later database says so out loud with
--        set clara.postverify_allow_later = 'on';
--    (the 0021/0022/0023/0025 idiom).
-- ---------------------------------------------------------------------
do $$
declare v text; v_later boolean;
begin
  v_later := coalesce(current_setting('clara.postverify_allow_later', true), '') in ('on','true','1');
  select max(version) into v from clara.schema_migrations;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0026_lane_widen') then
    raise exception 'POST-VERIFY 1: 0026_lane_widen is NOT applied (head is %)', v;
  end if;
  if v <> '0026_lane_widen' and not v_later then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — 0026 is not the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0025_receipt_routing') then
    raise exception 'POST-VERIFY 1: 0025 is missing from the history — 0026''s widened kind gate and receipt backfill rest on 0025''s claims being present';
  end if;
  if v_later then
    raise notice 'OK 1  0026 applied, 0025 intact (head is % - later migrations ALLOWED by clara.postverify_allow_later)', v;
  else
    raise notice 'OK 1  at 0026_lane_widen, 0025 intact';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Both unique keys carry EXACTLY the widened shape — no more, no less — and the old
--    3-column constraint names are GONE (a partial widening that left both constraints
--    active would silently readmit the collision the wider one exists to permit).
-- ---------------------------------------------------------------------
do $$
begin
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='clara.document_processing_tasks'::regclass
         and conname='uq_document_processing_tasks_doc_engine_version_lane')
     is distinct from 'UNIQUE (document_id, engine_id, version_n, lane)' then
    raise exception 'POST-VERIFY 2: document_processing_tasks'' widened unique key is missing or has the wrong shape';
  end if;
  if exists (select 1 from pg_constraint
      where conrelid='clara.document_processing_tasks'::regclass
        and conname='document_processing_tasks_document_id_engine_id_version_n_key') then
    raise exception 'POST-VERIFY 2: document_processing_tasks'' OLD 3-column unique constraint is still present alongside the new one';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='clara.document_extractions'::regclass
         and conname='uq_document_extractions_doc_engine_version_kind')
     is distinct from 'UNIQUE (document_id, engine_id, version_n, engine_kind)' then
    raise exception 'POST-VERIFY 2: document_extractions'' widened unique key is missing or has the wrong shape';
  end if;
  if exists (select 1 from pg_constraint
      where conrelid='clara.document_extractions'::regclass
        and conname='document_extractions_document_id_engine_id_version_n_key') then
    raise exception 'POST-VERIFY 2: document_extractions'' OLD 3-column unique constraint is still present alongside the new one';
  end if;
  raise notice 'OK 2  both unique keys carry EXACTLY the widened 4-column shape; both OLD 3-column constraints GONE';
end $$;

-- ---------------------------------------------------------------------
-- 3. finalize_document_intake — the widened ON CONFLICT target and the lane-filtered,
--    raise-guarded fallback.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 3: finalize_document_intake is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('onconflict(document_id,engine_id,version_n,lane)donothingreturningidintov_task' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: finalize_document_intake''s ON CONFLICT target is not widened to include lane';
  end if;
  if position('wheredocument_id=v_docandengine_id=p_engine_idandversion_n=p_version_nandlane=p_lane' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: finalize_document_intake''s fallback re-select does not filter on lane';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0
     or position('usingerrcode=''CLR35''' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: finalize_document_intake is missing its impossible-state CLR35 RAISE';
  end if;
  raise notice 'OK 3  finalize_document_intake: ON CONFLICT target widened to (document_id,engine_id,version_n,lane); lane-filtered fallback; impossible-state CLR35 present';
end $$;

-- ---------------------------------------------------------------------
-- 4. _enqueue_invoice_facts_core (0020 §6 pinned closed-set member, amendment A11) — the
--    redesigned fallback (unconditional-on-status re-select, CLR35), 0017's inactive-client
--    guard, and 0025's four-kind gate + P4 lock all survive the CoR.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('wheredocument_id=p_documentandengine_id=v_engineandversion_n=v_versionandlane=v_lane' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core''s fallback re-select is not the unconditional-on-status redesign (amendment A11)';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0
     or position('usingerrcode=''CLR35''' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core is missing its impossible-state CLR35 RAISE (amendment A11)';
  end if;
  if position('skipped_client_onboarding' in v_code) = 0
     or position('oc.status=''active''' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core lost 0017''s inactive-client guard — the CoR was built from a stale base';
  end if;
  if position('d.document_kindin(''invoice'',''credit_note'',''debit_note'',''receipt'')' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core lost 0025''s four-kind gate';
  end if;
  if position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0 then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core lost 0025''s P4 document lock';
  end if;
  raise notice 'OK 4  _enqueue_invoice_facts_core: unconditional-on-status fallback + impossible-state CLR35 (amendment A11); 0017 inactive-client guard and 0025 four-kind gate/P4 lock intact';
end $$;

-- ---------------------------------------------------------------------
-- 5. persist_document_extraction — the widened ON CONFLICT target and the
--    engine_kind-filtered, raise-guarded fallback; 0016 P3's classify-lane refusal survives.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 5: persist_document_extraction is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('onconflict(document_id,engine_id,version_n,engine_kind)donothingreturningidintov_ext' in v_code) = 0 then
    raise exception 'POST-VERIFY 5: persist_document_extraction''s ON CONFLICT target is not widened to include engine_kind';
  end if;
  if position('wheredocument_id=t.document_idandengine_id=t.engine_idandversion_n=t.version_nandengine_kind=v_ekind' in v_code) = 0 then
    raise exception 'POST-VERIFY 5: persist_document_extraction''s fallback re-select does not filter on engine_kind';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0 then
    raise exception 'POST-VERIFY 5: persist_document_extraction is missing its impossible-state CLR35 RAISE';
  end if;
  if position('classifytasksaresettledbyclassify_document' in v_code) = 0 then
    raise exception 'POST-VERIFY 5: persist_document_extraction lost 0016 P3''s classify-lane refusal';
  end if;
  raise notice 'OK 5  persist_document_extraction: ON CONFLICT target widened to (document_id,engine_id,version_n,engine_kind); engine_kind-filtered fallback; impossible-state CLR35 present; 0016 P3 classify-lane refusal intact';
end $$;

-- ---------------------------------------------------------------------
-- 6. persist_invoice_facts — the extraction insert now CARRIES an ON CONFLICT clause (it
--    never did before: a genuine collision used to crash the caller with a raw 23505),
--    widened straight to the four-column key, same fallback + raise discipline; 0023's
--    net/tax non-negative guard survives.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 6: persist_invoice_facts is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('onconflict(document_id,engine_id,version_n,engine_kind)donothing' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: persist_invoice_facts'' extraction insert still carries NO ON CONFLICT clause — a genuine collision would crash the caller with a raw 23505';
  end if;
  if position('wheredocument_id=t.document_idandengine_id=t.engine_idandversion_n=t.version_nandengine_kind=''invoice_facts''' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: persist_invoice_facts'' fallback re-select is missing or malformed';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: persist_invoice_facts is missing its impossible-state CLR35 RAISE';
  end if;
  if position('astatedinvoicenet/taxmustnotbenegative' in v_code) = 0 then
    raise exception 'POST-VERIFY 6: persist_invoice_facts lost 0023''s net/tax non-negative guard';
  end if;
  raise notice 'OK 6  persist_invoice_facts: gained an ON CONFLICT clause for the first time, widened straight to (document_id,engine_id,version_n,engine_kind); fallback + impossible-state CLR35 present; 0023 net/tax guard intact';
end $$;

-- ---------------------------------------------------------------------
-- 7. request_reextraction — the exhausted-retry message correction, and the admission
--    gate's THREE doors with the MEASURED filed-bootstrap predicate: a live filing, zero
--    tasks in this document's own facts lane, and zero NON-TERMINAL tasks of any lane
--    (not the naive "zero tasks of any lane", which would refuse recovery vehicle
--    9e4ab36c itself — its one measured task is structured_parse | done). v_admission is
--    threaded into both the audit row and the returned receipt.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 7: request_reextraction is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('couldnotenqueueare-extractionafter3attempts' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction''s exhausted-retry message was not corrected';
  end if;
  if position('aconcurrentrequestsettledthisdocument' in lower(v_code)) > 0 then
    raise exception 'POST-VERIFY 7: request_reextraction still carries the old misleading exhausted-retry message';
  end if;
  if position('_human_ctx(clara.role_rank(''bookkeeper''))' in v_code) = 0
     or position('documentisnotinyourfirm' in lower(v_code)) = 0
     or position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0
     or position('forv_attemptin1..3loop' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction lost a retained guard or its bounded-retry shape';
  end if;
  if position('v_admission:=''reextraction''' in v_code) = 0
     or position('v_admission:=''receipt_backfill''' in v_code) = 0
     or position('v_admission:=''filed_bootstrap''' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction is missing one of the three admission doors';
  end if;
  if position('exists(select1fromclara.document_filingsfwheref.document_id=p_documentandf.retired_atisnull)' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction''s filed-bootstrap door does not check for a live filing';
  end if;
  if position('andnotexists(select1fromclara.document_processing_tasksptfwhereptf.document_id=p_documentandptf.lane=v_lane)' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction''s filed-bootstrap door does not check for ZERO tasks in this document''s own facts lane';
  end if;
  if position('andnotexists(select1fromclara.document_processing_tasksptnwhereptn.document_id=p_documentandptn.statusnotin(''done'',''failed''))' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction''s filed-bootstrap door does not check for ZERO NON-TERMINAL tasks of any lane — a naive "zero tasks of any lane" would refuse 9e4ab36c itself';
  end if;
  if position('''admission'',v_admission' in v_code) = 0 then
    raise exception 'POST-VERIFY 7: request_reextraction no longer threads v_admission into the audit row / receipt';
  end if;
  raise notice 'OK 7  request_reextraction: exhausted-retry message corrected; three-door admission (reextraction/receipt_backfill/filed_bootstrap) present with the MEASURED predicate (facts-lane-zero AND non-terminal-zero); v_admission threaded through; retained guards intact';
end $$;

-- ---------------------------------------------------------------------
-- 8. ACLs UNCHANGED on all five touched functions (CREATE OR REPLACE preserves
--    owner/grants, but a future edit could still widen one silently).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))) then
    raise exception 'POST-VERIFY 8: finalize_document_intake has an unexpected EXECUTE grantee';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')) then
    raise exception 'POST-VERIFY 8: _enqueue_invoice_facts_core gained a direct EXECUTE grant — it must stay reachable only through its callers';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))) then
    raise exception 'POST-VERIFY 8: persist_document_extraction has an unexpected EXECUTE grantee';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))) then
    raise exception 'POST-VERIFY 8: persist_invoice_facts has an unexpected EXECUTE grantee';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_authenticated'))) then
    raise exception 'POST-VERIFY 8: request_reextraction has an unexpected EXECUTE grantee — it must stay clara_authenticated-only';
  end if;
  raise notice 'OK 8  all five touched functions'' EXECUTE surfaces unchanged';
end $$;

-- ---------------------------------------------------------------------
-- 9. THE INERTNESS RECEIPT — 0026 added DOORS, not data (the 0021/0022/0023/0024/0025
--    xmin idiom). Widening the two keys and redesigning five function bodies must not
--    itself have touched any existing row — the migration's own §0/tail checksum already
--    proved clara.documents, document_processing_tasks and document_extractions were
--    untouched IN-TRANSACTION; this re-proves inertness from OUTSIDE that transaction,
--    against the committed catalog, and extends the check to journal_entries and
--    rule_post_runs.
-- ---------------------------------------------------------------------
do $$
declare v_xid text; v_n bigint;
begin
  select xmin::text into v_xid from clara.schema_migrations
   where version = '0026_lane_widen';
  if v_xid is null then
    raise exception 'POST-VERIFY 9: no schema_migrations row for 0026 (probe 1 should have caught this)';
  end if;
  select count(*) into v_n from clara.documents where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 9: the 0026 apply transaction touched % document row(s) — it must open a door, not walk through it', v_n;
  end if;
  select count(*) into v_n from clara.document_processing_tasks where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 9: the 0026 apply transaction touched % processing task(s)', v_n;
  end if;
  select count(*) into v_n from clara.document_extractions where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 9: the 0026 apply transaction touched % extraction(s)', v_n;
  end if;
  select count(*) into v_n from clara.journal_entries where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 9: the 0026 apply transaction touched % journal entr(ies)', v_n;
  end if;
  select count(*) into v_n from clara.rule_post_runs where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 9: the 0026 apply transaction produced % rule-post run(s)', v_n;
  end if;
  raise notice 'OK 9  the 0026 apply transaction (xid %) touched no document, task, extraction, journal entry, or rule-post run', v_xid;
end $$;

-- ---------------------------------------------------------------------
-- 10. THE P-ROUND (O-round findings on the first submitted diff, all the coexisting-
--     rows class): (a) classify_document's and set_document_kind's verdict version
--     mints are both scoped to engine_kind='doc_classify', not engine_id alone — a
--     coexisting different-kind extraction under the same engine_id can no longer
--     inflate a verdict's version past its own task's. (b) finalize_document_intake's
--     duplicate-adoption re-select is pinned to (engine_id,lane), not an unscoped
--     document-wide latest-task lookup that could grab a coexisting different-lane
--     task. (c) persist_document_extraction is restricted to ocr/structured_parse; a
--     misrouted facts-lane caller gets a loud typed refusal instead of silently
--     conflict-reusing a structured_parse extraction.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 10: classify_document is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('wheredocument_id=p_documentandengine_id=p_engine_idandengine_kind=''doc_classify''' in v_code) = 0 then
    raise exception 'POST-VERIFY 10: classify_document''s version mint is not scoped to engine_kind=''doc_classify'' (P1)';
  end if;

  select prosrc into v_src from pg_proc
   where oid = 'clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 10: set_document_kind is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('wheredocument_id=p_documentandengine_id=''clara-classify-human:v1''andengine_kind=''doc_classify''' in v_code) = 0 then
    raise exception 'POST-VERIFY 10: set_document_kind''s version mint is not scoped to engine_kind=''doc_classify'' (P1)';
  end if;
  if position('''prior_gl''' in v_code) = 0 then
    raise exception 'POST-VERIFY 10: set_document_kind lost 0017''s prior_gl vocabulary patch';
  end if;

  select prosrc into v_src from pg_proc
   where oid = 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 10: finalize_document_intake is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('selectidintov_taskfromclara.document_processing_taskswheredocument_id=v_docandengine_id=p_engine_idandlane=p_laneorderbyversion_ndesclimit1' in v_code) = 0 then
    raise exception 'POST-VERIFY 10: finalize_document_intake''s duplicate-path re-select is not pinned to engine_id+lane (P2)';
  end if;

  select prosrc into v_src from pg_proc
   where oid = 'clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 10: persist_document_extraction is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('ift.lanenotin(''ocr'',''structured_parse'')then' in v_code) = 0 then
    raise exception 'POST-VERIFY 10: persist_document_extraction is missing its ocr/structured_parse-only admission guard (P3)';
  end if;
  if position('onlysettlesocr/structured_parsetasks' in v_code) = 0 then
    raise exception 'POST-VERIFY 10: persist_document_extraction''s lane-admission refusal message is missing or reworded past recognition (P3)';
  end if;

  raise notice 'OK 10  the P-round: both classification writers'' version mints kind-scoped (P1); finalize_document_intake''s duplicate-path re-select engine+lane-pinned (P2); persist_document_extraction restricted to ocr/structured_parse (P3)';
end $$;
