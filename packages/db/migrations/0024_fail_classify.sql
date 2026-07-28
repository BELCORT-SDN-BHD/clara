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
-- §A2 — clara.classify_document CoR: THE RACE THIS VERB OPENS, CLOSED.
--
-- fail_classify above is a NEW way to move a classify task out from under a caller who
-- is mid-flight toward classify_document. Before this CoR, classify_document's own
-- task-settle read only ever looked for a RUNNING row (0016:3224-3227) — if
-- fail_classify won the race and the task was already 'failed' by the time
-- classify_document's SELECT ran, `found` was false, and the ORIGINAL body fell straight
-- through to the no-task ceremony path (WA21-R11) and wrote the verdict ANYWAY: kind set,
-- document_extractions row inserted, document.classified emitted. The honest terminal
-- state — the task trail says failed — would then coexist with a document the classifier
-- successfully classified, which is exactly the two-terminal-states-for-one-attempt
-- dishonesty a terminal writer exists to prevent (cross-model review finding on this
-- migration).
--
-- THE FIX, MINIMAL AND TASK-BOUND. The settle read now locks the MOST RECENT classify
-- task for (document, engine) REGARDLESS of status (not only 'running'), and branches on
-- what it finds:
--   running -> settle to done, exactly as before.
--   failed  -> REFUSE. This attempt's task already lost the race; the verdict is not
--     written, the kind is not touched, no document.classified fires. A fresh attempt
--     needs a fresh task (the facts-gate re-enqueue already does this on any non-live
--     status).
--   anything else (no row at all, or the newest row is 'done'/'queued'/'held_egress')
--     -> UNCHANGED behaviour, byte-identical to 0016. This is what keeps WA21-R11's live
--     no-task ceremony (0016:3222-3223; executed 2026-07-23 per the archived ADR) working:
--     those six documents carried NO classify task row at all, so `found` stays false and
--     this CoR does not touch that path.
--
-- WHY LOCKING THE ROW REGARDLESS OF STATUS CLOSES THE RACE, NOT JUST NARROWS IT. Both
-- orderings now serialize on the SAME row lock (fail_classify already took `for update`
-- on the exact task row; this CoR makes classify_document take the same lock on the same
-- row before deciding anything):
--   fail_classify first  -> commits 'failed' -> classify_document's lock blocks, then
--     sees 'failed' post-commit -> refuses. Exactly one terminal event
--     (document.classify_failed), never document.classified.
--   classify_document first -> settles 'done', writes the verdict, commits -> fail_classify's
--     lock blocks, then sees 'done' post-commit -> fail_classify's OWN existing guard
--     (`status not in ('running','failed')`) refuses with CLR16, unchanged. Exactly one
--     terminal event (document.classified), never document.classify_failed.
-- Neither function ever locks `clara.documents` AND `document_processing_tasks` in
-- opposite orders relative to the other (fail_classify never touches `documents` at all),
-- so this closes the race without opening a new lock-order deadlock between the two.
--
-- Everything else in this body is byte-identical to 0016 (tail-asserted).
create or replace function clara.classify_document(p_document uuid, p_kind text,
    p_confidence numeric, p_engine_id text, p_op_key text) returns jsonb
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
  v_dedupe:=clara._reserve_op(d.firm_id,'classify_document',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
      'confidence',p_confidence,'engine',p_engine_id)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- 0024 (race fix): lock the MOST RECENT classify task for (document, engine)
  -- REGARDLESS of status — not only 'running' — so this call serializes against
  -- fail_classify on the SAME row instead of racing it. See the CoR header above.
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane='classify' and engine_id=p_engine_id
    order by version_n desc, id desc limit 1 for update;
  if found and t.status='running' then
    update clara.document_processing_tasks set status='done',finished_at=now()
      where id=t.id;
  elsif found and t.status='failed' then
    raise exception 'the classify task for this document already failed — enqueue a new attempt before classifying again'
      using errcode='CLR16';
  end if;
  -- found=false, or found with any OTHER status (queued/held_egress/done) — UNCHANGED:
  -- falls through to the no-task ceremony path exactly as 0016 wrote it (WA21-R11).

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
  v_sig2 constant text := 'clara.classify_document(uuid,text,numeric,text,text)';
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

  -- (5) classify_document's CoR — the RACE GUARD is present in EXECUTABLE TEXT (both
  -- comment forms stripped, whitespace normalised, the 0022/0023 discipline: a probe that
  -- cannot tell code from a comment about code proves nothing). This is BELT — the primary
  -- proof is behavioural (x-fail-classify.test.mjs's two-session lock-order cells) — but an
  -- apply onto a drifted catalog must still refuse here.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig2::regprocedure;
  if v_src is null then
    raise exception '0024 tail: classify_document is GONE';
  end if;
  v_code := regexp_replace(
              regexp_replace(
                regexp_replace(v_src, '/\*.*?\*/', '', 'gs'),
                '--[^' || chr(10) || ']*', '', 'g'),
              '\s+', '', 'g');
  -- The settle read now locks the MOST RECENT task for (document,engine) regardless of
  -- status — the literal 'status=''running''' must be GONE from the SELECT's WHERE clause
  -- (it survives only in the post-select branch below, checked separately).
  if position('lane=''classify''andengine_id=p_engine_id' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s settle read no longer locks the most-recent classify task for (document,engine) — the race guard requires locking REGARDLESS of status';
  end if;
  if position('orderbyversion_ndesc,iddesclimit1forupdate' in v_code) = 0 then
    raise exception '0024 tail: classify_document''s settle read no longer orders by the newest attempt — it could lock a STALE task row instead of the current one';
  end if;
  if position('foundandt.status=''running''' in v_code) = 0
     or position('foundandt.status=''failed''' in v_code) = 0 then
    raise exception '0024 tail: classify_document lost the running/failed branch split — the race guard requires both';
  end if;
  if position('alreadyfailed' in lower(v_code)) = 0 then
    raise exception '0024 tail: classify_document lost the honest refusal message for a terminally-failed task';
  end if;
  -- Everything else this verb has ever guarded is still there — the definer posture, the
  -- kind vocabulary, the human-precedence rule, and the low-confidence review lane.
  if position('classifierenginemustcarrytheclara-classify-prefix' in v_code) = 0
     or position('humanattestationengineidisreservedforset_document_kind' in v_code) = 0
     or position('consent-evidenceclassificationisownedbytheegressconsentpath' in v_code) = 0
     or position('whatkindofdocumentisthis' in lower(v_code)) = 0 then
    raise exception '0024 tail: classify_document lost a retained 0016 guard/lane';
  end if;

  -- (6) classify_document's ACL is UNCHANGED by the CoR (CREATE OR REPLACE preserves
  -- owner/grants, but a future edit could still widen it — assert the same clara_runtime-only
  -- posture fail_classify carries, both the ACL whitelist and the effective-privilege sweep).
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

  raise notice '0024: fail_classify installed (clara_runtime only); classify_document CoR closes the fail_classify race — the classify lane now has a DB terminal-fail path AND exactly one terminal outcome per attempt';
end
$tail$;
