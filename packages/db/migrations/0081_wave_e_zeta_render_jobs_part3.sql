-- 0081_wave_e_zeta_render_jobs_part3.sql -- lane zeta, file 3 of 5 (CLAIM + DISPATCH + REAP).
--
--   Z5  clara.claim_render_job            -- the worker's claim (for update skip locked)
--   Z5b clara.render_job_payload          -- the worker's per-job read
--   Z6  clara.fail_render_job             -- bounded retry, then a terminal failure with its reason
--   Z6b clara.reap_exhausted_render_jobs  -- queue hygiene: park the crash-only jobs at their cap
--   Z7  clara.render_dispatch_begin       -- the LEADER's due-read + attempt stamp (cooldown)
--   Z8  clara.render_dispatch_record      -- the leader's outcome receipt for that attempt
--
-- The claim, the failure path and the two dispatch verbs ARE acceptance cell A33's instrument. Arm
-- (i) reads the claim directly (two concurrent callers, one job, exactly one non-null answer)
-- rather than inferring it from an artifact appearing later; arm (ii) reads a leaderless queue
-- staying claimable with its wait recorded; arm (iii) is closed in file 4, where a second
-- completion of an already-sealed run reconciles to ONE artifact by a positive re-read.
--
-- Number claims at MERGE; the timeout is PRECAUTIONARY.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _zeta_claim_pre(k text primary key, v text not null) on commit drop;
insert into _zeta_claim_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. The column census here covers what Z5b (render_job_payload) reads, which file 2's
-- census does NOT: that one covers only the manifest builder's own reads.
--
-- WHY BOTH EXIST RATHER THAN ONE. Without this list, a rename upstream surfaces as a bare SQL error
-- at APPLY -- loud and fail-closed, but it names a column rather than a remedy, and it names it
-- during a ceremony rather than at review. With it, the refusal says which lane's table moved and
-- that the fix is to re-read it and update Z5b. Every name below was read from the on-disk DDL.
-- =====================================================================================
do $pre$
declare
  v_missing text[] := '{}';
  wanted text[][] := array[
    -- lane epsilon: the resolved layout and its bindings
    ['report_spec_versions', 'layout_ast'], ['report_spec_versions', 'locale'],
    ['report_spec_versions', 'report_class'],
    ['report_template_versions', 'claim_capability'],
    ['house_style_versions', 'style_spec'], ['house_style_versions', 'asset_manifest'],
    ['statutory_profile_versions', 'profile_key'],
    -- the sealed dataset the render actually draws from
    ['report_datasets', 'id'], ['report_datasets', 'report_run_id'],
    ['report_datasets', 'chart_spec_version_id'], ['report_datasets', 'resolved_thresholds'],
    ['report_dataset_points', 'dataset_id'], ['report_dataset_points', 'ordinal'],
    ['report_dataset_points', 'series_key'], ['report_dataset_points', 'cell_id'],
    ['report_dataset_points', 'point_status'], ['report_dataset_points', 'value_text'],
    ['report_dataset_points', 'dimensions'],
    ['chart_template_versions', 'chart_spec_ast'], ['chart_template_versions', 'axis_policy'],
    -- the two curated registries the gate-3 scan cannot run without
    ['protected_placeholders', 'placeholder_key'],
    ['claim_phrase_lexicon', 'phrase_key'], ['claim_phrase_lexicon', 'locale'],
    ['claim_phrase_lexicon', 'version'], ['claim_phrase_lexicon', 'phrase'],
    ['claim_phrase_lexicon', 'match_kind'], ['claim_phrase_lexicon', 'effective_from'],
    ['claim_phrase_lexicon', 'effective_to'],
    -- the verified wording (this payload draws verified rows; the DIGEST hashes all applicable)
    ['statutory_wording', 'profile_key'], ['statutory_wording', 'wording_key'],
    ['statutory_wording', 'locale'], ['statutory_wording', 'wording_text'],
    ['statutory_wording', 'verification_state'],
    ['statutory_wording', 'applies_to_periods_beginning_from'],
    ['statutory_wording', 'applies_to_periods_beginning_to']];
  i int;
begin
  if to_regclass('clara.render_jobs') is null
     or to_regprocedure('clara.enqueue_render_job(uuid,text)') is null then
    raise exception 'zeta claim file requires files 1-2' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.claim_render_job(text,interval)') is not null then
    raise exception 'zeta partial birth: clara.claim_render_job already exists' using errcode = 'CLR10';
  end if;
  for i in 1 .. array_length(wanted, 1) loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'clara' and table_name = wanted[i][1]
                      and column_name = wanted[i][2]) then
      v_missing := v_missing || (wanted[i][1] || '.' || wanted[i][2]);
    end if;
  end loop;
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception 'zeta claim: % upstream column(s) the render payload reads are absent: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ') using errcode = 'CLR10',
      detail = '{"reason":"zeta_upstream_column_drift","fix":"re-read the upstream table and update Z5b; never relax this check"}';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- Z5 -- CLAIM ONE JOB (for update skip locked).
--
-- An EXPIRED lease is reclaimable. That is at-least-once by design and it is safe for the four
-- reasons in file 1's header; a job whose worker died mid-render is otherwise stranded until a
-- human notices, which is the failure mode the design refuses.
--
-- The lease is CLAMPED (1 minute .. 6 hours) rather than trusted: a caller-supplied lease is the
-- one input this verb takes, and an absurd one would either strand the job for a day or let two
-- workers overlap within a minute of each other.
-- =====================================================================================
create function clara.claim_render_job(p_worker text, p_lease interval default interval '20 minutes')
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare j record; v_worker text;
begin
  v_worker := nullif(btrim(coalesce(p_worker, '')), '');
  if v_worker is null then
    raise exception 'a render worker claims under its own instance id' using errcode = 'CLR43',
      detail = '{"reason":"render_worker_id_required"}';
  end if;
  update clara.render_jobs j0
     set state = 'running', claimed_by = v_worker, claimed_at = now(),
         lease_expires_at = now() + greatest(interval '1 minute',
                                             least(coalesce(p_lease, interval '20 minutes'),
                                                   interval '6 hours')),
         attempts = j0.attempts + 1,
         first_claimed_at = coalesce(j0.first_claimed_at, now()),
         claim_delay_ms = coalesce(j0.claim_delay_ms,
           (extract(epoch from (now() - j0.enqueued_at)) * 1000)::bigint)
   where j0.id = (
     select c.id from clara.render_jobs c
      where (c.state = 'claimable'
             or (c.state = 'running' and c.lease_expires_at < now()))
        -- THE RETRY CAP IS ENFORCED HERE, NOT ONLY IN THE FAILURE PATH (codex B1). fail_render_job
        -- parks a job at the cap, but only runs when a worker LIVES long enough to report. A
        -- CRASH-ONLY job never reaches that code: its lease expires and it becomes claimable again,
        -- so without this predicate `attempts` climbs past max_attempts forever and every cycle
        -- starts another PAID machine. A cap enforced only on the cooperative path is not a cap.
        and c.attempts < c.max_attempts
      order by c.enqueued_at, c.id
      for update skip locked
      limit 1)
   returning * into j;
  if not found then return null; end if;
  return jsonb_build_object(
    'render_job_id', j.id, 'firm_id', j.firm_id, 'client_id', j.client_id,
    'report_run_id', j.report_run_id, 'kind', j.kind,
    'manifest_sha256', j.manifest_sha256, 'request_manifest', j.request_manifest,
    'claimed_by', j.claimed_by, 'lease_expires_at', j.lease_expires_at,
    'attempts', j.attempts, 'max_attempts', j.max_attempts,
    'claim_delay_ms', j.claim_delay_ms);
end $$;
revoke all on function clara.claim_render_job(text, interval) from public;

-- =====================================================================================
-- Z5b -- WHAT THE WORKER IS ALLOWED TO READ.
--
-- The render worker runs as clara_runtime, which holds SELECT on NONE of epsilon's tables, so it
-- cannot browse the reporting schema at all: it asks for the payload of a job IT HOLDS, and the
-- lease check is what scopes the read. A worker with no live lease reads nothing.
--
-- E-R8 FLOOR 1 IS ENFORCED IN THE SHAPE OF THIS PAYLOAD. Cell values leave as `displayed_text` --
-- the string the DB already computed -- never as a number the renderer could re-format. So there is
-- nothing to round and no locale to apply: "no model and no user can type a number into a report"
-- extends to "and neither can the typesetter".
-- =====================================================================================
create function clara.render_job_payload(p_job uuid, p_worker text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare j record; sv record; hv record; tv record; pv record; v_points jsonb; v_charts jsonb;
  v_wording jsonb;
begin
  select * into j from clara.render_jobs where id = p_job;
  if not found then
    raise exception 'render job not found' using errcode = 'CLR11',
      detail = '{"reason":"render_job_not_found"}';
  end if;
  if j.state <> 'running'
     or j.claimed_by is distinct from nullif(btrim(coalesce(p_worker, '')), '')
     or j.lease_expires_at < now() then
    raise exception 'this render job is not held by that worker' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_lease_not_held', 'state', j.state)::text;
  end if;
  select * into sv from clara.report_spec_versions where id = (j.request_manifest->>'report_spec_version_id')::uuid;
  select * into tv from clara.report_template_versions where id = (j.request_manifest->>'report_template_version_id')::uuid;
  select * into hv from clara.house_style_versions where id = (j.request_manifest->>'house_style_version_id')::uuid;
  select * into pv from clara.statutory_profile_versions
   where id = (j.request_manifest->>'statutory_profile_version_id')::uuid;

  select coalesce(jsonb_agg(jsonb_build_object('ordinal', p.ordinal, 'series_key', p.series_key,
           'cell_id', p.cell_id, 'point_status', p.point_status,
           -- displayed_text, NOT a number. See this section's header.
           'displayed_text', p.value_text, 'dimensions', p.dimensions)
           order by p.ordinal), '[]'::jsonb)
    into v_points
    from clara.report_dataset_points p
    join clara.report_datasets d on d.id = p.dataset_id
   where d.report_run_id = j.report_run_id and d.chart_spec_version_id is null;

  select coalesce(jsonb_agg(x.c order by x.cid), '[]'::jsonb) into v_charts
    from (select d.chart_spec_version_id as cid,
            jsonb_build_object('chart_spec_version_id', d.chart_spec_version_id,
              'chart_spec_ast', cv.chart_spec_ast, 'axis_policy', cv.axis_policy,
              -- THE SEALED THRESHOLDS, CARRIED -- never re-resolved at render time. Epsilon
              -- resolves them once at seal, as of the run's PERIOD END, and freezes them inside
              -- the dataset digest. Re-resolving here would silently answer a different question
              -- the moment a newer constant version lands, which is exactly the
              -- dataset-before-render law this whole lane is built on. The renderer plots the
              -- frozen copy or it plots nothing.
              'resolved_thresholds', d.resolved_thresholds,
              'points', (select coalesce(jsonb_agg(jsonb_build_object('ordinal', p.ordinal,
                  'series_key', p.series_key, 'cell_id', p.cell_id, 'point_status', p.point_status,
                  'displayed_text', p.value_text, 'dimensions', p.dimensions) order by p.ordinal), '[]'::jsonb)
                from clara.report_dataset_points p where p.dataset_id = d.id)) as c
            from clara.report_datasets d
            join clara.chart_template_versions cv on cv.id = d.chart_spec_version_id
           where d.report_run_id = j.report_run_id and d.chart_spec_version_id is not null) x;

  -- VERIFIED wording only, on the same period window epsilon's pins use. THE TWO ARE NOT THE SAME
  -- QUERY: what the renderer may DRAW is verified text, so this filters on verification_state; what
  -- the manifest PINS is a provenance digest over ALL applicable rows with that state inside the
  -- hash, so verifying a row MOVES the pin. A window disagreement would pin text the render never
  -- saw -- but "make the digest verified-only to match" is the wrong repair and breaks the seal.
  select coalesce(jsonb_agg(jsonb_build_object('wording_key', w.wording_key, 'locale', w.locale,
           'wording_text', w.wording_text) order by w.wording_key, w.locale), '[]'::jsonb)
    into v_wording
    from clara.statutory_wording w
   where pv.profile_key is not null and w.profile_key = pv.profile_key
     and w.locale = sv.locale and w.verification_state = 'verified'
     and w.applies_to_periods_beginning_from <= (j.request_manifest#>>'{reporting_period,period_start}')::date
     and (w.applies_to_periods_beginning_to is null
          or w.applies_to_periods_beginning_to >= (j.request_manifest#>>'{reporting_period,period_start}')::date);

  -- THE CLAIM PHRASE LEXICON, WHOLE. Every ruled locale's effective rows travel with the job,
  -- not just the document's own locale: a Malay or Chinese claim phrase smuggled into an English
  -- pack is exactly the case the gate-3 scan exists to catch, and it cannot catch what it was
  -- never given. The worker REFUSES when any ruled locale comes back empty.
  return jsonb_build_object(
    'render_job_id', j.id, 'report_run_id', j.report_run_id, 'kind', j.kind,
    'manifest_sha256', j.manifest_sha256, 'request_manifest', j.request_manifest,
    'layout_ast', sv.layout_ast, 'locale', sv.locale, 'report_class', sv.report_class,
    'claim_capability', tv.claim_capability,
    'style_spec', hv.style_spec, 'asset_manifest', hv.asset_manifest,
    'statutory_wording', v_wording,
    'dataset_points', v_points, 'chart_datasets', v_charts,
    'protected_placeholders', (select coalesce(jsonb_agg(to_jsonb(pp) order by pp.placeholder_key), '[]'::jsonb)
                                 from clara.protected_placeholders pp),
    'claim_phrase_lexicon', (select coalesce(jsonb_agg(jsonb_build_object('phrase_key', l.phrase_key,
        'locale', l.locale, 'version', l.version, 'phrase', l.phrase, 'match_kind', l.match_kind)
        order by l.locale, l.phrase_key, l.version), '[]'::jsonb)
      from clara.claim_phrase_lexicon l
     where l.effective_from <= (j.request_manifest#>>'{reporting_period,period_end}')::date
       and (l.effective_to is null
            or l.effective_to >= (j.request_manifest#>>'{reporting_period,period_end}')::date)));
end $$;
revoke all on function clara.render_job_payload(uuid, text) from public;

-- =====================================================================================
-- Z6 -- FAIL A JOB. Bounded retry; the reason is REQUIRED and is recorded either way.
-- A job below its attempt cap returns to 'claimable'; AT the cap it becomes terminal 'failed'
-- with the reason on the row -- so a stranded render is visible as a ROW rather than as silence.
-- =====================================================================================
create function clara.fail_render_job(p_job uuid, p_worker text, p_reason jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare j record; v_terminal boolean;
begin
  if p_reason is null or jsonb_typeof(p_reason) <> 'object' then
    raise exception 'a render failure records a reason' using errcode = 'CLR43',
      detail = '{"reason":"render_failure_reason_required"}';
  end if;
  select * into j from clara.render_jobs where id = p_job for update;
  if not found then
    raise exception 'render job not found' using errcode = 'CLR11',
      detail = '{"reason":"render_job_not_found"}';
  end if;
  -- THE LEASE MUST STILL BE LIVE (codex M1). Identity alone is not authority: a worker whose lease
  -- expired has already had the job taken from it, and letting it park the row afterwards discards
  -- a SECOND worker's in-flight render under stale authority. complete_render_job already checks
  -- liveness; the failure path holds the same standard, or the cheaper verb becomes the
  -- way around the expensive one.
  if j.state <> 'running'
     or j.claimed_by is distinct from nullif(btrim(coalesce(p_worker, '')), '')
     or j.lease_expires_at < now() then
    raise exception 'this render job is not held by that worker' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_lease_not_held', 'state', j.state,
        'claimed_by', j.claimed_by, 'lease_expires_at', j.lease_expires_at)::text;
  end if;
  v_terminal := j.attempts >= j.max_attempts;
  update clara.render_jobs
     set state = case when v_terminal then 'failed' else 'claimable' end,
         claimed_by = null, claimed_at = null, lease_expires_at = null,
         last_error = p_reason,
         finished_at = case when v_terminal then now() end
   where id = j.id;
  return jsonb_build_object('render_job_id', j.id, 'attempts', j.attempts,
    'max_attempts', j.max_attempts, 'terminal', v_terminal,
    'state', case when v_terminal then 'failed' else 'claimable' end);
end $$;
revoke all on function clara.fail_render_job(uuid, text, jsonb) from public;

-- =====================================================================================
-- Z6b -- THE REAP, AS ITS OWN VERB. Queue hygiene, not dispatch.
--
-- ITS OWN VERB, because its only caller sat behind the dispatch belt's unwired early return -- and
-- an unwired deploy is SUPPORTED (the scheduled machine is the documented fall-back). So on exactly
-- the deployments relying on that fallback, a crash-only job at its cap stayed `running` forever
-- with no terminal state and nothing to read. It also must NOT stamp dispatch_attempts, which
-- render_dispatch_begin does, so a flag on that verb would have coupled hygiene to stamping.
--
-- IMMEDIATE, NOT GRACED (round-4 re-ruling). A draft waited half a lease past expiry to spare a
-- slow-but-healthy worker. That saves nothing: an at-cap row can never be re-claimed (the claim
-- requires attempts < max_attempts) and a post-expiry completion is refused anyway (file 4's
-- liveness check), so the delay bought only paid machines for unclaimable jobs and a late terminal
-- signal. The worker's own fence (clara.render_lease_alive, file 5) is what protects a slow render,
-- and it protects it where the protection is real: it stops the worker BEFORE it spends money.
-- =====================================================================================
create function clara.reap_exhausted_render_jobs() returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_reaped int; v_reaped_runs uuid[];
begin
  -- SKIP LOCKED, like every other row access in this file: a worker inside fail_render_job on an
  -- exhausted row must not stall queue hygiene for every firm until its transaction ends.
  with exhausted as (
    select j.id from clara.render_jobs j
     where j.state = 'running' and j.lease_expires_at < now() and j.attempts >= j.max_attempts
     for update of j skip locked),
  reaped as (
    update clara.render_jobs t
       set state = 'failed', finished_at = now(),
           claimed_by = null, claimed_at = null, lease_expires_at = null,
           last_error = jsonb_build_object('reason', 'failed_at_cap_without_report',
             'attempts', t.attempts, 'max_attempts', t.max_attempts,
             'detail', 'every claim was lost before the worker could record an outcome -- the workers crashed, were killed, or never reached fail_render_job',
             -- THE REMEDY NAMES THE DOOR THAT EXISTS: enqueue_render_job refuses to resurrect a
             -- terminally failed request for this run and kind, so the audited successor door is
             -- the way back.
             'fix', 'inspect the render machine logs for the window this job was claimed in, then call clara.requeue_render_job(this job id, why) to mint a successor once the cause is fixed')
      from exhausted e
     where t.id = e.id
    returning t.id, t.report_run_id)
  -- The RUN IDS travel with the count: a log line saying "1 reaped" sends an operator hunting; one
  -- naming the run points them at the report that will not exist until they act.
  select count(*)::int, coalesce(array_agg(distinct r.report_run_id), '{}')
    into v_reaped, v_reaped_runs
    from reaped r;
  return jsonb_build_object('reaped', coalesce(v_reaped, 0),
    'reaped_run_ids', to_jsonb(coalesce(v_reaped_runs, '{}'::uuid[])));
end $$;
revoke all on function clara.reap_exhausted_render_jobs() from public;

-- =====================================================================================
-- Z7 -- THE LEADER'S DISPATCH READ. DUE ARITHMETIC IS DB-OWNED (the reconciler-fa.mjs law):
-- the runtime asks whether anything is due and is TOLD which jobs; it never re-derives it.
--
-- THE ATTEMPT IS STAMPED HERE, BEFORE the Fly call, so a failing dispatch backs off for the
-- cooldown instead of re-firing every ~2s; the cost is one cooldown of delay, which is the
-- DELAYED-not-STRANDED direction A33 arm (ii) requires. A job under a LIVE lease is not due (a
-- worker is on it); an EXPIRED lease is due again, for the reason Z5 lets it be reclaimed.
-- =====================================================================================
create function clara.render_dispatch_begin(p_cooldown interval default interval '10 minutes',
                                            p_max int default 5) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ids uuid[]; v_due int; v_oldest timestamptz; v_wait bigint;
begin
  with due as (
    select j.id from clara.render_jobs j
     where (j.state = 'claimable' or (j.state = 'running' and j.lease_expires_at < now()))
       -- DEFENCE IN DEPTH (round-4): a job at its attempt cap is not dispatchable, because no
       -- worker can claim it -- the claim requires attempts < max_attempts. Without this term the
       -- sweep proposes it and a paid machine boots, finds nothing claimable and exits. The reap
       -- normally takes such a row first; this makes the due-read correct on its own.
       and j.attempts < j.max_attempts
       and (j.last_dispatch_at is null
            or j.last_dispatch_at < now() - coalesce(p_cooldown, interval '10 minutes'))
     order by j.enqueued_at, j.id
     limit greatest(1, least(coalesce(p_max, 5), 100))
     for update of j skip locked),
  stamped as (
    update clara.render_jobs j
       set dispatch_attempts = j.dispatch_attempts + 1, last_dispatch_at = now(),
           last_dispatch_ok = null
      from due where j.id = due.id
    returning j.id, j.enqueued_at)
  select coalesce(array_agg(s.id order by s.enqueued_at, s.id), '{}'), count(*)::int,
         min(s.enqueued_at)
    into v_ids, v_due, v_oldest
    from stamped s;
  v_wait := case when v_oldest is null then null
                 else (extract(epoch from (now() - v_oldest)))::bigint end;
  -- The reap is NOT part of this answer any more (round-4): it is clara.reap_exhausted_render_jobs,
  -- called by the belt above its unwired early-return, so hygiene runs on deployments that never
  -- dispatch at all.
  return jsonb_build_object(
    'due', coalesce(v_due, 0), 'job_ids', to_jsonb(v_ids),
    'oldest_enqueued_at', v_oldest, 'oldest_wait_seconds', v_wait);
end $$;
revoke all on function clara.render_dispatch_begin(interval, int) from public;

-- =====================================================================================
-- Z8 -- THE DISPATCH RECEIPT. What the leader actually OBSERVED when it tried to start a
-- machine. A failure is recorded on the row rather than logged and forgotten, because "no render
-- appeared" and "we could not start the renderer" are different facts, and the second one is the
-- actionable one.
-- =====================================================================================
create function clara.render_dispatch_record(p_job_ids uuid[], p_ok boolean, p_detail jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_asked int;
begin
  if p_ok is null then
    raise exception 'a dispatch receipt states whether the start succeeded' using errcode = 'CLR43',
      detail = '{"reason":"render_dispatch_outcome_required"}';
  end if;
  v_asked := coalesce(array_length(coalesce(p_job_ids, '{}'::uuid[]), 1), 0);
  -- TERMINAL ROWS ARE SKIPPED, NOT WRITTEN (round-2 major). The receipt is written AFTER the Fly
  -- round trip, and a job in that batch can legitimately turn `done` or `failed` inside the window.
  -- File 1's terminal wall refuses ANY change to a terminal row, so one such row made this
  -- statement raise CLR08 and roll back the WHOLE batch -- four healthy jobs lost "we could not
  -- start the renderer" because a fifth had finished. The wall is right; the write yields.
  -- `skipped` is returned rather than swallowed, so a caller sees the difference between "recorded
  -- for all of them" and "recorded for the ones still open".
  update clara.render_jobs j
     set last_dispatch_ok = p_ok,
         last_dispatch_error = case when p_ok then null else coalesce(p_detail, '{}'::jsonb) end
   where j.id = any (coalesce(p_job_ids, '{}'::uuid[]))
     and j.state not in ('done', 'failed');
  get diagnostics v_n = row_count;
  return jsonb_build_object('recorded', v_n, 'skipped', greatest(v_asked - v_n, 0), 'ok', p_ok);
end $$;
revoke all on function clara.render_dispatch_record(uuid[], boolean, jsonb) from public;

reset role;

grant execute on function
  clara.claim_render_job(text, interval),
  clara.render_job_payload(uuid, text),
  clara.fail_render_job(uuid, text, jsonb),
  clara.render_dispatch_begin(interval, int),
  clara.render_dispatch_record(uuid[], boolean, jsonb),
  clara.reap_exhausted_render_jobs()
  to clara_runtime;

-- THE HUMAN DOORS ARE FILE 5's. The replay door and the requeue door are granted to
-- clara_authenticated and live in 0083 with their own census — this file's surface is the machine
-- lane and nothing else, which is what lets the census below say "clara_runtime, and no one".

-- THE CENSUS RUNS IN TWO BLOCKS ON PURPOSE. The wiki dynamic-SQL gate (0019 §9) reads a `do` block
-- that calls pg_get_functiondef as a change-of-record patch site and treats every literal in it as
-- text the block installs, so an ACL census's 'EXECUTE' literal beside a live-body read is not
-- statically distinguishable from an injected statement. Neither block runs dynamic SQL at all.
do $grants$
declare
  -- render_job_payload IS ON THIS ROSTER NOW, AND ITS ABSENCE WAS A REAL DEFECT: created, revoked
  -- from public, never GRANTED -- the first real render would have died on "permission denied", and
  -- the battery missed it by reading the queue directly. A roster cannot report what is absent.
  v_runtime text[] := array['claim_render_job', 'render_job_payload', 'enqueue_missing_render_jobs',
    'fail_render_job', 'render_dispatch_begin', 'render_dispatch_record',
    'reap_exhausted_render_jobs'];
  v_granted text[]; v_leak int;
begin
  -- (1) The runtime verbs named in the array above are granted to clara_runtime -- the set, read
  -- from live ACLs. Counted from the roster rather than spelled in prose, so adding one cannot
  -- leave a comment claiming a number the array no longer has.
  select coalesce(array_agg(distinct p.proname order by p.proname), '{}') into v_granted
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and rr.rolname = 'clara_runtime' and p.proname = any (v_runtime);
  if not (v_granted @> v_runtime and v_runtime @> v_granted) then
    raise exception 'zeta claim tail: clara_runtime EXECUTE set is %, expected %',
      v_granted, v_runtime using errcode = 'CLR10';
  end if;
  -- (2) And to NOBODY else -- EXCLUDING, not enumerating (codex M5), with PUBLIC VISIBLE (round-2).
  -- This census used to name the seven roles it knew about, so any role NOT on that list could hold
  -- EXECUTE and the tail would still pass. An allow-list of two -- the owner, whose entry is
  -- ownership not a grant, and clara_runtime -- refuses the rest. And it LEFT joins pg_roles:
  -- aclexplode reports a PUBLIC grant with grantee = 0, matching no pg_roles row, so an inner join
  -- dropped the one grant that would matter most while this tail printed "and no one".
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname = any (v_runtime)
     and coalesce(rr.rolname, 'PUBLIC') not in ('clara_runtime', 'clara_fn_owner');
  if v_leak <> 0 then
    raise exception 'zeta claim tail: % EXECUTE grant(s) on a render verb to a role that must not hold one',
      v_leak using errcode = 'CLR10';
  end if;
  raise notice 'zeta claim grants OK: the runtime verbs on this file''s roster (claim, payload, fail, dispatch begin+record, the enqueue fallback and the reap) are granted to clara_runtime and to NO other role -- asserted by EXCLUDING the owner and clara_runtime rather than by naming the roles I happened to think of, and by a census that can SEE a PUBLIC grant, so neither a future role nor world-executable can hold EXECUTE unnoticed. The two human doors are file 5''s and are censused there.';
end $grants$;

do $tail$
declare v_skip int;
begin
  -- THE CLAIM REALLY IS A SKIP-LOCKED CLAIM, the sweep really skips locked rows, AND SO DOES THE
  -- REAP -- asked of the LIVE bodies, not asserted from the file. A claim that silently lost
  -- `skip locked` would serialise every worker behind one row lock and A33 arm (i) would still
  -- pass: one job is still claimed once. The reap joined this census when it became its own verb
  -- (round 4/5): it takes row locks on the leader's cycle exactly as the other two do, so leaving
  -- it out would have been the census covering the parts written first rather than the property.
  select count(*) into v_skip from pg_proc
   where (oid = 'clara.claim_render_job(text,interval)'::regprocedure
          and pg_get_functiondef(oid) ilike '%for update skip locked%')
      or (oid = 'clara.render_dispatch_begin(interval,int)'::regprocedure
          and pg_get_functiondef(oid) ilike '%skip locked%')
      or (oid = 'clara.reap_exhausted_render_jobs()'::regprocedure
          and pg_get_functiondef(oid) ilike '%skip locked%');
  if v_skip <> 3 then
    raise exception 'zeta claim tail: only % of the 3 live bodies still skip locked rows', v_skip
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _zeta_claim_pre where k = 'deploy_principal') then
    raise exception 'zeta claim tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta claim OK: the claim refuses a job at its attempt cap, the DUE READ refuses it too (a job nobody can claim must not start a paid machine), and clara.reap_exhausted_render_jobs parks it `failed` IMMEDIATELY once its lease is dead -- no grace, because a graced at-cap row is neither claimable nor completable and the delay only bought late terminal signals. A slow-but-healthy worker is protected by its own fence (clara.render_lease_alive) instead, which stops it BEFORE it spends money rather than pretending its row is still alive. The claim takes the oldest claimable-or-expired job FOR UPDATE SKIP LOCKED while the dispatch sweep and the reap skip locked rows -- all THREE read from the live function bodies rather than asserted from this file -- and the claim records the observed wait on the JOB row. Dispatch stamps its attempt BEFORE the start call so a failing dispatch backs off on its cooldown instead of storming; the outcome is recorded per job, so "could not start the renderer" is a readable fact rather than a silence.';
end $tail$;
