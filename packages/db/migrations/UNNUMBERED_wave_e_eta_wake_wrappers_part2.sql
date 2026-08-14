-- UNNUMBERED_wave_e_eta_wake_wrappers_part2.sql -- Wave E lane eta (E-c), the GRANTED half.
-- Number is claimed at merge, immediately after part 1's.
--
-- ORDERING OBLIGATION, BINDING AND MECHANICAL. This file applies ONLY after
-- UNNUMBERED_wave_e_eta_wake_wrappers.sql, which creates the three ungranted cores every wrapper
-- below delegates to. The prestate probes all three by exact regprocedure form and REFUSES rather
-- than proceeding on a wrong premise, so a wrong merge order fails loudly at apply instead of
-- silently shipping wrappers that call nothing.
--
-- WHY THE SPLIT, AND WHERE THE SEAM IS. The repo's 500-line ceiling is a hard block on files an
-- agent writes, and the ratified answer (set by the delta lane, re-used by the RS guard) is to split
-- one logical change across SEVERAL sequential migration FILES -- never to split a migration's
-- TRANSACTION semantics, and never to keep shaving the rationale db-migrations.md requires. The cut
-- here is deliberately NOT "objects in one file, census in the other": the seam runs between the
-- UNGRANTED MACHINERY (part 1: the cores that do the writing) and the GRANTED SURFACE (this file:
-- the wrappers, the EXECUTE grants, the allowlist rows, and the census that proves all three). The
-- grant and the proof of the grant therefore stay in ONE transaction, which is the atomicity that
-- actually matters here.
--
-- THE RESIDUE, NAMED RATHER THAN GLOSSED. Two files are two transactions, so between them the three
-- cores exist while nothing is granted and no allowlist row is present. That window is FAIL-SAFE by
-- construction rather than by luck: a core with no EXECUTE grant and no allowlist row is reachable
-- by no application role at all, so a database that stops between the halves has strictly less
-- surface than one that never applied either half -- the absence of part 2 is the absence of the
-- feature, never a half-open door. The second residue is smaller and worth stating too: part 1's
-- `_eta_pre` temp table is ON COMMIT DROP, so it cannot carry the delta-census baseline across the
-- boundary. This file re-measures that baseline itself rather than inheriting a number it cannot
-- see, which is the honest shape anyway -- a census that measures is evidence, one that is handed
-- a figure is not.
--
-- The timeout is precautionary; every statement here is a bounded catalog write.
set local statement_timeout = '5min';

create temp table _eta_part2_pre(k text primary key, v text not null) on commit drop;
insert into _eta_part2_pre values ('deploy_user', current_user), ('deploy_role', current_role);

do $pre$
declare n text; v_writers int;
begin
  -- PART 1 MUST BE PRESENT. Probed in the exact regprocedure form, not by name: a renumbered or
  -- re-signatured core is as absent as a missing one for a wrapper that has to call it.
  foreach n in array array[
    'clara._eta_compose_metric_preview_core(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)',
    'clara._eta_save_metric_definition_draft_core(uuid,uuid,uuid,text,uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara._eta_request_report_preview_core(uuid,uuid,uuid,text,uuid,text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'eta part2 prestate: part 1 core absent: % -- apply UNNUMBERED_wave_e_eta_wake_wrappers.sql first', n using errcode = 'CLR10';
    end if;
  end loop;
  -- The epsilon core this file's report-spec wrapper delegates to, and the wake plumbing.
  foreach n in array array[
    'clara._draft_report_spec_core(uuid,uuid,uuid,text,uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)',
    'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara.agent_user_id()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'eta part2 prestate: required upstream function absent: %', n using errcode = 'CLR10';
    end if;
  end loop;
  -- Partial birth: no wrapper this file creates may already exist.
  foreach n in array array[
    'clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text)',
    'clara.wake_save_metric_definition_draft(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara.wake_draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)',
    'clara.wake_request_report_preview(uuid,text)'
  ] loop
    if to_regprocedure(n) is not null then
      raise exception 'eta part2 partial birth: % already exists', n using errcode = 'CLR10';
    end if;
  end loop;
  if exists(select 1 from clara.wake_fn_allowlist where function_name like 'wake\_%metric%' escape '\'
      or function_name like 'wake\_%report%' escape '\') then
    raise exception 'eta part2 partial birth: an eta allowlist row already exists' using errcode = 'CLR10';
  end if;
  -- The delta census baseline, re-measured here (part 1's temp table did not survive the commit).
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M';
  if v_writers <> 4 then
    raise exception 'eta part2 prestate: delta app-executable definition writers %, expected 4', v_writers using errcode = 'CLR10';
  end if;
  insert into _eta_part2_pre values ('definition_writers', v_writers::text);
end $pre$;

set role clara_fn_owner;

-- ---------------------------------------------------------------------------------------------
-- THE GRANTED WRAPPERS. The 0004:617-628 shape exactly: resolve the wake credential, refuse
-- without one, assert the per-kind allowlist row, then delegate to the ungranted core. No wrapper
-- body carries DML text against any delta or epsilon table -- which is what keeps delta's
-- four-app-executable-definition-writer census at four by construction (see part 1's header).
-- ---------------------------------------------------------------------------------------------
create function clara.wake_compose_metric_preview(p_client uuid, p_ast jsonb, p_period_ids uuid[],
    p_snapshot_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_compose_metric_preview');
  return clara._eta_compose_metric_preview_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of,
    w.wake_kind, p_client, p_ast, p_period_ids, p_snapshot_id, p_op_key);
end $$;

create function clara.wake_save_metric_definition_draft(p_client uuid, p_key text, p_title text,
    p_unit text, p_temporality text, p_result_scale smallint, p_ast jsonb, p_allow_negative boolean,
    p_applies_from date, p_applies_to date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_save_metric_definition_draft');
  return clara._eta_save_metric_definition_draft_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of,
    w.wake_kind, p_client, p_key, p_title, p_unit, p_temporality, p_result_scale, p_ast,
    p_allow_negative, p_applies_from, p_applies_to, p_op_key);
end $$;

-- THE DUAL-LANE CALL, CORRECTED. The first cut delegated to clara.draft_report_spec -- the HUMAN verb,
-- which reads request.jwt.claims through clara._human_ctx; a wake credential carries clara.wake_secret
-- instead, so it raised CLR04 for every wake caller and could never have executed. Epsilon's notes are
-- honoured below: op key never null, wake kind + OBO passed through so an agent-drafted spec stays
-- audit-distinguishable, and the wake floor is the credential plus the kind-scoped allowlist assertion
-- (the core deliberately carries none).
--
-- p_effective_from IS AN EXPLICIT PARAMETER AND HAS NO DEFAULT, which is the whole point of it.
-- Epsilon's own CI caught a forbidden-clock defect here: the core derived this date from
-- current_date, and the estate-wide x42 clock law refused it. A wake wrapper that "helpfully"
-- defaulted to today would reintroduce exactly that defect one layer up, with the added harm that
-- the AGENT would be the one silently choosing when a report spec takes effect. So it is surfaced
-- all the way out to the chat toolface: the model supplies it from the user's ask or from the bound
-- reporting period, and a blank is refused here exactly as a blank op key is. This is the same
-- doctrine as the metric preview's required snapshot id -- the agent never picks an authoritative
-- input -- and epsilon puts the date inside the op-key request hash, so a different date is a
-- DISTINCT operation rather than a replay of the last one.
create function clara.wake_draft_report_spec(p_client uuid, p_spec_key text, p_title text,
    p_report_template_version_id uuid, p_locale text, p_parameters jsonb, p_overrides jsonb,
    p_layout_ast jsonb, p_effective_from date, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_draft_report_spec');
  perform 1 from clara.clients where id = p_client and firm_id = w.firm_id;
  if not found then raise exception 'client not found in your firm' using errcode = 'CLR11'; end if;
  -- Never optional. The caller's key is DETERMINISTIC (task + tool + canonical input), which is what
  -- makes a replayed WDK step reuse the reservation instead of drafting a second spec; minting one
  -- here would defeat that, so a blank key is refused rather than invented.
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake report-spec draft needs its idempotency key' using errcode = 'CLR10', detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if p_effective_from is null then raise exception 'a wake report-spec draft must state the date it takes effect' using errcode = 'CLR10', detail = '{"reason":"invalid_request","class":"effective_from","constraint":"nonnull","fix":"supply the effective date from the request or the bound reporting period; this lane never defaults it to today"}'; end if;
  return clara._draft_report_spec_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind,
    p_client, p_spec_key, p_title, p_report_template_version_id, p_locale, p_parameters, p_overrides,
    p_layout_ast, p_effective_from, p_op_key);
end $$;

create function clara.wake_request_report_preview(p_spec_draft_id uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_request_report_preview');
  return clara._eta_request_report_preview_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of,
    w.wake_kind, p_spec_draft_id, p_op_key);
end $$;

reset role;

-- ---------------------------------------------------------------------------------------------
-- THE GRANT MATRIX AND THE ALLOWLIST BELT. EXECUTE to clara_wake_interactive and nothing else; an
-- allowlist row for 'interactive' and never 'proactive'. clara_agent_ro gains no EXECUTE on
-- anything, here or anywhere in E-b/E-c (design part2 section 11).
-- ---------------------------------------------------------------------------------------------
revoke all on function clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text), clara.wake_save_metric_definition_draft(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text), clara.wake_draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text), clara.wake_request_report_preview(uuid,text) from public;
grant execute on function
  clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text),
  clara.wake_save_metric_definition_draft(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text),
  clara.wake_draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text),
  clara.wake_request_report_preview(uuid,text)
  to clara_wake_interactive;
insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('interactive', 'wake_compose_metric_preview'),
  ('interactive', 'wake_save_metric_definition_draft'),
  ('interactive', 'wake_draft_report_spec'),
  ('interactive', 'wake_request_report_preview')
on conflict do nothing;

do $tail$
declare v_role text; n int; v_writers int; v_sig text;
  v_wrappers text[] := array[
    'clara.wake_compose_metric_preview(uuid,jsonb,uuid[],uuid,text)',
    'clara.wake_save_metric_definition_draft(uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara.wake_draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,date,text)',
    'clara.wake_request_report_preview(uuid,text)'];
  v_cores text[] := array[
    'clara._eta_compose_metric_preview_core(uuid,uuid,uuid,text,uuid,jsonb,uuid[],uuid,text)',
    'clara._eta_save_metric_definition_draft_core(uuid,uuid,uuid,text,uuid,text,text,text,text,smallint,jsonb,boolean,date,date,text)',
    'clara._eta_request_report_preview_core(uuid,uuid,uuid,text,uuid,text)'];
begin
  if current_user <> (select v from _eta_part2_pre where k = 'deploy_user')
     or current_role <> (select v from _eta_part2_pre where k = 'deploy_role') then
    raise exception 'eta part2 tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode = 'CLR10';
  end if;
  -- Every wrapper: definer, pinned search_path, EXECUTE to clara_wake_interactive ONLY, no PUBLIC.
  foreach v_sig in array v_wrappers loop
    if not exists(select 1 from pg_proc f where f.oid = v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']) then
      raise exception 'eta part2 tail: wrapper posture wrong for %', v_sig using errcode = 'CLR10';
    end if;
    if not has_function_privilege('clara_wake_interactive', v_sig, 'execute') then
      raise exception 'eta part2 tail: clara_wake_interactive lacks EXECUTE on %', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime','clara_runtime_login','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'eta part2 tail: % executes %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
    if exists(select 1 from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        where f.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'eta part2 tail: PUBLIC executes %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  -- Every core, part 1's included: still reachable by NO application role after this file's grants.
  foreach v_sig in array v_cores loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime','clara_runtime_login','clara_wake_interactive','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'eta part2 tail: % executes the ungranted core %', v_role, v_sig using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  select count(*) into n from clara.wake_fn_allowlist
   where function_name in ('wake_compose_metric_preview','wake_save_metric_definition_draft',
     'wake_draft_report_spec','wake_request_report_preview');
  if n <> 4 or exists(select 1 from clara.wake_fn_allowlist
      where wake_kind <> 'interactive' and function_name in ('wake_compose_metric_preview',
        'wake_save_metric_definition_draft','wake_draft_report_spec','wake_request_report_preview')) then
    raise exception 'eta part2 tail: allowlist rows %, expected 4 and interactive-only', n using errcode = 'CLR10';
  end if;
  -- The delta census must be exactly where THIS file's prestate found it. A granted eta wrapper
  -- carrying definition DML would show up here as a fifth writer.
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.(metric_definitions|metric_definition_versions)\M';
  if v_writers <> (select v::int from _eta_part2_pre where k = 'definition_writers') then
    raise exception 'eta part2 tail: app-executable definition writers moved from % to %',
      (select v from _eta_part2_pre where k = 'definition_writers'), v_writers using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.metric_cells where inputs ->> 'schema' = 'clara.metric-composition-inputs/v1') <> 0 then
    raise exception 'eta part2 tail: the migration seeded a composition cell, expected 0' using errcode = 'CLR10';
  end if;
  raise notice 'eta part2 OK: 4 wake wrappers, interactive-only EXECUTE and interactive-only allowlist rows; part 1''s 3 cores still reachable by no application role incl. both non-inheriting login shells; agent_ro gains nothing; delta definition-writer census unmoved at %; the report-preview chain refuses report_preview_deferred until the OBO evaluator core lands; zero cells seeded.', v_writers;
end $tail$;
