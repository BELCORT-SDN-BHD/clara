-- 0348_rate_wall_attempts_retention — #1046 (riders sweep wave, lane 07): THE TWO PRE-SESSION
-- RATE-WALL EVIDENCE TABLES GAIN A RETENTION SWEEP, WITHOUT WEAKENING EITHER WALL'S OWN COUNT.
-- =====================================================================================
-- Spec of record: issue #1046's Agent Brief (issue body; the issue carries zero comments and no
-- owner ruling). Parent: #871 / migration 0309, whose own header (lines 170-177) states the
-- constraint this file answers: "a retention lane must disable and re-enable that trigger inside
-- its OWN migration ... it cannot be written as a background job against the shipped surface."
-- Lane note (SWEEP-PLAN.md, "L7 is the hygiene lane"): "#1046 must disable and re-enable the
-- append-only trigger inside its own migration, which 0309:170-177 states in its own header; the
-- existing sweep cadence is pruneTraces() in packages/runtime/lib/reconciler.mjs:123-161, driven
-- from packages/runtime/lib/leader.mjs." Domain words: CONTEXT.md carries no new vocabulary here
-- — this is a maintenance act on two existing evidence tables, not a new domain entity.
--
-- =====================================================================================
-- THE GAP, MEASURED RATHER THAN RESTATED.
--
-- `clara.invite_preview_attempts` (0309) and `clara.confirmation_attempts` (0163) are both
-- APPEND-ONLY: `t_invite_preview_attempts_append_only` and `t_confirmation_attempts_append_only`
-- both fire `clara._tf_append_only()`, which raises `CLR08 "% is append-only"` UNCONDITIONALLY —
-- for every role, including the table's own owner (MEASURED: `set role clara_fn_owner; delete
-- from clara.invite_preview_attempts where attempted_at < now()` raises `invite_preview_attempts
-- is append-only`, inside a rolled-back transaction, on this lane's own database). TRUNCATE is
-- blocked the same unconditional way by `_tf_no_truncate()`. Neither table has ever had a sweep:
-- `grep -rn "confirmation_attempts" packages/db/migrations packages/runtime` outside 0163 and
-- 0309 themselves returns test files and read sites only, never a prune, retire or sweep verb —
-- so the brief's own question ("check how confirmation_attempts is retained today") is answered
-- here: it is not, and #1046's own brief says "if that table is not swept either, sweep both in
-- one ticket and say so." This file does.
--
-- WHY THIS GROWS FOREVER EVEN THOUGH THE WALL ITSELF NEVER READS AN OLD ROW. Both walls count a
-- fixed 15-minute window (`attempted_at > now() - interval '15 minutes'`, hardcoded identically
-- in `clara.preview_invite_by_token` (0309) and `clara.claim_confirmation_attempt` (0163)) and
-- are separately BOUNDED per key at five rows per 15 minutes (0309's own ADV-L05-04 fix; 0163
-- inherits the same "count before write" shape). But that bound is PER KEY
-- (token_hash/origin_digest, or email_digest/origin_digest) — the AGGREGATE table has no bound at
-- all, because a new key (a new invite token, a new sender address) opens a fresh five-row budget
-- forever. A row that ages out of the window is dead weight the wall will never read again, and
-- nothing has ever removed it.
--
-- =====================================================================================
-- WHY A PAIR OF VERBS, AND WHY EACH ONE DISABLES ITS OWN TRIGGER INSIDE ITSELF RATHER THAN AS A
-- ONE-SHOT STATEMENT IN THIS FILE'S OWN BODY.
--
-- `0176_counterparty_alias_kind_scope.sql` SS 3, `0215_counterparty_identity_provenance.sql` and
-- `0258_firm_setup_user_notes.sql` are this estate's precedent for "disable trigger, ONE backfill
-- statement, enable trigger, all inside the runner's own per-migration transaction" — but every
-- one of them runs ONCE, at apply time, over the rows that happen to exist then. A retention sweep
-- is not a one-time backfill: it must run again every time the reconciler's belt turns, against
-- whatever rows have aged past the margin BY THEN, which is a population this migration cannot see
-- at apply time. So the shape this file borrows is `0347`'s ("why a verb and not a bare insert"),
-- turned to the opposite purpose: a NAMED, IDEMPOTENT, REDO-SAFE verb that a caller can invoke
-- REPEATEDLY, each invocation disabling the append-only trigger, deleting its own bounded batch,
-- and re-enabling the trigger, ALL INSIDE ONE STATEMENT — so the disable is never observable
-- outside the transaction that also does the enable (verified live on this lane's database, in a
-- rolled-back transaction, before this file was written: a `security definer` function owned by
-- `clara_fn_owner`, called under `set role clara_runtime`, disabled the trigger, deleted zero
-- rows and re-enabled it, with no privilege error — `clara_runtime` holds no `ALTER TABLE` on
-- either relation and needs none, because the DEFINER's privilege is what the disable/enable runs
-- under). THAT is the sense in which "this migration" disables and re-enables the trigger: it
-- MINTS the verb that does so, on every call, for as long as the estate exists — a background job
-- against the shipped surface could never do this at all (`clara_runtime` cannot `ALTER TABLE` a
-- relation it does not own), which is exactly 0309's own sentence.
--
-- ONE VERB PER TABLE, NOT ONE SHARED VERB, because the two tables' column shapes differ
-- (`token_hash`/`origin_digest` vs `email_digest`/`origin_digest`/`outcome`/`settled_at`) and a
-- shared verb would need a table name passed as text, which either becomes dynamic SQL (a new
-- barrier for `apps/web/tests/firm-scope-db-pins.corpus.ts` to review for no real benefit) or a
-- hardcoded `if/else` that is no simpler than two functions. `clara.prune_trace_spans` (0006) and
-- `clara.prune_work_execution_traces` (0195) already established the "one prune verb per relation,
-- both riding the same runtime belt" shape this file follows.
--
-- =====================================================================================
-- THE SAFE MARGIN, AND WHY IT IS A REFUSAL RATHER THAN A CONVENTION THE CALLER MUST HONOUR.
--
-- The wall's own window is 15 minutes. A sweep that ran a prune with a threshold NEWER than
-- "now minus 15 minutes" could delete a row a concurrent count query still depends on — not
-- because of a race (both queries take their own `now()` once per statement; a threshold at or
-- before the window boundary can never outrun a count that uses the SAME boundary), but because a
-- FUTURE caller mistake (a wrong retention constant, an off-by-one in a unit conversion) would
-- otherwise corrupt an ACTIVE rate wall silently — the wall would simply admit calls it should
-- have refused, with no error anywhere. So each verb below REFUSES a `p_before` inside the wall's
-- own window, `CLR10`, rather than trusting every future caller to honour a convention documented
-- only in a comment. The runtime caller (packages/runtime/lib/reconciler.mjs — see below) computes
-- `p_before` from a retention constant of 60 minutes by default (four times the window: a safe
-- margin over the exact boundary, generous enough that ordinary reconciler-belt jitter, a slow
-- batch or a delayed leader handoff can never approach the 15-minute floor), so the floor is
-- ordinarily invisible; it exists for the mistake, not for the common path.
--
-- =====================================================================================
-- THE EXISTING CADENCE, AND WHY THIS FILE ADDS NO SCHEDULER.
--
-- `packages/runtime/lib/reconciler.mjs`'s `pruneTraces()` already runs on the belt
-- `runReconcilerSweep()` drives from `packages/runtime/lib/leader.mjs`, gated by
-- `iteration % PRUNE_EVERY === 0` (leader-guarded: exactly one process sweeps at a time) — the
-- SAME lane `prunedWorkTraces` rides beside `pruned` (trace spans) today, per that function's own
-- comment ("it runs here rather than on a timer of its own so 'bounded retention' is one pass an
-- operator can reason about"). This file mints the two SQL verbs; the accompanying runtime commit
-- adds two MORE counters to the SAME `pruneTraces()` function, calling these two verbs the same
-- batched-loop way `prune_trace_spans` and `prune_work_execution_traces` are already called, each
-- guarded against `undefined_function` (42883) so the belt stays inert on any database that has
-- not yet applied 0348 — the `prunedWorkTraces` precedent for a second relation riding the same
-- lane. No new `setInterval`, no new cron entry, no new belt.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT CHANGE, MEASURED IN THE TAIL RATHER THAN ASSERTED HERE.
--
-- The wall's window (15 minutes) and ceiling (5) — out of scope per #1046's own brief. Neither
-- `clara.preview_invite_by_token` nor `clara.claim_confirmation_attempt` is recut: both are pinned
-- in the prestate and re-hashed in the tail. Neither table's columns, indexes, RLS policy or
-- EXISTING triggers move: the append-only and no-truncate triggers on both tables are pinned by
-- NAME and by `tgenabled` before and after, and `clara._tf_append_only` / `clara._tf_no_truncate`
-- are pinned by `sha256(prosrc)` — this file calls them (indirectly, via the triggers it
-- disables and re-enables) but recuts neither.
--
-- Windows/portability note: `sha256(bytea) returns bytea` is core Postgres (14+); this estate has
-- no `pgcrypto` extension installed (measured: `select * from pg_extension where
-- extname='pgcrypto'` returns zero rows on this lane database), so every pin below uses
-- `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` — the exact idiom `0286`/`0347` and the rest
-- of this estate's prosrc pins already use, never `digest(...)`.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =================================================================================================
-- §0 — PRESTATE. Every premise this file relies on, MEASURED on the live catalog before anything
-- changes, and re-measured in the tail. The sha256 pins were taken on riders lane 07's database
-- (clara_l09) at 310 applied migrations / 0347_firm_setup_committed_tin_backfill, this lane's own
-- frontier — never transcribed from a creating migration's own header.
-- =================================================================================================
create temporary table _p1046_pre (k text primary key, v jsonb) on commit drop;

do $pre$
declare
  v_present int;
  v_mode text;
  v_sha text;
  v_names text;
  v_n int;
  -- Neighbour bodies this file relies on but does not recut: the two guard functions the two new
  -- verbs call indirectly (by disabling/re-enabling the triggers that invoke them), and the two
  -- doors whose 15-minute window this file's floor is built against.
  v_pins text[][] := array[
    ['clara._tf_append_only()',                     '160e47b6659868d98163ee8cde1f851e6b8e6d344439a321a42c32fdd161fbf6'],
    ['clara._tf_no_truncate()',                      'e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8'],
    ['clara.preview_invite_by_token(text,bytea)',     '5aafdea9a997fa20ebc13bbec7fead7c19a061176cf73514916c4afad71dbcd4'],
    ['clara.claim_confirmation_attempt(bytea,bytea)', '6cd4d9bffd7816b14db4fb27dbf443421777332374c07a5ef9416cf55a8d18d5']
  ];
  v_i int;
begin
  -- (a) FIRST OR REDO, AND NEVER HALF OF EITHER. This file mints exactly two objects, both
  -- functions; neither existed on this lane database before this file was written (measured: zero
  -- rows from `pg_proc` for either name). Both absent is FIRST; both present is the supported
  -- #957 REDO over this file's own effects (`create or replace function` makes every statement
  -- below survive a second run). Any other count is a half-applied database this file refuses
  -- rather than repairs.
  select (case when to_regprocedure('clara.prune_invite_preview_attempts(timestamptz,int)') is not null then 1 else 0 end)
       + (case when to_regprocedure('clara.prune_confirmation_attempts(timestamptz,int)') is not null then 1 else 0 end)
    into v_present;
  if v_present = 0 then
    v_mode := 'FIRST';
  elsif v_present = 2 then
    v_mode := 'REDO';
    raise notice '#1046 prestate: both prune verbs already present — this is a REDO (#957) over this file''s own effects.';
  else
    raise exception '#1046 prestate: % of this file''s two verbs are present — a half-applied state this file will not repair', v_present
      using errcode='CLR10';
  end if;
  insert into _p1046_pre values ('mode', to_jsonb(v_mode));

  -- (b) THE TWO RELATIONS EXIST.
  if to_regclass('clara.invite_preview_attempts') is null
     or to_regclass('clara.confirmation_attempts') is null then
    raise exception '#1046 prestate: clara.invite_preview_attempts (0309) and clara.confirmation_attempts (0163) must both exist'
      using errcode='CLR10';
  end if;

  -- (c) THE FOUR NEIGHBOUR BODIES, PINNED BY sha256(prosrc). Measured LIVE on this lane database
  -- now, per the wave-3 addendum rule ("pin what is LIVE, never a copied literal").
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#1046 prestate: % is absent', v_pins[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#1046 prestate: % has DRIFTED from its measured pre-image -- this file must not touch it, so re-measure before applying (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- (d) BOTH TABLES' TRIGGER ROSTER, BY NAME AND ENABLED STATE — the exact set this file's own
  -- verbs will disable one member of and re-enable, nothing else.
  select coalesce(string_agg(tgname || ':' || tgenabled::text, ',' order by tgname), '<none>') into v_names
    from pg_trigger where tgrelid = 'clara.invite_preview_attempts'::regclass and not tgisinternal;
  if v_names is distinct from 't_invite_preview_attempts_append_only:O,t_invite_preview_attempts_no_truncate:O' then
    raise exception '#1046 prestate: clara.invite_preview_attempts carries an unexpected trigger roster: %', v_names
      using errcode='CLR10';
  end if;
  insert into _p1046_pre values ('ipa_triggers', to_jsonb(v_names));

  select coalesce(string_agg(tgname || ':' || tgenabled::text, ',' order by tgname), '<none>') into v_names
    from pg_trigger where tgrelid = 'clara.confirmation_attempts'::regclass and not tgisinternal;
  if v_names is distinct from 't_confirmation_attempt_settle_stamp:O,t_confirmation_attempts_append_only:O,t_confirmation_attempts_no_truncate:O' then
    raise exception '#1046 prestate: clara.confirmation_attempts carries an unexpected trigger roster: %', v_names
      using errcode='CLR10';
  end if;
  insert into _p1046_pre values ('ca_triggers', to_jsonb(v_names));

  -- (e) BOTH TABLES' RLS POSTURE (forced, one owner policy) AND COLUMN COUNT.
  if not (select relrowsecurity and relforcerowsecurity
            from pg_class where oid = 'clara.invite_preview_attempts'::regclass) then
    raise exception '#1046 prestate: clara.invite_preview_attempts is not forced-RLS' using errcode='CLR10';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
            from pg_class where oid = 'clara.confirmation_attempts'::regclass) then
    raise exception '#1046 prestate: clara.confirmation_attempts is not forced-RLS' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='invite_preview_attempts';
  insert into _p1046_pre values ('ipa_cols', to_jsonb(v_n));
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='confirmation_attempts';
  insert into _p1046_pre values ('ca_cols', to_jsonb(v_n));

  -- (f) POPULATION AT APPLY TIME, RECORDED RATHER THAN ASSUMED — §B below smoke-calls each verb
  -- once over whatever rows this server actually holds (wave-3 addendum: "a data-dependent branch
  -- must be entered once").
  select count(*)::int into v_n from clara.invite_preview_attempts;
  insert into _p1046_pre values ('ipa_rows', to_jsonb(v_n));
  select count(*)::int into v_n from clara.confirmation_attempts;
  insert into _p1046_pre values ('ca_rows', to_jsonb(v_n));

  raise notice '#1046 prestate: clean (%) -- clara.invite_preview_attempts and clara.confirmation_attempts both exist, both forced-RLS, both carry the expected trigger roster, and the four neighbour bodies this file relies on are byte-identical to their measured pre-images. Population at apply time: % invite_preview_attempts row(s), % confirmation_attempts row(s).',
    v_mode,
    (select v from _p1046_pre where k = 'ipa_rows'),
    (select v from _p1046_pre where k = 'ca_rows');
end $pre$;

-- =================================================================================================
-- §A — TWO INDEXES, THEN THE TWO VERBS. Owned by clara_fn_owner (the table owner), so each verb's
-- SECURITY DEFINER run can disable and re-enable the append-only trigger it targets without any
-- caller ever holding ALTER TABLE. REDO-safe by construction (#957): `create index if not exists`,
-- `create or replace function`.
--
-- THE INDEXES FIRST. Neither table has an index led by `attempted_at`: both existing indexes are
-- composite and LED by the key column (`token_hash`/`origin_digest`, or `email_digest`), so a
-- plain `attempted_at < p_before` scan cannot use either one as a leading-column match. Without a
-- dedicated index, `order by attempted_at limit p_limit` would need to sort every row the WHERE
-- clause matches before taking the top batch — exactly the cost `clara.prune_trace_spans` (0006)
-- avoids with its own `ix_trace_spans_started on clara.trace_spans (started_at)`. This file adds
-- the same shape for both evidence tables.
-- =================================================================================================
set role clara_fn_owner;

create index if not exists ix_invite_preview_attempts_attempted_at
  on clara.invite_preview_attempts (attempted_at);
create index if not exists ix_confirmation_attempts_attempted_at
  on clara.confirmation_attempts (attempted_at);

create or replace function clara.prune_invite_preview_attempts(p_before timestamptz, p_limit int default 10000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_deleted bigint;
begin
  if p_before > now() - interval '15 minutes' then
    raise exception '#1046: prune_invite_preview_attempts refuses a threshold inside the wall''s own 15-minute window (got %, floor %)',
      p_before, (now() - interval '15 minutes') using errcode = 'CLR10';
  end if;
  alter table clara.invite_preview_attempts disable trigger t_invite_preview_attempts_append_only;
  with doomed as (
    select id from clara.invite_preview_attempts
     where attempted_at < p_before
     order by attempted_at
     limit greatest(p_limit, 0)
  )
  delete from clara.invite_preview_attempts t using doomed d where t.id = d.id;
  get diagnostics v_deleted = row_count;
  alter table clara.invite_preview_attempts enable trigger t_invite_preview_attempts_append_only;
  return jsonb_build_object('pruned_before', p_before, 'attempts_deleted', v_deleted);
end $$;

revoke execute on function clara.prune_invite_preview_attempts(timestamptz,int) from public;
grant execute on function clara.prune_invite_preview_attempts(timestamptz,int) to clara_runtime;
comment on function clara.prune_invite_preview_attempts(timestamptz,int) is
  '#1046: retention sweep for clara.invite_preview_attempts (0309''s own evidence table). Disables t_invite_preview_attempts_append_only, deletes rows strictly older than p_before (bounded by p_limit, oldest first), re-enables the trigger -- all inside this one call, which is the only way to prune a table whose append-only guard raises unconditionally for every role including its owner. Refuses (CLR10) a p_before inside the wall''s own 15-minute window, so a caller mistake cannot silently corrupt an active rate wall. clara_runtime only, called from packages/runtime/lib/reconciler.mjs pruneTraces() on the existing belt -- no new scheduler.';

create or replace function clara.prune_confirmation_attempts(p_before timestamptz, p_limit int default 10000)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_deleted bigint;
begin
  if p_before > now() - interval '15 minutes' then
    raise exception '#1046: prune_confirmation_attempts refuses a threshold inside the wall''s own 15-minute window (got %, floor %)',
      p_before, (now() - interval '15 minutes') using errcode = 'CLR10';
  end if;
  alter table clara.confirmation_attempts disable trigger t_confirmation_attempts_append_only;
  with doomed as (
    select id from clara.confirmation_attempts
     where attempted_at < p_before
     order by attempted_at
     limit greatest(p_limit, 0)
  )
  delete from clara.confirmation_attempts t using doomed d where t.id = d.id;
  get diagnostics v_deleted = row_count;
  alter table clara.confirmation_attempts enable trigger t_confirmation_attempts_append_only;
  return jsonb_build_object('pruned_before', p_before, 'attempts_deleted', v_deleted);
end $$;

revoke execute on function clara.prune_confirmation_attempts(timestamptz,int) from public;
grant execute on function clara.prune_confirmation_attempts(timestamptz,int) to clara_runtime;
comment on function clara.prune_confirmation_attempts(timestamptz,int) is
  '#1046: retention sweep for clara.confirmation_attempts (0163''s own evidence table). Same shape as clara.prune_invite_preview_attempts (0348): disables t_confirmation_attempts_append_only, deletes rows strictly older than p_before (bounded by p_limit, oldest first), re-enables the trigger, all inside this one call. Never touches t_confirmation_attempt_settle_stamp (the settle trigger, BEFORE UPDATE) -- this verb only deletes. Refuses (CLR10) a p_before inside the wall''s own 15-minute window. clara_runtime only, called from packages/runtime/lib/reconciler.mjs pruneTraces() on the existing belt -- no new scheduler.';

reset role;

-- =================================================================================================
-- §B — ONE FUNCTIONAL SMOKE CALL PER VERB, OVER WHATEVER ROWS THIS SERVER ACTUALLY HOLDS AT APPLY
-- TIME. A threshold two hours in the past can never trip the 15-minute floor and can never touch a
-- row inside either wall's live window, so this is safe on ANY database, populated or empty, and
-- it is what proves the disable/delete/enable sequence really executes rather than merely
-- type-checking — the wave-3 addendum's "a data-dependent branch must be entered once", entered
-- here for real rather than only in the accompanying test file.
-- =================================================================================================
do $applyB$
declare v_ipa jsonb; v_ca jsonb;
begin
  v_ipa := clara.prune_invite_preview_attempts(now() - interval '2 hours', 10000);
  v_ca := clara.prune_confirmation_attempts(now() - interval '2 hours', 10000);
  insert into _p1046_pre values ('apply_ipa', v_ipa);
  insert into _p1046_pre values ('apply_ca', v_ca);
  raise notice '#1046 apply: prune_invite_preview_attempts(now()-2h) -> %; prune_confirmation_attempts(now()-2h) -> %', v_ipa, v_ca;
end $applyB$;

-- =================================================================================================
-- §T — TAIL. Every premise re-measured, never trusted.
-- =================================================================================================
do $tail$
declare
  v_posture text;
  v_n int;
  v_names text;
  v_sha text;
  v_pre jsonb;
  v_pins text[][] := array[
    ['clara._tf_append_only()',                     '160e47b6659868d98163ee8cde1f851e6b8e6d344439a321a42c32fdd161fbf6'],
    ['clara._tf_no_truncate()',                      'e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8'],
    ['clara.preview_invite_by_token(text,bytea)',     '5aafdea9a997fa20ebc13bbec7fead7c19a061176cf73514916c4afad71dbcd4'],
    ['clara.claim_confirmation_attempt(bytea,bytea)', '6cd4d9bffd7816b14db4fb27dbf443421777332374c07a5ef9416cf55a8d18d5']
  ];
  v_i int;
  v_floor_raised boolean;
begin
  -- T.1 · BOTH VERBS INSTALLED WITH THE EXACT POSTURE: owned by clara_fn_owner, SECURITY DEFINER,
  -- VOLATILE, search_path pinned, EXECUTE granted to clara_fn_owner (implicit) and clara_runtime
  -- alone -- no PUBLIC, no human lane, no agent lane, no wake lane.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.prune_invite_preview_attempts(timestamptz,int)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | v | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#1046 tail T.1: clara.prune_invite_preview_attempts has the wrong posture; got {%}', v_posture
      using errcode = 'CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | ' || p.provolatile::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.prune_confirmation_attempts(timestamptz,int)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | true | v | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner' then
    raise exception '#1046 tail T.1: clara.prune_confirmation_attempts has the wrong posture; got {%}', v_posture
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara.prune_invite_preview_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.prune_invite_preview_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', 'clara.prune_invite_preview_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', 'clara.prune_invite_preview_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara.prune_invite_preview_attempts(timestamptz,int)'::regprocedure, 'execute') then
    raise exception '#1046 tail T.1: clara.prune_invite_preview_attempts is EXECUTE-reachable by a role it must not be'
      using errcode = 'CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara.prune_confirmation_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_agent_ro', 'clara.prune_confirmation_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_interactive', 'clara.prune_confirmation_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('clara_wake_proactive', 'clara.prune_confirmation_attempts(timestamptz,int)'::regprocedure, 'execute')
     or has_function_privilege('public', 'clara.prune_confirmation_attempts(timestamptz,int)'::regprocedure, 'execute') then
    raise exception '#1046 tail T.1: clara.prune_confirmation_attempts is EXECUTE-reachable by a role it must not be'
      using errcode = 'CLR10';
  end if;

  -- T.2 · THE FOUR NEIGHBOUR BODIES ARE BYTE-FOR-BYTE UNMOVED.
  for v_i in 1 .. array_length(v_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#1046 tail T.2: % MOVED while this file applied -- it must not have (measured %, expected %)',
        v_pins[v_i][1], v_sha, v_pins[v_i][2] using errcode='CLR10';
    end if;
  end loop;

  -- T.3 · BOTH TABLES' TRIGGER ROSTER IS UNMOVED -- this file's verbs disable and re-enable ONE
  -- member of each roster per call, and every call above already returned, so both must read back
  -- enabled exactly as the prestate found them.
  select coalesce(string_agg(tgname || ':' || tgenabled::text, ',' order by tgname), '<none>') into v_names
    from pg_trigger where tgrelid = 'clara.invite_preview_attempts'::regclass and not tgisinternal;
  if to_jsonb(v_names) is distinct from (select v from _p1046_pre where k = 'ipa_triggers') then
    raise exception '#1046 tail T.3: clara.invite_preview_attempts trigger roster moved (got %)', v_names
      using errcode='CLR10';
  end if;
  select coalesce(string_agg(tgname || ':' || tgenabled::text, ',' order by tgname), '<none>') into v_names
    from pg_trigger where tgrelid = 'clara.confirmation_attempts'::regclass and not tgisinternal;
  if to_jsonb(v_names) is distinct from (select v from _p1046_pre where k = 'ca_triggers') then
    raise exception '#1046 tail T.3: clara.confirmation_attempts trigger roster moved (got %)', v_names
      using errcode='CLR10';
  end if;

  -- T.4 · BOTH TABLES' RLS AND COLUMN COUNT ARE UNMOVED, AND NEITHER GAINED AN APPLICATION-ROLE
  -- TABLE GRANT (this file grants FUNCTION execute only, never a table privilege).
  if not (select relrowsecurity and relforcerowsecurity
            from pg_class where oid = 'clara.invite_preview_attempts'::regclass) then
    raise exception '#1046 tail T.4: clara.invite_preview_attempts lost forced RLS' using errcode='CLR10';
  end if;
  if not (select relrowsecurity and relforcerowsecurity
            from pg_class where oid = 'clara.confirmation_attempts'::regclass) then
    raise exception '#1046 tail T.4: clara.confirmation_attempts lost forced RLS' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='invite_preview_attempts';
  if to_jsonb(v_n) is distinct from (select v from _p1046_pre where k = 'ipa_cols') then
    raise exception '#1046 tail T.4: clara.invite_preview_attempts column count moved' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='confirmation_attempts';
  if to_jsonb(v_n) is distinct from (select v from _p1046_pre where k = 'ca_cols') then
    raise exception '#1046 tail T.4: clara.confirmation_attempts column count moved' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name in ('invite_preview_attempts','confirmation_attempts')
     and grantee <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception '#1046 tail T.4: an application role now holds a TABLE grant on one of the two evidence tables (%)', v_n
      using errcode='CLR10';
  end if;

  -- T.5 · THE FLOOR REFUSES A THRESHOLD INSIDE THE WINDOW, FOR BOTH VERBS -- driven, not asserted
  -- from the body text. The "did not refuse" failure is raised OUTSIDE the begin/exception block
  -- below, on purpose: raising it with errcode=CLR10 FROM INSIDE that same block would be caught
  -- by its own `exception when others`, whose `sqlstate <> 'CLR10'` guard would then read FALSE
  -- and silently treat "admitted" as "correctly refused" -- exactly the bug a first draft of this
  -- tail had, caught by running the vacuity control against a deliberately disabled floor (the
  -- call did not raise at all, and the tail still reported OK until this was fixed). A boolean
  -- flag, set only inside the handler and read only after the block ends, cannot be short-circuited
  -- that way.
  v_floor_raised := false;
  begin
    perform clara.prune_invite_preview_attempts(now(), 10000);
  exception when others then
    if sqlstate <> 'CLR10' then
      raise exception '#1046 tail T.5: prune_invite_preview_attempts refused the in-window threshold with the wrong sqlstate %', sqlstate
        using errcode='CLR10';
    end if;
    v_floor_raised := true;
  end;
  if not v_floor_raised then
    raise exception '#1046 tail T.5: prune_invite_preview_attempts admitted a threshold inside the window' using errcode='CLR10';
  end if;

  v_floor_raised := false;
  begin
    perform clara.prune_confirmation_attempts(now(), 10000);
  exception when others then
    if sqlstate <> 'CLR10' then
      raise exception '#1046 tail T.5: prune_confirmation_attempts refused the in-window threshold with the wrong sqlstate %', sqlstate
        using errcode='CLR10';
    end if;
    v_floor_raised := true;
  end;
  if not v_floor_raised then
    raise exception '#1046 tail T.5: prune_confirmation_attempts admitted a threshold inside the window' using errcode='CLR10';
  end if;

  -- T.6a · BOTH NEW INDEXES EXIST, LED BY attempted_at (the column the verbs' own ORDER BY uses).
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'clara.invite_preview_attempts'::regclass
                    and c.relname = 'ix_invite_preview_attempts_attempted_at') then
    raise exception '#1046 tail T.6a: ix_invite_preview_attempts_attempted_at did not install' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'clara.confirmation_attempts'::regclass
                    and c.relname = 'ix_confirmation_attempts_attempted_at') then
    raise exception '#1046 tail T.6a: ix_confirmation_attempts_attempted_at did not install' using errcode='CLR10';
  end if;

  -- T.6 · THE APPLY-TIME SMOKE CALL (§B) RETURNED A WELL-SHAPED ENVELOPE FOR BOTH VERBS.
  select v into v_pre from _p1046_pre where k = 'apply_ipa';
  if not (v_pre ? 'pruned_before' and v_pre ? 'attempts_deleted') then
    raise exception '#1046 tail T.6: the invite_preview_attempts smoke call returned an unexpected shape: %', v_pre
      using errcode='CLR10';
  end if;
  select v into v_pre from _p1046_pre where k = 'apply_ca';
  if not (v_pre ? 'pruned_before' and v_pre ? 'attempts_deleted') then
    raise exception '#1046 tail T.6: the confirmation_attempts smoke call returned an unexpected shape: %', v_pre
      using errcode='CLR10';
  end if;

  raise notice '#1046 tail: OK (%) -- clara.prune_invite_preview_attempts and clara.prune_confirmation_attempts both install SECURITY DEFINER, owned by clara_fn_owner, search_path pinned, EXECUTE-reachable by clara_runtime alone (no PUBLIC, no human lane, no agent lane, no wake lane); both refuse (CLR10) a threshold inside the wall''s own 15-minute window, driven rather than asserted; both tables'' trigger roster, RLS posture and column count are unmoved; neither table gained an application-role TABLE grant; both new attempted_at-led indexes exist; the four neighbour bodies this file depends on are byte-identical to their measured pre-images; and one real, apply-time call to each verb (threshold two hours in the past) returned a well-shaped envelope over whatever population this server actually held.',
    (select v #>> '{}' from _p1046_pre where k = 'mode');
end $tail$;
