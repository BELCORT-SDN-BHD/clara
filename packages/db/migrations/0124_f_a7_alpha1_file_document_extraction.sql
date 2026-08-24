-- 0124_f_a7_alpha1_file_document_extraction — F-A7 train alpha, file 1 of 2 (D1-alpha).
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

-- Precautionary, not load-bearing (ADR-059 ceremony law): this file is a pure CoR + one
-- column-free DDL-free postcheck, no backfill, no bulk scan. The bound exists only so a
-- runaway lock wait on a live ceremony target fails fast and visibly rather than hanging the
-- deploy window. Set HERE, as the runner's true first statement, so it cannot be forgotten.
set local statement_timeout = '2min';

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
-- Body is file_document's live tail, executable-text-identical except c.firm -> c_firm, c.actor ->
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
  -- Review round SHOULD-7: a missing/null actor previously ADMITTED with a NULL filed_by, and
  -- a missing firm died as a raw 23502 (not-null violation) rather than a typed refusal. Both
  -- ctx fields are load-bearing identity, not optional decoration -- file_document's own
  -- _human_ctx() call can never produce either NULL, but a future train-beta caller passing a
  -- malformed p_ctx must refuse typed, before any reservation or lock is taken.
  if c_firm is null or c_actor is null then
    raise exception 'file_document context is malformed (firm/actor required)' using errcode = 'CLR10';
  end if;
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
-- Postcheck: the extraction is provably inert modulo two STATED, deliberate deltas (the ctx
-- wrapper, and the SHOULD-7 null-guard). (1) the delegate is ungranted; (2) file_document's
-- ACL is executable-text-unmoved against the prestate capture (never "byte-identical" — a
-- SECURITY DEFINER function's on-disk prosrc is a normalizable but not byte-stable
-- representation across a CREATE OR REPLACE); (3) file_document's new body, normalized, is
-- exactly the thin-wrapper shape (no leaked business logic); (4) _file_document_write's
-- normalized body, with its declare/ctx-unpacking preamble and the null-guard excised (and
-- comments stripped from both sides), DIFFS AGAINST THE ACTUAL PRE-EXTRACTION BODY -- folded
-- TOWARD the delegate's c_firm/c_actor spelling, never the reverse (a bare "c_firm"->"c.firm"
-- rename collides with "v_doc_firm"; a literal-dot "c.firm"->"c_firm" rename does not) --
-- (reproduced verbatim below, captured by
-- rig replay before this file's own CREATE ran, matching the prestate sha256 pin) — a REAL
-- differential, not a self-referential read of the same regprocedure twice (the review round's
-- SHOULD-5 finding on the prior cut of this cell).
-- =====================================================================
do $postcheck$
declare
  v_delegate_acl text;
  v_file_acl text; v_norm_new text; v_norm_pre text;
  v_role text; v_leaked text[] := '{}';
begin
  -- (1) the delegate is ungranted -- checked TWO ways, because a NULL proacl means "the
  -- Postgres DEFAULT applies" (PUBLIC EXECUTE for a function), never "no grantees": a naive
  -- `proacl is null` read is a false pass on exactly the leak this cell exists to catch
  -- (proven empirically in this window's own review: a same-shape probe function leaked to
  -- PUBLIC). has_function_privilege is the ground truth every estate grant-matrix test uses,
  -- checked against every clara_% role dynamically (review SHOULD-8 — a five-name literal
  -- omitted the three LOGIN roles) rather than a hand-maintained list that silently stops
  -- covering a role minted after this file is authored.
  if has_function_privilege('public', 'clara._file_document_write(jsonb,uuid,uuid,text,text)', 'EXECUTE') then
    v_leaked := v_leaked || 'public';
  end if;
  for v_role in select rolname from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner'
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

  -- (4) the REAL differential. v_norm_pre is the pre-extraction file_document TAIL, captured
  -- verbatim by rig replay at this file's prestate sha256
  -- (0be2fa15b11fee1bd28377dc8a2d44f6f5f1f37c916598a4fd24c527c5060a3b) and reproduced literally
  -- below — this is the fixture the SHOULD-5 finding asked for, inline rather than in a
  -- separate file so the pin and the diff travel together. Both sides are trimmed to their
  -- shared tail and normalized toward the SAME spelling before comparing — anything else
  -- diverging fails loud.
  -- Line comments ('-- ...') are part of prosrc verbatim and would otherwise force every
  -- comment's wording to match exactly between the two sides (including this file's OWN new
  -- comments, which have no pre-image counterpart at all) -- stripped from BOTH sides before
  -- collapsing whitespace, so the differential compares CODE, not commentary.
  select regexp_replace(lower(regexp_replace(prosrc, '--[^\n]*', '', 'g')), '\s+', '', 'g') into v_norm_new
    from pg_proc where oid = 'clara._file_document_write(jsonb,uuid,uuid,text,text)'::regprocedure;
  -- prosrc's own leading `declare` keyword has no counterpart in the pre-image literal below
  -- (which captures only the declared-variable LIST onward) -- strip it so both sides start at
  -- the same conceptual point.
  v_norm_new := regexp_replace(v_norm_new, '^declare', '');
  -- Excise the two STATED deltas: the ctx-unpacking declare and the SHOULD-7 null-guard, both
  -- in the delegate's OWN c_firm/c_actor spelling -- these have no counterpart in the pre-image
  -- (which instead declares `c record;` and never guards it). Neither substring collides with
  -- anything else in the body (checked: no other identifier contains these exact multi-token
  -- runs), unlike the naive "c_firm"->"c.firm" rename this cell used at authoring time, which
  -- silently mangled `v_doc_firm` (it contains "c_firm" as a bare substring) -- caught by this
  -- window's own rig replay and fixed by transforming the PRE-image toward the delegate's
  -- spelling instead (below), never the other way.
  v_norm_new := replace(v_norm_new,
    lower(regexp_replace('c_firm uuid:=(p_ctx->>''firm'')::uuid;c_actor uuid:=(p_ctx->>''actor'')::uuid;', '\s+', '', 'g')), '');
  v_norm_new := replace(v_norm_new,
    lower(regexp_replace(
      'if c_firm is null or c_actor is null then raise exception ''file_document context is malformed (firm/actor required)'' using errcode = ''CLR10''; end if;',
      '\s+', '', 'g')), '');
  -- The pre-image is transformed TOWARD the delegate's spelling (c.firm -> c_firm, c.actor ->
  -- c_actor), the safe direction: a literal dot has no substring-collision risk (unlike the
  -- bare "c_firm" token, which hides inside "v_doc_firm"). Its own two preamble lines -- the
  -- `c record;` declare and the `_human_ctx` call -- are stripped too; both stayed in the thin
  -- wrapper (file_document, proven separately by structural check 3 above) and have no
  -- counterpart inside the extracted delegate at all.
  v_norm_pre := lower(regexp_replace(regexp_replace(
    $preimage$c record; v_dedupe jsonb; v_doc_firm uuid; v_id uuid; v_basis text;
  v_resolution uuid; v_input_resolution uuid; v_created boolean:=false;
  v_resolution_created boolean:=false; v_facts jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  v_dedupe:=clara._reserve_op(c.firm,'file_document',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'client',p_client,
      'resolution',p_resolution)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_doc_firm from clara.documents where id=p_document for update;
  if v_doc_firm is null or v_doc_firm<>c.firm then raise exception 'document not in your firm' using errcode='CLR11'; end if;
  begin v_input_resolution:=nullif(p_resolution,'')::uuid;
  exception when invalid_text_representation then
    raise exception 'client attribution not established' using errcode='CLR01';
  end;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm and status in ('active','onboarding')) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  select id into v_id from clara.document_filings
    where document_id=p_document and client_id=p_client and retired_at is null;
  if v_id is not null then raise exception 'document is already actively filed to this client' using errcode='CLR10'; end if;
  select r.id,r.method into v_resolution,v_basis from clara.client_resolutions r
    where r.id=v_input_resolution and r.client_id=p_client and r.firm_id=c.firm
      and r.method in ('human','rule') and r.confidence>=0.95 and r.superseded_at is null
      and r.subject_kind='document' and r.subject_id=p_document;
  if v_resolution is null then
    if v_input_resolution is not null and not exists(select 1 from clara.client_resolutions r
        where r.id=v_input_resolution and r.client_id=p_client and r.firm_id=c.firm
          and r.method in ('human','rule') and r.confidence>=0.95
          and r.superseded_at is null) then
      raise exception 'client attribution not established' using errcode='CLR01';
    end if;
    insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,
        confidence,method,evidence,resolved_by)
      values(c.firm,p_client,'document',p_document,1.0,'human',
        jsonb_build_object('source_resolution_id',v_input_resolution,
          'source','file_document'),c.actor)
      returning id,method into v_resolution,v_basis;
    v_resolution_created:=true;
  end if;
  insert into clara.document_filings(firm_id,document_id,client_id,filed_by,
      resolution_id,basis)
    values(c.firm,p_document,p_client,c.actor,v_resolution,
      case when v_basis='rule' then 'rule' else 'human' end)
    returning id into v_id;
  v_created:=true;
  perform clara._recompute_document_retention(p_document);
  v_facts:=clara._enqueue_invoice_facts_core(p_document);
  perform clara._audit(c.firm,c.actor,null,null,'file_document',null,
    jsonb_build_object('document',p_document,'client',p_client,
      'resolution',v_resolution,'filing',v_id,'facts_task',v_facts->>'task_id',
      'op_key',p_op_key));
  if v_resolution_created then
    perform clara._append_event(c.firm,'client.resolved',p_client,c.actor,null,null,
      null,p_document,v_resolution,'{}'::jsonb);
  end if;
  if v_created then
    perform clara._append_event(c.firm,'document.filed',p_client,c.actor,null,null,
      null,p_document,v_resolution,jsonb_build_object('filing_id',v_id));
  end if;
  if v_facts->>'status'='failed'
     -- 0038 E2c: statement-lane terminal receipts emit their own STATEMENT twin inside
     -- the core; this caller-side invoice-twin emit stays for the invoice lanes only.
     and coalesce((select t38.lane from clara.document_processing_tasks t38
       where t38.id=(v_facts->>'task_id')::uuid),'')
       not in ('statement_facts','statement_parse') then
    perform clara._append_event(c.firm,'document.invoice_facts_failed',null,c.actor,null,null,
      null,p_document,null,jsonb_build_object('task_id',v_facts->>'task_id',
        'reason',v_facts->>'reason'));
  end if;
  return clara._finish_op(c.firm,'file_document',p_op_key,
    jsonb_build_object('filing_id',v_id,'document_id',p_document,'client_id',p_client));
end$preimage$,
    '--[^\n]*', '', 'g'),
    '\s+', '', 'g'));
  v_norm_pre := replace(v_norm_pre,
    lower(regexp_replace($$c record;$$, '\s+', '', 'g')), '');
  v_norm_pre := replace(v_norm_pre,
    lower(regexp_replace($$c:=clara._human_ctx(clara.role_rank('bookkeeper'));$$, '\s+', '', 'g')), '');
  v_norm_pre := replace(replace(v_norm_pre, 'c.firm', 'c_firm'), 'c.actor', 'c_actor');
  if v_norm_new is distinct from v_norm_pre then
    -- Locate the first divergence for the reader, not just the fact of one -- lengths first
    -- (a truncation shows immediately), then a windowed byte position (a future edit near
    -- either normalization step is the most likely re-break, and this names exactly where).
    raise notice 'f_a7_alpha1 postcheck diagnostic: normalized lengths new=% pre=%', length(v_norm_new), length(v_norm_pre);
    for v_role in select generate_series(1, least(length(v_norm_new), length(v_norm_pre)))::text loop
      if substr(v_norm_new, v_role::int, 1) is distinct from substr(v_norm_pre, v_role::int, 1) then
        raise notice 'f_a7_alpha1 postcheck diagnostic: first divergence at byte %: new=[...%...] pre=[...%...]', v_role,
          substr(v_norm_new, greatest(1, v_role::int-40), 90), substr(v_norm_pre, greatest(1, v_role::int-40), 90);
        exit;
      end if;
    end loop;
    raise exception 'f_a7_alpha1 postcheck: _file_document_write diverges from the pre-extraction body beyond the two stated deltas (ctx wrapper, null-guard) -- the extraction is not behaviour-inert' using errcode = 'CLR10';
  end if;
  -- Structural marker check, belt-and-suspenders beside the real differential above (the
  -- differential already proves this; these are named assertions so a future edit to the
  -- differential's own exclusion list cannot silently stop covering the property):
  -- exactly the substituted c.firm/c.actor pair count, and every load-bearing call intact.
  if (length(v_norm_new) - length(replace(v_norm_new, 'c_firm', ''))) / length('c_firm') < 4 then
    raise exception 'f_a7_alpha1 postcheck: _file_document_write body looks truncated (too few c_firm references)' using errcode = 'CLR10';
  end if;
  if position('_reserve_op' in v_norm_new) = 0 or position('_finish_op' in v_norm_new) = 0
     or position('_append_event' in v_norm_new) = 0 or position('_enqueue_invoice_facts_core' in v_norm_new) = 0 then
    raise exception 'f_a7_alpha1 postcheck: _file_document_write is missing a load-bearing call from the pre-image' using errcode = 'CLR10';
  end if;

  raise notice 'f_a7_alpha1 postcheck: OK -- file_document is a thin delegate (ACL unmoved), _file_document_write carries the extracted write ungranted with every load-bearing call intact';
end
$postcheck$;
