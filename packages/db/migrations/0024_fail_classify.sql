-- 0024_fail_classify.sql — the classify lane's missing DB terminal-fail path.
--
-- Authority: docs/PROJECTLOG.md's deferred-hardening line (ADR-030): "the classify lane has
-- no DB terminal-fail path (persist_document_extraction refuses it; only classify_document
-- settles) — the runtime caps retries at 3 attempts and /ready warns, but a poisoned task can
-- never be marked failed in the DB." Filed against 0018 at the time, shipped here as the next
-- open migration slot.
--
-- THE GAP, PRECISELY. 0016 (packages/db/migrations/0016_a21_compliance_watch.sql:3756-3758)
-- REFUSES a classify task through the generic terminal writer:
--     if t.lane='classify' then
--       raise exception 'classify tasks are settled by classify_document' using errcode='CLR16';
--     end if;
-- and classify_document (0016:3175) settles a claimed task ONLY on a successful verdict
-- (0016:3224-3231) — there is no branch in either function that ever writes status='failed'
-- for lane='classify'. packages/runtime/lib/classify.mjs documents the consequence at its own
-- header (L17-21): a read/LLM fault is treated as transient and the task is left 'running' for
-- the stranded-requeue path to re-drive, "We NEVER settle a guessed kind on error" — which is
-- the right call for a TRANSIENT fault, but leaves no lane at all for a DETERMINISTIC one (a
-- document permanently stuck at CLR28/CLR11, a verdict schema the model can never satisfy).
-- Today that task loops forever on the stranded-requeue path, burning model spend with no
-- ceiling in the DB (classify.mjs L52-60's discoverQueued attempt-cap only ever refuses to
-- RE-DRIVE a queued task — it cannot fail one that is already 'running').
--
-- THE FIX, SCOPED TO EXACTLY THAT GAP. clara.fail_classify(p_task, p_reason, p_op_key) — the
-- fail_invoice_facts shape (0009:2152-2178), audited, op-key idempotent per the 0021/0022
-- house pattern, granted to clara_runtime alone (the SAME lane that already holds claim +
-- classify_document per classify.mjs's own header: "This worker runs entirely as
-- clara_runtime … NO login-direct dance"). This migration adds one verb, registers the one
-- event type it needs to emit honestly, and — because the new verb opens a race the lane did
-- not previously have to defend against — CoRs classify_document with a single, minimal,
-- task-bound guard (§A2 below) closing it. Everything else in the classify lane is
-- byte-identical (tail-asserted).
--
-- WHY NOT A fail_invoice_facts CoR (widen the lane check instead of a new fn). Two different
-- lanes with two different resource shapes. fail_invoice_facts refunds an Azure page-budget
-- processing-call reservation (0009:2172, `_refund_processing_call`) — classify tasks reserve
-- NO processing call (grep across packages/db/migrations: `_reserve_processing_call` is called
-- only for lane='invoice_facts'; classify.mjs's own header confirms "a local, no-egress LLM
-- read", no budget line at all). A shared body would either skip the refund conditionally
-- (silently untested for the classify branch) or carry a refund call that always no-ops for
-- classify — either way a reader can no longer tell what the function actually does for the
-- lane in front of them. Two small, honest bodies beat one branchy one.
--
-- WHY THE OP-KEY IS REQUIRED, AND WHY IT IS CHECKED BEFORE THE TASK-STATE SHORTCUT. Every
-- audited writer in this repo either takes one or explains why not (0004 header).
-- fail_classify takes one so a retried call under the SAME op_key replays the STORED receipt
-- byte-identically (`_reserve_op`/`_finish_op`, the 0022 house pattern) rather than
-- re-deriving a fresh-looking answer. That only holds if the op_key reservation runs BEFORE
-- the task-state shortcut below: an earlier draft checked task-state first, which meant a
-- SECOND call under the identical op_key (task already 'failed' from the first) took the
-- shortcut branch instead of the stored-receipt branch and came back with an extra
-- `replayed:true` the first call's receipt never had — same op_key, two different answers,
-- which is exactly what op-key idempotency exists to prevent. Ordering the reservation first
-- makes a same-key replay return the identical stored jsonb, no exceptions.
--
-- The task-STATE shortcut still exists, deliberately, for a DIFFERENT op_key on an
-- already-failed task: classify.mjs's own stranded-requeue/backoff idiom mints a FRESH op_key
-- per attempt (`${lane}-stranded:${id}:${randomUUID()}`, classify.mjs L200), so a caller that
-- lost the ack and retries under a NEW key must not hit a CLR16 raise on a task this verb
-- already terminated — mirroring fail_invoice_facts's replay (0009:2160-2163), reached here
-- only once a FRESH op_key has cleared its own reservation, so that key's own retry still
-- replays byte-identically too (it goes through `_finish_op` like every other path).
--
-- REASON VOCABULARY, DELIBERATELY NARROWER THAN fail_invoice_facts'S. The shared
-- error_code CHECK (0016:160-163, ck_processing_task_error_code_0016) already lists every
-- value this verb needs — engine_error, timeout, attempt_cap, internal — so NO ALTER TABLE
-- rides this migration. fail_invoice_facts additionally accepts storage_error / corrupt /
-- encrypted / bad_type / limit / budget: all OCR-file-shaped or Azure-budget-shaped reasons
-- that cannot occur on the classify lane (classify reads already-extracted text out of
-- clara.document_regions; it touches no file storage, no encryption, and no page budget).
-- Admitting them here would let a caller stamp a classify task 'failed' with an error_code
-- that lies about what kind of task it is.
--
-- WHAT THIS DOES NOT DO. classify_document's CoR (§A2) touches ONLY its task-settle read —
-- every guard, the kind vocabulary, the human-precedence rule, the low-confidence review
-- lane, and the verdict/audit/event shape are byte-identical to 0016 (tail-asserted). No
-- change at all to set_document_kind, persist_document_extraction, claim_document_processing_task,
-- or the classify-lane CHECK constraints. No wiring of packages/runtime/lib/classify.mjs to
-- CALL fail_classify: that is a runtime-side change with its own review surface (when to call
-- it — a bounded retry count on a RUNNING task, distinct from discoverQueued's existing
-- queued-side cap) and is deliberately left to the caller who owns that file. This migration's
-- job is to make the DB terminal state reachable AND race-safe; today it is not reachable by
-- ANY caller, machine or human.

-- =====================================================================
-- §A — clara.fail_classify
-- =====================================================================
create function clara.fail_classify(p_task uuid, p_reason text, p_op_key text default null)
    returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; v_dedupe jsonb; v_code text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into t from clara.document_processing_tasks where id = p_task for update;
  if not found or t.lane <> 'classify' then
    raise exception 'classify task not found' using errcode = 'CLR16';
  end if;
  -- 'failed' is admitted PAST this guard on purpose — it is the task-state shortcut's
  -- entry condition below, reached only once the op_key reservation (next) has cleared.
  -- Every OTHER non-running state (queued, held_egress, done) is refused here.
  if t.status not in ('running', 'failed') then
    raise exception 'classify task is not running' using errcode = 'CLR16';
  end if;

  -- op_key reservation FIRST — see the header on why this must precede the task-state
  -- shortcut: it is what makes a same-key replay return the byte-identical stored receipt.
  v_dedupe := clara._reserve_op(t.firm_id, 'fail_classify', p_op_key,
    clara._hash(jsonb_build_object('task', p_task, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Task-STATE idempotency, reached only for a FRESH op_key (mirrors fail_invoice_facts,
  -- 0009:2160-2163): an already-failed task returns its honest terminal state — the
  -- ORIGINAL error_code, never this call's p_reason — rather than re-running the update.
  -- Still durable under THIS op_key via _finish_op, so its own replay is also exact.
  if t.status = 'failed' then
    return clara._finish_op(t.firm_id, 'fail_classify', p_op_key,
      jsonb_build_object('task_id', p_task, 'status', 'failed',
        'reason', t.error_code, 'replayed', true));
  end if;

  -- Deliberately narrower than fail_invoice_facts's vocabulary — see the header. Every
  -- value here is already admitted by ck_processing_task_error_code_0016; an
  -- unrecognized reason defaults to 'engine_error' rather than raising, so a caller that
  -- passes an OCR/Azure-shaped reason by mistake gets an honest classify-shaped code
  -- back instead of a payload that lies about the task it describes.
  v_code := case when p_reason in ('engine_error', 'timeout', 'attempt_cap', 'internal')
    then p_reason else 'engine_error' end;
  update clara.document_processing_tasks set status = 'failed', error_code = v_code,
    finished_at = now() where id = p_task;

  perform clara._audit(t.firm_id, null, null, null, 'fail_classify', null,
    jsonb_build_object('task', p_task, 'document', t.document_id, 'reason', v_code,
      'op_key', p_op_key));
  perform clara._append_event(t.firm_id, 'document.classify_failed', null, null, null, null,
    null, t.document_id, null, jsonb_build_object('task_id', p_task, 'reason', v_code));

  return clara._finish_op(t.firm_id, 'fail_classify', p_op_key,
    jsonb_build_object('task_id', p_task, 'status', 'failed', 'reason', v_code));
end $$;

alter function clara.fail_classify(uuid, text, text) owner to clara_fn_owner;
revoke all on function clara.fail_classify(uuid, text, text) from public;
grant execute on function clara.fail_classify(uuid, text, text) to clara_runtime;

-- =====================================================================
-- §A1b — Q1 (cross-model review, 4th round): P2's run-token binding is NOT claim-owner
-- binding. clara_runtime holds table-wide SELECT on document_processing_tasks, USING(true)
-- (0008_runtime_read_surface.sql:49,54 — RLS is deliberately NOT the tenant boundary for
-- this role, per that migration's own header). workflow_run_id is therefore READABLE by
-- ANY clara_runtime session, not just the one that claimed the task: a confused (or
-- malicious) session can `select workflow_run_id from document_processing_tasks where
-- id=<a task it never claimed>`, then present that exact value back to classify_document's
-- p_run and settle someone else's claim with an ARBITRARY verdict. Reproduced live before
-- this fix: a second session read the run token off the table and classify_document
-- accepted it, stamping document_kind from a verdict the claimant never produced.
--
-- THE FIX: the claim mints a CAPABILITY, not just an identifier. claim_document_processing_
-- task generates a random secret (gen_random_uuid() — the same CSPRNG source already used
-- pervasively in this codebase for ids/tokens; no new extension), stores ONLY its sha256
-- digest on the task row (new column, claim_secret_digest — never the secret itself), and
-- returns the PREIMAGE to the claiming session as a function result, ONLY on a fresh
-- queued->running transition (never on the held_egress or replay-branch returns — see
-- below for why). classify_document's task-bound settle (§A2, amended again below) now
-- takes p_claim_secret (a new REQUIRED arg, same P1 arity discipline: no default, so a
-- 7-arg call fails to RESOLVE at all rather than silently degrading) and verifies
-- sha256(p_claim_secret) = t.claim_secret_digest in-txn. p_run is KEPT — it remains useful
-- for identity/audit (which attempt this was) — but the secret is the sole AUTHORIZATION;
-- a caller that merely reads the run id off the table can never reconstruct the secret,
-- because the secret itself is never stored anywhere readable.
--
-- WHY NOT MAKE p_run ITSELF THE SECRET (column-level SELECT revocation instead)? Rejected:
-- brittle against a `select *` reader (a single missed column-list update anywhere
-- reopens the hole), and workflow_run_id is semantically an IDENTIFIER (it appears in
-- audit trails, logs, and the claim receipt's own 'replayed' branch) — conflating "the
-- thing that names this attempt" with "the thing that authorizes settling it" is the wrong
-- shape even before considering the grant surface.
--
-- WHY THE SECRET IS NEVER RE-ISSUED ON REPLAY. The pre-existing replay branch
-- (`t.status='running' and t.workflow_run_id=p_workflow_run_id`) exists for a caller whose
-- OWN prior claim call committed but whose response was lost (e.g. a dropped connection) —
-- and crucially, p_workflow_run_id is a value ONLY that caller could have originated
-- (it self-generates it before ever calling), UNLESS an attacker read it off the table,
-- which is exactly the threat this fix closes. If the replay branch also re-issued the
-- secret, an attacker who merely read (task_id, workflow_run_id) off the table could
-- replay-claim and fish the secret back out through that exact same door — reopening Q1
-- one branch over. So the replay branch's response shape is UNCHANGED (no secret field):
-- a genuine lost-response retry for the classify lane self-heals via the EXISTING
-- stranded-requeue path (classify.mjs's own header/design — a crashed or lost-response
-- attempt is recovered by requeue_stranded_document_task minting a FRESH task/run/secret
-- on the next cycle, never by resurrecting the old claim), so no caller anywhere legitimately
-- depends on the replay branch returning a secret. This is unconditional for EVERY lane
-- (not classify-specific) — a single shared claim/capability primitive is simpler and more
-- auditable than a lane-conditional one, even though only classify's settle checks it today.
--
-- claim_document_processing_task is a member of migration 0020's §6 legacy byte-identity
-- CLOSED SET (contract amendment, this the closed set's THIRD deliberately-changed member —
-- A7 was record_wiki_source_ingest, A9 was _enqueue_invoice_facts_core in 0025). Read via
-- pg_get_functiondef against a 24-migration database — the live body already carries 0011's
-- egress-hold lease-check machinery (kill_switch/no_consent/partial_consent), which 0009's
-- own file text does NOT show — hand-copying from any single migration file would have
-- silently reverted that. wb-0020-legacy.test.mjs's restore() is amended to reverse this
-- edit too (A10) alongside the untouched original pins.
-- =====================================================================
alter table clara.document_processing_tasks add column claim_secret_digest bytea;

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

  -- The lease check precedes EVERY dispatching branch. Only the two EGRESSING lanes
  -- (ocr, invoice_facts) are kill-switch-gated; invoice_facts additionally requires
  -- every active filing client to hold a live consent. Local lanes never hold.
  if t.lane in ('ocr','invoice_facts')
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
  if t.lane='invoice_facts' then
    select coalesce(sum(attempt_count),0)::int into v_attempts
      from clara.document_processing_tasks where document_id=t.document_id
        and lane='invoice_facts';
    if v_attempts>=3 then
      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',
        finished_at=now() where id=p_task;
      perform clara._refund_processing_call(p_task,'attempt_cap');
      perform clara._append_event(t.firm_id,'document.invoice_facts_failed',null,null,null,null,
        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));
      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');
    end if;
  end if;
  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;
  select count(*)::int into v_running from clara.document_processing_tasks
    where firm_id=t.firm_id and lane in ('ocr','invoice_facts') and status='running';
  if t.lane in ('ocr','invoice_facts') and v_running>=v_cap then
    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';
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

-- =====================================================================
-- §A2 — clara.classify_document: DROP + RECREATE at a NEW arity. THE RACE THIS VERB
-- OPENS, CLOSED — TASK-BOUND AND ACTOR-BOUND, not recency-bound.
--
-- fail_classify above is a NEW way to move a classify task out from under a caller who
-- is mid-flight toward classify_document. Two prior drafts of this fix are recorded in
-- the commit history and both were found unsound by cross-model review:
--   ROUND 1 locked the MOST RECENT classify task for (document, engine) and branched on
--     its status. Unsound: a STALE call — the tail end of an attempt whose task already
--     went terminal — cannot tell "the newest task for this document" apart from "the
--     task MY claim actually produced this verdict for" (T1 fails, T2 enqueues, T1's late
--     call resolves "most recent" to T2 and corrupts it).
--   ROUND 2 (this migration's first shape) bound the settle to an EXPLICIT p_task — but
--     with `default null`, an OLD 5-arg CALL SHAPE still resolves against the new 6-arg
--     function (Postgres completes trailing defaulted parameters), silently taking the
--     unprotected null-task path. Any caller not yet updated to pass p_task — including
--     a live runtime image mid-deploy — reopens round 1's exact race with zero warning.
--     Separately: nothing verified p_task was the CALLER'S OWN claim, only that the id
--     resolved to a task row matching document/engine — clara_runtime is a GROUP role
--     (0008 grants it broad reads on document_processing_tasks), so a confused actor
--     (not necessarily adversarial) presenting a task id it read but never claimed could
--     settle someone else's in-flight claim.
--
-- THE FIX, ROUND 3 (P1-P3 of the confirmed cross-model review):
--   (P1) p_task and p_run (below) carry NO DEFAULT. A 5-arg call no longer RESOLVES at
--     all (42883 undefined function) — a true arity break, not a silently-completable
--     one. The explicit-NULL no-task ceremony (still legitimate — WA21-R11) is DB-
--     enforced to its REAL precondition: the document must carry NO classify-task
--     history whatsoever (any status, any engine, any version) — "task-less documents
--     only", not merely "no task currently running". A document with ANY task history
--     must go through the task-bound path; there is no path left that can silently
--     re-verdict a document mid-flight.
--   (P2) classify_document now ALSO takes p_run — the workflow_run_id the caller's OWN
--     claim wrote to the task row (claim_document_processing_task, 0009:2229-2231: the
--     SAME field classify.mjs already generates fresh per claim attempt as
--     `classify:${taskId}:${randomUUID()}` and threads through the claim call). The
--     task-bound settle now requires id/document/lane/engine to match AND
--     t.workflow_run_id = p_run — proving the caller is presenting the SAME claim token
--     it minted when it claimed the task, which only the actual claimant can possess.
--     This makes "the caller's own task" DB-enforced, not comment-enforced: a confused
--     actor holding a task id but not its run token cannot settle it.
--   (P3) the op-key request hash used to unconditionally include 'task' (and now 'run')
--     — which meant a PRE-0024 op_key (recorded under the OLD 5-key hash shape) would
--     replay as CLR10 "reused with different args" instead of its stored receipt. The
--     hash is now SHAPE-CONDITIONAL: the null-task path hashes with the EXACT pre-0024
--     4-key shape (document/kind/confidence/engine, no task, no run); only a task-bound
--     call's hash gains the task+run keys. A historical op_key still replays byte-
--     identically regardless of which shape (the old function or this one) is asked.
--
-- This remains an ARITY change (5 args -> 7), so `create or replace` cannot do it — DROP
-- the 5-arg function, CREATE the 7-arg one (0019:349 is the house precedent for a
-- function-identity change via DROP); owner/grants re-established below, since DROP
-- removes them.
--
-- WHY THIS CLOSES THE RACE COMPLETELY. With p_task+p_run bound, T1's late-arriving call
-- can ONLY ever examine and lock T1's own row (by id) AND only succeeds if its run token
-- matches T1's actual claim — T2's existence, and any other actor's task id, are
-- structurally irrelevant to it. Both lock orders on THAT row still serialize against
-- fail_classify exactly as the single-task analysis already proved:
--   fail_classify first  -> commits T1 'failed' -> classify_document(p_task=T1)'s lock
--     blocks, then sees 'failed' post-commit -> refuses. T2 (if it exists) is never read.
--   classify_document(p_task=T1) first -> settles T1 'done', writes the verdict, commits
--     -> fail_classify(T1)'s lock blocks, then sees 'done' post-commit -> its own existing
--     guard (`status not in ('running','failed')`) refuses with CLR16, unchanged.
-- Neither function ever locks `clara.documents` AND `document_processing_tasks` in
-- opposite orders relative to the other (fail_classify never touches `documents` at all),
-- so this closes the race without opening a new lock-order deadlock between the two.
--
-- THE FIX, ROUND 4 (Q1). P2 above proved "the caller's own task" — id/document/lane/engine
-- plus a matching workflow_run_id. That is NOT proof the caller is the task's actual
-- claimant: clara_runtime holds table-wide SELECT on document_processing_tasks, USING(true)
-- (0008_runtime_read_surface.sql:49,54 — RLS is deliberately not this role's tenant
-- boundary), so workflow_run_id is READABLE, not secret. Reproduced live: a second session
-- read the run token off the table and settled the first session's claim with an arbitrary
-- verdict. Fix (§A1b above has the full design): classify_document now ALSO takes
-- p_claim_secret — again NO DEFAULT (same P1 arity discipline: a 7-arg call fails to
-- resolve, 42883) — and the task-bound settle additionally requires
-- sha256(p_claim_secret) = t.claim_secret_digest, the digest claim_document_processing_task
-- stored at claim time. p_run stays as identity/audit; the secret is the sole
-- authorization — reading the table now yields nothing an attacker can turn into a settle,
-- because the preimage itself is never stored anywhere readable.
--
-- Another ARITY change (this migration's own CREATE, round over round, has produced 6, then
-- 7, now 8 args) — but the DROP always targets 0016's ORIGINAL 5-arg signature, never the
-- previous round's: this whole DROP+CREATE pair runs ONCE, in-place, against a freshly
-- migrated 0001-0023 target where classify_document is STILL 0016's untouched 5-arg
-- original (0024 is what first changes it, on every fresh apply) — each round's edit only
-- ever changes what the CREATE produces, in this SAME textual block; the DROP's target
-- never moves. (Self-caught: an earlier draft of this exact edit changed the DROP to target
-- the prior round's 7-arg signature, which does not exist yet at the point THIS statement
-- runs on a fresh apply — reproduced live as a migration failure before landing this fix.)
--
-- Everything else in this body is byte-identical to 0016 (tail-asserted).
drop function clara.classify_document(uuid,text,numeric,text,text);
create function clara.classify_document(p_document uuid, p_kind text,
    p_confidence numeric, p_engine_id text, p_op_key text, p_task uuid, p_run text,
    p_claim_secret text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  d record; t record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
  f record; v_q uuid; v_questions jsonb:='[]'::jsonb; v_set boolean:=false;
  v_human boolean:=false;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- ADV-R4#6: the document row is LOCKED for the whole verdict write — the two
  -- classification writers serialize instead of racing on the kind.
  select * into d from clara.documents where id=p_document for update;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  if p_engine_id is null or p_engine_id not like 'clara-classify-%' then
    raise exception 'classifier engine must carry the clara-classify- prefix' using errcode='CLR10';
  end if;
  -- ADV-R5: the human attestation engine ID is RESERVED for set_document_kind —
  -- a classifier caller may never mint a human-looking verdict row.
  if p_engine_id='clara-classify-human:v1' then
    raise exception 'the human attestation engine id is reserved for set_document_kind'
      using errcode='CLR10',detail='{"reason":"reserved_engine"}';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>1 then
    raise exception 'classifier confidence is malformed' using errcode='CLR10';
  end if;
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','prior_gl','other') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  -- 0014: consent evidence is a legal artifact owned by the egress-consent path;
  -- the classifier may neither assign nor overwrite it.
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  -- P3: the request hash is SHAPE-CONDITIONAL — the null-task path hashes with the
  -- EXACT pre-0024 4-key shape so a historical op_key still replays byte-identically;
  -- only a task-bound call's hash gains the task+run identity (so reusing an op_key
  -- under a DIFFERENT task/run is an honest CLR10, not a silently-ignored argument).
  v_dedupe:=clara._reserve_op(d.firm_id,'classify_document',p_op_key,
    case when p_task is null then
      clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
        'confidence',p_confidence,'engine',p_engine_id))
    else
      clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
        'confidence',p_confidence,'engine',p_engine_id,'task',p_task,'run',p_run))
    end);
  if v_dedupe is not null then return v_dedupe; end if;

  if p_task is not null then
    -- P2: TASK- AND RUN-BOUND — id/document/lane/engine locate a candidate row, and
    -- t.workflow_run_id must match the identity the caller's OWN claim wrote to it
    -- (claim_document_processing_task, 0009:2229-2231). Q1: run-token identity alone is
    -- NOT authorization — clara_runtime holds table-wide SELECT on this table (0008), so
    -- workflow_run_id is readable by any session, not just the claimant. The settle
    -- additionally requires sha256(p_claim_secret) = t.claim_secret_digest — the digest of
    -- the CAPABILITY claim_document_processing_task minted and returned ONLY to the
    -- claiming session at claim time, never stored anywhere in preimage form. A caller
    -- that read the run id off the table cannot reconstruct this.
    select * into t from clara.document_processing_tasks
      where id=p_task and document_id=p_document and lane='classify' and engine_id=p_engine_id
      for update;
    if not found then
      raise exception 'classify task not found for this document/engine' using errcode='CLR16';
    end if;
    if t.status='running' and t.workflow_run_id=p_run
       and t.claim_secret_digest=sha256(convert_to(coalesce(p_claim_secret,''),'UTF8')) then
      update clara.document_processing_tasks set status='done',finished_at=now()
        where id=t.id;
    else
      raise exception 'this classify task is not running under the caller''s own claim — it already settled, a newer attempt exists, the run token does not match, or the claim secret is wrong'
        using errcode='CLR16';
    end if;
  else
    -- P1: NO-TASK CEREMONY (WA21-R11) — its REAL precondition, DB-enforced: the document
    -- must carry NO classify-task history AT ALL (any status, any engine, any version).
    -- A document with ANY task history must go through the task-bound path above; there
    -- is nothing left for this path to settle, so it proceeds straight to the verdict.
    if exists(select 1 from clara.document_processing_tasks
        where document_id=p_document and lane='classify') then
      raise exception 'classify task history exists for this document — the no-task ceremony requires a task-free document'
        using errcode='CLR16';
    end if;
  end if;

  -- the verdict row: engine_kind='doc_classify', NO regions (the verdict rides
  -- the envelope — nothing here can ever collide with an attribution pattern).
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id=p_engine_id;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(d.firm_id,p_document,p_engine_id,'doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',p_confidence,
        'low_confidence',p_confidence<0.8,'source','classifier'))
    returning id into v_ext;

  v_prior:=d.document_kind;
  -- ADV-R4#6 / ADV-R5: a HUMAN verdict (set_document_kind) is never overwritten
  -- by the classifier — the classifier's verdict ROW persists above, but the
  -- kind and the classified event stay with the human correction. Precedence is
  -- detected by the row's SOURCE MARKER (envelope source='human', written only
  -- by set_document_kind), never by an engine-id string a caller could supply.
  v_human:=exists(select 1 from clara.document_extractions hx
    where hx.document_id=p_document and hx.engine_kind='doc_classify'
      and hx.status='done' and hx.envelope->>'source'='human');
  if p_confidence>=0.8 and not v_human then
    update clara.documents set document_kind=p_kind where id=p_document;
    v_set:=true;
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,'op_key',p_op_key));
    perform clara._append_event(d.firm_id,'document.classified',null,null,null,null,
      null,p_document,null,
      jsonb_build_object('document_kind',p_kind,'confidence',p_confidence,
        'engine_id',p_engine_id,'extraction_id',v_ext,'prior_kind',v_prior,
        'source','classifier'));
  elsif v_human then
    -- human precedence: the verdict ROW persisted above; the kind, the
    -- classified event, and the review lane all stay with the human correction.
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,
        'human_precedence',true,'op_key',p_op_key));
  else
    for f in select df.client_id,df.id as filing_id from clara.document_filings df
        join clara.clients oc on oc.id=df.client_id and oc.status='active'
        where df.document_id=p_document and df.retired_at is null loop
      if not exists(select 1 from clara.open_questions q
          where q.client_id=f.client_id and q.document_id=p_document
            and q.origin='classification' and q.status='open') then
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,document_id,
            origin,question_text,status,opener_kind,opened_by)
          values(d.firm_id,f.client_id,'document',p_document,p_document,'classification',
            'What kind of document is this? The classifier was not confident ('
              ||round(p_confidence*100)::text||'%; best guess: '||p_kind||').',
            'open','wake',null)
          returning id into v_q;
        v_questions:=v_questions||to_jsonb(v_q);
        perform clara._append_event(d.firm_id,'open_question.opened',f.client_id,null,null,null,
          null,p_document,null,
          jsonb_build_object('question_id',v_q,'origin','classification'));
      end if;
    end loop;
    perform clara._audit(d.firm_id,null,null,null,'classify_document',null,
      jsonb_build_object('document',p_document,'kind',p_kind,'confidence',p_confidence,
        'engine',p_engine_id,'prior_kind',v_prior,'extraction',v_ext,
        'low_confidence',true,'questions',v_questions,'op_key',p_op_key));
  end if;
  return clara._finish_op(d.firm_id,'classify_document',p_op_key,
    jsonb_build_object('document_id',p_document,'extraction_id',v_ext,
      'document_kind',case when v_set then p_kind else v_prior end,
      'kind_set',v_set,'confidence',p_confidence,'questions',v_questions));
end $$;

-- DROP removed the function's owner/ACL along with it — re-established exactly as 0016
-- originally set them (clara_runtime only; the sole caller is the classify worker).
alter function clara.classify_document(uuid,text,numeric,text,text,uuid,text,text) owner to clara_fn_owner;
revoke all on function clara.classify_document(uuid,text,numeric,text,text,uuid,text,text) from public;
grant execute on function clara.classify_document(uuid,text,numeric,text,text,uuid,text,text) to clara_runtime;

-- =====================================================================
-- §B — EVENT TAXONOMY (one additive pair against the active version).
--
-- 'ignore' — the SAME decision as document.invoice_facts_failed / document.extraction_failed:
-- an honest terminal fact, no router wake. The DB terminal state is the receipt; nothing
-- downstream is designed to react to a classify failure, and nothing here manufactures a
-- consumer for it.
-- =====================================================================
with added(name, client_scoped, description, decision, note) as (values
  ('document.classify_failed', true, 'Document classification failed honestly', 'ignore',
    'honest terminal fact, no router wake — mirrors document.invoice_facts_failed (0009)')
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note
from added x
join inserted_types i on i.name = x.name
cross join clara.taxonomy_active a;

-- ---------------------------------------------------------------------------
-- §TAIL — in-transaction assertions. The apply proves them or rolls back whole.
--
-- THE HONEST FRAMING (carried from 0022/0023): these are BELT. The primary instrument is
-- BEHAVIOURAL — the rig drives a real claimed task through fail_classify and checks the real
-- terminal state, the real replay, and the real refusal shapes. These probes exist so an
-- APPLY onto a drifted catalog refuses, not to stand in for the cells.
-- ---------------------------------------------------------------------------
do $tail$
declare
  v_acl text; v_cfg text; v_role text; v_src text; v_code text;
  v_sig constant text := 'clara.fail_classify(uuid,text,text)';
  v_sig2 constant text := 'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)';
  v_sig3 constant text := 'clara.claim_document_processing_task(uuid,text,boolean)';
begin
  -- (1) The new verb exists at its exact signature and carries the whole definer posture.
  if to_regprocedure(v_sig) is null then
    raise exception '0024 tail: % is absent at its exact signature', v_sig;
  end if;
  select coalesce(array_to_string(p.proconfig, ','), '') into v_cfg
    from pg_proc p where p.oid = v_sig::regprocedure;
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception '0024 tail: % has no pinned search_path (%)', v_sig, v_cfg;
  end if;
  if not (select prosecdef from pg_proc where oid = v_sig::regprocedure) then
    raise exception '0024 tail: % is not SECURITY DEFINER', v_sig;
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0024 tail: % is not owned by clara_fn_owner', v_sig;
  end if;

  -- (2) MACHINE-LANE-ONLY, as a WHITELIST (the 0022 discipline, mirrored the other
  -- direction): only clara_fn_owner (the definer's owner) and clara_runtime may appear in
  -- the ACL; anything else — PUBLIC, a human role, a wake role, a different machine role —
  -- is NAMED in the failure rather than passing a blacklist that cannot see it.
  select coalesce(string_agg(g, ', ' order by g), '') into v_acl
    from (select case when a.grantee = 0 then 'PUBLIC'
                      else pg_get_userbyid(a.grantee) end as g
            from pg_proc p, lateral aclexplode(p.proacl) a
           where p.oid = v_sig::regprocedure
             and a.privilege_type = 'EXECUTE'
             and (a.grantee = 0
                  or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))
         ) s;
  if v_acl <> '' then
    raise exception '0024 tail: % has unexpected EXECUTE grantee(s): % (only clara_fn_owner + clara_runtime may hold it)',
      v_sig, v_acl;
  end if;
  if not exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
                  where p.oid = v_sig::regprocedure and a.privilege_type = 'EXECUTE'
                    and pg_get_userbyid(a.grantee) = 'clara_runtime') then
    raise exception '0024 tail: % never actually reached clara_runtime — the grant is vacuous', v_sig;
  end if;

  -- …and the EFFECTIVE privilege for every OTHER lane, roles resolved through to_regrole and
  -- ABSENT ones skipped (they do not exist on every database) — never fail open on a missing
  -- role. This is the machine-role mirror of 0022's human-only proof: a poisoned classify
  -- task must be fail-able ONLY by the lane that already claims + settles it.
  foreach v_role in array array['clara_authenticated', 'clara_agent_ro',
      'clara_wake_interactive', 'clara_wake_proactive',
      'clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login'] loop
    if to_regrole(v_role) is null then continue; end if;
    if has_function_privilege(v_role, v_sig, 'execute') then
      raise exception '0024 tail: % holds EFFECTIVE EXECUTE on % — this verb is clara_runtime-only',
        v_role, v_sig;
    end if;
  end loop;

  if exists (select 1 from clara.wake_fn_allowlist where function_name = 'fail_classify') then
    raise exception '0024 tail: fail_classify leaked into the wake allowlist — it is driven by the classify consumer loop, never a wake';
  end if;

  -- (3) The event pair is registered AND in the ACTIVE taxonomy version.
  if not exists (select 1 from clara.event_types where name = 'document.classify_failed')
     or not exists (select 1 from clara.trigger_taxonomy t join clara.taxonomy_active a
        on a.version = t.version and a.singleton where t.event_type = 'document.classify_failed') then
    raise exception '0024 tail: document.classify_failed taxonomy pair assertion failed';
  end if;

  -- (4) NOTHING ELSE MOVED. The generic terminal writer's classify-lane refusal is
  -- byte-identical to 0016.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,int,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_src is null or position('classify tasks are settled by classify_document' in v_src) = 0 then
    raise exception '0024 tail: persist_document_extraction lost its classify-lane refusal — fail_classify is meant to be the ONLY other terminal writer for this lane, not a replacement for the refusal';
  end if;

  -- (5) classify_document — the TASK-BOUND RACE GUARD is present in EXECUTABLE TEXT (both
  -- comment forms stripped, whitespace normalised, the 0022/0023 discipline: a probe that
  -- cannot tell code from a comment about code proves nothing). This is BELT — the primary
  -- proof is behavioural (x-fail-classify.test.mjs's two-session lock-order cells) — but an
  -- apply onto a drifted catalog must still refuse here.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig2::regprocedure;
  if v_src is null then
    raise exception '0024 tail: classify_document is GONE';
  end if;
  -- The DROP+CREATE re-establishes the whole definer posture — assert it explicitly rather
  -- than assuming the CREATE statement's own clauses took effect.
  select coalesce(array_to_string(p.proconfig, ','), '') into v_cfg
    from pg_proc p where p.oid = v_sig2::regprocedure;
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception '0024 tail: % has no pinned search_path (%)', v_sig2, v_cfg;
  end if;
  if not (select prosecdef from pg_proc where oid = v_sig2::regprocedure) then
    raise exception '0024 tail: % is not SECURITY DEFINER', v_sig2;
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig2::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0024 tail: % is not owned by clara_fn_owner', v_sig2;
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  -- The task-bound branch: locates the CALLER'S OWN task by id — document_id and engine_id
  -- still qualify it (a p_task from a different document/engine must not resolve at all),
  -- but there is no ORDER BY / "most recent" anywhere in this branch.
  if position('ifp_taskisnotnullthen' in v_code) = 0 then
    raise exception '0024 tail: classify_document lost the task-bound branch — the race guard requires binding to the CALLER''S task, not recency';
  end if;
  if position('id=p_taskanddocument_id=p_documentandlane=''classify''andengine_id=p_engine_id' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s task-bound lookup no longer locates the caller''s EXACT task';
  end if;
  -- P2: the settle only fires when the run token the caller presents MATCHES the token its
  -- own claim wrote to the task row — never status alone.
  if position('t.status=''running''andt.workflow_run_id=p_run' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s task-bound branch lost the run-token-bound running check (P2)';
  end if;
  if position('runtokendoesnotmatch' in lower(v_code)) = 0 then
    raise exception '0024 tail: classify_document lost the honest refusal naming a run-token mismatch (P2)';
  end if;
  -- Q1: run-token identity is not authorization — the settle ALSO requires the CAPABILITY
  -- (sha256 of the caller's claim secret) to match the digest the claim minted. Fused to
  -- the SAME conjunction as the run-token check, not a bare mention elsewhere in the body.
  if position('t.status=''running''andt.workflow_run_id=p_runandt.claim_secret_digest=sha256(convert_to(coalesce(p_claim_secret,''''),''UTF8''))thenupdateclara.document_processing_taskssetstatus=''done''' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s task-bound branch lost the claim-secret-digest check (Q1) — a caller that merely reads the run id off the table could otherwise settle another session''s claim';
  end if;
  if position('claimsecretiswrong' in lower(v_code)) = 0 then
    raise exception '0024 tail: classify_document lost the honest refusal naming a wrong claim secret (Q1)';
  end if;
  -- P1: the no-task ceremony branch (WA21-R11) is DB-enforced to its REAL precondition — the
  -- document carries NO classify-task history AT ALL (any status, any engine), not merely
  -- "no task currently running". A document with any task history must go through the
  -- task-bound branch above.
  if position('ifexists(select1fromclara.document_processing_taskswheredocument_id=p_documentandlane=''classify'')then' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s no-task ceremony path lost the task-history existence guard (P1) — WA21-R11''s real precondition must be DB-enforced';
  end if;
  -- No trace of the round-1 "most recent regardless of status" design, nor round-2's
  -- "match a running task in the WHERE clause" ceremony shape, survives — both are exactly
  -- what cross-model review found unsound in turn.
  if position('orderbyversion_ndesc' in v_code) > 0 then
    raise exception '0024 tail: classify_document still orders by version_n desc somewhere — the recency-based settle round-2 review rejected is still present';
  end if;
  if position('document_id=p_documentandlane=''classify''andstatus=''running''andengine_id=p_engine_id' in v_code) > 0 then
    raise exception '0024 tail: classify_document''s ceremony path still carries round-2''s "match a running task" shape — P1 requires the stricter no-history guard instead';
  end if;
  -- P3: the op-key request hash is SHAPE-CONDITIONAL — a null-task call hashes with the
  -- EXACT pre-0024 4-key shape (no task/run keys at all), so a historical op_key still
  -- replays byte-identically; only a task-bound call's hash gains the task+run identity.
  if position('casewhenp_taskisnullthenclara._hash(jsonb_build_object(''document'',p_document,''kind'',p_kind,''confidence'',p_confidence,''engine'',p_engine_id))elseclara._hash(jsonb_build_object(''document'',p_document,''kind'',p_kind,''confidence'',p_confidence,''engine'',p_engine_id,''task'',p_task,''run'',p_run))end)' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s op-key hash is no longer shape-conditional on p_task — a pre-0024 op_key would fail to replay byte-identically (P3)';
  end if;
  -- P1 (arity break): p_task and p_run carry NO default — a call short of 7 args must fail
  -- to RESOLVE at all (42883), never silently complete against an unprotected null path.
  if (select pronargdefaults from pg_proc where oid = v_sig2::regprocedure) <> 0 then
    raise exception '0024 tail: classify_document still has default argument(s) — a short call must fail to resolve, not silently take the null-task path (P1)';
  end if;
  -- Everything else this verb has ever guarded is still there — the definer posture, the
  -- kind vocabulary, the human-precedence rule, and the low-confidence review lane.
  if position('classifierenginemustcarrytheclara-classify-prefix' in v_code) = 0
     or position('humanattestationengineidisreservedforset_document_kind' in v_code) = 0
     or position('consent-evidenceclassificationisownedbytheegressconsentpath' in v_code) = 0
     or position('whatkindofdocumentisthis' in lower(v_code)) = 0 then
    raise exception '0024 tail: classify_document lost a retained 0016 guard/lane';
  end if;

  -- (5b) EXACTLY ONE overload survives the DROP + CREATE arity change (the house "no orphan
  -- overloads" discipline) — a partial apply or a re-run that skipped the DROP would leave
  -- two, and the 5-arg one would still be callable with the race this migration exists to
  -- close.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname = 'classify_document') <> 1 then
    raise exception '0024 tail: clara.classify_document has more than one overload — no earlier 5/6/7-arg signature may survive alongside the current 8-arg one';
  end if;

  -- (6) classify_document's ACL is UNCHANGED by the CoR (DROP+CREATE loses owner/grants —
  -- re-established explicitly above — assert the same clara_runtime-only posture
  -- fail_classify carries, both the ACL whitelist and the effective-privilege sweep).
  select coalesce(string_agg(g, ', ' order by g), '') into v_acl
    from (select case when a.grantee = 0 then 'PUBLIC'
                      else pg_get_userbyid(a.grantee) end as g
            from pg_proc p, lateral aclexplode(p.proacl) a
           where p.oid = v_sig2::regprocedure
             and a.privilege_type = 'EXECUTE'
             and (a.grantee = 0
                  or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))
         ) s;
  if v_acl <> '' then
    raise exception '0024 tail: % has unexpected EXECUTE grantee(s) after the CoR: % (only clara_fn_owner + clara_runtime may hold it)',
      v_sig2, v_acl;
  end if;
  foreach v_role in array array['clara_authenticated', 'clara_agent_ro',
      'clara_wake_interactive', 'clara_wake_proactive',
      'clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login'] loop
    if to_regrole(v_role) is null then continue; end if;
    if has_function_privilege(v_role, v_sig2, 'execute') then
      raise exception '0024 tail: % holds EFFECTIVE EXECUTE on % after the CoR — this verb is clara_runtime-only',
        v_role, v_sig2;
    end if;
  end loop;

  -- (7) §A1b — Q1: the capability column exists, claim_document_processing_task mints +
  -- stores it ONLY on a fresh claim (never on the replay or held_egress branches — see the
  -- migration header for why re-issuing on replay would reopen Q1 one branch over), and the
  -- function's definer posture + ACL are unchanged (create-or-replace preserves them; assert
  -- explicitly rather than assume).
  if not exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'document_processing_tasks'
        and column_name = 'claim_secret_digest' and data_type = 'bytea') then
    raise exception '0024 tail: clara.document_processing_tasks.claim_secret_digest is missing or the wrong type (Q1)';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig3::regprocedure;
  if v_src is null then
    raise exception '0024 tail: claim_document_processing_task is GONE';
  end if;
  select coalesce(array_to_string(p.proconfig, ','), '') into v_cfg
    from pg_proc p where p.oid = v_sig3::regprocedure;
  if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
    raise exception '0024 tail: % has no pinned search_path (%)', v_sig3, v_cfg;
  end if;
  if not (select prosecdef from pg_proc where oid = v_sig3::regprocedure) then
    raise exception '0024 tail: % is not SECURITY DEFINER', v_sig3;
  end if;
  if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig3::regprocedure)
     <> 'clara_fn_owner' then
    raise exception '0024 tail: % is not owned by clara_fn_owner', v_sig3;
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  -- The secret is minted and stored in the SAME update as the fresh queued->running
  -- transition — fused to that statement, not a bare mention elsewhere in the body.
  if position('updateclara.document_processing_taskssetstatus=''running'',workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1,claim_secret_digest=sha256(convert_to(v_secret,''UTF8''))whereid=p_task' in v_code) = 0 then
    raise exception '0024 tail: claim_document_processing_task no longer mints+stores the claim-secret digest on the fresh claim transition (Q1)';
  end if;
  if position('v_secret:=gen_random_uuid()::text' in v_code) = 0 then
    raise exception '0024 tail: claim_document_processing_task lost the secret-minting line (Q1)';
  end if;
  -- The secret preimage is returned ONLY from the fresh-claim branch's own jsonb — the
  -- QUOTED jsonb key ''claim_secret'' (distinct from the unquoted column identifier
  -- claim_secret_digest used elsewhere in the body) must appear EXACTLY once: the replay
  -- and held_egress branches' own jsonb_build_object calls must never gain it.
  if (select count(*) from regexp_matches(v_code, '''claim_secret''', 'g')) <> 1 then
    raise exception '0024 tail: claim_document_processing_task''s quoted ''claim_secret'' jsonb key appears % times, not exactly once — it must be returned ONLY on a fresh claim, never on replay (re-issuing it there would let a table-reader fish it back out, reopening Q1)',
      (select count(*) from regexp_matches(v_code, '''claim_secret''', 'g'));
  end if;
  select coalesce(string_agg(g, ', ' order by g), '') into v_acl
    from (select case when a.grantee = 0 then 'PUBLIC'
                      else pg_get_userbyid(a.grantee) end as g
            from pg_proc p, lateral aclexplode(p.proacl) a
           where p.oid = v_sig3::regprocedure
             and a.privilege_type = 'EXECUTE'
             and (a.grantee = 0
                  or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime'))
         ) s;
  if v_acl <> '' then
    raise exception '0024 tail: % has unexpected EXECUTE grantee(s) after the CoR: % (only clara_fn_owner + clara_runtime may hold it)',
      v_sig3, v_acl;
  end if;

  raise notice '0024: fail_classify installed (clara_runtime only); classify_document CoR closes the fail_classify race — the classify lane now has a DB terminal-fail path AND exactly one terminal outcome per attempt; claim_document_processing_task now mints a claim-secret capability (Q1) checked by classify_document''s settle';
end
$tail$;
