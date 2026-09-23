-- 0262_activity_successor_link — #840: THE ACTIVITY FEED SHOWS THE SUCCESSOR WORK ON A
-- `work.cancelled` ROW, THE MOMENT ONE EXISTS.
-- =====================================================================================
-- Spec of record: issue #840's Agent Brief (comment of 2026-09-17), grounded in #721's ruling of
-- 2026-09-12 (point 3): "the two Works link both ways on B3 AND on the Activity feed." B3 (the
-- Work detail page) already reads `clara.accounting_work.supersedes`/`superseded_by` directly
-- (0200); this file is the OTHER half — the firm's only firm-wide history surface never widened
-- to show it, because `clara.list_activity` projects no `payload` column at all (0184's own
-- header, "widening it is a change to a surface far beyond this door", deferred to #719) and
-- `payload.superseded_by` (0199, forward-compatibly re-derived by 0200) has sat unread by either
-- feed door ever since.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_activity` and `clara.get_activity_event`
-- gain ONE additive field, `successor_work_id`: the successor Work id for a `work.cancelled` row
-- whose cancellation carried one, and jsonb/SQL null for every other row — including an ORDINARY
-- cancellation (no successor) and every non-`work.cancelled` row of every kind.
--
-- =====================================================================================
-- WHY THIS IS `create or replace`, NOT A DROP-AND-CREATE.
--
-- 0202's own header explains why ITS change (#770, adding `p_work`) needed a drop: PostgreSQL's
-- `create or replace function` cannot ADD a parameter, because the parameter list is part of the
-- function's identity. This file adds no parameter to either door — both keep their exact,
-- already-live signatures (`list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)`,
-- `get_activity_event(text,text)`) — and both return `jsonb`, an untyped envelope rather than a
-- fixed composite `returns table`/`setof` shape, so a new *key inside the returned object* is not
-- a signature change at all. `create or replace` is therefore the correct tool, and it is also
-- the SAFER one here: unlike a drop, it preserves the owner, `SECURITY INVOKER`, every pinned
-- `search_path`/`plan_cache_mode` setting, the exact ACL (grantor included) and the extended
-- comment automatically — nothing needs re-issuing, and §T below MEASURES that claim rather than
-- assuming it (the same discipline 0198's header states for its own byte-identical-ACL recut).
--
-- =====================================================================================
-- THE READ, TWICE, BECAUSE IT ANSWERS TWO DIFFERENT QUESTIONS.
--
-- Both doors already read `clara.domain_events` by primary key inside a `case` to answer "which
-- Work is this row about" (`work_id`, coalescing an operation-receipt join with a correlated
-- lookup of `payload->>'work'`, gated `event_type like 'work.%'` — 0184's own addition, restated
-- in both doors' headers). This file adds a SECOND, narrower correlated lookup — gated
-- `event_type = 'work.cancelled'` rather than the wider `like 'work.%'` — that reads the SAME row
-- for `payload->>'superseded_by'` instead. Two lookups rather than widening the first into a
-- lateral join returning both keys, because "which Work is this row about" and "what replaced it"
-- are two different facts that only happen to share one event type today (`work.taken_over` is
-- `work.%` and never carries a `superseded_by` key at all), and a reader of either `case` should
-- not have to hold the other fact's gate in their head to understand this one. The COST of the
-- second probe is paid only by a `work.cancelled` row (the `case` evaluates its `when` first, per
-- 0202's own header on this exact idiom), and even there it is a second single-row lookup by the
-- domain_events primary key alongside one already being paid — not a second class of cost.
--
-- THE UUID SHAPE IS CHECKED BEFORE THE CAST, exactly as the `work_id` read already does: 0199's
-- payload writes `superseded_by` as `to_jsonb(w) -> 'superseded_by'`, which is `jsonb` `null` (not
-- a uuid at all) for the overwhelming majority of cancellations — the ones with no successor. A
-- bare `::uuid` cast of `payload->>'superseded_by'` would still work for THAT case (`->>` on a
-- jsonb null yields SQL NULL, and `null::uuid` is null), but the shape-check stays anyway: it is
-- the SAME regex the sibling `work_id` read already uses on the SAME payload's `->>'work'` key, on
-- the SAME theory (0202's header: "a later `work.%` type with a differently shaped ... key would
-- otherwise raise 22P02 out of a READ"). `superseded_by`'s shape is closed today (0200's own
-- immutability trigger accepts only a uuid or null, never anything else), but the two reads should
-- not read as though one trusts the payload and the other does not.
--
-- WHAT DOES NOT CHANGE: p_cursor, p_limit, p_client, p_kinds, p_since, p_until, p_work, the cursor
-- contract, the page envelope, the kind ladder, the kept-sweep exclusion, the bookkeeper floor, the
-- 18-column projection every arm already carried (now 19, additively), get_activity_event's other
-- 17 keys and its three source branches, and every grant/owner/search_path/plan_cache_mode pin
-- either door already carried. `clara.cancel_accounting_work` (0199/0200) is NOT touched: the fact
-- this file surfaces already exists on the row, written the day #750 shipped.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME AS BEFORE, NAMED IN
-- BOTH DOORS' OWN HEADERS (0184/0202's CLR04/CLR10/CLR11 rosters). `successor_work_id` adds NO new
-- refusal: it is read, never validated against caller input.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits —
-- sha256(prosrc) pins MEASURED ON THIS RIG NOW, per the wave-2 addendum (a ticket before this one
-- in the lane may have recut a body this file touches; nothing has, on this lane's own database,
-- but the discipline is the same either way: pin what is LIVE, never what a file listing implies).
-- =====================================================================================
do $w840_pre$
declare n text; v_src text; v_sha text; v_posture text; v_n int; v_missing text;
begin
  -- 0.1 · the prerequisites this file reads or recuts, in exact regprocedure/regclass form.
  foreach n in array array[
    'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)',
    'clara.get_activity_event(text,text)',
    'clara.jwt_sub()', 'clara.jwt_firm()', 'clara.actor_role_rank()', 'clara.role_rank(text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#840 prestate: prerequisite absent: % (migrations 0181/0183/0184/0202 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;
  foreach n in array array[
    'clara.firm_timeline_visible', 'clara.agent_receipts_visible', 'clara.operation_receipts',
    'clara.domain_events', 'clara.journal_entries', 'clara.accounting_work', 'clara.clients'
  ] loop
    if to_regclass(n) is null then
      raise exception '#840 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the six-argument list_activity signature 0202 retired must NOT have come back, and the
  -- seven-argument one must exist exactly once — the same idempotence shape 0202's own prestate
  -- measured for its own recut.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_activity';
  if v_n <> 1 then
    raise exception '#840 prestate: clara.list_activity has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is not null then
    raise exception '#840 prestate: the SIX-argument clara.list_activity still resolves' using errcode='CLR10';
  end if;

  -- 0.3 · THE LIVE BODIES ARE 0202's and 0184's, pinned by prosrc sha-256, MEASURED ON THIS RIG
  -- NOW. A drift is REFUSED, never silently overwritten — the same discipline every prior recut of
  -- either door applies to the text it inherits.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_sha is distinct from 'dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870' then
    raise exception '#840 prestate: clara.list_activity has DRIFTED from the pinned 0202 body (sha %) -- re-derive §R against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_sha is distinct from '80bc1390416da02e3787cd64ea4a3df483402edafd5eb8067ae6289bc5b8531f' then
    raise exception '#840 prestate: clara.get_activity_event has DRIFTED from the pinned 0184 body (sha %) -- re-derive §R against the live body before applying', v_sha
      using errcode='CLR10';
  end if;

  -- 0.4 · IDEMPOTENCE: neither body already carries this file's own key. A re-run against a
  -- database that already carries this recut must refuse loudly, not silently double the column.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if position('successor_work_id' in v_src) <> 0 then
    raise exception '#840 prestate: clara.list_activity ALREADY projects successor_work_id' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if position('successor_work_id' in v_src) <> 0 then
    raise exception '#840 prestate: clara.get_activity_event ALREADY projects successor_work_id' using errcode='CLR10';
  end if;

  -- 0.5 · THE POSTURE `create or replace` is trusted to preserve, measured now so §T's re-read
  -- after the recut is a COMPARISON rather than a hopeful assertion. Both doors carry the SAME
  -- posture (owner, SECURITY INVOKER, both pinned settings, and the exact ACL with its grantor).
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#840 prestate: clara.list_activity does not carry the posture this file assumes create-or-replace preserves; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#840 prestate: clara.get_activity_event does not carry the posture this file assumes create-or-replace preserves; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 0.6 · the arms/branches this file carries over unchanged, named one by one against the live
  -- text of BOTH bodies, so a reader of a failure knows WHICH property the sha was standing for.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  v_missing := '';
  if position('v_kept_sweeps uuid[]' in v_src) = 0 then v_missing := v_missing || ' kept-sweep-array'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_src) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('and (p_work is null or work_id = p_work)' in v_src) = 0 then v_missing := v_missing || ' p_work-predicate'; end if;
  if position('select * from ev union all select * from ar union all select * from orx' in v_src) = 0 then v_missing := v_missing || ' three-arm-union'; end if;
  if v_missing <> '' then
    raise exception '#840 prestate: the live clara.list_activity is not 0202''s body -- missing:%', v_missing
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  v_missing := '';
  if position('p_source = ''event''' in v_src) = 0 then v_missing := v_missing || ' event-branch'; end if;
  if position('p_source = ''agent_receipt''' in v_src) = 0 then v_missing := v_missing || ' agent-receipt-branch'; end if;
  if position('p_source = ''operation_receipt''' in v_src) = 0 then v_missing := v_missing || ' operation-receipt-branch'; end if;
  if position('''initiated_by'', w.initiated_by, ''responsible'', w.initiator' in v_src) = 0 then v_missing := v_missing || ' provenance-triple'; end if;
  if v_missing <> '' then
    raise exception '#840 prestate: the live clara.get_activity_event is not 0184''s body -- missing:%', v_missing
      using errcode='CLR10';
  end if;

  raise notice '#840 prestate: clean -- both doors exist exactly once at their live signatures, carry their pinned bodies byte-for-byte (sha256 pinned) with every arm/branch this file keeps, project no successor_work_id yet, and carry the posture create-or-replace is about to preserve (owner clara_fn_owner, SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, PUBLIC-revoked, EXECUTE to clara_authenticated only).';
end
$w840_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §R THE RECUT, PART 1 — clara.list_activity. 0202's body, byte-for-byte, plus ONE new column in
-- EACH of the three union arms' base CTEs (ev_base/ar_base/orx_base), at the SAME ordinal position
-- (immediately after `work_id`) in all three, so the `union all` stays positionally aligned.
-- =====================================================================================
create or replace function clara.list_activity(
  p_cursor text default null,
  p_limit  int  default 50,
  p_client uuid default null,
  p_kinds  text[] default null,
  p_since  timestamptz default null,
  p_until  timestamptz default null,
  p_work   uuid default null
) returns jsonb
  language plpgsql stable security invoker
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
      -- #840: THE SUCCESSOR LINK. `work.cancelled` writes `superseded_by` into its OWN payload
      -- (0199, forward-compatibly re-derived by 0200) -- jsonb null for an ordinary cancellation,
      -- the successor Work's uuid for a restatement (#721). ADDITIVE and null for every row that
      -- is not this ONE event type: a SECOND, narrower correlated lookup of the SAME row `work_id`
      -- above already reaches (gated `= 'work.cancelled'` rather than `like 'work.%'`), because
      -- "which Work is this row about" and "what replaced it" are two different facts that only
      -- happen to share one event type today. Same shape-before-cast discipline as `work_id`.
      case when v.event_type = 'work.cancelled' then (
        select case
          when de.payload->>'superseded_by' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then (de.payload->>'superseded_by')::uuid
        end
        from clara.domain_events de
        where de.id = v.event_id and de.firm_id = c.firm
      ) end                                                               as successor_work_id,
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
      -- #840: an agent-act receipt names no Work and can therefore have no successor either --
      -- SAME ordinal position as ev_base's own new column, so the union below stays aligned.
      null::uuid                                                          as successor_work_id,
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
      -- #840: an operation receipt's event_type is a Work purpose (`journal_entry`, …), never
      -- `work.cancelled` -- SAME ordinal position as the other two arms' own new column.
      null::uuid                                                         as successor_work_id,
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

comment on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz, uuid) is
  '#632 B5, recut #728, recut #630, recut #770, recut #840. The firm activity feed: a keyset-paged '
  'union of clara.firm_timeline_visible (domain events), clara.agent_receipts_visible (agent act '
  'receipts) and clara.operation_receipts (#623 committed operation receipts), newest first over '
  '(occurred_at desc, id desc). SECURITY INVOKER over three already-clara_authenticated-granted '
  'sources; refuses CLR04 below bookkeeper before running. p_kinds is the closed set '
  '{documents,journal,close,report,agent,work}, refused CLR10 invalid_kind otherwise. p_limit '
  'clamps 1..100. p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a '
  'malformed one refuses CLR10 invalid_cursor. #728: a sweep.run_completed event with no drafted '
  'effect is excluded entirely; one that drafted something is kind=agent (never documents), actor '
  'stays null. #630: a work.% event type (work.taken_over is the first) is kind=work, so a '
  'handover is findable under the filter that names it instead of falling into the documents '
  'bucket, and its work_id is read from the event payload so the row deep-links to the Work it is '
  'about. #770: p_work narrows the feed to ONE Work IN SQL, inside each union arm''s own WHERE. '
  '#840: an ADDITIVE successor_work_id, jsonb/SQL null on every row except a work.cancelled row '
  'whose payload named a successor (#721''s restatement) -- read the same forward-compatible way '
  'as work_id, gated on the exact event type rather than the work.% prefix. PINS '
  'plan_cache_mode = force_custom_plan: its ONE union statement binds the session firm, every '
  'filter, the cursor pair and the kept-sweep array as plpgsql parameters, and from the sixth '
  'execution of a pooled connection plpgsql would otherwise serve it from a generic plan built for '
  'the per-firm AVERAGE of multi-tenant tables (measured, 0202''s own header: 145 ms -> 2.0-2.8 s '
  'at 30,000 committed operation_receipts with no sweep row at all). See 0183''s, 0184''s and '
  '0202''s headers for the fuller rationale.';

-- =====================================================================================
-- §R THE RECUT, PART 2 — clara.get_activity_event. 0184's body, byte-for-byte, plus ONE new key
-- in each of the three source branches' jsonb_build_object.
-- =====================================================================================
create or replace function clara.get_activity_event(p_source text, p_id text) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
as $$
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
        -- #630 (round-6 review, finding [1]): the SAME reach list_activity's ev_base makes -- see
        -- that function's own comment. A deep link to the row must agree with the row.
        'work_id', coalesce(
          orr.work_id,
          case when v.event_type like 'work.%' then (
            select case
              when de.payload->>'work' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then (de.payload->>'work')::uuid
            end
            from clara.domain_events de
            where de.id = v.event_id and de.firm_id = c.firm
          ) end
        ),
        -- #840: THE SUCCESSOR LINK, additive -- the SAME read list_activity's ev_base now makes,
        -- against the SAME row this branch already has open: see that function's own comment.
        'successor_work_id', case when v.event_type = 'work.cancelled' then (
          select case
            when de.payload->>'superseded_by' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (de.payload->>'superseded_by')::uuid
          end
          from clara.domain_events de
          where de.id = v.event_id and de.firm_id = c.firm
        ) end,
        'receipt_id', orr.id::text,
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
          -- #630: the same arm as list_activity's ev_base -- see that function's own comment.
          when v.event_type like 'work.%' then 'work'
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
     where v.event_id::text = p_id;

    -- #728: the SAME exclusion list_activity applies -- a deep link to a zero-effect sweep
    -- heartbeat is dropped here, falls through to `v_row is null` below, and answers the SAME
    -- CLR11 activity_event_not_found every other denied/absent id already gets (no oracle: an
    -- excluded heartbeat must not read differently from one that never existed).
    --
    -- AFTER the row is fetched, not as another WHERE predicate beside `v.event_id::text = p_id`
    -- (native review, N1): a definer function in the WHERE is a filter the planner is free to
    -- order however it costs it, and one bad estimate would run it once per row of the whole
    -- timeline. Hoisted out like this it runs at most once per call, and only for a sweep receipt.
    -- It calls clara._sweep_event_has_effect, NOT the set form the feed calls: one cached plan per
    -- caller shape is the whole point of splitting them (0183 section 1, BLOCKER [0]).
    if v_row is not null and v_row ->> 'event_type' = 'sweep.run_completed'
       and not clara._sweep_event_has_effect((v_row ->> 'id')::uuid) then
      v_row := null;
    end if;

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
        'work_id', null,
        -- #840: an agent-act receipt names no Work and can therefore have no successor either.
        'successor_work_id', null,
        'receipt_id', (r.receipt_kind || ':' || r.receipt_id),
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
        'work_id', orr.work_id,
        -- #840: an operation receipt's event_type is a Work purpose, never work.cancelled.
        'successor_work_id', null,
        'receipt_id', orr.id::text, 'document_id', null,
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
        -- #630 -- TWO PEOPLE, TOLD APART, on the firm's only firm-wide history surface. 0184 §A
        -- split `clara.accounting_work.initiator` into the human the Work is EXECUTED AS (that
        -- column, which a handover moves) and the immutable `initiated_by` (who asked). 0181's
        -- lone `initiator` key therefore answers only the first question, and after a takeover it
        -- names the colleague beside an `on_behalf_of` that is also the colleague -- who asked is
        -- absent from the record entirely. ADDITIVE: `initiator` keeps its key and its value, so
        -- every existing reader is unbroken; `responsible` is the same fact under a name that
        -- says what it is, matching clara.list_entry_links' own triple (0184 §H2).
        'initiated_by', w.initiated_by, 'responsible', w.initiator,
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
  '#632 B5, recut #728, recut #630, recut #840. The detail record for one clara.list_activity row, '
  'addressed by (source, id) -- see that function''s own comment for the shapes. Another firm''s '
  'row, an unknown source, a malformed agent_receipt pair, a genuinely absent id, or an EXCLUDED '
  'zero-effect sweep heartbeat (#728) all refuse the SAME CLR11 activity_event_not_found (no '
  'oracle). #630: a work.% event type is kind=work (the same ladder as the feed) and carries '
  'the work_id its payload names, so the detail record links where its row links; the '
  'operation_receipt arm carries the Work''s provenance as THREE facts -- initiated_by (who '
  'asked, immutable), responsible (who it is executed as now) and initiator (the same human as '
  'responsible, under 0181''s original key, kept so no reader breaks). #840: an ADDITIVE '
  'successor_work_id, jsonb/SQL null on every row except a work.cancelled event whose payload '
  'named a successor (#721''s restatement) -- read the same forward-compatible way list_activity''s '
  'ev_base does, off the SAME row this branch already has open. p_id is TEXT -- see this '
  'function''s header comment for why. Pins plan_cache_mode = force_custom_plan for symmetry with '
  'clara.list_activity rather than for a measurement of its own.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. `create or replace`'s
-- whole promise is that nothing but the body text moves — every property below is MEASURED after
-- the fact, never assumed from the statements above.
-- =====================================================================================
do $w840_tail$
declare v_src text; v_n int; v_posture text; v_missing text; v_sha text;
begin
  -- 1 · EXACTLY ONE BODY OF EACH NAME, at the SAME signature as before — `create or replace`
  -- never creates an overload, but this is measured rather than trusted, the same way every
  -- recut of these two doors measures it.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_activity';
  if v_n <> 1 then
    raise exception '#840 tail: clara.list_activity now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)') is null then
    raise exception '#840 tail: clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid) no longer resolves'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='get_activity_event';
  if v_n <> 1 then
    raise exception '#840 tail: clara.get_activity_event now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.get_activity_event(text,text)') is null then
    raise exception '#840 tail: clara.get_activity_event(text,text) no longer resolves' using errcode='CLR10';
  end if;

  -- 2 · THE BODIES ACTUALLY CHANGED (a drifted sha would mean this file's own statements never
  -- ran, e.g. because a prior rollback left the transaction uncommitted in a way psql swallowed).
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_sha = 'dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870' then
    raise exception '#840 tail: clara.list_activity still carries its PRE-image body — the recut did not commit'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_sha = '80bc1390416da02e3787cd64ea4a3df483402edafd5eb8067ae6289bc5b8531f' then
    raise exception '#840 tail: clara.get_activity_event still carries its PRE-image body — the recut did not commit'
      using errcode='CLR10';
  end if;

  -- 3 · THE POSTURE `create or replace` PROMISES TO PRESERVE, re-read from the catalog and
  -- compared against §0's own pin — byte-identical, owner/SECURITY/settings/ACL alike.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#840 tail: clara.list_activity''s posture MOVED — expected owner clara_fn_owner, SECURITY INVOKER, both settings pinned, EXECUTE to clara_authenticated only (PUBLIC revoked); got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#840 tail: clara.get_activity_event''s posture MOVED — expected owner clara_fn_owner, SECURITY INVOKER, both settings pinned, EXECUTE to clara_authenticated only (PUBLIC revoked); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 4 · THE COMMENT names this file, on both doors.
  if position('#840' in coalesce(obj_description(
       'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure, 'pg_proc'), '')) = 0 then
    raise exception '#840 tail: clara.list_activity''s comment does not name #840' using errcode='CLR10';
  end if;
  if position('#840' in coalesce(obj_description(
       'clara.get_activity_event(text,text)'::regprocedure, 'pg_proc'), '')) = 0 then
    raise exception '#840 tail: clara.get_activity_event''s comment does not name #840' using errcode='CLR10';
  end if;

  -- 5 · THE NEW COLUMN IS IN EACH OF list_activity's THREE ARMS, at the SAME ordinal position
  -- (immediately after `work_id`) — exactly three `as successor_work_id` occurrences, one per arm,
  -- so the union's positional alignment (the property that makes `to_jsonb(u.*)` project the SAME
  -- key for every row regardless of which arm produced it) is measured, not assumed.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'as successor_work_id', ''))) / length('as successor_work_id');
  if v_n <> 3 then
    raise exception '#840 tail: clara.list_activity projects successor_work_id % time(s) (expected exactly 3: ev_base, ar_base, orx_base)', v_n
      using errcode='CLR10';
  end if;
  -- Four, not three: the three real columns (one per arm) PLUS 0202's own pre-existing comment
  -- inside the `ar` CTE's `where` ("`null::uuid as work_id` UNCONDITIONALLY…") — measured on the
  -- pre-image body before this file touched anything, so this is the baseline, not a new leak.
  v_n := (length(v_src) - length(replace(v_src, 'as work_id', ''))) / length('as work_id');
  if v_n <> 4 then
    raise exception '#840 tail: clara.list_activity''s work_id mention count moved (expected exactly 4: three columns plus 0202''s own comment); got %', v_n
      using errcode='CLR10';
  end if;
  if position('when v.event_type = ''work.cancelled'' then' in v_src) = 0 then
    raise exception '#840 tail: the ev_base successor read is not gated on work.cancelled' using errcode='CLR10';
  end if;
  if position('de.payload->>''superseded_by''' in v_src) = 0 then
    raise exception '#840 tail: the ev_base successor read does not name superseded_by' using errcode='CLR10';
  end if;

  -- 6 · EVERY ARM 0202 SHIPPED SURVIVED, re-measured against the committed text — the same probes
  -- §0.6 ran before the recut, so a passing §0 and a failing §6 would mean this file's own edit
  -- (not a pre-existing drift) dropped something.
  v_missing := '';
  if position('v_kept_sweeps uuid[]' in v_src) = 0 then v_missing := v_missing || ' kept-sweep-array'; end if;
  if position('v.event_id = any(v_kept_sweeps)' in v_src) = 0 then v_missing := v_missing || ' sweep-exclusion'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_src) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 50), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('invalid_kind' in v_src) = 0 then v_missing := v_missing || ' kind-refusal'; end if;
  if position('invalid_cursor' in v_src) = 0 then v_missing := v_missing || ' cursor-refusal'; end if;
  if position('and (p_work is null or work_id = p_work)' in v_src) = 0 then v_missing := v_missing || ' p_work-predicate'; end if;
  if position('where p_work is null' in v_src) = 0 then v_missing := v_missing || ' p_work-arm-skip'; end if;
  if position('order by u.occurred_at desc, u.id desc' in v_src) = 0 then v_missing := v_missing || ' aggregate-order'; end if;
  if position('''rows'', v_page, ''next_cursor'', v_next_cursor, ''truncated'', v_truncated' in v_src) = 0 then v_missing := v_missing || ' page-envelope'; end if;
  if position('select * from ev union all select * from ar union all select * from orx' in v_src) = 0 then v_missing := v_missing || ' three-arm-union'; end if;
  if v_missing <> '' then
    raise exception '#840 tail: clara.list_activity LOST arm(s):% -- only successor_work_id may have arrived', v_missing
      using errcode='CLR10';
  end if;

  -- 7 · get_activity_event: THE NEW KEY IN EACH OF ITS THREE BRANCHES, and every branch/field it
  -- shipped before still there.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, '''successor_work_id''', ''))) / length('''successor_work_id''');
  if v_n <> 3 then
    raise exception '#840 tail: clara.get_activity_event names successor_work_id % time(s) (expected exactly 3: event, agent_receipt, operation_receipt)', v_n
      using errcode='CLR10';
  end if;
  v_missing := '';
  if position('p_source = ''event''' in v_src) = 0 then v_missing := v_missing || ' event-branch'; end if;
  if position('p_source = ''agent_receipt''' in v_src) = 0 then v_missing := v_missing || ' agent-receipt-branch'; end if;
  if position('p_source = ''operation_receipt''' in v_src) = 0 then v_missing := v_missing || ' operation-receipt-branch'; end if;
  if position('activity_event_not_found' in v_src) = 0 then v_missing := v_missing || ' clr11-refusal'; end if;
  if position('_sweep_event_has_effect' in v_src) = 0 then v_missing := v_missing || ' sweep-detail-exclusion'; end if;
  if position('''initiated_by'', w.initiated_by, ''responsible'', w.initiator' in v_src) = 0 then v_missing := v_missing || ' provenance-triple'; end if;
  if v_missing <> '' then
    raise exception '#840 tail: clara.get_activity_event LOST branch/field(s):% -- only successor_work_id may have arrived', v_missing
      using errcode='CLR10';
  end if;

  raise notice '#840 tail: OK -- clara.list_activity and clara.get_activity_event each still resolve EXACTLY ONCE at their pre-existing signatures, with a CHANGED body (sha256 no longer matches the pre-image) and an UNCHANGED posture (owner clara_fn_owner, SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, PUBLIC-revoked, EXECUTE to clara_authenticated only) — create-or-replace kept every property a drop would have destroyed. Both comments name #840. list_activity projects successor_work_id in EXACTLY three places (ev_base, ar_base, orx_base — the same count as work_id, so the union stays positionally aligned), gated on event_type=''work.cancelled'' and reading payload->>''superseded_by''; get_activity_event names it in EXACTLY three places (its three source branches). Every arm/branch either door shipped before this file survives, re-measured against the committed text.';
end
$w840_tail$;
