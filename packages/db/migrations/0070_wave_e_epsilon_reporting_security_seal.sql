-- 0070_wave_e_epsilon_reporting_security_seal.sql -- Wave E lane epsilon, file 6 of 8.
--
-- Applies after 0069_wave_e_epsilon_reporting_security.sql and before
-- 0071_wave_e_epsilon_reporting_security_seal_artifacts.sql. Number claims at MERGE; the
-- timeout is PRECAUTIONARY.
--
-- THE RUN, THE CLAIM ASSESSMENT AND THE DATASET SEAL (SS7 + SS8 stages 3-4):
--   S1  clara._report_dataset_payload_v1 / clara.verify_report_dataset + the reconstruct
--       constraint trigger -- a dataset header that does not reconstruct from its own points
--       cannot commit.
--   S2  clara.open_report_run          -- bookkeeper+; mints the run whose id IS delta's run_id.
--   S3  clara.assess_report_claim      -- the four ruled states, ONE immutable row per run.
--   S4  clara.seal_report_dataset      -- validates the charts, persists the typed dataset
--       BEFORE any render can exist, and calls assess_report_claim INSIDE the same transaction.
--
-- THE POINT DOES NOT RE-DERIVE A NUMBER. Each dataset point carries the evaluator's OWN
-- displayed_text plus the cell's exact rational verbatim in `dimensions`. Re-computing a
-- presentation value here would be a SECOND rounding policy beside delta's, which is exactly how
-- two renderers of one truth drift. The typed value columns the design names are kept for a
-- later typed producer; the v1 producer uses value_text and states so.

set local statement_timeout = '5min';   -- PRECAUTIONARY.

create temp table _epsilon_seal_pre(k text primary key, v text not null) on commit drop;
insert into _epsilon_seal_pre values ('deploy_principal', session_user);

do $pre$
begin
  if to_regprocedure('clara.draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)') is null then
    raise exception 'epsilon seal requires clara.draft_report_spec (file 5 not applied)' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.assess_report_claim(uuid,text)') is not null then
    raise exception 'epsilon seal partial birth: clara.assess_report_claim already exists' using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- THE DATASET RECONSTRUCTION WALL. One recipe, shared by the sealer and the verifier so
-- they cannot drift (0057's _snapshot_dataset idiom). A point appended after the seal breaks
-- both the hash and the count, and the constraint trigger refuses the commit.
-- =====================================================================================
create function clara._report_dataset_payload_v1(p_dataset uuid) returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object('schema', 'clara.report-dataset/v1',
    'points', coalesce((select jsonb_agg(jsonb_build_object(
        'ordinal', ordinal, 'series_key', series_key, 'metric_version_id', metric_version_id,
        'cell_id', cell_id, 'point_status', point_status, 'value_cents', value_cents,
        'value_numeric', value_numeric, 'value_date', value_date, 'value_text', value_text,
        'dimensions', dimensions) order by ordinal)
      from clara.report_dataset_points where dataset_id = p_dataset), '[]'::jsonb),
    -- The resolved thresholds are INSIDE the digest, so freezing the points but leaving the
    -- thresholds editable is not a state this dataset can reach.
    'resolved_thresholds', (select resolved_thresholds from clara.report_datasets where id = p_dataset))
$$;
revoke all on function clara._report_dataset_payload_v1(uuid) from public;

-- =====================================================================================
-- THE POINT-PROVENANCE WALL. `cell_id` alone binds a point to a cell of the right firm and
-- client -- it does NOT bind the cell to this dataset's run, snapshot, evaluator or declared
-- definition. Everything the sealing body selects satisfies those by construction, but "the
-- current body selects correctly" is a claim about a body, not a property of the table: a later
-- body, or any internal writer reaching the table under clara_fn_owner, could seal a
-- reconstructible digest over false provenance. This trigger re-derives the four bindings from
-- the cell itself and refuses the row, so the invariant belongs to the TABLE.
--
-- A composite FK would be the stronger form, but the columns it would need are not unique on
-- delta's metric_cells and adding an index to a delta-owned table from this lane is not this
-- lane's to do -- so the ruled alternative (trigger re-derivation) is what ships.
-- =====================================================================================
create function clara._tf_report_dataset_point_provenance() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare d record; mc record; v_snapshot uuid; v_axis text := null; v_cell text; v_dataset text;
begin
  select report_run_id, books_snapshot_id, evaluator_version_id into d
    from clara.report_datasets where id = new.dataset_id;
  if not found then
    raise exception 'a dataset point names no dataset' using errcode = 'CLR10',
      detail = '{"reason":"dataset_point_provenance_mismatch","axis":"dataset","fix":"insert the dataset header first"}';
  end if;
  select run_id, evaluator_version_id, definition_version_id, evaluation_context_id into mc
    from clara.metric_cells where id = new.cell_id;
  if not found then
    raise exception 'a dataset point names no cell' using errcode = 'CLR10',
      detail = '{"reason":"dataset_point_provenance_mismatch","axis":"cell","fix":"point at an evaluated cell"}';
  end if;
  select snapshot_id into v_snapshot from clara.metric_evaluation_contexts where id = mc.evaluation_context_id;
  if mc.run_id is distinct from d.report_run_id then
    v_axis := 'run_id'; v_cell := mc.run_id::text; v_dataset := d.report_run_id::text;
  elsif v_snapshot is distinct from d.books_snapshot_id then
    v_axis := 'books_snapshot_id'; v_cell := v_snapshot::text; v_dataset := d.books_snapshot_id::text;
  elsif mc.evaluator_version_id is distinct from d.evaluator_version_id then
    v_axis := 'evaluator_version_id'; v_cell := mc.evaluator_version_id::text; v_dataset := d.evaluator_version_id::text;
  elsif mc.definition_version_id is distinct from new.metric_version_id then
    v_axis := 'metric_version_id'; v_cell := mc.definition_version_id::text; v_dataset := new.metric_version_id::text;
  end if;
  if v_axis is not null then
    raise exception 'a dataset point''s cell does not belong to this dataset (%)', v_axis using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'dataset_point_provenance_mismatch', 'axis', v_axis,
        'cell_value', v_cell, 'dataset_value', v_dataset, 'cell_id', new.cell_id,
        'fix', 'a dataset carries only cells of its own run, snapshot, evaluator version and declared definition')::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_report_dataset_point_provenance() from public;
create trigger t_report_dataset_point_provenance before insert on clara.report_dataset_points
  for each row execute function clara._tf_report_dataset_point_provenance();

-- =====================================================================================
-- B5 -- RESOLVE A CHART'S THRESHOLDS ONCE, AT SEAL, AS OF THE RUN'S PERIOD END. The spec names a
-- threshold by constant key or by definition version; WHICH version of that constant applied and
-- WHAT its value was are facts about the period being reported, resolved here and frozen into the
-- dataset digest. p_as_of is the run's period end -- an accounting fact -- never the session
-- clock (the x42 forbidden-clock family).
--
-- No invented precedence: if more than one visible version of a constant is effective on that
-- date, this REFUSES as ambiguous rather than picking one. A silent winner is a number nobody
-- chose.
-- =====================================================================================
create function clara._resolve_chart_thresholds_v1(p_firm uuid, p_spec jsonb, p_as_of date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare x jsonb; v_out jsonb := '[]'::jsonb; k record; mv record; v_n int;
begin
  for x in select value from jsonb_array_elements(coalesce(p_spec->'thresholds', '[]'::jsonb)) loop
    if x->>'source' = 'metric_constant' then
      select count(*) into v_n from clara.metric_constants
       where constant_key = x->>'constant_key' and (firm_id is null or firm_id = p_firm)
         and effective_from <= p_as_of and (effective_to is null or effective_to >= p_as_of);
      if v_n <> 1 then
        raise exception 'chart threshold constant % resolves to % effective version(s) at %',
          x->>'constant_key', v_n, p_as_of using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'threshold_constant_unresolvable',
            'constant_key', x->>'constant_key', 'as_of', p_as_of, 'effective_versions', v_n,
            'fix', 'a threshold constant must have exactly one version effective on the run''s period end')::text;
      end if;
      select * into k from clara.metric_constants
       where constant_key = x->>'constant_key' and (firm_id is null or firm_id = p_firm)
         and effective_from <= p_as_of and (effective_to is null or effective_to >= p_as_of);
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'threshold_key', x->>'threshold_key', 'source', 'metric_constant',
        'constant_key', k.constant_key, 'constant_id', k.id, 'constant_version', k.version,
        'numerator', k.numerator, 'denominator', k.denominator,
        'currency_power', k.currency_power, 'days_power', k.days_power, 'count_power', k.count_power,
        'effective_from', k.effective_from, 'effective_to', k.effective_to, 'as_of', p_as_of));
    else
      select mdv.id, mdv.formula_sha256, mdv.unit_key, mdv.state, mdv.applies_from, mdv.applies_to
        into mv from clara.metric_definition_versions mdv
       where mdv.id = (x->>'definition_version_id')::uuid;
      if not found then
        raise exception 'chart threshold definition version is absent' using errcode = 'CLR11',
          detail = '{"reason":"threshold_version_unresolvable","fix":"reference a definition version this firm can see"}';
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'threshold_key', x->>'threshold_key', 'source', 'metric_version',
        'definition_version_id', mv.id, 'formula_sha256', encode(mv.formula_sha256, 'hex'),
        'unit_key', mv.unit_key, 'state', mv.state,
        'applies_from', mv.applies_from, 'applies_to', mv.applies_to, 'as_of', p_as_of));
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function clara._resolve_chart_thresholds_v1(uuid, jsonb, date) from public;

create function clara.verify_report_dataset(p_dataset uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare d record; h bytea; n int;
begin
  select * into d from clara.report_datasets where id = p_dataset;
  if not found then
    raise exception 'report dataset is absent' using errcode = 'CLR11',
      detail = '{"reason":"report_dataset_absent"}';
  end if;
  h := clara._hash(clara._report_dataset_payload_v1(p_dataset));
  select count(*) into n from clara.report_dataset_points where dataset_id = p_dataset;
  if h is distinct from d.dataset_sha256 or n <> d.point_count then
    raise exception 'report dataset does not reconstruct from its persisted points' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'dataset_reconstruction_mismatch', 'dataset_id', p_dataset,
        'stored_point_count', d.point_count, 'actual_point_count', n)::text;
  end if;
  return jsonb_build_object('ok', true, 'dataset_id', p_dataset, 'point_count', n,
    'dataset_sha256', encode(h, 'hex'));
end $$;
revoke all on function clara.verify_report_dataset(uuid) from public;

create function clara._tf_report_dataset_reconstruct() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare d uuid;
begin
  if tg_relid = 'clara.report_datasets'::regclass then d := new.id;
  elsif tg_relid = 'clara.report_dataset_points'::regclass then d := new.dataset_id;
  else
    raise exception 'report dataset reconstruction guard invocation is not registered' using errcode = 'CLR10';
  end if;
  perform clara.verify_report_dataset(d);
  return new;
end $$;
revoke all on function clara._tf_report_dataset_reconstruct() from public;
create constraint trigger t_report_dataset_reconstruct after insert or update on clara.report_datasets
  deferrable initially immediate for each row execute function clara._tf_report_dataset_reconstruct();
create constraint trigger t_report_dataset_point_reconstruct after insert or update on clara.report_dataset_points
  deferrable initially immediate for each row execute function clara._tf_report_dataset_reconstruct();

-- =====================================================================================
-- S2 -- OPEN A REPORT RUN (bookkeeper+, key 1). Builder choice: the design names report_runs but
-- no verb for them. The run must exist BEFORE delta's evaluator is called, because the run's id
-- IS the p_run_id the evaluator binds its cells to -- so the run row is minted first and its id
-- is returned as the evaluator run id, rather than a caller inventing one and hoping.
-- =====================================================================================
create function clara.open_report_run(
    p_client uuid, p_report_spec_version_id uuid, p_books_snapshot_id uuid,
    p_reporting_period_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; sv record; p record; v_id uuid; prior jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select * into sv from clara.report_spec_versions
   where id = p_report_spec_version_id and firm_id = c.firm and client_id = p_client and state = 'published';
  if not found then
    raise exception 'report spec version is not a published version for this client' using errcode = 'CLR11',
      detail = '{"reason":"report_spec_version_not_in_firm","fix":"open the run against a published spec version of this client"}';
  end if;
  if not exists (select 1 from clara.metric_input_snapshots
                  where id = p_books_snapshot_id and firm_id = c.firm and client_id = p_client) then
    raise exception 'books snapshot is not this client''s' using errcode = 'CLR11',
      detail = '{"reason":"books_snapshot_not_in_firm","fix":"pin a metric input snapshot minted for this client"}';
  end if;
  -- POSITIVE READ: the presented period must be one the pinned snapshot actually captured.
  -- Reading it off reporting_periods alone would only prove the period exists, not that the
  -- snapshot saw it.
  select sp.period_id, sp.period_start, sp.period_end into p
    from clara.metric_input_snapshot_periods sp
   where sp.snapshot_id = p_books_snapshot_id and sp.firm_id = c.firm and sp.client_id = p_client
     and sp.period_id = p_reporting_period_id;
  if not found then
    raise exception 'the presented period is not in the pinned snapshot' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'period_not_in_snapshot', 'period_id', p_reporting_period_id,
        'snapshot_id', p_books_snapshot_id,
        'fix', 'mint the snapshot over the period the pack presents')::text;
  end if;
  prior := clara._reserve_op(c.firm, 'open_report_run', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'spec', p_report_spec_version_id,
      'snapshot', p_books_snapshot_id, 'period', p_reporting_period_id)));
  if prior is not null then return prior; end if;

  insert into clara.report_runs(firm_id, client_id, report_spec_version_id, books_snapshot_id,
      reporting_period_id, period_start, period_end, state, requested_by)
    values (c.firm, p_client, p_report_spec_version_id, p_books_snapshot_id, p.period_id,
      p.period_start, p.period_end, 'drafting', c.actor) returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'open_report_run', null,
    jsonb_build_object('report_run_id', v_id, 'client', p_client, 'snapshot', p_books_snapshot_id));
  return clara._finish_op(c.firm, 'open_report_run', p_op_key,
    jsonb_build_object('report_run_id', v_id, 'evaluator_run_id', v_id,
      'period_start', p.period_start, 'period_end', p.period_end, 'state', 'drafting'));
end $$;
revoke all on function clara.open_report_run(uuid, uuid, uuid, uuid, text) from public;

-- =====================================================================================
-- S3 -- ASSESS THE CLAIM. The four states are ruled (E-R14); this body decides WHICH, and the
-- decision reads DATA -- the profile's required sections and its slots' wording verification
-- state -- rather than a list of statement names compiled into it.
--
--   not_applicable : the bound template cannot claim compliance at all (matrix C5's BEE pack).
--   failed         : a required slot of the bound profile has no VERIFIED wording. Today that
--                    is every statutory pack, because owner task #43 has not landed wording. A
--                    profile in that state renders nothing rather than emitting a blank heading
--                    that reads as a real one.
--   stripped       : the pack departs from the prescribed STRUCTURE -- the layout omits a
--                    required section (matrix D6's custom cut). It SEALS and renders with the
--                    claim removed.
--   eligible       : every required section is laid out.
--
-- TWO AXES, DELIBERATELY SEPARATE. Status is PRESENTATION CONFORMANCE. `uncertified` is FORMULA
-- PROVENANCE: any contributing cell whose definition is not canonical/firm_approved -- a draft,
-- or no definition at all -- sets it, and the seal turns that into a pre_sign refusal while the
-- renderer turns it into a watermark. Letting a cell-definition problem drive `stripped` was a
-- hole, because stripped SEALS.
-- =====================================================================================
create function clara.assess_report_claim(p_report_run_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; r record; sv record; tv record; existing record; prior jsonb;
  v_cells int; v_draft int; v_nonstat int; v_eval uuid; v_evals int;
  v_missing text[]; v_unverified text[]; v_status text; v_reasons text[] := '{}';
  v_policy uuid; v_id uuid; v_uncertified boolean;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  -- The run lookup precedes the reservation deliberately: its refusal is STABLE across retries
  -- (a run either is or is not in your firm), so it can never turn a replayable success into a
  -- refusal. Everything below this line CAN move, which is why the reservation comes first.
  select * into r from clara.report_runs where id = p_report_run_id and firm_id = c.firm;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11', detail = '{"reason":"report_run_not_in_firm"}';
  end if;
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'assess_report_claim requires an op key' using errcode = 'CLR10',
      detail = '{"reason":"op_key_required","fix":"supply an idempotency key; this verb writes"}';
  end if;
  prior := clara._reserve_op(c.firm, 'assess_report_claim', p_op_key,
    clara._hash(jsonb_build_object('run', r.id)));
  if prior is not null then return prior; end if;

  select * into sv from clara.report_spec_versions where id = r.report_spec_version_id;
  select * into tv from clara.report_template_versions where id = sv.report_template_version_id;

  -- array_agg(distinct ...)[1] rather than min(): PostgreSQL has no min(uuid) aggregate, and the
  -- count(distinct) beside it is what makes "exactly one" the assertion anyway.
  select count(*)::int,
         count(*) filter (where mdv.state = 'draft')::int,
         count(*) filter (where mc.definition_version_id is null
                             or mdv.state not in ('canonical', 'firm_approved'))::int,
         count(distinct mc.evaluator_version_id)::int,
         (array_agg(distinct mc.evaluator_version_id))[1]
    into v_cells, v_draft, v_nonstat, v_evals, v_eval
    from clara.metric_cells mc
    left join clara.metric_definition_versions mdv on mdv.id = mc.definition_version_id
   where mc.client_id = r.client_id and mc.run_id = r.id;
  if v_cells = 0 then
    raise exception 'this run has evaluated no cells' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'run_has_no_cells', 'report_run_id', r.id,
        'fix', 'evaluate the pack against this run id before assessing its claim')::text;
  end if;
  if v_evals <> 1 then
    raise exception 'this run''s cells span % evaluator versions', v_evals using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'evaluator_version_ambiguous', 'evaluator_versions', v_evals,
        'fix', 'evaluate a run under exactly one evaluator version')::text;
  end if;
  -- UNCERTIFIED IS THE FORMULA-PROVENANCE AXIS, covering the WHOLE unapproved population: a draft
  -- definition, and equally a cell with NO definition at all (SS11's ad-hoc composition). Counting
  -- only drafts let a composition-bearing pack reach pre_sign with merely the claim stripped,
  -- defeating SS11's "mechanically barred with no extra rule" and letting an attestation bind to
  -- it. (Traced by lane eta; ruled by the orchestrator.)
  v_uncertified := v_nonstat > 0;

  -- The claim LABEL comes from a versioned policy row for the pack's own locale. No fallback:
  -- borrowing another locale's label would be the product inventing wording in a language
  -- nobody verified (the owner-gate family this lane is careful about).
  select id into v_policy from clara.claim_policy_versions
   where policy_key = 'fs_claim_policy' and locale = sv.locale
     and effective_from <= r.period_start and (effective_to is null or effective_to >= r.period_start)
   order by version desc limit 1;
  if v_policy is null then
    raise exception 'no claim policy is effective for locale %', sv.locale using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'claim_policy_absent', 'locale', sv.locale,
        'fix', 'land a versioned claim-policy row for this locale before assessing packs in it')::text;
  end if;

  -- v_missing and v_unverified stay NULL on the no_claim branch, and the receipt records them as
  -- null rather than as []. The distinction is load-bearing: null says NOT MEASURED (this class
  -- has no claim to assess), [] would say MEASURED AND FOUND NONE. A reader of a seven-year-old
  -- receipt must be able to tell those apart.
  if tv.claim_capability = 'no_claim' then
    v_status := 'not_applicable';
    v_reasons := array['claim_capability_no_claim'];
  else
    -- Required slots whose wording is not VERIFIED for this locale and this period's beginning.
    select coalesce(array_agg(distinct s.wording_key order by s.wording_key), '{}') into v_unverified
      from clara.statutory_slots s
      join clara.statutory_profile_versions pv on pv.id = s.profile_version_id
     where s.profile_version_id = tv.statutory_profile_version_id and s.required
       and not exists (select 1 from clara.statutory_wording w
                        where w.profile_key = pv.profile_key and w.wording_key = s.wording_key
                          and w.locale = sv.locale and w.verification_state = 'verified'
                          and w.applies_to_periods_beginning_from <= r.period_start
                          and (w.applies_to_periods_beginning_to is null
                               or w.applies_to_periods_beginning_to >= r.period_start));
    select coalesce(array_agg(s.section_key order by s.ordinal), '{}') into v_missing
      from clara.statutory_sections s
     where s.profile_version_id = tv.statutory_profile_version_id and s.required
       and not (s.section_key = any (array(select value->>'section_key'
                                             from jsonb_array_elements(sv.layout_ast->'sections'))));
    -- STATUS IS THE PRESENTATION-CONFORMANCE AXIS, and NOTHING ELSE drives it: `stripped` means
    -- the pack departs from the prescribed STRUCTURE (matrix D6's custom cut). Conflating the two
    -- let an unapproved formula masquerade as a custom cut, which SEALS.
    if coalesce(array_length(v_unverified, 1), 0) > 0 then
      v_status := 'failed'; v_reasons := array['required_wording_unverified'];
    elsif coalesce(array_length(v_missing, 1), 0) > 0 then
      v_status := 'stripped'; v_reasons := array['layout_omits_required_section'];
    else
      v_status := 'eligible'; v_reasons := array['presentation_profile_checks_passed'];
    end if;
  end if;

  insert into clara.report_claim_assessments(firm_id, client_id, report_run_id, status, uncertified,
      reason_codes, check_receipt, claim_policy_version_id, evaluator_version_id, assessed_by)
    values (c.firm, r.client_id, r.id, v_status, v_uncertified, to_jsonb(v_reasons),
      jsonb_build_object('contributing_cells', v_cells, 'draft_definition_cells', v_draft,
        'non_statutory_cells', v_nonstat,
        -- reason_codes explains the STATUS; this explains the independent uncertified axis, so a
        -- seven-year-old receipt says which of the two a refusal came from.
        'uncertified_reason_codes', case when v_nonstat = 0 then '[]'::jsonb
          when v_draft > 0 then '["draft_definition_in_dataset"]'::jsonb
          else '["nonstat_definition_in_dataset"]'::jsonb end,
        'missing_required_sections', to_jsonb(v_missing),
        'unverified_required_wording_keys', to_jsonb(v_unverified),
        'report_class', tv.report_class, 'claim_capability', tv.claim_capability,
        'locale', sv.locale, 'period_start', r.period_start),
      v_policy, v_eval, c.actor)
    -- ONE IMMUTABLE ROW PER RUN, made idempotent rather than racy: two callers that both saw no
    -- row would previously both insert, and the loser surfaced a raw 23505. The conflict target
    -- is the run's own unique index, so the loser falls through to the read below.
    on conflict (report_run_id) do nothing
    returning id into v_id;
  if v_id is null then
    select * into existing from clara.report_claim_assessments where report_run_id = r.id;
    if not found then
      -- The conflicting row belongs to a transaction this snapshot cannot see. Neither inserting
      -- nor reading is possible, and inventing a verdict is the one thing that must not happen --
      -- so exit as a serialization failure and let the caller retry (delta's F3 shape).
      raise exception 'claim assessment raced an invisible concurrent writer'
        using errcode = '40001',
          detail = jsonb_build_object('reason', 'claim_assessment_race', 'report_run_id', r.id,
            'fix', 'retry the assessment; a concurrent transaction is minting the same row')::text;
    end if;
    return clara._finish_op(c.firm, 'assess_report_claim', p_op_key,
      jsonb_build_object('claim_assessment_id', existing.id, 'status', existing.status,
        'uncertified', existing.uncertified, 'reason_codes', existing.reason_codes,
        'check_receipt', existing.check_receipt, 'replayed', true));
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'assess_report_claim', null,
    jsonb_build_object('report_run_id', r.id, 'claim_assessment_id', v_id, 'status', v_status,
      'uncertified', v_uncertified));
  return clara._finish_op(c.firm, 'assess_report_claim', p_op_key,
    jsonb_build_object('claim_assessment_id', v_id, 'status', v_status,
      'uncertified', v_uncertified, 'reason_codes', to_jsonb(v_reasons),
      'label', (select status_labels->>v_status from clara.claim_policy_versions where id = v_policy),
      'replayed', false));
end $$;
revoke all on function clara.assess_report_claim(uuid, text) from public;

-- =====================================================================================
-- S4 -- SEAL THE DATASET. Stage 3 (the evaluator ran against the PINNED snapshot -- verified
-- here as a positive read of every contributing cell's evaluation context) and stage 4 (the
-- typed dataset is PERSISTED). assess_report_claim runs INSIDE this transaction and BEFORE any
-- render job could be enqueued, which is what SS7's enforcement point means.
-- =====================================================================================
create function clara.seal_report_dataset(
    p_report_run_id uuid, p_chart_template_version_ids uuid[], p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; r record; prior jsonb; v_unpinned int; v_eval uuid; v_evals int; v_cells int;
  v_ds uuid; v_n int; cv record; v_assessment jsonb; v_ids uuid[] := '{}';
  v_chart uuid; v_starved text[];
  -- The all-zero digest is a PLACEHOLDER, never a value: the header must exist before its
  -- points can reference it, and the stamp two statements later replaces it. The reconstruct
  -- constraint trigger fires at COMMIT and would refuse a header still carrying it.
  zero bytea := '\x0000000000000000000000000000000000000000000000000000000000000000'::bytea;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select * into r from clara.report_runs where id = p_report_run_id and firm_id = c.firm;
  if not found then
    raise exception 'report run not found' using errcode = 'CLR11', detail = '{"reason":"report_run_not_in_firm"}';
  end if;
  -- RESERVE BEFORE THE STATE CHECK. A failed call rolls back its own reservation, so putting the
  -- reservation first costs nothing on the failure path. It is the SUCCESS-then-lost-response path
  -- that matters: the run is now 'dataset_sealed', and a same-key retry that reached the state
  -- check first would refuse with report_run_state_illegal instead of replaying its receipt --
  -- turning a completed act into an apparent failure the caller would be right to retry forever.
  prior := clara._reserve_op(c.firm, 'seal_report_dataset', p_op_key,
    clara._hash(jsonb_build_object('run', r.id,
      'charts', coalesce(p_chart_template_version_ids, '{}'::uuid[]))));
  if prior is not null then return prior; end if;

  if r.state <> 'drafting' then
    raise exception 'this run''s dataset is already sealed' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'report_run_state_illegal', 'state', r.state,
        'fix', 'seal a dataset once, while the run is drafting')::text;
  end if;

  -- THE SAME RUN LOCK THE EVALUATOR TAKES (0059's key, verbatim). This body reads the run's cells
  -- and then freezes them into a digest; an evaluation landing a cell between the read and the
  -- freeze would seal a dataset that is missing one. That was survivable before -- the artifact
  -- seal's population check refuses on the difference -- but "survivable" there means the run is
  -- permanently unsealable through no fault of the operator, a trap the artifact fix would
  -- otherwise have created. Excluding the writer here is cheaper than explaining the trap.
  perform pg_advisory_xact_lock(hashtextextended(c.firm::text || ':' || r.id::text, 0));

  -- THE PIN, verified rather than assumed: every contributing cell's evaluation context must
  -- name the run's own books snapshot. A cell evaluated against some other snapshot would make
  -- the sealed dataset a mixture nobody could reproduce.
  select count(*)::int into v_unpinned
    from clara.metric_cells mc
    join clara.metric_evaluation_contexts ec on ec.id = mc.evaluation_context_id
   where mc.client_id = r.client_id and mc.run_id = r.id and ec.snapshot_id <> r.books_snapshot_id;
  if v_unpinned > 0 then
    raise exception '% contributing cell(s) were evaluated against another snapshot', v_unpinned
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'snapshot_not_pinned', 'unpinned_cells', v_unpinned,
          'books_snapshot_id', r.books_snapshot_id,
          'fix', 'evaluate every cell of a run against the snapshot the run pinned')::text;
  end if;
  -- array_agg(distinct ...)[1] rather than min(): there is no min(uuid) aggregate.
  select count(*)::int, count(distinct evaluator_version_id)::int,
         (array_agg(distinct evaluator_version_id))[1]
    into v_cells, v_evals, v_eval
    from clara.metric_cells where client_id = r.client_id and run_id = r.id;
  if coalesce(v_cells, 0) = 0 then
    raise exception 'this run has evaluated no cells' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'run_has_no_cells', 'report_run_id', r.id,
        'fix', 'evaluate the pack against this run id before sealing its dataset')::text;
  end if;
  if coalesce(v_evals, 0) <> 1 then
    raise exception 'this run''s cells span % evaluator versions', coalesce(v_evals, 0) using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'evaluator_version_ambiguous', 'evaluator_versions', coalesce(v_evals, 0),
        'fix', 'evaluate a run under exactly one evaluator version')::text;
  end if;

  set constraints clara.t_report_dataset_reconstruct, clara.t_report_dataset_point_reconstruct deferred;

  -- THE FS DATASET: every cell of the run, once. series_key is the definition's own key, or an
  -- explicit ad-hoc marker for a composition (definition_version_id null -- SS11's composition,
  -- which is mechanically barred from a statutory pack by the assessment above).
  v_ds := gen_random_uuid();
  insert into clara.report_datasets(id, firm_id, client_id, report_run_id, chart_spec_version_id,
      books_snapshot_id, evaluator_version_id, dataset_sha256, point_count, sealed_by)
    values (v_ds, c.firm, r.client_id, r.id, null, r.books_snapshot_id, v_eval, zero, 0, c.actor);
  insert into clara.report_dataset_points(dataset_id, firm_id, client_id, ordinal, series_key,
      metric_version_id, cell_id, point_status, value_text, dimensions)
    select v_ds, c.firm, r.client_id, (row_number() over (order by q.series_key, q.id))::int - 1,
      q.series_key, q.definition_version_id, q.id, q.cell_status,
      case when q.cell_status = 'ok' then q.displayed_text end,
      -- na_label is delta's OWN display token for the reason a cell has no value, carried
      -- verbatim. Without it a non-ok point reaches the renderer with a status and nothing to
      -- print: value_text is null by construction for every cell that is not `ok`, so "absent"
      -- would render as blank space where an explanation belongs. It is null for an ok cell,
      -- which is the positive statement that this cell has a value rather than a reason.
      jsonb_build_object('unit_key', q.unit_key, 'displayed_scale', q.displayed_scale,
        'exact_numerator', q.exact_numerator, 'exact_denominator', q.exact_denominator,
        'na_label', q.na_label, 'books_watermark', q.books_watermark)
    from (select mc.*, coalesce(md.definition_key, 'adhoc:' || encode(mc.formula_sha256, 'hex')) as series_key,
                 nr.display_token as na_label
            from clara.metric_cells mc
            left join clara.metric_definition_versions mdv on mdv.id = mc.definition_version_id
            left join clara.metric_definitions md on md.id = mdv.definition_id
            left join clara.metric_na_reason_versions nr on nr.id = mc.na_reason_version_id
           where mc.client_id = r.client_id and mc.run_id = r.id) q;
  select count(*)::int into v_n from clara.report_dataset_points where dataset_id = v_ds;
  update clara.report_datasets
     set dataset_sha256 = clara._hash(clara._report_dataset_payload_v1(v_ds)), point_count = v_n
   where id = v_ds;
  v_ids := v_ids || v_ds;

  -- ONE DATASET PER BOUND CHART. Stages 1 and 2 run AGAIN here, because a spec published months
  -- ago is not evidence about today's catalog; then every series resolves to CELLS of this run
  -- by definition version, and a series that resolved to none is named in the refusal.
  foreach v_chart in array coalesce(p_chart_template_version_ids, '{}'::uuid[]) loop
    select * into cv from clara.chart_template_versions where id = v_chart and firm_id = c.firm;
    if not found then
      raise exception 'chart template version is not this firm''s' using errcode = 'CLR11',
        detail = '{"reason":"chart_template_version_not_in_firm"}';
    end if;
    perform clara._validate_chart_spec_semantics_v1(c.firm, cv.chart_spec_ast);
    v_ds := gen_random_uuid();
    insert into clara.report_datasets(id, firm_id, client_id, report_run_id, chart_spec_version_id,
        books_snapshot_id, evaluator_version_id, dataset_sha256, point_count, sealed_by,
        resolved_thresholds)
      values (v_ds, c.firm, r.client_id, r.id, cv.id, r.books_snapshot_id, v_eval, zero, 0, c.actor,
        clara._resolve_chart_thresholds_v1(c.firm, cv.chart_spec_ast, r.period_end));
    insert into clara.report_dataset_points(dataset_id, firm_id, client_id, ordinal, series_key,
        metric_version_id, cell_id, point_status, value_text, dimensions)
      select v_ds, c.firm, r.client_id, (row_number() over (order by s.series_key, mc.id))::int - 1,
        s.series_key, mc.definition_version_id, mc.id, mc.cell_status,
        case when mc.cell_status = 'ok' then mc.displayed_text end,
        jsonb_build_object('unit_key', mc.unit_key, 'displayed_scale', mc.displayed_scale,
          'exact_numerator', mc.exact_numerator, 'exact_denominator', mc.exact_denominator,
          'na_label', nr.display_token, 'axis_policy', cv.axis_policy)
      from (select x->>'series_key' as series_key, (x->>'definition_version_id')::uuid as dvid
              from jsonb_array_elements(cv.chart_spec_ast->'series') x) s
      join clara.metric_cells mc on mc.client_id = r.client_id and mc.run_id = r.id
        and mc.definition_version_id = s.dvid
      left join clara.metric_na_reason_versions nr on nr.id = mc.na_reason_version_id;
    -- A POSITIVE READ of what actually landed: a series with zero points is a chart the run
    -- cannot plot, and an empty series is not a chart with a gap -- it is a missing evaluation.
    select coalesce(array_agg(s.series_key order by s.series_key), '{}') into v_starved
      from (select x->>'series_key' as series_key from jsonb_array_elements(cv.chart_spec_ast->'series') x) s
     where not exists (select 1 from clara.report_dataset_points p
                        where p.dataset_id = v_ds and p.series_key = s.series_key);
    if coalesce(array_length(v_starved, 1), 0) > 0 then
      raise exception 'chart series % have no evaluated cell in this run', v_starved using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'chart_series_has_no_cell', 'series_keys', v_starved,
          'chart_template_version_id', cv.id,
          'fix', 'evaluate every plotted definition against this run before sealing its dataset')::text;
    end if;
    select count(*)::int into v_n from clara.report_dataset_points where dataset_id = v_ds;
    update clara.report_datasets
       set dataset_sha256 = clara._hash(clara._report_dataset_payload_v1(v_ds)), point_count = v_n
     where id = v_ds;
    v_ids := v_ids || v_ds;
  end loop;

  -- SS7's enforcement point: the assessment is written in the SAME transaction that seals the
  -- dataset, and before anything could enqueue a render.
  v_assessment := clara.assess_report_claim(r.id, p_op_key || ':assess');
  update clara.report_runs set state = 'dataset_sealed' where id = r.id;
  set constraints clara.t_report_dataset_reconstruct, clara.t_report_dataset_point_reconstruct immediate;
  -- Redundant with the trigger that just fired, and deliberately so: the receipt below claims
  -- every dataset reconstructs, and a claim in a receipt is worth what a read backs it with.
  foreach v_chart in array v_ids loop perform clara.verify_report_dataset(v_chart); end loop;
  perform clara._audit(c.firm, c.actor, null, null, 'seal_report_dataset', null,
    jsonb_build_object('report_run_id', r.id, 'dataset_ids', to_jsonb(v_ids),
      'claim_status', v_assessment->>'status'));
  return clara._finish_op(c.firm, 'seal_report_dataset', p_op_key,
    jsonb_build_object('report_run_id', r.id, 'dataset_ids', to_jsonb(v_ids),
      'fs_dataset_id', v_ids[1], 'evaluator_version_id', v_eval, 'claim_assessment', v_assessment,
      'state', 'dataset_sealed'));
end $$;
revoke all on function clara.seal_report_dataset(uuid, uuid[], text) from public;

reset role;

grant execute on function
  clara.open_report_run(uuid, uuid, uuid, uuid, text),
  clara.assess_report_claim(uuid,text),
  clara.seal_report_dataset(uuid, uuid[], text)
  to clara_authenticated;

do $tail$
declare v_fns int; v_wrong int; v_triggers int; v_granted text;
begin
  select count(*) into v_fns from pg_proc p where p.pronamespace = 'clara'::regnamespace
   and p.proname = any (array['_report_dataset_payload_v1', 'verify_report_dataset',
     '_tf_report_dataset_reconstruct', '_tf_report_dataset_point_provenance',
     '_resolve_chart_thresholds_v1', 'open_report_run', 'assess_report_claim', 'seal_report_dataset']);
  if v_fns <> 8 then
    raise exception 'epsilon seal tail: % of 8 functions exist', v_fns using errcode = 'CLR10';
  end if;
  -- The provenance wall is a TRIGGER, so its existence is asserted where it lives, and ENABLED
  -- is asserted too: a disabled trigger is a catalog row that enforces nothing.
  select count(*) into v_triggers from pg_trigger
   where tgfoid = 'clara._tf_report_dataset_point_provenance()'::regprocedure and not tgisinternal
     and tgenabled = 'O';
  if v_triggers <> 1 then
    raise exception 'epsilon seal tail: % enabled point-provenance trigger(s), expected 1', v_triggers
      using errcode = 'CLR10';
  end if;
  select count(*) into v_triggers from pg_trigger
   where tgfoid = 'clara._tf_report_dataset_reconstruct()'::regprocedure and not tgisinternal
     and tgdeferrable and tgenabled = 'O';
  if v_triggers <> 2 then
    raise exception 'epsilon seal tail: % deferrable reconstruct trigger(s), expected 2', v_triggers
      using errcode = 'CLR10';
  end if;
  select count(*) into v_wrong from pg_proc p where p.pronamespace = 'clara'::regnamespace
   and p.proname = any (array['open_report_run', 'assess_report_claim', 'seal_report_dataset'])
   and (not p.prosecdef or p.proowner <> 'clara_fn_owner'::regrole
        or p.proconfig is distinct from array['search_path=clara, pg_temp']);
  if v_wrong <> 0 then
    raise exception 'epsilon seal tail: % verb(s) lack the definer/owner/pinned-path posture', v_wrong
      using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), '(none)') into v_granted
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, '{}')) a join pg_roles r on r.oid = a.grantee
   where p.pronamespace = 'clara'::regnamespace and a.privilege_type = 'EXECUTE'
     and p.proname = any (array['open_report_run', 'assess_report_claim', 'seal_report_dataset',
       '_report_dataset_payload_v1', 'verify_report_dataset', '_tf_report_dataset_reconstruct',
       '_tf_report_dataset_point_provenance', '_resolve_chart_thresholds_v1'])
     and r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner';
  if v_granted <> 'clara_authenticated' then
    raise exception 'epsilon seal tail: grantees are [%], expected exactly clara_authenticated', v_granted
      using errcode = 'CLR10';
  end if;
  if current_user <> (select v from _epsilon_seal_pre where k = 'deploy_principal') then
    raise exception 'epsilon seal tail: role was not reset (user %)', current_user using errcode = 'CLR10';
  end if;
  raise notice 'epsilon run + claim + dataset seal OK: the run pins its snapshot and its presented period is verified to be IN that snapshot; the dataset seal refuses cells evaluated against another snapshot, refuses a run spanning two evaluator versions, and refuses a chart series with no evaluated cell; the typed dataset is persisted with a reconstruct constraint trigger on BOTH the header and the points, so a point appended after the seal cannot commit; assess_report_claim writes ONE immutable row per run inside that same transaction, decides from the profile''s own required sections and wording verification state, refuses a locale with no effective claim policy rather than borrowing another locale''s label, and sets uncertified from any draft-definition cell. Grantees [%], clara_authenticated only.',
    v_granted;
end $tail$;
