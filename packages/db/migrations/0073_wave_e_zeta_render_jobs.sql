-- 0073_wave_e_zeta_render_jobs.sql -- lane zeta, file 1 of 5 (THE QUEUE TABLE).
--
-- THE RENDER QUEUE (design wave-e-design-reporting-part2.md SS10). The zeta set applies AFTER
-- the whole epsilon set (it FKs clara.report_runs and clara.report_artifacts) and after delta
-- (file 2 reads clara.metric_input_snapshots / clara.evaluator_versions / clara.metric_cells for
-- the pin set). Number claims at MERGE; the timeout is PRECAUTIONARY.
--
--   file 1 (this)  clara.render_jobs + forced RLS + the lifecycle wall
--   file 2         clara.render_request_manifest_v1 + clara.enqueue_render_job (the EPSILON
--                  integration point) + clara.enqueue_missing_render_jobs (the fallback sweep)
--   file 3         clara.claim_render_job / fail_render_job / render_dispatch_begin / _record
--   file 4         the epsilon seal seam + clara.complete_render_job
--
-- WHY A DB QUEUE AND NOT AN HTTP CALL (SS10, four reasons, none of them taste):
--   (a) the request is enqueued INSIDE the same audited transaction that seals the dataset and
--       writes the claim assessment -- there is no window in which a render exists without a seal;
--   (b) the worker needs NO inbound network: it dials out to Postgres and object storage only,
--       which is exactly what "offline at render time" requires;
--   (c) at-least-once is SAFE -- the idempotency key is (report_run_id, manifest_sha256), the
--       output storage key is content-addressed, and the PUT is x-upsert:false;
--   (d) no new authenticated HTTP surface exists to defend.
--
-- WHAT manifest_sha256 IS, STATED ONCE SO NOBODY HAS TO INFER IT. It is the sha256 of the
-- REQUEST manifest -- the pinned INPUTS, known at enqueue time (file 2's Z2). It is NOT the
-- sealed artifact's `render_manifest_sha256`, which hashes the FULL manifest including outputs
-- the render itself produces (the PDF hash, the extracted-text hash, the renderer image digest).
-- Those outputs cannot exist before the render, so keying a render REQUEST on them would be
-- circular. The design's phrase "(run_id, manifest_sha256)" resolves here to the REQUEST hash,
-- and the two are bound to each other at completion: file 4 refuses a completion whose manifest
-- does not carry this job's own request hash under `render_request_sha256`.
--
-- CLR CODE PROPOSAL. The render-queue family raises CLR43, a PROPOSAL claimed at MERGE against
-- the live roster (CLR01-CLR41 taken as authored, CLR42 claimed by epsilon, CLR99 reserved).
-- Tests assert the reason token and the message, never the bare SQLSTATE, so a renumber at merge
-- moves one constant and breaks nothing.
--
-- ROLE POSTURE, AND THE ONE JUDGEMENT CALL IN IT. Every verb in files 2-4 is SECURITY DEFINER
-- under clara_fn_owner and is granted to clara_runtime ONLY (the reconcile_autopost_rules /
-- run_depreciation_period precedent: a plain call on the already-role-set leader connection).
-- clara_runtime holds NO table privilege on clara.render_jobs -- not even SELECT -- so the queue
-- is reachable only through those verbs. The RENDER WORKER is a second consumer of that same
-- clara_runtime lane; a dedicated clara_render role would be tighter, and is registered as a
-- candidate rather than taken here, because minting a role is a roles-bootstrap.sql change plus
-- a live ceremony plus a DR convergence-scope change, and none of those is this file's to make.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _zeta_queue_pre(k text primary key, v text not null) on commit drop;
insert into _zeta_queue_pre values ('deploy_principal', session_user);

do $pre$
declare v_agent text;
begin
  if to_regclass('clara.report_artifacts') is null
     or to_regclass('clara.report_runs') is null
     or to_regprocedure('clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)') is null then
    raise exception 'zeta requires the epsilon reporting set (files 1-7)' using errcode = 'CLR10';
  end if;
  if to_regclass('clara.render_jobs') is not null then
    raise exception 'zeta partial birth: clara.render_jobs already exists' using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(table_name, ',' order by table_name), '(none)') into v_agent
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT';
  insert into _zeta_queue_pre values ('agent_ro_select', v_agent);
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- Z1 -- THE QUEUE.
--
-- kind admits 'draft_watermarked' and 'pre_sign' ONLY. A signed original is RETAINED and
-- RETRIEVED, never regenerated (SS9, ruled) -- so "there is no such thing as a render job for a
-- signed original" is a CHECK here rather than a convention somebody has to remember.
--
-- (report_run_id, manifest_sha256) IS the idempotency key, and it holds for every state EXCEPT a
-- terminal failure. A `done` job stays in the way of a duplicate enqueue forever, which is the
-- whole point -- the second enqueue of an identical request is a no-op that returns the first job.
--
-- WHY 'failed' IS OUT OF THE KEY (round-2 major). It was unconditional, and combined with the
-- attempt-cap reap and the whole-row terminal wall that PERMANENTLY STRANDED a report run: a
-- transient capacity incident burned five claims, the sweep parked the job `failed`, and after that
-- re-enqueue was a no-op returning the dead row, the fallback sweep skipped the run for having a
-- job, and no role could edit the row. The firm's statutory PDF became unproducible except by
-- migration. An idempotency key exists to stop a DUPLICATE LIVE request, not to make a failure
-- final forever, so a terminally failed row steps out of the key and the ledger can move forward
-- through clara.requeue_render_job (file 5) -- an audited human act that mints a SUCCESSOR row and
-- leaves the failed one immutable and readable.
-- =====================================================================================
create table clara.render_jobs (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references clara.firms(id),
  client_id         uuid not null,
  report_run_id     uuid not null,
  kind              text not null check (kind in ('draft_watermarked', 'pre_sign')),
  -- The PINNED INPUTS (file 2's Z2 output) and their digest.
  request_manifest  jsonb not null check (jsonb_typeof(request_manifest) = 'object'),
  manifest_sha256   text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  -- The human on whose authority this render runs. Copied from the run at enqueue rather than
  -- resolved at completion: the worker has no actor of its own, and an artifact must name a
  -- human the firm can hold to it (file 4 seals with exactly this id).
  requested_by      uuid not null references clara.users(id),
  state             text not null default 'claimable'
                      check (state in ('claimable', 'running', 'done', 'failed')),
  attempts          int  not null default 0 check (attempts >= 0),
  max_attempts      int  not null default 5 check (max_attempts > 0),
  -- The worker's lease. claimed_by is the worker's own instance id (a machine id, never a
  -- credential); the lease is what lets a crashed worker's job become claimable again without a
  -- human, and what stops a second worker completing a job it does not hold.
  claimed_by        text,
  claimed_at        timestamptz,
  lease_expires_at  timestamptz,
  -- A33 arm (ii)'s measurement: how long the job actually waited before a worker claimed it.
  -- It lives HERE and never in the manifest -- a time-varying value inside the manifest would
  -- make the render's own inputs vary run to run, which is precisely what SS10 forbids.
  first_claimed_at  timestamptz,
  claim_delay_ms    bigint check (claim_delay_ms is null or claim_delay_ms >= 0),
  -- The leader's dispatch bookkeeping (file 3). Attempts are stamped BEFORE the Fly call, so a
  -- persistently failing dispatch backs off on the cooldown instead of storming every ~2s.
  dispatch_attempts   int not null default 0 check (dispatch_attempts >= 0),
  last_dispatch_at    timestamptz,
  last_dispatch_ok    boolean,
  last_dispatch_error jsonb,
  artifact_id       uuid,
  last_error        jsonb,
  -- THE SUCCESSION LINK (file 5's requeue door). Set once, at insert, on a job minted to replace a
  -- terminally failed one; null on every ordinary enqueue. Both columns are part of the REQUEST
  -- half of the row, so the lifecycle wall below freezes them for free -- a successor cannot later
  -- rewrite whose failure it answers, or why.
  -- COMPOSITE, like the artifact link below and for the same reason (round-3 minor): a bare
  -- id-only reference would let a successor name a predecessor belonging to a DIFFERENT RUN, which
  -- is precisely the kind of cross-run link the composite FK on artifact_id exists to make
  -- impossible. The (id, report_run_id) unique key already on this table is what it points at.
  supersedes_render_job_id uuid,
  requeue_reason    text check (requeue_reason is null or btrim(requeue_reason) <> ''),
  constraint ck_rj_requeue_paired check ((supersedes_render_job_id is null) = (requeue_reason is null)),
  foreign key (supersedes_render_job_id, report_run_id) references clara.render_jobs (id, report_run_id),
  enqueued_at       timestamptz not null default now(),
  finished_at       timestamptz,
  foreign key (report_run_id, firm_id, client_id)
    references clara.report_runs (id, firm_id, client_id),
  -- The produced artifact cannot belong to another run: a composite FK, not a promise.
  foreign key (artifact_id, report_run_id) references clara.report_artifacts (id, report_run_id),
  unique (id, report_run_id),
  -- A lease exists exactly while the job is claimed, AND a running job always has one (round-4).
  -- The state tie is not tidiness: the reap's predicate compares lease_expires_at, and a `running`
  -- row with a NULL lease would make that comparison NULL — the row would never reap, never be
  -- claimable, and never terminate. A fail-open arithmetic hole is worth a CHECK.
  constraint ck_rj_lease_paired check (
    (claimed_by is null) = (claimed_at is null) and (claimed_by is null) = (lease_expires_at is null)
    and (state <> 'running' or claimed_by is not null)),
  constraint ck_rj_claim_delay_paired check ((first_claimed_at is null) = (claim_delay_ms is null)),
  -- A terminal state is stamped, and only a 'done' job may name an artifact.
  constraint ck_rj_terminal_stamped check ((state in ('done', 'failed')) = (finished_at is not null)),
  constraint ck_rj_artifact_only_when_done check (artifact_id is null or state = 'done'),
  constraint ck_rj_done_has_artifact check (state <> 'done' or artifact_id is not null),
  constraint ck_rj_failed_has_reason check (state <> 'failed' or last_error is not null)
);
-- THE IDEMPOTENCY KEY, as a partial unique index (see the header). Everything but a terminally
-- failed row is in it, so one live-or-completed job per pinned request is still structural.
create unique index ux_render_jobs_request on clara.render_jobs (report_run_id, manifest_sha256)
  where state <> 'failed';
-- The claim scan's index: claimable-or-expired, oldest first.
create index ix_render_jobs_claimable on clara.render_jobs (state, lease_expires_at, enqueued_at, id)
  where state in ('claimable', 'running');
create index ix_render_jobs_run on clara.render_jobs (report_run_id, enqueued_at);

-- THE LIFECYCLE WALL. The immutable half of a queue row is the REQUEST: which run, which kind,
-- what it is pinned to, who authorised it. Everything a worker or the leader legitimately moves
-- is state/lease/dispatch/outcome. Compared WHOLE (to_jsonb minus the mutable columns) so a
-- column a later migration adds is protected by default rather than by somebody extending a list
-- -- epsilon's publication-freeze trigger makes the same argument for the same reason.
create function clara._tf_render_job_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare mutable text[] := array['state', 'attempts', 'claimed_by', 'claimed_at',
  'lease_expires_at', 'first_claimed_at', 'claim_delay_ms', 'dispatch_attempts',
  'last_dispatch_at', 'last_dispatch_ok', 'last_dispatch_error', 'artifact_id',
  'last_error', 'finished_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'a render job is never deleted' using errcode = 'CLR08',
      detail = '{"reason":"render_job_never_deleted"}';
  end if;
  if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
    raise exception 'a render job''s pinned request is immutable' using errcode = 'CLR08',
      detail = '{"reason":"render_job_request_immutable","fix":"enqueue a new job; a changed pin is a different render"}';
  end if;
  -- TERMINAL IS TERMINAL, AND IT IS THE WHOLE ROW (codex M2). An earlier version guarded only the
  -- state VALUE, which left a done job's artifact_id, last_error, finished_at, attempts and
  -- dispatch bookkeeping freely mutable — so a definer-path defect could rewrite which artifact a
  -- completed job produced, or erase the evidence of how it completed, without reopening it and
  -- without tripping this trigger. Attribution that can be rewritten after the fact is not
  -- attribution. Once terminal, NOTHING moves: the comparison is the whole row, so a column a
  -- later migration adds is protected by default rather than by somebody remembering to list it.
  if old.state in ('done', 'failed') then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'a terminal render job is immutable' using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'render_job_terminal', 'state', old.state,
          'fix', 'a finished job records what happened; enqueue a new job rather than editing a closed one')::text;
    end if;
    return new;
  end if;
  return new;
end $$;
revoke all on function clara._tf_render_job_lifecycle() from public;

reset role;

-- =====================================================================================
-- FORCED RLS + THE PRIVILEGE POSTURE (the house rule). The owner/human policy pair, the human
-- SELECT grant, the no-truncate wall, and the narrow lifecycle trigger instead of the generic
-- append-only wall -- a queue row is legitimately UPDATEd (claim, fail, dispatch, complete),
-- which is exactly why it gets a trigger that says which columns may move.
--
-- clara_runtime gets NO table privilege. It reaches the queue only through the verbs.
-- =====================================================================================
alter table clara.render_jobs enable row level security;
alter table clara.render_jobs force row level security;
create policy p_renderjobs_owner on clara.render_jobs
  for all to clara_fn_owner using (true) with check (true);
create policy p_renderjobs_human on clara.render_jobs
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.render_jobs to clara_authenticated;
revoke insert, update, delete, truncate on clara.render_jobs
  from clara_authenticated, clara_agent_ro, clara_runtime,
       clara_wake_interactive, clara_wake_proactive;
create trigger t_renderjobs_no_truncate before truncate on clara.render_jobs
  for each statement execute function clara._tf_no_truncate();
create trigger t_renderjobs_lifecycle before update or delete on clara.render_jobs
  for each row execute function clara._tf_render_job_lifecycle();

-- =====================================================================================
-- THE TAIL CENSUS. Read POSITIVELY from the live catalog -- never re-stated from the DDL above.
-- =====================================================================================
do $tail$
declare v_rls record; v_pol int; v_leak int; v_kinds int; v_key int;
        v_agent_now text; v_agent_before text;
begin
  select relrowsecurity, relforcerowsecurity into v_rls from pg_class
   where oid = 'clara.render_jobs'::regclass;
  if not (v_rls.relrowsecurity and v_rls.relforcerowsecurity) then
    raise exception 'zeta queue tail: RLS enabled=% forced=%',
      v_rls.relrowsecurity, v_rls.relforcerowsecurity using errcode = 'CLR10';
  end if;
  select count(*) into v_pol from pg_policy where polrelid = 'clara.render_jobs'::regclass;
  if v_pol <> 2 then
    raise exception 'zeta queue tail: % policies, expected the owner/human pair', v_pol
      using errcode = 'CLR10';
  end if;
  select count(*) into v_leak from information_schema.table_privileges
   where table_schema = 'clara' and table_name = 'render_jobs'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and grantee like 'clara\_%' and grantee <> 'clara_fn_owner';
  if v_leak <> 0 then
    raise exception 'zeta queue tail: % write privilege(s) on clara.render_jobs held by an app role',
      v_leak using errcode = 'CLR10';
  end if;
  -- The kind CHECK admits exactly two kinds -- proven by ASKING the constraint, not by re-reading
  -- the DDL: a signed original is never rendered.
  select count(*) into v_kinds from pg_constraint
   where conrelid = 'clara.render_jobs'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%draft\_watermarked%pre\_sign%'
     and pg_get_constraintdef(oid) not like '%signed\_original%';
  if v_kinds <> 1 then
    raise exception 'zeta queue tail: the render kind CHECK is not the two-kind form (% matches)',
      v_kinds using errcode = 'CLR10';
  end if;
  -- THE IDEMPOTENCY KEY IS THE PARTIAL ONE, asked of the catalog rather than assumed from the DDL
  -- above. Both halves matter and each fails a different way: unconditional and a requeue can never
  -- mint a successor (the run strands, which is the defect this shape exists to close); absent
  -- altogether and a duplicate enqueue silently starts a second paid render of the same request.
  select count(*) into v_key from pg_index i join pg_class c on c.oid = i.indexrelid
   where i.indrelid = 'clara.render_jobs'::regclass and i.indisunique and i.indpred is not null
     and c.relname = 'ux_render_jobs_request';
  if v_key <> 1 then
    raise exception 'zeta queue tail: the request idempotency key is not one partial unique index (% found)',
      v_key using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(table_name, ',' order by table_name), '(none)') into v_agent_now
    from information_schema.table_privileges
   where table_schema = 'clara' and grantee = 'clara_agent_ro' and privilege_type = 'SELECT';
  select v into v_agent_before from _zeta_queue_pre where k = 'agent_ro_select';
  if v_agent_now is distinct from v_agent_before then
    raise exception 'zeta queue tail: clara_agent_ro SELECT set moved. before=[%] after=[%]',
      v_agent_before, v_agent_now using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _zeta_queue_pre where k = 'deploy_principal') then
    raise exception 'zeta queue tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta queue OK: clara.render_jobs is forced-RLS with the owner/human policy pair and ZERO write privilege for any app role. The idempotency key is a PARTIAL unique index on (report_run_id, manifest_sha256) where state <> ''failed'' -- read from the catalog, not assumed -- so one live-or-completed job per pinned request is structural while a terminally failed one can still be answered by a successor through clara.requeue_render_job (file 5); the kind CHECK admits draft_watermarked and pre_sign only -- a signed original is retained and retrieved, never rendered. The pinned request is immutable, including the succession link, and a terminal job never reopens. clara_agent_ro gained nothing.';
end $tail$;
