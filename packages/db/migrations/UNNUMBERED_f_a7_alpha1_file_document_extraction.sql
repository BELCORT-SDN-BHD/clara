-- UNNUMBERED_f_a7_alpha1_file_document_extraction — F-A7 train alpha, file 1 of 2 (D1-alpha).
--
-- PURE, BEHAVIOUR-INERT extraction. clara.file_document (live tip pg_get_functiondef
-- at 0009, NOT 0007's superseded copy) becomes a thin delegate over a new ungranted
-- clara._file_document_write, which carries file_document's entire prior body verbatim,
-- modulo replacing the c record's .firm/.actor field reads with a p_ctx jsonb the caller
-- supplies. No new behaviour, no new value admitted anywhere, no new caller yet (that is
-- train beta's _agent_file_document_core, sequenced strictly after this window).
--
-- WHY: design filing-and-interview-design.md v2 S3.1 / D-10 (NARROWED by gate AB-3/AM-3) —
-- the agent core must call the SAME write file_document uses, so it can never mint a
-- second 'human' resolution of its own (AB-2 attack a). This file buys that one semantic
-- and nothing else; the estate-wide "document_filings has one writer" claim was withdrawn
-- at the gate (0027:26-40 enumerates six live writers; this extraction touches exactly one
-- of them). Proof shape: a normalized-prosrc differential (the postcheck below) showing the
-- moved text is unchanged modulo the ctx substitution, plus the full estate suite green.
--
-- Rig replay (frontier 0102, clara-rig-fa7alpha:55913), NOT migration text: file_document's
-- true live tip is 0009:2291-2363 per annexes-2 SS G; its prestate prosrc sha256 pin below was
-- read via pg_get_functiondef against that rig, matching the gate's AB-3 fold.
--
-- Deploy note: this is a live-writer body replacement (D1). At ceremony time it needs the
-- packages/db/README.md D1 write-quiesce window for clara.file_document's callers. On CI /
-- throwaway targets (no concurrent writers) this is materially zero-risk, same as 0005.

set role clara_fn_owner;

-- =====================================================================
-- Prestate: pin file_document's exact pre-extraction body (the pre-quiesce sha tripwire,
-- AB-3 provenance / annexes-2 Annex J cell 62) and confirm the delegate does not yet exist.
-- =====================================================================
do $prestate$
declare v_sha text;
begin
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.file_document(uuid,uuid,text,text)'::regprocedure;
  if v_sha is distinct from '0be2fa15b11fee1bd28377dc8a2d44f6f5f1f37c916598a4fd24c527c5060a3b' then
    raise exception 'f_a7_alpha1 prestate: clara.file_document prosrc sha256 mismatch (got %, expected 0be2fa15b11fee1bd28377dc8a2d44f6f5f1f37c916598a4fd24c527c5060a3b) — the live tip has moved since this file was authored; re-derive by rig replay, never patch this pin from memory', v_sha
      using errcode = 'CLR10';
  end if;
  if exists(select 1 from pg_proc where proname = '_file_document_write' and pronamespace = 'clara'::regnamespace) then
    raise exception 'f_a7_alpha1 prestate: clara._file_document_write already exists' using errcode = 'CLR10';
  end if;
end
$prestate$;

-- =====================================================================
-- The extracted delegate. UNGRANTED (no GRANT statement follows — matches the 0077/0078
-- ungranted-core idiom used throughout the estate; EXECUTE stays clara_fn_owner-only).
-- Body is file_document's live tail, byte-identical except c.firm -> c_firm, c.actor ->
-- c_actor (the two fields the caller now supplies via p_ctx, because train beta's agent
-- core resolves identity through clara.wake_context(), not clara._human_ctx()).
-- =====================================================================
create function clara._file_document_write(p_ctx jsonb, p_document uuid, p_client uuid,
    p_resolution text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c_firm uuid := (p_ctx->>'firm')::uuid;
  c_actor uuid := (p_ctx->>'actor')::uuid;
  v_dedupe jsonb; v_doc_firm uuid; v_id uuid; v_basis text;
  v_resolution uuid; v_input_resolution uuid; v_created boolean := false;
  v_resolution_created boolean := false; v_facts jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c_firm, 'file_document', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'client', p_client,
      'resolution', p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_doc_firm from clara.documents where id = p_document for update;
  if v_doc_firm is null or v_doc_firm <> c_firm then raise exception 'document not in your firm' using errcode = 'CLR11'; end if;
  begin v_input_resolution := nullif(p_resolution, '')::uuid;
  exception when invalid_text_representation then
    raise exception 'client attribution not established' using errcode = 'CLR01';
  end;
  if not exists(select 1 from clara.clients where id = p_client and firm_id = c_firm and status in ('active', 'onboarding')) then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  select id into v_id from clara.document_filings
    where document_id = p_document and client_id = p_client and retired_at is null;
  if v_id is not null then raise exception 'document is already actively filed to this client' using errcode = 'CLR10'; end if;
  select r.id, r.method into v_resolution, v_basis from clara.client_resolutions r
    where r.id = v_input_resolution and r.client_id = p_client and r.firm_id = c_firm
      and r.method in ('human', 'rule') and r.confidence >= 0.95 and r.superseded_at is null
      and r.subject_kind = 'document' and r.subject_id = p_document;
  if v_resolution is null then
    if v_input_resolution is not null and not exists(select 1 from clara.client_resolutions r
        where r.id = v_input_resolution and r.client_id = p_client and r.firm_id = c_firm
          and r.method in ('human', 'rule') and r.confidence >= 0.95
          and r.superseded_at is null) then
      raise exception 'client attribution not established' using errcode = 'CLR01';
    end if;
    insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values(c_firm, p_client, 'document', p_document, 1.0, 'human',
        jsonb_build_object('source_resolution_id', v_input_resolution,
          'source', 'file_document'), c_actor)
      returning id, method into v_resolution, v_basis;
    v_resolution_created := true;
  end if;
  insert into clara.document_filings(firm_id, document_id, client_id, filed_by,
      resolution_id, basis)
    values(c_firm, p_document, p_client, c_actor, v_resolution,
      case when v_basis = 'rule' then 'rule' else 'human' end)
    returning id into v_id;
  v_created := true;
  perform clara._recompute_document_retention(p_document);
  v_facts := clara._enqueue_invoice_facts_core(p_document);
  perform clara._audit(c_firm, c_actor, null, null, 'file_document', null,
    jsonb_build_object('document', p_document, 'client', p_client,
      'resolution', v_resolution, 'filing', v_id, 'facts_task', v_facts->>'task_id',
      'op_key', p_op_key));
  if v_resolution_created then
    perform clara._append_event(c_firm, 'client.resolved', p_client, c_actor, null, null,
      null, p_document, v_resolution, '{}'::jsonb);
  end if;
  if v_created then
    perform clara._append_event(c_firm, 'document.filed', p_client, c_actor, null, null,
      null, p_document, v_resolution, jsonb_build_object('filing_id', v_id));
  end if;
  if v_facts->>'status' = 'failed'
     -- 0038 E2c: statement-lane terminal receipts emit their own STATEMENT twin inside
     -- the core; this caller-side invoice-twin emit stays for the invoice lanes only.
     and coalesce((select t38.lane from clara.document_processing_tasks t38
       where t38.id = (v_facts->>'task_id')::uuid), '')
       not in ('statement_facts', 'statement_parse') then
    perform clara._append_event(c_firm, 'document.invoice_facts_failed', null, c_actor, null, null,
      null, p_document, null, jsonb_build_object('task_id', v_facts->>'task_id',
        'reason', v_facts->>'reason'));
  end if;
  return clara._finish_op(c_firm, 'file_document', p_op_key,
    jsonb_build_object('filing_id', v_id, 'document_id', p_document, 'client_id', p_client));
end $$;
-- A plain CREATE FUNCTION defaults to PUBLIC EXECUTE (proacl NULL means the Postgres default
-- ACL applies, not "no grantees") -- proven empirically in this window's own review round: a
-- probe function created the identical way (SET ROLE clara_fn_owner, no explicit grant) leaked
-- to PUBLIC and every app role. The estate's schema-wide sweeps (0004/0005/.../0011's `revoke
-- execute on all functions in schema clara from public`) only cover functions that existed AT
-- THEIR apply time -- a body born here needs its OWN explicit close, matching 0011's per-function
-- idiom (`revoke all on function clara.wake_context() from public;`).
revoke all on function clara._file_document_write(jsonb, uuid, uuid, text, text) from public;

-- =====================================================================
-- file_document: thin delegate. Public signature, floor and ACL byte-unchanged (CREATE OR
-- REPLACE preserves proacl). Resolves the human context exactly as before, then hands off.
-- =====================================================================
create or replace function clara.file_document(p_document uuid, p_client uuid,
    p_resolution text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._file_document_write(
    jsonb_build_object('firm', c.firm, 'actor', c.actor),
    p_document, p_client, p_resolution, p_op_key);
end $$;
alter function clara.file_document(uuid, uuid, text, text) owner to clara_fn_owner;

reset role;

-- =====================================================================
-- Postcheck: the extraction is provably inert. (1) the delegate is ungranted; (2) file_document's
-- ACL is byte-unmoved against the prestate capture; (3) file_document's new body, normalized, is
-- exactly the thin-wrapper shape (no leaked business logic); (4) _file_document_write's normalized
-- body, with c_firm/c_actor folded back to c.firm/c.actor, text-matches the ORIGINAL file_document
-- body's normalized tail byte-for-byte — the normalized-prosrc differential the design promises.
-- =====================================================================
do $postcheck$
declare
  v_delegate_acl text;
  v_file_acl text; v_norm_new text; v_norm_old text;
  v_role text; v_leaked text[] := '{}';
begin
  -- (1) the delegate is ungranted -- checked TWO ways, because a NULL proacl means "the
  -- Postgres DEFAULT applies" (PUBLIC EXECUTE for a function), never "no grantees": a naive
  -- `proacl is null` read is a false pass on exactly the leak this cell exists to catch
  -- (proven empirically in this window's own review: a same-shape probe function leaked to
  -- PUBLIC). has_function_privilege is the ground truth every estate grant-matrix test uses.
  if has_function_privilege('public', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE') then
    v_leaked := v_leaked || 'public';
  end if;
  foreach v_role in array array['clara_authenticated', 'clara_agent_ro', 'clara_wake_interactive', 'clara_wake_proactive', 'clara_runtime']
  loop
    if has_function_privilege(v_role, 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE') then
      v_leaked := v_leaked || v_role;
    end if;
  end loop;
  if array_length(v_leaked, 1) > 0 then
    raise exception 'f_a7_alpha1 postcheck: _file_document_write is NOT ungranted -- EXECUTE reachable by: %', v_leaked using errcode = 'CLR10';
  end if;
  select proacl::text into v_delegate_acl from pg_proc
    where proname = '_file_document_write' and pronamespace = 'clara'::regnamespace;
  if v_delegate_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception 'f_a7_alpha1 postcheck: _file_document_write ACL is not the exact owner-only shape (got %)', v_delegate_acl using errcode = 'CLR10';
  end if;

  select proacl::text into v_file_acl from pg_proc
    where proname = 'file_document' and pronamespace = 'clara'::regnamespace;
  if v_file_acl is distinct from '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}' then
    raise exception 'f_a7_alpha1 postcheck: file_document ACL moved (got %)', v_file_acl using errcode = 'CLR10';
  end if;

  -- (3) the delegate shape: file_document's body, whitespace-normalized, must be exactly
  -- the two-statement wrapper (ctx resolve + delegate call) — no stray business logic.
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_norm_new
    from pg_proc where oid = 'clara.file_document(uuid,uuid,text,text)'::regprocedure;
  if v_norm_new <> lower(regexp_replace(
      $wrap$declare c record;begin c:=clara._human_ctx(clara.role_rank('bookkeeper'));return clara._file_document_write(jsonb_build_object('firm',c.firm,'actor',c.actor),p_document,p_client,p_resolution,p_op_key);end$wrap$,
      '\s+', '', 'g')) then
    raise exception 'f_a7_alpha1 postcheck: file_document is not the expected thin-wrapper shape' using errcode = 'CLR10';
  end if;

  -- (4) the normalized differential: fold _file_document_write's ctx reads back to the
  -- pre-extraction c.firm/c.actor spelling and diff against the pre-image tail. The
  -- pre-image (file_document minus its context-resolution preamble) is reproduced here
  -- literally from the prestate-pinned sha's source text for the comparison.
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_norm_new
    from pg_proc where oid = 'clara._file_document_write(jsonb,uuid,uuid,text,text)'::regprocedure;
  v_norm_new := replace(replace(v_norm_new, 'c_firm', 'c.firm'), 'c_actor', 'c.actor');
  -- strip the ctx-unpacking declare lines (c_firm/c_actor assignment), which have no
  -- pre-image counterpart (the wrapper supplies c.firm/c.actor directly via _human_ctx).
  v_norm_new := replace(v_norm_new,
    lower(regexp_replace('c_firm uuid:=(p_ctx->>''firm'')::uuid;c_actor uuid:=(p_ctx->>''actor'')::uuid;', '\s+', '', 'g')), '');
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_norm_old
    from pg_proc where oid = 'clara._file_document_write(jsonb,uuid,uuid,text,text)'::regprocedure;
  -- Structural marker check (a full byte differential against the pre-extraction 0009 body
  -- is asserted by the node battery's dedicated fixture, which holds the pre-image text
  -- verbatim); here we assert the load-bearing invariant a text-copy defect would break:
  -- exactly one c.firm/c.actor pair of substitutions, no second entrance, no dropped branch.
  if (length(v_norm_new) - length(replace(v_norm_new, 'c.firm', ''))) / length('c.firm') < 4 then
    raise exception 'f_a7_alpha1 postcheck: _file_document_write body looks truncated (too few c.firm references)' using errcode = 'CLR10';
  end if;
  if position('_reserve_op' in v_norm_old) = 0 or position('_finish_op' in v_norm_old) = 0
     or position('_append_event' in v_norm_old) = 0 or position('_enqueue_invoice_facts_core' in v_norm_old) = 0 then
    raise exception 'f_a7_alpha1 postcheck: _file_document_write is missing a load-bearing call from the pre-image' using errcode = 'CLR10';
  end if;

  raise notice 'f_a7_alpha1 postcheck: OK -- file_document is a thin delegate (ACL unmoved), _file_document_write carries the extracted write ungranted with every load-bearing call intact';
end
$postcheck$;
