-- UNNUMBERED_wave_e_zeta_render_jobs_part3.sql -- lane zeta, file 3 of 4 (CLAIM + DISPATCH).
--
--   Z5  clara.claim_render_job       -- the worker's claim (for update skip locked)
--   Z6  clara.fail_render_job        -- bounded retry, then a terminal failure with its reason
--   Z7  clara.render_dispatch_begin  -- the LEADER's due-read + attempt stamp (cooldown)
--   Z8  clara.render_dispatch_record -- the leader's outcome receipt for that attempt
--
-- These four ARE acceptance cell A33's instrument. Arm (i) reads the claim directly (two
-- concurrent callers, one job, exactly one non-null answer) rather than inferring it from an
-- artifact appearing later; arm (ii) reads a leaderless queue staying claimable with its wait
-- recorded; arm (iii) is closed in file 4, where a second completion of an already-sealed run
-- reconciles to ONE artifact by a positive re-read, never by assuming the write was a no-op.
--
-- Number claims at MERGE; the timeout is PRECAUTIONARY.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _zeta_claim_pre(k text primary key, v text not null) on commit drop;
insert into _zeta_claim_pre values ('deploy_principal', session_user);

-- =====================================================================================
-- PRESTATE. The column census here covers what Z5b (render_job_payload) reads, which file 2's
-- census does NOT: that one covers only the manifest builder's own reads.
--
-- WHY BOTH EXIST RATHER THAN ONE. Without this list, a rename in an upstream lane surfaces as a
-- bare SQL error at APPLY -- loud and fail-closed, but it names a column, not a remedy, and it
-- names it during a ceremony rather than at review. With it, the refusal says which lane's table
-- moved and that the fix is to re-read that table and update Z5b, never to relax the check.
-- Every name below was read from the on-disk DDL, not assumed.
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
    -- the verified wording, on the same window file 2 hashed
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
      where c.state = 'claimable'
         or (c.state = 'running' and c.lease_expires_at < now())
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
-- The render worker runs as clara_runtime, which holds SELECT on NONE of epsilon's tables (its
-- uniform hardening pass revokes every write and grants SELECT to clara_authenticated only). So
-- the worker cannot browse the reporting schema at all: it asks for the payload of a job IT
-- HOLDS, and the lease check is what scopes the read. A worker with no live lease reads nothing.
--
-- E-R8 FLOOR 1 IS ENFORCED IN THE SHAPE OF THIS PAYLOAD. Cell values leave as `displayed_text`
-- -- the string the DB already computed -- and never as a number the renderer could re-format.
-- The renderer therefore has nothing to round, no locale to apply and no thousands separator to
-- choose; "no model and no user can type a number into a report" extends to "and neither can
-- the typesetter".
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

  -- VERIFIED wording only, and the same window Z2 hashed. If these two ever disagreed, the
  -- manifest would pin text the render never saw.
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
  if j.state <> 'running'
     or j.claimed_by is distinct from nullif(btrim(coalesce(p_worker, '')), '') then
    raise exception 'this render job is not held by that worker' using errcode = 'CLR43',
      detail = jsonb_build_object('reason', 'render_lease_not_held', 'state', j.state,
        'claimed_by', j.claimed_by)::text;
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
-- Z7 -- THE LEADER'S DISPATCH READ. DUE ARITHMETIC IS DB-OWNED (the reconciler-fa.mjs law):
-- the runtime asks whether anything is due and is TOLD which jobs; it never re-derives it.
--
-- THE ATTEMPT IS STAMPED HERE, BEFORE the Fly call, and the cooldown is measured from the
-- attempt. A dispatch that fails therefore backs off for the cooldown instead of re-firing on
-- every ~2s leader cycle; the cost is that a failed start delays the render by one cooldown,
-- which is the DELAYED-not-STRANDED direction A33 arm (ii) requires.
--
-- A job held under a LIVE lease is not due: a worker is on it. An EXPIRED lease is due again,
-- for the same reason Z5 lets it be reclaimed.
-- =====================================================================================
create function clara.render_dispatch_begin(p_cooldown interval default interval '10 minutes',
                                            p_max int default 5) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ids uuid[]; v_due int; v_oldest timestamptz; v_wait bigint;
begin
  with due as (
    select j.id from clara.render_jobs j
     where (j.state = 'claimable' or (j.state = 'running' and j.lease_expires_at < now()))
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
  return jsonb_build_object('due', coalesce(v_due, 0), 'job_ids', to_jsonb(v_ids),
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
declare v_n int;
begin
  if p_ok is null then
    raise exception 'a dispatch receipt states whether the start succeeded' using errcode = 'CLR43',
      detail = '{"reason":"render_dispatch_outcome_required"}';
  end if;
  update clara.render_jobs
     set last_dispatch_ok = p_ok,
         last_dispatch_error = case when p_ok then null else coalesce(p_detail, '{}'::jsonb) end
   where id = any (coalesce(p_job_ids, '{}'::uuid[]));
  get diagnostics v_n = row_count;
  return jsonb_build_object('recorded', v_n, 'ok', p_ok);
end $$;
revoke all on function clara.render_dispatch_record(uuid[], boolean, jsonb) from public;

reset role;

grant execute on function
  clara.claim_render_job(text, interval),
  clara.fail_render_job(uuid, text, jsonb),
  clara.render_dispatch_begin(interval, int),
  clara.render_dispatch_record(uuid[], boolean, jsonb)
  to clara_runtime;

do $tail$
declare
  v_runtime text[] := array['claim_render_job', 'enqueue_missing_render_jobs', 'fail_render_job',
    'render_dispatch_begin', 'render_dispatch_record'];
  v_granted text[]; v_leak int; v_skip int;
begin
  -- (1) The five runtime verbs are granted to clara_runtime -- the set, read from live ACLs.
  select coalesce(array_agg(distinct p.proname order by p.proname), '{}') into v_granted
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl
    join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and rr.rolname = 'clara_runtime' and p.proname = any (v_runtime);
  if not (v_granted @> v_runtime and v_runtime @> v_granted) then
    raise exception 'zeta claim tail: clara_runtime EXECUTE set is %, expected %',
      v_granted, v_runtime using errcode = 'CLR10';
  end if;
  -- (2) And to NOBODY else. clara_runtime_login is named explicitly: it is inherit-false and
  -- SETs ROLE, so a grant to the LOGIN shell would be a second, unaudited path to the queue.
  select count(*) into v_leak from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, '{}')) acl join pg_roles rr on rr.oid = acl.grantee
   where p.pronamespace = 'clara'::regnamespace and acl.privilege_type = 'EXECUTE'
     and p.proname = any (v_runtime)
     and rr.rolname = any (array['clara_authenticated', 'clara_agent_ro', 'clara_wake_interactive',
       'clara_wake_proactive', 'clara_runtime_login', 'clara_agent_read_login',
       'clara_wake_write_login']);
  if v_leak <> 0 then
    raise exception 'zeta claim tail: % EXECUTE grant(s) on a render verb to a role that must not hold one',
      v_leak using errcode = 'CLR10';
  end if;
  -- (3) The claim really is a skip-locked claim -- asked of the LIVE function body, not asserted
  -- from the file. A claim that silently lost `skip locked` would serialise every worker behind
  -- one row lock and A33 arm (i) would still pass, because one job would still be claimed once.
  select count(*) into v_skip from pg_proc
   where oid = 'clara.claim_render_job(text,interval)'::regprocedure
     and pg_get_functiondef(oid) ilike '%for update skip locked%';
  if v_skip <> 1 then
    raise exception 'zeta claim tail: claim_render_job no longer claims with FOR UPDATE SKIP LOCKED'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_skip from pg_proc
   where oid = 'clara.render_dispatch_begin(interval,int)'::regprocedure
     and pg_get_functiondef(oid) ilike '%skip locked%';
  if v_skip <> 1 then
    raise exception 'zeta claim tail: render_dispatch_begin no longer skips locked rows'
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _zeta_claim_pre where k = 'deploy_principal') then
    raise exception 'zeta claim tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'zeta claim OK: five runtime verbs, clara_runtime their ONLY grantee (the three login shells named and excluded). The claim takes the oldest claimable-or-expired job FOR UPDATE SKIP LOCKED -- verified against the live function body, not asserted -- and records the observed wait on the JOB row. Dispatch stamps its attempt BEFORE the start call so a failing dispatch backs off on its cooldown instead of storming; the outcome is recorded per job, so "could not start the renderer" is a readable fact rather than a silence.';
end $tail$;
