-- 0183_activity_sweep_attribution — #728 (2026-09-11 signed-in hosted walk, findings 1 and 5):
-- the Activity feed stops being buried by unattributed sweep heartbeats, and a new read tells
-- the evidence pickers which documents already back a posted entry.
--
-- WHAT THE OWNER SAW ON THE LIVE FIRM (#728 item 1). `/activity` showed "An autodraft sweep run
-- completed" every five minutes -- kind Documents, Actor "--", Client "No client" -- 20+ of the
-- first 25 rows. `clara.reconcile_sweep_runs` (0011:2709-2769) finalises a `clara.sweep_runs` row
-- and appends `sweep.run_completed` (0011:2763-2764) EVERY TIME a run's window closes, whether or
-- not it drafted anything -- the payload carries `run_id` and `expected_count` only, and the event
-- itself is firm-level (`actor`/`on_behalf_of`/`client_id` all null: 0011:3886's own
-- `client_scoped=false` registration). `clara.list_activity`'s 0181 kind ladder has no arm for
-- `sweep.%`, so it fell through to the broadest bucket, `'documents'` -- exactly the row C77.3 says
-- must not exist without an actor, and on a firm running the sweep every five minutes it drowns
-- real postings.
--
-- THE FIX, PER ARM. (a) a sweep receipt that changed NOTHING (`sweep_runs.drafted_count = 0` --
-- the common case: most five-minute windows draft zero new entries) is EXCLUDED from the union
-- entirely, in BOTH `clara.list_activity` and `clara.get_activity_event` (a deep link to an
-- excluded heartbeat answers the SAME CLR11 the door already uses for any other denied/absent
-- id -- no oracle). (b) a sweep receipt that DID draft something is KEPT, but reclassified
-- `kind = 'agent'` (it is an agent act on the books, not a document act) -- the closed kind
-- roster (`documents|journal|close|report|agent|work`, 0181:257) is NOT widened. `actor` stays
-- NULL -- that is the truth, the sweep has no human or agent-uuid actor of its own -- and the web
-- lane (apps/web, this ticket's own C1) recognises `kind='agent' and event_type=
-- 'sweep.run_completed'` off columns THIS door already outputs, so no new output column is added
-- and no ordinal any reader is pinned to moves.
--
-- WHY A NEW SECURITY DEFINER HELPER RATHER THAN A BARE JOIN TO `clara.sweep_runs`, MEASURED ON
-- THE LIVE CATALOG (not assumed from 0181's own reasoning about its OTHER two sources). Every
-- relation `clara.list_activity`/`clara.get_activity_event` read before this file is ALREADY
-- granted to `clara_authenticated` (0181's own header states this is WHY they are SECURITY
-- INVOKER) -- but `clara.sweep_runs` (0011:674-696) carries NO grant to `clara_authenticated` at
-- all (only `clara_fn_owner`, the table's own definer-function owner, has any privilege on it;
-- confirmed against `information_schema.role_table_grants` on this chain's own database). An
-- INVOKER body running as the caller would hit a raw `permission denied for table sweep_runs`,
-- exactly the class of gap 0181's header names for `clara._human_ctx` (an invoker body cannot
-- reach a helper -- or a table -- the calling role holds no grant on). Two ways to close that gap
-- were weighed: (1) widen `clara.sweep_runs`' own grant to `clara_authenticated` -- rejected,
-- because it is a wall change on a table the runtime's autodraft lane also writes, with no floor
-- of its own, and it would hand every bookkeeper direct SELECT on token/budget bookkeeping this
-- door has no reason to expose wholesale; (2) a NEW, NARROW `security definer` helper that reads
-- exactly the one fact this door needs (a sweep run's `drafted_count`, by the EVENT it was
-- reported on) and returns nothing else -- taken. `clara._sweep_run_drafted_count(uuid)` is
-- SELF-SCOPED to `clara.jwt_firm()` INSIDE its own body (never a caller-supplied firm argument),
-- so calling it directly (it must carry a `clara_authenticated` grant for an INVOKER caller to
-- reach it at all, and PostgREST exposes any granted function as its own RPC endpoint regardless
-- of an underscore prefix -- 0181's own header names this exact class of caveat for
-- `_human_ctx`) can never answer for a firm other than the caller's own, no matter what uuid is
-- passed. This is the "expose what you need through the view's own contract" alternative the
-- work order names, chosen over widening `clara.firm_timeline_visible` itself: the view's
-- payload-free projection (0174's own header, "the raw spine's payload is unredacted call
-- payload... the view already drops it") is untouched, and the one fact this door borrows is a
-- run's own effect count, never the payload verbatim.
--
-- THE CORRELATION IS EXACT, NOT A TIME WINDOW. The work order's own fallback ("join sweep_runs by
-- firm + the event's occurred_at/finalized_at window ONLY if it is unambiguous") is not needed:
-- `clara._append_event(sr.firm_id,'sweep.run_completed',...,jsonb_build_object('run_id',sr.id,
-- 'expected_count',sr.expected_count))` (0011:2763-2764) carries the run's OWN id in the payload,
-- so `clara._sweep_run_drafted_count` joins `clara.domain_events` (by the event's own `id`, which
-- `clara.firm_timeline_visible.event_id` already names) to `clara.sweep_runs` (by
-- `payload->>'run_id'`) -- a direct reference, never a heuristic near a boundary tie.
--
-- WHY `clara.domain_events` IS READABLE INSIDE THIS HELPER WITHOUT WIDENING ANYTHING. It already
-- carries a `clara_authenticated` grant with a firm-only RLS predicate (0005:380-381,
-- `p_domain_events_human`, `firm_id = clara.jwt_firm()`) -- the helper does not need to borrow
-- privilege for that half; it needs to borrow privilege ONLY for `clara.sweep_runs`, and being
-- `security definer` it borrows exactly that and nothing more (it does not touch `clara.
-- sweep_run_items`, `clara.autodraft_attempts` or any other sweep-lane table).
--
-- ARM (B): `clara.list_spoken_for_documents` -- #728 item 5. The evidence pickers
-- (`journal-composer.tsx`'s native select, `attach-evidence-dialog.tsx`'s late-attach select)
-- offer documents that already back a posted entry; the conflict is caught on submit today
-- (`attach_entry_evidence`'s CLR13 `source_already_posted`, `admit_journal_work`'s own check) and
-- that typed refusal STAYS the law -- this is a NEW, ADVISORY read the picker consults ALONGSIDE
-- the document list, never a replacement for the door's own check. TWO LANES, the SAME pair
-- migration 0182's `clara._document_posting_entry` already asks per-document (its own header,
-- "WHICH POSTED ENTRY ALREADY STANDS ON THIS DOCUMENT"): a LIVE `clara.entry_evidence_links`
-- binding (`via='evidence_link'`, `released_at is null`) and the document-coding lane's own
-- `clara.journal_entries.document_id` (`via='coding'`, approved, not reversed). This door answers
-- for a WHOLE CLIENT's documents at once (a set), where `_document_posting_entry` answers for one
-- document at a time (a priority pick) -- different shapes for different callers, same two facts.
--
-- ADDITIVE FOR THE SCHEMA (one new table object: none: this file creates functions only), ADDITIVE
-- FOR THE GRANT SURFACE (one new SELECT-nothing helper plus one new read door, both
-- `clara_authenticated`-only), and a RECUT for the TWO 0181 door bodies at their SAME signatures
-- (SAME 18-column projection, SAME SECURITY INVOKER posture, SAME grants -- `create or replace`
-- preserves an unchanged signature's ACL, and this file restates both anyway, belt-and-suspenders,
-- the same house habit every prior recut in this estate follows). Migrations 0184 (the #630
-- cancel-ordering lane of the same refresh train) is owned by another lane and this file names
-- none of its objects.
--
-- FRONTEND HOME (apps/web): the actor-line, focus and evidence-picker fixes this ticket also
-- carries are entirely web-side and touch no door this file did not already name; see the ticket
-- and the session's own work order for the full web-side map.

set local statement_timeout = '2min';
set local lock_timeout = '5s';

-- ==============================================================================================
-- 0. PRESTATE.
-- ==============================================================================================
do $pre$
declare v_missing text; v_sha text;
begin
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.firm_timeline_visible'), ('clara.agent_receipts_visible'),
                 ('clara.operation_receipts'), ('clara.accounting_work'),
                 ('clara.journal_entries'), ('clara.clients'), ('clara.event_types'),
                 ('clara.domain_events'), ('clara.sweep_runs'), ('clara.entry_evidence_links')) t(n)
   where to_regclass(t.n) is null;
  if v_missing is not null then
    raise exception 'activity_sweep_attribution prestate: required relation(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_sub()'), ('clara.jwt_firm()'), ('clara.actor_role_rank()'),
                 ('clara.role_rank(text)'), ('clara._human_ctx(integer)'),
                 ('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'),
                 ('clara.get_activity_event(text,text)')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'activity_sweep_attribution prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- PARTIAL BIRTH -- nothing this file creates may already exist.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.proname in ('_sweep_run_drafted_count', 'list_spoken_for_documents')
  ) then
    raise exception 'activity_sweep_attribution prestate: a new function name already resolves'
      using errcode = 'CLR10';
  end if;

  -- clara.sweep_runs carries NO grant to clara_authenticated -- the measured fact this file's
  -- header reasons the whole helper-vs-bare-join design from. A later migration widening this
  -- would make the helper redundant, not wrong, so this is stated rather than enforced as a wall.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'clara' and table_name = 'sweep_runs' and grantee = 'clara_authenticated'
  ) then
    raise notice 'activity_sweep_attribution prestate: clara.sweep_runs now carries a clara_authenticated grant it did not have when this file was written -- the _sweep_run_drafted_count helper is still correct, merely no longer the only way to read this fact.';
  end if;

  -- THE TWO LIVE BODIES THIS FILE RECUTS, pinned by prosrc sha-256 at the 0181 frontier. A
  -- drifted body is REFUSED rather than silently overwritten -- the recuts below are full-body
  -- rewrites of these exact texts plus this file's sweep arm, and a different text may carry an
  -- arm this file would delete without ever reading it.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_sha <> 'e8c3b7b8d4df2dd35058d6d178d125cda4267d033c78bc0302271e376c9d3cf9' then
    raise exception 'activity_sweep_attribution prestate: clara.list_activity has DRIFTED from the pinned 0181 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_sha <> 'a5585bdfd23af24e1a4a693242cb959b818913a7cde687a443f0682423601b32' then
    raise exception 'activity_sweep_attribution prestate: clara.get_activity_event has DRIFTED from the pinned 0181 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice 'activity_sweep_attribution prestate: clean -- both 0181 bodies at their pinned text, clara.sweep_runs still ungranted to clara_authenticated, no new function name resolves yet.';
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. clara._sweep_run_drafted_count -- the ONE fact list_activity/get_activity_event borrow from
--    clara.sweep_runs. SECURITY DEFINER (see this file's header for why): clara.sweep_runs
--    carries NO grant at all, and the two doors above are SECURITY INVOKER, so the fact has to be
--    borrowed through a definer helper that the INVOKER bodies may execute -- which means the
--    helper itself is clara_authenticated-granted and therefore DIRECTLY REACHABLE over PostgREST.
--
--    THREE WALLS, ALL INSIDE THE BODY, because a reachable helper is a door whatever its name
--    says (cross-model review, Codex, 2026-09-11 -- the first two of these were missing):
--      (a) THE FEED'S OWN FLOOR, restated from scratch via clara._human_ctx(role_rank(
--          'bookkeeper')). Same-firm event ids are readable by ANY member under the firm-only
--          clara.domain_events read policy (0005:379-385), so a floorless helper would let a
--          VIEWER -- refused CLR04 by clara.list_activity itself -- read every sweep's
--          drafted_count one event id at a time. The floor is reachable here and NOT in the two
--          doors above for one measured reason: clara._human_ctx is executable by clara_fn_owner
--          ONLY (0004:299, catalog-confirmed), so a SECURITY INVOKER body running as
--          clara_authenticated cannot call it -- 0174's own note on clara.list_firm_timeline
--          records the same finding -- while this DEFINER body, owned by clara_fn_owner, can.
--      (b) THE FIRM BOUND ON THE RUN ITSELF (`sr.firm_id = de.firm_id`), not only on the event.
--          `payload` is a free jsonb column no constraint validates: an event of THIS firm whose
--          run_id names ANOTHER firm's run is reachable by a bug, a replayed payload or a restore,
--          and a lookup keyed on run_id alone would answer this firm's feed with that firm's count.
--      (c) THE EVENT TYPE (`de.event_type = 'sweep.run_completed'`). The helper's whole contract is
--          "the drafted_count of the run THIS SWEEP RECEIPT reports on"; an unrelated event type
--          that happens to carry a `run_id` key is not a sweep receipt and must resolve nothing.
--    Plus the uuid-SHAPE guard on the payload text: without it the `::uuid` cast raises an untyped
--    22P02 from inside a per-row predicate, which would take the ENTIRE feed down for the firm
--    rather than hiding the one heartbeat nobody can verify.
--
--    Returns NULL when the event does not exist, is not this caller's firm's, is not a sweep
--    receipt, or has no resolvable run -- every one of those collapses to "no measured effect",
--    which is exactly the safe default the caller below wants (an unverifiable run is treated the
--    same as a zero-effect one, never shown by default).
-- ==============================================================================================
create function clara._sweep_run_drafted_count(p_event_id uuid) returns int
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_drafted int;
begin
  -- (a) THE FLOOR, FIRST and unconditionally: a caller below bookkeeper learns nothing at all --
  -- not the count, not whether the id names an event, not whether it is a sweep.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select sr.drafted_count into v_drafted
    from clara.domain_events de
    join clara.sweep_runs sr
      on sr.id = nullif(de.payload ->> 'run_id', '')::uuid
     -- (b) the run must belong to the SAME firm as the event that reports it.
     and sr.firm_id = de.firm_id
   where de.id = p_event_id
     and de.firm_id = c.firm
     -- (c) …and the event must be a sweep receipt.
     and de.event_type = 'sweep.run_completed'
     -- …and its run_id must at least be uuid-SHAPED before the cast above ever runs. `and` is
     -- not a short-circuit operator in SQL, so this is spelled as a separate predicate on the
     -- OUTER relation (evaluated against de alone) rather than beside the cast in the join
     -- condition; the planner may reorder the two, but a row failing this one can never reach
     -- the join's cast because the join has no other row to pair it with.
     and de.payload ->> 'run_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  return v_drafted;
end $$;
revoke all on function clara._sweep_run_drafted_count(uuid) from public;
grant execute on function clara._sweep_run_drafted_count(uuid) to clara_authenticated;
comment on function clara._sweep_run_drafted_count(uuid) is
  '#728. The drafted_count of the clara.sweep_runs row a sweep.run_completed domain event (by its '
  'OWN id) reports on, or null if the event is absent, is not a sweep receipt, has no '
  'uuid-shaped/resolvable run, names a run of another firm, or is not this session''s own firm''s. '
  'Carries clara.list_activity''s OWN bookkeeper floor (clara._human_ctx) because it is '
  'clara_authenticated-granted and therefore PostgREST-reachable directly despite the leading '
  'underscore -- a floorless helper would be a side channel round that floor. Exists only because '
  'clara.sweep_runs itself carries no clara_authenticated grant and the two doors that borrow this '
  'fact are SECURITY INVOKER. See 0183''s section 1 header for all three walls.';

-- ==============================================================================================
-- 2. clara.list_activity -- RECUT. Full 0181 body (sha e8c3b7b8..., pinned above); the ONLY
--    changes are marked #728 below. SAME signature, SAME 18-column projection, SAME SECURITY
--    INVOKER posture, SAME floor.
-- ==============================================================================================
create or replace function clara.list_activity(
  p_cursor text default null,
  p_limit  int  default 50,
  p_client uuid default null,
  p_kinds  text[] default null,
  p_since  timestamptz default null,
  p_until  timestamptz default null
) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare
  c record;
  v_limit int;
  v_cursor_ts timestamptz := null;
  v_cursor_id text := null;
  v_decoded text;
  v_pipe int;
  v_kind text;
  v_all jsonb;
  v_total int;
  v_truncated boolean;
  v_page jsonb;
  v_last jsonb;
  v_next_cursor text;
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  if p_kinds is not null then
    foreach v_kind in array p_kinds loop
      if v_kind not in ('documents', 'journal', 'close', 'report', 'agent', 'work') then
        raise exception 'unknown activity kind %', v_kind using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_kind', 'kind', v_kind)::text;
      end if;
    end loop;
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_pipe := position('|' in v_decoded);
      if v_pipe < 2 or v_pipe = length(v_decoded) then
        raise exception 'malformed cursor shape';
      end if;
      v_cursor_ts := substr(v_decoded, 1, v_pipe - 1)::timestamptz;
      v_cursor_id := substr(v_decoded, v_pipe + 1);
    exception when others then
      raise exception 'malformed activity cursor' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'invalid_cursor')::text;
    end;
  end if;

  with
  ev_base as (
    select
      v.event_id::text                                                    as id,
      'event'::text                                                       as source,
      v.event_type                                                        as event_type,
      v.event_description                                                 as description,
      v.client_id                                                         as client_id,
      v.actor                                                             as actor,
      v.on_behalf_of                                                      as on_behalf_of,
      v.via_wake_kind                                                     as via_wake_kind,
      v.created_at                                                        as occurred_at,
      v.object_kind                                                       as object_kind,
      v.object_id                                                         as object_id,
      orr.work_id                                                         as work_id,
      orr.id::text                                                        as receipt_id,
      case when v.object_kind = 'document' then v.object_id end           as document_id,
      case when v.object_kind = 'entry' then je.reversal_of end           as original_entry_id,
      case when v.object_kind = 'entry' then je.reversed_by end           as replacement_entry_id,
      case
        when v.object_kind <> 'entry' then null
        when je.status = 'approved' and je.reversed_by is not null then 'reversed'
        when je.status = 'approved' then 'approved'
        when je.status = 'withdrawn' and je.withdrawal_reason = 'superseded-by-correction' then 'superseded'
        when je.status = 'withdrawn' then 'withdrawn'
        else je.status
      end                                                                 as status,
      case
        -- #728 (C77.3): a sweep heartbeat is an AGENT ACT on the books, never a document act --
        -- checked FIRST, ahead of the untouched 0181 ladder below, because 'sweep.run_completed'
        -- matches none of those prefixes anyway and this keeps the one new rule visually apart
        -- from the three it does not change.
        when v.event_type = 'sweep.run_completed' then 'agent'
        when v.event_type like 'entry.%' then 'journal'
        when v.event_type like 'document.%' then 'documents'
        when v.event_type like 'close.%' then 'close'
        else 'documents'
      end                                                                 as kind
    from clara.firm_timeline_visible v
    left join clara.journal_entries je
      on v.object_kind = 'entry' and je.id = v.object_id and je.firm_id = c.firm
    left join clara.operation_receipts orr
      on v.object_kind = 'entry' and orr.firm_id = c.firm and orr.outcome = 'committed'
     -- Text comparison, not a uuid cast of the jsonb text expression: `ix_operation_receipts_entry`
     -- (0178:454-455) is built ON THE TEXT EXPRESSION `(effects->>'entry_id')`, and casting that
     -- expression to uuid before comparing defeats the index (the planner cannot match an
     -- expression index against a different expression on the same column, even a semantically
     -- equivalent one) -- cast the OTHER side instead, which is already a plain uuid column.
     and nullif(orr.effects->>'entry_id', '') = v.object_id::text
    -- #728: EXCLUDE a sweep heartbeat that changed nothing. `clara._sweep_run_drafted_count`
    -- (this file's own helper) resolves the run this event reports on and answers its
    -- drafted_count, or null when the run cannot be resolved -- which is treated the SAME as a
    -- zero-effect run (an unverifiable heartbeat is not evidence of one), never shown by default.
    -- Every non-sweep row is untouched: the left side of the `or` is true for all of them, so this
    -- predicate can only ever remove sweep.run_completed rows, nothing else.
   where v.event_type <> 'sweep.run_completed' or clara._sweep_run_drafted_count(v.event_id) > 0
  ),
  ev as (
    select * from ev_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  ar_base as (
    select
      (r.receipt_kind || ':' || r.receipt_id)                             as id,
      'agent_receipt'::text                                               as source,
      null::text                                                          as event_type,
      null::text                                                          as description,
      r.client_id                                                         as client_id,
      r.acting_actor                                                      as actor,
      r.on_behalf_of                                                      as on_behalf_of,
      r.via_wake_kind                                                     as via_wake_kind,
      r.occurred_at                                                       as occurred_at,
      null::text                                                          as object_kind,
      null::uuid                                                          as object_id,
      null::uuid                                                          as work_id,
      (r.receipt_kind || ':' || r.receipt_id)                             as receipt_id,
      null::uuid                                                          as document_id,
      null::uuid                                                          as original_entry_id,
      null::uuid                                                          as replacement_entry_id,
      null::text                                                          as status,
      case when r.receipt_kind = 'report_agent' then 'report' else 'agent' end as kind
    from clara.agent_receipts_visible r
  ),
  ar as (
    select * from ar_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  orx_base as (
    select
      orr.id::text                                                       as id,
      'operation_receipt'::text                                          as source,
      w.purpose                                                          as event_type,
      null::text                                                         as description,
      orr.client_id                                                      as client_id,
      orr.acting_actor                                                   as actor,
      orr.on_behalf_of                                                   as on_behalf_of,
      orr.via_wake_kind                                                  as via_wake_kind,
      orr.created_at                                                     as occurred_at,
      'entry'::text                                                      as object_kind,
      nullif(orr.effects->>'entry_id', '')::uuid                         as object_id,
      orr.work_id                                                        as work_id,
      orr.id::text                                                       as receipt_id,
      null::uuid                                                         as document_id,
      je2.reversal_of                                                    as original_entry_id,
      je2.reversed_by                                                    as replacement_entry_id,
      case
        when je2.status = 'approved' and je2.reversed_by is not null then 'reversed'
        when je2.status = 'approved' then 'approved'
        when je2.status = 'withdrawn' and je2.withdrawal_reason = 'superseded-by-correction' then 'superseded'
        when je2.status = 'withdrawn' then 'withdrawn'
        else je2.status
      end                                                                as status,
      'work'::text                                                       as kind
    from clara.operation_receipts orr
    left join clara.accounting_work w on w.id = orr.work_id and w.firm_id = c.firm
    left join clara.journal_entries je2
      -- Same index-preserving text comparison as the ev_base join above.
      on je2.id::text = nullif(orr.effects->>'entry_id', '') and je2.firm_id = c.firm
    where orr.firm_id = c.firm and orr.outcome = 'committed'
  ),
  orx as (
    select * from orx_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  unioned as (
    select * from ev union all select * from ar union all select * from orx
  )
  -- `jsonb_agg(to_jsonb(u.*))` with NO `order by` INSIDE the aggregate call is not guaranteed to
  -- respect the subquery's own `order by` -- an aggregate over a subquery may see its input rows
  -- in whatever order the planner chooses to feed them (a parallel worker, a different join
  -- strategy on a future replan), so the page and its `next_cursor` must never be minted from an
  -- order the aggregate itself did not pin. `order by u.occurred_at desc, u.id desc` INSIDE
  -- `jsonb_agg` makes that order part of the aggregate's own contract, not an incidental property
  -- borrowed from the subquery underneath it.
  select coalesce(jsonb_agg(to_jsonb(u.*) order by u.occurred_at desc, u.id desc), '[]'::jsonb) into v_all
    from (
      select * from unioned
       order by occurred_at desc, id desc
       limit v_limit + 1
    ) u;

  v_total := jsonb_array_length(v_all);
  v_truncated := v_total > v_limit;

  if v_truncated then
    -- Same guarantee on the truncation slice: `ord` (the ordinality `jsonb_array_elements` mints
    -- over the ALREADY-ordered `v_all`) is projected back OUT to the aggregate's own `order by`
    -- rather than being dropped after the `where` filters on it -- the prior shape selected only
    -- `elem`, so the page these rows became had no aggregate-level order guarantee, only the
    -- current statement's plan happening to preserve one.
    select jsonb_agg(x.elem order by x.ord) into v_page
      from (
        select elem, ord from jsonb_array_elements(v_all) with ordinality as t(elem, ord)
         where ord <= v_limit
      ) x;
    v_last := v_page -> (v_limit - 1);
    v_next_cursor := encode(
      convert_to((v_last->>'occurred_at') || '|' || (v_last->>'id'), 'UTF8'), 'base64');
  else
    v_page := v_all;
    v_next_cursor := null;
  end if;

  return jsonb_build_object('rows', v_page, 'next_cursor', v_next_cursor, 'truncated', v_truncated);
end $$;
comment on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) is
  '#632 B5, recut #728. The firm activity feed: a keyset-paged union of clara.firm_timeline_visible '
  '(domain events), clara.agent_receipts_visible (agent act receipts) and '
  'clara.operation_receipts (#623 committed operation receipts), newest first over '
  '(occurred_at desc, id desc). SECURITY INVOKER over three already-clara_authenticated-granted '
  'sources; refuses CLR04 below bookkeeper before running. p_kinds is the closed set '
  '{documents,journal,close,report,agent,work}, refused CLR10 invalid_kind otherwise. p_limit '
  'clamps 1..100. p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a '
  'malformed one refuses CLR10 invalid_cursor. #728: a sweep.run_completed event with no drafted '
  'effect is excluded entirely; one that drafted something is kind=agent (never documents), actor '
  'stays null. See this migration''s and 0181''s headers for the full rationale.';

-- ==============================================================================================
-- 3. clara.get_activity_event -- RECUT. Full 0181 body (sha a5585bdf..., pinned above); the SAME
--    #728 sweep rule applied to the 'event' source branch, so a deep link to an excluded
--    heartbeat answers the SAME CLR11 no-oracle refusal this door already uses.
-- ==============================================================================================
create or replace function clara.get_activity_event(p_source text, p_id text) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare
  c record;
  v_row jsonb;
  v_kind text;
  v_rid text;
  v_colon int;
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  if p_source is null or p_id is null or btrim(p_id) = '' then
    raise exception 'source and id are required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'activity_source_or_id_missing')::text;
  end if;

  if p_source = 'event' then
    select jsonb_build_object(
        'id', v.event_id::text, 'source', 'event', 'event_type', v.event_type,
        'description', v.event_description, 'client_id', v.client_id, 'actor', v.actor,
        'on_behalf_of', v.on_behalf_of, 'via_wake_kind', v.via_wake_kind, 'occurred_at', v.created_at,
        'object_kind', v.object_kind, 'object_id', v.object_id,
        'work_id', orr.work_id, 'receipt_id', orr.id::text,
        'document_id', case when v.object_kind = 'document' then v.object_id end,
        'original_entry_id', case when v.object_kind = 'entry' then je.reversal_of end,
        'replacement_entry_id', case when v.object_kind = 'entry' then je.reversed_by end,
        'status', case
          when v.object_kind <> 'entry' then null
          when je.status = 'approved' and je.reversed_by is not null then 'reversed'
          when je.status = 'approved' then 'approved'
          when je.status = 'withdrawn' and je.withdrawal_reason = 'superseded-by-correction' then 'superseded'
          when je.status = 'withdrawn' then 'withdrawn'
          else je.status
        end,
        'kind', case
          -- #728: same rule as list_activity's ev_base -- see that function's own comment.
          when v.event_type = 'sweep.run_completed' then 'agent'
          when v.event_type like 'entry.%' then 'journal'
          when v.event_type like 'document.%' then 'documents'
          when v.event_type like 'close.%' then 'close'
          else 'documents'
        end,
        'client_name', cl.name
      ) into v_row
      from clara.firm_timeline_visible v
      left join clara.journal_entries je
        on v.object_kind = 'entry' and je.id = v.object_id and je.firm_id = c.firm
      left join clara.operation_receipts orr
        on v.object_kind = 'entry' and orr.firm_id = c.firm and orr.outcome = 'committed'
       -- Same index-preserving text comparison as list_activity's ev_base join.
       and nullif(orr.effects->>'entry_id', '') = v.object_id::text
      left join clara.clients cl on cl.id = v.client_id and cl.firm_id = c.firm
     where v.event_id::text = p_id
       -- #728: the SAME exclusion list_activity applies -- a deep link to a zero-effect sweep
       -- heartbeat finds no row here, falls through to v_row is null below, and answers the
       -- SAME CLR11 activity_event_not_found every other denied/absent id already gets (no
       -- oracle: an excluded heartbeat must not read differently from one that never existed).
       and (v.event_type <> 'sweep.run_completed' or clara._sweep_run_drafted_count(v.event_id) > 0);

  elsif p_source = 'agent_receipt' then
    v_colon := position(':' in p_id);
    if v_colon < 2 or v_colon = length(p_id) then
      raise exception 'activity event not found' using errcode = 'CLR11',
        detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
    end if;
    v_kind := substr(p_id, 1, v_colon - 1);
    v_rid := substr(p_id, v_colon + 1);
    select jsonb_build_object(
        'id', (r.receipt_kind || ':' || r.receipt_id), 'source', 'agent_receipt',
        'event_type', null, 'description', null, 'client_id', r.client_id,
        'actor', r.acting_actor, 'on_behalf_of', r.on_behalf_of, 'via_wake_kind', r.via_wake_kind,
        'occurred_at', r.occurred_at, 'object_kind', null, 'object_id', null,
        'work_id', null, 'receipt_id', (r.receipt_kind || ':' || r.receipt_id),
        'document_id', null, 'original_entry_id', null, 'replacement_entry_id', null,
        'status', null,
        'kind', case when r.receipt_kind = 'report_agent' then 'report' else 'agent' end,
        'receipt_kind', r.receipt_kind, 'client_name', cl.name
      ) into v_row
      from clara.agent_receipts_visible r
      left join clara.clients cl on cl.id = r.client_id and cl.firm_id = c.firm
     where r.receipt_kind = v_kind and r.receipt_id = v_rid;

  elsif p_source = 'operation_receipt' then
    select jsonb_build_object(
        'id', orr.id::text, 'source', 'operation_receipt', 'event_type', w.purpose,
        'description', null, 'client_id', orr.client_id, 'actor', orr.acting_actor,
        'on_behalf_of', orr.on_behalf_of, 'via_wake_kind', orr.via_wake_kind,
        'occurred_at', orr.created_at, 'object_kind', 'entry',
        'object_id', nullif(orr.effects->>'entry_id', '')::uuid,
        'work_id', orr.work_id, 'receipt_id', orr.id::text, 'document_id', null,
        'original_entry_id', je2.reversal_of, 'replacement_entry_id', je2.reversed_by,
        'status', case
          when je2.status = 'approved' and je2.reversed_by is not null then 'reversed'
          when je2.status = 'approved' then 'approved'
          when je2.status = 'withdrawn' and je2.withdrawal_reason = 'superseded-by-correction' then 'superseded'
          when je2.status = 'withdrawn' then 'withdrawn'
          else je2.status
        end,
        'kind', 'work',
        'purpose', w.purpose, 'basis_origin', w.basis_origin, 'initiator', w.initiator,
        'client_name', cl.name
      ) into v_row
      from clara.operation_receipts orr
      left join clara.accounting_work w on w.id = orr.work_id and w.firm_id = c.firm
      left join clara.journal_entries je2
        -- Same index-preserving text comparison as list_activity's orx_base join.
        on je2.id::text = nullif(orr.effects->>'entry_id', '') and je2.firm_id = c.firm
      left join clara.clients cl on cl.id = orr.client_id and cl.firm_id = c.firm
     where orr.id::text = p_id and orr.firm_id = c.firm and orr.outcome = 'committed';

  else
    -- Folded into the SAME shared refusal below rather than raised here with its own distinct
    -- 'activity_source_unknown' reason -- this function's own comment already claims "an unknown
    -- source... refuse the SAME CLR11 activity_event_not_found", and a caller-visible SECOND
    -- reason token for the identical no-oracle situation would make that claim false. Leaving
    -- `v_row` at its declared NULL lets the common check right below raise the one shared refusal.
    v_row := null;
  end if;

  if v_row is null then
    raise exception 'activity event not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
  end if;
  return v_row;
end $$;
comment on function clara.get_activity_event(text, text) is
  '#632 B5, recut #728. The detail record for one clara.list_activity row, addressed by (source, '
  'id) -- see that function''s own comment for the shapes. Another firm''s row, an unknown source, '
  'a malformed agent_receipt pair, a genuinely absent id, or an EXCLUDED zero-effect sweep '
  'heartbeat (#728) all refuse the SAME CLR11 activity_event_not_found (no oracle). p_id is TEXT '
  '-- see this function''s header comment for why.';

-- ==============================================================================================
-- 4. clara.list_spoken_for_documents -- #728 item 5. The evidence pickers' advisory read: which
--    of the documents THIS CLIENT'S PICKER CAN OFFER already back a LIVE posted entry, WHOSE entry
--    it is, and through which lane. Bookkeeper+, firm+client floored, no-oracle CLR11 on a
--    cross-firm or absent client. Read-only; the door-side refusal (attach_entry_evidence's CLR13
--    source_already_posted, admit_journal_work's own check) is unchanged and stays the law -- this
--    read is advisory only (see this file's header, arm B).
--
--    THE CLAIM IS FIRM-WIDE, AND SO IS THIS READ (cross-model review, Codex, 2026-09-11: the first
--    cut asked a CLIENT-scoped question against a firm-wide invariant). `uq_document_filing_active`
--    is `(document_id, client_id) where retired_at is null` (0007:93), so ONE document may be
--    actively filed to TWO clients of a firm at once; `uq_entry_evidence_links_document` (0182:345)
--    carries no client column at all, and `clara._document_posting_entry` (0182:579-590) scopes its
--    own lookup to the FIRM for exactly that reason -- its header records the same finding from
--    #634's review round. A client-scoped read here would call a document FREE for client B while
--    client A's entry already stands on it, and the person would learn otherwise only from the
--    door's refusal on submit -- which is the whole defect this item exists to close.
--
--    THE CANDIDATE SET IS THE PICKER'S OWN, which is what keeps a firm-wide claim scan bounded and
--    the answer relevant: a claim is reported only when the document it names is an ACTIVE FILING
--    of p_client (`clara.document_filings`, `retired_at is null` -- the SAME relation and predicate
--    `listClientEvidenceDocuments` builds the option list from, apps/web/lib/work/evidence.ts). A
--    document nobody offers this client is not this client's business, spoken for or not.
--
--    ONE ROW PER DOCUMENT, ranked the way clara._document_posting_entry ranks: a LIVE evidence link
--    beats a coding-lane binding. #718 records that the coding lane can still post on a document
--    this lane has already bound, so a double claim is a state that exists and the read answers it
--    deterministically (a picker option carries one reason, not two) rather than assuming it away.
--
--    `client_name` IS JOINED IN rather than left to the caller: naming the claimant is the whole
--    point of the firm-wide scope -- "already backs a posted entry" is unactionable if the person
--    cannot see WHOSE entry -- and clara.clients is firm-scoped and already readable by this
--    caller (the same fact clara.get_activity_event returns as its own `client_name`), so this is
--    a round trip saved, never a disclosure widened.
-- ==============================================================================================
create function clara.list_spoken_for_documents(p_client uuid)
returns table(document_id uuid, entry_id uuid, client_id uuid, client_name text, via text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    -- NO EXISTENCE ORACLE: a client of another firm reads identically to a uuid naming nothing.
    raise exception 'client not found in your firm' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'client_not_found')::text;
  end if;

  return query
  select distinct on (s.doc) s.doc, s.ent, s.cli, cl.name, s.lane
    from (
      -- Arm 1: a LIVE clara.entry_evidence_links binding (0182), ANY client of the firm.
      -- `released_at is null` is the SAME predicate `uq_entry_evidence_links_document` enforces
      -- (0182:345-346) -- a reversed entry's released binding must not show as "already used",
      -- because the correction is free to cite it.
      select l.document_id as doc, l.entry_id as ent, l.client_id as cli,
             'evidence_link'::text as lane, 0 as rank
        from clara.entry_evidence_links l
       where l.firm_id = c.firm
         and l.released_at is null
         and exists (select 1 from clara.document_filings f
                      where f.document_id = l.document_id and f.client_id = p_client
                        and f.firm_id = c.firm and f.retired_at is null)
      union all
      -- Arm 2: the document-coding lane's own binding -- approved, not reversed, ANY client of the
      -- firm. The SAME pair migration 0182's clara._document_posting_entry asks per-document (its
      -- own header names this exact predicate for the exact same reason: LAW 6 leaves a reversed
      -- entry's status 'approved', so "not reversed" cannot be read off status alone).
      select je.document_id, je.id, je.client_id, 'coding'::text, 1
        from clara.journal_entries je
       where je.firm_id = c.firm
         and je.document_id is not null
         and je.status = 'approved'
         and je.reversed_by is null
         and exists (select 1 from clara.document_filings f
                      where f.document_id = je.document_id and f.client_id = p_client
                        and f.firm_id = c.firm and f.retired_at is null)
    ) s
    -- An INNER join: a claimant whose client row this firm cannot read is not a claim this firm
    -- may be told about. Every row above is already firm-bound, so this drops nothing in practice
    -- and is a belt on the one column that leaves the firm's own relations.
    join clara.clients cl on cl.id = s.cli and cl.firm_id = c.firm
   order by s.doc, s.rank;
end $$;
revoke all on function clara.list_spoken_for_documents(uuid) from public;
grant execute on function clara.list_spoken_for_documents(uuid) to clara_authenticated;
comment on function clara.list_spoken_for_documents(uuid) is
  '#728. Documents ACTIVELY FILED to p_client that already back a LIVE posted entry of ANY client '
  'of the caller''s firm: a live clara.entry_evidence_links binding (via=evidence_link, '
  'released_at is null) union an approved, not-reversed journal_entries.document_id binding '
  '(via=coding), one row per document with the live link winning -- the same two facts and the '
  'same precedence migration 0182''s clara._document_posting_entry applies per document, answered '
  'here for a whole picker at once. client_id/client_name name the CLAIMANT, which may be a '
  'sibling client the document is also filed to (uq_document_filing_active is per (document, '
  'client); the evidence invariant is firm-wide). Bookkeeper+ (_human_ctx), no-oracle CLR11 '
  'client_not_found. Advisory only: the picker uses this to disable an option, but '
  'attach_entry_evidence/admit_journal_work stay the actual law and their own typed conflict '
  'refusal is unchanged by this door''s existence.';

-- ==============================================================================================
-- 5. GRANTS -- restated for the two recut doors (create or replace preserves an unchanged
--    signature's ACL on its own; this is belt-and-suspenders, the same house habit every prior
--    recut in this estate follows).
-- ==============================================================================================
revoke all on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) from public;
revoke all on function clara.get_activity_event(text, text) from public;

grant execute on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) to clara_authenticated;
grant execute on function clara.get_activity_event(text, text) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 6. TAIL POSTCHECK.
-- ==============================================================================================
do $tail$
declare v_n int; v_mode boolean; v_kind_count int; v_body text;
begin
  if to_regprocedure('clara._sweep_run_drafted_count(uuid)') is null then
    raise exception 'activity_sweep_attribution tail: clara._sweep_run_drafted_count is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.list_spoken_for_documents(uuid)') is null then
    raise exception 'activity_sweep_attribution tail: clara.list_spoken_for_documents is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is null then
    raise exception 'activity_sweep_attribution tail: clara.list_activity is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.get_activity_event(text,text)') is null then
    raise exception 'activity_sweep_attribution tail: clara.get_activity_event is absent' using errcode = 'CLR10';
  end if;

  -- Security postures: list_activity/get_activity_event stay INVOKER (unmoved from 0181); the two
  -- new functions are DEFINER (they read a relation their caller has no grant on / restate the
  -- floor from scratch).
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'activity_sweep_attribution tail: list_activity is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'activity_sweep_attribution tail: get_activity_event is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara._sweep_run_drafted_count(uuid)'::regprocedure;
  if v_mode is distinct from true then
    raise exception 'activity_sweep_attribution tail: _sweep_run_drafted_count is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.list_spoken_for_documents(uuid)'::regprocedure;
  if v_mode is distinct from true then
    raise exception 'activity_sweep_attribution tail: list_spoken_for_documents is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;

  -- PUBLIC holds no EXECUTE on any of the four functions this file touches.
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'clara'
     and routine_name in ('list_activity', 'get_activity_event', '_sweep_run_drafted_count',
                           'list_spoken_for_documents')
     and grantee = 'PUBLIC';
  if v_n <> 0 then
    raise exception 'activity_sweep_attribution tail: PUBLIC holds an EXECUTE grant on one of this file''s functions'
      using errcode = 'CLR10';
  end if;

  -- clara_authenticated holds EXECUTE on all four, and on nothing else new (this file grants no
  -- other role anything).
  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'clara' and grantee = 'clara_authenticated'
     and routine_name in ('list_activity', 'get_activity_event', '_sweep_run_drafted_count',
                           'list_spoken_for_documents');
  if v_n <> 4 then
    raise exception 'activity_sweep_attribution tail: expected exactly 4 clara_authenticated grants across this file''s functions, found %', v_n
      using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'clara' and routine_name = 'list_spoken_for_documents'
       and grantee in ('clara_agent_ro', 'clara_runtime', 'clara_wake_interactive', 'clara_wake_filing')
  ) then
    raise exception 'activity_sweep_attribution tail: list_spoken_for_documents must not be reachable by any agent/wake/runtime role'
      using errcode = 'CLR10';
  end if;

  -- The closed kind roster is UNCHANGED (still 6 members) -- this file relabels a fall-through,
  -- it does not widen the vocabulary. Read straight from the installed body text rather than
  -- asserted -- the SAME raw prosrc column the prestate sha-pin above reads, not a wrapped
  -- definition-with-signature form this check has no use for.
  select p.prosrc into v_body from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  v_kind_count := length(v_body) - length(replace(v_body, 'unknown activity kind', ''));
  if v_kind_count <> length('unknown activity kind') then
    raise exception 'activity_sweep_attribution tail: the kind-validation ladder no longer reads exactly once -- re-derive against the live body'
      using errcode = 'CLR10';
  end if;

  raise notice 'activity_sweep_attribution tail: OK -- clara.list_activity/get_activity_event still SECURITY INVOKER, PUBLIC-revoked, clara_authenticated-granted, and now exclude a zero-effect sweep.run_completed row (relabelling a kept one to kind=agent, actor untouched); clara._sweep_run_drafted_count is the one SECURITY DEFINER helper this needed (self-scoped to clara.jwt_firm(), clara.sweep_runs itself still ungranted to clara_authenticated); clara.list_spoken_for_documents is a new bookkeeper+ SECURITY DEFINER read, clara_authenticated-only, reachable by no agent/wake/runtime role, unioning a live entry_evidence_links binding with an approved not-reversed document-coding binding.';
end $tail$;
