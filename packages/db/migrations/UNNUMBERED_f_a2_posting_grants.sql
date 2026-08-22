-- UNNUMBERED_f_a2_posting_grants.sql — F-A2 PR-1, part 2 of 3: THE GRANTED SURFACE.
-- =====================================================================================
-- Number claimed at MERGE time, immediately after part 1's. Design of record:
-- docs/plan/active/f-a2-agentic-posting-design.md v6 §3.1 + Annex B.9 part 2.
--
-- ORDERING OBLIGATION, BINDING AND MECHANICAL. This file applies ONLY after
-- UNNUMBERED_f_a2_posting_core.sql, which creates the ungranted core this wrapper delegates to
-- and the receipt table that core writes. The prestate probes both by exact form and REFUSES
-- rather than proceeding on a wrong premise, so a wrong merge order fails loudly at apply
-- instead of silently shipping a wrapper that calls nothing.
--
-- WHERE THE SEAM RUNS (the 0077/0078 precedent, verbatim in shape). Not "objects here, census
-- there": part 1 ships the UNGRANTED MACHINERY — the cores that do the writing — and this file
-- ships the GRANTED SURFACE plus the census that proves it. The grant and the proof of the grant
-- therefore stay in ONE transaction, which is the atomicity that actually matters.
--
-- THE WRAPPER RAISES ONLY AND CARRIES NO DML (the 0078:96-107 idiom). It resolves the wake
-- credential, refuses without one, asserts the per-kind allowlist row, refuses every input the
-- agent must not be allowed to pick, and delegates. Every refusal here is a RAISE, not a
-- receipt: a caller who cannot even present a credential has no operation to write a receipt
-- for. THE AGENT NEVER PICKS AN AUTHORITATIVE INPUT (0078:135-146): a blank rationale, an
-- incomplete model snapshot, a null books_version and a blank op key are each refused with a
-- typed detail, and the op key is DETERMINISTIC in the caller — minting one here would defeat
-- the replay the durable substrate depends on.
--
-- THE ALLOWLIST ROWS, AND THE ONE THAT IS NOT A POSTING ROW. `wake_post_entry` gets exactly two
-- rows — 'autodraft' (the unattended lane) and 'interactive' (the chat lane, which ships with
-- chatTurn_v13 in PR-2) — and NEVER 'proactive', whose defining property is single-use
-- notification consumption, nor 'interactive_client'. The pinned chat kind gets exactly ONE row
-- in the whole allowlist, for `wake_open_question` and nothing else: a second row is how that
-- kind would quietly become a posting kind, so the tail counts it in both directions (§D.2c(c)).
--
-- The timeout is precautionary; every statement here is a bounded catalog write.
set local statement_timeout = '5min';
set local search_path = clara, pg_temp;

create temp table _fa2p2_pre(k text primary key, v text not null) on commit drop;
insert into _fa2p2_pre values ('deploy_user', current_user), ('deploy_role', current_role);

do $fa2p2_pre$
declare n text; v_writers int;
begin
  -- PART 1 MUST BE PRESENT, probed in exact regprocedure form.
  foreach n in array array[
    'clara._agent_post_entry_core(uuid,uuid,uuid,text,uuid,uuid,uuid,bigint,text,jsonb,text)',
    'clara._assert_control_leg_counterparty_at(uuid,uuid)',
    'clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)',
    'clara._post_counterparty_projection(uuid)',
    'clara._tf_assert_agent_post_receipt()',
    'clara.wake_context()', 'clara.assert_wake_allowed(text,text)', 'clara.agent_user_id()'
  ] loop
    if to_regprocedure(n) is null then
      raise exception 'F-A2 part2 prestate: part 1 object absent: % — apply UNNUMBERED_f_a2_posting_core.sql first', n using errcode='CLR10';
    end if;
  end loop;
  if to_regclass('clara.entry_post_receipts') is null then
    raise exception 'F-A2 part2 prestate: clara.entry_post_receipts is absent — apply part 1 first' using errcode='CLR10';
  end if;
  -- Part 1's wake limb must be in place, or the allowlist row below names a kind no credential
  -- can ever carry.
  if position('interactive_client' in (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid='clara.wake_credentials'::regclass and c.conname='ck_wake_credentials_kind_0011')) = 0 then
    raise exception 'F-A2 part2 prestate: the kind CHECK has not been extended — apply part 1 first' using errcode='CLR10';
  end if;

  -- PARTIAL BIRTH.
  if to_regprocedure('clara.wake_post_entry(uuid,uuid,uuid,bigint,text,jsonb,text)') is not null then
    raise exception 'F-A2 part2 partial birth: clara.wake_post_entry already exists' using errcode='CLR10';
  end if;
  if exists(select 1 from clara.wake_fn_allowlist where function_name='wake_post_entry') then
    raise exception 'F-A2 part2 partial birth: a wake_post_entry allowlist row already exists' using errcode='CLR10';
  end if;
  if exists(select 1 from clara.wake_fn_allowlist where wake_kind='interactive_client') then
    raise exception 'F-A2 part2 partial birth: an interactive_client allowlist row already exists' using errcode='CLR10';
  end if;

  -- THE BASELINE THIS FILE MUST NOT MOVE: how many APP-EXECUTABLE functions carry DML text
  -- against clara.journal_entries. A granted wrapper that carried entry DML would show up in the
  -- tail as one more, which is the whole point of measuring it before rather than asserting it
  -- after. Re-measured here because part 1's temp table did not survive its commit — a census
  -- that MEASURES is evidence, one that is handed a figure is not.
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.journal_entries\M';
  insert into _fa2p2_pre values ('entry_dml_writers', v_writers::text);
  raise notice 'F-A2 part2 prestate: clean -- part 1 is in place, no wake_post_entry surface exists yet, and % app-executable function(s) carry DML against clara.journal_entries today.', v_writers;
end
$fa2p2_pre$;

set role clara_fn_owner;

-- ---------------------------------------------------------------------------------------------
-- THE GRANTED WRAPPER. The 0004:617-628 / 0078:96-107 shape exactly: resolve the credential,
-- refuse without one, assert the per-kind allowlist row, refuse the inputs the agent may not
-- pick, then delegate to the ungranted core. NO DML text against any table.
-- ---------------------------------------------------------------------------------------------
create function clara.wake_post_entry(p_entry uuid, p_expected_revision uuid, p_client uuid,
    p_books_version bigint, p_rationale text, p_model jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_post_entry');
  -- The client is an authority boundary, not a convenience: an entry outside this firm is CLR11
  -- here and again inside the core, which reads the entry's own firm rather than trusting this.
  perform 1 from clara.clients where id = p_client and firm_id = w.firm_id;
  if not found then raise exception 'client not found in your firm' using errcode='CLR11'; end if;
  -- Never optional. The caller's key is DETERMINISTIC (task + tool + canonical input), which is
  -- what makes a replayed durable step reuse the reservation instead of posting twice; minting
  -- one here would defeat that, so a blank key is refused rather than invented.
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'an unattended post needs its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  -- THE RATIONALE IS THE AGENT SAYING WHY, and law 71 puts it on the receipt. A blank one is a
  -- post with no stated reason, which is exactly what an unattended lane may not produce.
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended post must state its rationale' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  -- THE MODEL SNAPSHOT IS THE OTHER HALF OF LAW 71: which model posted, at which version. The
  -- table CHECK refuses an incomplete one too; this refuses it BEFORE the ladder runs, so an
  -- unrecordable post never reaches the walls at all.
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider','')),'') is null
     or nullif(btrim(coalesce(p_model->>'model','')),'') is null
     or nullif(btrim(coalesce(p_model->>'version','')),'') is null then
    raise exception 'an unattended post must name its model (provider, model, version)'
      using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;
  -- The books token is the agent's statement of what it read. Defaulting it would let the lane
  -- post against a moved ledger and call it current.
  if p_books_version is null then
    raise exception 'an unattended post requires a books_version token' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"books_version","constraint":"nonnull"}';
  end if;
  return clara._agent_post_entry_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of,
    w.wake_kind, p_entry, p_expected_revision, p_client, p_books_version, p_rationale,
    p_model, p_op_key);
end $$;

reset role;

-- ---------------------------------------------------------------------------------------------
-- THE GRANT MATRIX AND THE ALLOWLIST BELT. EXECUTE to clara_wake_interactive and nothing else;
-- two allowlist rows for the post verb and never a third; one row for the pinned chat kind, on
-- a verb that posts nothing. clara_agent_ro gains nothing, here or anywhere in F-A2.
-- ---------------------------------------------------------------------------------------------
revoke all on function clara.wake_post_entry(uuid,uuid,uuid,bigint,text,jsonb,text) from public;
grant execute on function clara.wake_post_entry(uuid,uuid,uuid,bigint,text,jsonb,text)
  to clara_wake_interactive;

insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('autodraft',  'wake_post_entry'),
  ('interactive','wake_post_entry'),
  -- D34 / §D.2c(c): the pinned chat kind's ONLY allowlist row, and it is not a posting row. The
  -- kind exists so a chat turn that cannot lawfully post can still land a typed open question;
  -- `via_wake_kind` on the receipt refuses it by CHECK, so it can never carry a post.
  ('interactive_client','wake_open_question')
on conflict do nothing;

do $fa2p2_tail$
declare
  v_role text; n int; v_writers int; v_sig text; v_grantees text[]; v_public int; v_count int;
  v_wrapper text := 'clara.wake_post_entry(uuid,uuid,uuid,bigint,text,jsonb,text)';
  v_cores text[] := array[
    'clara._agent_post_entry_core(uuid,uuid,uuid,text,uuid,uuid,uuid,bigint,text,jsonb,text)',
    'clara._assert_control_leg_counterparty_at(uuid,uuid)',
    'clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)',
    'clara._post_counterparty_projection(uuid)',
    'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'];
  v_touched text[] := array['wake_post_entry','_agent_post_entry_core',
    '_assert_control_leg_counterparty_at','_assert_supplier_bill_shape_at_projected',
    '_post_counterparty_projection','_approve_entry_core','_draft_entry_core',
    '_tf_assert_supplier_bill_shape','_tf_assert_sales_invoice_shape',
    '_assert_supplier_bill_shape_at','_assert_sales_invoice_shape_at',
    'mint_wake_credential','wake_open_question','_tf_assert_agent_post_receipt'];
  v_name text;
begin
  if current_user <> (select v from _fa2p2_pre where k='deploy_user')
     or current_role <> (select v from _fa2p2_pre where k='deploy_role') then
    raise exception 'F-A2 part2 tail: deploy principal was not restored (user %, role %)', current_user, current_role using errcode='CLR10';
  end if;

  -- (1) The wrapper: definer, pinned path, EXECUTE to clara_wake_interactive ONLY.
  if not exists(select 1 from pg_proc f where f.oid=v_wrapper::regprocedure and f.prosecdef
      and f.proconfig @> array['search_path=clara, pg_temp']) then
    raise exception 'F-A2 part2 tail: wrapper posture wrong' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_wake_interactive', v_wrapper, 'execute') then
    raise exception 'F-A2 part2 tail: clara_wake_interactive lacks EXECUTE on the post wrapper' using errcode='CLR10';
  end if;
  -- THE EXACT GRANTEE SURFACE, enumerated rather than sampled: a hand-list of role names can
  -- only refuse the roles it happens to name, while aclexplode reads what the catalog ACTUALLY
  -- holds — PUBLIC (grantee 0) included.
  select coalesce(array_agg(g order by g),'{}') into v_grantees from (
    select distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
      from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
     where f.oid=v_wrapper::regprocedure and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) q;
  if v_grantees is distinct from array['clara_wake_interactive'] then
    raise exception 'F-A2 part2 tail: post wrapper EXECUTE grantees are %, expected exactly {clara_wake_interactive}', v_grantees using errcode='CLR10';
  end if;
  -- The named-role belt stays too, because the two instruments answer different questions:
  -- aclexplode reads DIRECT grants, has_function_privilege resolves the EFFECTIVE privilege
  -- through role membership.
  foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_proactive','clara_agent_read_login','clara_wake_write_login'] loop
    if to_regrole(v_role) is not null and has_function_privilege(v_role, v_wrapper, 'execute') then
      raise exception 'F-A2 part2 tail: % executes the post wrapper', v_role using errcode='CLR10';
    end if;
  end loop;
  -- THE WRAPPER CARRIES NO DML. Read off its own source, not promised in a comment.
  if lower((select f.prosrc from pg_proc f where f.oid=v_wrapper::regprocedure))
       ~ '(insert\s+into|update\s+clara|delete\s+from|merge\s+into)' then
    raise exception 'F-A2 part2 tail: the post wrapper carries DML text' using errcode='CLR10';
  end if;

  -- (2) Every core — part 1's included, and the shared approve core (0015:3592-3596's
  -- zero-grant pin) — still reachable by NO application role after this file's grants.
  foreach v_sig in array v_cores loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive',
        'clara_agent_read_login','clara_wake_write_login'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'F-A2 part2 tail: % executes the ungranted core %', v_role, v_sig using errcode='CLR10';
      end if;
    end loop;
    select count(*)::int into v_count from pg_proc p
      cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
     where p.oid=v_sig::regprocedure and r.rolname<>'clara_fn_owner';
    if v_count <> 0 then
      raise exception 'F-A2 part2 tail: private core % leaked % non-owner grant(s)', v_sig, v_count using errcode='CLR10';
    end if;
  end loop;

  -- (3) PUBLIC=0 and ONE OVERLOAD on every function this PR touched or created.
  foreach v_name in array v_touched loop
    select count(*)::int into v_public
      from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where ns.nspname='clara' and p.proname=v_name and a.grantee=0 and a.privilege_type='EXECUTE';
    if v_public <> 0 then
      raise exception 'F-A2 part2 tail: PUBLIC execute leaked on clara.%', v_name using errcode='CLR10';
    end if;
    select count(*)::int into v_count from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
     where ns.nspname='clara' and p.proname=v_name;
    if v_count <> 1 then
      raise exception 'F-A2 part2 tail: clara.% has % overloads, expected 1', v_name, v_count using errcode='CLR10';
    end if;
  end loop;

  -- (4) THE ALLOWLIST, IN BOTH DIRECTIONS.
  select count(*)::int into n from clara.wake_fn_allowlist where function_name='wake_post_entry';
  if n <> 2 then
    raise exception 'F-A2 part2 tail: wake_post_entry holds % allowlist row(s), expected exactly 2', n using errcode='CLR10';
  end if;
  if exists(select 1 from clara.wake_fn_allowlist
      where function_name='wake_post_entry' and wake_kind not in ('autodraft','interactive')) then
    raise exception 'F-A2 part2 tail: wake_post_entry is allowlisted for a kind outside {autodraft, interactive}' using errcode='CLR10';
  end if;
  -- THE CLOSED-WORLD CELL (§D.2c(c)): the pinned chat kind holds EXACTLY ONE row in the whole
  -- allowlist, and it is not a posting row. A second row is how this kind would quietly become
  -- a posting kind.
  select count(*)::int into n from clara.wake_fn_allowlist where wake_kind='interactive_client';
  if n <> 1 or not exists(select 1 from clara.wake_fn_allowlist
      where wake_kind='interactive_client' and function_name='wake_open_question') then
    raise exception 'F-A2 part2 tail: interactive_client holds % allowlist row(s); expected exactly one, for wake_open_question', n using errcode='CLR10';
  end if;
  -- The pre-existing kinds' counts move by exactly the rows this file adds and no more.
  select count(*)::int into n from clara.wake_fn_allowlist where wake_kind='autodraft';
  if n <> 7 then
    raise exception 'F-A2 part2 tail: autodraft holds % allowlist rows, expected 0011''s six plus wake_post_entry', n using errcode='CLR10';
  end if;
  select count(*)::int into n from clara.wake_fn_allowlist where wake_kind='proactive';
  if n <> 1 then
    raise exception 'F-A2 part2 tail: the proactive roster moved (% rows) — F-A2 grants it nothing', n using errcode='CLR10';
  end if;

  -- (5) THE ENTRY-DML CENSUS MUST BE EXACTLY WHERE THIS FILE'S PRESTATE FOUND IT. A granted
  -- surface that gained DML against clara.journal_entries would show up here as one more.
  select count(*) into v_writers from pg_proc f
    cross join lateral unnest(array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive']) app(rolname)
    join pg_roles g on g.rolname = app.rolname
   where f.pronamespace = 'clara'::regnamespace and has_function_privilege(g.oid, f.oid, 'EXECUTE')
     and lower(f.prosrc) ~ '(insert\s+into|update|delete\s+from|merge\s+into)\s+clara\.journal_entries\M';
  if v_writers <> (select v::int from _fa2p2_pre where k='entry_dml_writers') then
    raise exception 'F-A2 part2 tail: app-executable journal_entries DML writers moved from % to %',
      (select v from _fa2p2_pre where k='entry_dml_writers'), v_writers using errcode='CLR10';
  end if;

  -- (6) Nothing was posted BY the migration.
  if (select count(*) from clara.entry_post_receipts) <> 0 then
    raise exception 'F-A2 part2 tail: the migration wrote a post receipt' using errcode='CLR10';
  end if;

  raise notice 'F-A2 part2 tail: OK -- clara.wake_post_entry is EXECUTE-granted to clara_wake_interactive and nothing else (grantee surface enumerated by aclexplode, PUBLIC included), carries NO DML text, and is allowlisted for exactly two kinds, autodraft and interactive -- never proactive, never interactive_client. Part 1''s cores and the shared clara._approve_entry_core keep their ZERO-GRANT pin against all eight app roles incl. both non-inheriting login shells. PUBLIC=0 and exactly one overload on all 14 touched functions. The pinned chat kind holds EXACTLY ONE allowlist row, for wake_open_question, which posts nothing. App-executable journal_entries DML writers unmoved at %, and zero post receipts exist.', v_writers;
end
$fa2p2_tail$;
