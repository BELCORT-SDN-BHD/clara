-- 0025_receipt_routing.sql — 'receipt' joins the automatic facts-enqueue kind gate.
--
-- Authority: owner ruling on task #27 (Gate P blocker: "the facts lane excludes 'receipt',
-- where Malaysian SST actually lives") — AUTO-ROUTE ALL RECEIPTS. 'receipt' joins
-- invoice/credit_note/debit_note in the kind gate that routes a pdf/image document to the
-- invoice_facts (Azure) lane. The owner explicitly accepted the Azure cost implication:
-- every ingested receipt now burns pages against the firm's standing page budget (§C below).
--
-- THE TWO GATES, BOTH ALREADY-LIVE, BOTH CoR'd HERE.
--   §A  clara._enqueue_invoice_facts_core (0009, CoR'd by 0017) — the AUTOMATIC path every
--       new document rides (intake finalizer, the classify re-fire, the coding-time backstop
--       inside file_document/confirm_attribution_candidate/approve_wrong_client_correction,
--       and the runtime re-drive). Its kind gate widens from three kinds to four.
--   §B  clara.request_reextraction (0022) — the HUMAN-INVOKED verb. Its kind gate widens
--       identically, AND its "no completed extraction to re-extract" refusal is relaxed for
--       receipt-kind documents ONLY — see §B's own header for why this is a narrow, one-time
--       backfill seam and not a standing bypass of the verb's own design principle.
--
-- READ-THE-LIVE-BODY DISCIPLINE (a real regression caught building 0024, recorded in
-- project memory): migration 0017 patches _enqueue_invoice_facts_core via a dynamic
-- pg_get_functiondef/replace/execute CoR (the O8.6 "skipped_client_onboarding" inactive-client
-- guard) — a CoR based on 0009's ORIGINAL static text would silently revert it. Both CoRs
-- below were built by pulling `pg_get_functiondef` against a real 24-migration database
-- (0001-0024 applied) and widening ONLY the one gate line each; grepped every later migration
-- for the target function name first (0018-0024: neither function is touched again).
--
-- CONTRACT AMENDMENT A9 (docs/plan/wave-b-migration-0020-design.md §6/§6.1, owner ruling
-- 2026-07-28). _enqueue_invoice_facts_core is a member of migration 0020's §6 legacy
-- byte-identity CLOSED SET — its exact prosrc SHA-256 is pinned in
-- packages/db/tests/wave-b/wb-0020-legacy.test.mjs and asserted unchanged since the
-- 19-migration prestate. This migration is the SECOND deliberate edit to that closed set
-- (the first was A7's record_wiki_source_ingest, within 0020 itself) — and, like A7, it is
-- TWO ratified edits landing together: the task #27 kind-widening, and the P4 lock-order fix
-- below (both shipped in this one migration, both ratified before merge). Per that pin's own
-- discipline the test is amended, not retuned: it reverses BOTH edits and re-hashes the
-- remainder against the ORIGINAL 19-migration pin, so the cell proves both that each ratified
-- edit is present in its exact shape and that nothing else in the body moved — including
-- 0017's O8.6 patch, which is exactly the failure mode the header above guards against.
--
-- O2 FIX (cross-model review, second round): §B's document read was a plain SELECT — no
-- lock. Between that read and the receipt-only backfill decision later in the same
-- function, a concurrent set_document_kind or classify_document call could commit a kind
-- change and this call would keep deciding against the stale snapshot, applying the
-- receipt-only door to a document that is, by the time it actually enqueues, no longer a
-- receipt. Fixed by locking the row (FOR UPDATE) at the same point classify_document and
-- set_document_kind already lock it for the identical reason — see §B's own inline comment
-- for the full reasoning and the lock-order argument.
--
-- P4 FIX (cross-model review, THIRD round — the sibling TOCTOU O2 fixed one function of two
-- for). §A's OWN document read was the identical plain SELECT, no lock: between that read
-- and §A's own kind-branch decision (invoice_facts vs classify vs skipped_kind), a concurrent
-- set_document_kind or classify_document call could commit a kind change the core never
-- sees, routing on a stale snapshot exactly like §B did before O2. Fixed identically — FOR
-- UPDATE at the same point, closing the automatic path's TOCTOU the same way O2 closed the
-- human-invoked one.
--
-- LOCK-ORDER EVIDENCE for §A's new lock (no caller creates a documents-vs-tasks inversion;
-- verified against the four REAL callers, grepped across every migration — 0016's own tail
-- DO-block probes are test invocations, not production callers):
--   enqueue_invoice_facts (0009) calls the core FIRST, with NO prior lock of its own — the
--     core's FOR UPDATE is the first (and, on the failure branch, only) lock this caller ever
--     takes on clara.documents.
--   file_document (0009) already locks documents FOR UPDATE BEFORE calling the core (its own
--     firm-membership check) — the core's lock on the SAME row, SAME transaction, is a safe
--     RE-ENTRANT re-acquisition, not a second competing lock.
--   confirm_attribution_candidate and approve_wrong_client_correction (0009) NEVER lock
--     clara.documents anywhere in their own bodies before calling the core (they lock
--     attribution_candidates/attribution_attempts and filing_corrections/document_filings/
--     journal_entries respectively) — the core's FOR UPDATE is the first and only documents
--     lock either function ever takes.
-- And the core itself never locks clara.document_processing_tasks WITH FOR UPDATE anywhere in
-- its own body (every task read here is a plain SELECT) — so the core can never itself hold a
-- tasks lock and THEN reach for a documents lock, the shape a documents-vs-tasks inversion
-- would require. No caller that reaches the core locks document_processing_tasks first either
-- (claim_document_processing_task / requeue_stranded_document_task never call the core).
-- Structurally, a deadlock between this new lock and any other writer's lock ordering cannot
-- occur.
--
-- WHAT THIS DOES NOT DO. No auto-enqueue of EXISTING receipt documents inside this migration
-- — a data migration inside a DDL migration violates the doors-not-data precedent this repo
-- holds throughout (0016 QUIESCE-GUARD-era migrations, the "doors, not data" framing in
-- REBUILD-PLAN); this migration opens doors only, and its own tail asserts xmin inertness on
-- clara.documents (no row this migration did not itself decide to touch — it decides to touch
-- none). Existing receipts (the twelve Gate-P vehicles + bee-lailoumei-p17) get their first
-- facts pass through request_reextraction's §B relaxation, a HUMAN-INVOKED, audited action —
-- never an automatic sweep. No change to classify_document's kind vocabulary ('receipt' has
-- been classifiable since 0016 — only the FACTS-lane gate was narrower than the classifier's
-- own vocabulary, which is the defect this migration closes). No change to any error_code
-- CHECK, any grant, any taxonomy — both functions keep their existing ACL and event surface
-- exactly (tail-asserted).

-- =====================================================================
-- §0 — DOORS-NOT-DATA CHECKPOINT. A content checksum of clara.documents, taken BEFORE any
-- DDL below and compared in the tail. Deliberately NOT a pg_stat_xact_user_tables probe —
-- that view's transaction-scoped counts proved to behave differently depending on how many
-- PRIOR transactions the same session had already committed (reproduced: false-positive
-- under migrate.mjs's full sequential 25-file apply, clean under an isolated 2-file replay
-- of the identical SQL) — not a mechanism to hang a hard migration gate on. A row-count +
-- per-row hashtext sum is deterministic regardless of session history: any INSERT, UPDATE
-- (including a no-op SET that still bumps xmin), or DELETE against clara.documents moves it.
-- Session-transaction-local (set_config's third arg), so it never leaks past this migration.
do $mig0025_checkpoint$
declare v_n bigint; v_h bigint;
begin
  select count(*), coalesce(sum(hashtext(d::text)::bigint),0) into v_n, v_h from clara.documents d;
  perform set_config('clara.mig0025_doc_n', v_n::text, true);
  perform set_config('clara.mig0025_doc_h', v_h::text, true);
end
$mig0025_checkpoint$;

-- =====================================================================
-- §A — clara._enqueue_invoice_facts_core CoR: 'receipt' admitted to the invoice_facts lane.
--
-- Byte-identical to the LIVE body (0009, as CoR'd by 0017's O8.6 inactive-client guard)
-- EXCEPT the one kind-list line. Read via pg_get_functiondef against a 24-migration database
-- — do not hand-copy from 0009's or 0017's file text (see the header discipline note above).
-- =====================================================================
create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
  v_lane text; v_engine text;
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
    select id,status into v_task,t.status from clara.document_processing_tasks
      where document_id=p_document and lane=v_lane
        and status in ('queued','held_egress','running') order by id limit 1;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',t.status);
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
-- §B — clara.request_reextraction CoR: the kind gate widens; the backfill seam opens.
--
-- Byte-identical to the LIVE 0022 body EXCEPT the two changes below. Pulled via
-- pg_get_functiondef against a 24-migration database; not touched by 0023 or 0024 (grepped).
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
  -- through a human verb would hide it from the intake path's own receipts. EXCEPT for
  -- 'receipt' (0025, owner-ruled AUTO-ROUTE, task #27): every receipt ingested BEFORE this
  -- migration was structurally REFUSED by §A's kind gate, so it CAN carry no prior
  -- extraction — the ordinary pipeline was never an available door for that population, so
  -- this is not "routing a first extraction around intake", it is the ONE-TIME backfill seam
  -- for documents intake could never have produced a receipt for. It is not a standing
  -- bypass: a receipt ingested AFTER 0025 gets its first extraction through the ordinary
  -- automatic pipeline (§A) exactly like every other admitted kind, and by the time a human
  -- could reach this verb for it a 'done' extraction already exists — so for every FUTURE
  -- receipt this relaxation is inert, and the refusal is live again in substance if not in
  -- code (there is simply always something to supersede). The kind gate above already
  -- guarantees d.document_kind is non-NULL and in the admitted set here, so this comparison
  -- is never against a NULL.
  if d.document_kind <> 'receipt' and not exists (select 1 from clara.document_extractions e
                  where e.document_id = p_document
                    and e.engine_kind = 'invoice_facts' and e.status = 'done') then
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
      raise exception 'a concurrent request settled this document — retry'
        using errcode = 'CLR16';
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
      'op_key', p_op_key));

  return clara._finish_op(c.firm, 'request_reextraction', p_op_key,
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', v_task, 'document_id', p_document, 'version_n', v_version,
      'status', v_status, 'reused', v_reused,
      'reason', case when v_status = 'failed' then 'budget' end)));
end $$;

alter function clara.request_reextraction(uuid, text, text) owner to clara_fn_owner;

-- ---------------------------------------------------------------------------
-- §TAIL — in-transaction assertions. The apply proves them or rolls back whole.
--
-- THE HONEST FRAMING (carried from 0022/0023/0024): these are BELT. The primary instrument
-- is BEHAVIOURAL — the rig drives real receipt documents through both functions and checks
-- the real routing, the real refusal shapes, and the real budget reservation row. These
-- probes exist so an APPLY onto a drifted catalog refuses, not to stand in for the cells.
-- ---------------------------------------------------------------------------
do $tail$
declare
  v_src text; v_code text; v_n0 bigint; v_h0 bigint; v_n1 bigint; v_h1 bigint;
  v_sig_core constant text := 'clara._enqueue_invoice_facts_core(uuid)';
  v_sig_rex  constant text := 'clara.request_reextraction(uuid,text,text)';
begin
  -- (0) DOORS-NOT-DATA: clara.documents' content checksum, compared against the §0
  -- checkpoint taken before any DDL in this file. Moves on ANY insert/update/delete.
  v_n0 := current_setting('clara.mig0025_doc_n')::bigint;
  v_h0 := current_setting('clara.mig0025_doc_h')::bigint;
  select count(*), coalesce(sum(hashtext(d::text)::bigint),0) into v_n1, v_h1 from clara.documents d;
  if v_n0 <> v_n1 or v_h0 <> v_h1 then
    raise exception '0025 tail: clara.documents changed during this migration (n %->% h %->%) — doors-not-data is violated (this migration must open capability, never touch existing rows)',
      v_n0, v_n1, v_h0, v_h1;
  end if;

  -- (1) §A — the widened kind gate, in EXECUTABLE TEXT (comment-stripped, the 0022/0023/0024
  -- discipline). The exact fused literal — the four-kind list terminating the elsif — must
  -- be present; the OLD three-kind list must be ABSENT (a partial widening, or a widening
  -- that left the old list as dead code elsewhere, both fail this).
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_core::regprocedure;
  if v_src is null then raise exception '0025 tail: _enqueue_invoice_facts_core is GONE'; end if;
  v_code := regexp_replace(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('d.document_kindin(''invoice'',''credit_note'',''debit_note'',''receipt'')' in v_code) = 0 then
    raise exception '0025 tail: _enqueue_invoice_facts_core''s kind gate does not admit receipt';
  end if;
  if position('d.document_kindin(''invoice'',''credit_note'',''debit_note'')' in v_code) > 0 then
    raise exception '0025 tail: _enqueue_invoice_facts_core still carries the OLD three-kind gate somewhere — a partial widening';
  end if;
  -- P4 (cross-model review, third round): the document row is locked BEFORE its kind is
  -- read for any decision — closing the SAME-SHAPED TOCTOU O2 fixed on request_reextraction.
  -- Fused to the query, not a bare mention.
  if position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0 then
    raise exception '0025 tail: _enqueue_invoice_facts_core no longer locks the document row before reading its kind — the P4 TOCTOU fix is missing';
  end if;
  -- 0017's O8.6 inactive-client guard survived the CoR (the read-the-live-body discipline's
  -- own proof, not just a comment about it).
  if position('skipped_client_onboarding' in v_code) = 0
     or position('oc.status=''active''' in v_code) = 0 then
    raise exception '0025 tail: _enqueue_invoice_facts_core lost 0017''s inactive-client guard — the CoR was built from a stale base';
  end if;
  -- The budget reservation is unconditional on LANE, never kind-gated — the standing
  -- control the owner accepted as the cost boundary for this change.
  if position('ifv_lane=''invoice_facts''then' in v_code) = 0
     or position('performclara._reserve_processing_call(v_task,v_pages)' in v_code) = 0 then
    raise exception '0025 tail: _enqueue_invoice_facts_core''s page-budget reservation is missing or no longer unconditional on lane — the owner''s accepted cost control must still gate every invoice_facts enqueue, receipts included';
  end if;

  -- (2) §B — request_reextraction, same discipline.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_rex::regprocedure;
  if v_src is null then raise exception '0025 tail: request_reextraction is GONE'; end if;
  v_code := regexp_replace(regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g');
  if position('coalesce(d.document_kind,'''')notin(''invoice'',''credit_note'',''debit_note'',''receipt'')' in v_code) = 0 then
    raise exception '0025 tail: request_reextraction''s kind gate does not admit receipt';
  end if;
  if position('coalesce(d.document_kind,'''')notin(''invoice'',''credit_note'',''debit_note'')' in v_code) > 0 then
    raise exception '0025 tail: request_reextraction still carries the OLD three-kind gate somewhere — a partial widening';
  end if;
  -- The backfill relaxation, fused to the condition it modifies — not a bare mention.
  if position('d.document_kind<>''receipt''andnotexists' in v_code) = 0 then
    raise exception '0025 tail: request_reextraction''s receipt backfill relaxation is missing from the no-completed-extraction guard';
  end if;
  -- O2 (cross-model review): the document row is locked BEFORE its kind is read for any
  -- decision — closing the TOCTOU where a concurrent kind-writer could commit a kind change
  -- between the read and the receipt-only relaxation. Fused to the query, not a bare mention.
  if position('fromclara.documentswhereid=p_documentforupdate' in v_code) = 0 then
    raise exception '0025 tail: request_reextraction no longer locks the document row before reading its kind — the O2 TOCTOU fix is missing';
  end if;
  if position('performclara._reserve_processing_call(v_task,v_pages)' in v_code) = 0 then
    raise exception '0025 tail: request_reextraction''s page-budget reservation is missing — the standing cost control must still gate a receipt''s backfill extraction';
  end if;
  -- Everything else this verb has ever guarded is still there — bookkeeper floor, the
  -- cross-firm refusal, the in-flight reuse, the bounded retry, the op-key dedupe.
  if position('_human_ctx(clara.role_rank(''bookkeeper''))' in v_code) = 0
     or position('documentisnotinyourfirm' in lower(v_code)) = 0
     or position('aconcurrentrequestsettledthisdocument' in lower(v_code)) = 0 then
    raise exception '0025 tail: request_reextraction lost a retained 0022 guard';
  end if;

  -- (3) ACL UNCHANGED on both (CREATE OR REPLACE preserves owner/grants, but a future edit
  -- could still widen it silently). _enqueue_invoice_facts_core stays UNGRANTED beyond its
  -- own owner (the owner's EXECUTE entry is implicit/structural on every function — reached
  -- only through enqueue_invoice_facts and the audited writers that call it directly, never
  -- itself app-callable); request_reextraction stays clara_authenticated-only.
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = v_sig_core::regprocedure and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')) then
    raise exception '0025 tail: _enqueue_invoice_facts_core gained a direct EXECUTE grant — it must stay reachable only through its callers';
  end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
              where p.oid = v_sig_rex::regprocedure and a.privilege_type = 'EXECUTE'
                and (a.grantee = 0
                     or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_authenticated'))) then
    raise exception '0025 tail: request_reextraction has an unexpected EXECUTE grantee after the CoR — it must stay clara_authenticated-only';
  end if;

  raise notice '0025: receipt admitted to the invoice_facts kind gate (both the automatic core and the human re-extraction/backfill verb); page-budget reservation confirmed unconditional on lane; both functions'' document reads are now lock-guarded (O2 + P4) against the classify_document/set_document_kind TOCTOU';
end
$tail$;
