-- 0018_gate_k_domain — the Gate-K / accounting-domain deltas (WB-R24(i)).
--
-- Four DB items from docs/plan/wave-b-migration-0018-design.md (v1.0, RATIFIED):
--   §1 subject-bound keyed resolutions (binding columns + FK + partial index; the
--      bound mint verb; the PRIVATE bound assert with FOR SHARE; the generic
--      assert's one-line binding-escape confinement; the keyed-lane switch in
--      _draft_opening_item_core);
--   §2 seed_fixed_asset gains p_resolution (DROP 4-arg, CREATE 5-arg DEFAULT NULL;
--      locked-filing resolution derivation; resolution_conflicts_with_tie; the
--      BYTE-IDENTICAL legacy op-hash when p_resolution is null, inclusion when not);
--   §3 the dual-lane purity guards (one private classifier + BOTH K5/K6 guards with
--      their typed CLR31 reasons — closes the K5 stranding hole + the K6 hole);
--   §4 the five typed CLR10 reasons on commit_client_onboarding (site 2 SPLIT with
--      pinned precedence plan_not_open > client_not_onboarding);
--   §5(DB half) both approval verbs' return jsonb gains DB-authored entry_count.
-- Plus §6's in-transaction fail-closed tail battery. No workflow-body changes;
-- zero freeze-manifest implication. Validate on a throwaway Postgres only.
--
-- Structure: the binding DDL + every function body runs under `set role
-- clara_fn_owner` (the 0014:46 idiom — the definer must own the functions so
-- SECURITY DEFINER keeps its authority); the get_context_pack surgery runs in the
-- same owner window so the re-created body stays owner-owned. Grants + the tail
-- battery run after `reset role` (as the migration role), matching 0017's tail.
-- Large existing bodies are patched via pg_get_functiondef + string surgery (the
-- 0017 CoR-prestate idiom) so an anchor drift ABORTS the apply rather than silently
-- reproducing 300 lines. One transaction; any failure aborts.

set role clara_fn_owner;

-- =====================================================================
-- §1a. STRUCTURAL BINDING — client_resolutions gains a subject-bound scope.
-- All existing rows are unbound (columns are new + nullable), so the composite
-- FK is MATCH SIMPLE-skipped for them and every generic-assert consumer keeps
-- byte-identical behaviour.
-- =====================================================================
alter table clara.client_resolutions
  add column bound_scope_kind text
    check (bound_scope_kind in ('opening_seed')),
  add column bound_scope_id uuid,
  add constraint ck_client_resolutions_bound_scope_pair
    check ((bound_scope_kind is null) = (bound_scope_id is null)),
  add constraint fk_client_resolutions_bound_scope
    foreign key (bound_scope_id, firm_id, client_id)
    references clara.opening_seed_registry (id, firm_id, client_id);
-- [AMB-0018-3] UNIQUE partial index: at most ONE live binding per scope, structural
-- (the mint's in-txn auto-supersede below is what keeps callers on the legal side).
create unique index ix_client_resolutions_bound_scope
  on clara.client_resolutions (bound_scope_kind, bound_scope_id)
  where superseded_at is null;

-- =====================================================================
-- §1b. CAPABILITY CONFINEMENT — the sole touch to the shared generic assert.
-- One added predicate line: a BOUND resolution can never satisfy the generic
-- gate, so it is usable ONLY on its bound lane. Body otherwise byte-identical to
-- 0004; CoR preserves the (ungranted) ACL.
-- =====================================================================
create or replace function clara.assert_client_resolved(p_client uuid, p_resolution uuid, p_document uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.client_resolutions r
   where r.id = p_resolution and r.client_id = p_client
     and r.method in ('human','rule') and r.confidence >= 0.95 and r.superseded_at is null
     and (p_document is null or (r.subject_kind = 'document' and r.subject_id = p_document))
     and r.bound_scope_kind is null;
  if not found then
    raise exception 'client attribution not established' using errcode = 'CLR01';
  end if;
end $$;

-- =====================================================================
-- §1c. THE BOUND ASSERT (PRIVATE — no grants, like the other assert_* internals).
-- The 0004 predicate (human/rule, >=0.95, live) PLUS the binding equality, and it
-- locks the qualifying resolution row FOR SHARE (supersede race). CLR01.
-- =====================================================================
create function clara.assert_client_resolved_bound(p_client uuid, p_resolution uuid,
    p_scope_kind text, p_scope_id uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.client_resolutions r
   where r.id = p_resolution and r.client_id = p_client
     and r.method in ('human','rule') and r.confidence >= 0.95 and r.superseded_at is null
     and r.bound_scope_kind = p_scope_kind and r.bound_scope_id = p_scope_id
   for share;
  if not found then
    raise exception 'client attribution not established' using errcode = 'CLR01';
  end if;
end $$;

-- =====================================================================
-- §1d. THE BOUND MINT VERB — human lane, bookkeeper+ floor. Categorical human
-- confirmation: confidence pinned 1.0 (no caller confidence). The seed must
-- belong to p_client AND be KEYED. GRANT clara_authenticated ONLY.
-- =====================================================================
create function clara.record_opening_keyed_resolution(p_client uuid, p_seed uuid,
    p_evidence jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; s record; v_dedupe jsonb; v_id uuid; v_evidence jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- [R1-0018-2] A non-object, non-null evidence payload is refused BEFORE
  -- _reserve_op (an invalid call must never consume an op_key / reserve
  -- idempotency state). A SQL-NULL p_evidence is legal — it coalesces to
  -- '{}'::jsonb below and the canonical spine still survives the merge.
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'object' then
    raise exception 'evidence must be a JSON object'
      using errcode = 'CLR10', detail = '{"reason":"evidence_not_object"}';
  end if;
  -- Hash covers EVERY (non-op_key) argument.
  v_dedupe := clara._reserve_op(c.firm, 'record_opening_keyed_resolution', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'seed', p_seed, 'evidence', p_evidence)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- [R1-0018-1] FOR UPDATE serializes concurrent mints on ONE seed: the second
  -- mint waits for the first's commit, then (via the supersede UPDATE below)
  -- sees and supersedes the winner's row before its own insert — last-wins,
  -- and a raw 23505 off the partial unique index is unreachable.
  select * into s from clara.opening_seed_registry
    where id = p_seed and firm_id = c.firm and client_id = p_client
    for update;
  if not found then
    raise exception 'opening seed not in your firm/client' using errcode = 'CLR11';
  end if;
  if s.tie_document_id is not null then
    raise exception 'a document-tied seed has no keyed resolution to mint'
      using errcode = 'CLR10', detail = '{"reason":"tie_document_present"}';
  end if;
  -- Canonical evidence: caller evidence merged UNDER an authoritative spine
  -- (the spine wins on collision — a caller cannot spoof source/seed_id).
  v_evidence := coalesce(p_evidence, '{}'::jsonb)
    || jsonb_build_object('source', 'opening_keyed_seed', 'seed_id', p_seed);
  -- [AMB-0018-3] Auto-supersede the prior live bound row of this scope in-txn:
  -- re-attribution after an operator error is ONE mint (no extra verb). The UPDATE
  -- takes a row lock that serializes against the bound assert's FOR SHARE (the
  -- supersede race), and the UNIQUE partial index guarantees exactly one live row
  -- survives.
  update clara.client_resolutions
    set superseded_at = now()
    where bound_scope_kind = 'opening_seed' and bound_scope_id = p_seed
      and superseded_at is null;
  insert into clara.client_resolutions(client_id, subject_kind, subject_id, confidence,
      method, evidence, resolved_by, bound_scope_kind, bound_scope_id)
    values (p_client, 'manual', p_seed, 1.0, 'human', v_evidence, c.actor,
      'opening_seed', p_seed)
    returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'record_opening_keyed_resolution', null,
    jsonb_build_object('client', p_client, 'seed', p_seed, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'record_opening_keyed_resolution', p_op_key,
    jsonb_build_object('resolution_id', v_id));
end $$;

-- =====================================================================
-- §3a. THE ONE PRIVATE AUTHORITATIVE CLASSIFIER (PRIVATE — no grants).
-- Partitions a seed's ASSOCIATED draft is_opening_balance entries.
--   associated  = direct opening_items row OR reversal-of a seed item
--   correction  = direct row with supersedes_item_id IS NOT NULL
--                 OR reversal-of a seed item
--   non-correction = associated MINUS correction
-- The predicate is the EXACT set algebra used by K6 today; a sloppy complement
-- false-positives on legitimate reversal/replacement/multi-round/FA shapes.
-- =====================================================================
create function clara._opening_seed_draft_class(p_seed uuid)
  returns table(entry_id uuid, is_correction boolean)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select je.id,
    (exists(select 1 from clara.opening_items x where x.seed_id = p_seed
        and x.entry_id = je.id and x.supersedes_item_id is not null)
     or exists(select 1 from clara.opening_items x where x.seed_id = p_seed
        and x.entry_id = je.reversal_of)) as is_correction
  from clara.journal_entries je
  join clara.opening_seed_registry s on s.id = p_seed
  where je.status = 'draft' and je.is_opening_balance
    and je.firm_id = s.firm_id and je.client_id = s.client_id
    and (exists(select 1 from clara.opening_items x where x.seed_id = p_seed
          and x.entry_id = je.id)
      or exists(select 1 from clara.opening_items x where x.seed_id = p_seed
          and x.entry_id = je.reversal_of));
$$;

-- =====================================================================
-- §2. seed_fixed_asset gains p_resolution (DROP the 4-arg, CREATE the 5-arg).
-- Tied seed: lock the exact active filing FIRST and derive the resolution from
-- THAT filing id (closes the retire/refile race vs the old unlocked read); a
-- non-null p_resolution alongside a tie is a conflict. Keyed seed: p_resolution
-- flows to the core -> the §1 bound assert. Op-hash BYTE-IDENTICAL when null.
-- =====================================================================
drop function clara.seed_fixed_asset(uuid, uuid, jsonb, text);
create function clara.seed_fixed_asset(
    p_client uuid, p_seed uuid, p_asset jsonb, p_op_key text,
    p_resolution uuid default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; s record; v_dedupe jsonb; v_item jsonb; v_result jsonb;
  v_resolution uuid; v_document uuid; v_sha text; v_asset jsonb; v_filing uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' or jsonb_typeof(p_asset) <> 'object' then
    raise exception 'fixed asset envelope and op_key are required' using errcode = 'CLR10';
  end if;
  -- Op-hash: BYTE-IDENTICAL to the 4-arg as-built when p_resolution is null
  -- (pre-0018 document-tied receipts replay byte-identically); the resolution is
  -- folded in only when supplied (same intent + different resolution = CLR10).
  v_dedupe := clara._reserve_op(c.firm, 'seed_fixed_asset', p_op_key,
    clara._hash(case when p_resolution is null then
        jsonb_build_object('client', p_client, 'seed', p_seed, 'asset', p_asset)
      else
        jsonb_build_object('client', p_client, 'seed', p_seed, 'asset', p_asset,
          'resolution', p_resolution) end));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into s from clara.opening_seed_registry
    where id = p_seed and firm_id = c.firm and client_id = p_client;
  if not found then
    raise exception 'opening seed not in your firm/client' using errcode = 'CLR11';
  end if;
  v_document := s.tie_document_id; v_sha := s.tie_document_sha256;
  if v_document is not null then
    -- Explicit-null p_resolution is treated as omitted (DEFAULT NULL cannot
    -- distinguish them); a NON-null resolution alongside a tie is a conflict.
    if p_resolution is not null then
      raise exception 'a caller resolution conflicts with a document-tied seed'
        using errcode = 'CLR10', detail = '{"reason":"resolution_conflicts_with_tie"}';
    end if;
    -- Lock the exact active filing FIRST, then derive the resolution from it.
    v_filing := clara._active_document_filing(v_document, v_sha, p_client, true);
    select f.resolution_id into v_resolution from clara.document_filings f
      where f.id = v_filing;
  else
    v_resolution := p_resolution;
  end if;
  v_asset := coalesce(p_asset->'asset', p_asset);
  v_item := jsonb_build_object('item_kind', 'fixed_asset',
    'item_key', v_asset->>'item_key', 'amount_cents', v_asset->>'cost_cents',
    'asset', v_asset);
  v_result := clara._draft_opening_item_core(c.actor, c.firm, p_client, p_seed,
    v_item, null, v_resolution, v_document, v_sha);
  perform clara._audit(c.firm, c.actor, null, null, 'seed_fixed_asset',
    (v_result->>'entry_id')::uuid, jsonb_build_object(
      'client', p_client, 'seed', p_seed,
      'fixed_asset_id', v_result->>'fixed_asset_id', 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'entry.drafted', p_client, c.actor, null, null,
    (v_result->>'entry_id')::uuid, v_document, v_resolution, '{}'::jsonb);
  return clara._finish_op(c.firm, 'seed_fixed_asset', p_op_key, v_result);
end $$;

-- =====================================================================
-- §1e. ENFORCEMENT — the keyed lane (p_document IS NULL) of
-- _draft_opening_item_core calls the bound assert with ('opening_seed', p_seed);
-- the document-tied lane is unchanged. Single-line surgery on the sole
-- assert_client_resolved call; an anchor drift ABORTS.
-- =====================================================================
do $cor$
declare v_def text; v_anchor text; v_next text;
begin
  select pg_get_functiondef(
    'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure)
    into v_def;
  -- [R1-0018-3] the anchor must match EXACTLY ONCE in the pre-surgery source,
  -- and the post-replacement source must differ from it; either miss aborts.
  v_anchor := 'perform clara.assert_client_resolved(p_client,p_resolution,p_document);';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: _draft_opening_item_core keyed-lane anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    'if p_document is null then perform clara.assert_client_resolved_bound(p_client,p_resolution,''opening_seed'',p_seed); else perform clara.assert_client_resolved(p_client,p_resolution,p_document); end if;');
  if v_next = v_def then
    raise exception '0018: _draft_opening_item_core keyed-lane anchor drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor$;

-- =====================================================================
-- §3b. K5 GUARD (approve_opening_seed) — refuse when any CORRECTION draft
-- exists (closes the verified stranding hole: the approve loop joins
-- opening_items directly while the basis counts reversals via reversal_of).
-- §5 DB half: the return jsonb gains DB-authored entry_count.
-- =====================================================================
do $cor$
declare v_def text; v_cur text; v_next text; v_anchor text;
begin
  select pg_get_functiondef(
    'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure)
    into v_def;
  v_cur := v_def;

  -- guard: placed immediately before _assert_opening_tie, inside the existing
  -- advisory-lock + serializable envelope (the seed FOR UPDATE already serializes
  -- against _draft_opening_item_core's FOR SHARE; no new lock key).
  -- [R1-0018-3] exactly-one anchor match + changed-result, per replacement.
  v_anchor := 'perform clara._assert_opening_tie(p_seed);';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: approve_opening_seed K5-guard anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    'if exists(select 1 from clara._opening_seed_draft_class(p_seed) where is_correction) then raise exception ''a correction draft blocks the opening batch'' using errcode=''CLR31'',detail=''{"reason":"correction_draft_present"}''; end if; perform clara._assert_opening_tie(p_seed);');
  if v_next = v_cur then
    raise exception '0018: approve_opening_seed K5-guard anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  -- DB-authored entry_count in the receipt.
  v_anchor := '''batch_n'',v_batch,''entries'',v_entries);';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: approve_opening_seed entry_count anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    '''batch_n'',v_batch,''entry_count'',jsonb_array_length(v_entries),''entries'',v_entries);');
  if v_next = v_cur then
    raise exception '0018: approve_opening_seed entry_count anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  execute v_cur;
end
$cor$;

-- =====================================================================
-- §3c. K6 GUARD (approve_opening_correction) — refuse when any NON-CORRECTION
-- draft exists (closes the dossier's K6 hole). Placed after the
-- has-correction-drafts check, before _assert_opening_tie. §5 DB half:
-- entry_count in the receipt.
-- =====================================================================
do $cor$
declare v_def text; v_cur text; v_next text; v_anchor text;
begin
  select pg_get_functiondef(
    'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure)
    into v_def;
  v_cur := v_def;

  -- [AMB-0018-2] The non_correction_draft_present guard runs BEFORE the
  -- pre-existing has-correction-drafts existence check (the sole `if not exists(
  -- select 1 from clara.journal_entries je ...` in this body), so a reopened
  -- seed carrying ONLY additive (non-correction) drafts surfaces the new typed
  -- reason, never the legacy revision_mismatch "no draft entries".
  -- [R1-0018-3] exactly-one anchor match + changed-result, per replacement.
  v_anchor := 'if not exists(select 1 from clara.journal_entries je';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: approve_opening_correction K6-guard anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    'if exists(select 1 from clara._opening_seed_draft_class(p_seed) where not is_correction) then raise exception ''a non-correction draft blocks the opening correction'' using errcode=''CLR31'',detail=''{"reason":"non_correction_draft_present"}''; end if; if not exists(select 1 from clara.journal_entries je');
  if v_next = v_cur then
    raise exception '0018: approve_opening_correction K6-guard anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  v_anchor := '''batch_n'',v_batch,''entries'',v_entries);';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: approve_opening_correction entry_count anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    '''batch_n'',v_batch,''entry_count'',jsonb_array_length(v_entries),''entries'',v_entries);');
  if v_next = v_cur then
    raise exception '0018: approve_opening_correction entry_count anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  execute v_cur;
end
$cor$;

-- =====================================================================
-- §4. TYPED REASONS on commit_client_onboarding's four free-text CLR10s. Site 2
-- SPLITS into ordered branches with pinned precedence (plan_not_open first, then
-- client_not_onboarding). Codes stay CLR10; messages stay human.
-- =====================================================================
do $cor$
declare v_def text; v_cur text; v_next text; v_anchor text;
begin
  select pg_get_functiondef(
    'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'::regprocedure)
    into v_def;
  v_cur := v_def;
  -- [R1-0018-3] every one of the five replacements below asserts an
  -- EXACTLY-ONE anchor match against the running source AND that its own
  -- post-replacement result differs from its pre-replacement input; a miss on
  -- either aborts the migration (drift-abort), never a silent no-op.

  -- (1) op_key_required
  v_anchor := 'raise exception ''op_key is required'' using errcode=''CLR10'';';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: commit_client_onboarding op_key_required anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    'raise exception ''op_key is required'' using errcode=''CLR10'',detail=''{"reason":"op_key_required"}'';');
  if v_next = v_cur then
    raise exception '0018: commit_client_onboarding op_key_required anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  -- (2) site-2 split: condition then the two ordered branches (plan_not_open wins).
  v_anchor := 'if p.state<>''open'' or cl.status<>''onboarding'' then';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: commit_client_onboarding site-2 condition anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor, 'if p.state<>''open'' then');
  if v_next = v_cur then
    raise exception '0018: commit_client_onboarding site-2 condition anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  v_anchor := 'raise exception ''client onboarding is not open'' using errcode=''CLR10'';';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: commit_client_onboarding site-2 raise anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    'raise exception ''client onboarding is not open'' using errcode=''CLR10'',detail=''{"reason":"plan_not_open"}''; elsif cl.status<>''onboarding'' then raise exception ''client onboarding is not open'' using errcode=''CLR10'',detail=''{"reason":"client_not_onboarding"}'';');
  if v_next = v_cur then
    raise exception '0018: commit_client_onboarding site-2 raise anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  -- (3) questions_unresolved (message + the next-line using clause)
  v_anchor := 'raise exception ''required onboarding questions remain unresolved''' || chr(10) || '      using errcode=''CLR10'';';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: commit_client_onboarding questions_unresolved anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    'raise exception ''required onboarding questions remain unresolved''' || chr(10) || '      using errcode=''CLR10'',detail=''{"reason":"questions_unresolved"}'';');
  if v_next = v_cur then
    raise exception '0018: commit_client_onboarding questions_unresolved anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  -- (4) opening_position_required
  v_anchor := 'raise exception ''an opening position is required before activation''' || chr(10) || '      using errcode=''CLR10'';';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: commit_client_onboarding opening_position_required anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
    'raise exception ''an opening position is required before activation''' || chr(10) || '      using errcode=''CLR10'',detail=''{"reason":"opening_position_required"}'';');
  if v_next = v_cur then
    raise exception '0018: commit_client_onboarding opening_position_required anchor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  execute v_cur;
end
$cor$;

-- =====================================================================
-- §6(pack). get_context_pack's serialized resolution shape must EXCLUDE the
-- binding columns (they exist on the table for a direct PostgREST read-back, but
-- must never leak into the agent's context pack). Owner window so the re-created
-- body stays owner-owned.
-- =====================================================================
do $cor$
declare v_def text; v_anchor text; v_next text;
begin
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) into v_def;
  -- [R1-0018-3] exactly-one anchor match + changed-result.
  v_anchor := 'jsonb_agg(to_jsonb(r) order by r.created_at desc)';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0018: get_context_pack resolution-exclusion anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    'jsonb_agg((to_jsonb(r)-''bound_scope_kind''-''bound_scope_id'') order by r.created_at desc)');
  if v_next = v_def then
    raise exception '0018: get_context_pack resolution-exclusion anchor drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor$;

reset role;

-- =====================================================================
-- GRANTS (as the migration role). The 5-arg seed_fixed_asset (the 4-arg grant
-- died with its DROP) and the bound mint are clara_authenticated ONLY. The bound
-- assert + the classifier are PRIVATE (no grants). The modified
-- approve_*/commit_* keep their 0017 ACLs (CoR preserves them).
-- =====================================================================
revoke execute on all functions in schema clara from public;
grant execute on function
  clara.seed_fixed_asset(uuid, uuid, jsonb, text, uuid),
  clara.record_opening_keyed_resolution(uuid, uuid, jsonb, text)
  to clara_authenticated;

-- =====================================================================
-- §6. FAIL-CLOSED TAIL BATTERY. Static catalog/prosrc/ACL asserts + one
-- empirical precondition + one functional probe inside a forced-rollback
-- subtransaction (a probe must never commit fixture rows into production).
-- One transaction; any failure aborts the apply.
-- =====================================================================
do $tail$
declare
  v_def text; v_src text; v_sig text; v_name text; v_owner oid;
  v_f uuid; v_u uuid; v_c uuid; v_p uuid; v_s uuid; v_ru uuid; v_rb uuid;
  v_probe_ok boolean;
begin
  v_owner := (select oid from pg_roles where rolname = 'clara_fn_owner');

  -- ---- §1a binding columns + paired CHECK + composite FK + partial index ----
  if not exists(select 1 from pg_attribute where attrelid = 'clara.client_resolutions'::regclass
        and attname = 'bound_scope_kind' and atttypid = 'text'::regtype and not attisdropped)
     or not exists(select 1 from pg_attribute where attrelid = 'clara.client_resolutions'::regclass
        and attname = 'bound_scope_id' and atttypid = 'uuid'::regtype and not attisdropped) then
    raise exception '0018 binding columns missing' using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.client_resolutions'::regclass
      and conname = 'ck_client_resolutions_bound_scope_pair';
  if regexp_replace(lower(coalesce(v_def, '')), '\s+', '', 'g')
       not like '%(bound_scope_kindisnull)=(bound_scope_idisnull)%' then
    raise exception '0018 paired CHECK shape assertion failed' using errcode = 'CLR10';
  end if;
  -- [R1-0018-4][R2-0018-1] the bound_scope_kind column CHECK: EXACTLY ONE such
  -- constraint exists (distinguished from the paired CHECK by NOT referencing
  -- bound_scope_id), and its normalized definition EQUALS the exact
  -- allowed-value predicate — a substring match could false-pass a widened
  -- predicate (e.g. "... OR bound_scope_kind='x'").
  if (select count(*) from pg_constraint
      where conrelid = 'clara.client_resolutions'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%bound_scope_kind%'
        and pg_get_constraintdef(oid) not ilike '%bound_scope_id%') <> 1 then
    raise exception '0018 bound_scope_kind CHECK: expected exactly one' using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.client_resolutions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%bound_scope_kind%'
      and pg_get_constraintdef(oid) not ilike '%bound_scope_id%';
  if regexp_replace(lower(v_def), '\s+', '', 'g')
       <> 'check((bound_scope_kind=''opening_seed''::text))' then
    raise exception '0018 bound_scope_kind CHECK allowed-value predicate assertion failed (got: %)', v_def using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
    where conrelid = 'clara.client_resolutions'::regclass
      and conname = 'fk_client_resolutions_bound_scope' and contype = 'f';
  if regexp_replace(lower(coalesce(v_def, '')), '\s+', '', 'g')
       not like '%foreignkey(bound_scope_id,firm_id,client_id)referencesclara.opening_seed_registry(id,firm_id,client_id)%' then
    raise exception '0018 composite FK shape assertion failed' using errcode = 'CLR10';
  end if;
  if not exists(select 1 from pg_class i join pg_namespace n on n.oid = i.relnamespace
        where n.nspname = 'clara' and i.relname = 'ix_client_resolutions_bound_scope'
          and i.relkind = 'i') then
    raise exception '0018 partial index missing' using errcode = 'CLR10';
  end if;
  select pg_get_indexdef('clara.ix_client_resolutions_bound_scope'::regclass) into v_def;
  if regexp_replace(lower(coalesce(v_def, '')), '\s+', '', 'g')
       not like '%(bound_scope_kind,bound_scope_id)where(superseded_atisnull)%' then
    raise exception '0018 partial index predicate assertion failed' using errcode = 'CLR10';
  end if;
  -- [AMB-0018-3] the partial index is UNIQUE (one LIVE binding per scope).
  if not (select indisunique from pg_index
      where indexrelid = 'clara.ix_client_resolutions_bound_scope'::regclass) then
    raise exception '0018 bound-scope index is not UNIQUE' using errcode = 'CLR10';
  end if;

  -- ---- §1b/§1c/§1e body markers: confinement predicate, FOR SHARE + binding
  -- equality, keyed-lane switch ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.assert_client_resolved(uuid,uuid,uuid)'::regprocedure;
  if position('r.bound_scope_kindisnull' in v_src) = 0 then
    raise exception '0018 capability-confinement predicate missing' using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.assert_client_resolved_bound(uuid,uuid,text,uuid)'::regprocedure;
  if position('forshare' in v_src) = 0
     or position('r.bound_scope_kind=p_scope_kindandr.bound_scope_id=p_scope_id' in v_src) = 0 then
    raise exception '0018 bound-assert FOR SHARE / binding equality missing' using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara._draft_opening_item_core(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid,text)'::regprocedure;
  if position('ifp_documentisnullthenperformclara.assert_client_resolved_bound(p_client,p_resolution,''opening_seed'',p_seed)' in v_src) = 0 then
    raise exception '0018 keyed-lane switch missing in draft core' using errcode = 'CLR10';
  end if;

  -- ---- §3 both lane guards present + the classifier's exact set algebra ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)'::regprocedure;
  if position('clara._opening_seed_draft_class(p_seed)whereis_correction' in v_src) = 0
     or position('correction_draft_present' in v_src) = 0
     or position('''entry_count'',jsonb_array_length(v_entries),''entries'',v_entries)' in v_src) = 0 then
    raise exception '0018 K5 lane guard / entry_count missing' using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.approve_opening_correction(uuid,jsonb,text,text)'::regprocedure;
  if position('clara._opening_seed_draft_class(p_seed)wherenotis_correction' in v_src) = 0
     or position('non_correction_draft_present' in v_src) = 0
     or position('''entry_count'',jsonb_array_length(v_entries),''entries'',v_entries)' in v_src) = 0 then
    raise exception '0018 K6 lane guard / entry_count missing' using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara._opening_seed_draft_class(uuid)'::regprocedure;
  if position('x.entry_id=je.idandx.supersedes_item_idisnotnull' in v_src) = 0
     or position('x.entry_id=je.reversal_of' in v_src) = 0
     or position('je.status=''draft''andje.is_opening_balance' in v_src) = 0 then
    raise exception '0018 classifier set-algebra assertion failed' using errcode = 'CLR10';
  end if;

  -- ---- §4 the five typed commit reasons ----
  select prosrc into v_src from pg_proc
    where oid = 'clara.commit_client_onboarding(uuid,uuid,uuid,text,text)'::regprocedure;
  if position('op_key_required' in v_src) = 0 or position('plan_not_open' in v_src) = 0
     or position('client_not_onboarding' in v_src) = 0
     or position('questions_unresolved' in v_src) = 0
     or position('opening_position_required' in v_src) = 0 then
    raise exception '0018 commit typed-reason tokens missing' using errcode = 'CLR10';
  end if;

  -- ---- §6(pack) resolution binding-column exclusion ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.get_context_pack(uuid,text)'::regprocedure;
  if position('jsonb_agg((to_jsonb(r)-''bound_scope_kind''-''bound_scope_id'')orderby' in v_src) = 0
     or position('jsonb_agg(to_jsonb(r)orderby' in v_src) > 0 then
    raise exception '0018 pack resolution-exclusion assertion failed' using errcode = 'CLR10';
  end if;

  -- ---- §7 catalog shape: exact 4-input row ABSENT, 5-arg present + attributes ----
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = 'seed_fixed_asset' and p.pronargs = 4) then
    raise exception '0018 legacy 4-arg seed_fixed_asset still present' using errcode = 'CLR10';
  end if;
  if not exists(select 1 from pg_proc where oid = 'clara.seed_fixed_asset(uuid,uuid,jsonb,text,uuid)'::regprocedure) then
    raise exception '0018 5-arg seed_fixed_asset missing' using errcode = 'CLR10';
  end if;
  if (select pronargdefaults from pg_proc
        where oid = 'clara.seed_fixed_asset(uuid,uuid,jsonb,text,uuid)'::regprocedure) <> 1 then
    raise exception '0018 seed_fixed_asset default arity assertion failed' using errcode = 'CLR10';
  end if;
  -- owner / SECURITY DEFINER / search_path for every new fn.
  foreach v_sig in array array[
    'clara.record_opening_keyed_resolution(uuid,uuid,jsonb,text)',
    'clara.assert_client_resolved_bound(uuid,uuid,text,uuid)',
    'clara.seed_fixed_asset(uuid,uuid,jsonb,text,uuid)',
    'clara._opening_seed_draft_class(uuid)'
  ] loop
    if not exists(select 1 from pg_proc p where p.oid = v_sig::regprocedure
        and p.prosecdef and p.proowner = v_owner
        and exists(select 1 from unnest(p.proconfig) x where x like 'search_path=%')) then
      raise exception '0018 new-fn owner/secdef/search_path assertion failed for %', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  -- arg names/defaults of the granted new fns.
  if (select proargnames from pg_proc
        where oid = 'clara.record_opening_keyed_resolution(uuid,uuid,jsonb,text)'::regprocedure)
       is distinct from array['p_client','p_seed','p_evidence','p_op_key']::text[] then
    raise exception '0018 mint arg-name assertion failed' using errcode = 'CLR10';
  end if;
  if (select proargnames from pg_proc
        where oid = 'clara.seed_fixed_asset(uuid,uuid,jsonb,text,uuid)'::regprocedure)
       is distinct from array['p_client','p_seed','p_asset','p_op_key','p_resolution']::text[] then
    raise exception '0018 seed_fixed_asset arg-name assertion failed' using errcode = 'CLR10';
  end if;
  if (select proargnames from pg_proc
        where oid = 'clara.assert_client_resolved_bound(uuid,uuid,text,uuid)'::regprocedure)
       is distinct from array['p_client','p_resolution','p_scope_kind','p_scope_id']::text[] then
    raise exception '0018 bound-assert arg-name assertion failed' using errcode = 'CLR10';
  end if;

  -- ---- §6 grant closed-set: the granted pair is clara_authenticated ONLY ----
  foreach v_sig in array array[
    'clara.seed_fixed_asset(uuid,uuid,jsonb,text,uuid)',
    'clara.record_opening_keyed_resolution(uuid,uuid,jsonb,text)'
  ] loop
    if not has_function_privilege('clara_authenticated', v_sig, 'execute') then
      raise exception '0018 auth grant missing for %', v_sig using errcode = 'CLR10';
    end if;
    if has_function_privilege('clara_runtime', v_sig, 'execute')
       or has_function_privilege('clara_agent_ro', v_sig, 'execute')
       or has_function_privilege('clara_wake_interactive', v_sig, 'execute')
       or has_function_privilege('clara_wake_proactive', v_sig, 'execute') then
      raise exception '0018 non-auth role gained EXECUTE on %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  -- the bound assert + the classifier are PRIVATE (zero grants to any app role).
  foreach v_sig in array array[
    'clara.assert_client_resolved_bound(uuid,uuid,text,uuid)',
    'clara._opening_seed_draft_class(uuid)'
  ] loop
    if has_function_privilege('clara_authenticated', v_sig, 'execute')
       or has_function_privilege('clara_runtime', v_sig, 'execute')
       or has_function_privilege('clara_agent_ro', v_sig, 'execute')
       or has_function_privilege('clara_wake_interactive', v_sig, 'execute')
       or has_function_privilege('clara_wake_proactive', v_sig, 'execute') then
      raise exception '0018 PRIVATE fn leaked a grant: %', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §6 PUBLIC-execute sweep across the whole schema ----
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'clara' and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception '0018 PUBLIC execute sweep failed' using errcode = 'CLR10';
  end if;

  -- ---- §6 wiki-leak + sightings/autopost scans over every touched fn
  -- (get_context_pack is the pack surface; it legitimately reads wiki data and is
  -- excluded here — 0017 already whitelists it) ----
  foreach v_name in array array[
    'assert_client_resolved', 'assert_client_resolved_bound',
    'record_opening_keyed_resolution', '_opening_seed_draft_class',
    'seed_fixed_asset', '_draft_opening_item_core', 'approve_opening_seed',
    'approve_opening_correction', 'commit_client_onboarding'
  ] loop
    if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = v_name
          and p.prosrc ~* '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M') then
      raise exception '0018 wiki authority leaked into %', v_name using errcode = 'CLR10';
    end if;
    if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = v_name
          and (p.prosrc ilike '%rule_sightings%' or p.prosrc ilike '%autopost%')) then
      raise exception '0018 sightings/autopost authority leaked into %', v_name using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §6 no new allowlist row for the granted fns ----
  if exists(select 1 from clara.wake_fn_allowlist
      where function_name in ('record_opening_keyed_resolution', 'seed_fixed_asset')) then
    raise exception '0018 function leaked into wake_fn_allowlist' using errcode = 'CLR10';
  end if;

  -- ---- §6 apply-time precondition (EMPIRICAL, real data, NOT rolled back):
  -- zero existing keyed opening items/drafts. No live keyed flow exists, but the
  -- migration must not assume it — a keyed opening item is one whose entry carries
  -- no document (the keyed lane). ----
  if exists(select 1 from clara.opening_items oi
      join clara.journal_entries je on je.id = oi.entry_id
      where je.document_id is null) then
    raise exception '0018 precondition: existing keyed opening items present — subject-bound keyed resolutions cannot be retrofitted'
      using errcode = 'CLR10';
  end if;

  -- ---- §6 FUNCTIONAL PROBE (forced-rollback subtransaction): capability
  -- confinement. A BOUND resolution is refused by the generic assert and accepted
  -- by the bound assert; an UNBOUND one is the mirror image. Fixtures are minted
  -- inside the block and discarded on unwind — nothing commits. ----
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_p := gen_random_uuid(); v_s := gen_random_uuid();
    v_ru := gen_random_uuid(); v_rb := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0018 probe firm');
    insert into clara.users(id, display_name) values (v_u, '0018 probe user');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0018 probe client', 'active');
    insert into clara.onboarding_plans(id, firm_id, scope_kind, client_id, state)
      values (v_p, v_f, 'client', v_c, 'open');
    insert into clara.opening_seed_registry(id, firm_id, client_id, plan_id, as_of, state, created_by)
      values (v_s, v_f, v_c, v_p, date '2024-01-01', 'open', v_u);
    insert into clara.client_resolutions(id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values (v_ru, v_c, 'manual', v_s, 1.0, 'human', '{}'::jsonb, v_u);
    insert into clara.client_resolutions(id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by, bound_scope_kind, bound_scope_id)
      values (v_rb, v_c, 'manual', v_s, 1.0, 'human', '{}'::jsonb, v_u, 'opening_seed', v_s);

    -- generic assert ACCEPTS the unbound resolution.
    begin
      perform clara.assert_client_resolved(v_c, v_ru, null);
    exception when sqlstate 'CLR01' then
      raise exception '0018 functional: generic assert REJECTED an unbound resolution'
        using errcode = 'CLR10';
    end;
    -- generic assert REJECTS the bound resolution (the binding-escape fix).
    v_probe_ok := false;
    begin
      perform clara.assert_client_resolved(v_c, v_rb, null);
    exception when sqlstate 'CLR01' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception '0018 functional: generic assert ACCEPTED a bound resolution'
        using errcode = 'CLR10';
    end if;
    -- bound assert ACCEPTS the bound resolution on its lane.
    begin
      perform clara.assert_client_resolved_bound(v_c, v_rb, 'opening_seed', v_s);
    exception when sqlstate 'CLR01' then
      raise exception '0018 functional: bound assert REJECTED its bound resolution'
        using errcode = 'CLR10';
    end;
    -- bound assert REJECTS the unbound resolution (binding equality fails).
    v_probe_ok := false;
    begin
      perform clara.assert_client_resolved_bound(v_c, v_ru, 'opening_seed', v_s);
    exception when sqlstate 'CLR01' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception '0018 functional: bound assert ACCEPTED an unbound resolution'
        using errcode = 'CLR10';
    end if;

    -- [AMB-0018-3] The UNIQUE partial index admits at most ONE live bound row per
    -- scope: v_rb is already the live binding for (opening_seed, v_s), so a SECOND
    -- live bound insert for the same scope must be rejected. This is exactly why
    -- the mint auto-supersedes the prior row before inserting — a correct second
    -- mint leaves exactly one live row.
    v_probe_ok := false;
    begin
      insert into clara.client_resolutions(client_id, subject_kind, subject_id,
          confidence, method, evidence, resolved_by, bound_scope_kind, bound_scope_id)
        values (v_c, 'manual', v_s, 1.0, 'human', '{}'::jsonb, v_u, 'opening_seed', v_s);
    exception when unique_violation then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception '0018 functional: a second LIVE bound row for one scope was admitted (UNIQUE index absent)'
        using errcode = 'CLR10';
    end if;

    -- Force the subtransaction to unwind so no fixture row commits.
    raise exception 'clara_0018_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;  -- expected: fixtures discarded
  end;
end
$tail$;
