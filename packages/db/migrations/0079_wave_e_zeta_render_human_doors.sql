-- 0079_wave_e_zeta_render_human_doors.sql -- lane zeta, file 5 of 5 (THE TWO HUMAN DOORS).
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
--
-- WHY THIS FILE EXISTS AT ALL. Files 1-4 are the machine lane: the queue, the pinned request, the
-- claim/dispatch verbs and the completion seal, every one of them granted to clara_runtime alone.
-- These two are the opposite -- granted to clara_authenticated and to NOTHING else, called by a
-- person, reachable by no worker. Keeping them together makes the grant census in the tail a
-- statement about the whole human surface rather than about one function at a time.
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
  if to_regprocedure('clara.requeue_render_job(uuid,text)') is not null then
    raise exception 'zeta partial birth: clara.requeue_render_job already exists' using errcode = 'CLR10';
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
-- WHAT IT DOES NOT DO, and each of these is deliberate:
--   * it does not touch the failed row (the terminal wall stands; the failure stays readable);
--   * it does not re-derive the request manifest (re-deriving would answer "what would we pin
--     today" -- a template published since would silently change what gets rendered; the whole
--     point is to retry THE SAME pinned request, so the manifest and its digest are COPIED);
--   * it does not move authority (requested_by is the predecessor's -- the human who asked for
--     this report -- so the artifact still seals on_behalf_of that person; the operator who
--     pressed requeue is the AUDIT row's actor, which is where an operational act belongs).
-- =====================================================================================
create function clara.requeue_render_job(p_job uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; j record; v_live uuid; v_new uuid; v_reason text;
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
  -- ONE SUCCESSOR, NOT A QUEUE OF THEM. The partial key would refuse the insert anyway; this says
  -- so in words, and names the row that is already carrying the work.
  select id into v_live from clara.render_jobs
   where report_run_id = j.report_run_id and manifest_sha256 = j.manifest_sha256 and state <> 'failed';
  if v_live is not null then
    raise exception 'this render request already has a live job' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_job_already_requeued', 'render_job_id', v_live)::text;
  end if;

  insert into clara.render_jobs(firm_id, client_id, report_run_id, kind, request_manifest,
      manifest_sha256, requested_by, supersedes_render_job_id, requeue_reason)
    values (j.firm_id, j.client_id, j.report_run_id, j.kind, j.request_manifest,
      j.manifest_sha256, j.requested_by, j.id, v_reason)
    returning id into v_new;

  perform clara._audit(c.firm, c.actor, j.requested_by, null, 'requeue_render_job', null,
    jsonb_build_object('render_job_id', v_new, 'supersedes_render_job_id', j.id,
      'report_run_id', j.report_run_id, 'kind', j.kind, 'manifest_sha256', j.manifest_sha256,
      'reason', v_reason, 'predecessor_last_error', j.last_error));

  return jsonb_build_object('render_job_id', v_new, 'supersedes_render_job_id', j.id,
    'report_run_id', j.report_run_id, 'kind', j.kind, 'state', 'claimable',
    'manifest_sha256', j.manifest_sha256, 'requeue_reason', v_reason);
end $$;
revoke all on function clara.requeue_render_job(uuid, text) from public;

reset role;

-- BOTH DOORS ARE HUMAN. The DR drill is performed by an operator and the requeue is an operational
-- act with a name attached; the machine lane has no business enumerating sealed artifacts or
-- deciding that a failure deserves another paid render.
grant execute on function clara.replay_render_inputs(uuid) to clara_authenticated;
grant execute on function clara.requeue_render_job(uuid, text) to clara_authenticated;

do $tail$
declare
  v_doors text[] := array['replay_render_inputs', 'requeue_render_job'];
  v_granted text[]; v_leak int; v_scoped int;
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
  -- (3) Both bodies RESOLVE THE CALLER'S FIRM. Read from the live bodies rather than trusted: a
  -- definer function that forgot this returns every firm's rows through the owner policy, which is
  -- exactly the defect this file was written to close.
  select count(*) into v_scoped from pg_proc
   where oid in ('clara.replay_render_inputs(uuid)'::regprocedure,
                 'clara.requeue_render_job(uuid,text)'::regprocedure)
     and (prosrc like '%actor_firm_id%' or prosrc like '%_human_ctx%');
  if v_scoped <> 2 then
    raise exception 'zeta doors tail: only % of 2 human doors resolve the caller''s firm', v_scoped
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _zeta_doors_pre where k = 'deploy_principal') then
    raise exception 'zeta doors tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta doors OK: two HUMAN verbs, clara_authenticated their only grantee -- proved by a census that can SEE a PUBLIC grant (grantee 0 no longer vanishes in an inner join). replay_render_inputs returns an artifact''s own sealed inputs and moves nothing; requeue_render_job mints a SUCCESSOR to a terminally failed job, copying the pinned request verbatim rather than re-deriving it, naming its predecessor and the operator''s stated reason on the row and in the audit log. The failed row itself is never touched: the wall stands and the ledger moves forward. Both doors resolve the caller''s firm in the body -- read from the live bodies -- and refuse an absent id and a foreign id with the same message.';
end $tail$;
