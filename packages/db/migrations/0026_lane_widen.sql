-- 0026_lane_widen.sql — lane joins document_processing_tasks' and document_extractions'
-- unique keys. The XML facts lane is structurally unreachable without this.
--
-- Authority: ledger #32, Gate-S critical path (receipt:
-- C:\Users\zhant\.clara-tools\captures\gate-s-log-2026-07-28.md). Measured 3/3 real XML
-- documents refused BOTH doors; a PDF control (azure-di engine) got a real task.
--
-- THE DEFECT. 0007 keyed document_processing_tasks and document_extractions
-- unique(document_id, engine_id, version_n) — no lane, no engine_kind. 0015 gave the
-- SAME engine_id ('clara-myinvois:v1') TWO independent lanes on the SAME xml document:
-- structured_parse (the intake finalizer's identity task) and local_facts (the facts
-- lane's own task). version_n is computed PER-LANE at every call site (a deliberate,
-- correct design — each lane counts its own attempts from 1), so a document's FIRST
-- local_facts task and its FIRST structured_parse task both land on version_n=1, for
-- the SAME engine_id. Under the old 3-column key those two rows are IDENTICAL at the
-- unique index — not "the same lane retried", a DIFFERENT lane's own first attempt,
-- colliding with a task it has never heard of and could not possibly be a duplicate of.
--
-- _enqueue_invoice_facts_core's `on conflict do nothing` swallows that collision without
-- a trace: the insert no-ops, the fallback re-select filters to lane=v_lane (the LOCAL
-- lane) and to ACTIVE statuses — neither of which the colliding STRUCTURED_PARSE row
-- (a different lane, and typically already 'done') can ever match — so the function
-- returns {"task_id": null, "document_id": ..., "status": null}. No exception. No event.
-- No audit row naming what happened. The facts lane is not slow, not failing loudly, not
-- retried into eventual success: it never runs, and nothing says so.
--
-- THE SAME SHAPE ONE LAYER DOWN. document_extractions has no lane column at all — its
-- lane-equivalent is `engine_kind` (verified from the live catalog, not assumed: 0009
-- widened its CHECK to ('ocr','structured_parse','invoice_facts','doc_classify'), and
-- persist_invoice_facts ALREADY queries `... and engine_kind='invoice_facts'` as if
-- multiple engine_kinds could coexist per (document,engine,version_n) — they cannot,
-- today, because engine_kind is not in the key either). Once §A below lets a
-- structured_parse task and a local_facts task for the SAME document+engine legitimately
-- coexist at the same version_n, BOTH their extraction writes will target
-- (document,engine='clara-myinvois:v1',version_n=1) — persist_document_extraction writes
-- engine_kind='structured_parse' there, persist_invoice_facts writes
-- engine_kind='invoice_facts' there. Without §B below, fixing the task layer alone would
-- just move this bug one layer deeper AND make it louder in the worst way:
-- persist_invoice_facts' extraction insert carries NO on-conflict clause today, so a
-- collision there is not a silent null, it is a raw unhandled 23505 crashing the caller.
--
-- CoR DISCIPLINE (the read-the-live-body precedent from 0017/0024/0025's own headers).
-- Every body below was pulled via pg_get_functiondef against a REAL 25-migration
-- database (0001-0025 applied), not hand-copied from any migration file's static text.
-- Every later migration was grepped for each target function name before this migration
-- was written, to confirm the 25-migration catalog holds the LAST word on each body:
--   clara.finalize_document_intake  — last touched 0015 (grepped 0016-0025: untouched)
--   clara._enqueue_invoice_facts_core — last touched 0025 (0020 §6 pin, amendment A9)
--   clara.persist_document_extraction — last touched 0016 (grepped 0017-0025: untouched)
--   clara.persist_invoice_facts       — last touched 0023 (grepped 0024-0025: untouched)
--   clara.request_reextraction        — last touched 0025
-- Five call sites carry the old 3-column ON CONFLICT target or its implicit equivalent;
-- all five are touched below, together, so no ON CONFLICT anywhere in the tree can ever
-- name a key that does not exist:
--   finalize_document_intake            — explicit target, widened (§C)
--   _enqueue_invoice_facts_core         — implicit target (`on conflict do nothing`, no
--                                          column list — already matches ANY unique
--                                          violation, so it needs no target edit; its
--                                          FALLBACK logic still needed the full redesign
--                                          in §D, amendment A11 below)
--   request_reextraction                — same implicit-target shape as above; its
--                                          version computation was already correctly
--                                          PER-LANE (that was never the bug) — only its
--                                          exhausted-retry MESSAGE misdiagnosed the old
--                                          bug's cause (§G)
--   persist_document_extraction         — explicit target, widened (§E)
--   persist_invoice_facts               — HAD NO target at all (a plain INSERT); given
--                                          one for the first time (§F)
--
-- CONTRACT AMENDMENT A11 (docs/plan/wave-b-migration-0020-design.md §6/§6.1, owner
-- ruling 2026-07-28). _enqueue_invoice_facts_core is a member of migration 0020's §6
-- legacy byte-identity CLOSED SET — its exact prosrc SHA-256 is pinned in
-- packages/db/tests/wave-b/wb-0020-legacy.test.mjs and asserted unchanged since the
-- 19-migration prestate. A9 (0025) was the SECOND deliberate edit to that closed set;
-- this is the THIRD. Same discipline as A7/A9/A10: the pin is not retuned — `restore`
-- reverses A9's two edits AND this migration's one edit, in sequence, and the remainder
-- is compared against the ORIGINAL 19-migration prestate, so the cell proves every
-- ratified edit is present in its exact shape and that nothing else in the body moved.
--
-- ERROR CODE. CLR35 is a NEW code — the family runs CLR01..CLR34 (0017's four
-- provisional families landed as CLR31..CLR34); CLR99 is NOT reusable here, it is
-- reserved exclusively for migrations' own probe-rollback sentinel (0018/0019/0020's
-- `raise exception 'clara_NNNN_probe_rollback' using errcode='CLR99'` / `when sqlstate
-- 'CLR99' then null` pairs — a genuine application error must never share that code, or
-- a migration's own self-test could accidentally swallow it). CLR35 marks a single,
-- uniform meaning everywhere it appears in this migration: an ON CONFLICT fired but the
-- row it must have collided with cannot be found — the impossible state silence used to
-- hide.
--
-- ALSO FIXED, IN SCOPE (§G): request_reextraction's exhausted-bounded-retry message
-- ('a concurrent request settled this document — retry') named a cause — a concurrent
-- SAME-lane request — that was not, in the Gate-S corpus, what actually happened: the
-- lane-blind key meant an UNRELATED lane's row (the document's own intake task) could
-- occupy the version_n this loop kept recomputing, so three straight "losses" were three
-- straight collisions with a different lane entirely. §A structurally forecloses that
-- specific misdiagnosis (lane is now in the key, so a genuine loss really is another
-- writer on the SAME lane) — the message is corrected anyway, so it stops naming a cause
-- it cannot verify.
--
-- AMENDMENT TO THIS WORK ORDER (ratified 2026-07-28, from gate-s-driver's hold report,
-- recovery vehicle 9e4ab36c): request_reextraction's admission gate (§G) widens from two
-- doors to three. The predicate was rebuilt against 9e4ab36c's MEASURED live state
-- (`select lane,status,engine_id from document_processing_tasks where
-- document_id='9e4ab36c-...'` -> exactly one row: structured_parse | done |
-- clara-myinvois:v1) after two earlier drafts, each disproven — the first by a test
-- regression, the second by the live probe itself refusing the very document the door
-- exists for ("the report's claim... was asserted, not measured" — the house lesson:
-- probe the instrument's real target before declaring the shape). The final predicate:
-- a LIVE filing AND zero tasks in THIS document's own facts lane AND zero NON-TERMINAL
-- tasks of any lane. 9e4ab36c admits (its one task is structured_parse and it is DONE —
-- terminal, and it is not this document's facts lane); a document with a facts-lane
-- task already present (any status — the 0009-backstop shape) refuses; a document with
-- a LIVE task in some other lane (a NULL-kind pdf's pending classify verdict) refuses.
-- Every other wall stays exactly as-is (bookkeeper floor, cross-firm refusal, the
-- 3-attempt bound, the audit trail), and the diagnostic names WHICH of the three doors
-- admitted each call (v_admission), so a bootstrap admission is never confused with an
-- ordinary re-extraction or the receipt backfill. §G's own comment carries the full
-- verification against all four shapes this door must distinguish.
--
-- NOT IN SCOPE (owner-scoped, ledger #32): task #29, the file_document vs
-- confirm_attribution_candidate opposite-lock-order deadlock. It touches sibling
-- writers on document_filings, not this key, and is tracked separately. This migration
-- does not touch it.
--
-- WHAT THIS DOES NOT DO. No re-drive of any existing failed/silent task or extraction —
-- a data migration inside a DDL migration violates the doors-not-data precedent this
-- repo holds throughout; this migration widens the two keys and closes the four insert
-- sites that assumed the old shape, nothing else. Every XML document already stuck
-- behind the old collision gets its facts lane opened the next time an ordinary caller
-- (the intake finalizer, the runtime re-drive, or a human's request_reextraction) reaches
-- it — never automatically, inside this file. The tail below asserts xmin inertness on
-- clara.documents, clara.document_processing_tasks and clara.document_extractions: no
-- row this migration did not itself decide to touch (none) shows this transaction's xid.

-- =====================================================================
-- §0 — DOORS-NOT-DATA CHECKPOINT. A content checksum of clara.documents,
-- clara.document_processing_tasks and clara.document_extractions, taken BEFORE any DDL
-- below and compared in the tail. Same mechanism as 0025's §0 (a row-count + per-row
-- hashtext sum — deterministic regardless of session history, unlike
-- pg_stat_xact_user_tables, which 0025's own header records as unreliable under
-- migrate.mjs's full sequential apply). Session-transaction-local, never leaks past
-- this migration.
do $mig0026_checkpoint$
declare v_n bigint; v_h bigint; v_tn bigint; v_th bigint; v_en bigint; v_eh bigint;
begin
  select count(*), coalesce(sum(hashtext(d::text)::bigint),0) into v_n, v_h from clara.documents d;
  perform set_config('clara.mig0026_doc_n', v_n::text, true);
  perform set_config('clara.mig0026_doc_h', v_h::text, true);
  select count(*), coalesce(sum(hashtext(t::text)::bigint),0) into v_tn, v_th from clara.document_processing_tasks t;
  perform set_config('clara.mig0026_task_n', v_tn::text, true);
  perform set_config('clara.mig0026_task_h', v_th::text, true);
  select count(*), coalesce(sum(hashtext(e::text)::bigint),0) into v_en, v_eh from clara.document_extractions e;
  perform set_config('clara.mig0026_ext_n', v_en::text, true);
  perform set_config('clara.mig0026_ext_h', v_eh::text, true);
end
$mig0026_checkpoint$;

-- =====================================================================
-- §A — document_processing_tasks: lane joins the unique key.
--
-- Two lanes of one engine on one document are two LEGITIMATE rows, never a duplicate of
-- each other — version_n stays per-lane (unchanged, and was never the defect).
-- =====================================================================
alter table clara.document_processing_tasks
  drop constraint document_processing_tasks_document_id_engine_id_version_n_key,
  add constraint uq_document_processing_tasks_doc_engine_version_lane
    unique (document_id, engine_id, version_n, lane);

-- =====================================================================
-- §B — document_extractions: engine_kind (the verified lane-equivalent) joins the
-- unique key.
-- =====================================================================
alter table clara.document_extractions
  drop constraint document_extractions_document_id_engine_id_version_n_key,
  add constraint uq_document_extractions_doc_engine_version_kind
    unique (document_id, engine_id, version_n, engine_kind);

-- =====================================================================
-- §C — clara.finalize_document_intake CoR: the intake task insert's ON CONFLICT target
-- widens to (document_id,engine_id,version_n,lane); its fallback re-select gains the
-- lane filter it was structurally missing, and RAISES if the colliding row cannot be
-- found (impossible-state-loud — CLR35).
-- =====================================================================
create or replace function clara.finalize_document_intake(p_intake uuid, p_token_hash text default null,
    p_engine_id text default 'clara-fixture:v1', p_engine_config jsonb default '{}'::jsonb,
    p_version_n int default 1, p_lane text default 'ocr',
    p_client uuid default null, p_resolution uuid default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  i record; d record; v_dedupe jsonb; v_doc uuid; v_task uuid; v_filing uuid;
  v_created boolean:=false; v_upgraded boolean:=false; v_filed boolean:=false; v_basis text;
  v_expired jsonb;
begin
  select * into i from clara.document_intakes where id=p_intake for update;
  if not found then
    raise exception 'intake finalize capability/state is invalid' using errcode='CLR16';
  end if;
  if i.expires_at<=now() or (p_token_hash is not null and i.token_hash<>p_token_hash) then
    raise exception 'intake finalize capability/state is invalid' using errcode='CLR16';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(i.firm_id,'finalize_document_intake',p_op_key,
    clara._hash(jsonb_build_object('i',p_intake)));
  if v_dedupe is not null then return v_dedupe; end if;
  if i.status not in ('verified','duplicate') then
    raise exception 'intake finalize capability/state is invalid' using errcode='CLR16';
  end if;
  v_expired:=clara._expire_inactive_document_intake(p_intake);
  if v_expired is not null then
    return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,v_expired);
  end if;

  select * into d from clara.documents where firm_id=i.firm_id and sha256=i.sha256 for update;
  if i.status='verified' and not found then
    insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,
        storage_path,bytes_verified_at,extraction_status,uploaded_by)
      values(i.firm_id,i.sha256,i.original_filename,i.declared_mime,i.declared_bytes,
        i.storage_key,now(),'pending',i.uploaded_by) returning id into v_doc;
    v_created:=true;
  else
    if not found then raise exception 'duplicate intake has no canonical document' using errcode='CLR16'; end if;
    v_doc:=d.id;
    if d.bytes_verified_at is null then
      perform clara._upgrade_legacy_document(v_doc,i.storage_key,now());
      v_upgraded:=true;
    end if;
  end if;

  if v_created or v_upgraded then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status)
      values(i.firm_id,v_doc,p_engine_id,coalesce(p_engine_config,'{}'::jsonb),p_version_n,p_lane,'queued')
      on conflict (document_id,engine_id,version_n,lane) do nothing returning id into v_task;
    if v_task is null then
      -- 0026: lane joins the key (document_processing_tasks' unique key widened to
      -- (document_id,engine_id,version_n,lane)) — a conflict here is now a genuine same-lane
      -- duplicate, never a cross-lane collision. The exact colliding row must exist; silence
      -- here would hide the same shape of bug this migration closes, one call earlier than
      -- the others.
      select id into v_task from clara.document_processing_tasks
        where document_id=v_doc and engine_id=p_engine_id and version_n=p_version_n and lane=p_lane;
      if v_task is null then
        raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',
          v_doc,p_engine_id,p_version_n,p_lane using errcode='CLR35';
      end if;
    end if;
    update clara.document_ingest_reservations set task_id=v_task where intake_id=p_intake;
  else
    perform clara._refund_document_reservation(i.firm_id,p_intake,'duplicate-adopted');
    select id into v_task from clara.document_processing_tasks
      where document_id=v_doc order by version_n desc limit 1;
  end if;

  if p_client is not null then
    perform clara.assert_client_resolved(p_client,p_resolution,v_doc);
    select id into v_filing from clara.document_filings
      where document_id=v_doc and client_id=p_client and retired_at is null for share;
    if v_filing is null then
      select method into v_basis from clara.client_resolutions where id=p_resolution;
      insert into clara.document_filings(firm_id,document_id,client_id,filed_by,resolution_id,basis)
        values(i.firm_id,v_doc,p_client,i.uploaded_by,p_resolution,
          case when v_basis='rule' then 'rule' else 'human' end) returning id into v_filing;
      v_filed:=true;
      perform clara._recompute_document_retention(v_doc);
    end if;
  elsif p_resolution is not null then
    raise exception 'resolution requires an explicit client' using errcode='CLR10';
  end if;

  if not v_created and i.status='verified' then
    perform set_config('clara.intake_adopt_race',p_intake::text,true);
  end if;
  update clara.document_intakes set status=case when v_created then 'finalized' else 'adopted' end,
    document_id=v_doc where id=p_intake;
  if not v_created and i.status='verified' then
    perform set_config('clara.intake_adopt_race','',true);
  end if;
  perform clara._audit(i.firm_id,i.uploaded_by,null,null,'finalize_document_intake',null,
    jsonb_build_object('intake',p_intake,'document',v_doc,'task',v_task,'filing',v_filing,
      'created',v_created,'upgraded',v_upgraded,'op_key',p_op_key));
  if v_created then
    perform clara._append_event(i.firm_id,'document.ingested',null,i.uploaded_by,null,null,
      null,v_doc,null,'{}'::jsonb);
  end if;
  if v_filed then
    perform clara._append_event(i.firm_id,'document.filed',p_client,i.uploaded_by,null,null,
      null,v_doc,p_resolution,jsonb_build_object('filing_id',v_filing));
  end if;
  return clara._finish_op(i.firm_id,'finalize_document_intake',p_op_key,
    jsonb_build_object('intake_id',p_intake,'document_id',v_doc,'task_id',v_task,
      'filing_id',v_filing,'status',case when v_created then 'finalized' else 'adopted' end,
      'upgraded',v_upgraded));
end $$;
alter function clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text) owner to clara_fn_owner;

-- =====================================================================
-- §D — clara._enqueue_invoice_facts_core CoR (AMENDMENT A11, 0020 §6 pinned closed-set
-- member). The insert's implicit `on conflict do nothing` already matches the widened
-- key with no target edit needed; the FALLBACK is redesigned: it now re-selects the
-- exact (document,engine,version,lane) row regardless of status (a genuine same-lane
-- conflict may already be terminal by the time we look again) and RAISES
-- impossible-state (CLR35) if that row cannot be found, instead of silently returning
-- {"task_id": null, "status": null} the way it always used to.
-- =====================================================================
create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text; v_task_status text;
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
  if lower(coalesce(d.mime_type,''))='application/pdf'
     or lower(coalesce(d.mime_type,'')) like 'image/%' then
    if d.document_kind is null then
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';
    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then
      v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';
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
    v_lane:='local_facts'; v_engine:='clara-myinvois:v1';
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
    select e.id into v_task from clara.document_extractions e
      where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
      order by e.version_n desc limit 1;
    if v_task is not null then
      return jsonb_build_object('document_id',p_document,'status','already_completed',
        'extraction_id',v_task);
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
  -- Only the Azure lane consumes the page budget; classify + the local parse
  -- reserve nothing.
  if v_lane='invoice_facts' then
    v_pages := greatest(coalesce(d.page_count,1),1);
    begin
      perform clara._reserve_processing_call(v_task,v_pages);
    exception when sqlstate 'CLR18' then
      update clara.document_processing_tasks set status='failed',error_code='budget',
        finished_at=now() where id=v_task;
      return jsonb_build_object('task_id',v_task,'document_id',p_document,
        'status','failed','reason','budget');
    end;
  end if;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;
alter function clara._enqueue_invoice_facts_core(uuid) owner to clara_fn_owner;

-- =====================================================================
-- §E — clara.persist_document_extraction CoR: the extraction insert's ON CONFLICT
-- target widens to (document_id,engine_id,version_n,engine_kind); its fallback
-- re-select gains the engine_kind filter it was structurally missing, and RAISES
-- impossible-state (CLR35) if the colliding row cannot be found.
-- =====================================================================
create or replace function clara.persist_document_extraction(p_task uuid, p_status text, p_page_count int,
    p_envelope jsonb, p_regions jsonb, p_error_code text, p_vendor_op_ref text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;
  v_opening_fact jsonb; v_opening_account text; v_opening_side text;
  v_opening_amount bigint; v_region_money bigint; v_derived record;
  v_derived_found boolean;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'persist_document_extraction',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'status',p_status,'pages',p_page_count,
      'envelope',p_envelope,'regions',p_regions,'error',p_error_code,'vendor',p_vendor_op_ref)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_status not in ('done','failed') then raise exception 'extraction status must be done/failed' using errcode='CLR10'; end if;
  if t.lane='none' then raise exception 'store-only tasks do not create extractions' using errcode='CLR16'; end if;
  -- 0016 P3: classify verdicts are settled ONLY by classify_document (the
  -- audited writer) — never through the generic persist path (which would
  -- stamp an attribution-visible engine_kind).
  if t.lane='classify' then
    raise exception 'classify tasks are settled by classify_document' using errcode='CLR16';
  end if;
  v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,v_ekind,
      t.version_n,p_status,p_page_count,coalesce(p_envelope,'{}'::jsonb))
    on conflict(document_id,engine_id,version_n,engine_kind) do nothing returning id into v_ext;
  if v_ext is null then
    -- 0026: engine_kind joins the key (document_extractions' unique key widened to
    -- (document_id,engine_id,version_n,engine_kind)) — a conflict here is now a genuine
    -- same-kind duplicate, never a cross-lane/cross-kind collision. The exact colliding row
    -- must exist.
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind=v_ekind;
    if v_ext is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,kind=%) but no row exists at that key',
        t.document_id,t.engine_id,t.version_n,v_ekind using errcode='CLR35';
    end if;
  elsif p_status='done' then
    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      if v_ekind='structured_parse'
         and (lower(coalesce(elem->>'field_path','')) like '%tin%'
           or lower(coalesce(elem->>'field_path','')) like '%ssm%'
           or lower(coalesce(elem->>'field_path','')) like '%brn%'
           or lower(coalesce(elem->>'field_path','')) like '%account%')
         and lower(coalesce(elem->>'field_path','')) not in
             ('myinvois.supplier_tin','myinvois.supplier_brn') then
        raise exception 'structured_parse attribution field_path % is not on the allowlist',
          elem->>'field_path'
          using errcode='CLR10',detail='{"reason":"attribution_field_not_allowed"}';
      end if;
      -- [R3-F1] Derive the fact from the stored evidence first.
      v_opening_fact:=null; v_opening_account:=null; v_opening_side:=null;
      v_opening_amount:=null; v_region_money:=null;
      begin
        v_region_money:=nullif(elem->>'monetary_cents','')::bigint;
      exception when others then
        raise exception 'opening extraction monetary evidence is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_evidence_malformed"}';
      end;
      select * into v_derived from clara._derive_opening_region_fact(
        elem->>'field_path',elem->>'text_content',v_region_money);
      v_derived_found:=found;
      if elem ? 'opening_fact' then
        v_opening_fact:=elem->'opening_fact';
        if jsonb_typeof(v_opening_fact)<>'object' then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        begin
          v_opening_account:=nullif(btrim(v_opening_fact->>'account_code'),'');
          v_opening_side:=nullif(v_opening_fact->>'side','');
          v_opening_amount:=nullif(v_opening_fact->>'amount_cents','')::bigint;
        exception when others then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end;
        if v_opening_account is null
           or v_opening_side not in ('debit','credit')
           or v_opening_amount is null or v_opening_amount<=0 then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        if not v_derived_found then
          raise exception 'opening extraction fact has no independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_unverifiable"}';
        end if;
        if v_opening_account is distinct from v_derived.account_code
           or v_opening_amount is distinct from v_derived.amount_cents
           or v_opening_side is distinct from v_derived.side then
          raise exception 'opening extraction fact contradicts independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_mismatch"}';
        end if;
      end if;
      if v_derived_found then
        v_opening_account:=v_derived.account_code;
        v_opening_amount:=v_derived.amount_cents;
        v_opening_side:=v_derived.side;
      else
        v_opening_account:=null; v_opening_amount:=null; v_opening_side:=null;
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents,
          opening_account_code,opening_amount_cents,opening_side)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',
          coalesce(v_region_money,v_opening_amount),
          v_opening_account,v_opening_amount,v_opening_side);
    end loop;
  end if;
  update clara.document_processing_tasks set status=p_status,error_code=case when p_status='failed' then p_error_code end,
    vendor_op_ref=p_vendor_op_ref,finished_at=now() where id=p_task;
  update clara.documents set extraction_status=p_status,page_count=p_page_count where id=t.document_id;
  if p_status='done' then perform clara._settle_document_reservation(t.firm_id,p_task,coalesce(p_page_count,0));
  else perform clara._refund_document_reservation(t.firm_id,
    (select intake_id from clara.document_ingest_reservations where task_id=p_task),coalesce(p_error_code,'engine_error')); end if;
  perform clara._audit(t.firm_id,null,null,null,'persist_document_extraction',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,'status',p_status,'op_key',p_op_key));
  v_event:=case when p_status='done' then 'document.extraction_completed' else 'document.extraction_failed' end;
  perform clara._append_event(t.firm_id,v_event,null,null,null,null,null,t.document_id,null,
    jsonb_build_object('extraction_id',v_ext,'engine_id',t.engine_id,'version_n',t.version_n));
  return clara._finish_op(t.firm_id,'persist_document_extraction',p_op_key,
    jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status',p_status));
end $$;
alter function clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text) owner to clara_fn_owner;

-- =====================================================================
-- §F — clara.persist_invoice_facts CoR: the extraction insert GAINS an ON CONFLICT
-- clause for the first time — it previously had none, so a genuine collision here
-- crashed the caller with a raw unhandled 23505. Now widened to
-- (document_id,engine_id,version_n,engine_kind), it degrades gracefully into the same
-- replayed-done shape this function already returns above when t.status is found
-- 'done', and RAISES impossible-state (CLR35) only if the colliding row genuinely
-- cannot be found.
-- =====================================================================
create or replace function clara.persist_invoice_facts(p_task uuid, p_fields jsonb,
    p_raw_sha256 text, p_normalization_version text, p_pages_used int,
    p_envelope jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_ext uuid; v_existing uuid; v_entry uuid; v_date date;
  elem jsonb; v_path text; v_raw text; v_page int; v_conf numeric;
  v_cents bigint; v_region uuid; v_token uuid;
  v_newstate jsonb; v_p_payable bigint; v_p_expense bigint;
  v_eflags jsonb; v_ekind text;
begin
  select * into t from clara.document_processing_tasks where id=p_task;
  if not found or t.lane not in ('invoice_facts','local_facts') then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if jsonb_typeof(p_fields)<>'array' or p_raw_sha256 !~ '^[0-9a-f]{64}$'
     or p_normalization_version is null or btrim(p_normalization_version)=''
     or p_pages_used is null or p_pages_used<0 then
    raise exception 'invoice-facts payload is malformed' using errcode='CLR10';
  end if;

  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null
    order by f.id for update;
  perform 1 from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id for update of e;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'invoice-facts task is not running' using errcode='CLR16';
  end if;

  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,
      'invoice_facts',t.version_n,'done',p_pages_used,
      coalesce(p_envelope,'{}'::jsonb) || jsonb_build_object('raw_sha256',p_raw_sha256,
        'normalization_version',p_normalization_version,
        'field_count',jsonb_array_length(p_fields)))
    on conflict (document_id,engine_id,version_n,engine_kind) do nothing
    returning id into v_ext;
  if v_ext is null then
    -- 0026: engine_kind joins the document_extractions key. This insert previously carried
    -- NO on-conflict clause at all and would crash the caller on a genuine collision (a raw
    -- 23505, unhandled) — the same root cause as the task-layer silence above, one layer
    -- down, in its loudest possible bad shape. The exact colliding row must exist; treat it
    -- as an idempotent replay of an already-settled write, matching the replay shape this
    -- function already returns above when t.status is found 'done'.
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind='invoice_facts';
    if v_ext is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,kind=invoice_facts) but no row exists at that key',
        t.document_id,t.engine_id,t.version_n using errcode='CLR35';
    end if;
    return jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status','done','replayed',true);
  end if;

  for elem in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(elem)<>'object' or nullif(elem->>'field_path','') is null
       or not (elem ? 'page') or not (elem ? 'polygon') then
      raise exception 'invoice-facts field is malformed' using errcode='CLR10';
    end if;
    v_path:=elem->>'field_path';
    -- 0022 (X3): the three stated-component paths join the CLOSED allowlist. The taxonomy
    -- is closed on purpose (ADR-047): a component read off the face of the document is a
    -- first-class fact, and anything NOT in the enumeration is not silently absorbed.
    if v_path not in ('invoice.total','invoice.amount_due','invoice.currency',
        'invoice.vendor_name','invoice.vendor_registration','invoice.invoice_id',
        'invoice.invoice_date','invoice.deposit',
        'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
        'invoice.type_code','invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.service_charge','invoice.discount','invoice.delivery',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid') then
      raise exception 'unsupported invoice field_path %',v_path using errcode='CLR10';
    end if;
    begin
      v_page:=(elem->>'page')::int;
      v_conf:=(elem->>'confidence')::numeric;
    exception when others then
      raise exception 'invoice-facts page/confidence is malformed' using errcode='CLR10';
    end;
    if v_page<1 or v_conf<0 or v_conf>1
       or jsonb_typeof(elem->'polygon') not in ('array','object') then
      raise exception 'invoice-facts locator/confidence is invalid' using errcode='CLR10';
    end if;
    v_raw:=elem->>'value_raw';
    v_cents:=case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
                  'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
                  'invoice.service_charge','invoice.discount','invoice.delivery')
                  then clara._normalize_invoice_cents(v_raw) else null end;
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
      values(t.firm_id,v_ext,'page_polygon',
        jsonb_build_object('page',v_page,'polygon',elem->'polygon'),
        v_path,v_raw,v_conf,
        case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
             'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
             'invoice.service_charge','invoice.discount','invoice.delivery')
             then v_raw end,v_cents)
      returning id into v_region;
    if v_path='invoice.invoice_date' and v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin v_date:=v_raw::date; exception when others then v_date:=null; end;
    end if;
  end loop;

  -- FIX-2/3/4 + FIX-3/4/5 v4 (the DB owns the number — REJECT bad facts at the WRITE BOUNDARY
  -- rather than min()-selecting one at read time, where SQL NULL semantics silently drop a
  -- blank). All checks are inert for the Azure/OCR corpus (one region per field, no rounding
  -- fact, no conflicts) and for the MyInvois parser (mapFactsFields emits each path at most
  -- once + always a type_code), so the AP exact-diff and the live local_facts producer are
  -- unaffected.
  --   (a) CONFLICTING duplicates, UNIFORM over EVERY per-field fact: a field appearing more
  --     than once with ANY differing value — INCLUDING a blank/NULL vs a real value — is a
  --     contradiction the DB refuses; IDENTICAL duplicates collapse. The v3 checks used
  --     count(distinct <value>), which IGNORES a NULL/blank (SQL semantics) — so a crafted
  --     ['', real] pair slipped past and min() then selected the blank -> NULL, re-opening
  --     polarity (type_code) / direction (customer_taxid) / duplicate-bill (invoice_id/date).
  --     Coalescing to a control-char SENTINEL (chr(1), never a real cents/text value) makes
  --     the blank a DISTINCT value, so ['', '02'] / ['', clientTIN] / ['', 'N/A'] all conflict.
  --     Monetary fields compare on normalized cents; text fields on the trimmed value. The
  --     text set now also covers invoice_id / invoice_date / tax_breakdown / myinvois_* (a
  --     conflicting id/date/breakdown was otherwise min-selected past the guard).
  --     0022 (X3): the three stated components join the MONETARY set — two disagreeing
  --     service charges must forfeit the extraction, exactly as two disagreeing totals do.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.total','invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.service_charge','invoice.discount','invoice.delivery')
    group by r.field_path
    having count(distinct coalesce(r.monetary_cents::text, chr(1))) > 1
  ) or exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.type_code','invoice.currency','invoice.vendor_name',
        'invoice.vendor_registration','invoice.customer_name','invoice.customer_registration',
        'invoice.customer_taxid','invoice.invoice_id','invoice.invoice_date',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid')
    group by r.field_path
    having count(distinct coalesce(nullif(btrim(r.text_content),''), chr(1))) > 1
  ) then
    raise exception 'invoice-facts payload carries conflicting duplicate facts for a single field'
      using errcode='CLR10';
  end if;
  --   (b) a PRESENT-but-malformed monetary value (raw text stated, cents normalize to NULL)
  --     is REFUSED for every REQUIRED monetary field — never silently treated as zero or
  --     "not stated" (item 5). Covers amount_due / deposit ('N/A' -> NULL was accepted as
  --     "no due" and defaulted deposit to 0, re-opening the total/deposit corroboration
  --     guards) and total_excl_tax / tax_total / rounding (a stated-but-unparseable component
  --     is a data error). NB: invoice.total is DELIBERATELY EXCLUDED — an unreadable OCR total
  --     still persists (non-corroborated: v_total NULL => corroborated=false, fail-closed),
  --     exactly as before; a blank (empty) raw is "not stated" and is unaffected (nullif
  --     drops it, so an omitted/empty field never trips this).
  --     0022 (X3): the three stated components join this set for the same reason the other
  --     components are in it — a component the reader can SEE but cannot PARSE must never
  --     reach the tie as a zero, because a zero would make a wrong identity balance.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.service_charge','invoice.discount','invoice.delivery')
      and nullif(btrim(r.monetary_raw),'') is not null and r.monetary_cents is null
  ) then
    raise exception 'invoice-facts monetary value is malformed' using errcode='CLR10';
  end if;
  --   (b2) 0022 (X3, adversarial round 1 — FATAL): the three STATED COMPONENTS must be
  --     NON-NEGATIVE. ADR-047's "every component is stored positive as printed" was written
  --     as an EMITTER convention, and an emitter convention is not a control.
  --     `_normalize_invoice_cents` (0009:110-121) accepts BOTH `-5.00` and the accounting
  --     parenthesis form `(5.00)`, so a negative discount is persistable — and the identity
  --     SUBTRACTS the discount, which turns that minus into a plus:
  --         net 100.00 + tax 6.00 - (-5.00) = 111.00  ties against a stated gross of 111.00
  --     while the document's own face reads 100.00 + 6.00 - 5.00 = 101.00. The tie passes,
  --     tie 3 accepts revenue = gross - tax, and Clara posts RM111.00 for a RM101.00
  --     document. Every figure is "read off the document" and the answer is still wrong, so
  --     the sign convention is enforced HERE, at the write boundary, in cents.
  --     DELIBERATELY NARROW: only the three NEW component paths. `invoice.rounding` may
  --     legitimately be negative (a downward rounding adjustment) and net/tax/total are the
  --     pre-existing 0016 surface, out of X1's scope — widening either would be a change
  --     this slice was not grilled for.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.service_charge','invoice.discount','invoice.delivery')
      and r.monetary_cents < 0
  ) then
    raise exception 'a stated invoice component must not be negative (components are stated positive; the discount subtracts in the identity)'
      using errcode='CLR10';
  end if;
  --   (b3) 0023 (X5, K-round): NET AND TAX ARE NON-NEGATIVE TOO, and this is where the
  --     guard finally belongs. 0022 scoped (b2) to the three components on purpose — net and
  --     tax were not authority-bearing then, and widening a write boundary is not something
  --     to do speculatively. X5 makes them authority-bearing: they anchor the corroboration
  --     identity, so a negative one is now a posting hazard rather than an oddity.
  --
  --     WHY THE RUNTIME'S OWN SIGN HANDLING DOES NOT COVER THIS. The deterministic reader
  --     refuses a negative component, but Azure's TYPED SubTotal/TotalTax take a different
  --     route into the mapper and never meet that code. Executed: typed subtotal -100 with
  --     typed tax 200 against a total of 100 was accepted by this writer, and the identity
  --     `-100 + 200 = 100` then corroborated. A negative subtotal is not a document anyone
  --     can read; refuse it at the boundary, where every producer must pass.
  --
  --     `invoice.rounding` is DELIBERATELY EXCLUDED, exactly as in (b2): a rounding
  --     adjustment may legitimately be negative. Its own hazard — magnitude, not sign — is
  --     bounded in the corroboration predicate and in the reader.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.total_excl_tax','invoice.tax_total')
      and r.monetary_cents < 0
  ) then
    raise exception 'a stated invoice net/tax must not be negative (they anchor the corroboration identity; a negative one forges a tie)'
      using errcode='CLR10';
  end if;
  --   (2c) a local-facts (MyInvois structured) payload MUST state a type_code — a structured
  --     e-invoice with no document type cannot be polarity-bound. OCR/Azure (invoice_facts)
  --     carry no type_code and are unaffected.
  if t.lane='local_facts'
     and not exists(select 1 from clara.document_regions
       where extraction_id=v_ext and field_path='invoice.type_code'
         and nullif(btrim(text_content),'') is not null) then
    raise exception 'a local-facts payload must state invoice.type_code' using errcode='CLR10';
  end if;

  -- Only the Azure lane carries a processing-call reservation; the local parse is free.
  if t.lane='invoice_facts' then
    perform clara._settle_processing_call(p_task,p_pages_used);
  end if;
  update clara.document_processing_tasks set status='done',vendor_op_ref=p_raw_sha256,
    finished_at=now() where id=p_task;
  select * into d from clara.documents where id=t.document_id;
  -- 0016 (P3/WA21-R7): the kind stamp is ONLY-IF-NULL — the facts writer's
  -- lane default never overwrites a classifier verdict or a human attestation.
  update clara.documents set
    document_kind=coalesce(document_kind,
      case when t.lane='local_facts' then 'e_invoice_xml' else 'invoice' end),
    financial_date=coalesce(v_date,financial_date) where id=t.document_id;

  v_newstate:=clara._invoice_fact_state(t.document_id);
  for v_entry in
    select e.id from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id
  loop
    select coding_kind,coalesce(flags,'{}'::jsonb) into v_ekind,v_eflags
      from clara.journal_entries where id=v_entry;
    v_eflags:=v_eflags - 'amount_exception' - 'amount_override';
    if v_ekind='supplier_bill'
       and coalesce((v_newstate->>'corroborated')::boolean,false) then
      select coalesce(sum(l.credit_cents),0) into v_p_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_p_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_p_payable<>(v_newstate->>'total_cents')::bigint
         or v_p_expense<>(v_newstate->>'total_cents')::bigint then
        v_eflags:=v_eflags||jsonb_build_object('amount_exception',jsonb_build_object(
          'machine_total_cents',(v_newstate->>'total_cents')::bigint,
          'proposed_cents',v_p_payable,
          'fact_hash',v_newstate->>'total_fact_hash','at',now()));
      end if;
    end if;
    update clara.journal_entries set revision_token=gen_random_uuid(),
      flags=v_eflags,updated_at=now()
      where id=v_entry and status='draft' returning revision_token into v_token;

    insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
        revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
      select j.firm_id,j.client_id,j.id,
        coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
          where r.entry_id=j.id),0),v_token,'facts',null,'facts_rotated',
        to_jsonb(j)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
        coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
          'account_code',l.account_code,'debit_cents',l.debit_cents,
          'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
            else 'credit' end,'counterparty_id',l.counterparty_id,
          'description',l.description) order by l.line_no)
          from clara.journal_lines l where l.entry_id=j.id),'[]'::jsonb),
        (select rd.id from clara.rule_decisions rd where rd.entry_id=j.id
          order by rd.created_at desc,rd.id desc limit 1),
        coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
          'region_id',ev.region_id,'fact_hash',ev.fact_hash,
          'provenance_tier',ev.provenance_tier) order by ev.id)
          from clara.entry_evidence ev where ev.entry_id=j.id),'[]'::jsonb)
      from clara.journal_entries j where j.id=v_entry;
  end loop;
  perform clara._audit(t.firm_id,null,null,null,'persist_invoice_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,
      'version',t.version_n,'pages',p_pages_used));
  perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_ext,'version_n',t.version_n));
  return jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status','done');
end $$;
alter function clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb) owner to clara_fn_owner;

-- =====================================================================
-- §G — clara.request_reextraction CoR, TWO edits. (1) The exhausted-retry message fix:
-- its version computation was ALREADY correctly per-lane and its bounded-retry loop
-- already raises LOUDLY on exhaustion (never the silent shape the other four sites had)
-- — the one defect was the message's confident, unverifiable claim of cause. Corrected;
-- no structural change to the retry loop itself. (2) AMENDMENT, ratified 2026-07-28
-- (gate-s-driver's hold report, recovery vehicle 9e4ab36c): the admission gate widens
-- from two doors to three — a document with a LIVE FILING and no completed facts
-- extraction can now bootstrap through, the recovery seam for a document whose automatic
-- facts enqueue was genuinely missed (today there is no other door back in). Every other
-- wall stays exactly as-is: bookkeeper floor, cross-firm refusal, the 3-attempt bound,
-- the audit trail. The diagnostic is widened alongside it — every call now records WHICH
-- of the three doors admitted it (v_admission), in both the audit row and the receipt.
-- =====================================================================
create or replace function clara.request_reextraction(
    p_document uuid, p_reason text, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c         record;
  d         record;
  t         record;
  v_dedupe  jsonb;
  v_reason  text;
  v_lane    text;
  v_engine  text;
  v_task    uuid;
  v_version int;
  v_status  text;
  v_pages   int;
  v_attempt int;
  v_reused  boolean := false;
  v_admission text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- The reason is the whole audit value of this verb: an unexplained re-extraction is an
  -- unexplained change of the evidence a posted entry rests on. Normalised BEFORE the
  -- request hash so a trailing space cannot make an identical retry look like a new request.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a re-extraction reason is required' using errcode = 'CLR10';
  end if;

  -- The document must belong to the caller's firm. Checked explicitly rather than left to
  -- RLS (the 0021 rule): a cross-firm document id must be an honest refusal, never a silent
  -- no-op, and never an existence oracle either — the same CLR11 covers absent and foreign.
  --
  -- FOR UPDATE (cross-model review finding on this migration — a real TOCTOU, not
  -- theoretical): every OTHER kind-dependent decision in this function reads d.document_kind
  -- from THIS snapshot below, including the receipt-only backfill relaxation. Without a lock,
  -- a concurrent set_document_kind or classify_document call can commit a kind CHANGE between
  -- this read and that decision, and this call would keep deciding against the STALE value —
  -- specifically, a document read as 'receipt' here could be corrected to 'invoice' by a
  -- concurrent call, and this one would still apply the receipt-only backfill door to what is,
  -- by the time it actually enqueues, no longer a receipt. classify_document and
  -- set_document_kind both ALREADY lock this exact row for this exact reason (their own
  -- ADV-R4#6 comment: "the two classification writers serialize instead of racing on the
  -- kind") — this verb simply had not joined that serialization. Locking here makes it the
  -- third writer in that same lock order (documents, then document_processing_tasks — both
  -- OTHER kind writers touch documents alone, so there is no new cross-function lock-order
  -- risk), so whichever call commits first is the truth the other one sees.
  select * into d from clara.documents where id = p_document for update;
  if not found or d.firm_id is distinct from c.firm then
    raise exception 'document is not in your firm' using errcode = 'CLR11';
  end if;

  -- Lane + engine by mime, the SAME mapping the core uses (0016:3394-3426), so a
  -- re-extraction lands on the identical engine the first extraction used and the
  -- version chain composes. A kind gate applies for the same reason it does there: a
  -- re-extraction of a non-invoice kind through the invoice engine is meaningless work.
  -- 0025: 'receipt' joins the admitted set, matching §A's widened automatic gate exactly.
  if lower(coalesce(d.mime_type, '')) = 'application/pdf'
     or lower(coalesce(d.mime_type, '')) like 'image/%' then
    if coalesce(d.document_kind, '') not in ('invoice', 'credit_note', 'debit_note', 'receipt') then
      raise exception 'only an invoice-shaped document can be re-extracted (kind is %)',
        coalesce(d.document_kind, 'unset') using errcode = 'CLR16';
    end if;
    v_lane := 'invoice_facts'; v_engine := 'azure-di:prebuilt-invoice:2024-11-30';
  elsif lower(coalesce(d.mime_type, '')) in ('application/xml', 'text/xml') then
    v_lane := 'local_facts'; v_engine := 'clara-myinvois:v1';
  else
    raise exception 'this document type has no facts-extraction lane' using errcode = 'CLR16';
  end if;

  -- A RE-extraction supersedes something. Without a settled extraction there is nothing to
  -- supersede and the ORDINARY pipeline is the right door — routing a first extraction
  -- through a human verb would hide it from the intake path's own receipts. THREE
  -- admission doors, in priority order; v_admission records WHICH ONE admitted the call —
  -- the diagnostic must stay honest about that, not just about whether the call succeeded.
  --   'reextraction' — the ordinary case: a done invoice_facts extraction already exists
  --     to supersede.
  --   'receipt_backfill' (0025, owner-ruled AUTO-ROUTE, task #27) — every receipt ingested
  --     BEFORE that migration was structurally REFUSED by §A's kind gate, so it CAN carry
  --     no prior extraction; the ordinary pipeline was never an available door for that
  --     population. Not a standing bypass: a receipt ingested AFTER 0025 gets its first
  --     extraction through §A like every other admitted kind, and by the time a human
  --     could reach this verb a 'done' extraction already exists — this door is inert for
  --     every FUTURE receipt.
  --   'filed_bootstrap' (0026 amendment, gate-s-driver's hold report, recovery vehicle
  --     9e4ab36c) — a document with a LIVE FILING (file_document already spent) AND
  --     ZERO tasks in THIS document's facts lane (v_lane) AND ZERO NON-TERMINAL tasks
  --     of ANY lane. THREE conditions, all load-bearing, and the shape of each was
  --     MEASURED against 9e4ab36c's actual live state
  --     (`select lane,status,engine_id from document_processing_tasks where
  --     document_id='9e4ab36c-...'`), not assumed — the first two drafts of this door
  --     were each disproven by a real probe or a real test failure, not by review:
  --       - NOT "no completed extraction": file_document's own backstop (0009) ALREADY
  --         calls _enqueue_invoice_facts_core on every filing it creates today, so a
  --         document filed through the CURRENT writer always has at least a
  --         queued/failed task moments after filing. (Draft 1, disproven by
  --         x-receipt-routing.test.mjs's own "invoice with no prior extraction still
  --         refuses CLR16" cell going green when it should refuse.)
  --       - NOT "zero tasks of ANY lane" either: 9e4ab36c's OWN measured state is ONE
  --         row — `structured_parse | done | clara-myinvois:v1` — the intake identity
  --         pass completed; the facts lane specifically never started. "Zero tasks of
  --         any lane" REFUSES the exact document this door exists for. (Draft 2,
  --         disproven by the live probe above, not by a test — the lesson is probe the
  --         real target before declaring the shape matches it.)
  --       - The CORRECT split: "zero tasks in v_lane" (this document's facts lane
  --         specifically — invoice_facts or local_facts, whichever its mime maps to)
  --         admits 9e4ab36c (its one task is structured_parse, a DIFFERENT lane) and
  --         still refuses an ordinary filed-but-not-yet-extracted document (which
  --         already has a v_lane task from the 0009 backstop). "Zero NON-TERMINAL tasks
  --         of any lane" is the second, independent condition that keeps a document
  --         with a LIVE (queued/held_egress/running) task in some OTHER lane — a
  --         NULL-kind pdf's classify task, mid-flight, correctly waiting on a human kind
  --         decision — from bootstrapping too: that document's classify task is
  --         non-terminal, so this clause refuses it even though it also has zero
  --         v_lane tasks. A TERMINAL task in another lane (9e4ab36c's done
  --         structured_parse) does not trip this clause; a LIVE one does.
  --     Verified against all four shapes this door must distinguish: 9e4ab36c itself
  --     (terminal structured_parse, zero facts tasks) admits; a document with a LIVE
  --     classify task pending a kind decision refuses (a non-terminal task means the
  --     pipeline is in flight and OTHER doors own it — the in-flight check just below,
  --     the ordinary bounded-retry loop); a document with a facts-lane task already
  --     present (any status, the 0009-backstop shape) refuses (preserves 0025's
  --     receipt-only backfill scoping); a document with a live filing and genuinely NO
  --     task of any kind (predates the 0009 backstop, or some other operational gap —
  --     not reproducible through the current file_document RPC, which self-heals on
  --     every fresh filing) admits too — zero of anything is a subset of "zero in
  --     v_lane and zero non-terminal". Before this amendment there was NO door back
  --     into the facts lane for either admitted shape. Bounded by the SAME walls as
  --     every other call here (bookkeeper floor, cross-firm refusal, the 3-attempt
  --     bound, the audit trail). It is naturally idempotent against a LATE automatic
  --     enqueue arriving moments later: both land on the SAME in-flight-task check just
  --     below, so a human bootstrap and a late automatic one never race into two tasks
  --     — and once a v_lane task exists (bootstrapped or not), the NEXT call is
  --     admitted through the ordinary 'reextraction' door once it completes, so this
  --     door fires at most once per document. The kind gate above already guarantees
  --     d.document_kind is non-NULL, so the receipt comparison is never against a NULL.
  if exists (select 1 from clara.document_extractions e
      where e.document_id = p_document
        and e.engine_kind = 'invoice_facts' and e.status = 'done') then
    v_admission := 'reextraction';
  elsif d.document_kind = 'receipt' then
    v_admission := 'receipt_backfill';
  elsif exists (select 1 from clara.document_filings f
      where f.document_id = p_document and f.retired_at is null)
     and not exists (select 1 from clara.document_processing_tasks ptf
      where ptf.document_id = p_document and ptf.lane = v_lane)
     and not exists (select 1 from clara.document_processing_tasks ptn
      where ptn.document_id = p_document and ptn.status not in ('done', 'failed')) then
    v_admission := 'filed_bootstrap';
  else
    raise exception 'no completed extraction to re-extract' using errcode = 'CLR16';
  end if;

  -- The request hash covers EVERY argument that reaches a stored column or an audit row.
  -- An argument left OUT is one a caller can change under a re-used op_key and have
  -- silently ignored — so a corrected reason under the old key is an honest CLR10, not a
  -- stale receipt for the request they were trying to fix.
  v_dedupe := clara._reserve_op(c.firm, 'request_reextraction', p_op_key,
    clara._hash(jsonb_build_object('d', p_document, 'r', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- An extraction is ALREADY in flight for this lane: return ITS identity rather than
  -- queueing a second one. Two live tasks on one document/lane would race to persist and
  -- the loser would fail on the (document_id, engine_id, version_n) unique — a confusing
  -- failure for a human who simply pressed the button twice.
  select * into t from clara.document_processing_tasks
    where document_id = p_document and lane = v_lane
      and status in ('queued', 'held_egress', 'running')
    order by id limit 1;
  if found then
    v_task := t.id; v_version := t.version_n; v_status := t.status; v_reused := true;
  else
    -- BOUNDED RETRY (adversarial round 1 — MAJOR). 0016:3463-3473's shape is
    -- compute-version / insert-on-conflict-do-nothing / re-select-ACTIVE, and it is right
    -- for the first-extraction path because a losing caller's winner is always still
    -- active there. It is NOT right here. Losing `on conflict do nothing` does not imply
    -- the winner is still active: an OVER-BUDGET winner catches CLR18 and marks its own
    -- row `failed`/`budget` in the same transaction, so a re-select restricted to active
    -- statuses can legitimately find NOTHING. The single-shot version of this code then
    -- fell through with a NULL task and finished a receipt carrying no task, no version
    -- and no status — memoized under that op_key forever.
    -- So: recompute the version and try again, up to three times. Three is not a magic
    -- number, it is "more losses than a real operator can generate", and the bound is what
    -- keeps a pathological loop out of a human-invoked verb.
    for v_attempt in 1..3 loop
      select coalesce(max(version_n), 0) + 1 into v_version
        from clara.document_processing_tasks
        where document_id = p_document and lane = v_lane;
      insert into clara.document_processing_tasks(firm_id, document_id, engine_id, engine_config,
          version_n, lane, status)
        values (d.firm_id, p_document, v_engine, '{}'::jsonb, v_version, v_lane, 'queued')
        on conflict do nothing returning id into v_task;
      if v_task is not null then
        v_status := 'queued';
        exit;
      end if;
      -- Lost the version. If the winner is still ACTIVE this is the ordinary
      -- two-people-pressed-the-button case and its task is the honest answer.
      select id, version_n, status into v_task, v_version, v_status
        from clara.document_processing_tasks
        where document_id = p_document and lane = v_lane
          and status in ('queued', 'held_egress', 'running')
        order by id limit 1;
      if v_task is not null then
        v_reused := true;
        exit;
      end if;
      -- Otherwise the winner already went terminal. Loop: recompute above the row it took.
    end loop;
    if v_task is null then
      -- Three consecutive losses to terminal winners. RAISING rather than returning a
      -- partial receipt is the whole safety property: the raise rolls back the
      -- `_reserve_op` reservation in this same transaction, so the SAME op_key retries
      -- cleanly and a malformed receipt can never be finished. A returned partial would
      -- be permanent.
      -- 0026 (Gate-S's earlier finding, same root as the key-widening above): before this
      -- migration THIS exact raise could fire for a reason that had nothing to do with a
      -- concurrent request — the lane-blind unique key meant an UNRELATED lane's row (the
      -- document's own intake task) could occupy the version_n this loop kept recomputing,
      -- so three straight 'losses' could be three straight collisions with a different lane
      -- entirely, not with another human pressing this same button. Lane now joins the key
      -- (§A above), so a genuine loss here really is another writer on THIS lane — but the
      -- message no longer names a cause it cannot verify.
      raise exception 'could not enqueue a re-extraction after 3 attempts — the % lane''s version counter kept losing to another writer; retry',
        v_lane using errcode = 'CLR16';
    end if;
    -- Only the Azure lane consumes the firm page budget; the local XML parse is free.
    -- KEPT deliberately (see the header): the budget is a standing control on Azure
    -- spend, not a re-extraction cap, and a breach must refuse here exactly as it does
    -- on a first extraction (0016:3477-3486). Skipped when we recovered someone else's
    -- in-flight task — that task reserved its own pages. 0025: unconditional on LANE,
    -- so a receipt's backfill extraction is bounded by the SAME standing spend control
    -- as every other invoice_facts request — no new budget code, none needed.
    if not v_reused and v_lane = 'invoice_facts' then
      v_pages := greatest(coalesce(d.page_count, 1), 1);
      begin
        perform clara._reserve_processing_call(v_task, v_pages);
      exception when sqlstate 'CLR18' then
        update clara.document_processing_tasks set status = 'failed', error_code = 'budget',
          finished_at = now() where id = v_task;
        v_status := 'failed';
      end;
    end if;
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'request_reextraction', null,
    jsonb_build_object('document_id', p_document, 'lane', v_lane, 'version_n', v_version,
      'task_id', v_task, 'reason', v_reason, 'reused', v_reused, 'status', v_status,
      'admission', v_admission, 'op_key', p_op_key));

  return clara._finish_op(c.firm, 'request_reextraction', p_op_key,
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', v_task, 'document_id', p_document, 'version_n', v_version,
      'status', v_status, 'reused', v_reused, 'admission', v_admission,
      'reason', case when v_status = 'failed' then 'budget' end)));
end $$;
alter function clara.request_reextraction(uuid, text, text) owner to clara_fn_owner;

-- ---------------------------------------------------------------------------
-- §TAIL — in-transaction assertions. The apply proves them or rolls back whole.
--
-- THE HONEST FRAMING (carried from 0022/0023/0024/0025): these are BELT. The primary
-- instrument is BEHAVIOURAL — the rig drives real XML documents through the intake +
-- facts pipeline and checks the real routing, the real second task, the real second
-- extraction. These probes exist so an APPLY onto a drifted catalog refuses, not to
-- stand in for the cells.
-- ---------------------------------------------------------------------------
do $tail$
declare
  v_src text; v_code text;
  v_n0 bigint; v_h0 bigint; v_n1 bigint; v_h1 bigint;
  v_tn0 bigint; v_th0 bigint; v_tn1 bigint; v_th1 bigint;
  v_en0 bigint; v_eh0 bigint; v_en1 bigint; v_eh1 bigint;
  v_sig_intake  constant text := 'clara.finalize_document_intake(uuid,text,text,jsonb,int,text,uuid,uuid,text)';
  v_sig_core    constant text := 'clara._enqueue_invoice_facts_core(uuid)';
  v_sig_pde     constant text := 'clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)';
  v_sig_pif     constant text := 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)';
  v_sig_rex     constant text := 'clara.request_reextraction(uuid,text,text)';
begin
  -- (0) DOORS-NOT-DATA: clara.documents, clara.document_processing_tasks and
  -- clara.document_extractions content checksums, compared against the §0 checkpoint
  -- taken before any DDL. Moves on ANY insert/update/delete against any of the three.
  v_n0 := current_setting('clara.mig0026_doc_n')::bigint;
  v_h0 := current_setting('clara.mig0026_doc_h')::bigint;
  select count(*), coalesce(sum(hashtext(d::text)::bigint),0) into v_n1, v_h1 from clara.documents d;
  if v_n0 <> v_n1 or v_h0 <> v_h1 then
    raise exception '0026 tail: clara.documents changed during this migration (n %->% h %->%) — doors-not-data is violated',
      v_n0, v_n1, v_h0, v_h1;
  end if;
  v_tn0 := current_setting('clara.mig0026_task_n')::bigint;
  v_th0 := current_setting('clara.mig0026_task_h')::bigint;
  select count(*), coalesce(sum(hashtext(t::text)::bigint),0) into v_tn1, v_th1 from clara.document_processing_tasks t;
  if v_tn0 <> v_tn1 or v_th0 <> v_th1 then
    raise exception '0026 tail: clara.document_processing_tasks changed during this migration (n %->% h %->%) — doors-not-data is violated (this migration must open capability, never touch existing rows)',
      v_tn0, v_tn1, v_th0, v_th1;
  end if;
  v_en0 := current_setting('clara.mig0026_ext_n')::bigint;
  v_eh0 := current_setting('clara.mig0026_ext_h')::bigint;
  select count(*), coalesce(sum(hashtext(e::text)::bigint),0) into v_en1, v_eh1 from clara.document_extractions e;
  if v_en0 <> v_en1 or v_eh0 <> v_eh1 then
    raise exception '0026 tail: clara.document_extractions changed during this migration (n %->% h %->%) — doors-not-data is violated',
      v_en0, v_en1, v_eh0, v_eh1;
  end if;

  -- (1) The two unique keys carry EXACTLY the widened shape — no more, no less — and
  -- the old 3-column constraint names are GONE (a partial widening that left both
  -- constraints active would silently readmit the collision the wider one permits).
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='clara.document_processing_tasks'::regclass
         and conname='uq_document_processing_tasks_doc_engine_version_lane')
     is distinct from 'UNIQUE (document_id, engine_id, version_n, lane)' then
    raise exception '0026 tail: document_processing_tasks'' widened unique key is missing or has the wrong shape';
  end if;
  if exists (select 1 from pg_constraint
      where conrelid='clara.document_processing_tasks'::regclass
        and conname='document_processing_tasks_document_id_engine_id_version_n_key') then
    raise exception '0026 tail: document_processing_tasks'' OLD 3-column unique constraint is still present alongside the new one';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid='clara.document_extractions'::regclass
         and conname='uq_document_extractions_doc_engine_version_kind')
     is distinct from 'UNIQUE (document_id, engine_id, version_n, engine_kind)' then
    raise exception '0026 tail: document_extractions'' widened unique key is missing or has the wrong shape';
  end if;
  if exists (select 1 from pg_constraint
      where conrelid='clara.document_extractions'::regclass
        and conname='document_extractions_document_id_engine_id_version_n_key') then
    raise exception '0026 tail: document_extractions'' OLD 3-column unique constraint is still present alongside the new one';
  end if;

  -- (2) finalize_document_intake — the widened ON CONFLICT target and the lane-filtered,
  -- raise-guarded fallback, in EXECUTABLE TEXT (comment-stripped — the 0022 lesson: a
  -- guard deleted from the executable path and pasted back as a comment must not pass).
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_intake::regprocedure;
  if v_src is null then raise exception '0026 tail: finalize_document_intake is GONE'; end if;
  v_code := regexp_replace(regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
    '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('onconflict(document_id,engine_id,version_n,lane)donothingreturningidintov_task' in v_code) = 0 then
    raise exception '0026 tail: finalize_document_intake''s ON CONFLICT target is not widened to include lane';
  end if;
  if position('wheredocument_id=v_docandengine_id=p_engine_idandversion_n=p_version_nandlane=p_lane' in v_code) = 0 then
    raise exception '0026 tail: finalize_document_intake''s fallback re-select does not filter on lane';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0 then
    raise exception '0026 tail: finalize_document_intake lost its impossible-state RAISE';
  end if;
  if position('usingerrcode=''CLR35''' in v_code) = 0 then
    raise exception '0026 tail: finalize_document_intake''s impossible-state RAISE is not CLR35';
  end if;

  -- (3) _enqueue_invoice_facts_core (amendment A11) — the redesigned fallback: the
  -- re-select is unconditional on status, and the impossible-state RAISE is present.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_core::regprocedure;
  if v_src is null then raise exception '0026 tail: _enqueue_invoice_facts_core is GONE'; end if;
  v_code := regexp_replace(regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
    '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('wheredocument_id=p_documentandengine_id=v_engineandversion_n=v_versionandlane=v_lane' in v_code) = 0 then
    raise exception '0026 tail: _enqueue_invoice_facts_core''s fallback re-select is not the unconditional-on-status redesign';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0 then
    raise exception '0026 tail: _enqueue_invoice_facts_core lost its impossible-state RAISE (amendment A11)';
  end if;
  if position('usingerrcode=''CLR35''' in v_code) = 0 then
    raise exception '0026 tail: _enqueue_invoice_facts_core''s impossible-state RAISE is not CLR35';
  end if;
  -- 0017's O8.6 inactive-client guard and 0025's four-kind gate + P4 lock both survive
  -- the CoR untouched (the read-the-live-body discipline's own proof).
  if position('skipped_client_onboarding' in v_code) = 0
     or position('oc.status=''active''' in v_code) = 0 then
    raise exception '0026 tail: _enqueue_invoice_facts_core lost 0017''s inactive-client guard';
  end if;
  if position('d.document_kindin(''invoice'',''credit_note'',''debit_note'',''receipt'')' in v_code) = 0 then
    raise exception '0026 tail: _enqueue_invoice_facts_core lost 0025''s four-kind gate';
  end if;
  if position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0 then
    raise exception '0026 tail: _enqueue_invoice_facts_core lost 0025''s P4 document lock';
  end if;

  -- (4) persist_document_extraction — the widened ON CONFLICT target and the
  -- engine_kind-filtered, raise-guarded fallback.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_pde::regprocedure;
  if v_src is null then raise exception '0026 tail: persist_document_extraction is GONE'; end if;
  v_code := regexp_replace(regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
    '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('onconflict(document_id,engine_id,version_n,engine_kind)donothingreturningidintov_ext' in v_code) = 0 then
    raise exception '0026 tail: persist_document_extraction''s ON CONFLICT target is not widened to include engine_kind';
  end if;
  if position('wheredocument_id=t.document_idandengine_id=t.engine_idandversion_n=t.version_nandengine_kind=v_ekind' in v_code) = 0 then
    raise exception '0026 tail: persist_document_extraction''s fallback re-select does not filter on engine_kind';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0 then
    raise exception '0026 tail: persist_document_extraction lost its impossible-state RAISE';
  end if;
  if position('classifytasksaresettledbyclassify_document' in v_code) = 0 then
    raise exception '0026 tail: persist_document_extraction lost 0016 P3''s classify-lane refusal';
  end if;

  -- (5) persist_invoice_facts — the extraction insert now CARRIES an ON CONFLICT clause
  -- (it never did before), widened straight to the four-column key, with the same
  -- fallback + raise discipline.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_pif::regprocedure;
  if v_src is null then raise exception '0026 tail: persist_invoice_facts is GONE'; end if;
  v_code := regexp_replace(regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
    '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('onconflict(document_id,engine_id,version_n,engine_kind)donothing' in v_code) = 0 then
    raise exception '0026 tail: persist_invoice_facts'' extraction insert still carries no ON CONFLICT clause';
  end if;
  if position('wheredocument_id=t.document_idandengine_id=t.engine_idandversion_n=t.version_nandengine_kind=''invoice_facts''' in v_code) = 0 then
    raise exception '0026 tail: persist_invoice_facts'' fallback re-select is missing or malformed';
  end if;
  if position('impossiblestate:anONCONFLICTfiredfor(document=%' in v_code) = 0 then
    raise exception '0026 tail: persist_invoice_facts lost its impossible-state RAISE';
  end if;
  -- 0022/0023's write-boundary guards all survive the CoR (spot-checked, not exhaustive
  -- — the behavioural cells hold the exhaustive claim).
  if position('astatedinvoicenet/taxmustnotbenegative' in v_code) = 0 then
    raise exception '0026 tail: persist_invoice_facts lost 0023''s net/tax non-negative guard';
  end if;

  -- (6) request_reextraction — the exhausted-retry message fix confirmed present; the
  -- old confident claim is GONE (a partial edit that left both phrasings somewhere would
  -- fail this).
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_rex::regprocedure;
  if v_src is null then raise exception '0026 tail: request_reextraction is GONE'; end if;
  v_code := regexp_replace(regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
    '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('couldnotenqueueare-extractionafter3attempts' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction''s exhausted-retry message was not corrected';
  end if;
  if position('aconcurrentrequestsettledthisdocument' in lower(v_code)) > 0 then
    raise exception '0026 tail: request_reextraction still carries the old misleading exhausted-retry message';
  end if;
  -- The rest of the verb is untouched — bookkeeper floor, cross-firm refusal, the O2
  -- lock, the bounded-retry shape itself.
  if position('_human_ctx(clara.role_rank(''bookkeeper''))' in v_code) = 0
     or position('documentisnotinyourfirm' in lower(v_code)) = 0
     or position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0
     or position('forv_attemptin1..3loop' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction lost a retained guard or its bounded-retry shape';
  end if;
  -- The 0026 amendment: the admission gate carries all THREE doors (the pre-existing
  -- 'reextraction' + 'receipt_backfill', plus the new 'filed_bootstrap' — a live filing,
  -- zero tasks in THIS document's facts lane, and zero NON-TERMINAL tasks of any lane;
  -- see the door's own header comment for the measured predicate and why a naive "zero
  -- tasks of any lane" REFUSES the exact document (9e4ab36c) the door exists for), each
  -- setting v_admission, and the diagnostic is threaded through to both the audit row
  -- and the returned receipt.
  if position('v_admission:=''reextraction''' in v_code) = 0
     or position('v_admission:=''receipt_backfill''' in v_code) = 0
     or position('v_admission:=''filed_bootstrap''' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction is missing one of the three admission doors';
  end if;
  if position('exists(select1fromclara.document_filingsfwheref.document_id=p_documentandf.retired_atisnull)' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction''s filed-bootstrap door does not check for a live filing';
  end if;
  if position('andnotexists(select1fromclara.document_processing_tasksptfwhereptf.document_id=p_documentandptf.lane=v_lane)' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction''s filed-bootstrap door does not check for ZERO tasks in this document''s own facts lane — it must not re-admit a document that already has a v_lane task (the 0009-backstop shape)';
  end if;
  if position('andnotexists(select1fromclara.document_processing_tasksptnwhereptn.document_id=p_documentandptn.statusnotin(''done'',''failed''))' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction''s filed-bootstrap door does not check for ZERO NON-TERMINAL tasks of any lane — it must not re-admit a document with a LIVE task in a different lane (e.g. a pending classify verdict)';
  end if;
  if position('''admission'',v_admission' in v_code) = 0 then
    raise exception '0026 tail: request_reextraction no longer threads v_admission into the audit row / receipt';
  end if;

  -- (7) ACLs UNCHANGED on all five (CREATE OR REPLACE preserves owner/grants, but a
  -- future edit could still widen one silently).
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = v_sig_core::regprocedure and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')) then
    raise exception '0026 tail: _enqueue_invoice_facts_core gained a direct EXECUTE grant';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = v_sig_rex::regprocedure and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_authenticated'))) then
    raise exception '0026 tail: request_reextraction has an unexpected EXECUTE grantee after the CoR';
  end if;

  raise notice '0026: lane joins document_processing_tasks'' unique key, engine_kind joins document_extractions'' — the XML facts lane''s task and extraction can now legitimately coexist alongside the intake structured_parse task/extraction at the same version_n; every ON CONFLICT site that assumed the old 3-column key is widened or (persist_invoice_facts) given one for the first time; every silent/crashing fallback is now impossible-state-loud (CLR35); request_reextraction''s exhausted-retry message no longer names an unverifiable cause';
end
$tail$;
