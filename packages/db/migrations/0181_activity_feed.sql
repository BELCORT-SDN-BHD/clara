-- 0181_activity_feed — #632 (refresh spec #612 journey B5): the attributable Activity
-- feed. `/activity` today leads with a `NotBuiltNote` (CB-AE2E-018) and falls back to a flat,
-- unpaginated `agent_receipts_visible` list (`apps/web/components/firm/firm-activity-feed.tsx`).
-- This migration is the ONE new read surface the rebuilt page needs: a single, filterable,
-- keyset-paged union over the three sources the spec names as "attributable business records
-- and receipts" — the domain-event spine (already surfaced at `clara.firm_timeline_visible`,
-- 0174), agent act receipts (`clara.agent_receipts_visible`, 0103), and #623's operation
-- receipts (`clara.operation_receipts`, 0178) — plus one detail door.
--
-- ADDITIVE ONLY. Two new SECURITY INVOKER functions, zero new tables, zero altered tables,
-- zero recut function bodies. Every relation this file reads already exists on main and is
-- already granted to `clara_authenticated` (`clara.firm_timeline_visible` 0174:432,
-- `clara.agent_receipts_visible` 0103:1030ish via its own grant line, `clara.operation_receipts`
-- 0178:463, `clara.accounting_work` 0178:351, `clara.journal_entries` 0137:130's own citation of
-- `p_journal_entries_human`, `clara.clients` 0003:522-525) — this file does not widen a single
-- grant. Migrations 0180 (shared Work questions) and 0182 (manual journal evidence) are owned by
-- other lanes of the same refresh train; this file names none of their objects and must apply
-- whether or not either has landed in a given chain.
--
-- FRONTEND HOME (apps/web):
--   clara.list_activity(...)       -> apps/web/lib/firm/activity.ts (listActivity), read by
--                                     app/(firm)/activity/page.tsx and components/firm/activity/*
--   clara.get_activity_event(...)  -> the same lib file's getActivityEvent, read by the event
--                                     detail Sheet (`?event=<source>:<id>`)
--
-- WHY A NEW DOOR RATHER THAN THREE SEPARATE PAGE READS. The spec's shared control contract
-- (appendix C §2 B5) wants ONE feed, newest first, with ONE cursor and ONE set of filters; a page
-- that ran three independently-paged reads and merge-sorted them in the browser would have three
-- different "loading"/"stale"/"denied" states to reconcile and no way to express "load 20 more"
-- as a single request. The union lives in the database, where the sort and the keyset fence can
-- be enforced once instead of re-derived by every caller.
--
-- WHY SECURITY INVOKER, LIKE `clara.list_firm_timeline` (0174) AND UNLIKE MOST OF THIS ESTATE'S
-- DOORS. Every relation this union reads is ALREADY granted to `clara_authenticated` with its own
-- firm-scoped (and, for two of the three, bookkeeper-floored) RLS predicate — `jwt_firm()` and
-- `actor_role_rank()` read the SESSION's own JWT claims GUC regardless of which role is currently
-- executing, and `force row level security` on every one of these tables means even the owning
-- role could not silently see past that scope. Running as the caller lets each source's own
-- predicate bind directly, exactly as 0174's own door argues for `firm_timeline_visible`; this
-- door borrows no privilege it does not need, and a later narrowing of any ONE source's RLS
-- automatically narrows this feed too, rather than requiring this function to be revisited.
--
-- THE FLOOR IS INLINE, ONE BOOKKEEPER-FLOOR CHECK, FOR THE SAME STRUCTURAL REASON 0174:469-476
-- STATES FOR `list_firm_timeline`: an INVOKER body cannot call `clara._human_ctx(int)` (an
-- internal helper with no application-role EXECUTE grant), so the three checks below restate
-- `_human_ctx`'s own predicates against the helpers that ARE granted to `clara_authenticated`
-- (`jwt_sub`/`jwt_firm`/`actor_role_rank`/`role_rank`, 0004:760). This is a genuine floor: it
-- refuses CLR04 before the union ever runs, exactly like `list_firm_timeline`'s own door.
--
-- WHAT IS PRE-EXISTING AND NOT WIDENED BY THIS FILE, NAMED SO A READER DOES NOT MISTAKE IT FOR A
-- GAP THIS MIGRATION LEAVES OPEN. `clara.operation_receipts`, `clara.accounting_work` and
-- `clara.journal_entries` carry NO role-rank floor of their own (0178:349-351, 0178:461-463,
-- 0137:130) -- any `clara_authenticated` caller of THIS FIRM can already `select` those tables
-- directly today, with or without this migration. This door's inline bookkeeper floor governs
-- what a caller sees THROUGH clara.list_activity/get_activity_event; it is not, and cannot by
-- itself be, a new wall on the base tables. Narrowing those grants is a larger, cross-cutting
-- change this ticket's remit does not include.
--
-- THE THREE ARMS, AND THE COMMON PROJECTION EVERY ARM EMITS (18 columns, identically typed, so
-- `union all` type-checks): id (text — see below), source ('event'|'agent_receipt'|
-- 'operation_receipt'), event_type, description, client_id, actor, on_behalf_of, via_wake_kind,
-- occurred_at, object_kind, object_id, work_id, receipt_id (text), document_id,
-- original_entry_id, replacement_entry_id, status, kind (the closed filter group: 'documents' |
-- 'journal' | 'close' | 'report' | 'agent' | 'work' -- this migration's OWN grouping, not a
-- stored column; see each arm below for the mapping and its rationale).
--
--   (a) EVENT. `clara.firm_timeline_visible` (0174) is read rather than raw `clara.domain_events`
--       for the exact reason 0174's own header states: the raw spine's `payload` is unredacted
--       call payload and the view already drops it, floors at bookkeeper and joins
--       `event_types.description` -- the ONE sentence this feed is allowed to print for a domain
--       event (spec: "derive events... do not expose private model reasoning [or] internal task
--       names"). `id` is the event's own uuid (`domain_events.id`), rendered text. For an
--       object_kind='entry' row this arm joins `clara.journal_entries` (by the view's own
--       `object_id`) for the correction chain (`reversal_of`/`reversed_by` -> original/replacement)
--       and joins `clara.operation_receipts` (by `effects->>'entry_id'`) to resolve `work_id` when
--       a Work produced that entry -- exactly the two joins the work order names. kind: event_type
--       LIKE 'entry.%' -> 'journal'; LIKE 'document.%' -> 'documents'; LIKE 'close.%' -> 'close';
--       every other registered prefix (account./client./firm./wiki. -- chart/roster/knowledge
--       maintenance, none of which is a journal, document or close act) falls into 'documents' as
--       the broadest non-accounting-operation bucket. This is this migration's OWN closed
--       grouping (the work order asks the implementer to define one); it is not a claim that
--       every one of those prefixes IS a document.
--
--   (b) AGENT_RECEIPT. `clara.agent_receipts_visible` (0103) -- already firm/platform-scoped and
--       bookkeeper-floored by its own view. `description` is deliberately NULL here, never
--       `rationale`: the spec's own line is "do not expose... private model reasoning", and
--       `rationale` is exactly that (0103:269's own contract text, "the agent's stated
--       reasoning") -- the web renders a fixed label from the receipt_kind roster
--       (`lib/firm/receipt-kinds.ts`, already pinned against this registry), never this column.
--       `id` IS NOT A UUID for every member: `clara.freeform_read_log` (0002:309) has a BIGINT
--       identity primary key, so `agent_receipts_visible.receipt_id` (contract ordinal 2,
--       0103:260, "member PKs are uuid on some tables, bigint on others") is genuinely not
--       uuid-shaped for that one wired kind. Addressing a row therefore needs the PAIR
--       (receipt_kind, receipt_id), exactly as `apps/web/lib/firm/reads.ts`'s own
--       `getAgentReceipt` already establishes -- so `id` here is the colon-joined pair
--       `receipt_kind || ':' || receipt_id`, and `get_activity_event` below decodes it the same
--       way. object_kind/object_id are deliberately left NULL for this arm: `subject_id`
--       (0103:263, "the thing acted on... as text") has no single reliable type or object-kind
--       mapping across nine heterogeneous member kinds, and inventing one is exactly the "change
--       to the event taxonomy beyond what the union needs" the work order rules out of scope.
--       kind: receipt_kind='report_agent' -> 'report' (the one member that IS a report act);
--       every other registered receipt_kind -> 'agent'.
--
--   (c) OPERATION_RECEIPT. `clara.operation_receipts` (0178), `outcome='committed'` ONLY -- a
--       committed receipt is the spec's own "Work recorded an entry" observable event; a refused
--       attempt produced no accounting effect and belongs to Work's own B3 detail lifecycle
--       (#623), not to a feed of things that happened to the books. `id` is the receipt's own
--       uuid. `event_type` carries `clara.accounting_work.purpose` (currently always
--       'journal_entry', 0178:305's own CHECK) rather than a fabricated literal -- the spec text
--       explicitly whitelists "Work purposes" alongside event_types descriptions and receipt
--       kinds as material this feed may show, so the web renders a fixed label from the SAME slot
--       `description` would otherwise occupy, and `description` itself stays NULL. `object_kind`
--       is always 'entry' and `object_id` is `effects->>'entry_id'` (0178:437-438's own outcome-
--       shape CHECK guarantees a committed row always carries one). The correction chain and
--       `status` are resolved by the SAME journal_entries join as arm (a). kind: always 'work' --
--       this is the one arm the spec calls out by name as "work", distinct from 'journal' (which
--       is the entry.* domain-event lifecycle, whether or not a Work produced the entry).
--
-- THE ENTRY STATUS DERIVATION (shared by arms a/c and by get_activity_event), stated ONCE here
-- because it is inlined per-arm rather than factored into a callable helper (an INVOKER function
-- calling a second function would need that second function separately granted to
-- clara_authenticated, which would make a three-line pure string helper into its own PostgREST
-- RPC endpoint for no benefit): a journal entry's `status in ('draft','approved','withdrawn')`
-- (0007:1012-1014) plus `reversed_by`/`reversal_of`/`withdrawal_reason` maps onto the spec's FOUR
-- named states with no overlap --
--   'approved'   status='approved' and reversed_by is null           (standing, untouched)
--   'reversed'   status='approved' and reversed_by is not null       (has since been reversed)
--   'superseded' status='withdrawn' and withdrawal_reason=
--                'superseded-by-correction'                          (a losing draft mirror a
--                                                                      document correction
--                                                                      discarded in favour of a
--                                                                      different one it adopted --
--                                                                      0007:2580-2582/2603's own
--                                                                      literal reason string)
--   'withdrawn'  status='withdrawn' and any OTHER (or no) reason      (a plain draft withdrawal,
--                                                                      e.g. clara.withdraw_draft)
-- A row addressing a DRAFT entry that was never approved, reversed or withdrawn (e.g. an
-- 'entry.drafted' event before approval) falls through to the raw `je.status` value ('draft') --
-- an honest pass-through, not a fifth invented label.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not read a bare clock (`now()` /
-- `clock_timestamp()`): every timestamp in the union comes from stored data, `p_since`/`p_until`
-- are caller-supplied, and the keyset cursor round-trips a row's own `occurred_at`. There is
-- therefore no cell to add to `packages/db/tests/x42-s5-helpers.mjs`'s bare-clock roster --
-- `packages/db/tests/activity-feed.test.mjs` asserts this directly against both function bodies
-- rather than leaving it as an unchecked claim.
--
-- THE CURSOR. An opaque base64 string decoding to `<occurred_at::text>|<id>` -- Postgres' own
-- timestamptz text I/O is lossless to the microsecond, so encoding via `to_jsonb(...)->>` /
-- decoding via a plain `::timestamptz` cast round-trips exactly (unlike an epoch-double
-- encoding, which loses precision at exactly the resolution a same-microsecond tie needs). A
-- malformed cursor (bad base64, no pipe, an unparseable timestamp) is refused CLR10
-- `invalid_cursor`, never a raw decode exception.
--
-- `p_limit` is clamped 1..100 (tighter than `list_firm_timeline`'s 200: this door does THREE
-- table reads and a merge-sort per page, not one). Each arm applies every scalar filter
-- (client/kind/since/until/cursor) and its OWN `order by occurred_at desc, id desc limit
-- (p_limit+1)` BEFORE the union -- a standard top-k merge: the true global top-(limit+1) rows are
-- guaranteed to be a subset of the pooled per-arm top-(limit+1) candidates, so the outer
-- `order by ... limit (p_limit+1)` over the pooled ~3*(limit+1) rows is exactly correct, not an
-- approximation. Fetching one extra row is what lets `truncated`/`next_cursor` be computed
-- without a second round trip: when the pool holds more than `p_limit` rows after filtering, the
-- page is `truncated=true` and `next_cursor` is minted from the last INCLUDED row.

set local statement_timeout = '2min';
set local lock_timeout = '5s';

-- ==============================================================================================
-- 0. PRESTATE.
-- ==============================================================================================
do $pre$
declare v_missing text;
begin
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.firm_timeline_visible'), ('clara.agent_receipts_visible'),
                 ('clara.operation_receipts'), ('clara.accounting_work'),
                 ('clara.journal_entries'), ('clara.clients'), ('clara.event_types')) t(n)
   where to_regclass(t.n) is null;
  if v_missing is not null then
    raise exception 'activity_feed prestate: required relation(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_sub()'), ('clara.jwt_firm()'), ('clara.actor_role_rank()'),
                 ('clara.role_rank(text)')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'activity_feed prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname in ('list_activity', 'get_activity_event')
  ) then
    raise exception 'activity_feed prestate: list_activity/get_activity_event already exist'
      using errcode = 'CLR10';
  end if;
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. clara.list_activity — the feed. SECURITY INVOKER; see this file's header for why.
-- ==============================================================================================
create function clara.list_activity(
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
     and nullif(orr.effects->>'entry_id', '')::uuid = v.object_id
  ),
  ev as (
    select * from ev_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at <= p_until)
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
       and (p_until is null or occurred_at <= p_until)
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
      on je2.id = nullif(orr.effects->>'entry_id', '')::uuid and je2.firm_id = c.firm
    where orr.firm_id = c.firm and orr.outcome = 'committed'
  ),
  orx as (
    select * from orx_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at <= p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  unioned as (
    select * from ev union all select * from ar union all select * from orx
  )
  select coalesce(jsonb_agg(to_jsonb(u.*)), '[]'::jsonb) into v_all
    from (
      select * from unioned
       order by occurred_at desc, id desc
       limit v_limit + 1
    ) u;

  v_total := jsonb_array_length(v_all);
  v_truncated := v_total > v_limit;

  if v_truncated then
    select jsonb_agg(elem) into v_page
      from (
        select elem from jsonb_array_elements(v_all) with ordinality as t(elem, ord)
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
  '#632 B5. The firm activity feed: a keyset-paged union of clara.firm_timeline_visible '
  '(domain events), clara.agent_receipts_visible (agent act receipts) and '
  'clara.operation_receipts (#623 committed operation receipts), newest first over '
  '(occurred_at desc, id desc). SECURITY INVOKER over three already-clara_authenticated-granted '
  'sources; refuses CLR04 below bookkeeper before running. p_kinds is the closed set '
  '{documents,journal,close,report,agent,work}, refused CLR10 invalid_kind otherwise. p_limit '
  'clamps 1..100. p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a '
  'malformed one refuses CLR10 invalid_cursor. See this migration''s header for the full '
  'per-arm/kind-grouping/status-derivation rationale.';

-- ==============================================================================================
-- 2. clara.get_activity_event — the detail door. Same INVOKER posture, same inline floor.
--
-- `p_id` IS TEXT, NOT UUID, DELIBERATELY DEVIATING FROM A NAIVE `(text, uuid)` SIGNATURE.
-- Measured against the receipt member tables (see arm (b) above): `clara.freeform_read_log`
-- carries a BIGINT identity primary key, so `agent_receipts_visible.receipt_id` is not
-- uuid-shaped for that wired kind, and addressing an agent_receipt row needs the
-- `receipt_kind:receipt_id` PAIR `list_activity` mints as that arm's `id` (this file's header,
-- arm b). A uuid-typed parameter would make every such row's detail fetch raise a raw Postgres
-- `invalid_text_representation` error before this function's own body ever ran, instead of the
-- honest CLR11 no-oracle refusal every OTHER denied read in this door gets -- a real defect, not
-- a hypothetical one, so the signature is written against the measured shape rather than the one
-- a reader might otherwise expect. 'event' and 'operation_receipt' ids ARE genuine uuids
-- (domain_events.id, operation_receipts.id); they are compared as text here and cast back only
-- where already-server-authored (never on caller input), so no valid uuid loses precision and no
-- caller input is ever blindly cast.
create function clara.get_activity_event(p_source text, p_id text) returns jsonb
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
       and nullif(orr.effects->>'entry_id', '')::uuid = v.object_id
      left join clara.clients cl on cl.id = v.client_id and cl.firm_id = c.firm
     where v.event_id::text = p_id;

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
        on je2.id = nullif(orr.effects->>'entry_id', '')::uuid and je2.firm_id = c.firm
      left join clara.clients cl on cl.id = orr.client_id and cl.firm_id = c.firm
     where orr.id::text = p_id and orr.firm_id = c.firm and orr.outcome = 'committed';

  else
    raise exception 'unknown activity source' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'activity_source_unknown')::text;
  end if;

  if v_row is null then
    raise exception 'activity event not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
  end if;
  return v_row;
end $$;
comment on function clara.get_activity_event(text, text) is
  '#632 B5. The detail record for one clara.list_activity row, addressed by (source, id) -- see '
  'that function''s own comment for the shapes. Another firm''s row, an unknown source, a '
  'malformed agent_receipt pair or a genuinely absent id all refuse the SAME CLR11 '
  'activity_event_not_found (no oracle: a denied cross-firm id is indistinguishable from one that '
  'never existed). p_id is TEXT -- see this function''s header comment for why.';

-- ==============================================================================================
-- 3. GRANTS.
-- ==============================================================================================
revoke all on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) from public;
revoke all on function clara.get_activity_event(text, text) from public;

grant execute on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) to clara_authenticated;
grant execute on function clara.get_activity_event(text, text) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 4. TAIL POSTCHECK.
-- ==============================================================================================
do $tail$
declare v_n int; v_mode boolean;
begin
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is null then
    raise exception 'activity_feed tail: clara.list_activity is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.get_activity_event(text,text)') is null then
    raise exception 'activity_feed tail: clara.get_activity_event is absent' using errcode = 'CLR10';
  end if;

  select prosecdef into v_mode from pg_proc
   where oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'activity_feed tail: list_activity is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'activity_feed tail: get_activity_event is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;

  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'clara' and routine_name in ('list_activity', 'get_activity_event')
     and grantee = 'PUBLIC';
  if v_n <> 0 then
    raise exception 'activity_feed tail: PUBLIC holds an EXECUTE grant on a new activity function'
      using errcode = 'CLR10';
  end if;

  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = 'list_activity' and grantee = 'clara_authenticated';
  if v_n <> 1 then
    raise exception 'activity_feed tail: list_activity is not granted to clara_authenticated' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = 'get_activity_event' and grantee = 'clara_authenticated';
  if v_n <> 1 then
    raise exception 'activity_feed tail: get_activity_event is not granted to clara_authenticated' using errcode = 'CLR10';
  end if;

  raise notice 'activity_feed tail: OK -- clara.list_activity/get_activity_event both SECURITY '
    'INVOKER, PUBLIC-revoked, clara_authenticated-granted; no table altered, no grant widened.';
end $tail$;
