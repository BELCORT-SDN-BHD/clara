-- 0006_runtime_core — Slice-4: the durable runtime skeleton in the DB. Adds the
-- two-login pool contract's principal resolver, the wake-intent CONSUMPTION
-- lifecycle, agent_tasks (+ a masked human view), leased clarify interruptions,
-- the held wakes_outbox, private-by-default chat sessions/messages (typed parts[]),
-- fail-closed metering (atomic admission + idempotent settle), and the trace store
-- (+ audited prune) with heartbeats/health. Built on the Slice-2 governed core
-- (0002 identity/RBAC/audit + _reserve_op/_audit/_human_ctx) and the Slice-3 event
-- spine (0005 domain_events / wake_intents / taxonomy).
--
-- Authority: docs/plan/slice4-durable-runtime-contract.md v2.1 (RATIFIED
-- 2026-07-18, §0.11 owner-ratified) — §0 ratified semantics, §2 empirical laws
-- (S4-P1..P6), §3.0–§3.9 the migration spec, §6 the properties. ARCHITECTURE §4 +
-- Appendix A; ADR-008/009/010/011/014/015/016; slice3 contract v2.2. Finding tags
-- inline (N* native review, C* Codex review, ND* native delta, D* Codex delta,
-- P* probe, ruling* §0) point at the WHY of each load-bearing detail.
--
-- NEW ERROR CODES (0002's + 0005's registries are IMMUTABLE, so these are
-- documented HERE — not by editing an applied migration):
--   CLR13 = STATE CONFLICT — a turn is already live for the session (one-live-turn
--           23505 → CLR13/409), an interruption is not pending / has expired, an
--           agent_task transition is outside the legal matrix (incl. any move out of a
--           terminal state — S4-AB11), or open_interruption hit a non-running task.
--           (Existing: CLR01..CLR12.)
--   CLR14 = LIMIT — a firm's daily token budget is exhausted OR its concurrent
--           compute-run cap is reached (fail-closed admission; ruling 4). The
--           message names which limit + the UTC reset day.
-- Collision-free vs CLR01..CLR12 (verified both review lanes).
--
-- AS-BUILT FIX ROUND (inline S4-AB* tags mark each): AB1 login memberships WITH SET
-- TRUE / INHERIT FALSE (the pool SET ROLEs into its group); AB11 the full agent_task
-- transition matrix; AB12 chat_message parts array + element shape; AB4 the durable
-- hook_token + open_interruption (atomic+idempotent clarify open); AB6 task_checkpoints
-- + checkpoint_turn (per-segment durable accounting; settle sums them, one path).
--
-- HOUSE RULES (S4-C13 + the 0002/0005 precedent): cluster/role DDL runs FIRST as
-- the DEPLOY role (clara_fn_owner is NOCREATEROLE and cannot mint the logins);
-- then SET ROLE clara_fn_owner for every schema object. FORCE RLS + an owner
-- using(true)/with check(true) policy on EVERY new table (N9 — else a definer
-- INSERT bricks). SECURITY DEFINER triggers/functions pin search_path = clara,
-- pg_temp. The file ENDS with the PUBLIC-execute sweep + re-asserted grants (N13 —
-- functions created here are PUBLIC-executable until that revoke). 0001–0005 are
-- untouched (no writer-body replacement ⇒ no D1 write-quiesce obligation).
--
-- RUNTIME-CONTROL EMISSION SCOPE (ruling 11 / ADR-016(3) clarification): the tables
-- and routines here are RUNTIME CONTROL, not domain writers — they emit NO
-- domain_events. Human governance routines (cancel/answer/share) stay AUDITED +
-- IDEMPOTENT via audit_log + _reserve_op; the runtime plumbing (begin/settle/drain)
-- is keyed idempotent by its structural unique keys.

-- =====================================================================
-- 0. CLUSTER / ROLE DDL — as the DEPLOY role (current_user), BEFORE SET ROLE
--    (S4-C13: clara_fn_owner is NOCREATEROLE). Two LOGIN roles for the two-login
--    pool contract (§3.0 / §4.1): each is a member of EXACTLY ONE group role and
--    nothing else (S4-C3 — never a wake role or clara_authenticated; rig-asserted).
--    Created NOLOGIN with safe defaults; the operator enables LOGIN + a password
--    OUT-OF-BAND. Idempotent-guarded like 0002's role block.
-- =====================================================================
do $$
declare r text;
begin
  foreach r in array array['clara_runtime_login', 'clara_agent_read_login'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);   -- safe defaults: NOSUPERUSER NOBYPASSRLS NOCREATEDB NOLOGIN
    end if;
    -- Always-settable normalizers (legal for a non-superuser CREATEROLE deploy that
    -- holds ADMIN on the role). NOLOGIN is the safe default — the operator enables it.
    execute format('alter role %I nologin nocreaterole inherit', r);
  end loop;
end $$;

-- Bind each login to EXACTLY its one group role, WITH SET TRUE (S4-AB1 — the pool
-- authenticates AS the login then `SET ROLE` into its group; without SET this fails
-- 42501 on every checkout) and INHERIT FALSE (tightest — the login carries NO
-- privilege until it explicitly SET ROLEs to the group; privileges never leak to the
-- bare login identity). The login is a member of EXACTLY this one group and nothing
-- wider. resolve_chat_principal — NOT a direct firm_memberships grant — is the
-- runtime's only membership surface (S4-ND2).
grant clara_runtime  to clara_runtime_login     with inherit false, set true;
grant clara_agent_ro to clara_agent_read_login  with inherit false, set true;

-- Deploy-role impersonation for the isolation rig (WITH SET, no inherit) so a
-- non-superuser deploy can SET ROLE into each login to assert its membership set.
-- Idempotent (re-GRANT with same options is a no-op). Guarded: on a deploy role
-- lacking ADMIN this is best-effort (the rig runs under a role that has it).
do $$
begin
  execute format('grant clara_runtime_login to %I with inherit false, set true', current_user);
  execute format('grant clara_agent_read_login to %I with inherit false, set true', current_user);
exception when insufficient_privilege then
  raise notice 'skipping login-role impersonation grants (deploy role lacks ADMIN; not load-bearing)';
end $$;

-- Everything from here is owned by clara_fn_owner.
set role clara_fn_owner;

-- =====================================================================
-- 1. wake_intents — the CONSUMPTION lifecycle (§3.1). The Slice-3 freeze
--    (t_wake_intents_append_only) is REPLACED by a pending→consumed lifecycle.
--    The stamp trigger (derive firm/seq/type + validate the triple) and the
--    TRUNCATE guard STAY.
-- =====================================================================
alter table clara.wake_intents
  add column consumed_at timestamptz,
  add column consumed_by text;                        -- the draining consumer's id (text, like relay_checkpoints.consumer)

-- Widen the status domain (was CHECK (status IN ('pending'))) and tie status↔timestamps.
alter table clara.wake_intents drop constraint wake_intents_status_check;
alter table clara.wake_intents
  add constraint ck_wake_intents_status check (status in ('pending','consumed'));
alter table clara.wake_intents
  add constraint ck_wake_intents_consumption check (
    (status = 'pending'  and consumed_at is null     and consumed_by is null)
 or (status = 'consumed' and consumed_at is not null and consumed_by is not null));

-- =====================================================================
-- 2. NEW TABLES. NO FKs between runtime rows (the 0005 C4 precedent: cross-row
--    KEY-SHARE locks deadlock the write path) — parents are DERIVED + VALIDATED in
--    BEFORE-INSERT triggers, which is also where firm/client are STAMPED (caller
--    values are overwritten, never trusted). Money never appears here.
-- =====================================================================

-- 2.1 chat_sessions — private-by-default; author-stamped; share-to-firm is one-way
--     (§3.5 / ruling 9). client_id is an OPTIONAL scope (a chat may target a client).
create table clara.chat_sessions (
  id         uuid        primary key default gen_random_uuid(),
  firm_id    uuid        not null,                    -- derived from the author's active membership
  client_id  uuid,                                    -- optional; validated in-firm by the trigger
  created_by uuid        not null,                    -- the author (a live active member)
  visibility text        not null default 'private' check (visibility in ('private','firm')),
  title      text,
  created_at timestamptz not null default now()
);

-- 2.2 agent_tasks — the durable unit of runtime work (§3.2). model_snapshot is the
--     durable config snapshot stamped at admission (S4-D3, immutable). error_code is
--     a BOUNDED class allowlist, never free text (S4-C1). cancel_requested is IN the
--     schema (S4-D6 — non-terminal, engine-abort pending).
create table clara.agent_tasks (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null,              -- derived (chat←session, wake←intent→event)
  client_id        uuid,                              -- derived; may be null (firm-level wake / general chat)
  kind             text        not null check (kind in ('chat_turn','wake')),
  origin_intent_id uuid,                              -- wake tasks only; UNIQUE below (idempotent enqueue)
  session_id       uuid,                              -- chat tasks only
  turn_key         text,                              -- the user turn's idempotency key (chat tasks)
  workflow_run_id  text,                              -- the engine run id (set at enqueue; re-enqueue may repoint)
  model_snapshot   text,                              -- S4-D3 durable config snapshot (immutable)
  status           text        not null check (status in
                     ('queued','held','running','awaiting_input','cancel_requested',
                      'completed','failed','cancelled','expired')),
  created_by       uuid,                              -- the human author (chat); null/agent for wake
  trace_id         text,                              -- NEVER exposed by the masked view
  error_code       text        check (error_code in
                     ('model_error','tool_error','timeout','engine_lost','limit','internal')),  -- S4-C1
  cancelled_by     uuid,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- One task per consumed intent (idempotent wake enqueue — S4-V1). NULL for chat tasks.
create unique index uq_agent_task_origin_intent on clara.agent_tasks (origin_intent_id)
  where (origin_intent_id is not null);
-- ONE LIVE TURN per session (§3.2 / S4-ND7): only the COMPUTE-ish live states count;
-- the ingress maps the 23505 to CLR13/409. held + terminal never block a new turn.
create unique index uq_agent_task_one_live_turn on clara.agent_tasks (session_id)
  where (kind = 'chat_turn' and status in ('queued','running','awaiting_input','cancel_requested'));

-- 2.3 chat_messages — typed parts[] (§3.5). Append-only (immutable post-insert).
--     Both roles of a turn carry task_id; the user row also carries turn_key (the
--     replay key). seq is per-session, assigned max+1 under the session's one-live-turn.
create table clara.chat_messages (
  id         uuid        primary key default gen_random_uuid(),
  session_id uuid        not null,                    -- derived firm by trigger
  firm_id    uuid        not null,
  seq        int         not null,                    -- per-session, trigger-assigned
  role       text        not null check (role in ('user','assistant')),
  task_id    uuid        not null,                    -- the turn this message belongs to
  turn_key   text,                                    -- NOT NULL for user rows (S4-ND7)
  parts      jsonb       not null default '[]',       -- typed parts[] (element shape enforced by the trigger — S4-AB12)
  created_at timestamptz not null default now(),
  constraint ck_msg_user_turn_key check (role <> 'user' or turn_key is not null),
  constraint ck_msg_parts_array  check (jsonb_typeof(parts) = 'array')       -- S4-AB12
);
create unique index uq_msg_user_turn on clara.chat_messages (session_id, turn_key) where (role = 'user');
create unique index uq_msg_assistant_task on clara.chat_messages (task_id) where (role = 'assistant');
create unique index uq_msg_session_seq on clara.chat_messages (session_id, seq);

-- 2.4 agent_interruptions — LINEARIZED + LEASED clarify (§3.3). Content is a typed
--     part and FIRM-VISIBLE by ruling 5 (S4-D1). Lease/delivery state (S4-D2):
--     claim_lease_until/claimed_by/delivered_at make delivery exactly-once-or-
--     provably-done.
create table clara.agent_interruptions (
  id                uuid        primary key default gen_random_uuid(),
  task_id           uuid        not null,             -- firm derived from the task
  firm_id           uuid        not null,
  hook_token        text        not null unique,      -- the engine resume-hook token (S4-AB4); single-shot, immutable
  kind              text        not null default 'clarify' check (kind in ('clarify')),
  question          jsonb       not null default '{}',-- typed part (firm-visible)
  answer            jsonb,                            -- typed part
  status            text        not null default 'pending' check (status in ('pending','answered','expired','cancelled')),
  asked_of          uuid,                             -- the member asked (advisory)
  answered_by       uuid,                             -- the member who answered (ruling 5)
  expires_at        timestamptz not null,             -- 14-day clarify deadline (ruling 6)
  claim_lease_until timestamptz,                      -- delivery lease (runtime only)
  claimed_by        text,
  delivered_at      timestamptz,
  created_at        timestamptz not null default now(),
  answered_at       timestamptz,
  constraint ck_interruption_answer check (
    (status = 'answered') =
    (answer is not null and answered_by is not null and answered_at is not null))
);

-- 2.5 wakes_outbox — the uniform HELD projection of a drained wake decision (§3.4 /
--     ruling 2). One row per consumed intent; firm/subject/condition DERIVED from
--     intent→event; status held→cancelled only.
create table clara.wakes_outbox (
  id         uuid        primary key default gen_random_uuid(),
  intent_id  uuid        not null unique,             -- one outbox row per intent
  firm_id    uuid        not null,                    -- derived from intent→event
  subject_id uuid,                                    -- the event's client_id (may be null)
  condition  text        not null,                    -- = the intent's decision (derived)
  status     text        not null default 'held' check (status in ('held','cancelled')),
  created_at timestamptz not null default now()
);

-- 2.6 Metering (§3.6). firm_limits: operator-set overrides (NULL ⇒ the fn-constant
--     defaults). firm_usage_daily: the UTC-day token ledger. task_usage: one row per
--     settled task (the idempotent settle key).
create table clara.firm_limits (
  firm_id             uuid        primary key,
  daily_token_limit   bigint      check (daily_token_limit is null or daily_token_limit >= 0),
  max_concurrent_runs int         check (max_concurrent_runs is null or max_concurrent_runs >= 0),
  updated_at          timestamptz not null default now()
);
create table clara.firm_usage_daily (
  firm_id     uuid        not null,
  usage_date  date        not null,                   -- UTC day (resets 08:00 MYT — ruling 4)
  tokens_used bigint      not null default 0 check (tokens_used >= 0),
  primary key (firm_id, usage_date)
);
create table clara.task_usage (
  task_id    uuid        primary key,
  firm_id    uuid        not null,
  tokens     bigint      not null default 0 check (tokens >= 0),
  created_at timestamptz not null default now()
);

-- 2.6b task_checkpoints — per-segment DURABLE checkpoints (S4-AB6). The workflow
--      checkpoints EVERY segment (tokens + the segment's typed parts); rows are
--      immutable and replay-idempotent (checkpoint_turn is INSERT ON CONFLICT DO
--      NOTHING). settle's authoritative token total is sum(tokens) over a task's
--      checkpoints (single accounting path — §3.6 / see settle_chat_turn), and a
--      cancel/repair settle with no assistant parts falls back to the CONCATENATED
--      checkpoint parts so incurred work is never discarded. No firm_id column — the
--      table is runtime-internal, keyed by task_id.
create table clara.task_checkpoints (
  task_id    uuid        not null,
  segment    int         not null,
  tokens     bigint      not null default 0 check (tokens >= 0),
  parts      jsonb       not null default '[]' check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now(),
  primary key (task_id, segment)
);

-- 2.7 Traces (§3.7 / ruling 8). Upsert key (trace_id, span_id); firm/task identity
--     DERIVED from the task row so a span-id collision can never cross firms (S4-D9).
create table clara.trace_spans (
  trace_id       text        not null,
  span_id        text        not null,
  task_id        uuid        not null,               -- firm derived from it; immutable
  firm_id        uuid        not null,
  parent_span_id text,
  name           text,
  started_at     timestamptz not null default now(), -- the prune key (crashed spans prune too)
  ended_at       timestamptz,
  attributes     jsonb       not null default '{}',
  primary key (trace_id, span_id)
);
create index ix_trace_spans_started on clara.trace_spans (started_at);   -- the prune scan path
-- The audited prune ledger (append-only) — one row per prune batch.
create table clara.trace_prune_log (
  id            bigint      generated always as identity primary key,
  pruned_before timestamptz not null,
  spans_deleted bigint      not null,
  pruned_at     timestamptz not null default now()
);

-- 2.8 Health (§3.8). runtime_heartbeats: one row per supervisor component.
create table clara.runtime_heartbeats (
  component text        primary key,
  beat_at   timestamptz not null default now()
);

-- =====================================================================
-- 3. TRIGGER FUNCTIONS (SECURITY DEFINER, pinned search_path — 0003/0005 style).
--    The generic clara._tf_append_only / clara._tf_no_truncate (0003) are reused.
-- =====================================================================

-- wake_intents: BEFORE INSERT default-forcer (S4-D7 — the runtime INSERT grant must
-- not FORGE a consumed row; the stamping law). Runs alongside 0005's stamp trigger.
create function clara._tf_wake_intent_insert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  new.status := 'pending';
  new.consumed_at := null;
  new.consumed_by := null;
  return new;
end $$;

-- wake_intents: BEFORE UPDATE/DELETE — allow EXACTLY pending→consumed (derive
-- consumed_at, require consumed_by); freeze every other column; block DELETE.
create function clara._tf_wake_intent_consume() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wake_intents rows are not deleted' using errcode = 'CLR08';
  end if;
  if not (old.status = 'pending' and new.status = 'consumed') then
    raise exception 'a wake_intent may only transition pending->consumed' using errcode = 'CLR08';
  end if;
  if new.consumed_by is null then
    raise exception 'consuming a wake_intent requires consumed_by' using errcode = 'CLR10';
  end if;
  new.consumed_at := now();                          -- derived (the column grant excludes it)
  if (to_jsonb(new) - array['status','consumed_at','consumed_by'])
     is distinct from (to_jsonb(old) - array['status','consumed_at','consumed_by']) then
    raise exception 'only status/consumed_at/consumed_by may change on a wake_intent' using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- chat_sessions: BEFORE INSERT — the author MUST be a LIVE ACTIVE member of the
-- session's firm_id (§3.5 / S4-N15). firm_id is VALIDATED, not silently rewritten: a
-- supplied firm_id that the author does not belong to is REJECTED (CLR10) rather than
-- coerced to the author's firm — a silent rewrite would mask a caller/attribution bug
-- and let a mismatched (firm_id, created_by) pair through. When the caller omits
-- firm_id it is derived from the author's sole active membership (0002's
-- uq_membership_active_user guarantees exactly one), so the accepted-row invariant
-- "created_by is an active member of firm_id" holds in EVERY case. Any active member
-- may start a chat (ruling 1 — the floor is a read-only advisor available to all).
-- created_by is immutable post-insert (the update guard freezes every column but
-- visibility).
create function clara._tf_chat_session_insert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_author_firm uuid;
begin
  if new.created_by is null then
    raise exception 'a chat session requires an author' using errcode = 'CLR10';
  end if;
  select firm_id into v_author_firm from clara.firm_memberships
    where user_id = new.created_by and status = 'active' limit 1;
  if v_author_firm is null then
    raise exception 'chat-session author % is not a live active member of any firm', new.created_by
      using errcode = 'CLR10';
  end if;
  if new.firm_id is null then
    new.firm_id := v_author_firm;                      -- derive the session's firm from the author
  elsif new.firm_id <> v_author_firm then
    raise exception 'chat-session author % is not a live active member of firm %', new.created_by, new.firm_id
      using errcode = 'CLR10';                          -- mismatch is REJECTED, never rewritten (S4-N15)
  end if;
  new.visibility := coalesce(new.visibility, 'private');
  if new.client_id is not null and not exists (
    select 1 from clara.clients c where c.id = new.client_id and c.firm_id = new.firm_id
  ) then
    raise exception 'client is not in the session''s firm' using errcode = 'CLR11';
  end if;
  return new;
end $$;

-- chat_sessions: BEFORE UPDATE/DELETE — only visibility may change, and only
-- private→firm (share is one-way; un-share is out of scope). No DELETE.
create function clara._tf_chat_session_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'chat sessions are not deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['visibility']) is distinct from (to_jsonb(old) - array['visibility']) then
    raise exception 'only visibility may change on a chat session' using errcode = 'CLR08';
  end if;
  if new.visibility <> old.visibility and not (old.visibility = 'private' and new.visibility = 'firm') then
    raise exception 'a chat session may only go private->firm' using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- agent_tasks: BEFORE INSERT — DERIVE firm/client (chat←session, wake←intent→event),
-- enforce kind↔parent↔status consistency; caller firm/client are OVERWRITTEN.
create function clara._tf_agent_task_insert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_client uuid;
begin
  if new.kind = 'chat_turn' then
    if new.session_id is null then
      raise exception 'a chat_turn task requires a session_id' using errcode = 'CLR10';
    end if;
    if new.origin_intent_id is not null then
      raise exception 'a chat_turn task must not reference a wake intent' using errcode = 'CLR10';
    end if;
    select firm_id, client_id into v_firm, v_client from clara.chat_sessions where id = new.session_id;
    if v_firm is null then
      raise exception 'agent_task references unknown session %', new.session_id using errcode = 'CLR10';
    end if;
    if new.status <> 'queued' then
      raise exception 'a chat_turn task is created queued' using errcode = 'CLR10';
    end if;
  elsif new.kind = 'wake' then
    if new.origin_intent_id is null then
      raise exception 'a wake task requires origin_intent_id' using errcode = 'CLR10';
    end if;
    if new.session_id is not null then
      raise exception 'a wake task must not reference a session' using errcode = 'CLR10';
    end if;
    select wi.firm_id, de.client_id into v_firm, v_client
      from clara.wake_intents wi join clara.domain_events de on de.id = wi.event_id
      where wi.id = new.origin_intent_id;
    if v_firm is null then
      raise exception 'wake task references unknown intent %', new.origin_intent_id using errcode = 'CLR10';
    end if;
    if new.status <> 'held' then
      raise exception 'a wake task is created held' using errcode = 'CLR10';
    end if;
  else
    raise exception 'unknown task kind %', new.kind using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  new.client_id := v_client;
  new.updated_at := now();
  return new;
end $$;

-- agent_tasks: BEFORE UPDATE/DELETE — identity/config immutability (S4-D3) + the FULL
-- legal transition matrix (S4-AB11). A status change outside the matrix (incl. any
-- move OUT of a terminal state) ⇒ CLR13. A non-status update (engine setting
-- workflow_run_id/trace_id/error_code/cancelled_* while status is unchanged) is always
-- allowed. No DELETE.
--   chat_turn:  queued        → running | cancel_requested | cancelled
--               running       → awaiting_input | cancel_requested | completed | failed
--               awaiting_input→ running | cancel_requested | expired | cancelled
--               cancel_requested → completed | failed | cancelled
--   wake:       held          → cancelled
create function clara._tf_agent_task_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'agent_tasks are not deleted' using errcode = 'CLR08';
  end if;
  if new.id <> old.id
     or new.firm_id <> old.firm_id
     or new.client_id is distinct from old.client_id
     or new.kind <> old.kind
     or new.origin_intent_id is distinct from old.origin_intent_id
     or new.session_id is distinct from old.session_id
     or new.turn_key is distinct from old.turn_key
     or new.created_by is distinct from old.created_by
     or new.model_snapshot is distinct from old.model_snapshot
     or new.created_at <> old.created_at then
    raise exception 'agent_task identity/config is immutable' using errcode = 'CLR08';
  end if;
  if new.status <> old.status then
    v_ok := case
      when old.kind = 'chat_turn' then case old.status
        when 'queued'           then new.status in ('running','cancel_requested','cancelled')
        when 'running'          then new.status in ('awaiting_input','cancel_requested','completed','failed')
        when 'awaiting_input'   then new.status in ('running','cancel_requested','expired','cancelled')
        when 'cancel_requested' then new.status in ('completed','failed','cancelled')
        else false end
      when old.kind = 'wake' then old.status = 'held' and new.status = 'cancelled'
      else false end;
    if not v_ok then
      raise exception 'illegal agent_task transition % -> % (kind %)', old.status, new.status, old.kind
        using errcode = 'CLR13';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- chat_messages: BEFORE INSERT — derive firm from the session; assign the per-session
-- seq (max+1, safe under one-live-turn — §3.5).
create function clara._tf_chat_message_insert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select firm_id into v_firm from clara.chat_sessions where id = new.session_id;
  if v_firm is null then
    raise exception 'message references unknown session %', new.session_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  new.seq := (select coalesce(max(seq), 0) + 1 from clara.chat_messages where session_id = new.session_id);
  -- Bounded part-shape validation (S4-AB12): parts is a jsonb array (also a table
  -- CHECK belt) whose EVERY element is an object carrying a text 'type' field. Not a
  -- full schema — a structural floor so a malformed part can never persist. The
  -- array-type guard MUST precede jsonb_array_elements (which errors on a non-array),
  -- so a non-array is rejected here with a clean CLR10 rather than a raw 22023.
  if jsonb_typeof(new.parts) <> 'array' then
    raise exception 'chat_message parts must be a json array' using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.parts) e
    where jsonb_typeof(e.value) <> 'object' or jsonb_typeof(e.value -> 'type') is distinct from 'string'
  ) then
    raise exception 'each chat_message part must be an object with a text ''type'' field' using errcode = 'CLR10';
  end if;
  return new;
end $$;

-- agent_interruptions: BEFORE INSERT — derive firm from the task; force the clean
-- pending shape (no forged answer/delivery on insert).
create function clara._tf_interruption_insert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select firm_id into v_firm from clara.agent_tasks where id = new.task_id;
  if v_firm is null then
    raise exception 'interruption references unknown task %', new.task_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  new.status := 'pending';
  new.answer := null; new.answered_by := null; new.answered_at := null;
  new.claimed_by := null; new.claim_lease_until := null; new.delivered_at := null;
  return new;
end $$;

-- agent_interruptions: BEFORE UPDATE/DELETE — transition allowlist (pending→
-- answered|expired|cancelled) + frozen identity/content; lease/delivery columns are
-- free (runtime bookkeeping). The answered↔answer coherence is the table CHECK. No DELETE.
create function clara._tf_interruption_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'agent_interruptions are not deleted' using errcode = 'CLR08';
  end if;
  if new.id <> old.id or new.task_id <> old.task_id or new.firm_id <> old.firm_id
     or new.hook_token <> old.hook_token
     or new.kind <> old.kind or new.question is distinct from old.question
     or new.created_at <> old.created_at or new.expires_at <> old.expires_at
     or new.asked_of is distinct from old.asked_of then
    raise exception 'interruption identity/content is immutable' using errcode = 'CLR08';
  end if;
  if new.status <> old.status
     and not (old.status = 'pending' and new.status in ('answered','expired','cancelled')) then
    raise exception 'illegal interruption transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- wakes_outbox: BEFORE INSERT — DERIVE firm/subject/condition from intent→event
-- (caller values overwritten); force status='held'.
create function clara._tf_wakes_outbox_insert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_client uuid; v_decision text;
begin
  select wi.firm_id, wi.decision, de.client_id into v_firm, v_decision, v_client
    from clara.wake_intents wi join clara.domain_events de on de.id = wi.event_id
    where wi.id = new.intent_id;
  if v_firm is null then
    raise exception 'wakes_outbox references unknown intent %', new.intent_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  new.subject_id := v_client;
  new.condition := v_decision;                       -- condition = the intent's decision (derived)
  new.status := 'held';
  return new;
end $$;

-- wakes_outbox: BEFORE UPDATE/DELETE — only status held→cancelled; identity frozen; no DELETE.
create function clara._tf_wakes_outbox_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wakes_outbox rows are not deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['status']) is distinct from (to_jsonb(old) - array['status']) then
    raise exception 'only status may change on a wakes_outbox row' using errcode = 'CLR08';
  end if;
  if new.status <> old.status and not (old.status = 'held' and new.status = 'cancelled') then
    raise exception 'illegal wakes_outbox transition % -> %', old.status, new.status using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- trace_spans: BEFORE INSERT/UPDATE — DERIVE firm from the task (S4-D9); the task
-- identity is immutable (a span can never be repointed across firms).
create function clara._tf_trace_span_stamp() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  if new.task_id is null then
    raise exception 'a trace span requires a task_id' using errcode = 'CLR10';
  end if;
  if tg_op = 'UPDATE' and new.task_id <> old.task_id then
    raise exception 'a trace span''s task is immutable' using errcode = 'CLR08';
  end if;
  select firm_id into v_firm from clara.agent_tasks where id = new.task_id;
  if v_firm is null then
    raise exception 'trace span references unknown task %', new.task_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  return new;
end $$;

-- =====================================================================
-- 4. TRIGGERS.
-- =====================================================================

-- wake_intents: swap the Slice-3 freeze for the consumption lifecycle. Keep stamp +
-- no-truncate (Slice 3). Two BEFORE INSERT triggers fire in name order — both operate
-- on independent columns.
drop trigger t_wake_intents_append_only on clara.wake_intents;
create trigger t_wake_intents_insert before insert on clara.wake_intents
  for each row execute function clara._tf_wake_intent_insert();
create trigger t_wake_intents_consume before update or delete on clara.wake_intents
  for each row execute function clara._tf_wake_intent_consume();

-- chat_sessions
create trigger t_chat_session_insert before insert on clara.chat_sessions
  for each row execute function clara._tf_chat_session_insert();
create trigger t_chat_session_update before update or delete on clara.chat_sessions
  for each row execute function clara._tf_chat_session_update();
create trigger t_chat_session_no_truncate before truncate on clara.chat_sessions
  for each statement execute function clara._tf_no_truncate();

-- agent_tasks
create trigger t_agent_task_insert before insert on clara.agent_tasks
  for each row execute function clara._tf_agent_task_insert();
create trigger t_agent_task_update before update or delete on clara.agent_tasks
  for each row execute function clara._tf_agent_task_update();
create trigger t_agent_task_no_truncate before truncate on clara.agent_tasks
  for each statement execute function clara._tf_no_truncate();

-- chat_messages: derive/seq on insert; append-only (immutable) otherwise.
create trigger t_chat_message_insert before insert on clara.chat_messages
  for each row execute function clara._tf_chat_message_insert();
create trigger t_chat_message_append_only before update or delete on clara.chat_messages
  for each row execute function clara._tf_append_only();
create trigger t_chat_message_no_truncate before truncate on clara.chat_messages
  for each statement execute function clara._tf_no_truncate();

-- agent_interruptions
create trigger t_interruption_insert before insert on clara.agent_interruptions
  for each row execute function clara._tf_interruption_insert();
create trigger t_interruption_update before update or delete on clara.agent_interruptions
  for each row execute function clara._tf_interruption_update();
create trigger t_interruption_no_truncate before truncate on clara.agent_interruptions
  for each statement execute function clara._tf_no_truncate();

-- wakes_outbox
create trigger t_wakes_outbox_insert before insert on clara.wakes_outbox
  for each row execute function clara._tf_wakes_outbox_insert();
create trigger t_wakes_outbox_update before update or delete on clara.wakes_outbox
  for each row execute function clara._tf_wakes_outbox_update();
create trigger t_wakes_outbox_no_truncate before truncate on clara.wakes_outbox
  for each statement execute function clara._tf_no_truncate();

-- trace_spans: stamp on insert/update; block truncate (prune uses DELETE).
create trigger t_trace_span_stamp before insert or update on clara.trace_spans
  for each row execute function clara._tf_trace_span_stamp();
create trigger t_trace_spans_no_truncate before truncate on clara.trace_spans
  for each statement execute function clara._tf_no_truncate();

-- trace_prune_log: append-only audit ledger.
create trigger t_trace_prune_log_append_only before update or delete on clara.trace_prune_log
  for each row execute function clara._tf_append_only();
create trigger t_trace_prune_log_no_truncate before truncate on clara.trace_prune_log
  for each statement execute function clara._tf_no_truncate();

-- task_checkpoints: immutable rows (S4-AB6 — replay-idempotent inserts only).
create trigger t_task_checkpoints_append_only before update or delete on clara.task_checkpoints
  for each row execute function clara._tf_append_only();
create trigger t_task_checkpoints_no_truncate before truncate on clara.task_checkpoints
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================
-- 5. THE MASKED HUMAN SURFACE (S4-C1/ND1). Humans hold ZERO grant on the
--    agent_tasks BASE table; agent_tasks_visible is a PLAIN definer view (NOT
--    security_invoker) firm-pinned by jwt_firm() in its predicate. session_id +
--    created_by are revealed ONLY where the joined session is firm-visible OR
--    authored by the caller (no private-session oracle). trace_id is never exposed.
-- =====================================================================
create view clara.agent_tasks_visible as
  select
    t.id, t.kind, t.status, t.client_id, t.error_code,
    t.created_at, t.updated_at, t.cancelled_by, t.cancelled_at,
    case when s.visibility = 'firm' or s.created_by = clara.jwt_sub()
         then t.session_id end as session_id,
    case when s.visibility = 'firm' or s.created_by = clara.jwt_sub()
         then t.created_by end as created_by
  from clara.agent_tasks t
  left join clara.chat_sessions s on s.id = t.session_id
  where t.firm_id = clara.jwt_firm();

-- =====================================================================
-- 6. RLS — FORCE everywhere; owner using(true)/with check(true) on EVERY new table
--    (N9). App policies are role-pinned to a single identity source (house rule).
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'chat_sessions','agent_tasks','chat_messages','agent_interruptions','wakes_outbox',
    'firm_limits','firm_usage_daily','task_usage','task_checkpoints','trace_spans',
    'trace_prune_log','runtime_heartbeats'
  ] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
  end loop;
end $$;

-- agent_tasks: runtime writes/reads ALL (the drain + engine); NO human grant on the
-- base table (the masked view is the human surface); no agent lane.
create policy p_agent_tasks_runtime on clara.agent_tasks for all
  to clara_runtime using (true) with check (true);

-- chat_sessions: runtime writes/reads ALL; human SELECT under the visibility law
-- (firm-pinned AND (shared OR own) — no private-session existence oracle). No agent.
create policy p_chat_sessions_runtime on clara.chat_sessions for all
  to clara_runtime using (true) with check (true);
create policy p_chat_sessions_human on clara.chat_sessions for select
  to clara_authenticated using (
    firm_id = clara.jwt_firm() and (visibility = 'firm' or created_by = clara.jwt_sub()));

-- chat_messages: runtime ALL; human SELECT via the session-visibility predicate (a
-- message is visible iff its session is visible to the caller). No agent.
create policy p_chat_messages_runtime on clara.chat_messages for all
  to clara_runtime using (true) with check (true);
create policy p_chat_messages_human on clara.chat_messages for select
  to clara_authenticated using (exists (
    select 1 from clara.chat_sessions s
    where s.id = chat_messages.session_id and s.firm_id = clara.jwt_firm()
      and (s.visibility = 'firm' or s.created_by = clara.jwt_sub())));

-- agent_interruptions: runtime ALL; human SELECT firm-pinned (clarify Q/A are
-- firm-visible objects by ruling 5). No agent.
create policy p_agent_interruptions_runtime on clara.agent_interruptions for all
  to clara_runtime using (true) with check (true);
create policy p_agent_interruptions_human on clara.agent_interruptions for select
  to clara_authenticated using (firm_id = clara.jwt_firm());

-- wakes_outbox: runtime ALL; human SELECT firm-pinned (the held projection is
-- firm-visible — ruling 2). No agent.
create policy p_wakes_outbox_runtime on clara.wakes_outbox for all
  to clara_runtime using (true) with check (true);
create policy p_wakes_outbox_human on clara.wakes_outbox for select
  to clara_authenticated using (firm_id = clara.jwt_firm());

-- Metering: OWNER-ONLY (the begin/settle definer fns touch them as clara_fn_owner).
-- No human, agent, OR runtime grant — humans have zero grant (rig-asserted).
-- (owner policy already created by the loop above.)

-- trace_spans + heartbeats: runtime writes/reads directly (§3.7/§3.8). Both human
-- AND agent_ro denied (rig). trace_prune_log: owner-only (written by the prune fn).
create policy p_trace_spans_runtime on clara.trace_spans for all
  to clara_runtime using (true) with check (true);
create policy p_runtime_heartbeats_runtime on clara.runtime_heartbeats for all
  to clara_runtime using (true) with check (true);

-- task_checkpoints: runtime writes/reads (checkpoint_turn is the idempotent path;
-- settle reads the sum). Rows immutable (append-only trigger). No human, no agent.
create policy p_task_checkpoints_runtime on clara.task_checkpoints for all
  to clara_runtime using (true) with check (true);

-- =====================================================================
-- 7. TABLE / COLUMN GRANTS. The GRANT is the wall (RLS still scopes every read).
-- =====================================================================
-- wake_intents: the drain writes ONLY status + consumed_by (consumed_at is derived).
grant update (status, consumed_by) on clara.wake_intents to clara_runtime;

-- chat plane: runtime creates sessions + reads history; humans read under the RLS.
grant select, insert on clara.chat_sessions to clara_runtime;
grant select         on clara.chat_sessions to clara_authenticated;
grant select, insert on clara.chat_messages to clara_runtime;
grant select         on clara.chat_messages to clara_authenticated;

-- agent_tasks: runtime writes the base; humans read ONLY the masked view.
grant select, insert, update on clara.agent_tasks to clara_runtime;
grant select on clara.agent_tasks_visible to clara_authenticated;

-- clarify + outbox: runtime writes; humans read firm-scoped.
grant select, insert, update on clara.agent_interruptions to clara_runtime;
grant select                 on clara.agent_interruptions to clara_authenticated;
grant select, insert, update on clara.wakes_outbox to clara_runtime;
grant select                 on clara.wakes_outbox to clara_authenticated;

-- traces + heartbeats: runtime only (no human, no agent_ro).
grant select, insert, update on clara.trace_spans to clara_runtime;
grant select, insert, update on clara.runtime_heartbeats to clara_runtime;

-- task_checkpoints: runtime select + insert (immutable — no update/delete grant; the
-- append-only trigger backs it). No human, no agent_ro.
grant select, insert on clara.task_checkpoints to clara_runtime;

-- =====================================================================
-- 8. FUNCTIONS. All SECURITY DEFINER (owned clara_fn_owner, pinned search_path).
--    Grants are (re-)asserted in the tail sweep (§9).
-- =====================================================================

-- resolve_chat_principal — the runtime's ONLY membership surface (S4-ND2). Returns
-- the sub's LIVE firm + role (the jwt_firm/wake_firm house pattern). The v2 direct
-- firm_memberships grant is DROPPED — grant-without-policy returns zero rows under
-- FORCE RLS anyway. EXECUTE to clara_runtime only.
create function clara.resolve_chat_principal(p_sub uuid)
  returns table(firm_id uuid, role text)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select m.firm_id, m.role from clara.firm_memberships m
  where m.user_id = p_sub and m.status = 'active' limit 1;
$$;

-- cancel_agent_task (human lane, §3.2) — any write-capable member of the task's firm
-- (ruling 10); idempotent; ONE txn; LOCK TASK THEN INTERRUPTIONS (documented order);
-- cascades pending interruptions + a held wake task's outbox row; engine-active →
-- cancel_requested else terminal settle. Audit id-shaped; NOTIFY empty payload.
create function clara.cancel_agent_task(p_task uuid, p_op_key text) returns jsonb
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
  if t.kind = 'wake' and t.origin_intent_id is not null then
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

-- answer_interruption (human lane, §3.3) — any write-capable member of the firm
-- (ruling 5). LOCK the row, THEN compare the deadline with clock_timestamp() AFTER
-- acquiring it (S4-D5 — now() freezes at txn start; a wait-across-deadline answer
-- must lose). Idempotent; audit id-shaped; NOTIFY.
create function clara.answer_interruption(p_id uuid, p_answer jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; i record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'answer_interruption', p_op_key,
    clara._hash(jsonb_build_object('i', p_id, 'a', p_answer)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into i from clara.agent_interruptions where id = p_id for update;   -- acquire the row
  if not found or i.firm_id <> c.firm then raise exception 'interruption not in your firm' using errcode = 'CLR11'; end if;
  if i.status <> 'pending' then raise exception 'interruption is not pending (%)', i.status using errcode = 'CLR13'; end if;
  if i.expires_at < clock_timestamp() then                            -- deadline compared AFTER acquiring (S4-D5)
    raise exception 'the clarify has expired' using errcode = 'CLR13';
  end if;

  update clara.agent_interruptions
     set status = 'answered', answer = p_answer, answered_by = c.actor, answered_at = now()
   where id = p_id and status = 'pending';
  perform clara._audit(c.firm, c.actor, null, null, 'answer_interruption', null,
    jsonb_build_object('interruption', p_id, 'op_key', p_op_key));
  perform pg_notify('clara_runtime_ctl', '');
  return clara._finish_op(c.firm, 'answer_interruption', p_op_key,
    jsonb_build_object('interruption_id', p_id, 'status', 'answered'));
end $$;

-- share_chat_session (human lane, §3.5) — AUTHOR-ONLY; flips private→firm. Any active
-- member may author + share their own session (viewer floor). Idempotent; audited.
create function clara.share_chat_session(p_session uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; s record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'share_chat_session', p_op_key, clara._hash(jsonb_build_object('s', p_session)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into s from clara.chat_sessions where id = p_session for update;
  if not found or s.firm_id <> c.firm then raise exception 'session not in your firm' using errcode = 'CLR11'; end if;
  if s.created_by <> c.actor then raise exception 'only the author may share a session' using errcode = 'CLR04'; end if;
  if s.visibility = 'firm' then
    return clara._finish_op(c.firm, 'share_chat_session', p_op_key,
      jsonb_build_object('session_id', p_session, 'visibility', 'firm'));    -- idempotent: already shared
  end if;
  update clara.chat_sessions set visibility = 'firm' where id = p_session;
  perform clara._audit(c.firm, c.actor, null, null, 'share_chat_session', null,
    jsonb_build_object('session', p_session, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'share_chat_session', p_op_key,
    jsonb_build_object('session_id', p_session, 'visibility', 'firm'));
end $$;

-- begin_chat_turn (runtime lane, §3.6) — ONE txn, fail-closed admission. Order:
-- resolve session→firm + continuation authority → NAMESPACED two-arg advisory lock
-- (S4-ND6, admission can never alias the relay's single-arg leadership) → turn_key
-- replay → budget (UTC day) → compute-cap (COMPUTE states only — S4-P5/ND3) →
-- insert user message + task (with model_snapshot). CLR14 names the limit; the
-- one-live-turn 23505 maps to CLR13.
create function clara.begin_chat_turn(p_session uuid, p_author uuid, p_turn_key text,
    p_user_parts jsonb, p_model text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_visibility text; v_created_by uuid;
  v_existing_task uuid;
  v_token_limit bigint; v_run_cap int;
  v_today date := (now() at time zone 'UTC')::date;
  v_tokens_used bigint; v_active int; v_task uuid;
begin
  if p_turn_key is null or btrim(p_turn_key) = '' then raise exception 'a turn_key is required' using errcode = 'CLR10'; end if;
  select firm_id, visibility, created_by into v_firm, v_visibility, v_created_by
    from clara.chat_sessions where id = p_session;
  if v_firm is null then raise exception 'unknown session' using errcode = 'CLR11'; end if;
  -- The author must be a live active member of the session's firm.
  if not exists (select 1 from clara.firm_memberships
                 where user_id = p_author and firm_id = v_firm and status = 'active') then
    raise exception 'author is not a live active member of the session firm' using errcode = 'CLR04';
  end if;
  -- Continuation authority (ruling 9): a PRIVATE session is continuable ONLY by its
  -- author; a shared session by any firm member. No-oracle: a foreign private session
  -- reads as not-found.
  if v_visibility = 'private' and v_created_by <> p_author then
    raise exception 'session not found' using errcode = 'CLR11';
  end if;

  -- Namespaced admission lock (S4-ND6): the TWO-arg form (classid, objid) lives in a
  -- SEPARATE advisory-lock space from the relay's single-arg leadership key, so
  -- admission can never alias it. 202991617 = the CLASS_ADMIT classid constant.
  perform pg_advisory_xact_lock(202991617, hashtext(v_firm::text));

  -- turn_key replay → the ORIGINAL task (idempotent; the user message carries the key).
  select task_id into v_existing_task from clara.chat_messages
    where session_id = p_session and turn_key = p_turn_key and role = 'user' limit 1;
  if v_existing_task is not null then
    return (select jsonb_build_object('task_id', at.id, 'status', at.status, 'replayed', true)
            from clara.agent_tasks at where at.id = v_existing_task);
  end if;

  -- Limits (fn-constant defaults when the row/columns are NULL — §0.4).
  select coalesce(daily_token_limit, 1000000), coalesce(max_concurrent_runs, 3)
    into v_token_limit, v_run_cap from clara.firm_limits where firm_id = v_firm;
  if not found then v_token_limit := 1000000; v_run_cap := 3; end if;

  -- Budget (fail-closed): reject NEW work when the UTC day is already at/over limit.
  -- Overshoot ≤ the in-flight admitted runs' spend (they check at admission, settle later).
  select coalesce(tokens_used, 0) into v_tokens_used
    from clara.firm_usage_daily where firm_id = v_firm and usage_date = v_today;
  if coalesce(v_tokens_used, 0) >= v_token_limit then
    raise exception 'daily token budget exhausted for firm (used %/% tokens on UTC day %; resets 00:00 UTC / 08:00 MYT)',
      coalesce(v_tokens_used, 0), v_token_limit, v_today using errcode = 'CLR14';
  end if;

  -- Compute-cap: count COMPUTE runs only (queued/running/cancel_requested chat tasks).
  -- held + awaiting_input are zero-compute and consume NO slot (§0.4 / S4-C7/ND3).
  -- Race-free under the per-firm advisory lock (S4-P5: advisory-lock + count + insert).
  select count(*) into v_active from clara.agent_tasks
    where firm_id = v_firm and kind = 'chat_turn'
      and status in ('queued','running','cancel_requested');
  if v_active >= v_run_cap then
    raise exception 'concurrent compute-run cap reached for firm (% of % running)', v_active, v_run_cap
      using errcode = 'CLR14';
  end if;

  -- Admit: the task first (its 23505 on one-live-turn maps to CLR13), then the user message.
  begin
    insert into clara.agent_tasks (kind, session_id, turn_key, status, created_by, model_snapshot)
      values ('chat_turn', p_session, p_turn_key, 'queued', p_author, p_model)
      returning id into v_task;
  exception when unique_violation then
    raise exception 'a turn is already live for this session' using errcode = 'CLR13';
  end;
  insert into clara.chat_messages (session_id, role, task_id, turn_key, parts)
    values (p_session, 'user', v_task, p_turn_key, coalesce(p_user_parts, '[]'::jsonb));

  return jsonb_build_object('task_id', v_task, 'status', 'queued', 'replayed', false);
end $$;

-- settle_chat_turn (runtime lane, §3.6, amended S4-AB6) — terminal settle.
-- ACCOUNTING: the authoritative token total is sum(task_checkpoints.tokens) for the
-- task (the workflow checkpoints EVERY segment). p_tokens is RETAINED for signature
-- stability but is NOT added — a SINGLE accounting path, so no double count.
-- PARTS: a cancel/repair settle with null/empty p_parts upserts the CONCATENATED
-- checkpointed parts (in segment/element order) so incurred work is never discarded.
-- task_usage is on-conflict-nothing; the daily total increments ONLY when the ledger
-- row was new; a terminal replay is a stored-outcome no-op; closes pending
-- interruptions on every terminal settle (S4-D6). The status write is matrix-gated
-- (S4-AB11): a bad outcome for the current state raises CLR13 and rolls the txn back.
create function clara.settle_chat_turn(p_task uuid, p_parts jsonb, p_tokens bigint,
    p_outcome text, p_error_code text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare t record; v_new boolean; v_day date; v_total bigint; v_parts jsonb;
begin
  if p_outcome not in ('completed','failed','cancelled','expired') then
    raise exception 'bad settle outcome %', p_outcome using errcode = 'CLR10';
  end if;
  select * into t from clara.agent_tasks where id = p_task for update;
  if not found then raise exception 'unknown task' using errcode = 'CLR11'; end if;
  if t.kind <> 'chat_turn' then raise exception 'settle_chat_turn is for chat turns only' using errcode = 'CLR10'; end if;
  if t.status in ('completed','failed','cancelled','expired') then
    -- Terminal no-op — receipt is SHAPE-IDENTICAL to the fresh one (carries the stored tokens).
    return jsonb_build_object('task_id', p_task, 'status', t.status, 'replayed', true,
      'tokens', (select coalesce(tokens, 0) from clara.task_usage where task_id = p_task));
  end if;

  -- Authoritative usage = sum of the durable per-segment checkpoints (S4-AB6).
  select coalesce(sum(tokens), 0) into v_total from clara.task_checkpoints where task_id = p_task;

  -- Assistant reply parts: caller-supplied when non-empty, else the CONCATENATED
  -- checkpoint parts (incurred work is never discarded on a cancel/repair settle).
  if p_parts is null or p_parts = '[]'::jsonb then
    select coalesce(jsonb_agg(e.value order by tc.segment, e.ord), '[]'::jsonb) into v_parts
      from clara.task_checkpoints tc,
           lateral jsonb_array_elements(tc.parts) with ordinality as e(value, ord)
     where tc.task_id = p_task;
  else
    v_parts := p_parts;
  end if;

  -- Assistant reply (append-only; a partial-retry duplicate is absorbed).
  insert into clara.chat_messages (session_id, role, task_id, parts)
    values (t.session_id, 'assistant', p_task, v_parts)
    on conflict (task_id) where role = 'assistant' do nothing;

  -- Token ledger: one row per task; the daily total increments ONLY when this is new.
  insert into clara.task_usage (task_id, firm_id, tokens)
    values (p_task, t.firm_id, v_total)
    on conflict (task_id) do nothing;
  v_new := found;
  if v_new then
    v_day := (t.created_at at time zone 'UTC')::date;              -- attribute to the admission UTC day
    insert into clara.firm_usage_daily (firm_id, usage_date, tokens_used)
      values (t.firm_id, v_day, v_total)
      on conflict (firm_id, usage_date)
      do update set tokens_used = firm_usage_daily.tokens_used + excluded.tokens_used;
  end if;

  -- Settle terminal (error_code CHECK is the allowlist wall — S4-C1; transition
  -- matrix-gated — S4-AB11); close pending clarifies.
  update clara.agent_tasks set status = p_outcome, error_code = p_error_code, updated_at = now()
    where id = p_task;
  update clara.agent_interruptions set status = 'cancelled' where task_id = p_task and status = 'pending';

  return jsonb_build_object('task_id', p_task, 'status', p_outcome, 'replayed', false, 'tokens', v_total);
end $$;

-- open_interruption (runtime lane, §3.3 / S4-AB4) — ATOMIC + IDEMPOTENT clarify open.
-- Order (S4-AB4 round-2): (1) same hook_token already on this task → return its id
-- (idempotent — a memoized-token crash-replay lands here); (2) ANY OTHER pending
-- interruption on the task → CLR13, NO insert, NO transition (EXPLICIT linearization —
-- the transition gate alone is insufficient because awaiting_input→running is a legal
-- resume, so a task can be running WITH a pending clarify and a fresh token would else
-- double-open); (3) else conditionally transition running→awaiting_input AND insert a
-- pending interruption (expires_at now()+14d) in ONE txn — a zero-row transition (task
-- not running) ⇒ CLR13 and NO insert.
create function clara.open_interruption(p_task uuid, p_hook_token text, p_question jsonb,
    p_asked_of uuid default null) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_id uuid; v_task uuid; v_upd int;
begin
  if p_hook_token is null or btrim(p_hook_token) = '' then
    raise exception 'a hook_token is required' using errcode = 'CLR10';
  end if;
  -- (1) Idempotent replay on the (globally-unique) hook_token.
  select id, task_id into v_id, v_task from clara.agent_interruptions where hook_token = p_hook_token;
  if v_id is not null then
    if v_task <> p_task then
      raise exception 'hook_token is already bound to a different task' using errcode = 'CLR13';
    end if;
    return v_id;                                                    -- replay no-op
  end if;
  -- (2) Linearization: a DIFFERENT pending clarify already blocks this task (no insert,
  -- no transition). This catches the running-with-a-pending-clarify double-open.
  if exists (select 1 from clara.agent_interruptions where task_id = p_task and status = 'pending') then
    raise exception 'a clarify is already pending for task %', p_task using errcode = 'CLR13';
  end if;
  -- (3) Conditional transition (running→awaiting_input); zero rows ⇒ not running ⇒ CLR13.
  update clara.agent_tasks set status = 'awaiting_input', updated_at = now()
    where id = p_task and status = 'running';
  get diagnostics v_upd = row_count;
  if v_upd = 0 then
    -- A concurrent open may have committed first — re-check the token before failing.
    select id, task_id into v_id, v_task from clara.agent_interruptions where hook_token = p_hook_token;
    if v_id is not null and v_task = p_task then return v_id; end if;
    raise exception 'cannot open a clarify: task % is not running', p_task using errcode = 'CLR13';
  end if;
  begin
    insert into clara.agent_interruptions (task_id, hook_token, question, asked_of, expires_at)
      values (p_task, p_hook_token, coalesce(p_question, '{}'::jsonb), p_asked_of, now() + interval '14 days')
      returning id into v_id;
  exception when unique_violation then
    -- A concurrent open won the token. It MUST be for THIS task (S4-FX4): a cross-task
    -- collision means two running tasks raced the same token — hand the loser CLR13 so
    -- its own running→awaiting_input transition (done above, this same txn) ROLLS BACK
    -- rather than stranding the task parked with no interruption of its own.
    select id, task_id into v_id, v_task from clara.agent_interruptions where hook_token = p_hook_token;
    if v_task is distinct from p_task then
      raise exception 'hook_token is already bound to a different task' using errcode = 'CLR13';
    end if;
  end;
  return v_id;
end $$;

-- checkpoint_turn (runtime lane, §3.6 / S4-AB6) — durable per-segment checkpoint.
-- INSERT ON CONFLICT DO NOTHING ⇒ replay-idempotent (a re-run of a memoized segment
-- never double-counts). settle sums these for the task's authoritative token total.
create function clara.checkpoint_turn(p_task uuid, p_segment int, p_tokens bigint, p_parts jsonb)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  insert into clara.task_checkpoints (task_id, segment, tokens, parts)
    values (p_task, p_segment, coalesce(p_tokens, 0), coalesce(p_parts, '[]'::jsonb))
    on conflict (task_id, segment) do nothing;
end $$;

-- prune_trace_spans (runtime lane, §3.7 / ruling 8) — started_at-keyed, bounded-batch,
-- audited (trace_prune_log). Crashed spans (no ended_at) prune too.
create function clara.prune_trace_spans(p_before timestamptz, p_limit int default 10000) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_deleted bigint;
begin
  with doomed as (
    select trace_id, span_id from clara.trace_spans
    where started_at < p_before order by started_at limit greatest(p_limit, 0)
  )
  delete from clara.trace_spans t using doomed d
   where t.trace_id = d.trace_id and t.span_id = d.span_id;
  get diagnostics v_deleted = row_count;
  insert into clara.trace_prune_log (pruned_before, spans_deleted) values (p_before, v_deleted);
  return jsonb_build_object('pruned_before', p_before, 'spans_deleted', v_deleted);
end $$;

-- relay_health (runtime lane, §3.8) — a STABLE cross-firm health snapshot.
create function clara.relay_health() returns jsonb
  language sql stable security definer set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'heartbeats', (select coalesce(jsonb_object_agg(component, beat_at), '{}'::jsonb) from clara.runtime_heartbeats),
    'pending_intents', (select count(*) from clara.wake_intents where status = 'pending'),
    'held_outbox', (select count(*) from clara.wakes_outbox where status = 'held'),
    'pending_dead_letters', (select count(*) from clara.relay_dead_letters where status = 'pending'),
    'checked_at', now()
  );
$$;

-- =====================================================================
-- 9. PUBLIC-execute sweep + re-asserted grants (N13). The sweep revokes PUBLIC only;
--    the 0004/0005 named grants survive it. Every function CREATED here is
--    PUBLIC-executable until this revoke, so grant the intended lanes AFTER it. The
--    internal trigger fns + prune helper stay reachable ONLY in owner/definer context.
-- =====================================================================
revoke execute on all functions in schema clara from public;

-- runtime lane
grant execute on function clara.resolve_chat_principal(uuid) to clara_runtime;
grant execute on function clara.begin_chat_turn(uuid, uuid, text, jsonb, text) to clara_runtime;
grant execute on function clara.settle_chat_turn(uuid, jsonb, bigint, text, text) to clara_runtime;
grant execute on function clara.open_interruption(uuid, text, jsonb, uuid) to clara_runtime;
grant execute on function clara.checkpoint_turn(uuid, int, bigint, jsonb) to clara_runtime;
grant execute on function clara.prune_trace_spans(timestamptz, int) to clara_runtime;
grant execute on function clara.relay_health() to clara_runtime;

-- human lane (dashboard → PostgREST as clara_authenticated; governance never transits the runtime)
grant execute on function clara.cancel_agent_task(uuid, text) to clara_authenticated;
grant execute on function clara.answer_interruption(uuid, jsonb, text) to clara_authenticated;
grant execute on function clara.share_chat_session(uuid, text) to clara_authenticated;

reset role;
