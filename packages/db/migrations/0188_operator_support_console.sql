-- 0188_operator_support_console — #615 (parent spec #612 §8; journey D3):
-- THE OPERATOR'S SUPPORT SURFACE IS THE ADMISSION ESTATE, AND NOTHING IN IT REACHES A FIRM'S BOOKS.
-- =====================================================================================
-- Spec of record: issue #612 §8 and PRD §7 — "Operator 仅有获准的注册／支付支持和 estate
-- wake-source 管理，不因此取得其他事务所账本" (ARCHITECTURE §10, anchor
-- `admission-and-operator-support`). Ticket #615. This file closes the ONE measured gap below and
-- nothing else: it adds NO table, NO RLS policy, NO writer and NO grant to any relation.
--
-- WHAT WAS MEASURED ON THE 0187 FRONTIER, AND IS MISSING.
--
--   The estate already carries FIVE operator doors, each behind the same owner+operator-firm wall,
--   and each answering ONE question about ONE relation:
--     clara.approve_firm_registration / clara.reject_firm_registration   (0145 §D)
--     clara.firm_registration_requests_visible                            (0145 §E)
--     clara.list_stripe_event_problems / clara.resolve_stripe_event_problem (0160 §5)
--     clara.list_unconsumed_registration_payments                         (0163 §4)
--     clara.set_admission_capacity / clara.get_admission_capacity         (0186 §C)
--
--   There is no way to ask the question an operator actually has: **what needs me right now, and
--   what is the current state of the thing it is about?** Three of those reads answer three
--   disjoint lists, each missing the other two's context — a `duplicate_payment` problem does not
--   name the registration or the applicant, an unconsumed payment does not say whether its
--   checkout intent is `paid` or `consumed`, and an open registration does not say whether money
--   has already arrived for it (in which case nobody may approve it: the applicant claims it).
--   A console composed client-side out of the three would be a fourth, driftable definition of
--   "the queue", built in a place where the answer cannot be tested under real roles.
--
-- WHAT THIS FILE ADDS — TWO READS AND ONE SHARED BODY, ALL ADDITIVE.
--
--   clara._operator_support_cases(boolean, text, uuid)   the ONE query, granted to NOBODY.
--   clara.list_operator_support_queue(boolean)           the queue.
--   clara.get_operator_support_case(text, uuid)          one case, no existence oracle.
--
--   …plus a COMMENT recut on clara.get_admission_capacity, whose 0186 text asserts "no web lane
--   calls this door at all". #615 gives that door its first web lane (the operator console's own
--   capacity panel), so the comment is no longer true and is corrected here. NO BODY MOVES: the
--   door's text, posture, grants and predicate are byte-untouched.
--
-- THE THREE ARMS, AND WHY EACH ROW IS EXACTLY ONE SUPPORT CASE.
--
--   registration — a `clara.firm_registration_requests` row with NO payment row against it. The
--     payment exclusion is the load-bearing half: a PAID registration is not an approve/reject
--     case at all (`clara.claim_paid_firm` is the applicant's own door, and
--     `clara.approve_firm_registration` would mint a SECOND firm for the same person), so listing
--     it under this arm would offer an operator an act the estate must refuse. It appears under
--     the payment arm instead, exactly once.
--   payment — a `clara.firm_registration_payments` row: money arrived and no firm has been opened
--     with it yet. Carries the checkout intent's CURRENT state, joined on the session id the
--     payment itself carries (`uq_checkout_intents_session_id` makes that at most one intent), so
--     the operator sees `paid` versus `consumed` rather than inferring it.
--   problem — a `clara.stripe_event_problems` row: the provider said something the applier could
--     not act on. Carries the event's own redacted projection facts (0160 §1), and the
--     registration/applicant the event NAMED — LEFT-joined, because `clara.stripe_events`'s
--     `registration_id` is provider metadata with no foreign key, and `metadata_missing` is
--     precisely the problem where it is absent.
--
--   `p_include_settled` widens each arm to its decided/consumed/resolved rows, which is how the
--   console shows a RECEIPT: `decided_by`/`decided_at`/`decided_reason` project the registration's
--   own decision on the first arm and the problem's own resolution stamp on the third, so one
--   column set answers "who did this, when, and why" regardless of which act it was.
--
-- WHAT IS DELIBERATELY NOT HERE (scope, stated rather than silently omitted):
--   * NO new recovery writer. The console offers exactly the acts the estate already governs —
--     approve/reject a registration, resolve a provider problem, set admission capacity. A state
--     with no supported act (an unconsumed payment whose applicant simply has not claimed yet, a
--     `metadata_missing` problem) is NAMED as having none rather than given a button that would
--     invent an ungoverned effect.
--   * NO estate wake-source control (`clara.set_wake_source_enabled`, 0133). It is operator scope
--     by PRD §7, and it is not admission support; it stays where it is.
--   * NO legal-publication surface (`clara.publish_legal_document`, 0185 §E) — #635's.
--   * NO read of any firm's books. The three arms touch five admission relations and
--     `clara.stripe_events`; the tail census below asserts that neither body names a books
--     relation and that neither builds dynamic SQL, and
--     `packages/db/tests/operator-support.test.mjs` os.11 proves the same thing behaviourally
--     against a second firm that genuinely holds a client, a document, a ledger entry and a Work
--     row.
--
-- AUTHORITY. Both doors carry `_human_ctx(role_rank('owner'))` for the rank and then the
-- operator-firm `exists(...)` fragment BYTE-FOR-BYTE as `clara.approve_firm_registration` (0145
-- §D) writes it — the same copy `clara.list_stripe_event_problems` (0160 §5),
-- `clara.list_unconsumed_registration_payments` (0163 §4), `clara.publish_legal_document` (0185 §E)
-- and `clara.set_admission_capacity` (0186 §C) already carry. 0145 §K (8b)'s census pins the
-- ORIGINAL three; the tail below pins this file's two, and os.03 re-reads both from the live
-- catalog against the reference body rather than against a literal typed twice.
--
-- PLAN CACHE. Both doors and the shared body pin `plan_cache_mode = force_custom_plan` — 0183's
-- measured house rule: a plpgsql body that binds the session's own identity into a cached
-- statement is served from a GENERIC plan from the sixth call of a pooled connection, planned for
-- the estate's average rather than for this caller.
--
-- ROLLBACK. Append-only, as ever: a later migration may `create or replace` either body or drop
-- both; nothing here alters an existing body, relation, policy or grant, so reverting this file is
-- a drop of three functions and a comment.
-- =====================================================================================

do $prestate$
declare
  v_missing text;
begin
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.firm_registration_requests'), ('clara.firm_registration_payments'),
                 ('clara.stripe_event_problems'), ('clara.stripe_events'),
                 ('clara.checkout_intents'), ('clara.firms')) t(n)
   where to_regclass(t.n) is null;
  if v_missing is not null then
    raise exception '#615 0188 prestate: required relation(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara._human_ctx(integer)'), ('clara.role_rank(text)'), ('clara.jwt_firm()'),
                 ('clara.approve_firm_registration(uuid,text)'),
                 ('clara.get_admission_capacity()')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception '#615 0188 prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- The three #628 problem kinds must already be in the vocabulary, or the console would render a
  -- queue that cannot show the states 0186 files (0186 §D widened the CHECK).
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.stripe_event_problems'::regclass
       and conname = 'ck_stripe_event_problems_problem'
       and position('''processing_timeout''' in pg_get_constraintdef(oid)) > 0
  ) then
    raise exception '#615 0188 prestate: the problem vocabulary predates 0186 -- apply it first'
      using errcode = 'CLR10';
  end if;

  -- `clara.checkout_intents.status` is what the payment arm projects; without 0186 there is none.
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'clara.checkout_intents'::regclass and attname = 'status' and not attisdropped
  ) then
    raise exception '#615 0188 prestate: clara.checkout_intents carries no status -- 0186 must apply first'
      using errcode = 'CLR10';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.proname in ('list_operator_support_queue', 'get_operator_support_case',
                         '_operator_support_cases')
  ) then
    raise exception '#615 0188 prestate: an operator-support name already exists'
      using errcode = 'CLR10';
  end if;

  raise notice '#615 0188 prestate: clean -- the five admission relations and the reference '
    'authority body are present, the problem vocabulary is 0186''s, and no support-console name resolves yet';
end $prestate$;

set role clara_fn_owner;

-- =====================================================================================
-- §1  THE ONE QUERY. Granted to NOBODY — it is reached only from the two doors below, exactly as
-- clara._admission_capacity_state (0186 §C) is reached only from its four. ONE body, so the queue
-- and the detail door can never disagree about what a case IS; the doors differ only in the filter
-- they hand it and in the shape they return.
--
-- `p_kind`/`p_id` are a FILTER, not a validation: a kind outside the closed three matches nothing,
-- which is what lets the detail door answer one refusal for "unknown kind" and "unknown id" alike.
--
-- `extra` is the arm's own detail — the facts a queue ROW has no column for and a detail PANE
-- needs. The queue door projects the twenty declared columns and drops it; the case door merges
-- it into its answer. One body, two projections, no second definition of a case.
-- =====================================================================================
create function clara._operator_support_cases(
  p_include_settled boolean,
  p_kind            text default null,
  p_id              uuid default null
) returns table(
  case_kind            text,
  case_id              uuid,
  occurred_at          timestamptz,
  registration_id      uuid,
  applicant            uuid,
  firm_name            text,
  request_status       text,
  firm_id              uuid,
  intent_status        text,
  intent_status_at     timestamptz,
  intent_status_reason text,
  payment_recorded_at  timestamptz,
  payment_consumed_at  timestamptz,
  problem_kind         text,
  problem_noticed_at   timestamptz,
  problem_detail       jsonb,
  decided_by           uuid,
  decided_at           timestamptz,
  decided_reason       text,
  settled              boolean,
  extra                jsonb
)
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  v_all boolean := coalesce(p_include_settled, false);
begin
  return query
  select q.case_kind, q.case_id, q.occurred_at, q.registration_id, q.applicant, q.firm_name,
         q.request_status, q.firm_id, q.intent_status, q.intent_status_at, q.intent_status_reason,
         q.payment_recorded_at, q.payment_consumed_at, q.problem_kind, q.problem_noticed_at,
         q.problem_detail, q.decided_by, q.decided_at, q.decided_reason, q.settled, q.extra
    from (
      -- ARM 1 · a registration nobody has decided, and nobody has paid for.
      select 'registration'::text            as case_kind,
             r.id                            as case_id,
             r.created_at                    as occurred_at,
             r.id                            as registration_id,
             r.applicant                     as applicant,
             r.firm_name                     as firm_name,
             r.status                        as request_status,
             r.firm_id                       as firm_id,
             ci.status                       as intent_status,
             ci.status_at                    as intent_status_at,
             ci.status_reason                as intent_status_reason,
             null::timestamptz               as payment_recorded_at,
             null::timestamptz               as payment_consumed_at,
             null::text                      as problem_kind,
             null::timestamptz               as problem_noticed_at,
             null::jsonb                     as problem_detail,
             r.decided_by                    as decided_by,
             r.decided_at                    as decided_at,
             r.reason                        as decided_reason,
             (r.status <> 'open')            as settled,
             jsonb_build_object(
               'note', r.note,
               'intent_id', ci.id,
               'stripe_session_id', ci.session_id,
               'stripe_event_id', null::text,
               'event_type', null::text)     as extra
        from clara.firm_registration_requests r
        left join lateral (
          select i.id, i.status, i.status_at, i.status_reason, i.session_id
            from clara.checkout_intents i
           where i.registration_id = r.id
           order by i.opened_at desc, i.id desc
           limit 1
        ) ci on true
       where (v_all or r.status = 'open')
         and not exists (
           select 1 from clara.firm_registration_payments pay where pay.registration_id = r.id)

      union all

      -- ARM 2 · money arrived and no firm has been opened with it yet. The intent is joined on the
      -- SESSION the payment itself carries, never on the registration alone: one registration may
      -- have opened several intents over its life, and only one of them was paid.
      select 'payment'::text, p.id, p.recorded_at, p.registration_id, p.applicant,
             r.firm_name, r.status, r.firm_id,
             i.status, i.status_at, i.status_reason,
             p.recorded_at, p.consumed_at,
             null::text, null::timestamptz, null::jsonb,
             r.decided_by, r.decided_at, r.reason,
             (p.consumed_at is not null),
             jsonb_build_object(
               'note', r.note,
               'intent_id', i.id,
               'stripe_session_id', p.stripe_session_id,
               'stripe_event_id', p.stripe_event_id,
               'consumed_firm_id', p.consumed_firm_id,
               'event_type', null::text)
        from clara.firm_registration_payments p
        join clara.firm_registration_requests r on r.id = p.registration_id
        left join clara.checkout_intents i on i.session_id = p.stripe_session_id
       where v_all or p.consumed_at is null

      union all

      -- ARM 3 · the provider said something the applier could not act on. Every join outward from
      -- the problem is LEFT: `clara.stripe_events.registration_id` is provider metadata with no
      -- foreign key, and `metadata_missing` is exactly the problem where it is absent.
      select 'problem'::text, sep.id, sep.noticed_at, e.registration_id, e.applicant,
             r.firm_name, r.status, r.firm_id,
             i.status, i.status_at, i.status_reason,
             pay.recorded_at, pay.consumed_at,
             sep.problem, sep.noticed_at, sep.detail,
             sep.resolved_by, sep.resolved_at, sep.resolution,
             (sep.resolved_at is not null),
             jsonb_build_object(
               'note', r.note,
               'intent_id', e.intent_id,
               'stripe_session_id', e.session_id,
               'stripe_event_id', sep.event_id,
               'event_type', e.type,
               'livemode', e.livemode,
               'payment_status', e.payment_status)
        from clara.stripe_event_problems sep
        join clara.stripe_events e on e.event_id = sep.event_id
        left join clara.firm_registration_requests r on r.id = e.registration_id
        left join clara.checkout_intents i on i.id = e.intent_id
        left join clara.firm_registration_payments pay on pay.registration_id = e.registration_id
       where v_all or sep.resolved_at is null
    ) q
   where (p_kind is null or q.case_kind = p_kind)
     and (p_id is null or q.case_id = p_id)
   order by q.occurred_at desc, q.case_id desc;
end $$;

revoke all on function clara._operator_support_cases(boolean, text, uuid) from public;

comment on function clara._operator_support_cases(boolean, text, uuid) is
  '#615: the ONE definition of an operator support case -- open/settled registrations with no '
  'payment, registration payments, and Stripe event problems -- with the affected entity, the '
  'checkout intent''s current state and the decision receipt on every row. Granted to nobody: '
  'reached only from clara.list_operator_support_queue and clara.get_operator_support_case, so the '
  'queue and the detail door cannot disagree about what a case is. Reads NO firm books.';

-- =====================================================================================
-- §2  THE QUEUE. Authority is the approve_firm_registration predicate, byte-for-byte.
-- =====================================================================================
create function clara.list_operator_support_queue(
  p_include_settled boolean default false
) returns table(
  case_kind            text,
  case_id              uuid,
  occurred_at          timestamptz,
  registration_id      uuid,
  applicant            uuid,
  firm_name            text,
  request_status       text,
  firm_id              uuid,
  intent_status        text,
  intent_status_at     timestamptz,
  intent_status_reason text,
  payment_recorded_at  timestamptz,
  payment_consumed_at  timestamptz,
  problem_kind         text,
  problem_noticed_at   timestamptz,
  problem_detail       jsonb,
  decided_by           uuid,
  decided_at           timestamptz,
  decided_reason       text,
  settled              boolean
)
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
begin
  perform clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04', detail = '{"reason":"not_operator_firm"}';
  end if;

  return query
  select c.case_kind, c.case_id, c.occurred_at, c.registration_id, c.applicant, c.firm_name,
         c.request_status, c.firm_id, c.intent_status, c.intent_status_at, c.intent_status_reason,
         c.payment_recorded_at, c.payment_consumed_at, c.problem_kind, c.problem_noticed_at,
         c.problem_detail, c.decided_by, c.decided_at, c.decided_reason, c.settled
    from clara._operator_support_cases(coalesce(p_include_settled, false), null, null) c;
end $$;

revoke all on function clara.list_operator_support_queue(boolean) from public;
grant execute on function clara.list_operator_support_queue(boolean) to clara_authenticated;

comment on function clara.list_operator_support_queue(boolean) is
  '#615: the operator support queue -- one row per support case across three arms (an undecided '
  'registration with no payment, an unconsumed registration payment, an open Stripe event '
  'problem), newest first by (occurred_at desc, case_id desc). p_include_settled widens each arm '
  'to its decided/consumed/resolved rows, which carry decided_by/decided_at/decided_reason as the '
  'support receipt. OWNER of the OPERATOR firm only -- clara.approve_firm_registration''s own '
  'predicate, re-derived at call time. Refuses CLR04 (_human_ctx: no authenticated actor / no '
  'active membership / insufficient role) and CLR04 detail.reason not_operator_firm. Reads NO '
  'firm books: apps/web/app/(firm)/operator is its only caller.';

-- =====================================================================================
-- §3  THE CASE. NO EXISTENCE ORACLE: an id that names nothing, a kind outside the closed three
-- and a (kind, id) pair that does not resolve are ONE refusal, byte-identical, with one
-- detail.reason. `clara.get_activity_event` (0181) takes the same posture for the same reason: a
-- detail door is reached from a deep link that may carry any pair at all, and answering "that
-- exists but is not yours" about an estate-wide surface would be an inventory of the estate.
--
-- It always reads the SETTLED set: opening a resolved problem or a decided registration to READ
-- its receipt is exactly what an operator does after acting, and a detail door that refused a case
-- the moment it was handled would make the receipt unreachable.
-- =====================================================================================
create function clara.get_operator_support_case(
  p_kind text,
  p_id   uuid
) returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  v_case jsonb;
begin
  perform clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode = 'CLR04', detail = '{"reason":"not_operator_firm"}';
  end if;

  -- A NULL kind or a NULL id NEVER reaches the shared body, and that is a wall rather than a
  -- tidiness: in `clara._operator_support_cases` a NULL argument means "do not filter on this
  -- axis" (which is what the queue needs), so a caller passing `p_kind => null` with a real id
  -- would be handed whichever arm happens to own that id — an existence oracle over the whole
  -- admission estate, reachable from a hand-edited deep link. Caught by
  -- packages/db/tests/operator-support.test.mjs os.06 before this file was merged.
  --
  -- `to_jsonb(c)` over the FROM-clause alias rather than over a plpgsql RECORD variable: the row
  -- type is known at parse time here, so the projection is checked when this body is created
  -- instead of on the first call that happens to find a row.
  if p_kind is not null and p_id is not null then
    select (to_jsonb(c) - 'extra') || coalesce(c.extra, '{}'::jsonb)
      into v_case
      from clara._operator_support_cases(true, p_kind, p_id) c
     limit 1;
  end if;

  -- ONE raise site, so every not-found answer is byte-identical by construction rather than by
  -- three copies of the same sentence agreeing today.
  if v_case is null then
    raise exception 'support case not found' using errcode = 'CLR11',
      detail = '{"reason":"support_case_not_found"}';
  end if;

  return v_case;
end $$;

revoke all on function clara.get_operator_support_case(text, uuid) from public;
grant execute on function clara.get_operator_support_case(text, uuid) to clara_authenticated;

comment on function clara.get_operator_support_case(text, uuid) is
  '#615: ONE operator support case, addressed by (kind, id) -- every field '
  'clara.list_operator_support_queue returns for that arm, plus the arm''s own detail (the '
  'registration note, the checkout intent id, the Stripe session/event ids, the event type and '
  'its redacted payment status). OWNER of the OPERATOR firm only, the same predicate the queue '
  'carries. NO existence oracle: an unknown id, a kind outside registration|payment|problem and a '
  'mismatched pair all answer CLR11 detail.reason support_case_not_found, byte-identical. Refuses '
  'CLR04 / CLR04 detail.reason not_operator_firm above that.';

-- =====================================================================================
-- §4  THE COMMENT RECUT (no body moves). 0186 §C wrote "no web lane calls this door at all" onto
-- clara.get_admission_capacity, which was true when it was written and is not true after #615:
-- the operator console's capacity panel is that door's first web caller. The door's own body,
-- posture, predicate and grants are untouched -- only the sentence describing who reads it.
-- =====================================================================================
comment on function clara.get_admission_capacity() is
  '#628 (review S4), comment recut by #615: {max_firms, firms_count, full} for the OPERATOR '
  'FIRM''s owner only -- the same predicate clara.set_admission_capacity carries, re-derived at '
  'call time. firms_count is business-confidential, so an applicant gets the boolean capacity_full '
  'on clara.get_own_checkout_progress instead. Its ONE web lane is the operator support console '
  '(apps/web/app/(firm)/operator, #615); no applicant-facing surface may call it, and '
  'apps/web/lib/registration/checkout-doors.test.ts holds that property over the applicant lanes. '
  'Refuses CLR04 (_human_ctx: no authenticated actor / no active membership / insufficient role) '
  'and CLR04 detail.reason not_operator_firm.';

reset role;

-- =====================================================================================
-- §5  FAIL-CLOSED TAIL. Re-reads the LIVE catalog; raises on any finding rather than trusting the
-- statements above to have done what they say.
-- =====================================================================================
do $tail$
declare
  v_sig text;
  v_bad text;
  v_n integer;
  v_strip text;
  v_frag constant text := $q$exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator)$q$;
  v_frag_norm constant text := regexp_replace(lower(v_frag), '\s+', '', 'g');
  v_rank_frag constant text := $q$clara.role_rank('owner'$q$;
  v_rank_frag_norm constant text := regexp_replace(lower(v_rank_frag), '\s+', '', 'g');
  v_rank_count integer;
  v_books text[] := array['clara.clients', 'clara.documents', 'clara.journal_entries',
                          'clara.journal_lines', 'clara.accounting_work', 'clara.operation_receipts',
                          'clara.agent_receipts', 'clara.wiki_pages', 'clara.client_facts',
                          'clara.domain_events'];
  v_relation text;
begin
  -- (1) All three names resolve at their EXACT signatures -- never a bare-name lookup, which a
  --     same-named overload would satisfy while the callers below bound to something else.
  foreach v_sig in array array['clara._operator_support_cases(boolean,text,uuid)',
                               'clara.list_operator_support_queue(boolean)',
                               'clara.get_operator_support_case(text,uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#615 0188 tail: % is absent', v_sig using errcode = 'CLR10';
    end if;
    -- (2) Posture: clara_fn_owner-owned SECURITY DEFINER, both proconfig pins present.
    -- Whitespace-insensitive, because PostgreSQL NORMALIZES a GUC list when it stores it: the
    -- authored `set search_path = clara, pg_temp` comes back as `search_path=clara, pg_temp`
    -- regardless of how it was spelled (measured against the 1,081 clara functions already on this
    -- chain), so a literal comparison would be asserting the catalog's formatting, not the pin.
    select case when not p.prosecdef then 'not SECURITY DEFINER'
                when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
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
      raise exception '#615 0188 tail: % is %', v_sig, v_bad using errcode = 'CLR10';
    end if;
    -- (3) PUBLIC holds nothing on any of the three.
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception '#615 0188 tail: PUBLIC still holds EXECUTE on %', v_sig using errcode = 'CLR10';
    end if;
    -- (4) No books relation is named, and no body builds dynamic SQL -- the two halves of "this
    --     surface cannot reach a firm's ledger" that a catalog can state at all. The behavioural
    --     half is packages/db/tests/operator-support.test.mjs os.11.
    select regexp_replace(
             regexp_replace(
               regexp_replace(lower(p.prosrc), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
             '\s+', '', 'g')
      into v_strip from pg_proc p where p.oid = v_sig::regprocedure;
    foreach v_relation in array v_books loop
      if position(v_relation in v_strip) > 0 then
        raise exception '#615 0188 tail: % names %, which is a firm''s books', v_sig, v_relation
          using errcode = 'CLR10';
      end if;
    end loop;
    if position('execute' in v_strip) > 0 then
      raise exception '#615 0188 tail: % builds dynamic SQL', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) The two DOORS are clara_authenticated-only; the shared body is granted to NOBODY.
  foreach v_sig in array array['clara.list_operator_support_queue(boolean)',
                               'clara.get_operator_support_case(text,uuid)'] loop
    if not has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute') then
      raise exception '#615 0188 tail: clara_authenticated cannot execute %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_roles r
   where r.rolname like 'clara\_%' and r.rolname <> 'clara_fn_owner'
     and has_function_privilege(r.rolname, 'clara._operator_support_cases(boolean,text,uuid)', 'execute');
  if v_bad is not null then
    raise exception '#615 0188 tail: the shared body is reachable by %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_roles r
   where r.rolname like 'clara\_%'
     and r.rolname not in ('clara_fn_owner', 'clara_authenticated')
     and (has_function_privilege(r.rolname, 'clara.list_operator_support_queue(boolean)', 'execute')
          or has_function_privilege(r.rolname, 'clara.get_operator_support_case(text,uuid)', 'execute'));
  if v_bad is not null then
    raise exception '#615 0188 tail: a non-human role reaches a support door: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (6) The BYTE-COPIED authority fragment is in both doors, and the owner-rank floor occurs
  --     EXACTLY once in each (0145 §K (8b)'s own round-3 correction: a presence-only check stays
  --     green while a second, decorative occurrence masks a downgrade of the real one).
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(p.prosrc), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
           '\s+', '', 'g')
    into v_strip from pg_proc p where p.oid = 'clara.approve_firm_registration(uuid,text)'::regprocedure;
  if position(v_frag_norm in v_strip) = 0 then
    raise exception '#615 0188 tail: the REFERENCE body (approve_firm_registration) no longer '
      'carries the shared operator-authority fragment -- this file copied a fragment that moved'
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['clara.list_operator_support_queue(boolean)',
                               'clara.get_operator_support_case(text,uuid)'] loop
    select regexp_replace(
             regexp_replace(
               regexp_replace(lower(p.prosrc), '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g'),
             '\s+', '', 'g')
      into v_strip from pg_proc p where p.oid = v_sig::regprocedure;
    if position(v_frag_norm in v_strip) = 0 then
      raise exception '#615 0188 tail: % does not carry the shared operator-authority fragment', v_sig
        using errcode = 'CLR10';
    end if;
    v_rank_count := (length(v_strip) - length(replace(v_strip, v_rank_frag_norm, '')))
                    / length(v_rank_frag_norm);
    if v_rank_count <> 1 then
      raise exception '#615 0188 tail: %''s owner-rank floor occurs % time(s), expected exactly 1',
        v_sig, v_rank_count using errcode = 'CLR10';
    end if;
  end loop;

  -- (7) NO TABLE ACL MOVED. Every relation this file reads carries the grant posture it had
  --     before: the five admission relations have NO table ACL at all (fn-fronted, forced RLS),
  --     and clara.firms keeps whatever it had -- this file issues no grant or revoke on any
  --     relation, and asserts that rather than claiming it.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.oid in ('clara.firm_registration_requests'::regclass,
                   'clara.firm_registration_payments'::regclass,
                   'clara.stripe_event_problems'::regclass,
                   'clara.stripe_events'::regclass,
                   'clara.checkout_intents'::regclass)
     and c.relacl is not null;
  if v_bad is not null then
    raise exception '#615 0188 tail: a fn-fronted admission relation gained a table ACL: %', v_bad
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n
    from pg_class c
   where c.oid in ('clara.firm_registration_requests'::regclass,
                   'clara.firm_registration_payments'::regclass,
                   'clara.stripe_event_problems'::regclass,
                   'clara.stripe_events'::regclass,
                   'clara.checkout_intents'::regclass)
     and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 5 then
    raise exception '#615 0188 tail: % of 5 admission relations still force row level security', v_n
      using errcode = 'CLR10';
  end if;

  -- (8) The recut comment no longer claims the capacity door has no web lane, and the DOOR ITSELF
  --     is untouched -- same signature, same posture, same grants.
  if position('no web lane calls this door' in
              coalesce(obj_description('clara.get_admission_capacity()'::regprocedure, 'pg_proc'), '')) > 0 then
    raise exception '#615 0188 tail: get_admission_capacity''s comment still claims it has no web lane'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_proc p
     where p.oid = 'clara.get_admission_capacity()'::regprocedure
       and p.prosecdef
       and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
       and has_function_privilege('clara_authenticated', p.oid, 'execute')
       and not has_function_privilege('public', p.oid, 'execute')
  ) then
    raise exception '#615 0188 tail: clara.get_admission_capacity moved -- this file only recuts its comment'
      using errcode = 'CLR10';
  end if;

  raise notice '#615 0188 tail: OK -- clara._operator_support_cases (the ONE query, granted to '
    'nobody), clara.list_operator_support_queue and clara.get_operator_support_case are '
    'clara_fn_owner-owned SECURITY DEFINERs with search_path and plan_cache_mode pinned, '
    'PUBLIC-revoked and clara_authenticated-ONLY (no agent, runtime, wake or webhook role reaches '
    'either door); both doors carry clara.approve_firm_registration''s operator-authority fragment '
    'byte-for-byte with the owner-rank floor stated exactly once; neither body names a books '
    'relation or builds dynamic SQL; the five fn-fronted admission relations still carry NO table '
    'ACL and still force row level security; and clara.get_admission_capacity is byte-untouched '
    'apart from a comment that no longer claims it has no web lane.';
end $tail$;
