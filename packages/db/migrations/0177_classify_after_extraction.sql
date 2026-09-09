-- A NULL-kind PDF/image must not enter the classify lane until OCR or structured parsing has
-- completed successfully. `document.extraction_completed` is the retry signal; the non-frozen
-- facts_gate consumer must therefore be deployed before this migration so that an event emitted
-- during rollout cannot be checkpointed as irrelevant and leave the document waiting forever.
-- Rollback is the reverse safety dependency: apply a NEW append-only recovery migration that
-- restores the prior DB body while this consumer remains live, then (if still necessary) roll
-- the consumer back. Never delete or edit 0177 after it has been applied.
--
-- This is an append-only, guarded recut of the live 0123 writer. It inserts one early return and
-- preserves the consent gates, task dedupe, attempt cap, downstream facts routing, owner and ACL.
-- The splice reads the live definition through pg_get_functiondef and replaces exactly one
-- anchor (the 0175 splice shape), so the header, SECURITY DEFINER and search_path are carried
-- verbatim and the web SQL-function census can prove which function the EXECUTE recreates.
-- Apply during the repository's required writer quiescence window for function body replacement.

set local statement_timeout = '2min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

do $migration$
declare
  v_src text;
  v_def text;
  v_anchor text;
  v_replacement text;
  v_owner oid;
  v_acl aclitem[];
  v_unsafe_inflight int;
begin
  select p.prosrc, p.proowner, p.proacl
    into v_src, v_owner, v_acl
    from pg_proc p
   where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;

  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <>
      'dbd002d63912b101506b8091baa618b309cc997b472cbc009eb59a80cc2b44f4' then
    raise exception 'classify_after_extraction prestate: _enqueue_invoice_facts_core body drifted'
      using errcode='CLR10';
  end if;
  if v_owner <> 'clara_fn_owner'::regrole then
    raise exception 'classify_after_extraction prestate: unexpected owner %', v_owner::regrole
      using errcode='CLR10';
  end if;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  v_anchor := $anchor$    if d.document_kind is null then
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';$anchor$;
  v_replacement := $replacement$    if d.document_kind is null then
      if not exists (
        select 1 from clara.document_extractions e
         where e.document_id=p_document and e.firm_id=d.firm_id
           and e.status='done' and e.engine_kind in ('ocr','structured_parse')
      ) then
        return jsonb_build_object('document_id',p_document,'status','awaiting_extraction');
      end if;
      v_lane:='classify'; v_engine:='clara-classify-llm:v1';$replacement$;
  if (length(v_def)-length(replace(v_def,v_anchor,''))) / length(v_anchor) <> 1 then
    raise exception 'classify_after_extraction prestate: classify routing anchor is not unique'
      using errcode='CLR10';
  end if;

  -- A task created by the old writer bypasses this enqueue guard. Refuse the cutover while
  -- any such task is claimable; the quiescent rollout must first let its extraction finish or
  -- resolve the task explicitly. This makes the consumer-first deployment order sufficient
  -- for every task admitted after the cutover without silently abandoning old work.
  select count(*)::int into v_unsafe_inflight
    from clara.document_processing_tasks t
    join clara.documents d on d.id=t.document_id and d.firm_id=t.firm_id
   where t.lane='classify' and t.status in ('queued','held_egress','running')
     and d.document_kind is null
     and (lower(coalesce(d.mime_type,''))='application/pdf'
          or lower(coalesce(d.mime_type,'')) like 'image/%')
     and not exists (
       select 1 from clara.document_extractions e
        where e.document_id=t.document_id and e.firm_id=t.firm_id
          and e.status='done' and e.engine_kind in ('ocr','structured_parse'));
  if v_unsafe_inflight <> 0 then
    raise exception 'classify_after_extraction prestate: % in-flight classify task(s) lack a successful extraction; quiesce and resolve them before retrying', v_unsafe_inflight
      using errcode='CLR10';
  end if;

  v_def := replace(v_def,v_anchor,v_replacement);
  execute v_def;

  if (select p.proowner from pg_proc p
       where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure) <> v_owner then
    raise exception 'classify_after_extraction poststate: function owner moved'
      using errcode='CLR10';
  end if;
  if (select p.proacl from pg_proc p
       where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure) is distinct from v_acl then
    raise exception 'classify_after_extraction poststate: function ACL moved'
      using errcode='CLR10';
  end if;
end
$migration$;

do $postcheck$
declare
  v_src text;
  v_secdef boolean;
  v_config text;
begin
  select p.prosrc, p.prosecdef, coalesce(array_to_string(p.proconfig,','),'')
    into v_src, v_secdef, v_config
    from pg_proc p
   where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <>
      '42e8b0b44babb5dbf71a9018f4d1004f3a9cba46eeff4e4a7178d43f113c2df2' then
    raise exception 'classify_after_extraction poststate: body sha256 mismatch'
      using errcode='CLR10';
  end if;
  if position($needle$return jsonb_build_object('document_id',p_document,'status','awaiting_extraction');$needle$ in v_src) = 0
     or position($needle$e.status='done' and e.engine_kind in ('ocr','structured_parse')$needle$ in v_src) = 0 then
    raise exception 'classify_after_extraction poststate: extraction gate is absent'
      using errcode='CLR10';
  end if;
  if position('classify_low_confidence' in v_src) = 0
     or position('document_processing_consent_inactive' in v_src) = 0
     or position('witness_consent_inactive' in v_src) = 0
     or position('status in (''queued'',''held_egress'',''running'')' in v_src) = 0
     or position('on conflict do nothing returning id into v_task' in v_src) = 0 then
    raise exception 'classify_after_extraction poststate: an existing gate or dedupe limb moved'
      using errcode='CLR10';
  end if;
  if v_secdef is not true or position('search_path=' in v_config) = 0 then
    raise exception 'classify_after_extraction poststate: SECURITY DEFINER or search_path did not carry over (config: %)', v_config
      using errcode='CLR10';
  end if;
end
$postcheck$;
