-- 0214_client_work_pack — #650 (refresh spec #612, journey A-home): THE CLIENT HOME'S WORK
-- ATTENTION FACETS — what is running for this client right now, and what finished in the last
-- seven Malaysian calendar days — as ONE client-scoped read over distinct Work ids.
-- =====================================================================================
-- Spec of record: issue #650 — "在 A 风格客户首页直接看见需要你、处理中和近期完成". Domain words:
-- CONTEXT.md — "Work attention facet", "Work pack", "Accounting work", "Needs you".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE SECURITY INVOKER read door,
-- `clara.get_client_work_pack(p_client, p_preview)`, returning a single jsonb envelope with TWO
-- facets — `active` and `recent_success` — each carrying a count of DISTINCT Work ids, a coverage
-- word, and a short preview of rows; plus the read's own instant and a STATIC pointer at the
-- review-queue count that already serves the third tile.
--
-- ZERO new tables, columns, policies, indexes or widened table grants. One `grant execute`.
--
-- =====================================================================================
-- WHY THERE ARE TWO FACETS AND THREE TILES, AND WHY THAT ASYMMETRY IS THE POINT.
--
-- The client home's third attention number — Works waiting on a person — ALREADY SHIPS. #629's
-- 0180 spliced a `work_question_rows` arm into the live `clara.list_review_queue`
-- (0180:1065-1080) and added a whole-population `counts.work_questions` (0180:1105, :1118);
-- `apps/web/components/firm/needs-you-counts.tsx:30` renders it on this very page. That read
-- floors at VIEWER (0016:4563). This door floors at BOOKKEEPER, because that is where 0189 put
-- the Work list (0189:344-347) and a Work row is not a viewer's business.
--
-- So folding "needs you" into this pack would do two bad things at once. It would TAKE A SHIPPED
-- SURFACE AWAY FROM VIEWERS — a bookkeeper-floored pack cannot answer a viewer at all — and it
-- would put TWO AGGREGATIONS OF ONE RELATION under nearly one noun on one page, which is the
-- exact defect 裁-190 removed from `client-needs-you.tsx` once already ("Two renderings of one
-- queue, one of them inert"). The two numbers could legitimately DIFFER (the queue arm carries an
-- active-client guard, 0180:1078, and floors differently), and a page showing both would be
-- unable to explain why.
--
-- The pack therefore carries `needs_you_ref` — metadata naming the read that owns that number —
-- and aggregates NOTHING from `clara.agent_interruptions`. That absence is asserted in this
-- file's own tail, from `prosrc`, so a later widening has to argue with a postcheck rather than
-- with a comment.
--
-- =====================================================================================
-- WHY "RECENT SUCCESS" IS A COMMITTED RECEIPT AND NOT A STATUS.
--
-- `clara.accounting_work` HAS NO COMPLETION INSTANT. It carries `created_at` and `updated_at`
-- (0178:324-325) and nothing else; `updated_at` moves for reasons that are not completion (a
-- claim, a settle, a question answered, a take-over), so a seven-day window keyed on it would
-- count Works that finished weeks ago and would keep re-counting them. The one durable record of
-- "this operation actually happened, at this instant" is `clara.operation_receipts` with
-- `outcome='committed'` — written ONLY inside the posting transaction, by
-- `clara._record_journal_entry_core` (0178:442-445; the live body is 0195:2130) — whose
-- `work_id` is NOT NULL with an FK (0178:415, :431), whose client index already serves this
-- window (`ix_operation_receipts_client`, 0178:450) and whose `purpose` 0194:233-234 widened to
-- the same three values the Work purpose carries, so the coverage is not journal-entry-only.
--
-- AND THE CONSEQUENCE IS STATED RATHER THAN HIDDEN. A Work whose `status` is `completed` but
-- which carries NO committed receipt is a completion this database cannot DATE. It is therefore
-- not counted, and its existence drives `recent_success.coverage = 'partial'` with
-- `uncounted_completions` naming how many there are. "Smaller" and "incomplete" are different
-- answers and this door gives the second one.
--
-- =====================================================================================
-- WHY "RETRYING" IS A ROW LABEL AND NEVER A NUMBER.
--
-- `attempts` — how many runs a Work has had, which is what makes "Retrying" a fact rather than a
-- guess — lives in `clara.agent_tasks`, which carries NO `clara_authenticated` grant at all. The
-- only granted path to it is `clara._work_run_attempts` (0189:250-296), a SECURITY DEFINER helper
-- that REFUSES a null array or more than 101 ids with CLR10 `invalid_work_ids` (0189:262-274) —
-- deliberately, because it is PostgREST-reachable and both 0189 doors only ever ask about
-- `p_limit + 1` Works.
--
-- A WHOLE-POPULATION retry count would have had to hand it every active Work of the client, and
-- a client with 102 running Works would then have made THE WHOLE PACK REFUSE — darkening all
-- three tiles at once, to report one sub-count. The alternatives were a new definer surface over
-- `agent_tasks` (a new ACL for a summary board) or recutting a governed function (a pinned recut
-- for a label). Neither is worth it.
--
-- So the pack publishes NO retry number. It asks the helper only about the PREVIEW ids — at most
-- 25, a quarter of the helper's own ceiling — and labels those rows. When the population is
-- larger than the preview, `active.coverage` is `partial` with reason `retry_label_preview_only`:
-- the door says which part of the answer it is not making, instead of making it up.
--
-- =====================================================================================
-- WHY SECURITY INVOKER.
--
-- The same reason 0189's two doors and 0181's `clara.list_activity` are. Every relation this body
-- reads is ALREADY SELECT-granted to `clara_authenticated` behind its own FORCED, firm-scoped RLS
-- predicate — `clara.accounting_work` (0178:345-351, `firm_id = clara.jwt_firm()`) and
-- `clara.operation_receipts` (0178:457-463, the same predicate). A DEFINER door would have to
-- restate those predicates by hand and would then own them; an INVOKER door borrows each
-- source's own. The ONE definer thing it touches is 0189's helper, which carries its own floor
-- and its own firm self-scope inside its body and is already granted.
--
-- A CLIENT THIS CALLER CANNOT SEE READS AS ZERO, NOT AS A REFUSAL, and that is 0189's own
-- posture rather than a new one: `clara.list_accounting_work` answers an empty page for another
-- firm's client id. An id that names nothing and an id that names somebody else's client must be
-- INDISTINGUISHABLE, or the door tells firm B that firm A holds a client with this id. The web
-- surface never reaches this state anyway — `app/(firm)/clients/[clientId]/layout.tsx` resolves
-- the client on the server and renders `notFound()` before the board mounts.
--
-- =====================================================================================
-- THE WINDOW IS SEVEN MALAYSIAN CALENDAR DATES ENDING TODAY, RESOLVED HERE.
--
-- `[start of (today - 6) in Asia/Kuala_Lumpur, start of (today + 1) in Asia/Kuala_Lumpur)` — a
-- half-open range, so no instant is dropped or double-counted at either fence, and the upper
-- fence is the NEXT Malaysian midnight rather than a manufactured `23:59:59.999` literal (the
-- argument `lib/firm/activity.ts`'s `businessDayEnd` already carries on the web side). The
-- envelope also publishes the two calendar DATES, `from_date` and `to_date`, because the Work
-- list's `since`/`until` axes are date-only: the browser rebuilds EXACTLY these instants from
-- exactly these dates, so the drilldown cannot mean a different week from the tile it came from.
--
-- MALAYSIA HAS NO DST, but the zone name is used rather than a `+08` literal for the same reason
-- the estate names it everywhere else: a literal offset is a claim about the calendar that the
-- calendar, not this file, owns.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT ADD.
--
--   · NO `domain_events` watermark. `clara._append_event` (0005:477-491) is the single emission
--     point in the estate and the Work lane calls it ZERO times; the only `work.%` event that
--     exists is `work.taken_over` (0184:1455). A watermark here would move for nothing this
--     board shows, which would satisfy the acceptance criterion's word and defeat its purpose.
--     The envelope carries `computed_at` — the instant of THIS read — and nothing more.
--   · NO total, and no key anything could be summed into. The two facets OVERLAP by
--     construction (one Work can be running today and have posted yesterday) and the third tile's
--     number comes from another read entirely.
--   · NO period, fiscal-year or as-of parameter. A financial period never narrows Work
--     attention; the signature is the enforcement of that sentence, and the tail asserts it.
--   · NO supporting index. `ix_accounting_work_client (client_id, created_at desc)` (0178:367)
--     serves the active scan and `ix_operation_receipts_client (client_id, created_at desc)`
--     (0178:450) serves the window; both were measured on a rig cohort before this file was
--     written and neither read degraded to a sequential scan.
--   · NO new relation, column, policy, trigger or table grant, and no recut of anything.
--
-- FRONTEND HOME (apps/web):
--   clara.get_client_work_pack(...) -> apps/web/lib/work/client-work-pack.ts
--                                      (read by components/firm/client-home/
--                                       client-work-attention.tsx on /clients/:clientId)
-- =====================================================================================

do $p650_pre$
declare
  v_missing text;
  v_sha text;
begin
  -- THE RELATIONS THIS BODY READS, AND THE SHAPE IT READS THEM AT.
  if to_regclass('clara.accounting_work') is null then
    raise exception 'client_work_pack prestate: clara.accounting_work is absent (0178 has not applied)'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.operation_receipts') is null then
    raise exception 'client_work_pack prestate: clara.operation_receipts is absent (0178 has not applied)'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.operation_receipts'::regclass
       and conname = 'operation_receipts_outcome_check'
       and pg_get_constraintdef(oid) like '%committed%' and pg_get_constraintdef(oid) like '%refused%'
  ) then
    raise exception 'client_work_pack prestate: operation_receipts has no committed/refused outcome CHECK -- the whole point of counting only committed receipts'
      using errcode = 'CLR10';
  end if;
  -- 0194 widened the receipt purpose to the same three values the Work purpose carries. If it has
  -- not, `recent_success` would silently be journal-entry-only and this file's header would be
  -- describing a coverage it does not have.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.operation_receipts'::regclass
       and conname = 'operation_receipts_purpose_check'
       and pg_get_constraintdef(oid) like '%periodic_stock_adjustment%'
       and pg_get_constraintdef(oid) like '%payroll_obligation%'
  ) then
    raise exception 'client_work_pack prestate: operation_receipts.purpose has not been widened by 0194 -- recent success would be journal-entry-only'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.ix_operation_receipts_client') is null then
    raise exception 'client_work_pack prestate: ix_operation_receipts_client is absent -- the seven-day window has no ordered path'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.ix_accounting_work_client') is null then
    raise exception 'client_work_pack prestate: ix_accounting_work_client is absent -- the active scan has no ordered path'
      using errcode = 'CLR10';
  end if;

  select string_agg(n, ', ') into v_missing from (
    select n from unnest(array['jwt_sub','jwt_firm','actor_role_rank','role_rank',
                               'list_accounting_work','get_accounting_work_row','_work_run_attempts']) as t(n)
     where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = 'clara' and p.proname = t.n)
  ) x;
  if v_missing is not null then
    raise exception 'client_work_pack prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara' and p.proname = 'get_client_work_pack'
  ) then
    raise exception 'client_work_pack prestate: clara.get_client_work_pack already exists'
      using errcode = 'CLR10';
  end if;

  -- THE ONE PIN, AND THE DEPENDENCY IT PROTECTS — not decoration.
  --
  -- This file RECUTS NOTHING (`pinned_function_recut: []`), so the house's recut pin does not
  -- apply. It keeps ONE pre-image pin anyway, because the whole "Retrying is a label, never a
  -- number" ruling rests on a property of a function this body CALLS but does not own:
  -- `clara._work_run_attempts` refuses more than 101 ids (0189:262-274) and floors itself at
  -- bookkeeper with a firm self-scope inside its own body (0189:258, :283). The pack clamps
  -- `p_preview` to 25 precisely so the first can never fire, and relies on the second two rather
  -- than restating them. If that body is ever recut, this door's safety argument has to be
  -- re-derived — and this pin is what forces someone to do that instead of discovering it at 102
  -- running Works.
  --
  -- MEASURED, NEVER TRANSCRIBED (DECISIONS §1.2): sha256 of the LIVE `prosrc` read off `pg_proc`
  -- on a migrated rig at frontier 0198 (clara_650, PostgreSQL 17.11), not copied from 0189's file
  -- text — several live bodies in this estate are prosrc splices rather than their creating
  -- file's text, and `_work_run_attempts` being unspliced today is a measurement, not a given.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._work_run_attempts(uuid[])'::regprocedure;
  if v_sha <> '3da8d655d78cac6eede8444321492fc4a1b5797a4f8a826fb878e26081cfa69e' then
    raise exception 'client_work_pack prestate: clara._work_run_attempts has DRIFTED from the pinned 0189 body (sha %) -- re-derive the preview-only retry-label argument against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#650 prestate: clean -- the 0178 relations are at their 0178+0194 shape, 0189''s three doors are live, _work_run_attempts is at its pinned body, and no client work pack exists.';
end $p650_pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- clara.get_client_work_pack — the client home's Work attention band. SECURITY INVOKER; see the
-- header for why, relation by relation.
-- ==============================================================================================
create function clara.get_client_work_pack(
  p_client  uuid,
  p_preview int default 5
) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  c record;
  v_preview   int;
  v_now       timestamptz := now();
  v_today     date;
  v_from_date date;
  v_from      timestamptz;
  v_to        timestamptz;

  v_active_count    int;
  v_active_ids      uuid[];
  v_active_rows     jsonb := '[]'::jsonb;
  v_active_state    text;
  v_active_reason   text;

  v_success_count   int;
  v_success_rows    jsonb := '[]'::jsonb;
  v_undated         int;
  v_success_state   text;
  v_success_reason  text;
begin
  -- THE INLINE FLOOR, restating 0189:344-347's three predicates verbatim, for the same structural
  -- reason 0181 and 0189 give: an INVOKER body cannot call clara._human_ctx (an internal helper
  -- with no application-role EXECUTE grant), so it asks the helpers that ARE granted.
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

  -- A NULL CLIENT IS A CALLER DEFECT, NOT AN ANSWER. This door is client-only by construction:
  -- there is no firm-wide arm, so a null is never the honest "no filter" it looks like.
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_client')::text;
  end if;

  -- CLAMPED 1..25, and the ceiling is the point: the retry label below hands these ids to a
  -- helper that refuses more than 101, so the preview can never be the thing that breaks the
  -- read. 25 is a quarter of that, with room for a future tile.
  v_preview := least(greatest(coalesce(p_preview, 5), 1), 25);

  -- THE SEVEN MALAYSIAN CALENDAR DATES ENDING TODAY, as a half-open instant range.
  v_today     := (v_now at time zone 'Asia/Kuala_Lumpur')::date;
  v_from_date := v_today - 6;
  v_from      := (v_from_date::timestamp) at time zone 'Asia/Kuala_Lumpur';
  v_to        := ((v_today + 1)::timestamp) at time zone 'Asia/Kuala_Lumpur';

  -- ------------------------------------------------------------------------------------------
  -- FACET 1 — ACTIVE. Runnable or executing, counted over DISTINCT Work ids.
  --
  -- `count(distinct w.id)` where `w.id` is already the primary key is deliberate redundancy: it
  -- is the spelling that stays correct if a later join is ever added here, and it is the property
  -- the acceptance criterion names. "Child" has exactly ONE referent in this estate today — the
  -- `clara.agent_tasks` run — because `clara.accounting_work` carries no parent/child columns
  -- (0178:301-337) and batch Work (#636) is open, so there is no batch progress to report and
  -- none is invented.
  -- ------------------------------------------------------------------------------------------
  select count(distinct w.id)::int into v_active_count
    from clara.accounting_work w
   where w.client_id = p_client
     and w.status in ('queued', 'running');

  select coalesce(array_agg(t.id order by t.created_at desc, t.id desc), '{}'::uuid[])
    into v_active_ids
    from (
      select w.id, w.created_at
        from clara.accounting_work w
       where w.client_id = p_client
         and w.status in ('queued', 'running')
       order by w.created_at desc, w.id desc
       limit v_preview
    ) t;

  if coalesce(array_length(v_active_ids, 1), 0) > 0 then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.work_id desc), '[]'::jsonb)
      into v_active_rows
      from (
        select w.id                                   as work_id,
               w.purpose                              as purpose,
               w.status                               as status,
               nullif(w.basis->>'memo', '')           as memo,
               coalesce(a.attempts, 0)                as attempts,
               a.current_run_status                   as current_run_status,
               -- THE LABEL, and it is a fact: more than one run has been opened for this Work.
               coalesce(a.attempts, 0) > 1            as retrying,
               w.created_at                           as created_at,
               w.updated_at                           as updated_at
          from clara.accounting_work w
          -- 0189's granted SECURITY DEFINER helper, asked ONLY about the preview ids. See the
          -- header: this is the whole reason there is no population-wide retry number.
          left join clara._work_run_attempts(v_active_ids) a on a.work_id = w.id
         where w.id = any(v_active_ids)
      ) x;
  end if;

  if v_active_count > coalesce(jsonb_array_length(v_active_rows), 0) then
    v_active_state  := 'partial';
    v_active_reason := 'retry_label_preview_only';
  else
    v_active_state  := 'ok';
    v_active_reason := null;
  end if;

  -- ------------------------------------------------------------------------------------------
  -- FACET 2 — RECENT SUCCESS. A COMMITTED receipt inside the window, counted over DISTINCT Work
  -- ids. `outcome='refused'` is a receipt too (0178:425) and is never a success.
  -- ------------------------------------------------------------------------------------------
  select count(distinct o.work_id)::int into v_success_count
    from clara.operation_receipts o
   where o.client_id = p_client
     and o.outcome = 'committed'
     and o.created_at >= v_from
     and o.created_at <  v_to;

  with dated as (
    -- `distinct on (work_id)` is belt: uq_operation_receipts_committed (0178:448) already admits
    -- at most one committed row per (firm, logical identity) and a Work carries exactly one
    -- identity, so this can only ever collapse a row the estate should not have produced.
    select distinct on (o.work_id)
           o.work_id                                as work_id,
           o.id                                     as receipt_id,
           nullif(o.effects->>'entry_id', '')       as entry_id,
           o.created_at                             as committed_at
      from clara.operation_receipts o
     where o.client_id = p_client
       and o.outcome = 'committed'
       and o.created_at >= v_from
       and o.created_at <  v_to
     order by o.work_id, o.created_at desc
  ), newest as (
    select * from dated order by committed_at desc, work_id desc limit v_preview
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.committed_at desc, x.work_id desc), '[]'::jsonb)
    into v_success_rows
    from (
      select n.work_id                      as work_id,
             w.purpose                      as purpose,
             w.status                       as status,
             nullif(w.basis->>'memo', '')   as memo,
             n.receipt_id                   as receipt_id,
             n.entry_id                     as entry_id,
             n.committed_at                 as committed_at
        from newest n
        join clara.accounting_work w on w.id = n.work_id
    ) x;

  -- THE COVERAGE THIS FACET CANNOT CLAIM. A `completed` Work with no committed receipt is a
  -- completion this database holds no instant for, so it can be neither counted nor excluded
  -- honestly. It is left out of the number and NAMED, rather than quietly making the figure
  -- smaller. Deliberately NOT bounded by the window: bounding it would need the very completion
  -- instant whose absence is the problem.
  select count(*)::int into v_undated
    from clara.accounting_work w
   where w.client_id = p_client
     and w.status = 'completed'
     and not exists (
       select 1 from clara.operation_receipts o
        where o.work_id = w.id and o.outcome = 'committed');

  if v_undated > 0 then
    v_success_state  := 'partial';
    v_success_reason := 'completions_without_receipt';
  else
    v_success_state  := 'ok';
    v_success_reason := null;
  end if;

  -- ------------------------------------------------------------------------------------------
  -- THE ENVELOPE. `status` is the ANSWER STATE a reader sees (the browser overwrites it with
  -- `unknown` for a malformed body and `denied` for a refusal, which this door can never report
  -- about itself); `coverage` is this door's own statement about the completeness of the facet's
  -- population. There is NO total key, and the two facets are not a partition of anything.
  -- ------------------------------------------------------------------------------------------
  return jsonb_build_object(
    'computed_at',   v_now,
    'preview_limit', v_preview,
    'window', jsonb_build_object(
      'from',      v_from,
      'to',        v_to,
      'from_date', v_from_date::text,
      'to_date',   v_today::text,
      'timezone',  'Asia/Kuala_Lumpur',
      'days',      7),
    'facets', jsonb_build_object(
      'active', jsonb_build_object(
        'status',          v_active_state,
        'count',           v_active_count,
        'coverage',        v_active_state,
        'coverage_reason', v_active_reason,
        'rows',            v_active_rows),
      'recent_success', jsonb_build_object(
        'status',                v_success_state,
        'count',                 v_success_count,
        'coverage',              v_success_state,
        'coverage_reason',       v_success_reason,
        'uncounted_completions', v_undated,
        'rows',                  v_success_rows)),
    -- NOT A FACET. The third tile's number belongs to a read that already ships and floors lower;
    -- this names it so the browser composes one source rather than growing a second.
    'needs_you_ref', jsonb_build_object('source', 'list_review_queue.counts.work_questions'));
end $$;

comment on function clara.get_client_work_pack(uuid, int) is
  '#650 A-home. The client home''s Work attention band: TWO facets over DISTINCT Work ids — '
  '`active` (status queued/running) and `recent_success` (a COMMITTED clara.operation_receipts '
  'row inside the seven Asia/Kuala_Lumpur calendar dates ending today) — each with a count, a '
  'coverage word and a preview of at most p_preview rows (clamped 1..25). SECURITY INVOKER over '
  'clara.accounting_work and clara.operation_receipts, both already clara_authenticated-granted '
  'with forced firm-scoped RLS; floored at bookkeeper by 0189''s own three inline predicates. '
  'Calls clara._work_run_attempts ONLY with the preview ids, so the Retrying LABEL is a fact and '
  'no population-wide retry number ever approaches that helper''s 101-id ceiling; when the '
  'population exceeds the preview, active.coverage is partial with reason '
  'retry_label_preview_only. A `completed` Work with no committed receipt is UNCOUNTED and drives '
  'recent_success.coverage=partial with uncounted_completions naming how many, because '
  'clara.accounting_work holds no completion instant. Carries computed_at (the read instant, NEVER '
  'a mutation position: the Work lane emits no domain events) and needs_you_ref, a static pointer '
  'at list_review_queue.counts.work_questions — this door aggregates clara.agent_interruptions '
  'NOWHERE. No total key; the facets overlap and are never summed. No period parameter exists, so '
  'no caller can narrow Work attention to a financial period. EXECUTE to clara_authenticated only.';

-- ==============================================================================================
-- GRANTS. clara_authenticated ONLY. A client's attention board is a human read of a human's own
-- queue — never something a model lane produces or consumes on its own, which is the same
-- argument 0189 makes for the Work list beside it.
-- ==============================================================================================
revoke all on function clara.get_client_work_pack(uuid, int) from public;
grant execute on function clara.get_client_work_pack(uuid, int) to clara_authenticated;

reset role;

-- ==============================================================================================
-- TAIL POSTCHECK.
-- ==============================================================================================
do $p650_tail$
declare
  v_n int;
  v_src text;
  v_bad text;
  v_sig constant text := 'clara.get_client_work_pack(uuid,int)';
  -- The EXACT ACL the one new name must carry when this file is done. Asserted literally rather
  -- than counted (0188 §5b / 0189's own argument): the ACL array IS the complete answer to "who
  -- holds EXECUTE", and a NULL proacl — the create default, where PUBLIC holds EXECUTE
  -- implicitly — fails this too, which is the point.
  v_acl constant text := 'clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner';
begin
  if to_regprocedure(v_sig) is null then
    raise exception 'client_work_pack tail: clara.get_client_work_pack is absent' using errcode = 'CLR10';
  end if;

  -- EXACTLY ONE FUNCTION, at exactly one signature. An overload would be a second surface with
  -- a second set of arguments nothing in this file argues for.
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'clara' and p.proname = 'get_client_work_pack';
  if v_n <> 1 then
    raise exception 'client_work_pack tail: expected exactly one get_client_work_pack, found %', v_n
      using errcode = 'CLR10';
  end if;

  -- THE SIGNATURE IS THE ENFORCEMENT OF "A FINANCIAL PERIOD NEVER NARROWS WORK ATTENTION"
  -- (#650 AC2). Asserted as the rendered argument list, so a period, fiscal-year, basis or as-of
  -- parameter cannot be added without this postcheck arguing back.
  if pg_get_function_arguments(v_sig::regprocedure) <> 'p_client uuid, p_preview integer DEFAULT 5' then
    raise exception 'client_work_pack tail: the signature is % -- the door takes a client and a preview size and NOTHING that could name a financial period',
      pg_get_function_arguments(v_sig::regprocedure) using errcode = 'CLR10';
  end if;

  -- POSTURE: owner, security mode, and both proconfig pins. Whitespace-insensitive, because
  -- PostgreSQL NORMALISES a GUC list when it stores it (0189's own measured note).
  select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                then 'owned by ' || pg_get_userbyid(p.proowner)
              when p.prosecdef is distinct from false
                then 'is not SECURITY INVOKER'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%search_path=clara,pg_temp%'
                then 'search_path is not pinned'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%plan_cache_mode=force_custom_plan%'
                then 'plan_cache_mode is not pinned (0183)'
              when p.provolatile <> 's'
                then 'is not STABLE'
              else null end
    into v_bad
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad is not null then
    raise exception 'client_work_pack tail: % %', v_sig, v_bad using errcode = 'CLR10';
  end if;

  if has_function_privilege('public', v_sig::regprocedure, 'execute') then
    raise exception 'client_work_pack tail: PUBLIC still holds EXECUTE on %', v_sig using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
    raise exception 'client_work_pack tail: clara_authenticated cannot execute %', v_sig using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(p.proacl, ' | '), '(null)') into v_bad
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_bad is distinct from v_acl then
    raise exception 'client_work_pack tail: the EXECUTE ACL is not exactly what this file granted: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- THE 裁-190 RULE, ASSERTED FROM THE BODY ITSELF. This door must never grow a second
  -- aggregation of the relation the shipped needs-you chip already counts.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  if position('agent_interruptions' in v_src) <> 0 then
    raise exception 'client_work_pack tail: the pack reads agent_interruptions -- that is the second number over one relation 裁-190 removed'
      using errcode = 'CLR10';
  end if;
  if position('Asia/Kuala_Lumpur' in v_src) = 0 then
    raise exception 'client_work_pack tail: the window is not resolved against Asia/Kuala_Lumpur'
      using errcode = 'CLR10';
  end if;
  if position('''committed''' in v_src) = 0 then
    raise exception 'client_work_pack tail: recent success is not keyed on a COMMITTED receipt'
      using errcode = 'CLR10';
  end if;
  if position('least(greatest(coalesce(p_preview, 5), 1), 25)' in v_src) = 0 then
    raise exception 'client_work_pack tail: p_preview is not clamped to 1..25 -- the retry label could then reach _work_run_attempts'' 101-id ceiling'
      using errcode = 'CLR10';
  end if;

  -- NO TABLE PRIVILEGE MOVED. This file grants on a function and nothing else; in particular
  -- clara.agent_tasks is STILL ungranted, which is the whole reason the retry label goes through
  -- 0189's DEFINER helper rather than reading the relation.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'agent_tasks' and grantee = 'clara_authenticated';
  if v_n <> 0 then
    raise exception 'client_work_pack tail: clara.agent_tasks gained a clara_authenticated grant'
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s:%s', t.table_name, t.privilege_type), ',' order by t.table_name, t.privilege_type)
    into v_bad
    from information_schema.role_table_grants t
   where t.table_schema = 'clara' and t.grantee = 'clara_authenticated'
     and t.table_name in ('accounting_work', 'operation_receipts')
     and t.privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception 'client_work_pack tail: a non-SELECT privilege reached a relation this read borrows: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- AND NOTHING WAS RECUT. `clara._work_run_attempts` is still the body this file pinned in its
  -- prestate and still SECURITY DEFINER; `clara.list_accounting_work` is still SECURITY INVOKER.
  if (select prosecdef from pg_proc where oid = 'clara._work_run_attempts(uuid[])'::regprocedure) is distinct from true then
    raise exception 'client_work_pack tail: _work_run_attempts is no longer SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara._work_run_attempts(uuid[])'::regprocedure), 'UTF8')), 'hex')
       <> '3da8d655d78cac6eede8444321492fc4a1b5797a4f8a826fb878e26081cfa69e' then
    raise exception 'client_work_pack tail: _work_run_attempts moved while this file was applying' using errcode = 'CLR10';
  end if;

  raise notice '#650 tail: OK -- clara.get_client_work_pack exists exactly once at (uuid,int), owned by clara_fn_owner, SECURITY INVOKER, STABLE, search_path- and plan_cache_mode-pinned, EXECUTE to clara_authenticated and nobody else (PUBLIC revoked, the ACL asserted literally). Its signature carries no period, fiscal-year or as-of parameter, so no caller can narrow Work attention to a financial period. Its body resolves the seven-day window against Asia/Kuala_Lumpur, keys recent success on a COMMITTED receipt, clamps p_preview to 1..25 so the Retrying label never approaches clara._work_run_attempts'' 101-id ceiling, and mentions clara.agent_interruptions NOWHERE -- the needs-you number stays the shipped viewer-floored list_review_queue count, referenced rather than re-aggregated. No table privilege moved: clara.agent_tasks is still ungranted to clara_authenticated and the two relations this read borrows still carry SELECT and nothing else. Zero relations, columns, policies, triggers or indexes were created and nothing was recut -- clara._work_run_attempts is byte-identical to the body this file pinned.';
end $p650_tail$;
