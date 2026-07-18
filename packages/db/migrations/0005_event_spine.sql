-- 0005_event_spine — Slice-3: the append-only event spine, the routing taxonomy,
-- the durable wake-intent relay tables, the freshness gate + context pack, and the
-- uniform-emission retrofit of every audited writer. Built on the Slice-2 governed
-- core (0002 identity/RBAC/audit, 0003 books tables/triggers, 0004 audited writers).
--
-- Authority: docs/plan/slice3-event-spine-contract.md v2.2 (RATIFIED — owner-grilled
-- 2026-07-18, two adversarial design reviews + deltas + as-built-review amendments
-- X6/X8 integrated), docs/architecture/
-- ARCHITECTURE.md §2 (ADR-007 event spine), ADR-009, ADR-015. Finding tags inline
-- (N* native review, C* Codex review, D* Codex delta, P* probe, R* owner ruling)
-- point at the WHY of each load-bearing detail.
--
-- WHAT THIS MIGRATION DOES (the six ratified semantics, §0 of the contract):
--  1. domain_events — one append-only, per-firm-monotonic log; every audited writer
--     appends its event(s) in the SAME txn (uniform emission law, §0.3).
--  2. firm_event_seq — a lazy per-firm counter, allocated LAST in every writer txn
--     (the txn-tail lock), NO FK to firms (C4 deadlock avoidance).
--  3. event_types — the seeded, append-only catalog (client-scoped vs firm-level).
--  4. taxonomy_versions / trigger_taxonomy / taxonomy_active — the immutable,
--     versioned routing taxonomy behind a guarded singleton pointer (C8).
--  5. wake_intents / relay_checkpoints / relay_dead_letters — the durable relay
--     surface the Slice-4 router drains (C6 stamping from the event, never trusted
--     from the caller; C15 dead-letter lifecycle).
--  6. assert_books_current + get_context_pack + the wake gate — the agent lane can
--     never COMMIT a draft made on stale context (C1 commit-time recheck).
--
-- NEW ERROR CODE (0002's header is immutable, so it is documented HERE):
--   CLR12 = stale context — a wake draft asserted a books-version token that is
--           behind the firm's current head, or the books moved under it before
--           commit. (Existing codes CLR01..CLR11 per the 0002 header.)
--
-- EMISSION LAW HONESTY (D1 — recorded as a deploy contract in packages/db/README.md
-- by this build): an in-flight PL/pgSQL execution finishes on its STARTING body, so
-- a writer running ACROSS this migration's commit could write WITHOUT emitting. This
-- is materially zero-risk today (no runtime is deployed until Slice 4; CI/throwaways
-- have no concurrent writers), but once a live runtime exists any migration that
-- replaces writer bodies REQUIRES an application write-quiesce.
--
-- PUBLIC-LOCKDOWN HONESTY (N13): 0004's `alter default privileges ... revoke execute
-- from public` is empirically a NO-OP for functions created afterwards, so EVERY
-- function this migration creates/replaces is PUBLIC-executable until the explicit
-- `revoke execute on all functions in schema clara from public` sweep at the tail.
-- Without that sweep any schema-USAGE role (clara_agent_ro) could reach
-- wake_draft_entry or _append_event. The sweep revokes PUBLIC only — named grants
-- (0004's matrix, preserved across CREATE OR REPLACE by P2) survive it; the two
-- DROP+CREATE'd functions have their grants re-asserted after it.

set role clara_fn_owner;

-- =====================================================================
-- A. TABLES + their guard/validation/stamping triggers.
--    All owned by clara_fn_owner (SET ROLE), money never appears here — the log is
--    id-shaped only (N2, CONFIDENTIALITY: clara_runtime reads ALL firms' events).
-- =====================================================================

-- A.1 event_types — the append-only catalog (reference data). client_scoped decides
--     whether an event MUST carry a null client_id (firm-level) or MAY carry one.
create table clara.event_types (
  name         text primary key,
  client_scoped boolean not null,
  description  text
);

-- A.2 firm_event_seq — the per-firm monotonic allocator. NO FK to firms (C4: an FK
--     takes a KEY SHARE lock on the firms row, which deadlocks against add_member's
--     `firms FOR UPDATE`; the writer already validated the firm — same precedent as
--     journal_entries.firm_id / audit_log carrying no firm FK). Lazy: a firm's row
--     is created by its FIRST event (P6 probes the concurrent-first-event path).
create table clara.firm_event_seq (
  firm_id uuid   primary key,           -- NO FK (C4)
  n       bigint not null default 0
);

-- A.3 domain_events — the append-only log. NO FKs except the static event_type ref
--     (C4: entry/document/resolution/client/firm are writer-validated, not FK'd, to
--     avoid cross-row locks in the write path). PK (firm_id, seq) gives per-firm
--     monotonicity (P1: commit order = seq order, committed seqs gap-free); `id` is
--     globally unique so the relay tables can reference a single event row.
create table clara.domain_events (
  firm_id       uuid        not null,                         -- NO FK (C4)
  seq           bigint      not null,                         -- per-firm monotonic (P1)
  id            uuid        not null unique default gen_random_uuid(),
  event_type    text        not null references clara.event_types(name),  -- static ref, safe
  client_id     uuid,                                         -- NO FK; NULL = firm-level
  actor         uuid,                                         -- NULL only for system/migration (books.baseline)
  on_behalf_of  uuid,
  via_wake_kind text,
  entry_id      uuid,                                         -- NO FK (C4); writer-validated
  document_id   uuid,                                         -- NO FK
  resolution_id uuid,                                         -- NO FK
  payload       jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  primary key (firm_id, seq)
);

-- A.4 Taxonomy: immutable versions (C8 — no is_active column), immutable rows, and a
--     guarded singleton pointer whose ONLY legal mutation is repointing `version`.
create table clara.taxonomy_versions (
  version    int         primary key,
  note       text,
  created_at timestamptz not null default now()
);
create table clara.trigger_taxonomy (
  version    int  not null references clara.taxonomy_versions(version),
  event_type text not null references clara.event_types(name),
  decision   text not null check (decision in
                ('internal_task','notification','background_review','context_update','ignore')),
  note       text,
  primary key (version, event_type)
);
-- Singleton pointer (C8): exactly one row (singleton pk = true), INSERTed here; the
-- guard trigger allows ONLY an UPDATE of `version` (no DELETE/TRUNCATE, no second row).
create table clara.taxonomy_active (
  singleton boolean primary key default true check (singleton),
  version   int     not null references clara.taxonomy_versions(version)
);

-- A.5 Relay surface (Slice-4 drains it). wake_intents = exactly one row per wake-bound
--     event; relay_checkpoints = per-(consumer,firm) progress; relay_dead_letters =
--     an uncovered/failed event, visible (not a write-only grave — C15).
create table clara.wake_intents (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null,
  event_id         uuid        not null references clara.domain_events(id),
  event_seq        bigint      not null,
  event_type       text        not null,
  decision         text        not null,
  taxonomy_version int         not null,
  status           text        not null default 'pending' check (status in ('pending')),
  created_at       timestamptz not null default now(),
  unique (event_id)
);
create table clara.relay_checkpoints (
  consumer   text        not null,
  firm_id    uuid        not null,
  last_seq   bigint      not null default 0,
  updated_at timestamptz not null default now(),
  primary key (consumer, firm_id)
);
create table clara.relay_dead_letters (
  consumer                 text        not null,
  event_id                 uuid        not null references clara.domain_events(id),
  firm_id                  uuid        not null,
  event_seq                bigint,
  event_type               text,
  attempted_taxonomy_version int,
  reason                   text        not null,
  attempt_count            int         not null default 1,
  status                   text        not null default 'pending' check (status in ('pending','resolved')),
  created_at               timestamptz not null default now(),
  resolved_at              timestamptz,
  primary key (consumer, event_id)
);

-- ---------------------------------------------------------------------
-- Trigger functions (SECURITY DEFINER, pinned search_path — 0003 house style). The
-- generic append-only + no-truncate guards (clara._tf_append_only / _tf_no_truncate)
-- are reused from 0003. New ones below.
-- ---------------------------------------------------------------------

-- domain_events validation (BEFORE INSERT). Lock-free SELECTs only (no row locks ⇒
-- deadlock-free). Enforces: firm-level types carry a null client (N12 asymmetry is
-- deliberate); a populated client belongs to the firm; and (D2) populated ref ids
-- belong to the firm (+ client where the ref has one). _append_event is the SOLE
-- legitimate writer — a raw superuser INSERT bypasses this (same honesty boundary as
-- audit_log).
create function clara._tf_validate_domain_event() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_client_scoped boolean;
begin
  select client_scoped into v_client_scoped from clara.event_types where name = new.event_type;
  if v_client_scoped is null then
    raise exception 'unknown event_type %', new.event_type using errcode = 'CLR10';
  end if;
  if not v_client_scoped and new.client_id is not null then
    raise exception 'firm-level event % must not carry a client_id', new.event_type using errcode = 'CLR10';
  end if;
  if new.client_id is not null and not exists (
    select 1 from clara.clients c where c.id = new.client_id and c.firm_id = new.firm_id
  ) then
    raise exception 'event client_id % not in firm %', new.client_id, new.firm_id using errcode = 'CLR10';
  end if;
  -- D2: ref-validation against firm (+ client where the row is client-bound).
  if new.entry_id is not null and not exists (
    select 1 from clara.journal_entries je where je.id = new.entry_id and je.firm_id = new.firm_id
      and (new.client_id is null or je.client_id = new.client_id)
  ) then
    raise exception 'event entry_id % not in firm/client', new.entry_id using errcode = 'CLR10';
  end if;
  if new.document_id is not null and not exists (
    select 1 from clara.documents d where d.id = new.document_id and d.firm_id = new.firm_id
      and (new.client_id is null or d.client_id is not distinct from new.client_id)
  ) then
    raise exception 'event document_id % not in firm/client', new.document_id using errcode = 'CLR10';
  end if;
  if new.resolution_id is not null and not exists (
    select 1 from clara.client_resolutions r where r.id = new.resolution_id and r.firm_id = new.firm_id
      and (new.client_id is null or r.client_id = new.client_id)
  ) then
    raise exception 'event resolution_id % not in firm/client', new.resolution_id using errcode = 'CLR10';
  end if;
  return new;
end $$;

-- taxonomy_active guard: the pointer is repoint-only (the version FK already checks
-- the target exists). No DELETE, no second row, no other column change.
create function clara._tf_taxonomy_active_guard() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'the active-taxonomy pointer is never deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['version']) is distinct from (to_jsonb(old) - array['version']) then
    raise exception 'only the active taxonomy version may be repointed' using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- wake_intents stamping (C6, BEFORE INSERT). DERIVES firm_id/event_seq/event_type
-- FROM the event row — caller values are OVERWRITTEN, never trusted (so RLS never
-- evaluates a runtime-forged firm) — and VALIDATES (taxonomy_version, event_type,
-- decision) is a real trigger_taxonomy row.
create function clara._tf_stamp_wake_intent() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_seq bigint; v_type text;
begin
  select firm_id, seq, event_type into v_firm, v_seq, v_type
    from clara.domain_events where id = new.event_id;
  if v_firm is null then
    raise exception 'wake_intent references unknown event %', new.event_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  new.event_seq := v_seq;
  new.event_type := v_type;
  if not exists (
    select 1 from clara.trigger_taxonomy t
    where t.version = new.taxonomy_version and t.event_type = v_type and t.decision = new.decision
  ) then
    raise exception 'invalid (taxonomy_version, event_type, decision) triple' using errcode = 'CLR10';
  end if;
  return new;
end $$;

-- relay_dead_letters stamping (C6, BEFORE INSERT): same derive-from-the-event law.
create function clara._tf_stamp_dead_letter() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_seq bigint; v_type text;
begin
  select firm_id, seq, event_type into v_firm, v_seq, v_type
    from clara.domain_events where id = new.event_id;
  if v_firm is null then
    raise exception 'dead_letter references unknown event %', new.event_id using errcode = 'CLR10';
  end if;
  new.firm_id := v_firm;
  new.event_seq := v_seq;
  new.event_type := v_type;
  return new;
end $$;

-- relay_dead_letters update allowlist (C15): a consumer may advance only
-- status/attempt_count/resolved_at; identity/derivation columns are frozen; no DELETE.
create function clara._tf_dead_letter_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'relay_dead_letters rows are not deleted' using errcode = 'CLR08';
  end if;
  if (to_jsonb(new) - array['status','attempt_count','resolved_at'])
     is distinct from (to_jsonb(old) - array['status','attempt_count','resolved_at']) then
    raise exception 'only status/attempt_count/resolved_at may change on a dead letter' using errcode = 'CLR08';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Attach triggers.
-- ---------------------------------------------------------------------
-- event_types: append-only catalog (C13 — immutability is trigger-enforced, not just
-- grant-absence).
create trigger t_event_types_append_only before update or delete on clara.event_types
  for each row execute function clara._tf_append_only();
create trigger t_event_types_no_truncate before truncate on clara.event_types
  for each statement execute function clara._tf_no_truncate();

-- domain_events: validate on insert; append-only otherwise.
create trigger t_domain_events_validate before insert on clara.domain_events
  for each row execute function clara._tf_validate_domain_event();
create trigger t_domain_events_append_only before update or delete on clara.domain_events
  for each row execute function clara._tf_append_only();
create trigger t_domain_events_no_truncate before truncate on clara.domain_events
  for each statement execute function clara._tf_no_truncate();

-- taxonomy: versions + rows immutable; the pointer is repoint-only.
create trigger t_taxonomy_versions_append_only before update or delete on clara.taxonomy_versions
  for each row execute function clara._tf_append_only();
create trigger t_taxonomy_versions_no_truncate before truncate on clara.taxonomy_versions
  for each statement execute function clara._tf_no_truncate();
create trigger t_trigger_taxonomy_append_only before update or delete on clara.trigger_taxonomy
  for each row execute function clara._tf_append_only();
create trigger t_trigger_taxonomy_no_truncate before truncate on clara.trigger_taxonomy
  for each statement execute function clara._tf_no_truncate();
create trigger t_taxonomy_active_guard before update or delete on clara.taxonomy_active
  for each row execute function clara._tf_taxonomy_active_guard();
create trigger t_taxonomy_active_no_truncate before truncate on clara.taxonomy_active
  for each statement execute function clara._tf_no_truncate();

-- wake_intents: stamp-from-event on insert; Slice 3 blocks UPDATE/DELETE/TRUNCATE
-- outright (no consumer yet — Slice 4 swaps the guard for the consumption lifecycle).
create trigger t_wake_intents_stamp before insert on clara.wake_intents
  for each row execute function clara._tf_stamp_wake_intent();
create trigger t_wake_intents_append_only before update or delete on clara.wake_intents
  for each row execute function clara._tf_append_only();
create trigger t_wake_intents_no_truncate before truncate on clara.wake_intents
  for each statement execute function clara._tf_no_truncate();

-- relay_dead_letters: stamp-from-event on insert; allowlisted updates; no truncate.
create trigger t_dead_letters_stamp before insert on clara.relay_dead_letters
  for each row execute function clara._tf_stamp_dead_letter();
create trigger t_dead_letters_update before update or delete on clara.relay_dead_letters
  for each row execute function clara._tf_dead_letter_update();
create trigger t_dead_letters_no_truncate before truncate on clara.relay_dead_letters
  for each statement execute function clara._tf_no_truncate();

-- relay_checkpoints carries NO append-only guard: the checkpoint is a moving cursor
-- (monotonic UPDATE by the router). Grants + RLS confine writes to clara_runtime.

-- ---------------------------------------------------------------------
-- A.6 Supplemental indexes for the get_context_pack + trial_balance access paths
--     (X6 — the as-built review's live EXPLAIN showed the pack SEQ-SCANning
--     journal_entries / documents / client_resolutions and the trial-balance join
--     seq-scanning journal_lines on EVERY re-fetch; the agent re-fetches after every
--     write, so this is a hot path). Each index matches the exact filter + ORDER BY
--     shape §2.6 uses. They live in 0005 (not 0002/0003) because those migrations are
--     immutable (append-only law). Verified on a 43-client / 3.7k-entry seeded book:
--     all five flip to index/bitmap scans (e.g. the trial-balance join dropped from
--     ~3130 to ~390 shared buffers; recent_entries from a 370-buffer seq-scan+sort to
--     a 50-buffer ordered index scan).
create index ix_je_client_recent on clara.journal_entries (client_id, posting_date desc, created_at desc);            -- recent_entries
create index ix_je_client_approved on clara.journal_entries (client_id, approved_at desc) where approved_at is not null; -- approval_history (from base tables, C9)
create index ix_documents_client_recent on clara.documents (client_id, created_at desc);                             -- pack documents
create index ix_resolutions_client_live on clara.client_resolutions (client_id) where superseded_at is null;         -- live resolutions
create index ix_jl_client_account on clara.journal_lines (client_id, account_code);                                  -- trial-balance join

-- =====================================================================
-- B. RLS — forced everywhere; every new table gets the owner using(true)/with
--    check(true) policy (N9 — a miss BRICKS the definer writers/allocator: the INSERT
--    into a FORCE-RLS table under clara_fn_owner needs a with-check policy). App
--    policies are role-pinned to a single identity source (0002/0003 house rule).
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'event_types','firm_event_seq','domain_events','taxonomy_versions',
    'trigger_taxonomy','taxonomy_active','wake_intents','relay_checkpoints','relay_dead_letters'
  ] loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
  end loop;
end $$;

-- event_types + taxonomy tables are global reference data — readable by every app
-- lane (using(true); knowing the set of type names / routing rows leaks no firm data).
create policy p_event_types_read on clara.event_types for select
  to clara_authenticated, clara_agent_ro, clara_runtime using (true);
create policy p_taxonomy_versions_read on clara.taxonomy_versions for select
  to clara_authenticated, clara_agent_ro, clara_runtime using (true);
create policy p_trigger_taxonomy_read on clara.trigger_taxonomy for select
  to clara_authenticated, clara_agent_ro, clara_runtime using (true);
create policy p_taxonomy_active_read on clara.taxonomy_active for select
  to clara_authenticated, clara_agent_ro, clara_runtime using (true);

-- firm_event_seq: SELECT for clara_runtime ONLY (N11 work discovery — the router
-- finds firms with n > last_seq without scanning the log). No other app access.
create policy p_firm_event_seq_runtime on clara.firm_event_seq for select
  to clara_runtime using (true);

-- domain_events: firm-pinned reads per lane; runtime reads all firms (it routes them).
create policy p_domain_events_human on clara.domain_events for select
  to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_domain_events_agent on clara.domain_events for select
  to clara_agent_ro using (firm_id = clara.wake_firm());
create policy p_domain_events_runtime on clara.domain_events for select
  to clara_runtime using (true);

-- wake_intents: runtime writes/reads (stamping trigger derives the firm — RLS never
-- evaluates a forged one); human reads its own firm's intents; no agent access.
create policy p_wake_intents_runtime on clara.wake_intents for all
  to clara_runtime using (true) with check (true);
create policy p_wake_intents_human on clara.wake_intents for select
  to clara_authenticated using (firm_id = clara.jwt_firm());

-- relay_checkpoints: runtime only (a moving cursor). No human/agent access.
create policy p_relay_checkpoints_runtime on clara.relay_checkpoints for all
  to clara_runtime using (true) with check (true);

-- relay_dead_letters: runtime writes/reads; human reads its own firm's (visible, C15).
create policy p_relay_dead_letters_runtime on clara.relay_dead_letters for all
  to clara_runtime using (true) with check (true);
create policy p_relay_dead_letters_human on clara.relay_dead_letters for select
  to clara_authenticated using (firm_id = clara.jwt_firm());

-- Table-level grants (RLS still scopes every read). Reference data → all lanes read;
-- the log → all lanes read (firm-scoped by RLS); the relay → runtime writes.
grant select on clara.event_types, clara.taxonomy_versions, clara.trigger_taxonomy,
  clara.taxonomy_active to clara_authenticated, clara_agent_ro, clara_runtime;
grant select on clara.domain_events to clara_authenticated, clara_agent_ro, clara_runtime;
grant select on clara.firm_event_seq to clara_runtime;
grant select, insert on clara.wake_intents to clara_runtime;
grant select on clara.wake_intents to clara_authenticated;
grant select, insert, update on clara.relay_checkpoints to clara_runtime;
grant select, insert, update on clara.relay_dead_letters to clara_runtime;
grant select on clara.relay_dead_letters to clara_authenticated;

-- =====================================================================
-- C. SEED the structural catalog + the v1 routing taxonomy (idempotent-by-fresh:
--    these tables are created empty by THIS migration, which applies exactly once).
-- =====================================================================

-- 13 event types (C=client_scoped, F=firm-level). document.ingested + notification.
-- recorded carry a nullable client (an unassigned document.ingested is firm-level for
-- staleness — N12). books.baseline is the cutover marker (§2.10, C9).
insert into clara.event_types (name, client_scoped, description) values
  ('firm.created',          false, 'A firm was created'),
  ('client.created',        true,  'A client was created'),
  ('account.upserted',      true,  'A chart-of-accounts account was created or updated'),
  ('member.added',          false, 'A firm member was added'),
  ('member.role_changed',   false, 'A firm member''s role changed'),
  ('member.removed',        false, 'A firm member was removed'),
  ('document.ingested',     true,  'A document was ingested (client_id null when unassigned)'),
  ('client.resolved',       true,  'A client-attribution resolution was recorded'),
  ('entry.drafted',         true,  'A journal entry draft was created'),
  ('entry.approved',        true,  'A journal entry was approved'),
  ('entry.reversed',        true,  'A journal entry was reversed (linkage on the original)'),
  ('notification.recorded', true,  'A notification was recorded (client_id may be null)'),
  ('books.baseline',        false, 'Cutover marker: history before this seq lives in the base tables');

-- Taxonomy v1 (active). Slice-3 routing is event-type-only (C16 narrowing, ADR-016);
-- the predicate dimensions arrive with the slices that own that state. Human-noise
-- law: nothing wakes Clara on human-direct edits — everything is context_update
-- EXCEPT document.ingested (background_review — a new doc may need agent attention)
-- and notification.recorded (ignore — a terminal output, not a trigger). v1 covers
-- EVERY event type (full coverage — the activation invariant for a future flip).
insert into clara.taxonomy_versions (version, note) values
  (1, 'Slice 3 initial routing taxonomy (event-type-only; ADR-016)');
insert into clara.trigger_taxonomy (version, event_type, decision, note) values
  (1, 'document.ingested',     'background_review', 'a new document may need agent attention'),
  (1, 'notification.recorded', 'ignore',            'a terminal output, not a trigger'),
  (1, 'firm.created',          'context_update',    null),
  (1, 'client.created',        'context_update',    null),
  (1, 'account.upserted',      'context_update',    null),
  (1, 'member.added',          'context_update',    null),
  (1, 'member.role_changed',   'context_update',    null),
  (1, 'member.removed',        'context_update',    null),
  (1, 'client.resolved',       'context_update',    null),
  (1, 'entry.drafted',         'context_update',    null),
  (1, 'entry.approved',        'context_update',    null),
  (1, 'entry.reversed',        'context_update',    null),
  (1, 'books.baseline',        'context_update',    null);
insert into clara.taxonomy_active (singleton, version) values (true, 1);

-- =====================================================================
-- D. The emission helper + the freshness assertion (both ungranted — callable only
--    inside definer writers; the tail sweep also revokes any PUBLIC execute).
-- =====================================================================

-- _append_event — the SINGLE emission point. Allocates the firm's next seq (lazy
-- create-or-increment + row lock in ONE statement, P6), inserts the event, and fires
-- an EMPTY-payload nudge (N1/C7: the `clara_events` channel is database-global and
-- any role may LISTEN — empirically a wake-role session received cross-firm payloads;
-- the nudge must carry ZERO information; the relay treats any nudge as "poll
-- everything"). Called LAST in every writer txn ⇒ the counter is the txn-tail lock,
-- giving a consistent global lock order (no new deadlock cycles). Multi-event writers
-- call it repeatedly (re-locking the held counter row ⇒ consecutive seqs).
create function clara._append_event(
    p_firm uuid, p_type text, p_client uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_entry uuid, p_document uuid, p_resolution uuid, p_payload jsonb) returns bigint
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_seq bigint;
begin
  insert into clara.firm_event_seq (firm_id, n) values (p_firm, 1)
    on conflict (firm_id) do update set n = firm_event_seq.n + 1
    returning n into v_seq;
  insert into clara.domain_events (firm_id, seq, event_type, client_id, actor, on_behalf_of,
      via_wake_kind, entry_id, document_id, resolution_id, payload)
    values (p_firm, v_seq, p_type, p_client, p_actor, p_obo, p_wake_kind,
      p_entry, p_document, p_resolution, coalesce(p_payload, '{}'::jsonb));
  perform pg_notify('clara_events', '');   -- EMPTY payload (N1)
  return v_seq;
end $$;

-- assert_books_current — the freshness predicate (§2.5). RAISE CLR12 iff
--   (a) p_version is AHEAD of the firm's current max seq (a forged-high / future
--       token is never "current"), OR
--   (b) a RELEVANT event exists in (p_version, coalesce(p_below, +infinity)):
--       relevant = same client OR firm-level (client_id is null). Client-B events
--       never stale client-A (§0.1 ratified scope).
-- STABLE typed read (no writes); ungranted.
create function clara.assert_books_current(p_firm uuid, p_client uuid, p_version bigint,
    p_below bigint default null) returns void
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_max bigint;
begin
  select coalesce(max(seq), 0) into v_max from clara.domain_events where firm_id = p_firm;
  if p_version > v_max then
    raise exception 'stale context: token % is ahead of the books (head %)', p_version, v_max
      using errcode = 'CLR12';
  end if;
  if exists (
    select 1 from clara.domain_events e
    where e.firm_id = p_firm and e.seq > p_version
      and (p_below is null or e.seq < p_below)
      and (e.client_id = p_client or e.client_id is null)
  ) then
    raise exception 'stale context: the books moved past token %', p_version using errcode = 'CLR12';
  end if;
end $$;

-- =====================================================================
-- E. get_context_pack — a typed pack of what exists + the books_version token.
--    A `language sql` fn cannot RAISE; this plpgsql body's ONLY data read is exactly
--    ONE statement (the RETURN (SELECT ...)), so the single-snapshot guarantee holds
--    (the blank-purpose check reads no table). STABLE (C14a: the agent grant rule is
--    "STABLE typed reads only"), SECURITY INVOKER (RLS scopes to the caller's firm),
--    pinned search_path. Granted to clara_authenticated + clara_agent_ro (tail).
-- =====================================================================
create function clara.get_context_pack(p_client uuid, p_purpose text) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
begin
  if p_purpose is null or btrim(p_purpose) = '' then
    raise exception 'a context-pack purpose is required' using errcode = 'CLR10';
  end if;
  -- ONE statement. The driver row is the client (RLS-scoped to the caller's firm), so
  -- an invisible/foreign client yields zero rows ⇒ NULL pack (no existence oracle).
  -- books_version and every figure are read in the SAME snapshot ⇒ the token is
  -- exactly the edition of the numbers (§2.6). approval_history reads the BASE TABLES
  -- (C9: the log begins at the 0005 cutover; the base tables are authoritative).
  return (
    select jsonb_build_object(
      'pack_schema_version', 1,
      'purpose', p_purpose,
      'generated_at', now(),
      'books_version', (select coalesce(max(de.seq), 0)
                        from clara.domain_events de where de.firm_id = cl.firm_id),
      'client', jsonb_build_object('id', cl.id, 'name', cl.name, 'status', cl.status),
      'firm', (select jsonb_build_object('id', f.id, 'name', f.name,
                        'high_stakes_amount_cents', f.high_stakes_amount_cents)
               from clara.firms f where f.id = cl.firm_id),
      'coa', (select coalesce(jsonb_agg(jsonb_build_object(
                        'account_code', a.account_code, 'name', a.name,
                        'account_type', a.account_type, 'special_acc_type', a.special_acc_type,
                        'is_active', a.is_active) order by a.account_code), '[]'::jsonb)
              from clara.coa_accounts a where a.client_id = cl.id),
      'trial_balance', (select coalesce(jsonb_agg(to_jsonb(tb) order by tb.account_code), '[]'::jsonb)
                        from clara.trial_balance(cl.id) tb),
      'recent_entries', (select coalesce(jsonb_agg(jsonb_build_object(
                            'entry', to_jsonb(je),
                            'lines', (select coalesce(jsonb_agg(to_jsonb(jl) order by jl.line_no), '[]'::jsonb)
                                      from clara.journal_lines jl where jl.entry_id = je.id))
                            order by je.posting_date desc, je.created_at desc), '[]'::jsonb)
                         from (select * from clara.journal_entries
                               where client_id = cl.id
                               order by posting_date desc, created_at desc limit 50) je),
      'documents', (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb)
                    from (select * from clara.documents where client_id = cl.id
                          order by created_at desc limit 50) d),
      'resolutions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
                      from clara.client_resolutions r
                      where r.client_id = cl.id and r.superseded_at is null),
      'approval_history', (select coalesce(jsonb_agg(jsonb_build_object(
                              'entry_id', je.id, 'status', je.status, 'approved_at', je.approved_at,
                              'checker_actor', je.checker_actor, 'maker_actor', je.maker_actor,
                              'reversal_of', je.reversal_of, 'reversed_by', je.reversed_by)
                              order by je.approved_at desc), '[]'::jsonb)
                           from (select * from clara.journal_entries
                                 where client_id = cl.id and approved_at is not null
                                 order by approved_at desc limit 25) je)
    )
    from clara.clients cl
    where cl.id = p_client
  );
end $$;

-- =====================================================================
-- F. Retrofit every audited writer to emit its domain event(s) in the SAME txn
--    (uniform emission law, §0.3). Same-signature bodies via CREATE OR REPLACE (P2 —
--    preserves EXECUTE ACLs); the TWO signature changes (_draft_entry_core,
--    wake_draft_entry) are DROP+CREATE (P2 — a defaulted overload makes old-arity
--    calls ambiguous; atomic in this one migration txn — C18). Receipts UNCHANGED
--    (no books_version in any receipt — N4: the ONLY token source is get_context_pack).
-- =====================================================================

-- create_firm → firm.created (firm-level). Admission-token idempotency, no op_receipt
-- (a retry finds the token consumed ⇒ CLR04, so it cannot double-emit — C10c).
create or replace function clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  if not exists (select 1 from clara.users where id = v_actor) then
    raise exception 'unknown actor' using errcode = 'CLR04';
  end if;
  if exists (select 1 from clara.users where id = v_actor and is_agent) then
    raise exception 'the agent identity cannot own a firm' using errcode = 'CLR04';   -- HIGH 11
  end if;
  update clara.firm_admissions set consumed_at = now()
    where token = p_admission_token and consumed_at is null;
  if not found then raise exception 'invalid or consumed admission token' using errcode = 'CLR04'; end if;
  if exists (select 1 from clara.firm_memberships where user_id = v_actor and status = 'active') then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR10';
  end if;
  insert into clara.firms(name) values (p_name) returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role) values (v_firm, v_actor, 'owner');
  perform clara._audit(v_firm, v_actor, null, null, 'create_firm', null,
    jsonb_build_object('name', p_name, 'op_key', p_op_key));
  perform clara._append_event(v_firm, 'firm.created', null, v_actor, null, null, null, null, null, '{}'::jsonb);
  return jsonb_build_object('firm_id', v_firm);
end $$;

-- create_client → client.created.
create or replace function clara.create_client(p_name text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'create_client', p_op_key, clara._hash(jsonb_build_object('n', p_name)));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    insert into clara.clients(firm_id, name) values (c.firm, p_name) returning id into v_id;
  exception when unique_violation then
    raise exception 'a client with that name already exists' using errcode = 'CLR10';
  end;
  perform clara._audit(c.firm, c.actor, null, null, 'create_client', null, jsonb_build_object('name', p_name));
  perform clara._append_event(c.firm, 'client.created', v_id, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'create_client', p_op_key, jsonb_build_object('client_id', v_id));
end $$;

-- upsert_account → account.upserted.
create or replace function clara.upsert_account(p_client uuid, p_code text, p_name text, p_type text,
    p_special_acc_type text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_client_firm uuid; v_existing text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'upsert_account', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'code', p_code, 'n', p_name, 't', p_type, 's', p_special_acc_type)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_client_firm from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> c.firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  select account_type into v_existing from clara.coa_accounts where client_id = p_client and account_code = p_code;
  if v_existing is not null and v_existing <> p_type
     and exists (select 1 from clara.journal_lines where client_id = p_client and account_code = p_code) then
    raise exception 'cannot change the type of an account that has lines' using errcode = 'CLR10';
  end if;
  begin
    insert into clara.coa_accounts(client_id, account_code, name, account_type, special_acc_type)
    values (p_client, p_code, p_name, p_type, p_special_acc_type)
    on conflict (client_id, account_code)
      do update set name = excluded.name, account_type = excluded.account_type,
                    special_acc_type = excluded.special_acc_type, is_active = true;
  exception when unique_violation then
    raise exception 'a rounding account already exists for this client' using errcode = 'CLR10';
  end;
  perform clara._audit(c.firm, c.actor, null, null, 'upsert_account', null,
    jsonb_build_object('client', p_client, 'code', p_code));
  perform clara._append_event(c.firm, 'account.upserted', p_client, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'upsert_account', p_op_key, jsonb_build_object('client_id', p_client, 'account_code', p_code));
end $$;

-- add_member → member.added (firm-level).
create or replace function clara.add_member(p_firm uuid, p_user uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_firm is distinct from c.firm then raise exception 'not your firm' using errcode = 'CLR11'; end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'add_member', p_op_key,
    clara._hash(jsonb_build_object('u', p_user, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;                 -- serialize per-firm (v2 §F/F18)
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  if not exists (select 1 from clara.users where id = p_user) then
    raise exception 'unknown user' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.users where id = p_user and is_agent) then
    raise exception 'the agent identity cannot be a firm member' using errcode = 'CLR10';   -- HIGH 11
  end if;
  if exists (select 1 from clara.firm_memberships where user_id = p_user and status = 'active') then
    raise exception 'user already belongs to a firm' using errcode = 'CLR10';
  end if;
  insert into clara.firm_memberships(firm_id, user_id, role) values (c.firm, p_user, p_role) returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'add_member', null, jsonb_build_object('user', p_user, 'role', p_role));
  -- member.added takes the firms FOR UPDATE lock (above) AND the counter (last) — C4:
  -- the counter carries NO FK, so this ordering cannot form a KEY-SHARE deadlock cycle.
  perform clara._append_event(c.firm, 'member.added', null, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'add_member', p_op_key, jsonb_build_object('membership_id', v_id));
end $$;

-- set_member_role → member.role_changed (firm-level).
create or replace function clara.set_member_role(p_membership uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_member_role', p_op_key,
    clara._hash(jsonb_build_object('mem', p_membership, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  if m.status <> 'active' then raise exception 'membership is not active' using errcode = 'CLR11'; end if;
  update clara.firm_memberships set role = p_role where id = p_membership;  -- guard_last_owner backstops CLR09
  if clara.role_rank(p_role) < clara.role_rank('bookkeeper') then
    update clara.wake_credentials set revoked_at = statement_timestamp()
      where on_behalf_of = m.user_id and firm_id = c.firm and revoked_at is null;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'set_member_role', null, jsonb_build_object('membership', p_membership, 'role', p_role));
  perform clara._append_event(c.firm, 'member.role_changed', null, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'set_member_role', p_op_key, jsonb_build_object('membership_id', p_membership, 'role', p_role));
end $$;

-- remove_member → member.removed (firm-level).
create or replace function clara.remove_member(p_membership uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'remove_member', p_op_key, clara._hash(jsonb_build_object('mem', p_membership)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  if m.status <> 'active' then raise exception 'membership is not active' using errcode = 'CLR11'; end if;
  update clara.firm_memberships set status = 'removed', removed_at = now()
    where id = p_membership and status = 'active';                         -- guard_last_owner backstops CLR09
  update clara.wake_credentials set revoked_at = statement_timestamp()
    where on_behalf_of = m.user_id and firm_id = c.firm and revoked_at is null;
  perform clara._audit(c.firm, c.actor, null, null, 'remove_member', null, jsonb_build_object('membership', p_membership));
  perform clara._append_event(c.firm, 'member.removed', null, c.actor, null, null, null, null, null, '{}'::jsonb);
  return clara._finish_op(c.firm, 'remove_member', p_op_key, jsonb_build_object('membership_id', p_membership, 'status', 'removed'));
end $$;

-- _ingest_document_core → document.ingested (client nullable — an unassigned doc is a
-- firm-level event for staleness, N12). document_id links the new row (D2-validated).
create or replace function clara._ingest_document_core(p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_sha256 text, p_filename text, p_mime text, p_bytes bigint,
    p_storage_path text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'ingest_document', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'sha', p_sha256, 'fn', p_filename,
      'mt', p_mime, 'b', p_bytes, 'sp', p_storage_path)));
  if v_dedupe is not null then return v_dedupe; end if;

  if p_client is not null then
    select firm_id into v_client_firm from clara.clients where id = p_client;
    if v_client_firm is null or v_client_firm <> p_firm then
      raise exception 'client not in your firm' using errcode = 'CLR11';
    end if;
  end if;
  if exists (select 1 from clara.documents where firm_id = p_firm and sha256 = p_sha256) then
    raise exception 'document already ingested for this firm' using errcode = 'CLR10';
  end if;

  insert into clara.documents(firm_id, client_id, sha256, original_filename, mime_type, byte_size, storage_path, uploaded_by)
  values (p_firm, p_client, p_sha256, p_filename, p_mime, p_bytes, p_storage_path, p_actor)
  returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'ingest_document', null,
    jsonb_build_object('client', p_client, 'sha', p_sha256, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'document.ingested', p_client, p_actor, p_obo, p_wake_kind,
    null, v_id, null, '{}'::jsonb);
  return clara._finish_op(p_firm, 'ingest_document', p_op_key, jsonb_build_object('document_id', v_id));
end $$;

-- _record_client_resolution_core → client.resolved.
create or replace function clara._record_client_resolution_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_method text, p_client uuid, p_subject_kind text, p_subject uuid,
    p_confidence numeric, p_evidence jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'record_client_resolution', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'sk', p_subject_kind, 's', p_subject,
      'conf', p_confidence, 'm', p_method, 'e', p_evidence)));
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id into v_client_firm from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  if p_subject_kind not in ('document','chat_task','manual') then
    raise exception 'bad subject_kind' using errcode = 'CLR10';
  end if;

  insert into clara.client_resolutions(client_id, subject_kind, subject_id, confidence, method, evidence, resolved_by)
  values (p_client, p_subject_kind, p_subject, p_confidence, p_method, coalesce(p_evidence, '{}'::jsonb), p_actor)
  returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'record_client_resolution', null,
    jsonb_build_object('client', p_client, 'method', p_method, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'client.resolved', p_client, p_actor, p_obo, p_wake_kind,
    null, null, v_id, '{}'::jsonb);
  return clara._finish_op(p_firm, 'record_client_resolution', p_op_key, jsonb_build_object('resolution_id', v_id));
end $$;

-- _record_notification_core → notification.recorded (client nullable).
create or replace function clara._record_notification_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_client uuid, p_kind text, p_payload jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'record_notification', p_op_key,
    clara._hash(jsonb_build_object('k', p_kind, 'p', p_payload, 'c', p_client)));
  if v_dedupe is not null then return v_dedupe; end if;

  if p_client is not null then
    select firm_id into v_client_firm from clara.clients where id = p_client;
    if v_client_firm is null or v_client_firm <> p_firm then
      raise exception 'client not in your firm' using errcode = 'CLR11';
    end if;
  end if;

  insert into clara.notifications(firm_id, client_id, kind, payload, created_by)
  values (p_firm, p_client, p_kind, coalesce(p_payload, '{}'::jsonb), p_actor)
  returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'record_notification', null,
    jsonb_build_object('kind', p_kind, 'op_key', p_op_key));
  perform clara._append_event(p_firm, 'notification.recorded', p_client, p_actor, p_obo, p_wake_kind,
    null, null, null, '{}'::jsonb);
  return clara._finish_op(p_firm, 'record_notification', p_op_key, jsonb_build_object('notification_id', v_id));
end $$;

-- approve_entry → entry.approved (+ entry.reversed for the ORIGINAL when it links a
-- reversal mirror). C5 fix (pre-existing Slice-2 latent deadlock): lock the ORIGINAL
-- FOR UPDATE **before** the mirror's approve-write claims the
-- `uq_je_one_approved_reversal` slot — the same (original → slot) order reverse_entry
-- uses — and revalidate the already-reversed state under that lock. This breaks the
-- AB-BA cycle (mirror-holds-slot-wants-original vs reverse-holds-original-wants-slot).
create or replace function clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; e record; v_attest text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'approve_entry', p_op_key,
    clara._hash(jsonb_build_object('e', p_entry, 'rev', p_expected_revision, 'att', p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into e from clara.journal_entries where id = p_entry for update;
  if not found or e.firm_id <> c.firm then raise exception 'entry not in your firm' using errcode = 'CLR11'; end if;
  if e.status <> 'draft' then raise exception 'entry is not a draft' using errcode = 'CLR10'; end if;
  if e.revision_token <> p_expected_revision then raise exception 'stale revision token' using errcode = 'CLR06'; end if;
  if e.reversal_of is not null and exists (
    select 1 from clara.journal_entries r
    where r.reversal_of = e.reversal_of and r.status = 'approved' and r.id <> p_entry) then
    raise exception 'the original was already reversed by an approved reversal' using errcode = 'CLR10';
  end if;
  if clara.is_high_stakes(p_entry) and e.last_human_editor is not null and e.last_human_editor = c.actor then
    if clara.eligible_checker_count(c.firm) >= 2 then
      raise exception 'high-stakes entry needs a distinct checker' using errcode = 'CLR05';
    elsif p_attestation is null or btrim(p_attestation) = '' then
      raise exception 'solo high-stakes approval requires an attestation' using errcode = 'CLR05';
    else v_attest := p_attestation; end if;
  end if;
  -- C5: lock the original BEFORE the mirror update claims the reversal slot; revalidate.
  if e.reversal_of is not null then
    perform 1 from clara.journal_entries where id = e.reversal_of for update;
    if exists (select 1 from clara.journal_entries where id = e.reversal_of and reversed_by is not null) then
      raise exception 'the original was already reversed' using errcode = 'CLR10';
    end if;
  end if;
  update clara.journal_entries set status = 'approved', checker_actor = c.actor,
    approved_at = now(), self_approval_attestation = v_attest, updated_at = now() where id = p_entry;
  if e.reversal_of is not null then                                        -- linkage on approval (v2 §E/F14)
    update clara.journal_entries set reversed_by = p_entry,
      reversal_reason = coalesce(e.reversal_reason, 'reversal'), updated_at = now()
      where id = e.reversal_of and reversed_by is null;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'approve_entry', p_entry, jsonb_build_object('op_key', p_op_key));
  perform clara._append_event(c.firm, 'entry.approved', e.client_id, c.actor, null, null, p_entry, null, null, '{}'::jsonb);
  if e.reversal_of is not null then
    perform clara._append_event(c.firm, 'entry.reversed', e.client_id, c.actor, null, null, e.reversal_of, null, null, '{}'::jsonb);
  end if;
  return clara._finish_op(c.firm, 'approve_entry', p_op_key, jsonb_build_object('entry_id', p_entry, 'status', 'approved'));
end $$;

-- reverse_entry → entry.drafted (mirror) + on the auto-approve path also entry.approved
-- (mirror) + entry.reversed (original). It does NOT call the draft core (R1: reversal
-- corrections on an archived client stay possible). It already locks the original first.
create or replace function clara.reverse_entry(p_entry uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; o record; v_mirror uuid; v_status text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'reverse_entry', p_op_key,
    clara._hash(jsonb_build_object('e', p_entry, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into o from clara.journal_entries where id = p_entry for update;
  if not found or o.firm_id <> c.firm then raise exception 'entry not in your firm' using errcode = 'CLR11'; end if;
  if o.status <> 'approved' then raise exception 'only an approved entry can be reversed' using errcode = 'CLR10'; end if;
  if o.reversal_of is not null then raise exception 'cannot reverse a reversal' using errcode = 'CLR10'; end if;
  if o.reversed_by is not null then raise exception 'entry already reversed' using errcode = 'CLR10'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a reversal reason is required' using errcode = 'CLR10'; end if;

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, resolution_id,
      is_opening_balance, is_year_end, tax_affecting, maker_actor, last_human_editor, reversal_of, reversal_reason)
  values (o.client_id, 'draft', current_date, 'Reversal: ' || p_reason, 'reversal', o.resolution_id,
      o.is_opening_balance, o.is_year_end, o.tax_affecting, c.actor, c.actor, p_entry, p_reason)
  returning id into v_mirror;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
  select v_mirror, line_no, account_code, credit_cents, debit_cents, description
  from clara.journal_lines where entry_id = p_entry;
  perform clara._assert_balanced(v_mirror);

  if clara.is_high_stakes(v_mirror) then
    v_status := 'draft';                                                   -- needs a distinct approver
  else
    update clara.journal_entries set status = 'approved', checker_actor = c.actor,
      approved_at = now(), updated_at = now() where id = v_mirror;
    update clara.journal_entries set reversed_by = v_mirror, reversal_reason = p_reason, updated_at = now()
      where id = p_entry;
    v_status := 'approved';
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'reverse_entry', v_mirror, jsonb_build_object('original', p_entry, 'op_key', p_op_key));
  -- The mirror is always drafted; on auto-approve it is also approved AND the original
  -- is reversed — emit all three in causal order (consecutive seqs).
  perform clara._append_event(c.firm, 'entry.drafted', o.client_id, c.actor, null, null, v_mirror, null, null, '{}'::jsonb);
  if v_status = 'approved' then
    perform clara._append_event(c.firm, 'entry.approved', o.client_id, c.actor, null, null, v_mirror, null, null, '{}'::jsonb);
    perform clara._append_event(c.firm, 'entry.reversed', o.client_id, c.actor, null, null, p_entry, null, null, '{}'::jsonb);
  end if;
  return clara._finish_op(c.firm, 'reverse_entry', p_op_key, jsonb_build_object('reversal_id', v_mirror, 'status', v_status));
end $$;

-- ---------------------------------------------------------------------
-- The TWO signature changes (DROP+CREATE — P2). _draft_entry_core gains
-- p_books_version (ungranted, no ACL at stake); wake_draft_entry gains a trailing
-- defaulted p_books_version (granted — re-GRANT + explicit revoke-from-public below).
-- ---------------------------------------------------------------------
drop function clara.wake_draft_entry(uuid, uuid, date, text, jsonb, uuid, text, jsonb, text);
drop function clara._draft_entry_core(uuid, uuid, uuid, text, boolean, uuid, uuid, date, text, jsonb, uuid, text, jsonb, text);

-- _draft_entry_core (new): the entry.drafted emitter + the agent-lane freshness gate.
-- Order (§2.5): op_key → _reserve_op (p_books_version EXCLUDED from the request hash,
-- N3a) → REPLAY short-circuit (a committed op replays BEFORE the gate) → client-in-firm
-- + archived-block (R1, BOTH lanes) → [agent] fast-fail gate → existing guards → work
-- → _audit → _append_event (LAST) → [agent] C1 commit-time recheck.
create function clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_is_human boolean, p_client uuid, p_resolution uuid, p_posting_date date, p_memo text,
    p_lines jsonb, p_document uuid, p_sha256 text, p_flags jsonb, p_op_key text,
    p_books_version bigint)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_client_firm uuid; v_client_status text; v_origin text; v_entry uuid; v_token uuid;
  v_dr bigint; v_cr bigint; v_n int; v_residual bigint; v_round text;
  v_round_dr bigint := 0; v_round_cr bigint := 0; v_receipt jsonb; v_seq bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  -- N3a: p_books_version is EXCLUDED from the request hash — a freshness assertion is
  -- not part of the op's identity, so a CLR12 retry with a refreshed token is the SAME
  -- op (it replays), not a CLR10 arg-mismatch.
  v_dedupe := clara._reserve_op(p_firm, 'draft_entry', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'r', p_resolution, 'd', p_posting_date,
      'm', p_memo, 'l', p_lines, 'doc', p_document, 'sha', p_sha256, 'f', p_flags)));
  -- A committed op REPLAYS its receipt BEFORE the freshness gate (§2.5) — a prior
  -- success stands even if the books have since moved.
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id, status into v_client_firm, v_client_status from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  -- R1 (owner-ratified 2026-07-18) + C14b: an archived client is HARD-BLOCKED for BOTH
  -- lanes — no new postings. Corrections go through reverse_entry (never this core).
  if v_client_status = 'archived' then
    raise exception 'client is archived — no new postings (reverse existing entries instead)' using errcode = 'CLR10';
  end if;

  -- Agent-lane fast-fail freshness gate (§0.2). The AIRTIGHT check is the recheck below.
  if not p_is_human then
    perform clara.assert_books_current(p_firm, p_client, p_books_version, null);
  end if;

  perform clara.assert_client_resolved(p_client, p_resolution, p_document);

  if (p_document is null) <> (p_sha256 is null) then
    raise exception 'document and sha256 must be both set or both null' using errcode = 'CLR10';
  end if;
  if p_document is not null then perform clara.assert_provenance(p_document, p_sha256, p_client); end if;

  v_origin := case when p_document is not null then 'document'
                   when p_is_human then 'manual' else 'agent' end;
  if p_document is null and (p_memo is null or btrim(p_memo) = '') then
    raise exception 'a non-document entry requires a memo (its basis)' using errcode = 'CLR10';
  end if;

  begin
    select coalesce(sum((e.elem->>'debit_cents')::bigint), 0),
           coalesce(sum((e.elem->>'credit_cents')::bigint), 0), count(*)
      into v_dr, v_cr, v_n from jsonb_array_elements(p_lines) as e(elem);
  exception when others then
    raise exception 'malformed line amounts (cents must be integers)' using errcode = 'CLR10';
  end;
  if v_n < 2 then raise exception 'an entry needs at least two lines' using errcode = 'CLR10'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as e(elem)
    where not exists (select 1 from clara.coa_accounts a
      where a.client_id = p_client and a.account_code = (e.elem->>'account_code') and a.is_active)
  ) then raise exception 'line codes to a non-existent account' using errcode = 'CLR10'; end if;

  v_residual := abs(v_dr - v_cr);
  if v_residual > 5 then raise exception 'entry is unbalanced by %c', v_residual using errcode = 'CLR07'; end if;
  if v_residual between 1 and 5 then
    select account_code into v_round from clara.coa_accounts
      where client_id = p_client and special_acc_type = 'rounding' and is_active;
    if v_round is null then raise exception 'rounding_account_missing' using errcode = 'CLR10'; end if;
    if v_dr > v_cr then v_round_cr := v_residual; else v_round_dr := v_residual; end if;
  end if;

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      document_id, source_doc_sha256, resolution_id, is_opening_balance, is_year_end,
      tax_affecting, maker_actor, last_human_editor)
  values (p_client, 'draft', p_posting_date, p_memo, v_origin, p_document, p_sha256, p_resolution,
      false,
      coalesce((p_flags->>'is_year_end')::boolean, false),
      coalesce((p_flags->>'tax_affecting')::boolean, false),
      p_actor, case when p_is_human then p_actor end)
  returning id into v_entry;

  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
  select v_entry, e.idx, (e.elem->>'account_code'),
         coalesce((e.elem->>'debit_cents')::bigint, 0), coalesce((e.elem->>'credit_cents')::bigint, 0),
         (e.elem->>'description')
  from jsonb_array_elements(p_lines) with ordinality as e(elem, idx);

  if v_round is not null then
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, v_n + 1, v_round, v_round_dr, v_round_cr, 'auto rounding');
  end if;

  perform clara._assert_balanced(v_entry);          -- synchronous CLR07 to caller
  select revision_token into v_token from clara.journal_entries where id = v_entry;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'draft_entry', v_entry,
    jsonb_build_object('client', p_client, 'op_key', p_op_key));

  -- Emit LAST (counter is the txn-tail lock, §2.2). Exactly ONE event ⇒ the C1
  -- recheck's p_below = v_seq is correct (R2: a future gated MULTI-event writer must
  -- instead pass its FIRST allocated seq, else its own later event self-aborts).
  v_seq := clara._append_event(p_firm, 'entry.drafted', p_client, p_actor, p_obo, p_wake_kind,
    v_entry, p_document, p_resolution, '{}'::jsonb);

  -- C1 COMMIT-TIME RECHECK (agent lane): holding the counter, every seq < v_seq for
  -- this firm is committed AND visible to this READ COMMITTED statement (P1+P4) — a
  -- relevant event that landed between the fast-fail and allocation aborts here
  -- (counter reverts, no gap). The agent can never COMMIT a draft on stale context.
  if not p_is_human then
    perform clara.assert_books_current(p_firm, p_client, p_books_version, v_seq);
  end if;

  v_receipt := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token, 'status', 'draft');
  return clara._finish_op(p_firm, 'draft_entry', p_op_key, v_receipt);
end $$;

-- draft_entry (human): same signature (CREATE OR REPLACE); passes null books_version
-- to the core so the gate is skipped (human writers are unchanged, §0.2).
create or replace function clara.draft_entry(p_client uuid, p_resolution uuid, p_posting_date date, p_memo text,
    p_lines jsonb, p_document uuid default null, p_sha256 text default null,
    p_flags jsonb default '{}', p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._draft_entry_core(c.actor, c.firm, null, null, true, p_client, p_resolution, p_posting_date, p_memo, p_lines, p_document, p_sha256, p_flags, p_op_key, null);
end $$;

-- wake_draft_entry (new signature): trailing p_books_version (default null); CLR10 when
-- null (the 0004 required-but-defaulted pattern). The token is the structural gate on
-- the agent lane — Clara's OWN write stales her own pack (§2.5), so the runtime
-- re-fetches after every write.
create function clara.wake_draft_entry(p_client uuid, p_resolution uuid, p_posting_date date, p_memo text,
    p_lines jsonb, p_document uuid default null, p_sha256 text default null,
    p_flags jsonb default '{}', p_op_key text default null, p_books_version bigint default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_draft_entry');
  if p_books_version is null then
    raise exception 'wake_draft_entry requires a books_version token' using errcode = 'CLR10';
  end if;
  return clara._draft_entry_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind, false,
    p_client, p_resolution, p_posting_date, p_memo, p_lines, p_document, p_sha256, p_flags, p_op_key, p_books_version);
end $$;

-- =====================================================================
-- G. Cutover (C9/§2.10) — after the fn replacement, still as clara_fn_owner: one
--    firm-level books.baseline event per EXISTING firm ("history before this seq
--    lives in the base tables, not the log"). Bootstraps each firm's counter, stales
--    every pre-0005 pack once (correct), and marks where log-rebuildable projection
--    formally begins. On a FRESH DB there are no firms yet (the loop is a no-op);
--    the seed's create_firm then emits firm.created as each firm's seq 1.
-- =====================================================================
do $$
declare v_firm uuid;
begin
  for v_firm in select id from clara.firms loop
    perform clara._append_event(v_firm, 'books.baseline', null, null, null, null, null, null, null, '{}'::jsonb);
  end loop;
end $$;

-- =====================================================================
-- H. PUBLIC-execute sweep + re-asserted grants (N13). The sweep revokes PUBLIC only;
--    0004's named grants (preserved across CREATE OR REPLACE by P2) survive it — so
--    only the NEW granted fn (get_context_pack) and the DROP+CREATE'd wake_draft_entry
--    need (re-)granting. Every ungranted internal (_append_event, assert_books_current,
--    _draft_entry_core, the trigger/stamping fns) is left reachable ONLY by the owner
--    /definer context.
-- =====================================================================
revoke execute on all functions in schema clara from public;

-- get_context_pack: a STABLE typed read for both the human and agent lanes.
grant execute on function clara.get_context_pack(uuid, text) to clara_authenticated, clara_agent_ro;

-- wake_draft_entry was DROP+CREATE'd (new arity) — its 0004 ACL is gone. Re-grant to
-- the interactive wake lane; explicit revoke-from-public (belt over the sweep above).
revoke execute on function
  clara.wake_draft_entry(uuid, uuid, date, text, jsonb, uuid, text, jsonb, text, bigint) from public;
grant execute on function
  clara.wake_draft_entry(uuid, uuid, date, text, jsonb, uuid, text, jsonb, text, bigint)
  to clara_wake_interactive;

reset role;
