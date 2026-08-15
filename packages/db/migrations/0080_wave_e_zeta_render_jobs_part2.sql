-- 0080_wave_e_zeta_render_jobs_part2.sql -- lane zeta, file 2 of 5 (THE PIN + THE ENQUEUE).
--
--   Z2  clara.render_request_manifest_v1   -- the PINNED-INPUTS half of the manifest, DB-built
--   Z3  clara.enqueue_render_job           -- internal; epsilon's seal calls this ONE line
--   Z4  clara.enqueue_missing_render_jobs  -- the fallback sweep (runtime), so a missing epsilon
--                                             call DELAYS a render rather than losing it
--
-- Number claims at MERGE; the timeout is PRECAUTIONARY.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _zeta_pin_pre(k text primary key, v text not null) on commit drop;
insert into _zeta_pin_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. The column census is not ceremony. Lane epsilon and lane delta are authored-but-
-- not-yet-validated, so Z2 reads columns that could still move under it -- and a manifest
-- builder that silently loses a pin is the failure this whole design exists to prevent. If this
-- list ever fires, the fix is to re-read the upstream table and update Z2, never to relax it.
-- =====================================================================================
do $pre$
declare
  v_missing text[] := '{}';
  wanted text[][] := array[
    ['report_runs', 'report_spec_version_id'], ['report_runs', 'books_snapshot_id'],
    ['report_runs', 'reporting_period_id'], ['report_runs', 'period_start'],
    ['report_runs', 'period_end'], ['report_runs', 'state'], ['report_runs', 'requested_by'],
    ['report_runs', 'requested_at'],
    ['report_artifacts', 'report_run_id'], ['report_artifacts', 'kind'],
    -- PRUNED when the pins call landed. The statutory_wording (7), statutory_profile_versions (2)
    -- and chart_template_versions (1) entries, and report_datasets.dataset_sha256 and
    -- house_style_versions.content_sha256, are GONE from this list because Z2 no longer reads
    -- those columns -- clara._report_render_pins_v1 does. A census over reads that no longer
    -- happen is a stale claim, and a stale claim in a prestate is worse than no claim: it makes
    -- the file look like it verified something it never touches. What remains is exactly what Z2
    -- still reads for the half epsilon does NOT pin.
    ['report_spec_versions', 'report_template_version_id'], ['report_spec_versions', 'report_class'],
    ['report_spec_versions', 'locale'], ['report_spec_versions', 'parameters'],
    ['report_spec_versions', 'content_sha256'],
    ['report_template_versions', 'claim_capability'],
    ['report_template_versions', 'house_style_version_id'],
    ['report_template_versions', 'content_sha256'],
    ['house_style_versions', 'asset_manifest'],
    ['report_datasets', 'report_run_id'], ['report_datasets', 'chart_spec_version_id'],
    ['report_claim_assessments', 'report_run_id'], ['report_claim_assessments', 'status'],
    ['report_claim_assessments', 'uncertified'], ['report_claim_assessments', 'check_receipt'],
    ['metric_input_snapshots', 'books_watermark'],
    ['evaluator_versions', 'evaluator_name'], ['evaluator_versions', 'version'],
    ['evaluator_versions', 'closure_sha256'],
    ['metric_cells', 'run_id'], ['metric_cells', 'formula_sha256'],
    ['metric_cells', 'evaluator_version_id']];
  i int;
begin
  if to_regclass('clara.render_jobs') is null then
    raise exception 'zeta pin file requires file 1 (clara.render_jobs)' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.render_request_manifest_v1(uuid,text)') is not null then
    raise exception 'zeta partial birth: clara.render_request_manifest_v1 already exists'
      using errcode = 'CLR10';
  end if;
  -- THE PINS FUNCTION IS AN UPSTREAM DEPENDENCY, READ POSITIVELY. Z2 CALLS it for the eleven
  -- DB-owned values rather than deriving them, so its absence must fail the apply, not the first
  -- render. PL/pgSQL would otherwise resolve the call at first invocation -- in front of a client.
  if to_regprocedure('clara._report_render_pins_v1(uuid)') is null then
    raise exception 'zeta requires epsilon''s render-pins function' using errcode = 'CLR10',
      detail = '{"reason":"zeta_render_pins_absent","fix":"apply lane epsilon file 7, which ships clara._report_render_pins_v1 -- the single source of the eleven DB-owned manifest values the seal compares key for key"}';
  end if;
  for i in 1 .. array_length(wanted, 1) loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'clara' and table_name = wanted[i][1]
                      and column_name = wanted[i][2]) then
      v_missing := v_missing || (wanted[i][1] || '.' || wanted[i][2]);
    end if;
  end loop;
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'zeta pin: % upstream column(s) the manifest builder reads are absent: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ') using errcode = 'CLR10',
      detail = '{"reason":"zeta_upstream_column_drift","fix":"re-read the delta/epsilon tables and update Z2; never relax this check"}';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- Z2 -- THE REQUEST MANIFEST: the PINNED-INPUTS half, built from DB facts ONLY.
--
-- There is no caller-supplied manifest anywhere in this lane. Z3 takes a run id and a kind and
-- nothing else, so no user and no model can influence what a render is pinned to -- the same
-- structural kill SS7 uses for the filename vector.
--
-- The keys here are the subset of SS9's pin list the DATABASE owns. The worker adds the
-- environment-and-output half (renderer image digest, source commit, node/OS/architecture, font
-- engine, assembler version, document metadata, the extracted-text hash and the extraction tool,
-- the PDF hash) and file 4 composes the two, adds `render_manifest_sha256`, and hands the whole
-- thing to epsilon's gate -- which is what actually enforces that every REQUIRED key is present.
-- This function does not duplicate that list; it fills the half it can, and a key it cannot fill
-- is simply ABSENT so the gate refuses, rather than defaulted so the gate passes.
--
-- NULL IS A POSITIVE STATEMENT, ABSENCE IS NOT. A management pack HAS no statutory profile, so
-- `statutory_profile_version_id` is JSON null and the key is PRESENT. That distinction is Law 2
-- in one line, and epsilon's own required-key list is built on it.
-- THE LICENCE IS BY CLASS (orchestrator ruling with lane epsilon, 2026-08-14): epsilon's B4 rule
-- refuses JSON null on a required key, exempting exactly `statutory_profile_version_id` and
-- `statutory_profile_sha256`, and exempting them ONLY when the run's template is
-- management-class. A statutory run carrying a null profile still refuses. This function emits
-- those two as null exactly when epsilon's own ck_rtv_statutory_profile CHECK forces the column
-- to be null -- i.e. exactly where the licence applies -- so the two rules meet rather than
-- collide. Every other value below is a real one even in the degenerate cases: with no wording
-- rows or no charts, the two digests hash the EMPTY ARRAY rather than going null.
--
-- EVERY AGGREGATE IS ORDERED. An unordered aggregate hashes differently run to run and would
-- break the byte-equality drill for a reason that has nothing to do with the renderer.
-- =====================================================================================
create function clara.render_request_manifest_v1(p_report_run_id uuid, p_kind text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  r record; sv record; tv record; hv record; ds record; a record; snap record;
  v_pins jsonb; v_evals jsonb; v_defs jsonb;
begin
  select * into r from clara.report_runs where id = p_report_run_id;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11',
      detail = '{"reason":"report_run_not_found"}';
  end if;
  select * into sv from clara.report_spec_versions where id = r.report_spec_version_id;
  select * into tv from clara.report_template_versions where id = sv.report_template_version_id;
  select * into hv from clara.house_style_versions where id = tv.house_style_version_id;
  select * into snap from clara.metric_input_snapshots where id = r.books_snapshot_id;
  select * into ds from clara.report_datasets
   where report_run_id = r.id and chart_spec_version_id is null;
  if not found then
    raise exception 'this run has no persisted FS dataset' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'dataset_not_sealed', 'report_run_id', r.id,
        'fix', 'seal the run''s typed dataset before enqueuing a render')::text;
  end if;
  select * into a from clara.report_claim_assessments where report_run_id = r.id;
  if not found then
    raise exception 'this run carries no claim assessment' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'claim_assessment_absent', 'report_run_id', r.id,
        'fix', 'assess the claim inside the transaction that seals the dataset')::text;
  end if;

  -- ===================================================================================
  -- THE ELEVEN DB-OWNED VALUES COME FROM EPSILON'S PINS FUNCTION. ONE SOURCE, NOT TWO.
  --
  -- An earlier draft of this function DERIVED them in parallel -- the spec/snapshot/dataset ids,
  -- the dataset digest, the statutory profile and wording digests, the house style, the chart
  -- spec ids and their digest. That was a second source of eleven values the seal compares key
  -- for key against clara._report_render_pins_v1, and two sources that agree today are two
  -- sources that will disagree eventually. They are now DELETED rather than kept beside the
  -- call: single-sourced means one code path.
  --
  -- Deleting them was not cosmetic. The parallel derivations DISAGREED with epsilon's in three
  -- ways, each of which would have produced manifest_binding_mismatch at every seal:
  --   * the wording digest hashed (wording_key, locale, wording_text) over VERIFIED rows only;
  --     epsilon hashes (wording_key, locale, applies_from, source_sha256, verification_state)
  --     over ALL applicable rows -- the state is IN the digest rather than a filter on it, so
  --     the hash changes when wording is verified, which is what a provenance hash is for;
  --   * chart_spec_sha256 was the digest of the empty array when a run bound no chart; epsilon
  --     returns NULL, because "an empty digest and 'no charts' are different statements";
  --   * statutory_wording_sha256 was likewise a real digest for a management pack; epsilon
  --     returns NULL when the run binds no profile.
  -- Reading epsilon's bytes rather than reimplementing from the design is what caught these.
  --
  -- The call is an internal, ungranted one under clara_fn_owner -- the same reach file 4 uses for
  -- the seal core (the 0004:749-750 containment).
  -- ===================================================================================
  v_pins := clara._report_render_pins_v1(r.id);

  -- Evaluator versions + definition hashes, read from the CELLS this run actually evaluated --
  -- not from what the spec says it should have used. These are NOT db_derived in epsilon's shape
  -- table, so they are shape-validated: `evaluator_versions` must be a NON-EMPTY LIST and
  -- `definition_hashes` an OBJECT. definition_hashes is therefore a MAP of definition version ->
  -- formula digest rather than the bare array an earlier draft emitted, which epsilon's validator
  -- would have refused as `not an object`. A map is also the more useful shape: it says WHICH
  -- definition each hash belongs to instead of leaving a reader to match them up.
  select coalesce(jsonb_agg(x.e order by x.e), '[]'::jsonb) into v_evals
    from (select distinct jsonb_build_object(
            'evaluator_version_id', ev.id, 'name', ev.evaluator_name, 'version', ev.version,
            'closure_sha256', encode(ev.closure_sha256, 'hex')) as e
            from clara.metric_cells mc
            join clara.evaluator_versions ev on ev.id = mc.evaluator_version_id
           where mc.client_id = r.client_id and mc.run_id = r.id) x;
  select coalesce(jsonb_object_agg(x.k, x.h), '{}'::jsonb) into v_defs
    from (select distinct coalesce(mc.definition_version_id::text,
                            'adhoc:' || encode(mc.formula_sha256, 'hex')) as k,
                 encode(mc.formula_sha256, 'hex') as h
            from clara.metric_cells mc
           where mc.client_id = r.client_id and mc.run_id = r.id) x;

  return v_pins || jsonb_build_object(
    -- ZETA's own binding keys. They are not in epsilon's REQUIRED list (adding a required key is
    -- epsilon's call, not this lane's) -- but file 4 refuses a completion whose manifest does not
    -- carry them, so they are mandatory in practice.
    'render_request_version', 'clara.render_request/v1',
    'report_run_id', r.id, 'artifact_kind', p_kind,
    -- Context the render needs that is NOT part of the pinned eleven.
    'report_parameters', sv.parameters,
    'report_class', sv.report_class,
    'report_template_version_id', tv.id,
    'report_template_sha256', encode(tv.content_sha256, 'hex'),
    'report_spec_sha256', encode(sv.content_sha256, 'hex'),
    'claim_capability', tv.claim_capability,
    'books_event_sequence', snap.books_watermark,
    'applicability_receipts', a.check_receipt,
    'claim_assessment', jsonb_build_object('id', a.id, 'status', a.status,
      'claim_removed', (a.status = 'stripped')),
    'evaluator_versions', v_evals,
    'definition_hashes', v_defs,
    'asset_hashes', hv.asset_manifest,
    'locale', sv.locale,
    -- DETERMINISM, NOT LOCALE POLITENESS. The document's timezone is pinned to UTC for every
    -- run: a render whose timestamps depend on the worker machine's zone is not reproducible,
    -- and the human-facing dates in a statement come from the reporting PERIOD below, never
    -- from a clock.
    'timezone', 'UTC',
    'reporting_period', jsonb_build_object('id', r.reporting_period_id,
      'period_start', r.period_start, 'period_end', r.period_end),
    'uncertified', a.uncertified);
end $$;
revoke all on function clara.render_request_manifest_v1(uuid, text) from public;

-- =====================================================================================
-- Z3 -- ENQUEUE. THE EPSILON INTEGRATION POINT.
--
-- INTERNAL and ungranted (the 0004:749-750 _*_core containment): the only lawful callers are
-- other definer functions running as clara_fn_owner. Epsilon's clara.seal_report_dataset calls
-- it with ONE line, immediately before its final audit, inside the sealing transaction:
--
--     perform clara.enqueue_render_job(r.id, 'pre_sign');
--
-- Until that line lands, Z4's fallback sweep enqueues the same job from the leader within its
-- cadence -- so a missing call DELAYS a render, it never loses one. That is deliberate: lane
-- epsilon is authored-but-not-validated, and a lane whose correctness depends on another lane
-- remembering to call it is a lane with a silent failure mode.
--
-- IDEMPOTENT BY CONSTRUCTION. A duplicate enqueue of the same (run, request-manifest) conflicts
-- on the idempotency key and returns the EXISTING job untouched, in whatever state it reached.
--
-- THE ETA HANDSHAKE, AND THE ONE GAP IN IT THAT IS NOT ZETA'S TO CLOSE.
-- clara._eta_request_report_preview_core carries two staged refusals. The first
-- ({"reason":"not_yet_deployed","class":"render_jobs"}) probes to_regclass('clara.render_jobs')
-- and stops being reachable the moment zeta file 1 applies -- nothing in eta needs recutting for
-- that half. The second ({"class":"render_enqueue_binding"}) stands until eta ships a new version
-- whose core calls THIS function with kind 'draft_watermarked'.
--
-- THE GAP: eta's core holds a report_spec_version id (a spec DRAFT), and this function takes a
-- report_run_id. There is no path from one to the other that zeta can supply, and that is not an
-- oversight in either lane -- E-R8 floor 2 binds every render to a PERSISTED dataset, so a preview
-- must first open a run, evaluate against it, and seal its dataset (open_report_run ->
-- evaluate -> seal_report_dataset). This function refuses a run still in `drafting` for exactly
-- that reason. Eta's repoint is therefore "open+evaluate+seal, then enqueue", not "enqueue".
-- =====================================================================================
create function clara.enqueue_render_job(p_report_run_id uuid, p_kind text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_manifest jsonb; v_sha text; v_id uuid; j record;
begin
  if p_kind is null or p_kind not in ('draft_watermarked', 'pre_sign') then
    raise exception 'render job kind % is not registered', p_kind using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_kind_unknown', 'kind', p_kind,
        'fix', 'a signed original is retained and retrieved, never rendered')::text;
  end if;
  select * into r from clara.report_runs where id = p_report_run_id;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11',
      detail = '{"reason":"report_run_not_found"}';
  end if;
  -- A pre-sign render presupposes a sealed dataset. The DRAFT kind does too: E-R8 floor 2 says
  -- every render is a durable artifact of a PERSISTED dataset, so there is no render-from-nothing
  -- path for either kind.
  if r.state = 'drafting' then
    raise exception 'this run has no sealed dataset' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'dataset_not_sealed', 'report_run_id', r.id,
        'fix', 'seal the run''s typed dataset before enqueuing a render')::text;
  end if;

  v_manifest := clara.render_request_manifest_v1(r.id, p_kind);
  v_sha := encode(clara._hash(v_manifest), 'hex');

  -- A TERMINAL FAILURE IS ANSWERED THROUGH THE AUDITED DOOR, NOT THROUGH HERE. File 1's key is
  -- partial (`where state <> 'failed'`) so that a failed request CAN be retried at all -- an
  -- unconditional key plus the attempt-cap reap left a run permanently unproducible. But partial
  -- alone would let this verb quietly mint the successor itself: no stated reason, no link to the
  -- failure it answers, and a machine path (epsilon's seal, the leader's fallback sweep) able to
  -- re-run a job that already burned five paid machines. So the resurrection is refused here and
  -- lives in clara.requeue_render_job, where a person names the incident and the act is audited.
  -- KEYED ON (run, kind), NOT ON THE DIGEST. The requeue door RE-DERIVES the manifest, so a
  -- successor legitimately carries a different sha when wording or a template version has moved --
  -- and a digest-keyed refusal would therefore miss the case it exists to catch, letting this verb
  -- mint an unaudited successor the moment anything upstream drifted. What has failed is the
  -- REQUEST for this run and kind, whatever it hashed to.
  if exists (select 1 from clara.render_jobs
              where report_run_id = r.id and kind = p_kind and state = 'failed')
     and not exists (select 1 from clara.render_jobs
              where report_run_id = r.id and kind = p_kind and state <> 'failed') then
    raise exception 'this render request has already failed terminally' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_job_failed_terminally', 'report_run_id', r.id,
        'manifest_sha256', v_sha,
        'fix', 'read the failed job''s last_error, then call clara.requeue_render_job(job id, why) to mint a successor')::text;
  end if;

  -- THREE QUESTIONS, AND THEY ARE NOT THE SAME QUESTION — said plainly because an earlier version
  -- of this comment claimed they were. The refusal above asks (run, kind): has this REQUEST failed
  -- terminally. The INSERT's conflict inference asks (run, manifest_sha256), because that is what
  -- the partial unique index is and an inference cannot ask anything else. The read below asks
  -- (run, kind) again, matching the refusal. The middle one being digest-keyed is a property of the
  -- index, not a choice available here; what matters is that the two questions this function
  -- CONTROLS agree with each other.
  insert into clara.render_jobs(firm_id, client_id, report_run_id, kind, request_manifest,
      manifest_sha256, requested_by)
    values (r.firm_id, r.client_id, r.id, p_kind, v_manifest, v_sha, r.requested_by)
    on conflict (report_run_id, manifest_sha256) where state <> 'failed' do nothing
    returning id into v_id;

  -- STRICT, so a raced row is a named refusal rather than a jsonb of nulls. If the conflicting
  -- job was failed by another session between the insert's do-nothing and this read, there is no
  -- row to return, and answering with `{"render_job_id": null}` would hand the caller a receipt
  -- for a job that does not exist.
  --
  -- AND `too_many_rows` IS A REAL STATE, not an impossible one (round-5): the index keys on the
  -- DIGEST, so two live jobs of the same kind carrying DIFFERENT manifests are index-legal. Both
  -- doors refuse to create that shape deliberately, but two concurrent enqueues either side of an
  -- upstream change can still race into it. Unhandled, it surfaces as a bare 21000 with no reason
  -- token — the one shape this lane's callers cannot act on.
  begin
    select * into strict j from clara.render_jobs
     where report_run_id = r.id and kind = p_kind and state <> 'failed';
  exception
    when no_data_found then
      raise exception 'the render job for this request was terminated by a concurrent caller'
        using errcode = 'CLR43',
        detail = jsonb_build_object('reason', 'render_job_raced', 'report_run_id', r.id,
          'manifest_sha256', v_sha,
          'fix', 'read the job for this run and kind, then requeue it through clara.requeue_render_job if it is terminally failed')::text;
    when too_many_rows then
      raise exception 'this run and kind hold more than one live render job'
        using errcode = 'CLR43',
        detail = jsonb_build_object('reason', 'render_job_ambiguous', 'report_run_id', r.id,
          'kind', p_kind,
          -- WHAT ACTUALLY HAPPENS, WHICH IS UGLIER THAN EITHER PREVIOUS VERSION OF THIS TEXT SAID.
          -- Round 5 named clara.fail_render_job as the remedy: nobody can perform it (a surplus row
          -- is `claimable` with claimed_by NULL; that verb needs running + matching claimant + live
          -- lease, and is runtime-only). Round 6 replaced it with a mechanism that does not exist --
          -- "becomes unclaimable once an artifact exists" (the claim predicate has no such term),
          -- "burns its attempts" while unclaimable (attempts increment only inside a claim), "the
          -- reap parks it" (the reap requires `running`). Twice the text described a system that
          -- would be tidier than this one. The truth is that the surplus row STAYS CLAIMABLE and
          -- costs real money on its way out, and an operator is owed that rather than reassurance.
          'fix', 'two live jobs for one request means two concurrent enqueues raced across an upstream change, and the surplus one is NOT harmless. It stays claimable, so it will be dispatched -- a paid machine -- render the document in full, and be refused only at the seal (render_output_conflict: this run already carries a different sealed artifact of this kind). The worker records that refusal through fail_render_job, which returns the job to claimable below its cap, and the cycle repeats until max_attempts parks it failed. Expect up to max_attempts paid renders producing bytes that can never be sealed. There is NO door that cancels a claimable job today -- an operator cancel verb is REGISTERED as a Wave-F residual, not available -- so reading both jobs (their manifests differ, which is why the index admitted both) is DIAGNOSIS, not a remedy: it tells you which request survives, and if the survivor is the wrong one, requeue the other through clara.requeue_render_job after it terminates.')::text;
  end;
  if v_id is not null then
    perform clara._audit(r.firm_id, r.requested_by, null, null, 'enqueue_render_job', null,
      jsonb_build_object('report_run_id', r.id, 'render_job_id', j.id, 'kind', p_kind,
        'manifest_sha256', v_sha));
  end if;
  return jsonb_build_object('render_job_id', j.id, 'kind', j.kind, 'state', j.state,
    'manifest_sha256', j.manifest_sha256, 'created', v_id is not null);
end $$;
revoke all on function clara.enqueue_render_job(uuid, text) from public;

-- =====================================================================================
-- Z4 -- THE FALLBACK ENQUEUE SWEEP (leader, daily cadence).
--
-- A run whose dataset is sealed, which has no pre-sign artifact and no pre-sign job, gets one.
-- Bounded by p_limit so a backlog is worked through over cycles rather than in one long
-- transaction, and ISOLATED PER RUN (the reconciler-sst/fa precedent): one poisoned run is
-- counted and NAMED, never allowed to abort the sweep for every other firm.
-- =====================================================================================
create function clara.enqueue_missing_render_jobs(p_limit int default 25) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_enq int := 0; v_seen int := 0; v_failed int := 0; v_errs jsonb := '[]'::jsonb;
begin
  for r in
    select rr.id from clara.report_runs rr
     where rr.state = 'dataset_sealed'
       and not exists (select 1 from clara.report_artifacts ra
                        where ra.report_run_id = rr.id and ra.kind = 'pre_sign')
       and not exists (select 1 from clara.render_jobs j
                        where j.report_run_id = rr.id and j.kind = 'pre_sign')
     order by rr.requested_at, rr.id
     limit greatest(1, least(coalesce(p_limit, 25), 500))
  loop
    v_seen := v_seen + 1;
    begin
      perform clara.enqueue_render_job(r.id, 'pre_sign');
      v_enq := v_enq + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errs := v_errs || jsonb_build_object('report_run_id', r.id, 'sqlstate', sqlstate,
        'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('examined', v_seen, 'enqueued', v_enq, 'failed', v_failed,
    'errors', v_errs);
end $$;
revoke all on function clara.enqueue_missing_render_jobs(int) from public;

reset role;

grant execute on function clara.enqueue_missing_render_jobs(int) to clara_runtime;

do $tail$
declare v_leak int; v_keys int;
begin
  -- The two internals are granted to NO app role; only the sweep is runtime-callable. PUBLIC is
  -- named explicitly (round-2 minor): aclexplode reports a world grant with grantee = 0, which
  -- neither matches a pg_roles row nor the `clara\_%` pattern, so the widest possible grant was the
  -- one shape this census could not see.
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname in ('render_request_manifest_v1', 'enqueue_render_job')
     and (rr.rolname is null or (rr.rolname like 'clara\_%' and rr.rolname <> 'clara_fn_owner'));
  if v_leak <> 0 then
    raise exception 'zeta pin tail: % app-role EXECUTE grant(s) on an internal render function',
      v_leak using errcode = 'CLR10';
  end if;
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     -- THE OWNER IS NOT A GRANTEE. aclexplode expands proacl, which for a function created by
     -- clara_fn_owner ALWAYS carries the owner's own implicit entry (clara_fn_owner=X/clara_fn_owner)
     -- alongside anything granted. Testing `<> 'clara_runtime'` alone therefore counts OWNERSHIP as
     -- a stray grant and the census fails on a correct database -- which is exactly what the rig
     -- leg caught here, at apply, with the migration rolled back. Exclude the owner explicitly; the
     -- sibling checks above do the same thing with their `<> 'clara_fn_owner'` clause.
     -- And a PUBLIC grant reads as 'PUBLIC' rather than vanishing in an inner join (round-2 minor).
     and p.proname = 'enqueue_missing_render_jobs'
     and coalesce(rr.rolname, 'PUBLIC') not in ('clara_runtime', 'clara_fn_owner');
  if v_leak <> 0 then
    raise exception 'zeta pin tail: enqueue_missing_render_jobs granted to % non-runtime role(s)',
      v_leak using errcode = 'CLR10';
  end if;
  -- The manifest builder's key set, counted by CALLING it on a synthetic-free path is not
  -- possible without data, so the shape is asserted structurally instead: the function exists,
  -- is STABLE (it may never write), and is SECURITY DEFINER with a pinned search_path.
  select count(*) into v_keys from pg_proc
   where oid = 'clara.render_request_manifest_v1(uuid,text)'::regprocedure
     and provolatile = 's' and prosecdef
     and array_to_string(coalesce(proconfig, '{}'), ',') like '%search_path=clara, pg_temp%';
  if v_keys <> 1 then
    raise exception 'zeta pin tail: render_request_manifest_v1 is not STABLE + SECURITY DEFINER + search-path-pinned'
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _zeta_pin_pre where k = 'deploy_principal') then
    raise exception 'zeta pin tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta pin OK: the request manifest is built from DB facts ONLY -- no caller supplies any part of it -- with every aggregate ORDERED so the same run pins the same bytes. The wording digest is EPSILON''s and this file no longer derives one: it hashes ALL applicable rows and carries verification_state INSIDE the hash, so verifying a row MOVES the pin -- the state is not a filter, and an unverified row is not invisible to it. JSON null means "this pack has none", absence means the gate refuses. enqueue_render_job is the ONE line epsilon''s seal calls and is ungranted to every app role; enqueue_missing_render_jobs is the leader fallback so a missing epsilon call delays a render rather than losing it.';
end $tail$;
