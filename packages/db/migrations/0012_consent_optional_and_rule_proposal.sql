-- 0012_consent_optional_and_rule_proposal.sql
--
-- Two owner-ratified Wave-A fast-follows (2026-07-21), each a same-arity
-- CREATE OR REPLACE (ACLs preserved) plus one nullability relaxation:
--
-- (A) CONSENT-EVIDENCE DOCUMENT IS OPTIONAL (owner decision, taken OVER the
--     orchestrator's explicit recommendation-against + the C6 [LAWYER DECIDES]
--     flag). The owner declared all clients consented but has no ingested
--     consent-evidence document yet. `client_egress_consents.evidence_document_id`
--     becomes NULLABLE and `grant_client_egress` accepts a null document — the
--     owner-declaration path. **This WEAKENS the PDPA/MIA consent-evidence audit
--     control.** Accountability is preserved as far as the schema can: the OWNER
--     role floor is unchanged, `scope_note` stays REQUIRED (non-blank — it carries
--     the declaration), and granted_by/granted_at record who declared it and when.
--     OPEN RESIDUAL (do NOT let it lapse): the evidence document is PENDING, not
--     waived; ingest the real consent letters / engagement-letter authority per
--     client when available and backfill evidence_document_id. The cited-document
--     path is UNCHANGED (a non-null document is still asserted real+ingested).
--
-- (B) RULE-PROPOSAL QUESTIONS NO LONGER BLOCK APPROVALS (WA-R9 "a proposal is a
--     suggestion, not a stop"; both as-built review lanes recommended this). A rule
--     PROPOSAL is advisory (a signed rule never auto-applies); blocking a routine
--     vendor's next bill the moment the system learns the vendor is routine inverts
--     the daily-loop intent. `_open_question_blocks` now excludes
--     origin='rule_proposal'; rule_conflict / clarify_promotion / manual /
--     sweep_refusal questions still block (they represent a genuine must-resolve).

set role clara_fn_owner;

-- (A) evidence document optional -------------------------------------------------
alter table clara.client_egress_consents
  alter column evidence_document_id drop not null;
-- The composite FK (evidence_document_id, firm_id) -> documents stays: an FK on a
-- nullable column is enforced only when the value is non-null, so a cited document
-- is still validated and a null is the owner-declaration path.

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
  perform clara._append_event(c.firm,'egress.consent_granted',p_client,c.actor,null,null,
    null,p_evidence_document,null,jsonb_build_object('consent_id',v_id));
  return clara._finish_op(c.firm,'grant_client_egress',p_op_key,
    jsonb_build_object('consent_id',v_id,'status','live'));
end $$;

-- (B) rule-proposal questions do not block --------------------------------------
create or replace function clara._open_question_blocks(p_client uuid,p_filing uuid,
    p_counterparty uuid)
  returns table(question_id uuid,scope_kind text)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_document uuid; v_counterparty uuid;
begin
  select document_id into v_document from clara.document_filings
    where id=p_filing and client_id=p_client and retired_at is null;
  v_counterparty:=clara._canonical_counterparty(p_client,p_counterparty);
  return query
    select q.id,q.scope_kind from clara.open_questions q
    where q.client_id=p_client and q.status='open'
      and q.origin<>'rule_proposal'  -- 0012(B): a proposal is advisory, never a gate
      and (
      q.scope_kind='client'
      or (q.scope_kind='document' and q.document_id=v_document)
      or (q.scope_kind='vendor' and clara._canonical_counterparty(
          p_client,q.counterparty_id)=v_counterparty))
    order by case q.scope_kind when 'document' then 1 when 'vendor' then 2 else 3 end,
      q.opened_at,q.id;
end $$;
revoke all on function clara._open_question_blocks(uuid,uuid,uuid) from public;

reset role;

-- Tail asserts ------------------------------------------------------------------
do $$
declare v_public int; v_nullable text; v_src text;
begin
  -- evidence_document_id is now nullable.
  select is_nullable into v_nullable from information_schema.columns
    where table_schema='clara' and table_name='client_egress_consents'
      and column_name='evidence_document_id';
  if v_nullable<>'YES' then
    raise exception '0012 expected client_egress_consents.evidence_document_id nullable, got %',v_nullable
      using errcode='CLR10';
  end if;
  -- _open_question_blocks excludes rule_proposal.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_open_question_blocks';
  if position('rule_proposal' in v_src)=0 then
    raise exception '0012 expected _open_question_blocks to reference rule_proposal exclusion'
      using errcode='CLR10';
  end if;
  -- PUBLIC holds zero execute on the two recreated fns.
  select count(*)::int into v_public
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='clara' and p.proname in ('grant_client_egress','_open_question_blocks')
    and a.grantee=0 and a.privilege_type='EXECUTE';
  if v_public<>0 then
    raise exception '0012 PUBLIC execute assertion failed: % exposed',v_public using errcode='CLR10';
  end if;
  -- grant_client_egress stays authenticated-only (OWNER floor enforced in-fn).
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
    where n.nspname='clara' and p.proname='grant_client_egress'
      and r.rolname='clara_authenticated' and a.privilege_type='EXECUTE') then
    raise exception '0012 grant_client_egress lost its clara_authenticated EXECUTE'
      using errcode='CLR10';
  end if;
end $$;
