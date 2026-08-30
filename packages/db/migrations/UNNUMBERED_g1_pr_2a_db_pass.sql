-- =================================================================================================
-- G1 PR-2a — THE DB PASS: the wake engine's remaining DB-side walls (裁-44 / 裁-49 / 裁-40).
--
-- WHY THIS FILE EXISTS. #437 shipped G1's two wake bodies (bankAgent_v1 + closePrep_v1) and closed
-- twenty-five defects inside the RUNTIME. Its own closing commit recorded what the runtime could
-- not close from where it stands, and named this migration as the owner of each:
--   · "the write TOCTOU between the status read and the wrapper transaction (the DB-side half is
--      G1 PR-2, already a precondition of the flip)"                                      -> §F
--   · "a rostered all_writes_refused code"                                                -> §B
--   · FOLD-21's residual: "the latch is per-attempt by construction, and the monotonic
--      DB-side version is G1 PR-2's"                                                      -> §G
--   · the three PRODUCER contracts, "each found by a RED": the event payload must carry
--     bank_account_id; the event must be appended client-scoped; bank.agent_due must be
--     registered client_scoped=true                                                    -> §C, §F
-- 裁-49 adds the two metering questions (§A). The prose caps #437 could only apply in TypeScript
-- (FOLD-7) get their DB half here (§D).
--
-- WHAT IT DOES, in one line each:
--   §A  裁-49    ck_llm_usage_events_call_kind gains bank_agent + close_prep (extend-only);
--                wake_engine_sources.login_pool for close_prep is trued to the write pool.
--   §B  裁-44    agent_tasks_error_code_check gains all_writes_refused (extend-only).
--   §C  producer clara.event_types + clara.trigger_taxonomy gain bank.agent_due (client_scoped,
--                decision internal_task) -- the COUPLED PAIR, never half of it.
--   §D  裁-44    length CHECKs on every model-authored prose column #437 named, plus the
--                structured close-abandonment reason roster and its carrier column.
--   §E  F14      mint_wake_credential_for_task extended to bank_agent (the EXACT door), and
--                mint_wake_credential's own bank_agent arm now BINDS the live bank-SOURCE task.
--   §F  TOCTOU   clara._bank_wake_task_gate: every one of the fourteen bank wake verbs verifies,
--                inside its own write transaction and under FOR UPDATE, that its task is still
--                running (writes) and that the subject's bank account IS the task's account.
--   §G  CAS      clara._settle_wake_task_cas: the strict settle under FOR UPDATE. NULL is a real
--                expected run value and expected status is mandatory. The three-argument frozen
--                door delegates only to a private compatibility body while v1 runs drain.
--
-- WHAT IT DOES NOT DO, deliberately, each recorded in the tail as a named follow-up:
--   · It touches NO frozen runtime file (constraint 9). Three of its doors are additive and stay
--     unexercised until a runtime follow-up passes the new argument -- named in the tail census
--     and in the PR body, never left to be discovered.
--   · It flips NO switch. Both wake_engine_sources rows stay enabled=false: the flip is the
--     operator owner's own act at the G1 rollout ceremony (裁-40, amended by 裁-44 to four acts).
--   · It ships no clara.bank_agent_run_due and no close_prep task producer (F-A3's and F-A4's own
--     obligations); it ships no cadence column, because the design puts the cadence gate in
--     leader.mjs as a pure *Due(lastRunMs, nowMs) predicate, never a registry row (g1-wake-
--     engine-design.md §1.1, third bullet: "not something the engine can absorb into a registry
--     row"). Measured, not assumed: leader.mjs's six existing predicates all read an env-var
--     interval and no DB row at all.
--   · chatTurn.v14.bankSchemas' model-supplied times_seen stays P6's; _close_gate_bank_items
--     stays F-A3's; the reconciler helper fold stays the document lane's.
--
-- D1 INVENTORY (every writer body this file replaces; before/after prosrc sha256 in the tail):
--   fourteen bank wake wrappers (one added line each, RE-SUBSTITUTION-proven byte-identical
--   otherwise), clara.mint_wake_credential, clara.mint_wake_credential_for_task,
--   clara._close_wake_ctx (the close-lane transaction-local task wall), and
--   clara._settle_wake_task (recut IN PLACE at its exact signature, its whole body now delegates
--   to the private drain body). NO signature moves, NO ACL is re-made, NO existing trigger body is
--   recut, NO frozen workflow file is touched.
-- =================================================================================================

set local statement_timeout = '20min';   -- precautionary: the two CHECK re-adds validate whole
                                         -- tables (llm_usage_events, agent_tasks). Neither is
                                         -- large on any live estate today, and the tail reports
                                         -- the measured row counts rather than assuming.

-- =================================================================================================
-- §0 · PRESTATE — measure every claim this file makes about what it is editing, and ABORT rather
-- than proceed on a wrong premise (db-migrations rule). Pins are prosrc sha256 AND, where the file
-- reasons about the text, the text itself: a sha proves "unchanged", only the text proves "what".
-- =================================================================================================
create temp table g1_pr2a_pre (k text primary key, v text) on commit drop;
create temp table g1_pr2a_stash (sig text primary key, prosrc text not null, sha text not null) on commit drop;

do $prestate$
declare
  v_sig text; v_n int; v_txt text;
  -- The fourteen bank wake verbs, by EXACT signature (law 3: a bare name is a projection).
  v_bank_sigs text[] := array[
    'clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text)',
    'clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)',
    'clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text)',
    'clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)',
    'clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)',
    'clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,integer,text,jsonb,text,text)',
    'clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)',
    'clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)',
    'clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)',
    'clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)',
    'clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)',
    'clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)',
    'clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text)',
    'clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text)'];
  -- The bodies this file must NOT disturb. Re-pinned in the tail, byte-for-byte.
  v_keep_sigs text[] := array[
    'clara.wake_context()',
    'clara._wake_task_id()',
    'clara._wake_cred_full()',
    'clara._agent_wake_ctx(uuid,text,jsonb)',
    'clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamp with time zone)',
    'clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)',
    'clara._agent_abandon_close_core(jsonb,uuid,text,text,jsonb,text)',
    'clara._abandon_close_core(uuid,uuid,uuid,text,text)',
    'clara.abandon_close(uuid,text,text)',
    'clara._tf_agent_task_update()',
    'clara._tf_agent_task_insert()',
    'clara._tf_wakes_outbox_update()',
    'clara._tf_close_runs_lifecycle()',
    'clara.cancel_agent_task(uuid,text)',
    'clara.set_wake_source_enabled(text,boolean,text,text)',
    'clara.assert_wake_allowed(text,text)',
    'clara.close_prep_due()'];
begin
  -- 0.1 · every body this file replaces or re-pins must exist at EXACTLY ONE pg_proc row, and its
  -- prosrc is stashed so the tail can prove the delta by RE-SUBSTITUTION, not by a sha alone.
  foreach v_sig in array (v_bank_sigs || v_keep_sigs) loop
    if to_regprocedure(v_sig) is null then
      raise exception 'g1_pr2a prestate: % does not resolve -- this file reasons about a body that is not here', v_sig
        using errcode = 'CLR10';
    end if;
    insert into g1_pr2a_stash(sig, prosrc, sha)
      select v_sig, p.prosrc, encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex')
        from pg_proc p where p.oid = v_sig::regprocedure;
  end loop;

  -- 0.2 · the four bodies whose SIGNATURE or gate text this file changes, pinned at their live
  -- text (not merely their sha) because the file's own reasoning quotes them.
  select p.prosrc into v_txt from pg_proc p
    where p.oid = 'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  if v_txt is null or position('bank_agent wake requires a firm-congruent active client and no on_behalf_of' in v_txt) = 0 then
    raise exception 'g1_pr2a prestate: mint_wake_credential''s bank_agent arm is not at the text this file recuts'
      using errcode = 'CLR10';
  end if;
  if position('agent_task_id' in v_txt) > 0 then
    raise exception 'g1_pr2a prestate: mint_wake_credential ALREADY names agent_task_id -- the binding this file adds is already present'
      using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_stash(sig, prosrc, sha)
    values ('clara.mint_wake_credential(text,uuid,uuid,interval,uuid)', v_txt,
            encode(sha256(convert_to(v_txt, 'UTF8')), 'hex'));

  select p.prosrc into v_txt from pg_proc p
    where p.oid = 'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)'::regprocedure;
  if v_txt is null or position('p_wake_kind not in (''close_prep'')' in v_txt) = 0 then
    raise exception 'g1_pr2a prestate: mint_wake_credential_for_task''s kind gate is not the close_prep-only text this file widens'
      using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_stash(sig, prosrc, sha)
    values ('clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)', v_txt,
            encode(sha256(convert_to(v_txt, 'UTF8')), 'hex'));

  -- RUNG 0 FOR THE 0138 CLOSE GATE. It was STABLE and read no task row; this file deliberately
  -- makes it VOLATILE because the write path takes FOR UPDATE. Pin the exact old judgement body
  -- before replacing it, so the D1 notice is a before/after catalogue read rather than provenance
  -- inferred from a migration filename.
  select p.prosrc into v_txt from pg_proc p
    where p.oid = 'clara._close_wake_ctx(text,text,uuid,text)'::regprocedure;
  if v_txt is null or position('clara._close_expected_op_key' in v_txt) = 0
     or position('return jsonb_build_object' in v_txt) = 0
     or position('agent_tasks' in v_txt) > 0 then
    raise exception 'g1_pr2a prestate: _close_wake_ctx is not at 0138''s task-status-blind rung-0 body'
      using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_stash(sig, prosrc, sha)
    values ('clara._close_wake_ctx(text,text,uuid,text)', v_txt,
            encode(sha256(convert_to(v_txt, 'UTF8')), 'hex'));
  select count(*)::text into v_txt from pg_roles r
    where r.rolname like 'clara\_%'
      and has_function_privilege(r.rolname, 'clara._close_wake_ctx(text,text,uuid,text)'::regprocedure, 'EXECUTE');
  insert into g1_pr2a_pre(k, v) values ('close_ctx_acl_clara_role_count', v_txt);

  if to_regprocedure('clara._settle_wake_task(uuid,text,text)') is null then
    raise exception 'g1_pr2a prestate: clara._settle_wake_task(uuid,text,text) is absent -- G1 (0133) has not been applied'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
    where p.oid = 'clara._settle_wake_task(uuid,text,text)'::regprocedure;
  if position('kind in (select task_kind from clara.wake_engine_sources)' in v_txt) = 0 then
    raise exception 'g1_pr2a prestate: _settle_wake_task is not at 0133''s MUST-B registry-driven kind filter'
      using errcode = 'CLR10';
  end if;
  if position('for update' in lower(v_txt)) > 0 then
    raise exception 'g1_pr2a prestate: _settle_wake_task ALREADY takes a row lock -- the CAS this file adds is already present'
      using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_stash(sig, prosrc, sha)
    values ('clara._settle_wake_task(uuid,text,text)', v_txt,
            encode(sha256(convert_to(v_txt, 'UTF8')), 'hex'));
  -- Its ACL, so the tail can prove BOTH doors end on exactly the footing this one had.
  insert into g1_pr2a_pre(k, v) values ('settle_acl_runtime',
    has_function_privilege('clara_runtime', 'clara._settle_wake_task(uuid,text,text)'::regprocedure, 'EXECUTE')::text);
  select count(*)::text into v_txt from (select r.rolname from pg_roles r
      where r.rolname like 'clara\_%'
        and has_function_privilege(r.rolname, 'clara._settle_wake_task(uuid,text,text)'::regprocedure, 'EXECUTE')) x(rolname);
  insert into g1_pr2a_pre(k, v) values ('settle_acl_clara_role_count', v_txt);

  -- 0.3 · the objects this file CREATES must be absent under EVERY arity (law 3: absence by name
  -- alone would miss an overload).
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'clara'
                and p.proname in ('_bank_wake_task_gate', '_wake_task_bank_account',
                                  '_drafted_prose_within', '_settle_wake_task_cas',
                                  '_settle_wake_task_compat', '_tf_close_abandon_reason_lifecycle',
                                  '_tf_close_run_reason_active')) then
    raise exception 'g1_pr2a prestate: one of the seven new function names already exists at some arity'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.close_abandon_reasons') is not null then
    raise exception 'g1_pr2a prestate: clara.close_abandon_reasons already exists' using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_attribute
              where attrelid = 'clara.close_runs'::regclass and attname = 'end_reason_code' and not attisdropped) then
    raise exception 'g1_pr2a prestate: clara.close_runs.end_reason_code already exists' using errcode = 'CLR10';
  end if;

  -- 0.4 · §A/§B's two CHECKs, pinned at their PRE-EXTENSION text. Extend-only is a claim about
  -- both directions: the tail proves every listed member survived AND that exactly the named
  -- members were added, so this records what "every listed member" means.
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
    where c.conrelid = 'clara.llm_usage_events'::regclass and c.conname = 'ck_llm_usage_events_call_kind';
  if v_txt is null then
    raise exception 'g1_pr2a prestate: ck_llm_usage_events_call_kind is absent' using errcode = 'CLR10';
  end if;
  if position('''bank_agent''' in v_txt) > 0 or position('''close_prep''' in v_txt) > 0 then
    raise exception 'g1_pr2a prestate: ck_llm_usage_events_call_kind ALREADY admits a 裁-49 member' using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_pre(k, v) values ('call_kind_def', v_txt);

  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
    where c.conrelid = 'clara.agent_tasks'::regclass and c.conname = 'agent_tasks_error_code_check';
  if v_txt is null then
    raise exception 'g1_pr2a prestate: agent_tasks_error_code_check is absent' using errcode = 'CLR10';
  end if;
  if position('all_writes_refused' in v_txt) > 0 then
    raise exception 'g1_pr2a prestate: the error-code roster ALREADY carries all_writes_refused' using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_pre(k, v) values ('error_code_def', v_txt);

  -- 0.5 · §C's producer registration. event_types and trigger_taxonomy are a COUPLED PAIR
  -- (0154's own finding: registering in one alone is a half-registration the estate's coverage
  -- census refuses). Prove coverage is WHOLE before this file adds anything, so a red afterwards
  -- is provably ours.
  if to_regclass('clara.event_types') is null or to_regclass('clara.trigger_taxonomy') is null
     or to_regclass('clara.taxonomy_active') is null then
    raise exception 'g1_pr2a prestate: the event-type registry / taxonomy pair is absent' using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.taxonomy_active) <> 1 then
    raise exception 'g1_pr2a prestate: taxonomy_active does not name exactly one active version' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.event_types e
              where not exists (select 1 from clara.trigger_taxonomy t
                                 where t.event_type = e.name
                                   and t.version = (select version from clara.taxonomy_active))) then
    raise exception 'g1_pr2a prestate: event_type/taxonomy coverage is ALREADY incomplete before this file adds anything: %',
      (select string_agg(e.name, ', ' order by e.name) from clara.event_types e
        where not exists (select 1 from clara.trigger_taxonomy t
                           where t.event_type = e.name and t.version = (select version from clara.taxonomy_active)))
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.event_types where name = 'bank.agent_due') then
    raise exception 'g1_pr2a prestate: bank.agent_due is ALREADY registered' using errcode = 'CLR10';
  end if;
  insert into g1_pr2a_pre(k, v) values ('event_types_total', (select count(*)::text from clara.event_types));
  insert into g1_pr2a_pre(k, v) values ('taxonomy_total', (select count(*)::text from clara.trigger_taxonomy));
  insert into g1_pr2a_pre(k, v) values ('taxonomy_versions', (select count(*)::text from clara.taxonomy_versions));
  insert into g1_pr2a_pre(k, v) values ('taxonomy_active_version', (select version::text from clara.taxonomy_active));
  -- 'internal_task' is in the taxonomy's own CHECK and in relay.mjs's WAKE_BOUND_DECISIONS, but
  -- NO row uses it yet -- bank.agent_due is the estate's first. Recorded so the tail's +1 is
  -- readable as "the first internal_task", not as drift.
  insert into g1_pr2a_pre(k, v) values ('internal_task_rows_before',
    (select count(*)::text from clara.trigger_taxonomy where decision = 'internal_task'));

  -- 0.6 · §A's second half + 裁-40's standing precondition: BOTH registry rows exist and BOTH are
  -- disabled, and close_prep's login_pool is the value 裁-49 corrects.
  select count(*) into v_n from clara.wake_engine_sources;
  if v_n <> 2 then
    raise exception 'g1_pr2a prestate: wake_engine_sources carries % row(s), expected G1''s two', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_engine_sources where enabled) then
    raise exception 'g1_pr2a prestate: a wake_engine_sources row is ENABLED -- 裁-40 says the flip is the owner''s ceremony, and this file must not run against a live source'
      using errcode = 'CLR10';
  end if;
  select login_pool into v_txt from clara.wake_engine_sources where source_key = 'close_prep';
  if v_txt is distinct from 'runtime' then
    raise exception 'g1_pr2a prestate: close_prep.login_pool is %, expected the pre-裁-49 value ''runtime''', v_txt using errcode = 'CLR10';
  end if;
  select concat_ws('|', carrier, event_type, task_kind, wake_kind) into v_txt
    from clara.wake_engine_sources where source_key = 'bank_agent';
  if v_txt is distinct from 'wake_outbox|bank.agent_due|wake|bank_agent' then
    raise exception 'g1_pr2a prestate: bank_agent source identity is %, expected wake_outbox|bank.agent_due|wake|bank_agent -- §E/§F join the producing event to THIS row', v_txt using errcode = 'CLR10';
  end if;

  -- 0.7 · §D's prose columns, pinned at their pre-cap guards (each is non-blank-only today).
  foreach v_txt in array array['bank_agent_proposals_rationale_check',
                               'close_proposals_narrative_check',
                               'close_proposals_rationale_check',
                               'close_proposals_drafted_check'] loop
    if not exists (select 1 from pg_constraint where conname = v_txt) then
      raise exception 'g1_pr2a prestate: % is absent', v_txt using errcode = 'CLR10';
    end if;
    if exists (select 1 from pg_constraint where conname = v_txt and pg_get_constraintdef(oid) like '%length%') then
      raise exception 'g1_pr2a prestate: % ALREADY carries a length term', v_txt using errcode = 'CLR10';
    end if;
  end loop;
  if exists (select 1 from pg_constraint
              where conrelid = 'clara.close_runs'::regclass and contype = 'c'
                and pg_get_constraintdef(oid) like '%end_reason%') then
    raise exception 'g1_pr2a prestate: close_runs already CHECKs end_reason' using errcode = 'CLR10';
  end if;

  -- 0.8 · the counts this file must leave UNCHANGED (it writes no row of any of these).
  insert into g1_pr2a_pre(k, v) values ('held_wake_rows',
    (select count(*)::text from clara.agent_tasks where kind = 'wake' and status = 'held'));
  insert into g1_pr2a_pre(k, v) values ('agent_tasks_rows', (select count(*)::text from clara.agent_tasks));
  insert into g1_pr2a_pre(k, v) values ('llm_usage_rows', (select count(*)::text from clara.llm_usage_events));
  insert into g1_pr2a_pre(k, v) values ('close_runs_rows', (select count(*)::text from clara.close_runs));
  insert into g1_pr2a_pre(k, v) values ('wake_credentials_rows', (select count(*)::text from clara.wake_credentials));
  insert into g1_pr2a_pre(k, v) values ('allowlist_bank_rows',
    (select count(*)::text from clara.wake_fn_allowlist where wake_kind = 'bank_agent'));

  raise notice 'g1_pr2a prestate: clean -- 14 bank wrappers + 17 do-not-touch bodies stashed by prosrc; mint_wake_credential at its pre-binding text; mint_wake_credential_for_task close_prep-ONLY; _close_wake_ctx at 0138''s task-status-blind rung-0 body; _settle_wake_task at 0133''s MUST-B text with NO row lock; the 7 new function names and close_abandon_reasons/end_reason_code absent under every arity; call_kind + error_code CHECKs at their pre-extension text; event_type/taxonomy coverage WHOLE at version % over % type(s) with bank.agent_due absent and % internal_task row(s); wake_engine_sources = 2 rows, BOTH disabled, close_prep.login_pool=runtime, bank_agent source identity wake_outbox|bank.agent_due|wake|bank_agent; % held wake row(s).',
    (select v from g1_pr2a_pre where k = 'taxonomy_active_version'),
    (select v from g1_pr2a_pre where k = 'event_types_total'),
    (select v from g1_pr2a_pre where k = 'internal_task_rows_before'),
    (select v from g1_pr2a_pre where k = 'held_wake_rows');
end $prestate$;

-- EVERY object below is created, altered and granted AS clara_fn_owner, not as the deploy
-- principal (0154:743's idiom). This is not housekeeping: a SECURITY DEFINER function created by a
-- superuser deploy principal would RUN as that superuser, which is a privilege escalation dressed
-- as a helper, and a new table created outside the owner would sit outside its own FORCE-RLS owner
-- policy. The principal is restored before the tail so the tail's ACL census reads the same
-- catalogue a caller would.
set role clara_fn_owner;

-- =================================================================================================
-- §A · 裁-49 — the two metering questions, ruled together and ridden here.
--
-- (a) The call-kind roster. Both G1 lanes meter under 'unattended_posting' today, borrowing a
-- label minted for F-A2's own coder. The roster gains its own two members, EXTEND-ONLY: nothing is
-- removed, so every row already written under 'unattended_posting' stays lawful and no backfill is
-- owed. THE RUNTIME HALF IS A NAMED FOLLOW-UP, not silence: bankAgent.v1.usage.ts's
-- BANK_AGENT_CALL_KIND and closePrep.v1.usage.ts's CLOSE_PREP_CALL_KIND are FROZEN constants
-- (constraint 9) and still read 'unattended_posting'. Repointing them is a new frozen version's
-- work; this file makes the destination exist so that PR is a one-line change and not a migration.
--
-- THIS ROSTER IS NOT CLOSED, and saying so here is the point. 裁-49 rules on exactly TWO values and
-- this file adds exactly those two; 裁-44's `tax_prep` wake is a THIRD, and it rides F-T3 PR-9's
-- own migration, after this one. So the count below (eleven) is a MEASUREMENT of what this file
-- leaves behind, never a claim that the vocabulary is complete — and G1PR2A-A1 is written to match:
-- it requires all eleven to be present and admits `tax_prep` as the one named successor, so a
-- smuggled unknown twelfth still fails while PR-9 lands without truing a floor.
--
-- (b) close_prep's login pool. The registry row says 'runtime'; #437 built closePrep_v1 to run
-- under clara_wake_interactive on the WRITE floor (its own withWriteWakeScoped), so the row was
-- describing a pool the lane does not use. Trued to 'write' -- the value pools.mjs's getWritePool
-- serves. This column is engine CONFIGURATION read by wake-engine.mjs into its dispatch record; it
-- is not a grant and changes no authority, which is exactly why a wrong value here is dangerous:
-- it misleads a reader without failing anything.
-- =================================================================================================
alter table clara.llm_usage_events drop constraint ck_llm_usage_events_call_kind;
alter table clara.llm_usage_events add constraint ck_llm_usage_events_call_kind
  check (call_kind in ('document_extraction', 'chat', 'unattended_posting', 'freeform_read',
                       'interview_extraction', 'filing_attribution', 'web_fetch',
                       'tier1_policy_fetch', 'reporting',
                       'bank_agent', 'close_prep'));

update clara.wake_engine_sources set login_pool = 'write' where source_key = 'close_prep';

-- =================================================================================================
-- §B · 裁-44 R2's named residual — a rostered all_writes_refused error code.
--
-- FOLD-3 made a run whose every attempted write was REFUSED settle 'failed' instead of green, but
-- it had to borrow an existing code to say so. "Every write the database refused" and "the model
-- never called a tool" are different nights and a dead-letter triage reads error_code FIRST (S9's
-- whole point). This is the destination; the runtime half -- both lanes' classifiers choosing it --
-- is the named follow-up, for the same constraint-9 reason as §A(a).
-- EXTEND-ONLY: all six pre-existing members survive, proven member-by-member in the tail.
-- =================================================================================================
alter table clara.agent_tasks drop constraint agent_tasks_error_code_check;
alter table clara.agent_tasks add constraint agent_tasks_error_code_check
  check (error_code in ('model_error', 'tool_error', 'timeout', 'engine_lost', 'limit', 'internal',
                        'all_writes_refused'));

-- =================================================================================================
-- §C · THE PRODUCER PREREQUISITE — bank.agent_due, registered in BOTH halves of the coupled pair.
--
-- #437's third producer contract, found by a RED: "bank.agent_due must be registered
-- client_scoped=true (a firm-level type refuses a client_id outright, so it could never produce a
-- runnable task)". clara.domain_events.event_type is FK-bound to this append-only registry and
-- additionally gated by _tf_validate_domain_event, so without this row the producer cannot append
-- its event at all.
--
-- THE DECISION IS 'internal_task', and it is the estate's FIRST row at that value -- deliberately,
-- not by accident. relay.mjs's WAKE_BOUND_DECISIONS is {internal_task, notification,
-- background_review}: only those three mint a durable wake_intents row, which is what drain.mjs
-- then projects into a held agent_tasks(kind='wake') + wakes_outbox pair. 'notification' would work
-- mechanically and is WRONG in meaning -- it is the vocabulary for "a human should see this", and
-- a bank agent becoming due is Clara's own work, with nothing for a person to answer.
-- 'background_review' is the entry.post_refused shape (something went wrong, look at it later).
-- 'internal_task' is the one that says what this is.
--
-- client_scoped = true is not a style choice: the wake insert arm derives client_id from the EVENT
-- (_tf_agent_task_insert's wake branch reads de.client_id and DISCARDS anything set on the task),
-- so a firm-scoped type yields a clientless task, and mint_wake_credential's bank_agent arm
-- refuses a NULL client outright. #437 measured exactly that.
-- =================================================================================================
with inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
    values ('bank.agent_due', true,
            'The bank agent is due for a client''s account: the clocked producer''s event, whose payload MUST carry bank_account_id (G1 PR-2a §F derives the run''s account from it). Routed internal_task -> wake_intents -> a held agent_tasks(kind=wake).')
    on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, i.name, 'internal_task',
       'G1 (裁-40/裁-44): Clara''s own clocked work, never a human notification.'
  from inserted_types i cross join clara.taxonomy_active a;

-- =================================================================================================
-- §D · 裁-44 / FOLD-7's DB half — a cap on every model-authored prose column, and a STRUCTURED
-- roster for close abandonment.
--
-- FOLD-7 capped these in the TypeScript schemas at 4000 ("the DB's own number where one exists").
-- A schema cap is a request; a CHECK is a wall, and it is the wall that binds a second writer, a
-- replay, or a future lane. 4000 is not invented here: bank_agent_receipts.rationale already
-- carries `length(rationale) <= 4000` (0121), so this is the estate's own number applied to the
-- columns that were missed, never a new opinion. Each is a SEPARATE named constraint rather than a
-- widened existing one, so the pre-existing non-blank guards survive untouched and are provably
-- still enforced (a drop-and-re-add would have made "non-blank still holds" a claim rather than a
-- fact).
-- =================================================================================================
alter table clara.bank_agent_proposals
  add constraint ck_bap_rationale_len check (length(rationale) <= 4000);

-- The proposal PAYLOAD's two model-authored prose members, named in #437's deferred list.
-- 'reason' is _agent_propose_line_exception_core's p_reason (0121:5560); 'identifier_value' is
-- _agent_propose_bank_identifier_promotion_core's p_identifier_value (0121:5637). The cap on
-- identifier_value is 200, not 4000, and the asymmetry is the point: an identifier is a short
-- token (a bank account number, an SSM number, a TIN) and clara.client_identifiers guards only
-- non-blankness, so a 4000-character "identifier" is a category error long before it is a size
-- problem. Both terms are null-tolerant: a payload that does not carry the key at all is a
-- different proposal kind, not a violation.
alter table clara.bank_agent_proposals
  add constraint ck_bap_payload_prose_len check (
    (payload ->> 'reason' is null or length(payload ->> 'reason') <= 4000)
    and (payload ->> 'identifier_value' is null or length(payload ->> 'identifier_value') <= 200));

alter table clara.close_proposals
  add constraint ck_cp_narrative_len check (length(narrative) <= 4000);
alter table clara.close_proposals
  add constraint ck_cp_rationale_len check (length(rationale) <= 4000);

-- drafted[] is an ARRAY of {check_key, item_key, text} (0138's own core refuses any other shape at
-- rung B2, and close_proposals_drafted_check walls the typeof). Capping the per-element text needs
-- a per-element walk, and a CHECK constraint may not contain a subquery -- so the walk lives in an
-- IMMUTABLE helper that touches no table and reads nothing but its arguments, which is exactly the
-- narrow case a function-in-a-CHECK is safe for. It is deliberately TOTAL: a non-array, a
-- non-object element or a missing/non-string text all return true here, because refusing those is
-- close_proposals_drafted_check's and rung B2's job and a second opinion in a different constraint
-- would only make the failure message lie about which rule was broken.
create function clara._drafted_prose_within(p_drafted jsonb, p_max int)
  returns boolean
  language sql immutable parallel safe
  set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_drafted is null or jsonb_typeof(p_drafted) <> 'array' then true
    else not exists (
      select 1 from jsonb_array_elements(p_drafted) x(el)
       where jsonb_typeof(x.el) = 'object'
         and jsonb_typeof(x.el -> 'text') = 'string'
         and length(x.el ->> 'text') > p_max)
  end;
$$;
comment on function clara._drafted_prose_within(jsonb, int) is
  'G1 PR-2a §D: the per-element prose cap behind ck_cp_drafted_text_len. IMMUTABLE and
   table-free so it is safe inside a CHECK constraint; TOTAL by design (a malformed drafted[]
   is close_proposals_drafted_check''s refusal and rung B2''s, never this one''s).';
revoke all on function clara._drafted_prose_within(jsonb, int) from public;

alter table clara.close_proposals
  add constraint ck_cp_drafted_text_len check (clara._drafted_prose_within(drafted, 4000));

alter table clara.close_runs
  add constraint ck_close_runs_end_reason_len check (end_reason is null or length(end_reason) <= 4000);

-- ---------------------------------------------------------------------------------------------
-- THE STRUCTURED ABANDONMENT ROSTER.
--
-- clara.close_runs.end_reason is free prose and always has been (0056:421), which is right for a
-- human who abandons a run and wrong for a lane that will do it unattended, nightly, with nobody
-- reading each one: "why do close runs get abandoned" is a question a firm has to be able to ask
-- of the books rather than of a text search.
--
-- SHIPPED AS A CARRIER, WITH ITS WRITER NAMED AS A FOLLOW-UP -- and that split is the estate's own
-- precedent, not a shortcut: 0120:254 added wake_credentials.agent_task_id as "F14's binding" with
-- NO writer, and 0138 shipped mint_wake_credential_for_task eighteen migrations later to fill it.
-- The reason to do it that way here is specific. Requiring a code from the AGENT lane today would
-- mean adding a parameter to wake_abandon_close, which closePrep.v1.tools.ts calls by name from a
-- FROZEN body (constraint 9) -- the lane would refuse every abandonment it attempted, which is
-- strictly worse than the prose it writes now. closePrep.v1.tools.ts's own comment says it in
-- words: "A structured abandonment-code roster is the DB pass's own question; the cap is what this
-- PR can do without a migration."
--
-- WHAT DOES BITE TODAY, and is drilled RED-first: an unrostered code is refused by the FK, an
-- inactive one by the assignment trigger below, and a code on a run that is not abandoned is
-- refused outright. So when the writer lands it cannot invent a vocabulary.
-- ---------------------------------------------------------------------------------------------
create table clara.close_abandon_reasons (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]{2,47}$'),
  label       text not null check (btrim(label) <> ''),
  description text not null check (btrim(description) <> ''),
  sort_order  int not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table clara.close_abandon_reasons enable row level security;
alter table clara.close_abandon_reasons force row level security;
-- Estate configuration, not client data (the wake_engine_sources posture, verbatim): owner-floor
-- write, every application role reads. It carries no firm_id, so the scoped-human-read half of the
-- db-migrations rule is served by an unconditional SELECT policy -- the same shape and the same
-- reasoning 0133 recorded for its own registry.
create policy p_car_owner on clara.close_abandon_reasons
  for all to clara_fn_owner using (true) with check (true);
create policy p_car_read on clara.close_abandon_reasons
  for select to clara_authenticated, clara_runtime using (true);
grant select on clara.close_abandon_reasons to clara_authenticated, clara_runtime;
comment on table clara.close_abandon_reasons is
  'G1 PR-2a: the closed vocabulary for clara.close_runs.end_reason_code. Estate configuration
   (owner-floor write, every role reads); never DML''d by a Wave-G client-data reset. EXTEND-ONLY:
   a new cause adds a row, and `active=false` retires one WITHOUT breaking the rows that already
   name it.';

insert into clara.close_abandon_reasons(code, label, description, sort_order) values
  ('books_incomplete',        'Books not ready',            'The period''s bookkeeping is not complete enough to close: unposted entries, uncoded transactions, or an unfinished intake.', 10),
  ('bank_unreconciled',       'Bank not reconciled',        'One or more bank accounts are not reconciled for the period, so the closing balances cannot be trusted.', 20),
  ('documents_missing',       'Supporting documents missing', 'Evidence the close depends on has not arrived: statements, invoices, or a signed confirmation.', 30),
  ('prior_period_open',       'An earlier period is open',  'An earlier fiscal year or period is still open, so this one cannot be closed in sequence.', 40),
  ('data_correction_required','A correction is needed first', 'An error was found that must be corrected outside this run before a close can be attempted again.', 50),
  ('client_instruction',      'The client asked us to stop', 'The client or the engagement partner instructed that the close not proceed now.', 60),
  ('superseded_by_new_run',   'Replaced by a later run',    'This run was abandoned because a newer close run for the same fiscal year takes its place.', 70),
  ('agent_blocked',           'Clara could not proceed',    'The unattended lane could not continue: its own gates refused, or the evidence it needed was unreadable. The prose reason carries the detail.', 80),
  ('operator_abandoned',      'Stopped by an operator',     'A person stopped the run without a domain cause above -- housekeeping, a duplicate run, or an accidental start.', 90),
  ('other',                   'Other',                      'None of the rostered causes fit. The prose reason is the record; a recurring "other" is the signal to add a code.', 999);

alter table clara.close_runs
  add column end_reason_code text references clara.close_abandon_reasons(code);
-- A code is meaningful only on an abandonment. A finalized run has no cause to name and an
-- in_progress one has not ended, so both are refused rather than silently tolerated. (The birth
-- shape is covered too: a run is born in_progress, so a code at INSERT is refused here as well as
-- by _tf_assert_close_agent_receipt's own birth arm.)
alter table clara.close_runs
  add constraint ck_close_runs_end_reason_code_abandoned
  check (end_reason_code is null or state = 'abandoned');
comment on column clara.close_runs.end_reason_code is
  'G1 PR-2a: the structured half of end_reason, FK-bound to clara.close_abandon_reasons. NULLABLE
   and unwritten today BY DESIGN -- the writer is a named follow-up (wake_abandon_close /
   abandon_close each gain a trailing p_reason_code), held out of this PR because adding a
   parameter to a verb a FROZEN workflow body calls would make closePrep_v1 refuse every
   abandonment. The carrier-first split is 0120:254''s own precedent (agent_task_id shipped
   writerless; 0138 filled it).';

-- EXTEND-ONLY is a mechanism, not prose. The owner may append a new row and may retire one by the
-- single true -> false transition. Every other UPDATE, plus DELETE and TRUNCATE, is refused. A
-- retired code remains FK-valid for history; the close-run trigger below checks active only when
-- a code is newly assigned, never when an already-referenced row is merely updated elsewhere.
create function clara._tf_close_abandon_reason_lifecycle()
  returns trigger
  language plpgsql
  security definer
  set search_path = clara, pg_temp
as $function$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'close abandonment reasons are append-or-retire; % is forbidden', tg_op
      using errcode='CLR08', detail='{"reason":"close_abandon_reason_immutable"}';
  end if;
  if new.code is distinct from old.code
     or new.label is distinct from old.label
     or new.description is distinct from old.description
     or new.sort_order is distinct from old.sort_order
     or new.created_at is distinct from old.created_at
     or old.active is distinct from true
     or new.active is distinct from false then
    raise exception 'close abandonment reasons are immutable except for active true to false'
      using errcode='CLR08', detail='{"reason":"close_abandon_reason_immutable"}';
  end if;
  return new;
end
$function$;
revoke all on function clara._tf_close_abandon_reason_lifecycle() from public;
create trigger t_close_abandon_reasons_lifecycle
  before update or delete on clara.close_abandon_reasons
  for each row execute function clara._tf_close_abandon_reason_lifecycle();
create trigger t_close_abandon_reasons_no_truncate
  before truncate on clara.close_abandon_reasons
  for each statement execute function clara._tf_close_abandon_reason_lifecycle();

create function clara._tf_close_run_reason_active()
  returns trigger
  language plpgsql
  security definer
  set search_path = clara, pg_temp
as $function$
begin
  if new.end_reason_code is null then return new; end if;
  if tg_op = 'UPDATE' and new.end_reason_code is not distinct from old.end_reason_code then
    return new; -- an existing historical reference survives retirement
  end if;
  -- Preserve the FK's own refusal for an unrostered spelling. This trigger owns only the
  -- lifecycle predicate on a row the roster positively contains; it must not relabel absence as
  -- inactivity (review law 2, and the pre-existing D2 cell pins that refusal precedence).
  if not exists (select 1 from clara.close_abandon_reasons r
                  where r.code = new.end_reason_code) then
    return new;
  end if;
  if not exists (select 1 from clara.close_abandon_reasons r
                  where r.code = new.end_reason_code and r.active) then
    raise exception 'close abandonment reason % is not active for a new assignment', new.end_reason_code
      using errcode='CLR10', detail='{"reason":"close_abandon_reason_inactive"}';
  end if;
  return new;
end
$function$;
revoke all on function clara._tf_close_run_reason_active() from public;
create trigger t_close_run_reason_active
  before insert or update of end_reason_code on clara.close_runs
  for each row execute function clara._tf_close_run_reason_active();

-- =================================================================================================
-- §E · THE TASK-BOUND BANK CREDENTIAL (F14, extended from close_prep to bank_agent).
--
-- THE GAP, measured on the live catalog rather than read off a design: wake_credentials.agent_task_id
-- has existed since 0120 and mint_wake_credential_for_task has recorded it since 0138 -- but only
-- for close_prep, and only through a door the bank lane does not use. bankAgent.v1's own credential
-- comes from pools().mintBankAgentCredential -> the PLAIN five-argument mint, which records no task
-- at all. So clara._wake_task_id() returns NULL for every bank_agent credential in existence, and
-- §F's whole gate would be inert if this section did not exist.
--
-- TWO DOORS, and the asymmetry is deliberate.
--
-- (1) mint_wake_credential_for_task gains bank_agent -- the EXACT door, where the caller names the
--     task and the database verifies congruence. It resolves the expected agent_tasks.kind from the
--     SOURCE REGISTRY instead of the pre-fix `kind = p_wake_kind` projection:
--     for close_prep those two are the same string, so this is a strict generalisation with
--     byte-identical behaviour on the only kind that used it, and for bank_agent it correctly
--     expects kind='wake', and additionally proves task -> intent -> event -> the bank_agent row.
--     This door is what the runtime follow-up should call; it is NOT reachable from the frozen
--     bankAgent_v1 body, whose injected mintBankAgentCredential(firmId, clientId, ttl) signature
--     is declared in a frozen file and carries no task.
--
-- (2) mint_wake_credential's own bank_agent arm therefore has to BIND the task itself, and it does
--     it by DERIVING -- never by accepting one, because a caller-supplied task id is the caller
--     asserting its own provenance (_close_wake_ctx's own words). The derivation is the unique LIVE
--     bank-SOURCE task for this (firm, client): exactly one, or the mint REFUSES. Zero and many are
--     separate refusals with separate reasons, because they mean different things and a triage
--     reads the reason.
--
--     WHY 'LIVE' AND NOT 'RUNNING'. The status set is {held, running, cancel_requested}, not
--     {running}. FOLD-2 settled that a cancelled pass must still be able to READ (it is the writes
--     that stop), so a mint that refused off 'running' would break the read path the moment a
--     cancel landed. The RUNNING requirement belongs to the write gate, one layer down (§F), which
--     is also the only place it can be checked inside the write's OWN transaction.
--
--     THE AMBIGUITY IS REAL AND IT IS REFUSED, not papered over. The pack is per-ACCOUNT, so a
--     client with two bank accounts can have two live wake tasks at once, and this derivation then
--     refuses BOTH mints -- fail-closed, loudly, with a reason that names the count. That is the
--     honest cost of a frozen mint signature, and it is precisely why door (1) ships in the same
--     file: the runtime follow-up that repoints mintBankAgentCredential at the task-bound minter
--     removes the ambiguity entirely, and until it lands a multi-account client's second concurrent
--     run refuses rather than acting on the wrong account's pack.
-- =================================================================================================
create or replace function clara.mint_wake_credential_for_task(p_wake_kind text, p_firm uuid, p_client uuid,
    p_agent_task uuid, p_ttl interval DEFAULT '00:15:00'::interval)
 RETURNS TABLE(credential_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_secret text; v_id uuid; v_task record; v_source record;
begin
  -- The clocked kinds ONLY. This sibling is not a second door onto the legacy kinds: those have
  -- no task to bind and mint_wake_credential remains their one minter. G1 PR-2a widens the roster
  -- to bank_agent -- the second clocked kind, and the one whose acts §F now gates on the task.
  if p_wake_kind is null or p_wake_kind not in ('close_prep', 'bank_agent') then
    raise exception 'bad wake_kind for a task-bound mint' using errcode = 'CLR10',
      detail = '{"reason":"wake_kind_not_task_bound"}';
  end if;
  if p_firm is null or not exists (select 1 from clara.firms where id = p_firm) then
    raise exception 'unknown firm' using errcode = 'CLR10';
  end if;
  -- Both clocked kinds share ONE shape (0133:753-761 for close_prep, 0121's bank_agent arm): a
  -- firm-congruent ACTIVE client is required, and on_behalf_of is FORBIDDEN by construction —
  -- there is no directing human on a clocked lane, so the NULL is structural, never inferred
  -- (law 68). This sibling does not even take an on_behalf_of argument.
  if p_client is null or not exists (
      select 1 from clara.clients where id = p_client and firm_id = p_firm and status = 'active') then
    raise exception '% wake requires a firm-congruent active client', p_wake_kind
      using errcode = 'CLR10', detail = '{"reason":"clocked_client_incongruent"}';
  end if;
  -- Resolve the SOURCE row, not merely its task_kind projection. `kind='wake'` is shared by every
  -- wake_outbox source; bank identity is the registry row plus the producing event type.
  select s.source_key, s.carrier, s.event_type, s.task_kind, s.wake_kind into v_source
    from clara.wake_engine_sources s
    where s.source_key = p_wake_kind and s.wake_kind = p_wake_kind;
  if v_source.source_key is null then
    raise exception 'no wake_engine_sources row registers wake_kind % -- a task-bound mint cannot know which agent_tasks.kind to expect', p_wake_kind
      using errcode = 'CLR10', detail = '{"reason":"wake_source_unregistered"}';
  end if;
  -- THE TASK IS MANDATORY AND MUST BE THE RIGHT TASK. Congruence is read positively (firm, client
  -- and kind all measured on the row), never assumed from the caller having supplied an id.
  if p_agent_task is null then
    raise exception 'a task-bound wake credential requires its agent task'
      using errcode = 'CLR10', detail = '{"reason":"wake_task_unbound"}';
  end if;
  select t.id, t.firm_id, t.client_id, t.kind, t.status, t.origin_intent_id into v_task
    from clara.agent_tasks t where t.id = p_agent_task;
  if v_task.id is null or v_task.firm_id is distinct from p_firm
     or v_task.client_id is distinct from p_client or v_task.kind is distinct from v_source.task_kind then
    raise exception 'the named agent task is not a % task for this firm and client', v_source.task_kind
      using errcode = 'CLR11', detail = '{"reason":"wake_task_incongruent"}';
  end if;
  -- ONE LIVE-STATUS WALL FOR BOTH exact-mint kinds. close_prep used to skip this because the
  -- check lived inside the bank-only source-identity arm below; a terminal close task could then
  -- mint a fresh credential. `queued` is also pre-claim, not live: the engine transitions a
  -- direct-queue task to running before the workflow mints.
  if v_task.status not in ('held','running','cancel_requested') then
    raise exception 'the named % wake task is not live (%) and cannot mint a fresh credential',
      p_wake_kind, v_task.status
      using errcode='CLR10', detail='{"reason":"wake_task_not_live"}';
  end if;
  if p_wake_kind = 'bank_agent' then
    -- SOURCE IDENTITY: task -> intent -> event -> the registered bank source. A same-client
    -- kind='wake' task from any other event is a different source, even if its JSON happens to
    -- spell a bank_account_id.
    if v_source.carrier is distinct from 'wake_outbox'
       or v_source.event_type is distinct from 'bank.agent_due'
       or not exists (
         select 1
           from clara.agent_tasks t
           join clara.wake_intents wi on wi.id = t.origin_intent_id
         join clara.domain_events de on de.id = wi.event_id
         join clara.wake_engine_sources s
             on s.source_key = 'bank_agent' and s.wake_kind = 'bank_agent'
            and s.carrier = 'wake_outbox' and s.task_kind = t.kind
            and s.event_type = de.event_type
          where t.id = p_agent_task
            and de.firm_id = t.firm_id and de.client_id = t.client_id) then
      raise exception 'the named wake task was not produced by the registered bank_agent source'
        using errcode='CLR11', detail='{"reason":"wake_task_source_mismatch"}';
    end if;
  end if;
  v_secret := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind, firm_id, on_behalf_of, client_id,
      secret_hash, expires_at, agent_task_id)
    values (p_wake_kind, p_firm, null, p_client,
      sha256(convert_to(v_secret, 'UTF8')), statement_timestamp() + p_ttl, p_agent_task)
    returning id into v_id;
  return query select v_id, v_secret;
end
$function$;
-- ACL unmoved by this CoR (same signature): 0138 granted it to clara_runtime and nobody else.
-- Re-stated rather than assumed, and the tail proves the roster is still exactly that.
revoke all on function clara.mint_wake_credential_for_task(text, uuid, uuid, uuid, interval) from public;
grant execute on function clara.mint_wake_credential_for_task(text, uuid, uuid, uuid, interval) to clara_runtime;

create or replace function clara.mint_wake_credential(p_wake_kind text, p_firm uuid, p_on_behalf_of uuid DEFAULT NULL::uuid, p_ttl interval DEFAULT '00:15:00'::interval, p_client uuid DEFAULT NULL::uuid)
 RETURNS TABLE(credential_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_secret text; v_id uuid; v_task uuid; v_task_n int;
begin
  -- F-A2 (D34/GB-3), F-A3 (Annex D), F-A7 beta (D-12), Gate G1 (ANNEX-B CORRECTION): the EARLY
  -- kind gate, extended AGAIN. The design's own Annex B claimed close_prep was already admitted
  -- here; this branch's rig replay (prestate §0.2) shows it was NOT -- extending only the
  -- per-kind arm below would leave every close_prep mint refused `bad wake_kind`, exactly the
  -- hidden failure mode GB-3 named for interactive_client, discoverable only at apply time.
  if p_wake_kind is null or p_wake_kind not in ('interactive','proactive','autodraft','interactive_client','bank_agent','filing','close_prep') then
    raise exception 'bad wake_kind' using errcode='CLR10';
  end if;
  if p_firm is null or not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'unknown firm' using errcode='CLR10';
  end if;
  -- (No TTL-positivity guard: unpinned; a non-positive TTL mints an already-dead
  -- credential -- harmless, and the rig's expiry probes rely on it.)
  if p_on_behalf_of is not null and not exists(
      select 1 from clara.firm_memberships where user_id=p_on_behalf_of
        and firm_id=p_firm and status='active'
        and clara.role_rank(role)>=clara.role_rank('bookkeeper')) then
    raise exception 'on_behalf_of must be an active bookkeeper+ of the firm'
      using errcode='CLR10';
  end if;
  if p_wake_kind='autodraft' then
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'autodraft wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='interactive_client' then
    -- The pinned chat kind: a firm-congruent ACTIVE client exactly as autodraft demands, and
    -- on_behalf_of is KEPT (the generic bookkeeper+ membership check above still governs it).
    -- Honest footnote: this verifies firm-congruent and active, NOT that this human is
    -- authorised for that client -- the estate's existing firm-scoped model, opening nothing new.
    if p_client is null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'interactive_client wake requires a firm-congruent active client'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='bank_agent' then
    -- F-A3 Annex D: the clocked lane's own shape, byte-identical to autodraft's -- a
    -- firm-congruent active client is required and on_behalf_of is FORBIDDEN (there is no
    -- directing human on the clocked lane; the NULL is structural, never inferred, law 68).
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'bank_agent wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
    -- G1 PR-2a §E(2) -- THE TASK BINDING, DERIVED. The bank lane's credential must name the task
    -- it acts for, because §F gates every bank act on that task's status and account. The task id
    -- is never an argument here: this signature is frozen from the runtime's side, and a
    -- caller-supplied task id would be the caller asserting its own provenance anyway
    -- (_close_wake_ctx's own rule). So it is derived, and the derivation is EXACT-ONE or nothing.
    if not exists (select 1 from clara.wake_engine_sources s
                    where s.source_key='bank_agent' and s.wake_kind='bank_agent'
                      and s.carrier='wake_outbox' and s.event_type='bank.agent_due') then
      raise exception 'no wake_engine_sources row registers bank_agent -- a bank credential cannot be bound to a task'
        using errcode='CLR10', detail='{"reason":"wake_source_unregistered"}';
    end if;
    -- LIVE, not running: FOLD-2 keeps READS lawful after a cancel_requested, and the write-side
    -- 'running' requirement is §F's, inside the write's own transaction where it belongs.
    select count(*), min(t.id::text)::uuid into v_task_n, v_task
      from clara.agent_tasks t
      join clara.wake_intents wi on wi.id = t.origin_intent_id
      join clara.domain_events de on de.id = wi.event_id
      join clara.wake_engine_sources s
        on s.source_key='bank_agent' and s.wake_kind='bank_agent'
       and s.carrier='wake_outbox' and s.task_kind=t.kind
       and s.event_type=de.event_type and s.event_type='bank.agent_due'
      where t.firm_id = p_firm and t.client_id = p_client
        and de.firm_id = t.firm_id and de.client_id = t.client_id
        and t.status in ('held','running','cancel_requested');
    if v_task_n = 0 then
      raise exception 'a bank_agent credential must name its wake task, and this firm/client has no live one'
        using errcode='CLR10', detail='{"reason":"bank_agent_task_absent"}';
    elsif v_task_n > 1 then
      raise exception 'this firm/client has % live bank wake tasks; the plain mint cannot tell which one this credential is for -- use clara.mint_wake_credential_for_task', v_task_n
        using errcode='CLR10', detail='{"reason":"bank_agent_task_ambiguous"}';
    end if;
  elsif p_wake_kind='close_prep' then
    -- Gate G1 §2: the clocked lane's own shape, byte-identical to bank_agent's -- a
    -- firm-congruent active client is required and on_behalf_of is FORBIDDEN (no directing
    -- human on the clocked lane; the NULL is structural, never inferred, law 68).
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'close_prep wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='filing' then
    -- F-A7 beta, D-12: filing is firm-scoped by construction -- a document being attributed
    -- has no client yet, so a client binding here is a caller error, not a pin to honour.
    if p_client is not null then
      raise exception 'filing wake requires no client binding (attribution has no client yet)'
        using errcode='CLR10';
    end if;
  elsif p_client is not null then
    raise exception 'legacy wake kinds do not accept a client binding' using errcode='CLR10';
  end if;
  v_secret:=gen_random_uuid()::text||gen_random_uuid()::text;
  -- agent_task_id is NULL for every kind but bank_agent (v_task is only ever set in that arm),
  -- so this INSERT is behaviourally byte-identical to the pre-fix one on the other six kinds.
  insert into clara.wake_credentials(wake_kind,firm_id,on_behalf_of,client_id,
      secret_hash,expires_at,agent_task_id)
    values(p_wake_kind,p_firm,p_on_behalf_of,p_client,
      sha256(convert_to(v_secret,'UTF8')),statement_timestamp()+p_ttl,v_task::uuid)
    returning id into v_id;
  return query select v_id,v_secret;
end
$function$;
-- ACL unmoved by this CoR (same signature). Re-stated, and re-proven in the tail.
revoke all on function clara.mint_wake_credential(text, uuid, uuid, interval, uuid) from public;
grant execute on function clara.mint_wake_credential(text, uuid, uuid, interval, uuid) to clara_runtime;

-- THE CLOSE-LANE TRANSACTION WALL. Credential expiry/revocation is necessary but not sufficient:
-- a credential minted while its close_prep task was running can outlive that task. The six read
-- verbs keep FOLD-2's deliberate post-cancel inspection path and therefore take a plain task read;
-- every other allowlisted close verb is a write, locks the bound task until the wrapper commits,
-- and requires that task to still be running. The registry supplies identity: spelling
-- kind='close_prep' without the registered close_prep source row is not authority.
create or replace function clara._close_wake_ctx(p_verb text, p_subject_kind text, p_subject_id uuid, p_op_key text)
  returns jsonb language plpgsql volatile security definer set search_path = clara, pg_temp as $$
declare
  w record; v_task uuid; v_client uuid; v_firm uuid; v_task_row record; v_is_read boolean;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03',
      detail = '{"reason":"no_wake_credential"}';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, p_verb);
  v_client := clara._close_subject_client(p_subject_kind, p_subject_id);
  if w.client_id is null or v_client is null or w.client_id is distinct from v_client then
    raise exception 'wake close authority is not pinned to this subject' using errcode = 'CLR03',
      detail = '{"reason":"wake_client_pin_mismatch"}';
  end if;
  v_task := clara._wake_task_id();
  if v_task is null then
    raise exception 'this wake credential names no agent task' using errcode = 'CLR03',
      detail = '{"reason":"wake_task_unbound"}';
  end if;
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if p_op_key is distinct from clara._close_expected_op_key(v_task, p_verb, p_subject_id) then
    raise exception 'the supplied op_key is not the derived key for this (task, verb, subject)'
      using errcode = 'CLR10', detail = '{"reason":"op_key_not_derived"}';
  end if;

  v_is_read := p_verb = any (array[
    'wake_list_fiscal_years', 'wake_get_close_plan', 'wake_get_close_readiness',
    'wake_verify_close', 'wake_snapshot_state', 'wake_dry_run_close_readiness']);
  if v_is_read then
    select t.id, t.firm_id, t.client_id, t.kind, t.status into v_task_row
      from clara.agent_tasks t
      join clara.wake_engine_sources s
        on s.source_key='close_prep' and s.wake_kind='close_prep' and s.task_kind=t.kind
     where t.id=v_task;
  else
    select t.id, t.firm_id, t.client_id, t.kind, t.status into v_task_row
      from clara.agent_tasks t
      join clara.wake_engine_sources s
        on s.source_key='close_prep' and s.wake_kind='close_prep' and s.task_kind=t.kind
     where t.id=v_task
     for update of t;
  end if;
  if v_task_row.id is null or v_task_row.firm_id is distinct from w.firm_id
     or v_task_row.client_id is distinct from w.client_id then
    raise exception 'this close wake credential does not name the registered close_prep task for its firm and client'
      using errcode='CLR03', detail='{"reason":"wake_task_incongruent"}';
  end if;
  if not v_is_read and v_task_row.status is distinct from 'running' then
    raise exception 'this close wake task is % -- an unattended write requires a running task', v_task_row.status
      using errcode='CLR03', detail='{"reason":"wake_task_not_live"}';
  end if;

  select cl.firm_id into v_firm from clara.clients cl where cl.id = v_client;
  if v_firm is null or v_firm is distinct from w.firm_id then
    raise exception 'the subject is not in this credential''s firm' using errcode = 'CLR11',
      detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  return jsonb_build_object('firm_id', w.firm_id, 'client_id', v_client,
    'wake_kind', w.wake_kind, 'on_behalf_of', w.on_behalf_of, 'task_id', v_task);
end $$;
revoke all on function clara._close_wake_ctx(text, text, uuid, text) from public;

-- =================================================================================================
-- §F · THE WRITE TOCTOU — every bank act re-reads its own task, under FOR UPDATE, inside its own
-- transaction, and every act's bank ACCOUNT is derived in the database and required to be the
-- task's own.
--
-- THE DEFECT #437 RECORDED RATHER THAN BUILT, in its own words: "the write TOCTOU between the
-- status read and the wrapper transaction (the DB-side half is G1 PR-2, already a precondition of
-- the flip)". FOLD-2 made every bank WRITE re-read agent_tasks.status on the RUNTIME pool before
-- minting a credential. That read is a different transaction from the wrapper's, on a different
-- connection, and it happens before the mint -- so a cancel landing in the window between the read
-- and the wrapper's own commit is invisible, and the write lands under books that already say the
-- run stopped. Only a check INSIDE the writing transaction, holding the row, closes it.
--
-- AND THE SECOND HALF, which is not a race at all: the pack is per-ACCOUNT
-- (_agent_get_bank_pack_core scopes every line, candidate and statement to p_bank_account), the
-- producer contract puts bank_account_id in the event payload, and NOTHING in the database
-- previously required the account a run ACTS on to be the account it READ. FOLD-4 closed the
-- runtime half by binding writes to the pack digest; this closes the DB half by deriving the
-- account from the act's own subject and requiring it to equal the task's.
--
-- WHERE THE GATE LIVES, and why it is fourteen one-line edits rather than one clever trigger. The
-- closed world of bank-agent acts is defined by the ACL: clara_wake_bank may EXECUTE exactly the
-- fourteen allowlisted wake_* verbs and nothing else, so gating all fourteen gates every possible
-- act BY CONSTRUCTION. A BEFORE INSERT trigger on bank_agent_receipts was the tempting
-- alternative -- one body instead of fourteen -- and it was rejected because it would depend on a
-- MEASURED property ("every core writes a receipt") that a future core could quietly break,
-- whereas the ACL is a structural one. The delta in each wrapper is a single line, and the tail
-- proves it by RE-SUBSTITUTION: strip the added line and the body must be byte-identical to the
-- prestate's pin.
--
-- THE GATE IS SCOPED TO wake_kind='bank_agent' AND NOTHING ELSE, and this is load-bearing rather
-- than cautious: thirteen of these fourteen verbs are ALSO allowlisted for interactive_client --
-- the CHAT lane, where a human is in the room, there is no wake task, no pack and no account
-- binding (measured on the live allowlist, not assumed). A gate that fired there would break every
-- interactive bank tool in chatTurn.v14. The gate returns NULL and stands aside for every other
-- credential kind, and G1PR2A-H1's positive control proves the chat lane still passes.
-- =================================================================================================
create function clara._wake_task_bank_account(p_task uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = clara, pg_temp
as $function$
  -- UUID SPELLING IS NOT IDENTITY. Resolve the registered bank source through the producing
  -- event, parse the payload defensively, then join the ACTIVE bank_accounts row and prove its
  -- firm/client are the task's own. A nonexistent, inactive, or cross-client UUID returns NULL;
  -- the gate classifies that as incongruent rather than accepting the caller's spelling.
  select ba.id
    from clara.agent_tasks t
    join clara.wake_intents wi on wi.id = t.origin_intent_id
    join clara.domain_events de on de.id = wi.event_id
    join clara.wake_engine_sources s
      on s.source_key='bank_agent' and s.wake_kind='bank_agent'
     and s.carrier='wake_outbox' and s.task_kind=t.kind
     and s.event_type=de.event_type and s.event_type='bank.agent_due'
    join clara.bank_accounts ba
     on ba.id = case when de.payload ->> 'bank_account_id'
                           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then (de.payload ->> 'bank_account_id')::uuid end
     and ba.firm_id=t.firm_id and ba.client_id=t.client_id and ba.active
   where t.id = p_task
     and de.firm_id=t.firm_id and de.client_id=t.client_id;
$function$;
comment on function clara._wake_task_bank_account(uuid) is
  'G1 PR-2a §F: the ACTIVE bank_accounts identity a bank-source wake task was minted FOR. Joins
   task -> intent -> event -> wake_engine_sources(source_key=bank_agent,event_type=bank.agent_due)
   -> bank_accounts and proves task/firm/client congruence. A payload UUID spelling alone is never
   identity; absent, malformed, nonexistent, inactive and cross-client values return NULL.';
revoke all on function clara._wake_task_bank_account(uuid) from public;

create function clara._bank_wake_task_gate(p_verb text, p_account uuid,
    p_requires_running boolean, p_account_required boolean)
  returns uuid
  language plpgsql
  security definer
  set search_path = clara, pg_temp
as $function$
declare
  w record; v_task uuid; v_status text; v_kind text; v_expect_kind text; v_task_account uuid;
  v_task_firm uuid; v_task_client uuid; v_payload_account text;
begin
  select * into w from clara.wake_context();
  -- STAND ASIDE for every credential that is not the clocked bank lane's. Thirteen of the
  -- fourteen callers are also interactive_client doors and one is bank_agent-only; a NULL
  -- wake_kind means no live credential at all, which each caller has already refused CLR03 two
  -- lines above this call. Returning NULL is not a default-open: the caller's own credential
  -- check is what makes this arm unreachable without one.
  if w.wake_kind is distinct from 'bank_agent' then
    return null;
  end if;
  -- THE BINDING. Never a wrapper argument -- a caller-supplied task id is the caller asserting
  -- its own provenance (_close_wake_ctx's own rule, applied to the bank lane).
  v_task := clara._wake_task_id();
  if v_task is null then
    raise exception 'this bank wake credential names no agent task' using errcode = 'CLR03',
      detail = '{"reason":"wake_task_unbound"}';
  end if;
  select s.task_kind into v_expect_kind from clara.wake_engine_sources s
   where s.source_key='bank_agent' and s.wake_kind='bank_agent'
     and s.carrier='wake_outbox' and s.event_type='bank.agent_due';
  if v_expect_kind is null then
    raise exception 'no wake_engine_sources row registers bank_agent' using errcode = 'CLR03',
      detail = '{"reason":"wake_source_unregistered"}';
  end if;
  -- FOR UPDATE, inside the CALLER'S transaction. This is the whole point of the section: the row
  -- is held from here until the wrapper's own commit, so a cancel_agent_task landing concurrently
  -- either committed BEFORE this read (and is seen) or blocks until after this act commits (and
  -- settles the task afterwards, which is the lawful order). The lock order is task-first,
  -- matching cancel_agent_task's own (0006/0133 §C2 locks agent_tasks before agent_interruptions),
  -- so the two cannot deadlock against each other.
  select t.status, t.kind, t.firm_id, t.client_id
    into v_status, v_kind, v_task_firm, v_task_client
    from clara.agent_tasks t where t.id = v_task for update;
  if v_status is null then
    raise exception 'this bank wake credential names a task that does not exist' using errcode = 'CLR03',
      detail = '{"reason":"wake_task_absent"}';
  end if;
  if v_kind is distinct from v_expect_kind then
    raise exception 'this bank wake credential names a % task, not the registry''s %', v_kind, v_expect_kind
      using errcode = 'CLR03', detail = '{"reason":"wake_task_kind_mismatch"}';
  end if;
  if v_task_firm is distinct from w.firm_id or v_task_client is distinct from w.client_id then
    raise exception 'this bank wake credential names a task for another firm or client'
      using errcode='CLR03', detail='{"reason":"wake_task_incongruent"}';
  end if;
  -- Prove SOURCE identity independently at the transaction-local gate. A credential minted before
  -- this migration, or a corrupted row, must not turn an unrelated shared-kind wake into bank work.
  select de.payload ->> 'bank_account_id' into v_payload_account
    from clara.agent_tasks t
    join clara.wake_intents wi on wi.id=t.origin_intent_id
    join clara.domain_events de on de.id=wi.event_id
    join clara.wake_engine_sources s
      on s.source_key='bank_agent' and s.wake_kind='bank_agent'
     and s.carrier='wake_outbox' and s.task_kind=t.kind
     and s.event_type=de.event_type and s.event_type='bank.agent_due'
   where t.id=v_task
     and de.firm_id=t.firm_id and de.client_id=t.client_id;
  if not found then
    raise exception 'this wake task was not produced by the registered bank_agent source'
      using errcode='CLR03', detail='{"reason":"wake_task_source_mismatch"}';
  end if;
  -- WRITES ONLY. The pack READ passes false here on purpose: FOLD-2 settled that a cancelled pass
  -- may still read (it is the acts that stop), and a read that refused off 'running' would make a
  -- cancelled run unable to even see why it was stopping.
  if p_requires_running and v_status is distinct from 'running' then
    raise exception 'this bank wake task is % -- an unattended act may only be written while its task is running', v_status
      using errcode = 'CLR03', detail = '{"reason":"wake_task_not_running"}';
  end if;
  if v_payload_account is null or v_payload_account !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'this bank wake task names no bank account -- its producing event did not carry bank_account_id'
      using errcode = 'CLR03', detail = '{"reason":"wake_task_account_unbound"}';
  end if;
  v_task_account := clara._wake_task_bank_account(v_task);
  if v_task_account is null then
    raise exception 'this bank wake task''s bank_account_id does not identify an active account for its firm and client'
      using errcode='CLR03', detail='{"reason":"wake_task_account_incongruent"}';
  end if;
  -- NULL never means "account equality is inapplicable" on the bank_agent lane. Every act must
  -- derive exactly one account: add-account is unavailable to an account-specific run; upsert
  -- resolves its COA code; staff advance resolves all bank COA lines and requires one distinct
  -- account; promotion resolves the durable pack-read receipt for its inputs digest.
  if p_account_required and p_account is null then
    raise exception 'the subject of % does not resolve to a bank account', p_verb using errcode = 'CLR03',
      detail = '{"reason":"wake_act_account_unresolved"}';
  end if;
  if p_account is not null and p_account is distinct from v_task_account then
    raise exception 'this bank wake task acts for another bank account than %''s subject', p_verb
      using errcode = 'CLR03', detail = '{"reason":"wake_task_account_mismatch"}';
  end if;
  return v_task;
end
$function$;
comment on function clara._bank_wake_task_gate(text, uuid, boolean, boolean) is
  'G1 PR-2a §F: the clocked bank lane''s per-act gate. Holds the wake task FOR UPDATE inside the
   CALLING transaction, requires it running for a write, and requires the act''s own bank account
   (derived in the database from the act''s subject) to be the account the task was minted for.
   Stands aside for every non-bank_agent credential -- thirteen of its fourteen callers are also
   interactive_client doors.';
revoke all on function clara._bank_wake_task_gate(text, uuid, boolean, boolean) from public;

-- -------------------------------------------------------------------------------------------------
-- THE FOURTEEN. Each body below is its live prestate text with EXACTLY ONE line added: the gate.
-- Nothing else moves -- the tail proves it by deleting the added line from the new prosrc and
-- comparing byte-for-byte against the pin.
--
-- THE LINE GOES LAST, immediately before the core call, and the position is a decision rather than
-- a formatting choice. An earlier draft put it right after assert_wake_allowed, which MASKED every
-- refusal each wrapper already made: a bank_agent credential pinned to client A calling with
-- client B used to refuse CLR11 credential_client_pin, and with the gate ahead of that check it
-- refused CLR03 wake_act_account_unresolved instead -- the right outcome for the wrong stated
-- reason, which is the class this repo has paid for three times. Last-before-the-core keeps every
-- pre-existing refusal's precedence exactly as it was, and loses nothing: the gate is still inside
-- the wrapper's own transaction and still ahead of every write the core makes.
-- The three arguments after the verb name are the verb's own account subject (derived HERE, in
-- SQL, from the arguments the caller actually passed), whether it is a WRITE, and whether an
-- unresolvable account is a refusal. Signatures, argument names, SECURITY DEFINER and search_path
-- are unchanged, so every ACL survives the replace untouched.
-- -------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION clara.wake_add_bank_account(p_client uuid, p_coa_account_code text, p_proposal_id uuid, p_bank_code text, p_account_number text, p_bank_name_display text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_add_bank_account');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_add_bank_account', null::uuid, true, true);
  return clara._agent_add_bank_account_core(p_client, p_coa_account_code, p_proposal_id, p_bank_code, p_account_number, p_bank_name_display, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_book_staff_advance_application(p_client uuid, p_posting_date date, p_memo text, p_lines jsonb, p_allocations jsonb, p_kind text, p_reason text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_book_staff_advance_application');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_book_staff_advance_application',
    (select case when count(distinct ba.id)=1 then min(ba.id::text)::uuid end
       from jsonb_array_elements(case when jsonb_typeof(p_lines)='array' then p_lines else '[]'::jsonb end) x(line)
       join clara.bank_accounts ba on ba.firm_id=w.firm_id and ba.client_id=p_client and ba.active
        and ba.coa_account_code=x.line->>'account_code'), true, true);
  return clara._agent_book_staff_advance_application_core(p_client, p_posting_date, p_memo,
    p_lines, p_allocations, p_kind, p_reason, p_rationale, p_model, p_inputs_digest, p_op_key);
end
$function$;

CREATE OR REPLACE FUNCTION clara.wake_complete_bank_reconciliation(p_statement uuid, p_ack_outstanding uuid[], p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record; v_client uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_complete_bank_reconciliation');
  select client_id into v_client from clara.bank_statements where id = p_statement;
  if w.client_id is not null and v_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_complete_bank_reconciliation', (select s.bank_account_id from clara.bank_statements s where s.id = p_statement), true, true);
  return clara._agent_complete_bank_reconciliation_core(p_statement, p_ack_outstanding, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_get_bank_pack(p_client uuid, p_bank_account uuid, p_rationale text, p_model jsonb, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_bank_pack');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_get_bank_pack', p_bank_account, false, true);
  return clara._agent_get_bank_pack_core(p_client, p_bank_account, p_rationale, p_model, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_match_bank_line(p_client uuid, p_lines jsonb, p_entries jsonb, p_adjustments jsonb, p_ack_period_exceptions boolean, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_match_bank_line');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_match_bank_line', (select case when count(distinct l.bank_account_id) = 1 then (array_agg(distinct l.bank_account_id))[1] end from clara.bank_statement_lines l where l.id in (select (case jsonb_typeof(elem) when 'string' then elem #>> '{}' else elem->>'line_id' end)::uuid from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) as elem where (case jsonb_typeof(elem) when 'string' then elem #>> '{}' else elem->>'line_id' end) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')), true, true);
  return clara._agent_match_bank_line_core(p_client, p_lines, p_entries, p_adjustments, p_ack_period_exceptions, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_propose_bank_identifier_promotion(p_client uuid, p_counterparty uuid, p_identifier_kind text, p_identifier_value text, p_times_seen integer, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_bank_identifier_promotion');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_propose_bank_identifier_promotion',
    (select case when count(distinct r.subject_id)=1 then min(r.subject_id::text)::uuid end
       from clara.bank_agent_receipts r
      where r.firm_id=w.firm_id and r.client_id=p_client and r.act_kind='pack_read'
        and r.outcome='admitted' and r.inputs_digest=p_inputs_digest), true, true);
  return clara._agent_propose_bank_identifier_promotion_core(p_client, p_counterparty, p_identifier_kind, p_identifier_value, p_times_seen, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_propose_bank_line_exception(p_line uuid, p_kind text, p_reason text, p_evidence_document uuid, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record; v_client uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_bank_line_exception');
  select client_id into v_client from clara.bank_statement_lines where id = p_line;
  if w.client_id is not null and v_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_propose_bank_line_exception', (select l.bank_account_id from clara.bank_statement_lines l where l.id = p_line), true, true);
  return clara._agent_propose_line_exception_core(p_line, p_kind, p_reason, p_evidence_document, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_resolve_and_book_bank_line(p_client uuid, p_exception uuid, p_disposition text, p_note text, p_draft jsonb, p_allocations jsonb, p_adjustments jsonb, p_advance_applications jsonb, p_charge_cents bigint, p_charge_account text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text, p_ack_period_exceptions boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_resolve_and_book_bank_line');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_resolve_and_book_bank_line', (select e.bank_account_id from clara.bank_line_exceptions e where e.id = p_exception), true, true);
  return clara._agent_resolve_and_book_core(p_client, p_exception, p_disposition, p_note, p_draft,
    p_allocations, p_adjustments, p_advance_applications, p_charge_cents, p_charge_account,
    p_rationale, p_model, p_inputs_digest, p_op_key, p_ack_period_exceptions);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_resolve_bank_line_exception(p_exception uuid, p_disposition text, p_note text, p_counterpart_line uuid, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record; v_client uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_resolve_bank_line_exception');
  select client_id into v_client from clara.bank_line_exceptions where id = p_exception;
  if w.client_id is not null and v_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_resolve_bank_line_exception', (select e.bank_account_id from clara.bank_line_exceptions e where e.id = p_exception), true, true);
  return clara._agent_resolve_bank_line_exception_core(p_exception, p_disposition, p_note, p_counterpart_line, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_settle_from_bank_line(p_client uuid, p_line uuid, p_counterparty uuid, p_allocations jsonb, p_memo text, p_posting_date date, p_charge_cents bigint, p_charge_account text, p_adjustments jsonb, p_control_account text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_settle_from_bank_line');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  -- p_attestation is absent BY DESIGN (design §3.4/Annex A.1) -- the agent takes her own
  -- approval_arm ('agent_unattended') and writes no attestation, because an attestation
  -- asserts a judgement a human made.
  perform clara._bank_wake_task_gate('wake_settle_from_bank_line', (select l.bank_account_id from clara.bank_statement_lines l where l.id = p_line), true, true);
  return clara._agent_settle_from_bank_line_core(p_client, p_line, p_counterparty, p_allocations,
    p_memo, p_posting_date, p_charge_cents, p_charge_account, p_adjustments, p_control_account,
    p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_unmatch_bank_match(p_client uuid, p_match uuid, p_reason text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_unmatch_bank_match');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_unmatch_bank_match', (select m.bank_account_id from clara.bank_matches m where m.id = p_match), true, true);
  return clara._agent_unmatch_bank_match_core(p_client, p_match, p_reason, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_upsert_account(p_client uuid, p_code text, p_name text, p_type text, p_special_acc_type text, p_account_class text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_upsert_account');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_upsert_account',
    (select min(ba.id::text)::uuid from clara.bank_accounts ba
      where ba.firm_id=w.firm_id and ba.client_id=p_client
        and ba.coa_account_code=p_code and ba.active), true, true);
  return clara._agent_upsert_account_core(p_client, p_code, p_name, p_type, p_special_acc_type, p_account_class, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_void_bank_reconciliation(p_recon uuid, p_reason text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record; v_client uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_void_bank_reconciliation');
  select client_id into v_client from clara.bank_reconciliations where id = p_recon;
  if w.client_id is not null and v_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_void_bank_reconciliation', (select r.bank_account_id from clara.bank_reconciliations r where r.id = p_recon), true, true);
  return clara._agent_void_bank_reconciliation_core(p_recon, p_reason, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

CREATE OR REPLACE FUNCTION clara.wake_void_bank_statement(p_client uuid, p_statement uuid, p_reason text, p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_void_bank_statement');
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'this wake credential is pinned to another client' using errcode='CLR11',detail='{"reason":"credential_client_pin"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode='CLR10',detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended act must state its rationale' using errcode='CLR10',detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  perform clara._bank_wake_task_gate('wake_void_bank_statement', (select s.bank_account_id from clara.bank_statements s where s.id = p_statement), true, true);
  return clara._agent_void_bank_statement_core(p_client, p_statement, p_reason, p_rationale, p_model, p_inputs_digest, p_op_key);
end $function$;

-- =================================================================================================
-- §G · THE SETTLE GAINS A CAS SIBLING — FOR UPDATE, bound to workflow_run_id and an expected status.
--
-- FOLD-21's residual, in #437's own words: "the latch is per-attempt by construction, and the
-- monotonic DB-side version is G1 PR-2's". The shape: a WDK step retry, a crash-recovery
-- re-enqueue, or a reconciler belt can each hold a view of a task that has since moved on, and
-- today _settle_wake_task writes whatever it is told about whatever row carries that id. Two
-- conjuncts close it:
--
--   p_expect_run    -- the settling run's own workflow_run_id. A run that no longer holds the task
--                      (because a re-enqueue bound a second one) REFUSES instead of overwriting.
--   p_expect_status -- the status the caller believes it is settling FROM. A settle that raced a
--                      cancel REFUSES instead of stamping over it.
--
-- STRICT MEANS NO WILDCARDS. p_expect_run=NULL means "I observed an unbound task", so a concurrent
-- run binding is a mismatch; p_expect_status is mandatory. A nullable expectation in either arm
-- silently turns the CAS back into the blind settle this section exists to remove.
--
-- The strict CAS lives in a SIBLING because G1B-I3 requires every caller to pass every declared
-- argument. Frozen v1 callers cannot yet supply the observations. Their three-argument door keeps
-- its signature and ACL, but delegates ONLY to a PRIVATE compatibility body which locks the row,
-- derives the current values and invokes the strict body. That intentional expectation-skip is
-- quarantined and ungranted. After the D1 cutover deploys and drains new terminal/reconciler
-- versions, the old door is revoked and the compatibility body removed in a forward migration.
--
-- WHAT BITES TODAY, with no caller change at all: the FOR UPDATE, which both paths now take. The
-- pre-fix body read nothing and UPDATEd blind, so the row it settled could have moved between the
-- decision and the write. Holding it from the read to the commit is what makes the two conjuncts
-- meaningful when they arrive, and what makes a raced settle refuse with its OWN typed reason
-- rather than falling through to the transition trigger's generic CLR13 (G1PR2A-G4 drills exactly
-- that difference, and MUT-8 — the lock deleted from the shipping body — reds it and nothing else).
-- =================================================================================================
create or replace function clara._settle_wake_task_cas(p_task uuid, p_outcome text, p_error_code text,
    p_expect_run text, p_expect_status text)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_intent uuid; v_status text; v_run text;
begin
  if p_outcome not in ('completed','failed','cancelled') then
    raise exception 'unknown wake settlement outcome %', p_outcome using errcode='CLR10';
  end if;
  if p_expect_status is null then
    raise exception 'a strict wake settlement requires the status the caller observed'
      using errcode='CLR10', detail='{"reason":"wake_settle_status_required"}';
  end if;
  -- MUST B (0133, preserved verbatim in meaning): the legal kind domain is the REGISTRY's own
  -- task_kind column, never a 'wake' literal -- a close_prep task carries no wake_intent at all
  -- and must still settle. G1 PR-2a moves the check from a blind UPDATE + GET DIAGNOSTICS to a
  -- locking SELECT: same domain, same refusal, but the row is now HELD for the rest of this
  -- transaction. A structurally NULL origin_intent_id (every direct_queue task) is still never
  -- conflated with "no such task" -- `not found` is the instrument, not the intent's nullity.
  select t.origin_intent_id, t.status, t.workflow_run_id into v_intent, v_status, v_run
    from clara.agent_tasks t
    where t.id = p_task and t.kind in (select task_kind from clara.wake_engine_sources)
    for update;
  if not found then
    raise exception 'no wake-engine task % to settle', p_task using errcode='CLR10';
  end if;
  -- THE STRICT CAS. NULL is a REAL expected run value: a reconciler that observed an unbound row
  -- must refuse if another run binds before settlement. Status has no wildcard at all; the caller
  -- must state what it observed.
  if v_run is distinct from p_expect_run then
    raise exception 'wake task % is bound to run %, not the settling run', p_task, coalesce(v_run, '<unbound>')
      using errcode='CLR10', detail='{"reason":"wake_settle_run_mismatch"}';
  end if;
  if v_status is distinct from p_expect_status then
    raise exception 'wake task % is %, not the % the settling caller expected', p_task, v_status, p_expect_status
      using errcode='CLR10', detail='{"reason":"wake_settle_status_mismatch"}';
  end if;
  -- NOTE C (opus/Codex review), widened by S2 (both legs demanded first-write-wins, not just
  -- coalesce): a re-settle REPLAY that (for whatever caller reason) carries a null
  -- p_error_code must not ERASE a real error_code an earlier call already stamped -- but a
  -- plain coalesce() over-corrected: it let a LATER replay carrying a DIFFERENT non-null
  -- error_code overwrite the FIRST cause (coalesce(newNonNull, old) picks newNonNull every
  -- time), and it let a 'completed' outcome attach a stray error_code at all if one happened
  -- to be passed. TWO real rules now, in priority order: (1) 'completed' NEVER carries an
  -- error_code, full stop, regardless of what p_error_code the caller passes -- a completed
  -- task has no error to guard; (2) otherwise FIRST-WRITE-WINS -- once error_code is non-null,
  -- no LATER call (same or different p_error_code) may ever overwrite it; only a task whose
  -- error_code is still null takes the incoming value.
  update clara.agent_tasks set status = p_outcome,
      error_code = case
        when p_outcome = 'completed' then null
        when error_code is not null then error_code
        else p_error_code
      end
    where id = p_task;
  -- Idempotent by construction: a re-settle attempt (crash-recovery replay) finds the outbox
  -- row already 'settled'/'cancelled' and this UPDATE affects zero rows -- never a raise. A
  -- direct_queue task (close_prep) carries NO wakes_outbox row at all -- v_intent is null BY
  -- CONSTRUCTION there, not by a missed match -- so this cascade is conditioned on v_intent,
  -- never assumed present.
  if v_intent is not null then
    update clara.wakes_outbox set status = 'settled' where intent_id = v_intent and status = 'held';
  end if;
end $$;
revoke all on function clara._settle_wake_task_cas(uuid,text,text,text,text) from public;
-- clara_runtime ONLY, matching _settle_wake_task's own footing exactly: the reconciler belt and the
-- engine's own claim path are the only callers either door will ever have. Every human/wake role
-- stays refused; PUBLIC stays refused. This new name is added to rig-meta.mjs's own
-- G1_WAKE_ENGINE_RUNTIME_COHORT in the same PR -- the estate's grant matrix iterates the LIVE
-- catalog and treats an unrostered grant as a failure, which is the behaviour that makes the
-- roster worth having.
grant execute on function clara._settle_wake_task_cas(uuid,text,text,text,text) to clara_runtime;
comment on function clara._settle_wake_task_cas(uuid,text,text,text,text) is
  'Gate G1 / G1 PR-2a: the STRICT wake-engine settlement CAS. Holds the task FOR UPDATE, treats
   NULL as a real expected workflow_run_id, and REQUIRES an expected status. A mismatch REFUSES.
   New terminal/reconciler versions must call all five arguments; G1B-I3 pins their arity/order.';

-- PRIVATE DRAIN COMPATIBILITY. Frozen v1 terminal steps and reconciler belts still call the old
-- three-argument door. This body deliberately derives expectations from the row it locks, which
-- reproduces their legacy "skip expectations" behavior without weakening the strict CAS. It is
-- granted to nobody: only the SECURITY DEFINER three-argument wrapper below reaches it.
-- The exact door clara._settle_wake_task(uuid,text,text) can settle stale run A after rebind to run
-- B during this drain window; revoke it in the forward D1 only after five-argument terminal and
-- reconciler versions land and every v1 run drains. Each successful compatibility settle audits
-- settled_via='compat_3arg'; a zero count over the drain horizon is the cutover evidence.
create function clara._settle_wake_task_compat(p_task uuid, p_outcome text, p_error_code text)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_status text; v_run text; v_firm uuid;
begin
  select t.status, t.workflow_run_id, t.firm_id into v_status, v_run, v_firm
    from clara.agent_tasks t
   where t.id=p_task and t.kind in (select task_kind from clara.wake_engine_sources)
   for update;
  if not found then
    raise exception 'no wake-engine task % to settle', p_task using errcode='CLR10';
  end if;
  -- Narrow the drain door without breaking any live v1 caller: a terminal task has already ended,
  -- so no frozen terminal/reconciler step has a lawful second settlement left to perform.
  if v_status in ('completed','failed','cancelled','expired') then
    raise exception 'wake task % is already terminal (%)', p_task, v_status
      using errcode='CLR10', detail='{"reason":"wake_task_not_live"}';
  end if;
  perform clara._settle_wake_task_cas(p_task=>p_task, p_outcome=>p_outcome,
    p_error_code=>p_error_code, p_expect_run=>v_run, p_expect_status=>v_status);
  perform clara._audit(v_firm, null, null, null, '_settle_wake_task', null,
    jsonb_build_object('task_id', p_task, 'settled_via', 'compat_3arg'));
end $$;
revoke all on function clara._settle_wake_task_compat(uuid,text,text) from public;
comment on function clara._settle_wake_task_compat(uuid,text,text) is
  'G1 PR-2a PRIVATE compatibility body for frozen v1 callers: locks the current row and derives
   expectations, intentionally preserving the legacy skip for a live task, refuses a terminal
   replay, and audits settled_via=compat_3arg. After the D1 cutover deploys new terminal-step and
   reconciler versions and the compat audit count stays zero through the drain horizon, revoke the
   three-argument clara._settle_wake_task door and remove this body in a forward migration.';

-- The pre-existing door, CoR-ed in place: same signature, same ACL, same callers. Its whole body is
-- now the delegation, so there is ONE implementation of the settle and no second place for the
-- lock, the kind domain or the first-write-wins rule to drift.
create or replace function clara._settle_wake_task(p_task uuid, p_outcome text, p_error_code text)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._settle_wake_task_compat(p_task, p_outcome, p_error_code);
end $$;
-- ACL unmoved by this CoR (same signature): 0133 granted it to clara_runtime and nobody else.
-- Re-stated rather than assumed, and the tail proves the roster is still exactly that.
revoke all on function clara._settle_wake_task(uuid,text,text) from public;
grant execute on function clara._settle_wake_task(uuid,text,text) to clara_runtime;

-- The deploy principal is restored here, BEFORE the census, so every ACL and ownership assertion
-- below reads the catalogue as an outside caller sees it rather than from inside the owner role.
reset role;

-- =================================================================================================
-- §H · TAIL CENSUS — re-read the LIVE catalog and say what was found. A tail that only says "OK"
-- has proven nothing (db-migrations rule), so every claim below is a measurement whose failure
-- aborts the whole file.
-- =================================================================================================
do $tail$
declare
  v_sig text; v_n int; v_txt text; v_new text; v_old text; v_stripped text;
  v_gate_lines int; v_changed int := 0; v_kept int := 0; v_probe text;
  v_bank_sigs text[] := array[
    'clara.wake_add_bank_account(uuid,text,uuid,text,text,text,text,jsonb,text,text)',
    'clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)',
    'clara.wake_complete_bank_reconciliation(uuid,uuid[],text,jsonb,text,text)',
    'clara.wake_get_bank_pack(uuid,uuid,text,jsonb,text)',
    'clara.wake_match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)',
    'clara.wake_propose_bank_identifier_promotion(uuid,uuid,text,text,integer,text,jsonb,text,text)',
    'clara.wake_propose_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)',
    'clara.wake_resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,jsonb,text,text,boolean)',
    'clara.wake_resolve_bank_line_exception(uuid,text,text,uuid,text,jsonb,text,text)',
    'clara.wake_settle_from_bank_line(uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,jsonb,text,text)',
    'clara.wake_unmatch_bank_match(uuid,uuid,text,text,jsonb,text,text)',
    'clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)',
    'clara.wake_void_bank_reconciliation(uuid,text,text,jsonb,text,text)',
    'clara.wake_void_bank_statement(uuid,uuid,text,text,jsonb,text,text)'];
  v_keep_sigs text[] := array[
    'clara.wake_context()', 'clara._wake_task_id()', 'clara._wake_cred_full()',
    'clara._agent_wake_ctx(uuid,text,jsonb)',
    'clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamp with time zone)',
    'clara._agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)',
    'clara._agent_abandon_close_core(jsonb,uuid,text,text,jsonb,text)',
    'clara._abandon_close_core(uuid,uuid,uuid,text,text)', 'clara.abandon_close(uuid,text,text)',
    'clara._tf_agent_task_update()', 'clara._tf_agent_task_insert()',
    'clara._tf_wakes_outbox_update()', 'clara._tf_close_runs_lifecycle()',
    'clara.cancel_agent_task(uuid,text)', 'clara.set_wake_source_enabled(text,boolean,text,text)',
    'clara.assert_wake_allowed(text,text)', 'clara.close_prep_due()'];
  v_call_kinds text[] := array['document_extraction','chat','unattended_posting','freeform_read',
    'interview_extraction','filing_attribution','web_fetch','tier1_policy_fetch','reporting'];
  v_error_codes text[] := array['model_error','tool_error','timeout','engine_lost','limit','internal'];
  v_mint_walls text[] := array[
    'bad wake_kind', 'unknown firm', 'on_behalf_of must be an active bookkeeper+ of the firm',
    'autodraft wake requires a firm-congruent active client and no on_behalf_of',
    'interactive_client wake requires a firm-congruent active client',
    'bank_agent wake requires a firm-congruent active client and no on_behalf_of',
    'close_prep wake requires a firm-congruent active client and no on_behalf_of',
    'filing wake requires no client binding (attribution has no client yet)',
    'legacy wake kinds do not accept a client binding'];
begin
  -- H1 · THE FOURTEEN, by RE-SUBSTITUTION. Each new body must (a) differ from its pin, (b) carry
  -- EXACTLY ONE gate line, and (c) become byte-identical to the pin once that one line is deleted.
  -- (c) is the claim that matters: a sha comparison proves "changed", only re-substitution proves
  -- "changed by exactly this and nothing else".
  foreach v_sig in array v_bank_sigs loop
    if to_regprocedure(v_sig) is null then
      raise exception 'g1_pr2a tail: % no longer resolves', v_sig using errcode='CLR10';
    end if;
    select p.prosrc into v_new from pg_proc p where p.oid = v_sig::regprocedure;
    select s.prosrc into v_old from g1_pr2a_stash s where s.sig = v_sig;
    if v_new = v_old then
      raise exception 'g1_pr2a tail: % is UNCHANGED -- its gate line did not land', v_sig using errcode='CLR10';
    end if;
    select count(*) into v_gate_lines from regexp_matches(v_new, '_bank_wake_task_gate\(', 'g');
    if v_gate_lines <> 1 then
      raise exception 'g1_pr2a tail: % carries % gate call(s), expected exactly 1', v_sig, v_gate_lines using errcode='CLR10';
    end if;
    v_stripped := regexp_replace(v_new, E'\n *perform clara\\._bank_wake_task_gate\\([^;]*\\);', '', 'g');
    if v_stripped is distinct from v_old then
      raise exception 'g1_pr2a tail: %''s delta is NOT the single gate line -- re-substitution does not reproduce the pinned pre-image', v_sig
        using errcode='CLR10';
    end if;
    raise notice 'g1_pr2a D1: % % -> %', v_sig,
      (select s.sha from g1_pr2a_stash s where s.sig=v_sig),
      encode(sha256(convert_to(v_new, 'UTF8')), 'hex');
    v_changed := v_changed + 1;
  end loop;
  if v_changed <> 14 then
    raise exception 'g1_pr2a tail: % bank wrappers recut, expected 14', v_changed using errcode='CLR10';
  end if;

  -- H2 · THE DO-NOT-TOUCH SET, re-pinned BYTE-IDENTICAL. Seventeen bodies this file reasons about
  -- but must not move -- including both abandon doors (the roster ships as a carrier, §D) and
  -- _tf_agent_task_update (the transition matrix is 0133's and stays 0133's).
  foreach v_sig in array v_keep_sigs loop
    select p.prosrc into v_new from pg_proc p where p.oid = v_sig::regprocedure;
    select s.prosrc into v_old from g1_pr2a_stash s where s.sig = v_sig;
    if v_new is distinct from v_old then
      raise exception 'g1_pr2a tail: DO-NOT-TOUCH body % moved', v_sig using errcode='CLR10';
    end if;
    v_kept := v_kept + 1;
  end loop;
  if v_kept <> 17 then
    raise exception 'g1_pr2a tail: % do-not-touch bodies re-pinned, expected 17', v_kept using errcode='CLR10';
  end if;

  -- H3 · §E's two minters. Changed genuinely, and every pre-existing wall in mint_wake_credential
  -- survives -- enumerated, because "it still works" is not something a sha can say.
  select p.prosrc into v_new from pg_proc p
    where p.oid = 'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  select s.prosrc into v_old from g1_pr2a_stash s where s.sig = 'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)';
  if v_new = v_old then raise exception 'g1_pr2a tail: mint_wake_credential is unchanged' using errcode='CLR10'; end if;
  foreach v_txt in array v_mint_walls loop
    if position(v_txt in v_new) = 0 then
      raise exception 'g1_pr2a tail: mint_wake_credential LOST its wall "%"', v_txt using errcode='CLR10';
    end if;
  end loop;
  if position('bank_agent_task_absent' in v_new) = 0 or position('bank_agent_task_ambiguous' in v_new) = 0
     or position('agent_task_id' in v_new) = 0 or position('wake_intents' in v_new) = 0
     or position('domain_events' in v_new) = 0 or position('bank.agent_due' in v_new) = 0 then
    raise exception 'g1_pr2a tail: mint_wake_credential did not gain the source-identity task binding' using errcode='CLR10';
  end if;
  raise notice 'g1_pr2a D1: % % -> %',
    'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)',
    (select s.sha from g1_pr2a_stash s where s.sig='clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'),
    encode(sha256(convert_to(v_new, 'UTF8')), 'hex');
  select p.prosrc into v_new from pg_proc p
    where p.oid = 'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)'::regprocedure;
  select s.prosrc into v_old from g1_pr2a_stash s
    where s.sig='clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)';
  if v_new = v_old then
    raise exception 'g1_pr2a tail: mint_wake_credential_for_task is unchanged' using errcode='CLR10';
  end if;
  if position('''close_prep'', ''bank_agent''' in v_new) = 0
     or position('wake_engine_sources' in v_new) = 0
     or position('wake_task_source_mismatch' in v_new) = 0
     or position('wake_task_not_live' in v_new) = 0 then
    raise exception 'g1_pr2a tail: mint_wake_credential_for_task did not gain bank source identity + live-status enforcement' using errcode='CLR10';
  end if;
  raise notice 'g1_pr2a D1: % % -> %',
    'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)',
    (select s.sha from g1_pr2a_stash s where s.sig='clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)'),
    encode(sha256(convert_to(v_new, 'UTF8')), 'hex');
  -- Both minters keep their exact prior ACL: clara_fn_owner (owner) + clara_runtime, nobody else.
  for v_sig in select unnest(array['clara.mint_wake_credential(text,uuid,uuid,interval,uuid)',
                                   'clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)']) loop
    select count(*) into v_n from pg_roles r
      where r.rolname like 'clara\_%' and has_function_privilege(r.rolname, v_sig::regprocedure, 'EXECUTE');
    if v_n <> 2 or not has_function_privilege('clara_runtime', v_sig::regprocedure, 'EXECUTE') then
      raise exception 'g1_pr2a tail: %''s ACL is % clara role(s), expected exactly {clara_fn_owner, clara_runtime}', v_sig, v_n
        using errcode='CLR10';
    end if;
  end loop;

  -- H3b · 0138's close gate is the eighteenth D1 body. It must now be VOLATILE (a row-locking
  -- function cannot truthfully claim STABLE), preserve its old ladder, take FOR UPDATE only on
  -- writes, name all six FOLD-2 reads, and keep its exact prestate ACL.
  select p.prosrc, p.provolatile::text into v_new, v_probe from pg_proc p
    where p.oid = 'clara._close_wake_ctx(text,text,uuid,text)'::regprocedure;
  select s.prosrc into v_old from g1_pr2a_stash s
    where s.sig = 'clara._close_wake_ctx(text,text,uuid,text)';
  if v_new = v_old then
    raise exception 'g1_pr2a tail: _close_wake_ctx is unchanged' using errcode='CLR10';
  end if;
  if v_probe is distinct from 'v' or position('for update of t' in lower(v_new)) = 0
     or position('wake_task_not_live' in v_new) = 0
     or position('wake_engine_sources' in v_new) = 0 then
    raise exception 'g1_pr2a tail: _close_wake_ctx lacks VOLATILE, the write-row lock, registry identity, or the live-task refusal'
      using errcode='CLR10';
  end if;
  foreach v_txt in array array['wake_list_fiscal_years','wake_get_close_plan','wake_get_close_readiness',
                               'wake_verify_close','wake_snapshot_state','wake_dry_run_close_readiness'] loop
    if position(v_txt in v_new) = 0 then
      raise exception 'g1_pr2a tail: _close_wake_ctx lost FOLD-2 read verb %', v_txt using errcode='CLR10';
    end if;
  end loop;
  select count(*) into v_n from pg_roles r
    where r.rolname like 'clara\_%'
      and has_function_privilege(r.rolname, 'clara._close_wake_ctx(text,text,uuid,text)'::regprocedure, 'EXECUTE');
  if v_n::text is distinct from (select v from g1_pr2a_pre where k='close_ctx_acl_clara_role_count') then
    raise exception 'g1_pr2a tail: _close_wake_ctx ACL moved from % clara role(s) to %',
      (select v from g1_pr2a_pre where k='close_ctx_acl_clara_role_count'), v_n using errcode='CLR10';
  end if;
  raise notice 'g1_pr2a D1: % % -> %', 'clara._close_wake_ctx(text,text,uuid,text)',
    (select s.sha from g1_pr2a_stash s where s.sig='clara._close_wake_ctx(text,text,uuid,text)'),
    encode(sha256(convert_to(v_new, 'UTF8')), 'hex');

  -- H4 · §F's two new helpers exist at exactly one arity each, are UNGRANTED to every application
  -- role, and the gate really does hold a row lock (the text is read, because "FOR UPDATE" is the
  -- entire mechanism and a body that lost it would still pass every other assertion here).
  if to_regprocedure('clara._bank_wake_task_gate(text,uuid,boolean,boolean)') is null
     or to_regprocedure('clara._wake_task_bank_account(uuid)') is null then
    raise exception 'g1_pr2a tail: a §F helper is absent' using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='clara' and p.proname in ('_bank_wake_task_gate','_wake_task_bank_account','_drafted_prose_within');
  if v_n <> 3 then
    raise exception 'g1_pr2a tail: % helper overload(s) live, expected exactly 3 (one arity each)', v_n using errcode='CLR10';
  end if;
  -- OWNERSHIP, read positively. A SECURITY DEFINER function owned by the deploy principal would
  -- run as a SUPERUSER -- the gate would then be a privilege escalation rather than a wall, and
  -- nothing else in this census would notice. The two CoR-ed existing helpers are included by
  -- their exact signatures even though CREATE OR REPLACE is expected to preserve ownership.
  for v_sig in select unnest(array['clara._bank_wake_task_gate(text,uuid,boolean,boolean)',
                                   'clara._wake_task_bank_account(uuid)',
                                   'clara._drafted_prose_within(jsonb,integer)',
                                   'clara._close_wake_ctx(text,text,uuid,text)',
                                   'clara._settle_wake_task(uuid,text,text)',
                                   'clara._settle_wake_task_cas(uuid,text,text,text,text)',
                                   'clara._settle_wake_task_compat(uuid,text,text)',
                                   'clara._tf_close_abandon_reason_lifecycle()',
                                   'clara._tf_close_run_reason_active()']) loop
    select pg_get_userbyid(p.proowner) into v_txt from pg_proc p where p.oid = v_sig::regprocedure;
    if v_txt is distinct from 'clara_fn_owner' then
      raise exception 'g1_pr2a tail: % is owned by %, not clara_fn_owner', v_sig, v_txt using errcode='CLR10';
    end if;
  end loop;
  select pg_get_userbyid(c.relowner) into v_txt from pg_class c where c.oid = 'clara.close_abandon_reasons'::regclass;
  if v_txt is distinct from 'clara_fn_owner' then
    raise exception 'g1_pr2a tail: close_abandon_reasons is owned by %, not clara_fn_owner -- its FORCE-RLS owner policy would not bind', v_txt using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_roles r
    where r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner'
      and has_function_privilege(r.rolname, 'clara._bank_wake_task_gate(text,uuid,boolean,boolean)'::regprocedure, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'g1_pr2a tail: _bank_wake_task_gate is EXECUTE-able by % non-owner clara role(s); it must be reachable only from inside the SECURITY DEFINER wrappers', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_new from pg_proc p where p.oid = 'clara._bank_wake_task_gate(text,uuid,boolean,boolean)'::regprocedure;
  if position('for update' in lower(v_new)) = 0 then
    raise exception 'g1_pr2a tail: _bank_wake_task_gate does not take FOR UPDATE -- the TOCTOU is not closed' using errcode='CLR10';
  end if;
  foreach v_txt in array array['wake_task_unbound','wake_task_not_running','wake_task_account_unbound',
                               'wake_task_account_incongruent','wake_task_account_mismatch',
                               'wake_act_account_unresolved','wake_task_kind_mismatch',
                               'wake_task_source_mismatch','wake_task_incongruent'] loop
    if position(v_txt in v_new) = 0 then
      raise exception 'g1_pr2a tail: _bank_wake_task_gate is missing rostered reason "%"', v_txt using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_txt from pg_proc p where p.oid='clara._wake_task_bank_account(uuid)'::regprocedure;
  if position('wake_intents' in v_txt)=0 or position('domain_events' in v_txt)=0
     or position('wake_engine_sources' in v_txt)=0 or position('bank.agent_due' in v_txt)=0
     or position('bank_accounts' in v_txt)=0 or position('ba.active' in v_txt)=0
     or position('de.firm_id=t.firm_id' in v_txt)=0 or position('de.client_id=t.client_id' in v_txt)=0
     or position('ba.firm_id=t.firm_id' in v_txt)=0 or position('ba.client_id=t.client_id' in v_txt)=0 then
    raise exception 'g1_pr2a tail: _wake_task_bank_account does not prove source + active account identity and task/firm/client congruence'
      using errcode='CLR10';
  end if;

  -- H5 · §G's strict CAS + private drain compatibility. THREE bodies: the strict five-argument
  -- door, the private expectation-deriving compatibility body, and the frozen three-argument
  -- wrapper. The three-argument door is proven to still
  -- resolve BEHAVIOURALLY -- by making the call and reading the refusal it is supposed to give --
  -- rather than by staring at a signature: a 42883 (undefined) or 42725 (ambiguous) here would
  -- surface as a DIFFERENT sqlstate than the CLR10 the body raises, which is exactly the
  -- regression a signature-only read cannot see.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='clara' and p.proname in ('_settle_wake_task','_settle_wake_task_cas','_settle_wake_task_compat');
  if v_n <> 3 then
    raise exception 'g1_pr2a tail: the settle family resolves at % pg_proc row(s), expected exactly 3 (strict, private compat, frozen wrapper)', v_n using errcode='CLR10';
  end if;
  if to_regprocedure('clara._settle_wake_task(uuid,text,text)') is null
     or to_regprocedure('clara._settle_wake_task_cas(uuid,text,text,text,text)') is null
     or to_regprocedure('clara._settle_wake_task_compat(uuid,text,text)') is null then
    raise exception 'g1_pr2a tail: the settle family is not at its expected three signatures' using errcode='CLR10';
  end if;
  begin
    perform clara._settle_wake_task(p_task => '00000000-0000-4000-8000-000000000000'::uuid,
                                    p_outcome => 'completed', p_error_code => null);
    raise exception 'g1_pr2a tail: a three-argument settle of a non-existent task did NOT refuse' using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_probe = message_text;
    if position('no wake-engine task' in v_probe) = 0 then
      raise exception 'g1_pr2a tail: the three-argument settle refused, but with "%" -- not the body''s own refusal', v_probe
        using errcode='CLR10';
    end if;
  end;
  -- The CAS body carries the lock, both conjuncts and 0133's registry-driven kind domain; the
  -- three-argument door carries nothing but the delegation, so there is exactly one place any of
  -- them could drift from.
  select p.prosrc into v_new from pg_proc p where p.oid = 'clara._settle_wake_task_cas(uuid,text,text,text,text)'::regprocedure;
  if position('for update' in lower(v_new)) = 0
     or position('wake_settle_run_mismatch' in v_new) = 0
     or position('wake_settle_status_mismatch' in v_new) = 0
     or position('wake_settle_status_required' in v_new) = 0
     or position('kind in (select task_kind from clara.wake_engine_sources)' in v_new) = 0 then
    raise exception 'g1_pr2a tail: _settle_wake_task_cas is missing the lock, a CAS conjunct, or 0133''s registry-driven kind domain' using errcode='CLR10';
  end if;
  if position('p_expect_run is not null' in lower(v_new)) > 0
     or position('p_expect_status is not null' in lower(v_new)) > 0 then
    raise exception 'g1_pr2a tail: the strict CAS still treats NULL as a wildcard' using errcode='CLR10';
  end if;
  select p.prosrc into v_new from pg_proc p where p.oid = 'clara._settle_wake_task_compat(uuid,text,text)'::regprocedure;
  if position('for update' in lower(v_new)) = 0 or position('_settle_wake_task_cas' in v_new) = 0
     or position('wake_task_not_live' in v_new) = 0 or position('settled_via' in v_new) = 0
     or position('compat_3arg' in v_new) = 0 or position('clara._audit' in v_new) = 0 then
    raise exception 'g1_pr2a tail: the private compatibility body lacks its lock/CAS, terminal refusal, or compat_3arg audit' using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_roles r
    where r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner'
      and has_function_privilege(r.rolname, 'clara._settle_wake_task_compat(uuid,text,text)'::regprocedure, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'g1_pr2a tail: _settle_wake_task_compat is callable by % non-owner clara role(s)', v_n using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p where p.oid = 'clara._settle_wake_task(uuid,text,text)'::regprocedure;
  if position('_settle_wake_task_compat' in v_txt) = 0 or position('_settle_wake_task_cas' in v_txt) > 0
     or position('update clara.agent_tasks' in v_txt) > 0 then
    raise exception 'g1_pr2a tail: the three-argument door must delegate ONLY to the private compatibility body' using errcode='CLR10';
  end if;
  raise notice 'g1_pr2a D1: % % -> %', 'clara._settle_wake_task(uuid,text,text)',
    (select s.sha from g1_pr2a_stash s where s.sig='clara._settle_wake_task(uuid,text,text)'),
    encode(sha256(convert_to(v_txt, 'UTF8')), 'hex');
  -- Both doors on the SAME footing, and the three-argument one's ACL is unmoved from what the
  -- prestate measured (this is a CoR at the same signature, so nothing should have touched it).
  for v_sig in select unnest(array['clara._settle_wake_task(uuid,text,text)',
                                   'clara._settle_wake_task_cas(uuid,text,text,text,text)']) loop
    select count(*) into v_n from pg_roles r
      where r.rolname like 'clara\_%' and has_function_privilege(r.rolname, v_sig::regprocedure, 'EXECUTE');
    if v_n::text is distinct from (select v from g1_pr2a_pre where k = 'settle_acl_clara_role_count')
       or not has_function_privilege('clara_runtime', v_sig::regprocedure, 'EXECUTE') then
      raise exception 'g1_pr2a tail: %''s ACL is % clara role(s), expected the % the prestate measured on the pre-fix settle',
        v_sig, v_n, (select v from g1_pr2a_pre where k = 'settle_acl_clara_role_count') using errcode='CLR10';
    end if;
  end loop;

  -- H6 · §A/§B, extend-only in BOTH directions: every pre-existing member survives AND exactly
  -- the named members were added (a count, so a third smuggled member fails too).
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
    where c.conrelid='clara.llm_usage_events'::regclass and c.conname='ck_llm_usage_events_call_kind';
  foreach v_new in array v_call_kinds loop
    if position('''' || v_new || '''' in v_txt) = 0 then
      raise exception 'g1_pr2a tail: ck_llm_usage_events_call_kind LOST member %', v_new using errcode='CLR10';
    end if;
  end loop;
  if position('''bank_agent''' in v_txt) = 0 or position('''close_prep''' in v_txt) = 0 then
    raise exception 'g1_pr2a tail: ck_llm_usage_events_call_kind did not gain 裁-49''s two members' using errcode='CLR10';
  end if;
  select count(*) into v_n from regexp_matches(v_txt, '''[a-z0-9_]+''::text', 'g');
  if v_n <> array_length(v_call_kinds,1) + 2 then
    raise exception 'g1_pr2a tail: ck_llm_usage_events_call_kind now admits % member(s), expected %', v_n, array_length(v_call_kinds,1)+2 using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
    where c.conrelid='clara.agent_tasks'::regclass and c.conname='agent_tasks_error_code_check';
  foreach v_new in array v_error_codes loop
    if position('''' || v_new || '''' in v_txt) = 0 then
      raise exception 'g1_pr2a tail: the error-code roster LOST member %', v_new using errcode='CLR10';
    end if;
  end loop;
  if position('''all_writes_refused''' in v_txt) = 0 then
    raise exception 'g1_pr2a tail: the error-code roster did not gain all_writes_refused' using errcode='CLR10';
  end if;
  select count(*) into v_n from regexp_matches(v_txt, '''[a-z0-9_]+''::text', 'g');
  if v_n <> array_length(v_error_codes,1) + 1 then
    raise exception 'g1_pr2a tail: the error-code roster now admits % member(s), expected %', v_n, array_length(v_error_codes,1)+1 using errcode='CLR10';
  end if;

  -- H7 · §C, the COUPLED PAIR. Coverage must still be WHOLE over the ENTIRE registry, both halves
  -- moved by exactly +1, no taxonomy version flip, and the type is client_scoped (the producer
  -- contract #437 measured) at the wake-BOUND decision (relay.mjs's own set).
  if exists (select 1 from clara.event_types e
              where not exists (select 1 from clara.trigger_taxonomy t
                                 where t.event_type = e.name and t.version = (select version from clara.taxonomy_active))) then
    raise exception 'g1_pr2a tail: event_type/taxonomy coverage is INCOMPLETE after this file' using errcode='CLR10';
  end if;
  if (select count(*) from clara.event_types) <> (select v::int + 1 from g1_pr2a_pre where k='event_types_total')
     or (select count(*) from clara.trigger_taxonomy) <> (select v::int + 1 from g1_pr2a_pre where k='taxonomy_total')
     or (select count(*) from clara.taxonomy_versions) <> (select v::int from g1_pr2a_pre where k='taxonomy_versions')
     or (select version from clara.taxonomy_active) <> (select v::int from g1_pr2a_pre where k='taxonomy_active_version') then
    raise exception 'g1_pr2a tail: the registry pair did not move by exactly +1/+1 with the active version unmoved' using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.event_types where name='bank.agent_due' and client_scoped) then
    raise exception 'g1_pr2a tail: bank.agent_due is absent or NOT client_scoped -- a firm-level type refuses a client_id and could never produce a runnable task' using errcode='CLR10';
  end if;
  select decision into v_txt from clara.trigger_taxonomy
    where event_type='bank.agent_due' and version=(select version from clara.taxonomy_active);
  if v_txt is distinct from 'internal_task' then
    raise exception 'g1_pr2a tail: bank.agent_due is decisioned %, not internal_task -- only relay.mjs''s three wake-bound decisions mint a wake_intent', v_txt using errcode='CLR10';
  end if;
  -- A real refusal probe: the domain-event gate must STILL refuse an unregistered type. Registering
  -- one name must not have opened a hole, and an absence-only proof would not see it.
  begin
    perform clara._append_event((select id from clara.firms limit 1), 'bank.agent_not_a_real_type',
      null, null, null, null, null, null, null, '{}'::jsonb);
    raise exception 'g1_pr2a tail: an UNREGISTERED event type was ADMITTED -- the registry gate is open' using errcode='CLR10';
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_probe = message_text;
      if position('g1_pr2a tail' in v_probe) > 0 then raise; end if;
    when others then null;   -- no firms on a bare rig: the probe is vacuous, and H7's registration
                             -- assertions above are what carry this section's weight there.
  end;

  -- H8 · §A(b) + 裁-40's standing precondition, re-read.
  select login_pool into v_txt from clara.wake_engine_sources where source_key='close_prep';
  if v_txt is distinct from 'write' then
    raise exception 'g1_pr2a tail: close_prep.login_pool is %, expected 裁-49''s ''write''', v_txt using errcode='CLR10';
  end if;
  select login_pool into v_txt from clara.wake_engine_sources where source_key='bank_agent';
  if v_txt is distinct from 'bank' then
    raise exception 'g1_pr2a tail: bank_agent.login_pool moved to % -- this file must not touch it', v_txt using errcode='CLR10';
  end if;
  select concat_ws('|', carrier, event_type, task_kind, wake_kind) into v_txt
    from clara.wake_engine_sources where source_key='bank_agent';
  if v_txt is distinct from 'wake_outbox|bank.agent_due|wake|bank_agent' then
    raise exception 'g1_pr2a tail: bank_agent source identity is %, not wake_outbox|bank.agent_due|wake|bank_agent', v_txt
      using errcode='CLR10';
  end if;
  if (select count(*) from clara.wake_engine_sources) <> 2
     or exists (select 1 from clara.wake_engine_sources where enabled) then
    raise exception 'g1_pr2a tail: wake_engine_sources is not exactly G1''s two rows, both DISABLED -- 裁-40 keeps the flip as the owner''s own ceremony' using errcode='CLR10';
  end if;

  -- H9 · §D. The caps are present and NAMED (a length term hidden inside a renamed constraint is
  -- not the same wall), the pre-existing non-blank guards are UNTOUCHED, and the roster table has
  -- the forced-RLS posture every new table owes.
  foreach v_txt in array array['ck_bap_rationale_len','ck_bap_payload_prose_len','ck_cp_narrative_len',
                               'ck_cp_rationale_len','ck_cp_drafted_text_len','ck_close_runs_end_reason_len',
                               'ck_close_runs_end_reason_code_abandoned'] loop
    if not exists (select 1 from pg_constraint where conname = v_txt) then
      raise exception 'g1_pr2a tail: % is absent', v_txt using errcode='CLR10';
    end if;
  end loop;
  foreach v_txt in array array['bank_agent_proposals_rationale_check','close_proposals_narrative_check',
                               'close_proposals_rationale_check','close_proposals_drafted_check'] loop
    if not exists (select 1 from pg_constraint where conname = v_txt) then
      raise exception 'g1_pr2a tail: pre-existing guard % was dropped', v_txt using errcode='CLR10';
    end if;
  end loop;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='clara.close_abandon_reasons'::regclass) then
    raise exception 'g1_pr2a tail: close_abandon_reasons does not have RLS enabled AND forced' using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_policy where polrelid='clara.close_abandon_reasons'::regclass;
  if v_n <> 2 then
    raise exception 'g1_pr2a tail: close_abandon_reasons carries % policy(ies), expected the owner/read pair', v_n using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.close_abandon_reasons;
  if v_n <> 10 or not exists (select 1 from clara.close_abandon_reasons where code='other') then
    raise exception 'g1_pr2a tail: the abandonment roster holds % row(s), expected the ruled 10 including ''other''', v_n using errcode='CLR10';
  end if;
  if not (has_table_privilege('clara_authenticated', 'clara.close_abandon_reasons', 'SELECT')
          and has_table_privilege('clara_runtime', 'clara.close_abandon_reasons', 'SELECT')) then
    raise exception 'g1_pr2a tail: the two granted roles cannot read close_abandon_reasons' using errcode='CLR10';
  end if;
  if has_table_privilege('public', 'clara.close_abandon_reasons', 'SELECT') then
    raise exception 'g1_pr2a tail: close_abandon_reasons is PUBLIC-readable' using errcode='CLR10';
  end if;
  if exists (select 1 from pg_roles r where r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner'
              and (has_table_privilege(r.rolname, 'clara.close_abandon_reasons', 'INSERT')
                   or has_table_privilege(r.rolname, 'clara.close_abandon_reasons', 'UPDATE')
                   or has_table_privilege(r.rolname, 'clara.close_abandon_reasons', 'DELETE'))) then
    raise exception 'g1_pr2a tail: a non-owner clara role holds DML on close_abandon_reasons' using errcode='CLR10';
  end if;
  select count(*) into v_n
    from pg_trigger t
   where not t.tgisinternal and t.tgenabled <> 'D'
     and ((t.tgrelid='clara.close_abandon_reasons'::regclass
           and t.tgname in ('t_close_abandon_reasons_lifecycle','t_close_abandon_reasons_no_truncate'))
       or (t.tgrelid='clara.close_runs'::regclass and t.tgname='t_close_run_reason_active'));
  if v_n <> 3 then
    raise exception 'g1_pr2a tail: the close-abandon lifecycle has % enabled trigger(s), expected exactly 3', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
    where p.oid='clara._tf_close_abandon_reason_lifecycle()'::regprocedure;
  if position('close_abandon_reason_immutable' in v_txt)=0
     or position('TRUNCATE' in v_txt)=0 or position('new.active is distinct from false' in v_txt)=0 then
    raise exception 'g1_pr2a tail: the close-abandon roster lifecycle body lost immutable/delete/truncate/retire enforcement'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_txt from pg_proc p
    where p.oid='clara._tf_close_run_reason_active()'::regprocedure;
  if position('close_abandon_reason_inactive' in v_txt)=0 or position('r.active' in v_txt)=0 then
    raise exception 'g1_pr2a tail: the close-run reason body no longer requires active on a new assignment'
      using errcode='CLR10';
  end if;
  if (select count(*) from clara.close_runs where end_reason_code is not null) <> 0 then
    raise exception 'g1_pr2a tail: close_runs.end_reason_code is populated -- this file writes no row' using errcode='CLR10';
  end if;

  -- H10 · THE COUNTS THIS FILE MUST NOT HAVE MOVED. Not a formality: §A and §B DROP and re-ADD two
  -- CHECKs over populated tables, and a re-add that silently dropped rows would show up nowhere
  -- else. The held-wake count is 0133's own stranded-row premise, re-proven.
  foreach v_txt in array array['held_wake_rows','agent_tasks_rows','llm_usage_rows','close_runs_rows',
                               'wake_credentials_rows','allowlist_bank_rows'] loop
    v_n := case v_txt
      when 'held_wake_rows' then (select count(*) from clara.agent_tasks where kind='wake' and status='held')
      when 'agent_tasks_rows' then (select count(*) from clara.agent_tasks)
      when 'llm_usage_rows' then (select count(*) from clara.llm_usage_events)
      when 'close_runs_rows' then (select count(*) from clara.close_runs)
      when 'wake_credentials_rows' then (select count(*) from clara.wake_credentials)
      when 'allowlist_bank_rows' then (select count(*) from clara.wake_fn_allowlist where wake_kind='bank_agent')
      end;
    if v_n::text is distinct from (select v from g1_pr2a_pre where k = v_txt) then
      raise exception 'g1_pr2a tail: % moved from % to %', v_txt, (select v from g1_pr2a_pre where k = v_txt), v_n using errcode='CLR10';
    end if;
  end loop;

  raise notice 'g1_pr2a tail: OK -- D1 INVENTORY = 18 REPLACED WRITER BODIES: the FOURTEEN bank wake wrappers (each delta proven by surgical re-substitution), clara.mint_wake_credential, clara.mint_wake_credential_for_task (one generic live-status wall for both exact-mint kinds), clara._close_wake_ctx (0138 recut to lock and require a live task for writes while the six FOLD-2 reads remain available after cancellation), and clara._settle_wake_task (same three-argument signature, delegating only to the private compatibility body). The 17 DO-NOT-TOUCH bodies re-pin BYTE-IDENTICAL; exact before/after prosrc shas are emitted by the eighteen D1 notices above. DRAIN-WINDOW RESIDUAL: clara._settle_wake_task(uuid,text,text) can settle stale run A after rebind to run B until five-argument terminal/reconciler versions land and v1 drains; every successful short-door call audits settled_via=compat_3arg, and a zero count through the drain horizon triggers the forward D1 revocation. NEW, ALL SEVEN BODIES: clara._bank_wake_task_gate, clara._wake_task_bank_account, clara._drafted_prose_within, clara._settle_wake_task_cas, clara._settle_wake_task_compat, clara._tf_close_abandon_reason_lifecycle, clara._tf_close_run_reason_active. ROSTERS, EXTEND-ONLY AND NOT CLOSED: ck_llm_usage_events_call_kind has 11 members after this file and agent_tasks_error_code_check has 7; 裁-44''s tax_prep is the named successor. PRODUCER: bank.agent_due is registered in both coupled registries as client_scoped=true / internal_task (there were % internal_task rows before), with coverage whole and taxonomy version unmoved. PROSE: 7 new CHECKs; close_abandon_reasons ships 10 forced-RLS rows and close_runs.end_reason_code stays empty and writerless by design. UNMOVED: both wake sources remain disabled, bank_agent.login_pool=bank, % held wake row(s), and all six pinned row counts. NAMED RUNTIME FOLLOW-UPS, unchanged: (1) repoint mintBankAgentCredential at the exact task minter; (2) repoint BANK_AGENT_CALL_KIND / CLOSE_PREP_CALL_KIND; (3) settle all_writes_refused where FOLD-3 uses internal; (4) cut new versions of both terminal steps and both reconciler belts onto the strict CAS, then revoke the three-argument door after its measured drain; (5) plumb p_reason_code through both abandon doors. NOT SHIPPED: bank_agent_run_due, the close_prep task producer, or a cadence column. No table in workflow/graphile_worker/spike touched.',
    (select v from g1_pr2a_pre where k='internal_task_rows_before'),
    (select v from g1_pr2a_pre where k='held_wake_rows');
end $tail$;
