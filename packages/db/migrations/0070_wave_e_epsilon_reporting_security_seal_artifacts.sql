-- 0070_wave_e_epsilon_reporting_security_seal_artifacts.sql -- lane epsilon, file 7 of 8.
--
-- Applies after ..._security_seal.sql and before ..._security_seal_artifacts_issue.sql (which
-- carries approve/verify, the grants and the final census). Number claims at MERGE; the timeout
-- is PRECAUTIONARY.
--
--   A1  clara._seal_report_artifact_core + clara.seal_report_artifact -- SS9's registry writer,
--       carrying SS7's GATE 1 in the ungranted core (see the split's rationale at the core).
--       The wrapper is granted in the sibling file, alongside the other two artifact verbs.
--
-- GATE 1, THE SEAL GATE (SS7, R13-corrected). A pre_sign artifact is refused when: there is NO
-- assessment row; the status is unreadable or unknown; the status is `failed`; or the run is
-- `uncertified` (an unapproved formula -- arm 3). `eligible`, `not_applicable` AND `stripped`
-- otherwise ALL SEAL -- a stripped pack seals and renders with the compliance claim REMOVED,
-- recorded in the manifest and on the artifact row. ABSENCE IS REFUSAL; STRIPPED IS NOT ABSENCE.
-- The "unknown status" arm looks unreachable (the status column is CHECK-bound to the four ruled
-- states) and is written anyway as an exhaustive dispatch's ELSE, because the arm that matters is
-- the FUTURE one: a fifth ruled status must fail closed here, not seal.
--
-- CLR CODE PROPOSAL. The seal/claim gate family raises CLR42, a PROPOSAL claimed at MERGE against
-- the live roster (CLR01-CLR41 and CLR99 are taken as authored). Tests assert the reason token,
-- never the bare SQLSTATE, so a renumber at merge moves one constant and breaks nothing.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_artifact_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_artifact_pre values ('deploy_principal', session_user);

do $pre$
begin
  if to_regprocedure('clara.seal_report_dataset(uuid,uuid[],text)') is null then
    raise exception 'epsilon artifacts require clara.seal_report_dataset (file 6 not applied)'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)') is not null then
    raise exception 'epsilon artifacts partial birth: the seal core already exists'
      using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- A1 -- SEAL AN ARTIFACT. Every render mints one (E-R8 floor 2: there is no preview-only,
-- not-persisted path, watermarked drafts included).
-- =====================================================================================
-- WRAPPER + CORE, not one body (ruled with lane zeta). Gate 1 lives ENTIRELY in the core, which
-- takes firm and actor as ARGUMENTS rather than resolving them from a JWT: zeta's render worker
-- completes jobs under clara_runtime with NO JWT and must still pass the gate, so it reaches the
-- core as an internal ungranted call under clara_fn_owner (the 0004:749-750 containment). A gate
-- reachable only through a JWT-resolving body would have forced that worker to forge a human
-- context or skip the gate. The core is granted to NOBODY; the wrapper is the only human door and
-- carries no gate logic, so there is exactly one copy of the gate.
create function clara._seal_report_artifact_core(
    p_firm uuid, p_actor uuid, p_report_run_id uuid, p_kind text, p_key_extension text,
    p_sha256 text, p_byte_size bigint, p_manifest jsonb, p_prior_artifact_id uuid,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  r record; a record; ds record; presign record; latest record;
  prior jsonb; v_missing text[]; v_id uuid; v_removed boolean; v_key text;
  v_manifest_hash text; v_claim jsonb; v_expected_presign text;
  v_draft_now int; v_nonstat_now int;
begin
  select * into r from clara.report_runs where id = p_report_run_id and firm_id = p_firm;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11', detail = '{"reason":"report_run_not_in_firm"}';
  end if;
  if p_kind is null or p_kind not in ('draft_watermarked', 'pre_sign', 'signed_original') then
    raise exception 'artifact kind % is not registered', p_kind using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'artifact_kind_unknown', 'kind', p_kind)::text;
  end if;
  -- STAGE 4 MADE STRUCTURAL: the typed dataset is PERSISTED before anything renders. Read the
  -- dataset row itself, not just the run's state -- a state is a derived claim about it.
  if r.state = 'drafting' then
    raise exception 'this run has no sealed dataset' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'dataset_not_sealed', 'report_run_id', r.id,
        'fix', 'seal the run''s typed dataset before rendering anything from it')::text;
  end if;
  select * into ds from clara.report_datasets
   where report_run_id = r.id and chart_spec_version_id is null;
  if not found then
    raise exception 'this run has no persisted FS dataset' using errcode = 'CLR42',
      detail = '{"reason":"dataset_not_sealed","fix":"seal the run''s typed dataset before rendering"}';
  end if;

  -- GATE 1, ARM 1: ABSENCE IS REFUSAL.
  select * into a from clara.report_claim_assessments where report_run_id = r.id;
  if not found then
    raise exception 'this run carries no claim assessment' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'claim_assessment_absent', 'report_run_id', r.id,
        'fix', 'assess the claim inside the transaction that seals the dataset')::text;
  end if;
  -- GATE 1, ARM 2: the exhaustive status dispatch. `failed` refuses a pre_sign; the three
  -- others all seal; anything else -- today unreachable, tomorrow a fifth ruled state -- refuses.
  if a.status = 'failed' then
    if p_kind = 'pre_sign' then
      raise exception 'a failed claim assessment cannot be sealed for issue' using errcode = 'CLR42',
        detail = jsonb_build_object('reason', 'claim_assessment_failed', 'report_run_id', r.id,
          'reason_codes', a.reason_codes,
          'fix', 'a failed pack may render a watermarked draft so the preparer can see what failed')::text;
    end if;
  elsif a.status in ('eligible', 'not_applicable', 'stripped') then
    null;
  else
    raise exception 'claim assessment status % is not a state this gate can read', a.status
      using errcode = 'CLR42',
        detail = jsonb_build_object('reason', 'claim_status_unreadable', 'status', a.status,
          'fix', 'extend the seal gate deliberately when a new claim state is ruled')::text;
  end if;
  -- GATE 1, ARM 2b: THE ASSESSMENT MUST STILL BE TRUE, not merely present. The stored row is the
  -- recorded instrument, but currency is proven HERE, at the enforcement point, because the
  -- population it describes can move after it was written: a definition superseded through delta's
  -- audited verb between assess and seal leaves a row saying uncertified=false about cells that
  -- are no longer canonical. Re-derive and refuse on drift rather than inherit a stale verdict.
  select count(*) filter (where mdv.state = 'draft')::int,
         count(*) filter (where mc.definition_version_id is null
                             or mdv.state not in ('canonical', 'firm_approved'))::int
    into v_draft_now, v_nonstat_now
    from clara.metric_cells mc
    left join clara.metric_definition_versions mdv on mdv.id = mc.definition_version_id
   where mc.client_id = r.client_id and mc.run_id = r.id;
  if (v_nonstat_now > 0) is distinct from a.uncertified
     or v_nonstat_now is distinct from coalesce((a.check_receipt->>'non_statutory_cells')::int, -1)
     or v_draft_now is distinct from coalesce((a.check_receipt->>'draft_definition_cells')::int, -1) then
    raise exception 'the claim assessment no longer describes this run''s cells' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'assessment_stale', 'report_run_id', r.id,
        'assessed_uncertified', a.uncertified,
        'assessed_non_statutory_cells', a.check_receipt->'non_statutory_cells',
        'assessed_draft_definition_cells', a.check_receipt->'draft_definition_cells',
        'current_non_statutory_cells', v_nonstat_now, 'current_draft_definition_cells', v_draft_now,
        'fix', 're-assess this run: a contributing definition changed state after it was assessed')::text;
  end if;

  -- GATE 1, ARM 3: AN UNAPPROVED FORMULA NEVER BECOMES STATUTORY, structurally -- not as a label
  -- the renderer might drop. `uncertified` covers the whole not-canonical/firm_approved
  -- population, so this arm catches BOTH a draft definition and an ad-hoc composition (a cell
  -- with no definition at all). The token names which one, read from the assessment's own
  -- receipt: telling a preparer "draft" when their pack rides a composition would send them
  -- looking for a draft that does not exist.
  --
  -- THE ISSUANCE PATH IS THE APPROVAL LANE, and there is no bypass: save the composition (which
  -- mints a draft, E-R5), approve it (firm_approved), re-run, then seal. That is what makes
  -- SS11's "mechanically barred from a statutory pack with no extra rule" literally true.
  if p_kind = 'pre_sign' and a.uncertified then
    if coalesce((a.check_receipt->>'draft_definition_cells')::int, 0) > 0 then
      raise exception 'this dataset references a draft definition and can never be issued'
        using errcode = 'CLR42',
          detail = jsonb_build_object('reason', 'draft_definition_in_dataset', 'report_run_id', r.id,
            'draft_definition_cells', a.check_receipt->'draft_definition_cells',
            'non_statutory_cells', a.check_receipt->'non_statutory_cells',
            'fix', 'approve the contributing definitions, re-evaluate, and seal a new run')::text;
    else
      raise exception 'this dataset references an unapproved formula and can never be issued'
        using errcode = 'CLR42',
          detail = jsonb_build_object('reason', 'nonstat_definition_in_dataset', 'report_run_id', r.id,
            'non_statutory_cells', a.check_receipt->'non_statutory_cells',
            'fix', 'save the composition to mint a draft, approve it, re-evaluate, and seal a new run')::text;
    end if;
  end if;
  v_removed := (a.status = 'stripped');

  -- THE MANIFEST. A MISSING KEY IS A REFUSAL, NOT A DEFAULT -- and the refusal NAMES them.
  select coalesce(array_agg(k order by k), '{}') into v_missing
    from unnest(clara._report_manifest_required_keys(p_kind)) k where not (p_manifest ? k);
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'the render manifest is missing % required key(s)', array_length(v_missing, 1)
      using errcode = 'CLR42',
        detail = jsonb_build_object('reason', 'manifest_key_missing', 'missing_keys', v_missing,
          'kind', p_kind, 'fix', 'pin every required key; seven-year reproducibility is the whole point')::text;
  end if;
  -- SELF-BINDING. Each of these is a place where the manifest could disagree with the DB, and
  -- disagreement refuses the seal rather than picking a winner.
  v_manifest_hash := encode(clara._hash(p_manifest - 'render_manifest_sha256'), 'hex');
  v_claim := p_manifest->'claim_assessment';
  if jsonb_typeof(v_claim) <> 'object' or coalesce(v_claim->>'id', '') <> a.id::text
     or coalesce(v_claim->>'status', '') <> a.status
     or (v_claim->'claim_removed') is distinct from to_jsonb(v_removed)
     or (p_manifest->'uncertified') is distinct from to_jsonb(a.uncertified) then
    raise exception 'the manifest''s claim record disagrees with the assessment' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'claim_manifest_mismatch', 'db_status', a.status,
        'db_claim_removed', v_removed, 'db_uncertified', a.uncertified,
        'fix', 'carry the assessment id, status, claim_removed and uncertified verbatim')::text;
  end if;
  if coalesce(p_manifest->>'dataset_id', '') <> ds.id::text
     or coalesce(p_manifest->>'dataset_sha256', '') <> encode(ds.dataset_sha256, 'hex')
     or coalesce(p_manifest->>'books_snapshot_id', '') <> r.books_snapshot_id::text
     or coalesce(p_manifest->>'report_spec_version_id', '') <> r.report_spec_version_id::text
     or coalesce(p_manifest->>'render_manifest_sha256', '') <> v_manifest_hash then
    raise exception 'the manifest does not bind this run''s own pinned inputs' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'manifest_binding_mismatch', 'dataset_id', ds.id,
        'dataset_sha256', encode(ds.dataset_sha256, 'hex'), 'books_snapshot_id', r.books_snapshot_id,
        'render_manifest_sha256', v_manifest_hash,
        'fix', 'pin the run''s own dataset, snapshot and spec version, and hash the manifest without its own hash key')::text;
  end if;
  -- The pre-sign hash a manifest must carry: for a pre_sign artifact it is these very bytes; for
  -- a signed original it is the run's already-sealed pre_sign artifact's hash. Resolved into a
  -- variable rather than written as a CASE inside the IF condition: PL/pgSQL scans an IF for the
  -- keyword THEN, so a CASE's own THEN terminates the condition and the rest becomes garbage.
  if p_kind in ('pre_sign', 'signed_original') then
    if p_kind = 'pre_sign' then
      v_expected_presign := p_sha256;
    else
      select sha256 into v_expected_presign from clara.report_artifacts
       where report_run_id = r.id and kind = 'pre_sign';
    end if;
    -- A signed original with NO sealed pre-sign falls through to the chain check below, whose
    -- refusal names the real problem instead of blaming the manifest for a missing predecessor.
    if v_expected_presign is not null
       and coalesce(p_manifest->>'pre_sign_pdf_sha256', '') <> v_expected_presign then
      raise exception 'the manifest''s pre-sign hash is not this run''s pre-sign artifact' using errcode = 'CLR42',
        detail = '{"reason":"manifest_binding_mismatch","fix":"bind the exact pre-sign PDF hash"}';
    end if;
  end if;
  if p_kind = 'signed_original' and coalesce(p_manifest->>'signed_original_pdf_sha256', '') <> p_sha256 then
    raise exception 'the manifest''s signed-original hash is not these bytes' using errcode = 'CLR42',
      detail = '{"reason":"manifest_binding_mismatch","fix":"bind the exact signed-original PDF hash"}';
  end if;

  -- B8: RESERVE BEFORE ANY STATE THE SUCCESS PATH MOVES. A failed call rolls back its own
  -- reservation, so this costs nothing on failure; it is the success-then-lost-response retry that
  -- would otherwise refuse with artifact_chain_break instead of replaying its receipt.
  prior := clara._reserve_op(p_firm, 'seal_report_artifact', p_op_key,
    clara._hash(jsonb_build_object('run', r.id, 'kind', p_kind, 'sha256', p_sha256,
      'bytes', p_byte_size, 'extension', p_key_extension, 'prior', p_prior_artifact_id,
      'manifest', p_manifest)));
  if prior is not null then return prior; end if;

  -- B7: SERIALIZE THE CHAIN. Two concurrent seals with different op keys would otherwise read the
  -- same predecessor and both insert, forking an append-only chain permanently. The advisory lock
  -- is per RUN and transaction-scoped, so the second waits rather than racing. The partial unique
  -- index on (report_run_id, prior_artifact_id) is the structural half: even a future writer that
  -- forgets this lock cannot commit a fork.
  perform pg_advisory_xact_lock(hashtextextended('clara.report_artifacts:' || r.id::text, 0));

  -- THE CHAIN. The first artifact of a run claims the no-predecessor exemption exactly once;
  -- every later one points at the run's most recent artifact. A signed original must chain to
  -- THIS run's pre-sign, because a signature over bytes nobody sealed is not evidence.
  select * into latest from clara.report_artifacts where report_run_id = r.id
   order by sealed_at desc, id desc limit 1;
  if not found then
    if p_prior_artifact_id is not null then
      raise exception 'the first artifact of a run has no predecessor' using errcode = 'CLR10',
        detail = '{"reason":"artifact_chain_break","fix":"seal the first artifact with a null predecessor"}';
    end if;
  elsif p_prior_artifact_id is distinct from latest.id then
    raise exception 'an artifact chains to its run''s most recent artifact' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'artifact_chain_break', 'expected_prior', latest.id,
        'supplied_prior', p_prior_artifact_id)::text;
  end if;
  if p_kind = 'signed_original' then
    select * into presign from clara.report_artifacts where report_run_id = r.id and kind = 'pre_sign';
    if not found then
      raise exception 'a signed original requires this run''s sealed pre-sign artifact' using errcode = 'CLR42',
        detail = '{"reason":"artifact_chain_break","fix":"seal the pre-sign artifact before retaining its signed original"}';
    end if;
    -- M10: and its predecessor must BE that pre-sign. 'Some pre-sign exists' would admit
    -- pre_sign -> later draft -> signed_original chained to the draft, i.e. a signature whose
    -- immediate provenance is a watermarked draft rather than the bytes it attests.
    if p_prior_artifact_id is distinct from presign.id then
      raise exception 'a signed original chains to the pre-sign it signs' using errcode = 'CLR42',
        detail = jsonb_build_object('reason', 'artifact_chain_break', 'expected_prior', presign.id,
          'supplied_prior', p_prior_artifact_id,
          'fix', 'chain the signed original directly to this run''s pre-sign artifact')::text;
    end if;
  end if;

  -- CONTENT-ADDRESSED, DB-DERIVED. Not a parameter: no user- or model-supplied filename exists
  -- anywhere in this path, and the table's own CHECK re-proves the derivation.
  v_key := 'firms/' || p_firm::text || '/reports/' || p_sha256 || '.' || p_key_extension;
  insert into clara.report_artifacts(firm_id, client_id, report_run_id, kind, key_extension,
      storage_key, sha256, byte_size, manifest, claim_assessment_id, claim_removed, uncertified,
      prior_artifact_id, sealed_by)
    values (p_firm, r.client_id, r.id, p_kind, p_key_extension, v_key, p_sha256, p_byte_size,
      p_manifest, a.id, v_removed, a.uncertified, p_prior_artifact_id, p_actor)
    returning id into v_id;
  perform clara._audit(p_firm, p_actor, null, null, 'seal_report_artifact', null,
    jsonb_build_object('report_run_id', r.id, 'artifact_id', v_id, 'kind', p_kind,
      'claim_status', a.status, 'claim_removed', v_removed, 'uncertified', a.uncertified));
  return clara._finish_op(p_firm, 'seal_report_artifact', p_op_key,
    jsonb_build_object('report_artifact_id', v_id, 'kind', p_kind, 'storage_key', v_key,
      'sha256', p_sha256, 'claim_status', a.status, 'claim_removed', v_removed,
      'uncertified', a.uncertified, 'claim_assessment_id', a.id));
end $$;
revoke all on function clara._seal_report_artifact_core(uuid, uuid, uuid, text, text, text, bigint, jsonb, uuid, text) from public;

-- THE HUMAN DOOR. Resolves the context and delegates -- no gate logic, no refusal token, nothing
-- a reader could mistake for a second copy of the gate.
create function clara.seal_report_artifact(
    p_report_run_id uuid, p_kind text, p_key_extension text, p_sha256 text, p_byte_size bigint,
    p_manifest jsonb, p_prior_artifact_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._seal_report_artifact_core(c.firm, c.actor, p_report_run_id, p_kind,
    p_key_extension, p_sha256, p_byte_size, p_manifest, p_prior_artifact_id, p_op_key);
end $$;
revoke all on function clara.seal_report_artifact(uuid, text, text, text, bigint, jsonb, uuid, text) from public;

reset role;

-- TAIL: the split, read from prosrc rather than asserted. Every gate-1 token lives in the CORE and
-- none in the wrapper; a later edit that copied a refusal back into the wrapper would leave two
-- gates to keep in step, which is how one of them silently stops matching the other. The core's
-- grant posture is re-read in the sibling file's final census, once all ten verbs exist.
do $tail$
declare v_wrapper_tokens int; v_core_tokens int; v_core_grants int;
begin
  select count(*) into v_wrapper_tokens from pg_proc p
   where p.oid = 'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure
     and p.prosrc ~ '(claim_assessment_absent|claim_assessment_failed|definition_in_dataset|manifest_key_missing)';
  select count(*) into v_core_tokens from pg_proc p
   where p.oid = 'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure
     and p.prosrc ~ 'claim_assessment_absent' and p.prosrc ~ 'claim_assessment_failed'
     and p.prosrc ~ 'draft_definition_in_dataset' and p.prosrc ~ 'nonstat_definition_in_dataset'
     and p.prosrc ~ 'manifest_key_missing';
  select count(*) into v_core_grants from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl join pg_roles rr on rr.oid = acl.grantee
   where p.proname = '_seal_report_artifact_core' and acl.privilege_type = 'EXECUTE'
     and rr.rolname like 'clara\_%' and rr.rolname <> 'clara_fn_owner';
  if v_wrapper_tokens <> 0 or v_core_tokens <> 1 or v_core_grants <> 0 then
    raise exception 'epsilon seal tail: split is wrong -- wrapper tokens %, core token set %, core app-role grants %',
      v_wrapper_tokens, v_core_tokens, v_core_grants using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _epsilon_artifact_pre where k = 'deploy_principal') then
    raise exception 'epsilon seal tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'epsilon seal OK: gate 1 lives ENTIRELY in clara._seal_report_artifact_core (all five refusal tokens present), which is granted to NO app role and reachable only as an internal clara_fn_owner call -- the shape zeta''s render worker needs to pass the gate under clara_runtime with no JWT. The human wrapper carries ZERO gate tokens, so there is exactly one copy of the gate.';
end $tail$;
