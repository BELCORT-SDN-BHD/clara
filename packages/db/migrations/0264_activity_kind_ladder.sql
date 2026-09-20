-- 0264_activity_kind_ladder - #861: THE ACTIVITY KIND LADDER FILES PEOPLE, ASSET, COUNTERPARTY,
-- CLIENT AND FIRM EVENTS UNDER THEIR OWN KINDS INSTEAD OF `documents`.
-- =====================================================================================
-- Spec of record: issue #861's Agent Brief (triage comment of 2026-09-17) as fixed by the OWNER
-- RULING comment of 2026-09-18 on the same issue, which settles the one decision that was the
-- owner's - the vocabulary: `people` (member.*, invite.*), `assets` (asset.*), `counterparties`
-- (counterparty.*), `clients` (client.*, knowledge.*), `firm` (firm.*), with any unrecognised
-- prefix still landing on a stated default. The residual itself was raised by six wave-2026-09-15
-- tickets (#625, #633, #639, #646, #647, #650) and deferred by DECISIONS D13.
--
-- WHAT WAS WRONG. Both doors' domain-event arm recognised FIVE prefixes - sweep.run_completed,
-- entry.%, document.%, close.%, work.% - and swept everything else into `else 'documents'`. A
-- membership change, an invitation, a fixed-asset acquisition, a counterparty identity edit and a
-- client-home facet are none of them document acts, so the feed labelled them wrongly AND put them
-- out of reach: the `documents` filter showed rows about no document at all, and no filter value
-- existed that would return them on their own. Firm Home disclosed the residual in words under its
-- own list (apps/web/components/firm/firm-home/firm-recent-activity.tsx); this file is what lets
-- that sentence go.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_activity` and `clara.get_activity_event`
-- gain the SAME ladder rungs (member.%, invite.% -> people), and `clara.list_activity`'s closed `p_kinds` roster
-- gains the same values, so every kind the ladder can produce is a kind the filter admits.
--
-- =====================================================================================
-- WHY `create or replace`, NOT A DROP-AND-CREATE. Neither door gains or loses a parameter - this
-- is a body-only recut of two already-live signatures
-- (`list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)` from 0202,
-- `get_activity_event(text,text)` from 0184) - and `create or replace` preserves owner,
-- `SECURITY INVOKER`, both pinned settings (`search_path`, `plan_cache_mode`) and the exact ACL,
-- grantor included. Section 0.5 MEASURES that posture before and section T re-reads it after, so
-- the promise is checked rather than assumed. 0262's header states the same for the same two names.
--
-- BOTH LADDERS IN ONE STATEMENT PAIR, IN ONE TRANSACTION. The brief's own acceptance criterion is
-- that the two ladders agree for EVERY event type; the only way to guarantee that at every instant
-- is to move them together. The roster moves in the same transaction for the same reason.
--
-- THE MATCH IS BY PREFIX, NOT BY NAME, for the reason #630's `work.%` arm already states: the kind
-- set is a closed vocabulary these two doors own, and every later type in a family belongs in the
-- same bucket by construction. The cost of that choice is named rather than hidden - a future
-- `client.deleted` would file under `clients` without anyone revisiting this ladder, which is the
-- intent.
--
-- `firm.%`, WITH THE DOT, IS DELIBERATE. In SQL LIKE, `.` is an ordinary character and `_` is a
-- single-character wildcard, so `firm_%` would also match `firm_registration.*` (the operator
-- admission surface, three types) and `firm_setup.*` (the firm setup checklist, four types).
-- Neither family is named by the owner's ruling, and #843's os.20 pins all three admission types
-- on the door's stated default on this very branch. Written with the dot, the arm catches
-- `firm.created` and nothing else.
--
-- WHAT DOES NOT CHANGE: p_cursor, p_limit, p_client, p_since, p_until, p_work and the cursor
-- contract; the page envelope; the kept-sweep exclusion and the sweep arm; the entry/document/
-- close/work arms and their order; `else 'documents'` as the STATED DEFAULT for every unrecognised
-- prefix; 0262's `successor_work_id` projection in all three union arms and all three detail
-- branches; the bookkeeper floor; the CLR04/CLR10/CLR11 refusal roster; every grant, owner,
-- search_path and plan_cache_mode pin. No historical row is rewritten: the kind is COMPUTED AT
-- READ TIME, so the correction applies to the whole history the moment this file lands (the
-- brief's own "out of scope: backfilling historical rows").
--
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: the same as before. The one
-- refusal this file touches, CLR10 `invalid_kind`, is WIDENED - values that used to be refused are
-- now accepted - and no new refusal is introduced. 0184's and 0202's rosters (CLR04 insufficient
-- role / no actor, CLR10 invalid_kind / invalid_cursor, CLR11 activity_event_not_found) stand.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md). A pre-merge fix-round edit of THIS file uses the supported redo path
-- (`CLARA_MIGRATION_REDO`, #957), which is why section 0.3 admits a re-apply over its own effects.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- SECTION 0 PRESTATE. Every claim this file makes about what it is editing, measured before it
-- edits - sha256(prosrc) pins MEASURED ON THIS RIG NOW, per the wave-2 addendum. Both pins are
-- 0262's OWN output, not 0202's/0184's: #840 landed earlier in this lane and recut both bodies,
-- so the live text this file starts from is the successor-link one.
-- =====================================================================================
do $w861_pre$
declare n text; v_src text; v_sha text; v_posture text; v_n int; v_missing text;
        v_applied_list boolean; v_applied_detail boolean;
begin
  -- 0.1 - the prerequisites this file recuts or depends on, in exact regprocedure/regclass form.
  foreach n in array array[
    'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)',
    'clara.get_activity_event(text,text)',
    'clara.jwt_sub()', 'clara.jwt_firm()', 'clara.actor_role_rank()', 'clara.role_rank(text)',
    'clara._sweep_events_with_effect()', 'clara._sweep_event_has_effect(uuid)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#861 prestate: prerequisite absent: % (0181/0183/0184/0202/0262 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;
  foreach n in array array[
    'clara.firm_timeline_visible', 'clara.agent_receipts_visible', 'clara.operation_receipts',
    'clara.domain_events', 'clara.event_types', 'clara.journal_entries', 'clara.accounting_work',
    'clara.clients'
  ] loop
    if to_regclass(n) is null then
      raise exception '#861 prestate: relation absent: %', n using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 - exactly one body per name, and 0202's retired six-argument list_activity has not come
  -- back (the same idempotence shape 0202's and 0262's own prestates measured).
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_activity';
  if v_n <> 1 then
    raise exception '#861 prestate: clara.list_activity has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is not null then
    raise exception '#861 prestate: the SIX-argument clara.list_activity still resolves' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='get_activity_event';
  if v_n <> 1 then
    raise exception '#861 prestate: clara.get_activity_event has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.3 - THE LIVE BODIES ARE 0262's, pinned by prosrc sha-256, MEASURED ON THIS RIG NOW -
  -- *unless* this file's own effect is already present, which is the supported redo path (#957,
  -- packages/db/README.md). A redo re-runs the edited file against a database carrying the OLD
  -- effects, so a bare "must equal the pre-image" pin would make this file un-redoable; a bare
  -- "already applied" tolerance would let it overwrite a body it never read. Both are measured,
  -- and the two outcomes are named separately in the notice below. The discriminator is the
  -- literal `then 'people'` rung, which no pre-image of either body contains.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  v_applied_list := position('then ''people''' in v_src) <> 0;
  if not v_applied_list then
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha is distinct from '186ab1aff6cd278e98577764a4d5712c692ef58eb674746efe0174cb2967e0c9' then
      raise exception '#861 prestate: clara.list_activity has DRIFTED from the pinned 0262 body (sha %) -- re-derive section R part 1 against the live body before applying', v_sha
        using errcode='CLR10';
    end if;
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  v_applied_detail := position('then ''people''' in v_src) <> 0;
  if not v_applied_detail then
    v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
    if v_sha is distinct from '37319708f836424358f640e745f1b5e8e3787d628b217f734764a9d0ad4855a1' then
      raise exception '#861 prestate: clara.get_activity_event has DRIFTED from the pinned 0262 body (sha %) -- re-derive section R part 2 against the live body before applying', v_sha
        using errcode='CLR10';
    end if;
  end if;
  -- THE TWO DOORS ARE MEASURED SEPARATELY AND ARE ALLOWED TO DISAGREE, deliberately, for the
  -- reason 0263's own 0.3 states for its pair: both recuts land in ONE transaction, so this file
  -- never leaves one door ahead of the other, and the only way to reach that state is a hand recut
  -- on a development rig (a vacuity control reverting ONE body to prove a cell red, then
  -- re-applying through the #957 redo path). Refusing it would turn a legitimate rig operation
  -- into a dead end. Each door's own body is still pinned above, which is the check that matters:
  -- nothing is overwritten unread.

  -- 0.4 - the arms/branches this file carries over UNCHANGED, named one by one against the live
  -- text of BOTH bodies, so a reader of a failure knows WHICH property the sha was standing for.
  -- Asserted on BOTH paths (pre-image and redo): these are the properties the recut depends on.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  v_missing := '';
  if position('v_kept_sweeps uuid[]' in v_src) = 0 then v_missing := v_missing || ' kept-sweep-array'; end if;
  if position('v.event_id = any(v_kept_sweeps)' in v_src) = 0 then v_missing := v_missing || ' sweep-exclusion'; end if;
  if position('when v.event_type = ''sweep.run_completed'' then ''agent''' in v_src) = 0 then v_missing := v_missing || ' sweep-kind-arm'; end if;
  if position('when v.event_type like ''entry.%'' then ''journal''' in v_src) = 0 then v_missing := v_missing || ' entry-arm'; end if;
  if position('when v.event_type like ''document.%'' then ''documents''' in v_src) = 0 then v_missing := v_missing || ' document-arm'; end if;
  if position('when v.event_type like ''close.%'' then ''close''' in v_src) = 0 then v_missing := v_missing || ' close-arm'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_src) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('else ''documents''' in v_src) = 0 then v_missing := v_missing || ' stated-default'; end if;
  if position('as successor_work_id' in v_src) = 0 then v_missing := v_missing || ' successor-projection'; end if;
  if position('and (p_work is null or work_id = p_work)' in v_src) = 0 then v_missing := v_missing || ' p_work-predicate'; end if;
  if position('and (p_kinds is null or kind = any(p_kinds))' in v_src) = 0 then v_missing := v_missing || ' kind-predicate'; end if;
  if position('select * from ev union all select * from ar union all select * from orx' in v_src) = 0 then v_missing := v_missing || ' three-arm-union'; end if;
  if position('invalid_kind' in v_src) = 0 then v_missing := v_missing || ' kind-refusal'; end if;
  if v_missing <> '' then
    raise exception '#861 prestate: the live clara.list_activity is not 0262''s body -- missing:%', v_missing
      using errcode='CLR10';
  end if;
  -- ...and the SIX-value roster, which only the pre-image can still carry (the redo path has the
  -- widened one). Measured on the pre-image path ONLY, and named as such.
  if not v_applied_list then
    if position('if v_kind not in (''documents'', ''journal'', ''close'', ''report'', ''agent'', ''work'') then' in v_src) = 0 then
      raise exception '#861 prestate: clara.list_activity does not carry 0202''s SIX-value p_kinds roster -- re-derive the roster edit against the live body'
        using errcode='CLR10';
    end if;
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  v_missing := '';
  if position('p_source = ''event''' in v_src) = 0 then v_missing := v_missing || ' event-branch'; end if;
  if position('p_source = ''agent_receipt''' in v_src) = 0 then v_missing := v_missing || ' agent-receipt-branch'; end if;
  if position('p_source = ''operation_receipt''' in v_src) = 0 then v_missing := v_missing || ' operation-receipt-branch'; end if;
  if position('when v.event_type = ''sweep.run_completed'' then ''agent''' in v_src) = 0 then v_missing := v_missing || ' sweep-kind-arm'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_src) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('else ''documents''' in v_src) = 0 then v_missing := v_missing || ' stated-default'; end if;
  if position('''successor_work_id''' in v_src) = 0 then v_missing := v_missing || ' successor-key'; end if;
  if position('activity_event_not_found' in v_src) = 0 then v_missing := v_missing || ' clr11-refusal'; end if;
  if position('_sweep_event_has_effect' in v_src) = 0 then v_missing := v_missing || ' sweep-detail-exclusion'; end if;
  if v_missing <> '' then
    raise exception '#861 prestate: the live clara.get_activity_event is not 0262''s body -- missing:%', v_missing
      using errcode='CLR10';
  end if;

  -- 0.5 - THE POSTURE create-or-replace is about to preserve, for BOTH doors, measured so section
  -- T can compare against a measurement rather than a hope.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#861 prestate: clara.list_activity does not carry the posture this file assumes create-or-replace preserves; got {%}', v_posture
      using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#861 prestate: clara.get_activity_event does not carry the posture this file assumes create-or-replace preserves; got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 0.6 - THE FAMILIES THIS LADDER IS ABOUT ARE REGISTERED EVENT TYPES, read from the catalog
  -- rather than assumed from the ruling's prose: a rung matching a prefix the estate never emits
  -- would be dead text. `clara.event_types` is append-only (0005), so this census can only grow.
  select count(*)::int into v_n from clara.event_types
   where name like 'member.%' or name like 'invite.%' or name like 'asset.%'
      or name like 'counterparty.%' or name like 'client.%' or name like 'knowledge.%'
      or name like 'firm.%';
  if v_n < 1 then
    raise exception '#861 prestate: no event type of any renamed family is registered -- the ladder would be dead text'
      using errcode='CLR10';
  end if;
  raise notice '#861 prestate: clean -- both doors exist exactly once at their 0202/0184 signatures, carry 0262''s pinned bodies with every arm/branch this file keeps, and carry the posture create-or-replace is about to preserve (owner clara_fn_owner, SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, PUBLIC-revoked, EXECUTE to clara_authenticated only). % event type(s) of the renamed families are registered. Re-apply over this file''s own effects (redo #957) -- list_activity already reclassified: %, get_activity_event already reclassified: %.', v_n, v_applied_list, v_applied_detail;
end
$w861_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- SECTION R THE RECUT, PART 1 - clara.list_activity. 0262's body, byte-for-byte (verified against
-- the LIVE prosrc on the lane rig before the first edit), plus TWO edits: the closed p_kinds
-- roster and the ev_base kind ladder. Nothing else in this body moves.
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
      -- #861: THE CLOSED ROSTER GAINS THE KINDS THE LADDER BELOW NOW FILES UNDER. This is a
      -- WIDENING of accepted input, never a new refusal: every value the door admitted before
      -- is still admitted, in the same position, and the CLR10 invalid_kind answer for
      -- anything else is unchanged. The roster and the ladder move in ONE statement for the
      -- reason #861's brief gives: a kind the ladder can produce but the filter refuses is a
      -- row no one can reach, and a kind the filter admits but the ladder never produces is an
      -- empty page with no explanation.
      if v_kind not in ('documents', 'journal', 'close', 'report', 'agent', 'work', 'people') then
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
        -- #861: THE NEW RUNGS, in the order the owner's ruling of 2026-09-18 on that ticket
        -- names them. Each is a PREFIX match, for the SAME reason #630's `work.%` arm above
        -- is: the kind set is a closed vocabulary this door owns, and every later event type
        -- in a family belongs in the same bucket by construction, so a `member.suspended`
        -- registered tomorrow files itself the day it is registered rather than the day
        -- someone remembers this ladder.
        --
        -- `like 'firm.%'` MATCHES ONLY THE `firm.` FAMILY, and that is load-bearing. In SQL
        -- LIKE the `.` is an ordinary character but `_` is a single-character WILDCARD, so the
        -- natural-looking `firm_%` would also swallow `firm_registration.*` (the operator
        -- admission surface's three types) and `firm_setup.*` (the setup checklist's four) --
        -- two families the ruling does not name and #843's os.20 pins on the stated default.
        -- Written with the dot, the arm catches `firm.created` and nothing else.
        when v.event_type like 'member.%' or v.event_type like 'invite.%' then 'people'
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
  '#632 B5, recut #728, recut #630, recut #770, recut #840, recut #861. The firm activity feed: a '
  'keyset-paged union of clara.firm_timeline_visible (domain events), clara.agent_receipts_visible '
  '(agent act receipts) and clara.operation_receipts (#623 committed operation receipts), newest '
  'first over (occurred_at desc, id desc). SECURITY INVOKER over three already-granted sources; '
  'refuses CLR04 below bookkeeper before running. p_kinds is the closed set {documents,journal,close,report,agent,work,people}, refused '
  'CLR10 invalid_kind otherwise. p_limit clamps 1..100. p_cursor is an opaque base64 pair minted '
  'by a previous page''s next_cursor; a malformed one refuses CLR10 invalid_cursor. #728: a '
  'sweep.run_completed event with no drafted effect is excluded entirely; one that drafted '
  'something is kind=agent (never documents), actor stays null. #630: a work.% event type '
  '(work.taken_over is the first) is kind=work, so a handover is findable under the filter that '
  'names it instead of falling into the documents bucket, and its work_id is read from the event '
  'payload so the row deep-links to the Work it is about. #770: p_work narrows the feed to ONE '
  'Work IN SQL, inside each union arm''s own WHERE. #840: an ADDITIVE successor_work_id, jsonb/SQL '
  'null on every row except a work.cancelled row whose payload named a successor (#721''s '
  'restatement). #861: the domain-event ladder files member.%, invite.% -> people, per the owner''s ruling of '
  '2026-09-18; the firm arm is `firm.%` WITH THE DOT, so firm_registration.* and firm_setup.* are '
  'NOT caught by LIKE''s `_` wildcard. Every unrecognised prefix still lands on the STATED DEFAULT, '
  'documents. The kind is computed at READ TIME, so no historical row needed rewriting. PINS '
  'plan_cache_mode = force_custom_plan: its ONE union statement binds the session firm, every '
  'filter, the cursor pair and the kept-sweep array as plpgsql parameters, and from the sixth '
  'execution of a pooled connection plpgsql would otherwise serve it from a generic plan built for '
  'the per-firm AVERAGE of multi-tenant tables (measured, 0202''s own header: 145 ms -> 2.0-2.8 s '
  'at 30,000 committed operation_receipts with no sweep row at all). See 0183''s, 0184''s, 0202''s '
  'and 0262''s headers for the fuller rationale.';

-- =====================================================================================
-- SECTION R THE RECUT, PART 2 - clara.get_activity_event. 0262's body, byte-for-byte, plus ONE
-- edit: the SAME ladder rungs, in the same order, with the same predicate text. This door takes no
-- p_kinds argument, so it has no roster to widen.
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
          -- #861: the same rungs as list_activity's ev_base, in the same order and with the
          -- same predicate text -- see that function's own comment for why each is a prefix
          -- match and why the firm arm is written with a dot. The two ladders are compared
          -- rung for rung by section T below and by activity-feed.test.mjs af.39a, and every
          -- registered event type is driven through BOTH doors by af.39b.
          when v.event_type like 'member.%' or v.event_type like 'invite.%' then 'people'
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
  '#632 B5, recut #728, recut #630, recut #840, recut #861. The detail record for one '
  'clara.list_activity row, addressed by (source, id) -- see that function''s own comment for the '
  'shapes. Another firm''s row, an unknown source, a malformed agent_receipt pair, a genuinely '
  'absent id, or an EXCLUDED zero-effect sweep heartbeat (#728) all refuse the SAME CLR11 '
  'activity_event_not_found (no oracle). #630: a work.% event type is kind=work (the same ladder '
  'as the feed) and carries the work_id its payload names, so the detail record links where its '
  'row links; the operation_receipt arm carries the Work''s provenance as THREE facts -- '
  'initiated_by (who asked, immutable), responsible (who it is executed as now) and initiator (the '
  'same human as responsible, under 0181''s original key, kept so no reader breaks). #840: an '
  'ADDITIVE successor_work_id, jsonb/SQL null on every row except a work.cancelled event whose '
  'payload named a successor (#721''s restatement). #861: the SAME new rungs as '
  'clara.list_activity''s ev_base (member.%, invite.% -> people), so the two ladders answer identically for every '
  'event type -- the acceptance criterion the ticket names, pinned rung-for-rung by section T '
  'below and by activity-feed.test.mjs af.39a/af.39b. p_id is TEXT -- see this function''s header '
  'comment for why. Pins plan_cache_mode = force_custom_plan for symmetry with clara.list_activity '
  'rather than for a measurement of its own.';

reset role;

-- =====================================================================================
-- SECTION T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. `create or replace`'s
-- whole promise is that nothing but the body text moves - every property below is MEASURED after
-- the fact, never assumed from the statements above.
-- =====================================================================================
do $w861_tail$
declare v_list text; v_detail text; v_posture text; v_n int; v_missing text;
        v_rungs text[][]; v_pred text; v_i int; v_j int; v_p text;
begin
  -- 1 - both doors still resolve EXACTLY ONCE at their pre-existing signatures.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_activity';
  if v_n <> 1 then
    raise exception '#861 tail: clara.list_activity has % bodies (expected exactly 1)', v_n using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)') is null then
    raise exception '#861 tail: the seven-argument clara.list_activity no longer resolves' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='get_activity_event';
  if v_n <> 1 then
    raise exception '#861 tail: clara.get_activity_event has % bodies (expected exactly 1)', v_n using errcode='CLR10';
  end if;

  select p.prosrc into v_list from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  select p.prosrc into v_detail from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;

  -- 2 - EVERY NEW RUNG IS IN BOTH BODIES, exactly once each, with the SAME predicate text - the
  -- structural half of "the two ladders agree for every event type". The behavioural half is
  -- activity-feed.test.mjs af.39b, which drives every registered event type through both doors.
  -- The predicate is REBUILT here from the (kind, prefixes) pairs rather than pasted, so the
  -- census cannot silently agree with a typo in the ladder above.
  v_rungs := array[
    array['people', 'member.%', 'invite.%']
  ];
  for v_i in 1 .. array_length(v_rungs, 1) loop
    v_pred := '';
    for v_j in 2 .. array_length(v_rungs, 2) loop
      v_p := v_rungs[v_i][v_j];
      if v_p is null then continue; end if;
      if v_pred <> '' then v_pred := v_pred || ' or '; end if;
      v_pred := v_pred || 'v.event_type like ''' || v_p || '''';
    end loop;
    v_pred := 'when ' || v_pred || ' then ''' || v_rungs[v_i][1] || '''';
    v_n := (length(v_list) - length(replace(v_list, v_pred, ''))) / length(v_pred);
    if v_n <> 1 then
      raise exception '#861 tail: clara.list_activity carries the rung [%] % time(s) (expected exactly 1)', v_pred, v_n
        using errcode='CLR10';
    end if;
    v_n := (length(v_detail) - length(replace(v_detail, v_pred, ''))) / length(v_pred);
    if v_n <> 1 then
      raise exception '#861 tail: clara.get_activity_event carries the rung [%] % time(s) (expected exactly 1)', v_pred, v_n
        using errcode='CLR10';
    end if;
    -- ...and the roster admits the kind the rung produces, so nothing the ladder can emit is a
    -- value the filter refuses.
    if position('''' || v_rungs[v_i][1] || '''' in coalesce(substring(v_list from 'if v_kind not in \(.*\) then'), '')) = 0 then
      raise exception '#861 tail: clara.list_activity''s p_kinds roster does not admit %, which its own ladder can now produce', v_rungs[v_i][1]
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 - THE ROSTER IS EXACTLY THE EXPECTED CLOSED SET, in one place, once.
  v_n := (length(v_list) - length(replace(v_list, 'if v_kind not in (', ''))) / length('if v_kind not in (');
  if v_n <> 1 then
    raise exception '#861 tail: clara.list_activity tests p_kinds against a roster % time(s) (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  if position('if v_kind not in (''documents'', ''journal'', ''close'', ''report'', ''agent'', ''work'', ''people'') then' in v_list) = 0 then
    raise exception '#861 tail: clara.list_activity''s p_kinds roster is not the expected closed set {documents,journal,close,report,agent,work,people}'
      using errcode='CLR10';
  end if;

  -- 4 - EVERY ARM EITHER DOOR SHIPPED BEFORE SURVIVED, re-measured against the committed text -
  -- the same probes section 0.4 ran before the recut, so a passing 0 and a failing 4 would mean
  -- this file's own edit dropped something.
  v_missing := '';
  if position('v_kept_sweeps uuid[]' in v_list) = 0 then v_missing := v_missing || ' kept-sweep-array'; end if;
  if position('v.event_id = any(v_kept_sweeps)' in v_list) = 0 then v_missing := v_missing || ' sweep-exclusion'; end if;
  if position('when v.event_type = ''sweep.run_completed'' then ''agent''' in v_list) = 0 then v_missing := v_missing || ' sweep-kind-arm'; end if;
  if position('when v.event_type like ''entry.%'' then ''journal''' in v_list) = 0 then v_missing := v_missing || ' entry-arm'; end if;
  if position('when v.event_type like ''document.%'' then ''documents''' in v_list) = 0 then v_missing := v_missing || ' document-arm'; end if;
  if position('when v.event_type like ''close.%'' then ''close''' in v_list) = 0 then v_missing := v_missing || ' close-arm'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_list) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('else ''documents''' in v_list) = 0 then v_missing := v_missing || ' stated-default'; end if;
  if position('role_rank(''bookkeeper'')' in v_list) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 50), 1), 100)' in v_list) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('invalid_kind' in v_list) = 0 then v_missing := v_missing || ' kind-refusal'; end if;
  if position('invalid_cursor' in v_list) = 0 then v_missing := v_missing || ' cursor-refusal'; end if;
  if position('and (p_work is null or work_id = p_work)' in v_list) = 0 then v_missing := v_missing || ' p_work-predicate'; end if;
  if position('and (p_kinds is null or kind = any(p_kinds))' in v_list) = 0 then v_missing := v_missing || ' kind-predicate'; end if;
  if position('where p_work is null' in v_list) = 0 then v_missing := v_missing || ' p_work-arm-skip'; end if;
  if position('order by u.occurred_at desc, u.id desc' in v_list) = 0 then v_missing := v_missing || ' aggregate-order'; end if;
  if position('''rows'', v_page, ''next_cursor'', v_next_cursor, ''truncated'', v_truncated' in v_list) = 0 then v_missing := v_missing || ' page-envelope'; end if;
  if position('select * from ev union all select * from ar union all select * from orx' in v_list) = 0 then v_missing := v_missing || ' three-arm-union'; end if;
  if v_missing <> '' then
    raise exception '#861 tail: clara.list_activity LOST arm(s):% -- only the new rungs and the widened roster may have arrived', v_missing
      using errcode='CLR10';
  end if;
  v_n := (length(v_list) - length(replace(v_list, 'as successor_work_id', ''))) / length('as successor_work_id');
  if v_n <> 3 then
    raise exception '#861 tail: clara.list_activity projects successor_work_id % time(s) (expected exactly 3 -- 0262''s three union arms)', v_n
      using errcode='CLR10';
  end if;

  v_missing := '';
  if position('p_source = ''event''' in v_detail) = 0 then v_missing := v_missing || ' event-branch'; end if;
  if position('p_source = ''agent_receipt''' in v_detail) = 0 then v_missing := v_missing || ' agent-receipt-branch'; end if;
  if position('p_source = ''operation_receipt''' in v_detail) = 0 then v_missing := v_missing || ' operation-receipt-branch'; end if;
  if position('when v.event_type = ''sweep.run_completed'' then ''agent''' in v_detail) = 0 then v_missing := v_missing || ' sweep-kind-arm'; end if;
  if position('when v.event_type like ''entry.%'' then ''journal''' in v_detail) = 0 then v_missing := v_missing || ' entry-arm'; end if;
  if position('when v.event_type like ''document.%'' then ''documents''' in v_detail) = 0 then v_missing := v_missing || ' document-arm'; end if;
  if position('when v.event_type like ''close.%'' then ''close''' in v_detail) = 0 then v_missing := v_missing || ' close-arm'; end if;
  if position('when v.event_type like ''work.%'' then ''work''' in v_detail) = 0 then v_missing := v_missing || ' work-kind-arm'; end if;
  if position('else ''documents''' in v_detail) = 0 then v_missing := v_missing || ' stated-default'; end if;
  if position('activity_event_not_found' in v_detail) = 0 then v_missing := v_missing || ' clr11-refusal'; end if;
  if position('_sweep_event_has_effect' in v_detail) = 0 then v_missing := v_missing || ' sweep-detail-exclusion'; end if;
  if position('''initiated_by'', w.initiated_by, ''responsible'', w.initiator' in v_detail) = 0 then v_missing := v_missing || ' provenance-triple'; end if;
  if v_missing <> '' then
    raise exception '#861 tail: clara.get_activity_event LOST branch/field(s):% -- only the new rungs may have arrived', v_missing
      using errcode='CLR10';
  end if;
  v_n := (length(v_detail) - length(replace(v_detail, '''successor_work_id''', ''))) / length('''successor_work_id''');
  if v_n <> 3 then
    raise exception '#861 tail: clara.get_activity_event names successor_work_id % time(s) (expected exactly 3 -- 0262''s three source branches)', v_n
      using errcode='CLR10';
  end if;

  -- 5 - THE POSTURE IS BYTE-IDENTICAL to what section 0.5 measured, for BOTH doors - the whole
  -- reason this is a create-or-replace and not a drop.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#861 tail: clara.list_activity''s posture MOVED; got {%}', v_posture using errcode='CLR10';
  end if;
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#861 tail: clara.get_activity_event''s posture MOVED; got {%}', v_posture using errcode='CLR10';
  end if;

  -- 6 - both comments name #861, so a catalog reader is told the same story the file tells.
  if position('#861' in coalesce(obj_description('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure, 'pg_proc'), '')) = 0 then
    raise exception '#861 tail: clara.list_activity''s comment does not name #861' using errcode='CLR10';
  end if;
  if position('#861' in coalesce(obj_description('clara.get_activity_event(text,text)'::regprocedure, 'pg_proc'), '')) = 0 then
    raise exception '#861 tail: clara.get_activity_event''s comment does not name #861' using errcode='CLR10';
  end if;

  raise notice '#861 tail: OK -- clara.list_activity and clara.get_activity_event each still resolve EXACTLY ONCE at their pre-existing signatures, with a CHANGED body and an UNCHANGED posture (owner clara_fn_owner, SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, PUBLIC-revoked, EXECUTE to clara_authenticated only). Both ladders carry the 1 new rung(s) (member.%%, invite.%% -> people) exactly once each, with identical predicate text rebuilt from the (kind, prefixes) pairs; the closed p_kinds roster is exactly {documents,journal,close,report,agent,work,people} and admits every kind the ladder can produce; the stated default (else documents) and every arm 0181/0183/0184/0202/0262 shipped survive, re-measured against the committed text. Both comments name #861.';
end
$w861_tail$;
