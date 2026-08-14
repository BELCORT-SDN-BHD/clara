-- UNNUMBERED_wave_e_zeta_render_jobs_part4.sql -- lane zeta, file 4 of 4 (THE WORKER'S WRITE).
--
--   Z9  clara.complete_render_job  -- the worker's completion, granted to clara_runtime
--
-- Number claims at MERGE; the timeout is PRECAUTIONARY.
--
-- =====================================================================================
-- WHY THIS FILE CREATES NO SEAL GATE OF ITS OWN.
--
-- Epsilon's clara.seal_report_artifact IS the seal gate (SS7 gate 1: absence is refusal,
-- `failed` refuses a pre_sign, a draft definition can never be issued, a missing manifest key is
-- a refusal naming the keys, the chain cannot leave the run). It is a HUMAN-lane verb: its first
-- statement is clara._human_ctx(...), which reads request.jwt.claims.
--
-- The render worker has no JWT and must never have one. Setting request.jwt.claims from a
-- production function to borrow a human's identity is impersonation; in this repo that idiom
-- appears ONLY inside migration probes (0011:99, 0019:1778), never on a production path, and it
-- is not being introduced here.
--
-- That leaves two options: duplicate the gate on the machine side, or split it. DUPLICATION IS
-- REFUSED -- a second copy of a gate is a second place to forget it, which is the same argument
-- SS6 makes for keeping management templates in one registry. So the gate is SPLIT into
-- clara._seal_report_artifact_core(p_firm, p_actor, ...) plus a thin human wrapper that resolves
-- identity and delegates: the 0004:749-750 _*_core containment idiom, and how the WAKE lane
-- already reaches the same writers (0004:626).
--
-- LANE EPSILON SHIPS THAT SPLIT NATIVELY, IN ITS OWN FILE 7 (orchestrator ruling, 2026-08-14).
-- An earlier draft of this file DERIVED the core from the live catalog with pg_get_functiondef +
-- anchored replacements (the 0017:409-421 idiom). That idiom exists for editing bodies that are
-- already DEPLOYED, where the source file is immutable and the catalog is the only truth. Neither
-- lane is merged, so a plain source edit in epsilon's own file is available -- and catalog surgery
-- across an unmerged lane boundary is the fragile shape when it is. The ruling took the simpler
-- one; this file was cut back to the one object that is genuinely zeta's.
--
-- SO THE CORE IS AN UPSTREAM DEPENDENCY HERE, AND ITS ABSENCE IS A REFUSAL. The prestate reads it
-- POSITIVELY and aborts if it is missing or if the gate did not actually move into it. A forward
-- reference would otherwise resolve at first CALL rather than at apply, which means a broken
-- split would surface as a failed render in front of a client instead of as a failed migration.
-- =====================================================================================

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _zeta_seam_pre(k text primary key, v text not null) on commit drop;
insert into _zeta_seam_pre values ('deploy_principal', session_user);

do $pre$
declare v_core text; v_wrap text; v_tok text;
begin
  if to_regprocedure('clara.claim_render_job(text,interval)') is null then
    raise exception 'zeta file 4 requires files 1-3' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.complete_render_job(uuid,text,text,bigint,jsonb)') is not null then
    raise exception 'zeta partial birth: clara.complete_render_job already exists' using errcode = 'CLR10';
  end if;

  -- THE UPSTREAM DEPENDENCY, READ POSITIVELY. Lane epsilon owns the _core split; this file only
  -- CALLS it. PL/pgSQL resolves a call at first invocation rather than at CREATE, so without this
  -- read a missing or half-done split would apply cleanly here and fail later, in front of a
  -- client, instead of failing now, in front of a deployer.
  if to_regprocedure('clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)') is null then
    raise exception 'zeta file 4 requires epsilon''s seal core' using errcode = 'CLR10',
      detail = '{"reason":"zeta_seal_core_absent","fix":"apply lane epsilon file 7, which ships clara._seal_report_artifact_core plus the thin human wrapper"}';
  end if;
  v_core := pg_get_functiondef(
    'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure);
  v_wrap := pg_get_functiondef(
    'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure);

  -- THE GATE MOVED, IT DID NOT MULTIPLY. Four of gate 1's own refusal tokens must live in the
  -- core and in NEITHER copy in the wrapper. This is a read of what epsilon actually shipped, not
  -- a restatement of what it promised -- and it is measured BEFORE zeta creates anything, so a
  -- duplicated gate is a refusal to apply rather than a finding at review.
  foreach v_tok in array array['claim_assessment_absent', 'claim_assessment_failed',
      'draft_definition_in_dataset', 'manifest_key_missing'] loop
    if position(v_tok in v_core) = 0 then
      raise exception 'zeta file 4: gate token % is missing from epsilon''s seal core', v_tok
        using errcode = 'CLR10',
        detail = '{"reason":"zeta_seal_core_incomplete","fix":"the core must carry gate 1 whole"}';
    end if;
    if position(v_tok in v_wrap) <> 0 then
      raise exception 'zeta file 4: gate token % is STILL in the human wrapper -- the gate was duplicated, not moved', v_tok
        using errcode = 'CLR10',
        detail = '{"reason":"zeta_seal_gate_duplicated","fix":"the wrapper resolves identity and delegates; it carries no gate of its own"}';
    end if;
  end loop;
  -- Identity: the wrapper resolves it, the core takes it as parameters and reads no session state.
  if position('clara._human_ctx' in v_wrap) = 0
     or position('clara._seal_report_artifact_core' in v_wrap) = 0 then
    raise exception 'zeta file 4: the human wrapper does not resolve identity and delegate'
      using errcode = 'CLR10', detail = '{"reason":"zeta_seal_wrapper_shape"}';
  end if;
  if position('clara._human_ctx' in v_core) <> 0 then
    raise exception 'zeta file 4: the seal core still reads session claims' using errcode = 'CLR10',
      detail = '{"reason":"zeta_seal_core_reads_claims","fix":"the core takes p_firm/p_actor as parameters -- a machine lane has no claims to read"}';
  end if;

  -- The human verb's grantee set, captured BEFORE, so the tail can prove this file did not widen
  -- epsilon's human verb by so much as a role.
  select coalesce(string_agg(rr.rolname, ',' order by rr.rolname), '(none)') into v_tok
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  insert into _zeta_seam_pre values ('seal_grantees', v_tok);
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- Z9 -- COMPLETE A RENDER JOB. The worker's one write.
--
-- WHO SEALED IT -- clara.agent_user_id(), the fixed machine identity (0002:334; a real
-- clara.users row seeded at 0002:549-550, so the FK holds). ORCHESTRATOR RULING, 2026-08-14.
--
-- THE GROUNDS, because this is the kind of choice that looks cosmetic and is not:
--   (1) TRUTH. The seal is performed BY THE WORKER. `sealed_by` is a statement about who did it,
--       and putting a human's id there would make the artifact row say something that did not
--       happen. An audit trail that misattributes a machine act to a person is worse than one
--       that omits it, because it reads as evidence.
--   (2) THE DISQUALIFICATION MUST NOT MISFIRE. approve_report_for_issue bars an approver who is
--       either the run's requested_by OR the artifact's sealed_by. Had the worker sealed AS the
--       requester, that human would have been barred from approving a pack THEY NEVER SEALED --
--       a silent, invisible loss of an approver, and in a two-person firm that can mean nobody
--       is left to issue. With the machine as sealer the sealed_by arm can never bar a human;
--       the requested_by arm still bars the requester, which is the maker/checker rule actually
--       intended.
--   (3) MAKER/CHECKER KEEPS ITS MEANING. The machine holds no approval capability of any kind
--       (no close_and_attest, no EXECUTE on approve_report_for_issue, which is granted to
--       clara_authenticated only), so naming it the sealer cannot become a route to self-issue.
--       It is also not a firm member, so it does not inflate eligible_checker_count and cannot
--       turn a solo firm into a two-person one.
--
-- The human on whose authority the render ran is NOT lost: the job row carries requested_by, and
-- the audit entry below records the machine as the ACTOR and that human as ON_BEHALF_OF -- the
-- wake lane's own idiom (0004:626 passes clara.agent_user_id() with w.on_behalf_of beside it).
--
-- THE PINNED HALF IS COMPARED KEY BY KEY, not by containment. Every key of the job's request
-- manifest must appear in the submitted manifest with the SAME value; the worker may ADD the
-- environment-and-output half and nothing else. Containment (@>) would let an array be
-- reordered, and an array whose order changed is a manifest that hashes differently.
--
-- ARM (iii) OF A33 IS CLOSED HERE, BY A POSITIVE RE-READ. A second completion for a run that
-- already carries a sealed artifact of this kind trips epsilon's one-pre_sign-per-run index. We
-- do not assume that means "the same bytes landed twice": we READ the existing artifact and
-- compare its hash. Equal -> idempotent success, ONE artifact, the job points at it. Different
-- -> a REFUSAL that names the two hashes, because two different documents for one run is a
-- determinism failure and the one thing that must never pass quietly.
-- =====================================================================================
create function clara.complete_render_job(p_job uuid, p_worker text, p_sha256 text,
    p_byte_size bigint, p_manifest jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  j record; k text; v_base jsonb; v_final jsonb; v_prior uuid; v_res jsonb; v_art record;
  v_artifact_id uuid; v_reused boolean := false;
begin
  select * into j from clara.render_jobs where id = p_job for update;
  if not found then
    raise exception 'render job not found' using errcode = 'CLR11',
      detail = '{"reason":"render_job_not_found"}';
  end if;
  if j.state <> 'running'
     or j.claimed_by is distinct from nullif(btrim(coalesce(p_worker, '')), '') then
    raise exception 'this render job is not held by that worker' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_lease_not_held', 'state', j.state,
        'claimed_by', j.claimed_by)::text;
  end if;
  if j.lease_expires_at < now() then
    raise exception 'this render job''s lease has expired' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_lease_expired',
        'lease_expires_at', j.lease_expires_at,
        'fix', 'reclaim the job and render again; the output is content-addressed so nothing is lost')::text;
  end if;
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'a completion carries its render manifest' using errcode = 'CLR43',
      detail = '{"reason":"render_manifest_required"}';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or coalesce(p_byte_size, 0) <= 0 then
    raise exception 'a completion carries the produced bytes'' hash and size' using errcode = 'CLR43',
      detail = '{"reason":"render_output_identity_required"}';
  end if;

  -- THE JOB'S OWN REQUEST HASH, CARRIED IN THE MANIFEST. This is what binds the sealed
  -- artifact's manifest to the queue row that authorised it.
  if coalesce(p_manifest->>'render_request_sha256', '') <> j.manifest_sha256 then
    raise exception 'the manifest does not carry this job''s request hash' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_request_hash_mismatch',
        'expected', j.manifest_sha256, 'supplied', p_manifest->>'render_request_sha256',
        'fix', 'carry render_request_sha256 verbatim from the claimed job')::text;
  end if;
  -- THE PINNED HALF, KEY BY KEY.
  for k in select jsonb_object_keys(j.request_manifest) loop
    if (p_manifest -> k) is distinct from (j.request_manifest -> k) then
      raise exception 'the manifest changed a pinned input (%)', k using errcode = 'CLR43',
        detail = jsonb_build_object('reason', 'render_pin_mutated', 'key', k,
          'pinned', j.request_manifest -> k, 'supplied', p_manifest -> k,
          'fix', 'a render may ADD environment and output keys; it may never edit a pin')::text;
    end if;
  end loop;
  if j.kind = 'pre_sign' and coalesce(p_manifest->>'pre_sign_pdf_sha256', '') <> p_sha256 then
    raise exception 'the manifest''s pre-sign hash is not the bytes being sealed' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_output_hash_mismatch',
        'bytes_sha256', p_sha256, 'manifest_pre_sign_pdf_sha256', p_manifest->>'pre_sign_pdf_sha256')::text;
  end if;

  -- THE MANIFEST HASH IS COMPUTED HERE, IN THE DATABASE, by the same expression the gate uses to
  -- verify it. Asking the worker for it would make a cross-language reproduction of Postgres's
  -- own jsonb text form load-bearing for the seal -- a whole class of bug for no gain.
  v_base := p_manifest - 'render_manifest_sha256';
  v_final := v_base || jsonb_build_object('render_manifest_sha256',
    encode(clara._hash(v_base), 'hex'));

  -- DB-DERIVED, never caller-supplied: the chain's predecessor is this run's most recent artifact.
  select id into v_prior from clara.report_artifacts
   where report_run_id = j.report_run_id order by sealed_at desc, id desc limit 1;

  begin
    v_res := clara._seal_report_artifact_core(j.firm_id, clara.agent_user_id(), j.report_run_id,
      j.kind, 'pdf', p_sha256, p_byte_size, v_final, v_prior, 'render:' || j.id::text);
    v_artifact_id := (v_res->>'report_artifact_id')::uuid;
  exception when unique_violation then
    -- A33 arm (iii). Read what is actually there before deciding what happened.
    select * into v_art from clara.report_artifacts
     where report_run_id = j.report_run_id and kind = j.kind;
    if not found then
      raise;   -- a different uniqueness broke; do not dress it up as idempotency
    end if;
    if v_art.sha256 is distinct from p_sha256 then
      raise exception 'this run already carries a DIFFERENT sealed artifact of this kind'
        using errcode = 'CLR43',
          detail = jsonb_build_object('reason', 'render_output_conflict',
            'sealed_sha256', v_art.sha256, 'produced_sha256', p_sha256,
            'report_run_id', j.report_run_id, 'kind', j.kind,
            'fix', 'two different documents for one run is a determinism failure -- investigate the renderer pin, never overwrite')::text;
    end if;
    v_artifact_id := v_art.id;
    v_reused := true;
  end;

  update clara.render_jobs
     set state = 'done', artifact_id = v_artifact_id, finished_at = now(),
         claimed_by = null, claimed_at = null, lease_expires_at = null
   where id = j.id;
  -- ACTOR = the machine, ON_BEHALF_OF = the human who requested the run. The wake lane's shape
  -- (0004:626), for the same reason: the act and the authority for it are two different facts and
  -- the audit row has a column for each.
  perform clara._audit(j.firm_id, clara.agent_user_id(), j.requested_by, null,
    'complete_render_job', null,
    jsonb_build_object('render_job_id', j.id, 'report_run_id', j.report_run_id, 'kind', j.kind,
      'artifact_id', v_artifact_id, 'sha256', p_sha256, 'byte_size', p_byte_size,
      'worker', j.claimed_by, 'origin', 'render_worker', 'requested_by', j.requested_by,
      'idempotent_reuse', v_reused, 'claim_delay_ms', j.claim_delay_ms));
  return jsonb_build_object('render_job_id', j.id, 'report_artifact_id', v_artifact_id,
    'kind', j.kind, 'sha256', p_sha256, 'idempotent_reuse', v_reused,
    'storage_key', 'firms/' || j.firm_id::text || '/reports/' || p_sha256 || '.pdf');
end $$;
revoke all on function clara.complete_render_job(uuid, text, text, bigint, jsonb) from public;

reset role;

grant execute on function clara.complete_render_job(uuid, text, text, bigint, jsonb) to clara_runtime;

do $tail$
declare
  v_leak int; v_acl_now text; v_acl_before text; v_n int;
begin
  -- (1) THE GATE STAYED WHERE EPSILON PUT IT. The prestate proved the split before this file
  -- created anything; this re-reads it AFTER, because the only thing standing between those two
  -- reads is zeta's own DDL, and a census that only measures the state it inherited is not a
  -- census of what this file did.
  if position('clara._human_ctx' in pg_get_functiondef(
       'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure)) <> 0
     or position('claim_assessment_absent' in pg_get_functiondef(
       'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure)) <> 0 then
    raise exception 'zeta file 4 tail: the seal split moved while this file applied' using errcode = 'CLR10';
  end if;
  -- (2) The human verb's grantees are EXACTLY what they were before this file ran. Zeta creates
  -- one machine verb and must not widen epsilon's human one by so much as a role.
  select coalesce(string_agg(rr.rolname, ',' order by rr.rolname), '(none)') into v_acl_now
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  select v into v_acl_before from _zeta_seam_pre where k = 'seal_grantees';
  if v_acl_now is distinct from v_acl_before then
    raise exception 'zeta file 4 tail: seal_report_artifact grantees moved. before=[%] after=[%]',
      v_acl_before, v_acl_now using errcode = 'CLR10';
  end if;
  -- (3) The core is reachable by NO app role, and complete_render_job only by clara_runtime.
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname = '_seal_report_artifact_core'
     and rr.rolname like 'clara\_%' and rr.rolname <> 'clara_fn_owner';
  if v_leak <> 0 then
    raise exception 'zeta file 4 tail: % app-role EXECUTE grant(s) on the seal core', v_leak
      using errcode = 'CLR10';
  end if;
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     -- The owner is excluded for the same reason file 2's census states at length: aclexplode
     -- always yields clara_fn_owner's own implicit entry for a function it owns, so testing
     -- `<> 'clara_runtime'` alone counts ownership as a stray grant.
     and p.proname = 'complete_render_job'
     and rr.rolname not in ('clara_runtime', 'clara_fn_owner');
  if v_leak <> 0 then
    raise exception 'zeta file 4 tail: complete_render_job granted to % non-runtime role(s)', v_leak
      using errcode = 'CLR10';
  end if;
  -- (4) All three are SECURITY DEFINER with a pinned search_path.
  select count(*) into v_n from pg_proc
   where oid in ('clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure,
                 'clara.complete_render_job(uuid,text,text,bigint,jsonb)'::regprocedure,
                 'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'::regprocedure)
     and prosecdef and array_to_string(coalesce(proconfig, '{}'), ',') like '%search_path=clara, pg_temp%';
  if v_n <> 3 then
    raise exception 'zeta file 4 tail: % of 3 seal-family functions are definer + search-path-pinned', v_n
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _zeta_seam_pre where k = 'deploy_principal') then
    raise exception 'zeta file 4 tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta file 4 OK: this file creates ONE object -- clara.complete_render_job, the render worker''s only write, granted to clara_runtime alone. Epsilon''s seal split is an UPSTREAM DEPENDENCY, not zeta''s work: the prestate read it positively and refused to apply unless all four gate-1 tokens live in clara._seal_report_artifact_core and NONE remains in the human wrapper (moved, not duplicated), the wrapper resolves identity and delegates, and the core reads no session claims. seal_report_artifact''s grantees are unchanged from the prestate reading. complete_render_job refuses a manifest that edits any pin or omits the job''s request hash, composes render_manifest_sha256 in the DATABASE (so no cross-language reproduction of jsonb text is load-bearing for a seal), derives the chain predecessor itself, and reconciles a duplicate completion by READING the sealed artifact: an equal hash is idempotent success, a different hash is a named refusal. The SEALER is clara.agent_user_id(), the fixed machine identity: the worker performed the seal, so sealed_by says so, and approve_report_for_issue''s sealed_by disqualification can therefore never bar a human from approving a pack they never sealed -- the requested_by arm still bars the requester, and the machine holds no approval capability of any kind. The human authority rides as the audit row''s on_behalf_of.';
end $tail$;
