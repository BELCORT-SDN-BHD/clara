-- 0189_work_list_reads — #641 (refresh spec #612 journey B3): the server-backed Work LIST, its
-- addressed-row door, and the ONE new preferences key a saved view needs.
--
-- WHAT EXISTS TODAY AND WHY IT IS NOT ENOUGH. `/clients/:id/work` reads `clara.accounting_work`
-- directly through PostgREST (`apps/web/lib/work/reads.ts`'s `listAccountingWork`: a filtered GET
-- with `order=created_at.desc` and `limit=201`, 0178's own `p_accounting_work_read` policy doing
-- the scoping). That answers "this client's Work, newest first, capped" and nothing else: no
-- server-backed filters, no pagination beyond a truncation flag, no firm-wide read at all
-- (`/work` leads with a NotBuiltNote naming this ticket), and — the part a browser cannot fix —
-- no access to the two CANONICAL facts the journey's status vocabulary is derived from. AC2 asks
-- the list to represent "technically retrying" and "Needs you" from canonical Work and child
-- records; `attempts` lives in `clara.agent_tasks` (which carries NO grant to
-- `clara_authenticated` at all — humans read only the masked `clara.agent_tasks_visible`, which
-- does not republish `work_id`), and the parked question lives in `clara.agent_interruptions`.
-- A browser composing those from three reads would page them independently and could not sort
-- the result; the join belongs in the database.
--
-- ADDITIVE, PLUS ONE RECUT. Two new read doors, one new SECURITY DEFINER helper, ONE new index
-- (§0.5, the firm-wide ordering the list pages over), and a recut of `clara.save_my_preferences`
-- (0179) that adds EXACTLY ONE enumerated `interface` key. Zero new tables, zero altered tables,
-- zero new columns, zero new RLS policies, zero widened table grants. In particular
-- this file adds NO parent/child columns: batch Work (#636) owns that schema, and a list that
-- fabricated a child count from nothing would be the invented state #641 forbids.
--
-- FRONTEND HOME (apps/web):
--   clara.list_accounting_work(...)   -> apps/web/lib/work/work-list.ts (listAccountingWorkPage),
--                                        read by components/work/accounting-work-list.tsx on BOTH
--                                        /work (firm-wide) and /clients/:id/work
--   clara.get_accounting_work_row(..) -> the same lib file's getAccountingWorkRow — the ADDRESSED
--                                        row for a `?work=<id>` deep link (see §2)
--   clara.save_my_preferences(...)    -> apps/web/lib/settings/preferences.ts, now also carrying
--                                        the Work list's saved views
--
-- =============================================================================================
-- WHY SECURITY INVOKER FOR THE TWO DOORS, AND A SECURITY DEFINER HELPER BESIDE THEM.
--
-- The doors are INVOKER for exactly the reason 0181's `clara.list_activity` is: every relation
-- they read is ALREADY granted to `clara_authenticated` with its own forced, firm-scoped RLS
-- predicate — `clara.accounting_work` (0178:351, `firm_id = clara.jwt_firm()`),
-- `clara.agent_interruptions` (0006:741-742, the same predicate) and `clara.clients` (0003).
-- Running as the caller lets each source's own policy bind directly; this door borrows no
-- privilege it does not need, and a later narrowing of any one of those policies narrows this
-- list too rather than requiring this file to be revisited.
--
-- `clara.agent_tasks` is the exception, and it is the SAME exception 0183 hit with
-- `clara.sweep_runs`: the table carries no `clara_authenticated` grant whatsoever (0006:780
-- grants it to `clara_runtime` only; humans get the masked `clara.agent_tasks_visible`, 0006:684,
-- which deliberately does not republish `work_id`), so an INVOKER body would hit a raw
-- `permission denied for table agent_tasks`. Two ways to close that were weighed, exactly as
-- 0183 weighed its own: (1) widen the base table's grant — rejected, because it would hand every
-- bookkeeper direct SELECT on the runtime's task spine including columns the masked view exists
-- to withhold; (2) ONE narrow SECURITY DEFINER helper that answers only the question the list
-- asks. This file takes (2). `clara._work_run_attempts(uuid[])` carries the doors' OWN bookkeeper
-- floor (`clara._human_ctx`) and is self-scoped to the session firm INSIDE its body, so no
-- argument can make it answer for another firm and no caller the doors would refuse can reach
-- it — which matters because a leading underscore hides nothing from PostgREST (0181's own
-- caveat) and it is granted.
--
-- IT TAKES THE PAGE'S ids, NOT THE WHOLE FIRM. 0183's helper is set-shaped over the firm because
-- its caller needs the firm-wide exclusion set; this one is asked about at most `p_limit + 1`
-- Works (100 + 1 at the ceiling), so a bounded array parameter is both the smaller read and the
-- one whose cost cannot grow with a firm's history.
--
-- PLAN CACHE. All three new functions pin `set plan_cache_mode = force_custom_plan`, 0183's own
-- house rule and for its own measured reason: each body binds the session firm, the caller's
-- filters and the cursor pair as plpgsql parameters, and plpgsql flips to a generic plan from the
-- SIXTH call of a pooled connection — which on a multi-tenant table is planned for the per-firm
-- average rather than for this firm.
--
-- =============================================================================================
-- THE ROW SHAPE, AND WHAT IS DELIBERATELY ABSENT FROM IT.
--
-- Every field below is a COLUMN or a direct projection of one; nothing is derived, scored or
-- summed. In particular there is NO MONEY on a list row — not a basis total, not a line count.
-- `components/work/accounting-work-list.tsx`'s own header states the rule and it survives this
-- rewrite: a list of operations is not a ledger, and a total computed over a basis, sitting in a
-- list row, is a number this estate derived where a reader would take it for a posted amount.
-- The detail page renders the money, once, with its own labels. `memo` and `posting_date` ARE
-- carried, because both are literal values the admitted basis holds and a Work list that could
-- not say what a Work is about would be a list of uuids.
--
--   id, client_id, client_name        -- whose books; the NAME comes from the door because a
--                                        firm-wide list spanning 100 clients must not resolve
--                                        100 ids against a second register read
--   purpose, status                   -- 0178's own CHECK vocabularies, verbatim
--   initiator, initiated_by,          -- #630's two facts: who it RUNS AS, and who ASKED
--   initiator_role                       (the admission-time authority snapshot, for display).
--                                        `p_initiator` filters `coalesce(initiated_by, initiator)`
--                                        — WHO ASKED, the same expression the "Entered by" column
--                                        renders — never the mutable run authority a Take-over
--                                        moves, which would silently drop the very row whose
--                                        column still names the person the caller picked.
--   basis_origin                      -- 'user_direct' | 'clara_interpreted'. THIS is the answer
--                                        to #629's finding that a chat-originated Work is
--                                        reachable nowhere: it is listed like any other, and the
--                                        list says where it came from instead of hiding it
--   memo, posting_date, currency      -- from `basis`, the literal admitted values
--   source_ref_count                  -- how many sources back it (0 is a legitimate state)
--   current_task_id                   -- the run the detail page addresses
--   entry_id, receipt_id              -- from `result`, once there is one
--   error_code, error_reason          -- from `error`: the typed outcome, so the list can say WHY
--   attempts, current_run_status      -- the canonical retry signal (see the helper above)
--   pending_question_id,              -- the question it is parked on, if any: "Needs you" with
--   pending_question_version             a link straight to the thing that is waiting
--   created_at, updated_at
--
-- THE LABELS ARE THE BROWSER'S AND THEY ARE DERIVED FROM THESE FIELDS ALONE. #641's status
-- roster asks for words like "Executing", "Needs you" and "Retrying" that `accounting_work.status`
-- does not itself hold. This door emits the CANONICAL nine-member status plus the two signals
-- above and nothing else: "Retrying" is `status in ('queued','running') and attempts > 1`, and
-- "Needs you" is `awaiting_input`. Words with no canonical signal behind them — "blocked",
-- "partial", "runnable" — are not emitted by this door and must not be invented by a caller.
--
-- =============================================================================================
-- THE KEYSET, AND WHY THE CURSOR IS OPAQUE.
--
-- `(created_at desc, id desc)` over `ix_accounting_work_client (client_id, created_at desc)`
-- (0178:377) for a client-scoped read, and over `ix_accounting_work_firm_created
-- (firm_id, created_at desc, id desc)` — THIS FILE'S ONE NEW INDEX, §0.5 — firm-wide. The cursor is
-- base64 of `<created_at>|<id>` — the same encoding 0181 mints — and is round-tripped, never
-- decoded, by a caller. `id` is a real uuid here (unlike 0181's three-source union, where an
-- agent_receipt id is a `kind:id` pair), so the fence compares uuid to uuid rather than text to
-- text: the caller's half is cast INSIDE the malformed-cursor handler, so a hand-edited
-- `?cursor=` is a typed CLR10 rather than a raw `invalid_text_representation` the web has no
-- chance to turn into an honest state.
--
-- P_SINCE IS INCLUSIVE, P_UNTIL IS EXCLUSIVE — the same fence 0181 states, so two adjacent
-- windows tile the timeline without double-counting the instant they share.
--
-- P_STATUS IS VALIDATED AGAINST A CLOSED ROSTER; P_PURPOSE IS NOT. That asymmetry is deliberate
-- and is about who OWNS each vocabulary. `status`'s nine values are settled (0178:305-307) and a
-- token outside them is a caller defect that must be named, because a door answering `[]` for it
-- would look exactly like "no such Work". `purpose` carries ONE value today (`journal_entry`,
-- 0178:304) and concurrent lanes (#643, #631) are widening that CHECK; a second roster written
-- here would drift out of date the moment one of them lands, so this door filters on `purpose`
-- without asserting what the set is — an unknown purpose matches nothing and raises nothing.
--
-- P_Q MATCHES BY CONTAINMENT, NEVER BY A PATTERN BUILT FROM CALLER INPUT. `position(lower(q) in
-- lower(memo)) > 0` rather than `ilike '%' || q || '%'`: a `%` or `_` a person types into a
-- search box is a literal character they are looking for, and building a LIKE pattern out of it
-- would silently hand them a wildcard — on this estate, `%` alone would have matched every Work
-- in the firm.
--
-- =============================================================================================
-- WHAT THIS FILE DOES NOT DO.
--
-- It adds no parent/child/batch columns (#636 owns those), no plan awareness (#640 owns
-- `list_accounting_plan_occurrences`), and it does not touch `clara.list_activity` — the Work
-- detail's Activity view reads that door client-scoped and filters to the Work's own id, rather
-- than this file recutting a body two other lanes have already spliced.

-- ==============================================================================================
-- 0. PRESTATE.
-- ==============================================================================================
do $pre$
declare v_sha text; v_missing text;
begin
  if to_regclass('clara.accounting_work') is null then
    raise exception 'work_list_reads prestate: clara.accounting_work is absent (0178 has not applied)'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.agent_interruptions') is null then
    raise exception 'work_list_reads prestate: clara.agent_interruptions is absent' using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'clara' and table_name = 'agent_interruptions' and column_name = 'work_id'
  ) then
    raise exception 'work_list_reads prestate: agent_interruptions carries no work_id (0180 has not applied)'
      using errcode = 'CLR10';
  end if;

  select string_agg(n, ', ') into v_missing from (
    select n from unnest(array['jwt_sub','jwt_firm','actor_role_rank','role_rank','_human_ctx',
                               '_reserve_op','_finish_op']) as t(n)
     where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = 'clara' and p.proname = t.n)
  ) x;
  if v_missing is not null then
    raise exception 'work_list_reads prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara'
       and p.proname in ('list_accounting_work', 'get_accounting_work_row', '_work_run_attempts')
  ) then
    raise exception 'work_list_reads prestate: a work-list function already exists' using errcode = 'CLR10';
  end if;

  -- THE RECUT IS PINNED TO THE BODY IT WAS DERIVED FROM. `clara.save_my_preferences` is recut
  -- below by a FULL-BODY copy of 0179's text plus one new validation arm; if the live body is not
  -- the one this file was written against, the copy would silently DELETE whatever another lane
  -- had added. Measured on a chain at 0187: sha256 of prosrc.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure;
  if v_sha <> '3b927762708fc174ac68321b4b32bbf1e4cc37773be4a57fb61e4250598f8399' then
    raise exception 'work_list_reads prestate: clara.save_my_preferences has DRIFTED from the pinned 0179 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.user_preferences where interface ? 'workViews') then
    raise exception 'work_list_reads prestate: a workViews key is already stored, which no door could have written'
      using errcode = 'CLR10';
  end if;

  raise notice '#641 prestate: clean -- no work-list door exists, save_my_preferences is at its pinned 0179 body, and no workViews preference has ever been stored.';
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 0.5 THE FIRM-WIDE ORDERING INDEX. Additive, one index, no table altered.
--
-- MEASURED, not assumed (adversarial migration-safety review, 2026-09-14). Before this index
-- `clara.accounting_work` carried only `ix_accounting_work_client (client_id, created_at desc)`
-- (0178:367) and `uq_accounting_work_intent (firm_id, client_id, intent_key)` (0178:336). The
-- CLIENT-scoped read is served by the first; the FIRM-WIDE read — which is what `/work` is, and
-- the surface this ticket exists to build — had no ordered path at all: the planner bound the firm
-- through `uq_accounting_work_intent`'s leading column and then TOP-N HEAPSORTED the firm's whole
-- Work, on EVERY page, cursor or not. The keyset fence does not help there, because a fence still
-- has to be sorted before it can be cut.
--
-- THE KEY TUPLE IS THE ORDER BY TUPLE, EXACTLY — `(firm_id, created_at desc, id desc)`. A
-- `(firm_id, created_at desc)` cut would order the page but leave the id tie-break to a sort, and
-- this door's own determinism cell (a whole page admitted in ONE transaction shares one
-- `created_at` to the microsecond) is precisely the case where that tie-break decides the page.
-- MEASURED on the rig with this index present, as `clara_authenticated`, with the firm's RLS
-- predicate binding: `Limit -> Index Only Scan using ix_accounting_work_firm_created,
-- Index Cond: (firm_id = clara.jwt_firm())` — no Sort node at all.
--
-- `if not exists` because the estate's merge order is not this file's to assume, and an index is
-- the one object where "already there" is a lawful state rather than a drift. `clara_fn_owner`
-- owns the table (the role this file has already assumed), so no ownership change is needed —
-- 0183's own note for the same move — and it is built WITHOUT `concurrently`, which is what keeps
-- this migration ONE transaction.
-- ==============================================================================================
create index if not exists ix_accounting_work_firm_created
  on clara.accounting_work (firm_id, created_at desc, id desc);
comment on index clara.ix_accounting_work_firm_created is
  '#641 B3. The FIRM-WIDE keyset for clara.list_accounting_work: the key tuple is that door''s '
  'ORDER BY tuple exactly -- (firm_id, created_at desc, id desc) -- so an unfiltered /work page is '
  'an ordered index scan cut at p_limit+1 rather than a top-N heapsort over the firm''s whole '
  'Work. The id column is part of the KEY, not a decoration: a page admitted in one transaction '
  'shares one created_at to the microsecond, which is the case where the tie-break decides the '
  'page. The client-scoped read keeps ix_accounting_work_client (0178:367).';

-- ==============================================================================================
-- 1. clara._work_run_attempts — the ONE fact the INVOKER doors cannot reach. See the header.
-- ==============================================================================================
create function clara._work_run_attempts(p_works uuid[])
  returns table (work_id uuid, attempts int, current_run_status text)
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare c record;
begin
  -- The doors' OWN floor, restated here because this helper is granted and therefore reachable
  -- directly. A caller `clara.list_accounting_work` would refuse can never reach it either.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));

  -- THE PAGE BOUND IS ENFORCED, NOT MERELY DOCUMENTED (adversarial migration-safety review,
  -- 2026-09-14). A leading underscore hides nothing from PostgREST (0181's own caveat) and this
  -- helper is granted, so it is reachable directly with an array of ANY size: measured as a
  -- bookkeeper, 1 000 ids cost 22 ms, 100 000 cost 820 ms and 1 000 000 cost 5 623 ms of server
  -- CPU — for an answer no door would ever ask for. Both doors ask about at most `p_limit + 1`
  -- Works (100 + 1 at the ceiling), so 101 is the whole legitimate range and anything past it is
  -- a caller defect that must be NAMED rather than served. A null array is refused for the same
  -- reason: neither door can produce one, so it is never the honest empty answer it looks like.
  if p_works is null or coalesce(array_length(p_works, 1), 0) > 101 then
    raise exception 'work id list must carry at most 101 ids' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_work_ids')::text;
  end if;

  return query
    select w.id,
           count(t.id)::int,
           max(t.status) filter (where t.id = w.current_task_id)
      from clara.accounting_work w
      left join clara.agent_tasks t on t.work_id = w.id
     where w.id = any(p_works)
       -- SELF-SCOPED TO THE SESSION FIRM inside the body: no argument can make a DEFINER helper
       -- answer for another firm, so the array a caller hands it is a request, never an oracle.
       and w.firm_id = c.firm
     group by w.id, w.current_task_id;
end $$;
comment on function clara._work_run_attempts(uuid[]) is
  '#641 B3. How many runs each named Work has had, and the status of its CURRENT run. SECURITY '
  'DEFINER because clara.agent_tasks carries no clara_authenticated grant at all (humans read the '
  'masked clara.agent_tasks_visible, which does not republish work_id) -- the same gap 0183 closed '
  'for clara.sweep_runs with the same shape. Floored at bookkeeper by clara._human_ctx and '
  'self-scoped to clara.jwt_firm() inside the body, so no argument reaches another firm. BOUNDED '
  'by the caller''s page and it ENFORCES that bound: a null array or more than 101 ids (the '
  'doors'' own p_limit+1 ceiling) refuses CLR10 invalid_work_ids, because this helper is granted '
  'and therefore PostgREST-reachable directly. Projects only what the two doors read (attempts + '
  'the current run''s status). Pins plan_cache_mode = force_custom_plan.';

-- ==============================================================================================
-- 2. clara.list_accounting_work — the list. SECURITY INVOKER; see the header for why.
-- ==============================================================================================
create function clara.list_accounting_work(
  p_client    uuid        default null,
  p_status    text[]      default null,
  p_initiator uuid        default null,
  p_purpose   text[]      default null,
  p_since     timestamptz default null,
  p_until     timestamptz default null,
  p_q         text        default null,
  p_cursor    text        default null,
  p_limit     int         default 25
) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  c record;
  v_limit int;
  v_cursor_ts timestamptz := null;
  v_cursor_id uuid := null;
  v_decoded text;
  v_pipe int;
  v_status text;
  v_purpose text;
  v_status_f text[];
  v_purpose_f text[];
  v_q text;
  v_ids uuid[];
  v_all jsonb;
  v_total int;
  v_truncated boolean;
  v_page jsonb;
  v_last jsonb;
  v_next_cursor text;
begin
  -- The inline floor, for the same structural reason 0181:0174 state: an INVOKER body cannot call
  -- clara._human_ctx (an internal helper with no application-role EXECUTE grant), so this
  -- restates its three predicates against the helpers that ARE granted to clara_authenticated.
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

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);

  -- AN EMPTY ARRAY IS "NO FILTER ON THIS AXIS", not "match nothing". A URL that carries
  -- `?status=` with no value parses to an empty list on the web side, and a door that answered an
  -- empty PAGE for it would look exactly like "this firm has no Work" -- the one thing the Empty
  -- taxonomy must never confuse. `array_length(x, 1) is null` is the honest test: it is null for
  -- `{}` as well as for NULL.
  v_status_f := case when array_length(p_status, 1) is null then null else p_status end;
  v_purpose_f := case when array_length(p_purpose, 1) is null then null else p_purpose end;

  -- A NULL ELEMENT IS A CALLER DEFECT, NOT A FILTER (adversarial migration-safety review,
  -- 2026-09-14). `v_status not in (…)` evaluates to NULL for a NULL element, so a bare
  -- `if v_status not in (…)` fell through — and `= any(array[null])` then matches nothing, which
  -- answered `rows=0`: the exact "`[]` looks like *no such Work*" failure the roster check exists
  -- to refuse. `v_status is null or …` is the honest test. The same hazard reaches `p_purpose`,
  -- whose VOCABULARY this door deliberately does not own (0178's CHECK does) — so its elements are
  -- checked for being present at all, and for nothing else.
  if v_status_f is not null then
    foreach v_status in array v_status_f loop
      if v_status is null
         or v_status not in ('queued','running','awaiting_input','stopping','completed','refused',
                             'failed','cancelled','expired') then
        raise exception 'unknown work status %', coalesce(v_status, '<null>') using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_status', 'status', v_status)::text;
      end if;
    end loop;
  end if;

  if v_purpose_f is not null then
    foreach v_purpose in array v_purpose_f loop
      if v_purpose is null then
        raise exception 'a null purpose is not a filter' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_purpose')::text;
      end if;
    end loop;
  end if;

  v_q := nullif(btrim(coalesce(p_q, '')), '');

  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_pipe := position('|' in v_decoded);
      if v_pipe < 2 or v_pipe = length(v_decoded) then
        raise exception 'malformed cursor shape';
      end if;
      v_cursor_ts := substr(v_decoded, 1, v_pipe - 1)::timestamptz;
      v_cursor_id := substr(v_decoded, v_pipe + 1)::uuid;
      -- A NON-FINITE FENCE IS NOT A PAGE. `timestamptz` accepts the literals `infinity` and
      -- `-infinity`, and `-infinity` compares below every real row — so a hand-edited `?cursor=`
      -- carrying it answered a clean, well-formed EMPTY page, which is indistinguishable from
      -- "there is no more Work". No `next_cursor` this door mints is ever non-finite (it is
      -- `created_at`, a real clock reading), so this is a malformed cursor like any other.
      if v_cursor_ts = '-infinity'::timestamptz or v_cursor_ts = 'infinity'::timestamptz then
        raise exception 'non-finite cursor timestamp';
      end if;
    exception when others then
      raise exception 'malformed work cursor' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'invalid_cursor')::text;
    end;
  end if;

  -- PASS 1 — the page's own ids, under the keyset fence. Taken first so the DEFINER helper in
  -- pass 2 is asked about at most v_limit+1 Works rather than about the firm.
  select array_agg(x.id order by x.created_at desc, x.id desc) into v_ids
    from (
      select w.id, w.created_at
        from clara.accounting_work w
       where (p_client is null or w.client_id = p_client)
         and (v_status_f is null or w.status = any(v_status_f))
         -- THE FILTER MATCHES THE COLUMN THE LIST ACTUALLY SHOWS (spec review, 2026-09-14). The
         -- "Entered by" column renders `initiated_by ?? initiator` — who ASKED, #630's frozen
         -- historical fact — while `initiator` is the MUTABLE current run authority a Take-over
         -- moves. Filtering the mutable one under the immutable one's label silently dropped the
         -- taken-over Work whose column still reads the person the caller picked, and admitted
         -- Work the new responsible never asked for. One expression, both places.
         and (p_initiator is null or coalesce(w.initiated_by, w.initiator) = p_initiator)
         and (v_purpose_f is null or w.purpose = any(v_purpose_f))
         and (p_since is null or w.created_at >= p_since)
         and (p_until is null or w.created_at < p_until)
         and (v_q is null or position(lower(v_q) in lower(coalesce(w.basis->>'memo', ''))) > 0)
         and (v_cursor_ts is null or (w.created_at, w.id) < (v_cursor_ts, v_cursor_id))
       order by w.created_at desc, w.id desc
       limit v_limit + 1
    ) x;

  if v_ids is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'next_cursor', null, 'truncated', false);
  end if;

  -- PASS 2 — the projection. `jsonb_agg(... order by ...)` INSIDE the aggregate call, never
  -- borrowed from the subquery's own order: an aggregate over a subquery may see its input in
  -- whatever order the planner chooses, and the page and its next_cursor must never be minted
  -- from an order the aggregate itself did not pin (0181's own measured note).
  select coalesce(jsonb_agg(to_jsonb(r.*) order by r.created_at desc, r.id desc), '[]'::jsonb)
    into v_all
    from (
      select
        w.id                                      as id,
        w.client_id                               as client_id,
        cl.name                                   as client_name,
        w.purpose                                 as purpose,
        w.status                                  as status,
        w.initiator                               as initiator,
        w.initiated_by                            as initiated_by,
        w.initiator_role                          as initiator_role,
        w.basis_origin                            as basis_origin,
        w.basis->>'memo'                          as memo,
        w.basis->>'posting_date'                  as posting_date,
        w.basis->>'currency'                      as currency,
        coalesce(jsonb_array_length(w.source_refs), 0) as source_ref_count,
        w.current_task_id                         as current_task_id,
        nullif(w.result->>'entry_id', '')         as entry_id,
        nullif(w.result->>'receipt_id', '')       as receipt_id,
        nullif(w.error->>'code', '')              as error_code,
        nullif(w.error->>'reason', '')            as error_reason,
        coalesce(a.attempts, 0)                   as attempts,
        a.current_run_status                      as current_run_status,
        q.id                                      as pending_question_id,
        q.question_version                        as pending_question_version,
        w.created_at                              as created_at,
        w.updated_at                              as updated_at
      from clara.accounting_work w
      left join clara.clients cl on cl.id = w.client_id and cl.firm_id = w.firm_id
      left join clara._work_run_attempts(v_ids) a on a.work_id = w.id
      -- AT MOST ONE PENDING QUESTION PER WORK (0180's own ix_agent_interruptions_work_pending and
      -- its one-pending-row invariant). A lateral with `limit 1` rather than a bare join, so a
      -- second pending row — which no verb produces — could never duplicate a list row.
      left join lateral (
        select i.id, i.question_version
          from clara.agent_interruptions i
         where i.work_id = w.id and i.status = 'pending'
         order by i.question_version desc
         limit 1
      ) q on true
     where w.id = any(v_ids)
    ) r;

  v_total := jsonb_array_length(v_all);
  v_truncated := v_total > v_limit;

  if v_truncated then
    select jsonb_agg(t.elem order by t.ord) into v_page
      from (
        select elem, ord from jsonb_array_elements(v_all) with ordinality as e(elem, ord)
         where ord <= v_limit
      ) t;
    v_last := v_page -> (v_limit - 1);
    v_next_cursor := encode(
      convert_to((v_last->>'created_at') || '|' || (v_last->>'id'), 'UTF8'), 'base64');
  else
    v_page := v_all;
    v_next_cursor := null;
  end if;

  return jsonb_build_object('rows', v_page, 'next_cursor', v_next_cursor, 'truncated', v_truncated);
end $$;
comment on function clara.list_accounting_work(uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int) is
  '#641 B3. The Work list behind /work (firm-wide) and /clients/:id/work: keyset-paged over '
  '(created_at desc, id desc), filterable by client/status/initiator/purpose/[since,until)/free '
  'text, newest first. SECURITY INVOKER over clara.accounting_work, clara.agent_interruptions and '
  'clara.clients (all three already clara_authenticated-granted with firm-scoped RLS); refuses '
  'CLR04 below bookkeeper before reading. p_status is the closed nine-member roster, refused '
  'CLR10 invalid_status otherwise (a NULL element included); p_purpose''s VOCABULARY is NOT '
  'validated (0178''s CHECK owns it and concurrent lanes are widening it) so an unknown purpose '
  'matches nothing, but a NULL element is refused CLR10 invalid_purpose. p_initiator filters '
  'coalesce(initiated_by, initiator) -- WHO ASKED, the expression the Entered-by column renders -- '
  'not the mutable run authority a Take-over moves. p_q matches the '
  'basis memo by case-insensitive CONTAINMENT, never as a LIKE pattern. p_limit clamps 1..100. '
  'p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a malformed one '
  'refuses CLR10 invalid_cursor. Every row carries attempts + the pending question id/version so '
  'a caller''s status LABEL is derived from canonical state; no money is projected. See this '
  'migration''s header for the full rationale.';

-- ==============================================================================================
-- 3. clara.get_accounting_work_row — the ADDRESSED row, #719's own lesson.
--
-- A `?work=<id>` deep link (or the Work detail route arriving from a bookmark) names a row that
-- may be nowhere near the current page window: three pages down, or filtered out entirely by the
-- filters the URL also carries. A surface that could only see the current page would render a
-- not-found for a row the caller is perfectly entitled to read. This door answers the SAME
-- projection a list row carries, addressed by id alone.
--
-- NO ORACLE. Another firm''s id, a client this caller cannot see, and an id that never existed
-- all refuse the SAME CLR11 — a denied row is indistinguishable from an absent one, exactly as
-- clara.get_activity_event states for its own three sources.
-- ==============================================================================================
create function clara.get_accounting_work_row(p_work uuid) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare c record; v_row jsonb;
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

  if p_work is null then
    raise exception 'accounting work not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'accounting_work_not_found')::text;
  end if;

  select jsonb_build_object(
      'id', w.id, 'client_id', w.client_id, 'client_name', cl.name,
      'purpose', w.purpose, 'status', w.status,
      'initiator', w.initiator, 'initiated_by', w.initiated_by, 'initiator_role', w.initiator_role,
      'basis_origin', w.basis_origin,
      'memo', w.basis->>'memo', 'posting_date', w.basis->>'posting_date',
      'currency', w.basis->>'currency',
      'source_ref_count', coalesce(jsonb_array_length(w.source_refs), 0),
      'current_task_id', w.current_task_id,
      'entry_id', nullif(w.result->>'entry_id', ''),
      'receipt_id', nullif(w.result->>'receipt_id', ''),
      'error_code', nullif(w.error->>'code', ''),
      'error_reason', nullif(w.error->>'reason', ''),
      'attempts', coalesce(a.attempts, 0),
      'current_run_status', a.current_run_status,
      'pending_question_id', q.id,
      'pending_question_version', q.question_version,
      'created_at', w.created_at, 'updated_at', w.updated_at
    ) into v_row
    from clara.accounting_work w
    left join clara.clients cl on cl.id = w.client_id and cl.firm_id = w.firm_id
    left join clara._work_run_attempts(array[p_work]) a on a.work_id = w.id
    left join lateral (
      select i.id, i.question_version
        from clara.agent_interruptions i
       where i.work_id = w.id and i.status = 'pending'
       order by i.question_version desc
       limit 1
    ) q on true
   where w.id = p_work;

  if v_row is null then
    raise exception 'accounting work not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'accounting_work_not_found')::text;
  end if;
  return v_row;
end $$;
comment on function clara.get_accounting_work_row(uuid) is
  '#641 B3. ONE Work in the SAME projection clara.list_accounting_work emits, addressed by id '
  'alone -- the addressed row a deep link names, which may sit outside any page the caller has '
  'loaded (#719). Same INVOKER posture and same inline bookkeeper floor as the list. Another '
  'firm''s id, an unreadable one and an absent one all refuse the SAME CLR11 '
  'accounting_work_not_found (no oracle).';

-- ==============================================================================================
-- 4. clara.save_my_preferences — RECUT. A FULL-BODY copy of 0179's own text (pinned by sha in
--    §0) with EXACTLY ONE new arm: `interface.workViews`.
--
-- WHY A PREFERENCE AND NOT A TABLE. A saved view is a per-PERSON convenience over a URL this
-- estate already makes stable; it carries no authority, no scope and no accounting meaning, and
-- `clara.user_preferences` (0179) is already the one row per person that survives every firm they
-- join or leave. A table would add RLS, a writer, a reader and a lifecycle for something whose
-- entire content is a query string somebody liked.
--
-- THE SHAPE IS VALIDATED, NOT MERELY TYPED. 0179's own guarantee is that "no key and no value
-- reaches storage that is not named here"; a jsonb column would happily store a megabyte of
-- anything. `workViews` is an ARRAY of at most 20 objects, each carrying EXACTLY `id`, `name` and
-- `query` — ALL THREE PRESENT and all three strings — with a non-blank id (<=64 chars), unique
-- across the array once trimmed, a non-blank name (<=64), neither carrying a control character,
-- and a query of at most 512 characters. A view whose id repeated would make "delete this view"
-- ambiguous; a view with an unknown key would be a field the write accepted and no reader knows
-- about; a view with no `query` would be a write that succeeded and a view that never appeared,
-- because the web reader drops it. `reason` IS the field path (`interface.workViews`), the
-- one-taxonomy rule 0179 states, so the web's shared refusal parser can focus the control the
-- refusal names.
-- ==============================================================================================
create or replace function clara.save_my_preferences(p_expected_version int, p_patch jsonb, p_op_key text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record;                 -- (actor, firm) from _human_ctx
  v_dedupe jsonb;
  v_row record;
  v_patch_interface jsonb;
  v_patch_notifications jsonb;
  v_new_interface jsonb;
  v_new_notifications jsonb;
  v_key text;
  v_val jsonb;
  v_view jsonb;             -- #641: one element of interface.workViews
  v_ids text[];             -- #641: the view ids seen so far, for the uniqueness check
begin
  c := clara._human_ctx(clara.role_rank('viewer'));

  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'save_my_preferences', p_op_key,
    clara._hash(jsonb_build_object('actor', c.actor, 'expected_version', p_expected_version, 'patch', p_patch)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ---- validate shape and every key/value BEFORE touching the row ----------
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be a jsonb object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'patch_not_object')::text;
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_patch) k where k not in ('interface', 'notifications')
  ) then
    raise exception 'patch may only contain interface/notifications' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'unsupported_top_level_key')::text;
  end if;

  v_patch_interface := coalesce(p_patch->'interface', '{}'::jsonb);
  if jsonb_typeof(v_patch_interface) <> 'object' then
    raise exception 'interface patch must be an object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'interface_not_object')::text;
  end if;

  -- THE SUPPORTED SET, enumerated (no key/value reaches storage that is not
  -- named here — #626's "expose only persisted supported preferences" is a
  -- write-side guarantee, not merely a UI convention):
  --   interface.motion         'system' | 'reduced'
  --   interface.sidebarDefault 'expanded' | 'collapsed'
  --   interface.workViews      #641: [{id,name,query}] — see this migration's §4 header
  -- `reason` IS the field path, not a generic token + a separate `key` — the
  -- web's shared refusal parser (lib/wire.ts's `parseReasonToken`) surfaces
  -- ONLY `detail.reason` to a caller (independent review N2's one-taxonomy
  -- rule; every other detail field, e.g. a separate `key`, is discarded before
  -- it ever reaches a component). Folding the field path INTO `reason` is what
  -- lets `components/settings/account-settings.tsx` focus the exact control a
  -- refusal named, through the SAME mechanism every other door's refusal
  -- already rides, rather than a second, bespoke detail-parsing path.
  for v_key, v_val in select * from jsonb_each(v_patch_interface) loop
    if v_key = 'motion' then
      if (v_val #>> '{}') is distinct from 'system' and (v_val #>> '{}') is distinct from 'reduced' then
        raise exception 'unsupported value for interface.motion' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'interface.motion')::text;
      end if;
    elsif v_key = 'sidebarDefault' then
      if (v_val #>> '{}') is distinct from 'expanded' and (v_val #>> '{}') is distinct from 'collapsed' then
        raise exception 'unsupported value for interface.sidebarDefault' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'interface.sidebarDefault')::text;
      end if;
    elsif v_key = 'workViews' then
      -- #641. ONE refusal reason for every shape fault below, because `reason` IS the field path
      -- and a caller's remedy is the same in all of them: send a well-formed workViews array.
      if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) > 20 then
        raise exception 'interface.workViews must be an array of at most 20 saved views'
          using errcode = 'CLR10', detail = jsonb_build_object('reason', 'interface.workViews')::text;
      end if;
      -- ALL THREE KEYS ARE REQUIRED, `query` INCLUDED (adversarial migration-safety review,
      -- 2026-09-14). The first cut accepted a view carrying no `query` key at all
      -- (`coalesce(v_view->'query','""')`), which apps/web/lib/settings/preferences.ts's own
      -- reader then dropped on the way out — a write that succeeded and a view that silently
      -- never appeared. A saved view whose filters are absent is not a saved view.
      --
      -- AND THE ID IS COMPARED AS IT WILL BE USED. `"needs-rent"` and `" needs-rent "` are one
      -- view to every person and two rows to a naive `=`, which makes "delete this view"
      -- ambiguous in exactly the way the uniqueness rule exists to prevent; the dedupe is
      -- therefore on the TRIMMED id. A control character in an id or a name is refused outright:
      -- it is never something a person typed, it survives into a URL and a pill label, and no
      -- reader downstream is obliged to sanitise it.
      v_ids := array[]::text[];
      for v_view in select * from jsonb_array_elements(v_val) loop
        if jsonb_typeof(v_view) <> 'object'
           or exists (select 1 from jsonb_object_keys(v_view) k where k not in ('id','name','query'))
           or jsonb_typeof(v_view->'id') is distinct from 'string'
           or jsonb_typeof(v_view->'name') is distinct from 'string'
           or jsonb_typeof(v_view->'query') is distinct from 'string'
           or (v_view->>'id') ~ '^\s*$' or length(v_view->>'id') > 64
           or (v_view->>'name') ~ '^\s*$' or length(v_view->>'name') > 64
           or length(v_view->>'query') > 512
           or (v_view->>'id') ~ '[[:cntrl:]]' or (v_view->>'name') ~ '[[:cntrl:]]'
           or btrim(v_view->>'id') = any(v_ids) then
          raise exception 'unsupported value in interface.workViews' using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'interface.workViews')::text;
        end if;
        v_ids := v_ids || btrim(v_view->>'id');
      end loop;
    else
      raise exception 'unsupported interface preference key' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'interface.' || v_key)::text;
    end if;
  end loop;

  -- notifications: no key is supported yet (see migration header) — any
  -- non-empty patch is refused rather than silently accepted and ignored.
  v_patch_notifications := coalesce(p_patch->'notifications', '{}'::jsonb);
  if jsonb_typeof(v_patch_notifications) <> 'object' then
    raise exception 'notifications patch must be an object' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'notifications_not_object')::text;
  end if;
  if v_patch_notifications <> '{}'::jsonb then
    for v_key in select * from jsonb_object_keys(v_patch_notifications) loop
      raise exception 'no notification preferences are supported yet' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'notifications.' || v_key)::text;
    end loop;
  end if;

  -- ---- materialise the row (race-free: ON CONFLICT DO NOTHING never
  --      clobbers a row a concurrent first-save already created), THEN lock
  --      the now-certainly-existing row before checking the version. ---------
  insert into clara.user_preferences(user_id) values (c.actor) on conflict (user_id) do nothing;

  select version, interface, notifications into v_row
    from clara.user_preferences where user_id = c.actor for update;

  if v_row.version <> p_expected_version then
    raise exception 'preferences changed elsewhere' using errcode = 'CLR06',
      detail = jsonb_build_object('reason', 'stale_version', 'current_version', v_row.version)::text;
  end if;

  -- SHALLOW MERGE, not replace — the PATCH contract. A patch touching only
  -- interface.motion cannot clear interface.sidebarDefault, because `||`
  -- overwrites just the keys present on its right-hand side.
  v_new_interface := v_row.interface || v_patch_interface;
  v_new_notifications := v_row.notifications || v_patch_notifications;

  update clara.user_preferences
     set version = version + 1,
         interface = v_new_interface,
         notifications = v_new_notifications,
         updated_at = now()
   where user_id = c.actor
  returning version, interface, notifications, updated_at into v_row;

  return clara._finish_op(c.firm, 'save_my_preferences', p_op_key, jsonb_build_object(
    'version', v_row.version,
    'interface', v_row.interface,
    'notifications', v_row.notifications,
    'updated_at', v_row.updated_at
  ));
end $$;
comment on function clara.save_my_preferences(int, jsonb, text) is
  '#626 D1 (+#641 B3). PATCH semantics (jsonb || merge), full validation against the enumerated '
  'supported set — interface.motion, interface.sidebarDefault and #641''s interface.workViews '
  '(an array of at most 20 saved views carrying EXACTLY id, name and query, all three present and '
  'string-typed, ids non-blank, control-character-free and unique once trimmed) — with the '
  'field path as detail.reason, CLR06 on a stale p_expected_version, op_key replay via '
  '_reserve_op/_finish_op scoped by the caller''s current firm.';

-- ==============================================================================================
-- 5. GRANTS. The two doors and the one helper: clara_authenticated ONLY. No agent, wake or
--    runtime variant exists or is needed — a Work LIST is a human read of a human''s own queue,
--    never something a model lane produces or consumes on its own.
-- ==============================================================================================
revoke all on function clara.list_accounting_work(uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int) from public;
revoke all on function clara.get_accounting_work_row(uuid) from public;
revoke all on function clara._work_run_attempts(uuid[]) from public;

grant execute on function clara.list_accounting_work(uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int) to clara_authenticated;
grant execute on function clara.get_accounting_work_row(uuid) to clara_authenticated;
grant execute on function clara._work_run_attempts(uuid[]) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 6. TAIL POSTCHECK.
-- ==============================================================================================
do $tail$
declare
  v_n int; v_mode boolean; v_sig text; v_bad text;
  -- The EXACT ACL every one of the four names must carry when this file is done. Asserted
  -- literally rather than counted: see (5b) below.
  v_acl constant text := 'clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner';
begin
  if to_regprocedure('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)') is null then
    raise exception 'work_list_reads tail: clara.list_accounting_work is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.get_accounting_work_row(uuid)') is null then
    raise exception 'work_list_reads tail: clara.get_accounting_work_row is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._work_run_attempts(uuid[])') is null then
    raise exception 'work_list_reads tail: clara._work_run_attempts is absent' using errcode = 'CLR10';
  end if;

  -- THE TWO DOORS ARE INVOKER AND THE HELPER IS DEFINER. If that ever inverts, the whole
  -- argument in this file's header stops holding: an INVOKER helper could not read agent_tasks,
  -- and a DEFINER door would stop borrowing each source's own RLS predicate.
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'work_list_reads tail: list_accounting_work is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'work_list_reads tail: get_accounting_work_row is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc where oid = 'clara._work_run_attempts(uuid[])'::regprocedure;
  if v_mode is distinct from true then
    raise exception 'work_list_reads tail: _work_run_attempts is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;

  -- The DEFINER helper carries the bookkeeper floor and the firm self-scope in its own body.
  -- Asserted against the text because a granted helper is PostgREST-reachable directly.
  if position('_human_ctx' in (select prosrc from pg_proc where oid = 'clara._work_run_attempts(uuid[])'::regprocedure)) = 0
     or position('w.firm_id = c.firm' in (select prosrc from pg_proc where oid = 'clara._work_run_attempts(uuid[])'::regprocedure)) = 0 then
    raise exception 'work_list_reads tail: _work_run_attempts lost its floor or its firm self-scope'
      using errcode = 'CLR10';
  end if;

  -- THE WHOLE POSTURE OF EACH NEW NAME, not just its plan-cache pin (0188 §5a's own shape,
  -- adopted here after the migration-safety review found this tail thinner than the wave's idiom).
  -- Owner, BOTH proconfig pins, and PUBLIC — a `search_path` that drifted off `clara, pg_temp`
  -- would change which objects a SECURITY DEFINER body resolves, which is the whole reason the pin
  -- exists, and nothing here was asserting it. Whitespace-insensitive, because PostgreSQL
  -- NORMALISES a GUC list when it stores it (`set search_path = clara, pg_temp` comes back as
  -- `search_path=clara, pg_temp`), so a literal comparison would be asserting the catalog's
  -- formatting rather than the pin.
  foreach v_sig in array array[
    'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)',
    'clara.get_accounting_work_row(uuid)',
    'clara._work_run_attempts(uuid[])'] loop
    select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                  then 'owned by ' || pg_get_userbyid(p.proowner)
                when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                       not like '%search_path=clara,pg_temp%'
                  then 'search_path is not pinned'
                when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                       not like '%plan_cache_mode=force_custom_plan%'
                  then 'plan_cache_mode is not pinned (0183)'
                else null end
      into v_bad
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_bad is not null then
      raise exception 'work_list_reads tail: % is %', v_sig, v_bad using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception 'work_list_reads tail: PUBLIC still holds EXECUTE on %', v_sig
        using errcode = 'CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
      raise exception 'work_list_reads tail: clara_authenticated cannot execute %', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (5b) THE EXACT ACL, not a roster sweep (0188 §5b's own argument, copied). The previous shape
  --      COUNTED `information_schema.role_routine_grants` rows whose grantee it happened to name,
  --      which cannot see a grant to a role outside the names it enumerated — a `supabase_admin`,
  --      an `anon`/`authenticated` from the hosted platform's own roster, or a future `belcort_*`.
  --      The ACL array IS the complete answer to "who holds EXECUTE", so it is asserted literally:
  --      two entries on each of the four names and nothing else. A NULL proacl (the create
  --      default, where PUBLIC holds EXECUTE implicitly) fails this too, which is the point.
  select string_agg(format('%s -> %s', t.sig, coalesce(array_to_string(p.proacl, ' | '), '(null)')),
                    '; ' order by t.sig)
    into v_bad
    from (values ('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'),
                 ('clara.get_accounting_work_row(uuid)'),
                 ('clara._work_run_attempts(uuid[])'),
                 ('clara.save_my_preferences(int,jsonb,text)')
         ) t(sig)
    join pg_proc p on p.oid = t.sig::regprocedure
   where coalesce(array_to_string(p.proacl, ' | '), '(null)') is distinct from v_acl;
  if v_bad is not null then
    raise exception 'work_list_reads tail: an EXECUTE ACL is not exactly what this file granted: %',
      v_bad using errcode = 'CLR10';
  end if;

  -- THE FIRM-WIDE ORDERING INDEX IS PRESENT, with the key tuple §0.5 argues for. Asserted from
  -- `pg_get_indexdef` rather than from the name alone: an index of the right name over the wrong
  -- columns would leave the firm-wide page on a top-N heapsort while this file claimed otherwise.
  select pg_get_indexdef(c.oid) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'ix_accounting_work_firm_created';
  if v_bad is null then
    raise exception 'work_list_reads tail: clara.ix_accounting_work_firm_created is absent'
      using errcode = 'CLR10';
  end if;
  if replace(lower(v_bad), ' ', '') not like '%(firm_id,created_atdesc,iddesc)' then
    raise exception 'work_list_reads tail: ix_accounting_work_firm_created is not (firm_id, created_at desc, id desc): %',
      v_bad using errcode = 'CLR10';
  end if;

  -- THE RECUT KEPT EVERY 0179 ARM and gained exactly one. Probed against the live body's text so
  -- a copy that silently dropped an arm cannot pass.
  if position('interface.sidebarDefault' in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0
     or position('interface.motion' in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0
     or position('stale_version' in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0
     or position('unsupported_top_level_key' in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0
     or position('workViews' in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0 then
    raise exception 'work_list_reads tail: the save_my_preferences recut lost a 0179 arm or gained no workViews arm'
      using errcode = 'CLR10';
  end if;
  -- THE RECUT ALSO REQUIRES A `query` KEY AND REFUSES A CONTROL CHARACTER IN AN ID — the two
  -- shape faults 0179's arms never had to think about, probed as text for the same reason the arms
  -- above are: a copy that dropped them would still carry the word `workViews`.
  if position($q$jsonb_typeof(v_view->'query') is distinct from 'string'$q$
              in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0
     or position('[[:cntrl:]]' in (select prosrc from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure)) = 0 then
    raise exception 'work_list_reads tail: the save_my_preferences recut lost a #641 workViews shape rule'
      using errcode = 'CLR10';
  end if;
  if (select prosecdef from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure) is distinct from true
     or (select proowner from pg_proc where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure) <> 'clara_fn_owner'::regrole
     or replace(coalesce((select array_to_string(proconfig, ',') from pg_proc
                           where oid = 'clara.save_my_preferences(int,jsonb,text)'::regprocedure), ''), ' ', '')
          not like '%search_path=clara,pg_temp%' then
    raise exception 'work_list_reads tail: the save_my_preferences recut changed its security mode, owner or search_path'
      using errcode = 'CLR10';
  end if;

  -- NO TABLE ACL MOVED. This file grants on functions only.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'agent_tasks' and grantee = 'clara_authenticated';
  if v_n <> 0 then
    raise exception 'work_list_reads tail: clara.agent_tasks gained a clara_authenticated grant -- the whole point of the DEFINER helper is that it does not need one'
      using errcode = 'CLR10';
  end if;

  raise notice 'work_list_reads tail: OK -- clara.list_accounting_work / clara.get_accounting_work_row are SECURITY INVOKER over already-granted, firm-scoped sources with an inline bookkeeper floor; clara._work_run_attempts is the ONE SECURITY DEFINER helper (bookkeeper-floored, firm self-scoped, and page-bounded BY ITS OWN BODY at 101 ids) that reaches clara.agent_tasks without widening its grant; all four names are clara_fn_owner-owned with search_path = clara, pg_temp pinned, the three new ones also pin plan_cache_mode = force_custom_plan, and every one carries EXACTLY the literal ACL {clara_fn_owner, clara_authenticated} -- asserted from proacl, not counted from a roster; ix_accounting_work_firm_created is present on (firm_id, created_at desc, id desc), which is the firm-wide door''s ORDER BY tuple exactly; save_my_preferences keeps every 0179 arm and gains interface.workViews with its query key required and control characters refused; no table altered, no table grant widened.';
end $tail$;
