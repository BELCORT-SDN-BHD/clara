-- =====================================================================
-- Migration 0025 (AUTO-ROUTE ALL RECEIPTS, task #27) — POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database immediately
-- after applying 0025 (which applies TOGETHER with 0024, in one ceremony):
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f receipt-routing-0025-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean run ends with
-- one notice per probe and nothing else.
--
-- WHAT 0025 CLAIMS, restated as probes:
--   1. 0025 is applied and 0024 is still in the history — MANDATORY, unlike 0024's file's
--      treatment of 0025 (see that file's probe 1): 0025 always applies AFTER 0024 in this
--      migration sequence, so there is no symmetric "combined-ceremony sibling as an
--      acceptable earlier head" case here — 0024 in history is simply the ordinary prior-
--      migration requirement every postverify file in this series carries.
--   2. _enqueue_invoice_facts_core admits 'receipt' to the invoice_facts kind gate (the old
--      three-kind gate is gone, not merely widened alongside), locks the document row BEFORE
--      reading its kind (P4), keeps 0017's inactive-client guard, and keeps the page-budget
--      reservation unconditional on lane (the owner's accepted cost boundary).
--   3. request_reextraction admits 'receipt' identically, locks the document row BEFORE
--      reading its kind (O2), and keeps its receipt-only backfill relaxation plus every
--      retained 0022 guard (bookkeeper floor, cross-firm refusal, bounded retry).
--   4. Neither function's EXECUTE surface moved — the core stays reachable ONLY through its
--      callers (never itself app-callable); request_reextraction stays clara_authenticated-
--      only.
--   5. The apply added a DOOR, not data (the xmin idiom) — no existing receipt was
--      auto-enqueued, no task/extraction/entry/rule-post-run was produced.
--
-- WHY THE PROBES MATCH COMMENT-STRIPPED TEXT. 0022 demonstrated the attack rather than
-- arguing it: delete a guard, paste its text back as a `--` comment, and every raw-prosrc
-- probe still passes. Everything syntactic below therefore runs against prosrc with BOTH
-- comment forms removed and whitespace normalised, the same discipline 0025's own
-- in-transaction tail already carries — this file re-proves it from OUTSIDE that
-- transaction, against the COMMITTED catalog.
--
-- AND THE HONEST FRAMING, carried from 0022/0023/0024: these are BELT. The primary
-- instrument is BEHAVIOURAL — x-receipt-routing.test.mjs drives real receipt documents
-- through both functions and proves the real routing, the real refusal shapes, the real
-- budget reservation row, and both TOCTOU lock-order schedules (holdThenContend, X7 law).
-- These probes exist so a DEPLOY onto a drifted catalog is caught, not to replace the cells.

-- ---------------------------------------------------------------------
-- 1. The migration is at 0025, and 0024 is still there. Strict-head by default; a caller who
--    KNOWS it is looking at a later database says so out loud with
--        set clara.postverify_allow_later = 'on';
--    (the 0021/0022/0023 idiom). Unlike 0024's own postverify file, 0025 never needs to treat
--    a SIBLING as an acceptable earlier head — 0025 is always the LAST migration in this
--    combined ceremony, so 0024-in-history is a plain mandatory prior-migration check, not a
--    special case.
-- ---------------------------------------------------------------------
do $$
declare v text; v_later boolean;
begin
  v_later := coalesce(current_setting('clara.postverify_allow_later', true), '') in ('on','true','1');
  select max(version) into v from clara.schema_migrations;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0025_receipt_routing') then
    raise exception 'POST-VERIFY 1: 0025_receipt_routing is NOT applied (head is %)', v;
  end if;
  if v <> '0025_receipt_routing' and not v_later then
    raise exception 'POST-VERIFY 1: max(schema_migrations.version) is % — 0025 is not the head', v;
  end if;
  if not exists(select 1 from clara.schema_migrations
                 where version = '0024_fail_classify') then
    raise exception 'POST-VERIFY 1: 0024 is missing from the history — 0025''s callers (classify_document, set_document_kind) rest on 0024''s claim-secret machinery being present';
  end if;
  if v_later then
    raise notice 'OK 1  0025 applied, 0024 intact (head is % - later migrations ALLOWED by clara.postverify_allow_later)', v;
  else
    raise notice 'OK 1  at 0025_receipt_routing, 0024 intact';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. _enqueue_invoice_facts_core: 'receipt' is admitted to the kind gate (the OLD three-kind
--    gate is gone, not merely present alongside a widened one), the document row is locked
--    BEFORE its kind is read (P4 TOCTOU fix), 0017's inactive-client guard survived the CoR,
--    and the page-budget reservation is unconditional on lane.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 2: _enqueue_invoice_facts_core is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('d.document_kindin(''invoice'',''credit_note'',''debit_note'',''receipt'')' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: _enqueue_invoice_facts_core''s kind gate does not admit receipt';
  end if;
  if position('d.document_kindin(''invoice'',''credit_note'',''debit_note'')' in v_code) > 0 then
    raise exception 'POST-VERIFY 2: _enqueue_invoice_facts_core still carries the OLD three-kind gate somewhere — a partial widening';
  end if;
  if position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: _enqueue_invoice_facts_core no longer locks the document row before reading its kind — the P4 TOCTOU fix is missing';
  end if;
  if position('skipped_client_onboarding' in v_code) = 0
     or position('oc.status=''active''' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: _enqueue_invoice_facts_core lost 0017''s inactive-client guard — the CoR was built from a stale base';
  end if;
  if position('ifv_lane=''invoice_facts''then' in v_code) = 0
     or position('performclara._reserve_processing_call(v_task,v_pages)' in v_code) = 0 then
    raise exception 'POST-VERIFY 2: _enqueue_invoice_facts_core''s page-budget reservation is missing or no longer unconditional on lane';
  end if;
  raise notice 'OK 2  _enqueue_invoice_facts_core: receipt admitted (old gate GONE), document lock before kind-read (P4), inactive-client guard intact, budget reservation unconditional on lane';
end $$;

-- ---------------------------------------------------------------------
-- 3. request_reextraction: 'receipt' is admitted identically, the document row is locked
--    BEFORE its kind is read (O2 TOCTOU fix), the receipt-only backfill relaxation is
--    present, and every retained 0022 guard (bookkeeper floor, cross-firm refusal, bounded
--    retry, page-budget reservation) survives.
-- ---------------------------------------------------------------------
do $$
declare v_src text; v_code text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'POST-VERIFY 3: request_reextraction is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  if position('coalesce(d.document_kind,'''')notin(''invoice'',''credit_note'',''debit_note'',''receipt'')' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: request_reextraction''s kind gate does not admit receipt';
  end if;
  if position('coalesce(d.document_kind,'''')notin(''invoice'',''credit_note'',''debit_note'')' in v_code) > 0 then
    raise exception 'POST-VERIFY 3: request_reextraction still carries the OLD three-kind gate somewhere — a partial widening';
  end if;
  if position('d.document_kind<>''receipt''andnotexists' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: request_reextraction''s receipt backfill relaxation is missing from the no-completed-extraction guard';
  end if;
  if position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: request_reextraction no longer locks the document row before reading its kind — the O2 TOCTOU fix is missing';
  end if;
  if position('performclara._reserve_processing_call(v_task,v_pages)' in v_code) = 0 then
    raise exception 'POST-VERIFY 3: request_reextraction''s page-budget reservation is missing';
  end if;
  if position('_human_ctx(clara.role_rank(''bookkeeper''))' in v_code) = 0
     or position('documentisnotinyourfirm' in lower(v_code)) = 0
     or position('aconcurrentrequestsettledthisdocument' in lower(v_code)) = 0 then
    raise exception 'POST-VERIFY 3: request_reextraction lost a retained 0022 guard';
  end if;
  raise notice 'OK 3  request_reextraction: receipt admitted (old gate GONE), document lock before kind-read (O2), backfill relaxation present, bookkeeper/cross-firm/bounded-retry guards intact';
end $$;

-- ---------------------------------------------------------------------
-- 4. ACL UNCHANGED on both (CREATE OR REPLACE preserves owner/grants, but a future edit
--    could still widen it silently). _enqueue_invoice_facts_core stays UNGRANTED beyond its
--    own owner (reached only through its callers, never itself app-callable);
--    request_reextraction stays clara_authenticated-only.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')) then
    raise exception 'POST-VERIFY 4: _enqueue_invoice_facts_core gained a direct EXECUTE grant — it must stay reachable only through its callers';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure
                and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_authenticated'))) then
    raise exception 'POST-VERIFY 4: request_reextraction has an unexpected EXECUTE grantee — it must stay clara_authenticated-only';
  end if;
  if not exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
                  where p.oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure
                    and a.privilege_type = 'EXECUTE'
                    and pg_get_userbyid(a.grantee) = 'clara_authenticated') then
    raise exception 'POST-VERIFY 4: clara_authenticated does NOT hold EXECUTE on request_reextraction — the human lane cannot call its own verb';
  end if;
  raise notice 'OK 4  _enqueue_invoice_facts_core ungranted beyond its owner; request_reextraction clara_authenticated-only';
end $$;

-- ---------------------------------------------------------------------
-- 5. THE INERTNESS RECEIPT — 0025 added a DOOR, not data (the 0021/0022/0023/0024 xmin
--    idiom). Widening the kind gate must not itself have auto-enqueued any of the existing
--    receipts it now admits — the migration's own §0/tail checksum already proved
--    clara.documents was untouched IN-TRANSACTION; this re-proves inertness on the
--    DOWNSTREAM tables from OUTSIDE that transaction, against the committed catalog.
-- ---------------------------------------------------------------------
do $$
declare v_xid text; v_n bigint;
begin
  select xmin::text into v_xid from clara.schema_migrations
   where version = '0025_receipt_routing';
  if v_xid is null then
    raise exception 'POST-VERIFY 5: no schema_migrations row for 0025 (probe 1 should have caught this)';
  end if;
  select count(*) into v_n from clara.documents where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 5: the 0025 apply transaction touched % document row(s) — it must open a door, not walk through it', v_n;
  end if;
  select count(*) into v_n from clara.document_processing_tasks where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 5: the 0025 apply transaction enqueued % task(s) — no existing receipt may have been auto-routed', v_n;
  end if;
  select count(*) into v_n from clara.document_extractions where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 5: the 0025 apply transaction touched % extraction(s)', v_n;
  end if;
  select count(*) into v_n from clara.journal_entries where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 5: the 0025 apply transaction touched % journal entr(ies)', v_n;
  end if;
  select count(*) into v_n from clara.rule_post_runs where xmin::text = v_xid;
  if v_n > 0 then
    raise exception 'POST-VERIFY 5: the 0025 apply transaction produced % rule-post run(s)', v_n;
  end if;
  raise notice 'OK 5  the 0025 apply transaction (xid %) touched no document, enqueued nothing, extracted nothing, posted nothing, ran nothing', v_xid;
end $$;
