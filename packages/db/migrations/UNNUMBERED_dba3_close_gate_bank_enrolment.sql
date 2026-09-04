-- =====================================================================================
-- DB-A / 3 of 7 -- clara._close_gate_bank_items: THE ENROLLED POPULATION AND THE HONEST
-- UNKNOWN (H-55).
--
-- THE LIVE BODY IS 0121:4838's, NOT 0056:1335's. The handover cites the 0056 birth text;
-- migration 0121 (F-A3 PR-1b, X-1) CoR'd this body to add arm 4, and a file authored against
-- the 0056 text would have silently DELETED that repair. Chased with
-- `grep 'function clara._close_gate_bank_items'` across every migration -- exactly two hits,
-- 0056:1335 and 0121:4838 -- and confirmed by a full 0001->0164 rig replay whose prosrc sha
-- is the one pinned in the prestate below.
--
-- WHAT 0121 ALREADY FIXED, AND MUST SURVIVE THIS FILE. Arm 4 reads
-- clara._bank_registry_ledger_state and fails the gate on a `gap` or `not_evaluable`
-- verdict, so a client with a flagged COA bank account and no registered clara.bank_accounts
-- row, or with a zero registry and no declared banking_arrangement fact, can no longer pass.
-- That arm is carried into the body below VERBATIM and the tail re-reads it from pg_proc.
--
-- WHAT IS STILL WRONG, AND IT IS THE HALF THAT MATTERS MOST. The statement-gap universe is
--     select distinct s.bank_account_id from clara.bank_statements s
--      where s.client_id = p_client and s.status <> 'void'
-- -- derived FROM THE STATEMENTS THEMSELVES. An account with zero statements contributes zero
-- rows to that universe, so it can produce zero gaps. A client who has REGISTERED an active
-- bank account and ingested not one statement all year therefore reads registry_state
-- 'clear' (arm c: the registry IS populated, nothing is deactivated-and-unbound),
-- statement_gaps = [] and open_exceptions = [] -- and the gate answers PASS. The one input
-- that matters most to a bank reconciliation is the one the gate cannot say no about. The
-- 0056:1354 comment states the boundary out loud ("for an account that has statements at
-- all"), so it is a recorded boundary rather than an accident; a recorded boundary that
-- reads `pass` is still a gate that passes because it cannot see.
--
-- WHY THE VERDICT IS `unknown` AND NOT `fail`. An enrolled account with no statements at all
-- is not a MEASUREMENT of unreconciled items -- there are no lines that could be unmatched.
-- It is the absence of the evidence this gate reads. clara._close_gate_undated established
-- exactly this idiom in exactly this drawer (0104:355-360) and clara._measure_one_gate maps
-- 'unknown' through unchanged (0161:391). Drawer 2 treats unknown like fail for ADMISSION
-- while leaving the per-item attested path open -- so the close still stops, and the
-- professional signs a statement that is TRUE ("I could not measure this") instead of one
-- that is false ("there is nothing outstanding here").
--
-- D1: a STABLE SECURITY DEFINER reader. No audited writer body is replaced, so no
-- write-quiesce window is owed. accounts_basis and unmatched_lines_basis both move, which is
-- what makes a measured_digest taken before this deploy distinguishable from one after.
-- =====================================================================================

-- Precautionary, not load-bearing: one CREATE OR REPLACE and one new helper, no data moved.
set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- PRESTATE
-- =====================================================================================
do $dba3_pre$
declare v_src text; v_got text;
begin
  if to_regprocedure('clara._close_gate_bank_items(uuid,uuid)') is null then
    raise exception 'dba3 prestate: clara._close_gate_bank_items does not resolve' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._bank_registry_ledger_state(uuid,date)') is null then
    raise exception 'dba3 prestate: clara._bank_registry_ledger_state is absent -- 0121''s X-1 has not been applied and arm 4 below would call a body that does not exist'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._bank_enrolled_fy_months(uuid,date,date)') is not null then
    raise exception 'dba3 prestate: clara._bank_enrolled_fy_months already exists -- already applied to this database'
      using errcode = 'CLR10';
  end if;

  -- THE PRE-IMAGE PIN. Measured on a full 0001->0164 rig replay while authoring this file
  -- (DB-A lane, 2026-09-04), against the 0121 body. A mismatch means a frontier moved this
  -- body again and the "verbatim" claims below were read from text that is no longer live.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._close_gate_bank_items(uuid,uuid)'::regprocedure;
  v_got := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_got <> 'b60907e94ab0de3328a78482aadd83f9f81aa23e0ad27e0b88ed23db03986487' then
    raise exception 'dba3 prestate: _close_gate_bank_items prosrc sha256 is % -- not the 0121 body this file was authored against. STOP.', v_got
      using errcode = 'CLR10';
  end if;

  -- THE REPAIR THIS FILE MUST CARRY, witnessed in the live body BEFORE it is replaced. The
  -- F-A3/PR-1b lesson: a "verbatim" claim is only as good as the text it was read from.
  if position('_bank_registry_ledger_state' in v_src) = 0
     or position('no_registered_account' in v_src) = 0 then
    raise exception 'dba3 prestate: the live body does not carry 0121''s arm 4 -- the replacement would DELETE a repair this file cannot see'
      using errcode = 'CLR10';
  end if;
  -- THE DEFECT, witnessed as present rather than assumed. If the statement-derived universe
  -- is already gone, someone else fixed this and the body below is not an improvement.
  if position('select distinct s.bank_account_id from clara.bank_statements s' in v_src) = 0 then
    raise exception 'dba3 prestate: the live body does not carry the statement-derived gap universe H-55 names -- the defect this file repairs is not present as described'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.close_gate_checks k
                  where k.check_key = 'open_bank_recon_items'
                    and k.evaluator_fn = 'clara._close_gate_bank_items' and k.drawer = 2) then
    raise exception 'dba3 prestate: the open_bank_recon_items catalog row does not name clara._close_gate_bank_items in drawer 2'
      using errcode = 'CLR10';
  end if;
  raise notice 'dba3 prestate: clean -- the live body is 0121''s (sha pinned), arm 4 is present and the statement-derived gap universe is present; the enrolled helper does not exist yet.';
end $dba3_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- S1 -- clara._bank_enrolled_fy_months : THE ENROLLED GAP UNIVERSE, DEFINED ONCE.
--
-- The repair needs the same (account, month) population in two places -- the accounts with
-- NO statement at all, and the month gaps of the accounts that have some -- so it is defined
-- once rather than written twice and drifted later.
--
-- THE WINDOW IS PER ACCOUNT, and that is not a nicety. A universe that gave every enrolled
-- account all twelve months would report January-June gaps for an account registered in
-- July: a false FAIL on every mid-year registration, which is exactly the noise that teaches
-- people to attest past a gate without reading it. An account owes statements from the month
-- it was registered to the month it was deactivated, clipped to the year.
--
-- THE CLOCK IS MYT, matching _close_gate_undated's own bound (0104:365-368): created_at and
-- deactivated_at are timestamptz and this population feeds measured_digest, so a
-- session-dependent rendering would make one signed attestation read differently from
-- another connection.
--
-- A DEACTIVATED ACCOUNT IS NOT EXCLUDED, it is CLIPPED. The months it was live are months it
-- still owes statements for; deactivating an account does not retire the year it operated in.
-- =====================================================================================
create function clara._bank_enrolled_fy_months(p_client uuid, p_starts_on date, p_ends_on date)
  returns table (bank_account_id uuid, m date)
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  select ba.id, gs::date
    from clara.bank_accounts ba
    cross join lateral generate_series(
      greatest(date_trunc('month', p_starts_on),
               date_trunc('month', (ba.created_at at time zone 'Asia/Kuala_Lumpur')::date)),
      least(date_trunc('month', p_ends_on),
            date_trunc('month', coalesce((ba.deactivated_at at time zone 'Asia/Kuala_Lumpur')::date,
                                         p_ends_on))),
      interval '1 month') gs
   where ba.client_id = p_client
     and (ba.created_at at time zone 'Asia/Kuala_Lumpur')::date <= p_ends_on
     and (ba.deactivated_at is null
          or (ba.deactivated_at at time zone 'Asia/Kuala_Lumpur')::date >= p_starts_on);
$fn$;
revoke all on function clara._bank_enrolled_fy_months(uuid, date, date) from public;
comment on function clara._bank_enrolled_fy_months(uuid, date, date) is
  'The (bank account, month) pairs a client OWES a statement for inside a fiscal year, derived from clara.bank_accounts -- the REGISTRY -- and never from the statements themselves. Each account contributes only the months it was actually enrolled, clipped to the year. Read by clara._close_gate_bank_items for both its no-statement arm and its gap arm (H-55, DB-A 2026-09-04).';

-- =====================================================================================
-- S2 -- clara._close_gate_bank_items.
--
-- 0121:4838's body with arm 1 (exceptions) and arm 4 (the registry ledger) carried verbatim,
-- the gap arm re-based on the registry instead of on the statements, ARM 0 added, and a
-- THIRD population added: the enrolled accounts this year holds no statement for at all.
--
-- WHY THE TWO POPULATIONS ARE SEPARATE and not one long gap list. An account with January to
-- June statements and nothing after is a MEASURED finding -- six months are missing and the
-- gate says fail, naming them. An account with nothing at all is not a measurement of
-- anything; folding it into the gap list would dress an unanswerable question up as twelve
-- findings and hide, behind a plausible number, the fact that nobody has looked.
--
-- ARM 4 AND POPULATION A ANSWER DIFFERENT QUESTIONS, which is why both are needed: arm 4
-- asks whether the REGISTRY can be trusted at all (a flagged COA account with no active
-- binding, or a zero registry nobody declared); population A asks whether a registry we
-- already trust has actually been fed.
--
-- THE LADDER'S ORDER IS A JUDGEMENT, stated: a DEFINITE finding outranks an unmeasurable
-- one, so a client with one gapped account and one statement-less account reads `fail`.
-- Nothing is hidden by that precedence -- both populations ride in the payload either way.
-- =====================================================================================
create or replace function clara._close_gate_bank_items(p_client uuid, p_fy uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  v_fy record; v_exceptions jsonb; v_gaps jsonb; v_registry jsonb; v_state text;
  v_no_statements jsonb;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- ARM 0 -- FAIL CLOSED ON THE MISSING FISCAL YEAR (_close_gate_undated's ARM-0, 0104:355,
  -- and new here). Without it starts_on and ends_on are NULL, every population below is
  -- empty, and the gate answers `pass` about a year it could not find -- the same
  -- absence-read-as-evidence shape this whole file exists to close.
  if v_fy.id is null then
    -- EVERY KEY HERE IS NULL OR EMPTY ON PURPOSE, `no_registered_account` INCLUDED. Returning
    -- `false` for it would assert that the registry is fine -- a claim about something this
    -- arm never measured, in the one payload whose whole point is that nothing was measured.
    return jsonb_build_object('state', 'unknown', 'reason', 'fiscal_year_not_found',
      'open_exceptions', '[]'::jsonb, 'statement_gaps', '[]'::jsonb,
      'no_statements', '[]'::jsonb, 'not_measurable', true,
      'registry_state', null, 'no_registered_account', null,
      'accounts_basis', 'enrolled_bank_accounts_v1',
      'unmatched_lines_basis', 'exceptions_gaps_registry_and_enrolment_v1c');
  end if;
  -- OPEN exceptions (the doors: except_bank_line / resolve_bank_line_exception).
  select coalesce(jsonb_agg(jsonb_build_object('exception_id', e.id,
           'statement_id', e.statement_id, 'line_id', e.line_id, 'kind', e.kind)
         order by e.created_at), '[]'::jsonb)
    into v_exceptions
    from clara.bank_line_exceptions e
    join clara.bank_statements st on st.id = e.statement_id
    where e.client_id = p_client and e.resolved_at is null
      -- Scoped to statements that touch THIS fiscal year or earlier (Codex R1 MAJOR 7):
      -- an exception on a NEXT-year statement is not this close's business; an old
      -- unresolved one still is -- unresolved evidence does not age out.
      and st.period_start <= v_fy.ends_on;

  -- H-55, POPULATION A -- ENROLLED ACCOUNTS WITH NO STATEMENT TOUCHING THE YEAR AT ALL.
  -- This population was structurally unreachable by the old body, which derived its accounts
  -- from clara.bank_statements: an account with no statements contributed no rows, so the
  -- gate had nothing to report about it. The accounts now come from the REGISTRY.
  select coalesce(jsonb_agg(jsonb_build_object('bank_account_id', a.bank_account_id)
           order by a.bank_account_id), '[]'::jsonb)
    into v_no_statements
    from (select distinct e.bank_account_id
            from clara._bank_enrolled_fy_months(p_client, v_fy.starts_on, v_fy.ends_on) e) a
   where not exists (select 1 from clara.bank_statements s
           where s.client_id = p_client and s.bank_account_id = a.bank_account_id
             and s.status <> 'void'
             and s.period_start <= v_fy.ends_on and s.period_end >= v_fy.starts_on);

  -- H-55, POPULATION B -- MONTH GAPS, for the enrolled accounts that DO hold at least one
  -- statement in the year. The inner month predicate is 0056/0121's own, unchanged; only the
  -- universe it is taken against moved from the statements to the registry.
  select coalesce(jsonb_agg(jsonb_build_object('bank_account_id', g.bank_account_id,
           'month', to_char(g.m, 'YYYY-MM')) order by g.bank_account_id, g.m), '[]'::jsonb)
    into v_gaps
    from clara._bank_enrolled_fy_months(p_client, v_fy.starts_on, v_fy.ends_on) g
   where exists (select 1 from clara.bank_statements s
           where s.client_id = p_client and s.bank_account_id = g.bank_account_id
             and s.status <> 'void'
             and s.period_start <= v_fy.ends_on and s.period_end >= v_fy.starts_on)
     and not exists (select 1 from clara.bank_statements s2
             where s2.client_id = p_client and s2.bank_account_id = g.bank_account_id
               and s2.status <> 'void'
               and s2.period_start <= (g.m + interval '1 month - 1 day')::date
               and s2.period_end >= g.m);

  -- v1 BOUNDARY, stated (unchanged by this file): unmatched-but-unexcepted LINES are not
  -- enumerated here (arms 1-2's line-keyed repair is PR-1d's, Annex F items 1-2). Recorded
  -- for the as-run record, not discovered later.
  --
  -- ARM 4 (0121's X-1) -- the registry-vs-ledger predicate, carried VERBATIM.
  v_registry := clara._bank_registry_ledger_state(p_client, v_fy.ends_on);
  v_state := case
    when jsonb_array_length(v_exceptions) > 0 or jsonb_array_length(v_gaps) > 0 then 'fail'
    when (v_registry->>'state') in ('gap','not_evaluable') then 'fail'
    -- H-55: LAST, because a definite finding outranks an unmeasurable one -- but never
    -- absent, because the vacuous `pass` here is what this whole file is about.
    when jsonb_array_length(v_no_statements) > 0 then 'unknown'
    else 'pass' end;
  return jsonb_build_object(
    'state', v_state,
    'open_exceptions', v_exceptions, 'statement_gaps', v_gaps,
    'registry_state', v_registry,
    'no_registered_account', (v_registry->>'state') in ('gap','not_evaluable'),
    'no_statements', v_no_statements,
    'not_measurable', jsonb_array_length(v_no_statements) > 0,
    'accounts_basis', 'enrolled_bank_accounts_v1',
    'unmatched_lines_basis', 'exceptions_gaps_registry_and_enrolment_v1c');
end $function$;

reset role;

alter function clara._bank_enrolled_fy_months(uuid, date, date) owner to clara_fn_owner;

-- =====================================================================================
-- TAIL CENSUS
-- =====================================================================================
do $dba3_tail$
declare
  v_src text; v_n int; v_sig text;
  v_firm uuid; v_user uuid; v_client uuid; v_fy uuid; v_acct uuid; v_g jsonb;
begin
  -- (1) SHAPE, read from pg_proc.
  foreach v_sig in array array['clara._close_gate_bank_items(uuid,uuid)',
                               'clara._bank_enrolled_fy_months(uuid,date,date)'] loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_sig::regprocedure and p.prosecdef and p.provolatile = 's'
       and p.proowner = 'clara_fn_owner'::regrole
       and array_to_string(p.proconfig, ',') like '%search_path%';
    if v_n <> 1 then
      raise exception 'dba3 tail: % is not a STABLE SECURITY DEFINER search_path-pinned body owned by clara_fn_owner', v_sig
        using errcode = 'CLR10';
    end if;
    if pg_catalog.has_function_privilege('clara_authenticated', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_agent_ro', v_sig, 'execute')
       or pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute') then
      raise exception 'dba3 tail: % is app-callable -- these are internal evaluators', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (2) ARM 4 SURVIVED, THE DEFECT LEFT, THE NEW UNIVERSE ARRIVED.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._close_gate_bank_items(uuid,uuid)'::regprocedure;
  if position('_bank_registry_ledger_state' in v_src) = 0
     or position('no_registered_account' in v_src) = 0 then
    raise exception 'dba3 tail: 0121''s arm 4 is GONE -- this file deleted a repair it promised to carry'
      using errcode = 'CLR10';
  end if;
  if position('select distinct s.bank_account_id from clara.bank_statements s' in v_src) <> 0 then
    raise exception 'dba3 tail: the statement-derived account universe is still present -- H-55 is NOT fixed'
      using errcode = 'CLR10';
  end if;
  if position('_bank_enrolled_fy_months' in v_src) = 0
     or position('fiscal_year_not_found' in v_src) = 0 then
    raise exception 'dba3 tail: the body does not read the enrolled universe, or lost ARM 0'
      using errcode = 'CLR10';
  end if;

  -- (3) BEHAVIOURAL. The source asserts prove the words landed, never that the gate answers
  -- differently. Fixture shapes are 0146:426-436's probe idiom.
  v_user := gen_random_uuid();
  insert into clara.users(id, display_name) values (v_user, 'dba3 tail probe');
  insert into clara.firms(id, name) values (gen_random_uuid(), 'dba3 tail firm ' || gen_random_uuid())
    returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role, status)
    values (v_firm, v_user, 'viewer', 'active');
  insert into clara.clients(firm_id, name, status)
    values (v_firm, 'dba3 tail client', 'active') returning id into v_client;
  insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
      status, fy_end_source, opened_by)
    values (v_firm, v_client, 'FY2026', date '2026-01-01', date '2026-12-31', 1, 'open',
      'default_1231', v_user) returning id into v_fy;

  -- (3a) THE HONEST EMPTY WORLD, and it must NOT move. A client with no registered account
  -- and a DECLARED no_accounts fact still passes -- there is genuinely nothing to reconcile.
  -- This is the arm er9-close-lifecycle and f-a3-pr1b-tier-c-audit both pin, so it is
  -- re-proven here rather than assumed.
  -- validated_against is the fact key's own declared validator, read from the registry rather
  -- than typed here -- a literal would go stale the day the key's validator changes.
  insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, validated_against,
      basis, basis_kind, recorded_by)
    select v_firm, v_client, 'banking_arrangement', '"no_accounts"'::jsonb, k.validated_against,
      'dba3 tail probe: a genuinely bank-less client', 'owner_instruction', v_user
      from clara.client_fact_keys k where k.fact_key = 'banking_arrangement';
  v_g := clara._close_gate_bank_items(v_client, v_fy);
  if v_g ->> 'state' <> 'pass' then
    raise exception 'dba3 tail (3a): a declared bank-LESS client reads state=% -- the honest empty world must still pass (payload %)', v_g ->> 'state', v_g
      using errcode = 'CLR10';
  end if;

  -- (3b) H-55 ITSELF. Enrol one account, ingest nothing. The old body read `pass`.
  insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type,
      is_active, is_bank_account)
    values (v_client, v_firm, '900-DBA3', 'dba3 tail bank', 'asset', true, true);
  insert into clara.bank_institutions(code, name)
    select 'DBA3BANK', 'dba3 tail institution'
     where not exists (select 1 from clara.bank_institutions where code = 'DBA3BANK');
  insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display,
      account_number, account_number_normalized, coa_account_code, created_by, created_at)
    values (v_firm, v_client, 'DBA3BANK', 'dba3 tail institution', '11112222', '11112222',
      '900-DBA3', v_user, timestamptz '2026-01-05 00:00+08')
    returning id into v_acct;
  v_g := clara._close_gate_bank_items(v_client, v_fy);
  if v_g ->> 'state' <> 'unknown' then
    raise exception 'dba3 tail (3b): an ENROLLED account with zero statements reads state=% -- the vacuous pass is not fixed (payload %)', v_g ->> 'state', v_g
      using errcode = 'CLR10';
  end if;
  if (v_g ->> 'not_measurable')::boolean is not true
     or jsonb_array_length(v_g -> 'no_statements') <> 1
     or (v_g -> 'no_statements' -> 0 ->> 'bank_account_id') <> v_acct::text then
    raise exception 'dba3 tail (3b): the gate says unknown but does not NAME the account it cannot measure (payload %)', v_g
      using errcode = 'CLR10';
  end if;
  if v_g ->> 'accounts_basis' <> 'enrolled_bank_accounts_v1'
     or v_g ->> 'unmatched_lines_basis' <> 'exceptions_gaps_registry_and_enrolment_v1c' then
    raise exception 'dba3 tail (3b): the payload does not carry both moved basis literals (payload %)', v_g
      using errcode = 'CLR10';
  end if;

  -- (3c) THE WINDOW CONTROL. A January registration owes twelve months; a July one owes six.
  -- A universe that ignored the registration date would false-FAIL every mid-year account.
  select count(*)::int into v_n
    from clara._bank_enrolled_fy_months(v_client, date '2026-01-01', date '2026-12-31');
  if v_n <> 12 then
    raise exception 'dba3 tail (3c): a January registration owes % month(s), expected 12', v_n
      using errcode = 'CLR10';
  end if;
  insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type,
      is_active, is_bank_account)
    values (v_client, v_firm, '901-DBA3', 'dba3 tail bank 2', 'asset', true, true);
  insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display,
      account_number, account_number_normalized, coa_account_code, created_by, created_at)
    values (v_firm, v_client, 'DBA3BANK', 'dba3 tail institution', '33334444', '33334444',
      '901-DBA3', v_user, timestamptz '2026-07-10 00:00+08');
  select count(*)::int into v_n
    from clara._bank_enrolled_fy_months(v_client, date '2026-01-01', date '2026-12-31')
   where bank_account_id <> v_acct;
  if v_n <> 6 then
    raise exception 'dba3 tail (3c) CONTROL: a July registration owes % month(s), expected 6 -- the per-account window is not being taken', v_n
      using errcode = 'CLR10';
  end if;

  raise notice 'dba3 tail: OK -- clara._close_gate_bank_items CoR''d and clara._bank_enrolled_fy_months minted; both STABLE SECURITY DEFINER, search_path-pinned, clara_fn_owner-owned and app-callable by NOBODY (authenticated / agent_ro / runtime all refused). 0121''s arm 4 SURVIVED verbatim, the statement-derived account universe is GONE from the body, ARM 0 (fiscal_year_not_found) is present, and the gap arm now reads the registry-derived universe. BEHAVIOURALLY EXERCISED on a planted fixture: a DECLARED bank-less client still reads pass (the honest empty world er9 and f-a3-pr1b-tier-c pin, unmoved); an ENROLLED account with zero statements now reads unknown and NAMES the account in no_statements with not_measurable=true, where the old body read pass; accounts_basis=enrolled_bank_accounts_v1 and unmatched_lines_basis=exceptions_gaps_registry_and_enrolment_v1c both ride the payload so a digest taken before this deploy is distinguishable from one after; a January registration owes 12 months and a July one 6, so the per-account window is real. The close_gate_checks catalog is untouched. No table in workflow/graphile_worker/spike touched. D1: one STABLE reader, no audited writer replaced, no write-quiesce window owed.';

  raise exception using errcode = 'CLR00', message = 'dba3 tail probe rollback';
exception when sqlstate 'CLR00' then
  raise notice 'dba3 tail: the behavioural fixture was rolled back -- nothing this block planted survives.';
end $dba3_tail$;
