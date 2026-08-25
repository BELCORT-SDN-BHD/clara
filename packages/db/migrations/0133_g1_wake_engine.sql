-- 0133_g1_wake_engine.sql — Gate G1: the universal wake-execution engine, DB half.
-- =================================================================================================
-- Number claimed at MERGE time (hard constraint 10) — 0133 (block state: W4 0129-0130, F-A6 0131,
-- F-A5b 0132). Design of record:
-- docs/plan/active/g1-wake-engine-survey.md (facts, as-found, at frontier 0127) +
-- g1-wake-engine-design.md (the ruled shape) + g1-wake-engine-annexes.md (exact DDL/bodies,
-- battery). Owner ruling 2026-08-25: mechanism (b) — the existing kind='wake' held projection
-- gains its ONE consumer plus a settlement path; close_prep (0120, MERGED) is GRANDFATHERED, not
-- retrofitted (survey §6). This file ships the DB half only; the runtime consumer
-- (packages/runtime/lib/wake-engine.mjs + reconciler-wake.mjs) is a companion, non-DB change.
--
-- SCOPE, EXACT:
--   G1-1  clara.wake_engine_sources     CREATE  the per-source registry (Annex A) — forced RLS,
--                                                owner-floor write, estate-wide read
--   G1-2  clara.set_wake_source_enabled CREATE  the registry's own writer (Annex A) — owner floor
--   G1-3  clara._tf_agent_task_update() CoR     the matrix delta (Annex B, D1) — the wake arm
--                                                gains held->running->{completed,failed,
--                                                cancel_requested}->{completed,failed,cancelled};
--                                                held->cancelled stays legal; every other kind's
--                                                arm is byte-identical to the live tip
--   G1-4  clara._tf_wakes_outbox_update() CoR   the settlement delta (Annex B, D1) — held->settled
--                                                joins held->cancelled as a lawful exit
--   G1-5  clara.wakes_outbox status CHECK ALTER gains 'settled' (dynamic-name lookup — the
--                                                inline-CHECK auto-name is measured, never assumed)
--   G1-6  clara._settle_wake_task()     CREATE  the settlement verb (Annex B) — writes BOTH
--                                                projections in ONE transaction, idempotent replay
--   G1-7  clara.mint_wake_credential()  CoR     TWO fixes, both required for close_prep credentials
--                                                to mint at all (D1): (a) the missing close_prep
--                                                ARM (Annex B — the design's own text); (b) the
--                                                missing close_prep membership in the EARLY kind
--                                                gate at the live body's own first `if` — see the
--                                                ANNEX-B CORRECTION note at §F below, a live-byte
--                                                finding this file's own prestate re-derives, not a
--                                                design claim trusted on its word (review law 3).
--   G1-9  clara.wake_engine_task_dead_letters CREATE the direct_queue carrier's OWN dead-letter
--                                                home (Annex D8) -- relay_dead_letters' sibling,
--                                                keyed on task_id (no event to key against)
--   G1-8  wake_engine_sources seed rows INSERT  bank_agent + close_prep, BOTH enabled=false at
--                                                birth (owner ruling, this build's settle report:
--                                                NO scaffold due-predicate or workflow body ships
--                                                in this gate for either source — F-A3 owns
--                                                bank_agent_run_due + bankAgent's real workflow;
--                                                F-A4 owns close_prep_due + closePrep's; each
--                                                registers/enables in its OWN follow-up PR, "rows
--                                                only" exactly as the design's rollout section (§5)
--                                                names it)
--   G1-10 clara.firms.is_operator      ALTER   round-2 (Codex-round MUST B / opus-round MUST D)
--                                                — see the item's own header below, §G1-10.
--
-- ROUND 3 (opus + Codex, both legs independently, after round 2 shipped) — this file's own DB-side
-- share of that round; the runtime-side items (M1/M2/M5/M6/S1/S6) and the doc items (M7/M8/DOC) are
-- companion changes outside this migration, in packages/runtime and docs/. Each is documented in
-- full at its own fix site below (search the item's own label); this is the index, not the proof:
--   M3  set_wake_source_enabled's estate-wide broadcast — narrowed to a MINIMAL, NON-AMPLIFYING
--       payload: {source, on} only (no operator user/firm uuid, no free-text reason), routed
--       through clara._audit (the sole-writer convention) instead of a direct audit_log insert, and
--       suppressed entirely on a repeated no-op flip. §G1-10's writer body, T.5d census.
--   M4  the close_prep matrix arm (§C, _tf_agent_task_update) admits queued->failed — the
--       poison-exhaustion terminal that pre-fix raised CLR13 (illegal transition), aborting the
--       WHOLE wake-engine cycle on every poisoned direct_queue claim. T.1 census.
--   S2  _settle_wake_task's error_code write is first-write-wins (a later replay's error_code
--       never overwrites an earlier cause) and refuses to attach an error_code to an already-
--       completed row — replacing the pre-fix coalesce(), which let a later non-null replay clobber
--       the first cause. §C, T.8 census.
--   S3  wake_engine_sources.task_kind gains ck_wes_task_kind_wake_owned — extend-only CHECK closing
--       the domain to ('wake','close_prep'), so a future registry row can never hand
--       _settle_wake_task authority over a kind it has no business touching (e.g. autodraft).
--       T.5e census.
--   S5  a partial index (kind) WHERE status='queued' on agent_tasks, backing
--       discoverDirectQueueFirms' own new ORDER BY (a runtime-side S5 half, indexed here). T.5f
--       census.
--
-- WHAT THIS FILE DOES NOT SHIP: clara.bank_agent_run_due, clara.close_prep_due, any
-- bankAgent.v1/closePrep.v1 workflow, any wake_fn_allowlist row for close_prep (F-A4's own
-- obligation — the allowlist is genuinely rows-only, unchanged since 0004, survey §4/§7 P-G1d),
-- GOVERNED_EGRESS_PURPOSES (not touched — no new egress purpose is minted by this gate). No new
-- PostgreSQL role is minted: clara_wake_bank / clara_wake_bank_login already exist (0121), so
-- they need no roles-bootstrap.sql entry from this file; this file mints no other role either.
--
-- D1 — WRITE-QUIESCE REQUIRED for this whole file (packages/db/README.md "Deploy contract"):
-- THREE live judgement-logic bodies replaced (_tf_agent_task_update, _tf_wakes_outbox_update,
-- mint_wake_credential) — the superseded-body law (this build's own memory lesson): each is
-- prosrc-SHA pinned at the EXACT rig-replayed frontier below, not the migration text that minted
-- it (bodies are spliced across generations). Run from merged main only.
--
-- Timeout is PRECAUTIONARY, not load-bearing: every statement here is DDL, CREATE OR REPLACE
-- FUNCTION over small already-indexed catalogs, or two-row INSERTs — no backfill, no table scan.
set local statement_timeout = '10min';
set role clara_fn_owner;

-- =================================================================================================
-- §0 · PRESTATE — measure every claim this file makes, abort on any drift rather than CoR a body
-- this branch never read (db-migrations.md's own rule; rig-replayed at frontier 0127).
-- =================================================================================================
-- Carries v_held_before across this file's SEPARATE `do $$ ... $$` blocks (each is its own
-- PL/pgSQL scope -- a local variable does NOT survive from §0 into §TAIL). Opus/Codex review,
-- NOTE L: a comment claiming "structurally guaranteed equal" is not itself evidence (review law
-- 2) -- §TAIL now does a REAL comparison against this persisted count, not a dead local.
create temporary table g1_wake_engine_census (held_before bigint not null);

do $prestate$
declare
  v_sha text;
  v_def text;
  v_held_before bigint;
begin
  -- 0.1 · prosrc-SHA pins on the FOUR live bodies this file CoRs, re-derived by THIS branch's
  -- own rig replay against the exact 0127 frontier (never trusted from a design doc's cite).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_agent_task_update()'::regprocedure;
  if v_sha is distinct from '6f8c67b80c05aa1e704c5021b7d737e87f9343861840ec3b5f791b74619900cc' then
    raise exception 'g1_wake_engine prestate: clara._tf_agent_task_update drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara._tf_wakes_outbox_update()'::regprocedure;
  if v_sha is distinct from '9c7e745eb74448f0f0e0ed0fcb117aaf8ae48cd31942b0ffa4b02c62399a5a62' then
    raise exception 'g1_wake_engine prestate: clara._tf_wakes_outbox_update drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'mint_wake_credential';
  if v_sha is distinct from '34366330acd785be615340dd5f271191608305a2a8b20318c19e900a6d821647' then
    raise exception 'g1_wake_engine prestate: clara.mint_wake_credential drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- MUST A (opus/Codex review): clara.cancel_agent_task (0006, otherwise untouched by this
  -- file) unconditionally cascades wakes_outbox held->cancelled on ANY status of the task
  -- itself -- correct only while 'held' was the sole cancellable wake state, which THIS file's
  -- own matrix delta breaks (running is now reachable). Pinned so the CoR below is proven a
  -- ONE-LINE guard addition, not a rewrite.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.cancel_agent_task(uuid,text)'::regprocedure;
  if v_sha is distinct from '2662c842fc9620c4a6113a6912d9c12c92648b921938f4eb9dfb54aed22d74ae' then
    raise exception 'g1_wake_engine prestate: clara.cancel_agent_task drifted from the pinned prosrc (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- 0.2 · the ANNEX-B CORRECTION, proven at the bytes (not trusted on the design's word — review
  -- law 3). The design's Annex B claims "the early kind-membership gate (0126:624) already
  -- admits close_prep, so no change is needed there." This branch's own rig replay shows the
  -- LIVE early gate's `not in (...)` list is exactly six members and close_prep is ABSENT:
  select p.prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'mint_wake_credential';
  if position('''interactive'',''proactive'',''autodraft'',''interactive_client'',''bank_agent'',''filing''' in v_def) = 0 then
    raise exception 'g1_wake_engine prestate: mint_wake_credential''s early kind-gate list is not at its expected pre-fix text (six members, close_prep absent) -- the ANNEX-B CORRECTION this file applies may already be superseded; re-derive before proceeding'
      using errcode = 'CLR10';
  end if;
  if position('close_prep' in v_def) > 0 then
    raise exception 'g1_wake_engine prestate: mint_wake_credential already carries a close_prep reference -- this file may already be applied'
      using errcode = 'CLR10';
  end if;

  -- 0.2b · cancel_agent_task's cascade is at its pre-fix (unconditional-on-task-status) shape --
  -- byte-checked, not merely sha-pinned, so a future reviewer can see exactly what changes.
  select p.prosrc into v_def from pg_proc p where p.oid = 'clara.cancel_agent_task(uuid,text)'::regprocedure;
  if position('where intent_id = t.origin_intent_id and status = ''held''' in v_def) = 0 then
    raise exception 'g1_wake_engine prestate: cancel_agent_task''s wakes_outbox cascade is not at its expected pre-fix text'
      using errcode = 'CLR10';
  end if;
  if position('t.status = ''held''' in v_def) > 0 then
    raise exception 'g1_wake_engine prestate: cancel_agent_task already carries a t.status=''held'' guard -- this file may already be applied'
      using errcode = 'CLR10';
  end if;

  -- 0.3 · wakes_outbox's status CHECK is at its pre-extension text (idempotency guard).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wakes_outbox'::regclass and c.conname = 'wakes_outbox_status_check';
  if v_def is null or position('settled' in v_def) > 0 then
    raise exception 'g1_wake_engine prestate: wakes_outbox_status_check is missing or already carries settled (got: %)', v_def
      using errcode = 'CLR10';
  end if;
  if position('held' in v_def) = 0 or position('cancelled' in v_def) = 0 then
    raise exception 'g1_wake_engine prestate: wakes_outbox_status_check does not carry its expected pre-extension pair (got: %)', v_def
      using errcode = 'CLR10';
  end if;

  -- 0.4 · none of this file's new objects exist yet.
  if to_regclass('clara.wake_engine_sources') is not null
     or to_regclass('clara.wake_engine_task_dead_letters') is not null
     or to_regprocedure('clara.set_wake_source_enabled(text,boolean,text,text)') is not null
     or to_regprocedure('clara._settle_wake_task(uuid,text,text)') is not null
     or exists(select 1 from information_schema.columns
         where table_schema='clara' and table_name='firms' and column_name='is_operator') then
    raise exception 'g1_wake_engine prestate: one or more Gate-G1 objects already exist'
      using errcode = 'CLR10';
  end if;

  -- 0.5 · the stranded-row cure's own premise: how many held wake rows exist RIGHT NOW, so the
  -- tail can prove this migration (pure DDL/trigger/INSERT-into-a-NEW-table — no UPDATE/INSERT/
  -- DELETE anywhere in this file against agent_tasks or wakes_outbox) leaves that count UNCHANGED.
  select count(*) into v_held_before from clara.agent_tasks where kind = 'wake' and status = 'held';
  insert into g1_wake_engine_census values (v_held_before);
  raise notice 'g1_wake_engine prestate: clean -- four live bodies at their pinned prosrc shas, the ANNEX-B CORRECTION confirmed at the bytes (close_prep absent from mint_wake_credential''s early gate), cancel_agent_task''s cascade confirmed at its pre-fix unconditional-on-task-status text, wakes_outbox_status_check at its pre-extension (held,cancelled) text, no Gate-G1 object exists yet, % held wake row(s) exist pre-migration (the stranded-row cure''s own baseline, persisted for a REAL tail comparison, not a dead local -- NOTE L).', v_held_before;
end $prestate$;

-- =================================================================================================
-- §A · G1-1/G1-2 — clara.wake_engine_sources (Annex A, verbatim) + its writer.
-- =================================================================================================
create table clara.wake_engine_sources (
  source_key      text primary key,
  carrier         text not null check (carrier in ('wake_outbox','direct_queue')),
  event_type      text,             -- required iff carrier='wake_outbox'
  task_kind       text not null,    -- 'wake' for wake_outbox sources; the direct kind otherwise
  wake_kind       text not null,    -- must be a live ck_wake_credentials_kind_0011 member
  workflow_export text not null,    -- e.g. 'bankAgent' -- informational; enforced only by the
                                     -- consumer's own registry lookup at dispatch, never a DB FK
                                     -- (the WDK registry lives in TypeScript, not the catalog)
  login_pool      text not null,
  max_attempts    int not null default 5 check (max_attempts > 0),
  enabled         boolean not null default false,
  disabled_reason text,
  enabled_by      uuid references clara.users(id),
  enabled_at      timestamptz,
  disabled_by     uuid references clara.users(id),
  disabled_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint ck_wes_event_type_carrier check (
    (carrier = 'wake_outbox' and event_type is not null)
    or (carrier = 'direct_queue' and event_type is null)),
  constraint ck_wes_enabled_audit check (
    (enabled = true and enabled_by is not null and enabled_at is not null)
    or (enabled = false)),
  -- S3 (both legs) -- CONSTRAIN task_kind to the WAKE-OWNED domain, extend-only. Without this,
  -- _settle_wake_task's own registry-driven kind filter (MUST B: `kind in (select task_kind
  -- from clara.wake_engine_sources)`) trusts WHATEVER is in this column -- a future registry
  -- row that (by mistake or otherwise) named task_kind='autodraft' would hand
  -- _settle_wake_task authority over autodraft tasks too, a domain it has no business touching
  -- (autodraft owns its own dedicated settlement path, settleAutoDraftTerminal). This CHECK is
  -- the closed-world floor for that trust: only 'wake' (carrier=wake_outbox) and 'close_prep'
  -- (carrier=direct_queue, the one live direct kind today) are admitted. EXTEND-ONLY: a future
  -- migration that registers a genuinely new direct_queue kind widens this CHECK explicitly, in
  -- the open, rather than the column silently accepting anything a plain INSERT supplies.
  constraint ck_wes_task_kind_wake_owned check (task_kind in ('wake','close_prep'))
);
alter table clara.wake_engine_sources enable row level security;
alter table clara.wake_engine_sources force row level security;
-- Owner-floor writer only; every role reads (this is estate configuration, not a secret) — the
-- db-migrations.md forced-RLS-plus-policy-pair rule, applied to a non-firm-scoped table exactly
-- the way wake_engine_sources' own comment below states.
create policy p_wes_owner on clara.wake_engine_sources
  for all to clara_fn_owner using (true) with check (true);
create policy p_wes_read on clara.wake_engine_sources
  for select to clara_authenticated, clara_runtime using (true);
grant select on clara.wake_engine_sources to clara_authenticated, clara_runtime;
comment on table clara.wake_engine_sources is
  'Gate G1: the wake-execution engine''s per-source registry. Estate configuration (owner-floor
   write, every human read); never DML''d by a Wave-G client-data reset. carrier=wake_outbox rows
   ride kind=''wake'' (the held projection); carrier=direct_queue rows ride their own already-live
   agent_tasks.kind (today, only close_prep). A row with enabled=false is registered but never
   claimed -- its held/queued rows accumulate visibly, counted by wakeEngineHealth, never silently.';

-- =================================================================================================
-- G1-10 — clara.firms.is_operator (Codex-round MUST B / opus-round MUST D -- the SAME finding,
-- independently reproduced by both reviewers; the consolidated fix order names it MUST D, so
-- later references in this file use that label). set_wake_source_enabled gates an
-- ESTATE-WIDE switch (no firm scoping in its own UPDATE — every firm's bank_agent work), but
-- `_human_ctx(role_rank('owner'))` alone proves only "owner of SOME firm" — including any test
-- fixture (Alara, Borneo, ROME PROPERTIES, ...). The design calls this door an "ENGINEERING/
-- OPERATOR door" (Annex A's own comment); operator identity is NOT owner-rank-inside-an-arbitrary-
-- tenant. Fix: a firm-level flag, defaulting false on every firm (including any seeded during this
-- migration's own apply), with AT MOST ONE true at a time (the partial unique index below) --
-- BELCORT, the one operator firm (constraint 13). No app-facing RPC ever sets this column: it is a
-- deploy-time/ops fact about the estate, set by a raw, audited DB act (mirroring how
-- clara_wake_bank_login's actual LOGIN+password lands via an operator ceremony, never an app RPC)
-- -- an app-facing setter would just relocate the same "who may call it" problem one level down.
-- No firm starts as operator, so set_wake_source_enabled is UNREACHABLE by anyone until that
-- ceremony runs -- correct fail-closed behaviour, not a gap.
alter table clara.firms add column is_operator boolean not null default false;
create unique index uq_firms_one_operator on clara.firms ((true)) where is_operator;
comment on column clara.firms.is_operator is
  'Gate G1 MUST D (Codex-round MUST B): true for EXACTLY the one operator firm (BELCORT, constraint 13), enforced by
   uq_firms_one_operator. Set ONLY by a raw, audited ops act -- never an app-facing RPC. Read by
   set_wake_source_enabled''s authority check; not a general-purpose "is this firm special" flag.';

-- The writer -- OPERATOR-ONLY (an estate-wide switch, not a per-client one; the owner-rank floor
-- from set_bank_agency_hold's shape, 0121:4484-4520, PLUS the operator-firm predicate MUST D adds
-- -- owner rank alone is necessary but not sufficient).
create or replace function clara.set_wake_source_enabled(p_source_key text, p_on boolean,
    p_reason text, p_op_key text) returns jsonb
 language plpgsql security definer set search_path to 'clara', 'pg_temp'
as $function$
declare c record; v_dedupe jsonb; v_reason text; v_was_enabled boolean; v_now_on boolean; v_firm_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists(select 1 from clara.firms where id = c.firm and is_operator) then
    raise exception 'set_wake_source_enabled is an operator-only door -- % is not the operator firm', c.firm
      using errcode='CLR04';
  end if;
  -- #2 (round-4 review, both legs) -- the SAME advisory-lock mutual exclusion the runtime claim
  -- path takes (packages/runtime/lib/wake-engine.mjs's own #2 comment) -- ordering THIS call
  -- strictly against an in-flight claim transaction on the SAME source, so a claim's own
  -- exists-check never reads a "stale enabled=true" snapshot the WHOLE way to its own commit
  -- while this flip lands concurrently. Zero grant footprint either side (pg_advisory_xact_lock
  -- needs no table ACL), auto-released at this call's own commit/rollback. Identical key format
  -- ('wake_source_gate:' || source_key) on both sides -- a mismatch here would silently defeat
  -- the whole mechanism, so this string is deliberately NOT reformatted independently.
  perform pg_advisory_xact_lock(hashtext('wake_source_gate:' || p_source_key)::bigint);
  -- #3 (round-4 review, both legs): FOR UPDATE makes this read+later-flip ATOMIC against a
  -- concurrent same-direction call -- without it, two overlapping calls can both read the SAME
  -- pre-flip v_was_enabled snapshot, both compute v_now_on IS DISTINCT FROM v_was_enabled as
  -- true, and both broadcast -- defeating M3's own no-op-suppression by racing it, not by
  -- disagreeing with it. Locking this row here means the SECOND call blocks until the first
  -- commits, then reads the POST-flip value -- its own is-distinct-from check then correctly
  -- sees no further change and stays silent. (This role, clara_fn_owner, OWNS this table, so
  -- FOR UPDATE here needs no extra grant the way the runtime claim path's own FOR SHARE would
  -- have on clara_runtime -- the two fixes use different mechanisms for exactly that reason.)
  select enabled into v_was_enabled from clara.wake_engine_sources where source_key = p_source_key for update;
  if not found then
    raise exception 'unknown wake-engine source %', p_source_key using errcode='CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required' using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_wake_source_enabled', p_op_key,
    clara._hash(jsonb_build_object('source', p_source_key, 'on', p_on, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  v_now_on := coalesce(p_on,false);
  update clara.wake_engine_sources set
      enabled = v_now_on,
      enabled_by = case when v_now_on then c.actor else enabled_by end,
      enabled_at = case when v_now_on then now() else enabled_at end,
      disabled_by = case when not v_now_on then c.actor else disabled_by end,
      disabled_at = case when not v_now_on then now() else disabled_at end,
      disabled_reason = case when not v_now_on then v_reason else disabled_reason end
    where source_key = p_source_key;

  perform clara._audit(c.firm, c.actor, null, null, 'set_wake_source_enabled', null,
    jsonb_build_object('source', p_source_key, 'on', v_now_on, 'reason', v_reason));

  -- MUST D (opus/Codex review, owner-ruled defect): this is an ESTATE-WIDE switch -- every
  -- firm's automation posture on this source changes the instant this call commits, not just
  -- the operator's own. audit_log is firm-scoped RLS, so without this only BELCORT's own trail
  -- would EVER show the flip happened -- every OTHER firm would have zero receipt that its
  -- automation was just switched on/off.
  --
  -- M3 (Codex MUST / opus NOTE-4, folded in) -- THREE fixes to the broadcast itself, all real
  -- findings against the FIRST draft of this block: (a) BROADCAST ONLY ON ACTUAL STATE CHANGE.
  -- _reserve_op's op_key dedup only catches the SAME op_key replayed -- a DIFFERENT op_key
  -- re-asserting the SAME already-current state (a habitual re-run, a periodic desired-state
  -- reassertion script) is not a dedup hit, so the pre-fix version broadcast EVERY time
  -- regardless, amplifying every OTHER firm's audit_log arbitrarily on pure no-ops. (b) THE
  -- PAYLOAD CARRIES ONLY {source, on} -- both already ESTATE-READABLE facts (p_wes_read grants
  -- every clara_authenticated member SELECT on wake_engine_sources directly, so neither is a
  -- new disclosure) -- never the free-text `reason` (unbounded, operator-authored prose with no
  -- business reason to land in a firm that did not ask for it) and never the operator firm's
  -- own uuid (a receiving firm has no legitimate use for it). (c) ROUTED THROUGH clara._audit,
  -- the SAME sole-writer convention the acting firm's own receipt above already uses, never a
  -- direct multi-row INSERT into audit_log -- with actor=NULL, since the receiving firm has no
  -- legitimate need to know WHICH specific operator-firm user flipped an estate-wide switch,
  -- only that it changed (the acting firm's own op-key-scoped receipt above, actor=c.actor,
  -- stays exactly as informative as before -- only the BROADCAST copy is stripped).
  if v_now_on is distinct from coalesce(v_was_enabled, false) then
    for v_firm_id in (select id from clara.firms where id <> c.firm) loop
      perform clara._audit(v_firm_id, null, null, null, 'set_wake_source_enabled_estate_notice', null,
        jsonb_build_object('source', p_source_key, 'on', v_now_on));
    end loop;
  end if;

  return clara._finish_op(c.firm, 'set_wake_source_enabled', p_op_key,
    jsonb_build_object('source_key', p_source_key, 'on', v_now_on));
end $function$;
revoke all on function clara.set_wake_source_enabled(text,boolean,text,text) from public;
grant execute on function clara.set_wake_source_enabled(text,boolean,text,text) to clara_authenticated;

-- =================================================================================================
-- §B · G1-3 — clara._tf_agent_task_update() CoR: the matrix delta (Annex B, D1). Only the `wake`
-- `when` arm changes; every other arm is copied byte-identical from the live tip (proven by the
-- tail's own differential, never restated as an assumption).
-- =================================================================================================
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
      -- GATE G1 DELTA (design §1.3): the held-only rule that made a wake task unexecutable is
      -- widened to the SAME shape autodraft/close_prep already use, substituting 'held' for
      -- 'queued' as the birth state (drain.mjs still births every wake task 'held' -- the insert
      -- arm is UNCHANGED, survey §4/§7 P-G1a). held->cancelled stays legal (an operator cancel of
      -- a never-claimed wake). New: held->running (the engine's claim), running->{completed,
      -- failed,cancel_requested} (the workflow's own settlement or an operator cancel mid-run),
      -- cancel_requested->{completed,failed,cancelled} (mirrors reconcileTasks §C's own
      -- running->cancel_requested->cancelled repair-txn shape for a cancelled engine run).
      when old.kind='wake' then case old.status
        when 'held' then new.status in ('running','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='autodraft' then case old.status
        when 'queued' then new.status in ('running','cancel_requested','cancelled')
        when 'running' then new.status in ('completed','failed','cancel_requested')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind='close_prep' then case old.status
        -- The autodraft lifecycle (D-27) -- not the 'wake' arm's held-only rule -- PLUS ONE
        -- extend-only leg M4 (Codex+opus review) adds: queued->failed. wake-engine.mjs's own
        -- direct_queue carrier poison-skips a CLAIM attempt (not an event admission, unlike
        -- autodraft's own poison-exhaustion, which only ever advances a checkpoint and never
        -- moves an autodraft TASK straight from queued) -- Annex D8's own note is that there is
        -- NO checkpoint to advance past for a direct_queue row, so the wake-engine's own design
        -- terminal-izes the TASK itself once max_attempts exhausts. Pre-fix, that terminal write
        -- (queued->failed) was ILLEGAL here, raised CLR13, and crashed the WHOLE cycle every
        -- time it fired -- the row stayed queued forever and the dead-letter count overran its
        -- own cap on every subsequent cycle's re-attempt. This is the ONE truthful terminal the
        -- design already needed; nothing else in this arm moves.
        when 'queued' then new.status in ('running','cancel_requested','cancelled','failed')
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

-- =================================================================================================
-- §C · G1-4/G1-5 — clara._tf_wakes_outbox_update() CoR + the status CHECK ALTER (Annex B, D1).
-- =================================================================================================
create or replace function clara._tf_wakes_outbox_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wakes_outbox rows are not deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['status']) is distinct from (to_jsonb(old) - array['status']) then
    raise exception 'only status may change on a wakes_outbox row' using errcode = 'CLR08';
  end if;
  -- GATE G1 DELTA: held->settled joins held->cancelled as the two lawful exits from 'held'.
  -- 'settled' covers BOTH a completed and a failed wake task -- wakes_outbox is a coarse
  -- firm-visible notice projection (design §1.3), not a work-item-grained state machine, so it
  -- never needed running/completed/failed granularity of its own.
  if new.status <> old.status
     and not (old.status = 'held' and new.status in ('cancelled','settled')) then
    raise exception 'illegal wakes_outbox transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- The inline-CHECK auto-name is MEASURED (§0.3), never assumed — do $$ ... execute format(...) so
-- a drifted name aborts loudly rather than silently no-op'ing on a DROP CONSTRAINT IF EXISTS.
do $$
declare v_conname text;
begin
  select conname into v_conname from pg_constraint
    where conrelid = 'clara.wakes_outbox'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%held%cancelled%';
  if v_conname is null then
    raise exception 'g1_wake_engine: could not re-derive wakes_outbox''s status CHECK name from the live catalog'
      using errcode = 'CLR10';
  end if;
  execute format('alter table clara.wakes_outbox drop constraint %I', v_conname);
  execute format(
    'alter table clara.wakes_outbox add constraint %I check (status in (''held'',''cancelled'',''settled''))',
    v_conname);
end $$;

-- The settlement verb -- ungranted, called only by the reconciler belt and by a workflow's own
-- terminal step, mirroring settleTaskTerminal's existing shape.
--
-- MUST B (opus/Codex review): the pre-fix body filtered `kind = 'wake'` literally, so a
-- direct_queue task (kind='close_prep') NEVER matched -- v_intent stayed null and every close_prep
-- settle attempt raised 'no wake task % to settle', which (proven live) let
-- reconciler-wake.mjs's own cancel repair convert a RECOVERABLE running row into a PERMANENTLY
-- STRANDED cancel_requested one (its two statements now run in one txn -- see reconciler-wake.mjs
-- -- but this body's own kind-filter bug is the root cause fixed here). Fix: the legal kind
-- domain is the REGISTRY's own task_kind column (today {wake, close_prep}, future-proof for any
-- new direct_queue source with NO further CoR of this function), and GET DIAGNOSTICS proves "did
-- this match a row" rather than "v_intent is null" -- a close_prep task's origin_intent_id is
-- STRUCTURALLY null (Annex B: direct_queue tasks carry no wake_intent at all), so a null
-- v_intent on a REAL match must never be conflated with zero rows matched.
create or replace function clara._settle_wake_task(p_task uuid, p_outcome text, p_error_code text)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_intent uuid; v_n int;
begin
  if p_outcome not in ('completed','failed','cancelled') then
    raise exception 'unknown wake settlement outcome %', p_outcome using errcode='CLR10';
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
    where id = p_task and kind in (select task_kind from clara.wake_engine_sources)
    returning origin_intent_id into v_intent;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'no wake-engine task % to settle', p_task using errcode='CLR10';
  end if;
  -- Idempotent by construction: a re-settle attempt (crash-recovery replay) finds the outbox
  -- row already 'settled'/'cancelled' and this UPDATE affects zero rows -- never a raise. A
  -- direct_queue task (close_prep) carries NO wakes_outbox row at all -- v_intent is null BY
  -- CONSTRUCTION there, not by a missed match -- so this cascade is conditioned on v_intent,
  -- never assumed present.
  if v_intent is not null then
    update clara.wakes_outbox set status = 'settled' where intent_id = v_intent and status = 'held';
  end if;
end $$;
revoke all on function clara._settle_wake_task(uuid,text,text) from public;
-- clara_runtime ONLY (measured, this design's own runtime battery): the reconciler belt and the
-- engine's own claim path both call this AS clara_runtime, the same footing settle_chat_turn
-- already stands on (rig-meta.mjs's own ALLOWED[runtime] roster) — "ungranted" in the design's
-- own prose meant "no APP-FACING (human/wake) grant", never "unreachable by the runtime that is
-- its only real caller". Every human/wake role stays refused; PUBLIC stays refused.
grant execute on function clara._settle_wake_task(uuid,text,text) to clara_runtime;

-- =================================================================================================
-- §C2 · MUST A (opus/Codex review) — clara.cancel_agent_task (0006) CoR: guard the wakes_outbox
-- cascade on the TASK's own status, not just its kind. Proven live by the reviewer through the
-- real audited door: cancel a RUNNING wake task -> the pre-fix cascade set the outbox row
-- 'cancelled' (terminal) immediately, on the UNCONDITIONAL `t.kind='wake'` predicate alone; the
-- task itself only moves to 'cancel_requested' (not yet terminal) and, if the in-flight workflow
-- does not itself observe the cancel request, later settles 'completed' anyway -- task=completed,
-- outbox=cancelled, PERMANENTLY DIVERGENT, and _settle_wake_task's own `and status='held'`
-- predicate on the outbox write silently no-ops on the replay. This was correct ONLY while
-- 'held' was the sole cancellable wake state (the pre-G1 world); G1's own matrix delta makes
-- 'running' reachable, which is what turns this cascade's missing status guard into a live bug.
-- Restated per the design's own claim (§2, "the two projections can never diverge"): the ACCURATE
-- law is "every settlement path must go through clara._settle_wake_task" -- this fix makes
-- cancel_agent_task honor that law instead of racing ahead of it. ONE LINE changes (the added
-- `and t.status = 'held'` conjunct); everything else in the body is byte-identical to 0006's live
-- tip (the prestate's own byte-check above proves the pre-fix text, not merely a sha).
create or replace function clara.cancel_agent_task(p_task uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; t record; v_new_status text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'cancel_agent_task', p_op_key, clara._hash(jsonb_build_object('t', p_task)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Lock the task FIRST, then its interruptions (a single global lock order).
  select * into t from clara.agent_tasks where id = p_task for update;
  if not found or t.firm_id <> c.firm then raise exception 'task not in your firm' using errcode = 'CLR11'; end if;

  if t.status in ('completed','failed','cancelled','expired') then
    return clara._finish_op(c.firm, 'cancel_agent_task', p_op_key,
      jsonb_build_object('task_id', p_task, 'status', t.status));      -- idempotent: already terminal
  end if;
  if t.status = 'cancel_requested' then
    return clara._finish_op(c.firm, 'cancel_agent_task', p_op_key,
      jsonb_build_object('task_id', p_task, 'status', 'cancel_requested'));  -- already requested
  end if;

  -- Cascades (S4-D6): pending interruptions → cancelled; a held wake task's outbox → cancelled.
  update clara.agent_interruptions set status = 'cancelled' where task_id = p_task and status = 'pending';
  -- MUST A: the outbox cascade is now guarded on t.status = 'held' TOO (was: t.kind = 'wake' and
  -- t.origin_intent_id is not null alone) -- a RUNNING wake task's cancel is only a REQUEST
  -- (v_new_status below), never a terminal settle, so its outbox twin must stay 'held' until the
  -- real settlement path (clara._settle_wake_task) says otherwise.
  if t.kind = 'wake' and t.origin_intent_id is not null and t.status = 'held' then
    update clara.wakes_outbox set status = 'cancelled' where intent_id = t.origin_intent_id and status = 'held';
  end if;

  if t.status in ('running','awaiting_input') then
    v_new_status := 'cancel_requested';                               -- engine still active; runtime aborts + settles
  else
    v_new_status := 'cancelled';                                      -- queued/held: no engine run — terminal settle
  end if;
  update clara.agent_tasks
     set status = v_new_status, cancelled_by = c.actor, cancelled_at = now(), updated_at = now()
   where id = p_task;

  perform clara._audit(c.firm, c.actor, null, null, 'cancel_agent_task', null,
    jsonb_build_object('task', p_task, 'op_key', p_op_key));
  perform pg_notify('clara_runtime_ctl', '');                         -- empty payload
  return clara._finish_op(c.firm, 'cancel_agent_task', p_op_key,
    jsonb_build_object('task_id', p_task, 'status', v_new_status));
end $$;
-- ACL unmoved: this CoR changes ONLY the cascade's guard, never the door itself.
revoke all on function clara.cancel_agent_task(uuid, text) from public;
grant execute on function clara.cancel_agent_task(uuid, text) to clara_authenticated;

-- =================================================================================================
-- §E2 · G1-9 — clara.wake_engine_task_dead_letters (Annex D8): the direct_queue carrier's OWN
-- dead-letter home, structurally identical in shape to clara.relay_dead_letters (0005) but keyed
-- on task_id (a direct_queue row has no domain_event to key against -- there is no event backing
-- it). Two homes total, forever, one per carrier -- never one per source (annexes §D8; design §3.1
-- names the closed world of two). Mirrors relay_dead_letters' RLS/grant/trigger shape verbatim.
-- =================================================================================================
create table clara.wake_engine_task_dead_letters (
  consumer      text        not null,
  task_id       uuid        not null references clara.agent_tasks(id),
  firm_id       uuid        not null,
  reason        text        not null,
  attempt_count int         not null default 1,
  status        text        not null default 'pending' check (status in ('pending','resolved')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  primary key (consumer, task_id)
);
comment on table clara.wake_engine_task_dead_letters is
  'Gate G1 Annex D8: the wake engine''s direct_queue-carrier dead-letter home (relay_dead_letters''
   sibling, keyed on task_id since a direct_queue row has no domain_event to key against). A
   poisoned direct_queue row (today: only close_prep, unbuilt/disabled) never lands in
   relay_dead_letters -- structurally cannot, since it carries no event_id.';

-- Stamp firm_id from the referenced task (the relay_dead_letters C6 idiom, adapted: derive from
-- agent_tasks rather than domain_events, since a direct_queue row has no event).
create function clara._tf_wake_engine_task_dl_stamp() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select firm_id into v_firm from clara.agent_tasks where id = new.task_id;
  if v_firm is null then
    raise exception 'wake_engine_task_dead_letters references unknown task %', new.task_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  return new;
end $$;
create trigger t_wake_engine_task_dl_stamp before insert on clara.wake_engine_task_dead_letters
  for each row execute function clara._tf_wake_engine_task_dl_stamp();
-- PostgreSQL grants EXECUTE to PUBLIC on every newly-created function by default (T17b's own
-- measured law) -- 0005's blanket `revoke execute on all functions in schema clara from public`
-- covers only what existed at ITS tail, never a later migration's new functions. Every trigger
-- function in this file needs its OWN explicit revoke, matching _settle_wake_task's above.
revoke all on function clara._tf_wake_engine_task_dl_stamp() from public;

-- Update allowlist (relay_dead_letters' _tf_dead_letter_update idiom, verbatim shape): a consumer
-- may advance only status/attempt_count/resolved_at; identity/derivation columns frozen; no DELETE.
create function clara._tf_wake_engine_task_dl_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wake_engine_task_dead_letters rows are not deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['status','attempt_count','resolved_at'])
     is distinct from (to_jsonb(old) - array['status','attempt_count','resolved_at']) then
    raise exception 'only status/attempt_count/resolved_at may change on a wake_engine_task_dead_letters row' using errcode = 'CLR08';
  end if;
  return new;
end $$;
revoke all on function clara._tf_wake_engine_task_dl_update() from public;
create trigger t_wake_engine_task_dl_update before update or delete on clara.wake_engine_task_dead_letters
  for each row execute function clara._tf_wake_engine_task_dl_update();
create trigger t_wake_engine_task_dl_no_truncate before truncate on clara.wake_engine_task_dead_letters
  for each statement execute function clara._tf_no_truncate();

alter table clara.wake_engine_task_dead_letters enable row level security;
alter table clara.wake_engine_task_dead_letters force row level security;
create policy p_wake_engine_task_dl_owner on clara.wake_engine_task_dead_letters
  for all to clara_fn_owner using (true) with check (true);
create policy p_wake_engine_task_dl_runtime on clara.wake_engine_task_dead_letters for all
  to clara_runtime using (true) with check (true);
create policy p_wake_engine_task_dl_human on clara.wake_engine_task_dead_letters for select
  to clara_authenticated using (firm_id = clara.jwt_firm());
grant select, insert, update on clara.wake_engine_task_dead_letters to clara_runtime;
grant select on clara.wake_engine_task_dead_letters to clara_authenticated;

-- =================================================================================================
-- §F · G1-7 — clara.mint_wake_credential() CoR: the close_prep mint gate (Annex B), PLUS the
-- ANNEX-B CORRECTION (§0.2): the early kind-membership gate is extended too, or the new elsif arm
-- below is dead code behind a 'bad wake_kind' refusal. Every other arm's text is BYTE-IDENTICAL to
-- the live tip -- a pure extension, proven by the tail's own differential.
-- =================================================================================================
create or replace function clara.mint_wake_credential(p_wake_kind text, p_firm uuid, p_on_behalf_of uuid DEFAULT NULL::uuid, p_ttl interval DEFAULT '00:15:00'::interval, p_client uuid DEFAULT NULL::uuid)
 RETURNS TABLE(credential_id uuid, secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare v_secret text; v_id uuid;
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
  insert into clara.wake_credentials(wake_kind,firm_id,on_behalf_of,client_id,
      secret_hash,expires_at)
    values(p_wake_kind,p_firm,p_on_behalf_of,p_client,
      sha256(convert_to(v_secret,'UTF8')),statement_timestamp()+p_ttl)
    returning id into v_id;
  return query select v_id,v_secret;
end $function$;

reset role;

-- =================================================================================================
-- §G · G1-8 — the two seed registry rows, BOTH enabled=false at birth (owner ruling: no scaffold
-- due-predicate or workflow body ships in this gate; each source's own follow-up PR builds its
-- real due-predicate + workflow and flips enabled=true via set_wake_source_enabled).
-- =================================================================================================
insert into clara.wake_engine_sources
    (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool, max_attempts, enabled)
  values
    ('bank_agent', 'wake_outbox', 'bank.agent_due', 'wake', 'bank_agent', 'bankAgent', 'bank', 5, false),
    ('close_prep', 'direct_queue', null, 'close_prep', 'close_prep', 'closePrep', 'runtime', 5, false);
comment on column clara.wake_engine_sources.event_type is
  'bank_agent registers ''bank.agent_due'' ahead of its own due-predicate/emitter existing (F-A3''s
   follow-up PR) -- this is inert until that event type is actually registered in clara.event_types
   and something emits it; the registry row itself is pure configuration and needs neither.';

-- =================================================================================================
-- §H · S5 (both legs) — the supporting index for wake-engine.mjs's discoverDirectQueueFirms
-- (MUST E's own production-shape discovery query, `where kind=$1 and status='queued'`), which
-- was a full sequential scan of clara.agent_tasks on every production cycle that has ANY
-- direct_queue source registered. PARTIAL on status='queued' -- that predicate is a fixed
-- literal in the query, and 'queued' is a small, transient minority of the table's overall
-- rows (most rows settle to a terminal status and stay there), so the partial form stays small
-- and cheap to maintain relative to a full (kind,status) composite index.
-- =================================================================================================
create index ix_agent_tasks_kind_queued on clara.agent_tasks (kind) where status = 'queued';

-- =================================================================================================
-- §TAIL · census + self-proofs. This is the evidence a reviewer reads, not "OK".
-- =================================================================================================
do $tail$
declare
  v_def text; v_src text; v_n int; v_held_after bigint; v_held_before bigint;
begin
  -- T.1 · the wake arm carries every new leg, POSITIONALLY (the 0120 tail idiom), never a
  -- bare substring hit that could match inside a comment.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_agent_task_update()'::regprocedure;
  if v_src !~ 'when old\.kind=''wake'' then case old\.status\s*\n\s*when ''held'' then new\.status in \(''running'',''cancelled''\)\s*\n\s*when ''running'' then new\.status in \(''completed'',''failed'',''cancel_requested''\)\s*\n\s*when ''cancel_requested'' then new\.status in \(''completed'',''failed'',''cancelled''\)' then
    raise exception 'g1_wake_engine tail: _tf_agent_task_update''s wake arm does not carry the exact matrix delta' using errcode='CLR10';
  end if;
  -- every OTHER kind's arm is byte-present. chat_turn/autodraft stay UNMOVED; close_prep gains
  -- exactly ONE extend-only leg (M4, opus+Codex review) -- proven positionally below, not a
  -- bare substring hit.
  if position('when old.kind=''chat_turn''' in v_src) = 0
     or position('when old.kind=''autodraft''' in v_src) = 0
     or position('when old.kind=''close_prep''' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: _tf_agent_task_update lost a sibling kind arm' using errcode='CLR10';
  end if;
  -- M4's own leg, checked as a plain positional substring (not a regex spanning the arm's own
  -- explanatory comment above it, which would be fragile to reformat) — the exact tuple close_
  -- prep's queued state now admits, unchanged from every OTHER kind's own quoting style.
  if position('when ''queued'' then new.status in (''running'',''cancel_requested'',''cancelled'',''failed'')' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: _tf_agent_task_update''s close_prep arm does not carry the M4 queued->failed extend-only leg' using errcode='CLR10';
  end if;

  -- T.2 · wakes_outbox: the trigger admits held->settled, and the CHECK admits the value.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._tf_wakes_outbox_update()'::regprocedure;
  if position('''cancelled'',''settled''' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: _tf_wakes_outbox_update does not admit held->settled' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wakes_outbox'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%status%';
  if position('settled' in v_def) = 0 or position('held' in v_def) = 0 or position('cancelled' in v_def) = 0 then
    raise exception 'g1_wake_engine tail: wakes_outbox''s status CHECK lost a value: %', v_def using errcode='CLR10';
  end if;

  -- T.2b · wake_engine_task_dead_letters: forced RLS, the three triggers present, DELETE refused.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='wake_engine_task_dead_letters' and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'g1_wake_engine tail: wake_engine_task_dead_letters is not FORCE RLS' using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='wake_engine_task_dead_letters' and not t.tgisinternal;
  if v_n <> 3 then
    raise exception 'g1_wake_engine tail: wake_engine_task_dead_letters carries % trigger(s), expected 3 (stamp/update/no-truncate)', v_n using errcode='CLR10';
  end if;
  -- T.2c · the two NEW trigger functions carry their own explicit PUBLIC revoke (T17b's law:
  -- a fresh function is PUBLIC-executable by Postgres default until revoked; 0005's blanket
  -- sweep only covers what existed at ITS tail).
  if has_function_privilege('public', 'clara._tf_wake_engine_task_dl_stamp()'::regprocedure, 'EXECUTE')
     or has_function_privilege('public', 'clara._tf_wake_engine_task_dl_update()'::regprocedure, 'EXECUTE') then
    raise exception 'g1_wake_engine tail: a wake_engine_task_dead_letters trigger function is PUBLIC-executable' using errcode='CLR10';
  end if;

  -- T.3 · _settle_wake_task exists, reachable by clara_runtime ONLY (its one real caller — the
  -- reconciler belt and the engine's own claim path, the settle_chat_turn precedent) -- zero
  -- PUBLIC / zero human-or-wake-role EXECUTE.
  if to_regprocedure('clara._settle_wake_task(uuid,text,text)') is null then
    raise exception 'g1_wake_engine tail: _settle_wake_task missing' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_runtime', 'clara._settle_wake_task(uuid,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'g1_wake_engine tail: _settle_wake_task is NOT reachable by clara_runtime -- its one real caller (the reconciler belt / the engine claim path) would be permission-denied' using errcode='CLR10';
  end if;
  select count(*) into v_n
    from unnest(array['clara_authenticated','clara_agent_ro','clara_wake_interactive',
        'clara_wake_proactive','clara_wake_bank','clara_wake_filing','public']) r(role)
    where has_function_privilege(r.role, 'clara._settle_wake_task(uuid,text,text)'::regprocedure, 'EXECUTE');
  if v_n <> 0 then
    raise exception 'g1_wake_engine tail: _settle_wake_task is reachable by % human/wake app role(s)/PUBLIC', v_n using errcode='CLR10';
  end if;

  -- T.4 · mint_wake_credential: BOTH the early gate and the new arm carry close_prep; every
  -- earlier per-kind arm (autodraft/interactive_client/bank_agent/filing) survives verbatim.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'mint_wake_credential';
  if position('''interactive'',''proactive'',''autodraft'',''interactive_client'',''bank_agent'',''filing'',''close_prep''' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: mint_wake_credential''s early kind-gate does not admit close_prep' using errcode='CLR10';
  end if;
  if position('elsif p_wake_kind=''close_prep'' then' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: mint_wake_credential has no close_prep arm' using errcode='CLR10';
  end if;
  if position('elsif p_wake_kind=''autodraft''' in v_src) = 0 and position('if p_wake_kind=''autodraft''' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: mint_wake_credential lost its autodraft arm' using errcode='CLR10';
  end if;
  if position('elsif p_wake_kind=''interactive_client''' in v_src) = 0
     or position('elsif p_wake_kind=''bank_agent''' in v_src) = 0
     or position('elsif p_wake_kind=''filing''' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: mint_wake_credential lost a sibling per-kind arm' using errcode='CLR10';
  end if;

  -- T.5 · the registry table: forced RLS, exactly two rows, both disabled at birth, the writer
  -- reachable by clara_authenticated only (the human entry — the DB-side authority check inside
  -- the body is what actually enforces owner floor, per the estate's dual-lane pattern).
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='wake_engine_sources' and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'g1_wake_engine tail: wake_engine_sources is not FORCE RLS' using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.wake_engine_sources;
  if v_n <> 2 then
    raise exception 'g1_wake_engine tail: wake_engine_sources holds % row(s), expected exactly 2', v_n using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.wake_engine_sources where enabled = true;
  if v_n <> 0 then
    raise exception 'g1_wake_engine tail: % wake_engine_sources row(s) are enabled at birth -- both must ship disabled', v_n using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.wake_engine_sources where source_key='bank_agent' and carrier='wake_outbox' and task_kind='wake' and wake_kind='bank_agent') then
    raise exception 'g1_wake_engine tail: bank_agent registry row missing or malformed' using errcode='CLR10';
  end if;
  if not exists (select 1 from clara.wake_engine_sources where source_key='close_prep' and carrier='direct_queue' and event_type is null and task_kind='close_prep' and wake_kind='close_prep') then
    raise exception 'g1_wake_engine tail: close_prep registry row missing or malformed' using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', 'clara.set_wake_source_enabled(text,boolean,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled not reachable by clara_authenticated' using errcode='CLR10';
  end if;
  if has_function_privilege('public', 'clara.set_wake_source_enabled(text,boolean,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled reachable by PUBLIC' using errcode='CLR10';
  end if;

  -- T.5e · S3: wake_engine_sources.task_kind is CONSTRAINED to the wake-owned domain -- a real
  -- catalog read of the CHECK's own definition, not merely "an insert of an out-of-domain value
  -- was refused" (that would be the battery's own job; this is the migration's own proof the
  -- WALL exists at all).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_engine_sources'::regclass and c.conname = 'ck_wes_task_kind_wake_owned';
  if v_def is null then
    raise exception 'g1_wake_engine tail: ck_wes_task_kind_wake_owned constraint is missing' using errcode='CLR10';
  end if;
  if position('''wake''' in v_def) = 0 or position('''close_prep''' in v_def) = 0 then
    raise exception 'g1_wake_engine tail: ck_wes_task_kind_wake_owned does not admit exactly {wake, close_prep}: %', v_def using errcode='CLR10';
  end if;

  -- T.5f · S5: the supporting partial index for discoverDirectQueueFirms exists.
  if not exists (select 1 from pg_indexes where schemaname='clara' and tablename='agent_tasks' and indexname='ix_agent_tasks_kind_queued') then
    raise exception 'g1_wake_engine tail: ix_agent_tasks_kind_queued index missing (S5)' using errcode='CLR10';
  end if;

  -- T.5b · clara_runtime can ACTUALLY READ the registry -- a REAL row-count read under SET
  -- ROLE, never has_table_privilege alone: FORCE RLS means a role can hold the table-level
  -- GRANT and still see ZERO rows if no POLICY admits it (measured, this exact gap, by this
  -- design's own runtime battery -- the engine's own loadEnabledSources() silently saw nothing
  -- until the read policy named clara_runtime alongside clara_authenticated).
  set role clara_runtime;
  select count(*) into v_n from clara.wake_engine_sources;
  reset role;
  if v_n <> 2 then
    raise exception 'g1_wake_engine tail: clara_runtime reads % row(s) of wake_engine_sources via SET ROLE, expected 2 -- grant without a matching RLS policy is a silent zero-row read' , v_n using errcode='CLR10';
  end if;

  -- T.5c · MUST D (Codex-round MUST B): clara.firms.is_operator exists, defaults false, and AT
  -- MOST ONE row can ever carry it (the partial unique index) -- re-derived from the live
  -- catalog, never assumed from the ALTER TABLE statement's own text.
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='firms' and column_name='is_operator'
        and is_nullable='NO' and column_default='false') then
    raise exception 'g1_wake_engine tail: clara.firms.is_operator is missing or not NOT NULL DEFAULT false' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='clara' and tablename='firms' and indexname='uq_firms_one_operator') then
    raise exception 'g1_wake_engine tail: uq_firms_one_operator index missing' using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.firms where is_operator;
  if v_n <> 0 then
    raise exception 'g1_wake_engine tail: % firm(s) are already marked is_operator -- this migration marks NONE (a raw ops act does, later)', v_n using errcode='CLR10';
  end if;

  -- T.5d · MUST D: set_wake_source_enabled's body carries BOTH halves -- the operator-firm gate
  -- AND the estate-wide receipt broadcast to every OTHER firm -- positionally, not a bare
  -- substring hit. M3 (Codex MUST / opus NOTE-4): also proves the broadcast is CONDITIONAL on
  -- an actual state change, routed through clara._audit (never a direct multi-row INSERT), and
  -- the payload carries no reason/operator-firm-uuid field.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.set_wake_source_enabled(text,boolean,text,text)'::regprocedure;
  if position('is not the operator firm' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled lost its operator-firm gate' using errcode='CLR10';
  end if;
  if position('set_wake_source_enabled_estate_notice' in v_src) = 0
     or position('for v_firm_id in (select id from clara.firms where id <> c.firm) loop' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled lost its MUST-D estate-wide receipt broadcast' using errcode='CLR10';
  end if;
  if position('v_now_on is distinct from coalesce(v_was_enabled, false)' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled''s broadcast is not conditioned on an actual state change (M3)' using errcode='CLR10';
  end if;
  if position('insert into clara.audit_log' in v_src) > 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled writes audit_log directly -- M3 requires routing through clara._audit, the sole-writer convention' using errcode='CLR10';
  end if;
  if position('set_by_operator_firm' in v_src) > 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled''s broadcast payload still carries the operator-firm uuid M3 requires stripped' using errcode='CLR10';
  end if;
  -- #2/#3 (round-4 review): the advisory-lock mutual exclusion is taken BEFORE the FOR UPDATE
  -- read, and under the SAME key format the runtime claim path uses -- a mismatch here would
  -- silently defeat the whole mechanism (the two sides would never actually contend).
  if position('pg_advisory_xact_lock(hashtext(''wake_source_gate:'' || p_source_key)::bigint)' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled lost its #2 advisory-lock mutual exclusion' using errcode='CLR10';
  end if;
  -- N4 (round-5, opus NOTE): a bare `position('for update' in v_src)` matches ANY occurrence of
  -- that phrase ANYWHERE in prosrc, INCLUDING inside this file's own comments (prosrc is the
  -- verbatim body text, comments included, exactly like #2's own advisory-lock check three
  -- lines up already anchors to the full call expression rather than a bare 'pg_advisory'
  -- substring) -- a reviewer's own comment mentioning "FOR UPDATE" in prose would trivially
  -- satisfy a bare substring check even with the real clause deleted. Anchored to the actual
  -- statement shape instead: the exact SELECT this file authors, ending in `for update;`.
  if position('where source_key = p_source_key for update;' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: set_wake_source_enabled lost its #3 FOR UPDATE read+flip atomicity' using errcode='CLR10';
  end if;

  -- T.7 · MUST A: cancel_agent_task's wakes_outbox cascade now carries the t.status='held'
  -- guard, positionally, alongside its ORIGINAL two conjuncts (kind='wake' AND
  -- origin_intent_id is not null) -- proving this is an ADDED guard, not a replaced predicate.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.cancel_agent_task(uuid,text)'::regprocedure;
  if position('t.kind = ''wake'' and t.origin_intent_id is not null and t.status = ''held''' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: cancel_agent_task''s cascade guard is not the expected three-conjunct MUST-A fix' using errcode='CLR10';
  end if;

  -- T.8 · MUST B (opus-round; distinct from the Codex-round MUST B renamed to MUST D above):
  -- _settle_wake_task's kind filter is now the REGISTRY's own task_kind column (never a literal
  -- 'wake'), and GET DIAGNOSTICS proves row_count -- never the v_intent-is-null conflation. S2
  -- (widening NOTE C): error_code is first-write-wins, and 'completed' NEVER carries one.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara._settle_wake_task(uuid,text,text)'::regprocedure;
  if position('kind in (select task_kind from clara.wake_engine_sources)' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: _settle_wake_task does not filter on the registry''s task_kind domain' using errcode='CLR10';
  end if;
  if position('get diagnostics v_n = row_count' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: _settle_wake_task does not use GET DIAGNOSTICS row_count' using errcode='CLR10';
  end if;
  if position('when p_outcome = ''completed'' then null' in v_src) = 0
     or position('when error_code is not null then error_code' in v_src) = 0 then
    raise exception 'g1_wake_engine tail: _settle_wake_task does not carry S2''s first-write-wins + guard-completed error_code logic' using errcode='CLR10';
  end if;

  -- T.6 · THE STRANDED-ROW CURE'S OWN PROOF: this file's held-wake-row count is UNCHANGED by its
  -- own apply (pure DDL/trigger/config-INSERT -- no UPDATE/INSERT/DELETE anywhere in this file
  -- touches clara.agent_tasks or clara.wakes_outbox). The DISPOSITION becomes reachable, not
  -- retroactively forced (design §4's own framing) -- the battery (D9) proves a pre-existing held
  -- row survives a REAL apply of this exact file untouched, and is claimable once its source
  -- registers+enables. NOTE L (opus/Codex review): this is now a REAL comparison against the
  -- count PERSISTED in §0 (g1_wake_engine_census), not a dead local re-declared and never
  -- assigned in this block (review law 2 -- a comment claiming "structurally guaranteed" is not
  -- itself evidence).
  select count(*) into v_held_after from clara.agent_tasks where kind = 'wake' and status = 'held';
  select held_before into v_held_before from g1_wake_engine_census;
  if v_held_before is distinct from v_held_after then
    raise exception 'g1_wake_engine tail: held wake row count changed % -> % -- this file''s own text must never DML agent_tasks/wakes_outbox', v_held_before, v_held_after
      using errcode='CLR10';
  end if;
  drop table g1_wake_engine_census;

  raise notice 'g1_wake_engine tail: OK -- G1-1..G1-8 applied. wake arm carries held->running->{completed,failed,cancel_requested}->{completed,failed,cancelled} plus held->cancelled, every sibling kind arm unmoved; close_prep arm ADDITIONALLY admits queued->failed (M4, round 3 -- the poison-exhaustion terminal that pre-fix raised CLR13 and aborted the whole wake-engine cycle); wakes_outbox admits held->settled on both the trigger and the CHECK; _settle_wake_task now settles BOTH kind=''wake'' AND kind=''close_prep'' via the registry''s own task_kind domain (a domain now CLOSED to (''wake'',''close_prep'') by ck_wes_task_kind_wake_owned, S3 round 3), uses GET DIAGNOSTICS (never the v_intent-is-null conflation), is FIRST-WRITE-WINS on error_code and refuses to attach one to an already-completed row (S2, round 3 -- replacing the pre-fix coalesce() a later replay could clobber the first cause through), reachable by clara_runtime ONLY (zero human/wake role, zero PUBLIC), and clara_runtime can ACTUALLY READ wake_engine_sources (T.5b, a real SET ROLE row-count, not has_table_privilege alone); mint_wake_credential''s early gate AND per-kind chain both admit close_prep (the ANNEX-B CORRECTION applied, not merely claimed), every sibling per-kind arm unmoved; cancel_agent_task''s wakes_outbox cascade now guards on t.status=''held'' too, never diverging a running-then-cancelled wake task from its outbox twin (MUST A); wake_engine_sources is FORCE RLS with exactly 2 rows (bank_agent/wake_outbox, close_prep/direct_queue), BOTH enabled=false; set_wake_source_enabled is clara_authenticated-reachable, PUBLIC-refused, gated on clara.firms.is_operator (MUST D/Codex-MUST-B) -- the column exists NOT NULL DEFAULT false, uq_firms_one_operator enforces at most one operator firm ever, ZERO firms are marked operator by this migration (a raw ops act does that later, never an app RPC) -- AND broadcasts a MINIMAL, NON-AMPLIFYING estate-wide receipt ({source,on} only, actor NULL, routed through clara._audit, suppressed on a no-op re-flip) to every OTHER firm''s own audit_log on every actual state-changing flip (MUST D, narrowed by M3 round 3). agent_tasks gains ix_agent_tasks_kind_queued (kind) WHERE status=''queued'' (S5 round 3). % held wake row(s) exist now, byte-compared equal to the persisted prestate count (NOTE L -- a REAL comparison, not a dead local). No table in workflow/graphile_worker/spike touched. No new PostgreSQL role minted (clara_wake_bank/clara_wake_bank_login already exist, 0121).', v_held_after;
end $tail$;
