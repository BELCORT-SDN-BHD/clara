-- UNNUMBERED_f_a4_pr_1b_close_lifecycle.sql — F-A4 PR-1b, WINDOW B: the close-lifecycle writers.
-- =================================================================================================
-- Number claimed at MERGE time (hard constraint 10). Design of record:
-- docs/plan/active/close-key-1-design.md v2 §3.4/§3.9/§3.10/§3.11 + Annex A (mechanism) +
-- Annex C (wake-kind census) + Annex E (shapes) + Annex F.2 (this window's numbered D1 list) +
-- Annex G (decisions D-15..D-27 as folded at gate 2). Gate record: close-key-1-gate-record.md.
--
-- SCOPE (Annex F.2, sixteen rows, B1-1..B1-16 — the D1 §0 inventory, EXACT):
--   B1-1  clara.close_receipts        ALTER  segregation_mode CHECK gains 'agent_prepared'
--   B1-2  clara.fiscal_years          ALTER  fy_end_source CHECK gains 'asserted_by_file'
--   B1-3  clara.close_attestations    ALTER  + authored_by, adopted_verbatim (nullable)
--   B1-4  clara.wake_credentials      ALTER  both CHECKs extended for 'close_prep'
--   B1-5  clara.wake_credentials      ALTER  + agent_task_id (nullable, FK agent_tasks)
--   B1-6  clara.agent_tasks           ALTER  kind CHECK gains 'close_prep'
--   B1-7  clara.finalize_close                 CoR — task #17 Fix A + §3.9 changes 1-3
--   B1-8  clara.reopen_fiscal_year              CoR — Fix A's mirror + §3.9 change 4
--   B1-9  clara.attest_close_exception          CoR — authorship (+ p_from_proposal)
--   B1-10 clara.begin_close                     CoR — body-move, entrance seam (D-15)
--   B1-11 clara.abandon_close                   CoR — body-move, entrance seam (D-15)
--   B1-12 clara.open_fiscal_year                CoR — body-move (D-16/G2)
--   B1-13 clara.propose_fiscal_year             CoR — body-move (D-16/G2)
--   B1-14 clara.mint_month_snapshot             CoR — body-move (D-21)
--   B1-15 clara._tf_agent_task_insert()         CoR — 'close_prep' birth arm (D-27/G4)
--   B1-16 clara._tf_agent_task_update()         CoR — 'close_prep' transition arm (D-27/G4)
--
-- WHAT THIS FILE DOES NOT SHIP (Annex F.3): the thirteen wake_* wrappers, the agent cores
-- (_agent_begin_close_core etc.), Tier-B rungs B1..B14, clara.close_prep_due(), the three new
-- tables (agent_act_receipts, close_proposals, close_prep_holds), the two hold verbs, the F14
-- siblings (mint_wake_credential_for_task, _wake_task_id) and the read-core extractions
-- (list_fiscal_years / get_close_readiness / verify_close). Those are ADDITIVE — PR-1c needs no
-- D1 window because nothing in flight can be inside a body that does not exist yet.
--
-- THE ONE FORWARD REFERENCE THIS FILE CARRIES, AND WHY IT IS SOUND. attest_close_exception's new
-- p_from_proposal arm (B1-9) reads clara.close_proposals — a table PR-1c creates, not this file.
-- Splitting attest_close_exception's signature change across two windows would leave B1-9 half
-- built in the window Annex F.2 assigns it, and moving close_proposals into this window would
-- hand PR-1c's own table to a lane that does not own it. MEASURED (settle report, gate B3):
-- Postgres's plpgsql compiler does NOT resolve an embedded relation at CREATE time, even with
-- check_function_bodies=on — catalog references inside a plpgsql statement are validated at PLAN
-- time, on first EXECUTION, never at function creation (confirmed live: CREATE FUNCTION over a
-- body naming a genuinely absent table succeeds outright) — so the query reading close_proposals
-- is PLAIN STATIC SQL, exactly like every other statement in this file. It runs only inside `if
-- p_from_proposal is not null`, which stays unreachable — for every call the estate has ever made
-- — until PR-1c's table exists and PR-2/PR-3 start passing a non-null value. Every existing
-- caller passes NULL and is byte-unaffected. No dynamic SQL, no DYNAMIC_SQL_ALLOWLIST entry: the
-- forward reference costs this file nothing beyond the one static statement.
--
-- D1 — WRITE-QUIESCE REQUIRED for this whole file (packages/db/README.md "Deploy contract"): ten
-- live bodies replaced (B1-7..B1-16) — seven audited writers (finalize_close, reopen_fiscal_year,
-- attest_close_exception, begin_close, abandon_close, open_fiscal_year, mint_month_snapshot), two
-- triggers on the task surface (_tf_agent_task_insert/_update), and ONE stable read
-- (propose_fiscal_year) reached from a live writer's transaction (open_fiscal_year calls it
-- in-body) rather than being a writer itself — plus four live-table CHECK swaps a writer's own
-- transaction may be mid-flight against (B1-1/B1-2/B1-4/B1-6). Run from merged main only, after
-- Window A (PR-1a) has settled.
--
-- Timeout is PRECAUTIONARY, not load-bearing: every statement here is DDL or CREATE OR REPLACE
-- FUNCTION over a small, already-indexed catalog — no backfill, no table scan. The runner opens
-- and owns BEGIN/COMMIT itself (one transaction per migration) — this file carries neither.
set local statement_timeout = '10min';
-- The 0011/0056 idiom: every CREATE FUNCTION below must be OWNED by clara_fn_owner (the role
-- every SECURITY DEFINER caller in the estate runs as, and therefore the only role every other
-- SECURITY DEFINER function implicitly trusts to call it with no separate grant). Reset before
-- the tail census.
set role clara_fn_owner;

-- =================================================================================================
-- §0 · PRESTATE — measure every claim this file makes, abort on any drift rather than CoR a body
-- this branch never read.
-- =================================================================================================
do $prestate$
declare
  v_sha text;
  v_def text;
begin
  -- 0.1 · prosrc-SHA pins on the ten live bodies this file CoRs (rig-replayed at the frontier this
  -- branch was authored against: main + F-A2/PR-1's three staged migrations for local testing —
  -- see the branch's settle report for the exact chain). A drift here means some OTHER change
  -- touched one of these bodies between the replay and this apply; abort rather than proceed on a
  -- wrong premise (db-migrations.md's own rule).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if v_sha is distinct from '64b2c65ee77b4c7b150c1ae09b1238ecaccc5b9f7a0e7204d36b6a1cd0216954' then
    raise exception 'f_a4_pr_1b prestate: clara.finalize_close drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from 'b5da82e1043db2376a9cd44b74f46f9904f28e274e1d13c118623a045e1e6d8e' then
    raise exception 'f_a4_pr_1b prestate: clara.reopen_fiscal_year drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.attest_close_exception(uuid,text,text,text,text)'::regprocedure;
  if v_sha is distinct from '7b04cc4c2ee9a2769f6c10ab4c35a8cab1e5ade2eb872e324be22544037e384e' then
    raise exception 'f_a4_pr_1b prestate: clara.attest_close_exception drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.begin_close(uuid,text)'::regprocedure;
  if v_sha is distinct from 'ec67da1b91e2a4be60a1896b7b64ad05faaa2481da25d7d782c8ed2bc52f4512' then
    raise exception 'f_a4_pr_1b prestate: clara.begin_close drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.abandon_close(uuid,text,text)'::regprocedure;
  if v_sha is distinct from 'f25e47077c0f18a92e72e1d25298a99b410167b3c62c01770fd7a7b0fcd538d5' then
    raise exception 'f_a4_pr_1b prestate: clara.abandon_close drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.open_fiscal_year(uuid,text,date,date,text,text)'::regprocedure;
  if v_sha is distinct from 'c7bfd1db48ab0b0b1e53d9c0ad60c63c4a753406f7445cf771ad75b5a51c907e' then
    raise exception 'f_a4_pr_1b prestate: clara.open_fiscal_year drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.propose_fiscal_year(uuid,date)'::regprocedure;
  if v_sha is distinct from '71ece301fae6c8e8aa2cf1152cabb0f9ddcb071ceb1e37ab7adefb3322d26b6a' then
    raise exception 'f_a4_pr_1b prestate: clara.propose_fiscal_year drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.mint_month_snapshot(uuid,date,text)'::regprocedure;
  if v_sha is distinct from 'd40cbf10456b5cca37a48abf9ec725cfd4359a82c8dd69b2424009ef6e3349e2' then
    raise exception 'f_a4_pr_1b prestate: clara.mint_month_snapshot drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_agent_task_insert()'::regprocedure;
  if v_sha is distinct from '77d23409cc73349144390d1a1a03c067dbeb4389c6c7b32fbf73bea0c8237198' then
    raise exception 'f_a4_pr_1b prestate: clara._tf_agent_task_insert drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_agent_task_update()'::regprocedure;
  if v_sha is distinct from '7d0fd057fb2516ea5a8ae356ec0e3e93fa0537bb35a14e41650bb73fa11784de' then
    raise exception 'f_a4_pr_1b prestate: clara._tf_agent_task_update drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- 0.2 · the wake_credentials CHECKs, pinned EXACT (fail-closed BOTH ways, matching 0.3's
  -- siblings — B1-4 gets the same idempotency guard the other three extended CHECKs already
  -- carry). An exact-text match proves interactive_client IS present (F-A2/PR-1 merged onto
  -- this chain; the POST-F-A2 four-kind text, design Annex C, gate GM-8) AND that close_prep is
  -- ABSENT (this file has not already applied) in one pin -- a substring probe on close_prep's
  -- own name alone would miss a drift in any OTHER disjunct (wave-f-lane-brief.md's own warning:
  -- "prestate probe aborts loudly if interactive_client is absent"; "prove trued pins both ways").
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_kind_0011';
  if v_def is distinct from 'CHECK ((wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text, ''autodraft''::text, ''interactive_client''::text])))' then
    raise exception 'f_a4_pr_1b prestate: ck_wake_credentials_kind_0011 is not at its exact post-F-A2/pre-F-A4 text -- either F-A2 PR-1 has not merged onto this chain, or this file already applied (got: %)', v_def
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_client_0011';
  if v_def is distinct from 'CHECK ((((wake_kind = ''autodraft''::text) AND (client_id IS NOT NULL)) OR ((wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text])) AND (client_id IS NULL)) OR ((wake_kind = ''interactive_client''::text) AND (client_id IS NOT NULL))))' then
    raise exception 'f_a4_pr_1b prestate: ck_wake_credentials_client_0011 is not at its exact post-F-A2/pre-F-A4 text (got: %)', v_def
      using errcode = 'CLR10';
  end if;

  -- 0.3 · the four CHECKs this file extends are at their PRE-extension text (idempotency guard —
  -- this file has not already applied).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.close_receipts'::regclass and c.conname = 'close_receipts_segregation_mode_check';
  if v_def is null or position('agent_prepared' in v_def) > 0 then
    raise exception 'f_a4_pr_1b prestate: close_receipts_segregation_mode_check is missing or already widened (got: %)', v_def
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.fiscal_years'::regclass and c.conname = 'fiscal_years_fy_end_source_check';
  if v_def is null or position('asserted_by_file' in v_def) > 0 then
    raise exception 'f_a4_pr_1b prestate: fiscal_years_fy_end_source_check is missing or already widened (got: %)', v_def
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.agent_tasks'::regclass and c.conname = 'ck_agent_tasks_kind_0011';
  if v_def is null or position('close_prep' in v_def) > 0 then
    raise exception 'f_a4_pr_1b prestate: ck_agent_tasks_kind_0011 is missing or already widened (got: %)', v_def
      using errcode = 'CLR10';
  end if;

  -- 0.4 · none of the new objects exist yet.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname in ('_begin_close_core', '_abandon_close_core',
        '_propose_fiscal_year_core', '_open_fiscal_year_core', '_mint_month_snapshot_core')) then
    raise exception 'f_a4_pr_1b prestate: one or more Window-B core functions already exist'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'close_attestations'
        and column_name in ('authored_by', 'adopted_verbatim')) then
    raise exception 'f_a4_pr_1b prestate: close_attestations already carries authored_by/adopted_verbatim'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'wake_credentials' and column_name = 'agent_task_id') then
    raise exception 'f_a4_pr_1b prestate: wake_credentials.agent_task_id already exists'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from information_schema.columns
      where table_schema = 'clara' and table_name = 'journal_entries' and column_name = 'closing_transfer') = false then
    raise exception 'f_a4_pr_1b prestate: journal_entries.closing_transfer is missing -- task #17 Fix A has nothing to mark'
      using errcode = 'CLR10';
  end if;

  raise notice 'f_a4_pr_1b prestate: clean -- ten live bodies at their pinned prosrc shas, both wake_credentials CHECKs already carry interactive_client (post-F-A2 text), close_receipts.segregation_mode / fiscal_years.fy_end_source / agent_tasks.kind at their pre-extension text, journal_entries.closing_transfer present (task #17''s target column), and none of the Window-B objects exist yet.';
end $prestate$;

-- =================================================================================================
-- §A · THE ALTERS (B1-1..B1-6) — before every CoR that depends on their new values.
-- =================================================================================================

-- B1-1 · close_receipts.segregation_mode gains 'agent_prepared' (TA-P6; design §3.9 change 3).
alter table clara.close_receipts drop constraint close_receipts_segregation_mode_check;
alter table clara.close_receipts add constraint close_receipts_segregation_mode_check
  check (segregation_mode = any (array['two_person', 'solo_self_attested', 'agent_prepared']));

-- B1-2 · fiscal_years.fy_end_source gains 'asserted_by_file' (design §3.11).
alter table clara.fiscal_years drop constraint fiscal_years_fy_end_source_check;
alter table clara.fiscal_years add constraint fiscal_years_fy_end_source_check
  check (fy_end_source = any (array['asserted', 'default_1231', 'asserted_by_file']));

-- B1-3 · close_attestations gains authored_by / adopted_verbatim (TA-P4 (5), OQ-A4-8). Nullable,
-- no default: existing rows stay valid, and only attest_close_exception's own logic (B1-9) ever
-- writes them, so nothing needs a backfill.
alter table clara.close_attestations add column authored_by text
  check (authored_by is null or authored_by in ('human', 'agent'));
alter table clara.close_attestations add column adopted_verbatim boolean;

-- B1-4 · wake_credentials both CHECKs extend for 'close_prep' (design §3.3, Annex C; the SECOND
-- extension in the chain — F-A2's interactive_client precedes this, F-A3's bank_agent follows).
alter table clara.wake_credentials drop constraint ck_wake_credentials_kind_0011;
alter table clara.wake_credentials add constraint ck_wake_credentials_kind_0011
  check (wake_kind = any (array['interactive', 'proactive', 'autodraft', 'interactive_client', 'close_prep']));
alter table clara.wake_credentials drop constraint ck_wake_credentials_client_0011;
alter table clara.wake_credentials add constraint ck_wake_credentials_client_0011
  check (
    (wake_kind = 'autodraft' and client_id is not null)
    or (wake_kind = any (array['interactive', 'proactive']) and client_id is null)
    or (wake_kind = 'interactive_client' and client_id is not null)
    or (wake_kind = 'close_prep' and client_id is not null)
  );

-- B1-5 · wake_credentials gains a nullable agent_task_id (F14's binding; the sibling
-- mint_wake_credential_for_task that writes it, and _wake_task_id() that reads it back, are
-- PR-1c's — this file only opens the column so PR-1c has somewhere to put the value).
alter table clara.wake_credentials add column agent_task_id uuid references clara.agent_tasks(id);

-- B1-6 · agent_tasks.kind gains 'close_prep' (design §3.3, D-27; gate G4).
alter table clara.agent_tasks drop constraint ck_agent_tasks_kind_0011;
alter table clara.agent_tasks add constraint ck_agent_tasks_kind_0011
  check (kind = any (array['chat_turn', 'wake', 'autodraft', 'close_prep']));

-- =================================================================================================
-- §B · B1-7 — clara.finalize_close: task #17 Fix A + §3.9 changes 1-3 (segregation re-aim).
-- =================================================================================================
create or replace function clara.finalize_close(p_fy uuid, p_self_attestation text, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_fy record; v_run record; v_dedupe jsonb; g record;
  v_att record; v_prep record; v_human_preparer uuid; v_agent_prepared boolean; v_mode text;
  v_re text; v_re_n int; v_pl bigint; v_line int; v_entry uuid; v_permit uuid;
  v_pl_rows jsonb; v_open_diffs jsonb; v_prior_receipt record; v_pin jsonb;
  v_closing_pos jsonb; v_receipt uuid; v_gate_summary jsonb; v_watermark text;
  v_fa jsonb; v_n int; r record; v_reopen_settled jsonb; v_items text[]; v_missing text[];
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'finalizing a close takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  perform 1 from clara.clients cl where cl.id = v_fy.client_id and cl.firm_id = c.firm;
  if not found then
    raise exception 'client is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"client_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'finalize_close', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy, 'self_attestation', p_self_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status <> 'closing' then
    raise exception 'fiscal year % is %; finalize takes a year mid-close', v_fy.label, v_fy.status
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  select * into v_run from clara.close_runs r2
    where r2.fiscal_year_id = p_fy and r2.state = 'in_progress';
  if v_run.id is null then
    raise exception 'no in-progress close run exists for this fiscal year'
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;

  -- RE-EVALUATE EVERY GATE IN-TRANSACTION (the attestation-staleness law measures against
  -- THESE digests, not the begin-time ones).
  v_gate_summary := clara._evaluate_close_gates(v_run.id);

  -- THE DRAWER SWEEP over the FRESH results (latest row per check on this run).
  for g in
    select distinct on (r2.check_key) r2.*
      from clara.close_gate_results r2
      where r2.close_run_id = v_run.id
      order by r2.check_key, r2.seq desc
  loop
    if g.drawer = 1 and g.state = 'fail' then
      raise exception 'drawer-1 identity % FAILED -- no attestation path exists, for anybody', g.check_key
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_identity_failed',
            'check_key', g.check_key, 'measured', g.measured)::text;
    elsif g.drawer = 1 and g.state in ('unknown', 'error') then
      raise exception 'drawer-1 identity % could not be evaluated (%) -- an unevaluated identity has not passed', g.check_key, g.state
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_state_unknown',
            'check_key', g.check_key, 'state', g.state, 'measured', g.measured)::text;
    elsif g.drawer = 2 and g.state in ('fail', 'unknown', 'error') then
      v_items := clara._gate_outstanding_items(g.check_key, g.measured);
      if coalesce(array_length(v_items, 1), 0) = 0 then
        v_items := array['__gate__'];
      end if;
      select coalesce(array_agg(x.k order by x.k), '{}') into v_missing
        from unnest(v_items) x(k)
        where not exists (select 1 from clara.close_attestations a
                join clara.close_gate_results gr on gr.id = a.gate_result_id
                where a.close_run_id = v_run.id and a.check_key = g.check_key
                  and a.item_key = x.k and a.superseded_at is null
                  and gr.measured_digest = g.measured_digest);
      if coalesce(array_length(v_missing, 1), 0) > 0 then
        select a.*, gr.measured_digest as bound_digest into v_att
          from clara.close_attestations a
          join clara.close_gate_results gr on gr.id = a.gate_result_id
          where a.close_run_id = v_run.id and a.check_key = g.check_key
            and a.superseded_at is null
          order by a.attested_at desc limit 1;
        if v_att.id is not null and v_att.bound_digest <> g.measured_digest then
          raise exception 'the attestation on % signed a state that has since MOVED -- re-attest against the fresh measurement', g.check_key
            using errcode = 'CLR41',
              detail = jsonb_build_object('reason', 'close_attestation_stale',
                'check_key', g.check_key, 'attested_digest', v_att.bound_digest,
                'fresh_digest', g.measured_digest,
                'missing_or_stale_items', to_jsonb(v_missing))::text;
        end if;
        raise exception 'drawer-2 gate % is % and % item(s) carry no live attestation', g.check_key, g.state, array_length(v_missing, 1)
          using errcode = 'CLR41',
            detail = jsonb_build_object('reason', 'drawer2_unattested',
              'check_key', g.check_key, 'measured', g.measured,
              'missing_items', to_jsonb(v_missing))::text;
      end if;
    end if;
  end loop;

  -- SEGREGATION (E-R11 / §2.10, RE-AIMED by TA-P6 -- close-key-1-design.md §3.9 changes 1-3,
  -- Annex A.4's eight-combination table). v_human_preparer is now measured against the FY's
  -- last HUMAN preparer only (F2's fix: today's unfiltered read resolves to the agent on an
  -- agent-prepared year, so the distinct-checker test went vacuous). v_agent_prepared is an
  -- INDEPENDENT probe for a separate question -- never derived from v_human_preparer, which is
  -- exactly the derivation F2 broke.
  select je.* into v_prep from clara.journal_entries je
    join clara.users u on u.id = coalesce(je.last_human_editor, je.maker_actor)
    where je.client_id = v_fy.client_id
      and je.posting_date between v_fy.starts_on and v_fy.ends_on
      and u.is_agent = false
    order by coalesce(je.approved_at, je.updated_at) desc, je.id desc limit 1;
  v_human_preparer := coalesce(v_prep.last_human_editor, v_prep.maker_actor);
  select exists (
      select 1 from clara.journal_entries je2
        where je2.client_id = v_fy.client_id
          and je2.posting_date between v_fy.starts_on and v_fy.ends_on
          and je2.status = 'approved'
          and je2.maker_actor = clara.agent_user_id()
          and je2.last_human_editor is null)
    into v_agent_prepared;
  if v_human_preparer is null then
    -- ROW 7 of Annex A.4: no human ever touched the year -- there is no preparer to be distinct
    -- from, and inventing one to raise against would be law 68's ARM-0 failure. Never a raise on
    -- the distinct-checker arm here, regardless of eligible-checker count.
    if clara.eligible_checker_count(c.firm) < 2
       and (p_self_attestation is null or btrim(p_self_attestation) = '') then
      raise exception 'a solo firm closes with an explicit self-approval attestation'
        using errcode = 'CLR41',
          detail = '{"reason":"close_self_attestation_required"}';
    end if;
    v_mode := 'agent_prepared';
  elsif clara.eligible_checker_count(c.firm) >= 2 then
    -- ROWS 1-4: H=yes. The raise is decided by H and S alone and is untouched by A -- Clara's
    -- participation never excuses a human self-check, and never creates one.
    if v_human_preparer = c.actor then
      raise exception 'the closer must differ from the year''s last human preparer -- a different eligible human must finalize'
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'close_segregation_violation',
            'last_preparer', v_human_preparer)::text;
    end if;
    v_mode := case when v_agent_prepared then 'agent_prepared' else 'two_person' end;
  else
    -- ROWS 5-6: H=no.
    if p_self_attestation is null or btrim(p_self_attestation) = '' then
      raise exception 'a solo firm closes with an explicit self-approval attestation'
        using errcode = 'CLR41',
          detail = '{"reason":"close_self_attestation_required"}';
    end if;
    v_mode := case when v_agent_prepared then 'agent_prepared' else 'solo_self_attested' end;
  end if;

  -- THE P&L → RETAINED-EARNINGS ROLL, from DB-owned inputs only: trial_balance_as_of at
  -- ends_on minus at starts_on-1, restricted to P&L types by an EXPLICIT coa join (the
  -- read carries no type). Per-account movement = what the closing entry zeroes.
  select coalesce(jsonb_agg(jsonb_build_object('account_code', m.account_code,
           'account_type', m.account_type, 'movement_cents', m.mv)
         order by m.account_code), '[]'::jsonb),
         coalesce(sum(case when m.account_type = 'income' then -m.mv else 0 end)
                - sum(case when m.account_type = 'expense' then m.mv else 0 end), 0)
    into v_pl_rows, v_pl
    from (
      select a.account_code, a.account_type,
             coalesce(te.debit_cents - te.credit_cents, 0)
           - coalesce(ts.debit_cents - ts.credit_cents, 0) as mv
        from clara.coa_accounts a
        left join clara.trial_balance_as_of(v_fy.client_id, v_fy.ends_on) te
          on te.account_code = a.account_code
        left join clara.trial_balance_as_of(v_fy.client_id, v_fy.starts_on - 1) ts
          on ts.account_code = a.account_code
        where a.client_id = v_fy.client_id and a.account_type in ('income', 'expense')
    ) m
    where m.mv <> 0;

  -- THE RETAINED-EARNINGS RESOLUTION: the chart's own structural marker
  -- (special_acc_type = 'retained_earnings'), exactly one active -- else the close cannot
  -- know where the year rolls, and says so.
  select count(*)::int, min(a.account_code) into v_re_n, v_re
    from clara.coa_accounts a
    where a.client_id = v_fy.client_id and a.is_active
      and a.special_acc_type = 'retained_earnings';
  if v_re_n <> 1 then
    raise exception 'the chart carries % active retained-earnings account(s) (special_acc_type=''retained_earnings''); the close needs exactly one', v_re_n
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'drawer1_state_unknown',
          'resolution', 'special_acc_type=retained_earnings', 'count', v_re_n)::text;
  end if;

  -- THE OPENING-SIDE TIE against the PRIOR receipt's PIN (never a re-derivation where a
  -- pin exists; matrix A19g's close arm). First FY / pre-model prior: the Wave-B opening
  -- machinery asserted the seed (recorded in the snapshot, not re-argued).
  select cr.* into v_prior_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = v_fy.prior_fy_id and cr.kind = 'close' and cr.status = 'active';
  if v_fy.prior_fy_id is not null and v_prior_receipt.id is null then
    raise exception 'the prior fiscal year carries no active close receipt; the opening continuity pin is unprovable -- close the prior year first'
      using errcode = 'CLR41',
        detail = '{"reason":"drawer1_identity_failed","check_key":"opening_continuity_tie","refusal":"prior_close_receipt_missing"}';
  end if;
  if v_prior_receipt.id is not null then
    v_pin := v_prior_receipt.snapshot -> 'closing_position';
    select coalesce(jsonb_agg(jsonb_build_object('account_code', d.code,
             'pinned_cents', d.pin, 'current_cents', d.cur) order by d.code), '[]'::jsonb)
      into v_open_diffs
      from (
        select coalesce(p.key, t.account_code) as code,
               coalesce((p.value ->> 0)::bigint, (p.value)::text::bigint, 0) as pin,
               coalesce(t.debit_cents - t.credit_cents, 0) as cur
          from jsonb_each(coalesce(v_pin, '{}'::jsonb)) p(key, value)
          full outer join (
            select tb.account_code, tb.debit_cents, tb.credit_cents
              from clara.trial_balance_as_of(v_fy.client_id, v_fy.starts_on - 1) tb
              join clara.coa_accounts a on a.client_id = v_fy.client_id
               and a.account_code = tb.account_code
              where a.account_type in ('asset', 'liability', 'equity')
          ) t on t.account_code = p.key
      ) d
      where d.pin <> d.cur;
    if jsonb_array_length(v_open_diffs) > 0 then
      raise exception 'this year''s opening no longer ties to the prior close''s pinned position -- the identity is absolute, with no override, for anybody'
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'drawer1_identity_failed',
            'check_key', 'opening_continuity_tie', 'diffs', v_open_diffs)::text;
    end if;
  end if;

  -- THE CLOSING ENTRY: permit → DRAFT insert → lines → the census-VISIBLE flip. A year
  -- with zero P&L movement mints no entry (an empty entry is not a journal), and the
  -- receipt records that honestly.
  v_receipt := gen_random_uuid();
  select coalesce(jsonb_agg(cr2.id), '[]'::jsonb) into v_reopen_settled
    from clara.close_receipts cr2
    where cr2.fiscal_year_id = v_fy.id and cr2.kind = 'reopen' and cr2.status = 'active';
  update clara.close_receipts set status = 'superseded'
    where fiscal_year_id = v_fy.id and kind = 'reopen' and status = 'active';
  if jsonb_array_length(v_pl_rows) > 0 then
    v_entry := gen_random_uuid();
    insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id, close_run_id,
        purpose, target_entry_id, entries_expected)
      values (c.firm, v_fy.client_id, v_fy.id, v_run.id, 'close_entry', v_entry, 1)
      returning id into v_permit;
    insert into clara.journal_entries(id, client_id, status, posting_date, memo, origin,
        is_year_end, maker_actor, last_human_editor, close_receipt_id, closing_transfer)
      values (v_entry, v_fy.client_id, 'draft', v_fy.ends_on,
        'Year-end close ' || v_fy.label || ' — P&L to retained earnings', 'manual',
        true, c.actor, c.actor, v_receipt,
        -- TASK #17 FIX A: born marked. Before this fix the column stayed at its default false
        -- forever -- this entry is auto-approved in THIS SAME transaction, so it never sits as
        -- an editable draft revise_entry could later mark -- and the SST turnover evaluator's
        -- `not (is_year_end and closing_transfer)` exclusion never fired: the entry's income-leg
        -- DEBIT (zeroing the account the evaluator sums as credit-minus-debit) counted, and every
        -- year-end roll DEFLATED the rolling figure -- permanent SUPPRESSION of the 80%
        -- early-warning ladder, never a false alarm (measured direction, T7). A single-body fix
        -- (this one alone, without the reopen mirror below) would leave the mirror's own debit
        -- unmarked on every reopened-then-reclosed year, reproducing the SAME suppression a
        -- second time -- which is why both bodies are marked in this one migration (D-23, GM-7).
        true);
    v_line := 0;
    for r in select * from jsonb_array_elements(v_pl_rows) x(el) loop
      v_line := v_line + 1;
      insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
          credit_cents, description)
        values (v_entry, v_line, r.el ->> 'account_code',
          case when (r.el ->> 'movement_cents')::bigint < 0
               then -(r.el ->> 'movement_cents')::bigint else 0 end,
          case when (r.el ->> 'movement_cents')::bigint > 0
               then (r.el ->> 'movement_cents')::bigint else 0 end,
          'Close ' || (r.el ->> 'account_type'));
    end loop;
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, v_line, v_re,
        case when v_pl < 0 then -v_pl else 0 end,
        case when v_pl > 0 then v_pl else 0 end,
        'Net result to retained earnings');
    perform clara._assert_balanced(v_entry);
    update clara.journal_entries set status='approved', approved_at = now(),
        checker_actor = c.actor
      where id = v_entry;
    perform clara._subledger_on_approve(v_entry);
    select count(*) into v_n from clara.open_items oi where oi.entry_id = v_entry;
    if v_n <> 0 then
      raise exception 'the closing entry minted % open item(s) -- a P&L→RE close must move no subledger', v_n
        using errcode = 'CLR41',
          detail = '{"reason":"drawer1_identity_failed","check_key":"pl_retained_earnings_roll"}';
    end if;
  end if;

  -- THE PIN: the per-balance-sheet-account closing position IN CENTS, read AFTER the
  -- closing entry posted (drawer 1's stored operand for FY(n+1); matrix A19f).
  select coalesce(jsonb_object_agg(t.account_code, (t.debit_cents - t.credit_cents)), '{}'::jsonb)
    into v_closing_pos
    from clara.trial_balance_as_of(v_fy.client_id, v_fy.ends_on) t
    join clara.coa_accounts a on a.client_id = v_fy.client_id
     and a.account_code = t.account_code
    where a.account_type in ('asset', 'liability', 'equity')
      and (t.debit_cents - t.credit_cents) <> 0;

  v_fa := clara.fa_control_tie_out(v_fy.client_id, v_fy.id);
  select md5(count(*)::text || coalesce(max(je.approved_at)::text, ''))
    into v_watermark
    from clara.journal_entries je
    where je.client_id = v_fy.client_id and je.status = 'approved';

  insert into clara.close_receipts(id, firm_id, client_id, fiscal_year_id, close_run_id,
      prior_close_receipt_id, kind, closed_by, segregation_mode, last_preparer_actor,
      self_attestation, pl_net_cents, retained_earnings_account, closing_tb_digest,
      gate_digest, books_watermark, dataset_sha256, close_entry_id, snapshot)
    values (v_receipt, c.firm, v_fy.client_id, v_fy.id, v_run.id,
      v_prior_receipt.id, 'close', c.actor, v_mode, v_human_preparer,
      nullif(btrim(coalesce(p_self_attestation, '')), ''), v_pl, v_re,
      md5(v_closing_pos::text), md5(v_gate_summary::text), v_watermark,
      encode(sha256(convert_to(v_closing_pos::text, 'UTF8')), 'hex'), v_entry,
      jsonb_build_object(
        'closing_position', v_closing_pos,
        'fy_end_source', v_fy.fy_end_source,
        'superseded_reopen_receipt_ids', v_reopen_settled,
        'gates', v_gate_summary,
        'attestations', coalesce((select jsonb_agg(jsonb_build_object('check_key', a.check_key,
            'item_key', a.item_key,
            'attested_by', a.attested_by, 'reason', a.reason, 'attested_at', a.attested_at,
            'gate_result_id', a.gate_result_id, 'superseded', a.superseded_at is not null)
            order by a.attested_at)
          from clara.close_attestations a where a.close_run_id = v_run.id), '[]'::jsonb),
        'pl_rows', v_pl_rows,
        'fa_roll', v_fa,
        'opening_tie', case when v_prior_receipt.id is not null
          then jsonb_build_object('basis', 'prior_receipt_pin',
                 'prior_receipt_id', v_prior_receipt.id, 'diffs', '[]'::jsonb)
          else jsonb_build_object('basis', 'wave_b_opening_machinery',
                 'note', 'no prior close receipt; the seed tie was asserted at approval') end,
        'watermark_basis', 'v1_count_maxapproved',
        'dataset_basis', 'v1_closing_position_sha256'));

  update clara.close_runs set state = 'finalized', ended_by = c.actor, ended_at = now()
    where id = v_run.id;
  update clara.fiscal_years set status = 'closed' where id = p_fy;

  perform clara._audit(c.firm, c.actor, null, null, 'finalize_close', v_entry,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run.id,
      'receipt_id', v_receipt, 'pl_net_cents', v_pl, 'segregation_mode', v_mode,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.finalized', v_fy.client_id, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'receipt_id', v_receipt));
  return clara._finish_op(c.firm, 'finalize_close', p_op_key,
    jsonb_build_object('receipt_id', v_receipt, 'fiscal_year_id', p_fy,
      'close_entry_id', v_entry, 'pl_net_cents', v_pl,
      'retained_earnings_account', v_re, 'segregation_mode', v_mode));
end $function$;

-- =================================================================================================
-- §C · B1-8 — clara.reopen_fiscal_year: Fix A's mirror + §3.9 change 4 (the segregation re-aim).
-- =================================================================================================
create or replace function clara.reopen_fiscal_year(p_fy uuid, p_reason text, p_correction_target jsonb, p_op_key text, p_attestation text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_fy record; v_dedupe jsonb; v_receipt record; v_entry uuid;
  v_new_receipt uuid; v_target_ok boolean := false; e uuid;
  v_mirror uuid; v_permit uuid; v_used int; v_n int; v_posted date; v_status text;
  v_eligible int; v_checked uuid; v_attest text; v_self boolean; v_agent_prepared boolean; v_mode text;
  v_reversal jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'reopen') then
    raise exception 'reopening a closed year takes the reopen capability (key 3)'
      using errcode = 'CLR04', detail = '{"reason":"capability_missing","capability":"reopen"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'a reopen requires a stated reason (at least 10 characters)'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> c.firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  if p_correction_target is null or jsonb_typeof(p_correction_target) <> 'object' then
    raise exception 'a reopen names its correction target (entry_ids / document_id / check_key)'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  if p_correction_target ? 'entry_ids' then
    if jsonb_typeof(p_correction_target -> 'entry_ids') <> 'array' then
      raise exception 'entry_ids must be an array of entry ids'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    for e in select (x.v)::uuid from jsonb_array_elements_text(
        p_correction_target -> 'entry_ids') x(v) loop
      if e is null then
        raise exception 'a correction target entry id is null'
          using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
      end if;
      perform 1 from clara.journal_entries je
        where je.id = e and je.client_id = v_fy.client_id;
      if not found then
        raise exception 'correction target entry % is not in this client', e
          using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
      end if;
      v_target_ok := true;
    end loop;
  end if;
  if p_correction_target ? 'document_id' then
    perform 1 from clara.document_filings f
      where f.document_id = (p_correction_target ->> 'document_id')::uuid
        and f.client_id = v_fy.client_id and f.retired_at is null;
    if not found then
      raise exception 'correction target document is not filed to this client'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    v_target_ok := true;
  end if;
  if p_correction_target ? 'check_key' then
    perform 1 from clara.close_gate_checks k
      where k.check_key = p_correction_target ->> 'check_key';
    if not found then
      raise exception 'correction target gate is unknown'
        using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
    end if;
    v_target_ok := true;
  end if;
  if not v_target_ok then
    raise exception 'the correction target resolved to nothing auditable'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  perform 1 from clara.fiscal_years later
    where later.client_id = v_fy.client_id and later.ordinal > v_fy.ordinal
      and later.status in ('closing', 'closed');
  if found then
    raise exception 'a later fiscal year is closing or closed; reopen years newest-first'
      using errcode = 'CLR41', detail = '{"reason":"reopen_ordering_violation"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'reopen_fiscal_year', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy, 'reason', p_reason,
      'target', p_correction_target)));
  if v_dedupe is not null then return v_dedupe; end if;

  select cr.* into v_receipt from clara.close_receipts cr
    where cr.fiscal_year_id = p_fy and cr.kind = 'close' and cr.status = 'active';
  if v_receipt.id is null then
    raise exception 'no active close receipt exists for this fiscal year'
      using errcode = 'CLR10', detail = '{"reason":"reopen_target_missing"}';
  end if;
  v_entry := v_receipt.close_entry_id;
  if v_entry is not null then
    perform 1 from clara.journal_entries je where je.id = v_entry for update;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status <> 'closed' then
    raise exception 'fiscal year % is %; only a closed year reopens', v_fy.label, v_fy.status
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  perform 1 from clara.fiscal_years later
    where later.client_id = v_fy.client_id and later.ordinal > v_fy.ordinal
      and later.status in ('closing', 'closed');
  if found then
    raise exception 'a later fiscal year is closing or closed; reopen years newest-first'
      using errcode = 'CLR41', detail = '{"reason":"reopen_ordering_violation"}';
  end if;

  -- SEGREGATION ON THE REVERSAL -- unchanged (TA-P6 touches none of the four CLR05 arms; they
  -- measure the REVERSAL act's signer, a different question from who prepared the year).
  v_eligible := clara.eligible_checker_count(c.firm);
  select je.checker_actor into v_checked from clara.journal_entries je where je.id = v_entry;
  v_checked := coalesce(v_checked, v_receipt.closed_by);
  v_attest  := nullif(btrim(coalesce(p_attestation, '')), '');
  if v_eligible = 0 then
    raise exception 'this firm has no eligible human checker; a signed close cannot be reversed'
      using errcode = 'CLR05', detail = '{"reason":"no_eligible_human"}';
  elsif v_checked is null and v_attest is null then
    raise exception 'the close being reopened records no accountable signer -- adopt its reversal with an explicit attestation'
      using errcode = 'CLR05', detail = '{"reason":"attestation_required"}';
  elsif v_eligible >= 2 and v_checked = c.actor then
    raise exception 'the reversal of a year-end close is high-stakes and needs a distinct checker: a close may not be reopened by the human who signed it -- a different eligible human holding the reopen capability must perform it'
      using errcode = 'CLR05', detail = '{"reason":"distinct_checker"}';
  elsif v_checked = c.actor and v_attest is null then
    raise exception 'the sole eligible human may reverse their own close only with an explicit attestation'
      using errcode = 'CLR05', detail = '{"reason":"self_attestation"}';
  end if;
  v_self := v_checked is null or v_checked = c.actor;
  -- §3.9 CHANGE 4 (gate GM-5, design D-19): the SAME agent-preparation probe finalize_close uses,
  -- with the SAME priority, added to the reopen's own two-value case -- the sentence TA-P6 ruled
  -- untruthful lived in THIS body too, inside the CoR window PR-1b already owns for Fix A's
  -- mirror. What does NOT move: the four CLR05 arms above, about the reversal act's signer.
  select exists (
      select 1 from clara.journal_entries je2
        where je2.client_id = v_fy.client_id
          and je2.posting_date between v_fy.starts_on and v_fy.ends_on
          and je2.status = 'approved'
          and je2.maker_actor = clara.agent_user_id()
          and je2.last_human_editor is null)
    into v_agent_prepared;
  v_mode := case when v_agent_prepared then 'agent_prepared'
                 when v_self then 'solo_self_attested' else 'two_person' end;
  if not v_self then v_attest := null; end if;

  if v_entry is not null then
    if clara._subledger_allocated_items_present(v_entry) then
      raise exception 'the closing entry carries allocated open items; unallocate before reopening'
        using errcode = 'CLR10', detail = '{"reason":"allocated_items_present"}';
    end if;
    if clara._bank_live_match_present(v_entry) then
      raise exception 'the closing entry is matched to a bank statement line; unmatch first'
        using errcode = 'CLR10', detail = '{"reason":"live_bank_match_present"}';
    end if;
    perform clara._fa_reversal_blocked(v_entry);
    perform clara._wdb_reversal_blocked(v_entry);
    v_mirror := gen_random_uuid();
    insert into clara.close_write_permits(firm_id, client_id, fiscal_year_id,
        close_run_id, purpose, target_entry_id, entries_expected)
      values (c.firm, v_fy.client_id, p_fy, v_receipt.close_run_id,
        'reopen_reversal', v_mirror, 1)
      returning id into v_permit;
    insert into clara.journal_entries(id, client_id, status, posting_date, memo, origin,
        resolution_id, is_opening_balance, is_year_end, tax_affecting,
        maker_actor, last_human_editor, reversal_of, reversal_reason, closing_transfer)
      select v_mirror, o.client_id, 'draft', v_fy.ends_on,
        'Prior-period adjustment: reversal of the year-end close for ' || v_fy.label,
        'reversal', o.resolution_id, o.is_opening_balance, o.is_year_end, o.tax_affecting,
        c.actor, c.actor, v_entry, p_reason,
        -- TASK #17 FIX A'S MIRROR: copy the original's own marker through rather than assert a
        -- fresh true. A reversal of a PRE-FIX closing entry (born false) does not silently
        -- launder its own history; a reversal of a POST-FIX one (born true, per §B above) carries
        -- the fact forward. Either way the mirror's classification matches what it undoes -- a
        -- single-body fix (marking only finalize_close) would leave the mirror false, and the
        -- mirror's own income-leg debit would then ALSO deflate the rolling figure, reproducing
        -- task #17's suppression on every reopen/reclose cycle -- which is why both bodies are
        -- marked in this one migration (D-23, GM-7).
        o.closing_transfer
        from clara.journal_entries o where o.id = v_entry;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      select v_mirror, l.line_no, l.account_code, l.credit_cents, l.debit_cents,
             l.description, l.counterparty_id
        from clara.journal_lines l where l.entry_id = v_entry order by l.line_no;
    perform clara._assert_balanced(v_mirror);
    update clara.journal_entries set status='approved', approved_at = now(),
        checker_actor = c.actor, self_approval_attestation = v_attest
      where id = v_mirror;
    perform clara._subledger_on_approve(v_mirror);
    select count(*) into v_n from clara.open_items oi where oi.entry_id = v_mirror;
    if v_n <> 0 then
      raise exception 'the reopen reversal minted % open item(s) -- unwinding a P&L roll must move no subledger', v_n
        using errcode = 'CLR41',
          detail = '{"reason":"drawer1_identity_failed","check_key":"pl_retained_earnings_roll"}';
    end if;
    select je.posting_date, je.status into v_posted, v_status
      from clara.journal_entries je where je.id = v_mirror;
    if v_posted is distinct from v_fy.ends_on or v_status is distinct from 'approved' then
      raise exception 'the reopen reversal did not land approved at the year end (posting_date %, status %)', v_posted, v_status
        using errcode = 'CLR41', detail = '{"reason":"drawer1_identity_failed"}';
    end if;
    select p.entries_used into v_used from clara.close_write_permits p where p.id = v_permit;
    if v_used is distinct from 1 then
      raise exception 'the reopen reversal permit records % consumption(s), expected exactly one', v_used
        using errcode = 'CLR19', detail = '{"reason":"write_into_closed_period"}';
    end if;
  end if;
  update clara.fiscal_years set status = 'reopened' where id = p_fy;
  if v_entry is not null then
    update clara.journal_entries
       set reversed_by = v_mirror,
           reversal_reason = 'Reopen ' || v_fy.label || ': ' || p_reason,
           updated_at = now()
     where id = v_entry;
  end if;
  v_reversal := case when v_mirror is null then
      jsonb_build_object('reversal_entry_id', null, 'reversal_posting_date', null,
        'reversal_permit_id', null, 'reversal_basis', 'no_closing_entry_to_reverse')
    else
      jsonb_build_object('reversal_entry_id', v_mirror, 'reversal_posting_date', v_fy.ends_on,
        'reversal_permit_id', v_permit,
        'reversal_basis', 'prior_period_adjustment_at_fiscal_year_end') end;
  update clara.close_receipts set status = 'superseded' where id = v_receipt.id;
  insert into clara.close_receipts(firm_id, client_id, fiscal_year_id, close_run_id,
      prior_close_receipt_id, kind, closed_by, segregation_mode, last_preparer_actor,
      self_attestation, pl_net_cents, retained_earnings_account, closing_tb_digest,
      gate_digest, books_watermark, dataset_sha256, close_entry_id, snapshot)
    values (c.firm, v_fy.client_id, p_fy, v_receipt.close_run_id, v_receipt.id, 'reopen',
      c.actor, v_mode, v_checked, v_attest,
      v_receipt.pl_net_cents, v_receipt.retained_earnings_account,
      v_receipt.closing_tb_digest, v_receipt.gate_digest, v_receipt.books_watermark,
      v_receipt.dataset_sha256, v_entry,
      jsonb_build_object('reason', p_reason, 'correction_target', p_correction_target,
        'superseded_receipt_id', v_receipt.id, 'reopened_by', c.actor,
        'segregation', jsonb_build_object('mode', v_mode, 'checked_actor', v_checked,
          'eligible_checker_count', v_eligible, 'attested', v_attest is not null,
          'basis', case when v_checked is null then 'orphan_close'
                        else 'closing_entry_checker_or_receipt_signer' end))
      || v_reversal)
    returning id into v_new_receipt;
  perform clara._audit(c.firm, c.actor, null, null, 'reopen_fiscal_year', v_entry,
    jsonb_build_object('fiscal_year_id', p_fy, 'reopen_receipt_id', v_new_receipt,
      'superseded_receipt_id', v_receipt.id, 'segregation_mode', v_mode,
      'op_key', p_op_key) || v_reversal);
  if v_mirror is not null then
    perform clara._audit(c.firm, c.actor, null, null, 'reopen_reversal', v_mirror,
      jsonb_build_object('fiscal_year_id', p_fy, 'reversed_entry_id', v_entry,
        'posting_date', v_fy.ends_on, 'permit_id', v_permit, 'op_key', p_op_key));
    perform clara._append_event(c.firm, 'entry.drafted', v_fy.client_id, c.actor,
      null, null, v_mirror, null, null, '{}'::jsonb);
    perform clara._append_event(c.firm, 'entry.approved', v_fy.client_id, c.actor,
      null, null, v_mirror, null, null, '{}'::jsonb);
    perform clara._append_event(c.firm, 'entry.reversed', v_fy.client_id, c.actor,
      null, null, v_entry, null, null, '{}'::jsonb);
  end if;
  perform clara._append_event(c.firm, 'fiscal_year.reopened', v_fy.client_id, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'reopen_receipt_id', v_new_receipt));
  return clara._finish_op(c.firm, 'reopen_fiscal_year', p_op_key,
    jsonb_build_object('reopen_receipt_id', v_new_receipt, 'fiscal_year_id', p_fy,
      'reversed_entry_id', v_entry, 'segregation_mode', v_mode) || v_reversal);
end $function$;

-- =================================================================================================
-- §D · B1-9 — clara.attest_close_exception: authorship (+ p_from_proposal), OQ-A4-8.
-- =================================================================================================
-- The p_from_proposal arm's ONE reference to clara.close_proposals (a PR-1c table, not created by
-- this file) is PLAIN STATIC SQL. MEASURED (settle report, gate B3): plpgsql does NOT resolve an
-- embedded relation at CREATE time, even with check_function_bodies=on -- Postgres validates a
-- plpgsql statement's catalog references at PLAN time, on first EXECUTION, never at function
-- creation (confirmed live: CREATE FUNCTION over a body naming a genuinely absent table succeeds
-- outright). A dynamic arm was never needed for this. The branch stays unreachable -- for every
-- call the estate has ever made -- until PR-1c ships the table and a caller starts passing a
-- non-null p_from_proposal; when it runs, it runs against a real table, no waiver surface owed.
--
-- DROP THE OLD 5-ARG OVERLOAD FIRST. Adding a trailing parameter changes the function's
-- argument-type signature, so CREATE OR REPLACE does not replace the existing 5-arg body — it
-- creates a SECOND overload beside it. A caller supplying all five original named arguments
-- (the sixth defaults) then resolves ambiguously between the two matching overloads (42725,
-- "is not unique") -- measured live: every existing caller of attest_close_exception broke this
-- way before this DROP was added. The signature genuinely changes (B1-9's own point), so the
-- old overload must go, not coexist.
drop function clara.attest_close_exception(uuid, text, text, text, text);
create or replace function clara.attest_close_exception(p_close_run uuid, p_check_key text, p_reason text, p_op_key text, p_item_key text DEFAULT NULL::text, p_from_proposal uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_run record; v_chk record; v_result record; v_dedupe jsonb;
  v_prior uuid; v_new uuid; v_fresh uuid; v_items text[]; v_item text;
  v_authored_by text; v_adopted_verbatim boolean; v_drafted_text text;
  v_proposal_state text; v_bound_digest text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'attesting a close exception takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'an attestation requires its reason -- who accepts this and why'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.id is null or v_run.firm_id <> c.firm then
    raise exception 'close run not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  if v_run.state <> 'in_progress' then
    raise exception 'this close run is %; only an in-progress run takes attestations', v_run.state
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  select * into v_chk from clara.close_gate_checks k where k.check_key = p_check_key;
  if v_chk.check_key is null then
    raise exception 'unknown close gate %', p_check_key
      using errcode = 'CLR10', detail = '{"reason":"fact_key_unknown"}';
  end if;
  if v_chk.drawer <> 2 then
    raise exception 'gate % lives in drawer %; only drawer-2 items are attestable -- a drawer-1 identity has no override, for anybody', p_check_key, v_chk.drawer
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'drawer1_identity_failed',
          'check_key', p_check_key, 'drawer', v_chk.drawer)::text;
  end if;
  -- The request hash includes p_from_proposal (Codex B2): a retried op_key whose PROPOSAL
  -- identity changed between calls must never replay the prior result -- adopting proposal A's
  -- text under a key minted for proposal B would silently misattribute authorship.
  v_dedupe := clara._reserve_op(c.firm, 'attest_close_exception', p_op_key,
    clara._hash(jsonb_build_object('run', p_close_run, 'check', p_check_key,
      'reason', p_reason, 'item', p_item_key, 'from_proposal', p_from_proposal)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_fresh := (clara._evaluate_one_gate(p_close_run, p_check_key) ->> 'result_id')::uuid;
  select * into v_result from clara.close_gate_results g where g.id = v_fresh;
  if v_result.state not in ('fail', 'unknown', 'error') then
    raise exception 'gate % just measured %; there is no exception to attest', p_check_key, v_result.state
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'attest_gate_not_failing',
          'check_key', p_check_key, 'state', v_result.state)::text;
  end if;
  v_items := clara._gate_outstanding_items(p_check_key, v_result.measured);
  if coalesce(array_length(v_items, 1), 0) > 0 then
    if p_item_key is null then
      raise exception 'gate % is itemized (% outstanding); attest each item by its key -- a blanket attestation is not the ruled shape', p_check_key, array_length(v_items, 1)
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'attest_item_required',
            'check_key', p_check_key, 'outstanding_items', to_jsonb(v_items))::text;
    end if;
    if not (p_item_key = any (v_items)) then
      raise exception 'item % is not outstanding on gate % as just measured', p_item_key, p_check_key
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'attest_item_unknown',
            'check_key', p_check_key, 'item_key', p_item_key,
            'outstanding_items', to_jsonb(v_items))::text;
    end if;
    v_item := p_item_key;
  else
    if p_item_key is not null then
      raise exception 'gate % carries no outstanding items to attest by key', p_check_key
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'attest_item_unknown',
            'check_key', p_check_key, 'item_key', p_item_key)::text;
    end if;
    v_item := '__gate__';
  end if;
  -- AUTHORSHIP (TA-P4 (5) / OQ-A4-8, design §3.9's closing paragraph). p_from_proposal NULL is
  -- every call the estate has ever made -- the human's own words, recorded honestly as such.
  -- Non-NULL means the review card (PR-3, once close_proposals exists) is adopting a drafted
  -- attestation; the door itself proves whether the adopted text changed, INSIDE the same
  -- transaction that measures the state being attested -- deriving adoption by string comparison
  -- AFTERWARDS is what law 27(2) refuses, not doing it here, once.
  if p_from_proposal is not null then
    -- STATIC SQL naming clara.close_proposals -- see the §D header note. Reads the proposal's
    -- state, its drafted text for this item, and the digest it bound (Annex E.4: bound_digests
    -- is {check_key: measured_digest}) in ONE statement.
    select cp.state, x.el ->> 'text', cp.bound_digests ->> p_check_key
      into v_proposal_state, v_drafted_text, v_bound_digest
      from clara.close_proposals cp, jsonb_array_elements(cp.drafted) x(el)
      where cp.id = p_from_proposal and cp.close_run_id = p_close_run
        and (x.el ->> 'check_key') = p_check_key and (x.el ->> 'item_key') = v_item
      limit 1;
    if v_drafted_text is null then
      raise exception 'proposal % names no drafted text for %/%', p_from_proposal, p_check_key, v_item
        using errcode = 'CLR10', detail = '{"reason":"attest_proposal_text_missing"}';
    end if;
    -- Codex B1: an adoption must bind a LIVE, OPEN proposal whose gate digest has not moved
    -- since it was proposed -- "a moved measurement invalidates it" (design close-key-1-
    -- design.md §3.7). Checked against v_result.measured_digest, the SAME fresh measurement
    -- this call already took above (never a second read that could itself drift).
    if v_proposal_state is distinct from 'open' then
      raise exception 'proposal % is % -- only an open proposal may be adopted', p_from_proposal, coalesce(v_proposal_state, 'unknown')
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'attest_proposal_not_open', 'state', v_proposal_state)::text;
    end if;
    if v_bound_digest is distinct from v_result.measured_digest then
      raise exception 'proposal % bound a measurement for % that has since MOVED -- re-propose against the fresh measurement', p_from_proposal, p_check_key
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'attest_proposal_digest_stale',
            'check_key', p_check_key, 'bound_digest', v_bound_digest,
            'fresh_digest', v_result.measured_digest)::text;
    end if;
    v_authored_by := 'agent';
    v_adopted_verbatim := (p_reason = v_drafted_text);
  else
    v_authored_by := 'human';
    v_adopted_verbatim := null;
  end if;
  select a.id into v_prior from clara.close_attestations a
    where a.close_run_id = p_close_run and a.check_key = p_check_key
      and a.item_key = v_item and a.superseded_at is null
    for update;
  v_new := gen_random_uuid();
  if v_prior is not null then
    update clara.close_attestations
      set superseded_by = v_new, superseded_at = now() where id = v_prior;
  end if;
  insert into clara.close_attestations(id, firm_id, close_run_id, check_key,
      gate_result_id, item_key, attested_by, reason, authored_by, adopted_verbatim)
    values (v_new, c.firm, p_close_run, p_check_key, v_result.id, v_item, c.actor, p_reason,
      v_authored_by, v_adopted_verbatim);
  perform clara._audit(c.firm, c.actor, null, null, 'attest_close_exception', null,
    jsonb_build_object('close_run_id', p_close_run, 'check_key', p_check_key,
      'item_key', v_item, 'attestation_id', v_new, 'gate_result_id', v_result.id,
      'measured_digest', v_result.measured_digest, 'authored_by', v_authored_by,
      'adopted_verbatim', v_adopted_verbatim, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.attested', v_run.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('close_run_id', p_close_run, 'check_key', p_check_key,
      'item_key', v_item, 'attestation_id', v_new));
  return clara._finish_op(c.firm, 'attest_close_exception', p_op_key,
    jsonb_build_object('attestation_id', v_new, 'check_key', p_check_key,
      'item_key', v_item,
      'gate_result_id', v_result.id, 'measured_digest', v_result.measured_digest,
      'superseded_id', v_prior, 'attested_by', c.actor, 'attested_at', now(),
      'reason', p_reason, 'authored_by', v_authored_by, 'adopted_verbatim', v_adopted_verbatim));
end $function$;
-- The DROP above took the old function's grants with it -- re-grant exactly as 0056 did,
-- against the NEW six-arg signature (measured: dropping loses the ACL, a bare CREATE OR
-- REPLACE on a signature that already existed would not have).
revoke all on function clara.attest_close_exception(uuid, text, text, text, text, uuid) from public;
grant execute on function clara.attest_close_exception(uuid, text, text, text, text, uuid)
  to clara_authenticated;

-- =================================================================================================
-- §E · B1-10/B1-11 — begin_close / abandon_close: body-move at the entrance seam (D-15, Annex A.8).
-- The cut is BELOW the human capability gate, not below _human_ctx -- the human entrance keeps
-- _human_ctx + the close_and_attest check; everything else moves into an ungranted core taking
-- p_firm/p_actor as arguments, carrying NEITHER wall (the agent core, PR-1c, brings its own).
-- =================================================================================================
create function clara._begin_close_core(p_firm uuid, p_actor uuid, p_fy uuid, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  v_fy record; v_dedupe jsonb; v_run uuid; v_summary jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.id is null or v_fy.firm_id <> p_firm then
    raise exception 'fiscal year is not in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(p_firm, 'begin_close', p_op_key,
    clara._hash(jsonb_build_object('fy', p_fy)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_fy.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_fy.client_id::text));
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  if v_fy.status not in ('open', 'reopened') then
    raise exception 'fiscal year % is %; a close can begin only on an open or reopened year', v_fy.label, v_fy.status
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'close_already_in_progress',
          'fy_status', v_fy.status)::text;
  end if;
  perform 1 from clara.fiscal_years earlier
    where earlier.client_id = v_fy.client_id and earlier.ordinal < v_fy.ordinal
      and earlier.status <> 'closed';
  if found then
    raise exception 'an earlier fiscal year is not closed; close years oldest-first'
      using errcode = 'CLR41', detail = '{"reason":"close_ordering_violation"}';
  end if;
  update clara.fiscal_years set status = 'closing' where id = p_fy;
  insert into clara.close_runs(firm_id, client_id, fiscal_year_id, started_by)
    values (p_firm, v_fy.client_id, p_fy, p_actor)
    returning id into v_run;
  v_summary := clara._evaluate_close_gates(v_run);
  perform clara._audit(p_firm, p_actor, null, null, 'begin_close', null,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'close.begun', v_fy.client_id, p_actor,
    null, null, null, null, null,
    jsonb_build_object('fiscal_year_id', p_fy, 'close_run_id', v_run));
  return clara._finish_op(p_firm, 'begin_close', p_op_key,
    jsonb_build_object('close_run_id', v_run, 'fiscal_year_id', p_fy, 'gates', v_summary));
end $function$;
revoke all on function clara._begin_close_core(uuid, uuid, uuid, text) from public;

create or replace function clara.begin_close(p_fy uuid, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'closing a fiscal year takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  return clara._begin_close_core(c.firm, c.actor, p_fy, p_op_key);
end $function$;

create function clara._abandon_close_core(p_firm uuid, p_actor uuid, p_close_run uuid, p_reason text, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_run record; v_dedupe jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'abandoning a close requires its reason'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.id is null or v_run.firm_id <> p_firm then
    raise exception 'close run not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  v_dedupe := clara._reserve_op(p_firm, 'abandon_close', p_op_key,
    clara._hash(jsonb_build_object('run', p_close_run, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform pg_advisory_xact_lock(203005004, hashtext(v_run.client_id::text));
  perform pg_advisory_xact_lock(203005007, hashtext(v_run.client_id::text));
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.state <> 'in_progress' then
    raise exception 'this close run is already %', v_run.state
      using errcode = 'CLR41', detail = '{"reason":"close_not_in_progress"}';
  end if;
  update clara.close_runs
    set state = 'abandoned', ended_by = p_actor, ended_at = now(), end_reason = p_reason
    where id = p_close_run;
  update clara.fiscal_years set status = 'open' where id = v_run.fiscal_year_id;
  perform clara._audit(p_firm, p_actor, null, null, 'abandon_close', null,
    jsonb_build_object('close_run_id', p_close_run, 'fiscal_year_id', v_run.fiscal_year_id,
      'op_key', p_op_key));
  perform clara._append_event(p_firm, 'close.abandoned', v_run.client_id, p_actor,
    null, null, null, null, null,
    jsonb_build_object('close_run_id', p_close_run, 'fiscal_year_id', v_run.fiscal_year_id));
  return clara._finish_op(p_firm, 'abandon_close', p_op_key,
    jsonb_build_object('close_run_id', p_close_run, 'state', 'abandoned',
      'fiscal_year_id', v_run.fiscal_year_id));
end $function$;
revoke all on function clara._abandon_close_core(uuid, uuid, uuid, text, text) from public;

create or replace function clara.abandon_close(p_close_run uuid, p_reason text, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'abandoning a close takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  return clara._abandon_close_core(c.firm, c.actor, p_close_run, p_reason, p_op_key);
end $function$;

-- =================================================================================================
-- §F · B1-12/B1-13 — open_fiscal_year / propose_fiscal_year: body-move (D-16, gate G2).
-- propose_fiscal_year ALSO opens its own _human_ctx today, called IN-BODY by open_fiscal_year --
-- a redundant second authentication in one transaction (gate G2's own finding). Both entrances
-- now delegate to _propose_fiscal_year_core, and _open_fiscal_year_core takes the honesty label
-- as an ARGUMENT rather than re-deriving it (Annex A.8's closing paragraph).
-- =================================================================================================
create function clara._propose_fiscal_year_core(p_firm uuid, p_client uuid, p_starts_on date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_m int; v_d int; v_fallback boolean; v_end date; v_y int;
begin
  perform 1 from clara.clients cl where cl.id = p_client and cl.firm_id = p_firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select coalesce(cl.fy_end_month, 12), coalesce(cl.fy_end_day, 31), cl.fy_end_month is null
    into v_m, v_d, v_fallback
    from clara.clients cl where cl.id = p_client;
  v_y := extract(year from p_starts_on)::int;
  v_end := make_date(v_y, v_m, 1) + (least(v_d,
    extract(day from (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::int) - 1);
  if v_end < p_starts_on then
    v_end := make_date(v_y + 1, v_m, 1) + (least(v_d,
      extract(day from (make_date(v_y + 1, v_m, 1) + interval '1 month - 1 day'))::int) - 1);
  end if;
  return jsonb_build_object('starts_on', p_starts_on, 'ends_on', v_end,
    'fy_end', jsonb_build_object('month', v_m, 'day', v_d, 'fallback', v_fallback));
end $function$;
revoke all on function clara._propose_fiscal_year_core(uuid, uuid, date) from public;

create or replace function clara.propose_fiscal_year(p_client uuid, p_starts_on date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._propose_fiscal_year_core(c.firm, p_client, p_starts_on);
end $function$;

create function clara._open_fiscal_year_core(p_firm uuid, p_actor uuid, p_client uuid, p_label text, p_starts_on date, p_ends_on date, p_length_reason text, p_op_key text, p_fy_end_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  v_firm_check uuid; v_dedupe jsonb; v_months numeric; v_prior record; v_id uuid; v_ordinal int;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm_check from clara.clients cl where cl.id = p_client;
  if v_firm_check is null or v_firm_check <> p_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_label is null or btrim(p_label) = '' or p_starts_on is null or p_ends_on is null
     or p_ends_on < p_starts_on then
    raise exception 'a fiscal year needs a label and a valid date range'
      using errcode = 'CLR10', detail = '{"reason":"fy_range_invalid"}';
  end if;
  v_months := (extract(year from age(p_ends_on + 1, p_starts_on)) * 12
             + extract(month from age(p_ends_on + 1, p_starts_on)))::numeric;
  if (v_months < 11 or v_months > 13)
     and (p_length_reason is null or btrim(p_length_reason) = '') then
    raise exception 'a fiscal year spanning ~% months needs its length_reason stated', v_months
      using errcode = 'CLR10', detail = '{"reason":"fy_length_reason_required"}';
  end if;
  if p_fy_end_source not in ('asserted', 'default_1231', 'asserted_by_file') then
    raise exception 'unknown fy_end_source %', p_fy_end_source using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(p_firm, 'open_fiscal_year', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'label', p_label,
      'starts_on', p_starts_on, 'ends_on', p_ends_on, 'length_reason', p_length_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into v_prior from clara.fiscal_years fy
    where fy.client_id = p_client order by fy.ordinal desc limit 1;
  v_ordinal := coalesce(v_prior.ordinal, 0) + 1;
  insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
      prior_fy_id, fy_end_source, length_reason, opened_by)
    values (p_firm, p_client, p_label, p_starts_on, p_ends_on, v_ordinal,
      v_prior.id, p_fy_end_source, nullif(btrim(coalesce(p_length_reason, '')), ''), p_actor)
    returning id into v_id;
  perform clara._audit(p_firm, p_actor, null, null, 'open_fiscal_year', null,
    jsonb_build_object('client', p_client, 'fiscal_year_id', v_id, 'ordinal', v_ordinal,
      'starts_on', p_starts_on, 'ends_on', p_ends_on, 'fy_end_source', p_fy_end_source,
      'op_key', p_op_key));
  perform clara._append_event(p_firm, 'fiscal_year.opened', p_client, p_actor,
    null, null, null, null, null,
    jsonb_build_object('fiscal_year_id', v_id, 'ordinal', v_ordinal));
  return clara._finish_op(p_firm, 'open_fiscal_year', p_op_key,
    jsonb_build_object('fiscal_year_id', v_id, 'ordinal', v_ordinal,
      'fy_end_source', p_fy_end_source, 'starts_on', p_starts_on, 'ends_on', p_ends_on));
end $function$;
revoke all on function clara._open_fiscal_year_core(uuid, uuid, uuid, text, date, date, text, text, text) from public;

create or replace function clara.open_fiscal_year(p_client uuid, p_label text, p_starts_on date, p_ends_on date, p_length_reason text, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare c record; v_proposal jsonb; v_source text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  -- The SAME case expression the live body always computed, now read against the extracted
  -- core's answer instead of the granted human verb's -- this entrance is already past its own
  -- _human_ctx(admin), and re-authenticating through propose_fiscal_year's _human_ctx(bookkeeper)
  -- a second time in the same transaction was gate G2's own finding, not a feature worth keeping.
  v_proposal := clara._propose_fiscal_year_core(c.firm, p_client, p_starts_on);
  v_source := case when (v_proposal #>> '{fy_end,fallback}')::boolean
                    and p_ends_on = (v_proposal ->> 'ends_on')::date
                   then 'default_1231' else 'asserted' end;
  return clara._open_fiscal_year_core(c.firm, c.actor, p_client, p_label, p_starts_on,
    p_ends_on, p_length_reason, p_op_key, v_source);
end $function$;

-- =================================================================================================
-- §G · B1-14 — mint_month_snapshot: body-move (D-21, TA-P1 C's snapshot mint).
-- =================================================================================================
create function clara._mint_month_snapshot_core(p_firm uuid, p_actor uuid, p_client uuid, p_month_start date, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  v_firm_check uuid; v_dedupe jsonb;
  v_start date; v_end date; v_period uuid; v_id uuid;
  v_dataset jsonb; v_sha text; v_watermark text;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  select cl.firm_id into v_firm_check from clara.clients cl where cl.id = p_client;
  if v_firm_check is null or v_firm_check <> p_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  if p_month_start is null then
    raise exception 'a month is required'
      using errcode = 'CLR10', detail = '{"reason":"month_required"}';
  end if;
  if p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'a month is named by its first day (% is not one)', p_month_start
      using errcode = 'CLR10', detail = '{"reason":"month_start_not_first_of_month"}';
  end if;
  v_start := p_month_start;
  v_end   := (date_trunc('month', p_month_start) + interval '1 month - 1 day')::date;
  if v_end > clara._book_today() then
    raise exception 'the month % .. % has not finished (books today is %) -- snapshot it once the period is complete',
      v_start, v_end, clara._book_today()
      using errcode = 'CLR10', detail = '{"reason":"period_not_complete"}';
  end if;
  v_dedupe := clara._reserve_op(p_firm, 'mint_month_snapshot', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'month_start', v_start)));
  if v_dedupe is not null then return v_dedupe; end if;

  if exists (
    select 1 from pg_locks l
     where l.locktype = 'advisory'
       and l.pid      = pg_backend_pid()
       and l.classid  = 203005007
       and l.objid    = hashtext(p_client::text)::oid
       and l.objsubid = 2
       and l.mode     = 'ShareLock'
       and l.granted) then
    raise exception 'mint must run in its own transaction -- a books write in this transaction already holds the client wall (203005007 shared), and minting would upgrade that lock'
      using errcode = 'CLR10', detail = '{"reason":"mint_lock_upgrade_refused"}';
  end if;

  perform pg_advisory_xact_lock(203005007, hashtext(p_client::text));

  v_period := clara._ensure_month_period(p_client, v_start, p_actor);

  select d, w into v_dataset, v_watermark
    from (select clara._snapshot_dataset(p_client, v_start, v_end) as d,
                 pg_current_snapshot()::text as w) s;
  v_sha := encode(clara._hash(v_dataset), 'hex');

  insert into clara.period_snapshots (firm_id, client_id, reporting_period_id, period_start,
      period_end, kind, minted_by, books_watermark, dataset_sha256, payload)
    values (p_firm, p_client, v_period, v_start, v_end, 'management_accounts', p_actor,
      v_watermark, v_sha, v_dataset)
    returning id into v_id;

  insert into clara.snapshot_assessments (snapshot_id, firm_id, assessment, reason,
      caused_by_table, caused_by_effect_date, assessed_by)
    values (v_id, p_firm, 'current', 'minted', null, null, p_actor);

  perform clara._audit(p_firm, p_actor, null, null, 'mint_month_snapshot', null,
    jsonb_build_object('client', p_client, 'snapshot_id', v_id, 'reporting_period_id', v_period,
      'period_start', v_start, 'period_end', v_end, 'dataset_sha256', v_sha,
      'books_watermark', v_watermark, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'snapshot.minted', p_client, p_actor,
    null, null, null, null, null,
    jsonb_build_object('snapshot_id', v_id, 'reporting_period_id', v_period,
      'period_start', v_start, 'period_end', v_end, 'kind', 'management_accounts'));

  return clara._finish_op(p_firm, 'mint_month_snapshot', p_op_key,
    jsonb_build_object('snapshot_id', v_id, 'reporting_period_id', v_period,
      'period_start', v_start, 'period_end', v_end, 'kind', 'management_accounts',
      'dataset_sha256', v_sha, 'books_watermark', v_watermark, 'state', 'current'));
end $function$;
revoke all on function clara._mint_month_snapshot_core(uuid, uuid, uuid, date, text) from public;

create or replace function clara.mint_month_snapshot(p_client uuid, p_month_start date, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._mint_month_snapshot_core(c.firm, c.actor, p_client, p_month_start, p_op_key);
end $function$;

-- =================================================================================================
-- §H · B1-15/B1-16 — the two agent_tasks trigger arms for 'close_prep' (D-27, gate G4).
-- Without these arms every clocked task INSERT/UPDATE would raise: the CHECK extension (B1-6)
-- alone yields a kind that can neither be born nor move. The new arm follows autodraft's
-- lifecycle verbatim, NOT the 'wake' arm's held-birth/held-to-cancelled-only rule, which
-- describes a task nothing in the estate can execute.
-- =================================================================================================
create or replace function clara._tf_agent_task_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_firm uuid; v_client uuid;
begin
  if new.kind='chat_turn' then
    if new.session_id is null then raise exception 'chat_turn task requires session_id' using errcode='CLR10'; end if;
    if new.origin_intent_id is not null then raise exception 'chat_turn task cannot carry origin_intent_id' using errcode='CLR10'; end if;
    select firm_id,client_id into v_firm,v_client from clara.chat_sessions where id=new.session_id;
    if v_firm is null then raise exception 'agent_task references unknown session %',new.session_id using errcode='CLR10'; end if;
    if new.status<>'queued' then raise exception 'a chat_turn task is created queued' using errcode='CLR10'; end if;
  elsif new.kind='wake' then
    if new.origin_intent_id is null then raise exception 'wake task requires origin_intent_id' using errcode='CLR10'; end if;
    if new.session_id is not null then raise exception 'wake task cannot carry session_id' using errcode='CLR10'; end if;
    select wi.firm_id,de.client_id into v_firm,v_client
      from clara.wake_intents wi join clara.domain_events de on de.id=wi.event_id
      where wi.id=new.origin_intent_id;
    if v_firm is null then raise exception 'wake task references unknown intent %',new.origin_intent_id using errcode='CLR10'; end if;
    if new.status<>'held' then raise exception 'a wake task is created held' using errcode='CLR10'; end if;
  elsif new.kind='autodraft' then
    v_firm:=new.firm_id; v_client:=new.client_id;
    if v_firm is null or v_client is null or new.session_id is not null
       or new.origin_intent_id is not null or new.status<>'queued'
       or nullif(btrim(new.model_snapshot),'') is null
       or not exists(select 1 from clara.clients c where c.id=v_client
          and c.firm_id=v_firm and c.status='active') then
      raise exception 'autodraft task requires prevalidated firm/client, no session/intent, queued status, and model snapshot'
        using errcode='CLR10';
    end if;
  elsif new.kind='close_prep' then
    -- The clock's execution path (design §3.3, D-27; gate G4): FOUR sites extend together, and
    -- this is the second. F-A3/F-A5 adopt this SAME arm rather than each minting their own
    -- (TA-P11) -- so a builder finding 'close_prep' hard-coded in F-A3's belt later is expected,
    -- not a layering violation.
    v_firm:=new.firm_id; v_client:=new.client_id;
    if v_firm is null or v_client is null or new.session_id is not null
       or new.origin_intent_id is not null or new.status<>'queued'
       or nullif(btrim(new.model_snapshot),'') is null
       or not exists(select 1 from clara.clients c where c.id=v_client
          and c.firm_id=v_firm and c.status='active') then
      raise exception 'close_prep task requires prevalidated firm/client, no session/intent, queued status, and model snapshot'
        using errcode='CLR10';
    end if;
  else
    raise exception 'unknown task kind %',new.kind using errcode='CLR10';
  end if;
  new.firm_id:=v_firm; new.client_id:=v_client; new.updated_at:=now();
  return new;
end $function$;

create or replace function clara._tf_agent_task_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_ok boolean;
begin
  if tg_op='DELETE' then raise exception 'agent_tasks are not deleted' using errcode='CLR08'; end if;
  if new.id<>old.id or new.firm_id<>old.firm_id
     or new.client_id is distinct from old.client_id or new.kind<>old.kind
     or new.origin_intent_id is distinct from old.origin_intent_id
     or new.session_id is distinct from old.session_id
     or new.turn_key is distinct from old.turn_key
     or new.created_by is distinct from old.created_by
     or new.model_snapshot is distinct from old.model_snapshot
     or new.created_at<>old.created_at then
    raise exception 'agent_task identity/config is immutable' using errcode='CLR08';
  end if;
  if new.status<>old.status then
    v_ok:=case
      when old.kind='chat_turn' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('awaiting_input','cancel_requested','completed','failed')
        when 'awaiting_input' then new.status in ('running','cancel_requested','expired','cancelled')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='wake' then old.status='held' and new.status='cancelled'
      when old.kind='autodraft' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='close_prep' then case old.status
        -- The autodraft lifecycle, verbatim (D-27) -- not the 'wake' arm's held-only rule.
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      else false end;
    if not v_ok then
      raise exception 'illegal agent_task transition % -> % (kind %)',old.status,new.status,old.kind
        using errcode='CLR13';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $function$;

reset role;

-- =================================================================================================
-- §TAIL · census + self-proofs. This is the evidence a reviewer reads, not "OK".
-- =================================================================================================
do $tail$
declare
  v_def text; v_src text; v_n int;
begin
  -- T.1 · the four extended CHECKs carry every value they should, and no existing value moved.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.close_receipts'::regclass and c.conname = 'close_receipts_segregation_mode_check';
  if position('two_person' in v_def) = 0 or position('solo_self_attested' in v_def) = 0
     or position('agent_prepared' in v_def) = 0 then
    raise exception 'f_a4_pr_1b tail: close_receipts_segregation_mode_check lost a value: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.fiscal_years'::regclass and c.conname = 'fiscal_years_fy_end_source_check';
  if position('asserted_by_file' in v_def) = 0 or position('default_1231' in v_def) = 0 then
    raise exception 'f_a4_pr_1b tail: fiscal_years_fy_end_source_check lost a value: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_kind_0011';
  if position('close_prep' in v_def) = 0 or position('interactive_client' in v_def) = 0 then
    raise exception 'f_a4_pr_1b tail: ck_wake_credentials_kind_0011 lost a value: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_client_0011';
  if position('close_prep' in v_def) = 0 or position('interactive_client' in v_def) = 0
     or position('autodraft' in v_def) = 0 then
    raise exception 'f_a4_pr_1b tail: ck_wake_credentials_client_0011 lost a disjunct: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.agent_tasks'::regclass and c.conname = 'ck_agent_tasks_kind_0011';
  if position('close_prep' in v_def) = 0 or position('chat_turn' in v_def) = 0
     or position('wake' in v_def) = 0 or position('autodraft' in v_def) = 0 then
    raise exception 'f_a4_pr_1b tail: ck_agent_tasks_kind_0011 lost a value: %', v_def using errcode='CLR10';
  end if;

  -- T.2 · task #17 Fix A, FORWARD-ONLY, FAIL-CLOSED: BOTH writer bodies born marking
  -- closing_transfer, or this migration does not apply. A single-body fix inverts the defect,
  -- so this is a structural conjunction, not two independent checks.
  -- POSITIONAL, not two independent substring hits (opus A-2): a mutant that keeps
  -- closing_transfer in the column list but writes FALSE in the VALUES clause would still pass
  -- two unlinked position() checks. Anchor on the column list's closing paren and require the
  -- NEXT `true)` (no ';' between them, so the match cannot spill into a later statement) to be
  -- the VALUES clause's own terminator -- the literal true this INSERT actually writes.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure;
  if v_src !~ 'close_receipt_id, closing_transfer\)[^;]*\n\s*true\)' then
    raise exception 'f_a4_pr_1b tail: task #17 Fix A -- finalize_close''s closing-entry INSERT does not write closing_transfer=true positionally in its VALUES clause' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure;
  if position('reversal_of, reversal_reason, closing_transfer)' in v_src) = 0
     or position('o.closing_transfer' in v_src) = 0 then
    raise exception 'f_a4_pr_1b tail: task #17 Fix A -- reopen_fiscal_year''s mirror INSERT does not copy closing_transfer through' using errcode='CLR10';
  end if;

  -- T.3 · TA-P6's re-aim landed in BOTH bodies that write segregation_mode.
  if position('agent_prepared' in (select p.prosrc from pg_proc p where p.oid = 'clara.finalize_close(uuid,text,text)'::regprocedure)) = 0 then
    raise exception 'f_a4_pr_1b tail: finalize_close does not compute agent_prepared' using errcode='CLR10';
  end if;
  if position('agent_prepared' in (select p.prosrc from pg_proc p where p.oid = 'clara.reopen_fiscal_year(uuid,text,jsonb,text,text)'::regprocedure)) = 0 then
    raise exception 'f_a4_pr_1b tail: reopen_fiscal_year does not compute agent_prepared' using errcode='CLR10';
  end if;

  -- T.4 · the entrance seam: both human bodies still open with _human_ctx + the SAME capability
  -- check they carried before (D-15's own proof obligation -- a moved check that silently
  -- vanished would darken key ① permanently, and one that silently duplicated would be a no-op
  -- disguised as a fix).
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.begin_close(uuid,text)'::regprocedure;
  if position('close_and_attest' in v_src) = 0 or position('_begin_close_core' in v_src) = 0 then
    raise exception 'f_a4_pr_1b tail: begin_close lost its capability gate or its delegate call' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.abandon_close(uuid,text,text)'::regprocedure;
  if position('close_and_attest' in v_src) = 0 or position('_abandon_close_core' in v_src) = 0 then
    raise exception 'f_a4_pr_1b tail: abandon_close lost its capability gate or its delegate call' using errcode='CLR10';
  end if;

  -- T.5 · zero PUBLIC / zero app-role EXECUTE on every new ungranted core (the estate's
  -- "reachable by no application role" pin, T17's own discipline).
  select count(*) into v_n
    from unnest(array['_begin_close_core(uuid,uuid,uuid,text)',
        '_abandon_close_core(uuid,uuid,uuid,text,text)',
        '_propose_fiscal_year_core(uuid,uuid,date)',
        '_open_fiscal_year_core(uuid,uuid,uuid,text,date,date,text,text,text)',
        '_mint_month_snapshot_core(uuid,uuid,uuid,date,text)']) sig(s)
    where has_function_privilege('clara_authenticated', ('clara.' || sig.s)::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', ('clara.' || sig.s)::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_wake_interactive', ('clara.' || sig.s)::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_wake_proactive', ('clara.' || sig.s)::regprocedure, 'EXECUTE')
       or has_function_privilege('clara_runtime', ('clara.' || sig.s)::regprocedure, 'EXECUTE')
       or has_function_privilege('public', ('clara.' || sig.s)::regprocedure, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'f_a4_pr_1b tail: % of the five new ungranted cores are reachable by an app role or PUBLIC', v_n using errcode='CLR10';
  end if;

  -- T.6 · the trigger arms exist and the CHECK-only-extension trap (G4) is closed.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_agent_task_insert()'::regprocedure;
  if position('close_prep' in v_src) = 0 then
    raise exception 'f_a4_pr_1b tail: _tf_agent_task_insert has no close_prep arm' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_agent_task_update()'::regprocedure;
  if position('close_prep' in v_src) = 0 then
    raise exception 'f_a4_pr_1b tail: _tf_agent_task_update has no close_prep arm' using errcode='CLR10';
  end if;

  raise notice 'f_a4_pr_1b tail: OK -- sixteen D1 rows applied (six ALTERs, eight writer CoRs, two trigger CoRs). Task #17 Fix A confirmed in BOTH finalize_close and reopen_fiscal_year''s closing-entry inserts (forward-only, fail-closed at apply -- a single-body fix would have aborted this transaction). TA-P6''s agent_prepared probe confirmed in both segregation computations. The begin_close/abandon_close entrance seam holds its capability gate and its new delegate call. All five new cores (_begin_close_core, _abandon_close_core, _propose_fiscal_year_core, _open_fiscal_year_core, _mint_month_snapshot_core) are reachable by no application role and no PUBLIC grant. Both agent_tasks trigger arms carry a close_prep case. wake_credentials/agent_tasks/close_receipts/fiscal_years CHECKs all extended with every prior value intact. No table in workflow/graphile_worker/spike touched.';
end $tail$;
