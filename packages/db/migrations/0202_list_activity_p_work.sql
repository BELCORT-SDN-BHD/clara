-- 0202_list_activity_p_work — #770: THE ACTIVITY FEED'S DOOR GAINS A WORK FILTER, AND LOSES ITS
-- SIX-ARGUMENT SIGNATURE IN THE SAME BREATH.
-- =====================================================================================
-- Spec of record: issue #770 and the Agent Brief in its triage comment. Domain words: CONTEXT.md
-- — "Accounting work", "Activity feed". The deferral this file ends is recorded in
-- docs/plan/active/refresh-wave-2026-09-14/HANDOFF.md (#641 row) and restated, in its own words,
-- in the header of apps/web/components/work/work-activity-view.tsx.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_activity` gains a seventh parameter,
-- `p_work uuid default null`, applied INSIDE each union arm's own `where`, so the Work detail's
-- Activity tab reads that Work's history from the database instead of reading the whole client
-- feed and hiding the other rows in the browser.
--
-- =====================================================================================
-- WHY THIS IS A DROP AND A CREATE, NOT A `create or replace`.
--
-- `create or replace function` cannot ADD a parameter. A naive recut would therefore have
-- installed a SEVENTH-argument body BESIDE the six-argument one, which would still resolve and
-- still be reachable: `activity-feed.test.mjs`'s af.22 already calls that a defect in its own
-- words — "an overload that still resolves is an overload a later caller can reach" — and
-- PostgREST would have been left with two candidates for one name.
--
-- So the six-argument signature is DROPPED and the seven-argument one CREATED. That is safe here
-- and nowhere near routine: nothing in the estate DEPENDS on this function (no view, no default,
-- no index expression, no trigger), it is a READ door with no writers behind it, and §0 below
-- measures that dependency emptiness rather than assuming it.
--
-- AND A DROP TAKES FIVE THINGS WITH IT THAT A REPLACE WOULD HAVE KEPT. 0184's own recut section
-- states the assumption that dies here, verbatim: "Grants are NOT re-issued: `create or replace`
-- preserves them." It does; a DROP does not. So this file re-issues, explicitly and in one place:
--
--   1. `revoke all ... from public`
--   2. `grant execute ... to clara_authenticated`
--   3. `comment on function ...`
--   4. `security invoker`            (the CREATE's own declaration)
--   5. `set search_path = clara, pg_temp`  and  `set plan_cache_mode = force_custom_plan`
--
-- §T re-reads ALL FIVE from the catalog after the fact — owner, prosecdef, proconfig, the literal
-- proacl and obj_description — because this file's whole hazard is a property silently lost in a
-- drop, and a property is not re-issued because a migration says it was.
--
-- =====================================================================================
-- IT IS THE THIRD RECUT OF THIS BODY, AND THE PIN MOVES WITH IT.
--
-- 0181 wrote it; #728's 0183 recut it and sha-pinned 0181's text; #630's 0184 recut 0183's and
-- sha-pinned that. 0184's body is the one installed today, so §0 re-derives against THAT text and
-- refuses on drift (`DRIFTED`) rather than silently overwriting a body it never read — the same
-- discipline, for the same reason, a third time.
--
-- THE BODY BELOW IS 0184's, BYTE-FOR-BYTE, PLUS THE PARAMETER AND THREE PREDICATES:
--
--   1. `p_work uuid default null` at the END of the parameter list, so every existing positional
--      caller keeps its meaning and an omitted p_work reproduces today's behaviour exactly.
--   2. `and (p_work is null or work_id = p_work)` inside the `ev` arm's own `where`.
--   3. `where p_work is null and ...` on the `ar` arm — the whole arm is skipped, because
--      ar_base projects `null::uuid as work_id` unconditionally and can contribute nothing.
--   4. `and (p_work is null or work_id = p_work)` inside the `orx` arm's own `where`.
--
-- EACH ARM AND NOT THE UNION, and this is the point of the ticket rather than a detail of it:
-- every arm applies its OWN `order by occurred_at desc, id desc` and `limit v_limit + 1` BEFORE
-- the union, so a p_work test after the union would have selected the client's newest rows and
-- then thrown most of them away — the reported browser-side bug, moved into the database.
--
-- WHAT DOES NOT CHANGE: p_client, p_kinds, p_since, p_until, the cursor contract, the page
-- envelope, the kind ladder, the kept-sweep exclusion, the bookkeeper floor, the 18-column
-- projection. `clara.get_activity_event` is NOT touched — 0184's body stands.
--
-- A p_work naming another firm's Work (or no Work at all) answers an EMPTY PAGE: every arm is
-- already fenced to the session firm, so a foreign id simply matches nothing. It is not an error
-- and it is not an existence signal — the two cases are indistinguishable, which is the same
-- no-oracle posture `clara.get_activity_event` takes for an absent id.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME FOUR AS BEFORE.
--
-- clara.list_activity                                       (human read door)
--   CLR04 'no authenticated actor' / 'actor has no active membership' / 'insufficient role'
--   CLR10 detail.reason='invalid_kind'     — a kind outside the closed six
--   CLR10 detail.reason='invalid_cursor'   — a malformed p_cursor
--
-- p_work adds NO new refusal: a uuid parameter is shape-checked by PostgreSQL itself before the
-- body runs, and an unmatched one is an empty page by construction.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
do $w770_pre$
declare n text; v_src text; v_n int; v_missing text;
begin
  -- 0.1 · the prerequisites the recut body calls, in exact regprocedure form.
  foreach n in array array[
    'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)',
    'clara._sweep_events_with_effect()',
    'clara.jwt_sub()',
    'clara.jwt_firm()',
    'clara.actor_role_rank()',
    'clara.role_rank(text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#770 prestate: prerequisite absent: % (migrations 0181/0183/0184 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the three relations the three arms read.
  foreach n in array array[
    'clara.firm_timeline_visible', 'clara.agent_receipts_visible', 'clara.operation_receipts',
    'clara.domain_events', 'clara.journal_entries', 'clara.accounting_work'
  ] loop
    if to_regclass(n) is null then
      raise exception '#770 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.3 · EXACTLY ONE body of this name today, and NO seven-argument one already. The second
  -- half is this file's own idempotence guard: a re-run against a database that already carries
  -- the recut must refuse loudly, not drop a door somebody is calling.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_activity';
  if v_n <> 1 then
    raise exception '#770 prestate: clara.list_activity has % bodies (expected exactly 1) -- an overload is already installed', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)') is not null then
    raise exception '#770 prestate: a seven-argument clara.list_activity already exists' using errcode='CLR10';
  end if;

  -- 0.4 · NOTHING DEPENDS ON THE SIGNATURE THIS FILE DROPS. A `drop function` without CASCADE
  -- refuses on a dependency, so this is belt-and-braces — but it is measured here so the refusal,
  -- if it ever comes, arrives as this file's own sentence rather than as a raw 2BP01.
  select count(*)::int into v_n from pg_depend d
   where d.refobjid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure
     and d.refclassid = 'pg_proc'::regclass
     and d.deptype <> 'i'
     and d.classid <> 'pg_namespace'::regclass
     and not (d.classid = 'pg_proc'::regclass and d.objid = d.refobjid);
  if v_n > 0 then
    raise exception '#770 prestate: % catalog object(s) depend on clara.list_activity''s six-argument signature -- the drop below would refuse', v_n
      using errcode='CLR10';
  end if;

  -- 0.5 · THE LIVE BODY IS 0184's, pinned by prosrc sha-256 -- the same discipline 0183 applied to
  -- 0181's text and 0184 applied to 0183's, for the same reason: §R below is a FULL-BODY rewrite
  -- of this exact text plus one parameter and three marked predicates, and a drifted body may
  -- carry an arm this file would delete without ever having read it. A drift is REFUSED, never
  -- silently overwritten.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_src is distinct from '6d50a27034b441f970ef38faf1e2d911c86dac023aff58582ecdfcc2ea879f5c' then
    raise exception '#770 prestate: clara.list_activity has DRIFTED from the pinned 0184 body (sha %) -- re-derive section R against the live body before applying', v_src
      using errcode='CLR10';
  end if;

  -- 0.6 · the arms this file carries over unchanged, named one by one against the live text, so a
  -- reader of the failure knows WHICH property the sha was standing for.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  v_missing := '';
  if position('v_kept_sweeps uuid[]' in v_src) = 0 then v_missing := v_missing || ' kept-sweep-array'; end if;
  if position('v.event_id = any(v_kept_sweeps)' in v_src) = 0 then v_missing := v_missing || ' sweep-exclusion'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_src) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 50), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('invalid_cursor' in v_src) = 0 then v_missing := v_missing || ' cursor-refusal'; end if;
  if v_missing <> '' then
    raise exception '#770 prestate: the live clara.list_activity is not 0184''s body -- missing arm(s):%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.7 · the posture the drop is about to destroy, measured so §T's re-read is a COMPARISON and
  -- not a hopeful assertion.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_src is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#770 prestate: clara.list_activity does not carry the posture this file must re-issue after the drop; got {%}', v_src
      using errcode='CLR10';
  end if;

  raise notice '#770 prestate: clean -- clara.list_activity exists exactly once at its six-argument signature, carries 0184''s body byte-for-byte (sha-pinned) with every arm this file keeps, has no seven-argument overload, no catalog object depends on the signature about to be dropped, and its posture is owner clara_fn_owner / SECURITY INVOKER / search_path + plan_cache_mode pinned / EXECUTE to clara_authenticated only.';
end
$w770_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §R THE RECUT. The six-argument signature is retired, and 0184's body is re-created at seven
-- arguments with the Work filter inside each arm.
--
-- The DROP and the CREATE are in ONE transaction (the runner gives each migration its own), so
-- no session ever observes this name absent or ambiguous.
-- =====================================================================================
drop function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz);

create function clara.list_activity(
  p_cursor text default null,
  p_limit  int  default 50,
  p_client uuid default null,
  p_kinds  text[] default null,
  p_since  timestamptz default null,
  p_until  timestamptz default null,
  -- #770: THE SEVENTH PARAMETER, LAST so every existing positional caller keeps its meaning and
  -- an omitted p_work reproduces the six-argument door exactly -- same rows, same order, same
  -- cursors, for every other caller in the estate.
  p_work   uuid default null
) returns jsonb
  language plpgsql stable security invoker
  -- RE-ISSUED, NOT INHERITED. A DROP took both of these with it; a `create or replace` would have
  -- preserved them. See this file's header for the full list of five.
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
as $$
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
  -- #728 (N1): the KEPT sweep receipts of this firm, read ONCE per call -- see the predicate
  -- inside ev_base below, and section 1's header for why this is not a per-row call.
  v_kept_sweeps uuid[];
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

  -- #728 (N1): ONE invocation of the definer set helper per feed read, materialised into a local
  -- array the union's predicate can test with a plain `= any(...)`. Placed AFTER the floor checks
  -- (a refused caller never pays for it) and BEFORE the union, so no plan the planner might choose
  -- can turn it back into a per-row call.
  --
  -- …and NOT paid at all when no sweep row could survive this read's own filters (delta review of
  -- the fix round, finding [1]: the read was unconditional). A sweep receipt's `kind` is
  -- unconditionally 'agent' -- ev_base's FIRST case arm below, ahead of the 0181 ladder -- so a
  -- p_kinds list that omits 'agent' can never return one, and an EMPTY kept set then excludes
  -- every sweep row in ev_base, which is where those rows were headed anyway. The guard is on
  -- p_kinds ONLY and deliberately not on p_client: a sweep receipt written by
  -- clara.reconcile_sweep_runs is firm-level (client_id null, 0011:2763-2764), but `client_id` is
  -- a column on the event, not a law about it, and a client-scoped read must not start deciding
  -- what a row IS from what this file expects it to be.
  if p_kinds is null or 'agent' = any(p_kinds) then
    select coalesce(array_agg(k.event_id), '{}'::uuid[]) into v_kept_sweeps
      from clara._sweep_events_with_effect() k;
  else
    v_kept_sweeps := '{}'::uuid[];
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
      -- #630 (round-6 review, finding [1]) -- AND THE HANDOVER ROW GETS A DEEP LINK. `orr.work_id`
      -- is the operation-receipt join's, gated on `object_kind = 'entry'`, and a `work.taken_over`
      -- event has NO object_kind at all: clara.firm_timeline_visible derives it from
      -- entry_id/document_id/resolution_id and `_append_event` passes none of the three. So the
      -- estate's first `work.%` row reached the feed as the only row with nothing to link to,
      -- while the Work it is entirely about sat one payload key away.
      --
      -- READ FROM clara.domain_events, NOT THE VIEW: the view projects no `payload` column, and
      -- widening it is a change to a surface far beyond this door (left to #719). A correlated
      -- primary-key lookup inside a CASE is the cheapest honest reach -- CASE evaluates only the
      -- branch it selects, so a feed of entry and document rows pays nothing at all, and the one
      -- work.% row pays one index probe. `de.firm_id = c.firm` repeats the fence the view already
      -- applies; the row is one the caller can already see, and only its `work` key is read.
      --
      -- THE UUID SHAPE IS CHECKED BEFORE THE CAST. `work.taken_over` always writes a uuid, but a
      -- later `work.%` type with a differently shaped `work` key would otherwise raise 22P02 out
      -- of a READ -- turning a feed page into a failure over a row it could simply not link.
      coalesce(
        orr.work_id,
        case when v.event_type like 'work.%' then (
          select case
            when de.payload->>'work' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (de.payload->>'work')::uuid
          end
          from clara.domain_events de
          where de.id = v.event_id and de.firm_id = c.firm
        ) end
      )                                                                   as work_id,
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
        -- #630: `work.taken_over` is the estate's FIRST `work.%` event type (0184 §I). Without
        -- this arm the closed ladder's `else` files a handover under `documents`, where the
        -- `work` filter can never find it and the `documents` filter shows a row about no
        -- document at all. Matched on the PREFIX, not the one name, because the kind set is a
        -- closed vocabulary this door owns and every later `work.%` type belongs in the same
        -- bucket by construction.
        when v.event_type like 'work.%' then 'work'
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
    -- #728: EXCLUDE a sweep heartbeat that changed nothing. `v_kept_sweeps` holds the receipts
    -- whose run actually drafted or posted something (clara._sweep_events_with_effect, read once
    -- above); a run that cannot be resolved at all contributes no id and is therefore treated the
    -- SAME as a zero-effect one -- an unverifiable heartbeat is not evidence of one, and is never
    -- shown by default. Every non-sweep row is untouched: the left side of the `or` is true for
    -- all of them, so this predicate can only ever remove sweep.run_completed rows, nothing else.
   where v.event_type <> 'sweep.run_completed' or v.event_id = any(v_kept_sweeps)
  ),
  ev as (
    select * from ev_base
     where (p_client is null or client_id = p_client)
       -- #770: THE WORK FILTER SITS INSIDE THIS ARM'S OWN `where`, beside p_client and p_kinds,
       -- and NOT after the union. Every arm carries its own `limit v_limit + 1` BELOW, so a
       -- p_work test applied to the unioned page would reproduce server-side the exact defect
       -- this parameter exists to end: a page is the CLIENT's newest rows, and a Work whose
       -- events sit further back never reaches it.
       --
       -- NOT INDEX-BACKED HERE, and stated rather than hidden: `work_id` is not a column of
       -- clara.firm_timeline_visible at all but the ev_base coalesce of an operation-receipt
       -- left join and a correlated domain_events payload lookup (0184's own addition 3). The
       -- door's measured cost bound (activity-feed.test.mjs af.20/af.23, both re-run with
       -- p_work bound) is the guard on that, not an index.
       and (p_work is null or work_id = p_work)
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
     -- #770: THE WHOLE ARM IS SKIPPED under a p_work filter. ar_base projects
     -- `null::uuid as work_id` UNCONDITIONALLY (an agent act receipt names no Work), so under
     -- `work_id = p_work` it can contribute nothing whatsoever — and a constant-false predicate
     -- here lets the planner drop the arm rather than sort and limit a set it will then discard.
     -- The door already has this shape for the p_kinds/'agent' gate above.
     where p_work is null
       and (p_client is null or client_id = p_client)
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
       -- #770: the same predicate, in this arm's own `where`, ahead of its own
       -- `limit v_limit + 1`. Here `work_id` IS a real column (clara.operation_receipts.work_id),
       -- so this is the cheap half of the filter.
       and (p_work is null or work_id = p_work)
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

-- THE THREE PROPERTIES A DROP DESTROYED, RE-ISSUED BY HAND. 0184 could write "grants are NOT
-- re-issued: create or replace preserves them"; this file cannot.
revoke all on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz, uuid) from public;
grant execute on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz, uuid) to clara_authenticated;

comment on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz, uuid) is
  '#632 B5, recut #728, recut #630, recut #770. The firm activity feed: a keyset-paged union of '
  'clara.firm_timeline_visible (domain events), clara.agent_receipts_visible (agent act receipts) '
  'and clara.operation_receipts (#623 committed operation receipts), newest first over '
  '(occurred_at desc, id desc). SECURITY INVOKER over three already-clara_authenticated-granted '
  'sources; refuses CLR04 below bookkeeper before running. p_kinds is the closed set '
  '{documents,journal,close,report,agent,work}, refused CLR10 invalid_kind otherwise. p_limit '
  'clamps 1..100. p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a '
  'malformed one refuses CLR10 invalid_cursor. #728: a sweep.run_completed event with no drafted '
  'effect is excluded entirely; one that drafted something is kind=agent (never documents), actor '
  'stays null. #630: a work.% event type (work.taken_over is the first) is kind=work, so a '
  'handover is findable under the filter that names it instead of falling into the documents '
  'bucket, and its work_id is read from the event payload so the row deep-links to the Work it is '
  'about. #770: p_work narrows the feed to ONE Work IN SQL -- the predicate sits inside each '
  'union arm''s own WHERE, ahead of that arm''s own `limit v_limit + 1`, so a Work whose events '
  'sit far back in the client''s history is on the FIRST p_work page rather than several '
  'over-fetched pages down; the agent-receipt arm (work_id null by construction) is skipped '
  'entirely; a p_work naming another firm''s Work, or no Work at all, answers an EMPTY page, not '
  'an error and not an existence signal; and an omitted p_work reproduces the six-argument door '
  'this recut retired, exactly. THE SIX-ARGUMENT SIGNATURE IS GONE: a new parameter cannot be '
  'added by `create or replace`, and an overload that still resolved would leave PostgREST two '
  'candidates for one name. PINS plan_cache_mode = force_custom_plan: its ONE union statement '
  'binds the session firm, every filter, the cursor pair and the kept-sweep array as plpgsql '
  'parameters, and from the sixth execution of a pooled connection plpgsql would otherwise serve '
  'it from a generic plan built for the per-firm AVERAGE of multi-tenant tables (measured: 145 ms '
  '-> 2.0-2.8 s at 30,000 committed operation_receipts with no sweep row at all, and 89 ms -> '
  '1.7-2.5 s at 30,000 sweep receipts / 6,000 kept; flat with the clause). See 0183''s and '
  '0181''s headers for the full rationale.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. This file's whole hazard
-- is a property silently lost in a DROP, so every one of the five is read back from the catalog
-- rather than assumed from the statements above.
-- =====================================================================================
do $w770_tail$
declare v_src text; v_n int; v_posture text; v_cmt text; v_missing text;
begin
  -- 1 · EXACTLY ONE BODY OF THIS NAME, and it is the seven-argument one. The six-argument
  -- signature must not survive as a resolvable overload -- af.22's own rule, applied to the door.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_activity';
  if v_n <> 1 then
    raise exception '#770 tail: clara.list_activity now has % bodies (expected exactly 1) -- the recut created an overload instead of retiring the old signature', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is not null then
    raise exception '#770 tail: the SIX-argument clara.list_activity still resolves -- an overload that still resolves is an overload a later caller can reach, and PostgREST would have two candidates'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)') is null then
    raise exception '#770 tail: clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid) does not resolve' using errcode='CLR10';
  end if;

  -- 2 · ALL FIVE PROPERTIES A DROP DESTROYS, read from the catalog in one comparison: owner,
  -- SECURITY INVOKER (prosecdef false), BOTH pinned settings, and the EXACT ACL with its grantor.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#770 tail: the recut door has the wrong posture -- expected owner clara_fn_owner, SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, and EXECUTE to clara_authenticated only (PUBLIC revoked); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 3 · THE COMMENT, the fifth thing the drop took. Read from obj_description, and required to
  -- name the parameter this file exists for -- a comment carried over verbatim from 0184 would
  -- describe a door that no longer exists.
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_cmt is null or position('#770' in v_cmt) = 0 or position('p_work' in v_cmt) = 0 then
    raise exception '#770 tail: the recut door carries no comment naming p_work -- a DROP takes the comment with it and this file must re-issue one'
      using errcode='CLR10';
  end if;

  -- 4 · THE PREDICATE IS IN EACH ARM, not after the union. Measured on the committed text: three
  -- mentions of p_work in the body (the ev arm, the ar arm's skip, the orx arm), and the union
  -- itself carries none -- a post-union test would reproduce the reported bug server-side.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'p_work is null', ''))) / length('p_work is null');
  if v_n <> 3 then
    raise exception '#770 tail: the committed body tests p_work % time(s) (expected exactly 3: the ev arm, the ar arm''s skip and the orx arm)', v_n
      using errcode='CLR10';
  end if;
  if position('and (p_work is null or work_id = p_work)' in v_src) = 0 then
    raise exception '#770 tail: the arm-level work predicate is absent from the committed body' using errcode='CLR10';
  end if;
  if position('where p_work is null' in v_src) = 0 then
    raise exception '#770 tail: the agent-receipt arm is NOT skipped under p_work -- it projects work_id null unconditionally and can only sort and limit rows it will then discard'
      using errcode='CLR10';
  end if;
  if position('select * from ev union all select * from ar union all select * from orx' in v_src) = 0 then
    raise exception '#770 tail: the three-arm union is no longer the shape this census measured the predicate against' using errcode='CLR10';
  end if;

  -- 5 · EVERY OTHER ARM SURVIVED, arm by arm, against the committed text -- only the parameter
  -- and the three predicates may have arrived.
  v_missing := '';
  if position('v_kept_sweeps uuid[]' in v_src) = 0 then v_missing := v_missing || ' kept-sweep-array'; end if;
  if position('v.event_id = any(v_kept_sweeps)' in v_src) = 0 then v_missing := v_missing || ' sweep-exclusion'; end if;
  if position('clara._sweep_events_with_effect()' in v_src) = 0 then v_missing := v_missing || ' kept-sweep-read'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_src) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 50), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('invalid_kind' in v_src) = 0 then v_missing := v_missing || ' kind-refusal'; end if;
  if position('invalid_cursor' in v_src) = 0 then v_missing := v_missing || ' cursor-refusal'; end if;
  if position('order by u.occurred_at desc, u.id desc' in v_src) = 0 then v_missing := v_missing || ' aggregate-order'; end if;
  if position('''rows'', v_page, ''next_cursor'', v_next_cursor, ''truncated'', v_truncated' in v_src) = 0 then v_missing := v_missing || ' page-envelope'; end if;
  if v_missing <> '' then
    raise exception '#770 tail: the recut LOST arm(s):% -- only p_work may arrive', v_missing
      using errcode='CLR10';
  end if;

  -- 6 · THE DETAIL DOOR IS UNTOUCHED. 0184's body stands, at its own signature, with its own ACL.
  if to_regprocedure('clara.get_activity_event(text,text)') is null then
    raise exception '#770 tail: clara.get_activity_event no longer resolves -- this file must not have touched it' using errcode='CLR10';
  end if;
  if pg_catalog.has_function_privilege('public', 'clara.get_activity_event(text,text)', 'execute')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara.get_activity_event(text,text)', 'execute') then
    raise exception '#770 tail: clara.get_activity_event lost its PUBLIC-revoked / clara_authenticated-only posture' using errcode='CLR10';
  end if;

  raise notice '#770 tail: OK -- clara.list_activity exists EXACTLY ONCE, at (text,int,uuid,text[],timestamptz,timestamptz,uuid); the six-argument signature is GONE rather than left as a resolvable overload; the recut door is owned by clara_fn_owner, SECURITY INVOKER, pins search_path=clara, pg_temp AND plan_cache_mode=force_custom_plan, is PUBLIC-revoked and EXECUTE-reachable by clara_authenticated and nobody else, and carries a re-issued comment naming p_work -- all five properties a DROP destroys, re-read from the catalog rather than assumed. The p_work predicate is tested exactly three times in the committed body (the ev arm''s own where, the ar arm''s whole-arm skip, the orx arm''s own where) and never after the union, so each arm''s `limit v_limit + 1` selects THAT Work''s rows; and every 0181/0183/0184 arm survives unchanged -- the kept-sweep array read once and tested with = any(...), the work.%% kind arm, the bookkeeper floor, the 1..100 clamp, both CLR10 refusals, the aggregate-level order and the {rows, next_cursor, truncated} envelope. clara.get_activity_event is untouched and keeps 0184''s body and its clara_authenticated-only ACL.';
end
$w770_tail$;
