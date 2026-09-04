-- =====================================================================================
-- DB-A / 5 of 7 -- clara.set_document_kind CLOSES THE QUESTION IT ANSWERS (H-22).
--
-- THE DEFECT. A low-confidence classification opens a clara.open_questions row with
-- origin='classification' and question_text "What kind of document is this? The classifier
-- was not confident (N%; best guess: K)." -- clara.classify_document's low-confidence arm,
-- live at 0123:1917-1935 (the mint also appears at 0016:3277, 0024:534 and 0026:1403; 0123
-- is the last CREATE OR REPLACE). The verb a human uses to ANSWER that question is
-- clara.set_document_kind, live at 0123:1949-2050. That body stamps documents.document_kind,
-- retires now-wrong queued processing tasks, mints a clara-classify-human:v1 doc_classify
-- extraction, audits and appends document.classified -- and touches clara.open_questions
-- NOWHERE. Grepping 0123 for open_questions returns exactly two hits, both inside
-- classify_document's low-confidence arm.
--
-- THE CONSEQUENCE IS NOT COSMETIC. clara._open_question_blocks (0012:88-108) selects every
-- open question for the client excluding ONLY origin='rule_proposal', and
-- clara._coding_lane_core (0015:2358-2489, live at 0031:302) appends 'open_question' to its
-- reasons and sets the HARD flag, pinning the filing at lane='needs_you'. So: the document's
-- kind is correct, the classifier is satisfied, and the filing still reads as blocked --
-- forever, unless the human happens to also find and dismiss the question by hand. They must
-- answer the same question twice, and nothing tells them so.
--
-- RESOLVE, NOT DISMISS -- and the distinction is the whole point. Dismiss records
-- "withdrawn"; resolve records "answered" with a resolution_text. The human DID answer it:
-- they named the kind. Writing it as a dismissal would file a true answer as an abandoned
-- question, and the audit trail would then disagree with what happened.
--
-- WHAT THE VERB AUTHORS, AND WHAT IT DOES NOT. resolution_text here is machine-composed from
-- the kind and the human's own p_reason -- the human typed the reason, the verb only frames
-- it. It never invents a justification the human did not give: p_reason is already REQUIRED
-- and non-blank by this body's own guard, so there is always a human sentence to carry.
--
-- THE SCOPE IS AS NARROW AS THE INTENT:
--   * origin='classification' ONLY. A clarify_promotion or a manual question about the same
--     document is a DIFFERENT question and must survive -- setting a kind does not answer
--     "should we file this to Rome or to Bee?".
--   * status='open' ONLY. A resolved or dismissed row is terminal; the CHECK
--     ck_open_questions_terminal would refuse a re-write anyway, and racing one is not a
--     thing this verb should do.
--   * firm-scoped to the caller's own firm, from the human context this body already built.
--   * the event's client_id comes from THE QUESTION'S OWN ROW, never from a filing lookup:
--     a document can be filed to more than one client and the question is client-scoped, so
--     one document can carry two classification questions and each gets its own event.
--
-- THE EVENT SHAPE IS clara.resolve_open_question's, VERBATIM (0011:2038-2039):
--   _append_event(firm,'open_question.resolved',client,actor,null,null,null,document,null,
--                 jsonb_build_object('question_id',<id>,'status','resolved'))
-- plus a 'source' key naming the door that closed it, so the timeline reads identically
-- whichever door did the closing and a reader can still tell which one that was.
--
-- D1 WRITE-QUIESCE IS OWED. clara.set_document_kind IS an audited writer, and this file
-- replaces its body. PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it
-- STARTED with, so a set_document_kind call that spans the deploy runs the OLD body and
-- leaves its question open. One body, one door, one window: see packages/db/README.md's
-- "Deploy contract".
-- =====================================================================================

-- Precautionary, not load-bearing: one CoR, no data movement and no backfill. Questions left
-- open by past calls are NOT retro-resolved here -- backfilling somebody else's answer is a
-- claim about what a human meant, and this file does not make it.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE
-- =====================================================================================
do $dba5_pre$
declare v_src text; v_got text; v_n int;
begin
  if to_regprocedure('clara.set_document_kind(uuid,text,text,text)') is null then
    raise exception 'dba5 prestate: clara.set_document_kind does not resolve' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  v_got := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  -- Measured on a full 0001->0164 rig replay while authoring this file (DB-A lane,
  -- 2026-09-04), against 0123:1949's body -- the last of the three CoRs (0016:3308,
  -- 0026:1439, 0123:1949).
  if v_got <> '611bc5433a9dc6ebd5d18c95e13cb58b5546a8d8c4bb29ceabfcbc278f3da3f7' then
    raise exception 'dba5 prestate: set_document_kind prosrc sha256 is % -- not the 0123 body this file was authored against. STOP.', v_got
      using errcode = 'CLR10';
  end if;
  if position('open_questions' in v_src) <> 0 then
    raise exception 'dba5 prestate: set_document_kind already references open_questions -- already applied to this database'
      using errcode = 'CLR10';
  end if;
  -- THE FIVE THINGS THIS FILE PROMISES TO CARRY UNCHANGED, witnessed in the live body before
  -- it is replaced. The F-A3/PR-1b lesson: a "verbatim" claim is only as good as the text it
  -- was read from.
  if position('agent identity cannot set a document kind' in v_src) = 0
     or position('consent-evidence classification is owned by the egress consent path' in v_src) = 0
     or position('clara._bank_live_statement_on_document(p_document)' in v_src) = 0
     or position('clara-classify-human:v1' in v_src) = 0
     or position('skipped_kind' in v_src) = 0 then
    raise exception 'dba5 prestate: the live set_document_kind is missing one of the five guards this file carries verbatim (agent wall / CLR28 consent wall / live-statement pin / human extraction / re-kind task retirement)'
      using errcode = 'CLR10';
  end if;

  -- THE QUESTION THIS VERB WILL CLOSE MUST BE THE ONE classify_document OPENS.
  -- origin='classification' is admitted by the live CHECK (0121:287-290 widened it) -- if it
  -- were not, no such row could exist and this whole file would be closing nothing.
  select count(*)::int into v_n from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'open_questions' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%''classification''%';
  if v_n < 1 then
    raise exception 'dba5 prestate: no CHECK on clara.open_questions admits origin=''classification'' -- the question this verb would close cannot exist'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)'::regprocedure;
  if position('''classification''' in v_src) = 0 then
    raise exception 'dba5 prestate: the live clara.classify_document does not mint an origin=''classification'' question -- this file would close a question nothing opens'
      using errcode = 'CLR10';
  end if;
  raise notice 'dba5 prestate: clean -- set_document_kind matches its authored pre-image sha, references open_questions nowhere, carries all five guards, and classify_document does mint the classification question this file will close.';
end $dba5_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara.set_document_kind.
--
-- 0123:1949's body VERBATIM plus ONE block, placed immediately after the kind flip and
-- before the task retirement, and TWO keys on the returned jsonb. Every guard, every comment
-- and every other statement is unmoved, so a reviewer diffs two bodies rather than reading a
-- rewrite.
-- =====================================================================================
create or replace function clara.set_document_kind(p_document uuid, p_kind text, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare c record; wk record; d record; v_dedupe jsonb; v_ext uuid; v_version int; v_prior text;
        q record; v_resolved uuid[] := '{}'::uuid[];
begin
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id=clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot set a document kind' using errcode='CLR03';
  end if;
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_document is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'a document and a reason are required' using errcode='CLR10';
  end if;
  -- F-A7 gamma (AB-5/D-9): identity_document joins the settleable kind vocabulary here too --
  -- same list as classify_document's, same reasoning.
  if p_kind is null or p_kind not in
     ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
      'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
      'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
      'knowledge_artifact','handwritten_note','consent_evidence','prior_gl','other',
      'identity_document') then
    raise exception 'unsupported document kind %',p_kind using errcode='CLR10';
  end if;
  -- ADV-R4#6: locked — serialized against the classifier writer.
  select * into d from clara.documents where id=p_document for update;
  if not found or d.firm_id<>c.firm then
    raise exception 'document not in your firm' using errcode='CLR11';
  end if;
  if d.document_kind='consent_evidence' or p_kind='consent_evidence' then
    raise exception 'consent-evidence classification is owned by the egress consent path'
      using errcode='CLR28';
  end if;
  -- 0038 (design 4.2 / part2 section 5): A LIVE BANK STATEMENT PINS THE DOCUMENT KIND. The
  -- kind is what routed this document to the statement lane; changing it under a live
  -- statement leaves that statement, its lines and every match on them citing a document the
  -- schema now calls something else. Same family as the filing refusals in
  -- approve_wrong_client_correction and retire_document_filing, same remedy: void the
  -- statement first (which itself requires zero pending/live match groups on its lines,
  -- WCB-R5), then re-classify, then re-ingest. A SAME-KIND write is untouched.
  if p_kind is distinct from d.document_kind
     and clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before re-classifying'
      using errcode='CLR10',detail='{"reason":"live_bank_statement_present"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'set_document_kind',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_prior:=d.document_kind;
  update clara.documents set document_kind=p_kind where id=p_document;
  -- H-22 (handover 2026-09-04): THE VERB THAT ANSWERS THE QUESTION CLOSES IT.
  -- clara.classify_document's low-confidence arm opens an origin='classification' question
  -- asking exactly what this call just answered (0123:1917-1935). Until now nothing closed
  -- it, and clara._open_question_blocks -> clara._coding_lane_core pinned the filing at
  -- lane='needs_you' on that open row forever -- a correctly-classified document reading as
  -- blocked, with the human asked to answer the same question a second time.
  --
  -- RESOLVED, not dismissed: the human DID answer it. The row is locked FOR UPDATE and
  -- re-read inside the lock, so a concurrent resolve_open_question on the same row cannot be
  -- overwritten -- whoever gets there first wins and the loser skips it.
  --
  -- SCOPE: origin='classification' AND status='open' AND this firm, only. A
  -- clarify_promotion or manual question about the same document is a different question and
  -- survives untouched.
  for q in select oq.id, oq.client_id, oq.document_id
             from clara.open_questions oq
            where oq.document_id=p_document and oq.origin='classification'
              and oq.status='open' and oq.firm_id=c.firm
            order by oq.opened_at, oq.id
              for update loop
    update clara.open_questions
       set status='resolved', resolved_by=c.actor, resolved_at=now(),
           resolution_text='Classified as '||p_kind||' — '||btrim(p_reason)
     where id=q.id and status='open';
    if found then
      v_resolved:=v_resolved||q.id;
      -- clara.resolve_open_question's own event, verbatim (0011:2038-2039), plus a source
      -- key so the timeline can still say WHICH door closed it. The client_id is the
      -- QUESTION's, never a filing lookup: one document can carry one question per client.
      perform clara._append_event(c.firm,'open_question.resolved',q.client_id,c.actor,null,null,
        null,q.document_id,null,
        jsonb_build_object('question_id',q.id,'status','resolved','source','set_document_kind'));
    end if;
  end loop;
  -- 0040 (C-c, WCC-R8 ride-along; register entry 9's other half): RE-KIND TASK RETIREMENT.
  -- The lane a document sits in was chosen from the kind it carried at enqueue. Now that the
  -- kind has changed, a QUEUED task in a kind-bound lane is not merely wasted work -- it is a
  -- BLOCKER: the router's in-flight short-circuit returns that stale task instead of enqueuing
  -- the correct lane, so a mis-classified document that a human corrects never reaches the
  -- lane it belongs in. Retired here, in the same transaction as the flip, with the receipt on
  -- the task trail (the `skipped_kind` idiom the router already uses for "nowhere to go").
  --
  -- THE SCOPE IS AS NARROW AS THE INTENT: only QUEUED tasks (the transition trigger admits
  -- nothing else), only lanes whose kind set NO LONGER admits the new kind, and never the
  -- kind-independent 'classify' lane. A receipt re-kinded to invoice keeps its invoice_facts
  -- task untouched. NO RE-ENQUEUE happens here: minting work is the router's authority, not a
  -- classification verb's -- retiring the blocker is what lets the ordinary enqueue path do
  -- its job on the next fire.
  update clara.document_processing_tasks
    set status='failed', error_code='skipped_kind', finished_at=now()
    where document_id=p_document and status='queued'
      and ((lane in ('invoice_facts','llm_witness')
            and p_kind not in ('invoice','credit_note','debit_note','receipt'))
        or (lane in ('statement_facts','statement_parse') and p_kind<>'bank_statement'));
  -- 0026 P1 (O-round finding): scoped to engine_kind='doc_classify' — same reasoning as
  -- classify_document's own mint, applied to the human-attestation writer's dedicated
  -- engine_id.
  select coalesce(max(version_n),0)+1 into v_version from clara.document_extractions
    where document_id=p_document and engine_id='clara-classify-human:v1' and engine_kind='doc_classify';
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(c.firm,p_document,'clara-classify-human:v1','doc_classify',v_version,'done',
      coalesce(d.page_count,0),
      jsonb_build_object('verdict_kind',p_kind,'confidence',1,
        'source','human','actor',c.actor,'reason',btrim(p_reason)))
    returning id into v_ext;
  perform clara._audit(c.firm,c.actor,null,null,'set_document_kind',null,
    jsonb_build_object('document',p_document,'kind',p_kind,'prior_kind',v_prior,
      'reason',p_reason,'extraction',v_ext,'op_key',p_op_key,
      'resolved_questions',to_jsonb(v_resolved)));
  perform clara._append_event(c.firm,'document.classified',null,c.actor,null,null,
    null,p_document,null,
    jsonb_build_object('document_kind',p_kind,'prior_kind',v_prior,
      'extraction_id',v_ext,'source','human'));
  return clara._finish_op(c.firm,'set_document_kind',p_op_key,
    jsonb_build_object('document_id',p_document,'document_kind',p_kind,
      'prior_kind',v_prior,'extraction_id',v_ext,
      'resolved_questions',to_jsonb(v_resolved),
      'resolved_question_count',coalesce(array_length(v_resolved,1),0)));
end $$;

reset role;

alter function clara.set_document_kind(uuid,text,text,text) owner to clara_fn_owner;

-- =====================================================================================
-- TAIL CENSUS
-- =====================================================================================
do $dba5_tail$
declare v_src text; v_n int;
begin
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara.set_document_kind(uuid,text,text,text)'::regprocedure
     and p.prosecdef and p.provolatile = 'v' and p.proowner = 'clara_fn_owner'::regrole
     and array_to_string(p.proconfig, ',') like '%search_path%';
  if v_n <> 1 then
    raise exception 'dba5 tail: set_document_kind is not a VOLATILE SECURITY DEFINER search_path-pinned body owned by clara_fn_owner'
      using errcode = 'CLR10';
  end if;
  -- The door's ACL is what makes it a human door. It must not have moved.
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.set_document_kind(uuid,text,text,text)', 'execute') then
    raise exception 'dba5 tail: set_document_kind lost its clara_authenticated grant' using errcode = 'CLR10';
  end if;
  if pg_catalog.has_function_privilege('clara_agent_ro', 'clara.set_document_kind(uuid,text,text,text)', 'execute')
     or pg_catalog.has_function_privilege('clara_runtime', 'clara.set_document_kind(uuid,text,text,text)', 'execute')
     or pg_catalog.has_function_privilege('public', 'clara.set_document_kind(uuid,text,text,text)', 'execute') then
    raise exception 'dba5 tail: set_document_kind became callable by an agent, the runtime, or PUBLIC' using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.set_document_kind(uuid,text,text,text)'::regprocedure;
  -- THE FIVE CARRIED GUARDS, re-read from the INSTALLED body.
  if position('agent identity cannot set a document kind' in v_src) = 0
     or position('consent-evidence classification is owned by the egress consent path' in v_src) = 0
     or position('clara._bank_live_statement_on_document(p_document)' in v_src) = 0
     or position('clara-classify-human:v1' in v_src) = 0
     or position('skipped_kind' in v_src) = 0 then
    raise exception 'dba5 tail: the installed body LOST one of the five guards this file promised to carry verbatim'
      using errcode = 'CLR10';
  end if;
  -- THE NEW BLOCK, and its scope.
  if position('oq.origin=''classification''' in v_src) = 0
     or position('oq.status=''open''' in v_src) = 0
     or position('oq.firm_id=c.firm' in v_src) = 0
     or position('for update loop' in v_src) = 0 then
    raise exception 'dba5 tail: the resolution block is absent or unscoped (origin / status / firm / row lock)'
      using errcode = 'CLR10';
  end if;
  if position('status=''dismissed''' in v_src) <> 0 then
    raise exception 'dba5 tail: the body DISMISSES a question -- this verb resolves, it never withdraws'
      using errcode = 'CLR10';
  end if;
  if position('''open_question.resolved''' in v_src) = 0
     or position('''source'',''set_document_kind''' in v_src) = 0 then
    raise exception 'dba5 tail: the open_question.resolved event is absent or does not name its source door'
      using errcode = 'CLR10';
  end if;

  raise notice 'dba5 tail: OK -- clara.set_document_kind CoR''d from its 0123:1949 pre-image (sha-pinned in the prestate), still VOLATILE SECURITY DEFINER, search_path-pinned, clara_fn_owner-owned, executable by clara_authenticated and by NOBODY else (agent_ro, runtime and PUBLIC all refused). All five carried guards re-read from the INSTALLED body: the agent wall, the CLR28 consent wall, the live-bank-statement pin, the clara-classify-human:v1 extraction and the skipped_kind re-kind retirement. The new block resolves ONLY origin=''classification'' AND status=''open'' AND this firm''s rows, under FOR UPDATE, appends clara.resolve_open_question''s own open_question.resolved event with source=set_document_kind, and never dismisses. The resolved ids ride both the audit payload and the op result (resolved_questions / resolved_question_count), so a caller can see what the verb closed on its behalf. NO BACKFILL: questions left open by past calls are untouched, because retro-resolving them would assert an answer no human gave. No table in workflow/graphile_worker/spike touched. D1 WRITE-QUIESCE IS OWED -- this is an audited writer body replacement, one door, one window.';
end $dba5_tail$;
