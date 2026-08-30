-- G1 PR-2b (裁-40's own follow-up; g1-wake-engine-design.md §1.1/§3.6, bank-agency-design.md §3.6,
-- bank-agency-annexes-1-mechanics.md's reason-to-action table at §D.0's tail): the two wake-engine
-- PRODUCERS' own DB surfaces. Rewritten in place after Codex's r1 review of #449 (HIGH-2, HIGH-3) —
-- this file has never been applied to a shared/live database (rig-only, never merged), so it is
-- edited rather than superseded by a second file.
--
-- WHAT THIS FILE SHIPS, and why each piece exists:
--
--   (1) clara.emit_bank_agent_due(client, bank_account, due_key, reason) — the bank_agent
--       producer's sole write. clara._append_event is deliberately UNGRANTED to clara_runtime
--       ("callable only inside definer writers", 0005 §D's own header) and no existing writer
--       emits `bank.agent_due`, so the runtime belt needs a narrow door of its own rather than a
--       widened _append_event grant (which would let the runtime forge ANY event type/firm/
--       client/payload combination directly).
--
--       HIGH-2 (Codex r1): the FIRST cut of this function (and its OWN claim table, once this
--       fix surfaced the second half of the same defect) was created directly by the migration
--       runner's own login, not `clara_fn_owner` — every other SECURITY DEFINER writer in this
--       estate is owned by `clara_fn_owner` (the DR verifier's own invariant), and a definer
--       function owned by the deploy identity runs with THAT identity's broader posture, not the
--       estate's narrow one. Both the function and its claim table are re-owned explicitly via
--       `alter ... owner to clara_fn_owner` right after creation (0056_wave_e_close_model.sql's
--       own idiom, every function there) — measured to matter for more than the function alone:
--       an RLS policy narrows access, it never substitutes for the table-level GRANT ownership
--       itself confers, so the FIRST fix (function-only) still left the claim INSERT refused
--       42501 the moment emit_bank_agent_due tried to write it.
--
--       HIGH-3 (Codex r1): the first cut's idempotency was a RUNTIME check-then-write (a SELECT,
--       then an INSERT, two round trips) — a genuine TOCTOU race between two runtime connections.
--       The fix is a DB-OWNED atomic claim: `clara.bank_agent_due_claims` carries
--       UNIQUE(client_id, bank_account_id, due_key), and emit_bank_agent_due claims that row
--       BEFORE appending, in the SAME statement/transaction as the append, so two concurrent
--       callers racing the identical (client, account, due_key) triple can never both succeed.
--
--       THE due_key CONTRACT (new, and the reason this signature widened from THIS PR's own
--       first cut): F-A3's own domain due-predicate (clara.bank_agent_run_due, unbuilt — design
--       §5) is the ONLY thing that can name a stable identity for "this specific occurrence" (an
--       unmatched line, a completable reconciliation, a parked retry) — the producer belt has no
--       domain knowledge of its own. THE CONTRACT: `bank_agent_run_due(p_client)`'s `due:true`
--       reply MUST carry a `due_key` string that is STABLE across repeated due:true answers for
--       the SAME occurrence (so a re-ask before the occurrence is resolved claims the SAME row
--       and is correctly refused) and DIFFERENT for a genuinely NEW occurrence (a different
--       statement line, a fresh retry attempt after the receipt changes) — an opaque token from
--       the belt's own point of view; the predicate owns its meaning entirely. Documented again,
--       for a reader who never sees this comment, in packages/runtime/README.md and in
--       reconciler-bank-agent.mjs's own header.
--
--   (2) clara.claim_close_prep_task(firm, client, fiscal_year, model_snapshot) — the close_prep
--       producer's sole write, REPLACING this PR's own first-cut raw `insert into
--       clara.agent_tasks` from the runtime. Same HIGH-2 fix (clara_fn_owner ownership) and same
--       HIGH-3 fix (a DB-owned atomic claim, `clara.close_prep_fy_claims`,
--       UNIQUE(fiscal_year_id)) — a fiscal year can carry at most one LIVE claim at a time; once
--       the claimed task reaches a terminal state, the SAME call that would otherwise refuse
--       reclaims the row atomically (no separate runtime round-trip between "is the old claim
--       stale" and "claim it again" — that gap is exactly the race this fix closes) so a
--       reopened fiscal year (design's own 0138 admission law already permits this) is never
--       stuck behind a claim its own resolved task no longer needs.
--
--   Both new tables carry firm_id + forced RLS + the owner-ALL / clara_authenticated-SELECT
--   policy pair (.claude/rules/db-migrations.md's own rule) even though no UI reads either today
--   — pure internal idempotency bookkeeping, visible to an operator through a future ops surface
--   if one is ever built, never written by anyone but the two functions above.
--
-- WHAT THIS FILE DOES NOT SHIP, named so the gap is understood rather than silently assumed:
--   * `bank.agent_due`'s own clara.event_types / clara.trigger_taxonomy registration — lane
--     g1-pr2-db's own migration (a COUPLED PAIR with the writer that emits it, 0154's own tail
--     names the half-registration hazard of splitting a registration across two files). Calling
--     emit_bank_agent_due before that registration lands is a well-formed CLR10 refusal
--     (_append_event's own insert-trigger derivation), never a crash.
--   * clara.bank_agent_run_due(uuid) itself — F-A3's own domain due-predicate (design §1.1),
--     unblocked but not built by this gate. The runtime belt feature-detects its EXACT signature
--     AND shape (prokind/prorettype/proretset — MEDIUM-4, Codex r1) per cycle and stays dormant
--     until it exists.

set local statement_timeout = '5min'; -- precautionary; this file does no heavy scan

-- =====================================================================================
-- Prestate -- purely additive (no existing body recut), so the only claims to measure are that
-- every name below is genuinely free.
-- =====================================================================================
do $$
begin
  if to_regprocedure('clara.emit_bank_agent_due(uuid,uuid,text,text)') is not null then
    raise exception 'g1_pr_2b prestate: clara.emit_bank_agent_due(uuid,uuid,text,text) already exists' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.claim_close_prep_task(uuid,uuid,uuid,text)') is not null then
    raise exception 'g1_pr_2b prestate: clara.claim_close_prep_task(uuid,uuid,uuid,text) already exists' using errcode='CLR10';
  end if;
  if to_regclass('clara.bank_agent_due_claims') is not null then
    raise exception 'g1_pr_2b prestate: clara.bank_agent_due_claims already exists' using errcode='CLR10';
  end if;
  if to_regclass('clara.close_prep_fy_claims') is not null then
    raise exception 'g1_pr_2b prestate: clara.close_prep_fy_claims already exists' using errcode='CLR10';
  end if;
end $$;

-- =====================================================================================
-- (1) bank_agent's claim table + emission door.
-- =====================================================================================

create table clara.bank_agent_due_claims (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  client_id        uuid        not null,
  bank_account_id  uuid        not null,
  due_key          text        not null check (btrim(due_key) <> ''),
  event_seq        bigint, -- set once the append below determines it; null only inside emit_bank_agent_due's own transaction
  claimed_at       timestamptz not null default now(),
  constraint uq_bank_agent_due_claims_key unique (client_id, bank_account_id, due_key)
);
alter table clara.bank_agent_due_claims owner to clara_fn_owner;
alter table clara.bank_agent_due_claims enable row level security;
alter table clara.bank_agent_due_claims force row level security;
create policy p_bank_agent_due_claims_owner on clara.bank_agent_due_claims for all to clara_fn_owner using (true) with check (true);
create policy p_bank_agent_due_claims_read on clara.bank_agent_due_claims for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_agent_due_claims to clara_authenticated;
comment on table clara.bank_agent_due_claims is
  'G1 PR-2b (HIGH-3 fold): the bank_agent producer''s DB-owned idempotency claim -- '
  'UNIQUE(client_id, bank_account_id, due_key) is the atomic exclusion emit_bank_agent_due claims '
  'before appending. Written ONLY by that function; never by any human or agent verb.';

create function clara.emit_bank_agent_due(p_client uuid, p_bank_account uuid, p_due_key text, p_reason text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_seq bigint;
begin
  if p_due_key is null or btrim(p_due_key) = '' then
    raise exception 'emit_bank_agent_due: due_key is required (the occurrence identity the claim keys on)' using errcode = 'CLR10';
  end if;
  select c.firm_id into v_firm from clara.clients c where c.id = p_client and c.status = 'active';
  if v_firm is null then
    raise exception 'emit_bank_agent_due: unknown or inactive client %', p_client using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from clara.bank_accounts ba
     where ba.id = p_bank_account and ba.client_id = p_client and ba.active
  ) then
    raise exception 'emit_bank_agent_due: bank account % is not an active account of client %', p_bank_account, p_client
      using errcode = 'CLR10';
  end if;

  -- HIGH-3: the atomic claim. _append_event's own firm-sequence lock (0005 §D) serializes SEQ
  -- ALLOCATION only -- it is not a dedupe. This UNIQUE insert IS the dedupe, and it happens
  -- BEFORE the append, in the same transaction, so a losing concurrent caller never appends at
  -- all (never a compensating delete, never a window where two rows briefly both exist).
  insert into clara.bank_agent_due_claims (firm_id, client_id, bank_account_id, due_key)
    values (v_firm, p_client, p_bank_account, p_due_key)
  on conflict (client_id, bank_account_id, due_key) do nothing;
  if not found then
    return jsonb_build_object('appended', false, 'reason', 'already_claimed');
  end if;

  v_seq := clara._append_event(v_firm, 'bank.agent_due', p_client, null, null, null, null, null, null,
    jsonb_build_object('bank_account_id', p_bank_account, 'reason', coalesce(nullif(btrim(p_reason), ''), 'due')));
  update clara.bank_agent_due_claims set event_seq = v_seq
   where client_id = p_client and bank_account_id = p_bank_account and due_key = p_due_key;
  return jsonb_build_object('appended', true, 'seq', v_seq);
end $$;
alter function clara.emit_bank_agent_due(uuid,uuid,text,text) owner to clara_fn_owner;
revoke all on function clara.emit_bank_agent_due(uuid,uuid,text,text) from public;
grant execute on function clara.emit_bank_agent_due(uuid,uuid,text,text) to clara_runtime;

comment on function clara.emit_bank_agent_due(uuid,uuid,text,text) is
  'G1 PR-2b: the bank_agent producer''s sole write. clara_runtime ONLY -- the leader-guarded '
  'cadence belt''s one call per (client, bank_account, due_key) F-A3''s own due-predicate names, '
  'client-scoped, carrying bank_account_id in the payload (g1-wake-engine-design.md, "Three '
  'producer-side contracts"). Atomically claims UNIQUE(client_id, bank_account_id, due_key) '
  'before appending (HIGH-3) -- a second call for the SAME triple returns {appended:false, '
  'reason:''already_claimed''}, never a duplicate event. Refuses CLR10 on an unknown/inactive '
  'client, an inactive/foreign bank account, a blank due_key, or (via _append_event''s own '
  'insert-trigger derivation) an unregistered/firm-level event type -- the last is lane '
  'g1-pr2-db''s own registration to complete.';

-- =====================================================================================
-- (2) close_prep's claim table + task-producer door.
-- =====================================================================================

create table clara.close_prep_fy_claims (
  fiscal_year_id uuid        primary key,
  firm_id        uuid        not null,
  client_id      uuid        not null,
  task_id        uuid        not null,
  claimed_at     timestamptz not null default now()
);
alter table clara.close_prep_fy_claims owner to clara_fn_owner;
alter table clara.close_prep_fy_claims enable row level security;
alter table clara.close_prep_fy_claims force row level security;
create policy p_close_prep_fy_claims_owner on clara.close_prep_fy_claims for all to clara_fn_owner using (true) with check (true);
create policy p_close_prep_fy_claims_read on clara.close_prep_fy_claims for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_prep_fy_claims to clara_authenticated;
comment on table clara.close_prep_fy_claims is
  'G1 PR-2b (HIGH-3 fold): the close_prep producer''s DB-owned idempotency claim -- at most one '
  'LIVE claim per fiscal_year_id. claim_close_prep_task reclaims a row atomically once its '
  'referenced task has reached a terminal state (a reopened FY, 0138''s own admission law, must '
  'not stay stuck behind a resolved claim). Written ONLY by that function.';

create function clara.claim_close_prep_task(p_firm uuid, p_client uuid, p_fiscal_year uuid, p_model_snapshot text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_task uuid := gen_random_uuid(); v_existing_status text;
begin
  if p_model_snapshot is null or btrim(p_model_snapshot) = '' then
    raise exception 'claim_close_prep_task: model_snapshot is required' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = p_firm and c.status = 'active') then
    raise exception 'claim_close_prep_task: client % is not an active client of firm %', p_client, p_firm using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.fiscal_years fy where fy.id = p_fiscal_year and fy.client_id = p_client and fy.firm_id = p_firm) then
    raise exception 'claim_close_prep_task: fiscal year % is not this client''s', p_fiscal_year using errcode = 'CLR10';
  end if;

  -- HIGH-3: lock any existing claim row for this FY, then reclaim it ATOMICALLY (same
  -- transaction, no runtime round-trip in between) iff its referenced task has already reached a
  -- terminal state. A live (non-terminal) claim is left untouched and the insert below correctly
  -- conflicts.
  select t.status into v_existing_status
    from clara.close_prep_fy_claims c join clara.agent_tasks t on t.id = c.task_id
   where c.fiscal_year_id = p_fiscal_year
   for update of c;
  if found and v_existing_status in ('completed', 'failed', 'cancelled') then
    delete from clara.close_prep_fy_claims where fiscal_year_id = p_fiscal_year;
  end if;

  insert into clara.close_prep_fy_claims (fiscal_year_id, firm_id, client_id, task_id)
    values (p_fiscal_year, p_firm, p_client, v_task)
  on conflict (fiscal_year_id) do nothing;
  if not found then
    return jsonb_build_object('appended', false, 'reason', 'already_claimed');
  end if;

  insert into clara.agent_tasks (id, firm_id, client_id, kind, status, model_snapshot)
    values (v_task, p_firm, p_client, 'close_prep', 'queued', p_model_snapshot);
  return jsonb_build_object('appended', true, 'task_id', v_task);
end $$;
alter function clara.claim_close_prep_task(uuid,uuid,uuid,text) owner to clara_fn_owner;
revoke all on function clara.claim_close_prep_task(uuid,uuid,uuid,text) from public;
grant execute on function clara.claim_close_prep_task(uuid,uuid,uuid,text) to clara_runtime;

comment on function clara.claim_close_prep_task(uuid,uuid,uuid,text) is
  'G1 PR-2b: the close_prep producer''s sole write. clara_runtime ONLY -- atomically claims '
  'UNIQUE(fiscal_year_id) (reclaiming a stale, terminal-task row in the SAME call) before '
  'inserting the queued clara.agent_tasks(kind=''close_prep'') row (HIGH-3). A second call for a '
  'still-live FY returns {appended:false, reason:''already_claimed''}, never a duplicate task.';

-- =====================================================================================
-- Tail census -- positive reads only (review law 2: absence is not evidence).
-- =====================================================================================
do $$
declare
  v_emit_owner name; v_claim_owner name;
  v_emit_secdef boolean; v_claim_secdef boolean;
  v_emit_path boolean; v_claim_path boolean;
  v_runtime_emit boolean; v_runtime_claim boolean;
  v_public_emit boolean; v_public_claim boolean; v_authed_emit boolean; v_authed_claim boolean;
  v_runtime_append boolean;
begin
  -- Ownership + SECURITY DEFINER + search_path (HIGH-2's own tail obligation). The exact-string
  -- array-membership idiom 0020_typed_consent.sql:1992 already uses, not a substring probe.
  select p.proowner::regrole::name, p.prosecdef,
         'search_path=clara, pg_temp' = any(coalesce(p.proconfig, '{}'::text[]))
    into v_emit_owner, v_emit_secdef, v_emit_path
    from pg_proc p where p.oid = 'clara.emit_bank_agent_due(uuid,uuid,text,text)'::regprocedure;
  if v_emit_owner is distinct from 'clara_fn_owner' then
    raise exception 'g1_pr_2b tail: emit_bank_agent_due owner is % (want clara_fn_owner)', v_emit_owner using errcode='CLR10';
  end if;
  if not v_emit_secdef then raise exception 'g1_pr_2b tail: emit_bank_agent_due is not SECURITY DEFINER' using errcode='CLR10'; end if;
  if not v_emit_path then
    raise exception 'g1_pr_2b tail: emit_bank_agent_due search_path not pinned' using errcode='CLR10';
  end if;

  select p.proowner::regrole::name, p.prosecdef,
         'search_path=clara, pg_temp' = any(coalesce(p.proconfig, '{}'::text[]))
    into v_claim_owner, v_claim_secdef, v_claim_path
    from pg_proc p where p.oid = 'clara.claim_close_prep_task(uuid,uuid,uuid,text)'::regprocedure;
  if v_claim_owner is distinct from 'clara_fn_owner' then
    raise exception 'g1_pr_2b tail: claim_close_prep_task owner is % (want clara_fn_owner)', v_claim_owner using errcode='CLR10';
  end if;
  if not v_claim_secdef then raise exception 'g1_pr_2b tail: claim_close_prep_task is not SECURITY DEFINER' using errcode='CLR10'; end if;
  if not v_claim_path then
    raise exception 'g1_pr_2b tail: claim_close_prep_task search_path not pinned' using errcode='CLR10';
  end if;


  -- Exact ACL: clara_runtime EXECUTE-granted, PUBLIC and clara_authenticated both refused, on
  -- BOTH new writers (the role-matrix half of HIGH-2's own pinning cell, at the DB level).
  select has_function_privilege('clara_runtime', 'clara.emit_bank_agent_due(uuid,uuid,text,text)', 'execute'),
         has_function_privilege('public', 'clara.emit_bank_agent_due(uuid,uuid,text,text)', 'execute'),
         has_function_privilege('clara_authenticated', 'clara.emit_bank_agent_due(uuid,uuid,text,text)', 'execute')
    into v_runtime_emit, v_public_emit, v_authed_emit;
  if not v_runtime_emit or v_public_emit or v_authed_emit then
    raise exception 'g1_pr_2b tail: emit_bank_agent_due ACL wrong (runtime=% public=% authed=%)', v_runtime_emit, v_public_emit, v_authed_emit using errcode='CLR10';
  end if;
  select has_function_privilege('clara_runtime', 'clara.claim_close_prep_task(uuid,uuid,uuid,text)', 'execute'),
         has_function_privilege('public', 'clara.claim_close_prep_task(uuid,uuid,uuid,text)', 'execute'),
         has_function_privilege('clara_authenticated', 'clara.claim_close_prep_task(uuid,uuid,uuid,text)', 'execute')
    into v_runtime_claim, v_public_claim, v_authed_claim;
  if not v_runtime_claim or v_public_claim or v_authed_claim then
    raise exception 'g1_pr_2b tail: claim_close_prep_task ACL wrong (runtime=% public=% authed=%)', v_runtime_claim, v_public_claim, v_authed_claim using errcode='CLR10';
  end if;

  -- clara_runtime must STILL be unable to call _append_event directly (the whole reason these
  -- two narrow doors exist rather than a widened _append_event grant).
  select has_function_privilege('clara_runtime', 'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)', 'execute')
    into v_runtime_append;
  if v_runtime_append then
    raise exception 'g1_pr_2b tail: clara_runtime can execute _append_event directly -- the narrow-door design is defeated' using errcode='CLR10';
  end if;

  -- Both claim tables: forced RLS + exactly the owner/human policy pair.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname='bank_agent_due_claims' and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'g1_pr_2b tail: bank_agent_due_claims is not RLS-enabled+forced' using errcode='CLR10';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname='close_prep_fy_claims' and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'g1_pr_2b tail: close_prep_fy_claims is not RLS-enabled+forced' using errcode='CLR10';
  end if;

  -- Both claim tables must be OWNED by clara_fn_owner too (not merely governed by its RLS
  -- policy) -- an RLS policy narrows access; it never substitutes for the table-level GRANT a
  -- non-owner role would otherwise need. Found empirically: the first cut of this migration set
  -- the OWNER policy but left the tables owned by the migration runner's own login, and
  -- emit_bank_agent_due (running AS clara_fn_owner, SECURITY DEFINER) got a bare 42501
  -- "permission denied" the moment it tried to INSERT.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname='bank_agent_due_claims' and c.relowner::regrole::name='clara_fn_owner'
  ) then
    raise exception 'g1_pr_2b tail: bank_agent_due_claims is not owned by clara_fn_owner' using errcode='CLR10';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname='close_prep_fy_claims' and c.relowner::regrole::name='clara_fn_owner'
  ) then
    raise exception 'g1_pr_2b tail: close_prep_fy_claims is not owned by clara_fn_owner' using errcode='CLR10';
  end if;

  raise notice 'g1_pr_2b tail: OK -- emit_bank_agent_due(uuid,uuid,text,text) and claim_close_prep_task(uuid,uuid,uuid,text) both owned by clara_fn_owner, SECURITY DEFINER, search_path pinned, clara_runtime-only ACL (PUBLIC and clara_authenticated both refused execute); clara_runtime still cannot execute _append_event directly; both new claim tables (bank_agent_due_claims, close_prep_fy_claims) RLS-enabled+forced with the owner/human policy pair. No table in workflow/graphile_worker/spike touched.';
end $$;
