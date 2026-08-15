-- 0079_wave_e_zeta_render_human_doors.sql -- lane zeta, file 5 of 5 (THE HUMAN DOORS + THE FENCE).
--
-- THE NUMBER IS NOT CONTIGUOUS WITH THIS LANE'S OTHER FOUR, and that is correct: 0077/0078 are lane
-- eta's, claimed while this file was being written, and numbers are claimed at MERGE against the
-- live frontier rather than reserved in blocks. Nothing here does slot arithmetic -- the prestate
-- names the OBJECTS it needs (files 1-4's queue and verbs), not the numbers they landed on -- so the
-- renumber was a rename plus this sentence. The one ordering fact that matters: lexical order is
-- ledger order, and 0079 applies after eta's two, which it neither reads nor needs.
--
--   clara.replay_render_inputs  -- the DR drill's read: an artifact's own sealed inputs (moved
--                                  here from file 3, unchanged except for the firm scope)
--   clara.requeue_render_job    -- the lawful way out of a terminal failure: mint a SUCCESSOR
--   clara.render_lease_alive    -- the worker's own fence (the ONE runtime verb here; see below)
--
-- WHY THIS FILE EXISTS AT ALL. Files 1-4 are the machine lane: the queue, the pinned request, the
-- claim/dispatch verbs and the completion seal, every one of them granted to clara_runtime alone.
-- The two DOORS here are the opposite -- granted to clara_authenticated and to NOTHING else, called
-- by a person, reachable by no worker. Keeping them together makes the grant census in the tail a
-- statement about the whole human surface rather than about one function at a time. The FENCE rides
-- with them because it was born of the same review round; it is censused separately, as the one
-- runtime-granted object in the file, precisely so that "the human surface" stays a clean claim.
--
-- THE REQUEUE DOOR ANSWERS A REAL STRANDING, found in round-2 review. File 3's reap terminates a
-- job that burned every attempt without reporting; file 1's wall makes a terminal row immutable;
-- the idempotency key used to cover every state. Together those three meant a transient capacity
-- incident -- five OOM-killed machines on one job -- left a firm's statutory PDF unproducible
-- FOREVER: re-enqueue returned the dead row, the fallback sweep skipped the run for having a job,
-- and no role could edit the row. The remedy is not to weaken the wall. Terminal rows stay exactly
-- as immutable as they are; the LEDGER moves forward instead, by minting a new job that names its
-- predecessor and the human reason it exists.
--
-- Number claims at MERGE; the timeout is PRECAUTIONARY.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _zeta_doors_pre(k text primary key, v text not null) on commit drop;
insert into _zeta_doors_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. Files 1-4 must be in, the partial idempotency key must be the partial one (the
-- requeue door is unimplementable against an unconditional key -- the successor would collide
-- with its own predecessor), and neither door may already exist.
-- =====================================================================================
do $pre$
declare v_partial int;
begin
  if to_regclass('clara.render_jobs') is null
     or to_regprocedure('clara.claim_render_job(text,interval)') is null
     or to_regprocedure('clara.complete_render_job(uuid,text,text,bigint,jsonb)') is null then
    raise exception 'zeta file 5 requires files 1-4' using errcode = 'CLR10',
      detail = '{"reason":"zeta_queue_incomplete"}';
  end if;
  if to_regprocedure('clara.requeue_render_job(uuid,text,boolean)') is not null
     or to_regprocedure('clara.render_lease_alive(uuid,text)') is not null then
    raise exception 'zeta partial birth: a file-5 object already exists' using errcode = 'CLR10';
  end if;
  -- READ THE KEY, do not assume it. `indpred is not null` is the catalog's own statement that the
  -- unique index is partial; a full key here would make every requeue raise a duplicate-key error
  -- at the moment an operator most needs it to work.
  select count(*) into v_partial from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where i.indrelid = 'clara.render_jobs'::regclass and i.indisunique and i.indpred is not null
     and c.relname = 'ux_render_jobs_request';
  if v_partial <> 1 then
    raise exception 'zeta file 5: the request idempotency key is not the partial index this file needs'
      using errcode = 'CLR10',
      detail = '{"reason":"zeta_request_key_not_partial","fix":"file 1 creates ux_render_jobs_request as a unique index WHERE state <> ''failed''"}';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- THE REPLAY DOOR (codex B5). The seven-year re-render drill needs an EXECUTABLE path. Without it
-- the drill is prose that cannot be performed: a completed job is terminal and can never be
-- re-claimed (by design), and nothing else feeds a sealed dataset back through the chain.
--
-- IT IS A REPLAY, NOT A REQUEUE, and that is the whole point: it returns the artifact's OWN pinned
-- inputs and touches the job ledger not at all -- nothing enqueued, nothing dispatched, no state
-- moved, so a drill can never be mistaken for a production render or seal a second artifact. It
-- returns the SEALED MANIFEST verbatim rather than re-deriving the pins, because re-deriving would
-- answer "what would we pin today" and the drill asks "does today's renderer reproduce what we
-- pinned THEN". A mismatch is a finding to record, never something the DB acts on.
-- =====================================================================================
create function clara.replay_render_inputs(p_artifact uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare art record; ds record; v_firm uuid;
begin
  -- THE CALLER'S FIRM IS RESOLVED FIRST, AND THE READ IS SCOPED BY IT (round-2 blocker). An earlier
  -- draft relied on "RLS still scopes the artifact" -- which is FALSE inside a definer body: this
  -- runs as clara_fn_owner, whose owner policy on clara.report_artifacts is `using (true)`, so the
  -- table returns EVERY firm's rows. Granted to clara_authenticated, that made any signed-in user
  -- of any firm able to read another firm's sealed manifest, digests and storage_key -- which
  -- embeds the other firm's uuid and the exact object path of their financial statements.
  --
  -- NO EXISTENCE ORACLE (the standing CLR11 rule, same shape as clara.get_close_plan): an absent
  -- artifact id and a foreign one produce the IDENTICAL refusal, so a caller cannot learn that an
  -- id exists by watching which error comes back.
  v_firm := clara.actor_firm_id();
  if v_firm is null then
    raise exception 'no authenticated context' using errcode = 'CLR04';
  end if;
  select * into art from clara.report_artifacts where id = p_artifact and firm_id = v_firm;
  if not found then
    raise exception 'report artifact is not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"report_artifact_not_found"}';
  end if;
  select * into ds from clara.report_datasets
   where report_run_id = art.report_run_id and firm_id = v_firm and chart_spec_version_id is null;
  return jsonb_build_object(
    'replay_of_artifact_id', art.id,
    'report_run_id', art.report_run_id,
    'kind', art.kind,
    -- The bytes the drill must reproduce, and the manifest that says how.
    'expected_sha256', art.sha256,
    'expected_byte_size', art.byte_size,
    'sealed_manifest', art.manifest,
    'renderer_image_digest', art.manifest->>'renderer_image_digest',
    'dataset_id', ds.id,
    'dataset_sha256', case when ds.id is null then null else encode(ds.dataset_sha256, 'hex') end,
    'storage_key', art.storage_key,
    'sealed_at', art.sealed_at,
    -- Stated in the payload so a drill transcript carries its own boundary.
    'replay_note', 'These are the artifact''s OWN sealed inputs. Re-render from renderer_image_digest and compare against expected_sha256. This function enqueues nothing, dispatches nothing and seals nothing; a mismatch is a finding to record, not a state to repair.');
end $$;
revoke all on function clara.replay_render_inputs(uuid) from public;

-- =====================================================================================
-- THE REQUEUE DOOR. A terminally failed render job is a fact the firm keeps; this mints its
-- SUCCESSOR so the work can happen anyway.
--
-- THE MANIFEST IS RE-DERIVED, NOT COPIED, and the reasoning matters more than the line of code.
-- The first draft copied the predecessor's pinned request verbatim, so that a retry rendered the
-- same document. That is not achievable, and the DB says so: epsilon's seal RE-DERIVES every
-- DB-owned pin at completion and refuses any manifest that disagrees (0071, manifest_binding_
-- mismatch). statutory_wording is append-only, so one later verified row moves the aggregate the
-- pins are built from — and a verbatim successor would then be REFUSED at completion, every time,
-- after burning its five paid machines, with re-requeuing minting the same stale manifest again.
-- Verbatim was never "render the predecessor's document"; it was a deferred refusal, and it would
-- have stranded a run permanently through the very door built to end stranding.
--
-- So the successor pins TODAY's inputs, and the drift is made VISIBLE instead of fatal: the
-- predecessor's digest travels beside the fresh one in the return and in the audit row, with an
-- explicit `manifest_changed` flag. An operator can see that the document they get is not the
-- document that failed, which is the honest fact — the alternative was a door that always failed.
--
-- WHAT IT STILL DOES NOT DO, and each of these is deliberate:
--   * it does not touch the failed row (the terminal wall stands; the failure stays readable);
--   * it does not move authority (requested_by is the predecessor's -- the human who asked for
--     this report -- so the artifact still seals on_behalf_of that person; the operator who
--     pressed requeue is the AUDIT row's actor, which is where an operational act belongs).
-- =====================================================================================
create function clara.requeue_render_job(p_job uuid, p_reason text,
                                         p_accept_drift boolean default false) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; j record; v_live uuid; v_new uuid; v_reason text;
        v_manifest jsonb; v_sha text; v_drift boolean;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  v_reason := btrim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'a requeue states why' using errcode = 'CLR43',
      detail = '{"reason":"requeue_reason_required","fix":"name the incident this successor answers -- it is written on the row and into the audit log"}';
  end if;

  -- NO EXISTENCE ORACLE: an absent job id and another firm's job produce the IDENTICAL refusal.
  select * into j from clara.render_jobs where id = p_job and firm_id = c.firm;
  if not found then
    raise exception 'render job is not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"render_job_not_found"}';
  end if;
  -- ONLY A TERMINAL FAILURE IS REQUEUEABLE. A `done` job produced an artifact and re-rendering it
  -- is the DR drill's read-only job, not this one; a live job needs no successor and minting one
  -- would put two workers on the same pinned request.
  if j.state <> 'failed' then
    raise exception 'only a failed render job can be requeued' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_job_not_failed', 'state', j.state,
        'fix', case j.state when 'done' then 'this job produced an artifact; use clara.replay_render_inputs to re-render it as a drill'
                            else 'the job is still live; let it finish or fail before requeuing' end)::text;
  end if;
  -- THE CHEAP DEFINITIVE REFUSAL COMES FIRST (round-5). Re-deriving the manifest walks the whole
  -- pin set; the live-job read is one indexed lookup and its answer is final either way. Ordering
  -- them the other way meant a caller whose request already had a live successor paid for a full
  -- derivation to be told something the cheap read knew. Both are correct in either order — this
  -- one is correct and does not do work it will throw away.
  --
  -- ONE SUCCESSOR PER (RUN, KIND), NOT PER DIGEST — the round-4 correction, and the same reasoning
  -- that moved enqueue's refusal off the digest in the round-3 commit. Keyed on the digest, this
  -- read missed the case re-derivation creates: requeue A after drift mints B under a FRESH digest,
  -- so requeuing A again finds no live row with A's digest and mints C. Two live jobs for one run
  -- and one kind, both claiming to succeed A, and the partial index cannot object because their
  -- digests differ. What "already has a live job" means is a live job for this REQUEST -- the run
  -- and the kind -- whatever it hashed to.
  select id into v_live from clara.render_jobs
   where report_run_id = j.report_run_id and kind = j.kind and state <> 'failed';
  if v_live is not null then
    raise exception 'this render request already has a live job' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_job_already_requeued', 'render_job_id', v_live)::text;
  end if;

  -- TODAY's pins, from the same builder the first enqueue used. If nothing moved, this digest
  -- equals the predecessor's and the successor is a plain retry; if wording or a template version
  -- moved, it differs, and the drift gate below refuses until an operator says otherwise.
  v_manifest := clara.render_request_manifest_v1(j.report_run_id, j.kind);
  v_sha := encode(clara._hash(v_manifest), 'hex');
  v_drift := v_sha is distinct from j.manifest_sha256;

  -- DRIFT IS CONSENTED TO, NOT ANNOUNCED AFTERWARDS (round-4 ruling; the self_approval_attestation
  -- pattern). Re-deriving is right — a verbatim copy cannot pass the seal — but it means the
  -- successor may render a DIFFERENT document from the one that failed: a template published or a
  -- wording row verified since the first attempt changes what the statements say. Telling the
  -- operator that in the return value, after the job is minted, is telling them too late. So when
  -- the digests differ the door REFUSES and hands back both, and the retry carries an explicit
  -- p_accept_drift => true. Fail-closed: the default is false, so a caller who never heard of drift
  -- cannot consent to it by omission.
  if v_drift and not coalesce(p_accept_drift, false) then
    raise exception 'the re-derived request differs from the one that failed' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'requeue_manifest_drifted',
        'superseded_manifest_sha256', j.manifest_sha256, 'manifest_sha256', v_sha,
        'fix', 'something this render depends on moved since the failure -- verified wording, a published template, the resolved layout. Read both manifests, and if the newer document is the one you want, call again with p_accept_drift => true. A verbatim retry is not on offer: the seal re-derives every pin and would refuse it.')::text;
  end if;

  begin
    insert into clara.render_jobs(firm_id, client_id, report_run_id, kind, request_manifest,
        manifest_sha256, requested_by, supersedes_render_job_id, requeue_reason)
      values (j.firm_id, j.client_id, j.report_run_id, j.kind, v_manifest,
        v_sha, j.requested_by, j.id, v_reason)
      returning id into v_new;
  exception when unique_violation then
    raise exception 'this render request already has a live job' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_job_already_requeued',
        'detail', 'the successor was minted by a concurrent caller between this call''s check and its insert')::text;
  end;

  perform clara._audit(c.firm, c.actor, j.requested_by, null, 'requeue_render_job', null,
    jsonb_build_object('render_job_id', v_new, 'supersedes_render_job_id', j.id,
      'report_run_id', j.report_run_id, 'kind', j.kind,
      -- BOTH DIGESTS, and the flag that says whether they differ. This is the audit trail for
      -- "the retry did not render the same document", which re-derivation makes possible and
      -- which a verbatim copy would have hidden behind a refusal at completion.
      'manifest_sha256', v_sha, 'superseded_manifest_sha256', j.manifest_sha256,
      'manifest_changed', v_drift, 'drift_accepted', coalesce(p_accept_drift, false),
      'reason', v_reason, 'predecessor_last_error', j.last_error));

  return jsonb_build_object('render_job_id', v_new, 'supersedes_render_job_id', j.id,
    'report_run_id', j.report_run_id, 'kind', j.kind, 'state', 'claimable',
    'manifest_sha256', v_sha, 'superseded_manifest_sha256', j.manifest_sha256,
    -- The caller is TOLD when the successor is not the same document, rather than finding out at
    -- completion. `false` here is the ordinary case: nothing upstream moved.
    'manifest_changed', v_drift, 'drift_accepted', coalesce(p_accept_drift, false),
    'requeue_reason', v_reason);
end $$;
revoke all on function clara.requeue_render_job(uuid, text, boolean) from public;

-- =====================================================================================
-- THE WORKER'S FENCE -- the machine half of the reap fix, and the only runtime verb in this file.
--
-- File 3's reap now waits half a lease past expiry before terminating a job, so a slow-but-healthy
-- render is not killed for being slow. That closes the race from one side only: a worker whose
-- render ran long still has to find out that its lease is gone BEFORE it spends money finishing and
-- BEFORE it tries to seal, or it does the whole job and is refused at the last step.
--
-- So the worker fences itself: it asks this, cheaply, before the expensive typesetting step and
-- again before upload and completion, and abandons quietly if the answer is false -- WITHOUT
-- calling fail_render_job, because a fenced worker has no authority over that row any more and
-- writing a failure it does not own is exactly the stale-authority defect M1 closed.
--
-- It reads one row and returns one boolean. It is STABLE, takes no lock, and tells the caller
-- nothing about a job it does not hold: the answer for another worker's job, an absent job and a
-- finished job is the same plain `false`.
-- =====================================================================================
create function clara.render_lease_alive(p_job uuid, p_worker text) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.render_jobs j
     where j.id = p_job
       and j.state = 'running'
       and j.claimed_by is not distinct from nullif(btrim(coalesce(p_worker, '')), '')
       and j.lease_expires_at > now());
$$;
revoke all on function clara.render_lease_alive(uuid, text) from public;

reset role;

-- BOTH DOORS ARE HUMAN. The DR drill is performed by an operator and the requeue is an operational
-- act with a name attached; the machine lane has no business enumerating sealed artifacts or
-- deciding that a failure deserves another paid render. The fence is the mirror image: a worker's
-- own liveness check, useless to a human and granted to no human.
grant execute on function clara.replay_render_inputs(uuid) to clara_authenticated;
grant execute on function clara.requeue_render_job(uuid, text, boolean) to clara_authenticated;
grant execute on function clara.render_lease_alive(uuid, text) to clara_runtime;

do $tail$
declare
  v_doors text[] := array['replay_render_inputs', 'requeue_render_job'];
  v_granted text[]; v_leak int;
begin
  -- (1) Both doors are granted to clara_authenticated -- read from the live ACLs, not asserted.
  select coalesce(array_agg(distinct p.proname order by p.proname), '{}') into v_granted
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and rr.rolname = 'clara_authenticated' and p.proname = any (v_doors);
  if not (v_granted @> v_doors and v_doors @> v_granted) then
    raise exception 'zeta doors tail: clara_authenticated EXECUTE set is %, expected %',
      v_granted, v_doors using errcode = 'CLR10';
  end if;
  -- (2) And to NOBODY else -- INCLUDING PUBLIC, which is the round-2 correction. This census used
  -- to inner-join pg_roles, and aclexplode reports a PUBLIC grant with grantee = 0, which matches
  -- no pg_roles row: the join silently DROPPED the one grant that would matter most, while the
  -- notice below claimed the door was human-only. A left join with a coalesced name sees it.
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname = any (v_doors)
     and coalesce(rr.rolname, 'PUBLIC') not in ('clara_authenticated', 'clara_fn_owner');
  if v_leak <> 0 then
    raise exception 'zeta doors tail: % EXECUTE grant(s) on a human door to a role that must not hold one',
      v_leak using errcode = 'CLR10';
  end if;
  -- (3) THE FENCE IS THE WORKER'S, AND ONLY THE WORKER'S. Same exclude-not-enumerate shape, same
  -- PUBLIC-visible join: a human holding this would gain nothing, but a wake or agent role holding
  -- it would be a second lane reading job state the queue deliberately keeps behind its verbs.
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname = 'render_lease_alive'
     and coalesce(rr.rolname, 'PUBLIC') not in ('clara_runtime', 'clara_fn_owner');
  if to_regprocedure('clara.render_lease_alive(uuid,text)') is null or v_leak <> 0 then
    raise exception 'zeta doors tail: the worker fence is absent or reachable by % role(s) that must not hold it',
      v_leak using errcode = 'CLR10';
  end if;
  -- WHAT THIS TAIL DOES NOT CLAIM, said out loud because the previous version claimed it: there
  -- was an arm here asserting both doors "resolve the caller's firm", implemented as
  -- `prosrc like '%actor_firm_id%'`. That is a spelling test, not an identity one -- prosrc
  -- includes COMMENTS, so a body that merely mentioned the function in a comment would have
  -- satisfied it, and a body that resolved the firm through a differently-named helper would have
  -- failed it. PL/pgSQL records no dependency on the functions its body calls, so there is nothing
  -- structural here to read. The firm scope is proven where it can actually be proven -- by
  -- BEHAVIOUR, in packages/db/tests/zeta-render-walls.test.mjs, where another firm's caller and an
  -- absent id must come back with the identical refusal after a positive arm has shown the owning
  -- firm's caller succeeding. A census that cannot prove its claim should not print it.
  if current_user <> (select v from _zeta_doors_pre where k = 'deploy_principal') then
    raise exception 'zeta doors tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta doors OK: two HUMAN verbs with clara_authenticated their only grantee, and ONE runtime fence with clara_runtime its only grantee -- each proved by a census that can SEE a PUBLIC grant (grantee 0 no longer vanishes in an inner join). replay_render_inputs returns an artifact''s own sealed inputs and moves nothing. requeue_render_job mints a SUCCESSOR to a terminally failed job, RE-DERIVING the pinned request from today''s facts (a verbatim copy would be refused by epsilon''s seal, which re-derives every pin at completion -- so verbatim was a deferred refusal, not a faithful retry) and reporting the predecessor''s digest beside the new one so drift is visible rather than fatal. The failed row itself is never touched: the wall stands and the ledger moves forward. render_lease_alive lets a worker check it still holds its job before spending money and before sealing, so the reap''s half-lease grace and the worker''s own fence close the slow-worker race from both sides. The firm scope of both doors is proven by the behavioural battery, not asserted here -- see the comment above.';
end $tail$;
