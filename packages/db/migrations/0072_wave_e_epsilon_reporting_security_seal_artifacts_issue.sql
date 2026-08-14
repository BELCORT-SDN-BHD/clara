-- 0072_wave_e_epsilon_reporting_security_seal_artifacts_issue.sql -- lane epsilon, file 8/8.
--
-- Applies last of the epsilon set, immediately after
-- 0071_wave_e_epsilon_reporting_security_seal_artifacts.sql (the seal core + wrapper).
-- Number claims at MERGE; the timeout is PRECAUTIONARY.
--
--   A2  clara.approve_report_for_issue -- key 2 floor + maker/checker; binds the EXACT hash.
--   A3  clara.verify_report_artifact   -- the verify_bank_reconciliation analogue, with its
--                                         honest limit in its comment AND its return payload.
--   Then the EXECUTE grants for the three artifact-lane verbs, and THE FINAL EPSILON CENSUS.
--
-- WHY AN EIGHTH FILE. The seal's wrapper/core split (ruled with lane zeta so its render worker can
-- reach gate 1 under clara_runtime with no JWT) pushed file 7 past the repo's 500-line discipline.
-- The seam is a real one -- file 7 is the SEAL, this file is what happens to a sealed artifact
-- afterwards -- so the split follows the code rather than the line count alone.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_issue_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_issue_pre values ('deploy_principal', session_user);

do $pre$
declare v_agent text;
begin
  if to_regprocedure('clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)') is null then
    raise exception 'epsilon issue requires the seal core (file 7 not applied)' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.verify_report_artifact(uuid)') is not null then
    raise exception 'epsilon issue partial birth: clara.verify_report_artifact already exists'
      using errcode = 'CLR10';
  end if;
  -- The agent's PRE-file grant set, so the census below can prove epsilon added nothing to it.
  select coalesce(string_agg(table_name, ',' order by table_name), '(none)') into v_agent
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT';
  insert into _epsilon_issue_pre values ('agent_ro_select', v_agent);
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- A2 -- APPROVE FOR ISSUE. Key 2 floor (E-R11: owner-only by factory default, CONFIRMED by the
-- owner 2026-08-09; a non-owner joins by explicit audited grant -- clara._has_capability reads
-- both). The attestation binds the EXACT sealed artifact hash (ruled, E-R14), and PRD SS2's
-- segregation governs: where the firm has two eligible humans, the approver is not the preparer.
-- The model can never be checker -- it holds no capability and the verb is granted to
-- clara_authenticated only.
-- =====================================================================================
create function clara.approve_report_for_issue(
    p_report_run_id uuid, p_expected_artifact_sha256 text, p_reason text,
    p_self_attestation text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; r record; art record; prior jsonb; v_mode text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select * into r from clara.report_runs where id = p_report_run_id and firm_id = c.firm;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11', detail = '{"reason":"report_run_not_in_firm"}';
  end if;
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'issuing financial statements is a key-2 capability' using errcode = 'CLR04',
      detail = '{"reason":"capability_required","capability":"close_and_attest","fix":"the firm owner grants key 2 as an audited act"}';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'issue requires a stated reason' using errcode = 'CLR10',
      detail = '{"reason":"issue_reason_required"}';
  end if;
  -- B8: RESERVE BEFORE THE STATE CHECK. A successful issue moves the run to 'issued'; a same-key
  -- retry after a lost response must replay its receipt, not refuse with report_run_state_illegal.
  -- M13: the hash covers the self-attestation too -- a solo approval that changed only its
  -- attestation text is a DIFFERENT act and must refuse rather than alias onto the first.
  prior := clara._reserve_op(c.firm, 'approve_report_for_issue', p_op_key,
    clara._hash(jsonb_build_object('run', r.id, 'sha256', p_expected_artifact_sha256,
      'reason', p_reason, 'self_attestation', p_self_attestation)));
  if prior is not null then return prior; end if;

  if r.state <> 'dataset_sealed' then
    raise exception 'this run is not in a state that can be issued' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'report_run_state_illegal', 'state', r.state)::text;
  end if;
  select * into art from clara.report_artifacts where report_run_id = r.id and kind = 'pre_sign';
  if not found then
    raise exception 'this run has no sealed pre-sign artifact' using errcode = 'CLR42',
      detail = '{"reason":"pre_sign_artifact_absent","fix":"seal the pre-sign artifact before approving issue"}';
  end if;
  -- THE ATTESTATION BINDS THE EXACT BYTES (ruled). An approval that names a different hash is
  -- an approval of a different document.
  if art.sha256 is distinct from p_expected_artifact_sha256 then
    raise exception 'the approval names a different artifact than the one sealed' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'artifact_hash_mismatch', 'sealed_sha256', art.sha256,
        'fix', 'attest the exact sealed artifact hash')::text;
  end if;
  -- SEGREGATION (PRD SS2; the 0056 finalize_close shape). Preparer = whoever opened the run or
  -- sealed the bytes; either identity disqualifies the approver where a second human exists.
  if clara.eligible_checker_count(c.firm) >= 2 then
    if c.actor = r.requested_by or c.actor = art.sealed_by then
      raise exception 'the approver must differ from the preparer' using errcode = 'CLR05',
        detail = jsonb_build_object('reason', 'report_issue_segregation_violation',
          'requested_by', r.requested_by, 'sealed_by', art.sealed_by)::text;
    end if;
    v_mode := 'two_person';
  else
    if nullif(btrim(coalesce(p_self_attestation, '')), '') is null then
      raise exception 'a solo firm issues with an explicit self-approval attestation' using errcode = 'CLR05',
        detail = '{"reason":"report_issue_self_attestation_required"}';
    end if;
    v_mode := 'solo_self_attested';
  end if;

  update clara.report_runs
     set state = 'issued', issued_by = c.actor, issued_at = now(), issue_reason = p_reason,
         issue_mode = v_mode, issue_self_attestation = nullif(btrim(coalesce(p_self_attestation, '')), ''),
         issued_artifact_id = art.id
   where id = r.id;
  perform clara._audit(c.firm, c.actor, null, null, 'approve_report_for_issue', null,
    jsonb_build_object('report_run_id', r.id, 'artifact_id', art.id, 'sha256', art.sha256, 'mode', v_mode));
  return clara._finish_op(c.firm, 'approve_report_for_issue', p_op_key,
    jsonb_build_object('report_run_id', r.id, 'issued_artifact_id', art.id,
      'artifact_sha256', art.sha256, 'issue_mode', v_mode, 'state', 'issued'));
end $$;
revoke all on function clara.approve_report_for_issue(uuid, text, text, text, text) from public;

-- =====================================================================================
-- A3 -- VERIFY A SEALED ARTIFACT (the clara.verify_bank_reconciliation analogue, 0040:4537).
--
-- IT RAISES NOTHING (bookkeeper-floor read): a verifier that refuses cannot report what it
-- found. Every disagreement lands in `diffs` and makes `verified` false.
--
-- THE HONEST LIMIT, STATED HERE AND IN THE RETURN PAYLOAD. The DB half recomputes the DATASET
-- and MANIFEST hashes from source facts and diffs them strictly. It says NOTHING about whether
-- the stored PDF bytes still hash to the recorded sha256, and nothing about whether re-rendering
-- would reproduce them: the bytes are produced OUTSIDE the database, so byte reproduction is the
-- render lane's drill (design SS10; DR.md's Monthly-light and Quarterly-full cadences). Any
-- other split would let a green DB check imply a byte claim nobody made.
-- =====================================================================================
create function clara.verify_report_artifact(p_artifact uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; art record; r record; ds record; a record;
  v_diffs jsonb := '[]'::jsonb; v_hash bytea; v_n int; v_manifest_hash text; v_claim jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select * into art from clara.report_artifacts where id = p_artifact and firm_id = c.firm;
  if not found then return null; end if;
  select * into r from clara.report_runs where id = art.report_run_id;
  select * into ds from clara.report_datasets where report_run_id = r.id and chart_spec_version_id is null;
  select * into a from clara.report_claim_assessments where id = art.claim_assessment_id;

  if ds.id is null then
    v_diffs := v_diffs || jsonb_build_object('term', 'dataset_absent', 'stored', art.manifest->>'dataset_id', 'recomputed', null);
  else
    v_hash := clara._hash(clara._report_dataset_payload_v1(ds.id));
    select count(*)::int into v_n from clara.report_dataset_points where dataset_id = ds.id;
    if v_hash is distinct from ds.dataset_sha256 then
      v_diffs := v_diffs || jsonb_build_object('term', 'dataset_sha256',
        'stored', encode(ds.dataset_sha256, 'hex'), 'recomputed', encode(v_hash, 'hex'));
    end if;
    if v_n is distinct from ds.point_count then
      v_diffs := v_diffs || jsonb_build_object('term', 'dataset_point_count',
        'stored', ds.point_count, 'recomputed', v_n);
    end if;
    if coalesce(art.manifest->>'dataset_sha256', '') <> encode(ds.dataset_sha256, 'hex') then
      v_diffs := v_diffs || jsonb_build_object('term', 'manifest.dataset_sha256',
        'stored', art.manifest->>'dataset_sha256', 'recomputed', encode(ds.dataset_sha256, 'hex'));
    end if;
  end if;

  v_manifest_hash := encode(clara._hash(art.manifest - 'render_manifest_sha256'), 'hex');
  if coalesce(art.manifest->>'render_manifest_sha256', '') <> v_manifest_hash then
    v_diffs := v_diffs || jsonb_build_object('term', 'render_manifest_sha256',
      'stored', art.manifest->>'render_manifest_sha256', 'recomputed', v_manifest_hash);
  end if;
  if coalesce(art.manifest->>'books_snapshot_id', '') <> r.books_snapshot_id::text then
    v_diffs := v_diffs || jsonb_build_object('term', 'manifest.books_snapshot_id',
      'stored', art.manifest->>'books_snapshot_id', 'recomputed', r.books_snapshot_id);
  end if;
  if coalesce(art.manifest->>'report_spec_version_id', '') <> r.report_spec_version_id::text then
    v_diffs := v_diffs || jsonb_build_object('term', 'manifest.report_spec_version_id',
      'stored', art.manifest->>'report_spec_version_id', 'recomputed', r.report_spec_version_id);
  end if;
  v_claim := art.manifest->'claim_assessment';
  if a.id is null then
    v_diffs := v_diffs || jsonb_build_object('term', 'claim_assessment_absent', 'stored', art.claim_assessment_id, 'recomputed', null);
  elsif coalesce(v_claim->>'status', '') <> a.status
     or coalesce(v_claim->>'id', '') <> a.id::text
     or (v_claim->'claim_removed') is distinct from to_jsonb(art.claim_removed)
     or art.claim_removed is distinct from (a.status = 'stripped')
     or art.uncertified is distinct from a.uncertified then
    v_diffs := v_diffs || jsonb_build_object('term', 'claim_assessment',
      'stored', jsonb_build_object('manifest', v_claim, 'artifact_claim_removed', art.claim_removed,
        'artifact_uncertified', art.uncertified),
      'recomputed', jsonb_build_object('status', a.status, 'id', a.id,
        'claim_removed', (a.status = 'stripped'), 'uncertified', a.uncertified));
  end if;
  if art.storage_key <> 'firms/' || art.firm_id::text || '/reports/' || art.sha256 || '.' || art.key_extension then
    v_diffs := v_diffs || jsonb_build_object('term', 'storage_key',
      'stored', art.storage_key, 'recomputed',
      'firms/' || art.firm_id::text || '/reports/' || art.sha256 || '.' || art.key_extension);
  end if;

  return jsonb_build_object(
    'artifact_id', art.id, 'report_run_id', art.report_run_id, 'kind', art.kind,
    'verified', jsonb_array_length(v_diffs) = 0, 'diffs', v_diffs,
    'claim_status', a.status, 'claim_removed', art.claim_removed, 'uncertified', art.uncertified,
    'byte_reproduction', 'unverified_by_this_function',
    'byte_reproduction_note',
      'This function recomputes the dataset and manifest hashes from source facts and diffs them strictly. It does NOT read the stored object and does NOT re-render: the bytes are produced outside the database, so the byte-level claim belongs to the render lane''s double-render drill and the DR re-render cadence.');
end $$;
revoke all on function clara.verify_report_artifact(uuid) from public;

reset role;

grant execute on function
  clara.seal_report_artifact(uuid, text, text, text, bigint, jsonb, uuid, text),
  clara.approve_report_for_issue(uuid, text, text, text, text),
  clara.verify_report_artifact(uuid)
  to clara_authenticated;

-- =====================================================================================
-- THE FINAL EPSILON CENSUS. The whole lane's privilege posture, read POSITIVELY from live ACLs.
-- =====================================================================================
do $tail$
declare
  v_expected text[] := array['approve_report_for_issue', 'assess_report_claim', 'draft_report_spec',
    'open_report_run', 'publish_chart_template_version', 'publish_house_style_version',
    'publish_report_template_version', 'seal_report_artifact', 'seal_report_dataset',
    'verify_report_artifact'];
  v_granted text[]; v_agent_now text; v_agent_before text; v_agent_exec int; v_wake int;
  v_delta_nine text[] := array['account_set_versions', 'account_sets', 'edge_policy_sets',
    'metric_constants', 'metric_definition_versions', 'metric_definitions', 'metric_edge_policies',
    'presentation_map_versions', 'presentation_maps'];
  v_agent_reporting text[];
begin
  -- (1) Exactly ten granted epsilon verbs, and clara_authenticated is their ONLY grantee.
  select coalesce(array_agg(distinct p.proname order by p.proname), '{}') into v_granted
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and rr.rolname = 'clara_authenticated' and p.proname = any (v_expected);
  -- Compared as SETS (containment both ways plus cardinality), never as ordered arrays: array
  -- equality would make this census a statement about the database's collation.
  if not (v_granted @> v_expected and v_expected @> v_granted)
     or coalesce(array_length(v_granted, 1), 0) <> coalesce(array_length(v_expected, 1), 0) then
    raise exception 'epsilon final census: granted verb set is %, expected %', v_granted, v_expected
      using errcode = 'CLR10';
  end if;
  select count(*) into v_wake from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname = any (v_expected)
     and rr.rolname = any (array['clara_wake_interactive', 'clara_wake_proactive', 'clara_runtime',
       'clara_runtime_login', 'clara_agent_ro']);
  if v_wake <> 0 then
    raise exception 'epsilon final census: % non-human EXECUTE grant(s) on an epsilon verb', v_wake
      using errcode = 'CLR10';
  end if;

  -- (2) clara_agent_ro gains ZERO EXECUTE anywhere in epsilon -- including the internal
  -- validators, the seal CORE and the trigger bodies, matched by their own names.
  select count(*) into v_agent_exec from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and rr.rolname = 'clara_agent_ro'
     and (p.proname = any (v_expected)
          or p.proname like '%report%' or p.proname like '%layout%' or p.proname like '%chart_spec%'
          or p.proname like '%claim%' or p.proname like '%statutory%' or p.proname like '%house_style%');
  if v_agent_exec <> 0 then
    raise exception 'epsilon final census: clara_agent_ro holds % EXECUTE grant(s) on reporting objects', v_agent_exec
      using errcode = 'CLR10';
  end if;

  -- (3) THE CATALOG SELECT, ASSERTED POSITIVELY (SS6(c); matrix A34). Epsilon reconciled its
  -- nine-table catalog list against what lane delta ALREADY grants and found the remainder to be
  -- EMPTY -- 0059 (delta behavior) grants all nine. So epsilon grants nothing, and the assertion
  -- is that the agent's reporting-family SELECT set is EXACTLY those nine tables: no epsilon
  -- table, and no delta write-side table (clara.metric_cells above all).
  select coalesce(array_agg(table_name order by table_name), '{}') into v_agent_reporting
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT'
     and (table_name like 'metric\_%' or table_name like 'report\_%' or table_name like 'chart\_%'
          or table_name like 'statutory\_%' or table_name like 'claim\_%'
          or table_name like 'house\_style%' or table_name like 'account\_set%'
          or table_name like 'presentation\_map%' or table_name = 'edge_policy_sets'
          or table_name = 'protected_placeholders');
  if not (v_agent_reporting @> v_delta_nine and v_delta_nine @> v_agent_reporting)
     or coalesce(array_length(v_agent_reporting, 1), 0) <> 9 then
    raise exception 'epsilon final census: clara_agent_ro reporting SELECT set is %, expected exactly delta''s nine %',
      v_agent_reporting, v_delta_nine using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(table_name, ',' order by table_name), '(none)') into v_agent_now
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT';
  select v into v_agent_before from _epsilon_issue_pre where k = 'agent_ro_select';
  if v_agent_now is distinct from v_agent_before then
    raise exception 'epsilon final census: clara_agent_ro SELECT set moved. before=[%] after=[%]',
      v_agent_before, v_agent_now using errcode = 'CLR10';
  end if;

  if current_user <> (select v from _epsilon_issue_pre where k = 'deploy_principal') then
    raise exception 'epsilon final census: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;

  raise notice 'epsilon COMPLETE: 10 audited verbs, clara_authenticated the ONLY grantee of every one, zero EXECUTE to any wake/runtime/agent role -- the seal CORE included, which is granted to nobody and reachable only as an internal fn_owner call (zeta''s render worker, no JWT). Gate 1 refuses a pre_sign on a missing assessment, an unreadable/unknown status (an exhaustive dispatch whose ELSE fails closed), `failed`, or ANY unapproved formula -- draft or ad-hoc composition -- while eligible, not_applicable AND stripped all seal, stripped recording the removal on the artifact ROW and in the manifest. A missing manifest key is a refusal naming the keys, never a default. Artifact keys are DB-derived and content-addressed; the chain is a composite FK plus a most-recent-predecessor rule; a signed original requires this run''s pre-sign. verify_report_artifact recomputes dataset and manifest hashes strictly, raises nothing, and reports its byte-level claim as unverified-by-this-function. clara_agent_ro''s reporting SELECT set is EXACTLY lane delta''s nine catalog tables: [%]. metric_cells and every epsilon table stay OUT.',
    array_to_string(v_agent_reporting, ',');
end $tail$;
