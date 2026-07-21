-- 0014_consent_evidence_documents.sql — first-class consent-evidence documents.
--
-- OWNER DECISION (2026-07-21): RPR's egress consent should cite the REAL signed
-- consent-evidence PDF with a genuine foreign key (the full-provenance path), NOT
-- the 0012 owner-declaration path (evidence_document_id null).
--
-- THE PROBLEM this solves. grant_client_egress emits a CLIENT-SCOPED
-- 'egress.consent_granted' event carrying the evidence document in the typed
-- domain_events.document_id column. The provenance-binding trigger
-- (_tf_validate_domain_event, 0007) then REQUIRES that document to be in the
-- client's FILING history — and the only audited way to file a document
-- (file_document) INTRINSICALLY enqueues an invoice-facts extraction task on it
-- (_enqueue_invoice_facts_core). For a signed legal consent letter that means:
--   (a) it is treated as a bookkeeping document (a filing / coding-queue entry), and
--   (b) it becomes cross-border-EGRESS-eligible — the consent letter itself would
--       be sent to Azure DI, the exact processing the consent authorizes. A PDPA
--       own-goal. 0012 dodged this by making the document OPTIONAL; this migration
--       makes the full-provenance citation SAFE instead.
--
-- THE APPROACH — keep the bookkeeping provenance invariant PRISTINE (it is one of
-- the four structural invariants; it correctly governs invoices/receipts). A
-- consent-evidence document is a DIFFERENT class of artifact, so we route it OUT of
-- the bookkeeping pipeline rather than weaken the invariant:
--
-- (1) documents.document_kind gains 'consent_evidence'.
-- (2) grant_client_egress (CoR, same arity): when a document is cited, stamp it
--     document_kind='consent_evidence' (refusing a doc already classified as
--     something else — you cannot cite a coded invoice as consent evidence), and
--     emit 'egress.consent_granted' with the evidence document in the event PAYLOAD
--     instead of the typed document_id column. The client_egress_consents.
--     evidence_document_id FK still lands (the real citation the owner wants) and the
--     consent ROW is the authoritative client<->document association; the event log
--     records the doc in its payload. No filing, no coding task, no facts task.
-- (3) revoke_client_egress (CoR, same arity): the SAME event reroute, so revoking a
--     consent that cites a real document does not trip the filing-history trigger.
-- (4) _enqueue_invoice_facts_core (CoR, same arity): a STRUCTURAL exemption — a
--     document_kind='consent_evidence' document is NEVER facts-extracted (never
--     egressed), even if something later tries to file it. Belt-and-suspenders that
--     makes "the signed consent letter is never egressed" a guarantee, not a
--     convention.
--
-- All three function changes are SAME-ARITY CREATE OR REPLACEs (ACLs preserved by
-- CoR). The runner supplies this migration's transaction. Validate on a throwaway
-- Postgres only.

-- (1) widen the document_kind check — run as the migration (superuser) role, NOT
-- clara_fn_owner (table alters need table ownership; 0007 added this column the same
-- bare way). Find the existing check by definition so the drop is name-robust.
do $$
declare v_con text;
begin
  select con.conname into v_con
  from pg_constraint con
  join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='documents' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%document_kind%';
  if v_con is null then
    raise exception '0014: existing document_kind check constraint not found' using errcode='CLR10';
  end if;
  execute format('alter table clara.documents drop constraint %I', v_con);
end $$;

alter table clara.documents add constraint documents_document_kind_check
  check (document_kind is null or document_kind in
    ('invoice','receipt','credit_note','debit_note','bank_statement','payment_voucher',
     'claim_form','payroll_summary','tax_correspondence','ssm_company_doc',
     'agreement_contract','e_invoice_xml','management_account','opening_balance_doc',
     'knowledge_artifact','handwritten_note','consent_evidence','other'));

set role clara_fn_owner;

-- (2) grant_client_egress — stamp the cited doc + route it through the event payload.
create or replace function clara.grant_client_egress(p_client uuid,p_evidence_document uuid,
    p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  -- 0012(A): the consent-evidence document is OPTIONAL. scope_note is ALWAYS
  -- required (it carries the owner declaration when no document is cited).
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'egress consent is malformed' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'evidence_document',p_evidence_document,
      'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  -- Only assert the document when one is CITED (the full-provenance path). A null
  -- document is the owner-declaration path (scope_note on record).
  if p_evidence_document is not null and not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm and status='ingested'
        and bytes_verified_at is not null) then
    raise exception 'consent evidence is not a real ingested document in the client firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  -- 0014: a cited document is CONSENT EVIDENCE — a legal artifact, never a
  -- bookkeeping document. Stamp its kind (idempotent) and REFUSE a document already
  -- classified as something else (e.g. an invoice): you cannot cite a coded bill as
  -- consent evidence. The stamp makes it structurally facts/egress-exempt (4).
  if p_evidence_document is not null then
    update clara.documents set document_kind='consent_evidence'
      where id=p_evidence_document and firm_id=c.firm
        and (document_kind is null or document_kind='consent_evidence');
    if not found then
      raise exception 'consent evidence must be an unclassified or consent-evidence document'
        using errcode='CLR28',detail='{"reason":"evidence_kind_conflict"}';
    end if;
  end if;
  begin
    insert into clara.client_egress_consents(firm_id,client_id,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_consents_one_live' then
      raise exception 'client already has a live egress consent'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress',null,
    jsonb_build_object('consent',v_id,'client',p_client,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  -- 0014: the evidence document rides in the PAYLOAD, not the typed document_id
  -- column, so the bookkeeping filing-history invariant (correct for invoices) does
  -- not apply to a consent artifact. The consent ROW's FK is the authoritative link.
  perform clara._append_event(c.firm,'egress.consent_granted',p_client,c.actor,null,null,
    null,null,null,jsonb_build_object('consent_id',v_id,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress',p_op_key,
    jsonb_build_object('consent_id',v_id,'status','live'));
end $$;

-- (3) revoke_client_egress — the SAME event reroute (a doc-citing consent must be
-- revocable without tripping the filing-history trigger).
create or replace function clara.revoke_client_egress(p_client uuid,p_reason text,p_op_key text)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'egress revocation reason is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into x from clara.client_egress_consents where client_id=p_client
    and revoked_at is null for update;
  if not found or x.firm_id<>c.firm then
    raise exception 'live client consent not found'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress',null,
    jsonb_build_object('consent',x.id,'client',p_client,'reason',p_reason,'op_key',p_op_key));
  -- 0014: evidence document rides in the payload (see grant), never the typed slot.
  perform clara._append_event(c.firm,'egress.consent_revoked',p_client,c.actor,null,null,
    null,null,null,jsonb_build_object('consent_id',x.id,'reason',p_reason,
      'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'revoke_client_egress',p_op_key,
    jsonb_build_object('consent_id',x.id,'status','revoked'));
end $$;

-- (4) _enqueue_invoice_facts_core — a consent-evidence document is NEVER facts-
-- extracted (never egressed). Structural exemption, checked first.
create or replace function clara._enqueue_invoice_facts_core(p_document uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;
begin
  select * into d from clara.documents where id=p_document;
  if not found then raise exception 'document not found' using errcode='CLR11'; end if;
  -- 0014: a consent-evidence document is a LEGAL artifact — it must NEVER be
  -- facts-extracted (that would egress the signed consent letter cross-border).
  -- Structural egress exemption, gated before the mime check.
  if d.document_kind='consent_evidence' then
    return jsonb_build_object('document_id',p_document,'status','skipped_consent_evidence');
  end if;
  if not (lower(coalesce(d.mime_type,''))='application/pdf'
      or lower(coalesce(d.mime_type,'')) like 'image/%') then
    return jsonb_build_object('document_id',p_document,'status','skipped_type');
  end if;
  select e.id into v_task from clara.document_extractions e
    where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'
    order by e.version_n desc limit 1;
  if v_task is not null then
    return jsonb_build_object('document_id',p_document,'status','already_completed',
      'extraction_id',v_task);
  end if;
  select * into t from clara.document_processing_tasks
    where document_id=p_document and lane='invoice_facts'
      and status in ('queued','held_egress','running')
    order by id limit 1;
  if found then
    return jsonb_build_object('task_id',t.id,'document_id',p_document,'status',t.status);
  end if;
  select coalesce(sum(attempt_count),0)::int,
         coalesce(max(version_n),0)+1
    into v_attempts,v_version from clara.document_processing_tasks
    where document_id=p_document and lane='invoice_facts';
  if v_attempts >= 3 then
    insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,error_code,finished_at)
      values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
        v_version,'invoice_facts','failed','attempt_cap',now()) returning id into v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','attempt_cap');
  end if;
  insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
      version_n,lane,status)
    values(d.firm_id,p_document,'azure-di:prebuilt-invoice:2024-11-30','{}'::jsonb,
      v_version,'invoice_facts','queued')
    on conflict do nothing returning id into v_task;
  if v_task is null then
    select id,status into v_task,t.status from clara.document_processing_tasks
      where document_id=p_document and lane='invoice_facts'
        and status in ('queued','held_egress','running') order by id limit 1;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',t.status);
  end if;
  v_pages := greatest(coalesce(d.page_count,1),1);
  begin
    perform clara._reserve_processing_call(v_task,v_pages);
  exception when sqlstate 'CLR18' then
    update clara.document_processing_tasks set status='failed',error_code='budget',
      finished_at=now() where id=v_task;
    return jsonb_build_object('task_id',v_task,'document_id',p_document,
      'status','failed','reason','budget');
  end;
  return jsonb_build_object('task_id',v_task,'document_id',p_document,'status','queued');
end $$;

reset role;

-- Tail asserts ------------------------------------------------------------------
do $$
declare v_def text; v_src text; v_egress int;
begin
  -- (1) the document_kind check now admits 'consent_evidence'.
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='clara' and c.relname='documents' and con.contype='c'
    and pg_get_constraintdef(con.oid) ilike '%document_kind%';
  if v_def is null or v_def not ilike '%consent_evidence%' then
    raise exception '0014 document_kind check does not admit consent_evidence' using errcode='CLR10';
  end if;
  -- (4) the facts-enqueue helper structurally exempts consent evidence.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_enqueue_invoice_facts_core';
  if v_src is null or position('consent_evidence' in v_src)=0 then
    raise exception '0014 _enqueue_invoice_facts_core missing the consent_evidence exemption'
      using errcode='CLR10';
  end if;
  -- (2)(3) grant + revoke KEEP their clara_authenticated EXECUTE (CoR preserves ACLs).
  select count(distinct p.proname) into v_egress
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
  where n.nspname='clara' and p.proname in ('grant_client_egress','revoke_client_egress')
    and r.rolname='clara_authenticated' and a.privilege_type='EXECUTE';
  if v_egress <> 2 then
    raise exception '0014 egress fns lost clara_authenticated EXECUTE (got %/2)',v_egress
      using errcode='CLR10';
  end if;
end $$;
